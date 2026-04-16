---
name: plan-context
description: Create, select, or edit a persistent project context through guided conversation. Captures dev environment, project relationships, worktree setup, architecture, and team conventions that all scenarios inherit. Use when starting planning, switching projects, or when the user says "create context", "plan-context", "setup context".
---

# plan-context

A **context** is a markdown file (like CLAUDE.md) that provides instructions and knowledge to the plan generation pipeline. Contexts live in `[workspace-root]/plans/.contexts/` and are composed together — a plan can use multiple contexts simultaneously.

## Why Markdown

Contexts are markdown, not JSON or config. They are instructions the LLM reads and follows directly — project knowledge, generation rules, conventions, anti-patterns. No parsing, no schema. The LLM reads the `.md` file and adapts its behavior.

## Two Kinds of Context

Contexts are just `.md` files, but they tend to fall into two categories:

| Kind | Contains | Examples |
|------|----------|---------|
| **Project context** | Project knowledge that code analysis alone can't discover — dev setup, build quirks, team conventions, known issues, architecture decisions | `devxapps-project.md`, `metagraph-api.md` |
| **Generation rules** | How plan documents should be generated — document set, content style per doc, chart types, CSS theme, nav structure, anti-patterns | `feature-planning.md`, `performance-audit.md`, `lean.md` |

These are not enforced types — a single context file can contain both project knowledge and generation rules. The tags in the frontmatter help users identify what a context provides.

## Composition

When a plan uses multiple contexts, they are **composed in order**. Later contexts can override earlier ones. This lets you separate concerns:

```
devxapps-project.md     (project knowledge: paths, build, conventions)
  + performance-audit.md  (generation rules: 4 docs, Tokyo Night, anti-patterns)
  = effective context for this plan
```

Or combine multiple project contexts:

```
devxapps-project.md     (frontend project knowledge)
  + metagraph-api.md      (backend project knowledge)
  + feature-planning.md   (generation rules: full 7-doc suite)
  = effective context for this plan
```

Skills read all selected contexts in order and follow the combined instructions.

## Storage

```
[workspace-root]/plans/.contexts/
  ├── devxapps-project.md        # Project context
  ├── metagraph-api.md           # Project context
  ├── feature-planning.md        # Generation rules (shipped with plugin as template)
  ├── performance-audit.md       # Generation rules (shipped with plugin as template)
  ├── lean.md                    # Generation rules (shipped with plugin as template)
  ├── team-alpha-conventions.md  # Custom context
  └── index.md                   # Registry listing all contexts with descriptions
```

**Built-in templates**: The plugin ships with generation rule contexts in `plan-harness/contexts/`. On first use or when the user runs `/plan-context init`, these templates are copied to `[workspace-root]/plans/.contexts/` where they can be customized.

## Context File Format

Every context is a markdown file with YAML frontmatter:

```markdown
---
name: my-context
description: One-line description shown in the selector
tags: [project, generation-rules, team]
---

# Context Title

Free-form markdown content. The LLM reads this and follows the instructions.

## Sections

Organize however makes sense for this context.
```

The only required frontmatter fields are `name` and `description`. Tags are optional but help with the selector display.

## Input

| Invocation | Behavior |
|------------|----------|
| `/plan-context` | List existing contexts, offer to create or edit |
| `/plan-context create` | Start guided context creation |
| `/plan-context create my-project` | Create a named context |
| `/plan-context edit my-project` | Edit an existing context |
| `/plan-context init` | Copy built-in template contexts to workspace |

## Workflow

### Action: `list` (default)

1. Scan `[workspace-root]/plans/.contexts/` for `.md` files (excluding `index.md`)
2. Read frontmatter from each file
3. Display:

```
=== Available Contexts ===

 #  Name                     Tags                 Description
 1  devxapps-project         [project]            DevXApps MicroPortal — build setup, architecture, conventions
 2  metagraph-api            [project]            Metagraph API — Neo4j, T4 templates, OData
 3  feature-planning         [generation-rules]   Full 7-doc planning suite for new features
 4  performance-audit        [generation-rules]   4 docs, data-driven, Tokyo Night theme
 5  lean                     [generation-rules]   Minimal 2-doc planning for spikes
 6  team-alpha-conventions   [team]               Team Alpha PR process, deploy gates

Options:
  [c]   Create a new context
  [e N] Edit context #N
  [i]   Import built-in templates
```

### Action: `create`

Guided conversation that produces a `.md` file. The conversation adapts based on what the user wants to create.

#### Step 1: What kind of context?

```
What kind of context do you want to create?

 1. Project context      — capture project knowledge (paths, build, conventions, issues)
 2. Generation rules     — define how plan documents should look (doc set, style, theme)
 3. Both in one file     — project knowledge + generation rules together
 4. Other                — custom context (I'll describe what I need)

> _
```

#### Step 2: Name & description

```
Context name (used as filename, kebab-case):
> _

One-line description:
> _
```

