import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAuthorizedHttpRequest,
  looksLikeWorkspaceApiKey,
  normalizeConfiguredApiKey,
  requestWorkspaceApiKey,
} from '../src/api-key.js';
import { parseRuntimeOptions } from '../src/runtime-options.js';

test('treats unset, empty, and unresolved placeholders as absent', () => {
  assert.equal(normalizeConfiguredApiKey(undefined), '');
  assert.equal(normalizeConfiguredApiKey(''), '');
  assert.equal(normalizeConfiguredApiKey('   '), '');
  assert.equal(normalizeConfiguredApiKey('${PRERENDER_BUDDY_API_KEY}'), '');
  assert.equal(normalizeConfiguredApiKey('pb_live_validkey1'), 'pb_live_validkey1');
});

test('recognizes workspace keys and rejects placeholders', () => {
  assert.equal(looksLikeWorkspaceApiKey('pb_live_validkey1'), true);
  assert.equal(looksLikeWorkspaceApiKey('pb_test_validkey1'), true);
  assert.equal(looksLikeWorkspaceApiKey('${PRERENDER_BUDDY_API_KEY}'), false);
  assert.equal(looksLikeWorkspaceApiKey('not-a-key'), false);
});

test('prefers a request workspace key over an environment placeholder', () => {
  const key = requestWorkspaceApiKey(
    { authorization: 'Bearer pb_live_fromrequest' },
    { PRERENDER_BUDDY_API_KEY: '${PRERENDER_BUDDY_API_KEY}' },
  );
  assert.equal(key, 'pb_live_fromrequest');
});

test('HTTP auth requires a validated workspace key or shared token when enabled', async () => {
  assert.equal(await isAuthorizedHttpRequest({}, { requireAuth: false }), true);
  assert.equal(await isAuthorizedHttpRequest({}, { requireAuth: true }), false);
  assert.equal(await isAuthorizedHttpRequest(
    { authorization: 'Bearer pb_live_validkey1' },
    { requireAuth: true, validateWorkspaceKey: async () => true },
  ), true);
  assert.equal(await isAuthorizedHttpRequest(
    { authorization: 'Bearer connector-shared-token' },
    { requireAuth: true, sharedToken: 'connector-shared-token' },
  ), true);
  assert.equal(await isAuthorizedHttpRequest(
    { authorization: 'Bearer wrong' },
    { requireAuth: true, sharedToken: 'connector-shared-token' },
  ), false);
});

test('HTTP mode defaults to loopback without required auth', () => {
  const local = parseRuntimeOptions(['--http'], {});
  assert.equal(local.transport, 'http');
  assert.equal(local.host, '127.0.0.1');
  assert.equal(local.requireAuth, false);
  assert.equal(local.path, '/mcp');

  const publicBind = parseRuntimeOptions(['--http', '--host', '0.0.0.0'], {});
  assert.equal(publicBind.requireAuth, true);
});

test('invented keys do not pass auth, including when a shared token is configured', async () => {
  const headers = { authorization: 'Bearer pb_live_NOTAREALKEY12345' };
  assert.equal(await isAuthorizedHttpRequest(headers, { requireAuth: true }), false);
  assert.equal(await isAuthorizedHttpRequest(headers, { requireAuth: true, sharedToken: 'secret', validateWorkspaceKey: async () => false }), false);
  assert.equal(await isAuthorizedHttpRequest(headers, { requireAuth: true, validateWorkspaceKey: async () => { throw new Error('offline'); } }), false);
});
