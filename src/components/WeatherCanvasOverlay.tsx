import { memo, useEffect, useRef } from 'react';
import type { EffectiveWeatherMode } from '../services/weatherPromptBuilder.ts';

export type WeatherCanvasOverlayMode =
  | EffectiveWeatherMode
  | 'mild'
  | 'forecast'
  | 'realtime';

export interface WeatherCanvasOverlayProps {
  weather: WeatherCanvasOverlayMode;
  isDark?: boolean;
  umbrellaCollisionEnabled?: boolean;
  className?: string;
}

interface RainDrop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  thickness: number;
  alpha: number;
  collidesUmbrella: boolean;
  floorDepthNorm: number;
}

interface RainSplash {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  life: number;
  maxLife: number;
}

interface FloorRipple {
  x: number;
  y: number;
  rx: number;
  minRx: number;
  maxRx: number;
  alpha: number;
  life: number;
  maxLife: number;
}

interface IceShard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  alpha: number;
  isDiamondGlint: boolean;
  phase: number;
}

interface BreathVaporPuff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
}

interface Snowflake {
  x: number;
  y: number;
  vy: number;
  radius: number;
  depthLayer: 0 | 1 | 2;
  swayAmp: number;
  swayFreq: number;
  phase: number;
  alpha: number;
}

interface WindRibbon {
  x: number;
  y: number;
  vx: number;
  len: number;
  curveAmp: number;
  thickness: number;
  alpha: number;
  phase: number;
}

interface AmbientMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  phase: number;
}

const RIPPLE_MIN_Y_RATIO = 0.85;
const RIPPLE_MAX_Y_RATIO = 0.985;
const RIPPLE_ASPECT_RATIO = 4.3;

/**
 * Layer 3 (`z-index: 30`, `pointer-events: none`) Standalone Weather Environment Overlay.
 * Renders real-time HTML5 Canvas atmospheric physics directly IN FRONT OF the model & umbrella
 * with automatic Dark/Light stage contrast compensation, rain-only moody dimming tint,
 * diagonal semi-transparent rain streaks, and bottom-15% concentric perspective water ripples.
 */
