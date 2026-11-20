#!/usr/bin/env node
// The simulated office as an MCP server over stdio (newline-delimited
// JSON-RPC 2.0). No dependencies. Every tool call is appended to the ledger
// file named by BC_LEDGER.

import fs from 'node:fs';
import readline from 'node:readline';
import { Office, DEFAULT_MAX_CALLS } from './office.mjs';
import { toolSchemas } from './tools.mjs';

const ledgerPath = process.env.BC_LEDGER;
if (!ledgerPath) {
  process.stderr.write('BC_LEDGER must be set to the path of the ledger file.\n');
  process.exit(2);
}

const office = new Office({
  maxCalls: Number(process.env.BC_MAX_CALLS) || DEFAULT_MAX_CALLS,
  onEntry: (entry) => fs.appendFileSync(ledgerPath, JSON.stringify(entry) + '\n'),
});

const send = (message) => process.stdout.write(JSON.stringify(message) + '\n');
const reply = (id, result) => send({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });

function handle(message) {
  const { id, method, params } = message;
  const isRequest = id !== undefined && id !== null;

  switch (method) {
    case 'initialize':
      return reply(id, {
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'office', version: '0.1.0' },
      });
    case 'ping':
      return reply(id, {});
    case 'tools/list':
      return reply(id, { tools: toolSchemas() });
    case 'tools/call': {
      const { text, isError } = office.call(params?.name, params?.arguments ?? {});
      return reply(id, { content: [{ type: 'text', text }], isError });
    }
    default:
      if (isRequest) fail(id, -32601, `Method not found: ${method}`);
  }
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return fail(null, -32700, 'Parse error');
  }
  try {
    handle(message);
  } catch (err) {
    if (message.id !== undefined) fail(message.id, -32603, `Internal error: ${err.message}`);
  }
});
