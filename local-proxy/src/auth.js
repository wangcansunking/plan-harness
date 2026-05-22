/**
 * auth.js — Minimal session auth for the shared dashboard.
 *
 * Design
 *   - Single shared temporary password per share session (host generates & hands out).
 *   - Reviewer submits password + display name; server creates a signed session cookie.
 *   - HMAC-signed session IDs (prevents tampering); server-side map holds name + TTL.
 *   - Constant-time password comparison; per-IP rate limiting with exponential backoff.
 *   - Rolling TTL: active sessions stay alive; idle ones expire.
 *   - Loopback requests bypass auth — the host viewing their own machine doesn't need it.
 *
 * Intentionally not used: OAuth, user DBs, password hashing (the password is
 * ephemeral and session-scoped — hashing at-rest buys nothing for in-memory).
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;   // 2 hours, rolling
const CLEANUP_INTERVAL_MS = 60 * 1000;
const ATTEMPT_RESET_MS = 60 * 60 * 1000;     // clear attempt history after 1h quiet
const MAX_FREE_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 2 * 1000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;
const MAX_NAME_LEN = 80;

// Password alphabet — ambiguous chars (0/O/1/l/I) removed so reviewers can read & type.
const PASSWORD_ALPHA = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PASSWORD_LEN = 16;

let password = null;                      // null when auth disabled
let hmacKey = null;                       // fresh per enable()
const sessions = new Map();               // sid -> { name, expiresAt }
const loginAttempts = new Map();          // ip -> { count, nextAllowedAt }
let cleanupTimer = null;

// ---- Lifecycle -------------------------------------------------------------

export function enable(customPassword) {
  password = customPassword || generatePassword();
  hmacKey = randomBytes(32);
  sessions.clear();
  loginAttempts.clear();
  if (cleanupTimer === null) {
    cleanupTimer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
    cleanupTimer.unref?.();
  }
  return password;
}

export function disable() {
  password = null;
  hmacKey = null;
  sessions.clear();
  loginAttempts.clear();
  if (cleanupTimer !== null) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

export function isEnabled() {
  return password !== null;
}

// ---- Password ---------------------------------------------------------------

export function generatePassword() {
  const bytes = randomBytes(PASSWORD_LEN);
  let out = '';
  for (let i = 0; i < PASSWORD_LEN; i++) {
    out += PASSWORD_ALPHA[bytes[i] % PASSWORD_ALPHA.length];
  }
  return out;
}

export function verifyPassword(provided) {
  if (password === null) return false;
  const a = Buffer.from(String(provided || ''), 'utf8');
  const b = Buffer.from(password, 'utf8');
  if (a.length !== b.length) {
    // Dummy compare keeps timing roughly equal across length mismatches.
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

// ---- Rate limiting ---------------------------------------------------------

export function checkRate(ip) {
  const a = loginAttempts.get(ip);
  if (!a) return { allowed: true };
  if (Date.now() < a.nextAllowedAt) {
    return { allowed: false, retryAfterMs: a.nextAllowedAt - Date.now() };
  }
  return { allowed: true };
}

export function recordAttempt(ip, success) {
  if (success) {
    loginAttempts.delete(ip);
    return;
  }
  const a = loginAttempts.get(ip) || { count: 0, nextAllowedAt: 0, lastAt: 0 };
  a.count += 1;
  a.lastAt = Date.now();
  if (a.count >= MAX_FREE_ATTEMPTS) {
    const over = a.count - MAX_FREE_ATTEMPTS;
    const backoff = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** over);
    a.nextAllowedAt = Date.now() + backoff;
  }
  loginAttempts.set(ip, a);
}

// ---- Sessions --------------------------------------------------------------

export function createSession(rawName) {
  if (hmacKey === null) throw new Error('auth disabled');
  const name = sanitizeName(rawName);
  const sid = randomBytes(16).toString('hex');
  const now = Date.now();
  sessions.set(sid, { name, createdAt: now, expiresAt: now + SESSION_TTL_MS });
  return { sid, name, cookieValue: serializeSid(sid) };
}

export function verifyCookie(cookieValue) {
  if (hmacKey === null || !cookieValue) return null;
  const dot = cookieValue.lastIndexOf('.');
  if (dot <= 0) return null;
  const sid = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  const expected = createHmac('sha256', hmacKey).update(sid).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  // Rolling TTL — active use keeps the session fresh.
  s.expiresAt = Date.now() + SESSION_TTL_MS;
  return { sid, name: s.name };
}

export function revokeSession(sid) {
  sessions.delete(sid);
}

// ---- Helpers ---------------------------------------------------------------

function sanitizeName(raw) {
  const trimmed = String(raw || '').trim().replace(/[\r\n\t]/g, ' ').slice(0, MAX_NAME_LEN);
  return trimmed || 'Anonymous';
}

function serializeSid(sid) {
  const sig = createHmac('sha256', hmacKey).update(sid).digest('base64url');
  return `${sid}.${sig}`;
}

function runCleanup() {
  const now = Date.now();
  for (const [sid, s] of sessions) {
    if (s.expiresAt < now) sessions.delete(sid);
  }
  for (const [ip, a] of loginAttempts) {
    if (a.lastAt && (now - a.lastAt) > ATTEMPT_RESET_MS && now >= a.nextAllowedAt) {
      loginAttempts.delete(ip);
    }
  }
}

/** True when a TCP peer address is loopback (host accessing their own machine). */
export function isLoopback(addr) {
  if (!addr) return false;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

// Headers added by reverse proxies / tunnels. If ANY of these is present on a
// request, it was forwarded by something — even if the TCP peer is 127.0.0.1
// (which is the case for devtunnel: `devtunnel host -p 3847` runs on the host
// machine and proxies external visitors via localhost). Treat such requests as
// remote regardless of socket peer.
const PROXY_HEADERS = [
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-real-ip',
  'forwarded',                  // RFC 7239
  'x-tunnel-skip-csp-headers',  // devtunnel-specific
  'x-ms-tunnel-client-name',    // dev tunnels MS-prefixed
  'x-azure-fdid',               // Azure Front Door
];

// Strict-host mode — when true, NEVER bypass auth on loopback either. Set by
// plan_share when the host wants belt-and-suspenders protection (host must
// also enter the password locally).
let strictHost = false;
export function setStrictHost(value) { strictHost = !!value; }
export function isStrictHost() { return strictHost; }

/**
 * True when a request is a genuine host-machine access (NOT proxied).
 *
 * Returns false in two cases:
 *   1. Socket peer is not loopback (normal remote access).
 *   2. Socket peer IS loopback, but the request carries proxy/tunnel
 *      forwarding headers — devtunnel and friends always set these. Without
 *      this check, anyone with the tunnel URL would receive the same loopback
 *      bypass the host gets, and the password gate becomes pointless.
 *
 * When strict-host mode is on (`setStrictHost(true)`), always returns false.
 */
export function isLocalRequest(req) {
  if (strictHost) return false;
  if (!isLoopback(req?.socket?.remoteAddress)) return false;
  const headers = req?.headers || {};
  for (const h of PROXY_HEADERS) {
    if (headers[h] !== undefined) return false;
  }
  return true;
}
