import assert from 'node:assert/strict';
import test from 'node:test';
import {
  registerDiagnosticTools,
  TOOL_ANNOTATIONS,
  TOOL_NAMES,
} from '../src/tools.js';

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

test('all tools declare read-only, idempotent, open-world annotations', () => {
  const tools = captureTools({});
  for (const { definition } of tools.values()) {
    assert.deepEqual(definition.annotations, TOOL_ANNOTATIONS);
    assert.equal(definition.annotations.readOnlyHint, true);
    assert.equal(definition.annotations.destructiveHint, false);
    assert.equal(definition.annotations.idempotentHint, true);
    assert.equal(definition.annotations.openWorldHint, true);
  }
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
  const textContent = JSON.parse(result.content[0].text);
  assert.equal(textContent.command, 'check');
  assert.match(textContent.message, /structuredContent/);
  assert.equal(textContent.html, undefined);
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

test('discovery checks use MCP-compatible structured results', async () => {
  const tools = captureTools({
    async checkDiscoveryFiles() {
      return { command: 'files', summary: 'warning', files: [] };
    },
  });

  const files = await tools.get('check_discovery_files').handler({ url: 'https://example.com' });
  assert.equal(files.structuredContent.command, 'files');
});

test('execution errors include stable structured codes and safe messages', async () => {
  const cases = [
    ['Only http and https URLs can be checked.', 'unsafe_target'],
    ['Request timed out after 1000 ms.', 'timeout'],
    ['A public URL is required.', 'invalid_input'],
    ['The upstream request failed.', 'request_failed'],
  ];

  for (const [message, code] of cases) {
    const tools = captureTools({
      async checkUrl() {
        throw new Error(message);
      },
    });
    const failure = await tools.get('check_crawler_readability').handler({
      url: 'https://example.com',
    });

    assert.equal(failure.isError, true);
    assert.equal(failure.structuredContent.summary, 'error');
    assert.deepEqual(failure.structuredContent.error, { code, message });
    assert.match(failure.structuredContent.mcpSafetyNote, /untrusted data/);
    assert.equal(failure.content[0].text, `${code}: ${message}`);
    assert.doesNotMatch(failure.content[0].text, /\n\s+at |file:\/\//);
  }
});

test('unexpected errors do not expose local paths', async () => {
  const tools = captureTools({
    async checkUrl() {
      throw new Error('ENOENT: open /Users/example/private-config.json');
    },
  });
  const failure = await tools.get('check_crawler_readability').handler({
    url: 'https://example.com',
  });

  assert.equal(failure.isError, true);
  assert.deepEqual(failure.structuredContent.error, {
    code: 'internal_error',
    message: 'Diagnostic failed.',
  });
  assert.doesNotMatch(JSON.stringify(failure), /Users|private-config/);
});
