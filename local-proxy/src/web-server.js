// plan-harness/local-proxy/src/web-server.js
// Local HTTP server that serves the plan dashboard and individual plan files.
// Uses only node:http, node:fs, node:path, node:url (no external deps).

import { createServer } from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, basename, extname, resolve } from 'node:path';
import { URL } from 'node:url';
import {
  generateDashboard,
  generateScenarioDetail
} from './templates/base.js';

let server = null;
let serverPort = null;
let workspaceRootPath = null;

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

// ---- Internal request handling ----

async function handleRequest(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // CORS headers for local development
  res.setHeader('Access-Control-Allow-Origin', '*');

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
    return serveHtmlFile(req, res, filePath);
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

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

// ---- Route handlers ----

async function serveDashboard(req, res) {
  const scenarios = await scanScenarios();
  const html = generateDashboard(scenarios, {
    title: 'Plan Dashboard',
    subtitle: `Workspace: ${workspaceRootPath}`,
    meta: `Generated ${new Date().toISOString().slice(0, 10)} | <a href="/api/scenarios">API</a>`
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

  const html = generateScenarioDetail(scenario, {
    title: scenario.name,
    subtitle: 'Scenario Detail',
    meta: `<a href="/">Back to Dashboard</a> | Generated ${new Date().toISOString().slice(0, 10)}`
  });

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache'
  });
  res.end(html);
}

async function serveHtmlFile(req, res, filePath) {
  if (!filePath) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing "path" query parameter');
    return;
  }

  // Resolve and validate path: must be an absolute path under the workspace root
  const resolved = resolve(filePath);
  if (!resolved.startsWith(workspaceRootPath)) {
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
    const content = await readFile(resolved, 'utf-8');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
    } else {
      throw err;
    }
  }
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
