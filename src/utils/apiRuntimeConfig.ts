export interface ApiRuntimeEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_STATIC_STANDALONE?: string;
}

export interface ApiRuntimeConfig {
  readonly apiBaseUrl: string;
  readonly apiOrigin: string | null;
  readonly hasExternalApiBase: boolean;
  readonly isStaticStandaloneWithoutApi: boolean;
}

/**
 * Normalizes `VITE_API_BASE_URL` and resolves whether the current build is a static-only
 * standalone host (e.g. GitHub Pages without an external Express API server).
 *
 * - Explicit `http://` / `https://` URLs enable remote server API calls even when
 *   `VITE_STATIC_STANDALONE === '1'`.
 * - Origin-only URLs (e.g. `https://api.example.com` or `https://api.example.com/`)
 *   automatically normalize to `<origin>/api` so `/vton/*` and `/auth/*` routes match
 *   the Express backend mount prefix (`/api`).
 * - Unsafe or malformed schemes (`javascript:`, `data:`, `ftp:`, etc.) are rejected and
 *   fall back safely to `'/api'`.
 */
export function resolveApiRuntimeConfig(
  env?: ApiRuntimeEnv | Record<string, string | undefined> | null
): ApiRuntimeConfig {
  const staticStandaloneFlag = String(env?.VITE_STATIC_STANDALONE || '').trim() === '1';
  const rawBase = String(env?.VITE_API_BASE_URL || '').trim();

  if (!rawBase) {
    return {
      apiBaseUrl: '/api',
      apiOrigin: null,
      hasExternalApiBase: false,
      isStaticStandaloneWithoutApi: staticStandaloneFlag,
    };
  }

  if (/^https?:\/\//i.test(rawBase)) {
    try {
      const parsed = new URL(rawBase);
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        !parsed.username &&
        !parsed.password
      ) {
        const cleanPath = parsed.pathname.replace(/\/+$/, '');
        const normalizedPath = cleanPath ? cleanPath : '/api';
        return {
          apiBaseUrl: `${parsed.origin}${normalizedPath}`,
          apiOrigin: parsed.origin,
          hasExternalApiBase: true,
          isStaticStandaloneWithoutApi: false,
        };
      }
    } catch {
      // Malformed URL falls through to safe relative default
    }
    return {
      apiBaseUrl: '/api',
      apiOrigin: null,
      hasExternalApiBase: false,
      isStaticStandaloneWithoutApi: staticStandaloneFlag,
    };
  }

  if (rawBase.startsWith('/') && !rawBase.startsWith('//')) {
    const cleanRelative = rawBase.replace(/\/+$/, '') || '/api';
    return {
      apiBaseUrl: cleanRelative,
      apiOrigin: null,
      hasExternalApiBase: false,
      isStaticStandaloneWithoutApi: staticStandaloneFlag,
    };
  }

  return {
    apiBaseUrl: '/api',
    apiOrigin: null,
    hasExternalApiBase: false,
    isStaticStandaloneWithoutApi: staticStandaloneFlag,
  };
}
