/**
 * revise-dispatcher.js — host-only subsystem that moves a comment with
 * intent="revise" through the lifecycle defined in state-machine.html:
 *
 *   pending → dispatched → proposed → (accepted | rejected)
 *
 * Actual agent invocation is out of scope for this module — we surface the
 * queue via the `plan_revise` MCP tool and accept proposal files written by
 * the agent. Applying a proposal rewrites the doc at the anchored span.
 *
 * See plans/built-in-comment-ui/design.html §5 (routes) and §6.3 (UX).
 */

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { CommentError } from './comment-manager.js';

// ---- Config ---------------------------------------------------------------

const DEFAULT_CONFIG = { reviseMode: 'passive' };

async function readConfig(workspaceRoot, scenario) {
  const file = resolve(workspaceRoot, 'plans', scenario, '.comment-config.json');
  try {
    const text = await readFile(file, 'utf8');
    const parsed = JSON.parse(text);
    const mode = parsed && parsed.reviseMode === 'active' ? 'active' : 'passive';
    return { reviseMode: mode };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// ---- Path helpers ---------------------------------------------------------

function assertName(value, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value) || value.length > 80) {
    throw new CommentError('BAD_REQUEST', `invalid ${label}`, 400);
  }
}

function proposalPath(workspaceRoot, scenario, doc, commentId) {
  assertName(scenario, 'scenario');
  assertName(doc, 'doc');
  if (!/^cmt_[a-f0-9]{6}$/.test(commentId)) {
    throw new CommentError('BAD_REQUEST', 'invalid comment id', 400);
  }
  const plansRoot = resolve(workspaceRoot, 'plans');
  const file = resolve(plansRoot, scenario, '.comments', `${doc}.proposals`, `${commentId}.diff`);
  if (!file.startsWith(plansRoot + sep)) {
    throw new CommentError('BAD_REQUEST', 'path traversal rejected', 400);
  }
  return file;
}

function commentFilePath(workspaceRoot, scenario, doc) {
  assertName(scenario, 'scenario');
  assertName(doc, 'doc');
  const plansRoot = resolve(workspaceRoot, 'plans');
  const file = resolve(plansRoot, scenario, '.comments', `${doc}.jsonl`);
  if (!file.startsWith(plansRoot + sep)) {
    throw new CommentError('BAD_REQUEST', 'path traversal rejected', 400);
  }
  return file;
}

function docHtmlPath(workspaceRoot, scenario, doc) {
  assertName(scenario, 'scenario');
  assertName(doc, 'doc');
  const plansRoot = resolve(workspaceRoot, 'plans');
  const file = resolve(plansRoot, scenario, `${doc}.html`);
  if (!file.startsWith(plansRoot + sep)) {
    throw new CommentError('BAD_REQUEST', 'path traversal rejected', 400);
  }
  return file;
}

async function appendEvent(file, event) {
  await mkdir(join(file, '..'), { recursive: true });
  await appendFile(file, JSON.stringify(event) + '\n', 'utf8');
}

// ---- Host-role guard ------------------------------------------------------

function requireHost(actor) {
  if (!actor || actor.role !== 'host') {
    throw new CommentError('FORBIDDEN', 'revise flow is host-only', 403);
  }
}

// ---- Transitions ----------------------------------------------------------

/**
 * Mark a revise-intent comment as dispatched. Called by the `/plan-revise`
 * skill (manual dispatch under passive mode) or automatically by POST
 * comment under active mode. Real agent invocation happens out-of-band —
 * this function just records the transition.
 */
export async function dispatchRevise(workspaceRoot, scenario, doc, commentId, actor) {
  requireHost(actor);
  const file = commentFilePath(workspaceRoot, scenario, doc);
  await appendEvent(file, {
    op: 'revise',
    id: commentId,
    reviseStatus: 'dispatched',
    at: new Date().toISOString(),
    by: actor.name,
  });
}

/**
 * Record a proposal as available. The agent writes the diff to
 * .comments/<doc>.proposals/<id>.diff (writeProposalFile below); this
 * function bumps the status so the widget surfaces the "Proposal ready" chip.
 */
export async function attachProposal(workspaceRoot, scenario, doc, commentId, diffContent, actor) {
  requireHost(actor);
  const file = proposalPath(workspaceRoot, scenario, doc, commentId);
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, diffContent, 'utf8');
  const eventFile = commentFilePath(workspaceRoot, scenario, doc);
  const relRef = `.comments/${doc}.proposals/${commentId}.diff`;
  await appendEvent(eventFile, {
    op: 'revise',
    id: commentId,
    reviseStatus: 'proposed',
    proposalRef: relRef,
    at: new Date().toISOString(),
    by: actor.name,
  });
}

/**
 * Apply the proposal to the doc and mark the comment accepted + resolved.
 * Anchor-drift guard: refuses to apply if the anchor's exact text no longer
 * matches in the doc — the proposal is kept on disk for manual reattachment.
 * The proposal format is a minimal replacement block:
 *   `REPLACE:\n<old exact>\nWITH:\n<new text>`
 * Keeps the apply logic local + predictable; unified-diff support can layer
 * on later (it's opt-in via the header).
 */
