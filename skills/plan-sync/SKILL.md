---
name: plan-sync
description: When an upstream plan doc changes, cascade-regenerate every downstream doc in topological order using content-hash diff (not mtime) and a diff-aware grill that only re-asks affected fields. Replaces the v1 mtime-based detection with manifest v2's metaHashes / upstreamHashes comparison.
---

# plan-sync

Plan docs form a dependency graph. In v2, every doc has a `<doc>.meta.json` whose canonical SHA256 lives in `manifest.metaHashes[<doc>]`. When a doc is generated, the `manifest.upstreamHashes[<doc>][<upstream>]` field snapshots the upstream hash that was current at generation time. A doc is **stale** when any upstream's current hash differs from its snapshot.

This skill is the "do the cascade for me" button: detect stale docs via hash diff, list what needs to regenerate, ask for confirmation, run them in topological order with a **diff-aware grill** (only re-asks fields touched by upstream changes), and finish by running `/plan-gen test-report` so the user sees whether the new shape actually works.

## When to Use

- After manually editing any `<doc>.meta.json` (or its embedded `<script id="meta">`)
- After `/plan-edit <doc> <hint>` updates one field on an upstream doc
- After `/plan-gen <doc>` re-runs (which already updates the doc but leaves downstream stale)
- After accepting a `/plan-review` correction that rewrote an upstream
- When the user says "sync the docs", "update everything downstream", "/plan-sync", "重新生成", "cascade update"

## What It Produces

- Every downstream doc is regenerated in-place, with diff-aware grill
- A final `test-report.html` run so the user sees whether the new spec holds up
- `manifest.metaHashes` + `upstreamHashes` refreshed for each regenerated doc
- A one-screen CLI summary showing what changed, what got regenerated, and the test-report verdict

## Dependency Graph (v2)

```
product → analysis → design ┬─► state-machine ─┐
                             ├─► test-spec ◄────┤
                             └─► implementation ◄┤
                                      └─► test-report ◄─┘
```

Topological order (lowest → highest downstream):

1. `product` (root)
2. `analysis`
3. `design`
4. `state-machine`
5. `test-spec`
6. `implementation`
7. `test-report` (with fix loop)

Shared assets (`context`, `glossary`, `decisions`) are NOT in this cascade — their hash diff flags a ⚠ on the dashboard but does not auto-trigger downstream regeneration.

## Workflow

### Step 1 — Detect stale docs (hash diff)

Use `findStaleDocs(manifest)` from `local-proxy/src/manifest-v2.js`:

```js
import { findStaleDocs, computeMetaHash } from '../../local-proxy/src/manifest-v2.js';

// 1. Recompute current metaHash for every <doc>.meta.json in the scenario.
//    This handles the case where the user edited meta.json directly without
//    going through /plan-gen — manifest.metaHashes is now stale itself.
for (const doc of V2_DOC_TYPES) {
  const meta = await readJson(`${doc}.meta.json`);
  if (meta) manifest.metaHashes[doc] = computeMetaHash(meta);
}

// 2. Find every doc whose upstreamHashes snapshot disagrees with current
//    upstream metaHashes.
const stale = findStaleDocs(manifest);
// → [{ doc: 'analysis', upstream: 'product', was: '<old>', now: '<new>' }, ...]
```

If the manifest is v1 (`schemaVersion !== 2`), refuse the cascade and tell the user: `"This scenario is v1 (mtime-based). Use --allow-v1 to force a full cascade, or migrate the scenario to v2 first."`

If no docs are stale, stop and tell the user: `"All docs in sync. Hashes match upstream snapshots."`

### Step 2 — Build the regeneration plan

Print the staleness list before doing anything:

```
=== Plan-Sync: hash-based cascade ===

Stale docs (in topological order):
  ⚠ analysis    — upstream product changed (was abc1234, now def5678)
  ⚠ design      — transitively stale via analysis
  ⚠ state-machine — transitively stale via design
  ⚠ test-spec   — transitively stale via design
  ⚠ implementation — transitively stale via design/test-spec
  ⚠ test-report — transitively stale via test-spec

For each downstream doc, /plan-sync will re-grill ONLY the fields known to
be affected by the upstream change (diff-aware grill).

Proceed? [y]es / [s]kip one or more / [n]o / [d]ry-run
```

