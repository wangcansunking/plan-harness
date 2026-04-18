/**
 * comment-manager.js — Append-only JSONL comment store for plan docs.
 *
 * Each comment lives as a series of events on disk at
 *   plans/<scenario>/.comments/<doc>.jsonl
 * where every line is one JSON event. On read we collapse events per id
 * so the latest { body, resolved, deleted } wins without rewriting disk.
 *
 * This module is intentionally zero-dep (node builtins only) and single-
 * purpose: no auth (the route layer enforces that), no HTTP (routes marshal
 * request/response), no template concerns.
 *
 * See plans/built-in-comment-ui/design.html §§3–5 for the full contract.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';

// ---- Path & name safety ---------------------------------------------------

const NAME_RE = /^[a-zA-Z0-9_-]+$/;
const NAME_MAX = 80;
const ID_RE = /^cmt_[a-f0-9]{6}$/;
const BODY_MIN = 1;
const BODY_MAX = 4000;
const EXACT_MAX = 2000;
const AFFIX_MAX = 64;
const EDIT_WINDOW_MS = 10 * 60 * 1000;

// Personas that can be summoned via @-mention. Kept in sync with the
// reviewer roles in /plan-review and the prompts under prompts/.
export const PERSONA_NAMES = ['architect', 'pm', 'tester', 'frontend', 'backend', 'writer'];
const PERSONA_SET = new Set(PERSONA_NAMES);
// Only detect @-mentions when they look like standalone tokens — avoid
// catching "email@pm.com" or code fragments. Lookbehind requires start or
// non-word boundary, lookahead requires end or non-word.
const MENTION_RE = new RegExp('(?:^|[^a-zA-Z0-9_])@(' + PERSONA_NAMES.join('|') + ')(?![a-zA-Z0-9_])', 'gi');

export function extractMentions(body) {
  if (typeof body !== 'string' || body.length === 0) return [];
  const found = new Set();
  let m;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(body)) !== null) {
    const persona = m[1].toLowerCase();
    if (PERSONA_SET.has(persona)) found.add(persona);
  }
  return Array.from(found);
}

export class CommentError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status || 400;
  }
}

function assertName(value, label) {
  if (typeof value !== 'string' || !NAME_RE.test(value) || value.length > NAME_MAX) {
    throw new CommentError('BAD_REQUEST', `invalid ${label}`, 400);
  }
}

/**
 * Resolve the on-disk JSONL path for (scenario, doc) under the workspace.
 * Rejects any combination that would escape plans/<scenario>/.comments/.
 */
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

// ---- Validation -----------------------------------------------------------

function validateAnchor(a) {
  if (a == null) return null;
  if (typeof a !== 'object' || Array.isArray(a)) {
    throw new CommentError('BAD_REQUEST', 'anchor must be an object or null', 400);
  }
  const out = {};
  if (a.sectionId != null) {
    if (typeof a.sectionId !== 'string' || !/^sec-[a-f0-9]{16}(-[0-9]+)?$/.test(a.sectionId)) {
      throw new CommentError('BAD_REQUEST', 'anchor.sectionId must be sec-<16hex>', 400);
    }
    out.sectionId = a.sectionId;
  }
  if (a.exact != null) {
    if (typeof a.exact !== 'string' || a.exact.length === 0 || a.exact.length > EXACT_MAX) {
      throw new CommentError('BAD_REQUEST', `anchor.exact must be 1..${EXACT_MAX} chars`, 400);
    }
    out.exact = a.exact;
  }
  if (a.prefix != null) {
    if (typeof a.prefix !== 'string' || a.prefix.length > AFFIX_MAX) throw new CommentError('BAD_REQUEST', 'anchor.prefix too long', 400);
    out.prefix = a.prefix;
  }
  if (a.suffix != null) {
    if (typeof a.suffix !== 'string' || a.suffix.length > AFFIX_MAX) throw new CommentError('BAD_REQUEST', 'anchor.suffix too long', 400);
    out.suffix = a.suffix;
  }
  return out;
}

