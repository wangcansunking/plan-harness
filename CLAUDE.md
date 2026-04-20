# plan-harness — contributor rules for Claude Code

## Canonical workflow

`analysis → design → {state-machine, test-plan → test-cases} → implementation → test-report`

See [prompts/_workflow.md](prompts/_workflow.md) for the authoritative DAG + per-doc agent team. If you touch anything that implies a different order (dep graphs, ASCII pipelines, READMEs, skill orchestration), update that file first — every other doc in this repo must agree with it.

## Where workflow order lives (keep in sync)

| File | What it encodes |
|---|---|
| `prompts/_workflow.md` | Authoritative — every agent reads this |
| `skills/plan-gen/SKILL.md` §Step 3 | Topological sorter for `/plan-gen <subset>` |
| `skills/plan-full/SKILL.md` | 9-phase orchestrator with user checkpoints |
| `skills/plan-sync/SKILL.md` | Cascade graph after upstream edits |
| `skills/plan-gen/types/<doc>.md` | Per-doc contract (required + optional inputs, manifest fields, agent team) |
| `README.md` §Canonical workflow | User-facing summary |
| `README.zh.md` §标准工作流 | Same, in Chinese |

## Release discipline

User-visible changes must bump both the plugin version and the matching marketplace entry in lockstep — see [../CLAUDE.md](../CLAUDE.md) (workspace-level contributor rules) for the auto-bump labels (`release:patch` / `release:minor` / `release:major`) and the PR-author `## Changelog` block contract.

## Test repo

A throwaway test scenario for this plugin lives at `~/test-repos/test-plan-harness/` — safe to `/plan-init` and iterate against; don't commit anything there back into this repo.

## Build / sync

```bash
cd local-proxy
npm install
npm run dev    # esbuild → dist/, then sync to Claude Code plugin cache
```

The plugin cache is the live runtime. `dist/index.js` is committed so `claude plugin install` works straight from the repo without a build step.
