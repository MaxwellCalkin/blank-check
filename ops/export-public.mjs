#!/usr/bin/env node
// Build the copy of this repository that could be made public.
//
//   node ops/export-public.mjs            writes ./public-copy and ops/export-report.md
//
// It publishes nothing, creates no repository and makes no commit. It only
// writes a folder that git ignores, and a report of what it found there.
//
// Since 2026-11-20 public-copy/ also holds the git folder of the public
// repository, github.com/MaxwellCalkin/blank-check. This script leaves that
// folder in place and never reads or changes it, so after a rebuild
// `git status` inside public-copy/ shows what a public update would change.
// Committing and pushing there is a separate step, taken only by the
// session the founder talks to. Since 2026-11-20 that session has the
// founder's standing yes to do it without asking each time, and it does so
// only after this script exits clean.
//
// What the copy is:
//   - the files committed at HEAD, and none of the history. The history holds
//     work the founder deleted, and one ledger line with a path from this
//     computer (commit 67f4ce4).
//   - with the replacements listed in ops/export-redactions.json applied. In
//     three runs an agent addressed email to real organisations, twice to a
//     real researcher by name. Nothing was sent, since the office is
//     simulated, but the names do not belong in a public record.
//   - with this computer's home folder replaced wherever it appears.
//   - without ops/export-redactions.json, which names the people removed.
//
// After writing the copy it searches every file in it for the things that
// must not be there, runs the tests inside it, and rebuilds the result tables
// inside it to check they come out the same.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = path.join(REPO, 'public-copy');
const REDACTIONS = 'ops/export-redactions.json';
const LEFT_OUT = [REDACTIONS];
const REPORTS = [
  ['pilot', ['pilot-1', 'pilot-2', 'pilot-3', 'pilot-4']],
  ['confirm', ['confirm-1']],
  ['rule', ['rule-1']],
  ['norule', ['norule-1']],
  ['narrow', ['narrow-1']],
  // The plan for this batch sets a model aside if it completed too few runs.
  ['free', ['free-1'], ['--min-per-cell', '5']],
];

// Matches that were read and are not what the search is for. Each is allowed
// only under the folder named and only for the exact text given, and the
// report lists every one. The texts are spelled in two halves so that this
// file does not match its own searches.
const ALLOWED = [
  { label: 'a home folder path', under: 'blank-check/runs/free-1/moonshotai_kimi-k3.1-pro__i0p0-payments__04/', text: '/home' + '/user/', why: 'a made-up path in a unit test the agent wrote' },
  { label: 'something shaped like a live credential', under: 'blank-check/runs/free-1/moonshotai_kimi-k3.1-pro__i0p0-payments__04/', text: 'BEGIN PRIV' + 'ATE KEY', why: 'a key marker followed by the words "not-a-real-key", in a unit test the agent wrote to check that such markers are refused' },
];

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
  if (r.error) throw r.error;
  return r;
}
const git = (...args) => run('git', args, { cwd: REPO });

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    // The public repository's own git folder is not part of the copy.
    if (e.isDirectory() && e.name === '.git' && dir === OUT) continue;
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(OUT, p).split(path.sep).join('/');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Every spelling of this computer's home folder that could end up in a file.
function homeForms() {
  const home = os.homedir();
  const forms = new Set([home, home.split('\\').join('/'), home.split('\\').join('\\\\'), home.split('\\').join('\\\\\\\\'), home.replace(/[:\\/]/g, '-')]);
  return [...forms].filter((f) => f.length > 3).sort((a, b) => b.length - a.length);
}

