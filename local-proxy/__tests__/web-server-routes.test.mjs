// web-server-routes.test.mjs — E2E route tests for link integrity + graceful
// fallback. Spins up the real HTTP server against a temp workspace so we
// exercise the actual routing (not a mock).
//
// Covers the recurring "generated URL 404s" bug:
//   - a doc link for a not-yet-generated sibling must NOT dead-end on a 404;
//     it redirects to the scenario home (or dashboard if the scenario is gone).
//   - the baked cross-doc nav (.docgroup) disables links whose target file is
//     missing on disk, so they can't be clicked into a redirect in the first
//     place.

import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as ws from '../src/web-server.js';

let passed = 0;
let failed = 0;

async function it(name, fn) {
  try {
    await fn();
    passed += 1;
    process.stdout.write(`  \x1b[32m✓\x1b[0m ${name}\n`);
  } catch (err) {
    failed += 1;
    process.stdout.write(`  \x1b[31m✗\x1b[0m ${name}\n    ${err.stack || err.message}\n`);
  }
}

// A minimal self-contained doc (has <script id="meta"> so the proxy treats it
// as a scenario doc) with a full workflow .docgroup nav — but only some of the
// linked siblings will actually exist on disk.
function docHtml(scenario, active) {
  const link = (doc) =>
    `<a href="/${scenario}/${doc}.html"${doc === active ? ' class="active"' : ''}>${doc}</a>`;
  const docs = ['product', 'analysis', 'design', 'state-machine', 'test-spec', 'implementation', 'test-report'];
  return `<!DOCTYPE html><html><head><script type="application/json" id="meta">{}</script></head>`
    + `<body><nav class="toc"><div class="docgroup">${docs.map(link).join('')}</div>`
    + `<div class="sections"></div></nav><main><section><h2 id="overview">Overview</h2></section></main></body></html>`;
}

async function setupWorkspace() {
  const root = await mkdtemp(join(tmpdir(), 'ph-routes-'));
  const scen = join(root, 'plan-harness', 'ds-offboard-stateful-flow');
  await mkdir(scen, { recursive: true });
  // Only design.html + test-spec.html exist. product/analysis/etc. do NOT.
  await writeFile(join(scen, 'design.html'), docHtml('ds-offboard-stateful-flow', 'design'), 'utf-8');
  await writeFile(join(scen, 'test-spec.html'), docHtml('ds-offboard-stateful-flow', 'test-spec'), 'utf-8');
  await writeFile(join(scen, 'manifest.json'), JSON.stringify({ scenario: 'ds-offboard-stateful-flow' }), 'utf-8');
  return root;
}

// Pick a high port unlikely to collide; startDashboard auto-bumps on EADDRINUSE.
const PORT = 3971;

async function get(base, path) {
  const r = await fetch(base + path, { redirect: 'manual' });
  const body = r.status === 200 ? await r.text() : '';
  return { status: r.status, location: r.headers.get('location'), body };
}

async function main() {
  process.stdout.write('web-server routes\n');
  const root = await setupWorkspace();
  let base;
  try {
    base = await ws.startDashboard(root, PORT);

    await it('existing doc -> 200', async () => {
      const r = await get(base, '/ds-offboard-stateful-flow/design.html');
      assert.equal(r.status, 200, `expected 200, got ${r.status}`);
    });

    await it('missing doc -> 302 to scenario home (the reported bug)', async () => {
      const r = await get(base, '/ds-offboard-stateful-flow/product.html');
      assert.equal(r.status, 302, `expected 302, got ${r.status}`);
      assert.equal(r.location, '/scenario/ds-offboard-stateful-flow');
    });

    await it('missing doc under unknown scenario -> 302 to dashboard', async () => {
      const r = await get(base, '/totally-unknown-scenario/product.html');
      assert.equal(r.status, 302);
      assert.equal(r.location, '/');
    });

    await it('scenario home resolves -> 200', async () => {
      const r = await get(base, '/scenario/ds-offboard-stateful-flow');
      assert.equal(r.status, 200);
    });

    await it('unrouted GET -> 302 to dashboard', async () => {
      const r = await get(base, '/some/bogus/path-xyz');
      assert.equal(r.status, 302);
      assert.equal(r.location, '/');
    });

    await it('unrouted non-GET -> 404 (no surprise redirect)', async () => {
      const r = await fetch(base + '/some/bogus/path-xyz', { method: 'DELETE', redirect: 'manual' });
      assert.equal(r.status, 404);
    });

    await it('.docgroup: missing sibling links are disabled (no href, aria-disabled)', async () => {
      const r = await get(base, '/ds-offboard-stateful-flow/design.html');
      const dg = (r.body.match(/<div class="docgroup">[\s\S]*?<\/div>/) || [''])[0];
      // product was NOT generated -> its link must be disabled, no href.
      const productLink = (dg.match(/<a[^>]*>product<\/a>/) || [''])[0];
      assert.ok(productLink, 'product link should be present');
      assert.ok(!/href=/i.test(productLink), `product link must have no href, got: ${productLink}`);
      assert.ok(/aria-disabled="true"/i.test(productLink), 'product link must be aria-disabled');
      assert.ok(/\bmissing\b/.test(productLink), 'product link must carry the "missing" class');
    });

    await it('.docgroup: existing sibling links stay live + root-absolute', async () => {
      const r = await get(base, '/ds-offboard-stateful-flow/design.html');
      const dg = (r.body.match(/<div class="docgroup">[\s\S]*?<\/div>/) || [''])[0];
      // test-spec WAS generated -> its link must remain clickable.
      const tsLink = (dg.match(/<a[^>]*>test-spec<\/a>/) || [''])[0];
      assert.ok(/href="\/ds-offboard-stateful-flow\/test-spec\.html"/.test(tsLink),
        `test-spec link must be live + root-absolute, got: ${tsLink}`);
      assert.ok(!/aria-disabled/i.test(tsLink), 'test-spec link must NOT be disabled');
    });

    await it('.docgroup: disabled-state style is injected once', async () => {
      const r = await get(base, '/ds-offboard-stateful-flow/design.html');
      const count = (r.body.match(/id="ph-docgroup-missing"/g) || []).length;
      assert.equal(count, 1, `expected exactly one injected style block, got ${count}`);
    });

    await it('followed redirect: clicking a missing doc lands on a 200 page', async () => {
      // redirect:follow — simulate a real browser following the 302.
      const r = await fetch(base + '/ds-offboard-stateful-flow/product.html');
      assert.equal(r.status, 200, `after following redirect expected 200, got ${r.status}`);
    });
  } finally {
    await ws.stopDashboard();
    await rm(root, { recursive: true, force: true }).catch(() => {});
  }

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
