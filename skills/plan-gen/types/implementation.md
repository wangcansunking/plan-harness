# type: implementation  (alias: `impl`)

<!-- adapted from mattpocock/skills engineering/to-issues/SKILL.md (vertical-slice rules + HITL/AFK + Blocked by) -->

| Field                       | Value                                                                |
|-----------------------------|----------------------------------------------------------------------|
| Output filename             | `implementation.html` + `implementation.meta.json`                   |
| Manifest fields             | `implementationHtml`, `implementationGeneratedAt`, `metaHashes.implementation` |
| Hard upstream               | `design`                                                             |
| Soft upstream               | `state-machine`, `test-spec`                                         |
| Downstream                  | `test-report`                                                        |
| Agent team                  | All seven — Architect, PM, Frontend Dev, Backend Dev, Tester, Writer, Validator |
| Mixins                      | `_grill-mixin`, `_caveman-mixin`, `_html-base`                       |

## Scope

PR plan: 1 vertical slice = 1 PR. Each PR has files, steps, blockers, release label, risks. Verifiable AFK or HITL per slice.

## meta.json schema

```jsonc
{
  "doc": "implementation",
  "scenario": "<slug>",
  "generatedAt": "<ISO>",
  "upstream": { "design": "design.html", "test-spec": "test-spec.html" },
  "prs": [
    {
      "id": "PR-1",
      "title": "...",
      "slice": "VS1",
      "size": "S|M|L",
      "type": "AFK|HITL",
      "blockedBy": [],
      "releaseLabel": "release:patch|minor|major",
      "files": [{ "path": "...", "change": "create|modify|delete", "steps": ["..."] }],
      "risks": [{ "id": "R1", "risk": "...", "mitigation": "..." }],
      "demo": "what to show to validate this PR"
    }
  ]
}
```

## Vertical-slice + tracer-bullet rules

1. Each PR is a thin vertical slice (cuts through every layer needed for that demo).
2. A completed PR is demoable or AFK-verifiable on its own.
3. Many thin PRs > few thick PRs.
4. Prefer AFK over HITL where possible.
5. `blockedBy` only references other PRs in this plan (not external work).

## Phase B must-ask fields

1. `prs[].slice` — confirm 1:1 mapping to `test-spec.verticalSlices`.
2. `prs[].type` — AFK vs HITL (recommend AFK by default; ask why if HITL).
3. `prs[].releaseLabel` — patch/minor/major.
4. `prs[].risks` — what can go wrong; mitigation.

## Render rules (Phase C)

- §1 PR DAG (mermaid graph showing `blockedBy` edges).
- §2 PR summary table (id · title · slice · size · type · release).
- §3 Per-PR detail (h3 per PR):
  - File table (path · change · steps as nested list).
  - Risks table.
  - Demo callout.
- §4 HITL/AFK matrix at the end.

## Notes for /plan-gen

- Most expensive type — dispatches every agent.
- §3 file tables drive the dashboard's PR-progress panel.
- When `--cascade` from `/plan-sync`, re-grill only PRs touching changed design/test-spec slices.

## Task list

Seed TodoWrite at the start of `/plan-gen implementation`. Tick `in_progress` → `completed` as you go.

1. Phase A · read design + state-machine + test-spec meta.json
2. Phase A · seed prs[] from test-spec.verticalSlices (1:1)
3. Phase A · draft per-PR files[] with create/modify/delete + steps
4. Phase A · draft per-PR risks[] + mitigations
5. Phase A · compute blockedBy[] graph + size T-shirt
6. Phase B · grill prs[].slice (confirm 1:1 to verticalSlices)
7. Phase B · grill prs[].type (AFK preferred; justify HITL)
8. Phase B · grill prs[].releaseLabel (patch/minor/major)
9. Phase B · grill prs[].risks + demo
10. Phase C · render implementation.html with mermaid PR DAG + tables
11. Phase C · embed canonical meta script (byte-equal to `implementation.meta.json`)
12. Phase C · run html-lint on the rendered HTML; on errors retry the writer once, then write `implementation.lint.json` and abort (do NOT proceed to validate)
13. Phase C · run meta-validate (schema + cross-doc refs + HTML semantic coverage); on errors retry the writer once, then write `implementation.validate.json` and abort (do NOT proceed to Validator)
14. Phase C · dispatch Validator agent (`subagent_type: "feature-dev:code-reviewer"`, prompt: `prompts/validator-prompt.md`). On `fail` retry Writer once, then write `implementation.validator.json` and abort
15. Phase C · record manifest hash + `implementationGeneratedAt` (only when lint, validate, AND Validator are all clean)
