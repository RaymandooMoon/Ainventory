import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  DEFAULT_LIGHTING_INTENSITY,
  DEFAULT_LIGHTING_PRESET,
  DEFAULT_STAGE_BACKGROUND_ID,
  type StageLightingPresetId,
  type WindowApertureKind,
} from '../../utils/stageBackgroundCatalog.ts';
import {
  type WeatherOpticalInput,
  resolveStageLightingFrame,
} from '../../utils/stageLightingEngine.ts';
import {
  computeHeightAwareStageFraming,
  computeThreeCameraLookAtForSolePct,
} from '../../utils/stageFramingEngine.ts';
import {
  type StageTierCode,
  createRadialAuraGlowTexture,
  createStoneMicroReliefTexture,
  createStudioEnvironmentTexture,
  createWindowGoboTexture,
  detectSoftwareWebGlFromContext,
  disposeObject3DTree,
  peekCachedSoftwareWebGl,
  scheduleAfterSoftwareDraw,
} from './threeRuntimeCapabilities.ts';
import {
  type FittingFloorSlotId,
  resolveFittingFloorSlotId,
} from '../../three/megascans/megascansCatalog.ts';
import {
  applyMegascansPbrToMaterial,
  createMegascansSession,
} from '../../three/megascans/megascansMaterialLoader.ts';

export interface StudioThreeStageLayerProps {
  isOutdoor: boolean;
  weatherMode: string;
  timeOfDay: 'sunrise' | 'day' | 'sunset' | 'night' | string;
  auraTier: StageTierCode;
  theme: 'light' | 'dark' | string;
  angleScrollDeg: number;
  paused?: boolean;
  hasCharacter?: boolean;
  stageBackgroundId?: string;
  weather?: WeatherOpticalInput | null;
  clockNowMs?: number;
  lightingPreset?: StageLightingPresetId | string;
  lightingIntensity?: number;
  modelImageUrl?: string | null;
  soleStageTopPct?: number;
  topRatio?: number | null;
  bottomRatio?: number | null;
  heightCm?: number;
  mirrorX?: boolean;
  onWebGlAvailabilityChange?: (available: boolean) => void;
}

const PRECIP_COUNT = 84;
const RIPPLE_COUNT = 18;
const MOTE_COUNT = 36;

const GOBO_KINDS: readonly WindowApertureKind[] = [
  'overhead-skylight',
  'clerestory-slit',
  'full-glass-mullion',
  'arched-grid-gobo',
  'left-sheer-curtain',
  'high-clerestory',
  'archway-sun',
];

// Pre-allocated module-scope scratch objects to guarantee zero GC allocations per frame
const _dummy = new THREE.Object3D();
const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _targetKeyColor = new THREE.Color();
const _targetSkyColor = new THREE.Color();
const _targetGroundColor = new THREE.Color();
const _targetFogColor = new THREE.Color();
const _targetAuraColor = new THREE.Color();
const _targetBeamColor = new THREE.Color();
const _targetHazeColor = new THREE.Color();
const _targetGoboColor = new THREE.Color();
const _targetFloorPoolColor = new THREE.Color();

// Single-pass Volumetric Sunbeam / Interior Fixture Cone Shader (zero extra render passes)
const VOLUMETRIC_BEAM_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const VOLUMETRIC_BEAM_FRAG = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    // Tapered cone: narrower near top source (vUv.y -> 1.0), wider & softer near floor (vUv.y -> 0.0)
    float halfSpan = mix(0.48, 0.22, vUv.y);
    float radialDist = abs(vUv.x - 0.5) / max(0.08, halfSpan);
    float edgeMask = 1.0 - smoothstep(0.18, 1.0, radialDist);
    float verticalFade = smoothstep(0.0, 0.26, vUv.y) * (1.0 - smoothstep(0.76, 1.0, vUv.y));
    float coreBoost = mix(0.72, 1.22, vUv.y);
    float alpha = edgeMask * edgeMask * verticalFade * coreBoost * uOpacity;
    gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0));
  }
`;

// Single-pass Mie Forward-Scattering Haze & Architectural Cove Wall-Wash Shader
const MIE_HAZE_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MIE_HAZE_FRAG = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uFocusY;
  varying vec2 vUv;

  void main() {
    vec2 delta = vec2((vUv.x - 0.5) * 1.15, (vUv.y - uFocusY) * 1.25);
    float r = length(delta);
    // Henyey-Greenstein / Mie-inspired forward scattering lobe + soft horizon veil
    float mieCore = exp(-r * r * 3.4);
    float horizonVeil = (1.0 - smoothstep(0.0, 0.88, vUv.y)) * (1.0 - smoothstep(0.25, 0.52, abs(vUv.x - 0.5)));
    float alpha = (mieCore * 0.78 + horizonVeil * 0.34) * uOpacity;
    gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0));
  }
`;

