# Context System Design

This document captures the core concepts and rules for the plan-harness context system. All skills and prompts should reference this for consistent behavior.

## Core Concept

A **context** is a markdown file that provides instructions to the plan generation pipeline. It is analogous to `CLAUDE.md` — the LLM reads it and follows the instructions directly. No JSON schema, no parsing.

## Design Principles (Learned from Claude Code's Prompt Architecture)

Claude Code orchestrates prompts through 7 layers with three key patterns:

1. **Three-tier visibility**: descriptions always in context → full body loads on demand → detail on invocation
2. **Lazy loading over eager loading**: path-scoped rules only load when matching files are accessed
3. **Compaction-aware**: root instructions survive compaction, dynamic instructions must re-trigger

We apply these patterns to our context system.

## Context is NOT per-project

Context granularity is flexible. A context can describe:

| Granularity | Example | When to use |
|-------------|---------|-------------|
| **Multi-project** | `fullstack-app.md` — frontend + backend + shared libs | Cross-cutting features that span repos |
| **Single project** | `devxapps-project.md` — one repo's build, conventions, architecture | Most common starting point |
| **Feature area** | `mcp-server-tools.md` — MCP server + backend API it calls | Feature that touches specific components |
| **Page group** | `portal-admin-pages.md` — 5 admin pages, their APIs, perf baselines | Performance audit of specific pages |
| **Single API** | `metagraph-permissions-api.md` — one API domain with endpoints and data model | Narrow feature or bugfix |
| **Dev environment** | `local-dev-setup.md` — VPN, ports, creds, worktree quirks | Setup-heavy projects |
| **Generation rules** | `performance-audit.md` — doc set, chart types, anti-patterns | Controls how plan docs look |

**The more specific the context, the better the LLM output.** A context that says "this plan is about the 5 admin pages in DevCenter, here are their routes, here are the APIs they call, here are the current load times" produces much better plans than a generic "this is a React + .NET project" context.

## Composition

A plan selects **multiple contexts** (multi-select). They compose in order — later contexts override earlier ones where they conflict.

Typical compositions:

```
# Performance optimization on specific pages
devxapps-project.md          (project-level: build, conventions, architecture)
  + portal-admin-pages.md    (narrow: specific pages, APIs, baselines)
  + performance-audit.md     (rules: 4 docs, data-driven, Tokyo Night)

# New feature spanning frontend and backend
devxapps-project.md          (frontend project knowledge)
  + metagraph-api.md         (backend project knowledge)
  + feature-planning.md      (rules: full 7-doc suite)

# MCP tool integration
mcp-server-tools.md          (MCP server + backend API knowledge)
  + lean.md                  (rules: minimal 2-doc planning)
```

## Context File Format

