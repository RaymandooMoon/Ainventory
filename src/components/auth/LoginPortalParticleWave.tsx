import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';

export interface LoginPortalParticleWaveHandle {
  /**
   * Frame-locked render step driven directly by App's portal reveal RAF loop
   * so concentric silk ripple wavefronts match the main screen reveal 1:1.
   */
  renderStep: (progress: number, radiusPx: number, velocityPx: number) => void;
}

export interface LoginPortalParticleWaveProps {
  origin: { x: number; y: number };
  maxRadius: number;
  theme: 'light' | 'dark' | string;
  variant?: 'luxury' | 'aurora' | string;
}

interface RippleBandSpec {
  offsetPx: number;
  bandWidthPx: number;
  crestAlpha: number;
  troughAlpha: number;
  rimWidth: number;
  undulationAmp: number;
  phaseOffset: number;
}

// Nested concentric silk-water ripples matching the login backdrop wave aesthetic
const CONCENTRIC_SILK_RIPPLES: readonly RippleBandSpec[] = [
  // Subtle leading precursor wave rippling gently ahead of the opening edge
  {
    offsetPx: 30,
    bandWidthPx: 26,
    crestAlpha: 0.24,
    troughAlpha: 0.06,
    rimWidth: 1.0,
    undulationAmp: 3.5,
    phaseOffset: 0.4,
  },
  // Primary silky refractive wave crest riding directly on the opening reveal edge
  {
    offsetPx: 0,
    bandWidthPx: 58,
    crestAlpha: 0.62,
    troughAlpha: 0.22,
    rimWidth: 2.1,
    undulationAmp: 4.5,
    phaseOffset: 0.0,
  },
  // Secondary trailing concentric silk ripple
  {
    offsetPx: -54,
    bandWidthPx: 44,
    crestAlpha: 0.38,
    troughAlpha: 0.14,
    rimWidth: 1.4,
    undulationAmp: 5.2,
    phaseOffset: 1.55,
  },
  // Soft tertiary echo wave fading gracefully into the revealed studio
  {
    offsetPx: -116,
    bandWidthPx: 36,
    crestAlpha: 0.22,
    troughAlpha: 0.07,
    rimWidth: 1.0,
    undulationAmp: 6.0,
    phaseOffset: 3.1,
  },
];

