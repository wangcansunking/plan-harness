// html-lint.js — structural validator for v2 plan-harness HTML docs.
//
// Enforces _html-base.md mixin contract:
//   - File skeleton (header, nav, section, meta script)
//   - Locked GitHub Dark palette in inline style
//   - Sidebar two-group shape (📑 Documents + Sections, separator)
//   - Root-absolute links only
//   - Embedded meta.json well-formed
//   - Layout rules: no max-width on section, padding via clamp, crumb not muted
//
// Returns { errors, warnings, info } where each entry is
// { rule, severity, message, line? }. errors=structural, warnings=non-blocking.
//
// Used by:
//   - lint-cli.js  (batch, exit code)
//   - web-server.js (serve-time inline diagnostics, never 500s)
//   - plan-gen Phase C (write-time guard, ask writer to retry)
//   - .githooks/pre-commit (bulk before commit)

import { parse } from 'node-html-parser';
import crypto from 'node:crypto';
import { canonicalJson } from './manifest.js';

const SCENARIO_DOCS = [
  'product', 'analysis', 'design', 'state-machine',
  'test-spec', 'implementation', 'test-report'
];

const LOCKED_PALETTE_VARS = [
  '--bg', '--panel', '--panel2', '--border',
  '--fg', '--muted', '--accent'
];

const PALETTE_LOCKED_VALUES = {
  '--bg': '#0d1117',
  '--panel': '#161b22',
  '--panel2': '#1c2128',
  '--border': '#30363d',
  '--fg': '#c9d1d9',
  '--accent': '#58a6ff',
};

const SHARED_LINK_LABELS = ['Context', 'Glossary', 'ADR'];
const DIAGRAM_REQUIRED_DOCS = new Set(['design', 'state-machine']);

