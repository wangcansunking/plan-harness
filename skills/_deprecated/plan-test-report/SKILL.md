
# plan-test-report

Produce `test-report.html` — the run-artefact counterpart of `test-plan.html`. Where `test-plan.html` is the "what to test" oracle, `test-report.html` is the "what actually happened" ledger: every P0 + P1 scenario and every corner-case check, each with a status, evidence link, and — on failure — a concrete fix recipe.

The report is a sibling document in the scenario directory, linked from the dashboard, and re-runnable: re-executing the skill overwrites the file.

## When to Use

- After `/plan-test` reveals bugs or regressions and the user asks for "a proper report"
- Before publishing / sharing a scenario — the report is evidence the feature actually works
- When the user says "create test report", "generate test report", "plan-test-report", "写一份测试报告"
- After fixes land, to re-verify and refresh the report

## What It Produces

- `{scenarioPath}/test-report.html` — Self-contained HTML with nav bar linking to siblings
- `{scenarioPath}/.test-evidence/` — Screenshot + console-log artefacts referenced by the report
- `manifest.json` updated with `"testReportHtml"` + `"testReportGeneratedAt"`

## Prerequisites

- `test-plan.html` exists in the scenario directory — **it is the oracle for every scenario to run**
- The plan-harness dashboard is serving at a known port (start via `plan_serve_dashboard` if not)
- Playwright MCP tools (`mcp__plugin_playwright_playwright__*`) are loaded
- `design.html` exists (optional — used to map scenarios to ACs)

If any prerequisite is missing, stop and tell the user what to run first.

## Agent Team

| Role       | Tools                                                                                   | Responsibility                                                                                   |
|------------|-----------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|
| **Tester** | Playwright MCP (`browser_*`), Read, Bash, Glob, Grep                                    | Parse `test-plan.html`, run every scenario + corner case in a real browser, capture evidence   |
| **Writer** | Read, Write                                                                             | Transform the Tester's structured results into a self-contained HTML document                   |

## Workflow

### Step 1 — Load inputs

1. Resolve the scenario via `manifest.json` in the cwd, or by calling `plan_list_scenarios`.
2. Read `test-plan.html` — parse every `<details>` / scenario card with an `id` matching `^e2e-\d+$` (or `s\d+`). Collect:
   - Scenario id, title, priority (P0 / P1 / P2), category
   - Preconditions list
   - Numbered steps (action + verify pairs)
   - Postconditions / expected outcome
   - Traceability (REQ / AC / US ids)
3. Read the corner-case checklist from `/plan-test` SKILL.md (stable list maintained there) — these are UX regressions `test-plan.html` doesn't state explicitly (plan-tab 404, panel overlap, keyboard shortcuts, SSE cross-tab, rate limit, XSS inert, orphan group on reanchor, etc.).
4. Confirm dashboard is up (`curl localhost:<port>/`) — if down, run `plan_serve_dashboard`.

### Step 2 — Freshen the fixture

Before running:
- Truncate `plans/<scenario>/.comments/*.jsonl` so each scenario starts from a clean state
- Delete `plans/<scenario>/.comments/*.proposals/*.diff` likewise
- `mkdir -p plans/<scenario>/.test-evidence` — screenshot sink for this run

### Step 2.5 — Shape every step as Condition / Action / Result

**Every numbered step inside every scenario is recorded as a three-part row, not as free prose.** This is non-negotiable — the report is a diff between "what should happen" and "what did happen", and that diff has to line up row-by-row.

| Field         | What goes in it                                                                                         |
|---------------|---------------------------------------------------------------------------------------------------------|
| **Condition** | The pre-state the step assumes (what must be true before the action; what the DOM looks like on entry). Pulled from the scenario's preconditions plus any state the previous step left behind. |
| **Action**    | The literal verb the tester performs — `browser_click(ref)`, `browser_type("…")`, `browser_navigate(url)`. No paraphrasing. |
| **Result**    | What was observed. The verify-clause from the test plan rendered as an observation ("Resolve chip present; row moved to Resolved (4) subsection"). Include the PASS/FAIL verdict for this single step. |