export async function acceptProposal(workspaceRoot, scenario, doc, commentId, anchor, actor) {
  requireHost(actor);
  const propFile = proposalPath(workspaceRoot, scenario, doc, commentId);
  const diff = await readFile(propFile, 'utf8');
  const parsed = parseProposal(diff);
  if (!parsed) throw new CommentError('BAD_REQUEST', 'proposal format unrecognized', 400);

  const htmlPath = docHtmlPath(workspaceRoot, scenario, doc);
  const html = await readFile(htmlPath, 'utf8');
  if (anchor && anchor.exact && !html.includes(anchor.exact)) {
    // Anchor drifted — refuse to apply.
    throw new CommentError('ANCHOR_DRIFT', 'anchor no longer matches; reattach manually', 409);
  }
  if (!html.includes(parsed.from)) {
    throw new CommentError('ANCHOR_DRIFT', 'proposal target text not found in doc', 409);
  }

  const next = html.replace(parsed.from, parsed.to);
  await writeFile(htmlPath, next, 'utf8');

  const eventFile = commentFilePath(workspaceRoot, scenario, doc);
  await appendEvent(eventFile, {
    op: 'revise',
    id: commentId,
    reviseStatus: 'accepted',
    at: new Date().toISOString(),
    by: actor.name,
  });
  await appendEvent(eventFile, {
    op: 'resolve',
    id: commentId,
    resolved: true,
    at: new Date().toISOString(),
    by: actor.name,
  });
}

export async function rejectProposal(workspaceRoot, scenario, doc, commentId, actor) {
  requireHost(actor);
  const eventFile = commentFilePath(workspaceRoot, scenario, doc);
  await appendEvent(eventFile, {
    op: 'revise',
    id: commentId,
    reviseStatus: 'rejected',
    at: new Date().toISOString(),
    by: actor.name,
  });
}

export async function readProposal(workspaceRoot, scenario, doc, commentId) {
  const file = proposalPath(workspaceRoot, scenario, doc, commentId);
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// ---- Active-mode auto-dispatch on POST ------------------------------------

/**
 * Called by comment-manager's appendComment hook when a revise-intent
 * comment is created. Under active mode, stamps a dispatched event
 * immediately. Under passive mode, the pending entry waits for a manual
 * /plan-revise run.
 *
 * Deliberately does NOT invoke the agent — that's the /plan-revise skill's
 * job. Keeping agent invocation out-of-band means the web server never
 * blocks on an LLM call and retries don't poison the JSONL.
 */
export async function maybeAutoDispatch(workspaceRoot, scenario, doc, commentId, actor) {
  const cfg = await readConfig(workspaceRoot, scenario);
  if (cfg.reviseMode !== 'active') return { mode: 'passive', dispatched: false };
  try {
    await dispatchRevise(workspaceRoot, scenario, doc, commentId, actor);
    return { mode: 'active', dispatched: true };
  } catch {
    return { mode: 'active', dispatched: false };
  }
}

// ---- Queue listing (used by /plan-revise) ---------------------------------

/**
 * Returns every comment with intent=revise and reviseStatus=pending in the
 * scenario, across every doc. Used by the `/plan-revise` skill to batch-
 * dispatch pending revise requests.
 */
export async function listPendingRevises(workspaceRoot, scenario) {
  assertName(scenario, 'scenario');
  const commentsDir = resolve(workspaceRoot, 'plans', scenario, '.comments');
  let files;
  try {
    const { readdir } = await import('node:fs/promises');
    files = await readdir(commentsDir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of files) {
    if (!name.endsWith('.jsonl')) continue;
    const docSlug = name.slice(0, -'.jsonl'.length);
    try {
      const { listComments } = await import('./comment-manager.js');
      const data = await listComments(workspaceRoot, scenario, docSlug);
      (function walk(list) {
        for (const c of list) {
          if (c.intent === 'revise' && c.reviseStatus === 'pending' && !c.deleted) {
            out.push({
              scenario,
              doc: docSlug,
              id: c.id,
              body: c.body,
              anchor: c.anchor,
              author: c.author,
              createdAt: c.createdAt,
            });
          }
          if (c.replies) walk(c.replies);
        }
      })(data.comments || []);
    } catch {
      // corrupt JSONL or validation failure — skip that doc
    }
  }
  return out;
}

// ---- Proposal format ------------------------------------------------------

/**
 * Minimal proposal format:
 *
 *   REPLACE:
 *   <old exact text>
 *   WITH:
 *   <new text>
 *
 * Kept deliberately tiny so the MVP agent can emit it without a tokenizer
 * detour. Future revisions can sniff a unified-diff header (`--- a/`) and
 * delegate to a patch library.
 */
function parseProposal(diff) {
  const m = /^REPLACE:\s*\n([\s\S]*?)\nWITH:\s*\n([\s\S]*)$/m.exec(String(diff || ''));
  if (!m) return null;
  return { from: m[1], to: m[2] };
}
