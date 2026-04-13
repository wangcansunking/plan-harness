---
name: plan-context
description: Create, select, or edit a persistent project context through guided conversation. Captures dev environment, project relationships, worktree setup, architecture, and team conventions that all scenarios inherit. Use when starting planning, switching projects, or when the user says "create context", "plan-context", "setup context".
---

# plan-context

A **project context** is a persistent knowledge base that captures everything a developer needs to know about a project that isn't obvious from the code itself. It lives at the project level and is shared across all scenarios. When you create a new scenario (via `/plan-init`), you pick an existing context instead of re-discovering everything from scratch.

## Why This Exists

Code analysis (`/plan-analyze`) can discover architecture, patterns, and tech stack. But it **cannot** discover:
- How to set up the dev environment from scratch
- What customizations are needed after `git worktree add`
- How multiple repos/projects relate to each other
- Which services need to be running locally
- Team conventions that aren't documented anywhere
- Known issues, workarounds, and gotchas
- Build quirks and environment-specific steps
- Who to contact for what

This context is built **through conversation** with the user, enriched over time, and reused for every new scenario.

## Input

| Invocation | Behavior |
|------------|----------|
| `/plan-context` | List existing contexts, offer to create or select |
| `/plan-context create` | Start guided context creation |
| `/plan-context create DevXApps-MicroPortal` | Create a named context |
| `/plan-context select` | Pick from existing contexts for the current session |
| `/plan-context edit DevXApps-MicroPortal` | Edit an existing context |
| `/plan-context view DevXApps-MicroPortal` | Generate/view the context HTML document |
| `/plan-context list` | List all available contexts |

## Storage

```
[workspace-root]/plans/.contexts/
  ├── DevXApps-MicroPortal/
  │   ├── context.json          # Machine-readable context
  │   └── context.html          # Interactive HTML reference document
  ├── Metagraph-API/
  │   ├── context.json
  │   └── context.html
  └── index.json                # Registry of all contexts
```

Each scenario's `.plan-context.json` references a parent context:
```json
{
  "parentContext": "DevXApps-MicroPortal",
  "parentContextPath": "C:/MCDC/plans/.contexts/DevXApps-MicroPortal/context.json",
  ...
}
```

## Context Schema

`context.json` captures 8 dimensions:

