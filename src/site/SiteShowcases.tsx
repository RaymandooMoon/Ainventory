import { useState } from 'react';
import {
  Calendar,
  Camera,
  CheckCircle2,
  Cpu,
  HardDrive,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
} from 'lucide-react';
import type { SiteAppPreviewScreen, SiteCopy } from './siteContent.ts';

export function AppPreviewShowcasePanel({
  copy,
}: {
  readonly copy: SiteCopy['appPreview'];
}) {
  const [activeId, setActiveId] = useState<SiteAppPreviewScreen['id']>('outfits');
  const activeScreen =
    copy.screens.find((screen) => screen.id === activeId) ?? copy.screens[0];

  return (
    <div className="site-app-preview-layout">
      <div className="site-app-preview-copy">
        <span className="site-pillar-code">{copy.code}</span>
        <p className="site-pillar-eyebrow">{copy.eyebrow}</p>
        <h2 className="site-pillar-title">{copy.title}</h2>
        <p className="site-pillar-desc">{copy.description}</p>

        <div className="site-preview-selector-grid" role="tablist" aria-label="App preview screens">
          {copy.screens.map((screen, idx) => {
            const isSelected = screen.id === activeScreen.id;
            return (
              <button
                key={screen.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`site-preview-card-btn ${isSelected ? 'is-active' : ''}`}
                onClick={() => setActiveId(screen.id)}
              >
                <span className="site-preview-card-index">0{idx + 1}</span>
                <span className="site-preview-card-text">
                  <strong>{screen.tabLabel}</strong>
                  <small>{screen.title}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="site-app-preview-device-col">
        <div className="site-phone-bezel">
          <div className="site-phone-island" aria-hidden="true" />
          <div className="site-phone-screen">
            <img
              key={activeScreen.id}
              src={activeScreen.imageSrc}
              alt={activeScreen.imageAlt}
              width={520}
              height={1125}
              decoding="sync"
              fetchPriority="high"
              className="site-phone-screen-img"
            />
          </div>
          <div className="site-phone-home-bar" aria-hidden="true" />
        </div>

        <div className="site-preview-caption-pill">
          <Smartphone size={13} />
          <span>{activeScreen.caption}</span>
        </div>

        {/* Compact 4-pill switcher for mobile viewports */}
        <div
          className="site-preview-mobile-pills"
          role="tablist"
          aria-label="Mobile app preview selector"
        >
          {copy.screens.map((screen) => {
            const isSelected = screen.id === activeScreen.id;
            return (
              <button
                key={screen.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`site-preview-mobile-pill ${isSelected ? 'is-active' : ''}`}
                onClick={() => setActiveId(screen.id)}
              >
                {screen.tabLabel}
              </button>
            );
          })}
        </div>
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
            loading="lazy"
            className="site-atelier-main-garment"
          />
          <div className="site-atelier-thumbs" aria-hidden="true">
            <div className="site-atelier-thumb">
              <img src="/assets/garments/cream-knit.webp" alt="" width={120} height={120} loading="lazy" />
            </div>
            <div className="site-atelier-thumb">
              <img src="/assets/garments/charcoal-slacks.webp" alt="" width={120} height={120} loading="lazy" />
            </div>
            <div className="site-atelier-thumb">
              <img src="/assets/garments/black-loafers.webp" alt="" width={120} height={120} loading="lazy" />
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
                onClick={() => setStance(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="site-mini-spec-row">
        <div className="site-mini-spec">
          <span className="site-mini-spec-label">{copy.rigLabel}</span>
          <strong className="site-mini-spec-value">{copy.rigValue}</strong>
          <span className="site-mini-spec-sub">{copy.rigMeta}</span>
        </div>
        <div className="site-mini-spec">
          <span className="site-mini-spec-label">{copy.morphLabel}</span>
          <strong className="site-mini-spec-value">{copy.morphValue}</strong>
          <span className="site-mini-spec-sub">{copy.morphMeta}</span>
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
        {/* After layer: Alpha-matted studio WebP cutout on precision alpha grid */}
        <div className="site-compare-layer site-compare-after">
          <img
            src="/assets/garments/beige-trench.webp"
            alt="Alpha-matted WebP garment cutout"
            width={480}
            height={640}
            loading="lazy"
          />
          <span className="site-compare-chip site-compare-chip--right">{copy.afterLabel}</span>
        </div>

        {/* Before layer: Clipped original photograph */}
        <div
          className="site-compare-layer site-compare-before"
          style={{ clipPath: `inset(0 ${100 - splitPct}% 0 0)` }}
        >
          <img
            src="/assets/garments/beige-trench.jpg"
            alt="Original garment photograph before background removal"
            width={480}
            height={640}
            loading="lazy"
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
        <div>
          <p className="site-ingestion-badge">{copy.ingestionBadge}</p>
          <p className="site-ingestion-meta">{copy.ingestionMeta}</p>
        </div>
        <span className="site-status-dot-pill">
          <CheckCircle2 size={14} />
          <span>QC PASS</span>
        </span>
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
            <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true" className="site-ring-svg">
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

      <div className="site-bento-strip">
        <div className="site-bento-strip-head">
          <span className="site-bento-strip-title">
            <ShieldCheck size={15} />
            {copy.dupTitle}
          </span>
          <span className="site-active-badge">{copy.dupStatus}</span>
        </div>
        <p className="site-bento-strip-desc">{copy.dupDesc}</p>
      </div>

      <div className="site-bento-ootd">
        <div className="site-ootd-date-badge">
          <Calendar size={14} />
          <span>{copy.ootdDate}</span>
        </div>
        <div className="site-ootd-copy">
          <strong>{copy.ootdTitle}</strong>
          <span>{copy.ootdMeta}</span>
        </div>
      </div>
    </div>
  );
}

export function PrivacyShowcasePanel({
  copy,
}: {
  readonly copy: SiteCopy['interactive'];
}) {
  const icons = [Camera, Cpu, HardDrive] as const;

  return (
    <div className="site-showcase-frame site-showcase-privacy">
      <p className="site-topology-kicker">{copy.topologyTitle}</p>
      <div className="site-topology-grid">
        {copy.topologySteps.map((step, idx) => {
          const Icon = icons[idx] ?? HardDrive;
          return (
            <div key={step.title} className="site-topology-node">
              <span className="site-topology-icon">
                <Icon size={18} />
              </span>
              <strong>{step.title}</strong>
              <span>{step.sub}</span>
            </div>
          );
        })}
      </div>
      <div className="site-topology-bar">
        <span>{copy.topologyFooterLeft}</span>
        <strong className="site-topology-zero">{copy.topologyFooterRight}</strong>
      </div>
    </div>
  );
}
