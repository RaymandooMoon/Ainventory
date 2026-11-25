import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  ChevronsUpDown,
  Globe,
  Mail,
  Moon,
  Sparkles,
  Sun,
} from 'lucide-react';
import {
  cycleLoginThreeVariant,
  DEFAULT_LOGIN_THREE_VARIANT,
  getLoginThreeVariantMeta,
  type LoginThreeVariantId,
} from '../components/auth/loginThreeVariants.ts';
import {
  DEFAULT_STAGE_INTERACTION_STATE,
  type ActiveStageId,
  type StageId,
  type StageInteractionState,
} from '../three/stageTypes.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { scheduleAfterFirstPaint } from '../utils/resourcePriority.ts';
import HeroVisualProofCard from './HeroVisualProofCard.tsx';
import LiveAppStageOverlay from './LiveAppStageOverlay.tsx';
import SiteLegalModal from './SiteLegalModal.tsx';
import SiteNewsletterModal from './SiteNewsletterModal.tsx';
import SiteStageAnalytics from './SiteStageAnalytics.tsx';
import SiteStageHud from './SiteStageHud.tsx';

const SiteMarbleHero = lazy(() => import('./SiteMarbleHero.tsx'));
import {
  BOTTOM_STAGE_PILLS,
  BRAND_LOGO_ASSETS,
  SITE_COPY,
  SITE_META,
  stageIdToViewId,
  type LegalDocKind,
  type SiteLang,
  type SitePrivacyShield,
  type SiteTheme,
} from './siteContent.ts';
import {
  createStageSwitchTracker,
  type StageAnalyticsSnapshot,
  type StageSwitchTracker,
  type StageSwitchTrigger,
} from './stageAnalytics.ts';

const MIN_UI_ALPHA = 0.02;
const MAX_UI_ALPHA = 0.96;
const DEFAULT_UI_ALPHA = 0.5;

declare global {
  interface Window {
    __AINVTRY_STAGE_ANALYTICS__?: {
      readonly getSnapshot: () => StageAnalyticsSnapshot;
      readonly reset: () => void;
    };
  }
}

function clampUiAlpha(value: number): number {
  return Math.max(MIN_UI_ALPHA, Math.min(MAX_UI_ALPHA, value));
}

