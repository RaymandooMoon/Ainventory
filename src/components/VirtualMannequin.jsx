import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Sparkles, User, UserCheck } from 'lucide-react';
import { computeItemTier, formatKRW } from '../utils/api.js';
import { resolveAnatomicalProfile } from '../utils/bodyAnthropometrics.js';
import {
  Mannequin3DWebGLEngine,
  render3DMannequinScene,
} from '../utils/mannequin3DRenderer.js';
import StudioGarmentImage from './StudioGarmentImage.jsx';

export const LEFT_HUD_SLOTS = [
  { key: 'headwear', code: 'SLT-01 // HEAD', labelKo: '모자 · 헤드웨어' },
  { key: 'neckwear', code: 'SLT-02 // NECK', labelKo: '목도리 · 스카프' },
  { key: 'outer', code: 'SLT-03 // OUTER', labelKo: '아우터 · 코트' },
  { key: 'top', code: 'SLT-04 // TOP', labelKo: '상의 · 니트/셔츠' },
  { key: 'underwear', code: 'SLT-05 // INNER', labelKo: '언더웨어 · 이너탑' },
];

export const RIGHT_HUD_SLOTS = [
  { key: 'dress', code: 'SLT-06 // SUIT', labelKo: '원피스 · 올인원' },
  { key: 'gloves', code: 'SLT-07 // HAND', labelKo: '장갑 · 핸드웨어' },
  { key: 'bottom', code: 'SLT-08 // LEGS', labelKo: '하의 · 팬츠/스커트' },
  { key: 'socks', code: 'SLT-09 // SOCKS', labelKo: '양말 · 삭스' },
  { key: 'shoes', code: 'SLT-10 // FEET', labelKo: '신발 · 풋웨어' },
  { key: 'accessory', code: 'SLT-11 // GEAR', labelKo: '가방 · 액세서리' },
];

export const ALL_11_SLOTS = [...LEFT_HUD_SLOTS, ...RIGHT_HUD_SLOTS].sort((a, b) => {
  const numA = parseInt(a.code.slice(4, 6), 10);
  const numB = parseInt(b.code.slice(4, 6), 10);
  return numA - numB;
});

