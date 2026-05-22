/**
 * index.js — MCP server for the plan-harness plugin.
 *
 * Exposes tools for managing plan scenarios, checking completion status,
 * analysing codebase context, and serving a dashboard.  Communicates over
 * stdio using the Model Context Protocol SDK.
 *
 * IMPORTANT: All user-visible logging goes to stderr (console.error) because
 * stdout is reserved for the MCP JSON-RPC channel.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { statSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, basename } from "node:path";

import {
  listScenarios,
  createScenario,
  getScenarioFiles,
  checkCompletion,
  getCodebaseContext,
} from "./plan-manager.js";

// ---------------------------------------------------------------------------
// Dashboard server state (lazily started by plan_serve_dashboard)
// ---------------------------------------------------------------------------
let dashboardUrl = null;

// ---------------------------------------------------------------------------
// Devtunnel state (managed by plan_share)
// ---------------------------------------------------------------------------
let tunnelProcess = null;
let tunnelUrl = null;
let tunnelMode = null;

// ---------------------------------------------------------------------------
// MCP Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  { name: "plan-harness", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "plan_list_scenarios",
      description:
        "Scan the workspace for all plans/ directories across repos and list every scenario with its files and completion flags.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceRoot: {
            type: "string",
            description: "Absolute path to the workspace root to scan.",
          },
        },
        required: ["workspaceRoot"],
      },
    },
    {
      name: "plan_create_scenario",
      description:
        "Create a new scenario directory under <repoRoot>/plans/<name>/ with a manifest.json containing metadata.",
      inputSchema: {
        type: "object",
        properties: {
          repoRoot: {
            type: "string",
            description: "Absolute path to the repository root.",
          },
          name: {
            type: "string",
            description:
              "Human-readable scenario name (will be slugified for the directory).",
          },
          description: {
            type: "string",
            description: "Short description of what this scenario covers.",
          },
          workItem: {
            type: "string",
            description:
              "Optional work-item / ADO ID this scenario is linked to.",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Optional tags for categorisation.",
          },
        },
        required: ["repoRoot", "name"],
      },
    },
    {
      name: "plan_get_files",
      description:
        "List all plan files inside a scenario directory with metadata (name, path, type, size, modified).",
      inputSchema: {
        type: "object",
        properties: {
          scenarioPath: {
            type: "string",
            description: "Absolute path to the scenario directory.",
          },
        },
        required: ["scenarioPath"],
      },
    },
    {
      name: "plan_check_completion",
      description:
        "Analyse implementation progress for a scenario by parsing the implementation plan and checking for evidence (files, TODOs, references) in the codebase.",
      inputSchema: {
        type: "object",
        properties: {
          scenarioPath: {
            type: "string",
            description: "Absolute path to the scenario directory.",
          },
          repoRoot: {
            type: "string",
            description:
              "Absolute path to the repository root (used to scan source code).",
          },
        },
        required: ["scenarioPath", "repoRoot"],
      },
    },
    {
      name: "plan_get_context",
      description:
        "Analyse a repository to determine project type, tech stack, patterns, conventions, and directory structure. Reads CLAUDE.md, package.json, .csproj files, and README.md.",
      inputSchema: {
        type: "object",
        properties: {
          repoRoot: {
            type: "string",
            description: "Absolute path to the repository root.",
          },
        },
        required: ["repoRoot"],
      },
    },
    {
      name: "plan_serve_dashboard",
      description:
        "Start a local HTTP server that serves the plan dashboard UI. Returns the URL. If the server is already running, returns the existing URL.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceRoot: {
            type: "string",
            description: "Absolute path to the workspace root.",
          },
          port: {
            type: "number",
            description: "Port to listen on (default: 3100).",
          },
        },
        required: ["workspaceRoot"],
      },
    },
    {
      name: "plan_share",
      description:
        "Share the plan dashboard via devtunnel. Supports public (anyone), private (Microsoft login), and protected (a temporary password the plugin generates, shared out-of-band with reviewers). In protected mode, reviewers land on a login page that asks for the password and a display name for comment attribution. Auto-reconnects on network drops.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceRoot: {
            type: "string",
            description: "Absolute path to the workspace root.",
          },
          mode: {
            type: "string",
            enum: ["public", "private", "protected"],
            description:
              "Access mode: public (no auth), private (Microsoft login via devtunnel), protected (plugin-managed temporary password).",
          },
          password: {
            type: "string",
            description:
              "Optional override for protected mode. If omitted, the plugin generates a secure random password and prints it in the response.",
          },
          strictHost: {
            type: "boolean",
            description:
              "When true, the host must also enter the password — no loopback bypass. Default false (host bypass on direct localhost access). The proxy-header check in protected mode already blocks tunnel visitors from inheriting the bypass; strictHost is belt-and-suspenders.",
          },
        },
        required: ["workspaceRoot", "mode"],
      },
    },
    {
      name: "plan_share_stop",
      description:
        "Stop sharing the plan dashboard. Kills the devtunnel process and disables password protection.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "plan_reanchor",
      description:
        "Re-anchor every comment in a scenario (or a single doc) against the current doc HTML. Runs a three-tier cascade per design.html §4: exact prefix+exact+suffix in same section, exact anywhere in same section (migratedFrom), or Jaccard ≥ 0.72 token-overlap across sections (migratedFrom). Anchors that fail all tiers are flagged orphaned and surface in the widget's 'Needs reattachment' group. Idempotent.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceRoot: {
            type: "string",
            description: "Absolute path to the workspace root.",
          },
          scenario: {
            type: "string",
            description: "Scenario name (directory under plans/).",
          },
          doc: {
            type: "string",
            description: "Optional: single doc slug (e.g. 'design', 'test-plan'). Omit to re-anchor every doc in the scenario.",
          },
        },
        required: ["workspaceRoot", "scenario"],
      },
    },
    {
      name: "plan_list_pending_revises",
      description:
        "List every comment in a scenario with intent='revise' and reviseStatus='pending'. Used by the /plan-revise skill to batch-dispatch revise requests to a writer agent.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceRoot: {
            type: "string",
            description: "Absolute path to the workspace root.",
          },
          scenario: {
            type: "string",
            description: "Scenario name (directory under plans/).",
          },
        },
        required: ["workspaceRoot", "scenario"],
      },
    },
    {
      name: "plan_list_pending_mentions",
      description:
        "List every @-mention (e.g. @architect, @pm, @tester, @frontend, @backend, @writer) in the scenario's comment threads that has not yet received a persona reply. Used by the /plan-review batch step and by any skill handling @-mentions posted by reviewers.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceRoot: {
            type: "string",
            description: "Absolute path to the workspace root.",
          },
          scenario: {
            type: "string",
            description: "Scenario name (directory under plans/).",
          },
        },
        required: ["workspaceRoot", "scenario"],
      },
    },
    {
      name: "plan_post_persona_reply",
      description:
        "Post a persona (architect / pm / tester / frontend / backend / writer) reply to a mention-bearing comment. The parent comment must actually mention the persona or the call is rejected. Used after the calling agent has drafted the persona's reply content.",
      inputSchema: {
        type: "object",
        properties: {
          workspaceRoot: {
            type: "string",
            description: "Absolute path to the workspace root.",
          },
          scenario: {
            type: "string",
            description: "Scenario name (directory under plans/).",
          },
          doc: {
            type: "string",
            description: "Document slug the comment lives under (e.g. 'design', 'test-plan').",
          },
          parentId: {
            type: "string",
            description: "The comment id (cmt_<6hex>) of the parent that mentions this persona.",
          },
          persona: {
            type: "string",
            description: "One of: architect, pm, tester, frontend, backend, writer.",
          },
          body: {
            type: "string",
            description: "The persona's reply body (1..4000 chars). Plain text; the widget renders it verbatim.",
          },
        },
        required: ["workspaceRoot", "scenario", "doc", "parentId", "persona", "body"],
      },
    },
    {
      name: "plan_restart",
      description:
        "Exit the current plan-harness MCP server process so Claude Code respawns it with the latest plugin bundle. Use after `claude plugins update` or after a dev `npm run dev` if the auto-detect watcher hasn't caught the new version yet. The process exits with code 0 ~300ms after this call, so the tool response lands first.",
      inputSchema: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Optional free-text reason, printed to stderr before exit (e.g. 'after plugins update'). Defaults to 'manual restart requested'.",
          },
        },
      },
    },
  ],
}));

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ---- plan_list_scenarios ------------------------------------------
      case "plan_list_scenarios": {
        const scenarios = await listScenarios(args.workspaceRoot);

        if (scenarios.length === 0) {
          return textResult(
            "No plan scenarios found. Use plan_create_scenario to create one."
          );
        }

        const lines = scenarios.map((s) => {
          const flags = [
            s.hasProduct        ? "product"        : null,
            s.hasAnalysis       ? "analysis"       : null,
            s.hasDesign         ? "design"         : null,
            s.hasStateMachine   ? "state-machine"  : null,
            s.hasTestSpec       ? "test-spec"      : null,
            s.hasImplementation ? "implementation" : null,
            s.hasTestReport     ? "test-report"    : null,
          ]
            .filter(Boolean)
            .join(", ");

          return [
            `  Scenario: ${s.scenario}`,
            `  Repo:     ${s.repoRoot}`,
            `  Path:     ${s.scenarioPath}`,
            `  Files:    ${s.files.length} (${flags || "none"})`,
          ].join("\n");
        });

        return textResult(
          `Found ${scenarios.length} scenario(s):\n\n${lines.join("\n\n")}`
        );
      }

      // ---- plan_create_scenario -----------------------------------------
      case "plan_create_scenario": {
        const { scenarioPath, manifest } = await createScenario(
          args.repoRoot,
          args.name,
          {
            description: args.description,
            workItem: args.workItem,
            tags: args.tags,
          }
        );

        return textResult(
          [
            `Scenario created successfully.`,
            ``,
            `  Path:        ${scenarioPath}`,
            `  Name:        ${manifest.scenario}`,
            `  Description: ${manifest.description || "(none)"}`,
            `  Work Item:   ${manifest.workItem || "(none)"}`,
            `  Tags:        ${manifest.tags.length > 0 ? manifest.tags.join(", ") : "(none)"}`,
            `  Status:      ${manifest.status}`,
            `  Created:     ${manifest.createdAt}`,
          ].join("\n")
        );
      }

      // ---- plan_get_files -----------------------------------------------
      case "plan_get_files": {
        const files = await getScenarioFiles(args.scenarioPath);

        if (files.length === 0) {
          return textResult(
            `No files found in ${args.scenarioPath}. Generate plan documents to populate this scenario.`
          );
        }

        const lines = files.map(
          (f) =>
            `  ${f.name}  (${f.type}, ${formatBytes(f.size)}, modified ${f.modified || "unknown"})`
        );

        return textResult(
          `${files.length} file(s) in scenario:\n\n${lines.join("\n")}`
        );
      }

      // ---- plan_check_completion ----------------------------------------
      case "plan_check_completion": {
        const status = await checkCompletion(args.scenarioPath, args.repoRoot);

        if (status.total === 0) {
          return textResult(
            "No implementation plan items found. Create an implementation-plan.html first."
          );
        }

        const itemLines = status.items.map(
          (item) =>
            `  [${item.status === "completed" ? "x" : " "}] ${item.name}\n      ${item.evidence}`
        );

        return textResult(
          [
            `Completion: ${status.completed}/${status.total} (${status.percentage}%)`,
            ``,
            ...itemLines,
          ].join("\n")
        );
      }

      // ---- plan_get_context ---------------------------------------------
      case "plan_get_context": {
        const ctx = await getCodebaseContext(args.repoRoot);

        return textResult(
          [
            `Project type: ${ctx.projectType}`,
            ``,
            `Tech stack:`,
            ...(ctx.techStack.length > 0
              ? ctx.techStack.map((t) => `  - ${t}`)
              : ["  (none detected)"]),
            ``,
            `Patterns:`,
            ...(ctx.patterns.length > 0
              ? ctx.patterns.map((p) => `  - ${p}`)
              : ["  (none detected)"]),
            ``,
            `Conventions:`,
            ...(ctx.conventions.length > 0
              ? ctx.conventions.map((c) => `  - ${c}`)
              : ["  (none detected)"]),
            ``,
            `Structure:`,
            ctx.structure.topLevel
              ? ctx.structure.topLevel
                  .map((e) => `  ${e.isDir ? "[dir]" : "     "} ${e.name}`)
                  .join("\n")
              : "  (could not read)",
            ctx.structure.readmeSummary
              ? `\nREADME excerpt:\n  ${ctx.structure.readmeSummary}`
              : "",
            ctx.structure.csprojFiles
              ? `\n.csproj files found:\n${ctx.structure.csprojFiles.map((f) => `  ${f}`).join("\n")}`
              : "",
          ].join("\n")
        );
      }

      // ---- plan_serve_dashboard -----------------------------------------
      case "plan_serve_dashboard": {
        // Source of truth is isDashboardRunning() — the cached dashboardUrl
        // can lag behind reality (HTTP server died unobserved). When the cache
        // disagrees with the runtime, clear it and (re-)start the server.
        const port = args.port ?? 3847;
        try {
          const url = await ensureDashboard(args.workspaceRoot, port);
          return textResult(`Dashboard running at ${url}`);
        } catch (err) {
          return textResult(`Failed to start dashboard server: ${err.message}`);
        }
      }

      // ---- plan_share ----------------------------------------------------
      case "plan_share": {
        const { spawn } = await import("node:child_process");

        // 1. Ensure dashboard is running (truth-source check, not the cache)
        try {
          await ensureDashboard(args.workspaceRoot, 3847);
        } catch (err) {
          return textResult(`Cannot start dashboard: ${err.message}. Start it first with plan_serve_dashboard.`);
        }

        // 2. Extract port from dashboard URL
        const dashPort = new URL(dashboardUrl).port || "3847";

        // 3. Enable password protection for protected mode. If the caller did
        //    not supply a password, the plugin generates one — this is the
        //    default path and avoids the host needing to think one up.
        let protectedPassword = null;
        if (args.mode === "protected") {
          try {
            const webServerModule = await import("./web-server.js");
            protectedPassword = webServerModule.enablePasswordProtection(args.password);
            // Always import auth module to set strict-host flag (true if the
            // caller asked for it, otherwise false to clear any previous state).
            const authModule = await import("./auth.js");
            authModule.setStrictHost(!!args.strictHost);
          } catch (err) {
            return textResult(`Cannot enable password protection: ${err.message}`);
          }
        } else {
          // Disable password protection for public/private modes
          try {
            const webServerModule = await import("./web-server.js");
            webServerModule.disablePasswordProtection();
            const authModule = await import("./auth.js");
            authModule.setStrictHost(false);
          } catch { /* ignore */ }
        }

        // 4. Kill existing tunnel if any
        if (tunnelProcess) {
          try { tunnelProcess.kill(); } catch { /* ignore */ }
          tunnelProcess = null;
          tunnelUrl = null;
        }

        // 5. Start devtunnel
        const tunnelArgs = ["host", "-p", dashPort];
        if (args.mode === "public" || args.mode === "protected") {
          tunnelArgs.push("--allow-anonymous");
        }

        try {
          const proc = spawn("devtunnel", tunnelArgs, {
            stdio: ["ignore", "pipe", "pipe"],
            detached: false,
          });

          tunnelProcess = proc;
          tunnelMode = args.mode;

          // Collect output to find the URL
          let output = "";
          const urlPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Timed out waiting for devtunnel URL")), 30000);

            const onData = (chunk) => {
              output += chunk.toString();
              // devtunnel outputs URL like: "Connect via browser: https://..."
              const urlMatch = output.match(/https:\/\/[^\s]+devtunnels\.ms[^\s]*/);
              if (urlMatch) {
                clearTimeout(timeout);
                resolve(urlMatch[0]);
              }
            };

            proc.stdout.on("data", onData);
            proc.stderr.on("data", onData);

            proc.on("error", (err) => {
              clearTimeout(timeout);
              reject(err);
            });

            proc.on("exit", (code) => {
              if (!tunnelUrl) {
                clearTimeout(timeout);
                reject(new Error(`devtunnel exited with code ${code}. Output: ${output.slice(0, 500)}`));
              }
            });
          });

          tunnelUrl = await urlPromise;

          // Auto-restart on unexpected exit
          proc.on("exit", (code) => {
            if (tunnelProcess === proc) {
              console.error(`[plan-harness] devtunnel exited (code ${code}). It will be restarted on next plan_share call.`);
              tunnelProcess = null;
              tunnelUrl = null;
            }
          });

          // Build display output. The URL is ALWAYS clean — no password, no
          // token. In protected mode the password is printed alongside for the
          // host to share out-of-band (Slack/DM/whatever); it never appears in
          // the URL, nor in any HTTP header.
          const modeDesc = {
            public: "Anyone with the URL can view (no login required)",
            private: "Recipients must sign in with a Microsoft account via devtunnel",
            protected: "Reviewer enters the password plus a display name on a login page",
          };

          const lines = [
            `Sharing plan dashboard via devtunnel.`,
            ``,
            `  Mode:      ${args.mode} — ${modeDesc[args.mode]}`,
            `  URL:       ${tunnelUrl}`,
            `  Local:     ${dashboardUrl}`,
          ];

          if (args.mode === "protected") {
            lines.push(
              ``,
              `  Password:  ${protectedPassword}`,
              ``,
              `  Share the URL and the password separately with reviewers.`,
              `  Do NOT paste the password into the URL — the login page will`,
              `  prompt for it along with the reviewer's display name.`
            );
          }

          lines.push(
            ``,
            `The tunnel auto-reconnects if your network drops.`,
            `To stop sharing: use plan_share_stop tool.`
          );

          return textResult(lines.join("\n"));
        } catch (err) {
          tunnelProcess = null;
          tunnelUrl = null;
          const msg = err.message || String(err);
          if (msg.includes("ENOENT") || msg.includes("not found")) {
            return textResult(
              "devtunnel CLI not found. Install for your platform:\n" +
              "  Windows:  winget install Microsoft.devtunnel\n" +
              "  macOS:    brew install --cask devtunnel\n" +
              "  Linux:    curl -sL https://aka.ms/DevTunnelCliInstall | bash\n" +
              "  Any OS:   download from https://aka.ms/devtunnels/download\n\n" +
              "Then run: devtunnel user login"
            );
          }
          return textResult(`Failed to start devtunnel: ${msg}`);
        }
      }

      // ---- plan_share_stop ------------------------------------------------
      case "plan_share_stop": {
        const wasRunning = tunnelProcess !== null;

        if (tunnelProcess) {
          try { tunnelProcess.kill(); } catch { /* ignore */ }
          tunnelProcess = null;
        }
        tunnelUrl = null;
        tunnelMode = null;

        // Disable password protection
        try {
          const webServerModule = await import("./web-server.js");
          webServerModule.disablePasswordProtection();
        } catch { /* ignore */ }

        return textResult(
          wasRunning
            ? "Sharing stopped. Tunnel closed, password protection disabled."
            : "No active sharing session."
        );
      }

      case "plan_reanchor": {
        if (!args.workspaceRoot || !args.scenario) {
          throw new Error("workspaceRoot and scenario are required");
        }
        const commentMgr = await import("./comment-manager.js");
        let result;
        if (args.doc) {
          result = await commentMgr.reanchorDocument(args.workspaceRoot, args.scenario, args.doc);
          result.scenario = args.scenario;
          result.doc = args.doc;
        } else {
          result = await commentMgr.reanchorScenario(args.workspaceRoot, args.scenario);
          result.scenario = args.scenario;
        }
        const summary = args.doc
          ? `Re-anchored ${args.scenario}/${args.doc}: ${result.held} held, ${result.migrated} migrated, ${result.orphaned} orphaned (${result.total} total).`
          : `Re-anchored ${args.scenario}: ${result.held} held, ${result.migrated} migrated, ${result.orphaned} orphaned across ${result.docs.length} docs.`;
        return {
          content: [
            { type: "text", text: summary },
            { type: "text", text: JSON.stringify(result, null, 2) },
          ],
        };
      }

      case "plan_list_pending_revises": {
        if (!args.workspaceRoot || !args.scenario) {
          throw new Error("workspaceRoot and scenario are required");
        }
        const reviseMgr = await import("./revise-dispatcher.js");
        const pending = await reviseMgr.listPendingRevises(args.workspaceRoot, args.scenario);
        if (pending.length === 0) {
          return textResult(`No pending revise requests in ${args.scenario}.`);
        }
        const lines = pending.map(
          (p) => `  ${p.doc.padEnd(22)} ${p.id}  ${JSON.stringify(p.body).slice(0, 80)}  (${p.author})`
        );
        return {
          content: [
            { type: "text", text: `${pending.length} pending revise request(s) in ${args.scenario}:\n\n${lines.join("\n")}` },
            { type: "text", text: JSON.stringify(pending, null, 2) },
          ],
        };
      }

      case "plan_list_pending_mentions": {
        if (!args.workspaceRoot || !args.scenario) {
          throw new Error("workspaceRoot and scenario are required");
        }
        const commentMgr = await import("./comment-manager.js");
        const pending = await commentMgr.listPendingMentions(args.workspaceRoot, args.scenario);
        if (pending.length === 0) {
          return textResult(`No pending persona mentions in ${args.scenario}.`);
        }
        const lines = pending.map(
          (p) => `  ${p.doc.padEnd(22)} @${p.persona.padEnd(9)} ${p.id}  ${JSON.stringify(p.body).slice(0, 80)}  (${p.author})`
        );
        return {
          content: [
            { type: "text", text: `${pending.length} pending @-mention(s) in ${args.scenario}:\n\n${lines.join("\n")}` },
            { type: "text", text: JSON.stringify(pending, null, 2) },
          ],
        };
      }

      case "plan_post_persona_reply": {
        const required = ["workspaceRoot", "scenario", "doc", "parentId", "persona", "body"];
        for (const f of required) {
          if (!args[f]) throw new Error(`${f} is required`);
        }
        const commentMgr = await import("./comment-manager.js");
        // MCP is always running on behalf of the workspace host. We pass
        // a synthesized actor so the persona-reply carries an audit
        // `postedBy` of "mcp:<persona>" for tracing who relayed it.
        const actor = { name: `mcp:${args.persona}`, role: "host" };
        const reply = await commentMgr.postPersonaReply(
          args.workspaceRoot,
          args.scenario,
          args.doc,
          args.parentId,
          args.persona,
          args.body,
          actor,
        );
        return {
          content: [
            { type: "text", text: `Posted @${args.persona} reply ${reply.id} on ${args.scenario}/${args.doc} (parent ${args.parentId}).` },
            { type: "text", text: JSON.stringify(reply, null, 2) },
          ],
        };
      }

      // ---- plan_restart -------------------------------------------------
      case "plan_restart": {
        const reason = (args && args.reason) || "manual restart requested";
        // Exit ~300ms after returning so the JSON-RPC response lands before
        // the transport dies. Claude Code treats a 0-exit of an MCP server
        // as "disconnect; respawn", which is exactly what we want.
        setTimeout(() => {
          console.error(`[plan-harness] exiting for respawn — ${reason}`);
          process.exit(0);
        }, 300);
        return textResult(
          `[plan-harness] scheduled exit for respawn — ${reason}\n` +
          `Claude Code will reconnect within a few seconds with the latest plugin bundle.`,
        );
      }

      // ---- Unknown tool -------------------------------------------------
      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: "${name}".`,
            },
          ],
          isError: true,
        };
    }
  } catch (err) {
    console.error(`[plan-harness] Error in tool "${name}":`, err);
    return {
      content: [
        {
          type: "text",
          text: `Error executing ${name}: ${err.message}`,
        },
      ],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap a text string in the MCP content envelope. */
function textResult(text) {
  return { content: [{ type: "text", text }] };
}

/** Format bytes to a human-readable string. */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ---------------------------------------------------------------------------
// Staleness watcher — exit when a newer plugin version lands
// ---------------------------------------------------------------------------
//
// Two upgrade paths to catch:
//
//   (a) Dev flow — `npm run dev` rewrites dist/index.js in place. Caught by
//       watching this exact file's mtime.
//   (b) User flow — `claude plugins update` writes a new <cache>/.../<version>/
//       directory *beside* ours. Our own dist/index.js is untouched, so we
//       also scan sibling directories for a higher semver.
//
// On either trigger, log + exit(0). The MCP SDK's stdio transport terminates
// cleanly and Claude Code respawns us against whichever version is current.
//
// Env overrides:
//   PLAN_HARNESS_NO_WATCH=1   — disable the watcher (useful in tests)
//   PLAN_HARNESS_WATCH_MS=<n> — poll interval in ms (default 30_000)
startStalenessWatcher();

function startStalenessWatcher() {
  if (process.env.PLAN_HARNESS_NO_WATCH === "1") return;
  const intervalMs = Number(process.env.PLAN_HARNESS_WATCH_MS) || 30_000;

  let bundleFile;
  try {
    bundleFile = fileURLToPath(import.meta.url);
  } catch {
    return;
  }

  let startupMtime;
  try {
    startupMtime = statSync(bundleFile).mtimeMs;
  } catch {
    return;
  }

  // <cache>/<mkt>/plan-harness/<version>/local-proxy/src/index.js
  // or bundled: .../<version>/local-proxy/dist/index.js
  // Walk up to find a dir whose basename is a semver — that's "my version".
  const thisDir = dirname(bundleFile);
  const localProxyDir = dirname(thisDir);
  const maybeVersionDir = dirname(localProxyDir);
  const pluginRoot = dirname(maybeVersionDir);
  const myVersion = basename(maybeVersionDir);
  const isVersioned = /^\d+\.\d+\.\d+$/.test(myVersion);

  // In dev (working copy, NOT under a versioned plugin-cache dir) we skip the
  // watcher entirely. `npm run dev` rewrites dist/index.js every iteration; if
  // we respawned on mtime drift the server would die mid-session whenever the
  // user rebuilds. End users only ever run from the versioned cache, so they
  // still get auto-respawn on upgrades there.
  if (!isVersioned) {
    console.error(`[plan-harness] bundle=${bundleFile} version=dev watcher=disabled (working-copy run)`);
    return;
  }

  console.error(
    `[plan-harness] bundle=${bundleFile} version=${myVersion} watcher=${intervalMs}ms`,
  );

  // Require N consecutive misses before triggering — antivirus / sync tools
  // can momentarily hide the bundle file. Default 3 (so ~90s of misses with
  // a 30s interval) before we believe the bundle is actually gone.
  const missThreshold = Number(process.env.PLAN_HARNESS_WATCH_MISS_THRESHOLD) || 3;
  let consecutiveMisses = 0;

  const timer = setInterval(() => {
    // (a) in-place mtime drift
    try {
      const m = statSync(bundleFile).mtimeMs;
      consecutiveMisses = 0;
      if (m !== startupMtime) {
        clearInterval(timer);
        exitForRespawn(`bundle rewritten in place (mtime drift at ${new Date(m).toISOString()})`);
        return;
      }
    } catch {
      consecutiveMisses += 1;
      if (consecutiveMisses < missThreshold) {
        console.error(`[plan-harness] bundle stat failed (${consecutiveMisses}/${missThreshold}) — will retry`);
        return;
      }
      clearInterval(timer);
      exitForRespawn(`bundle file missing for ${consecutiveMisses} consecutive polls`);
      return;
    }

    // (b) newer sibling version dir appeared
    try {
      for (const entry of readdirSync(pluginRoot)) {
        if (!/^\d+\.\d+\.\d+$/.test(entry)) continue;
        if (semverGt(entry, myVersion)) {
          clearInterval(timer);
          exitForRespawn(`upgrade detected: ${myVersion} → ${entry}`);
          return;
        }
      }
    } catch {
      // pluginRoot unreadable — ignore, try next tick
    }
  }, intervalMs);
  timer.unref?.();
}

function semverGt(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return true;
    if (pa[i] < pb[i]) return false;
  }
  return false;
}

function exitForRespawn(reason) {
  console.error(`[plan-harness] exiting for respawn — ${reason}`);
  setTimeout(() => process.exit(0), 50);
}

/**
 * Start the HTTP dashboard if it isn't running and return the live URL.
 *
 * The cached `dashboardUrl` is unreliable as a "running?" signal — the HTTP
 * server can die (uncaught error, manual stop) without this module being
 * notified. The truth source is `isDashboardRunning()` from web-server.js.
 * When the cache disagrees with the runtime, clear it and re-start.
 */
async function ensureDashboard(workspaceRoot, port) {
  const ws = await import("./web-server.js");
  if (ws.isDashboardRunning()) {
    const liveUrl = ws.getDashboardUrl();
    if (liveUrl) dashboardUrl = liveUrl;
    return dashboardUrl;
  }
  // Cache was stale — server died or never started.
  if (dashboardUrl) console.error(`[plan-harness] cached dashboard URL ${dashboardUrl} is stale; restarting`);
  dashboardUrl = null;
  const url = await ws.startDashboard(workspaceRoot ?? process.cwd(), port);
  dashboardUrl = url ?? `http://localhost:${port}`;
  return dashboardUrl;
}

