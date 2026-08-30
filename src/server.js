import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRequire } from 'node:module';
import { registerDiagnosticTools } from './tools.js';
import { registerWorkspaceTools } from './workspace-tools.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

export const SERVER_VERSION = packageJson.version;

export function createServer(options = {}) {
  const server = new McpServer({
    name: 'prerenderbuddy-mcp',
    version: SERVER_VERSION,
  });
  registerDiagnosticTools(server, options.diagnostics);
  registerWorkspaceTools(server, options.workspace);
  return server;
}

export async function startServer(options = {}) {
  const server = createServer(options);
  const transport = options.transport || new StdioServerTransport();
  await server.connect(transport);
  return server;
}