function validateBody(body) {
  if (typeof body !== 'string' || body.length < BODY_MIN || body.length > BODY_MAX) {
    throw new CommentError('BAD_REQUEST', `body must be ${BODY_MIN}..${BODY_MAX} chars`, 400);
  }
  return body;
}

function validateIntent(intent, role) {
  if (intent == null || intent === 'comment') return 'comment';
  if (intent === 'revise') {
    if (role !== 'host') {
      throw new CommentError('FORBIDDEN', 'revise intent requires host role', 403);
    }
    return 'revise';
  }
  throw new CommentError('BAD_REQUEST', 'intent must be "comment" or "revise"', 400);
}

function validateTodoResolves(flag, role) {
  if (flag == null || flag === false) return false;
  if (flag !== true) {
    throw new CommentError('BAD_REQUEST', 'todoResolves must be a boolean', 400);
  }
  if (role !== 'host') {
    throw new CommentError('FORBIDDEN', 'resolving a TODO requires host role', 403);
  }
  return true;
}

// ---- Disk I/O -------------------------------------------------------------

async function readEvents(file) {
  try {
    const text = await readFile(file, 'utf8');
    const events = [];
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        events.push(JSON.parse(trimmed));
      } catch {
        // Skip corrupt lines rather than poison the whole doc. Logged by the
        // route layer's audit stream.
      }
    }
    return events;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function appendEvent(file, event) {
  await mkdir(join(file, '..'), { recursive: true });
  await appendFile(file, JSON.stringify(event) + '\n', 'utf8');
}

// ---- Event → Comment collapse --------------------------------------------

/**
 * Walk the event log in order, building one comment per root id. Later events
 * overlay earlier ones (event sourcing, append-only semantics).
 */
function collapse(events) {
  const byId = new Map();
  for (const ev of events) {
    if (!ev || typeof ev !== 'object' || !ev.id) continue;
    let c = byId.get(ev.id);
    if (!c) {
      if (ev.op !== 'create') continue; // orphan event → skip
      c = {
        id: ev.id,
        createdAt: ev.createdAt,
        author: ev.author,
        anchor: ev.anchor || null,
        body: ev.body,
        threadId: ev.threadId || ev.id,
        replyTo: ev.replyTo || null,
        intent: ev.intent || 'comment',
        todoResolves: ev.todoResolves === true,
        resolved: false,
        resolvedBy: null,
        resolvedAt: null,
        deleted: false,
        deletedBy: null,
        editedAt: null,
        reviseStatus: ev.intent === 'revise' ? 'pending' : null,
        reviseProposalRef: null,
        // @-mention payload: personas referenced in the body and the
        // optional personaRole a persona-reply was posted under. The
        // presence of mentionedPersonas[] means a reviewer summoned one
        // or more agent personas; personaRole != null means this very
        // comment is a persona's reply.
        mentionedPersonas: Array.isArray(ev.mentionedPersonas) ? ev.mentionedPersonas.slice() : [],
        personaRole: typeof ev.personaRole === 'string' ? ev.personaRole : null,
      };
      byId.set(ev.id, c);
      continue;
    }
    if (ev.op === 'edit' && typeof ev.body === 'string') {
      c.body = ev.body;
      c.editedAt = ev.at || new Date().toISOString();
    } else if (ev.op === 'resolve') {
      c.resolved = !!ev.resolved;
      c.resolvedBy = ev.by || null;
      c.resolvedAt = ev.at || null;
    } else if (ev.op === 'delete') {
      c.deleted = true;
      c.deletedBy = ev.by || null;
      c.body = '[deleted]';
    } else if (ev.op === 'revise') {
      // transition: pending → dispatched → proposed → accepted|rejected
      if (typeof ev.reviseStatus === 'string') c.reviseStatus = ev.reviseStatus;
      if (ev.proposalRef != null) c.reviseProposalRef = ev.proposalRef;
    } else if (ev.op === 'reanchor') {
      // Emitted by reanchorDocument (Phase 10). Updates the live anchor
      // fields + records migration / orphan status without rewriting the
      // original create event.
      if (ev.anchor && typeof ev.anchor === 'object') {
        // Keep the original anchor's fields we didn't change (e.g. prefix)
        // unless explicitly overridden.
        c.anchor = Object.assign({}, c.anchor || {}, ev.anchor);
      }
      if (ev.anchor && ev.anchor.orphaned != null) {
        c.anchor = c.anchor || {};
        c.anchor.orphaned = !!ev.anchor.orphaned;
      }
      if (ev.anchor && ev.anchor.migratedFrom != null) {
        c.anchor = c.anchor || {};
        c.anchor.migratedFrom = ev.anchor.migratedFrom;
      }
    }
  }
  return Array.from(byId.values());
}

