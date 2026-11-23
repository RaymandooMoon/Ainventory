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
import {
  DEFAULT_STAGE_INTERACTION_STATE,
  type ActiveStageId,
  type StageId,
  type StageInteractionState,
} from '../three/ainvtryStageDirector.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import SiteLegalModal from './SiteLegalModal.tsx';
import SiteMarbleHero from './SiteMarbleHero.tsx';
import SiteStageHud from './SiteStageHud.tsx';
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
        src={BRAND_LOGO_ASSETS.light}
        alt={isDark ? '' : 'iNVTRY — Ainvtry'}
        aria-hidden={isDark}
        width={1120}
        height={394}
        decoding="async"
        className={`site-logo-img ${!isDark ? 'is-visible' : ''}`}
      />
      <img
        src={BRAND_LOGO_ASSETS.dark}
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

  const [activeStage, setActiveStage] = useState<StageId>('hero');
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

  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeStageRef = useRef<StageId>(activeStage);
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

  // Escape key smoothly returns from any 3D stage back to HERO (when Legal Modal is closed)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && legalDoc === null && activeStageRef.current !== 'hero') {
        e.preventDefault();
        triggerHaptic('selection');
        setActiveStage('hero');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [legalDoc]);

  // Clean up one-shot gold ripple burst timer on unmount
  useEffect(() => {
    return () => {
      if (rippleTimerRef.current) {
        window.clearTimeout(rippleTimerRef.current);
      }
    };
  }, []);

  // Global desktop wheel opacity gesture (isolated from .site-hud-scroll & modals).
  // Mobile HERO finger swipes are intentionally NOT intercepted here so users roll the
  // 3D marble freely without triggering per-frame setUiAlpha re-renders; mobile users
  // control Glass % cleanly via the dedicated bottom-right Glass % drag pill.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (rootRef.current) {
      rootRef.current.style.setProperty('--site-ui-alpha', uiAlphaRef.current.toFixed(3));
    }

    const isWheelExcluded = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el || typeof el.closest !== 'function') return false;
      return Boolean(
        el.closest(
          '.site-hud-scroll, [data-hud-surface="true"], input, textarea, select, [data-no-marble="true"], [role="dialog"], [aria-modal="true"]'
        )
      );
    };

    const onWheel = (e: WheelEvent) => {
      if (!Number.isFinite(e.deltaY) || e.deltaY === 0 || isWheelExcluded(e.target)) return;
      const step = (e.deltaY / 420) * 0.45;
      applyUiAlpha(uiAlphaRef.current + step);
    };

    window.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      window.removeEventListener('wheel', onWheel);
    };
  }, [applyUiAlpha]);

  const handleSelectStage = useCallback((nextStage: StageId) => {
    triggerHaptic('selection');
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
  }, []);

  const handleUpdateInteraction = useCallback((patch: Partial<StageInteractionState>) => {
    setStageInteraction((prev) => ({ ...prev, ...patch }));
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
         ================================================================ */}
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

      <div className="site-shell">
        {/* ================================================================
            PERSISTENT FLOATING UTILITY TOPBAR (MARBLE-HITTABLE IN HERO)
           ================================================================ */}
        <header className="site-header-stack">
          <div className="site-topbar">
            <div className="site-topbar-left">
              <button
                type="button"
                className={`site-brand-pill ${activeStage === 'hero' ? 'is-home-active' : ''}`}
                data-marble-target="true"
                data-marble-action="click"
                onClick={() => handleSelectStage('hero')}
                aria-label={copy.nav.homeAria}
                aria-current={activeStage === 'hero' ? 'page' : undefined}
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
                <Sparkles size={14} aria-hidden="true" />
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
                {theme === 'dark' ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
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
                <Globe size={15} aria-hidden="true" />
                <span>{copy.nav.switchLang}</span>
              </button>
            </div>
          </div>
        </header>

        {/* ================================================================
            CENTRAL SPATIAL STAGE: HERO OVERLAY OR LEFT-58% OPEN + RIGHT-38% HUD
           ================================================================ */}
        <main className="site-stage">
          {activeStage === 'hero' ? (
            <section key="hero" className="site-view site-view--home">
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
                    <Mail size={15} aria-hidden="true" />
                    <span>{copy.hero.secondaryCta}</span>
                  </a>
                </div>
              </div>
            </section>
          ) : (
            <SiteStageHud
              activeStage={activeStage}
              copy={copy}
              lang={lang}
              theme={theme}
              betaMailto={betaMailto}
              interaction={stageInteraction}
              selectedPrivacyShield={selectedPrivacyShield}
              onSelectPrivacyShield={setSelectedPrivacyShield}
              onUpdateInteraction={handleUpdateInteraction}
            />
          )}
        </main>

        {/* ================================================================
            BOTTOM 4-PILL DOCK (WITH GOLD CONCENTRIC RIPPLE) + FOOTER RAIL
           ================================================================ */}
        <div className="site-bottom-stack">
          <nav className="site-pinball-dock site-dock" aria-label="Primary 3D stage navigation">
            {BOTTOM_STAGE_PILLS.map((pill) => {
              const isSelected = activeStage === pill.stageId;
              const isBursting = rippleBurst?.stageId === pill.stageId;
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
                  onClick={() => handleSelectStage(pill.stageId)}
                >
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
                <ChevronsUpDown size={14} aria-hidden="true" />
                <span className="site-opacity-label">
                  {copy.nav.opacityLabel} <strong>{transparencyPct}%</strong>
                </span>
              </button>
            </footer>
          </div>
        </div>
      </div>

      <SiteLegalModal doc={legalDoc} copy={copy.legal} onClose={handleCloseLegal} />
    </div>
  );
}
