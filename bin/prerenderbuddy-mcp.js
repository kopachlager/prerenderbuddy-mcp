#!/usr/bin/env node

import { startServer } from '../src/server.js';

startServer().catch((error) => {
  process.stderr.write(`Prerender Buddy MCP failed: ${error?.message || 'Unknown error'}\n`);
  process.exitCode = 1;
});
