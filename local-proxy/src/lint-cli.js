#!/usr/bin/env node
// lint-cli.js — batch-lint v2 HTML docs.
//
// Usage:
//   node src/lint-cli.js                                 # from source (requires `npm install`)
//   node bin/lint.mjs                                    # from the bundled standalone build (no install needed)
//   node bin/lint.mjs path/to/file.html ...              # explicit list
//   node bin/lint.mjs --workspace /some/repo             # scan a different workspace
//   node bin/lint.mjs --warn-as-error                    # exit 1 on warnings too
//   node bin/lint.mjs --fix                              # apply mechanical auto-fixes in place
//   node bin/lint.mjs --fix --dry-run                    # report what would be fixed, write nothing
//
// The bundled bin/lint.mjs is produced by `npm run build:lint` and ships in the
// plugin cache so end users can lint without running `npm install` in the cache.
//
// Exit codes:
//   0 — all clean
//   1 — one or more errors (or warnings under --warn-as-error)
//   2 — usage error

import { basename, resolve, sep, dirname } from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { lintFile, formatReport, fixHtml } from './html-lint.js';
import { readFile, writeFile } from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const localProxyDir = dirname(dirname(__filename)); // src/.. = local-proxy
const repoRoot = dirname(localProxyDir);

const args = process.argv.slice(2);
let workspaceRoot = repoRoot;
let warnAsError = false;
let autoFix = false;
let dryRun = false;
const explicitPaths = [];

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--workspace') {
    workspaceRoot = resolve(args[++i] || '.');
  } else if (a === '--warn-as-error') {
    warnAsError = true;
  } else if (a === '--fix') {
    autoFix = true;
  } else if (a === '--dry-run') {
    dryRun = true;
  } else if (a === '--help' || a === '-h') {
    process.stdout.write(`Usage: lint-cli.js [--workspace DIR] [--warn-as-error] [--fix [--dry-run]] [file.html ...]\n`);
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

let totalFixed = 0;
let filesWritten = 0;

for (const p of targets) {
  const ctx = lintCtxFor(p);
  // For --fix we need the meta auto-loaded; lintFile already does that, but
  // fixHtml needs it explicitly. Pre-load via lintFile to share the path.
  if (autoFix && !ctx.metaJson) {
    try {
      const metaPath = p.replace(/\.html?$/i, '.meta.json');
      const metaRaw = await readFile(metaPath, 'utf-8');
      ctx.metaJson = JSON.parse(metaRaw);
    } catch { /* no meta — skip L3-meta-embed fix */ }
  }

  if (autoFix) {
    const html = await readFile(p, 'utf-8');
    const result = fixHtml(html, ctx);
    if (result.fixed.length > 0) {
      totalFixed += result.fixed.length;
      const verb = dryRun ? 'would fix' : 'fixed';
      process.stdout.write(`${p}\n`);
      for (const f of result.fixed) process.stdout.write(`  [${verb.toUpperCase()}] ${f}\n`);
      if (!dryRun) {
        await writeFile(p, result.html, 'utf-8');
        filesWritten += 1;
      }
    }
    // Always print residual lint errors (what auto-fix couldn't reach).
    if (result.unfixed.length > 0) {
      filesWithFindings += 1;
      totalErrors += result.unfixed.length;
      if (result.fixed.length === 0) process.stdout.write(`${p}\n`);
      for (const e of result.unfixed) {
        process.stdout.write(`  [ERROR] ${e.rule}: ${e.message}\n`);
      }
      process.stdout.write('\n');
    } else if (result.fixed.length > 0) {
      process.stdout.write('  (all findings resolved)\n\n');
    }
    continue;
  }

  const result = await lintFile(p, ctx);
  if (result.errors.length || result.warnings.length) {
    filesWithFindings += 1;
    totalErrors += result.errors.length;
    totalWarnings += result.warnings.length;
    process.stdout.write(formatReport(p, result) + '\n\n');
  }
}

let summary = `${targets.length} file(s) checked · ${filesWithFindings} with findings · ${totalErrors} error(s) · ${totalWarnings} warning(s)`;
if (autoFix) {
  const verb = dryRun ? 'would apply' : 'applied';
  summary += ` · ${verb} ${totalFixed} fix(es)`;
  if (!dryRun) summary += ` to ${filesWritten} file(s)`;
}
process.stdout.write(summary + '\n');

if (totalErrors > 0 || (warnAsError && totalWarnings > 0)) {
  process.exit(1);
}
process.exit(0);
