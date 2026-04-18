// plan-harness/local-proxy/src/templates/base.js
// HTML template system for plan documents.
// All output is self-contained HTML strings (inline CSS + JS, no external deps).

import { createHash } from 'node:crypto';

/**
 * Shared CSS variables, fonts, base styles (dark/light theme).
 * Matches the visual patterns from existing plan files.
 */
export function getBaseCSS() {
  return `
  /* Palette inspired by Linear (see plan-harness/DESIGN.md).
     Light is the CSS default for no-JS fallback; the inline init script in
     <head> sets data-theme="dark" when the resolved pref is dark. Theme pref
     lives in localStorage under "plan-harness-theme" so every plan-harness
     page shares it. */
  :root {
    /* Light surfaces */
    --bg: #f7f8f8; --surface: #f3f4f5; --border: #d0d6e0;
    --text: #08090a; --muted: #62666d; --accent: #5e6ad2;
    /* Status */
    --green: #1a7f37; --red: #cf222e; --yellow: #9a6700; --purple: #7170ff;
    --code-bg: #eeeff1;
    --svg-bg: #f3f4f5; --svg-bg2: #f7f8f8; --svg-text: #08090a;
    --svg-muted: #62666d; --svg-border: #d0d6e0;
    --even-row-bg: rgba(243,244,245,0.7);
    --badge-green-bg: rgba(26,127,55,0.1); --badge-yellow-bg: rgba(154,103,0,0.1);
    --badge-red-bg: rgba(207,34,46,0.1); --badge-blue-bg: rgba(94,106,210,0.1);
    --badge-purple-bg: rgba(113,112,255,0.1);
    --shadow: 0 1px 2px rgba(0,0,0,0.05);
    --shadow-lg: 0 4px 16px rgba(0,0,0,0.08);
    --radius: 8px;
    --radius-sm: 4px;
    --font-ui: 'Inter Variable', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --font-mono: 'Berkeley Mono', 'Cascadia Code', 'Fira Code', ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    --font-features: "cv01", "ss03";
  }
  [data-theme="dark"] {
    /* Linear marketing-black + panel-dark layered surfaces */
    --bg: #08090a; --surface: #0f1011; --border: rgba(255,255,255,0.08);
    --text: #f7f8f8; --muted: #8a8f98; --accent: #7170ff;
    --green: #27a644; --red: #f85149; --yellow: #d29922; --purple: #828fff;
    --code-bg: #141516;
    --svg-bg: #0f1011; --svg-bg2: #08090a; --svg-text: #f7f8f8;
    --svg-muted: #8a8f98; --svg-border: rgba(255,255,255,0.08);
    --even-row-bg: rgba(25,26,27,0.5);
    --badge-green-bg: rgba(39,166,68,0.15); --badge-yellow-bg: rgba(210,153,34,0.15);
    --badge-red-bg: rgba(248,81,73,0.15); --badge-blue-bg: rgba(113,112,255,0.15);
    --badge-purple-bg: rgba(130,143,255,0.15);
    --shadow: 0 1px 2px rgba(0,0,0,0.4);
    --shadow-lg: 0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { scroll-behavior: smooth; font-feature-settings: var(--font-features); }
  body { font-family: var(--font-ui); background: var(--bg); color: var(--text); line-height: 1.6; font-weight: 400; letter-spacing: -0.01em; transition: background-color 0.2s, color 0.2s; }
  code, pre, kbd, samp { font-family: var(--font-mono); }
  .container { max-width: 1100px; margin: 0 auto; padding: 2rem 2.5rem; }
  h1 { font-size: 2rem; border-bottom: 2px solid var(--accent); padding-bottom: 0.5rem; margin-bottom: 1.5rem; }
  h2 { font-size: 1.5rem; color: var(--accent); margin-top: 3rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 0.3rem; }
  h3 { font-size: 1.15rem; color: var(--purple); margin-top: 2rem; margin-bottom: 0.7rem; }
  h4 { font-size: 1rem; color: var(--green); margin-top: 1.5rem; margin-bottom: 0.5rem; }
  p, li { color: var(--text); margin-bottom: 0.5rem; }
  ul, ol { padding-left: 1.5rem; margin-bottom: 1rem; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  code { background: var(--code-bg); padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.9em; color: var(--yellow); font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; }
  pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; overflow-x: auto; margin: 1rem 0; font-size: 0.85rem; line-height: 1.5; color: var(--text); }
  table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
  th { background: var(--surface); color: var(--accent); text-align: left; padding: 0.6rem 0.8rem; border: 1px solid var(--border); font-weight: 600; }
  td { padding: 0.5rem 0.8rem; border: 1px solid var(--border); vertical-align: top; }
  tr:nth-child(even) { background: var(--even-row-bg); }

  /* Badges */
  .badge { display: inline-block; padding: 0.15em 0.6em; border-radius: 12px; font-size: 0.8rem; font-weight: 600; }
  .badge-green { background: var(--badge-green-bg); color: var(--green); border: 1px solid var(--green); }
  .badge-yellow { background: var(--badge-yellow-bg); color: var(--yellow); border: 1px solid var(--yellow); }
  .badge-red { background: var(--badge-red-bg); color: var(--red); border: 1px solid var(--red); }
  .badge-blue { background: var(--badge-blue-bg); color: var(--accent); border: 1px solid var(--accent); }
  .badge-purple { background: var(--badge-purple-bg); color: var(--purple); border: 1px solid var(--purple); }

  /* Callouts */
  .callout { border-left: 4px solid var(--accent); background: var(--surface); padding: 1rem 1.2rem; margin: 1rem 0; border-radius: 0 6px 6px 0; }
  .callout-warn { border-left-color: var(--yellow); }
  .callout-important { border-left-color: var(--red); }
  .callout-title { font-weight: 700; margin-bottom: 0.3rem; }

  /* Diagram boxes and node cards */
  .diagram-box { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; margin: 1rem 0; overflow-x: auto; }
  .node-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.2rem; margin: 1rem 0; }
  .node-card h4 { margin-top: 0; color: var(--accent); }

  /* Metadata */
  .meta { color: var(--muted); font-size: 0.9rem; }

  /* Sidebar nav */
  .side-nav { position: fixed; top: 0; left: 0; width: 260px; height: 100vh; background: var(--surface); border-right: 1px solid var(--border); overflow-y: auto; padding: 1.2rem 0; z-index: 998; transition: transform 0.3s ease; }
  .side-nav .nav-title { font-size: 0.85rem; font-weight: 700; color: var(--accent); padding: 0 1rem 0.8rem; border-bottom: 1px solid var(--border); margin-bottom: 0.5rem; }
  .side-nav a { display: block; padding: 0.35rem 1rem; font-size: 0.82rem; color: var(--muted); text-decoration: none; border-left: 3px solid transparent; transition: all 0.15s; }
  .side-nav a:hover { color: var(--text); background: var(--bg); }
  .side-nav a.active { color: var(--accent); border-left-color: var(--accent); background: var(--bg); font-weight: 600; }
  .side-nav a.sub { padding-left: 1.8rem; font-size: 0.78rem; }
  .side-nav-toggle { display: none; position: fixed; top: 0.7rem; left: 0.7rem; z-index: 1000; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 0.3rem 0.55rem; cursor: pointer; font-size: 1.1rem; color: var(--text); }
  .side-nav-toggle:hover { border-color: var(--accent); }
  body.nav-open .side-nav { transform: translateX(0); }
  body.nav-open .container { margin-left: 260px; }
  @media (min-width: 900px) { body { padding-left: 260px; } .container { max-width: 1100px; margin: 0 auto; } }
  @media (max-width: 899px) { .side-nav { transform: translateX(-100%); } .side-nav-toggle { display: block; } }

  /* Breadcrumb — fixed pill at top-centre, always visible on scroll.
     Compact rounded badge with blurred surface; doesn't participate in
     content flow so it never eats top whitespace. */
  .ph-breadcrumb { position: fixed; top: 0.85rem; left: 50%; transform: translateX(-50%); z-index: 1000; display: flex; align-items: center; gap: 0.45rem; padding: 0.4rem 0.9rem; font-size: 0.82rem; color: var(--muted); background: color-mix(in srgb, var(--surface) 85%, transparent); border: 1px solid var(--border); border-radius: 999px; -webkit-backdrop-filter: blur(12px) saturate(180%); backdrop-filter: blur(12px) saturate(180%); box-shadow: var(--shadow); max-width: calc(100vw - 10rem); overflow: hidden; }
  .ph-breadcrumb a { color: var(--muted); text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 14rem; transition: color 0.15s; }
  .ph-breadcrumb a:hover { color: var(--accent); }
  .ph-breadcrumb .sep { color: var(--muted); opacity: 0.4; font-size: 0.9em; }
  .ph-breadcrumb .current { color: var(--text); font-weight: 510; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 20rem; }
  @media (max-width: 899px) { .ph-breadcrumb { left: 3.2rem; transform: none; max-width: calc(100vw - 7rem); } }

  /* Theme toggle — fixed pill at top-right; three SVGs, one visible
     per [data-theme-pref] attribute. */
  .theme-toggle { position: fixed; top: 0.85rem; right: 1.25rem; z-index: 1000; background: color-mix(in srgb, var(--surface) 85%, transparent); border: 1px solid var(--border); border-radius: 999px; padding: 0.4rem 0.5rem; cursor: pointer; color: var(--text); -webkit-backdrop-filter: blur(12px) saturate(180%); backdrop-filter: blur(12px) saturate(180%); box-shadow: var(--shadow); transition: border-color 0.15s, color 0.15s; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; }
  .theme-toggle:hover { border-color: var(--accent); color: var(--accent); }
  .theme-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .theme-toggle svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .theme-toggle svg[data-theme-icon] { display: none; }
  .theme-toggle[data-theme-pref="system"] svg[data-theme-icon="system"],
  .theme-toggle[data-theme-pref="light"]  svg[data-theme-icon="light"],
  .theme-toggle[data-theme-pref="dark"]   svg[data-theme-icon="dark"] { display: block; }

  /* Flow steps */
  .flow-step { display: flex; align-items: flex-start; gap: 1rem; margin: 0.5rem 0; }
  .flow-num { background: var(--accent); color: var(--bg); width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; flex-shrink: 0; margin-top: 0.15rem; }

  /* Test scenarios */
  .scenario { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 1.5rem; margin: 1.5rem 0; }
  .scenario-header { display: flex; align-items: center; gap: 0.8rem; margin-bottom: 1rem; }
  .scenario-num { background: var(--accent); color: var(--bg); width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; flex-shrink: 0; }
  .scenario-title { font-size: 1.1rem; font-weight: 700; color: var(--text); }

  /* Step rows with checkboxes */
  .step-row { display: flex; align-items: flex-start; gap: 0.6rem; padding: 0.4rem 0; border-bottom: 1px solid var(--border); }
  .step-row:last-child { border-bottom: none; }
  .step-check { flex-shrink: 0; margin-top: 0.2rem; width: 18px; height: 18px; accent-color: var(--green); }
  .step-content { flex: 1; }
  .step-action { font-weight: 600; color: var(--text); }
  .step-verify { color: var(--muted); font-size: 0.9rem; margin-top: 0.2rem; }

  /* State boxes and transitions */
  .state-box { display: inline-block; background: var(--code-bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.15em 0.5em; font-size: 0.85rem; font-family: monospace; margin: 0.1rem 0.2rem; }
  .state-transition { display: flex; align-items: center; gap: 0.5rem; margin: 0.5rem 0; padding: 0.5rem; background: var(--code-bg); border-radius: 6px; font-size: 0.88rem; }
  .arrow { color: var(--accent); font-weight: 700; }

  /* Precondition/postcondition blocks */
  .precondition { border-left: 3px solid var(--purple); padding-left: 1rem; margin: 0.5rem 0; }
  .postcondition { border-left: 3px solid var(--green); padding-left: 1rem; margin: 0.5rem 0; }

  /* Progress bar */
  .progress-bar { background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px; padding: 0.8rem 1.2rem; margin: 1rem 0; display: flex; align-items: center; gap: 1rem; }
  .progress-bar .label { font-weight: 600; color: var(--accent); white-space: nowrap; }
  .progress-track { flex: 1; height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; }
  .progress-fill { height: 100%; background: var(--green); border-radius: 4px; transition: width 0.3s; }
  .progress-count { font-size: 0.85rem; color: var(--muted); white-space: nowrap; }

  /* Test case cards (expandable) */
  .tc-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 12px; overflow: hidden; box-shadow: var(--shadow); transition: box-shadow 0.15s, border-color 0.15s; }
  .tc-card:hover { box-shadow: var(--shadow-lg); }
  .tc-card.checked { border-left: 4px solid var(--green); opacity: 0.75; }
  .tc-card.checked .tc-header { background: rgba(63,185,80,0.1); }
  .tc-header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--code-bg); cursor: pointer; user-select: none; }
  .tc-checkbox { width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; flex-shrink: 0; }
  .tc-id { font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; font-size: 12px; font-weight: 600; color: var(--accent); white-space: nowrap; }
  .tc-title { font-size: 14px; font-weight: 600; flex: 1; }
  .tc-priority { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: var(--radius-sm); white-space: nowrap; }
  .tc-priority.p0 { background: var(--badge-red-bg); color: var(--red); }
  .tc-priority.p1 { background: var(--badge-yellow-bg); color: var(--yellow); }
  .tc-priority.p2 { background: var(--badge-blue-bg); color: var(--accent); }
  .tc-expand { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; color: var(--muted); transition: transform 0.15s; flex-shrink: 0; }
  .tc-card.expanded .tc-expand { transform: rotate(90deg); }
  .tc-body { display: none; padding: 16px; border-top: 1px solid var(--border); }
  .tc-card.expanded .tc-body { display: block; }
  .tc-field { margin-bottom: 12px; }
  .tc-field:last-child { margin-bottom: 0; }
  .tc-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin-bottom: 4px; }
  .tc-value { font-size: 13px; color: var(--text); line-height: 1.6; }
  .tc-steps { padding-left: 20px; }
  .tc-steps li { margin-bottom: 4px; font-size: 13px; }

  /* Summary cards grid */
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 32px; }
  .summary-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; text-align: center; box-shadow: var(--shadow); }
  .summary-value { font-size: 28px; font-weight: 800; color: var(--accent); }
  .summary-label { font-size: 12px; color: var(--muted); margin-top: 4px; }

  /* Buttons */
  .btn { font-family: inherit; font-size: 13px; font-weight: 600; padding: 6px 14px; border-radius: var(--radius-sm); cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--text); transition: all 0.15s; }
  .btn:hover { background: var(--code-bg); }
  .btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
  .btn-primary:hover { opacity: 0.9; }
  .btn-success { background: var(--green); color: #fff; border-color: var(--green); }
  .btn-danger { background: var(--red); color: #fff; border-color: var(--red); }

  /* Bulk actions */
  .bulk-actions { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }

  /* Filter bar */
  .filter-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
  .filter-bar select, .filter-bar input { font-family: inherit; font-size: 13px; padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); }
  .filter-bar input { width: 200px; }

  /* Section styles */
  .section { margin-bottom: 48px; scroll-margin-top: 80px; }
  .section-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 2px solid var(--accent); }
  .section-title { font-size: 22px; font-weight: 700; }
  .section-count { font-size: 13px; color: var(--muted); margin-left: auto; }
  .section-desc { font-size: 14px; color: var(--muted); margin-bottom: 20px; line-height: 1.5; }
  .section-meta { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem 1.2rem; margin: 1rem 0; }

  /* Implementation plan steps */
  .impl-step { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.2rem; margin: 1rem 0; }
  .impl-step-header { display: flex; align-items: center; gap: 0.8rem; cursor: pointer; user-select: none; }
  .impl-step-num { background: var(--accent); color: var(--bg); width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem; flex-shrink: 0; }
  .impl-step-title { font-size: 1rem; font-weight: 700; flex: 1; }
  .impl-step-status { font-size: 0.8rem; font-weight: 600; padding: 0.15em 0.6em; border-radius: 12px; }
  .impl-step-body { display: none; padding-top: 1rem; margin-top: 0.8rem; border-top: 1px solid var(--border); }
  .impl-step.expanded .impl-step-body { display: block; }
  .impl-step.expanded .impl-step-expand { transform: rotate(90deg); }
  .impl-step-expand { color: var(--muted); transition: transform 0.15s; font-size: 12px; }
  .impl-substep { padding: 0.4rem 0 0.4rem 2.5rem; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
  .impl-substep:last-child { border-bottom: none; }
  .impl-files { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem; }
  .impl-file { background: var(--code-bg); border: 1px solid var(--border); border-radius: 4px; padding: 0.15em 0.5em; font-size: 0.8rem; font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace; color: var(--yellow); }

  /* Cross-link nav bar (top of plan files) */
  .plan-nav { background: var(--surface); border-bottom: 1px solid var(--border); padding: 0.5rem 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; position: sticky; top: 0; z-index: 997; }
  .plan-nav a { font-size: 0.8rem; padding: 0.25rem 0.7rem; border-radius: 12px; color: var(--muted); text-decoration: none; border: 1px solid var(--border); transition: all 0.15s; }
  .plan-nav a:hover { color: var(--text); border-color: var(--accent); }
  .plan-nav a.active { background: var(--accent); color: var(--bg); border-color: var(--accent); font-weight: 600; }
  .plan-nav .plan-nav-label { font-size: 0.75rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-right: 0.3rem; }

  /* Print styles */
  @media print {
    .side-nav, .side-nav-toggle, .theme-toggle, .plan-nav, .bulk-actions, .filter-bar { display: none !important; }
    body { padding-left: 0; background: #fff; color: #000; }
    .container { max-width: 100%; }
    pre, .diagram-box, .node-card, .callout, .scenario, .section-meta, .tc-card, .impl-step { border-color: #ccc; background: #f8f8f8; }
    h2 { color: #0066cc; }
    .tc-body { display: block !important; }
    .tc-card, .impl-step { break-inside: avoid; }
  }
`;
}

