import React, { useEffect, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { StageLightingFrame } from '../../utils/stageLightingEngine.ts';
import {
  MORPH_FLOW_H,
  MORPH_FLOW_W,
  MORPH_MAX_FLOW_U,
  MORPH_MAX_FLOW_V,
  MORPH_PYRAMID_H,
  MORPH_PYRAMID_W,
  MORPH_SILHOUETTE_BANDS,
  type MorphAnalysisFrame,
  type SpineSoleAnchor,
  computeIndependentLayerYaws,
  computePairwiseMorphField,
  extractMorphAnalysisFrame,
  resolveContinuousTurnaroundPair,
  stepContinuousTurnaroundAngle,
} from '../../utils/turnaroundMorph.ts';
import {
  type TurnaroundAngle360,
  computeDirectionalBlurPx,
} from '../../utils/turnaroundPhysics.ts';

export interface StudioCharacterRelightCanvasProps {
  imageUrl: string | null;
  angleDeg: number;
  mirrorX: boolean;
  identityKey: string;
  /** Full map of available 8-angle turnaround slice URLs for eager GPU upload & continuous morphing */
  angleSlices?: Partial<Record<TurnaroundAngle360, string>> | null;
  /** Optional continuous target angle in degrees (signed or 0..360) for 1:1 scrub morphing */
  continuousAngleDeg?: number;
  /** True while user is actively scrubbing slider or dragging horizontally on the character */
  isLiveScrubbing?: boolean;
  lightingFrame?: StageLightingFrame | null;
  /** External continuous yaw offset in degrees (subtle sway during drag/scroll) */
  externalYawDeg?: number;
  /** Angular velocity directional motion blur in px */
  kineticBlurPx?: number;
  /** Optional scale/translate transform excluding mirrorX (handled inside shader) */
  widthPx?: number | null;
  heightPx?: number | null;
  transformOrigin?: string;
  transformStyle?: string;
  prefersReducedMotion?: boolean;
  className?: string;
  onWebGlReadyChange?: (ready: boolean) => void;
}

interface CachedTextureEntry {
  url: string;
  texture: THREE.Texture;
  aspect: number;
  texWidth: number;
  texHeight: number;
  anchor: SpineSoleAnchor;
  /** Unmirrored & mirrored morph analysis frames (computed lazily per mirror flag) */
  morphFrameRaw: MorphAnalysisFrame;
  morphFrameMirrored: MorphAnalysisFrame | null;
  lastUsedAt: number;
}

interface PairMorphGpuEntry {
  key: string;
  contourTex: THREE.DataTexture;
  flowTex: THREE.DataTexture;
  lastUsedAt: number;
}

const CANONICAL_TURNAROUND_ANGLES: readonly TurnaroundAngle360[] = [
  0, 45, 90, 135, 180, 225, 270, 315,
];
const MAX_CACHED_TEXTURES = 16;
const MAX_CACHED_PAIR_MORPHS = 24;
const EXTERNAL_SWAY_MAX_YAW_DEG = 8.5;
const LAYER_MORPH_MAX_YAW_DEG = 9.5;
const MAX_PARALLAX_UV = 0.015;

// Reusable module-scope helpers (zero GC inside animation / render callbacks)
const _colorLeft = new THREE.Color();
const _colorRight = new THREE.Color();
const _colorKey = new THREE.Color();
const _colorAmbient = new THREE.Color();
const _colorFloor = new THREE.Color();
const _keyDir = new THREE.Vector3();

let cachedIsSoftwareGl: boolean | null = null;
let sharedScanCanvas: HTMLCanvasElement | null = null;

function detectSoftwareWebGl(): boolean {
  if (cachedIsSoftwareGl !== null) return cachedIsSoftwareGl;
  if (typeof document === 'undefined') {
    cachedIsSoftwareGl = true;
    return true;
  }
  try {
    const probeCanvas = document.createElement('canvas');
    const gl =
      (probeCanvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (probeCanvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) {
      cachedIsSoftwareGl = true;
      return true;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedIsSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    return cachedIsSoftwareGl;
  } catch {
    cachedIsSoftwareGl = true;
    return true;
  }
}

/**
 * Single-pass offscreen 48×72 scan producing Spine-X/Sole-Y anchor, 64-band smoothed silhouette
 * contour bounds, and luma+alpha optical flow pyramid in <1ms.
 */
function analyzeTurnaroundImage(img: HTMLImageElement, mirrorX = false): MorphAnalysisFrame {
  if (typeof document === 'undefined') {
    const empty = new Uint8ClampedArray(MORPH_PYRAMID_W * MORPH_PYRAMID_H * 4);
    return extractMorphAnalysisFrame(empty, MORPH_PYRAMID_W, MORPH_PYRAMID_H, mirrorX);
  }
  try {
    if (!sharedScanCanvas) {
      sharedScanCanvas = document.createElement('canvas');
      sharedScanCanvas.width = MORPH_PYRAMID_W;
      sharedScanCanvas.height = MORPH_PYRAMID_H;
    }
    const ctx = sharedScanCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      const empty = new Uint8ClampedArray(MORPH_PYRAMID_W * MORPH_PYRAMID_H * 4);
      return extractMorphAnalysisFrame(empty, MORPH_PYRAMID_W, MORPH_PYRAMID_H, mirrorX);
    }
    ctx.clearRect(0, 0, MORPH_PYRAMID_W, MORPH_PYRAMID_H);
    ctx.drawImage(img, 0, 0, MORPH_PYRAMID_W, MORPH_PYRAMID_H);
    const data = ctx.getImageData(0, 0, MORPH_PYRAMID_W, MORPH_PYRAMID_H).data;
    return extractMorphAnalysisFrame(data, MORPH_PYRAMID_W, MORPH_PYRAMID_H, mirrorX);
  } catch {
    const empty = new Uint8ClampedArray(MORPH_PYRAMID_W * MORPH_PYRAMID_H * 4);
    return extractMorphAnalysisFrame(empty, MORPH_PYRAMID_W, MORPH_PYRAMID_H, mirrorX);
  }
}

function mirrorMorphAnalysisFrame(src: MorphAnalysisFrame): MorphAnalysisFrame {
  const pw = MORPH_PYRAMID_W;
  const ph = MORPH_PYRAMID_H;
  const luma = new Float32Array(pw * ph);
  const alpha = new Float32Array(pw * ph);
  for (let v = 0; v < ph; v += 1) {
    const rowOff = v * pw;
    for (let u = 0; u < pw; u += 1) {
      const mirrorU = pw - 1 - u;
      luma[rowOff + u] = src.luma[rowOff + mirrorU];
      alpha[rowOff + u] = src.alpha[rowOff + mirrorU];
    }
  }
  const leftU = new Float32Array(MORPH_SILHOUETTE_BANDS);
  const rightU = new Float32Array(MORPH_SILHOUETTE_BANDS);
  for (let b = 0; b < MORPH_SILHOUETTE_BANDS; b += 1) {
    leftU[b] = Math.max(0, Math.min(1, 1 - src.rightU[b]));
    rightU[b] = Math.max(0, Math.min(1, 1 - src.leftU[b]));
  }
  return {
    luma,
    alpha,
    leftU,
    rightU,
    validRow: new Float32Array(src.validRow),
    anchor: { ...src.anchor },
  };
}

function getMorphFrameForMirror(entry: CachedTextureEntry, mirrorX: boolean): MorphAnalysisFrame {
  if (!mirrorX) return entry.morphFrameRaw;
  if (!entry.morphFrameMirrored) {
    entry.morphFrameMirrored = mirrorMorphAnalysisFrame(entry.morphFrameRaw);
  }
  return entry.morphFrameMirrored;
}

const VERTEX_SHADER = /* glsl */ `
  uniform float uPlaneWidth;
  uniform float uYawRad;
  uniform float uCylinderBend;

  varying vec2 vPlaneUv;
  varying float vCylCurveX;

  void main() {
    vPlaneUv = uv;

    // Horizontal coordinate normalized to [-0.5, +0.5] around spine axis
    float nx = position.x;
    float px = nx * uPlaneWidth;
    float py = position.y;

    // Subtle shallow cylindrical arc curvature around vertical spine Y-axis
    // Keeps feet (bottom baseline) stable while shoulders & torso wrap in 3D space
    float bend = clamp(uCylinderBend, 0.0, 0.45);
    float arcTheta = nx * bend * 1.45;
    float radius = bend > 0.001 ? (uPlaneWidth / (bend * 1.45)) : 100.0;
    float cylX = bend > 0.001 ? sin(arcTheta) * radius : px;
    float cylZ = bend > 0.001 ? (cos(arcTheta) - 1.0) * radius * 0.58 : 0.0;

    // Smooth external sway rotation only (independent per-layer morph yaw runs in fragment shader with ZERO snap!)
    float cy = cos(uYawRad);
    float sy = sin(uYawRad);
    float rotX = cylX * cy + cylZ * sy;
    float rotZ = -cylX * sy + cylZ * cy;

    vCylCurveX = nx * 2.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(rotX, py, rotZ, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uCurrMap;
  uniform sampler2D uNextMap;
  uniform sampler2D uContourMap;
  uniform sampler2D uFlowMap;

  uniform float uHasMorph;
  uniform float uMorphT;
  uniform float uSwapMix;
  uniform float uContourStrength;
  uniform float uFlowStrength;
  uniform vec2 uMaxFlowUv;

  uniform float uPlaneAspect;
  uniform float uCurrTexAspect;
  uniform float uNextTexAspect;
  uniform vec2 uCurrTexel;
  uniform vec2 uNextTexel;
  uniform float uCurrMirrorX;
  uniform float uNextMirrorX;
  uniform vec2 uCurrAnchorOffset;
  uniform vec2 uNextAnchorOffset;

  uniform float uCurrYawRad;
  uniform float uNextYawRad;
  uniform float uCurrParallax;
  uniform float uNextParallax;
  uniform float uBlurAmount;

  // Physical Multi-Light Stage Uniforms
  uniform float uIsNeon;
  uniform float uRelightStrength;
  uniform float uAmbientBrightness;
  uniform vec3 uLeftRimColor;
  uniform vec3 uRightRimColor;
  uniform vec3 uKeyLightColor;
  uniform vec3 uKeyLightDir;
  uniform vec3 uAmbientTintColor;
  uniform vec3 uFloorBounceColor;
  uniform float uFloorBounceStrength;

  varying vec2 vPlaneUv;
  varying float vCylCurveX;

  // Map container plane UV -> bottom-anchored object-fit:contain screen-oriented image UV
  vec2 mapPlaneToScreenImageUv(vec2 planeUv, float planeAspect, float texAspect) {
    vec2 uv = planeUv;
    if (planeAspect > texAspect) {
      float scaleX = planeAspect / max(texAspect, 0.01);
      uv.x = (uv.x - 0.5) * scaleX + 0.5;
    } else {
      float scaleY = texAspect / max(planeAspect, 0.01);
      // Anchor strictly to bottom sole baseline (v = 0)
      uv.y = uv.y * scaleY;
    }
    return uv;
  }

  // Independent continuous 3D cylindrical Y-rotation in anchored screen-UV space (zero 28° mid-swap snap)
  vec2 applyIndependentCylinderYaw(vec2 screenUv, float yawRad) {
    if (abs(yawRad) < 0.0005) return screenUv;
    float nx = (screenUv.x - 0.5) * 2.0;
    float c = cos(yawRad);
    float s = sin(yawRad);
    float denom = max(0.62, 1.0 + s * nx * 0.22);
    float cylZ = 0.16 * max(0.0, 1.0 - nx * nx * 0.55);
    float rotNx = (nx * c - s * cylZ) / denom;
    // Keep sole baseline (v = 0.012) pinned to the floor while upper body gains 3D perspective
    float dy = screenUv.y - 0.012;
    float rotY = 0.012 + dy / mix(1.0, denom, 0.24);
    return vec2(rotNx * 0.5 + 0.5, rotY);
  }

  // Finalize anchored screen-image UV -> raw texture UV (Spine-X/Sole-Y lock + mirrorX)
  vec2 finalizeRawTexUv(vec2 screenUv, float mirrorFlag, vec2 anchorOffset) {
    vec2 uv = screenUv;
    float signedSpine = mirrorFlag > 0.5 ? -anchorOffset.x : anchorOffset.x;
    uv.x += signedSpine;
    uv.y += anchorOffset.y;
    if (mirrorFlag > 0.5) {
      uv.x = 1.0 - uv.x;
    }
    return uv;
  }

  float inBoundsMask(vec2 uv) {
    vec2 lo = step(vec2(0.0), uv);
    vec2 hi = step(uv, vec2(1.0));
    return lo.x * lo.y * hi.x * hi.y;
  }

  vec4 safeSample(sampler2D map, vec2 uv) {
    float mask = inBoundsMask(uv);
    if (mask < 0.5) return vec4(0.0);
    return texture2D(map, uv);
  }

  float calcLuma(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
  }

  /**
   * Computes procedural Pseudo-Depth (0 = outer rim, 1 = forward chest/nose/bag)
   * AND 3D surface normal N in screen space from dual-ring alpha curvature + Sobel luminance relief.
   */
  void computeDepthAndNormal(
    sampler2D map,
    vec2 uv,
    vec2 texel,
    float mirrorFlag,
    out float outDepth,
    out vec3 outNormal,
    out float outEdgeBand
  ) {
    vec2 r1 = texel * 1.25;
    vec2 r2 = texel * 2.85;
    vec2 r3 = texel * 5.20;

    float aL1 = safeSample(map, uv + vec2(-r1.x, 0.0)).a;
    float aR1 = safeSample(map, uv + vec2( r1.x, 0.0)).a;
    float aD1 = safeSample(map, uv + vec2(0.0, -r1.y)).a;
    float aU1 = safeSample(map, uv + vec2(0.0,  r1.y)).a;

    float aL2 = safeSample(map, uv + vec2(-r2.x, 0.0)).a;
    float aR2 = safeSample(map, uv + vec2( r2.x, 0.0)).a;
    float aD2 = safeSample(map, uv + vec2(0.0, -r2.y)).a;
    float aU2 = safeSample(map, uv + vec2(0.0,  r2.y)).a;

    float aTL2 = safeSample(map, uv + vec2(-r2.x,  r2.y)).a;
    float aTR2 = safeSample(map, uv + vec2( r2.x,  r2.y)).a;
    float aBL2 = safeSample(map, uv + vec2(-r2.x, -r2.y)).a;
    float aBR2 = safeSample(map, uv + vec2( r2.x, -r2.y)).a;

    float aL3 = safeSample(map, uv + vec2(-r3.x, 0.0)).a;
    float aR3 = safeSample(map, uv + vec2( r3.x, 0.0)).a;
    float aD3 = safeSample(map, uv + vec2(0.0, -r3.y)).a;
    float aU3 = safeSample(map, uv + vec2(0.0,  r3.y)).a;

    float innerAvg1 = 0.25 * (aL1 + aR1 + aD1 + aU1);
    float innerAvg2 = 0.125 * (aL2 + aR2 + aD2 + aU2 + aTL2 + aTR2 + aBL2 + aBR2);
    float innerAvg3 = 0.25 * (aL3 + aR3 + aD3 + aU3);
    float innerSmooth = clamp(innerAvg1 * 0.52 + innerAvg2 * 0.33 + innerAvg3 * 0.15, 0.0, 1.0);
    float alphaCore = clamp(innerAvg1 * 0.45 + innerAvg2 * 0.35 + innerAvg3 * 0.20, 0.0, 1.0);

    float gxA = (aL1 - aR1) * 0.50 + (aL2 - aR2) * 0.35 + (aL3 - aR3) * 0.15 + (aTL2 + aBL2 - aTR2 - aBR2) * 0.14;
    float gyA = (aD1 - aU1) * 0.50 + (aD2 - aU2) * 0.35 + (aD3 - aU3) * 0.15 + (aBL2 + aBR2 - aTL2 - aTR2) * 0.14;

    vec2 rL = texel * 1.6;
    float lL = calcLuma(safeSample(map, uv + vec2(-rL.x, 0.0)).rgb);
    float lR = calcLuma(safeSample(map, uv + vec2( rL.x, 0.0)).rgb);
    float lD = calcLuma(safeSample(map, uv + vec2(0.0, -rL.y)).rgb);
    float lU = calcLuma(safeSample(map, uv + vec2(0.0,  rL.y)).rgb);
    float lC = calcLuma(safeSample(map, uv).rgb);

    float gxL = (lL - lR) * 1.25;
    float gyL = (lD - lU) * 1.25;

    float screenFlipX = mirrorFlag > 0.5 ? -1.0 : 1.0;
    float nx = (gxA * 1.40 + gxL * 0.36) * screenFlipX + vCylCurveX * 0.18;
    float ny = (gyA * 1.05 + gyL * 0.30);
    float nz = clamp(0.48 + alphaCore * 0.52, 0.25, 1.0);

    outNormal = normalize(vec3(nx, ny, nz));
    outEdgeBand = pow(clamp(1.0 - innerSmooth, 0.0, 1.0), 2.15);
    float centralBulge = clamp(1.0 - abs(vPlaneUv.x - 0.5) * 2.2, 0.0, 1.0);
    outDepth = clamp(alphaCore * 0.62 + centralBulge * 0.20 + lC * 0.18, 0.0, 1.0);
  }

  /**
   * Samples texture with Depth-Weighted 2.5D Parallax UV Displace + 5-tap Horizontal Peak Motion Blur.
   */
  vec4 sampleWarpedLayer(
    sampler2D map,
    vec2 baseUv,
    vec2 texel,
    float mirrorFlag,
    float parallaxAmp,
    float blurPx,
    out vec3 outNormal,
    out float outEdgeBand,
    out float outDepth
  ) {
    vec4 raw = safeSample(map, baseUv);
    computeDepthAndNormal(map, baseUv, texel, mirrorFlag, outDepth, outNormal, outEdgeBand);

    float edgeSafe = smoothstep(0.08, 0.45, raw.a) * (1.0 - outEdgeBand * 0.45);
    float dirSign = mirrorFlag > 0.5 ? -1.0 : 1.0;
    float shiftU = clamp(parallaxAmp * (outDepth - 0.34), -0.016, 0.016) * edgeSafe * dirSign;
    vec2 warpedUv = baseUv + vec2(shiftU, 0.0);

    vec4 sampled;
    if (blurPx <= 0.12) {
      sampled = safeSample(map, warpedUv);
    } else {
      // Alpha-weighted 5-tap horizontal motion blur so transparent (0,0,0,0) taps never darken edges
      float stepU = texel.x * blurPx * 0.85;
      vec4 t0 = safeSample(map, warpedUv + vec2(-2.0 * stepU, 0.0));
      vec4 t1 = safeSample(map, warpedUv + vec2(-1.0 * stepU, 0.0));
      vec4 t2 = safeSample(map, warpedUv);
      vec4 t3 = safeSample(map, warpedUv + vec2( 1.0 * stepU, 0.0));
      vec4 t4 = safeSample(map, warpedUv + vec2( 2.0 * stepU, 0.0));
      float aSum = t0.a * 0.12 + t1.a * 0.22 + t2.a * 0.32 + t3.a * 0.22 + t4.a * 0.12;
      vec3 rgbSum =
        t0.rgb * (t0.a * 0.12) +
        t1.rgb * (t1.a * 0.22) +
        t2.rgb * (t2.a * 0.32) +
        t3.rgb * (t3.a * 0.22) +
        t4.rgb * (t4.a * 0.12);
      sampled = vec4(aSum > 0.001 ? rgbSum / aSum : vec3(0.0), aSum);
    }

    // Recover true foreground RGB from GPU bilinear interpolation against cleared (0,0,0,0) backdrop texels
    if (sampled.a > 0.015 && sampled.a < 0.985) {
      float unpremulDenom = mix(1.0, max(sampled.a, 0.22), smoothstep(0.98, 0.18, sampled.a) * 0.86);
      sampled.rgb = clamp(sampled.rgb / unpremulDenom, 0.0, 1.0);
    }
    return sampled;
  }

  vec3 softScreen(vec3 base, vec3 glow) {
    return vec3(1.0) - (vec3(1.0) - clamp(base, 0.0, 1.0)) * (vec3(1.0) - clamp(glow, 0.0, 0.92));
  }

  void main() {
    vec4 blended;
    vec3 N;
    float edgeBand;

    if (uHasMorph < 0.5 || uMorphT <= 0.001) {
      // Resting canonical frame: 100% crisp unwarped native AI slice
      vec2 screenUv = mapPlaneToScreenImageUv(vPlaneUv, uPlaneAspect, uCurrTexAspect);
      vec2 rawUv = finalizeRawTexUv(screenUv, uCurrMirrorX, uCurrAnchorOffset);
      float currDepth;
      blended = sampleWarpedLayer(
        uCurrMap,
        rawUv,
        uCurrTexel,
        uCurrMirrorX,
        uCurrParallax,
        uBlurAmount,
        N,
        edgeBand,
        currDepth
      );
    } else {
      // Option 1 + Option 2 Single-Pass Continuous Turnaround Morph:
      // 1) 64-band Silhouette Contour Envelope alignment (zero double-shoulder/leg edge ghosting)
      // 2) 24×36 Bidirectional Residual Optical Flow warp (interior features glide smoothly)
      // 3) Independent Per-Layer Cylindrical Perspective Yaw (zero 28° mid-transition snap!)
      float interpAspect = mix(uCurrTexAspect, uNextTexAspect, uMorphT);
      vec2 screenUv = mapPlaneToScreenImageUv(vPlaneUv, uPlaneAspect, interpAspect);

      vec2 uvA = screenUv;
      vec2 uvB = screenUv;

      if (uContourStrength > 0.01) {
        vec4 env = texture2D(uContourMap, vec2(clamp(screenUv.y, 0.008, 0.992), 0.5));
        float leftA = env.r;
        float rightA = env.g;
        float leftB = env.b;
        float rightB = env.a;
        float wA = max(0.05, rightA - leftA);
        float wB = max(0.05, rightB - leftB);
        float leftT = mix(leftA, leftB, uMorphT);
        float rightT = mix(rightA, rightB, uMorphT);
        float wT = max(0.05, rightT - leftT);

        float s = (screenUv.x - leftT) / wT;
        float insideMask = smoothstep(-0.20, 0.02, s) * (1.0 - smoothstep(0.98, 1.20, s));
        float cA = (leftA + rightA) * 0.5;
        float cB = (leftB + rightB) * 0.5;
        float cT = (leftT + rightT) * 0.5;
        float ratioA = clamp(wA / wT, 0.66, 1.52);
        float ratioB = clamp(wB / wT, 0.66, 1.52);
        float uContA = cA + (screenUv.x - cT) * ratioA;
        float uContB = cB + (screenUv.x - cT) * ratioB;
        float cw = insideMask * uContourStrength;
        uvA.x = mix(screenUv.x, uContA, cw);
        uvB.x = mix(screenUv.x, uContB, cw);
      }

      if (uFlowStrength > 0.01) {
        vec4 flowEnc = texture2D(uFlowMap, clamp(screenUv, 0.0, 1.0));
        // 128/255 = 0.50196078 decodes to exact 0.0
        vec2 flowAB = (flowEnc.rg - vec2(0.50196078)) * 2.0 * uMaxFlowUv;
        vec2 flowBA = (flowEnc.ba - vec2(0.50196078)) * 2.0 * uMaxFlowUv;
        uvA -= flowAB * (uMorphT * uFlowStrength);
        uvB -= flowBA * ((1.0 - uMorphT) * uFlowStrength);
      }

      uvA = applyIndependentCylinderYaw(uvA, uCurrYawRad);
      uvB = applyIndependentCylinderYaw(uvB, uNextYawRad);

      vec2 rawUvA = finalizeRawTexUv(uvA, uCurrMirrorX, uCurrAnchorOffset);
      vec2 rawUvB = finalizeRawTexUv(uvB, uNextMirrorX, uNextAnchorOffset);

      vec3 nA;
      float edgeA;
      float depthA;
      vec4 colA = sampleWarpedLayer(
        uCurrMap,
        rawUvA,
        uCurrTexel,
        uCurrMirrorX,
        uCurrParallax,
        uBlurAmount,
        nA,
        edgeA,
        depthA
      );

      vec3 nB;
      float edgeB;
      float depthB;
      vec4 colB = sampleWarpedLayer(
        uNextMap,
        rawUvB,
        uNextTexel,
        uNextMirrorX,
        uNextParallax,
        uBlurAmount,
        nB,
        edgeB,
        depthB
      );

      // Premultiplied-alpha aware blend preserves solid opaque torso (alpha = 1.0) with crisp halo-free edges
      float wB = clamp(uSwapMix, 0.0, 1.0);
      float wA = 1.0 - wB;
      float rawOutA = colA.a * wA + colB.a * wB;
      if (rawOutA < 0.02) discard;
      vec3 outRgb = (colA.rgb * colA.a * wA + colB.rgb * colB.a * wB) / max(rawOutA, 0.0001);
      float crispOutA = smoothstep(0.05, 0.92, rawOutA);
      if (crispOutA < 0.008) discard;
      blended = vec4(outRgb, crispOutA);
      N = normalize(mix(nA, nB, wB));
      edgeBand = mix(edgeA, edgeB, wB);
    }

    if (blended.a < 0.008) discard;

    // ── Physical Multi-Light Relighting in Linear Color Space ──
    vec3 albedo = blended.rgb;
    float luma = calcLuma(albedo);
    float strength = clamp(uRelightStrength, 0.0, 1.0);
    float neonFlag = clamp(uIsNeon, 0.0, 1.0);

    float targetExposure = mix(
      clamp(uAmbientBrightness, 0.72, 1.00),
      mix(0.76, 0.88, clamp(uAmbientBrightness - 0.12, 0.0, 1.0)),
      neonFlag * strength
    );
    vec3 lit = albedo * targetExposure;

    float highlightProtect = 1.0 - smoothstep(0.60, 0.92, luma) * 0.78;

    vec3 leftLin = uLeftRimColor;
    vec3 rightLin = uRightRimColor;
    vec3 ambLin = uAmbientTintColor;
    vec3 keyLin = uKeyLightColor;
    vec3 floorLin = uFloorBounceColor;

    float shadowWeight = clamp(1.0 - luma * 0.65, 0.16, 1.0);
    vec3 spatialNeonWash = mix(leftLin, rightLin, smoothstep(0.18, 0.82, vPlaneUv.x));
    vec3 envTint = mix(ambLin, spatialNeonWash, neonFlag);
    float tintAmount = mix(0.025, 0.22, neonFlag) * strength * shadowWeight;
    lit = mix(lit, lit * (vec3(0.58) + envTint * 0.90) + envTint * (0.024 * neonFlag), tintAmount);

    vec3 Lleft = normalize(vec3(-0.88, 0.18, 0.44));
    vec3 Lright = normalize(vec3(0.88, 0.18, 0.44));
    vec3 Lkey = normalize(uKeyLightDir);

    float ndlLeft = max(dot(N, Lleft), 0.0);
    float ndlRight = max(dot(N, Lright), 0.0);
    float ndlKey = max(dot(N, Lkey), 0.0);

    float leftSpatial = smoothstep(0.84, 0.10, vPlaneUv.x);
    float rightSpatial = smoothstep(0.16, 0.90, vPlaneUv.x);

    float fresnel = pow(clamp(1.0 - N.z, 0.0, 1.0), 2.25);
    float leftFacing = clamp(max(-N.x, 0.0) * 1.10 + leftSpatial * 0.22 * neonFlag, 0.0, 1.0);
    float rightFacing = clamp(max(N.x, 0.0) * 1.10 + rightSpatial * 0.22 * neonFlag, 0.0, 1.0);

    float innerRimMask = clamp(edgeBand * 0.72 + fresnel * 0.52, 0.0, 1.0);
    float keyBiasLeft = mix(smoothstep(0.2, -0.35, Lkey.x), 1.0, neonFlag);
    float keyBiasRight = mix(smoothstep(-0.2, 0.35, Lkey.x), 1.0, neonFlag);
    float leftRimWeight = innerRimMask * leftFacing * leftSpatial * keyBiasLeft;
    float rightRimWeight = innerRimMask * rightFacing * rightSpatial * keyBiasRight;

    float diffuseScale = mix(0.025, 0.24, neonFlag) * strength;
    vec3 sideDiffuse =
      leftLin * (ndlLeft * leftSpatial * diffuseScale * keyBiasLeft) +
      rightLin * (ndlRight * rightSpatial * diffuseScale * keyBiasRight);

    vec3 Hkey = normalize(Lkey + vec3(0.0, 0.0, 1.0));
    float keySpec = pow(max(dot(N, Hkey), 0.0), 18.0) * mix(0.02, 0.14, neonFlag) * strength * highlightProtect;
    lit += albedo * sideDiffuse + keyLin * (ndlKey * 0.015 * neonFlag * strength + keySpec * (0.25 + luma * 0.55));

    float rimIntensity = mix(0.055, 0.68, neonFlag) * strength;
    vec3 rimGlow =
      leftLin * (leftRimWeight * rimIntensity) +
      rightLin * (rightRimWeight * rimIntensity);
    lit = softScreen(lit, rimGlow * highlightProtect * (0.58 + 0.42 * (1.0 - luma * 0.35)));

    float floorMask = pow(clamp(1.0 - vPlaneUv.y / 0.28, 0.0, 1.0), 1.75);
    float underFacing = clamp(-N.y * 0.55 + 0.55, 0.12, 1.0);
    vec3 floorBounce = floorLin * (floorMask * underFacing * uFloorBounceStrength * mix(0.04, 0.38, neonFlag));
    lit = softScreen(lit, floorBounce * highlightProtect * (0.42 + 0.58 * (1.0 - luma * 0.4)));

    gl_FragColor = vec4(clamp(lit, 0.0, 1.0), blended.a);
    #include <colorspace_fragment>
  }
`;

function createNeutralContourTexture(): THREE.DataTexture {
  const data = new Uint8Array(MORPH_SILHOUETTE_BANDS * 4);
  for (let i = 0; i < MORPH_SILHOUETTE_BANDS; i += 1) {
    const o = i * 4;
    data[o] = 77;
    data[o + 1] = 179;
    data[o + 2] = 77;
    data[o + 3] = 179;
  }
  const tex = new THREE.DataTexture(data, MORPH_SILHOUETTE_BANDS, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function createNeutralFlowTexture(): THREE.DataTexture {
  const data = new Uint8Array(MORPH_FLOW_W * MORPH_FLOW_H * 4);
  data.fill(128);
  const tex = new THREE.DataTexture(data, MORPH_FLOW_W, MORPH_FLOW_H, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export default function StudioCharacterRelightCanvas({
  imageUrl,
  angleDeg,
  mirrorX,
  identityKey,
  angleSlices = null,
  continuousAngleDeg,
  isLiveScrubbing = false,
  lightingFrame = null,
  externalYawDeg = 0,
  kineticBlurPx = 0,
  widthPx = null,
  heightPx = null,
  transformOrigin = '50% 98%',
  transformStyle = 'none',
  prefersReducedMotion = false,
  className = '',
  onWebGlReadyChange,
}: StudioCharacterRelightCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onReadyChangeRef = useRef(onWebGlReadyChange);

  const propsRef = useRef({
    imageUrl,
    angleDeg,
    mirrorX,
    identityKey,
    angleSlices,
    continuousAngleDeg,
    isLiveScrubbing,
    lightingFrame,
    externalYawDeg,
    kineticBlurPx,
    widthPx,
    heightPx,
    prefersReducedMotion,
  });

  useLayoutEffect(() => {
    onReadyChangeRef.current = onWebGlReadyChange;
    propsRef.current = {
      imageUrl,
      angleDeg,
      mirrorX,
      identityKey,
      angleSlices,
      continuousAngleDeg,
      isLiveScrubbing,
      lightingFrame,
      externalYawDeg,
      kineticBlurPx,
      widthPx,
      heightPx,
      prefersReducedMotion,
    };
  });

  const controllerRef = useRef<{
    syncScene: () => void;
    syncSize: () => void;
    requestRender: () => void;
  } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || typeof window === 'undefined') return;

    const isSoftwareGl = detectSoftwareWebGl();
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: !isSoftwareGl,
        premultipliedAlpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
    } catch {
      onReadyChangeRef.current?.(false);
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));

    const canvas = renderer.domElement;
    canvas.className = 'studio-character-relight-webgl-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    mount.innerHTML = '';
    mount.appendChild(canvas);

    const scene = new THREE.Scene();
    const fovDeg = 28;
    const halfFovRad = (fovDeg * 0.5 * Math.PI) / 180;
    const camZ = 0.5 / Math.tan(halfFovRad);
    const camera = new THREE.PerspectiveCamera(fovDeg, 1, 0.1, 20);
    camera.position.set(0, 0, camZ);
    camera.lookAt(0, 0, 0);

    const blankData = new Uint8Array([0, 0, 0, 0]);
    const blankTex = new THREE.DataTexture(blankData, 1, 1, THREE.RGBAFormat);
    blankTex.colorSpace = THREE.SRGBColorSpace;
    blankTex.needsUpdate = true;
    const neutralContourTex = createNeutralContourTexture();
    const neutralFlowTex = createNeutralFlowTexture();

    const geometry = new THREE.PlaneGeometry(1, 1, 32, 44);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.FrontSide,
      uniforms: {
        uPlaneWidth: { value: 1 },
        uYawRad: { value: 0 },
        uCylinderBend: { value: 0.12 },

        uCurrMap: { value: blankTex },
        uNextMap: { value: blankTex },
        uContourMap: { value: neutralContourTex },
        uFlowMap: { value: neutralFlowTex },

        uHasMorph: { value: 0 },
        uMorphT: { value: 0 },
        uSwapMix: { value: 0 },
        uContourStrength: { value: 0.85 },
        uFlowStrength: { value: 0.88 },
        uMaxFlowUv: { value: new THREE.Vector2(MORPH_MAX_FLOW_U, MORPH_MAX_FLOW_V) },

        uPlaneAspect: { value: 0.75 },
        uCurrTexAspect: { value: 0.75 },
        uNextTexAspect: { value: 0.75 },
        uCurrTexel: { value: new THREE.Vector2(1 / 512, 1 / 680) },
        uNextTexel: { value: new THREE.Vector2(1 / 512, 1 / 680) },
        uCurrMirrorX: { value: 0 },
        uNextMirrorX: { value: 0 },
        uCurrAnchorOffset: { value: new THREE.Vector2(0, 0) },
        uNextAnchorOffset: { value: new THREE.Vector2(0, 0) },

        uCurrYawRad: { value: 0 },
        uNextYawRad: { value: 0 },
        uCurrParallax: { value: 0 },
        uNextParallax: { value: 0 },
        uBlurAmount: { value: 0 },

        uIsNeon: { value: 0 },
        uRelightStrength: { value: 0.25 },
        uAmbientBrightness: { value: 1 },
        uLeftRimColor: { value: new THREE.Color(0xffffff) },
        uRightRimColor: { value: new THREE.Color(0xffffff) },
        uKeyLightColor: { value: new THREE.Color(0xffffff) },
        uKeyLightDir: { value: new THREE.Vector3(-0.35, 0.55, 0.75) },
        uAmbientTintColor: { value: new THREE.Color(0xdbe3ee) },
        uFloorBounceColor: { value: new THREE.Color(0xffffff) },
        uFloorBounceStrength: { value: 0.12 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const textureCache = new Map<string, CachedTextureEntry>();
    const pairMorphCache = new Map<string, PairMorphGpuEntry>();
    const inflightUrls = new Set<string>();
    const prewarmTimers: number[] = [];

    let disposed = false;
    let contextLost = false;
    let hasReadyTexture = false;
    let activeIdentity = propsRef.current.identityKey;
    let fallbackEntry: CachedTextureEntry | null = null;
    let renderedContinuousDeg =
      typeof propsRef.current.continuousAngleDeg === 'number' &&
      Number.isFinite(propsRef.current.continuousAngleDeg)
        ? propsRef.current.continuousAngleDeg
        : propsRef.current.angleDeg;
    let smoothedExternalYawDeg = 0;

    let frameId = 0;
    let timeoutId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTickMs = performance.now();

    const clearPrewarmTimers = () => {
      while (prewarmTimers.length > 0) {
        const id = prewarmTimers.pop();
        if (id !== undefined) window.clearTimeout(id);
      }
    };

    const getActiveSliceUrlsSet = (): Set<string> => {
      const activeUrls = new Set<string>();
      const curUrl = propsRef.current.imageUrl;
      if (curUrl) activeUrls.add(curUrl);
      const slices = propsRef.current.angleSlices;
      if (slices) {
        for (const deg of CANONICAL_TURNAROUND_ANGLES) {
          const u = slices[deg];
          if (u) activeUrls.add(u);
        }
      }
      return activeUrls;
    };

    const evictOldTextures = () => {
      if (textureCache.size <= MAX_CACHED_TEXTURES) return;
      const activeUrls = getActiveSliceUrlsSet();
      const entries = [...textureCache.values()].sort((a, b) => a.lastUsedAt - b.lastUsedAt);
      for (const entry of entries) {
        if (textureCache.size <= MAX_CACHED_TEXTURES) break;
        if (entry === fallbackEntry || activeUrls.has(entry.url)) continue;
        entry.texture.dispose();
        textureCache.delete(entry.url);
      }
    };

    const evictOldPairMorphs = () => {
      if (pairMorphCache.size <= MAX_CACHED_PAIR_MORPHS) return;
      const entries = [...pairMorphCache.values()].sort((a, b) => a.lastUsedAt - b.lastUsedAt);
      for (const entry of entries) {
        if (pairMorphCache.size <= MAX_CACHED_PAIR_MORPHS) break;
        entry.contourTex.dispose();
        entry.flowTex.dispose();
        pairMorphCache.delete(entry.key);
      }
    };

    const getOrCreatePairMorph = (
      entryA: CachedTextureEntry,
      mirrorA: boolean,
      entryB: CachedTextureEntry,
      mirrorB: boolean
    ): PairMorphGpuEntry => {
      const key = `${entryA.url}::${mirrorA ? 1 : 0}-->${entryB.url}::${mirrorB ? 1 : 0}`;
      const existing = pairMorphCache.get(key);
      if (existing) {
        existing.lastUsedAt = performance.now();
        return existing;
      }

      const frameA = getMorphFrameForMirror(entryA, mirrorA);
      const frameB = getMorphFrameForMirror(entryB, mirrorB);
      const field = computePairwiseMorphField(frameA, frameB);

      const contourTex = new THREE.DataTexture(
        field.contourRgba,
        field.contourWidth,
        1,
        THREE.RGBAFormat
      );
      contourTex.minFilter = THREE.LinearFilter;
      contourTex.magFilter = THREE.LinearFilter;
      contourTex.wrapS = THREE.ClampToEdgeWrapping;
      contourTex.wrapT = THREE.ClampToEdgeWrapping;
      contourTex.generateMipmaps = false;
      contourTex.needsUpdate = true;

      const flowTex = new THREE.DataTexture(
        field.flowRgba,
        field.flowWidth,
        field.flowHeight,
        THREE.RGBAFormat
      );
      flowTex.minFilter = THREE.LinearFilter;
      flowTex.magFilter = THREE.LinearFilter;
      flowTex.wrapS = THREE.ClampToEdgeWrapping;
      flowTex.wrapT = THREE.ClampToEdgeWrapping;
      flowTex.generateMipmaps = false;
      flowTex.needsUpdate = true;

      const created: PairMorphGpuEntry = {
        key,
        contourTex,
        flowTex,
        lastUsedAt: performance.now(),
      };
      pairMorphCache.set(key, created);
      evictOldPairMorphs();
      return created;
    };

    const scheduleAdjacentPairPrewarm = () => {
      if (disposed || contextLost) return;
      const slices = propsRef.current.angleSlices;
      if (!slices) return;
      clearPrewarmTimers();

      // Stagger pairwise optical flow precomputation across micro-slices (~2ms each)
      // so the main thread remains 100% responsive and every subsequent 360° turn is instant.
      for (let i = 0; i < CANONICAL_TURNAROUND_ANGLES.length; i += 1) {
        const angA = CANONICAL_TURNAROUND_ANGLES[i];
        const angB = CANONICAL_TURNAROUND_ANGLES[(i + 1) % CANONICAL_TURNAROUND_ANGLES.length];
        const urlA = slices[angA];
        const urlB = slices[angB];
        if (!urlA || !urlB || urlA === urlB) continue;
        const entryA = textureCache.get(urlA);
        const entryB = textureCache.get(urlB);
        if (!entryA || !entryB) continue;
        const pairKey = `${urlA}::0-->${urlB}::0`;
        if (pairMorphCache.has(pairKey)) continue;

        const timerId = window.setTimeout(() => {
          if (disposed || contextLost) return;
          if (!textureCache.has(urlA) || !textureCache.has(urlB)) return;
          getOrCreatePairMorph(entryA, false, entryB, false);
        }, 12 + i * 16);
        prewarmTimers.push(timerId);
      }
    };

    const syncSize = () => {
      if (disposed || !renderer || !mount) return;
      const rect = mount.getBoundingClientRect();
      const cssW = Math.max(2, Math.round(propsRef.current.widthPx || rect.width || 320));
      const cssH = Math.max(2, Math.round(propsRef.current.heightPx || rect.height || 480));
      const aspect = cssW / cssH;
      renderer.setSize(cssW, cssH, false);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      material.uniforms.uPlaneWidth.value = aspect;
      material.uniforms.uPlaneAspect.value = aspect;
    };

    const applyLightingUniforms = () => {
      const frame = propsRef.current.lightingFrame;
      if (!frame) {
        material.uniforms.uIsNeon.value = 0;
        material.uniforms.uRelightStrength.value = 0.14;
        material.uniforms.uAmbientBrightness.value = 1;
        material.uniforms.uFloorBounceStrength.value = 0.08;
        return;
      }
      material.uniforms.uIsNeon.value = frame.isNeonScene ? 1 : 0;
      material.uniforms.uRelightStrength.value =
        typeof frame.characterRelightStrength === 'number' ? frame.characterRelightStrength : 0.25;
      material.uniforms.uAmbientBrightness.value =
        typeof frame.characterAmbientBrightness === 'number'
          ? frame.characterAmbientBrightness
          : 1;

      _colorLeft.setHex(frame.characterLeftRimHex ?? frame.fixtureHex ?? frame.rimHex ?? 0xffffff);
      _colorRight.setHex(frame.characterRightRimHex ?? frame.rimHex ?? frame.keyHex ?? 0xffffff);
      _colorKey.setHex(frame.keyHex ?? 0xffffff);
      _colorAmbient.setHex(frame.characterAmbientTintHex ?? frame.skyHex ?? 0xd8e0ec);
      _colorFloor.setHex(frame.characterFloorBounceHex ?? frame.floorPoolHex ?? 0xffffff);

      material.uniforms.uLeftRimColor.value.copy(_colorLeft);
      material.uniforms.uRightRimColor.value.copy(_colorRight);
      material.uniforms.uKeyLightColor.value.copy(_colorKey);
      material.uniforms.uAmbientTintColor.value.copy(_colorAmbient);
      material.uniforms.uFloorBounceColor.value.copy(_colorFloor);
      material.uniforms.uFloorBounceStrength.value =
        typeof frame.characterFloorBounceStrength === 'number'
          ? frame.characterFloorBounceStrength
          : 0.12;

      _keyDir
        .set(
          frame.keyPosX ?? -1.2,
          Math.max(0.4, (frame.keyPosY ?? 2.8) * 0.45),
          Math.max(0.8, frame.keyPosZ ?? 1.8)
        )
        .normalize();
      material.uniforms.uKeyLightDir.value.copy(_keyDir);
    };

    const loadTextureUrl = (url: string | null, isPrimary: boolean) => {
      if (!url) {
        if (isPrimary && hasReadyTexture && !fallbackEntry) {
          hasReadyTexture = false;
          onReadyChangeRef.current?.(false);
        }
        return;
      }

      const cached = textureCache.get(url);
      if (cached) {
        cached.lastUsedAt = performance.now();
        if (isPrimary) {
          fallbackEntry = cached;
          if (!hasReadyTexture) {
            hasReadyTexture = true;
            onReadyChangeRef.current?.(true);
          }
          requestRender();
        }
        return;
      }

      if (inflightUrls.has(url)) return;
      inflightUrls.add(url);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => {
        inflightUrls.delete(url);
        if (disposed || contextLost) return;
        const nw = img.naturalWidth || img.width;
        const nh = img.naturalHeight || img.height;
        if (!nw || !nh) return;

        const tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;

        const morphFrameRaw = analyzeTurnaroundImage(img, false);
        const entry: CachedTextureEntry = {
          url,
          texture: tex,
          aspect: nw / nh,
          texWidth: nw,
          texHeight: nh,
          anchor: morphFrameRaw.anchor,
          morphFrameRaw,
          morphFrameMirrored: null,
          lastUsedAt: performance.now(),
        };
        textureCache.set(url, entry);
        evictOldTextures();

        if (propsRef.current.imageUrl === url || !fallbackEntry) {
          fallbackEntry = entry;
          if (!hasReadyTexture) {
            hasReadyTexture = true;
            onReadyChangeRef.current?.(true);
          }
        }
        scheduleAdjacentPairPrewarm();
        requestRender();
      };
      img.onerror = () => {
        inflightUrls.delete(url);
      };
      img.src = url;
    };

    const preloadAllAngleSlices = () => {
      const p = propsRef.current;
      // Load active primary slice first so first paint is instantaneous
      loadTextureUrl(p.imageUrl, true);
      const slices = p.angleSlices;
      if (!slices) return;

      // Prioritize current angle, immediate ±45° neighbors, then remaining 5 angles
      const curIdx = Math.max(
        0,
        CANONICAL_TURNAROUND_ANGLES.indexOf(
          (((Math.round(p.angleDeg / 45) * 45) % 360) + 360) % 360 as TurnaroundAngle360
        )
      );
      const ordered: TurnaroundAngle360[] = [];
      for (let step = 0; step <= 4; step += 1) {
        const right = CANONICAL_TURNAROUND_ANGLES[(curIdx + step) % 8];
        if (!ordered.includes(right)) ordered.push(right);
        const left = CANONICAL_TURNAROUND_ANGLES[(curIdx - step + 8) % 8];
        if (!ordered.includes(left)) ordered.push(left);
      }
      for (const deg of ordered) {
        const sliceUrl = slices[deg];
        if (sliceUrl && sliceUrl !== p.imageUrl) {
          loadTextureUrl(sliceUrl, false);
        }
      }
    };

    const afterDraw = (cb: () => void) => {
      if (!renderer || disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (state === gl.UNSIGNALED) {
            timeoutId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            timeoutId = window.setTimeout(cb, 70);
          }
        };
        timeoutId = window.setTimeout(poll, 5);
      } else {
        timeoutId = window.setTimeout(cb, 70);
      }
    };

    const drawFrame = (nowMs: number): boolean => {
      if (disposed || contextLost || !renderer) return false;

      const p = propsRef.current;
      const dtSec = Math.min(0.05, Math.max(0.001, (nowMs - lastTickMs) / 1000));
      lastTickMs = nowMs;

      const targetContinuousDeg =
        typeof p.continuousAngleDeg === 'number' && Number.isFinite(p.continuousAngleDeg)
          ? p.continuousAngleDeg
          : p.angleDeg;

      // Snap immediately on outfit/avatar change so we never morph two completely different outfits
      if (activeIdentity !== p.identityKey) {
        activeIdentity = p.identityKey;
        renderedContinuousDeg = targetContinuousDeg;
      }

      const angleStep = stepContinuousTurnaroundAngle({
        currentDeg: renderedContinuousDeg,
        targetDeg: targetContinuousDeg,
        dtSec,
        isLiveScrubbing: Boolean(p.isLiveScrubbing),
        reducedMotion: Boolean(p.prefersReducedMotion),
      });
      renderedContinuousDeg = angleStep.nextDeg;

      // Collect all canonical angles whose GPU textures are already loaded for the current outfit
      const loadedAngleEntries = new Map<TurnaroundAngle360, CachedTextureEntry>();
      const slices = p.angleSlices;
      if (slices) {
        for (const deg of CANONICAL_TURNAROUND_ANGLES) {
          const u = slices[deg];
          if (!u) continue;
          const entry = textureCache.get(u);
          if (entry) {
            loadedAngleEntries.set(deg, entry);
          }
        }
      }
      // Always register active imageUrl under its canonical angleDeg as fallback
      const primaryEntry = (p.imageUrl ? textureCache.get(p.imageUrl) : null) || fallbackEntry;
      if (!primaryEntry && loadedAngleEntries.size === 0) {
        return false;
      }
      const normPropAngle = ((((Math.round(p.angleDeg / 45) * 45) % 360) + 360) %
        360) as TurnaroundAngle360;
      if (primaryEntry && !loadedAngleEntries.has(normPropAngle)) {
        loadedAngleEntries.set(normPropAngle, primaryEntry);
      }

      const loadedAngles = Array.from(loadedAngleEntries.keys());
      const pair = resolveContinuousTurnaroundPair(renderedContinuousDeg, loadedAngles);
      const entryA = loadedAngleEntries.get(pair.angleA) || primaryEntry;
      const entryB = loadedAngleEntries.get(pair.angleB) || entryA;
      if (!entryA || !entryB) return false;

      entryA.lastUsedAt = nowMs;
      entryB.lastUsedAt = nowMs;

      const mirrorA = pair.angleA === normPropAngle ? Boolean(p.mirrorX) : false;
      const mirrorB = pair.angleB === normPropAngle ? Boolean(p.mirrorX) : false;
      const canMorphBetweenDistinct =
        !p.prefersReducedMotion &&
        !pair.isExactCanonical &&
        (entryA.url !== entryB.url || mirrorA !== mirrorB);

      applyLightingUniforms();

      // Gentle external sway (zero sudden sign flip!)
      const rawExtYaw = p.prefersReducedMotion
        ? 0
        : Math.max(
            -EXTERNAL_SWAY_MAX_YAW_DEG,
            Math.min(EXTERNAL_SWAY_MAX_YAW_DEG, (p.externalYawDeg || 0) * 0.55)
          );
      smoothedExternalYawDeg = THREE.MathUtils.damp(
        smoothedExternalYawDeg,
        canMorphBetweenDistinct ? rawExtYaw * 0.35 : rawExtYaw,
        18,
        dtSec
      );
      if (Math.abs(smoothedExternalYawDeg - rawExtYaw) < 0.04 && !canMorphBetweenDistinct) {
        smoothedExternalYawDeg = rawExtYaw;
      }

      material.uniforms.uCurrMap.value = entryA.texture;
      material.uniforms.uCurrTexAspect.value = entryA.aspect;
      material.uniforms.uCurrTexel.value.set(1 / entryA.texWidth, 1 / entryA.texHeight);
      material.uniforms.uCurrMirrorX.value = mirrorA ? 1 : 0;
      material.uniforms.uCurrAnchorOffset.value.set(
        entryA.anchor.spineOffsetU,
        entryA.anchor.soleOffsetV
      );

      let morphBlurPx = 0;
      if (canMorphBetweenDistinct) {
        const pairMorph = getOrCreatePairMorph(entryA, mirrorA, entryB, mirrorB);
        const yaws = computeIndependentLayerYaws(pair.t, pair.directionSign, LAYER_MORPH_MAX_YAW_DEG);

        // Scale down contour/flow intensity slightly if progressive load bridges >45° gaps (e.g. 90°+)
        const spanScale = pair.spanDeg <= 50 ? 1.0 : Math.max(0.35, 45 / pair.spanDeg);
        material.uniforms.uNextMap.value = entryB.texture;
        material.uniforms.uNextTexAspect.value = entryB.aspect;
        material.uniforms.uNextTexel.value.set(1 / entryB.texWidth, 1 / entryB.texHeight);
        material.uniforms.uNextMirrorX.value = mirrorB ? 1 : 0;
        material.uniforms.uNextAnchorOffset.value.set(
          entryB.anchor.spineOffsetU,
          entryB.anchor.soleOffsetV
        );
        material.uniforms.uContourMap.value = pairMorph.contourTex;
        material.uniforms.uFlowMap.value = pairMorph.flowTex;

        material.uniforms.uHasMorph.value = 1;
        material.uniforms.uMorphT.value = pair.t;
        material.uniforms.uSwapMix.value = yaws.swapMix;
        material.uniforms.uContourStrength.value = 0.86 * spanScale;
        material.uniforms.uFlowStrength.value = 0.88 * spanScale;

        material.uniforms.uCurrYawRad.value = (yaws.yawADeg * Math.PI) / 180;
        material.uniforms.uNextYawRad.value = (yaws.yawBDeg * Math.PI) / 180;
        material.uniforms.uCurrParallax.value =
          (yaws.yawADeg / LAYER_MORPH_MAX_YAW_DEG) * (MAX_PARALLAX_UV * 0.65);
        material.uniforms.uNextParallax.value =
          (yaws.yawBDeg / LAYER_MORPH_MAX_YAW_DEG) * (MAX_PARALLAX_UV * 0.65);

        // Subtle kinetic horizontal blur ONLY when spinning swiftly (stay crisp during slow scrub!)
        const internalBlur = computeDirectionalBlurPx(angleStep.velocityDegPerSec, false);
        morphBlurPx = Math.min(3.2, internalBlur * (0.45 + 0.55 * yaws.morphBlurFactor));
      } else {
        material.uniforms.uHasMorph.value = 0;
        material.uniforms.uMorphT.value = 0;
        material.uniforms.uSwapMix.value = 0;
        material.uniforms.uCurrYawRad.value = 0;
        material.uniforms.uNextYawRad.value = 0;
        material.uniforms.uCurrParallax.value =
          (smoothedExternalYawDeg / EXTERNAL_SWAY_MAX_YAW_DEG) * (MAX_PARALLAX_UV * 0.6);
        material.uniforms.uNextParallax.value = 0;
      }

      const extBlur = p.prefersReducedMotion ? 0 : Math.min(4.8, p.kineticBlurPx || 0);
      const swayMag = Math.abs(smoothedExternalYawDeg) / EXTERNAL_SWAY_MAX_YAW_DEG;
      const morphCurvatureBoost = canMorphBetweenDistinct
        ? Math.sin(pair.t * Math.PI) * 0.14
        : 0;
      material.uniforms.uYawRad.value = (smoothedExternalYawDeg * Math.PI) / 180;
      material.uniforms.uCylinderBend.value = 0.06 + swayMag * 0.22 + morphCurvatureBoost;
      material.uniforms.uBlurAmount.value = Math.max(morphBlurPx, extBlur);

      renderer.render(scene, camera);

      const extYawMoving = Math.abs(smoothedExternalYawDeg - rawExtYaw) >= 0.04;
      return !angleStep.settled || extYawMoving;
    };

    const requestRender = () => {
      if (disposed || contextLost) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = window.requestAnimationFrame((nowMs) => {
        renderDirty = false;
        const needsMore = drawFrame(nowMs);
        const done = () => {
          renderBusy = false;
          if (!disposed && (renderDirty || needsMore)) {
            requestRender();
          }
        };
        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    };

    const syncScene = () => {
      if (disposed || contextLost) return;
      preloadAllAngleSlices();
      scheduleAdjacentPairPrewarm();
      requestRender();
    };

    controllerRef.current = { syncScene, syncSize, requestRender };

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      hasReadyTexture = false;
      onReadyChangeRef.current?.(false);
    };
    const handleContextRestored = () => {
      contextLost = false;
      syncSize();
      syncScene();
    };

    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            syncSize();
            requestRender();
          })
        : null;
    resizeObserver?.observe(mount);

    syncSize();
    syncScene();

    return () => {
      disposed = true;
      controllerRef.current = null;
      clearPrewarmTimers();
      if (frameId) window.cancelAnimationFrame(frameId);
      if (timeoutId) window.clearTimeout(timeoutId);
      resizeObserver?.disconnect();
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);

      for (const entry of textureCache.values()) {
        entry.texture.dispose();
      }
      textureCache.clear();
      for (const pair of pairMorphCache.values()) {
        pair.contourTex.dispose();
        pair.flowTex.dispose();
      }
      pairMorphCache.clear();
      blankTex.dispose();
      neutralContourTex.dispose();
      neutralFlowTex.dispose();
      geometry.dispose();
      material.dispose();
      renderer?.dispose();
      if (mount) {
        mount.innerHTML = '';
      }
      onReadyChangeRef.current?.(false);
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.syncScene();
  }, [imageUrl, angleDeg, mirrorX, identityKey, angleSlices]);

  useEffect(() => {
    controllerRef.current?.requestRender();
  }, [
    continuousAngleDeg,
    isLiveScrubbing,
    lightingFrame,
    externalYawDeg,
    kineticBlurPx,
    prefersReducedMotion,
  ]);

  useEffect(() => {
    controllerRef.current?.syncSize();
    controllerRef.current?.requestRender();
  }, [widthPx, heightPx]);

  return (
    <div
      ref={mountRef}
      className={`studio-character-relight-host ${className}`.trim()}
      data-character-relight-webgl="true"
      data-turnaround-morph="dual-flow"
      aria-hidden="true"
      style={{
        width: widthPx ? `${widthPx}px` : '100%',
        height: heightPx ? `${heightPx}px` : '100%',
        transformOrigin,
        transform: transformStyle,
      }}
    />
  );
}
