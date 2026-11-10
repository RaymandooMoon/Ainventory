import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Footprints,
  Hand,
  Layers,
  RotateCcw,
  Ruler,
  SlidersHorizontal,
  Sparkles,
  Umbrella,
  User,
  UserCheck,
  Wind,
  X,
} from 'lucide-react';
import { formatKRW } from '../utils/api.js';
import { resolveAnatomicalProfile } from '../utils/bodyAnthropometrics.js';
import { infer3DRegistrationSpec } from '../utils/garment3DPhysicsSpecs.js';
import {
  MOTION_PRESETS,
  Mannequin3DWebGLEngine,
  inferFabricMaterialSpec,
  render3DMannequinScene,
  resolveSkinHex,
} from '../utils/mannequin3DRenderer.js';
import StudioGarmentImage from './StudioGarmentImage.jsx';

// 11 wear slots in head → foot dressing order (code numbers are used by OutfitInspectorModal)
export const LEFT_HUD_SLOTS = [
  { key: 'headwear', code: 'SLT-01 // HEAD', no: '01', labelKo: '모자 · 헤드웨어', shortKo: '모자' },
  { key: 'neckwear', code: 'SLT-02 // NECK', no: '02', labelKo: '목도리 · 스카프', shortKo: '목도리' },
  { key: 'outer', code: 'SLT-03 // OUTER', no: '03', labelKo: '아우터 · 코트', shortKo: '아우터' },
  { key: 'top', code: 'SLT-04 // TOP', no: '04', labelKo: '상의 · 니트/셔츠', shortKo: '상의' },
  { key: 'underwear', code: 'SLT-05 // INNER', no: '05', labelKo: '언더웨어 · 이너탑', shortKo: '이너' },
];

export const RIGHT_HUD_SLOTS = [
  { key: 'dress', code: 'SLT-06 // SUIT', no: '06', labelKo: '원피스 · 올인원', shortKo: '원피스' },
  { key: 'gloves', code: 'SLT-07 // HAND', no: '07', labelKo: '장갑 · 핸드웨어', shortKo: '장갑' },
  { key: 'bottom', code: 'SLT-08 // LEGS', no: '08', labelKo: '하의 · 팬츠/스커트', shortKo: '하의' },
  { key: 'socks', code: 'SLT-09 // SOCKS', no: '09', labelKo: '양말 · 삭스', shortKo: '양말' },
  { key: 'shoes', code: 'SLT-10 // FEET', no: '10', labelKo: '신발 · 풋웨어', shortKo: '신발' },
  { key: 'accessory', code: 'SLT-11 // GEAR', no: '11', labelKo: '가방 · 액세서리', shortKo: '가방·소품' },
];

export const ALL_11_SLOTS = [...LEFT_HUD_SLOTS, ...RIGHT_HUD_SLOTS].sort((a, b) => {
  const numA = parseInt(a.code.slice(4, 6), 10);
  const numB = parseInt(b.code.slice(4, 6), 10);
  return numA - numB;
});

const SLOT_BY_KEY = Object.fromEntries(ALL_11_SLOTS.map((s) => [s.key, s]));

const LEFT_GROUPS = [
  { titleKo: '머리 · 목', keys: ['headwear', 'neckwear'] },
  { titleKo: '상체', keys: ['outer', 'top', 'underwear'] },
  { titleKo: '손', keys: ['gloves'] },
];
const RIGHT_GROUPS = [
  { titleKo: '하체 · 전신', keys: ['bottom', 'dress'] },
  { titleKo: '발', keys: ['socks', 'shoes'] },
  { titleKo: '액세서리 · 백', keys: ['accessory'] },
];

const ANGLE_PRESETS = [
  { deg: -28, labelKo: '좌측 -28°' },
  { deg: -14, labelKo: '3/4 -14°' },
  { deg: 0, labelKo: '정면 0°' },
  { deg: 24, labelKo: '우측 +24°' },
];

