---
name: plan-init
description: Initialize planning context — select a project context, analyze codebase, select or create a scenario, and prepare for plan generation. Accepts a context name or repo path as argument.
---

# plan-init

Initialize the planning context for a new planning session. This skill connects to a **project context** (persistent cross-scenario knowledge), analyzes the codebase, then lets the user select or create a scenario. The output is a `.plan-context.json` state file that all other `plan-*` skills depend on.

## Input

| Invocation | Behavior |
|------------|----------|
| `/plan-init` | Auto-detect context and repo, or prompt |
| `/plan-init DevXApps-MicroPortal` | Use the named project context |
| `/plan-init C:\MCDC\DevXApps` | Use this repo path, auto-find or create context |

## When to Use

- At the start of any planning session before running other `plan-*` skills
- When switching to a different scenario within the same repo
- When the user says "start planning", "init plan", "new plan", or "plan for [feature]"

## What It Produces

- A `.plan-context.json` file in the selected scenario directory (references the parent project context)
- A formatted summary of codebase context and scenario metadata printed to the user

## Agent Team

This skill does NOT dispatch sub-agents. It runs interactively in the current session because it requires user input at multiple decision points.

## Workflow

### Step 0: Resolve Project Context

Before anything else, check for a reusable **project context** (created by `/plan-context create`).

1. Check for `.plan-active-context.json` in cwd — if found, load that context
2. If argument matches a context name in `[workspace-root]/plans/.contexts/index.json`, load it
3. If `[workspace-root]/plans/.contexts/` has contexts, show a picker:
   ```
   Found project contexts:
    1. DevXApps-MicroPortal    — MicroPortalApp + Metagraph API (updated 2026-04-13)
    2. Metagraph-API           — Metagraph standalone (updated 2026-04-10)
   
    [1-2] Select a context
    [c]   Create new context (runs /plan-context create)
    [s]   Skip — use basic code analysis only
   ```
4. If no contexts exist, inform the user and proceed without one:
   ```
   No project contexts found. Proceeding with code analysis only.
   Tip: Run /plan-context create to capture dev setup, project relationships,
   and team conventions for richer planning.
   ```

If a context is selected, extract: `repoRoot` from the context's projects, `techStack`, `conventions`, `devEnvironment`, etc. This replaces or enriches Step 1 and Step 2.

### Step 1: Detect the Repository

Determine which repository/project the user is working in.

**If project context is loaded and has project entries:**
- If the context has exactly one project, use its `repoRoot` automatically
- If the context has multiple projects, ask which repo this scenario targets:
  ```
  This context has multiple projects:
   1. MicroPortalApp  (C:\MCDC\DevXApps)
   2. Metagraph API   (C:\MCDC\Metagraph_Coral)
  
  Which project is this scenario for? (or "both")
  ```

**If no project context:**
1. Check cwd. If inside a known repo, use that.
2. If cwd is a workspace root, ask which repo.
3. If the user specifies a path as argument, use it directly.

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
 #  Scenario Name          Design  Test Plan  State Machine  Test Cases  Impl Plan
 1  my-feature               Y        Y            N             N          N
 2  api-refactor             Y        N            N             N          N
