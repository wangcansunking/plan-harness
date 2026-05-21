#!/usr/bin/env node
// lint-cli.js — batch-lint v2 HTML docs.
//
// Usage:
//   node src/lint-cli.js                                 # default: all plan-harness/**/*.html in repo
//   node src/lint-cli.js path/to/file.html ...           # explicit list
//   node src/lint-cli.js --workspace /some/repo          # scan a different workspace
//   node src/lint-cli.js --warn-as-error                 # exit 1 on warnings too
//
// Exit codes:
//   0 — all clean
//   1 — one or more errors (or warnings under --warn-as-error)
//   2 — usage error

import { basename, resolve, sep, dirname } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { lintFile, formatReport } from './html-lint.js';

const __filename = fileURLToPath(import.meta.url);
const localProxyDir = dirname(dirname(__filename)); // src/.. = local-proxy
const repoRoot = dirname(localProxyDir);

const args = process.argv.slice(2);
let workspaceRoot = repoRoot;
let warnAsError = false;
const explicitPaths = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--workspace') {
    workspaceRoot = resolve(args[++i] || '.');
  } else if (a === '--warn-as-error') {
    warnAsError = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(`Usage: lint-cli.js [--workspace DIR] [--warn-as-error] [file.html ...]\n`);
    process.exit(0);
  } else if (a.startsWith('--')) {
    process.stderr.write(`Unknown flag: ${a}\n`);
    process.exit(2);
  } else {
    explicitPaths.push(resolve(a));
  }
}

async function walkDir(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue; // skip dot dirs (.test-evidence, .git, ...)
    if (e.name === 'node_modules') continue;
    const p = dir + sep + e.name;
    if (e.isDirectory()) {
      await walkDir(p, out);
    } else if (/\.html?$/i.test(e.name)) {
      out.push(p);
    }
  }
}

async function collectTargets() {
  if (explicitPaths.length) return explicitPaths;
  const collected = [];
  for (const root of ['plan-harness', 'plans']) {
    const dir = workspaceRoot + sep + root;
    try {
      await stat(dir);
      await walkDir(dir, collected);
    } catch { /* root doesn't exist, skip */ }
  }
  return collected;
}

const targets = await collectTargets();
if (targets.length === 0) {
  process.stdout.write(`No HTML files found under ${workspaceRoot}/{plan-harness,plans}\n`);
  process.exit(0);
}

let totalErrors = 0;
let totalWarnings = 0;
let filesWithFindings = 0;

function lintCtxFor(absPath) {
  const docName = basename(absPath).replace(/\.html?$/i, '');
  const parts = absPath.split(sep);
  const phIdx = parts.indexOf('plan-harness');
  if (phIdx >= 0 && parts[phIdx + 1] === '_shared') {
    return { docName, skipRules: ['L1-docgroup', 'L1-active'] };
  }
  return { docName };
}

for (const p of targets) {
  const result = await lintFile(p, lintCtxFor(p));
  if (result.errors.length || result.warnings.length) {
    filesWithFindings += 1;
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
    process.stdout.write(formatReport(p, result) + '\n\n');
  }
}

const summary = `${targets.length} file(s) checked · ${filesWithFindings} with findings · ${totalErrors} error(s) · ${totalWarnings} warning(s)`;
process.stdout.write(summary + '\n');

if (totalErrors > 0 || (warnAsError && totalWarnings > 0)) {
  process.exit(1);
}
process.exit(0);
