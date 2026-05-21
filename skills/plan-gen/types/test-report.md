# type: test-report  (alias: `report`)

<!-- adapted from mattpocock/skills engineering/diagnose/SKILL.md Phase 5-6 checklist -->

| Field                       | Value                                                                  |
|-----------------------------|------------------------------------------------------------------------|
| Output filename             | `test-report.html` + `test-report.meta.json`                           |
| Manifest fields             | `testReportHtml`, `testReportGeneratedAt`, `metaHashes.test-report`, `testReportSummary` |
| Hard upstream               | `test-spec`                                                            |
| Soft upstream               | `implementation` (ties failures back to PRs)                           |
| Evidence directory          | `plan-harness/<scenario>/.test-evidence/`                              |
| Agent team                  | Tester (live browser via Playwright MCP), Writer, Validator            |
| Mixins                      | `_grill-mixin`, `_caveman-mixin`, `_html-base`                         |

## Scope

Live E2E test execution + classified failure list + cleanup checklist. NOT pure doc generation — runs real Playwright sessions.

## meta.json schema

```jsonc
{
  "doc": "test-report",
  "scenario": "<slug>",
  "generatedAt": "<ISO>",
  "upstream": { "test-spec": "test-spec.html", "implementation": "implementation.html" },
  "runs": [
    {
      "scenarioId": "S1",
      "priority": "P0|P1|P2",
      "result": "pass|fail|blocked|skipped",
      "steps": [
        { "n": 1, "condition": "...", "action": "...", "result": "...", "evidence": ".test-evidence/S1-step-1.png" }
      ],
      "failure": null
    }
  ],
  "summary": { "p0Total": 0, "p0Green": 0, "p1Total": 0, "p1Green": 0, "p2Total": 0, "p2Green": 0 },
  "failures": [
    {
      "scenarioId": "S1",
      "classification": "dirty-data|code|spec-mismatch|environment",
      "rootCause": "...",
      "tiesTo": "PR-N",
      "fix": "..."
    }
  ],
  "cleanupChecklist": [
    { "item": "Remove debug logs", "done": false },
    { "item": "Verify no stray test data left in DB", "done": false },
    { "item": "Re-run P0 after fix", "done": false },
    { "item": "Update test-spec if expected behavior shifted", "done": false },
    { "item": "Close fix-loop with green P0", "done": false }
  ]
}
```

## Diagnose Phase 5-6 cleanup checklist (always included)

1. Remove debug logs / print statements.
2. Verify no stray test data left behind.
3. Re-run P0 after each fix.
4. Update `test-spec.meta.json` if expected behavior shifted (and stamp new metaHash).
5. Close the fix-loop only when P0 green AND user confirms.

## Phase B (interactive fix-loop, not classical grill)

Each failure: classify (dirty-data / code / spec-mismatch / environment), ask user `[f]ix / [s]how / [n]o`, apply if fix, re-run, update report.

## Render rules (Phase C)

- §1 Summary scoreboard (P0/P1/P2 green out of total).
- §2 Per-scenario run as a table (step n · condition · action · result · evidence link).
- §3 Failures table (scenario · classification · root cause · ties-to PR · fix).
- §4 Cleanup checklist as `<ul>` with checkboxes (CSS only; manifest tracks state).

## Notes for /plan-gen

- Deferred until at least PR-1..PR-3 land (need real `.test-evidence/`).
- `manifest.testReportSummary.p0Green === p0Total` flips the dashboard status dot to green.
- Each step screenshot saved to `.test-evidence/{scenarioId}-step-{N}.png`.

## Task list

Seed TodoWrite at the start of `/plan-gen test-report`. Tick `in_progress` → `completed` as you go. This type does live execution — phase boundaries differ from grill-style docs.

1. Phase A · read test-spec.meta.json + implementation.meta.json
2. Phase A · launch Playwright MCP browser session
3. Run · execute P0 scenarios; capture step evidence screenshots
4. Run · execute P1 + P2 scenarios; capture evidence
5. Fix loop · classify failures (dirty-data | code | spec-mismatch | environment)
6. Fix loop · per failure ask user [f]ix / [s]how / [n]o; apply + re-run
7. Diagnose Phase 5-6 · verify cleanup checklist (debug logs, stray data, re-run, spec drift, close)
8. Phase A · finalize runs[] + summary counts + failures[]
9. Phase C · render test-report.html (scoreboard + per-scenario tables + failures + checklist)
10. Phase C · embed canonical meta script (byte-equal to `test-report.meta.json`)
11. Phase C · run html-lint on the rendered HTML; on errors retry the writer once, then write `test-report.lint.json` and abort (do NOT proceed to validate)
12. Phase C · run meta-validate (schema + cross-doc refs + HTML semantic coverage); on errors retry the writer once, then write `test-report.validate.json` and abort (do NOT proceed to Validator)
13. Phase C · dispatch Validator agent (`subagent_type: "feature-dev:code-reviewer"`, prompt: `prompts/validator-prompt.md`). On `fail` retry Writer once, then write `test-report.validator.json` and abort
14. Phase C · record manifest hash + `testReportGeneratedAt` + flip dashboard dot (only when lint, validate, AND Validator are all clean)
