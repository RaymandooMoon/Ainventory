import { memo, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import {
  buildParametricAvatarGroup,
  disposeThreeObjectTree,
  sanitizeBodySpec,
} from '../services/parametricAvatar3D.ts';
import { computeSkinShadingPalette } from '../services/skinToneAnalyzer.ts';

export const CAMERA_VIEW_PRESETS = {
  front: { key: 'front', labelKo: '앞', azimuth: 0, polar: 1.48, distance: 3.12, targetYRatio: 0.89 },
  back: {
    key: 'back',
    labelKo: '뒤',
    azimuth: Math.PI,
    polar: 1.48,
    distance: 3.12,
    targetYRatio: 0.89,
  },
  left: {
    key: 'left',
    labelKo: '좌',
    azimuth: -Math.PI / 2,
    polar: 1.48,
    distance: 3.12,
    targetYRatio: 0.89,
  },
  right: {
    key: 'right',
    labelKo: '우',
    azimuth: Math.PI / 2,
    polar: 1.48,
    distance: 3.12,
    targetYRatio: 0.89,
  },
  top: { key: 'top', labelKo: '상', azimuth: 0, polar: 0.28, distance: 2.82, targetYRatio: 0.9 },
  bottom: {
    key: 'bottom',
    labelKo: '하',
    azimuth: 0,
    polar: 2.46,
    distance: 3.28,
    targetYRatio: 0.7,
  },
};

function createFloorShadowTexture() {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.34)');
  grad.addColorStop(0.48, 'rgba(15, 23, 42, 0.14)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function shortestAngleDelta(fromRad, toRad) {
  const twoPi = Math.PI * 2;
  const diff = ((toRad - fromRad) % twoPi + twoPi) % twoPi;
  return diff > Math.PI ? diff - twoPi : diff;
}

/**
 * Interactive 360° Parametric 3D Character & Garment Viewport
 * - Reflects human anthropometric body shape (`heightCm`, `weightKg`, `bodyShape`, shoulder/waist/hip)
 * - Supports full game-character camera orbit (`앞`, `뒤`, `좌`, `우`, `상`, `하` + drag & pinch/wheel zoom)
 * - Zero external `.glb` / `.wasm` / `.task` downloads (100% procedural parametric geometry)
 */
const Character25DMannequin = memo(function Character25DMannequin({
  skinToneHex = '#DFBA9B',
  personalColor = 'autumn_warm',
  gender = 'male',
  bodySpec = null,
  slots = null,
  cameraPreset = 'front',
  presetNonce = 0,
  onUserOrbit,
  theme = 'light',
  compact = false,
}) {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const effectiveGender =
    bodySpec?.gender === 'female' || (!bodySpec && gender === 'female') ? 'female' : 'male';

  const resolvedBodySpec = useMemo(
    () =>
      sanitizeBodySpec({
        ...(bodySpec || {}),
        gender: effectiveGender,
      }),
    [bodySpec, effectiveGender]
  );

  const resolvedSlots = useMemo(
    () => ({
      outer: slots?.outer || null,
      top: slots?.top || null,
      bottom: slots?.bottom || null,
      shoes: slots?.shoes || null,
      accessory: slots?.accessory || null,
    }),
    [slots?.outer, slots?.top, slots?.bottom, slots?.shoes, slots?.accessory]
  );

  const palette = useMemo(
    () => computeSkinShadingPalette(skinToneHex, personalColor, theme),
    [skinToneHex, personalColor, theme]
  );

  const statureScale = useMemo(() => {
    const raw = resolvedBodySpec.heightCm / 175;
    return Math.max(0.84, Math.min(1.14, raw));
  }, [resolvedBodySpec.heightCm]);

  // 1. Initialize Three.js WebGL Studio Viewport once per mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return undefined;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const canvas = renderer.domElement;
    canvas.className = 'character-25d-render-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `360도 캐릭터 모델 (${palette.base})`);
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(compact ? 34 : 36, 0.75, 0.1, 25);
    scene.add(camera);

    // Balanced studio hemisphere + camera-tracked 3-point lighting so Front/Back/Sides/Top/Bottom are all cleanly lit
    const hemiLight = new THREE.HemisphereLight('#FFFFFF', '#CBD5E1', 0.92);
    hemiLight.position.set(0, 3.2, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight('#FFFBF5', 1.35);
    keyLight.position.set(1.5, 1.7, 2.5);
    camera.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#EEF4FF', 0.58);
    fillLight.position.set(-1.8, 0.3, 1.8);
    camera.add(fillLight);

    const rimLight = new THREE.DirectionalLight('#FFFFFF', 0.42);
    rimLight.position.set(0, 1.4, -2.4);
    camera.add(rimLight);

    // Grounded turntable contact shadow (FrontSide so Bottom `하` view looks seamlessly through from underneath)
    const floorGroup = new THREE.Group();
    const shadowTex = createFloorShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.001;
    floorGroup.add(shadowPlane);

    const ringGeo = new THREE.RingGeometry(0.43, 0.448, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: theme === 'dark' ? '#94A3B8' : '#64748B',
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.002;
    floorGroup.add(ringMesh);
    scene.add(floorGroup);

    const avatarAnchor = new THREE.Group();
    scene.add(avatarAnchor);

    const initialPreset = CAMERA_VIEW_PRESETS[cameraPreset] || CAMERA_VIEW_PRESETS.front;
    const initDist = compact ? 3.04 : initialPreset.distance;

    const state = {
      renderer,
      scene,
      camera,
      ringMat,
      rimLight,
      avatarAnchor,
      currentAvatar: null,
      rafId: 0,
      isAnimating: false,
      curAzimuth: initialPreset.azimuth,
      curPolar: initialPreset.polar,
      curDistance: initDist,
      curTargetY: initialPreset.targetYRatio,
      tgtAzimuth: initialPreset.azimuth,
      tgtPolar: initialPreset.polar,
      tgtDistance: initDist,
      tgtTargetY: initialPreset.targetYRatio,
      pointers: new Map(),
      lastPinchDist: 0,
      disposed: false,
    };

    const syncSize = () => {
      if (state.disposed) return;
      const rect = container.getBoundingClientRect();
      const w = Math.max(120, Math.round(rect.width || (compact ? 156 : 380)));
      const h = Math.max(160, Math.round(rect.height || (compact ? 206 : 500)));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const renderFrame = () => {
      if (state.disposed) return;
      const dAz = shortestAngleDelta(state.curAzimuth, state.tgtAzimuth);
      const dPol = state.tgtPolar - state.curPolar;
      const dDist = state.tgtDistance - state.curDistance;
      const dTy = state.tgtTargetY - state.curTargetY;

      const moving =
        Math.abs(dAz) > 0.0005 ||
        Math.abs(dPol) > 0.0005 ||
        Math.abs(dDist) > 0.0005 ||
        Math.abs(dTy) > 0.0005;

      if (moving) {
        const ease = 0.22;
        state.curAzimuth += dAz * ease;
        state.curPolar += dPol * ease;
        state.curDistance += dDist * ease;
        state.curTargetY += dTy * ease;
      } else {
        state.curAzimuth = state.tgtAzimuth;
        state.curPolar = state.tgtPolar;
        state.curDistance = state.tgtDistance;
        state.curTargetY = state.tgtTargetY;
      }

      const sinPol = Math.sin(state.curPolar);
      const cosPol = Math.cos(state.curPolar);
      const cx = state.curDistance * sinPol * Math.sin(state.curAzimuth);
      const cy = state.curTargetY + state.curDistance * cosPol;
      const cz = state.curDistance * sinPol * Math.cos(state.curAzimuth);

      camera.position.set(cx, cy, cz);
      camera.lookAt(0, state.curTargetY, 0);
      renderer.render(scene, camera);

      if (moving) {
        state.rafId = window.requestAnimationFrame(renderFrame);
      } else {
        state.isAnimating = false;
      }
    };

    const wakeLoop = () => {
      if (state.disposed || state.isAnimating) return;
      state.isAnimating = true;
      state.rafId = window.requestAnimationFrame(renderFrame);
    };

    state.wakeLoop = wakeLoop;
    engineRef.current = state;

    syncSize();
    wakeLoop();

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        syncSize();
        wakeLoop();
      });
      resizeObserver.observe(container);
    }

    const handleWheel = (e) => {
      e.preventDefault();
      state.tgtDistance = Math.max(1.65, Math.min(4.1, state.tgtDistance + e.deltaY * 0.0018));
      wakeLoop();
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      state.disposed = true;
      if (state.rafId) window.cancelAnimationFrame(state.rafId);
      canvas.removeEventListener('wheel', handleWheel);
      resizeObserver?.disconnect();
      disposeThreeObjectTree(state.currentAvatar);
      shadowPlane.geometry.dispose();
      shadowMat.dispose();
      shadowTex?.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      renderer.dispose();
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
      engineRef.current = null;
    };
  }, [compact]);

  // 2. Rebuild Parametric 3D Body + Tailored 3D Garments on Spec / Skin / Outfit Change
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const nextGroup = buildParametricAvatarGroup({
      bodySpec: resolvedBodySpec,
      skinToneHex: palette.base,
      slots: compact
        ? { outer: null, top: null, bottom: null, shoes: null, accessory: null }
        : resolvedSlots,
      onAsyncTextureReady: () => {
        engine.wakeLoop?.();
      },
    });

    if (engine.currentAvatar) {
      engine.avatarAnchor.remove(engine.currentAvatar);
      disposeThreeObjectTree(engine.currentAvatar);
    }
    engine.currentAvatar = nextGroup;
    engine.avatarAnchor.add(nextGroup);

    const canvas = engine.renderer.domElement;
    canvas.setAttribute('aria-label', `360도 캐릭터 모델 (${palette.base})`);

    engine.ringMat.color.set(theme === 'dark' ? '#94A3B8' : '#64748B');
    engine.wakeLoop?.();
  }, [resolvedBodySpec, palette.base, resolvedSlots, compact, theme]);

  // 3. Apply 6-Direction Camera Presets (`앞`, `뒤`, `좌`, `우`, `상`, `하`) + Stature Framing
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const preset = CAMERA_VIEW_PRESETS[cameraPreset];
    if (!preset) {
      engine.tgtTargetY = 0.89 * statureScale;
      engine.wakeLoop?.();
      return;
    }

    const deltaAz = shortestAngleDelta(engine.curAzimuth, preset.azimuth);
    engine.tgtAzimuth = engine.curAzimuth + deltaAz;
    engine.tgtPolar = preset.polar;
    engine.tgtDistance = compact ? 3.04 : preset.distance * Math.max(0.94, statureScale);
    engine.tgtTargetY = preset.targetYRatio * statureScale;
    engine.wakeLoop?.();
  }, [cameraPreset, presetNonce, statureScale, compact]);

  // 4. Pointer / Touch Orbit (360° Horizontal + Overhead Top `상` to Low Bottom `하`) & Pinch Zoom
  const handlePointerDown = (e) => {
    const engine = engineRef.current;
    if (!engine) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    engine.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (engine.pointers.size === 2) {
      const pts = Array.from(engine.pointers.values());
      engine.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
    setIsDragging(true);
  };

  const handlePointerMove = (e) => {
    const engine = engineRef.current;
    if (!engine || !engine.pointers.has(e.pointerId)) return;

    const prev = engine.pointers.get(e.pointerId);
    engine.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (engine.pointers.size === 1 && prev) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        engine.tgtAzimuth -= dx * 0.0115;
        engine.tgtPolar = Math.max(0.16, Math.min(2.76, engine.tgtPolar - dy * 0.0095));
        onUserOrbit?.();
        engine.wakeLoop?.();
      }
    } else if (engine.pointers.size === 2) {
      const pts = Array.from(engine.pointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (engine.lastPinchDist > 0) {
        const delta = engine.lastPinchDist - dist;
        engine.tgtDistance = Math.max(1.65, Math.min(4.1, engine.tgtDistance + delta * 0.008));
        engine.wakeLoop?.();
      }
      engine.lastPinchDist = dist;
    }
  };

  const handlePointerEnd = (e) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.pointers.delete(e.pointerId);
    if (engine.pointers.size < 2) {
      engine.lastPinchDist = 0;
    }
    if (engine.pointers.size === 0) {
      setIsDragging(false);
    }
  };

  return (
    <div
      id={compact ? undefined : CARBON_DOM_CONTRACT.character25dMannequinId}
      ref={containerRef}
      className={`character-25d-mannequin ${compact ? 'is-compact' : ''} ${isDragging ? 'is-dragging' : ''}`}
      data-skin-hex={palette.base}
      data-personal-color={personalColor}
      data-character-gender={effectiveGender}
      data-body-shape={resolvedBodySpec.bodyShape}
      data-height-cm={resolvedBodySpec.heightCm}
      data-weight-kg={resolvedBodySpec.weightKg}
      data-camera-preset={cameraPreset}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {/* Subtle Personal Color Studio Drape Halo */}
      <div
        aria-hidden="true"
        className="character-25d-aura"
        style={{
          background: `radial-gradient(circle at 50% 28%, ${palette.auraColor} 0%, rgba(0,0,0,0) 64%)`,
        }}
      />

      {webglUnavailable && (
        <svg
          viewBox="0 0 120 200"
          className="character-25d-fallback-svg"
          aria-label={`캐릭터 모델 (${palette.base})`}
        >
          <circle cx="60" cy="30" r="16" fill={palette.base} />
          <rect x="38" y="50" width="44" height="68" rx="16" fill={palette.base} />
          <rect x="40" y="118" width="17" height="68" rx="8" fill={palette.base} />
          <rect x="63" y="118" width="17" height="68" rx="8" fill={palette.base} />
        </svg>
      )}
    </div>
  );
});

export default Character25DMannequin;
