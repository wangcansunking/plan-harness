---
name: plan-gen
description: Unified generator for every plan document — product, analysis, design, state-machine, test-spec, implementation, test-report — plus shared assets (context, glossary, decisions). Pick one or many types via multi-select UI or pass the type as an argument. Replaces the seven per-type skills with one entry point so users only remember one command.
---

# plan-gen

One command to generate any plan document. Dispatches the right agent team for the chosen type, updates `manifest.json`, and returns a short confirmation. When invoked without an argument, shows a multi-select UI with per-type status (generated / generating / not generated) so the user can pick any subset.

## Types

### Scenario docs (7 types, written under `plan-harness/<scenario>/`)

| Type                      | Aliases          | Output file                                | Per-type workflow                            |
|---------------------------|------------------|--------------------------------------------|----------------------------------------------|
| `product`                 | `prd`            | `product.{html,meta.json}`                 | [types/product.md](types/product.md)         |
| `analysis`                | `analyze`        | `analysis.{html,meta.json}`                | [types/analysis.md](types/analysis.md)       |
| `design`                  | —                | `design.{html,meta.json}`                  | [types/design.md](types/design.md)           |
| `state-machine`           | `sm`             | `state-machine.{html,meta.json}`           | [types/state-machine.md](types/state-machine.md) |
| `test-spec`               | `testspec`       | `test-spec.{html,meta.json}` (combines test plans + cases) | [types/test-spec.md](types/test-spec.md) |
| `implementation`          | `impl`           | `implementation.{html,meta.json}`          | [types/implementation.md](types/implementation.md) |
| `test-report`             | `report`         | `test-report.{html,meta.json}`             | [types/test-report.md](types/test-report.md) |

### Repo assets (written under `plan-harness/_shared/`)

| Type        | Output                                              | Per-type workflow                          |
|-------------|-----------------------------------------------------|--------------------------------------------|
| `context`   | `_shared/context/overview.{html,meta.json}`         | [types/context.md](types/context.md)       |
| `glossary`  | `_shared/glossary/glossary.{html,meta.json}`        | [types/glossary.md](types/glossary.md)     |
| `decisions` | `_shared/decisions/<NNNN>-<slug>.{html,meta.json}` + `index.html` | [types/decisions.md](types/decisions.md) |

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
2. Otherwise, look for `plan-harness/<scenario>/manifest.json`. If missing, tell the user `"Run /plan-init first to set up the planning context."` and stop.
3. Load the manifest into memory — it's the context bag every per-type workflow reads.

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

Dependency graph (see also `/plan-sync`):

```
product → analysis → design ┬─► state-machine ─┐
                             ├─► test-spec ◄────┤
                             └─► implementation ◄┤
                                      └─► test-report ◄─┘
```

