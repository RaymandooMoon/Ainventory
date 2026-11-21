import * as THREE from 'three';

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

export interface LoginThreeController {
  setTheme: (isDark: boolean, snapImmediately?: boolean) => void;
  setStage: (stage: 'intro' | 'auth' | 'portal') => void;
  setVariant: (variant: LoginThreeVariantId, originNx?: number, originNy?: number) => void;
  setPointer: (nx: number, ny: number, velocity: number) => void;
  setTilt: (tx: number, ty: number, dtx: number, dty: number) => void;
  triggerPulse: (nx: number, ny: number, strength?: number) => void;
  triggerLoginSurge: (nx: number, ny: number) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

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
// PASS 1: PING-PONG FBO FINGERTIP-SCALE TACTILE SILK RIPPLE SIMULATION
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
  uniform vec2 uGravityTilt; // (-1..1) mobile gyro tilt

  // Compact Fingertip Pointer / Touch Brush
  uniform vec2 uBrushPos;
  uniform vec2 uBrushPrev;
  uniform float uBrushStrength;
  uniform float uBrushRadius;

  // Compact Fingertip Tap / Button Origin Wave Burst
  uniform vec2 uBurstPos;
  uniform float uBurstStrength;
  uniform float uBurstRadius;

  // Mobile Gyro Slosh Splat
  uniform vec2 uTiltPos;
  uniform float uTiltStrength;
  uniform vec2 uTiltDir;

  varying vec2 vUv;

  vec4 decodeState(vec4 raw) {
    return mix(raw, raw * 2.0 - 1.0, uEncodedByte);
  }

  vec4 encodeState(vec4 val) {
    vec4 clamped = clamp(val, vec4(-1.0), vec4(1.0));
    return mix(clamped, clamped * 0.5 + 0.5, uEncodedByte);
  }

  float distToSegment(vec2 p, vec2 a, vec2 b, vec2 aspectScale) {
    vec2 pa = (p - a) * aspectScale;
    vec2 ba = (b - a) * aspectScale;
    float denom = dot(ba, ba);
    float h = denom > 0.00001 ? clamp(dot(pa, ba) / denom, 0.0, 1.0) : 0.0;
    return length(pa - ba * h);
  }

