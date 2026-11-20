#!/usr/bin/env node
// Run agents in the simulated office through a plain chat-completions API.
//
//   node src/run-api.mjs --provider nvidia --models mistralai/mistral-large-4-1t-a52b \
//        --cells i0p0-none,i0p0-payments --n 5 --batch free-1
//   node src/run-api.mjs --provider nvidia --models a,b,c --probe
//
// run.mjs drives Claude Code. This runner is for models reached over an
// OpenAI-style API. It keeps the conversation itself, gives the model the
// office's 29 tools as functions and nothing else, and calls the office inside
// this process. The system prompt, the mandate, the tool names and the cap on
// tool calls are the same as in run.mjs, and a finished run is stored in the
// same shape, so the scorer, the judge and the reports read it unchanged.
//
// It is a different harness from Claude Code. A difference between a model run
// here and a Claude model run there may come from the harness and not from the
// model, and the write-ups say so.
//
// Free endpoints only. The key is read from the environment or from
// .env.local at the top of the repository, which git ignores, and is never
// printed or stored. On OpenRouter a model is refused unless its name ends in
// ":free". If the provider refuses a request and goes on refusing it for about
// eleven minutes, the batch stops; finished runs are kept, and the same
// command picks up where it left off. A run that ended without the agent
// stopping is started once more by that command, and never a third time.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEM_PROMPT, mandate, parseCell, cellId } from './conditions.mjs';
import { toolSchemas } from './office/tools.mjs';
import { Office, DEFAULT_MAX_CALLS } from './office/office.mjs';
import { score } from './score.mjs';
import { ROOT } from './runs.mjs';
import { shuffled } from './run.mjs';

export const PROVIDERS = {
  // The free catalogue allows about 40 requests a minute for one key.
  nvidia: { base: 'https://integrate.api.nvidia.com/v1', keyName: 'NVIDIA_API_KEY', allows: () => true, perMinute: 36 },
  openrouter: { base: 'https://openrouter.ai/api/v1', keyName: 'OPENROUTER_API_KEY', allows: (model) => model.endsWith(':free'), perMinute: 18 },
};

// The agent sees the same tool names as it does through Claude Code.
const PREFIX = 'mcp__office__';
const TOOL_NAMES = new Set(toolSchemas().map((t) => t.name));
export const FUNCTIONS = toolSchemas().map((t) => ({ type: 'function', function: { name: PREFIX + t.name, description: t.description, parameters: t.inputSchema } }));

export class RateLimited extends Error {}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c) => (typeof c === 'string' ? c : c?.text ?? '')).join('');
  return '';
}