// Single-pass GLSL Grounded Character Silhouette Cast Shadow + Tight Dual-Foot Contact AO
// Zero extra render passes; works identically on hardware GPU and SwiftShader WebGL.
const SILHOUETTE_SHADOW_VERT = `
  varying vec2 vFloorXZ;
  void main() {
    vFloorXZ = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SILHOUETTE_SHADOW_FRAG = `
  uniform sampler2D uCutoutTex;
  uniform float uHasCutout;
  uniform float uMirrorX;
  uniform float uSoleBottomV;
  uniform float uCrownTopV;
  // Channel A: Strictly decoupled Natural Daylight / Window Sun shadow
  uniform vec2 uSunShadowDir;
  uniform float uSunShadowLength;
  uniform float uSunShadowOpacity;
  uniform float uSunDirectRatio;
  // Channel B: Strictly decoupled Artificial Indoor Fixture shadow (+ opposing fill fixture)
  uniform vec2 uLampShadowDir;
  uniform float uLampShadowLength;
  uniform float uLampShadowOpacity;
  uniform float uLampDirectRatio;
  uniform vec2 uLampShadowDir2;
  uniform float uLampShadowLength2;
  uniform float uLampShadowOpacity2;
  uniform float uCharWidthMeters;
  uniform float uFootprintScale;
  uniform float uContactAoOpacity;
  uniform vec3 uShadowColor;
  varying vec2 vFloorXZ;

  float sampleCutoutAlpha(vec2 uv) {
    if (uv.x <= 0.01 || uv.x >= 0.99 || uv.y <= 0.005 || uv.y >= 0.995) {
      return 0.0;
    }
    return smoothstep(0.18, 0.75, texture2D(uCutoutTex, uv).a);
  }

  float projectSilhouette(vec2 p, vec2 rawDir, float shadowLen, float sharpness, bool highQuality) {
    float dirLen = length(rawDir);
    vec2 dir = dirLen > 0.001 ? (rawDir / dirLen) : vec2(0.0, -1.0);
    vec2 perpDir = vec2(dir.y, -dir.x);

    float along = dot(p, dir);
    float across = dot(p, perpDir);
    float t = along / max(0.45, shadowLen);
    if (t <= -0.05 || t >= 1.08) {
      return 0.0;
    }

    float tClamped = clamp(t, 0.0, 1.0);
    float sampleV = mix(uSoleBottomV, uCrownTopV, tClamped);
    float uRaw = 0.5 + (across / max(0.55, uCharWidthMeters));
    float sampleU = uMirrorX > 0.5 ? (1.0 - uRaw) : uRaw;
    vec2 baseUv = vec2(sampleU, sampleV);

    float blurScale = mix(1.25, 0.72, sharpness);
    float blurU = (0.009 + 0.034 * tClamped) * blurScale;
    float blurV = (0.007 + 0.022 * tClamped) * blurScale;
    float silAlpha = 0.0;
    if (highQuality) {
      float a0 = sampleCutoutAlpha(baseUv) * 0.36;
      float a1 = sampleCutoutAlpha(baseUv + vec2(blurU, 0.0)) * 0.16;
      float a2 = sampleCutoutAlpha(baseUv - vec2(blurU, 0.0)) * 0.16;
      float a3 = sampleCutoutAlpha(baseUv + vec2(0.0, blurV)) * 0.16;
      float a4 = sampleCutoutAlpha(baseUv - vec2(0.0, blurV)) * 0.16;
      silAlpha = a0 + a1 + a2 + a3 + a4;
    } else {
      float b0 = sampleCutoutAlpha(baseUv) * 0.46;
      float b1 = sampleCutoutAlpha(baseUv + vec2(blurU * 1.35, 0.0)) * 0.27;
      float b2 = sampleCutoutAlpha(baseUv - vec2(blurU * 1.35, 0.0)) * 0.27;
      silAlpha = b0 + b1 + b2;
    }

    float entryFade = smoothstep(-0.05, 0.04, t);
    float tipFade = 1.0 - smoothstep(0.62, 1.08, t);
    return silAlpha * entryFade * tipFade;
  }

  void main() {
    vec2 p = vFloorXZ;

    // 1. Tight grounded Contact AO strictly under shoe soles (world origin 0,0 = exact 2D soleStageTopPct)
    float fp = max(0.75, uFootprintScale);
    vec2 coreCoord = vec2(p.x / (0.26 * fp), (p.y - 0.01) / (0.088 * fp));
    float coreAo = exp(-dot(coreCoord, coreCoord) * 2.25);

    vec2 softCoord = vec2(p.x / (0.44 * fp), (p.y - 0.015) / (0.155 * fp));
    float softAo = exp(-dot(softCoord, softCoord) * 1.55) * 0.44;
    float contactAo = clamp(coreAo * 0.84 + softAo, 0.0, 1.0);

    // 2A. Independent Natural Sunlight / Window Cast Shadow (fixed by solar + window geometry)
    float sunAlpha = 0.0;
    if (uHasCutout > 0.5 && uSunShadowOpacity > 0.004) {
      float sunSharp = clamp(uSunDirectRatio, 0.0, 1.0);
      float sunDirect = mix(0.42, 1.0, sunSharp);
      sunAlpha =
        projectSilhouette(p, uSunShadowDir, uSunShadowLength, sunSharp, true) *
        sunDirect *
        uSunShadowOpacity;
    }

    // 2B. Independent Artificial Fixture Cast Shadow (+ optional opposing indoor fixture fill)
    float lampAlpha = 0.0;
    if (uHasCutout > 0.5 && uLampShadowOpacity > 0.004) {
      float lampSharp = clamp(uLampDirectRatio, 0.0, 1.0);
      float lampDirect = mix(0.42, 1.0, lampSharp);
      float lampPrimary =
        projectSilhouette(p, uLampShadowDir, uLampShadowLength, lampSharp, true) *
        lampDirect *
        uLampShadowOpacity;

      float lampSecondary = 0.0;
      if (uLampShadowOpacity2 > 0.004) {
        lampSecondary =
          projectSilhouette(p, uLampShadowDir2, uLampShadowLength2, lampSharp * 0.65, false) *
          lampDirect *
          uLampShadowOpacity2;
      }

      lampAlpha = clamp(
        max(lampPrimary, lampSecondary) + min(lampPrimary, lampSecondary) * 0.26,
        0.0,
        0.78
      );
    }

    // Smooth radial edge fade so the shadow quad border is never visible
    float quadEdgeFade = 1.0 - smoothstep(1.9, 2.62, length(p));
    float aoAlpha = contactAo * uContactAoOpacity;
    // Physical superposition: natural sun shadow stays anchored in place while artificial lamp
    // shadow fades in independently along its own fixed fixture angle (zero angular drift!)
    float castAlpha = clamp(sunAlpha + lampAlpha - sunAlpha * lampAlpha * 0.55, 0.0, 0.78);
    float finalAlpha = clamp((max(aoAlpha, castAlpha) + min(aoAlpha, castAlpha) * 0.22) * quadEdgeFade, 0.0, 0.84);
    if (finalAlpha < 0.004) discard;
    gl_FragColor = vec4(uShadowColor, finalAlpha);
  }
