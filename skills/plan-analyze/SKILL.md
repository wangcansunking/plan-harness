---
name: plan-analyze
description: Deep codebase analysis — generates an interactive HTML document covering architecture, patterns, conventions, tech stack, and code health. Accepts a repo path or scenario name as argument.
---

# plan-analyze

Generate a comprehensive codebase analysis document as an interactive HTML file. This goes far deeper than `/plan-init` (which creates a lightweight `manifest.json`). The analysis document is a full reference that the team uses throughout planning and implementation.

## Input

| Invocation | Behavior |
|------------|----------|
| `/plan-analyze` | Use current scenario from `manifest.json` |
| `/plan-analyze C:\MCDC\DevXApps` | Analyze a specific repo root |
| `/plan-analyze permission-risk-survey` | Analyze for a specific scenario by name |

### Argument Resolution

1. **Absolute path to a repo** — if the path exists and contains source code (has `.git/`, `package.json`, `*.csproj`, or `CLAUDE.md`), use it as `repoRoot`. Look for a scenario in `{repoRoot}/plans/` or use cwd scenario.
2. **Scenario name** — search `plans/` directories for a matching subdirectory, read its `manifest.json` for the repo root.
3. **No argument** — read `manifest.json` from current scenario. If not found, prompt for repo path.

## When to Use

- After `/plan-init` has established the scenario and basic context
- Before `/plan-design` — understanding the existing codebase is prerequisite to designing changes
- When the user says "analyze the codebase", "analyze code", "code analysis", "understand the architecture", or "plan-analyze"
- When joining an unfamiliar repo and needing to understand its structure before making changes

## What It Produces

- `{scenario-path}/analysis.html` — Self-contained interactive HTML document
- Updated `manifest.json` with the analysis file entry
- Updated `manifest.json` with enriched context from deep analysis

## Prerequisites

- `manifest.json` should exist (run `/plan-init` first), but if a repo path argument is provided, the skill can work without it
- If no scenario exists yet, the skill will create one via `plan_create_scenario` MCP tool
- The target repo must be accessible on disk

## Agent Team

| Role | Prompt Source | Responsibility |
|------|-------------|----------------|
| **Architect** | `C:\MCDC\plan-harness\prompts\architect-prompt.md` | Architecture layers, component relationships, dependency graph, design patterns |
| **Frontend Dev** | `C:\MCDC\plan-harness\prompts\frontend-dev-prompt.md` | UI framework analysis, component library, state management, routing patterns |
| **Backend Dev** | `C:\MCDC\plan-harness\prompts\backend-dev-prompt.md` | API layer, data access, service integration, configuration, deployment |
| **Tester** | `C:\MCDC\plan-harness\prompts\tester-prompt.md` | Test infrastructure, coverage patterns, test conventions, CI integration |
| **Writer** | `C:\MCDC\plan-harness\prompts\writer-prompt.md` | Assembles all analysis into cohesive HTML with navigation and cross-references |

## Workflow

### Step 1: Load Context

```
Read manifest.json from the scenario directory.
Extract: repoRoot, projectType, techStack, scenarioName
```

If `manifest.json` does not exist:
> "Run `/plan-init` first to establish the planning context."

### Step 2: Deep Codebase Exploration

Dispatch **4 agents in parallel** using the Agent tool. Each agent explores a different dimension of the codebase.

#### Agent 1: Architect — Architecture Analysis

```
Prompt:
You are the Architect on a codebase analysis team.

Read the prompt template at C:\MCDC\plan-harness\prompts\architect-prompt.md for general guidelines.

CONTEXT:
- Repository root: {repoRoot}
- Project type: {projectType}
- Tech stack: {techStack}

YOUR TASK — Deep architecture analysis:

1. DIRECTORY STRUCTURE
   - Map the top-level directory layout
   - Identify source code directories vs build/config/test
   - Note any monorepo/workspace structure

2. ARCHITECTURE LAYERS
   - Identify the layering pattern (e.g., Controller → Service → DAL → DB)
   - List each layer with key classes/files
   - Map the dependency direction between layers

3. COMPONENT GRAPH
   - List major components/modules
   - Map relationships between them (depends-on, calls, imports)
   - Identify shared libraries and utilities
   - Generate an SVG component diagram using CSS variables (var(--accent), var(--surface), etc.)

4. DESIGN PATTERNS
   - Identify patterns in use: DI, Repository, Factory, Observer, MVC, etc.
   - Show examples from the code for each pattern
   - Note any anti-patterns or technical debt

5. CONFIGURATION & DEPLOYMENT
   - Build system (MSBuild, webpack, NX, etc.)
   - Environment configurations
   - Deployment pipeline (EV2, Azure Pipelines, etc.)
   - Feature flags / flight gates

6. DEPENDENCY ANALYSIS
   - Key external dependencies (NuGet, npm packages)
   - Internal dependencies between projects
   - Generate a dependency graph SVG

OUTPUT: Structured markdown sections with SVG diagrams, tables, and code examples.
Report under these exact headings: "Directory Structure", "Architecture Layers", "Component Graph", "Design Patterns", "Configuration & Deployment", "Dependency Analysis"
```

