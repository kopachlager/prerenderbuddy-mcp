#!/usr/bin/env node

import { parseRuntimeOptions } from '../src/runtime-options.js';
import { startHttpServer } from '../src/http-server.js';
import { startServer } from '../src/server.js';

const options = parseRuntimeOptions();

const start = options.transport === 'http'
  ? startHttpServer(options)
  : startServer();

start.catch((error) => {
  process.stderr.write(`Prerender Buddy MCP failed: ${error?.message || 'Unknown error'}\n`);
  process.exitCode = 1;
});
