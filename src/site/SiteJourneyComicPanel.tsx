import { useEffect, useId, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { SiteIcon } from './SiteIcon.tsx';
import type { SiteCopy, SiteJourneyCut } from './siteContent.ts';

/**
 * Approved Variant B — '01 User Journey' inside About.
 * Asymmetric Hero 3D Clay Comic Theater (left) + 2x3 Subtitle-Free 6-Cut Filmstrip (right)
 * with explicit LIVE vs. TO-DO tags, comic speech bubbles, AI/API flow chips, and 1-line inspector.
 */
export function AboutJourneyComicPanel({
  copy,
  tapHint,
  onNextStep,
}: {
  readonly copy: SiteCopy['journey'];
  readonly tapHint: string;
  readonly onNextStep: () => void;
}) {
  const [activeId, setActiveId] = useState<SiteJourneyCut['id']>(copy.cuts[0].id);
  const [manualAnnouncement, setManualAnnouncement] = useState<string>('');
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  const uid = useId();

  const activeIdx = Math.max(
    0,
    copy.cuts.findIndex((c) => c.id === activeId)
  );
  const activeCut = copy.cuts[activeIdx] ?? copy.cuts[0];

  useEffect(() => {
    if (!isAutoPlaying) return undefined;
    const cutIds = copy.cuts.map((c) => c.id);
    const timer = window.setInterval(() => {
      setActiveId((prev) => {
        const idx = cutIds.indexOf(prev);
        return cutIds[(idx + 1) % cutIds.length] ?? cutIds[0];
      });
    }, 4600);
    return () => window.clearInterval(timer);
  }, [isAutoPlaying, copy.cuts]);

  const selectCut = (id: SiteJourneyCut['id']) => {
    triggerHaptic('selection');
    setIsAutoPlaying(false);
    setActiveId(id);
    const picked = copy.cuts.find((c) => c.id === id);
    if (picked) {
      setManualAnnouncement(`${picked.title} (${picked.statusLabel}): ${picked.detail}`);
    }
  };

  const stepCut = (delta: -1 | 1) => {
    const nextIdx = (activeIdx + delta + copy.cuts.length) % copy.cuts.length;
    selectCut(copy.cuts[nextIdx].id);
  };

  const handleFilmstripKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let nextIdx = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      nextIdx = (activeIdx + 1) % copy.cuts.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      nextIdx = (activeIdx - 1 + copy.cuts.length) % copy.cuts.length;
    } else if (e.key === 'Home') {
      nextIdx = 0;
    } else if (e.key === 'End') {
      nextIdx = copy.cuts.length - 1;
    }
    if (nextIdx >= 0) {
      e.preventDefault();
      const target = copy.cuts[nextIdx];
      selectCut(target.id);
      document.getElementById(`${uid}-cut-${target.id}`)?.focus();
    }
  };

  return (
    <div className="site-journey-wrap">
      <div className="site-journey-split">
        {/* Left: Hero 3D Clay Comic Theater */}
        <div
          id={`${uid}-theater`}
          className="site-journey-theater"
          role="tabpanel"
          tabIndex={0}
          aria-labelledby={`${uid}-cut-${activeCut.id}`}
          data-cut-status={activeCut.status}
        >
          <div className="site-journey-stage-frame">
            <img
              key={activeCut.id}
              src={activeCut.imageSrc}
              alt={activeCut.imageAlt}
              width={960}
              height={720}
              decoding="async"
              fetchPriority={activeCut.id === 'buy' ? 'high' : 'auto'}
              className="site-journey-hero-img"
            />
            <div className="site-journey-stage-scrim" aria-hidden="true" />

            {/* Top Overlay HUD: Cut # + LIVE/TO-DO Pill + Playback & Stepper */}
            <div className="site-journey-stage-hud">
              <div className="site-journey-hud-left">
                <span className="site-journey-cut-chip">CUT {activeCut.num}</span>
                <span className={`site-status-pill is-${activeCut.status}`}>
                  {activeCut.statusLabel}
                </span>
              </div>

              <div className="site-journey-hud-controls">
                <button
                  type="button"
                  className="site-journey-nav-icon"
                  aria-label={copy.prevLabel}
                  onClick={() => stepCut(-1)}
                >
                  <ChevronLeft size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="site-journey-nav-icon"
                  aria-label={copy.nextCutLabel}
                  onClick={() => stepCut(1)}
                >
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="site-loop-motion-btn site-journey-play-btn"
                  aria-pressed={isAutoPlaying}
                  onClick={() => {
                    triggerHaptic('selection');
                    setIsAutoPlaying((prev) => !prev);
                  }}
                >
                  {isAutoPlaying ? (
                    <Pause size={11} aria-hidden="true" />
                  ) : (
                    <Play size={11} aria-hidden="true" />
                  )}
                  <span>{isAutoPlaying ? copy.pausePlayLabel : copy.autoPlayLabel}</span>
                </button>
              </div>
            </div>

            {/* Bottom Floating Comic Speech Bubble */}
            <div className="site-journey-bubble">
              <span className="site-journey-bubble-icon" aria-hidden="true">
                <SiteIcon name={activeCut.icon} size={14} />
              </span>
              <p>{activeCut.speechBubble}</p>
            </div>
          </div>
        </div>

        {/* Right: 2x3 Subtitle-Free 6-Cut Clay Filmstrip + API Flow + Next Bridge */}
        <div className="site-journey-deck">
          <div
            className="site-journey-filmstrip"
            role="tablist"
            aria-label={copy.badge}
            onKeyDown={handleFilmstripKeyDown}
          >
            {copy.cuts.map((cut) => {
              const isSelected = cut.id === activeCut.id;
              return (
                <button
                  key={cut.id}
                  id={`${uid}-cut-${cut.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  aria-controls={`${uid}-theater`}
                  tabIndex={isSelected ? 0 : -1}
                  className={`site-journey-cut-btn ${isSelected ? 'is-active' : ''}`}
                  onClick={() => selectCut(cut.id)}
                >
                  <span className="site-journey-cut-thumb">
                    <img
                      src={cut.imageSrc}
                      alt=""
                      width={96}
                      height={72}
                      loading="lazy"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="site-journey-cut-meta">
                    <span className="site-journey-cut-top">
                      <span className="site-journey-cut-num">{cut.num}</span>
                      <span className={`site-status-dot is-${cut.status}`}>
                        {cut.status === 'live'
                          ? 'LIVE'
                          : cut.status === 'todo'
                            ? 'TO-DO'
                            : 'LIVE+'}
                      </span>
                    </span>
                    <strong className="site-journey-cut-title">{cut.shortTitle}</strong>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="site-journey-deck-footer">
            <div className="site-journey-api-chips" aria-label="AI and API stack for this step">
              {activeCut.apiChips.map((chip) => (
                <span key={chip} className="site-journey-api-chip">
                  {chip}
                </span>
              ))}
            </div>

            <button
              type="button"
              className="site-story-bridge-btn"
              onClick={() => {
                triggerHaptic('selection');
                onNextStep();
              }}
            >
              <span>{copy.nextStepLabel}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Uniform 1-Line Inspector + Persistent Live Region for Manual Changes */}
      <div className="site-icon-inspector">
        <div className="site-icon-inspector-main">
          <span className="site-icon-inspector-glyph">
            <SiteIcon name={activeCut.icon} size={15} />
          </span>
          <strong className="site-icon-inspector-title">{activeCut.title}</strong>
          <span className={`site-status-pill is-${activeCut.status}`}>
            {activeCut.statusLabel}
          </span>
          <p className="site-icon-inspector-text">{activeCut.detail}</p>
        </div>
        <span className="site-inspector-hint-sr" aria-live="polite">
          {manualAnnouncement}
        </span>
        <span className="site-inspector-hint-sr">{tapHint}</span>
      </div>
    </div>
  );
}
