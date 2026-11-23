import { useId, useState } from 'react';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { SiteIcon } from './SiteIcon.tsx';
import type { SiteCopy, SitePipelineNode } from './siteContent.ts';

type WeatherMood = 'sunny' | 'rain' | 'wind';

/**
 * Approved Variant B — 'Google API × 3D' inside Architecture.
 * Left: Live interactive Google API x Three.js 0.187 Engine Theater
 *       (Weather umbrella/rain physics, Street View avatar staging, Places Care Map,
 *        Vertex No-Training VTON, MediaPipe 0B WASM, Calendar API TO-DO).
 * Right: 2x3 Subtitle-Free Google API Icon Dock + Compliance Strip.
 * Bottom: Uniform 1-line inspector.
 */
export function GoogleApiTheaterPanel({
  copy,
  tapHint,
}: {
  readonly copy: SiteCopy['architecture'];
  readonly tapHint: string;
}) {
  const [selectedId, setSelectedId] = useState<SitePipelineNode['id']>('weather');
  const [weatherMood, setWeatherMood] = useState<WeatherMood>('rain');
  const uid = useId();

  const activeIdx = Math.max(
    0,
    copy.mapsNodes.findIndex((n) => n.id === selectedId)
  );
  const activeNode = copy.mapsNodes[activeIdx] ?? copy.mapsNodes[0];

  const handleDockKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let nextIdx = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIdx = (activeIdx + 1) % copy.mapsNodes.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIdx = (activeIdx - 1 + copy.mapsNodes.length) % copy.mapsNodes.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = copy.mapsNodes.length - 1;
    }
    if (nextIdx >= 0) {
      e.preventDefault();
      const target = copy.mapsNodes[nextIdx];
      triggerHaptic('selection');
      setSelectedId(target.id);
      document.getElementById(`${uid}-gapi-${target.id}`)?.focus();
    }
  };

  return (
    <div className="site-gapi-wrap">
      <div className="site-gapi-split">
        {/* Left: Interactive Live Google API x 3D Engine Theater */}
        <div
          id={`${uid}-gapi-theater`}
          className="site-gapi-theater"
          role="tabpanel"
          tabIndex={0}
          aria-labelledby={`${uid}-gapi-${activeNode.id}`}
          data-scene={activeNode.id}
          data-weather-mood={weatherMood}
        >
          {/* Top Scene HUD */}
          <div className="site-gapi-theater-hud">
            <span className="site-journey-cut-chip">
              {activeNode.code} · {activeNode.apiName}
            </span>
            <span className={`site-status-pill is-${activeNode.status}`}>
              {activeNode.statusLabel}
            </span>
          </div>

          {/* Dynamic Interactive Scene Canvas */}
          <div className="site-gapi-scene">
            {activeNode.id === 'weather' && (
              <div className="site-gapi-weather-stage" data-mood={weatherMood}>
                <div className="site-gapi-weather-glow" aria-hidden="true" />

                {/* SVG Three.js Weather & Umbrella Collision Visual */}
                <svg
                  className="site-gapi-weather-svg"
                  viewBox="0 0 360 220"
                  fill="none"
                  aria-hidden="true"
                >
                  {weatherMood === 'rain' && (
                    <g className="site-gapi-rain-layer">
                      <line x1="64" y1="6" x2="54" y2="50" className="site-rain-streak s1" />
                      <line x1="112" y1="4" x2="104" y2="44" className="site-rain-streak s2" />
                      <line x1="158" y1="4" x2="152" y2="30" className="site-rain-streak s3" />
                      <line x1="204" y1="4" x2="198" y2="30" className="site-rain-streak s1" />
                      <line x1="252" y1="8" x2="244" y2="48" className="site-rain-streak s2" />
                      <line x1="300" y1="14" x2="290" y2="68" className="site-rain-streak s3" />
                      {/* Translucent Umbrella Collision Dome positioned above garment */}
                      <path
                        d="M114 64 C132 16, 228 16, 246 64 Z"
                        fill="var(--accent-sand)"
                        fillOpacity="0.14"
                        stroke="var(--accent-sand)"
                        strokeWidth="1.6"
                      />
                      <path
                        d="M180 28 L180 124"
                        stroke="var(--accent-sand)"
                        strokeOpacity="0.55"
                        strokeWidth="1.35"
                      />
                      <circle cx="146" cy="36" r="2.2" className="site-rain-splash" />
                      <circle cx="214" cy="38" r="2.2" className="site-rain-splash s2" />
                    </g>
                  )}

                  {weatherMood === 'sunny' && (
                    <g className="site-gapi-sun-layer">
                      <circle
                        cx="278"
                        cy="52"
                        r="26"
                        fill="var(--accent-sand)"
                        fillOpacity="0.18"
                        stroke="var(--accent-sand)"
                        strokeOpacity="0.65"
                        strokeWidth="1.4"
                      />
                      <circle cx="278" cy="52" r="44" stroke="var(--accent-sand)" strokeOpacity="0.22" strokeDasharray="4 6" />
                    </g>
                  )}

                  {weatherMood === 'wind' && (
                    <g className="site-gapi-wind-layer">
                      <path d="M28 66 Q110 48, 194 64 T336 58" className="site-wind-ribbon r1" />
                      <path d="M40 104 Q124 88, 210 102 T326 96" className="site-wind-ribbon r2" />
                      <path d="M56 142 Q144 128, 224 140 T318 134" className="site-wind-ribbon r1" />
                    </g>
                  )}
                </svg>

                <img
                  src="/assets/garments/beige-trench.webp"
                  alt="Weather-reactive 3D trench coat simulation"
                  width={480}
                  height={640}
                  decoding="async"
                  className="site-gapi-garment-img"
                />

                {/* Interactive Weather Mode Switcher inside Theater */}
                <div className="site-gapi-mood-pills" role="group" aria-label="Weather simulation mode">
                  {(
                    [
                      ['sunny', copy.weatherMoods.sunny],
                      ['rain', copy.weatherMoods.rain],
                      ['wind', copy.weatherMoods.wind],
                    ] as const
                  ).map(([mood, label]) => (
                    <button
                      key={mood}
                      type="button"
                      aria-pressed={weatherMood === mood}
                      className={`site-stance-pill ${weatherMood === mood ? 'is-active' : ''}`}
                      onClick={() => {
                        triggerHaptic('selection');
                        setWeatherMood(mood);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeNode.id === 'streetview' && (
              <div className="site-gapi-photo-stage">
                <img
                  src="/assets/journey/clay-cut-03-v1.webp"
                  alt="Dressed 3D avatar standing directly in a live Google Street View destination"
                  width={960}
                  height={720}
                  decoding="async"
                  className="site-gapi-photo-img"
                />
                <div className="site-gapi-photo-scrim" aria-hidden="true" />
                <div className="site-gapi-compass-chip" aria-hidden="true">
                  <SiteIcon name="compass" size={13} />
                  <span>37.54°N · 127.05°E · HDG 142°</span>
                </div>
              </div>
            )}

            {activeNode.id === 'places' && (
              <div className="site-gapi-vector-stage">
                <svg viewBox="0 0 360 210" fill="none" className="site-gapi-map-svg" aria-hidden="true">
                  {/* Minimal monochrome urban grid */}
                  <g stroke="currentColor" strokeOpacity="0.14" strokeWidth="1">
                    <path d="M24 44 H336 M24 98 H336 M24 152 H336" />
                    <path d="M84 18 V192 M176 18 V192 M272 18 V192" />
                    <path d="M40 184 L176 98 L312 36" stroke="var(--accent-sand)" strokeOpacity="0.45" strokeDasharray="4 4" />
                  </g>
                  <circle cx="176" cy="98" r="34" stroke="var(--accent-sand)" strokeOpacity="0.3" />
                  <circle cx="176" cy="98" r="14" fill="var(--accent-sand)" fillOpacity="0.18" />
                  <circle cx="176" cy="98" r="5" fill="var(--accent-sand)" />
                  <circle cx="96" cy="54" r="4.5" fill="var(--accent-sand)" fillOpacity="0.85" />
                  <circle cx="268" cy="144" r="4.5" fill="var(--accent-sand)" fillOpacity="0.85" />
                </svg>
                <div className="site-gapi-vector-pills" aria-hidden="true">
                  <span>Dry Clean · 180m</span>
                  <span>Tailor · 320m</span>
                  <span>Leather Care · 490m</span>
                </div>
              </div>
            )}

            {activeNode.id === 'vertex' && (
              <div className="site-gapi-vertex-stage">
                <img
                  src="/assets/garments/beige-trench.webp"
                  alt="EXIF-stripped garment processed by Vertex AI No-Training VTON"
                  width={480}
                  height={640}
                  decoding="async"
                  className="site-gapi-garment-img is-compact"
                />
                <div className="site-gapi-vector-pills" aria-hidden="true">
                  <span>EXIF Strip</span>
                  <span>→ 11-Slot Tag</span>
                  <span>→ 8-Angle 2K VTON</span>
                </div>
              </div>
            )}

            {activeNode.id === 'mediapipe' && (
              <div className="site-gapi-vector-stage">
                <svg viewBox="0 0 360 200" fill="none" className="site-gapi-map-svg" aria-hidden="true">
                  <circle cx="180" cy="96" r="56" stroke="var(--accent-sand)" strokeOpacity="0.28" strokeDasharray="3 5" />
                  <ellipse cx="180" cy="96" rx="34" ry="44" stroke="var(--accent-sand)" strokeOpacity="0.72" strokeWidth="1.4" />
                  <circle cx="166" cy="86" r="2.2" fill="var(--accent-sand)" />
                  <circle cx="194" cy="86" r="2.2" fill="var(--accent-sand)" />
                  <path d="M168 112 Q180 120, 192 112" stroke="var(--accent-sand)" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                <div className="site-gapi-vector-pills" aria-hidden="true">
                  <span>WASM On-Device</span>
                  <span>PCCS 12-Tone</span>
                  <span>0 Bytes Uploaded</span>
                </div>
              </div>
            )}

            {activeNode.id === 'calendar' && (
              <div className="site-gapi-photo-stage">
                <img
                  src="/assets/journey/clay-cut-04-v1.webp"
                  alt="Planned Google Calendar OOTD save and SNS garment tagging lookbook"
                  width={960}
                  height={720}
                  decoding="async"
                  className="site-gapi-photo-img"
                />
                <div className="site-gapi-photo-scrim" aria-hidden="true" />
                <div className="site-gapi-compass-chip" aria-hidden="true">
                  <SiteIcon name="calendar" size={13} />
                  <span>TO-DO · Calendar + SNS OOTD</span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Scene Caption Bar */}
          <div className="site-gapi-theater-foot">
            <strong>{activeNode.theaterHeadline}</strong>
            <span>{activeNode.theaterTelemetry}</span>
          </div>
        </div>

        {/* Right: 2x3 Subtitle-Free Google API Icon Dock */}
        <div className="site-gapi-dock-col">
          <div
            className="site-gapi-dock-grid"
            role="tablist"
            aria-label={copy.mapsHeading}
            onKeyDown={handleDockKeyDown}
          >
            {copy.mapsNodes.map((node) => {
              const isSelected = node.id === activeNode.id;
              return (
                <button
                  key={node.id}
                  id={`${uid}-gapi-${node.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-controls={`${uid}-gapi-theater`}
                  tabIndex={isSelected ? 0 : -1}
                  className={`site-gapi-tile ${isSelected ? 'is-active' : ''}`}
                  onClick={() => {
                    triggerHaptic('selection');
                    setSelectedId(node.id);
                  }}
                >
                  <span className="site-gapi-tile-top">
                    <span className="site-icon-tile-glyph">
                      <SiteIcon name={node.icon} size={17} />
                    </span>
                    <span className={`site-status-dot is-${node.status}`}>
                      {node.statusLabel}
                    </span>
                  </span>
                  <strong className="site-gapi-tile-title">{node.apiName}</strong>
                </button>
              );
            })}
          </div>

          <div className="site-maps-compliance-bar">
            <span>{copy.mapsComplianceFooter}</span>
          </div>
        </div>
      </div>

      {/* Bottom Uniform 1-Line Inspector */}
      <div className="site-icon-inspector" aria-live="polite">
        <div className="site-icon-inspector-main">
          <span className="site-icon-inspector-glyph">
            <SiteIcon name={activeNode.icon} size={15} />
          </span>
          <strong className="site-icon-inspector-title">{activeNode.apiName}</strong>
          <span className="site-bp-spec-tag is-primary">{activeNode.compliance}</span>
          <p className="site-icon-inspector-text">{activeNode.detail}</p>
        </div>
        <span className="site-inspector-hint-sr">{tapHint}</span>
      </div>
    </div>
  );
}
