---
name: plan-gen
description: Unified generator for every plan document — product, analysis, design, state-machine, test-spec, implementation, test-report — plus shared assets (context, glossary, decisions). Pick one or many types via multi-select UI or pass the type as an argument. Replaces the seven per-type skills with one entry point so users only remember one command.
---

# plan-gen

One command to generate any plan document. Dispatches the right agent team for the chosen type, updates `manifest.json`, and returns a short confirmation. When invoked without an argument, shows a multi-select UI with per-type status (generated / generating / not generated) so the user can pick any subset.

## Types

### Scenario docs (v2 — 7 types, written under `plan-harness/<scenario>/`)

| Type                      | Aliases          | Output file                                | Per-type workflow                            |
|---------------------------|------------------|--------------------------------------------|----------------------------------------------|
| `product`                 | `prd`            | `product.{html,meta.json}`                 | [types/product.md](types/product.md)         |
| `analysis`                | `analyze`        | `analysis.{html,meta.json}`                | [types/analysis.md](types/analysis.md)       |
| `design`                  | —                | `design.{html,meta.json}`                  | [types/design.md](types/design.md)           |
| `state-machine`           | `sm`             | `state-machine.{html,meta.json}`           | [types/state-machine.md](types/state-machine.md) |
| `test-spec`               | `testspec`       | `test-spec.{html,meta.json}` (merges v1 test-plan + test-cases) | [types/test-spec.md](types/test-spec.md) |
| `implementation`          | `impl`           | `implementation.{html,meta.json}`          | [types/implementation.md](types/implementation.md) |
| `test-report`             | `report`         | `test-report.{html,meta.json}`             | [types/test-report.md](types/test-report.md) |

### Repo assets (v2 — written under `plan-harness/_shared/`)

| Type        | Output                                              | Per-type workflow                          |
|-------------|-----------------------------------------------------|--------------------------------------------|
| `context`   | `_shared/context/overview.{html,meta.json}`         | [types/context.md](types/context.md)       |
| `glossary`  | `_shared/glossary/glossary.{html,meta.json}`        | [types/glossary.md](types/glossary.md)     |
| `decisions` | `_shared/decisions/<NNNN>-<slug>.{html,meta.json}` + `index.html` | [types/decisions.md](types/decisions.md) |

### Deprecated v1 types (read-only)

`test-plan` and `test-cases` are merged into `test-spec`. Old per-type prompts in `skills/_deprecated/plan-<old-name>/SKILL.md` remain for history. When executing a v2 type, read its `types/<type>.md` stub PLUS any cited legacy prompt — stub defines the v2 contract (meta.json schema, mixins, Phase B fields); legacy carries the verbatim agent prompt for the agent dispatch.

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
2. Otherwise, look for `manifest.json` in this preference order:
   - **v2**: `plan-harness/<scenario>/manifest.json` (preferred)
   - **v1 fallback**: `plans/<scenario>/manifest.json` (legacy; only run new generations if `--allow-v1` is passed)
3. If there's no manifest, tell the user: `"Run /plan-init first to set up the planning context."` — stop.
4. Load the manifest into memory. Check `schemaVersion`:
   - `2` → v2 path; meta.json + hash tracking active.
   - missing or `1` → legacy; only allow `--allow-v1` re-runs; new scenarios MUST be v2.
5. Manifest is the context bag every per-type workflow reads.

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
2. Call the `AskUserQuestion` tool with TWO multi-select questions to cover all 7 scenario types (max 4 options per question). Include the status string in each option's description:
   - Q1 (header: `Upstream + core`, multiSelect: true): `product`, `analysis`, `design`, `state-machine`
   - Q2 (header: `Downstream`, multiSelect: true): `test-spec`, `implementation`, `test-report`
3. Union the selections; if empty, print `"Nothing selected. Stopping."` and stop.

### Step 3 — Order the selected types topologically

v2 dependency graph (see also `/plan-sync`):

```
product → analysis → design ┬─► state-machine ─┐
                             ├─► test-spec ◄────┤
                             └─► implementation ◄┤
                                      └─► test-report ◄─┘
```

Required vs. optional edges (v2):

