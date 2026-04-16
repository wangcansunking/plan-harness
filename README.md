# plan-harness

A Claude Code plugin for structured project planning. Generates interactive HTML documents through specialized agent teams — with composable markdown contexts that adapt the output to your project, scenario, and style.

## Guiding Principles

### 1. Context is Everything

Context files (`.md`) are the single most important input to plan quality. They are like `CLAUDE.md` but for specific scenarios — the LLM reads them and follows the instructions directly.

**The more specific the context, the better the output.** A context that says "these 5 admin pages, these API endpoints, these current load times" produces dramatically better plans than "this is a React + .NET project."

Contexts are composable (multi-select) and can be at any granularity:
- Whole project → specific feature area → specific pages/APIs
- Dev environment → build setup → team conventions
- Generation rules: which docs, what charts, what theme

### 2. Three-Tier Loading (Learned from Claude Code)

Claude Code's prompt architecture uses lazy loading — skill descriptions are always in context (~450 tokens), full bodies load only when invoked. We apply the same pattern:

| Tier | What | When loaded | Token cost |
|------|------|-------------|-----------|
| **Tier 1** | Context name + description (from frontmatter) | Always — names stored in `manifest.json`, descriptions read from frontmatter | ~50 per context |
| **Tier 2** | Summary + details sections | When dispatching agents — filtered by `agents` frontmatter | Variable |
| **Tier 3** | Reference data (API tables, baselines, etc.) | On demand — agents read when needed | Only when relevant |

### 3. Agent Routing

Not every agent needs every context. The `agents` field in frontmatter controls who sees what:
- Writer gets generation rules (chart types, theme, anti-patterns)
- Architect gets project architecture and API maps
- Tester gets test conventions and coverage requirements
- Everyone gets the summary section

### 4. Markdown, Not Config

Contexts, prompts, and skills are all markdown. The LLM reads them directly — no JSON schemas, no parsing layers, no rigid structures. This means:
- Users can read and edit contexts in any text editor
- The LLM follows natural language instructions, not configuration flags
- New rules are just paragraphs, not schema migrations

### 5. Self-Contained Output

Every generated HTML file embeds all CSS and JS inline. No CDN, no external dependencies. Open in any browser, share with teammates, print to PDF.

---

## Quick Start

```bash
# Install
claude plugins marketplace add https://github.com/wangcansunking/sunky-claude-code-marketplace
claude plugins install plan-harness@canwa-claude-plugins

# Import built-in context templates
/plan-context init

# Create a project-specific context (guided conversation)
/plan-context create

# Start planning — select contexts, create scenario
/plan-init

# Generate all documents
/plan-full
```

---

## How It Works

```
/plan-context create ──── Create markdown context files (.md)
         │                (project knowledge, generation rules, or both)
         │
/plan-init ──────────── Multi-select contexts + create/select scenario
         │              → updates manifest.json with contexts
         │
         ├── /plan-analyze ────── analysis.html
         ├── /plan-design ─────── design.html
         ├── /plan-test-plan ──── test-plan.html     (if enabled by context)
         ├── /plan-test-cases ─── test-cases.html    (if enabled by context)
         ├── /plan-state-machine  state-machine.html  (if enabled by context)
         └── /plan-implementation  implementation-plan.html
                    │
         /plan-review ─────────── Section-by-section review
         /plan-review-cycle ───── Full review with consistency checks
```

Which documents get generated depends on the selected generation rules context:
- **feature-planning**: 7 docs (full suite with tests and state machines)
- **performance-audit**: 4 docs (index, analysis, design, implementation)
- **lean**: 2 docs (design + implementation)

---

## Context System

### What is a Context?

A markdown file in `plans/.contexts/` that provides instructions to the planning pipeline. Two typical kinds:

| Kind | Example | Contains |
|------|---------|----------|
| **Project knowledge** | `devxapps-project.md` | Paths, build commands, architecture, conventions, known issues |
| **Generation rules** | `performance-audit.md` | Which docs to generate, content style, chart types, theme, anti-patterns |

A single context can contain both. Contexts compose — select multiple during `/plan-init`.

### Context File Format

```markdown
---
name: my-context
description: One-line description (always visible in Tier 1)
tags: [project, generation-rules]
agents: [architect, writer]
---

# Title

## Summary
<!-- Always injected. Keep under 200 words. -->

## Details
<!-- Injected for matching agents only. -->

## Reference
<!-- Read on demand by agents that need it. -->
```

### Composition Example

```
devxapps-project.md          (project: build, conventions, architecture)
  + portal-admin-pages.md    (scenario: specific pages, APIs, baselines)
  + performance-audit.md     (rules: 4 docs, Tokyo Night, anti-patterns)
  = effective context for this plan
```

Later contexts override earlier ones where they conflict. Order matters.

---

## Agent Team

| Role | Prompt | Focus |
|------|--------|-------|
| **Architect** | `prompts/architect-prompt.md` | Data models, API contracts, SVG diagrams, dependency graphs |
| **PM** | `prompts/pm-prompt.md` | Requirements, user stories, acceptance criteria, scope |
| **Frontend Dev** | `prompts/frontend-dev-prompt.md` | Components, state management, routing, accessibility |
| **Backend Dev** | `prompts/backend-dev-prompt.md` | API implementation, data access, services, deployment |
| **Tester** | `prompts/tester-prompt.md` | E2E scenarios, test cases, coverage matrices |
| **Writer** | `prompts/writer-prompt.md` | HTML assembly, CSS themes, sidebar nav, cross-references |

---

## MCP Tools

6 tools via local stdio server:

| Tool | Description |
|------|-------------|
| `plan_list_scenarios` | Scan workspace for all scenarios with file inventory |
| `plan_create_scenario` | Create scenario directory with manifest |
| `plan_get_files` | List plan files with metadata |
| `plan_check_completion` | Check implementation progress from code evidence |
| `plan_get_context` | Analyze codebase: tech stack, patterns, conventions |
| `plan_serve_dashboard` | Start local HTTP dashboard at `localhost:3847` |

---

## Skills Reference

| Skill | Description |
|-------|-------------|
| `/plan-context` | Create, list, edit, import context files |
| `/plan-init` | Multi-select contexts + create/select scenario |
| `/plan-analyze` | Deep codebase analysis → `analysis.html` |
| `/plan-design` | Architecture & design → `design.html` |
| `/plan-state-machine` | State diagrams → `state-machine.html` |
| `/plan-test-plan` | E2E test scenarios → `test-plan.html` |
| `/plan-test-cases` | Test case catalog → `test-cases.html` |
| `/plan-implementation` | Implementation steps → `implementation-plan.html` |
| `/plan-review` | Section-by-section review of one document |
| `/plan-review-cycle` | Full review with cross-document consistency |
| `/plan-full` | Orchestrate entire workflow with checkpoints |

---

## Plugin Structure

```
plan-harness/
├── contexts/                    Built-in context templates
│   ├── feature-planning.md      Full 7-doc suite
│   ├── performance-audit.md     4-doc data-driven audit
│   ├── lean.md                  Minimal 2-doc planning
│   └── _example-project.md     Project context template
├── skills/                      11 skill definitions (SKILL.md)
├── prompts/                     6 agent role templates
├── local-proxy/                 MCP server + web dashboard
│   ├── start.js                 Bootstrap (auto-installs deps)
│   └── src/
│       ├── index.js             MCP server (6 tools, stdio)
│       ├── plan-manager.js      Plan file operations
│       ├── web-server.js        HTTP dashboard (node:http)
│       └── templates/base.js    HTML template system
└── docs/
    ├── overview.html            Static overview
    └── context-design.md        Context system design document
```
