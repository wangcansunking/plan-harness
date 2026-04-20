---
name: plan-sync
description: When an upstream plan doc (design / test-plan / test-cases) changes, cascade-regenerate every downstream doc in topological order and run /plan-gen test-report at the end to verify. Handles edits like "update design §3" or "add a new test case" where the user doesn't want to re-run each skill manually.
---

# plan-sync

Plan docs form a dependency graph. `analysis.html` is the deepest root (an optional input to design). `design.html` is the hard root — `state-machine.html` and `test-plan.html` depend on it, `test-cases.html` depends on test-plan, `implementation-plan.html` depends on the whole upstream set, and `test-report.html` depends on test-plan (with implementation as an optional upstream). When the user edits an upstream doc, every downstream doc is silently out-of-date until they re-run each skill in order.

This skill is the "do the cascade for me" button: detect what changed, list what needs to regenerate, ask for confirmation, run them in topological order, and finish by running `/plan-gen test-report` so the user sees whether the new shape actually works.

## When to Use

- After manually editing `design.html`, `test-plan.html`, `test-cases.html`, or `state-machine.html`
- After `/plan-gen design` re-runs (which already updates `design.html` but leaves downstream stale)
- After accepting a `/plan-review` correction that rewrote an upstream doc
- When the user says "sync the docs", "update everything downstream", "/plan-sync", "重新生成", "cascade update"

## What It Produces

- Every downstream doc is regenerated in-place, preserving the surrounding pipeline
- A final `test-report.html` run so the user sees whether the new spec holds up
- `manifest.json` timestamps refreshed for each regenerated doc
- A one-screen CLI summary showing what changed, what got regenerated, and the test-report verdict

## Dependency Graph

```
analysis.html  (optional upstream of design)
└── design.html
    ├── state-machine.html ─────────────────────┐
    ├── test-plan.html                          │
    │   ├── test-cases.html ────────────────────┤
    │   ├── test-report.html  ← also optional: implementation
    │   └── implementation-plan.html            │
    └── implementation-plan.html ← optional: sm/test-plan/test-cases ┘
```

Topological order (lowest → highest downstream):

1. `analysis.html` (optional root; if user edited it, cascade starts here)
2. `design.html` (hard root; regenerated via `/plan-gen design` if marked dirty)
3. `state-machine.html` (via `/plan-gen state-machine`)
4. `test-plan.html` (via `/plan-gen test-plan`)
5. `test-cases.html` (via `/plan-gen test-cases`)
6. `implementation-plan.html` (via `/plan-gen implementation`)
7. `test-report.html` (via `/plan-gen test-report`, includes fix loop)

## Workflow

### Step 1 — Detect what changed

Inspect the scenario directory using one of these signals (in priority order):

1. **User-stated change** — if the user says "I updated design" or "test-plan §4 changed", take that at face value; treat the named doc as the origin of the cascade.
2. **File mtime vs manifest timestamp** — for each doc, compare the file's `mtime` (from `stat`) to its `{docType}GeneratedAt` field in `manifest.json`. If `mtime > generatedAt`, the file was edited outside the skill → treat it as the cascade origin.
3. **Git status** — if the scenario dir is under git, run `git status plans/<scenario>/` to find modified tracked files.

If more than one origin is detected (e.g. both design and test-plan were edited), take the UPPERMOST one in the topological order and regenerate everything below.

If no change is detected, stop and tell the user: `"No upstream edits detected. Use /plan-gen design or /plan-gen test-plan directly if you want to force a regenerate."`

### Step 2 — Build the regeneration plan

From the detected origin, list every downstream doc per the dependency graph.

Print this to the CLI before doing anything:

```
=== Plan-Sync: cascade from {originDoc} ===

Detected change:
  {originDoc} — mtime 2026-04-18T15:22Z > manifest 2026-04-17T12:03Z
  (Δ 1d 3h)

Will regenerate (topological order):
  1. design.html               (via /plan-gen design, only if analysis was the origin)
  2. state-machine.html        (via /plan-gen state-machine)
  3. test-plan.html            (via /plan-gen test-plan)
  4. test-cases.html           (via /plan-gen test-cases)
  5. implementation-plan.html  (via /plan-gen implementation)
  6. test-report.html          (via /plan-gen test-report, with fix loop)

Proceed? [y]es / [s]kip one or more steps / [n]o
```

