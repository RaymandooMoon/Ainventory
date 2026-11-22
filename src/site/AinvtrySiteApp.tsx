import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronsUpDown,
  Globe,
  Mail,
  Moon,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { LoginThreeVariantId } from '../components/auth/loginThreeScenes.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import {
  ArchitectureLayerExplorer,
  BenchmarksIrScorecard,
  GoogleMapsPipelinePanel,
  ProductionStackMatrix,
} from './SiteIrPanels.tsx';
import SiteLegalModal from './SiteLegalModal.tsx';
import SiteMarbleHero from './SiteMarbleHero.tsx';
import {
  AppPreviewShowcasePanel,
  AtelierShowcasePanel,
  IngestionShowcasePanel,
  IntelligenceShowcasePanel,
  PrivacyShowcasePanel,
} from './SiteShowcases.tsx';
import {
  SITE_COPY,
  SITE_META,
  type LegalDocKind,
  type SiteLang,
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

export default function AinvtrySiteApp() {
  const [theme, setTheme] = useState<SiteTheme>('dark');
  const [lang, setLang] = useState<SiteLang>('en');
  const [motionVariant, setMotionVariant] = useState<LoginThreeVariantId>('luxury');
  const [variantOrigin, setVariantOrigin] = useState<{
    readonly x: number;
    readonly y: number;
    readonly seq: number;
  } | null>(null);
  const [activeView, setActiveView] = useState<SiteViewId>('home');
  const [studioTab, setStudioTab] = useState<'preview' | 'atelier' | 'intelligence'>('preview');
  const [archTab, setArchTab] = useState<'stack' | 'maps' | 'vision'>('stack');
  const [benchTab, setBenchTab] = useState<'kpi' | 'matrix'>('kpi');
  const [aboutMobileTab, setAboutMobileTab] = useState<'mission' | 'founder'>('mission');
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
    setMotionVariant((prev) => (prev === 'luxury' ? 'aurora' : 'luxury'));
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
                    ? `Switch 3D silk backdrop (${motionVariant === 'luxury' ? 'Luxury' : 'Aurora'})`
                    : `3D 실크 배경 전환 (${motionVariant === 'luxury' ? '럭셔리' : '오로라'})`
                }
              >
                <Sparkles size={14} />
                <span>
                  {motionVariant === 'luxury' ? copy.nav.silkLuxury : copy.nav.silkAurora}
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
            SINGLE-VIEWPORT SPATIAL STAGE — UNIFORM IR GLASS WINDOW FRAME
           ================================================================ */}
        <main className="site-stage" aria-live="polite">
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
                  <div className="site-subtab-group" role="tablist" aria-label="Studio modules">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={studioTab === 'preview'}
                      className={`site-subtab-pill ${studioTab === 'preview' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setStudioTab('preview');
                      }}
                    >
                      {copy.subtabs.studioPreview}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={studioTab === 'atelier'}
                      className={`site-subtab-pill ${studioTab === 'atelier' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setStudioTab('atelier');
                      }}
                    >
                      {copy.subtabs.studioAtelier}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={studioTab === 'intelligence'}
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

                <div className="site-panel-body">
                  {studioTab === 'preview' ? (
                    <AppPreviewShowcasePanel copy={copy.appPreview} lang={lang} theme={theme} />
                  ) : (
                    <div className="site-panel-split">
                      <div className="site-pillar-copy">
                        <span className="site-pillar-code">{activeStudioPillar.code}</span>
                        <p className="site-pillar-eyebrow">{activeStudioPillar.eyebrow}</p>
                        <h2 className="site-pillar-title">{activeStudioPillar.title}</h2>
                        <p className="site-pillar-desc">{activeStudioPillar.description}</p>
                        <ul className="site-bullet-list">
                          {activeStudioPillar.bullets.map((b) => (
                            <li key={b}>
                              <Check size={15} />
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

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
              <div className="site-glass-panel">
                <div className="site-panel-header">
                  <div
                    className="site-subtab-group"
                    role="tablist"
                    aria-label="Architecture modules"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={archTab === 'stack'}
                      className={`site-subtab-pill ${archTab === 'stack' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setArchTab('stack');
                      }}
                    >
                      {copy.subtabs.archStack}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={archTab === 'maps'}
                      className={`site-subtab-pill ${archTab === 'maps' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setArchTab('maps');
                      }}
                    >
                      {copy.subtabs.archMaps}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={archTab === 'vision'}
                      className={`site-subtab-pill ${archTab === 'vision' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setArchTab('vision');
                      }}
                    >
                      {copy.subtabs.archCutoutPrivacy}
                    </button>
                  </div>
                  <span className="site-pill-badge">{copy.architecture.badge}</span>
                </div>

                <div className="site-panel-body">
                  {archTab === 'stack' && <ArchitectureLayerExplorer copy={copy.architecture} />}
                  {archTab === 'maps' && <GoogleMapsPipelinePanel copy={copy.architecture} />}
                  {archTab === 'vision' && (
                    <div className="site-panel-split site-panel-split--vision">
                      <IngestionShowcasePanel copy={copy.interactive} />
                      <div className="site-vision-privacy-col">
                        <span className="site-pillar-code">
                          {copy.capabilities.pillars.ingestion.code}
                        </span>
                        <h3 className="site-pillar-title">
                          {copy.capabilities.pillars.ingestion.title}
                        </h3>
                        <PrivacyShowcasePanel copy={copy.interactive} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeView === 'benchmarks' && (
            <section key="benchmarks" className="site-view site-view--panel">
              <div className="site-glass-panel">
                <div className="site-panel-header">
                  <div className="site-subtab-group" role="tablist" aria-label="Benchmark views">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={benchTab === 'kpi'}
                      className={`site-subtab-pill ${benchTab === 'kpi' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setBenchTab('kpi');
                      }}
                    >
                      {copy.subtabs.benchKpi}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={benchTab === 'matrix'}
                      className={`site-subtab-pill ${benchTab === 'matrix' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setBenchTab('matrix');
                      }}
                    >
                      {copy.subtabs.benchMatrix}
                    </button>
                  </div>
                  <span className="site-pill-badge">{copy.architecture.badge}</span>
                </div>

                <div className="site-panel-body">
                  {benchTab === 'kpi' ? (
                    <BenchmarksIrScorecard copy={copy.stack} />
                  ) : (
                    <ProductionStackMatrix copy={copy.stack} />
                  )}
                </div>
              </div>
            </section>
          )}

          {activeView === 'about' && (
            <section key="about" className="site-view site-view--panel">
              <div className="site-glass-panel" data-about-tab={aboutMobileTab}>
                <div className="site-panel-header">
                  <div className="site-subtab-group site-about-tab-switcher" role="tablist" aria-label="About sections">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={aboutMobileTab === 'mission'}
                      className={`site-subtab-pill ${aboutMobileTab === 'mission' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setAboutMobileTab('mission');
                      }}
                    >
                      {copy.subtabs.aboutMission}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={aboutMobileTab === 'founder'}
                      className={`site-subtab-pill ${aboutMobileTab === 'founder' ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setAboutMobileTab('founder');
                      }}
                    >
                      {copy.subtabs.aboutFounder}
                    </button>
                  </div>
                  <span className="site-about-desktop-kicker">{copy.vision.eyebrow}</span>
                  <span className="site-pill-badge">{copy.vision.irBadge}</span>
                </div>

                <div className="site-panel-body">
                  <div className="site-vision-grid">
                    <div className="site-vision-copy">
                      <h2 className="site-section-title">{copy.vision.heading}</h2>
                      <blockquote className="site-vision-quote">{copy.vision.quote}</blockquote>

                      <div className="site-roadmap-block">
                        <span className="site-arch-meta-label">{copy.vision.roadmapTitle}</span>
                        <ol className="site-roadmap-list">
                          {copy.vision.milestones.map((m) => (
                            <li
                              key={m.phase}
                              className={`site-roadmap-item is-${m.status}`}
                            >
                              <span className="site-roadmap-phase">{m.phase}</span>
                              <div className="site-roadmap-text">
                                <strong>{m.title}</strong>
                                <span>{m.detail}</span>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>

                    <aside className="site-founder-card" aria-label="Company and founder details">
                      <div className="site-founder-head">
                        <div className="site-founder-avatar" aria-hidden="true">
                          RM
                        </div>
                        <div>
                          <h3 className="site-founder-name">{SITE_META.founderName}</h3>
                          <p className="site-founder-role">{copy.vision.founderRole}</p>
                          <a href={`mailto:${SITE_META.contactEmail}`} className="site-founder-email">
                            {SITE_META.contactEmail}
                          </a>
                        </div>
                      </div>

                      <p className="site-founder-bio">{copy.vision.founderBio}</p>

                      <dl className="site-dossier-list">
                        <div>
                          <dt>{copy.vision.hqLabel}</dt>
                          <dd>{copy.vision.hqValue}</dd>
                        </div>
                        <div>
                          <dt>{copy.vision.domainLabel}</dt>
                          <dd>
                            <strong>{SITE_META.domain}</strong>
                          </dd>
                        </div>
                        <div>
                          <dt>{copy.vision.stackSummaryLabel}</dt>
                          <dd>{copy.vision.stackSummaryValue}</dd>
                        </div>
                      </dl>

                      <a href={betaMailto} className="site-founder-cta">
                        <span>{copy.vision.directCta}</span>
                        <ArrowUpRight size={16} />
                      </a>
                    </aside>
                  </div>
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
