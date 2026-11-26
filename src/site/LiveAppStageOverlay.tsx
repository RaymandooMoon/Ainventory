import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LiveAppScreenId,
  LiveAppScreenNotifyPayload,
  LiveAppSyncFromParentPayload,
} from './liveAppEmbed.tsx';
import type { SiteLang, SiteTheme } from './siteContent.ts';

export interface LiveAppStageOverlayProps {
  readonly screen: LiveAppScreenId;
  readonly lang: SiteLang;
  readonly theme: SiteTheme;
  readonly mood?: 'luxury' | 'aurora';
  readonly isSheetExpanded: boolean;
  readonly isVisible?: boolean;
  readonly fullStudio?: boolean;
  readonly onSelectScreen?: (screen: LiveAppScreenId) => void;
}

const BEZEL_PADDING_PX = 5;
const MIN_LOGICAL_WIDTH = 360;
const MAX_DESKTOP_APP_WIDTH = 980;

interface FrameGeometry {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly scaledWidth: number;
  readonly scaledHeight: number;
  readonly scale: number;
  readonly showIsland: boolean;
}

const DEFAULT_GEOMETRY: FrameGeometry = {
  logicalWidth: 390,
  logicalHeight: 560,
  scaledWidth: 390,
  scaledHeight: 560,
  scale: 1,
  showIsland: true,
};

const TRUSTED_SITE_ORIGINS = new Set(['https://ainvtry.com', 'https://www.ainvtry.com']);

function isTrustedEmbedOrigin(origin: string): boolean {
  if (typeof window === 'undefined') return false;
  if (origin === window.location.origin) return true;
  return TRUSTED_SITE_ORIGINS.has(window.location.origin) && TRUSTED_SITE_ORIGINS.has(origin);
}

/**
 * Interactive showcase frame hosting the real in-development Ainventory live application
 * (`/app.html?embed=1&auth=1&auth_stage=auth`) starting from the authentic LoginView screen,
 * maximized to fill the full showcase stage above the bottom description drawer.
 */