### Step 3 — Regenerate in topological order (diff-aware grill)

For each stale doc:

1. Compute the upstream diff: for every upstream `u` of this doc, diff the previous `upstreamHashes[doc][u]` snapshot against the current `metaHashes[u]`. The diff is a list of changed top-level meta fields (use a JSON deep-diff against the previously-rendered meta if you have it cached; otherwise treat all top-level fields as potentially affected).
2. Look up `types/<doc>.md` "Phase B must-ask fields" and intersect with the changed-fields list → **field allowlist**.
3. Dispatch `/plan-gen <doc> --cascade --field-allowlist <list>`:
   - Phase A re-drafts meta from upstream as usual.
   - Phase B grills ONLY the allowlisted fields (the rest are kept from the previous meta.json).
   - Phase C re-renders HTML.
4. Update `manifest.metaHashes[doc]` and `manifest.upstreamHashes[doc][*]` via `recordGeneration`.
5. Print one line:
   ```
   [2/5] design.html      regenerated · 3 fields re-grilled (goals, decisions, interfaces)
   ```
6. If any step fails, STOP and surface the error. Do not silently skip.

### Step 4 — Run `/plan-gen test-report` with the fix loop

As the final step, dispatch `/plan-gen test-report` (not `no-ask`). This:

1. Runs every scenario from the newly-regenerated `test-spec.html`.
2. Produces the updated `test-report.html`.
3. Enters the interactive fix loop — any regression introduced by the cascade gets caught + triaged.

The sync skill exits when the inner test-report skill exits.

### Step 5 — Final summary

After the test-report loop resolves, print:

```
=== Plan-Sync complete ===

Origin:      product (hash changed)
Regenerated: 5 docs
Fields re-grilled: 11 total (avg 2.2 per doc — diff-aware grill saved ~70% prompts)
Test run:    11/11 P0 passed, 2 fixes applied during loop
Duration:    {mm:ss}

Updated manifest hashes:
  product:        abc1234 → abc1234  (unchanged — origin)
  analysis:       def5678 → 9a8b7c6
  design:         11ee22f → b3c4d5e
  state-machine:  …
  test-spec:      …
  implementation: …
  test-report:    …

Open the dashboard to review:
  http://localhost:{port}/scenario/{scenarioName}
```

## Sub-commands

| Invocation                                  | Behavior                                                                 |
|---------------------------------------------|--------------------------------------------------------------------------|
| `/plan-sync`                                | Auto-detect stale docs via hash diff; ask before cascading               |
| `/plan-sync <scenario>`                     | Same, for a specific scenario                                            |
| `/plan-sync <scenario> from:<doc>`          | Force-start cascade from a named doc (skip stale detection)              |
| `/plan-sync <scenario> no-test-report`      | Regenerate downstream but skip the final test-report + fix loop          |
| `/plan-sync <scenario> --dry-run`           | Print the stale list + would-grill fields, execute nothing               |
| `/plan-sync <scenario> --check-assets`      | Also check `_shared/` hashes; warn but do not cascade                    |
| `/plan-sync <scenario> --allow-v1`          | Force a v1 mtime-based cascade for legacy scenarios                      |

## Principles

1. **Hash, not mtime.** Touching a file (e.g. opening in an editor) must not trigger cascade.
2. **Diff-aware grill is mandatory.** Don't re-ask the user every Phase B field — only the ones affected.
3. **Never skip the test.** Downstream regeneration without verification leaves the user blind to the real impact.
4. **Topological, not batch.** Each sub-skill reads the freshly-regenerated upstream.
5. **Ask once, then flow.** One confirmation before starting; don't re-prompt between every step (unless the user picked `s`).
6. **Fail loud.** If a step fails, stop. The user needs the upstream fixed first.
7. **Shared assets warn, don't cascade.** `_shared/` hash changes show ⚠ but don't auto-trigger.

## Error Handling

| Error                                            | Resolution                                                           |
|--------------------------------------------------|----------------------------------------------------------------------|
| `manifest.json` missing                          | Stop: "Run /plan-init first."                                        |
| `manifest.schemaVersion !== 2`                   | Stop unless `--allow-v1` passed                                      |
| Origin doc's `meta.json` missing                 | Stop: tell user to run `/plan-gen <doc>` first to create it          |
| Downstream sub-skill fails                       | Stop at that step, surface the error + file-level diagnostic         |
| Test-report fix-loop hits its own stop condition | Exit gracefully, record the remaining failures in the final summary  |