  void main() {
    vec2 advectUv = clamp(vUv - uGravityTilt * uTexelSize * 1.1, vec2(0.002), vec2(0.998));

    vec4 c = decodeState(texture2D(uPrevState, advectUv));
    float hN = decodeState(texture2D(uPrevState, clamp(advectUv + vec2(0.0, uTexelSize.y), 0.0, 1.0))).r;
    float hS = decodeState(texture2D(uPrevState, clamp(advectUv - vec2(0.0, uTexelSize.y), 0.0, 1.0))).r;
    float hE = decodeState(texture2D(uPrevState, clamp(advectUv + vec2(uTexelSize.x, 0.0), 0.0, 1.0))).r;
    float hW = decodeState(texture2D(uPrevState, clamp(advectUv - vec2(uTexelSize.x, 0.0), 0.0, 1.0))).r;

    // Softly damped cloth wave propagation
    float avg = (hN + hS + hE + hW) * 0.25;
    float nextH = (avg * 2.0 - c.g) * uDecay;
    float prevH = c.r;
    vec2 vel = c.ba * 0.936;

    vec2 aspectScale = vec2(uAspect, 1.0);

    // 1. Fingertip-scale drag brush (crisp indented silk trail)
    if (uBrushStrength > 0.001) {
      float dSeg = distToSegment(vUv, uBrushPrev, uBrushPos, aspectScale);
      float r = max(0.016, uBrushRadius);
      float splat = exp(-(dSeg * dSeg) / (r * r));
      vec2 strokeDir = clamp((uBrushPos - uBrushPrev) * 20.0, vec2(-1.0), vec2(1.0));
      nextH += splat * uBrushStrength * 0.34;
      vel += strokeDir * splat * clamp(uBrushStrength * 1.05, 0.16, 1.15);
    }

    // 2. Refined fingertip touch dimple & crisp silk ripple wave
    if (uBurstStrength > 0.001) {
      float dBurst = length((vUv - uBurstPos) * aspectScale);
      float r = max(0.018, uBurstRadius);
      // Tactile fingertip dimple center + graceful silk ripple collar
      float dimple = -exp(-(dBurst * dBurst) / (r * r)) * 0.56;
      float collar = exp(-pow((dBurst - r * 1.42) / (r * 0.98), 2.0)) * 0.68;
      vec2 radialDir = normalize((vUv - uBurstPos) * aspectScale + vec2(0.0001));
      nextH += (dimple + collar) * uBurstStrength * 0.62;
      vel += radialDir * exp(-dBurst / (r * 2.5)) * uBurstStrength * 0.48;
    }

    // 3. Mobile gyroscope tilt billow
    if (uTiltStrength > 0.001) {
      float dTilt = length((vUv - uTiltPos) * aspectScale);
      float tiltSplat = exp(-(dTilt * dTilt) / 0.018);
      nextH += tiltSplat * uTiltStrength * 0.18;
      vel += uTiltDir * tiltSplat * uTiltStrength * 0.45;
    }

    // Smooth edge boundary absorption
    vec2 edge = min(vUv, 1.0 - vUv);
    float edgeMask = smoothstep(0.0, 0.05, min(edge.x, edge.y));
    nextH *= mix(0.80, 1.0, edgeMask);
    vel *= mix(0.80, 1.0, edgeMask);

    gl_FragColor = encodeState(vec4(nextH, prevH, vel.x, vel.y));
  }
`;

// ============================================================================
// PASS 2: TRUE 3D PINCHED-PLEAT SILK CLOTH MESH
// - Real 3D perspective foreshortened Gerstner-style cloth gathering (XY pinch + Z billows)
// - Physically-based Charlie Velvet/Silk Sheen + Soft Studio Softbox Specular
// - ACES Filmic Tone Mapping (ZERO harsh white blowout, ZERO artificial grid pattern)
// - True OLED #000000 deep fold valleys in Dark Mode
// - Button-Originated Radial Silk Color Transition Wave (Luxury <-> Aurora)
// ============================================================================

const SILK_CLOTH_VERT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uAuthBlend;
  uniform float uSurge;
  uniform vec2 uGravityTilt;

  varying vec2 vUv;
  varying vec2 vScreenUv;
  varying vec3 vWorldPos;
  varying vec3 vNormalDir;
  varying vec3 vTangentDir;
  varying float vFoldHeight;
  varying float vFoldCrest;

  // True 3D pinched-pleat silk displacement:
  // Real cloth doesn't just move up/down in Z — it gathers inward in XY at crests (Gerstner cloth)
  // creating unmistakable narrow rounded silk pleats and broad graceful valleys!
  vec3 evalSilkDisplace(vec2 basePos, float t, vec2 tilt, float energy) {
    vec2 p = basePos + tilt * 0.45;

    // 4 multi-directional draped couture waves
    vec2 d1 = normalize(vec2(0.82, 0.57));
    vec2 d2 = normalize(vec2(-0.48, 0.88));
    vec2 d3 = normalize(vec2(0.94, -0.34));
    vec2 d4 = normalize(vec2(0.35, 0.94));

    // Organic curved drapery warp so pleats sweep in S-curves like real hung silk
    float curve = sin(p.y * 0.34 - t * 0.24) * 0.95 + cos(p.x * 0.28 + t * 0.19) * 0.55;

    float ph1 = dot(p, d1) * 0.78 + curve * 0.85 + t * 0.42;
    float ph2 = dot(p, d2) * 1.05 - curve * 0.55 - t * 0.34 + 1.2;
    float ph3 = dot(p, d3) * 1.48 + curve * 0.40 + t * 0.50 + 2.4;
    float ph4 = dot(p, d4) * 2.05 - t * 0.38 + 0.7;

    float a1 = 0.62 * energy;
    float a2 = 0.36 * energy;
    float a3 = 0.18 * energy;
    float a4 = 0.09 * energy;

    // Horizontal cloth gathering (steepness) creates authentic pinched silk folds!
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

    return vec3(basePos.x + xyShift.x, basePos.y + xyShift.y, zHeight);
  }

  void main() {
    vUv = uv;
    float energy = mix(1.0, 0.74, uAuthBlend) + uSurge * 0.35;
    float t = uTime * (0.85 + uSurge * 0.65);

    vec3 displaced = evalSilkDisplace(position.xy, t, uGravityTilt, energy);

    // Analytic finite-difference tangent & bitangent in 3D space for silky-smooth normals
    float eps = 0.08;
    vec3 px = evalSilkDisplace(position.xy + vec2(eps, 0.0), t, uGravityTilt, energy);
    vec3 py = evalSilkDisplace(position.xy + vec2(0.0, eps), t, uGravityTilt, energy);

    vec3 tang = normalize(px - displaced);
    vec3 bitang = normalize(py - displaced);
    vec3 norm = normalize(cross(tang, bitang));

    mat3 worldRot = mat3(modelMatrix);
    vNormalDir = normalize(worldRot * norm);
    vTangentDir = normalize(worldRot * tang);
    vFoldHeight = displaced.z;
    vFoldCrest = clamp((displaced.z + 0.85) / 1.75, 0.0, 1.0);

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
  uniform vec2 uGravityTilt;

  // Button-Originated Radial Transition Wave (Luxury <-> Aurora)
  uniform float uPrevVariant;   // 0.0 = Luxury, 1.0 = Aurora
  uniform float uNextVariant;   // 0.0 = Luxury, 1.0 = Aurora
  uniform vec2 uVariantOrigin;  // Screen UV of the clicked toggle button
  uniform float uVariantSweep;  // Expanding wave radius (0.0 -> 2.0)

  varying vec2 vUv;
  varying vec2 vScreenUv;
  varying vec3 vWorldPos;
  varying vec3 vNormalDir;
  varying vec3 vTangentDir;
  varying float vFoldHeight;
  varying float vFoldCrest;

  vec4 decodeState(vec4 raw) {
    return mix(raw, raw * 2.0 - 1.0, uEncodedByte);
  }

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // ACES Filmic Tone Mapping — eliminates harsh white blowout & gives cinema-grade silk roll-off
  vec3 acesFilmic(vec3 x) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }

  // Physically-inspired Charlie Sheen distribution (used in Blender / Unreal / Three.js MeshPhysicalMaterial for silk & velvet)
  float charlieSheen(float roughness, float ndh) {
    float invR = 1.0 / max(0.08, roughness);
    float cos2h = ndh * ndh;
    float sin2h = max(0.001, 1.0 - cos2h);
    return (2.0 + invR) * pow(sin2h, invR * 0.5) / 6.2831853;
  }

  void main() {
    vec2 suv = clamp(vScreenUv, 0.002, 0.998);

    // Sample fingertip-scale tactile FBO ripple at exact screen UV
    vec4 stC = decodeState(texture2D(uFluidTex, suv));
    float hL = decodeState(texture2D(uFluidTex, clamp(suv - vec2(uFluidTexel.x * 1.5, 0.0), 0.0, 1.0))).r;
    float hR = decodeState(texture2D(uFluidTex, clamp(suv + vec2(uFluidTexel.x * 1.5, 0.0), 0.0, 1.0))).r;
    float hD = decodeState(texture2D(uFluidTex, clamp(suv - vec2(0.0, uFluidTexel.y * 1.5), 0.0, 1.0))).r;
    float hU = decodeState(texture2D(uFluidTex, clamp(suv + vec2(0.0, uFluidTexel.y * 1.5), 0.0, 1.0))).r;

    vec2 fboGrad = vec2(hR - hL, hU - hD);
    float fboHeight = stC.r;
    vec2 fboVel = stC.ba;

    // Combine true 3D cloth normal with expressive fingertip FBO silk ripple perturbation
    vec3 N = normalize(vNormalDir + vec3(-fboGrad.x * 2.65, -fboGrad.y * 2.65, 0.0));
    vec3 T = normalize(vTangentDir - N * dot(N, vTangentDir));
    vec3 B = normalize(cross(N, T));
    vec3 V = normalize(cameraPosition - vWorldPos);

    // Dual broad fashion-studio softbox lights reacting smoothly to pointer & gyroscope tilt
    vec2 lightMove = uPointer * 1.4 + uGravityTilt * 2.1;
    vec3 L1 = normalize(vec3(-2.6 + lightMove.x, 3.8 + lightMove.y, 4.6));
    vec3 L2 = normalize(vec3(3.4 - lightMove.x * 0.7, -2.2 - lightMove.y * 0.6, 3.8));
    vec3 H1 = normalize(L1 + V);
    vec3 H2 = normalize(L2 + V);

    float ndl1 = max(dot(N, L1), 0.0);
    float ndl2 = max(dot(N, L2), 0.0);
    float ndv = max(dot(N, V), 0.001);
    float ndh1 = max(dot(N, H1), 0.0);
    float ndh2 = max(dot(N, H2), 0.0);

    // Soft wrapped silk diffuse (cloth scatters light softly around fold curves)
    float wrapDiff1 = clamp((dot(N, L1) + 0.28) / 1.28, 0.0, 1.0);
    float wrapDiff2 = clamp((dot(N, L2) + 0.22) / 1.22, 0.0, 1.0);

    // Smooth anisotropic satin reflection (no harsh dots — silky ribbon band along the weave!)
    float tdH1 = dot(T, H1);
    float bdH1 = dot(B, H1);
    float satinAniso1 = exp(-(tdH1 * tdH1 * 5.2 + bdH1 * bdH1 * 24.0)) * ndl1;
    float tdH2 = dot(T, H2);
    float bdH2 = dot(B, H2);
    float satinAniso2 = exp(-(tdH2 * tdH2 * 6.0 + bdH2 * bdH2 * 22.0)) * ndl2;

    // Physically-based Charlie grazing silk sheen along curved pleat shoulders
    float sheen1 = charlieSheen(0.36, ndh1) * (0.14 + 0.42 * ndl1) * pow(1.0 - ndv, 1.55);
    float sheen2 = charlieSheen(0.42, ndh2) * (0.10 + 0.30 * ndl2) * pow(1.0 - ndv, 1.65);

    // Self-shadowing ambient occlusion in the deep cloth valleys (huge factor in realistic fabric!)
    float crest = clamp(vFoldCrest + fboHeight * 0.38, 0.0, 1.0);
    float clothAO = smoothstep(0.06, 0.86, crest);
    float tactileRipple = clamp(length(fboGrad) * 2.45 + abs(fboHeight) * 0.72, 0.0, 0.88);

    // Organic flowing dye variation across the draped silk coordinates (smooth, zero grid!)
    vec2 dyeUv = vWorldPos.xy * 0.26 + fboVel * 0.24 + uGravityTilt * 0.16;
    float tDye = uTime * 0.22;
    float dye1 = 0.5 + 0.5 * sin(dyeUv.x * 1.8 + dyeUv.y * 1.2 + vFoldHeight * 0.9 + tDye);
    float dye2 = 0.5 + 0.5 * cos(dyeUv.x * 1.4 - dyeUv.y * 1.7 - vFoldHeight * 0.8 - tDye * 1.15);
    float dye3 = 0.5 + 0.5 * sin((dyeUv.x - dyeUv.y) * 1.5 + vFoldHeight * 1.1 + tDye * 0.85);

    // ========================================================================
    // TRUE OLED DARK ENVELOPE: Deep 3D cloth valleys & screen edges drop to pure #000000
    // ========================================================================
    float oledFold = pow(smoothstep(0.22, 0.94, crest * 0.68 + wrapDiff1 * 0.38 + tactileRipple * 0.22), 1.85);
    float edgeDist = length((suv - 0.5) * vec2(1.06, 1.0));
    float oledEdgeFade = 1.0 - smoothstep(0.52, 1.02, edgeDist) * 0.58;
    float oledMask = oledFold * oledEdgeFade;

    // ========================================================================
    // PALETTE A — LUXURY COUTURE SILK (Champagne Gold · Silver Pearl · Deep Indigo/Lavender)
    // ========================================================================
    // Dark A (True OLED #000000 Valleys + Sculptural Obsidian/Champagne/Pearl Satin)
    vec3 luxDarkAlbedo = mix(vec3(0.075, 0.068, 0.155), vec3(0.22, 0.18, 0.34), smoothstep(0.25, 0.85, dye2) * 0.65);
    luxDarkAlbedo = mix(luxDarkAlbedo, vec3(0.46, 0.37, 0.25), smoothstep(0.45, 0.92, dye3) * 0.55);

    vec3 luxDark = luxDarkAlbedo * (wrapDiff1 * 0.82 + wrapDiff2 * 0.28) * oledMask;
    // Silky champagne & silver-pearl anisotropic satin bands on raised crests
    float luxLightMask = smoothstep(0.06, 0.78, oledMask + tactileRipple * 0.48);
    luxDark += vec3(0.86, 0.74, 0.56) * (satinAniso1 * 0.54 + sheen1 * 0.26) * luxLightMask;
    luxDark += vec3(0.84, 0.87, 0.95) * (satinAniso2 * 0.34 + sheen2 * 0.22 + tactileRipple * 0.28) * luxLightMask;

    // Light A (Creamy Porcelain, Cashmere Sand, Soft Lavender-Quartz & Champagne Satin)
    vec3 luxLightValley = vec3(0.66, 0.625, 0.585);
    vec3 luxLightSilk = vec3(0.92, 0.905, 0.885);
    luxLightSilk = mix(luxLightSilk, vec3(0.835, 0.815, 0.905), smoothstep(0.30, 0.86, dye2) * 0.42);
    luxLightSilk = mix(luxLightSilk, vec3(0.935, 0.865, 0.765), smoothstep(0.38, 0.90, dye3) * 0.40);
    vec3 luxLight = mix(luxLightValley, luxLightSilk, clothAO * (0.42 + 0.58 * wrapDiff1));
    luxLight -= vec3(0.09, 0.085, 0.08) * max(-fboHeight, 0.0) * 0.55;
    luxLight += vec3(0.98, 0.95, 0.90) * (satinAniso1 * 0.34 + sheen1 * 0.16);
    luxLight += vec3(0.96, 0.97, 1.0) * (satinAniso2 * 0.20 + tactileRipple * 0.22);

    vec3 colLuxury = mix(luxLight, luxDark, uThemeDark);

    // ========================================================================
    // PALETTE B — AURORA PRISM SILK (Electric Cobalt · Royal Violet · Coral · Champagne Gold)
    // ========================================================================
    // Dark B (True OLED #000000 Valleys + Iridescent Aurora Satin — ACES-balanced, zero whiteout!)
    vec3 aurBase = mix(vec3(0.06, 0.28, 0.78), vec3(0.42, 0.16, 0.78), smoothstep(0.18, 0.84, dye2));
    aurBase = mix(aurBase, vec3(0.82, 0.26, 0.38), smoothstep(0.40, 0.90, dye3) * 0.78);
    aurBase = mix(aurBase, vec3(0.88, 0.64, 0.26), smoothstep(0.50, 0.94, dye1 * 0.65 + crest * 0.35) * 0.62);

    vec3 aurDark = aurBase * (wrapDiff1 * 0.85 + wrapDiff2 * 0.28) * oledMask;
    float aurLightMask = smoothstep(0.05, 0.76, oledMask + tactileRipple * 0.52);
    vec3 aurSpecTint = mix(vec3(0.56, 0.82, 1.0), vec3(1.0, 0.80, 0.58), dye3);
    aurDark += aurSpecTint * (satinAniso1 * 0.56 + sheen1 * 0.28) * aurLightMask;
    aurDark += mix(vec3(0.84, 0.64, 1.0), vec3(1.0, 0.74, 0.44), dye1) * (satinAniso2 * 0.36 + sheen2 * 0.24 + tactileRipple * 0.30) * aurLightMask;

    // Light B (Iridescent Pearl-Silk — Sky Cerulean · Orchid · Peach Coral · Sunlit Gold)
    vec3 aurLightValley = vec3(0.67, 0.66, 0.78);
    vec3 aurLightSilk = vec3(0.955, 0.95, 0.975);
    aurLightSilk = mix(aurLightSilk, vec3(0.56, 0.77, 0.97), smoothstep(0.22, 0.85, dye1) * 0.52);
    aurLightSilk = mix(aurLightSilk, vec3(0.75, 0.63, 0.96), smoothstep(0.26, 0.88, dye2) * 0.48);
    aurLightSilk = mix(aurLightSilk, vec3(0.97, 0.68, 0.64), smoothstep(0.42, 0.90, dye3) * 0.46);
    aurLightSilk = mix(aurLightSilk, vec3(0.98, 0.87, 0.62), smoothstep(0.48, 0.92, crest * 0.6 + dye2 * 0.4) * 0.45);
    vec3 aurLight = mix(aurLightValley, aurLightSilk, clothAO * (0.42 + 0.58 * wrapDiff1));
    aurLight -= vec3(0.08, 0.08, 0.11) * max(-fboHeight, 0.0) * 0.52;
    aurLight += vec3(1.0, 0.98, 0.96) * (satinAniso1 * 0.36 + sheen1 * 0.18);
    aurLight += vec3(0.95, 0.96, 1.0) * (satinAniso2 * 0.20 + tactileRipple * 0.24);

    vec3 colAurora = mix(aurLight, aurDark, uThemeDark);

    // ========================================================================
    // BUTTON-ORIGINATED RADIAL SILK TRANSITION WAVE (Luxury <-> Aurora)
    // ========================================================================
    float distFromBtn = length((suv - uVariantOrigin) * vec2(uAspect, 1.0));
    float waveFront = 1.0 - smoothstep(uVariantSweep - 0.26, uVariantSweep + 0.04, distFromBtn);
    float activeAurora = mix(uPrevVariant, uNextVariant, waveFront);
    vec3 col = mix(colLuxury, colAurora, activeAurora);

    // Delicate luminous wavefront shimmer traveling smoothly from the clicked button
    float waveActive = smoothstep(0.01, 0.08, uVariantSweep) * (1.0 - smoothstep(1.38, 2.0, uVariantSweep));
    float ringBand = exp(-pow((distFromBtn - uVariantSweep) / 0.062, 2.0)) * waveActive;
    vec3 ringTint = mix(vec3(0.97, 0.94, 0.90), vec3(0.90, 0.82, 0.68), uThemeDark);
    col += ringTint * ringBand * mix(0.25, 0.34, uThemeDark) * (0.40 + 0.60 * clothAO);

    // Celebratory gentle glow during 2-second login portal surge
    float radialCenter = length((suv - vec2(0.5, 0.48)) * vec2(uAspect, 1.0));
    float surgeGlow = exp(-radialCenter * radialCenter * 1.8) * uSurge;
    col += mix(vec3(0.98, 0.95, 0.90), vec3(0.75, 0.68, 0.56), uThemeDark) * (surgeGlow * 0.16);

    // Subtle auth-stage center calm (pure #000000 OLED in dark mode!)
    float centerSoft = 1.0 - smoothstep(0.18, 0.92, radialCenter);
    float authCalm = uAuthBlend * (1.0 - uSurge);
    vec3 calmTarget = mix(vec3(0.94, 0.935, 0.928), vec3(0.0, 0.0, 0.0), uThemeDark);
    col = mix(col, calmTarget, authCalm * (0.14 + centerSoft * 0.18));

    // Apply ACES Filmic Tone Mapping for dark mode (rich cinema silk roll-off, zero white clipping!)
    // and gentle highlight compression for light mode
    vec3 darkMapped = acesFilmic(col * 1.18);
    // Re-anchor near-zero dark pixels cleanly to pure #000000 for OLED panels
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
// MAIN THREE.JS 3D SILK CLOTH CONTROLLER
// ============================================================================

export function createLoginThreeController(
  canvas: HTMLCanvasElement,
  options: {
    initialDark: boolean;
    initialStage: 'intro' | 'auth' | 'portal';
    initialVariant: LoginThreeVariantId;
    reducedMotion: boolean;
  }
): LoginThreeController | null {
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const useHalfFloat = !isSoftwareGl && supportsHalfFloatRenderTarget(renderer);
  const rtType = useHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const encodedByte = useHalfFloat ? 0.0 : 1.0;

  const initialW = Math.max(2, canvas.clientWidth || window.innerWidth || 1280);
  const initialH = Math.max(2, canvas.clientHeight || window.innerHeight || 720);
  const getSimDims = (w: number, h: number) => {
    const scale = isSoftwareGl ? 0.28 : 0.45;
    return {
      sw: clamp(Math.round(w * scale), 192, isSoftwareGl ? 288 : 512),
      sh: clamp(Math.round(h * scale), 192, isSoftwareGl ? 288 : 512),
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

  // --- Pass 1: FBO Simulation Scene ---
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const simScene = new THREE.Scene();
  const simMat = new THREE.ShaderMaterial({
    uniforms: {
      uPrevState: { value: simRead.texture },
      uTexelSize: { value: new THREE.Vector2(1 / simW, 1 / simH) },
      uEncodedByte: { value: encodedByte },
      uDecay: { value: 0.964 },
      uAspect: { value: initialW / initialH },
      uGravityTilt: { value: new THREE.Vector2(0, 0) },
      uBrushPos: { value: new THREE.Vector2(0.5, 0.5) },
      uBrushPrev: { value: new THREE.Vector2(0.5, 0.5) },
      uBrushStrength: { value: 0 },
      uBrushRadius: { value: 0.032 },
      uBurstPos: { value: new THREE.Vector2(0.5, 0.5) },
      uBurstStrength: { value: 0 },
      uBurstRadius: { value: 0.029 },
      uTiltPos: { value: new THREE.Vector2(0.5, 0.5) },
      uTiltStrength: { value: 0 },
      uTiltDir: { value: new THREE.Vector2(0, 0) },
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

  const meshSegs = isSoftwareGl ? 56 : 128;
  const clothGeo = new THREE.PlaneGeometry(20.0, 18.0, meshSegs, meshSegs);
  const initVarNum = options.initialVariant === 'aurora' ? 1 : 0;

  const clothMat = new THREE.ShaderMaterial({
    uniforms: {
      uFluidTex: { value: simRead.texture },
      uFluidTexel: { value: new THREE.Vector2(1 / simW, 1 / simH) },
      uEncodedByte: { value: encodedByte },
      uTime: { value: 0 },
      uAspect: { value: initialW / initialH },
      uThemeDark: { value: options.initialDark ? 1 : 0 },
      uAuthBlend: { value: options.initialStage === 'auth' ? 1 : 0 },
      uSurge: { value: options.initialStage === 'portal' ? 1 : 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uGravityTilt: { value: new THREE.Vector2(0, 0) },
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
  // Slight perspective tilt gives the suspended silk unmistakable 3D fabric depth
  clothMesh.rotation.set(-0.14, 0.06, 0);
  clothScene.add(clothMesh);

  // State
  const reducedMotion = options.reducedMotion;
  let targetThemeDark = options.initialDark ? 1 : 0;
  let currentThemeDark = targetThemeDark;
  let currentVariantVal = initVarNum;
  let variantSweep = 2.2;

  let targetAuthBlend = options.initialStage === 'auth' ? 1 : 0;
  let currentAuthBlend = targetAuthBlend;
  let targetSurge = options.initialStage === 'portal' ? 1 : 0;
  let currentSurge = targetSurge;

  let targetPtrX = 0;
  let targetPtrY = 0;
  let smoothPtrX = 0;
  let smoothPtrY = 0;

  let targetTiltX = 0;
  let targetTiltY = 0;
  let smoothTiltX = 0;
  let smoothTiltY = 0;

  let brushCurrU = 0.5;
  let brushCurrV = 0.5;
  let brushPrevU = 0.5;
  let brushPrevV = 0.5;
  let pendingBrushStrength = 0;

  let pendingBurstU = 0.5;
  let pendingBurstV = 0.5;
  let pendingBurstStrength = 0;
  let pendingBurstRadius = 0.022;

  let pendingTiltU = 0.5;
  let pendingTiltV = 0.5;
  let pendingTiltStrength = 0;
  let pendingTiltDx = 0;
  let pendingTiltDy = 0;

  let isDisposed = false;
  let isPaused = false;
  let rafId = 0;
  let elapsed = 0;
  let lastNow = performance.now();

  const resize = (width: number, height: number) => {
    if (isDisposed || width <= 0 || height <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);

    const aspect = width / height;
    clothCam.aspect = aspect;
    clothCam.fov = aspect < 0.82 ? 48 : 41;
    clothCam.updateProjectionMatrix();

    simMat.uniforms.uAspect.value = aspect;
    clothMat.uniforms.uAspect.value = aspect;

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
  };

  const renderFrame = (dt: number) => {
    if (isDisposed) return;

    currentThemeDark += (targetThemeDark - currentThemeDark) * clamp(dt * 9.0, 0, 1);
    currentAuthBlend += (targetAuthBlend - currentAuthBlend) * clamp(dt * 4.5, 0, 1);
    currentSurge += (targetSurge - currentSurge) * clamp(dt * 3.8, 0, 1);

    smoothPtrX += (targetPtrX - smoothPtrX) * clamp(dt * 7.2, 0, 1);
    smoothPtrY += (targetPtrY - smoothPtrY) * clamp(dt * 7.2, 0, 1);
    smoothTiltX += (targetTiltX - smoothTiltX) * clamp(dt * 5.2, 0, 1);
    smoothTiltY += (targetTiltY - smoothTiltY) * clamp(dt * 5.2, 0, 1);

    if (variantSweep < 2.2) {
      variantSweep = Math.min(2.2, variantSweep + dt * 2.15);
    }

    clothBgCurrent.copy(clothBgLight).lerp(clothBgDark, currentThemeDark);

    // --- PASS 1: Step Fingertip Tactile FBO ---
    simMat.uniforms.uPrevState.value = simRead.texture;
    simMat.uniforms.uDecay.value = 0.964 + currentSurge * 0.014;
    (simMat.uniforms.uGravityTilt.value as THREE.Vector2).set(smoothTiltX, smoothTiltY);

    (simMat.uniforms.uBrushPos.value as THREE.Vector2).set(brushCurrU, brushCurrV);
    (simMat.uniforms.uBrushPrev.value as THREE.Vector2).set(brushPrevU, brushPrevV);
    simMat.uniforms.uBrushStrength.value = pendingBrushStrength;
    simMat.uniforms.uBrushRadius.value = 0.031 + clamp(pendingBrushStrength * 0.011, 0, 0.014);

    (simMat.uniforms.uBurstPos.value as THREE.Vector2).set(pendingBurstU, pendingBurstV);
    simMat.uniforms.uBurstStrength.value = pendingBurstStrength;
    simMat.uniforms.uBurstRadius.value = pendingBurstRadius;

    (simMat.uniforms.uTiltPos.value as THREE.Vector2).set(pendingTiltU, pendingTiltV);
    simMat.uniforms.uTiltStrength.value = pendingTiltStrength;
    (simMat.uniforms.uTiltDir.value as THREE.Vector2).set(pendingTiltDx, pendingTiltDy);

    renderer.setRenderTarget(simWrite);
    renderer.render(simScene, orthoCam);

    const temp = simRead;
    simRead = simWrite;
    simWrite = temp;

    brushPrevU = brushCurrU;
    brushPrevV = brushCurrV;
    pendingBrushStrength *= 0.38;
    if (pendingBrushStrength < 0.004) pendingBrushStrength = 0;
    pendingBurstStrength = 0;
    pendingTiltStrength *= 0.35;
    if (pendingTiltStrength < 0.004) pendingTiltStrength = 0;

    // --- PASS 2: Render 3D Perspective Silk Cloth Mesh ---
    clothCam.position.x = smoothPtrX * 0.24 + smoothTiltX * 0.42;
    clothCam.position.y = smoothPtrY * 0.18 + smoothTiltY * 0.32;
    clothCam.position.z = (clothCam.aspect < 0.82 ? 8.2 : 7.3) + currentAuthBlend * 0.5;
    clothCam.lookAt(0, 0, -0.4);

    clothMat.uniforms.uFluidTex.value = simRead.texture;
    clothMat.uniforms.uTime.value = elapsed;
    clothMat.uniforms.uThemeDark.value = currentThemeDark;
    clothMat.uniforms.uAuthBlend.value = currentAuthBlend;
    clothMat.uniforms.uSurge.value = currentSurge;
    clothMat.uniforms.uVariantSweep.value = variantSweep;
    (clothMat.uniforms.uPointer.value as THREE.Vector2).set(smoothPtrX, smoothPtrY);
    (clothMat.uniforms.uGravityTilt.value as THREE.Vector2).set(smoothTiltX, smoothTiltY);

    renderer.setRenderTarget(null);
    renderer.render(clothScene, clothCam);
  };

  const onContextLost = (e: Event) => {
    e.preventDefault();
    isPaused = true;
  };
  const onContextRestored = () => {
    isPaused = false;
    clearFluidTarget(simRead);
    clearFluidTarget(simWrite);
    lastNow = performance.now();
    renderFrame(0.016);
  };
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  const onVisibilityChange = () => {
    isPaused = document.hidden;
    if (!isPaused) {
      lastNow = performance.now();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const tick = (now: number) => {
    if (isDisposed) return;
    rafId = window.requestAnimationFrame(tick);
    if (isPaused) return;
    const dt = clamp((now - lastNow) / 1000, 0.001, 0.05);
    lastNow = now;
    if (!reducedMotion) {
      elapsed += dt;
    }
    renderFrame(dt);
  };

  resize(initialW, initialH);
  renderFrame(0.016);

  if (!reducedMotion) {
    rafId = window.requestAnimationFrame(tick);
  }

  return {
    setTheme(isDark: boolean, snapImmediately = false) {
      targetThemeDark = isDark ? 1 : 0;
      if (snapImmediately || reducedMotion) {
        currentThemeDark = targetThemeDark;
        renderFrame(0.001);
      }
    },
    setStage(stage: 'intro' | 'auth' | 'portal') {
      targetAuthBlend = stage === 'auth' ? 1 : 0;
      targetSurge = stage === 'portal' ? 1 : 0;
      if (reducedMotion) {
        currentAuthBlend = targetAuthBlend;
        currentSurge = targetSurge;
        renderFrame(0.001);
      }
    },
    setVariant(variant: LoginThreeVariantId, originNx?: number, originNy?: number) {
      const nextVal = variant === 'aurora' ? 1 : 0;
      if (nextVal === currentVariantVal && variantSweep >= 2.0) return;

      // Default origin to top-left button area if not explicitly provided
      const u = typeof originNx === 'number' && Number.isFinite(originNx)
        ? clamp(originNx * 0.5 + 0.5, 0.02, 0.98)
        : 0.14;
      const v = typeof originNy === 'number' && Number.isFinite(originNy)
        ? clamp(originNy * 0.5 + 0.5, 0.02, 0.98)
        : 0.92;

      clothMat.uniforms.uPrevVariant.value = currentVariantVal;
      clothMat.uniforms.uNextVariant.value = nextVal;
      (clothMat.uniforms.uVariantOrigin.value as THREE.Vector2).set(u, v);
      currentVariantVal = nextVal;

      if (reducedMotion) {
        variantSweep = 2.2;
        clothMat.uniforms.uPrevVariant.value = nextVal;
        renderFrame(0.001);
      } else {
        variantSweep = 0.01;
        // Launch crisp cloth ripple right from the clicked button!
        pendingBurstU = u;
        pendingBurstV = v;
        pendingBurstStrength = 0.92;
        pendingBurstRadius = 0.038;
      }
    },
    setPointer(nx: number, ny: number, velocity: number) {
      const cx = clamp(nx, -1, 1);
      const cy = clamp(ny, -1, 1);
      targetPtrX = cx;
      targetPtrY = cy;
      brushCurrU = clamp(cx * 0.5 + 0.5, 0.01, 0.99);
      brushCurrV = clamp(cy * 0.5 + 0.5, 0.01, 0.99);
      pendingBrushStrength = clamp(Math.max(pendingBrushStrength, velocity * 2.8), 0.08, 1.05);
    },
    setTilt(tx: number, ty: number, dtx: number, dty: number) {
      targetTiltX = clamp(tx, -1, 1);
      targetTiltY = clamp(ty, -1, 1);
      const deltaMag = Math.hypot(dtx, dty);
      if (deltaMag > 0.022) {
        pendingTiltU = clamp(0.5 + targetTiltX * 0.32, 0.08, 0.92);
        pendingTiltV = clamp(0.5 + targetTiltY * 0.32, 0.08, 0.92);
        pendingTiltStrength = clamp(deltaMag * 3.2, 0.1, 0.82);
        pendingTiltDx = clamp(dtx * 6.0, -0.9, 0.9);
        pendingTiltDy = clamp(dty * 6.0, -0.9, 0.9);
      }
    },
    triggerPulse(nx: number, ny: number, strength = 0.78) {
      pendingBurstU = clamp(nx * 0.5 + 0.5, 0.02, 0.98);
      pendingBurstV = clamp(ny * 0.5 + 0.5, 0.02, 0.98);
      pendingBurstStrength = clamp(strength, 0.22, 1.15);
      pendingBurstRadius = 0.029;
      if (reducedMotion) {
        renderFrame(0.016);
      }
    },
    triggerLoginSurge(nx: number, ny: number) {
      targetSurge = 1;
      pendingBurstU = clamp(nx * 0.5 + 0.5, 0.05, 0.95);
      pendingBurstV = clamp(ny * 0.5 + 0.5, 0.05, 0.95);
      pendingBurstStrength = 1.05;
      pendingBurstRadius = 0.044;
    },
    resize,
    dispose() {
      isDisposed = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      document.removeEventListener('visibilitychange', onVisibilityChange);

      simRead.dispose();
      simWrite.dispose();
      quadGeo.dispose();
      simMat.dispose();
      clothGeo.dispose();
      clothMat.dispose();
      renderer.dispose();
    },
  };
}
