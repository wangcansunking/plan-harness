---
name: quantitative-chart
description: Style rules for quantitative + comparison charts (bar comparison, decision matrix, bullet/meter, before-after, diverging, stat tile, sparkline) — inline SVG/CSS, no runtime; make the winner/key difference obvious
tags: [shared, style, diagram]
agents: [architect, writer]
---

# Quantitative & comparison charts — style addendum

This file complements `prompts/styles/architecture-diagram-svg.md`. That file covers **structural** diagrams (topology, state, flow). This file covers **quantitative** visuals — anything comparing numbers, options, or before/after. Both share the same rule: **hand-authored inline SVG, self-contained, no JS runtime** (React charting stacks — Recharts/Tremor/shadcn — are rejected: they break the self-contained-HTML contract).

The whole point of a quantitative chart here is to **encode the conclusion, not just the data.** A comparison that doesn't make the winner obvious has failed. If the reader has to study a legend to find the point, redraw it.

## Scope — when to reach for a chart vs a table vs a structural diagram

| Content | Use |
|---|---|
| "Option A is faster/cheaper/safer than B/C" | **Comparison bar** or **decision matrix** (this file) |
| A headline metric (coverage %, pass rate, defect count) | **Stat tile** (this file) |
| One value against a target/threshold | **Bullet / meter** (this file) |
| Before → after, old → new, regressed/improved | **Before-after (slope or dumbbell)** (this file) |
| Signed deltas / tradeoffs (+40% throughput, −15% memory) | **Diverging bar** (this file) |
| Tiny inline trend inside a tile or table cell | **Sparkline** (this file) |
| System topology / components / integration | architecture-diagram-svg.md |
| Lifecycle / state transitions | state-machine conventions (architect-prompt.md) |
| Plain reference data nobody compares | a normal `<table>` — **don't** force a chart |

**Out of vocabulary — do not use:** pie/donut (poor for comparison), gauges (space-hungry for one value — use a bullet), 3D anything, dual-Y-axis, or any chart needing more than ~7 series. If you have >7 series, the comparison is wrong-grained — aggregate first.

## The seven "make the point obvious" rules

Put these on every quantitative chart. They are the reason the chart exists.

1. **One accent, rest muted.** Color exactly the winner / changed element in a semantic hue; everything else is `--svg-muted` grey. This is the single strongest technique — it survives being screenshotted out of context.
2. **Highlight at most one.** One winner column, one recommended option, one moved bar. Two "recommended" defeats the purpose.
3. **Badge + rationale, not color alone.** Pair the highlight with a short label ("Recommended", "2× faster", "chosen: no runtime dep"). Required for accessibility (never rely on hue alone) and it's what actually convinces.
4. **Direct labels beat legends.** Put the value at the end of the bar / at the endpoint. Kill the legend — a legend forces a lookup; a direct label puts the number where the eye already is.
5. **Sort by the metric.** Ordering is an encoding. The winner sits at the top/end so the ranking reads instantly. Never leave rows in arbitrary/alphabetical order for a comparison.
6. **In-frame annotation.** State the takeaway inside the chart (a callout, a target marker line), so the conclusion travels with the image.
7. **Zero baseline, same scale.** Bars start at zero; before/after share one scale. Non-zero baselines and mismatched scales are how "winner" charts lie — both reviewers and readers flag them.

## Palette & theme

Use the repo's locked semantic vars — they're already wired into the writer's `svgMap` for the light/dark toggle, so no new registration is needed:

| Role | Dark hex | CSS var |
|---|---|---|
| Winner / positive / accent | `#3fb950` (green) or `#58a6ff` (accent blue) | `--green` / `--accent` |
| Loser / neutral / muted | `#8b949e` | `--svg-muted` |
| Negative / regressed / warning | `#f85149` (red) / `#d29922` (amber) | `--red` / `--yellow` |
| Chart bg panel | `#161b22` | `--svg-bg2` |
| Gridline / axis | `#30363d` | — |
| Label text | `#e6edf3` primary / `#8b949e` secondary | — |

**Colorblind safety:** green-vs-red is the #1 CVD failure. Where a chart's whole meaning is green-vs-red (diverging, before/after direction), **add a second encoding** — a ▲/▼ glyph, a +/− sign, or position — never rely on hue alone. Every hex used must already be in the writer's `svgMap`; these all are, so no `svgMap` edit is required (unlike message-bus orange in the architecture addendum).

