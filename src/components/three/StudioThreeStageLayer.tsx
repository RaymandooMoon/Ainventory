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
  type StageTierCode,
  createRadialAuraGlowTexture,
  createRadialContactShadowTexture,
  createStoneMicroReliefTexture,
  createStudioEnvironmentTexture,
  createWindowGoboTexture,
  detectSoftwareWebGlFromContext,
  disposeObject3DTree,
  peekCachedSoftwareWebGl,
  scheduleAfterSoftwareDraw,
} from './threeRuntimeCapabilities.ts';

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
}: StudioThreeStageLayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

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

  const propsRef = useRef({
    isOutdoor,
    weatherMode,
    timeOfDay,
    auraTier,
    theme,
    angleScrollDeg,
    paused,
    hasCharacter,
    lightingFrame,
  });
  propsRef.current = {
    isOutdoor,
    weatherMode,
    timeOfDay,
    auraTier,
    theme,
    angleScrollDeg,
    paused,
    hasCharacter,
    lightingFrame,
  };

  const triggerWakeRef = useRef<(() => void) | null>(null);
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
        return;
      }

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
      const shadowDarkTex = createRadialContactShadowTexture(renderer, true);
      const shadowLightTex = createRadialContactShadowTexture(renderer, false);
      const auraGlowTex = createRadialAuraGlowTexture(renderer);

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

      // Part 2: Grounded Character Contact Shadow Disc (y = 0.020) — dynamically stretched/offset by sun & window angle
      const contactGeo = new THREE.CircleGeometry(0.66, 32);
      contactGeo.rotateX(-Math.PI / 2);
      const contactMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: propsRef.current.theme === 'dark' ? shadowDarkTex : shadowLightTex,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
      });
      const contactDisc = new THREE.Mesh(contactGeo, contactMat);
      contactDisc.position.set(0, 0.02, 0.08);
      contactDisc.scale.set(1.0, 1.0, 0.56);
      contactDisc.renderOrder = 2;
      stageGroup.add(contactDisc);

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
      const trimGeo = new THREE.TorusGeometry(0.74, 0.008, 12, 56);
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
      trimRing.scale.set(1, 1, 0.58);
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

        // Smoothly damp camera parallax & podium rotation from -180°..+180° angle slider
        const targetYawRad = THREE.MathUtils.degToRad(
          THREE.MathUtils.clamp(p.angleScrollDeg || 0, -180, 180) * 0.12
        );
        currentYawRad = isSoftwareGl
          ? targetYawRad
          : THREE.MathUtils.damp(currentYawRad, targetYawRad, 7.5, dt);
        camera.position.x = Math.sin(currentYawRad) * 0.62;
        camera.position.z = 4.55 - (1 - Math.cos(currentYawRad)) * 0.28;
        camera.lookAt(0, 1.04, 0);
        stageGroup.rotation.y = -currentYawRad * 0.65;

        // Ground Contact Shadow — reflects seasonal sun height & indoor window/fixture direction
        contactMat.map = isDark ? shadowDarkTex : shadowLightTex;
        contactDisc.visible = Boolean(p.hasCharacter);
        contactDisc.position.set(lf.shadowOffsetX, 0.02, lf.shadowOffsetZ);
        contactDisc.scale.set(lf.shadowStretchX, 1.0, lf.shadowStretchZ);
        contactMat.opacity = THREE.MathUtils.clamp(
          (isDark ? 0.56 : 0.48) * lf.shadowOpacityScale,
          0.22,
          0.74
        );

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
          floorMat.roughness = isSunshower
            ? 0.11
            : isOutdoorRain
              ? 0.16
              : isOutdoorSnow
                ? 0.84
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
        return !p.paused && (showPrecip || !yawSettled || showMotes);
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
          const shouldLoop = stepScene(performance.now() * 0.001);
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
        cancelScheduledFrames();
      };
      const onContextRestored = () => {
        contextLost = false;
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
        cancelScheduledFrames();
        resizeObserver?.disconnect();
        canvas.removeEventListener('webglcontextlost', onContextLost, false);
        canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
        scene.environment = null;
        envTexture?.dispose();
        shadowDarkTex.dispose();
        shadowLightTex.dispose();
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
