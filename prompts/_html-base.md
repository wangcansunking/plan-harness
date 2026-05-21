# `_html-base` — shared HTML conventions for all rendered docs

Used by Phase C renderer (`prompts/writer-prompt.md`). Every `<doc>.html` produced by `/plan-gen` follows this contract.

## File skeleton

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{Doc title} — {scenario}</title>
<script type="application/json" id="meta">
{ ...the canonical meta.json content, verbatim... }
</script>
<style>{inline CSS — GitHub Dark theme, see palette below}</style>
</head>
<body>
<header class="top">
  <h1>{Doc title} — {scenario}</h1>
  <span class="crumb">plan-harness/{scenario}/{doc}.html</span>
  <div class="links">
    <a href="/_shared/context/overview.html">📘 Context</a>
    <a href="/_shared/glossary/glossary.html">📖 Glossary</a>
    <a href="/_shared/decisions/index.html">📋 ADRs</a>
  </div>
</header>
<main>
<nav class="toc">
  <h3>📑 Documents</h3>
  <div class="docgroup">
    <a href="/{scenario}/product.html">product</a>
    <a href="/{scenario}/analysis.html">analysis</a>
    <a href="/{scenario}/design.html">design</a>
    <a href="/{scenario}/state-machine.html">state-machine</a>
    <a href="/{scenario}/test-spec.html">test-spec</a>
    <a href="/{scenario}/implementation.html">implementation</a>
    <a href="/{scenario}/test-report.html">test-report</a>
  </div>
  <div class="sep"></div>
  <h3>Sections</h3>
  <div class="sections">
    {one <a href="#id"> per <h2> in section}
  </div>
</nav>
<section>
  {body — h2/h3, tables, diagrams, callouts}
</section>
</main>
{optional: mermaid CDN script if doc uses <pre class="mermaid">}
</body>
</html>
```

## Palette (GitHub Dark, locked)

```css
:root {
  --bg: #0d1117;        /* page background */
  --panel: #161b22;     /* header, nav, table head */
  --panel2: #1c2128;    /* diagram bg, code bg, hover */
  --border: #30363d;
  --fg: #c9d1d9;
  --muted: #8b949e;
  --accent: #58a6ff;    /* links, h3, active nav */
  --green: #3fb950;     /* success, metrics */
  --amber: #d29922;     /* warn, in-progress */
  --red: #f85149;       /* defects, P0, out-of-scope */
  --purple: #bc8cff;    /* inline code */
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
```

Sibling docs (analysis.html, design.html, state-machine.html, test-spec.html, implementation.html, product.html) all use this palette verbatim. Don't introduce new variables; reuse existing ones.

## Layout (locked)

The page is **three zones**: `header.top` (flat strip), `nav.toc` (left rail), `section` (content). Header and sidebar share the same surface; content sits on `--bg` and centers in the viewport.

```css
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }

/* Header — single surface, no inner contrast steps. Crumb must be readable: use --fg, not --muted. */
header.top { padding: 14px 24px; background: var(--panel); border-bottom: 1px solid var(--border); display: flex; gap: 18px; align-items: baseline; }
header.top h1 { font-size: 16px; margin: 0; color: var(--fg); font-weight: 600; }
header.top .crumb { color: var(--fg); font-size: 13px; font-family: var(--mono); opacity: 0.85; }
header.top .links { margin-left: auto; display: flex; gap: 14px; font-size: 13px; }
header.top .links a { color: var(--accent); text-decoration: none; }

/* Main = grid: fixed-width rail + flex content. Header height is 51px; sticky offsets use it. */
main { display: grid; grid-template-columns: 240px 1fr; min-height: calc(100vh - 51px); }
nav.toc { background: var(--panel); border-right: 1px solid var(--border); padding: 18px 14px; position: sticky; top: 51px; align-self: start; max-height: calc(100vh - 51px); overflow-y: auto; }

/* Content — center via padding, NOT max-width. Reading width is enforced by horizontal padding that
   scales with the viewport; never let prose stretch edge-to-edge, and never leave a right-side void. */
