import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Globe,
  Mail,
  Moon,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { LoginThreeVariantId } from '../components/auth/loginThreeScenes.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import SiteLegalModal from './SiteLegalModal.tsx';
import SiteMarbleHero from './SiteMarbleHero.tsx';
import {
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
} from './siteContent.ts';

function SiteBrandMark({
  theme,
  size = 'hero',
}: {
  readonly theme: SiteTheme;
  readonly size?: 'nav' | 'hero' | 'footer';
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
  // Variant B (OLED Noir Runway) defaults to True OLED Dark with seamless Light/Dark toggle
  const [theme, setTheme] = useState<SiteTheme>('dark');
  const [lang, setLang] = useState<SiteLang>('en');
  const [motionVariant, setMotionVariant] = useState<LoginThreeVariantId>('luxury');
  const [variantOrigin, setVariantOrigin] = useState<{
    readonly x: number;
    readonly y: number;
    readonly seq: number;
  } | null>(null);
  const [legalDoc, setLegalDoc] = useState<LegalDocKind | null>(null);

  const heroRef = useRef<HTMLElement | null>(null);
  const copy = SITE_COPY[lang];

  useEffect(() => {
    document.documentElement.dataset.siteTheme = theme;
    document.documentElement.lang = lang;
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'dark' ? '#000000' : '#FFFFFF');
    }
  }, [theme, lang]);

  const handleToggleSilk = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    triggerHaptic('selection');
    const heroRect = heroRef.current?.getBoundingClientRect();
    if (heroRect && heroRect.width > 0 && heroRect.height > 0) {
      const btnRect = e.currentTarget.getBoundingClientRect();
      const cx = btnRect.left + btnRect.width * 0.5;
      const cy = btnRect.top + btnRect.height * 0.5;
      setVariantOrigin({
        x: ((cx - heroRect.left) / heroRect.width) * 2 - 1,
        y: -(((cy - heroRect.top) / heroRect.height) * 2 - 1),
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

  const scrollToSection = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const betaMailto = `mailto:${SITE_META.contactEmail}?subject=${encodeURIComponent(
    'Ainvtry Private Beta & Partnership Inquiry'
  )}`;

  return (
    <div className="site-root" data-site-theme={theme}>
      {/* ================================================================
          FULL-VIEWPORT 100DVH HERO INTRO — EXACT 3D SILK + ROLLING MARBLE
         ================================================================ */}
      <section ref={heroRef} id="top" className="site-hero">
        <SiteMarbleHero
          theme={theme}
          motionVariant={motionVariant}
          variantChangeOrigin={variantOrigin}
          heroRootRef={heroRef}
        />

        {/* Top Floating Translucent Navigation & Utility Bar */}
        <header className="site-topbar">
          <div className="site-topbar-left">
            <a href="#top" className="site-brand-pill" aria-label="Ainvtry home">
              <SiteBrandMark theme={theme} size="nav" />
            </a>
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

          <nav className="site-nav-links" aria-label="Primary navigation">
            <a href="#studio">{copy.nav.studio}</a>
            <a href="#technology">{copy.nav.technology}</a>
            <a href="#benchmarks">{copy.nav.metrics}</a>
            <a href="#about">{copy.nav.about}</a>
          </nav>

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
        </header>

        {/* Subtle Telemetry Sub-Strip (Desktop) */}
        <div className="site-hero-substrip" aria-hidden="true">
          <span>
            <i className="site-live-dot" />
            {copy.hero.statusBarLeft}
          </span>
          <span>{copy.hero.statusBarRight}</span>
        </div>

        {/* Center Hero Composition */}
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

        {/* Bottom CTA Pill Dock (Marble-Bounce Interactive) */}
        <div className="site-hero-dock">
          <div className="site-hero-cta-row">
            <button
              type="button"
              className="site-btn-primary"
              data-marble-target="true"
              onClick={() => scrollToSection('studio')}
            >
              <span>{copy.hero.primaryCta}</span>
              <ArrowDown size={16} />
            </button>
            <a
              href={betaMailto}
              className="site-btn-secondary"
              data-marble-target="true"
            >
              <Mail size={15} />
              <span>{copy.hero.secondaryCta}</span>
            </a>
          </div>
          <span className="site-scroll-cue">{copy.hero.scrollCue}</span>
        </div>
      </section>

      <main className="site-main">
        {/* ================================================================
            01 / 04 ARCHITECTURE REVEAL — VARIANT B SPLIT-RUNWAY SHOWCASE
           ================================================================ */}
        <section id="studio" className="site-section">
          <div className="site-container">
            <div className="site-section-topbar">
              <span>{copy.capabilities.sectionCode}</span>
              <span className="site-pill-badge">{copy.capabilities.badge}</span>
            </div>

            <div className="site-section-head">
              <div>
                <p className="site-eyebrow">{copy.capabilities.eyebrow}</p>
                <h2 className="site-section-title">{copy.capabilities.heading}</h2>
              </div>
              <p className="site-section-sub">{copy.capabilities.subheading}</p>
            </div>

            <div className="site-pillars-stack">
              {/* Pillar 01: Text Left / Interactive 3D Atelier Right */}
              <article className="site-pillar-row">
                <div className="site-pillar-copy">
                  <span className="site-pillar-code">{copy.capabilities.pillars.atelier.code}</span>
                  <p className="site-pillar-eyebrow">{copy.capabilities.pillars.atelier.eyebrow}</p>
                  <h3 className="site-pillar-title">{copy.capabilities.pillars.atelier.title}</h3>
                  <p className="site-pillar-desc">{copy.capabilities.pillars.atelier.description}</p>
                  <ul className="site-bullet-list">
                    {copy.capabilities.pillars.atelier.bullets.map((b) => (
                      <li key={b}>
                        <Check size={15} />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <AtelierShowcasePanel copy={copy.interactive} />
              </article>

              {/* Pillar 02: Interactive Before/After Left / Text Right */}
              <article id="technology" className="site-pillar-row site-pillar-row--reverse">
                <IngestionShowcasePanel copy={copy.interactive} />
                <div className="site-pillar-copy">
                  <span className="site-pillar-code">{copy.capabilities.pillars.ingestion.code}</span>
                  <p className="site-pillar-eyebrow">{copy.capabilities.pillars.ingestion.eyebrow}</p>
                  <h3 className="site-pillar-title">{copy.capabilities.pillars.ingestion.title}</h3>
                  <p className="site-pillar-desc">{copy.capabilities.pillars.ingestion.description}</p>
                  <ul className="site-bullet-list">
                    {copy.capabilities.pillars.ingestion.bullets.map((b) => (
                      <li key={b}>
                        <Check size={15} />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>

              {/* Pillar 03: Text Left / Monochrome Bento Right */}
              <article className="site-pillar-row">
                <div className="site-pillar-copy">
                  <span className="site-pillar-code">{copy.capabilities.pillars.intelligence.code}</span>
                  <p className="site-pillar-eyebrow">
                    {copy.capabilities.pillars.intelligence.eyebrow}
                  </p>
                  <h3 className="site-pillar-title">{copy.capabilities.pillars.intelligence.title}</h3>
                  <p className="site-pillar-desc">
                    {copy.capabilities.pillars.intelligence.description}
                  </p>
                  <ul className="site-bullet-list">
                    {copy.capabilities.pillars.intelligence.bullets.map((b) => (
                      <li key={b}>
                        <Check size={15} />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <IntelligenceShowcasePanel copy={copy.interactive} />
              </article>

              {/* Pillar 04: Privacy Topology Left / Text Right */}
              <article className="site-pillar-row site-pillar-row--reverse">
                <PrivacyShowcasePanel copy={copy.interactive} />
                <div className="site-pillar-copy">
                  <span className="site-pillar-code">{copy.capabilities.pillars.privacy.code}</span>
                  <p className="site-pillar-eyebrow">{copy.capabilities.pillars.privacy.eyebrow}</p>
                  <h3 className="site-pillar-title">{copy.capabilities.pillars.privacy.title}</h3>
                  <p className="site-pillar-desc">{copy.capabilities.pillars.privacy.description}</p>
                  <ul className="site-bullet-list">
                    {copy.capabilities.pillars.privacy.bullets.map((b) => (
                      <li key={b}>
                        <Check size={15} />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ================================================================
            02 / CORE ENGINE SPECIFICATION STRIP
           ================================================================ */}
        <section id="benchmarks" className="site-section site-section--banded">
          <div className="site-container">
            <div className="site-section-head">
              <div>
                <p className="site-eyebrow">{copy.stack.eyebrow}</p>
                <h2 className="site-section-title">{copy.stack.heading}</h2>
              </div>
              <p className="site-stack-note">{copy.stack.note}</p>
            </div>

            <div className="site-spec-grid">
              {copy.stack.cards.map((card) => (
                <article key={card.title} className="site-spec-card">
                  <span className="site-spec-eyebrow">{card.eyebrow}</span>
                  <strong className="site-spec-metric">{card.metric}</strong>
                  <h3 className="site-spec-title">{card.title}</h3>
                  <p className="site-spec-detail">{card.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ================================================================
            03 / COMPANY & FOUNDER DOSSIER (STARTUP & STORE CREDENTIALS)
           ================================================================ */}
        <section id="about" className="site-section">
          <div className="site-container">
            <div className="site-vision-grid">
              <div className="site-vision-copy">
                <p className="site-eyebrow">{copy.vision.eyebrow}</p>
                <h2 className="site-section-title">{copy.vision.heading}</h2>
                <blockquote className="site-vision-quote">{copy.vision.quote}</blockquote>
                <p className="site-vision-body">{copy.vision.body}</p>
                <div className="site-status-pills">
                  <span className="site-status-pill">
                    <i className="site-live-dot" />
                    {copy.vision.statusMvp}
                  </span>
                  <span className="site-status-pill">{copy.vision.statusRelease}</span>
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
                </dl>

                <a href={betaMailto} className="site-founder-cta">
                  <span>{copy.vision.directCta}</span>
                  <ArrowUpRight size={16} />
                </a>
              </aside>
            </div>
          </div>
        </section>

        {/* ================================================================
            04 / PRIVATE BETA CTA BAND
           ================================================================ */}
        <section className="site-section site-section--cta">
          <div className="site-container">
            <div className="site-cta-banner">
              <div className="site-cta-copy">
                <p className="site-eyebrow">{copy.beta.eyebrow}</p>
                <h2 className="site-cta-title">
                  {copy.beta.headingLine1}
                  <br />
                  {copy.beta.headingLine2}
                </h2>
                <p className="site-cta-body">{copy.beta.body}</p>
              </div>
              <a href={betaMailto} className="site-btn-primary site-btn-primary--lg">
                <span>{copy.beta.cta}</span>
                <ArrowUpRight size={17} />
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ================================================================
          FOOTER — STORE & STARTUP VERIFICATION COMPLIANT
         ================================================================ */}
      <footer className="site-footer">
        <div className="site-container site-footer-inner">
          <div className="site-footer-brand">
            <SiteBrandMark theme={theme} size="footer" />
            <p className="site-footer-summary">{copy.footer.summary}</p>
            <p className="site-footer-rights">{copy.footer.rights}</p>
          </div>

          <div className="site-footer-links">
            <a href={`mailto:${SITE_META.contactEmail}`} className="site-footer-link">
              {SITE_META.contactEmail}
            </a>
            <button
              type="button"
              className="site-footer-link"
              onClick={() => setLegalDoc('privacy')}
            >
              {copy.footer.privacy}
            </button>
            <button
              type="button"
              className="site-footer-link"
              onClick={() => setLegalDoc('terms')}
            >
              {copy.footer.terms}
            </button>
            <a href="#top" className="site-footer-link">
              {copy.footer.backToTop} ↑
            </a>
          </div>
        </div>
      </footer>

      <SiteLegalModal doc={legalDoc} copy={copy.legal} onClose={() => setLegalDoc(null)} />
    </div>
  );
}
