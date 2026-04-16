---
name: feature-planning
description: Generation rules — full 7-doc suite for new features and major refactors
tags: [generation-rules]
agents: [writer]
---

# Feature Planning — Generation Rules

Rules for generating a comprehensive planning suite.

## Summary

Generate 7 documents: analysis, design, state-machine, test-plan, test-cases, implementation-plan, review-report. Use GitHub Dark theme. Code examples allowed in design docs. Full test coverage with interactive harness.

## Details

### Document Set

| Document | Generate | Purpose |
|----------|----------|---------|
| analysis.html | Yes | Deep codebase analysis — architecture, patterns, conventions, code health |
| design.html | Yes | Technical design with data models, API contracts, UX flows, architecture diagrams |
| state-machine.html | Yes | Entity state diagrams and transition tables |
| test-plan.html | Yes | E2E test scenarios with progress tracking |
| test-cases.html | Yes | Detailed test case catalog with interactive harness |
| implementation-plan.html | Yes | File-level implementation steps with dependency graph |
| review-report.html | Yes | Section-by-section review feedback report |
| index.html | No | — |

### Content Rules

**analysis.html**: Architecture exploration, code patterns, tech stack deep-dive. Component graphs, dependency analysis, code health scores. SVG diagrams for architecture layers.

**design.html**: Comprehensive — data models with field tables, API contracts with request/response JSON, UX component hierarchy, use cases with Given/When/Then. Code examples allowed. Architecture SVGs, ER diagrams, flow diagrams.

**implementation-plan.html**: Phase-based steps with file-level detail. Files to create/modify, code patterns to follow, test requirements. Dependency graph SVG. Progress tracking with localStorage.

### Chart Types

- analysis: component-graph, dependency-graph, layer-diagram, health-scorecards
- design: architecture-svg, flow-diagram, er-diagram, endpoint-cards, state-transition-svg
- implementation: dependency-graph, progress-bars, phase-cards

### Theme: GitHub Dark

```css
:root {
  --bg: #0d1117; --surface: #161b22; --accent: #58a6ff; --text: #e6edf3;
}
```

### Navigation

7 links. Theme toggle: floating button (top-right).

Links: analysis, design, state-machine, test-plan, test-cases, implementation-plan, review-report
