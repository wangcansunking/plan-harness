/**
 * plan-manager.js — File-system operations for the plan-harness plugin.
 *
 * All functions handle errors gracefully (returning empty arrays/objects
 * rather than throwing) so that the MCP server always has something to
 * send back to the client.
 *
 * Paths are normalised to forward slashes for cross-platform consistency.
 */

import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join, basename, extname, relative, sep } from "node:path";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a path to forward slashes. */
const norm = (p) => p.split(sep).join("/");

/** Safely read a JSON file, returning `null` on failure. */
async function readJson(filePath) {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Safely stat a path, returning `null` on failure. */
async function safeStat(filePath) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

/** Map a file extension to a human-readable plan type. */
function planTypeFromName(fileName) {
  const base = basename(fileName, extname(fileName)).toLowerCase();
  const map = {
    design: "design",
    "test-plan": "test-plan",
    "state-machine": "state-machine",
    "test-cases": "test-cases",
    "implementation-plan": "implementation-plan",
    dashboard: "dashboard",
    manifest: "manifest",
  };
  return map[base] ?? "other";
}

/**
 * Recursively walk a directory tree looking for directories named `plans`.
 * Returns an array of absolute paths (forward-slash normalised).
 */
async function findPlansDirs(dir, maxDepth = 5, currentDepth = 0) {
  if (currentDepth > maxDepth) return [];

  const results = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    // Skip common heavy/irrelevant directories
    const name = entry.name;
    if (
      name === "node_modules" ||
      name === ".git" ||
      name === "target" ||
      name === "bin" ||
      name === "obj" ||
      name === ".vs" ||
      name === "dist" ||
      name === "cc-history"
    ) {
      continue;
    }

    const fullPath = join(dir, name);

    if (name === "plans") {
      results.push(norm(fullPath));
    } else {
      // Recurse deeper
      const nested = await findPlansDirs(fullPath, maxDepth, currentDepth + 1);
      results.push(...nested);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan the workspace for all `plans/` directories across repos and list
 * scenarios within each one.
 *
 * @param {string} workspaceRoot - Absolute path to the workspace root
 * @returns {Promise<Array<{repoRoot: string, scenario: string, files: Array, hasDesign: boolean, hasTestPlan: boolean, hasStateMachine: boolean, hasTestCases: boolean, hasImplementationPlan: boolean, hasDashboard: boolean}>>}
 */
export async function listScenarios(workspaceRoot) {
  const scenarios = [];

  try {
    const plansDirs = await findPlansDirs(workspaceRoot);

    for (const plansDir of plansDirs) {
      // The repo root is the parent of the `plans/` directory
      const repoRoot = norm(join(plansDir, ".."));

      let scenarioEntries;
      try {
        scenarioEntries = await readdir(plansDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of scenarioEntries) {
        if (!entry.isDirectory()) continue;

        const scenarioPath = norm(join(plansDir, entry.name));
        const files = await getScenarioFiles(scenarioPath);
        const fileNames = files.map((f) => f.name.toLowerCase());

        scenarios.push({
          repoRoot,
          scenario: entry.name,
          scenarioPath,
          files,
          hasAnalysis: fileNames.includes("analysis.html"),
          hasDesign: fileNames.includes("design.html"),
          hasTestPlan: fileNames.includes("test-plan.html"),
          hasStateMachine: fileNames.includes("state-machine.html"),
          hasTestCases: fileNames.includes("test-cases.html"),
          hasImplementationPlan: fileNames.includes("implementation-plan.html"),
          hasDashboard: fileNames.includes("dashboard.html"),
          hasReviewReport: fileNames.includes("review-report.html"),
        });
      }
    }
  } catch (err) {
    console.error("[plan-manager] listScenarios error:", err.message);
  }

  return scenarios;
}

/**
 * Create a new scenario directory with a manifest.json.
 *
 * @param {string} repoRoot      - Repository root path
 * @param {string} scenarioName  - Name for the new scenario (used as dir name)
 * @param {object} metadata      - Additional metadata: { description, workItem, tags, status }
 * @returns {Promise<{scenarioPath: string, manifest: object}>}
 */
export async function createScenario(repoRoot, scenarioName, metadata = {}) {
  // Sanitise the scenario name for use as a directory name.
  // Strip path-hostile chars, collapse whitespace, strip leading dots so that
  // "../../outside" cannot escape plans/ via relative-path tricks.
  const safeName = scenarioName
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/\.+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  if (!safeName) {
    throw new Error(`Invalid scenario name: "${scenarioName}"`);
  }

  const plansRoot = join(repoRoot, "plans");
  const scenarioPath = join(plansRoot, safeName);

  // Defence in depth: assert final path stays under plans/
  const rel = relative(plansRoot, scenarioPath);
  if (rel.startsWith("..") || rel.includes(sep + "..") || rel === "") {
    throw new Error(`Scenario path escapes plans/: "${scenarioName}" -> "${safeName}"`);
  }

  await mkdir(scenarioPath, { recursive: true });

  const manifest = {
    scenario: safeName,
    displayName: scenarioName,
    description: metadata.description ?? "",
    workItem: metadata.workItem ?? "",
    createdAt: new Date().toISOString(),
    tags: metadata.tags ?? [],
    status: metadata.status ?? "draft",
  };

  const manifestPath = join(scenarioPath, "manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  return { scenarioPath, manifest };
}

/**
 * List all plan files in a scenario directory.
 *
 * @param {string} scenarioPath - Absolute path to the scenario directory
 * @returns {Promise<Array<{name: string, path: string, type: string, size: number, modified: string}>>}
 */
export async function getScenarioFiles(scenarioPath) {
  const files = [];

  let entries;
  try {
    entries = await readdir(scenarioPath, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const filePath = norm(join(scenarioPath, entry.name));
    const fileStat = await safeStat(filePath);

    files.push({
      name: entry.name,
      path: filePath,
      type: planTypeFromName(entry.name),
      size: fileStat?.size ?? 0,
      modified: fileStat?.mtime?.toISOString() ?? "",
    });
  }

  return files;
}

/**
 * Read the manifest.json from a scenario directory.
 *
 * @param {string} scenarioPath - Absolute path to the scenario directory
 * @returns {Promise<object|null>}
 */
export async function getManifest(scenarioPath) {
  return readJson(join(scenarioPath, "manifest.json"));
}

/**
 * Update the manifest.json in a scenario directory (shallow merge).
 *
 * @param {string} scenarioPath - Absolute path to the scenario directory
 * @param {object} updates      - Fields to merge into the manifest
 * @returns {Promise<object>}   - The updated manifest
 */
export async function updateManifest(scenarioPath, updates) {
  const manifestPath = join(scenarioPath, "manifest.json");
  const existing = (await readJson(manifestPath)) ?? {};
  const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };

  await writeFile(manifestPath, JSON.stringify(merged, null, 2), "utf-8");
  return merged;
}

/**
 * Check completion status by scanning for evidence that plan items have been
 * implemented.
 *
 * Strategy:
 *  1. Parse implementation-plan.html for checklist items (looks for
 *     `data-step`, `<li>`, or checkbox-style lines).
 *  2. For each item, look for matching TODOs / files / git references in the
 *     repository.
 *
 * @param {string} scenarioPath - Path to the scenario directory
 * @param {string} repoRoot     - Path to the repo root for code scanning
 * @returns {Promise<{total: number, completed: number, percentage: number, items: Array<{name: string, status: string, evidence: string}>}>}
 */
export async function checkCompletion(scenarioPath, repoRoot) {
  const result = { total: 0, completed: 0, percentage: 0, items: [] };

  // ---- Step 1: Extract plan items from implementation-plan.html ----------
  const planPath = join(scenarioPath, "implementation-plan.html");
  let planHtml;
  try {
    planHtml = await readFile(planPath, "utf-8");
  } catch {
    // No implementation plan yet — nothing to check
    return result;
  }

  // Extract items from data-step attributes
  const dataStepRegex = /data-step=["']([^"']+)["']/g;
  const items = new Set();
  let match;
  while ((match = dataStepRegex.exec(planHtml)) !== null) {
    items.add(match[1]);
  }

  // Also extract checklist items: lines like "[ ] Do something" or
  // <li>...</li> that look like action items
  const checkboxRegex = /\[([ xX])\]\s*(.+)/g;
  while ((match = checkboxRegex.exec(planHtml)) !== null) {
    items.add(match[2].trim());
  }

  // Extract <li> content as fallback if no structured items found
  if (items.size === 0) {
    const liRegex = /<li[^>]*>([^<]+)<\/li>/gi;
    while ((match = liRegex.exec(planHtml)) !== null) {
      const text = match[1].trim();
      if (text.length > 5 && text.length < 200) {
        items.add(text);
      }
    }
  }

  // Also look for heading-based steps: <h3>Step 1: Create the widget</h3>
  const headingStepRegex = /<h[2-4][^>]*>(?:Step\s*\d+[:\s.-]*)?(.+?)<\/h[2-4]>/gi;
  while ((match = headingStepRegex.exec(planHtml)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, "").trim();
    if (text.length > 3 && text.length < 200) {
      items.add(text);
    }
  }

  if (items.size === 0) {
    return result;
  }

  result.total = items.size;

  // ---- Step 2: For each item, look for evidence in the codebase ----------

  // Build a simple index: read the manifest to find scenario name for TODO
  // matching, and scan source directories for file existence.
  const manifest = await getManifest(scenarioPath);
  const scenarioTag = manifest?.scenario ?? basename(scenarioPath);

  for (const item of items) {
    const evidence = [];

    // 2a. Check if there is a file mentioned in the item that exists in the repo
    const filePatterns = item.match(
      /[\w./-]+\.(ts|tsx|js|jsx|cs|csproj|json|html|css|xml|py)\b/gi
    );
    if (filePatterns) {
      for (const pattern of filePatterns) {
        const candidate = join(repoRoot, pattern);
        const s = await safeStat(candidate);
        if (s) {
          evidence.push(`File exists: ${norm(candidate)}`);
        }
      }
    }

    // 2b. Look for TODO comments that reference this scenario in common
    //     source directories (lightweight — only scan top-level source dirs)
    try {
      const srcDir = join(repoRoot, "sources");
      const srcStat = await safeStat(srcDir);
      if (srcStat?.isDirectory()) {
        // Scan only one level deep for speed
        const topDirs = await readdir(srcDir, { withFileTypes: true });
        for (const d of topDirs.slice(0, 5)) {
          if (!d.isDirectory()) continue;
          // Check first few files for TODO references
          const innerFiles = await readdir(join(srcDir, d.name), {
            withFileTypes: true,
          }).catch(() => []);
          for (const f of innerFiles.slice(0, 20)) {
            if (!f.isFile()) continue;
            const ext = extname(f.name).toLowerCase();
            if (![".cs", ".ts", ".tsx", ".js", ".jsx", ".py"].includes(ext)) continue;
            try {
              const content = await readFile(join(srcDir, d.name, f.name), "utf-8");
              // Only precise matches — a bare `.includes(tag)` on short tags like
              // "auth"/"ui" produces false positives in nearly every source file.
              if (
                content.includes(`TODO(${scenarioTag})`) ||
                content.includes(`TODO: ${scenarioTag}`)
              ) {
                evidence.push(`Reference found in ${d.name}/${f.name}`);
              }
            } catch {
              // skip unreadable files
            }
          }
        }
      }
    } catch {
      // source scanning failed — not critical
    }

    // 2c. Determine status
    const status = evidence.length > 0 ? "completed" : "pending";
    if (status === "completed") {
      result.completed++;
    }

    result.items.push({
      name: item,
      status,
      evidence: evidence.length > 0 ? evidence.join("; ") : "No evidence found",
    });
  }

  result.percentage =
    result.total > 0 ? Math.round((result.completed / result.total) * 100) : 0;

  return result;
}

/**
 * Get codebase context for a repo by scanning common config and documentation
 * files.
 *
 * @param {string} repoRoot - Absolute path to the repository root
 * @returns {Promise<{projectType: string, techStack: string[], patterns: string[], conventions: string[], structure: object}>}
 */
export async function getCodebaseContext(repoRoot) {
  const context = {
    projectType: "unknown",
    techStack: [],
    patterns: [],
    conventions: [],
    structure: {},
  };

  try {
    // ---- 1. Read CLAUDE.md for conventions and patterns ------------------
    for (const claudePath of ["CLAUDE.md", "claude.md"]) {
      const content = await readFile(join(repoRoot, claudePath), "utf-8").catch(
        () => null
      );
      if (content) {
        context.conventions.push(`Found ${claudePath} with project guidance`);

        // Extract tech stack hints
        if (/react/i.test(content)) context.techStack.push("React");
        if (/angular/i.test(content)) context.techStack.push("Angular");
        if (/vue/i.test(content)) context.techStack.push("Vue");
        if (/\.net|csharp|c#/i.test(content)) context.techStack.push(".NET/C#");
        if (/node\.?js/i.test(content)) context.techStack.push("Node.js");
        if (/python/i.test(content)) context.techStack.push("Python");
        if (/typescript/i.test(content)) context.techStack.push("TypeScript");
        if (/service\s*fabric/i.test(content)) context.techStack.push("Azure Service Fabric");
        if (/azure\s*functions?/i.test(content)) context.techStack.push("Azure Functions");
        if (/neo4j/i.test(content)) context.techStack.push("Neo4j");
        if (/webpack/i.test(content)) context.techStack.push("Webpack");
        if (/nx\b/i.test(content)) context.techStack.push("NX");

        // Extract patterns
        if (/msbuild/i.test(content)) context.patterns.push("MSBuild traversal");
        if (/t4\s*template/i.test(content)) context.patterns.push("T4 code generation");
        if (/ev2|express\s*v2/i.test(content)) context.patterns.push("EV2 deployment");
        if (/odata/i.test(content)) context.patterns.push("OData");
        if (/redux/i.test(content)) context.patterns.push("Redux state management");
        if (/zustand/i.test(content)) context.patterns.push("Zustand state management");
        if (/mobx/i.test(content)) context.patterns.push("MobX state management");

        // Extract convention snippets (lines starting with - or * that look like rules)
        const conventionLines = content.match(
          /^[\s]*[-*]\s+(.*(?:must|should|always|never|prefer|avoid|use|do not).+)$/gim
        );
        if (conventionLines) {
          for (const line of conventionLines.slice(0, 15)) {
            context.conventions.push(line.replace(/^[\s]*[-*]\s+/, "").trim());
          }
        }

        break; // Only read the first one found
      }
    }

    // ---- 2. Read package.json for Node.js projects ----------------------
    const pkgJson = await readJson(join(repoRoot, "package.json"));
    if (pkgJson) {
      context.projectType = "node";
      if (pkgJson.dependencies) {
        const deps = Object.keys(pkgJson.dependencies);
        if (deps.includes("react")) context.techStack.push("React");
        if (deps.includes("next")) context.techStack.push("Next.js");
        if (deps.includes("express")) context.techStack.push("Express");
        if (deps.includes("vue")) context.techStack.push("Vue");
        if (deps.includes("@angular/core")) context.techStack.push("Angular");
        if (deps.includes("typescript")) context.techStack.push("TypeScript");
      }
      if (pkgJson.devDependencies) {
        const devDeps = Object.keys(pkgJson.devDependencies);
        if (devDeps.includes("jest")) context.patterns.push("Jest testing");
        if (devDeps.includes("webpack")) context.techStack.push("Webpack");
        if (devDeps.includes("typescript")) context.techStack.push("TypeScript");
        if (devDeps.includes("eslint")) context.patterns.push("ESLint");
      }
    }

    // ---- 3. Scan for .csproj files (up to 2 levels deep) ----------------
    const csprojFiles = [];
    const scanForCsproj = async (dir, depth = 0) => {
      if (depth > 2) return;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".csproj")) {
          csprojFiles.push(norm(join(dir, entry.name)));
        } else if (
          entry.isDirectory() &&
          !["node_modules", ".git", "target", "bin", "obj"].includes(entry.name)
        ) {
          await scanForCsproj(join(dir, entry.name), depth + 1);
        }
      }
    };
    await scanForCsproj(repoRoot);

    if (csprojFiles.length > 0) {
      context.projectType =
        context.projectType === "node" ? "mixed (.NET + Node)" : ".NET";
      context.techStack.push(".NET/C#");

      // Read first csproj for framework info
      const firstCsproj = await readFile(csprojFiles[0], "utf-8").catch(() => "");
      const tfm = firstCsproj.match(
        /<TargetFramework>(.*?)<\/TargetFramework>/
      );
      if (tfm) context.techStack.push(tfm[1]);

      context.structure.csprojFiles = csprojFiles.slice(0, 10);
    }

    // ---- 4. Read README.md for additional context -----------------------
    const readme = await readFile(join(repoRoot, "README.md"), "utf-8").catch(
      () => null
    );
    if (readme) {
      context.conventions.push("Has README.md");
      // Extract a short summary (first non-empty, non-heading paragraph)
      const paragraphs = readme.split(/\n\n+/);
      for (const p of paragraphs) {
        const trimmed = p.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.length > 20) {
          context.structure.readmeSummary = trimmed.slice(0, 300);
          break;
        }
      }
    }

    // ---- 5. Top-level directory structure --------------------------------
    try {
      const topEntries = await readdir(repoRoot, { withFileTypes: true });
      context.structure.topLevel = topEntries
        .filter(
          (e) =>
            !e.name.startsWith(".") ||
            e.name === ".claude-plugin" ||
            e.name === ".github"
        )
        .map((e) => ({
          name: e.name,
          isDir: e.isDirectory(),
        }))
        .slice(0, 30);
    } catch {
      // not critical
    }

    // De-duplicate tech stack and patterns
    context.techStack = [...new Set(context.techStack)];
    context.patterns = [...new Set(context.patterns)];
  } catch (err) {
    console.error("[plan-manager] getCodebaseContext error:", err.message);
  }

  return context;
}