/**
 * Nest replies under their roots for the API response.
 */
function threadTree(comments) {
  const roots = [];
  const byId = new Map();
  for (const c of comments) byId.set(c.id, c);
  for (const c of comments) {
    if (!c.replyTo) {
      c.replies = [];
      roots.push(c);
    }
  }
  for (const c of comments) {
    if (c.replyTo) {
      const parent = byId.get(c.threadId) || byId.get(c.replyTo);
      if (parent) {
        parent.replies = parent.replies || [];
        parent.replies.push(c);
      }
    }
  }
  roots.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const r of roots) r.replies.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return roots;
}

// ---- Public API -----------------------------------------------------------

function genId() {
  return 'cmt_' + randomBytes(3).toString('hex');
}

export async function listComments(workspaceRoot, scenario, doc) {
  const file = commentFilePath(workspaceRoot, scenario, doc);
  const events = await readEvents(file);
  const flat = collapse(events);
  const roots = threadTree(flat);
  const total = flat.length;
  const resolved = flat.filter((c) => c.resolved).length;
  const orphaned = flat.filter((c) => c.anchor && c.anchor.orphaned).length;
  return { comments: roots, meta: { total, resolved, orphaned } };
}

/**
 * Create a new comment. `actor` is the server-resolved identity; any `author`
 * in payload is ignored. Returns the stored Comment object.
 */
export async function appendComment(workspaceRoot, scenario, doc, payload, actor) {
  if (!actor || !actor.name) throw new CommentError('FORBIDDEN', 'actor required', 403);
  const body = validateBody(payload.body);
  const anchor = validateAnchor(payload.anchor);
  const intent = validateIntent(payload.intent, actor.role);
  const todoResolves = validateTodoResolves(payload.todoResolves, actor.role);

  let threadId = null;
  let replyTo = null;
  if (payload.replyTo != null) {
    if (typeof payload.replyTo !== 'string' || !ID_RE.test(payload.replyTo)) {
      throw new CommentError('BAD_REQUEST', 'replyTo must be cmt_<6hex>', 400);
    }
    const file = commentFilePath(workspaceRoot, scenario, doc);
    const existing = collapse(await readEvents(file));
    const parent = existing.find((c) => c.id === payload.replyTo);
    if (!parent) throw new CommentError('NOT_FOUND', 'parent comment not found', 404);
    if (parent.deleted) throw new CommentError('BAD_REQUEST', 'cannot reply to deleted comment', 400);
    replyTo = parent.id;
    threadId = parent.threadId;
  }

  const id = genId();
  const createdAt = new Date().toISOString();
  const mentionedPersonas = extractMentions(body);
  const event = {
    op: 'create',
    id,
    createdAt,
    author: actor.name,
    anchor,
    body,
    threadId: threadId || id,
    replyTo,
    intent,
  };
  if (todoResolves) event.todoResolves = true;
  if (mentionedPersonas.length > 0) event.mentionedPersonas = mentionedPersonas;
  // personaRole is reserved for persona-reply posts made by postPersonaReply;
  // reviewer-created comments can never claim a persona role.
  const file = commentFilePath(workspaceRoot, scenario, doc);
  await appendEvent(file, event);

  return {
    id,
    createdAt,
    author: actor.name,
    anchor,
    body,
    threadId: event.threadId,
    replyTo,
    intent,
    todoResolves,
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    deleted: false,
    deletedBy: null,
    editedAt: null,
    reviseStatus: intent === 'revise' ? 'pending' : null,
    reviseProposalRef: null,
    mentionedPersonas,
    personaRole: null,
    replies: [],
  };
}

