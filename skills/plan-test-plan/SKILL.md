---
name: plan-test-plan
description: Generate an E2E test plan with interactive scenarios — dispatches PM, tester, and writer agent team
---

# plan-test-plan

Generate a comprehensive end-to-end test plan as an interactive HTML file with checkable scenarios, step-by-step verification, and automatic progress tracking. This skill dispatches a PM, Tester, and Writer agent team.

## When to Use

- After `/plan-design` has generated `design.html`
- When the user says "create test plan", "test plan", "E2E test plan", or "plan-test-plan"
- When you need structured QA scenarios before implementation begins

## What It Produces

- `{scenario-path}/test-plan.html` -- A self-contained interactive HTML test plan with checkboxes, progress tracking, and scenario grouping
- Updated `manifest.json` with the test plan file entry

## Prerequisites

- `manifest.json` must exist (from `/plan-init`)
- `design.html` must exist (from `/plan-design`)
- If either is missing, stop and tell the user which skill to run first

## Agent Team

| Role | Agent Tool Prompt Source | Responsibility |
|------|------------------------|----------------|
| **PM** | `C:\MCDC\plan-harness\prompts\pm-prompt.md` | Extract testable requirements from the design document, define test scope and priorities |
| **Tester** | `C:\MCDC\plan-harness\prompts\tester-prompt.md` | Design E2E test scenarios with step-by-step verification, edge cases, negative paths |
| **Writer** | Inline prompt (below) | Format into interactive HTML with checkboxes and progress tracking |

## Workflow

### Step 1: Load Context and Design

1. Read `manifest.json` from the scenario directory using the Read tool.
2. Read `design.html` from the scenario directory using the Read tool.
3. Extract key information from the design:
   - Use cases and acceptance criteria
   - API endpoints and expected behaviors
   - Data model entities and state transitions
   - UX flows and interaction patterns
   - Security requirements
4. If `manifest.json` is missing, stop: "Run /plan-init first to set up the planning context."
5. If `design.html` is missing, stop: "Run /plan-design first to generate the design document."

### Step 2: Dispatch PM Agent

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
Extract all testable requirements from the design document. For each requirement, specify:

1. TESTABLE REQUIREMENTS
   For each requirement:
   - REQ-{N}: Title
   - Source: which design section this comes from (e.g., "API Design - POST /api/widgets")
   - Priority: P0 (blocking), P1 (important), P2 (nice-to-have)
   - Type: Functional / Non-Functional / Security / Performance / Accessibility
   - Verification method: Manual / Automated / Both

2. TEST SCOPE
   - In scope for E2E testing (what flows to cover)
   - Out of scope (unit-test-only concerns, infrastructure, etc.)
   - Environment prerequisites (services, databases, auth tokens, test data)

3. TEST DATA REQUIREMENTS
   - Entities that need to be seeded
   - User roles/permissions needed
   - External service mocks or stubs required

Return your analysis as structured markdown with clear section headers.
```

### Step 3: Dispatch Tester Agent

Use the **Agent tool** to dispatch the Tester, passing the PM output:

```
Prompt for Tester Agent:

Read the prompt template at C:\MCDC\plan-harness\prompts\tester-prompt.md and follow its instructions.

CONTEXT:
- Repository: {repoRoot}
- Scenario: {scenarioName}
- Description: {description}
- Tech Stack: {codebaseContext.techStack}
- Design document content: {design.html content}
- PM requirements: {pm_output}

YOUR TASK:
Design comprehensive E2E test scenarios. Each scenario must be executable as a step-by-step procedure.

PRODUCE:
For each scenario (numbered S1, S2, S3, ...):

- **S{N}: {Title}**
  - Category: {Happy Path / Error Handling / Edge Case / Security / Performance / Accessibility}
  - Priority: P0 / P1 / P2
  - Covers requirements: REQ-{N}, REQ-{M}, ...
  - Preconditions:
    1. {What must be true before starting}
    2. {Required state, data, auth}
  - Steps:
    1. ACTION: {What the tester does}
       VERIFY: {What to check -- expected result}
    2. ACTION: {Next step}
       VERIFY: {Expected result}
    ... (continue for all steps)
  - Postconditions:
    1. {Expected system state after test completes}
  - Cleanup:
    1. {Steps to restore system to clean state}
  - Notes: {Any special considerations}

GUIDELINES:
- Start with happy-path scenarios (P0) covering the main user flows
- Follow with error-handling scenarios (P0/P1) for each API endpoint
- Include edge cases (P1/P2) for boundary conditions, concurrent access, large data
- Include security scenarios: unauthorized access, permission escalation, injection
- Include at least one accessibility scenario if UX is involved
- Each VERIFY step must have a concrete, observable expected result (not "it works")
- Number scenarios sequentially: S1, S2, S3, ...
- Aim for 15-30 scenarios depending on feature complexity

Return your scenarios as structured markdown.
```

### Step 4: Dispatch Writer Agent

Use the **Agent tool** to dispatch the Writer:

```
Prompt for Writer Agent:

You are a technical writer assembling an E2E test plan as a self-contained interactive HTML file.

REFERENCE: Use C:\MCDC\plan-harness\local-proxy\src\templates\base.js as a reference for CSS patterns and styling conventions if it exists.