function SiteBrandMark({
  theme,
  size = 'hero',
}: {
  readonly theme: SiteTheme;
  readonly size?: 'nav' | 'hero';
}) {
  const isDark = theme === 'dark';
  return (
    <span className={`site-logo-frame site-logo-frame--${size}`} data-logo-theme={theme}>
      <img
        src={BRAND_LOGO_ASSETS.light}
        alt={isDark ? '' : 'iNVTRY — Ainvtry'}
        aria-hidden={isDark}
        width={1120}
        height={394}
        loading={isDark ? 'lazy' : 'eager'}
        decoding="async"
        fetchPriority={isDark ? 'low' : 'high'}
        className={`site-logo-img ${!isDark ? 'is-visible' : ''}`}
      />
      <img
        src={BRAND_LOGO_ASSETS.dark}
        alt={isDark ? 'iNVTRY — Ainvtry' : ''}
        aria-hidden={!isDark}
        width={1120}
        height={394}
        loading={isDark ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={isDark ? 'high' : 'low'}
        className={`site-logo-img site-logo-img--overlay ${isDark ? 'is-visible' : ''}`}
      />
    </span>
  );
}

export default function AinvtrySiteApp() {
  const [theme, setTheme] = useState<SiteTheme>('dark');
  const [lang, setLang] = useState<SiteLang>('en');
  const [heroThreeReady, setHeroThreeReady] = useState(false);

  useEffect(() => {
    return scheduleAfterFirstPaint(() => {
      setHeroThreeReady(true);
    });
  }, []);
  const [motionVariant, setMotionVariant] = useState<LoginThreeVariantId>(
    DEFAULT_LOGIN_THREE_VARIANT
  );
  const [variantOrigin, setVariantOrigin] = useState<{
    readonly x: number;
    readonly y: number;
    readonly seq: number;
  } | null>(null);

  const [activeStage, setActiveStage] = useState<StageId>('hero');
  const [hasVisitedStudio, setHasVisitedStudio] = useState<boolean>(false);
  const [stageInteraction, setStageInteraction] = useState<StageInteractionState>(() => ({
    ...DEFAULT_STAGE_INTERACTION_STATE,
  }));
  const [selectedPrivacyShield, setSelectedPrivacyShield] =
    useState<SitePrivacyShield['id']>('biometric');
  const [rippleBurst, setRippleBurst] = useState<{
    readonly stageId: ActiveStageId;
    readonly seq: number;
  } | null>(null);

  const [uiAlpha, setUiAlpha] = useState<number>(DEFAULT_UI_ALPHA);
  const [isDraggingOpacity, setIsDraggingOpacity] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocKind | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [newsletterOpen, setNewsletterOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeStageRef = useRef<StageId>(activeStage);
  const stageInteractionRef = useRef<StageInteractionState>(stageInteraction);
  const [stageTracker] = useState<StageSwitchTracker>(() => createStageSwitchTracker());
  const [analyticsSnapshot, setAnalyticsSnapshot] = useState<StageAnalyticsSnapshot>(() =>
    stageTracker.getSnapshot()
  );
  const uiAlphaRef = useRef<number>(DEFAULT_UI_ALPHA);
  const opacityDragRef = useRef<{
    pointerId: number;
    startY: number;
    lastY: number;
    moved: number;
  } | null>(null);
  const rippleTimerRef = useRef<number>(0);

  useEffect(() => {
    activeStageRef.current = activeStage;
  }, [activeStage]);

  useEffect(() => {
    stageInteractionRef.current = stageInteraction;
  }, [stageInteraction]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.__AINVTRY_STAGE_ANALYTICS__ = {
      getSnapshot: () => stageTracker.getSnapshot(),
      reset: () => {
        stageTracker.reset();
        setAnalyticsSnapshot(stageTracker.getSnapshot());
      },
    };
    return () => {
      delete window.__AINVTRY_STAGE_ANALYTICS__;
    };
  }, [stageTracker]);

  const copy = SITE_COPY[lang];
  const activeVariantMeta = getLoginThreeVariantMeta(motionVariant);
  const transparencyPct = Math.round((1 - uiAlpha) * 100);
  const activeView = stageIdToViewId(activeStage);

  const applyUiAlpha = useCallback((next: number) => {
    const clamped = clampUiAlpha(next);
    uiAlphaRef.current = clamped;
    if (rootRef.current) {
      rootRef.current.style.setProperty('--site-ui-alpha', clamped.toFixed(3));
    }
    setUiAlpha(clamped);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.siteTheme = theme;
    document.documentElement.lang = lang;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#000000' : '#FFFFFF');
    }
  }, [theme, lang]);

  // Escape key smoothly returns from any 3D stage back to HERO (when modals are closed)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        legalDoc === null &&
        !analyticsOpen &&
        !newsletterOpen &&
        activeStageRef.current !== 'hero'
      ) {
        e.preventDefault();
        triggerHaptic('selection');
        const detail = stageTracker.recordSwitch(
          activeStageRef.current,
          'hero',
          stageInteractionRef.current,
          'keyboard'
        );
        if (detail) {
          setAnalyticsSnapshot(stageTracker.getSnapshot());
        }
        setActiveStage('hero');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [analyticsOpen, legalDoc, newsletterOpen, stageTracker]);

  // Clean up one-shot gold ripple burst timer on unmount
  useEffect(() => {
    return () => {
      if (rippleTimerRef.current) {
        window.clearTimeout(rippleTimerRef.current);
      }
    };
  }, []);

  // Mouse wheel gesture:
  // - Over the bottom-right Glass % pill -> adjust Glass % smoothly.
  // - Over the active 3D stage canvas (outside HUD scroll/modals) -> cycle the active 3D item
  //   (Specs pillars, Architecture tiers/APIs, Studio angle/screens, About journey/loop).
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (rootRef.current) {
      rootRef.current.style.setProperty('--site-ui-alpha', uiAlphaRef.current.toFixed(3));
    }

    let lastWheelStepAt = 0;

    const onWheel = (e: WheelEvent) => {
      if (!Number.isFinite(e.deltaY) || e.deltaY === 0) return;
      const el = e.target as HTMLElement | null;

      if (el && typeof el.closest === 'function') {
        if (el.closest('.site-opacity-drag-btn')) {
          const step = (e.deltaY / 420) * 0.45;
          applyUiAlpha(uiAlphaRef.current + step);
          return;
        }
        if (
          el.closest(
            '.site-hud-scroll, [data-hud-surface="true"], input, textarea, select, [data-no-marble="true"], [role="dialog"], [aria-modal="true"]'
          )
        ) {
          return;
        }
      }

      const stage = activeStageRef.current;
      if (stage === 'hero' || stage === 'studio') return;

      const now = performance.now();
      if (now - lastWheelStepAt < 165) return;
      lastWheelStepAt = now;

      const dir = e.deltaY > 0 ? 1 : -1;
      const prev = stageInteractionRef.current;
      let patch: Partial<StageInteractionState> | null = null;

      if (stage === 'specs') {
        if (prev.specsSubtab === 'fitting' || prev.specsSubtab === 'care') {
          patch = { studioAngleRad: prev.studioAngleRad + dir * (Math.PI * 0.25) };
        } else {
          patch = { specsFocusedIndex: (prev.specsFocusedIndex + dir + 6) % 6 };
        }
      } else if (stage === 'architecture') {
        if (prev.architectureSubtab === 'maps') {
          patch = { googleApiIndex: (prev.googleApiIndex + dir + 6) % 6 };
        } else if (prev.architectureSubtab === 'blueprint') {
          patch = { architectureTier: (prev.architectureTier + dir + 6) % 6 };
        }
      } else if (stage === 'about') {
        if (prev.aboutSubtab === 'journey') {
          patch = { aboutJourneyIndex: (prev.aboutJourneyIndex + dir + 6) % 6 };
        } else if (prev.aboutSubtab === 'mission') {
          patch = {
            aboutLoopIndex: (prev.aboutLoopIndex + dir + 5) % 5,
            aboutLoopPaused: true,
          };
        }
      }

      if (patch) {
        triggerHaptic('selection');
        const next = { ...prev, ...patch };
        stageInteractionRef.current = next;
        setStageInteraction(next);
      }
    };

    window.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      window.removeEventListener('wheel', onWheel);
    };
  }, [applyUiAlpha]);

  const handleSelectStage = useCallback(
    (nextStage: StageId, trigger: StageSwitchTrigger = 'dock') => {
      triggerHaptic('selection');
      const detail = stageTracker.recordSwitch(
        activeStageRef.current,
        nextStage,
        stageInteractionRef.current,
        trigger
      );
      if (detail) {
        setAnalyticsSnapshot(stageTracker.getSnapshot());
      }
      if (nextStage === 'studio') {
        setHasVisitedStudio(true);
      }
      setActiveStage(nextStage);

      if (nextStage !== 'hero') {
        const seq = Date.now();
        setRippleBurst({ stageId: nextStage, seq });
        if (rippleTimerRef.current) {
          window.clearTimeout(rippleTimerRef.current);
        }
        rippleTimerRef.current = window.setTimeout(() => {
          setRippleBurst((prev) => (prev && prev.seq === seq ? null : prev));
          rippleTimerRef.current = 0;
        }, 920);
      }
    },
    [stageTracker]
  );

  const handleUpdateInteraction = useCallback(
    (patch: Partial<StageInteractionState>) => {
      const prev = stageInteractionRef.current;
      const next = { ...prev, ...patch };
      stageInteractionRef.current = next;
      setStageInteraction(next);

      if (
        (patch.studioSubtab !== undefined && patch.studioSubtab !== prev.studioSubtab) ||
        (patch.aboutSubtab !== undefined && patch.aboutSubtab !== prev.aboutSubtab)
      ) {
        const currStage = activeStageRef.current;
        const detail = stageTracker.recordSwitch(currStage, currStage, next, 'subtab', prev);
        if (detail) {
          setAnalyticsSnapshot(stageTracker.getSnapshot());
        }
      }
    },
    [stageTracker]
  );

  const handleResetAnalytics = useCallback(() => {
    stageTracker.reset();
    setAnalyticsSnapshot(stageTracker.getSnapshot());
  }, [stageTracker]);

  const handleNavigateFromAnalytics = useCallback(
    (targetStage: StageId, studioSubtab?: StageInteractionState['studioSubtab']) => {
      const prevInteraction = stageInteractionRef.current;
      const resolvedStage: StageId =
        targetStage === 'studio' && (studioSubtab === 'atelier' || studioSubtab === 'intelligence')
          ? 'specs'
          : targetStage;
      const nextInteraction =
        targetStage === 'studio' && studioSubtab === 'atelier'
          ? { ...prevInteraction, specsSubtab: 'fitting' as const }
          : targetStage === 'studio' && studioSubtab === 'intelligence'
            ? { ...prevInteraction, specsSubtab: 'care' as const }
            : prevInteraction;
      if (nextInteraction !== prevInteraction) {
        stageInteractionRef.current = nextInteraction;
        setStageInteraction(nextInteraction);
      }
      const detail = stageTracker.recordSwitch(
        activeStageRef.current,
        resolvedStage,
        nextInteraction,
        'dock',
        prevInteraction
      );
      if (detail) {
        setAnalyticsSnapshot(stageTracker.getSnapshot());
      }
      if (resolvedStage === 'studio') {
        setHasVisitedStudio(true);
      }
      setActiveStage(resolvedStage);
    },
    [stageTracker]
  );

  const handleToggleSilk = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    triggerHaptic('selection');
    const rootRect = rootRef.current?.getBoundingClientRect();
    if (rootRect && rootRect.width > 0 && rootRect.height > 0) {
      const btnRect = e.currentTarget.getBoundingClientRect();
      const cx = btnRect.left + btnRect.width * 0.5;
      const cy = btnRect.top + btnRect.height * 0.5;
      setVariantOrigin({
        x: ((cx - rootRect.left) / rootRect.width) * 2 - 1,
        y: -(((cy - rootRect.top) / rootRect.height) * 2 - 1),
        seq: Date.now(),
      });
    }
    setMotionVariant((prev) => cycleLoginThreeVariant(prev));
  }, []);

  const handleToggleTheme = useCallback(() => {
    triggerHaptic('selection');
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const handleToggleLang = useCallback(() => {
    triggerHaptic('selection');
    setLang((prev) => (prev === 'en' ? 'ko' : 'en'));
  }, []);

  const handleCloseLegal = useCallback(() => {
    setLegalDoc(null);
  }, []);

  const handleOpacityPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    opacityDragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      lastY: e.clientY,
      moved: 0,
    };
    setIsDraggingOpacity(true);
  }, []);

  const handleOpacityPointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const drag = opacityDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      e.stopPropagation();
      const dy = e.clientY - drag.lastY;
      drag.lastY = e.clientY;
      drag.moved += Math.abs(dy);
      if (Math.abs(dy) < 0.25) return;
      applyUiAlpha(uiAlphaRef.current + (dy / 180) * 0.86);
    },
    [applyUiAlpha]
  );

  const handleOpacityPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const drag = opacityDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      e.stopPropagation();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const wasTap = drag.moved < 6;
      opacityDragRef.current = null;
      setIsDraggingOpacity(false);
      if (wasTap) {
        triggerHaptic('selection');
        const curr = uiAlphaRef.current;
        if (curr > 0.3 && curr < 0.68) {
          applyUiAlpha(0.08);
        } else if (curr <= 0.3) {
          applyUiAlpha(0.84);
        } else {
          applyUiAlpha(DEFAULT_UI_ALPHA);
        }
      }
    },
    [applyUiAlpha]
  );

  const handleOpacityKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        applyUiAlpha(uiAlphaRef.current - 0.08);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        e.preventDefault();
        applyUiAlpha(uiAlphaRef.current + 0.08);
      } else if (e.key === 'Home') {
        e.preventDefault();
        applyUiAlpha(DEFAULT_UI_ALPHA);
      }
    },
    [applyUiAlpha]
  );

  const betaMailto = `mailto:${SITE_META.contactEmail}?subject=${encodeURIComponent(
    'Ainvtry Private Beta & Partnership Inquiry'
  )}`;

  return (
    <div
      ref={rootRef}
      className="site-root"
      data-site-theme={theme}
      data-active-view={activeView}
      data-active-stage={activeStage}
    >
      {/* ================================================================
          PERSISTENT SINGLE-CANVAS 3D SILK + MARBLE + 4-STAGE DIRECTOR
          Deferred until after first paint so Hero & Studio paint immediately
         ================================================================ */}
      {heroThreeReady ? (
        <Suspense
          fallback={
            <div
              className="site-marble-stage is-webgl-fallback"
              data-motion-theme={theme}
              data-motion-variant={motionVariant}
              data-active-stage={activeStage}
              aria-hidden="true"
            >
              <div className="site-marble-veil" />
            </div>
          }
        >
          <SiteMarbleHero
            theme={theme}
            motionVariant={motionVariant}
            variantChangeOrigin={variantOrigin}
            activeStage={activeStage}
            glassPercent={transparencyPct}
            interaction={stageInteraction}
            onStageUiSync={handleUpdateInteraction}
            viewportRootRef={rootRef}
          />
        </Suspense>
      ) : (
        <div
          className="site-marble-stage is-webgl-fallback"
          data-motion-theme={theme}
          data-motion-variant={motionVariant}
          data-active-stage={activeStage}
          aria-hidden="true"
        >
          <div className="site-marble-veil" />
        </div>
      )}

      <div className="site-shell">
        {/* ================================================================
            ZERO-CHROME EDITORIAL TOPBAR (MARBLE-HITTABLE IN HERO)
           ================================================================ */}
        <header className="site-header-stack">
          <div className="site-topbar">
            <div className="site-topbar-left">
              <button
                type="button"
                className={`site-brand-pill ${activeStage === 'hero' ? 'is-home-active' : ''}`}
                data-marble-target="true"
                data-marble-action="click"
                onClick={() => handleSelectStage('hero', 'brand')}
                aria-label={copy.nav.homeAria}
                aria-current={activeStage === 'hero' ? 'page' : undefined}
              >
                <SiteBrandMark theme={theme} size="nav" />
              </button>
            </div>

            <div className="site-topbar-right site-utility-rail">
              <button
                type="button"
                className="site-utility-pill"
                data-marble-target="true"
                data-marble-action="click"
                onClick={handleToggleSilk}
                aria-label={
                  lang === 'en'
                    ? `Switch Three.js 3D silk backdrop (${activeVariantMeta.labelEn})`
                    : `Three.js 3D 실크 배경 전환 (${activeVariantMeta.labelKo})`
                }
              >
                <Sparkles size={13} aria-hidden="true" />
                <span>
                  {lang === 'en' ? activeVariantMeta.shortEn : activeVariantMeta.shortKo}
                </span>
              </button>
              <span className="site-utility-sep" aria-hidden="true" />
              <button
                type="button"
                className="site-utility-pill"
                data-marble-target="true"
                data-marble-action="click"
                onClick={handleToggleTheme}
                aria-label={lang === 'en' ? 'Toggle theme' : '라이트 다크 모드 전환'}
              >
                {theme === 'dark' ? <Sun size={13} aria-hidden="true" /> : <Moon size={13} aria-hidden="true" />}
                <span>{theme === 'dark' ? copy.nav.switchToLight : copy.nav.switchToDark}</span>
              </button>
              <span className="site-utility-sep" aria-hidden="true" />
              <button
                type="button"
                className="site-utility-pill"
                data-marble-target="true"
                data-marble-action="click"
                onClick={handleToggleLang}
                aria-label={lang === 'en' ? 'Switch language to Korean' : '영어로 전환'}
              >
                <Globe size={13} aria-hidden="true" />
                <span>{copy.nav.switchLang}</span>
              </button>
            </div>
          </div>
        </header>

        {/* ================================================================
            CENTRAL SPATIAL STAGE: EDITORIAL HERO OR LIVE STUDIO / 3D + HUD
           ================================================================ */}
        <main className="site-stage">
          {hasVisitedStudio && (
            <LiveAppStageOverlay
              screen={stageInteraction.studioPreviewScreen}
              lang={lang}
              theme={theme}
              mood={motionVariant}
              isSheetExpanded={false}
              isVisible={activeStage === 'studio'}
              fullStudio
              onSelectScreen={(nextScreen) =>
                handleUpdateInteraction({ studioPreviewScreen: nextScreen })
              }
            />
          )}

          {activeStage === 'hero' ? (
            <section key="hero" className="site-view site-view--home">
              <div className="site-hero-grid">
                <div className="site-hero-editorial">
                  <p className="site-hero-eyebrow">
                    <span className="site-hero-diamond" aria-hidden="true">
                      ◆
                    </span>
                    <span>{copy.hero.kicker}</span>
                  </p>

                  <h1 className="site-hero-title">
                    <span className="site-hero-title-sheen">{copy.hero.titleLead}</span>
                    <em className="site-hero-accent">{copy.hero.titleAccent}</em>
                    <span className="site-hero-title-sheen">{copy.hero.titleTail}</span>
                  </h1>

                  <p className="site-hero-subtitle">{copy.hero.subtitle}</p>

                  <div className="site-hero-actions" data-no-marble="true">
                    <button
                      type="button"
                      className="site-hero-cta site-hero-cta--primary"
                      onClick={() => handleSelectStage('studio', 'dock')}
                    >
                      <span>{copy.hero.primaryCta}</span>
                      <ArrowRight size={15} aria-hidden="true" />
                    </button>
                    <a
                      href={betaMailto}
                      className="site-hero-cta site-hero-cta--secondary"
                    >
                      <span>{copy.hero.secondaryCta}</span>
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  </div>

                  <dl className="site-hero-proof-strip" aria-label={copy.stack.heading}>
                    {copy.hero.proofMetrics.map((metric) => (
                      <div key={metric.label} className="site-hero-proof-metric">
                        <dt className="site-hero-proof-val">{metric.value}</dt>
                        <dd className="site-hero-proof-lbl">{metric.label}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="site-hero-visual">
                  <HeroVisualProofCard
                    copy={copy}
                    lang={lang}
                    theme={theme}
                    onLaunchStudio={() => handleSelectStage('studio', 'dock')}
                  />
                </div>
              </div>
            </section>
          ) : (
            <SiteStageHud
              activeStage={activeStage}
              copy={copy}
              lang={lang}
              theme={theme}
              mood={motionVariant}
              betaMailto={betaMailto}
              interaction={stageInteraction}
              selectedPrivacyShield={selectedPrivacyShield}
              onSelectPrivacyShield={setSelectedPrivacyShield}
              onUpdateInteraction={handleUpdateInteraction}
            />
          )}
        </main>

        {/* ================================================================
            UNIFIED ARCHITECTURAL 4-STAGE HAIRLINE RAIL + FOOTER
           ================================================================ */}
        <div className="site-bottom-stack">
          <nav
            className="site-pinball-dock site-dock"
            aria-label={lang === 'ko' ? '주요 스테이지 탐색' : 'Primary stage navigation'}
          >
            {BOTTOM_STAGE_PILLS.map((pill, idx) => {
              const isSelected = activeStage === pill.stageId;
              const isBursting = rippleBurst?.stageId === pill.stageId;
              const stageIndex = String(idx + 1).padStart(2, '0');
              return (
                <button
                  key={pill.stageId}
                  type="button"
                  className={`site-pinball-bumper site-dock-pill ${isSelected ? 'is-active' : ''} ${
                    isBursting ? 'is-ripple-burst' : ''
                  }`}
                  data-marble-target="true"
                  data-marble-action="click"
                  data-stage-pill={pill.stageId}
                  aria-pressed={isSelected}
                  aria-current={isSelected ? 'page' : undefined}
                  onClick={() => handleSelectStage(pill.stageId, 'dock')}
                >
                  <span className="site-dock-pill-num" aria-hidden="true">
                    {stageIndex}
                  </span>
                  <span className="site-dock-pill-label">{copy.nav[pill.navKey]}</span>
                  {isBursting && (
                    <span
                      key={rippleBurst.seq}
                      className="site-dock-burst-ring"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="site-bottombar-tray" data-marble-floor="true">
            <footer className="site-bottombar">
              <div className="site-bottombar-left">
                <span className="site-bottombar-rights">{copy.footer.rights}</span>
                <a
                  href={`mailto:${SITE_META.contactEmail}`}
                  className="site-bottombar-link site-bottombar-email"
                >
                  {SITE_META.contactEmail}
                </a>
                <button
                  type="button"
                  data-no-marble="true"
                  className={`site-bottombar-link site-bottombar-newsletter ${
                    newsletterOpen ? 'is-active' : ''
                  }`}
                  aria-haspopup="dialog"
                  aria-expanded={newsletterOpen}
                  onClick={() => {
                    triggerHaptic('selection');
                    setNewsletterOpen(true);
                  }}
                >
                  <Mail size={13} aria-hidden="true" />
                  <span className="site-bottombar-link-full">{copy.footer.newsletter}</span>
                  <span className="site-bottombar-link-short" aria-hidden="true">
                    {copy.footer.newsletterShort}
                  </span>
                </button>
                <button
                  type="button"
                  className="site-bottombar-link"
                  onClick={() => setLegalDoc('privacy')}
                >
                  <span className="site-bottombar-link-full">{copy.footer.privacy}</span>
                  <span className="site-bottombar-link-short" aria-hidden="true">
                    {lang === 'ko' ? '개인정보' : 'Privacy'}
                  </span>
                </button>
                <button
                  type="button"
                  className="site-bottombar-link"
                  onClick={() => setLegalDoc('terms')}
                >
                  <span className="site-bottombar-link-full">{copy.footer.terms}</span>
                  <span className="site-bottombar-link-short" aria-hidden="true">
                    {lang === 'ko' ? '약관' : 'Terms'}
                  </span>
                </button>
              </div>

              <div className="site-bottombar-right">
                <button
                  type="button"
                  data-no-marble="true"
                  className={`site-analytics-trigger-btn ${analyticsOpen ? 'is-active' : ''}`}
                  aria-haspopup="dialog"
                  aria-expanded={analyticsOpen}
                  aria-label={
                    lang === 'ko'
                      ? `3D 스테이지 분석 차트 열기 (총 ${analyticsSnapshot.totalSwitches}회 전환)`
                      : `Open 3D stage analytics charts (${analyticsSnapshot.totalSwitches} switches)`
                  }
                  onClick={() => {
                    triggerHaptic('selection');
                    setAnalyticsOpen(true);
                  }}
                >
                  <BarChart3 size={14} aria-hidden="true" />
                  <span className="site-analytics-trigger-label">
                    {lang === 'ko' ? '분석' : 'Analytics'}
                  </span>
                  {analyticsSnapshot.totalSwitches > 0 && (
                    <span className="site-analytics-trigger-count">
                      {analyticsSnapshot.totalSwitches}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  role="slider"
                  aria-label={copy.nav.opacityHint}
                  aria-valuemin={4}
                  aria-valuemax={90}
                  aria-valuenow={transparencyPct}
                  aria-valuetext={`${copy.nav.opacityLabel} ${transparencyPct}%`}
                  title={copy.nav.opacityHint}
                  data-no-marble="true"
                  className={`site-opacity-drag-btn ${isDraggingOpacity ? 'is-dragging' : ''}`}
                  onPointerDown={handleOpacityPointerDown}
                  onPointerMove={handleOpacityPointerMove}
                  onPointerUp={handleOpacityPointerUp}
                  onPointerCancel={handleOpacityPointerUp}
                  onKeyDown={handleOpacityKeyDown}
                >
                  <span className="site-opacity-meter" aria-hidden="true">
                    <span
                      className="site-opacity-meter-fill"
                      style={{ height: `${Math.max(10, Math.min(100, transparencyPct))}%` }}
                    />
                  </span>
                  <ChevronsUpDown size={14} aria-hidden="true" />
                  <span className="site-opacity-label">
                    {copy.nav.opacityLabel} <strong>{transparencyPct}%</strong>
                  </span>
                </button>
              </div>
            </footer>
          </div>
        </div>
      </div>

      <SiteStageAnalytics
        isOpen={analyticsOpen}
        lang={lang}
        snapshot={analyticsSnapshot}
        onClose={() => setAnalyticsOpen(false)}
        onReset={handleResetAnalytics}
        onNavigateStage={handleNavigateFromAnalytics}
      />

      <SiteNewsletterModal
        isOpen={newsletterOpen}
        copy={copy.newsletter}
        lang={lang}
        onClose={() => setNewsletterOpen(false)}
      />

      <SiteLegalModal doc={legalDoc} copy={copy.legal} onClose={handleCloseLegal} />
    </div>
  );
}
