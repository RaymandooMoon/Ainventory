import zlib from 'node:zlib';

const DEFAULT_THRESHOLD_BYTES = 1536;

/**
 * Zero-dependency Express middleware that gzip-compresses JSON API payloads
 * above the threshold when the client advertises `Accept-Encoding: gzip`.
 * Shrinks `/api/garments?closet=sample` (~298 KB) to ~34 KB over mobile links.
 */
export function createJsonGzipMiddleware(options = {}) {
  const thresholdBytes =
    typeof options.thresholdBytes === 'number' && options.thresholdBytes >= 0
      ? options.thresholdBytes
      : DEFAULT_THRESHOLD_BYTES;

  return function jsonGzipMiddleware(req, res, next) {
    const acceptEncoding = String(req.headers?.['accept-encoding'] || '').toLowerCase();
    if (!acceptEncoding.includes('gzip') || req.method === 'HEAD') {
      next();
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = function compressedJson(body) {
      if (res.headersSent || res.getHeader('Content-Encoding')) {
        return originalJson(body);
      }
      let serialized;
      try {
        serialized = JSON.stringify(body);
      } catch {
        return originalJson(body);
      }
      if (typeof serialized !== 'string') {
        return originalJson(body);
      }
      const rawBuf = Buffer.from(serialized, 'utf8');
      if (rawBuf.length < thresholdBytes) {
        return originalJson(body);
      }
      try {
        const compressed = zlib.gzipSync(rawBuf, { level: zlib.constants.Z_BEST_SPEED });
        if (compressed.length >= rawBuf.length) {
          return originalJson(body);
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.setHeader('Content-Length', String(compressed.length));
        return res.send(compressed);
      } catch {
        return originalJson(body);
      }
    };

    next();
  };
}
