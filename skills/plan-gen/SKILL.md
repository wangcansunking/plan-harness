---
name: plan-gen
description: Unified generator for every plan document — design, state-machine, test-plan, test-cases, implementation, test-report, analysis. Pick one or many types via multi-select UI or pass the type as an argument. Replaces the seven per-type skills with one entry point so users only remember one command.
---

# plan-gen

One command to generate any plan document. Dispatches the right agent team for the chosen type, updates `manifest.json`, and returns a short confirmation. When invoked without an argument, shows a multi-select UI with per-type status (generated / generating / not generated) so the user can pick any subset.

## Types

| Type                      | Aliases          | Output file               | Per-type workflow              |
|---------------------------|------------------|---------------------------|--------------------------------|
| `design`                  | —                | `design.html`             | [types/design.md](types/design.md) |
| `state-machine`           | `sm`             | `state-machine.html`      | [types/state-machine.md](types/state-machine.md) |
| `test-plan`               | `testplan`       | `test-plan.html`          | [types/test-plan.md](types/test-plan.md) |
| `test-cases`              | `testcases`      | `test-cases.html`         | [types/test-cases.md](types/test-cases.md) |
| `implementation`          | `impl`           | `implementation-plan.html`| [types/implementation.md](types/implementation.md) |
| `test-report`             | `report`         | `test-report.html`        | [types/test-report.md](types/test-report.md) |
| `analysis`                | `analyze`        | `analysis.html`           | [types/analysis.md](types/analysis.md) |

The per-type files are short reference stubs. The full agent prompts live in `skills/_deprecated/plan-<old-name>/SKILL.md` (preserved unchanged for history + deep reference). When executing a type, read BOTH files: the stub defines the contract (inputs, outputs, manifest fields), the deprecated file carries the verbatim agent prompts.

## When to Use

- Any time the user wants to generate or regenerate a plan document
- When the user says "generate design", "plan-gen", "generate test plan", "write the implementation plan", "build the test report", "make test cases", "/plan-gen design"
- When the user passes a bare slash command: `/plan-gen` (interactive multi-select) or `/plan-gen <type>` (direct)

## Invocation Forms

| Invocation                              | Behavior                                                                 |
|-----------------------------------------|--------------------------------------------------------------------------|
| `/plan-gen`                             | Show multi-select UI with per-type status; generate every selected type  |
| `/plan-gen <type>`                      | Generate one type directly                                               |
| `/plan-gen <type1> <type2> ...`         | Generate several types in topological order                              |
| `/plan-gen all`                         | Delegate to `/plan-full` for a full workflow pass                        |
| `/plan-gen <type> --scenario <name>`    | Target a named scenario instead of auto-detecting                        |

## Workflow

### Step 1 — Resolve the scenario

1. If `--scenario <name>` was passed, use it.
2. Otherwise, look for `manifest.json` in the cwd or the nearest `plans/<scenario>/` directory.
3. If there's no manifest, tell the user: `"Run /plan-init first to set up the planning context."` — stop.
4. Load the manifest into memory; it's the context bag every per-type workflow reads.

### Step 2 — Decide which types to run

**If the user passed a type argument:**
- Resolve aliases from the table above (`impl` → `implementation`, `sm` → `state-machine`, etc.).
- If the argument is `all`, delegate to the `/plan-full` skill and stop.
- Otherwise, the selected set is just that one type (or the listed types).

**If the user passed nothing** — run the multi-select:

1. Compute status for each of the 7 types:
   - `generated — {timestamp}` if the output file exists AND the manifest has `<type>GeneratedAt`
   - `generating...` if `<type>Generating == true` in the manifest (set while a run is in flight)
   - `not generated` otherwise
2. Call the `AskUserQuestion` tool with TWO multi-select questions to cover all seven types (max 4 options per question). Include the status string in each option's description:
   - Q1 (header: `Upstream + core`, multiSelect: true): `analysis`, `design`, `state-machine`, `test-plan`
   - Q2 (header: `Downstream`, multiSelect: true): `test-cases`, `implementation`, `test-report`
3. Union the selections; if empty, print `"Nothing selected. Stopping."` and stop.

### Step 3 — Order the selected types topologically

Dependency graph (see also `/plan-sync`):

```
analysis  →  design  ┬─►  state-machine  ──────────────────────────┐
                     │                                               │
                     ├─►  test-plan  ─┬─►  test-cases  ─────────────┤
                     │                │                              │
                     │                └──────────────────┐           │
                     │                                   │           │
                     └────────────────────────────────── ┼──► implementation ──► test-report
                                                         │                       ▲
                                                         └───────────────────────┘
```

Required vs. optional edges:

