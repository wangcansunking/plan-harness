// html-lint.test.mjs — unit tests for html-lint.js rule coverage.
//
// Inputs are inline HTML strings rather than fixture files because:
//   (a) the lint logic does not care about file paths,
//   (b) keeping the assertion + input in one place makes failures easy to trace.
//
// Run via `npm test` (chained from local-proxy/package.json) or directly:
//   node __tests__/html-lint.test.mjs

import { strict as assert } from 'node:assert';
import { lintHtml, fixHtml } from '../src/html-lint.js';

let passed = 0;
let failed = 0;
const failures = [];

function it(name, fn) {
  try {
    fn();
    passed += 1;
    process.stdout.write(`  \x1b[32m✓\x1b[0m ${name}\n`);
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
    process.stdout.write(`  \x1b[31m✗\x1b[0m ${name}\n    ${err.message}\n`);
  }
}

const VALID = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Design — demo</title>
<script type="application/json" id="meta">{"doc":"design","schemaVersion":2}</script>
<style>
:root {
  --bg: #0d1117;
  --panel: #161b22;
  --panel2: #1c2128;
  --border: #30363d;
  --fg: #c9d1d9;
  --muted: #8b949e;
  --accent: #58a6ff;
}
header.top .crumb { color: var(--fg); opacity: 0.85; }
section { padding: 32px clamp(24px, calc((100% - 960px) / 2), 96px); max-width: none; }
</style>
</head>
<body>
<header class="top">
  <h1>Design — demo</h1>
  <span class="crumb">plan-harness/demo/design.html</span>
  <div class="links">
    <a href="/_shared/context/overview.html">Context</a>
    <a href="/_shared/glossary/glossary.html">Glossary</a>
    <a href="/_shared/decisions/index.html">ADRs</a>
  </div>
</header>
<main>
<nav class="toc">
  <h3>Documents</h3>
  <div class="docgroup">
    <a href="/demo/product.html">product</a>
    <a href="/demo/analysis.html">analysis</a>
    <a href="/demo/design.html" class="active">design</a>
    <a href="/demo/state-machine.html">state-machine</a>
    <a href="/demo/test-spec.html">test-spec</a>
    <a href="/demo/implementation.html">implementation</a>
    <a href="/demo/test-report.html">test-report</a>
  </div>
  <div class="sep"></div>
  <h3>Sections</h3>
  <div class="sections">
    <a href="#overview">Overview</a>
  </div>
