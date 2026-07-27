---
name: plan-start
description: Register the current project with the shared plan-harness daemon and surface its project-scoped dashboard URL. The daemon runs on a fixed port (3100); if it isn't up yet, it's spawned automatically. Use this when you already have a scenario and just want the dashboard open — no context selection, no scenario creation.
---

# plan-start

Register this project with the shared dashboard daemon and tell the user where to find it. That's the whole skill. It's a thin shortcut over the `plan_serve_dashboard` MCP tool, designed for the common case where the user already ran `/plan-init` (or doesn't need to) and just wants the dashboard reachable in their browser.

`/plan-init` already does this as part of its bootstrap. Use `/plan-start` when:
- The MCP server respawned and you want to re-surface the URL.
- The user opened a session in a workspace where a scenario already exists.
- They just want a quick way to print the URL again.

## How it works — one daemon, many projects

A **single long-lived daemon** on a **fixed port (3100)** holds a registry of every project that has registered with it. Each Claude Code session (including each git worktree) registers its own project root into that one daemon. Every doc link is **project-scoped** — it carries the project's identity — so links never collide across sessions or worktrees, and a copied link always resolves to the right project.

- **Fixed port.** The daemon does NOT bump ports. A stable port is what makes links stable. If port 3100 is taken by a non-plan-harness process, the tool reports a clear error rather than silently drifting.
- **Auto-spawn.** If the daemon isn't running, the MCP layer spawns it detached and registers this project.
- **Project identity.** Each project gets a `projectId` of the form `<slug>-<hash6>` (readable directory-name slug + a short hash of the canonical root path). Worktrees of the same repo get distinct ids.

## Invocation Forms

| Invocation                              | Behavior                                                                 |
|-----------------------------------------|--------------------------------------------------------------------------|
| `/plan-start`                           | Ensure the daemon is up, register the current project, report the URL    |
| `/plan-start --workspace <abs-path>`    | Register a different project root (default: current cwd)                  |

## Workflow

### Step 1 — Resolve workspace

If `--workspace` was passed, use it. Otherwise default to `process.cwd()` — Claude Code sets cwd to the project root when it spawns the MCP server, so this is usually right.

### Step 2 — Call `plan_serve_dashboard`

Invoke the MCP tool:

```
plan_serve_dashboard({ workspaceRoot: "<abs>" })
```

The underlying implementation (`local-proxy/src/index.js` → `ensureDaemon`):

1. Probes `http://localhost:3100/_daemon/health`.
2. If a daemon is live and its version matches, registers this project into it.
3. If the versions differ, asks the old daemon to shut down and spawns a fresh one, then registers.
4. If no daemon is up, spawns one detached (`daemon-entry.js`) and registers once it's healthy.
5. Returns the project-scoped URL: `http://localhost:3100/p/<projectId>/`.

There is no code path where the tool reports success but the project is unreachable — registration only returns after the daemon answers `/_daemon/health`.

### Step 3 — Report the URL to the user

Print a compact block with the project-scoped URL forms users care about:

```
Dashboard ready.

  Project:   {label} ({projectId})
  Workspace: {workspaceRoot}

URLs:
  http://localhost:3100/                                          ← overview (every registered project)
  http://localhost:3100/p/{projectId}/                            ← this project's scenarios
  http://localhost:3100/p/{projectId}/{scenarioName}/design.html  ← any individual doc

If you want a public share link instead, run /plan-share — it wraps the daemon in a devtunnel and shares this project's URL.
```

If Claude Code is running on the user's local machine, they can click the localhost URL directly from the chat surface; most Claude Code surfaces auto-linkify `http://localhost:...`.

## Error Handling

| Error                                                       | Resolution                                                                     |
|-------------------------------------------------------------|--------------------------------------------------------------------------------|
| `plan_serve_dashboard` MCP tool not registered              | Fall back: "MCP server isn't loaded. Run `/plan-restart` or restart Claude Code." |
| `workspaceRoot` doesn't exist                               | Print: "Workspace path doesn't exist: `<path>`. Pass `--workspace <abs>`."      |
| Port 3100 taken by another process                          | Surface the error verbatim; the daemon won't start on a drifted port by design |
| Daemon did not come up                                      | Print the error verbatim; do NOT pretend the dashboard is up                    |
| `plan_serve_dashboard` returns an error string              | Print the error verbatim; do NOT pretend the dashboard is up                    |

## Cross-Links

| Skill / File                            | Relationship                                                              |
|-----------------------------------------|---------------------------------------------------------------------------|
| `/plan-init`                            | Full bootstrap (contexts + scenario + dashboard). `/plan-start` is the dashboard-only subset. |
| `/plan-restart`                         | Exits the MCP server so Claude Code respawns it. Use when the bundle changed. |
| `/plan-share`                           | Wraps the daemon in a devtunnel and shares this project's scoped URL for external review. |
| `local-proxy/src/web-server.js`         | `startDaemon()` / registry / `/p/<projectId>/` routing.                  |
| `local-proxy/src/index.js`              | `ensureDaemon()` — probe / version-handshake / detached spawn / register. |
| `local-proxy/src/daemon-entry.js`       | Standalone daemon entry spawned detached by the MCP layer.               |

## Principles

1. **One job.** Bring the dashboard up and register this project. Don't ask for contexts; don't create scenarios; don't run `/plan-gen`.
2. **Fixed port, stable links.** The daemon never bumps ports — a stable port is the precondition for offset-free, copy-safe links. Report the project-scoped URL, not a bare port.
3. **Truth-source the liveness check.** Registration only returns after the daemon answers `/_daemon/health`; never trust a cached URL alone.
4. **Silent on noise.** A clean start prints the URL block and stops. No verbose logs, no "checking…" spinners, no MCP-internal chatter.
