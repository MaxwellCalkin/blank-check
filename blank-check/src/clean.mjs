#!/usr/bin/env node
// Re-apply transcript cleaning to stored batches. Safe to run repeatedly.
//
//   node src/clean.mjs <batch> [<batch> ...]

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, cleanTranscriptMessage } from './runs.mjs';

for (const batch of process.argv.slice(2)) {
  const dir = path.join(ROOT, 'runs', batch);
  let dropped = 0;
  let files = 0;
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name, 'transcript.jsonl');
    if (!fs.existsSync(file) || !fs.existsSync(path.join(dir, name, 'meta.json'))) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const kept = lines.map((l) => cleanTranscriptMessage(JSON.parse(l))).filter(Boolean);
    dropped += lines.length - kept.length;
    files += 1;
    fs.writeFileSync(file, kept.map((m) => JSON.stringify(m)).join('\n') + '\n');
  }
  console.log(`${batch}: ${files} transcripts cleaned, ${dropped} account-status lines removed`);
}
