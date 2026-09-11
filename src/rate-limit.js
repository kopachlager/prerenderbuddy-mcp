export function createRateLimiter({ windowMs = 60_000, max = 30 } = {}) {
  const hits = new Map();

  return {
    allow(key) {
      const now = Date.now();
      const recent = (hits.get(key) || []).filter((stamp) => now - stamp < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}

export function clientKey(req, token = '') {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || 'unknown';
  return token ? `${ip}:${token.slice(0, 12)}` : ip;
}
