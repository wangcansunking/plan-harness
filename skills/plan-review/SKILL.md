---
name: plan-review
description: Interactive section-by-section review of any plan document — dispatches role-specific reviewers who critique each section, then iterates with the user to refine. Accepts a file path or document name as argument.
---

# plan-review

Interactively review a plan document one section at a time. For each section, dispatch role-specific reviewer agents who provide structured critique, then present findings to the user and iterate on fixes.

## Input

The user can provide a file target in several ways:

| Invocation | Behavior |
|------------|----------|
| `/plan-review design.html` | Review `design.html` in the current scenario |
| `/plan-review C:\MCDC\plans\perm-gov-design.html` | Review a specific file by absolute path |
| `/plan-review test-plan` | Fuzzy match — resolves to `test-plan.html` in current scenario |
| `/plan-review` | No argument — show document picker |
| `review the design` | Natural language — match "design" to `design.html` |
| `review all` | Review all documents in sequence (delegates to /plan-review-cycle) |

### Argument Resolution

Parse the argument (if provided) using this priority:

1. **Absolute path** — if the argument contains `/` or `\` and the file exists, use it directly
2. **Exact filename** — if the argument ends with `.html`, look for it in the current scenario directory
3. **Fuzzy name** — match the argument against known document types:
   | Input matches | Resolves to |
   |--------------|-------------|
   | `analysis`, `analyze`, `codebase` | `analysis.html` |
   | `design`, `architecture`, `spec` | `design.html` |
   | `state`, `state-machine`, `states`, `transitions` | `state-machine.html` |
   | `test-plan`, `testplan`, `e2e`, `scenarios` | `test-plan.html` |
   | `test-cases`, `testcases`, `cases`, `harness` | `test-cases.html` |
   | `implementation`, `impl`, `impl-plan`, `steps` | `implementation-plan.html` |
   | `review-report`, `report` | `review-report.html` |
   | `all` | Delegate to `/plan-review-cycle` |
4. **Current scenario** — if no scenario context, check cwd for a `plans/` directory and scan it
5. **Not found** — show the document picker

### Locating the Scenario Directory

The scenario directory is determined in this order:
1. If the argument is an absolute path, the scenario is the parent directory of that file
2. If `manifest.json` exists in cwd or a nearby `plans/*/` directory, use it
3. Call `plan_list_scenarios` MCP tool to discover scenarios, then ask user to pick one
4. If only one scenario exists, auto-select it

## When to Use

- After generating any plan document (`/plan-analyze`, `/plan-design`, `/plan-test-plan`, `/plan-state-machine`, `/plan-test-cases`, `/plan-implementation`)
- When the user says "review the design", "review plan", "check the test plan", "plan-review", or "review {document-name}"
- When a document needs quality validation before proceeding to the next planning phase
- When the user provides a specific file path to review

## What It Produces

- **Review report** displayed interactively in the conversation (section-by-section)
- **Updated HTML file** with fixes applied after user approval
- **Review status markers** in `manifest.json`: `{ "designReviewed": true, "designReviewDate": "..." }`

## Prerequisites

- The target document must exist (either specified by path or within a scenario)
- `manifest.json` is optional but recommended (provides codebase context to reviewers)
- If no `manifest.json` exists, reviewers will work with the document content alone

## Document-to-Reviewer Mapping

Each document type gets reviewed by different roles, each checking from their expertise:

| Document | Reviewers | Focus |
|----------|-----------|-------|
| `analysis.html` | Architect, Tester | Architecture accuracy, coverage completeness, pattern identification |
| `design.html` | Architect, PM, Tester | Technical feasibility, requirements coverage, testability |
| `state-machine.html` | Architect, PM | State completeness, transition correctness, edge cases |
| `test-plan.html` | PM, Tester | Scenario coverage, acceptance criteria alignment, priority correctness |
| `test-cases.html` | Tester, Frontend Dev, Backend Dev | Case completeness, step accuracy, expected result correctness |
| `implementation-plan.html` | Architect, Frontend Dev, Backend Dev, Tester | Step ordering, file accuracy, dependency correctness, test mapping |

## Workflow

### Step 1: Resolve Target Document

Apply the argument resolution logic from the **Input** section above.

**If argument resolves to a file**: Skip the picker, proceed directly to Step 2 with that file. Announce:
```
Reviewing: {filename} ({absolute-path})
```

**If argument is "all"**: Delegate to `/plan-review-cycle` and exit this skill.

**If argument does not resolve**: Show the document picker. Scan the scenario directory (or cwd) for existing HTML plan files and list only those that exist:

```
Which document would you like to review?

1. analysis.html          — Codebase Analysis
2. design.html            — Design Document
3. state-machine.html     — State Machines
4. test-plan.html         — E2E Test Plan
5. test-cases.html        — Test Cases
6. implementation-plan.html — Implementation Plan

Or type "all" to review every document in sequence.
```

**If no plan documents found at all**: 
> "No plan documents found. Run a generation skill first (e.g., `/plan-design`, `/plan-analyze`)."

### Step 2: Parse Sections

Read the selected HTML file and extract sections. Sections are identified by `<h2 id="...">` tags. Build a section list:

```javascript
// Parse pattern
const sectionRegex = /<h2[^>]*id="([^"]*)"[^>]*>(.*?)<\/h2>/gi;
// Each match gives: sectionId, sectionTitle
// Extract content between consecutive h2 tags as section body
```

Present the table of contents:

```
Document: design.html (10 sections)

 #  Section                          Status
 1  Executive Summary                [ ] pending
 2  Core Design Principles           [ ] pending
 3  Data Model                       [ ] pending
 4  Architecture Diagrams            [ ] pending
 5  API Design                       [ ] pending
 6  UX Design                        [ ] pending
 7  Use Cases & Acceptance Criteria  [ ] pending
 8  Implementation Plan              [ ] pending
 9  Security & Access Control        [ ] pending
10  Risk Analysis                    [ ] pending

Starting review from section 1. Type "skip to N" to jump to a specific section.
```

### Step 3: Review Each Section

For each section, execute this review loop:

#### 3a. Dispatch Reviewer Agents

Based on the document type (see mapping table above), dispatch 2-3 reviewer agents **in parallel** using the Agent tool. Each reviewer gets:

```
Prompt:
You are a {Role} reviewing section "{sectionTitle}" of a {documentType}.

CONTEXT:
- Scenario: {scenarioName}
- Repository: {repoRoot}
- Tech stack: {techStack}
- Full document: {documentType}

SECTION CONTENT:
---
{sectionHTML}
---

REVIEW FROM YOUR PERSPECTIVE as a {Role}. Evaluate:

1. ACCURACY — Is the technical content correct? Are there factual errors?
2. COMPLETENESS — Is anything missing that should be covered in this section?
3. CONSISTENCY — Does this section align with other sections and documents in the plan?
4. CLARITY — Is the writing clear and unambiguous? Would a developer understand exactly what to do?
5. FEASIBILITY — Can this actually be implemented as described in the current codebase?

For each issue found, report:

| Severity | Issue | Location | Suggested Fix |
|----------|-------|----------|---------------|
| CRITICAL | ... | ... | ... |
| WARNING  | ... | ... | ... |
| INFO     | ... | ... | ... |

CRITICAL = blocks implementation, must fix before proceeding
WARNING = should fix, could cause problems later
INFO = minor improvement, nice-to-have

If the section is good, say: "No issues found. Section approved."

End with a single line: VERDICT: APPROVED | NEEDS_CHANGES | BLOCKED
```

#### 3b. Present Review Results

Combine all reviewer outputs into a unified review for the section:

```
## Reviewing: Section 3 — Data Model

### Architect Review
Verdict: NEEDS_CHANGES

| Severity | Issue | Suggested Fix |
|----------|-------|---------------|
| CRITICAL | PermissionGovernance node missing RiskLevel enum definition | Add RiskLevel enum: Low, Medium, High, Critical |
| WARNING  | No index strategy defined for Neo4j queries | Add recommended indexes for frequently queried properties |

### PM Review
Verdict: APPROVED

No issues found. Requirements are well-defined and acceptance criteria are testable.

---

Summary: 1 CRITICAL, 1 WARNING, 0 INFO across 2 reviewers.
Section status: NEEDS_CHANGES

Options:
  [f] Fix — Apply suggested fixes automatically
  [s] Skip — Mark as reviewed, move to next section
  [d] Discuss — Ask a question or provide feedback about the review
  [e] Edit — Make manual edits to this section
  [r] Re-review — Re-run review after changes
```

#### 3c. Handle User Response

**[f] Fix**: 
1. For each CRITICAL and WARNING issue, dispatch a **Writer agent** to generate the corrected section HTML
2. Show a diff-summary of changes
3. Ask: "Apply these changes? [y/n]"
4. If yes, update the HTML file in place (replace the section content between h2 tags)
5. Re-run the review on the fixed section (go back to 3a)

**[s] Skip**:
1. Mark section as reviewed with current verdict
2. Move to next section

**[d] Discuss**:
1. Take user's question/feedback
2. Dispatch a relevant reviewer agent to respond
3. Return to the options prompt

**[e] Edit**:
1. Show the current section HTML content
2. Ask user what to change
3. Apply edits using the Edit tool
4. Re-run review (go back to 3a)

**[r] Re-review**:
1. Re-read the section from the file (in case of external edits)
2. Dispatch reviewers again (go back to 3a)

### Step 4: Section Progress Tracking

After each section is completed (approved or skipped), update the progress display:

```
Review Progress: design.html

 #  Section                          Status
 1  Executive Summary                [x] approved
 2  Core Design Principles           [x] approved  
 3  Data Model                       [!] approved (1 warning skipped)
 4  Architecture Diagrams            [ ] reviewing...
 5  API Design                       [ ] pending
 ...

Progress: 3/10 sections reviewed (30%)
```

### Step 5: Document Review Summary

After all sections are reviewed:

```
Review Complete: design.html

Results:
  Approved:      7 sections
  Fixed:         2 sections (4 issues resolved)
  Skipped:       1 section (2 warnings deferred)

Issues Summary:
  CRITICAL fixed: 2
  WARNING fixed:  2
  WARNING skipped: 2
  INFO noted:     5

Document status: REVIEWED with minor warnings.
```

Update `manifest.json`:
```json
{
  "designReviewed": true,
  "designReviewDate": "2026-04-13",
  "designReviewResult": "approved_with_warnings",
  "designIssuesFixed": 4,
  "designIssuesDeferred": 2
}
```

### Step 6: Suggest Next Steps

```
Next steps:
  - /plan-review state-machine.html  — Review state machines
  - /plan-review-cycle               — Review all documents in sequence
  - /plan-design                     — Regenerate design if major changes needed
```

## Handling "review all"

If user says "review all" or types "all" at document selection:

1. Review documents in this order: analysis → design → state-machine → test-plan → test-cases → implementation-plan
2. Only review documents that exist in the scenario
3. Between documents, show a summary and ask: "Continue to next document? [y/n/skip]"

## Review Quality Dimensions by Document Type

### analysis.html Review Focus
- Are all architecture layers correctly identified?
- Are code patterns accurately described?
- Are health scores justified with evidence?
- Are recommendations actionable and specific?

### design.html Review Focus
- Do data models match the actual codebase entities?
- Are API contracts complete (all methods, error codes)?
- Do SVG diagrams accurately represent the architecture?
- Are acceptance criteria testable (can write automated tests)?
- Does the design account for backward compatibility?

### state-machine.html Review Focus
- Are all states reachable?
- Are there unreachable or dead-end states?
- Do transitions have proper guard conditions?
- Are error/rollback transitions defined?
- Do state names match the design document?

### test-plan.html Review Focus
- Does every acceptance criterion have a corresponding test scenario?
- Are preconditions achievable in the test environment?
- Are verification steps specific enough to automate?
- Are edge cases covered (empty states, concurrent access, error paths)?

### test-cases.html Review Focus
- Is priority assignment correct? (P0 = must-work paths)
- Are test steps reproducible by someone unfamiliar with the feature?
- Do expected results include specific values (not just "should work")?
- Are categories well-organized and complete?

### implementation-plan.html Review Focus
- Are file paths correct and do referenced files exist?
- Is the step ordering correct (no forward dependencies)?
- Are parallel steps truly independent?
- Does each step have clear completion criteria?
- Are test requirements per step achievable?

## Error Handling

| Error | Resolution |
|-------|-----------|
| No plan documents found | "No plan documents exist in this scenario. Run a plan generation skill first (e.g., /plan-design)." |
| HTML file cannot be parsed | "Could not parse {file}. The file may be malformed. Try regenerating with the corresponding skill." |
| Reviewer agent returns no verdict | Default to NEEDS_CHANGES and flag for manual review |
| User interrupts mid-review | Save progress to `{scenario-path}/.review-state.json` so review can resume |

## Resuming Interrupted Reviews

If `.review-state.json` exists in the scenario directory:

```
Found an interrupted review session for design.html (3/10 sections completed).
Resume from section 4? [y/n]
```

State file format:
```json
{
  "document": "design.html",
  "totalSections": 10,
  "completedSections": [
    { "id": "s1", "title": "Executive Summary", "verdict": "approved" },
    { "id": "s2", "title": "Core Design Principles", "verdict": "approved" },
    { "id": "s3", "title": "Data Model", "verdict": "approved_with_warnings", "deferredWarnings": 1 }
  ],
  "currentSection": 4,
  "startedAt": "2026-04-13T10:30:00Z"
}
```