/**
 * Shared sidebar navigation HTML generator.
 * @param {string} title - The nav title displayed at the top.
 * @param {Array<{id: string, title: string, subsections?: Array<{id: string, title: string}>}>} sections
 * @returns {string} HTML string for the sidebar nav.
 */
export function getSidebarHTML(title, sections) {
  let links = '';
  for (const section of sections) {
    links += `  <a href="#${escapeAttr(section.id)}">${escapeHTML(section.title)}</a>\n`;
    if (section.subsections) {
      for (const sub of section.subsections) {
        links += `  <a href="#${escapeAttr(sub.id)}" class="sub">${escapeHTML(sub.title)}</a>\n`;
      }
    }
  }

  return `
<button class="side-nav-toggle" id="navToggle" title="Toggle navigation">&#9776;</button>
<nav class="side-nav" id="sideNav">
  <div class="nav-title">${escapeHTML(title)}</div>
${links}</nav>
`;
}

/**
 * Theme toggle button — single button cycling system → light → dark → system.
 * All three SVG icons are emitted; CSS shows only the one matching the current
 * data-theme-pref attribute. Click handler is wired in getBaseScript.
 * @returns {string}
 */
export function getThemeToggleHTML() {
  return `
<button class="theme-toggle" id="themeToggle" type="button" aria-label="Theme (click to cycle: system, light, dark)" title="Theme — click to cycle">
  <svg data-theme-icon="system" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
  <svg data-theme-icon="light" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
  <svg data-theme-icon="dark" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
</button>
`;
}

/**
 * Synchronous theme-init script for <head>. Must run before body render to
 * prevent FOUC. Reads the shared pref (plan-harness-theme), resolves "system"
 * against prefers-color-scheme, sets data-theme on <html>, and stashes the
 * pref on the <html> element so the toggle button reflects the right icon
 * as soon as it renders.
 * @returns {string}
 */
export function getThemeInitScript() {
  return `<script>
(function(){
  try {
    var KEY = 'plan-harness-theme';
    var pref = localStorage.getItem(KEY) || 'system';
    var dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme-pref', pref);
  } catch(e) {}
})();
</script>`;
}

/**
 * Breadcrumb shown in the sticky header: workspace › scenario › document.
 * Workspace is the basename of the repo being planned (eg. "canwa-claude-plugins").
 * Every segment except the last is a link; the last is non-link current state.
 *
 * @param {object} [opts]
 * @param {string} [opts.workspaceName] - repo/workspace basename; defaults to "workspace"
 * @param {string} [opts.scenarioName]  - scenario slug; omit on the dashboard
 * @param {string} [opts.currentLabel]  - document label; omit on scenario detail
 * @returns {string}
 */
export function getBreadcrumbHTML(opts = {}) {
  const { workspaceName = 'workspace', scenarioName, currentLabel } = opts;
  const parts = [];
  const wsLabel = escapeHTML(workspaceName);
  const hasScenario = !!scenarioName;
  const hasDoc = !!currentLabel;

  // Workspace — link unless it's the current page (dashboard root)
  if (hasScenario || hasDoc) {
    parts.push(`<a href="/" title="${wsLabel}">${wsLabel}</a>`);
  } else {
    parts.push(`<span class="current">${wsLabel}</span>`);
  }

  if (hasScenario) {
    const sLabel = escapeHTML(scenarioName);
    const sHref = `/scenario/${encodeURIComponent(scenarioName)}`;
    parts.push(`<span class="sep">›</span>`);
    if (hasDoc) {
      parts.push(`<a href="${escapeAttr(sHref)}" title="Scenario: ${sLabel}">${sLabel}</a>`);
    } else {
      parts.push(`<span class="current" title="Scenario: ${sLabel}">${sLabel}</span>`);
    }
  }

  if (hasDoc) {
    parts.push(`<span class="sep">›</span>`);
    parts.push(`<span class="current">${escapeHTML(currentLabel)}</span>`);
  }

  return `<nav class="ph-breadcrumb" aria-label="Breadcrumb">${parts.join('')}</nav>`;
}

/**
 * Inline JS for theme toggle, sidebar nav, and scroll tracking.
 * @param {string} storageKey - localStorage key for theme preference.
 * @returns {string} Script tag with interactivity code.
 */
function getBaseScript(_legacyStorageKey) {
  // _legacyStorageKey is ignored — the key is now uniformly "plan-harness-theme"
  // so a user's theme choice syncs across dashboard, scenario detail, and every
  // rendered plan document.
  return `
<script>
(function() {
  // Theme cycling: system -> light -> dark -> system ...
  var KEY = 'plan-harness-theme';
  var NEXT = { system: 'light', light: 'dark', dark: 'system' };
  var html = document.documentElement;
  var toggle = document.getElementById('themeToggle');

  function resolvePref(pref) {
    if (pref === 'dark') return 'dark';
    if (pref === 'light') return 'light';
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyPref(pref) {
    try { localStorage.setItem(KEY, pref); } catch(e) {}
    html.setAttribute('data-theme', resolvePref(pref));
    html.setAttribute('data-theme-pref', pref);
    if (toggle) {
      toggle.setAttribute('data-theme-pref', pref);
      toggle.setAttribute('aria-label', 'Theme: ' + pref + ' (click to cycle)');
      toggle.setAttribute('title', 'Theme: ' + pref + ' — click to cycle');
    }
  }

  var currentPref = (function() { try { return localStorage.getItem(KEY); } catch(e) { return null; } })() || 'system';
  applyPref(currentPref);

  if (toggle) {
    toggle.addEventListener('click', function() {
      var pref = (function() { try { return localStorage.getItem(KEY); } catch(e) { return null; } })() || 'system';
      applyPref(NEXT[pref] || 'system');
    });
  }

  // Follow the OS setting live while the user is in "system" mode.
  try {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
      var pref = (function() { try { return localStorage.getItem(KEY); } catch(e) { return null; } })() || 'system';
      if (pref === 'system') applyPref('system');
    });
  } catch(e) {}

  // Cross-tab / cross-document sync: any other plan-harness page that cycles
  // the theme fires a "storage" event that lets us update without reloading.
  window.addEventListener('storage', function(e) {
    if (e.key === KEY && e.newValue) applyPref(e.newValue);
  });

  // Side nav toggle & active section highlight
  var navToggle = document.getElementById('navToggle');
  var sideNav = document.getElementById('sideNav');
  if (navToggle && sideNav) {
    var navLinks = sideNav.querySelectorAll('a[href^="#"]');
    var sections = [];
    navLinks.forEach(function(link) {
      var id = link.getAttribute('href').slice(1);
      var el = document.getElementById(id);
      if (el) sections.push({ id: id, el: el, link: link });
    });

    navToggle.addEventListener('click', function() {
      document.body.classList.toggle('nav-open');
    });

    navLinks.forEach(function(link) {
      link.addEventListener('click', function() {
        if (window.innerWidth < 900) document.body.classList.remove('nav-open');
      });
    });

    function updateActive() {
      var scrollY = window.scrollY + 100;
      var current = null;
      for (var i = sections.length - 1; i >= 0; i--) {
        if (sections[i].el.offsetTop <= scrollY) { current = sections[i]; break; }
      }
      navLinks.forEach(function(l) { l.classList.remove('active'); });
      if (current) current.link.classList.add('active');
    }
    window.addEventListener('scroll', updateActive, { passive: true });
    updateActive();
  }

  // Print button
  var printBtn = document.getElementById('printBtn');
  if (printBtn) {
    printBtn.addEventListener('click', function() { window.print(); });
  }
})();
</script>
`;
}

