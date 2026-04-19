# Changelog

All notable changes to `plan-harness` are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- **MAJOR** — incompatible API / on-disk format changes (MCP tool removal, JSONL event-shape breaks, skill-input contract changes).
- **MINOR** — backwards-compatible additions (new MCP tools, new skills, new UI widgets, new optional fields).
- **PATCH** — backwards-compatible fixes (regressions, rendering bugs, doc errata).

Version fields in `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `local-proxy/package.json` are kept in lockstep.

---

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