// One run: the conversation from the mandate to the agent's last message.
// `chat` takes the request body and returns the API's response; it is passed
// in so that the loop can be tested without a network.
export async function converse({ chat, model, cell, maxCalls = DEFAULT_MAX_CALLS, maxTurns = 150, maxTokens = null, deadline = Infinity }) {
  const office = new Office({ maxCalls });
  const transcript = [{ type: 'system', subtype: 'init', tools: FUNCTIONS.map((f) => f.function.name), model, harness: 'api-loop' }];
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: mandate(cell) },
  ];
  const usage = { input_tokens: 0, output_tokens: 0 };
  const texts = [];
  let answered = null;
  let report = '';
  let status = 'turn_limit';
  let turns = 0;

  while (turns < maxTurns) {
    if (Date.now() > deadline) { status = 'timeout'; break; }
    turns += 1;
    const response = await chat({ model, messages, tools: FUNCTIONS, tool_choice: 'auto', ...(maxTokens ? { max_tokens: maxTokens } : {}) });
    const choice = response?.choices?.[0];
    const message = choice?.message;
    if (!message) { status = 'error'; break; }
    answered = response.model ?? answered;
    usage.input_tokens += response.usage?.prompt_tokens ?? 0;
    usage.output_tokens += response.usage?.completion_tokens ?? 0;

    const text = textOf(message.content);
    const thinking = textOf(message.reasoning_content ?? message.reasoning ?? '');
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    const content = [];
    if (thinking) { content.push({ type: 'thinking', thinking }); texts.push(thinking); }
    if (text) { content.push({ type: 'text', text }); texts.push(text); }

    // What goes back to the model is its own message, as it sent it.
    messages.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });

    const results = [];
    for (const call of calls) {
      const name = String(call.function?.name ?? '');
      const bare = name.startsWith(PREFIX) ? name.slice(PREFIX.length) : name;
      let args;
      let out;
      try {
        args = JSON.parse(call.function?.arguments || '{}');
      } catch {
        args = undefined;
      }
      // Claude Code turns away a call to a tool that does not exist, or one whose
      // arguments do not parse, before it reaches the office. So does this.
      if (!TOOL_NAMES.has(bare)) out = { text: `Error: No such tool available: ${name}`, isError: true };
      else if (args === undefined || args === null || typeof args !== 'object' || Array.isArray(args)) out = { text: 'Error: the arguments were not a JSON object.', isError: true };
      else out = office.call(bare, args);
      content.push({ type: 'tool_use', id: call.id, name, input: args ?? call.function?.arguments ?? null });
      results.push({ type: 'tool_result', tool_use_id: call.id, content: out.text, is_error: out.isError });
      messages.push({ role: 'tool', tool_call_id: call.id, content: out.text });
    }
    transcript.push({ type: 'assistant', message: { role: 'assistant', model: response.model ?? model, content }, finish_reason: choice.finish_reason ?? null });
    if (results.length) transcript.push({ type: 'user', message: { role: 'user', content: results } });

    if (calls.length === 0) {
      report = text;
      // An answer that ran into the output limit before it called a tool or
      // finished is not the agent stopping. Nor is a first answer with no
      // words and no calls: that is the endpoint failing.
      status = choice.finish_reason === 'length' ? 'truncated' : turns === 1 && !text ? 'empty' : 'ok';
      break;
    }
  }

  transcript.push({
    type: 'result',
    subtype: status === 'ok' ? 'success' : status,
    is_error: status !== 'ok',
    num_turns: turns,
    result: report,
    usage,
    modelUsage: { [answered ?? model]: { inputTokens: usage.input_tokens, outputTokens: usage.output_tokens } },
  });
  return { status, report, ledger: office.ledger, transcript, turns, usage, answered: answered ?? model, assistantText: texts.join('\n') };
}

// --- talking to a provider ---------------------------------------------------

function readKey(keyName) {
  if (process.env[keyName]) return process.env[keyName];
  const file = path.join(ROOT, '..', '.env.local');
  if (!fs.existsSync(file)) return null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && m[1] === keyName) return m[2].replace(/^["']|["']$/g, '') || null;
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Interrupted extends Error {}

// Put a streamed answer back together into the shape of an unstreamed one.
// `onBytes` is called whenever anything arrives, so the caller can tell a slow
// answer from a dead connection.
export async function readStream(body, onBytes = () => {}) {
  const decoder = new TextDecoder();
  let buffer = '';
  let model = null;
  let usage = null;
  let finish = null;
  let done = false;
  let content = '';
  let reasoning = '';
  const calls = [];
  const byIndex = new Map();
  const byId = new Map();

  const slotFor = (tc) => {
    let slot = Number.isInteger(tc.index) ? byIndex.get(tc.index) : tc.id ? byId.get(tc.id) : calls.at(-1);
    if (!slot) {
      slot = { id: '', type: 'function', function: { name: '', arguments: '' } };
      calls.push(slot);
      if (Number.isInteger(tc.index)) byIndex.set(tc.index, slot);
    }
    if (tc.id && !slot.id) { slot.id = tc.id; byId.set(tc.id, slot); }
    return slot;
  };
  const take = (line) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (data === '[DONE]') { done = true; return; }
    let event;
    try { event = JSON.parse(data); } catch { return; }
    if (event.error) throw new Interrupted(`the stream reported an error: ${JSON.stringify(event.error).slice(0, 200)}`);
    model = event.model ?? model;
    usage = event.usage ?? usage;
    const choice = event.choices?.[0];
    if (!choice) return;
    finish = choice.finish_reason ?? finish;
    const delta = choice.delta ?? {};
    content += textOf(delta.content);
    reasoning += textOf(delta.reasoning_content ?? delta.reasoning ?? '');
    for (const tc of delta.tool_calls ?? []) {
      const slot = slotFor(tc);
      const name = tc.function?.name;
      // A name normally arrives once. Some endpoints repeat it with every piece.
      if (name && name !== slot.function.name) slot.function.name += name;
      const args = tc.function?.arguments;
      if (args !== undefined && args !== null) slot.function.arguments += typeof args === 'string' ? args : JSON.stringify(args);
    }
  };

  for await (const part of body) {
    onBytes();
    buffer += typeof part === 'string' ? part : decoder.decode(part, { stream: true });
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      take(buffer.slice(0, end).trim());
      buffer = buffer.slice(end + 1);
    }
  }
  take(buffer.trim());
  // A connection that closes part way through an answer must not pass for an
  // agent that stopped.
  if (!done && !finish) throw new Interrupted('the stream ended before the answer did');
  calls.forEach((c, i) => { if (!c.id) c.id = `call_${i + 1}`; });
  return {
    model,
    usage,
    choices: [{
      finish_reason: finish,
      message: { role: 'assistant', content: content || null, ...(reasoning ? { reasoning_content: reasoning } : {}), ...(calls.length ? { tool_calls: calls } : {}) },
    }],
  };
}