Generated docs are **locked dark** (see `prompts/writer-prompt.md`), so author for dark; the `svgMap` handles any future theming.

---

## Primitive 1 — Comparison bar (the workhorse)

Horizontal bars, one row per option, **sorted by the metric**, **winner colored, losers muted**, value **labelled at the bar end** (no legend). Use for "A is faster/cheaper than B/C".

```svg
<svg viewBox="0 0 420 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Build time by tool: esbuild 0.8s (fastest), swc 2.1s, tsc 9.4s">
  <!-- winner row: green, value labelled at end -->
  <text x="0" y="26" fill="#e6edf3" font-size="12">esbuild</text>
  <rect x="70" y="16" width="40" height="14" rx="2" fill="#3fb950"/>
  <text x="116" y="26" fill="#3fb950" font-size="11" font-weight="700">0.8s ✓ fastest</text>
  <!-- muted rows -->
  <text x="0" y="60" fill="#e6edf3" font-size="12">swc</text>
  <rect x="70" y="50" width="105" height="14" rx="2" fill="#8b949e"/>
  <text x="181" y="60" fill="#8b949e" font-size="11">2.1s</text>
  <text x="0" y="94" fill="#e6edf3" font-size="12">tsc</text>
  <rect x="70" y="84" width="330" height="14" rx="2" fill="#8b949e"/>
  <text x="70" y="118" fill="#8b949e" font-size="11">9.4s</text>
</svg>
```

Rules in play: sort by metric (fastest on top), one accent (green winner, grey losers), direct labels, zero baseline (all bars start at x=70), in-frame "✓ fastest" annotation.

## Primitive 2 — Decision matrix (option comparison table)

A comparison `<table>` with **exactly one highlighted column** = the recommended option: a colored top border + a badge + a one-line *why*. This is the accessible, print-friendly form when a bar chart can't carry the criteria.

```html
<table class="decision-matrix">
  <thead>
    <tr>
      <th>Criterion</th>
      <th>Polling</th>
      <th class="pick">SSE <span class="badge">Recommended</span></th>
      <th>WebSocket</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Server complexity</td><td>Low</td><td class="pick">Low</td><td>High</td></tr>
    <tr><td>Latency</td><td>~5s</td><td class="pick">&lt;100ms</td><td>&lt;100ms</td></tr>
    <tr><td>Runtime deps</td><td>None</td><td class="pick">None</td><td>ws library</td></tr>
  </tbody>
  <tfoot><tr><td colspan="4" class="why">Chosen: sub-second latency with zero new runtime deps.</td></tr></tfoot>
</table>
<style>
  .decision-matrix .pick{border-left:2px solid #3fb950;border-right:2px solid #3fb950;background:rgba(63,185,80,.08);}
  .decision-matrix thead .pick{border-top:3px solid #3fb950;}
  .decision-matrix .badge{background:#3fb950;color:#0d1117;font-size:.65rem;padding:1px 5px;border-radius:6px;margin-left:4px;}
  .decision-matrix .why{color:#8b949e;font-size:.8rem;font-style:italic;padding-top:.4rem;}
</style>
```

Rule: **highlight one and only one** column; pair color with the "Recommended" badge and a terse rationale in the footer (never color alone).

## Primitive 3 — Bullet / meter (value vs target)

A single actual value against a target/threshold on a neutral band. Use for "coverage 72% vs 80% gate".

```svg
<svg viewBox="0 0 320 40" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Coverage 72% versus 80% target — below gate">
  <rect x="0" y="12" width="300" height="14" rx="2" fill="#30363d"/>           <!-- track -->
  <rect x="0" y="12" width="216" height="14" rx="2" fill="#d29922"/>           <!-- value 72% (amber: below target) -->
  <line x1="240" y1="8" x2="240" y2="30" stroke="#e6edf3" stroke-width="2"/>   <!-- target 80% marker -->
  <text x="216" y="10" fill="#d29922" font-size="10" text-anchor="middle">72%</text>
  <text x="246" y="10" fill="#8b949e" font-size="9">target 80%</text>
</svg>
```

Rules: neutral grey track (no traffic-light bands — they distract from the value), target is a marker line, anchored at zero, value colored by whether it clears the gate.

## Primitive 4 — Before / after (slope)

Two points per item connected by a line. **Slope** when rank/direction is the story; grey out unchanged rows, color movers (green improved / red regressed), label both endpoints.

