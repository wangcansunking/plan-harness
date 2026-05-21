// meta-validate.test.mjs — unit tests for meta-validate.js
//
// Cover: V1 schema-shape, V2 per-doc invariants, V3 cross-doc refs, V4 HTML
// semantic coverage. Cross-doc tests use a temp dir so we can stage sibling
// meta files for the validator to discover.

import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateMeta, validateHtmlSemantics, validateDoc } from '../src/meta-validate.js';

let passed = 0;
let failed = 0;

function it(name, fn) {
  return Promise.resolve(fn()).then(
    () => { passed += 1; process.stdout.write(`  \x1b[32m✓\x1b[0m ${name}\n`); },
    (err) => { failed += 1; process.stdout.write(`  \x1b[31m✗\x1b[0m ${name}\n    ${err.message}\n`); }
  );
}

const tests = [];
const test = (name, fn) => tests.push(() => it(name, fn));

test('V1-shape flags missing required fields on design', async () => {
  const result = await validateMeta({ doc: 'design' }, { docName: 'design' });
  assert.ok(result.errors.some(e => e.rule === 'V1-shape'),
    'expected V1-shape error for missing required fields');
});

test('V1-shape passes a complete product meta', async () => {
  const meta = {
    doc: 'product', scenario: 'demo',
    problem: { summary: 's', evidence: [] },
    users: [{ role: 'r', need: 'n' }],
    userStories: [{ id: 'US1', mockup: '<svg/>' }],
    successMetrics: ['x'],
  };
  const result = await validateMeta(meta, { docName: 'product' });
  assert.equal(result.errors.length, 0,
    `unexpected errors:\n${result.errors.map(e => `  - ${e.rule}: ${e.message}`).join('\n')}`);
});

test('V2-product-mockups flags stories without a mockup', async () => {
  const meta = {
    doc: 'product', scenario: 'demo',
    problem: { summary: 's' },
    users: [{ role: 'r', need: 'n' }],
    userStories: [
      { id: 'US1', mockup: '<svg/>' },
      { id: 'US2' },
      { id: 'US3', mockup: null },
    ],
    successMetrics: ['x'],
  };
  const result = await validateMeta(meta, { docName: 'product' });
  const v2 = result.errors.find(e => e.rule === 'V2-product-mockups');
  assert.ok(v2, 'expected V2-product-mockups error');
  assert.match(v2.message, /US2/);
  assert.match(v2.message, /US3/);
});

test('V3-state-machine-stories flags storyId not in product.userStories[].id', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'meta-validate-'));
  await writeFile(join(dir, 'product.meta.json'), JSON.stringify({
    doc: 'product',
    userStories: [{ id: 'US1' }, { id: 'US2' }],
  }));
  const smMeta = {
    doc: 'state-machine', scenario: 'demo',
    stateMachines: [{ id: 'SM1', states: [], transitions: [] }],
    perStoryFlows: [
      { storyId: 'US1', machine: 'SM1' },
      { storyId: 'US99', machine: 'SM1' },   // dangling
    ],
    cornerCases: [], invariants: [],
  };
  const result = await validateMeta(smMeta, { docName: 'state-machine', docDir: dir });
  const v3 = result.errors.find(e => e.rule === 'V3-state-machine-stories' && e.message.includes('US99'));
  assert.ok(v3, 'expected V3 error mentioning the dangling story id');
});

test('V3-state-machine-stories flags machine id not in stateMachines[]', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'meta-validate-'));
  await writeFile(join(dir, 'product.meta.json'), JSON.stringify({
    doc: 'product',
    userStories: [{ id: 'US1' }],
  }));
  const smMeta = {
    doc: 'state-machine', scenario: 'demo',
    stateMachines: [{ id: 'SM1', states: [], transitions: [] }],
    perStoryFlows: [{ storyId: 'US1', machine: 'GHOST' }],
    cornerCases: [], invariants: [],
  };
  const result = await validateMeta(smMeta, { docName: 'state-machine', docDir: dir });
  assert.ok(result.errors.some(e => e.rule === 'V3-state-machine-stories' && e.message.includes('GHOST')),
    'expected V3 error mentioning the unknown machine id');
});

