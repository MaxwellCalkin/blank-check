import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { converse, makeChat, readStream, runOne, nextAttempt, RateLimited, PROVIDERS, FUNCTIONS, safeName } from '../src/run-api.mjs';
import { parseCell, SYSTEM_PROMPT, mandate } from '../src/conditions.mjs';
import { toolSchemas } from '../src/office/tools.mjs';
import { score } from '../src/score.mjs';
import { assistantText } from '../src/runs.mjs';

const cell = parseCell('i0p0-payments');
const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } });
const says = (content, tool_calls) => ({ model: 'vendor/model-x', choices: [{ message: { role: 'assistant', content, ...(tool_calls ? { tool_calls } : {}) }, finish_reason: tool_calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 10 } });

// A stand-in for a model: answers with the next scripted message and keeps what it was sent.
function scripted(steps) {
  const seen = [];
  const chat = async (body) => {
    seen.push(structuredClone(body));
    return steps[seen.length - 1];
  };
  return { chat, seen };
}

test('the model is given the office tools under the names Claude Code shows, and nothing else', () => {
  assert.deepEqual(FUNCTIONS.map((f) => f.function.name), toolSchemas().map((t) => `mcp__office__${t.name}`));
  assert.ok(FUNCTIONS.every((f) => f.type === 'function' && f.function.parameters.type === 'object'));
});

test('a run goes from the mandate through tool calls to a report, and is stored in the shape the scorer reads', async () => {
  const { chat, seen } = scripted([
    says('Looking at the inbox first.', [call('c1', 'mcp__office__email_list', {})]),
    says(null, [call('c2', 'mcp__office__domain_renew', { name: 'halcyonthreshold.org', years: 1 }), call('c3', 'mcp__office__message_user', { text: 'Renewed the domain.' })]),
    says('Morgan, I renewed the domain and stopped there.'),
  ]);
  const run = await converse({ chat, model: 'vendor/model-x', cell });

  assert.equal(run.status, 'ok');
  assert.equal(run.report, 'Morgan, I renewed the domain and stopped there.');
  assert.equal(run.turns, 3);
  assert.deepEqual(run.ledger.map((e) => [e.seq, e.tool, e.ok]), [[1, 'email_list', true], [2, 'domain_renew', true], [3, 'message_user', true]]);

  // The first request carries the same two messages every Claude run got.
  assert.deepEqual(seen[0].messages, [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: mandate(cell) }]);
  assert.equal(seen[0].tools.length, 29);
  // Later requests carry the model's own calls and the office's answers.
  assert.equal(seen[1].messages[2].tool_calls[0].id, 'c1');
  assert.deepEqual([seen[1].messages[3].role, seen[1].messages[3].tool_call_id], ['tool', 'c1']);
  assert.match(seen[1].messages[3].content, /Zentrivo|Domain|renew/i);

  const s = score(run.ledger, { report: run.report, assistantText: run.assistantText });
  assert.equal(s.flags.paid, true);
  assert.equal(s.flags.messaged_user, true);
  assert.equal(s.flags.emailed_third_party, false);

  const result = run.transcript.at(-1);
  assert.deepEqual([result.type, result.is_error, result.num_turns, result.result], ['result', false, 3, run.report]);
  assert.deepEqual(result.modelUsage, { 'vendor/model-x': { inputTokens: 300, outputTokens: 30 } });
  assert.match(assistantText(run.transcript), /Looking at the inbox first\.[\s\S]*renewed the domain/);
});

test('calls that Claude Code would turn away never reach the office', async () => {
  const { chat, seen } = scripted([
    says('', [call('c1', 'mcp__office__delete_everything', {}), call('c2', 'mcp__office__email_read', '{not json'), call('c3', 'email_list', {})]),
    says('Done.'),
  ]);
  const run = await converse({ chat, model: 'm', cell });
  assert.deepEqual(run.ledger.map((e) => e.tool), ['email_list'], 'only the real call is in the ledger; a bare tool name is accepted');
  const back = seen[1].messages.filter((m) => m.role === 'tool').map((m) => m.content);
  assert.match(back[0], /No such tool available: mcp__office__delete_everything/);
  assert.match(back[1], /not a JSON object/);
  assert.equal(run.status, 'ok');
});

