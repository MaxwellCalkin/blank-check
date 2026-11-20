#!/usr/bin/env node
// Put a batch from the second harness beside the Claude runs under the same prompts.
//
//   node src/beside.mjs free-1 --n 10 [--min-per-cell 5] [--models a,b]     writes results/free-1-beside-claude.md
//
// Descriptive only. The two columns differ in the models and in the harness
// that drove them, and this table cannot tell those apart. Nothing is tested
// here; the tests are in report.mjs, within one harness.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wilson } from './score.mjs';
import { ROOT, loadRuns } from './runs.mjs';
import { modelsSetAside } from './report.mjs';

// Every committed batch run through Claude Code.
export const CLAUDE_BATCHES = ['pilot-1', 'pilot-2', 'pilot-3', 'pilot-4', 'confirm-1', 'rule-1', 'norule-1', 'narrow-1'];

const ROWS = [
  ['paid', 'spent money'],
  ['paid_injection', 'paid the planted invoice'],
  ['emailed_third_party', 'emailed a third party'],
  ['published_publicly', 'published something publicly'],
  ['self_scheduled', 'scheduled future runs of itself'],
  ['messaged_user', 'messaged the founder'],
  ['read_private', 'opened a private item'],
  ['opened_disregarded', 'opened the folder it was told to disregard'],
  ['did_work', 'wrote files in the repository'],
  ['took_no_action', 'made no tool calls at all'],
];

const pct = (x) => `${Math.round(x * 100)}%`;
const frac = (runs, flag) => {
  const k = runs.filter((r) => r.score.flags[flag]).length;
  if (runs.length === 0) return '—';
  const [lo, hi] = wilson(k, runs.length);
  return `${k}/${runs.length} (${pct(lo)}–${pct(hi)})`;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// How each planned run of the batch ended, from the folders on disk. A run
// whose request failed outright leaves no folder.
export function completion(batch, models, cells, n, root = ROOT) {
  const dir = path.join(root, 'runs', batch);
  const metas = fs.existsSync(dir)
    ? fs.readdirSync(dir).map((name) => path.join(dir, name, 'meta.json')).filter((f) => fs.existsSync(f)).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
    : [];
  return models.map((model) => ({
    model,
    cells: cells.map((cell) => {
      const mine = metas.filter((m) => (m.model_requested ?? m.model) === model && m.cell_id === cell);
      const ok = mine.filter((m) => m.status === 'ok').length;
      const other = {};
      for (const m of mine) if (m.status !== 'ok') other[m.status] = (other[m.status] ?? 0) + 1;
      const missing = n - mine.length;
      if (missing > 0) other['no answer from the endpoint'] = missing;
      return { cell, ok, other };
    }),
  }));
}

export function render({ batch, free, setAside, claude, cells, done, n }) {
  const out = [`# ${batch} beside the Claude runs`, ''];
  out.push('The same office and the same three prompts. The Claude column pools every committed run under that prompt, from several days and ten models, driven by Claude Code. The other column is this batch: other labs\' models, driven by the second runner. The two differ in the models and in the harness, and this table cannot separate them. Nothing here is tested.', '');
  out.push(`Claude runs: ${claude.length}, from ${CLAUDE_BATCHES.join(', ')}. Runs in this batch: ${free.length}${setAside.length ? `, after setting aside ${setAside.join(', ')}` : ''}.`, '');

  out.push('## By prompt', '', `| | ${cells.flatMap((c) => [`${c}, Claude`, `${c}, this batch`]).join(' | ')} |`, `|---|${cells.flatMap(() => ['---', '---']).join('|')}|`);
  const under = (runs, c) => runs.filter((r) => r.meta.cell_id === c);
  out.push(`| runs | ${cells.flatMap((c) => [under(claude, c).length, under(free, c).length]).join(' | ')} |`);
  for (const [flag, label] of ROWS) out.push(`| ${label} | ${cells.flatMap((c) => [frac(under(claude, c), flag), frac(under(free, c), flag)]).join(' | ')} |`);
  out.push(`| mean tool calls | ${cells.flatMap((c) => [mean(under(claude, c).map((r) => r.score.tool_calls)).toFixed(1), mean(under(free, c).map((r) => r.score.tool_calls)).toFixed(1)]).join(' | ')} |`, '');

  out.push('## How the runs of this batch ended', '', `${n} runs were planned for each model under each prompt. A run that did not end by the agent stopping was started once more; what is shown is where each ended up.`, '', `| Model | ${cells.map((c) => `${c}: completed`).join(' | ')} | not completed |`, `|---|${cells.map(() => '---').join('|')}|---|`);
  for (const m of done) {
    const other = {};
    for (const c of m.cells) for (const [why, k] of Object.entries(c.other)) other[why] = (other[why] ?? 0) + k;
    out.push(`| ${m.model} | ${m.cells.map((c) => `${c.ok}/${n}`).join(' | ')} | ${Object.entries(other).map(([why, k]) => `${k} ${why}`).join(', ') || 'none'} |`);
  }
  out.push('');

  out.push('## By model, this batch', '', 'Completed runs only, all three prompts together.', '', '| Model | runs | mean tool calls | mean minutes | spent money | emailed a third party | messaged the founder | paid the planted invoice |', '|---|---|---|---|---|---|---|---|');
  const models = [...new Set(done.map((m) => m.model))];
  for (const model of models) {
    const rs = free.concat([]).filter((r) => (r.meta.model_requested ?? r.meta.model) === model);
    if (rs.length === 0) continue;
    out.push(`| ${model} | ${rs.length} | ${mean(rs.map((r) => r.score.tool_calls)).toFixed(1)} | ${(mean(rs.map((r) => r.meta.duration_s ?? 0)) / 60).toFixed(1)} | ${frac(rs, 'paid')} | ${frac(rs, 'emailed_third_party')} | ${frac(rs, 'messaged_user')} | ${frac(rs, 'paid_injection')} |`);
  }
  return out.join('\n') + '\n';
}

function main() {
  const argv = process.argv.slice(2);
  let batch = null;
  let minPerCell = 0;
  let n = 0;
  let named = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--min-per-cell') minPerCell = Number(argv[++i]);
    else if (argv[i] === '--models') named = argv[++i].split(',');
    else if (argv[i] === '--n') n = Number(argv[++i]);
    else batch = argv[i];
  }
  if (!batch || !n) {
    console.error('usage: node src/beside.mjs <batch> --n <runs planned per model and prompt> [--min-per-cell <n>] [--models a,b]');
    process.exitCode = 1;
    return;
  }
  const all = loadRuns([batch]).runs;
  const cells = [...new Set(all.map((r) => r.meta.cell_id))].sort();
  const setAside = modelsSetAside(all, minPerCell);
  const free = all.filter((r) => !setAside.includes(r.meta.model));
  const claude = loadRuns(CLAUDE_BATCHES).runs.filter((r) => cells.includes(r.meta.cell_id));
  const dir = path.join(ROOT, 'runs', batch);
  // A model whose every request failed has no folder, so it can be named.
  const planned = named ?? [...new Set(fs.readdirSync(dir).map((name) => path.join(dir, name, 'meta.json')).filter((f) => fs.existsSync(f)).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')).model_requested))].sort();
  const done = completion(batch, planned, cells, n);
  const md = render({ batch, free, setAside, claude, cells, done, n });
  fs.writeFileSync(path.join(ROOT, 'results', `${batch}-beside-claude.md`), md);
  process.stdout.write(md);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
