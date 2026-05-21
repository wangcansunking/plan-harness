---
name: plan-edit
description: Single-doc field edit — grill only the fields a hint points at, write meta.json, re-render HTML, update metaHash. Does NOT cascade downstream.
---

# plan-edit

Localized edit of one doc. Use when you want to tweak a few fields without re-running the full Phase A/B/C generation and without disturbing downstream docs.

`/plan-edit` reads `<doc>.meta.json`, finds the field subset that matches the user's hint, runs Phase B grill on just those fields, writes meta + re-renders HTML, and updates `metaHashes[<doc>]` in the manifest.

It deliberately does **not** cascade. Downstream docs that depended on the edited fields will be flagged as stale on the next `/plan-sync`. This is intentional — small edits often don't require a full cascade, and forcing one would discourage iteration.

## Input

| Invocation | Behavior |
|------------|----------|
| `/plan-edit <doc> <hint>` | Edit fields in `<doc>` matching `<hint>` |
| `/plan-edit design "API surface"` | Grill design fields related to API surface (interfaces, contracts) |
| `/plan-edit product "out of scope"` | Grill `outOfScope` field only |
| `/plan-edit test-spec "P0 scenarios"` | Grill `scenarios` entries with `priority: "P0"` |
| `/plan-edit <doc>` (no hint) | List all top-level fields in meta and ask which to edit |

## When to Use

- After a quick conversation reveals one or two fields are wrong/missing in an existing doc
- When the user says "fix the X in design", "update the AC for US3", "tweak the implementation slice sizes"
- When `/plan-sync` would be overkill — you know exactly what to change and don't want cascade

**Do NOT use** when:
- Upstream meta changed → use `/plan-sync` so cascade snapshots the new upstream hash properly
- You want to regenerate from scratch → use `/plan-gen <doc>`
- The hint affects more than ~30% of the doc's fields → just regenerate with `/plan-gen <doc>`

## Workflow

### Step 1 — Resolve scenario + doc

1. Find `manifest.json` in `plan-harness/<scenario>/`.
2. Stop with "Run /plan-init first." if not found.
3. Verify `<doc>` is one of the seven scenario types (`product`, `analysis`, `design`, `state-machine`, `test-spec`, `implementation`, `test-report`) or a shared asset (`context`, `glossary`, `decisions`).
4. Verify `<doc>.meta.json` and `<doc>.html` both exist. If not, tell the user to run `/plan-gen <doc>` first — `/plan-edit` is for refining, not creating.

### Step 2 — Locate target fields from the hint

1. Read `<doc>.meta.json` into memory.
2. Read `skills/plan-gen/types/<doc>.md` to know the schema and the Phase B must-ask field list.
3. Dispatch an agent (architect for analysis/design/state-machine, pm for product/test-spec, all six for implementation) with:
   - The full meta.json
   - The hint string
   - The Phase B must-ask field list
   - Instruction: return a JSON array of field paths (dot/bracket notation) whose values are candidates for editing based on the hint. Include parent fields if the hint implies structural change.
4. If the agent returns an empty array, tell the user the hint didn't match any field and ask for a more specific hint.
5. If the agent returns > 30% of the schema's fields, warn the user and suggest `/plan-gen <doc>` instead. Offer to proceed anyway.

### Step 3 — Grill the located fields (Phase B subset)

