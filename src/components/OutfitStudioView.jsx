import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Lock,
  Maximize2,
  Shuffle,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { apiFetch } from '../utils/api.js';
import { triggerHaptic } from '../utils/nativeBridge.js';
import { ResponsiveSheetModal } from './common/AppUI.jsx';
import OutfitInspectorModal from './OutfitInspectorModal.jsx';
import StudioGarmentImage from './StudioGarmentImage.jsx';
import VirtualMannequin from './VirtualMannequin.jsx';

const DRESS_ME_SLOTS = [
  { key: 'headwear', label: '모자' },
  { key: 'neckwear', label: '머플러·타이' },
  { key: 'outer', label: '아우터' },
  { key: 'top', label: '상의' },
  { key: 'bottom', label: '하의' },
  { key: 'gloves', label: '장갑' },
  { key: 'shoes', label: '신발' },
  { key: 'accessory', label: '가방·액세서리' },
];

/**
 * Apple HIG Full-Bleed 3D Outfit Studio & Dress Me Lookbook (Reqs 11, 12.b, 13)
 * - 85%+ clear 3D mannequin viewport with swipe-up wardrobe drawer
 * - Dress Me slot lock/shuffle & Saved Lookbooks stowed into spring BottomSheets
 */
export default function OutfitStudioView({
  user,
  activeCloset,
  refreshKey,
  paused = false,
  onOpenProfileModal,
  onClosetUpdated,
  showToast,
}) {
  const closetOwner = activeCloset === 'all' ? user?.defaultCloset || 'husband' : activeCloset;
  const [garments, setGarments] = useState([]);
  const [outfits, setOutfits] = useState([]);

  const [indices, setIndices] = useState({
    headwear: 0,
    neckwear: 0,
    outer: 0,
    top: 0,
    bottom: 0,
    gloves: 0,
    underwear: 0,
    socks: 0,
    shoes: 0,
    accessory: 0,
  });
  const [unequipped, setUnequipped] = useState({
    headwear: true,
    gloves: false,
  });
  const [locked, setLocked] = useState({
    outer: false,
    top: false,
    bottom: false,
    shoes: false,
  });

  const [title, setTitle] = useState('');
  const [occasion, setOccasion] = useState('출근룩');
  const [memo, setMemo] = useState('');
  const [dressMeSheetOpen, setDressMeSheetOpen] = useState(false);
  const [lookbookSheetOpen, setLookbookSheetOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorSlot, setInspectorSlot] = useState('outer');

  const loadStudioData = useCallback(async () => {
    try {
      const [gRes, oRes] = await Promise.all([
        apiFetch(`/garments?closet=${encodeURIComponent(closetOwner)}`),
        apiFetch(`/outfits?closet=${encodeURIComponent(closetOwner)}`),
      ]);
      setGarments((gRes.garments || []).filter((g) => g.status === 'active'));
      setOutfits(oRes.outfits || []);
    } catch (err) {
      showToast?.(err.message || '코디 데이터를 불러오지 못했습니다.');
    }
  }, [closetOwner, showToast]);

  useEffect(() => {
    loadStudioData();
  }, [loadStudioData, refreshKey]);

  const pools = useMemo(
    () => ({
      headwear: garments.filter((g) => g.category === 'headwear'),
      neckwear: garments.filter((g) => g.category === 'neckwear'),
      outer: garments.filter((g) => g.category === 'outer'),
      top: garments.filter((g) => g.category === 'top'),
      bottom: garments.filter((g) => g.category === 'bottom'),
      dress: garments.filter((g) => g.category === 'dress'),
      gloves: garments.filter((g) => g.category === 'gloves'),
      underwear: garments.filter((g) => g.category === 'underwear'),
      socks: garments.filter((g) => g.category === 'socks'),
      shoes: garments.filter((g) => g.category === 'shoes'),
      accessory: garments.filter((g) => g.category === 'accessory' || g.category === 'bag'),
    }),
    [garments]
  );

  const stepSlot = useCallback(
    (slot, delta) => {
      const len = (pools[slot] || []).length;
      if (len === 0) return;
      triggerHaptic('selection');
      setUnequipped((prev) => ({ ...prev, [slot]: false }));
      setIndices((prev) => ({
        ...prev,
        [slot]: ((prev[slot] || 0) + delta + len) % len,
      }));
    },
    [pools]
  );

  const handleShuffle = useCallback(() => {
    triggerHaptic('medium');
    setIndices((prev) => {
      const next = { ...prev };
      Object.keys(pools).forEach((slot) => {
        const len = pools[slot].length;
        if (!locked[slot] && !unequipped[slot] && len > 1) {
          let rand = Math.floor(Math.random() * len);
          if (rand === prev[slot]) rand = (rand + 1) % len;
          next[slot] = rand;
        }
      });
      return next;
    });
  }, [locked, pools, unequipped]);

  const loadoutBySlot = useMemo(() => {
    const pick = (slotKey) => {
      if (unequipped[slotKey]) return null;
      const list = pools[slotKey] || [];
      if (list.length === 0) return null;
      return list[(indices[slotKey] || 0) % list.length];
    };
    return {
      headwear: pick('headwear'),
      neckwear: pick('neckwear'),
      outer: pick('outer'),
      top: pick('top'),
      bottom: pick('bottom'),
      dress: unequipped.dress !== false ? null : pick('dress'),
      gloves: pick('gloves'),
      underwear: pick('underwear'),
      socks: pick('socks'),
      shoes: pick('shoes'),
      accessory: pick('accessory'),
    };
  }, [indices, pools, unequipped]);

  const pickedItems = useMemo(
    () => Object.values(loadoutBySlot).filter(Boolean),
    [loadoutBySlot]
  );

  const handleConfirmSwap = useCallback(
    (slotKey, newItem) => {
      if (!newItem) {
        setUnequipped((prev) => ({ ...prev, [slotKey]: true }));
        showToast?.(`[${slotKey}] 부위 의류를 벗었습니다.`);
        return;
      }
      const list = pools[slotKey] || [];
      const foundIdx = list.findIndex((g) => g.id === newItem.id);
      setUnequipped((prev) => ({ ...prev, [slotKey]: false }));
      if (foundIdx >= 0) {
        setIndices((prev) => ({ ...prev, [slotKey]: foundIdx }));
      }
      showToast?.(`'${newItem.name}' 아이템이 3D 마네킹에 장착되었습니다.`);
    },
    [pools, showToast]
  );

  const handleUnequipSlot = useCallback(
    (slotKey) => handleConfirmSwap(slotKey, null),
    [handleConfirmSwap]
  );

  const handleOpenWeatherSheet = useCallback(() => {
    setDressMeSheetOpen(true);
  }, []);

  const handleSaveLook = async (e) => {
    e?.preventDefault?.();
    if (pickedItems.length < 2) {
      showToast?.('최소 2개 이상의 아이템이 필요합니다.');
      return;
    }
    try {
      await apiFetch('/outfits', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: closetOwner,
          title: title.trim() || `${occasion} 3D 코디 조합`,
          occasion,
          season: '사계절',
          item_ids: pickedItems.map((i) => i.id),
          memo,
        }),
      });
      setTitle('');
      setMemo('');
      loadStudioData();
      onClosetUpdated?.();
      setDressMeSheetOpen(false);
      showToast?.('룩북에 새 코디가 저장되었습니다.');
    } catch (err) {
      showToast?.(err.message);
    }
  };

  const handleDeleteOutfit = async (id) => {
    try {
      await apiFetch(`/outfits/${id}`, { method: 'DELETE' });
      triggerHaptic('light');
      loadStudioData();
      onClosetUpdated?.();
      showToast?.('코디가 삭제되었습니다.');
    } catch (err) {
      showToast?.(err.message);
    }
  };

  const renderSlotRow = (slotKey, slotLabel) => {
    const list = pools[slotKey] || [];
    const current = loadoutBySlot[slotKey] || null;

    if (list.length === 0) {
      return (
        <div key={slotKey} className="slot-row" style={{ gridTemplateColumns: '1fr' }}>
          <span className="hig-caption">{slotLabel} 보유 아이템 없음</span>
        </div>
      );
    }

    if (!current) {
      return (
        <div key={slotKey} className="slot-row" style={{ gridTemplateColumns: '1fr auto' }}>
          <span className="hig-body">
            <strong>{slotLabel}</strong> · 미착용
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setUnequipped((prev) => ({ ...prev, [slotKey]: false }))}
          >
            입히기
          </button>
        </div>
      );
    }

    return (
      <div key={slotKey} className="slot-row">
        <StudioGarmentImage item={current} style={{ width: 56, height: 72, borderRadius: 8 }} />
        <div style={{ minWidth: 0 }}>
          <span className="hig-caption">
            {slotLabel} · {current.color_name}
          </span>
          <div className="hig-body" style={{ fontWeight: 600, marginTop: 4 }}>
            {current.name}
          </div>
          <span className="hig-caption tabular-nums">
            {current.brand || '내 옷장'} · 착용 {current.wear_count}회
          </span>
        </div>
        <div className="slot-controls">
          <button
            type="button"
            className="icon-btn"
            aria-label="이전 아이템"
            onClick={() => stepSlot(slotKey, -1)}
          >
            <ChevronLeft size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="다음 아이템"
            onClick={() => stepSlot(slotKey, 1)}
          >
            <ChevronRight size={15} />
          </button>
          <button
            type="button"
            className={`icon-btn ${locked[slotKey] ? 'locked' : ''}`}
            aria-label="고정 잠금"
            title={locked[slotKey] ? '잠금 해제' : '이 아이템 고정'}
            onClick={() => {
              triggerHaptic('selection');
              setLocked((p) => ({ ...p, [slotKey]: !p[slotKey] }));
            }}
          >
            {locked[slotKey] ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`${slotLabel} 벗기`}
            title={`${slotLabel} 벗기`}
            onClick={() => handleConfirmSwap(slotKey, null)}
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  };

  const floatingStudioControls = (
    <>
      <button
        id="dress-me-shuffle-btn"
        type="button"
        className="hig-float-icon-btn"
        aria-label="잠금 제외 랜덤 셔플"
        title="잠금 제외 랜덤 셔플"
        onClick={handleShuffle}
      >
        <Shuffle size={16} />
      </button>
      <button
        id="studio-open-dressme-sheet-btn"
        type="button"
        className="hig-float-icon-btn"
        aria-label="Dress Me 슬롯 잠금 및 코디 저장"
        title="Dress Me 슬롯 잠금 및 코디 저장"
        onClick={() => {
          triggerHaptic('selection');
          setDressMeSheetOpen(true);
        }}
      >
        <Lock size={16} />
      </button>
      <button
        id="studio-open-lookbook-sheet-btn"
        type="button"
        className="hig-float-icon-btn"
        aria-label="저장된 룩북 보기"
        title="저장된 룩북 보기"
        onClick={() => {
          triggerHaptic('selection');
          setLookbookSheetOpen(true);
        }}
      >
        <Bookmark size={16} />
      </button>
      <button
        id="studio-open-inspector-btn"
        type="button"
        className="hig-float-icon-btn"
        aria-label="11부위 전체 코디 인스펙터"
        title="11부위 전체 코디 인스펙터"
        onClick={() => {
          triggerHaptic('selection');
          setInspectorSlot('outer');
          setInspectorOpen(true);
        }}
      >
        <Maximize2 size={15} />
      </button>
    </>
  );

  return (
    <>
      <VirtualMannequin
        immersiveStudio
        paused={paused || dressMeSheetOpen || lookbookSheetOpen || inspectorOpen}
        userProfile={user}
        loadoutBySlot={loadoutBySlot}
        allGarments={garments}
        capsuleLabel={`코디 스튜디오 · 장착 ${pickedItems.length}점 · 룩북 ${outfits.length}`}
        onOpenWeatherSheet={handleOpenWeatherSheet}
        onOpenProfileModal={onOpenProfileModal}
        onSlotSwap={handleConfirmSwap}
        onUnequipSlot={handleUnequipSlot}
        onSaveOutfitLog={pickedItems.length >= 2 ? () => handleSaveLook() : null}
        extraFloatingActions={floatingStudioControls}
      />

      {/* Dress Me 8-Slot Lock & Lookbook Save Bottom Sheet */}
      <ResponsiveSheetModal
        id="studio-dressme-sheet"
        open={dressMeSheetOpen}
        onClose={() => setDressMeSheetOpen(false)}
        eyebrow="DRESS ME · SLOT CONTROLLER"
        title="슬롯 잠금 & 룩북 저장"
        actions={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleShuffle}
          >
            <Shuffle size={14} /> 셔플
          </button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DRESS_ME_SLOTS.map((s) => renderSlotRow(s.key, s.label))}
          </div>

          <form
            onSubmit={handleSaveLook}
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 16,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <div className="form-grid-2">
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label className="field-label" htmlFor="studio-look-title">코디 제목</label>
                <input
                  id="studio-look-title"
                  className="text-input"
                  style={{ background: 'var(--bg-canvas)' }}
                  placeholder="예: 금요일 세미 캐주얼"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="field-group" style={{ marginBottom: 0 }}>
                <label className="field-label" htmlFor="studio-look-occasion">상황 태그</label>
                <select
                  id="studio-look-occasion"
                  className="select-input"
                  style={{ background: 'var(--bg-canvas)' }}
                  value={occasion}
                  onChange={(e) => setOccasion(e.target.value)}
                >
                  <option value="출근룩">출근룩</option>
                  <option value="주말 데이트">주말 데이트</option>
                  <option value="데일리">데일리</option>
                  <option value="비 오는 날">비 오는 날</option>
                  <option value="여행">여행</option>
                </select>
              </div>
            </div>

            <div className="field-group" style={{ marginBottom: 0 }}>
              <label className="field-label" htmlFor="studio-look-memo">스타일링 메모</label>
              <input
                id="studio-look-memo"
                className="text-input"
                style={{ background: 'var(--bg-canvas)' }}
                placeholder="예: 서류가방 + 트렌치 매칭"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary btn-full">
              현재 조합을 룩북에 저장
            </button>
          </form>
        </div>
      </ResponsiveSheetModal>

      {/* Saved Outfits Lookbook Bottom Sheet */}
      <ResponsiveSheetModal
        id="studio-lookbook-sheet"
        open={lookbookSheetOpen}
        onClose={() => setLookbookSheetOpen(false)}
        eyebrow="SAVED LOOKBOOK"
        title={`저장된 코디 룩북 (${outfits.length})`}
      >
        {outfits.length === 0 ? (
          <p className="hig-caption">저장된 코디 조합이 없습니다.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {outfits.map((o) => (
              <article
                key={o.id}
                style={{
                  background: 'var(--bg-surface)',
                  borderRadius: 16,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span className="hig-caption">{o.occasion}</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="코디 삭제"
                    onClick={() => handleDeleteOutfit(o.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="hig-headline">{o.title}</div>
                <div className="outfit-collage">
                  {(o.items || []).map((item) => (
                    <div key={item.id} className="collage-piece">
                      <StudioGarmentImage
                        item={item}
                        style={{ width: '100%', aspectRatio: '3 / 4', borderRadius: 8 }}
                      />
                      <span className="hig-caption">{item.name}</span>
                    </div>
                  ))}
                </div>
                {o.memo && <p className="hig-caption">{o.memo}</p>}
                <span className="hig-caption tabular-nums">
                  누적 착용 {o.wear_count}회{o.last_worn_date ? ` · 최근 ${o.last_worn_date}` : ''}
                </span>
              </article>
            ))}
          </div>
        )}
      </ResponsiveSheetModal>

      <OutfitInspectorModal
        open={inspectorOpen}
        initialSlot={inspectorSlot}
        loadoutBySlot={loadoutBySlot}
        closetGarments={garments}
        personalColor={user?.personalColor || 'autumn_warm'}
        onConfirmSwap={handleConfirmSwap}
        onSaveOutfit={() => handleSaveLook()}
        onClose={() => setInspectorOpen(false)}
      />
    </>
  );
}
