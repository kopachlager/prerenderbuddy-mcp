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
