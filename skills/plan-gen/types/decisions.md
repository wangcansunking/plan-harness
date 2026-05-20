# type: decisions  (repo asset, not scenario doc — ADR list)

<!-- adapted from mattpocock/skills engineering/grill-with-docs/ADR-FORMAT.md -->

| Field                       | Value                                                            |
|-----------------------------|------------------------------------------------------------------|
| Output filename             | `_shared/decisions/<NNNN>-<slug>.html` + `<NNNN>-<slug>.meta.json` + `index.html` |
| Manifest fields             | `sharedAssets.decisions.path`, `sharedAssets.decisions.indexHash` |
| Hard upstream               | —                                                                |
| Downstream                  | every scenario doc (header link)                                 |
| Agent team                  | Architect (lead), Writer                                         |
| Mixins                      | `_grill-mixin`, `_caveman-mixin`, `_html-base`                   |

## Scope

ADR list. Sequentially numbered. **Offer sparingly** — most decisions don't need an ADR.

## Three-gate threshold (ALL must be true to record)

1. **Hard to reverse.** Cost of changing your mind later is meaningful.
2. **Surprising without context.** A future reader will look at the code and wonder "why this way?"
3. **Real trade-off.** Genuine alternatives existed and you picked one for specific reasons.

If ANY gate fails: SKIP the ADR. Don't pollute decisions/ with routine choices.

## meta.json schema (per ADR)

```jsonc
{
  "doc": "decisions",
  "id": "0001",
  "slug": "event-sourced-orders",
  "generatedAt": "<ISO>",
  "title": "Use event sourcing for the Ordering context",
  "status": "proposed|accepted|deprecated|superseded by ADR-NNNN",
  "summary": "1-3 sentences: context, decision, why.",
  "consideredOptions": [],
  "consequences": []
}
```

`consideredOptions` and `consequences` are optional — only include when they add real value.

## What qualifies (examples)

- Architectural shape (monorepo, event sourcing, CQRS).
- Integration patterns between contexts (events vs sync HTTP).
- Technology lock-in (DB, message bus, auth provider).
- Boundary decisions (X is owned by context Y; others ref by ID).
- Deliberate deviations (manual SQL not ORM because X).
- Constraints not visible in code (compliance, partner SLAs).
- Non-obvious rejections (considered GraphQL, picked REST because Z).

## What does NOT qualify

- Library choices that can be swapped in an afternoon.
- Naming preferences (capture in glossary).
- Bug fixes (no decision being made).
- Code style (covered by linters).

## Render rules

**Per ADR** (`<NNNN>-<slug>.html`):
- §1 Title + status badge.
- §2 Summary callout (1-3 sentences).
- §3 Considered options (only if present) as table.
- §4 Consequences (only if present) as bullet list.

**Index** (`index.html`):
- Single table: id, title, status, date.
- Sorted by id ascending.

## Numbering

Scan `_shared/decisions/` for highest existing `<NNNN>-*.meta.json`; new ADR = highest + 1.

## Notes for /plan-gen

- Auto-offered during scenario grill ONLY when all 3 gates pass. User confirms before write.
- Status changes (accepted → superseded) update the existing meta.json + re-render; new ADR is a new file.

## Task list

Seed TodoWrite at the start of `/plan-gen decisions` (or when offering an ADR mid-grill). Tick `in_progress` → `completed` as you go.

1. Phase A · scan _shared/decisions/ for highest existing NNNN
2. Phase A · check 3-gate threshold (hard-to-reverse + surprising + real trade-off)
3. Phase A · draft title + summary (1-3 sentences: context, decision, why)
4. Phase A · draft consideredOptions[] + consequences[] (only if value-add)
5. Phase B · grill summary tightness
6. Phase B · grill consideredOptions[] (real alternatives, not strawmen)
7. Phase C · render _shared/decisions/NNNN-slug.html
8. Phase C · re-render _shared/decisions/index.html (id/title/status table)
9. Phase C · embed canonical meta script + lint pass + record sharedAssets.decisions.indexHash
