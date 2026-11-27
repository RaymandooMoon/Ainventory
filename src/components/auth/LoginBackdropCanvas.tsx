import { memo, useCallback } from 'react';
import { CARBON_DOM_CONTRACT } from '../../contracts/carbonDesignContract.ts';
import {
  DEFAULT_LOGIN_THREE_VARIANT,
  type LoginThreeVariantId,
} from './loginThreeVariants.ts';
import { useMarbleBackdropStage, type MarbleHitParams } from './useMarbleBackdropStage.ts';

export interface LoginBackdropCanvasProps {
  effectiveTheme: 'light' | 'dark' | string;
  lang?: 'ko' | 'en' | string;
  stage?: 'intro' | 'auth' | 'portal';
  paused?: boolean;
  motionVariant?: LoginThreeVariantId;
  variantChangeOrigin?: { x: number; y: number; seq: number } | null;
  portalSurgeOrigin?: { x: number; y: number } | null;
}

const getAuthRoot = (stageEl: HTMLElement): HTMLElement | null =>
  stageEl.closest('.atelier-auth-root') as HTMLElement | null;

const getLoginHitParams = (el: HTMLElement): MarbleHitParams => {
  const isGetStartedBtn = el.id === CARBON_DOM_CONTRACT.introGetStartedBtnId;
  return {
    impactStrength: isGetStartedBtn ? 0.96 : 0.84,
    minBounceSpeed: isGetStartedBtn ? 0.94 : 0.64,
    extraStageCooldownMs: isGetStartedBtn ? 760 : undefined,
  };
};

const syncAuthPointerVars = (nx: number, ny: number, stageEl: HTMLElement) => {
  const authRoot = getAuthRoot(stageEl);
  if (!authRoot) return;
  authRoot.style.setProperty('--atelier-ptr-x', (nx * 0.5).toFixed(4));
  authRoot.style.setProperty('--atelier-ptr-y', (-ny * 0.5).toFixed(4));
};

const resetAuthPointerVars = (stageEl: HTMLElement) => {
  const authRoot = getAuthRoot(stageEl);
  if (!authRoot) return;
  authRoot.style.setProperty('--atelier-ptr-x', '0');
  authRoot.style.setProperty('--atelier-ptr-y', '0');
};

/**
 * Interactive Three.js 3D Silk Cloth + Rolling Glass Marble Login Stage.
 * Shares `useMarbleBackdropStage` and `createLoginThreeController` with the official website
 * so shader, gravity-bowl, gyro, and collision updates propagate automatically.
 * Intentionally omits bottom floor-rail containment (website-only).
 */
