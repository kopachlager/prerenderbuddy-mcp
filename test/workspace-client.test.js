import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceApiClient, WorkspaceApiError } from '../src/workspace-client.js';

test('workspace client stays disabled without an API key', async () => {
  const client = createWorkspaceApiClient({ apiKey: '', fetchFn: async () => new Response('{}') });
  assert.equal(client.enabled, false);
  await assert.rejects(
    () => client.get('/v1/developer/sites'),
    (error) => error instanceof WorkspaceApiError && error.code === 'workspace_auth_not_configured',
  );
});

test('workspace client authenticates only through the server-side header', async () => {
  let request = null;
  const client = createWorkspaceApiClient({
    apiKey: 'pb_live_private_test_value',
    baseUrl: 'https://api.prerenderbuddy.com',
    fetchFn: async (url, options) => {
      request = { url: url.toString(), options };
      return new Response(JSON.stringify({ sites: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(client.enabled, true);
  assert.deepEqual(await client.get('/v1/developer/sites'), { sites: [] });
  assert.equal(request.url, 'https://api.prerenderbuddy.com/v1/developer/sites');
  assert.equal(request.options.headers.Authorization, 'Bearer pb_live_private_test_value');
  assert.doesNotMatch(request.url, /pb_live_/);
});

test('workspace client returns bounded structured API errors without leaking keys', async () => {
  const client = createWorkspaceApiClient({
    apiKey: 'pb_live_private_test_value',
    fetchFn: async () => new Response(JSON.stringify({
      error: { code: 'insufficient_scope', message: 'This API key does not have the required scope.' },
      requestId: 'req_test',
    }), { status: 403 }),
  });
  await assert.rejects(
    () => client.get('/v1/developer/sites'),
    (error) => error instanceof WorkspaceApiError
      && error.status === 403
      && error.code === 'insufficient_scope'
      && error.requestId === 'req_test'
      && !error.message.includes('pb_live_'),
  );
});

test('workspace client treats unresolved placeholders as disabled', () => {
  const client = createWorkspaceApiClient({
    apiKey: '${PRERENDER_BUDDY_API_KEY}',
    fetchFn: async () => new Response('{}'),
  });
  assert.equal(client.enabled, false);
});

test('workspace client limits streamed bytes without trusting content length', async () => {
  let cancelled = false;
  const client = createWorkspaceApiClient({ apiKey: 'test', maxBytes: 10000,
    fetchFn: async () => new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(6000)); },
      cancel() { cancelled = true; },
    }), { headers: { 'content-length': '1' } }) });
  await assert.rejects(client.get('/v1/developer/sites'), error => error.code === 'workspace_response_too_large');
  assert.equal(cancelled, true);
});
test('workspace timeout covers a body that stalls after headers', async () => {
  let cancelled = false;
  const client = createWorkspaceApiClient({ apiKey: 'test', timeoutMs: 1000,
    fetchFn: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })) });
  await assert.rejects(client.get('/v1/developer/sites'), error => error.code === 'workspace_timeout');
  assert.equal(cancelled, true);
});
test('workspace requests reject remote HTTP and foreign origins; redirects are disabled', async () => {
  assert.throws(() => createWorkspaceApiClient({ baseUrl: 'http://remote.example' }), /HTTPS/);
  const client = createWorkspaceApiClient({ apiKey: 'test', fetchFn: async (url, options) => {
    assert.equal(options.redirect, 'error'); return new Response('{}');
  } });
  await assert.rejects(client.get('https://other.example/'), /configured origin/);
  await client.get('/v1/developer/sites');
});