export default function LiveAppStageOverlay({
  screen,
  lang,
  theme,
  mood = 'luxury',
  isSheetExpanded,
  isVisible = true,
  fullStudio = false,
  onSelectScreen,
}: LiveAppStageOverlayProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [geom, setGeom] = useState<FrameGeometry>(DEFAULT_GEOMETRY);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // Boot the real live app on LoginView auth stage; subsequent theme/lang/mood/tab sync uses postMessage
  const [initialSrc] = useState<string>(() => {
    const params = new URLSearchParams({
      embed: '1',
      auth: '1',
      auth_stage: 'auth',
      lang,
      theme,
      login_motion: mood,
    });
    return `/app.html?${params.toString()}`;
  });

  const latestSyncRef = useRef<{
    screen: LiveAppScreenId;
    lang: SiteLang;
    theme: SiteTheme;
    mood: 'luxury' | 'aurora';
    visible: boolean;
  }>({ screen, lang, theme, mood, visible: isVisible });
  const lastSyncedScreenRef = useRef<LiveAppScreenId>(screen);

  useEffect(() => {
    latestSyncRef.current = { screen, lang, theme, mood, visible: isVisible };
  }, [screen, lang, theme, mood, isVisible]);

  const postSyncToIframe = useCallback((includeScreen = false) => {
    const targetWindow = iframeRef.current?.contentWindow;
    if (!targetWindow || typeof window === 'undefined') return;
    const {
      screen: nextScreen,
      lang: nextLang,
      theme: nextTheme,
      mood: nextMood,
      visible: nextVisible,
    } = latestSyncRef.current;
    const payload: LiveAppSyncFromParentPayload = {
      type: 'ainvtry-live-app-sync',
      ...(includeScreen ? { screen: nextScreen } : {}),
      lang: nextLang,
      theme: nextTheme,
      mood: nextMood,
      visible: nextVisible,
    };
    const targets = TRUSTED_SITE_ORIGINS.has(window.location.origin)
      ? Array.from(TRUSTED_SITE_ORIGINS)
      : [window.location.origin];
    for (const targetOrigin of targets) {
      try {
        targetWindow.postMessage(payload, targetOrigin);
      } catch {
        // Ignore cross-subdomain target mismatch; matching origin succeeds
      }
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const screenChangedExternally = screen !== lastSyncedScreenRef.current;
    if (screenChangedExternally) {
      lastSyncedScreenRef.current = screen;
    }
    postSyncToIframe(screenChangedExternally);
  }, [isLoaded, isVisible, screen, lang, theme, mood, postSyncToIframe]);

  // Defensive ready fallback for Safari cached/bfcache iframes where onLoad may lag or skip
  useEffect(() => {
    if (isLoaded || typeof window === 'undefined') return undefined;
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc && doc.readyState === 'complete' && doc.getElementById('root')?.childElementCount) {
        setIsLoaded(true);
        postSyncToIframe(false);
        return undefined;
      }
    } catch {
      // Ignore cross-origin frame access errors
    }
    const safetyTimer = window.setTimeout(() => {
      setIsLoaded(true);
      postSyncToIframe(false);
    }, 3200);
    return () => window.clearTimeout(safetyTimer);
  }, [isLoaded, postSyncToIframe]);

  // Listen for ready handshake and tab changes initiated directly inside the real live app frame
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedEmbedOrigin(event.origin)) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as Partial<LiveAppScreenNotifyPayload> | { type?: string } | null;
      if (!data) return;
      if (data.type === 'ainvtry-live-app-ready') {
        setIsLoaded(true);
        postSyncToIframe(false);
        return;
      }
      if (data.type !== 'ainvtry-live-app-screen' || !onSelectScreen) return;
      const screenVal = (data as Partial<LiveAppScreenNotifyPayload>).screen;
      if (
        screenVal === 'outfits' ||
        screenVal === 'closet' ||
        screenVal === 'calendar' ||
        screenVal === 'stats' ||
        screenVal === 'profile'
      ) {
        lastSyncedScreenRef.current = screenVal;
        onSelectScreen(screenVal);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSelectScreen, postSyncToIframe]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;

    const recomputeGeometry = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const availW = Math.max(160, Math.floor(rect.width - BEZEL_PADDING_PX * 2 - 2));
      const availH = Math.max(220, Math.floor(rect.height - BEZEL_PADDING_PX * 2 - 2));

      if (availW <= 540) {
        // Mobile / narrow portrait: fill 100% of available width & height edge-to-edge
        if (availW >= 336) {
          setGeom({
            logicalWidth: availW,
            logicalHeight: availH,
            scaledWidth: availW,
            scaledHeight: availH,
            scale: 1,
            showIsland: availW <= 460,
          });
        } else {
          const scale = Number((availW / MIN_LOGICAL_WIDTH).toFixed(4));
          const logicalH = Math.max(460, Math.round(availH / scale));
          setGeom({
            logicalWidth: MIN_LOGICAL_WIDTH,
            logicalHeight: logicalH,
            scaledWidth: availW,
            scaledHeight: availH,
            scale,
            showIsland: true,
          });
        }
        return;
      }

      // Tablet / Desktop: maximize height & spacious responsive width at crisp 1:1 native resolution
      const targetW = Math.min(
        availW,
        MAX_DESKTOP_APP_WIDTH,
        Math.max(460, Math.round(availH * 1.48))
      );
      setGeom({
        logicalWidth: targetW,
        logicalHeight: availH,
        scaledWidth: targetW,
        scaledHeight: availH,
        scale: 1,
        showIsland: targetW <= 480,
      });
    };

    recomputeGeometry();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', recomputeGeometry);
      return () => window.removeEventListener('resize', recomputeGeometry);
    }

    const observer = new ResizeObserver(recomputeGeometry);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible, fullStudio]);

  return (
    <div
      ref={stageRef}
      className="site-live-app-stage"
      data-full-studio={fullStudio ? 'true' : 'false'}
      data-hidden={!isVisible ? 'true' : 'false'}
      data-sheet-expanded={isSheetExpanded ? 'true' : 'false'}
      aria-hidden={!isVisible || isSheetExpanded || undefined}
    >
      <div
        className="site-live-app-phone"
        data-phone-theme={theme}
        data-wide-frame={geom.showIsland ? 'false' : 'true'}
        data-no-marble="true"
        data-hud-surface="true"
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className="site-live-app-screen"
          style={{
            width: `${geom.scaledWidth}px`,
            height: `${geom.scaledHeight}px`,
          }}
        >
          {geom.showIsland && <div className="site-live-app-island" aria-hidden="true" />}

          {!isLoaded && (
            <div className="site-live-app-loader" aria-hidden="true">
              <span className="site-live-app-loader-ring" />
            </div>
          )}

          <iframe
            ref={iframeRef}
            src={initialSrc}
            loading="eager"
            title={
              lang === 'ko'
                ? 'iNVTRY 라이브 앱 데모 체험'
                : 'iNVTRY interactive live app demo'
            }
            className={`site-live-app-iframe ${isLoaded ? 'is-ready' : ''}`}
            style={{
              width: `${geom.logicalWidth}px`,
              height: `${geom.logicalHeight}px`,
              transform: geom.scale === 1 ? 'none' : `scale(${geom.scale})`,
            }}
            onLoad={() => {
              setIsLoaded(true);
              postSyncToIframe();
            }}
          />
        </div>
      </div>
    </div>
  );
}