/**
 * Complete page wrapper.
 * @param {string} content - The main body HTML.
 * @param {object} options
 * @param {string} options.title - Page <title> and <h1>.
 * @param {string} [options.subtitle] - Subtitle shown below title.
 * @param {string} [options.meta] - Metadata line (date, revision, etc).
 * @param {Array<{label: string, color: string}>} [options.tags] - Tag badges.
 * @param {Array<{id: string, title: string, subsections?: Array}>} [options.sections] - Sidebar sections.
 * @param {string} [options.scripts] - Additional inline script tags.
 * @param {string} [options.storageKey] - localStorage key for theme.
 * @param {Array<{label: string, href: string, active?: boolean}>} [options.planLinks] - Cross-link nav items.
 * @returns {string} Full self-contained HTML page.
 */
export function wrapPage(content, options = {}) {
  const {
    title = 'Plan Document',
    subtitle = '',
    meta = '',
    tags = [],
    sections = [],
    scripts = '',
    planLinks = [],
    workspaceName = 'workspace',
    scenarioName = null,
    currentLabel = null,
  } = options;

  const sidebarHTML = sections.length > 0 ? getSidebarHTML(title, sections) : '';
  const themeToggle = getThemeToggleHTML();
  const breadcrumb = getBreadcrumbHTML({ workspaceName, scenarioName, currentLabel });

  const tagBadges = tags.map(t =>
    `<span class="badge badge-${t.color || 'blue'}">${escapeHTML(t.label)}</span>`
  ).join(' ');

  const planNav = planLinks.length > 0 ? `
<div class="plan-nav">
  <span class="plan-nav-label">Plans:</span>
  ${planLinks.map(l => `<a href="${escapeAttr(l.href)}"${l.active ? ' class="active"' : ''}>${escapeHTML(l.label)}</a>`).join('\n  ')}
</div>
` : '';

  const metaHTML = (meta || tagBadges) ? `<p class="meta">${meta}${tagBadges ? '<br>' + tagBadges : ''}</p>` : '';
  const subtitleHTML = subtitle ? `<p class="meta" style="font-size:1rem;margin-bottom:0.5rem;">${escapeHTML(subtitle)}</p>` : '';

  // Breadcrumb + theme toggle are both fixed pills. body padding-top = 3rem
  // gives the pills (top:0.85rem + ~2.8rem tall = ~3.65rem bottom edge)
  // enough clearance so first content line sits just below them on load.
  const extraCSS = sections.length === 0 ? `
  body { padding-left: 0 !important; padding-top: 3rem; }
  .container { max-width: 1200px; }
` : `
  body { padding-top: 3rem; }
`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHTML(title)}</title>
<link rel="icon" type="image/png" href="/icon.png">
${getThemeInitScript()}
<style>
${getBaseCSS()}
${extraCSS}
</style>
</head>
<body>

${breadcrumb}
${themeToggle}
${sidebarHTML}
${planNav}

<div class="container">
<h1>${escapeHTML(title)}</h1>
${subtitleHTML}
${metaHTML}

${content}

</div>

${getBaseScript()}
${scripts}

</body>
</html>`;
}


// ---- Plan-specific template generators ----

/**
 * Generate dashboard HTML showing all scenarios.
 * @param {Array<{name: string, path: string, description?: string, workItem?: string, files?: Array<{type: string, path: string, exists: boolean}>, completion?: number}>} scenarios
 * @param {object} [options] - Additional options passed to wrapPage.
 * @returns {string} Full self-contained HTML page.
 */
export function generateDashboard(scenarios, options = {}) {
  const totalScenarios = scenarios.length;
  const totalFiles = scenarios.reduce((s, sc) => s + (sc.files ? sc.files.length : 0), 0);
  const existingFiles = scenarios.reduce((s, sc) => s + (sc.files ? sc.files.filter(f => f.exists).length : 0), 0);
  const totalTodos = scenarios.reduce((s, sc) => s + (sc.todos || 0), 0);
  const totalUnresolved = scenarios.reduce((s, sc) => s + (sc.unresolvedComments || 0), 0);

  // Must match the `type` keys emitted by scanScenarioDir in web-server.js.
  // Mismatched names (e.g. 'state-machines' vs 'state-machine') silently
  // render every card as missing even when the files exist.
  const planTypes = ['design', 'test-plan', 'state-machine', 'test-cases', 'implementation-plan'];

  // Cards are omitted when their count is zero — honest signal, no dead chrome.
  // Scenarios + Plan Files are always shown because they can be zero only
  // on a fresh workspace, where "0 scenarios" is itself a useful signal.
  let summaryCards = `
<div class="summary-grid">
  <div class="summary-card"><div class="summary-value">${totalScenarios}</div><div class="summary-label">Scenarios</div></div>
  <div class="summary-card"><div class="summary-value" style="color:var(--green)">${existingFiles}</div><div class="summary-label">Plan Files</div></div>
  ${totalTodos > 0 ? `<div class="summary-card"><div class="summary-value" style="color:var(--yellow)">${totalTodos}</div><div class="summary-label">Open TODOs</div></div>` : ''}
  ${totalUnresolved > 0 ? `<div class="summary-card"><div class="summary-value" style="color:var(--accent)">${totalUnresolved}</div><div class="summary-label">Unresolved comments</div></div>` : ''}
</div>
`;

  let scenarioCards = scenarios.map((sc, idx) => {
    const todos = sc.todos || 0;
    const unresolved = sc.unresolvedComments || 0;
    const fileCount = sc.files ? sc.files.length : 0;
    const existCount = sc.files ? sc.files.filter(f => f.exists).length : 0;
    const workItemLink = sc.workItem
      ? `<a href="${escapeAttr(sc.workItem)}" style="color:var(--accent);font-size:0.8rem;">${escapeHTML(sc.workItem)}</a>`
      : '';

    const filePills = planTypes.map(type => {
      const file = sc.files ? sc.files.find(f => f.type === type) : null;
      const exists = file && file.exists;
      const pillClass = exists ? 'badge-green' : '';
      const pillStyle = !exists ? 'background:var(--code-bg);color:var(--muted);border:1px solid var(--border);' : '';
      return `<span class="badge ${pillClass}" style="${pillStyle}font-size:0.7rem;">${type}</span>`;
    }).join(' ');

    // Status dot: yellow if anything open (todos OR unresolved comments),
    // muted grey if there's nothing tracked yet, green once the tracked
    // set is empty. Honest signal beats a fake percentage.
    const open = todos + unresolved;
    const statusDot = open === 0 && (existCount > 0)
      ? '<span style="color:var(--green);font-size:1.2rem;" title="No open items">&#10003;</span>'
      : open > 0
        ? '<span style="color:var(--yellow);font-size:1.2rem;" title="Open items">&#9679;</span>'
        : '<span style="color:var(--muted);font-size:1.2rem;" title="No tracked items">&#9675;</span>';

    return `
<div class="scenario-card" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.2rem;cursor:pointer;transition:box-shadow 0.15s,border-color 0.15s;" onclick="window.location.href='/scenario/${encodeURIComponent(sc.name)}'" onmouseover="this.style.boxShadow='var(--shadow-lg)';this.style.borderColor='var(--accent)'" onmouseout="this.style.boxShadow='';this.style.borderColor='var(--border)'">
  <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.6rem;">
    ${statusDot}
    <span style="font-size:1.05rem;font-weight:700;">${escapeHTML(sc.name)}</span>
  </div>
  ${sc.description ? `<p style="font-size:0.85rem;color:var(--muted);margin-bottom:0.6rem;">${escapeHTML(sc.description)}</p>` : ''}
  ${workItemLink ? `<div style="margin-bottom:0.6rem;">${workItemLink}</div>` : ''}
  <div style="margin-bottom:0.6rem;">${filePills}</div>
  <div style="display:flex;align-items:center;gap:0.9rem;font-size:0.85rem;flex-wrap:wrap;">
    <span style="color:var(--muted);">${existCount}/${fileCount} files</span>
    ${todos > 0 ? `<span style="color:var(--yellow);font-weight:600;" title="Open TODO items">${todos} todo</span>` : ''}
    ${unresolved > 0 ? `<span style="color:var(--accent);font-weight:600;" title="Unresolved comments">${unresolved} unresolved</span>` : ''}
  </div>
</div>
`;
  }).join('\n');

  const content = `
${summaryCards}

<h2 id="scenarios">Scenarios</h2>

<div class="filter-bar" style="margin-bottom:1rem;">
  <input type="text" id="scenarioSearch" placeholder="Search scenarios..." oninput="filterScenarios()" style="font-family:inherit;font-size:13px;padding:6px 10px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);width:250px;">
</div>

<div id="scenarioGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:1rem;">
${scenarioCards}
</div>
`;

  const scripts = `
<script>
function filterScenarios() {
  var query = document.getElementById('scenarioSearch').value.toLowerCase();
  var cards = document.querySelectorAll('.scenario-card');
  cards.forEach(function(card) {
    var text = card.textContent.toLowerCase();
    card.style.display = text.includes(query) ? '' : 'none';
  });
}
</script>
`;

  return wrapPage(content, {
    title: options.title || 'Plan Dashboard',
    subtitle: options.subtitle || '',
    meta: options.meta || `Generated ${new Date().toISOString().slice(0, 10)}`,
    tags: options.tags || [],
    sections: [],
    scripts,
    storageKey: 'plan-dashboard-theme',
    ...options
  });
}

/**
 * Generate a scenario detail page showing all plan files.
 * @param {object} scenario - { name, description, workItem, files: [{type, path, exists, completion}] }
 * @param {object} [options]
 * @returns {string} Full self-contained HTML page.
 */
export function generateScenarioDetail(scenario, options = {}) {
  // Types must match the keys emitted by scanScenarioDir in web-server.js.
  // Keep this list in sync with the planTypes array in generateDashboard above.
  const PLAN_DEFS = [
    { type: 'design', label: 'Design', blurb: 'Architecture, data model, API, UX, risks', skill: '/plan-design' },
    { type: 'test-plan', label: 'Test Plan', blurb: 'E2E scenarios, entry criteria, ownership', skill: '/plan-test-plan' },
    { type: 'state-machine', label: 'State Machine', blurb: 'Entity states, transitions, invariants', skill: '/plan-state-machine' },
    { type: 'test-cases', label: 'Test Cases', blurb: 'Priority-ranked cases with expected outcomes', skill: '/plan-test-cases' },
    { type: 'implementation-plan', label: 'Implementation', blurb: 'File-level steps, phases, dependencies', skill: '/plan-implementation' },
  ];

  const files = scenario.files || [];
  const byType = Object.fromEntries(files.map(f => [f.type, f]));

  const existingFiles = files.filter(f => f.exists);
  const totalTodos = files.reduce((s, f) => s + (f.todos || 0), 0);
  const totalDone = files.reduce((s, f) => s + (f.done || 0), 0);

  const tags = Array.isArray(scenario.tags) ? scenario.tags : [];
  const tagHTML = tags.map(t => `<span class="badge badge-blue" style="font-size:0.72rem;">${escapeHTML(t)}</span>`).join(' ');
  const statusPill = (() => {
    const s = scenario.status || 'draft';
    const color = s === 'complete' ? 'green' : s === 'in-progress' ? 'yellow' : 'blue';
    return `<span class="badge badge-${color}" style="font-size:0.72rem;text-transform:capitalize;">${escapeHTML(s)}</span>`;
  })();

  const totalUnresolved = scenario.unresolvedComments || 0;
  const summaryHTML = `
