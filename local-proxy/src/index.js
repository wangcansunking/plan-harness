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
            s.hasDesign ? "design" : null,
            s.hasTestPlan ? "test-plan" : null,
            s.hasStateMachine ? "state-machine" : null,
            s.hasTestCases ? "test-cases" : null,
            s.hasImplementationPlan ? "impl-plan" : null,
            s.hasDashboard ? "dashboard" : null,
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
        // Return cached URL if already running
        if (dashboardUrl) {
          return textResult(`Dashboard already running at ${dashboardUrl}`);
        }

        // Try to import the web server module
        let startDashboard;
        try {
          const webServerModule = await import("./web-server.js");
          startDashboard = webServerModule.startDashboard;
        } catch {
          return textResult(
            "Dashboard server not yet available — web-server.js could not be loaded. " +
              "The plan management tools (list, create, check) are fully operational in the meantime."
          );
        }

        const port = args.port ?? 3847;
        try {
          const url = await startDashboard(args.workspaceRoot, port);
          dashboardUrl = url ?? `http://localhost:${port}`;
          return textResult(`Dashboard started at ${dashboardUrl}`);
        } catch (err) {
          return textResult(
            `Failed to start dashboard server: ${err.message}`
          );
        }
      }

      // ---- plan_share ----------------------------------------------------
      case "plan_share": {
        const { spawn } = await import("node:child_process");

        // 1. Ensure dashboard is running
        if (!dashboardUrl) {
          try {
            const webServerModule = await import("./web-server.js");
            const port = 3847;
            const url = await webServerModule.startDashboard(args.workspaceRoot, port);
            dashboardUrl = url ?? `http://localhost:${port}`;
          } catch (err) {
            return textResult(`Cannot start dashboard: ${err.message}. Start it first with plan_serve_dashboard.`);
          }
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
          } catch (err) {
            return textResult(`Cannot enable password protection: ${err.message}`);
          }
        } else {
          // Disable password protection for public/private modes
          try {
            const webServerModule = await import("./web-server.js");
            webServerModule.disablePasswordProtection();
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
      const { startDashboard } = await import("./web-server.js");
      const port = Number(process.env.PLAN_HARNESS_DASHBOARD_PORT) || 3847;
      const url = await startDashboard(process.cwd(), port);
      dashboardUrl = url;
      console.error(`[plan-harness] Dashboard auto-started at ${url}`);
    } catch (err) {
      console.error(`[plan-harness] Dashboard auto-start failed (non-fatal): ${err.message}`);
    }
  });
}

// Export for testing
export { server };
