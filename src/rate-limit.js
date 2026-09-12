import { createHash } from 'node:crypto';

// Fixed windows with bounded storage; new identities fail closed at capacity.
export function createRateLimiter({ windowMs = 60_000, max = 30, maxKeys = 10_000, now = Date.now } = {}) {
  const hits = new Map();
  return {
    allow(key) {
      const time = now();
      for (const [id, entry] of hits) if (entry.expires <= time) hits.delete(id);
      let entry = hits.get(key);
      if (!entry) {
        if (hits.size >= maxKeys) return false;
        entry = { count: 0, expires: time + windowMs };
        hits.set(key, entry);
      }
      if (entry.count >= max) return false;
      entry.count += 1;
      return true;
    },
  };
}

// Never trust arbitrary forwarded headers. Proxy traffic intentionally shares
// the conservative ingress budget; authenticated callers also get their own cap.
export function clientKey(req) {
  return req.socket?.remoteAddress || 'unknown';
}
export function credentialKey(token) {
  return createHash('sha256').update(token).digest('hex');
}