#### Agent 2: Frontend Dev — Frontend Analysis

```
Prompt:
You are the Frontend Developer on a codebase analysis team.

Read the prompt template at C:\MCDC\plan-harness\prompts\frontend-dev-prompt.md for general guidelines.

CONTEXT:
- Repository root: {repoRoot}
- Project type: {projectType}
- Tech stack: {techStack}

YOUR TASK — Frontend codebase analysis:

1. FRAMEWORK & TOOLING
   - React version, TypeScript config, bundler (webpack/vite/NX)
   - Package manager, monorepo structure if applicable
   - Dev server configuration

2. COMPONENT LIBRARY
   - UI framework (Fluent UI v8/v9, Material, etc.)
   - Custom component patterns
   - Component naming and file organization conventions
   - Storybook or similar documentation

3. STATE MANAGEMENT
   - Stores in use (Redux, MobX, Zustand, React Context)
   - Data flow patterns (actions, reducers, selectors, observers)
   - Server state management (React Query, SWR, manual fetch)

4. ROUTING & NAVIGATION
   - Router library and configuration
   - Route organization pattern
   - Navigation guards / auth checks
   - Deep linking / URL parameter handling

5. STYLING APPROACH
   - CSS methodology (CSS Modules, styled-components, Tailwind, inline)
   - Theme system
   - Responsive design approach

6. INTERNATIONALIZATION
   - i18n library and pattern
   - String extraction workflow
   - Locale file organization

7. CODE CONVENTIONS
   - File naming conventions (PascalCase, camelCase, kebab-case)
   - Import ordering patterns
   - Test file co-location
   - Linting and formatting rules

OUTPUT: Structured markdown with tables, code examples from the actual codebase, and a component tree diagram.
Report under these exact headings: "Framework & Tooling", "Component Library", "State Management", "Routing & Navigation", "Styling Approach", "Internationalization", "Code Conventions"

If this is a backend-only project with no frontend code, report: "No frontend code found in this repository." and skip the detailed analysis.
```

#### Agent 3: Backend Dev — Backend Analysis

```
Prompt:
You are the Backend Developer on a codebase analysis team.

Read the prompt template at C:\MCDC\plan-harness\prompts\backend-dev-prompt.md for general guidelines.

CONTEXT:
- Repository root: {repoRoot}
- Project type: {projectType}
- Tech stack: {techStack}

YOUR TASK — Backend codebase analysis:

1. API LAYER
   - Framework (ASP.NET Core, Express, Azure Functions)
   - Controller/route organization
   - Authentication & authorization patterns
   - API versioning strategy
   - Request/response middleware pipeline

2. DATA ACCESS
   - Database technology (Neo4j, SQL, CosmosDB)
   - ORM / query builder / raw queries
   - Repository pattern implementation
   - Migration strategy
   - Connection management

3. SERVICE LAYER
   - Business logic organization
   - Service-to-service communication patterns
   - Message queue / event bus usage
   - Caching strategy

4. CODE GENERATION
   - T4 templates, source generators, or other codegen
   - Generated file conventions (.g.cs, .g.ts)
   - Model definition format (XML, JSON schema, etc.)
   - Regeneration workflow

5. ERROR HANDLING & LOGGING
   - Exception hierarchy
   - Error response format
   - Logging framework and conventions
   - Health checks and monitoring

6. SECURITY
   - Authentication mechanisms (S2S, user auth, API keys)
   - Authorization model (RBAC, claims, policies)
   - Credential management (Key Vault, managed identity)
   - Security scanning tools in CI

OUTPUT: Structured markdown with API endpoint tables, data flow diagrams, and code pattern examples.
Report under these exact headings: "API Layer", "Data Access", "Service Layer", "Code Generation", "Error Handling & Logging", "Security"

If this is a frontend-only project, report: "No backend code found in this repository." and skip the detailed analysis.
```

#### Agent 4: Tester — Test Infrastructure Analysis

```
Prompt:
You are the Tester on a codebase analysis team.

Read the prompt template at C:\MCDC\plan-harness\prompts\tester-prompt.md for general guidelines.

CONTEXT:
- Repository root: {repoRoot}
- Project type: {projectType}
- Tech stack: {techStack}

YOUR TASK — Test infrastructure analysis:

1. TEST FRAMEWORKS
   - Unit test framework (MSTest, xUnit, Jest, Vitest)
   - Integration test framework
   - E2E test framework (Playwright, Cypress, Selenium)
   - Mocking libraries

2. TEST ORGANIZATION
   - Test directory structure (co-located vs separate tree)
   - Test file naming conventions
   - Test class/function naming patterns
   - Test data management (fixtures, factories, builders)

3. TEST COVERAGE
   - Coverage tool and thresholds
   - Areas with good coverage
   - Areas with gaps or no coverage
   - Coverage reporting in CI

4. CI/CD TESTING
   - Which tests run in CI (precheckin, post-commit)
   - Test parallelization
   - Flaky test management
   - Test result reporting

5. TEST PATTERNS
   - Common test setup patterns (beforeEach, fixtures)
   - Assertion style (fluent, classic)
   - Test data creation patterns
   - Snapshot testing usage

OUTPUT: Structured markdown with coverage tables, test organization diagrams, and pattern examples.
Report under these exact headings: "Test Frameworks", "Test Organization", "Test Coverage", "CI/CD Testing", "Test Patterns"
```

