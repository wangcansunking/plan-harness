// plan-harness/local-proxy/src/web-server.js
// Local HTTP server that serves the plan dashboard and individual plan files.
// Uses only node:http, node:fs, node:path, node:url (no external deps).

import { createServer } from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename, extname, resolve, sep, dirname } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const ICON_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'icon.png');
import {
  generateDashboard,
  generateScenarioDetail,
  injectSectionIds,
  injectPlanMeta,
  injectSidebarPanels,
  injectLightbox,
  getBaseScript,
  getThemeInitScript,
  getThemeToggleHTML,
  normalizePlanTabs,
  normalizeAssetLinks,
  normalizeChecklistItems
} from './templates/base.js';
import * as auth from './auth.js';
import * as commentMgr from './comment-manager.js';
import { CommentError } from './comment-manager.js';
import * as reviseMgr from './revise-dispatcher.js';
import { lintHtml } from './html-lint.js';

let server = null;
let serverPort = null;
let workspaceRootPath = null;

const COOKIE_NAME = 'plan_session';

/**
 * Start the dashboard server.
 * Scans workspaceRoot for plans/ directory and serves the dashboard.
 * @param {string} workspaceRoot - Absolute path to the workspace root.
 * @param {number} [port=3847] - Port to listen on.
 * @returns {Promise<string>} The URL the server is listening on.
 */
