// plan-harness/local-proxy/src/templates/base.js
// HTML template system for plan documents.
// All output is self-contained HTML strings (inline CSS + JS, no external deps).

/**
 * Shared CSS variables, fonts, base styles (dark/light theme).
 * Matches the visual patterns from existing plan files.
 */
export function getBaseCSS() {
  return `
  :root, [data-theme="dark"] {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff;
    --green: #3fb950; --red: #f85149; --yellow: #d29922; --purple: #bc8cff;
    --code-bg: #1c2128;
    --svg-bg: #161b22; --svg-bg2: #0d1117; --svg-text: #e6edf3;
    --svg-muted: #8b949e; --svg-border: #30363d;
    --even-row-bg: rgba(22,27,34,0.5);
    --badge-green-bg: rgba(63,185,80,0.2); --badge-yellow-bg: rgba(210,153,34,0.2);
    --badge-red-bg: rgba(248,81,73,0.2); --badge-blue-bg: rgba(88,166,255,0.2);
    --badge-purple-bg: rgba(188,140,255,0.2);
    --shadow: 0 1px 3px rgba(0,0,0,0.3);
    --shadow-lg: 0 4px 12px rgba(0,0,0,0.4);
    --radius: 8px;
    --radius-sm: 4px;
  }
  [data-theme="light"] {
    --bg: #ffffff; --surface: #f6f8fa; --border: #d0d7de;
    --text: #1f2328; --muted: #656d76; --accent: #0969da;
    --green: #1a7f37; --red: #cf222e; --yellow: #9a6700; --purple: #8250df;
    --code-bg: #f0f3f6;
    --svg-bg: #f6f8fa; --svg-bg2: #ffffff; --svg-text: #1f2328;
    --svg-muted: #656d76; --svg-border: #d0d7de;
    --even-row-bg: rgba(246,248,250,0.8);
    --badge-green-bg: rgba(26,127,55,0.1); --badge-yellow-bg: rgba(154,103,0,0.1);
    --badge-red-bg: rgba(207,34,46,0.1); --badge-blue-bg: rgba(9,105,218,0.1);
    --badge-purple-bg: rgba(130,80,223,0.1);
    --shadow: 0 1px 3px rgba(0,0,0,0.08);
    --shadow-lg: 0 4px 12px rgba(0,0,0,0.1);
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); line-height: 1.7; transition: background-color 0.2s, color 0.2s; }
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

  /* Theme toggle */
  .theme-toggle { position: fixed; top: 1rem; right: 1.5rem; z-index: 999; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 0.4rem 0.8rem; cursor: pointer; font-size: 1.1rem; color: var(--text); transition: background 0.2s, border-color 0.2s; display: flex; align-items: center; gap: 0.4rem; }
  .theme-toggle:hover { border-color: var(--accent); }
  .theme-toggle .label { font-size: 0.75rem; color: var(--muted); }

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
 * Theme toggle button HTML + JS.
 * @returns {string} HTML string with the toggle button and inline script.
 */
export function getThemeToggleHTML() {
  return `
<button class="theme-toggle" id="themeToggle" title="Toggle theme"><span id="themeIcon">&#9789;</span> <span class="label" id="themeLabel">Dark</span></button>
`;
}

/**
 * Inline JS for theme toggle, sidebar nav, and scroll tracking.
 * @param {string} storageKey - localStorage key for theme preference.
 * @returns {string} Script tag with interactivity code.
 */
function getBaseScript(storageKey = 'plan-harness-theme') {
  return `
<script>
(function() {
  // Theme toggle
  var toggle = document.getElementById('themeToggle');
  var icon = document.getElementById('themeIcon');
  var label = document.getElementById('themeLabel');
  var html = document.documentElement;

  function setTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem('${storageKey}', theme);
    if (theme === 'light') {
      icon.innerHTML = '&#9788;';
      label.textContent = 'Light';
    } else {
      icon.innerHTML = '&#9790;';
      label.textContent = 'Dark';
    }
  }

  var saved = localStorage.getItem('${storageKey}') || 'dark';
  setTheme(saved);

  if (toggle) {
    toggle.addEventListener('click', function() {
      var current = html.getAttribute('data-theme') || 'dark';
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

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
    storageKey = 'plan-harness-theme',
    planLinks = []
  } = options;

  const sidebarHTML = sections.length > 0 ? getSidebarHTML(title, sections) : '';
  const themeToggle = getThemeToggleHTML();

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

  // If no sidebar, remove padding-left from body
  const extraCSS = sections.length === 0 ? `
  body { padding-left: 0 !important; }
  .container { max-width: 1200px; }
` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHTML(title)}</title>
<style>
${getBaseCSS()}
${extraCSS}
</style>
</head>
<body>

${sidebarHTML}
${themeToggle}
${planNav}

<div class="container">
<h1>${escapeHTML(title)}</h1>
${subtitleHTML}
${metaHTML}

${content}

</div>

${getBaseScript(storageKey)}
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
  const avgCompletion = totalScenarios > 0
    ? Math.round(scenarios.reduce((s, sc) => s + (sc.completion || 0), 0) / totalScenarios)
    : 0;

  const planTypes = ['design', 'test-plan', 'state-machines', 'test-cases', 'impl-plan'];

  let summaryCards = `
<div class="summary-grid">
  <div class="summary-card"><div class="summary-value">${totalScenarios}</div><div class="summary-label">Scenarios</div></div>
  <div class="summary-card"><div class="summary-value" style="color:var(--green)">${existingFiles}</div><div class="summary-label">Plan Files</div></div>
  <div class="summary-card"><div class="summary-value" style="color:var(--yellow)">${totalFiles - existingFiles}</div><div class="summary-label">Missing</div></div>
  <div class="summary-card"><div class="summary-value" style="color:var(--accent)">${avgCompletion}%</div><div class="summary-label">Avg. Completion</div></div>
</div>
`;

  let scenarioCards = scenarios.map((sc, idx) => {
    const pct = sc.completion || 0;
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

    const statusDot = pct >= 100
      ? '<span style="color:var(--green);font-size:1.2rem;" title="Complete">&#10003;</span>'
      : pct > 0
        ? '<span style="color:var(--yellow);font-size:1.2rem;" title="In Progress">&#9679;</span>'
        : '<span style="color:var(--muted);font-size:1.2rem;" title="Not Started">&#9675;</span>';

    return `
<div class="scenario-card" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1.2rem;cursor:pointer;transition:box-shadow 0.15s,border-color 0.15s;" onclick="window.location.href='/scenario/${encodeURIComponent(sc.name)}'" onmouseover="this.style.boxShadow='var(--shadow-lg)';this.style.borderColor='var(--accent)'" onmouseout="this.style.boxShadow='';this.style.borderColor='var(--border)'">
  <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.6rem;">
    ${statusDot}
    <span style="font-size:1.05rem;font-weight:700;">${escapeHTML(sc.name)}</span>
  </div>
  ${sc.description ? `<p style="font-size:0.85rem;color:var(--muted);margin-bottom:0.6rem;">${escapeHTML(sc.description)}</p>` : ''}
  ${workItemLink ? `<div style="margin-bottom:0.6rem;">${workItemLink}</div>` : ''}
  <div style="margin-bottom:0.6rem;">${filePills}</div>
  <div style="display:flex;align-items:center;gap:0.6rem;font-size:0.85rem;">
    <span style="color:var(--muted);">${existCount}/${fileCount} files</span>
    <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
      <div style="height:100%;width:${pct}%;background:var(--green);border-radius:3px;transition:width 0.3s;"></div>
    </div>
    <span style="font-weight:600;color:var(--accent);">${pct}%</span>
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
  const planTypeLabels = {
    'design': 'Design Document',
    'test-plan': 'E2E Test Plan',
    'state-machines': 'State Machines',
    'test-cases': 'Test Cases',
    'impl-plan': 'Implementation Plan'
  };

  const files = scenario.files || [];

  let tabsHTML = files.map((f, i) => {
    const label = planTypeLabels[f.type] || f.type;
    const statusIcon = f.exists
      ? (f.completion >= 100
        ? '<span style="color:var(--green);">&#10003;</span>'
        : '<span style="color:var(--yellow);">&#9679;</span>')
      : '<span style="color:var(--muted);">&#9675;</span>';
    const activeClass = i === 0 ? ' active' : '';
    return `<a href="/view?path=${encodeURIComponent(f.path)}" class="badge badge-blue${f.exists ? '' : '" style="opacity:0.5;pointer-events:none;'}" style="font-size:0.85rem;margin:0.2rem;">${statusIcon} ${escapeHTML(label)}</a>`;
  }).join('\n    ');

  let fileDetails = files.map(f => {
    const label = planTypeLabels[f.type] || f.type;
    const statusBadge = f.exists
      ? `<span class="badge badge-green">Exists</span>`
      : `<span class="badge badge-red">Missing</span>`;
    const pct = f.completion || 0;
    return `
<div class="node-card">
  <h4>${escapeHTML(label)} ${statusBadge}</h4>
  ${f.exists ? `
  <div style="display:flex;align-items:center;gap:0.6rem;margin:0.5rem 0;">
    <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden;">
      <div style="height:100%;width:${pct}%;background:var(--green);border-radius:3px;"></div>
    </div>
    <span style="font-size:0.85rem;color:var(--muted);">${pct}%</span>
  </div>
  <p style="font-size:0.85rem;"><a href="/view?path=${encodeURIComponent(f.path)}">View document</a></p>
  ` : '<p style="font-size:0.85rem;color:var(--muted);">This plan file has not been generated yet.</p>'}
  <p style="font-size:0.8rem;color:var(--muted);font-family:monospace;">${escapeHTML(f.path)}</p>
</div>
`;
  }).join('\n');

  const content = `
<div style="margin-bottom:1.5rem;">
  <div style="display:flex;flex-wrap:wrap;gap:0.5rem;align-items:center;">
    ${tabsHTML}
  </div>
</div>

${scenario.description ? `<p style="margin-bottom:1rem;">${escapeHTML(scenario.description)}</p>` : ''}
${scenario.workItem ? `<p style="margin-bottom:1rem;"><a href="${escapeAttr(scenario.workItem)}">Work Item: ${escapeHTML(scenario.workItem)}</a></p>` : ''}

<h2 id="files">Plan Files</h2>
${fileDetails}
`;

  return wrapPage(content, {
    title: scenario.name,
    subtitle: 'Scenario Detail',
    meta: `<a href="/">Back to Dashboard</a>`,
    sections: [],
    storageKey: 'plan-detail-theme',
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
