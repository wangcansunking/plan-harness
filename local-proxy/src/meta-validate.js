// meta-validate.js — cross-doc + HTML semantic validator for generated plan docs.
//
// Complements html-lint.js (which validates the HTML *structure*). This
// validator reads `<doc>.meta.json` for the doc being checked, the rendered
// `<doc>.html` (when present), and the upstream `<upstream>.meta.json` files,
// and asserts:
//
//   V1. Schema-shape: required top-level fields are present and the right type.
//   V2. Per-doc count invariants:
//        - product.userStories[].every(s => s.mockup)               (every story has a mockup)
//        - state-machine.perStoryFlows.length === product.userStories.length
//   V3. Cross-doc refs are intact:
//        - state-machine.perStoryFlows[].storyId  ∈ product.userStories[].id
//        - state-machine.perStoryFlows[].machine  ∈ stateMachines[].id
//        - implementation.prs[].slice             ∈ test-spec.verticalSlices[].id
//        - design.stateMachineRefs[].id           ∈ state-machine.stateMachines[].id  (warning — may resolve next render)
//        - test-spec.scenarios[].slice            ∈ verticalSlices[].id
//        - test-report.runs[].scenarioId          ∈ test-spec.scenarios[].id
//   V4. HTML semantic coverage: rendered HTML actually reflects the meta:
//        - product.html      contains one mockup-labelled <svg>/mermaid per userStories[] entry
//        - state-machine.html contains one diagram per perStoryFlows[] entry
//        - design.html       renders every uxMockups[] + userFlows[] entry as a first-class visual
//        - <doc>.html        cross-doc hrefs (Context / Glossary / ADRs / sibling docs) point at
//                            files that exist on disk in the scenario / _shared dir.
//
// Returns { errors, warnings } shaped identically to html-lint so call sites
// can render both with the same UI. Errors are fail-closed; warnings advisory.
//
// Used by:
//   - plan-gen Phase C (validate gate — after lint, before recordGeneration)
//   - plan-full        (runs validate at the end of every per-doc generation)
//   - bin/validate.mjs (standalone CLI)

import { readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parse } from 'node-html-parser';

const REQUIRED_TOP_LEVEL = {
  product:         ['doc', 'scenario', 'problem', 'users', 'userStories', 'successMetrics'],
  analysis:        ['doc', 'scenario', 'problem', 'painPoints', 'rootCauses', 'hypotheses'],
  design:          ['doc', 'scenario', 'goals', 'componentDag', 'uxMockups', 'userFlows', 'decisions', 'interfaces'],
  'state-machine': ['doc', 'scenario', 'stateMachines', 'perStoryFlows', 'cornerCases', 'invariants'],
  'test-spec':     ['doc', 'scenario', 'verticalSlices', 'scenarios', 'hitlAfkMatrix'],
  implementation:  ['doc', 'scenario', 'prs'],
  'test-report':   ['doc', 'scenario', 'runs', 'summary'],
};

function listMissing(meta, required) {
  return required.filter((field) => meta[field] === undefined || meta[field] === null);
}

function isArrayOf(meta, field) {
  return Array.isArray(meta[field]) && meta[field].length > 0;
}