export async function startDashboard(workspaceRoot, port = 3847) {
  // Truth check: if `server` is set but no longer listening (it died), drop
  // the reference and start a fresh one. Otherwise repeated calls into a
  // dead server return a URL that 404s on every request.
  if (server) {
    if (server.listening) return getDashboardUrl();
    console.error('[plan-harness] previous HTTP server reference is dead; reaping');
    try { server.close(); } catch { /* already closed */ }
    server = null;
    serverPort = null;
  }

  workspaceRootPath = resolve(workspaceRoot);

  return new Promise((resolvePromise, rejectPromise) => {
    server = createServer(async (req, res) => {
      try {
        await handleRequest(req, res);
      } catch (err) {
        console.error('[plan-harness] Request error:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Try next port
        server.close();
        server = null;
        startDashboard(workspaceRoot, port + 1).then(resolvePromise, rejectPromise);
      } else {
        console.error('[plan-harness] HTTP server error (non-fatal):', err);
        // Don't reject after we've already started — surface for logging only.
        if (!serverPort) rejectPromise(err);
      }
    });

    // Absorb client-side socket errors so a misbehaving client (closed early,
    // sent malformed request line, etc.) does NOT propagate as an uncaught
    // 'ECONNRESET' / 'HPE_INVALID_*' and crash the process.
    server.on('clientError', (err, socket) => {
      console.error('[plan-harness] clientError (absorbed):', err?.code || err?.message);
      try { socket.destroy(); } catch { /* socket already gone */ }
    });
    server.on('connection', (socket) => {
      socket.on('error', (err) => {
        console.error('[plan-harness] socket error (absorbed):', err?.code || err?.message);
      });
    });

    // If the server emits 'close' for any reason (manual stop, fatal listener
    // error after startup), null out the module state so the next call to
    // startDashboard reaches the actual listen() path instead of returning a
    // stale URL.
    server.on('close', () => {
      console.error('[plan-harness] HTTP server closed; clearing cached state');
      server = null;
      serverPort = null;
      workspaceRootPath = null;
    });

    // Browser-friendly timeouts. Node defaults (keepAliveTimeout=5s) tear down
    // an idle keep-alive socket aggressively, which makes interactive sessions
    // feel like "the page died" when the user comes back from another tab.
    // SSE handlers manage their own lifecycle (30s heartbeat) so this only
    // affects regular HTTP traffic.
    server.keepAliveTimeout = 120_000;     // 2 min — survive a coffee break
    server.headersTimeout   = 125_000;     // must be > keepAliveTimeout
    server.requestTimeout   = 0;           // 0 = unlimited (SSE streams need this)

    server.listen(port, '127.0.0.1', () => {
      serverPort = port;
      const url = getDashboardUrl();
      console.error(`[plan-harness] Dashboard running at ${url}`);
      resolvePromise(url);
    });
  });
}

/**
 * Stop the server.
 * @returns {Promise<void>}
 */
export async function stopDashboard() {
  if (!server) return;
  return new Promise((resolvePromise) => {
    server.close(() => {
      server = null;
      serverPort = null;
      workspaceRootPath = null;
      resolvePromise();
    });
  });
}

/**
 * Check if server is running.
 * @returns {boolean}
 */
export function isDashboardRunning() {
  return server !== null && server.listening;
}

/**
 * Get current URL.
 * @returns {string|null}
 */
export function getDashboardUrl() {
  if (!serverPort) return null;
  return `http://localhost:${serverPort}`;
}

// ---- Password protection API ----

/**
 * Enable password protection. Non-loopback requests must authenticate via the
 * login form (password + reviewer name). Loopback requests bypass auth — the
 * host viewing their own machine does not need to log in.
 *
 * @param {string} [customPassword] - Optional explicit password; if omitted a
 *   secure random one is generated.
 * @returns {string} The active password (useful so the host can share it out-of-band).
 */
export function enablePasswordProtection(customPassword) {
  const pw = auth.enable(customPassword);
  console.error(`[plan-harness] Password protection enabled.`);
  return pw;
}

/** Disable password protection. All requests are allowed. */
export function disablePasswordProtection() {
  auth.disable();
  console.error(`[plan-harness] Password protection disabled.`);
}

/** @returns {boolean} */
export function isPasswordProtected() {
  return auth.isEnabled();
}

// ---- Internal request handling ----

async function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // ---- Password protection gate ----
  // Loopback bypass: if the request came from the host machine itself AND
  // wasn't forwarded by a tunnel/proxy, no auth is needed — local UX stays
  // frictionless. `auth.isLocalRequest` checks BOTH the socket peer and the
  // absence of proxy headers (X-Forwarded-*, Forwarded, X-Real-IP, ...) so
  // that devtunnel — which proxies external visitors through localhost:3847
  // and shows up at the TCP layer as 127.0.0.1 — doesn't slip through the
  // gate. Pass --strict-host to plan_share to disable loopback bypass entirely.
  const fromLoopback = auth.isLocalRequest(req);

  // The login POST is the sole entry point into authentication and must be
  // reachable regardless of loopback status so the form on the login page
  // can always submit successfully.
  if (auth.isEnabled() && pathname === '/_auth/login' && req.method === 'POST') {
    return handleLogin(req, res);
  }

  // Public: icon is served before auth so the login page favicon resolves.
  if ((pathname === '/favicon.ico' || pathname === '/icon.png') && req.method === 'GET') {
    return serveIcon(req, res);
  }

  if (auth.isEnabled() && !fromLoopback) {
    const cookieValue = parseCookie(req.headers.cookie || '', COOKIE_NAME);
    const session = auth.verifyCookie(cookieValue);

    if (!session) {
      // Not authenticated — serve login page.
      return serveLoginPage(req, res);
    }

    // Attach the authenticated reviewer to the request for downstream handlers.
    req.user = session;
  }

  // Route: GET / -> Dashboard
  if (pathname === '/' && req.method === 'GET') {
    return serveDashboard(req, res);
  }

  // Route: GET /scenario/:name -> Scenario detail page
  const scenarioMatch = pathname.match(/^\/scenario\/([^/]+)$/);
  if (scenarioMatch && req.method === 'GET') {
    const scenarioName = decodeURIComponent(scenarioMatch[1]);
    return serveScenarioDetail(req, res, scenarioName);
  }

  // Route: GET /view?path=<absolute-path> -> Serve an HTML plan file directly
  if (pathname === '/view' && req.method === 'GET') {
    const filePath = parsedUrl.searchParams.get('path');
    return serveHtmlFile(req, res, filePath, { fromLoopback });
  }

  // Route: GET /asset?path=<absolute-path> -> Serve a static binary asset
  // (PNG/JPG/GIF/WEBP/SVG) from under the workspace root. Used by plan docs
  // to reference screenshots and other evidence artefacts.
  if (pathname === '/asset' && req.method === 'GET') {
    const filePath = parsedUrl.searchParams.get('path');
    return serveAssetFile(req, res, filePath);
  }

  // Route: GET /api/scenarios -> JSON list of all scenarios
  if (pathname === '/api/scenarios' && req.method === 'GET') {
    return serveApiScenarios(req, res);
  }

  // Route: GET /api/scenario/:name/status -> JSON completion status
  const statusMatch = pathname.match(/^\/api\/scenario\/([^/]+)\/status$/);
  if (statusMatch && req.method === 'GET') {
    const scenarioName = decodeURIComponent(statusMatch[1]);
    return serveApiScenarioStatus(req, res, scenarioName);
  }

  // Route: GET /api/me -> JSON { name } for the authenticated reviewer
  // Used by future comment UI to display/attribute the current viewer.
  if (pathname === '/api/me' && req.method === 'GET') {
    const name = req.user?.name || (fromLoopback ? 'Host (local)' : 'Anonymous');
    const role = fromLoopback ? 'host' : 'reviewer';
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      name,
      role,
      authenticated: !!req.user || fromLoopback,
    }));
    return;
  }

  // ---- Comment routes (Phase 2 of built-in-comment-ui) ----
  // Scenario + doc validated inside comment-manager for path safety.
  const commentListMatch = pathname.match(/^\/api\/comments\/([^/]+)\/([^/]+)$/);
  const commentItemMatch = pathname.match(/^\/api\/comments\/([^/]+)\/([^/]+)\/([^/]+)$/);
  const commentStreamMatch = pathname.match(/^\/api\/comments\/([^/]+)\/([^/]+)\/stream$/);

  if (commentStreamMatch && req.method === 'GET') {
    return handleCommentStream(req, res, {
      scenario: commentStreamMatch[1],
      doc: commentStreamMatch[2],
    });
  }

  if (commentListMatch && req.method === 'GET') {
    return handleCommentList(req, res, {
      scenario: commentListMatch[1],
      doc: commentListMatch[2],
    });
  }

  if (commentListMatch && req.method === 'POST') {
    return handleCommentCreate(req, res, {
      scenario: commentListMatch[1],
      doc: commentListMatch[2],
      actor: resolveActor(req, fromLoopback),
    });
  }

  if (commentItemMatch && commentItemMatch[3] !== 'stream' && req.method === 'PATCH') {
    return handleCommentPatch(req, res, {
      scenario: commentItemMatch[1],
      doc: commentItemMatch[2],
      id: commentItemMatch[3],
      actor: resolveActor(req, fromLoopback),
    });
  }

  if (commentItemMatch && commentItemMatch[3] !== 'stream' && req.method === 'DELETE') {
    return handleCommentDelete(req, res, {
      scenario: commentItemMatch[1],
      doc: commentItemMatch[2],
      id: commentItemMatch[3],
      actor: resolveActor(req, fromLoopback),
    });
  }

  // ---- Revise action routes (Phase 8) — all host-only ----
  const reviseMatch = pathname.match(/^\/api\/comments\/([^/]+)\/([^/]+)\/([^/]+)\/revise-(dispatch|accept|reject|proposal)$/);
  if (reviseMatch && (req.method === 'POST' || (req.method === 'GET' && reviseMatch[4] === 'proposal'))) {
    return handleReviseAction(req, res, {
      scenario: reviseMatch[1],
      doc: reviseMatch[2],
      id: reviseMatch[3],
      action: reviseMatch[4],
      method: req.method,
      actor: resolveActor(req, fromLoopback),
    });
  }

  // ---- v2 root-absolute static routes (K2 fix) ----
  // Cross-doc links in v2 use /<scenario>/<doc>.html instead of
  // /view?path=<absolute>. The absolute form 404'd whenever the scenario
  // moved or the user shared a link from a different workspace.
  //
  // GET /_shared/<rest>.html — repo asset under plan-harness/_shared/
  if (req.method === 'GET' && pathname.startsWith('/_shared/') && pathname.endsWith('.html')) {
    const rest = pathname.slice('/_shared/'.length);
    // Sanitise: no .., no leading /. The serveHtmlFile guard re-validates.
    if (rest.includes('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Path traversal not allowed');
      return;
    }
    const candidate = resolve(workspaceRootPath, 'plan-harness', '_shared', rest);
    return serveHtmlFile(req, res, candidate, { fromLoopback });
  }

  // GET /<scenario>/<doc>.html — serve from plan-harness/<scenario>/<doc>.html.
  const docMatch = pathname.match(/^\/([^_/][^/]*)\/([^/]+\.html)$/);
  if (docMatch && req.method === 'GET') {
    const scenarioName = decodeURIComponent(docMatch[1]);
    const docFile = decodeURIComponent(docMatch[2]);
    if (scenarioName.includes('..') || docFile.includes('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Path traversal not allowed');
      return;
    }
    const docPath = resolve(workspaceRootPath, 'plan-harness', scenarioName, docFile);
    try {
      await stat(docPath);
      return serveHtmlFile(req, res, docPath, { fromLoopback });
    } catch {
      // Missing — fall through to the global 404 below.
    }
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

// ---- Comment route helpers ----

function resolveActor(req, fromLoopback) {
  return {
    name: req.user?.name || (fromLoopback ? 'Host (local)' : 'Anonymous'),
    role: fromLoopback ? 'host' : 'reviewer',
  };
}

function rateKey(req) {
  return req.user?.sid || req.socket?.remoteAddress || 'anon';
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendCommentError(res, err) {
  if (err instanceof CommentError) {
    sendJson(res, err.status, { error: err.code, message: err.message });
  } else {
    console.error('[comments] internal error:', err);
    sendJson(res, 500, { error: 'INTERNAL', message: 'internal error' });
  }
}

async function readJsonBody(req, cap = 64 * 1024) {
  return new Promise((resolvePromise, rejectPromise) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > cap) {
        rejectPromise(new CommentError('BAD_REQUEST', 'request body too large', 413));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolvePromise({});
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        rejectPromise(new CommentError('BAD_REQUEST', 'body is not valid JSON', 400));
      }
    });
    req.on('error', rejectPromise);
  });
}

async function handleCommentList(req, res, { scenario, doc }) {
  try {
    const data = await commentMgr.listComments(workspaceRootPath, scenario, doc);
    sendJson(res, 200, data);
  } catch (err) {
    sendCommentError(res, err);
  }
}

