import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { CARBON_DOM_CONTRACT } from '../../contracts/carbonDesignContract.ts';

export interface LoginBackdropCanvasProps {
  effectiveTheme?: string;
  lang?: string;
  stage?: 'intro' | 'auth';
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

interface SpotlightBeamSpec {
  originXRatio: number;
  targetXRatio: number;
  topWidthRatio: number;
  bottomWidthRatio: number;
  phase: number;
  speed: number;
  swayAmp: number;
  darkRgb: RgbTuple;
  lightRgb: RgbTuple;
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
  isStarGlint: boolean;
}

const SILK_RIBBONS: readonly SilkRibbonSpec[] = [
  {
    yRatio: 0.16,
    ampPrimary: 44,
    ampSecondary: 18,
    freqPrimary: 1.55,
    freqSecondary: 2.95,
    speedPrimary: 0.44,
    speedSecondary: 0.72,
    thickness: 76,
    twistPhase: 0.4,
    parallaxDepth: 0.85,
    darkPrimary: { r: 245, g: 245, b: 247 },
    darkSecondary: { r: 216, g: 195, b: 165 },
    lightPrimary: { r: 29, g: 29, b: 31 },
    lightSecondary: { r: 178, g: 154, b: 122 },
    alphaDark: 0.15,
    alphaLight: 0.085,
  },
  {
    yRatio: 0.27,
    ampPrimary: 54,
    ampSecondary: 22,
    freqPrimary: 1.7,
    freqSecondary: 3.15,
    speedPrimary: -0.38,
    speedSecondary: 0.64,
    thickness: 88,
    twistPhase: 1.1,
    parallaxDepth: 1.0,
    darkPrimary: { r: 245, g: 245, b: 247 },
    darkSecondary: { r: 174, g: 174, b: 178 },
    lightPrimary: { r: 58, g: 58, b: 60 },
    lightSecondary: { r: 142, g: 142, b: 147 },
    alphaDark: 0.18,
    alphaLight: 0.1,
  },
  {
    yRatio: 0.39,
    ampPrimary: 62,
    ampSecondary: 26,
    freqPrimary: 1.32,
    freqSecondary: 2.65,
    speedPrimary: 0.36,
    speedSecondary: -0.58,
    thickness: 94,
    twistPhase: 1.8,
    parallaxDepth: 0.76,
    darkPrimary: { r: 216, g: 195, b: 165 },
    darkSecondary: { r: 229, g: 229, b: 234 },
    lightPrimary: { r: 184, g: 164, b: 136 },
    lightSecondary: { r: 44, g: 44, b: 46 },
    alphaDark: 0.17,
    alphaLight: 0.105,
  },
  {
    yRatio: 0.51,
    ampPrimary: 46,
    ampSecondary: 20,
    freqPrimary: 2.05,
    freqSecondary: 3.7,
    speedPrimary: -0.49,
    speedSecondary: 0.76,
    thickness: 58,
    twistPhase: 2.45,
    parallaxDepth: 1.24,
    darkPrimary: { r: 255, g: 252, b: 245 },
    darkSecondary: { r: 216, g: 195, b: 165 },
    lightPrimary: { r: 29, g: 29, b: 31 },
    lightSecondary: { r: 178, g: 154, b: 122 },
    alphaDark: 0.2,
    alphaLight: 0.115,
  },
  {
    yRatio: 0.63,
    ampPrimary: 58,
    ampSecondary: 24,
    freqPrimary: 1.48,
    freqSecondary: 2.9,
    speedPrimary: 0.34,
    speedSecondary: -0.52,
    thickness: 84,
    twistPhase: 3.15,
    parallaxDepth: 0.88,
    darkPrimary: { r: 174, g: 174, b: 178 },
    darkSecondary: { r: 99, g: 99, b: 102 },
    lightPrimary: { r: 110, g: 110, b: 115 },
    lightSecondary: { r: 209, g: 209, b: 214 },
    alphaDark: 0.15,
    alphaLight: 0.09,
  },
  {
    yRatio: 0.75,
    ampPrimary: 44,
    ampSecondary: 18,
    freqPrimary: 1.82,
    freqSecondary: 3.35,
    speedPrimary: -0.41,
    speedSecondary: 0.61,
    thickness: 70,
    twistPhase: 0.7,
    parallaxDepth: 0.7,
    darkPrimary: { r: 229, g: 229, b: 234 },
    darkSecondary: { r: 216, g: 195, b: 165 },
    lightPrimary: { r: 72, g: 72, b: 74 },
    lightSecondary: { r: 184, g: 164, b: 136 },
    alphaDark: 0.16,
    alphaLight: 0.095,
  },
  {
    yRatio: 0.87,
    ampPrimary: 36,
    ampSecondary: 16,
    freqPrimary: 2.2,
    freqSecondary: 4.05,
    speedPrimary: 0.48,
    speedSecondary: -0.68,
    thickness: 48,
    twistPhase: 2.1,
    parallaxDepth: 1.1,
    darkPrimary: { r: 216, g: 195, b: 165 },
    darkSecondary: { r: 142, g: 142, b: 147 },
    lightPrimary: { r: 142, g: 142, b: 147 },
    lightSecondary: { r: 184, g: 164, b: 136 },
    alphaDark: 0.15,
    alphaLight: 0.085,
  },
];

const SPOTLIGHT_BEAMS: readonly SpotlightBeamSpec[] = [
  {
    originXRatio: 0.16,
    targetXRatio: 0.56,
    topWidthRatio: 0.09,
    bottomWidthRatio: 0.44,
    phase: 0.2,
    speed: 0.28,
    swayAmp: 0.07,
    darkRgb: { r: 216, g: 195, b: 165 },
    lightRgb: { r: 216, g: 195, b: 165 },
    alphaDark: 0.085,
    alphaLight: 0.19,
  },
  {
    originXRatio: 0.84,
    targetXRatio: 0.42,
    topWidthRatio: 0.08,
    bottomWidthRatio: 0.4,
    phase: 2.1,
    speed: -0.23,
    swayAmp: 0.065,
    darkRgb: { r: 245, g: 245, b: 247 },
    lightRgb: { r: 29, g: 29, b: 31 },
    alphaDark: 0.075,
    alphaLight: 0.048,
  },
  {
    originXRatio: 0.5,
    targetXRatio: 0.5,
    topWidthRatio: 0.14,
    bottomWidthRatio: 0.56,
    phase: 1.0,
    speed: 0.18,
    swayAmp: 0.04,
    darkRgb: { r: 255, g: 252, b: 245 },
    lightRgb: { r: 255, g: 255, b: 255 },
    alphaDark: 0.065,
    alphaLight: 0.55,
  },
];

function createBokehSprite(rgb: RgbTuple): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const size = 36;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  if (!octx) return null;
  const half = size * 0.5;
  const grad = octx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, rgbaStr(rgb, 1));
  grad.addColorStop(0.28, rgbaStr(rgb, 0.58));
  grad.addColorStop(0.62, rgbaStr(rgb, 0.16));
  grad.addColorStop(1, rgbaStr(rgb, 0));
  octx.fillStyle = grad;
  octx.fillRect(0, 0, size, size);
  return off;
}

