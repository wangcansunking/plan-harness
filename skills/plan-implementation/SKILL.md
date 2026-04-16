---
name: plan-implementation
description: Generate a detailed implementation plan with file-level steps — dispatches full agent team
---

# plan-implementation

Generate a detailed, file-level implementation plan as an interactive HTML document. This is the most comprehensive skill -- it dispatches ALL six agent roles to produce implementation steps with dependency ordering, per-step test requirements, complexity estimates, and completion tracking.

## When to Use

- After `/plan-design` has generated `design.html`
- When the user says "implementation plan", "impl plan", "how to build this", "create implementation steps", or "plan-implementation"
- When you need a step-by-step guide that a developer can follow to build the feature

## What It Produces

- `{scenario-path}/implementation-plan.html` -- A self-contained interactive HTML document with numbered implementation steps, dependency graph, file-level details, test requirements, and completion tracking
- Updated `manifest.json` with the implementation plan file entry

## Prerequisites

- `manifest.json` must exist (from `/plan-init`)
- `design.html` must exist (from `/plan-design`)
- If either is missing, stop and tell the user which skill to run first

## Agent Team (Full 6-Role Team)

| Role | Agent Tool Prompt Source | Responsibility |
|------|------------------------|----------------|
| **Architect** | `C:\MCDC\plan-harness\prompts\architect-prompt.md` | Define implementation sequence, dependency order, integration points, technology decisions |
| **PM** | `C:\MCDC\plan-harness\prompts\pm-prompt.md` | Define milestones, deliverables, acceptance checkpoints, scope gates |
| **Frontend Dev** | `C:\MCDC\plan-harness\prompts\frontend-dev-prompt.md` | Detail frontend implementation steps: components, routes, state management, styling |
| **Backend Dev** | `C:\MCDC\plan-harness\prompts\backend-dev-prompt.md` | Detail backend implementation steps: APIs, data layer, services, migrations |
| **Tester** | `C:\MCDC\plan-harness\prompts\tester-prompt.md` | Define test requirements per step: unit tests, integration tests, E2E tests |
| **Writer** | Inline prompt (below) | Combine all outputs into cohesive HTML document |

## Workflow

### Step 1: Load Context and Design

1. Read `manifest.json` from the scenario directory.
2. Read `design.html` from the scenario directory.
3. Optionally read `state-machine.html` and `test-plan.html` if they exist (for cross-references).
4. Extract: data model, API design, use cases, architecture, UX flows, security model.
5. If `manifest.json` is missing, stop: "Run /plan-init first."
6. If `design.html` is missing, stop: "Run /plan-design first."

### Step 2: Dispatch Architect Agent

Use the **Agent tool** to dispatch the Architect:

```
Prompt for Architect Agent:

Read the prompt template at C:\MCDC\plan-harness\prompts\architect-prompt.md and follow its instructions.

CONTEXT:
- Repository: {repoRoot}
- Scenario: {scenarioName}
- Description: {description}
- Tech Stack: {codebaseContext.techStack}
- Patterns: {codebaseContext.patterns}
- Conventions: {codebaseContext.conventions}
- Design document content: {design.html content}

YOUR TASK:
Define the implementation sequence for building the feature described in the design document. Analyze the codebase to understand existing patterns and determine the optimal build order.

PRODUCE:

1. IMPLEMENTATION PHASES
   Break the work into sequential phases:
   - Phase 1: Foundation (data models, database changes, core types)
   - Phase 2: Backend (API endpoints, business logic, services)
   - Phase 3: Frontend (UI components, state management, routing)
   - Phase 4: Integration (wiring frontend to backend, auth, error handling)
   - Phase 5: Polish (validation, logging, monitoring, documentation)
   
   For each phase:
   - Phase name and description
   - Entry criteria (what must be done before this phase starts)
   - Exit criteria (what must be true for this phase to be complete)

2. DEPENDENCY GRAPH
   List all implementation steps and their dependencies:
   - STEP-{NN}: {Title}
     - Depends on: STEP-{XX}, STEP-{YY} (or "none" for root steps)
     - Blocks: STEP-{ZZ} (what steps are waiting on this one)
     - Parallel: true/false (can this run concurrently with its siblings?)

3. INTEGRATION POINTS
   For each point where components connect:
   - What connects to what
   - Contract/interface definition
   - How to verify the integration works

Return your analysis as structured markdown.
```

### Step 3: Dispatch PM Agent

Use the **Agent tool** to dispatch the PM:

