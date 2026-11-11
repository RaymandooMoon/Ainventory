import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CloudRain,
  Hand,
  Layers,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Umbrella,
  Wind,
  X,
} from 'lucide-react';
import { Mannequin3DWebGLEngine } from '../utils/mannequin3DRenderer.js';
import { pushBackHandler, triggerHaptic } from '../utils/nativeBridge.js';
import Mannequin2DCollageFallback from './Mannequin2DCollageFallback.jsx';
import StudioGarmentImage from './StudioGarmentImage.jsx';

export const LEFT_HUD_SLOTS = [
  { key: 'headwear', no: '01', label: '모자 · 헤드웨어', group: 'HEAD & NECK' },
  { key: 'neckwear', no: '02', label: '머플러 · 넥타이', group: 'HEAD & NECK' },
  { key: 'outer', no: '03', label: '아우터 · 코트', group: 'UPPERLAYERS' },
  { key: 'top', no: '04', label: '상의 · 니트/셔츠', group: 'UPPERLAYERS' },
  { key: 'gloves', no: '05', label: '장갑 · 핸드웨어', group: 'HANDS' },
  { key: 'accessory', no: '06', label: '가방 · 서류가방', group: 'CARRY & ACC' },
];

export const RIGHT_HUD_SLOTS = [
  { key: 'dress', no: '07', label: '원피스 · 셋업', group: 'FULL SILHOUETTE' },
  { key: 'bottom', no: '08', label: '하의 · 팬츠/스커트', group: 'LOWERWARE' },
  { key: 'underwear', no: '09', label: '언더웨어 · 이너', group: 'INNER BASE' },
  { key: 'socks', no: '10', label: '양말 · 레그웨어', group: 'FEET & LEGS' },
  { key: 'shoes', no: '11', label: '신발 · 구두/부츠', group: 'FEET & LEGS' },
];

export const ALL_11_SLOTS = [...LEFT_HUD_SLOTS, ...RIGHT_HUD_SLOTS];

const MOTION_CYCLE = [
  { key: 'auto', label: '자동 모션' },
  { key: 'idle', label: '자연 호흡' },
  { key: 'walk', label: '워킹' },
  { key: 'wind', label: '강풍 바람' },
  { key: 'wave', label: '인사' },
  { key: 'umbrella', label: '우산' },
];

/**
 * Lightweight 3D WebGL preview used inside the Profile & Personal Color calibration modal
 */
export function Mannequin3DBodyPreview({ profile = {}, rotDeg = -16, height = 270 }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    let engine = null;
    try {
      engine = new Mannequin3DWebGLEngine(canvasRef.current, { previewOnly: true });
      engine.setDarkTheme(document.documentElement.getAttribute('data-theme') === 'dark');
      engineRef.current = engine;
    } catch {
      engineRef.current = null;
    }
    return () => {
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.setYaw(rotDeg, true);
    eng.setMotionMode('idle');
    eng.updateScene({ profile, loadoutBySlot: {} });
  }, [profile, rotDeg]);

  return (
    <canvas
      ref={canvasRef}
      className="atl-body-preview"
      style={{
        width: Math.round(height * 0.72),
        height,
        cursor: 'grab',
        touchAction: 'none',
      }}
    />
  );
}

/**
 * Apple HIG 3D Mannequin Viewport + Collapsible Swipe-Up Wardrobe Drawer (Reqs 6.c-d, 7.b, 9.b-c, 12.b, 13.a, 15.b)
 */
