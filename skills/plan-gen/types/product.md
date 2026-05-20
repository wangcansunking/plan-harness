# type: product  (alias: `prd`)

<!-- adapted from mattpocock/skills engineering/to-prd/SKILL.md -->

| Field                       | Value                                                       |
|-----------------------------|-------------------------------------------------------------|
| Output filename             | `product.html` + `product.meta.json`                        |
| Manifest fields             | `productHtml`, `productGeneratedAt`, `metaHashes.product`   |
| Hard upstream               | — (root of the v2 DAG)                                      |
| Soft upstream               | `_shared/glossary` (use canonical terms)                    |
| Downstream                  | `analysis` (reads `problem` + `userStories`)                |
| Agent team                  | PM (lead), Architect (constraints), Writer                  |
| Mixins                      | `_grill-mixin`, `_caveman-mixin`, `_html-base`              |

## Scope

PRD: WHY are we doing this and WHO benefits. Engineering-flavoured but written from the user's perspective. No file paths, no code snippets.

## meta.json schema

```jsonc
{
  "doc": "product",
  "scenario": "<slug>",
  "generatedAt": "<ISO>",
  "upstream": {},
  "problem":           { "summary": "<1 sentence>", "evidence": ["..."] },
  "users":             [{ "role": "...", "need": "..." }],
  "userStories":       [{ "id": "US1", "as": "...", "want": "...", "so": "...", "ac": ["..."] }],
  "successMetrics":    ["..."],
  "outOfScope":        ["..."],
  "openQuestions":     [{ "q": "...", "current": "...", "owner": "..." }],
  "implementationDecisions": ["..."]
}
```

## Phase B must-ask fields

1. `problem.summary` — single sentence framing
2. `users` — who is affected (role + need)
3. `userStories` — at minimum 3 stories, each with acceptance criteria
4. `successMetrics` — how we'll know it worked (measurable)
5. `outOfScope` — explicit exclusions
6. `openQuestions` — ambiguities the user wants flagged

Do **not** ask for: implementation details, file paths, code structure. Those belong in `design`.

## Render rules (Phase C)

- §1 Problem opens with a callout (the one-sentence summary).
- §2 Users as a 2-column table (role · need).
- §3 User stories as a table, optionally preceded by a story-map SVG if ≥6 stories.
- §4 Success metrics as a table (#, metric, target).
- §5 Out-of-scope, §6 Open questions, §7 Decisions snapshot (link to `design.html#decisions`).
- Follow `_caveman-mixin` render priority (diagram > chart > table > dl > bullet > card > prose).

## Notes for /plan-gen

- This is the new DAG root; if no `product.meta.json` exists, `/plan-gen analysis` should prompt to generate product first (soft-block, allow `--skip-product` flag).
- Glossary conflict detection: before writing any `userStories.want`, check `_shared/glossary/glossary.meta.json` and flag terms the user is overloading.

## Task list

Seed TodoWrite at the start of `/plan-gen product`. Tick `in_progress` → `completed` as you go.

1. Phase A · read repo context + manifest contexts
2. Phase A · draft problem (summary + evidence)
3. Phase A · draft users[] (role + need)
4. Phase A · draft userStories[] with AC (As/I want/So that + ac[])
5. Phase A · draft successMetrics + outOfScope + openQuestions
6. Phase B · grill problem.summary (single sentence framing)
7. Phase B · grill userStories[] ambiguity + glossary conflicts
8. Phase B · grill outOfScope[] (force the cut)
9. Phase B · grill successMetrics for measurability
10. Phase B · offer glossary entries for new terms
11. Phase C · render product.html
12. Phase C · embed canonical meta script + lint pass + record manifest hash