### Step 3: Assemble Analysis Document

After all 4 agents return, dispatch the **Writer agent** to combine outputs:

```
Prompt:
You are the Writer assembling a codebase analysis document.

Read the prompt template at C:\MCDC\plan-harness\prompts\writer-prompt.md for CSS and HTML structure guidelines.

INPUTS:
- Architect analysis: {architect_output}
- Frontend analysis: {frontend_output}
- Backend analysis: {backend_output}
- Test analysis: {tester_output}
- Scenario metadata: {scenario_name}, {repo_root}, {date}

CREATE a self-contained HTML file (analysis.html) with these sections:

1. #overview — Executive Summary
   - Repository name, tech stack summary, key findings
   - Health indicators: green/yellow/red badges for architecture, code quality, test coverage, documentation

2. #structure — Directory Structure (from Architect)
   - Interactive tree view or formatted listing
   - Key directories highlighted with descriptions

3. #architecture — Architecture Layers (from Architect)
   - Layer diagram (SVG)
   - Component graph (SVG)
   - Pattern inventory table

4. #frontend — Frontend Analysis (from Frontend Dev)
   - Framework & component library details
   - State management approach
   - Routing and navigation patterns
   - Skip this section entirely if no frontend code exists

5. #backend — Backend Analysis (from Backend Dev)
   - API layer design
   - Data access patterns
   - Service integration
   - Code generation pipeline (if applicable)
   - Skip this section entirely if no backend code exists

6. #testing — Test Infrastructure (from Tester)
   - Framework overview
   - Coverage summary with visual indicators
   - CI/CD integration

7. #patterns — Code Patterns & Conventions
   - Combined naming conventions, import patterns, file organization
   - "When adding new code, follow these patterns" guidance

8. #dependencies — Dependency Graph (from Architect)
   - SVG dependency diagram
   - Key external dependency versions
   - Internal project dependencies

9. #health — Code Health Assessment
   - Summary scorecards (4-card grid):
     Architecture: {score}/5 with one-line rationale
     Code Quality: {score}/5
     Test Coverage: {score}/5
     Documentation: {score}/5
   - Technical debt inventory (if any identified)
   - Recommendations for improvement

10. #recommendations — Recommendations for New Development
    - "Before you start coding" checklist
    - Patterns to follow
    - Patterns to avoid
    - Key files to read first

PLAN NAVIGATION BAR (top of page, linking to sibling plan files):
<div class="plan-nav">
  <a href="analysis.html" class="active">Analysis</a>
  <a href="design.html">Design</a>
  <a href="state-machine.html">State Machines</a>
  <a href="test-plan.html">Test Plan</a>
  <a href="test-cases.html">Test Cases</a>
  <a href="implementation-plan.html">Implementation</a>
</div>

Use the dark/light theme system with CSS variables as specified in writer-prompt.md.
Include fixed left sidebar navigation, theme toggle, responsive layout, print styles.
```

### Step 4: Save and Update Manifest

1. Write the assembled HTML to `{scenario-path}/analysis.html`
2. Update `manifest.json`:
   ```json
   { "analysisGenerated": true, "analysisDate": "2026-04-13" }
   ```
3. Update `manifest.json` with enriched findings:
   - Add `architectureLayers`, `codePatterns`, `testFrameworks` fields from the analysis

### Step 5: Present Summary

Display to the user:

```
Analysis document generated: {scenario-path}/analysis.html

Key Findings:
- Architecture: {score}/5 — {one-liner}
- Code Quality: {score}/5 — {one-liner}
- Test Coverage: {score}/5 — {one-liner}
- Documentation: {score}/5 — {one-liner}

{N} code patterns documented, {M} recommendations for new development.

Next step: Run /plan-review to review the analysis section by section, or /plan-design to start designing.
```

## Cross-Links

| Document | Relationship |
|----------|-------------|
| `manifest.json` | **Reads** basic context, **enriches** with deep analysis |
| `design.html` | Analysis informs design decisions — design should reference patterns found here |
| `implementation-plan.html` | Implementation steps should follow conventions documented in analysis |
| `test-plan.html` | Test plan should use the test infrastructure documented here |

## Error Handling

| Error | Resolution |
|-------|-----------|
| `manifest.json` missing | "Run `/plan-init` first to establish the planning context." |
| Repository not accessible | "Cannot access repository at {repoRoot}. Check the path in manifest.json." |
| No source code found | Generate a minimal analysis noting the empty repo |
| Agent returns empty analysis | Include a placeholder section: "No {frontend/backend} code detected in this repository." |
| `analysis.html` already exists | Ask: "Analysis document already exists. Regenerate? (This will overwrite the existing document.)" |
