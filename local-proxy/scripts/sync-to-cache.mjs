// sync-to-cache.mjs — copies plan-harness working copy into the Claude Code
// plugin cache so the next CC restart picks up edits without re-installing.
//
// Usage:  node scripts/sync-to-cache.mjs         (from local-proxy/)
//         npm run dev                             (build + sync)
//
// This is a dev-time tool for plan-harness maintainers. End users never run it.

import { existsSync, cpSync, mkdirSync, statSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PLUGIN_NAME = 'plan-harness';
const MARKETPLACE = 'canwa-claude-plugins';

const __filename = fileURLToPath(import.meta.url);
const scriptsDir = dirname(__filename);
const localProxyDir = dirname(scriptsDir);
const pluginDir = dirname(localProxyDir);        // plan-harness/
const repoRoot = dirname(pluginDir);              // repo root

const version = JSON.parse(
  readFileSync(join(pluginDir, '.claude-plugin', 'plugin.json'), 'utf-8')
).version;

const cacheDir = join(
  homedir(), '.claude', 'plugins', 'cache',
  MARKETPLACE, PLUGIN_NAME, version
);

if (!existsSync(cacheDir)) {
  console.error(`[sync] cache not found: ${cacheDir}`);
  console.error(`[sync] install the plugin first with:`);
  console.error(`[sync]   claude plugins marketplace add ${repoRoot}`);
  console.error(`[sync]   claude plugins install ${PLUGIN_NAME}`);
  process.exit(1);
}

// Everything the plugin cache needs to mirror from the working copy.
// - local-proxy/dist     → the built MCP server (what start.js imports)
// - local-proxy/start.js → the launcher (points at dist)
// - local-proxy/src      → kept in sync for debugging (start.js loads dist, but
//                           contributors reading cache should see current source)
// - skills, prompts, contexts → Claude Code reads these from cache
// - .claude-plugin, docs, README, ROADMAP → metadata & reference
const toSync = [
  'local-proxy/dist',
  'local-proxy/start.js',
  'local-proxy/package.json',
  'local-proxy/src',
  'skills',
  'prompts',
  'contexts',
  'docs',
  'assets',            // favicon + any other shipped binary assets
  '.claude-plugin',
  'README.md',
  'ROADMAP.md',
  'DEVELOPMENT.md',
  'DESIGN.md',
];

let synced = 0;
let skipped = 0;

for (const rel of toSync) {
  const src = join(pluginDir, rel);
  const dst = join(cacheDir, rel);
  if (!existsSync(src)) { skipped += 1; continue; }

  const srcStat = statSync(src);
  if (srcStat.isDirectory()) {
    mkdirSync(dst, { recursive: true });
    cpSync(src, dst, { recursive: true, force: true });
  } else {
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst, { force: true });
  }
  console.log(`[sync] ${rel}`);
  synced += 1;
}

console.log(
  `[sync] done. ${synced} copied, ${skipped} skipped (missing in working copy).\n` +
  `[sync] restart Claude Code for the new MCP bundle to take effect.`
);