section {
  padding: 32px clamp(24px, calc((100% - 960px) / 2), 96px);
  max-width: none;
}
section h2 { font-size: 20px; margin: 28px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
section h2:first-child { margin-top: 0; }
section h3 { font-size: 15px; margin: 18px 0 8px; color: var(--accent); }

@media (max-width: 900px) {
  main { grid-template-columns: 1fr; }
  nav.toc { position: static; max-height: none; }
  section { padding: 24px 20px; }
}
```

**Rules — do not deviate:**

1. **No `max-width` on `section`.** Use the `clamp()` padding pattern above. Content centers itself because padding grows as the viewport grows, never leaving a void.
2. **Breadcrumb color is `--fg` with `opacity: 0.85`** — NOT `--muted`. `--muted` on `--panel` fails contrast (4.5:1) and looks "broken" next to the title. Reserve `--muted` for de-emphasized inline metadata only.
3. **Header sits on `--panel`, content sits on `--bg`.** No second inner surface in the header. No box-shadows. The dividing line is the 1px `--border` between them.
4. **Sidebar matches header surface** (`--panel`). Header + sidebar form a single visual "chrome"; content is the focus area.
5. **Header height is locked at 51px** (14+14 padding + 16px line-height + 7px baseline). All sticky `top:` values reference this. Don't add taller headers without updating the offsets.

## Link rules

- **Root-absolute only.** `/{scenario}/{doc}.html` or `/_shared/{asset}/...`. Never `./` or `../`. Never `file://`.
- **Cross-doc nav** lives in `nav.toc .docgroup`. Active doc has `class="active"`.
- **Cross-section nav** (anchors `#id`) lives in `nav.toc` after the `.sep` divider.
- **Shared assets** (context / glossary / ADRs) appear ONLY in `header.top .links`, never in the section list.

## Meta `<script>` embed

- Tag exactly: `<script type="application/json" id="meta">`
- Content MUST equal `<doc>.meta.json` byte-for-byte (after canonicalisation).
- Re-embedded on every Phase C render. Never hand-edit the HTML and skip the meta.json — render step is the only writer.

### Phase C protocol — how to guarantee byte-equality

The writer is an LLM and will summarise/elide if asked to "embed the meta". Don't ask it to. The protocol is:

1. Phase C writes `<doc>.meta.json` to disk FIRST (the canonical bytes).
2. The writer's HTML template emits the literal placeholder string:
   ```
   <script type="application/json" id="meta">__META_JSON_PLACEHOLDER__</script>
   ```
   The writer must NOT inline the meta itself — only the placeholder.
3. Phase C reads `<doc>.meta.json` from disk and `replace()`s the placeholder with the file bytes verbatim (no JSON.parse / JSON.stringify round-trip — preserves whitespace and key order).
4. `html-lint`'s `L3-meta-embed` rule re-hashes both sides and fails closed on any drift.

Writers that ignore the placeholder convention and inline the meta will be caught by lint, but with a poorer error: "hash mismatch" instead of "placeholder not replaced". The placeholder is cheaper.

## Diagram / mermaid

- Inline SVG preferred for ≤300px width single-row flows.
- `<pre class="mermaid">{source}</pre>` for state machines and DAGs; CDN loader script appended once at end of `<body>`.
- Wrap every diagram in `<div class="diagram">` with `background: var(--panel2)`.

## Sidebar (K1 fix shape)

Two visually separated groups:

```
📑 Documents          <- h3
  product             <- .docgroup a (mono)
  analysis
  design (active)     <- class="active"
  …
[divider]             <- .sep
Sections              <- h3
  <div class="sections">  <- REQUIRED wrapper (lint scans `nav.toc .sections a[href^="#"]`)
    #overview         <- regular a
    #goals
    …
  </div>
```

Render rule: ALWAYS emit both groups (`.docgroup` + `.sections`), even on docs with only one section. Empty `.sections` is fine, but the wrapper `<div class="sections">` must be present.

## What renderer MUST NOT do

- Don't embed CSS via `<link rel="stylesheet">` — keep inline so doc is self-contained.
- Don't link to external JS except the mermaid CDN line at end of `<body>`.
- Don't write meta to a `data-*` attribute — always `<script type="application/json" id="meta">`.
- Don't introduce `.md` outputs — meta.json is the only sibling artifact.