### Step 2.6 — Screenshot every step, not just failures

The old rule was "screenshot on failure". The new rule: **every step produces a screenshot**, named `{scenarioId}-step-{N}.png`, placed in `.test-evidence/`. A passing scenario with 5 steps yields 5 screenshots. This makes the report walkable — a reader sees exactly what the UI looked like at each checkpoint without having to re-run the test.

Exceptions:
- If two adjacent steps are visually identical (e.g. "type into textarea" + "assert textarea contains text"), one combined screenshot is acceptable; mark both steps with the same evidence path.
- If a step is a pure API call with no UI change (e.g. "POST /api/comments" via `browser_evaluate(fetch(...))`), omit the screenshot and note "API-only step" in the Result cell.

The Tester must call `browser_take_screenshot` immediately after every verify — before moving on to the next Action.

### Step 3 — Dispatch the Tester subagent

Spawn **one** Tester subagent. Hand it the scenario list + corner-case list + workspace paths. The subagent drives the real browser via Playwright MCP and collects evidence.

```
Prompt for Tester subagent:

You are running an end-to-end verification pass. Your tools include the Playwright MCP
(mcp__plugin_playwright_playwright__browser_*). You DO NOT write code or modify files
other than screenshots/evidence under {scenarioPath}/.test-evidence/.

CONTEXT:
- Workspace root: {workspaceRoot}
- Scenario: {scenarioName}
- Dashboard URL: http://localhost:{port}
- Evidence directory: {scenarioPath}/.test-evidence/
- Scenarios to run (parsed from test-plan.html):
    {for each scenario: id, priority, preconditions, steps, expected}
- Corner-case checklist:
    {the bulleted list from plan-test SKILL.md Step 4}

YOUR TASK:
1. For each scenario in priority order (P0 first, then P1, skip P2 unless requested):
   a. Navigate to the doc under test via browser_navigate.
   b. Take an initial browser_snapshot AND a screenshot named {id}-step-0.png (entry state).
   c. Walk each step literally. For EVERY step, record Condition / Action / Result:
      - "Navigate to X" → browser_navigate
      - "Click Y" → browser_click with a captured ref
      - "Type Z" → browser_type
      - "Select span S" → browser_evaluate that programmatically builds a Range + Selection
      - "Verify W" → browser_evaluate that reads the DOM OR browser_snapshot + pattern match
      **After each verify, take browser_take_screenshot named {id}-step-{N}.png.** This is
      mandatory per Step 2.6. Capture 1 screenshot per step; combine only when two adjacent
      steps are visually identical.
   d. On failure, additionally capture browser_console_messages (level=error) and attach it
      alongside the step's screenshot as {id}-step-{N}.log.
   e. Between scenarios, clean up persistent state the scenario created.

2. Run every corner case. Each produces PASS / FAIL / N/I (not implemented) /
   PARTIAL with a one-line rationale.

3. Produce STRUCTURED MARKDOWN (no HTML) as your final answer. **Per-step Condition / Action /
   Result is mandatory** — the report renders these as table rows.

   Exactly this shape:

   ## Run metadata
   - scenario: {scenarioName}
   - dashboardUrl: http://localhost:{port}
   - startedAt: ISO 8601
   - finishedAt: ISO 8601
   - oracle: test-plan.html ({n} scenarios parsed)

   ## Results — numbered scenarios

   For each scenario, emit the scenario header AND a Condition/Action/Result step table:

   ### {id} — {title}  ({priority}, {PASS|FAIL|SKIPPED})

   | # | Condition | Action | Result | Evidence |
   |---|-----------|--------|--------|----------|
   | 1 | {pre-state} | browser_navigate(url) | {observed} — PASS | .test-evidence/{id}-step-1.png |
   | 2 | {pre-state after step 1} | browser_click(ref) | {observed} — PASS | .test-evidence/{id}-step-2.png |
   | 3 | ... | ... | ... — FAIL: {why} | .test-evidence/{id}-step-3.png |

   **Scenario outcome:** PASS / FAIL with 1-line summary.

   Repeat for every numbered scenario.

   ## Results — corner cases
   | check | status | notes |
   |-------|--------|-------|
   | plan-tab 404 guard | PASS | |
   | keyboard Ctrl+Alt+M | N/I | no global handler in base.js |
   ...

   ## Summary
   - Scenarios: N passed, M failed, K skipped of T total
   - P0 health: N/K green
   - Corner cases: N passed, M failed, K not-implemented of T total

   ## Failing cases — diagnostics
   For each FAIL row above, produce:
   ### {id}: {title}
   - **Symptom:** {what the verify step expected vs what it got}
   - **Root cause:** {file:line or system component, as best you can identify from the repro}
   - **Suggested fix:** {concrete change — file path + change in prose}
   - **Regression guard:** {one smoke-test assertion that would catch this next time}
   - **Evidence:** .test-evidence/{id}-fail.png

   ## Missing features
   For each N/I row, list: {check}: {what the spec says} vs {what the code has}.

Principles:
- The test plan is the oracle. If a scenario says "click Resolve → row moves to Resolved
  subsection", run exactly that click and assert exactly that DOM change. No paraphrasing.
- Evidence on every failure. A screenshot + a console log attached; the user shouldn't
  need to repro.
- Be honest about what didn't run. If the browser didn't cooperate, say SKIPPED with a
  rationale — don't mark green.
- DO NOT apply fixes. Report them.
```

