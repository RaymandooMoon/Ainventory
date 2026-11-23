import { useCallback, useEffect, useRef, useState } from 'react';
import {
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
} from '../components/auth/loginThreeScenes.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { EnterpriseBlueprintPanel, PrivacyDefensePanel } from './SiteBlueprintPanel.tsx';
import { GoogleApiTheaterPanel } from './SiteGoogleApiTheater.tsx';
import { BenchmarksIrScorecard, ProductionStackMatrix } from './SiteIrPanels.tsx';
import { AboutJourneyComicPanel } from './SiteJourneyComicPanel.tsx';
import SiteLegalModal from './SiteLegalModal.tsx';
import SiteMarbleHero from './SiteMarbleHero.tsx';
import { AboutFounderPanel, AboutMissionPanel } from './SiteMissionPanel.tsx';
import {
  AppPreviewShowcasePanel,
  AtelierShowcasePanel,
  IntelligenceShowcasePanel,
  StudioFeatureIconDock,
} from './SiteShowcases.tsx';
import {
  SITE_COPY,
  SITE_META,
  type LegalDocKind,
  type SiteLang,
  type SitePrivacyShield,
  type SiteTheme,
  type SiteViewId,
} from './siteContent.ts';

const MIN_UI_ALPHA = 0.1;
const MAX_UI_ALPHA = 0.96;
const DEFAULT_UI_ALPHA = 0.5;

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
        src="/assets/brand/invtry-logo-light.png"
        alt={isDark ? '' : 'iNVTRY — Ainvtry'}
        aria-hidden={isDark}
        width={1120}
        height={394}
        decoding="async"
        className={`site-logo-img ${!isDark ? 'is-visible' : ''}`}
      />
      <img
        src="/assets/brand/invtry-logo-dark.png"
        alt={isDark ? 'iNVTRY — Ainvtry' : ''}
        aria-hidden={!isDark}
        width={1120}
        height={394}
        decoding="async"
        className={`site-logo-img site-logo-img--overlay ${isDark ? 'is-visible' : ''}`}
      />
    </span>
  );
}

function handleTablistArrowKeys<T extends string>(
  e: React.KeyboardEvent<HTMLDivElement>,
  order: readonly T[],
  current: T,
  idPrefix: string,
  onSelect: (next: T) => void
) {
  const idx = order.indexOf(current);
  if (idx < 0) return;
  let nextIdx = -1;
  if (e.key === 'ArrowRight') nextIdx = (idx + 1) % order.length;
  else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + order.length) % order.length;
  else if (e.key === 'Home') nextIdx = 0;
  else if (e.key === 'End') nextIdx = order.length - 1;
  if (nextIdx >= 0) {
    e.preventDefault();
    const target = order[nextIdx];
    triggerHaptic('selection');
    onSelect(target);
    document.getElementById(`${idPrefix}-${target}`)?.focus();
  }
}