| Doc | Hard (required) upstream | Soft (optional) upstream |
|-----|--------------------------|---------------------------|
| `analysis` | — | — |
| `design` | — | `analysis` |
| `state-machine` | `design` | — |
| `test-plan` | `design` | — |
| `test-cases` | `design`, `test-plan` | — |
| `implementation` | `design` | `state-machine`, `test-plan`, `test-cases` |
| `test-report` | `test-plan` | `implementation` |

Sort the selection so that any upstream type (hard OR soft) runs before its downstream. When a later type's input is being regenerated in the same run, it reads the freshly-written file. When a soft upstream is absent AND not part of the current selection, skip it — the downstream still runs on its hard inputs.

### Step 4 — For each selected type, execute its workflow

For each type in topological order:

1. Open `types/<type>.md` — the contract stub.
2. Open the cited `_deprecated/plan-<old-name>/SKILL.md` — the full agent prompt block.
3. Follow the Steps in the deprecated file verbatim, passing the already-loaded manifest + any freshly-regenerated upstream docs as agent inputs.
4. Before dispatching agents: stamp `manifest.json` with `<type>Generating: true` so a concurrent `/plan-gen` invocation sees the in-progress state.
5. After the Writer agent returns the final HTML, use the `Write` tool to save it to the scenario dir.
6. Update `manifest.json`:
   - Set `<type>Html: "<output-filename>"`
   - Set `<type>GeneratedAt: "<ISO timestamp>"`
   - Clear `<type>Generating`
7. Emit a short per-type confirmation line:
   ```
   [2/4] test-plan.html    generated  (18 scenarios, P0:11 / P1:5 / P2:2)
   ```

If any type fails mid-execution, STOP the run — do not continue downstream with stale or missing inputs. Surface the error and clear `<type>Generating` so retry is clean.

### Step 5 — Final summary

After the last type finishes, print a compact summary:

```
=== plan-gen complete ===

Scenario:     {scenarioName}
Generated:    {n} docs in topological order
Duration:     {mm:ss}

  [Y] analysis.html          (agents: architect, writer)
  [Y] design.html            (agents: architect, pm, writer)
  [Y] state-machine.html     (agents: architect, writer)
  [Y] test-plan.html         (agents: pm, tester, writer)
  [Y] implementation-plan.html (all six agents)

Open the dashboard:
  http://localhost:{port}/scenario/{scenarioName}

Next:
  /plan-gen test-report      Run end-to-end verification
  /plan-sync                 Cascade if you edit any upstream doc
```

## Shared behaviours

All types share these rules, consolidated here so per-type stubs stay tiny:

- **Context**: every agent dispatch passes the loaded `manifest.json` so the scenario description, tech stack, and prior-run timestamps are available.
- **Manifest**: after a successful write, the manifest is the single source of truth for per-doc status. Subsequent `/plan-gen` runs read it.
- **Idempotence**: re-running a type with no upstream change produces an equivalent HTML (whitespace or minor prose drift is OK; structure must be stable).
- **Never delete on failure**: if an agent errors, leave the previous HTML in place. Only the status fields are mutated.
- **Self-contained output**: every generated HTML embeds its CSS + JS inline, per the repo-wide convention in `CLAUDE.md`.

## Error Handling

| Error                                         | Resolution                                                                        |
|-----------------------------------------------|-----------------------------------------------------------------------------------|
| `manifest.json` missing                       | Stop: "Run /plan-init first."                                                     |
| Unknown type argument                         | Show the alias table from §Types and stop                                         |
| Upstream dependency missing (e.g. design gone)| Ask the user whether to generate the upstream first                               |
| Agent dispatch fails                          | Retry once; if still failing, surface the error + restore manifest status         |
| Writer produces malformed HTML                | Strip preamble before `<!doctype>`, re-validate; retry once                       |
| Output file un-writable                       | Surface the fs error + ask the user to free the path                              |
| Prompt template file not found                | Use the inline prompt from the `_deprecated/<old-name>/SKILL.md` file             |

## Cross-Links

| Skill / File               | Relationship                                                                 |
|----------------------------|------------------------------------------------------------------------------|
| `/plan-init`               | Prerequisite — creates the manifest this skill reads                         |
| `/plan-full`               | Orchestrator — calls `/plan-gen` for each type in turn                       |
| `/plan-sync`               | Cascade orchestrator — calls `/plan-gen` for every downstream of an edited doc |
| `/plan-review`             | Post-generation review pass; reads the file this skill writes                |
| `_deprecated/plan-<name>/` | Authoritative agent prompt source for each type (preserved for history)     |
| `manifest.json`            | Read for scenario context; written per-type after each successful run        |

## Migration note

This skill replaces seven individual skills that are still present in `skills/_deprecated/` as reference:
`plan-design`, `plan-state-machine`, `plan-test-plan`, `plan-test-cases`, `plan-implementation`, `plan-test-report`, `plan-analyze`. Users who typed those slash commands before should use `/plan-gen <type>` going forward. Internal orchestrators (`/plan-full`, `/plan-sync`) have been updated to call `/plan-gen`.