| Doc              | Hard upstream            | Soft upstream                          |
|------------------|--------------------------|----------------------------------------|
| `product`        | —                        | `_shared/glossary`                     |
| `analysis`       | `product`                | `_shared/{context,glossary,decisions}` |
| `design`         | `analysis`               | —                                      |
| `state-machine`  | `design`                 | —                                      |
| `test-spec`      | `design`                 | `state-machine`                        |
| `implementation` | `design`                 | `state-machine`, `test-spec`           |
| `test-report`    | `test-spec`              | `implementation`                       |

Shared assets (`context`, `glossary`, `decisions`) are not on the scenario DAG — they live in `_shared/` and surface via header link. They have no hard upstream; `/plan-sync` compares their hash separately and shows a ⚠ on scenario dashboards but does NOT auto-cascade.

Sort the selection so that any upstream type (hard OR soft) runs before its downstream. When a later type's input is being regenerated in the same run, it reads the freshly-written file. When a soft upstream is absent AND not part of the current selection, skip it — the downstream still runs on its hard inputs.

### Step 4 — For each selected type, execute its workflow

For each type in topological order:

1. Open `types/<type>.md` — the contract stub (defines meta.json schema, mixins, Phase B must-ask fields, render rules, **§Task list**).
2. **Seed TodoWrite from the type's §Task list section.** Each type file carries an authoritative ordered list of tasks specific to that doc (e.g. design.md tasks differ from test-spec.md tasks). Create one TodoWrite entry per task with status `pending`, then mark each `in_progress` when you start it and `completed` when done. The user watches progress through these — keep the list current.
3. Open the cited legacy `_deprecated/plan-<old-name>/SKILL.md` if any — the full v1 agent prompt block (still useful for verbose agent dispatch).
4. **v2 — three-phase dispatch** (when `schemaVersion === 2`):

   **Phase A — Draft meta (silent)**
   - Read upstream `<upstream>.meta.json` for every hard + soft upstream listed in `types/<type>.md`.
   - Read repo assets when soft-listed: `_shared/context/`, `_shared/glossary/`, `_shared/decisions/`.
   - Dispatch the agent team (per `types/<type>.md`) to populate `<doc>.meta.json` per the type's schema. Fill every field that's derivable from upstream meta or code; leave only judgment calls for Phase B.

   **Phase B — Grill (interactive)**
   - Load `prompts/_grill-mixin.md`.
   - For each "must-ask field" in `types/<type>.md` (in DAG order, parent decisions first):
     - Recommend an answer (cite upstream meta or code as basis).
     - Ask ONE question; wait for user reply.
     - If user override, update meta.
     - If user uses a new term or one conflicting with `_shared/glossary/glossary.meta.json`, flag immediately and offer to update glossary.
     - If the answer encodes a hard-to-reverse + surprising + real-trade-off decision, offer an ADR (`_shared/decisions/`).
   - On `--no-grill` flag: skip Phase B (Phase A draft becomes final; quality lower).
   - On `--cascade` (from `/plan-sync`) or `--field-allowlist`: grill ONLY the allowlisted fields.

   **Phase C — Render HTML**
   - Load `prompts/_html-base.md` and `prompts/_caveman-mixin.md`.
   - Dispatch Writer agent to produce `<doc>.html` per the render rules in `types/<type>.md`.
   - Embed `<script type="application/json" id="meta">` containing the canonical meta.json content byte-for-byte.
   - Save both `<doc>.meta.json` and `<doc>.html` to the scenario dir.

5. **v1 fallback** (when `schemaVersion !== 2`): follow legacy `_deprecated/plan-<old-name>/SKILL.md` Steps verbatim; write only `<doc>.html`; skip meta.json + hash tracking. Only enter this branch when `--allow-v1` is passed.

6. Before any dispatch: stamp `manifest.json` with `<type>Generating: true` so a concurrent `/plan-gen` sees the in-progress state.

7. After Phase C succeeds:
   - Use `recordGeneration` from `local-proxy/src/manifest-v2.js` to update `metaHashes[<type>]`, snapshot `upstreamHashes[<type>][<u>]` for each upstream u, and clear `<type>Generating`.
   - Set `<type>Html` and `<type>GeneratedAt` (preserves v1 fields for backward-compatible reads).
   - Mark the final TodoWrite task (typically "lint + record manifest") as `completed`.

8. Emit a short per-type confirmation line:
   ```
   [2/4] test-spec.html    generated  (22 scenarios, P0:11 / P1:7 / P2:4 · VS1-VS8)
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