function nodeText(node) {
  return String(node?.text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

function collectHeadings(root) {
  // Only h2 counts as a "top-level section" that warrants a nav entry. h3s are
  // sub-headings (cards, per-PR details, "Evidence" blocks) — including them
  // would force writers to either flatten to h2 or hand-author dozens of nav
  // links per doc. Section nav is for the doc's primary outline; h3 sub-points
  // are reached by scrolling within the parent h2 section.
  const seen = new Map();
  const scope = root.querySelector('main > section') || root.querySelector('main') || root;
  return scope.querySelectorAll('h2').map((heading) => {
    const label = nodeText(heading);
    const explicitId = heading.getAttribute('id');
    const base = slugify(label);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return {
      id: explicitId || (count === 1 ? base : `${base}-${count}`),
      label,
    };
  }).filter(h => h.label);
}

function hasSvgOrMermaid(root) {
  return root.querySelectorAll('svg').length > 0 || root.querySelectorAll('pre.mermaid, .mermaid').length > 0;
}

function docMentionsUx(root, metaJson) {
  if (Array.isArray(metaJson?.uxMockups) && metaJson.uxMockups.length > 0) return true;
  if (Array.isArray(metaJson?.userFlows) && metaJson.userFlows.length > 0) return true;
  const scope = root.querySelector('main > section') || root.querySelector('main') || root;
  const text = nodeText(scope).toLowerCase();
  return /\b(ux|ui|user interface|screen|modal|form|mockup|wireframe|user flow|screen flow|journey)\b/.test(text);
}

function hasVisualNear(root, words) {
  const visualNodes = root.querySelectorAll('svg, pre.mermaid, .mermaid, .diagram-box');
  return visualNodes.some((node) => {
    const text = nodeText(node.parentNode || node).toLowerCase();
    return words.some(word => text.includes(word));
  });
}

/**
 * Lint a single HTML document.
 *
 * @param {string} html - the raw HTML source.
 * @param {object} ctx - optional context.
 *   - docName: basename without extension (e.g. "design"). Used by L1-active.
 *   - metaJson: parsed object — if provided, L3-meta-embed checks hash equality.
 *   - skipRules: array of rule IDs to skip (e.g. shared-asset docs).
 * @returns {{ errors: Array, warnings: Array, info: Array }}
 */
export function lintHtml(html, ctx = {}) {
  const errors = [];
  const warnings = [];
  const info = [];
  const skip = new Set(ctx.skipRules || []);

  const root = parse(html, { lowerCaseTagName: false, comment: false });

  // ---- L1: structure ----------------------------------------------------

  if (!skip.has('L1-skeleton')) {
    const header = root.querySelector('header.top');
    if (!header) {
      errors.push({ rule: 'L1-skeleton', severity: 'error',
        message: '<header class="top"> missing — mixin §File skeleton requires it' });
    } else {
      if (!header.querySelector('h1')) {
        errors.push({ rule: 'L1-skeleton', severity: 'error',
          message: '<header.top> missing <h1> title' });
      }
      if (!header.querySelector('.crumb')) {
        errors.push({ rule: 'L1-skeleton', severity: 'error',
          message: '<header.top> missing <span class="crumb">' });
      }
      if (!header.querySelector('.links')) {
        errors.push({ rule: 'L1-skeleton', severity: 'error',
          message: '<header.top> missing <div class="links"> for shared assets' });
      }
    }
  }

  if (!skip.has('L1-section')) {
    const main = root.querySelector('main');
    if (!main) {
      errors.push({ rule: 'L1-section', severity: 'error',
        message: '<main> missing — mixin requires header + main + nav.toc + section' });
    } else {
      const sections = main.querySelectorAll(':scope > section');
      if (sections.length === 0) {
        errors.push({ rule: 'L1-section', severity: 'error',
          message: '<main> has no direct child <section>' });
      }
    }
  }

  if (!skip.has('L1-nav')) {
    const nav = root.querySelector('nav.toc');
    if (!nav) {
      errors.push({ rule: 'L1-nav', severity: 'error',
        message: '<nav class="toc"> missing' });
    } else {
      const h3s = nav.querySelectorAll('h3');
      if (h3s.length < 2) {
        errors.push({ rule: 'L1-nav', severity: 'error',
          message: `<nav.toc> must have two <h3> headings (Documents + Sections), found ${h3s.length}` });
      }
      const sep = nav.querySelector('.sep');
      if (!sep) {
        errors.push({ rule: 'L1-nav', severity: 'error',
          message: '<nav.toc> missing <div class="sep"> divider between Documents and Sections' });
      }
      const sectionsWrap = nav.querySelector('.sections');
      if (!sectionsWrap) {
        errors.push({ rule: 'L1-nav', severity: 'error',
          message: '<nav.toc> missing <div class="sections"> wrapper for section links — L3-section-nav scans `nav.toc .sections a[href^="#"]`' });
      }
      const docgroupWrap = nav.querySelector('.docgroup');
      if (!docgroupWrap && !skip.has('L1-docgroup')) {
        errors.push({ rule: 'L1-nav', severity: 'error',
          message: '<nav.toc> missing <div class="docgroup"> wrapper for the 7 scenario-doc links' });
      }
    }
  }

  if (!skip.has('L1-docgroup')) {
    const docgroup = root.querySelector('nav.toc .docgroup');
    if (!docgroup) {
      errors.push({ rule: 'L1-docgroup', severity: 'error',
        message: '<nav.toc .docgroup> missing — sidebar must list the 7 scenario docs' });
    } else {
      const links = docgroup.querySelectorAll('a');
      const hrefs = links.map(a => (a.getAttribute('href') || '').toLowerCase());
      const missing = SCENARIO_DOCS.filter(
        d => !hrefs.some(h => h.endsWith(`/${d}.html`))
      );
      if (missing.length) {
        errors.push({ rule: 'L1-docgroup', severity: 'error',
          message: `<nav.toc .docgroup> missing links to: ${missing.join(', ')}` });
      }
    }
  }

  if (!skip.has('L1-active') && ctx.docName) {
    const docgroup = root.querySelector('nav.toc .docgroup');
    if (docgroup) {
      const active = docgroup.querySelectorAll('a.active');
      if (active.length === 0) {
        errors.push({ rule: 'L1-active', severity: 'error',
          message: `<nav.toc .docgroup> has no <a class="active"> — current doc (${ctx.docName}) must be highlighted` });
      } else if (active.length > 1) {
        warnings.push({ rule: 'L1-active', severity: 'warning',
          message: `<nav.toc .docgroup> has ${active.length} active links — should be exactly 1` });
      } else {
        const href = (active[0].getAttribute('href') || '').toLowerCase();
        if (!href.endsWith(`/${ctx.docName}.html`)) {
          warnings.push({ rule: 'L1-active', severity: 'warning',
            message: `Active link href "${href}" does not match docName "${ctx.docName}"` });
        }
      }
    }
  }

  // ---- L2: palette + layout in inline <style> ---------------------------

  const styleTags = root.querySelectorAll('style');
  const styleText = styleTags.map(s => s.text).join('\n');

  if (!skip.has('L2-palette') && styleText) {
    const missing = LOCKED_PALETTE_VARS.filter(v => !styleText.includes(v + ':'));
    if (missing.length) {
      errors.push({ rule: 'L2-palette', severity: 'error',
        message: `<style> missing locked palette variables: ${missing.join(', ')}` });
    }
    for (const [v, expected] of Object.entries(PALETTE_LOCKED_VALUES)) {
      const re = new RegExp(`${v}\\s*:\\s*([#\\w()., ]+?)\\s*;`, 'i');
      const m = styleText.match(re);
      if (m && m[1].trim().toLowerCase() !== expected.toLowerCase()) {
        warnings.push({ rule: 'L2-palette', severity: 'warning',
          message: `${v} = "${m[1].trim()}" but locked value is "${expected}"` });
      }
    }
  }

  if (!skip.has('L2-no-maxwidth-section') && styleText) {
    // Look for any `section` selector rule containing max-width.
    // Naive but practical: find every `section\b ... { ... }` block and check.
    const sectionBlockRe = /(^|\s|,)section\b[^{}]*\{([^}]*)\}/gi;
    let m;
    while ((m = sectionBlockRe.exec(styleText)) !== null) {
      if (/max-width\s*:\s*[^;]+;/i.test(m[2]) && !/max-width\s*:\s*none\b/i.test(m[2])) {
        errors.push({ rule: 'L2-no-maxwidth-section', severity: 'error',
          message: '<section> CSS rule contains "max-width" — mixin §Layout forbids it. Use padding clamp() to center content instead.' });
        break;
      }
    }
  }

  if (!skip.has('L2-padding-clamp') && styleText) {
    const sectionBlockRe = /(^|\s|,)section\b[^{}]*\{([^}]*)\}/gi;
    let foundSection = false;
    let foundClamp = false;
    let m;
    while ((m = sectionBlockRe.exec(styleText)) !== null) {
      foundSection = true;
      if (/padding\s*:[^;]*clamp\s*\(/i.test(m[2])) {
        foundClamp = true; break;
      }
    }
    if (foundSection && !foundClamp) {
      warnings.push({ rule: 'L2-padding-clamp', severity: 'warning',
        message: '<section> padding does not use clamp() — mixin §Layout requires responsive padding (e.g. `padding: 32px clamp(24px, calc((100% - 960px) / 2), 96px);`)' });
    }
  }

  if (!skip.has('L2-crumb-color') && styleText) {
    const crumbBlockRe = /\.crumb\b[^{}]*\{([^}]*)\}/i;
    const m = styleText.match(crumbBlockRe);
    if (m && /color\s*:\s*var\(\s*--muted\s*\)/i.test(m[1])) {
      errors.push({ rule: 'L2-crumb-color', severity: 'error',
        message: '.crumb color is var(--muted) — mixin §Layout requires var(--fg) with opacity 0.85 for contrast' });
    }
  }

  // ---- L3: meta embed + link hygiene + shared link bar ------------------

  if (!skip.has('L3-section-nav')) {
    const headings = collectHeadings(root);
    const navLinks = root.querySelectorAll('nav.toc .sections a[href^="#"]');
    if (headings.length > 0 && navLinks.length === 0) {
      errors.push({ rule: 'L3-section-nav', severity: 'error',
        message: '<nav.toc .sections> has no section links, but the document has headings' });
    } else if (navLinks.length > 0) {
      const navTargets = navLinks.map(a => (a.getAttribute('href') || '').replace(/^#/, ''));
      const headingIds = headings.map(h => h.id);
      const missing = headingIds.filter(id => !navTargets.includes(id));
      const stale = navTargets.filter(id => !headingIds.includes(id));
      if (missing.length || stale.length) {
        errors.push({ rule: 'L3-section-nav', severity: 'error',
          message: `Section nav is stale — missing heading ids: [${missing.join(', ') || 'none'}], stale links: [${stale.join(', ') || 'none'}]` });
      }
    }
  }

  if (!skip.has('L3-diagrams') && DIAGRAM_REQUIRED_DOCS.has(ctx.docName)) {
    if (!hasSvgOrMermaid(root)) {
      errors.push({ rule: 'L3-diagrams', severity: 'error',
        message: `${ctx.docName}.html must include a first-class diagram: inline <svg> preferred, <pre class="mermaid"> accepted, table-only is not enough` });
    } else if (root.querySelectorAll('svg').length === 0) {
      warnings.push({ rule: 'L3-diagrams', severity: 'warning',
        message: `${ctx.docName}.html uses Mermaid only — SVG is preferred; tables are fallback only` });
    }
  }

  if (!skip.has('L3-story-flows') && ctx.docName === 'state-machine') {
    // State-machine doc must have a per-story flow subsection for every
    // product.userStories[]. Count is checked against meta.perStoryFlows[].
    const flows = Array.isArray(ctx.metaJson?.perStoryFlows) ? ctx.metaJson.perStoryFlows : null;
    if (flows !== null) {
      const visuals = root.querySelectorAll('svg, pre.mermaid, .mermaid').length;
      const expectedVisualsPerFlow = 1; // state diagram per flow; uiMockup is optional
      if (visuals < flows.length * expectedVisualsPerFlow) {
        errors.push({ rule: 'L3-story-flows', severity: 'error',
          message: `State-machine doc has ${visuals} diagram(s) but ${flows.length} perStoryFlows[] — every user story needs its state-path visual` });
      }
    }
  }

  if (!skip.has('L3-product-mockups') && ctx.docName === 'product') {
    // Product doc must have at least one mockup visual per user story.
    // Mockup form is surface-appropriate (screen sketch / terminal sketch /
    // API sketch); the visual just has to exist and be near mockup/screen text.
    const mockupVisuals = root.querySelectorAll('svg, pre.mermaid, .mermaid').filter((node) => {
      const text = nodeText(node.parentNode || node).toLowerCase();
      return /\b(mockup|screen|wireframe|sketch)\b/.test(text);
    });
    const storyCount = Array.isArray(ctx.metaJson?.userStories) ? ctx.metaJson.userStories.length : 0;
    if (mockupVisuals.length === 0) {
      errors.push({ rule: 'L3-product-mockups', severity: 'error',
        message: 'Product doc has no mockup visual — every user story needs a mockup (screen/terminal/API sketch)' });
    } else if (storyCount > 0 && mockupVisuals.length < storyCount) {
      errors.push({ rule: 'L3-product-mockups', severity: 'error',
        message: `Product doc has ${mockupVisuals.length} mockup visual(s) but ${storyCount} userStories[] — every story needs its own mockup` });
    }
  }

  if (!skip.has('L3-ux-visuals') && ctx.docName === 'design') {
    // Design docs ALWAYS require a mockup + user-flow visual — no exceptions for
    // CLI/library/backend designs. For non-UI tooling, the "mockup" can be a
    // terminal-output sketch or an API-shape sketch (any inline <svg>/mermaid
    // labelled mockup/screen counts), and the "flow" can be a command/API
    // sequence diagram. The point is: every design has a user-facing surface,
    // and that surface must have a first-class visual.
    if (!hasVisualNear(root, ['mockup', 'wireframe', 'screen'])) {
      errors.push({ rule: 'L3-ux-visuals', severity: 'error',
        message: 'Design doc has no first-class mockup/wireframe/screen visual — every design needs one (terminal/API sketches count for non-UI tools)' });
    }
    if (!hasVisualNear(root, ['flow', 'journey', 'screen flow', 'user flow', 'workflow'])) {
      errors.push({ rule: 'L3-ux-visuals', severity: 'error',
        message: 'Design doc has no first-class user-flow/workflow visual — every design needs one (command/API sequences count for non-UI tools)' });
    }
  }

  if (!skip.has('L3-meta-embed')) {
    const metaTag = root.querySelector('script#meta');
    if (!metaTag) {
      errors.push({ rule: 'L3-meta-embed', severity: 'error',
        message: '<script type="application/json" id="meta"> missing — mixin §Meta requires it' });
    } else {
      const type = (metaTag.getAttribute('type') || '').toLowerCase();
      if (type !== 'application/json') {
        errors.push({ rule: 'L3-meta-embed', severity: 'error',
          message: `<script#meta> type="${type}" — must be "application/json"` });
      }
      const raw = metaTag.text.trim();
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        errors.push({ rule: 'L3-meta-embed', severity: 'error',
          message: `<script#meta> body is not valid JSON: ${err.message}` });
      }
      if (parsed && ctx.metaJson) {
        const embeddedHash = crypto.createHash('sha256').update(canonicalJson(parsed), 'utf8').digest('hex');
        const externalHash = crypto.createHash('sha256').update(canonicalJson(ctx.metaJson), 'utf8').digest('hex');
        if (embeddedHash !== externalHash) {
          errors.push({ rule: 'L3-meta-embed', severity: 'error',
            message: `<script#meta> hash mismatch — embedded ${embeddedHash.slice(0, 12)}... vs external ${externalHash.slice(0, 12)}...` });
        }
      }
    }
  }

  if (!skip.has('L3-links')) {
    const anchors = root.querySelectorAll('a[href]');
    const bad = [];
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      if (!href) continue;
      // Allowed: #fragment, /root-absolute, http(s)://, mailto:
      if (href.startsWith('#')) continue;
      if (href.startsWith('/')) continue;
      if (/^https?:\/\//i.test(href)) continue;
      if (href.startsWith('mailto:')) continue;
      bad.push(href);
    }
    if (bad.length) {
      const sample = bad.slice(0, 5).join(', ');
      errors.push({ rule: 'L3-links', severity: 'error',
        message: `Found ${bad.length} non-root-absolute link(s): ${sample}${bad.length > 5 ? ' ...' : ''}. Mixin §Link rules forbid "./", "../", "file://".` });
    }
  }

  if (!skip.has('L3-shared-link')) {
    const links = root.querySelectorAll('header.top .links a');
    if (links.length !== 3) {
      errors.push({ rule: 'L3-shared-link', severity: 'error',
        message: `<header.top .links> has ${links.length} links — must be exactly 3 (Context, Glossary, ADRs)` });
    } else {
      const texts = links.map(a => a.text.trim());
      for (const expected of SHARED_LINK_LABELS) {
        if (!texts.some(t => t.includes(expected))) {
          warnings.push({ rule: 'L3-shared-link', severity: 'warning',
            message: `<header.top .links> missing "${expected}" — found: [${texts.join(', ')}]` });
        }
      }
      for (const a of links) {
        const href = a.getAttribute('href') || '';
        if (!href.startsWith('/_shared/')) {
          errors.push({ rule: 'L3-shared-link', severity: 'error',
            message: `<header.top .links> link "${href}" does not start with /_shared/` });
        }
      }
    }
  }

  return { errors, warnings, info };
}

/**
 * Render a short text report. One line per finding.
 */
export function formatReport(filePath, result) {
  const { errors, warnings } = result;
  if (errors.length === 0 && warnings.length === 0) return '';
  const lines = [`${filePath}`];
  for (const e of errors) lines.push(`  [ERROR] ${e.rule}: ${e.message}`);
  for (const w of warnings) lines.push(`  [WARN]  ${w.rule}: ${w.message}`);
  return lines.join('\n');
}

/**
 * Convenience: lint a file path on disk. Reads it, calls lintHtml.
 */
export async function lintFile(absPath, ctx = {}) {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(absPath, 'utf-8');
  // Auto-derive docName from filename if not provided.
  if (!ctx.docName) {
    const base = absPath.substring(absPath.lastIndexOf('/') + 1);
    ctx.docName = base.replace(/\.html?$/i, '');
  }
  // Auto-load sibling meta.json if it exists and not passed in.
  if (!ctx.metaJson) {
    try {
      const metaPath = absPath.replace(/\.html?$/i, '.meta.json');
      const metaRaw = await readFile(metaPath, 'utf-8');
      ctx.metaJson = JSON.parse(metaRaw);
    } catch { /* no meta — skip L3-meta-embed hash check */ }
  }
  return lintHtml(html, ctx);
}

// ===========================================================================
// AUTO-FIX
// ===========================================================================
//
// Mechanical fixes for findings the lint can describe in terms of "here's the
// exact byte change". String-based on purpose — we DO NOT round-trip through
// node-html-parser when emitting, because the parser is lossy on whitespace,
// formatting, mermaid blocks, and `<script>` bodies. Every fix is a targeted
// regex/string surgery against the original HTML.
//
// Each fixer takes (html, root, ctx) where `root` is the parsed view used for
// detection only, and returns either the mutated html string AND a one-line
// description, or null when the rule cannot be applied (precondition missing).
//
// What's auto-fixable:
//   ✓ L1-nav            — missing <div class="sections"> / <div class="docgroup">
//                         wrappers, missing <div class="sep"> divider
//   ✓ L1-active         — missing class="active" on the current doc's nav link
//   ✓ L2-palette        — drifted GitHub-Dark palette values (replaced verbatim)
//   ✓ L2-no-maxwidth-section — strips `max-width` declarations on `section`
//   ✓ L2-crumb-color    — swaps var(--muted) for var(--fg) in .crumb
//   ✓ L3-shared-link    — when count is 0/1, injects the 3 canonical links
//   ✓ L3-meta-embed     — re-embeds <doc>.meta.json bytes when external meta supplied
//
// NOT auto-fixed (Writer agent must intervene — these need real content):
//   ✗ L1-skeleton / L1-section / L1-docgroup (missing scenario links)
//   ✗ L3-diagrams / L3-ux-visuals / L3-product-mockups / L3-story-flows
//   ✗ L3-section-nav stale heading-id list
//   ✗ L3-links relative paths (the Writer needs to know the right target)

const LOCKED_PALETTE_DEFAULTS = {
  ...PALETTE_LOCKED_VALUES,
  '--muted':  '#8b949e',
};

function fixSectionsWrapper(html) {
  // Locate the second <h3> inside nav.toc — by contract it's "Sections" — and
  // wrap every following <a href="#..."> sibling (up to </nav>) in
  // <div class="sections">…</div>. If a `.sections` div already exists,
  // do nothing.
  if (/<div\s+class=["'][^"']*\bsections\b[^"']*["']/i.test(html)) return null;
  const navMatch = html.match(/(<nav\s+class=["']toc["'][^>]*>)([\s\S]*?)(<\/nav>)/i);
  if (!navMatch) return null;

  const before = html.slice(0, navMatch.index);
  const navOpen = navMatch[1];
  const navInner = navMatch[2];
  const navClose = navMatch[3];
  const after = html.slice(navMatch.index + navMatch[0].length);

  const h3s = [...navInner.matchAll(/<h3\b[^>]*>[\s\S]*?<\/h3>/gi)];
  if (h3s.length < 2) return null;
  const secondH3End = h3s[1].index + h3s[1][0].length;

  const head = navInner.slice(0, secondH3End);
  const tail = navInner.slice(secondH3End);
  // Wrap entire tail in a <div class="sections"> block (preserves whitespace).
  const wrapped = `${head}\n  <div class="sections">${tail.trimEnd()}\n  </div>\n`;
  return {
    html: `${before}${navOpen}${wrapped}${navClose}${after}`,
    description: 'wrapped nav.toc section links in <div class="sections">',
  };
}

function fixDocgroupWrapper(html) {
  if (/<div\s+class=["'][^"']*\bdocgroup\b[^"']*["']/i.test(html)) return null;
  // Wrap the run of <a> tags between the first <h3> and the first separator
  // (or .sep / second h3) into <div class="docgroup">.
  const navMatch = html.match(/(<nav\s+class=["']toc["'][^>]*>)([\s\S]*?)(<\/nav>)/i);
  if (!navMatch) return null;

  const navInner = navMatch[2];
  const firstH3 = navInner.match(/<h3\b[^>]*>[\s\S]*?<\/h3>/i);
  if (!firstH3) return null;
  const afterFirstH3 = firstH3.index + firstH3[0].length;

  // Find end of the doc-link run: stops at <div class="sep">, <h3>, or </nav>.
  const tailStart = afterFirstH3;
  const tailHtml = navInner.slice(tailStart);
  const endMarkerMatch = tailHtml.match(/<div\s+class=["'][^"']*\bsep\b[^"']*["']|<h3\b|<\/nav>/i);
  if (!endMarkerMatch) return null;
  const linkRun = tailHtml.slice(0, endMarkerMatch.index);
  if (!/<a\s/i.test(linkRun)) return null;

  const rest = tailHtml.slice(endMarkerMatch.index);
  const newNavInner =
    navInner.slice(0, tailStart) +
    `\n  <div class="docgroup">${linkRun.trimEnd()}\n  </div>\n  ` +
    rest;

  const before = html.slice(0, navMatch.index);
  const after = html.slice(navMatch.index + navMatch[0].length);
  return {
    html: `${before}${navMatch[1]}${newNavInner}${navMatch[3]}${after}`,
    description: 'wrapped nav.toc doc links in <div class="docgroup">',
  };
}

function fixSepDivider(html) {
  if (/<div\s+class=["'][^"']*\bsep\b[^"']*["']/i.test(html)) return null;
  // Insert <div class="sep"></div> immediately before the SECOND <h3> inside nav.toc.
  const navMatch = html.match(/(<nav\s+class=["']toc["'][^>]*>)([\s\S]*?)(<\/nav>)/i);
  if (!navMatch) return null;

  const navInner = navMatch[2];
  const h3s = [...navInner.matchAll(/<h3\b[^>]*>[\s\S]*?<\/h3>/gi)];
  if (h3s.length < 2) return null;
  const secondH3Start = h3s[1].index;

  const newNavInner =
    navInner.slice(0, secondH3Start) +
    `<div class="sep"></div>\n  ` +
    navInner.slice(secondH3Start);

  const before = html.slice(0, navMatch.index);
  const after = html.slice(navMatch.index + navMatch[0].length);
  return {
    html: `${before}${navMatch[1]}${newNavInner}${navMatch[3]}${after}`,
    description: 'inserted <div class="sep"> divider between Documents and Sections',
  };
}

function fixActiveLink(html, docName) {
  if (!docName) return null;
  // Already has an active link inside .docgroup? Done.
  if (/<a\b[^>]*class\s*=\s*["'][^"']*\bactive\b[^"']*["'][^>]*>/i.test(html)) return null;
  // Find <a href="/{anything}/{docName}.html"...> within nav.toc and tag it.
  const re = new RegExp(
    `(<a\\b[^>]*href=["'][^"']*\\/${docName}\\.html["'][^>]*)>`,
    'i',
  );
  if (!re.test(html)) return null;
  let applied = false;
  const newHtml = html.replace(re, (full, prefix) => {
    if (applied) return full;
    // Add class="active" (or merge with existing class attribute).
    let mutated;
    if (/\bclass\s*=\s*["']/i.test(prefix)) {
      mutated = prefix.replace(/\bclass\s*=\s*["']([^"']*)["']/i, (_m, val) => `class="${val.trim()} active"`);
    } else {
      mutated = `${prefix} class="active"`;
    }
    applied = true;
    return `${mutated}>`;
  });
  return applied
    ? { html: newHtml, description: `added class="active" to nav link for ${docName}` }
    : null;
}

function fixPaletteDrift(html) {
  // For each locked CSS var, replace its declared value with the canonical one.
  let mutated = html;
  let touched = 0;
  for (const [name, value] of Object.entries(LOCKED_PALETTE_DEFAULTS)) {
    const re = new RegExp(`(${name.replace(/[-]/g, '\\-')}\\s*:\\s*)([#\\w()., %]+?)(\\s*;)`, 'i');
    const m = mutated.match(re);
    if (!m) continue;
    if (m[2].trim().toLowerCase() === value.toLowerCase()) continue;
    mutated = mutated.replace(re, `$1${value}$3`);
    touched += 1;
  }
  return touched > 0
    ? { html: mutated, description: `restored ${touched} locked palette value(s) to GitHub-Dark defaults` }
    : null;
}

function fixSectionMaxWidth(html) {
  // Strip every `max-width: <non-none>;` declaration inside `section` CSS rules.
  // Only touches rules whose selector list contains the bare `section` token —
  // leaves `section.hero { max-width: 600px; }` (theoretical) and others alone
  // because the lint only flags the bare `section` selector.
  let touched = false;
  const sectionBlockRe = /((?:^|\s|,)section\b[^{}]*\{)([^}]*)(\})/gi;
  const newHtml = html.replace(sectionBlockRe, (full, open, body, close) => {
    if (!/max-width\s*:/i.test(body)) return full;
    const stripped = body.replace(/(?:^|\s|;)\s*max-width\s*:\s*[^;]+;?/gi, ';').replace(/;+/g, ';');
    if (stripped !== body) touched = true;
    return `${open}${stripped}${close}`;
  });
  return touched
    ? { html: newHtml, description: 'stripped max-width from <section> CSS rule(s)' }
    : null;
}

function fixCrumbColor(html) {
  const re = /(\.crumb\b[^{}]*\{[^}]*color\s*:\s*)var\(\s*--muted\s*\)/i;
  if (!re.test(html)) return null;
  return {
    html: html.replace(re, '$1var(--fg)'),
    description: 'changed .crumb color from var(--muted) to var(--fg)',
  };
}

function fixSharedLinkBar(html) {
  // If `header.top .links` is missing entirely OR contains < 3 links, inject
  // the canonical 3. Leave correct-count bars alone (a label warning fires
  // for those instead, and is not auto-fixable without knowing intent).
  const headerMatch = html.match(/<header\s+class=["']top["'][^>]*>[\s\S]*?<\/header>/i);
  if (!headerMatch) return null;
  const headerHtml = headerMatch[0];
  const linksMatch = headerHtml.match(/<div\s+class=["'][^"']*\blinks\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const linkCount = linksMatch ? (linksMatch[1].match(/<a\b/gi) || []).length : 0;
  if (linkCount === 3) return null;

  const canonical = `<div class="links">
    <a href="/_shared/context/overview.html">📘 Context</a>
    <a href="/_shared/glossary/glossary.html">📖 Glossary</a>
    <a href="/_shared/decisions/index.html">📋 ADRs</a>
  </div>`;

  let newHeader;
  if (linksMatch) {
    newHeader = headerHtml.replace(linksMatch[0], canonical);
  } else {
    newHeader = headerHtml.replace(/<\/header>/i, `  ${canonical}\n</header>`);
  }
  return {
    html: html.replace(headerHtml, newHeader),
    description: `replaced/inserted <header.top .links> with the 3 canonical shared-asset links`,
  };
}

function fixMetaEmbed(html, metaJson) {
  if (!metaJson) return null;
  const re = /(<script\s+[^>]*id=["']meta["'][^>]*>)([\s\S]*?)(<\/script>)/i;
  const m = html.match(re);
  if (!m) return null;
  const canonical = canonicalJson(metaJson);
  const embedded = m[2].trim();
  // Compare hashes; only rewrite if they actually differ.
  const embeddedHash = embedded ? crypto.createHash('sha256').update(embedded, 'utf8').digest('hex') : '';
  const externalHash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  if (embeddedHash === externalHash) return null;
  return {
    html: html.replace(re, `$1${canonical}$3`),
    description: 're-embedded canonical <doc>.meta.json bytes into <script#meta>',
  };
}

/**
 * Apply every auto-fix that applies to `html`, in order, idempotently. Each
 * fixer either makes a single targeted edit or returns null. After all fixers
 * run, re-lint the result and surface what's left as `unfixed`.
 *
 * @param {string} html - the original HTML source.
 * @param {object} ctx - same as lintHtml's ctx. `metaJson` enables L3-meta-embed fix.
 * @returns {{ html, fixed: string[], unfixed: Array, before: Array }}
 *   - html:    patched HTML (or original if nothing applied)
 *   - fixed:   one-line descriptions of every fixer that touched the html
 *   - unfixed: lint errors that remain (Writer must address)
 *   - before:  the original lint findings, useful for telemetry
 */
export function fixHtml(html, ctx = {}) {
  const before = lintHtml(html, ctx);
  if (before.errors.length === 0 && before.warnings.length === 0) {
    return { html, fixed: [], unfixed: [], before: before.errors };
  }

  const fixed = [];
  const tryFix = (fixer) => {
    const result = fixer(html, ctx);
    if (result && typeof result.html === 'string' && result.html !== html) {
      html = result.html;
      fixed.push(result.description);
    }
  };

  // Order matters: structural wrappers first so later checks see the canonical
  // shape; meta re-embed last so it picks up any earlier formatting drift.
  tryFix((h)    => fixDocgroupWrapper(h));
  tryFix((h)    => fixSepDivider(h));
  tryFix((h)    => fixSectionsWrapper(h));
  tryFix((h, c) => fixActiveLink(h, c.docName));
  tryFix((h)    => fixSharedLinkBar(h));
  tryFix((h)    => fixPaletteDrift(h));
  tryFix((h)    => fixSectionMaxWidth(h));
  tryFix((h)    => fixCrumbColor(h));
  tryFix((h, c) => fixMetaEmbed(h, c.metaJson));

  const after = lintHtml(html, ctx);
  return { html, fixed, unfixed: after.errors, before: before.errors };
}

/**
 * Lint a file, apply auto-fixes, write the patched HTML back to disk if
 * anything changed, and return the verdict.
 *
 * @param {string} absPath
 * @param {object} ctx - same as lintFile; passed to fixHtml.
 * @returns {Promise<{ html, fixed, unfixed, before, wroteBack }>}
 */
export async function lintAndFix(absPath, ctx = {}) {
  const { readFile, writeFile } = await import('node:fs/promises');
  const html = await readFile(absPath, 'utf-8');
  if (!ctx.docName) {
    const base = absPath.substring(absPath.lastIndexOf('/') + 1).split(/[\\/]/).pop();
    ctx.docName = base.replace(/\.html?$/i, '');
  }
  if (!ctx.metaJson) {
    try {
      const metaPath = absPath.replace(/\.html?$/i, '.meta.json');
      const metaRaw = await readFile(metaPath, 'utf-8');
      ctx.metaJson = JSON.parse(metaRaw);
    } catch { /* no meta */ }
  }
  const result = fixHtml(html, ctx);
  let wroteBack = false;
  if (result.html !== html) {
    await writeFile(absPath, result.html, 'utf-8');
    wroteBack = true;
  }
  return { ...result, wroteBack };
}
