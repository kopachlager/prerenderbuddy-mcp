import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForNpmRelease } from '../scripts/wait-npm-release.js';

const pkg = { name: '@prerenderbuddy/mcp', version: '0.4.0', mcpName: 'io.github.kopachlager/prerenderbuddy-mcp' };

test('registry publication waits for the exact npm artifact after propagation delays', async () => {
  const responses = [new Response('', { status: 404 }), new Response('', { status: 503 }), Response.json(pkg)];
  let calls = 0;
  const waits = [];
  await waitForNpmRelease(pkg, { attempts: 3, delayMs: 7, sleep: async ms => waits.push(ms), fetchImpl: async url => {
    assert.equal(url, 'https://registry.npmjs.org/%40prerenderbuddy%2Fmcp/0.4.0');
    calls++;
    return responses.shift();
  } });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [7, 7]);
});

test('registry publication fails closed for a mismatched artifact or permanent HTTP error', async () => {
  await assert.rejects(waitForNpmRelease(pkg, { fetchImpl: async () => Response.json({ ...pkg, version: '0.3.3' }) }), /identity/);
  await assert.rejects(waitForNpmRelease(pkg, { fetchImpl: async () => new Response('', { status: 403 }) }), /403/);
});

test('registry publication bounds retries for missing releases and network failures', async () => {
  for (const fetchImpl of [async () => new Response('', { status: 404 }), async () => { throw new Error('network'); }]) {
    let waits = 0;
    await assert.rejects(waitForNpmRelease(pkg, { attempts: 2, fetchImpl, sleep: async () => { waits++; } }), /not public|unreachable/);
    assert.equal(waits, 1);
  }
});
