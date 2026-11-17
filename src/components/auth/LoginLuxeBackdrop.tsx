import { memo, useEffect, useRef } from 'react';
import { CARBON_DOM_CONTRACT } from '../../contracts/carbonDesignContract.ts';
import type { LoginLook } from '../../services/loginLook.ts';

export interface LoginLuxeBackdropProps {
  effectiveTheme?: string;
  look?: LoginLook;
}

interface SilkRibbon {
  cy: number;
  amp: number;
  amp2: number;
  freq: number;
  freq2: number;
  speed: number;
  speed2: number;
  fibres: number;
  spread: number;
  depth: number;
  alpha: number;
  glintSpeed: number;
  glintPhase: number;
}

/** Three gold silk ribbons, each made of twisting fibres (Look 01 — Maison). */
const SILK_RIBBONS: readonly SilkRibbon[] = [
  { cy: 0.28, amp: 72, amp2: 26, freq: 0.0042, freq2: 0.011, speed: 0.32, speed2: 0.21, fibres: 12, spread: 5.5, depth: 1, alpha: 1, glintSpeed: 0.055, glintPhase: 0 },
  { cy: 0.74, amp: 92, amp2: 30, freq: 0.0034, freq2: 0.009, speed: -0.26, speed2: 0.17, fibres: 10, spread: 7, depth: 0.6, alpha: 0.82, glintSpeed: 0.042, glintPhase: 0.55 },
  { cy: 0.52, amp: 44, amp2: 18, freq: 0.0058, freq2: 0.014, speed: 0.18, speed2: -0.3, fibres: 6, spread: 3.6, depth: 0.35, alpha: 0.5, glintSpeed: 0.07, glintPhase: 0.25 },
];

const MARQUEE_ROWS: readonly string[] = [
  'A INVENTORY — PRIVATE FITTING — ',
  'AI ATELIER — COLLECTION 01 — ',
  'A INVENTORY — DIGITAL WARDROBE — ',
];

interface Palette {
  fibre: string;
  glint: string;
  fibreAlpha: number;
  glintAlpha: number;
  composite: GlobalCompositeOperation;
}

const PALETTES: Readonly<Record<'light' | 'dark', Palette>> = {
  dark: {
    fibre: '212, 175, 106',
    glint: '246, 226, 180',
    fibreAlpha: 0.5,
    glintAlpha: 0.9,
    composite: 'lighter',
  },
  light: {
    fibre: '176, 141, 87',
    glint: '214, 182, 120',
    fibreAlpha: 0.42,
    glintAlpha: 0.55,
    composite: 'source-over',
  },
};

function ribbonCenterY(r: SilkRibbon, x: number, t: number, h: number, ptrY: number): number {
  return (
    r.cy * h +
    r.amp * Math.sin(x * r.freq + t * r.speed) +
    r.amp2 * Math.sin(x * r.freq2 - t * r.speed2) +
    ptrY * 22 * r.depth
  );
}

/**
 * Brand-surface motion stage for the login intro.
 * - Maison: 60fps Canvas 2D gold silk fibres with travelling glints + pointer parallax.
 * - Runway: CSS-only spotlight sweep, typographic outline marquee and runway light lanes.
 * Pauses when the tab is hidden; renders a single still frame under reduced motion.
 */
