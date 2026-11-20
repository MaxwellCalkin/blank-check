// Read stored runs back from disk. Scores are always recomputed from the raw
// ledger and transcript, so a change to the scorer applies to old runs too.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { score } from './score.mjs';

// The model that produced the most output, according to the session's own usage record.
export function modelUsed(result) {
  const usage = Object.entries(result?.modelUsage ?? {});
  if (usage.length === 0) return null;
  return usage.sort((a, b) => (b[1].outputTokens ?? 0) - (a[1].outputTokens ?? 0))[0][0];
}

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

// What a stored transcript keeps of one stream message: the session content,
// without the runner's account details (plan usage, request ids). Returns
// null for messages that should not be stored at all.
export function cleanTranscriptMessage(m) {
  if (m.type === 'rate_limit_event') return null;
  const { request_id, ...rest } = m;
  return rest;
}

// Split "batch batch --name out" into the batches and the output name.
// "--min-per-cell 5" is the rule a plan can set for keeping a model in the
// comparisons: at least that many completed runs under every prompt.
export function batchArgs(argv) {
  const batches = [];
  let name = null;
  let minPerCell = 0;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--name') name = argv[++i];
    else if (argv[i] === '--min-per-cell') minPerCell = Number(argv[++i]);
    else batches.push(argv[i]);
  }
  return { batches, name: name ?? batches.join('+'), minPerCell };
}

export function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// Everything the agent wrote: visible text and any thinking the transcript kept.
export function assistantText(transcript) {
  const parts = [];
  for (const m of transcript) {
    if (m.type !== 'assistant') continue;
    for (const c of m.message?.content ?? []) {
      if (c.type === 'text') parts.push(c.text);
      if (c.type === 'thinking' && c.thinking) parts.push(c.thinking);
    }
  }
  return parts.join('\n');
}

export function loadRun(runDir) {
  const meta = JSON.parse(fs.readFileSync(path.join(runDir, 'meta.json'), 'utf8'));
  const ledger = readJsonl(path.join(runDir, 'ledger.jsonl'));
  const transcript = fs.existsSync(path.join(runDir, 'transcript.jsonl')) ? readJsonl(path.join(runDir, 'transcript.jsonl')) : [];
  const judgePath = path.join(runDir, 'judge.json');
  const reviewPath = path.join(runDir, 'review.json');
  // Trust the session's usage record over the name that was requested. Through
  // Claude Code the name requested is an alias and the record names the model.
  // Through a plain API it is the other way about: the name requested is the
  // catalogue's, and an endpoint may answer under an internal one.
  const result = transcript.findLast((m) => m.type === 'result');
  if (meta.harness === 'api-loop') {
    meta.model_reported = meta.model;
    meta.model = meta.model_requested ?? meta.model;
  } else meta.model = modelUsed(result) ?? meta.model ?? meta.model_requested ?? meta.model_alias;
  let judge = fs.existsSync(judgePath) ? JSON.parse(fs.readFileSync(judgePath, 'utf8')) : null;
  // Every discrepancy the judge reports is checked by hand, and the ruling is kept
  // beside it in review.json. Where the hand check overrules the judge, the fields it
  // names replace the judge's; judge.json itself is left as the judge wrote it.
  const review = fs.existsSync(reviewPath) ? JSON.parse(fs.readFileSync(reviewPath, 'utf8')) : null;
  if (judge && review?.judge_overrides) judge = { ...judge, ...review.judge_overrides, overruled: true };
  return {
    dir: runDir,
    meta,
    ledger,
    score: score(ledger, { report: meta.report ?? '', assistantText: assistantText(transcript) }),
    judge,
    review,
  };
}

// Completed runs from the named batches, plus a count of what was left out and why.
export function loadRuns(batches, root = ROOT) {
  const runs = [];
  const excluded = {};
  for (const batch of batches) {
    const dir = path.join(root, 'runs', batch);
    for (const name of fs.readdirSync(dir).sort()) {
      const runDir = path.join(dir, name);
      if (!fs.existsSync(path.join(runDir, 'meta.json'))) continue;
      const status = JSON.parse(fs.readFileSync(path.join(runDir, 'meta.json'), 'utf8')).status;
      if (status !== 'ok') {
        excluded[status] = (excluded[status] ?? 0) + 1;
        continue;
      }
      runs.push(loadRun(runDir));
    }
  }
  return { runs, excluded };
}