Required vs. optional edges:

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
3. **Three-phase dispatch:**

   **Agent team dispatch (applies to Phase A and Phase C):**
   Each `types/<type>.md` lists an "Agent team" row (e.g. design → `Architect (lead), PM, Writer`). For each role, call the `Agent` tool with a focused prompt:
   - `Architect` → `subagent_type: "feature-dev:code-architect"` — drafts schema/structure fields, traces upstream code.
   - `PM` (or `Tester`, `Engineer`) → `subagent_type: "feature-dev:code-explorer"` — drafts user-facing fields, reads repo for evidence.
   - `Writer` → `subagent_type: "general-purpose"` — renders HTML in Phase C (Architect/PM do NOT render).
   - `Validator` → `subagent_type: "feature-dev:code-reviewer"` — audits the rendered doc in Phase C after lint+validate gates. Reads `prompts/validator-prompt.md` for the audit checklist (contract coverage, mockup rigor, cross-doc near-misses, glossary/ADR hygiene, caveman readability). Returns a JSON verdict — `pass` / `concern` / `fail`. `fail` re-dispatches the Writer.
   Dispatch independent roles **in parallel** (a single message with multiple `Agent` blocks); only sequence them when a downstream role consumes the upstream role's draft. The orchestrator (this skill) reconciles their outputs into the final `<doc>.meta.json`. If the team table marks one role as "lead", that role's draft is the spine; others merge in. Validator is sequential — always the LAST role in Phase C.

   **Phase A — Draft meta (silent)**
   - Read upstream `<upstream>.meta.json` for every hard + soft upstream listed in `types/<type>.md`.
   - Read repo assets when soft-listed: `_shared/context/`, `_shared/glossary/`, `_shared/decisions/`.
   - **Dispatch the agent team** (see above) to populate `<doc>.meta.json` per the type's schema. Fill every field that's derivable from upstream meta or code; leave only judgment calls for Phase B.
   - For doc types that require visuals per item (product `userStories[].mockup`, state-machine `perStoryFlows[].diagram/uiMockup`, design `uxMockups[]`/`userFlows[]`): the lead agent drafts the visual SVG/Mermaid alongside the field; do NOT defer all visuals to the Writer in Phase C.

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
   - Dispatch the **Writer** role from the team (call `Agent` with `subagent_type: "general-purpose"`) to produce `<doc>.html` per the render rules in `types/<type>.md`. Pass it the finalized `<doc>.meta.json` and the two mixin prompts as context; instruct it to use the literal `__META_JSON_PLACEHOLDER__` token inside `<script type="application/json" id="meta">…</script>` rather than inlining the meta itself.
   - After the Writer returns the HTML, the orchestrator reads `<doc>.meta.json` from disk and `replace()`s the placeholder with the file bytes verbatim — this is what guarantees byte-equality (see `prompts/_html-base.md` §"Phase C protocol").
   - Embed `<script type="application/json" id="meta">` containing the canonical meta.json content byte-for-byte.
   - Save both `<doc>.meta.json` and `<doc>.html` to the scenario dir.
   - **Run `lintFile()` from `local-proxy/src/html-lint.js` against the rendered HTML.** Shared-asset docs (`_shared/context`, `_shared/glossary`, `_shared/decisions`) pass `skipRules: ['L1-docgroup', 'L1-active']`. **The retry loop is MANDATORY — do not stop at the first lint failure.** Procedure on any error:

     1. Read the lint output (`result.errors[]` — rule + message per finding).
     2. **Auto-fix** what you can directly with `Edit` / `Write` against `<doc>.html` — e.g. missing `<div class="sections">` wrapper, palette drift, missing `class="active"` on the current doc's nav link, missing shared-asset link bar. These are mechanical; the Writer doesn't need to re-render for them.
     3. For findings that require regeneration (missing mockup visuals, missing sections, byte-mismatched meta), **re-dispatch the Writer** with the lint findings injected into its context as a "previous attempt failed lint with these errors; produce a corrected version" preamble.
     4. Re-run `lintFile()`. If still failing after **two retries** (one auto-fix pass + one Writer re-dispatch), THEN write `<doc>.lint.json` with the residual findings, surface the failure to the user, and STOP.

     **Never `STOP` on the first lint failure** — that's what "retry once" means; the user explicitly relies on this self-heal. Only a clean lint pass (or `--no-lint`) lets the run proceed to validate.
   - **Run `validateDoc()` from `local-proxy/src/meta-validate.js`** against `<doc>.meta.json` + `<doc>.html`. This is the SECOND mandatory gate. Catches things lint can't see — schema-shape, cross-doc refs (e.g. `state-machine.perStoryFlows[].storyId ∈ product.userStories[].id`, `implementation.prs[].slice ∈ test-spec.verticalSlices[].id`), and HTML semantic coverage (every meta visual is actually rendered). Shared-asset docs pass `skipRules` per their nature.

     **Same MANDATORY retry loop as lint**:
     1. Auto-fix what's mechanical (schema-shape missing fields, hash mismatch caused by stale embed) directly with `Edit` against `<doc>.meta.json` or `<doc>.html`.
     2. For cross-doc refs or count mismatches, re-dispatch the Writer with the validate findings as context.
     3. Re-run `validateDoc()`. If still failing after two retries, write `<doc>.validate.json`, surface, and STOP.

     Both gates must be clean before the Validator agent runs.
   - **Dispatch the Validator agent** (`Agent` tool with `subagent_type: "feature-dev:code-reviewer"`) with `prompts/validator-prompt.md`, the rendered `<doc>.html`, `<doc>.meta.json`, every upstream `<u>.meta.json`, and `types/<doc>.md`. The Validator returns JSON: `{verdict, findings[], summary}`. On `pass`, proceed to step 7. On `concern`, surface the findings and ask the user `accept [Enter] / re-grill <field>`. On `fail`, re-dispatch the Writer with the findings injected (one retry); if Validator still returns `fail`, write `<doc>.validator.json` with the findings, surface the failure, and STOP — the doc does NOT record.

4. Before any dispatch: stamp `manifest.json` with `<type>Generating: true` so a concurrent `/plan-gen` sees the in-progress state.

5. After Phase C succeeds (HTML rendered AND both gates clean):
   - Use `recordGeneration` from `local-proxy/src/manifest.js` to update `metaHashes[<type>]`, snapshot `upstreamHashes[<type>][<u>]` for each upstream u, and clear `<type>Generating`.
   - Set `<type>Html` and `<type>GeneratedAt`.
   - Mark the final TodoWrite tasks (render → lint → validate → record) as `completed` in order.
   - **Never** set `<type>GeneratedAt` while a `<doc>.lint.json` or `<doc>.validate.json` exists; delete the stale gate file on a subsequent clean pass.

6. Emit a short per-type confirmation line:
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
  http://localhost:{port}/scenario/{scenarioName}              # scenario index
  http://localhost:{port}/{scenarioName}/design.html           # any individual doc
  http://localhost:{port}/_shared/glossary/glossary.html       # shared assets

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

## Cross-Links

| Skill / File               | Relationship                                                                 |
|----------------------------|------------------------------------------------------------------------------|
| `/plan-init`               | Prerequisite — creates the manifest this skill reads                         |
| `/plan-full`               | Orchestrator — calls `/plan-gen` for each type in turn                       |
| `/plan-sync`               | Cascade orchestrator — calls `/plan-gen` for every downstream of an edited doc |
| `/plan-lint`               | Standalone re-runs of Phase C's lint+validate gate; auto-fixes drift on existing docs without re-grilling |
| `/plan-edit`               | Single-field meta edit. Use when grilling a small subset; no cascade.        |
| `/plan-review`             | Post-generation review pass; reads the file this skill writes                |
| `manifest.json`            | Read for scenario context; written per-type after each successful run        |

