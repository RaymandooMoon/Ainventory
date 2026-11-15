import { memo, useEffect, useRef } from 'react';
import { CARBON_DOM_CONTRACT } from '../../contracts/carbonDesignContract.ts';

export interface LoginBackdropCanvasProps {
  effectiveTheme?: string;
  lang?: string;
}

interface RgbTuple {
  r: number;
  g: number;
  b: number;
}

interface SilkRibbonSpec {
  yRatio: number;
  ampPrimary: number;
  ampSecondary: number;
  freqPrimary: number;
  freqSecondary: number;
  speedPrimary: number;
  speedSecondary: number;
  thickness: number;
  twistPhase: number;
  parallaxDepth: number;
  darkPrimary: RgbTuple;
  darkSecondary: RgbTuple;
  lightPrimary: RgbTuple;
  lightSecondary: RgbTuple;
  alphaDark: number;
  alphaLight: number;
}

interface BokehMote {
  xNorm: number;
  yNorm: number;
  vx: number;
  vy: number;
  radius: number;
  depth: number;
  phase: number;
  warmTint: boolean;
}

const SILK_RIBBONS: readonly SilkRibbonSpec[] = [
  {
    yRatio: 0.24,
    ampPrimary: 46,
    ampSecondary: 20,
    freqPrimary: 1.65,
    freqSecondary: 3.1,
    speedPrimary: 0.42,
    speedSecondary: 0.68,
    thickness: 68,
    twistPhase: 0.9,
    parallaxDepth: 0.95,
    darkPrimary: { r: 226, g: 217, b: 200 }, // Champagne Silver
    darkSecondary: { r: 99, g: 102, b: 241 }, // Royal Indigo
    lightPrimary: { r: 198, g: 156, b: 109 }, // Couture Warm Gold
    lightSecondary: { r: 148, g: 163, b: 184 }, // Pearl Shadow
    alphaDark: 0.16,
    alphaLight: 0.18,
  },
  {
    yRatio: 0.38,
    ampPrimary: 58,
    ampSecondary: 24,
    freqPrimary: 1.3,
    freqSecondary: 2.6,
    speedPrimary: -0.36,
    speedSecondary: 0.54,
    thickness: 84,
    twistPhase: 1.6,
    parallaxDepth: 0.72,
    darkPrimary: { r: 99, g: 102, b: 241 }, // Royal Indigo
    darkSecondary: { r: 56, g: 189, b: 248 }, // Sapphire Glow
    lightPrimary: { r: 51, g: 65, b: 85 }, // Slate Ink
    lightSecondary: { r: 198, g: 156, b: 109 }, // Warm Gold
    alphaDark: 0.14,
    alphaLight: 0.11,
  },
  {
    yRatio: 0.52,
    ampPrimary: 42,
    ampSecondary: 18,
    freqPrimary: 1.9,
    freqSecondary: 3.5,
    speedPrimary: 0.48,
    speedSecondary: -0.62,
    thickness: 56,
    twistPhase: 2.3,
    parallaxDepth: 1.15,
    darkPrimary: { r: 56, g: 189, b: 248 }, // Sapphire Glow
    darkSecondary: { r: 226, g: 217, b: 200 }, // Champagne Silver
    lightPrimary: { r: 180, g: 142, b: 98 }, // Cashmere Gold
    lightSecondary: { r: 100, g: 116, b: 139 }, // Cool Slate
    alphaDark: 0.13,
    alphaLight: 0.15,
  },
  {
    yRatio: 0.66,
    ampPrimary: 52,
    ampSecondary: 22,
    freqPrimary: 1.45,
    freqSecondary: 2.85,
    speedPrimary: -0.31,
    speedSecondary: -0.5,
    thickness: 76,
    twistPhase: 3.1,
    parallaxDepth: 0.84,
    darkPrimary: { r: 139, g: 92, b: 246 }, // Violet Silk
    darkSecondary: { r: 56, g: 189, b: 248 }, // Sapphire Glow
    lightPrimary: { r: 148, g: 163, b: 184 }, // Pearl Shadow
    lightSecondary: { r: 51, g: 65, b: 85 }, // Slate Ink
    alphaDark: 0.12,
    alphaLight: 0.12,
  },
  {
    yRatio: 0.79,
    ampPrimary: 38,
    ampSecondary: 16,
    freqPrimary: 1.75,
    freqSecondary: 3.2,
    speedPrimary: 0.39,
    speedSecondary: 0.57,
    thickness: 62,
    twistPhase: 0.5,
    parallaxDepth: 0.64,
    darkPrimary: { r: 226, g: 217, b: 200 }, // Champagne Silver
    darkSecondary: { r: 99, g: 102, b: 241 }, // Royal Indigo
    lightPrimary: { r: 198, g: 156, b: 109 }, // Warm Gold
    lightSecondary: { r: 148, g: 163, b: 184 }, // Pearl Shadow
    alphaDark: 0.13,
    alphaLight: 0.16,
  },
  {
    yRatio: 0.46,
    ampPrimary: 30,
    ampSecondary: 14,
    freqPrimary: 2.25,
    freqSecondary: 4.1,
    speedPrimary: -0.52,
    speedSecondary: 0.74,
    thickness: 40,
    twistPhase: 1.9,
    parallaxDepth: 1.25,
    darkPrimary: { r: 241, g: 245, b: 249 }, // Luminous Silk Thread
    darkSecondary: { r: 226, g: 217, b: 200 }, // Champagne Silver
    lightPrimary: { r: 166, g: 128, b: 86 }, // Brushed Bronze
    lightSecondary: { r: 71, g: 85, b: 105 }, // Deep Slate
    alphaDark: 0.11,
    alphaLight: 0.12,
  },
];

