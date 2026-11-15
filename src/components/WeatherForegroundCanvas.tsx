import { memo, useEffect, useRef } from 'react';
import type { EffectiveWeatherMode } from '../services/weatherPromptBuilder.ts';

export interface WeatherForegroundCanvasProps {
  weather: EffectiveWeatherMode;
  isDark: boolean;
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
  maxRx: number;
  alpha: number;
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

/**
 * Layer 3 (`z-index: 30`, `pointer-events: none`) Foreground Weather Physics Engine.
 * Renders real-time HTML5 Canvas atmospheric physics directly IN FRONT OF the model & umbrella
 * with automatic Dark/Light stage contrast compensation.
 */
const WeatherForegroundCanvas = memo(function WeatherForegroundCanvas({
  weather,
  isDark,
  umbrellaCollisionEnabled = true,
  className = '',
}: WeatherForegroundCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    let width = Math.max(1, container.clientWidth || 380);
    let height = Math.max(1, container.clientHeight || 480);
    let dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);

    const syncCanvasSize = () => {
      const nextW = Math.max(1, Math.min(2048, container.clientWidth || 380));
      const nextH = Math.max(1, Math.min(2048, container.clientHeight || 480));
      dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);
      width = nextW;
      height = nextH;
      const targetW = Math.min(2048, Math.round(width * dpr));
      const targetH = Math.min(2048, Math.round(height * dpr));
      if (canvas.width !== targetW) canvas.width = targetW;
      if (canvas.height !== targetH) canvas.height = targetH;
    };
    syncCanvasSize();

    // Particle pools initialized per weather mode
    const rainDrops: RainDrop[] = [];
    const rainSplashes: RainSplash[] = [];
    const floorRipples: FloorRipple[] = [];
    const iceShards: IceShard[] = [];
    const breathPuffs: BreathVaporPuff[] = [];
    const snowflakes: Snowflake[] = [];
    const windRibbons: WindRibbon[] = [];
    const motes: AmbientMote[] = [];

