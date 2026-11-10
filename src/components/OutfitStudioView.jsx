import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Lock,
  Shuffle,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { apiFetch } from '../utils/api.js';
import { PageHeader } from './common/AppUI.jsx';
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

export default function OutfitStudioView({
  user,
  activeCloset,
  refreshKey,
  onOpenProfileModal,
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
  // Tracks explicitly unequipped slots (e.g. taking off gloves, outer, headwear)
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
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorSlot, setInspectorSlot] = useState('outer');

  const loadStudioData = async () => {
    try {
      const [gRes, oRes] = await Promise.all([
        apiFetch(`/garments?closet=${encodeURIComponent(closetOwner)}`),
        apiFetch(`/outfits?closet=${encodeURIComponent(closetOwner)}`),
      ]);
      setGarments((gRes.garments || []).filter((g) => g.status === 'active'));
      setOutfits(oRes.outfits || []);
    } catch (err) {
      showToast(err.message || '코디 데이터를 불러오지 못했습니다.');
    }
  };

  useEffect(() => {
    loadStudioData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closetOwner, refreshKey]);

  const pools = {
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
  };

  const stepSlot = (slot, delta) => {
    const len = (pools[slot] || []).length;
    if (len === 0) return;
    setUnequipped((prev) => ({ ...prev, [slot]: false }));
    setIndices((prev) => ({
      ...prev,
      [slot]: ((prev[slot] || 0) + delta + len) % len,
    }));
  };

  const handleShuffle = () => {
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
  };

  const getSlotItem = (slotKey) => {
    if (unequipped[slotKey]) return null;
    const list = pools[slotKey] || [];
    if (list.length === 0) return null;
    return list[(indices[slotKey] || 0) % list.length];
  };

  const loadoutBySlot = {
    headwear: getSlotItem('headwear'),
    neckwear: getSlotItem('neckwear'),
    outer: getSlotItem('outer'),
    top: getSlotItem('top'),
    bottom: getSlotItem('bottom'),
    dress: unequipped.dress !== false ? null : getSlotItem('dress'),
    gloves: getSlotItem('gloves'),
    underwear: getSlotItem('underwear'),
    socks: getSlotItem('socks'),
    shoes: getSlotItem('shoes'),
    accessory: getSlotItem('accessory'),
  };

  const pickedItems = Object.values(loadoutBySlot).filter(Boolean);

  // Supports both equipping a specific item AND unequipping (`newItem === null`)!
  const handleConfirmSwap = (slotKey, newItem) => {
    if (!newItem) {
      setUnequipped((prev) => ({ ...prev, [slotKey]: true }));
      showToast(`[${slotKey}] 부위 의류를 벗었습니다.`);
      return;
    }
    const list = pools[slotKey] || [];
    const foundIdx = list.findIndex((g) => g.id === newItem.id);
    setUnequipped((prev) => ({ ...prev, [slotKey]: false }));
    if (foundIdx >= 0) {
      setIndices((prev) => ({ ...prev, [slotKey]: foundIdx }));
    }
    showToast(`'${newItem.name}' 아이템이 3D 마네킹에 장착되었습니다.`);
  };

  const handleSaveLook = async (e) => {
    e?.preventDefault?.();
    if (pickedItems.length < 2) {
      showToast('최소 2개 이상의 아이템이 필요합니다.');
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
      showToast('룩북에 새 코디가 저장되었습니다.');
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleDeleteOutfit = async (id) => {
    try {
      await apiFetch(`/outfits/${id}`, { method: 'DELETE' });
      loadStudioData();
      showToast('코디가 삭제되었습니다.');
    } catch (err) {
      showToast(err.message);
    }
  };

  const renderSlotRow = (slotKey, slotLabel) => {
    const list = pools[slotKey] || [];
    const current = getSlotItem(slotKey);

    if (list.length === 0) {
      return (
        <div key={slotKey} className="slot-row">
          <div style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>{slotLabel} 보유 아이템 없음</div>
        </div>
      );
    }

    if (!current) {
      return (
        <div key={slotKey} className="slot-row" style={{ gridTemplateColumns: '1fr auto' }}>
          <div style={{ fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
            <strong>{slotLabel}</strong> · 현재 미착용 (벗은 상태)
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setUnequipped((prev) => ({ ...prev, [slotKey]: false }))}
          >
            다시 입히기
          </button>
        </div>
      );
    }

    return (
      <div key={slotKey} className="slot-row">
        <StudioGarmentImage item={current} style={{ width: 56, height: 72, borderRadius: 8 }} />
        <div>
          <span style={{ fontSize: '0.73rem', color: 'var(--ink-muted)', fontWeight: 600 }}>
            {slotLabel} · {current.color_name}
          </span>
          <strong style={{ display: 'block', fontSize: '0.90rem', margin: '2px 0' }}>
            {current.name}
          </strong>
          <span style={{ fontSize: '0.76rem', color: 'var(--ink-secondary)' }}>
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
            onClick={() => setLocked((p) => ({ ...p, [slotKey]: !p[slotKey] }))}
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

  return (
    <div>
      <PageHeader
        eyebrow="WHERING DRESS ME · 3D LIVE STYLING"
        title="코디 스튜디오 & 3D Dress Me 룩북"
        subtitle="부위별 잠금(Lock)·셔플·원클릭 벗기와 실시간 3D 모션/지글 피직스를 확인하며 나만의 룩북을 완성하세요."
        actions={
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setInspectorSlot('outer');
              setInspectorOpen(true);
            }}
          >
            <Layers size={16} /> 11부위 전체 코디 인스펙터
          </button>
        }
      />

      <div style={{ marginBottom: 26 }}>
        <VirtualMannequin
          userProfile={user}
          loadoutBySlot={loadoutBySlot}
          closetGarments={garments}
          title="Dress Me · 3D 라이브 피팅"
          onOpenBodySetup={(stepNum) => onOpenProfileModal?.(stepNum)}
          onSwapSlotItem={handleConfirmSwap}
          onOpenInspector={(slotKey) => {
            setInspectorSlot(slotKey || 'outer');
            setInspectorOpen(true);
          }}
        />
      </div>

      <div className="studio-split">
        <section className="slot-machine-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <h3 style={{ fontSize: '1.05rem' }}>Dress Me 8대 핵심 슬롯 컨트롤러</h3>
            <button
              id="dress-me-shuffle-btn"
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleShuffle}
            >
              <Shuffle size={14} /> 잠금 제외 랜덤 셔플
            </button>
          </div>

          {DRESS_ME_SLOTS.map((s) => renderSlotRow(s.key, s.label))}

          <form
            onSubmit={handleSaveLook}
            style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: 16, marginTop: 14 }}
          >
            <div className="form-grid-2">
              <div className="field-group">
                <label className="field-label">코디 제목</label>
                <input
                  className="text-input"
                  placeholder="예: 금요일 세미 캐주얼"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="field-group">
                <label className="field-label">상황 태그</label>
                <select
                  className="select-input"
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

            <div className="field-group">
              <label className="field-label">스타일링 메모</label>
              <input
                className="text-input"
                placeholder="예: 서류가방 + 트렌치 매칭"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary btn-full">
              현재 조합을 룩북에 저장
            </button>
          </form>
        </section>

        <section>
          <h3 style={{ marginBottom: 14, fontSize: '1.08rem' }}>
            저장된 코디 룩북 ({outfits.length}개)
          </h3>

          <div className="recs-grid">
            {outfits.map((o) => (
              <article key={o.id} className="rec-card">
                <div>
                  <div className="rec-card-top">
                    <span className="rec-tag">{o.occasion}</span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDeleteOutfit(o.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <h3>{o.title}</h3>
                  <div className="outfit-collage">
                    {o.items.map((item) => (
                      <div key={item.id} className="collage-piece">
                        <StudioGarmentImage
                          item={item}
                          style={{ width: '100%', aspectRatio: '3 / 4', borderRadius: 6 }}
                        />
                        <span>{item.name}</span>
                      </div>
                    ))}
                  </div>
                  {o.memo && <p className="rec-rationale">{o.memo}</p>}
                </div>
                <div
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--ink-muted)',
                    paddingTop: 10,
                    borderTop: '1px solid var(--border-hairline)',
                  }}
                >
                  누적 착용 {o.wear_count}회 {o.last_worn_date ? `· 최근 ${o.last_worn_date}` : ''}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

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
    </div>
  );
}