<div class="scn-summary">
  <div class="scn-stat"><div class="scn-stat-val">${existingFiles.length}<span class="scn-stat-total">/${PLAN_DEFS.length}</span></div><div class="scn-stat-label">Documents</div></div>
  ${totalTodos > 0 ? `<div class="scn-stat"><div class="scn-stat-val" style="color:var(--yellow);">${totalTodos}</div><div class="scn-stat-label">Open TODOs</div></div>` : ''}
  ${totalUnresolved > 0 ? `<div class="scn-stat"><div class="scn-stat-val" style="color:var(--accent);">${totalUnresolved}</div><div class="scn-stat-label">Unresolved comments</div></div>` : ''}
</div>`;

  const descHTML = scenario.description
    ? `<p class="scn-description">${escapeHTML(scenario.description)}</p>`
    : '';

  const metaRowHTML = `
<div class="scn-meta-row">
  ${statusPill}
  ${tagHTML}
  ${scenario.workItem ? `<a href="${escapeAttr(scenario.workItem)}" class="scn-meta-link">Work item: ${escapeHTML(scenario.workItem)}</a>` : ''}
</div>`;

  const docsHTML = PLAN_DEFS.map(def => {
    const f = byType[def.type];
    const exists = !!(f && f.exists);
    const docTodos = (f && f.todos) || 0;
    const docUnresolved = (f && f.unresolvedComments) || 0;
    const hasOpen = docTodos + docUnresolved > 0;
    const state = !exists ? 'missing' : hasOpen ? 'partial' : 'complete';
    const stateBadge = !exists
      ? `<span class="doc-state doc-state-missing">Not generated</span>`
      : hasOpen
        ? `<span class="doc-state doc-state-partial">${docTodos + docUnresolved} open</span>`
        : `<span class="doc-state doc-state-complete">Clear</span>`;

    const primaryAction = exists
      ? `<a href="/view?path=${encodeURIComponent(f.path)}" class="doc-primary-action">Open →</a>`
      : `<code class="doc-skill">${escapeHTML(def.skill)} ${escapeHTML(scenario.name || '')}</code>`;

    // Counts row only shows non-zero items. When the doc has zero of
    // everything, the whole row is suppressed — the "Clear" state badge
    // already communicates the signal, so repeating "0 todo · 0 unresolved"
    // is just noise.
    const countParts = [];
    if (docTodos > 0) countParts.push(`<span class="doc-count doc-count-todo" title="Open TODOs in this doc">${docTodos} todo</span>`);
    if (docUnresolved > 0) countParts.push(`<span class="doc-count doc-count-unresolved" title="Unresolved comments on this doc">${docUnresolved} unresolved</span>`);
    const countsRow = (exists && countParts.length > 0)
      ? `<div class="doc-counts">${countParts.join('')}</div>`
      : '';

    return `
<article class="doc-card doc-card-${state}">
  <header class="doc-card-header">
    <h3 class="doc-card-title">${escapeHTML(def.label)}</h3>
    ${stateBadge}
  </header>
  <p class="doc-card-blurb">${escapeHTML(def.blurb)}</p>
  ${countsRow}
  <footer class="doc-card-footer">${primaryAction}</footer>
</article>`;
  }).join('');

  const content = `
${descHTML}
${metaRowHTML}
${summaryHTML}

<h2 id="documents" class="scn-section-header">Plan documents</h2>
<div class="doc-grid">
${docsHTML}
</div>
`;

  const scenarioStyles = `
<style>
.scn-description { font-size: 1.05rem; color: var(--muted); margin: 0.5rem 0 1.25rem; max-width: 70ch; }
.scn-meta-row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 2rem; }
.scn-meta-link { font-size: 0.85rem; color: var(--accent); }
.scn-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin: 0 0 2.5rem; padding: 1.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.scn-stat { text-align: left; }
.scn-stat-val { font-size: 1.8rem; font-weight: 510; color: var(--text); letter-spacing: -0.02em; line-height: 1; }
.scn-stat-total { font-size: 1rem; color: var(--muted); font-weight: 400; }
.scn-stat-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.4rem; }
.scn-section-header { border-bottom: none; margin-top: 1rem; }
.doc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
.doc-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.1rem 1.25rem 1.25rem; display: flex; flex-direction: column; gap: 0.7rem; transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s; }
.doc-card:hover { border-color: var(--accent); box-shadow: var(--shadow-lg); transform: translateY(-1px); }
.doc-card-missing { opacity: 0.78; }
.doc-card-missing:hover { opacity: 1; }
.doc-card-header { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; }
.doc-card-title { font-size: 1rem; font-weight: 510; margin: 0; color: var(--text); }
.doc-card-blurb { font-size: 0.82rem; color: var(--muted); margin: 0; line-height: 1.5; min-height: 2.4em; }
.doc-state { font-size: 0.7rem; font-weight: 600; padding: 0.15em 0.55em; border-radius: 12px; white-space: nowrap; }
.doc-state-complete { background: var(--badge-green-bg); color: var(--green); border: 1px solid var(--green); }
.doc-state-partial { background: var(--badge-yellow-bg); color: var(--yellow); border: 1px solid var(--yellow); }
.doc-state-missing { background: transparent; color: var(--muted); border: 1px solid var(--border); }
.doc-progress { height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
.doc-progress-fill { height: 100%; background: var(--accent); transition: width 0.3s; }
.doc-progress-fill.doc-progress-empty { background: transparent; }
.doc-card-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 0.25rem; border-top: 1px solid var(--border); margin-top: 0.2rem; padding-top: 0.7rem; }
.doc-primary-action { font-size: 0.85rem; font-weight: 510; color: var(--accent); text-decoration: none; }
.doc-primary-action:hover { text-decoration: underline; }
.doc-skill { font-size: 0.72rem; color: var(--muted); background: var(--code-bg); padding: 0.2em 0.5em; border-radius: var(--radius-sm); font-family: var(--font-mono); }
</style>`;

  return wrapPage(content, {
    title: scenario.name,
    subtitle: '',
    meta: '',
    sections: [],
    scripts: scenarioStyles,
    scenarioName: scenario.name,
    ...options
  });
}

/**
 * Generate a design document shell.
 * @param {Array<{id: string, title: string, content: string, subsections?: Array<{id: string, title: string, content: string}>}>} sections
 * @param {object} [options]
 * @returns {string} Full self-contained HTML page.
 */
export function generateDesignDoc(sections, options = {}) {
  const navSections = sections.map((s, i) => ({
    id: s.id,
    title: `${i + 1}. ${s.title}`,
    subsections: (s.subsections || []).map(sub => ({ id: sub.id, title: sub.title }))
  }));

  let body = '';
  sections.forEach((section, i) => {
    body += `\n<h2 id="${escapeAttr(section.id)}">${i + 1}. ${escapeHTML(section.title)}</h2>\n`;
    body += section.content + '\n';

    if (section.subsections) {
      section.subsections.forEach(sub => {
        body += `\n<h3 id="${escapeAttr(sub.id)}">${escapeHTML(sub.title)}</h3>\n`;
        body += sub.content + '\n';
      });
    }
  });

  return wrapPage(body, {
    title: options.title || 'Design Document',
    subtitle: options.subtitle || '',
    meta: options.meta || '',
    tags: options.tags || [],
    sections: navSections,
    storageKey: 'plan-design-theme',
    planLinks: options.planLinks || [],
    ...options
  });
}

/**
 * Generate test plan document with scenarios, steps, and checkboxes.
 * @param {Array<{id: string, title: string, steps: Array<{action: string, verify?: string, checked?: boolean}>, preconditions?: string, postconditions?: string}>} scenarios
 * @param {object} [options]
 * @returns {string} Full self-contained HTML page.
 */
export function generateTestPlan(scenarios, options = {}) {
  const navSections = scenarios.map((s, i) => ({
    id: s.id,
    title: `S${i + 1}: ${s.title}`,
    subsections: [{ id: `${s.id}-steps`, title: 'Steps' }]
  }));

  // Insert progress tracker at top
  let body = `
<div class="callout callout-important">
<div class="callout-title">How to Use This Document</div>
<ul>
<li>Execute scenarios <strong>in order</strong> -- later scenarios depend on state created by earlier ones</li>
<li>Check each checkbox as you complete a step</li>
<li>The progress tracker updates automatically as you check steps</li>
</ul>
</div>

<div id="progress">
<div class="progress-bar">
  <span class="label">Test Progress</span>
  <div class="progress-track"><div class="progress-fill" id="progressFill" style="width: 0%"></div></div>
  <span class="progress-count" id="progressCount">0 / 0 steps</span>
</div>
</div>
`;

  scenarios.forEach((scenario, i) => {
    body += `\n<h2 id="${escapeAttr(scenario.id)}">Scenario ${i + 1}: ${escapeHTML(scenario.title)}</h2>\n`;
    body += `<div class="scenario">\n`;
    body += `<div class="scenario-header">
  <div class="scenario-num">${i + 1}</div>
  <div class="scenario-title">${escapeHTML(scenario.title)}</div>
</div>\n`;

    if (scenario.preconditions) {
      body += `<div class="precondition"><strong>Preconditions:</strong> ${scenario.preconditions}</div>\n`;
    }

    body += `<h4 id="${escapeAttr(scenario.id)}-steps">Steps</h4>\n`;

    scenario.steps.forEach((step, j) => {
      body += `
<div class="step-row">
  <input type="checkbox" class="step-check" data-scenario="${i + 1}"${step.checked ? ' checked' : ''}>
  <div class="step-content">
    <div class="step-action">${i + 1}.${j + 1} -- ${step.action}</div>
    ${step.verify ? `<div class="step-verify">${step.verify}</div>` : ''}
  </div>
</div>
`;
    });

    if (scenario.postconditions) {
      body += `<div class="postcondition"><strong>Postconditions:</strong> ${scenario.postconditions}</div>\n`;
    }

    body += `</div>\n`;
  });

  const storageKey = options.storageKey || 'plan-testplan-progress';

  const scripts = `
<script>
(function() {
  var checks = document.querySelectorAll('.step-check');
  var fill = document.getElementById('progressFill');
  var count = document.getElementById('progressCount');

  function updateProgress() {
    var total = checks.length;
    var done = Array.from(checks).filter(function(c) { return c.checked; }).length;
    fill.style.width = total ? (done / total * 100) + '%' : '0%';
    count.textContent = done + ' / ' + total + ' steps';
    var state = Array.from(checks).map(function(c) { return c.checked; });
    localStorage.setItem('${storageKey}', JSON.stringify(state));
  }

  try {
    var saved = JSON.parse(localStorage.getItem('${storageKey}'));
    if (saved && saved.length === checks.length) {
      saved.forEach(function(v, i) { checks[i].checked = v; });
    }
  } catch(e) {}

  checks.forEach(function(c) { c.addEventListener('change', updateProgress); });
  updateProgress();
})();
</script>
`;

  return wrapPage(body, {
    title: options.title || 'E2E Test Plan',
    subtitle: options.subtitle || '',
    meta: options.meta || '',
    tags: options.tags || [],
    sections: navSections,
    scripts,
    storageKey: 'plan-testplan-theme',
    planLinks: options.planLinks || [],
    ...options
  });
}

/**
 * Generate state machine document.
 * @param {Array<{name: string, description: string, states?: Array<{name: string, badge?: string}>, transitions?: Array<{from: string, to: string, trigger: string}>}>} entities
 * @param {Array<{title: string, svg: string}>} diagrams
 * @param {object} [options]
 * @returns {string} Full self-contained HTML page.
 */
export function generateStateMachine(entities, diagrams, options = {}) {
  const navSections = [
    { id: 'entities', title: 'Entity Overview', subsections: entities.map(e => ({ id: `entity-${slugify(e.name)}`, title: e.name })) },
    { id: 'diagrams', title: 'Diagrams', subsections: diagrams.map((d, i) => ({ id: `diagram-${i}`, title: d.title })) }
  ];

  let body = '';

  // Entities section
  body += `<h2 id="entities">Entity Overview</h2>\n`;
  body += `<p>The system defines the following entities and their state lifecycles.</p>\n`;

  entities.forEach(entity => {
    body += `\n<div class="node-card" id="entity-${escapeAttr(slugify(entity.name))}">\n`;
    body += `<h4>${escapeHTML(entity.name)}</h4>\n`;
    body += `<p>${entity.description}</p>\n`;

    if (entity.states && entity.states.length > 0) {
      body += `<p>States: `;
      body += entity.states.map(s => {
        const color = s.badge || 'blue';
        return `<span class="badge badge-${color}">${escapeHTML(s.name)}</span>`;
      }).join(' ');
      body += `</p>\n`;
    }

    if (entity.transitions && entity.transitions.length > 0) {
      body += `<table>\n<tr><th>From</th><th>Trigger</th><th>To</th></tr>\n`;
      entity.transitions.forEach(t => {
        body += `<tr><td><span class="state-box">${escapeHTML(t.from)}</span></td><td>${escapeHTML(t.trigger)}</td><td><span class="state-box">${escapeHTML(t.to)}</span></td></tr>\n`;
      });
      body += `</table>\n`;
    }

    body += `</div>\n`;
  });

  // Diagrams section
  if (diagrams.length > 0) {
    body += `\n<h2 id="diagrams">Diagrams</h2>\n`;
    diagrams.forEach((diagram, i) => {
      body += `<h3 id="diagram-${i}">${escapeHTML(diagram.title)}</h3>\n`;
      body += `<div class="diagram-box">\n${diagram.svg}\n</div>\n`;
    });
  }

  return wrapPage(body, {
    title: options.title || 'State Machines',
    subtitle: options.subtitle || '',
    meta: options.meta || '',
    tags: options.tags || [],
    sections: navSections,
    storageKey: 'plan-statemachine-theme',
    planLinks: options.planLinks || [],
    ...options
  });
}

/**
 * Generate test cases document with expandable cards, filters, and progress tracking.
 * @param {Array<{id: string, name: string, priority?: string, cases: Array<{id: string, title: string, priority?: string, steps?: string[], expected?: string, status?: string}>}>} categories
 * @param {object} [options]
 * @returns {string} Full self-contained HTML page.
 */
export function generateTestCases(categories, options = {}) {
  const totalCases = categories.reduce((s, c) => s + c.cases.length, 0);

  // Build nav sections
  const navSections = categories.map(cat => ({
    id: `cat-${cat.id}`,
    title: cat.name,
    subsections: []
  }));

  // Summary + filter bar + bulk actions
  let body = `
