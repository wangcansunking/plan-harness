---
name: plan-test-cases
description: Generate comprehensive test cases with priority levels and interactive tracking — dispatches tester, frontend dev, and writer agent team
---

# plan-test-cases

Generate a comprehensive set of detailed test cases as an interactive HTML file with filtering, priority levels, progress tracking, expand/collapse functionality, and bulk operations. This skill dispatches a Tester, Frontend Dev, and Writer agent team.

## When to Use

- After `/plan-design` and `/plan-test-plan` have been run
- When the user says "test cases", "generate test cases", "detailed tests", or "plan-test-cases"
- When you need granular, individually trackable test cases beyond the E2E scenario level

## What It Produces

- `{scenario-path}/test-cases.html` -- A self-contained interactive HTML test harness with filterable, expandable test case cards, progress tracking, and import/export
- Updated `manifest.json` with the test cases file entry

## Prerequisites

- `manifest.json` must exist (from `/plan-init`)
- `design.html` must exist (from `/plan-design`)
- `test-plan.html` should exist (from `/plan-test-plan`) -- not strictly required but strongly recommended
- If `manifest.json` or `design.html` is missing, stop and tell the user which skill to run first
- If `test-plan.html` is missing, warn: "Test plan not found. Test cases will be generated from the design document only. Consider running /plan-test-plan first for more comprehensive coverage."

## Agent Team

| Role | Agent Tool Prompt Source | Responsibility |
|------|------------------------|----------------|
| **Tester** | `C:\MCDC\plan-harness\prompts\tester-prompt.md` | Generate detailed test cases organized by category with priorities, steps, and expected results |
| **Frontend Dev** | `C:\MCDC\plan-harness\prompts\frontend-dev-prompt.md` | Design the interactive test harness UI: filtering, expand/collapse, bulk operations, theme toggle |
| **Writer** | Inline prompt (below) | Combine into cohesive HTML with all interactive features |

## Workflow

### Step 1: Load Context, Design, and Test Plan

1. Read `manifest.json` from the scenario directory.
2. Read `design.html` from the scenario directory.
3. Read `test-plan.html` from the scenario directory (if it exists).
4. Extract:
   - From design: entities, API endpoints, use cases, acceptance criteria, security requirements
   - From test plan: E2E scenarios, testable requirements, test data requirements
5. If `manifest.json` is missing, stop: "Run /plan-init first."
6. If `design.html` is missing, stop: "Run /plan-design first."

### Step 2: Dispatch Tester Agent

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
- Test plan content: {test-plan.html content, or "Not available" if missing}

YOUR TASK:
Generate detailed test cases organized by category. Each test case must be specific enough for a developer or QA engineer to execute independently.

TEST CASE CATEGORIES:
- API: endpoint-level tests (request/response validation, error codes, auth)
- UI: component and interaction tests (rendering, user flows, form validation)
- Integration: cross-component and cross-service tests
- Security: authentication, authorization, injection, data protection
- Performance: load, stress, response time, resource usage
- Accessibility: screen reader, keyboard navigation, color contrast, ARIA
- Data: data integrity, migration, boundary values, concurrent access
- Edge Cases: unusual inputs, race conditions, timeout handling

FOR EACH TEST CASE, provide:
- **TC-{NNN}**: {Title}
  - Category: {one of the categories above}
  - Priority: P0 (must-pass for release) / P1 (should-pass) / P2 (nice-to-have)
  - Related: S{N} from test plan (if applicable), AC-{N} from design (if applicable)
  - Description: One paragraph explaining what this test verifies and why it matters
  - Preconditions:
    1. {Required setup}
  - Steps:
    1. {Detailed action}
    2. {Next action}
    ...
  - Expected Result: {Specific, observable outcome}
  - Cleanup: {Steps to reset state, if needed}

GUIDELINES:
- Number test cases sequentially: TC-001, TC-002, TC-003, ...
- P0 test cases: core happy paths, critical security, data integrity (aim for 30-40% of total)
- P1 test cases: error handling, validation, important edge cases (aim for 40-50% of total)
- P2 test cases: cosmetic, performance optimization, rare edge cases (aim for 10-20% of total)
- Each test case must be independently executable (no dependency on other test cases)
- Expected results must be concrete and verifiable ("status code 200 with body containing..." not "it works")
- Aim for 40-80 test cases depending on feature complexity
- Cover every API endpoint with at least one positive and one negative test
- Cover every use case from the design with at least one test case