```json
{
  "version": 1,
  "name": "DevXApps-MicroPortal",
  "displayName": "DevXApps — MicroPortal App",
  "createdAt": "2026-04-13T12:00:00Z",
  "updatedAt": "2026-04-13T14:30:00Z",
  "createdBy": "canwa",

  "projects": {
    "description": "Projects involved and how they relate",
    "items": [
      {
        "name": "MicroPortalApp",
        "repoRoot": "C:/MCDC/DevXApps",
        "sourcePath": "sources/dev/SubstrateDevCenter/MicroPortalApp",
        "type": "frontend",
        "techStack": ["React 18", "TypeScript", "NX", "Zustand", "Fluent UI v9"],
        "description": "Micro-frontend portal for Substrate Developer Center"
      },
      {
        "name": "Metagraph API",
        "repoRoot": "C:/MCDC/Metagraph_Coral",
        "sourcePath": "sources/dev/Metagraph",
        "type": "backend",
        "techStack": ["ASP.NET Core", "Neo4j", "T4 Templates"],
        "description": "Metadata graph database API"
      }
    ],
    "relationships": [
      {
        "from": "MicroPortalApp",
        "to": "Metagraph API",
        "type": "api-consumer",
        "description": "Portal calls Metagraph REST API for entity CRUD, uses OData for queries"
      }
    ]
  },

  "devEnvironment": {
    "description": "How to set up a working dev environment from scratch",
    "prerequisites": [
      { "tool": "Node.js", "version": ">=18", "notes": "" },
      { "tool": "Visual Studio 2022", "notes": "With .NET 8 workload" },
      { "tool": "Git", "notes": "With Azure DevOps auth configured" }
    ],
    "setupSteps": [
      { "order": 1, "command": "cd DevXApps && init.cmd", "description": "Initialize QuickBuild and credential scanner hooks" },
      { "order": 2, "command": "cd sources/dev/SubstrateDevCenter/MicroPortalApp && npm install --legacy-peer-deps", "description": "Install frontend dependencies" },
      { "order": 3, "command": "npm start", "description": "Start all dev servers (NX-based)" }
    ],
    "environmentVariables": [],
    "localServices": [
      { "name": "Webpack Dev Server", "port": 4200, "startCommand": "npm start", "notes": "HTTPS enabled" }
    ],
    "vpnRequired": true,
    "vpnNotes": "Required for NuGet feed access (o365exchange.pkgs.visualstudio.com) and PPE API calls"
  },

  "worktreeSetup": {
    "description": "Steps to run after 'git worktree add' to get a working copy",
    "steps": [
      { "order": 1, "command": "init.cmd", "description": "Re-run init in the new worktree" },
      { "order": 2, "command": "npm install --legacy-peer-deps", "cwd": "sources/dev/SubstrateDevCenter/MicroPortalApp", "description": "Install node_modules (not shared across worktrees)" },
      { "order": 3, "description": "Copy .env.local from main worktree if it exists" }
    ],
    "sharedState": [
      "NuGet packages cache (~/.nuget) is shared",
      "Git hooks are per-worktree — init.cmd must run in each"
    ],
    "knownIssues": [
      "node_modules symlinks may break on Windows — use npm install, not copy",
      "MSBuild cache in target/ may conflict — clean build on first use"
    ]
  },

  "buildAndTest": {
    "description": "Build and test commands with quirks",
    "buildCommands": [
      { "scope": "full", "command": "MSBuild.exe dirs.proj", "cwd": "DevXApps", "time": "~5min" },
      { "scope": "frontend", "command": "npm run build:dev", "cwd": "sources/dev/SubstrateDevCenter/MicroPortalApp", "time": "~2min" },
      { "scope": "backend", "command": "dotnet build sources/dev/DevXMcpServer/DevXMcpServer.csproj", "time": "~1min" }
    ],
    "testCommands": [
      { "scope": "frontend", "command": "npm test", "cwd": "sources/dev/SubstrateDevCenter/MicroPortalApp/apps/PortalApp", "notes": "Jest, uses 10GB memory allocation" },
      { "scope": "backend", "command": "dotnet test", "notes": "MSTest v3" }
    ],
    "quirks": [
      "npm install requires --legacy-peer-deps due to React 16/18 mixed dependencies",
      "Jest runs with NODE_OPTIONS=--max_old_space_size=10240",
      "First NuGet restore after VPN reconnect may fail — retry once"
    ]
  },

  "architecture": {
    "description": "High-level architecture overview (supplements /plan-analyze)",
    "overview": "Micro-frontend portal consuming a graph database API",
    "layers": [],
    "keyDecisions": [
      { "decision": "Zustand over Redux for new features", "reason": "Simpler boilerplate, team agreement since 2025", "date": "2025-06" },
      { "decision": "Fluent UI v9 for new components", "reason": "v8 is maintenance-only", "date": "2025-03" }
    ],
    "dataFlow": "User → MicroPortalApp → PPE API Gateway → Metagraph API → Neo4j"
  },

  "teamConventions": {
    "description": "Conventions not documented in CLAUDE.md or code",
    "branching": "u/{alias}/ prefix for personal branches",
    "prProcess": "2 approvers required, squash merge on master",
    "codeReview": "Architecture changes need tech lead sign-off",
    "i18n": "All user-facing strings via Strings from locale JSON files",
    "testing": "P0 features need E2E Playwright tests before merge",
    "deployment": "EV2 staged rollout: Dev → PPE → Prod. Flight gates for new features.",
    "custom": []
  },

  "externalDependencies": {
    "description": "External services and APIs this project depends on",
    "services": [
      { "name": "Metagraph API (PPE)", "url": "https://metagraph-ppe.example.com", "auth": "S2S via MSI", "notes": "Rate limited to 100 req/s" },
      { "name": "NuGet Feed", "url": "https://o365exchange.pkgs.visualstudio.com", "auth": "Azure DevOps PAT", "notes": "Enzyme feed" }
    ],
    "databases": [],
    "messageQueues": []
  },

  "knownIssues": {
    "description": "Active issues, workarounds, and gotchas",
    "items": [
      { "issue": "CredScan false positives on test certificates", "workaround": "Add to .config/CredScanSuppressions.json", "severity": "low" },
      { "issue": "Large repo clone may fail with early EOF", "workaround": "Use --depth 1 then git fetch --depth N", "severity": "medium" }
    ]
  }
}
```