// ---------------------------------------------------------------------------
// Process-wide stability guards
//
// The MCP server is long-lived (Claude Code keeps it spawned for the whole
// session). A single uncaught throw or unhandled rejection in an async
// handler — e.g. a transient ENOENT during readdir, a write to a closed
// socket, a corrupt JSONL line — would otherwise tear the whole process
// down and disconnect every active client.
//
// Policy:
//   - Log every uncaught error/rejection but DO NOT exit.
//   - Trust SIGTERM / SIGINT for shutdown (graceful: close HTTP, then exit).
//   - Only exit(0) on the explicit respawn paths (watcher / plan_restart).
//
// Override with PLAN_HARNESS_STRICT=1 to restore Node's default (crash on
// uncaught) — useful in CI / test runs.
// ---------------------------------------------------------------------------

const strict = process.env.PLAN_HARNESS_STRICT === "1";
let uncaughtCount = 0;

process.on("uncaughtException", (err, origin) => {
  uncaughtCount += 1;
  console.error(`[plan-harness] uncaughtException #${uncaughtCount} (origin=${origin}):`, err?.stack || err);
  if (strict) process.exit(1);
  // If we're stuck in a tight crash loop (>20 uncaught in <60s) exit so the
  // harness can respawn us cleanly. Otherwise stay alive.
  if (uncaughtCount > 20) {
    console.error("[plan-harness] >20 uncaught exceptions — exiting for respawn");
    setTimeout(() => process.exit(1), 50);
  }
});
process.on("unhandledRejection", (reason, promise) => {
  uncaughtCount += 1;
  console.error(`[plan-harness] unhandledRejection #${uncaughtCount}:`, reason?.stack || reason);
  if (strict) process.exit(1);
});