Return your test cases as structured markdown.
```

### Step 3: Dispatch Frontend Dev Agent

Use the **Agent tool** to dispatch the Frontend Dev:

```
Prompt for Frontend Dev Agent:

Read the prompt template at C:\MCDC\plan-harness\prompts\frontend-dev-prompt.md and follow its instructions.

YOUR TASK:
Design the interactive test harness UI for the test cases HTML file. Provide the JavaScript code and CSS needed for all interactive features.

REQUIRED FEATURES:

1. HEADER SECTION
   - Title and description
   - Overall progress bar: {passed}/{total} ({percentage}%)
   - Summary stat cards: Total, P0, P1, P2 counts with pass/fail/untested for each
   - Quick filter buttons in the header

2. SIDEBAR NAVIGATION
   - Fixed sidebar on left (collapsible on mobile)
   - Category tree with badge counts: "API (12)" "UI (8)" etc.
   - Click category to filter + scroll to first test in that category
   - Active category highlighted based on scroll position
   - Total/passed/failed counts at top of sidebar

3. TEST CASE CARDS
   - Expandable cards using <details><summary>
   - Summary row: [status-select] TC-{NNN} | Priority badge | Title | Category tag
   - Status select dropdown: Untested (gray) / Pass (green) / Fail (red) / Blocked (orange) / Skipped (purple)
   - Expanded view:
     - Description paragraph
     - Related items (links to test plan scenarios)
     - Preconditions list
     - Steps list with individual checkboxes
     - Expected result (highlighted box)
     - Cleanup steps
     - Notes textarea for tester observations

4. FILTERING & SEARCH
   - Search box: filter by title, description, or TC number
   - Priority filter: toggle buttons for P0 / P1 / P2
   - Category filter: dropdown or toggle buttons
   - Status filter: Untested / Pass / Fail / Blocked / Skipped
   - Active filters shown as removable chips
   - "Clear Filters" button
   - Result count: "Showing {n} of {total} test cases"

5. BULK OPERATIONS
   - "Expand All" / "Collapse All" toggle
   - "Mark Filtered as Pass" / "Mark Filtered as Fail" (with confirmation)
   - "Reset All Status" (with confirmation dialog)
   - "Export Progress" button: downloads JSON file with all statuses and notes
   - "Import Progress" button: file input to restore from exported JSON

6. THEME TOGGLE
   - Light/dark mode toggle button in header
   - Dark mode: #1B1A19 background, #F3F2F1 text, adjusted card colors
   - Light mode: white background, #323130 text
   - Preference saved to localStorage

7. PERSISTENCE
   - All state (statuses, notes, step checkboxes, theme, filters) saved to localStorage
   - Key: "test-cases-{scenarioName}"
   - Auto-save on every change
   - Load on page open

Provide the complete JavaScript and CSS code for these features. Use vanilla JavaScript (no frameworks).
The JavaScript should be well-structured with clear function names and comments.
```

### Step 4: Dispatch Writer Agent

Use the **Agent tool** to dispatch the Writer, passing outputs from Steps 2 and 3:

```
Prompt for Writer Agent:

You are a technical writer assembling a test cases harness as a self-contained interactive HTML file.

REFERENCE: Use C:\MCDC\plan-harness\local-proxy\src\templates\base.js as a reference for CSS patterns and styling conventions if it exists.

INPUTS:
- Tester output (test cases): {tester_output}
- Frontend Dev output (UI code): {frontend_dev_output}
- Scenario name: {scenarioName}
- Description: {description}

YOUR TASK:
Combine the test cases and UI code into a single `test-cases.html` file.

DOCUMENT STRUCTURE:

<nav> — Top navigation bar linking to sibling plan files:
  - design.html
  - test-plan.html
  - state-machine.html
  - test-cases.html (current, highlighted)
  - implementation-plan.html
  Links should be relative filenames. Include scenario name in the nav title.

