# type: state-machine  (alias: `sm`)

<!-- adapted from mattpocock/skills engineering/prototype/SKILL.md (LOGIC branch + 6 rules) -->

| Field                       | Value                                                                  |
|-----------------------------|------------------------------------------------------------------------|
| Output filename             | `state-machine.html` + `state-machine.meta.json`                       |
| Manifest fields             | `stateMachineHtml`, `stateMachineGeneratedAt`, `metaHashes.state-machine` |
| Hard upstream               | `design`, `product` (for `userStories[]` → `perStoryFlows[]` mapping)  |
| Downstream                  | `test-spec`, `implementation`                                          |
| Agent team                  | Architect, Writer, Validator                                           |
| Mixins                      | `_grill-mixin`, `_caveman-mixin`, `_html-base`                         |

## Scope

Detailed lifecycle diagrams + ALL corner cases. The "source of truth" for testers and implementers. Design references SMx by id; state-machine owns the full content.

## meta.json schema

```jsonc
{
  "doc": "state-machine",
  "scenario": "<slug>",
  "generatedAt": "<ISO>",
  "upstream": { "design": "design.html", "product": "product.html" },
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
  "perStoryFlows": [
    // REQUIRED — one entry per product.userStories[]. Shows the sequence of
    // states + transitions that story walks through. Pulled from product.meta.json
    // via the design.userFlows[] bridge.
    {
      "storyId": "US1",                        // matches product.userStories[].id
      "title": "First-run /plan-init",         // copied from the story
      "machine": "SM1",                        // which state-machine drives it
      "path": ["absent", "drafting", "grilling", "rendered"],
      "diagram": "<mermaid sequence/state-with-highlight source>",
      "uiMockup": "<inline SVG of key UI state(s) when this story involves UI; omit for pure-CLI/library work>"
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
2. `perStoryFlows[]` — REQUIRED. One per `product.userStories[]`. Confirm the state path each story walks. If a story has a UI surface, confirm whether to attach `uiMockup` (recommended — makes the state change concrete).
3. `cornerCases` — at minimum 3 per machine. Recommend Architect proposes from code reading.
4. `invariants` — what MUST hold true regardless of state.

## Render rules (Phase C)

- §1 Per-machine: `<pre class="mermaid">stateDiagram-v2 ...</pre>` is the source of truth and what gets rendered in the browser. Inline SVG is **aspirational but not required** — there is no mermaid-to-SVG converter shipped in Phase C, and writers without one default to mermaid. Lint enforces "first-class diagram present"; it does NOT enforce SVG-only for state machines.
- §2 Transitions as a table (from · to · trigger · guard).
- §3 **Per-story flows — REQUIRED.** One subsection per `perStoryFlows[]` entry (h3: "US1 — First-run /plan-init"). Each renders: (a) the state-path mermaid with the story's path highlighted (or a sequence diagram if multi-machine), (b) `uiMockup` inline SVG when present. Stories without UI still get the state-path diagram. Lint enforces: `perStoryFlows.length === product.userStories.length` AND every `perStoryFlows[].diagram` produces a first-class visual.
- §4 Corner cases as a table (id · scenario · expected · machine).
- §5 Invariants as `<dl>` (id → statement).

## Notes for /plan-gen

- Refuses if `design.meta.json` missing.
- When `--cascade` from `/plan-sync` after design change, re-grill only states/transitions touching changed decisions.

## Task list

Seed TodoWrite at the start of `/plan-gen state-machine`. Tick `in_progress` → `completed` as you go.

1. Phase A · read design.meta.json (stateMachineRefs[] seeds the SMx ids) + product.meta.json (userStories[] seeds perStoryFlows[])
2. Phase A · for each SMx draft states[] (incl. error/cancel terminals)
3. Phase A · draft transitions[] with trigger + guard
4. Phase A · draft mermaid stateDiagram-v2 per machine
5. Phase A · draft perStoryFlows[] — one entry per product.userStories[]; compute the state path each story walks; attach uiMockup SVG when the story has a UI surface
6. Phase A · draft cornerCases[] (≥3 per machine) per prototype LOGIC rules
7. Phase A · draft invariants[] (cross-state truths)
8. Phase B · grill states[] (enumerate missing)
9. Phase B · grill perStoryFlows[] paths + uiMockup coverage (one per story)
10. Phase B · grill cornerCases[] coverage
11. Phase B · grill invariants[] for completeness
12. Phase C · render state-machine.html with one mermaid block per SMx + per-story flow subsections + tables
13. Phase C · embed canonical meta script (byte-equal to `state-machine.meta.json`)
14. Phase C · run html-lint on the rendered HTML; on errors retry the writer once, then write `state-machine.lint.json` and abort (do NOT proceed to validate)
15. Phase C · run meta-validate (schema + cross-doc refs + HTML semantic coverage); on errors retry the writer once, then write `state-machine.validate.json` and abort (do NOT proceed to Validator)
16. Phase C · dispatch Validator agent (`subagent_type: "feature-dev:code-reviewer"`, prompt: `prompts/validator-prompt.md`). On `fail` retry Writer once, then write `state-machine.validator.json` and abort
17. Phase C · record manifest hash + `stateMachineGeneratedAt` (only when lint, validate, AND Validator are all clean)
