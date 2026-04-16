---
name: plan-state-machine
description: Generate state machine documentation with entity diagrams — dispatches architect and writer agent team
---

# plan-state-machine

Generate state machine documentation as an interactive HTML file with entity cards, SVG state diagrams, transition flow tables, and relationship references. This skill dispatches an Architect and Writer agent team to extract entities, states, and transitions from the design document.

## When to Use

- After `/plan-design` has generated `design.html`
- When the user says "state machine", "entity states", "state diagram", "state transitions", or "plan-state-machine"
- When you need to understand the lifecycle of entities in the system

## What It Produces

- `{scenario-path}/state-machine.html` -- A self-contained interactive HTML file with SVG state diagrams, entity cards, transition tables, and relationship references
- Updated `manifest.json` with the state machine file entry

## Prerequisites

- `manifest.json` must exist (from `/plan-init`)
- `design.html` must exist (from `/plan-design`)
- If either is missing, stop and tell the user which skill to run first

## Agent Team

| Role | Agent Tool Prompt Source | Responsibility |
|------|------------------------|----------------|
| **Architect** | `C:\MCDC\plan-harness\prompts\architect-prompt.md` | Extract entities, states, transitions, relationships from the design; define state machines; describe diagram layouts |
| **Writer** | Inline prompt (below) | Format into interactive HTML with SVG state diagrams, entity cards, and flow tables |

## Workflow

### Step 1: Load Context and Design

1. Read `manifest.json` from the scenario directory.
2. Read `design.html` from the scenario directory.
3. Extract key information:
   - Data model entities, their fields, and relationships
   - Use cases that imply state changes
   - API endpoints that mutate state
   - Workflow descriptions
4. If `manifest.json` is missing, stop: "Run /plan-init first to set up the planning context."
5. If `design.html` is missing, stop: "Run /plan-design first to generate the design document."

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
- Design document content: {design.html content}

YOUR TASK:
Extract all entities, their states, transitions, and relationships from the design document. Produce a complete state machine specification.

PRODUCE THE FOLLOWING:

1. ENTITY INVENTORY
   For each entity:
   - Entity name
   - Description (one sentence)
   - States: list of all possible states with descriptions
   - Initial state: which state a new instance starts in
   - Terminal states: which states are final (no transitions out)
   - Key fields relevant to state (e.g., status, phase, isActive)

2. STATE TRANSITIONS
   For each entity, a transition table:
   | From State | Event/Trigger | To State | Guard Condition | Side Effects |
   |------------|--------------|----------|-----------------|--------------|
   | Draft      | Submit       | Pending  | All fields valid| Send notification |
   | Pending    | Approve      | Active   | Has approver    | Create audit log |
   ...

3. ENTITY RELATIONSHIPS
   For each relationship:
   - Source entity -> Target entity
   - Cardinality (1:1, 1:N, N:M)
   - Relationship type (owns, references, depends-on, triggers)
   - Description

4. WORKFLOW FLOWS
   For each major workflow (e.g., "Create and approve a widget"):
   - Flow name
   - Participating entities
   - Step-by-step sequence:
     | Step | Actor/System | Action | Entity | State Before | State After |
     |------|-------------|--------|--------|-------------|------------|
     | 1    | User        | Creates widget | Widget | (none) | Draft |
     | 2    | User        | Submits for review | Widget | Draft | Pending |
     ...

5. DATA SYNC REFERENCE
   For entities that sync across systems or stores:
   - Source of truth
   - Sync targets
   - Sync frequency / trigger
   - Conflict resolution strategy

6. SVG DIAGRAM DESCRIPTIONS
   For each entity with states, describe the SVG diagram layout:
   - Node positions (use a left-to-right or top-to-bottom flow)
   - Edge labels (transition triggers)
   - Color coding: initial state = green border, terminal states = double border, active state = blue fill
   - Dimensions: 700px wide, height varies by state count

Return your analysis as structured markdown with clear section headers.
```

### Step 3: Dispatch Writer Agent

Use the **Agent tool** to dispatch the Writer, passing the Architect output:

```
Prompt for Writer Agent:

You are a technical writer assembling state machine documentation as a self-contained interactive HTML file.

REFERENCE: Use C:\MCDC\plan-harness\local-proxy\src\templates\base.js as a reference for CSS patterns and styling conventions if it exists.

INPUTS:
- Architect output: {architect_output}
- Scenario name: {scenarioName}
- Description: {description}

YOUR TASK:
Create a `state-machine.html` file with interactive entity state diagrams and flow tables.

DOCUMENT STRUCTURE:

<nav> — Top navigation bar linking to sibling plan files:
  - design.html
  - test-plan.html
  - state-machine.html (current, highlighted)
  - test-cases.html
  - implementation-plan.html
  Links should be relative filenames. Include scenario name in the nav title.

<header> — Page header with:
  - Title: "State Machines: {scenarioName}"
  - Entity count summary
  - Quick-jump links to each entity section

