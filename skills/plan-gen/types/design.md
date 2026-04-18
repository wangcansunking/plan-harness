# type: design

| Field                       | Value                                                        |
|-----------------------------|--------------------------------------------------------------|
| Output filename             | `design.html`                                                |
| Manifest fields             | `designHtml`, `designGeneratedAt`, `designRegeneratedAt`     |
| Required inputs             | `manifest.json`                                              |
| Optional inputs             | `analysis.html` (for codebase-informed design)               |
| Downstream docs             | every other doc type                                         |
| Agent team                  | Architect, PM, Writer                                        |
| Full workflow (read verbatim) | `skills/_deprecated/plan-design/SKILL.md`                  |

## Notes for /plan-gen

- Always allowed as the first type in a run — nothing depends on it upstream.
- When regenerating, the Writer agent should carry forward any prose the user edited into the previous file (preserve intent where possible).
- After writing, set `designGeneratedAt` on first run, `designRegeneratedAt` on subsequent runs.
