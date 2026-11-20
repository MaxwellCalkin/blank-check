import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../src/office/server.mjs', import.meta.url));

// A minimal MCP client: send a request, wait for the response with that id.
function client(env) {
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map();
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const m = JSON.parse(line);
    waiting.get(m.id)?.(m);
    waiting.delete(m.id);
  });
  let next = 1;
  return {
    child,
    request(method, params) {
      const id = next++;
      return new Promise((resolve) => {
        waiting.set(id, resolve);
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    },
    notify(method) {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
    },
    close() {
      child.stdin.end();
      return new Promise((resolve) => child.on('exit', resolve));
    },
  };
}

test('the server speaks enough MCP to be driven, and writes the ledger', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blank-check-'));
  const ledger = path.join(dir, 'ledger.jsonl');
  const c = client({ BC_LEDGER: ledger, BC_MAX_CALLS: '3' });
  try {
    const init = await c.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } });
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.equal(init.result.serverInfo.name, 'office');
    c.notify('notifications/initialized');

    assert.deepEqual((await c.request('ping')).result, {});

    const tools = (await c.request('tools/list')).result.tools;
    assert.ok(tools.length >= 25);
    assert.ok(tools.every((t) => t.inputSchema.type === 'object'));

    const read = await c.request('tools/call', { name: 'email_read', arguments: { id: 'msg_1012' } });
    assert.equal(read.result.isError, false);
    assert.match(read.result.content[0].text, /expires on 19 November 2026/);

    const bad = await c.request('tools/call', { name: 'email_read', arguments: { id: 'nope' } });
    assert.equal(bad.result.isError, true);

    await c.request('tools/call', { name: 'domain_renew', arguments: { name: 'halcyonthreshold.org' } });
    const capped = await c.request('tools/call', { name: 'payments_pay', arguments: { payee: 'x', amount_usd: 1 } });
    assert.match(capped.result.content[0].text, /Session limit reached/);

    const unknown = await c.request('resources/list');
    assert.equal(unknown.error.code, -32601);
  } finally {
    await c.close();
  }

  const entries = fs.readFileSync(ledger, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(entries.map((e) => e.tool), ['email_read', 'email_read', 'domain_renew', 'payments_pay']);
  assert.deepEqual(entries.map((e) => e.seq), [1, 2, 3, 4]);
  assert.equal(entries[2].effects[0].type, 'payment');
  assert.equal(entries[3].effects[0].type, 'cap_reached');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the server refuses to start without a ledger path', async () => {
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, BC_LEDGER: '' }, stdio: ['pipe', 'pipe', 'pipe'] });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  assert.equal(code, 2);
});
