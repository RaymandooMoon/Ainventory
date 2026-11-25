import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import App from '../App.jsx';
import { setStoredLang } from '../utils/i18n.ts';
import { applyThemePreference } from '../utils/nativeBridge.ts';
import type { SiteLang, SiteTheme } from './siteContent.ts';

export type LiveAppScreenId = 'outfits' | 'closet' | 'stats' | 'profile';

export interface LiveAppSyncFromParentPayload {
  readonly type: 'ainvtry-live-app-sync';
  readonly screen?: LiveAppScreenId;
  readonly lang?: SiteLang;
  readonly theme?: SiteTheme;
  readonly mood?: 'luxury' | 'aurora';
}

export interface LiveAppScreenNotifyPayload {
  readonly type: 'ainvtry-live-app-screen';
  readonly screen: LiveAppScreenId;
}

// Mark embedded runtime BEFORE App mounts so api.ts keeps site_demo session tokens in memory only
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__AINVTRY_LIVE_EMBED__ = true;

  const params = new URLSearchParams(window.location.search);
  const initialLang = params.get('lang');
  if (initialLang === 'ko' || initialLang === 'en') {
    setStoredLang(initialLang);
  }
  const initialTheme = params.get('theme');
  if (initialTheme === 'dark' || initialTheme === 'light') {
    applyThemePreference(initialTheme);
  }

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as Partial<LiveAppSyncFromParentPayload> | null;
    if (!data || data.type !== 'ainvtry-live-app-sync') return;
    window.dispatchEvent(
      new CustomEvent('ainvtry:embed-sync', {
        detail: {
          screen: data.screen,
          lang: data.lang,
          theme: data.theme,
          mood: data.mood,
        },
      })
    );
  });
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
