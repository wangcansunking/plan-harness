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
  "componentDag":  "<svg preferred; mermaid accepted>",
  "uxMockups":     [{ "id": "UX1", "title": "...", "visual": "<svg preferred; mermaid accepted>", "appliesWhen": "..." }],
  "userFlows":     [{ "id": "UF1", "title": "...", "visual": "<svg preferred; mermaid accepted>", "steps": ["..."] }],
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
4. **UX mockups — REQUIRED on every design** (no exceptions). For UI work: screen/modal/form sketches. For CLI tools: a terminal-output sketch. For library/backend code: an API-shape sketch showing what callers see. The point: every design has a user-facing surface and that surface gets a first-class visual.
5. **User-flow / workflow — REQUIRED on every design** (no exceptions). For UI work: screen-to-screen flow. For CLI tools: command sequence. For libraries: call sequence. Lint `L3-ux-visuals` fires unconditionally for design docs.
6. Key decisions — D1..Dn, each with summary + trade-off.
7. Interface contracts (signatures only — no impl bodies).
8. State machine references — link to `state-machine.html#SMx`, do NOT duplicate the full diagram.
9. Implementation decisions (from to-prd "Implementation Decisions" — modules, schemas, APIs).
10. Known defects (if any) — K1..Kn with `fixIn` PR mapping.

## Phase B must-ask fields

1. `goals` — confirm the design scope (rule out scope creep).
2. `decisions[].tradeOff` — the rejected alternative + why rejected.
3. `uxMockups` — REQUIRED. Confirm at least one mockup; for non-UI tools, agree on the form (terminal/API sketch) before drafting.
4. `userFlows` — REQUIRED. Confirm at least one workflow visual; for non-UI tools, agree on the form (command/API sequence) before drafting.
5. `interfaces` — Architect proposes from analysis; user confirms shape.
6. `knownDefects` — surface v1 bugs found during analysis.

## Render rules (Phase C)

- Diagrams are first-class and carry the main content; prose supports diagrams, not the reverse.
- Visual priority is strict: inline SVG first, Mermaid second, table last. A table cannot replace a required diagram.
- §1 Goals as bullet list.
- §2 File layout as `<pre>` tree unless an SVG/mermaid layout is clearer.
- §3 Component DAG as inline SVG preferred, `<pre class="mermaid">` accepted.
- §4 UX mockups as inline SVG preferred, Mermaid accepted. **Required on every design** — terminal sketch / API sketch counts for non-UI work.
- §5 User flows / workflows as inline SVG preferred, Mermaid accepted. **Required on every design** — command sequence / call sequence counts for non-UI work.
- §6 Decisions as a table (id · title · summary · tradeOff).
- §7 Interfaces as table (name · kind · signature · where).
- §8 State machine refs as `<dl>` (id → link).
- §9 Implementation decisions as bullet list.
- §10 Known defects table.
- Follow `_caveman-mixin` render priority.
- Phase C validation must fail if design/state-machine has no SVG or Mermaid, or if UX scope lacks both mockup and flow visuals.

## Notes for /plan-gen

- `state-machine` and `design` cross-reference: design lists SMx by id; state-machine doc owns the full diagrams + corner cases.
- When user edits `design.meta.json`, `/plan-sync` re-grills only changed sections of downstream docs.

## Task list

Seed TodoWrite at the start of `/plan-gen design`. Tick `in_progress` → `completed` as you go.

1. Phase A · read analysis.meta.json + repo context
2. Phase A · draft goals + fileLayout + componentDag
3. Phase A · draft uxMockups[] + userFlows[] (required — terminal/API sketches count for non-UI tools)
4. Phase A · draft interfaces[] from analysis findings
5. Phase A · draft decisions[] with trade-offs
6. Phase A · enumerate stateMachineRefs[] (placeholder ids; details defer to state-machine doc)
7. Phase B · grill goals (scope rule-out)
8. Phase B · grill UX mockup/flow coverage (required on every design)
9. Phase B · grill decisions[].tradeOff
10. Phase B · grill interfaces[] shape with user
11. Phase B · grill knownDefects[] surfacing v1 bugs
12. Phase C · render design.html (SVG-first diagrams; Mermaid accepted; tables fallback only)
13. Phase C · validate first-class diagrams + UX mockup/flow coverage
14. Phase C · embed canonical meta script (byte-equal to `design.meta.json`)
15. Phase C · run html-lint on the rendered HTML; on errors retry the writer once, then write `design.lint.json` and abort (do NOT proceed to step 16)
16. Phase C · record manifest hash + `designGeneratedAt` (only when lint is clean)