<div id="summary" class="section">
  <div class="section-header">
    <span class="section-title">Test Plan Dashboard</span>
  </div>
  <div class="summary-grid" id="summaryGrid">
    <div class="summary-card"><div class="summary-value" id="totalCount">${totalCases}</div><div class="summary-label">Total Cases</div></div>
    <div class="summary-card"><div class="summary-value" id="passedCount" style="color:var(--green)">0</div><div class="summary-label">Passed</div></div>
    <div class="summary-card"><div class="summary-value" id="remainCount" style="color:var(--yellow)">${totalCases}</div><div class="summary-label">Remaining</div></div>
  </div>

  <div class="bulk-actions">
    <button class="btn" onclick="expandAll()">Expand All</button>
    <button class="btn" onclick="collapseAll()">Collapse All</button>
    <button class="btn btn-success" onclick="checkAll()">Check All</button>
    <button class="btn btn-danger" onclick="uncheckAll()">Uncheck All</button>
    <button class="btn" onclick="exportState()">Export Progress</button>
    <button class="btn" onclick="importState()">Import Progress</button>
    <button class="btn" id="printBtn">Print</button>
  </div>

  <div class="filter-bar">
    <select id="filterPriority" onchange="applyFilters()">
      <option value="">All Priorities</option>
      <option value="P0">P0 - Critical</option>
      <option value="P1">P1 - High</option>
      <option value="P2">P2 - Medium</option>
    </select>
    <select id="filterStatus" onchange="applyFilters()">
      <option value="">All Statuses</option>
      <option value="unchecked">Not Started</option>
      <option value="checked">Completed</option>
    </select>
    <input type="text" id="filterSearch" placeholder="Search test cases..." oninput="applyFilters()">
    <button class="btn" onclick="clearFilters()">Clear Filters</button>
  </div>
</div>
`;

  // Render each category with its test case cards
  categories.forEach(cat => {
    body += `\n<div id="cat-${escapeAttr(cat.id)}" class="section">\n`;
    body += `<div class="section-header">
  <span class="section-title">${escapeHTML(cat.name)}</span>
  <span class="section-count" id="count-${escapeAttr(cat.id)}"></span>
</div>\n`;

    cat.cases.forEach(tc => {
      const priority = tc.priority || cat.priority || 'P2';
      const priorityClass = priority.toLowerCase();

      body += `
<div class="tc-card" data-id="${escapeAttr(tc.id)}" data-priority="${escapeAttr(priority)}" data-cat="${escapeAttr(cat.id)}">
  <div class="tc-header" onclick="toggleCard(this)">
    <input type="checkbox" class="tc-checkbox" onclick="event.stopPropagation(); updateProgress();">
    <span class="tc-id">${escapeHTML(tc.id)}</span>
    <span class="tc-title">${escapeHTML(tc.title)}</span>
    <span class="tc-priority ${priorityClass}">${escapeHTML(priority)}</span>
    <span class="tc-expand">&#9654;</span>
  </div>
  <div class="tc-body">
`;
      if (tc.steps && tc.steps.length > 0) {
        body += `    <div class="tc-field"><div class="tc-label">Steps</div><ol class="tc-steps">\n`;
        tc.steps.forEach(step => {
          body += `      <li>${escapeHTML(step)}</li>\n`;
        });
        body += `    </ol></div>\n`;
      }
      if (tc.expected) {
        body += `    <div class="tc-field"><div class="tc-label">Expected Result</div><div class="tc-value">${escapeHTML(tc.expected)}</div></div>\n`;
      }
      body += `  </div>
</div>
`;
    });

    body += `</div>\n`;
  });

  const storageKey = options.storageKey || 'plan-testcases-state';

  const scripts = `
<script>
function toggleCard(header) {
  header.closest('.tc-card').classList.toggle('expanded');
}
function expandAll() {
  document.querySelectorAll('.tc-card').forEach(function(c) { c.classList.add('expanded'); });
}
function collapseAll() {
  document.querySelectorAll('.tc-card').forEach(function(c) { c.classList.remove('expanded'); });
}
function checkAll() {
  document.querySelectorAll('.tc-card').forEach(function(card) {
    if (card.style.display !== 'none') {
      card.querySelector('.tc-checkbox').checked = true;
    }
  });
  updateProgress();
}
function uncheckAll() {
  document.querySelectorAll('.tc-checkbox').forEach(function(cb) { cb.checked = false; });
  updateProgress();
}

function updateProgress() {
  var all = document.querySelectorAll('.tc-checkbox');
  var checked = document.querySelectorAll('.tc-checkbox:checked');
  var total = all.length;
  var done = checked.length;

  document.getElementById('totalCount').textContent = total;
  document.getElementById('passedCount').textContent = done;
  document.getElementById('remainCount').textContent = total - done;

  all.forEach(function(cb) {
    var card = cb.closest('.tc-card');
    card.classList.toggle('checked', cb.checked);
  });

  // Per-category counts
  var cats = {};
  all.forEach(function(cb) {
    var cat = cb.closest('.tc-card').dataset.cat;
    if (!cats[cat]) cats[cat] = { total: 0, done: 0 };
    cats[cat].total++;
    if (cb.checked) cats[cat].done++;
  });
  for (var cat in cats) {
    var el = document.getElementById('count-' + cat);
    if (el) el.textContent = cats[cat].done + ' / ' + cats[cat].total + ' complete';
  }

  saveState();
}

function saveState() {
  var state = {};
  document.querySelectorAll('.tc-card').forEach(function(card) {
    var cb = card.querySelector('.tc-checkbox');
    state[card.dataset.id] = cb.checked;
  });
  localStorage.setItem('${storageKey}', JSON.stringify(state));
}

function loadState() {
  try {
    var state = JSON.parse(localStorage.getItem('${storageKey}') || '{}');
    document.querySelectorAll('.tc-card').forEach(function(card) {
      var cb = card.querySelector('.tc-checkbox');
      if (state[card.dataset.id]) cb.checked = true;
    });
  } catch (e) {}
  updateProgress();
}

function exportState() {
  var state = {};
  document.querySelectorAll('.tc-card').forEach(function(card) {
    var cb = card.querySelector('.tc-checkbox');
    state[card.dataset.id] = cb.checked;
  });
  var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'test-progress.json'; a.click();
  URL.revokeObjectURL(url);
}

function importState() {
  var input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = function(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var state = JSON.parse(ev.target.result);
        document.querySelectorAll('.tc-card').forEach(function(card) {
          var cb = card.querySelector('.tc-checkbox');
          cb.checked = !!state[card.dataset.id];
        });
        updateProgress();
      } catch (err) { alert('Invalid file format'); }
    };
    reader.readAsText(file);
  };
  input.click();
}

function applyFilters() {
  var priority = document.getElementById('filterPriority').value;
  var status = document.getElementById('filterStatus').value;
  var search = document.getElementById('filterSearch').value.toLowerCase();

  document.querySelectorAll('.tc-card').forEach(function(card) {
    var show = true;
    if (priority && card.dataset.priority !== priority) show = false;
    if (status === 'checked' && !card.querySelector('.tc-checkbox').checked) show = false;
    if (status === 'unchecked' && card.querySelector('.tc-checkbox').checked) show = false;
    if (search) {
      var text = (card.dataset.id + ' ' + card.querySelector('.tc-title').textContent).toLowerCase();
      if (!text.includes(search)) show = false;
    }
    card.style.display = show ? '' : 'none';
  });
}

function clearFilters() {
  document.getElementById('filterPriority').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterSearch').value = '';
  applyFilters();
}

// Nav active state via IntersectionObserver
var navObserver = new IntersectionObserver(function(entries) {
  entries.forEach(function(entry) {
    if (entry.isIntersecting) {
      var navLinks = document.querySelectorAll('.side-nav a');
      navLinks.forEach(function(l) { l.classList.remove('active'); });
      var link = document.querySelector('.side-nav a[href="#' + entry.target.id + '"]');
      if (link) link.classList.add('active');
    }
  });
}, { rootMargin: '-80px 0px -60% 0px' });

document.querySelectorAll('.section[id]').forEach(function(s) { navObserver.observe(s); });

loadState();
</script>
`;

  return wrapPage(body, {
    title: options.title || 'Test Cases',
    subtitle: options.subtitle || '',
    meta: options.meta || '',
    tags: options.tags || [],
    sections: navSections,
    scripts,
    storageKey: 'plan-testcases-theme',
    planLinks: options.planLinks || [],
    ...options
  });
}

/**
 * Generate implementation plan document with expandable steps.
 * @param {Array<{id: string, title: string, description?: string, parallel?: boolean, substeps?: Array<{title: string, description?: string}>, files?: string[], status?: string}>} steps
 * @param {object} [options]
 * @returns {string} Full self-contained HTML page.
 */
export function generateImplementationPlan(steps, options = {}) {
  const navSections = steps.map((s, i) => ({
    id: s.id,
    title: `${i + 1}. ${s.title}`,
    subsections: []
  }));

  const statusColors = {
    'done': 'green', 'complete': 'green', 'completed': 'green',
    'in-progress': 'yellow', 'in progress': 'yellow', 'wip': 'yellow',
    'blocked': 'red',
    'not-started': 'blue', 'pending': 'blue', 'todo': 'blue'
  };

  // Summary
  const done = steps.filter(s => ['done', 'complete', 'completed'].includes((s.status || '').toLowerCase())).length;
  const total = steps.length;

  let body = `
<div class="summary-grid">
  <div class="summary-card"><div class="summary-value">${total}</div><div class="summary-label">Total Steps</div></div>
  <div class="summary-card"><div class="summary-value" style="color:var(--green)">${done}</div><div class="summary-label">Completed</div></div>
  <div class="summary-card"><div class="summary-value" style="color:var(--yellow)">${total - done}</div><div class="summary-label">Remaining</div></div>
</div>

<div class="progress-bar">
  <span class="label">Implementation Progress</span>
  <div class="progress-track"><div class="progress-fill" style="width: ${total ? Math.round(done / total * 100) : 0}%"></div></div>
  <span class="progress-count">${done} / ${total} steps</span>
</div>

