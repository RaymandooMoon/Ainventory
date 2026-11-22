import {
  type TurnaroundAngle360,
  shortestAngleDeltaDeg,
} from './turnaroundPhysics.ts';

export const MORPH_SILHOUETTE_BANDS = 64;
export const MORPH_PYRAMID_W = 48;
export const MORPH_PYRAMID_H = 72;
export const MORPH_FLOW_W = 24;
export const MORPH_FLOW_H = 36;
export const MORPH_MAX_FLOW_U = 0.16;
export const MORPH_MAX_FLOW_V = 0.08;

export interface SpineSoleAnchor {
  /** Offset from 0.5 center in normalized texture U space (clamped) */
  spineOffsetU: number;
  /** Offset from bottom baseline in normalized texture V space (clamped) */
  soleOffsetV: number;
}

export interface MorphAnalysisFrame {
  /** 48x72 grayscale luminance in [0, 1], stored bottom-to-top (WebGL UV V=0..1) */
  luma: Float32Array;
  /** 48x72 normalized alpha in [0, 1], stored bottom-to-top (WebGL UV V=0..1) */
  alpha: Float32Array;
  /** 64-band smoothed silhouette left boundary U in [0, 1], bottom-to-top */
  leftU: Float32Array;
  /** 64-band smoothed silhouette right boundary U in [0, 1], bottom-to-top */
  rightU: Float32Array;
  /** 64-band validity weight in [0, 1] (0 above crown / below sole) */
  validRow: Float32Array;
  anchor: SpineSoleAnchor;
}

export interface PairwiseMorphFieldData {
  /** 64x1 RGBA Uint8Array: R=leftA, G=rightA, B=leftB, A=rightB (normalized 0..255) */
  contourRgba: Uint8Array;
  /** 24x36 RGBA Uint8Array: R=dxAB, G=dyAB, B=dxBA, A=dyBA (128 = 0.0) */
  flowRgba: Uint8Array;
  contourWidth: number;
  flowWidth: number;
  flowHeight: number;
  /** Diagnostic mean horizontal shift magnitude in UV units */
  meanFlowMagU: number;
}

export interface ContinuousTurnaroundPair {
  angleA: TurnaroundAngle360;
  angleB: TurnaroundAngle360;
  /** Continuous normalized progress from angleA to angleB in [0, 1] */
  t: number;
  /** Angular span in degrees between angleA and angleB */
  spanDeg: number;
  /** Direction sign (+1 clockwise A->B) */
  directionSign: 1 | -1;
  /** True when resting essentially on a canonical frame (t <= 0.002 or t >= 0.998 or single frame) */
  isExactCanonical: boolean;
  /** Nearest canonical angle */
  nearestAngle: TurnaroundAngle360;
}