```
Prompt for PM Agent:

Read the prompt template at C:\MCDC\plan-harness\prompts\pm-prompt.md and follow its instructions.

CONTEXT:
- Repository: {repoRoot}
- Scenario: {scenarioName}
- Description: {description}
- Design document content: {design.html content}

YOUR TASK:
Define milestones, deliverables, and acceptance checkpoints for the implementation.

PRODUCE:

1. MILESTONES
   For each milestone:
   - M{N}: {Title}
   - Description
   - Deliverables (concrete artifacts: files, features, passing tests)
   - Acceptance checkpoint: how to verify this milestone is complete
   - Estimated effort: Small (< 1 day) / Medium (1-3 days) / Large (3-5 days) / XL (> 5 days)

2. ACCEPTANCE CHECKPOINTS
   For each checkpoint (at phase boundaries):
   - What to demo or review
   - Who should review (developer self-check, peer review, PM review)
   - Go/no-go criteria

3. SCOPE GATES
   Conditions under which implementation should stop and re-plan:
   - Design assumptions proven wrong
   - Unexpected technical constraints discovered
   - Scope creep indicators

Return your analysis as structured markdown.
```

### Step 4: Dispatch Frontend Dev Agent

Use the **Agent tool** to dispatch the Frontend Dev:

```
Prompt for Frontend Dev Agent:

Read the prompt template at C:\MCDC\plan-harness\prompts\frontend-dev-prompt.md and follow its instructions.

CONTEXT:
- Repository: {repoRoot}
- Scenario: {scenarioName}
- Description: {description}
- Tech Stack: {codebaseContext.techStack}
- Patterns: {codebaseContext.patterns}
- Conventions: {codebaseContext.conventions}
- Design document content: {design.html content}

YOUR TASK:
Detail the frontend implementation steps. Analyze the existing codebase to understand the current component structure, state management, and routing patterns.

FOR EACH FRONTEND STEP, provide:
- **FE-{NN}: {Title}**
  - Phase: {which implementation phase this belongs to}
  - Files to create:
    - {path/to/file.tsx} — {description of what this file contains}
  - Files to modify:
    - {path/to/existing-file.tsx} — {what changes are needed and why}
  - Code patterns to follow:
    - {reference to existing similar component/pattern in the codebase}
    - {specific conventions: state management approach, styling system, i18n}
  - Component hierarchy:
    - Parent > Child > Grandchild structure
  - State management:
    - What state is needed, where it lives (local, store, context)
    - Store/slice definition if using Zustand/Redux/MobX
  - Dependencies:
    - npm packages needed (if any new ones)
    - Internal imports from existing code
  - Complexity: Low / Medium / High
  - Notes: {gotchas, performance considerations, accessibility requirements}

Return your steps as structured markdown.
```

### Step 5: Dispatch Backend Dev Agent

Use the **Agent tool** to dispatch the Backend Dev:

```
Prompt for Backend Dev Agent:

Read the prompt template at C:\MCDC\plan-harness\prompts\backend-dev-prompt.md and follow its instructions.

CONTEXT:
- Repository: {repoRoot}
- Scenario: {scenarioName}
- Description: {description}
- Tech Stack: {codebaseContext.techStack}
- Patterns: {codebaseContext.patterns}
- Conventions: {codebaseContext.conventions}
- Design document content: {design.html content}

YOUR TASK:
Detail the backend implementation steps. Analyze the existing codebase to understand the current API structure, data access layer, and service patterns.

FOR EACH BACKEND STEP, provide:
- **BE-{NN}: {Title}**
  - Phase: {which implementation phase this belongs to}
  - Files to create:
    - {path/to/file.cs} — {description of what this file contains}
  - Files to modify:
    - {path/to/existing-file.cs} — {what changes are needed and why}
  - Code patterns to follow:
    - {reference to existing similar controller/service/model in the codebase}
    - {specific conventions: naming, error handling, logging, DI registration}
  - Data layer:
    - Database changes needed (new tables, columns, indexes, migrations)
    - Repository/DAL methods to add
  - Service layer:
    - Business logic methods
    - External service calls
    - Error handling and retry logic
  - API layer:
    - Controller actions (method, route, request/response models)
    - Middleware requirements (auth, validation, rate limiting)
    - Swagger/OpenAPI documentation
  - Configuration:
    - App settings, feature flags, connection strings
    - Environment-specific values
  - Dependencies:
    - NuGet packages needed (if any new ones)
    - Internal project references
  - Complexity: Low / Medium / High
  - Notes: {gotchas, performance considerations, security requirements}

Return your steps as structured markdown.
```

