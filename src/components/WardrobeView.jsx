import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Crop, Heart, Plus, Search, Shirt, Sparkles, Trash2, Upload, X } from 'lucide-react';
import {
  CATEGORIES,
  COLOR_PALETTE,
  SUBCATEGORIES_BY_CAT,
  apiFetch,
  computeItemTier,
  formatKRW,
} from '../utils/api.js';
import { infer3DRegistrationSpec } from '../utils/garment3DPhysicsSpecs.js';
import { inferFabricMaterialSpec } from '../utils/mannequin3DRenderer.js';
import {
  EmptyStateBox,
  HorizontalChipRail,
  KpiMetricStrip,
  PageHeader,
} from './common/AppUI.jsx';
import SmartPhotoCropEditorModal from './SmartPhotoCropEditorModal.jsx';
import StudioGarmentImage from './StudioGarmentImage.jsx';

export default function WardrobeView({ activeCloset, refreshKey, onClosetUpdated, showToast }) {
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [garments, setGarments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Add Garment + Camera + Immediate Photo Crop Editor State
  const fileRef = useRef(null);
  const cameraInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [liveCamOpen, setLiveCamOpen] = useState(false);
  const [rawUploadSource, setRawUploadSource] = useState('');
  const [cropEditorOpen, setCropEditorOpen] = useState(false);

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

  const stopLiveCam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setLiveCamOpen(false);
  };

  useEffect(() => {
    if (!modalOpen) stopLiveCam();
    return () => stopLiveCam();
  }, [modalOpen]);

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

  // GetWardrobe & Acloset KPI Analytics
  const kpiItems = useMemo(() => {
    if (!garments.length) return [];
    const totalVal = garments.reduce((s, g) => s + (Number(g.price) || 0), 0);
    const totalWears = garments.reduce((s, g) => s + (Number(g.wear_count) || 0), 0);
    const avgCpw = totalWears > 0 ? Math.round(totalVal / totalWears) : 0;
    const wornCount = garments.filter((g) => Number(g.wear_count) > 0).length;
    const utilRate = Math.round((wornCount / garments.length) * 100);
    const laundryCount = garments.filter((g) => g.status === 'laundry').length;
    return [
      { key: 'count', label: '보유 아카이브', value: `${garments.length}점`, sub: `세탁중 ${laundryCount}점` },
      { key: 'val', label: '옷장 자산 총액', value: formatKRW(totalVal), sub: 'GetWardrobe 가치 지표' },
      { key: 'cpw', label: '평균 1회 착용단가 (CPW)', value: formatKRW(avgCpw), sub: `누적 착용 ${totalWears}회` },
      { key: 'util', label: '옷장 실활용률', value: `${utilRate}%`, sub: `${wornCount}/${garments.length}점 활성 착용` },
    ];
  }, [garments]);

  // Live 3D Archetype & Jiggle Physics Preview for whatever item user is registering!
  const live3DSpec = useMemo(
    () =>
      infer3DRegistrationSpec({
        name: formName,
        category: formCategory,
        subcategory: formSub,
      }),
    [formName, formCategory, formSub]
  );
  const liveFabricSpec = useMemo(
    () =>
      inferFabricMaterialSpec({
        name: formName,
        category: live3DSpec.category,
        subcategory: live3DSpec.subcategory,
      }),
    [formName, live3DSpec]
  );

  // Auto-sync category/subcategory when user types clear item keywords (e.g. "서류가방", "캐시미어 머플러")
  const handleNameChange = (val) => {
    setFormName(val);
    const inferred = infer3DRegistrationSpec({ name: val, category: '', subcategory: '' });
    if (inferred && val.trim().length >= 2) {
      if (
        /서류가방|브리프케이스|토트|쇼퍼|머플러|목도리|넥타이|트렌치|코트|스커트|장갑|시계|벨트|안경/i.test(val)
      ) {
        setFormCategory(inferred.category);
        setFormSub(inferred.subcategory);
      }
    }
  };

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

  // Workflow Reorder (Req 4): Uploading a file or taking a photo IMMEDIATELY opens SmartPhotoCropEditorModal!
  const handleModalImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopLiveCam();
    const reader = new FileReader();
    reader.onload = () => {
      setRawUploadSource(reader.result);
      setCropEditorOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const startLiveCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 960 }, height: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      setLiveCamOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      cameraInputRef.current?.click();
    }
  };

  const snapLiveCameraFrame = () => {
    if (!videoRef.current || !videoRef.current.videoWidth) return;
    const vw = videoRef.current.videoWidth;
    const vh = videoRef.current.videoHeight;
    const c = document.createElement('canvas');
    c.width = vw;
    c.height = vh;
    c.getContext('2d').drawImage(videoRef.current, 0, 0, vw, vh);
    const dataUrl = c.toDataURL('image/jpeg', 0.92);
    stopLiveCam();
    setRawUploadSource(dataUrl);
    // Immediately open Photo Crop Editor right after taking photo!
    setCropEditorOpen(true);
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
      setRawUploadSource('');
      loadGarments();
      onClosetUpdated?.();
      showToast('새 옷이 3D 아키텍처 매핑과 함께 옷장에 등록되었습니다.');
    } catch (err) {
      showToast(err.message || '등록에 실패했습니다.');
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="ACLOSET STUDIO PACKSHOT · GETWARDROBE CPW ANALYTICS"
        title={`디지털 옷장 (${garments.length}벌 · 11부위 실사 팩샷)`}
        subtitle="전신샷 크롭 에디터, 스튜디오 배경 정돈, CPW(1회 착용단가)와 3D 지글 피직스 자동 매핑을 지원합니다."
        actions={
          <button
            id="open-add-garment-btn"
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setFormOwner(activeCloset === 'all' ? 'husband' : activeCloset);
              setModalOpen(true);
            }}
          >
            <Plus size={17} /> 새 옷 · 액세서리 등록
          </button>
        }
      />

      <KpiMetricStrip items={kpiItems} />

      <div className="toolbar-row">
        <HorizontalChipRail ariaLabel="카테고리 필터" className="wardrobe-cat-rail">
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
        </HorizontalChipRail>

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
        <EmptyStateBox
          icon={<Shirt size={30} />}
          title="조건에 맞는 아이템이 없습니다"
          description="다른 카테고리를 선택하거나 새 옷·가방·액세서리를 등록해보세요."
        />
      ) : (
        <div className="wardrobe-grid">
          {garments.map((g) => {
            const tierInfo = computeItemTier(g);
            const phys = infer3DRegistrationSpec(g);
            return (
              <article key={g.id} className="garment-card">
                <div className="garment-img-wrap">
                  <StudioGarmentImage item={g} style={{ width: '100%', height: '100%' }} />
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
                        style={{ width: 32, height: 32, borderRadius: '50%' }}
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
                    {phys.physicsKey !== 'rigid_fitted' && <span>· 3D피직스</span>}
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
        <div className="modal-backdrop ui-sheet-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal-box ui-sheet-box" onClick={(e) => e.stopPropagation()}>
            <div className="ui-sheet-drag-handle" aria-hidden="true" />
            <div className="modal-header">
              <div>
                <span className="rec-tag" style={{ marginBottom: 4, display: 'inline-block' }}>
                  SMART CROP + 3D PHYSICS ARCHETYPE
                </span>
                <h2>새 옷 · 액세서리 등록 (11부위)</h2>
              </div>
              <button type="button" className="icon-btn" onClick={() => setModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateGarment}>
              {liveCamOpen ? (
                <div
                  style={{
                    background: '#141820',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 14,
                    textAlign: 'center',
                  }}
                >
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    style={{ width: '100%', maxHeight: 280, borderRadius: 8, objectFit: 'cover' }}
                  />
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={stopLiveCam}>
                      취소
                    </button>
                    <button
                      id="wardrobe-snap-camera-btn"
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={snapLiveCameraFrame}
                    >
                      <Camera size={15} /> 촬영 후 바로 포토에디터 실행
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  <div
                    className="photo-dropzone"
                    style={{ minHeight: 165, marginBottom: 8 }}
                    onClick={() => fileRef.current?.click()}
                  >
                    {formImageData ? (
                      <img
                        src={formImageData}
                        alt="크롭된 새 옷 미리보기"
                        style={{ maxHeight: 200, borderRadius: 8 }}
                      />
                    ) : (
                      <div>
                        <Upload size={24} style={{ margin: '0 auto 6px' }} />
                        <strong>전신샷 · 의류 사진 업로드 (업로드 즉시 포토에디터 크롭 실행)</strong>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginTop: 4 }}>
                          전신 사진에서도 원하는 옷·가방 부위만 자연스럽게 크롭할 수 있습니다
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                      onClick={startLiveCamera}
                    >
                      <Camera size={14} /> 카메라 촬영 → 포토에디터
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => fileRef.current?.click()}
                    >
                      <Upload size={14} /> 전신샷 · 앨범 선택 → 포토에디터
                    </button>
                    {(rawUploadSource || formImageData) && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setCropEditorOpen(true)}
                      >
                        <Crop size={14} /> 다시 크롭
                      </button>
                    )}
                  </div>
                </div>
              )}

              <input
                ref={fileRef}
                id="wardrobe-upload-input"
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleModalImage}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={handleModalImage}
              />

              {/* Live 3D Modeling & Jiggle Physics Registration Preview */}
              <div
                style={{
                  background: 'var(--bg-subtle)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  marginBottom: 14,
                  fontSize: '0.81rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <Sparkles size={14} />
                  <strong>3D 모델링 · 지글 피직스 자동 매핑:</strong>
                  <span className="rec-tag">{live3DSpec.preset.labelKo}</span>
                </div>
                <div style={{ color: 'var(--ink-secondary)' }}>
                  재질 PBR: <strong>{liveFabricSpec.labelKo}</strong> · {live3DSpec.preset.descriptionKo}
                </div>
              </div>

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
                    placeholder="예: COS, ARKET, TUMI"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                  />
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">아이템 이름 * (예: 가죽 서류가방, 캐시미어 머플러)</label>
                <input
                  className="text-input"
                  placeholder="예: 이탈리안 레더 서류가방 / 캐시미어 프린지 머플러"
                  value={formName}
                  onChange={(e) => handleNameChange(e.target.value)}
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

      <SmartPhotoCropEditorModal
        open={cropEditorOpen}
        imageSource={rawUploadSource || formImageData}
        mode="garment"
        title="새 옷 · 전신샷 부위 크롭 & 스튜디오 배경 에디터"
        onClose={() => setCropEditorOpen(false)}
        onApply={(cropped) => {
          setFormImageData(cropped.dataUrl);
          setFormColorName(cropped.matchedColor.name);
          setFormColorHex(cropped.detectedHex);
          setCropEditorOpen(false);
          showToast(`포토에디터 크롭 완료! '${cropped.matchedColor.name}' 색상이 자동 추출되었습니다.`);
        }}
      />
    </div>
  );
}
