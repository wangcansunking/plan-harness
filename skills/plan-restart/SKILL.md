---
name: plan-restart
description: Restart the plan-harness MCP server so a newly-installed plugin bundle takes effect. Use after `claude plugins update` lands a new version, after a dev-loop `npm run dev`, or whenever the running server's behavior no longer matches the current skill docs (stale bundle symptom).
---

# plan-restart

Bounce the plan-harness MCP server. Claude Code supervises MCP servers over stdio — when the process exits with code 0, Claude Code reconnects with whatever bundle is currently on disk, picking up the new version.

## When to Use

- Right after `claude plugins update` reports a new plan-harness version
- After running `npm run dev` (build + sync) in a local dev loop
- When `/plan-gen` / `/plan-full` / the dashboard start behaving inconsistently with the skill docs — classic symptom that the running bundle has drifted from the installed one
- When the user says "restart plan-harness", "reload the plugin", "plan-harness bounce", or "/plan-restart"

## What It Produces

- The running plan-harness MCP server exits with code 0 after ~300 ms
- Claude Code auto-reconnects to a freshly-spawned process
- The dashboard (if it was running) drops for a few seconds and comes back pointed at the new bundle

## How It Works

The plan-harness MCP server exposes a `plan_restart` tool. Calling it:

1. Returns an immediate text acknowledgement (flushed over stdio first).
2. Schedules `process.exit(0)` ~300 ms later so the JSON-RPC response lands before the transport dies.
3. Claude Code sees the disconnect and respawns the server against the current plugin cache.

A background **staleness watcher** also runs inside the server and will trigger the same exit automatically when it detects:

- `dist/index.js` rewritten in place (mtime drift) — catches the dev flow (`npm run dev`).
- A higher-semver sibling version directory appearing next to the current one — catches `claude plugins update`.

The watcher polls every 30 s (override with `PLAN_HARNESS_WATCH_MS=<ms>`, disable with `PLAN_HARNESS_NO_WATCH=1`). `/plan-restart` is the manual escape hatch when you don't want to wait for the next tick.

## Workflow

### Step 1 — Call the tool

Invoke the `plan_restart` MCP tool on the `plan-harness` server. You can pass an optional `reason` string which gets logged to stderr before exit — helpful when scanning plugin logs later.

```
reason: "manual restart after claude plugins update to 1.3.3"
```

### Step 2 — Wait for respawn

Claude Code will reconnect automatically within a few seconds. You do not need to do anything — subsequent MCP tool calls will land on the new process.

If a dashboard was open in a browser tab, reload the tab once the respawn completes.

### Step 3 — Sanity check (optional)

Invoke any plan-harness tool to confirm the new process is up — `plan_list_scenarios` is the cheapest. The stderr log from the new process will include the version it's running under (`[plan-harness] bundle=... version=...`).

## Error Handling

| Situation | Resolution |
|---|---|
| `plan_restart` tool not listed | The running bundle is too old (< 1.4.0) to self-restart. Bounce Claude Code itself, or `pkill -f plan-harness` and let CC respawn. |
| Claude Code doesn't reconnect after ~10 s | Check the MCP server log for crash-on-boot; the most common cause is a broken `dist/index.js`. Run `cd local-proxy && npm run build` in the plugin source to re-bundle. |
| Dashboard tab shows "connection refused" indefinitely | The new process may be binding a different port if `:3847` was held. Close the tab and call `plan_serve_dashboard` again. |

## Cross-Links

| | |
|---|---|
| `plan_restart` MCP tool | Implemented in `local-proxy/src/index.js`; exits 0 after 300 ms |
| Staleness watcher | Same file — polls bundle mtime + sibling version dirs |
| `skills/plan-gen/SKILL.md` | Most likely caller (or its users) when a new version introduces a new doc type |
| `sync-to-cache.mjs` | Dev-only; prints "restart Claude Code for the new MCP bundle" — that hint is now automated for the watcher, or manual via `/plan-restart` |
