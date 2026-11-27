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
                  {lang === 'ko' ? '3D 네온 사과게임 준비 중…' : 'Loading 3D Neon Apple Box…'}
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
        ? '인터넷 연결이 끊겼습니다'
        : '네트워크 연결이 불안정합니다'
      : isOffline
        ? 'You Are Offline'
        : 'Weak Network Detected';

  const subtitle =
    lang === 'ko'
      ? '연결이 복구되는 동안 브라우저에서 100% 오프라인으로 돌아가는 3D 네온 사과게임(Fruit Box)을 즐겨보세요.'
      : 'While your connection recovers, play our offline-ready Three.js Neon 3D Apple Box right in your browser.';

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
              <span>
                {isOffline ? 'OFFLINE ARCADE MODE' : 'LOW SIGNAL · OFFLINE READY'}
              </span>
            </p>
            <h2 id="site-offline-game-title" className="site-modal-title">
              {title}
            </h2>
          </div>

          <button
            type="button"
            className="site-modal-close"
            onClick={onDismiss}
            aria-label={lang === 'ko' ? '팝업 닫기' : 'Close popup'}
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
                <span>APPLE BOX // NEON 3D</span>
              </span>
              <strong>{lang === 'ko' ? '합이 10이 되게 드래그!' : 'Drag to Make 10!'}</strong>
              <span>
                {lang === 'ko'
                  ? 'Three.js 과즙 파티클 · 콤보 피버 · 120초 타임어택'
                  : 'Three.js Juice Splash · Combo Fever · 120s Time Attack'}
              </span>
            </div>
          </div>

          <p className="site-offline-copy">{subtitle}</p>

          <div className="site-offline-actions">
            <button
              ref={playBtnRef}
              type="button"
              className="site-offline-play-btn"
              data-testid="site-offline-play-inline"
              onClick={onPlayInline}
            >
              <Play size={16} fill="currentColor" aria-hidden="true" />
              <span>{lang === 'ko' ? '지금 바로 사과게임 플레이' : 'Play Apple Box Now'}</span>
            </button>

            <a href={minigameHref} className="site-offline-route-btn">
              <span>{lang === 'ko' ? '/minigame 전용 페이지 열기' : 'Open /minigame Page'}</span>
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