## Workflow

### Action: `list` (default when no argument)

1. Scan `[workspace-root]/plans/.contexts/` for context directories
2. Read each `context.json` and extract name, displayName, updatedAt, project count
3. Display:

```
Available Project Contexts:

 #  Context Name              Projects              Last Updated
 1  DevXApps-MicroPortal      MicroPortalApp, Metagraph API   2026-04-13
 2  Metagraph-API             Metagraph API                    2026-04-10
 3  DevXApps-SubstrateExplorer SubstrateExplorer               2026-04-05

Options:
  [1-3] Select a context for the current session
  [c]   Create a new context
  [e N] Edit context #N
  [v N] View context #N as HTML
```

### Action: `create`

This is the core of the skill — a **guided conversation** that builds up the context step by step.

#### Phase 1: Identity

```
Let's create a project context. I'll ask you questions to build a complete
picture of the project. You can skip any question with "skip".

What should I call this context?
  (e.g., "DevXApps-MicroPortal", "Metagraph-PermGov", "Full-Stack-SDC")
  
> _
```

Then:
```
Give me a brief description of what this project/area covers:
> _
```

#### Phase 2: Projects & Relationships

```
Which projects/repos are involved?

For each project, I need:
  - Name (short identifier)
  - Repo root path on disk
  - Source path within the repo (if it's a subfolder)
  - Type: frontend / backend / fullstack / library / infrastructure
  - Key tech stack

Project 1:
  Name: _
  Path: _
  Source path (or "root"): _
  Type: _
  Tech: _

Add another project? [y/n]
```

If multiple projects:
```
How do these projects relate to each other?
  e.g., "MicroPortalApp calls Metagraph API via REST"
  e.g., "Both share the NuGet Enzyme feed"
  
> _
```

#### Phase 3: Dev Environment

```
Let's capture the dev environment setup.

What tools/software are needed?
  (e.g., "Node 18+, VS 2022, Git, .NET 8 SDK")
> _

What are the setup steps for a fresh clone?
  List them in order. I'll number them.
  Type each step, press Enter. Type "done" when finished.

Step 1: _
Step 2: _
...
done

Any environment variables needed?
  (e.g., "AZURE_TENANT_ID=xxx, API_BASE_URL=https://...")
  Type "none" if not applicable.
> _

Any local services that need to be running?
  (e.g., "webpack dev server on port 4200, local Neo4j on 7474")
> _

Is VPN required? If so, what for?
> _
```

#### Phase 4: Worktree Setup

```
When someone creates a new git worktree for this project, what extra
steps are needed beyond the initial clone setup?

  (e.g., "re-run init.cmd", "npm install again", "copy .env.local")
  Type each step, "done" when finished, or "same as setup" if identical.

Step 1: _
...

Anything that's shared vs. isolated across worktrees?
  (e.g., "NuGet cache is shared, node_modules is per-worktree")
> _

Known issues with worktrees?
  (e.g., "symlinks break on Windows", "MSBuild cache conflicts")
> _
```

#### Phase 5: Build & Test

```
Build commands — list the main ones:

Full build command: _
Frontend build (if applicable): _
Backend build (if applicable): _

Test commands:
Frontend tests: _
Backend tests: _

Any build/test quirks I should know about?
  (e.g., "--legacy-peer-deps needed", "Jest needs 10GB memory", "first NuGet restore after VPN may fail")
> _
```

#### Phase 6: Architecture & Key Decisions

