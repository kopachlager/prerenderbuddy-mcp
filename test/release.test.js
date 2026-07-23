import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../.github/workflows/publish.yml', import.meta.url);
const packagePath = new URL('../package.json', import.meta.url);

test('release workflow is restricted and uses trusted publishing', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /release:\s*\n\s+types: \[published\]/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /github\.repository == 'kopachlager\/prerenderbuddy-mcp'/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm run pack:check/);
  assert.match(workflow, /GITHUB_REF_NAME#v/);
  assert.match(workflow, /npm publish --provenance --access public/);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/);
});

test('release version is 0.1.1', async () => {
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  assert.equal(packageJson.version, '0.1.1');
});
