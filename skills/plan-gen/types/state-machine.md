# type: state-machine  (alias: `sm`)

| Field                       | Value                                                        |
|-----------------------------|--------------------------------------------------------------|
| Output filename             | `state-machine.html`                                         |
| Manifest fields             | `stateMachineHtml`, `stateMachineGeneratedAt`                |
| Required inputs             | `manifest.json`, `design.html`                               |
| Downstream docs             | `implementation-plan.html`                                   |
| Agent team                  | Architect, Writer                                            |
| Full workflow (read verbatim) | `skills/_deprecated/plan-state-machine/SKILL.md`           |

## Notes for /plan-gen

- Requires `design.html` to extract entity lifecycle info — refuse if missing.
- Produces inline SVG diagrams; must re-theme with `[data-theme]`.