## Cross-Links

| Document / Skill                | Relationship                                                      |
|---------------------------------|-------------------------------------------------------------------|
| `/plan-edit <doc> <hint>`       | Single-doc edit (no cascade) — opposite axis of this skill        |
| `/plan-gen <doc>`               | Invoked per stale doc in cascade body                             |
| `/plan-gen test-report`         | Always runs last (with fix loop) unless `no-test-report` flag set |
| `manifest.json` (v2)            | metaHashes / upstreamHashes read for diff, written after each sub-skill |
| `local-proxy/src/manifest-v2.js`| `findStaleDocs`, `computeMetaHash`, `recordGeneration` utilities  |

## When to Use

- After manually editing `design.html`, `test-plan.html`, `test-cases.html`, or `state-machine.html`
- After `/plan-gen design` re-runs (which already updates `design.html` but leaves downstream stale)
- After accepting a `/plan-review` correction that rewrote an upstream doc
- When the user says "sync the docs", "update everything downstream", "/plan-sync", "重新生成", "cascade update"

## What It Produces

- Every downstream doc is regenerated in-place, preserving the surrounding pipeline
- A final `test-report.html` run so the user sees whether the new spec holds up
- `manifest.json` timestamps refreshed for each regenerated doc
- A one-screen CLI summary showing what changed, what got regenerated, and the test-report verdict

## Dependency Graph

```
analysis.html  (optional upstream of design)
└── design.html
    ├── state-machine.html ─────────────────────┐
    ├── test-plan.html                          │
    │   ├── test-cases.html ────────────────────┤
    │   ├── test-report.html  ← also optional: implementation
    │   └── implementation-plan.html            │
    └── implementation-plan.html ← optional: sm/test-plan/test-cases ┘
```

Topological order (lowest → highest downstream):

1. `analysis.html` (optional root; if user edited it, cascade starts here)
2. `design.html` (hard root; regenerated via `/plan-gen design` if marked dirty)
3. `state-machine.html` (via `/plan-gen state-machine`)
4. `test-plan.html` (via `/plan-gen test-plan`)
5. `test-cases.html` (via `/plan-gen test-cases`)
6. `implementation-plan.html` (via `/plan-gen implementation`)
7. `test-report.html` (via `/plan-gen test-report`, includes fix loop)

## Workflow

### Step 1 — Detect what changed

Inspect the scenario directory using one of these signals (in priority order):

1. **User-stated change** — if the user says "I updated design" or "test-plan §4 changed", take that at face value; treat the named doc as the origin of the cascade.
2. **File mtime vs manifest timestamp** — for each doc, compare the file's `mtime` (from `stat`) to its `{docType}GeneratedAt` field in `manifest.json`. If `mtime > generatedAt`, the file was edited outside the skill → treat it as the cascade origin.
3. **Git status** — if the scenario dir is under git, run `git status plans/<scenario>/` to find modified tracked files.

If more than one origin is detected (e.g. both design and test-plan were edited), take the UPPERMOST one in the topological order and regenerate everything below.

If no change is detected, stop and tell the user: `"No upstream edits detected. Use /plan-gen design or /plan-gen test-plan directly if you want to force a regenerate."`

### Step 2 — Build the regeneration plan

From the detected origin, list every downstream doc per the dependency graph.

Print this to the CLI before doing anything:

```
=== Plan-Sync: cascade from {originDoc} ===

Detected change:
  {originDoc} — mtime 2026-04-18T15:22Z > manifest 2026-04-17T12:03Z
  (Δ 1d 3h)

Will regenerate (topological order):
  1. design.html               (via /plan-gen design, only if analysis was the origin)
  2. state-machine.html        (via /plan-gen state-machine)
  3. test-plan.html            (via /plan-gen test-plan)
  4. test-cases.html           (via /plan-gen test-cases)
  5. implementation-plan.html  (via /plan-gen implementation)
  6. test-report.html          (via /plan-gen test-report, with fix loop)

Proceed? [y]es / [s]kip one or more steps / [n]o
```

If the user picks:
- `y` → execute all steps in order.
- `s` → prompt step-by-step; user confirms or skips each.
- `n` → stop.

### Step 3 — Regenerate in topological order

