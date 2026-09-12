import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startHttpServer } from '../src/http-server.js';
import { SERVER_VERSION } from '../src/server.js';
import { TOOL_NAMES } from '../src/tools.js';
import { WORKSPACE_TOOL_NAMES } from '../src/workspace-tools.js';

async function listen(options = {}) {
  const server = await startHttpServer({
    host: '127.0.0.1',
    port: 0,
    path: '/mcp',
    requireAuth: false,
    diagnostics: {
      async checkUrl() {
        return { command: 'check', summary: 'pass' };
      },
    },
    ...options,
  });
  const address = server.address();
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
  };
}

async function withClient(url, headers, fn) {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: headers ? { headers } : undefined,
  });
  const client = new Client({ name: 'prerenderbuddy-http-test', version: '1.0.0' });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

test('HTTP health endpoint reports the package version', async () => {
  const { server, origin } = await listen();
  try {
    const response = await fetch(`${origin}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      name: 'prerenderbuddy-mcp',
      version: SERVER_VERSION,
      transport: 'http',
    });
  } finally {
    server.close();
  }
});

test('HTTP MCP lists public tools without a key', async () => {
  const { server, origin } = await listen();
  try {
    await withClient(`${origin}/mcp`, undefined, async (client) => {
      const listed = await client.listTools();
      assert.deepEqual(listed.tools.map((tool) => tool.name), TOOL_NAMES);
    });
  } finally {
    server.close();
  }
});

test('HTTP MCP adds workspace tools when a request API key is present', async () => {
  const { server, origin } = await listen();
  try {
    await withClient(`${origin}/mcp`, {
      Authorization: 'Bearer pb_live_validkey1',
    }, async (client) => {
      const listed = await client.listTools();
      assert.deepEqual(
        listed.tools.map((tool) => tool.name),
        [...TOOL_NAMES, ...WORKSPACE_TOOL_NAMES],
      );
    });
  } finally {
    server.close();
  }
});

test('HTTP MCP rejects missing auth when required', async () => {
  const { server, origin } = await listen({ requireAuth: true });
  try {
    const response = await fetch(`${origin}/mcp`, { method: 'POST' });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, 'unauthorized');
  } finally {
    server.close();
  }
});

test('HTTP MCP rate-limits repeated requests', async () => {
  const { server, origin } = await listen({
    rateLimitMax: 1,
    rateLimitWindowMs: 60_000,
  });
  try {
    const first = await fetch(`${origin}/mcp`, { method: 'POST' });
    const second = await fetch(`${origin}/mcp`, { method: 'POST' });
    assert.notEqual(first.status, 429);
    assert.equal(second.status, 429);
  } finally {
    server.close();
  }
});

test('public HTTP rejects forged keys and token rotation cannot evade ingress limits', async () => {
  let validations = 0;
  const { server, origin } = await listen({ requireAuth: true, ingressRateLimitMax: 2,
    validateWorkspaceKey: async () => { validations++; return false; } });
  try {
    for (let i = 0; i < 3; i++) {
      const response = await fetch(`${origin}/mcp`, { method: 'POST', headers: {
        Authorization: `Bearer pb_live_fakekey${i}`, 'x-forwarded-for': `192.0.2.${i}`,
      } });
      assert.equal(response.status, i < 2 ? 401 : 429);
    }
    assert.equal(validations, 2);
  } finally { server.close(); }
});

test('shared-token diagnostics never inherit a service workspace key', async () => {
  const { server, origin } = await listen({ requireAuth: true, sharedToken: 'test-connector',
    env: { PRERENDER_BUDDY_API_KEY: 'pb_live_otherworkspace' } });
  try {
    await withClient(`${origin}/mcp`, { Authorization: 'Bearer test-connector' }, async client => {
      assert.deepEqual((await client.listTools()).tools.map(x => x.name), TOOL_NAMES);
      const result = await client.callTool({ name: 'check_crawler_readability', arguments: { url: 'https://example.com' } });
      assert.notEqual(result.isError, true);
    });
  } finally { server.close(); }
});

test('validated request keys retain workspace tools', async () => {
  const { server, origin } = await listen({ requireAuth: true,
    validateWorkspaceKey: async key => key === 'pb_live_validkey1' });
  try {
    await withClient(`${origin}/mcp`, { Authorization: 'Bearer pb_live_validkey1' }, async client => {
      assert.deepEqual((await client.listTools()).tools.map(x => x.name), [...TOOL_NAMES, ...WORKSPACE_TOOL_NAMES]);
    });
  } finally { server.close(); }
});


test('stateless HTTP declines optional SSE and session deletion without holding connections', async () => {
  const { server, origin } = await listen({ requireAuth: true, sharedToken: 'test-connector' });
  try {
    for (const method of ['GET', 'DELETE']) {
      const response = await fetch(`${origin}/mcp`, { method, headers: {
        Authorization: 'Bearer test-connector', Accept: 'text/event-stream',
      } });
      assert.equal(response.status, 405);
      assert.equal(response.headers.get('allow'), 'POST, OPTIONS');
      assert.equal((await response.json()).error.code, 'method_not_allowed');
    }
    await withClient(`${origin}/mcp`, { Authorization: 'Bearer test-connector' }, async client => {
      assert.deepEqual((await client.listTools()).tools.map(x => x.name), TOOL_NAMES);
    });
  } finally { server.close(); }
});