const PERSONAL_COLOR_LABEL_KO = {
  spring_warm: '봄 웜톤',
  summer_cool: '여름 쿨톤',
  autumn_warm: '가을 웜톤',
  winter_cool: '겨울 쿨톤',
};

function resolvePersonalColorLabel(profile = {}) {
  const key = profile.personalColor || profile.personal_color;
  return (
    profile.personalColorLabelKo ||
    PERSONAL_COLOR_LABEL_KO[key] ||
    profile.personalColorLabel ||
    '퍼스널컬러 미진단'
  );
}

function formatMeasurementsLine(anat) {
  return `가슴 ${anat.chestCm} · 허리 ${anat.waistCm} · 힙 ${anat.hipCm} · 두위 ${anat.headCm}cm`;
}

function countCustomMeasurements(anat) {
  const src = anat.sources || {};
  return ['chestCm', 'waistCm', 'hipCm', 'headCm'].filter((k) => src[k] === 'user').length;
}

function motionIconForKey(key) {
  if (key === 'walk') return <Footprints size={12} />;
  if (key === 'wave') return <Hand size={12} />;
  if (key === 'umbrella') return <Umbrella size={12} />;
  if (key === 'idle') return <Wind size={12} />;
  return <Sparkles size={12} />;
}

/**
 * Lightweight faceless body-shape preview (used by 7 body-shape cards & live modal preview).
 */
