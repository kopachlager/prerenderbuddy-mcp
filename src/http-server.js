import { createServer as createNodeServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  isAuthorizedHttpRequest,
  requestWorkspaceApiKey,
  bearerToken,
  normalizeConfiguredApiKey,
} from './api-key.js';
import { createRateLimiter, clientKey } from './rate-limit.js';
import { createServer, SERVER_VERSION } from './server.js';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function sendJson(res, status, body) {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(body));
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-allow-headers': 'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id, X-Prerender-Buddy-Api-Key',
    'access-control-max-age': '86400',
  };
}

function applyCors(res) {
  for (const [name, value] of Object.entries(corsHeaders())) {
    res.setHeader(name, value);
  }
}

function requestPath(req) {
  try {
    return decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
  } catch {
    return '/';
  }
}

export function createHttpListener(options = {}) {
  const path = options.path || '/mcp';
  const requireAuth = Boolean(options.requireAuth);
  const sharedToken = normalizeConfiguredApiKey(options.sharedToken);
  const limiter = options.limiter || createRateLimiter({
    windowMs: options.rateLimitWindowMs,
    max: options.rateLimitMax,
  });
  const env = options.env || process.env;

  return async function handleRequest(req, res) {
    applyCors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const pathname = requestPath(req);
    if (pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        name: 'prerenderbuddy-mcp',
        version: SERVER_VERSION,
        transport: 'http',
      });
      return;
    }

    if (pathname !== path) {
      sendJson(res, 404, {
        error: { code: 'not_found', message: 'Use /health or the configured MCP path.' },
      });
      return;
    }

    const token = normalizeConfiguredApiKey(bearerToken(req.headers))
      || normalizeConfiguredApiKey(req.headers['x-prerender-buddy-api-key']);
    if (!limiter.allow(clientKey(req, token))) {
      sendJson(res, 429, {
        error: { code: 'rate_limited', message: 'Too many MCP requests. Retry after the rate-limit window.' },
      });
      return;
    }

    if (!isAuthorizedHttpRequest(req.headers, { requireAuth, sharedToken })) {
      res.setHeader('www-authenticate', 'Bearer');
      sendJson(res, 401, {
        error: {
          code: 'unauthorized',
          message: 'Provide a Bearer token: a Prerender Buddy API key, or the configured shared connector token.',
        },
      });
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    const server = createServer({
      diagnostics: options.diagnostics,
      workspace: {
        apiKey: requestWorkspaceApiKey(req.headers, env),
      },
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: { code: 'internal_error', message: 'MCP request failed.' },
        });
      }
      await Promise.allSettled([transport.close(), server.close()]);
    }
    res.on('close', () => {
      Promise.allSettled([transport.close(), server.close()]).catch(() => {});
    });
  };
}

export function createHttpServer(options = {}) {
  return createNodeServer(createHttpListener(options));
}

export function startHttpServer(options = {}) {
  const host = options.host || '127.0.0.1';
  const port = options.port ?? 8787;
  const path = options.path || '/mcp';
  const server = createHttpServer(options);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      process.stderr.write(`Prerender Buddy MCP HTTP listening on http://${host}:${port}${path}\n`);
      resolve(server);
    });
  });
}
