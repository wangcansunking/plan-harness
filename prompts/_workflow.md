---
name: _workflow
description: Canonical plan-harness workflow order — every agent reads this to understand which docs feed which
tags: [shared, workflow]
agents: [architect, pm, frontend-dev, backend-dev, tester, writer]
---

# plan-harness — canonical workflow

Every plan-harness run (`/plan-gen`, `/plan-full`, `/plan-sync`) walks this DAG. When you (an agent) are given a doc to produce, look at the edges terminating at that doc to know which upstream files are available as input.

```
analysis  →  design  ┬─►  state-machine  ─────────────────┐
                     │                                      │
                     ├─►  test-plan   ─►  test-cases  ─────┤
                     │                                      │
                     └─►  implementation   ◄────────────────┘
                              │
                              └─►  test-report
```

| Doc | Hard upstream (required) | Soft upstream (optional) | Primary agents |
|---|---|---|---|
| `analysis` | — | — | pm, architect, writer |
| `design` | — | `analysis` | architect, pm, writer |
| `state-machine` | `design` | — | architect, writer |
| `test-plan` | `design` | — | pm, tester, writer |
| `test-cases` | `design`, `test-plan` | — | tester, frontend-dev, writer |
| `implementation` | `design` | `state-machine`, `test-plan`, `test-cases` | all six |
| `test-report` | `test-plan` | `implementation` | tester (live browser), writer |

## Doc purpose (one-liners)

- `analysis` — **problem statement + code-logic reading**: current state (product flow AND control/data flow in the touched code), what we're solving, pain points (business-level + code-level, each with file+line citations), root causes. Describes reality; no solutions.
- `design` — the change we're going to make: architecture, data model, API, UX. Consumes `analysis` as the brief.
- `state-machine` — entity lifecycles extracted from design.
- `test-plan` — E2E scenarios that prove design intent.
- `test-cases` — granular cases expanding each scenario.
- `implementation` — file-level steps to build design.
- `test-report` — live evidence that the implementation matches intent.

## Rules every agent follows

1. **Read your upstreams before proposing content.** If a soft upstream file is present in the scenario dir, read it — don't re-derive its facts from scratch. If a hard upstream is missing, stop and surface the gap.
2. **Never reach across — only down.** `test-plan` may reference `design`, never `implementation`. Writer composes; other agents produce content, not cross-doc narrative.
3. **Regeneration is cascading.** If you are regenerating a doc, assume every downstream doc is now stale. Leave re-generation to `/plan-sync`; just do your one doc well.
4. **When a doc is optional for a downstream, its absence is legal.** `implementation` without `state-machine` is fine — just skip the lifecycle references. Don't fabricate.
5. **`test-report` requires live execution** (Playwright MCP). It's not a pure doc-generation step and cannot be run before code exists in the target repo.
6. **Manifest is the source of truth for timestamps.** Read `<type>GeneratedAt` from `manifest.json` to know which upstream was produced by the current run vs. a prior run.

## Where this is written down

- This file — canonical, agent-facing.
- `skills/plan-gen/SKILL.md` §Step 3 — the scheduler that enforces the DAG.
- `skills/plan-full/SKILL.md` — orchestrator with review checkpoints.
- `skills/plan-sync/SKILL.md` — cascade after upstream edits.
- `README.md` §Canonical workflow — user-facing summary.
- `skills/plan-gen/types/*.md` — per-doc contracts (inputs, outputs, manifest fields).

If any of these disagree, this file wins and the others must be fixed.