export interface IndependentLayerYawResult {
  yawADeg: number;
  yawBDeg: number;
  swapMix: number;
  /** Smooth bell-curve motion blur envelope peaking at t=0.5 */
  morphBlurFactor: number;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function clampByte(v: number): number {
  const rounded = Math.round(v);
  return rounded < 0 ? 0 : rounded > 255 ? 255 : rounded;
}

function normalizeAngle360Float(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const m = ((deg % 360) + 360) % 360;
  return m >= 360 ? 0 : m;
}

function smoothstep01(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / Math.max(1e-6, e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Resolves the bracketing canonical turnaround frames `(angleA, angleB)` and exact
 * continuous blend progress `t ∈ [0, 1]` for ANY continuous angle in degrees (signed or 0..360).
 * Seamlessly wraps across `315° ↔ 0°` and supports arbitrary progressive angle subsets.
 */
export function resolveContinuousTurnaroundPair(
  continuousAngleDeg: number,
  availableAngles: readonly TurnaroundAngle360[]
): ContinuousTurnaroundPair {
  if (!availableAngles || availableAngles.length === 0) {
    return {
      angleA: 0,
      angleB: 0,
      t: 0,
      spanDeg: 0,
      directionSign: 1,
      isExactCanonical: true,
      nearestAngle: 0,
    };
  }

  const sorted = Array.from(new Set(availableAngles)).sort((a, b) => a - b);
  if (sorted.length === 1) {
    return {
      angleA: sorted[0],
      angleB: sorted[0],
      t: 0,
      spanDeg: 0,
      directionSign: 1,
      isExactCanonical: true,
      nearestAngle: sorted[0],
    };
  }

  const deg = normalizeAngle360Float(continuousAngleDeg);
  const n = sorted.length;

  // Locate interval [sorted[i], sorted[(i+1)%n]] containing `deg` on the 360° circle
  let idxA = n - 1;
  for (let i = 0; i < n; i += 1) {
    if (sorted[i] <= deg) {
      idxA = i;
    } else {
      break;
    }
  }
  const idxB = (idxA + 1) % n;
  const angleA = sorted[idxA];
  const angleB = sorted[idxB];

  const spanDeg = angleB > angleA ? angleB - angleA : 360 - angleA + angleB;
  const offsetDeg = deg >= angleA ? deg - angleA : 360 - angleA + deg;
  const rawT = spanDeg > 0 ? clamp(offsetDeg / spanDeg, 0, 1) : 0;

  if (rawT <= 0.002) {
    return {
      angleA,
      angleB: angleA,
      t: 0,
      spanDeg: 0,
      directionSign: 1,
      isExactCanonical: true,
      nearestAngle: angleA,
    };
  }
  if (rawT >= 0.998) {
    return {
      angleA: angleB,
      angleB,
      t: 0,
      spanDeg: 0,
      directionSign: 1,
      isExactCanonical: true,
      nearestAngle: angleB,
    };
  }

  return {
    angleA,
    angleB,
    t: rawT,
    spanDeg,
    directionSign: 1,
    isExactCanonical: false,
    nearestAngle: rawT < 0.5 ? angleA : angleB,
  };
}

/**
 * Computes continuous, teleport-free independent 3D cylindrical yaw angles for outgoing layer A
 * and incoming layer B across `t ∈ [0, 1]`.
 *
 * Unlike single-mesh yaw flipping (`+14°` jumping instantaneously to `-14°` at `t = 0.5`),
 * Layer A glides monotonically `0° → +maxYaw` while Layer B glides monotonically `-maxYaw → 0°`,
 * completely eliminating the mid-transition 28° snap while keeping unified single-pass alpha=1.0.
 */
export function computeIndependentLayerYaws(
  t: number,
  directionSign = 1,
  maxYawDeg = 9.5
): IndependentLayerYawResult {
  const clampedT = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  const dir = directionSign >= 0 ? 1 : -1;
  const safeMax = clamp(Math.abs(maxYawDeg), 0, 14);
  const ease = smoothstep01(0, 1, clampedT);
  const swapMix = smoothstep01(0.12, 0.88, clampedT);
  const yawADeg = Number((dir * safeMax * ease).toFixed(3));
  const yawBDeg = Number((-dir * safeMax * (1 - ease)).toFixed(3));
  const morphBlurFactor = Number(Math.sin(clampedT * Math.PI).toFixed(4));
  return {
    yawADeg,
    yawBDeg,
    swapMix: Number(swapMix.toFixed(4)),
    morphBlurFactor,
  };
}

/**
 * Advances the rendered continuous turnaround angle toward a target angle along the shortest
 * circular arc (`[-180, +180]`), smoothly passing through every intermediate 45° frame on wide
 * jumps (e.g. `0° → 45° → 90° → 135° → 180°`) while tracking live scrubbing 1:1 with low latency.
 */
export function stepContinuousTurnaroundAngle(params: {
  currentDeg: number;
  targetDeg: number;
  dtSec: number;
  isLiveScrubbing: boolean;
  reducedMotion?: boolean;
}): { nextDeg: number; velocityDegPerSec: number; settled: boolean } {
  const { currentDeg, targetDeg, dtSec, isLiveScrubbing, reducedMotion = false } = params;
  const delta = shortestAngleDeltaDeg(currentDeg, targetDeg);
  if (reducedMotion || Math.abs(delta) < 0.08) {
    return {
      nextDeg: normalizeAngle360Float(targetDeg),
      velocityDegPerSec: 0,
      settled: true,
    };
  }

  const safeDt = clamp(Number.isFinite(dtSec) ? dtSec : 1 / 60, 0.001, 0.05);
  // Live scrub uses tight exponential tracking (~35ms); clicks/jumps cap angular speed so
  // multi-step turns (e.g. 0° -> 180°) smoothly showcase every intermediate 45° angle instead of teleporting.
  const lambda = isLiveScrubbing ? 28 : Math.abs(delta) > 65 ? 11.5 : 17.5;
  const alpha = 1 - Math.exp(-lambda * safeDt);
  const rawStep = delta * alpha;
  const maxStep = isLiveScrubbing ? 90 : 720 * safeDt;
  const clampedStep = clamp(rawStep, -maxStep, maxStep);
  const nextDeg = normalizeAngle360Float(currentDeg + clampedStep);
  const remaining = shortestAngleDeltaDeg(nextDeg, targetDeg);
  const settled = Math.abs(remaining) < 0.12;
  return {
    nextDeg: settled ? normalizeAngle360Float(targetDeg) : nextDeg,
    velocityDegPerSec: settled ? 0 : clampedStep / safeDt,
    settled,
  };
}

/**
 * Modulates ground contact shadow horizontal scale smoothly with turnaround angle:
 * widest at front/back stance (`0°`/`180°` → `1.0`) and slightly narrower at side profile (`90°`/`270°` → `0.84`).
 */
export function computeGroundShadowScaleX(continuousAngleDeg: number): number {
  const rad = (normalizeAngle360Float(continuousAngleDeg) * Math.PI) / 180;
  return Number((0.92 + 0.08 * Math.cos(2 * rad)).toFixed(4));
}

function gaussianSmooth1D(src: Float32Array, passes = 2): Float32Array {
  const n = src.length;
  let cur = new Float32Array(src);
  let nxt = new Float32Array(n);
  for (let p = 0; p < passes; p += 1) {
    for (let i = 0; i < n; i += 1) {
      const i0 = Math.max(0, i - 2);
      const i1 = Math.max(0, i - 1);
      const i2 = i;
      const i3 = Math.min(n - 1, i + 1);
      const i4 = Math.min(n - 1, i + 2);
      nxt[i] =
        cur[i0] * 0.08 +
        cur[i1] * 0.24 +
        cur[i2] * 0.36 +
        cur[i3] * 0.24 +
        cur[i4] * 0.08;
    }
    const tmp = cur;
    cur = nxt;
    nxt = tmp;
  }
  return cur;
}

/**
 * Extracts Spine-X / Sole-Y anatomical anchor, 64-band smoothed horizontal silhouette contour
 * `[leftU(v), rightU(v)]`, and a 48×72 bottom-to-top luma+alpha pyramid in one fast CPU pass (<1ms).
 *
 * Expects standard top-to-bottom RGBA pixel data (`w × h`, typically `48 × 72`).
 * If `mirrorX` is true, horizontally mirrors the extracted features to match shader `uMirrorX`.
 */
export function extractMorphAnalysisFrame(
  rgbaTopDown: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  mirrorX = false
): MorphAnalysisFrame {
  const pw = MORPH_PYRAMID_W;
  const ph = MORPH_PYRAMID_H;
  const luma = new Float32Array(pw * ph);
  const alpha = new Float32Array(pw * ph);

  // Resample/copy into 48x72 bottom-to-top buffer matching WebGL UV V=0 (bottom) .. V=1 (top)
  for (let vIdx = 0; vIdx < ph; vIdx += 1) {
    const srcY = clamp(Math.floor(((ph - 1 - vIdx + 0.5) / ph) * h), 0, h - 1);
    const rowOff = vIdx * pw;
    for (let uIdx = 0; uIdx < pw; uIdx += 1) {
      const normU = (uIdx + 0.5) / pw;
      const sampleU = mirrorX ? 1 - normU : normU;
      const srcX = clamp(Math.floor(sampleU * w), 0, w - 1);
      const si = (srcY * w + srcX) * 4;
      const a = rgbaTopDown[si + 3] / 255;
      const l =
        (0.2126 * rgbaTopDown[si] + 0.7152 * rgbaTopDown[si + 1] + 0.0722 * rgbaTopDown[si + 2]) /
        255;
      alpha[rowOff + uIdx] = a;
      luma[rowOff + uIdx] = l * a;
    }
  }

  // Spine-X (torso band V = 0.38..0.82 bottom-to-top, equivalent to top-down y = 18%..62%)
  const torsoV0 = Math.floor(ph * 0.38);
  const torsoV1 = Math.floor(ph * 0.82);
  let weightedX = 0;
  let totalWeight = 0;
  for (let v = torsoV0; v < torsoV1; v += 1) {
    const rowOff = v * pw;
    for (let u = 0; u < pw; u += 1) {
      const a = alpha[rowOff + u];
      if (a > 0.14) {
        weightedX += ((u + 0.5) / pw) * a;
        totalWeight += a;
      }
    }
  }
  const spineU = totalWeight > 4 ? weightedX / totalWeight : 0.5;

  // Sole-Y (lowest opaque row scanning upward from bottom V = 0..0.28)
  let lowestV = 0;
  let foundSole = false;
  for (let v = 0; v <= Math.floor(ph * 0.28); v += 1) {
    const rowOff = v * pw;
    let rowOpaque = 0;
    for (let u = 0; u < pw; u += 1) {
      if (alpha[rowOff + u] > 0.25) rowOpaque += 1;
    }
    if (rowOpaque >= 2) {
      lowestV = v;
      foundSole = true;
      break;
    }
  }
  const soleVFromBottom = foundSole ? lowestV / ph : 0.012;
  const rawSpineOffset = spineU - 0.5;
  const rawSoleOffset = soleVFromBottom - 0.012;
  // Store unmirrored spine offset convention matching StudioCharacterRelightCanvas
  const unmirroredSpine = mirrorX ? -rawSpineOffset : rawSpineOffset;
  const anchor: SpineSoleAnchor = {
    spineOffsetU: clamp(unmirroredSpine, -0.045, 0.045),
    soleOffsetV: clamp(rawSoleOffset, -0.035, 0.035),
  };

  // Re-sample luma & alpha into exact Spine-X / Sole-Y anchored screen-UV space so both
  // silhouette contour bounds and optical flow align 1:1 with the GLSL shader's anchored UV.
  const appliedSpineShift = mirrorX ? -anchor.spineOffsetU : anchor.spineOffsetU;
  const appliedSoleShift = anchor.soleOffsetV;
  const anchoredLuma = new Float32Array(pw * ph);
  const anchoredAlpha = new Float32Array(pw * ph);
  for (let vIdx = 0; vIdx < ph; vIdx += 1) {
    const sampleV = (vIdx + 0.5) / ph + appliedSoleShift;
    const rowOff = vIdx * pw;
    if (sampleV < 0 || sampleV > 1) continue;
    const srcV = sampleV * ph - 0.5;
    for (let uIdx = 0; uIdx < pw; uIdx += 1) {
      const sampleU = (uIdx + 0.5) / pw + appliedSpineShift;
      if (sampleU < 0 || sampleU > 1) continue;
      const srcU = sampleU * pw - 0.5;
      anchoredLuma[rowOff + uIdx] = sampleBilinear(luma, pw, ph, srcU, srcV);
      anchoredAlpha[rowOff + uIdx] = sampleBilinear(alpha, pw, ph, srcU, srcV);
    }
  }

  // Extract 64-band horizontal silhouette bounds [leftU, rightU] in anchored screen-UV space
  const rawLeft = new Float32Array(MORPH_SILHOUETTE_BANDS);
  const rawRight = new Float32Array(MORPH_SILHOUETTE_BANDS);
  const validRow = new Float32Array(MORPH_SILHOUETTE_BANDS);

  for (let b = 0; b < MORPH_SILHOUETTE_BANDS; b += 1) {
    const vCenter = Math.floor(((b + 0.5) / MORPH_SILHOUETTE_BANDS) * ph);
    const vMin = Math.max(0, vCenter - 1);
    const vMax = Math.min(ph - 1, vCenter + 1);
    let minU = pw;
    let maxU = -1;
    for (let v = vMin; v <= vMax; v += 1) {
      const rowOff = v * pw;
      for (let u = 0; u < pw; u += 1) {
        if (anchoredAlpha[rowOff + u] > 0.22) {
          if (u < minU) minU = u;
          if (u > maxU) maxU = u;
        }
      }
    }
    if (maxU >= minU) {
      rawLeft[b] = minU / pw;
      rawRight[b] = (maxU + 1) / pw;
      validRow[b] = 1;
    }
  }

  // Fill empty rows above head / below feet from nearest valid band so edge smoothing never collapses to 0
  let firstValid = -1;
  let lastValid = -1;
  for (let b = 0; b < MORPH_SILHOUETTE_BANDS; b += 1) {
    if (validRow[b] > 0.5) {
      if (firstValid === -1) firstValid = b;
      lastValid = b;
    }
  }
  if (firstValid === -1) {
    rawLeft.fill(0.32);
    rawRight.fill(0.68);
  } else {
    for (let b = 0; b < firstValid; b += 1) {
      rawLeft[b] = rawLeft[firstValid];
      rawRight[b] = rawRight[firstValid];
    }
    for (let b = lastValid + 1; b < MORPH_SILHOUETTE_BANDS; b += 1) {
      rawLeft[b] = rawLeft[lastValid];
      rawRight[b] = rawRight[lastValid];
    }
    // Interpolate any tiny internal gap
    let prevV = firstValid;
    for (let b = firstValid + 1; b <= lastValid; b += 1) {
      if (validRow[b] > 0.5) {
        if (b - prevV > 1) {
          for (let k = prevV + 1; k < b; k += 1) {
            const frac = (k - prevV) / (b - prevV);
            rawLeft[k] = rawLeft[prevV] + (rawLeft[b] - rawLeft[prevV]) * frac;
            rawRight[k] = rawRight[prevV] + (rawRight[b] - rawRight[prevV]) * frac;
          }
        }
        prevV = b;
      }
    }
  }

  const leftU = gaussianSmooth1D(rawLeft, 2);
  const rightU = gaussianSmooth1D(rawRight, 2);
  const smoothValid = gaussianSmooth1D(validRow, 1);

  return {
    luma: anchoredLuma,
    alpha: anchoredAlpha,
    leftU,
    rightU,
    validRow: smoothValid,
    anchor,
  };
}

function sampleBilinear(
  buf: Float32Array,
  w: number,
  h: number,
  x: number,
  y: number
): number {
  const cx = clamp(x, 0, w - 1);
  const cy = clamp(y, 0, h - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const v00 = buf[y0 * w + x0];
  const v10 = buf[y0 * w + x1];
  const v01 = buf[y1 * w + x0];
  const v11 = buf[y1 * w + x1];
  return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
}

function smoothGrid2D(
  grid: Float32Array,
  w: number,
  h: number,
  passes = 3
): Float32Array {
  let cur = new Float32Array(grid);
  let nxt = new Float32Array(w * h);
  for (let pass = 0; pass < passes; pass += 1) {
    // Horizontal pass [0.25, 0.5, 0.25]
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      for (let x = 0; x < w; x += 1) {
        const xm = x > 0 ? x - 1 : 0;
        const xp = x < w - 1 ? x + 1 : w - 1;
        nxt[row + x] = cur[row + xm] * 0.25 + cur[row + x] * 0.5 + cur[row + xp] * 0.25;
      }
    }
    // Vertical pass [0.25, 0.5, 0.25]
    for (let y = 0; y < h; y += 1) {
      const ym = y > 0 ? y - 1 : 0;
      const yp = y < h - 1 ? y + 1 : h - 1;
      const row = y * w;
      const rowM = ym * w;
      const rowP = yp * w;
      for (let x = 0; x < w; x += 1) {
        cur[row + x] = nxt[rowM + x] * 0.25 + nxt[row + x] * 0.5 + nxt[rowP + x] * 0.25;
      }
    }
  }
  return cur;
}

function estimateDirectedResidualFlow(
  src: MorphAnalysisFrame,
  dst: MorphAnalysisFrame
): { dxUv: Float32Array; dyUv: Float32Array; conf: Float32Array } {
  const pw = MORPH_PYRAMID_W;
  const ph = MORPH_PYRAMID_H;
  const fw = MORPH_FLOW_W;
  const fh = MORPH_FLOW_H;
  const dxUv = new Float32Array(fw * fh);
  const dyUv = new Float32Array(fw * fh);
  const conf = new Float32Array(fw * fh);

  const searchRx = 4;
  const searchRy = 2;
  const patchR = 2; // 5x5 patch

  for (let gy = 0; gy < fh; gy += 1) {
    const vNorm = (gy + 0.5) / fh;
    const py = clamp(Math.floor(vNorm * ph), patchR, ph - 1 - patchR);
    const bandIdx = clamp(Math.floor(vNorm * MORPH_SILHOUETTE_BANDS), 0, MORPH_SILHOUETTE_BANDS - 1);

    const lSrc = src.leftU[bandIdx];
    const rSrc = src.rightU[bandIdx];
    const lDst = dst.leftU[bandIdx];
    const rDst = dst.rightU[bandIdx];
    const wSrc = Math.max(0.05, rSrc - lSrc);
    const wDst = Math.max(0.05, rDst - lDst);

    for (let gx = 0; gx < fw; gx += 1) {
      const gIdx = gy * fw + gx;
      const uNorm = (gx + 0.5) / fw;
      const px = clamp(Math.floor(uNorm * pw), patchR, pw - 1 - patchR);

      // Skip background nodes far from opaque silhouette
      if (src.alpha[py * pw + px] < 0.18) continue;

      // Contour-aligned prior in dst pyramid coordinates
      const sInside = clamp((uNorm - lSrc) / wSrc, -0.1, 1.1);
      const priorDstU = clamp(lDst + sInside * wDst, 0.04, 0.96);
      const priorPx = priorDstU * pw;

      let bestCost = Infinity;
      let bestDx = 0;
      let bestDy = 0;
      let zeroCost = Infinity;

      for (let ddy = -searchRy; ddy <= searchRy; ddy += 1) {
        const cy = py + ddy;
        if (cy < patchR || cy >= ph - patchR) continue;
        for (let ddx = -searchRx; ddx <= searchRx; ddx += 1) {
          const cx = priorPx + ddx;
          if (cx < patchR || cx >= pw - patchR - 1) continue;

          // Regularize toward zero residual so flat/uniform garment regions stay clean & smooth
          let cost = (ddx * ddx * 0.012 + ddy * ddy * 0.028);
          for (let oy = -patchR; oy <= patchR; oy += 1) {
            const sRow = (py + oy) * pw;
            const dY = cy + oy;
            for (let ox = -patchR; ox <= patchR; ox += 1) {
              const sIdx = sRow + (px + ox);
              const dX = cx + ox;
              const dL = src.luma[sIdx] - sampleBilinear(dst.luma, pw, ph, dX, dY);
              const dA = src.alpha[sIdx] - sampleBilinear(dst.alpha, pw, ph, dX, dY);
              cost += Math.abs(dL) + Math.abs(dA) * 1.15;
            }
          }

          if (ddx === 0 && ddy === 0) {
            zeroCost = cost;
          }
          if (cost < bestCost) {
            bestCost = cost;
            bestDx = ddx;
            bestDy = ddy;
          }
        }
      }

      // Accept residual only if it beats the contour-only prior meaningfully (reduces noise on solid fabric)
      const improvement = zeroCost - bestCost;
      if (improvement > 0.06 && Number.isFinite(bestCost)) {
        const weight = clamp(improvement / 1.4, 0.15, 1.0);
        // Residual displacement in UV space (beyond the scanline contour alignment)
        dxUv[gIdx] = clamp((bestDx / pw) * weight, -MORPH_MAX_FLOW_U * 0.85, MORPH_MAX_FLOW_U * 0.85);
        dyUv[gIdx] = clamp((bestDy / ph) * weight, -MORPH_MAX_FLOW_V * 0.85, MORPH_MAX_FLOW_V * 0.85);
        conf[gIdx] = weight;
      }
    }
  }

  return { dxUv, dyUv, conf };
}

/**
 * Computes the combined Option 2 GPU Morph Pack for an adjacent turnaround pair `(frameA → frameB)`:
 * 1) 64-band smoothed horizontal silhouette contour envelope (`leftA, rightA, leftB, rightB`)
 *    so shoulders, sleeves, waist, and pants smoothly narrow/widen edge-to-edge with zero double-contour ghosting.
 * 2) 24×36 contour-initialized bidirectional residual optical flow with forward-backward consistency
 *    pruning, midpoint advection, and 3-pass Gaussian diffeomorphic smoothing so interior facial features,
 *    scarves, zippers, and knees glide smoothly across the turning body.
 */
export function computePairwiseMorphField(
  frameA: MorphAnalysisFrame,
  frameB: MorphAnalysisFrame
): PairwiseMorphFieldData {
  // 1) Pack 64-band contour envelope RGBA (64x1)
  const contourRgba = new Uint8Array(MORPH_SILHOUETTE_BANDS * 4);
  for (let b = 0; b < MORPH_SILHOUETTE_BANDS; b += 1) {
    const o = b * 4;
    contourRgba[o] = clampByte(clamp(frameA.leftU[b], 0, 1) * 255);
    contourRgba[o + 1] = clampByte(clamp(frameA.rightU[b], 0, 1) * 255);
    contourRgba[o + 2] = clampByte(clamp(frameB.leftU[b], 0, 1) * 255);
    contourRgba[o + 3] = clampByte(clamp(frameB.rightU[b], 0, 1) * 255);
  }

  // 2) Compute contour-initialized bidirectional residual flow
  const fwd = estimateDirectedResidualFlow(frameA, frameB);
  const bwd = estimateDirectedResidualFlow(frameB, frameA);

  const fw = MORPH_FLOW_W;
  const fh = MORPH_FLOW_H;
  const n = fw * fh;

  // Forward-backward consistency gating (suppresses occluded/disoccluded tearing around silhouette rims)
  const cleanFwdX = new Float32Array(n);
  const cleanFwdY = new Float32Array(n);
  const cleanBwdX = new Float32Array(n);
  const cleanBwdY = new Float32Array(n);

  for (let gy = 0; gy < fh; gy += 1) {
    for (let gx = 0; gx < fw; gx += 1) {
      const i = gy * fw + gx;
      const fx = fwd.dxUv[i];
      const fy = fwd.dyUv[i];
      const targetGx = clamp(gx + fx * fw, 0, fw - 1);
      const targetGy = clamp(gy + fy * fh, 0, fh - 1);
      const revX = sampleBilinear(bwd.dxUv, fw, fh, targetGx, targetGy);
      const revY = sampleBilinear(bwd.dyUv, fw, fh, targetGx, targetGy);
      const fbErr = Math.hypot(fx + revX, fy + revY);
      const fbGate = 1 - smoothstep01(0.025, 0.085, fbErr);
      cleanFwdX[i] = fx * fbGate;
      cleanFwdY[i] = fy * fbGate;

      const bx = bwd.dxUv[i];
      const by = bwd.dyUv[i];
      const targetBx = clamp(gx + bx * fw, 0, fw - 1);
      const targetBy = clamp(gy + by * fh, 0, fh - 1);
      const revFx = sampleBilinear(fwd.dxUv, fw, fh, targetBx, targetBy);
      const revFy = sampleBilinear(fwd.dyUv, fw, fh, targetBx, targetBy);
      const bfErr = Math.hypot(bx + revFx, by + revFy);
      const bfGate = 1 - smoothstep01(0.025, 0.085, bfErr);
      cleanBwdX[i] = bx * bfGate;
      cleanBwdY[i] = by * bfGate;
    }
  }

  // 3-pass separable Gaussian smoothing guarantees a smooth, fold-free diffeomorphic warp
  const smFwdX = smoothGrid2D(cleanFwdX, fw, fh, 3);
  const smFwdY = smoothGrid2D(cleanFwdY, fw, fh, 3);
  const smBwdX = smoothGrid2D(cleanBwdX, fw, fh, 3);
  const smBwdY = smoothGrid2D(cleanBwdY, fw, fh, 3);

  const flowRgba = new Uint8Array(n * 4);
  let sumAbsFlowU = 0;
  for (let i = 0; i < n; i += 1) {
    const fx = clamp(smFwdX[i], -MORPH_MAX_FLOW_U, MORPH_MAX_FLOW_U);
    const fy = clamp(smFwdY[i], -MORPH_MAX_FLOW_V, MORPH_MAX_FLOW_V);
    const bx = clamp(smBwdX[i], -MORPH_MAX_FLOW_U, MORPH_MAX_FLOW_U);
    const by = clamp(smBwdY[i], -MORPH_MAX_FLOW_V, MORPH_MAX_FLOW_V);
    sumAbsFlowU += (Math.abs(fx) + Math.abs(bx)) * 0.5;
    const o = i * 4;
    flowRgba[o] = clampByte((fx / MORPH_MAX_FLOW_U) * 127 + 128);
    flowRgba[o + 1] = clampByte((fy / MORPH_MAX_FLOW_V) * 127 + 128);
    flowRgba[o + 2] = clampByte((bx / MORPH_MAX_FLOW_U) * 127 + 128);
    flowRgba[o + 3] = clampByte((by / MORPH_MAX_FLOW_V) * 127 + 128);
  }

  return {
    contourRgba,
    flowRgba,
    contourWidth: MORPH_SILHOUETTE_BANDS,
    flowWidth: fw,
    flowHeight: fh,
    meanFlowMagU: Number((sumAbsFlowU / Math.max(1, n)).toFixed(5)),
  };
}
