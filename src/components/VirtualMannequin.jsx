import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Ruler, SlidersHorizontal, User, UserCheck } from 'lucide-react';
import { formatKRW } from '../utils/api.js';
import { resolveAnatomicalProfile } from '../utils/bodyAnthropometrics.js';
import {
  Mannequin3DWebGLEngine,
  inferFabricMaterialSpec,
  render3DMannequinScene,
  resolveSkinHex,
} from '../utils/mannequin3DRenderer.js';
import StudioGarmentImage from './StudioGarmentImage.jsx';

// 11 wear slots in head → foot dressing order (code numbers are used by OutfitInspectorModal)
export const LEFT_HUD_SLOTS = [
  { key: 'headwear', code: 'SLT-01 // HEAD', no: '01', labelKo: '모자 · 헤드웨어' },
  { key: 'neckwear', code: 'SLT-02 // NECK', no: '02', labelKo: '목도리 · 스카프' },
  { key: 'outer', code: 'SLT-03 // OUTER', no: '03', labelKo: '아우터 · 코트' },
  { key: 'top', code: 'SLT-04 // TOP', no: '04', labelKo: '상의 · 니트/셔츠' },
  { key: 'underwear', code: 'SLT-05 // INNER', no: '05', labelKo: '언더웨어 · 이너탑' },
];

export const RIGHT_HUD_SLOTS = [
  { key: 'dress', code: 'SLT-06 // SUIT', no: '06', labelKo: '원피스 · 올인원' },
  { key: 'gloves', code: 'SLT-07 // HAND', no: '07', labelKo: '장갑 · 핸드웨어' },
  { key: 'bottom', code: 'SLT-08 // LEGS', no: '08', labelKo: '하의 · 팬츠/스커트' },
  { key: 'socks', code: 'SLT-09 // SOCKS', no: '09', labelKo: '양말 · 삭스' },
  { key: 'shoes', code: 'SLT-10 // FEET', no: '10', labelKo: '신발 · 풋웨어' },
  { key: 'accessory', code: 'SLT-11 // GEAR', no: '11', labelKo: '가방 · 액세서리' },
];

export const ALL_11_SLOTS = [...LEFT_HUD_SLOTS, ...RIGHT_HUD_SLOTS].sort((a, b) => {
  const numA = parseInt(a.code.slice(4, 6), 10);
  const numB = parseInt(b.code.slice(4, 6), 10);
  return numA - numB;
});

const SLOT_BY_KEY = Object.fromEntries(ALL_11_SLOTS.map((s) => [s.key, s]));

// Fitting-room columns (upper body on the left, lower body & accessories on the right)
const LEFT_GROUPS = [
  { titleKo: '머리 · 목', keys: ['headwear', 'neckwear'] },
  { titleKo: '상체', keys: ['outer', 'top', 'underwear'] },
  { titleKo: '손', keys: ['gloves'] },
];
const RIGHT_GROUPS = [
  { titleKo: '하체 · 전신', keys: ['bottom', 'dress'] },
  { titleKo: '발', keys: ['socks', 'shoes'] },
  { titleKo: '액세서리', keys: ['accessory'] },
];

