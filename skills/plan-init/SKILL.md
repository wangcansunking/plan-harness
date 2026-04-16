---
name: plan-init
description: Initialize planning session — multi-select contexts, analyze codebase, select or create a scenario. Accepts a context name or repo path as argument.
---

# plan-init

Initialize a planning session. This skill lets the user **select one or more contexts** (markdown files with project knowledge and generation rules), then select or create a scenario. The selected contexts are recorded in `manifest.json` so all other `plan-*` skills know what to load.

## Input

| Invocation | Behavior |
|------------|----------|
| `/plan-init` | Show context multi-selector, then scenario selector |
| `/plan-init devxapps-project` | Pre-select the named context, still show full selector for additional picks |
| `/plan-init C:\MCDC\DevXApps` | Use this repo path, show context selector |

## When to Use

- At the start of any planning session before running other `plan-*` skills
- When switching to a different scenario within the same repo
- When the user says "start planning", "init plan", "new plan", or "plan for [feature]"

## What It Produces

- A `manifest.json` in the scenario directory (with `contexts` array and scenario metadata)
- A formatted summary of the combined context printed to the user

## Agent Team

This skill does NOT dispatch sub-agents. It runs interactively in the current session because it requires user input at multiple decision points.

## Workflow

### Step 0: Select Contexts (multi-select)

**Always present a context selector.** Contexts are markdown files that provide project knowledge, generation rules, conventions, or any combination. The user can select multiple — they compose in order.

1. Scan `[workspace-root]/plans/.contexts/` for `.md` files (excluding `index.md`)
2. Read frontmatter from each (name, description, tags)
3. If an argument was provided matching a context name, pre-select it

**If contexts exist — show multi-select:**

```
=== Select Contexts ===

Select one or more contexts for this plan.
Contexts compose in order — later ones override earlier ones where they conflict.

 [x] 1. devxapps-project         [project]            DevXApps — paths, build, architecture
 [ ] 2. metagraph-api            [project]            Metagraph API — Neo4j, T4, OData
 [x] 3. performance-audit        [generation-rules]   4 docs, data-driven, Tokyo Night
 [ ] 4. feature-planning         [generation-rules]   Full 7-doc suite, GitHub Dark
 [ ] 5. lean                     [generation-rules]   Minimal 2-doc planning
 [ ] 6. mcdc-portal-pages        [scenario]           Portal page inventory, API map, perf baselines

─────────────────────────────────
 [c] Create new context (runs /plan-context create)
 [i] Import built-in templates

(Space to toggle, Enter to confirm)
```

**Contexts can be at any granularity:**
- Broad: `devxapps-project` — covers the whole project
- Narrow: `mcdc-portal-pages` — specific pages, specific APIs, specific perf baselines
- Rules: `performance-audit` — how to generate docs
- Mixed: a single context can contain both project knowledge and generation rules

The more specific the context, the better the LLM's output. Encourage users to create focused contexts for specific scenarios (e.g., a context per page group, per API domain, per feature area).

**If no contexts exist:**

```
=== Select Contexts ===

No contexts found in plans/.contexts/

 [c] Create new context
 [i] Import built-in templates (feature-planning, performance-audit, lean)

A context is required — it tells the planning pipeline about your project
and how documents should be generated.
```

At least one context must be selected. If the user wants minimal setup, they can import built-in templates and select `lean`.

4. **After selection**: Read all selected `.md` files. Extract any project paths mentioned (for Step 1). Proceed.

5. **If user chooses [c]**: Invoke `/plan-context create`. After creation, return to the selector with the new context pre-selected.

### Step 1: Resolve Repository

Determine which repository this scenario targets.

- Scan the selected contexts for project paths (look for "Path:", "repoRoot:", or filesystem paths in the markdown)
- If exactly one path is found, use it automatically
- If multiple paths are found, ask:
  ```
  Your contexts reference multiple projects:
   1. MicroPortalApp  (C:\MCDC\DevXApps)
   2. Metagraph API   (C:\MCDC\Metagraph_Coral)
  
  Which project is this scenario for? (or "both")
  ```
- If no paths found, ask the user for the repo root path
- If the user provided a repo path as argument, use it directly

Store the resolved repo root path as `repoRoot`.

### Step 2: Analyze the Codebase

Call the `plan_get_context` MCP tool to scan the repository:

```
Use the plan_get_context MCP tool with the repoRoot path.
```

This returns:
| Field | Description |
|-------|-------------|
| `projectType` | e.g., "node", ".NET", "mixed (.NET + Node)" |
| `techStack` | Array of detected technologies (React, TypeScript, .NET, Neo4j, etc.) |
| `patterns` | Array of architectural patterns (MSBuild traversal, T4 code generation, etc.) |
| `conventions` | Array of project conventions extracted from CLAUDE.md |
| `structure` | Object with top-level dirs, csproj files, README summary |

### Step 3: List Existing Scenarios

Call the `plan_list_scenarios` MCP tool to find all existing scenarios in the workspace:

```
Use the plan_list_scenarios MCP tool.
```

Display the results in a formatted table:

```
Existing Scenarios in [repoName]:
---------------------------------------------------------------------------
 #  Scenario Name          Contexts                    Documents
 1  my-feature             devxapps, feature-planning   design, test-plan
 2  portal-perf-opt        devxapps, perf-audit         index, analysis, design
---------------------------------------------------------------------------
```