#### Step 3: Guided content (adapts to type)

**For project contexts**, walk through these topics conversationally:

1. **Projects & paths** — which repos, source paths, tech stack, relationships
2. **Dev environment** — prerequisites, setup steps, local services, VPN
3. **Build & test** — commands, quirks, CI
4. **Architecture** — overview, key decisions, data flow
5. **Conventions** — branching, PR, i18n, testing, deployment
6. **Known issues** — gotchas, workarounds

**For generation rules**, walk through:

1. **Document set** — which documents to generate (show the full list, user picks y/n each)
2. **Content rules per doc** — what should each document focus on, what to avoid
3. **Chart guidance** — which visualization types per document
4. **Theme** — GitHub Dark, Tokyo Night, or custom CSS variables
5. **Navigation** — which links in nav bar, theme toggle position
6. **Anti-patterns** — rules the Writer agent must follow

**For "both"**, walk through all topics above.

**For "other"**, ask the user to describe what they want, then assemble the markdown.

At each step, the user can say "skip" to move on.

#### Step 4: Assemble & write

1. Assemble responses into a markdown file with frontmatter
2. Write to `[workspace-root]/plans/.contexts/{name}.md`
3. Update `index.md` if it exists

```
Context "devxapps-project" created!

  Path: C:/MCDC/plans/.contexts/devxapps-project.md

  This context is now available for selection in /plan-init.
  You can edit it anytime with: /plan-context edit devxapps-project
```

### Action: `edit`

1. Read the existing `.md` file
2. Display its sections as a menu:
   ```
   Editing: devxapps-project.md
   
   Sections found:
    1. Projects          (2 projects listed)
    2. Dev Environment   (3 setup steps)
    3. Build & Test      (4 commands)
    4. Architecture      (2 key decisions)
    5. Conventions       (6 items)
    6. Known Issues      (2 items)
   
   Which section to edit? (1-6, or "all", or "raw" to edit the file directly)
   ```
3. For the selected section, show current content and ask what to change
4. Rewrite the section in the markdown file

### Action: `init`

Copy built-in template contexts from `plan-harness/contexts/` to `[workspace-root]/plans/.contexts/`:

1. Check which templates already exist in the workspace
2. Copy missing ones, skip existing (don't overwrite user customizations)
3. Report what was copied:
   ```
   Copied built-in contexts to C:/MCDC/plans/.contexts/:
     [new] feature-planning.md
     [new] performance-audit.md
     [new] lean.md
     [skip] _example-project.md (already exists)
   ```

## Integration with /plan-init

`/plan-init` always presents a context selector as Step 0. The selector supports **multi-select** — a plan can compose multiple contexts:

```
=== Select Contexts ===

Select one or more contexts for this plan.
(Space to toggle, Enter to confirm)

 [x] 1. devxapps-project         [project]            DevXApps project knowledge
 [ ] 2. metagraph-api            [project]            Metagraph API knowledge
 [x] 3. performance-audit        [generation-rules]   4 docs, data-driven, Tokyo Night
 [ ] 4. feature-planning         [generation-rules]   Full 7-doc suite
 [ ] 5. lean                     [generation-rules]   Minimal 2-doc planning
 [ ] 6. team-alpha-conventions   [team]               Team Alpha conventions

─────────────────────────────────
 [c] Create new context
```

The selected contexts are stored in the scenario's `manifest.json`:

```json
{
  "scenario": "portal-perf-opt",
  "description": "Optimize portal page load performance",
  "contexts": ["devxapps-project", "performance-audit"]
}
```

Skills resolve each name to `plans/.contexts/{name}.md`, read the files in order, and follow the combined instructions. If two contexts conflict (e.g., different theme settings), the later one wins.

## Integration with plan-* skills

Every plan skill starts with:

1. Read `manifest.json` → get the `contexts` array
2. Read each context `.md` file in order
3. Concatenate them into a single context block
4. Inject the combined context into agent prompts

This means agents receive something like:

```
CONTEXT:
--- from devxapps-project.md ---
{full markdown content}

--- from performance-audit.md ---
{full markdown content}

YOUR TASK:
...
```

The LLM reads both and follows the combined instructions naturally — project knowledge from one, generation rules from the other.

## Context Enrichment

After any skill completes, if it discovers knowledge not in the selected contexts, it can offer to update them:

```
I noticed this repo uses T4 code generation (not mentioned in devxapps-project.md).
Add this to the Architecture section? [y/n]
```

## Error Handling

| Error | Resolution |
|-------|-----------|
| `.contexts/` directory doesn't exist | Create it, run `init` to copy templates |
| Context file is malformed | Show the error, offer to fix or recreate |
| No contexts selected in /plan-init | Context is required — must select at least one |
| Conflicting rules across contexts | Later context wins (order matters) |
| Built-in template missing | Re-copy from `plan-harness/contexts/` |