### Step 6: Dispatch Tester Agent

Use the **Agent tool** to dispatch the Tester:

```
Prompt for Tester Agent:

Read the prompt template at C:\MCDC\plan-harness\prompts\tester-prompt.md and follow its instructions.

CONTEXT:
- Repository: {repoRoot}
- Scenario: {scenarioName}
- Description: {description}
- Tech Stack: {codebaseContext.techStack}
- Design document content: {design.html content}
- Test plan content: {test-plan.html content, if available}

YOUR TASK:
Define test requirements for each implementation step. Map test coverage to implementation steps.

PRODUCE:

1. PER-STEP TEST REQUIREMENTS
   For each implementation step (FE-{NN} and BE-{NN}):
   - Step reference: FE-{NN} or BE-{NN}
   - Unit tests required:
     - {test description} — {what it validates}
   - Integration tests required:
     - {test description} — {what it validates}
   - E2E tests required (if applicable):
     - {test description} — {what it validates}
   - Test data: what fixtures or mocks are needed

2. TEST EXECUTION ORDER
   - Which tests to write first (aligned with implementation phases)
   - Test dependencies (e.g., "integration tests for BE-03 require BE-01 and BE-02 to be complete")

3. COVERAGE MATRIX
   Map test plan scenarios (S1, S2, ...) to implementation steps:
   | Test Plan Scenario | Implementation Steps | Test Cases |
   |-------------------|---------------------|------------|
   | S1: Happy path    | BE-01, BE-02, FE-01 | TC-001, TC-002 |
   ...

Return your analysis as structured markdown.
```

### Step 7: Dispatch Writer Agent

Use the **Agent tool** to dispatch the Writer, passing ALL outputs from Steps 2-6:

```
Prompt for Writer Agent:

You are a technical writer assembling a comprehensive implementation plan as a self-contained interactive HTML file.

REFERENCE: Use C:\MCDC\plan-harness\local-proxy\src\templates\base.js as a reference for CSS patterns and styling conventions if it exists.

INPUTS:
- Architect output: {architect_output}
- PM output: {pm_output}
- Frontend Dev output: {frontend_dev_output}
- Backend Dev output: {backend_dev_output}
- Tester output: {tester_output}
- Scenario name: {scenarioName}
- Description: {description}

YOUR TASK:
Combine all agent outputs into a single `implementation-plan.html` file.

DOCUMENT STRUCTURE:

<nav> — Top navigation bar linking to sibling plan files:
  - design.html
  - test-plan.html
  - state-machine.html
  - test-cases.html
  - implementation-plan.html (current, highlighted)
  Links should be relative filenames. Include scenario name in the nav title.

<header> — Implementation plan header with:
  - Title: "Implementation Plan: {scenarioName}"
  - Description
  - Overall progress bar: {completed}/{total} steps ({percentage}%)
  - Phase progress: mini bars for each phase
  - Summary: total steps, estimated total effort, phases count

<main> — Document body with these sections:

  1. #overview — Implementation Overview
     - High-level description of the implementation approach
     - Phase summary cards (from Architect):
       Each card shows: Phase name, description, step count, entry/exit criteria
     - Dependency Graph Visualization:
       Inline SVG showing implementation steps as nodes, dependency arrows as edges
       - Color code by phase
       - Parallel steps shown side-by-side
       - Critical path highlighted with thicker line
       - 900px wide, height proportional to step count

  2. #milestones — Milestones & Checkpoints (from PM)
     - Milestone cards with:
       - Milestone name and description
       - Deliverables checklist (checkable)
       - Effort badge: Small (green), Medium (blue), Large (orange), XL (red)
       - Acceptance checkpoint details
     - Scope gates section with warning indicators

  3. #steps — Implementation Steps
     Combined and interleaved from Frontend Dev and Backend Dev outputs, organized by phase.
     
     For each step (data-step="{STEP-ID}"):
     - Collapsible card (<details><summary>)
     - Summary: [checkbox] STEP-{NN}: {Title} | Phase badge | Complexity badge | Type (FE/BE)
     - Inside the card:
       - Description
       - Files to Create: table with path and description
         | File Path | Description |
         |-----------|-------------|
       - Files to Modify: table with path and changes
         | File Path | Changes |
         |-----------|---------|
       - Code Patterns: bulleted list with references to existing codebase files
       - Dependencies: prerequisite steps (clickable links to those steps)
       - Parallel Indicator: "Can run in parallel with: STEP-{XX}" or "Sequential: requires STEP-{XX} first"
       - Test Requirements (from Tester output):
         - Unit tests: checklist
         - Integration tests: checklist
         - E2E tests: checklist
       - Cross-references:
         - "Design doc: #api-design" (link to design.html section)
         - "Test plan: S3" (link to test-plan.html scenario)
         - "Test cases: TC-015, TC-016" (links to test-cases.html)

  4. #test-coverage — Test Coverage Matrix (from Tester)
     Table mapping scenarios to steps to test cases:
     | Scenario | Steps | Test Cases | Status |
     |----------|-------|------------|--------|
     Sortable columns.

  5. #summary — Completion Summary
     - Auto-generated from checkbox state
     - Phase-by-phase completion percentage
     - Total completion percentage
     - Remaining items list (unchecked steps)
     - Estimated remaining effort

INTERACTIVE FEATURES (JavaScript):
- Step checkboxes persist to localStorage (key: "impl-plan-{scenarioName}")
- Phase progress bars update as steps are checked
- Overall progress bar updates in real-time
- Click dependency links to scroll to that step
- Filter by: phase, complexity (Low/Medium/High), type (FE/BE), status (done/pending)
- "Expand All" / "Collapse All" toggle
- "Next Step" button: scrolls to the first unchecked step whose dependencies are all checked
- Cross-reference links open sibling plan files (design.html, test-plan.html, test-cases.html)
- Print mode: all steps expanded, checkboxes shown as [X] or [ ]

STYLING:
- Self-contained: ALL CSS inline in a <style> tag
- Phase colors: Phase 1 = #0078D4, Phase 2 = #008272, Phase 3 = #881798, Phase 4 = #CA5010, Phase 5 = #107C10
- Complexity badges: Low = green, Medium = orange, High = red
- Type badges: FE = purple (#881798), BE = teal (#008272)
- Step cards: left border colored by phase
- Dependency graph SVG: clean node-and-arrow diagram
- Tables: full-width, zebra striping, sticky headers
- Responsive: works from 768px to 1920px
- Typography: system font stack
- Print-friendly: linear layout, all sections expanded

Write the complete HTML file content. Do NOT truncate -- produce the full document.
```

