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
import { canonicalJson } from './manifest-v2.js';

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
