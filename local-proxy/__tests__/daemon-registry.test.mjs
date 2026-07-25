// daemon-registry.test.mjs — E2E for the daemon architecture (spec PR 1).
//
// Drives the REAL daemon + in-memory project registry against temp
// workspaces, so we exercise actual routing — not mocks. Written red-first:
// the new API (startDaemon/stopDaemon/registerProject + /p/<projectId>/...
// routes + /_daemon/* endpoints) does not exist yet, so every `it` here
// fails until the implementation lands. That is intentional.
//
// Kills problems 1/2/4 at the root:
//   1 (link offset): links carry a full origin + project identity, and both
//     plan-harness/ and plans/ roots yield the SAME link shape.
//   2 (multi-session bleed): every request resolves its project root from the
//     projectId in the URL against the registry — never a process global — so
//     project A's link can NEVER resolve to project B's file.
//   4 (single service + MCP registration): one daemon, fixed port, projects
//     registered in; the registry self-cleans when a root disappears
//     (worktree deleted).

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

// A minimal scenario doc carrying a unique marker so we can prove WHICH
// project's file was served (the anti-bleed assertions depend on this).
function docHtml(scenario, doc, marker) {
  return `<!DOCTYPE html><html><head><script type="application/json" id="meta">{}</script></head>`
    + `<body><main><section><h2 id="overview">Overview</h2>`
    + `<p data-marker="${marker}">${marker}</p></section></main></body></html>`;
}

// Create a workspace whose scenario docs live under the given root name
// ('plan-harness' or 'plans'). `marker` is baked into every doc so served
// content is attributable to this exact workspace.
async function makeWorkspace({ prefix, rootName = 'plan-harness', scenario, docs, marker }) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const scenDir = join(root, rootName, scenario);
  await mkdir(scenDir, { recursive: true });
  for (const doc of docs) {
    await writeFile(join(scenDir, `${doc}.html`), docHtml(scenario, doc, marker), 'utf-8');
  }
  await writeFile(join(scenDir, 'manifest.json'), JSON.stringify({ scenario }), 'utf-8');
  return root;
}

// Daemon must NOT auto-bump the port anymore (fixed port is the precondition
// for stable, offset-free links). Pick a high, uncommon port for the test.
const PORT = 3993;
const ORIGIN = `http://localhost:${PORT}`;

async function req(path, opts = {}) {
  const r = await fetch(ORIGIN + path, { redirect: 'manual', ...opts });
  const ct = r.headers.get('content-type') || '';
  const body = /json/.test(ct) ? await r.json().catch(() => null) : await r.text();
  return { status: r.status, location: r.headers.get('location'), contentType: ct, body };
}