### Step 8: Write the Output File

1. Take the HTML output from the Writer agent
2. Write it to `{scenarioPath}/implementation-plan.html` using the Write tool
3. Update manifest.json: add `"implementationPlanHtml": "implementation-plan.html"` and `"implementationPlanGeneratedAt": "{ISO timestamp}"`

### Step 9: Confirm to the User

```
=== Implementation Plan Generated ===

File:       {scenarioPath}/implementation-plan.html
Phases:     {count} phases
Steps:      {total} total (FE: {n}, BE: {n})
              Low: {n} | Medium: {n} | High: {n}
Milestones: {count} milestones
Tests:      {n} unit, {n} integration, {n} E2E tests mapped

Features:
  - Interactive dependency graph (SVG)
  - Per-step file lists, code patterns, and test requirements
  - Completion tracking with localStorage persistence
  - Phase progress bars
  - "Next Step" navigation
  - Cross-references to design, test plan, and test cases

This implementation plan is ready for execution.
Open the file in a browser to use the interactive features.
```

## Error Handling

| Error | Resolution |
|-------|------------|
| `manifest.json` not found | "Run /plan-init first to set up the planning context." |
| `design.html` not found | "Run /plan-design first to generate the design document." |
| One agent fails (e.g., Frontend Dev) | Retry once; if still failing, proceed with the other agents' output and note the gap |
| All agents fail | Fall back to a simplified plan generated from design.html sections directly |
| Writer produces oversized HTML (> 1MB) | Split into phases: generate one HTML per phase, plus an index page |
| Dependency graph has cycles | Architect agent must resolve; flag the cycle and ask user for resolution |
| `implementation-plan.html` already exists | Ask user: "An implementation plan already exists. Overwrite? (y/n)" |
| Cross-reference targets don't exist | Render links but mark them as "(not yet generated)" with gray styling |
| Prompt template file not found | Use the inline prompt directly without the template file |

## Cross-Links

| Document | Relationship |
|----------|-------------|
| `manifest.json` | **Input** -- provides repo context and scenario metadata |
| `design.html` | **Input** -- primary source for all implementation steps |
| `test-plan.html` | **Input** (optional) -- E2E scenarios for test coverage matrix |
| `test-cases.html` | **Referenced** -- cross-linked from per-step test requirements |
| `state-machine.html` | **Referenced** -- entity state management informs data layer steps |
| `manifest.json` | **Updated** -- records implementation plan file and generation timestamp |
