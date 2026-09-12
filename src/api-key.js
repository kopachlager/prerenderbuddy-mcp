import { timingSafeEqual } from 'node:crypto';
const PLACEHOLDER_PATTERN = /^\$\{[A-Z][A-Z0-9_]*\}$/;
const WORKSPACE_KEY_PATTERN = /^pb_(?:live|test)_[A-Za-z0-9_-]{8,}$/;

export function normalizeConfiguredApiKey(value) {
  const key = String(value ?? '').trim();
  if (!key || PLACEHOLDER_PATTERN.test(key)) return '';
  return key;
}

export function looksLikeWorkspaceApiKey(value) {
  return WORKSPACE_KEY_PATTERN.test(normalizeConfiguredApiKey(value));
}

export function bearerToken(headers = {}) {
  const authorization = String(headers.authorization || headers.Authorization || '');
  return authorization.match(/^Bearer\s+(\S+)/i)?.[1] || '';
}

export function requestWorkspaceApiKey(headers = {}, env = process.env) {
  const headerKey = normalizeConfiguredApiKey(headers['x-prerender-buddy-api-key']);
  const token = normalizeConfiguredApiKey(bearerToken(headers));
  const envKey = normalizeConfiguredApiKey(env.PRERENDER_BUDDY_API_KEY);
  if (looksLikeWorkspaceApiKey(headerKey)) return headerKey;
  if (looksLikeWorkspaceApiKey(token)) return token;
  if (looksLikeWorkspaceApiKey(envKey)) return envKey;
  return '';
}

export async function isAuthorizedHttpRequest(headers = {}, options = {}) {
  if (!options.requireAuth) return true;
  const token = normalizeConfiguredApiKey(bearerToken(headers))
    || normalizeConfiguredApiKey(headers['x-prerender-buddy-api-key']);
  if (!token) return false;
  if (options.sharedToken) {
    const expected = Buffer.from(options.sharedToken);
    const supplied = Buffer.from(token);
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return true;
  }
  if (!looksLikeWorkspaceApiKey(token) || !options.validateWorkspaceKey) return false;
  try { return await options.validateWorkspaceKey(token) === true; } catch { return false; }
}
