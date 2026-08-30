import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, SERVER_VERSION } from '../src/server.js';
import { TOOL_NAMES } from '../src/tools.js';
import { WORKSPACE_TOOL_NAMES } from '../src/workspace-tools.js';

async function createTestClient(diagnostics, workspace = { enabled: false }) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer({ diagnostics, workspace });
  const client = new Client({
    name: 'prerenderbuddy-mcp-protocol-test',
    version: '1.0.0',
  });

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

test('stdio binary initializes, reports the package version, lists tools, and shuts down', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['bin/prerenderbuddy-mcp.js'],
    stderr: 'pipe',
  });
  const client = new Client({
    name: 'prerenderbuddy-mcp-test',
    version: '1.0.0',
  });

  await client.connect(transport);
  const pid = transport.pid;
  try {
    assert.ok(pid);
    assert.equal(client.getServerVersion()?.version, SERVER_VERSION);
    const result = await client.listTools();
    assert.deepEqual(result.tools.map((tool) => tool.name), TOOL_NAMES);
    for (const tool of result.tools) {
      assert.deepEqual(tool.annotations, {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    }
  } finally {
    await client.close();
  }
  assert.equal(transport.pid, null);
});

test('protocol calls all three tools with deterministic diagnostics', async () => {
  const diagnostics = {
    async checkUrl() {
      return { command: 'check', summary: 'pass', response: { statusCode: 200 } };
    },
    async compareUrl() {
      return { command: 'compare', summary: 'warning', differences: [] };
    },
    async checkDiscoveryFiles() {
      return { command: 'files', summary: 'pass', files: [] };
    },
  };
  const { client, close } = await createTestClient(diagnostics);

  try {
    const calls = [
      ['check_crawler_readability', 'check'],
      ['compare_http_responses', 'compare'],
      ['check_discovery_files', 'files'],
    ];
    for (const [name, command] of calls) {
      const result = await client.callTool({
        name,
        arguments: { url: 'https://fixture.example' },
      });
      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.command, command);
      assert.match(result.structuredContent.mcpSafetyNote, /untrusted data/);
    }
  } finally {
    await close();
  }
});

test('authenticated mode adds bounded read-only workspace tools', async () => {
  const calls = [];
  const workspace = {
    client: {
      enabled: true,
      async get(path, query) {
        calls.push({ path, query });
        return { path, query };
      },
    },
  };
  const { client, close } = await createTestClient({}, workspace);
  try {
    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name),
      [...TOOL_NAMES, ...WORKSPACE_TOOL_NAMES],
    );
    for (const tool of listed.tools.filter((item) => WORKSPACE_TOOL_NAMES.includes(item.name))) {
      assert.deepEqual(tool.annotations, {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    }
    const siteId = 'fae03b4c-48cd-44f9-a229-60c820630e5c';
    const result = await client.callTool({
      name: 'get_ai_visibility',
      arguments: { siteId, days: 90 },
    });
    assert.equal(result.isError, undefined);
    assert.deepEqual(calls, [{
      path: `/v1/developer/sites/${siteId}/visibility`,
      query: { days: 90 },
    }]);
    assert.match(result.structuredContent.mcpSafetyNote, /workspace evidence/i);
  } finally {
    await close();
  }
});

test('protocol rejects invalid input through the MCP schema', async () => {
  const { client, close } = await createTestClient({});
  try {
    const result = await client.callTool({
      name: 'check_crawler_readability',
      arguments: { url: 'https://fixture.example', maxChars: 1 },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Input validation error/);
    assert.equal(result.structuredContent, undefined);
  } finally {
    await close();
  }
});

test('protocol returns structured execution errors without stack traces', async () => {
  const { client, close } = await createTestClient({
    async checkUrl() {
      throw new Error('The URL resolves to a private or blocked network address.');
    },
  });

  try {
    const result = await client.callTool({
      name: 'check_crawler_readability',
      arguments: { url: 'https://fixture.example' },
    });
    assert.equal(result.isError, true);
    assert.deepEqual(result.structuredContent.error, {
      code: 'unsafe_target',
      message: 'The URL resolves to a private or blocked network address.',
    });
    assert.doesNotMatch(result.content[0].text, /\n\s+at |file:\/\//);
  } finally {
    await close();
  }
});