For each step:

1. Dispatch the corresponding sub-skill using the Skill tool (e.g. `Skill("plan-state-machine")`).
2. The sub-skill reads upstream docs as inputs (per its own SKILL.md).
3. Wait for completion before moving to the next step — downstream skills need upstream output.
4. After each step, print one line:
   ```
   [2/5] test-plan.html      regenerated — 18 scenarios (P0:11, P1:5, P2:2)
   ```
5. If any step fails (agent error, disk error, missing input), STOP and surface the error. Do not silently skip.

### Step 4 — Run `/plan-gen test-report` with the fix loop

As the final step, dispatch `/plan-gen test-report {scenario}` (not `no-ask`). This:

1. Runs every scenario from the newly-regenerated test-plan.html.
2. Produces the updated `test-report.html`.
3. Enters Step 6 of that skill's workflow — the interactive fix loop — so any regression introduced by the regenerate gets caught + triaged.

The Sync skill exits when the inner test-report skill exits.

### Step 5 — Final summary

After the test-report loop resolves, print:

```
=== Plan-Sync complete ===

Origin:      {originDoc}
Regenerated: 5 docs
Test run:    {P}/{T} P0 passed, {N} fixes applied during loop
Duration:    {mm:ss}

Updated manifest.json:
  analysisGeneratedAt     → {ts}  (unchanged unless analysis was the origin)
  designGeneratedAt       → {ts}  (unchanged unless design/analysis was the origin)
  stateMachineGeneratedAt → {ts}
  testPlanGeneratedAt     → {ts}
  testCasesGeneratedAt    → {ts}
  implementationPlanGeneratedAt → {ts}
  testReportGeneratedAt   → {ts}

Open the dashboard to review:
  http://localhost:{port}/scenario/{scenarioName}
```

## Sub-commands

| Invocation                                | Behavior                                                                 |
|-------------------------------------------|--------------------------------------------------------------------------|
| `/plan-sync`                              | Auto-detect origin; ask before cascading                                 |
| `/plan-sync <scenario>`                   | Same, for a specific scenario                                            |
| `/plan-sync <scenario> from:<doc>`        | Force-start cascade from a named doc (skip detection)                    |
| `/plan-sync <scenario> no-test-report`    | Regenerate downstream docs but skip the final test-report + fix loop     |
| `/plan-sync <scenario> dry-run`           | Print the plan without executing anything                                |

## Principles

1. **Never skip the test.** Downstream regeneration without verification leaves the user blind to the real impact. `/plan-gen test-report` at the end is default-on.
2. **Topological, not batch.** Each sub-skill reads the freshly-regenerated upstream; running them in parallel breaks the contract.
3. **Ask once, then flow.** One confirmation before starting; don't re-prompt between every step (unless the user picked `s` / skip-some mode).
4. **Fail loud.** If step 3 fails, stop — do not continue downstream with stale inputs. The user needs the upstream fixed first.
5. **No implicit edits.** This skill doesn't rewrite the upstream doc; it only cascades changes the user already made. If the upstream isn't what the user wanted, they should re-run `/plan-gen design` / `/plan-gen test-plan` directly.

## Error Handling

| Error                                           | Resolution                                                           |
|-------------------------------------------------|----------------------------------------------------------------------|
| `manifest.json` missing                         | Stop: "Run /plan-init first."                                        |
| Origin doc missing                              | Stop: tell user to run `/plan-{origin}` first to create it           |
| Sub-skill not yet invocable in current session  | Tell user to invoke it manually, wait for confirmation, resume       |
| Downstream sub-skill fails                      | Stop at that step, surface the error + file-level diagnostic         |
| Test-report fix-loop hits its own stop condition| Exit gracefully, record the remaining failures in the final summary  |

## Cross-Links

| Document / Skill                | Relationship                                                      |
|---------------------------------|-------------------------------------------------------------------|
| `/plan-gen design`                  | Possible origin; not triggered by this skill (user owns design changes) |
| `/plan-gen state-machine`, `/plan-gen test-plan`, `/plan-gen test-cases`, `/plan-gen implementation` | Invoked in order as the cascade body |
| `/plan-gen test-report`             | Always runs last (with fix loop) unless `no-test-report` flag set |
| `manifest.json`                 | Read for timestamps, written after each sub-skill completes       |