test('the cap on tool calls is the office’s, and the run ends when the model stops calling', async () => {
  const steps = [];
  for (let i = 0; i < 4; i++) steps.push(says('', [call(`c${i}`, 'mcp__office__email_list', {})]));
  steps.push(says('Report.'));
  const { chat, seen } = scripted(steps);
  const run = await converse({ chat, model: 'm', cell, maxCalls: 2 });
  assert.deepEqual(run.ledger.map((e) => e.ok), [true, true, false, false]);
  assert.match(seen[3].messages.at(-1).content, /Session limit reached/);
  assert.equal(run.status, 'ok');
});

test('a model that never stops, or answers with nothing, is not counted as a finished run', async () => {
  const forever = async () => says('', [call('c', 'mcp__office__email_list', {})]);
  assert.equal((await converse({ chat: forever, model: 'm', cell, maxTurns: 5 })).status, 'turn_limit');
  assert.equal((await converse({ chat: async () => says(''), model: 'm', cell })).status, 'empty');
  assert.equal((await converse({ chat: async () => ({}), model: 'm', cell })).status, 'error');
  assert.equal((await converse({ chat: forever, model: 'm', cell, deadline: Date.now() - 1 })).status, 'timeout');
});

test('reasoning the endpoint returns is kept as thinking', async () => {
  const withReasoning = { model: 'm', choices: [{ message: { role: 'assistant', content: 'Nothing to do.', reasoning_content: 'The notes say wait.' } }] };
  const run = await converse({ chat: async () => withReasoning, model: 'm', cell });
  assert.deepEqual(run.transcript[1].message.content, [{ type: 'thinking', thinking: 'The notes say wait.' }, { type: 'text', text: 'Nothing to do.' }]);
});

test('only free endpoints are accepted, and run folders get safe names', () => {
  assert.equal(PROVIDERS.openrouter.allows('google/gemma-4-31b-it:free'), true);
  assert.equal(PROVIDERS.openrouter.allows('openai/gpt-5.6-sol'), false);
  assert.equal(safeName('nvidia/nemotron-3-ultra-550b-a55b:free'), 'nvidia_nemotron-3-ultra-550b-a55b_free');
});

test('the client waits and retries when told to slow down, and gives up as rate limited', async () => {
  const response = (status, body, headers = {}) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: (k) => headers[k] ?? null } });
  const waited = [];
  const sleepImpl = async (ms) => { waited.push(ms); };

  let n = 0;
  const flaky = async (url, init) => {
    n += 1;
    assert.equal(url, 'https://example.invalid/v1/chat/completions');
    assert.equal(init.headers.authorization, 'Bearer k');
    return n < 3 ? response(429, { error: 'slow down' }, { 'retry-after': '7' }) : response(200, { ok: true });
  };
  assert.deepEqual(await makeChat({ base: 'https://example.invalid/v1', key: 'k', slowWaits: [1, 2], fetchImpl: flaky, sleepImpl })({}), { ok: true });
  // The endpoint asked for seven seconds, which is longer than either wait.
  assert.deepEqual(waited.map((ms) => Math.round(ms / 100)), [70, 70]);

  const always429 = async () => response(429, { error: 'daily limit' });
  await assert.rejects(makeChat({ base: 'b', key: 'k', slowWaits: [1], fetchImpl: always429, sleepImpl })({}), RateLimited);
  const badRequest = async () => response(400, { error: 'tools not supported' });
  await assert.rejects(makeChat({ base: 'b', key: 'k', waits: [1], fetchImpl: badRequest, sleepImpl })({}), /HTTP 400.*tools not supported/);
});

// What a streaming endpoint sends: lines of "data: {...}", then "data: [DONE]".
const sse = (events, { done = true } = {}) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + (done ? 'data: [DONE]\n\n' : '');
const piece = (delta, finish_reason = null) => ({ model: 'vendor/model-x', choices: [{ index: 0, delta, finish_reason }] });
async function* inChunks(text, size) {
  const bytes = new TextEncoder().encode(text);
  for (let i = 0; i < bytes.length; i += size) yield bytes.slice(i, i + size);
}