export function Mannequin3DBodyPreview({
  user = {},
  poseYawDeg = -16,
  loadout = {},
  width = 110,
  height = 156,
  displayWidth,
  displayHeight,
  className = '',
  style,
}) {
  const ref = useRef(null);
  const profileKey = JSON.stringify(user || {});
  const loadoutKey = JSON.stringify(
    Object.fromEntries(Object.entries(loadout || {}).map(([k, v]) => [k, v?.color_hex || null]))
  );

  useEffect(() => {
    if (!ref.current) return;
    render3DMannequinScene(ref.current, {
      profile: user || {},
      loadout: loadout || {},
      rotationDeg: poseYawDeg,
      compact: height < 220,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileKey, loadoutKey, poseYawDeg, width, height]);

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={`atl-body-preview ${className}`}
      style={{
        width: displayWidth ?? Math.round(width * 0.72),
        height: displayHeight ?? Math.round(height * 0.72),
        ...style,
      }}
      aria-label="무안면 3D 체형 프리뷰"
    />
  );
}

export default function VirtualMannequin({
  userProfile = {},
  loadoutBySlot = {},
  items = [],
  closetGarments = [],
  weather = null,
  title = '3D 피팅 스튜디오',
  onSelectSlot,
  onSwapSlotItem,
  onItemClick,
  onOpenProfileModal,
  onOpenBodySetup,
  onOpenInspector,
  compact = false,
}) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const dragStateRef = useRef({ dragging: false, startX: 0, startYaw: 0, moved: false });

  const [headMode, setHeadMode] = useState('mannequin');
  const [selectedSlot, setSelectedSlot] = useState('all');
  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [rotationDeg, setRotationDeg] = useState(-14);
  const [motionMode, setMotionMode] = useState('auto');
  const [webglReady, setWebglReady] = useState(false);

  const openProfile = onOpenProfileModal || onOpenBodySetup;

  // IMPORTANT FIX (Bug 2.b): Respect explicit `null` unequipped slots in `loadoutBySlot`!
  // Never overwrite `map[cat]` from `items` when `cat in loadoutBySlot`.
  const resolvedLoadout = useMemo(() => {
    const map = { ...loadoutBySlot };
    for (const item of items) {
      if (!item) continue;
      const cat = item.category === 'bag' ? 'accessory' : item.category;
      if (cat && !(cat in loadoutBySlot) && !map[cat]) {
        map[cat] = item;
      }
    }
    return map;
  }, [loadoutBySlot, items]);

  const anatomical = useMemo(() => resolveAnatomicalProfile(userProfile || {}), [userProfile]);
  const bodyToneHex = resolveSkinHex(userProfile || {});
  const personalColorLabel = resolvePersonalColorLabel(userProfile || {});
  const customMeasureCount = countCustomMeasurements(anatomical);

  const isRainyWeather = Boolean(
    weather &&
      (weather.isRainy ||
        Number(weather.precipProb) >= 50 ||
        /비|소나기|우천|눈|폭우|rain|shower|snow/i.test(String(weather.condition || '')))
  );

  // Candidate closet garments for the currently selected slot (Whering-style inline live swap!)
  const slotCandidates = useMemo(() => {
    if (!selectedSlot || selectedSlot === 'all') return [];
    const pool = (closetGarments || []).filter((g) => {
      if (g.status && g.status !== 'active') return false;
      if (selectedSlot === 'accessory') return g.category === 'accessory' || g.category === 'bag';
      return g.category === selectedSlot;
    });
    const cur = resolvedLoadout[selectedSlot];
    if (cur && !pool.some((p) => p.id === cur.id)) {
      return [cur, ...pool];
    }
    return pool;
  }, [closetGarments, selectedSlot, resolvedLoadout]);

  const loadoutStats = useMemo(() => {
    const equippedList = Object.values(resolvedLoadout).filter(Boolean);
    if (equippedList.length === 0) {
      return { warmth: 0, waterproof: 0, formality: 0, colorHarmony: 0, totalValue: 0, equippedCount: 0 };
    }

    let thermalSum = 0;
    let waterCount = 0;
    let formalPoints = 0;
    let totalValue = 0;

    for (const item of equippedList) {
      const minTempVal = Number.isFinite(Number(item.min_temp)) ? Number(item.min_temp) : 10;
      const span = Math.max(0, 22 - minTempVal);
      thermalSum += Math.min(24, span * 1.1);
      if (item.water_resistant) waterCount += 1;
      if (item.formality === 'formal') formalPoints += 95;
      else if (item.formality === 'smart') formalPoints += 78;
      else formalPoints += 56;
      totalValue += Number(item.price) || 0;
    }

    return {
      warmth: Math.min(99, Math.max(32, Math.round(28 + thermalSum))),
      waterproof: Math.min(
        99,
        Math.max(20, Math.round(25 + waterCount * 24 + (resolvedLoadout.outer?.water_resistant ? 22 : 0)))
      ),
      formality: Math.min(99, Math.round(formalPoints / equippedList.length)),
      colorHarmony: Math.min(99, Math.max(82, 86 + (equippedList.length % 12))),
      totalValue,
      equippedCount: equippedList.length,
    };
  }, [resolvedLoadout]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let engine;
    try {
      engine = new Mannequin3DWebGLEngine(canvas);
    } catch {
      setWebglReady(false);
      return undefined;
    }
    engineRef.current = engine;
    engine.setRotationDeg(rotationDeg);
    engine.setMotionMode(motionMode);
    engine.setWeatherInfo(weather);
    setWebglReady(true);

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      engine.resize(Math.max(260, rect.width), Math.max(300, rect.height || (compact ? 420 : 540)));
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  useEffect(() => {
    if (engineRef.current && webglReady) {
      engineRef.current.updateScene({
        profile: userProfile || {},
        loadout: resolvedLoadout,
        headMode,
        selectedSlot: selectedSlot === 'all' ? null : selectedSlot,
        hoveredSlot,
        motionMode,
        weather,
      });
    } else if (canvasRef.current && !webglReady) {
      render3DMannequinScene(canvasRef.current, {
        profile: userProfile || {},
        loadout: resolvedLoadout,
        rotationDeg,
      });
    }
  }, [userProfile, resolvedLoadout, headMode, selectedSlot, hoveredSlot, motionMode, weather, webglReady, rotationDeg]);

  useEffect(() => {
    engineRef.current?.setMotionMode(motionMode);
  }, [motionMode]);

  useEffect(() => {
    engineRef.current?.setWeatherInfo(weather);
  }, [weather]);

  useEffect(() => {
    engineRef.current?.triggerEquipScanPulse();
  }, [resolvedLoadout, webglReady]);

  const focusSlot = (slotKey) => {
    engineRef.current?.setFocusSlot(slotKey);
  };

  const handleSlotClick = (slotKey) => {
    const nextSlot = selectedSlot === slotKey ? 'all' : slotKey;
    setSelectedSlot(nextSlot);
    focusSlot(nextSlot);
    if (nextSlot === 'gloves') {
      setRotationDeg(0);
      engineRef.current?.setRotationDeg(0);
    }
    const item = resolvedLoadout[slotKey] || null;
    onSelectSlot?.(nextSlot === 'all' ? null : slotKey, item);
    if (item) onItemClick?.(item, slotKey);
  };

  const handleQuickUnequip = (e, slotKey) => {
    e?.stopPropagation?.();
    setSelectedSlot(slotKey);
    focusSlot(slotKey);
    if (slotKey === 'gloves') {
      setRotationDeg(0);
      engineRef.current?.setRotationDeg(0);
    }
    onSwapSlotItem?.(slotKey, null);
  };

  const handleQuickEquip = (slotKey, newItem) => {
    setSelectedSlot(slotKey);
    focusSlot(slotKey);
    if (slotKey === 'gloves') {
      setRotationDeg(0);
      engineRef.current?.setRotationDeg(0);
    }
    onSwapSlotItem?.(slotKey, newItem);
  };

  const resetView = () => {
    setSelectedSlot('all');
    focusSlot('all');
  };

  const handleRotatePreset = (deg) => {
    setRotationDeg(deg);
    engineRef.current?.setRotationDeg(deg);
  };

  const getPoint = (e) => {
    const t = e.touches?.[0] || e.changedTouches?.[0];
    return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY };
  };

  const handlePointerDown = (e) => {
    const { x } = getPoint(e);
    dragStateRef.current = { dragging: true, startX: x, startYaw: rotationDeg, moved: false };
  };

  const handlePointerMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = getPoint(e);

    if (dragStateRef.current.dragging) {
      const deltaX = x - dragStateRef.current.startX;
      if (Math.abs(deltaX) > 4) dragStateRef.current.moved = true;
      const nextDeg = (dragStateRef.current.startYaw + deltaX * 0.65) % 360;
      setRotationDeg(nextDeg);
      engineRef.current?.setRotationDeg(nextDeg);
      return;
    }

    if (engineRef.current && !e.touches) {
      const rect = canvas.getBoundingClientRect();
      engineRef.current.setParallax(
        ((x - rect.left) / rect.width - 0.5) * 2,
        ((y - rect.top) / rect.height - 0.5) * 2
      );
      const hitSlot = engineRef.current.hitTestClientPoint(x, y);
      if (hitSlot !== hoveredSlot) setHoveredSlot(hitSlot);
    }
  };

  const handlePointerUp = (e) => {
    if (dragStateRef.current.dragging && !dragStateRef.current.moved && engineRef.current) {
      const { x, y } = getPoint(e);
      const hitSlot = engineRef.current.hitTestClientPoint(x, y);
      if (hitSlot) handleSlotClick(hitSlot);
    }
    dragStateRef.current.dragging = false;
  };

  const handlePointerLeave = () => {
    dragStateRef.current.dragging = false;
    engineRef.current?.setParallax(0, 0);
    setHoveredSlot(null);
  };

  const renderSlotCard = (slotKey) => {
    const slot = SLOT_BY_KEY[slotKey];
    const item = resolvedLoadout[slotKey];
    const isActive = selectedSlot === slotKey;
    const isHover = hoveredSlot === slotKey;
    const fabric = item ? inferFabricMaterialSpec(item) : null;
    const phys = item ? infer3DRegistrationSpec(item) : null;

    return (
      <div
        key={slotKey}
        role="button"
        tabIndex={0}
        id={`mannequin-slot-card-${slotKey}`}
        className={`atl-slot-card ${isActive ? 'active' : ''} ${isHover ? 'hover' : ''} ${item ? '' : 'empty'}`}
        onClick={() => handleSlotClick(slotKey)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleSlotClick(slotKey);
          }
        }}
        onMouseEnter={() => setHoveredSlot(slotKey)}
        onMouseLeave={() => setHoveredSlot(null)}
        title={item ? `${slot.labelKo}: ${item.name} (클릭하여 부위 줌 · 교체)` : `${slot.labelKo} — 비어 있음`}
      >
        <span className="atl-slot-thumb">
          {item ? (
            <StudioGarmentImage item={item} style={{ width: '100%', height: '100%', borderRadius: 8 }} />
          ) : (
            <span className="atl-slot-no">{slot.no}</span>
          )}
        </span>
        <span className="atl-slot-text">
          <small>
            {slot.no} · {slot.labelKo}
          </small>
          <strong>{item ? item.name : '착용 안 함 (비어 있음)'}</strong>
          {fabric && (
            <em>
              <span className="atl-color-dot" style={{ background: item.color_hex || '#ccc' }} />
              {phys?.physicsKey !== 'rigid_fitted' ? '지글 피직스 · ' : ''}
              {fabric.labelKo}
            </em>
          )}
        </span>
        {item && onSwapSlotItem && (
          <button
            type="button"
            id={`unequip-slot-${slotKey}`}
            className="atl-slot-unequip-btn"
            onClick={(e) => handleQuickUnequip(e, slotKey)}
            title={`${slot.shortKo} 벗기 (장착 해제)`}
            aria-label={`${slot.shortKo} 벗기`}
          >
            <X size={13} />
          </button>
        )}
      </div>
    );
  };

  const renderGroups = (groups) =>
    groups.map((g) => (
      <div key={g.titleKo} className="atl-slot-group">
        <h4 className="atl-group-title">{g.titleKo}</h4>
        <div className="atl-slot-list">{g.keys.map(renderSlotCard)}</div>
      </div>
    ));

  const hoverInfoSlot = hoveredSlot || (selectedSlot !== 'all' ? selectedSlot : null);
  const hoverInfoItem = hoverInfoSlot ? resolvedLoadout[hoverInfoSlot] : null;

  const statRows = [
    { key: 'warmth', labelKo: '보온', value: loadoutStats.warmth },
    { key: 'waterproof', labelKo: '방수', value: loadoutStats.waterproof },
    { key: 'formality', labelKo: '포멀 지수', value: loadoutStats.formality },
    { key: 'colorHarmony', labelKo: '퍼스널컬러 조화', value: loadoutStats.colorHarmony },
  ];

  return (
    <section className={`atl-fitting ${compact ? 'compact' : ''}`} aria-label="3D 피팅 스튜디오">
      <header className="atl-fitting-head">
        <div className="atl-fitting-title">
          <span className="atl-eyebrow">3D Fitting Studio · Live Motion &amp; Physics</span>
          <h3>{title}</h3>
        </div>

        <div className="atl-body-badges">
          <button
            id="open-personal-color-camera-badge"
            type="button"
            className="atl-badge"
            onClick={() => openProfile?.(2)}
            title="카메라 촬영 · 사진 크롭 에디터로 퍼스널컬러 측정 및 3D 모델 컬러 변경"
          >
            <span className="atl-tone-swatch" style={{ background: bodyToneHex }} />
            {personalColorLabel} 바디 · 퍼스널컬러 측정
          </button>
          <button
            id="open-body-shape-badge"
            type="button"
            className="atl-badge"
            onClick={() => openProfile?.(1)}
            title="7대 체형 선택"
          >
            <User size={13} />
            {anatomical.shapeShortKo}
          </button>
          <button
            type="button"
            className="atl-badge atl-badge-hide-xs"
            onClick={() => openProfile?.(1)}
            title="스리사이즈 · 머리둘레"
          >
            <Ruler size={13} />
            {formatMeasurementsLine(anatomical)}
            <span className={`atl-badge-tag ${customMeasureCount > 0 ? 'custom' : ''}`}>
              {customMeasureCount > 0 ? `커스텀 ${customMeasureCount}/4` : '디폴트'}
            </span>
          </button>
        </div>

        <div className="atl-head-meta">
          <span>
            착장 <strong>{loadoutStats.equippedCount}</strong>/11
          </span>
          <span>
            총액 <strong>{formatKRW(loadoutStats.totalValue)}</strong>
          </span>
          {openProfile && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openProfile(1)}>
              <SlidersHorizontal size={13} /> 체형 · 컬러
            </button>
          )}
        </div>
      </header>

      {/* Mobile-First Horizontal 11-Slot Touch Rail (visible on mobile/tablet < 1024px) */}
      <div className="atl-mobile-slot-rail" role="tablist" aria-label="11부위 착용 슬롯 선택">
        <button
          type="button"
          className={`atl-mobile-slot-pill ${selectedSlot === 'all' ? 'active' : ''}`}
          onClick={resetView}
        >
          <span>전신</span>
        </button>
        {ALL_11_SLOTS.map((slot) => {
          const eq = resolvedLoadout[slot.key];
          return (
            <button
              key={slot.key}
              type="button"
              id={`mobile-slot-pill-${slot.key}`}
              className={`atl-mobile-slot-pill ${selectedSlot === slot.key ? 'active' : ''} ${eq ? 'equipped' : 'empty'}`}
              onClick={() => handleSlotClick(slot.key)}
            >
              <span
                className="atl-color-dot"
                style={{ background: eq ? eq.color_hex || '#888' : 'transparent', borderStyle: eq ? 'solid' : 'dashed' }}
              />
              <span>{slot.shortKo}</span>
              {eq && onSwapSlotItem && (
                <span
                  role="button"
                  tabIndex={-1}
                  className="atl-pill-x"
                  onClick={(e) => handleQuickUnequip(e, slot.key)}
                  aria-label={`${slot.shortKo} 벗기`}
                >
                  ×
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="atl-fitting-grid">
        <div className="atl-col atl-col-desktop">{renderGroups(LEFT_GROUPS)}</div>

        <div className="atl-stage">
          {/* Live Motion Mode Selector Bar (Default Idle / Walk / Wave / Weather Umbrella) */}
          <div className="atl-motion-bar" role="toolbar" aria-label="3D 마네킹 모션 전환">
            {MOTION_PRESETS.map((m) => {
              const active = motionMode === m.key;
              return (
                <button
                  key={m.key}
                  id={`mannequin-motion-${m.key}`}
                  type="button"
                  className={`atl-motion-chip ${active ? 'active' : ''}`}
                  onClick={() => setMotionMode(m.key)}
                >
                  {motionIconForKey(m.key)}
                  <span>
                    {m.key === 'auto' && isRainyWeather ? '자동(우산ON)' : m.labelKo}
                  </span>
                </button>
              );
            })}
          </div>

          <canvas
            ref={canvasRef}
            width={440}
            height={540}
            className="atl-stage-canvas"
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerLeave}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />

          {hoverInfoSlot && (
            <div className="atl-stage-callout">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <small>
                  {SLOT_BY_KEY[hoverInfoSlot]?.no} · {SLOT_BY_KEY[hoverInfoSlot]?.labelKo}
                </small>
                {hoverInfoItem && onSwapSlotItem && (
                  <button
                    type="button"
                    className="atl-callout-unequip"
                    onClick={(e) => handleQuickUnequip(e, hoverInfoSlot)}
                  >
                    <X size={11} /> 벗기
                  </button>
                )}
              </div>
              <strong>{hoverInfoItem ? hoverInfoItem.name : '착용 아이템 없음 (맨손/맨몸 상태)'}</strong>
              {hoverInfoItem && (
                <span>
                  {inferFabricMaterialSpec(hoverInfoItem).labelKo} ·{' '}
                  {infer3DRegistrationSpec(hoverInfoItem).preset.labelKo}
                </span>
              )}
            </div>
          )}

          <div className="atl-stage-hint">
            드래그하여 360° 회전 · 부위 선택 시 카메라 포커스 &amp; 즉시 벗기/교체
          </div>

          <div className="atl-stage-controls">
            {ANGLE_PRESETS.map((p) => (
              <button
                key={p.deg}
                type="button"
                className={`atl-chip ${Math.round(rotationDeg) === p.deg ? 'active' : ''}`}
                onClick={() => handleRotatePreset(p.deg)}
              >
                {p.labelKo}
              </button>
            ))}
            <button
              type="button"
              className="atl-chip"
              onClick={() => setHeadMode((m) => (m === 'avatar' ? 'mannequin' : 'avatar'))}
              title="무안면 마네킹 헤드 / 아바타 헤드 전환"
            >
              {headMode === 'avatar' ? <UserCheck size={12} /> : <User size={12} />}
              {headMode === 'avatar' ? '아바타' : '마네킹'}
            </button>
            {selectedSlot !== 'all' && (
              <button type="button" className="atl-chip dark" id="mannequin-reset-fullbody" onClick={resetView}>
                <RotateCcw size={11} /> 전신 보기
              </button>
            )}
          </div>
        </div>

        <div className="atl-col atl-col-desktop">
          {renderGroups(RIGHT_GROUPS)}
          {onOpenInspector && (
            <button
              type="button"
              className="btn btn-primary atl-inspector-btn"
              onClick={() => onOpenInspector(selectedSlot === 'all' ? null : selectedSlot)}
            >
              <Layers size={14} /> 11부위 전체 코디 인스펙터
            </button>
          )}
        </div>
      </div>

      {/* Inline Whering-Style Quick-Swap & Unequip Dock (keeps 3D mannequin visible while swapping!) */}
      {selectedSlot !== 'all' && onSwapSlotItem && (
        <div className="atl-quick-dock" aria-label="선택 부위 빠른 착장/해제 독">
          <div className="atl-quick-dock-head">
            <div>
              <span className="atl-eyebrow" style={{ display: 'block', marginBottom: 2 }}>
                LIVE 3D SLOT FITTING
              </span>
              <strong>
                {SLOT_BY_KEY[selectedSlot]?.no} · {SLOT_BY_KEY[selectedSlot]?.labelKo} 실시간 피팅
              </strong>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {resolvedLoadout[selectedSlot] && (
                <button
                  type="button"
                  id={`dock-unequip-${selectedSlot}`}
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => handleQuickUnequip(e, selectedSlot)}
                >
                  <X size={13} /> 이 부위 벗기 (착용 해제)
                </button>
              )}
              {onOpenInspector && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onOpenInspector(selectedSlot)}
                >
                  <Layers size={13} /> 상세 인스펙터
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetView}>
                전신 복귀
              </button>
            </div>
          </div>

          <div className="atl-quick-dock-rail">
            <button
              type="button"
              className={`atl-dock-item unequip-card ${!resolvedLoadout[selectedSlot] ? 'selected' : ''}`}
              onClick={(e) => handleQuickUnequip(e, selectedSlot)}
            >
              <div className="atl-dock-unequip-box">
                <X size={18} />
              </div>
              <span>미착용 (벗기)</span>
            </button>

            {slotCandidates.map((cand) => {
              const isSelected = resolvedLoadout[selectedSlot]?.id === cand.id;
              return (
                <button
                  key={cand.id}
                  type="button"
                  className={`atl-dock-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleQuickEquip(selectedSlot, cand)}
                >
                  <StudioGarmentImage
                    item={cand}
                    style={{ width: 56, height: 72, borderRadius: 8, flexShrink: 0 }}
                  />
                  <div className="atl-dock-item-meta">
                    <strong>{cand.name}</strong>
                    <small>{cand.color_name || '기본 컬러'}</small>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <footer className="atl-stat-strip">
        {statRows.map((s) => (
          <div key={s.key} className="atl-stat">
            <div className="atl-stat-row">
              <span>{s.labelKo}</span>
              <strong>{loadoutStats.equippedCount ? s.value : '--'}</strong>
            </div>
            <div className="atl-stat-bar">
              <div style={{ width: `${loadoutStats.equippedCount ? s.value : 0}%` }} />
            </div>
          </div>
        ))}
      </footer>
    </section>
  );
}
