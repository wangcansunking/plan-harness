# type: design

| Field                       | Value                                                        |
|-----------------------------|--------------------------------------------------------------|
| Output filename             | `design.html` + `design.meta.json` (v2)                      |
| Manifest fields             | `designHtml`, `designGeneratedAt`, `metaHashes.design`       |
| Hard upstream               | `analysis`                                                   |
| Soft upstream               | `state-machine` (self; for cross-reference only)             |
| Downstream                  | `state-machine`, `test-spec`, `implementation`               |
| Agent team                  | Architect (lead), PM, Writer                                 |
| Full workflow (legacy)      | `skills/_deprecated/plan-design/SKILL.md`                    |
| Mixins                      | `_grill-mixin`, `_caveman-mixin`, `_html-base`               |

## Scope

WHAT we're going to build. Concise skeleton. State-machine details live in `state-machine.html` — don't duplicate them here.

## meta.json schema (v2)

```jsonc
{
  "doc": "design",
  "scenario": "<slug>",
  "generatedAt": "<ISO>",
  "upstream": { "analysis": "analysis.html" },
  "goals":         ["..."],
  "fileLayout":    "<tree-as-text or mermaid>",
  "componentDag":  "<mermaid source>",
  "decisions":     [{ "id": "D1", "title": "...", "summary": "...", "tradeOff": "..." }],
  "interfaces":    [{ "name": "...", "kind": "fn|class|http|cli|mcp", "signature": "...", "where": "path" }],
  "stateMachineRefs": [{ "id": "SM1", "name": "...", "lives": "state-machine.html#SM1" }],
  "implementationDecisions": ["..."],
  "knownDefects":  [{ "id": "K1", "summary": "...", "where": "path:line", "fixIn": "PR-N" }]
}
```

## Required sections

1. Goals.
2. File layout (tree or component graph).
3. Component DAG.
4. Key decisions — D1..Dn, each with summary + trade-off.
5. Interface contracts (signatures only — no impl bodies).
6. State machine references — link to `state-machine.html#SMx`, do NOT duplicate the full diagram.
7. Implementation decisions (from to-prd "Implementation Decisions" — modules, schemas, APIs).
8. Known defects (if any) — K1..Kn with `fixIn` PR mapping.

## Phase B must-ask fields

1. `goals` — confirm the design scope (rule out scope creep).
2. `decisions[].tradeOff` — the rejected alternative + why rejected.
3. `interfaces` — Architect proposes from analysis; user confirms shape.
4. `knownDefects` — surface v1 bugs found during analysis.

## Render rules (Phase C)

- §1 Goals as bullet list.
- §2 File layout as `<pre>` tree.
- §3 Component DAG as `<pre class="mermaid">` or inline SVG.
- §4 Decisions as a table (id · title · summary · tradeOff).
- §5 Interfaces as table (name · kind · signature · where).
- §6 State machine refs as `<dl>` (id → link).
- §7 Implementation decisions as bullet list.
- §8 Known defects table.
- Follow `_caveman-mixin` render priority.

## Notes for /plan-gen

- `state-machine` and `design` cross-reference: design lists SMx by id; state-machine doc owns the full diagrams + corner cases.
- When user edits `design.meta.json`, `/plan-sync` re-grills only changed sections of downstream docs.

## Task list

Seed TodoWrite at the start of `/plan-gen design`. Tick `in_progress` → `completed` as you go.

1. Phase A · read analysis.meta.json + repo context
2. Phase A · draft goals + fileLayout + componentDag
3. Phase A · draft interfaces[] from analysis findings
4. Phase A · draft decisions[] with trade-offs
5. Phase A · enumerate stateMachineRefs[] (placeholder ids; details defer to state-machine doc)
6. Phase B · grill goals (scope rule-out)
7. Phase B · grill decisions[].tradeOff
8. Phase B · grill interfaces[] shape with user
9. Phase B · grill knownDefects[] surfacing v1 bugs
10. Phase C · render design.html (mermaid componentDag + tables)
11. Phase C · embed canonical meta script + lint pass + record manifest hash