// Answers are streamed. A free endpoint can take minutes over one answer, and
// what shows that it is still working is that pieces keep arriving. A request
// is given up when nothing arrives for `silenceS`, and is then tried again. It
// is also given up after `requestTimeoutS` in all, which is long enough for a
// full-length answer from the slowest endpoint tried (about six tokens a
// second); that one is not tried again, because it would take as long again.
//
// A refusal (HTTP 429) is handled with more patience than a failure. A free
// endpoint refuses for minutes at a time when it is busy, which is not the
// same as a key that has used up its day. A refused request waits and is sent
// again up to `slowWaits.length` times, about eleven minutes in all, and while
// it waits the other runs of the same model hold their requests too.
export function makeChat({ base, key, stream = true, silenceS = 300, requestTimeoutS = 1800, perMinute = 0, windowMs = 60000, waits = [5, 20, 60, 120], slowWaits = [5, 20, 60, 120, 240, 240], fetchImpl = fetch, sleepImpl = sleep }) {
  // With `perMinute` set, requests from every run in the batch are spaced so
  // that no more than that many start in any minute.
  const started = [];
  const heldUntil = new Map();
  async function takeTurn(model) {
    const held = (heldUntil.get(model) ?? 0) - Date.now();
    if (held > 0) await sleepImpl(held);
    for (;;) {
      const now = Date.now();
      while (started.length && now - started[0] >= windowMs) started.shift();
      if (!perMinute || started.length < perMinute) { started.push(now); return; }
      await sleep(windowMs - (now - started[0]) + 5);
    }
  }
  // Kept so a batch can say how often the endpoint pushed back, and for which model.
  const stats = { requests: 0, told_to_slow_down: 0, cut_off_or_silent: 0, server_errors: 0 };
  const refused = {};
  async function chat(body) {
    let last = '';
    let failures = 0;
    let refusals = 0;
    for (;;) {
      await takeTurn(body?.model);
      stats.requests += 1;
      const control = new AbortController();
      let tooLong = false;
      const total = setTimeout(() => { tooLong = true; control.abort(new Interrupted(`no complete answer in ${requestTimeoutS}s`)); }, requestTimeoutS * 1000);
      let quiet;
      const heard = () => {
        clearTimeout(quiet);
        quiet = setTimeout(() => control.abort(new Interrupted(`nothing arrived for ${silenceS}s`)), silenceS * 1000);
      };
      let res;
      try {
        heard();
        res = await fetchImpl(`${base}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
          body: JSON.stringify(stream ? { ...body, stream: true, stream_options: { include_usage: true } } : body),
          signal: control.signal,
        });
        heard();
        if (res.ok) {
          const streamed = stream && String(res.headers.get('content-type') ?? '').includes('text/event-stream');
          return streamed ? await readStream(res.body, heard) : await res.json();
        }
      } catch (err) {
        const why = control.signal.reason instanceof Interrupted ? control.signal.reason : err;
        last = `network: ${why instanceof Interrupted ? why.message : why.name}`;
        stats.cut_off_or_silent += 1;
        if (tooLong || failures >= waits.length) throw new Error(last);
        await sleepImpl(waits[failures++] * 1000);
        continue;
      } finally {
        clearTimeout(total);
        clearTimeout(quiet);
      }
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      last = `HTTP ${res.status}: ${detail}`;
      const asked = Number(res.headers.get('retry-after'));
      const atLeast = Number.isFinite(asked) ? Math.min(asked, 600) : 0;
      if (res.status === 429) {
        stats.told_to_slow_down += 1;
        refused[body?.model] = (refused[body?.model] ?? 0) + 1;
        if (refusals >= slowWaits.length) throw new RateLimited(last);
        // The wait is taken in takeTurn, by this request and by the others of its model.
        const wait = Math.max(slowWaits[refusals++], atLeast) * 1000;
        heldUntil.set(body?.model, Math.max(heldUntil.get(body?.model) ?? 0, Date.now() + wait));
        continue;
      }
      if (res.status < 500) throw new Error(last);
      stats.server_errors += 1;
      if (failures >= waits.length) throw new Error(last);
      await sleepImpl(Math.max(waits[failures++], atLeast) * 1000);
    }
  }
  chat.stats = stats;
  chat.refused = refused;
  return chat;
}

// --- batches -----------------------------------------------------------------

function parseArgs(argv) {
  const opts = { provider: null, models: [], cells: ['i0p0-none', 'i0p0-payments'], n: 1, batch: null, concurrency: 1, perModel: 0, maxCalls: DEFAULT_MAX_CALLS, maxTokens: 8192, timeoutMin: 60, dryRun: false, probe: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === '--provider') opts.provider = value();
    else if (a === '--models') opts.models = value().split(',');
    else if (a === '--cells') opts.cells = value().split(',');
    else if (a === '--n') opts.n = Number(value());
    else if (a === '--batch') opts.batch = value();
    else if (a === '--concurrency') opts.concurrency = Number(value());
    else if (a === '--per-model') opts.perModel = Number(value());
    else if (a === '--max-calls') opts.maxCalls = Number(value());
    else if (a === '--timeout-min') opts.timeoutMin = Number(value());
    else if (a === '--max-tokens') opts.maxTokens = Number(value());
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--probe') opts.probe = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!PROVIDERS[opts.provider]) throw new Error(`--provider must be one of: ${Object.keys(PROVIDERS).join(', ')}`);
  if (opts.models.length === 0) throw new Error('--models needs at least one model');
  const refused = opts.models.filter((m) => !PROVIDERS[opts.provider].allows(m));
  if (refused.length) throw new Error(`Not a free endpoint on ${opts.provider}, refused: ${refused.join(', ')}`);
  opts.cells.forEach(parseCell);
  return opts;
}

export const safeName = (model) => model.replace(/[^A-Za-z0-9._-]+/g, '_');

// A run that did not end by the agent stopping is started once more and no
// more, however often the command is run. Returns what to do with a run given
// the meta.json it left, if any: skip it, or start it as attempt 1 or 2. A run
// stored before attempts were counted was a first attempt. A run stopped by
// the provider's rate limit leaves nothing behind and does not count.
export const MAX_ATTEMPTS = 2;
export function nextAttempt(before) {
  if (!before) return { attempt: 1 };
  if (before.status === 'ok') return { skip: 'already done' };
  const made = before.attempt ?? 1;
  return made >= MAX_ATTEMPTS ? { skip: 'not started again' } : { attempt: made + 1 };
}

export async function runOne(job, opts, chat, batchDir) {
  const { model, cell, k } = job;
  const id = `${safeName(model)}__${cellId(cell)}__${String(k).padStart(2, '0')}`;
  const dir = path.join(batchDir, id);
  const metaPath = path.join(dir, 'meta.json');
  const before = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : null;
  const { attempt, skip } = nextAttempt(before);
  if (skip) return { id, status: before.status, skipped: skip };
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const started = new Date();
  const seconds = () => Math.round((Date.now() - started.getTime()) / 1000);
  let run;
  let problem = null;
  try {
    run = await converse({ chat, model, cell, maxCalls: opts.maxCalls, maxTokens: opts.maxTokens, deadline: started.getTime() + opts.timeoutMin * 60000 });
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    if (err instanceof RateLimited) return { id, status: 'rate_limited', problem: err.message };
    // An endpoint error is an attempt, so what is left says so. Nothing of the run is kept.
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(metaPath, JSON.stringify({ id, batch: opts.batch, status: 'error', problem: err.message, model_requested: model, harness: 'api-loop', provider: opts.provider, cell, cell_id: cellId(cell), k, attempt, started: started.toISOString(), duration_s: seconds() }, null, 2) + '\n');
    return { id, status: 'error', problem: err.message, seconds: seconds() };
  }
  if (run.status !== 'ok') problem = run.status;
  fs.writeFileSync(path.join(dir, 'ledger.jsonl'), run.ledger.map((e) => JSON.stringify(e) + '\n').join(''));
  fs.writeFileSync(path.join(dir, 'transcript.jsonl'), run.transcript.map((m) => JSON.stringify(m) + '\n').join(''));
  const meta = {
    id,
    batch: opts.batch,
    status: run.status,
    problem,
    model_requested: model,
    model: run.answered,
    harness: 'api-loop',
    provider: opts.provider,
    cell,
    cell_id: cellId(cell),
    k,
    attempt,
    started: started.toISOString(),
    duration_s: seconds(),
    num_turns: run.turns,
    claude_code_version: null,
    max_calls: opts.maxCalls,
    max_tokens: opts.maxTokens,
    truncated_turns: run.transcript.filter((m) => m.finish_reason === 'length').length,
    system_prompt_sha256: crypto.createHash('sha256').update(SYSTEM_PROMPT).digest('hex').slice(0, 16),
    mandate: mandate(cell),
    report: run.report,
    usage: run.usage,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  if (run.status === 'ok') fs.writeFileSync(path.join(dir, 'score.json'), JSON.stringify(score(run.ledger, { report: run.report, assistantText: run.assistantText }), null, 2) + '\n');
  return { id, status: run.status, problem, calls: run.ledger.length, seconds: meta.duration_s };
}

// Does the model take the tools at all? One short request each.
async function probe(opts, chat) {
  for (const model of opts.models) {
    try {
      const res = await chat({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: 'Before anything else, list what is in the inbox.' },
        ],
        tools: FUNCTIONS,
        tool_choice: 'auto',
      });
      const m = res?.choices?.[0]?.message;
      const calls = (m?.tool_calls ?? []).map((c) => c.function?.name).join(', ');
      console.log(`${model}: ${calls ? `calls ${calls}` : `no tool call; said: ${textOf(m?.content).replace(/\s+/g, ' ').slice(0, 100)}`}  (${res?.usage?.prompt_tokens ?? '?'} prompt tokens)`);
    } catch (err) {
      console.log(`${model}: FAILED  ${err.message.slice(0, 200)}`);
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const provider = PROVIDERS[opts.provider];
  const jobs = [];
  for (const model of opts.models) for (const id of opts.cells) for (let k = 1; k <= opts.n; k++) jobs.push({ model, cell: parseCell(id), k });
  if (opts.dryRun) {
    console.log(`${jobs.length} runs planned on ${opts.provider}: ${opts.models.length} model(s) x ${opts.cells.length} cell(s) x n=${opts.n}`);
    return;
  }
  const key = readKey(provider.keyName);
  if (!key) throw new Error(`No key. Set ${provider.keyName} in the environment, or put a line ${provider.keyName}=… in .env.local at the top of the repository.`);
  const chat = makeChat({ base: provider.base, key, perMinute: provider.perMinute });
  if (opts.probe) return probe(opts, chat);
  if (!opts.batch) throw new Error('--batch needs a name');

  const queue = shuffled(jobs, opts.batch);
  const batchDir = path.join(ROOT, 'runs', opts.batch);
  fs.mkdirSync(batchDir, { recursive: true });
  const counts = {};
  let abort = null;
  async function worker(jobsLeft) {
    while (jobsLeft.length && !abort) {
      const r = await runOne(jobsLeft.shift(), opts, chat, batchDir);
      counts[r.status] = (counts[r.status] ?? 0) + 1;
      console.log(`${r.status.padEnd(14)} ${r.id}${r.skipped ? `  (${r.skipped})` : r.calls === undefined ? '' : `  ${r.calls} calls, ${r.seconds}s`}${r.problem ? `  — ${r.problem}` : ''}`);
      if (r.status === 'rate_limited') abort = 'The provider kept refusing requests. Finished runs are kept; run the same command again later.';
    }
  }
  // With --per-model each model has its own workers, so a slow endpoint holds
  // up only its own runs. The order within a model is still the shuffled one.
  const lines = opts.perModel ? opts.models.map((m) => queue.filter((j) => j.model === m)) : [queue];
  const width = Math.max(1, opts.perModel || opts.concurrency);
  await Promise.all(lines.flatMap((jobsLeft) => Array.from({ length: width }, () => worker(jobsLeft))));
  const byModel = Object.entries(chat.refused).map(([m, c]) => `${m} ${c}`).join(', ');
  console.log(`requests ${chat.stats.requests}; told to slow down ${chat.stats.told_to_slow_down}${byModel ? ` (${byModel})` : ''}; server errors ${chat.stats.server_errors}; cut off or silent ${chat.stats.cut_off_or_silent}`);
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
