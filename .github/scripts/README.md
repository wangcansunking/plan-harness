# Release automation

## `auto-bump.yml`

Triggered on every merged PR. Does nothing unless the PR carries exactly one of:

| Label            | Bump  |
|------------------|-------|
| `release:patch`  | 1.2.0 → 1.2.1 |
| `release:minor`  | 1.2.0 → 1.3.0 |
| `release:major`  | 1.2.0 → 2.0.0 |

Multiple `release:*` labels → workflow fails (ambiguous); no label → workflow no-ops.

### What gets bumped locally

- `.claude-plugin/plugin.json` top-level `version`
- `.claude-plugin/marketplace.json` → `plugins[name===plan-harness].version` (the plugin-local marketplace manifest ships alongside the plugin)
- Every tracked `package.json` (currently `local-proxy/package.json`), excluding `node_modules`

### CHANGELOG

Preferred: include a `## Changelog` section in the PR body. Everything under it up to the next `## ` (or EOF) is pasted verbatim into CHANGELOG.md under the new version block.

```markdown
(any PR body…)

## Changelog

### Added
- /plan-gen: new `--scenario` flag

### Fixed
- Dashboard breadcrumb example string
```

Fallback when no `## Changelog` section is present: one bullet under a section mapped from the label (patch→Fixed, minor→Added, major→Breaking Changes) with the PR title as the line.

Both paths end with a `([#N](url))` reference linking back to the source PR.

### Companion marketplace PR

After the local bump, if the repo has a `GH_PAT_MARKETPLACE` secret, `bump-marketplace.mjs` clones `wangcansunking/can-claude-plugins`, updates plan-harness's entry in its `marketplace.json` + README table row, and opens a PR mirroring the bump. Without the secret this step silently skips.

#### Setting up `GH_PAT_MARKETPLACE`

1. github.com → your profile → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
2. Repository access: only `wangcansunking/can-claude-plugins`
3. Permissions: **Contents** `read+write`, **Pull requests** `read+write`
4. In this repo: **Settings** → **Secrets and variables** → **Actions** → **New repository secret** → name `GH_PAT_MARKETPLACE`, value the token.

## Files

- `.github/workflows/auto-bump.yml` — the workflow
- `.github/scripts/bump-version.mjs` — local version + CHANGELOG patcher
- `.github/scripts/bump-marketplace.mjs` — cross-repo companion PR