function HangerIcon() {
  return (
    <svg width="13" height="11" viewBox="0 0 16 14" fill="none" aria-hidden="true">
      <path
        d="M8 3.5C8 2.67 8.67 2 9.5 2C10.33 2 11 2.67 11 3.5C11 4.2 10.5 4.8 9.8 4.95L8 5.5V6.8L14.6 10.6C15.3 11 15 12 14.2 12H1.8C1 12 0.7 11 1.4 10.6L8 6.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FullSuitSilhouette() {
  return (
    <svg
      viewBox="0 0 80 180"
      className="cp77-suit-silhouette"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M30 14 L50 14 L64 28 L58 76 L52 74 L54 28 L50 28 L52 84 L56 164 L43 164 L40 102 L37 164 L24 164 L28 84 L30 28 L26 28 L22 74 L16 76 L16 28 Z"
        fill="rgba(45, 226, 230, 0.22)"
        stroke="rgba(45, 226, 230, 0.65)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export default function VirtualMannequin({
  userProfile = {},
  loadoutBySlot = {},
  items = [],
  onSelectSlot,
  onOpenProfileModal,
  compact = false,
}) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const dragStateRef = useRef({ dragging: false, startX: 0, startYaw: 0 });

  const [headMode, setHeadMode] = useState('avatar'); // 'avatar' | 'mannequin'
  const [selectedSlot, setSelectedSlot] = useState('all');
  const [hoveredSlot, setHoveredSlot] = useState(null);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [webglReady, setWebglReady] = useState(false);
  const [showStatusDrawer, setShowStatusDrawer] = useState(false);
  const [suitSlotMode, setSuitSlotMode] = useState('dress'); // 'dress' | 'accessory'

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

  const anatomical = useMemo(
    () => resolveAnatomicalProfile(userProfile),
    [userProfile]
  );

  const loadoutStats = useMemo(() => {
    const equippedList = Object.values(resolvedLoadout).filter(Boolean);
    if (equippedList.length === 0) {
      return {
        thermalDefense: 45,
        hydroShield: 30,
        formalSpec: 50,
        colorSync: 85,
        totalValue: 0,
        avgCpw: 0,
        equippedCount: 0,
        closetLevel: 12,
      };
    }

    let thermalSum = 0;
    let waterCount = 0;
    let formalPoints = 0;
    let totalValue = 0;
    let cpwSum = 0;

    for (const item of equippedList) {
      const minTempVal = Number.isFinite(Number(item.min_temp)) ? Number(item.min_temp) : 10;
      const span = Math.max(0, 22 - minTempVal);
      thermalSum += Math.min(24, span * 1.1);
      if (item.water_resistant) waterCount += 1;
      if (item.formality === 'formal') formalPoints += 95;
      else if (item.formality === 'smart') formalPoints += 78;
      else formalPoints += 56;
      totalValue += Number(item.price) || 0;
      const cpw = item.wear_count > 0 ? Math.round(item.price / item.wear_count) : item.price || 0;
      cpwSum += cpw;
    }

    const thermalDefense = Math.min(99, Math.max(32, Math.round(28 + thermalSum)));
    const hydroShield = Math.min(
      99,
      Math.max(20, Math.round(25 + waterCount * 24 + (resolvedLoadout.outer?.water_resistant ? 22 : 0)))
    );
    const formalSpec = Math.min(99, Math.round(formalPoints / equippedList.length));
    const colorSync = Math.min(99, Math.max(82, 86 + (equippedList.length % 12)));

    return {
      thermalDefense,
      hydroShield,
      formalSpec,
      colorSync,
      totalValue,
      avgCpw: Math.round(cpwSum / equippedList.length),
      equippedCount: equippedList.length,
      closetLevel: Math.min(50, 18 + equippedList.length * 2),
    };
  }, [resolvedLoadout]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    try {
      const engine = new Mannequin3DWebGLEngine(canvas);
      engineRef.current = engine;
      setWebglReady(true);

      const handleResize = () => {
        if (!canvas.parentElement) return;
        const rect = canvas.parentElement.getBoundingClientRect();
        engine.resize(Math.max(260, rect.width), Math.max(400, compact ? 420 : 540));
      };
      handleResize();
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        engine.dispose();
        engineRef.current = null;
      };
    } catch {
      setWebglReady(false);
      return undefined;
    }
  }, [compact]);

  useEffect(() => {
    if (engineRef.current && webglReady) {
      engineRef.current.updateScene({
        profile: userProfile,
        loadout: resolvedLoadout,
        headMode,
        selectedSlot: selectedSlot === 'all' ? null : selectedSlot,
        hoveredSlot,
      });
      engineRef.current.triggerEquipScanPulse();
    } else if (canvasRef.current) {
      render3DMannequinScene(canvasRef.current, {
        profile: userProfile,
        loadout: resolvedLoadout,
        rotationDeg,
        darkHud: true,
      });
    }
  }, [userProfile, resolvedLoadout, headMode, selectedSlot, hoveredSlot, webglReady, rotationDeg]);

  const handleSlotClick = (slotKey) => {
    const nextSlot = selectedSlot === slotKey ? 'all' : slotKey;
    setSelectedSlot(nextSlot);
    if (engineRef.current) {
      engineRef.current.focusOnSlot(nextSlot);
      engineRef.current.triggerEquipScanPulse();
    }
    if (onSelectSlot) {
      onSelectSlot(slotKey, resolvedLoadout[slotKey] || null);
    }
  };

  const handleRotatePreset = (deg) => {
    setRotationDeg(deg);
    if (engineRef.current) {
      engineRef.current.setTargetYaw((deg * Math.PI) / 180);
    }
  };

  const handlePointerDown = (e) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    dragStateRef.current = {
      dragging: true,
      startX: clientX,
      startYaw: rotationDeg,
      moved: false,
    };
  };

  const handlePointerMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    if (dragStateRef.current.dragging) {
      const deltaX = clientX - dragStateRef.current.startX;
      if (Math.abs(deltaX) > 4) {
        dragStateRef.current.moved = true;
      }
      const nextDeg = (dragStateRef.current.startYaw + deltaX * 0.65) % 360;
      setRotationDeg(nextDeg);
      if (engineRef.current) {
        engineRef.current.setTargetYaw((nextDeg * Math.PI) / 180);
      }
      return;
    }

    if (engineRef.current && !e.touches) {
      const nx = ((clientX - rect.left) / rect.width - 0.5) * 2;
      const ny = ((clientY - rect.top) / rect.height - 0.5) * 2;
      engineRef.current.setMouseParallax(nx, ny);
      const hitSlot = engineRef.current.pickSlotAtClientPos(clientX, clientY);
      if (hitSlot !== hoveredSlot) {
        setHoveredSlot(hitSlot);
      }
    }
  };

  const handlePointerUp = (e) => {
    if (dragStateRef.current.dragging && !dragStateRef.current.moved && engineRef.current) {
      const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
      const hitSlot = engineRef.current.pickSlotAtClientPos(clientX, clientY);
      if (hitSlot) {
        handleSlotClick(hitSlot);
      }
    }
    dragStateRef.current.dragging = false;
  };

  const getRarityBarColor = (item, fallback = '#00b8ff') => {
    if (!item) return 'rgba(45, 226, 230, 0.35)';
    const tier = computeItemTier(item, userProfile?.personalColor || userProfile?.personal_color);
    if (tier.tier === 'ICONIC') return '#fcee0a';
    if (tier.tier === 'LEGENDARY') return '#ff7a00';
    if (tier.tier === 'EPIC') return '#b829ff';
    if (tier.tier === 'RARE') return '#00b8ff';
    return fallback;
  };

  // Render wide weapon-style horizontal card (Left Top: "주력 코디 / 무기" style from image_2.png)
  const renderWideWeaponSlot = (slotKey, roleLabel, statPrefix = '=') => {
    const item = resolvedLoadout[slotKey];
    const barColor = getRarityBarColor(item, '#b829ff');
    const isSelected = selectedSlot === slotKey;
    const scoreVal = item
      ? Math.min(999, Math.round(70 + (item.wear_count || 3) * 8 + (item.water_resistant ? 25 : 0)))
      : 0;

    return (
      <button
        key={`wide-${slotKey}`}
        type="button"
        className={`cp77-weapon-card ${isSelected ? 'active' : ''} ${!item ? 'empty' : ''}`}
        style={{ '--rarity-color': barColor }}
        onClick={() => handleSlotClick(slotKey)}
        onMouseEnter={() => setHoveredSlot(slotKey)}
        onMouseLeave={() => setHoveredSlot(null)}
      >
        <span className="cp77-rarity-strip" />
        <div className="cp77-socket-dots" aria-hidden="true">
          <span className="dot filled" />
          <span className="dot filled" />
          <span className="dot" />
        </div>

        <div className="cp77-weapon-visual">
          {item ? (
            <StudioGarmentImage
              item={item}
              style={{ width: 66, height: 56, borderRadius: 4, background: 'transparent' }}
            />
          ) : (
            <span className="cp77-empty-label">EMPTY // {roleLabel}</span>
          )}
        </div>

        <div className="cp77-weapon-footer">
          <span className="cp77-weapon-stat">
            <small>{statPrefix}</small>
            <strong>{item ? scoreVal : '--'}</strong>
          </span>
          <span className="cp77-weapon-name">
            {item ? item.name : `${roleLabel} 슬롯 비어있음`}
          </span>
          <span className="cp77-hanger-chip">
            <HangerIcon />
          </span>
        </div>
      </button>
    );
  };

  // Render square equipment slot (Right side "머리 / 상체 / 하체" & Left bottom "퀵 액세스")
  const renderSquareGearSlot = (slotKey, labelKo, badgeNum = null) => {
    const item = resolvedLoadout[slotKey];
    const barColor = getRarityBarColor(item, '#00b8ff');
    const isSelected = selectedSlot === slotKey;

    return (
      <button
        key={`sq-${slotKey}`}
        type="button"
        className={`cp77-square-slot ${isSelected ? 'active' : ''} ${!item ? 'empty' : ''}`}
        style={{ '--rarity-color': barColor }}
        onClick={() => handleSlotClick(slotKey)}
        onMouseEnter={() => setHoveredSlot(slotKey)}
        onMouseLeave={() => setHoveredSlot(null)}
        title={item ? `${labelKo}: ${item.name}` : `${labelKo} (클릭하여 장착)`}
      >
        <span className="cp77-rarity-strip" />
        <div className="cp77-square-img-wrap">
          {item ? (
            <StudioGarmentImage
              item={item}
              style={{ width: '100%', height: '100%', borderRadius: 3 }}
            />
          ) : (
            <span className="cp77-square-placeholder">{labelKo}</span>
          )}
        </div>
        <span className="cp77-slot-caption">{item ? item.name : labelKo}</span>
        <span className="cp77-corner-hanger">
          {badgeNum !== null ? <em className="cp77-quick-num">{badgeNum}</em> : <HangerIcon />}
        </span>
      </button>
    );
  };

  const suitItem = resolvedLoadout[suitSlotMode];

  return (
    <section className="cp77-inventory-screen" aria-label="사이버펑크 2077 스타일 3D 인벤토리">
      {/* Side Binary Telemetry Decoration */}
      <div className="cp77-edge-code left" aria-hidden="true">
        0111<br />1001<br />0010<br />1101<br />0100<br />1110
      </div>
      <div className="cp77-edge-code right" aria-hidden="true">
        0111<br />1001<br />0010<br />1000<br />0111<br />1101
      </div>

      {/* TOP BAR: Level, Street Cred, Navigation Tabs, Capacity & Eurodollar/KRW */}
      <header className="cp77-topbar">
        <div className="cp77-top-stats">
          <div className="cp77-level-block">
            <div className="cp77-level-row">
              <strong>{loadoutStats.closetLevel}</strong>
              <span>레벨</span>
            </div>
            <div className="cp77-cyan-progress">
              <div style={{ width: `${Math.min(100, loadoutStats.closetLevel * 2)}%` }} />
            </div>
          </div>

          <div className="cp77-level-block">
            <div className="cp77-level-row">
              <strong>{loadoutStats.colorSync}</strong>
              <span>스타일 평판</span>
            </div>
            <div className="cp77-cyan-progress">
              <div style={{ width: `${loadoutStats.colorSync}%` }} />
            </div>
          </div>
        </div>

        <nav className="cp77-top-tabs" aria-label="인벤토리 상단 탭">
          <span className="cp77-key-hint">1</span>
          <button
            type="button"
            className="cp77-top-tab"
            onClick={() => onOpenProfileModal && onOpenProfileModal()}
          >
            사이버웨어
          </button>
          <button
            type="button"
            className="cp77-top-tab active"
            onClick={() => {
              setSelectedSlot('all');
              if (engineRef.current) engineRef.current.focusOnSlot('all');
            }}
          >
            인벤토리
          </button>
          <button
            type="button"
            className="cp77-top-tab"
            onClick={() => setHeadMode((m) => (m === 'avatar' ? 'mannequin' : 'avatar'))}
          >
            캐릭터 ({headMode === 'avatar' ? '아바타' : '마네킹'})
          </button>
          <button
            type="button"
            className="cp77-top-tab"
            onClick={() => handleSlotClick('outer')}
          >
            코디북
          </button>
          <button
            type="button"
            className="cp77-top-tab"
            onClick={() => setShowStatusDrawer((s) => !s)}
          >
            일지
          </button>
          <span className="cp77-key-hint">3</span>
        </nav>

        <div className="cp77-top-resources">
          <span className="cp77-weight-pill" title="장착된 부위 / 전체 11슬롯">
            BAG {loadoutStats.equippedCount}/11
          </span>
          <span className="cp77-money-pill" title="현재 장착 코디 총 가치">
            <em>€$</em> {formatKRW(loadoutStats.totalValue)}
          </span>
        </div>
      </header>

      {/* MAIN 3-COLUMN STAGE (Exact Cyberpunk 2077 Inventory Layout) */}
      <div className="cp77-main-grid">
        {/* LEFT COLUMN: 무기(주력 코디 3종) / 사이버웨어(체형·컬러) / 퀵 액세스 */}
        <div className="cp77-col-left">
          <div className="cp77-section-block">
            <h4 className="cp77-section-title">주력 코디</h4>
            <div className="cp77-weapon-stack">
              {renderWideWeaponSlot('outer', '아우터', '=')}
              {renderWideWeaponSlot('top', '상의', '||')}
              {renderWideWeaponSlot('bottom', '하의', '//')}
            </div>
          </div>

          <div className="cp77-section-block">
            <h4 className="cp77-section-title">사이버웨어</h4>
            <div className="cp77-cyberware-row">
              <button
                type="button"
                className="cp77-square-slot cyberware"
                style={{ '--rarity-color': '#b829ff' }}
                onClick={() => onOpenProfileModal && onOpenProfileModal()}
                title="클릭하여 7체형 및 스리사이즈 설정"
              >
                <span className="cp77-rarity-strip" />
                <div className="cp77-socket-dots" aria-hidden="true">
                  <span className="dot filled" />
                  <span className="dot filled" />
                </div>
                <div className="cp77-cyberware-body">
                  <strong>{anatomical.shapeShortKo}</strong>
                  <small>
                    {anatomical.chestCm}-{anatomical.waistCm}-{anatomical.hipCm}cm
                  </small>
                </div>
                <span className="cp77-corner-hanger">
                  <Sparkles size={11} />
                </span>
              </button>

              <button
                type="button"
                className="cp77-square-slot cyberware"
                style={{ '--rarity-color': '#10b981' }}
                onClick={() => onOpenProfileModal && onOpenProfileModal()}
                title="클릭하여 퍼스널컬러 재진단"
              >
                <span className="cp77-rarity-strip" />
                <div className="cp77-cyberware-body">
                  <span
                    className="cp77-skin-orb"
                    style={{
                      background:
                        userProfile?.skinToneHex || userProfile?.skin_tone_hex || '#DEC2A7',
                    }}
                  />
                  <strong>{userProfile?.personalColorLabel || '가을 웜톤'}</strong>
                  <small>SYNC {loadoutStats.colorSync}%</small>
                </div>
                <span className="cp77-corner-hanger">
                  <HangerIcon />
                </span>
              </button>

              <button
                type="button"
                className="cp77-square-slot cyberware"
                style={{ '--rarity-color': '#00b8ff' }}
                onClick={() => setShowStatusDrawer((s) => !s)}
                title="방한 및 방수 실드 스펙"
              >
                <span className="cp77-rarity-strip" />
                <div className="cp77-cyberware-body">
                  <strong>방한 {loadoutStats.thermalDefense}</strong>
                  <small>방수 {loadoutStats.hydroShield}%</small>
                </div>
                <span className="cp77-corner-hanger">
                  <HangerIcon />
                </span>
              </button>
            </div>
          </div>

          <div className="cp77-section-block">
            <h4 className="cp77-section-title">퀵 액세스</h4>
            <div className="cp77-quick-row">
              {renderSquareGearSlot('underwear', '이너웨어', 1)}
              {renderSquareGearSlot('socks', '양말', 2)}
              {renderSquareGearSlot('gloves', '장갑', 3)}
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: Frameless Full-Body 3D Character / Mannequin */}
        <div className="cp77-col-center">
          <canvas
            ref={canvasRef}
            width={440}
            height={540}
            className="cp77-character-canvas"
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />

          {/* Floating Character Controls */}
          <div className="cp77-character-controls">
            <div className="cp77-angle-bar">
              <button
                type="button"
                className={`cp77-mini-btn ${Math.round(rotationDeg) === 0 ? 'active' : ''}`}
                onClick={() => handleRotatePreset(0)}
              >
                정면
              </button>
              <button
                type="button"
                className={`cp77-mini-btn ${Math.round(rotationDeg) === 40 ? 'active' : ''}`}
                onClick={() => handleRotatePreset(40)}
              >
                측면 45°
              </button>
              <button
                type="button"
                className={`cp77-mini-btn ${Math.round(rotationDeg) === 180 ? 'active' : ''}`}
                onClick={() => handleRotatePreset(180)}
              >
                후면
              </button>
              <button
                type="button"
                className="cp77-mini-btn"
                onClick={() =>
                  setHeadMode((m) => (m === 'avatar' ? 'mannequin' : 'avatar'))
                }
                title="아바타 헤드 / 조각상 마네킹 헤드 전환"
              >
                {headMode === 'avatar' ? <UserCheck size={12} /> : <User size={12} />}
                <span>{headMode === 'avatar' ? '아바타 헤드' : '마네킹 헤드'}</span>
              </button>
              {selectedSlot !== 'all' && (
                <button
                  type="button"
                  className="cp77-mini-btn accent"
                  onClick={() => {
                    setSelectedSlot('all');
                    if (engineRef.current) engineRef.current.focusOnSlot('all');
                  }}
                >
                  <RotateCcw size={11} /> 전신 보기
                </button>
              )}
            </div>
          </div>

          {showStatusDrawer && (
            <div className="cp77-status-overlay">
              <div className="cp77-status-title">CHARACTER // STATUS TELEMETRY</div>
              <div className="cp77-status-row">
                <span>체형 스펙</span>
                <strong>
                  {anatomical.shapeShortKo} ({anatomical.heightCm}cm · {anatomical.weightKg}kg)
                </strong>
              </div>
              <div className="cp77-status-row">
                <span>스리사이즈 / 머리둘레</span>
                <strong>
                  {anatomical.chestCm}-{anatomical.waistCm}-{anatomical.hipCm}cm (두위{' '}
                  {anatomical.headCm}cm)
                </strong>
              </div>
              <div className="cp77-status-row">
                <span>방한 방어력 / 방수 실드</span>
                <strong>
                  {loadoutStats.thermalDefense} PTS / {loadoutStats.hydroShield}%
                </strong>
              </div>
              <div className="cp77-status-row">
                <span>포멀 지수 / 평균 1회 착용비용(CPW)</span>
                <strong>
                  {loadoutStats.formalSpec} PTS / {formatKRW(loadoutStats.avgCpw)}
                </strong>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: 머리(2) + 상체(2) / 하체(2) + 복장(Tall) / 관련 항목(3) */}
        <div className="cp77-col-right">
          {/* Upper Right: 머리 & 상체 */}
          <div className="cp77-equip-duo">
            <div className="cp77-equip-group">
              <h4 className="cp77-section-title">머리</h4>
              <div className="cp77-slot-pair">
                {renderSquareGearSlot('headwear', '모자 · 헤드웨어')}
                {renderSquareGearSlot('neckwear', '목도리 · 스카프')}
              </div>
            </div>

            <div className="cp77-equip-group">
              <h4 className="cp77-section-title">상체</h4>
              <div className="cp77-slot-pair">
                {renderSquareGearSlot('outer', '아우터 · 외투')}
                {renderSquareGearSlot('top', '상의 · 니트/셔츠')}
              </div>
            </div>
          </div>

          {/* Middle Right: 하체 & 복장(Tall Slot) */}
          <div className="cp77-equip-duo">
            <div className="cp77-equip-group">
              <h4 className="cp77-section-title">하체</h4>
              <div className="cp77-slot-pair">
                {renderSquareGearSlot('bottom', '하의 · 팬츠')}
                {renderSquareGearSlot('shoes', '신발 · 슈즈')}
              </div>
            </div>

            <div className="cp77-equip-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h4 className="cp77-section-title">복장</h4>
                <button
                  type="button"
                  className="cp77-suit-switch"
                  onClick={() =>
                    setSuitSlotMode((m) => (m === 'dress' ? 'accessory' : 'dress'))
                  }
                >
                  {suitSlotMode === 'dress' ? '원피스' : '가방·액세'} ↻
                </button>
              </div>

              <button
                type="button"
                className={`cp77-tall-suit-slot ${selectedSlot === suitSlotMode ? 'active' : ''}`}
                style={{ '--rarity-color': getRarityBarColor(suitItem, '#00b8ff') }}
                onClick={() => handleSlotClick(suitSlotMode)}
                onMouseEnter={() => setHoveredSlot(suitSlotMode)}
                onMouseLeave={() => setHoveredSlot(null)}
              >
                <span className="cp77-rarity-strip" />
                <div className="cp77-socket-dots" aria-hidden="true">
                  <span className="dot filled" />
                  <span className="dot" />
                </div>

                {suitItem ? (
                  <div className="cp77-tall-suit-img">
                    <StudioGarmentImage
                      item={suitItem}
                      style={{ width: '100%', height: '100%', borderRadius: 4 }}
                    />
                    <span className="cp77-slot-caption">{suitItem.name}</span>
                  </div>
                ) : (
                  <div className="cp77-tall-suit-empty">
                    <FullSuitSilhouette />
                    <span>{suitSlotMode === 'dress' ? '올인원 · 원피스' : '가방 · 액세서리'}</span>
                  </div>
                )}

                <span className="cp77-corner-hanger">
                  <em className="cp77-quick-num">1</em>
                  <HangerIcon />
                </span>
              </button>
            </div>
          </div>

          {/* Bottom Right: 관련 항목 (3 Angled Cyberpunk Buttons) */}
          <div className="cp77-related-block">
            <h4 className="cp77-section-title">관련 항목</h4>
            <div className="cp77-related-list">
              <button
                type="button"
                className="cp77-related-btn"
                onClick={() => handleSlotClick(selectedSlot === 'all' ? 'outer' : selectedSlot)}
              >
                <span className="cp77-diamond-icon">◇</span>
                <span>배낭 (11부위 코디 인스펙터)</span>
              </button>
              <button
                type="button"
                className="cp77-related-btn"
                onClick={() => onOpenProfileModal && onOpenProfileModal()}
              >
                <span className="cp77-diamond-icon">◇</span>
                <span>제작 (7체형 · 퍼스널컬러 설정)</span>
              </button>
              <button
                type="button"
                className="cp77-related-btn"
                onClick={() => setShowStatusDrawer((s) => !s)}
              >
                <span className="cp77-diamond-icon">▽</span>
                <span>스테이터스 (방한 · CPW 리포트)</span>
              </button>
            </div>
            <div className="cp77-protocol-foot">
              <span>NEURONET PROTOCOL 0896_5 // A-INVENTORY</span>
              <button
                type="button"
                className="cp77-esc-btn"
                onClick={() => {
                  setSelectedSlot('all');
                  setShowStatusDrawer(false);
                  handleRotatePreset(0);
                  if (engineRef.current) engineRef.current.focusOnSlot('all');
                }}
              >
                <em>ESC</em> 초기화
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
