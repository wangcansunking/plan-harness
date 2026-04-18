# type: test-report  (alias: `report`)

| Field                       | Value                                                                    |
|-----------------------------|--------------------------------------------------------------------------|
| Output filename             | `test-report.html`                                                       |
| Manifest fields             | `testReportHtml`, `testReportGeneratedAt`, `testReportSummary`           |
| Required inputs             | `manifest.json`, `test-plan.html`                                        |
| Evidence directory          | `plans/<scenario>/.test-evidence/`                                       |
| Agent team                  | Tester (live browser via Playwright MCP), Writer                         |
| Full workflow (read verbatim) | `skills/_deprecated/plan-test-report/SKILL.md`                         |

## Notes for /plan-gen

- **Different from other types** — executes live E2E tests via Playwright MCP; not pure doc generation.
- Every step produces a screenshot (`{id}-step-{N}.png` in `.test-evidence/`).
- Each step is recorded as **Condition / Action / Result**, not free prose.
- After generation, enters an interactive fix-loop: classify failures (dirty-data / code / spec-mismatch / environment), ask user `[f]ix / [s]how / [n]o`, apply fixes, regenerate the report, repeat until all P0 pass or user stops.
- The manifest's `testReportSummary.p0Green` flag lets the dashboard show a status dot.
