# type: test-plan  (alias: `testplan`)

| Field                       | Value                                                        |
|-----------------------------|--------------------------------------------------------------|
| Output filename             | `test-plan.html`                                             |
| Manifest fields             | `testPlanHtml`, `testPlanGeneratedAt`                        |
| Required inputs             | `manifest.json`, `design.html`                               |
| Downstream docs             | `test-cases.html`, `test-report.html`, `implementation-plan.html` |
| Agent team                  | PM, Tester, Writer                                           |
| Full workflow (read verbatim) | `skills/_deprecated/plan-test-plan/SKILL.md`               |

## Notes for /plan-gen

- Every P0 + P1 scenario must carry an inline SVG diagram (per `prompts/tester-prompt.md`).
- Checklist items in §4 become TODOs in the dashboard's sidebar panel.