async function handleCommentCreate(req, res, { scenario, doc, actor }) {
  try {
    const rate = commentMgr.checkRate(rateKey(req));
    if (!rate.ok) {
      res.setHeader('Retry-After', String(rate.retryAfter));
      return sendJson(res, 429, { error: 'RATE_LIMITED', message: 'too many comments; slow down' });
    }
    const body = await readJsonBody(req);
    const comment = await commentMgr.appendComment(workspaceRootPath, scenario, doc, body, actor);
    // Active-mode auto-dispatch (Phase 8). Under passive mode this is a no-op.
    if (comment.intent === 'revise') {
      const status = await reviseMgr.maybeAutoDispatch(workspaceRootPath, scenario, doc, comment.id, actor);
      if (status.dispatched) comment.reviseStatus = 'dispatched';
    }
    commentMgr.broadcastCommentEvent(scenario, doc, 'create', comment);
    console.error(`[comments] POST ${scenario}/${doc} author=${actor.name} id=${comment.id} intent=${comment.intent}${comment.todoResolves ? ' todoResolves' : ''}`);
    sendJson(res, 201, comment);
  } catch (err) {
    sendCommentError(res, err);
  }
}

async function handleCommentPatch(req, res, { scenario, doc, id, actor }) {
  try {
    const rate = commentMgr.checkRate(rateKey(req));
    if (!rate.ok) {
      res.setHeader('Retry-After', String(rate.retryAfter));
      return sendJson(res, 429, { error: 'RATE_LIMITED', message: 'too many edits; slow down' });
    }
    const body = await readJsonBody(req);
    const updated = await commentMgr.patchComment(workspaceRootPath, scenario, doc, id, body, actor);
    commentMgr.broadcastCommentEvent(scenario, doc, 'patch', updated);
    const field = typeof body.body === 'string' ? 'body' : 'resolved';
    console.error(`[comments] PATCH ${scenario}/${doc} id=${id} field=${field} actor=${actor.name}`);
    sendJson(res, 200, updated);
  } catch (err) {
    sendCommentError(res, err);
  }
}

async function handleCommentDelete(req, res, { scenario, doc, id, actor }) {
  try {
    const rate = commentMgr.checkRate(rateKey(req));
    if (!rate.ok) {
      res.setHeader('Retry-After', String(rate.retryAfter));
      return sendJson(res, 429, { error: 'RATE_LIMITED', message: 'too many deletes; slow down' });
    }
    await commentMgr.deleteComment(workspaceRootPath, scenario, doc, id, actor);
    commentMgr.broadcastCommentEvent(scenario, doc, 'delete', { id });
    console.error(`[comments] DELETE ${scenario}/${doc} id=${id} actor=${actor.name}`);
    res.writeHead(204);
    res.end();
  } catch (err) {
    sendCommentError(res, err);
  }
}

// ---- Revise actions (Phase 8) ----

async function loadCommentById(scenario, doc, id) {
  const data = await commentMgr.listComments(workspaceRootPath, scenario, doc);
  let found = null;
  (function walk(list) {
    for (const c of list) {
      if (c.id === id) { found = c; return; }
      if (c.replies) walk(c.replies);
    }
  })(data.comments || []);
  return found;
}

async function handleReviseAction(req, res, { scenario, doc, id, action, method, actor }) {
  try {
    if (actor.role !== 'host') {
      return sendJson(res, 403, { error: 'FORBIDDEN', message: 'revise flow is host-only' });
    }
    const comment = await loadCommentById(scenario, doc, id);
    if (!comment) {
      return sendJson(res, 404, { error: 'NOT_FOUND', message: 'comment not found' });
    }
    if (comment.intent !== 'revise' && action !== 'proposal') {
      return sendJson(res, 400, { error: 'BAD_REQUEST', message: 'comment is not a revise intent' });
    }

    if (action === 'dispatch' && method === 'POST') {
      await reviseMgr.dispatchRevise(workspaceRootPath, scenario, doc, id, actor);
      commentMgr.broadcastCommentEvent(scenario, doc, 'revise-dispatch', { id });
      console.error(`[comments] REVISE dispatch ${scenario}/${doc} id=${id} actor=${actor.name}`);
      return sendJson(res, 202, { ok: true });
    }
    if (action === 'accept' && method === 'POST') {
      await reviseMgr.acceptProposal(workspaceRootPath, scenario, doc, id, comment.anchor, actor);
      commentMgr.broadcastCommentEvent(scenario, doc, 'revise-accept', { id });
      console.error(`[comments] REVISE accept ${scenario}/${doc} id=${id} actor=${actor.name}`);
      return sendJson(res, 200, { ok: true });
    }
    if (action === 'reject' && method === 'POST') {
      await reviseMgr.rejectProposal(workspaceRootPath, scenario, doc, id, actor);
      commentMgr.broadcastCommentEvent(scenario, doc, 'revise-reject', { id });
      console.error(`[comments] REVISE reject ${scenario}/${doc} id=${id} actor=${actor.name}`);
      return sendJson(res, 200, { ok: true });
    }
    if (action === 'proposal' && method === 'GET') {
      const diff = await reviseMgr.readProposal(workspaceRootPath, scenario, doc, id);
      if (diff == null) return sendJson(res, 404, { error: 'NOT_FOUND', message: 'no proposal on disk yet' });
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(diff);
    }
    return sendJson(res, 400, { error: 'BAD_REQUEST', message: 'unsupported revise action' });
  } catch (err) {
    sendCommentError(res, err);
  }
}

function handleCommentStream(req, res, { scenario, doc }) {
  // SSE: long-lived response, keep-alive via 30s ping from module-level heartbeat.
  try {
    // Validate names up-front so we fail before opening the stream.
    commentMgr.listComments(workspaceRootPath, scenario, doc).catch(() => {});
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    const unregister = commentMgr.registerSseClient(scenario, doc, res);
    console.error(`[comments] SSE connected ${scenario}/${doc}`);
    req.on('close', () => {
      unregister();
      console.error(`[comments] SSE disconnected ${scenario}/${doc}`);
    });
  } catch (err) {
    sendCommentError(res, err);
  }
}

// ---- Route handlers ----

function getWorkspaceName() {
  return workspaceRootPath ? basename(workspaceRootPath) : 'workspace';
}

async function serveIcon(req, res) {
  try {
    const png = await readFile(ICON_PATH);
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    });
    res.end(png);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Icon not found');
  }
}

async function serveDashboard(req, res) {
  const scenarios = await scanScenarios();
  const workspaceName = getWorkspaceName();
  const html = generateDashboard(scenarios, {
    title: 'Plan Dashboard',
    subtitle: `Workspace: ${workspaceRootPath}`,
    meta: `Generated ${new Date().toISOString().slice(0, 10)} | <a href="/api/scenarios">API</a>`,
    workspaceName,
  });

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  res.end(html);
}

async function serveScenarioDetail(req, res, scenarioName) {
  const scenarios = await scanScenarios();
  const scenario = scenarios.find(s => s.name === scenarioName);

  if (!scenario) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end(`Scenario "${scenarioName}" not found`);
    return;
  }

  const workspaceName = getWorkspaceName();
  const html = generateScenarioDetail(scenario, {
    title: scenario.name,
    subtitle: 'Scenario Detail',
    meta: `Generated ${new Date().toISOString().slice(0, 10)}`,
    workspaceName,
  });

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  res.end(html);
}

