# type: test-cases  (alias: `testcases`)

| Field                       | Value                                                        |
|-----------------------------|--------------------------------------------------------------|
| Output filename             | `test-cases.html`                                            |
| Manifest fields             | `testCasesHtml`, `testCasesGeneratedAt`                      |
| Required inputs             | `manifest.json`, `design.html`, `test-plan.html`             |
| Downstream docs             | `implementation-plan.html`                                   |
| Agent team                  | Tester, Frontend Dev, Writer                                 |
| Full workflow (read verbatim) | `skills/_deprecated/plan-test-cases/SKILL.md`              |

## Notes for /plan-gen

- Ships an interactive harness UI — Frontend Dev agent designs it.
- Test cases are more granular than test-plan scenarios; see `prompts/tester-prompt.md` §3.