/**
 * Patch a comment — either body (author + edit window) or resolved flag.
 * Appends an event; prior versions preserved on disk.
 */
export async function patchComment(workspaceRoot, scenario, doc, id, patch, actor) {
  if (!actor || !actor.name) throw new CommentError('FORBIDDEN', 'actor required', 403);
  if (!ID_RE.test(id)) throw new CommentError('BAD_REQUEST', 'invalid id', 400);
  const file = commentFilePath(workspaceRoot, scenario, doc);
  const events = await readEvents(file);
  const existing = collapse(events).find((c) => c.id === id);
  if (!existing) throw new CommentError('NOT_FOUND', 'comment not found', 404);
  if (existing.deleted) throw new CommentError('BAD_REQUEST', 'cannot patch deleted comment', 400);

  const now = new Date().toISOString();

  if (typeof patch.body === 'string') {
    if (existing.author !== actor.name && actor.role !== 'host') {
      throw new CommentError('FORBIDDEN', 'body edit is author-only', 403);
    }
    if (Date.now() - Date.parse(existing.createdAt) > EDIT_WINDOW_MS) {
      throw new CommentError('FORBIDDEN', 'edit window expired', 403);
    }
    const body = validateBody(patch.body);
    await appendEvent(file, { op: 'edit', id, body, at: now, by: actor.name });
  } else if (typeof patch.resolved === 'boolean') {
    // Host-only resolve (per the §2 open decision — PM position wins until the
    // user rules otherwise; the route layer can relax this later).
    if (actor.role !== 'host' && existing.author !== actor.name) {
      throw new CommentError('FORBIDDEN', 'resolve requires host or author', 403);
    }
    await appendEvent(file, { op: 'resolve', id, resolved: patch.resolved, at: now, by: actor.name });
  } else {
    throw new CommentError('BAD_REQUEST', 'patch must set body or resolved', 400);
  }

  const refreshed = collapse(await readEvents(file)).find((c) => c.id === id);
  refreshed.replies = [];
  return refreshed;
}

// ---- @-mention queue (used by /plan-review + /plan-revise-like flows) ----

/**
 * Walk every doc in the scenario and return every mention-bearing comment
 * that hasn't been fulfilled by a persona reply yet. "Fulfilled" means a
 * reply comment exists in the same thread with `personaRole === persona`
 * created after the mention.
 *
 * Deleted comments are skipped on both sides — if the reviewer deletes
 * their @-mention, the mention vanishes; if the persona's reply is
 * deleted, the mention reopens.
 */
export async function listPendingMentions(workspaceRoot, scenario) {
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
    let data;
    try {
      data = await listComments(workspaceRoot, scenario, docSlug);
    } catch {
      continue;
    }
    // Flatten the thread tree so we can inspect replies uniformly.
    const flat = [];
    (function walk(list) {
      for (const c of list) { flat.push(c); if (c.replies) walk(c.replies); }
    })(data.comments || []);
    const byId = new Map(flat.map((c) => [c.id, c]));
    for (const c of flat) {
      if (c.deleted) continue;
      if (!c.mentionedPersonas || c.mentionedPersonas.length === 0) continue;
      // Siblings in the thread that are live persona replies created after c.
      const threadReplies = flat.filter((r) =>
        r.threadId === c.threadId && !r.deleted && r.personaRole != null
      );
      for (const persona of c.mentionedPersonas) {
        const fulfilled = threadReplies.some((r) =>
          r.personaRole === persona && String(r.createdAt) >= String(c.createdAt)
        );
        if (!fulfilled) {
          out.push({
            scenario,
            doc: docSlug,
            id: c.id,
            threadId: c.threadId,
            replyTo: c.replyTo,
            persona,
            author: c.author,
            body: c.body,
            anchor: c.anchor,
            createdAt: c.createdAt,
          });
        }
      }
    }
  }
  // Stable order: oldest mentions first, so a batch agent drains FIFO.
  out.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return out;
}