INPUTS:
- PM requirements: {pm_output}
- Tester scenarios: {tester_output}
- Scenario name: {scenarioName}
- Description: {description}

YOUR TASK:
Combine the PM and Tester outputs into a single `test-plan.html` file with interactive progress tracking.

DOCUMENT STRUCTURE:

<nav> — Top navigation bar linking to sibling plan files:
  - design.html
  - test-plan.html (current, highlighted)
  - state-machine.html
  - test-cases.html
  - implementation-plan.html
  Links should be relative filenames. Include scenario name in the nav title.

<header> — Test plan header with:
  - Title: "E2E Test Plan: {scenarioName}"
  - Description
  - Progress bar showing: {completed}/{total} scenarios ({percentage}%)
  - Summary stats: Total scenarios, by priority (P0/P1/P2), by category
  - Last updated timestamp

<main> — Document body with these sections:

  1. #overview — Overview & Scope
     - Test scope (from PM)
     - Environment prerequisites
     - Test data requirements
     - A table of all testable requirements with their priorities and types

  2. #scenarios — Test Scenarios
     For each scenario S{N}:
     - Collapsible card (<details><summary>)
     - Summary line: "[checkbox] S{N}: {Title}" with priority badge and category tag
     - Inside the card:
       - Preconditions as a numbered list
       - Steps table:
         | Step | Action | Verification | Pass? |
         |------|--------|-------------|-------|
         | 1    | ...    | ...         | [checkbox] |
         | 2    | ...    | ...         | [checkbox] |
       - Postconditions
       - Cleanup steps
       - Notes (if any)
     - The scenario-level checkbox auto-checks when ALL step checkboxes are checked

  3. #progress — Progress Tracker
     - Auto-calculated from checkbox state using JavaScript
     - Shows: scenarios completed, steps completed, percentage
     - Category breakdown with mini progress bars
     - Priority breakdown with mini progress bars

INTERACTIVE FEATURES (JavaScript):
- All checkbox states persist to localStorage using key "test-plan-{scenarioName}"
- Scenario checkbox auto-toggles when all child step checkboxes are checked/unchecked
- Progress bar and stats update in real-time as checkboxes change
- "Reset All" button to clear all progress (with confirmation dialog)
- "Expand All" / "Collapse All" buttons for scenario cards
- Filter buttons: show only P0, P1, P2, or All
- Filter by category: Happy Path, Error Handling, Edge Case, Security, etc.

STYLING:
- Self-contained: ALL CSS inline in a <style> tag
- Priority badges: P0 = red (#D13438), P1 = orange (#CA5010), P2 = blue (#0078D4)
- Category tags: colored pills with distinct colors per category
- Progress bar: green (#107C10) fill on gray (#E1DFDD) track
- Checkbox styling: larger click target (20x20px minimum)
- Responsive layout: works from 768px to 1920px
- Typography: system font stack
- Sticky header with progress bar always visible
- Print-friendly: @media print hides interactive elements, shows all expanded

Write the complete HTML file content. Do NOT truncate -- produce the full document.
```

### Step 5: Write the Output File

1. Take the HTML output from the Writer agent
2. Write it to `{scenarioPath}/test-plan.html` using the Write tool
3. Update manifest.json: add `"testPlanHtml": "test-plan.html"` and `"testPlanGeneratedAt": "{ISO timestamp}"`

### Step 6: Confirm to the User

```
=== E2E Test Plan Generated ===

File:       {scenarioPath}/test-plan.html
Scenarios:  {count} total (P0: {n}, P1: {n}, P2: {n})
Categories: Happy Path ({n}), Error Handling ({n}), Edge Case ({n}), Security ({n})

Features:
  - Interactive checkboxes with localStorage persistence
  - Auto-calculated progress tracking
  - Filter by priority and category
  - Expand/Collapse all scenarios

Next steps:
  /plan-test-cases       Generate detailed test cases with test harness UI
  /plan-state-machine    Extract state machines from the design
  /plan-implementation   Generate implementation steps
```

## Error Handling

| Error | Resolution |
|-------|------------|
| `manifest.json` not found | "Run /plan-init first to set up the planning context." |
| `design.html` not found | "Run /plan-design first to generate the design document." |
| `design.html` is too large to pass to agents | Extract key sections (use cases, API design, data model) rather than the full file |
| PM agent fails | Retry once; if it fails again, extract requirements directly from design.html |
| Tester agent fails | Retry once; if it fails again, generate basic happy-path scenarios from use cases |
| Writer produces broken JavaScript | Validate that localStorage code and checkbox handlers are syntactically correct |
| `test-plan.html` already exists | Ask user: "A test plan already exists. Overwrite it? (y/n)" |
| Prompt template file not found | Use the inline prompt directly without the template file |

## Cross-Links

| Document | Relationship |
|----------|-------------|
| `manifest.json` | **Input** -- provides repo context and scenario metadata |
| `design.html` | **Input** -- source of testable requirements, API contracts, use cases |
| `manifest.json` | **Updated** -- records test plan file and generation timestamp |
| `test-cases.html` | **Downstream** -- reads test-plan.html to generate detailed test cases |
| `implementation-plan.html` | **Related** -- implementation steps reference test plan scenarios |
