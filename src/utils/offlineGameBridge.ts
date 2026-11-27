export type ConnectionHealth = 'online' | 'poor' | 'offline';

interface NetworkInformationLike {
  readonly effectiveType?: string;
  readonly rtt?: number;
  readonly downlink?: number;
  readonly saveData?: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

interface NavigatorWithConnection extends Navigator {
  readonly connection?: NetworkInformationLike;
}

export function evaluateConnectionHealth(
  onLine: boolean,
  conn?: NetworkInformationLike | null
): ConnectionHealth {
  if (!onLine) return 'offline';
  if (conn) {
    const et = String(conn.effectiveType || '').toLowerCase();
    if (et === 'slow-2g' || et === '2g') return 'poor';
    if (typeof conn.rtt === 'number' && conn.rtt >= 1800) return 'poor';
    if (typeof conn.downlink === 'number' && conn.downlink > 0 && conn.downlink <= 0.15) {
      return 'poor';
    }
  }
  return 'online';
}

export function resolveMinigamePath(): string {
  if (typeof window === 'undefined') return '/minigame/';
  const pathname = window.location.pathname || '/';
  // Preserve GitHub Pages `/Ainventory/` subpath if deployed under a prefix
  if (pathname.startsWith('/Ainventory/')) {
    return '/Ainventory/minigame/';
  }
  return '/minigame/';
}

export function resolveServiceWorkerPath(): string {
  if (typeof window === 'undefined') return '/sw.js';
  const pathname = window.location.pathname || '/';
  if (pathname.startsWith('/Ainventory/')) {
    return '/Ainventory/sw.js';
  }
  return '/sw.js';
}

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * Registers the offline-first Service Worker (`/sw.js`) and asks it to pre-cache
 * the `/minigame` HTML shell + JS/CSS chunks so the 3D Apple Game launches even when
 * the user goes completely offline later (just like Chrome Dino / Edge Surf).
 */
export function registerOfflineMinigameServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return Promise.resolve(null);
  }
  if (!('serviceWorker' in navigator)) {
    return Promise.resolve(null);
  }
  const isSecureContext =
    window.isSecureContext ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  if (!isSecureContext) {
    return Promise.resolve(null);
  }

  if (!swRegistrationPromise) {
    const swUrl = resolveServiceWorkerPath();
    const scope = swUrl.replace(/sw\.js$/, '');
    swRegistrationPromise = navigator.serviceWorker
      .register(swUrl, { scope })
      .then((reg) => {
        const triggerWarm = () => {
          const target = reg.active || reg.waiting || reg.installing;
          if (target) {
            try {
              target.postMessage({
                type: 'WARM_MINIGAME',
                minigameUrl: resolveMinigamePath(),
              });
            } catch {
              // Ignore messaging failures during install transitions
            }
          }
        };
        triggerWarm();
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'activated') {
              triggerWarm();
            }
          });
        });
        return reg;
      })
      .catch(() => null);
  }

  return swRegistrationPromise;
}

export function subscribeConnectionHealth(
  listener: (health: ConnectionHealth) => void
): () => void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return () => {};
  }
  const nav = navigator as NavigatorWithConnection;
  const emit = () => {
    listener(evaluateConnectionHealth(navigator.onLine !== false, nav.connection));
  };

  const onOffline = () => listener('offline');
  const onOnline = () => emit();

  window.addEventListener('offline', onOffline);
  window.addEventListener('online', onOnline);
  nav.connection?.addEventListener?.('change', emit);

  emit();

  return () => {
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('online', onOnline);
    nav.connection?.removeEventListener?.('change', emit);
  };
}
