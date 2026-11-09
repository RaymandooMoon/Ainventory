import { useEffect, useRef, useState } from 'react';
import { Heart, Plus, Search, Shirt, Trash2, Upload, X } from 'lucide-react';
import {
  CATEGORIES,
  COLOR_PALETTE,
  SUBCATEGORIES_BY_CAT,
  apiFetch,
  computeItemTier,
  formatKRW,
} from '../utils/api.js';
import { processUploadedImage } from '../utils/imageTools.js';
import StudioGarmentImage from './StudioGarmentImage.jsx';

export default function WardrobeView({ activeCloset, refreshKey, onClosetUpdated, showToast }) {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [garments, setGarments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Add Garment Form State
  const fileRef = useRef(null);
  const [formOwner, setFormOwner] = useState(activeCloset === 'all' ? 'husband' : activeCloset);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('top');
  const [formSub, setFormSub] = useState('knit');
  const [formColorName, setFormColorName] = useState('네이비');
  const [formColorHex, setFormColorHex] = useState('#1D273B');
  const [formBrand, setFormBrand] = useState('');
  const [formPrice, setFormPrice] = useState(89000);
  const [formMinTemp, setFormMinTemp] = useState(8);
  const [formMaxTemp, setFormMaxTemp] = useState(20);
  const [formWaterResistant, setFormWaterResistant] = useState(false);
  const [formNotes, setFormNotes] = useState('');
  const [formImageData, setFormImageData] = useState('');

  const loadGarments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        closet: activeCloset,
        category,
        q: query,
      });
      const res = await apiFetch(`/garments?${params.toString()}`);
      setGarments(res.garments || []);
    } catch (err) {
      showToast(err.message || '옷장 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGarments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCloset, category, query, refreshKey]);

  const handleToggleFavorite = async (g) => {
    try {
      await apiFetch(`/garments/${g.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_favorite: !g.is_favorite }),
      });
      loadGarments();
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleToggleLaundry = async (g) => {
    const next = g.status === 'laundry' ? 'active' : 'laundry';
    try {
      await apiFetch(`/garments/${g.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      loadGarments();
      onClosetUpdated?.();
      showToast(
        next === 'laundry'
          ? `'${g.name}' 세탁중 변경 (내일 코디 추천에서 자동 제외됩니다)`
          : `'${g.name}' 보관중으로 복귀되었습니다.`
      );
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleWearIncrement = async (g) => {
    try {
      await apiFetch(`/garments/${g.id}/wear`, { method: 'POST' });
      loadGarments();
      onClosetUpdated?.();
      showToast(`'${g.name}' 착용 +1 기록 완료!`);
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleDelete = async (g) => {
    if (!window.confirm(`'${g.name}' 아이템을 옷장에서 삭제할까요?`)) return;
    try {
      await apiFetch(`/garments/${g.id}`, { method: 'DELETE' });
      loadGarments();
      onClosetUpdated?.();
      showToast('옷장에서 삭제되었습니다.');
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleModalImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const processed = await processUploadedImage(file);
      setFormImageData(processed.dataUrl);
      setFormColorName(processed.matchedColor.name);
      setFormColorHex(processed.detectedHex);
      showToast(`사진에서 '${processed.matchedColor.name}' 색상이 자동 감지되었습니다.`);
    } catch (err) {
      showToast(err.message);
    }
  };

  const handleCreateGarment = async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/garments', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: formOwner,
          name: formName,
          category: formCategory,
          subcategory: formSub,
          color_name: formColorName,
          color_hex: formColorHex,
          brand: formBrand,
          price: Number(formPrice) || 0,
          min_temp: Number(formMinTemp),
          max_temp: Number(formMaxTemp),
          water_resistant: formWaterResistant,
          notes: formNotes,
          image_data: formImageData || undefined,
        }),
      });
      setModalOpen(false);
      setFormName('');
      setFormBrand('');
      setFormNotes('');
      setFormImageData('');
      loadGarments();
      onClosetUpdated?.();
      showToast('새 옷이 옷장에 등록되었습니다.');
    } catch (err) {
      showToast(err.message || '등록에 실패했습니다.');
    }
  };

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>디지털 옷장 ({garments.length}벌 · 11부위 스튜디오 팩샷)</h1>
          <p className="page-subtitle">
            머리(헤드웨어)부터 발끝(슈즈·삭스·이너웨어)까지 11개 장착 부위별 스튜디오 팩샷과 아이템 등급(Tier), CPW를 관리하세요.
          </p>
        </div>

        <button
          id="open-add-garment-btn"
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setFormOwner(activeCloset === 'all' ? 'husband' : activeCloset);
            setModalOpen(true);
          }}
        >
          <Plus size={17} /> 새 옷 등록하기
        </button>
      </header>

      <div className="toolbar-row">
        <div className="filter-chips">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              id={`wardrobe-cat-${c.value}`}
              type="button"
              className={`chip ${category === c.value ? 'active' : ''}`}
              onClick={() => setCategory(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="search-box">
          <Search size={16} />
          <input
            id="wardrobe-search-input"
            className="text-input"
            placeholder="이름, 브랜드, 컬러 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="section-card">옷장을 불러오는 중입니다...</div>
      ) : garments.length === 0 ? (
        <div className="section-card" style={{ textAlign: 'center', padding: 48 }}>
          <Shirt size={32} style={{ margin: '0 auto 10px', color: 'var(--ink-muted)' }} />
          <h3>조건에 맞는 아이템이 없습니다</h3>
          <p style={{ color: 'var(--ink-secondary)', marginTop: 6 }}>
            다른 카테고리를 선택하거나 새 옷을 등록해보세요.
          </p>
        </div>
      ) : (
        <div className="wardrobe-grid">
          {garments.map((g) => {
            const tierInfo = computeItemTier(g);
            return (
              <article key={g.id} className="garment-card">
                <div className="garment-img-wrap">
                  <StudioGarmentImage
                    item={g}
                    style={{ width: '100%', height: '100%' }}
                  />
                  <div className="garment-top-badges">
                    <span
                      className="owner-pill"
                      style={{
                        borderLeft: `3px solid ${tierInfo.color}`,
                      }}
                    >
                      {tierInfo.tier} · {g.category.toUpperCase()}
                    </span>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {g.status === 'laundry' && <span className="status-pill laundry">세탁중</span>}
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ width: 30, height: 30, borderRadius: '50%' }}
                        aria-label="즐겨찾기"
                        onClick={() => handleToggleFavorite(g)}
                      >
                        <Heart
                          size={14}
                          fill={g.is_favorite ? '#A2422A' : 'none'}
                          color={g.is_favorite ? '#A2422A' : 'currentColor'}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="garment-body">
                  <span className="garment-brand">{g.brand || 'Personal Archive'}</span>
                  <h3 className="garment-title">{g.name}</h3>

                  <div className="garment-meta">
                    <span
                      className="color-dot"
                      style={{ width: 13, height: 13, backgroundColor: g.color_hex }}
                    />
                    <span>{g.color_name}</span>
                    <span>·</span>
                    <span>
                      {g.min_temp}°~{g.max_temp}°C
                    </span>
                    {g.water_resistant && <span>· 발수</span>}
                  </div>

                  <div className="garment-stats-bar">
                    <div>
                      <strong>{g.wear_count}회</strong> 착용 · CPW{' '}
                      <strong>{formatKRW(g.cpw)}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => handleWearIncrement(g)}
                    >
                      +1 착용
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleToggleLaundry(g)}
                    >
                      {g.status === 'laundry' ? '세탁완료' : '세탁중'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-label="삭제"
                      onClick={() => handleDelete(g)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>새 옷 등록하기 (11부위 지원)</h2>
              <button type="button" className="icon-btn" onClick={() => setModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateGarment}>
              <div
                className="photo-dropzone"
                style={{ minHeight: 170 }}
                onClick={() => fileRef.current?.click()}
              >
                {formImageData ? (
                  <img src={formImageData} alt="새 옷 미리보기" style={{ maxHeight: 200 }} />
                ) : (
                  <div>
                    <Upload size={24} style={{ margin: '0 auto 6px' }} />
                    <strong>옷 사진 촬영 또는 파일 선택 (미선택 시 부위별 실사 팩샷 자동 배정)</strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginTop: 4 }}>
                      업로드 시 대표 색상을 자동으로 감지합니다
                    </div>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleModalImage}
              />

              <div className="form-grid-2">
                <div className="field-group">
                  <label className="field-label">옷장 키</label>
                  <input
                    className="text-input"
                    value={formOwner}
                    onChange={(e) => setFormOwner(e.target.value)}
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">브랜드</label>
                  <input
                    className="text-input"
                    placeholder="예: COS, ARKET, 무신사 스탠다드"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                  />
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">아이템 이름 *</label>
                <input
                  className="text-input"
                  placeholder="예: 메리노 울 브이넥 니트"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                />
              </div>

              <div className="form-grid-2">
                <div className="field-group">
                  <label className="field-label">착용 부위 (11개 슬롯)</label>
                  <select
                    className="select-input"
                    value={formCategory}
                    onChange={(e) => {
                      const next = e.target.value;
                      setFormCategory(next);
                      setFormSub(SUBCATEGORIES_BY_CAT[next]?.[0]?.value || 'knit');
                    }}
                  >
                    {CATEGORIES.filter((c) => c.value !== 'all').map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field-group">
                  <label className="field-label">세부 종류</label>
                  <select
                    className="select-input"
                    value={formSub}
                    onChange={(e) => setFormSub(e.target.value)}
                  >
                    {(SUBCATEGORIES_BY_CAT[formCategory] || []).map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-grid-2">
                <div className="field-group">
                  <label className="field-label">대표 컬러</label>
                  <select
                    className="select-input"
                    value={formColorName}
                    onChange={(e) => {
                      const found = COLOR_PALETTE.find((c) => c.name === e.target.value);
                      setFormColorName(e.target.value);
                      if (found) setFormColorHex(found.hex);
                    }}
                  >
                    {COLOR_PALETTE.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field-group">
                  <label className="field-label">구매 가격 (원)</label>
                  <input
                    className="text-input"
                    type="number"
                    min="0"
                    step="1000"
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="field-group">
                  <label className="field-label">적정 최저 기온 (°C)</label>
                  <input
                    className="text-input"
                    type="number"
                    value={formMinTemp}
                    onChange={(e) => setFormMinTemp(e.target.value)}
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">적정 최고 기온 (°C)</label>
                  <input
                    className="text-input"
                    type="number"
                    value={formMaxTemp}
                    onChange={(e) => setFormMaxTemp(e.target.value)}
                  />
                </div>
              </div>

              <div className="field-group">
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formWaterResistant}
                    onChange={(e) => setFormWaterResistant(e.target.checked)}
                  />
                  <span style={{ fontSize: '0.88rem' }}>
                    생활 발수 · 비 오는 날 착용 적합 소재
                  </span>
                </label>
              </div>

              <div className="field-group">
                <label className="field-label">메모 (핏 · 소재 · 세탁 팁)</label>
                <input
                  className="text-input"
                  placeholder="예: 세미 오버핏, 드라이클리닝 권장"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                />
              </div>

              <button type="submit" className="btn btn-primary btn-full">
                디지털 옷장에 저장하기
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