If the user picks:
- `y` → execute all steps in order.
- `s` → prompt step-by-step; user confirms or skips each.
- `n` → stop.

### Step 3 — Regenerate in topological order

For each step:

1. Dispatch the corresponding sub-skill using the Skill tool (e.g. `Skill("plan-state-machine")`).
2. The sub-skill reads upstream docs as inputs (per its own SKILL.md).
3. Wait for completion before moving to the next step — downstream skills need upstream output.
4. After each step, print one line:
   ```
   [2/5] test-plan.html      regenerated — 18 scenarios (P0:11, P1:5, P2:2)
   ```
5. If any step fails (agent error, disk error, missing input), STOP and surface the error. Do not silently skip.

### Step 4 — Run `/plan-gen test-report` with the fix loop

As the final step, dispatch `/plan-gen test-report {scenario}` (not `no-ask`). This:

1. Runs every scenario from the newly-regenerated test-plan.html.
2. Produces the updated `test-report.html`.
3. Enters Step 6 of that skill's workflow — the interactive fix loop — so any regression introduced by the regenerate gets caught + triaged.

The Sync skill exits when the inner test-report skill exits.

### Step 5 — Final summary

After the test-report loop resolves, print:

```
=== Plan-Sync complete ===

Origin:      {originDoc}
Regenerated: 5 docs
Test run:    {P}/{T} P0 passed, {N} fixes applied during loop
Duration:    {mm:ss}

Updated manifest.json:
  analysisGeneratedAt     → {ts}  (unchanged unless analysis was the origin)
  designGeneratedAt       → {ts}  (unchanged unless design/analysis was the origin)
  stateMachineGeneratedAt → {ts}
  testPlanGeneratedAt     → {ts}
  testCasesGeneratedAt    → {ts}
  implementationPlanGeneratedAt → {ts}
  testReportGeneratedAt   → {ts}

Open the dashboard to review:
  http://localhost:{port}/scenario/{scenarioName}
```

## Sub-commands

| Invocation                                | Behavior                                                                 |
|-------------------------------------------|--------------------------------------------------------------------------|
| `/plan-sync`                              | Auto-detect origin; ask before cascading                                 |
| `/plan-sync <scenario>`                   | Same, for a specific scenario                                            |
| `/plan-sync <scenario> from:<doc>`        | Force-start cascade from a named doc (skip detection)                    |
| `/plan-sync <scenario> no-test-report`    | Regenerate downstream docs but skip the final test-report + fix loop     |
| `/plan-sync <scenario> dry-run`           | Print the plan without executing anything                                |

## Principles

1. **Never skip the test.** Downstream regeneration without verification leaves the user blind to the real impact. `/plan-gen test-report` at the end is default-on.
2. **Topological, not batch.** Each sub-skill reads the freshly-regenerated upstream; running them in parallel breaks the contract.
3. **Ask once, then flow.** One confirmation before starting; don't re-prompt between every step (unless the user picked `s` / skip-some mode).
4. **Fail loud.** If step 3 fails, stop — do not continue downstream with stale inputs. The user needs the upstream fixed first.
5. **No implicit edits.** This skill doesn't rewrite the upstream doc; it only cascades changes the user already made. If the upstream isn't what the user wanted, they should re-run `/plan-gen design` / `/plan-gen test-plan` directly.

## Error Handling

| Error                                           | Resolution                                                           |
|-------------------------------------------------|----------------------------------------------------------------------|
| `manifest.json` missing                         | Stop: "Run /plan-init first."                                        |
| Origin doc missing                              | Stop: tell user to run `/plan-{origin}` first to create it           |
| Sub-skill not yet invocable in current session  | Tell user to invoke it manually, wait for confirmation, resume       |
| Downstream sub-skill fails                      | Stop at that step, surface the error + file-level diagnostic         |
| Test-report fix-loop hits its own stop condition| Exit gracefully, record the remaining failures in the final summary  |

## Cross-Links

| Document / Skill                | Relationship                                                      |
|---------------------------------|-------------------------------------------------------------------|
| `/plan-gen design`                  | Possible origin; not triggered by this skill (user owns design changes) |
| `/plan-gen state-machine`, `/plan-gen test-plan`, `/plan-gen test-cases`, `/plan-gen implementation` | Invoked in order as the cascade body |
| `/plan-gen test-report`             | Always runs last (with fix loop) unless `no-test-report` flag set |
| `manifest.json`                 | Read for timestamps, written after each sub-skill completes       |
