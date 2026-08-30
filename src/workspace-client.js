const DEFAULT_API_BASE_URL = 'https://api.prerenderbuddy.com';
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_BYTES = 2_000_000;

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, Math.trunc(number))) : fallback;
}

function apiBaseUrl(value) {
  const parsed = new URL(value || DEFAULT_API_BASE_URL);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Prerender Buddy API base URL must use HTTP or HTTPS.');
  parsed.pathname = parsed.pathname.replace(/\/$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed;
}

function safeErrorMessage(value, fallback) {
  const message = String(value || '').trim();
  if (!message || /pb_live_|authorization|bearer/i.test(message)) return fallback;
  return message.slice(0, 500);
}

export class WorkspaceApiError extends Error {
  constructor(message, { status = null, code = 'workspace_request_failed', requestId = null } = {}) {
    super(message);
    this.name = 'WorkspaceApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function createWorkspaceApiClient(options = {}) {
  const apiKey = String(options.apiKey ?? process.env.PRERENDER_BUDDY_API_KEY ?? '').trim();
  const baseUrl = apiBaseUrl(options.baseUrl ?? process.env.PRERENDER_BUDDY_API_BASE_URL);
  const timeoutMs = boundedInteger(
    options.timeoutMs ?? process.env.PRERENDER_BUDDY_API_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    1000,
    60000,
  );
  const maxBytes = boundedInteger(options.maxBytes, DEFAULT_MAX_BYTES, 10000, 5_000_000);
  const fetchFn = options.fetchFn || fetch;

  return {
    enabled: Boolean(apiKey),
    async get(path, query = {}) {
      if (!apiKey) throw new WorkspaceApiError('Add PRERENDER_BUDDY_API_KEY to use workspace tools.', {
        code: 'workspace_auth_not_configured',
      });
      const target = new URL(path, `${baseUrl.toString().replace(/\/$/, '')}/`);
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== '') target.searchParams.set(key, String(value));
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response;
      try {
        response = await fetchFn(target, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            'User-Agent': 'PrerenderBuddyMCP/0.2',
          },
          signal: controller.signal,
        });
      } catch (error) {
        const timedOut = error?.name === 'AbortError';
        throw new WorkspaceApiError(timedOut ? 'Prerender Buddy API request timed out.' : 'Prerender Buddy API request failed.', {
          code: timedOut ? 'workspace_timeout' : 'workspace_request_failed',
        });
      } finally {
        clearTimeout(timer);
      }
      const declaredBytes = Number(response.headers.get('content-length')) || 0;
      if (declaredBytes > maxBytes) {
        throw new WorkspaceApiError('Prerender Buddy API response exceeded the local MCP size limit.', {
          status: response.status,
          code: 'workspace_response_too_large',
        });
      }
      const body = await response.arrayBuffer();
      if (body.byteLength > maxBytes) {
        throw new WorkspaceApiError('Prerender Buddy API response exceeded the local MCP size limit.', {
          status: response.status,
          code: 'workspace_response_too_large',
        });
      }
      let data = {};
      try {
        data = JSON.parse(new TextDecoder().decode(body) || '{}');
      } catch {
        throw new WorkspaceApiError('Prerender Buddy API returned an invalid response.', {
          status: response.status,
          code: 'workspace_invalid_response',
        });
      }
      if (!response.ok) {
        throw new WorkspaceApiError(
          safeErrorMessage(data?.error?.message || data?.error, `Prerender Buddy API returned status ${response.status}.`),
          {
            status: response.status,
            code: data?.error?.code || 'workspace_request_failed',
            requestId: data?.requestId || null,
          },
        );
      }
      return data;
    },
  };
}
