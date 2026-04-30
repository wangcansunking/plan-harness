---
name: architecture-diagram-svg
description: Structural style rules for system architecture diagrams (System Architecture / Integration Points) — z-order, spacing, legend placement, component-type color mapping
tags: [shared, style, diagram]
agents: [architect, writer]
---

# Architecture diagram — structural style addendum

This file complements the SVG guidelines already in `prompts/architect-prompt.md` and `prompts/writer-prompt.md`. It adds **structural rules** that the existing palette docs don't cover, adapted from [Cocoon-AI/architecture-diagram-generator](https://github.com/Cocoon-AI/architecture-diagram-generator) (MIT) — specifically the rules that fix the most common architecture-diagram defects (overlapping components, arrows piercing boxes, legends trapped inside region boundaries).

## Scope

| Diagram type | Apply this addendum? |
|---|---|
| **System Architecture** (`viewBox="0 0 900 500"`) — components + connections + boundaries | **Yes** |
| **Integration Points** — external systems + auth flows | **Yes** |
| Data Flow (horizontal flow) | Partial — z-order + arrow rules apply; component-type colors don't |
| State Machine (state nodes + transitions) | No — own conventions in `prompts/architect-prompt.md` |
| UX wireframes / mockups | No — see writer-prompt.md §5 |
| ER diagrams | No |

When in doubt, apply only when the diagram is showing **what the system is** (topology), not **what it does** (flow) or **what state it's in** (lifecycle).

## Component-type color map (System Architecture only)

System Architecture diagrams should color-code components **by category** so the reader parses the topology at a glance. Use plan-harness's existing semantic CSS vars — these are already wired into the writer's `svgMap` for theme toggle.

| Component category | Stroke (dark hex) | Stroke (light hex) | CSS var alias |
|---|---|---|---|
| Frontend / API edge | `#58a6ff` | `#0969da` | `--accent` |
| Backend / service | `#3fb950` | `#1a7f37` | `--green` |
| Database / store | `#bc8cff` | `#8250df` | `--purple` |
| Cloud / managed infra | `#d29922` | `#9a6700` | `--yellow` |
| Security / auth | `#f85149` | `#cf222e` | `--red` |
| External / generic | `#8b949e` | `#656d76` | `--svg-muted` |

Fill stays the canonical `#161b22` (`--svg-bg2`). The colored stroke alone is enough to differentiate categories without breaking the writer's existing svgMap.

**Message bus / event bus** is the one category not covered by the existing palette. When the diagram needs one, use orange `#fb923c` (dark) / `#c2410c` (light) and **register the pair in the svgMap** that the writer emits — see `prompts/writer-prompt.md` `svgMap` block, add `'#fb923c': '#c2410c'` to the `light` branch and the inverse to the `dark` branch.

## Five structural rules

These are palette-independent and apply to every System Architecture diagram.

### Rule 1 — Arrow z-order: draw arrows BEFORE component boxes

SVG paints in document order. If you draw arrows after components, arrow tails cross over box borders and the diagram looks broken. Always draw arrows immediately after the background grid, then draw component boxes on top.

```svg
<!-- 1. background grid -->
<rect width="100%" height="100%" fill="#0d1117"/>
<rect width="100%" height="100%" fill="url(#grid)"/>

<!-- 2. ALL connection arrows (drawn FIRST so boxes cover the tails) -->
<line x1="190" y1="40" x2="280" y2="40" stroke="#8b949e" stroke-width="2" marker-end="url(#arrow)"/>
<line x1="..." />

<!-- 3. component boxes (drawn LAST so they sit on top of arrow tails) -->
<rect x="10" y="10" width="180" height="60" rx="8" fill="#161b22" stroke="#58a6ff" stroke-width="2"/>
<text .../>
```

### Rule 2 — Vertical spacing: 40px minimum gap between stacked components

When components stack vertically, leave at least 40px of empty space between them. This keeps labels readable and gives room for inline connectors (message buses, gateways) to sit IN the gap, not overlapping the next component.

- Standard component height: **60px** for services/components, **80–120px** for grouped clusters.
- Inline connector (e.g. message bus, ~20px tall): center vertically inside the 40px gap.

```
Component A: y=70,  height=60  → ends at y=130
Gap:         y=130 to y=170    → 40px gap; place message bus at y=140 (20px tall, centered)
Component B: y=170, height=60  → ends at y=230
```

Wrong: bus at `y=160` when Component B starts at `y=170` — bus overlaps B's top border.
Right: bus at `y=140`, centered in the gap.

### Rule 3 — Legend placement: outside all boundary boxes

If the diagram has region / cluster / security-zone boundaries, the legend MUST sit outside the lowest one — not inside any of them. Compute the lowest boundary's `y + height`, place the legend at least 20px below, and expand `viewBox` height as needed.

