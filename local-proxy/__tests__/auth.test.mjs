// auth.test.mjs — covers the loopback-bypass tightening that stops devtunnel
// proxied requests from inheriting the host's auth bypass.
//
// Run via `node __tests__/auth.test.mjs` from local-proxy/.

import { strict as assert } from 'node:assert';
import { isLoopback, isLocalRequest, setStrictHost, isStrictHost } from '../src/auth.js';

let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    passed += 1;
    process.stdout.write(`  \x1b[32m✓\x1b[0m ${name}\n`);
  } catch (err) {
    failed += 1;
    process.stdout.write(`  \x1b[31m✗\x1b[0m ${name}\n    ${err.message}\n`);
  }
}

function req({ remoteAddress = '127.0.0.1', headers = {} } = {}) {
  return { socket: { remoteAddress }, headers };
}

it('isLoopback recognises canonical loopback addresses', () => {
  assert.equal(isLoopback('127.0.0.1'), true);
  assert.equal(isLoopback('::1'), true);
  assert.equal(isLoopback('::ffff:127.0.0.1'), true);
  assert.equal(isLoopback('192.168.1.10'), false);
  assert.equal(isLoopback(undefined), false);
});

it('isLocalRequest accepts a direct loopback request with no proxy headers', () => {
  setStrictHost(false);
  assert.equal(isLocalRequest(req()), true);
});

it('isLocalRequest rejects a remote (non-loopback) peer', () => {
  setStrictHost(false);
  assert.equal(isLocalRequest(req({ remoteAddress: '10.0.0.5' })), false);
});

it('isLocalRequest rejects a loopback request that carries X-Forwarded-For', () => {
  setStrictHost(false);
  // This is the devtunnel attack: socket peer is 127.0.0.1, but X-Forwarded-For
  // is present because the tunnel client proxied an external visitor through
  // localhost. Pre-fix code returned true here and skipped the password gate.
  assert.equal(
    isLocalRequest(req({ headers: { 'x-forwarded-for': '203.0.113.42' } })),
    false,
    'devtunnel-proxied request must NOT be treated as local',
  );
});

it('isLocalRequest rejects on X-Forwarded-Host, X-Real-IP, Forwarded, X-MS-Tunnel-* etc.', () => {
  setStrictHost(false);
  const headers = [
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-forwarded-port',
    'x-real-ip',
    'forwarded',
    'x-tunnel-skip-csp-headers',
    'x-ms-tunnel-client-name',
    'x-azure-fdid',
  ];
  for (const h of headers) {
    assert.equal(
      isLocalRequest(req({ headers: { [h]: 'anything' } })),
      false,
      `proxy header '${h}' must trip the gate`,
    );
  }
});

it('isLocalRequest returns false in strict-host mode even for direct loopback', () => {
  setStrictHost(true);
  assert.equal(isLocalRequest(req()), false);
  assert.equal(isStrictHost(), true);
  setStrictHost(false);
  assert.equal(isStrictHost(), false);
});

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
