import assert from 'node:assert/strict';
import test from 'node:test';
import { registerDiagnosticTools, TOOL_NAMES } from '../src/tools.js';

function captureTools(diagnostics) {
  const registered = new Map();
  const server = {
    registerTool(name, definition, handler) {
      registered.set(name, { definition, handler });
    },
  };
  registerDiagnosticTools(server, diagnostics);
  return registered;
}

test('registers exactly three diagnostic-only tools', () => {
  const tools = captureTools({});
  assert.deepEqual([...tools.keys()], TOOL_NAMES);
  assert.doesNotMatch([...tools.keys()].join(' '), /render|monitor|cache|purge/);
});

test('crawler readability forwards bounded options and returns structured output', async () => {
  let received;
  const tools = captureTools({
    async checkUrl(url, options) {
      received = { url, options };
      return { command: 'check', summary: 'pass', html: { title: 'Example' } };
    },
  });
  const result = await tools.get('check_crawler_readability').handler({
    url: 'https://example.com',
    userAgent: 'gptbot',
    timeoutMs: 5000,
    maxChars: 50000,
  });

  assert.deepEqual(received, {
    url: 'https://example.com',
    options: { userAgent: 'gptbot', timeoutMs: 5000, maxChars: 50000 },
  });
  assert.equal(result.structuredContent.summary, 'pass');
  assert.match(result.structuredContent.mcpSafetyNote, /untrusted data/);
});

test('HTTP comparison preserves precise non-rendering terminology', async () => {
  let received;
  const tools = captureTools({
    async compareUrl(url, options) {
      received = { url, options };
      return {
        command: 'compare',
        comparisonMode: 'http-user-agent-responses',
        note: 'Neither executes JavaScript.',
      };
    },
  });
  const tool = tools.get('compare_http_responses');
  const result = await tool.handler({
    url: 'https://example.com',
    userAgent: 'claudebot',
    textRatioThreshold: 0.2,
  });

  assert.equal(received.options.textRatioThreshold, 0.2);
  assert.match(tool.definition.description, /Neither response executes JavaScript/);
  assert.equal(result.structuredContent.comparisonMode, 'http-user-agent-responses');
});

test('discovery checks and execution errors use MCP-compatible results', async () => {
  const tools = captureTools({
    async checkDiscoveryFiles() {
      return { command: 'files', summary: 'warning', files: [] };
    },
    async checkUrl() {
      throw new Error('Private network targets are blocked.');
    },
  });

  const files = await tools.get('check_discovery_files').handler({ url: 'https://example.com' });
  assert.equal(files.structuredContent.command, 'files');

  const failure = await tools.get('check_crawler_readability').handler({ url: 'http://127.0.0.1' });
  assert.equal(failure.isError, true);
  assert.match(failure.content[0].text, /Private network/);
  assert.equal(failure.structuredContent, undefined);
});
