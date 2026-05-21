# type: test-spec  (alias: `testspec`)

<!-- adapted from mattpocock/skills engineering/to-issues/SKILL.md (vertical slice rules + AC format) -->

| Field                       | Value                                                          |
|-----------------------------|----------------------------------------------------------------|
| Output filename             | `test-spec.html` + `test-spec.meta.json`                       |
| Manifest fields             | `testSpecHtml`, `testSpecGeneratedAt`, `metaHashes.test-spec`  |
| Hard upstream               | `design`                                                       |
| Soft upstream               | `state-machine`                                                |
| Downstream                  | `implementation`, `test-report`                                |
| Agent team                  | Tester (lead), Architect (corner-case sanity), Writer          |
| Replaces                    | v1 `test-plan` + v1 `test-cases` (merged)                      |
| Mixins                      | `_grill-mixin`, `_caveman-mixin`, `_html-base`                 |

## Scope

Acceptance matrix + vertical-slice mapping in one doc. Covers what the system must do (scenarios), how to verify (acceptance criteria), and how to ship (slice → PR).

## meta.json schema

```jsonc
{
  "doc": "test-spec",
  "scenario": "<slug>",
  "generatedAt": "<ISO>",
  "upstream": { "design": "design.html", "state-machine": "state-machine.html" },
  "counts": { "scenarios": 0, "P0": 0, "P1": 0, "P2": 0 },
  "verticalSlices": [
    { "id": "VS1", "name": "...", "covers": ["S1","S2"], "ships": "PR-1", "type": "AFK|HITL", "blockedBy": [] }
  ],
  "scenarios": [
    {
      "id": "S1",
      "priority": "P0|P1|P2",
      "title": "...",
      "given": "...",
      "when": "...",
      "then": "...",
      "ac": ["criterion 1", "criterion 2"],
      "verticalSlice": "VS1"
    }
  ],
  "defectRepro": [
    { "id": "K1", "v1Behavior": "...", "v2Expected": "..." }
  ],
  "nonFunctional": [{ "id": "NF1", "kind": "perf|a11y|security", "requirement": "..." }],
  "fixtures": ["..."],
  "hitlAfkMatrix": [{ "slice": "VS1", "type": "AFK", "reason": "..." }]
}
```

## Phase B must-ask fields

1. `verticalSlices` — break the work into tracer bullets (thin end-to-end slices). Each maps 1:1 to a PR.
2. `scenarios[].priority` — P0 (must), P1 (should), P2 (nice). Recommend P0 by default.
3. `scenarios[].ac` — acceptance criteria as checkbox list (each independently verifiable).
4. `hitlAfkMatrix` — which slices need human-in-the-loop vs run AFK.

## Vertical-slice rules (must enforce)

1. Each slice delivers a narrow but **complete** path through every layer.
2. A completed slice is demoable / verifiable on its own.
3. Prefer many thin slices over few thick ones.
4. Slice ≠ layer. "Add a DB column" is NOT a slice. "User can save a draft and reload it" IS.
5. Prefer AFK over HITL where possible.

## Render rules (Phase C)

- §1 Overview callout (counts: scenarios, P0/P1/P2 split).
- §2 Vertical slices as a table (id, name, covers, ships, type).
- §3 Acceptance matrix as one big table; group by slice if ≥10 scenarios.
- §4 Per-slice scenario detail (h3 per slice).
- §5 Defect repro (if K* defects exist).
- §6 Non-functional.
- §7 Fixtures.
- §8 HITL/AFK matrix.

## Notes for /plan-gen

- `/plan-gen test-spec` reads `design.meta.json`; if `state-machine.meta.json` exists, use its `cornerCases` to seed P1/P2 scenarios.
- When `--cascade` (from `/plan-sync`), only re-grill scenarios touching changed design decisions.

## Task list

Seed TodoWrite at the start of `/plan-gen test-spec`. Tick `in_progress` → `completed` as you go.

1. Phase A · read design.meta.json + state-machine.meta.json (corner cases seed P1/P2)
2. Phase A · draft verticalSlices[] (thin tracer bullets, 1:1 to PR)
3. Phase A · draft scenarios[] with Given/When/Then + AC
4. Phase A · seed defectRepro[] from design.knownDefects[]
5. Phase A · draft nonFunctional[] + fixtures[]
6. Phase A · draft hitlAfkMatrix per slice
7. Phase B · grill verticalSlices[] (vertical-slice rules 1-5)
8. Phase B · grill scenarios[].priority (P0/P1/P2)
9. Phase B · grill scenarios[].ac for independent verifiability
10. Phase B · grill hitlAfkMatrix (prefer AFK)
11. Phase C · render test-spec.html with overview counts + AC matrix
12. Phase C · embed canonical meta script (byte-equal to `test-spec.meta.json`)
13. Phase C · run html-lint on the rendered HTML; on errors retry the writer once, then write `test-spec.lint.json` and abort (do NOT proceed to step 14)
14. Phase C · record manifest hash + `testSpecGeneratedAt` (only when lint is clean)
