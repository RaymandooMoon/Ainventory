import { Suspense, lazy, useEffect, useRef } from 'react';
import { ArrowUpRight, Gamepad2, Play, WifiOff, X } from 'lucide-react';
import { resolveMinigamePath, type ConnectionHealth } from '../utils/offlineGameBridge.ts';
import type { SiteLang } from './siteContent.ts';

const FruitBoxGamePage = lazy(() => import('../minigame/FruitBoxGamePage.tsx'));

export interface SiteOfflineGameModalProps {
  readonly isOpen: boolean;
  readonly isPlayingInline: boolean;
  readonly health: ConnectionHealth;
  readonly lang: SiteLang;
  readonly onPlayInline: () => void;
  readonly onExitInline: () => void;
  readonly onDismiss: () => void;
}

export default function SiteOfflineGameModal({
  isOpen,
  isPlayingInline,
  health,
  lang,
  onPlayInline,
  onExitInline,
  onDismiss,
}: SiteOfflineGameModalProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const playBtnRef = useRef<HTMLButtonElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // Manage WCAG 2.2 AA initial focus, Escape dismissal, Tab focus trap & focus restoration
  useEffect(() => {
    if (!isOpen || isPlayingInline) return undefined;
    prevFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTimer = window.setTimeout(() => {
      playBtnRef.current?.focus();
    }, 20);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
        return;
      }
      if (e.key === 'Tab' && cardRef.current) {
        const focusables = cardRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      prevFocusRef.current?.focus?.();
    };
  }, [isOpen, isPlayingInline, onDismiss]);

  if (isPlayingInline) {
    return (
      <Suspense
        fallback={
          <div className="site-modal-backdrop site-offline-backdrop" role="status" aria-live="polite">
            <div className="site-modal-card site-offline-card">
              <div className="site-modal-body">
                <p className="site-offline-loading">
                  {lang === 'ko' ? 'APPLE 10 // 3D 준비 중…' : 'Loading APPLE 10 // 3D…'}
                </p>
              </div>
            </div>
          </div>
        }
      >
        <FruitBoxGamePage autoStart onExit={onExitInline} />
      </Suspense>
    );
  }

  if (!isOpen) return null;

  const isOffline = health === 'offline';
  const minigameHref = resolveMinigamePath();

  const title =
    lang === 'ko'
      ? isOffline
        ? '오프라인 상태'
        : '연결 불안정'
      : isOffline
        ? 'Offline'
        : 'Weak Signal';

  return (
    <div
      className="site-modal-backdrop site-offline-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="site-offline-game-title"
      data-testid="site-offline-game-modal"
      onClick={onDismiss}
    >
      <div
        ref={cardRef}
        className="site-modal-card site-offline-card"
        data-no-marble="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="site-modal-head">
          <div>
            <p className="site-offline-kicker">
              <WifiOff size={13} aria-hidden="true" />
              <span>{isOffline ? 'OFFLINE' : 'LOW SIGNAL'}</span>
            </p>
            <h2 id="site-offline-game-title" className="site-modal-title">
              {title}
            </h2>
          </div>

          <button
            type="button"
            className="site-modal-close"
            onClick={onDismiss}
            aria-label={lang === 'ko' ? '닫기' : 'Close'}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="site-modal-body">
          <div className="site-offline-hero-banner" aria-hidden="true">
            <div className="site-offline-hero-glow" />
            <div className="site-offline-hero-content">
              <span className="site-offline-badge">
                <Gamepad2 size={14} />
                <span>APPLE 10 // 3D</span>
              </span>
              <strong>{lang === 'ko' ? '드래그로 합 10 만들기' : 'Drag to Make 10'}</strong>
            </div>
          </div>

          <div className="site-offline-actions">
            <button
              ref={playBtnRef}
              type="button"
              className="site-offline-play-btn"
              data-testid="site-offline-play-inline"
              onClick={onPlayInline}
            >
              <Play size={16} fill="currentColor" aria-hidden="true" />
              <span>{lang === 'ko' ? '바로 플레이' : 'Play Now'}</span>
            </button>

            <a href={minigameHref} className="site-offline-route-btn">
              <span>/minigame</span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
