---
name: performance-audit
description: Generation rules — 4 docs, data-driven analysis, Tokyo Night theme, anti-patterns
tags: [generation-rules]
agents: [writer]
---

# Performance Audit — Generation Rules

Rules for generating plan documents in performance optimization projects.

## Summary

Generate 4 documents: index.html, analysis.html, design.html, implementation-plan.html. Do NOT generate test-plan, test-cases, state-machine, or review-report. Every section must include at least one visual. Use diverse chart types — never repeat the same chart in adjacent sections. Use Tokyo Night theme. Each document has ONE job with zero content overlap.

## Details

### Document Set

| Document | Generate | Purpose |
|----------|----------|---------|
| index.html | Yes | 30-second project summary — key numbers, problem chart, sprint cards, expected impact |
| analysis.html | Yes | Measured data only — waterfall timelines, resource sizes, per-page breakdowns. No solutions. |
| design.html | Yes | Solution architecture — flow diagrams, decision tables, cache strategy. No code. |
| implementation-plan.html | Yes | Sprint-based execution — before/after code blocks, file paths with line numbers. No strategy. |
| state-machine.html | No | — |
| test-plan.html | No | — |
| test-cases.html | No | — |
| review-report.html | No | — |

### Content Boundaries

| Document | Contains | Does NOT contain |
|----------|----------|-----------------|
| index.html | Key numbers, bar chart, sprint cards, doc links | Details, code, deep analysis |
| analysis.html | Measured data, charts, per-page breakdown, patterns | Solutions, recommendations, code |
| design.html | Architecture diagrams, flow charts, decision tables | Code, line numbers |
| implementation-plan.html | Sprint tasks, before/after code, file paths | High-level strategy, data analysis |

### index.html Pattern

The landing page lets a reviewer understand the project in 30 seconds:
1. **Hero**: Project name + 1-line goal
2. **Key numbers**: 4 stat cards (traffic, worst metric, scope, task count)
3. **Problem chart**: Horizontal bars showing current state vs target
4. **Root causes**: 3 cards summarizing why it's slow
5. **Sprint plan**: Cards per sprint with deliverables
6. **Expected impact**: Before/after comparison
7. **Document links**: 3 cards linking to Analysis, Design, Implementation
8. **Team & Timeline**: Simple table

### analysis.html Pattern

- Summary bar chart comparing all pages + summary table
- Common static files: waterfall, size treemap, font analysis
- Per-page sections (collapsible cards), each with:
  - Stats header: FCP, wall time, API count
  - Waterfall timeline chart (API calls)
  - Static files loaded table
  - Interaction performance (search/pagination)
  - 1-line optimization callout only
- Cross-page patterns: stacked bar + heatmap + duplicate calls table
- Sub-routes: "base + incremental" — only show additional API calls. Never independent wall time.

### design.html Pattern

- Executive summary — problem, solution, success metrics table, timeline cards
- Design principles — 3-4 cards
- Core technical design — architecture SVG, strategy matrix tables
- Per-area designs — flow diagrams, decision tables, impact metrics. NO CODE.
- Dashboard preview — sample charts with mock data for monitoring
- Implementation phases — Gantt SVG + phase cards
- Use cases — collapsible Given/When/Then
- Risks — risk matrix scatter + table
- Rollout — phased rollout plan

### implementation-plan.html Pattern

- Overview: Gantt chart, impact projection line, summary cards
- Sprint sections, each with:
  - Task table (task, files, effort, impact, dependencies)
  - Full before/after code
  - File paths with line numbers
- Code: red-bordered "Current" → green-bordered "Proposed"
- Include webpack configs, pipeline YAML, KQL queries
- Tracking: status heatmap, dependency graph
- Files: master table of all files to create/modify

### Chart Types per Document

| Document | Chart Types |
|----------|------------|
| index | horizontal-bar, stat-cards, sprint-cards, before-after-bar |
| analysis | waterfall, horizontal-bar, heatmap, treemap, stacked-bar, sparklines |
| design | flow-diagram, architecture-svg, donut, radar, decision-table, gantt |
| implementation | gantt, before-after-bar, dependency-graph, progress-bar, status-heatmap |

All charts: CSS-based or inline SVG only. No Chart.js, D3, or external libraries. Use CSS variables for theming. Responsive 768px–1920px.

### Theme: Tokyo Night

```css
:root {
  --bg: #1a1b26; --surface: #24283b; --surface2: #2f3350;
  --text: #c0caf5; --text-muted: #565f89; --accent: #7aa2f7;
  --accent2: #bb9af7; --green: #9ece6a; --yellow: #e0af68;
  --red: #f7768e; --orange: #ff9e64; --cyan: #7dcfff;
  --border: #3b4261;
}
[data-theme="light"] {
  --bg: #f5f5f5; --surface: #ffffff; --surface2: #e8e8e8;
  --text: #1a1b26; --text-muted: #6b7280; --accent: #2563eb;
  --accent2: #7c3aed; --green: #16a34a; --yellow: #ca8a04;
  --red: #dc2626; --orange: #ea580c; --cyan: #0891b2;
  --border: #d1d5db;
}
```

### Navigation

4 links + theme toggle embedded in nav bar. Single shared localStorage key: `plan-theme`.

```html
<div class="plan-nav">
  <a href="index.html">Home</a>
  <a href="analysis.html">Analysis</a>
  <a href="design.html">Design</a>
  <a href="implementation-plan.html">Implementation</a>
  <div class="spacer"></div>
  <button class="theme-toggle" onclick="toggleTheme()">Toggle Theme</button>
</div>
```

### Anti-Patterns

- No verbose paragraphs — tables and bullets only
- No code in design docs — flow diagrams and decision tables
- No strategy in implementation — just code changes
- No analysis data repeated in design/implementation — reference analysis.html
- No repeated chart types in adjacent sections
- No independent wall times for sub-routes — base + incremental
- No content overlap between documents — each doc has ONE job
- No different headers/themes per document — unified nav, CSS, localStorage
