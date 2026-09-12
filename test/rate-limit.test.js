import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, clientKey, credentialKey } from '../src/rate-limit.js';
test('ingress identity ignores tokens and untrusted proxy headers', () => {
  const req = { headers: { 'x-forwarded-for': 'spoofed' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(clientKey(req, 'fake-token'), '127.0.0.1');
  assert.notEqual(credentialKey('pb_live_samePrefixOne'), credentialKey('pb_live_samePrefixTwo'));
  assert.doesNotMatch(credentialKey('pb_live_secret'), /pb_live/);
});
test('storage is bounded and expired identities are removed', () => {
  let time = 0;
  const limiter = createRateLimiter({ max: 1, maxKeys: 2, windowMs: 10, now: () => time });
  assert.equal(limiter.allow('a'), true);
  assert.equal(limiter.allow('a'), false);
  assert.equal(limiter.allow('b'), true);
  assert.equal(limiter.allow('c'), false);
  time = 11;
  assert.equal(limiter.allow('c'), true);
});
