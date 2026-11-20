#!/usr/bin/env node
// How many tokens does one run in the simulated office use, and what would the
// stored runs have cost at API list prices?
//
//   node ops/run-costs.mjs
//
// Every figure comes from the usage record the Claude Code CLI wrote at the end
// of each run (kept in meta.json and in the transcript's last message). The
// dollar column is the CLI's own estimate at Anthropic's list prices. Nothing
// was charged: the runs drew on a subscription.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RUNS = fileURLToPath(new URL('../blank-check/runs', import.meta.url));
const rows = [];
for (const batch of fs.readdirSync(RUNS).sort()) {
  if (batch.startsWith('smoke')) continue;
  for (const run of fs.readdirSync(path.join(RUNS, batch))) {
    const metaFile = path.join(RUNS, batch, run, 'meta.json');
    if (!fs.existsSync(metaFile)) continue;
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    if (meta.status !== 'ok') continue;
    const lines = fs.readFileSync(path.join(RUNS, batch, run, 'transcript.jsonl'), 'utf8').trimEnd().split('\n');
    const result = JSON.parse(lines[lines.length - 1]);
    const u = meta.usage ?? result.usage ?? {};
    rows.push({
      batch,
      model: meta.model_requested ?? meta.model,
      turns: meta.num_turns ?? result.num_turns ?? 0,
      fresh: u.input_tokens ?? 0,
      written: u.cache_creation_input_tokens ?? 0,
      reread: u.cache_read_input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      usd: result.total_cost_usd ?? 0,
      seconds: meta.duration_s ?? 0,
    });
  }
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const k = (x) => `${Math.round(x / 1000)}k`;
function line(label, rs) {
  const prompt = mean(rs.map((r) => r.fresh + r.written + r.reread));
  return `| ${label} | ${rs.length} | ${mean(rs.map((r) => r.turns)).toFixed(0)} | ${k(prompt)} | ${k(mean(rs.map((r) => r.fresh + r.written)))} | ${k(mean(rs.map((r) => r.output)))} | ${mean(rs.map((r) => r.usd)).toFixed(2)} | ${rs.reduce((s, r) => s + r.usd, 0).toFixed(0)} |`;
}

const models = [...new Set(rows.map((r) => r.model))].sort();
console.log(`${rows.length} completed runs in ${new Set(rows.map((r) => r.batch)).size} batches.\n`);
console.log('| Model | Runs | Mean turns | Prompt tokens read per run, all turns added up | …of which new each time (not re-read from cache) | Output tokens per run | Mean cost per run, USD at list price | Total, USD |');
console.log('|---|---|---|---|---|---|---|---|');
for (const m of models) console.log(line(m, rows.filter((r) => r.model === m)));
console.log(line('**all**', rows));
console.log(`\nAgent time: ${(rows.reduce((s, r) => s + r.seconds, 0) / 3600).toFixed(0)} hours in total.`);