```
Give me the 30-second architecture overview:
  (e.g., "Micro-frontend portal consuming a graph database API via REST")
> _

Any key architectural decisions that affect how new code should be written?
  For each, give: the decision, why it was made, roughly when.
  Type "done" when finished.

Decision: _
Reason: _

Decision: _
Reason: _
...
done

What's the main data flow?
  (e.g., "User → React App → API Gateway → Metagraph → Neo4j")
> _
```

#### Phase 7: Team Conventions

```
Let me capture team conventions that aren't in CLAUDE.md or code comments.

Branch naming: _  (or "skip")
PR process: _
Code review rules: _
i18n approach: _
Testing requirements: _
Deployment process: _

Anything else the team expects that a new developer wouldn't know?
> _
```

#### Phase 8: External Dependencies

```
What external services does this project depend on?

For each: name, URL (if known), auth method, any notes.
  Type "done" when finished, or "none".

Service 1: _
...
done
```

#### Phase 9: Known Issues

```
Any known issues, gotchas, or workarounds that would save someone time?

For each: the issue, the workaround, severity (low/medium/high).
  Type "done" when finished, or "none".

Issue 1: _
Workaround: _
...
done
```

#### Phase 10: Save & Generate

1. Assemble all responses into `context.json` following the schema above
2. Write to `[workspace-root]/plans/.contexts/{context-name}/context.json`
3. Update `[workspace-root]/plans/.contexts/index.json` with the new entry
4. Dispatch a **Writer agent** to generate `context.html`:

```
Prompt:
You are the Writer generating a project context reference document.

Read the prompt template at C:\MCDC\plan-harness\prompts\writer-prompt.md for CSS and HTML guidelines.

INPUT: {context.json content}

CREATE a self-contained context.html with these sections:

1. #overview — Project Overview
   - Context name, description, creation date
   - Project cards showing each project with tech stack badges
   - Relationship diagram (SVG) if multiple projects

2. #environment — Dev Environment Setup
   - Prerequisites table (tool, version, notes)
   - Numbered setup steps with copy-able commands
   - Environment variables table
   - Local services table (name, port, start command)
   - VPN requirements callout

3. #worktree — Worktree Setup
   - Numbered steps with commands
   - Shared vs isolated state callout
   - Known issues warning boxes

4. #build — Build & Test
   - Build commands table (scope, command, cwd, time)
   - Test commands table
   - Quirks callout box

5. #architecture — Architecture
   - Overview paragraph
   - Data flow diagram (SVG)
   - Key decisions timeline (cards with decision, reason, date)

6. #conventions — Team Conventions
   - Convention cards organized by category
   - Code blocks for naming patterns

7. #dependencies — External Dependencies
   - Service cards with URL, auth, notes
   - Status badges (if reachable)

8. #issues — Known Issues
   - Issue cards with severity badges and workaround text

PLAN NAVIGATION BAR:
<div class="plan-nav">
  <a href="context.html" class="active">Context</a>
  <a href="../{scenario}/analysis.html">Analysis</a>
  <a href="../{scenario}/design.html">Design</a>
</div>

Use the standard dark/light theme with sidebar nav. Include a "Copy command" button
next to each command block. Make the document printable.
```

5. Present summary:

```
Context "{name}" created successfully!

Location: {workspace-root}/plans/.contexts/{name}/
  context.json  — Machine-readable context data
  context.html  — Interactive reference document

Captured:
  {N} projects with {M} relationships
  {N} setup steps, {N} worktree steps
  {N} build commands, {N} test commands
  {N} key architectural decisions
  {N} team conventions
  {N} external dependencies
  {N} known issues

Next steps:
  /plan-init         — Create a new scenario using this context
  /plan-context view — Open the context document
  /plan-context edit — Refine any section
```

### Action: `select`

1. List contexts (same as `list`)
2. User picks a number
3. Store the selection in a session state file (`.plan-active-context.json` in cwd):
   ```json
   {
     "activeContext": "DevXApps-MicroPortal",
     "contextPath": "C:/MCDC/plans/.contexts/DevXApps-MicroPortal/context.json",
     "selectedAt": "2026-04-13T12:00:00Z"
   }
   ```
