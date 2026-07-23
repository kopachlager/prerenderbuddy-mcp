import { execFileSync } from 'node:child_process';

const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
});
const [pack] = JSON.parse(output);
const paths = pack.files.map((file) => file.path);
const required = [
  'bin/prerenderbuddy-mcp.js',
  'src/index.js',
  'src/server.js',
  'src/tools.js',
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
  if (/^(?:test|scripts|\.github)\//.test(path)) {
    throw new Error(`Package unexpectedly includes ${path}`);
  }
}

process.stdout.write(`Package contents verified: ${paths.length} files, ${pack.size} bytes\n`);
