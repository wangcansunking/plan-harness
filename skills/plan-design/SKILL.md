---
name: plan-design
description: Generate a comprehensive design document for the selected scenario — dispatches architect, PM, and writer agent team
---

# plan-design

Generate a comprehensive design document as an interactive HTML file. This skill dispatches an agent team of Architect, PM, and Writer to produce a structured design document covering data models, API contracts, architecture diagrams, use cases, and implementation guidance.

## When to Use

- After `/plan-init` has been run and `manifest.json` exists
- When the user says "create design doc", "design document", "write the design", or "plan-design"
- When starting a new feature that needs architectural planning

## What It Produces

- `{scenario-path}/design.html` -- A self-contained interactive HTML design document with embedded SVG diagrams, collapsible sections, and navigation
- Updated `manifest.json` with the design file entry

## Prerequisites

- `manifest.json` must exist in the scenario directory (created by `/plan-init`)
- If not found, instruct the user: "Run /plan-init first to set up the planning context."

## Agent Team

| Role | Agent Tool Prompt Source | Responsibility |
|------|------------------------|----------------|
| **Architect** | `C:\MCDC\plan-harness\prompts\architect-prompt.md` | Data models, API contracts, architecture diagrams, component relationships, technology decisions |
| **PM** | `C:\MCDC\plan-harness\prompts\pm-prompt.md` | Requirements, acceptance criteria, use cases, scope boundaries, risk assessment |
| **Writer** | Inline prompt (below) | Combine agent outputs into cohesive HTML using the template system |

## Workflow

### Step 1: Load Context

1. Read `manifest.json` from the scenario directory using the Read tool.
2. Extract: `repoRoot`, `scenarioPath`, `scenarioName`, `description`, `codebaseContext`.
3. If the file does not exist or is invalid, stop and tell the user to run `/plan-init` first.

### Step 2: Gather Feature Description

1. Check if `description` in `manifest.json` adequately describes what to build.
2. If the description is vague (fewer than 20 words) or missing, ask the user:
   > "Please describe the feature or change you want to design. Include: what it does, who it's for, and any constraints."
3. Store the full description for use by agents.

### Step 3: Dispatch Architect Agent

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

YOUR TASK:
Analyze the codebase at {repoRoot} and design the architecture for: {description}

Produce the following sections as structured markdown:

1. DATA MODEL
   - Entity definitions with fields, types, and relationships
   - Enumerations with values
   - Database schema or storage approach
   - Entity relationship descriptions

2. ARCHITECTURE
   - System component diagram description (list components, their responsibilities, and connections)
   - Workflow/sequence descriptions for key operations
   - Data flow descriptions
   - Technology choices with rationale

3. API DESIGN
   - Endpoint definitions: method, path, request body, response body, status codes
   - Authentication/authorization approach
   - Error response format
   - Rate limiting / pagination approach if applicable

4. SECURITY & ACCESS CONTROL
   - Authentication mechanism
   - Authorization model (roles, permissions)
   - Data protection considerations
   - Audit logging approach

5. INTEGRATION POINTS
   - External services and APIs consumed
   - Event/message contracts
   - Failure handling and retry strategies

Return your analysis as structured markdown with clear section headers.
```

### Step 4: Dispatch PM Agent

Use the **Agent tool** to dispatch the PM:

```
Prompt for PM Agent:

Read the prompt template at C:\MCDC\plan-harness\prompts\pm-prompt.md and follow its instructions.

CONTEXT:
- Repository: {repoRoot}
- Scenario: {scenarioName}
- Description: {description}
- Tech Stack: {codebaseContext.techStack}
- Conventions: {codebaseContext.conventions}

YOUR TASK:
Define product requirements for: {description}

Produce the following sections as structured markdown:

1. EXECUTIVE SUMMARY
   - Problem statement (2-3 sentences)
   - Proposed solution (2-3 sentences)
   - Key stakeholders and users
   - Success metrics

2. USE CASES
   For each use case, provide:
   - UC-{N}: Title
   - Actor
   - Preconditions
   - Main flow (numbered steps)
   - Alternate flows
   - Postconditions

3. ACCEPTANCE CRITERIA
   For each criterion:
   - AC-{N}: Title
   - Given / When / Then format
   - Priority (P0 / P1 / P2)

4. UX DESIGN
   - User flow descriptions (step-by-step navigation)
   - Key UI components needed
   - Interaction patterns (drag-drop, inline edit, modals, etc.)
   - Accessibility requirements

5. SCOPE & BOUNDARIES
   - In scope (bullet list)
   - Out of scope (bullet list)
   - Assumptions
   - Dependencies

6. RISK ANALYSIS
   For each risk:
   - Risk title
   - Likelihood (Low / Medium / High)
   - Impact (Low / Medium / High)
   - Mitigation strategy

Return your analysis as structured markdown with clear section headers.
```

### Step 5: Dispatch Writer Agent

Use the **Agent tool** to dispatch the Writer, passing the outputs from Steps 3 and 4:

```
Prompt for Writer Agent:

You are a technical writer assembling a design document as a self-contained HTML file.

REFERENCE: Use C:\MCDC\plan-harness\local-proxy\src\templates\base.js as a reference for CSS patterns and styling conventions if it exists. Otherwise, use clean modern CSS with a professional color scheme.

INPUTS:
- Architect output: {architect_output}
- PM output: {pm_output}
- Scenario name: {scenarioName}
- Description: {description}

