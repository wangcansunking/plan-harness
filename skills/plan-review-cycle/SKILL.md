---
name: plan-review-cycle
description: Full review cycle across all plan documents in a scenario — reviews each document in dependency order, tracks cross-document consistency, produces a review report. Accepts a scenario path or name as argument.
---

# plan-review-cycle

Run a structured review cycle across **all** plan documents in a scenario. Unlike `/plan-review` (which reviews one document interactively), this skill reviews all documents in dependency order, checks cross-document consistency, and produces a consolidated review report.

## Input

The user can specify which scenario to review:

| Invocation | Behavior |
|------------|----------|
| `/plan-review-cycle` | Auto-detect scenario from cwd or `manifest.json` |
| `/plan-review-cycle permission-risk-survey` | Review the named scenario |
| `/plan-review-cycle C:\MCDC\plans\my-scenario` | Review by absolute scenario path |
| `/plan-review-cycle --fast` | Fast mode — only pause on CRITICAL/WARNING findings |

### Argument Resolution

1. **Absolute path** — if it contains `/` or `\` and the directory exists, use it as scenario path
2. **Scenario name** — search `plans/` directories for a matching subdirectory name
3. **Flags** — `--fast` or `fast` enables fast review mode (see "Fast Review Mode" section below)
4. **No argument** — locate scenario from `manifest.json` in cwd, or call `plan_list_scenarios` and prompt

## When to Use

- After `/plan-full` has generated all plan documents
- When the user says "review everything", "review cycle", "full review", "plan-review-cycle"
- Before starting implementation to validate the complete plan suite
- When the user says "are the plans ready?"

## What It Produces

- **Section-by-section review** of each document (same as `/plan-review` but for all docs)
- `{scenario-path}/review-report.html` — Consolidated review report as interactive HTML
- Updated `manifest.json` with review status for each document
- Cross-document consistency findings

## Prerequisites

- At least one plan document must exist in the scenario
- `manifest.json` is recommended but not required — if missing, reviewers work with document content only

## Review Order

Documents are reviewed in dependency order — each document is reviewed in the context of the documents that precede it:

```
1. analysis.html          ← Foundation: codebase understanding
2. design.html            ← Core: references analysis findings
3. state-machine.html     ← Derived from design data models
4. test-plan.html         ← Validates design acceptance criteria
5. test-cases.html        ← Details test plan scenarios
6. implementation-plan.html ← Implements the design, references all above
```

Skip any document that doesn't exist and note it in the report.

## Workflow

### Phase 1: Inventory

Read the scenario directory and list all existing plan documents:

```
Plan Review Cycle: {scenarioName}

Documents found:
  [x] analysis.html          — last modified: 2026-04-13
  [x] design.html             — last modified: 2026-04-13
  [x] state-machine.html      — last modified: 2026-04-13
  [x] test-plan.html          — last modified: 2026-04-13
  [ ] test-cases.html          — NOT FOUND
  [x] implementation-plan.html — last modified: 2026-04-13

5 of 6 documents found. Missing: test-cases.html

Starting review cycle...
```

### Phase 2: Per-Document Review

For each existing document, follow the same section-by-section review process as `/plan-review`:

1. Parse sections from the HTML
2. Dispatch role-specific reviewer agents for each section
3. Present findings to the user
4. Handle fix/skip/discuss/edit/re-review responses
5. Track progress

**Key difference from /plan-review**: Between documents, run a **cross-document consistency check** (see Phase 3).

For each document, present a compact per-section review. Use a faster review mode where sections with no issues are auto-approved:

```
Reviewing: design.html (10 sections)

  Section 1: Executive Summary ............ APPROVED
  Section 2: Core Design Principles ....... APPROVED
  Section 3: Data Model ................... NEEDS_CHANGES
    ├ CRITICAL: Missing enum definition for ReviewDecision
    └ WARNING: No validation constraints on SurveyAnswers JSON field
  
  Fix section 3? [f/s/d/e] _
```

Only pause for user interaction on sections with CRITICAL or WARNING findings. INFO-only sections are auto-approved with a note.

### Phase 3: Cross-Document Consistency Checks

After reviewing each document (before moving to the next), dispatch a **consistency checker agent**:

```
Prompt:
You are a cross-document consistency reviewer.

DOCUMENTS REVIEWED SO FAR:
{list of reviewed documents with their section summaries}

CURRENT DOCUMENT:
{full content of the document just reviewed}

PREVIOUS DOCUMENTS:
{key excerpts from previously reviewed documents — data models, API contracts, state definitions, test scenarios}

CHECK FOR CONSISTENCY:

1. TERMINOLOGY
   - Are entity names consistent across documents?
   - Are state names the same in design vs state-machine vs test-plan?
   - Are API endpoint names consistent between design and implementation plan?

2. DATA MODEL ALIGNMENT
   - Do all documents reference the same properties and types?
   - Are relationships described consistently?
   - Do test cases test the actual fields defined in the design?

3. FLOW COMPLETENESS
   - Does every design flow have corresponding test scenarios?
   - Does every state transition have test coverage?
   - Does the implementation plan cover all design sections?

4. ACCEPTANCE CRITERIA TRACEABILITY
   - Can every acceptance criterion be traced to at least one test case?
   - Does the implementation plan reference which acceptance criteria each step fulfills?

For each inconsistency found:

| Severity | Documents | Issue | Resolution |
|----------|-----------|-------|-----------|
| CRITICAL | design.html ↔ state-machine.html | ... | ... |

If everything is consistent: "No cross-document inconsistencies found."
```

Present consistency findings:

```
Cross-Document Check: design.html ↔ analysis.html

  CONSISTENT: 12 entity names match
  CONSISTENT: Architecture layers align
  WARNING: Analysis identifies MobX stores but design proposes Zustand — confirm migration scope
  
  Fix? [f/s/d] _
