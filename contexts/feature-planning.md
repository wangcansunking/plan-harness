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
| analysis.html | Yes | Problem statement + code-logic walk — current state (product + code), problem to solve, pain points (business + code-level with file/line), root causes, impact |
| design.html | Yes | Technical design with data models, API contracts, UX flows, architecture diagrams |
| state-machine.html | Yes | Entity state diagrams and transition tables |
| test-plan.html | Yes | E2E test scenarios with progress tracking |
| test-cases.html | Yes | Detailed test case catalog with interactive harness |
| implementation-plan.html | Yes | File-level implementation steps with dependency graph |
| review-report.html | Yes | Section-by-section review feedback report |
| index.html | No | — |

### Content Rules

**analysis.html**: Problem statement + code-logic walk. Sections: current state (product flow + code flow in the modules this plan will touch, with inline SVG), problem to solve, observed pain points (P1, P2, … mixing business-level and code-level — the code-level ones cite file+line), root causes tied to each pain point (layer: logic / abstraction / architecture / external / historical), impact + urgency, optional constraints. No solutions (those live in design).

**design.html**: Comprehensive — data models with field tables, API contracts with request/response JSON, UX component hierarchy, use cases with Given/When/Then. Code examples allowed. Architecture SVGs, ER diagrams, flow diagrams.

**implementation-plan.html**: Phase-based steps with file-level detail. Files to create/modify, code patterns to follow, test requirements. Dependency graph SVG. Progress tracking with localStorage.

### Chart Types

- analysis: current-state-diagram, code-flow-svg, pain-point-table (with file/line), root-cause-tree, impact-matrix
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