<div class="bulk-actions">
  <button class="btn" onclick="expandAllImpl()">Expand All</button>
  <button class="btn" onclick="collapseAllImpl()">Collapse All</button>
  <button class="btn" id="printBtn">Print</button>
</div>
`;

  steps.forEach((step, i) => {
    const statusKey = (step.status || 'pending').toLowerCase();
    const color = statusColors[statusKey] || 'blue';
    const statusLabel = step.status || 'Pending';
    const parallelBadge = step.parallel ? ' <span class="badge badge-purple">Parallel</span>' : '';

    body += `
<div class="impl-step" id="${escapeAttr(step.id)}">
  <div class="impl-step-header" onclick="this.closest('.impl-step').classList.toggle('expanded')">
    <div class="impl-step-num">${i + 1}</div>
    <div class="impl-step-title">${escapeHTML(step.title)}${parallelBadge}</div>
    <span class="impl-step-status badge badge-${color}">${escapeHTML(statusLabel)}</span>
    <span class="impl-step-expand">&#9654;</span>
  </div>
  <div class="impl-step-body">
`;

    if (step.description) {
      body += `    <p>${step.description}</p>\n`;
    }

    if (step.substeps && step.substeps.length > 0) {
      body += `    <h4>Substeps</h4>\n`;
      step.substeps.forEach((sub, j) => {
        body += `    <div class="impl-substep">${i + 1}.${j + 1} ${escapeHTML(sub.title)}${sub.description ? ` <span style="color:var(--muted);font-size:0.85rem;">-- ${sub.description}</span>` : ''}</div>\n`;
      });
    }

    if (step.files && step.files.length > 0) {
      body += `    <h4>Files</h4>\n`;
      body += `    <div class="impl-files">\n`;
      step.files.forEach(f => {
        body += `      <span class="impl-file">${escapeHTML(f)}</span>\n`;
      });
      body += `    </div>\n`;
    }

    body += `  </div>
</div>
`;
  });

  const scripts = `
<script>
function expandAllImpl() {
  document.querySelectorAll('.impl-step').forEach(function(s) { s.classList.add('expanded'); });
}
function collapseAllImpl() {
  document.querySelectorAll('.impl-step').forEach(function(s) { s.classList.remove('expanded'); });
}
</script>
`;

  return wrapPage(body, {
    title: options.title || 'Implementation Plan',
    subtitle: options.subtitle || '',
    meta: options.meta || '',
    tags: options.tags || [],
    sections: navSections,
    scripts,
    storageKey: 'plan-implplan-theme',
    planLinks: options.planLinks || [],
    ...options
  });
}


// ---- Utility functions ----

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---- Stable section IDs (Phase 1 of built-in-comment-ui) ----
// See plans/built-in-comment-ui/design.html §3 for the algorithm spec.

function normalizeSectionTitle(title) {
  return String(title)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Deterministic section id for a heading, shared by the HTML emitter and the
 * /view-time post-processor so the comment anchor survives doc regeneration.
 * @param {string[]} parentChain  normalized ancestor titles (empty for h2)
 * @param {number} depth          2 | 3 | 4
 * @param {string} normalizedTitle  output of normalizeSectionTitle(titleText)
 * @returns {string} e.g. "sec-4f3a9c2e8b1d6f0a"
 */
export function computeSectionId(parentChain, depth, normalizedTitle) {
  const input = `${depth}:${parentChain.join('/')}:${normalizedTitle}`;
  const hex = createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 16);
  return `sec-${hex}`;
}

/**
 * Inject data-section-id="sec-<16hex>" on every <h2>/<h3>/<h4> in document
 * order. Idempotent: headings that already carry data-section-id are left
 * untouched. Within-doc collisions get -2, -3 suffixes.
 *
 * The output is a stable content-anchor that survives regen, which the
 * comment widget uses to reattach a W3C-style anchor (prefix + exact +
 * suffix) after the doc is rewritten.
 */
export function injectSectionIds(html) {
  if (!html || typeof html !== 'string') return html;

  const seen = new Map();
  const parentChain = [];

  return html.replace(
    /<(h[234])\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (match, tag, attrs, inner) => {
      const depth = parseInt(tag[1], 10);

      const text = inner
        .replace(/<[^>]+>/g, '')
        .replace(/&[a-zA-Z#0-9]+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const normalized = normalizeSectionTitle(text);
      if (!normalized) return match;

      parentChain.length = depth - 2;
      parentChain.push(normalized);

      if (/\bdata-section-id\s*=/.test(attrs)) return match;

      const parents = parentChain.slice(0, -1);
      let id = computeSectionId(parents, depth, normalized);
      if (seen.has(id)) {
        const n = seen.get(id) + 1;
        seen.set(id, n);
        id = `${id}-${n}`;
      } else {
        seen.set(id, 1);
      }

      return `<${tag}${attrs} data-section-id="${id}">${inner}</${tag}>`;
    }
  );
}

/**
 * Inject the sidebar auxiliary panels widget (TODOs + Comments) — a tiny
 * client-side script that runs on DOMContentLoaded, scans the main content
 * for TODO / FIXME / checkbox items, and fetches comments from the API.
 * It appends two collapsible <details> panels to .side-nav.
 *
 * Idempotent: skips injection if window.__PH_SIDEBAR_PANELS_LOADED is truthy.
 * Works on any plan doc without regen because it reads live DOM + fetches.
 */
export function injectSidebarPanels(html) {
  if (!html || typeof html !== 'string') return html;
  if (html.includes('/* ph-sidebar-panels */')) return html;

  const block = `
