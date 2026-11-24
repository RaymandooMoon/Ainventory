import * as THREE from 'three';
import {
  createAdaptivePacerState,
  markPacerActivity,
  recordFrameWorkCost,
  resetPacerOnResume,
  resolveFpsTier,
  sampleDisplayRefreshHz,
  shouldCommitFrame,
} from '../../utils/adaptiveFramePacer.ts';

export type LoginThreeVariantId = 'luxury' | 'aurora';

export interface LoginThreeVariantMeta {
  id: LoginThreeVariantId;
  num: string;
  labelKo: string;
  labelEn: string;
  shortKo: string;
  shortEn: string;
}

export const LOGIN_THREE_VARIANTS: readonly LoginThreeVariantMeta[] = [
  {
    id: 'luxury',
    num: 'A',
    labelKo: '럭셔리 유체',
    labelEn: 'Luxury Fluid',
    shortKo: '럭셔리',
    shortEn: 'Luxury',
  },
  {
    id: 'aurora',
    num: 'B',
    labelKo: '오로라 프리즘',
    labelEn: 'Aurora Prism',
    shortKo: '오로라',
    shortEn: 'Aurora',
  },
];

export const DEFAULT_LOGIN_THREE_VARIANT: LoginThreeVariantId = 'luxury';

export function normalizeLoginThreeVariant(raw?: string | null): LoginThreeVariantId {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'aurora' || v === 'b' || v === '2' || v === 'prism') return 'aurora';
  return 'luxury';
}

export function getLoginThreeVariantMeta(id: LoginThreeVariantId): LoginThreeVariantMeta {
  return LOGIN_THREE_VARIANTS.find((v) => v.id === id) ?? LOGIN_THREE_VARIANTS[0];
}

export function cycleLoginThreeVariant(current: LoginThreeVariantId): LoginThreeVariantId {
  const idx = LOGIN_THREE_VARIANTS.findIndex((v) => v.id === current);
  if (idx < 0) return DEFAULT_LOGIN_THREE_VARIANT;
  return LOGIN_THREE_VARIANTS[(idx + 1) % LOGIN_THREE_VARIANTS.length].id;
}

export interface LoginThreeOverlayRenderContext {
  readonly renderer: THREE.WebGLRenderer;
  readonly width: number;
  readonly height: number;
  readonly dt: number;
  readonly elapsed: number;
  readonly reducedMotion: boolean;
  readonly isSoftwareGl: boolean;
}

export interface MarbleStepSnapshot {
  u: number;
  v: number;
  radiusNormY: number;
  vx: number;
  vy: number;
  speed: number;
  aspect: number;
  isGrabbing: boolean;
  userDriven: boolean;
  elapsed: number;
}

export interface LoginThreeController {
  setTheme: (isDark: boolean, snapImmediately?: boolean) => void;
  setStage: (stage: 'intro' | 'auth' | 'portal') => void;
  setPaused: (paused: boolean) => void;
  setVariant: (variant: LoginThreeVariantId, originNx?: number, originNy?: number) => void;
  setPointer: (nx: number, ny: number, velocity: number) => void;
  setPointerDown?: (isDown: boolean, nx?: number, ny?: number, isQuickTap?: boolean) => void;
  pushDirectionalSwipe?: (dxWorldNorm: number, dyWorldNorm: number) => void;
  pushScrollImpulse: (nx: number, deltaY: number) => void;
  setTilt: (tx: number, ty: number, dtx: number, dty: number) => void;
  bounceMarble?: (
    normalWorldX: number,
    normalWorldY: number,
    sepWorldX: number,
    sepWorldY: number,
    impactStrength?: number,
    minBounceSpeed?: number
  ) => void;
  setPlayBounds?: (bounds: {
    bottomInsetWorld?: number;
    topInsetWorld?: number;
    leftInsetWorld?: number;
    rightInsetWorld?: number;
  }) => void;
  setExternalMarbleHidden?: (hidden: boolean) => void;
  resetHeroMarble?: () => void;
  getMarbleSnapshot?: () => MarbleStepSnapshot;
  requestRender?: () => void;
  triggerPulse: (nx: number, ny: number, strength?: number) => void;
  triggerLoginSurge: (nx: number, ny: number) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

const TRAIL_NODE_COUNT = 26;
const ANALYTIC_WAVE_COUNT = 12;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function isSoftwareWebGLRenderer(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      const vendor = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
      if (
        vendor.includes('swiftshader') ||
        vendor.includes('llvmpipe') ||
        vendor.includes('software')
      ) {
        return true;
      }
    }
  } catch {
    // ignore WebGL extension errors
  }
  return false;
}

function supportsHalfFloatRenderTarget(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const isWebGL2 = renderer.capabilities.isWebGL2;
    const hasExt = isWebGL2
      ? Boolean(
          gl.getExtension('EXT_color_buffer_float') ||
            gl.getExtension('EXT_color_buffer_half_float')
        )
      : Boolean(
          gl.getExtension('OES_texture_half_float') &&
            (gl.getExtension('EXT_color_buffer_half_float') ||
              gl.getExtension('OES_texture_half_float_linear'))
        );
    if (!hasExt) return false;

    const probe = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(probe);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    renderer.setRenderTarget(prev);
    probe.dispose();
    return status === gl.FRAMEBUFFER_COMPLETE;
  } catch {
    return false;
  }
}

// ============================================================================
// PASS 1: ISOTROPIC 8-NEIGHBOR 2D WAVE EQUATION FBO
// Propagates circular concentric ripples outward around the rolling glass marble
// (No gyroscope cloth/wave slosh — gyroscope exclusively rolls the marble!)
// ============================================================================

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FLUID_SIM_FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uPrevState;
  uniform vec2 uTexelSize;
  uniform float uEncodedByte; // 0.0 = HalfFloat signed, 1.0 = UnsignedByte [0..1] -> [-1..1]
  uniform float uDecay;
  uniform float uAspect;

  // Discrete Tap / Bounce / Theme-Button Circular Wave Burst
  uniform vec2 uBurstPos;
  uniform float uBurstStrength;
  uniform float uBurstRadius;

  // Rolling Glass Marble Concentric Ripple Emitter
  uniform vec2 uMarbleWavePos;
  uniform float uMarbleWaveStrength;
  uniform float uMarbleWaveRadius;

  varying vec2 vUv;

  vec4 decodeState(vec4 raw) {
    return mix(raw, raw * 2.0 - 1.0, uEncodedByte);
  }

  vec4 encodeState(vec4 val) {
    vec4 clamped = clamp(val, vec4(-1.0), vec4(1.0));
    return mix(clamped, clamped * 0.5 + 0.5, uEncodedByte);
  }

  void main() {
    vec2 uv = clamp(vUv, vec2(0.002), vec2(0.998));
    vec2 tx = uTexelSize;

    vec4 c = decodeState(texture2D(uPrevState, uv));
    float rN  = decodeState(texture2D(uPrevState, clamp(uv + vec2( 0.0,  tx.y), 0.0, 1.0))).r;
    float rS  = decodeState(texture2D(uPrevState, clamp(uv + vec2( 0.0, -tx.y), 0.0, 1.0))).r;
    float rE  = decodeState(texture2D(uPrevState, clamp(uv + vec2( tx.x,  0.0), 0.0, 1.0))).r;
    float rW  = decodeState(texture2D(uPrevState, clamp(uv + vec2(-tx.x,  0.0), 0.0, 1.0))).r;
    float rNE = decodeState(texture2D(uPrevState, clamp(uv + vec2( tx.x,  tx.y), 0.0, 1.0))).r;
    float rNW = decodeState(texture2D(uPrevState, clamp(uv + vec2(-tx.x,  tx.y), 0.0, 1.0))).r;
    float rSE = decodeState(texture2D(uPrevState, clamp(uv + vec2( tx.x, -tx.y), 0.0, 1.0))).r;
    float rSW = decodeState(texture2D(uPrevState, clamp(uv + vec2(-tx.x, -tx.y), 0.0, 1.0))).r;

    // 8-neighbor isotropic Laplacian produces mathematically round concentric waves
    float avgR = (rN + rS + rE + rW) * 0.20 + (rNE + rNW + rSE + rSW) * 0.05;
    float nextH = (avgR * 2.0 - c.g) * uDecay;
    float prevH = c.r;

    vec2 aspectScale = vec2(uAspect, 1.0);

    // 1. Crisp circular ripple burst (taps, edge bounce, Luxury<->Aurora button)
    if (uBurstStrength > 0.001) {
      float dBurst = length((vUv - uBurstPos) * aspectScale);
      float r = max(0.016, uBurstRadius);
      float dimple = -exp(-(dBurst * dBurst) / (r * r)) * 0.58;
      float collar = exp(-pow((dBurst - r * 1.48) / (r * 0.88), 2.0)) * 0.78;
      nextH += (dimple + collar) * uBurstStrength * 0.66;
    }

    // 2. Rolling glass marble wave injection: heavy fabric press core with taut-silk outer collar
    if (uMarbleWaveStrength > 0.001) {
      float dM = length((vUv - uMarbleWavePos) * aspectScale);
      float mr = max(0.018, uMarbleWaveRadius);
      float coreDip = -exp(-(dM * dM) / (mr * mr * 1.15)) * 0.94;
      float ringCrest = exp(-pow((dM - mr * 1.72) / (mr * 0.90), 2.0)) * 0.62;
      nextH += (coreDip + ringCrest) * uMarbleWaveStrength * 0.54;
    }

    // Soft edge damping so waves fade invisibly at viewport borders without edge seams
    vec2 edge = min(vUv, 1.0 - vUv);
    float edgeMask = smoothstep(0.0, 0.075, min(edge.x, edge.y));
    nextH *= mix(0.92, 1.0, edgeMask);

    gl_FragColor = encodeState(vec4(nextH, prevH, 0.0, 0.0));
  }
`;

// ============================================================================
// PASS 2: TRUE 3D PINCHED-PLEAT SILK CLOTH MESH
// - Zero gyroscope drift (cloth stays calm & dignified while marble rolls on it)
// - Renders under-marble contact AO shadow, physical dimple & refracted caustic glow
// - Combines FBO concentric ripples + C-infinity Gaussian wake trail from marble
// ============================================================================

const SILK_CLOTH_VERT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uAuthBlend;
  uniform float uSurge;
  uniform vec2 uMarbleClothPos;
  uniform float uMarbleClothRadius;
  uniform float uMarbleSink;
  uniform vec2 uMarbleVel;

  varying vec2 vUv;
  varying vec2 vScreenUv;
  varying vec3 vWorldPos;
  varying vec3 vNormalDir;
  varying vec3 vTangentDir;
  varying float vFoldHeight;
  varying float vFoldCrest;
  varying float vMarblePit;

  vec3 evalSilkDisplace(vec2 basePos, float t, float energy, out float pitDepthOut) {
    vec2 p = basePos;

    vec2 d1 = normalize(vec2(0.82, 0.57));
    vec2 d2 = normalize(vec2(-0.48, 0.88));
    vec2 d3 = normalize(vec2(0.94, -0.34));
    vec2 d4 = normalize(vec2(0.35, 0.94));

    float curve = sin(p.y * 0.34 - t * 0.24) * 0.95 + cos(p.x * 0.28 + t * 0.19) * 0.55;

    float ph1 = dot(p, d1) * 0.78 + curve * 0.85 + t * 0.42;
    float ph2 = dot(p, d2) * 1.05 - curve * 0.55 - t * 0.34 + 1.2;
    float ph3 = dot(p, d3) * 1.48 + curve * 0.40 + t * 0.50 + 2.4;
    float ph4 = dot(p, d4) * 2.05 - t * 0.38 + 0.7;

    float a1 = 0.62 * energy;
    float a2 = 0.36 * energy;
    float a3 = 0.18 * energy;
    float a4 = 0.09 * energy;

    vec2 xyShift =
      d1 * (cos(ph1) * a1 * 0.46) +
      d2 * (cos(ph2) * a2 * 0.42) +
      d3 * (cos(ph3) * a3 * 0.36) +
      d4 * (cos(ph4) * a4 * 0.28);

    float zHeight =
      sin(ph1) * a1 +
      sin(ph2) * a2 +
      sin(ph3) * a3 +
      sin(ph4) * a4;

    // True 3D deep gravitational depression crater where the heavy glass marble sinks into suspended silk
    pitDepthOut = 0.0;
    if (uMarbleSink > 0.005) {
      vec2 md = basePos - uMarbleClothPos;
      float r2 = dot(md, md);
      float r = sqrt(r2 + 0.0001);
      float R = max(0.24, uMarbleClothRadius);
      float R2 = R * R;

      // 3-scale elastic membrane catenary sag: steep marble cradle + mid cushion slope + broad hammock pull
      float coreWell = exp(-r2 / (R2 * 2.15));
      float midWell = exp(-r2 / (R2 * 7.2));
      float wideSag = exp(-r2 / (R2 * 24.5));
      float press = uMarbleSink;
      float clampedPress = min(1.55, press);

      // Heavy gravity pulls local ambient silk ridges flat & taut into the depression pocket
      float ambientFlatten =
        1.0 - clamp(coreWell * 0.68 + midWell * 0.40 + wideSag * 0.16, 0.0, 0.82) * min(1.25, press);
      xyShift *= mix(1.0, ambientFlatten, 0.74);
      zHeight *= ambientFlatten;

      // Subtle outer elastic tension shoulder where stretched fabric gently rebounds outside the hammock
      float outerShoulder =
        exp(-pow((r - R * 4.55) / (R * 1.85), 2.0)) * 0.085 * clampedPress;

      // Radial star-shaped tension pleats radiating tautly out from the sunken marble collar
      float ang = atan(md.y, md.x + 0.00001);
      float pleatRing =
        smoothstep(0.0, R * 0.78, r) * exp(-pow((r - R * 2.45) / (R * 1.95), 2.0));
      float radialPleats =
        (sin(ang * 7.0 + sin(ang * 3.0) * 0.70 + t * 0.18) * 0.62 +
          cos(ang * 11.0 - 0.8) * 0.38) *
        pleatRing *
        0.175 *
        clampedPress;

      // Directional fabric bunching ahead of roll & deep elastic rebound trough trailing behind
      float velLen = length(uMarbleVel);
      float motionWave = 0.0;
      if (velLen > 0.01) {
        vec2 vDir = uMarbleVel / velLen;
        float along = dot(md, vDir) / R;
        float bowRidge =
          smoothstep(0.32, 1.50, along) *
          exp(-pow((r - R * 1.75) / (R * 1.05), 2.0)) *
          0.16;
        float rearTrough =
          smoothstep(0.22, 2.05, -along) *
          exp(-r2 / (R2 * 11.5)) *
          0.24;
        motionWave = (bowRidge - rearTrough) * min(1.0, velLen * 0.68) * clampedPress;
      }

      // Pull surrounding silk fabric radially inward toward the heavy gravity well (pullGain <= 0.42 => det(J) >= 0.58 > 0)
      float pullGain = min(0.42, 0.31 * clampedPress);
      vec2 inwardPull = -md * (pullGain * exp(-r2 / (R2 * 10.5)));
      xyShift += inwardPull;

      float wellDepth = (coreWell * 1.72 + midWell * 1.04 + wideSag * 0.68) * press;
      zHeight += -wellDepth + outerShoulder + radialPleats + motionWave;
      pitDepthOut =
        clamp(coreWell * 0.74 + midWell * 0.52 + wideSag * 0.30, 0.0, 1.28) * min(1.35, press);
    }

    return vec3(basePos.x + xyShift.x, basePos.y + xyShift.y, zHeight);
  }

  void main() {
    vUv = uv;
    float energy = mix(1.0, 0.74, uAuthBlend);
    float t = uTime * 0.85;

    float pitDepth = 0.0;
    float pitDummy = 0.0;
    vec3 displaced = evalSilkDisplace(position.xy, t, energy, pitDepth);

    float eps = 0.075;
    vec3 px = evalSilkDisplace(position.xy + vec2(eps, 0.0), t, energy, pitDummy);
    vec3 py = evalSilkDisplace(position.xy + vec2(0.0, eps), t, energy, pitDummy);

    vec3 tang = normalize(px - displaced);
    vec3 bitang = normalize(py - displaced);
    vec3 norm = normalize(cross(tang, bitang));

    mat3 worldRot = mat3(modelMatrix);
    vNormalDir = normalize(worldRot * norm);
    vTangentDir = normalize(worldRot * tang);
    vFoldHeight = displaced.z;
    vFoldCrest = clamp((displaced.z + 0.95) / 1.85, 0.0, 1.0);
    vMarblePit = pitDepth;

    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = worldPosition.xyz;

    vec4 clipPos = projectionMatrix * viewMatrix * worldPosition;
    vScreenUv = (clipPos.xy / max(0.0001, clipPos.w)) * 0.5 + 0.5;
    gl_Position = clipPos;
  }
`;

