/**
 * Ainvtry Offline-First Minigame Service Worker (`public/sw.js`)
 * Mirrors `site/public/sw.js` for standalone app / GitHub Pages / Express builds.
 */

const CACHE_NAME = 'ainvtry-minigame-offline-v1';
const EXCLUDED_SEGMENTS = ['/api', '/ir', '/uploads'];

function isExcludedPath(pathname) {
  return EXCLUDED_SEGMENTS.some(
    (seg) => pathname === seg || pathname.startsWith(`${seg}/`)
  );
}

function isMinigameNavigationPath(pathname) {
  return (
    pathname === '/minigame' ||
    pathname === '/minigame/' ||
    pathname === '/minigame/index.html' ||
    /\/minigame(?:\/|\/index\.html)?$/i.test(pathname)
  );
}

function extractAssetUrlsFromHtml(htmlText, baseUrl) {
  const urls = new Set();
  const attrRe = /(?:src|href)=["']([^"']+)["']/gi;
  let match;
  while ((match = attrRe.exec(htmlText)) !== null) {
    const raw = match[1];
    if (!raw || raw.startsWith('data:') || raw.startsWith('mailto:') || raw.startsWith('#')) {
      continue;
    }
    try {
      const resolved = new URL(raw, baseUrl);
      if (resolved.origin !== self.location.origin) continue;
      if (isExcludedPath(resolved.pathname)) continue;
      if (/\.(?:js|mjs|css|svg|png|webp|woff2?)$/i.test(resolved.pathname)) {
        urls.add(resolved.href);
      }
    } catch {
      // Ignore malformed relative hrefs
    }
  }
  return Array.from(urls);
}

async function warmMinigameCache(minigamePath = '/minigame/') {
  try {
    const cache = await caches.open(CACHE_NAME);
    const targetUrl = new URL(minigamePath, self.location.origin).href;
    const htmlRes = await fetch(targetUrl, {
      credentials: 'same-origin',
      cache: 'no-cache',
    });
    if (!htmlRes.ok) return;

    await cache.put(targetUrl, htmlRes.clone());
    if (targetUrl.endsWith('/minigame/')) {
      await cache.put(targetUrl.slice(0, -1), htmlRes.clone());
    }

    const htmlText = await htmlRes.text();
    const assetUrls = extractAssetUrlsFromHtml(htmlText, targetUrl);
    await Promise.allSettled(
      assetUrls.map(async (assetUrl) => {
        const res = await fetch(assetUrl, { credentials: 'same-origin' });
        if (res.ok) {
          await cache.put(assetUrl, res);
        }
      })
    );
  } catch {
    // Offline or transient failure during background pre-warm
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    warmMinigameCache(self.registration.scope + 'minigame/').then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('ainvtry-minigame-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'WARM_MINIGAME') {
    const path = typeof data.minigameUrl === 'string' ? data.minigameUrl : '/minigame/';
    event.waitUntil(warmMinigameCache(path));
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (isExcludedPath(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkRes) => {
          if (networkRes.ok && isMinigameNavigationPath(url.pathname)) {
            const copy = networkRes.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkRes;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const exact =
            (await cache.match(request, { ignoreVary: true })) ||
            (await cache.match(url.href, { ignoreVary: true }));
          if (exact) return exact;
          const fallback =
            (await cache.match(self.registration.scope + 'minigame/', { ignoreVary: true })) ||
            (await cache.match('/minigame/', { ignoreVary: true })) ||
            (await cache.match('/minigame', { ignoreVary: true }));
          if (fallback) return fallback;
          return new Response(
            '<!doctype html><html><body style="background:#070510;color:#fff;font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0"><div style="text-align:center"><h1>Offline</h1><p>Reconnect briefly to cache the 3D Apple Box minigame.</p></div></body></html>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.includes('/assets/') ||
    url.pathname.endsWith('/icon.svg') ||
    url.pathname.endsWith('.webmanifest')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached =
          (await cache.match(request, { ignoreVary: true })) ||
          (await cache.match(url.href, { ignoreVary: true }));
        if (cached) return cached;
        try {
          const networkRes = await fetch(request);
          if (networkRes.ok) {
            void cache.put(url.href, networkRes.clone());
          }
          return networkRes;
        } catch {
          return new Response('', { status: 504 });
        }
      })
    );
  }
});
