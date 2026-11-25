import { useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, SlidersHorizontal } from 'lucide-react';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import {
  resolveAppPreviewSrc,
  STUDIO_GARMENT_ASSETS,
  type SiteCopy,
  type SiteLang,
  type SiteTheme,
} from './siteContent.ts';

export interface HeroVisualProofCardProps {
  readonly copy: SiteCopy;
  readonly lang: SiteLang;
  readonly theme: SiteTheme;
  readonly onLaunchStudio: () => void;
}

type ProofMode = 'vton' | 'exif';
const PROOF_MODES: readonly ProofMode[] = ['vton', 'exif'];

/**
 * Spatial Editorial Noir visual proof showcase rendered on the HERO stage.
 * - `vton` mode: pairs real 24 KB background-removed garment input on a neutral architectural
 *   stone studio surface with the live 8-angle 2D VTON fitting output.
 * - `exif` mode: interactive Before/After wipe proving client-side 582 KB -> 24 KB WebP (-96%)
 *   EXIF/GPS & background stripping before cloud inference.
 */
export default function HeroVisualProofCard({
  copy,
  lang,
  theme,
  onLaunchStudio,
}: HeroVisualProofCardProps) {
  const [mode, setMode] = useState<ProofMode>('vton');
  const [splitPct, setSplitPct] = useState<number>(52);
  const vtonTabRef = useRef<HTMLButtonElement | null>(null);
  const exifTabRef = useRef<HTMLButtonElement | null>(null);

  const fittingPreviewSrc = resolveAppPreviewSrc('outfits', lang, theme);
  const tablistLabel = lang === 'ko' ? '히어로 실증 프리뷰 전환' : 'Hero proof preview mode';
  const activeTabId = mode === 'vton' ? 'hero-proof-tab-vton' : 'hero-proof-tab-exif';

  const handleSelectMode = (nextMode: ProofMode) => {
    if (nextMode === mode) return;
    triggerHaptic('selection');
    setMode(nextMode);
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = PROOF_MODES.indexOf(mode);
    let nextIdx = -1;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % PROOF_MODES.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + PROOF_MODES.length) % PROOF_MODES.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = PROOF_MODES.length - 1;
    if (nextIdx < 0) return;

    e.preventDefault();
    const nextMode = PROOF_MODES[nextIdx];
    handleSelectMode(nextMode);
    (nextMode === 'vton' ? vtonTabRef.current : exifTabRef.current)?.focus();
  };

  return (
    <aside
      className="site-hero-proof-card"
      data-no-marble="true"
      aria-label={mode === 'vton' ? copy.hero.proofBadgeVton : copy.hero.proofBadgeExif}
    >
      <header className="site-hero-proof-head">
        <div className="site-hero-proof-status">
          <span className="site-hero-proof-dot" aria-hidden="true" />
          <span className="site-hero-proof-badge">
            {mode === 'vton' ? copy.hero.proofBadgeVton : copy.hero.proofBadgeExif}
          </span>
        </div>

        <div
          className="site-hero-proof-tabs"
          role="tablist"
          aria-label={tablistLabel}
          onKeyDown={handleTabKeyDown}
        >
          <button
            ref={vtonTabRef}
            id="hero-proof-tab-vton"
            type="button"
            role="tab"
            aria-selected={mode === 'vton'}
            aria-controls="hero-proof-panel"
            tabIndex={mode === 'vton' ? 0 : -1}
            className={`site-hero-proof-tab ${mode === 'vton' ? 'is-active' : ''}`}
            onClick={() => handleSelectMode('vton')}
          >
            {copy.hero.proofTabVton}
          </button>
          <button
            ref={exifTabRef}
            id="hero-proof-tab-exif"
            type="button"
            role="tab"
            aria-selected={mode === 'exif'}
            aria-controls="hero-proof-panel"
            tabIndex={mode === 'exif' ? 0 : -1}
            className={`site-hero-proof-tab ${mode === 'exif' ? 'is-active' : ''}`}
            onClick={() => handleSelectMode('exif')}
          >
            {copy.hero.proofTabExif}
          </button>
        </div>
      </header>

      <div id="hero-proof-panel" role="tabpanel" aria-labelledby={activeTabId}>
        {mode === 'vton' ? (
          <div className="site-hero-proof-split">
            <figure className="site-hero-proof-pane site-hero-proof-pane--stone">
              <img
                src={STUDIO_GARMENT_ASSETS.trenchWebp}
                alt={copy.hero.proofInputLabel}
                width={640}
                height={853}
                decoding="async"
                className="site-hero-proof-garment"
              />
              <figcaption className="site-hero-proof-pill">{copy.hero.proofInputLabel}</figcaption>
            </figure>

            <span className="site-hero-proof-bridge" aria-hidden="true">
              <ArrowRight size={13} />
            </span>

            <figure className="site-hero-proof-pane site-hero-proof-pane--live">
              <img
                src={fittingPreviewSrc}
                alt={copy.hero.proofOutputLabel}
                width={390}
                height={844}
                decoding="async"
                className="site-hero-proof-vton"
              />
              <figcaption className="site-hero-proof-pill site-hero-proof-pill--accent">
                {copy.hero.proofOutputLabel}
              </figcaption>
            </figure>
          </div>
        ) : (
          <div className="site-hero-proof-compare">
            <div className="site-hero-compare-stage">
              <div className="site-hero-compare-layer site-hero-compare-layer--after">
                <img
                  src={STUDIO_GARMENT_ASSETS.trenchWebp}
                  alt={copy.interactive.afterLabel}
                  width={640}
                  height={853}
                  decoding="async"
                />
              </div>

              <div
                className="site-hero-compare-layer site-hero-compare-layer--before"
                style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
              >
                <img
                  src={STUDIO_GARMENT_ASSETS.trenchOriginalJpg}
                  alt={copy.interactive.beforeLabel}
                  width={640}
                  height={853}
                  decoding="async"
                />
              </div>

              <span className="site-hero-compare-tag site-hero-compare-tag--left">
                {copy.interactive.beforeLabel} · 582 KB
              </span>
              <span className="site-hero-compare-tag site-hero-compare-tag--right">
                {copy.interactive.afterLabel} · 24 KB
              </span>

              <div
                className="site-hero-compare-line"
                style={{ left: `${splitPct}%` }}
                aria-hidden="true"
              >
                <span className="site-hero-compare-knob">
                  <SlidersHorizontal size={12} />
                </span>
              </div>

              <input
                type="range"
                min={12}
                max={88}
                value={splitPct}
                aria-label={copy.interactive.sliderHint}
                className="site-hero-compare-input"
                onChange={(e) => setSplitPct(Number(e.target.value))}
              />
            </div>
          </div>
        )}
      </div>

      <footer className="site-hero-proof-foot">
        <span className="site-hero-proof-meta">{copy.interactive.ingestionMeta}</span>
        <button
          type="button"
          className="site-hero-proof-link"
          onClick={onLaunchStudio}
        >
          <span>{copy.hero.proofFooterCta}</span>
          <ArrowUpRight size={13} aria-hidden="true" />
        </button>
      </footer>
    </aside>
  );
}
