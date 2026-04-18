# plan-test

Run the scenarios listed in `plans/<scenario>/test-plan.html` end-to-end against a live dashboard. Drives the real UI via the Playwright MCP (`mcp__plugin_playwright_playwright__*`), not synthetic fetch calls, so it catches UX regressions like a panel that covers the sidebar nav or a CTA that positions off-screen.

## When to Use

- Before publishing: run after every non-trivial change to `templates/base.js`, `web-server.js`, `comment-manager.js`, or `revise-dispatcher.js`.
- When the user reports a symptom that the API-level smoke test misses ("click on X does nothing", "link is 404", "panel covers the sidebar").
- On a fresh dashboard install, to confirm the doc pipeline still works with the user's plan content.
- When the user says "run the test plan", "test this scenario end-to-end", "plan-test".

## Prerequisites

- The plan-harness dashboard must be reachable at `localhost:3847` (or a known port). If not running, start it with `plan_serve_dashboard`.
- The target scenario must have a `test-plan.html` — that file IS the source of truth.
- The Playwright MCP is loaded (tools `mcp__plugin_playwright_playwright__browser_navigate` etc. available).

## Workflow

### Step 1 — Load the test plan

Invoke the `plan_get_files` MCP tool with the scenario path to confirm `test-plan.html` is present. Read the file and extract every scenario block (`<details>` children with an id matching `^e2e-\d+$` or similar), collecting:

- Scenario ID and priority (P0 / P1 / P2).
- Preconditions list.
- Numbered steps (the prose is the oracle — parse the verbs: Navigate, Click, Type, Select, Verify).
- Expected outcome (the "Expected" or "Post:" block).
- Traceability link (which AC from `design.html` §7 it proves).

Use the `plan_list_scenarios` tool to confirm the dashboard recognizes the scenario.

### Step 2 — Freshen the fixture

Before running anything, DELETE `plans/<scenario>/.comments/*.jsonl` so the test starts from a known empty state. Each scenario that needs seed data must recreate it via the API, not rely on leftover from a previous run.

Also verify the in-flight dashboard is serving the latest bundle — if you've edited `src/` recently, run `npm run dev` first to rebuild + sync, then kill + restart the MCP's dashboard node process so the new bundle takes effect.

### Step 3 — Drive each scenario via Playwright MCP

For each scenario in priority order (P0 first, then P1, skip P2 unless explicitly requested):

1. Use `browser_navigate` to land on the document the scenario targets (typically `http://localhost:<port>/view?path=<abs>/plans/<scenario>/<doc>.html`).
2. Take an initial `browser_snapshot` to anchor element refs.
3. Walk each step:
   - "Navigate to X" → `browser_navigate`.
   - "Click Y" → `browser_click` with the captured ref.
   - "Type Z" → `browser_type`.
   - "Select span S" → `browser_evaluate` that programmatically sets a `Range` + `Selection` (UI event synthesis is fragile; direct API calls are deterministic).
   - "Verify that W is visible / enabled / contains text" → `browser_evaluate` that reads DOM + asserts, OR `browser_snapshot` + pattern match.
4. Collect evidence on every failure: a `browser_take_screenshot` named `<scenario-id>-fail.png` + the console log via `browser_console_messages`.
5. Between scenarios, `browser_evaluate` a cleanup step if the scenario created persistent state (e.g. DELETE any comments the scenario posted so the next one starts clean). This makes the suite re-runnable without manual reset.

### Step 4 — Corner-case coverage the test plan doesn't state explicitly

After running every scenario, walk through this extra checklist that catches UX regressions the scenarios miss:

