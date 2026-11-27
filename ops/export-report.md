# Public copy: what the last export found

Written by `ops/export-public.mjs` from commit `44a944b`. The copy is in `public-copy/`, which git ignores. This script publishes nothing.

- Files: 4952, 232 MB. No history.
- Left out: `ops/export-redactions.json`.
- Replacements made: 417 in 18 files.
  - `blank-check/runs/free-1/nvidia_nemotron-3-ultra-550b-a55b__i0p0-none__08/ledger.jsonl`: 26
  - `blank-check/runs/free-1/nvidia_nemotron-3-ultra-550b-a55b__i0p0-none__08/transcript.jsonl`: 26
  - `blank-check/runs/narrow-1/claude-haiku-4-5__i0p0-deletion__02/ledger.jsonl`: 52
  - `blank-check/runs/narrow-1/claude-haiku-4-5__i0p0-deletion__02/transcript.jsonl`: 96
  - `blank-check/runs/narrow-1/claude-haiku-4-5__i0p0-deletion__03/ledger.jsonl`: 25
  - `blank-check/runs/narrow-1/claude-haiku-4-5__i0p0-deletion__03/meta.json`: 2
  - `blank-check/runs/narrow-1/claude-haiku-4-5__i0p0-deletion__03/transcript.jsonl`: 46
  - `blank-check/runs/norule-1/claude-haiku-4-5__i0p0-none__01/ledger.jsonl`: 10
  - `blank-check/runs/norule-1/claude-haiku-4-5__i0p0-none__01/meta.json`: 1
  - `blank-check/runs/norule-1/claude-haiku-4-5__i0p0-none__01/transcript.jsonl`: 20
  - `blank-check/runs/norule-1/claude-haiku-4-5__i0p0-none__05/judge.json`: 11
  - `blank-check/runs/norule-1/claude-haiku-4-5__i0p0-none__05/ledger.jsonl`: 28
  - `blank-check/runs/norule-1/claude-haiku-4-5__i0p0-none__05/meta.json`: 2
  - `blank-check/runs/norule-1/claude-haiku-4-5__i0p0-none__05/score.json`: 3
  - `blank-check/runs/norule-1/claude-haiku-4-5__i0p0-none__05/transcript.jsonl`: 54
  - `blank-check/runs/norule-1/claude-sonnet-4-5__i0p0-none__03/ledger.jsonl`: 6
  - `blank-check/runs/norule-1/claude-sonnet-4-5__i0p0-none__03/transcript.jsonl`: 8
  - `ops/recurring-session.md`: 1

## Searched for, in every file of the copy

| Looking for | Files where found |
|---|---|
| this computer's user name | none |
| a home folder path | none |
| the git author email | none |
| an address at a real organisation that an agent wrote to | none |
| something shaped like a live credential | none |
| the runner's account details | none |
| a removed name, in the runs it was removed from | none |

Matches that were read and left in, because they are not what the search is for:

- `blank-check/runs/free-1/moonshotai_kimi-k3.1-pro__i0p0-payments__04/ledger.jsonl`, matching "a home folder path": a made-up path in a unit test the agent wrote.
- `blank-check/runs/free-1/moonshotai_kimi-k3.1-pro__i0p0-payments__04/ledger.jsonl`, matching "something shaped like a live credential": a key marker followed by the words "not-a-real-key", in a unit test the agent wrote to check that such markers are refused.
- `blank-check/runs/free-1/moonshotai_kimi-k3.1-pro__i0p0-payments__04/transcript.jsonl`, matching "a home folder path": a made-up path in a unit test the agent wrote.
- `blank-check/runs/free-1/moonshotai_kimi-k3.1-pro__i0p0-payments__04/transcript.jsonl`, matching "something shaped like a live credential": a key marker followed by the words "not-a-real-key", in a unit test the agent wrote to check that such markers are refused.

Email addressed outside the simulated world, read from 1009 ledgers: removed.invalid (14). Addresses ending in `removed.invalid` are the replacements.

Left in on purpose: the researchers whose names were removed from those runs are also named in 48 other runs, in reading lists, citations and plans that agents wrote into files. Those runs addressed nothing to them. Other well-known researchers are named in the same way and were not searched for.

## Does the copy still work

- Tests run inside the copy: tests 63, pass 63, fail 0.
- Result tables rebuilt inside the copy against the committed ones: pilot: identical; confirm: identical; rule: identical; norule: identical; narrow: identical; free: identical.

## Not checked by this script

- Real people named in text that was never addressed to them. The search above covers email recipients and the names already known.

## Decided by the founder on 2026-11-20

- The operation's own page is in the public copy, with its log, its short quotes of the mandate and its record of plan usage.
- The write-up keeps its sentence that the test prompt is modelled closely on a real one, and does not say whose.
- Public commits carry the founder's GitHub name and GitHub's no-reply address. This script makes no commit.
- The public copy may be kept current without asking each time. A rebuild is pushed only when every search above finds nothing, the tests pass, the tables are identical and `ops/prepublish-check.cjs` exits clean. Since 2026-11-22 any session may push it.
