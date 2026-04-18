// dev-watch.mjs — watch source + non-source files, rebuild + sync to cache.
//
// Usage: npm run dev:watch  (from local-proxy/)
//
// - Watches src/ via esbuild: any change rebuilds dist/index.js and syncs.
// - Also watches skills/, prompts/, contexts/, docs/, .claude-plugin/ (no
//   build needed — just syncs to cache on change).
// - Debounces sync by 200ms so a burst of saves triggers one sync.
// - After sync, you may need to restart Claude Code for a new dist bundle to
//   load (MCP servers are long-running stdio processes). Skill/prompt edits
//   take effect on CC restart only, too.

import * as esbuild from 'esbuild';
import { watch } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const scriptsDir = dirname(__filename);
const localProxyDir = dirname(scriptsDir);
const pluginDir = dirname(localProxyDir);
const syncScript = resolve(scriptsDir, 'sync-to-cache.mjs');
const srcEntry = resolve(localProxyDir, 'src/index.js');
const outFile = resolve(localProxyDir, 'dist/index.js');

let syncTimer = null;
function debouncedSync(reason) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    console.error(`[watch] syncing to cache (${reason})`);
    const r = spawnSync(process.execPath, [syncScript], { stdio: 'inherit' });
    if (r.status !== 0) console.error('[watch] sync failed');
  }, 200);
}

// Non-source dirs: markdown + config. No build needed; changes sync verbatim.
const nonSrcDirs = [
  'skills',
  'prompts',
  'contexts',
  'docs',
  '.claude-plugin',
];

// Single-file watches that still need sync on change (top-level markdown).
// fs.watch on a single file works on all platforms.
const topLevelFiles = ['DESIGN.md', 'README.md', 'ROADMAP.md', 'DEVELOPMENT.md'];
for (const name of topLevelFiles) {
  const file = join(pluginDir, name);
  try {
    watch(file, () => debouncedSync(name));
  } catch {
    // ignore — file may not exist yet
  }
}

for (const rel of nonSrcDirs) {
  const dir = join(pluginDir, rel);
  try {
    watch(dir, { recursive: true }, (_event, filename) => {
      if (filename) debouncedSync(`${rel}/${filename}`);
    });
    console.error(`[watch] watching ${rel}/`);
  } catch (err) {
    console.error(`[watch] could not watch ${rel}/: ${err.message}`);
  }
}

// esbuild: rebuilds dist/ on src/ change, then sync.
const ctx = await esbuild.context({
  entryPoints: [srcEntry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  outfile: outFile,
  plugins: [
    {
      name: 'sync-on-build',
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length) {
            console.error(`[watch] build failed with ${result.errors.length} error(s)`);
            return;
          }
          console.error('[watch] rebuilt dist/index.js');
          debouncedSync('src rebuild');
        });
      },
    },
  ],
});

await ctx.watch();
console.error('[watch] esbuild watching src/');
console.error('[watch] ready — edit files and they will sync automatically');
console.error('[watch] remember: MCP server changes need Claude Code restart to load');
console.error('[watch] press Ctrl+C to stop');