export default function AinvtrySiteApp() {
  const [theme, setTheme] = useState<SiteTheme>('dark');
  const [lang, setLang] = useState<SiteLang>('en');
  const [motionVariant, setMotionVariant] = useState<LoginThreeVariantId>(
    DEFAULT_LOGIN_THREE_VARIANT
  );
  const [variantOrigin, setVariantOrigin] = useState<{
    readonly x: number;
    readonly y: number;
    readonly seq: number;
  } | null>(null);
  const [activeView, setActiveView] = useState<SiteViewId>('home');
  const [studioTab, setStudioTab] = useState<'preview' | 'atelier' | 'intelligence'>('preview');
  const [archTab, setArchTab] = useState<'blueprint' | 'privacy' | 'maps'>('blueprint');
  const [selectedPrivacyShield, setSelectedPrivacyShield] =
    useState<SitePrivacyShield['id']>('biometric');
  const [benchTab, setBenchTab] = useState<'kpi' | 'matrix'>('kpi');
  const [aboutTab, setAboutTab] = useState<'journey' | 'mission' | 'founder'>('journey');
  const [uiAlpha, setUiAlpha] = useState<number>(DEFAULT_UI_ALPHA);
  const [isDraggingOpacity, setIsDraggingOpacity] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocKind | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const uiAlphaRef = useRef<number>(DEFAULT_UI_ALPHA);
  const opacityDragRef = useRef<{
    pointerId: number;
    startY: number;
    lastY: number;
    moved: number;
  } | null>(null);

  const copy = SITE_COPY[lang];
  const activeVariantMeta = getLoginThreeVariantMeta(motionVariant);
  const transparencyPct = Math.round((1 - uiAlpha) * 100);

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

  // Global wheel & vertical touch-swipe opacity gesture (LoginView.jsx parity)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (rootRef.current) {
      rootRef.current.style.setProperty('--site-ui-alpha', uiAlphaRef.current.toFixed(3));
    }

    const isIgnoredTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el || typeof el.closest !== 'function') return false;
      return Boolean(
        el.closest(
          'input, textarea, select, [data-no-marble="true"], [role="dialog"], [aria-modal="true"]'
        )
      );
    };

    let touchStartY: number | null = null;
    let touchLastY: number | null = null;

    const onWheel = (e: WheelEvent) => {
      if (!Number.isFinite(e.deltaY) || e.deltaY === 0 || isIgnoredTarget(e.target)) return;
      const step = (e.deltaY / 420) * 0.45;
      applyUiAlpha(uiAlphaRef.current + step);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || isIgnoredTarget(e.target)) {
        touchStartY = null;
        touchLastY = null;
        return;
      }
      const t = e.touches[0];
      touchStartY = t.clientY;
      touchLastY = t.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (touchLastY === null || touchStartY === null || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dy = t.clientY - touchLastY;
      touchLastY = t.clientY;
      if (Math.abs(dy) < 0.6) return;
      const step = (dy / 300) * 0.52;
      applyUiAlpha(uiAlphaRef.current + step);
    };

    const onTouchEnd = () => {
      touchStartY = null;
      touchLastY = null;
    };

    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [applyUiAlpha]);

  const handleNavigate = useCallback((view: SiteViewId) => {
    triggerHaptic('selection');
    setActiveView(view);
  }, []);

  const handleJumpToPrivacyShield = useCallback((shieldId: SitePrivacyShield['id']) => {
    setSelectedPrivacyShield(shieldId);
    setArchTab('privacy');
  }, []);

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
        if (curr > 0.35 && curr < 0.65) {
          applyUiAlpha(0.18);
        } else if (curr <= 0.35) {
          applyUiAlpha(0.85);
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

  const navItems: readonly { readonly id: Exclude<SiteViewId, 'home'>; readonly label: string }[] = [
    { id: 'studio', label: copy.nav.studio },
    { id: 'technology', label: copy.nav.technology },
    { id: 'benchmarks', label: copy.nav.metrics },
    { id: 'about', label: copy.nav.about },
  ];

  const activeStudioPillar =
    studioTab === 'atelier'
      ? copy.capabilities.pillars.atelier
      : copy.capabilities.pillars.intelligence;

  return (
    <div ref={rootRef} className="site-root" data-site-theme={theme} data-active-view={activeView}>
      {/* ================================================================
          SHARED FULL-VIEWPORT 3D SILK + ROLLING GLASS MARBLE BACKDROP
         ================================================================ */}
      <SiteMarbleHero
        theme={theme}
        motionVariant={motionVariant}
        variantChangeOrigin={variantOrigin}
        activeView={activeView}
        viewportRootRef={rootRef}
      />

      <div className="site-shell">
        {/* ================================================================
            PERSISTENT FLOATING UTILITY TOPBAR (MARBLE-HITTABLE)
           ================================================================ */}
        <header className="site-header-stack">
          <div className="site-topbar">
            <div className="site-topbar-left">
              <button
                type="button"
                className={`site-brand-pill ${activeView === 'home' ? 'is-home-active' : ''}`}
                data-marble-target="true"
                data-marble-action="click"
                onClick={() => handleNavigate('home')}
                aria-label={copy.nav.homeAria}
                aria-current={activeView === 'home' ? 'page' : undefined}
              >
                <SiteBrandMark theme={theme} size="nav" />
              </button>
              <button
                type="button"
                className="site-utility-pill"
                data-marble-target="true"
                data-marble-action="click"
                onClick={handleToggleSilk}
                aria-label={
                  lang === 'en'
                    ? `Switch 3D silk backdrop (${activeVariantMeta.labelEn})`
                    : `3D 실크 배경 전환 (${activeVariantMeta.labelKo})`
                }
              >
                <Sparkles size={14} />
                <span>
                  {lang === 'en' ? activeVariantMeta.shortEn : activeVariantMeta.shortKo}
                </span>
              </button>
            </div>

            <div className="site-topbar-right">
              <button
                type="button"
                className="site-utility-pill"
                data-marble-target="true"
                data-marble-action="click"
                onClick={handleToggleTheme}
                aria-label={lang === 'en' ? 'Toggle theme' : '라이트 다크 모드 전환'}
              >
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                <span>{theme === 'dark' ? copy.nav.switchToLight : copy.nav.switchToDark}</span>
              </button>
              <button
                type="button"
                className="site-utility-pill"
                data-marble-target="true"
                data-marble-action="click"
                onClick={handleToggleLang}
                aria-label={lang === 'en' ? 'Switch language to Korean' : '영어로 전환'}
              >
                <Globe size={15} />
                <span>{copy.nav.switchLang}</span>
              </button>
            </div>
          </div>
        </header>

        {/* ================================================================
            SINGLE-VIEWPORT SPATIAL STAGE — UNIFORM GLASS WINDOW FRAME
           ================================================================ */}
        <main className="site-stage">
          {activeView === 'home' && (
            <section key="home" className="site-view site-view--home">
              <div className="site-hero-center">
                <p className="site-hero-kicker">{copy.hero.kicker}</p>
                <div className="site-hero-logo-wrap">
                  <SiteBrandMark theme={theme} size="hero" />
                </div>
                <h1 className="site-hero-title">
                  {copy.hero.titleLead}
                  <em className="site-hero-accent">{copy.hero.titleAccent}</em>
                  {copy.hero.titleTail}
                </h1>
                <p className="site-hero-subtitle">{copy.hero.subtitle}</p>
                <div className="site-hero-hint-pill" aria-hidden="true">
                  <span>{copy.hero.marbleHint}</span>
                </div>
              </div>

              <div className="site-hero-dock">
                <div className="site-hero-cta-row">
                  <a href={betaMailto} className="site-btn-secondary">
                    <Mail size={15} />
                    <span>{copy.hero.secondaryCta}</span>
                  </a>
                </div>
              </div>
            </section>
          )}

          {activeView === 'studio' && (
            <section key="studio" className="site-view site-view--panel">
              <div className="site-glass-panel">
                <div className="site-panel-header">
                  <div
                    className="site-subtab-group"
                    role="tablist"
                    aria-label="Studio modules"
                    onKeyDown={(e) =>
                      handleTablistArrowKeys(
                        e,
                        ['preview', 'atelier', 'intelligence'] as const,
                        studioTab,
                        'site-studio-tab',
                        setStudioTab
                      )
                    }
                  >
                    <button
                      id="site-studio-tab-preview"
                      type="button"
                      role="tab"
                      aria-selected={studioTab === 'preview'}
                      aria-controls="site-studio-tabpanel"
                      tabIndex={studioTab === 'preview' ? 0 : -1}
                      className={`site-subtab-pill ${studioTab === 'preview' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setStudioTab('preview');
                      }}
                    >
                      {copy.subtabs.studioPreview}
                    </button>
                    <button
                      id="site-studio-tab-atelier"
                      type="button"
                      role="tab"
                      aria-selected={studioTab === 'atelier'}
                      aria-controls="site-studio-tabpanel"
                      tabIndex={studioTab === 'atelier' ? 0 : -1}
                      className={`site-subtab-pill ${studioTab === 'atelier' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setStudioTab('atelier');
                      }}
                    >
                      {copy.subtabs.studioAtelier}
                    </button>
                    <button
                      id="site-studio-tab-intelligence"
                      type="button"
                      role="tab"
                      aria-selected={studioTab === 'intelligence'}
                      aria-controls="site-studio-tabpanel"
                      tabIndex={studioTab === 'intelligence' ? 0 : -1}
                      className={`site-subtab-pill ${studioTab === 'intelligence' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setStudioTab('intelligence');
                      }}
                    >
                      {copy.subtabs.studioIntel}
                    </button>
                  </div>
                  <span className="site-pill-badge">
                    {studioTab === 'preview' ? copy.appPreview.badge : copy.capabilities.badge}
                  </span>
                </div>

                <div
                  id="site-studio-tabpanel"
                  className="site-panel-body"
                  role="tabpanel"
                  aria-labelledby={`site-studio-tab-${studioTab}`}
                >
                  {studioTab === 'preview' ? (
                    <AppPreviewShowcasePanel copy={copy.appPreview} lang={lang} theme={theme} />
                  ) : (
                    <div className="site-panel-split">
                      <StudioFeatureIconDock
                        key={studioTab}
                        pillar={activeStudioPillar}
                        tapHint={copy.tapHint}
                      />

                      {studioTab === 'atelier' ? (
                        <AtelierShowcasePanel copy={copy.interactive} />
                      ) : (
                        <IntelligenceShowcasePanel copy={copy.interactive} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeView === 'technology' && (
            <section key="technology" className="site-view site-view--panel">
              <div className="site-glass-panel" data-arch-tab={archTab}>
                <div className="site-panel-header">
                  <div
                    className="site-subtab-group"
                    role="tablist"
                    aria-label="Architecture modules"
                    onKeyDown={(e) =>
                      handleTablistArrowKeys(
                        e,
                        ['blueprint', 'privacy', 'maps'] as const,
                        archTab,
                        'site-arch-tab',
                        setArchTab
                      )
                    }
                  >
                    <button
                      id="site-arch-tab-blueprint"
                      type="button"
                      role="tab"
                      aria-selected={archTab === 'blueprint'}
                      aria-controls="site-arch-tabpanel"
                      tabIndex={archTab === 'blueprint' ? 0 : -1}
                      className={`site-subtab-pill ${archTab === 'blueprint' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setArchTab('blueprint');
                      }}
                    >
                      {copy.subtabs.archBlueprint}
                    </button>
                    <button
                      id="site-arch-tab-privacy"
                      type="button"
                      role="tab"
                      aria-selected={archTab === 'privacy'}
                      aria-controls="site-arch-tabpanel"
                      tabIndex={archTab === 'privacy' ? 0 : -1}
                      className={`site-subtab-pill ${archTab === 'privacy' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setArchTab('privacy');
                      }}
                    >
                      {copy.subtabs.archPrivacy}
                    </button>
                    <button
                      id="site-arch-tab-maps"
                      type="button"
                      role="tab"
                      aria-selected={archTab === 'maps'}
                      aria-controls="site-arch-tabpanel"
                      tabIndex={archTab === 'maps' ? 0 : -1}
                      className={`site-subtab-pill ${archTab === 'maps' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setArchTab('maps');
                      }}
                    >
                      {copy.subtabs.archMaps}
                    </button>
                  </div>
                  <span className="site-pill-badge">
                    {archTab === 'privacy'
                      ? copy.architecture.privacyBadge
                      : archTab === 'maps'
                        ? copy.architecture.mapsBadge
                        : copy.architecture.badge}
                  </span>
                </div>

                <div
                  id="site-arch-tabpanel"
                  className="site-panel-body"
                  role="tabpanel"
                  aria-labelledby={`site-arch-tab-${archTab}`}
                >
                  {archTab === 'blueprint' && (
                    <EnterpriseBlueprintPanel
                      copy={copy.architecture}
                      tapHint={copy.tapHint}
                      onSelectPrivacyShield={handleJumpToPrivacyShield}
                    />
                  )}
                  {archTab === 'privacy' && (
                    <PrivacyDefensePanel
                      copy={copy.architecture}
                      interactiveCopy={copy.interactive}
                      selectedId={selectedPrivacyShield}
                      onSelect={setSelectedPrivacyShield}
                    />
                  )}
                  {archTab === 'maps' && (
                    <GoogleApiTheaterPanel copy={copy.architecture} tapHint={copy.tapHint} />
                  )}
                </div>
              </div>
            </section>
          )}

          {activeView === 'benchmarks' && (
            <section key="benchmarks" className="site-view site-view--panel">
              <div className="site-glass-panel">
                <div className="site-panel-header">
                  <div
                    className="site-subtab-group"
                    role="tablist"
                    aria-label="Specification views"
                    onKeyDown={(e) =>
                      handleTablistArrowKeys(
                        e,
                        ['kpi', 'matrix'] as const,
                        benchTab,
                        'site-bench-tab',
                        setBenchTab
                      )
                    }
                  >
                    <button
                      id="site-bench-tab-kpi"
                      type="button"
                      role="tab"
                      aria-selected={benchTab === 'kpi'}
                      aria-controls="site-bench-tabpanel"
                      tabIndex={benchTab === 'kpi' ? 0 : -1}
                      className={`site-subtab-pill ${benchTab === 'kpi' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setBenchTab('kpi');
                      }}
                    >
                      {copy.subtabs.benchKpi}
                    </button>
                    <button
                      id="site-bench-tab-matrix"
                      type="button"
                      role="tab"
                      aria-selected={benchTab === 'matrix'}
                      aria-controls="site-bench-tabpanel"
                      tabIndex={benchTab === 'matrix' ? 0 : -1}
                      className={`site-subtab-pill ${benchTab === 'matrix' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setBenchTab('matrix');
                      }}
                    >
                      {copy.subtabs.benchMatrix}
                    </button>
                  </div>
                  <span className="site-pill-badge">{copy.stack.note}</span>
                </div>

                <div
                  id="site-bench-tabpanel"
                  className="site-panel-body"
                  role="tabpanel"
                  aria-labelledby={`site-bench-tab-${benchTab}`}
                >
                  {benchTab === 'kpi' ? (
                    <BenchmarksIrScorecard copy={copy.stack} tapHint={copy.tapHint} />
                  ) : (
                    <ProductionStackMatrix copy={copy.stack} tapHint={copy.tapHint} />
                  )}
                </div>
              </div>
            </section>
          )}

          {activeView === 'about' && (
            <section key="about" className="site-view site-view--panel">
              <div className="site-glass-panel" data-about-tab={aboutTab}>
                <div className="site-panel-header">
                  <div
                    className="site-subtab-group site-subtab-group--stepper"
                    role="tablist"
                    aria-label="About story steps"
                    onKeyDown={(e) =>
                      handleTablistArrowKeys(
                        e,
                        ['journey', 'mission', 'founder'] as const,
                        aboutTab,
                        'site-about-tab',
                        setAboutTab
                      )
                    }
                  >
                    <button
                      id="site-about-tab-journey"
                      type="button"
                      role="tab"
                      aria-selected={aboutTab === 'journey'}
                      aria-controls="site-about-tabpanel"
                      tabIndex={aboutTab === 'journey' ? 0 : -1}
                      className={`site-subtab-pill ${aboutTab === 'journey' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setAboutTab('journey');
                      }}
                    >
                      {copy.subtabs.aboutJourney}
                    </button>
                    <span className="site-stepper-arrow" aria-hidden="true">→</span>
                    <button
                      id="site-about-tab-mission"
                      type="button"
                      role="tab"
                      aria-selected={aboutTab === 'mission'}
                      aria-controls="site-about-tabpanel"
                      tabIndex={aboutTab === 'mission' ? 0 : -1}
                      className={`site-subtab-pill ${aboutTab === 'mission' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setAboutTab('mission');
                      }}
                    >
                      {copy.subtabs.aboutMission}
                    </button>
                    <span className="site-stepper-arrow" aria-hidden="true">→</span>
                    <button
                      id="site-about-tab-founder"
                      type="button"
                      role="tab"
                      aria-selected={aboutTab === 'founder'}
                      aria-controls="site-about-tabpanel"
                      tabIndex={aboutTab === 'founder' ? 0 : -1}
                      className={`site-subtab-pill ${aboutTab === 'founder' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setAboutTab('founder');
                      }}
                    >
                      {copy.subtabs.aboutFounder}
                    </button>
                  </div>
                  <span className="site-pill-badge">
                    {aboutTab === 'journey'
                      ? copy.journey.badge
                      : aboutTab === 'mission'
                        ? copy.mission.badge
                        : copy.vision.irBadge}
                  </span>
                </div>

                <div
                  id="site-about-tabpanel"
                  className="site-panel-body"
                  role="tabpanel"
                  aria-labelledby={`site-about-tab-${aboutTab}`}
                >
                  {aboutTab === 'journey' && (
                    <AboutJourneyComicPanel
                      copy={copy.journey}
                      tapHint={copy.tapHint}
                      onNextStep={() => setAboutTab('mission')}
                    />
                  )}
                  {aboutTab === 'mission' && (
                    <AboutMissionPanel
                      copy={copy.mission}
                      visionCopy={copy.vision}
                      tapHint={copy.tapHint}
                      onNextStep={() => setAboutTab('founder')}
                    />
                  )}
                  {aboutTab === 'founder' && (
                    <AboutFounderPanel
                      copy={copy.vision}
                      betaMailto={betaMailto}
                      onBackToJourney={() => setAboutTab('journey')}
                    />
                  )}
                </div>
              </div>
            </section>
          )}
        </main>

        {/* ================================================================
            UNIFIED BOTTOM PINBALL BUMPER NAV (PC & MOBILE) + LEGAL & OPACITY BAR
           ================================================================ */}
        <div className="site-bottom-stack">
          <nav className="site-pinball-dock" aria-label="Primary pinball navigation">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`site-pinball-bumper ${activeView === item.id ? 'is-active' : ''}`}
                data-marble-target="true"
                data-marble-action="click"
                aria-current={activeView === item.id ? 'page' : undefined}
                onClick={() => handleNavigate(item.id)}
              >
                {item.label}
              </button>
            ))}
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
                  className="site-bottombar-link"
                  onClick={() => setLegalDoc('privacy')}
                >
                  {copy.footer.privacy}
                </button>
                <button
                  type="button"
                  className="site-bottombar-link"
                  onClick={() => setLegalDoc('terms')}
                >
                  {copy.footer.terms}
                </button>
              </div>

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
                <ChevronsUpDown size={14} />
                <span className="site-opacity-label">
                  {copy.nav.opacityLabel} <strong>{transparencyPct}%</strong>
                </span>
              </button>
            </footer>
          </div>
        </div>
      </div>

      <SiteLegalModal doc={legalDoc} copy={copy.legal} onClose={() => setLegalDoc(null)} />
    </div>
  );
}