/**
 * Post a persona's reply to a mention. Appends a create event with
 * author=`<persona>` (for display) and personaRole=`<persona>` (the
 * authoritative marker). Requires a workspace-writable actor — the MCP
 * tool layer passes the caller's identity.
 *
 * Throws if the parent is deleted, the persona is unknown, or the parent
 * did not actually mention that persona (a weak guard against agents
 * spamming unrelated threads).
 */
export async function postPersonaReply(workspaceRoot, scenario, doc, parentId, persona, body, actor) {
  if (!actor || !actor.name) throw new CommentError('FORBIDDEN', 'actor required', 403);
  if (!PERSONA_SET.has(String(persona || '').toLowerCase())) {
    throw new CommentError('BAD_REQUEST', `unknown persona "${persona}"`, 400);
  }
  const personaLc = String(persona).toLowerCase();
  const validatedBody = validateBody(body);
  if (!ID_RE.test(parentId)) throw new CommentError('BAD_REQUEST', 'invalid parent id', 400);

  const file = commentFilePath(workspaceRoot, scenario, doc);
  const existing = collapse(await readEvents(file));
  const parent = existing.find((c) => c.id === parentId);
  if (!parent) throw new CommentError('NOT_FOUND', 'parent comment not found', 404);
  if (parent.deleted) throw new CommentError('BAD_REQUEST', 'cannot reply to deleted comment', 400);
  if (!parent.mentionedPersonas || !parent.mentionedPersonas.includes(personaLc)) {
    throw new CommentError('BAD_REQUEST', `parent comment does not mention @${personaLc}`, 400);
  }

  const id = genId();
  const createdAt = new Date().toISOString();
  const event = {
    op: 'create',
    id,
    createdAt,
    author: personaLc,
    anchor: parent.anchor || null,
    body: validatedBody,
    threadId: parent.threadId || parent.id,
    replyTo: parent.id,
    intent: 'comment',
    personaRole: personaLc,
    postedBy: actor.name, // audit trail: which MCP caller relayed this
  };
  await appendEvent(file, event);

  return {
    id,
    createdAt,
    author: personaLc,
    anchor: parent.anchor || null,
    body: validatedBody,
    threadId: event.threadId,
    replyTo: parent.id,
    intent: 'comment',
    todoResolves: false,
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    deleted: false,
    deletedBy: null,
    editedAt: null,
    reviseStatus: null,
    reviseProposalRef: null,
    mentionedPersonas: [],
    personaRole: personaLc,
    replies: [],
  };
}

// ---- Phase 10: re-anchor cascade ----------------------------------------

/**
 * Normalized token set for Jaccard similarity. Lowercased, stripped of
 * HTML tags + punctuation, split on whitespace, deduped.
 */