Every context has YAML frontmatter with **three tiers of content** (following Claude Code's three-tier visibility pattern):

```markdown
---
name: context-name
description: One-line description shown in the selector (always in context)
tags: [project, generation-rules, scenario, team, ...]
agents: [architect, pm, frontend-dev, backend-dev, tester, writer]
---

# Title

## Summary
<!-- TIER 1: Always injected. Survives compaction. Keep under 200 words. -->
Brief overview of what this context provides and when it matters.
Key facts that every agent needs regardless of their role.

## Details
<!-- TIER 2: Injected into agent prompts when relevant (matched by tags/agents). -->
Full project knowledge, generation rules, conventions, etc.

## Reference
<!-- TIER 3: Available on demand. Agents read specific sections when needed. -->
Detailed tables, API inventories, page lists, performance baselines, etc.
```

### Frontmatter Fields

| Field | Required | Purpose |
|-------|----------|---------|
| `name` | Yes | Identifier used in `manifest.json` contexts array and the selector |
| `description` | Yes | One-line description, always visible in context (~tokens of a skill description) |
| `tags` | No | Categorization: `project`, `generation-rules`, `scenario`, `team`, etc. |
| `agents` | No | Which agent roles should receive this context. If omitted, all agents get it. |

### The `agents` Field: Selective Injection

Not every agent needs every context. The `agents` field controls routing:

```markdown
---
name: portal-admin-pages
description: Admin page inventory — routes, APIs, perf baselines for 5 portal admin pages
tags: [scenario]
agents: [architect, frontend-dev, tester]
---
```

This context is only injected into Architect, Frontend Dev, and Tester agent prompts. The PM and Backend Dev agents don't see it (unless they explicitly request it).

```markdown
---
name: performance-audit
description: Generation rules — 4 docs, data-driven, Tokyo Night, anti-patterns
tags: [generation-rules]
agents: [writer]
---
```

Generation rules only go to the Writer agent (who assembles the final HTML). Other agents don't need to know about chart types or CSS themes.

If `agents` is omitted, all agents receive the context (backward compatible).

## Three-Tier Loading

Inspired by Claude Code's lazy loading:

### Tier 1: Descriptions (always in context)

Every selected context's `description` lives in its frontmatter. Skills read this from the `.md` file header without parsing the full body:

```yaml
---
name: performance-audit
description: Generation rules — 4 docs, data-driven analysis, Tokyo Night theme
---
```

This is ~50 tokens per context. Agents always know what contexts are available.

### Tier 2: Summary + Relevant Sections (injected into agent prompts)

When dispatching agents, the skill:
1. Reads each context `.md` file
2. Checks the `agents` field — skip if the current agent isn't listed
3. Injects the `## Summary` section (always) + `## Details` section (when relevant)

The Writer agent gets generation rules. The Architect gets project architecture. The Tester gets test conventions. Not everyone gets everything.

### Tier 3: Reference (on demand)

`## Reference` sections contain detailed data (API inventories, page tables, perf baselines). Agents read these sections explicitly when needed, rather than having them injected into every prompt.

This mirrors how Claude Code handles skill bodies: descriptions always in context, full bodies load on invocation only.

## Storage

```
[workspace-root]/plans/.contexts/    # User's context files
plan-harness/contexts/               # Built-in templates (copied to workspace on /plan-context init)
```

## How Skills Consume Contexts

Skills follow a **layered loading** approach:

### Step 0: Load context list from manifest

```
Read manifest.json → get contexts array (e.g., ["devxapps-project", "performance-audit"])
Resolve each name to plans/.contexts/{name}.md
```

### Step 1: Read and route contexts

```
For each context .md file:
  1. Parse frontmatter (name, description, tags, agents)
  2. Check `agents` field against current agent role
  3. If current agent is listed (or agents is omitted):
     - Extract ## Summary → always inject
     - Extract ## Details → inject if agent role matches
  4. If current agent is NOT listed:
     - Skip (agent doesn't need this context)
```

### Step 2: Inject into agent prompt

```
CONTEXT (from devxapps-project.md — project knowledge):
{Summary section}
{Details section}

CONTEXT (from performance-audit.md — generation rules):
{Summary section}
{Details section — only if this agent is writer}

YOUR TASK:
{skill-specific instructions}
```

Agents only see what they need. The Writer gets generation rules and anti-patterns. The Architect gets project architecture. The PM gets conventions and scope.

## Relationship to manifest.json

`manifest.json` is the single source of truth for a scenario. It stores metadata AND the context selection:

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

No separate state file. Skills resolve context names to `.md` files by looking in `plans/.contexts/`. Context content is read from disk at invocation time — edits take effect immediately.

## Built-in Templates

The plugin ships three generation rule contexts:

| Template | Documents | Best for |
|----------|-----------|----------|
| `feature-planning.md` | 7 docs (analysis, design, state-machine, test-plan, test-cases, impl-plan, review) | New features, major refactors |
| `performance-audit.md` | 4 docs (index, analysis, design, impl-plan) | Performance optimization, resource analysis |
| `lean.md` | 2 docs (design, impl-plan) | Spikes, prototypes, small changes |

Plus `_example-project.md` as a template for project-specific contexts.

## Key Rules

1. **Context is mandatory** — `/plan-init` requires at least one context. No skip.
2. **Multi-select** — a plan can compose multiple contexts.
3. **Order matters** — later contexts override earlier ones.
4. **Markdown, not JSON** — contexts are LLM-native instructions.
5. **Encourage specificity** — narrow contexts produce better output than broad ones.
6. **Reference, not copy** — `manifest.json` stores context names; `.md` files are read from disk. Edits are live.
7. **Three-tier loading** — descriptions always present, summaries for relevant agents, details on demand.
8. **Agent routing** — use `agents` frontmatter to control which agents see which contexts.
9. **Compaction-safe** — `## Summary` sections should contain the essential facts that must survive context compaction. Keep under 200 words.
10. **Enrichment** — skills can offer to update contexts when they discover new knowledge.
