import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Lock,
  Shuffle,
  Trash2,
  Unlock,
} from 'lucide-react';
import { apiFetch } from '../utils/api.js';

export default function OutfitStudioView({ activeCloset, refreshKey, showToast }) {
  const closetOwner = activeCloset === 'all' ? 'husband' : activeCloset;
  const [garments, setGarments] = useState([]);
  const [outfits, setOutfits] = useState([]);

  const [includeOuter, setIncludeOuter] = useState(true);
  const [indices, setIndices] = useState({ outer: 0, top: 0, bottom: 0, shoes: 0 });
  const [locked, setLocked] = useState({ outer: false, top: false, bottom: false, shoes: false });

  const [title, setTitle] = useState('');
  const [occasion, setOccasion] = useState('출근룩');
  const [memo, setMemo] = useState('');

  const loadStudioData = async () => {
    try {
      const [gRes, oRes] = await Promise.all([
        apiFetch(`/garments?closet=${closetOwner}`),
        apiFetch(`/outfits?closet=${closetOwner}`),
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
    outer: garments.filter((g) => g.category === 'outer'),
    top: garments.filter((g) => g.category === 'top'),
    bottom: garments.filter((g) => g.category === 'bottom'),
    shoes: garments.filter((g) => g.category === 'shoes'),
  };

  const stepSlot = (slot, delta) => {
    const len = pools[slot].length;
    if (len === 0) return;
    setIndices((prev) => ({
      ...prev,
      [slot]: (prev[slot] + delta + len) % len,
    }));
  };

  const handleShuffle = () => {
    setIndices((prev) => {
      const next = { ...prev };
      ['outer', 'top', 'bottom', 'shoes'].forEach((slot) => {
        const len = pools[slot].length;
        if (!locked[slot] && len > 1) {
          let rand = Math.floor(Math.random() * len);
          if (rand === prev[slot]) rand = (rand + 1) % len;
          next[slot] = rand;
        }
      });
      return next;
    });
  };

  const pickedItems = [
    includeOuter && pools.outer[indices.outer % Math.max(1, pools.outer.length)],
    pools.top[indices.top % Math.max(1, pools.top.length)],
    pools.bottom[indices.bottom % Math.max(1, pools.bottom.length)],
    pools.shoes[indices.shoes % Math.max(1, pools.shoes.length)],
  ].filter(Boolean);

  const handleSaveLook = async (e) => {
    e.preventDefault();
    if (pickedItems.length < 2) {
      showToast('최소 2개 이상의 아이템이 필요합니다.');
      return;
    }
    try {
      await apiFetch('/outfits', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: closetOwner,
          title: title.trim() || `${occasion} 코디 조합`,
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
    const list = pools[slotKey];
    const current = list[indices[slotKey] % Math.max(1, list.length)];
    if (!current) {
      return (
        <div key={slotKey} className="slot-row">
          <div style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>{slotLabel} 없음</div>
        </div>
      );
    }

    return (
      <div key={slotKey} className="slot-row">
        <img src={current.image_url} alt={current.name} />
        <div>
          <span style={{ fontSize: '0.74rem', color: 'var(--ink-muted)', fontWeight: 600 }}>
            {slotLabel} · {current.color_name}
          </span>
          <strong style={{ display: 'block', fontSize: '0.92rem', margin: '2px 0' }}>
            {current.name}
          </strong>
          <span style={{ fontSize: '0.78rem', color: 'var(--ink-secondary)' }}>
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
        </div>
      </div>
    );
  };

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>코디 스튜디오 & 룩북</h1>
          <p className="page-subtitle">
            웨어링(Whering) 스타일의 슬롯 매칭 보드입니다. 입을 옷 하나를 잠금(Lock)한 뒤 나머지를 셔플해 새로운 조합을 발견하세요.
          </p>
        </div>
      </header>

      <div className="studio-split">
        <section className="slot-machine-card">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <h3 style={{ fontSize: '1.05rem' }}>Dress Me 조합 보드</h3>
            <label style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={includeOuter}
                onChange={(e) => setIncludeOuter(e.target.checked)}
              />
              아우터 포함
            </label>
          </div>

          {includeOuter && renderSlotRow('outer', '아우터')}
          {renderSlotRow('top', '상의')}
          {renderSlotRow('bottom', '하의')}
          {renderSlotRow('shoes', '신발')}

          <button
            id="dress-me-shuffle-btn"
            type="button"
            className="btn btn-secondary btn-full"
            style={{ margin: '8px 0 18px' }}
            onClick={handleShuffle}
          >
            <Shuffle size={16} /> 잠기지 않은 슬롯 랜덤 매칭 (Shuffle)
          </button>

          <form onSubmit={handleSaveLook} style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: 16 }}>
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
                placeholder="예: 소매 롤업해서 시계 포인트 주기"
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
                        <img src={item.image_url} alt={item.name} />
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
    </div>
  );
}