function tokens(s) {
  const t = String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z#0-9]+;/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\u00a0-\uffff]+/g, ' ')
    .trim();
  return new Set(t ? t.split(/\s+/) : []);
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  let intersect = 0;
  const small = a.size < b.size ? a : b;
  const other = small === a ? b : a;
  for (const t of small) if (other.has(t)) intersect += 1;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

/**
 * Split the doc HTML into sections keyed by sectionId.
 * Returns Map<sectionId, { heading: string, content: string }>.
 * Content is the HTML between this heading and the next `[data-section-id]`.
 */
function indexDocSections(html) {
  const out = new Map();
  const re = /<h[234][^>]*\bdata-section-id\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/h[234]>([\s\S]*?)(?=<h[234][^>]*\bdata-section-id|$)/gi;
  let m;
  while ((m = re.exec(html))) {
    out.set(m[1], { heading: m[2], content: m[3] });
  }
  return out;
}

const JACCARD_THRESHOLD = 0.72; // Open decision B — Architect default

/**
 * Run the three-tier cascade for a single anchor against the current doc.
 * Returns an object suitable for a `reanchor` event's `anchor` field.
 */
function reanchorOne(docSections, anchor) {
  if (!anchor || !anchor.exact) {
    return { orphaned: true };
  }
  const needle = anchor.exact;
  const sec = anchor.sectionId ? docSections.get(anchor.sectionId) : null;

  // Tier (a): exact prefix + exact + suffix in same sectionId
  if (sec) {
    const combined = (anchor.prefix || '') + needle + (anchor.suffix || '');
    if (combined.length > 0 && sec.content.includes(combined)) {
      return { sectionId: anchor.sectionId, orphaned: false };
    }
  }
  // Tier (b): exact needle anywhere in the same section (no prefix/suffix)
  if (sec && sec.content.includes(needle)) {
    return { sectionId: anchor.sectionId, orphaned: false };
  }
  // Tier (c): Jaccard token-overlap across all sections — find best match
  const needleTokens = tokens(needle);
  let best = { sectionId: null, score: 0 };
  for (const [sid, s] of docSections) {
    // Score the needle against each <p>/<li>/<td> chunk of text in the section
    const chunks = s.content.match(/<(?:p|li|td|span|h[234]|strong|em|div)[^>]*>([\s\S]*?)<\/(?:p|li|td|span|h[234]|strong|em|div)>/gi) || [];
    for (const chunk of chunks) {
      const score = jaccard(needleTokens, tokens(chunk));
      if (score > best.score) best = { sectionId: sid, score };
    }
  }
  if (best.sectionId && best.score >= JACCARD_THRESHOLD) {
    return {
      sectionId: best.sectionId,
      migratedFrom: anchor.sectionId || null,
      orphaned: false,
    };
  }
  return { orphaned: true, migratedFrom: anchor.sectionId || null };
}

/**
 * Re-anchor every comment in a single doc against the current doc HTML.
 * Appends one `reanchor` event per comment. Returns counts.
 *
 * Called by the plan_reanchor MCP tool after a doc regen. Idempotent — if
 * every anchor already holds, no events are written.
 */
export async function reanchorDocument(workspaceRoot, scenario, doc) {
  assertName(scenario, 'scenario');
  assertName(doc, 'doc');
  const plansRoot = resolve(workspaceRoot, 'plans');
  const htmlPath = resolve(plansRoot, scenario, `${doc}.html`);
  if (!htmlPath.startsWith(plansRoot + sep)) {
    throw new CommentError('BAD_REQUEST', 'path traversal rejected', 400);
  }
  let html;
  try {
    html = await readFile(htmlPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { held: 0, migrated: 0, orphaned: 0, total: 0 };
    throw err;
  }
  const sections = indexDocSections(html);

  const file = commentFilePath(workspaceRoot, scenario, doc);
  const existing = collapse(await readEvents(file));
  let held = 0, migrated = 0, orphaned = 0;
  for (const c of existing) {
    if (c.deleted) continue;
    if (!c.anchor) continue;
    const result = reanchorOne(sections, c.anchor);
    const movedSection = result.sectionId && result.sectionId !== c.anchor.sectionId;
    const justOrphaned = !!result.orphaned && !c.anchor.orphaned;
    const cleared = !result.orphaned && c.anchor.orphaned;
    if (!movedSection && !justOrphaned && !cleared) {
      held += 1;
      continue;
    }
    // Build the new anchor shape. Preserve prefix/suffix/exact — only
    // sectionId / orphaned / migratedFrom transition under the cascade.
    const newAnchor = {};
    if (result.sectionId) newAnchor.sectionId = result.sectionId;
    if (result.orphaned != null) newAnchor.orphaned = !!result.orphaned;
    if (result.migratedFrom != null) newAnchor.migratedFrom = result.migratedFrom;
    await appendEvent(file, {
      op: 'reanchor',
      id: c.id,
      anchor: newAnchor,
      at: new Date().toISOString(),
    });
    if (result.orphaned) orphaned += 1;
    else migrated += 1;
  }

  console.error(`[comments] reanchor ${scenario}/${doc} held=${held} migrated=${migrated} orphaned=${orphaned}`);
  return { held, migrated, orphaned, total: held + migrated + orphaned };
}

/**
 * Reanchor every doc in a scenario. Returns aggregate counts + per-doc detail.
 */
export async function reanchorScenario(workspaceRoot, scenario) {
  assertName(scenario, 'scenario');
  const commentsDir = resolve(workspaceRoot, 'plans', scenario, '.comments');
  let files = [];
  try {
    const { readdir } = await import('node:fs/promises');
    files = await readdir(commentsDir);
  } catch {
    return { held: 0, migrated: 0, orphaned: 0, total: 0, docs: [] };
  }
  const agg = { held: 0, migrated: 0, orphaned: 0, total: 0, docs: [] };
  for (const name of files) {
    if (!name.endsWith('.jsonl')) continue;
    const doc = name.slice(0, -'.jsonl'.length);
    try {
      const r = await reanchorDocument(workspaceRoot, scenario, doc);
      agg.held += r.held;
      agg.migrated += r.migrated;
      agg.orphaned += r.orphaned;
      agg.total += r.total;
      agg.docs.push({ doc, ...r });
    } catch (err) {
      agg.docs.push({ doc, error: err.message || String(err) });
    }
  }
  return agg;
}

export async function deleteComment(workspaceRoot, scenario, doc, id, actor) {
  if (!actor || !actor.name) throw new CommentError('FORBIDDEN', 'actor required', 403);
  if (!ID_RE.test(id)) throw new CommentError('BAD_REQUEST', 'invalid id', 400);
  const file = commentFilePath(workspaceRoot, scenario, doc);
  const events = await readEvents(file);
  const existing = collapse(events).find((c) => c.id === id);
  if (!existing) throw new CommentError('NOT_FOUND', 'comment not found', 404);
  if (existing.deleted) return; // idempotent
  if (existing.author !== actor.name && actor.role !== 'host') {
    throw new CommentError('FORBIDDEN', 'delete requires author or host', 403);
  }
  await appendEvent(file, { op: 'delete', id, at: new Date().toISOString(), by: actor.name });
}

// ---- Rate limiting --------------------------------------------------------

const BUCKET_CAPACITY = 5;
const BUCKET_WINDOW_MS = 10 * 1000;
const buckets = new Map(); // key -> { tokens, lastRefillAt }

export function checkRate(key) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: BUCKET_CAPACITY, lastRefillAt: now };
    buckets.set(key, b);
  }
  const elapsed = now - b.lastRefillAt;
  if (elapsed > 0) {
    const refill = (elapsed / BUCKET_WINDOW_MS) * BUCKET_CAPACITY;
    b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + refill);
    b.lastRefillAt = now;
  }
  if (b.tokens < 1) {
    const shortfall = 1 - b.tokens;
    const retryAfter = Math.ceil((shortfall / BUCKET_CAPACITY) * (BUCKET_WINDOW_MS / 1000));
    return { ok: false, retryAfter };
  }
  b.tokens -= 1;
  return { ok: true, retryAfter: 0 };
}

