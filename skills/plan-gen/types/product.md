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
  "userStories":       [{ "id": "US1", "as": "...", "want": "...", "so": "...", "ac": ["..."], "mockup": "<inline SVG sketch — REQUIRED per story; terminal/API sketches count for non-UI tools>" }],
  "successMetrics":    ["..."],
  "outOfScope":        ["..."],
  "openQuestions":     [{ "q": "...", "current": "...", "owner": "..." }],
  "implementationDecisions": ["..."]
}
```

## Phase B must-ask fields

1. `problem.summary` — single sentence framing
2. `users` — who is affected (role + need)
3. `userStories` — at minimum 3 stories, each with acceptance criteria AND a mockup
4. `userStories[].mockup` — REQUIRED on every story. For UI work: a screen/modal sketch. For CLI: terminal-output sketch. For libraries/backend: API-shape sketch. Confirm form with user before drafting.
5. `successMetrics` — how we'll know it worked (measurable)
6. `outOfScope` — explicit exclusions
7. `openQuestions` — ambiguities the user wants flagged

Do **not** ask for: implementation details, file paths, code structure. Those belong in `design`.

## Render rules (Phase C)

- §1 Problem opens with a callout (the one-sentence summary).
- §2 Users as a 2-column table (role · need).
- §3 User stories: render each as a card (id · As/want/so · AC list) followed by its inline **mockup SVG**. Mockup is first-class — not buried in a table cell. Story without mockup is incomplete and lint fails.
- §4 Success metrics as a table (#, metric, target).
- §5 Out-of-scope, §6 Open questions, §7 Decisions snapshot (link to `design.html#decisions`).
- Follow `_caveman-mixin` render priority (diagram > chart > table > dl > bullet > card > prose).
- Lint `L3-product-mockups` enforces: product doc must contain ≥1 inline `<svg>`/mermaid visual labelled mockup/screen, and the count must be ≥ the number of `userStories[]` entries (one mockup per story).

## Notes for /plan-gen

- This is the new DAG root; if no `product.meta.json` exists, `/plan-gen analysis` should prompt to generate product first (soft-block, allow `--skip-product` flag).
- Glossary conflict detection: before writing any `userStories.want`, check `_shared/glossary/glossary.meta.json` and flag terms the user is overloading.

## Task list

Seed TodoWrite at the start of `/plan-gen product`. Tick `in_progress` → `completed` as you go.

1. Phase A · read repo context + manifest contexts
2. Phase A · draft problem (summary + evidence)
3. Phase A · draft users[] (role + need)
4. Phase A · draft userStories[] with AC (As/I want/So that + ac[]) AND mockup[] per story (terminal/API sketches count for non-UI tools)
5. Phase A · draft successMetrics + outOfScope + openQuestions
6. Phase B · grill problem.summary (single sentence framing)
7. Phase B · grill userStories[] ambiguity + glossary conflicts
8. Phase B · grill userStories[].mockup form + coverage (one per story, surface-appropriate)
9. Phase B · grill outOfScope[] (force the cut)
10. Phase B · grill successMetrics for measurability
11. Phase B · offer glossary entries for new terms
12. Phase C · render product.html
13. Phase C · embed canonical meta script (byte-equal to `product.meta.json`)
14. Phase C · run html-lint on the rendered HTML; on errors retry the writer once, then write `product.lint.json` and abort (do NOT proceed to step 15)
15. Phase C · record manifest hash + `productGeneratedAt` (only when lint is clean)
