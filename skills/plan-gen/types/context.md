# type: context  (repo asset, not scenario doc)

| Field                       | Value                                                        |
|-----------------------------|--------------------------------------------------------------|
| Output filename             | `_shared/context/overview.html` + `overview.meta.json`       |
| Manifest fields             | `sharedAssets.context.path`, `sharedAssets.context.hash`     |
| Hard upstream               | — (root)                                                     |
| Downstream                  | every scenario doc (header link)                             |
| Agent team                  | Architect (lead), Writer                                     |
| Scope                       | Repo-wide, scenario-agnostic                                 |
| Mixins                      | `_grill-mixin`, `_caveman-mixin`, `_html-base`               |

## Scope

Current code architecture: control flow, data flow, module map, key files. Updated when the codebase shape changes, NOT per-scenario. Monorepo? Multiple context docs under `_shared/context/src-<area>/`.

## meta.json schema

```jsonc
{
  "doc": "context",
  "scope": "overview|src-<area>",
  "generatedAt": "<ISO>",
  "modules":     [{ "name": "...", "path": "...", "responsibility": "..." }],
  "controlFlow": "<mermaid source>",
  "dataFlow":    "<mermaid source>",
  "keyFiles":    [{ "path": "...", "why": "..." }],
  "entrypoints": [{ "name": "...", "path": "...", "kind": "cli|http|mcp|hook" }],
  "externalDeps": [{ "name": "...", "version": "...", "usedFor": "..." }]
}
```

## Phase B must-ask fields

1. `modules` — confirm boundaries (Architect grep the code, propose, user confirms).
2. `entrypoints` — confirm there's one per "way users invoke the system".
3. `keyFiles` — top-10 files anyone touching this scenario must read first.

Do **not** ask for: anything covered in `_shared/glossary` (those are terms, not modules).

## Render rules (Phase C)

- §1 Modules as a table.
- §2 Control-flow diagram (mermaid or SVG).
- §3 Data-flow diagram.
- §4 Key files as a `<dl>` (path → why).
- §5 Entrypoints as a table.
- §6 External deps as a table.

## Monorepo

If `_shared/context/src-<area>/` directories exist, the top-level `overview` is an index linking to each area's `<area>.html`. Each area follows the same schema with `"scope": "src-<area>"`.

## Notes for /plan-gen

- Triggered by `/plan-gen context` explicitly OR auto-suggested by `/plan-init` on first run when no `_shared/context/` exists.
- Stale check: if `sharedAssets.context.hash` differs from current, scenario dashboards show ⚠ "Context updated since plan was generated". Does NOT auto-cascade.

## Task list

Seed TodoWrite at the start of `/plan-gen context`. Tick `in_progress` → `completed` as you go.

1. Phase A · scan repo root (build files, top-level dirs, package manifests)
2. Phase A · draft modules[] from grep + dependency reading
3. Phase A · draft controlFlow + dataFlow mermaid
4. Phase A · draft keyFiles[] (top-10 files anyone must read first)
5. Phase A · draft entrypoints[] + externalDeps[]
6. Phase B · grill modules[] boundaries
7. Phase B · grill entrypoints[] (one per invocation surface)
8. Phase B · grill keyFiles[] top-10 selection
9. Phase C · render _shared/context/overview.html
10. Phase C · embed canonical meta script + lint pass (with `--skipRules L1-docgroup,L1-active` for shared assets) + record sharedAssets.context.hash
