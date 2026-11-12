import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import {
  mapStudioSlotsTo3DLoadout,
  sanitizeBodySpec,
} from '../services/parametricAvatar3D.ts';
import { computeSkinShadingPalette } from '../services/skinToneAnalyzer.ts';
import {
  Mannequin3DWebGLEngine,
  render3DMannequinScene,
} from '../utils/mannequin3DRenderer.js';

export const CAMERA_VIEW_PRESETS = {
  front: { key: 'front', labelKo: '앞', yawRad: 0, polarRad: 1.52, zoom: 0.98 },
  back: { key: 'back', labelKo: '뒤', yawRad: Math.PI, polarRad: 1.52, zoom: 0.98 },
  left: { key: 'left', labelKo: '좌', yawRad: -Math.PI / 2, polarRad: 1.52, zoom: 0.98 },
  right: { key: 'right', labelKo: '우', yawRad: Math.PI / 2, polarRad: 1.52, zoom: 0.98 },
  top: { key: 'top', labelKo: '상', yawRad: 0, polarRad: 0.28, zoom: 0.88 },
  bottom: { key: 'bottom', labelKo: '하', yawRad: 0, polarRad: 2.34, zoom: 0.92 },
};

/**
 * Interactive 360° CC0 MakeHuman Skinned 3D Character & Tailored Garment Viewport
 * - Creates a dedicated <canvas> per mount lifecycle so React 19 <StrictMode> (`npm run dev`)
 *   and Vite HMR hot reloads never reuse a lost WebGL context
 * - 13,380-vertex anatomical MakeHuman body + 35 tailored 3D clothes with PBR normal/detail maps
 * - 28 real-time anthropometric morph targets (`gender`, `heightCm`, `weightKg`, `bodyShape`, shoulder/waist/hip)
 * - Full game-character spherical camera (`앞`, `뒤`, `좌`, `우`, `상`, `하` + drag & pinch/wheel zoom)
 */