    if (weather === 'rain') {
      const count = 96;
      for (let i = 0; i < count; i += 1) {
        const isForeground = i % 2 === 0;
        rainDrops.push({
          x: Math.random() * (width * 1.25) - width * 0.1,
          y: Math.random() * height,
          vx: -(1.8 + Math.random() * 1.3),
          vy: isForeground ? 14.5 + Math.random() * 4.5 : 10.5 + Math.random() * 3.5,
          len: isForeground ? 18 + Math.random() * 12 : 12 + Math.random() * 8,
          thickness: isForeground ? 1.45 : 1.0,
          alpha: isForeground ? 0.58 + Math.random() * 0.26 : 0.34 + Math.random() * 0.2,
          collidesUmbrella: i % 10 < 6, // 60% bounce off open umbrella canopy, 40% pass in front of model
        });
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
    } else if (weather === 'heatwave') {
      for (let i = 0; i < 36; i += 1) {
        motes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.4,
          vy: -(0.55 + Math.random() * 1.15),
          radius: 1.8 + Math.random() * 3.2,
          alpha: 0.22 + Math.random() * 0.3,
          phase: Math.random() * Math.PI * 2,
        });
      }
    } else if (weather === 'cloudy') {
      for (let i = 0; i < 6; i += 1) {
        motes.push({
          x: Math.random() * width,
          y: height * (0.08 + i * 0.13),
          vx: 0.28 + Math.random() * 0.32,
          vy: 0,
          radius: Math.max(90, width * (0.34 + Math.random() * 0.22)),
          alpha: 0.08 + Math.random() * 0.06,
          phase: Math.random() * Math.PI * 2,
        });
      }
    } else if (weather === 'clear') {
      for (let i = 0; i < 24; i += 1) {
        motes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.45) * 0.28,
          vy: -(0.18 + Math.random() * 0.34),
          radius: 1.5 + Math.random() * 2.8,
          alpha: 0.22 + Math.random() * 0.28,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

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
                    vx: (Math.random() - 0.5) * 3.4 + nx * 1.9,
                    vy: -(1.8 + Math.random() * 2.4),
                    radius: 1.1 + Math.random() * 1.1,
                    alpha: isDark ? 0.82 : 0.76,
                    life: 0,
                    maxLife: 0.28 + Math.random() * 0.18,
                  });
                }
              }
              drop.x = Math.random() * (width * 1.25) - width * 0.05;
              drop.y = -20 - Math.random() * 60;
              continue;
            }
          }

          // Floor impact -> spawn elliptical water ripple
          const floorY = height * (0.885 + (i % 5) * 0.014);
          if (drop.y >= floorY) {
            if (floorRipples.length < 22 && Math.random() < 0.38) {
              floorRipples.push({
                x: drop.x,
                y: floorY,
                rx: 2,
                maxRx: 14 + Math.random() * 14,
                alpha: isDark ? 0.46 : 0.42,
              });
            }
            drop.x = Math.random() * (width * 1.25) - width * 0.05;
            drop.y = -20 - Math.random() * 70;
            continue;
          }

          if (drop.x < -40) {
            drop.x = width + 20;
          }

          const dx = (drop.vx / drop.vy) * drop.len;
          const grad = ctx.createLinearGradient(
            drop.x - dx,
            drop.y - drop.len,
            drop.x,
            drop.y
          );
          if (isDark) {
            grad.addColorStop(0, 'rgba(148, 197, 255, 0)');
            grad.addColorStop(1, `rgba(219, 234, 254, ${drop.alpha})`);
          } else {
            grad.addColorStop(0, 'rgba(51, 88, 138, 0)');
            grad.addColorStop(1, `rgba(45, 84, 136, ${Math.min(0.88, drop.alpha * 1.12)})`);
          }
          ctx.strokeStyle = grad;
          ctx.lineWidth = drop.thickness;
          ctx.beginPath();
          ctx.moveTo(drop.x - dx, drop.y - drop.len);
          ctx.lineTo(drop.x, drop.y);
          ctx.stroke();
        }

        // Update & draw umbrella canopy splash droplets
        for (let i = rainSplashes.length - 1; i >= 0; i -= 1) {
          const sp = rainSplashes[i];
          sp.life += dt;
          if (sp.life >= sp.maxLife) {
            rainSplashes.splice(i, 1);
            continue;
          }
          sp.vy += 0.24 * frameScale;
          sp.x += sp.vx * frameScale;
          sp.y += sp.vy * frameScale;
          const fade = 1 - sp.life / sp.maxLife;
          ctx.fillStyle = isDark
            ? `rgba(224, 242, 254, ${sp.alpha * fade})`
            : `rgba(45, 92, 152, ${sp.alpha * fade})`;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, sp.radius, 0, Math.PI * 2);
          ctx.fill();
        }

        // Update & draw floor water ripples
        for (let i = floorRipples.length - 1; i >= 0; i -= 1) {
          const rp = floorRipples[i];
          rp.rx += 0.72 * frameScale;
          if (rp.rx >= rp.maxRx) {
            floorRipples.splice(i, 1);
            continue;
          }
          const fade = 1 - rp.rx / rp.maxRx;
          ctx.strokeStyle = isDark
            ? `rgba(186, 230, 253, ${rp.alpha * fade})`
            : `rgba(51, 95, 148, ${rp.alpha * fade})`;
          ctx.lineWidth = 1.05;
          ctx.beginPath();
          ctx.ellipse(rp.x, rp.y, rp.rx, rp.rx * 0.28, 0, 0, Math.PI * 2);
          ctx.stroke();
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
            const tx = sh.x - (sh.vx / norm) * sh.len;
            const ty = sh.y - (sh.vy / norm) * sh.len;
            const grad = ctx.createLinearGradient(tx, ty, sh.x, sh.y);
            if (isDark) {
              grad.addColorStop(0, 'rgba(186, 230, 253, 0)');
              grad.addColorStop(1, `rgba(240, 249, 255, ${sh.alpha})`);
            } else {
              grad.addColorStop(0, 'rgba(59, 130, 246, 0)');
              grad.addColorStop(1, `rgba(37, 99, 235, ${Math.min(0.85, sh.alpha * 1.05)})`);
            }
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.35;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
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
      } else if (weather === 'clear') {
        // Subtle diagonal warm sunbeams from top-right + floating golden dust bokeh
        ctx.save();
        const beamGrad = ctx.createLinearGradient(width * 0.92, 0, width * 0.25, height * 0.72);
        beamGrad.addColorStop(
          0,
          isDark ? 'rgba(253, 230, 138, 0.10)' : 'rgba(251, 191, 36, 0.11)'
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
      }

      rafId = window.requestAnimationFrame(renderFrame);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        isPaused = true;
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
      } else if (isPaused) {
        isPaused = false;
        lastTs = performance.now();
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            syncCanvasSize();
          })
        : null;
    resizeObserver?.observe(container);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (!isPaused) {
      rafId = window.requestAnimationFrame(renderFrame);
    }

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      resizeObserver?.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [weather, isDark, umbrellaCollisionEnabled]);

  const isRain = weather === 'rain';

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      data-weather-foreground={weather}
      data-studio-rain-layer={isRain ? 'true' : undefined}
      className={`weather-foreground-overlay studio-weather-foreground-overlay weather-fg-${weather} ${isRain ? 'studio-25d-rain-layer is-canvas-rain' : ''} ${className}`.trim()}
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
      <canvas
        ref={canvasRef}
        data-weather-foreground-canvas="true"
        data-weather-mode={weather}
        className="weather-foreground-canvas-el studio-weather-foreground-canvas"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 30,
          pointerEvents: 'none',
          display: 'block',
        }}
      />
    </div>
  );
});

export default WeatherForegroundCanvas;
