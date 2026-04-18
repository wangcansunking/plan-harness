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