- **Plan-tab links land without 404**: for each doc, click every plan-tab, confirm the URL resolves to `/view?path=<abs>` (NOT relative `design.html` which 404s under `/view`).
- **Click-through on a Comments-panel item opens the thread panel**, not just scrolls. Fails quietly if the thread panel fails to mount.
- **TODOs panel body does not cover the section-nav "On this page" links** when expanded with ≥10 items — snap the sidebar at `768px` and 1280px widths.
- **Dark-mode contrast**: toggle theme, verify body text + sidebar text + thread-card text all meet WCAG AA. Read `getComputedStyle(el).color` + body background and check contrast ratio ≥ 4.5:1.
- **Keyboard path**: Ctrl+Alt+M opens the composer against a pre-made selection; Ctrl+Enter submits; Esc closes. The floating CTA also responds to keyboard focus.
- **Mobile viewport (≤ 720px)**: the thread panel becomes a bottom-sheet (per design §6); the sidebar panels hide (per CSS); the pill breadcrumb collapses to left-aligned.
- **SSE live update across two tabs**: open the same doc in two `browser_tabs` sessions; post in tab A; tab B's Comments panel count increments within 2s.
- **Rate-limit visible**: POST 6 comments rapidly; the 6th returns 429 with `Retry-After`; the UI surfaces a disabled submit button + countdown.
- **Path-traversal rejected**: API returns 400 on `/api/comments/../etc/passwd/design` (covered by `npm run smoke`, include the result here).
- **XSS payload inert**: post `<script>alert(1)</script>` as a comment body; verify it renders as text, not as a script, in both the Comments panel and the thread card.
- **Orphan group appears after a doc regen that drifts anchors**: seed a comment, mutate the doc's anchor.exact text, call `plan_reanchor`, reload, confirm the comment appears in the pinned "Needs reattachment" group.

### Step 5 — Report

Produce a table:

```
=== Test results: <scenario> ===

Scenario ID | Priority | Status | Notes
E2E-1       | P0       | PASS   |
E2E-2       | P0       | FAIL   | "Comment button did not appear after select" — see E2E-2-fail.png
E2E-3       | P0       | PASS   |
...

Corner cases:
  plan-tab 404 guard         | PASS
  comment click opens thread | FAIL — scrolls only, no panel mounts
  TODOs panel overlay        | PASS
  dark-mode contrast         | PASS
  keyboard (Ctrl+Alt+M)      | PASS
  mobile layout              | SKIPPED (viewport not resized)
  SSE cross-tab              | PASS
  rate limit visible         | PASS
  XSS inert                  | PASS
  orphan group on reanchor   | PASS

Overall: N passed, M failed of K total. Fail screenshots in cc-history/YYYY-MM-DD-plan-test/.
```

### Step 6 — Regression suggestions

For each failing case, propose:
1. The minimal code change to fix (file + line, if visible from the repro).
2. A specific smoke-test assertion that would have caught it (so the next run catches regressions).

DO NOT apply fixes automatically — report them and let the user decide. The exception is when the user explicitly prefixes their invocation with `/plan-test fix` (then iterate: test → fix → re-test until green).

## Sub-commands

| Invocation                                 | Behavior                                                                   |
|--------------------------------------------|----------------------------------------------------------------------------|
| `/plan-test <scenario>`                    | Run every P0 + P1 scenario from test-plan.html plus the corner-case suite. |
| `/plan-test <scenario> <scenarioId>`       | Run one specific E2E scenario (e.g. `E2E-3`).                              |
| `/plan-test <scenario> corner-cases`       | Skip the numbered scenarios; run only the corner-case checklist.           |
| `/plan-test <scenario> fix`                | Iterate fix + re-test until every P0 scenario passes (destructive!).       |

## Principles

1. **The test plan is the oracle.** If a scenario says "click Comment button", the test runs a real click through Playwright — not a synthetic `fetch`.
2. **Evidence on every failure.** A screenshot + console log attached; the user shouldn't have to repro.
3. **Re-runnable.** Between scenarios, reset persistent state so a bug in scenario N doesn't pollute scenario N+1.
4. **Corner cases are first-class.** UX regressions (overlap, 404 on nav click, broken keyboard shortcut) don't show up in an API-only smoke test. This skill is the place for them.
5. **One click = one result.** If the scenario says "click Resolve → the row moves to Resolved subsection", run exactly that click and assert that exact DOM change. No paraphrasing.
