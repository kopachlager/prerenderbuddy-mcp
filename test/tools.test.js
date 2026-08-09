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

function assertCompleteTextFallback(result) {
  assert.equal(result.content.length, 1);
  assert.equal(result.content[0].type, 'text');
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
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

test('all tools declare URL input validation with Zod', () => {
  const tools = captureTools({});
  for (const { definition } of tools.values()) {
    assert.equal(typeof definition.inputSchema.url.safeParse, 'function');
    assert.equal(definition.inputSchema.url.safeParse('https://example.com').success, true);
    assert.equal(definition.inputSchema.url.safeParse('').success, false);
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
  assertCompleteTextFallback(result);
  assert.equal(JSON.parse(result.content[0].text).html.title, 'Example');
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
  assertCompleteTextFallback(result);
  assert.equal(
    JSON.parse(result.content[0].text).comparisonMode,
    'http-user-agent-responses',
  );
});

test('discovery findings remain complete in structured and text results', async () => {
  const finding = {
    severity: 'warning',
    code: 'invalid_sitemap_urls',
    message: 'One sitemap entry is invalid.',
  };
  const tools = captureTools({
    async checkDiscoveryFiles() {
      return {
        command: 'files',
        summary: 'warning',
        files: [{
          name: 'sitemap.xml',
          issues: [finding],
        }],
        issues: [finding],
      };
    },
  });

  const result = await tools.get('check_discovery_files').handler({
    url: 'https://example.com',
  });
  assert.equal(result.structuredContent.command, 'files');
  assertCompleteTextFallback(result);
  const textResult = JSON.parse(result.content[0].text);
  assert.deepEqual(textResult.issues, [finding]);
  assert.deepEqual(textResult.files[0].issues, [finding]);
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

test('every tool handler catches execution errors', async () => {
  const failure = new Error('The upstream request failed.');
  const tools = captureTools({
    async checkUrl() {
      throw failure;
    },
    async compareUrl() {
      throw failure;
    },
    async checkDiscoveryFiles() {
      throw failure;
    },
  });

  for (const name of TOOL_NAMES) {
    const result = await tools.get(name).handler({ url: 'https://example.com' });
    assert.equal(result.isError, true);
    assert.deepEqual(result.structuredContent.error, {
      code: 'request_failed',
      message: 'The upstream request failed.',
    });
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
