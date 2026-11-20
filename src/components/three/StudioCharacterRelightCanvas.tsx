import React, { useEffect, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import type { StageLightingFrame } from '../../utils/stageLightingEngine.ts';
import { shortestAngleDeltaDeg } from '../../utils/turnaroundPhysics.ts';

export interface StudioCharacterRelightCanvasProps {
  imageUrl: string | null;
  angleDeg: number;
  mirrorX: boolean;
  identityKey: string;
  lightingFrame?: StageLightingFrame | null;
  /** External continuous yaw offset in degrees (drag + scroll scrub residual) */
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

interface SpineSoleAnchor {
  /** Offset from 0.5 center in normalized texture U space (clamped) */
  spineOffsetU: number;
  /** Offset from bottom baseline in normalized texture V space (clamped) */
  soleOffsetV: number;
}

interface CachedTextureEntry {
  url: string;
  texture: THREE.Texture;
  aspect: number;
  texWidth: number;
  texHeight: number;
  anchor: SpineSoleAnchor;
  lastUsedAt: number;
}

const MAX_CACHED_TEXTURES = 10;
const CYLINDER_MAX_YAW_DEG = 14;
const SWAP_DURATION_MS = 165;
const MAX_PARALLAX_UV = 0.0165;

// Reusable module-scope helpers (zero GC inside animation / render callbacks)
const _colorLeft = new THREE.Color();
const _colorRight = new THREE.Color();
const _colorKey = new THREE.Color();
const _colorAmbient = new THREE.Color();
const _colorFloor = new THREE.Color();
const _keyDir = new THREE.Vector3();

let cachedIsSoftwareGl: boolean | null = null;

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
 * Lightweight (<2ms) single-pass offscreen scan to lock Spine-X (torso center of mass)
 * and Sole-Y (lowest opaque shoe pixel) so all 8 turnaround frames rotate cleanly around
 * one stable anatomical axis without lateral jitter.
 */
function measureSpineAndSoleAnchor(img: HTMLImageElement): SpineSoleAnchor {
  if (typeof document === 'undefined') {
    return { spineOffsetU: 0, soleOffsetV: 0 };
  }
  try {
    const scanW = 96;
    const scanH = 128;
    const canvas = document.createElement('canvas');
    canvas.width = scanW;
    canvas.height = scanH;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { spineOffsetU: 0, soleOffsetV: 0 };
    ctx.clearRect(0, 0, scanW, scanH);
    ctx.drawImage(img, 0, 0, scanW, scanH);
    const data = ctx.getImageData(0, 0, scanW, scanH).data;

    // Spine-X: torso band (y = 18%..62%) alpha-weighted horizontal center
    const yStart = Math.floor(scanH * 0.18);
    const yEnd = Math.floor(scanH * 0.62);
    let weightedX = 0;
    let totalWeight = 0;
    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = 0; x < scanW; x += 1) {
        const a = data[(y * scanW + x) * 4 + 3];
        if (a > 36) {
          const w = a / 255;
          weightedX += ((x + 0.5) / scanW) * w;
          totalWeight += w;
        }
      }
    }
    const spineU = totalWeight > 12 ? weightedX / totalWeight : 0.5;

    // Sole-Y: scan upward from bottom to find shoe ground contact baseline
    let lowestRow = scanH - 1;
    let foundSole = false;
    for (let y = scanH - 1; y >= Math.floor(scanH * 0.72); y -= 1) {
      let rowOpaque = 0;
      for (let x = 0; x < scanW; x += 1) {
        if (data[(y * scanW + x) * 4 + 3] > 64) {
          rowOpaque += 1;
        }
      }
      if (rowOpaque >= 3) {
        lowestRow = y;
        foundSole = true;
        break;
      }
    }

    // Texture UV has V=0 at bottom, V=1 at top; target sole near V = 0.012
    const soleVFromBottom = foundSole ? (scanH - 1 - lowestRow) / scanH : 0.012;
    const rawSpineOffset = spineU - 0.5;
    const rawSoleOffset = soleVFromBottom - 0.012;

    return {
      spineOffsetU: Math.max(-0.045, Math.min(0.045, rawSpineOffset)),
      soleOffsetV: Math.max(-0.035, Math.min(0.035, rawSoleOffset)),
    };
  } catch {
    return { spineOffsetU: 0, soleOffsetV: 0 };
  }
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
    float bend = clamp(uCylinderBend, 0.0, 0.55);
    float arcTheta = nx * bend * 1.45;
    float radius = bend > 0.001 ? (uPlaneWidth / (bend * 1.45)) : 100.0;
    float cylX = bend > 0.001 ? sin(arcTheta) * radius : px;
    float cylZ = bend > 0.001 ? (cos(arcTheta) - 1.0) * radius * 0.58 : 0.0;

    // Rotate curved cylinder slice around spine Y-axis (±14 deg peak)
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
  uniform sampler2D uPrevMap;
  uniform float uHasPrev;
  uniform float uSwapMix;

  uniform float uPlaneAspect;
  uniform float uCurrTexAspect;
  uniform float uPrevTexAspect;
  uniform vec2 uCurrTexel;
  uniform vec2 uPrevTexel;
  uniform float uCurrMirrorX;
  uniform float uPrevMirrorX;
  uniform vec2 uCurrAnchorOffset;
  uniform vec2 uPrevAnchorOffset;

  uniform float uCurrParallax;
  uniform float uPrevParallax;
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

  // Map container plane UV -> bottom-anchored object-fit:contain texture UV
  vec2 mapContainedUv(vec2 planeUv, float planeAspect, float texAspect, float mirrorFlag, vec2 anchorOffset) {
    vec2 uv = planeUv;
    if (planeAspect > texAspect) {
      float scaleX = planeAspect / max(texAspect, 0.01);
      uv.x = (uv.x - 0.5) * scaleX + 0.5;
    } else {
      float scaleY = texAspect / max(planeAspect, 0.01);
      // Anchor strictly to bottom sole baseline (v = 0)
      uv.y = uv.y * scaleY;
    }

    // Apply Spine-X & Sole-Y lock in texture space
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
    // 2-ring alpha SDF gradient (gives silky smooth rounded 3D silhouette curvature)
    vec2 r1 = texel * 2.8;
    vec2 r2 = texel * 8.0;

    float aL1 = safeSample(map, uv + vec2(-r1.x, 0.0)).a;
    float aR1 = safeSample(map, uv + vec2( r1.x, 0.0)).a;
    float aD1 = safeSample(map, uv + vec2(0.0, -r1.y)).a;
    float aU1 = safeSample(map, uv + vec2(0.0,  r1.y)).a;

    float aL2 = safeSample(map, uv + vec2(-r2.x, 0.0)).a;
    float aR2 = safeSample(map, uv + vec2( r2.x, 0.0)).a;
    float aD2 = safeSample(map, uv + vec2(0.0, -r2.y)).a;
    float aU2 = safeSample(map, uv + vec2(0.0,  r2.y)).a;

    float aTL = safeSample(map, uv + vec2(-r2.x,  r2.y)).a;
    float aTR = safeSample(map, uv + vec2( r2.x,  r2.y)).a;
    float aBL = safeSample(map, uv + vec2(-r2.x, -r2.y)).a;
    float aBR = safeSample(map, uv + vec2( r2.x, -r2.y)).a;

    float innerAvg1 = 0.25 * (aL1 + aR1 + aD1 + aU1);
    float innerAvg2 = 0.125 * (aL2 + aR2 + aD2 + aU2 + aTL + aTR + aBL + aBR);
    float alphaCore = clamp(innerAvg1 * 0.45 + innerAvg2 * 0.55, 0.0, 1.0);

    // Outward-facing silhouette normal in texture space
    float gxA = (aL1 - aR1) * 0.55 + (aL2 - aR2) * 0.45 + (aTL + aBL - aTR - aBR) * 0.22;
    float gyA = (aD1 - aU1) * 0.55 + (aD2 - aU2) * 0.45 + (aBL + aBR - aTL - aTR) * 0.22;

    // Micro fold / facial / lapel relief via luminance gradient
    vec2 rL = texel * 1.8;
    float lL = calcLuma(safeSample(map, uv + vec2(-rL.x, 0.0)).rgb);
    float lR = calcLuma(safeSample(map, uv + vec2( rL.x, 0.0)).rgb);
    float lD = calcLuma(safeSample(map, uv + vec2(0.0, -rL.y)).rgb);
    float lU = calcLuma(safeSample(map, uv + vec2(0.0,  rL.y)).rgb);
    float lC = calcLuma(safeSample(map, uv).rgb);

    float gxL = (lL - lR) * 1.45;
    float gyL = (lD - lU) * 1.45;

    // Flip X normal back to screen space if texture is horizontally mirrored
    float screenFlipX = mirrorFlag > 0.5 ? -1.0 : 1.0;
    float nx = (gxA * 1.55 + gxL * 0.42) * screenFlipX + vCylCurveX * 0.24;
    float ny = (gyA * 1.15 + gyL * 0.35);
    float nz = clamp(0.42 + alphaCore * 0.58, 0.22, 1.0);

    outNormal = normalize(vec3(nx, ny, nz));
    outEdgeBand = clamp(1.0 - innerAvg2, 0.0, 1.0);
    // Depth combines silhouette volume + torso/head central bulge + luminance highlight relief
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

    // Safe 2.5D parallax shift: forward regions (nose/chest/bag) glide faster, edges fade smoothly
    float edgeSafe = smoothstep(0.08, 0.45, raw.a) * (1.0 - outEdgeBand * 0.45);
    float dirSign = mirrorFlag > 0.5 ? -1.0 : 1.0;
    float shiftU = clamp(parallaxAmp * (outDepth - 0.34), -0.018, 0.018) * edgeSafe * dirSign;
    vec2 warpedUv = baseUv + vec2(shiftU, 0.0);

    if (blurPx <= 0.12) {
      vec4 c = safeSample(map, warpedUv);
      return c;
    }

    // 5-tap pure horizontal X-axis directional motion blur (zero vertical softening)
    float stepU = texel.x * blurPx * 0.85;
    vec4 acc = vec4(0.0);
    acc += safeSample(map, warpedUv + vec2(-2.0 * stepU, 0.0)) * 0.12;
    acc += safeSample(map, warpedUv + vec2(-1.0 * stepU, 0.0)) * 0.22;
    acc += safeSample(map, warpedUv)                           * 0.32;
    acc += safeSample(map, warpedUv + vec2( 1.0 * stepU, 0.0)) * 0.22;
    acc += safeSample(map, warpedUv + vec2( 2.0 * stepU, 0.0)) * 0.12;
    return acc;
  }

  vec3 softScreen(vec3 base, vec3 glow) {
    return vec3(1.0) - (vec3(1.0) - clamp(base, 0.0, 1.0)) * (vec3(1.0) - clamp(glow, 0.0, 0.92));
  }

  void main() {
    vec2 currUv = mapContainedUv(vPlaneUv, uPlaneAspect, uCurrTexAspect, uCurrMirrorX, uCurrAnchorOffset);
    vec3 currN;
    float currEdge;
    float currDepth;
    vec4 currCol = sampleWarpedLayer(
      uCurrMap,
      currUv,
      uCurrTexel,
      uCurrMirrorX,
      uCurrParallax,
      uBlurAmount,
      currN,
      currEdge,
      currDepth
    );

    vec4 blended = currCol;
    vec3 N = currN;
    float edgeBand = currEdge;

    if (uHasPrev > 0.5 && uSwapMix < 0.999) {
      vec2 prevUv = mapContainedUv(vPlaneUv, uPlaneAspect, uPrevTexAspect, uPrevMirrorX, uPrevAnchorOffset);
      vec3 prevN;
      float prevEdge;
      float prevDepth;
      vec4 prevCol = sampleWarpedLayer(
        uPrevMap,
        prevUv,
        uPrevTexel,
        uPrevMirrorX,
        uPrevParallax,
        uBlurAmount,
        prevN,
        prevEdge,
        prevDepth
      );

      // Premultiplied-alpha aware blend to prevent dark fringes during central 40% swap
      float wCurr = uSwapMix;
      float wPrev = 1.0 - wCurr;
      float outA = prevCol.a * wPrev + currCol.a * wCurr;
      if (outA < 0.008) discard;
      vec3 outRgb = (prevCol.rgb * prevCol.a * wPrev + currCol.rgb * currCol.a * wCurr) / max(outA, 0.0001);
      blended = vec4(outRgb, outA);
      N = normalize(mix(prevN, currN, wCurr));
      edgeBand = mix(prevEdge, currEdge, wCurr);
    }

    if (blended.a < 0.008) discard;

    // ── Physical Multi-Light Relighting in Linear Color Space ──
    // WebGL2 SRGBColorSpace textures & Three.js Color uniforms are already linear
    vec3 albedo = blended.rgb;
    float luma = calcLuma(albedo);
    float strength = clamp(uRelightStrength, 0.0, 1.0);
    float neonFlag = clamp(uIsNeon, 0.0, 1.0);

    // 1. Environmental Exposure & Moody Room Contrast
    // On cyberpunk neon scenes, pull bright daylight studio exposure down naturally (0.76..0.88)
    // so the subject sits INSIDE the dark neon stage instead of floating like daylight cutout.
    float targetExposure = mix(
      clamp(uAmbientBrightness, 0.80, 1.02),
      mix(0.74, 0.86, clamp(uAmbientBrightness - 0.12, 0.0, 1.0)),
      neonFlag * strength
    );
    vec3 lit = albedo * targetExposure;

    // Gentle shadow-biased ambient chromatic bounce (preserves garment midtones & skin legibility)
    vec3 leftLin = uLeftRimColor;
    vec3 rightLin = uRightRimColor;
    vec3 ambLin = uAmbientTintColor;
    vec3 keyLin = uKeyLightColor;
    vec3 floorLin = uFloorBounceColor;

    float shadowWeight = clamp(1.0 - luma * 0.62, 0.18, 1.0);
    vec3 spatialNeonWash = mix(leftLin, rightLin, smoothstep(0.18, 0.82, vPlaneUv.x));
    vec3 envTint = mix(ambLin, spatialNeonWash, neonFlag);
    float tintAmount = mix(0.06, 0.24, neonFlag) * strength * shadowWeight;
    lit = mix(lit, lit * (vec3(0.55) + envTint * 0.95) + envTint * 0.032, tintAmount);

    // 2. Dual-Side Directional Diffuse + High-Definition Fresnel Inner Rim Light Wrap
    vec3 Lleft = normalize(vec3(-0.88, 0.18, 0.44));
    vec3 Lright = normalize(vec3(0.88, 0.18, 0.44));
    vec3 Lkey = normalize(uKeyLightDir);

    float ndlLeft = max(dot(N, Lleft), 0.0);
    float ndlRight = max(dot(N, Lright), 0.0);
    float ndlKey = max(dot(N, Lkey), 0.0);

    float leftSpatial = smoothstep(0.86, 0.08, vPlaneUv.x);
    float rightSpatial = smoothstep(0.14, 0.92, vPlaneUv.x);

    // Fresnel grazing factor + inner silhouette light wrap (wraps neon inward across cheek/shoulder/coat/bag)
    float fresnel = pow(clamp(1.0 - N.z, 0.0, 1.0), 1.65);
    float leftFacing = clamp(max(-N.x, 0.0) * 1.15 + leftSpatial * 0.35, 0.0, 1.0);
    float rightFacing = clamp(max(N.x, 0.0) * 1.15 + rightSpatial * 0.35, 0.0, 1.0);

    float innerRimMask = clamp(edgeBand * 0.78 + fresnel * 0.68, 0.0, 1.0);
    float leftRimWeight = innerRimMask * leftFacing * leftSpatial;
    float rightRimWeight = innerRimMask * rightFacing * rightSpatial;

    // Broad side-diffuse bounce across folds, lapels, cheekbones, sleeves
    float diffuseScale = mix(0.08, 0.26, neonFlag) * strength;
    vec3 sideDiffuse =
      leftLin * (ndlLeft * leftSpatial * diffuseScale) +
      rightLin * (ndlRight * rightSpatial * diffuseScale);

    // Subtle 3D key-light fold specular
    vec3 Hkey = normalize(Lkey + vec3(0.0, 0.0, 1.0));
    float keySpec = pow(max(dot(N, Hkey), 0.0), 14.0) * mix(0.07, 0.16, neonFlag) * strength;
    lit += albedo * sideDiffuse + keyLin * (ndlKey * 0.045 * strength + keySpec * (0.28 + luma * 0.72));

    // Silky photographic screen-blended Fresnel Inner Rim Glow (zero harsh clipping on bright clothes!)
    float rimIntensity = mix(0.24, 0.78, neonFlag) * strength;
    vec3 rimGlow =
      leftLin * (leftRimWeight * rimIntensity) +
      rightLin * (rightRimWeight * rimIntensity);
    lit = softScreen(lit, rimGlow * (0.62 + 0.38 * (1.0 - luma * 0.35)));

    // 3. Floor Bounce Uplight (neon ring / terrazzo reflection rising onto shoes & lower trousers)
    float floorMask = pow(clamp(1.0 - vPlaneUv.y / 0.32, 0.0, 1.0), 1.55);
    float underFacing = clamp(-N.y * 0.55 + 0.62, 0.15, 1.0);
    vec3 floorBounce = floorLin * (floorMask * underFacing * uFloorBounceStrength * mix(0.18, 0.42, neonFlag));
    lit = softScreen(lit, floorBounce * (0.45 + 0.55 * (1.0 - luma * 0.4)));

    // Final linear -> sRGB output encoding via Three.js standard fragment chunk
    gl_FragColor = vec4(clamp(lit, 0.0, 1.0), blended.a);
    #include <colorspace_fragment>
  }
`;

export default function StudioCharacterRelightCanvas({
  imageUrl,
  angleDeg,
  mirrorX,
  identityKey,
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
      lightingFrame,
      externalYawDeg,
      kineticBlurPx,
      widthPx,
      heightPx,
      prefersReducedMotion,
    };
  });

  // Mutable bridge to trigger render / texture sync imperatively from prop effects
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

    // Placeholder 1x1 transparent texture so shader never samples unbound unit
    const blankData = new Uint8Array([0, 0, 0, 0]);
    const blankTex = new THREE.DataTexture(blankData, 1, 1, THREE.RGBAFormat);
    blankTex.colorSpace = THREE.SRGBColorSpace;
    blankTex.needsUpdate = true;

    const geometry = new THREE.PlaneGeometry(1, 1, 32, 44);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.FrontSide,
      uniforms: {
        uPlaneWidth: { value: 1 },
        uYawRad: { value: 0 },
        uCylinderBend: { value: 0.18 },

        uCurrMap: { value: blankTex },
        uPrevMap: { value: blankTex },
        uHasPrev: { value: 0 },
        uSwapMix: { value: 1 },

        uPlaneAspect: { value: 0.75 },
        uCurrTexAspect: { value: 0.75 },
        uPrevTexAspect: { value: 0.75 },
        uCurrTexel: { value: new THREE.Vector2(1 / 512, 1 / 680) },
        uPrevTexel: { value: new THREE.Vector2(1 / 512, 1 / 680) },
        uCurrMirrorX: { value: 0 },
        uPrevMirrorX: { value: 0 },
        uCurrAnchorOffset: { value: new THREE.Vector2(0, 0) },
        uPrevAnchorOffset: { value: new THREE.Vector2(0, 0) },

        uCurrParallax: { value: 0 },
        uPrevParallax: { value: 0 },
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
    const inflightUrls = new Set<string>();

    let disposed = false;
    let contextLost = false;
    let hasReadyTexture = false;
    let currentEntry: CachedTextureEntry | null = null;
    let prevEntry: CachedTextureEntry | null = null;
    let currentMirror = false;
    let prevMirror = false;
    let currentAngle = propsRef.current.angleDeg;
    let currentIdentity = propsRef.current.identityKey;

    // Central 40% high-speed swap transition state
    let transitionActive = false;
    let transitionStartMs = 0;
    let transitionDurationMs = SWAP_DURATION_MS;
    let transitionStepSign = 1;
    let smoothedExternalYawDeg = 0;

    // On-demand render scheduler with software-WebGL fence pacing
    let frameId = 0;
    let timeoutId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTickMs = performance.now();

    const evictOldTextures = () => {
      if (textureCache.size <= MAX_CACHED_TEXTURES) return;
      const entries = [...textureCache.values()].sort((a, b) => a.lastUsedAt - b.lastUsedAt);
      for (const entry of entries) {
        if (textureCache.size <= MAX_CACHED_TEXTURES) break;
        if (entry === currentEntry || entry === prevEntry) continue;
        entry.texture.dispose();
        textureCache.delete(entry.url);
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
        .set(frame.keyPosX ?? -1.2, Math.max(0.4, (frame.keyPosY ?? 2.8) * 0.45), Math.max(0.8, frame.keyPosZ ?? 1.8))
        .normalize();
      material.uniforms.uKeyLightDir.value.copy(_keyDir);
    };

    const commitTextureEntry = (entry: CachedTextureEntry, nextAngle: number, nextMirror: boolean, nextIdentity: string) => {
      entry.lastUsedAt = performance.now();
      const canBridge =
        !propsRef.current.prefersReducedMotion &&
        Boolean(currentEntry) &&
        currentEntry !== entry &&
        currentIdentity === nextIdentity &&
        currentAngle !== nextAngle;

      if (canBridge && currentEntry) {
        prevEntry = currentEntry;
        prevMirror = currentMirror;
        const delta = shortestAngleDeltaDeg(currentAngle, nextAngle);
        transitionStepSign = delta >= 0 ? 1 : -1;
        transitionStartMs = performance.now();
        transitionDurationMs = propsRef.current.kineticBlurPx > 1.2 ? 125 : SWAP_DURATION_MS;
        transitionActive = true;
      } else {
        prevEntry = null;
        transitionActive = false;
      }

      currentEntry = entry;
      currentMirror = nextMirror;
      currentAngle = nextAngle;
      currentIdentity = nextIdentity;

      material.uniforms.uCurrMap.value = entry.texture;
      material.uniforms.uCurrTexAspect.value = entry.aspect;
      material.uniforms.uCurrTexel.value.set(1 / entry.texWidth, 1 / entry.texHeight);
      material.uniforms.uCurrMirrorX.value = nextMirror ? 1 : 0;
      material.uniforms.uCurrAnchorOffset.value.set(
        entry.anchor.spineOffsetU,
        entry.anchor.soleOffsetV
      );

      if (prevEntry && transitionActive) {
        material.uniforms.uPrevMap.value = prevEntry.texture;
        material.uniforms.uPrevTexAspect.value = prevEntry.aspect;
        material.uniforms.uPrevTexel.value.set(1 / prevEntry.texWidth, 1 / prevEntry.texHeight);
        material.uniforms.uPrevMirrorX.value = prevMirror ? 1 : 0;
        material.uniforms.uPrevAnchorOffset.value.set(
          prevEntry.anchor.spineOffsetU,
          prevEntry.anchor.soleOffsetV
        );
        material.uniforms.uHasPrev.value = 1;
      } else {
        material.uniforms.uHasPrev.value = 0;
        material.uniforms.uSwapMix.value = 1;
      }

      if (!hasReadyTexture) {
        hasReadyTexture = true;
        onReadyChangeRef.current?.(true);
      }
      evictOldTextures();
      requestRender();
    };

    const loadUrlIfNeeded = (url: string | null) => {
      if (!url) {
        if (hasReadyTexture) {
          hasReadyTexture = false;
          onReadyChangeRef.current?.(false);
        }
        return;
      }

      const cached = textureCache.get(url);
      if (cached) {
        commitTextureEntry(
          cached,
          propsRef.current.angleDeg,
          propsRef.current.mirrorX,
          propsRef.current.identityKey
        );
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

        const entry: CachedTextureEntry = {
          url,
          texture: tex,
          aspect: nw / nh,
          texWidth: nw,
          texHeight: nh,
          anchor: measureSpineAndSoleAnchor(img),
          lastUsedAt: performance.now(),
        };
        textureCache.set(url, entry);

        // Only commit if this URL is still the active imageUrl
        if (propsRef.current.imageUrl === url) {
          commitTextureEntry(
            entry,
            propsRef.current.angleDeg,
            propsRef.current.mirrorX,
            propsRef.current.identityKey
          );
        }
      };
      img.onerror = () => {
        inflightUrls.delete(url);
      };
      img.src = url;
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

    const smoothstep = (e0: number, e1: number, x: number): number => {
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };

    const drawFrame = (nowMs: number): boolean => {
      if (disposed || contextLost || !renderer || !currentEntry) return false;

      const dtSec = Math.min(0.05, Math.max(0.001, (nowMs - lastTickMs) / 1000));
      lastTickMs = nowMs;

      applyLightingUniforms();

      // Smoothly damp continuous drag/scroll yaw
      const targetExtYaw = propsRef.current.prefersReducedMotion
        ? 0
        : Math.max(-CYLINDER_MAX_YAW_DEG, Math.min(CYLINDER_MAX_YAW_DEG, propsRef.current.externalYawDeg || 0));
      smoothedExternalYawDeg = THREE.MathUtils.damp(
        smoothedExternalYawDeg,
        targetExtYaw,
        18,
        dtSec
      );
      if (Math.abs(smoothedExternalYawDeg - targetExtYaw) < 0.04) {
        smoothedExternalYawDeg = targetExtYaw;
      }

      let transitionYawDeg = 0;
      let swapMix = 1;
      let prevParallax = 0;
      let currParallax = 0;
      let transitionBlur = 0;
      let keepAnimating = Math.abs(smoothedExternalYawDeg - targetExtYaw) >= 0.04;

      if (transitionActive && prevEntry) {
        const rawT = Math.max(0, Math.min(1, (nowMs - transitionStartMs) / transitionDurationMs));

        // Central 40% high-speed swap window: t in [0.30, 0.70]
        swapMix = smoothstep(0.3, 0.7, rawT);

        // Cylinder Y-axis rotation: outgoing accelerates 0 -> +14°, incoming lands -14° -> 0
        if (rawT < 0.5) {
          const phase = smoothstep(0, 0.5, rawT);
          transitionYawDeg = transitionStepSign * CYLINDER_MAX_YAW_DEG * phase;
        } else {
          const phase = smoothstep(0.5, 1.0, rawT);
          transitionYawDeg = -transitionStepSign * CYLINDER_MAX_YAW_DEG * (1 - phase);
        }

        // Pseudo-depth differential parallax (outgoing pushed forward, incoming catches up cleanly)
        prevParallax = transitionStepSign * MAX_PARALLAX_UV * smoothstep(0, 0.72, rawT);
        currParallax = -transitionStepSign * MAX_PARALLAX_UV * (1 - smoothstep(0.28, 1.0, rawT));

        // Peak directional X-axis motion blur concentrated around the central 40% swap
        const blurEnv = Math.sin(Math.max(0, Math.min(1, (rawT - 0.14) / 0.72)) * Math.PI);
        transitionBlur = blurEnv * 4.4;

        if (rawT >= 1) {
          transitionActive = false;
          prevEntry = null;
          material.uniforms.uHasPrev.value = 0;
          swapMix = 1;
          transitionYawDeg = 0;
          currParallax = 0;
          transitionBlur = 0;
        } else {
          keepAnimating = true;
        }
      }

      const combinedYawDeg = Math.max(
        -CYLINDER_MAX_YAW_DEG,
        Math.min(CYLINDER_MAX_YAW_DEG, transitionYawDeg + smoothedExternalYawDeg)
      );
      const yawRad = (combinedYawDeg * Math.PI) / 180;
      const extParallax = (smoothedExternalYawDeg / CYLINDER_MAX_YAW_DEG) * (MAX_PARALLAX_UV * 0.72);
      const extBlur = propsRef.current.prefersReducedMotion
        ? 0
        : Math.min(5.5, propsRef.current.kineticBlurPx || 0);

      // Cylinder curvature activates smoothly with yaw while keeping subtle 3D volume at rest
      const yawMag = Math.abs(combinedYawDeg) / CYLINDER_MAX_YAW_DEG;
      material.uniforms.uYawRad.value = yawRad;
      material.uniforms.uCylinderBend.value = 0.06 + yawMag * 0.36;
      material.uniforms.uSwapMix.value = swapMix;
      material.uniforms.uPrevParallax.value = prevParallax;
      material.uniforms.uCurrParallax.value = transitionActive ? currParallax : extParallax;
      material.uniforms.uBlurAmount.value = Math.max(transitionBlur, extBlur);

      renderer.render(scene, camera);
      return keepAnimating;
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
      loadUrlIfNeeded(propsRef.current.imageUrl);
      if (currentEntry && currentEntry.url === propsRef.current.imageUrl) {
        if (currentMirror !== propsRef.current.mirrorX) {
          currentMirror = propsRef.current.mirrorX;
          material.uniforms.uCurrMirrorX.value = currentMirror ? 1 : 0;
        }
        requestRender();
      }
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
      if (frameId) window.cancelAnimationFrame(frameId);
      if (timeoutId) window.clearTimeout(timeoutId);
      resizeObserver?.disconnect();
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);

      for (const entry of textureCache.values()) {
        entry.texture.dispose();
      }
      textureCache.clear();
      blankTex.dispose();
      geometry.dispose();
      material.dispose();
      renderer?.dispose();
      if (mount) {
        mount.innerHTML = '';
      }
      onReadyChangeRef.current?.(false);
    };
  }, []);

  // Reactive sync when image, angle, lighting, yaw, blur, or sizing changes
  useEffect(() => {
    controllerRef.current?.syncScene();
  }, [imageUrl, angleDeg, mirrorX, identityKey]);

  useEffect(() => {
    controllerRef.current?.requestRender();
  }, [lightingFrame, externalYawDeg, kineticBlurPx, prefersReducedMotion]);

  useEffect(() => {
    controllerRef.current?.syncSize();
    controllerRef.current?.requestRender();
  }, [widthPx, heightPx]);

  return (
    <div
      ref={mountRef}
      className={`studio-character-relight-host ${className}`.trim()}
      data-character-relight-webgl="true"
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