YOUR TASK:
Combine the Architect and PM outputs into a single, cohesive `design.html` file.

DOCUMENT STRUCTURE (use these exact section IDs):

<nav> — Top navigation bar linking to sibling plan files:
  - design.html (current, highlighted)
  - test-plan.html
  - state-machine.html
  - test-cases.html
  - implementation-plan.html
  Links should be relative (just filenames) since all files live in the same scenario directory.
  Include the scenario name in the nav bar title.

<main> — Document body with these sections:
  1. #executive-summary — Executive Summary (from PM)
  2. #design-principles — Core Design Principles (synthesized from both)
  3. #data-model — Data Model (from Architect)
     - Entity cards with fields, types, relationships
     - Enumeration tables
     - Use HTML tables with zebra striping
  4. #architecture — Architecture Diagrams (from Architect)
     - Generate inline SVG diagrams for:
       a. System Architecture — boxes for components, arrows for connections
       b. Workflow Diagram — sequence of operations
       c. Data Flow Diagram — how data moves through the system
     - Each SVG should be 800x500px with clean labels and colors
     - Use CSS variables from the theme system: var(--accent), var(--text), var(--surface), var(--border), var(--green), var(--red), var(--yellow), var(--purple)
  5. #api-design — API Design (from Architect)
     - Endpoint cards with method badges (GET=green, POST=blue, PUT=orange, DELETE=red)
     - Request/response JSON examples in <pre><code> blocks
     - Error response table
  6. #ux-design — UX Design (from PM)
     - User flow diagrams (numbered steps with arrows)
     - Component inventory table
     - Interaction pattern descriptions
  7. #use-cases — Use Cases & Acceptance Criteria (from PM)
     - Collapsible cards per use case
     - Acceptance criteria with Given/When/Then formatting
  8. #implementation-overview — Implementation Plan (high-level from Architect)
     - Numbered steps with dependency indicators
     - Estimated complexity badges (Low/Medium/High)
  9. #security — Security & Access Control (from Architect)
  10. #risks — Risk Analysis (from PM)
      - Risk cards with color-coded likelihood/impact badges

STYLING REQUIREMENTS:
- Self-contained: ALL CSS inline in a <style> tag, no external dependencies
- Responsive: works on screens from 768px to 1920px
- Theme system: Use the dark/light CSS variable theme from writer-prompt.md and base.js:
  Dark: --bg: #0d1117, --surface: #161b22, --accent: #58a6ff, --text: #e6edf3
  Light: --bg: #ffffff, --surface: #f6f8fa, --accent: #0969da, --text: #1f2328
- Typography: system font stack (-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)
- Navigation: fixed left sidebar (260px) with section links, theme toggle top-right
- Sections: clear visual separation with border-bottom and spacing
- Code blocks: monospace font, light gray background, rounded corners
- Tables: full-width, zebra striping, sticky headers
- SVG diagrams: centered, with a subtle border and caption
- Collapsible sections: use <details><summary> for use cases and risk items
- Print-friendly: @media print styles that hide nav and expand all collapsed sections

QUALITY CHECKS:
- All section IDs must match the anchors in the nav bar
- All SVG elements must have accessible title and desc elements
- No broken internal links
- Valid HTML5 document structure

Write the complete HTML file content. Do NOT truncate or abbreviate -- produce the full document.
```

### Step 6: Write the Output File

1. Take the HTML output from the Writer agent
2. Write it to `{scenarioPath}/design.html` using the Write tool
3. Update the manifest by reading `{scenarioPath}/manifest.json`, adding `"designHtml": "design.html"` and `"designGeneratedAt": "{ISO timestamp}"`, then writing it back

### Step 7: Confirm to the User

Display a summary:

```
=== Design Document Generated ===

File:     {scenarioPath}/design.html
Size:     {file size}
Sections: Executive Summary, Design Principles, Data Model, Architecture,
          API Design, UX Design, Use Cases, Implementation Overview,
          Security, Risk Analysis

Diagrams: System Architecture SVG, Workflow SVG, Data Flow SVG

Next steps:
  /plan-state-machine   Extract state machines from this design
  /plan-test-plan       Generate E2E test plan from this design
  /plan-implementation  Generate detailed implementation steps
```

## Error Handling

| Error | Resolution |
|-------|------------|
| `manifest.json` not found | Tell user to run `/plan-init` first |
| `manifest.json` is malformed | Re-run `/plan-init` to regenerate it |
| Architect agent fails | Retry once; if it fails again, ask user to provide architecture notes manually |
| PM agent fails | Retry once; if it fails again, ask user to provide requirements manually |
| Writer agent produces invalid HTML | Validate the output; fix obvious issues (unclosed tags, missing sections) before writing |
| `design.html` already exists | Ask user: "A design document already exists. Overwrite it? (y/n)" |
| Prompt template file not found | Use the inline prompt directly without the template file |

## Cross-Links

| Document | Relationship |
|----------|-------------|
| `manifest.json` | **Input** -- provides repo context and scenario metadata |
| `manifest.json` | **Updated** -- records design file and generation timestamp |
| `test-plan.html` | **Downstream** -- reads design.html to extract testable requirements |
| `state-machine.html` | **Downstream** -- reads design.html to extract entities and state transitions |
| `test-cases.html` | **Downstream** -- reads design.html for test case generation |
| `implementation-plan.html` | **Downstream** -- reads design.html to derive implementation steps |