async function readSiblingMeta(docDir, name) {
  try {
    const raw = await readFile(join(docDir, `${name}.meta.json`), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Validate a single doc's meta.json against schema shape + cross-doc refs.
 *
 * @param {object} meta - the parsed <doc>.meta.json content.
 * @param {object} ctx
 *   - docName: 'product' | 'analysis' | ... (required)
 *   - docDir:  absolute dir holding sibling <other>.meta.json files (required for cross-doc checks)
 *   - skipRules: array of rule IDs to skip
 * @returns {{ errors: Array, warnings: Array }}
 */
export async function validateMeta(meta, ctx = {}) {
  const errors = [];
  const warnings = [];
  const skip = new Set(ctx.skipRules || []);
  const docName = ctx.docName || meta.doc;

  if (!docName) {
    errors.push({ rule: 'V0-doc-name', severity: 'error',
      message: 'meta.json missing "doc" field — cannot determine which schema to validate against' });
    return { errors, warnings };
  }

  // ---- V1: schema-shape ------------------------------------------------

  if (!skip.has('V1-shape')) {
    const required = REQUIRED_TOP_LEVEL[docName];
    if (required) {
      const missing = listMissing(meta, required);
      if (missing.length) {
        errors.push({ rule: 'V1-shape', severity: 'error',
          message: `${docName}.meta.json missing required field(s): ${missing.join(', ')}` });
      }
    }
  }

  // ---- V2: per-doc invariants -----------------------------------------

  if (!skip.has('V2-product-mockups') && docName === 'product' && isArrayOf(meta, 'userStories')) {
    const missingMockups = meta.userStories
      .map((s, i) => ({ id: s.id || `index-${i}`, hasMockup: !!s.mockup }))
      .filter((s) => !s.hasMockup);
    if (missingMockups.length) {
      errors.push({ rule: 'V2-product-mockups', severity: 'error',
        message: `product.userStories[] entries without a mockup field: ${missingMockups.map((s) => s.id).join(', ')}` });
    }
  }

  // ---- V3: cross-doc referential integrity ----------------------------

  if (ctx.docDir) {
    if (!skip.has('V3-state-machine-stories') && docName === 'state-machine') {
      const product = await readSiblingMeta(ctx.docDir, 'product');
      if (product && Array.isArray(product.userStories)) {
        const productIds = new Set(product.userStories.map((s) => s.id));
        const flows = Array.isArray(meta.perStoryFlows) ? meta.perStoryFlows : [];

        if (flows.length !== productIds.size) {
          errors.push({ rule: 'V3-state-machine-stories', severity: 'error',
            message: `state-machine.perStoryFlows has ${flows.length} entries but product.userStories has ${productIds.size} — every story needs its own flow` });
        }

        const dangling = flows.filter((f) => f.storyId && !productIds.has(f.storyId));
        if (dangling.length) {
          errors.push({ rule: 'V3-state-machine-stories', severity: 'error',
            message: `state-machine.perStoryFlows[].storyId not in product.userStories[].id: ${dangling.map((f) => f.storyId).join(', ')}` });
        }

        if (Array.isArray(meta.stateMachines)) {
          const machineIds = new Set(meta.stateMachines.map((m) => m.id));
          const danglingMachines = flows.filter((f) => f.machine && !machineIds.has(f.machine));
          if (danglingMachines.length) {
            errors.push({ rule: 'V3-state-machine-stories', severity: 'error',
              message: `state-machine.perStoryFlows[].machine not in stateMachines[].id: ${danglingMachines.map((f) => f.machine).join(', ')}` });
          }
        }
      }
    }

    if (!skip.has('V3-implementation-slices') && docName === 'implementation') {
      const testSpec = await readSiblingMeta(ctx.docDir, 'test-spec');
      if (testSpec && Array.isArray(testSpec.verticalSlices)) {
        const sliceIds = new Set(testSpec.verticalSlices.map((s) => s.id));
        const prs = Array.isArray(meta.prs) ? meta.prs : [];
        const dangling = prs.filter((p) => p.slice && !sliceIds.has(p.slice));
        if (dangling.length) {
          errors.push({ rule: 'V3-implementation-slices', severity: 'error',
            message: `implementation.prs[].slice not in test-spec.verticalSlices[].id: ${dangling.map((p) => `${p.id || '?'}→${p.slice}`).join(', ')}` });
        }
      }
    }

    if (!skip.has('V3-design-state-machine-refs') && docName === 'design') {
      const stateMachine = await readSiblingMeta(ctx.docDir, 'state-machine');
      if (stateMachine && Array.isArray(stateMachine.stateMachines) && Array.isArray(meta.stateMachineRefs)) {
        const machineIds = new Set(stateMachine.stateMachines.map((m) => m.id));
        const dangling = meta.stateMachineRefs.filter((r) => r.id && !machineIds.has(r.id));
        if (dangling.length) {
          warnings.push({ rule: 'V3-design-state-machine-refs', severity: 'warning',
            message: `design.stateMachineRefs[].id not (yet) in state-machine.meta.json: ${dangling.map((r) => r.id).join(', ')} — may be fine if state-machine is regenerated next` });
        }
      }
    }

    if (!skip.has('V3-test-spec-slices') && docName === 'test-spec' && Array.isArray(meta.scenarios) && Array.isArray(meta.verticalSlices)) {
      const sliceIds = new Set(meta.verticalSlices.map((s) => s.id));
      const dangling = meta.scenarios.filter((s) => s.slice && !sliceIds.has(s.slice));
      if (dangling.length) {
        errors.push({ rule: 'V3-test-spec-slices', severity: 'error',
          message: `test-spec.scenarios[].slice not in verticalSlices[].id: ${dangling.map((s) => s.id || s.slice).join(', ')}` });
      }
    }

    if (!skip.has('V3-test-report-scenarios') && docName === 'test-report') {
      const testSpec = await readSiblingMeta(ctx.docDir, 'test-spec');
      if (testSpec && Array.isArray(testSpec.scenarios) && Array.isArray(meta.runs)) {
        const scenarioIds = new Set(testSpec.scenarios.map((s) => s.id));
        const dangling = meta.runs.filter((r) => r.scenarioId && !scenarioIds.has(r.scenarioId));
        if (dangling.length) {
          errors.push({ rule: 'V3-test-report-scenarios', severity: 'error',
            message: `test-report.runs[].scenarioId not in test-spec.scenarios[].id: ${dangling.map((r) => r.scenarioId).join(', ')}` });
        }
      }
    }
  }

  return { errors, warnings };
}

/**
 * Convenience: validate a meta.json file path. Auto-derives docName + docDir.
 */
export async function validateMetaFile(absPath, ctx = {}) {
  const raw = await readFile(absPath, 'utf-8');
  const meta = JSON.parse(raw);
  const inferred = {
    docName: ctx.docName || meta.doc || absPath.replace(/\.meta\.json$/i, '').split(/[\\/]/).pop(),
    docDir:  ctx.docDir || dirname(absPath),
    skipRules: ctx.skipRules,
  };
  return validateMeta(meta, inferred);
}

/**
 * V4 — HTML semantic coverage. Run after lint. Verifies the rendered HTML
 * actually reflects the meta (counts of mockups, diagrams, story flows) and
 * that cross-doc links resolve to files on disk.
 *
 * @param {string} html - the rendered HTML source.
 * @param {object} meta - the parsed meta.json for the same doc.
 * @param {object} ctx
 *   - docName: 'product' | 'design' | ...
 *   - docDir:  absolute scenario dir (used for resolving local hrefs)
 *   - sharedDir: absolute `_shared` dir (defaults to <workspace>/plan-harness/_shared)
 *   - skipRules: array of rule IDs to skip
 * @returns {Promise<{ errors, warnings }>}
 */
export async function validateHtmlSemantics(html, meta, ctx = {}) {
  const errors = [];
  const warnings = [];
  const skip = new Set(ctx.skipRules || []);
  const docName = ctx.docName || meta?.doc;
  if (!docName) return { errors, warnings };

  const root = parse(html || '', { lowerCaseTagName: false, comment: false });

  const visualsLabelled = (regex) =>
    root.querySelectorAll('svg, pre.mermaid, .mermaid').filter((node) => {
      const text = String(node.parentNode?.text || node.text || '').toLowerCase();
      return regex.test(text);
    });

  // V4-product-mockup-render: every userStories[] entry shows up as a mockup visual.
  if (!skip.has('V4-product-mockup-render') && docName === 'product' && Array.isArray(meta?.userStories)) {
    const mockups = visualsLabelled(/\b(mockup|screen|wireframe|sketch|terminal|cli)\b/);
    if (mockups.length < meta.userStories.length) {
      errors.push({ rule: 'V4-product-mockup-render', severity: 'error',
        message: `product.html renders ${mockups.length} mockup visual(s) but meta.userStories has ${meta.userStories.length} — every story's mockup must be visible in the HTML` });
    }
  }

  // V4-state-machine-flow-render: every perStoryFlows[] entry shows up as a diagram.
  if (!skip.has('V4-state-machine-flow-render') && docName === 'state-machine' && Array.isArray(meta?.perStoryFlows)) {
    const diagrams = root.querySelectorAll('svg, pre.mermaid, .mermaid').length;
    if (diagrams < meta.perStoryFlows.length) {
      errors.push({ rule: 'V4-state-machine-flow-render', severity: 'error',
        message: `state-machine.html renders ${diagrams} diagram(s) but meta.perStoryFlows has ${meta.perStoryFlows.length} — every story's state path must be visible` });
    }
  }

  // V4-design-visuals-render: design must render every uxMockups[] + userFlows[] entry.
  if (!skip.has('V4-design-visuals-render') && docName === 'design') {
    const mockupVisuals = visualsLabelled(/\b(mockup|screen|wireframe|sketch)\b/);
    const flowVisuals   = visualsLabelled(/\b(flow|journey|sequence|workflow)\b/);
    const expectedMockups = Array.isArray(meta?.uxMockups) ? meta.uxMockups.length : 0;
    const expectedFlows   = Array.isArray(meta?.userFlows) ? meta.userFlows.length : 0;
    if (expectedMockups > 0 && mockupVisuals.length < expectedMockups) {
      errors.push({ rule: 'V4-design-visuals-render', severity: 'error',
        message: `design.html renders ${mockupVisuals.length} mockup visual(s) but meta.uxMockups has ${expectedMockups}` });
    }
    if (expectedFlows > 0 && flowVisuals.length < expectedFlows) {
      errors.push({ rule: 'V4-design-visuals-render', severity: 'error',
        message: `design.html renders ${flowVisuals.length} flow visual(s) but meta.userFlows has ${expectedFlows}` });
    }
  }

  // V4-hrefs-resolve: every root-absolute cross-doc href points at a file that exists.
  if (!skip.has('V4-hrefs-resolve') && ctx.docDir) {
    const sharedDir = ctx.sharedDir || join(dirname(ctx.docDir), '_shared');
    const scenarioParent = dirname(ctx.docDir);  // plan-harness/
    const anchors = root.querySelectorAll('a[href]');
    const broken = [];
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('/')) continue;            // skip non-root-absolute (lint catches them)
      if (href.startsWith('/_shared/')) {
        const rel = href.slice('/_shared/'.length).split('#')[0];
        if (!rel) continue;
        try { await access(join(sharedDir, rel)); } catch { broken.push(href); }
      } else {
        // /<scenario>/<doc>.html
        const rel = href.slice(1).split('#')[0];
        if (!rel || !rel.endsWith('.html')) continue;
        try { await access(join(scenarioParent, rel)); } catch { broken.push(href); }
      }
    }
    if (broken.length) {
      const sample = broken.slice(0, 5).join(', ');
      warnings.push({ rule: 'V4-hrefs-resolve', severity: 'warning',
        message: `${broken.length} cross-doc href(s) point at files that don't exist on disk: ${sample}${broken.length > 5 ? ' ...' : ''}` });
    }
  }

  return { errors, warnings };
}

/**
 * Convenience: full validate pass = meta + html semantics. Pass the absolute
 * paths to both files; missing HTML skips V4 checks.
 */
export async function validateDoc(metaPath, htmlPath, ctx = {}) {
  const metaResult = await validateMetaFile(metaPath, ctx);
  let htmlResult = { errors: [], warnings: [] };
  try {
    const html = await readFile(htmlPath, 'utf-8');
    const meta = JSON.parse(await readFile(metaPath, 'utf-8'));
    htmlResult = await validateHtmlSemantics(html, meta, {
      docName: ctx.docName,
      docDir:  ctx.docDir || dirname(metaPath),
      sharedDir: ctx.sharedDir,
      skipRules: ctx.skipRules,
    });
  } catch { /* no HTML → V4 skipped */ }
  return {
    errors:   [...metaResult.errors,   ...htmlResult.errors],
    warnings: [...metaResult.warnings, ...htmlResult.warnings],
  };
}

/** Render a short text report. One line per finding. */
export function formatValidateReport(filePath, result) {
  const { errors, warnings } = result;
  if (errors.length === 0 && warnings.length === 0) return '';
  const lines = [filePath];
  for (const e of errors)   lines.push(`  [ERROR] ${e.rule}: ${e.message}`);
  for (const w of warnings) lines.push(`  [WARN]  ${w.rule}: ${w.message}`);
  return lines.join('\n');
}
