import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {
  type StageTierCode,
  createRadialAuraGlowTexture,
  createRadialContactShadowTexture,
  createStagePreviewCardTexture,
  createStoneMicroReliefTexture,
  createStudioEnvironmentTexture,
  detectSoftwareWebGlFromContext,
  disposeObject3DTree,
  peekCachedSoftwareWebGl,
  scheduleAfterSoftwareDraw,
} from './threeRuntimeCapabilities.ts';

export type GachaThreePhase = 'idle' | 'spinning' | 'revealed';

export interface StoreThreeGachaStageProps {
  phase: GachaThreePhase;
  activeTier: StageTierCode;
  isOutdoor?: boolean;
  theme?: 'light' | 'dark' | string;
}

const SPARK_COUNT = 42;

// Pre-allocated scratch helpers outside animation loop (zero per-frame GC)
const _sparkDummy = new THREE.Object3D();
const _tierColor = new THREE.Color();
const _metalColor = new THREE.Color();
const _sparkTint = new THREE.Color();

let rectAreaUniformsInitialized = false;

interface SparkSeed {
  orbitR: number;
  baseY: number;
  theta: number;
  speed: number;
  scaleJitter: number;
}

function buildSparkSeeds(): SparkSeed[] {
  const arr: SparkSeed[] = [];
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const frac = i / SPARK_COUNT;
    arr.push({
      orbitR: 0.72 + (i % 6) * 0.14,
      baseY: 0.56 + frac * 1.48,
      theta: frac * Math.PI * 8.0,
      speed: 0.85 + (i % 5) * 0.24,
      scaleJitter: 0.85 + (i % 4) * 0.1,
    });
  }
  return arr;
}

function resolveTierColors(tier: StageTierCode) {
  if (tier === 'S') {
    _tierColor.setHex(0xf5d06b);
    _metalColor.setHex(0xe5bf62);
  } else if (tier === 'A') {
    _tierColor.setHex(0xd9e7fb);
    _metalColor.setHex(0xcbd7e8);
  } else if (tier === 'B') {
    _tierColor.setHex(0x9ec5fb);
    _metalColor.setHex(0xb8c5d6);
  } else {
    _tierColor.setHex(0xe4e0d8);
    _metalColor.setHex(0xc8c3ba);
  }
}

