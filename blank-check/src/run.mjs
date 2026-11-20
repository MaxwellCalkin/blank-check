#!/usr/bin/env node
// Run agents in the simulated office and record what they do.
//
//   node src/run.mjs --models sonnet,haiku --cells i0p0-payments,i1p1-payments --n 5
//
// The agent is Claude Code in print mode with every built-in tool removed and
// only the simulated office attached. Before a run is allowed to proceed, the
// tool list the agent actually received is checked against the office's own
// list; anything else and the run is killed.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { SYSTEM_PROMPT, mandate, parseCell, cellId, allCells } from './conditions.mjs';
import { toolSchemas } from './office/tools.mjs';
import { DEFAULT_MAX_CALLS } from './office/office.mjs';
import { score } from './score.mjs';
import { ROOT, modelUsed, cleanTranscriptMessage } from './runs.mjs';

const SERVER = fileURLToPath(new URL('./office/server.mjs', import.meta.url));
const SERVER_NAME = 'office';
const EXPECTED_TOOLS = toolSchemas().map((t) => `mcp__${SERVER_NAME}__${t.name}`).sort();
const INIT_KEYS = ['tools', 'mcp_servers', 'model', 'permissionMode', 'claude_code_version', 'agents', 'skills', 'slash_commands'];
const AUTH_FAILURE = /failed to authenticate|not logged in|invalid api key|please run \/login|oauth/i;

function parseArgs(argv) {
  const opts = {
    models: ['sonnet'],
    cells: ['i0p0-payments', 'i1p1-payments'],
    n: 1,
    batch: new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19),
    concurrency: 2,
    maxCalls: DEFAULT_MAX_CALLS,
    timeoutMin: 25,
    claude: process.env.BC_CLAUDE || 'claude',
    effort: null,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--models') opts.models = value().split(',');
    else if (a === '--cells') opts.cells = value().split(',');
    else if (a === '--n') opts.n = Number(value());
    else if (a === '--batch') opts.batch = value();
    else if (a === '--concurrency') opts.concurrency = Number(value());
    else if (a === '--max-calls') opts.maxCalls = Number(value());
    else if (a === '--timeout-min') opts.timeoutMin = Number(value());
    else if (a === '--claude') opts.claude = value();
    else if (a === '--effort') opts.effort = value();
    else if (a === '--dry-run') opts.dryRun = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (opts.cells.length === 1 && opts.cells[0] === 'all') opts.cells = allCells().map(cellId);
  opts.cells.forEach(parseCell);
  return opts;
}

// Returns a description of what is wrong, or null if the agent has exactly the office tools.
export function isolationProblem(init) {
  const tools = [...(init.tools ?? [])].sort();
  const servers = (init.mcp_servers ?? []).map((s) => s.name);
  const extra = tools.filter((t) => !EXPECTED_TOOLS.includes(t));
  const missing = EXPECTED_TOOLS.filter((t) => !tools.includes(t));
  if (extra.length) return `agent has tools outside the simulated office: ${extra.join(', ')}`;
  if (servers.some((s) => s !== SERVER_NAME)) return `agent is connected to other servers: ${servers.join(', ')}`;
  if (missing.length) return `simulated office tools are missing: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`;
  return null;
}

// Keep machine-specific paths out of stored transcripts.
function makeScrubber() {
  const home = os.homedir();
  const variants = [home.replaceAll('\\', '\\\\\\\\'), home.replaceAll('\\', '\\\\'), home, home.replaceAll('\\', '/'), home.replace(/[:\\/]/g, '-')];
  return (text) => variants.reduce((t, v) => t.replaceAll(v, '~'), text);
}

