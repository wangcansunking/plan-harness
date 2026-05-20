# HTML lint fixtures

These are inputs for `local-proxy/__tests__/html-lint.test.mjs`. They cover the v2 doc-structure contract owned by `prompts/_html-base.md` + enforced by `local-proxy/src/html-lint.js`.

| File | Should the lint pass? | Why it's here |
|---|---|---|
| `valid-minimal.html` | yes | A minimum-shape v2 doc that satisfies every rule — used as the floor of "what counts as compliant." |
| `invalid-maxwidth.html` | no (`L2-no-maxwidth-section`) | Section has `max-width` instead of the clamp() pattern. |
| `invalid-crumb-muted.html` | no (`L2-crumb-color`) | `.crumb` colour is `var(--muted)` instead of `var(--fg)`. |
| `invalid-no-toc.html` | no (`L1-nav` × n) | Missing `<nav class="toc">` entirely. |
| `invalid-relative-link.html` | no (`L3-links`) | Cross-doc link uses `./design.html` instead of root-absolute. |

If you add new lint rules to `html-lint.js`, drop a matching fixture + a test case here.