const LoginLuxeBackdrop = memo(function LoginLuxeBackdrop({
  effectiveTheme = 'light',
  look = 'maison',
}: LoginLuxeBackdropProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDark = effectiveTheme === 'dark';

  useEffect(() => {
    if (look !== 'maison') return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;

    const palette = PALETTES[isDark ? 'dark' : 'light'];
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let frameId = 0;
    let ptrY = 0;
    let targetPtrY = 0;
    let gradients: CanvasGradient[] = [];
    const startedAt = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gradients = SILK_RIBBONS.map((r) => {
        const g = ctx.createLinearGradient(0, 0, width, 0);
        const a = palette.fibreAlpha * r.alpha;
        g.addColorStop(0, `rgba(${palette.fibre}, 0)`);
        g.addColorStop(0.18, `rgba(${palette.fibre}, ${a})`);
        g.addColorStop(0.82, `rgba(${palette.fibre}, ${a})`);
        g.addColorStop(1, `rgba(${palette.fibre}, 0)`);
        return g;
      });
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = palette.composite;
      const compact = width < 640;
      const step = compact ? 10 : 8;

      SILK_RIBBONS.forEach((r, ri) => {
        const fibres = compact ? Math.max(4, Math.round(r.fibres * 0.7)) : r.fibres;
        const mid = (fibres - 1) / 2;
        ctx.strokeStyle = gradients[ri];
        for (let i = 0; i < fibres; i += 1) {
          ctx.lineWidth = i === Math.round(mid) ? 1.3 : 0.7;
          ctx.beginPath();
          for (let x = -16; x <= width + 16; x += step) {
            const twist = 1 + 0.85 * Math.sin(x * 0.0028 + t * 0.45 + i * 0.35);
            const y = ribbonCenterY(r, x, t, height, ptrY) + (i - mid) * r.spread * twist;
            if (x === -16) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }

        // Travelling glint — a light catching the silk
        const progress = (((t * r.glintSpeed + r.glintPhase) % 1.3) + 1.3) % 1.3;
        const gx = (progress - 0.15) * width;
        const gy = ribbonCenterY(r, gx, t, height, ptrY);
        const radius = (compact ? 22 : 34) * (0.6 + r.depth * 0.4);
        const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
        glow.addColorStop(0, `rgba(${palette.glint}, ${palette.glintAlpha * r.alpha})`);
        glow.addColorStop(1, `rgba(${palette.glint}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(gx, gy, radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
    };

    const loop = (now: number) => {
      ptrY += (targetPtrY - ptrY) * 0.06;
      draw((now - startedAt) / 1000);
      frameId = window.requestAnimationFrame(loop);
    };

    const start = () => {
      if (reduceMotion || frameId) return;
      frameId = window.requestAnimationFrame(loop);
    };

    const stop = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = 0;
    };

    const handleVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    const handlePointer = (event: PointerEvent) => {
      if (!height) return;
      targetPtrY = (event.clientY / height - 0.5) * 2;
    };

    const handleResize = () => {
      resize();
      if (reduceMotion) draw(4);
    };

    resize();
    if (reduceMotion) draw(4);
    else start();

    window.addEventListener('resize', handleResize);
    window.addEventListener('pointermove', handlePointer, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stop();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isDark, look]);

  return (
    <div
      id={CARBON_DOM_CONTRACT.loginMotionStageId}
      className={`luxe-backdrop luxe-backdrop--${look}`}
      data-motion-theme={isDark ? 'dark' : 'light'}
      data-login-look={look}
      aria-hidden="true"
    >
      {look === 'maison' ? (
        <canvas ref={canvasRef} className="luxe-silk-canvas" data-luxe-motion="silk" />
      ) : (
        <div className="luxe-runway" data-luxe-motion="runway">
          <span className="luxe-spotlight luxe-spotlight--a" />
          <span className="luxe-spotlight luxe-spotlight--b" />
          <div className="luxe-marquee">
            {MARQUEE_ROWS.map((text, idx) => (
              <div
                key={text}
                className={`luxe-marquee-row ${idx === 1 ? 'is-gold' : ''} ${idx % 2 ? 'is-reverse' : ''}`}
              >
                <span>{text.repeat(3)}</span>
                <span>{text.repeat(3)}</span>
              </div>
            ))}
          </div>
          <div className="luxe-runway-lanes">
            {[0, 1, 2, 3, 4].map((lane) => (
              <span key={lane} className="luxe-runway-lane" style={{ ['--lane' as string]: lane }} />
            ))}
          </div>
        </div>
      )}
      <span className="luxe-vignette" />
      <svg className="luxe-grain" aria-hidden="true">
        <filter id="luxe-grain-filter">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#luxe-grain-filter)" />
      </svg>
    </div>
  );
});

export default LoginLuxeBackdrop;
