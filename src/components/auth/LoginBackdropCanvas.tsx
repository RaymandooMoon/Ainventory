import { memo, useEffect, useRef, useState } from 'react';
import { CARBON_DOM_CONTRACT } from '../../contracts/carbonDesignContract.ts';
import {
  createLoginThreeController,
  DEFAULT_LOGIN_THREE_VARIANT,
  type LoginThreeController,
  type LoginThreeVariantId,
} from './loginThreeScenes.ts';

export interface LoginBackdropCanvasProps {
  effectiveTheme: 'light' | 'dark' | string;
  lang?: 'ko' | 'en' | string;
  stage?: 'intro' | 'auth' | 'portal';
  motionVariant?: LoginThreeVariantId;
  variantChangeOrigin?: { x: number; y: number; seq: number } | null;
  portalSurgeOrigin?: { x: number; y: number } | null;
}

interface DeviceOrientationConstructorWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

function getScreenOrientationAngle(): number {
  if (typeof window === 'undefined') return 0;
  const screenAngle = window.screen?.orientation?.angle;
  if (typeof screenAngle === 'number' && Number.isFinite(screenAngle)) {
    return screenAngle;
  }
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' && Number.isFinite(legacy) ? legacy : 0;
}

/**
 * Interactive Three.js 2-Pass Ping-Pong FBO Fluid Gradient Stage
 * - Dual selectable fluid palettes: A (Luxury Fluid) & B (Aurora Prism), both Light & Dark calibrated
 * - Continuous pointer/touch fluid brush + click radial wave bursts
 * - Mobile Gyroscope / Tilt reaction with Auto-Zero neutral pose calibration
 *   and iOS Safari automatic requestPermission() inside the first user click/tap gesture
 */