function createStarGlintSprite(rgb: RgbTuple): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const size = 48;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const octx = off.getContext('2d');
  if (!octx) return null;

  const half = size * 0.5;
  const core = octx.createRadialGradient(half, half, 0, half, half, half * 0.45);
  core.addColorStop(0, rgbaStr(rgb, 1));
  core.addColorStop(0.35, rgbaStr(rgb, 0.45));
  core.addColorStop(1, rgbaStr(rgb, 0));
  octx.fillStyle = core;
  octx.fillRect(0, 0, size, size);

  // Horizontal & vertical tapered 4-point couture shimmer rays
  const drawSpike = (rx: number, ry: number) => {
    octx.beginPath();
    octx.moveTo(half - rx, half);
    octx.quadraticCurveTo(half, half - ry * 0.22, half, half - ry);
    octx.quadraticCurveTo(half, half - ry * 0.22, half + rx, half);
    octx.quadraticCurveTo(half, half + ry * 0.22, half, half + ry);
    octx.quadraticCurveTo(half, half + ry * 0.22, half - rx, half);
    octx.closePath();
    const grad = octx.createRadialGradient(half, half, 0, half, half, Math.max(rx, ry));
    grad.addColorStop(0, rgbaStr(rgb, 0.96));
    grad.addColorStop(0.55, rgbaStr(rgb, 0.35));
    grad.addColorStop(1, rgbaStr(rgb, 0));
    octx.fillStyle = grad;
    octx.fill();
  };

  drawSpike(half * 0.92, half * 0.14);
  drawSpike(half * 0.14, half * 0.92);
  return off;
}

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
      vx: (pseudoC - 0.5) * 0.018,
      vy: (((seed * 173) % 1000) / 1000 - 0.5) * 0.013,
      radius: 1.5 + pseudoC * 3.1,
      depth: 0.35 + pseudoA * 0.9,
      phase: pseudoB * Math.PI * 2,
      warmTint: i % 2 === 0,
      isStarGlint: i % 4 === 0,
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
 * Kinetic AI Wardrobe Atelier Fullscreen Backdrop (Glamorous Runway Edition)
 * - Layer A.1: Sweeping Volumetric Catwalk Spotlight Beams & Rotating Orbital Hairline Arcs
 * - Layer A.2: 7-Layer Couture Silk & Organza Ribbons with Dual Specular Threads
 * - Layer A.3: Pre-baked Silver/Champagne Bokeh Sprites + 4-Point Couture Star Glints
 * - Layer B: Adaptive 3D Parallax Frosted-Glass Couture Curation Cards (Desktop Safe Flanks)
 */