// Spec angle presets (HANDOFF_SPEC §3 d)
const ANGLE_PRESETS = [
  { deg: -28, labelKo: '좌측면 -28°' },
  { deg: -14, labelKo: '3/4 입체 -14°' },
  { deg: 0, labelKo: '정면 0°' },
  { deg: 24, labelKo: '우측면 +24°' },
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

/**
 * Lightweight faceless body-shape preview (2D-projected 3D silhouette).
 * Used by the 7 body-shape cards and the live preview in ProfilePersonalColorModal —
 * canvas 2D on purpose so 8+ previews never exhaust WebGL contexts.
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
    // profileKey / loadoutKey capture deep changes of user & loadout
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
  title = '3D 피팅 스튜디오',
  onSelectSlot,
  onItemClick,
  onOpenProfileModal,
  onOpenBodySetup,
  onOpenInspector,
  compact = false,
}) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const dragStateRef = useRef({ dragging: false, startX: 0, startYaw: 0, moved: false });

  // Faceless sculpted mannequin head by default (spec: "얼굴은 제외하고")
  const [headMode, setHeadMode] = useState('mannequin'); // 'mannequin' | 'avatar'
  const [selectedSlot, setSelectedSlot] = useState('all');
  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [rotationDeg, setRotationDeg] = useState(-14);
  const [webglReady, setWebglReady] = useState(false);

  const openProfile = onOpenProfileModal || onOpenBodySetup;

  const resolvedLoadout = useMemo(() => {
    const map = { ...loadoutBySlot };
    for (const item of items) {
      if (!item) continue;
      const cat = item.category === 'bag' ? 'accessory' : item.category;
      if (cat && !map[cat]) {
        map[cat] = item;
      }
    }
    return map;
  }, [loadoutBySlot, items]);

  const anatomical = useMemo(() => resolveAnatomicalProfile(userProfile || {}), [userProfile]);
  const bodyToneHex = resolveSkinHex(userProfile || {});
  const personalColorLabel = resolvePersonalColorLabel(userProfile || {});
  const customMeasureCount = countCustomMeasurements(anatomical);

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

  // Create / dispose WebGL engine
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
    // rotationDeg only seeds the initial yaw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  // Rebuild mannequin + garments when profile / loadout / highlight changes
  useEffect(() => {
    if (engineRef.current && webglReady) {
      engineRef.current.updateScene({
        profile: userProfile || {},
        loadout: resolvedLoadout,
        headMode,
        selectedSlot: selectedSlot === 'all' ? null : selectedSlot,
        hoveredSlot,
      });
    } else if (canvasRef.current && !webglReady) {
      render3DMannequinScene(canvasRef.current, {
        profile: userProfile || {},
        loadout: resolvedLoadout,
        rotationDeg,
      });
    }
  }, [userProfile, resolvedLoadout, headMode, selectedSlot, hoveredSlot, webglReady, rotationDeg]);

  // Fitting ring sweep only when the outfit itself changes (not on hover)
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
    const item = resolvedLoadout[slotKey] || null;
    onSelectSlot?.(slotKey, item);
    if (item) onItemClick?.(item, slotKey);
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
      engineRef.current.setParallax(((x - rect.left) / rect.width - 0.5) * 2, ((y - rect.top) / rect.height - 0.5) * 2);
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

    return (
      <button
        key={slotKey}
        type="button"
        className={`atl-slot-card ${isActive ? 'active' : ''} ${isHover ? 'hover' : ''} ${item ? '' : 'empty'}`}
        onClick={() => handleSlotClick(slotKey)}
        onMouseEnter={() => setHoveredSlot(slotKey)}
        onMouseLeave={() => setHoveredSlot(null)}
        title={item ? `${slot.labelKo}: ${item.name}` : `${slot.labelKo} — 비어 있음`}
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
          <strong>{item ? item.name : '비어 있음'}</strong>
          {fabric && (
            <em>
              <span className="atl-color-dot" style={{ background: item.color_hex || '#ccc' }} />
              {fabric.labelKo}
            </em>
          )}
        </span>
      </button>
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
          <span className="atl-eyebrow">3D Fitting Studio</span>
          <h3>{title}</h3>
        </div>

        <div className="atl-body-badges">
          <button type="button" className="atl-badge" onClick={() => openProfile?.()} title="퍼스널컬러 바디 톤">
            <span className="atl-tone-swatch" style={{ background: bodyToneHex }} />
            {personalColorLabel} 바디
          </button>
          <button type="button" className="atl-badge" onClick={() => openProfile?.()} title="7대 체형">
            <User size={13} />
            {anatomical.shapeShortKo}
          </button>
          <button
            type="button"
            className="atl-badge"
            onClick={() => openProfile?.()}
            title="스리사이즈 · 머리둘레 (미입력 항목은 체형 기준 디폴트)"
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
            코디 총액 <strong>{formatKRW(loadoutStats.totalValue)}</strong>
          </span>
          {openProfile && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => openProfile()}>
              <SlidersHorizontal size={13} /> 체형 · 퍼스널컬러
            </button>
          )}
        </div>
      </header>

      <div className="atl-fitting-grid">
        <div className="atl-col">{renderGroups(LEFT_GROUPS)}</div>

        <div className="atl-stage">
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
              <small>
                {SLOT_BY_KEY[hoverInfoSlot]?.no} · {SLOT_BY_KEY[hoverInfoSlot]?.labelKo}
              </small>
              <strong>{hoverInfoItem ? hoverInfoItem.name : '착용 아이템 없음'}</strong>
              {hoverInfoItem && <span>{inferFabricMaterialSpec(hoverInfoItem).labelKo}</span>}
            </div>
          )}

          <div className="atl-stage-hint">드래그로 회전 · 의류를 클릭하면 해당 부위를 확대합니다</div>

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
              {headMode === 'avatar' ? '아바타 헤드' : '마네킹 헤드'}
            </button>
            {selectedSlot !== 'all' && (
              <button type="button" className="atl-chip dark" onClick={resetView}>
                <RotateCcw size={11} /> 전신 보기
              </button>
            )}
          </div>
        </div>

        <div className="atl-col">
          {renderGroups(RIGHT_GROUPS)}
          {onOpenInspector && (
            <button
              type="button"
              className="btn btn-primary atl-inspector-btn"
              onClick={() => onOpenInspector(selectedSlot === 'all' ? null : selectedSlot)}
            >
              머리→발 전체 코디 보기
            </button>
          )}
        </div>
      </div>

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