const SILK_CLOTH_FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uFluidTex;
  uniform vec2 uFluidTexel;
  uniform float uEncodedByte;
  uniform float uTime;
  uniform float uAspect;
  uniform float uThemeDark; // 1.0 = True OLED Dark, 0.0 = Sculptural Porcelain Light
  uniform float uAuthBlend;
  uniform float uSurge;
  uniform vec2 uPointer;

  // Rolling marble footprint for under-orb gravity depression, shadow & refracted caustic pool
  uniform vec2 uMarbleUv;
  uniform float uMarbleRadius;
  uniform float uMarbleOpacity;
  uniform float uMarbleSink;

  // C-infinity analytical wake ribbon behind the rolling marble
  uniform vec4 uTrailPts[${TRAIL_NODE_COUNT}];
  uniform float uTrailActive;

  // High-precision analytical concentric ripple buffer (used whenever HalfFloat FBO is unavailable)
  uniform float uUseFluidFbo;
  uniform vec4 uAnalyticWaves[${ANALYTIC_WAVE_COUNT}];
  uniform float uAnalyticActive;

  // Button-Originated Radial Transition Wave (Luxury <-> Aurora)
  uniform float uPrevVariant;
  uniform float uNextVariant;
  uniform vec2 uVariantOrigin;
  uniform float uVariantSweep;

  varying vec2 vUv;
  varying vec2 vScreenUv;
  varying vec3 vWorldPos;
  varying vec3 vNormalDir;
  varying vec3 vTangentDir;
  varying float vFoldHeight;
  varying float vFoldCrest;
  varying float vMarblePit;

  vec4 decodeState(vec4 raw) {
    return mix(raw, raw * 2.0 - 1.0, uEncodedByte);
  }

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 acesFilmic(vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  float charlieSheen(float roughness, float ndh) {
    float invR = 1.0 / max(0.08, roughness);
    float cos2h = ndh * ndh;
    float sin2h = max(0.001, 1.0 - cos2h);
    return (2.0 + invR) * pow(sin2h, invR * 0.5) / 6.2831853;
  }

  // High-precision smooth erf(x) (Abramowitz & Stegun 7.1.26)
  float erfApprox(float x) {
    float ax = abs(x);
    float t = 1.0 / (1.0 + 0.3275911 * ax);
    float poly =
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t) + 0.254829592;
    float y = 1.0 - poly * t * exp(-ax * ax);
    return x < 0.0 ? -y : y;
  }

  // C-infinity Analytical Gaussian Line-Integral Wake behind the rolling marble
  void evalMarbleWake(vec2 suv, vec2 aspectScale, out float coreH, out float haloH, out vec2 grad) {
    coreH = 0.0;
    haloH = 0.0;
    grad = vec2(0.0);
    if (uTrailActive < 0.001) return;

    float sumCore = 0.0;
    float sumHalo = 0.0;
    vec2 sumGrad = vec2(0.0);

    for (int i = 0; i < ${TRAIL_NODE_COUNT - 1}; i++) {
      vec4 a = uTrailPts[i];
      vec4 b = uTrailPts[i + 1];

      if (a.w <= 0.001 || b.w <= 0.001) continue;
      if (a.z >= 0.995 && b.z >= 0.995) continue;

      vec2 ba = (b.xy - a.xy) * aspectScale;
      float len2 = dot(ba, ba);
      if (len2 < 0.00000025 || len2 > 0.14) continue;

      float segLen = sqrt(len2);
      vec2 uDir = ba / segLen;
      vec2 pa = (suv - a.xy) * aspectScale;
      vec2 pb = (suv - b.xy) * aspectScale;

      float t0 = dot(pa, uDir);
      vec2 dPerpVec = pa - uDir * t0;
      float dPerp2 = dot(dPerpVec, dPerpVec);

      float midAge = clamp(0.5 * (a.z + b.z), 0.0, 1.0);
      float midStr = 0.5 * (a.w + b.w);
      float lifeFade = pow(1.0 - midAge, 1.75);
      float segWeight = lifeFade * midStr;

      float coreR = mix(0.022, 0.044, midAge);
      float invCoreR = 1.0 / coreR;
      float invCoreR2 = invCoreR * invCoreR;

      if (dPerp2 * invCoreR2 < 20.0) {
        float perpExp = exp(-dPerp2 * invCoreR2);
        float kCore = perpExp * 0.5 * (erfApprox((segLen - t0) * invCoreR) + erfApprox(t0 * invCoreR));
        sumCore += kCore * segWeight;

        float endA = exp(-dot(pa, pa) * invCoreR2);
        float endB = exp(-dot(pb, pb) * invCoreR2);
        vec2 kGrad =
          (-2.0 * dPerpVec * invCoreR2) * kCore +
          uDir * (0.56418958 * invCoreR * (endA - endB));
        sumGrad += kGrad * segWeight;
      }

      float haloR = coreR * 2.1;
      float invHaloR = 1.0 / haloR;
      float invHaloR2 = invHaloR * invHaloR;
      if (dPerp2 * invHaloR2 < 16.0) {
        float haloPerpExp = exp(-dPerp2 * invHaloR2);
        float kHalo = haloPerpExp * 0.5 * (erfApprox((segLen - t0) * invHaloR) + erfApprox(t0 * invHaloR));
        sumHalo += kHalo * segWeight * 0.55;
      }
    }

    float satK = 1.15;
    float satExp = exp(-satK * sumCore);
    coreH = (1.0 - satExp) * uTrailActive;
    haloH = (1.0 - exp(-1.10 * sumHalo)) * uTrailActive;
    grad = (satK * satExp * sumGrad * 0.0115) * uTrailActive;
  }

  // Zero-quantization analytical concentric ripples (eliminates 8-bit FBO border & static grain)
  void evalAnalyticRipples(vec2 suv, vec2 aspectScale, out float h, out vec2 grad) {
    h = 0.0;
    grad = vec2(0.0);
    if (uAnalyticActive < 0.5) return;

    for (int i = 0; i < ${ANALYTIC_WAVE_COUNT}; i++) {
      vec4 w = uAnalyticWaves[i];
      float str = w.w;
      float age = w.z;
      if (str <= 0.001 || age >= 0.995) continue;

      vec2 delta = (suv - w.xy) * aspectScale;
      float dist = length(delta);
      float radius = 0.024 + age * 0.62;
      float bandW = mix(0.036, 0.095, age);
      float diff = dist - radius;
      float invW2 = 1.0 / (bandW * bandW);
      if (diff * diff * invW2 > 14.0) continue;

      float env = exp(-(diff * diff) * invW2);
      float life = pow(1.0 - age, 1.65) * smoothstep(0.0, 0.04, age);
      float amp = str * life * 0.24;
      float freq = 58.0;
      float phase = diff * freq;
      float c = cos(phase);
      float s = sin(phase);

      h += amp * env * c;
      if (dist > 0.0005) {
        float dHdr = amp * env * (-freq * s - (2.0 * diff * invW2) * c);
        grad += (delta / dist) * (dHdr * 0.0115);
      }
    }
  }

  void main() {
    vec2 suv = clamp(vScreenUv, 0.002, 0.998);
    vec2 aspectScale = vec2(uAspect, 1.0);

    // 1. Sample 2D Wave Equation FBO on HalfFloat GPUs, or analytical concentric ring waves otherwise
    float waveH = 0.0;
    vec2 rippleGrad = vec2(0.0);
    if (uUseFluidFbo > 0.5) {
      vec4 stC = decodeState(texture2D(uFluidTex, suv));
      vec4 stL = decodeState(texture2D(uFluidTex, clamp(suv - vec2(uFluidTexel.x * 1.65, 0.0), 0.0, 1.0)));
      vec4 stR = decodeState(texture2D(uFluidTex, clamp(suv + vec2(uFluidTexel.x * 1.65, 0.0), 0.0, 1.0)));
      vec4 stD = decodeState(texture2D(uFluidTex, clamp(suv - vec2(0.0, uFluidTexel.y * 1.65), 0.0, 1.0)));
      vec4 stU = decodeState(texture2D(uFluidTex, clamp(suv + vec2(0.0, uFluidTexel.y * 1.65), 0.0, 1.0)));
      waveH = stC.r;
      rippleGrad = vec2(stR.r - stL.r, stU.r - stD.r);
    } else {
      evalAnalyticRipples(suv, aspectScale, waveH, rippleGrad);
    }

    // 2. High-resolution per-pixel deep gravitational funnel right underneath & radiating around the marble
    //    (Complements the true 3D vertex crater with razor-smooth 3-scale concave slope, tension pleats & bowl AO)
    vec2 mDelta = (suv - uMarbleUv) * aspectScale;
    float mDist2 = dot(mDelta, mDelta);
    float mDist = sqrt(mDist2 + 0.000001);
    float mPress = uMarbleSink * uMarbleOpacity;

    float mCoreR = max(0.022, uMarbleRadius * 1.38);
    float mMidR = max(0.046, uMarbleRadius * 2.85);
    float mWideR = max(0.088, uMarbleRadius * 5.25);
    float mInvCoreR2 = 1.0 / (mCoreR * mCoreR);
    float mInvMidR2 = 1.0 / (mMidR * mMidR);
    float mInvWideR2 = 1.0 / (mWideR * mWideR);

    float mCoreDip = exp(-mDist2 * mInvCoreR2) * mPress;
    float mMidDip = exp(-mDist2 * mInvMidR2) * mPress;
    float mWideDip = exp(-mDist2 * mInvWideR2) * mPress;

    // 3-scale concave downward funnel gradient (+dh/dxy points outward -> subtracting from N tilts N sharply into deep bowl!)
    vec2 mDimpleGrad =
      (2.0 * mDelta * mInvCoreR2 * mCoreDip) * 0.024 +
      (2.0 * mDelta * mInvMidR2 * mMidDip) * 0.036 +
      (2.0 * mDelta * mInvWideR2 * mWideDip) * 0.044;

    // Taut radial silk gather pleats pulling into the deeply sunken marble collar
    float mAng = atan(mDelta.y, mDelta.x + 0.00001);
    float gatherRing =
      smoothstep(0.0, uMarbleRadius * 0.72, mDist) *
      exp(-pow((mDist - uMarbleRadius * 2.35) / max(0.030, uMarbleRadius * 1.85), 2.0));
    float gatherWave =
      sin(mAng * 8.0 + sin(mAng * 3.0) * 0.65) * 0.62 + cos(mAng * 13.0 - 0.5) * 0.38;
    vec2 mTang = vec2(-mDelta.y, mDelta.x) / mDist;
    vec2 gatherGrad = mTang * (gatherWave * gatherRing * mPress * 0.24);

    // 3. Smooth C-infinity depressed cloth furrow trailing behind the rolling marble
    float trailC;
    float haloC;
    vec2 trailGrad;
    evalMarbleWake(suv, aspectScale, trailC, haloC, trailGrad);

    // Deep gravity crater + rebounding pressed-fabric furrow track
    float pitTotal = clamp(
      mCoreDip * 0.72 + mMidDip * 0.52 + mWideDip * 0.32 + vMarblePit * 0.44,
      0.0,
      1.68
    );
    float fboHeight = waveH * 1.15 - pitTotal * 0.84 - trailC * 0.56 + haloC * 0.16;
    vec2 fboVel = rippleGrad * 0.85 - trailGrad * 0.90;

    // Combine true 3D cloth normal with concentric ripples + deep 3-scale gravity funnel + pressed furrow wake
    vec2 combinedGrad =
      rippleGrad * 3.15 +
      mDimpleGrad * 3.65 +
      gatherGrad +
      (-trailGrad * 2.15);
    vec3 N = normalize(vNormalDir + vec3(-combinedGrad.x, -combinedGrad.y, 0.0));
    vec3 T = normalize(vTangentDir - N * dot(N, vTangentDir));
    vec3 B = normalize(cross(N, T));
    vec3 V = normalize(cameraPosition - vWorldPos);

    // Calm studio softbox lighting (zero gyro shift — steady fashion stage)
    vec2 lightMove = uPointer * 0.65;
    vec3 L1 = normalize(vec3(-2.6 + lightMove.x, 3.8 + lightMove.y, 4.6));
    vec3 L2 = normalize(vec3(3.4 - lightMove.x * 0.5, -2.2 - lightMove.y * 0.4, 3.8));
    vec3 H1 = normalize(L1 + V);
    vec3 H2 = normalize(L2 + V);

    float ndl1 = max(dot(N, L1), 0.0);
    float ndl2 = max(dot(N, L2), 0.0);
    float ndv = max(dot(N, V), 0.001);
    float ndh1 = max(dot(N, H1), 0.0);
    float ndh2 = max(dot(N, H2), 0.0);

    float wrapDiff1 = clamp((dot(N, L1) + 0.26) / 1.26, 0.0, 1.0);
    float wrapDiff2 = clamp((dot(N, L2) + 0.22) / 1.22, 0.0, 1.0);

    float tdH1 = dot(T, H1);
    float bdH1 = dot(B, H1);
    float satinAniso1 = exp(-(tdH1 * tdH1 * 5.2 + bdH1 * bdH1 * 24.0)) * ndl1;
    float tdH2 = dot(T, H2);
    float bdH2 = dot(B, H2);
    float satinAniso2 = exp(-(tdH2 * tdH2 * 6.0 + bdH2 * bdH2 * 22.0)) * ndl2;

    float sheen1 = charlieSheen(0.36, ndh1) * (0.14 + 0.42 * ndl1) * pow(1.0 - ndv, 1.55);
    float sheen2 = charlieSheen(0.42, ndh2) * (0.10 + 0.30 * ndl2) * pow(1.0 - ndv, 1.65);

    // Sculptural concave bowl dipole: dark shadowed upper-left inner wall vs luminous lower-right inner bowl catchlight
    vec2 lightDir2D = normalize(L1.xy);
    vec2 mDir = mDelta / mDist;
    float rimFacingLight = clamp(dot(mDir, -lightDir2D), 0.0, 1.0);
    float wallAwayFromLight = clamp(dot(mDir, lightDir2D), 0.0, 1.0);
    float pitRimRing =
      exp(-pow((mDist - uMarbleRadius * 1.92) / max(0.026, uMarbleRadius * 1.38), 2.0)) * mPress;
    float pitRimCatch =
      pitRimRing * pow(max(0.0001, rimFacingLight), 1.25) * (0.58 + 0.42 * wrapDiff1);
    float pitShadowWall =
      exp(-pow((mDist - uMarbleRadius * 1.68) / max(0.028, uMarbleRadius * 1.48), 2.0)) *
      pow(max(0.0001, wallAwayFromLight), 1.2) *
      mPress;

    float crest = clamp(vFoldCrest + fboHeight * 0.50, 0.0, 1.0);
    float clothAO = smoothstep(0.05, 0.86, crest);
    float rippleLuminance = clamp(
      length(rippleGrad) * 3.3 + abs(waveH) * 0.95 + trailC * 0.30 + pitRimCatch * 0.85,
      0.0,
      1.0
    );

    // Organic flowing dye variation across the draped silk — visibly warps inward down the gravity funnel!
    vec2 pitDyePull = -mDelta * ((mMidDip * 0.65 + mWideDip * 0.35) * 0.95);
    vec2 dyeUv = vWorldPos.xy * 0.26 + fboVel * 0.24 + pitDyePull;
    float tDye = uTime * 0.22;
    float dye1 = 0.5 + 0.5 * sin(dyeUv.x * 1.8 + dyeUv.y * 1.2 + vFoldHeight * 0.9 + tDye);
    float dye2 = 0.5 + 0.5 * cos(dyeUv.x * 1.4 - dyeUv.y * 1.7 - vFoldHeight * 0.8 - tDye * 1.15);
    float dye3 = 0.5 + 0.5 * sin((dyeUv.x - dyeUv.y) * 1.5 + vFoldHeight * 1.1 + tDye * 0.85);

    // TRUE OLED DARK ENVELOPE (deep gravity pit darkens into plush velvet shadow while lit concave lip catches satin sheen)
    float oledFold = pow(
      smoothstep(0.22, 0.94, crest * 0.68 + wrapDiff1 * 0.38 + rippleLuminance * 0.24 + pitRimCatch * 0.38),
      1.85
    );
    float edgeDist = length((suv - 0.5) * vec2(1.06, 1.0));
    float oledEdgeFade = 1.0 - smoothstep(0.52, 1.02, edgeDist) * 0.58;
    float oledMask = oledFold * oledEdgeFade;

    // PALETTE A — LUXURY COUTURE SILK
    vec3 luxDarkAlbedo = mix(vec3(0.075, 0.068, 0.155), vec3(0.22, 0.18, 0.34), smoothstep(0.25, 0.85, dye2) * 0.65);
    luxDarkAlbedo = mix(luxDarkAlbedo, vec3(0.46, 0.37, 0.25), smoothstep(0.45, 0.92, dye3) * 0.55);

    vec3 luxDark = luxDarkAlbedo * (wrapDiff1 * 0.82 + wrapDiff2 * 0.28) * oledMask;
    float luxLightMask = smoothstep(0.05, 0.75, oledMask + rippleLuminance * 0.58 + pitRimCatch * 0.62);
    luxDark += vec3(0.88, 0.76, 0.58) * (satinAniso1 * 0.54 + sheen1 * 0.26 + pitRimCatch * 0.32) * luxLightMask;
    luxDark += vec3(0.85, 0.88, 0.96) * (satinAniso2 * 0.34 + sheen2 * 0.22 + rippleLuminance * 0.30) * luxLightMask;

    vec3 luxLightValley = vec3(0.62, 0.585, 0.545);
    vec3 luxLightSilk = vec3(0.92, 0.905, 0.885);
    luxLightSilk = mix(luxLightSilk, vec3(0.835, 0.815, 0.905), smoothstep(0.30, 0.86, dye2) * 0.42);
    luxLightSilk = mix(luxLightSilk, vec3(0.935, 0.865, 0.765), smoothstep(0.38, 0.90, dye3) * 0.40);
    vec3 luxLight = mix(luxLightValley, luxLightSilk, clothAO * (0.40 + 0.60 * wrapDiff1));
    luxLight -= vec3(0.135, 0.128, 0.118) * max(-fboHeight, 0.0) * 0.88;
    luxLight += vec3(0.98, 0.95, 0.90) * (satinAniso1 * 0.36 + sheen1 * 0.17 + pitRimCatch * 0.18);
    luxLight += vec3(0.96, 0.97, 1.0) * (satinAniso2 * 0.20 + rippleLuminance * 0.24);

    vec3 colLuxury = mix(luxLight, luxDark, uThemeDark);

    // PALETTE B — AURORA PRISM SILK
    vec3 aurBase = mix(vec3(0.06, 0.28, 0.78), vec3(0.42, 0.16, 0.78), smoothstep(0.18, 0.84, dye2));
    aurBase = mix(aurBase, vec3(0.82, 0.26, 0.38), smoothstep(0.40, 0.90, dye3) * 0.78);
    aurBase = mix(aurBase, vec3(0.88, 0.64, 0.26), smoothstep(0.50, 0.94, dye1 * 0.65 + crest * 0.35) * 0.62);

    vec3 aurDark = aurBase * (wrapDiff1 * 0.85 + wrapDiff2 * 0.28) * oledMask;
    float aurLightMask = smoothstep(0.04, 0.74, oledMask + rippleLuminance * 0.62 + pitRimCatch * 0.66);
    vec3 aurSpecTint = mix(vec3(0.56, 0.82, 1.0), vec3(1.0, 0.80, 0.58), dye3);
    aurDark += aurSpecTint * (satinAniso1 * 0.56 + sheen1 * 0.28 + pitRimCatch * 0.34) * aurLightMask;
    aurDark += mix(vec3(0.84, 0.64, 1.0), vec3(1.0, 0.74, 0.44), dye1) * (satinAniso2 * 0.36 + sheen2 * 0.24 + rippleLuminance * 0.32) * aurLightMask;

    vec3 aurLightValley = vec3(0.63, 0.62, 0.75);
    vec3 aurLightSilk = vec3(0.955, 0.95, 0.975);
    aurLightSilk = mix(aurLightSilk, vec3(0.56, 0.77, 0.97), smoothstep(0.22, 0.85, dye1) * 0.52);
    aurLightSilk = mix(aurLightSilk, vec3(0.75, 0.63, 0.96), smoothstep(0.26, 0.88, dye2) * 0.48);
    aurLightSilk = mix(aurLightSilk, vec3(0.97, 0.68, 0.64), smoothstep(0.42, 0.90, dye3) * 0.46);
    aurLightSilk = mix(aurLightSilk, vec3(0.98, 0.87, 0.62), smoothstep(0.48, 0.92, crest * 0.6 + dye2 * 0.4) * 0.45);
    vec3 aurLight = mix(aurLightValley, aurLightSilk, clothAO * (0.40 + 0.60 * wrapDiff1));
    aurLight -= vec3(0.125, 0.120, 0.155) * max(-fboHeight, 0.0) * 0.84;
    aurLight += vec3(1.0, 0.98, 0.96) * (satinAniso1 * 0.38 + sheen1 * 0.18 + pitRimCatch * 0.19);
    aurLight += vec3(0.95, 0.96, 1.0) * (satinAniso2 * 0.20 + rippleLuminance * 0.25);

    vec3 colAurora = mix(aurLight, aurDark, uThemeDark);

    // BUTTON-ORIGINATED RADIAL SILK TRANSITION WAVE (Luxury <-> Aurora)
    float distFromBtn = length((suv - uVariantOrigin) * aspectScale);
    float waveFront = 1.0 - smoothstep(uVariantSweep - 0.26, uVariantSweep + 0.04, distFromBtn);
    float activeAurora = mix(uPrevVariant, uNextVariant, waveFront);
    vec3 col = mix(colLuxury, colAurora, activeAurora);

    float waveActive = smoothstep(0.01, 0.08, uVariantSweep) * (1.0 - smoothstep(1.38, 2.0, uVariantSweep));
    float ringBand = exp(-pow((distFromBtn - uVariantSweep) / 0.062, 2.0)) * waveActive;
    vec3 ringTint = mix(vec3(0.97, 0.94, 0.90), vec3(0.90, 0.82, 0.68), uThemeDark);
    col += ringTint * ringBand * mix(0.25, 0.34, uThemeDark) * (0.40 + 0.60 * clothAO);

    // DEEP GRAVITY CRADLE SHADOW + CONCAVE WALL OCCLUSION + CONTACT POCKET AO + FOCUSED GLASS CAUSTIC POOL
    if (uMarbleOpacity > 0.01) {
      float mR2 = uMarbleRadius * uMarbleRadius;

      // 1. Broad hammock bowl occlusion spanning the depressed fabric crater
      float wideBowlAO = exp(-mDist2 / (mR2 * 11.5)) * min(1.5, mPress);
      col *= 1.0 - wideBowlAO * mix(0.20, 0.28, uThemeDark);

      // 2. Sculptural shadowed upper-left inner crater slope facing away from key light
      col *= 1.0 - clamp(pitShadowWall, 0.0, 1.4) * mix(0.17, 0.26, uThemeDark);

      // 3. Deep under-marble cradle shadow slightly offset away from upper-left key light
      vec2 shadowOffset = vec2(0.0075, -0.0095);
      float dShadow = length(mDelta - shadowOffset);
      float shadowMask = exp(-(dShadow * dShadow) / (mR2 * 1.48)) * min(1.5, mPress);
      col *= 1.0 - shadowMask * mix(0.48, 0.64, uThemeDark);

      // 4. Tight deeply-compressed contact crease directly hugging the marble's sunken base
      float contactCrease = exp(-mDist2 / (mR2 * 0.84)) * min(1.5, mPress);
      col *= 1.0 - contactCrease * mix(0.30, 0.42, uThemeDark);

      // 5. Focused glass lens caustic glow projected down-right onto the curved lower inner wall of the silk pocket
      vec2 causticOffset = vec2(0.015, -0.017);
      float dCaustic = length(mDelta - causticOffset);
      float causticCore = exp(-(dCaustic * dCaustic) / (mR2 * 0.78)) * uMarbleOpacity;
      vec3 luxCaustic = mix(vec3(1.0, 0.95, 0.84), vec3(0.96, 0.82, 0.58), uThemeDark);
      vec3 aurCaustic = mix(vec3(0.68, 0.88, 1.0), vec3(0.66, 0.88, 1.0), uThemeDark);
      aurCaustic = mix(aurCaustic, vec3(0.96, 0.66, 0.90), smoothstep(-0.02, 0.03, mDelta.x - mDelta.y));
      vec3 causticTint = mix(luxCaustic, aurCaustic, activeAurora);
      col += causticTint * causticCore * mix(0.26, 0.42, uThemeDark);
    }

    // Subtle auth-stage center calm (pure #000000 OLED in dark mode!)
    float radialCenter = length((suv - vec2(0.5, 0.48)) * aspectScale);
    float centerSoft = 1.0 - smoothstep(0.18, 0.92, radialCenter);
    float authCalm = max(uAuthBlend, uSurge * 0.65);
    vec3 calmTarget = mix(vec3(0.94, 0.935, 0.928), vec3(0.0, 0.0, 0.0), uThemeDark);
    col = mix(col, calmTarget, authCalm * (0.14 + centerSoft * 0.18));

    // ACES Filmic Tone Mapping for dark mode & gentle highlight compression for light mode
    vec3 darkMapped = acesFilmic(col * 1.18);
    darkMapped *= smoothstep(0.004, 0.025, max(darkMapped.r, max(darkMapped.g, darkMapped.b)));
    vec3 lightMapped = col / (vec3(1.0) + max(col - vec3(0.92), vec3(0.0)) * 0.75);
    col = mix(lightMapped, darkMapped, uThemeDark);

    // Dither ONLY non-black pixels so OLED #000000 stays strictly 0.0
    float lum = max(col.r, max(col.g, col.b));
    float ditherMask = smoothstep(0.008, 0.04, lum);
    float grain = (hash12(gl_FragCoord.xy + fract(uTime) * 13.0) - 0.5) * 0.009 * ditherMask;
    col = clamp(col + grain, 0.0, 1.0);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ============================================================================
// PASS 3A: BIT-EXACT BACKDROP BLIT QUAD (Draws silk cloth RT cleanly to screen)
// ============================================================================

const BLIT_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uBackdropTex;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(uBackdropTex, vUv);
  }