```

### Phase 4: Generate Review Report

After all documents have been reviewed, dispatch the **Writer agent** to generate `review-report.html`:

```
Prompt:
You are the Writer generating a review report.

Read the prompt template at C:\MCDC\plan-harness\prompts\writer-prompt.md for HTML/CSS guidelines.

CREATE a review-report.html with these sections:

1. #summary — Executive Summary
   - Overall readiness verdict: READY / NEEDS_WORK / BLOCKED
   - Document status table (each doc: approved/needs_changes/missing)
   - Total issues: X critical, Y warnings, Z info

2. #per-document — Per-Document Results
   - For each reviewed document:
     - Section-by-section verdict table
     - Issues found and their resolution (fixed / deferred / skipped)
     - Final document status

3. #consistency — Cross-Document Consistency
   - Terminology alignment matrix
   - Data model consistency findings
   - Flow coverage matrix: design flows → test scenarios → implementation steps
   - Acceptance criteria traceability matrix

4. #issues — Outstanding Issues
   - All unresolved CRITICAL issues (must fix before implementation)
   - All deferred WARNINGS (should fix, tracked for later)
   - Recommendations from INFO findings

5. #coverage — Coverage Summary
   - Visual grid showing which plan types exist and their review status
   - Pie chart or bar showing approved vs needs-changes vs missing
   - Gaps identified (e.g., "No test cases for admin approval flow")

6. #next-steps — Recommended Next Steps
   - Fix outstanding issues
   - Generate missing documents
   - Begin implementation (if ready)

PLAN NAVIGATION BAR:
<div class="plan-nav">
  <a href="analysis.html">Analysis</a>
  <a href="design.html">Design</a>
  <a href="state-machine.html">State Machines</a>
  <a href="test-plan.html">Test Plan</a>
  <a href="test-cases.html">Test Cases</a>
  <a href="implementation-plan.html">Implementation</a>
  <a href="review-report.html" class="active">Review Report</a>
</div>

Use the standard dark/light theme, sidebar nav, badges, and interactive elements.
Add visual status indicators:
  Green badge = APPROVED
  Yellow badge = APPROVED WITH WARNINGS
  Red badge = NEEDS CHANGES / BLOCKED
  Gray badge = NOT REVIEWED / MISSING
```

### Phase 5: Present Final Summary

```
Review Cycle Complete: {scenarioName}

Overall Verdict: {READY / NEEDS_WORK / BLOCKED}

Document Status:
  analysis.html             APPROVED
  design.html               APPROVED (2 warnings deferred)
  state-machine.html        APPROVED
  test-plan.html            NEEDS_CHANGES (1 critical issue)
  test-cases.html           MISSING
  implementation-plan.html  APPROVED

Issues: 1 critical, 4 warnings, 8 info
Cross-document: 2 inconsistencies found and fixed

Review report: {scenario-path}/review-report.html

Next steps:
  - Fix 1 critical issue in test-plan.html: {description}
  - Generate missing test-cases.html: run /plan-test-cases
  - After fixes: run /plan-review test-plan.html to re-review
```

Update `manifest.json`:
```json
{
  "reviewCycleCompleted": true,
  "reviewCycleDate": "2026-04-13",
  "reviewVerdict": "needs_work",
  "reviewCriticalIssues": 1,
  "reviewWarnings": 4,
  "reviewDocumentsApproved": 4,
  "reviewDocumentsMissing": 1,
  "reviewDocumentsBlocked": 0
}
```

## Fast Review Mode

If the user says "quick review" or "fast review":

1. Skip INFO-level findings entirely
2. Auto-approve sections with only INFO findings
3. Only pause on CRITICAL and WARNING findings
4. Skip cross-document consistency check for INFO-level inconsistencies
5. Generate a shorter review report focusing only on actionable items

## Re-Review After Fixes

If `manifest.json` shows a previous review cycle:

```
Previous review completed on 2026-04-13 with verdict: NEEDS_WORK
1 critical issue was reported in test-plan.html.

Options:
  [1] Re-review only changed documents (recommended)
  [2] Full review cycle from scratch
  [3] Review only test-plan.html (the document with issues)
```

Option 1: Check file modification dates against review date. Only re-review documents modified after the last review.

## Error Handling

| Error | Resolution |
|-------|-----------|
| No plan documents found | "No plan documents exist. Run /plan-full or individual plan skills first." |
| Only design.html exists | Review just that document, note missing dependencies in report |
| User cancels mid-cycle | Save progress to `.review-cycle-state.json`, offer to resume next time |
| Reviewer agent fails | Skip that reviewer's input, note reduced review coverage, continue |

## State Persistence

Save review cycle state to `{scenario-path}/.review-cycle-state.json` after each document:

```json
{
  "cycleId": "review-2026-04-13",
  "documents": [
    {
      "file": "analysis.html",
      "status": "approved",
      "sectionsReviewed": 9,
      "sectionsTotal": 9,
      "criticalIssues": 0,
      "warnings": 1,
      "info": 3
    },
    {
      "file": "design.html",
      "status": "in_progress",
      "sectionsReviewed": 5,
      "sectionsTotal": 10,
      "criticalIssues": 0,
      "warnings": 0,
      "info": 1
    }
  ],
  "consistencyChecks": [
    { "docs": ["analysis.html", "design.html"], "status": "passed", "warnings": 1 }
  ],
  "startedAt": "2026-04-13T10:30:00Z",
  "lastUpdated": "2026-04-13T11:15:00Z"
}
```