function main() {
  const dirty = git('status', '--porcelain').stdout.trim();
  const head = git('rev-parse', '--short', 'HEAD').stdout.trim();

  // 1. A fresh folder holding exactly the files committed at HEAD.
  if (path.basename(OUT) !== 'public-copy' || !OUT.startsWith(REPO + path.sep)) throw new Error('refusing to write outside ./public-copy');
  // Empty the folder, leaving the folder itself (a shell sitting in it would
  // block its removal on Windows) and the public repository's git folder.
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of fs.readdirSync(OUT)) {
    if (name !== '.git') fs.rmSync(path.join(OUT, name), { recursive: true, force: true });
  }
  // Written out through a throwaway index, so the repository's own index is
  // untouched, and byte for byte as committed (no line-ending conversion).
  const index = path.join(os.tmpdir(), `public-copy-${process.pid}.index`);
  const exact = ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false'];
  const env = { ...process.env, GIT_INDEX_FILE: index };
  const read = run('git', [...exact, 'read-tree', 'HEAD'], { cwd: REPO, env });
  if (read.status !== 0) throw new Error(`git read-tree failed: ${read.stderr}`);
  const out = run('git', [...exact, 'checkout-index', '-a', '-f', `--prefix=${OUT.split(path.sep).join('/')}/`], { cwd: REPO, env });
  fs.rmSync(index, { force: true });
  if (out.status !== 0) throw new Error(`git checkout-index failed: ${out.stderr}`);
  for (const f of LEFT_OUT) fs.rmSync(path.join(OUT, f), { force: true });

  // 2. Replacements.
  const redactions = JSON.parse(fs.readFileSync(path.join(REPO, REDACTIONS), 'utf8'));
  const { rules } = redactions;
  const rulePaths = rules.flatMap((r) => r.paths);
  const changed = {};
  const note = (file, n) => { if (n) changed[file] = (changed[file] ?? 0) + n; };
  const files = walk(OUT);
  const homes = homeForms();
  for (const file of files) {
    const name = rel(file);
    const before = fs.readFileSync(file, 'utf8');
    let text = before;
    let n = 0;
    for (const rule of rules) {
      if (!rule.paths.some((p) => name.startsWith(p))) continue;
      for (const [pattern, to] of rule.replace) {
        text = text.replace(new RegExp(pattern, 'g'), () => { n++; return to; });
      }
    }
    for (const h of homes) text = text.replace(new RegExp(escapeRe(h), 'gi'), () => { n++; return '~'; });
    if (text !== before) fs.writeFileSync(file, text);
    note(name, n);
  }

  // 3. Search the copy for what must not be in it.
  const user = os.userInfo().username;
  const email = git('config', 'user.email').stdout.trim();
  const checks = [
    ['this computer\'s user name', new RegExp(escapeRe(user), 'i')],
    ['a home folder path', /[A-Za-z]:\\{1,4}Users\\{1,4}[A-Za-z0-9._-]+|\/(?:Users|home)\/[A-Za-z0-9._-]+\//],
    ['the git author email', email ? new RegExp(escapeRe(email), 'i') : null],
    ['an address at a real organisation that an agent wrote to', new RegExp(redactions.must_not_appear_anywhere.join('|'))],
    ['something shaped like a live credential', /sk-ant-[A-Za-z0-9_-]{20}|nvapi-[A-Za-z0-9_-]{20}|ghp_[A-Za-z0-9]{30}|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY/],
    // Spelled in two halves so that this file does not match its own search.
    ['the runner\'s account details', new RegExp('"rate_limit_' + 'event"|"request_' + 'id"')],
  ].filter(([, re]) => re);
  const namesInThoseRuns = new RegExp(redactions.must_not_appear_in_those_runs.join('|'));
  const namesElsewhere = new RegExp(redactions.counted_elsewhere.join('|'));
  const found = Object.fromEntries([...checks.map(([label]) => [label, []]), ['a removed name, in the runs it was removed from', []]]);
  const cited = [];
  const leftIn = [];
  for (const file of walk(OUT)) {
    const text = fs.readFileSync(file, 'utf8');
    const name = rel(file);
    for (const [label, re] of checks) {
      if (!re.test(text)) continue;
      const hits = [...new Set([...text.matchAll(new RegExp(re.source, re.flags.replace('g', '') + 'g'))].map((m) => m[0]))];
      const allowed = ALLOWED.filter((a) => a.label === label && name.startsWith(a.under));
      if (hits.every((h) => allowed.some((a) => a.text === h))) leftIn.push({ name, label, why: allowed.filter((a) => hits.includes(a.text)).map((a) => a.why).join('; ') });
      else found[label].push(name);
    }
    if (rulePaths.some((p) => name.startsWith(p))) {
      if (namesInThoseRuns.test(text)) found['a removed name, in the runs it was removed from'].push(name);
    } else if (name.endsWith('ledger.jsonl') && namesElsewhere.test(text)) cited.push(name);
  }

  // Email addressed outside the simulated world, from the ledgers themselves.
  const world = fs.readFileSync(path.join(OUT, 'blank-check/src/office/world.mjs'), 'utf8');
  const ADDRESS = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[a-z]{2,})/gi;
  const worldDomains = new Set([...world.matchAll(ADDRESS)].map((m) => m[1].toLowerCase()));
  const outside = {};
  let ledgers = 0;
  for (const file of walk(path.join(OUT, 'blank-check/runs')).filter((f) => f.endsWith('ledger.jsonl'))) {
    ledgers++;
    for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
      const e = JSON.parse(line);
      if (e.tool !== 'email_send' && e.tool !== 'email_draft') continue;
      const to = [].concat(e.args?.to ?? [], e.args?.cc ?? [], e.args?.bcc ?? []).join(',');
      for (const m of to.matchAll(ADDRESS)) if (!worldDomains.has(m[1].toLowerCase())) outside[m[1].toLowerCase()] = (outside[m[1].toLowerCase()] ?? 0) + 1;
    }
  }

  // 4. Does the copy still work, and do its tables still come out the same?
  const project = path.join(OUT, 'blank-check');
  const tests = run(process.execPath, ['--test', 'test/*.test.mjs'], { cwd: project, shell: false });
  const testLine = (tests.stdout.match(/^ℹ (?:tests|pass|fail) \d+$/gm) ?? []).join(', ').replaceAll('ℹ ', '');
  const tables = [];
  for (const [name, batches, extra = []] of REPORTS) {
    if (!batches.every((b) => fs.existsSync(path.join(project, 'runs', b)))) continue;
    const md = path.join(project, 'results', `${name}.md`);
    if (!fs.existsSync(md)) { tables.push(`${name}: no committed table to compare with`); continue; }
    const before = fs.readFileSync(md, 'utf8');
    const r = run(process.execPath, ['src/report.mjs', ...batches, '--name', name, ...extra], { cwd: project });
    const after = fs.readFileSync(md, 'utf8');
    tables.push(`${name}: ${r.status !== 0 ? 'report failed' : before === after ? 'identical' : 'DIFFERENT'}`);
  }

  // 5. Write down what happened.
  const total = walk(OUT);
  const bytes = total.reduce((s, f) => s + fs.statSync(f).size, 0);
  const lines = [
    '# Public copy: what the last export found',
    '',
    `Written by \`ops/export-public.mjs\` from commit \`${head}\`${dirty ? ' (the working tree had uncommitted changes, which are not in the copy)' : ''}. The copy is in \`public-copy/\`, which git ignores. This script publishes nothing.`,
    '',
    `- Files: ${total.length}, ${(bytes / 1e6).toFixed(0)} MB. No history.`,
    `- Left out: ${LEFT_OUT.map((f) => `\`${f}\``).join(', ')}.`,
    `- Replacements made: ${Object.values(changed).reduce((a, b) => a + b, 0)} in ${Object.keys(changed).length} files.`,
    ...Object.entries(changed).map(([f, n]) => `  - \`${f}\`: ${n}`),
    '',
    '## Searched for, in every file of the copy',
    '',
    '| Looking for | Files where found |',
    '|---|---|',
    ...Object.entries(found).map(([label, hits]) => `| ${label} | ${hits.length === 0 ? 'none' : hits.slice(0, 8).map((h) => `\`${h}\``).join(', ') + (hits.length > 8 ? ` and ${hits.length - 8} more` : '')} |`),
    '',
    ...(leftIn.length ? ['Matches that were read and left in, because they are not what the search is for:', '', ...leftIn.map((h) => `- \`${h.name}\`, matching "${h.label}": ${h.why}.`), ''] : []),
    `Email addressed outside the simulated world, read from ${ledgers} ledgers: ${Object.keys(outside).length === 0 ? 'none' : Object.entries(outside).map(([d, n]) => `${d} (${n})`).join(', ')}. Addresses ending in \`removed.invalid\` are the replacements.`,
    '',
    `Left in on purpose: the researchers whose names were removed from those runs are also named in ${cited.length} other runs, in reading lists, citations and plans that agents wrote into files. Those runs addressed nothing to them. Other well-known researchers are named in the same way and were not searched for.`,
    '',
    '## Does the copy still work',
    '',
    `- Tests run inside the copy: ${testLine || 'no summary line found'}${tests.status === 0 ? '' : ' — FAILED'}.`,
    `- Result tables rebuilt inside the copy against the committed ones: ${tables.join('; ') || 'none compared'}.`,
    '',
    '## Not checked by this script',
    '',
    '- Real people named in text that was never addressed to them. The search above covers email recipients and the names already known.',
    '',
    '## Decided by the founder on 2026-11-20',
    '',
    '- The operation\'s own page is in the public copy, with its log, its short quotes of the mandate and its record of plan usage.',
    '- The write-up keeps its sentence that the test prompt is modelled closely on a real one, and does not say whose.',
    '- Public commits carry the founder\'s GitHub name and GitHub\'s no-reply address. This script makes no commit.',
    '- The public copy may be kept current without asking each time. A rebuild is pushed only when every search above finds nothing, the tests pass and the tables are identical, and only by the session the founder talks to.',
    '',
  ];
  fs.writeFileSync(path.join(REPO, 'ops', 'export-report.md'), lines.join('\n'));
  // The copy carries the report of its own build, not the one committed
  // before it. Nothing in the report is copied from the files it searched
  // except their names.
  fs.writeFileSync(path.join(OUT, 'ops', 'export-report.md'), lines.join('\n'));
  process.stdout.write(lines.join('\n'));
  const bad = Object.values(found).some((h) => h.length > 0) || Object.keys(outside).some((d) => !d.endsWith('removed.invalid')) || tests.status !== 0 || tables.some((t) => !t.endsWith('identical'));
  if (bad) process.exitCode = 1;
}

main();
