// daemon-entry.js — standalone entry for the plan-harness dashboard daemon.
//
// Spawned detached by the MCP layer (see ensureDaemon in index.js) so that a
// SINGLE long-lived daemon on a fixed port holds the cross-project registry.
// Multiple Claude Code sessions register their projects into this one daemon,
// which is what kills the multi-session link collisions.
//
// Usage:  node daemon-entry.js [--port <n>]   (defaults to PLAN_HARNESS_DAEMON_PORT or 3100)

import { startDaemon } from './web-server.js';

function parsePort() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--port');
  if (i >= 0 && argv[i + 1]) return Number(argv[i + 1]);
  if (process.env.PLAN_HARNESS_DAEMON_PORT) return Number(process.env.PLAN_HARNESS_DAEMON_PORT);
  return 3100;
}

const port = parsePort();

try {
  const origin = await startDaemon(port);
  console.error(`[plan-harness] daemon-entry listening at ${origin}`);
} catch (err) {
  console.error(`[plan-harness] daemon-entry failed: ${err.message}`);
  process.exit(1);
}

// Keep the process alive; the HTTP server holds the event loop. Handle a clean
// shutdown signal so a version-mismatch respawn can free the port promptly.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    import('./web-server.js').then(({ stopDaemon }) => stopDaemon()).finally(() => process.exit(0));
  });
}