### Step 4 — Dispatch the Writer subagent

Spawn the Writer with the Tester's markdown as input. The Writer produces the HTML file.

```
Prompt for Writer subagent:

You are a technical writer assembling test-report.html as a self-contained interactive
HTML file. Use templates/base.js as your styling reference so the report matches sibling
plan docs (dark/light theming via [data-theme], Linear palette, Inter Variable font).

INPUTS:
- Scenario name: {scenarioName}
- Tester results (structured markdown, pass verbatim): {tester_output}
- Evidence directory (relative to the report): .test-evidence/

DOCUMENT STRUCTURE:

<nav> — top nav bar with plan tabs linking to siblings:
  design.html, test-plan.html, state-machine.html, test-cases.html,
  implementation-plan.html, test-report.html (current — highlighted).
  Use bare filenames; the server rewrites them to /view?path=<abs>.

<header>
  - Title: "Test Report: {scenarioName}"
  - Run metadata block (startedAt, finishedAt, dashboardUrl, oracle)
  - Summary panel: big-number stats — scenarios passed/failed/total, P0 health,
    corner-cases passed/failed/not-implemented.
  - Status dot: green if 100% of P0 passed AND no corner-case regressions; yellow if
    P0 green but corner-case gaps; red if any P0 failed.

<main>
  §1 Results — Numbered scenarios
    ONE CARD PER SCENARIO (not a single giant table). Each card:
      - <header>: # | priority badge | title | overall PASS/FAIL/SKIPPED badge
      - <table class="car">: columns = # | Condition | Action | Result | Evidence.
        Status is embedded inside the Result cell as a colored dot + label
        (● PASS green, ● FAIL red).
        Evidence column: thumbnail <a href="{path}"> with an <img> loading
        lazily; clicking triggers the server-injected lightbox widget.
      - <footer>: one-line outcome summary.
    Cards are in a stacked vertical flow (not a grid) so each step table is
    full-width + readable.

  §2 Results — Corner cases
    Same shape as §1 but without priority column. Include a N/I (not-implemented)
    status with an amber badge so missing features are visible but distinguishable
    from regressions.

  §3 Summary
    The summary markdown, rendered. Include a small sparkline / progress bar if
    straightforward; otherwise plain counts.

  §4 Failing cases — diagnostics
    One card per FAIL, each with Symptom / Root cause / Suggested fix / Regression
    guard / Evidence. Use <details> so the page isn't overwhelming on load;
    default-expand if fewer than 5 failures.

  §5 Missing features
    Table: check | spec says | code has.

  §6 Re-run instructions
    Command block: `/plan-test-report {scenarioName}` to regenerate. Note that
    re-running overwrites this file.

STYLING:
- ALL CSS inline in <style>. No external deps.
- Status badges: green #107C10, red #D13438, amber #CA5010, gray #605E5C.
- Match the theme tokens defined in sibling plan docs (var(--accent), var(--bg),
  var(--text), var(--panel), etc.).
- Responsive 768–1920px.
- @media print: expand all <details>, hide the re-run command block.

Do not truncate. Produce the complete HTML file.
```