---------------------------------------------------------------------------
```

- If scenarios exist: Ask the user to select one by number OR create a new one
- If no scenarios exist: Proceed directly to Step 4 (create new)

### Step 4: Select or Create a Scenario

**If selecting an existing scenario:**
1. Use the scenario path from the list
2. Read the existing `manifest.json` to get metadata
3. Skip to Step 5

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

### Step 5: Write the Context State File

Create `.plan-context.json` in the scenario directory. If a project context was selected in Step 0, include a reference to it and inherit its data.

**With project context:**
```json
{
  "version": 2,
  "createdAt": "2026-04-13T12:00:00.000Z",
  "parentContext": "DevXApps-MicroPortal",
  "parentContextPath": "C:/MCDC/plans/.contexts/DevXApps-MicroPortal/context.json",
  "repoRoot": "C:/MCDC/DevXApps",
  "repoName": "DevXApps",
  "scenarioPath": "C:/MCDC/DevXApps/plans/my-feature",
  "scenarioName": "my-feature",
  "description": "User-provided description of the feature",
  "workItem": "123456",
  "tags": ["frontend", "copilot"],
  "codebaseContext": {
    "projectType": "mixed (.NET + Node)",
    "techStack": ["React", "TypeScript", ".NET/C#", "Azure Functions"],
    "patterns": ["MSBuild traversal", "NX", "Jest testing"],
    "conventions": [
      "New features use Zustand for state management",
      "All user-facing text must use i18n"
    ],
    "structure": { }
  },
  "inherited": {
    "devEnvironment": { },
    "worktreeSetup": { },
    "buildAndTest": { },
    "architecture": { },
    "teamConventions": { },
    "externalDependencies": { },
    "knownIssues": { }
  }
}
```

The `inherited` block is copied from the parent context's corresponding sections. This allows all `plan-*` skills to access project-level knowledge without re-reading the parent context file.

**Without project context (version 1, backward compatible):**
```json
{
  "version": 1,
  "createdAt": "2026-04-13T12:00:00.000Z",
  "repoRoot": "C:/MCDC/DevXApps",
  "repoName": "DevXApps",
  "scenarioPath": "C:/MCDC/DevXApps/plans/my-feature",
  "scenarioName": "my-feature",
  "description": "User-provided description of the feature",
  "workItem": "123456",
  "tags": ["frontend", "copilot"],
  "codebaseContext": {
    "projectType": "mixed (.NET + Node)",
    "techStack": ["React", "TypeScript", ".NET/C#", "Azure Functions"],
    "patterns": ["MSBuild traversal", "NX", "Jest testing"],
    "conventions": [],
    "structure": { }
  }
}
```

Write this file using the Write tool to `{scenarioPath}/.plan-context.json`.

### Step 6: Display the Context Summary

Print a formatted summary to the user:

```
=== Plan Context Initialized ===

Project Context: DevXApps-MicroPortal (or "none — basic analysis only")
Repository:      DevXApps
Scenario:        my-feature
Path:            C:/MCDC/DevXApps/plans/my-feature
Description:     Add copilot chat integration to the portal
Work Item:       ADO#123456
Tags:            frontend, copilot

--- Codebase Context ---
Project Type:  mixed (.NET + Node)
Tech Stack:    React, TypeScript, .NET/C#, Azure Functions, Webpack, NX
Patterns:      MSBuild traversal, Jest testing, EV2 deployment
Conventions:
  - New features use Zustand for state management
  - All user-facing text must use i18n
  - Fluent UI v9 for new components

--- Inherited from Project Context ---
Dev Setup:     3 prerequisites, 3 setup steps
Worktree:      3 steps, 2 known issues
Build:         3 build commands, 2 test commands
Architecture:  2 key decisions
Conventions:   6 team conventions
Dependencies:  2 external services

--- Ready for Planning ---
Next steps:
  /plan-analyze        Deep codebase analysis (enriches context)
  /plan-design         Generate a design document
  /plan-full           Run the full planning workflow
```

## Error Handling

| Error | Resolution |
|-------|------------|
| Cannot detect repo from cwd | Ask user to provide the repo path explicitly |
| `plan_get_context` MCP tool not available | Read CLAUDE.md manually from the repo root and extract context by hand |
| `plan_list_scenarios` fails | Check that the MCP server is running; fall back to scanning `{repoRoot}/plans/` directory manually |
| `plan_create_scenario` fails | Create the directory and manifest.json manually using Write tool |
| User provides invalid scenario name | Strip special characters, convert spaces to hyphens, lowercase |

## Cross-Links

This skill produces the `.plan-context.json` file that is the prerequisite for ALL other plan skills:

| Skill | Depends On |
|-------|-----------|
| `/plan-context` | **Upstream** — creates the project context that `/plan-init` references |
| `/plan-analyze` | `.plan-context.json` (enriches both scenario context and parent project context) |
| `/plan-design` | `.plan-context.json` |
| `/plan-test-plan` | `.plan-context.json` + `design.html` |
| `/plan-state-machine` | `.plan-context.json` + `design.html` |
| `/plan-test-cases` | `.plan-context.json` + `design.html` + `test-plan.html` |
| `/plan-implementation` | `.plan-context.json` + `design.html` |
| `/plan-review` | Any generated plan document |
| `/plan-full` | Calls `/plan-init` as its first step |
