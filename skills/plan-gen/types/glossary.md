# type: glossary  (repo asset, not scenario doc)

<!-- adapted from mattpocock/skills engineering/grill-with-docs/CONTEXT-FORMAT.md -->

| Field                       | Value                                                          |
|-----------------------------|----------------------------------------------------------------|
| Output filename             | `_shared/glossary/glossary.html` + `glossary.meta.json`        |
| Manifest fields             | `sharedAssets.glossary.path`, `sharedAssets.glossary.hash`     |
| Hard upstream               | —                                                              |
| Downstream                  | every scenario doc (term-conflict checks during grill)         |
| Agent team                  | Architect (curator), Writer                                    |
| Mixins                      | `_grill-mixin`, `_caveman-mixin`, `_html-base`                 |

## Scope

Domain language ONLY. NOT a spec, NOT a scratch pad, NOT a place for implementation decisions. Just terms.

## meta.json schema

```jsonc
{
  "doc": "glossary",
  "contextName": "overview|<area>",
  "generatedAt": "<ISO>",
  "language": [
    {
      "term": "Order",
      "definition": "A request from a customer to receive goods.",
      "avoid": ["Purchase", "Transaction"]
    }
  ],
  "relationships": [
    "An **Order** produces one or more **Invoices**",
    "An **Invoice** belongs to exactly one **Customer**"
  ],
  "exampleDialogue": [
    { "speaker": "Dev", "line": "..." },
    { "speaker": "Domain expert", "line": "..." }
  ],
  "flaggedAmbiguities": [
    { "term": "account", "issue": "...", "resolution": "..." }
  ]
}
```

## Rules (enforced during Phase B)

1. **Be opinionated.** When multiple words exist for the same concept, pick the best one and list the others under `avoid`.
2. **Flag conflicts explicitly.** Ambiguous terms go into `flaggedAmbiguities` with a clear resolution.
3. **Keep definitions tight.** One sentence max. Define what it IS, not what it does.
4. **Show relationships.** Use bold term names + express cardinality where obvious.
5. **Only project-specific terms.** General programming concepts (timeout, error, util) don't belong.
6. **Example dialogue mandatory.** A dev/domain-expert conversation that demonstrates term boundaries.

## Phase B must-ask fields

1. `language` — for each new term: definition (one sentence), terms to avoid.
2. `flaggedAmbiguities` — overloaded terms the user has been using inconsistently.
3. `exampleDialogue` — one short dialogue per major term cluster.

## Render rules (Phase C)

- §1 Language as `<dl>` (term → definition · avoid).
- §2 Relationships as bullet list (acceptable here — 1 attribute per relationship).
- §3 Example dialogue as `<blockquote>` styled exchange.
- §4 Flagged ambiguities as a 3-column table (term, issue, resolution).

## Multi-context

If the repo is a monorepo (`_shared/context/src-<area>/` exists), one glossary per area is allowed, indexed by `_shared/glossary/index.html`.

## Notes for /plan-gen

- Updated lazily — during any scenario grill that surfaces a new term, glossary gets the entry inline.
- Glossary hash bump triggers ⚠ on scenario dashboards but does NOT auto-cascade.

## Task list

Seed TodoWrite at the start of `/plan-gen glossary`. Tick `in_progress` → `completed` as you go.

1. Phase A · read repo docs + READMEs to extract candidate terms
2. Phase A · draft language[] entries (term + one-sentence definition + avoid[])
3. Phase A · draft relationships[] (bold term cardinality)
4. Phase A · draft exampleDialogue (dev ↔ domain expert)
5. Phase A · draft flaggedAmbiguities[]
6. Phase B · grill language[] (definitions tight, avoid[] opinionated)
7. Phase B · grill flaggedAmbiguities[] resolutions
8. Phase B · validate dialogue demonstrates term boundaries
9. Phase C · render _shared/glossary/glossary.html
10. Phase C · embed canonical meta script + lint pass (skip scenario-doc rules) + record sharedAssets.glossary.hash
