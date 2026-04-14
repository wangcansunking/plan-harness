# plan-harness

A Claude Code plugin for structured project planning. Generates interconnected, interactive HTML documents — codebase analysis, design docs, state machines, test plans, test cases, and implementation plans — through specialized agent teams. Includes persistent project contexts, a local dashboard, and section-by-section review workflows.

## Overview

plan-harness turns the spec/plan phase of a project into a repeatable, high-quality process:

1. **Capture project knowledge once** — dev setup, project relationships, worktree customizations, team conventions
2. **Generate rich plan documents** — each produced by a 6-agent team (Architect, PM, Frontend Dev, Backend Dev, Tester, Writer)
3. **Review iteratively** — section-by-section critique with role-specific reviewers and cross-document consistency checks
4. **Track completion** — check implementation progress against the plan from code evidence

Every generated document is a self-contained HTML file with dark/light theme, sidebar navigation, interactive elements (checkboxes, filters, expand/collapse), SVG diagrams, and print styles.

---

## Architecture

```
                          ┌─────────────────────────────────┐
                          │        plan-harness plugin       │
                          ├─────────┬───────────┬───────────┤
                          │ MCP     │ 11 Skills │ 6 Agent   │
                          │ Server  │           │ Prompts   │
                          │ (6 tools│           │           │
                          │ + web   │           │           │
                          │ dashboard)          │           │
                          └────┬────┴─────┬─────┴─────┬─────┘
                               │          │           │
                    ┌──────────┘    ┌─────┘     ┌─────┘
                    ▼               ▼           ▼
             plan-manager.js   SKILL.md    {role}-prompt.md
             web-server.js     workflows   agent instructions
             templates/base.js
```

### Two-Level Context System

```
Project Context (persistent, shared across scenarios)
│
│  Created once via /plan-context create
│  Captures: dev setup, relationships, worktree steps, conventions, known issues
│  Stored at: [workspace]/plans/.contexts/{name}/
│
├── Scenario A (.plan-context.json inherits from project context)
│   ├── analysis.html
│   ├── design.html
│   ├── state-machine.html
│   ├── test-plan.html
│   ├── test-cases.html
│   ├── implementation-plan.html
│   └── review-report.html
│
├── Scenario B (.plan-context.json inherits from project context)
│   └── ...
│
└── Scenario C ...
```

---

## Directory Structure

### Project Contexts (persistent, per-project)

```
[workspace-root]/plans/.contexts/
├── index.json                          # Context registry
├── DevXApps-MicroPortal/
│   ├── context.json                    # Machine-readable: dev setup, relationships,
│   │                                   #   worktree steps, build commands, architecture,
│   │                                   #   team conventions, external deps, known issues
│   └── context.html                    # Interactive HTML reference document
└── Metagraph-API/
    ├── context.json
    └── context.html
```

### Scenario Plans (per-task/feature)

```
[repo-root]/plans/{scenario-name}/
├── manifest.json               # Scenario metadata + review status
├── .plan-context.json          # Scenario context (references parent project context)
├── analysis.html               # Deep codebase analysis with health scores
├── design.html                 # Architecture, data models, API contracts, UX
├── state-machine.html          # Entity states, transitions, SVG diagrams
├── test-plan.html              # E2E scenarios with interactive checkboxes
├── test-cases.html             # Detailed test cases with P0/P1/P2 filtering
├── implementation-plan.html    # File-level steps with dependency graph
├── review-report.html          # Consolidated review findings
└── dashboard.html              # Navigation hub linking all documents
```

---

## Workflow

```
/plan-context create ──── Guided conversation (once per project)
         │
         │  Captures: dev environment, project relationships, worktree setup,
         │  build commands, architecture decisions, team conventions,
         │  external dependencies, known issues
         │
/plan-init ──────────── Select context + create/select scenario
         │
/plan-analyze ────────── Deep codebase analysis → analysis.html
         │
/plan-review analysis ── Section-by-section review
         │
/plan-design ─────────── Architecture & design → design.html
         │
    ┌────┴────┐
    │         │
/plan-state   /plan-test-plan ── state-machine.html, test-plan.html
    │         │
    │    /plan-test-cases ────── test-cases.html
    │         │
    └────┬────┘
         │
/plan-implementation ──── File-level steps → implementation-plan.html
         │
/plan-review-cycle ────── Review all docs + cross-document consistency
         │                → review-report.html
         │
/plan-full ────────────── Orchestrates entire workflow with checkpoints
```