`;

interface PrecipSeed {
  x: number;
  y: number;
  z: number;
  speed: number;
  driftPhase: number;
  scaleJitter: number;
}

interface RippleSeed {
  x: number;
  z: number;
  phase: number;
  speed: number;
  maxScale: number;
}

interface MoteSeed {
  radius: number;
  baseY: number;
  angle: number;
  speed: number;
  bobSpeed: number;
  scale: number;
}

function createSeeds() {
  const precip: PrecipSeed[] = [];
  for (let i = 0; i < PRECIP_COUNT; i += 1) {
    const h1 = Math.sin((i + 1) * 12.9898) * 43758.5453;
    const f1 = h1 - Math.floor(h1);
    const h2 = Math.sin((i + 7) * 78.233) * 19341.17;
    const f2 = h2 - Math.floor(h2);
    const h3 = Math.sin((i + 19) * 37.719) * 29113.31;
    const f3 = h3 - Math.floor(h3);
    precip.push({
      x: (f1 - 0.5) * 5.8,
      y: f2 * 4.6,
      z: (f3 - 0.45) * 3.8,
      speed: 0.82 + (i % 7) * 0.08,
      driftPhase: f1 * Math.PI * 2,
      scaleJitter: 0.85 + (i % 5) * 0.075,
    });
  }

  const ripples: RippleSeed[] = [];
  for (let i = 0; i < RIPPLE_COUNT; i += 1) {
    const h1 = Math.sin((i + 3) * 41.33) * 15731.7;
    const f1 = h1 - Math.floor(h1);
    const h2 = Math.sin((i + 11) * 93.17) * 24971.3;
    const f2 = h2 - Math.floor(h2);
    ripples.push({
      x: (f1 - 0.5) * 3.4,
      z: (f2 - 0.45) * 2.2,
      phase: (i / RIPPLE_COUNT) % 1,
      speed: 0.58 + (i % 4) * 0.12,
      maxScale: 0.24 + (i % 3) * 0.08,
    });
  }

  const motes: MoteSeed[] = [];
  for (let i = 0; i < MOTE_COUNT; i += 1) {
    const frac = i / MOTE_COUNT;
    motes.push({
      radius: 0.62 + (i % 6) * 0.16,
      baseY: 0.28 + frac * 2.35,
      angle: frac * Math.PI * 6.0,
      speed: 0.24 + (i % 5) * 0.05,
      bobSpeed: 0.9 + (i % 4) * 0.25,
      scale: 0.85 + (i % 4) * 0.1,
    });
  }

  return { precip, ripples, motes };
}

function resolveTierAuraHex(auraTier: StageTierCode): number {
  if (auraTier === 'S' || auraTier === 'S+') return 0xf4d27a;
  if (auraTier === 'A' || auraTier === 'A+') return 0xd8e6fb;
  if (auraTier === 'B' || auraTier === 'B+') return 0xf5efe4;
  return 0xffffff;
}

/**
 * Hybrid 3D Spatial Lighting, Seasonal/Weather Atmospheric Optics, Architectural Window Gobo,
 * Post-Sunset Interior Fixture Auto-Switch, Ground Contact & Volumetric Weather Layer.
 */
export default function StudioThreeStageLayer({
  isOutdoor,
  weatherMode,
  timeOfDay,
  auraTier,
  theme,
  angleScrollDeg,
  paused = false,
  hasCharacter = true,
  stageBackgroundId = DEFAULT_STAGE_BACKGROUND_ID,
  weather = null,
  clockNowMs,
  lightingPreset = DEFAULT_LIGHTING_PRESET,
  lightingIntensity = DEFAULT_LIGHTING_INTENSITY,
  modelImageUrl = null,
  soleStageTopPct = 85.5,
  topRatio = null,
  bottomRatio = null,
  heightCm = 172,
  mirrorX = false,
  onWebGlAvailabilityChange,
}: StudioThreeStageLayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const onWebGlAvailabilityChangeRef = useRef(onWebGlAvailabilityChange);
  onWebGlAvailabilityChangeRef.current = onWebGlAvailabilityChange;

  const lightingFrame = useMemo(() => {
    const mergedWeather: WeatherOpticalInput = {
      ...(weather || {}),
      effectiveWeather: weather?.effectiveWeather || weatherMode,
    };
    return resolveStageLightingFrame({
      backgroundId: stageBackgroundId,
      isOutdoor,
      weather: mergedWeather,
      timestampMs: clockNowMs,
      lightingPreset,
      lightingIntensity,
      theme,
    });
  }, [
    stageBackgroundId,
    isOutdoor,
    weather,
    weatherMode,
    clockNowMs,
    lightingPreset,
    lightingIntensity,
    theme,
  ]);

  const stageFraming = useMemo(
    () =>
      computeHeightAwareStageFraming({
        heightCm,
        isOutdoor,
      }),
    [heightCm, isOutdoor]
  );

  const propsRef = useRef({
    stageBackgroundId,
    isOutdoor,
    weatherMode,
    timeOfDay,
    auraTier,
    theme,
    angleScrollDeg,
    paused,
    hasCharacter,
    lightingFrame,
    stageFraming,
    modelImageUrl,
    soleStageTopPct,
    topRatio,
    bottomRatio,
    mirrorX,
  });
  propsRef.current = {
    stageBackgroundId,
    isOutdoor,
    weatherMode,
    timeOfDay,
    auraTier,
    theme,
    angleScrollDeg,
    paused,
    hasCharacter,
    lightingFrame,
    stageFraming,
    modelImageUrl,
    soleStageTopPct,
    topRatio,
    bottomRatio,
    mirrorX,
  };

  const triggerWakeRef = useRef<(() => void) | null>(null);
  const syncCutoutTexRef = useRef<((url: string | null | undefined) => void) | null>(null);
  const syncFloorPresetRef = useRef<
    ((bgId: string | undefined, outdoor: boolean) => void) | null
  >(null);
  const [isSoftwareGlAttr, setIsSoftwareGlAttr] = useState<boolean>(
    () => peekCachedSoftwareWebGl() ?? true
  );

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return undefined;

    let unmounted = false;
    let bootRafId = 0;
    let bootTimerId = 0;
    let cleanupStage: (() => void) | null = null;

    const bootStage = () => {
      if (unmounted) return;
      const cachedSw = peekCachedSoftwareWebGl();
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: cachedSw === false,
          powerPreference: 'high-performance',
        });
      } catch {
        onWebGlAvailabilityChangeRef.current?.(false);
        return;
      }

      onWebGlAvailabilityChangeRef.current?.(true);
      const isSoftwareGl = detectSoftwareWebGlFromContext(renderer.getContext());
      setIsSoftwareGlAttr(isSoftwareGl);

      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = isSoftwareGl ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = false;

      const canvas = renderer.domElement;
      canvas.className = 'studio-three-stage-canvas';
      container.replaceChildren(canvas);

      const scene = new THREE.Scene();
      const envTexture = isSoftwareGl
        ? createStudioEnvironmentTexture(renderer, true)
        : createStudioEnvironmentTexture(renderer, false);
      scene.environment = envTexture;
      if (!isSoftwareGl) {
        scene.fog = new THREE.FogExp2(0x1f2430, 0.045);
      }

      const initW = Math.max(1, container.clientWidth || 360);
      const initH = Math.max(1, container.clientHeight || 480);
      renderer.setSize(initW, initH, false);

      const camera = new THREE.PerspectiveCamera(38, initW / initH, 0.1, 32);
      camera.position.set(0, 1.42, 4.55);
      camera.lookAt(0, 1.02, 0);

      // 3-Point Warm/Cool Studio + Solar/Architectural Lighting Rig
      const hemiLight = new THREE.HemisphereLight(0xfbe8cb, 0x4a4239, 0.85);
      hemiLight.position.set(0, 6, 0);
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight(0xfff1d8, 1.45);
      keyLight.position.set(2.4, 4.6, 2.8);
      scene.add(keyLight);

      const rimLight = new THREE.PointLight(0xf4d27a, 0.9, 9, 2);
      rimLight.position.set(0, 2.25, -1.25);
      scene.add(rimLight);

      // Composite Ground & Architectural Podium Group (grounded at y = 0, disjoint Y offsets >= 0.015)
      const stageGroup = new THREE.Group();
      scene.add(stageGroup);

      const stoneBumpTex = isSoftwareGl ? null : createStoneMicroReliefTexture(renderer);
      const auraGlowTex = createRadialAuraGlowTexture(renderer);

      // 1x1 transparent placeholder texture until active RGBA cutout image decodes
      const dummyCutoutData = new Uint8Array([0, 0, 0, 0]);
      const dummyCutoutTex = new THREE.DataTexture(dummyCutoutData, 1, 1, THREE.RGBAFormat);
      dummyCutoutTex.needsUpdate = true;

      const goboTextures = new Map<WindowApertureKind, THREE.CanvasTexture>();
      for (const kind of GOBO_KINDS) {
        goboTextures.set(kind, createWindowGoboTexture(renderer, kind));
      }

      // Part 0: Mie Forward-Scattering Atmospheric Haze / Indoor Wall-Wash Plane (z = -0.68)
      const mieHazeGeo = new THREE.PlaneGeometry(4.8, 3.8);
      const mieHazeMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(0xf4f8ff) },
          uOpacity: { value: 0 },
          uFocusY: { value: 0.52 },
        },
        vertexShader: MIE_HAZE_VERT,
        fragmentShader: MIE_HAZE_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mieHazeMesh = new THREE.Mesh(mieHazeGeo, mieHazeMat);
      mieHazeMesh.position.set(0, 1.55, -0.68);
      mieHazeMesh.renderOrder = 0;
      scene.add(mieHazeMesh);

      // Part 1: Perspective Architectural Floor Catcher Disc (y = 0)
      const floorGeo = new THREE.CircleGeometry(2.65, 40);
      floorGeo.rotateX(-Math.PI / 2);
      const floorMat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial = isSoftwareGl
        ? new THREE.MeshLambertMaterial({
            color: 0xffffff,
            alphaMap: auraGlowTex,
            transparent: true,
            opacity: 0.24,
            depthWrite: false,
          })
        : new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.72,
            metalness: 0.16,
            bumpMap: stoneBumpTex,
            bumpScale: 0.015,
            alphaMap: auraGlowTex,
            transparent: true,
            opacity: 0.24,
            depthWrite: false,
          });
      const floorDisc = new THREE.Mesh(floorGeo, floorMat);
      floorDisc.position.y = 0;
      floorDisc.renderOrder = 1;
      stageGroup.add(floorDisc);

      // Part 1B: Indoor Fixture Floor Light Pool (y = 0.004, strictly BELOW cast shadow so shadow cuts cleanly through lit floor!)
      const fixturePoolGeo = new THREE.PlaneGeometry(3.4, 2.5);
      fixturePoolGeo.rotateX(-Math.PI / 2);
      const fixturePoolMat = new THREE.MeshBasicMaterial({
        color: 0xffd8a0,
        map: auraGlowTex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const fixturePoolMesh = new THREE.Mesh(fixturePoolGeo, fixturePoolMat);
      fixturePoolMesh.position.set(0, 0.004, 0.05);
      fixturePoolMesh.renderOrder = 1;
      stageGroup.add(fixturePoolMesh);

      // Part 2: Single-Pass GLSL Silhouette Cast Shadow + Tight Dual-Foot Contact AO (y = 0.009)
      // World origin (0, 0, 0) is calibrated via exact closed-form projection to 2D `soleStageTopPct` (0px gap!)
      const silhouetteShadowGeo = new THREE.PlaneGeometry(5.4, 5.4);
      silhouetteShadowGeo.rotateX(-Math.PI / 2);
      const silhouetteShadowMat = new THREE.ShaderMaterial({
        uniforms: {
          uCutoutTex: { value: dummyCutoutTex },
          uHasCutout: { value: 0.0 },
          uMirrorX: { value: 0.0 },
          uSoleBottomV: { value: 0.045 },
          uCrownTopV: { value: 0.94 },
          uSunShadowDir: { value: new THREE.Vector2(0.0, -1.0) },
          uSunShadowLength: { value: 1.05 },
          uSunShadowOpacity: { value: 0.0 },
          uSunDirectRatio: { value: 0.75 },
          uLampShadowDir: { value: new THREE.Vector2(0.0, -1.0) },
          uLampShadowLength: { value: 1.05 },
          uLampShadowOpacity: { value: 0.0 },
          uLampDirectRatio: { value: 0.75 },
          uLampShadowDir2: { value: new THREE.Vector2(0.0, -1.0) },
          uLampShadowLength2: { value: 0.92 },
          uLampShadowOpacity2: { value: 0.0 },
          uCharWidthMeters: { value: 1.18 },
          uFootprintScale: { value: 1.0 },
          uContactAoOpacity: { value: 0.44 },
          uShadowColor: { value: new THREE.Color(0x161412) },
        },
        vertexShader: SILHOUETTE_SHADOW_VERT,
        fragmentShader: SILHOUETTE_SHADOW_FRAG,
        transparent: true,
        depthWrite: false,
      });
      const silhouetteShadowMesh = new THREE.Mesh(silhouetteShadowGeo, silhouetteShadowMat);
      silhouetteShadowMesh.position.set(0, 0.009, 0);
      silhouetteShadowMesh.renderOrder = 2;
      stageGroup.add(silhouetteShadowMesh);

      // Part 2B: Projected Architectural Window Gobo Floor Patch (y = 0.036, indoor daytime only)
      const goboGeo = new THREE.PlaneGeometry(2.35, 1.55);
      goboGeo.rotateX(-Math.PI / 2);
      const goboMat = new THREE.MeshBasicMaterial({
        color: 0xfff5e0,
        map: goboTextures.get('left-sheer-curtain') || auraGlowTex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const goboPatchMesh = new THREE.Mesh(goboGeo, goboMat);
      goboPatchMesh.position.set(0, 0.036, 0.24);
      goboPatchMesh.renderOrder = 2;
      stageGroup.add(goboPatchMesh);

      // Part 3: Recessed Architectural Podium Trim Ring (y = 0.054, indoor salon stages only)
      const trimGeo = new THREE.TorusGeometry(0.68, 0.0065, 12, 56);
      trimGeo.rotateX(Math.PI / 2);
      const trimMat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial = isSoftwareGl
        ? new THREE.MeshLambertMaterial({
            color: 0xe6dfd3,
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
          })
        : new THREE.MeshStandardMaterial({
            color: 0xe6dfd3,
            roughness: 0.24,
            metalness: 0.88,
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
          });
      const trimRing = new THREE.Mesh(trimGeo, trimMat);
      trimRing.position.set(0, 0.054, 0.04);
      trimRing.scale.set(1, 1, 0.64);
      trimRing.renderOrder = 3;
      stageGroup.add(trimRing);

      // Part 4: Tiered Volumetric Floor & Backlight Aura Planes (y = 0.072 & z = -0.55)
      const floorAuraGeo = new THREE.PlaneGeometry(2.7, 1.85);
      floorAuraGeo.rotateX(-Math.PI / 2);
      const floorAuraMat = new THREE.MeshBasicMaterial({
        color: 0xf4d27a,
        map: auraGlowTex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const floorAuraMesh = new THREE.Mesh(floorAuraGeo, floorAuraMat);
      floorAuraMesh.position.set(0, 0.072, 0.02);
      floorAuraMesh.renderOrder = 4;
      stageGroup.add(floorAuraMesh);

      const backAuraGeo = new THREE.PlaneGeometry(2.35, 3.15);
      const backAuraMat = new THREE.MeshBasicMaterial({
        color: 0xf4d27a,
        map: auraGlowTex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const backAuraMesh = new THREE.Mesh(backAuraGeo, backAuraMat);
      backAuraMesh.position.set(0, 1.48, -0.58);
      backAuraMesh.renderOrder = 4;
      stageGroup.add(backAuraMesh);

      // Part 4B: Volumetric Sunshower God-Ray / Window Sunshaft / Post-Sunset Fixture Cone (z = -0.22)
      const volumetricBeamGeo = new THREE.PlaneGeometry(1.0, 1.0);
      const volumetricBeamMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(0xfff1d8) },
          uOpacity: { value: 0 },
        },
        vertexShader: VOLUMETRIC_BEAM_VERT,
        fragmentShader: VOLUMETRIC_BEAM_FRAG,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const volumetricBeamMesh = new THREE.Mesh(volumetricBeamGeo, volumetricBeamMat);
      volumetricBeamMesh.position.set(0, 2.35, -0.22);
      volumetricBeamMesh.renderOrder = 5;
      scene.add(volumetricBeamMesh);

      const seeds = createSeeds();

      // Part 5: 3D Volumetric Rain / Snow `InstancedMesh` (outdoor only)
      const precipGeo = new THREE.CylinderGeometry(0.006, 0.009, 0.22, 6, 1);
      const precipMat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial = isSoftwareGl
        ? new THREE.MeshBasicMaterial({
            color: 0xdbeafe,
            transparent: true,
            opacity: 0.56,
            depthWrite: false,
          })
        : new THREE.MeshStandardMaterial({
            color: 0xdbeafe,
            emissive: 0x9ec5fe,
            emissiveIntensity: 0.35,
            roughness: 0.22,
            metalness: 0.15,
            transparent: true,
            opacity: 0.56,
            depthWrite: false,
          });
      const precipMesh = new THREE.InstancedMesh(precipGeo, precipMat, PRECIP_COUNT);
      precipMesh.frustumCulled = false;
      precipMesh.renderOrder = 6;
      if (!isSoftwareGl) {
        for (let i = 0; i < PRECIP_COUNT; i += 1) {
          const tint = 0.88 + (i % 5) * 0.03;
          _colorA.setRGB(tint * 0.92, tint * 0.96, Math.min(1, tint * 1.02));
          precipMesh.setColorAt(i, _colorA);
        }
        if (precipMesh.instanceColor) precipMesh.instanceColor.needsUpdate = true;
      }
      scene.add(precipMesh);

      // Part 6: Wet Floor Raindrop Ripple Rings `InstancedMesh` (outdoor rain / sunshower)
      const rippleGeo = new THREE.RingGeometry(0.075, 0.095, 24);
      rippleGeo.rotateX(-Math.PI / 2);
      const rippleMat = new THREE.MeshBasicMaterial({
        color: 0xdbeafe,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      });
      const rippleMesh = new THREE.InstancedMesh(rippleGeo, rippleMat, RIPPLE_COUNT);
      rippleMesh.frustumCulled = false;
      rippleMesh.renderOrder = 5;
      scene.add(rippleMesh);

      // Part 7: Luxury Tier A / S Shimmer Dust `InstancedMesh`
      const moteGeo = new THREE.OctahedronGeometry(0.018, 0);
      const moteMat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial = isSoftwareGl
        ? new THREE.MeshBasicMaterial({
            color: 0xfff3c4,
            transparent: true,
            opacity: 0.76,
            depthWrite: false,
          })
        : new THREE.MeshStandardMaterial({
            color: 0xfff3c4,
            emissive: 0xf4d27a,
            emissiveIntensity: 0.7,
            roughness: 0.18,
            metalness: 0.85,
            transparent: true,
            opacity: 0.76,
            depthWrite: false,
          });
      const moteMesh = new THREE.InstancedMesh(moteGeo, moteMat, MOTE_COUNT);
      moteMesh.frustumCulled = false;
      moteMesh.renderOrder = 7;
      if (!isSoftwareGl) {
        for (let i = 0; i < MOTE_COUNT; i += 1) {
          const warmShift = (i % 4) * 0.035;
          _colorB.setRGB(1, 0.95 - warmShift, 0.82 - warmShift);
          moteMesh.setColorAt(i, _colorB);
        }
        if (moteMesh.instanceColor) moteMesh.instanceColor.needsUpdate = true;
      }
      scene.add(moteMesh);

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      let disposed = false;
      let contextLost = false;
      let rafId = 0;
      const swTimerRef = { current: 0 };
      let renderBusy = false;
      let renderDirty = false;
      let loopRunning = false;

      let currentYawRad = 0;
      let lastTimeSec = performance.now() * 0.001;

      const cancelScheduledFrames = () => {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
        if (swTimerRef.current) {
          window.clearTimeout(swTimerRef.current);
          swTimerRef.current = 0;
        }
        loopRunning = false;
        renderBusy = false;
      };

      const stepScene = (nowSec: number): boolean => {
        const dt = Math.min(0.08, Math.max(0.001, nowSec - lastTimeSec));
        lastTimeSec = nowSec;
        const p = propsRef.current;
        const lf = p.lightingFrame;
        const isDark = p.theme === 'dark';

        _targetKeyColor.setHex(lf.keyHex);
        _targetSkyColor.setHex(lf.skyHex);
        _targetGroundColor.setHex(lf.groundHex);
        _targetFogColor.setHex(lf.fogHex);
        _targetAuraColor.setHex(
          lf.preset === 'auto' ? resolveTierAuraHex(p.auraTier) : lf.rimHex
        );
        _targetBeamColor.setHex(lf.beamHex);
        _targetHazeColor.setHex(lf.hazeHex);
        _targetGoboColor.setHex(lf.goboHex);

        const blend = isSoftwareGl ? 1 : 1 - Math.exp(-6.5 * dt);
        keyLight.color.lerp(_targetKeyColor, blend);
        keyLight.intensity = isSoftwareGl
          ? lf.keyIntensity
          : THREE.MathUtils.damp(keyLight.intensity, lf.keyIntensity, 7, dt);
        keyLight.position.set(
          isSoftwareGl ? lf.keyPosX : THREE.MathUtils.damp(keyLight.position.x, lf.keyPosX, 6, dt),
          isSoftwareGl ? lf.keyPosY : THREE.MathUtils.damp(keyLight.position.y, lf.keyPosY, 6, dt),
          isSoftwareGl ? lf.keyPosZ : THREE.MathUtils.damp(keyLight.position.z, lf.keyPosZ, 6, dt)
        );

        hemiLight.color.lerp(_targetSkyColor, blend);
        hemiLight.groundColor.lerp(_targetGroundColor, blend);
        hemiLight.intensity = isSoftwareGl
          ? lf.hemiIntensity
          : THREE.MathUtils.damp(hemiLight.intensity, lf.hemiIntensity, 7, dt);

        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color.lerp(_targetFogColor, blend);
          scene.fog.density = lf.fogDensity;
        }

        // Exact closed-form camera calibration so 3D floor origin (0,0,0) lands on 2D `soleStageTopPct` (0px gap!)
        // Keep camera strictly centered at X=0 (zero lateral pan) so the horizontal floor ring stays 100% level
        // parallel to the 2D room floor at every angle (-180°..+180°) without off-axis diagonal ellipse tilt.
        const targetYawRad = THREE.MathUtils.degToRad(
          THREE.MathUtils.clamp(p.angleScrollDeg || 0, -180, 180) * 0.12
        );
        currentYawRad = isSoftwareGl
          ? targetYawRad
          : THREE.MathUtils.damp(currentYawRad, targetYawRad, 7.5, dt);
        const camPosZ = 4.55;
        const camPosY = 1.42;
        const floorCal = computeThreeCameraLookAtForSolePct({
          soleStageTopPct: p.soleStageTopPct,
          cameraPosY: camPosY,
          cameraPosZ: camPosZ,
          fovDeg: camera.fov,
        });
        camera.position.set(0, camPosY, camPosZ);
        camera.lookAt(0, floorCal.lookAtY, 0);
        stageGroup.rotation.y = -currentYawRad * 0.65;
        trimRing.rotation.y = -stageGroup.rotation.y;

        // Warm Indoor Fixture Floor Spotlight Pool (illuminates floor beneath shadow so cast shadow pops!)
        const poolOpacity =
          (!p.isOutdoor || lf.isNeonScene) && lf.floorPoolStrength > 0.01 ? lf.floorPoolStrength : 0;
        fixturePoolMesh.visible = poolOpacity > 0.005;
        if (fixturePoolMesh.visible) {
          _targetFloorPoolColor.setHex(lf.floorPoolHex);
          fixturePoolMat.color.lerp(_targetFloorPoolColor, blend);
          fixturePoolMat.opacity = THREE.MathUtils.clamp(
            poolOpacity * (isDark ? 1.24 : 1.04),
            0,
            0.86
          );
          fixturePoolMesh.position.set(
            THREE.MathUtils.clamp(lf.keyPosX * 0.12, -0.35, 0.35),
            0.004,
            0.06
          );
        }

        // Single-Pass GLSL 3-Channel Silhouette Shadow:
        // Contact AO + Decoupled Natural Sun Cast Shadow + Decoupled Artificial Lamp Primary/Secondary Shadows
        silhouetteShadowMesh.visible = Boolean(p.hasCharacter);
        if (silhouetteShadowMesh.visible) {
          const baseContactOpacity = !p.isOutdoor
            ? isDark
              ? 0.54
              : 0.48
            : isDark
              ? 0.5
              : 0.44;
          const baseCastOpacity = !p.isOutdoor
            ? isDark
              ? 0.62
              : 0.52
            : isDark
              ? 0.54
              : 0.44;

          // Channel A: Natural Sunlight / Window Shadow (direction & opacity strictly invariant to lamp dimmer)
          let sunX = lf.naturalShadowDirX;
          let sunZ = lf.naturalShadowDirZ;
          if (Math.hypot(sunX, sunZ) < 0.08) {
            sunX = 0.32;
            sunZ = -0.94;
          }
          (silhouetteShadowMat.uniforms.uSunShadowDir.value as THREE.Vector2).set(sunX, sunZ);
          const sunLen = THREE.MathUtils.clamp(
            p.stageFraming.shadowHeightMeters * 0.86 * lf.naturalShadowLengthScale,
            0.85,
            2.15
          );
          silhouetteShadowMat.uniforms.uSunShadowLength.value = sunLen;
          silhouetteShadowMat.uniforms.uSunDirectRatio.value = THREE.MathUtils.clamp(
            lf.naturalShadowDirectRatio,
            0.12,
            1.0
          );
          silhouetteShadowMat.uniforms.uSunShadowOpacity.value =
            lf.naturalShadowOpacity <= 0.002
              ? 0
              : THREE.MathUtils.clamp(baseCastOpacity * lf.naturalShadowOpacity, 0, 0.72);

          // Channel B: Artificial Indoor Fixture Primary + Opposing Fill Shadow (direction fixed; dimmer scales opacity only)
          let lampX = lf.fixtureShadowDirX;
          let lampZ = lf.fixtureShadowDirZ;
          if (Math.hypot(lampX, lampZ) < 0.08) {
            lampX = -0.32;
            lampZ = -0.94;
          }
          (silhouetteShadowMat.uniforms.uLampShadowDir.value as THREE.Vector2).set(lampX, lampZ);
          const lampLen = THREE.MathUtils.clamp(
            p.stageFraming.shadowHeightMeters * 0.86 * lf.fixtureShadowLengthScale,
            0.85,
            2.15
          );
          silhouetteShadowMat.uniforms.uLampShadowLength.value = lampLen;
          silhouetteShadowMat.uniforms.uLampDirectRatio.value = THREE.MathUtils.clamp(
            lf.fixtureShadowDirectRatio,
            0.12,
            1.0
          );
          const lampPrimaryOpacity =
            lf.fixtureShadowOpacity <= 0.002
              ? 0
              : THREE.MathUtils.clamp(baseCastOpacity * lf.fixtureShadowOpacity, 0, 0.74);
          silhouetteShadowMat.uniforms.uLampShadowOpacity.value = lampPrimaryOpacity;

          (silhouetteShadowMat.uniforms.uLampShadowDir2.value as THREE.Vector2).set(
            lf.secondaryShadowDirX,
            lf.secondaryShadowDirZ
          );
          silhouetteShadowMat.uniforms.uLampShadowLength2.value = lampLen * 0.88;
          silhouetteShadowMat.uniforms.uLampShadowOpacity2.value =
            lampPrimaryOpacity <= 0.002 || lf.secondaryShadowWeight <= 0.005
              ? 0
              : THREE.MathUtils.clamp(
                  lampPrimaryOpacity * THREE.MathUtils.clamp(lf.secondaryShadowWeight, 0, 0.55),
                  0,
                  0.44
                );

          silhouetteShadowMat.uniforms.uFootprintScale.value = p.stageFraming.shadowFootprintScale;
          silhouetteShadowMat.uniforms.uCharWidthMeters.value =
            1.18 * p.stageFraming.shadowFootprintScale;
          silhouetteShadowMat.uniforms.uMirrorX.value = p.mirrorX ? 1.0 : 0.0;

          const safeBottom =
            typeof p.bottomRatio === 'number' && Number.isFinite(p.bottomRatio)
              ? THREE.MathUtils.clamp(p.bottomRatio, 0.72, 0.995)
              : 0.955;
          const safeTop =
            typeof p.topRatio === 'number' && Number.isFinite(p.topRatio)
              ? THREE.MathUtils.clamp(p.topRatio, 0.01, 0.45)
              : 0.06;
          silhouetteShadowMat.uniforms.uSoleBottomV.value = 1.0 - safeBottom;
          silhouetteShadowMat.uniforms.uCrownTopV.value = 1.0 - safeTop;

          // Contact AO stays softly grounded beneath shoe soles even when lamps are OFF
          silhouetteShadowMat.uniforms.uContactAoOpacity.value = THREE.MathUtils.clamp(
            baseContactOpacity * lf.contactAoScale,
            0.16,
            0.66
          );

          // Cool slate outdoor daytime shadow vs warm charcoal indoor/sunset shadow
          const shadowHex = p.isOutdoor
            ? lf.solar.isPostSunset
              ? 0x0b101c
              : lf.solar.goldenHourWeight > 0.35
                ? 0x1d1614
                : 0x131a26
            : isDark
              ? 0x080706
              : 0x1b1714;
          (silhouetteShadowMat.uniforms.uShadowColor.value as THREE.Color).setHex(shadowHex);
        }

        // Projected Indoor Window Gobo Patch (daytime rooms with windows only; 0 after sunset or windowless)
        goboPatchMesh.visible = lf.goboVisible;
        if (lf.goboVisible) {
          const nextGoboTex = goboTextures.get(lf.goboKind);
          if (nextGoboTex && goboMat.map !== nextGoboTex) {
            goboMat.map = nextGoboTex;
            goboMat.needsUpdate = true;
          }
          goboMat.color.lerp(_targetGoboColor, blend);
          goboMat.opacity = lf.goboOpacity;
          goboPatchMesh.position.set(lf.goboPosX, 0.036, lf.goboPosZ);
          goboPatchMesh.rotation.y = lf.goboRotY;
          goboPatchMesh.scale.set(lf.goboScaleX, 1, lf.goboScaleZ);
        }

        // Volumetric Sunshower God-Ray / Indoor Window Sunshaft / Post-Sunset Fixture Cone
        volumetricBeamMesh.visible = lf.beamVisible;
        if (lf.beamVisible) {
          (volumetricBeamMat.uniforms.uColor.value as THREE.Color).lerp(_targetBeamColor, blend);
          volumetricBeamMat.uniforms.uOpacity.value = lf.beamOpacity;
          volumetricBeamMesh.position.set(lf.beamPosX, lf.beamPosY, lf.beamPosZ);
          volumetricBeamMesh.rotation.set(0, 0, lf.beamTiltZ);
          volumetricBeamMesh.scale.set(lf.beamScaleX, lf.beamScaleY, 1);
        }

        // Mie Forward-Scattering Atmospheric Haze / Indoor Post-Sunset Wall-Wash
        mieHazeMesh.visible = lf.hazeVisible;
        if (lf.hazeVisible) {
          (mieHazeMat.uniforms.uColor.value as THREE.Color).lerp(_targetHazeColor, blend);
          mieHazeMat.uniforms.uOpacity.value = lf.hazeOpacity;
          mieHazeMat.uniforms.uFocusY.value = lf.hazeFocusY;
        }

        // Wet vs dry floor surface calibration (including Sunshower wet stone specular glint!)
        const isSunshower = lf.opticalRegime === 'sunshower';
        const isOutdoorRain =
          p.isOutdoor && (p.weatherMode === 'rain' || lf.opticalRegime === 'rain' || isSunshower);
        const isOutdoorSnow =
          p.isOutdoor && (p.weatherMode === 'snow' || lf.opticalRegime === 'snow');
        const isOutdoorWind =
          p.isOutdoor &&
          (p.weatherMode === 'wind' || p.weatherMode === 'coldwave' || lf.opticalRegime === 'wind');

        if (floorMat instanceof THREE.MeshStandardMaterial) {
          const hasOrm = Boolean(floorMat.userData.hasMegascansOrm);
          floorMat.roughness = isSunshower
            ? hasOrm
              ? 0.22
              : 0.11
            : isOutdoorRain
              ? hasOrm
                ? 0.28
                : 0.16
              : isOutdoorSnow
                ? hasOrm
                  ? 0.96
                  : 0.84
                : hasOrm
                  ? 1.0
                  : 0.72;
          floorMat.metalness = isSunshower ? 0.68 : isOutdoorRain ? 0.52 : 0.14;
        }
        // Keep dry outdoor stone paving 100% crisp at human scale; enable wet/snow/sunshower floor sheen
        floorDisc.visible = !p.isOutdoor || isOutdoorRain || isOutdoorSnow;
        floorMat.opacity = isSunshower
          ? 0.34 * Math.max(0.5, lf.intensityScale)
          : isOutdoorRain
            ? 0.28
            : isOutdoorSnow
              ? 0.22
              : (isDark ? 0.16 : 0.12) * Math.max(0.4, lf.intensityScale);
        floorMat.color.copy(
          isSunshower ? _targetBeamColor : p.isOutdoor ? _targetSkyColor : _targetKeyColor
        );

        // Tiered 3D Aura calibration (scaled by user brightness control)
        floorAuraMat.color.copy(_targetAuraColor);
        backAuraMat.color.copy(_targetAuraColor);
        rimLight.color.copy(_targetAuraColor);
        trimMat.color.copy(_targetAuraColor);

        const isTierS = p.auraTier === 'S' || p.auraTier === 'S+';
        const isTierA = p.auraTier === 'A' || p.auraTier === 'A+';
        const isTierB = p.auraTier === 'B' || p.auraTier === 'B+';

        if (p.auraTier === 'C') {
          floorAuraMesh.visible = false;
          backAuraMesh.visible = false;
          trimRing.visible = false;
          rimLight.intensity = 0.28 * lf.rimScale;
        } else if (isTierB) {
          floorAuraMesh.visible = !p.isOutdoor && lf.intensityScale > 0.05;
          backAuraMesh.visible = lf.intensityScale > 0.05;
          trimRing.visible = !p.isOutdoor;
          floorAuraMat.opacity = (isDark ? 0.12 : 0.16) * lf.intensityScale;
          backAuraMat.opacity = (isDark ? 0.1 : 0.14) * lf.intensityScale;
          trimMat.opacity = 0.2;
          rimLight.intensity = 0.62 * lf.rimScale;
        } else if (isTierA) {
          floorAuraMesh.visible = !p.isOutdoor && lf.intensityScale > 0.05;
          backAuraMesh.visible = lf.intensityScale > 0.05;
          trimRing.visible = !p.isOutdoor;
          floorAuraMat.opacity = (isDark ? 0.2 : 0.26) * lf.intensityScale;
          backAuraMat.opacity = (isDark ? 0.2 : 0.26) * lf.intensityScale;
          trimMat.opacity = 0.34;
          rimLight.intensity = 1.05 * lf.rimScale;
        } else {
          // S / S+ luxury gold volumetric stage aura
          const shimmerWave = 0.92 + Math.sin(nowSec * 1.9) * 0.08;
          floorAuraMesh.visible = !p.isOutdoor && lf.intensityScale > 0.05;
          backAuraMesh.visible = lf.intensityScale > 0.05;
          trimRing.visible = !p.isOutdoor;
          floorAuraMat.opacity = (isDark ? 0.28 : 0.34) * shimmerWave * lf.intensityScale;
          backAuraMat.opacity = (isDark ? 0.3 : 0.36) * shimmerWave * lf.intensityScale;
          trimMat.opacity = 0.48;
          rimLight.intensity = 1.38 * shimmerWave * lf.rimScale;
        }

        // 3D Weather Precipitation (strictly outdoor + tiers only!)
        const showPrecip = p.isOutdoor && (isOutdoorRain || isOutdoorSnow || isOutdoorWind);
        precipMesh.visible = showPrecip;
        if (showPrecip) {
          if (isSunshower) {
            // Backlit golden-silver glinting raindrops in sunshower (여우비)
            precipMat.color.setHex(0xfff1c9);
            if (precipMat instanceof THREE.MeshStandardMaterial) {
              precipMat.emissive.setHex(0xffd78a);
              precipMat.emissiveIntensity = 0.65;
            }
            precipMat.opacity = isDark ? 0.64 : 0.56;
          } else if (isOutdoorRain) {
            precipMat.color.setHex(0xd6e8ff);
            if (precipMat instanceof THREE.MeshStandardMaterial) {
              precipMat.emissive.setHex(0x9ec5fe);
              precipMat.emissiveIntensity = 0.35;
            }
            precipMat.opacity = isDark ? 0.54 : 0.46;
          } else if (isOutdoorSnow) {
            precipMat.color.setHex(0xffffff);
            precipMat.opacity = 0.82;
          } else {
            precipMat.color.setHex(0xe2e8f0);
            precipMat.opacity = 0.32;
          }

          const activePrecipCount = isSoftwareGl ? 36 : PRECIP_COUNT;
          for (let i = 0; i < PRECIP_COUNT; i += 1) {
            if (i >= activePrecipCount) {
              _dummy.scale.set(0, 0, 0);
              _dummy.updateMatrix();
              precipMesh.setMatrixAt(i, _dummy.matrix);
              continue;
            }
            const s = seeds.precip[i];
            if (isOutdoorRain) {
              const fallY = 4.2 - (((s.y + nowSec * 4.8 * s.speed) % 4.6) - 0.2);
              const windX = s.x - (4.2 - fallY) * 0.14;
              _dummy.position.set(windX, fallY, s.z);
              _dummy.rotation.set(0, 0, 0.14);
              _dummy.scale.set(0.75 * s.scaleJitter, 1.35 * s.scaleJitter, 0.75 * s.scaleJitter);
            } else if (isOutdoorSnow) {
              const fallY = 4.2 - (((s.y + nowSec * 0.92 * s.speed) % 4.6) - 0.2);
              const swayX = s.x + Math.sin(nowSec * 1.4 + s.driftPhase) * 0.22;
              _dummy.position.set(swayX, fallY, s.z);
              _dummy.rotation.set(nowSec * 0.8, s.driftPhase, nowSec * 0.5);
              const flakeS = 1.65 * s.scaleJitter;
              _dummy.scale.set(flakeS, 0.18 * flakeS, flakeS);
            } else {
              const sweepX = ((s.x + 3.0 + nowSec * 3.4 * s.speed) % 6.0) - 3.0;
              const bobY = 0.4 + ((s.y + Math.sin(nowSec + s.driftPhase) * 0.25) % 3.4);
              _dummy.position.set(sweepX, bobY, s.z);
              _dummy.rotation.set(0, 0, Math.PI * 0.46);
              _dummy.scale.set(0.55 * s.scaleJitter, 1.15 * s.scaleJitter, 0.55 * s.scaleJitter);
            }
            _dummy.updateMatrix();
            precipMesh.setMatrixAt(i, _dummy.matrix);
          }
          precipMesh.instanceMatrix.needsUpdate = true;
        }

        // Wet floor ripples (outdoor rain & sunshower)
        rippleMesh.visible = isOutdoorRain;
        if (isOutdoorRain) {
          rippleMat.color.setHex(isSunshower ? 0xffecc4 : 0xdbeafe);
          for (let i = 0; i < RIPPLE_COUNT; i += 1) {
            const r = seeds.ripples[i];
            const prog = (r.phase + nowSec * r.speed) % 1;
            const sc = 0.25 + prog * (1.2 + r.maxScale * 2.5);
            _dummy.position.set(r.x, 0.032, r.z);
            _dummy.rotation.set(0, 0, 0);
            _dummy.scale.set(sc, 1, sc * 0.68);
            _dummy.updateMatrix();
            rippleMesh.setMatrixAt(i, _dummy.matrix);
          }
          rippleMesh.instanceMatrix.needsUpdate = true;
        }

        // Tier A/A+ / S/S+ Floating Shimmer Motes
        const showMotes = (isTierS || isTierA) && lf.intensityScale > 0.05;
        moteMesh.visible = showMotes;
        if (showMotes) {
          const activeCount = isTierS ? MOTE_COUNT : 18;
          moteMat.color.copy(_targetAuraColor);
          if (moteMat instanceof THREE.MeshStandardMaterial) {
            moteMat.emissive.copy(_targetAuraColor);
          }
          moteMat.opacity = (isTierS ? 0.78 : 0.46) * Math.min(1.25, lf.intensityScale);
          for (let i = 0; i < MOTE_COUNT; i += 1) {
            if (i >= activeCount) {
              _dummy.scale.set(0, 0, 0);
              _dummy.updateMatrix();
              moteMesh.setMatrixAt(i, _dummy.matrix);
              continue;
            }
            const m = seeds.motes[i];
            const theta = m.angle + nowSec * m.speed;
            const mx = Math.cos(theta) * m.radius;
            const mz = Math.sin(theta) * m.radius * 0.58 - 0.1;
            const my = m.baseY + Math.sin(nowSec * m.bobSpeed + m.angle) * 0.12;
            _dummy.position.set(mx, my, mz);
            _dummy.rotation.set(nowSec * 0.7 + i, theta, 0);
            _dummy.scale.setScalar(m.scale * (isTierS ? 1.05 : 0.82));
            _dummy.updateMatrix();
            moteMesh.setMatrixAt(i, _dummy.matrix);
          }
          moteMesh.instanceMatrix.needsUpdate = true;
        }

        if (isSoftwareGl) {
          return false;
        }
        const yawSettled = Math.abs(targetYawRad - currentYawRad) < 0.0015;
        const lightingSettled =
          Math.abs(keyLight.intensity - lf.keyIntensity) < 0.008 &&
          Math.abs(hemiLight.intensity - lf.hemiIntensity) < 0.008 &&
          Math.abs(keyLight.position.x - lf.keyPosX) < 0.01 &&
          Math.abs(keyLight.position.y - lf.keyPosY) < 0.01 &&
          Math.abs(keyLight.position.z - lf.keyPosZ) < 0.01 &&
          Math.abs(keyLight.color.r - _targetKeyColor.r) < 0.006 &&
          Math.abs(keyLight.color.g - _targetKeyColor.g) < 0.006 &&
          Math.abs(keyLight.color.b - _targetKeyColor.b) < 0.006 &&
          (!fixturePoolMesh.visible ||
            (Math.abs(fixturePoolMat.color.r - _targetFloorPoolColor.r) < 0.006 &&
              Math.abs(fixturePoolMat.color.g - _targetFloorPoolColor.g) < 0.006 &&
              Math.abs(fixturePoolMat.color.b - _targetFloorPoolColor.b) < 0.006));
        return !p.paused && (showPrecip || !yawSettled || !lightingSettled || showMotes);
      };

      const tickLoop = () => {
        if (disposed || contextLost || propsRef.current.paused) {
          loopRunning = false;
          return;
        }
        const keepLooping = stepScene(performance.now() * 0.001);
        renderer.render(scene, camera);

        if (!keepLooping) {
          loopRunning = false;
          return;
        }
        if (isSoftwareGl) {
          scheduleAfterSoftwareDraw(renderer, tickLoop, swTimerRef);
        } else {
          rafId = requestAnimationFrame(tickLoop);
        }
      };

      const requestRender = () => {
        if (disposed || contextLost || propsRef.current.paused) return;
        if (loopRunning) return;
        if (renderBusy) {
          renderDirty = true;
          return;
        }
        renderBusy = true;
        rafId = requestAnimationFrame(() => {
          rafId = 0;
          if (disposed || contextLost || propsRef.current.paused) {
            renderBusy = false;
            return;
          }
          renderDirty = false;
          const wakeNowSec = performance.now() * 0.001;
          if (wakeNowSec - lastTimeSec > 0.25) {
            lastTimeSec = wakeNowSec - 0.016;
          }
          const shouldLoop = stepScene(wakeNowSec);
          renderer.render(scene, camera);

          const finishOneShot = () => {
            renderBusy = false;
            if (disposed || contextLost || propsRef.current.paused) return;
            if (shouldLoop) {
              loopRunning = true;
              if (isSoftwareGl) {
                scheduleAfterSoftwareDraw(renderer, tickLoop, swTimerRef);
              } else {
                rafId = requestAnimationFrame(tickLoop);
              }
            } else if (renderDirty) {
              requestRender();
            }
          };

          if (isSoftwareGl) {
            scheduleAfterSoftwareDraw(renderer, finishOneShot, swTimerRef);
          } else {
            finishOneShot();
          }
        });
      };

      let activeCutoutUrl: string | null = null;
      let activeCutoutTex: THREE.Texture | null = null;
      let cutoutLoadToken = 0;

      const syncCutoutTexture = (nextUrl: string | null | undefined) => {
        const cleanUrl = typeof nextUrl === 'string' && nextUrl.trim() ? nextUrl.trim() : null;
        if (cleanUrl === activeCutoutUrl) return;
        activeCutoutUrl = cleanUrl;
        cutoutLoadToken += 1;
        const myToken = cutoutLoadToken;

        if (!cleanUrl) {
          silhouetteShadowMat.uniforms.uCutoutTex.value = dummyCutoutTex;
          silhouetteShadowMat.uniforms.uHasCutout.value = 0.0;
          if (activeCutoutTex) {
            activeCutoutTex.dispose();
            activeCutoutTex = null;
          }
          requestRender();
          return;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.decoding = 'async';
        img.onload = () => {
          if (disposed || myToken !== cutoutLoadToken) return;
          const nextTex = new THREE.Texture(img);
          nextTex.colorSpace = THREE.SRGBColorSpace;
          nextTex.minFilter = THREE.LinearFilter;
          nextTex.magFilter = THREE.LinearFilter;
          nextTex.wrapS = THREE.ClampToEdgeWrapping;
          nextTex.wrapT = THREE.ClampToEdgeWrapping;
          nextTex.generateMipmaps = false;
          nextTex.needsUpdate = true;

          const prevTex = activeCutoutTex;
          activeCutoutTex = nextTex;
          silhouetteShadowMat.uniforms.uCutoutTex.value = nextTex;
          silhouetteShadowMat.uniforms.uHasCutout.value = 1.0;
          if (prevTex) {
            prevTex.dispose();
          }
          requestRender();
        };
        img.onerror = () => {
          if (disposed || myToken !== cutoutLoadToken) return;
          silhouetteShadowMat.uniforms.uCutoutTex.value = dummyCutoutTex;
          silhouetteShadowMat.uniforms.uHasCutout.value = 0.0;
          requestRender();
        };
        img.src = cleanUrl;
      };

      syncCutoutTexRef.current = syncCutoutTexture;
      syncCutoutTexture(propsRef.current.modelImageUrl);

      // Silent Drop-In Quixel Megascans 3-preset floor upgrades (stone / oak / outdoor)
      const megascansSession = createMegascansSession({ renderer, isSoftwareGl });
      let activeFloorSlotId: FittingFloorSlotId | null = null;
      let floorSlotToken = 0;

      const syncFloorMegascansPreset = (bgId: string | undefined, outdoor: boolean) => {
        if (disposed || isSoftwareGl || !(floorMat instanceof THREE.MeshStandardMaterial)) {
          return;
        }
        const nextSlot = resolveFittingFloorSlotId(bgId, outdoor);
        if (nextSlot === activeFloorSlotId) return;
        activeFloorSlotId = nextSlot;
        const myToken = ++floorSlotToken;

        void megascansSession.loadSlot(nextSlot).then((loaded) => {
          if (disposed || myToken !== floorSlotToken) return;
          if (loaded) {
            applyMegascansPbrToMaterial(floorMat, loaded.textures, {
              slotId: nextSlot,
              repeat: loaded.entry.repeat,
              normalStrength: loaded.entry.normalStrength,
              normalConvention: loaded.entry.normalConvention,
              preserveOriginalAlbedo: loaded.entry.preserveOriginalAlbedo,
              aoMapIntensity: loaded.entry.aoMapIntensity,
              keepScalarRoughness: true,
              keepScalarMetalness: true,
              targetGeometries: [floorGeo],
            });
          } else if (floorMat.userData.megascansSlotId) {
            floorMat.map = null;
            floorMat.normalMap = null;
            floorMat.aoMap = null;
            floorMat.roughnessMap = null;
            floorMat.metalnessMap = null;
            floorMat.bumpMap = stoneBumpTex;
            floorMat.userData.megascansSlotId = null;
            floorMat.userData.hasMegascansOrm = false;
            floorMat.needsUpdate = true;
          }
          requestRender();
        });
      };

      syncFloorPresetRef.current = syncFloorMegascansPreset;
      syncFloorMegascansPreset(propsRef.current.stageBackgroundId, propsRef.current.isOutdoor);

      triggerWakeRef.current = () => {
        if (propsRef.current.paused) {
          cancelScheduledFrames();
          return;
        }
        requestRender();
      };

      const handleResize = () => {
        if (disposed || !container) return;
        const w = Math.max(1, container.clientWidth);
        const h = Math.max(1, container.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        requestRender();
      };

      const resizeObserver =
        typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
      resizeObserver?.observe(container);

      const onContextLost = (ev: Event) => {
        ev.preventDefault();
        contextLost = true;
        onWebGlAvailabilityChangeRef.current?.(false);
        cancelScheduledFrames();
      };
      const onContextRestored = () => {
        contextLost = false;
        onWebGlAvailabilityChangeRef.current?.(true);
        lastTimeSec = performance.now() * 0.001;
        requestRender();
      };
      canvas.addEventListener('webglcontextlost', onContextLost, false);
      canvas.addEventListener('webglcontextrestored', onContextRestored, false);

      if (!propsRef.current.paused) {
        requestRender();
      }

      cleanupStage = () => {
        disposed = true;
        triggerWakeRef.current = null;
        syncCutoutTexRef.current = null;
        syncFloorPresetRef.current = null;
        cancelScheduledFrames();
        resizeObserver?.disconnect();
        canvas.removeEventListener('webglcontextlost', onContextLost, false);
        canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
        megascansSession.dispose();
        stoneBumpTex?.dispose();
        scene.environment = null;
        envTexture?.dispose();
        dummyCutoutTex.dispose();
        if (activeCutoutTex) {
          activeCutoutTex.dispose();
          activeCutoutTex = null;
        }
        for (const tex of goboTextures.values()) {
          tex.dispose();
        }
        goboTextures.clear();
        disposeObject3DTree(scene);
        renderer.dispose();
        container.replaceChildren();
      };
    };

    bootRafId = requestAnimationFrame(() => {
      if (unmounted) return;
      bootTimerId = window.setTimeout(bootStage, 35);
    });

    return () => {
      unmounted = true;
      if (bootRafId) cancelAnimationFrame(bootRafId);
      if (bootTimerId) clearTimeout(bootTimerId);
      cleanupStage?.();
    };
  }, []);

  useEffect(() => {
    syncCutoutTexRef.current?.(modelImageUrl);
  }, [modelImageUrl]);

  useEffect(() => {
    syncFloorPresetRef.current?.(stageBackgroundId, isOutdoor);
  }, [stageBackgroundId, isOutdoor]);

  useEffect(() => {
    triggerWakeRef.current?.();
  }, [
    isOutdoor,
    weatherMode,
    timeOfDay,
    auraTier,
    theme,
    angleScrollDeg,
    paused,
    hasCharacter,
    lightingFrame,
    stageFraming,
    soleStageTopPct,
    topRatio,
    bottomRatio,
    mirrorX,
  ]);

  return (
    <div
      className={`studio-three-stage-layer ${paused ? 'is-paused' : ''}`.trim()}
      data-testid="studio-three-stage-layer"
      data-stage-outdoor={isOutdoor ? 'true' : 'false'}
      data-aura-tier={auraTier}
      data-weather-mode={isOutdoor ? weatherMode : 'indoor-ivory'}
      data-optical-regime={lightingFrame.opticalRegime}
      data-lighting-preset={lightingFrame.preset}
      data-lighting-intensity={String(lightingFrame.intensityPct)}
      data-post-sunset={lightingFrame.solar.isPostSunset ? 'true' : 'false'}
      data-solar-season={lightingFrame.solar.seasonLabel}
      data-solar-alt={String(Math.round(lightingFrame.solar.altitudeDeg))}
      data-indoor-fixture={lightingFrame.indoorNightFixture}
      data-software-gl={isSoftwareGlAttr ? 'true' : 'false'}
      aria-hidden="true"
    >
      <div ref={mountRef} className="studio-three-stage-mount" />
    </div>
  );
}
