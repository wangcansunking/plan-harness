/**
 * Bootstrap — ensures dependencies are installed, then launches the MCP server.
 *
 * Usage:  node start.js
 */

import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const projectRoot = dirname(__filename);

if (!existsSync(resolve(projectRoot, "node_modules"))) {
    console.error("[plan-harness] First run — installing dependencies...");
    execSync("npm install --no-fund --no-audit", {
        cwd: projectRoot,
        stdio: ["ignore", "ignore", "inherit"],
    });
    console.error("[plan-harness] Dependencies installed.");
}

await import("./src/index.js");