const ASSET_MIME = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

async function serveAssetFile(req, res, filePath) {
  if (!filePath) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing "path" query parameter');
    return;
  }
  const resolved = resolve(filePath);
  if (resolved !== workspaceRootPath && !resolved.startsWith(workspaceRootPath + sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access denied: path is outside workspace root');
    return;
  }
  const ext = extname(resolved).toLowerCase();
  const mime = ASSET_MIME[ext];
  if (!mime) {
    res.writeHead(415, { 'Content-Type': 'text/plain' });
    res.end(`Unsupported asset type: ${ext}`);
    return;
  }
  try {
    const data = await readFile(resolved);
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'private, max-age=60',
    });
    res.end(data);
  } catch (err) {
    res.writeHead(err.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain' });
    res.end(err.code === 'ENOENT' ? 'Asset not found' : 'Asset read error');
  }
}

async function serveHtmlFile(req, res, filePath, ctx = {}) {
  if (!filePath) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing "path" query parameter');
    return;
  }

  // Resolve and validate path: must be an absolute path under the workspace root.
  // Use path-separator suffix so that /foo/barEvil does not pass when root is /foo/bar.
  const resolved = resolve(filePath);
  if (resolved !== workspaceRootPath && !resolved.startsWith(workspaceRootPath + sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Access denied: path is outside workspace root');
    return;
  }

  const ext = extname(resolved).toLowerCase();
  if (ext !== '.html' && ext !== '.htm') {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Only HTML files can be served');
    return;
  }

  try {
    const raw = await readFile(resolved, 'utf-8');

    const isScenarioDoc = resolved.includes(`${sep}plan-harness${sep}`) &&
                          !resolved.includes(`${sep}_shared${sep}`);
    let metaJson;
    if (isScenarioDoc) {
      try {
        const metaRaw = await readFile(resolved.replace(/\.html?$/i, '.meta.json'), 'utf-8');
        metaJson = JSON.parse(metaRaw);
      } catch { /* meta missing → skip hash check, structural rules still run */ }
    }

    // 0. Un-stick 'SOON' / aria-disabled from plan-tab links whose target file
    //    now exists on disk. Writer bakes these markers at generation time when
    //    siblings are missing; they go stale once siblings land.
    const scenarioDir = resolved.substring(0, resolved.lastIndexOf(sep));
    let siblingSet = new Set();
    try {
      const siblingEntries = await readdir(scenarioDir);
      siblingSet = new Set(siblingEntries.filter(e => /\.html?$/i.test(e)));
    } catch { /* best-effort; if readdir fails, skip normalization */ }
    const withTabsFixed = normalizePlanTabs(raw, siblingSet, scenarioDir);

    // Scenario docs under plan-harness/<scenario>/ (excluding _shared) already
    // ship with the locked GitHub-Dark palette, full chrome, and a <nav.toc>
    // with both .docgroup and .sections. The proxy's legacy chrome override +
    // sidebar-panel injection would double the chrome and override the locked
    // palette with a light theme. Detect via the <script#meta> tag (only
    // self-contained docs embed it) and skip both injectors.
    const isSelfContained = isScenarioDoc && /<script[^>]+id=["']meta["']/i.test(withTabsFixed);
    const withDocChrome = isSelfContained
      ? withTabsFixed
      : normalizeServedDocChrome(withTabsFixed, resolved);

    // 0b. Collapse doubled-up checklist markers (<input type="checkbox"> paired
    //     with a redundant `[x]` / `[ ]` text marker). Syncs `checked` from the
    //     text marker, then strips the text, so only one render stays.
    const withChecklistFixed = normalizeChecklistItems(withDocChrome);

    // 1. Stable content-anchors for the future comment widget (idempotent).
    const withSectionIds = injectSectionIds(withChecklistFixed);

    // 2. Server-supplied context for the widget so it doesn't round-trip /api/me
    //    on every open. `role` today is loopback-or-not; once the auth layer
    //    grows a host-role session it plugs in here without touching /view.
    const { scenarioName, docLabel } = parseScenarioFromPath(resolved);
    const fromLoopback = !!ctx.fromLoopback;
    const meta = {
      workspace: getWorkspaceName(),
      scenario: scenarioName,
      doc: docLabel,
      role: fromLoopback ? 'host' : 'reviewer',
      user: req.user?.name || (fromLoopback ? 'Host (local)' : 'Anonymous'),
    };
    const withMeta = injectPlanMeta(withSectionIds, meta);

    // 3. Sidebar auxiliary panels (TODOs + Comments). Runs on DOMContentLoaded.
    //    v2 docs already have their own nav.toc with section links and don't
    //    want a second sidebar grafted in.
    const withPanels = isSelfContained ? withMeta : injectSidebarPanels(withMeta);



    // 4. Breadcrumb pill (last so it sits above the doc's head metadata).
    const withBreadcrumb = injectBreadcrumbIntoHtml(withPanels, resolved);

    // 5. Rewrite relative image-asset hrefs to /asset?path=<abs> so they
    //    resolve under /view (browser would otherwise resolve them against
    //    /view?path=... → 404), and inject a lightbox widget that intercepts
    //    clicks + adds prev/next navigation.
    const withAssets = normalizeAssetLinks(withBreadcrumb, scenarioDir);
    const withLightbox = injectLightbox(withAssets);

    let lintBanner = '';
    let lintHeader = '';
    if (isScenarioDoc) {
      const docBase = basename(resolved).replace(/\.html?$/i, '');
      const result = lintHtml(withLightbox, { docName: docBase, metaJson });
      const errCount = result.errors.length;
      const warnCount = result.warnings.length;
      lintHeader = `${errCount} error(s), ${warnCount} warning(s)`;
      if (errCount > 0) {
        const items = result.errors
          .map(e => `<li><code>${escapeHtml(e.rule)}</code>: ${escapeHtml(e.message)}</li>`)
          .join('');
        lintBanner = `<div id="__html_lint_banner" style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#f85149;color:#fff;font:13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:10px 16px;border-bottom:2px solid #8b1717;"><strong>html-lint:</strong> ${errCount} structural error(s) — this doc does not satisfy <code>prompts/_html-base.md</code>. <a href="#" onclick="document.getElementById('__html_lint_banner').remove();return false;" style="color:#fff;float:right;font-weight:bold;">×</a><ul style="margin:6px 0 0;padding-left:24px;">${items}</ul></div>`;
      }
    }

    const injected = lintBanner
      ? withLightbox.replace(/<body\b[^>]*>/i, (m) => `${m}${lintBanner}`)
      : withLightbox;

    const headers = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    };
    if (lintHeader) headers['X-HTML-Lint'] = lintHeader;
    res.writeHead(200, headers);
    res.end(injected);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
    } else {
      throw err;
    }
  }
}

/**
 * Parse scenario and document name out of an absolute path that lives under
 * <workspaceRoot>/{plan-harness,plans}/<scenario>/<doc>. Returns
 * { scenarioName, docLabel } with nulls if the path is not under a known root.
 * `_shared/` under plan-harness/ returns scenarioName='_shared' so callers can
 * detect shared-asset routes and skip scenario-only chrome.
 */
