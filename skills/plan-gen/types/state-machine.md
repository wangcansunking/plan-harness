# type: state-machine  (alias: `sm`)

<!-- adapted from mattpocock/skills engineering/prototype/SKILL.md (LOGIC branch + 6 rules) -->

| Field                       | Value                                                                  |
|-----------------------------|------------------------------------------------------------------------|
| Output filename             | `state-machine.html` + `state-machine.meta.json` (v2)                  |
| Manifest fields             | `stateMachineHtml`, `stateMachineGeneratedAt`, `metaHashes.state-machine` |
| Hard upstream               | `design`                                                               |
| Downstream                  | `test-spec`, `implementation`                                          |
| Agent team                  | Architect, Writer                                                      |
| Full workflow (legacy)      | `skills/_deprecated/plan-state-machine/SKILL.md`                       |
| Mixins                      | `_grill-mixin`, `_caveman-mixin`, `_html-base`                         |

## Scope

Detailed lifecycle diagrams + ALL corner cases. The "source of truth" for testers and implementers. Design references SMx by id; state-machine owns the full content.

## meta.json schema (v2)

```jsonc
{
  "doc": "state-machine",
  "scenario": "<slug>",
  "generatedAt": "<ISO>",
  "upstream": { "design": "design.html" },
  "stateMachines": [
    {
      "id": "SM1",
      "name": "doc-lifecycle",
      "states": ["absent", "drafting", "grilling", "rendering", "rendered", "stale", "regrilling", "rerendering", "failed"],
      "transitions": [
        { "from": "absent", "to": "drafting", "trigger": "/plan-gen <doc>", "guard": "upstream meta exists" }
      ],
      "diagram": "<mermaid source>"
    }
  ],
  "cornerCases": [
    { "id": "C1", "scenario": "...", "expected": "...", "machine": "SM1" }
  ],
  "invariants": [{ "id": "I1", "statement": "..." }]
}
```

## Prototype LOGIC rules (enforce during Phase B)

1. Capture every legitimate state — not just happy path.
2. Capture every transition — including ERROR / TIMEOUT / CANCEL.
3. Every transition has a trigger AND (optional) guard.
4. Every terminal state has a reason (success / cancel / failure).
5. Identify invariants that hold across ALL states.
6. Explore at least 3 corner cases per machine before declaring done.

## Phase B must-ask fields

1. `stateMachines[].states` — enumerate; user confirms none missing.
2. `cornerCases` — at minimum 3 per machine. Recommend Architect proposes from code reading.
3. `invariants` — what MUST hold true regardless of state.

## Render rules (Phase C)

- §1 Per-machine: mermaid stateDiagram-v2 source + pre-rendered SVG (dual-rail).
- §2 Transitions as a table (from · to · trigger · guard).
- §3 Corner cases as a table (id · scenario · expected · machine).
- §4 Invariants as `<dl>` (id → statement).

## Notes for /plan-gen

- Refuses if `design.meta.json` missing.
- When `--cascade` from `/plan-sync` after design change, re-grill only states/transitions touching changed decisions.

## Task list

Seed TodoWrite at the start of `/plan-gen state-machine`. Tick `in_progress` → `completed` as you go.

1. Phase A · read design.meta.json (stateMachineRefs[] seeds the SMx ids)
2. Phase A · for each SMx draft states[] (incl. error/cancel terminals)
3. Phase A · draft transitions[] with trigger + guard
4. Phase A · draft mermaid stateDiagram-v2 per machine
5. Phase A · draft cornerCases[] (≥3 per machine) per prototype LOGIC rules
6. Phase A · draft invariants[] (cross-state truths)
7. Phase B · grill states[] (enumerate missing)
8. Phase B · grill cornerCases[] coverage
9. Phase B · grill invariants[] for completeness
10. Phase C · render state-machine.html with one mermaid block per SMx + tables
11. Phase C · embed canonical meta script + lint pass + record manifest hash