- If scenarios exist: Ask the user to select one by number OR create a new one
- If no scenarios exist: Proceed directly to Step 4 (create new)

### Step 4: Select or Create a Scenario

**If selecting an existing scenario:**
1. Use the scenario path from the list
2. Read the existing `manifest.json` to get metadata
3. Ask: "This scenario was created with contexts [X, Y]. Keep these or re-select?"
4. If user wants to keep, proceed to Step 6. If re-select, update `manifest.json` with new contexts.

**If creating a new scenario:**
1. Ask the user for:
   - **Scenario name** (required) -- short kebab-case name for the directory, e.g., "copilot-chat-integration"
   - **Description** (required) -- one or two sentences describing what this plan covers
   - **Work item ID** (optional) -- Azure DevOps work item number for traceability
   - **Tags** (optional) -- comma-separated labels, e.g., "frontend, copilot, p0"
2. Call the `plan_create_scenario` MCP tool:

```
Use the plan_create_scenario MCP tool with:
  - repoRoot: the resolved repo root path
  - scenarioName: the user-provided name
  - metadata: { description, workItem, tags }
```

3. This creates `{repoRoot}/plans/{scenario-name}/manifest.json`

### Step 5: Update manifest.json with Contexts

Read `manifest.json`, add the `contexts` array, and write it back:

```json
{
  "scenario": "portal-perf-opt",
  "displayName": "Portal Performance Optimization",
  "description": "Optimize portal page load performance",
  "workItem": "123456",
  "tags": ["performance", "portal"],
  "status": "draft",
  "createdAt": "2026-04-16T12:00:00Z",
  "contexts": ["devxapps-project", "portal-admin-pages", "performance-audit"]
}
```

The `contexts` array is an ordered list of context names. Skills resolve these to `.md` files by scanning `plans/.contexts/{name}.md`.

That's it. No separate state file. `manifest.json` is the single source of truth for the scenario.

### Step 6: Display the Context Summary

Print a formatted summary to the user:

```
=== Plan Initialized ===

Contexts:     devxapps-project + performance-audit
Repository:   DevXApps
Scenario:     portal-perf-opt
Path:         C:/MCDC/DevXApps/plans/portal-perf-opt
Description:  Optimize portal page load performance
Work Item:    ADO#123456

--- From devxapps-project.md ---
Projects:    MicroPortalApp (React 18, TypeScript, NX)
Build:       npm run build:dev (~2min)
Conventions: Zustand, Fluent UI v9, i18n required

--- From performance-audit.md ---
Documents:   index, analysis, design, implementation-plan (4 docs)
Theme:       Tokyo Night
Anti-patterns: 7 rules active

--- Codebase Analysis ---
Project Type: mixed (.NET + Node)
Tech Stack:   React, TypeScript, .NET/C#, Azure Functions
Patterns:     MSBuild traversal, Jest testing

--- Next Steps ---
  /plan-analyze        Collect performance data
  /plan-design         Design optimization strategy
  /plan-full           Run full planning workflow (4 documents)
```

The "Next Steps" section only lists skills whose documents are enabled by the selected generation rules context. For example, with `performance-audit` selected, don't suggest `/plan-state-machine` or `/plan-test-cases`.

## How Skills Load Contexts

All `plan-*` skills follow this pattern:

```
1. Read manifest.json → get contexts array
2. For each context name, read plans/.contexts/{name}.md
3. Parse frontmatter (name, description, tags, agents)
4. Filter by current agent role (agents field)
5. Inject matching context content into agent prompt
```

Three-tier loading (see `docs/context-design.md`):
- **Tier 1** (descriptions): read from frontmatter — minimal tokens, always available
- **Tier 2** (summary + details): injected into agent prompts, filtered by `agents` field
- **Tier 3** (reference): agents read specific sections on demand when needed

## Error Handling

| Error | Resolution |
|-------|------------|
| No contexts directory | Run `/plan-context init` to create it and import built-in templates |
| No contexts selected | At least one context is required. Show the selector again. |
| Context `.md` file not found for a name in manifest | Warn and skip. Suggest `/plan-context` to fix. |
| Cannot detect repo from contexts | Ask user to provide the repo path explicitly |
| `plan_get_context` MCP tool not available | Read CLAUDE.md manually from the repo root |
| `plan_list_scenarios` fails | Fall back to scanning `{repoRoot}/plans/` directory manually |
| `plan_create_scenario` fails | Create the directory and manifest.json manually using Write tool |

## Cross-Links

| Skill | Depends On |
|-------|-----------|
| `/plan-context` | **Upstream** — creates the context `.md` files |
| `/plan-analyze` | `manifest.json` (reads contexts, enriches with discovered patterns) |
| `/plan-design` | `manifest.json` |
| `/plan-test-plan` | `manifest.json` + `design.html` |
| `/plan-state-machine` | `manifest.json` + `design.html` |
| `/plan-test-cases` | `manifest.json` + `design.html` + `test-plan.html` |
| `/plan-implementation` | `manifest.json` + `design.html` |
| `/plan-review` | Any generated plan document |
| `/plan-full` | Calls `/plan-init` as its first step |
