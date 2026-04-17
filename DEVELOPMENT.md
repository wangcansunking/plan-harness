# Developing plan-harness

For plugin maintainers. End users do not read this — the plugin ships prebuilt and self-contained.

> **Dogfooding note.** This is a plugin that can plan its own development.
> The code you edit in the repo is **not** the code Claude Code runs —
> it runs from a per-user cache. Read [The dev loop](#the-dev-loop)
> before you make changes.

---

## Where the code runs vs where you edit

```
Working copy (you edit here):
  <repo>/plan-harness/
     └─ local-proxy/src/*.js    ← edits don't take effect until synced + restart

Plugin cache (Claude Code runs from here):
  ~/.claude/plugins/cache/canwa-claude-plugins/plan-harness/<version>/
     └─ local-proxy/dist/index.js   ← the MCP server actually loaded
```

The cache path resolves identically on Windows (`%USERPROFILE%\.claude\...`), macOS, and Linux via Node's `os.homedir()`.

## The dev loop

```
1. Edit   local-proxy/src/*.js        (or skills/, prompts/, templates)
2. Run    npm run dev                  (builds dist + syncs to cache)
3. Restart Claude Code                 (stdio MCP server loads bundle at startup only)
4. Invoke the changed feature and verify
```

`npm run dev` is `build` + `sync`:
- **build** — esbuild produces `dist/index.js` from `src/`
- **sync** — copies `dist/`, `start.js`, `src/`, `skills/`, `prompts/`, `contexts/`, `docs/`, `.claude-plugin/`, `README.md`, `ROADMAP.md`, `DEVELOPMENT.md` into the cache

Run from `plan-harness/local-proxy/`.

## Scripts

| Command | What it does |
|---|---|
| `npm run build` | esbuild src → `dist/index.js`. **No sync.** |
| `npm run sync`  | Copy working-copy outputs into the Claude Code plugin cache. **No build.** |
| `npm run dev`   | `build` then `sync`. Most common. |
| `npm run prepare-release` | `npm install` + `build`. For pre-commit/release tidy. |

## Skill/prompt edits

Editing `skills/<name>/SKILL.md` or `prompts/*.md` does **not** need a build — they're plain markdown. But they still need a **sync**:

```
npm run sync && restart Claude Code
```

A pure `sync` run (no build) is fast.

## Advanced: symlink the cache to your working copy

If you want zero-copy — edits to source instantly live in the cache — replace the cached plugin folder with a symlink. You still need `npm run build` (because `start.js` loads `dist/index.js`, not `src/`), but you skip the copy step.

**macOS / Linux:**
```bash
VER=$(node -p "require('./plan-harness/.claude-plugin/plugin.json').version")
CACHE=~/.claude/plugins/cache/canwa-claude-plugins/plan-harness/$VER
rm -rf "$CACHE"
ln -s "$(pwd)/plan-harness" "$CACHE"
```

**Windows** (requires Developer Mode or admin):
```powershell
$ver = (Get-Content plan-harness\.claude-plugin\plugin.json | ConvertFrom-Json).version
$cache = "$env:USERPROFILE\.claude\plugins\cache\canwa-claude-plugins\plan-harness\$ver"
Remove-Item -Recurse -Force $cache
New-Item -ItemType SymbolicLink -Path $cache -Target "$(Resolve-Path .\plan-harness)"
```

After a symlink, `npm run build` from `local-proxy/` regenerates `dist/` in-place and Claude Code picks it up on the next restart.

## Testing before commit

1. `npm run dev`
2. Restart Claude Code
3. Exercise the change — e.g., create a scenario, open the dashboard, run `plan_share`
4. Run the auth smoke test if auth was touched:
   ```bash
   node cc-history/2026-04-17-plan-harness-auth-overhaul/smoke-auth.mjs
   ```
5. Commit source changes **together with** the updated `dist/index.js`. CI doesn't exist yet; the invariant "dist matches src" is enforced by reviewers.

## Using plan-harness to plan plan-harness

Yes — this plugin can plan its own features. Two things to remember:

1. **Skills run from cache.** If you edit a SKILL.md or agent prompt and want your *next* plan generation to use the new version, `npm run dev` and restart first.
2. **Plans land in this repo.** Generated plan docs go to `<repo>/plans/<scenario>/`. Decide per-scenario whether to commit them:
   - Durable design records → commit (they're valuable history for contributors)
   - Short-lived exploration → add to `.gitignore` or delete after landing

## Releasing a version bump

1. Bump `.claude-plugin/plugin.json` `version`
2. Bump `local-proxy/package.json` `version`
3. `npm run build` (dist must match source in the commit)
4. Commit both source and `dist/index.js`
5. Users upgrade via `claude plugins update plan-harness`

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Edited `src/index.js`, MCP behaviour unchanged | Didn't rebuild or didn't restart CC | `npm run dev` → restart |
| "Pre-built bundle is missing at dist/index.js" | `dist/` out of sync or absent | `npm run build` |
| Skill shows old description in `/plan-*` | Cache has stale `skills/` | `npm run sync` → restart |
| `sync` fails with "cache not found" | Plugin not installed yet | `claude plugins install plan-harness` once |
| Edits in one window, invoking in another CC window — no change | Both windows cached the old MCP server | Restart **all** Claude Code windows |
| `plan_create_scenario` writes to wrong repo | Omitted `repoRoot` arg | Always pass absolute path |

## Layout reference

```
plan-harness/
├── .claude-plugin/
│   ├── plugin.json                 — name, version, author
│   └── marketplace.json            — plugin-level marketplace entry
├── .mcp.json                       — wires start.js as the MCP server
├── DEVELOPMENT.md                  — this file
├── README.md                       — public-facing
├── ROADMAP.md                      — product direction + code debt
├── contexts/                       — shipped context templates
├── docs/
├── prompts/                        — agent role prompts (architect/PM/tester/…)
├── skills/
│   ├── plan-init/SKILL.md
│   ├── plan-design/SKILL.md
│   └── …                           — 11 skills currently
└── local-proxy/
    ├── package.json                — devDeps + scripts
    ├── start.js                    — launcher; imports dist/
    ├── dist/
    │   └── index.js                — built MCP server (committed)
    ├── src/
    │   ├── index.js                — MCP tool registrations
    │   ├── auth.js                 — session auth for shared dashboard
    │   ├── plan-manager.js         — scenario CRUD
    │   ├── web-server.js           — local HTTP dashboard
    │   └── templates/base.js       — self-contained HTML templates
    └── scripts/
        └── sync-to-cache.mjs       — dev-time cache sync
```
