import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TOOL_NAMES } from '../src/tools.js';

test('stdio server completes MCP initialization and lists the public tools', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['bin/prerenderbuddy-mcp.js'],
  });
  const client = new Client({
    name: 'prerenderbuddy-mcp-test',
    version: '0.1.1',
  });

  await client.connect(transport);
  try {
    const result = await client.listTools();
    assert.deepEqual(result.tools.map((tool) => tool.name), TOOL_NAMES);
  } finally {
    await client.close();
  }
});
