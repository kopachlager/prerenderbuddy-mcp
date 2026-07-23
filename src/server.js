import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerDiagnosticTools } from './tools.js';

export function createServer(options = {}) {
  const server = new McpServer({
    name: 'prerenderbuddy-mcp',
    version: '0.1.0',
  });
  return registerDiagnosticTools(server, options.diagnostics);
}

export async function startServer(options = {}) {
  const server = createServer(options);
  const transport = options.transport || new StdioServerTransport();
  await server.connect(transport);
  return server;
}
