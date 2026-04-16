---
name: lean
description: Generation rules — minimal 2-doc planning for spikes and small changes
tags: [generation-rules]
agents: [writer]
---

# Lean Planning — Generation Rules

Minimal document set. Get to implementation fast.

## Summary

Generate 2 documents only: design.html + implementation-plan.html. Skip analysis, tests, state machines. Keep plans proportional to the task size. GitHub Dark theme.

## Details

### Document Set

| Document | Generate | Purpose |
|----------|----------|---------|
| design.html | Yes | Concise solution design — architecture, key decisions, scope |
| implementation-plan.html | Yes | Step-by-step execution with file-level details |
| All others | No | — |

### Content Rules

**design.html**: Keep it short. Architecture overview, key data models, API surface, scope boundaries. Code examples fine. Skip deep UX flows and detailed use cases.

**implementation-plan.html**: Ordered steps with files to create/modify. Code snippets where helpful. Skip elaborate dependency graphs — focus on action items.

### Chart Types

- design: architecture-svg, flow-diagram
- implementation: progress-bars

### Theme: GitHub Dark (default)

### Navigation

2 links: design, implementation-plan. Theme toggle: floating.

### Anti-Patterns

- Do not over-engineer the plan — keep it proportional to the task size
