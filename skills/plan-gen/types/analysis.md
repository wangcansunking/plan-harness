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

`analysis.html` is the **problem statement + code-logic reading** for the whole planning run. It frames *why* we're about to design anything AND what the relevant code actually does today. The design doc answers "what are we going to build"; the analysis doc answers "what's broken in the code and the world, and why it needs fixing."

Analysis must cover both sides:

- **Outside-in (PM):** user / business / product-level pain — what hurts, who it hurts, how urgent.
- **Inside-out (Architect):** the actual code paths this plan is going to touch — control flow, data flow, coupling, the subtle bugs and anti-patterns hiding in those paths.

If either side is missing the analysis is not done. A problem statement with no code reading is hand-waving; a code walk with no problem framing is a tour.

## Required sections

The Writer must produce these sections in order. Each section is grounded in the Architect's codebase walk + the PM's problem framing.

1. **Current state (现状)** — what exists today. Cover two layers:
   - *Product / flow:* the user-visible behaviour, the sequence of screens / API calls / events the plan will touch.
   - *Code logic:* for each relevant module, the control flow + data flow as it is actually written. Cite files and functions (`path/to/file.ts:42`). Inline SVG flow / sequence / component diagrams are welcome here — they're the cheapest way to show what the code does.
2. **Problem to solve (要解决的问题)** — the single sentence the rest of the plan hangs off. One paragraph on the goal the team has been given; one on the success criterion.
3. **Observed pain points (当前问题)** — concrete, specific issues. Mix business-level and code-level:
   - *Business-level:* latency numbers, bug incidents, user complaints, broken conventions, abandonment.
   - *Code-level:* bugs the Architect found while reading (race conditions, missing nil checks, silent failures, dead paths, N+1 queries, leaky abstractions, duplicated logic, outdated comments that now lie). Each must cite the file + line.
   Each pain point gets an ID (`P1`, `P2`, …) that later docs can reference.
4. **Root causes (原因)** — for each pain point (or grouped cluster), the cause underneath it. Causes live at one of these layers — call out which:
   - *Logic:* the code literally does the wrong thing (off-by-one, wrong condition).
   - *Abstraction:* missing / wrong boundary; responsibilities leak across modules.
   - *Architecture:* system shape forces every feature to swim upstream.
   - *External:* dependency, platform, or data source imposes the limitation.
   - *Historical:* accreted over time; no single decision, just drift.
   Writer must tie every pain point to at least one cause at at least one layer.
5. **Impact + urgency** — who is affected, how often, severity (blocking / degrading / cosmetic), any time pressure (deadline, regression trend).
6. **Constraints** (optional but recommended) — what the plan is allowed / not allowed to touch. Hard dependencies, compatibility, regulatory.

No "solutions" in analysis — those belong in `design.html`. The rule: analysis describes reality (including the reality of the code); design describes the change.

## Notes for /plan-gen

- Can run without a scenario (just a repo path) — in that case, skip the manifest and write to `plans/.analysis/<repoName>-analysis.html`.
- Agent team: PM frames the problem + writes §2/§3 business side / §5; Architect reads the actual code paths, writes §1 code-logic / §3 code-level pain points / §4; Writer assembles.
- The Architect should cite specific files+lines in §1, §3, §4. Vague prose ("the sync layer has issues") is not an analysis finding — "`sync/worker.ts:128` swallows `ECONNRESET` and returns `null`, which the caller treats as empty data" is.
- When the user adds new facts after analysis is generated, re-run `/plan-gen analysis` — do not let design drift ahead of an outdated problem statement.
