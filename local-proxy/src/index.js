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

      // ---- Unknown tool -------------------------------------------------
      default:
        return {
          content: [
            {
              type: "text",
              text: `Unknown tool: "${name}". Available tools: plan_list_scenarios, plan_create_scenario, plan_get_files, plan_check_completion, plan_get_context, plan_serve_dashboard.`,
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

// Export for testing
export { server };
