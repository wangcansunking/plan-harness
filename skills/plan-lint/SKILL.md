---
name: plan-lint
description: Run html-lint + meta-validate on an existing plan doc and auto-fix the findings. Mechanical issues get patched in place; semantic issues (missing sections, mockups, cross-doc drift) trigger a targeted Writer re-dispatch with the findings injected. Standalone version of Phase C's gate retry loop — invoke any time a doc shows lint/validate failures.
---

# plan-lint

Fix lint and validate findings on an already-generated doc, without re-running the full `/plan-gen` Phase A/B grill cycle. Reads the existing `<doc>.html` + `<doc>.meta.json`, runs both gates, applies fixes, re-runs until clean (or two retries fail).

This is the same self-heal procedure that Phase C enforces during `/plan-gen`, made available as a standalone command for the common case: "this doc was generated before the contract tightened, can you bring it up to spec?"

## When to Use

- Lint banner appears on a doc in the dashboard, and you want it gone.
- After a contract change (new lint rule, new validate check) you want to re-lint every existing doc.
- The Phase C retry loop ran out of attempts and wrote `<doc>.lint.json` / `<doc>.validate.json`. You've inspected the findings and want to retry with more attempts.
- User explicitly says: "lint this doc", "fix the lint errors on design", "plan-lint", "/plan-lint <something>".

## Invocation Forms

| Invocation                                  | Behavior                                                              |
|---------------------------------------------|-----------------------------------------------------------------------|
| `/plan-lint`                                | Lint every doc in the current scenario; auto-fix what you can         |
| `/plan-lint <doc>`                          | Lint one doc in the current scenario (e.g. `/plan-lint design`)       |
| `/plan-lint <scenario> <doc>`               | Cross-scenario form (e.g. `/plan-lint mcp-evaluation-platform design`) |
| `/plan-lint <scenario>`                     | Lint every doc in a named scenario                                    |
| `/plan-lint _shared`                        | Lint shared assets (`_shared/{context,glossary,decisions}`)           |
| `/plan-lint --dry-run`                      | Report findings, apply NO fixes                                       |
| `/plan-lint --no-validate`                  | html-lint only; skip the meta-validate gate                           |
| `/plan-lint --no-rewriter`                  | Auto-fix mechanical findings only; don't re-dispatch the Writer       |
| `/plan-lint <target> --max-retries N`       | Override the default 2-retry cap (default: 2 Writer dispatches max)   |

`<doc>` aliases: `prd → product`, `sm → state-machine`, `impl → implementation`, `testspec → test-spec`, `report → test-report`.

## Prerequisites

- `plan-harness/<scenario>/<doc>.html` and `<doc>.meta.json` must already exist. If only the meta exists (Phase C never produced HTML), refuse and tell the user to run `/plan-gen <doc>` instead.
- For shared assets, `plan-harness/_shared/<asset>/...` must exist.
- The bundled lint + validate CLIs (`local-proxy/bin/lint.mjs`, `local-proxy/bin/validate.mjs`) must be available — they ship with the plugin cache.

## Workflow

### Step 1 — Resolve targets

1. Parse the argument. Resolve aliases. If `<scenario>` is omitted, look at `plan-harness/manifest.json` or `cwd` to find the current scenario.
2. Build the target list (one or many `<doc>.html` paths). Drop any that don't exist on disk (log a one-liner per skip).
3. If the target list is empty, print `"Nothing to lint. Pass /plan-lint <doc> or /plan-lint <scenario>."` and stop.

### Step 2 — Run gates and collect findings

For each target, in order:

1. Run `lintFile()` from `local-proxy/src/html-lint.js` (or `node bin/lint.mjs <path>` if importing fails). Shared-asset docs pass `skipRules: ['L1-docgroup', 'L1-active']`.
2. If `--no-validate` was NOT passed, run `validateDoc()` from `local-proxy/src/meta-validate.js` against the sibling `<doc>.meta.json` + the HTML.
3. Aggregate `{lintErrors[], validateErrors[]}` per target.

If every target is clean, print:
```
=== plan-lint: all clean ===
{n} doc(s) checked · 0 errors · {w} warning(s)
```
and stop.

### Step 3 — Categorise findings

For each finding, decide which fix path applies. The categories are not user-configurable — they map to fix mechanism:

| Category    | Examples of findings                                                                 | Fix path                                      |
|-------------|--------------------------------------------------------------------------------------|-----------------------------------------------|
| `mechanical` | `L1-nav` missing `<div class="sections">`, `L2-palette` drift, `L1-active` missing, `L3-shared-link` count off | Direct `Edit` against `<doc>.html`. No Writer. |
| `semantic`  | `L3-product-mockups`, `L3-story-flows`, `L3-ux-visuals`, `V3-*` cross-doc refs, `V4-*` HTML coverage | Re-dispatch the Writer with the findings.     |
| `meta-only` | `V1-shape` missing meta fields, `V2-product-mockups` (missing `mockup` field on a story) | Direct `Edit` against `<doc>.meta.json` if a value can be inferred from upstream meta; otherwise escalate to `semantic` (Writer needs to draft real content). |

