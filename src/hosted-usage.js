import { randomUUID } from 'node:crypto';

export const SIGNUP_SOURCES = ['mcp', 'chatgpt', 'claude', 'cursor', 'grok', 'glama', 'github'];
const ENDPOINT = 'https://api.prerenderbuddy.com/v1/internal/integration-usage';

// Explicitly enabled for PB's hosted HTTP service only. Stdio never constructs
// this reporter. Bounded, best-effort and independent of the caller's result.
export function createHostedUsageReporter({ enabled = false, token, fetchImpl = fetch } = {}) {
  if (!enabled || !token) return undefined;
  let pending = 0;
  return async event => {
    if (pending >= 20) return;
    pending++;
    try {
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(2000),
        headers: { 'content-type': 'application/json', 'x-mcp-usage-token': token },
        body: JSON.stringify(event),
      });
      await response.body?.cancel();
      if (!response.ok) process.stderr.write('Hosted usage event was not recorded.\n');
    } catch { process.stderr.write('Hosted usage event was not recorded.\n'); }
    finally { pending--; }
  };
}

export function emitUsage(report, event) {
  if (report) void Promise.resolve().then(() => report(event)).catch(() => {});
}

export function toolRegistrar(server, report) {
  if (!report) return server;
  return { registerTool(name, definition, handler) {
    return server.registerTool(name, definition, async (...args) => {
      const start = performance.now();
      let failed = true;
      try {
        const result = await handler(...args);
        failed = Boolean(result?.isError);
        return result;
      } finally {
        emitUsage(report, { eventId: randomUUID(), kind: 'tool_call', tool: name,
          outcome: failed ? 'failed' : 'completed',
          durationMs: Math.min(3_600_000, Math.max(0, Math.round(performance.now() - start))) });
      }
    });
  } };
}

export function signupDestination(source) {
  if (!SIGNUP_SOURCES.includes(source)) return null;
  const url = new URL('https://prerenderbuddy.com/');
  url.search = new URLSearchParams({ utm_source: source, utm_medium: 'integration', utm_campaign: 'pb_tools' }).toString();
  return url.toString();
}

export function isLinkPreview(headers) {
  return /prefetch|preview/i.test(String(headers.purpose || headers['sec-purpose'] || ''))
    || /bot|crawler|spider|slack|discord|telegram|facebookexternalhit|whatsapp|linkedin/i.test(String(headers['user-agent'] || ''));
}