const LoginBackdropCanvas = memo(function LoginBackdropCanvas({
  effectiveTheme = 'light',
  lang = 'ko',
  stage = 'intro',
}: LoginBackdropCanvasProps) {
  const isEn = lang === 'en';
  const isDark = effectiveTheme === 'dark';

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetDarkRef = useRef<number>(isDark ? 1 : 0);
  targetDarkRef.current = isDark ? 1 : 0;
  const targetIntroRef = useRef<number>(stage === 'intro' ? 1 : 0);
  targetIntroRef.current = stage === 'intro' ? 1 : 0;
  const syncThemeDrawRef = useRef<((snapImmediate: boolean) => void) | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stageEl = stageRef.current;
    if (!canvas || !stageEl) return undefined;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return undefined;

    const reducedMotionQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    let prefersReducedMotion = Boolean(reducedMotionQuery?.matches);

    let width = Math.max(window.innerWidth || 1, 1);
    let height = Math.max(window.innerHeight || 1, 1);
    let dpr = Math.min(window.devicePixelRatio || 1, 1.25);

    const syncSize = () => {
      width = Math.max(window.innerWidth || 1, 1);
      height = Math.max(window.innerHeight || 1, 1);
      dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    syncSize();

    // Pre-rendered offscreen bokeh & 4-point couture star glint sprites (zero per-frame gradient GC)
    const lightSilverSprite = createBokehSprite({ r: 99, g: 99, b: 102 });
    const lightSandSprite = createBokehSprite({ r: 184, g: 164, b: 136 });
    const darkSilverSprite = createBokehSprite({ r: 245, g: 245, b: 247 });
    const darkSandSprite = createBokehSprite({ r: 216, g: 195, b: 165 });
    const lightGlintSprite = createStarGlintSprite({ r: 140, g: 122, b: 96 });
    const darkGlintSprite = createStarGlintSprite({ r: 255, g: 248, b: 235 });

    let pointerActive = false;
    let lastPointerTs = 0;
    let targetPtrX = 0;
    let targetPtrY = 0;
    let currentPtrX = 0;
    let currentPtrY = 0;
    let currentDarkMix = targetDarkRef.current;
    let currentIntroMix = targetIntroRef.current;

    const motes = createInitialMotes(54);

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

    let lastCssPtrX = '';
    let lastCssPtrY = '';

    const drawFrame = (timeSec: number, dtSec: number) => {
      // Autonomous Lissajous orbital drift when idle or on mobile
      if (!pointerActive || performance.now() - lastPointerTs > 3200) {
        targetPtrX = Math.sin(timeSec * 0.36) * 0.56;
        targetPtrY = Math.cos(timeSec * 0.28) * 0.44;
      }

      const springLerp = 0.045;
      currentPtrX += (targetPtrX - currentPtrX) * springLerp;
      currentPtrY += (targetPtrY - currentPtrY) * springLerp;

      const desiredDark = targetDarkRef.current;
      const themeStep = prefersReducedMotion ? 1 : Math.min(1, Math.max(0.24, dtSec * 18));
      currentDarkMix += (desiredDark - currentDarkMix) * themeStep;
      if (Math.abs(desiredDark - currentDarkMix) < 0.01) {
        currentDarkMix = desiredDark;
      }

      const desiredIntro = targetIntroRef.current;
      const introStep = prefersReducedMotion ? 1 : Math.min(1, Math.max(0.14, dtSec * 10));
      currentIntroMix += (desiredIntro - currentIntroMix) * introStep;
      if (Math.abs(desiredIntro - currentIntroMix) < 0.008) {
        currentIntroMix = desiredIntro;
      }

      if (desiredIntro < 0.99 || currentIntroMix < 0.99) {
        const nextCssX = currentPtrX.toFixed(3);
        const nextCssY = currentPtrY.toFixed(3);
        if (nextCssX !== lastCssPtrX) {
          lastCssPtrX = nextCssX;
          stageEl.style.setProperty('--atelier-ptr-x', nextCssX);
        }
        if (nextCssY !== lastCssPtrY) {
          lastCssPtrY = nextCssY;
          stageEl.style.setProperty('--atelier-ptr-y', nextCssY);
        }
      }

      // 1. True OLED Pure Black (#000000) / Atelier Daylight (#FFFFFF -> #F2EFE8) Base Gradient
      const topBg = mixRgb({ r: 255, g: 255, b: 255 }, { r: 0, g: 0, b: 0 }, currentDarkMix);
      const midBg = mixRgb({ r: 249, g: 247, b: 243 }, { r: 0, g: 0, b: 0 }, currentDarkMix);
      const botBg = mixRgb({ r: 240, g: 236, b: 229 }, { r: 4, g: 4, b: 6 }, currentDarkMix);

      const bgGrad = ctx.createLinearGradient(0, 0, width * 0.35, height);
      bgGrad.addColorStop(0, rgbaStr(topBg, 1));
      bgGrad.addColorStop(0.56, rgbaStr(midBg, 1));
      bgGrad.addColorStop(1, rgbaStr(botBg, 1));
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Luminous Runway Editorial Halo & Counter-Aura
      const focalY = height * (0.44 + currentPtrY * 0.05 - (1 - currentIntroMix) * 0.14);
      const aura1CenterX = width * (0.5 + currentPtrX * 0.09 + Math.sin(timeSec * 0.25) * 0.045);
      const aura1Radius = Math.max(width, height) * 0.62;
      const aura1Color = mixRgb(
        { r: 222, g: 205, b: 180 },
        { r: 216, g: 195, b: 165 },
        currentDarkMix
      );
      const aura1 = ctx.createRadialGradient(
        aura1CenterX,
        focalY,
        0,
        aura1CenterX,
        focalY,
        aura1Radius
      );
      aura1.addColorStop(0, rgbaStr(aura1Color, 0.22 - currentDarkMix * 0.11));
      aura1.addColorStop(0.42, rgbaStr(aura1Color, 0.09 - currentDarkMix * 0.045));
      aura1.addColorStop(1, rgbaStr(aura1Color, 0));
      ctx.fillStyle = aura1;
      ctx.fillRect(0, 0, width, height);

      const aura2CenterX = width * (0.76 - currentPtrX * 0.07);
      const aura2CenterY = height * (0.76 - currentPtrY * 0.06);
      const aura2Radius = Math.max(width, height) * 0.52;
      const aura2Color = mixRgb(
        { r: 174, g: 174, b: 178 },
        { r: 110, g: 110, b: 120 },
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
      aura2.addColorStop(0, rgbaStr(aura2Color, 0.11 - currentDarkMix * 0.055));
      aura2.addColorStop(0.55, rgbaStr(aura2Color, 0.025));
      aura2.addColorStop(1, rgbaStr(aura2Color, 0));
      ctx.fillStyle = aura2;
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.globalCompositeOperation = currentDarkMix > 0.5 ? 'screen' : 'source-over';

      // 3. Layer A.1 — Sweeping Volumetric Catwalk Spotlight Beams
      for (let bIdx = 0; bIdx < SPOTLIGHT_BEAMS.length; bIdx += 1) {
        const beam = SPOTLIGHT_BEAMS[bIdx];
        const sway =
          Math.sin(timeSec * beam.speed + beam.phase) * beam.swayAmp + currentPtrX * 0.05;
        const ox = width * (beam.originXRatio + sway * 0.35);
        const tx = width * (beam.targetXRatio + sway);
        const topHalf = width * beam.topWidthRatio * 0.5;
        const botHalf = width * beam.bottomWidthRatio * 0.5;
        const beamRgb = mixRgb(beam.lightRgb, beam.darkRgb, currentDarkMix);
        const beamAlpha =
          (beam.alphaLight + (beam.alphaDark - beam.alphaLight) * currentDarkMix) *
          (0.86 + 0.14 * Math.sin(timeSec * 0.9 + beam.phase));

        const beamGrad = ctx.createLinearGradient(ox, -20, tx, height + 40);
        beamGrad.addColorStop(0, rgbaStr(beamRgb, beamAlpha));
        beamGrad.addColorStop(0.45, rgbaStr(beamRgb, beamAlpha * 0.58));
        beamGrad.addColorStop(1, rgbaStr(beamRgb, 0));

        ctx.beginPath();
        ctx.moveTo(ox - topHalf, -20);
        ctx.lineTo(ox + topHalf, -20);
        ctx.lineTo(tx + botHalf, height + 40);
        ctx.lineTo(tx - botHalf, height + 40);
        ctx.closePath();
        ctx.fillStyle = beamGrad;
        ctx.fill();
      }

      // 4. Layer A.2 — Delicate Couture Runway Orbital Hairline Arcs
      const orbitCenterX = width * 0.5 + currentPtrX * 14;
      const orbitCenterY = focalY;
      const orbitRadiusBase = Math.min(width, height) * 0.38;
      const orbitColor = mixRgb(
        { r: 162, g: 142, b: 114 },
        { r: 216, g: 195, b: 165 },
        currentDarkMix
      );
      const orbitAlpha = 0.095 + currentDarkMix * 0.045;
      for (let o = 0; o < 2; o += 1) {
        const rX = orbitRadiusBase * (o === 0 ? 1 : 1.38);
        const rY = rX * 0.56;
        const rot =
          (o === 0 ? 1 : -1) * (timeSec * 0.065 + 0.32) + currentPtrX * (o === 0 ? 0.08 : -0.06);
        ctx.beginPath();
        ctx.ellipse(orbitCenterX, orbitCenterY, rX, rY, rot, 0, Math.PI * 2);
        ctx.strokeStyle = rgbaStr(orbitColor, orbitAlpha * (o === 0 ? 1 : 0.7));
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 5. Layer A.3 — 7-Layer Flowing Silk & Sheer Organza Ribbons + Dual Specular Threads
      const segments = 26;
      const bleedX = 96;
      const spanW = width + bleedX * 2;
      const ampScale = Math.min(1.24, Math.max(0.68, width / 1200));

      for (let rIdx = 0; rIdx < SILK_RIBBONS.length; rIdx += 1) {
        const spec = SILK_RIBBONS[rIdx];
        const primaryRgb = mixRgb(spec.lightPrimary, spec.darkPrimary, currentDarkMix);
        const secondaryRgb = mixRgb(spec.lightSecondary, spec.darkSecondary, currentDarkMix);
        const baseAlpha = spec.alphaLight + (spec.alphaDark - spec.alphaLight) * currentDarkMix;

        const upperX: number[] = [];
        const upperY: number[] = [];
        const lowerX: number[] = [];
        const lowerY: number[] = [];

        const ptrOffsetY = currentPtrY * 32 * spec.parallaxDepth;
        const ptrPhaseShift = currentPtrX * 0.62 * spec.parallaxDepth;

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
            Math.sin(u * Math.PI * 2.35 + timeSec * 0.5 + spec.twistPhase) *
            spec.thickness *
            ampScale;

          upperX.push(px);
          upperY.push(centerY - twist * 0.54);
          lowerX.push(px);
          lowerY.push(centerY + twist * 0.54 + 10);
        }

        const ribGrad = ctx.createLinearGradient(
          0,
          height * spec.yRatio - 90,
          width,
          height * spec.yRatio + 90
        );
        ribGrad.addColorStop(0, rgbaStr(primaryRgb, 0));
        ribGrad.addColorStop(0.18, rgbaStr(primaryRgb, baseAlpha * 0.92));
        ribGrad.addColorStop(0.5, rgbaStr(secondaryRgb, baseAlpha * 1.28));
        ribGrad.addColorStop(0.82, rgbaStr(primaryRgb, baseAlpha * 0.95));
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

        // Primary upper specular couture filament
        const threadGrad = ctx.createLinearGradient(0, 0, width, 0);
        threadGrad.addColorStop(0, rgbaStr(primaryRgb, 0));
        threadGrad.addColorStop(0.24, rgbaStr(primaryRgb, baseAlpha * 1.75));
        threadGrad.addColorStop(0.52, rgbaStr(secondaryRgb, baseAlpha * 2.15));
        threadGrad.addColorStop(0.8, rgbaStr(primaryRgb, baseAlpha * 1.55));
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
        ctx.lineWidth = 1.35;
        ctx.stroke();

        // Secondary delicate lower organza hem highlight
        ctx.beginPath();
        ctx.moveTo(lowerX[0], lowerY[0]);
        for (let s = 1; s <= segments; s += 1) {
          const prevX = lowerX[s - 1];
          const prevY = lowerY[s - 1];
          const midX = (prevX + lowerX[s]) * 0.5;
          const midY = (prevY + lowerY[s]) * 0.5;
          ctx.quadraticCurveTo(prevX, prevY, midX, midY);
        }
        ctx.strokeStyle = rgbaStr(secondaryRgb, baseAlpha * 0.72);
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }

      // 6. Layer A.4 — Luminous Bokeh Motes + 4-Point Couture Star Glints
      const prevAlpha = ctx.globalAlpha;
      const activeGlint = currentDarkMix > 0.5 ? darkGlintSprite : lightGlintSprite;
      const activeSilver = currentDarkMix > 0.5 ? darkSilverSprite : lightSilverSprite;
      const activeSand = currentDarkMix > 0.5 ? darkSandSprite : lightSandSprite;

      for (let i = 0; i < motes.length; i += 1) {
        const m = motes[i];
        if (!prefersReducedMotion) {
          m.xNorm = (m.xNorm + m.vx * dtSec + 1) % 1;
          m.yNorm = (m.yNorm + m.vy * dtSec + 1) % 1;
        }
        const mx = m.xNorm * width + currentPtrX * 22 * m.depth;
        const my = m.yNorm * height + currentPtrY * 16 * m.depth;
        const pulse = 0.5 + 0.5 * Math.sin(timeSec * (m.isStarGlint ? 2.1 : 1.35) + m.phase);

        if (m.isStarGlint && activeGlint) {
          const twinkle = Math.pow(pulse, 2.2);
          const glintAlpha = (0.14 + currentDarkMix * 0.42) * twinkle;
          const glintRadius = (m.radius * 2.4 + 4) * (0.75 + twinkle * 0.5);
          ctx.globalAlpha = Math.max(0, Math.min(1, glintAlpha));
          ctx.drawImage(
            activeGlint,
            mx - glintRadius,
            my - glintRadius,
            glintRadius * 2,
            glintRadius * 2
          );
        } else {
          const sprite = m.warmTint ? activeSand : activeSilver;
          if (!sprite) continue;
          const alpha = (0.13 + currentDarkMix * 0.2) * (0.45 + pulse * 0.55);
          const drawRadius = m.radius * (1 + m.depth * 0.58) * 3.6;
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
          ctx.drawImage(sprite, mx - drawRadius, my - drawRadius, drawRadius * 2, drawRadius * 2);
        }
      }
      ctx.globalAlpha = prevAlpha;

      ctx.restore();
    };

    let rafId = 0;
    let throttleTimerId = 0;
    let prevTs = performance.now();
    const startTs = prevTs;

    const clearScheduledFrame = () => {
      if (throttleTimerId !== 0) {
        window.clearTimeout(throttleTimerId);
        throttleTimerId = 0;
      }
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const tick = (nowTs: number) => {
      rafId = 0;
      if (document.visibilityState === 'hidden') {
        return;
      }
      const dtSec = Math.min(0.06, Math.max(0.001, (nowTs - prevTs) / 1000));
      prevTs = nowTs;
      const frameStart = performance.now();
      drawFrame((nowTs - startTs) / 1000, dtSec);
      const drawCostMs = performance.now() - frameStart;

      if (!prefersReducedMotion || Math.abs(targetDarkRef.current - currentDarkMix) > 0.005) {
        if (drawCostMs > 14) {
          // Adaptive yield on CPU/software rasterizers so compositor & input remain responsive
          const yieldMs = Math.min(48, Math.max(18, Math.round(drawCostMs * 1.1)));
          throttleTimerId = window.setTimeout(() => {
            throttleTimerId = 0;
            if (document.visibilityState !== 'hidden' && rafId === 0) {
              rafId = window.requestAnimationFrame(tick);
            }
          }, yieldMs);
        } else {
          rafId = window.requestAnimationFrame(tick);
        }
      }
    };

    const startLoopIfNeeded = () => {
      if (rafId === 0 && throttleTimerId === 0 && document.visibilityState !== 'hidden') {
        prevTs = performance.now();
        rafId = window.requestAnimationFrame(tick);
      }
    };

    syncThemeDrawRef.current = (snapImmediate: boolean) => {
      if (snapImmediate || prefersReducedMotion) {
        currentDarkMix = targetDarkRef.current;
      }
      drawFrame((performance.now() - startTs) / 1000, 0.016);
      if (!prefersReducedMotion) {
        startLoopIfNeeded();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearScheduledFrame();
      } else if (!prefersReducedMotion) {
        startLoopIfNeeded();
      } else {
        drawFrame(2.4, 0);
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
        clearScheduledFrame();
        stageEl.style.setProperty('--atelier-ptr-x', '0');
        stageEl.style.setProperty('--atelier-ptr-y', '0');
        drawFrame(2.4, 0);
      } else {
        startLoopIfNeeded();
      }
    };

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    reducedMotionQuery?.addEventListener?.('change', onMotionPrefChange);

    if (prefersReducedMotion) {
      drawFrame(2.4, 0);
    } else {
      startLoopIfNeeded();
    }

    return () => {
      syncThemeDrawRef.current = null;
      clearScheduledFrame();
      for (const s of [
        lightSilverSprite,
        lightSandSprite,
        darkSilverSprite,
        darkSandSprite,
        lightGlintSprite,
        darkGlintSprite,
      ]) {
        if (s) {
          s.width = 0;
          s.height = 0;
        }
      }
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reducedMotionQuery?.removeEventListener?.('change', onMotionPrefChange);
    };
  }, []);

  // Synchronously snap & redraw canvas on theme switch so View Transition captures new theme cleanly
  useLayoutEffect(() => {
    const isTransitioning =
      typeof document !== 'undefined' && document.documentElement.dataset.themeTransitioning === '1';
    syncThemeDrawRef.current?.(isTransitioning);
  }, [isDark]);

  return (
    <div
      ref={stageRef}
      id={CARBON_DOM_CONTRACT.loginMotionStageId}
      data-motion-theme={isDark ? 'dark' : 'light'}
      data-motion-stage={stage}
      className="atelier-backdrop-stage"
    >
      {/* Layer A: 60fps Volumetric Spotlights, Silk/Organza Couture Ribbons & Star Glints */}
      <canvas ref={canvasRef} className="atelier-silk-canvas" aria-hidden="true" />

      {/* Anti-Banding Micro-Dither Veil (GPU-cached pattern, zero per-frame filter cost) */}
      <div className="atelier-dither-veil" aria-hidden="true" />

      {/* Layer B: Adaptive 3D Parallax Couture Curation Cards (Desktop Safe Flanks >= 1180px, auth stage) */}
      <div
        className={`atelier-flank-cards ${stage === 'auth' ? 'is-visible' : ''}`}
        aria-hidden="true"
      >
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

        {/* Card 2 (Bottom-Left): Tonal Value Balance */}
        <article className="atelier-curation-card atelier-curation-card--bl">
          <div className="atelier-card-head">
            <span className="atelier-card-badge">98% HARMONY</span>
          </div>
          <div className="atelier-card-art">
            <div className="atelier-swatch-cluster">
              <span className="atelier-swatch-orb" style={{ background: '#F5F5F7' }} />
              <span className="atelier-swatch-orb" style={{ background: '#D1D1D6' }} />
              <span className="atelier-swatch-orb" style={{ background: '#6E6E73' }} />
              <span className="atelier-swatch-orb" style={{ background: '#1D1D1F' }} />
            </div>
          </div>
          <div>
            <p className="atelier-card-title">{isEn ? 'Tonal Harmony' : '명도·퍼스널 조화'}</p>
            <p className="atelier-card-meta">
              {isEn ? 'Skin-tone L*a*b* balance' : '피부톤 L*a*b* 밸런스 매칭'}
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
