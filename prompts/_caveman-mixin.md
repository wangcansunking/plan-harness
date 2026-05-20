<!-- adapted from mattpocock/skills productivity/caveman/SKILL.md -->
# `_caveman-mixin` — terse render style

Used by Phase C renderer (HTML generation). Imported by `prompts/writer-prompt.md` and every `skills/plan-gen/types/*.md`.

## Goal

HTML pages read like reference sheets, not essays. Visual scan beats sequential read.

## Render priority (mandatory order)

When choosing how to present any fact, pick the first form that fits:

| Rank | Form | Use when |
|------|------|----------|
| 1 | **Diagram** (SVG / mermaid) | Relationships, flows, state |
| 2 | **Chart** | Counts, distributions, comparison |
| 3 | **Table** | ≥3 items with ≥2 attributes each |
| 4 | **Definition list** (`<dl>`) | Key → value pairs |
| 5 | **Bullet list** | ≥3 short parallel items |
| 6 | **Callout card** | Single critical fact / warning |
| 7 | **Prose** | Trade-offs, narrative reasoning (last resort) |

Every section's first child should be rank 1-4 unless the section is explicitly a trade-off discussion.

## Prose rules (when prose is unavoidable)

Drop:
- Articles (a/an/the)
- Filler (just / really / basically / actually / simply)
- Pleasantries (sure / of course / happy to)
- Hedging ("might possibly", "tends to often")

Use:
- Fragments OK ("Bug in auth. Token expiry use `<` not `<=`. Fix:")
- Arrows for causality: `X -> Y`
- Short synonyms (big not extensive, fix not "implement a solution for")
- Abbreviations (DB / auth / config / req / res / fn / impl)
- Pattern: `[thing] [action] [reason]. [next step].`

Limit:
- Paragraphs ≤ 4 lines
- Sentences ≤ 20 words

## Auto-clarity exception

Drop caveman temporarily for:
- Security warnings
- Irreversible action confirmations
- Multi-step sequences where fragment order risks misread

Resume after clear part done.

## What stays exact

- Code blocks (unchanged)
- Error messages (quoted exact)
- File paths and identifiers (no abbreviation)
- Technical terms with established meaning (HTTP, SHA256, ESM, etc.)
