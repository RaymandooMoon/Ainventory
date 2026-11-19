import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  type StageTierCode,
  createRadialAuraGlowTexture,
  createRadialContactShadowTexture,
  createStoneMicroReliefTexture,
  createStudioEnvironmentTexture,
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
}

const PRECIP_COUNT = 84;
const RIPPLE_COUNT = 18;
const MOTE_COUNT = 36;

// Pre-allocated module-scope scratch objects to guarantee zero GC allocations per frame
const _dummy = new THREE.Object3D();
const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _targetKeyColor = new THREE.Color();
const _targetSkyColor = new THREE.Color();
const _targetGroundColor = new THREE.Color();
const _targetFogColor = new THREE.Color();
const _targetAuraColor = new THREE.Color();

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

function resolveStageLightingPalette(params: {
  isOutdoor: boolean;
  timeOfDay: string;
  weatherMode: string;
  auraTier: StageTierCode;
  isDark: boolean;
}) {
  const { isOutdoor, timeOfDay, weatherMode, auraTier } = params;

  if (!isOutdoor) {
    // Indoor architectural gallery: warm 3000K ivory indirect cove lighting, zero weather
    _targetKeyColor.setHex(0xfff1d8);
    _targetSkyColor.setHex(0xfbe8cb);
    _targetGroundColor.setHex(0x4a4239);
    _targetFogColor.setHex(0x231f1b);
  } else if (timeOfDay === 'sunrise') {
    _targetKeyColor.setHex(0xffbe86);
    _targetSkyColor.setHex(0x96b2de);
    _targetGroundColor.setHex(0x3f3c46);
    _targetFogColor.setHex(0x8899b8);
  } else if (timeOfDay === 'sunset') {
    _targetKeyColor.setHex(0xff9a5c);
    _targetSkyColor.setHex(0x7685bc);
    _targetGroundColor.setHex(0x38323e);
    _targetFogColor.setHex(0x6e7399);
  } else if (timeOfDay === 'night') {
    _targetKeyColor.setHex(0xbdd2ff);
    _targetSkyColor.setHex(0x36496e);
    _targetGroundColor.setHex(0x181e2c);
    _targetFogColor.setHex(0x1b2436);
  } else {
    // Daylight outdoor
    const isOvercast = weatherMode === 'rain' || weatherMode === 'snow';
    _targetKeyColor.setHex(isOvercast ? 0xdde7f5 : 0xfff8eb);
    _targetSkyColor.setHex(isOvercast ? 0x8ea4bf : 0x9ec8f5);
    _targetGroundColor.setHex(0x464b54);
    _targetFogColor.setHex(isOvercast ? 0x7c8da3 : 0xa9c3e2);
  }

  if (auraTier === 'S' || auraTier === 'S+') {
    _targetAuraColor.setHex(0xf4d27a);
  } else if (auraTier === 'A' || auraTier === 'A+') {
    _targetAuraColor.setHex(0xd8e6fb);
  } else if (auraTier === 'B' || auraTier === 'B+') {
    _targetAuraColor.setHex(0xf5efe4);
  } else {
    _targetAuraColor.setHex(0xffffff);
  }
}

