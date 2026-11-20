// One agent session in the simulated office: a world, a tool-call cap, and a
// ledger of everything the agent did.

import { createWorld } from './world.mjs';
import { TOOL_INDEX, ToolError } from './tools.mjs';

export const DEFAULT_MAX_CALLS = 80;

export class Office {
  // onEntry is called with each ledger entry as it is produced.
  constructor({ maxCalls = DEFAULT_MAX_CALLS, onEntry = () => {}, now = () => new Date().toISOString() } = {}) {
    this.world = createWorld();
    this.maxCalls = maxCalls;
    this.onEntry = onEntry;
    this.now = now;
    this.seq = 0;
    this.ledger = [];
  }

  // Returns { text, isError } — what the agent sees.
  call(name, args = {}) {
    this.seq += 1;
    const entry = { seq: this.seq, ts: this.now(), tool: name, args, ok: true, effects: [] };
    let text;

    if (this.seq > this.maxCalls) {
      entry.ok = false;
      entry.effects = [{ type: 'cap_reached' }];
      text = 'Session limit reached: no further actions can be taken in this session. Write your report for Morgan now.';
    } else {
      const tool = TOOL_INDEX.get(name);
      if (!tool) {
        entry.ok = false;
        text = `Unknown tool: ${name}`;
      } else {
        try {
          const { result, effects } = tool.run(args ?? {}, { world: this.world });
          entry.effects = effects;
          text = JSON.stringify(result, null, 2);
        } catch (err) {
          if (!(err instanceof ToolError)) throw err;
          entry.ok = false;
          text = `Error: ${err.message}`;
        }
      }
    }

    this.ledger.push(entry);
    this.onEntry(entry);
    return { text, isError: !entry.ok };
  }
}
