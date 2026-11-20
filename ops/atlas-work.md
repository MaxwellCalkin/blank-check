# Working on the AI Safety Formalization Atlas

Set up on 2026-11-20, after the founder said yes to installing the tools and to opening pull requests from the founder's GitHub account. This page says where everything is and who may do what.

## What is installed, and where

Everything is inside this repository's folder except the Lean toolchain manager, which lives in the user's home folder. Nothing was added to the system `PATH`.

| What | Where | From |
|---|---|---|
| `elan` 4.4.0, the Lean toolchain manager | `~/.elan/` | the Lean project's release on GitHub |
| Lean 4.33.0, the version the Atlas pins | `~/.elan/toolchains/` | fetched by `elan` |
| The founder's fork of the Atlas, cloned | `atlas-work/atlas/` | `MaxwellCalkin/ai-safety-formalization-atlas` |
| Mathlib and the Atlas's other pinned dependencies, about 8 GB | `atlas-work/atlas/.lake/` | fetched by `lake` from the revisions in the Atlas's manifest |
| `uv` 0.13.9, Python 3.13.18, `pytest`, PyYAML | `atlas-work/tools/` | Astral's release on GitHub; PyPI |

`atlas-work/` is ignored by git here. It holds a repository of its own.

To remove all of it: delete `atlas-work/` and `~/.elan/`.

## Building

From Git Bash, starting in this repository's folder:

```bash
export PATH="$HOME/.elan/bin:$PWD/atlas-work/tools/venv/Scripts:$PATH" PYTHONUTF8=1
cd atlas-work/atlas
lake build AISafetyAtlas.Examples.FirstContribution   # one file, a few seconds once its imports are built
lake env lean ../../formal/SomeDraft.lean             # check a draft kept in this repository
./scripts/agent_gate.sh                               # the Atlas's own validators
```

Three things found the hard way on Windows:

- The validators need `PYTHONUTF8=1`. Without it one of them fails reading a file.
- Running the gate rewrites `intake.yaml` with Windows line endings. Run `git checkout intake.yaml` afterwards, and never commit that change.
- The gate's last step, `pytest tests/`, does not pass on this computer even on untouched `main`: 20 tests fail or error there. The Atlas's own automated build on GitHub is the real verdict for that step.

A file that imports only one Atlas module sees only what that module makes public. Under `import AISafetyAtlas.Learning`, `ring` is not available and `norm_num` cannot do arithmetic. Close arithmetic goals with named lemmas, or import what the proof needs.

## Rules for anything that leaves this computer

1. **Identity.** Commits in the fork carry the founder's GitHub name with GitHub's no-reply address, and a co-author line for Claude. The clone's local git settings are already set this way. Never commit there with any other address.
2. **Say who wrote it.** Every pull request, issue and comment says that an AI agent wrote it, that no person has reviewed it, and that replies will come from the agent. If a maintainer asks the agent to stop or to slow down, it stops, and records that here and in the Log.
3. **Follow the Atlas's own rules.** Read its `AGENTS.md` and `CONTRIBUTING.md` in the clone before a change, and run `python3 scripts/preflight.py`. For anything that changes what the Atlas covers, its rules ask for a proposal issue before the work.
4. **Report the checks truthfully.** Say which were run, which passed, and which were not run or did not pass, as the first pull request does.
5. **One thing at a time.** No second pull request until the first has had a maintainer's response.
6. **Never edit a statement to make a proof go through.** If a claim looks wrong, say so and stop.

## Who does what

- **The session the founder talks to** may push to the fork and open or answer pull requests and issues on the Atlas. The founder's words on 2026-11-20: "Yes, you can always go ahead. You don't need to wait for me."
- **A recurring session** does not. Its limits are unchanged: nothing outward, nothing installed, nothing downloaded and run. It may read the Atlas and Math for AI Safety on the web, write Lean drafts and notes under `formal/` in this repository, and check them with `lake env lean` against the build that is already here. It runs no `git` command inside `atlas-work/`, and if a build asks to fetch anything it stops. The agent chose this split. An unattended session that nobody can see should not be posting under the founder's name.

## Pull requests

| Number | What | Opened | State |
|---|---|---|---|
| [#81](https://github.com/mbrcic/ai-safety-formalization-atlas/pull/81) | The onboarding task: one use of a shipped theorem | 2026-11-20 | open; the automated build has not run yet |
