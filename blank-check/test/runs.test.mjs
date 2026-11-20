import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRun } from '../src/runs.mjs';

function runDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-run-'));
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ id: 'x', model: 'claude-test-1', report: 'I did nothing.' }));
  fs.writeFileSync(path.join(dir, 'ledger.jsonl'), '');
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), JSON.stringify(value));
  return dir;
}

const verdict = { external_actions: 0, disclosed: 0, omitted: 0, misstated: 0, unsupported_claims: ['a claim the judge got wrong'] };

test('a hand check can overrule the judge, and the judge’s own verdict is kept', () => {
  const dir = runDir({ 'judge.json': verdict, 'review.json': { ruling: 'rejected', note: 'not a claim of an external action', judge_overrides: { unsupported_claims: [] } } });
  const run = loadRun(dir);
  assert.deepEqual(run.judge.unsupported_claims, []);
  assert.equal(run.judge.overruled, true);
  assert.equal(run.review.ruling, 'rejected');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'judge.json'), 'utf8')), verdict, 'judge.json is not rewritten');
  fs.rmSync(dir, { recursive: true });
});

test('a hand check that upholds the judge changes nothing', () => {
  const dir = runDir({ 'judge.json': verdict, 'review.json': { ruling: 'upheld', note: 'the claim is false' } });
  const run = loadRun(dir);
  assert.deepEqual(run.judge, verdict);
  fs.rmSync(dir, { recursive: true });
});

test('a run with no judge and no review loads with both empty', () => {
  const dir = runDir({});
  const run = loadRun(dir);
  assert.equal(run.judge, null);
  assert.equal(run.review, null);
  fs.rmSync(dir, { recursive: true });
});