---

## Skills Reference

### Context & Setup

| Skill | Description | Input |
|-------|-------------|-------|
| `/plan-context` | Create, list, select, or edit persistent project contexts | `create`, `select`, `edit {name}`, `view {name}`, `list` |
| `/plan-context create` | Guided 9-phase conversation: projects, dev environment, worktree setup, build/test, architecture, conventions, dependencies, known issues | Context name |
| `/plan-init` | Select project context, analyze codebase, create or select a scenario | Context name or repo path |

### Document Generation

Each generation skill dispatches a specialized agent team:

| Skill | Agents | Output | Depends On |
|-------|--------|--------|-----------|
| `/plan-analyze` | Architect + Frontend + Backend + Tester + Writer | `analysis.html` | `.plan-context.json` |
| `/plan-design` | Architect + PM + Writer | `design.html` | `.plan-context.json` |
| `/plan-state-machine` | Architect + Writer | `state-machine.html` | `design.html` |
| `/plan-test-plan` | PM + Tester + Writer | `test-plan.html` | `design.html` |
| `/plan-test-cases` | Tester + Frontend Dev + Writer | `test-cases.html` | `design.html` + `test-plan.html` |
| `/plan-implementation` | All 6 agents | `implementation-plan.html` | `design.html` |
| `/plan-full` | All (orchestrated) | All documents + `dashboard.html` | Runs `/plan-init` first |

### Review

| Skill | Description | Input |
|-------|-------------|-------|
| `/plan-review` | Interactive section-by-section review of one document | File path, filename, or fuzzy name (`design`, `test-plan`, `impl`, etc.) |
| `/plan-review-cycle` | Full review across all documents in dependency order with cross-document consistency checks | Scenario name or path, `--fast` flag |

---

## Agent Team

Every document is produced (or reviewed) by a team of specialized agents, each operating from a role-specific prompt template:

| Role | Prompt | Focus |
|------|--------|-------|
| **Architect** | `prompts/architect-prompt.md` | Data models, API contracts, SVG architecture diagrams, dependency graphs, state transitions, security |
| **PM** | `prompts/pm-prompt.md` | Requirements, user stories, acceptance criteria (Given/When/Then), scope, milestones, priorities |
| **Frontend Dev** | `prompts/frontend-dev-prompt.md` | Components, state management, routing, accessibility, i18n, interaction flows |
| **Backend Dev** | `prompts/backend-dev-prompt.md` | API implementation, data access, service integration, error handling, deployment |
| **Tester** | `prompts/tester-prompt.md` | E2E scenarios, test cases (TC-{CAT}-{NUM}), P0/P1/P2 priorities, coverage matrices |
| **Writer** | `prompts/writer-prompt.md` | HTML assembly, CSS theme system, sidebar navigation, cross-references, print styles |

---

## MCP Tools

The plugin exposes 6 MCP tools via a local stdio server:

| Tool | Input | Description |
|------|-------|-------------|
| `plan_list_scenarios` | `workspaceRoot` | Scan workspace for all `plans/` directories, list scenarios with file inventory and completion flags |
| `plan_create_scenario` | `repoRoot`, `name`, `description?`, `workItem?`, `tags?` | Create scenario directory with `manifest.json` |
| `plan_get_files` | `scenarioPath` | List plan files with metadata (name, path, type, size, modified) |
| `plan_check_completion` | `scenarioPath`, `repoRoot` | Parse `implementation-plan.html` for steps, check code for evidence of completion |
| `plan_get_context` | `repoRoot` | Analyze codebase: read CLAUDE.md, package.json, .csproj to determine project type, tech stack, patterns, conventions |
| `plan_serve_dashboard` | `workspaceRoot`, `port?` | Start local HTTP server at `http://localhost:3847` for browsing plans |

### Dashboard Routes