const LoginBackdropCanvas = memo(function LoginBackdropCanvas({
  effectiveTheme,
  lang = 'ko',
  stage = 'intro',
  motionVariant = DEFAULT_LOGIN_THREE_VARIANT,
  variantChangeOrigin = null,
  portalSurgeOrigin = null,
}: LoginBackdropCanvasProps) {
  const isEn = lang === 'en';
  const isDark = effectiveTheme === 'dark';
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<LoginThreeController | null>(null);
  const [webglFallback, setWebglFallback] = useState(false);

  const initialDarkRef = useRef(isDark);
  const initialStageRef = useRef<'intro' | 'auth' | 'portal'>(stage);
  const initialVariantRef = useRef<LoginThreeVariantId>(motionVariant);

  // Sync theme transitions cleanly (instant snap during View Transition circle reveal)
  useEffect(() => {
    const isViewTransitioning =
      typeof document !== 'undefined' && document.documentElement.dataset.themeTransitioning === '1';
    controllerRef.current?.setTheme(isDark, isViewTransitioning);
  }, [isDark]);

  useEffect(() => {
    controllerRef.current?.setStage(stage);
  }, [stage]);

  useEffect(() => {
    controllerRef.current?.setVariant(
      motionVariant,
      variantChangeOrigin?.x,
      variantChangeOrigin?.y
    );
  }, [motionVariant, variantChangeOrigin]);

  // Celebratory liquid swirl & upward wake trail during 2-second login transition
  useEffect(() => {
    if (!portalSurgeOrigin) return;
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    ctrl.triggerLoginSurge(portalSurgeOrigin.x, portalSurgeOrigin.y);

    // Follow ascending logo path toward top-center header with a velvety fluid wake
    let frame = 0;
    const totalFrames = 42;
    let raf = 0;
    const startY = portalSurgeOrigin.y;
    const endY = 0.88; // top-center normalized Y (+1 = top edge)
    const step = () => {
      frame += 1;
      const t = Math.min(1, frame / totalFrames);
      const ease = 1 - Math.pow(1 - t, 3);
      const curY = startY + (endY - startY) * ease;
      const curX = portalSurgeOrigin.x * (1 - ease);
      ctrl.setPointer(curX, curY, 0.36 * (1 - t * 0.55));
      if (frame < totalFrames) {
        raf = window.requestAnimationFrame(step);
      } else {
        ctrl.triggerPulse(0, 0.9, 1.35);
      }
    };
    raf = window.requestAnimationFrame(step);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [portalSurgeOrigin]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stageEl = stageRef.current;
    if (!canvas || !stageEl || typeof window === 'undefined') return undefined;

    const reducedMotion = Boolean(
      typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );

    const controller = createLoginThreeController(canvas, {
      initialDark: initialDarkRef.current,
      initialStage: initialStageRef.current,
      initialVariant: initialVariantRef.current,
      reducedMotion,
    });

    if (!controller) {
      setWebglFallback(true);
      return undefined;
    }

    controllerRef.current = controller;

    // --- Pointer & Touch Tracking ---
    let lastNormX = 0;
    let lastNormY = 0;

    const pushPointer = (clientX: number, clientY: number, emitPulse = false) => {
      const vw = Math.max(1, window.innerWidth);
      const vh = Math.max(1, window.innerHeight);
      const nx = (clientX / vw) * 2 - 1;
      const ny = -((clientY / vh) * 2 - 1);
      const velocity = Math.hypot(nx - lastNormX, ny - lastNormY);
      lastNormX = nx;
      lastNormY = ny;

      controller.setPointer(nx, ny, velocity);
      if (emitPulse) {
        controller.triggerPulse(nx, ny, 0.78);
      }

      const authRoot = stageEl.closest('.atelier-auth-root') as HTMLElement | null;
      if (authRoot) {
        authRoot.style.setProperty('--atelier-ptr-x', (nx * 0.5).toFixed(4));
        authRoot.style.setProperty('--atelier-ptr-y', (-ny * 0.5).toFixed(4));
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      pushPointer(e.clientX, e.clientY, false);
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && typeof target.closest === 'function' && target.closest('button, input, a, select')) {
        return;
      }
      pushPointer(e.clientX, e.clientY, true);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) pushPointer(t.clientX, t.clientY, false);
    };
    const onPointerLeave = () => {
      controller.setPointer(0, 0, 0);
      const authRoot = stageEl.closest('.atelier-auth-root') as HTMLElement | null;
      if (authRoot) {
        authRoot.style.setProperty('--atelier-ptr-x', '0');
        authRoot.style.setProperty('--atelier-ptr-y', '0');
      }
    };

    // --- Mobile Gyroscope / DeviceOrientation with Auto-Zero Calibration & iOS First-Click Permission ---
    let gyroAttached = false;
    let gyroPermissionRequested = false;
    let calibSamples = 0;
    let baseBeta = 0;
    let baseGamma = 0;
    let prevTiltX = 0;
    let prevTiltY = 0;

    const onDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (typeof e.beta !== 'number' || typeof e.gamma !== 'number') return;
      if (!Number.isFinite(e.beta) || !Number.isFinite(e.gamma)) return;

      // Auto-zero neutral holding angle on first 5 samples so sitting/lying/standing feels centered
      if (calibSamples < 5) {
        calibSamples += 1;
        baseBeta += (e.beta - baseBeta) / calibSamples;
        baseGamma += (e.gamma - baseGamma) / calibSamples;
        return;
      }

      const relGamma = e.gamma - baseGamma; // left-right tilt (-90..90)
      const relBeta = e.beta - baseBeta; // front-back tilt (-180..180)
      const angle = getScreenOrientationAngle();

      let rawX = relGamma / 32;
      let rawY = -relBeta / 32;
      if (angle === 90) {
        rawX = relBeta / 32;
        rawY = relGamma / 32;
      } else if (angle === -90 || angle === 270) {
        rawX = -relBeta / 32;
        rawY = -relGamma / 32;
      } else if (angle === 180) {
        rawX = -rawX;
        rawY = -rawY;
      }

      const tx = Math.max(-1, Math.min(1, rawX));
      const ty = Math.max(-1, Math.min(1, rawY));
      const dtx = tx - prevTiltX;
      const dty = ty - prevTiltY;
      prevTiltX = tx;
      prevTiltY = ty;

      // Gently re-center baseline over very long periods to prevent drift
      baseBeta += (e.beta - baseBeta) * 0.0025;
      baseGamma += (e.gamma - baseGamma) * 0.0025;

      controller.setTilt(tx, ty, dtx, dty);
    };

    const attachGyroListener = () => {
      if (gyroAttached) return;
      gyroAttached = true;
      window.addEventListener('deviceorientation', onDeviceOrientation, { passive: true });
    };

    const devOrientCtor =
      typeof window.DeviceOrientationEvent !== 'undefined'
        ? (window.DeviceOrientationEvent as unknown as DeviceOrientationConstructorWithPermission)
        : null;
    const requiresIosPermission = typeof devOrientCtor?.requestPermission === 'function';

    const requestIosGyroOnFirstGesture = () => {
      if (gyroPermissionRequested || !requiresIosPermission || !devOrientCtor?.requestPermission) {
        return;
      }
      gyroPermissionRequested = true;
      window.removeEventListener('click', requestIosGyroOnFirstGesture, true);
      window.removeEventListener('touchend', requestIosGyroOnFirstGesture, true);

      try {
        // Must be called synchronously inside a trusted user gesture (click/touchend) on iOS Safari
        const resultPromise = devOrientCtor.requestPermission();
        if (resultPromise && typeof resultPromise.then === 'function') {
          void resultPromise
            .then((state) => {
              if (state === 'granted') {
                attachGyroListener();
              }
            })
            .catch(() => {
              // Permission denied or blocked — seamlessly continue with touch/pointer fluid interaction
            });
        }
      } catch {
        // Ignore non-secure context or browser restriction
      }
    };

    if (!reducedMotion && devOrientCtor) {
      if (requiresIosPermission) {
        // iOS 13+: Automatically trigger permission prompt on the very first tap/click anywhere on the login screen
        window.addEventListener('click', requestIosGyroOnFirstGesture, true);
        window.addEventListener('touchend', requestIosGyroOnFirstGesture, true);
      } else {
        // Android / non-iOS mobile browsers: attach immediately with zero friction
        attachGyroListener();
      }
    }

    const handleResize = () => {
      const rect = stageEl.getBoundingClientRect();
      controller.resize(
        Math.max(1, Math.round(rect.width || window.innerWidth)),
        Math.max(1, Math.round(rect.height || window.innerHeight))
      );
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(stageEl);
    }
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('click', requestIosGyroOnFirstGesture, true);
      window.removeEventListener('touchend', requestIosGyroOnFirstGesture, true);
      if (gyroAttached) {
        window.removeEventListener('deviceorientation', onDeviceOrientation);
      }
      if (resizeObserver) resizeObserver.disconnect();
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

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
      <canvas ref={canvasRef} className="atelier-silk-canvas" />
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