const LoginBackdropCanvas = memo(function LoginBackdropCanvas({
  effectiveTheme,
  lang = 'ko',
  stage = 'intro',
  paused = false,
  motionVariant = DEFAULT_LOGIN_THREE_VARIANT,
  variantChangeOrigin = null,
  portalSurgeOrigin = null,
}: LoginBackdropCanvasProps) {
  const isEn = lang === 'en';
  const isDark = effectiveTheme === 'dark';

  // Allow marble strike triggers ONLY on:
  // - Top utility pills (.atelier-topbar: Luxury/Aurora, Light/Dark, EN/KO) in both intro & auth stages
  // - Intro CTA (.atelier-intro-dock: Get started / 시작하기) in intro stage only
  // Never include login panel buttons (Google/Apple, tabs, quick seed, submit, sample closet, etc.).
  const getTargetSelector = useCallback(
    () =>
      stage === 'intro'
        ? '.atelier-intro-dock button:not([disabled]), .atelier-topbar button:not([disabled])'
        : '.atelier-topbar button:not([disabled])',
    [stage]
  );

  const { stageRef, canvasRef, canvasKey, webglFallback } = useMarbleBackdropStage({
    isDark,
    stage,
    paused,
    motionVariant,
    variantChangeOrigin,
    portalSurgeOrigin,
    cooldownResetMs: 720,
    getTargetRoot: getAuthRoot,
    getTargetSelector,
    hitRadiusScale: 0.9,
    minStrikeSpeed: 0.16,
    globalHitCooldownMs: 340,
    perTargetCooldownMs: 950,
    pushPaddingPx: 3,
    maxPushRadiusMultiple: 2.2,
    wheelImpulseScale: 1.0,
    ignorePointerDownSelector: 'button, input, a, select, label',
    getHitParams: getLoginHitParams,
    onPointerNormalized: syncAuthPointerVars,
    onPointerLeaveReset: resetAuthPointerVars,
    listenDocumentScroll: true,
  });

  const showFlankCards = stage === 'auth';

  return (
    <div
      ref={stageRef}
      id={CARBON_DOM_CONTRACT.loginMotionStageId}
      className={`atelier-backdrop-stage ${webglFallback ? 'is-webgl-fallback' : ''}`}
      data-motion-theme={isDark ? 'dark' : 'light'}
      data-motion-stage={stage}
      data-motion-variant={motionVariant}
      aria-hidden="true"
    >
      <canvas key={canvasKey} ref={canvasRef} className="atelier-silk-canvas" />
      <div className="atelier-dither-veil" />

      {/* Desktop Flank Curation Cards (Strictly hidden <1180px & hidden in Intro & Portal stages) */}
      <div className={`atelier-flank-cards ${showFlankCards ? 'is-visible' : ''}`}>
        <article className="atelier-curation-card atelier-curation-card--tl">
          <div className="atelier-card-head">
            <span className="atelier-card-badge">01 · LOOK</span>
            <span className="atelier-card-badge">98%</span>
          </div>
          <div className="atelier-card-art">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 10 L32 16 L42 10 L52 20 L47 28 L43 24 V54 H21 V24 L17 28 L12 20 Z" />
              <path d="M32 16 V54" strokeDasharray="2 3" opacity="0.55" />
            </svg>
          </div>
          <div>
            <h3 className="atelier-card-title">
              {isEn ? 'Structured Cashmere Coat' : '스트럭처드 캐시미어 코트'}
            </h3>
            <p className="atelier-card-meta">
              {isEn ? 'Seoul 9°C · Crisp Minimal Silhouette' : '서울 9°C · 미니멀 테일러드 핏 추천'}
            </p>
          </div>
        </article>

        <article className="atelier-curation-card atelier-curation-card--bl">
          <div className="atelier-card-head">
            <span className="atelier-card-badge">02 · COLOR</span>
            <span className="atelier-card-badge">TONE</span>
          </div>
          <div className="atelier-card-art">
            <div className="atelier-swatch-cluster">
              <span className="atelier-swatch-orb" style={{ background: '#1D1D1F' }} />
              <span className="atelier-swatch-orb" style={{ background: '#7A7671' }} />
              <span className="atelier-swatch-orb" style={{ background: '#D8D3CA' }} />
              <span className="atelier-swatch-orb" style={{ background: '#F5F5F7' }} />
            </div>
          </div>
          <div>
            <h3 className="atelier-card-title">
              {isEn ? 'Personal Tone Harmonizer' : '퍼스널 톤 하모니 매칭'}
            </h3>
            <p className="atelier-card-meta">
              {isEn ? 'Alabaster · Graphite · Obsidian' : '알라바스터 · 그라파이트 · 옵시디언'}
            </p>
          </div>
        </article>

        <article className="atelier-curation-card atelier-curation-card--tr">
          <div className="atelier-card-head">
            <span className="atelier-card-badge">03 · 3D FIT</span>
            <span className="atelier-card-badge">LIVE</span>
          </div>
          <div className="atelier-card-art">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="32" cy="14" r="5" />
              <path d="M22 24 C25 21 39 21 42 24 L45 38 L40 39 L38 29 V54 H33 V40 H31 V54 H26 V29 L24 39 L19 38 Z" />
            </svg>
          </div>
          <div>
            <h3 className="atelier-card-title">
              {isEn ? '3D Silhouette Twin' : '3D 실루엣 트윈 피팅'}
            </h3>
            <p className="atelier-card-meta">
              {isEn ? 'Real-time Layering & Drape Check' : '실시간 레이어드 & 핏 밸런스 시뮬레이션'}
            </p>
          </div>
        </article>

        <article className="atelier-curation-card atelier-curation-card--br">
          <div className="atelier-card-head">
            <span className="atelier-card-badge">04 · SCAN</span>
            <span className="atelier-card-badge">0 DUP</span>
          </div>
          <div className="atelier-card-art">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M16 22 V16 H22 M42 16 H48 V22 M48 42 V48 H42 M22 48 H16 V42" />
              <rect x="23" y="23" width="18" height="18" rx="4" />
              <path d="M20 32 H44" strokeDasharray="3 2" opacity="0.65" />
            </svg>
          </div>
          <div>
            <h3 className="atelier-card-title">
              {isEn ? 'Duplicate Purchase Guard' : '오프라인 중복 구매 판독'}
            </h3>
            <p className="atelier-card-meta">
              {isEn ? 'Instant Closet Similarity Check' : '매장 촬영 즉시 내 옷장 유사도 비교'}
            </p>
          </div>
        </article>
      </div>
    </div>
  );
});

export default LoginBackdropCanvas;