### Step 5 — Write the output

1. Take the Writer's HTML, write to `{scenarioPath}/test-report.html` with the Write tool.
2. Update `manifest.json`:
   - `"testReportHtml": "test-report.html"`
   - `"testReportGeneratedAt": "<ISO timestamp>"`
   - `"testReportSummary": { "total": N, "passed": N, "failed": N, "p0Green": true/false }` — so the dashboard can show a status dot without re-parsing the HTML.

### Step 6 — Interactive triage + fix loop (MANDATORY when there are failures)

The report is written to disk; the Tester already screenshotted every step. But a report with red rows is only half the job — a test run that finds bugs should then *close* them, not just log them.

**Print the failure summary to the CLI** — not just the file path. Format:

```
=== Test Report: {scenarioName} — {N} P0 failures ===

[L1] Proposal Accept — FAIL
     Symptom:    409 ANCHOR_DRIFT — modal surfaces "anchor no longer matches"
     Root cause: revise-dispatcher.js:155 — html.includes(parsed.from) fails on
                 entity-encoded em-dash + inline <kbd> wrapping.
     Fix type:   CODE — add HTML→text normalization before match + replace.
                 Classification: `code` (not `dirty-data`).

[{id}] {title} — FAIL
     ...
```

For every failure, classify as one of:

| Classification | Meaning                                                                   | Recommended action                                       |
|----------------|---------------------------------------------------------------------------|----------------------------------------------------------|
| `dirty-data`   | Fixture / JSONL / proposal file is stale, corrupt, or leftover from prior run | Truncate + reseed fixture, re-run the scenario           |
| `code`         | Live code has a logic bug that realistic input trips                       | Edit the file, rebuild, reseed fixture, re-run           |
| `spec-mismatch`| Implementation is internally consistent but diverges from the plan doc     | Ask user whether to update code OR update the spec       |
| `environment`  | Not reproducible — flaky selector, timing, server not running              | Note as "unstable" and skip fix; re-run in a fresh session |

**Then ASK the user** — exactly this prompt in the CLI:

```
There are {N} failing checks above. Options:
  [f]  Fix and retry until every P0 passes (I'll pick fixes for `code` cases,
       reseed for `dirty-data`, and surface `spec-mismatch`/`environment` cases
       for your decision)
  [s]  Show me a more detailed diagnostic for one case first
  [n]  Stop here — keep the report as-is
```

**If the user picks [f], enter the loop:**

1. For each failing case in priority order (P0 → P1):
   - If `dirty-data`: wipe the fixture per Step 2 + reseed + re-run that scenario only.
   - If `code`: read the cited file + line, propose the minimal change, apply it with the Edit tool. Run `npm run build` + `npm run smoke`. If smoke stays green, reseed fixture + re-run the scenario.
   - If `spec-mismatch` or `environment`: STOP the loop for that case. Print a one-line question to the user: "Case {id} needs your call — {1-line ask}. [code/spec/skip]?" and wait.
2. After a case flips to PASS, regenerate the report (overwrite `test-report.html`) so §1 + §3 + §4 stay in sync with reality.
3. Print the next iteration's summary: "After fix pass N: {P} passed / {F} failed of {T} P0". Repeat the ask from the top.
4. Exit conditions (any one):
   - Every P0 is PASS → print "All P0 green. Report updated. Stopping."
   - User types `n` / "stop" / "停" → print "Stopping. {P}/{T} P0 pass. Remaining failures recorded in §3."
   - Loop hits 5 iterations with no net improvement → print "No progress in 5 iterations. Stopping to avoid thrashing. Please review §3."

