---
name: plan-sync
description: When an upstream plan doc changes, cascade-regenerate every downstream doc in topological order using content-hash diff (not mtime) and a diff-aware grill that only re-asks affected fields.
---

# plan-sync

Plan docs form a dependency graph. Every doc has a `<doc>.meta.json` whose canonical SHA256 lives in `manifest.metaHashes[<doc>]`. When a doc is generated, the `manifest.upstreamHashes[<doc>][<upstream>]` field snapshots the upstream hash that was current at generation time. A doc is **stale** when any upstream's current hash differs from its snapshot.

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

## Dependency Graph

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

Use `findStaleDocs(manifest)` from `local-proxy/src/manifest.js`:

```js
import { findStaleDocs, computeMetaHash } from '../../local-proxy/src/manifest.js';

// 1. Recompute current metaHash for every <doc>.meta.json in the scenario.
//    This handles the case where the user edited meta.json directly without
//    going through /plan-gen — manifest.metaHashes is now stale itself.
for (const doc of DOC_TYPES) {
  const meta = await readJson(`${doc}.meta.json`);
  if (meta) manifest.metaHashes[doc] = computeMetaHash(meta);
}

// 2. Find every doc whose upstreamHashes snapshot disagrees with current
//    upstream metaHashes.
const stale = findStaleDocs(manifest);
// → [{ doc: 'analysis', upstream: 'product', was: '<old>', now: '<new>' }, ...]
```

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
| Origin doc's `meta.json` missing                 | Stop: tell user to run `/plan-gen <doc>` first to create it          |
| Downstream sub-skill fails                       | Stop at that step, surface the error + file-level diagnostic         |
| Test-report fix-loop hits its own stop condition | Exit gracefully, record the remaining failures in the final summary  |

## Cross-Links

| Document / Skill                | Relationship                                                      |
|---------------------------------|-------------------------------------------------------------------|
| `/plan-edit <doc> <hint>`       | Single-doc edit (no cascade) — opposite axis of this skill        |
| `/plan-gen <doc>`               | Invoked per stale doc in cascade body                             |
| `/plan-gen test-report`         | Always runs last (with fix loop) unless `no-test-report` flag set |
| `manifest.json`                 | metaHashes / upstreamHashes read for diff, written after each sub-skill |
| `local-proxy/src/manifest.js`   | `findStaleDocs`, `computeMetaHash`, `recordGeneration` utilities  |
