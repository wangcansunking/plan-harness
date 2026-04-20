# type: analysis  (alias: `analyze`)

| Field                       | Value                                                        |
|-----------------------------|--------------------------------------------------------------|
| Output filename             | `analysis.html`                                              |
| Manifest fields             | `analysisHtml`, `analysisGeneratedAt`                        |
| Required inputs             | `manifest.json`; optional repo path argument                 |
| Downstream docs             | `design.html` (architect reads it as the problem statement)  |
| Agent team                  | PM, Architect, Writer                                        |
| Full workflow (read verbatim) | `skills/_deprecated/plan-analyze/SKILL.md`                 |

## Scope — what analysis is for

`analysis.html` is the **problem statement** for the whole planning run. It frames *why* we're about to design anything. The design doc answers "what are we going to build"; the analysis doc answers "what's broken today and why it needs fixing."

## Required sections

The Writer must produce these sections in order. Each section is grounded in the Architect's codebase walk + the PM's problem framing.

1. **Current state (现状)** — what exists today, how it works, the relevant parts of the code/product/flow that this plan is going to touch. Architecture snippets + SVG only where they clarify the problem, not as a general tour.
2. **Problem to solve (要解决的问题)** — the single sentence the rest of the plan hangs off. One paragraph on the goal the team has been given; one on the success criterion.
3. **Observed pain points (当前问题)** — concrete, specific issues: latency numbers, bug incidents, user complaints, broken conventions, dead code paths. Each pain point gets an ID (`P1`, `P2`, …) that later docs can reference.
4. **Root causes (原因)** — for each pain point (or grouped cluster), the cause underneath it — architectural choice, missing abstraction, external dependency, historical accident. Writer must tie every pain point to at least one cause.
5. **Impact + urgency** — who is affected, how often, severity (blocking / degrading / cosmetic), any time pressure (deadline, regression trend).
6. **Constraints** (optional but recommended) — what the plan is allowed / not allowed to touch. Hard dependencies, compatibility, regulatory.

No "solutions" in analysis — those belong in `design.html`. The rule: analysis describes reality; design describes the change.

## Notes for /plan-gen

- Can run without a scenario (just a repo path) — in that case, skip the manifest and write to `plans/.analysis/<repoName>-analysis.html`.
- Agent team: PM frames the problem + writes §2/§3/§5; Architect grounds §1/§4 in the codebase; Writer assembles.
- When the user adds new facts after analysis is generated, re-run `/plan-gen analysis` — do not let design drift ahead of an outdated problem statement.