export default function VirtualMannequin({
  outfit,
  loadoutBySlot: propLoadoutBySlot = null,
  allGarments = [],
  closetGarments = [],
  personalColor = 'autumn_warm',
  userProfile = null,
  weather = null,
  immersiveStudio = false,
  compact = false,
  onOpenWeatherSheet,
  onOpenProfileModal,
  onOpenBodySetup,
  onOpenAccountSettings,
  onSaveOutfitLog,
  onSlotSwap,
  onSwapSlotItem,
  onUnequipSlot,
  emptyClosetOverlay = null,
}) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const canvasDragRef = useRef({ active: false, startX: 0, lastX: 0, moved: false });
  const drawerDragRef = useRef({ active: false, startY: 0, moved: false, deltaY: 0 });

  const [focusedSlot, setFocusedSlot] = useState(null);
  const [activeDrawerSlot, setActiveDrawerSlot] = useState('outer');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerDragOffset, setDrawerDragOffset] = useState(0);
  const [motionMode, setMotionMode] = useState('auto');
  const [fallback2DMode, setFallback2DMode] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [savedCheck, setSavedCheck] = useState(false);

  const effectiveGarments = allGarments?.length ? allGarments : closetGarments;
  const effectiveOpenProfile = onOpenProfileModal || onOpenBodySetup;
  const effectiveSlotSwap = onSlotSwap || onSwapSlotItem;
  const effectiveUnequipSlot =
    onUnequipSlot || (onSwapSlotItem ? (slotKey) => onSwapSlotItem(slotKey, null) : null);

  // Hardware back closes expanded drawer first
  useEffect(() => {
    if (!drawerOpen) return undefined;
    return pushBackHandler(() => {
      setDrawerOpen(false);
      return true;
    });
  }, [drawerOpen]);

  // Normalize outfit items or direct loadoutBySlot into 11 distinct body slots
  const loadoutBySlot = useMemo(() => {
    if (propLoadoutBySlot && typeof propLoadoutBySlot === 'object') {
      return {
        headwear: propLoadoutBySlot.headwear || null,
        neckwear: propLoadoutBySlot.neckwear || null,
        outer: propLoadoutBySlot.outer || null,
        top: propLoadoutBySlot.top || null,
        dress: propLoadoutBySlot.dress || null,
        bottom: propLoadoutBySlot.bottom || null,
        gloves: propLoadoutBySlot.gloves || null,
        underwear: propLoadoutBySlot.underwear || null,
        socks: propLoadoutBySlot.socks || null,
        shoes: propLoadoutBySlot.shoes || null,
        accessory: propLoadoutBySlot.accessory || null,
      };
    }
    const items = outfit?.items || [];
    const byCat = {};
    for (const item of items) {
      if (!item) continue;
      const cat = item.slot_key || item.category;
      if (cat && !byCat[cat]) {
        byCat[cat] = item;
      }
      if (item.category === 'bag' && !byCat.accessory) {
        byCat.accessory = item;
      }
    }
    return {
      headwear: byCat.headwear || null,
      neckwear: byCat.neckwear || null,
      outer: byCat.outer || null,
      top: byCat.top || null,
      dress: byCat.dress || null,
      bottom: byCat.bottom || null,
      gloves: byCat.gloves || null,
      underwear: byCat.underwear || null,
      socks: byCat.socks || null,
      shoes: byCat.shoes || null,
      accessory: byCat.accessory || null,
    };
  }, [outfit, propLoadoutBySlot]);

  const equippedCount = useMemo(
    () => ALL_11_SLOTS.filter((s) => Boolean(loadoutBySlot[s.key])).length,
    [loadoutBySlot]
  );

  const profilePayload = useMemo(
    () => ({
      gender: userProfile?.gender || 'male',
      height_cm: userProfile?.heightCm || 175,
      weight_kg: userProfile?.weightKg || 68,
      body_shape: userProfile?.bodyShape || 'standard_balanced',
      body_fat_pct: userProfile?.bodyFatPct ?? null,
      chest_cm: userProfile?.chestCm ?? null,
      waist_cm: userProfile?.waistCm ?? null,
      hip_cm: userProfile?.hipCm ?? null,
      head_cm: userProfile?.headCm ?? null,
      skin_tone_hex: userProfile?.skinToneHex || null,
      mannequinModelColorHex: userProfile?.mannequinModelColorHex || null,
      mannequinBriefsColorHex: userProfile?.mannequinBriefsColorHex || null,
      personal_color: userProfile?.personalColor || personalColor || 'autumn_warm',
    }),
    [userProfile, personalColor]
  );

  // Mount Three.js WebGL Engine & observe Light/Dark theme + context loss
  useEffect(() => {
    if (fallback2DMode || !canvasRef.current) return undefined;
    let engine = null;
    try {
      engine = new Mannequin3DWebGLEngine(canvasRef.current, {
        exposeDebugGlobal: true,
        onContextStatusChange: ({ lost, status }) => {
          setContextLost(Boolean(lost ?? status === 'lost'));
        },
      });
      engine.setDarkTheme(document.documentElement.getAttribute('data-theme') === 'dark');
      engineRef.current = engine;
    } catch {
      setFallback2DMode(true);
    }

    const observer = new MutationObserver(() => {
      const dark = document.documentElement.getAttribute('data-theme') === 'dark';
      engineRef.current?.setDarkTheme(dark);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      observer.disconnect();
      engine?.dispose();
      engineRef.current = null;
    };
  }, [fallback2DMode]);

  // Sync profile + 11-slot garments
  useEffect(() => {
    engineRef.current?.updateScene({ profile: profilePayload, loadoutBySlot });
  }, [profilePayload, loadoutBySlot]);

  // Sync focused zoom slot
  useEffect(() => {
    engineRef.current?.setFocusedSlot(focusedSlot || null);
  }, [focusedSlot]);

  // Sync live weather & motion mode (Req 7.b — rainy/snowy triggers umbrella motion automatically)
  useEffect(() => {
    engineRef.current?.setWeatherState(weather);
    engineRef.current?.setMotionMode(motionMode);
  }, [weather, motionMode]);

  // Strict Canvas-Only Rotation Gesture (Zero interference with Bottom Drawer Swipe — Req 15.b)
  const onCanvasPointerDown = (e) => {
    if (e.target !== canvasRef.current) return;
    canvasDragRef.current = { active: true, startX: e.clientX, lastX: e.clientX, moved: false };
    canvasRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onCanvasPointerMove = (e) => {
    if (!canvasDragRef.current.active) return;
    const dx = e.clientX - canvasDragRef.current.lastX;
    if (Math.abs(e.clientX - canvasDragRef.current.startX) > 4) {
      canvasDragRef.current.moved = true;
    }
    canvasDragRef.current.lastX = e.clientX;
    if (engineRef.current) {
      const next = engineRef.current.targetYawDeg + dx * 0.58;
      engineRef.current.setYaw(next, false);
    }
  };

  const onCanvasPointerUp = (e) => {
    if (!canvasDragRef.current.active) return;
    const wasMoved = canvasDragRef.current.moved;
    canvasDragRef.current.active = false;
    try {
      canvasRef.current?.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    if (!wasMoved && engineRef.current) {
      const hitSlot = engineRef.current.hitTestClientPoint?.(e.clientX, e.clientY);
      if (hitSlot) {
        setActiveDrawerSlot(hitSlot);
      }
    }
  };

  // Strict Bottom Wardrobe Drawer Swipe Gesture (Isolated from 3D Canvas — Req 12.b, 13.a, 15.b)
  const stopBubble = (e) => {
    e.stopPropagation();
  };

  const onDrawerHandlePointerDown = (e) => {
    e.stopPropagation();
    const y = e.touches?.[0]?.clientY ?? e.clientY ?? 0;
    drawerDragRef.current = { active: true, startY: y, moved: false, deltaY: 0 };
    e.currentTarget?.setPointerCapture?.(e.pointerId);
  };

  const onDrawerHandlePointerMove = (e) => {
    e.stopPropagation();
    if (!drawerDragRef.current.active) return;
    const y = e.touches?.[0]?.clientY ?? e.clientY ?? 0;
    const dy = y - drawerDragRef.current.startY;
    if (Math.abs(dy) > 5) drawerDragRef.current.moved = true;
    drawerDragRef.current.deltaY = dy;
    setDrawerDragOffset(dy);
  };

  const onDrawerHandlePointerUp = (e) => {
    e.stopPropagation();
    if (!drawerDragRef.current.active) return;
    const { moved, deltaY } = drawerDragRef.current;
    drawerDragRef.current.active = false;
    setDrawerDragOffset(0);
    try {
      e.currentTarget?.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }

    if (!moved) {
      triggerHaptic('selection');
      setDrawerOpen((prev) => !prev);
      return;
    }

    if (deltaY < -24) {
      triggerHaptic('selection');
      setDrawerOpen(true);
    } else if (deltaY > 24) {
      triggerHaptic('selection');
      setDrawerOpen(false);
    }
  };

  const candidatesForActiveSlot = useMemo(() => {
    return (effectiveGarments || []).filter((g) => {
      if (activeDrawerSlot === 'accessory') {
        return g.category === 'accessory' || g.category === 'bag' || g.slot_key === 'accessory';
      }
      return (g.slot_key || g.category) === activeDrawerSlot;
    });
  }, [effectiveGarments, activeDrawerSlot]);

  const cycleMotionMode = () => {
    const idx = MOTION_CYCLE.findIndex((m) => m.key === motionMode);
    const next = MOTION_CYCLE[(idx + 1) % MOTION_CYCLE.length];
    triggerHaptic('selection');
    setMotionMode(next.key);
  };

  // Immersive Full-Bleed 3D Studio Layout (>= 85% Clear Viewport — Req 12.b)
  if (immersiveStudio) {
    const tempVal = weather?.tempC ?? weather?.avgTemp ?? weather?.tempMax ?? 14;
    const cityLabel = weather?.city || weather?.cityName || '서울';
    const condLabel = weather?.condition || '맑음';
    const windVal = Number(weather?.windSpeed || 0);
    const isWindyWeather = Boolean(weather?.isWindy) || windVal >= 22 || motionMode === 'wind';
    const currentSlotEquipped = loadoutBySlot[activeDrawerSlot];

    return (
      <section className="hig-studio-screen" aria-label="3D 마네킹 스튜디오">
        {/* Top Ultra-Compact Weather · Temp Capsule (1 Item Only — Req 12.b) */}
        <div className="hig-studio-top-bar">
          <button
            id="studio-weather-capsule"
            type="button"
            className="hig-weather-capsule hig-vibrancy-capsule tabular-nums"
            aria-label="날씨 및 AI 코디 추천 열기"
            onClick={() => {
              triggerHaptic('selection');
              onOpenWeatherSheet?.();
            }}
          >
            {weather?.isRainy ? (
              <CloudRain size={14} />
            ) : isWindyWeather ? (
              <Wind size={14} />
            ) : null}
            <span>
              {cityLabel} · {condLabel} {tempVal}°
              {isWindyWeather && windVal > 0 ? ` · ${Math.round(windVal)}km/h` : ''}
            </span>
          </button>
        </div>

        {/* 85%+ Unobstructed Mannequin Viewport */}
        <div className="hig-studio-viewport">
          {!fallback2DMode && (
            <canvas
              id="studio-3d-canvas"
              ref={canvasRef}
              className="hig-studio-canvas"
              aria-label="3D 아틀리에 마네킹 캔버스"
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerCancel={onCanvasPointerUp}
            />
          )}

          {(fallback2DMode || contextLost) && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 5,
                background: 'var(--bg-canvas)',
              }}
            >
              <Mannequin2DCollageFallback
                loadoutBySlot={loadoutBySlot}
                reasonLabel={
                  contextLost
                    ? 'WebGL 컨텍스트 자동 복구 중 · 2D 콜라주 뷰'
                    : '저전력 2D 콜라주 뷰어'
                }
                onSelectSlot={(slotKey) => {
                  setActiveDrawerSlot(slotKey);
                  setDrawerOpen(true);
                }}
                onRestore3D={
                  fallback2DMode
                    ? () => {
                        triggerHaptic('light');
                        setFallback2DMode(false);
                      }
                    : null
                }
              />
            </div>
          )}
        </div>

        {/* Empty Closet Onboarding Floating Card for Newly Registered Users (Req 8.a) */}
        {emptyClosetOverlay}

        {/* Minimal Floating Action Icons (Right Rail — Req 12.b) */}
        <div
          className="hig-studio-float-rail"
          style={{
            opacity: drawerOpen ? 0 : 1,
            pointerEvents: drawerOpen ? 'none' : 'auto',
            transition: 'opacity 0.24s var(--spring-ease)',
          }}
        >
          <button
            id="studio-motion-cycle-btn"
            type="button"
            className={`hig-float-icon-btn ${motionMode !== 'auto' ? 'active' : ''}`}
            aria-label={`마네킹 모션 전환 (${motionMode})`}
            title="모션 전환 (자동/호흡/워킹/강풍/인사/우산)"
            onClick={cycleMotionMode}
          >
            {motionMode === 'umbrella' || (motionMode === 'auto' && weather?.isRainy) ? (
              <Umbrella size={17} />
            ) : motionMode === 'wind' ||
              (motionMode === 'auto' && !weather?.isRainy && isWindyWeather) ? (
              <Wind size={17} />
            ) : motionMode === 'wave' ? (
              <Hand size={17} />
            ) : (
              <Play size={16} />
            )}
          </button>

          {focusedSlot && (
            <button
              id="studio-reset-zoom-btn"
              type="button"
              className="hig-float-icon-btn active"
              aria-label="전신 뷰 복귀"
              title="전신 뷰 복귀"
              onClick={() => {
                triggerHaptic('selection');
                setFocusedSlot(null);
              }}
            >
              <RotateCcw size={16} />
            </button>
          )}

          <button
            id="toggle-2d-fallback-btn"
            type="button"
            className={`hig-float-icon-btn ${fallback2DMode ? 'active' : ''}`}
            aria-label="2D 3D 뷰어 전환"
            title="2D 콜라주 / 3D 마네킹 전환"
            onClick={() => {
              triggerHaptic('selection');
              setFallback2DMode((v) => !v);
            }}
          >
            <Layers size={16} />
          </button>

          {onSaveOutfitLog && (
            <button
              id="studio-save-ootd-btn"
              type="button"
              className={`hig-float-icon-btn ${savedCheck ? 'active' : ''}`}
              aria-label="오늘의 OOTD 기록 저장"
              title="오늘의 OOTD 기록 저장"
              onClick={async () => {
                triggerHaptic('medium');
                await onSaveOutfitLog();
                setSavedCheck(true);
                setTimeout(() => setSavedCheck(false), 1200);
              }}
            >
              <Check size={17} />
            </button>
          )}

          <button
            id="studio-open-profile-btn"
            type="button"
            className="hig-float-icon-btn"
            aria-label="체형 및 퍼스널컬러 설정"
            title="체형 및 퍼스널컬러 설정"
            onClick={() => {
              triggerHaptic('selection');
              effectiveOpenProfile?.(1);
            }}
          >
            <Sparkles size={16} />
          </button>

          {onOpenAccountSettings && (
            <button
              id="studio-open-settings-btn"
              type="button"
              className="hig-float-icon-btn"
              aria-label="계정 및 화면 설정"
              title="계정 및 화면 설정"
              onClick={() => {
                triggerHaptic('selection');
                onOpenAccountSettings();
              }}
            >
              <SlidersHorizontal size={16} />
            </button>
          )}
        </div>

        {/* Collapsible Swipe-Up Wardrobe Drawer (Bottom — Req 12.b, 13.a, 15.b) */}
        <div
          id="studio-wardrobe-drawer"
          className={`hig-wardrobe-drawer ${drawerOpen ? 'expanded' : 'collapsed'}`}
          data-drawer-state={drawerOpen ? 'expanded' : 'collapsed'}
          style={
            drawerDragOffset !== 0
              ? {
                  transition: 'none',
                  transform: drawerOpen
                    ? `translateY(${Math.max(0, drawerDragOffset)}px)`
                    : `translateY(calc(100% - 52px + ${Math.min(0, drawerDragOffset)}px))`,
                }
              : undefined
          }
          onPointerDown={stopBubble}
          onPointerMove={stopBubble}
          onPointerUp={stopBubble}
          onTouchStart={stopBubble}
          onTouchMove={stopBubble}
          onTouchEnd={stopBubble}
        >
          <div
            id="studio-drawer-handle"
            role="button"
            tabIndex={0}
            aria-expanded={drawerOpen}
            aria-label="옷장 드로어 열기 및 닫기 핸들"
            className="hig-drawer-handle-bar"
            onPointerDown={onDrawerHandlePointerDown}
            onPointerMove={onDrawerHandlePointerMove}
            onPointerUp={onDrawerHandlePointerUp}
            onPointerCancel={onDrawerHandlePointerUp}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDrawerOpen((v) => !v);
              }
            }}
          >
            <span className="hig-drawer-pill" aria-hidden="true" />
            <span className="hig-caption tabular-nums" style={{ fontSize: '0.74rem' }}>
              옷장 슬롯 · 장착 {equippedCount}점
            </span>
          </div>

          <div className="hig-drawer-body">
            {/* 11-Slot Selector Chips */}
            <div className="ui-chip-rail" role="tablist" aria-label="11부위 착용 슬롯">
              {ALL_11_SLOTS.map((slot) => {
                const isSelected = activeDrawerSlot === slot.key;
                const hasItem = Boolean(loadoutBySlot[slot.key]);
                return (
                  <button
                    key={slot.key}
                    id={`drawer-slot-chip-${slot.key}`}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    className={`chip ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      triggerHaptic('selection');
                      setActiveDrawerSlot(slot.key);
                      setFocusedSlot(slot.key);
                    }}
                  >
                    <span>{slot.label.split(' · ')[0]}</span>
                    {hasItem && <span className="tabular-nums">•</span>}
                  </button>
                );
              })}
            </div>

            {/* Cutout Garment Quick-Swap & 1-Tap Unequip Strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))',
                gap: 8,
              }}
            >
              {currentSlotEquipped && effectiveUnequipSlot && (
                <button
                  id="drawer-unequip-slot-btn"
                  type="button"
                  aria-label="현재 부위 벗기"
                  onClick={() => {
                    triggerHaptic('light');
                    effectiveUnequipSlot(activeDrawerSlot);
                  }}
                  style={{
                    aspectRatio: '1 / 1',
                    borderRadius: 16,
                    background: 'var(--bg-canvas)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <X size={16} />
                  <span className="hig-caption" style={{ fontSize: '0.68rem' }}>
                    벗기
                  </span>
                </button>
              )}

              {candidatesForActiveSlot.map((cand) => {
                const equipped = currentSlotEquipped?.id === cand.id;
                return (
                  <button
                    key={cand.id}
                    type="button"
                    className="drawer-garment-tile"
                    aria-label={`${cand.name} 착용`}
                    onClick={() => {
                      triggerHaptic('light');
                      effectiveSlotSwap?.(activeDrawerSlot, cand);
                    }}
                    style={{
                      position: 'relative',
                      aspectRatio: '1 / 1',
                      borderRadius: 16,
                      padding: 6,
                      background: equipped ? 'var(--bg-subtle)' : 'var(--bg-canvas)',
                      overflow: 'hidden',
                    }}
                  >
                    <StudioGarmentImage
                      item={cand}
                      alt={cand.name}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                    {equipped && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          background: 'var(--accent-mono)',
                          color: 'var(--ink-inverse)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Check size={11} strokeWidth={2.8} />
                      </span>
                    )}
                  </button>
                );
              })}

              {candidatesForActiveSlot.length === 0 && (
                <div
                  className="hig-caption"
                  style={{ gridColumn: '1 / -1', padding: '12px 4px' }}
                >
                  이 슬롯에 등록된 의류가 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Compact Embedded Stage (Used inside OutfitStudioView Mix & Match)
  return (
    <section
      className={`atl-fitting ${compact ? 'compact' : ''}`}
      style={{ borderRadius: 24, padding: 16 }}
      aria-label="3D 코디 프리뷰"
    >
      <div
        className="atl-stage"
        style={{
          background: 'var(--bg-canvas)',
          border: 'none',
          borderRadius: 20,
          minHeight: compact ? 420 : 480,
        }}
      >
        <canvas
          ref={canvasRef}
          className="atl-stage-canvas"
          style={{ height: compact ? 420 : 480, touchAction: 'none' }}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
        />

        <div className="atl-stage-controls">
          <button
            type="button"
            className="chip"
            onClick={cycleMotionMode}
          >
            모션: {MOTION_CYCLE.find((m) => m.key === motionMode)?.label}
          </button>
          {focusedSlot && (
            <button
              type="button"
              className="chip active"
              onClick={() => setFocusedSlot(null)}
            >
              <RotateCcw size={12} /> 전신 보기
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
