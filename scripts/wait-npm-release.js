import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// npm publication can succeed before the public registry serves the new version.
// Wait for that exact artifact before asking the MCP Registry to validate it.
export async function waitForNpmRelease(pkg, {
  fetchImpl = fetch,
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  attempts = 12,
  delayMs = 10000,
} = {}) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response;
    try {
      response = await fetchImpl(url, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(10000) });
    } catch {
      if (attempt === attempts) throw new Error('npm registry was unreachable before MCP publication.');
    }
    if (response?.ok) {
      const published = await response.json();
      if (published.name !== pkg.name || published.version !== pkg.version || published.mcpName !== pkg.mcpName) {
        throw new Error('Published npm identity does not match the reviewed MCP release.');
      }
      return;
    }
    if (response && ![404, 429].includes(response.status) && response.status < 500) {
      throw new Error(`npm registry rejected the release check (${response.status}).`);
    }
    if (attempt < attempts) await sleep(delayMs);
  }
  throw new Error('The exact npm release is not public yet; retry MCP Registry publication later.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await waitForNpmRelease(JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')));
  console.log('Exact npm release is publicly available.');
}