4. Confirm: "Active context set to **{name}**. All `/plan-init` and `/plan-*` skills will use this context."

### Action: `edit`

1. Load the existing `context.json`
2. Show the 8 dimensions as a menu:
   ```
   Editing context: DevXApps-MicroPortal
   
    1. Projects & Relationships     (2 projects, 1 relationship)
    2. Dev Environment               (3 prerequisites, 3 setup steps)
    3. Worktree Setup                (3 steps, 2 known issues)
    4. Build & Test                  (3 build commands, 2 test commands)
    5. Architecture                  (2 key decisions)
    6. Team Conventions              (6 conventions)
    7. External Dependencies         (2 services)
    8. Known Issues                  (2 issues)
   
   Which section to edit? (1-8, or "all" to review everything)
   ```
3. For the selected section, show current values and ask what to change
4. Update `context.json` and regenerate `context.html`

### Action: `view`

1. Check if `context.html` exists. If not, generate it.
2. If `plan_serve_dashboard` MCP tool is available, start the server and return the URL
3. Otherwise, tell the user the file path to open in a browser

## Integration with /plan-init

When `/plan-init` runs, it should:

1. Check for `.plan-active-context.json` in cwd — if found, use that context
2. If not, check `[workspace-root]/plans/.contexts/index.json` — if contexts exist, show picker:
   ```
   Found existing project contexts:
    1. DevXApps-MicroPortal — MicroPortalApp + Metagraph API
    2. Metagraph-API — Metagraph standalone
   
   Select a context, or [c] to create new:
   ```
3. If no contexts exist, suggest: "No project contexts found. Run `/plan-context create` first for a richer planning experience, or continue with basic code analysis."
4. When a context is selected, copy its project info, dev environment, and conventions into `.plan-context.json`:
   ```json
   {
     "parentContext": "DevXApps-MicroPortal",
     "parentContextPath": "C:/MCDC/plans/.contexts/DevXApps-MicroPortal/context.json",
     "repoRoot": "...",
     "codebaseContext": { ... },
     "inheritedSetup": { ... }
   }
   ```

## Integration with /plan-analyze

When `/plan-analyze` runs with a context:

1. Read the parent context's `architecture` and `projects` sections
2. Use them as baseline knowledge — don't re-discover what the user already told us
3. Focus analysis on code-level details that complement the context
4. After analysis, offer to **enrich** the context:
   ```
   Analysis found patterns not in your project context:
     - T4 code generation pipeline (ModelGenerator → .g.cs files)
     - EV2 deployment with staged rollout
   
   Add these to the "DevXApps-MicroPortal" context? [y/n]
   ```

## Integration with /plan-design, /plan-implementation

When generating plans with a context:

1. Agent prompts receive the context as additional input
2. Implementation plans include setup steps from the context's `devEnvironment`
3. Design docs reference project relationships from the context
4. Test plans reference `buildAndTest.testCommands` for the "how to run" sections

## Context Enrichment Over Time

The context should grow organically. After any skill completes, check if new knowledge was discovered:

- `/plan-analyze` finds new patterns → offer to add to `architecture.keyDecisions`
- `/plan-review` finds missing test conventions → offer to add to `teamConventions`
- User mentions a workaround during conversation → offer to add to `knownIssues`

Prompt:
```
I noticed you mentioned "{workaround}". Should I add this to the
"{context-name}" project context under Known Issues? [y/n]
```

## Error Handling

| Error | Resolution |
|-------|-----------|
| `.contexts/` directory doesn't exist | Create it automatically |
| `context.json` is malformed | Attempt to parse what exists, ask user to fill gaps |
| User skips most questions | Create a minimal context with what was provided, mark empty sections |
| No workspace root identifiable | Ask user for the path |
| Context name collision | Ask: "Context '{name}' already exists. Overwrite, rename, or cancel?" |

## Context Portability

Contexts are plain JSON + HTML — they can be:
- Committed to the repo (in `plans/.contexts/`)
- Shared with team members
- Copied to new machines
- Version-controlled alongside the code