**If the user picks [s]**, emit the full diagnostic for one case (symptom + root cause + suggested fix + reproduction steps), then re-ask from the top.

**If the user picks [n]**, exit with the final summary.

Never apply fixes without the user saying `f` — even if you're certain. The user may want to triage in a different order, fix something outside the scenario, or escalate to someone else. This is a collaboration loop, not an autonomous agent.

### Step 7 — Confirm

```
=== Test Report Generated ===

File:           {scenarioPath}/test-report.html
Scenarios:      {P}/{T} passed ({Pp0}/{Tp0} P0 green)
Corner cases:   {P}/{T} passed, {N} not-implemented
Evidence:       {scenarioPath}/.test-evidence/ ({n} screenshots)
Dashboard:      http://localhost:{port}/scenario/{scenarioName}

Open the report:
  /view?path={absolutePath}/test-report.html

To re-run:
  /plan-test-report {scenarioName}
```

## Sub-commands

| Invocation                                         | Behavior                                                                 |
|----------------------------------------------------|--------------------------------------------------------------------------|
| `/plan-test-report`                                | Auto-detect scenario from cwd + manifest.json                            |
| `/plan-test-report <scenario>`                     | Run against a named scenario                                             |
| `/plan-test-report <scenario> p0-only`             | Skip P1 and P2; report only P0 + corner cases                            |
| `/plan-test-report <scenario> corner-cases-only`   | Skip numbered scenarios; regenerate corner-case-only report              |
| `/plan-test-report <scenario> no-ask`              | Generate the report and stop — do not enter the Step 6 fix loop          |
| `/plan-test-report <scenario> fix-loop`            | Implicit `f` at the Step 6 prompt — jump straight into the fix loop      |

## Error Handling

| Error                                | Resolution                                                               |
|--------------------------------------|--------------------------------------------------------------------------|
| `test-plan.html` missing             | Stop: "Run /plan-test-plan first to generate the oracle."                |
| Dashboard down                       | Call `plan_serve_dashboard`; retry once                                  |
| Playwright MCP tools not loaded      | Tell the user to enable the playwright plugin; stop                      |
| Tester subagent returns no results   | Retry once with the same prompt; if still empty, fall back to a smoke-test-only run and mark every scenario "SKIPPED - tester unavailable" |
| Writer produces malformed HTML       | Read the output, strip any pre-amble before `<!doctype>`; re-validate; retry once |
| Evidence directory un-writable       | Fall back to in-memory evidence; embed screenshots as base64 data URIs   |

## Principles

1. **The test plan is the oracle.** The report's row count must equal the scenario count parsed from `test-plan.html` (plus corner cases). No phantom passes, no silently-skipped scenarios.
2. **Evidence over claims.** Every FAIL row links to a screenshot + console log. A bare "FAIL" with no artefact is rejected.
3. **Re-runnable.** Re-running overwrites the report cleanly — no stale rows, no leftover screenshots from prior runs.
4. **Additive, not destructive.** The report never edits the feature code. If the Tester finds a bug, it's logged in §4 with a fix recipe; applying the fix is the user's call.
5. **One source of truth per dimension.** `test-plan.html` owns "what to test"; `test-report.html` owns "what ran when and how it turned out". Keep them separate — don't let test-plan.html mutate on each run.

## Cross-Links

| Document                    | Relationship                                                      |
|-----------------------------|-------------------------------------------------------------------|
| `manifest.json`             | **Input** + **Updated** — reads scenario metadata, writes testReport fields |
| `test-plan.html`            | **Input (oracle)** — every scenario to run                        |
| `design.html`               | **Input (optional)** — AC traceability mapping                    |
| `/plan-test` SKILL          | **Related** — interactive/ad-hoc tester; this skill produces a saved report |
| `dashboard.html`            | **Downstream** — dashboard card surfaces the report status dot    |
