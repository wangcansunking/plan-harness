// plan-harness/local-proxy/src/web-server.js
// Local HTTP server that serves the plan dashboard and individual plan files.
// Uses only node:http, node:fs, node:path, node:url (no external deps).

import { createServer } from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename, extname, resolve, sep } from 'node:path';
import { URL } from 'node:url';
import {
  generateDashboard,
  generateScenarioDetail,
  injectSectionIds,
  injectPlanMeta
} from './templates/base.js';
import * as auth from './auth.js';

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
  if (server) {
    return getDashboardUrl();
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
        rejectPromise(err);
      }
    });

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
  // Loopback bypass: if the request came from the host machine itself, no auth
  // is needed — the protection is only meaningful when the dashboard is shared
  // externally via a tunnel. This keeps the local UX frictionless.
  const fromLoopback = auth.isLoopback(req.socket?.remoteAddress);

  // The login POST is the sole entry point into authentication and must be
  // reachable regardless of loopback status so the form on the login page
  // can always submit successfully.
  if (auth.isEnabled() && pathname === '/_auth/login' && req.method === 'POST') {
    return handleLogin(req, res);
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

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

// ---- Route handlers ----

function getWorkspaceName() {
  return workspaceRootPath ? basename(workspaceRootPath) : 'workspace';
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

    // 1. Stable content-anchors for the future comment widget (idempotent).
    const withSectionIds = injectSectionIds(raw);

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

    // 3. Breadcrumb pill (last so it sits above the doc's head metadata).
    const injected = injectBreadcrumbIntoHtml(withMeta, resolved);

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
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
 * <workspaceRoot>/plans/<scenario>/<doc>. Returns { scenarioName, docLabel }
 * with nulls if the path is not under plans/.
 */
function parseScenarioFromPath(absPath) {
  const rel = absPath.startsWith(workspaceRootPath)
    ? absPath.slice(workspaceRootPath.length).replace(/^[\\/]+/, '')
    : absPath;
  const parts = rel.split(/[\\/]/);
  const plansIdx = parts.indexOf('plans');
  if (plansIdx < 0 || plansIdx >= parts.length - 1) return { scenarioName: null, docLabel: null };
  const scenarioName = parts[plansIdx + 1] || null;
  const docFile = parts[parts.length - 1] || '';
  const docLabel = docFile.replace(/\.html?$/i, '') || null;
  return { scenarioName, docLabel };
}

/**
 * Inject a fixed-position breadcrumb bar into HTML served via /view.
 * Self-contained styles (no dependency on the doc's CSS vars). Works
 * whether the doc is light, dark, or has no theme.
 */
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
  <span class="sep">›</span>
  <a href="/scenario/${encodeURIComponent(scenarioName)}">${esc(scenarioName)}</a>
  ${docLabel ? `<span class="sep">›</span><span class="current">${esc(docLabel)}</span>` : ''}
</nav>
<style>
.ph-injected-breadcrumb {
  position: fixed; top: 0.85rem; left: 50%; transform: translateX(-50%); z-index: 10000;
  display: flex; align-items: center; gap: 0.45rem;
  padding: 0.4rem 0.9rem; border-radius: 999px;
  font: 510 13px/1.2 'Inter Variable', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-feature-settings: "cv01","ss03";
  background: rgba(243,244,245,0.9); color: #62666d;
  border: 1px solid #d0d6e0;
  backdrop-filter: blur(12px) saturate(180%); -webkit-backdrop-filter: blur(12px) saturate(180%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  max-width: calc(100vw - 10rem); overflow: hidden;
}
.ph-injected-breadcrumb a { color: inherit; text-decoration: none; opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 14rem; transition: opacity 0.15s, color 0.15s; }
.ph-injected-breadcrumb a:hover { opacity: 1; color: #7170ff; }
.ph-injected-breadcrumb .sep { opacity: 0.4; }
.ph-injected-breadcrumb .current { color: #08090a; font-weight: 590; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 20rem; }

html[data-theme="dark"] .ph-injected-breadcrumb {
  background: rgba(15,16,17,0.85); color: #d0d6e0;
  border-color: rgba(255,255,255,0.08);
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}
html[data-theme="dark"] .ph-injected-breadcrumb .current { color: #f7f8f8; }

@media (max-width: 899px) { .ph-injected-breadcrumb { left: 3.2rem; transform: none; max-width: calc(100vw - 7rem); } }
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
  const completion = scenario.completion || 0;

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  res.end(JSON.stringify({
    name: scenario.name,
    totalFiles,
    existingFiles,
    missingFiles: totalFiles - existingFiles,
    completion,
    files: files.map(f => ({
      type: f.type,
      path: f.path,
      exists: f.exists,
      completion: f.completion || 0
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
  const plansDir = join(workspaceRootPath, 'plans');

  try {
    await stat(plansDir);
  } catch {
    return [];
  }

  const entries = await readdir(plansDir, { withFileTypes: true });

  // Check for subdirectory-based scenarios
  const subdirScenarios = [];
  const flatFiles = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Subdirectory = scenario
      const scenario = await scanScenarioDir(entry.name, join(plansDir, entry.name));
      if (scenario) subdirScenarios.push(scenario);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.html') {
      flatFiles.push(entry.name);
    }
  }

  // If we have subdirectory scenarios, return those
  if (subdirScenarios.length > 0) {
    return subdirScenarios;
  }

  // Otherwise, try to group flat files into scenarios by prefix
  return groupFlatFilesIntoScenarios(flatFiles, plansDir);
}

async function scanScenarioDir(name, dirPath) {
  // Support both bare filenames (generated by skills: design.html)
  // and prefixed filenames (existing files: perm-gov-design.html)
  const planTypes = [
    { type: 'analysis', suffixes: ['analysis.html', '-analysis.html'] },
    { type: 'design', suffixes: ['design.html', '-design.html', '-design-concise.html'] },
    { type: 'test-plan', suffixes: ['test-plan.html', '-test-plan.html', '-e2e-test-plan.html'] },
    { type: 'state-machine', suffixes: ['state-machine.html', '-state-machine.html', '-state-machines.html'] },
    { type: 'test-cases', suffixes: ['test-cases.html', '-test-cases.html'] },
    { type: 'implementation-plan', suffixes: ['implementation-plan.html', '-implementation-plan.html', '-impl-plan.html'] },
    { type: 'review-report', suffixes: ['review-report.html', '-review-report.html'] }
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
        const completion = await estimateFileCompletion(filePath);
        files.push({ type: pt.type, path: filePath, exists: true, completion });
        found = true;
        break;
      }
    }
    if (!found) {
      files.push({ type: pt.type, path: join(dirPath, `${name}-${pt.type}.html`), exists: false, completion: 0 });
    }
  }

  const existingFiles = files.filter(f => f.exists);
  const completion = existingFiles.length > 0
    ? Math.round(existingFiles.reduce((s, f) => s + f.completion, 0) / files.length)
    : 0;

  // Try to find description from a metadata.json or the first file
  const description = await readScenarioDescription(dirPath);

  return {
    name,
    path: dirPath,
    description: description || '',
    workItem: '',
    files,
    completion
  };
}

function groupFlatFilesIntoScenarios(fileNames, plansDir) {
  const suffixes = [
    '-analysis.html',
    '-design.html', '-design-concise.html', '-test-plan.html', '-e2e-test-plan.html',
    '-state-machine.html', '-state-machines.html', '-test-cases.html',
    '-impl-plan.html', '-implementation-plan.html',
    '-review-report.html'
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
    '-review-report.html': 'review-report'
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
  const allPlanTypes = ['design', 'test-plan', 'state-machines', 'test-cases', 'impl-plan'];

  for (const [prefix, foundFiles] of prefixMap) {
    const files = allPlanTypes.map(type => {
      const found = foundFiles.find(f => f.type === type);
      if (found) {
        return { type, path: found.path, exists: true, completion: 50 }; // Estimate
      }
      return { type, path: join(plansDir, `${prefix}-${type}.html`), exists: false, completion: 0 };
    });

    const existingCount = files.filter(f => f.exists).length;
    const completion = Math.round((existingCount / files.length) * 100);

    scenarios.push({
      name: prefix,
      path: plansDir,
      description: '',
      workItem: '',
      files,
      completion
    });
  }

  return scenarios;
}

/**
 * Estimate file completion based on content analysis.
 * Looks for checkboxes and their checked state.
 * @param {string} filePath
 * @returns {Promise<number>} Completion percentage 0-100.
 */
async function estimateFileCompletion(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');

    // Count checkboxes (input type=checkbox)
    const checkboxes = (content.match(/type=["']checkbox["']/g) || []).length;
    if (checkboxes === 0) {
      // No checkboxes: if the file exists and has substantial content, assume partially complete
      return content.length > 1000 ? 50 : 10;
    }

    // Count checked checkboxes
    const checked = (content.match(/type=["']checkbox["'][^>]*checked/g) || []).length;
    return Math.round((checked / checkboxes) * 100);
  } catch {
    return 0;
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