const WeatherCanvasOverlay = memo(function WeatherCanvasOverlay({
  weather,
  isDark = false,
  umbrellaCollisionEnabled = true,
  className = '',
}: WeatherCanvasOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let width = Math.max(1, Math.min(2048, container.clientWidth || 380));
    let height = Math.max(1, Math.min(2048, container.clientHeight || 480));
    let dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);

    // Particle pools initialized per weather mode
    const rainDrops: RainDrop[] = [];
    const rainSplashes: RainSplash[] = [];
    const floorRipples: FloorRipple[] = [];
    const iceShards: IceShard[] = [];
    const breathPuffs: BreathVaporPuff[] = [];
    const snowflakes: Snowflake[] = [];
    const windRibbons: WindRibbon[] = [];
    const motes: AmbientMote[] = [];

    const syncCanvasSize = () => {
      const prevW = width;
      const prevH = height;
      const nextW = Math.max(1, Math.min(2048, container.clientWidth || 380));
      const nextH = Math.max(1, Math.min(2048, container.clientHeight || 480));
      dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
      width = nextW;
      height = nextH;
      const targetW = Math.min(2048, Math.round(width * dpr));
      const targetH = Math.min(2048, Math.round(height * dpr));
      if (canvas.width !== targetW) canvas.width = targetW;
      if (canvas.height !== targetH) canvas.height = targetH;

      if (prevW > 0 && prevH > 0 && (prevW !== width || prevH !== height)) {
        const sx = width / prevW;
        const sy = height / prevH;
        for (let i = 0; i < rainDrops.length; i += 1) {
          rainDrops[i].x *= sx;
          rainDrops[i].y *= sy;
        }
        for (let i = 0; i < floorRipples.length; i += 1) {
          floorRipples[i].x *= sx;
          floorRipples[i].y = Math.min(
            height * RIPPLE_MAX_Y_RATIO,
            Math.max(height * RIPPLE_MIN_Y_RATIO, floorRipples[i].y * sy)
          );
        }
        for (let i = 0; i < snowflakes.length; i += 1) {
          snowflakes[i].x *= sx;
          snowflakes[i].y *= sy;
        }
        for (let i = 0; i < iceShards.length; i += 1) {
          iceShards[i].x *= sx;
          iceShards[i].y *= sy;
        }
        for (let i = 0; i < windRibbons.length; i += 1) {
          windRibbons[i].x *= sx;
          windRibbons[i].y *= sy;
        }
        for (let i = 0; i < motes.length; i += 1) {
          motes[i].x *= sx;
          motes[i].y *= sy;
        }
      }
    };
    syncCanvasSize();

    const createFloorRipple = (
      x: number,
      y: number,
      initialProgress = 0,
      radiusScale = 1
    ): FloorRipple => {
      const minY = height * RIPPLE_MIN_Y_RATIO;
      const maxY = height * RIPPLE_MAX_Y_RATIO;
      const clampedY = Math.min(maxY, Math.max(minY, y));
      const depthNorm = (clampedY - minY) / Math.max(1, maxY - minY);
      const perspectiveScale = (0.78 + depthNorm * 0.46) * radiusScale;
      const minRx = 2.0;
      const maxRx = (17 + Math.random() * 16) * perspectiveScale;
      const maxLife = 1.28 + Math.random() * 0.42;
      const clampedProg = Math.min(0.92, Math.max(0, initialProgress));
      const eased = 1 - Math.pow(1 - clampedProg, 2.15);
      return {
        x,
        y: clampedY,
        rx: minRx + (maxRx - minRx) * eased,
        minRx,
        maxRx,
        alpha: isDark ? 0.64 : 0.68,
        life: clampedProg * maxLife,
        maxLife,
      };
    };

    if (weather === 'rain') {
      const count = 90;
      for (let i = 0; i < count; i += 1) {
        const isForeground = i % 12 < 5; // ~42% foreground layer, ~58% mid-ground layer
        rainDrops.push({
          x: Math.random() * (width * 1.24) - width * 0.08,
          y: Math.random() * height,
          vx: -(1.42 + Math.random() * 1.12),
          vy: isForeground ? 14.4 + Math.random() * 4.2 : 10.6 + Math.random() * 3.3,
          len: isForeground ? 19 + Math.random() * 12 : 12 + Math.random() * 8,
          thickness: isForeground
            ? 1.12 + Math.random() * 0.23
            : 0.85 + Math.random() * 0.22,
          alpha: isForeground ? 0.46 + Math.random() * 0.24 : 0.27 + Math.random() * 0.17,
          collidesUmbrella: i % 10 < 6, // 60% bounce off open umbrella canopy, 40% pass in front of model
          floorDepthNorm: Math.random(),
        });
      }

      // Seed 4 staggered concentric ripples in the bottom 15% zone (around model boots + center floor)
      const seededRipples: Array<[number, number, number, number]> = [
        [width * 0.42, height * 0.914, 0.34, 1.05],
        [width * 0.56, height * 0.934, 0.18, 1.0],
        [width * 0.48, height * 0.878, 0.54, 0.94],
        [width * 0.68, height * 0.902, 0.24, 0.98],
      ];
      for (const [rxPos, ryPos, prog, rScale] of seededRipples) {
        floorRipples.push(createFloorRipple(rxPos, ryPos, prog, rScale));
      }
    } else if (weather === 'coldwave') {
      const total = 92;
      for (let i = 0; i < total; i += 1) {
        const isGlint = i >= 62;
        iceShards.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: isGlint ? 4.5 + Math.random() * 3.5 : 8.0 + Math.random() * 5.8,
          vy: isGlint ? 1.4 + Math.random() * 1.8 : 2.4 + Math.random() * 2.8,
          len: isGlint ? 3 : 10 + Math.random() * 15,
          alpha: isGlint ? 0.65 + Math.random() * 0.3 : 0.42 + Math.random() * 0.36,
          isDiamondGlint: isGlint,
          phase: Math.random() * Math.PI * 2,
        });
      }
    } else if (weather === 'snow') {
      const total = 74;
      for (let i = 0; i < total; i += 1) {
        const depthLayer: 0 | 1 | 2 = i < 14 ? 0 : i < 44 ? 1 : 2;
        const radius =
          depthLayer === 0
            ? 4.2 + Math.random() * 2.6
            : depthLayer === 1
              ? 2.3 + Math.random() * 1.6
              : 1.2 + Math.random() * 1.0;
        snowflakes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vy:
            depthLayer === 0
              ? 1.7 + Math.random() * 0.9
              : depthLayer === 1
                ? 1.15 + Math.random() * 0.7
                : 0.7 + Math.random() * 0.5,
          radius,
          depthLayer,
          swayAmp: depthLayer === 0 ? 1.1 : depthLayer === 1 ? 0.75 : 0.45,
          swayFreq: 1.2 + Math.random() * 1.4,
          phase: Math.random() * Math.PI * 2,
          alpha:
            depthLayer === 0
              ? 0.68 + Math.random() * 0.22
              : depthLayer === 1
                ? 0.55 + Math.random() * 0.25
                : 0.36 + Math.random() * 0.22,
        });
      }
    } else if (weather === 'wind') {
      for (let i = 0; i < 9; i += 1) {
        windRibbons.push({
          x: Math.random() * width,
          y: height * (0.12 + (i / 9) * 0.76),
          vx: 8.5 + Math.random() * 5.5,
          len: 95 + Math.random() * 110,
          curveAmp: (Math.random() > 0.5 ? 1 : -1) * (10 + Math.random() * 16),
          thickness: 1.2 + Math.random() * 1.2,
          alpha: 0.26 + Math.random() * 0.24,
          phase: Math.random() * Math.PI * 2,
        });
      }
      for (let i = 0; i < 26; i += 1) {
        motes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: 6.5 + Math.random() * 4.8,
          vy: (Math.random() - 0.5) * 1.4,
          radius: 1.4 + Math.random() * 1.8,
          alpha: 0.32 + Math.random() * 0.3,
          phase: Math.random() * Math.PI * 2,
        });
      }
    } else if (weather === 'cloudy') {
      for (let i = 0; i < 5; i += 1) {
        motes.push({
          x: Math.random() * width,
          y: height * (0.08 + i * 0.14),
          vx: 0.24 + Math.random() * 0.28,
          vy: 0,
          radius: Math.max(90, width * (0.36 + Math.random() * 0.22)),
          alpha: 0.05 + Math.random() * 0.04,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    if (weather === 'rain') {
      // Subtle perimeter glass condensation micro-beads (upper/side glass edges, never covering model face)
      for (let i = 0; i < 18; i += 1) {
        const onLeftEdge = i % 2 === 0;
        const edgeBand = onLeftEdge
          ? Math.random() * (width * 0.14)
          : width - Math.random() * (width * 0.14);
        motes.push({
          x: i < 6 ? Math.random() * width : edgeBand,
          y: i < 6 ? Math.random() * (height * 0.12) : Math.random() * (height * 0.68),
          vx: 0,
          vy: 0.03 + Math.random() * 0.07,
          radius: 1.0 + Math.random() * 1.6,
          alpha: isDark ? 0.28 + Math.random() * 0.2 : 0.3 + Math.random() * 0.2,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    const isAnimatedWeather =
      weather === 'rain' ||
      weather === 'coldwave' ||
      weather === 'snow' ||
      weather === 'wind' ||
      weather === 'cloudy';

    const spawnBreathBurst = () => {
      const originX = width * 0.5 + 3;
      const originY = height * 0.225;
      const puffCount = 8;
      for (let i = 0; i < puffCount; i += 1) {
        breathPuffs.push({
          x: originX + (Math.random() - 0.5) * 6,
          y: originY + (Math.random() - 0.5) * 5,
          vx: 0.85 + Math.random() * 1.55,
          vy: -(0.35 + Math.random() * 0.85),
          radius: 4 + Math.random() * 4,
          maxRadius: 17 + Math.random() * 12,
          life: 0,
          maxLife: 1.45 + Math.random() * 0.55,
        });
      }
    };

    if (weather === 'coldwave') {
      spawnBreathBurst();
    }

    let rafId = 0;
    let isPaused = typeof document !== 'undefined' && document.hidden;
    let lastTs = performance.now();
    let elapsedSec = 0;
    let breathTimerSec = 0;
    let rippleEnsureTimerSec = 0;

    const drawColdwaveFrostVignette = () => {
      // Top & bottom icy frost edge wash leaving center model 100% clear
      const edgeAlpha = isDark ? 0.22 : 0.2;
      const topGrad = ctx.createLinearGradient(0, 0, 0, height * 0.16);
      topGrad.addColorStop(
        0,
        isDark ? `rgba(147, 197, 253, ${edgeAlpha})` : `rgba(96, 165, 250, ${edgeAlpha})`
      );
      topGrad.addColorStop(1, 'rgba(147, 197, 253, 0)');
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, width, height * 0.16);

      const bottomGrad = ctx.createLinearGradient(0, height, 0, height * 0.84);
      bottomGrad.addColorStop(
        0,
        isDark
          ? `rgba(125, 211, 252, ${edgeAlpha * 0.85})`
          : `rgba(96, 165, 250, ${edgeAlpha * 0.85})`
      );
      bottomGrad.addColorStop(1, 'rgba(125, 211, 252, 0)');
      ctx.fillStyle = bottomGrad;
      ctx.fillRect(0, height * 0.84, width, height * 0.16);

      // 4-corner crystalline frost radial blooms
      const cornerRadius = Math.min(width, height) * 0.34;
      const corners = [
        [0, 0],
        [width, 0],
        [0, height],
        [width, height],
      ];
      for (const [cx, cy] of corners) {
        const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, cornerRadius);
        g.addColorStop(
          0,
          isDark ? 'rgba(224, 242, 254, 0.28)' : 'rgba(56, 142, 228, 0.22)'
        );
        g.addColorStop(
          0.48,
          isDark ? 'rgba(147, 197, 253, 0.10)' : 'rgba(125, 185, 245, 0.09)'
        );
        g.addColorStop(1, 'rgba(147, 197, 253, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(
          Math.max(0, cx - cornerRadius),
          Math.max(0, cy - cornerRadius),
          cornerRadius * 2,
          cornerRadius * 2
        );
      }
    };

    const renderFrame = (now: number) => {
      if (isPaused) return;
      const dt = Math.min(0.05, Math.max(0.008, (now - lastTs) / 1000));
      lastTs = now;
      elapsedSec += dt;
      const frameScale = dt * 60;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      if (weather === 'rain') {
        // Open umbrella canopy dome ellipse (overhead ~15° backward-tilted canopy zone)
        const umbCx = width * 0.5;
        const umbCy = height * 0.205;
        const umbRx = width * 0.235;
        const umbRy = height * 0.082;
        const minRippleY = height * RIPPLE_MIN_Y_RATIO;
        const maxRippleY = height * RIPPLE_MAX_Y_RATIO;
        const rippleZoneSpan = Math.max(1, maxRippleY - minRippleY);

        // Keep center-floor ripple presence lively without waiting
        rippleEnsureTimerSec += dt;
        if (rippleEnsureTimerSec >= 0.36) {
          rippleEnsureTimerSec = 0;
          if (floorRipples.length < 6) {
            const seedX = width * (0.36 + Math.random() * 0.32);
            const seedY = minRippleY + Math.random() * rippleZoneSpan * 0.85;
            floorRipples.push(createFloorRipple(seedX, seedY, 0));
          }
        }

        // 1) Update & draw bottom-15% concentric perspective water ripples FIRST so falling foreground streaks pass cleanly in front
        for (let i = floorRipples.length - 1; i >= 0; i -= 1) {
          const rp = floorRipples[i];
          rp.life += dt;
          if (rp.life >= rp.maxLife) {
            floorRipples.splice(i, 1);
            continue;
          }

          const progress = Math.min(1, rp.life / rp.maxLife);
          const eased = 1 - Math.pow(1 - progress, 2.15);
          rp.rx = rp.minRx + (rp.maxRx - rp.minRx) * eased;

          const rxRatio = Math.min(1, Math.max(0, rp.rx / Math.max(1, rp.maxRx)));
          const ringAlpha = rp.alpha * Math.pow(1 - rxRatio, 1.35);
          if (ringAlpha <= 0.008) continue;

          const clampedY = Math.min(maxRippleY, Math.max(minRippleY, rp.y));
          const ry = Math.max(0.65, rp.rx / RIPPLE_ASPECT_RATIO);

          // Primary outer harmonic ring: subtle wet-stone refraction trough + crisp specular crest
          ctx.strokeStyle = isDark
            ? `rgba(2, 6, 23, ${ringAlpha * 0.56})`
            : `rgba(30, 41, 59, ${ringAlpha * 0.36})`;
          ctx.lineWidth = 1.55;
          ctx.beginPath();
          ctx.ellipse(rp.x, clampedY + 0.5, rp.rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();

          ctx.strokeStyle = isDark
            ? `rgba(224, 242, 254, ${ringAlpha * 0.92})`
            : `rgba(255, 255, 255, ${Math.min(0.96, ringAlpha * 1.12)})`;
          ctx.lineWidth = 1.12;
          ctx.beginPath();
          ctx.ellipse(rp.x, clampedY, rp.rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Secondary mid harmonic ring at 0.62 * rx
          const midRx = rp.rx * 0.62;
          if (midRx > 1.8) {
            const midRy = Math.max(0.45, midRx / RIPPLE_ASPECT_RATIO);
            if (!isDark) {
              ctx.strokeStyle = `rgba(45, 58, 76, ${ringAlpha * 0.22})`;
              ctx.lineWidth = 1.1;
              ctx.beginPath();
              ctx.ellipse(rp.x, clampedY + 0.35, midRx, midRy, 0, 0, Math.PI * 2);
              ctx.stroke();
            }
            ctx.strokeStyle = isDark
              ? `rgba(186, 230, 253, ${ringAlpha * 0.66})`
              : `rgba(248, 250, 252, ${ringAlpha * 0.84})`;
            ctx.lineWidth = 0.88;
            ctx.beginPath();
            ctx.ellipse(rp.x, clampedY, midRx, midRy, 0, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Delicate inner harmonic ring at 0.30 * rx when rx > 9
          if (rp.rx > 9) {
            const innerRx = rp.rx * 0.3;
            const innerRy = Math.max(0.35, innerRx / RIPPLE_ASPECT_RATIO);
            ctx.strokeStyle = isDark
              ? `rgba(224, 242, 254, ${ringAlpha * 0.44})`
              : `rgba(255, 255, 255, ${ringAlpha * 0.62})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.ellipse(rp.x, clampedY, innerRx, innerRy, 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }

        // 2) Update & draw natural diagonal semi-transparent rain streaks (0.85px ~ 1.35px)
        ctx.lineCap = 'round';
        for (let i = 0; i < rainDrops.length; i += 1) {
          const drop = rainDrops[i];
          drop.x += drop.vx * frameScale;
          drop.y += drop.vy * frameScale;

          // Check collision with upper open umbrella canopy dome
          if (umbrellaCollisionEnabled && drop.collidesUmbrella && drop.y <= umbCy + umbRy * 0.2) {
            const nx = (drop.x - umbCx) / Math.max(1, umbRx);
            const ny = (drop.y - umbCy) / Math.max(1, umbRy);
            if (nx * nx + ny * ny <= 1 && ny <= 0.18) {
              if (rainSplashes.length < 72) {
                const splashCount = 2 + (i % 2);
                for (let s = 0; s < splashCount; s += 1) {
                  rainSplashes.push({
                    x: drop.x,
                    y: drop.y,
                    vx: (Math.random() - 0.5) * 3.2 + nx * 1.8,
                    vy: -(1.6 + Math.random() * 2.2),
                    radius: 0.95 + Math.random() * 0.95,
                    alpha: isDark ? 0.82 : 0.78,
                    life: 0,
                    maxLife: 0.26 + Math.random() * 0.16,
                  });
                }
              }
              drop.x = Math.random() * (width * 1.24) - width * 0.06;
              drop.y = -20 - Math.random() * 60;
              drop.floorDepthNorm = Math.random();
              continue;
            }
          }

          // Bottom 15% floor impact (`floorY` strictly within [height * 0.85, height * 0.985])
          const floorY = minRippleY + drop.floorDepthNorm * rippleZoneSpan;
          if (drop.y >= floorY) {
            if (
              floorRipples.length < 22 &&
              drop.x >= width * 0.06 &&
              drop.x <= width * 0.94 &&
              Math.random() < 0.44
            ) {
              floorRipples.push(createFloorRipple(drop.x, floorY, 0));
              if (rainSplashes.length < 72 && Math.random() < 0.5) {
                rainSplashes.push({
                  x: drop.x,
                  y: floorY - 0.8,
                  vx: (Math.random() - 0.5) * 1.5,
                  vy: -(1.05 + Math.random() * 1.25),
                  radius: 0.85 + Math.random() * 0.65,
                  alpha: isDark ? 0.72 : 0.76,
                  life: 0,
                  maxLife: 0.2 + Math.random() * 0.1,
                });
              }
            }
            drop.x = Math.random() * (width * 1.24) - width * 0.06;
            drop.y = -20 - Math.random() * 70;
            drop.floorDepthNorm = Math.random();
            continue;
          }

          if (drop.x < -40) {
            drop.x = width + 20;
          }

          const dx = (drop.vx / drop.vy) * drop.len;
          const tailX = drop.x - dx;
          const tailY = drop.y - drop.len;
          const midX = tailX + dx * 0.54;
          const midY = tailY + drop.len * 0.54;
          ctx.lineWidth = drop.thickness;
          ctx.strokeStyle = isDark
            ? `rgba(186, 222, 255, ${(drop.alpha * 0.34).toFixed(3)})`
            : `rgba(116, 148, 184, ${(drop.alpha * 0.42).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(midX, midY);
          ctx.stroke();

          ctx.strokeStyle = isDark
            ? `rgba(232, 244, 255, ${drop.alpha.toFixed(3)})`
            : `rgba(244, 250, 255, ${Math.min(0.88, drop.alpha * 1.16).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(midX, midY);
          ctx.lineTo(drop.x, drop.y);
          ctx.stroke();
        }

        // 3) Update & draw umbrella canopy & floor crown micro-splash droplets
        for (let i = rainSplashes.length - 1; i >= 0; i -= 1) {
          const sp = rainSplashes[i];
          sp.life += dt;
          if (sp.life >= sp.maxLife) {
            rainSplashes.splice(i, 1);
            continue;
          }
          sp.vy += 0.22 * frameScale;
          sp.x += sp.vx * frameScale;
          sp.y += sp.vy * frameScale;
          const fade = 1 - sp.life / sp.maxLife;
          ctx.fillStyle = isDark
            ? `rgba(224, 242, 254, ${sp.alpha * fade})`
            : `rgba(248, 250, 252, ${sp.alpha * fade})`;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // 4) Subtle perimeter glass condensation micro-beads with specular pinpoint highlight
        for (let i = 0; i < motes.length; i += 1) {
          const bead = motes[i];
          bead.y += bead.vy * frameScale * (0.35 + 0.65 * Math.max(0, Math.sin(elapsedSec * 0.9 + bead.phase)));
          if (bead.y > height * 0.78) {
            bead.y = Math.random() * (height * 0.14);
          }
          ctx.fillStyle = isDark
            ? `rgba(203, 228, 255, ${bead.alpha * 0.65})`
            : `rgba(255, 255, 255, ${bead.alpha * 0.78})`;
          ctx.beginPath();
          ctx.ellipse(bead.x, bead.y, bead.radius * 0.85, bead.radius * 1.15, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.95, bead.alpha * 1.15)})`;
          ctx.beginPath();
          ctx.arc(bead.x - bead.radius * 0.25, bead.y - bead.radius * 0.3, Math.max(0.45, bead.radius * 0.32), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (weather === 'coldwave') {
        // 1) Perimeter Frost Vignette
        drawColdwaveFrostVignette();

        // 2) Periodic Breath Vapor near model mouth / muffler (~2.7s cycle)
        breathTimerSec += dt;
        if (breathTimerSec >= 2.7) {
          breathTimerSec = 0;
          spawnBreathBurst();
        }

        ctx.save();
        for (let i = breathPuffs.length - 1; i >= 0; i -= 1) {
          const pf = breathPuffs[i];
          pf.life += dt;
          if (pf.life >= pf.maxLife) {
            breathPuffs.splice(i, 1);
            continue;
          }
          const p = pf.life / pf.maxLife;
          pf.x += pf.vx * frameScale;
          pf.y += pf.vy * frameScale;
          const r = pf.radius + (pf.maxRadius - pf.radius) * p;
          const env = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
          const peakAlpha = isDark ? 0.22 : 0.28;
          const grad = ctx.createRadialGradient(pf.x, pf.y, r * 0.1, pf.x, pf.y, r);
          grad.addColorStop(
            0,
            isDark
              ? `rgba(240, 249, 255, ${peakAlpha * env})`
              : `rgba(255, 255, 255, ${peakAlpha * env})`
          );
          grad.addColorStop(
            0.55,
            isDark
              ? `rgba(186, 230, 253, ${peakAlpha * 0.45 * env})`
              : `rgba(148, 197, 248, ${peakAlpha * 0.5 * env})`
          );
          grad.addColorStop(1, 'rgba(186, 230, 253, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(pf.x, pf.y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // 3) High-velocity diagonal Blizzard Ice Shards & Sparkling Diamond Dust
        ctx.save();
        if (!isDark) {
          ctx.shadowColor = 'rgba(15, 23, 42, 0.24)';
          ctx.shadowBlur = 2.5;
        }
        ctx.lineCap = 'round';
        for (let i = 0; i < iceShards.length; i += 1) {
          const sh = iceShards[i];
          sh.x += sh.vx * frameScale;
          sh.y += sh.vy * frameScale;
          if (sh.x > width + 30) sh.x = -25;
          if (sh.y > height + 20) sh.y = -15;

          if (sh.isDiamondGlint) {
            const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(elapsedSec * 4.2 + sh.phase));
            const a = sh.alpha * twinkle;
            ctx.strokeStyle = isDark
              ? `rgba(224, 242, 254, ${a})`
              : `rgba(37, 99, 235, ${a * 0.85})`;
            ctx.lineWidth = 1.1;
            const arm = 2.6 + twinkle * 1.8;
            ctx.beginPath();
            ctx.moveTo(sh.x - arm, sh.y);
            ctx.lineTo(sh.x + arm, sh.y);
            ctx.moveTo(sh.x, sh.y - arm);
            ctx.lineTo(sh.x, sh.y + arm);
            ctx.stroke();
          } else {
            const norm = Math.hypot(sh.vx, sh.vy) || 1;
            const dx = (sh.vx / norm) * sh.len;
            const dy = (sh.vy / norm) * sh.len;
            const tx = sh.x - dx;
            const ty = sh.y - dy;
            const mx = tx + dx * 0.5;
            const my = ty + dy * 0.5;
            ctx.lineWidth = 1.35;
            ctx.strokeStyle = isDark
              ? `rgba(186, 230, 253, ${(sh.alpha * 0.36).toFixed(3)})`
              : `rgba(59, 130, 246, ${(sh.alpha * 0.38).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(mx, my);
            ctx.stroke();

            ctx.strokeStyle = isDark
              ? `rgba(240, 249, 255, ${sh.alpha.toFixed(3)})`
              : `rgba(37, 99, 235, ${Math.min(0.85, sh.alpha * 1.05).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(sh.x, sh.y);
            ctx.stroke();
          }
        }
        ctx.restore();
      } else if (weather === 'snow') {
        ctx.save();
        if (!isDark) {
          ctx.shadowColor = 'rgba(30, 58, 95, 0.34)';
          ctx.shadowBlur = 3.5;
        }
        for (let i = 0; i < snowflakes.length; i += 1) {
          const fl = snowflakes[i];
          fl.y += fl.vy * frameScale;
          fl.x += Math.sin(elapsedSec * fl.swayFreq + fl.phase) * fl.swayAmp * frameScale;
          if (fl.y > height + 12) {
            fl.y = -10;
            fl.x = Math.random() * width;
          }
          if (fl.x > width + 10) fl.x = -10;
          if (fl.x < -10) fl.x = width + 10;

          if (fl.depthLayer === 0) {
            // Soft foreground bokeh snowflake
            const g = ctx.createRadialGradient(fl.x, fl.y, 0.5, fl.x, fl.y, fl.radius);
            g.addColorStop(0, `rgba(255, 255, 255, ${fl.alpha})`);
            g.addColorStop(
              0.6,
              isDark
                ? `rgba(224, 242, 254, ${fl.alpha * 0.55})`
                : `rgba(186, 220, 255, ${fl.alpha * 0.72})`
            );
            g.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(fl.x, fl.y, fl.radius, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = isDark
              ? `rgba(248, 250, 252, ${fl.alpha})`
              : `rgba(255, 255, 255, ${Math.min(0.95, fl.alpha * 1.15)})`;
            ctx.beginPath();
            ctx.arc(fl.x, fl.y, fl.radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      } else if (weather === 'wind') {
        ctx.lineCap = 'round';
        for (let i = 0; i < windRibbons.length; i += 1) {
          const rb = windRibbons[i];
          rb.x += rb.vx * frameScale;
          if (rb.x - rb.len > width + 40) {
            rb.x = -40;
            rb.y = height * (0.1 + Math.random() * 0.78);
          }
          const x0 = rb.x - rb.len;
          const y0 = rb.y + Math.sin(elapsedSec * 2 + rb.phase) * 6;
          const cx = rb.x - rb.len * 0.45;
          const cy = y0 + rb.curveAmp;
          const x1 = rb.x;
          const y1 = y0 + rb.curveAmp * 0.25;

          const grad = ctx.createLinearGradient(x0, y0, x1, y1);
          const strokeRgb = isDark ? '203, 213, 225' : '71, 85, 105';
          grad.addColorStop(0, `rgba(${strokeRgb}, 0)`);
          grad.addColorStop(0.5, `rgba(${strokeRgb}, ${rb.alpha})`);
          grad.addColorStop(1, `rgba(${strokeRgb}, 0)`);

          ctx.strokeStyle = grad;
          ctx.lineWidth = rb.thickness;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.quadraticCurveTo(cx, cy, x1, y1);
          ctx.stroke();
        }

        for (let i = 0; i < motes.length; i += 1) {
          const m = motes[i];
          m.x += m.vx * frameScale;
          m.y += (m.vy + Math.sin(elapsedSec * 3 + m.phase) * 0.4) * frameScale;
          if (m.x > width + 16) {
            m.x = -12;
            m.y = Math.random() * height;
          }
          ctx.fillStyle = isDark
            ? `rgba(226, 232, 240, ${m.alpha})`
            : `rgba(71, 85, 105, ${m.alpha})`;
          ctx.beginPath();
          ctx.ellipse(m.x, m.y, m.radius * 1.7, m.radius * 0.7, 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (weather === 'heatwave') {
        // Warm solar flare halo in top-right corner
        const sunX = width * 0.88;
        const sunY = height * 0.08;
        const sunR = Math.min(width, height) * 0.46;
        const sunGrad = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, sunR);
        sunGrad.addColorStop(
          0,
          isDark ? 'rgba(251, 191, 36, 0.24)' : 'rgba(245, 158, 11, 0.22)'
        );
        sunGrad.addColorStop(
          0.45,
          isDark ? 'rgba(251, 146, 60, 0.09)' : 'rgba(251, 146, 60, 0.09)'
        );
        sunGrad.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = sunGrad;
        ctx.fillRect(0, 0, width, height);

        // Rising heat-haze shimmer motes
        for (let i = 0; i < motes.length; i += 1) {
          const m = motes[i];
          m.y += m.vy * frameScale;
          m.x += Math.sin(elapsedSec * 2.6 + m.phase) * 0.55 * frameScale;
          if (m.y < -12) {
            m.y = height + 10;
            m.x = Math.random() * width;
          }
          const pulse = 0.55 + 0.45 * Math.sin(elapsedSec * 3.1 + m.phase);
          ctx.fillStyle = isDark
            ? `rgba(253, 224, 71, ${m.alpha * pulse})`
            : `rgba(217, 119, 6, ${m.alpha * pulse})`;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (weather === 'cloudy') {
        // Soft drifting overcast mist bands
        for (let i = 0; i < motes.length; i += 1) {
          const m = motes[i];
          m.x += m.vx * frameScale;
          if (m.x - m.radius > width) {
            m.x = -m.radius;
          }
          const g = ctx.createRadialGradient(m.x, m.y, 4, m.x, m.y, m.radius);
          const rgb = isDark ? '148, 163, 184' : '100, 116, 139';
          g.addColorStop(0, `rgba(${rgb}, ${m.alpha})`);
          g.addColorStop(1, `rgba(${rgb}, 0)`);
          ctx.fillStyle = g;
          ctx.save();
          ctx.translate(m.x, m.y);
          ctx.scale(1.6, 0.42);
          ctx.beginPath();
          ctx.arc(0, 0, m.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (weather === 'clear' || weather === 'forecast' || weather === 'realtime') {
        // Subtle diagonal warm sunbeams from top-right + floating golden dust bokeh
        ctx.save();
        const beamAlpha = weather === 'clear' ? 0.11 : 0.07;
        const beamGrad = ctx.createLinearGradient(width * 0.92, 0, width * 0.25, height * 0.72);
        beamGrad.addColorStop(
          0,
          isDark ? `rgba(253, 230, 138, ${beamAlpha})` : `rgba(251, 191, 36, ${beamAlpha})`
        );
        beamGrad.addColorStop(1, 'rgba(253, 230, 138, 0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(width * 0.56, 0);
        ctx.lineTo(width, 0);
        ctx.lineTo(width, height * 0.45);
        ctx.lineTo(width * 0.18, height * 0.85);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        for (let i = 0; i < motes.length; i += 1) {
          const m = motes[i];
          m.x += m.vx * frameScale;
          m.y += m.vy * frameScale;
          if (m.y < -8) {
            m.y = height + 8;
            m.x = Math.random() * width;
          }
          if (m.x < -8) m.x = width + 8;
          if (m.x > width + 8) m.x = -8;
          const twinkle = 0.5 + 0.5 * Math.sin(elapsedSec * 2 + m.phase);
          ctx.fillStyle = isDark
            ? `rgba(254, 240, 138, ${m.alpha * twinkle})`
            : `rgba(217, 119, 6, ${m.alpha * 0.78 * twinkle})`;
          ctx.beginPath();
          ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (weather === 'mild') {
        // Soft warm-spring champagne skylight glow + gentle drifting blossom/breeze bokeh
        const springGlow = ctx.createRadialGradient(
          width * 0.76,
          height * 0.12,
          6,
          width * 0.76,
          height * 0.12,
          Math.min(width, height) * 0.54
        );
        springGlow.addColorStop(
          0,
          isDark ? 'rgba(254, 215, 170, 0.14)' : 'rgba(253, 186, 116, 0.14)'
        );
        springGlow.addColorStop(1, 'rgba(254, 215, 170, 0)');
        ctx.fillStyle = springGlow;
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < motes.length; i += 1) {
          const m = motes[i];
          m.x += (m.vx + Math.sin(elapsedSec * 1.4 + m.phase) * 0.16) * frameScale;
          m.y += m.vy * frameScale;
          if (m.y < -10) {
            m.y = height + 10;
            m.x = Math.random() * width;
          }
          if (m.x > width + 10) m.x = -10;
          const pulse = 0.55 + 0.45 * Math.sin(elapsedSec * 1.8 + m.phase);
          ctx.fillStyle = isDark
            ? `rgba(255, 237, 213, ${m.alpha * pulse})`
            : `rgba(234, 88, 12, ${m.alpha * 0.58 * pulse})`;
          ctx.beginPath();
          ctx.ellipse(m.x, m.y, m.radius * 1.25, m.radius * 0.85, m.phase * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (isAnimatedWeather) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    let isVisibleInViewport = true;
    const syncPauseState = () => {
      const nextPaused = (typeof document !== 'undefined' && document.hidden) || !isVisibleInViewport;
      if (nextPaused) {
        isPaused = true;
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
      } else if (isPaused) {
        isPaused = false;
        lastTs = performance.now();
        if (isAnimatedWeather && !rafId) {
          rafId = window.requestAnimationFrame(renderFrame);
        }
      }
    };

    const handleVisibilityChange = () => {
      syncPauseState();
    };

    const intersectionObserver =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              const entry = entries[0];
              if (entry) {
                isVisibleInViewport = entry.isIntersecting;
                syncPauseState();
              }
            },
            { threshold: 0.01 }
          )
        : null;
    intersectionObserver?.observe(container);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            syncCanvasSize();
            if (!isAnimatedWeather) {
              ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
              ctx.clearRect(0, 0, width, height);
            }
          })
        : null;
    resizeObserver?.observe(container);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (!isAnimatedWeather) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
    } else if (!isPaused) {
      rafId = window.requestAnimationFrame(renderFrame);
    }

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      intersectionObserver?.disconnect();
      resizeObserver?.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [weather, isDark, umbrellaCollisionEnabled]);

  const isRain = weather === 'rain';

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      data-weather-overlay={weather}
      data-weather-foreground={weather}
      data-studio-rain-layer={isRain ? 'true' : undefined}
      className={`weather-canvas-overlay weather-foreground-overlay studio-weather-foreground-overlay weather-fg-${weather} ${isRain ? 'studio-25d-rain-layer is-canvas-rain' : ''} ${className}`.trim()}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 30,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {isRain && (
        <div
          aria-hidden="true"
          data-weather-rain-tint="true"
          className="weather-canvas-rain-tint"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            zIndex: 30,
            pointerEvents: 'none',
            background: isDark ? 'rgba(8, 10, 14, 0.22)' : 'rgba(14, 16, 20, 0.16)',
          }}
        />
      )}
      <canvas
        ref={canvasRef}
        data-weather-foreground-canvas="true"
        data-weather-mode={weather}
        className="weather-canvas-overlay-el weather-foreground-canvas-el studio-weather-foreground-canvas"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 31,
          pointerEvents: 'none',
          display: 'block',
        }}
      />
    </div>
  );
});

export default WeatherCanvasOverlay;