`;

// ============================================================================
// PASS 3B: THEME-REACTIVE TRANSPARENT CRYSTAL GLASS MARBLE
// - Real-time Snell's Law screen-space refraction + chromatic RGB dispersion
// - True 3D rolling quaternion internal micro-caustics & specular lens highlights
// - Seamlessly adapts to Dark/Light AND Luxury/Aurora (including radial wave sweep!)
// ============================================================================

const MARBLE_VERT = /* glsl */ `
  precision highp float;

  varying vec3 vWorldNormal;
  varying vec3 vLocalPos;

  void main() {
    vLocalPos = normalize(position);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MARBLE_FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uBackdropTex;
  uniform vec2 uResolution;
  uniform float uAspect;
  uniform float uTime;
  uniform float uThemeDark;
  uniform float uMarbleRadius;
  uniform float uMarbleOpacity;
  uniform float uMarbleAurora; // 0.0 = Luxury Crystal, 1.0 = Aurora Prism Crystal
  uniform float uMarbleSink;

  varying vec3 vWorldNormal;
  varying vec3 vLocalPos;

  void main() {
    vec3 N = normalize(vWorldNormal);
    vec3 V = vec3(0.0, 0.0, 1.0);
    float ndv = clamp(dot(N, V), 0.0, 1.0);

    vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));

    // Real-time Snell's law spherical glass refraction + chromatic RGB dispersion
    // Aurora increases spectral dispersion slightly for a prismatic crystal orb feel
    float dispBoost = mix(1.0, 1.65, uMarbleAurora);
    vec3 I = vec3(0.0, 0.0, -1.0);
    vec3 refrR = refract(I, N, 1.0 / (1.50 - 0.032 * dispBoost));
    vec3 refrG = refract(I, N, 1.0 / 1.52);
    vec3 refrB = refract(I, N, 1.0 / (1.54 + 0.036 * dispBoost));

    // Spherical dome magnifying refraction offset in aspect-corrected screen UV (deepens as marble sinks into crater)
    float lensCurve = mix(1.26, 2.02, pow(1.0 - ndv, 1.2)) * (1.0 + clamp(uMarbleSink, 0.0, 1.85) * 0.11);
    vec2 uvScale = vec2(1.0 / max(0.25, uAspect), 1.0) * uMarbleRadius * lensCurve;
    vec2 uvR = clamp(screenUv + refrR.xy * uvScale, vec2(0.004), vec2(0.996));
    vec2 uvG = clamp(screenUv + refrG.xy * uvScale, vec2(0.004), vec2(0.996));
    vec2 uvB = clamp(screenUv + refrB.xy * uvScale, vec2(0.004), vec2(0.996));

    vec3 refracted = vec3(
      texture2D(uBackdropTex, uvR).r,
      texture2D(uBackdropTex, uvG).g,
      texture2D(uBackdropTex, uvB).b
    );

    // Subtle rolling internal optical crystal swirl driven by real 3D quaternion vLocalPos
    float swirlA = sin(vLocalPos.x * 5.2 + vLocalPos.y * 4.1 + vLocalPos.z * 3.4);
    float swirlB = cos(vLocalPos.y * 4.8 - vLocalPos.z * 5.0 + vLocalPos.x * 2.6);
    float internalVein = smoothstep(0.35, 0.96, 0.5 + 0.5 * swirlA * swirlB);

    // Physical Schlick Fresnel: crystal clear at center, luminous glassy reflection at rim
    float fresnel = 0.04 + 0.96 * pow(1.0 - ndv, 3.35);
    float rimThin = pow(1.0 - ndv, 5.2);

    // Dual fashion-studio softbox reflections
    vec3 L1 = normalize(vec3(-0.52, 0.68, 0.72));
    vec3 L2 = normalize(vec3(0.62, -0.58, 0.58));
    vec3 H1 = normalize(L1 + V);
    vec3 H2 = normalize(L2 + V);

    // Primary sharp studio window highlight + broad soft halo
    float specSharp1 = pow(max(dot(N, H1), 0.0), 140.0);
    float specBroad1 = pow(max(dot(N, H1), 0.0), 22.0);
    // Lower-right internal caustic bounce glow (light passing through sphere and focusing at back rim)
    float causticFocus = pow(max(dot(-N, normalize(vec3(-0.55, 0.65, -0.52))), 0.0), 5.0) * (1.0 - ndv * 0.55);
    float specRim2 = pow(max(dot(N, H2), 0.0), 36.0);

    // --- Theme-Reactive Glass Tint & Spectral Optics ---
    // Luxury: Smoked Champagne-Obsidian Crystal (Dark) / Clear Quartz-Pearl Dewdrop (Light)
    vec3 luxGlassTint = mix(vec3(0.985, 0.975, 0.955), vec3(0.96, 0.90, 0.80), uThemeDark);
    vec3 luxRimColor = mix(vec3(0.46, 0.42, 0.37), vec3(0.96, 0.85, 0.66), uThemeDark);
    vec3 luxCausticCol = mix(vec3(1.0, 0.96, 0.86), vec3(1.0, 0.84, 0.58), uThemeDark);

    // Aurora: Prismatic Iridescent Crystal (Cyan -> Amethyst -> Rose-Gold along Fresnel & rolling axis)
    float prismPhase = N.x * 1.9 + N.y * 1.5 + internalVein * 1.4 + uTime * 0.35;
    vec3 prismIridescence = vec3(
      0.55 + 0.45 * sin(prismPhase + 0.0),
      0.58 + 0.42 * sin(prismPhase + 2.094),
      0.66 + 0.34 * sin(prismPhase + 4.188)
    );
    vec3 aurGlassTint = mix(vec3(0.95, 0.97, 1.0), vec3(0.86, 0.92, 1.0), uThemeDark);
    vec3 aurRimColor = mix(
      mix(vec3(0.38, 0.52, 0.86), prismIridescence, 0.72),
      mix(vec3(0.62, 0.88, 1.0), prismIridescence, 0.82),
      uThemeDark
    );
    vec3 aurCausticCol = mix(vec3(0.76, 0.92, 1.0), prismIridescence * 1.12, 0.65);

    vec3 glassTint = mix(luxGlassTint, aurGlassTint, uMarbleAurora);
    vec3 rimColor = mix(luxRimColor, aurRimColor, uMarbleAurora);
    vec3 causticCol = mix(luxCausticCol, aurCausticCol, uMarbleAurora);

    // Compose transparent glass body: refracted live silk + subtle crystal absorption
    vec3 bodyCol = refracted * mix(vec3(1.0), glassTint, 0.24 + fresnel * 0.34);

    // Subtle dark-mode clarity lift inside the crystal so it remains legible even over OLED #000000 valleys
    vec3 oledAmbientRim = mix(vec3(0.24, 0.20, 0.15), vec3(0.14, 0.22, 0.34), uMarbleAurora);
    bodyCol += oledAmbientRim * (0.14 + 0.32 * fresnel) * uThemeDark;

    // Gentle internal rolling crystal shimmer (reveals 3D rolling spin clearly while keeping marble transparent!)
    bodyCol += causticCol * internalVein * (0.06 + 0.14 * fresnel) * mix(0.65, 1.15, uThemeDark);

    // Lower-right focused caustic crescent inside the glass orb
    bodyCol += causticCol * causticFocus * mix(0.34, 0.56, uThemeDark);

    // Sunken-cradle rim hugging: deeper silk-pocket wrap shadow around the embedded lower perimeter
    float sinkEmbed = clamp(uMarbleSink, 0.0, 1.75);
    float rimCurve = max(0.0001, 1.0 - ndv);
    float cradleWrap =
      pow(rimCurve, 1.95) * (1.0 - smoothstep(-0.72, 0.52, N.y)) * sinkEmbed;
    float fullCollarWrap = pow(rimCurve, 3.1) * sinkEmbed * 0.45;
    bodyCol *= 1.0 - clamp(cradleWrap * mix(0.32, 0.40, uThemeDark) + fullCollarWrap * 0.24, 0.0, 0.68);

    // Delicate inner-bevel edge definition in Light mode so clear glass stands out cleanly on bright silk
    float lightBevel = smoothstep(0.08, 0.36, 1.0 - ndv) * (1.0 - uThemeDark);
    bodyCol = mix(bodyCol, bodyCol * mix(vec3(0.76, 0.74, 0.72), vec3(0.70, 0.76, 0.90), uMarbleAurora), lightBevel * 0.38);

    // Fresnel glassy reflection shell
    bodyCol = mix(bodyCol, rimColor, clamp(fresnel * mix(0.42, 0.66, uThemeDark), 0.0, 0.78));

    // Crisp studio specular glints + razor Fresnel edge gleam
    vec3 specTint = mix(vec3(1.0, 0.985, 0.96), mix(vec3(0.95, 0.98, 1.0), prismIridescence, 0.28), uMarbleAurora);
    bodyCol += specTint * (specSharp1 * 0.98 + specBroad1 * 0.24 + specRim2 * 0.26);
    bodyCol += mix(vec3(1.0, 0.96, 0.88), prismIridescence, uMarbleAurora) * rimThin * mix(0.38, 0.72, uThemeDark);

    // Anti-aliased outer sphere alpha
    float edgeAA = smoothstep(0.0, 0.13, ndv);
    float alpha = edgeAA * uMarbleOpacity;

    gl_FragColor = vec4(clamp(bodyCol, 0.0, 1.0), alpha);
  }
