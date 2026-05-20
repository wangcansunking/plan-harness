// html-lint.test.mjs — unit tests for html-lint.js rule coverage.
//
// Inputs are inline HTML strings rather than fixture files because:
//   (a) the lint logic does not care about file paths,
//   (b) keeping the assertion + input in one place makes failures easy to trace.
//
// Run via `npm test` (chained from local-proxy/package.json) or directly:
//   node __tests__/html-lint.test.mjs

import { strict as assert } from 'node:assert';
import { lintHtml } from '../src/html-lint.js';

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
  <a href="#overview">Overview</a>
</nav>
<section>
<h2 id="overview">Overview</h2>
</section>
</main>
</body>
</html>`;

it('VALID fixture passes all rules', () => {
  const r = lintHtml(VALID, { docName: 'design' });
  assert.equal(r.errors.length, 0, `Unexpected errors:\n${r.errors.map(e => `  - ${e.rule}: ${e.message}`).join('\n')}`);
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

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  for (const f of failures) {
    process.stderr.write(`\n${f.name}: ${f.err.stack}\n`);
  }
  process.exit(1);
}