function buildRoundedFrameExtrudeGeometry(): THREE.ExtrudeGeometry {
  const outerW = 0.74;
  const outerH = 0.98;
  const r = 0.08;
  const hw = outerW * 0.5;
  const hh = outerH * 0.5;

  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  // Inner cutout window
  const border = 0.068;
  const iw = hw - border;
  const ih = hh - border;
  const hole = new THREE.Path();
  hole.moveTo(-iw, -ih);
  hole.lineTo(iw, -ih);
  hole.lineTo(iw, ih);
  hole.lineTo(-iw, ih);
  hole.closePath();
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: 1,
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.018,
    bevelSize: 0.016,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

/**
 * Luxury 3D Atelier Showcase Capsule / Objet Gacha Stage (`StoreThreeGachaStage`)
 * Assembled as a 9-part composite `THREE.Group` grounded at `y = 0`:
 *  1) Radial contact shadow disc (`y = 0.002`)
 *  2) Stepped honed-stone plinth (`LatheGeometry`, `roughness: 0.78`)
 *  3) Lower plinth brushed-brass collar (`TorusGeometry`, `roughness: 0.22`)
 *  4) Upper stage deck inlay bezel (`CylinderGeometry`, `roughness: 0.20`)
 *  5) Miniature beveled architectural stage frame (`ExtrudeGeometry`, `roughness: 0.46`) + preview card
 *  6) Dual anisotropic orbital gimbal rings (`TorusGeometry`, `anisotropy: 0.8`, `roughness: 0.15`)
 *  7) Optical crystal showcase cloche dome (`LatheGeometry`, `MeshPhysicalMaterial` transmission/clearcoat)
 *  8) Crown finial cap & collar (`LatheGeometry` + `SphereGeometry`)
 *  9) `InstancedMesh` prism/gold celebration particles (`count = 42`)
 */
export default function StoreThreeGachaStage({
  phase,
  activeTier,
  isOutdoor = false,
  theme = 'dark',
}: StoreThreeGachaStageProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({ phase, activeTier, isOutdoor, theme });
  propsRef.current = { phase, activeTier, isOutdoor, theme };

  const wakeRenderRef = useRef<(() => void) | null>(null);
  const updatePreviewCardRef = useRef<((tier: StageTierCode, outdoor: boolean) => void) | null>(
    null
  );
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
      renderer.toneMappingExposure = 1.14;
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const canvas = renderer.domElement;
      canvas.className = 'store-three-gacha-canvas';
      container.replaceChildren(canvas);

    const scene = new THREE.Scene();
    const envTexture = isSoftwareGl
      ? null
      : createStudioEnvironmentTexture(renderer, false);
    if (envTexture) {
      scene.environment = envTexture;
    }
    if (!isSoftwareGl) {
      scene.fog = new THREE.FogExp2(0x16171b, 0.048);
    }

    const initW = Math.max(1, container.clientWidth || 340);
    const initH = Math.max(1, container.clientHeight || 196);
    renderer.setSize(initW, initH, false);

    const camera = new THREE.PerspectiveCamera(34, initW / initH, 0.1, 24);
    camera.position.set(0, 1.38, 4.18);
    camera.lookAt(0, 1.02, 0);

    // 3-Point Warm/Cool Studio Showcase Lighting + Softbox on GPU
    const hemiLight = new THREE.HemisphereLight(0xdce8fa, 0x2b2622, 0.82);
    hemiLight.position.set(0, 5, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff3de, 1.65);
    keyLight.position.set(2.6, 4.2, 3.2);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      const d = 2.2;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 12;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const coreAccentLight = new THREE.PointLight(0xf5d06b, 1.4, 6.5, 2);
    coreAccentLight.position.set(0, 1.12, 0.45);
    scene.add(coreAccentLight);

    const rimBackLight = new THREE.DirectionalLight(0xcfe0ff, 0.9);
    rimBackLight.position.set(-2.2, 2.8, -2.6);
    scene.add(rimBackLight);

    if (!isSoftwareGl) {
      if (!rectAreaUniformsInitialized) {
        RectAreaLightUniformsLib.init();
        rectAreaUniformsInitialized = true;
      }
      const softbox = new THREE.RectAreaLight(0xfff8ee, 3.2, 1.8, 2.4);
      softbox.position.set(-1.9, 2.1, 2.2);
      softbox.lookAt(0, 1.1, 0);
      scene.add(softbox);
    }

    // Root Atelier Capsule Group grounded at y = 0
    const capsuleRoot = new THREE.Group();
    scene.add(capsuleRoot);

    const stoneBumpTex = isSoftwareGl ? null : createStoneMicroReliefTexture(renderer);
    const contactShadowDark = createRadialContactShadowTexture(renderer, true);
    const contactShadowLight = createRadialContactShadowTexture(renderer, false);
    const haloGlowTex = createRadialAuraGlowTexture(renderer);

    // 1. Contact Shadow Disc (y = 0.002)
    const contactGeo = new THREE.CircleGeometry(1.28, 36);
    contactGeo.rotateX(-Math.PI / 2);
    const contactMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: propsRef.current.theme === 'light' ? contactShadowLight : contactShadowDark,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
    });
    const contactDisc = new THREE.Mesh(contactGeo, contactMat);
    contactDisc.position.y = 0.002;
    contactDisc.scale.set(1, 1, 0.78);
    contactDisc.renderOrder = 1;
    capsuleRoot.add(contactDisc);

    // 2. Primary Silhouette: Stepped Honed-Stone Plinth (`LatheGeometry`, y = 0 .. 0.42, roughness 0.78)
    const plinthProfile = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.88, 0),
      new THREE.Vector2(0.86, 0.11),
      new THREE.Vector2(0.76, 0.14),
      new THREE.Vector2(0.73, 0.34),
      new THREE.Vector2(0.66, 0.42),
      new THREE.Vector2(0, 0.42),
    ];
    const plinthGeo = new THREE.LatheGeometry(plinthProfile, 40);
    const plinthMat: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial = isSoftwareGl
      ? new THREE.MeshLambertMaterial({ color: 0x2a2826 })
      : new THREE.MeshStandardMaterial({
          color: 0x2a2826,
          roughness: 0.78,
          metalness: 0.08,
          bumpMap: stoneBumpTex,
          bumpScale: 0.018,
        });
    const plinthMesh = new THREE.Mesh(plinthGeo, plinthMat);
    plinthMesh.castShadow = !isSoftwareGl;
    plinthMesh.receiveShadow = !isSoftwareGl;
    capsuleRoot.add(plinthMesh);

    // 3. Accent Detail: Lower Plinth Brushed-Metal Collar (`TorusGeometry`, roughness 0.16..0.22)
    const brushedMetalMat: THREE.MeshStandardMaterial | THREE.MeshPhongMaterial = isSoftwareGl
      ? new THREE.MeshPhongMaterial({
          color: 0xe5bf62,
          specular: 0xfff3d1,
          shininess: 85,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xe5bf62,
          metalness: 0.94,
          roughness: 0.16,
          anisotropy: 0.8,
          clearcoat: 0.35,
          clearcoatRoughness: 0.18,
        });

    const collarGeo = new THREE.TorusGeometry(0.765, 0.018, 12, 48);
    collarGeo.rotateX(Math.PI / 2);
    const collarMesh = new THREE.Mesh(collarGeo, brushedMetalMat);
    collarMesh.position.y = 0.135;
    capsuleRoot.add(collarMesh);

    // 4. Accent Detail: Upper Stage Deck Inlay Bezel (`CylinderGeometry`, y = 0.435)
    const deckBezelGeo = new THREE.CylinderGeometry(0.64, 0.66, 0.036, 40);
    const deckBezelMesh = new THREE.Mesh(deckBezelGeo, brushedMetalMat);
    deckBezelMesh.position.y = 0.438;
    capsuleRoot.add(deckBezelMesh);

    // Volumetric Halo Backplate behind Capsule
    const backHaloGeo = new THREE.PlaneGeometry(2.45, 2.45);
    const backHaloMat = new THREE.MeshBasicMaterial({
      color: 0xf5d06b,
      map: haloGlowTex,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const backHaloMesh = new THREE.Mesh(backHaloGeo, backHaloMat);
    backHaloMesh.position.set(0, 1.18, -0.78);
    backHaloMesh.renderOrder = 2;
    capsuleRoot.add(backHaloMesh);

    // 5. Secondary Read: Inner Miniature Beveled Architectural Stage Frame (`ExtrudeGeometry`, roughness 0.46)
    const innerStagePivot = new THREE.Group();
    innerStagePivot.position.set(0, 1.08, 0);
    capsuleRoot.add(innerStagePivot);

    const frameGeo = buildRoundedFrameExtrudeGeometry();
    const frameMat: THREE.MeshStandardMaterial | THREE.MeshPhongMaterial = isSoftwareGl
      ? new THREE.MeshPhongMaterial({
          color: 0xd9d4cb,
          specular: 0xfefcf8,
          shininess: 48,
        })
      : new THREE.MeshStandardMaterial({
          color: 0xd9d4cb,
          roughness: 0.46,
          metalness: 0.68,
        });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.castShadow = !isSoftwareGl;
    innerStagePivot.add(frameMesh);

    let activeCardTex = createStagePreviewCardTexture(renderer, {
      tier: propsRef.current.activeTier,
      isOutdoor: propsRef.current.isOutdoor,
    });
    const cardGeo = new THREE.PlaneGeometry(0.61, 0.85);
    const cardMat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial = isSoftwareGl
      ? new THREE.MeshBasicMaterial({
          color: 0xffffff,
          map: activeCardTex,
          side: THREE.DoubleSide,
        })
      : new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: activeCardTex,
          roughness: 0.36,
          metalness: 0.12,
          side: THREE.DoubleSide,
        });
    const cardMesh = new THREE.Mesh(cardGeo, cardMat);
    cardMesh.position.z = 0.002;
    innerStagePivot.add(cardMesh);

    updatePreviewCardRef.current = (nextTier: StageTierCode, nextOutdoor: boolean) => {
      const nextTex = createStagePreviewCardTexture(renderer, {
        tier: nextTier,
        isOutdoor: nextOutdoor,
      });
      const prevTex = activeCardTex;
      activeCardTex = nextTex;
      cardMat.map = nextTex;
      cardMat.needsUpdate = true;
      prevTex.dispose();
    };

    // 6. Secondary Read: Dual Anisotropic Orbital Gimbal Rings
    const gimbalGroup = new THREE.Group();
    gimbalGroup.position.set(0, 1.08, 0);
    capsuleRoot.add(gimbalGroup);

    const outerGimbalGeo = new THREE.TorusGeometry(0.84, 0.016, 12, 56);
    const outerGimbal = new THREE.Mesh(outerGimbalGeo, brushedMetalMat);
    outerGimbal.rotation.set(0.32, 0.42, 0);
    gimbalGroup.add(outerGimbal);

    const innerGimbalGeo = new THREE.TorusGeometry(0.76, 0.013, 12, 52);
    const innerGimbal = new THREE.Mesh(innerGimbalGeo, brushedMetalMat);
    innerGimbal.rotation.set(-0.38, -0.5, Math.PI * 0.22);
    gimbalGroup.add(innerGimbal);

    // 7 & 8. Secondary Read + Accent Detail: Optical Crystal Showcase Cloche Dome + Crown Finial
    const clocheAssembly = new THREE.Group();
    capsuleRoot.add(clocheAssembly);

    const domePoints: THREE.Vector2[] = [
      new THREE.Vector2(0.62, 0.45),
      new THREE.Vector2(0.62, 1.24),
    ];
    const arcSteps = 14;
    for (let s = 1; s <= arcSteps; s += 1) {
      const t = (s / arcSteps) * (Math.PI * 0.5);
      domePoints.push(new THREE.Vector2(Math.cos(t) * 0.62, 1.24 + Math.sin(t) * 0.6));
    }
    const domeGeo = new THREE.LatheGeometry(domePoints, isSoftwareGl ? 24 : 40);
    const domeMat: THREE.MeshStandardMaterial | THREE.MeshPhongMaterial = isSoftwareGl
      ? new THREE.MeshPhongMaterial({
          color: 0xf4f9ff,
          specular: 0xffffff,
          shininess: 96,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xf8fbff,
          metalness: 0,
          roughness: 0.06,
          transmission: 0.92,
          transparent: true,
          opacity: 1,
          ior: 1.54,
          thickness: 1.15,
          attenuationColor: new THREE.Color(0xeef6ff),
          attenuationDistance: 2.2,
          clearcoat: 1.0,
          clearcoatRoughness: 0.06,
          depthWrite: false,
        });
    const domeMesh = new THREE.Mesh(domeGeo, domeMat);
    domeMesh.renderOrder = 8;
    clocheAssembly.add(domeMesh);

    const finialCollarGeo = new THREE.CylinderGeometry(0.085, 0.115, 0.05, 24);
    const finialCollar = new THREE.Mesh(finialCollarGeo, brushedMetalMat);
    finialCollar.position.y = 1.86;
    clocheAssembly.add(finialCollar);

    const finialOrbGeo = new THREE.SphereGeometry(0.068, 20, 16);
    const finialOrb = new THREE.Mesh(finialOrbGeo, brushedMetalMat);
    finialOrb.position.y = 1.945;
    clocheAssembly.add(finialOrb);

    // 9. Tiered Celebration Prism / Gold Particles (`InstancedMesh`)
    const sparkSeeds = buildSparkSeeds();
    const sparkGeo = new THREE.OctahedronGeometry(0.026, 0);
    const sparkMat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial = isSoftwareGl
      ? new THREE.MeshBasicMaterial({
          color: 0xfff3c4,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
        })
      : new THREE.MeshStandardMaterial({
          color: 0xfff3c4,
          emissive: 0xf5d06b,
          emissiveIntensity: 0.85,
          roughness: 0.16,
          metalness: 0.88,
          transparent: true,
          opacity: 0.88,
          depthWrite: false,
        });
    const sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, SPARK_COUNT);
    sparkMesh.frustumCulled = false;
    sparkMesh.renderOrder = 9;
    if (!isSoftwareGl) {
      for (let i = 0; i < SPARK_COUNT; i += 1) {
        const shift = (i % 5) * 0.03;
        _sparkTint.setRGB(1, 0.95 - shift, 0.84 - shift);
        sparkMesh.setColorAt(i, _sparkTint);
      }
      if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;
    }
    capsuleRoot.add(sparkMesh);

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

    let domeLiftY = 0;
    let camZ = 4.18;
    let spinSpeed = 0.35;
    let stageSpinAngle = 0.24;
    let revealAgeSec = 0;
    let prevPhase: GachaThreePhase = propsRef.current.phase;
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

    const advanceScene = (nowSec: number): boolean => {
      const dt = Math.min(0.08, Math.max(0.001, nowSec - lastTimeSec));
      lastTimeSec = nowSec;
      const p = propsRef.current;

      if (p.phase !== prevPhase) {
        if (p.phase === 'revealed') {
          revealAgeSec = 0;
        }
        prevPhase = p.phase;
      }
      if (p.phase === 'revealed') {
        revealAgeSec += dt;
      }

      const isLightTheme = p.theme === 'light';
      contactMat.map = isLightTheme ? contactShadowLight : contactShadowDark;
      plinthMat.color.setHex(isLightTheme ? 0xdedad2 : 0x262422);

      resolveTierColors(p.activeTier);
      const colorLerp = isSoftwareGl ? 1 : 1 - Math.exp(-8 * dt);
      coreAccentLight.color.lerp(_tierColor, colorLerp);
      backHaloMat.color.lerp(_tierColor, colorLerp);
      brushedMetalMat.color.lerp(_metalColor, colorLerp);
      sparkMat.color.lerp(_tierColor, colorLerp);
      if (sparkMat instanceof THREE.MeshStandardMaterial) {
        sparkMat.emissive.lerp(_tierColor, colorLerp);
      }

      const targetDomeLift = p.phase === 'revealed' ? 0.56 : p.phase === 'spinning' ? 0.06 : 0;
      const targetCamZ = p.phase === 'spinning' ? 3.86 : p.phase === 'revealed' ? 3.96 : 4.18;
      const targetSpinSpeed = p.phase === 'spinning' ? 6.4 : p.phase === 'revealed' ? 0.85 : 0.28;

      if (isSoftwareGl && p.phase !== 'spinning') {
        domeLiftY = targetDomeLift;
        camZ = targetCamZ;
        spinSpeed = targetSpinSpeed;
      } else {
        domeLiftY = THREE.MathUtils.damp(domeLiftY, targetDomeLift, 6.2, dt);
        camZ = THREE.MathUtils.damp(camZ, targetCamZ, 5.5, dt);
        spinSpeed = THREE.MathUtils.damp(spinSpeed, targetSpinSpeed, 5.0, dt);
      }

      clocheAssembly.position.y = domeLiftY;
      camera.position.z = camZ;
      camera.lookAt(0, 1.06 + domeLiftY * 0.18, 0);

      if (p.phase === 'revealed') {
        // Settle miniature stage facing forward (`0` yaw) so user sees the revealed architectural frame crisply
        stageSpinAngle = isSoftwareGl
          ? 0.14
          : THREE.MathUtils.damp(stageSpinAngle % (Math.PI * 2), 0.14, 5.8, dt);
      } else if (p.phase === 'spinning' || !isSoftwareGl) {
        stageSpinAngle += dt * spinSpeed;
      }
      innerStagePivot.rotation.y = stageSpinAngle;

      outerGimbal.rotation.y += dt * (p.phase === 'spinning' ? 5.2 : 0.42);
      outerGimbal.rotation.x = 0.32 + Math.sin(nowSec * 1.3) * 0.14;
      innerGimbal.rotation.y -= dt * (p.phase === 'spinning' ? 6.8 : 0.55);
      innerGimbal.rotation.z = Math.PI * 0.22 + Math.cos(nowSec * 1.1) * 0.12;

      const tierIntensityBoost =
        p.activeTier === 'S' ? 1.55 : p.activeTier === 'A' ? 1.25 : p.activeTier === 'B' ? 1.0 : 0.78;
      coreAccentLight.intensity =
        (p.phase === 'revealed' ? 2.1 : p.phase === 'spinning' ? 1.7 : 1.1) * tierIntensityBoost;
      backHaloMat.opacity =
        (p.phase === 'revealed' ? 0.46 : p.phase === 'spinning' ? 0.34 : 0.18) *
        (p.activeTier === 'S' ? 1.15 : 0.9);

      // Update celebration sparks
      const activeSparks =
        p.phase === 'idle'
          ? p.activeTier === 'S'
            ? 14
            : 8
          : p.activeTier === 'S'
            ? SPARK_COUNT
            : p.activeTier === 'A'
              ? 30
              : p.activeTier === 'B'
                ? 20
                : 12;

      for (let i = 0; i < SPARK_COUNT; i += 1) {
        if (i >= activeSparks) {
          _sparkDummy.scale.set(0, 0, 0);
          _sparkDummy.updateMatrix();
          sparkMesh.setMatrixAt(i, _sparkDummy.matrix);
          continue;
        }
        const s = sparkSeeds[i];
        const ang = s.theta + nowSec * s.speed * (p.phase === 'spinning' ? 2.6 : 0.85);
        const expand = p.phase === 'revealed' ? 1 + Math.min(0.32, revealAgeSec * 0.28) : 1;
        const rx = Math.cos(ang) * s.orbitR * expand;
        const rz = Math.sin(ang) * s.orbitR * expand;
        const ry = s.baseY + Math.sin(nowSec * 1.8 + s.theta) * 0.12 + domeLiftY * 0.25;
        _sparkDummy.position.set(rx, ry, rz);
        _sparkDummy.rotation.set(nowSec + i, ang, 0);
        _sparkDummy.scale.setScalar(s.scaleJitter * (p.phase === 'revealed' ? 1.18 : 0.88));
        _sparkDummy.updateMatrix();
        sparkMesh.setMatrixAt(i, _sparkDummy.matrix);
      }
      sparkMesh.instanceMatrix.needsUpdate = true;

      if (isSoftwareGl) {
        return p.phase === 'spinning';
      }
      return true;
    };

    const tickLoop = () => {
      if (disposed || contextLost) {
        loopRunning = false;
        return;
      }
      const keepGoing = advanceScene(performance.now() * 0.001);
      renderer.render(scene, camera);

      if (!keepGoing) {
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
      if (disposed || contextLost) return;
      if (loopRunning) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (disposed || contextLost) {
          renderBusy = false;
          return;
        }
        renderDirty = false;
        const shouldLoop = advanceScene(performance.now() * 0.001);
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (disposed || contextLost) return;
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
          scheduleAfterSoftwareDraw(renderer, done, swTimerRef);
        } else {
          done();
        }
      });
    };

    wakeRenderRef.current = requestRender;

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

    requestRender();

      cleanupStage = () => {
        disposed = true;
        wakeRenderRef.current = null;
        updatePreviewCardRef.current = null;
        cancelScheduledFrames();
        resizeObserver?.disconnect();
        canvas.removeEventListener('webglcontextlost', onContextLost, false);
        canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
        scene.environment = null;
        envTexture?.dispose();
        contactShadowDark.dispose();
        contactShadowLight.dispose();
        activeCardTex.dispose();
        disposeObject3DTree(scene);
        renderer.dispose();
        container.replaceChildren();
      };
    };

    bootRafId = requestAnimationFrame(() => {
      if (unmounted) return;
      bootTimerId = window.setTimeout(bootStage, 24);
    });

    return () => {
      unmounted = true;
      if (bootRafId) cancelAnimationFrame(bootRafId);
      if (bootTimerId) clearTimeout(bootTimerId);
      cleanupStage?.();
    };
  }, []);

  useEffect(() => {
    updatePreviewCardRef.current?.(activeTier, Boolean(isOutdoor));
    wakeRenderRef.current?.();
  }, [activeTier, isOutdoor]);

  useEffect(() => {
    wakeRenderRef.current?.();
  }, [phase, theme]);

  return (
    <div
      className={`store-three-gacha-stage is-phase-${phase} is-tier-${activeTier.toLowerCase()}`}
      data-testid="store-three-gacha-stage"
      data-gacha-phase={phase}
      data-gacha-tier={activeTier}
      data-software-gl={isSoftwareGlAttr ? 'true' : 'false'}
      aria-hidden="true"
    >
      <div ref={mountRef} className="store-three-gacha-mount" />
    </div>
  );
}