| Route | Description |
|-------|-------------|
| `GET /` | Dashboard overview — scenario cards with completion bars |
| `GET /scenario/:name` | Scenario detail — all plan files with status indicators |
| `GET /view?path=<abs-path>` | Serve any HTML plan file directly |
| `GET /api/scenarios` | JSON: all scenarios |
| `GET /api/scenario/:name/status` | JSON: completion status |

---

## HTML Document Features

All generated HTML files share a consistent design system:

### Theme System
- **Dark theme** (default): `--bg: #0d1117`, `--accent: #58a6ff`, `--surface: #161b22`
- **Light theme**: `--bg: #ffffff`, `--accent: #0969da`, `--surface: #f6f8fa`
- Toggle persisted in localStorage

### Navigation
- Fixed left sidebar (260px) with section links and active state tracking (IntersectionObserver)
- Top navigation bar linking to sibling plan files (Analysis, Design, State Machines, Test Plan, Test Cases, Implementation, Review)
- Responsive: sidebar collapses to hamburger on mobile (<900px)

### Interactive Elements
- Checkboxes with progress tracking (test plans, test cases)
- Expand/collapse sections with rotation arrow animation
- Filter by priority (P0/P1/P2), category, and search text
- Bulk operations: Expand All, Collapse All, Check All, Uncheck All
- Export/Import progress state (JSON via localStorage)
- Print-friendly styles hiding nav and expanding collapsed sections

### Visual Components
- **Badges**: `.badge-green`, `.badge-yellow`, `.badge-red`, `.badge-blue`, `.badge-purple`
- **Callouts**: `.callout`, `.callout-warn`, `.callout-important` with left border accent
- **Node cards**: `.node-card` for entity definitions with state badges
- **Diagram boxes**: `.diagram-box` for inline SVG diagrams
- **Scenario cards**: `.scenario` with numbered header, step checkboxes, state transitions
- **Progress bars**: Track + fill with transition animation
- **Tables**: Full-width, alternating row backgrounds, sticky headers
- **Code blocks**: Monospace with border, rounded corners, syntax-colored

---

## Project Context Details

A project context captures 8 dimensions of project knowledge that code analysis alone cannot discover:

| Dimension | What It Captures | Example |
|-----------|-----------------|---------|
| **Projects & Relationships** | Repos involved, how they connect | "MicroPortalApp calls Metagraph API via REST" |
| **Dev Environment** | Prerequisites, setup steps, env vars, local services, VPN | "Node 18+, init.cmd, npm install --legacy-peer-deps" |
| **Worktree Setup** | Post-worktree-add steps, shared vs isolated state, issues | "Re-run init.cmd, npm install per-worktree, copy .env.local" |
| **Build & Test** | Commands, timing, quirks | "Jest needs 10GB memory, first NuGet restore after VPN may fail" |
| **Architecture** | Key decisions with rationale and dates, data flow | "Zustand over Redux since 2025-06, team agreement" |
| **Team Conventions** | Branching, PR process, i18n, testing, deployment | "u/{alias}/ branch prefix, 2 approvers, squash merge" |
| **External Dependencies** | Services, databases, auth, rate limits | "Metagraph PPE API, S2S via MSI, 100 req/s" |
| **Known Issues** | Gotchas and workarounds with severity | "CredScan false positives on test certs — add to suppressions" |

### Context Enrichment

Contexts grow organically. After `/plan-analyze` discovers new patterns, it offers to add them. When you mention workarounds during conversation, the skill offers to save them. The context becomes the team's living knowledge base.

---

## Review Workflow

### `/plan-review {file}`

Section-by-section interactive review:

1. **Parse**: Extract `<h2>` sections from the HTML document
2. **Dispatch**: Send each section to role-specific reviewer agents in parallel
3. **Present**: Show findings per section with severity (CRITICAL / WARNING / INFO)
4. **Interact**: User chooses per section:
   - `[f]` Fix — auto-apply suggested fixes, re-review
   - `[s]` Skip — mark reviewed, move on
   - `[d]` Discuss — ask questions about the findings
   - `[e]` Edit — make manual changes
   - `[r]` Re-review — re-run after changes
