# type: analysis  (alias: `analyze`)

| Field                       | Value                                                        |
|-----------------------------|--------------------------------------------------------------|
| Output filename             | `analysis.html`                                              |
| Manifest fields             | `analysisHtml`, `analysisGeneratedAt`                        |
| Required inputs             | `manifest.json`; optional repo path argument                 |
| Downstream docs             | `design.html` (architect reads it when available)            |
| Agent team                  | Architect, Writer                                            |
| Full workflow (read verbatim) | `skills/_deprecated/plan-analyze/SKILL.md`                 |

## Notes for /plan-gen

- Produces a deep codebase analysis: architecture, patterns, conventions, tech stack, code health.
- Can run without a scenario (just a repo path) — in that case, skip the manifest and write to `plans/.analysis/<repoName>-analysis.html`.