1. Load `prompts/_grill-mixin.md`.
2. For each field path in the allowlist (parent decisions first per DAG order in the type's Phase B section):
   - Print the current value (truncate if long; offer "show full" if the user asks).
   - Recommend a new value or keep-as-is, cite upstream meta or code as basis.
   - Ask ONE question; wait for reply.
   - If the user overrides, update the in-memory meta.
   - If the user introduces a new term, check `_shared/glossary/glossary.meta.json` and offer to update glossary.
   - If the change encodes a hard-to-reverse + surprising + real-trade-off decision, offer an ADR (`_shared/decisions/`).
3. Skip Phase B entirely if `--no-grill` is passed — apply hint-derived edits directly and move on (lower quality, faster).

### Step 4 — Write meta + re-render HTML (Phase C)

1. Write the updated meta to `<doc>.meta.json`.
2. Load `prompts/_html-base.md` and `prompts/_caveman-mixin.md`.
3. Dispatch Writer agent to re-render `<doc>.html` per the render rules in `types/<doc>.md`.
4. Embed `<script type="application/json" id="meta">` containing the canonical meta byte-for-byte.
5. Both files must be written; if either fails, restore the previous versions from git or backup and surface the error.

### Step 5 — Update manifest

Use `recordGeneration(manifest, doc, metaObj)` from `local-proxy/src/manifest.js`:
- Updates `metaHashes[<doc>]` to the new hash.
- **Re-snapshots `upstreamHashes[<doc>][<u>]` to whatever the upstream hashes currently are.** This is the key difference from `/plan-sync`: `/plan-edit` declares "I considered the current upstream state when I made this edit," so the doc is NOT marked stale-against-upstream after the edit.
- Sets `<doc>GeneratedAt: <ISO timestamp>`.
- Clears `<doc>Generating: false` if it was set.

Write the manifest back to disk.

### Step 6 — Confirm + warn

Print a short summary:

```
=== plan-edit complete ===

Doc:       design
Fields:    interfaces[0].request, interfaces[0].response, decisions[2]
Hash:      a3b1...  →  e7f2...
Re-render: design.html (4.2 KB, mermaid block updated)

Downstream docs that may be affected:
  - state-machine  (depends on design.interfaces)
  - test-spec      (depends on design.interfaces, design.decisions)
  - implementation (depends on design.interfaces)

These are NOT auto-regenerated. Run /plan-sync if you want to cascade.
```

The downstream list comes from `DOC_UPSTREAMS` in `manifest.js` — reverse lookup: which docs name `<doc>` as a hard or soft upstream.

## Sub-commands

| Sub-command | Behavior |
|-------------|----------|
| `--no-grill` | Skip Phase B; apply edits directly. Use for trivial typo fixes. |
| `--dry-run` | Show the field allowlist + diffs without writing anything. |
| `--show-meta` | Print the current meta.json (pretty-printed) and stop. |
| `--list-fields` | Print all top-level field paths in the doc's schema and stop. |

## Principles

1. **One doc only.** No cascade. The user said "edit this one thing" — respect that scope.
2. **Hash always advances.** Every successful edit produces a new `metaHashes[<doc>]`, even for tiny changes. That's how `/plan-sync` knows to recompute downstream staleness later.
3. **Upstream snapshot stays current.** Re-snapshotting `upstreamHashes[<doc>]` is correct: the edit was made with the current upstream state in mind.
4. **HTML re-render is mandatory.** Never allow `<doc>.meta.json` and `<doc>.html` to drift. The embedded `<script id="meta">` must equal the external `meta.json` byte-for-byte.
5. **Refuse blanket edits.** If the hint matches > 30% of fields, push back and suggest full regeneration.
6. **Honor glossary + ADR thresholds.** Same rules as full Phase B — new terms get a glossary offer, irreversible decisions get an ADR offer.

## Error Handling

| Error | Resolution |
|-------|------------|
| `manifest.json` missing | Stop: "Run /plan-init first." |
| Doc not yet generated | Stop: "Run /plan-gen <doc> first — /plan-edit refines existing docs." |
| Hint matches nothing | Ask for a more specific hint. Show top-level field list. |
| Hint too broad (> 30%) | Warn + offer full regeneration via `/plan-gen <doc>`. Proceed only on explicit confirm. |
| Writer produces malformed HTML | Restore previous `<doc>.html` from git. Surface the error. |
| `<doc>.meta.json` write fails | Surface fs error; do not touch the manifest. |
| Concurrent `<doc>Generating: true` | Refuse: "A generation is already in flight. Wait or clear the flag." |

## Cross-Links

| Skill / File | Relationship |
|--------------|--------------|
| `/plan-gen <doc>` | Full regeneration; `/plan-edit` is the small-scope alternative |
| `/plan-sync` | Cascade after `/plan-edit` if downstream docs need updating |
| `prompts/_grill-mixin.md` | Phase B rules shared with `/plan-gen` |
| `prompts/_html-base.md` | Phase C rendering contract |
| `local-proxy/src/manifest.js` | `recordGeneration`, `DOC_UPSTREAMS`, `computeMetaHash` |
| `skills/plan-gen/types/<doc>.md` | Schema + must-ask field list for the targeted doc |