`;

// ============================================================================
// MAIN THREE.JS 3D SILK CLOTH + INTERACTIVE GYRO GLASS MARBLE CONTROLLER
// ============================================================================

export function createLoginThreeController(
  canvas: HTMLCanvasElement,
  options: {
    initialDark: boolean;
    initialStage: 'intro' | 'auth' | 'portal';
    initialVariant: LoginThreeVariantId;
    reducedMotion: boolean;
    onMarbleStep?: (snapshot: MarbleStepSnapshot) => void;
    onFloorBounce?: () => void;
    onOverlayRender?: (ctx: LoginThreeOverlayRenderContext) => boolean;
    onOverlayResize?: (
      width: number,
      height: number,
      renderer: THREE.WebGLRenderer,
      isSoftwareGl?: boolean
    ) => void;
    onOverlayDispose?: () => void;
    onOverlayContextRestored?: (renderer: THREE.WebGLRenderer) => void;
  }
): LoginThreeController | null {
  const {
    reducedMotion,
    onMarbleStep,
    onFloorBounce,
    onOverlayRender,
    onOverlayResize,
    onOverlayDispose,
    onOverlayContextRestored,
  } = options;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
  } catch {
    return null;
  }

  const isSoftwareGl = isSoftwareWebGLRenderer(renderer);
  const maxDpr = isSoftwareGl ? 1.0 : 1.75;
  const initialDpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(initialDpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const useHalfFloat = !isSoftwareGl && supportsHalfFloatRenderTarget(renderer);
  const rtType = useHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const encodedByte = useHalfFloat ? 0.0 : 1.0;

  const initialW = Math.max(2, canvas.clientWidth || window.innerWidth || 1280);
  const initialH = Math.max(2, canvas.clientHeight || window.innerHeight || 720);
  const getSimDims = (w: number, h: number) => {
    const scale = isSoftwareGl ? 0.28 : 0.44;
    return {
      sw: clamp(Math.round(w * scale), 192, isSoftwareGl ? 256 : 460),
      sh: clamp(Math.round(h * scale), 192, isSoftwareGl ? 256 : 460),
    };
  };

  let { sw: simW, sh: simH } = getSimDims(initialW, initialH);

  const createFluidRT = (w: number, h: number) =>
    new THREE.WebGLRenderTarget(w, h, {
      type: rtType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    });

  let simRead = createFluidRT(simW, simH);
  let simWrite = createFluidRT(simW, simH);

  // Live silk backdrop render target for real-time glass marble refraction
  const backdropRT = new THREE.WebGLRenderTarget(
    Math.max(2, Math.round(initialW * initialDpr)),
    Math.max(2, Math.round(initialH * initialDpr)),
    {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    }
  );

  const clearFluidTarget = (rt: THREE.WebGLRenderTarget) => {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    if (useHalfFloat) {
      renderer.setClearColor(0x000000, 0);
    } else {
      renderer.setClearColor(0x808080, 0.5);
    }
    renderer.clear(true, false, false);
    renderer.setRenderTarget(prev);
  };
  clearFluidTarget(simRead);
  clearFluidTarget(simWrite);

  // --- Pass 1: 2D Wave Equation FBO Scene ---
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const simScene = new THREE.Scene();
  const simMat = new THREE.ShaderMaterial({
    uniforms: {
      uPrevState: { value: simRead.texture },
      uTexelSize: { value: new THREE.Vector2(1 / simW, 1 / simH) },
      uEncodedByte: { value: encodedByte },
      uDecay: { value: 0.976 },
      uAspect: { value: initialW / initialH },
      uBurstPos: { value: new THREE.Vector2(0.5, 0.5) },
      uBurstStrength: { value: 0 },
      uBurstRadius: { value: 0.028 },
      uMarbleWavePos: { value: new THREE.Vector2(0.5, 0.36) },
      uMarbleWaveStrength: { value: 0 },
      uMarbleWaveRadius: { value: 0.032 },
    },
    vertexShader: QUAD_VERT,
    fragmentShader: FLUID_SIM_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  simScene.add(new THREE.Mesh(quadGeo, simMat));

  // --- Pass 2: True 3D Draped Silk Cloth Scene ---
  const clothScene = new THREE.Scene();
  const clothBgDark = new THREE.Color(0x000000);
  const clothBgLight = new THREE.Color(0xefede8);
  const clothBgCurrent = new THREE.Color(options.initialDark ? 0x000000 : 0xefede8);
  clothScene.background = clothBgCurrent;

  const clothCam = new THREE.PerspectiveCamera(42, initialW / initialH, 0.1, 40);
  clothCam.position.set(0, 0, 7.6);

  const meshSegs = isSoftwareGl ? 52 : 120;
  const clothGeo = new THREE.PlaneGeometry(20.0, 18.0, meshSegs, meshSegs);
  const initVarNum = options.initialVariant === 'aurora' ? 1 : 0;

  const trailPts: THREE.Vector4[] = Array.from(
    { length: TRAIL_NODE_COUNT },
    () => new THREE.Vector4(0.5, 0.36, 1.0, 0.0)
  );
  const analyticWaves: THREE.Vector4[] = Array.from(
    { length: ANALYTIC_WAVE_COUNT },
    () => new THREE.Vector4(0.5, 0.5, 1.0, 0.0)
  );
  let analyticWaveCursor = 0;
  const pushAnalyticWave = (u: number, v: number, strength: number) => {
    const slot = analyticWaves[analyticWaveCursor];
    slot.set(clamp(u, 0.01, 0.99), clamp(v, 0.01, 0.99), 0.0, clamp(strength, 0.0, 1.0));
    analyticWaveCursor = (analyticWaveCursor + 1) % ANALYTIC_WAVE_COUNT;
  };

  const clothMat = new THREE.ShaderMaterial({
    uniforms: {
      uFluidTex: { value: simRead.texture },
      uFluidTexel: { value: new THREE.Vector2(1 / simW, 1 / simH) },
      uEncodedByte: { value: encodedByte },
      uUseFluidFbo: { value: useHalfFloat ? 1.0 : 0.0 },
      uAnalyticWaves: { value: analyticWaves },
      uAnalyticActive: { value: 0.0 },
      uTime: { value: 0 },
      uAspect: { value: initialW / initialH },
      uThemeDark: { value: options.initialDark ? 1 : 0 },
      uAuthBlend: { value: options.initialStage === 'auth' ? 1 : 0 },
      uSurge: { value: options.initialStage === 'portal' ? 1 : 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uMarbleUv: { value: new THREE.Vector2(0.5, 0.36) },
      uMarbleRadius: { value: 0.031 },
      uMarbleOpacity: { value: 1.0 },
      uMarbleClothPos: { value: new THREE.Vector2(0.0, -0.95) },
      uMarbleClothRadius: { value: 0.36 },
      uMarbleSink: { value: 1.0 },
      uMarbleVel: { value: new THREE.Vector2(0, 0) },
      uTrailPts: { value: trailPts },
      uTrailActive: { value: 0 },
      uPrevVariant: { value: initVarNum },
      uNextVariant: { value: initVarNum },
      uVariantOrigin: { value: new THREE.Vector2(0.14, 0.92) },
      uVariantSweep: { value: 2.2 },
    },
    vertexShader: SILK_CLOTH_VERT,
    fragmentShader: SILK_CLOTH_FRAG,
    depthWrite: false,
  });

  const clothMesh = new THREE.Mesh(clothGeo, clothMat);
  clothMesh.position.set(0, 0, -0.6);
  clothMesh.rotation.set(-0.14, 0.06, 0);
  clothScene.add(clothMesh);

  // --- Pass 3A: Screen Blit Scene ---
  const blitScene = new THREE.Scene();
  const blitMat = new THREE.ShaderMaterial({
    uniforms: {
      uBackdropTex: { value: backdropRT.texture },
    },
    vertexShader: QUAD_VERT,
    fragmentShader: BLIT_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  blitScene.add(new THREE.Mesh(quadGeo, blitMat));

  // --- Pass 3B: Interactive 3D Transparent Glass Marble Scene ---
  const marbleScene = new THREE.Scene();
  const initialAspect = initialW / initialH;
  const marbleCam = new THREE.OrthographicCamera(-initialAspect, initialAspect, 1, -1, -10, 10);
  marbleCam.position.set(0, 0, 5);

  const marbleGeo = new THREE.SphereGeometry(1, isSoftwareGl ? 28 : 48, isSoftwareGl ? 20 : 36);
  const marbleMat = new THREE.ShaderMaterial({
    uniforms: {
      uBackdropTex: { value: backdropRT.texture },
      uResolution: { value: new THREE.Vector2(initialW * initialDpr, initialH * initialDpr) },
      uAspect: { value: initialAspect },
      uTime: { value: 0 },
      uThemeDark: { value: options.initialDark ? 1 : 0 },
      uMarbleRadius: { value: 0.031 },
      uMarbleOpacity: { value: 1.0 },
      uMarbleAurora: { value: initVarNum },
      uMarbleSink: { value: 1.0 },
    },
    vertexShader: MARBLE_VERT,
    fragmentShader: MARBLE_FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const marbleMesh = new THREE.Mesh(marbleGeo, marbleMat);
  marbleScene.add(marbleMesh);

  // Reusable math objects (zero GC inside render loop)
  const rollAxis = new THREE.Vector3();
  const stepQuat = new THREE.Quaternion();
  const invClothMat = new THREE.Matrix4();
  const rayWorldPt = new THREE.Vector3();
  const rayLocalOrigin = new THREE.Vector3();
  const rayLocalTarget = new THREE.Vector3();
  const rayLocalDir = new THREE.Vector3();
  const clothHitCenter = new THREE.Vector2();
  const clothHitRim = new THREE.Vector2();

  // --- Animation & Physics State ---
  let viewportWidth = initialW;
  let viewportHeight = initialH;
  let isExternalMarbleHidden = false;
  let overlayWasActive = false;
  let currentAspect = initialAspect;
  let currentThemeDark = options.initialDark ? 1 : 0;
  let targetThemeDark = currentThemeDark;
  let currentAuthBlend = options.initialStage === 'auth' ? 1 : 0;
  let targetAuthBlend = currentAuthBlend;
  let currentSurge = options.initialStage === 'portal' ? 1 : 0;
  let targetSurge = currentSurge;

  let prevVariantVal = initVarNum;
  let currentVariantVal = initVarNum;
  let variantOriginU = 0.14;
  let variantOriginV = 0.92;
  let variantSweep = 2.2;

  let targetPtrX = 0;
  let targetPtrY = 0;
  let smoothPtrX = 0;
  let smoothPtrY = 0;

  // Gyroscope tilt strictly drives gravity on the glass marble ONLY
  let targetGyroX = 0;
  let targetGyroY = 0;
  let smoothGyroX = 0;
  let smoothGyroY = 0;

  // Glass marble kinematics in aspect-corrected normalized height space:
  // x in [-aspect, +aspect] mapped to UV u = 0.5 + x / (2 * aspect)
  // y in [-1, +1]           mapped to UV v = 0.5 + y / 2
  const getMarbleRadius = (aspect: number) => (aspect < 0.78 ? 0.029 : 0.031);
  let marbleR = getMarbleRadius(initialAspect);
  let marbleX = 0.0;
  let marbleY = -0.28; // Rests gracefully in the open silk zone below the INVTRY logo
  let marbleVx = 0.0;
  let marbleVy = 0.0;
  let marbleOpacity = 1.0;
  // Second-order gravity sink spring: drops heavily into the silk crater on mount, deepens further at rest or finger press
  let marbleSink = reducedMotion ? 1.24 : 0.22;
  let marbleSinkVel = reducedMotion ? 0.0 : 4.25;
  let lastClothHitX = 0.0;
  let lastClothHitY = -0.95;
  let playBottomInset = 0.0;
  let playTopInset = 0.0;
  let playLeftInset = 0.0;
  let playRightInset = 0.0;

  // Pointer grab / directional swipe / flick control for rolling the marble by hand
  let isPointerDown = false;
  let isGrabbingMarble = false;
  let userDrivenMarble = false;
  let pointerWorldX = 0;
  let pointerWorldY = -0.28;
  let lastPointerWorldX = 0;
  let lastPointerWorldY = -0.28;
  let pointerDownWorldX = 0;
  let pointerDownWorldY = -0.28;
  let pointerTotalDragDist = 0;
  const ptrSamples: Array<{ x: number; y: number; t: number }> = [];
  const marbleSnapshot: MarbleStepSnapshot = {
    u: 0.5,
    v: 0.36,
    radiusNormY: marbleR,
    vx: 0,
    vy: 0,
    speed: 0,
    aspect: initialAspect,
    isGrabbing: false,
    userDriven: false,
    elapsed: 0,
  };

  const recordPtrSample = (wx: number, wy: number) => {
    const now = performance.now();
    ptrSamples.push({ x: wx, y: wy, t: now });
    while (ptrSamples.length > 8) {
      ptrSamples.shift();
    }
  };

  const computeFlickVelocity = (): [number, number] => {
    if (ptrSamples.length < 2) return [0, 0];
    const latest = ptrSamples[ptrSamples.length - 1];
    // Find sample ~45..85ms prior for stable, crisp flick direction & speed
    let anchor = ptrSamples[0];
    for (let i = ptrSamples.length - 2; i >= 0; i -= 1) {
      anchor = ptrSamples[i];
      if (latest.t - anchor.t >= 45) break;
    }
    const dtSec = (latest.t - anchor.t) / 1000;
    if (dtSec < 0.006 || dtSec > 0.25) return [0, 0];
    const vx = (latest.x - anchor.x) / dtSec;
    const vy = (latest.y - anchor.y) / dtSec;
    return [clamp(vx, -3.6, 3.6), clamp(vy, -3.6, 3.6)];
  };

  // Wave emission & fixed-60Hz FBO simulation accumulators (keeps wave speed identical at 30/60/90/120Hz)
  const FBO_FIXED_STEP_SEC = 1 / 60;
  let fboStepAccum = 0;
  let rippleEmitAccum = 0;
  let pendingBurstU = 0.5;
  let pendingBurstV = 0.36;
  let pendingBurstStrength = 0.55; // Gentle welcoming settle ripple on mount
  let pendingBurstRadius = 0.032;
  let queuedMarbleWaveU = 0.5;
  let queuedMarbleWaveV = 0.36;
  let queuedMarbleWaveStrength = 0;
  let fboEnergyTimer = 3.2;

  let isDisposed = false;
  let isDocHidden = typeof document !== 'undefined' ? document.hidden : false;
  let isExternallyPaused = false;
  let isContextLost = false;
  let rafId = 0;
  let softTimerId = 0;
  let fenceRafId = 0;
  let activeFenceSync: WebGLSync | null = null;
  let elapsed = 0;
  let lastNow = performance.now();
  const pacer = createAdaptivePacerState({
    allowHighRefresh: !isSoftwareGl,
    now: lastNow,
  });

  const worldToUv = (wx: number, wy: number): [number, number] => [
    clamp(0.5 + wx / (2 * Math.max(0.25, currentAspect)), 0.01, 0.99),
    clamp(0.5 + wy * 0.5, 0.01, 0.99),
  ];

  const nxNyToWorld = (nx: number, ny: number): [number, number] => [
    clamp(nx, -1, 1) * currentAspect,
    clamp(ny, -1, 1),
  ];

  const shiftAndPushTrailNode = (u: number, v: number, strength: number) => {
    for (let i = TRAIL_NODE_COUNT - 1; i > 0; i -= 1) {
      trailPts[i].copy(trailPts[i - 1]);
    }
    trailPts[0].set(u, v, 0.0, strength);
  };

  const smoothstepJs = (edge0: number, edge1: number, x: number) => {
    const t = clamp((x - edge0) / Math.max(0.0001, edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Exact ray-plane intersection from screen NDC onto clothMesh local z=0 plane (zero GC)
  const projectNdcToClothLocal = (ndcX: number, ndcY: number, out: THREE.Vector2): boolean => {
    rayWorldPt.set(ndcX, ndcY, 0.5).unproject(clothCam);
    rayLocalOrigin.copy(clothCam.position).applyMatrix4(invClothMat);
    rayLocalTarget.copy(rayWorldPt).applyMatrix4(invClothMat);
    rayLocalDir.subVectors(rayLocalTarget, rayLocalOrigin);
    if (Math.abs(rayLocalDir.z) < 1e-5) return false;
    const tHit = -rayLocalOrigin.z / rayLocalDir.z;
    if (tHit <= 0) return false;
    out.set(rayLocalOrigin.x + rayLocalDir.x * tHit, rayLocalOrigin.y + rayLocalDir.y * tHit);
    return true;
  };

  // Analytical ambient silk fold height matching SILK_CLOTH_VERT (for subtle downhill fabric-valley gravity!)
  const evalAmbientSilkZ = (px: number, py: number, t: number, energy: number): number => {
    const curve = Math.sin(py * 0.34 - t * 0.24) * 0.95 + Math.cos(px * 0.28 + t * 0.19) * 0.55;
    const ph1 = (px * 0.8211 + py * 0.5708) * 0.78 + curve * 0.85 + t * 0.42;
    const ph2 = (px * -0.4789 + py * 0.8779) * 1.05 - curve * 0.55 - t * 0.34 + 1.2;
    const ph3 = (px * 0.9403 + py * -0.3402) * 1.48 + curve * 0.40 + t * 0.50 + 2.4;
    const ph4 = (px * 0.3490 + py * 0.9371) * 2.05 - t * 0.38 + 0.7;
    return (
      (Math.sin(ph1) * 0.62 +
        Math.sin(ph2) * 0.36 +
        Math.sin(ph3) * 0.18 +
        Math.sin(ph4) * 0.09) *
      energy
    );
  };

  const resize = (width: number, height: number) => {
    if (isDisposed || width <= 0 || height <= 0) return;
    viewportWidth = width;
    viewportHeight = height;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);

    const aspect = width / height;
    currentAspect = aspect;
    marbleR = getMarbleRadius(aspect);

    clothCam.aspect = aspect;
    clothCam.fov = aspect < 0.82 ? 48 : 41;
    clothCam.updateProjectionMatrix();

    marbleCam.left = -aspect;
    marbleCam.right = aspect;
    marbleCam.top = 1;
    marbleCam.bottom = -1;
    marbleCam.updateProjectionMatrix();

    const bw = Math.max(2, Math.round(width * dpr));
    const bh = Math.max(2, Math.round(height * dpr));
    backdropRT.setSize(bw, bh);

    simMat.uniforms.uAspect.value = aspect;
    clothMat.uniforms.uAspect.value = aspect;
    clothMat.uniforms.uMarbleRadius.value = marbleR;
    marbleMat.uniforms.uAspect.value = aspect;
    marbleMat.uniforms.uMarbleRadius.value = marbleR;
    (marbleMat.uniforms.uResolution.value as THREE.Vector2).set(bw, bh);

    // Keep marble cleanly inside resized viewport bounds (respecting optional floor/edge insets)
    const padX = marbleR * 2.35;
    const padY = marbleR * 2.35;
    marbleX = clamp(marbleX, -aspect + playLeftInset + padX, aspect - playRightInset - padX);
    marbleY = clamp(marbleY, -1 + playBottomInset + padY, 1 - playTopInset - padY);

    const nextDims = getSimDims(width, height);
    if (Math.abs(nextDims.sw - simW) > 32 || Math.abs(nextDims.sh - simH) > 32) {
      simW = nextDims.sw;
      simH = nextDims.sh;
      simRead.dispose();
      simWrite.dispose();
      simRead = createFluidRT(simW, simH);
      simWrite = createFluidRT(simW, simH);
      clearFluidTarget(simRead);
      clearFluidTarget(simWrite);
      (simMat.uniforms.uTexelSize.value as THREE.Vector2).set(1 / simW, 1 / simH);
      (clothMat.uniforms.uFluidTexel.value as THREE.Vector2).set(1 / simW, 1 / simH);
    }

    onOverlayResize?.(width, height, renderer, isSoftwareGl);
  };

  const renderFrame = (dt: number) => {
    if (isDisposed) return;

    const expBlend = (rate: number) => 1.0 - Math.exp(-dt * rate);
    currentThemeDark += (targetThemeDark - currentThemeDark) * expBlend(9.0);
    currentAuthBlend += (targetAuthBlend - currentAuthBlend) * expBlend(4.5);
    currentSurge += (targetSurge - currentSurge) * expBlend(3.8);

    smoothPtrX += (targetPtrX - smoothPtrX) * expBlend(6.0);
    smoothPtrY += (targetPtrY - smoothPtrY) * expBlend(6.0);
    smoothGyroX += (targetGyroX - smoothGyroX) * expBlend(9.5);
    smoothGyroY += (targetGyroY - smoothGyroY) * expBlend(9.5);

    if (variantSweep < 2.2) {
      variantSweep = Math.min(2.2, variantSweep + dt * 2.15);
    }

    clothBgCurrent.copy(clothBgLight).lerp(clothBgDark, currentThemeDark);

    // --- Glass Marble 2D Rolling Physics (Gyroscope Gravity + Pointer Grab/Flick) ---
    const prevMarbleX = marbleX;
    const prevMarbleY = marbleY;

    if (!reducedMotion && !isExternalMarbleHidden) {
      // 1. Mobile gyroscope gravity pulls ONLY the glass marble smoothly downhill
      const gyroMag = Math.hypot(smoothGyroX, smoothGyroY);
      if (gyroMag > 0.045) {
        const effScale = (gyroMag - 0.045) / (1.0 - 0.045);
        const gx = (smoothGyroX / gyroMag) * effScale;
        const gy = (smoothGyroY / gyroMag) * effScale;
        const gravityAccel = 3.15;
        marbleVx += gx * gravityAccel * dt;
        marbleVy += gy * gravityAccel * dt;
      }

      // 1b. Subtle silk-fold downhill gravity: heavy marble gently feels the valleys of the draped cloth
      if (!isGrabbingMarble) {
        const silkEnergy = 1.0 - currentAuthBlend * 0.26;
        const silkT = elapsed * 0.85;
        const hEps = 0.16;
        const dzDx =
          (evalAmbientSilkZ(lastClothHitX + hEps, lastClothHitY, silkT, silkEnergy) -
            evalAmbientSilkZ(lastClothHitX - hEps, lastClothHitY, silkT, silkEnergy)) /
          (2 * hEps);
        const dzDy =
          (evalAmbientSilkZ(lastClothHitX, lastClothHitY + hEps, silkT, silkEnergy) -
            evalAmbientSilkZ(lastClothHitX, lastClothHitY - hEps, silkT, silkEnergy)) /
          (2 * hEps);
        const foldGravity = 0.26;
        marbleVx += -dzDx * foldGravity * dt;
        marbleVy += -dzDy * foldGravity * dt;
      }

      // 2. Direct finger/mouse rolling when directly grabbing the marble
      if (isPointerDown && isGrabbingMarble) {
        const dxPtr = pointerWorldX - marbleX;
        const dyPtr = pointerWorldY - marbleY;
        const springK = 54.0;
        const springDamp = 10.2;
        marbleVx += (dxPtr * springK - marbleVx * springDamp) * dt;
        marbleVy += (dyPtr * springK - marbleVy * springDamp) * dt;
      } else {
        // Silky plush fabric rolling resistance: deeper sink in silk slows drifts with tactile weight
        const friction = Math.exp(-dt * 1.32);
        marbleVx *= friction;
        marbleVy *= friction;
      }

      // Cap maximum velocity so wave rings stay graceful & crisp
      const speedNow = Math.hypot(marbleVx, marbleVy);
      const maxSpeed = 3.5;
      if (speedNow > maxSpeed) {
        const s = maxSpeed / speedNow;
        marbleVx *= s;
        marbleVy *= s;
      }

      marbleX += marbleVx * dt;
      marbleY += marbleVy * dt;

      // Soft elastic bounce off viewport edges / floor rail (emits concentric impact ripple + deep fabric press bob!)
      const minX = -currentAspect + playLeftInset + marbleR * 2.2;
      const maxX = currentAspect - playRightInset - marbleR * 2.2;
      const minY = -1.0 + playBottomInset + marbleR * 2.2;
      const maxY = 1.0 - playTopInset - marbleR * 2.2;
      let bouncedImpact = 0;
      let hitFloorImpact = 0;

      if (marbleX < minX) {
        marbleX = minX;
        bouncedImpact = Math.max(bouncedImpact, Math.abs(marbleVx));
        marbleVx = Math.abs(marbleVx) * 0.56;
      } else if (marbleX > maxX) {
        marbleX = maxX;
        bouncedImpact = Math.max(bouncedImpact, Math.abs(marbleVx));
        marbleVx = -Math.abs(marbleVx) * 0.56;
      }

      if (marbleY < minY) {
        marbleY = minY;
        hitFloorImpact = Math.abs(marbleVy);
        bouncedImpact = Math.max(bouncedImpact, hitFloorImpact);
        marbleVy = Math.abs(marbleVy) * 0.56;
      } else if (marbleY > maxY) {
        marbleY = maxY;
        bouncedImpact = Math.max(bouncedImpact, Math.abs(marbleVy));
        marbleVy = -Math.abs(marbleVy) * 0.56;
      }

      if (hitFloorImpact > 0.08) {
        onFloorBounce?.();
      }

      if (bouncedImpact > 0.14) {
        const [bu, bv] = worldToUv(marbleX, marbleY);
        pendingBurstU = bu;
        pendingBurstV = bv;
        pendingBurstStrength = clamp(bouncedImpact * 0.68, 0.30, 0.98);
        pendingBurstRadius = marbleR * 1.22;
        marbleSinkVel += clamp(bouncedImpact * 2.15, 0.65, 2.9);
      }
    }

    const moveDx = marbleX - prevMarbleX;
    const moveDy = marbleY - prevMarbleY;
    const movedDist = Math.hypot(moveDx, moveDy);
    const marbleSpeed = dt > 0.0001 ? movedDist / dt : 0;

    // Accumulate real 3D physical rolling rotation quaternion on the glass sphere
    if (movedDist > 0.00005) {
      rollAxis.set(-moveDy, moveDx, 0).normalize();
      const rollAngle = movedDist / Math.max(0.015, marbleR * 1.6);
      stepQuat.setFromAxisAngle(rollAxis, rollAngle);
      marbleMesh.quaternion.premultiply(stepQuat);
    }

    // Smooth opacity: full crystal presence in Intro, subtle in Auth, fades cleanly on Portal open or 3D stage handoff
    const targetMarbleOpacity = isExternalMarbleHidden
      ? 0
      : clamp((1.0 - currentSurge * 1.35) * (1.0 - currentAuthBlend * 0.35), 0, 1);
    if (isExternalMarbleHidden) {
      marbleOpacity = 0;
    } else {
      marbleOpacity += (targetMarbleOpacity - marbleOpacity) * (1.0 - Math.exp(-dt * 8.0));
    }

    // Notify DOM button collision layer before rendering so bounces apply on the exact impact frame
    if (
      onMarbleStep &&
      !reducedMotion &&
      !isExternalMarbleHidden &&
      marbleOpacity > 0.08 &&
      targetSurge < 0.5
    ) {
      const [preU, preV] = worldToUv(marbleX, marbleY);
      marbleSnapshot.u = preU;
      marbleSnapshot.v = preV;
      marbleSnapshot.radiusNormY = marbleR;
      marbleSnapshot.vx = marbleVx;
      marbleSnapshot.vy = marbleVy;
      marbleSnapshot.speed = Math.hypot(marbleVx, marbleVy);
      marbleSnapshot.aspect = currentAspect;
      marbleSnapshot.isGrabbing = isGrabbingMarble;
      marbleSnapshot.userDriven = userDrivenMarble;
      marbleSnapshot.elapsed = elapsed;
      onMarbleStep(marbleSnapshot);
    }

    const [marbleU, marbleV] = worldToUv(marbleX, marbleY);

    // --- Emit Concentric Circular Ripples Around the Rolling Marble ---
    let marbleWaveStrength = 0;
    if (marbleSpeed > 0.035 && marbleOpacity > 0.05) {
      rippleEmitAccum += movedDist;
      const speedNorm = clamp((marbleSpeed - 0.035) / 1.35, 0, 1);
      // Continuous concentric wake pressure + rhythmic crest pulses as the marble rolls
      const pulseStep = marbleR * 1.45;
      if (rippleEmitAccum >= pulseStep) {
        rippleEmitAccum = rippleEmitAccum % pulseStep;
        marbleWaveStrength = clamp(0.32 + speedNorm * 0.72, 0.32, 1.0);
      } else {
        marbleWaveStrength = clamp(speedNorm * 0.30, 0.05, 0.30);
      }
      fboEnergyTimer = 4.2;
    }

    // --- Update Spring-Damped Heavy Gravity Sink Depth (plush deep crater at rest / fingertip press, subtle skim at speed) ---
    const targetSink = reducedMotion
      ? 1.24
      : isPointerDown && isGrabbingMarble
        ? 1.62
        : clamp(1.30 - marbleSpeed * 0.14, 0.88, 1.30);
    if (reducedMotion) {
      marbleSink = targetSink;
      marbleSinkVel = 0;
    } else {
      const sinkStiffness = 26.0;
      const sinkDamping = 5.4;
      const sinkAccel = (targetSink - marbleSink) * sinkStiffness - marbleSinkVel * sinkDamping;
      marbleSinkVel += sinkAccel * dt;
      marbleSink = clamp(marbleSink + marbleSinkVel * dt, 0.15, 1.88);
    }

    // --- Update C-infinity Smooth Pressed-Fabric Crease Wake behind Rolling Marble ---
    const ageStep = dt / 1.55;
    let maxAliveStrength = 0;
    for (let i = 0; i < TRAIL_NODE_COUNT; i += 1) {
      const n = trailPts[i];
      if (n.w > 0.001) {
        n.z = Math.min(1.0, n.z + ageStep);
        if (n.z >= 1.0) {
          n.w = 0.0;
        } else {
          const alive = (1.0 - n.z) * n.w;
          if (alive > maxAliveStrength) maxAliveStrength = alive;
        }
      }
    }

    if (marbleSpeed > 0.04 && marbleOpacity > 0.05) {
      const wakeStrength = clamp(marbleSpeed * 0.56, 0.18, 0.88);
      const head = trailPts[0];
      const distFromHead = Math.hypot(marbleU - head.x, marbleV - head.y);
      if (head.w <= 0.001 || distFromHead >= 0.011) {
        shiftAndPushTrailNode(marbleU, marbleV, wakeStrength);
        maxAliveStrength = Math.max(maxAliveStrength, wakeStrength);
      } else {
        head.set(marbleU, marbleV, 0.0, Math.max(head.w * 0.92, wakeStrength));
        maxAliveStrength = Math.max(maxAliveStrength, head.w);
      }
    }

    clothMat.uniforms.uTrailActive.value = maxAliveStrength > 0.004 ? 1.0 : 0.0;

    // --- PASS 1: Step 2D Wave Equation FBO (Fixed 60Hz Accumulator so 120fps visuals preserve exact wave speed) ---
    if (useHalfFloat) {
      if (marbleWaveStrength > 0.001) {
        queuedMarbleWaveU = marbleU;
        queuedMarbleWaveV = marbleV;
        queuedMarbleWaveStrength = Math.max(queuedMarbleWaveStrength, marbleWaveStrength);
      }
      if (pendingBurstStrength > 0.001 || queuedMarbleWaveStrength > 0.001) {
        fboEnergyTimer = 4.5;
      }
      if (fboEnergyTimer > 0) {
        fboEnergyTimer = Math.max(0, fboEnergyTimer - dt);
        fboStepAccum = Math.min(fboStepAccum + dt, FBO_FIXED_STEP_SEC * 2.5);
        // Ignite discrete bursts (tap / bounce / theme wave) with 0-frame latency
        if (pendingBurstStrength > 0.001 && fboStepAccum < FBO_FIXED_STEP_SEC) {
          fboStepAccum = FBO_FIXED_STEP_SEC;
        }

        const fboSteps = Math.min(2, Math.floor(fboStepAccum / FBO_FIXED_STEP_SEC));
        for (let stepIdx = 0; stepIdx < fboSteps; stepIdx += 1) {
          fboStepAccum -= FBO_FIXED_STEP_SEC;
          simMat.uniforms.uPrevState.value = simRead.texture;
          simMat.uniforms.uDecay.value = 0.976 + currentSurge * 0.008;

          (simMat.uniforms.uBurstPos.value as THREE.Vector2).set(pendingBurstU, pendingBurstV);
          simMat.uniforms.uBurstStrength.value = pendingBurstStrength;
          simMat.uniforms.uBurstRadius.value = pendingBurstRadius;

          (simMat.uniforms.uMarbleWavePos.value as THREE.Vector2).set(
            queuedMarbleWaveU,
            queuedMarbleWaveV
          );
          simMat.uniforms.uMarbleWaveStrength.value = queuedMarbleWaveStrength;
          simMat.uniforms.uMarbleWaveRadius.value = marbleR * 0.92;

          renderer.setRenderTarget(simWrite);
          renderer.render(simScene, orthoCam);

          const temp = simRead;
          simRead = simWrite;
          simWrite = temp;

          // Consume impulse queues on the first fixed step so multi-step catchup doesn't double-inject
          pendingBurstStrength = 0;
          queuedMarbleWaveStrength = 0;
        }
      } else {
        fboStepAccum = 0;
        pendingBurstStrength = 0;
        queuedMarbleWaveStrength = 0;
      }
    } else {
      const waveAgeStep = dt / 2.1;
      let anyAnalyticAlive = false;
      for (let i = 0; i < ANALYTIC_WAVE_COUNT; i += 1) {
        const w = analyticWaves[i];
        if (w.w > 0.001) {
          w.z = Math.min(1.0, w.z + waveAgeStep);
          if (w.z >= 1.0) {
            w.w = 0.0;
          } else {
            anyAnalyticAlive = true;
          }
        }
      }
      if (pendingBurstStrength > 0.001) {
        pushAnalyticWave(pendingBurstU, pendingBurstV, pendingBurstStrength);
        anyAnalyticAlive = true;
      }
      if (marbleWaveStrength >= 0.31) {
        pushAnalyticWave(marbleU, marbleV, marbleWaveStrength * 0.85);
        anyAnalyticAlive = true;
      }
      clothMat.uniforms.uAnalyticActive.value = anyAnalyticAlive ? 1.0 : 0.0;
      pendingBurstStrength = 0;
    }

    // --- PASS 2: Render 3D Silk Cloth + Gravitational Depression Bowl into backdropRT ---
    // Camera stays completely steady on phone tilt (no gyro camera wobble!)
    clothCam.position.x = smoothPtrX * 0.14;
    clothCam.position.y = smoothPtrY * 0.10;
    clothCam.position.z = (clothCam.aspect < 0.82 ? 8.2 : 7.3) + currentAuthBlend * 0.5;
    clothCam.lookAt(0, 0, -0.4);
    clothCam.updateMatrixWorld();
    clothMesh.updateMatrixWorld();

    // Project exact marble screen position onto the 3D silk cloth plane for pixel-locked 3D vertex depression
    invClothMat.copy(clothMesh.matrixWorld).invert();
    const marbleNdcX = marbleU * 2.0 - 1.0;
    const marbleNdcY = marbleV * 2.0 - 1.0;
    let clothRadius = 0.36;
    if (projectNdcToClothLocal(marbleNdcX, marbleNdcY, clothHitCenter)) {
      lastClothHitX = clothHitCenter.x;
      lastClothHitY = clothHitCenter.y;
      if (projectNdcToClothLocal(marbleNdcX, marbleNdcY + marbleR * 2.0, clothHitRim)) {
        clothRadius = clamp(clothHitCenter.distanceTo(clothHitRim), 0.18, 0.95);
      }
    }

    const effectiveSink = marbleSink * marbleOpacity;
    clothMat.uniforms.uFluidTex.value = simRead.texture;
    clothMat.uniforms.uTime.value = elapsed;
    clothMat.uniforms.uThemeDark.value = currentThemeDark;
    clothMat.uniforms.uAuthBlend.value = currentAuthBlend;
    clothMat.uniforms.uSurge.value = currentSurge;
    clothMat.uniforms.uVariantSweep.value = variantSweep;
    (clothMat.uniforms.uPointer.value as THREE.Vector2).set(smoothPtrX, smoothPtrY);
    (clothMat.uniforms.uMarbleUv.value as THREE.Vector2).set(marbleU, marbleV);
    clothMat.uniforms.uMarbleOpacity.value = marbleOpacity;
    (clothMat.uniforms.uMarbleClothPos.value as THREE.Vector2).set(lastClothHitX, lastClothHitY);
    clothMat.uniforms.uMarbleClothRadius.value = clothRadius;
    clothMat.uniforms.uMarbleSink.value = effectiveSink;
    (clothMat.uniforms.uMarbleVel.value as THREE.Vector2).set(marbleVx, marbleVy);

    renderer.setRenderTarget(backdropRT);
    renderer.render(clothScene, clothCam);

    // --- PASS 3: Blit Silk Backdrop to Screen + Overlay Theme-Reactive Transparent Glass Marble ---
    renderer.setRenderTarget(null);
    renderer.autoClear = true;
    renderer.render(blitScene, orthoCam);

    if (!isExternalMarbleHidden && marbleOpacity > 0.01) {
      // Evaluate exact Luxury <-> Aurora wave state right at the marble's position so
      // the crystal orb morphs seamlessly the instant the theme wave sweeps across it!
      const dBtn = Math.hypot((marbleU - variantOriginU) * currentAspect, marbleV - variantOriginV);
      const waveAtMarble = 1.0 - smoothstepJs(variantSweep - 0.26, variantSweep + 0.04, dBtn);
      const marbleAurora = prevVariantVal + (currentVariantVal - prevVariantVal) * waveAtMarble;

      // Perspective recession as the heavy marble sinks deeper away from the camera into the silk crater
      const sinkScale = 1.0 - clamp(marbleSink, 0.0, 1.85) * 0.072;
      const worldR = marbleR * 2.0 * sinkScale;
      marbleMesh.position.set(marbleX, marbleY, 0);
      marbleMesh.scale.set(worldR, worldR, worldR);

      marbleMat.uniforms.uTime.value = elapsed;
      marbleMat.uniforms.uThemeDark.value = currentThemeDark;
      marbleMat.uniforms.uMarbleOpacity.value = marbleOpacity;
      marbleMat.uniforms.uMarbleAurora.value = marbleAurora;
      marbleMat.uniforms.uMarbleSink.value = marbleSink;

      renderer.autoClear = false;
      renderer.render(marbleScene, marbleCam);
      renderer.autoClear = true;
    }

    // --- PASS 4: Optional Single-Canvas 3D Stage Director Overlay (Website-only) ---
    if (onOverlayRender) {
      renderer.autoClear = false;
      renderer.clearDepth();
      try {
        overlayWasActive = Boolean(
          onOverlayRender({
            renderer,
            width: viewportWidth,
            height: viewportHeight,
            dt,
            elapsed,
            reducedMotion,
            isSoftwareGl,
          })
        );
      } finally {
        renderer.autoClear = true;
      }
    } else {
      overlayWasActive = false;
    }
  };

  const isLoopPaused = () =>
    isDisposed || reducedMotion || isDocHidden || isExternallyPaused || isContextLost;

  const clearPendingFence = () => {
    if (fenceRafId) {
      window.cancelAnimationFrame(fenceRafId);
      fenceRafId = 0;
    }
    if (activeFenceSync) {
      const gl = renderer.getContext();
      if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
        try {
          gl.deleteSync(activeFenceSync);
        } catch {
          // ignore if context was lost
        }
      }
      activeFenceSync = null;
    }
  };

  const stopLoop = () => {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (softTimerId) {
      window.clearTimeout(softTimerId);
      softTimerId = 0;
    }
    clearPendingFence();
  };

  const scheduleAfterDrawSoftware = (fn: () => void) => {
    if (isLoopPaused()) return;
    const gl = renderer.getContext();
    if (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext) {
      clearPendingFence();
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      if (sync) {
        activeFenceSync = sync;
        gl.flush();
        const pollFence = () => {
          fenceRafId = 0;
          if (isLoopPaused() || activeFenceSync !== sync) {
            clearPendingFence();
            return;
          }
          const status = gl.clientWaitSync(sync, 0, 0);
          if (status === gl.TIMEOUT_EXPIRED) {
            fenceRafId = window.requestAnimationFrame(pollFence);
            return;
          }
          clearPendingFence();
          softTimerId = window.setTimeout(() => {
            softTimerId = 0;
            fn();
          }, 80);
        };
        fenceRafId = window.requestAnimationFrame(pollFence);
        return;
      }
    }
    softTimerId = window.setTimeout(() => {
      softTimerId = 0;
      fn();
    }, 80);
  };

  const scheduleNextFrame = () => {
    if (isLoopPaused()) return;
    if (isSoftwareGl) {
      scheduleAfterDrawSoftware(() => {
        if (!isLoopPaused()) {
          tick(performance.now());
        }
      });
    } else if (!rafId) {
      rafId = window.requestAnimationFrame(tick);
    }
  };

  const syncLoopLifecycle = () => {
    if (isLoopPaused()) {
      pacer.fpsTier = 'paused';
      stopLoop();
      return;
    }
    if (!rafId && !softTimerId && !fenceRafId) {
      const resumeNow = performance.now();
      lastNow = resumeNow;
      resetPacerOnResume(pacer, resumeNow);
      scheduleNextFrame();
    }
  };

  const onContextLost = (e: Event) => {
    e.preventDefault();
    isContextLost = true;
    syncLoopLifecycle();
  };
  const onContextRestored = () => {
    isContextLost = false;
    clearFluidTarget(simRead);
    clearFluidTarget(simWrite);
    fboStepAccum = 0;
    lastNow = performance.now();
    resetPacerOnResume(pacer, lastNow);
    onOverlayContextRestored?.(renderer);
    renderFrame(0.016);
    syncLoopLifecycle();
  };
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  const onVisibilityChange = () => {
    isDocHidden = document.hidden;
    syncLoopLifecycle();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const tick = (now: number) => {
    rafId = 0;
    if (isLoopPaused()) return;

    if (!isSoftwareGl) {
      sampleDisplayRefreshHz(pacer, now);

      const marbleSpeedNow = Math.hypot(marbleVx, marbleVy);
      const isBoostActive =
        isPointerDown ||
        isGrabbingMarble ||
        marbleSpeedNow > 0.08 ||
        Math.abs(marbleSinkVel) > 0.055 ||
        variantSweep < 2.15 ||
        Math.abs(targetThemeDark - currentThemeDark) > 0.01 ||
        Math.abs(targetAuthBlend - currentAuthBlend) > 0.01 ||
        Math.abs(targetSurge - currentSurge) > 0.01;
      const isStandardActive =
        overlayWasActive ||
        marbleSpeedNow > 0.018 ||
        Math.abs(marbleSinkVel) > 0.015 ||
        Math.hypot(targetGyroX, targetGyroY) > 0.05 ||
        Math.hypot(targetPtrX - smoothPtrX, targetPtrY - smoothPtrY) > 0.012 ||
        fboEnergyTimer > 0.05 ||
        pendingBurstStrength > 0.001;

      const tier = resolveFpsTier(pacer, now, {
        paused: false,
        isBoostActive,
        isStandardActive,
        boostHoldMs: 650,
        idleHoldMs: 1800,
      });

      if (!shouldCommitFrame(pacer, now, tier)) {
        pacer.skippedFrames += 1;
        scheduleNextFrame();
        return;
      }

      const workStart = performance.now();
      const dt = clamp((now - lastNow) / 1000, 0.001, 0.05);
      lastNow = now;
      pacer.lastCommitNow = now;
      pacer.committedFrames += 1;
      elapsed += dt;
      renderFrame(dt);
      recordFrameWorkCost(pacer, Math.max(0, performance.now() - workStart), now, tier);
      scheduleNextFrame();
      return;
    }

    // Software WebGL path (paced via afterDraw GPU fence + 80ms wait)
    const dt = clamp((now - lastNow) / 1000, 0.001, 0.05);
    lastNow = now;
    pacer.lastCommitNow = now;
    pacer.committedFrames += 1;
    elapsed += dt;
    renderFrame(dt);
    scheduleNextFrame();
  };

  resize(initialW, initialH);
  renderFrame(0.016);
  syncLoopLifecycle();

  return {
    setTheme(isDark: boolean, snapImmediately = false) {
      targetThemeDark = isDark ? 1 : 0;
      markPacerActivity(pacer, performance.now(), true);
      if (snapImmediately || reducedMotion) {
        currentThemeDark = targetThemeDark;
        renderFrame(0.001);
      }
    },
    setStage(stage: 'intro' | 'auth' | 'portal') {
      targetAuthBlend = stage === 'auth' ? 1 : 0;
      targetSurge = stage === 'portal' ? 1 : 0;
      markPacerActivity(pacer, performance.now(), true);
      if (reducedMotion) {
        currentAuthBlend = targetAuthBlend;
        currentSurge = targetSurge;
        renderFrame(0.001);
      }
    },
    setPaused(paused: boolean) {
      if (isExternallyPaused === paused) return;
      isExternallyPaused = paused;
      syncLoopLifecycle();
    },
    setVariant(variant: LoginThreeVariantId, originNx?: number, originNy?: number) {
      const nextVal = variant === 'aurora' ? 1 : 0;
      if (nextVal === currentVariantVal && variantSweep >= 2.0) return;
      markPacerActivity(pacer, performance.now(), true);

      const u = typeof originNx === 'number' && Number.isFinite(originNx)
        ? clamp(originNx * 0.5 + 0.5, 0.02, 0.98)
        : 0.14;
      const v = typeof originNy === 'number' && Number.isFinite(originNy)
        ? clamp(originNy * 0.5 + 0.5, 0.02, 0.98)
        : 0.92;

      prevVariantVal = currentVariantVal;
      currentVariantVal = nextVal;
      variantOriginU = u;
      variantOriginV = v;

      clothMat.uniforms.uPrevVariant.value = prevVariantVal;
      clothMat.uniforms.uNextVariant.value = currentVariantVal;
      (clothMat.uniforms.uVariantOrigin.value as THREE.Vector2).set(u, v);

      if (reducedMotion) {
        variantSweep = 2.2;
        prevVariantVal = nextVal;
        clothMat.uniforms.uPrevVariant.value = nextVal;
        renderFrame(0.001);
      } else {
        variantSweep = 0.01;
        pendingBurstU = u;
        pendingBurstV = v;
        pendingBurstStrength = 0.92;
        pendingBurstRadius = 0.038;
        // Gentle sympathetic nudge on the marble when the theme wave starts
        const [btnWx, btnWy] = nxNyToWorld(u * 2 - 1, v * 2 - 1);
        const dx = marbleX - btnWx;
        const dy = marbleY - btnWy;
        const d = Math.hypot(dx, dy) || 1;
        marbleVx += (dx / d) * 0.35;
        marbleVy += (dy / d) * 0.35;
      }
    },
    setPointer(nx: number, ny: number, _velocity: number) {
      const cx = clamp(nx, -1, 1);
      const cy = clamp(ny, -1, 1);
      targetPtrX = cx;
      targetPtrY = cy;

      const [wx, wy] = nxNyToWorld(cx, cy);
      const dx = wx - lastPointerWorldX;
      const dy = wy - lastPointerWorldY;
      lastPointerWorldX = wx;
      lastPointerWorldY = wy;
      pointerWorldX = wx;
      pointerWorldY = wy;

      const moveDist = Math.hypot(dx, dy);

      if (isPointerDown) {
        markPacerActivity(pacer, performance.now(), true);
        pointerTotalDragDist += moveDist;
        recordPtrSample(wx, wy);
        if (moveDist > 0.0008) {
          userDrivenMarble = true;
        }

        if (!isGrabbingMarble && moveDist > 0.0008) {
          // Swiping anywhere on the open screen rolls the marble in the EXACT direction of your hand!
          marbleVx = clamp(marbleVx + dx * 12.5, -3.4, 3.4);
          marbleVy = clamp(marbleVy + dy * 12.5, -3.4, 3.4);
        }
      } else if (moveDist > 0.0015) {
        // Desktop hover brush: brushing past the marble rolls it cleanly in the cursor's travel direction
        const distToMarble = Math.hypot(wx - marbleX, wy - marbleY);
        const touchRange = marbleR * 3.4;
        const nearMarble = distToMarble < touchRange;
        markPacerActivity(pacer, performance.now(), nearMarble || moveDist > 0.018);
        if (nearMarble) {
          userDrivenMarble = true;
          const proximity = 0.35 + 0.65 * (1.0 - distToMarble / touchRange);
          marbleVx = clamp(marbleVx + dx * 14.5 * proximity, -3.2, 3.2);
          marbleVy = clamp(marbleVy + dy * 14.5 * proximity, -3.2, 3.2);
        }
      }
    },
    setPointerDown(down: boolean, nx?: number, ny?: number) {
      markPacerActivity(pacer, performance.now(), true);
      if (down) {
        isPointerDown = true;
        ptrSamples.length = 0;
        pointerTotalDragDist = 0;
        if (typeof nx === 'number' && typeof ny === 'number') {
          const [wx, wy] = nxNyToWorld(nx, ny);
          pointerWorldX = wx;
          pointerWorldY = wy;
          lastPointerWorldX = wx;
          lastPointerWorldY = wy;
          pointerDownWorldX = wx;
          pointerDownWorldY = wy;
          recordPtrSample(wx, wy);
          const distToMarble = Math.hypot(wx - marbleX, wy - marbleY);
          isGrabbingMarble = distToMarble <= marbleR * 4.6;
          if (isGrabbingMarble) {
            userDrivenMarble = true;
          }
        }
      } else {
        if (isPointerDown) {
          const [flickVx, flickVy] = computeFlickVelocity();
          const flickSpeed = Math.hypot(flickVx, flickVy);

          if (pointerTotalDragDist < 0.04 && flickSpeed < 0.18 && !isGrabbingMarble) {
            // Quick tap without dragging: emit ripple & gently roll marble toward the tapped spot
            userDrivenMarble = true;
            const [u, v] = worldToUv(pointerDownWorldX, pointerDownWorldY);
            pendingBurstU = u;
            pendingBurstV = v;
            pendingBurstStrength = 0.72;
            pendingBurstRadius = 0.026;
            const dx = pointerDownWorldX - marbleX;
            const dy = pointerDownWorldY - marbleY;
            const dist = Math.hypot(dx, dy);
            if (dist > marbleR * 1.4) {
              const pull = clamp(dist * 1.35, 0.45, 1.75);
              marbleVx += (dx / dist) * pull;
              marbleVy += (dy / dist) * pull;
            }
          } else if (flickSpeed > 0.08) {
            // Hand flick / directional push release: launch cleanly in exact swipe direction!
            userDrivenMarble = true;
            const blend = isGrabbingMarble ? 0.92 : 0.72;
            marbleVx = clamp(marbleVx * (1 - blend) + flickVx * blend, -3.5, 3.5);
            marbleVy = clamp(marbleVy * (1 - blend) + flickVy * blend, -3.5, 3.5);
          }
        }
        isPointerDown = false;
        isGrabbingMarble = false;
        ptrSamples.length = 0;
        pointerTotalDragDist = 0;
      }
    },
    pushDirectionalSwipe(dxWorldNorm: number, dyWorldNorm: number) {
      if (!Number.isFinite(dxWorldNorm) || !Number.isFinite(dyWorldNorm)) return;
      markPacerActivity(pacer, performance.now(), true);
      userDrivenMarble = true;
      const dx = dxWorldNorm * currentAspect;
      const dy = dyWorldNorm;
      marbleVx = clamp(marbleVx + dx * 12.0, -3.4, 3.4);
      marbleVy = clamp(marbleVy + dy * 12.0, -3.4, 3.4);
    },
    pushScrollImpulse(_nx: number, deltaY: number) {
      if (!Number.isFinite(deltaY) || deltaY === 0) return;
      markPacerActivity(pacer, performance.now(), Math.abs(deltaY) > 12);
      userDrivenMarble = true;
      const impulse = clamp(-deltaY / 240, -1.15, 1.15);
      marbleVy = clamp(marbleVy + impulse * 0.95, -2.6, 2.6);
      marbleVx = clamp(marbleVx + Math.sin(elapsed * 2.1) * Math.abs(impulse) * 0.22, -2.6, 2.6);
    },
    setTilt(tx: number, ty: number, _dtx: number, _dty: number) {
      // Strictly feeds gravity to the glass marble ONLY (zero cloth/camera/wave slosh!)
      targetGyroX = clamp(tx, -1, 1);
      targetGyroY = clamp(ty, -1, 1);
      const tiltMag = Math.hypot(targetGyroX, targetGyroY);
      if (tiltMag > 0.05) {
        markPacerActivity(pacer, performance.now(), tiltMag > 0.16);
      }
      if (tiltMag > 0.09) {
        userDrivenMarble = true;
      }
    },
    bounceMarble(
      normalWorldX: number,
      normalWorldY: number,
      sepWorldX: number,
      sepWorldY: number,
      impactStrength = 0.85,
      minBounceSpeed = 0.62
    ) {
      markPacerActivity(pacer, performance.now(), true);
      const nLen = Math.hypot(normalWorldX, normalWorldY) || 1;
      const nx = normalWorldX / nLen;
      const ny = normalWorldY / nLen;

      // Release active grab so dragging the marble into a button clicks cleanly and bounces away
      isGrabbingMarble = false;

      const pad = marbleR * 2.2;
      marbleX = clamp(
        marbleX + sepWorldX,
        -currentAspect + playLeftInset + pad,
        currentAspect - playRightInset - pad
      );
      marbleY = clamp(
        marbleY + sepWorldY,
        -1.0 + playBottomInset + pad,
        1.0 - playTopInset - pad
      );

      // Reflect incoming velocity across the button surface normal with glassy elastic restitution
      const vn = marbleVx * nx + marbleVy * ny;
      const restitution = 0.68;
      if (vn < 0) {
        marbleVx -= (1 + restitution) * vn * nx;
        marbleVy -= (1 + restitution) * vn * ny;
      }

      // Guarantee a crisp visible rebound away from the struck button
      const outSpeed = marbleVx * nx + marbleVy * ny;
      if (outSpeed < minBounceSpeed) {
        const boost = minBounceSpeed - outSpeed;
        marbleVx += nx * boost;
        marbleVy += ny * boost;
      }

      marbleVx = clamp(marbleVx, -3.5, 3.5);
      marbleVy = clamp(marbleVy, -3.5, 3.5);

      const [bu, bv] = worldToUv(marbleX, marbleY);
      pendingBurstU = bu;
      pendingBurstV = bv;
      pendingBurstStrength = clamp(impactStrength, 0.35, 1.05);
      pendingBurstRadius = marbleR * 1.38;
      marbleSinkVel += clamp(impactStrength * 2.1, 0.75, 2.6);
      fboEnergyTimer = 4.5;
    },
    setPlayBounds(bounds) {
      if (typeof bounds.bottomInsetWorld === 'number' && Number.isFinite(bounds.bottomInsetWorld)) {
        playBottomInset = clamp(bounds.bottomInsetWorld, 0, 1.2);
      }
      if (typeof bounds.topInsetWorld === 'number' && Number.isFinite(bounds.topInsetWorld)) {
        playTopInset = clamp(bounds.topInsetWorld, 0, 1.2);
      }
      if (typeof bounds.leftInsetWorld === 'number' && Number.isFinite(bounds.leftInsetWorld)) {
        playLeftInset = clamp(bounds.leftInsetWorld, 0, Math.max(0.2, currentAspect * 0.6));
      }
      if (typeof bounds.rightInsetWorld === 'number' && Number.isFinite(bounds.rightInsetWorld)) {
        playRightInset = clamp(bounds.rightInsetWorld, 0, Math.max(0.2, currentAspect * 0.6));
      }
      const pad = marbleR * 2.2;
      marbleX = clamp(marbleX, -currentAspect + playLeftInset + pad, currentAspect - playRightInset - pad);
      marbleY = clamp(marbleY, -1.0 + playBottomInset + pad, 1.0 - playTopInset - pad);
    },
    setExternalMarbleHidden(hidden: boolean) {
      isExternalMarbleHidden = hidden;
      if (hidden) {
        isPointerDown = false;
        isGrabbingMarble = false;
      }
      markPacerActivity(pacer, performance.now(), true);
      if (reducedMotion && !isDisposed && !isContextLost && !isDocHidden && !isExternallyPaused) {
        renderFrame(0.001);
      }
    },
    resetHeroMarble() {
      const pad = marbleR * 2.2;
      marbleX = clamp(0.0, -currentAspect + playLeftInset + pad, currentAspect - playRightInset - pad);
      marbleY = clamp(-0.28, -1.0 + playBottomInset + pad, 1.0 - playTopInset - pad);
      marbleVx = 0.0;
      marbleVy = 0.0;
      isPointerDown = false;
      isGrabbingMarble = false;
      userDrivenMarble = false;
      marbleSink = 1.24;
      marbleSinkVel = 0.0;
      markPacerActivity(pacer, performance.now(), true);
    },
    getMarbleSnapshot() {
      const [u, v] = worldToUv(marbleX, marbleY);
      marbleSnapshot.u = u;
      marbleSnapshot.v = v;
      marbleSnapshot.radiusNormY = marbleR;
      marbleSnapshot.vx = marbleVx;
      marbleSnapshot.vy = marbleVy;
      marbleSnapshot.speed = Math.hypot(marbleVx, marbleVy);
      marbleSnapshot.aspect = currentAspect;
      marbleSnapshot.isGrabbing = isGrabbingMarble;
      marbleSnapshot.userDriven = userDrivenMarble;
      marbleSnapshot.elapsed = elapsed;
      return { ...marbleSnapshot };
    },
    requestRender() {
      markPacerActivity(pacer, performance.now(), true);
      if (reducedMotion && !isDisposed && !isContextLost && !isDocHidden && !isExternallyPaused) {
        renderFrame(0.016);
      }
    },
    triggerPulse(nx: number, ny: number, strength = 0.72) {
      markPacerActivity(pacer, performance.now(), true);
      const u = clamp(nx * 0.5 + 0.5, 0.02, 0.98);
      const v = clamp(ny * 0.5 + 0.5, 0.02, 0.98);
      pendingBurstU = u;
      pendingBurstV = v;
      pendingBurstStrength = clamp(strength, 0.22, 1.05);
      pendingBurstRadius = 0.026;
      if (reducedMotion) {
        renderFrame(0.016);
      }
    },
    triggerLoginSurge(_nx: number, _ny: number) {
      // Calmly fade marble during logo flight without emitting a duplicate pre-flight FBO ripple
      markPacerActivity(pacer, performance.now(), true);
      targetSurge = 1;
    },
    resize,
    dispose() {
      isDisposed = true;
      stopLoop();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      onOverlayDispose?.();

      simRead.dispose();
      simWrite.dispose();
      backdropRT.dispose();
      quadGeo.dispose();
      simMat.dispose();
      clothGeo.dispose();
      clothMat.dispose();
      blitMat.dispose();
      marbleGeo.dispose();
      marbleMat.dispose();
      renderer.dispose();
    },
  };
}