```
Region boundary: y=30, height=460 → ends at y=490
Legend should start at: y=510 or below
SVG viewBox height:    ≥ 560
```

### Rule 4 — Boundary line styles

Different boundary types use different dash patterns so they're distinguishable when nested.

| Boundary | Stroke style | Color (dark) |
|---|---|---|
| Region / availability zone | `stroke-dasharray="8,4"`, `rx="12"`, `stroke-width="1"` | `#d29922` (yellow) |
| Cluster / VPC | `stroke-dasharray="6,3"`, `rx="10"` | `#8b949e` (muted) |
| Security zone / trust boundary | `stroke-dasharray="4,4"`, `rx="6"` | `#f85149` (red) |

All boundaries use **transparent fill** (`fill="none"`) so they don't obscure components inside.

### Rule 5 — Auth / security flows: dashed red lines

When showing an auth or security flow (vs. a regular data connection), use a dashed red line:

```svg
<line x1="..." x2="..." stroke="#f85149" stroke-width="2"
      stroke-dasharray="4,3" marker-end="url(#arrow-red)"/>
```

Define a separate red-tipped arrow marker if needed; do not reuse the muted-grey one.

## Worked example (annotated)

```svg
<svg viewBox="0 0 900 500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#30363d" stroke-width="0.5"/>
    </pattern>
    <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#8b949e"/>
    </marker>
  </defs>

  <!-- Layer 1: background grid -->
  <rect width="100%" height="100%" fill="#0d1117"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>

  <!-- Layer 2: region boundary (drawn before contents so contents overlay it) -->
  <rect x="40" y="30" width="820" height="380" rx="12"
        fill="none" stroke="#d29922" stroke-width="1" stroke-dasharray="8,4"/>
  <text x="60" y="50" fill="#d29922" font-size="9">us-east-1</text>

  <!-- Layer 3: ALL connection arrows (Rule 1) -->
  <line x1="220" y1="120" x2="350" y2="120" stroke="#8b949e" stroke-width="2" marker-end="url(#arrow)"/>
  <line x1="540" y1="120" x2="670" y2="120" stroke="#8b949e" stroke-width="2" marker-end="url(#arrow)"/>

  <!-- Layer 4: component boxes (Rule 1 — drawn last) -->
  <!-- Frontend (blue) -->
  <rect x="80" y="90" width="140" height="60" rx="8"
        fill="#161b22" stroke="#58a6ff" stroke-width="2"/>
  <text x="150" y="120" fill="#e6edf3" font-size="12" font-weight="600" text-anchor="middle">Web App</text>
  <text x="150" y="138" fill="#8b949e" font-size="9" text-anchor="middle">React 18</text>

  <!-- Backend (green) -->
  <rect x="350" y="90" width="190" height="60" rx="8"
        fill="#161b22" stroke="#3fb950" stroke-width="2"/>
  <text x="445" y="120" fill="#e6edf3" font-size="12" font-weight="600" text-anchor="middle">API Server</text>
  <text x="445" y="138" fill="#8b949e" font-size="9" text-anchor="middle">Node 20 + Express</text>

  <!-- Database (purple) -->
  <rect x="670" y="90" width="150" height="60" rx="8"
        fill="#161b22" stroke="#bc8cff" stroke-width="2"/>
  <text x="745" y="120" fill="#e6edf3" font-size="12" font-weight="600" text-anchor="middle">Postgres</text>
  <text x="745" y="138" fill="#8b949e" font-size="9" text-anchor="middle">15.5</text>

  <!-- Vertical gap of 40px between Layer 4 and the next stacked row would go here (Rule 2) -->

  <!-- Layer 5: legend (Rule 3 — placed below the region boundary at y=410+) -->
  <text x="60" y="450" fill="#8b949e" font-size="10">Legend:</text>
  <rect x="120" y="442" width="14" height="10" fill="#161b22" stroke="#58a6ff" stroke-width="1.5"/>
  <text x="140" y="451" fill="#e6edf3" font-size="10">Frontend</text>
  <rect x="210" y="442" width="14" height="10" fill="#161b22" stroke="#3fb950" stroke-width="1.5"/>
  <text x="230" y="451" fill="#e6edf3" font-size="10">Backend</text>
  <rect x="300" y="442" width="14" height="10" fill="#161b22" stroke="#bc8cff" stroke-width="1.5"/>
  <text x="320" y="451" fill="#e6edf3" font-size="10">Database</text>
</svg>
```

## When the writer's svgMap needs extending

Most colors in this file (`--accent`, `--green`, `--purple`, `--yellow`, `--red`, `--svg-muted`) are already in the existing svgMap. The only addition required is **message bus orange** if the diagram uses one:

```javascript
// in writer-prompt.md svgMap, light branch — add:
'#fb923c': '#c2410c'
// in dark branch — add:
'#c2410c': '#fb923c'
```

Without this entry, message bus components will not switch color when the user toggles light/dark.