5. **Track**: Progress saved to `.review-state.json` (resumable if interrupted)

Accepts arguments: filename (`design.html`), absolute path, or fuzzy name (`design`, `impl`, `states`).

### `/plan-review-cycle`

Full review across all documents:

1. Reviews in dependency order: analysis -> design -> state-machine -> test-plan -> test-cases -> implementation-plan
2. Auto-approves sections with no issues (only pauses on CRITICAL/WARNING)
3. Runs **cross-document consistency checks** between each document:
   - Terminology alignment
   - Data model consistency
   - Acceptance criteria traceability
   - Flow coverage (design flows -> test scenarios -> implementation steps)
4. Generates `review-report.html` with consolidated findings
5. Supports `--fast` flag for quick reviews (skip INFO findings entirely)

---

## Plugin Structure

```
plan-harness/                            27 source files, ~9,000 lines
├── .claude-plugin/
│   └── plugin.json                      Plugin metadata
├── .mcp.json                            MCP server configuration
├── README.md                            This file
│
├── local-proxy/                         MCP server + web dashboard
│   ├── package.json                     Dependencies: @modelcontextprotocol/sdk
│   ├── start.js                         Bootstrap (auto-installs on first run)
│   └── src/
│       ├── index.js                     MCP server: 6 tools via stdio transport
│       ├── plan-manager.js              Plan file operations (list, create, check completion)
│       ├── web-server.js                Local HTTP dashboard (node:http, no external deps)
│       └── templates/
│           └── base.js                  HTML template system: shared CSS, sidebar, theme,
│                                        and generators for all 7 document types
│
├── skills/                              11 skill definitions
│   ├── plan-context/SKILL.md            Persistent project context management
│   ├── plan-init/SKILL.md               Select context + create/select scenario
│   ├── plan-analyze/SKILL.md            Deep codebase analysis document
│   ├── plan-design/SKILL.md             Architecture & design document
│   ├── plan-state-machine/SKILL.md      State machine diagrams & transitions
│   ├── plan-test-plan/SKILL.md          E2E test plan with interactive scenarios
│   ├── plan-test-cases/SKILL.md         Test cases with priority filtering
│   ├── plan-implementation/SKILL.md     File-level implementation steps
│   ├── plan-review/SKILL.md             Section-by-section interactive review
│   ├── plan-review-cycle/SKILL.md       Full review cycle with consistency checks
│   └── plan-full/SKILL.md              Complete workflow orchestrator
│
└── prompts/                             6 agent role templates
    ├── architect-prompt.md              Architecture, data models, SVG diagrams
    ├── pm-prompt.md                     Requirements, user stories, acceptance criteria
    ├── frontend-dev-prompt.md           Components, state, routing, accessibility
    ├── backend-dev-prompt.md            API, data access, services, deployment
    ├── tester-prompt.md                 Test scenarios, test cases, coverage
    └── writer-prompt.md                 HTML assembly, CSS themes, cross-references
```

---

## Quick Start

### 1. Install the plugin

```bash
claude plugins marketplace add https://github.com/wangcansunking/sunky-claude-code-marketplace
claude plugins install plan-harness@canwa-claude-plugins
```

### 2. Create a project context (once per project)

```
/plan-context create
```

Guided conversation captures dev setup, project relationships, worktree customizations, and team conventions. This is done **once** and reused for all future scenarios.

### 3. Initialize a scenario

```
/plan-init
```

Selects your project context, analyzes the codebase, and creates a scenario directory for your feature/task.

### 4. Generate plans

```
/plan-full                              # Full workflow with review checkpoints
```

Or use individual skills:

```
/plan-analyze                           # Codebase analysis
/plan-design                            # Design document
/plan-state-machine                     # State machine diagrams
/plan-test-plan                         # E2E test plan
/plan-test-cases                        # Detailed test cases
/plan-implementation                    # Implementation steps
```

### 5. Review

```
/plan-review design.html                # Review one document
/plan-review-cycle                      # Review all documents
/plan-review-cycle --fast               # Quick review (critical/warning only)
```

### 6. Browse

Use the MCP tool `plan_serve_dashboard` to start a local web server, or open the HTML files directly in a browser.