function drawOrganicSilkRingStroke(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  baseRadius: number,
  clampedP: number,
  undulationAmp: number,
  phaseOffset: number
): void {
  const segments = 96;
  ctx.beginPath();
  for (let i = 0; i <= segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    const harmonic =
      Math.sin(theta * 3 + clampedP * 4.2 + phaseOffset) * 0.58 +
      Math.cos(theta * 5 - clampedP * 3.1 + phaseOffset * 0.7) * 0.42;
    const r = Math.max(1, baseRadius + harmonic * undulationAmp);
    const x = ox + Math.cos(theta) * r;
    const y = oy + Math.sin(theta) * r;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.stroke();
}

/**
 * Concentric Silk-Wave Portal Transition Overlay rendered on a DPR-aware 2D Canvas.
 * Mirrors the login backdrop's sculptural silk-ripple optics (concentric luminous crests +
 * soft trough shadows + theme-matched Luxury/Aurora sheen), frame-locked 1:1 with the
 * GPU clip-path reveal of the main application screen.
 */
const LoginPortalParticleWave = forwardRef<
  LoginPortalParticleWaveHandle,
  LoginPortalParticleWaveProps
>(function LoginPortalParticleWave({ origin, maxRadius, theme, variant = 'luxury' }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return undefined;

    const updateSize = () => {
      const w = Math.max(1, document.documentElement.clientWidth || window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      sizeRef.current = { w, h, dpr };
      ctxRef.current = canvas.getContext('2d');
    };

    updateSize();
    window.addEventListener('resize', updateSize, { passive: true });
    return () => {
      window.removeEventListener('resize', updateSize);
      ctxRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      renderStep(progress: number, radiusPx: number, velocityPx: number) {
        const ctx = ctxRef.current;
        if (!ctx) return;

        const { w, h, dpr } = sizeRef.current;
        if (w <= 0 || h <= 0) return;

        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        const clampedP = Math.max(0, Math.min(1, progress));
        // Silky unhurried fade-in (0..0.08) and serene fade-out (0.72..1.0)
        const fadeIn = Math.min(1, clampedP / 0.08);
        const fadeOut = 1 - Math.max(0, (clampedP - 0.72) / 0.28);
        const envelope = fadeIn * fadeOut * fadeOut;

        if (envelope <= 0.002 || radiusPx <= 1) {
          ctx.restore();
          return;
        }

        const isDark = theme === 'dark';
        const isAurora = variant === 'aurora';
        const ox = origin.x;
        const oy = origin.y;

        // Subtle width breathing synced with instantaneous wavefront velocity
        const speedNorm = Math.min(1, Math.max(0, velocityPx / Math.max(220, maxRadius * 1.15)));
        const widthScale = 1 + speedNorm * 0.28 + clampedP * 0.25;

        // Theme-calibrated silk sheen & trough colors matching loginThreeScenes.ts
        const crestPrimary = isAurora
          ? isDark
            ? [164, 218, 255] // Aurora Prism Cyan-Silver
            : [255, 252, 255] // Aurora Opaline Silk White
          : isDark
            ? [238, 218, 184] // Luxury Champagne Gold
            : [255, 253, 248]; // Luxury Alabaster Silk White

        const crestSecondary = isAurora
          ? isDark
            ? [216, 174, 255] // Aurora Amethyst Rim
            : [152, 184, 244] // Aurora Soft Sky-Lavender
          : isDark
            ? [214, 224, 246] // Luxury Platinum Mist
            : [204, 186, 158]; // Luxury Atelier Sand Gold

        const troughColor = isDark
          ? [0, 0, 0] // True OLED valley depth
          : isAurora
            ? [124, 134, 166] // Soft cool slate silk valley
            : [148, 138, 126]; // Warm sculptural silk shadow valley

        for (let i = 0; i < CONCENTRIC_SILK_RIPPLES.length; i += 1) {
          const spec = CONCENTRIC_SILK_RIPPLES[i];
          const ringR = radiusPx + spec.offsetPx * (0.72 + clampedP * 0.55);
          if (ringR <= 4 || ringR - spec.bandWidthPx * widthScale > maxRadius + 120) {
            continue;
          }

          const halfW = spec.bandWidthPx * widthScale;
          const innerR = Math.max(0, ringR - halfW);
          const outerR = Math.max(innerR + 6, ringR + halfW);

          const grad = ctx.createRadialGradient(ox, oy, innerR, ox, oy, outerR);
          const aCrest = spec.crestAlpha * envelope * (isDark ? 0.56 : 0.62);
          const aTrough = spec.troughAlpha * envelope * (isDark ? 0.65 : 0.42);
          const [r1, g1, b1] = crestPrimary;
          const [r2, g2, b2] = crestSecondary;
          const [rt, gt, bt] = troughColor;

          // Asymmetric wave profile: soft trailing trough -> bright luminous silk crest -> smooth outer sheen
          grad.addColorStop(0.0, `rgba(${rt}, ${gt}, ${bt}, 0)`);
          grad.addColorStop(0.26, `rgba(${rt}, ${gt}, ${bt}, ${aTrough.toFixed(4)})`);
          grad.addColorStop(0.46, `rgba(${r2}, ${g2}, ${b2}, ${(aCrest * 0.55).toFixed(4)})`);
          grad.addColorStop(0.56, `rgba(${r1}, ${g1}, ${b1}, ${aCrest.toFixed(4)})`);
          grad.addColorStop(0.72, `rgba(${r2}, ${g2}, ${b2}, ${(aCrest * 0.42).toFixed(4)})`);
          grad.addColorStop(1.0, `rgba(${r2}, ${g2}, ${b2}, 0)`);

          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(ox, oy, outerR, 0, Math.PI * 2);
          ctx.fill();

          // Delicate organic silk specular ridge along the crest peak
          if (spec.rimWidth > 0) {
            ctx.globalCompositeOperation = isDark ? 'lighter' : 'source-over';
            const rimAlpha = spec.crestAlpha * envelope * (isDark ? 0.48 : 0.58);
            ctx.strokeStyle = `rgba(${r1}, ${g1}, ${b1}, ${rimAlpha.toFixed(4)})`;
            ctx.lineWidth = spec.rimWidth * (0.9 + speedNorm * 0.3);
            drawOrganicSilkRingStroke(
              ctx,
              ox,
              oy,
              ringR + halfW * 0.08,
              clampedP,
              spec.undulationAmp * (0.65 + clampedP * 0.55),
              spec.phaseOffset
            );
          }
          ctx.restore();
        }

        ctx.restore();
      },
    }),
    [maxRadius, origin.x, origin.y, theme, variant]
  );

  return (
    <canvas
      ref={canvasRef}
      className="atelier-login-particle-wave"
      aria-hidden="true"
    />
  );
});

export default LoginPortalParticleWave;