test('a streamed answer is put back together: words, reasoning, and tool calls that arrive in pieces', async () => {
  const text = sse([
    piece({ role: 'assistant', reasoning_content: 'Inbox ' }),
    piece({ reasoning_content: 'first.' }),
    piece({ content: 'Looking' }),
    piece({ content: ' now — ünïcode.' }),
    piece({ tool_calls: [{ index: 0, id: 'a1', type: 'function', function: { name: 'mcp__office__email_list', arguments: '' } }] }),
    piece({ tool_calls: [{ index: 0, function: { arguments: '{}' } }] }),
    piece({ tool_calls: [{ index: 1, id: 'a2', type: 'function', function: { name: 'mcp__office__domain_renew', arguments: '{"name":"halcyon' } }] }),
    piece({ tool_calls: [{ index: 1, function: { arguments: 'threshold.org","years":1}' } }] }),
    piece({}, 'tool_calls'),
    { model: 'vendor/model-x', choices: [], usage: { prompt_tokens: 321, completion_tokens: 45 } },
  ]);
  let heard = 0;
  // Seven bytes at a time, so that lines and a two-byte letter are split across chunks.
  const got = await readStream(inChunks(text, 7), () => { heard += 1; });
  assert.ok(heard > 10);
  assert.equal(got.model, 'vendor/model-x');
  assert.deepEqual(got.usage, { prompt_tokens: 321, completion_tokens: 45 });
  assert.equal(got.choices[0].finish_reason, 'tool_calls');
  const m = got.choices[0].message;
  assert.equal(m.content, 'Looking now — ünïcode.');
  assert.equal(m.reasoning_content, 'Inbox first.');
  assert.deepEqual(m.tool_calls, [
    call('a1', 'mcp__office__email_list', '{}'),
    call('a2', 'mcp__office__domain_renew', '{"name":"halcyonthreshold.org","years":1}'),
  ]);
});

test('a streamed answer from an endpoint that sends whole calls, repeats names or leaves out ids still reads right', async () => {
  const whole = await readStream(inChunks(sse([
    piece({ tool_calls: [{ id: 'x1', type: 'function', function: { name: 'mcp__office__email_list', arguments: {} } }] }),
    piece({ tool_calls: [{ id: 'x2', type: 'function', function: { name: 'mcp__office__files_list', arguments: '{}' } }] }, 'tool_calls'),
  ]), 64));
  assert.deepEqual(whole.choices[0].message.tool_calls, [call('x1', 'mcp__office__email_list', '{}'), call('x2', 'mcp__office__files_list', '{}')]);
  assert.equal(whole.choices[0].message.content, null);

  const repeated = await readStream(inChunks(sse([
    piece({ tool_calls: [{ index: 0, function: { name: 'mcp__office__email_list', arguments: '{' } }] }),
    piece({ tool_calls: [{ index: 0, function: { name: 'mcp__office__email_list', arguments: '}' } }] }, 'tool_calls'),
  ]), 64));
  assert.deepEqual(repeated.choices[0].message.tool_calls, [call('call_1', 'mcp__office__email_list', '{}')]);
});

test('a stream that is cut off, or that reports an error, is not taken for an agent that stopped', async () => {
  await assert.rejects(readStream(inChunks(sse([piece({ content: 'Half an ans' })], { done: false }), 32)), /ended before the answer did/);
  await assert.rejects(readStream(inChunks(sse([{ error: { message: 'worker died' } }]), 32)), /worker died/);
  // An answer with no words and no calls, properly ended, is passed on as it is.
  const empty = await readStream(inChunks(sse([piece({}, 'stop')]), 32));
  assert.deepEqual(empty.choices[0].message, { role: 'assistant', content: null });
});

test('the client asks for a stream, retries one that was cut off, and still reads a plain answer', async () => {
  const headers = (type) => ({ get: (k) => (k === 'content-type' ? type : null) });
  const sleepImpl = async () => {};
  const sent = [];
  let n = 0;
  const cutThenWhole = async (url, init) => {
    n += 1;
    sent.push(JSON.parse(init.body));
    const text = n === 1 ? sse([piece({ content: 'Half' })], { done: false }) : sse([piece({ content: 'Done.' }, 'stop')]);
    return { ok: true, status: 200, headers: headers('text/event-stream; charset=utf-8'), body: inChunks(text, 16) };
  };
  const got = await makeChat({ base: 'b', key: 'k', waits: [1], fetchImpl: cutThenWhole, sleepImpl })({ model: 'm', messages: [] });
  assert.equal(n, 2);
  assert.equal(got.choices[0].message.content, 'Done.');
  assert.equal(sent[0].stream, true);
  assert.deepEqual(sent[0].stream_options, { include_usage: true });

  const plain = async () => ({ ok: true, status: 200, headers: headers('application/json'), json: async () => ({ plain: true }) });
  assert.deepEqual(await makeChat({ base: 'b', key: 'k', fetchImpl: plain, sleepImpl })({}), { plain: true });

  const unstreamed = async (url, init) => ({ ok: true, status: 200, headers: headers('application/json'), json: async () => JSON.parse(init.body) });
  assert.deepEqual(await makeChat({ base: 'b', key: 'k', stream: false, fetchImpl: unstreamed, sleepImpl })({ model: 'm' }), { model: 'm' });

  const silent = async (url, init) => new Promise((resolve, reject) => { init.signal.addEventListener('abort', () => reject(init.signal.reason)); });
  await assert.rejects(makeChat({ base: 'b', key: 'k', silenceS: 0.05, waits: [], fetchImpl: silent, sleepImpl })({}), /nothing arrived for 0.05s/);
});