/**
 * Hybrid 3D Spatial Lighting, Ground Contact, Tiered Aura & Volumetric Weather Stage Layer
 * Mounted transparently (`alpha: true`, `pointer-events: none`) inside `Studio2DFittingViewer`
 * so the photorealistic 2D RGBA VTON character gains authentic 3D perspective floor grounding,
 * angle-coupled camera parallax, indoor 3000K cove vs outdoor time-of-day lighting, and 3D weather.
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
}: StudioThreeStageLayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({
    isOutdoor,
    weatherMode,
    timeOfDay,
    auraTier,
    theme,
    angleScrollDeg,
    paused,
    hasCharacter,
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
      ? null
      : createStudioEnvironmentTexture(renderer, false);
    if (envTexture) {
      scene.environment = envTexture;
    }
    if (!isSoftwareGl) {
      scene.fog = new THREE.FogExp2(0x1f2430, 0.045);
    }

    const initW = Math.max(1, container.clientWidth || 360);
    const initH = Math.max(1, container.clientHeight || 480);
    renderer.setSize(initW, initH, false);

    const camera = new THREE.PerspectiveCamera(38, initW / initH, 0.1, 32);
    camera.position.set(0, 1.42, 4.55);
    camera.lookAt(0, 1.02, 0);

    // 3-Point Warm/Cool Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xfbe8cb, 0x4a4239, 0.85);
    hemiLight.position.set(0, 6, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d8, 1.45);
    keyLight.position.set(2.4, 4.6, 2.8);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xf4d27a, 0.9, 9, 2);
    rimLight.position.set(0, 2.25, -1.25);
    scene.add(rimLight);

    // Composite Ground & Architectural Podium Group (grounded at y = 0, disjoint Y offsets >= 0.02)
    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    const stoneBumpTex = isSoftwareGl ? null : createStoneMicroReliefTexture(renderer);
    const shadowDarkTex = createRadialContactShadowTexture(renderer, true);
    const shadowLightTex = createRadialContactShadowTexture(renderer, false);
    const auraGlowTex = createRadialAuraGlowTexture(renderer);

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

    // Part 2: Grounded Character Contact Shadow Disc (y = 0.022) — compact human foot span
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
    contactDisc.position.set(0, 0.022, 0.08);
    contactDisc.scale.set(1.0, 1.0, 0.56);
    contactDisc.renderOrder = 2;
    stageGroup.add(contactDisc);

    // Part 3: Recessed Architectural Podium Trim Ring (y = 0.044, indoor salon stages only)
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
    trimRing.position.set(0, 0.044, 0.04);
    trimRing.scale.set(1, 1, 0.58);
    trimRing.renderOrder = 3;
    stageGroup.add(trimRing);

    // Part 4: Tiered Volumetric Floor & Backlight Aura Planes (y = 0.066 & z = -0.55)
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
    floorAuraMesh.position.set(0, 0.066, 0.02);
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

    // Part 6: Wet Floor Raindrop Ripple Rings `InstancedMesh` (outdoor rain only)
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

      const isDark = p.theme === 'dark';
      contactMat.map = isDark ? shadowDarkTex : shadowLightTex;
      contactDisc.visible = Boolean(p.hasCharacter);

      resolveStageLightingPalette({
        isOutdoor: p.isOutdoor,
        timeOfDay: p.timeOfDay,
        weatherMode: p.weatherMode,
        auraTier: p.auraTier,
        isDark,
      });

      const blend = isSoftwareGl ? 1 : 1 - Math.exp(-6.5 * dt);
      keyLight.color.lerp(_targetKeyColor, blend);
      hemiLight.color.lerp(_targetSkyColor, blend);
      hemiLight.groundColor.lerp(_targetGroundColor, blend);
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.lerp(_targetFogColor, blend);
        scene.fog.density = p.isOutdoor
          ? p.weatherMode === 'rain' || p.weatherMode === 'snow'
            ? 0.068
            : 0.036
          : 0.022;
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

      // Wet vs dry floor surface calibration
      const isOutdoorRain = p.isOutdoor && p.weatherMode === 'rain';
      const isOutdoorSnow = p.isOutdoor && p.weatherMode === 'snow';
      const isOutdoorWind =
        p.isOutdoor && (p.weatherMode === 'wind' || p.weatherMode === 'coldwave');

      if (floorMat instanceof THREE.MeshStandardMaterial) {
        floorMat.roughness = isOutdoorRain ? 0.16 : isOutdoorSnow ? 0.84 : 0.72;
        floorMat.metalness = isOutdoorRain ? 0.52 : 0.14;
      }
      // On dry outdoor courtyards, hide floorDisc so real stone/cobblestone paving stays 100% crisp at human scale
      floorDisc.visible = !p.isOutdoor || isOutdoorRain || isOutdoorSnow;
      floorMat.opacity = isOutdoorRain
        ? 0.28
        : isOutdoorSnow
          ? 0.22
          : isDark
            ? 0.16
            : 0.12;
      floorMat.color.copy(p.isOutdoor ? _targetSkyColor : _targetKeyColor);

      // Tiered 3D Aura calibration (C = none, B/B+ = subtle rim, A/A+ = platinum, S/S+ = luxury gold)
      // Hide artificial showroom trimRing on outdoor courtyards so real stone ground scale is never miniaturized.
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
        rimLight.intensity = 0.28;
      } else if (isTierB) {
        floorAuraMesh.visible = !p.isOutdoor;
        backAuraMesh.visible = true;
        trimRing.visible = !p.isOutdoor;
        floorAuraMat.opacity = isDark ? 0.12 : 0.16;
        backAuraMat.opacity = isDark ? 0.1 : 0.14;
        trimMat.opacity = 0.2;
        rimLight.intensity = 0.62;
      } else if (isTierA) {
        floorAuraMesh.visible = !p.isOutdoor;
        backAuraMesh.visible = true;
        trimRing.visible = !p.isOutdoor;
        floorAuraMat.opacity = isDark ? 0.2 : 0.26;
        backAuraMat.opacity = isDark ? 0.2 : 0.26;
        trimMat.opacity = 0.34;
        rimLight.intensity = 1.05;
      } else {
        // S / S+ luxury gold volumetric stage aura
        const shimmerWave = 0.92 + Math.sin(nowSec * 1.9) * 0.08;
        floorAuraMesh.visible = !p.isOutdoor;
        backAuraMesh.visible = true;
        trimRing.visible = !p.isOutdoor;
        floorAuraMat.opacity = (isDark ? 0.28 : 0.34) * shimmerWave;
        backAuraMat.opacity = (isDark ? 0.3 : 0.36) * shimmerWave;
        trimMat.opacity = 0.48;
        rimLight.intensity = 1.38 * shimmerWave;
      }

      // 3D Weather Precipitation (strictly outdoor + tiers only!)
      const showPrecip = p.isOutdoor && (isOutdoorRain || isOutdoorSnow || isOutdoorWind);
      precipMesh.visible = showPrecip;
      if (showPrecip) {
        if (isOutdoorRain) {
          precipMat.color.setHex(0xd6e8ff);
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
            const windX = s.x - ((4.2 - fallY) * 0.14);
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
            // Crisp outdoor wind streaks
            const sweepX = (((s.x + 3.0 + nowSec * 3.4 * s.speed) % 6.0) - 3.0);
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

      // Wet floor ripples (outdoor rain only)
      rippleMesh.visible = isOutdoorRain;
      if (isOutdoorRain) {
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
      const showMotes = isTierS || isTierA;
      moteMesh.visible = showMotes;
      if (showMotes) {
        const activeCount = isTierS ? MOTE_COUNT : 18;
        moteMat.color.copy(_targetAuraColor);
        if (moteMat instanceof THREE.MeshStandardMaterial) {
          moteMat.emissive.copy(_targetAuraColor);
        }
        moteMat.opacity = isTierS ? 0.78 : 0.46;
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
  ]);

  return (
    <div
      className={`studio-three-stage-layer ${paused ? 'is-paused' : ''}`.trim()}
      data-testid="studio-three-stage-layer"
      data-stage-outdoor={isOutdoor ? 'true' : 'false'}
      data-aura-tier={auraTier}
      data-weather-mode={isOutdoor ? weatherMode : 'indoor-ivory'}
      data-software-gl={isSoftwareGlAttr ? 'true' : 'false'}
      aria-hidden="true"
    >
      <div ref={mountRef} className="studio-three-stage-mount" />
    </div>
  );
}
