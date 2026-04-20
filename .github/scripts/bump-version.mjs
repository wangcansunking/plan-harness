#!/usr/bin/env node
/**
 * bump-version.mjs — invoked by .github/workflows/auto-bump.yml.
 *
 * Reads env:
 *   BUMP_LEVEL   patch | minor | major
 *   PR_NUMBER
 *   PR_TITLE
 *   PR_BODY      full body of the merged PR
 *   PR_URL       html_url of the PR
 *
 * Side effects (in the working tree):
 *   - Patches `.claude-plugin/plugin.json` version.
 *   - Patches every tracked `package.json` (excl. node_modules).
 *   - Patches the matching `plugins[].version` entry in
 *     `.claude-plugin/marketplace.json` if present (plan-harness ships a
 *     plugin-local marketplace manifest; claude-config-manager doesn't).
 *   - Prepends a new `## [version] — date` block to CHANGELOG.md. Content
 *     comes from the first `## Changelog` section inside PR_BODY; if that's
 *     missing, falls back to a single bullet under a label-derived section.
 *
 * Writes to $GITHUB_OUTPUT:
 *   version=<new>
 *   plugin_name=<plugin.json name>
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const { BUMP_LEVEL, PR_NUMBER, PR_TITLE, PR_BODY, PR_URL, GITHUB_OUTPUT } = process.env;

if (!['patch', 'minor', 'major'].includes(BUMP_LEVEL ?? '')) {
  console.error(`Invalid BUMP_LEVEL: ${BUMP_LEVEL}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Read current version + plugin name from .claude-plugin/plugin.json
// ---------------------------------------------------------------------------

const pluginJson = JSON.parse(readFileSync('.claude-plugin/plugin.json', 'utf-8'));
const currentVersion = pluginJson.version;
const pluginName = pluginJson.name;

if (!currentVersion || !/^\d+\.\d+\.\d+/.test(currentVersion)) {
  console.error(`Unreadable current version: ${currentVersion}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Compute new version via semver bump
// ---------------------------------------------------------------------------

function bump(v, level) {
  const [maj, min, pat] = v.split('.').map((n) => parseInt(n, 10));
  switch (level) {
    case 'major':
      return `${maj + 1}.0.0`;
    case 'minor':
      return `${maj}.${min + 1}.0`;
    case 'patch':
      return `${maj}.${min}.${pat + 1}`;
  }
}

const newVersion = bump(currentVersion, BUMP_LEVEL);
console.log(`Bumping ${currentVersion} → ${newVersion} (${BUMP_LEVEL})`);

// ---------------------------------------------------------------------------
// 3. Patch every file that carries a version
// ---------------------------------------------------------------------------

function listPackageJsons() {
  const out = execSync('git ls-files "*package.json"', { encoding: 'utf-8' });
  return out.split('\n').filter((f) => f && !f.includes('node_modules'));
}

function patchSimpleVersion(path) {
  const raw = readFileSync(path, 'utf-8');
  const re = /^(\s*"version"\s*:\s*")([^"]+)(")/m;
  const m = raw.match(re);
  if (!m) {
    console.warn(`  ${path} — no "version" field, skipping`);
    return false;
  }
  writeFileSync(path, raw.replace(re, `$1${newVersion}$3`));
  console.log(`  patched ${path}`);
  return true;
}

// 3a. plugin.json (top-level version)
patchSimpleVersion('.claude-plugin/plugin.json');

// 3b. every package.json
for (const p of listPackageJsons()) {
  patchSimpleVersion(p);
}

// 3c. plugin-local marketplace.json: bump the entry where name === pluginName
const pluginMarketplacePath = '.claude-plugin/marketplace.json';
if (existsSync(pluginMarketplacePath)) {
  const manifest = JSON.parse(readFileSync(pluginMarketplacePath, 'utf-8'));
  const entry = (manifest.plugins ?? []).find((p) => p.name === pluginName);
  if (entry) {
    entry.version = newVersion;
    writeFileSync(pluginMarketplacePath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`  patched ${pluginMarketplacePath} (plugins[${pluginName}].version)`);
  } else {
    console.log(`  ${pluginMarketplacePath} present but no entry for ${pluginName} — skipping`);
  }
}

// ---------------------------------------------------------------------------
// 4. Build the CHANGELOG block
// ---------------------------------------------------------------------------

function extractPrChangelogSection(body) {
  if (!body) return null;
  const re = /(^|\n)##\s+Changelog\s*\n([\s\S]*?)(?=\n##\s+|$)/i;
  const m = body.match(re);
  return m ? m[2].trim() : null;
}

function fallbackEntryFromTitle(level, title) {
  const section =
    level === 'major' ? 'Breaking Changes' : level === 'minor' ? 'Added' : 'Fixed';
  return `### ${section}\n- ${title}`;
}

const today = new Date().toISOString().slice(0, 10);
const extracted = extractPrChangelogSection(PR_BODY ?? '');
const body = extracted ?? fallbackEntryFromTitle(BUMP_LEVEL, PR_TITLE ?? 'Release');
const prRef = `([#${PR_NUMBER}](${PR_URL}))`;

const entry = `## [${newVersion}] — ${today}

${body}

${prRef}
`;

// ---------------------------------------------------------------------------
// 5. Prepend entry to CHANGELOG.md
// ---------------------------------------------------------------------------

function prependChangelog(entryBlock) {
  const path = 'CHANGELOG.md';
  let current = '';
  try {
    current = readFileSync(path, 'utf-8');
  } catch {
    current = '# Changelog\n\nAll notable changes to this project are documented here.\n';
  }
  const headerMatch = current.match(/^(#\s+Changelog[\s\S]*?\n)(?=##\s+\[|$)/);
  const header = headerMatch
    ? headerMatch[1]
    : '# Changelog\n\nAll notable changes to this project are documented here.\n\n';
  const rest = current.slice(header.length);
  writeFileSync(path, `${header}\n${entryBlock}\n${rest.trimStart()}`);
  console.log(`  prepended entry to ${path}`);
}

prependChangelog(entry);

// ---------------------------------------------------------------------------
// 6. Export outputs
// ---------------------------------------------------------------------------

if (GITHUB_OUTPUT) {
  appendFileSync(GITHUB_OUTPUT, `version=${newVersion}\n`);
  appendFileSync(GITHUB_OUTPUT, `plugin_name=${pluginName}\n`);
}

console.log(`\nDone. New version: ${newVersion}`);