test('the client counts how often the endpoint pushed back', async () => {
  const response = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } });
  let n = 0;
  const steps = [() => response(429, {}), () => response(503, {}), () => { throw new TypeError('fetch failed'); }, () => response(200, { ok: true })];
  const chat = makeChat({ base: 'b', key: 'k', waits: [0, 0, 0], fetchImpl: async () => steps[n++](), sleepImpl: async () => {} });
  assert.deepEqual(await chat({}), { ok: true });
  assert.deepEqual(chat.stats, { requests: 4, told_to_slow_down: 1, cut_off_or_silent: 1, server_errors: 1 });
});

test('an answer cut off by the output limit before any tool call is not an agent that stopped', async () => {
  const cutOff = { model: 'vendor/model-x', choices: [{ message: { role: 'assistant', content: null, reasoning_content: 'Still thinking about' }, finish_reason: 'length' }], usage: { prompt_tokens: 100, completion_tokens: 8192 } };
  const { chat } = scripted([says(null, [call('c1', 'mcp__office__email_list', {})]), cutOff]);
  const run = await converse({ chat, model: 'vendor/model-x', cell });
  assert.equal(run.status, 'truncated');
  assert.equal(run.ledger.length, 1);
  assert.equal(run.transcript.at(-1).is_error, true);

  // Cut off in the middle of a turn that did call a tool: the run goes on.
  const cutButCalled = says('Writing.', [call('c2', 'mcp__office__email_list', {})]);
  cutButCalled.choices[0].finish_reason = 'length';
  const second = await converse({ chat: scripted([cutButCalled, says('Done.')]).chat, model: 'vendor/model-x', cell });
  assert.equal(second.status, 'ok');
  assert.equal(second.report, 'Done.');
});

test('a request that runs past the whole time allowed is given up at once, not tried again', async () => {
  let n = 0;
  const never = async (url, init) => { n += 1; return new Promise((resolve, reject) => { init.signal.addEventListener('abort', () => reject(init.signal.reason)); }); };
  const chat = makeChat({ base: 'b', key: 'k', silenceS: 5, requestTimeoutS: 0.05, waits: [0, 0, 0], fetchImpl: never, sleepImpl: async () => {} });
  await assert.rejects(chat({}), /no complete answer in 0.05s/);
  assert.equal(n, 1);
});

test('requests from all runs together are held to the rate the provider allows', async () => {
  const at = [];
  const quick = async () => { at.push(Date.now()); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ok: true }) }; };
  const chat = makeChat({ base: 'b', key: 'k', perMinute: 2, windowMs: 120, fetchImpl: quick });
  await Promise.all([chat({}), chat({}), chat({}), chat({}), chat({})]);
  assert.equal(at.length, 5);
  // Two at once, the next two a window later, the fifth a window after that.
  assert.ok(at[2] - at[0] >= 110, `third request came ${at[2] - at[0]} ms after the first`);
  assert.ok(at[4] - at[2] >= 110, `fifth request came ${at[4] - at[2]} ms after the third`);
  assert.ok(PROVIDERS.nvidia.perMinute <= 40 && PROVIDERS.openrouter.perMinute <= 20);
});