function parseScenarioFromPath(absPath) {
  const rel = absPath.startsWith(workspaceRootPath)
    ? absPath.slice(workspaceRootPath.length).replace(/^[\\/]+/, '')
    : absPath;
  const parts = rel.split(/[\\/]/);
  let rootIdx = parts.indexOf('plan-harness');
  if (rootIdx < 0) rootIdx = parts.indexOf('plans');
  if (rootIdx < 0 || rootIdx >= parts.length - 1) return { scenarioName: null, docLabel: null };
  const scenarioName = parts[rootIdx + 1] || null;
  const docFile = parts[parts.length - 1] || '';
  const docLabel = docFile.replace(/\.html?$/i, '') || null;
  return { scenarioName, docLabel };
}

/**
 * Inject a fixed-position breadcrumb bar into HTML served via /view.
 * Self-contained styles (no dependency on the doc's CSS vars). Works
 * whether the doc is light, dark, or has no theme.
 */
function slugifyHeading(text) {
  return String(text)
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-zA-Z#0-9]+;/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

function stripTags(html) {
  return String(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function contentSectionBounds(html) {
  const mainMatch = html.match(/<main\b[^>]*>/i);
  if (!mainMatch) return { start: 0, end: html.length };
  const mainStart = (mainMatch.index || 0) + mainMatch[0].length;
  const mainEnd = html.search(/<\/main>/i);
  const sectionMatch = html.slice(mainStart, mainEnd > mainStart ? mainEnd : undefined).match(/<section\b[^>]*>/i);
  if (!sectionMatch) return { start: mainStart, end: mainEnd > mainStart ? mainEnd : html.length };
  const start = mainStart + (sectionMatch.index || 0) + sectionMatch[0].length;
  const afterStart = html.slice(start);
  const sectionEnd = afterStart.search(/<\/section>/i);
  return { start, end: sectionEnd >= 0 ? start + sectionEnd : (mainEnd > mainStart ? mainEnd : html.length) };
}

function ensureHeadingIds(html) {
  const { start, end } = contentSectionBounds(html);
  const seen = new Map();
  const before = html.slice(0, start);
  const content = html.slice(start, end).replace(/<(h[23])\b([^>]*)>([\s\S]*?)<\/\1>/gi, (match, tag, attrs, inner) => {
    if (/\bid\s*=\s*["'][^"']+["']/i.test(attrs)) return match;
    const base = slugifyHeading(stripTags(inner));
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    const id = count === 1 ? base : `${base}-${count}`;
    return `<${tag}${attrs} id="${id}">${inner}</${tag}>`;
  });
  return `${before}${content}${html.slice(end)}`;
}

function buildSectionsNav(html) {
  const { start, end } = contentSectionBounds(html);
  const links = [];
  html.slice(start, end).replace(/<(h[23])\b([^>]*)>([\s\S]*?)<\/\1>/gi, (_match, tag, attrs, inner) => {
    const id = (attrs.match(/\bid\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (!id) return _match;
    const label = stripTags(inner);
    if (!label) return _match;
    const className = tag.toLowerCase() === 'h3' ? ' class="sub"' : '';
    links.push(`<a${className} href="#${escapeHtml(id)}">${escapeHtml(label)}</a>`);
    return _match;
  });
  return links.length ? links.join('') : '<a href="#overview">Overview</a>';
}

function normalizeSectionsNav(html) {
  const withIds = ensureHeadingIds(html);
  const sections = buildSectionsNav(withIds);
  return withIds.replace(/<div\s+class=["']sections["'][^>]*>[\s\S]*?<\/div>/i, `<div class="sections">${sections}</div>`);
}

function normalizeServedDocChrome(html, filePath) {
  const { scenarioName } = parseScenarioFromPath(filePath);
  if (!scenarioName || scenarioName === '_shared') return html;

  let out = normalizeSectionsNav(html);

  const chromeStyle = `<style id="ph-served-doc-chrome">
html[data-theme="light"] { --bg: #f7f8f8; --panel: #f3f4f5; --panel2: #eeeff1; --border: #d0d6e0; --fg: #08090a; --muted: #62666d; --accent: #5e6ad2; }
html[data-theme="dark"] { --bg: #0d1117; --panel: #161b22; --panel2: #1c2128; --border: #30363d; --fg: #c9d1d9; --muted: #8b949e; --accent: #58a6ff; }
/* Keep the legacy top bar links, but reserve space and hide duplicate crumb. */
header.top {
  position: relative;
  padding-right: 3rem;
  background: color-mix(in srgb, var(--panel) 92%, transparent) !important;
  color: var(--fg) !important;
  border-bottom: 1px solid var(--border) !important;
}
header.top a { color: var(--fg) !important; opacity: 0.82; transition: opacity 0.15s, color 0.15s; }
header.top a:hover { color: var(--accent) !important; opacity: 1; }
header.top .crumb { display: none !important; }
/* Place theme toggle below the top bar so it never overlaps Context/Glossary/ADRs links. */
.theme-toggle { position: fixed; top: 3.2rem; right: 1.25rem; z-index: 10001; background: color-mix(in srgb, var(--panel) 85%, transparent); border: 1px solid var(--border); border-radius: 999px; padding: 0.4rem 0.5rem; cursor: pointer; color: var(--fg); -webkit-backdrop-filter: blur(12px) saturate(180%); backdrop-filter: blur(12px) saturate(180%); display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; }
.theme-toggle:hover { border-color: var(--accent); color: var(--accent); }
.theme-toggle svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.theme-toggle svg[data-theme-icon] { display: none; }
.theme-toggle[data-theme-pref="system"] svg[data-theme-icon="system"], .theme-toggle[data-theme-pref="light"] svg[data-theme-icon="light"], .theme-toggle[data-theme-pref="dark"] svg[data-theme-icon="dark"] { display: block; }
pre.mermaid { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; margin: 1rem 0; }
.mermaid[data-processed="true"] { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; margin: 1rem 0; overflow-x: auto; }
@media (max-width: 899px) { .theme-toggle { top: 3rem; right: 0.75rem; } }
@media print { .theme-toggle { display: none !important; } }
</style>`;

  if (/<style\s+id=["']ph-served-doc-chrome["'][^>]*>[\s\S]*?<\/style>/i.test(out)) {
    out = out.replace(/<style\s+id=["']ph-served-doc-chrome["'][^>]*>[\s\S]*?<\/style>/i, chromeStyle);
  } else {
    out = out.replace(/<\/head>/i, `${getThemeInitScript()}\n${chromeStyle}\n</head>`);
  }
  if (!/\bid\s*=\s*["']themeToggle["']/i.test(out)) {
    out = out.replace(/<body\b[^>]*>/i, (m) => `${m}\n${getThemeToggleHTML()}`);
  }
  const runtime = `<script id="ph-served-doc-runtime">
(function(){
  function forceDocChrome() {
    var root = document.documentElement;
    var sepNodes = document.querySelectorAll('.ph-injected-breadcrumb .sep');
    for (var i = 0; i < sepNodes.length; i++) {
      var n = sepNodes[i];
      n.style.setProperty('display', 'inline-flex', 'important');
      n.style.setProperty('align-self', 'center', 'important');
      n.style.setProperty('align-items', 'center', 'important');
      n.style.setProperty('justify-content', 'center', 'important');
      n.style.setProperty('line-height', '1', 'important');
      n.style.setProperty('transform', 'translateY(-0.5px)', 'important');
      n.style.setProperty('vertical-align', 'middle', 'important');
    }

    var hdr = document.querySelector('header.top');
    if (hdr) {
      var panel = getComputedStyle(root).getPropertyValue('--panel').trim() || '#f3f4f5';
      var fg = getComputedStyle(root).getPropertyValue('--fg').trim() || '#08090a';
      var border = getComputedStyle(root).getPropertyValue('--border').trim() || '#d0d6e0';
      hdr.style.setProperty('background', panel, 'important');
      hdr.style.setProperty('color', fg, 'important');
      hdr.style.setProperty('border-bottom', '1px solid ' + border, 'important');
      var links = hdr.querySelectorAll('a');
      for (var j = 0; j < links.length; j++) {
        links[j].style.setProperty('color', fg, 'important');
      }
    }
  }

  var blocks = Array.prototype.slice.call(document.querySelectorAll('pre.mermaid'));
  if (blocks.length && !window.mermaid) {
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
    script.onload = function(){ if (window.mermaid) { window.mermaid.initialize({ startOnLoad: true, theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'default' : 'dark' }); } };
    document.head.appendChild(script);
  }

  forceDocChrome();
  var themeObserver = new MutationObserver(function(){ forceDocChrome(); });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('click', function(ev){ if (ev.target && ev.target.closest && ev.target.closest('#themeToggle')) setTimeout(forceDocChrome, 0); }, true);
})();
</script>`;
  if (/<script\s+id=["']ph-served-doc-runtime["'][^>]*>[\s\S]*?<\/script>/i.test(out)) {
    out = out.replace(/<script\s+id=["']ph-served-doc-runtime["'][^>]*>[\s\S]*?<\/script>/i, runtime);
  } else {
    out = out.replace(/<\/body>/i, `${getBaseScript()}\n${runtime}\n</body>`);
  }
  return out;
}

function injectBreadcrumbIntoHtml(html, filePath) {
  const { scenarioName, docLabel } = parseScenarioFromPath(filePath);
  if (!scenarioName) return html;

  // Skip injection only if the doc has an actual <nav class="ph-breadcrumb">
  // element — match the class attribute, not CSS rules that merely reference
  // the class. This prevents a stale .ph-breadcrumb CSS block (left behind
  // after we removed the markup) from falsely suppressing injection.
  if (/class\s*=\s*["'][^"']*\bph-breadcrumb\b/.test(html)) return html;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
  const workspaceName = getWorkspaceName();

  // Fixed pill at top-centre, mirroring the base.js .ph-breadcrumb design.
  // Inline styles (no CSS vars) so it renders correctly on docs that don't
  // define the plan-harness palette. Theme follows html[data-theme] (set by
  // the doc's synchronous theme init script) so the pill switches together
  // with the body when the user toggles, instead of drifting to OS preference.
  const bar = `
<nav class="ph-injected-breadcrumb" aria-label="Breadcrumb">
  <a href="/">${esc(workspaceName)}</a>
  <span class="sep" aria-hidden="true">→</span>
  <a href="/scenario/${encodeURIComponent(scenarioName)}">${esc(scenarioName)}</a>
  ${docLabel ? `<span class="sep" aria-hidden="true">→</span><span class="current">${esc(docLabel)}</span>` : ''}
</nav>
<style>
.ph-injected-breadcrumb {
  position: fixed; top: 0.85rem; left: 50%; transform: translateX(-50%); z-index: 10000;
  display: flex; align-items: center; justify-content: center; gap: 0.45rem;
  padding: 0.4rem 0.9rem; border-radius: 999px;
  font: 510 13px/1.2 'Inter Variable', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-feature-settings: "cv01","ss03";
  background: rgba(243,244,245,0.9); color: #62666d;
  border: 1px solid #d0d6e0;
  backdrop-filter: blur(12px) saturate(180%); -webkit-backdrop-filter: blur(12px) saturate(180%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  max-width: calc(100vw - 10rem); overflow: hidden; text-align: center;
}
.ph-injected-breadcrumb a { color: inherit; text-decoration: none; opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 14rem; transition: opacity 0.15s, color 0.15s; }
.ph-injected-breadcrumb a:hover { opacity: 1; color: #7170ff; }
.ph-injected-breadcrumb .sep,
.ph-injected-breadcrumb > .sep {
  color: inherit;
  opacity: 0.5;
  font-size: 0.9em;
  font-weight: 600;
  line-height: 1 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  align-self: center !important;
  min-height: 1em;
  vertical-align: middle;
  transform: translateY(-0.5px) !important;
}
.ph-injected-breadcrumb .current { color: #08090a; font-weight: 590; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 20rem; }

html[data-theme="dark"] .ph-injected-breadcrumb {
  background: rgba(15,16,17,0.85); color: #d0d6e0;
  border-color: rgba(255,255,255,0.08);
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}
html[data-theme="dark"] .ph-injected-breadcrumb .current { color: #f7f8f8; }

@media (max-width: 899px) { .ph-injected-breadcrumb { left: 3.2rem; transform: none; max-width: calc(100vw - 7rem); justify-content: flex-start; } }
@media print { .ph-injected-breadcrumb { display: none !important; } }
</style>`;

  // Insert right after the first <body ...> tag; if none, prepend.
  const bodyMatch = html.match(/<body[^>]*>/i);
  if (bodyMatch) {
    const idx = bodyMatch.index + bodyMatch[0].length;
    return html.slice(0, idx) + bar + html.slice(idx);
  }
  return bar + html;
}

async function serveApiScenarios(req, res) {
  const scenarios = await scanScenarios();
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  res.end(JSON.stringify(scenarios, null, 2));
}

async function serveApiScenarioStatus(req, res, scenarioName) {
  const scenarios = await scanScenarios();
  const scenario = scenarios.find(s => s.name === scenarioName);

  if (!scenario) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Scenario "${scenarioName}" not found` }));
    return;
  }

  const files = scenario.files || [];
  const totalFiles = files.length;
  const existingFiles = files.filter(f => f.exists).length;

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  res.end(JSON.stringify({
    name: scenario.name,
    totalFiles,
    existingFiles,
    missingFiles: totalFiles - existingFiles,
    todos: scenario.todos || 0,
    done: scenario.done || 0,
    files: files.map(f => ({
      type: f.type,
      path: f.path,
      exists: f.exists,
      todos: f.todos || 0,
      done: f.done || 0
    }))
  }, null, 2));
}

// ---- Scenario scanning ----

/**
 * Scan the workspace root for a plans/ directory and discover scenarios.
 * A scenario is a subdirectory under plans/ containing plan HTML files.
 * Plan files are identified by their naming pattern. Supports two conventions:
 *   Bare filenames (generated by skills): design.html, test-plan.html, state-machine.html, etc.
 *   Prefixed filenames (legacy): <scenario-name>-design.html, <scenario-name>-test-plan.html, etc.
 *
 * Also supports a flat layout where plan files are directly in plans/ with a
 * common prefix as the scenario name.
 *
 * @returns {Promise<Array>} Array of scenario objects.
 */
async function scanScenarios() {
  const scenarioMap = new Map();

  for (const rootName of ['plan-harness', 'plans']) {
    const rootDir = join(workspaceRootPath, rootName);
    let entries;
    try {
      await stat(rootDir);
      entries = await readdir(rootDir, { withFileTypes: true });
    } catch {
      continue;
    }

    const subdirScenarios = [];
    const flatFiles = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === '_shared') continue;
      if (entry.isDirectory()) {
        const scenario = await scanScenarioDir(entry.name, join(rootDir, entry.name));
        if (scenario) subdirScenarios.push(scenario);
      } else if (rootName === 'plans' && entry.isFile() && extname(entry.name).toLowerCase() === '.html') {
        flatFiles.push(entry.name);
      }
    }

    const scenarios = subdirScenarios.length > 0
      ? subdirScenarios
      : rootName === 'plans'
        ? groupFlatFilesIntoScenarios(flatFiles, rootDir)
        : [];

    for (const scenario of scenarios) {
      if (!scenarioMap.has(scenario.name)) scenarioMap.set(scenario.name, scenario);
    }
  }

  return [...scenarioMap.values()];
}

async function scanScenarioDir(name, dirPath) {
  const planTypes = [
    { type: 'product', suffixes: ['product.html'] },
    { type: 'analysis', suffixes: ['analysis.html', '-analysis.html'] },
    { type: 'design', suffixes: ['design.html', '-design.html', '-design-concise.html'] },
    { type: 'state-machine', suffixes: ['state-machine.html', '-state-machine.html', '-state-machines.html'] },
    { type: 'test-spec', suffixes: ['test-spec.html'] },
    { type: 'implementation', suffixes: ['implementation.html', 'implementation-plan.html', '-implementation-plan.html', '-impl-plan.html'] },
    { type: 'test-report', suffixes: ['test-report.html', '-test-report.html'] }
  ];

  let entries;
  try {
    entries = await readdir(dirPath);
  } catch {
    return null;
  }

  const files = [];
  for (const pt of planTypes) {
    let found = false;
    for (const suffix of pt.suffixes) {
      const matching = entries.find(e => e.toLowerCase().endsWith(suffix));
      if (matching) {
        const filePath = join(dirPath, matching);
        const { todos, done } = await estimateFileCompletion(filePath);
        files.push({ type: pt.type, path: filePath, exists: true, todos, done });
        found = true;
        break;
      }
    }
    if (!found) {
      files.push({ type: pt.type, path: join(dirPath, `${pt.type}.html`), exists: false, todos: 0, done: 0 });
    }
  }

  const totalTodos = files.reduce((s, f) => s + (f.todos || 0), 0);
  const totalDone = files.reduce((s, f) => s + (f.done || 0), 0);

  // Per-doc unresolved comment counts. Read the JSONL for every existing
  // doc in the scenario and collapse to comments; sum non-deleted + unresolved.
  // Folds the counts onto each file object so the scenario detail view can
  // show them inline, and also rolls up to a scenario-level total.
  let totalUnresolved = 0;
  for (const f of files) {
    if (!f.exists) { f.unresolvedComments = 0; continue; }
    const docSlug = basename(f.path, extname(f.path));
    try {
      const data = await commentMgr.listComments(workspaceRootPath, name, docSlug);
      const count = countUnresolved(data.comments || []);
      f.unresolvedComments = count;
      totalUnresolved += count;
    } catch {
      f.unresolvedComments = 0;
    }
  }

  // Try to find description from a metadata.json or the first file
  const description = await readScenarioDescription(dirPath);

  return {
    name,
    path: dirPath,
    description: description || '',
    workItem: '',
    files,
    todos: totalTodos,
    done: totalDone,
    unresolvedComments: totalUnresolved
  };
}

// Recursively count unresolved, non-deleted comments across a thread tree.
function countUnresolved(comments) {
  let n = 0;
  for (const c of comments) {
    if (!c.deleted && !c.resolved) n += 1;
    if (c.replies && c.replies.length) n += countUnresolved(c.replies);
  }
  return n;
}

function groupFlatFilesIntoScenarios(fileNames, plansDir) {
  const suffixes = [
    '-analysis.html',
    '-design.html', '-design-concise.html', '-test-plan.html', '-e2e-test-plan.html',
    '-state-machine.html', '-state-machines.html', '-test-cases.html',
    '-impl-plan.html', '-implementation-plan.html',
    '-review-report.html',
    '-test-report.html'
  ];

  const planTypeMap = {
    '-analysis.html': 'analysis',
    '-design.html': 'design',
    '-design-concise.html': 'design',
    '-test-plan.html': 'test-plan',
    '-e2e-test-plan.html': 'test-plan',
    '-state-machine.html': 'state-machine',
    '-state-machines.html': 'state-machine',
    '-test-cases.html': 'test-cases',
    '-impl-plan.html': 'implementation-plan',
    '-implementation-plan.html': 'implementation-plan',
    '-review-report.html': 'review-report',
    '-test-report.html': 'test-report'
  };

  // Extract prefixes
  const prefixMap = new Map();

  for (const fileName of fileNames) {
    const lower = fileName.toLowerCase();
    let matchedSuffix = null;
    for (const suffix of suffixes) {
      if (lower.endsWith(suffix)) {
        matchedSuffix = suffix;
        break;
      }
    }

    if (matchedSuffix) {
      const prefix = fileName.slice(0, fileName.length - matchedSuffix.length);
      if (!prefixMap.has(prefix)) {
        prefixMap.set(prefix, []);
      }
      prefixMap.get(prefix).push({
        type: planTypeMap[matchedSuffix],
        fileName,
        path: join(plansDir, fileName),
        exists: true
      });
    }
  }

  // Build scenario objects
  const scenarios = [];
  // Must match the `type` keys emitted via planTypeMap above and the planTypes
  // array in templates/base.js. Order = canonical workflow (prompts/_workflow.md).
  const allPlanTypes = ['product', 'analysis', 'design', 'state-machine', 'test-spec', 'implementation', 'test-report'];

  for (const [prefix, foundFiles] of prefixMap) {
    const files = allPlanTypes.map(type => {
      const found = foundFiles.find(f => f.type === type);
      if (found) {
        return { type, path: found.path, exists: true, todos: 0, done: 0 };
      }
      return { type, path: join(plansDir, `${prefix}-${type}.html`), exists: false, todos: 0, done: 0 };
    });

    scenarios.push({
      name: prefix,
      path: plansDir,
      description: '',
      workItem: '',
      files,
      todos: 0,
      done: 0
    });
  }

  return scenarios;
}

/**
 * Count TODO + done markers in an HTML plan doc.
 *
 * Uses the same three-marker contract as the /view sidebar TODO panel
 * (see plans/built-in-comment-ui/design.html §6.3):
 *   1. `TODO:` / `FIXME:` inline text       -> counts as 1 todo
 *   2. <li>[ ]...</li> (open) / [x] (done)  -> todo / done
 *   3. <input type="checkbox">              -> unchecked = todo, checked = done
 *
 * Returning raw counts (not a percentage) lets the dashboard show "3 todo /
 * 5 done" honestly. Docs with no markers show as "— / —" rather than a
 * meaningless 50% estimate.
 *
 * @param {string} filePath
 * @returns {Promise<{todos: number, done: number}>}
 */
async function estimateFileCompletion(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    let todos = 0;
    let done = 0;

    // Pattern 1: TODO: / FIXME: text (ASCII : or full-width ：). Each match
    // is one open item — there's no "done" form of this pattern.
    const inlineTodos = content.match(/\b(TODO|FIXME)\s*[:：]\s*.{2,}/g);
    if (inlineTodos) todos += inlineTodos.length;

    // Pattern 2: <li>[ ] ...</li> and <li>[x] ...</li>. Allow any attrs on
    // the li and trim leading whitespace inside.
    const openLi = content.match(/<li[^>]*>\s*\[\s\]/g);
    const doneLi = content.match(/<li[^>]*>\s*\[[xX]\]/g);
    if (openLi) todos += openLi.length;
    if (doneLi) done += doneLi.length;

    // Pattern 3: <input type="checkbox">. `checked` presence flips it.
    const allChecks = content.match(/<input[^>]*type=["']checkbox["'][^>]*>/g) || [];
    for (const input of allChecks) {
      if (/\bchecked\b/.test(input)) done += 1;
      else todos += 1;
    }

    return { todos, done };
  } catch {
    return { todos: 0, done: 0 };
  }
}

/**
 * Read scenario description from metadata.json if it exists.
 * @param {string} dirPath
 * @returns {Promise<string|null>}
 */
async function readScenarioDescription(dirPath) {
  try {
    // Support both manifest.json (created by skills/MCP tools) and metadata.json
    let metaPath = join(dirPath, 'manifest.json');
    try { await stat(metaPath); } catch { metaPath = join(dirPath, 'metadata.json'); }
    const content = await readFile(metaPath, 'utf-8');
    const meta = JSON.parse(content);
    return meta.description || null;
  } catch {
    return null;
  }
}

// ---- Password protection helpers ----

function parseCookie(cookieHeader, name) {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function serveLoginPage(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const errorCode = parsedUrl.searchParams.get('error'); // 'bad' | 'rate' | null
  const retryAfter = parsedUrl.searchParams.get('retry'); // seconds
  // Convenience: ?reviewer=alice pre-fills the name field so a host can
  // personalize share links, e.g. https://…/?reviewer=Alice
  const suggestedName = parsedUrl.searchParams.get('reviewer') || '';

  let errorHtml = '';
  if (errorCode === 'bad') {
    errorHtml = `<div class="error">Incorrect password. Try again.</div>`;
  } else if (errorCode === 'rate') {
    const secs = Math.max(1, parseInt(retryAfter || '0', 10));
    errorHtml = `<div class="error">Too many attempts. Try again in ~${secs}s.</div>`;
  }

  // Login page uses the same Linear-inspired palette + shared theme key as the
  // rest of plan-harness. The inline init script resolves system/light/dark
  // from localStorage (shared across the whole plugin) before body paints.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Plan Dashboard — Sign in</title>
<link rel="icon" type="image/png" href="/icon.png">
<script>
(function(){
  try {
    var KEY='plan-harness-theme';
    var pref=localStorage.getItem(KEY)||'system';
    var dark=pref==='dark'||(pref==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark?'dark':'light');
  } catch(e) {}
})();
</script>
<style>
  :root {
    --bg: #f7f8f8; --surface: #f3f4f5; --border: #d0d6e0;
    --text: #08090a; --muted: #62666d; --accent: #5e6ad2; --red: #cf222e;
    --shadow-lg: 0 4px 16px rgba(0,0,0,0.08);
  }
  [data-theme="dark"] {
    --bg: #08090a; --surface: #0f1011; --border: rgba(255,255,255,0.08);
    --text: #f7f8f8; --muted: #8a8f98; --accent: #7170ff; --red: #f85149;
    --shadow-lg: 0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { font-feature-settings: "cv01","ss03"; }
  body { font-family: 'Inter Variable', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 1rem; letter-spacing: -0.01em; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 2.25rem; width: 100%; max-width: 380px; box-shadow: var(--shadow-lg); }
  h1 { font-size: 1.25rem; font-weight: 510; letter-spacing: -0.02em; margin-bottom: 0.35rem; }
  .lede { color: var(--muted); font-size: 0.85rem; margin-bottom: 1.25rem; line-height: 1.5; }
  label { display: block; font-size: 0.8rem; color: var(--muted); margin-bottom: 0.35rem; }
  input { width: 100%; padding: 0.65rem 0.85rem; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: 0.95rem; margin-bottom: 0.9rem; outline: none; font-family: inherit; transition: border-color 0.15s; }
  input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(94,106,210,0.15); }
  button { width: 100%; padding: 0.7rem; background: var(--accent); color: #ffffff; border: none; border-radius: 6px; font-size: 0.95rem; font-weight: 510; cursor: pointer; margin-top: 0.35rem; font-family: inherit; letter-spacing: -0.005em; transition: filter 0.15s; }
  button:hover { filter: brightness(1.1); }
  .error { color: var(--red); font-size: 0.82rem; margin-bottom: 0.9rem; background: rgba(207,34,46,0.08); border: 1px solid rgba(207,34,46,0.25); padding: 0.5rem 0.7rem; border-radius: 6px; }
  [data-theme="dark"] .error { background: rgba(248,81,73,0.1); border-color: rgba(248,81,73,0.25); }
  .note { color: var(--muted); font-size: 0.75rem; margin-top: 0.9rem; text-align: center; }
</style>
</head>
<body>
<div class="card">
  <h1>Plan Dashboard</h1>
  <p class="lede">Enter the password shared with you, and a name to display on your comments.</p>
  ${errorHtml}
  <form method="POST" action="/_auth/login" autocomplete="off">
    <label for="name">Your name</label>
    <input id="name" type="text" name="name" placeholder="e.g. Alice" value="${escapeHtml(suggestedName)}" maxlength="80" autofocus required>
    <label for="password">Password</label>
    <input id="password" type="password" name="password" placeholder="Password from host" required>
    <button type="submit">Continue</button>
  </form>
  <p class="note">Your name is used only to attribute your comments.</p>
</div>
</body>
</html>`;

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(html);
}

async function handleLogin(req, res) {
  const clientIp = req.socket?.remoteAddress || 'unknown';

  // Rate-limit before reading body so attackers pay an earlier cost.
  const rate = auth.checkRate(clientIp);
  if (!rate.allowed) {
    const secs = Math.ceil(rate.retryAfterMs / 1000);
    res.writeHead(302, {
      Location: `/_auth/login?error=rate&retry=${secs}`,
      'Retry-After': String(secs),
    });
    res.end();
    return;
  }

  // Read the body with a hard cap to avoid memory abuse.
  const MAX_BODY = 4096;
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY) {
      res.writeHead(413, { 'Content-Type': 'text/plain' });
      res.end('Payload too large');
      return;
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  const params = new URLSearchParams(body);
  const submittedPassword = params.get('password') || '';
  const submittedName = params.get('name') || '';

  if (!auth.verifyPassword(submittedPassword)) {
    auth.recordAttempt(clientIp, false);
    res.writeHead(302, { Location: '/_auth/login?error=bad' });
    res.end();
    return;
  }

  auth.recordAttempt(clientIp, true);
  const { cookieValue } = auth.createSession(submittedName);

  // Cookie is sent only to same site, only to the server, only over https.
  // Max-Age is a browser hint — true expiry is enforced server-side in auth.js.
  const cookie = [
    `${COOKIE_NAME}=${cookieValue}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Secure',
    'Max-Age=7200',
  ].join('; ');

  res.writeHead(302, { 'Set-Cookie': cookie, Location: '/' });
  res.end();
}