```svg
<svg viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="p95 latency dropped 420ms to 90ms; error rate flat">
  <text x="40" y="14" fill="#8b949e" font-size="10">before</text>
  <text x="230" y="14" fill="#8b949e" font-size="10">after</text>
  <!-- improved: green, both ends labelled -->
  <line x1="60" y1="40" x2="240" y2="120" stroke="#3fb950" stroke-width="2"/>
  <text x="0" y="44" fill="#e6edf3" font-size="11">p95 420ms</text>
  <text x="248" y="124" fill="#3fb950" font-size="11" font-weight="700">90ms ▼</text>
  <!-- unchanged: muted -->
  <line x1="60" y1="90" x2="240" y2="92" stroke="#8b949e" stroke-width="2"/>
  <text x="6" y="94" fill="#8b949e" font-size="11">errors 0.1%</text>
  <text x="248" y="96" fill="#8b949e" font-size="11">0.1%</text>
</svg>
```

Use a **dumbbell** (two dots + connector per row) instead when the *gap size* is the story and you have many rows. The `▼` glyph is the required second encoding so direction reads without relying on green.

## Primitive 5 — Diverging bar (signed deltas / tradeoffs)

Bars grow left/right from a zero baseline for signed values — one hue each side, so positive vs negative is pre-attentive. Pair with +/− signs (second encoding).

```svg
<svg viewBox="0 0 320 110" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Migration tradeoffs: throughput +40%, memory -15%, cold start +8%">
  <line x1="160" y1="10" x2="160" y2="100" stroke="#30363d" stroke-width="1"/>  <!-- zero axis -->
  <text x="0" y="26" fill="#e6edf3" font-size="11">throughput</text>
  <rect x="160" y="16" width="100" height="12" fill="#3fb950"/><text x="264" y="26" fill="#3fb950" font-size="10">+40%</text>
  <text x="0" y="54" fill="#e6edf3" font-size="11">memory</text>
  <rect x="122" y="44" width="38" height="12" fill="#f85149"/><text x="86" y="54" fill="#f85149" font-size="10">−15%</text>
  <text x="0" y="82" fill="#e6edf3" font-size="11">cold start</text>
  <rect x="160" y="72" width="20" height="12" fill="#8b949e"/><text x="184" y="82" fill="#8b949e" font-size="10">+8%</text>
</svg>
```

## Primitive 6 — Stat tile (KPI)

Big `tabular-nums` number + label + optional signed delta (green up / red down). The number is the hero. Group tiles in a flex row for a report header.

```html
<div class="stat-tiles">
  <div class="tile"><div class="num">94%</div><div class="lbl">Pass rate</div><div class="delta up">▲ 6</div></div>
  <div class="tile"><div class="num">3</div><div class="lbl">Open defects</div><div class="delta down">▼ 2</div></div>
  <div class="tile"><div class="num">72%</div><div class="lbl">Coverage</div></div>
</div>
<style>
  .stat-tiles{display:flex;gap:1rem;flex-wrap:wrap;}
  .stat-tiles .tile{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:.8rem 1.1rem;min-width:90px;}
  .stat-tiles .num{font-size:1.8rem;font-weight:800;font-variant-numeric:tabular-nums;color:#e6edf3;}
  .stat-tiles .lbl{font-size:.72rem;color:#8b949e;text-transform:uppercase;letter-spacing:.03em;}
  .stat-tiles .delta{font-size:.75rem;font-weight:700;}
  .stat-tiles .delta.up{color:#3fb950;} .stat-tiles .delta.down{color:#f85149;}
</style>
```

## Primitive 7 — Sparkline (inline trend)

A tiny axis-less trend inside a tile or table cell — only the shape + an optional end dot.

```svg
<svg viewBox="0 0 80 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="latency trend, declining">
  <polyline points="0,20 16,17 32,18 48,11 64,7 80,4" fill="none" stroke="#3fb950" stroke-width="1.5"/>
  <circle cx="80" cy="4" r="2" fill="#3fb950"/>
</svg>
```

---

## Checklist before shipping a quantitative chart

- [ ] Winner/changed element colored; everything else `--svg-muted`.
- [ ] At most one highlight.
- [ ] Values labelled directly (no legend).
- [ ] Sorted by the metric.
- [ ] Zero baseline; before/after share one scale.
- [ ] Conclusion stated in-frame (badge / annotation / target line).
- [ ] Second encoding (glyph/sign) wherever green-vs-red carries meaning.
- [ ] `role="img"` + `aria-label` stating the takeaway.