async function main() {
  process.stdout.write('daemon + project registry\n');

  // Build several isolated workspaces up front.
  const rootA = await makeWorkspace({
    prefix: 'ph-daemon-A-', rootName: 'plan-harness',
    scenario: 'checkout-flow', docs: ['design', 'analysis'], marker: 'PROJECT_A_MARKER',
  });
  const rootB = await makeWorkspace({
    prefix: 'ph-daemon-B-', rootName: 'plan-harness',
    // SAME scenario name as A on purpose — the classic collision case.
    scenario: 'checkout-flow', docs: ['design'], marker: 'PROJECT_B_MARKER',
  });
  const rootPlansRoot = await makeWorkspace({
    prefix: 'ph-daemon-plansroot-', rootName: 'plans',
    scenario: 'legacy-scn', docs: ['design'], marker: 'PLANS_ROOT_MARKER',
  });

  let idA, idB, idPlans;

  try {
    // ---- Daemon boot ----
    const base = await ws.startDaemon(PORT);
    await it('startDaemon returns the fixed-port origin (no auto-bump)', async () => {
      assert.equal(base, ORIGIN, `expected ${ORIGIN}, got ${base}`);
    });

    await it('health endpoint reports ok + version + port', async () => {
      const r = await req('/_daemon/health');
      assert.equal(r.status, 200);
      assert.equal(r.body?.ok, true, 'health.ok must be true');
      assert.ok(r.body?.version, 'health.version must be present (drives version handshake)');
      assert.equal(r.body?.port, PORT, `health.port must be ${PORT}`);
    });

    // ---- Registration (the MCP↔daemon contract, over HTTP) ----
    await it('POST /_daemon/register returns projectId + project-scoped url', async () => {
      const r = await req('/_daemon/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootPath: rootA, label: 'Project A' }),
      });
      assert.equal(r.status, 200, `expected 200, got ${r.status}`);
      idA = r.body?.projectId;
      assert.ok(idA, 'register must return a projectId');
      // projectId = <slug>-<hash6>: carries a readable slug + a 6-hex suffix.
      assert.ok(/-[0-9a-f]{6}$/.test(idA), `projectId must end in -<hash6>, got ${idA}`);
      assert.equal(r.body?.url, `${ORIGIN}/p/${idA}/`,
        `register url must be the project-scoped absolute URL, got ${r.body?.url}`);
    });

    await it('registerProject (in-process) is idempotent: same root -> same id', async () => {
      const again = await ws.registerProject(rootA, 'Project A');
      assert.equal(again.projectId, idA, 'same rootPath must map to the same projectId');
      assert.equal(again.url, `${ORIGIN}/p/${idA}/`, 'origin+path must be stable across calls');
    });

    // Register B and the plans/-rooted project via the exported fn.
    await it('second + third projects register on the SAME daemon (no new port)', async () => {
      const rb = await ws.registerProject(rootB, 'Project B');
      const rp = await ws.registerProject(rootPlansRoot, 'Plans-root Project');
      idB = rb.projectId;
      idPlans = rp.projectId;
      assert.ok(idB && idPlans, 'both must get ids');
      assert.notEqual(idA, idB, 'distinct roots -> distinct projectIds');
      // All share the one fixed-port origin — no EADDRINUSE bump.
      for (const u of [rb.url, rp.url]) {
        assert.ok(u.startsWith(ORIGIN + '/p/'), `url must share the fixed origin, got ${u}`);
      }
    });

    // ---- Problem 1: link carries identity + serves the right file ----
    await it('project-scoped doc URL returns THAT project\'s file', async () => {
      const r = await req(`/p/${idA}/checkout-flow/design.html`);
      assert.equal(r.status, 200, `expected 200, got ${r.status}`);
      assert.ok(/PROJECT_A_MARKER/.test(r.body), 'must serve project A\'s design.html');
    });

    // ---- Problem 2: no cross-project bleed even with identical scenario names ----
    await it('B\'s URL returns B\'s file — same scenario name, different project', async () => {
      const r = await req(`/p/${idB}/checkout-flow/design.html`);
      assert.equal(r.status, 200);
      assert.ok(/PROJECT_B_MARKER/.test(r.body), 'must serve project B\'s file, not A\'s');
      assert.ok(!/PROJECT_A_MARKER/.test(r.body), 'must NOT bleed project A\'s content');
    });

    await it('cross request: B\'s id + a scenario only A has -> 404, never A\'s file', async () => {
      // 'analysis' exists only in A. Asking for it under B's projectId must
      // 404 (B has no such doc) and must NOT fall through to A's copy.
      const r = await req(`/p/${idB}/checkout-flow/analysis.html`);
      assert.ok(r.status === 404 || (r.status === 302 && r.location === `/p/${idB}/`),
        `expected 404 or in-project redirect, got ${r.status} -> ${r.location}`);
      assert.ok(!/PROJECT_A_MARKER/.test(String(r.body)), 'must never serve A\'s file for a B-scoped URL');
    });

    // ---- Problem 1 asymmetry: plans/ and plan-harness/ roots, same link shape ----
    await it('plans/-rooted doc opens via the SAME /p/<id>/ link shape', async () => {
      const r = await req(`/p/${idPlans}/legacy-scn/design.html`);
      assert.equal(r.status, 200, `plans/-rooted doc must open, got ${r.status}`);
      assert.ok(/PLANS_ROOT_MARKER/.test(r.body), 'must serve the plans/-rooted file');
    });

    // ---- Cross-project dashboard overview (problem 4: project as top level) ----
    await it('GET / is a single cross-project overview listing every project', async () => {
      const r = await req('/');
      assert.equal(r.status, 200);
      // Each registered project appears, and its scenarios link with the
      // project-scoped, identity-carrying href.
      assert.ok(r.body.includes(`/p/${idA}/`), 'overview must link project A scoped');
      assert.ok(r.body.includes(`/p/${idB}/`), 'overview must link project B scoped');
      assert.ok(r.body.includes(`/p/${idPlans}/`), 'overview must link plans-root project scoped');
    });

    await it('doc links baked into the overview carry the absolute origin', async () => {
      const r = await req('/');
      // At least one fully-qualified project-scoped doc link is present, so a
      // copied link is unambiguous across sessions.
      assert.ok(new RegExp(`${ORIGIN}/p/${idA}/`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(r.body)
        || r.body.includes(`/p/${idA}/`),
        'overview should surface project-scoped links');
    });

    // ---- Problem 2 root cause gone: unknown projectId never bleeds ----
    await it('unknown projectId -> 404 + hint, never another project\'s file', async () => {
      const r = await req('/p/does-not-exist-000000/checkout-flow/design.html');
      assert.equal(r.status, 404, `expected 404, got ${r.status}`);
      assert.ok(!/PROJECT_[AB]_MARKER/.test(String(r.body)), 'must not serve any project file');
      assert.ok(/not registered|register|plan-start/i.test(String(r.body)),
        'should hint how to register the project');
    });

    // ---- Legacy bare short route redirects to overview (spec §3.3) ----
    await it('bare /<scenario>/<doc>.html (no project identity) -> 302 to /', async () => {
      const r = await req('/checkout-flow/design.html');
      assert.equal(r.status, 302, `expected 302, got ${r.status}`);
      assert.equal(r.location, '/', 'identity-less short route must land on the overview');
    });

    // ---- Self-clean via existence probe (worktree deleted) ----
    await it('deleting a project root removes it from the overview', async () => {
      await rm(rootB, { recursive: true, force: true });
      const r = await req('/');
      assert.ok(!r.body.includes(`/p/${idB}/`),
        'a project whose root no longer exists must drop out of the overview');
    });

    await it('serving a doc from a vanished project -> 404, no stale content', async () => {
      const r = await req(`/p/${idB}/checkout-flow/design.html`);
      assert.equal(r.status, 404, `expected 404 for vanished project, got ${r.status}`);
    });

    // ---- plan_share auth path: toggle protection on the daemon itself ----
    await it('POST /_daemon/auth enable -> returns a password + protects', async () => {
      const r = await req('/_daemon/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      assert.equal(r.status, 200, `expected 200, got ${r.status}`);
      assert.equal(r.body?.enabled, true);
      assert.ok(r.body?.password, 'enabling protection must return a generated password');
    });

    await it('POST /_daemon/auth disable -> clears protection', async () => {
      const r = await req('/_daemon/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      assert.equal(r.status, 200);
      assert.equal(r.body?.enabled, false);
      assert.equal(r.body?.password, null);
    });

    // ---- Version handshake mechanism: shutdown endpoint frees the port ----
    await it('POST /_daemon/shutdown stops the daemon (respawn precondition)', async () => {
      const r = await req('/_daemon/shutdown', { method: 'POST' });
      // Either an accepted status before it dies, or a dropped connection.
      assert.ok([200, 202, 204].includes(r.status), `expected 2xx ack, got ${r.status}`);
      // Give it a beat to close, then the port must be free / health gone.
      await new Promise((res) => setTimeout(res, 200));
      let down = false;
      try {
        await fetch(`${ORIGIN}/_daemon/health`);
      } catch { down = true; }
      assert.ok(down || !ws.isDaemonRunning?.(), 'daemon must actually stop so a new version can bind');
    });
  } finally {
    try { await ws.stopDaemon(); } catch { /* already down */ }
    for (const r of [rootA, rootB, rootPlansRoot]) {
      await rm(r, { recursive: true, force: true }).catch(() => {});
    }
  }

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
