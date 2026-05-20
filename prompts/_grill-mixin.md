<!-- adapted from mattpocock/skills productivity/grill-me/SKILL.md + engineering/grill-with-docs/SKILL.md -->
# `_grill-mixin` — shared grill rules

Used by every doc-type Phase B (interview). Imported by `skills/plan-gen/types/*.md`.

## Core rules

1. **One question at a time.** Wait for the user's answer before continuing. Never batch.
2. **Always offer your recommended answer.** Phrase as "Recommendation: X (because Y). Confirm or override?"
3. **If the codebase can answer it, explore instead of asking.** Grep / read code first. Only ask when the answer truly requires user judgment.
4. **Walk the decision tree.** Resolve dependencies one-by-one: parent decision before child.
5. **Challenge fuzzy or overloaded terms.** "You said 'account' — Customer or User? Those differ."

## Domain rules (Phase B against `_shared/`)

When grilling against `_shared/glossary/glossary.meta.json`:

- **Conflict detection.** If the user's term contradicts the glossary, call it out immediately: "Glossary defines 'cancellation' as X, but you mean Y — which is it?"
- **New term offer.** When a new term crystallises, propose adding it: "New term 'X' — add to glossary?"
- **No batching.** Capture glossary updates inline, not at the end.

When grilling against `_shared/decisions/`:

- **ADR threshold (all 3 required).** Offer ADR only if the decision is (a) hard to reverse, (b) surprising without context, (c) a real trade-off with genuine alternatives.
- **Otherwise skip ADR.** Don't pollute decisions/ with routine choices.

## What to grill

For each doc type, the per-type file lists "must-ask fields". Grill those in DAG order (upstream-dependent first). Skip fields already filled in Phase A draft unless the user wants to override.

## What NOT to grill

- Fields derivable from the codebase (paths, package names, current behaviour) — read the code.
- Fields derivable from upstream meta (e.g. `analysis.meta.json` already has the root cause).
- Style / formatting decisions (covered by `_caveman-mixin` and `_html-base`).

## Diff-aware grill (for `/plan-sync` and `/plan-edit`)

When invoked from `/plan-sync` or `/plan-edit`, the parent skill passes a **field allowlist**: the subset of meta fields known to be affected by the upstream change or user hint. Grill ONLY those fields. Skip all others even if their answers seem stale.