// ---- SSE registry ---------------------------------------------------------

const sseClients = new Map(); // scenarioDocKey -> Set<res>

function sseKey(scenario, doc) {
  return `${scenario}::${doc}`;
}

export function registerSseClient(scenario, doc, res) {
  const key = sseKey(scenario, doc);
  let set = sseClients.get(key);
  if (!set) {
    set = new Set();
    sseClients.set(key, set);
  }
  set.add(res);
  return () => {
    const s = sseClients.get(key);
    if (!s) return;
    s.delete(res);
    if (s.size === 0) sseClients.delete(key);
  };
}

export function broadcastCommentEvent(scenario, doc, op, comment) {
  const key = sseKey(scenario, doc);
  const set = sseClients.get(key);
  if (!set || set.size === 0) return;
  const payload = `event: comment\ndata: ${JSON.stringify({ op, comment })}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      // ignore; the close handler will deregister
    }
  }
}

/** Called by the SSE route every 30s to keep devtunnel connections alive. */
export function sseHeartbeat() {
  for (const set of sseClients.values()) {
    for (const res of set) {
      try {
        res.write('event: ping\ndata: {}\n\n');
      } catch {
        /* noop */
      }
    }
  }
}

// Start the heartbeat once; safe to import module multiple times (no-op on
// subsequent imports because the interval is stored on globalThis).
if (!globalThis.__PH_SSE_HEARTBEAT_STARTED__) {
  globalThis.__PH_SSE_HEARTBEAT_STARTED__ = true;
  setInterval(sseHeartbeat, 30 * 1000).unref();
}
