---
name: plan-start
description: Start the local dashboard server and surface the workspace URL. Auto-bumps the port if 3847 is busy and reports the actual URL back. Use this when you already have a scenario and just want the dashboard open — no context selection, no scenario creation.
---

# plan-start

Bring the local dashboard server up and tell the user where to find it. That's the whole skill. It's a thin shortcut over the `plan_serve_dashboard` MCP tool, designed for the common case where the user already ran `/plan-init` (or doesn't need to) and just wants the dashboard reachable in their browser.

`/plan-init` already does this as part of its bootstrap. Use `/plan-start` when:
- The MCP server respawned and the dashboard didn't come back up.
- The dashboard process died (port conflict, crash, manual stop) and the user wants it back without re-walking init.
- The user opened a session in a workspace where a scenario already exists.
- They just want a quick way to print the URL again.

## Invocation Forms

| Invocation                              | Behavior                                                                |
|-----------------------------------------|-------------------------------------------------------------------------|
| `/plan-start`                           | Start (or reuse) the dashboard on port 3847, then report the URL        |
| `/plan-start --port <n>`                | Try to bind `<n>` first; auto-bump if it's busy                         |
| `/plan-start --workspace <abs-path>`    | Target a different workspace root (default: current cwd)                |

## Workflow

### Step 1 — Resolve workspace

If `--workspace` was passed, use it. Otherwise default to `process.cwd()` — Claude Code sets cwd to the project root when it spawns the MCP server, so this is usually right.

### Step 2 — Call `plan_serve_dashboard`

Invoke the MCP tool:

```
plan_serve_dashboard({ workspaceRoot: "<abs>", port: <portOrDefault> })
```

The underlying implementation (`local-proxy/src/web-server.js`, `local-proxy/src/index.js`):

1. Consults `auth.isLocalRequest` and the truth-source helper `ensureDashboard(workspaceRoot, port)` — if a dashboard is already running on the requested port (or any port from a prior call), it reuses it.
2. If the port is occupied by some other process, the HTTP server `'error'` listener catches `EADDRINUSE`, closes the failed listener, and **retries with `port + 1`**. The bump repeats until a free port is found (practically: 3847 → 3848 → ...). The return URL reflects whichever port actually bound.
3. Returns `"Dashboard running at http://localhost:<port>"`.

There is no code path where the tool reports success but the dashboard is unreachable — `startDashboard()` checks `server.listening` before returning the URL, and the MCP handler routes everything through `ensureDashboard`, which re-derives liveness from `auth.isDashboardRunning()` rather than a stale cache.

### Step 3 — Report the URL to the user

Print a compact block that highlights the actual port (which may differ from the default if bumping happened) and the three URL forms users care about:

```
Dashboard ready.

  Port:     {port}      ← {`(default 3847)` if port === 3847, otherwise `(bumped from 3847 — original was busy)`}
  Workspace: {workspaceRoot}

URLs:
  http://localhost:{port}/                                   ← workspace index (every scenario)
  http://localhost:{port}/{scenarioName}/design.html         ← any individual doc
  http://localhost:{port}/_shared/glossary/glossary.html     ← shared assets

If you want a public share link instead, run /plan-share — it wraps this server in a devtunnel.
```

If `port !== requestedPort`, the bumped-from-busy note makes it visible at a glance — users get the new URL and immediately know why it's not the port they expected.

If `--no-open` was NOT passed and Claude Code is running on the user's local machine (loopback request from the user's browser is trivial), they can click the localhost URL directly from the chat surface; most Claude Code surfaces auto-linkify `http://localhost:...`.

## Error Handling

| Error                                                       | Resolution                                                                    |
|-------------------------------------------------------------|-------------------------------------------------------------------------------|
| `plan_serve_dashboard` MCP tool not registered              | Fall back: "MCP server isn't loaded. Run `/plan-restart` or restart Claude Code." |
| `workspaceRoot` doesn't exist                               | Print: "Workspace path doesn't exist: `<path>`. Pass `--workspace <abs>`."     |
| EADDRINUSE on every port from 3847 through 3900             | Surface the OS error verbatim; suggest `--port <high-number>` to start fresh  |
| `plan_serve_dashboard` returns an error string              | Print the error verbatim; do NOT pretend the dashboard is up                  |
| Dashboard process died between the call and printing        | Caught by `ensureDashboard` (it re-checks `isDashboardRunning()`); will reissue start; report the new URL |

## Cross-Links

| Skill / File                            | Relationship                                                              |
|-----------------------------------------|---------------------------------------------------------------------------|
| `/plan-init`                            | Full bootstrap (contexts + scenario + dashboard). `/plan-start` is the dashboard-only subset. |
| `/plan-restart`                         | Exits the MCP server so Claude Code respawns it. Use when the bundle changed. |
| `/plan-share`                           | Wraps the local dashboard in a devtunnel for external review.             |
| `local-proxy/src/web-server.js`         | `startDashboard()` — does the port-bump-on-EADDRINUSE work.               |
| `local-proxy/src/index.js`              | `ensureDashboard()` — truth-source check + re-start if cached URL is stale. |

## Principles

1. **One job.** Bring the dashboard up. Don't ask for contexts; don't create scenarios; don't run `/plan-gen`. Anything beyond "is the dashboard reachable" belongs in another skill.
2. **Truth-source the liveness check.** Never trust a cached URL alone — the underlying tool already consults `isDashboardRunning()`. This skill inherits that.
3. **Surface the actual port loudly.** If the bumped-from-default port matters (and it does — users will type `3847` from muscle memory and 404), the report makes the actual port obvious in the first line of output, not buried in a URL.
4. **Silent on noise.** A clean start prints the URL block and stops. No verbose logs, no "checking…" spinners, no MCP-internal chatter.