<style>/* ph-sidebar-panels */
.ph-side-panel { border-top: 1px solid var(--border, #e0e0e0); margin: 0; padding: 0; background: transparent; border-left: 0; border-right: 0; border-bottom: 0; border-radius: 0; overflow: visible; }
.ph-side-panel > .ph-panel-body { display: none; }
.ph-side-panel[open] > .ph-panel-body { display: block; }
.ph-subsection { margin-top: 0.4rem; }
.ph-subsection > summary {
  cursor: pointer; padding: 0.25rem 0.55rem; font-size: 0.66rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted, #62666d);
  list-style: none; user-select: none;
}
.ph-subsection > summary::-webkit-details-marker { display: none; }
.ph-subsection > summary::before {
  content: '▸'; font-size: 0.55rem; margin-right: 0.3rem; display: inline-block; transition: transform 0.15s;
}
.ph-subsection[open] > summary::before { transform: rotate(90deg); }
.ph-todo-row { position: relative; border-left: 2px solid transparent; border-radius: 4px; transition: background 0.12s, border-color 0.12s; }
.ph-todo-row:hover { background: var(--bg, #f7f8f8); border-left-color: var(--accent, #5e6ad2); }
.ph-todo-row.ph-done .ph-todo-main .ph-item-label { text-decoration: line-through; opacity: 0.55; }
.ph-todo-main { display: flex; align-items: flex-start; gap: 0.3rem; padding: 0.4rem 0.55rem; cursor: pointer; }
.ph-todo-main:focus-visible { outline: 2px solid var(--accent, #5e6ad2); outline-offset: -2px; border-radius: 4px; }
.ph-todo-text { flex: 1; min-width: 0; }
.ph-todo-chip {
  font-size: 0.6rem; padding: 0.05rem 0.35rem; border-radius: 3px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;
  margin-left: 0.3rem; align-self: flex-start; margin-top: 0.1rem;
}
.ph-todo-chip-revise { background: rgba(113,112,255,0.14); color: var(--purple, #7170ff); }
.ph-todo-chip-thread { background: var(--code-bg, #eeeff1); color: var(--muted, #62666d); }
.ph-todo-actions {
  display: none; gap: 0.15rem; padding: 0 0.3rem 0.3rem 0.5rem; align-items: center;
}
.ph-todo-row:hover .ph-todo-actions,
.ph-todo-row:focus-within .ph-todo-actions { display: flex; }
.ph-todo-action {
  width: 22px; height: 22px; padding: 0; border: 1px solid transparent; background: transparent;
  color: var(--muted, #62666d); border-radius: 4px; cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.ph-todo-action:hover { background: var(--surface, #f3f4f5); color: var(--accent, #5e6ad2); border-color: var(--border, #d0d6e0); }
.ph-todo-action:focus-visible { outline: 2px solid var(--accent, #5e6ad2); outline-offset: 1px; }
.ph-todo-action svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.ph-todo-action[data-action="resolve"]:hover { color: var(--green, #1a7f37); }
.ph-todo-action[data-action="revise"]:hover { color: var(--purple, #7170ff); }
.ph-composer {
  margin: 0 0.5rem 0.5rem; padding: 0.5rem; border: 1px solid var(--border, #d0d6e0);
  border-radius: 6px; background: var(--surface, #f3f4f5);
  display: none; flex-direction: column; gap: 0.4rem;
}
.ph-composer[data-open="1"] { display: flex; }
.ph-composer textarea {
  width: 100%; min-height: 3rem; max-height: 10rem; resize: vertical; box-sizing: border-box;
  padding: 0.35rem 0.5rem; border: 1px solid var(--border, #d0d6e0); border-radius: 4px;
  font: 500 0.78rem/1.35 inherit; background: var(--bg, #f7f8f8); color: var(--text, #08090a);
}
.ph-composer textarea:focus { outline: 2px solid var(--accent, #5e6ad2); outline-offset: -1px; }
.ph-composer-meta { font-size: 0.65rem; color: var(--muted, #62666d); }
.ph-composer-row { display: flex; justify-content: space-between; align-items: center; gap: 0.4rem; }
.ph-composer button {
  font: 600 0.72rem/1 inherit; padding: 0.3rem 0.7rem; border-radius: 4px; cursor: pointer;
  border: 1px solid var(--border, #d0d6e0); background: var(--bg, #f7f8f8); color: var(--text, #08090a);
  transition: background 0.12s, color 0.12s;
}
.ph-composer button.ph-composer-submit { background: var(--accent, #5e6ad2); color: var(--bg, #fff); border-color: var(--accent, #5e6ad2); }
.ph-composer button.ph-composer-submit:hover { opacity: 0.9; }
.ph-composer button:disabled { opacity: 0.5; cursor: not-allowed; }
.ph-composer-error { color: var(--red, #cf222e); font-size: 0.7rem; }
.ph-side-panel > summary {
  cursor: pointer; padding: 0.55rem 1rem;
  font: 700 0.68rem/1 'Inter Variable', Inter, system-ui, sans-serif;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--muted, #62666d);
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  list-style: none; user-select: none; transition: color 0.12s;
}
.ph-side-panel > summary::-webkit-details-marker { display: none; }
.ph-side-panel > summary::before {
  content: '▸'; font-size: 0.6rem; margin-right: 0.35rem;
  transition: transform 0.15s; display: inline-block; color: var(--muted, #62666d);
}
.ph-side-panel[open] > summary::before { transform: rotate(90deg); }
.ph-side-panel > summary:hover { color: var(--text, #08090a); }
.ph-side-panel > summary:focus-visible { outline: 2px solid var(--accent, #5e6ad2); outline-offset: -2px; border-radius: 3px; }
.ph-count {
  font-size: 0.65rem; background: var(--code-bg, #eeeff1); color: var(--muted, #62666d);
  padding: 0.1rem 0.45rem; border-radius: 999px; font-weight: 600;
  text-transform: none; letter-spacing: 0; min-width: 1.5rem; text-align: center;
}
.ph-count.ph-count-empty { opacity: 0.4; }
.ph-panel-body { padding: 0.15rem 0.4rem 0.6rem; }
.ph-panel-empty { padding: 0.5rem 0.6rem; font-size: 0.72rem; color: var(--muted, #62666d); font-style: italic; }
.ph-panel-list { list-style: none; margin: 0; padding: 0; }
.ph-panel-item {
  display: block; padding: 0.4rem 0.55rem; font-size: 0.76rem;
  color: var(--text, #08090a); text-decoration: none; border-radius: 4px;
  border-left: 2px solid transparent; transition: background 0.12s, border-color 0.12s;
}
.ph-panel-item:hover { background: var(--bg, #f7f8f8); border-left-color: var(--accent, #5e6ad2); text-decoration: none; }
.ph-panel-item:focus-visible { outline: 2px solid var(--accent, #5e6ad2); outline-offset: -2px; }
.ph-panel-item.ph-done .ph-item-label { text-decoration: line-through; opacity: 0.55; }
.ph-item-label {
  display: block; font-weight: 510;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ph-item-meta {
  display: block; font-size: 0.65rem; color: var(--muted, #62666d);
  margin-top: 0.15rem;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ph-flash { animation: ph-flash-anim 1.2s ease-out; border-radius: 4px; }
@keyframes ph-flash-anim {
  0%   { background: rgba(94,106,210,0.28); box-shadow: 0 0 0 4px rgba(94,106,210,0.28); }
  100% { background: transparent; box-shadow: 0 0 0 0 transparent; }
}
@media (max-width: 899px) {
  .ph-side-panel { display: none; }
}
</style>
<script>/* ph-sidebar-panels */
(function(){
  if (window.__PH_SIDEBAR_PANELS_LOADED) return;
  window.__PH_SIDEBAR_PANELS_LOADED = true;

  function boot(){
    var meta = window.__PLAN_HARNESS_META__ || {};
    var sideNav = document.querySelector('.side-nav');
    if (!sideNav) return;

    var prefKey = 'ph-panels:' + (meta.scenario || '_') + ':' + (meta.doc || '_');
    var main = document.querySelector('main, .main, .content, article') ||
               (function(){
                 var candidates = Array.prototype.slice.call(document.body.children);
                 return candidates.filter(function(el){
                   return !el.matches('nav, header, aside, .side-nav, .theme-toggle, .ph-injected-breadcrumb, script, style');
                 }).sort(function(a,b){ return (b.textContent||'').length - (a.textContent||'').length; })[0];
               })() || document.body;

    function makePanel(id, title){
      var saved = localStorage.getItem(prefKey + ':' + id);
      var det = document.createElement('details');
      det.className = 'ph-side-panel';
      det.setAttribute('data-panel', id);
      // Hidden until proven to have content. Avoids a flash of empty chrome
      // before the scanner / fetch populate the panel.
      det.style.display = 'none';
      if (saved === '1') det.open = true;
      det.innerHTML = '<summary><span class="ph-panel-title">' + title + '</span><span class="ph-count ph-count-empty">0</span></summary><div class="ph-panel-body" aria-live="polite"></div>';
      det.addEventListener('toggle', function(){
        localStorage.setItem(prefKey + ':' + id, det.open ? '1' : '0');
      });
      return det;
    }

    function findAnchorHeading(el){
      var cur = el;
      while (cur && cur !== document.body) {
        if (cur.hasAttribute && cur.hasAttribute('data-section-id')) return cur;
        var prev = cur.previousElementSibling;
        while (prev) {
          if (prev.hasAttribute && prev.hasAttribute('data-section-id')) return prev;
          var deep = prev.querySelector && prev.querySelector('[data-section-id]');
          if (deep) return deep;
          prev = prev.previousElementSibling;
        }
        cur = cur.parentElement;
      }
      return null;
    }

    function scrollTo(target){
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('ph-flash');
      setTimeout(function(){ target.classList.remove('ph-flash'); }, 1200);
    }

    function truncate(s, n){
      s = String(s || '').replace(/\\s+/g, ' ').trim();
      return s.length > n ? s.slice(0, n - 1) + '…' : s;
    }

    function setCount(panel, n){
      var c = panel.querySelector('.ph-count');
      c.textContent = String(n);
      c.classList.toggle('ph-count-empty', n === 0);
    }

    // Show panel (summary + body) only when there's at least one item.
    // Empty panels hide entirely — no button, no row — so docs without
    // TODOs or comments don't carry dead chrome at the bottom of the nav.
    function setVisibility(panel, hasItems){
      panel.style.display = hasItems ? '' : 'none';
    }

    // ---- Comments panel (simple list) ----
    function renderCommentList(panel, items){
      var body = panel.querySelector('.ph-panel-body');
      body.innerHTML = '';
      if (!items.length) { setVisibility(panel, false); return; }
      setVisibility(panel, true);
      var ul = document.createElement('ul');
      ul.className = 'ph-panel-list';
      items.forEach(function(it){
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#';
        a.className = 'ph-panel-item' + (it.done ? ' ph-done' : '');
        var lbl = document.createElement('span');
        lbl.className = 'ph-item-label';
        lbl.textContent = it.label;
        var meta = document.createElement('span');
        meta.className = 'ph-item-meta';
        meta.textContent = it.meta || '';
        a.appendChild(lbl);
        if (it.meta) a.appendChild(meta);
        a.addEventListener('click', function(e){
          e.preventDefault();
          scrollTo(it.target);
        });
        li.appendChild(a);
        ul.appendChild(li);
      });
      body.appendChild(ul);
    }

    // ---- TODOs ----
    // Build a stable {sectionId, exact} anchor from a TODO target element.
    // sectionId = nearest [data-section-id] (heading); exact = trimmed, 200-char
    // slice of the element's textContent. Same pair that a 'todoResolves'
    // comment carries, so we can cross-reference on load.
    function todoAnchor(target){
      if (!target) return { sectionId: null, exact: '' };
      var heading = findAnchorHeading(target);
      var exact = (target.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200);
      return {
        sectionId: heading ? heading.getAttribute('data-section-id') : null,
        exact: exact
      };
    }

    function scanTodos(){
      var found = [];
      var seenTargets = new WeakSet();
      var add = function(item){
        if (!item.target) return;
        if (seenTargets.has(item.target)) return;
        seenTargets.add(item.target);
        item.anchor = todoAnchor(item.target);
        found.push(item);
      };

      var todoRe = /\\b(TODO|FIXME)\\s*[:：]\\s*(.{2,200})/;
      var walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, null);
      var node;
      while ((node = walker.nextNode())) {
        var text = node.textContent || '';
        if (!/\\b(TODO|FIXME)\\b/.test(text)) continue;
        var m = todoRe.exec(text);
        if (!m) continue;
        var host = node.parentElement;
        if (!host || host.closest('.ph-side-panel, .ph-injected-breadcrumb, script, style')) continue;
        var heading = findAnchorHeading(host);
        add({
          label: m[1] + ': ' + truncate(m[2], 80),
          meta: heading ? truncate(heading.textContent || '', 48) : '',
          target: host
        });
      }

      Array.prototype.forEach.call(main.querySelectorAll('li'), function(li){
        if (li.closest('.ph-side-panel')) return;

        // Accept either raw [x]/[ ] text (pattern 2, pre-normalization) OR
        // the data-done="0|1" attribute emitted by normalizeChecklistItems
        // server-side. Either way, the panel shows one entry per checklist row.
        var direct = '';
        Array.prototype.forEach.call(li.childNodes, function(n){
          if (n.nodeType === 3) direct += n.textContent;
        });
        direct = direct.trim();
        var done = null;
        var labelText = '';
        var cm = /^\\[([ xX])\\]\\s*(.+)/.exec(direct);
        if (cm) {
          done = cm[1] !== ' ';
          labelText = cm[2];
        } else if (li.hasAttribute('data-done')) {
          done = li.getAttribute('data-done') === '1';
          labelText = (li.textContent || '').trim();
        } else {
          return;
        }
        var heading = findAnchorHeading(li);
        add({
          label: (done ? '☑ ' : '☐ ') + truncate(labelText, 80),
          meta: heading ? truncate(heading.textContent || '', 48) : '',
          target: li,
          done: done
        });
      });

      Array.prototype.forEach.call(main.querySelectorAll('.todo'), function(el){
        if (el.closest('.ph-side-panel')) return;
        var heading = findAnchorHeading(el);
        add({
          label: truncate(el.textContent || '', 80),
          meta: heading ? truncate(heading.textContent || '', 48) : '',
          target: el
        });
      });

      return found;
    }

    // ---- Comment index keyed by TODO anchor ----
    // Returns { byKey: Map<sid::exact, {resolved: Comment|null, thread: Comment[], revising: Comment|null}> }
    function indexCommentsByTodoAnchor(comments){
      var byKey = new Map();
      function flat(list){
        var out = [];
        function walk(arr){
          arr.forEach(function(c){
            out.push(c);
            if (c.replies) walk(c.replies);
          });
        }
        walk(list);
        return out;
      }
      flat(comments).forEach(function(c){
        if (!c.anchor || !c.anchor.sectionId || !c.anchor.exact) return;
        var key = c.anchor.sectionId + '::' + c.anchor.exact;
        var bucket = byKey.get(key);
        if (!bucket) { bucket = { resolved: null, thread: [], revising: null }; byKey.set(key, bucket); }
        bucket.thread.push(c);
        if (c.todoResolves) bucket.resolved = c;
        if (c.intent === 'revise' && c.reviseStatus && c.reviseStatus !== 'rejected' && !c.deleted) {
          bucket.revising = c;
        }
      });
      return byKey;
    }

    // ---- Composer helpers ----
    var SVG_ICONS = {
      reply: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
      resolve: '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
      revise: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>'
    };

    var ACTION_PROFILES = {
      reply:   { icon: SVG_ICONS.reply,   title: 'Reply',            placeholder: 'Reply…',                        submit: 'Post',         hostOnly: false, send: function(body){ return { body: body, intent: 'comment' }; } },
      resolve: { icon: SVG_ICONS.resolve, title: 'Resolve TODO',     placeholder: 'Note (optional)',               submit: 'Resolve',      hostOnly: true,  send: function(body){ return { body: body && body.trim() ? body : 'Resolved.', todoResolves: true }; } },
      revise:  { icon: SVG_ICONS.revise,  title: 'Ask agent to update', placeholder: 'What should the agent change?', submit: 'Request update', hostOnly: true,  send: function(body){ return { body: body, intent: 'revise' }; } }
    };

    function postComment(anchor, payload){
      var url = '/api/comments/' + encodeURIComponent(meta.scenario) + '/' + encodeURIComponent(meta.doc);
      var body = Object.assign({ anchor: { sectionId: anchor.sectionId, exact: anchor.exact, prefix: '', suffix: '' } }, payload);
      return fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function(r){
        if (!r.ok) return r.text().then(function(t){ throw new Error((r.status + ' ' + (t || r.statusText)).slice(0, 200)); });
        return r.json();
      });
    }

    function mountComposer(row, action, todo, onSuccess){
      var existing = row.querySelector('.ph-composer');
      if (existing) { existing.remove(); return; }
      // Close any other open composer in the same panel.
      Array.prototype.forEach.call(row.parentElement.querySelectorAll('.ph-composer'), function(c){ c.remove(); });

      var profile = ACTION_PROFILES[action];
      var composer = document.createElement('div');
      composer.className = 'ph-composer';
      composer.setAttribute('data-open', '1');
      composer.innerHTML =
        '<div class="ph-composer-meta">' + profile.title + '</div>' +
        '<textarea placeholder="' + profile.placeholder + '" rows="2"></textarea>' +
        '<div class="ph-composer-row">' +
          '<span class="ph-composer-error" aria-live="polite"></span>' +
          '<span style="display:flex;gap:0.3rem;">' +
            '<button type="button" class="ph-composer-cancel">Cancel</button>' +
            '<button type="button" class="ph-composer-submit">' + profile.submit + '</button>' +
          '</span>' +
        '</div>';
      row.appendChild(composer);

      var ta = composer.querySelector('textarea');
      var submit = composer.querySelector('.ph-composer-submit');
      var cancel = composer.querySelector('.ph-composer-cancel');
      var errBox = composer.querySelector('.ph-composer-error');
      setTimeout(function(){ ta.focus(); }, 0);

      function close(){ composer.remove(); }

      function doSubmit(){
        errBox.textContent = '';
        var val = ta.value;
        if (action !== 'resolve' && (!val || !val.trim())) {
          errBox.textContent = 'Required.';
          return;
        }
        submit.disabled = true;
        postComment(todo.anchor, profile.send(val))
          .then(function(comment){ onSuccess(comment); close(); })
          .catch(function(err){ errBox.textContent = String(err.message || err); submit.disabled = false; });
      }

      submit.addEventListener('click', doSubmit);
      cancel.addEventListener('click', close);
      ta.addEventListener('keydown', function(e){
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doSubmit(); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
      });
    }

    // ---- TODO list renderer (with actions + resolved subsection) ----
    var todoCommentIndex = new Map();

    function renderTodoRow(todo){
      var key = (todo.anchor.sectionId || '') + '::' + todo.anchor.exact;
      var bucket = todoCommentIndex.get(key);
      var resolvedBy = bucket && bucket.resolved;
      var threadLen = bucket ? bucket.thread.length : 0;
      var revising = bucket && bucket.revising;
      // todo.done may already be true from the doc itself (a "[x]" marker or
      // data-done="1" attribute). Honor that plus any comment resolve.
      todo.done = todo.done || !!resolvedBy;

      var li = document.createElement('li');
      li.className = 'ph-todo-row' + (todo.done ? ' ph-done' : '');
      li.setAttribute('data-todo-key', key);

      var main = document.createElement('div');
      main.className = 'ph-todo-main';
      main.tabIndex = 0;
      main.setAttribute('role', 'button');
      main.setAttribute('aria-label', 'Scroll to TODO: ' + todo.label);
      var text = document.createElement('div');
      text.className = 'ph-todo-text';
      var lbl = document.createElement('span');
      lbl.className = 'ph-item-label';
      lbl.textContent = todo.label;
      text.appendChild(lbl);
      if (todo.meta) {
        var metaSpan = document.createElement('span');
        metaSpan.className = 'ph-item-meta';
        metaSpan.textContent = todo.meta;
        text.appendChild(metaSpan);
      }
      main.appendChild(text);
      if (revising) {
        var chip = document.createElement('span');
        chip.className = 'ph-todo-chip ph-todo-chip-revise';
        chip.textContent = revising.reviseStatus;
        main.appendChild(chip);
      } else if (threadLen > 0 && !todo.done) {
        var tc = document.createElement('span');
        tc.className = 'ph-todo-chip ph-todo-chip-thread';
        tc.textContent = threadLen + '💬';
        main.appendChild(tc);
      }
      main.addEventListener('click', function(){ scrollTo(todo.target); });
      main.addEventListener('keydown', function(e){
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scrollTo(todo.target); }
      });
      li.appendChild(main);

      // Action bar — reveals on hover/focus.
      var role = meta.role || 'reviewer';
      var actions = document.createElement('div');
      actions.className = 'ph-todo-actions';
      var toShow = ['reply'];
      if (role === 'host' && !todo.done) toShow.push('resolve');
      if (role === 'host') toShow.push('revise');
      toShow.forEach(function(key){
        var prof = ACTION_PROFILES[key];
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ph-todo-action';
        btn.setAttribute('data-action', key);
        btn.setAttribute('title', prof.title);
        btn.setAttribute('aria-label', prof.title);
        btn.innerHTML = prof.icon;
        btn.addEventListener('click', function(ev){
          ev.stopPropagation();
          if (!todo.anchor.sectionId) {
            alert('No section anchor for this TODO — cannot attach comment.');
            return;
          }
          mountComposer(li, key, todo, function(comment){
            // Update local index so the UI reflects the change without a refetch.
            var b = todoCommentIndex.get(key);
            if (!b) { b = { resolved: null, thread: [], revising: null }; todoCommentIndex.set(key, b); }
            b.thread.push(comment);
            if (comment.todoResolves) b.resolved = comment;
            if (comment.intent === 'revise') b.revising = comment;
            // Re-render the whole TODO panel so resolved items move to the
            // subsection and chips reflect the new state.
            renderTodoPanel();
          });
        });
        actions.appendChild(btn);
      });
      li.appendChild(actions);

      return li;
    }

    var allTodos = [];
    function renderTodoPanel(){
      var panel = todoPanel;
      var body = panel.querySelector('.ph-panel-body');
      body.innerHTML = '';

      var open = [];
      var resolved = [];
      allTodos.forEach(function(t){
        var key = (t.anchor.sectionId || '') + '::' + t.anchor.exact;
        var bucket = todoCommentIndex.get(key);
        if ((bucket && bucket.resolved) || t.done) resolved.push(t);
        else open.push(t);
      });

      setCount(panel, open.length);
      if (open.length + resolved.length === 0) { setVisibility(panel, false); return; }
      setVisibility(panel, true);

      if (open.length) {
        var ul = document.createElement('ul');
        ul.className = 'ph-panel-list';
        open.forEach(function(t){ ul.appendChild(renderTodoRow(t)); });
        body.appendChild(ul);
      }

      if (resolved.length) {
        var sub = document.createElement('details');
        sub.className = 'ph-subsection';
        sub.innerHTML = '<summary>Resolved (' + resolved.length + ')</summary>';
        var subBody = document.createElement('div');
        var ul2 = document.createElement('ul');
        ul2.className = 'ph-panel-list';
        resolved.forEach(function(t){ ul2.appendChild(renderTodoRow(t)); });
        subBody.appendChild(ul2);
        sub.appendChild(subBody);
        body.appendChild(sub);
      }
    }

    // ---- Build panels ----
    var todoPanel = makePanel('todos', 'TODOs');
    var commentPanel = makePanel('comments', 'Comments');
    sideNav.appendChild(todoPanel);
    sideNav.appendChild(commentPanel);

    allTodos = scanTodos();

    // Empty early-exit before hitting the API.
    if (allTodos.length === 0 && (!meta.scenario || !meta.doc)) return;
    if (!meta.scenario || !meta.doc) {
      renderTodoPanel();
      return;
    }

    fetch('/api/comments/' + encodeURIComponent(meta.scenario) + '/' + encodeURIComponent(meta.doc), { credentials: 'same-origin' })
      .then(function(r){ if (!r.ok) throw 0; return r.json(); })
      .then(function(data){
        var comments = (data && data.comments) || [];
        todoCommentIndex = indexCommentsByTodoAnchor(comments);
        renderTodoPanel();

        // Comments panel shows ALL comments; TODO-scoped ones still appear,
        // which is useful when the reader wants a flat chronological view.
        setCount(commentPanel, comments.length);
        var items = comments.map(function(c){
          var anchor = c.anchor || {};
          var target = anchor.sectionId ? document.querySelector('[data-section-id="' + CSS.escape(anchor.sectionId) + '"]') : null;
          return {
            label: truncate(c.body || '(empty)', 70),
            meta: (c.author || '?') + ' · ' + truncate(anchor.exact || '', 40),
            target: target,
            done: !!c.resolved || !!c.todoResolves
          };
        });
        renderCommentList(commentPanel, items);
      })
      .catch(function(){
        // API unreachable — render TODOs without resolve overlay; hide comments.
        renderTodoPanel();
        setVisibility(commentPanel, false);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
</script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, block + '</body>');
  }
  return html + block;
}

/**
 * Normalize mixed checklist markers in <li> items.
 *
 * The TODO format contract (writer-prompt.md / design §6.3) defines three
 * recognized patterns. Writers occasionally emit pattern 2 (`[x]` / `[ ]`
 * in text) AND pattern 3 (`<input type="checkbox">`) in the SAME <li>, which
 * renders as two side-by-side markers that can disagree on done-state.
 *
 * This pass finds <li> items that contain both an `<input type="checkbox">`
 * near the start AND a leading `[x]` / `[ ]` text marker, syncs the input's
 * `checked` attribute from the text marker (source of truth for the writer's
 * intent), and strips the redundant text marker.
 *
 * Idempotent: re-running on output yields the same output.
 */
export function normalizeChecklistItems(html) {
  if (!html || typeof html !== 'string') return html;
  let changed = false;

  // Case A: <li>[ws]<input type="checkbox">[ws][x|X| ] ...
  //   Sync `checked` from the text marker, then drop the redundant text.
  let out = html.replace(
    /<li\b([^>]*)>(\s*)(<input\b[^>]*type\s*=\s*["']checkbox["'][^>]*>)(\s*)\[([ xX])\]\s*/gi,
    function (_m, liAttrs, ws1, inputTag, ws2, state) {
      changed = true;
      const done = state !== ' ';
      const hasChecked = /\bchecked\b/i.test(inputTag);
      let fixedInput = inputTag;
      if (done && !hasChecked) {
        fixedInput = inputTag.replace(/\/?>$/, (end) => ' checked' + end);
      } else if (!done && hasChecked) {
        fixedInput = inputTag.replace(/\s+checked(?:=["'][^"']*["'])?/i, '');
      }
      return '<li' + liAttrs + '>' + ws1 + fixedInput + ws2;
    }
  );

  // Case B: <li>[ws][x|X| ] ...   (no <input> present)
  //   Many docs render an ☐ pseudo-element via `.checklist li::before` and
  //   then put `[x]` / `[ ]` in the text. Result: a fake empty box next to a
  //   text marker that disagrees with it. Move the state onto a
  //   `data-done="0|1"` attribute and drop the text so only one marker stays;
  //   a companion <style> block (injected below) flips the pseudo-element to
  //   ☑ green when `data-done="1"`.
  out = out.replace(
    /<li\b([^>]*)>(\s*)\[([ xX])\]\s+/gi,
    function (_m, liAttrs, ws, state) {
      changed = true;
      const done = state !== ' ';
      // Idempotent: skip if already tagged
      if (/\bdata-done\s*=/i.test(liAttrs)) return '<li' + liAttrs + '>' + ws;
      return '<li' + liAttrs + ' data-done="' + (done ? '1' : '0') + '">' + ws;
    }
  );

  if (!changed) return out;

  // Inject a CSS block that retargets the common `.checklist li::before`
  // patterns to render ☑ (\2611) green when the li is data-done="1", and
  // adds a subtle opacity fade. Works for docs that use the generator's
  // default checklist CSS; docs with a bespoke stylesheet may need their
  // own tweak (rare — this is the scaffold most writers reach for).
  const style =
    '<style>/* ph-checklist-normalize */\n' +
    'li[data-done="1"]::before { content: "\\2611" !important; color: var(--green, #1a7f37) !important; }\n' +
    'li[data-done="1"] { color: var(--muted, #62666d); }\n' +
    'li[data-done="1"]:not(:has(*)) { text-decoration: line-through; }\n' +
    '</style>';
  if (/<\/head>/i.test(out)) return out.replace(/<\/head>/i, style + '</head>');
  return style + out;
}

/**
 * Un-disable plan-tab links whose target file actually exists in the same
 * scenario directory. Writer agents bake `aria-disabled="true"` + a
 * `<span class="soon">soon</span>` into tabs for docs that hadn't been
 * generated yet at write time. After a sibling doc lands, those markers
 * become stale and desynced with the dashboard's status.
 *
 * This pass scans the doc's <nav class="plan-tabs"> block, and for every
 * anchor whose href is in `existingSiblings`:
 *   - strips `aria-disabled="true"`
 *   - removes any inner `<span class="soon">...</span>`
 * Links whose target is genuinely missing are left alone.
 *
 * @param {string} html
 * @param {Set<string>} existingSiblings - set of sibling file basenames
 *   (e.g. 'test-cases.html') that exist on disk in the scenario dir.
 */
export function normalizePlanTabs(html, existingSiblings) {
  if (!html || typeof html !== 'string' || !existingSiblings || existingSiblings.size === 0) return html;
  return html.replace(
    /<nav\b[^>]*class=["'][^"']*\bplan-tabs\b[^"']*["'][^>]*>([\s\S]*?)<\/nav>/gi,
    function (match, inner) {
      const newInner = inner.replace(
        /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
        function (aMatch, attrs, body) {
          const hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
          if (!hrefMatch) return aMatch;
          const href = hrefMatch[1];
          const basename = href.split(/[\\/]/).pop().split(/[#?]/)[0];
          if (!existingSiblings.has(basename)) return aMatch;
          let newAttrs = attrs.replace(/\s+aria-disabled\s*=\s*["'][^"']*["']/gi, '');
          const newBody = body.replace(/<span\b[^>]*class=["'][^"']*\bsoon\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '').trim();
          return '<a' + newAttrs + '>' + newBody + '</a>';
        }
      );
      return match.replace(inner, newInner);
    }
  );
}

/**
 * Inject a synchronous <script> into <head> exposing window.__PLAN_HARNESS_META__
 * so the future comment widget reads scenario/doc/role without a round-trip.
 * Falls back to <body>-prepend if <head> is missing.
 */
export function injectPlanMeta(html, meta) {
  if (!html || typeof html !== 'string' || !meta) return html;
  const json = JSON.stringify(meta).replace(/</g, '\\u003c');
  const tag = `<script>window.__PLAN_HARNESS_META__=${json};</script>`;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, tag + '</head>');
  }
  if (/<body\b[^>]*>/i.test(html)) {
    return html.replace(/<body\b([^>]*)>/i, (_m, a) => `<body${a}>${tag}`);
  }
  return tag + html;
}