</nav>
<section>
<h2 id="overview">Overview</h2>
<div class="diagram"><svg aria-label="UI mockup screen">mockup</svg></div>
<div class="diagram"><svg aria-label="user-flow workflow">user flow</svg></div>
</section>
</main>
</body>
</html>`;

it('VALID fixture passes all rules', () => {
  const r = lintHtml(VALID, { docName: 'design' });
  assert.equal(r.errors.length, 0, `Unexpected errors:\n${r.errors.map(e => `  - ${e.rule}: ${e.message}`).join('\n')}`);
});

it('L1-nav flags missing .sections wrapper', () => {
  const bad = VALID.replace(/<div class="sections">[\s\S]*?<\/div>/, '<a href="#overview">Overview</a>');
  const r = lintHtml(bad, { docName: 'design' });
  assert.ok(r.errors.some(e => e.rule === 'L1-nav' && e.message.includes('.sections')),
    'expected L1-nav error when .sections wrapper missing');
});

it('L3-ux-visuals flags design with no mockup visual', () => {
  const bad = VALID.replace(/<svg aria-label="UI mockup screen">mockup<\/svg>/, '');
  const r = lintHtml(bad, { docName: 'design' });
  assert.ok(r.errors.some(e => e.rule === 'L3-ux-visuals' && e.message.includes('mockup')),
    'expected L3-ux-visuals error when no mockup visual');
});

it('L3-ux-visuals flags design with no user-flow visual', () => {
  const bad = VALID.replace(/<svg aria-label="user-flow workflow">user flow<\/svg>/, '');
  const r = lintHtml(bad, { docName: 'design' });
  assert.ok(r.errors.some(e => e.rule === 'L3-ux-visuals' && e.message.includes('flow')),
    'expected L3-ux-visuals error when no user-flow visual');
});

it('L3-product-mockups flags product doc with no mockup', () => {
  const bare = VALID
    .replace(/<svg aria-label="UI mockup screen">mockup<\/svg>/, '')
    .replace(/<svg aria-label="user-flow workflow">user flow<\/svg>/, '');
  const r = lintHtml(bare, { docName: 'product', metaJson: { doc: 'product', schemaVersion: 2, userStories: [{ id: 'US1' }] } });
  assert.ok(r.errors.some(e => e.rule === 'L3-product-mockups'),
    'expected L3-product-mockups error when product doc has no mockup');
});

it('L3-product-mockups flags story-mockup count mismatch', () => {
  const r = lintHtml(VALID, { docName: 'product', metaJson: { doc: 'product', schemaVersion: 2, userStories: [{ id: 'US1' }, { id: 'US2' }, { id: 'US3' }] } });
  assert.ok(r.errors.some(e => e.rule === 'L3-product-mockups' && e.message.includes('every story')),
    'expected L3-product-mockups count-mismatch error');
});

it('L3-section-nav does NOT flag h3 sub-headings', () => {
  const withH3 = VALID.replace('<h2 id="overview">Overview</h2>', '<h2 id="overview">Overview</h2>\n<h3>Sub-point one</h3>\n<h3>Sub-point two</h3>');
  const r = lintHtml(withH3, { docName: 'design' });
  assert.ok(!r.errors.some(e => e.rule === 'L3-section-nav'),
    'L3-section-nav should ignore h3 sub-headings (only h2 needs nav entries)');
});

it('L2-no-maxwidth-section flags max-width:1100px on section', () => {
  const bad = VALID.replace('max-width: none', 'max-width: 1100px');
  const r = lintHtml(bad, { docName: 'design' });
  assert.ok(r.errors.some(e => e.rule === 'L2-no-maxwidth-section'),
    'expected L2-no-maxwidth-section error');
});

it('L2-crumb-color flags var(--muted) crumb', () => {
  const bad = VALID.replace('.crumb { color: var(--fg)', '.crumb { color: var(--muted)');
  const r = lintHtml(bad, { docName: 'design' });
  assert.ok(r.errors.some(e => e.rule === 'L2-crumb-color'),
    'expected L2-crumb-color error');
});

it('L1-nav flags missing nav.toc', () => {
  const bad = VALID.replace(/<nav class="toc">[\s\S]*?<\/nav>/, '');
  const r = lintHtml(bad, { docName: 'design' });
  assert.ok(r.errors.some(e => e.rule === 'L1-nav'),
    'expected L1-nav error when nav.toc removed');
});

it('L3-links flags relative href ./other.html', () => {
  const bad = VALID.replace('href="/demo/analysis.html"', 'href="./analysis.html"');
  const r = lintHtml(bad, { docName: 'design' });
  assert.ok(r.errors.some(e => e.rule === 'L3-links'),
    'expected L3-links error for relative href');
});

it('L3-shared-link flags <3 links in header.top .links', () => {
  const bad = VALID.replace(
    /<div class="links">[\s\S]*?<\/div>/,
    '<div class="links"><a href="/_shared/glossary/glossary.html">Glossary</a></div>'
  );
  const r = lintHtml(bad, { docName: 'design' });
  assert.ok(r.errors.some(e => e.rule === 'L3-shared-link'),
    'expected L3-shared-link error for wrong link count');
});

it('L1-docgroup flags missing scenario doc in sidebar', () => {
  const bad = VALID.replace('<a href="/demo/test-spec.html">test-spec</a>', '');
  const r = lintHtml(bad, { docName: 'design' });
  assert.ok(r.errors.some(e => e.rule === 'L1-docgroup' && e.message.includes('test-spec')),
    'expected L1-docgroup error mentioning test-spec');
});

it('L3-meta-embed catches hash mismatch when external meta differs', () => {
  const r = lintHtml(VALID, { docName: 'design', metaJson: { doc: 'design', schemaVersion: 2, extra: 'changed' } });
  assert.ok(r.errors.some(e => e.rule === 'L3-meta-embed' && e.message.includes('hash mismatch')),
    'expected L3-meta-embed hash mismatch');
});

it('L3-meta-embed accepts matching external meta', () => {
  const r = lintHtml(VALID, { docName: 'design', metaJson: { doc: 'design', schemaVersion: 2 } });
  assert.ok(!r.errors.some(e => e.rule === 'L3-meta-embed'),
    'expected no L3-meta-embed errors when hashes match');
});

it('L1-active flags missing class="active" link', () => {
  const bad = VALID.replace(' class="active"', '');
  const r = lintHtml(bad, { docName: 'design' });
  assert.ok(r.errors.some(e => e.rule === 'L1-active'),
    'expected L1-active error when no active link present');
});

// ---- Auto-fix ---------------------------------------------------------------

it('fixHtml: returns no-op on a clean VALID fixture', () => {
  const r = fixHtml(VALID, { docName: 'design', metaJson: { doc: 'design', schemaVersion: 2 } });
  assert.equal(r.html, VALID, 'clean input must not be mutated');
  assert.equal(r.fixed.length, 0);
  assert.equal(r.unfixed.length, 0);
});

it('fixHtml: restores missing class="active" on the current doc nav link', () => {
  const bad = VALID.replace(' class="active"', '');
  const r = fixHtml(bad, { docName: 'design', metaJson: { doc: 'design', schemaVersion: 2 } });
  assert.ok(r.fixed.some(f => f.includes('active')), 'expected an "active" fix description');
  assert.ok(/<a\b[^>]+\/demo\/design\.html[^>]*class="[^"]*active[^"]*"/.test(r.html),
    'design nav link should now carry class="active"');
  assert.equal(r.unfixed.filter(e => e.rule === 'L1-active').length, 0,
    'L1-active should be resolved after fix');
});

it('fixHtml: wraps stray section links in <div class="sections">', () => {
  const bad = VALID.replace(
    /<div class="sections">[\s\S]*?<\/div>/,
    '<a href="#overview">Overview</a>\n  <a href="#details">Details</a>',
  );
  const r = fixHtml(bad, { docName: 'design', metaJson: { doc: 'design', schemaVersion: 2 } });
  assert.ok(r.fixed.some(f => f.includes('sections')), 'expected a sections wrapper fix');
  assert.ok(/<div class="sections">[\s\S]*<a href="#overview">/.test(r.html),
    'section links should now sit inside .sections wrapper');
  assert.equal(r.unfixed.filter(e => e.rule === 'L1-nav' && e.message.includes('.sections')).length, 0);
});

it('fixHtml: restores GitHub-Dark palette when drifted', () => {
  const bad = VALID.replace('--bg: #0d1117;', '--bg: #ffffff;');
  const r = fixHtml(bad, { docName: 'design', metaJson: { doc: 'design', schemaVersion: 2 } });
  assert.ok(r.fixed.some(f => f.includes('palette')), 'expected palette restore');
  assert.ok(r.html.includes('--bg: #0d1117'), '--bg must be restored to locked value');
});

it('fixHtml: strips max-width on <section>', () => {
  const bad = VALID.replace('max-width: none', 'max-width: 1100px');
  const r = fixHtml(bad, { docName: 'design', metaJson: { doc: 'design', schemaVersion: 2 } });
  assert.ok(r.fixed.some(f => f.includes('max-width')), 'expected max-width strip');
  assert.equal(r.unfixed.filter(e => e.rule === 'L2-no-maxwidth-section').length, 0);
});

it('fixHtml: swaps .crumb color from var(--muted) to var(--fg)', () => {
  const bad = VALID.replace('.crumb { color: var(--fg)', '.crumb { color: var(--muted)');
  const r = fixHtml(bad, { docName: 'design', metaJson: { doc: 'design', schemaVersion: 2 } });
  assert.ok(r.fixed.some(f => f.includes('crumb')), 'expected .crumb color fix');
  assert.equal(r.unfixed.filter(e => e.rule === 'L2-crumb-color').length, 0);
});

it('fixHtml: re-injects the 3 canonical shared-asset links when count is wrong', () => {
  const bad = VALID.replace(
    /<div class="links">[\s\S]*?<\/div>/,
    '<div class="links"><a href="/_shared/glossary/glossary.html">Glossary</a></div>',
  );
  const r = fixHtml(bad, { docName: 'design', metaJson: { doc: 'design', schemaVersion: 2 } });
  assert.ok(r.fixed.some(f => f.includes('shared-asset')), 'expected shared-link fix');
  assert.ok((r.html.match(/<header\b[\s\S]*?<\/header>/i)[0].match(/<a\b/g) || []).length >= 3,
    'header should now carry at least 3 shared-asset links');
  assert.equal(r.unfixed.filter(e => e.rule === 'L3-shared-link').length, 0);
});

it('fixHtml: re-embeds canonical meta bytes when external meta differs', () => {
  const meta = { doc: 'design', schemaVersion: 2, extra: 'new' };
  const r = fixHtml(VALID, { docName: 'design', metaJson: meta });
  assert.ok(r.fixed.some(f => f.includes('meta.json')), 'expected meta re-embed fix');
  assert.equal(r.unfixed.filter(e => e.rule === 'L3-meta-embed').length, 0);
});

it('L3-prefer-svg warns when a doc has Mermaid but no inline SVG', () => {
  const bad = VALID
    .replace(/<svg aria-label="UI mockup screen">mockup<\/svg>/, '<pre class="mermaid">flowchart LR; A-->B</pre>')
    .replace(/<svg aria-label="user-flow workflow">user flow<\/svg>/, '<pre class="mermaid">sequenceDiagram; A->>B: x</pre>');
  const r = lintHtml(bad, { docName: 'design' });
  assert.ok(r.warnings.some(w => w.rule === 'L3-prefer-svg'),
    'expected L3-prefer-svg warning when only Mermaid is present');
});

it('L3-prefer-svg does NOT fire when all diagrams are SVG', () => {
  const r = lintHtml(VALID, { docName: 'design' });
  assert.ok(!r.warnings.some(w => w.rule === 'L3-prefer-svg'),
    'L3-prefer-svg must NOT fire on an SVG-only doc');
});

it('L3-prefer-svg warns when Mermaid outnumbers SVG (mixed)', () => {
  const mixed = VALID.replace(
    /<svg aria-label="user-flow workflow">user flow<\/svg>/,
    '<pre class="mermaid">A</pre>\n<pre class="mermaid">B</pre>',
  );
  const r = lintHtml(mixed, { docName: 'design' });
  assert.ok(r.warnings.some(w => w.rule === 'L3-prefer-svg' && /more Mermaid/.test(w.message)),
    'expected L3-prefer-svg warning on mixed docs where mermaid outnumbers svg');
});

it('L3-prefer-svg is silent when SVG matches or exceeds Mermaid count', () => {
  const balanced = VALID.replace(
    /<svg aria-label="user-flow workflow">user flow<\/svg>/,
    '<svg>user flow</svg>\n<pre class="mermaid">extra</pre>',
  );
  const r = lintHtml(balanced, { docName: 'design' });
  assert.ok(!r.warnings.some(w => w.rule === 'L3-prefer-svg'),
    'L3-prefer-svg must NOT fire when svg count >= mermaid count');
});

it('fixHtml: leaves Writer-only findings as unfixed (e.g. missing mockup visuals)', () => {
  const bad = VALID
    .replace(/<svg aria-label="UI mockup screen">mockup<\/svg>/, '')
    .replace(/<svg aria-label="user-flow workflow">user flow<\/svg>/, '');
  const r = fixHtml(bad, { docName: 'design', metaJson: { doc: 'design', schemaVersion: 2 } });
  assert.ok(r.unfixed.some(e => e.rule === 'L3-ux-visuals'),
    'L3-ux-visuals needs real content — must remain in unfixed[]');
});

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  for (const f of failures) {
    process.stderr.write(`\n${f.name}: ${f.err.stack}\n`);
  }
  process.exit(1);
}
