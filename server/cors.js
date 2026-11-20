const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Authorization, Content-Type, X-Demo-Mode, X-Profile-Key';

/**
 * Parses a comma-separated list of explicit HTTP(S) origins (e.g. `CORS_ALLOWED_ORIGINS`)
 * into a deduplicated Set of canonical origin strings (`scheme://host[:port]`).
 * Invalid entries or non-HTTP(S) schemes are ignored.
 */
export function parseAllowedOrigins(rawOrigins) {
  const allowed = new Set();
  const list = Array.isArray(rawOrigins)
    ? rawOrigins
    : String(rawOrigins || '').split(',');

  for (const entry of list) {
    const trimmed = String(entry || '').trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        allowed.add(parsed.origin);
      }
    } catch {
      // Ignore malformed origin entries
    }
  }
  return allowed;
}

/**
 * Strict allowlist CORS middleware for Express `/api` routes so external static frontends
 * (such as GitHub Pages connected via `VITE_API_BASE_URL`) can invoke server-side VTON & API
 * endpoints without exposing Gemini API keys in client bundles.
 */
export function createCorsMiddleware(options = {}) {
  const rawAllowed =
    options.allowedOrigins !== undefined
      ? options.allowedOrigins
      : process.env.CORS_ALLOWED_ORIGINS || '';
  const allowedSet = parseAllowedOrigins(rawAllowed);
  const allowedMethods =
    typeof options.methods === 'string' && options.methods.trim()
      ? options.methods.trim()
      : ALLOWED_METHODS;

  return function corsMiddleware(req, res, next) {
    if (allowedSet.size > 0) {
      res.append('Vary', 'Origin');
    }

    const originHeader = String(req.headers?.origin || '').trim();
    const isAllowedOrigin = Boolean(originHeader && allowedSet.has(originHeader));

    if (isAllowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', originHeader);
      res.setHeader('Access-Control-Allow-Methods', allowedMethods);
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.setHeader('Access-Control-Max-Age', '86400');
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}
