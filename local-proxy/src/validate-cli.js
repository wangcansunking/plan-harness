#!/usr/bin/env node
// validate-cli.js — batch cross-doc validator for plan-harness meta.json files.
//
// Usage:
//   node src/validate-cli.js                                # all plan-harness/**/<doc>.meta.json
//   node bin/validate.mjs                                   # bundled standalone (no npm install)
//   node bin/validate.mjs path/to/design.meta.json ...      # explicit list
//   node bin/validate.mjs --workspace /some/repo            # scan a different workspace
//   node bin/validate.mjs --warn-as-error                   # exit 1 on warnings too
//
// Exit codes:
//   0 — all clean
//   1 — one or more errors (or warnings under --warn-as-error)
//   2 — usage error

import { basename, resolve, sep, dirname } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateDoc, formatValidateReport } from './meta-validate.js';

const __filename = fileURLToPath(import.meta.url);
const localProxyDir = dirname(dirname(__filename));
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
    process.stdout.write(`Usage: validate-cli.js [--workspace DIR] [--warn-as-error] [file.meta.json ...]\n`);
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
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (e.name === 'node_modules') continue;
    const p = dir + sep + e.name;
    if (e.isDirectory()) {
      await walkDir(p, out);
    } else if (/\.meta\.json$/i.test(e.name)) {
      out.push(p);
    }
  }
}

async function collectTargets() {
  if (explicitPaths.length) return explicitPaths;
  const collected = [];
  const dir = workspaceRoot + sep + 'plan-harness';
  try { await stat(dir); await walkDir(dir, collected); } catch { /* no plan-harness/ dir */ }
  return collected;
}

const targets = await collectTargets();
if (targets.length === 0) {
  process.stdout.write(`No meta.json files found under ${workspaceRoot}/plan-harness\n`);
  process.exit(0);
}

let totalErrors = 0;
let totalWarnings = 0;
let filesWithFindings = 0;

for (const p of targets) {
  const htmlPath = p.replace(/\.meta\.json$/i, '.html');
  const result = await validateDoc(p, htmlPath);
  if (result.errors.length || result.warnings.length) {
    filesWithFindings += 1;
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
    process.stdout.write(formatValidateReport(p, result) + '\n\n');
  }
}

process.stdout.write(`${targets.length} meta.json file(s) checked · ${filesWithFindings} with findings · ${totalErrors} error(s) · ${totalWarnings} warning(s)\n`);

if (totalErrors > 0 || (warnAsError && totalWarnings > 0)) process.exit(1);
process.exit(0);
