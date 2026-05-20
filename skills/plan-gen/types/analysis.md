# type: analysis  (alias: `analyze`)

| Field                       | Value                                                        |
|-----------------------------|--------------------------------------------------------------|
| Output filename             | `analysis.html` + `analysis.meta.json` (v2)                  |
| Manifest fields             | `analysisHtml`, `analysisGeneratedAt`, `metaHashes.analysis` |
| Hard upstream               | `product` (v2) — soft-block, allow `--skip-product`          |
| Soft upstream               | `_shared/context`, `_shared/glossary`, `_shared/decisions`   |
| Downstream                  | `design`                                                     |
| Agent team                  | PM, Architect, Writer                                        |
| Full workflow (legacy)      | `skills/_deprecated/plan-analyze/SKILL.md`                   |
| Mixins                      | `_grill-mixin`, `_caveman-mixin`, `_html-base`               |

## Scope

Problem statement + code-logic reading. WHY we're designing and WHAT the code does today. Both layers (PM outside-in, Architect inside-out) — neither alone is complete.

## meta.json schema (v2)

```jsonc
{
  "doc": "analysis",
  "scenario": "<slug>",
  "generatedAt": "<ISO>",
  "upstream": { "product": "product.html" },
  "currentState": {
    "productFlow": "...",
    "codeLogic": [{ "module": "...", "file": "path:line", "controlFlow": "...", "dataFlow": "..." }]
  },
  "problem":     "<one sentence>",
  "successCriterion": "<one sentence>",
  "painPoints":  [{ "id": "P1", "kind": "business|code", "summary": "...", "cite": "path:line" }],
  "rootCauses":  [{ "painPoint": "P1", "layer": "logic|abstraction|architecture|external|historical", "cause": "..." }],
  "hypotheses":  [{ "id": "H1", "claim": "...", "falsifiable": "If X is the cause, changing Y removes Z" }],
  "impactUrgency": { "affected": "...", "frequency": "...", "severity": "blocking|degrading|cosmetic", "deadline": "..." },
  "constraints": ["..."]
}
```

`hypotheses` follows `mattpocock/skills engineering/diagnose/SKILL.md` Phase 3 format: every claim falsifiable.

## Required sections

1. **Current state** — product flow + code logic per module (cite files+lines).
2. **Problem** — one sentence each: problem + success criterion.
3. **Pain points** — IDs `P1..Pn`. Mix business and code-level. Each cites file:line.
4. **Root causes** — every pain point ties to ≥1 cause at ≥1 layer.
5. **Ranked hypotheses** — falsifiable statements ordered by likelihood (diagnose Phase 3).
6. **Impact + urgency** — affected, frequency, severity, deadline.
7. **Constraints** — what the plan must/must-not touch.

No solutions in analysis — those belong in `design`.

## Phase B must-ask fields

1. `problem` — the one-sentence framing.
2. `successCriterion` — measurable.
3. `painPoints` — Architect proposes from code reading; user confirms scope.
4. `hypotheses` — Architect proposes ranked list with falsifiable form; user accepts/reorders.

## Render rules (Phase C)

- §1 Current state opens with control-flow diagram (mermaid or SVG).
- §2-3 Problem + criterion as callout.
- §4 Pain points as a table (id · kind · summary · cite).
- §5 Root causes as a 2-column table (pain point → cause).
- §6 Hypotheses as ranked list (`<ol>` with falsifiable subtext).
- §7 Impact as `<dl>`.
- Cite EVERY code finding with `path:line`. Vague prose is not analysis.

## Notes for /plan-gen

- Can still run without a scenario (just a repo path) → writes to `plans/.analysis/<repoName>-analysis.html` (v1 fallback).
- When `--cascade` (from `/plan-sync`), pass field allowlist to grill.
- When `product.meta.json` is missing in v2 mode, prompt: "no product doc — generate first? [Y/skip]".

## Task list

Seed TodoWrite at the start of `/plan-gen analysis`. Tick `in_progress` → `completed` as you go.

1. Phase A · read product.meta.json + _shared/context + glossary
2. Phase A · trace currentState.productFlow + codeLogic[] from repo
3. Phase A · draft problem + successCriterion (one sentence each)
4. Phase A · draft painPoints[] with file:line citations
5. Phase A · draft rootCauses[] mapping pain → layer
6. Phase A · draft ranked hypotheses[] in falsifiable form
7. Phase A · draft impactUrgency + constraints[]
8. Phase B · grill problem + successCriterion framing
9. Phase B · grill painPoints[] scope (kind + cite)
10. Phase B · grill hypotheses[] ranking + falsifiability
11. Phase C · render analysis.html (mermaid flow + tables)
12. Phase C · embed canonical meta script + lint pass + record manifest hash