function runOne(job, opts, batchDir, scrub) {
  const { model, cell, k } = job;
  const id = `${model}__${cellId(cell)}__${String(k).padStart(2, '0')}`;
  const dir = path.join(batchDir, id);
  const metaPath = path.join(dir, 'meta.json');
  if (fs.existsSync(metaPath) && JSON.parse(fs.readFileSync(metaPath, 'utf8')).status === 'ok') {
    return Promise.resolve({ id, status: 'ok', skipped: true });
  }
  fs.rmSync(dir, { recursive: true, force: true });
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'blank-check-cwd-'));
  fs.mkdirSync(dir, { recursive: true });

  // The office writes to a file only this attempt knows, so a process left over
  // from an interrupted attempt cannot write into this one's ledger.
  const ledgerPath = path.join(dir, 'ledger.jsonl');
  const liveLedger = path.join(dir, `ledger.${crypto.randomBytes(4).toString('hex')}.partial`);
  fs.writeFileSync(liveLedger, '');
  const mcpPath = path.join(cwd, 'mcp.json');
  fs.writeFileSync(
    mcpPath,
    JSON.stringify({ mcpServers: { [SERVER_NAME]: { command: process.execPath, args: [SERVER], env: { BC_LEDGER: liveLedger, BC_MAX_CALLS: String(opts.maxCalls) } } } }),
  );

  const prompt = mandate(cell);
  const args = [
    '-p',
    '--model', model,
    '--system-prompt', SYSTEM_PROMPT,
    '--mcp-config', mcpPath,
    '--strict-mcp-config',
    '--tools', '',
    '--allowedTools', `mcp__${SERVER_NAME}`,
    '--permission-mode', 'dontAsk',
    '--permission-prompts', 'none',
    '--setting-sources', '',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--output-format', 'stream-json',
    '--verbose',
  ];
  if (opts.effort) args.push('--effort', opts.effort);

  return new Promise((resolve) => {
    const started = new Date();
    const child = spawn(opts.claude, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const transcript = fs.createWriteStream(path.join(dir, 'transcript.jsonl'));
    const texts = [];
    let init = null;
    let result = null;
    let problem = null;
    let timedOut = false;
    let stderr = '';

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, opts.timeoutMin * 60_000);

    child.on('error', (err) => {
      problem = `could not start ${opts.claude}: ${err.message}`;
    });
    child.stderr.on('data', (d) => (stderr += d));
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);

    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let m;
      try {
        m = JSON.parse(line);
      } catch {
        return;
      }
      if (m.type === 'system' && m.subtype === 'init') {
        init = Object.fromEntries(INIT_KEYS.filter((key) => key in m).map((key) => [key, m[key]]));
        problem = isolationProblem(m);
        if (problem) child.kill();
        transcript.write(JSON.stringify({ type: 'system', subtype: 'init', ...init }) + '\n');
        return;
      }
      if (m.type === 'assistant') {
        for (const c of m.message?.content ?? []) {
          if (c.type === 'text') texts.push(c.text);
          if (c.type === 'thinking' && c.thinking) texts.push(c.thinking);
        }
      }
      if (m.type === 'result') result = m;
      const kept = cleanTranscriptMessage(m);
      if (kept) transcript.write(scrub(JSON.stringify(kept)) + '\n');
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      transcript.end();
      fs.rmSync(cwd, { recursive: true, force: true });

      const report = typeof result?.result === 'string' ? result.result : '';
      let status = 'ok';
      if (problem) status = init ? 'invalid_isolation' : 'spawn_error';
      else if (timedOut) status = 'timeout';
      else if (!result) status = 'no_result';
      else if (result.is_error || (result.num_turns <= 1 && AUTH_FAILURE.test(report))) status = AUTH_FAILURE.test(report) ? 'auth_error' : 'error';

      fs.renameSync(liveLedger, ledgerPath);
      // An agent can copy its working directory into something it writes, so the
      // ledger gets the same path scrub as the transcript.
      fs.writeFileSync(ledgerPath, scrub(fs.readFileSync(ledgerPath, 'utf8')));
      const ledger = fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
      const meta = {
        id,
        batch: opts.batch,
        status,
        problem,
        model_requested: model,
        // What actually answered. A requested name can be silently mapped to another model.
        model: modelUsed(result) ?? init?.model ?? null,
        cell,
        cell_id: cellId(cell),
        k,
        started: started.toISOString(),
        duration_s: Math.round((Date.now() - started.getTime()) / 1000),
        exit_code: code,
        num_turns: result?.num_turns ?? null,
        claude_code_version: init?.claude_code_version ?? null,
        effort: opts.effort,
        max_calls: opts.maxCalls,
        system_prompt_sha256: crypto.createHash('sha256').update(SYSTEM_PROMPT).digest('hex').slice(0, 16),
        mandate: prompt,
        report,
        usage: result?.usage ?? null,
        stderr: scrub(stderr).slice(0, 2000) || undefined,
      };
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
      if (status === 'ok' || status === 'timeout') {
        fs.writeFileSync(path.join(dir, 'score.json'), JSON.stringify(score(ledger, { report, assistantText: texts.join('\n') }), null, 2) + '\n');
      }
      resolve({ id, status, problem, calls: ledger.length, seconds: meta.duration_s });
    });
  });
}

// Deterministic shuffle so that cells and models are interleaved in time.
export function shuffled(list, seed) {
  const out = [...list];
  let s = [...seed].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7) || 1;
  const next = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const jobs = [];
  for (const model of opts.models) for (const id of opts.cells) for (let k = 1; k <= opts.n; k++) jobs.push({ model, cell: parseCell(id), k });
  const queue = shuffled(jobs, opts.batch);

  if (opts.dryRun) {
    console.log(`${queue.length} runs planned: ${opts.models.length} model(s) x ${opts.cells.length} cell(s) x n=${opts.n}\n`);
    console.log(`--- system prompt ---\n${SYSTEM_PROMPT}\n`);
    for (const id of opts.cells) console.log(`--- mandate ${id} ---\n${mandate(parseCell(id))}\n`);
    return;
  }

  const batchDir = path.join(ROOT, 'runs', opts.batch);
  fs.mkdirSync(batchDir, { recursive: true });
  const scrub = makeScrubber();
  const counts = {};
  let abort = null;

  async function worker() {
    while (queue.length && !abort) {
      const job = queue.shift();
      const r = await runOne(job, opts, batchDir, scrub);
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      console.log(`${r.status.padEnd(18)} ${r.id}${r.skipped ? '  (already done)' : `  ${r.calls} calls, ${r.seconds}s`}${r.problem ? `  — ${r.problem}` : ''}`);
      if (r.status === 'auth_error') abort = 'Claude Code is not logged in. Run `claude auth login` in a terminal, then start this batch again; finished runs are kept.';
      if (r.status === 'invalid_isolation') abort = `Isolation check failed (${r.problem}). Nothing further was run.`;
      if (r.status === 'spawn_error') abort = r.problem;
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker));

  console.log(`\nbatch ${opts.batch}: ${Object.entries(counts).map(([s, c]) => `${c} ${s}`).join(', ')}`);
  if (abort) {
    console.error(`\nStopped early: ${abort}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
