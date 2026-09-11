import { normalizeConfiguredApiKey } from './api-key.js';

function flagValue(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function booleanEnv(value, fallback) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function integerEnv(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(number)));
}

function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

export function parseRuntimeOptions(argv = process.argv.slice(2), env = process.env) {
  const transport = argv.includes('--http') || String(env.MCP_TRANSPORT || '').trim() === 'http'
    ? 'http'
    : 'stdio';
  const host = String(flagValue(argv, '--host') || env.HOST || '127.0.0.1').trim() || '127.0.0.1';
  const port = integerEnv(flagValue(argv, '--port') || env.PORT, 8787, 1, 65535);
  const path = String(flagValue(argv, '--path') || env.MCP_HTTP_PATH || '/mcp').trim() || '/mcp';
  const requireAuthDefault = transport === 'http' && !isLoopbackHost(host);
  const sharedToken = normalizeConfiguredApiKey(env.MCP_HTTP_SHARED_TOKEN);

  return {
    transport,
    host,
    port,
    path: path.startsWith('/') ? path : `/${path}`,
    requireAuth: booleanEnv(env.MCP_HTTP_REQUIRE_AUTH, requireAuthDefault),
    sharedToken,
    rateLimitMax: integerEnv(env.MCP_HTTP_RATE_LIMIT_MAX, 30, 1, 1000),
    rateLimitWindowMs: integerEnv(env.MCP_HTTP_RATE_LIMIT_WINDOW_MS, 60_000, 1000, 3_600_000),
  };
}