function createInitialMotes(count: number): BokehMote[] {
  const motes: BokehMote[] = [];
  for (let i = 0; i < count; i += 1) {
    const seed = (i + 1) * 9301 + 49297;
    const pseudoA = ((seed * 233) % 1000) / 1000;
    const pseudoB = ((seed * 617) % 1000) / 1000;
    const pseudoC = ((seed * 389) % 1000) / 1000;
    motes.push({
      xNorm: pseudoA,
      yNorm: pseudoB,
      vx: (pseudoC - 0.5) * 0.016,
      vy: (((seed * 173) % 1000) / 1000 - 0.5) * 0.012,
      radius: 1.4 + pseudoC * 2.8,
      depth: 0.35 + pseudoA * 0.85,
      phase: pseudoB * Math.PI * 2,
      warmTint: i % 2 === 0,
    });
  }
  return motes;
}

function mixChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function mixRgb(light: RgbTuple, dark: RgbTuple, darkMix: number): RgbTuple {
  return {
    r: mixChannel(light.r, dark.r, darkMix),
    g: mixChannel(light.g, dark.g, darkMix),
    b: mixChannel(light.b, dark.b, darkMix),
  };
}

function rgbaStr(c: RgbTuple, alpha: number): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.max(0, Math.min(1, alpha)).toFixed(4)})`;
}

/**
 * Kinetic AI Wardrobe Atelier Fullscreen Backdrop
 * - Layer A: Pure TypeScript HTML5 Canvas 2D Silk/Cashmere Aurora Ribbons + Spatial Bokeh
 * - Layer B: Adaptive 3D Parallax Frosted-Glass Couture Curation Cards (Desktop Safe Flanks)
 * - Zero <video>, zero external libs, zero hairline borders, SVG feTurbulence anti-banding dither
 */
const LoginBackdropCanvas = memo(function LoginBackdropCanvas({
  effectiveTheme = 'light',
  lang = 'ko',
}: LoginBackdropCanvasProps) {
  const isEn = lang === 'en';
  const isDark = effectiveTheme === 'dark';

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetDarkRef = useRef<number>(isDark ? 1 : 0);
  targetDarkRef.current = isDark ? 1 : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return undefined;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return undefined;

    const reducedMotionQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    let prefersReducedMotion = Boolean(reducedMotionQuery?.matches);

    let width = Math.max(window.innerWidth || 1, 1);
    let height = Math.max(window.innerHeight || 1, 1);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const syncSize = () => {
      width = Math.max(window.innerWidth || 1, 1);
      height = Math.max(window.innerHeight || 1, 1);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    syncSize();

    // Spring-damped pointer state (-1..1 range)
    let pointerActive = false;
    let lastPointerTs = 0;
    let targetPtrX = 0;
    let targetPtrY = 0;
    let currentPtrX = 0;
    let currentPtrY = 0;
    let currentDarkMix = targetDarkRef.current;

    const motes = createInitialMotes(30);

    const onPointerMove = (ev: PointerEvent) => {
      if (width <= 0 || height <= 0) return;
      pointerActive = true;
      lastPointerTs = performance.now();
      targetPtrX = Math.max(-1, Math.min(1, (ev.clientX / width) * 2 - 1));
      targetPtrY = Math.max(-1, Math.min(1, (ev.clientY / height) * 2 - 1));
    };

    const onTouchMove = (ev: TouchEvent) => {
      const touch = ev.touches?.[0];
      if (!touch || width <= 0 || height <= 0) return;
      pointerActive = true;
      lastPointerTs = performance.now();
      targetPtrX = Math.max(-1, Math.min(1, (touch.clientX / width) * 2 - 1));
      targetPtrY = Math.max(-1, Math.min(1, (touch.clientY / height) * 2 - 1));
    };

    const drawFrame = (timeSec: number, dtSec: number) => {
      // Autonomous Lissajous orbital drift when idle or on mobile
      if (!pointerActive || performance.now() - lastPointerTs > 3200) {
        targetPtrX = Math.sin(timeSec * 0.34) * 0.45;
        targetPtrY = Math.cos(timeSec * 0.26) * 0.38;
      }

      // Spring damping physics (lerp factor 0.04)
      const springLerp = 0.04;
      currentPtrX += (targetPtrX - currentPtrX) * springLerp;
      currentPtrY += (targetPtrY - currentPtrY) * springLerp;

      // Smooth theme cross-fade
      const desiredDark = targetDarkRef.current;
      currentDarkMix += (desiredDark - currentDarkMix) * (prefersReducedMotion ? 1 : 0.08);
      if (Math.abs(desiredDark - currentDarkMix) < 0.002) {
        currentDarkMix = desiredDark;
      }

      // Update CSS custom properties for Layer B 3D parallax glass cards (zero React re-render)
      stage.style.setProperty('--atelier-ptr-x', currentPtrX.toFixed(4));
      stage.style.setProperty('--atelier-ptr-y', currentPtrY.toFixed(4));

      // 1. Seamless Full-Bleed Velvet Black / Warm Alabaster Base Gradient
      const topBg = mixRgb({ r: 248, g: 247, b: 244 }, { r: 5, g: 7, b: 11 }, currentDarkMix);
      const midBg = mixRgb({ r: 244, g: 241, b: 235 }, { r: 8, g: 12, b: 22 }, currentDarkMix);
      const botBg = mixRgb({ r: 239, g: 236, b: 230 }, { r: 11, g: 17, b: 32 }, currentDarkMix);

      const bgGrad = ctx.createLinearGradient(0, 0, width * 0.35, height);
      bgGrad.addColorStop(0, rgbaStr(topBg, 1));
      bgGrad.addColorStop(0.52, rgbaStr(midBg, 1));
      bgGrad.addColorStop(1, rgbaStr(botBg, 1));
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Soft Ambient Couture Aura Glows (responds gently to spring pointer)
      const aura1CenterX = width * (0.28 + currentPtrX * 0.06);
      const aura1CenterY = height * (0.26 + currentPtrY * 0.06);
      const aura1Radius = Math.max(width, height) * 0.58;
      const aura1Color = mixRgb(
        { r: 198, g: 156, b: 109 },
        { r: 67, g: 76, b: 178 },
        currentDarkMix
      );
      const aura1 = ctx.createRadialGradient(
        aura1CenterX,
        aura1CenterY,
        0,
        aura1CenterX,
        aura1CenterY,
        aura1Radius
      );
      aura1.addColorStop(0, rgbaStr(aura1Color, 0.11 + currentDarkMix * 0.04));
      aura1.addColorStop(0.6, rgbaStr(aura1Color, 0.03));
      aura1.addColorStop(1, rgbaStr(aura1Color, 0));
      ctx.fillStyle = aura1;
      ctx.fillRect(0, 0, width, height);

      const aura2CenterX = width * (0.74 - currentPtrX * 0.05);
      const aura2CenterY = height * (0.72 - currentPtrY * 0.05);
      const aura2Radius = Math.max(width, height) * 0.54;
      const aura2Color = mixRgb(
        { r: 148, g: 163, b: 184 },
        { r: 42, g: 120, b: 178 },
        currentDarkMix
      );
      const aura2 = ctx.createRadialGradient(
        aura2CenterX,
        aura2CenterY,
        0,
        aura2CenterX,
        aura2CenterY,
        aura2Radius
      );
      aura2.addColorStop(0, rgbaStr(aura2Color, 0.1 + currentDarkMix * 0.03));
      aura2.addColorStop(0.65, rgbaStr(aura2Color, 0.025));
      aura2.addColorStop(1, rgbaStr(aura2Color, 0));
      ctx.fillStyle = aura2;
      ctx.fillRect(0, 0, width, height);

      // 3. Layer A — Flowing Couture Silk/Cashmere Ribbons (Harmonic Bezier Envelopes)
      const segments = 24;
      const bleedX = 80;
      const spanW = width + bleedX * 2;
      const ampScale = Math.min(1.18, Math.max(0.62, width / 1280));

      ctx.save();
      ctx.globalCompositeOperation = currentDarkMix > 0.5 ? 'screen' : 'source-over';

      for (let rIdx = 0; rIdx < SILK_RIBBONS.length; rIdx += 1) {
        const spec = SILK_RIBBONS[rIdx];
        const primaryRgb = mixRgb(spec.lightPrimary, spec.darkPrimary, currentDarkMix);
        const secondaryRgb = mixRgb(spec.lightSecondary, spec.darkSecondary, currentDarkMix);
        const baseAlpha =
          spec.alphaLight + (spec.alphaDark - spec.alphaLight) * currentDarkMix;

        const upperX: number[] = [];
        const upperY: number[] = [];
        const lowerX: number[] = [];
        const lowerY: number[] = [];

        const ptrOffsetY = currentPtrY * 28 * spec.parallaxDepth;
        const ptrPhaseShift = currentPtrX * 0.55 * spec.parallaxDepth;

        for (let s = 0; s <= segments; s += 1) {
          const u = s / segments;
          const px = -bleedX + u * spanW;

          const waveA =
            Math.sin(u * Math.PI * spec.freqPrimary + timeSec * spec.speedPrimary + ptrPhaseShift) *
            spec.ampPrimary *
            ampScale;
          const waveB =
            Math.cos(
              u * Math.PI * spec.freqSecondary + timeSec * spec.speedSecondary - ptrPhaseShift * 0.7
            ) *
            spec.ampSecondary *
            ampScale;

          const centerY = height * spec.yRatio + waveA + waveB + ptrOffsetY;
          const twist =
            Math.sin(u * Math.PI * 2.2 + timeSec * 0.45 + spec.twistPhase) *
            spec.thickness *
            ampScale;

          upperX.push(px);
          upperY.push(centerY - twist * 0.52);
          lowerX.push(px);
          lowerY.push(centerY + twist * 0.52 + 8);
        }

        // Ribbon horizontal silk sheen gradient
        const ribGrad = ctx.createLinearGradient(0, height * spec.yRatio - 80, width, height * spec.yRatio + 80);
        ribGrad.addColorStop(0, rgbaStr(primaryRgb, 0));
        ribGrad.addColorStop(0.2, rgbaStr(primaryRgb, baseAlpha * 0.85));
        ribGrad.addColorStop(0.52, rgbaStr(secondaryRgb, baseAlpha * 1.15));
        ribGrad.addColorStop(0.82, rgbaStr(primaryRgb, baseAlpha * 0.9));
        ribGrad.addColorStop(1, rgbaStr(secondaryRgb, 0));

        ctx.beginPath();
        ctx.moveTo(upperX[0], upperY[0]);
        for (let s = 1; s <= segments; s += 1) {
          const prevX = upperX[s - 1];
          const prevY = upperY[s - 1];
          const midX = (prevX + upperX[s]) * 0.5;
          const midY = (prevY + upperY[s]) * 0.5;
          ctx.quadraticCurveTo(prevX, prevY, midX, midY);
        }
        ctx.lineTo(upperX[segments], upperY[segments]);
        ctx.lineTo(lowerX[segments], lowerY[segments]);

        for (let s = segments - 1; s >= 0; s -= 1) {
          const nextX = lowerX[s + 1];
          const nextY = lowerY[s + 1];
          const midX = (nextX + lowerX[s]) * 0.5;
          const midY = (nextY + lowerY[s]) * 0.5;
          ctx.quadraticCurveTo(nextX, nextY, midX, midY);
        }
        ctx.closePath();
        ctx.fillStyle = ribGrad;
        ctx.fill();

        // Fine specular couture filament along the upper crest
        const threadGrad = ctx.createLinearGradient(0, 0, width, 0);
        threadGrad.addColorStop(0, rgbaStr(primaryRgb, 0));
        threadGrad.addColorStop(0.28, rgbaStr(primaryRgb, baseAlpha * 1.65));
        threadGrad.addColorStop(0.55, rgbaStr(secondaryRgb, baseAlpha * 1.9));
        threadGrad.addColorStop(0.82, rgbaStr(primaryRgb, baseAlpha * 1.4));
        threadGrad.addColorStop(1, rgbaStr(primaryRgb, 0));

        ctx.beginPath();
        ctx.moveTo(upperX[0], upperY[0]);
        for (let s = 1; s <= segments; s += 1) {
          const prevX = upperX[s - 1];
          const prevY = upperY[s - 1];
          const midX = (prevX + upperX[s]) * 0.5;
          const midY = (prevY + upperY[s]) * 0.5;
          ctx.quadraticCurveTo(prevX, prevY, midX, midY);
        }
        ctx.strokeStyle = threadGrad;
        ctx.lineWidth = 1.15;
        ctx.stroke();
      }

      // 4. Spatial Bokeh Dust Motes
      for (let i = 0; i < motes.length; i += 1) {
        const m = motes[i];
        if (!prefersReducedMotion) {
          m.xNorm = (m.xNorm + m.vx * dtSec + 1) % 1;
          m.yNorm = (m.yNorm + m.vy * dtSec + 1) % 1;
        }
        const mx = m.xNorm * width + currentPtrX * 18 * m.depth;
        const my = m.yNorm * height + currentPtrY * 14 * m.depth;
        const shimmer = 0.55 + 0.45 * Math.sin(timeSec * 1.4 + m.phase);
        const moteRgb = m.warmTint
          ? mixRgb({ r: 186, g: 146, b: 98 }, { r: 226, g: 217, b: 200 }, currentDarkMix)
          : mixRgb({ r: 100, g: 116, b: 139 }, { r: 125, g: 211, b: 252 }, currentDarkMix);
        const alpha = (0.12 + currentDarkMix * 0.14) * shimmer;

        const r = m.radius * (1 + m.depth * 0.5);
        const moteGrad = ctx.createRadialGradient(mx, my, 0, mx, my, r * 3.2);
        moteGrad.addColorStop(0, rgbaStr(moteRgb, alpha));
        moteGrad.addColorStop(0.45, rgbaStr(moteRgb, alpha * 0.35));
        moteGrad.addColorStop(1, rgbaStr(moteRgb, 0));

        ctx.fillStyle = moteGrad;
        ctx.beginPath();
        ctx.arc(mx, my, r * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    let rafId = 0;
    let prevTs = performance.now();
    const startTs = prevTs;

    const tick = (nowTs: number) => {
      if (document.visibilityState === 'hidden') {
        prevTs = nowTs;
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      const dtSec = Math.min(0.05, Math.max(0.001, (nowTs - prevTs) / 1000));
      prevTs = nowTs;
      drawFrame((nowTs - startTs) / 1000, dtSec);
      if (!prefersReducedMotion || Math.abs(targetDarkRef.current - currentDarkMix) > 0.005) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        rafId = 0;
      }
    };

    const startLoopIfNeeded = () => {
      if (rafId === 0) {
        prevTs = performance.now();
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const onResize = () => {
      syncSize();
      drawFrame((performance.now() - startTs) / 1000, 0.016);
      startLoopIfNeeded();
    };

    const onMotionPrefChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
      if (prefersReducedMotion) {
        stage.style.setProperty('--atelier-ptr-x', '0');
        stage.style.setProperty('--atelier-ptr-y', '0');
        drawFrame(2.4, 0);
      } else {
        startLoopIfNeeded();
      }
    };

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    reducedMotionQuery?.addEventListener?.('change', onMotionPrefChange);

    if (prefersReducedMotion) {
      drawFrame(2.4, 0);
    } else {
      startLoopIfNeeded();
    }

    return () => {
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchmove', onTouchMove);
      reducedMotionQuery?.removeEventListener?.('change', onMotionPrefChange);
    };
  }, []);

  // Trigger smooth redraw whenever effectiveTheme flips even under prefers-reduced-motion
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    window.dispatchEvent(new Event('resize'));
  }, [isDark]);

  return (
    <div
      ref={stageRef}
      id={CARBON_DOM_CONTRACT.loginMotionStageId}
      data-motion-theme={isDark ? 'dark' : 'light'}
      className="atelier-backdrop-stage"
    >
      {/* Layer A: 60fps Silk/Cashmere Couture Light Ribbons Canvas */}
      <canvas ref={canvasRef} className="atelier-silk-canvas" aria-hidden="true" />

      {/* Anti-Banding Ultra-Light SVG feTurbulence Dither Veil (opacity 0.025) */}
      <svg className="atelier-dither-veil" aria-hidden="true">
        <filter id="atelier-velvet-dither">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.82"
            numOctaves={3}
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#atelier-velvet-dither)" />
      </svg>

      {/* Ambient Live AI Wardrobe Capsule (Visible across Mobile + Desktop Safe Zones) */}
      <div className="atelier-live-capsule-wrap">
        <div id="wardrobe-optical-scanner" className="atelier-live-capsule">
          <span className="atelier-live-dot" data-inventory-slot="0" aria-hidden="true" />
          <span>
            {isEn
              ? 'AI Weather Styling · Digital Closet'
              : 'AI 날씨 스타일링 · 디지털 옷장'}
          </span>
        </div>
      </div>

      {/* Layer B: Adaptive 3D Parallax Couture Curation Cards (Desktop Safe Flanks >= 1180px) */}
      <div className="atelier-flank-cards" aria-hidden="true">
        {/* Card 1 (Top-Left): AI Weather Fit */}
        <article className="atelier-curation-card atelier-curation-card--tl">
          <div className="atelier-card-head">
            <span className="atelier-card-badge">12°C · BREEZE</span>
          </div>
          <div className="atelier-card-art">
            <svg width="56" height="56" viewBox="0 0 64 64" fill="none">
              <path
                d="M23 12L15 21L19 30L21 26V52H43V26L45 30L49 21L41 12L35 17H29L23 12Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
                fill="currentColor"
                fillOpacity="0.08"
              />
              <path d="M32 17V52" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.55" />
              <path d="M21 33H43" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          </div>
          <div>
            <p className="atelier-card-title">{isEn ? 'AI Weather Fit' : 'AI 날씨 피팅'}</p>
            <p className="atelier-card-meta">
              {isEn ? 'Micro-climate outer styling' : '체감 기온 맞춤 아우터 큐레이션'}
            </p>
          </div>
        </article>

        {/* Card 2 (Bottom-Left): Personal Color Harmony */}
        <article className="atelier-curation-card atelier-curation-card--bl">
          <div className="atelier-card-head">
            <span className="atelier-card-badge">98% HARMONY</span>
          </div>
          <div className="atelier-card-art">
            <div className="atelier-swatch-cluster">
              <span className="atelier-swatch-orb" style={{ background: '#E5D5C3' }} />
              <span className="atelier-swatch-orb" style={{ background: '#C69C6D' }} />
              <span className="atelier-swatch-orb" style={{ background: '#64748B' }} />
              <span className="atelier-swatch-orb" style={{ background: '#1E293B' }} />
            </div>
          </div>
          <div>
            <p className="atelier-card-title">{isEn ? 'Color Harmony' : '퍼스널 컬러 조화'}</p>
            <p className="atelier-card-meta">
              {isEn ? 'Skin-tone L*a*b* balance' : '피부톤 L*a*b* 팔레트 매칭'}
            </p>
          </div>
        </article>

        {/* Card 3 (Top-Right): Smart Digital Closet */}
        <article className="atelier-curation-card atelier-curation-card--tr">
          <div className="atelier-card-head">
            <span className="atelier-card-badge">CASHMERE · WOOL</span>
          </div>
          <div className="atelier-card-art">
            <svg width="56" height="56" viewBox="0 0 64 64" fill="none">
              <path
                d="M24 16L13 25L18 33L22 29V49H42V29L46 33L51 25L40 16C37.5 18.8 34.8 20 32 20C29.2 20 26.5 18.8 24 16Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
                fill="currentColor"
                fillOpacity="0.08"
              />
              <path
                d="M25 38H39M25 43H39"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeOpacity="0.5"
              />
            </svg>
          </div>
          <div>
            <p className="atelier-card-title">{isEn ? 'Smart Closet' : '스마트 디지털 옷장'}</p>
            <p className="atelier-card-meta">
              {isEn ? 'Fabric & cut auto-indexing' : '소재·실루엣 자동 분류 아카이브'}
            </p>
          </div>
        </article>

        {/* Card 4 (Bottom-Right): RGBA Studio Cutout */}
        <article className="atelier-curation-card atelier-curation-card--br">
          <div className="atelier-card-head">
            <span className="atelier-card-badge">RGBA · STUDIO</span>
          </div>
          <div className="atelier-card-art">
            <svg width="56" height="56" viewBox="0 0 64 64" fill="none">
              <ellipse
                cx="32"
                cy="49"
                rx="16"
                ry="4"
                fill="currentColor"
                fillOpacity="0.16"
              />
              <path
                d="M26 14L20 22V44H44V22L38 14L32 22L26 14Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
                fill="currentColor"
                fillOpacity="0.08"
              />
              <circle cx="32" cy="31" r="1.8" fill="currentColor" />
              <circle cx="32" cy="37" r="1.8" fill="currentColor" />
            </svg>
          </div>
          <div>
            <p className="atelier-card-title">
              {isEn ? 'Studio RGBA Cutout' : '투명 스튜디오 누끼'}
            </p>
            <p className="atelier-card-meta">
              {isEn ? 'Seamless dual-theme VTON' : '다크·라이트 완벽 투과 가상 피팅'}
            </p>
          </div>
        </article>
      </div>
    </div>
  );
});

export default LoginBackdropCanvas;
