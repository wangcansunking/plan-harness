---
name: _workflow
description: Canonical plan-harness workflow order — every agent reads this to understand which docs feed which
tags: [shared, workflow]
agents: [architect, pm, frontend-dev, backend-dev, tester, writer]
---

# plan-harness — canonical workflow

Every plan-harness run (`/plan-gen`, `/plan-full`, `/plan-sync`) walks this DAG. When you (an agent) are given a doc to produce, look at the edges terminating at that doc to know which upstream files are available as input.

```
product  →  analysis  →  design  ┬─►  state-machine  ─┐
                                  ├─►  test-spec  ◄────┤
                                  └─►  implementation ◄┤
                                            └─►  test-report ◄─┘
```

Shared repo assets (`context`, `glossary`, `decisions`) live in `plan-harness/_shared/` and surface to every scenario doc as a header link. They are NOT on the scenario DAG — they're soft inputs only.

| Doc | Hard upstream (required) | Soft upstream (optional) | Primary agents |
|---|---|---|---|
| `product` | — | `_shared/glossary` | pm, writer |
| `analysis` | `product` | `_shared/{context, glossary, decisions}` | architect, pm, writer |
| `design` | `analysis` | `state-machine` (own prior) | architect, pm, writer |
| `state-machine` | `design` | — | architect, writer |
| `test-spec` | `design` | `state-machine` | pm, tester, writer |
| `implementation` | `design` | `state-machine`, `test-spec` | all six |
| `test-report` | `test-spec` | `implementation` | tester (live browser), writer |

Shared assets:

| Doc | Output path | Primary agents |
|---|---|---|
| `context` | `_shared/context/overview.{meta.json,html}` (or `src-<area>/` for monorepo) | architect, writer |
| `glossary` | `_shared/glossary/glossary.{meta.json,html}` | architect (curator), writer |
| `decisions` | `_shared/decisions/<NNNN>-<slug>.{meta.json,html}` + `index.html` | architect, writer |

## Doc purpose (one-liners)

- `product` — PRD: problem, solution shape, user stories, out-of-scope. PM lens.
- `analysis` — problem statement + code-logic reading: current state (control/data flow in touched code), pain points (with file+line citations), ranked falsifiable root-cause hypotheses. Describes reality; no solutions.
- `design` — the change to make: architecture, data model, API, UX. Consumes `analysis` as brief; state-machine details live in their own doc.
- `state-machine` — entity lifecycles + corner cases extracted from design. Truth source for test-spec/impl.
- `test-spec` — E2E scenarios + acceptance criteria + vertical slices. Replaces v1 `test-plan` + `test-cases`.
- `implementation` — PR plan: one vertical slice = one PR; files, steps, blockers, release label, risks. AFK or HITL per slice.
- `test-report` — live evidence (Playwright runs) that implementation matches spec. Classified failures + cleanup checklist.

Shared assets:

- `context` — current code architecture: control/data flow, module map, key files. Updated when code shape changes, not per scenario.
- `glossary` — domain language: term definitions, relationships, flagged ambiguities. Opinionated.
- `decisions` — ADR list, sequential. Three-gate threshold: hard to reverse + surprising + real trade-off.

## Rules every agent follows

1. **Read your upstreams before proposing content.** If a soft upstream file is present in the scenario dir, read it — don't re-derive its facts from scratch. If a hard upstream is missing, stop and surface the gap.
2. **Never reach across — only down.** `test-spec` may reference `design`, never `implementation`. Writer composes; other agents produce content, not cross-doc narrative.
3. **Regeneration is cascading.** If you are regenerating a doc, assume every downstream doc is now stale. Leave re-generation to `/plan-sync`; just do your one doc well.
4. **When a doc is optional for a downstream, its absence is legal.** `implementation` without `state-machine` is fine — just skip the lifecycle references. Don't fabricate.
5. **`test-report` requires live execution** (Playwright MCP). It's not a pure doc-generation step and cannot be run before code exists in the target repo.
6. **Meta is the source of truth.** Every doc has `<doc>.meta.json`; HTML re-embeds it byte-for-byte via `<script id="meta">`. Downstream reads structured meta, never parses HTML prose. `manifest.metaHashes[<doc>]` drives cascade detection.
7. **Three-phase generation.** Phase A drafts meta silently from upstream + code. Phase B grills the user one field at a time. Phase C renders the HTML view. `--no-grill` skips Phase B.
8. **Shared assets surface via header link, not DAG edge.** When their hash changes, downstream scenarios are flagged ⚠ on dashboards but NOT auto-cascaded.

## Where this is written down

- This file — canonical, agent-facing.
- `skills/plan-gen/SKILL.md` §Step 3 — the scheduler that enforces the DAG.
- `skills/plan-full/SKILL.md` — orchestrator with review checkpoints.
- `skills/plan-sync/SKILL.md` — cascade after upstream edits (hash diff + diff-aware grill).
- `README.md` §Canonical workflow — user-facing summary.
- `skills/plan-gen/types/*.md` — per-doc contracts (inputs, outputs, manifest fields, per-doc task list).

If any of these disagree, this file wins and the others must be fixed.