Then assemble the page using the Frontend Dev's UI design:
- Header with progress bar and summary stats
- Sidebar navigation with category tree
- Main content area with all test case cards
- Each test case card contains:
  - The test case data from the Tester output
  - The interactive elements from the Frontend Dev output
- Footer with export/import buttons and metadata

INTEGRATION REQUIREMENTS:
- Test case data should be embedded as a JavaScript object array at the top of the <script> section:
  const TEST_CASES = [ { id: "TC-001", title: "...", category: "API", priority: "P0", ... }, ... ];
- The UI renders from this data array (data-driven, not hardcoded HTML per test case)
- This makes the page maintainable and enables filtering/sorting on the data
- All interactive JavaScript from the Frontend Dev output should be in a single <script> tag
- All CSS from the Frontend Dev output should be in a single <style> tag
- No external dependencies (no CDN links, no imports)

STYLING:
- Priority badges: P0 = #D13438 background, P1 = #CA5010 background, P2 = #0078D4 background (white text)
- Status colors: Pass = #107C10, Fail = #D13438, Blocked = #CA5010, Skipped = #8764B8, Untested = #A19F9D
- Category tags: distinct colors per category (use a palette of 8 colors)
- Card shadows: subtle box-shadow on hover
- Sidebar: 250px wide, fixed position, scrollable independently
- Main content: margin-left to account for sidebar
- Responsive: sidebar collapses to top bar on screens < 1024px
- Dark mode: inverted colors with reduced contrast for comfortable reading
- Print-friendly: linear layout, all cards expanded, no sidebar

Write the complete HTML file content. Do NOT truncate -- produce the full document.
```

### Step 5: Write the Output File

1. Take the HTML output from the Writer agent
2. Write it to `{scenarioPath}/test-cases.html` using the Write tool
3. Update manifest.json: add `"testCasesHtml": "test-cases.html"` and `"testCasesGeneratedAt": "{ISO timestamp}"`

### Step 6: Confirm to the User

```
=== Test Cases Generated ===

File:         {scenarioPath}/test-cases.html
Test Cases:   {total} total
              P0: {n} | P1: {n} | P2: {n}
Categories:   API ({n}), UI ({n}), Integration ({n}), Security ({n}),
              Performance ({n}), Accessibility ({n}), Data ({n}), Edge Cases ({n})

Features:
  - Expandable test case cards with status tracking
  - Filter by priority, category, status, and search text
  - Sidebar navigation with badge counts
  - Bulk operations (expand all, mark all, reset)
  - Export/Import progress as JSON
  - Dark/Light theme toggle
  - All state persisted to localStorage

Next steps:
  /plan-implementation   Generate implementation steps
  /plan-state-machine    Extract state machines (if not done)
```

## Error Handling

| Error | Resolution |
|-------|------------|
| `manifest.json` not found | "Run /plan-init first to set up the planning context." |
| `design.html` not found | "Run /plan-design first to generate the design document." |
| `test-plan.html` not found | Warn user but proceed with design-only input |
| Tester agent produces too few test cases (< 10) | Re-prompt with explicit instruction to generate more, covering all categories |
| Frontend Dev agent produces broken JavaScript | Validate syntax; fix common issues (missing semicolons, unclosed functions) |
| Writer produces oversized HTML (> 500KB) | Compress: remove redundant whitespace, minify inline CSS/JS |
| `test-cases.html` already exists | Ask user: "Test cases already exist. Overwrite? (y/n)" |
| Test case IDs conflict with existing numbering | Renumber sequentially from TC-001 |
| Prompt template file not found | Use the inline prompt directly without the template file |

## Cross-Links

| Document | Relationship |
|----------|-------------|
| `manifest.json` | **Input** -- provides repo context and scenario metadata |
| `design.html` | **Input** -- source of requirements, API contracts, entities |
| `test-plan.html` | **Input** -- E2E scenarios that test cases should cover in detail |
| `state-machine.html` | **Related** -- state transitions inform data integrity test cases |
| `manifest.json` | **Updated** -- records test cases file and generation timestamp |
| `implementation-plan.html` | **Related** -- each implementation step references which test cases validate it |