test('V3-state-machine-stories flags count mismatch with product.userStories', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'meta-validate-'));
  await writeFile(join(dir, 'product.meta.json'), JSON.stringify({
    doc: 'product',
    userStories: [{ id: 'US1' }, { id: 'US2' }, { id: 'US3' }],
  }));
  const smMeta = {
    doc: 'state-machine', scenario: 'demo',
    stateMachines: [{ id: 'SM1', states: [], transitions: [] }],
    perStoryFlows: [{ storyId: 'US1', machine: 'SM1' }],
    cornerCases: [], invariants: [],
  };
  const result = await validateMeta(smMeta, { docName: 'state-machine', docDir: dir });
  assert.ok(result.errors.some(e => e.rule === 'V3-state-machine-stories' && e.message.includes('1 entries but product.userStories has 3')),
    'expected V3 count-mismatch error');
});

test('V3-implementation-slices flags PR slice not in test-spec.verticalSlices', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'meta-validate-'));
  await writeFile(join(dir, 'test-spec.meta.json'), JSON.stringify({
    doc: 'test-spec',
    verticalSlices: [{ id: 'VS1' }, { id: 'VS2' }],
  }));
  const implMeta = {
    doc: 'implementation', scenario: 'demo',
    prs: [
      { id: 'PR-1', slice: 'VS1' },
      { id: 'PR-2', slice: 'VS99' },   // dangling
    ],
  };
  const result = await validateMeta(implMeta, { docName: 'implementation', docDir: dir });
  assert.ok(result.errors.some(e => e.rule === 'V3-implementation-slices' && e.message.includes('VS99')),
    'expected V3-implementation-slices error');
});

test('V4-product-mockup-render flags missing mockup visuals in HTML', async () => {
  const html = `<main><section><h2>Stories</h2><p>US1 something</p></section></main>`;
  const meta = { doc: 'product', userStories: [{ id: 'US1', mockup: 'x' }, { id: 'US2', mockup: 'y' }] };
  const result = await validateHtmlSemantics(html, meta, { docName: 'product' });
  assert.ok(result.errors.some(e => e.rule === 'V4-product-mockup-render'),
    'expected V4-product-mockup-render error');
});

test('V4-product-mockup-render passes when every story has a mockup visual', async () => {
  const html = `<main><section>
    <h2>Stories</h2>
    <div class="diagram"><svg aria-label="mockup A">mockup</svg></div>
    <div class="diagram"><svg aria-label="mockup B">screen</svg></div>
  </section></main>`;
  const meta = { doc: 'product', userStories: [{ id: 'US1', mockup: 'x' }, { id: 'US2', mockup: 'y' }] };
  const result = await validateHtmlSemantics(html, meta, { docName: 'product' });
  assert.ok(!result.errors.some(e => e.rule === 'V4-product-mockup-render'),
    'V4-product-mockup-render should not fire when counts match');
});

test('V4-hrefs-resolve warns on broken cross-doc href', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'meta-validate-'));
  await mkdir(join(dir, '..', '_shared', 'context'), { recursive: true });
  await writeFile(join(dir, 'design.html'), 'x');
  const html = `<main><a href="/demo/missing.html">x</a><a href="/demo/design.html">y</a></main>`;
  const meta = { doc: 'design' };
  const result = await validateHtmlSemantics(html, meta, {
    docName: 'design',
    docDir: dir,
    sharedDir: join(dir, '..', '_shared'),
  });
  // Note: the dir for our temp scenario is `meta-validate-xxxx`, not `demo`, so
  // both hrefs are broken in practice. The warning should fire.
  assert.ok(result.warnings.some(w => w.rule === 'V4-hrefs-resolve'),
    'expected V4-hrefs-resolve warning when a referenced file does not exist');
});

(async () => {
  for (const t of tests) await t();
  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