### Step 4 — Apply fixes (retry loop, fail-closed)

The loop is the same shape as Phase C's mandatory retry, capped at `--max-retries` (default 2):

```
attempt = 0
while attempt < maxRetries:
  attempt += 1
  apply all mechanical fixes (Edit ops)
  if any semantic finding AND --no-rewriter NOT passed:
    re-dispatch Writer (subagent_type: "general-purpose") with:
      - the current <doc>.html
      - the current <doc>.meta.json
      - relevant upstream meta files
      - the full findings JSON as "previous attempt failed lint with these errors"
      - explicit instruction: "produce a corrected version using __META_JSON_PLACEHOLDER__ for the meta script body"
    overwrite <doc>.html with the Writer's output, re-inject meta bytes verbatim
  re-run lint + validate
  if both clean: break
```

After the loop:
- Clean → continue to Step 5.
- Still dirty → write `<doc>.lint.json` and/or `<doc>.validate.json` with the residual findings; mark the manifest with the failure; surface the report to the user. Do NOT update `<doc>GeneratedAt` (the doc is still considered un-recorded since it doesn't satisfy the contract).

### Step 5 — Record + report

For each target that ended clean:

1. Delete any leftover `<doc>.lint.json` / `<doc>.validate.json` files from previous failed runs.
2. Re-compute `metaHashes[<doc>]` (the auto-fix may have touched the meta) via `recordGeneration` from `local-proxy/src/manifest.js`. Do NOT touch `upstreamHashes` — this is a re-lint, not a regeneration.
3. Print one line per target:
   ```
   [✓] design.html        fixed  (3 mechanical, 1 Writer retry · 12 findings → 0)
   [△] product.html       partial (2 mechanical fixed; 1 semantic finding remains — see product.lint.json)
   [✗] test-spec.html     unchanged (--dry-run)
   ```

### Step 6 — Final summary

```
=== plan-lint complete ===

Targets:    {n}
Clean:      {clean}/{n}
Fixed:      {fixed}
Partial:    {partial}    (residual findings; see *.lint.json / *.validate.json)
Skipped:    {skipped}    (--dry-run or files missing)
Duration:   {mm:ss}

Next:
  /plan-sync                Cascade if you want downstream regenerated
  /plan-gen <doc>           Full Phase A/B/C if a Writer retry wasn't enough
```

## What plan-lint does NOT do

- **No Phase B grill.** This skill assumes the doc's `meta.json` is mostly right and the issue is in the rendered HTML or in a small handful of meta fields. If big chunks of meta need re-asking, use `/plan-edit` (single-doc grill) or `/plan-gen` (full regenerate).
- **No cascade.** Fixing `design.html` doesn't re-lint `state-machine.html`. Run `/plan-lint <scenario>` to lint every doc, or `/plan-sync` if upstream meta changed.
- **No new content.** plan-lint can fix `class="active"` missing on the active link, but it won't invent a missing User Story or change a mockup's content. Semantic findings that need real authoring escalate to the Writer; if the Writer can't satisfy them either, the doc lands as "partial".

## Error Handling

| Error                                              | Resolution                                                                       |
|----------------------------------------------------|----------------------------------------------------------------------------------|
| `<doc>.html` missing (only meta exists)           | Stop: `"design.html missing — run /plan-gen design instead."`                    |
| `<doc>.meta.json` missing                         | Stop: `"design.meta.json missing — cannot lint without the SoT."`                |
| Lint/validate module import fails                 | Fall back to `node bin/lint.mjs <path>` + `node bin/validate.mjs <path>` via shell |
| Writer re-dispatch returns malformed HTML         | Treat as failed retry; don't overwrite the existing HTML; surface the error      |
| Both retries exhausted, findings remain           | Write `<doc>.lint.json` + `<doc>.validate.json`; do NOT touch the manifest hash  |
| User passes `--dry-run` and `--no-rewriter`        | Effectively a pure report; lint runs, no fixes applied, no Writer dispatch       |

## Cross-Links

| Skill / File                       | Relationship                                                                  |
|------------------------------------|-------------------------------------------------------------------------------|
| `/plan-gen <doc>`                  | Full Phase A/B/C regeneration. Use when meta needs re-grilling, not just HTML touch-up. |
| `/plan-edit <doc> <hint>`          | Single-field meta edit. Use when fields drifted but rendering is fine.        |
| `/plan-sync`                       | Hash-based cascade after upstream meta change. Run AFTER plan-lint if needed. |
| `local-proxy/src/html-lint.js`     | First gate — structure / palette / link hygiene / mockup-count rules.         |
| `local-proxy/src/meta-validate.js` | Second gate — schema shape, cross-doc refs, HTML semantic coverage.           |
| `local-proxy/bin/lint.mjs`         | Standalone lint CLI (no npm install needed).                                  |
| `local-proxy/bin/validate.mjs`     | Standalone validate CLI.                                                      |
| `prompts/_html-base.md`            | The contract every lint rule enforces. Source of truth for "what should the HTML look like." |
| `skills/plan-gen/SKILL.md` §Phase C | Defines the same retry procedure plan-lint implements as a standalone skill.  |