// Reset the crash counter periodically so transient bursts don't accumulate.
setInterval(() => { uncaughtCount = Math.max(0, uncaughtCount - 1); }, 60_000).unref?.();

let shuttingDown = false;
async function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`[plan-harness] ${signal} received — shutting down gracefully`);
  try {
    const { stopDashboard } = await import("./web-server.js");
    await Promise.race([
      stopDashboard(),
      new Promise((r) => setTimeout(r, 2000)),  // hard cap so shutdown doesn't hang
    ]);
  } catch (err) {
    console.error(`[plan-harness] graceful shutdown stop error (continuing): ${err?.message}`);
  }
  process.exit(0);
}
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

// ---------------------------------------------------------------------------
// Start the transport
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[plan-harness] MCP server running on stdio.");

// Auto-start the local dashboard so `localhost:<port>` is available without an
// explicit plan_serve_dashboard call. MCP init stays non-blocking: the dashboard
// is scheduled for the next tick. Workspace root defaults to process.cwd()
// (Claude Code sets this to the project root when it spawns MCP servers).
// Opt out with PLAN_HARNESS_NO_AUTO_DASHBOARD=1.
if (!process.env.PLAN_HARNESS_NO_AUTO_DASHBOARD) {
  setImmediate(async () => {
    try {
      const port = Number(process.env.PLAN_HARNESS_DASHBOARD_PORT) || 3847;
      const url = await ensureDashboard(process.cwd(), port);
      console.error(`[plan-harness] Dashboard auto-started at ${url}`);
    } catch (err) {
      console.error(`[plan-harness] Dashboard auto-start failed (non-fatal): ${err.message}`);
    }
  });
}

// Export for testing
export { server };
