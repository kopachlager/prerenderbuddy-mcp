import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'prerenderbuddy-mcp-pack-'));

try {
  const output = execFileSync('npm', [
    'pack',
    '--json',
    '--pack-destination',
    temporaryDirectory,
  ], {
    encoding: 'utf8',
  });
  const [pack] = JSON.parse(output);
  const paths = pack.files.map((file) => file.path);
  const required = [
    'bin/prerenderbuddy-mcp.js',
    'src/index.js',
    'src/server.js',
    'src/tools.js',
    'src/workspace-client.js',
    'src/workspace-tools.js',
    'package.json',
    'README.md',
    'SECURITY.md',
    'LICENSE',
    'NOTICE',
  ];

  for (const path of required) {
    if (!paths.includes(path)) {
      throw new Error(`Package is missing ${path}`);
    }
  }

  for (const path of paths) {
    if (/^(?:test|tests|fixtures|scripts|\.github|coverage)\//.test(path)
      || /(?:^|\/)\.env(?:\.|$)|\.(?:tgz|pem|key)$/i.test(path)) {
      throw new Error(`Package unexpectedly includes ${path}`);
    }
  }

  const tarballPath = join(temporaryDirectory, pack.filename);
  execFileSync('npm', [
    'install',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    tarballPath,
  ], {
    cwd: temporaryDirectory,
    stdio: 'pipe',
  });

  const installedPackage = JSON.parse(readFileSync(
    join(temporaryDirectory, 'node_modules/@prerenderbuddy/mcp/package.json'),
    'utf8',
  ));
  if (installedPackage.version !== pack.version) {
    throw new Error(`Installed package version ${installedPackage.version} does not match ${pack.version}`);
  }

  const binaryPath = join(
    temporaryDirectory,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prerenderbuddy-mcp.cmd' : 'prerenderbuddy-mcp',
  );
  const transport = new StdioClientTransport({
    command: binaryPath,
    stderr: 'pipe',
  });
  const client = new Client({
    name: 'prerenderbuddy-mcp-package-check',
    version: '1.0.0',
  });

  await client.connect(transport);
  try {
    if (client.getServerVersion()?.version !== pack.version) {
      throw new Error('Installed MCP server version does not match the packed version');
    }
    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name);
    const expected = [
      'check_crawler_readability',
      'compare_http_responses',
      'check_discovery_files',
    ];
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      throw new Error(`Installed MCP server exposed unexpected tools: ${names.join(', ')}`);
    }
  } finally {
    await client.close();
  }

  process.stdout.write(
    `Package contents and installed MCP protocol verified: ${paths.length} files, ${pack.size} bytes\n`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
