# Changelog

All notable changes to `plan-harness` are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- **MAJOR** — incompatible API / on-disk format changes (MCP tool removal, JSONL event-shape breaks, skill-input contract changes).
- **MINOR** — backwards-compatible additions (new MCP tools, new skills, new UI widgets, new optional fields).
- **PATCH** — backwards-compatible fixes (regressions, rendering bugs, doc errata).

Version fields in `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `local-proxy/package.json` are kept in lockstep.

---






## [1.4.1] — 2026-04-30

### Changed
Aggregated from commits since v1.4.0 (no `release:*` label was applied):

- feat(prompts): architecture-diagram structural style guide for design.html SVGs (#11)

([#scheduled](https://github.com/wangcansunking/plan-harness/actions/runs/25175555266))

## [1.4.0] — 2026-04-20

### Added
- **MCP tool \`plan_restart\`** (optional \`reason\` string) — exits the server cleanly for Claude Code to respawn with the latest plugin bundle.
- **Skill \`/plan-restart\`** — user-facing entry point; guidance on post-update bounce, dev loop, stale-bundle symptoms.
- **Staleness watcher** in \`src/index.js\` — auto-exits on bundle mtime drift or newer-semver sibling; env-tunable polling.
- Startup log line \`[plan-harness] bundle=<path> version=<v> watcher=<ms>\` so operators can confirm which version is actually running.

### Changed
- Counts across READMEs + overview.html: 10 → 11 skills, 12 → 13 MCP tools.
- Skills SVG: new "ORCHESTRATE & MAINTAIN" row holds \`/plan-full\` + \`/plan-restart\`.
- MCP Server SVG: 13th tool row ("restart (exit for respawn)").
- \`docs/screenshots/01-overview-hero.png\` + \`02-plugin-architecture.png\` regenerated via Playwright MCP.

([#10](https://github.com/wangcansunking/plan-harness/pull/10))

## [1.3.2] — 2026-04-20

### Fixed
- **Auto-bump companion PR body rendered malformed.** The cross-repo bump script used `JSON.stringify` + shell-interpolated `--body`, which (a) let bash command-substitute any backticks in the text and (b) never translated `\n`. Script now writes the body to a tempfile and passes it via `--body-file` with `execFileSync` (no shell, no escaping surprises). Port of the same fix in `claude-config-manager#11`.

([#7](https://github.com/wangcansunking/plan-harness/pull/7))

## [1.3.1] — 2026-04-20

### Changed
- `analysis.html` §1 Current state now has two layers: product/flow (PM) and code logic (Architect — control flow, data flow, cited by file+line).
- §3 Observed pain points explicitly mixes business-level pain (latency, complaints, abandonment) with code-level findings (race conditions, silent failures, N+1, dead paths, duplicated logic). Code findings must cite file+line — vague prose ("the sync layer has issues") is no longer a valid finding.
- §4 Root causes must declare which layer the cause lives at: `logic / abstraction / architecture / external / historical`.
- `/plan-full` Phase 2 Architect prompt rewritten: read the actual code paths, surface specific bugs, map each finding to a root-cause layer.
- Dashboard + scenario-detail card blurb for analysis updated to reflect the hybrid scope.

### Fixed
- `_deprecated/plan-analyze/SKILL.md` banner adjusted — the codebase-walk instructions inside are once again directly useful (as raw material for §1/§3/§4).
- `contexts/feature-planning.md` chart types include `code-flow-svg` and `pain-point-table` with file/line.

([#6](https://github.com/wangcansunking/plan-harness/pull/6))

## [1.3.0] — 2026-04-20

### Changed
- Dashboard scenario cards now render pills for all 7 canonical doc types (analysis + test-report added, names unified to `state-machine` / `implementation-plan`).
- Scenario detail page (`PLAN_DEFS`) now lists `Analysis` at the top in canonical workflow order.
- `/plan-gen analysis` scope redefined: produces a problem-statement doc with §1 current state, §2 problem to solve, §3 observed pain points, §4 root causes, §5 impact + urgency, §6 optional constraints. Agent team is PM + Architect + Writer.
- `/plan-full` Phase 2 (Analysis) is now a decision checkpoint — user reviews the problem framing before design starts.

### Fixed
- `local-proxy/src/web-server.js` `groupFlatFilesIntoScenarios` used `['design', 'test-plan', 'state-machines', 'test-cases', 'impl-plan']` — missing analysis + test-report and using old names — so flat-layout plans/ dirs showed every doc as missing. Now fixed.
- `local-proxy/src/templates/base.js` dashboard `planTypes` and detail `PLAN_DEFS` aligned with the canonical workflow order.
- `local-proxy/dist/index.js` rebuilt from sources.

### Deprecated
- `skills/_deprecated/plan-analyze/SKILL.md` still shipped as reference but carries a SCOPE CHANGED banner; its codebase-walk instructions now serve only §1 and §4 of the new analysis template.

([#5](https://github.com/wangcansunking/plan-harness/pull/5))

## [1.2.0] — 2026-04-19

### Added
- **@-mention queue** for agent personas. Reviewers can type `@architect`, `@pm`, `@tester`, `@frontend`, `@backend`, or `@writer` in a comment body; the manager stamps `mentionedPersonas` onto the event so the mention can be drained later.
- **`plan_list_pending_mentions`** MCP tool — returns every live mention without a matching persona reply, FIFO by `createdAt`.
- **`plan_post_persona_reply`** MCP tool — posts a reply tagged with `personaRole=<persona>`. Rejected if the parent didn't actually mention that persona.
- **`/plan-review` Step 5 — Reply to Open Comment Threads**: after section-by-section review, the skill drains pending @-mentions and posts persona replies to threads on sections that closed `NEEDS_CHANGES` / `BLOCKED`.

### Changed
- **Comments panel resolved toggle**: resolved threads now fold out of the sidebar by default (Word / Google Docs model). A "Show/Hide resolved (N)" pill at the top of the panel body restores them; preference persists per (scenario, doc).
- Comments panel header count now tracks **unresolved threads only** so it matches the scenario-card badge and the author's "what still needs attention" mental model.
- ROADMAP.md open questions around comment UI are now documented as resolved decisions.

### Internal
- Smoke test grows 9 new assertions covering mention regex edge cases, fulfillment logic, and the drive-by-persona rejection.
- `comment-manager.js` gains `PERSONA_NAMES`, `extractMentions`, `listPendingMentions`, `postPersonaReply`; `collapse()` preserves `mentionedPersonas` and `personaRole`.

---

## [1.1.0] — earlier

Unified plan generators under `/plan-gen` (design / state-machine / test-plan / test-cases / implementation / test-report / analysis); added `/plan-sync` cascade orchestrator and `/plan-test-report` interactive fix-loop; server-side lightbox + `/asset` route for evidence screenshots; Phase 1–11 of the built-in comment UI (stable section IDs, CRUD + SSE, selection composer, `<mark>` highlights, orphan group, revise dispatcher, proposal modal, re-anchor cascade, XSS sweep). Full history: `git log v1.1.0`.
