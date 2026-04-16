---
name: plan-share
description: Share plan documents via devtunnel with public, private, or password-protected access. Automatically maintains the tunnel connection.
---

# plan-share

Share plan documents with teammates via a devtunnel URL. Supports three access modes.

## When to Use

- After generating plan documents, when the user wants to share them
- When the user says "share", "share plans", "devtunnel", "plan-share"
- When the user wants a link for reviewers to access the dashboard

## Access Modes

| Mode | devtunnel Flag | Auth | Use Case |
|------|---------------|------|----------|
| **public** | `--allow-anonymous` | None — anyone with the URL | Quick sharing, demos |
| **private** | (default) | Microsoft account login required | Team-internal, org-restricted |
| **protected** | `--allow-anonymous` + server-side password | Password in URL or login page | External reviewers, cross-org sharing |

## Workflow

### Step 1: Ensure Dashboard is Running

Check if the plan dashboard server is already running.

- If running, get the current port
- If not running, call the `plan_serve_dashboard` MCP tool to start it:
  ```
  plan_serve_dashboard with workspaceRoot = {cwd or detected workspace}
  ```
- Store the `port` for devtunnel

### Step 2: Ask Access Mode

```
=== Share Plan Documents ===

How should this link be accessed?

 1. public      — Anyone with the URL can view (no login)
 2. private     — Microsoft account login required
 3. protected   — Password-protected (you set a password)

Mode [1]: _
```

If user picks **protected**, ask for the password:
```
Set a password for the shared link:
> _
```

### Step 3: Configure Password Protection (protected mode only)

Call the `plan_share` MCP tool with `mode: "protected"` and `password`:

```
plan_share with:
  - workspaceRoot: {workspace path}
  - mode: "protected"
  - password: {user-provided password}
```

This enables the password middleware on the web server. All requests must include `?token={password}` or have a valid session cookie. Requests without auth get a login page.

### Step 4: Start devtunnel

Use Bash to create and host a devtunnel. The tunnel auto-reconnects on disconnect.

**Public mode:**
```bash
devtunnel host -p {port} --allow-anonymous 2>&1 &
```

**Private mode:**
```bash
devtunnel host -p {port} 2>&1 &
```

**Protected mode:**
```bash
devtunnel host -p {port} --allow-anonymous 2>&1 &
```
(Anonymous at tunnel level — our server handles the password check)

The `devtunnel host` command:
1. Creates a tunnel (or reuses existing)
2. Outputs the public URL
3. Stays running, auto-reconnects on network changes

Run with `run_in_background: true` so it stays alive.

### Step 5: Extract and Display URL

Parse the devtunnel output for the URL (format: `https://{tunnel-id}-{port}.{region}.devtunnels.ms`).

Display to the user:

**Public:**
```
=== Sharing Plan Documents ===

Mode:     public (anyone with the URL)
URL:      https://abc123-3847.usw2.devtunnels.ms
Dashboard: https://abc123-3847.usw2.devtunnels.ms/

The tunnel auto-reconnects if your network drops.
To stop sharing: /plan-share stop
```

**Private:**
```
=== Sharing Plan Documents ===

Mode:     private (Microsoft account login required)
URL:      https://abc123-3847.usw2.devtunnels.ms
Dashboard: https://abc123-3847.usw2.devtunnels.ms/

Recipients must sign in with a Microsoft account.
The tunnel auto-reconnects if your network drops.
To stop sharing: /plan-share stop
```

**Protected:**
```
=== Sharing Plan Documents ===

Mode:     protected (password required)
URL:      https://abc123-3847.usw2.devtunnels.ms?token=mypassword
Dashboard: https://abc123-3847.usw2.devtunnels.ms?token=mypassword

Share the full URL (includes token). Recipients who open the URL
without the token will see a password prompt.

The tunnel auto-reconnects if your network drops.
To stop sharing: /plan-share stop
```

### Step 6: Monitor (auto-reconnect)

The `devtunnel host` process handles reconnection automatically. If the user reports issues:
1. Check if the process is still running
2. If dead, restart it with the same parameters
3. The new URL may differ — display the updated URL

## Sub-commands

| Invocation | Behavior |
|------------|----------|
| `/plan-share` | Start sharing (default: public) |
| `/plan-share public` | Start with public access |
| `/plan-share private` | Start with Microsoft login |
| `/plan-share protected` | Start with password (prompts for password) |
| `/plan-share protected mypass123` | Start with specified password |
| `/plan-share stop` | Stop the tunnel and disable password protection |
| `/plan-share status` | Show current sharing status and URL |

## Error Handling

| Error | Resolution |
|-------|-----------|
| `devtunnel` not installed | Print platform-specific install options: Windows → `winget install Microsoft.devtunnel`; macOS → `brew install --cask devtunnel`; Linux → `curl -sL https://aka.ms/DevTunnelCliInstall \| bash`; any OS → download from `https://aka.ms/devtunnels/download` |
| `devtunnel` not logged in | "Run `devtunnel user login` first to authenticate" |
| Dashboard not running | Auto-start it via `plan_serve_dashboard` MCP tool |
| Tunnel process dies | Restart automatically. Inform user if URL changed. |
| Port conflict | Dashboard already handles port fallback; tunnel follows |
