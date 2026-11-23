import { useId, useState } from 'react';
import { Calendar, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { SiteIcon } from './SiteIcon.tsx';
import {
  resolveAppPreviewSrc,
  type SiteAppPreviewScreen,
  type SiteCopy,
  type SiteLang,
  type SitePillarCopy,
  type SiteTheme,
} from './siteContent.ts';

function handleArrowKeys<T extends string>(
  e: React.KeyboardEvent<HTMLDivElement>,
  ids: readonly T[],
  current: T,
  domPrefix: string,
  onSelect: (id: T) => void
) {
  const idx = ids.indexOf(current);
  if (idx < 0) return;
  let nextIdx = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextIdx = (idx + 1) % ids.length;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') nextIdx = (idx - 1 + ids.length) % ids.length;
  else if (e.key === 'Home') nextIdx = 0;
  else if (e.key === 'End') nextIdx = ids.length - 1;
  if (nextIdx >= 0) {
    e.preventDefault();
    const target = ids[nextIdx];
    triggerHaptic('selection');
    onSelect(target);
    document.getElementById(`${domPrefix}-${target}`)?.focus();
  }
}

/**
 * Icon-First Live Developing Mobile App Preview Showcase (4-Mode Synced).
 */
export function AppPreviewShowcasePanel({
  copy,
  lang,
  theme,
}: {
  readonly copy: SiteCopy['appPreview'];
  readonly lang: SiteLang;
  readonly theme: SiteTheme;
}) {
  const [activeId, setActiveId] = useState<SiteAppPreviewScreen['id']>('outfits');
  const uid = useId();
  const activeScreen =
    copy.screens.find((screen) => screen.id === activeId) ?? copy.screens[0];
  const resolvedSrc = resolveAppPreviewSrc(activeScreen.id, lang, theme);
  const modeLabel = `${lang === 'ko' ? '한국어' : 'English'} · ${theme === 'dark' ? (lang === 'ko' ? '다크' : 'Dark') : lang === 'ko' ? '라이트' : 'Light'}`;
  const screenIds = copy.screens.map((s) => s.id);

  return (
    <div className="site-app-preview-layout">
      <div className="site-app-preview-copy">
        <div className="site-preview-kicker-row">
          <span className="site-pillar-code">{copy.code}</span>
          <span className="site-sync-mode-label">{modeLabel}</span>
        </div>
        <h2 className="site-pillar-title">{copy.title}</h2>

        <div
          className="site-preview-selector-grid"
          role="tablist"
          aria-label="App preview screens"
          onKeyDown={(e) =>
            handleArrowKeys(e, screenIds, activeScreen.id, `${uid}-screen`, setActiveId)
          }
        >
          {copy.screens.map((screen) => {
            const isSelected = screen.id === activeScreen.id;
            return (
              <button
                key={screen.id}
                id={`${uid}-screen-${screen.id}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`${uid}-screen-caption`}
                tabIndex={isSelected ? 0 : -1}
                className={`site-preview-card-btn ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  setActiveId(screen.id);
                }}
              >
                <span className="site-icon-tile-glyph">
                  <SiteIcon name={screen.icon} size={17} />
                </span>
                <strong className="site-preview-card-title">{screen.tabLabel}</strong>
              </button>
            );
          })}
        </div>

        <div
          id={`${uid}-screen-caption`}
          className="site-icon-inspector site-preview-desktop-inspector"
          role="tabpanel"
          aria-labelledby={`${uid}-screen-${activeScreen.id}`}
          aria-live="polite"
        >
          <div className="site-icon-inspector-main">
            <span className="site-icon-inspector-glyph">
              <SiteIcon name={activeScreen.icon} size={14} />
            </span>
            <strong className="site-icon-inspector-title">{activeScreen.title}</strong>
            <span className="site-bp-spec-tag is-primary">{activeScreen.metricTag}</span>
            <p className="site-icon-inspector-text">{activeScreen.caption}</p>
          </div>
        </div>
      </div>

      <div className="site-app-preview-device-col">
        <div className="site-phone-bezel" data-phone-theme={theme}>
          <div className="site-phone-island" aria-hidden="true" />
          <div className="site-phone-screen">
            <img
              key={`${activeScreen.id}-${lang}-${theme}`}
              src={resolvedSrc}
              alt={`${activeScreen.imageAlt} (${modeLabel})`}
              width={500}
              height={1044}
              decoding="sync"
              fetchPriority="high"
              className="site-phone-screen-img"
            />
          </div>
          <div className="site-phone-home-bar" aria-hidden="true" />
        </div>

        <p id={`${uid}-mscreen-caption`} className="site-preview-caption-text">
          {activeScreen.caption}
        </p>

        {/* Compact 4-icon switcher for mobile viewports */}
        <div
          className="site-preview-mobile-pills"
          role="tablist"
          aria-label="Mobile app preview selector"
          onKeyDown={(e) =>
            handleArrowKeys(e, screenIds, activeScreen.id, `${uid}-mscreen`, setActiveId)
          }
        >
          {copy.screens.map((screen) => {
            const isSelected = screen.id === activeScreen.id;
            return (
              <button
                key={screen.id}
                id={`${uid}-mscreen-${screen.id}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`${uid}-mscreen-caption`}
                tabIndex={isSelected ? 0 : -1}
                className={`site-preview-mobile-pill ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  setActiveId(screen.id);
                }}
              >
                <SiteIcon name={screen.icon} size={13} />
                <span>{screen.tabLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Icon-First Studio Feature Dock replacing long text walls & bullet lists.
 * Clicking any of the 4 sculptural feature icons updates the concise 1-line inspector below.
 */
export function StudioFeatureIconDock({
  pillar,
  tapHint,
}: {
  readonly pillar: SitePillarCopy;
  readonly tapHint: string;
}) {
  const [activeId, setActiveId] = useState<string>(pillar.features[0].id);
  const uid = useId();
  const activeFeature =
    pillar.features.find((f) => f.id === activeId) ?? pillar.features[0];
  const featIds = pillar.features.map((f) => f.id);

  return (
    <div className="site-studio-icon-dock">
      <div className="site-studio-dock-head">
        <h2 className="site-pillar-title">{pillar.title}</h2>
      </div>

      <div
        className="site-studio-feature-grid"
        role="tablist"
        aria-label={pillar.title}
        onKeyDown={(e) =>
          handleArrowKeys(e, featIds, activeFeature.id, `${uid}-feat`, setActiveId)
        }
      >
        {pillar.features.map((feat) => {
          const isSelected = feat.id === activeFeature.id;
          return (
            <button
              key={feat.id}
              id={`${uid}-feat-${feat.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`${uid}-feat-panel`}
              tabIndex={isSelected ? 0 : -1}
              className={`site-studio-feat-btn ${isSelected ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                setActiveId(feat.id);
              }}
            >
              <span className="site-icon-tile-glyph">
                <SiteIcon name={feat.icon} size={18} />
              </span>
              <strong className="site-studio-feat-title">{feat.label}</strong>
            </button>
          );
        })}
      </div>

      <div
        id={`${uid}-feat-panel`}
        className="site-icon-inspector"
        role="tabpanel"
        aria-labelledby={`${uid}-feat-${activeFeature.id}`}
        aria-live="polite"
      >
        <div className="site-icon-inspector-main">
          <span className="site-icon-inspector-glyph">
            <SiteIcon name={activeFeature.icon} size={15} />
          </span>
          <strong className="site-icon-inspector-title">{activeFeature.label}</strong>
          <span className="site-bp-spec-tag is-primary">{activeFeature.tag}</span>
          <p className="site-icon-inspector-text">{activeFeature.detail}</p>
        </div>
        <span className="site-inspector-hint-sr">{tapHint}</span>
      </div>
    </div>
  );
}

type AtelierStance = 'idle' | 'walk' | 'rain';

const STANCE_TELEMETRY: Readonly<
  Record<AtelierStance, { readonly bone: string; readonly drape: string }>
> = {
  idle: { bone: 'BONE_SPINE_02', drape: '0.942 N/m²' },
  walk: { bone: 'BONE_L_CLAVICLE_12', drape: '1.184 N/m²' },
  rain: { bone: 'BONE_R_WRIST_UMBRELLA', drape: '1.310 N/m²' },
};

export function AtelierShowcasePanel({
  copy,
}: {
  readonly copy: SiteCopy['interactive'];
}) {
  const [stance, setStance] = useState<AtelierStance>('idle');
  const telemetry = STANCE_TELEMETRY[stance];

  return (
    <div className="site-showcase-frame site-showcase-atelier" data-stance={stance}>
      <div className="site-atelier-stage">
        <div className="site-atelier-backdrop-glow" aria-hidden="true" />
        <div className="site-atelier-garment-stack">
          <img
            src="/assets/garments/beige-trench.webp"
            alt="Beige cotton twill trench coat 3D wardrobe cutout"
            width={480}
            height={640}
            decoding="async"
            className="site-atelier-main-garment"
          />
          <div className="site-atelier-thumbs" aria-hidden="true">
            <div className="site-atelier-thumb">
              <img src="/assets/garments/cream-knit.webp" alt="" width={120} height={120} decoding="async" />
            </div>
            <div className="site-atelier-thumb">
              <img src="/assets/garments/charcoal-slacks.webp" alt="" width={120} height={120} decoding="async" />
            </div>
            <div className="site-atelier-thumb">
              <img src="/assets/garments/black-loafers.webp" alt="" width={120} height={120} decoding="async" />
            </div>
          </div>
        </div>

        <div className="site-atelier-hud">
          <div className="site-atelier-hud-meta">
            <span>
              <strong>{telemetry.bone}</strong> · {telemetry.drape}
            </span>
            <span className="site-pccs-tag">{copy.pccsNote}</span>
          </div>
          <div className="site-stance-pills" role="group" aria-label="3D motion posture">
            {(
              [
                ['idle', copy.stanceIdle],
                ['walk', copy.stanceWalk],
                ['rain', copy.stanceRain],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`site-stance-pill ${stance === id ? 'is-active' : ''}`}
                aria-pressed={stance === id}
                onClick={() => {
                  triggerHaptic('selection');
                  setStance(id);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function IngestionShowcasePanel({
  copy,
}: {
  readonly copy: SiteCopy['interactive'];
}) {
  const [splitPct, setSplitPct] = useState(52);

  return (
    <div className="site-showcase-frame site-showcase-ingestion">
      <div className="site-compare-viewport" data-no-marble="true">
        <div className="site-compare-layer site-compare-after">
          <img
            src="/assets/garments/beige-trench.webp"
            alt="Alpha-matted WebP garment cutout"
            width={480}
            height={640}
            decoding="async"
          />
          <span className="site-compare-chip site-compare-chip--right">{copy.afterLabel}</span>
        </div>

        <div
          className="site-compare-layer site-compare-before"
          style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
        >
          <img
            src="/assets/garments/beige-trench.jpg"
            alt="Original garment photograph before background removal"
            width={480}
            height={640}
            decoding="async"
          />
          <span className="site-compare-chip site-compare-chip--left">{copy.beforeLabel}</span>
        </div>

        <div
          className="site-compare-divider"
          style={{ left: `${splitPct}%` }}
          aria-hidden="true"
        >
          <span className="site-compare-knob">
            <SlidersHorizontal size={14} />
          </span>
        </div>

        <input
          type="range"
          min={12}
          max={88}
          value={splitPct}
          onChange={(e) => setSplitPct(Number(e.target.value))}
          aria-label={copy.sliderHint}
          className="site-compare-range"
        />
      </div>

      <div className="site-ingestion-footer">
        <span className="site-ingestion-badge">{copy.ingestionBadge}</span>
        <span className="site-ingestion-meta">{copy.ingestionMeta}</span>
      </div>
    </div>
  );
}

export function IntelligenceShowcasePanel({
  copy,
}: {
  readonly copy: SiteCopy['interactive'];
}) {
  return (
    <div className="site-showcase-frame site-showcase-bento">
      <div className="site-bento-pair">
        <div className="site-bento-card">
          <span className="site-bento-label">{copy.cpwLabel}</span>
          <strong className="site-bento-metric">{copy.cpwValue}</strong>
          <span className="site-bento-delta">{copy.cpwDelta}</span>
          <div className="site-bento-bar" aria-hidden="true">
            <span style={{ width: '74%' }} />
          </div>
        </div>

        <div className="site-bento-card">
          <span className="site-bento-label">{copy.balanceLabel}</span>
          <div className="site-bento-ring-row">
            <svg width="42" height="42" viewBox="0 0 44 44" aria-hidden="true" className="site-ring-svg">
              <circle cx="22" cy="22" r="18" className="site-ring-track" />
              <circle
                cx="22"
                cy="22"
                r="18"
                className="site-ring-fill"
                strokeDasharray="113.1"
                strokeDashoffset="11.3"
              />
            </svg>
            <div>
              <strong className="site-bento-metric">{copy.balanceValue}</strong>
              <span className="site-bento-sub">{copy.balanceMeta}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="site-bento-compact-row">
        <div className="site-bento-pill-card">
          <ShieldCheck size={15} aria-hidden="true" />
          <strong>{copy.dupTitle}</strong>
          <span className="site-bp-spec-tag">{copy.dupStatus}</span>
        </div>

        <div className="site-bento-pill-card">
          <Calendar size={15} aria-hidden="true" />
          <strong>{copy.ootdTitle}</strong>
          <span className="site-bp-spec-tag">{copy.ootdDate}</span>
        </div>
      </div>
    </div>
  );
}
