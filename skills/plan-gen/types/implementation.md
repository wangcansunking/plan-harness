# type: implementation  (alias: `impl`)

| Field                       | Value                                                        |
|-----------------------------|--------------------------------------------------------------|
| Output filename             | `implementation-plan.html`                                   |
| Manifest fields             | `implementationPlanHtml`, `implementationPlanGeneratedAt`    |
| Required inputs             | `manifest.json`, `design.html`                               |
| Optional inputs             | `state-machine.html`, `test-plan.html`, `test-cases.html`    |
| Downstream docs             | `test-report.html`                                           |
| Agent team                  | All six — Architect, PM, Frontend Dev, Backend Dev, Tester, Writer |
| Full workflow (read verbatim) | `skills/_deprecated/plan-implementation/SKILL.md`          |

## Notes for /plan-gen

- Most expensive type — dispatches every agent.
- Step sequencing is phase-driven; §4 cut-over checklist drives the dashboard's TODO panel.
