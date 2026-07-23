import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { SERVER_VERSION } from '../src/server.js';

const ciWorkflowPath = new URL('../.github/workflows/ci.yml', import.meta.url);
const workflowPath = new URL('../.github/workflows/publish.yml', import.meta.url);
const packagePath = new URL('../package.json', import.meta.url);
const lockPath = new URL('../package-lock.json', import.meta.url);

test('release workflow is restricted and uses trusted publishing', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /release:\s*\n\s+types: \[published\]/);
  assert.doesNotMatch(workflow, /pull_request:/);
  assert.match(workflow, /github\.repository == 'kopachlager\/prerenderbuddy-mcp'/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run test:coverage/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm run pack:check/);
  assert.match(workflow, /GITHUB_REF_NAME#v/);
  assert.match(workflow, /npm publish --provenance --access public/);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/);
});

test('GitHub Actions use immutable action commit SHAs', async () => {
  for (const path of [ciWorkflowPath, workflowPath]) {
    const workflow = await readFile(path, 'utf8');
    assert.match(workflow, /actions\/checkout@[0-9a-f]{40} # v\d+/);
    assert.match(workflow, /actions\/setup-node@[0-9a-f]{40} # v\d+/);
    assert.doesNotMatch(workflow, /actions\/(?:checkout|setup-node)@v\d+/);
  }
});

test('package, lockfile, and MCP server versions are synchronized', async () => {
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  const packageLock = JSON.parse(await readFile(lockPath, 'utf8'));

  assert.match(packageJson.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[''].version, packageJson.version);
  assert.equal(SERVER_VERSION, packageJson.version);
});

test('package entry points exist and the CLI dependency is explicit', async () => {
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  const binaryPath = new URL(`../${packageJson.bin['prerenderbuddy-mcp']}`, import.meta.url);
  const exportPath = new URL(`../${packageJson.exports['.']}`, import.meta.url);

  await access(binaryPath);
  await access(exportPath);
  const binaryStat = await stat(binaryPath);
  assert.ok(binaryStat.mode & 0o111, 'package binary must be executable');
  assert.equal(packageJson.dependencies['@prerenderbuddy/cli'], '0.1.3');
});
