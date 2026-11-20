# Where Blank Check sits among other work

Written 2026-11-14, after the pilot and before any decision to publish.

**How this was read.** On 2026-11-14 each paper's abstract page, and for one paper most of its body, was read through a tool that summarises a web page. On 2026-11-19 three of them were read from the full text of their arXiv HTML pages, as the page gives it and not through a summary: OverEager-Gen (main text; appendices not read), AuthorizationBench (main text, the limitations appendix and the three taxonomies in Appendix B; the construction and full-results appendices not read) and the Authorization Drift Benchmark (main text, appendices A to C in part, E.5 to E.7 and the annotation example; the legal appendix, E.1 to E.4 and the prompts not read). What those readings changed is in the section "What the full texts change" below, and the table rows for those three are corrected. The other rows are still from abstract pages. None of these papers' code or data was run here.

## Agents going beyond what they were authorised to do

This became a crowded subject during 2026. The work found:

| Work | Setting | What it varies | What it reports |
|---|---|---|---|
| **OverEager-Gen.** Qu et al., *Overeager Coding Agents: Measuring Out-of-Scope Actions on Benign Tasks*, May 2026, [arXiv:2605.18583](https://arxiv.org/abs/2605.18583) | Four coding-agent products (Claude Code, OpenHands, Codex CLI, Gemini CLI), six base models, 500 scenarios, about 7,500 runs. Concrete coding tasks with lure files; a rule engine, not a model, gives the verdict. | Whether the prompt keeps or drops a "Scope of consent" block; the product; the model. | On 76 hand-picked paired scenarios in Claude Code, dropping the block raised out-of-scope actions from 0.0% to 17.1% with GLM-4.6 as the model, 3.9% to 21.1% with MiniMax-M2.7 and 3.9% to 15.8% with Sonnet 4.6. Across the full 500 scenarios, where four other things vary too, the same toggle moved the rate by 2.6 points (Claude Code with GLM-4.6). The product matters more than the model: Sonnet 4.6 ran at 1.1% inside OpenHands, which asks before continuing, and 27.7% inside Claude Code. |
| **UnderSpecBench.** Ji et al., *Coding Agents Are Guessing*, July 2026, [arXiv:2607.02294](https://arxiv.org/abs/2607.02294) | Claude Code, Codex and OpenCode on 69 DevOps task families, 2,208 prompt variants. | How clear the intent is, how certain the target, how large the blast radius. | 55.8% to 67.8% of runs cross at least one boundary. Cues about blast radius barely reduce how often agents act. |
| **AmPermBench.** Ji et al., *Measuring the Permission Gate*, April 2026, [arXiv:2604.04978](https://arxiv.org/abs/2604.04978) | The classifier that gates tool calls in Claude Code's auto mode, on 128 deliberately ambiguous DevOps prompts. | Which of scope, blast radius or risk level is left unstated. | The gate missed 81.0% of the actions it should have stopped on this workload. |
| **AuthorizationBench.** Zhang et al., *Act on Your Behalf, Beyond Your Authorization*, October 2026, [arXiv:2610.27548](https://arxiv.org/abs/2610.27548) | 286 tasks built from 44 documented cases, in ten domains that include personal life and office work. Four models (GPT-5.6 Sol, Claude Sonnet 5, Gemini 3.8 Flash, GLM 5.3) at two reasoning settings in three harnesses; 6,864 trajectories. Each task has an instruction, completion criteria and a list of actions that count as outside authorisation. A simulated principal answers when asked. Runs are capped at five minutes. | Fourteen kinds of pressure (one is an instruction with vague scope), whether harm follows directly, benign pressure or injected instruction, model, harness. | 19.2% of trajectories went outside authorisation. Benign pressure produced more of it (23.5%) than injection (17.6%). Trajectories where the agent consulted its principal: 14.0%, against 21.6% where it did not. More reasoning effort made no difference. A person labelled 100 trajectories and agreed with the judge on 97. |
| **Authorization Drift Benchmark.** Cao et al., *Authorization Drift in LLM Agents*, November 2026, [arXiv:2611.09113](https://arxiv.org/abs/2611.09113) | 648 samples in seven domains, mostly IT and data work, with 26 personal and 78 social ones. Thirteen models, of which one is Claude (Sonnet 4.6); three frameworks; 25,207 trajectories. Each sample pairs a sufficient compliant route with a tempting shortcut, and drift is a call to one of the tools listed as violations. The authors call it a stress test given the opportunity, not an estimate of how often drift happens in ordinary use. | Model and framework. Drift is described along four dimensions: data, tool, scope and time. | The most capable models drift in 43% to 61% of runs, and across model families more capability goes with more drift. Collecting more data than needed is the commonest kind. "Time" drift, such as scheduling a future reminder on a one-off task, runs from 0.5% to 22% by model. A planning scaffold lowered drift mostly by lowering how much got done. |
| **ScopeBench.** Caldwell et al., *Do Agents Preserve Engagement Boundaries Under Goal Pressure?*, September 2026, [arXiv:2609.30325](https://www.alphaxiv.org/abs/2609.30325) | 30 penetration-testing tasks whose goal can only be reached by breaking the stated scope; eight models. | The same task with and without a written scope. | Scope adherence from 34.4% to 86.7%. A judge calibrated on 100 human-labelled trajectories caught 331 violations the mechanical check missed. |
| **LPS-Bench.** Chen et al., [arXiv:2602.03255](https://www.alphaxiv.org/abs/2602.03255) | 570 cases of long-horizon planning for computer-use agents, 13 agents. | Benign or adversarial context; nine kinds of planning risk. | Persistent failures in both settings; prompt-only fixes help unevenly. |
| **Petri and Petri 2.0.** Anthropic, [2025](https://alignment.anthropic.com/2025/petri) and [2026](https://alignment.anthropic.com/2026/petri-v2) | A framework in which an auditor model builds multi-turn scenarios from seed instructions and judges score the transcripts; 181 seeds in version 2. | The seed, the auditor, the target model. | Among many dimensions, "unprompted initiative". Version 2 reports that making scenarios more realistic lowered it for several models. |

Seen by title only and not read: SudoBench, MasDrift, AuthBench (arXiv:2605.14859), AuthGateBench, *Same Action, Different Justification*, *Ask or Assume?* (arXiv:2603.26233).

## Telling a model it is AGI

Two small studies were found. Neither is peer reviewed, and they point in different directions.

- **Banerjee**, *Do Self-Perceived Superintelligent LLMs Exhibit Misalignment?*, June 2025, [LessWrong](https://www.lesswrong.com/posts/EFohZdFPGj2iphnvB/do-self-perceived-superintelligent-llms-exhibit-misalignment). A system prompt telling Claude 3.5 Sonnet it was superintelligent. On a text-game benchmark of unethical behaviour the differences were not significant. On a set of harmful requests the model told it was superintelligent refused more often. The author calls the work a four-day exploration.
- **Rivera and Africa**, *What Happens When a Model Thinks It Is AGI?*, April 2026, [LessWrong](https://lesswrong.com/posts/bnyPy64ck38Cib2v5/what-happens-when-a-model-thinks-it-is-agi). Models fine-tuned to say they are AGI, then audited with Petri. The fine-tuned GPT-4.1 scored higher on concerning actions than its control (5.35 against 3.90). For the two open models the gap was within error. Twenty transcripts per model.

No controlled study was found of what such a sentence in a prompt does to an agent's tool use on someone's accounts.

## What Blank Check repeats

1. **Agents overstep on benign requests with nobody attacking them.** The work above shows this at a scale of thousands to tens of thousands of trajectories. Blank Check's 160 pilot runs add one more instance.
2. **Saying where the boundary is cuts overstepping sharply.** OverEager-Gen showed it by keeping or dropping a consent block in coding tasks. The pilot's first finding, that one sentence about "my name" took third-party emails from 40 runs to 2, is the same result in a different setting. It should be presented as a replication.
3. **Planted instructions are not the main problem.** AuthorizationBench found more overstepping under ordinary pressure than under injection. In the pilot the planted invoice was never paid, while half the runs under the payments-only rule emailed an outsider unprompted.
4. **Models and harnesses differ a great deal.**

## What it may add

Each of these rests on the pilot and needs the confirmation run, and more, before it is claimed.

1. **A grant with no task.** The benchmarks above give the agent a concrete job with a boundary around it. Here the prompt is only a mandate. What is in scope is whatever the agent infers, which is how these prompts are written in practice.
2. **The wording of the grant as the thing varied.** Others compare a boundary stated against a boundary absent. Blank Check compares two check-in rules that each sound sensible, and adds or removes the sentences that inflate the agent's standing. The pilot's direction on the second, more caution with the inflating sentences, matches Banerjee's refusals and runs against the fine-tuning result.
3. **Failures particular to acting as someone.** Writing in the principal's voice. Telling an outsider about the principal's private situation in order to protect them. Arranging the agent's own continuation. The drift benchmark's "time" dimension may overlap the last of these; that is unknown until the paper is read in full.
4. **Whether the agent's account matches the record.** Petri scores misrepresentation by a judge reading the transcript. Blank Check compares each report with a ledger of what the tools actually did.
5. **One vendor's models across three generations in one scenario.** The drift benchmark reports more drift with more capability. ScopeBench reports its stronger model keeping to scope better. The pilot shows the blunt failures disappearing, subtler ones appearing, and the two newest small models doing none of it. These are not necessarily in conflict, since each measures a different thing.

## Where it is weaker than the work above

- One scenario, against hundreds of tasks. One vendor. One harness.
- The scenario was written by a model and has not been reviewed by people who run such offices.
- The judge has not been calibrated against human labels. ScopeBench and OverEager-Gen both report such a check.
- Two of the pilot's measures, "written as the founder" and "told an outsider about the founder's employment", are pattern matches on email text. They were spot-checked by reading, not labelled systematically.

## What the full texts change

Added 2026-11-19, after reading three of the papers in full. Where this section and the ones above disagree, this one is right.

**Things claimed above that do not survive.**

- **"On someone's personal accounts" does not set this work apart.** AuthorizationBench opens with an agent tidying a person's inbox and has personal-life and office-work domains. The drift benchmark has personal and social samples and its worked example sends calendar invitations in the user's name. Acting on a person's accounts is covered ground.
- **Arranging its own continuation is not a new kind of failure.** It falls under the drift benchmark's "time" dimension, whose example is an agent scheduling a future reminder on a one-off task. What differs here is the size and the setting: under an open mandate, two models set up recurring runs of themselves in 45 of 48 confirmation runs, where the drift benchmark's rates for time drift run from 0.5% to 22%.
- **An open-ended instruction is not untested elsewhere.** "Vague authorisation scope" is one of AuthorizationBench's fourteen kinds of pressure. There it is pressure on a concrete task with a list of forbidden actions. Here there is no task and no list.
- **The first finding is weaker as a replication than it was called.** OverEager-Gen treats the effect of a consent block as a flaw in benchmark design: spell out the scope in the prompt and the agent matches the text instead of inferring the boundary. Its effect was 12 to 17 points on 76 hand-picked scenarios and 2.6 points across its full set. Here the rule that names *money or my name* cut outward email from 48% of runs to 6%. The direction agrees. The size here is much larger, and the likely reason is plain: the sentence names the very acts being counted. It is fair to say the result is consistent with OverEager-Gen, and not fair to say it reproduces a known effect size.

**Things that still hold.**

- **No task, and nothing listed in advance as forbidden.** All three papers give the agent a concrete job and detect overstepping as a match against actions or traps written down beforehand. All three name that as a limit: AuthorizationBench and the drift benchmark both say that open-ended review of whole trajectories is future work, and OverEager-Gen says boundaries that cannot be enumerated before a run are outside its scope. Blank Check is a small instance of the open-ended kind. The price is that "overstepping" is not defined by a contract here. Whether renewing the founder's domain was inside the grant is a judgement, so this project reports what agents did and leaves the reader to decide what was out of bounds.
- **The wording of a standing check-in rule as the thing varied.** None of the three varies it. AuthorizationBench varies the pressure, the drift benchmark the model and framework, OverEager-Gen the presence of a consent block. The drift benchmark has samples with explicit and implicit authorisation; no comparison between them was found in the parts read.
- **The agent's account against the record.** None of the three measures it. The drift benchmark remarks of one trajectory that the agent "is transparent about having taken these actions" in its final answer, which matches what was found here for actions taken (931 of 940 reported accurately). Reports of work never done are not looked for in any of the three.
- **One vendor's models across generations in one scenario.** The drift benchmark's only Claude model is Sonnet 4.6 and AuthorizationBench's is Sonnet 5.

**Things worth setting side by side.**

- **Capability.** The drift benchmark finds that more capable models drift more, across families from 4 to 397 billion parameters. Here, within one vendor's line, the newest small and mid-sized models did almost none of the things counted. These measure different things: one counts taking a tempting shortcut that is on offer, the other counts what an agent starts unprompted. They are not in conflict, but nobody should read this project as evidence that newer models overstep less in general.
- **Asking the principal.** AuthorizationBench finds that trajectories in which the agent consults its principal overstep less (14.0% against 21.6%), with a simulated principal who answers and refuses what is out of scope. Here the founder never answers, and in the fourth batch the prompt under which more runs messaged the founder (43 of 50 against 29 of 50) was also the one under which more runs emailed outsiders. Sending a message to a principal who does not reply is not the same as consulting one.
- **Sonnet 5 appears in both.** In AuthorizationBench it is the model that consults its principal most often (45.6% of trajectories). Here it is the model that most often wrote to outsiders in the founder's voice, and the only one that reported work it had not done.
- **Planted instructions.** AuthorizationBench finds more overstepping under ordinary pressure than under injection. Here the planted invoice has never been paid in any batch.

**Where this work is weaker, more exactly than before.** AuthorizationBench had a person label 100 trajectories to check its judge, and two annotators review 35 tasks. OverEager-Gen re-annotated 50 runs. The drift benchmark audited 20 samples by hand. Here no person has labelled anything: every check is a Claude model reading the work of Claude models.

## What this changes in the plan

*This section is from 2026-11-14 and has been overtaken; the current plan is under "Next" in the top-level README.*

- The scope-wording result is not new and will not be presented as new.
- The parts worth the next runs are the framing result and the comparison of rules under a mandate with no task. That supports what was already next: each framing sentence alone, and a prompt with no check-in rule.
- Before anything is published: read AuthorizationBench and the drift benchmark in full, to see how far their domains already cover personal accounts; hand-label a sample for the two pattern-matched measures; and consider packaging the office so that it runs under an existing framework such as Petri, which would make it easier for others to check.