const Character25DMannequin = memo(function Character25DMannequin({
  skinToneHex = '#DFBA9B',
  personalColor = 'autumn_warm',
  gender = 'male',
  bodySpec = null,
  slots = null,
  weather = null,
  cameraPreset = 'front',
  presetNonce = 0,
  onUserOrbit,
  theme = 'light',
  compact = false,
}) {
  const containerRef = useRef(null);
  const compactCanvasRef = useRef(null);
  const engineRef = useRef(null);
  const latestSceneRef = useRef(null);
  const pointersRef = useRef(new Map());
  const lastPinchDistRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [compactYawDeg, setCompactYawDeg] = useState(14);

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

  const palette = useMemo(
    () => computeSkinShadingPalette(skinToneHex, personalColor, theme),
    [skinToneHex, personalColor, theme]
  );

  const profilePayload = useMemo(
    () => ({
      gender: effectiveGender,
      heightCm: resolvedBodySpec.heightCm,
      weightKg: resolvedBodySpec.weightKg,
      bodyShape: resolvedBodySpec.bodyShape,
      shoulderScale: resolvedBodySpec.shoulderScale,
      waistScale: resolvedBodySpec.waistScale,
      hipScale: resolvedBodySpec.hipScale,
      skinToneHex: palette.base,
      personalColor,
    }),
    [effectiveGender, resolvedBodySpec, palette.base, personalColor]
  );

  const loadoutBySlot = useMemo(
    () => (compact ? {} : mapStudioSlotsTo3DLoadout(slots)),
    [compact, slots]
  );

  latestSceneRef.current = {
    theme,
    cameraPreset,
    profilePayload,
    loadoutBySlot,
    weather,
    ariaLabel: `360도 캐릭터 모델 (${palette.base})`,
  };

  // 1a. Compact Modal Preview (`SkinToneAnalysisModal`): shared offscreen 3D blitter
  useEffect(() => {
    if (!compact) return undefined;
    const canvas = compactCanvasRef.current;
    if (!canvas) return undefined;

    render3DMannequinScene(canvas, {
      profile: profilePayload,
      rotationDeg: compactYawDeg,
      compact: true,
      darkHud: theme === 'dark',
    });
    return undefined;
  }, [compact, profilePayload, compactYawDeg, theme]);

  // 1b. Main Interactive 3D Stage (`#character-25d-mannequin`): fresh <canvas> per mount for React <StrictMode> & HMR safety
  useEffect(() => {
    if (compact) return undefined;
    const container = containerRef.current;
    if (!container) return undefined;

    const snap = latestSceneRef.current;
    const canvas = document.createElement('canvas');
    canvas.className = 'character-25d-render-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', snap.ariaLabel);
    container.appendChild(canvas);

    let engine;
    try {
      engine = new Mannequin3DWebGLEngine(canvas, {
        transparentBackground: true,
      });
      setWebglUnavailable(false);
    } catch {
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
      setWebglUnavailable(true);
      return undefined;
    }

    const initialPreset = CAMERA_VIEW_PRESETS[snap.cameraPreset] || CAMERA_VIEW_PRESETS.front;
    engine.setDarkTheme(snap.theme === 'dark');
    engine.setSphericalView({
      yawRad: initialPreset.yawRad,
      polarRad: initialPreset.polarRad,
      zoom: initialPreset.zoom,
      immediate: true,
    });
    engine.updateScene({
      profile: snap.profilePayload,
      loadoutBySlot: snap.loadoutBySlot,
      weather: snap.weather,
    });
    engineRef.current = engine;

    const handleWheel = (e) => {
      e.preventDefault();
      engine.addZoomDelta(e.deltaY * 0.00075);
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
      engine.dispose();
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
    };
  }, [compact]);

  // 2. Sync Light/Dark Studio Illumination
  useEffect(() => {
    if (compact) return;
    engineRef.current?.setDarkTheme(theme === 'dark');
  }, [compact, theme]);

  // 3. Sync Anthropometric Body Morphs, Skin Tone, Tailored 3D Garments & Weather Motion
  useEffect(() => {
    if (compact) return;
    const engine = engineRef.current;
    if (!engine) return;
    engine.canvas?.setAttribute?.('aria-label', `360도 캐릭터 모델 (${palette.base})`);
    engine.updateScene({
      profile: profilePayload,
      loadoutBySlot,
      weather,
    });
  }, [compact, profilePayload, loadoutBySlot, weather, palette.base]);

  // 4. Apply 6-Direction Game-Character Camera Presets (`앞`, `뒤`, `좌`, `우`, `상`, `하`)
  useEffect(() => {
    if (compact) return;
    const engine = engineRef.current;
    const preset = CAMERA_VIEW_PRESETS[cameraPreset];
    if (!engine || !preset) return;
    engine.setSphericalView({
      yawRad: preset.yawRad,
      polarRad: preset.polarRad,
      zoom: preset.zoom,
      immediate: false,
    });
  }, [compact, cameraPreset, presetNonce]);

  // 5. Pointer / Multi-Touch Spherical Orbit & Pinch Zoom
  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const pointers = pointersRef.current;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      lastPinchDistRef.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
    setIsDragging(true);
  };

  const handlePointerMove = (e) => {
    const pointers = pointersRef.current;
    if (!pointers.has(e.pointerId)) return;

    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (compact) {
      if (pointers.size === 1 && prev) {
        const dx = e.clientX - prev.x;
        if (Math.abs(dx) > 0.4) {
          setCompactYawDeg((deg) => deg + dx * 0.75);
        }
      }
      return;
    }

    const engine = engineRef.current;
    if (!engine) return;

    if (pointers.size === 1 && prev) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        engine.addOrbitDelta(dx * 0.012, -dy * 0.0095);
        onUserOrbit?.();
      }
    } else if (pointers.size === 2) {
      const pts = Array.from(pointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinchDistRef.current > 0) {
        const delta = lastPinchDistRef.current - dist;
        engine.addZoomDelta(delta * 0.0028);
      }
      lastPinchDistRef.current = dist;
    }
  };

  const handlePointerEnd = (e) => {
    const pointers = pointersRef.current;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      lastPinchDistRef.current = 0;
    }
    if (pointers.size === 0) {
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

      {compact && (
        <canvas
          ref={compactCanvasRef}
          width={220}
          height={310}
          className="character-25d-render-canvas"
          role="img"
          aria-label={`360도 캐릭터 모델 (${palette.base})`}
        />
      )}

      {!compact && webglUnavailable && (
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