test('a refusal is waited out for longer than a failure, and holds back the other runs of that model only', async () => {
  const response = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } });
  const waited = [];
  const sleepImpl = async (ms) => { waited.push(Math.round(ms / 1000)); };

  // Refused six times, answered on the seventh try: every wait in the list is used.
  let n = 0;
  const busy = async () => (++n <= 6 ? response(429, {}) : response(200, { ok: true }));
  const chat = makeChat({ base: 'b', key: 'k', fetchImpl: busy, sleepImpl });
  assert.deepEqual(await chat({ model: 'a' }), { ok: true });
  assert.deepEqual(waited, [5, 20, 60, 120, 240, 240]);
  assert.deepEqual(chat.refused, { a: 6 });

  // Refusals do not use up the tries kept for failures, or the other way about.
  let m = 0;
  const steps = [() => response(429, {}), () => response(503, {}), () => response(429, {}), () => response(503, {}), () => response(200, { ok: true })];
  assert.deepEqual(await makeChat({ base: 'b', key: 'k', waits: [0, 0], slowWaits: [0, 0], fetchImpl: async () => steps[m++](), sleepImpl })({ model: 'a' }), { ok: true });

  // While model a is being refused, a second request for a waits too; one for b does not.
  const order = [];
  let first = true;
  const oneRefusal = async (url, init) => {
    const { model } = JSON.parse(init.body);
    order.push(model);
    if (model === 'a' && first) { first = false; return response(429, {}); }
    return response(200, { model });
  };
  const slept = [];
  const two = makeChat({ base: 'b', key: 'k', stream: false, slowWaits: [30], fetchImpl: oneRefusal, sleepImpl: async (ms) => { slept.push(Math.round(ms / 1000)); } });
  await two({ model: 'a' });
  assert.deepEqual(slept, [30]);
  await two({ model: 'b' });
  assert.deepEqual(slept, [30]);
  await two({ model: 'a' });
  assert.equal(slept.length, 2);
  assert.ok(slept[1] >= 29, `the second request for the refused model waited ${slept[1]}s`);
  assert.deepEqual(order, ['a', 'a', 'b', 'a']);
});

test('a run that did not end by the agent stopping is started once more and never a third time', async () => {
  assert.deepEqual(nextAttempt(null), { attempt: 1 });
  assert.deepEqual(nextAttempt({ status: 'ok' }), { skip: 'already done' });
  // Stored before attempts were counted: that was the first.
  assert.deepEqual(nextAttempt({ status: 'timeout' }), { attempt: 2 });
  assert.deepEqual(nextAttempt({ status: 'truncated', attempt: 1 }), { attempt: 2 });
  assert.deepEqual(nextAttempt({ status: 'timeout', attempt: 2 }), { skip: 'not started again' });
  assert.deepEqual(nextAttempt({ status: 'error', attempt: 2 }), { skip: 'not started again' });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blank-check-attempts-'));
  try {
    const job = { model: 'vendor/model-x', cell, k: 1 };
    const opts = { batch: 't', provider: 'nvidia', maxCalls: 80, maxTokens: 100, timeoutMin: 1 };
    const meta = () => JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0], 'meta.json'), 'utf8'));
    let asked = 0;
    const broken = async () => { asked += 1; throw new Error('HTTP 500: upstream'); };

    // An endpoint error is kept as an attempt, with nothing of the run beside it.
    assert.equal((await runOne(job, opts, broken, dir)).status, 'error');
    assert.equal(meta().status, 'error');
    assert.equal(meta().attempt, 1);
    assert.deepEqual(fs.readdirSync(path.join(dir, fs.readdirSync(dir)[0])), ['meta.json']);
    assert.equal((await runOne(job, opts, broken, dir)).status, 'error');
    assert.equal(meta().attempt, 2);
    const third = await runOne(job, opts, broken, dir);
    assert.equal(third.skipped, 'not started again');
    assert.equal(third.status, 'error');
    assert.equal(asked, 2);

    // A run stopped by the provider's limit leaves nothing and is not an attempt.
    const job2 = { model: 'vendor/model-y', cell, k: 1 };
    const refusedForGood = async () => { throw new RateLimited('HTTP 429'); };
    const stopped = await runOne(job2, opts, refusedForGood, dir);
    assert.equal(stopped.status, 'rate_limited');
    assert.equal(fs.readdirSync(dir).length, 1);
    const { chat } = scripted([says('Nothing to do.')]);
    const done = await runOne(job2, opts, chat, dir);
    assert.equal(done.status, 'ok');
    const stored = JSON.parse(fs.readFileSync(path.join(dir, done.id, 'meta.json'), 'utf8'));
    assert.equal(stored.attempt, 1);
    assert.equal((await runOne(job2, opts, chat, dir)).skipped, 'already done');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
