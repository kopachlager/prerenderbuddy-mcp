import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { createHttpServer } from '../src/http-server.js';
import { toolRegistrar, createHostedUsageReporter, signupDestination } from '../src/hosted-usage.js';

test('reporting preserves the exact result and thrown error even if reporting fails', async () => {
  const handlers = {}, reports = [];
  const registrar = toolRegistrar({ registerTool(name, definition, handler) { handlers[name] = handler; } }, event => { reports.push(event); throw Error('collector unavailable'); });
  const output = { structuredContent: { private: 'never recorded' } }, failure = new Error('unchanged');
  registrar.registerTool('good', {}, async () => output);
  registrar.registerTool('failed', {}, async () => ({ isError: true }));
  registrar.registerTool('thrown', {}, async () => { throw failure; });
  assert.equal(await handlers.good({ url: 'private' }), output);
  assert.deepEqual(await handlers.failed(), { isError: true });
  await assert.rejects(handlers.thrown(), error => error === failure);
  await Promise.resolve();
  assert.deepEqual(reports.map(x => x.outcome), ['completed', 'failed', 'failed']);
  assert.equal(JSON.stringify(reports).includes('private'), false);
  for (const event of reports) assert.deepEqual(Object.keys(event).sort(), ['durationMs', 'eventId', 'kind', 'outcome', 'tool']);
});

test('tool discovery and invalid inputs do not become tool calls', async t => {
  const events = [], server = createServer({ workspace: { enabled: false }, onToolUsage: event => events.push(event), diagnostics: { checkDiscoveryFiles: async () => ({ files: [] }) } });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'fixture', version: '1' });
  await server.connect(serverTransport); await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });
  await client.listTools(); assert.equal(events.length, 0);
  const invalid = await client.callTool({ name: 'check_discovery_files', arguments: {} });
  assert.equal(invalid.isError, true); assert.equal(events.length, 0);
  await client.callTool({ name: 'check_discovery_files', arguments: { url: 'https://fixture.example' } });
  assert.equal(events.length, 1); assert.equal(events[0].tool, 'check_discovery_files');
});

test('reporter is disabled by default, never follows redirects, and bounds concurrent delivery', async () => {
  assert.equal(createHostedUsageReporter({ token: 'fixture' }), undefined);
  assert.equal(createHostedUsageReporter({ enabled: true }), undefined);
  let requests = 0; const releases = [];
  const report = createHostedUsageReporter({ enabled: true, token: 'fixture', fetchImpl: async (url, init) => {
    requests++; assert.equal(url, 'https://api.prerenderbuddy.com/v1/internal/integration-usage');
    assert.equal(init.redirect, 'error'); assert.equal(init.headers['x-mcp-usage-token'], 'fixture');
    await new Promise(resolve => releases.push(resolve)); return new Response(null, { status: 204 });
  } });
  const pending = Array.from({ length: 30 }, () => report({ kind: 'link_open' }));
  assert.equal(requests, 20); releases.forEach(resolve => resolve()); await Promise.all(pending);
});

test('tagged links preserve redirects on collector failure and skip preview, HEAD and health requests', async t => {
  const events = [], server = createHttpServer({ usageReporter: event => { events.push(event); throw Error('unavailable'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (path, init = {}) => fetch(base + path, { redirect: 'manual', ...init });
  const response = await get('/go/chatgpt'); assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), signupDestination('chatgpt'));
  assert.equal(new URL(response.headers.get('location')).searchParams.get('utm_campaign'), 'pb_tools');
  await get('/go/claude', { method: 'HEAD' });
  await get('/go/claude', { headers: { 'user-agent': 'Twitterbot' } });
  await get('/go/claude', { headers: { purpose: 'prefetch' } });
  await get('/health');
  assert.equal((await get('/go/https://evil.example')).status, 404);
  assert.deepEqual(events.map(event => event.kind), ['link_open']);
  assert.equal(events[0].source, 'chatgpt');
});