<main> — Document body with these sections:

  1. #entity-overview — Entity Overview
     For each entity, render a NODE CARD:
     - Card with entity name as title
     - Grid layout of state badges inside the card
     - State badge colors: initial = green (#107C10), terminal = gray (#605E5C), intermediate = blue (#0078D4)
     - Field summary: key fields listed below states
     - Click entity name to jump to its detail section

  2. #entity-relationships — Entity Relationship Diagram
     Generate an inline SVG diagram showing:
     - Each entity as a rounded rectangle with its name
     - Relationship lines between entities with:
       - Line labels showing relationship type
       - Cardinality indicators (1, N, M) at each end
       - Arrow direction showing ownership/dependency
     - Use colors: entity boxes = #F3F2F1 fill with #0078D4 border, relationship lines = #605E5C
     - Diagram should be 800px wide, height proportional to entity count
     - Center the diagram in the page

  3. #state-diagrams — State Transition Diagrams (one per entity)
     For each entity with multiple states:
     - Section header: "{Entity Name} State Machine"
     - Inline SVG state diagram:
       - States as rounded rectangles
       - Initial state: green (#107C10) border, filled with #DFF6DD
       - Terminal states: double border, filled with #F3F2F1
       - Active/intermediate states: blue (#0078D4) border, white fill
       - Transitions as arrows between states with trigger labels
       - Guard conditions shown in [brackets] on arrows
       - Layout: left-to-right flow, 700px wide
     - Below the SVG, a transition table:
       | From | Trigger | To | Guard | Side Effects |
       |------|---------|-----|-------|-------------|
     - Use zebra striping on table rows

  4. #workflow-flows — State Transition Flows
     For each major workflow:
     - Workflow title and description
     - Participating entities listed
     - Step-by-step flow table:
       | Step | Actor | Action | Entity | State Before | State After |
       |------|-------|--------|--------|-------------|------------|
     - Color-code the "State After" cell to match the state badge color
     - Add a visual flow indicator (arrow or connector) between rows

  5. #relationship-reference — Relationship Reference Table
     A comprehensive table:
     | Source Entity | Relationship | Target Entity | Cardinality | Description |
     |--------------|-------------|---------------|-------------|-------------|
     - Sortable columns (JavaScript click handlers on headers)

  6. #data-sync — Data Sync Reference
     If applicable:
     - Sync topology diagram (simple SVG showing source -> targets)
     - Sync detail table: source, target, frequency, conflict resolution

INTERACTIVE FEATURES (JavaScript):
- Entity card click scrolls to the entity's state diagram section
- Table column sorting (click header to sort ascending/descending)
- Expand/Collapse individual entity sections
- "Show All" / "Collapse All" toggle
- Highlight active entity when scrolling (scroll spy on sections)

STYLING:
- Self-contained: ALL CSS inline in a <style> tag
- Entity cards: CSS grid layout, 3 columns on wide screens, 1 on narrow
- State badges: rounded pills with distinct colors per state type
- SVG diagrams: centered with subtle box-shadow, white background
- Tables: full-width, sticky headers, zebra striping
- Responsive: fluid layout from 768px to 1920px
- Typography: system font stack
- Color palette: #0078D4 (primary), #107C10 (success/initial), #605E5C (neutral), #D13438 (error/terminal)
- Print-friendly: @media print shows all sections expanded, removes interactive elements

Write the complete HTML file content. Do NOT truncate -- produce the full document.
```

### Step 4: Write the Output File

1. Take the HTML output from the Writer agent
2. Write it to `{scenarioPath}/state-machine.html` using the Write tool
3. Update manifest.json: add `"stateMachineHtml": "state-machine.html"` and `"stateMachineGeneratedAt": "{ISO timestamp}"`

### Step 5: Confirm to the User

```
=== State Machine Document Generated ===

File:       {scenarioPath}/state-machine.html
Entities:   {count} entities with state machines
Diagrams:   {count} SVG state diagrams + 1 relationship diagram
Workflows:  {count} step-by-step flows

Sections:
  - Entity Overview (node cards)
  - Entity Relationship Diagram (SVG)
  - State Transition Diagrams (one per entity)
  - Workflow Flows (step-by-step tables)
  - Relationship Reference (sortable table)
  - Data Sync Reference

Next steps:
  /plan-test-plan        Generate E2E test plan from the design
  /plan-test-cases       Generate detailed test cases
  /plan-implementation   Generate implementation steps
```

## Error Handling

| Error | Resolution |
|-------|------------|
| `manifest.json` not found | "Run /plan-init first to set up the planning context." |
| `design.html` not found | "Run /plan-design first to generate the design document." |
| Design has no entities with states | Generate a simplified document showing entity relationships only; note that state machines are not applicable |
| Architect agent fails | Retry once; if it fails again, extract entities directly from design.html data model section |
| Writer produces broken SVG | Validate SVG elements have proper closing tags and viewBox attributes |
| `state-machine.html` already exists | Ask user: "A state machine document already exists. Overwrite it? (y/n)" |
| Prompt template file not found | Use the inline prompt directly without the template file |

## Cross-Links

| Document | Relationship |
|----------|-------------|
| `manifest.json` | **Input** -- provides repo context and scenario metadata |
| `design.html` | **Input** -- source of entity definitions, data model, and workflows |
| `manifest.json` | **Updated** -- records state machine file and generation timestamp |
| `test-plan.html` | **Related** -- test scenarios should cover state transitions documented here |
| `test-cases.html` | **Related** -- test cases verify state machine correctness |
| `implementation-plan.html` | **Related** -- implementation steps reference entity state management |
