import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  Crop,
  Heart,
  Plus,
  Search,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  FABRIC_OPTIONS,
  MANIFEST_SLOT_MAP,
} from '../utils/aiGarmentPipeline.js';
import {
  CATEGORIES,
  COLOR_PALETTE,
  SEASONS,
  SUBCATEGORIES_BY_CAT,
  apiFetch,
  formatKRW,
} from '../utils/api.js';
import {
  hasAcknowledgedCameraNotice,
  triggerHaptic,
} from '../utils/nativeBridge.js';
import SmartPhotoCropEditorModal from './SmartPhotoCropEditorModal.jsx';
import StudioGarmentImage from './StudioGarmentImage.jsx';
import {
  EmptyStateBox,
  HorizontalChipRail,
  MorphActionButton,
  PageHeader,
  PermissionNoticeModal,
  ResponsiveSheetModal,
  SkeletonWardrobeGrid,
} from './common/AppUI.jsx';

const SEASON_KO_TO_KEY = {
  봄: 'spring',
  여름: 'summer',
  가을: 'autumn',
  겨울: 'winter',
  spring: 'spring',
  summer: 'summer',
  autumn: 'autumn',
  winter: 'winter',
};

const SEASON_KEY_TO_KO = {
  spring: '봄',
  summer: '여름',
  autumn: '가을',
  winter: '겨울',
  봄: '봄',
  여름: '여름',
  가을: '가을',
  겨울: '겨울',
};

function normalizeSeasonKeys(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return ['spring', 'autumn'];
  const mapped = arr.map((s) => SEASON_KO_TO_KEY[s] || s).filter(Boolean);
  return mapped.length > 0 ? Array.from(new Set(mapped)) : ['spring', 'autumn'];
}

function matchesSeasonFilter(garmentSeasons = [], filterKey = 'all') {
  if (filterKey === 'all') return true;
  const targetKo = SEASON_KEY_TO_KO[filterKey] || filterKey;
  return (garmentSeasons || []).some((s) => s === filterKey || s === targetKo || SEASON_KO_TO_KEY[s] === filterKey);
}

/**
 * Apple HIG Progressive Disclosure Wardrobe View (Reqs 6.a-c, 8.a, 10.c, 12.c, 13.a-c)
 * - Grid tiles display ONLY background-removed garment cutout images (zero text labels, zero permanent buttons)
 * - Tap -> Detail Bottom Sheet
 * - Long-press (420ms) / ContextMenu -> Quick Action Menu Sheet
 */
export default function WardrobeView({
  activeCloset,
  user,
  refreshKey,
  onOpenSampleImport,
  onClosetUpdated,
  showToast,
}) {
  const [garments, setGarments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Progressive Disclosure Sheets
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [quickMenuItem, setQuickMenuItem] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Camera/Gallery Pre-Permission Rationale Gate (Req 10.c)
  const [pendingPickerType, setPendingPickerType] = useState(null); // 'camera' | 'gallery' | null

  // Photo Crop & AI Pipeline States
  const addCameraInputRef = useRef(null);
  const addGalleryInputRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  const [rawUploadSrc, setRawUploadSrc] = useState('');
  const [cropEditorOpen, setCropEditorOpen] = useState(false);
  const [croppedDataUrl, setCroppedDataUrl] = useState('');
  const [aiDetectedBadge, setAiDetectedBadge] = useState(null);
  const [savingAdd, setSavingAdd] = useState(false);

  const [form, setForm] = useState({
    name: '',
    owner: activeCloset === 'all' ? user?.defaultCloset || 'husband' : activeCloset,
    category: 'top',
    subcategory: 'knit',
    fabric: 'cotton',
    color_name: '네이비',
    color_hex: '#1D273B',
    brand: '',
    price: 89000,
    seasons: ['spring', 'autumn'],
    slot_key: 'top',
    base_glb: 'top_knit',
    physics_preset: 'rigid_fitted',
  });

  const loadGarments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/garments?closet=${encodeURIComponent(activeCloset)}`);
      setGarments(data.garments || []);
    } catch (err) {
      showToast?.(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeCloset, showToast]);

  useEffect(() => {
    loadGarments();
  }, [loadGarments, refreshKey]);

  const filtered = useMemo(() => {
    return garments.filter((g) => {
      if (categoryFilter !== 'all' && g.category !== categoryFilter) return false;
      if (!matchesSeasonFilter(g.seasons, seasonFilter)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${g.name} ${g.brand || ''} ${g.color_name || ''} ${g.subcategory || ''} ${g.fabric || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [garments, categoryFilter, seasonFilter, searchQuery]);

  // Request Camera / Photo Library with Mandatory Pre-Permission Rationale (Req 10.c)
  const requestPhotoPicker = (pickerType) => {
    if (!hasAcknowledgedCameraNotice()) {
      setPendingPickerType(pickerType);
      return;
    }
    if (pickerType === 'camera') {
      addCameraInputRef.current?.click();
    } else {
      addGalleryInputRef.current?.click();
    }
  };

  const handleSelectPhotoForAdd = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRawUploadSrc(String(reader.result || ''));
      setCropEditorOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Automatic WebP Cutout + AI Garment Slot/Fabric Mapping on Crop Confirm (Reqs 6.a, 6.b, 6.c)
  const handleCropConfirmed = (cropRes) => {
    setCropEditorOpen(false);
    setCroppedDataUrl(cropRes.dataUrl);

    const meta = cropRes.aiMetadata;
    if (meta) {
      const normalizedSeasons = normalizeSeasonKeys(meta.seasons);
      setForm((prev) => ({
        ...prev,
        name: prev.name.trim() ? prev.name : meta.suggestedName || prev.name,
        category: meta.category || prev.category,
        subcategory: meta.subcategory || prev.subcategory,
        fabric: meta.fabric || prev.fabric,
        color_name: meta.color_name || prev.color_name,
        color_hex: meta.color_hex || prev.color_hex,
        seasons: normalizedSeasons,
        slot_key: meta.slot_key || meta.category || prev.slot_key,
        base_glb: meta.base_glb || prev.base_glb,
        physics_preset: meta.physics_preset || prev.physics_preset,
      }));
      setAiDetectedBadge({
        format: String(cropRes.format || 'webp').toUpperCase(),
        cutoutApplied: cropRes.cutoutApplied,
        slotKey: meta.slot_key,
        baseGlb: meta.base_glb,
        physicsPreset: meta.physics_preset,
        fabricLabel: meta.fabricLabelKo || meta.fabric,
      });
    } else if (cropRes.matchedColor) {
      setForm((prev) => ({
        ...prev,
        color_name: cropRes.matchedColor.name,
        color_hex: cropRes.matchedColor.hex,
      }));
    }
    showToast?.('배경 제거(WebP) 및 AI 슬롯·소재 자동 분석 완료');
  };

  const handleToggleWear = async (item) => {
    try {
      await apiFetch(`/garments/${item.id}/wear`, { method: 'POST' });
      await loadGarments();
      onClosetUpdated?.();
      showToast?.('착용 횟수 +1 반영됨');
    } catch (err) {
      showToast?.(err.message);
    }
  };

  const handlePatchItem = async (item, patch, feedbackMsg) => {
    try {
      const res = await apiFetch(`/garments/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await loadGarments();
      if (detailItem?.id === item.id) setDetailItem(res.garment || null);
      onClosetUpdated?.();
      if (feedbackMsg) showToast?.(feedbackMsg);
    } catch (err) {
      showToast?.(err.message);
    }
  };

  const handleDelete = async (item) => {
    try {
      await apiFetch(`/garments/${item.id}`, { method: 'DELETE' });
      setDetailItem(null);
      setQuickMenuItem(null);
      await loadGarments();
      onClosetUpdated?.();
      showToast?.('의류가 삭제되었습니다');
    } catch (err) {
      showToast?.(err.message);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSavingAdd(true);
    try {
      const targetOwner =
        activeCloset === 'all' ? user?.defaultCloset || 'husband' : activeCloset;
      const mapping = MANIFEST_SLOT_MAP[form.subcategory] || {
        slotKey: form.category,
        baseGlb: `${form.category}_${form.subcategory}`,
        physicsPreset: 'rigid_fitted',
      };
      const koSeasons = (form.seasons || ['spring', 'autumn']).map(
        (s) => SEASON_KEY_TO_KO[s] || s
      );

      await apiFetch('/garments', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: targetOwner,
          name: form.name.trim(),
          category: form.category,
          subcategory: form.subcategory,
          fabric: form.fabric,
          color_name: form.color_name,
          color_hex: form.color_hex,
          brand: form.brand,
          price: Number(form.price) || 0,
          seasons: koSeasons,
          slot_key: form.slot_key || mapping.slotKey,
          base_glb: form.base_glb || mapping.baseGlb,
          physics_preset: form.physics_preset || mapping.physicsPreset,
          custom_texture: Boolean(croppedDataUrl),
          image_data: croppedDataUrl || undefined,
          image_url: croppedDataUrl ? undefined : '/seed/white-oxford.jpg',
        }),
      });

      setShowAddModal(false);
      setRawUploadSrc('');
      setCroppedDataUrl('');
      setAiDetectedBadge(null);
      setForm((prev) => ({ ...prev, name: '', brand: '' }));
      await loadGarments();
      onClosetUpdated?.();
      showToast?.('새 의류가 옷장 및 3D 슬롯에 등록되었습니다');
    } catch (err) {
      showToast?.(err.message);
    } finally {
      setSavingAdd(false);
    }
  };

  // Long-Press vs Tap Gesture Handlers on Cutout Tile (Req 12.c)
  const startTilePress = (item) => {
    longPressTriggeredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      triggerHaptic('medium');
      setQuickMenuItem(item);
    }, 420);
  };

  const cancelTilePress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTileClick = (item) => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    triggerHaptic('selection');
    setDetailItem(item);
  };

  const categoryChipItems = useMemo(() => {
    return CATEGORIES.map((cat) => ({
      key: cat.key,
      label: cat.label,
      count:
        cat.key === 'all'
          ? garments.length
          : garments.filter((g) => g.category === cat.key).length,
    }));
  }, [garments]);

  return (
    <div>
      {/* Minimal Header: Essential Count Metric + Filter Sheet + Add Action (Req 12.a & 12.c) */}
      <PageHeader
        title="옷장"
        subtitle={`${filtered.length}벌 보관 중`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              id="open-wardrobe-filter-btn"
              type="button"
              className="btn btn-secondary btn-sm"
              aria-label="옷장 검색 및 필터 열기"
              onClick={() => setFilterSheetOpen(true)}
            >
              <SlidersHorizontal size={15} />
              <span>필터</span>
            </button>
            <button
              id="open-add-garment-btn"
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setShowAddModal(true)}
            >
              <Plus size={16} />
              <span>의류 등록</span>
            </button>
          </div>
        }
      />

      <div style={{ marginBottom: 16 }}>
        <HorizontalChipRail
          items={categoryChipItems}
          activeKey={categoryFilter}
          onSelect={setCategoryFilter}
          ariaLabel="의류 카테고리 선택"
        />
      </div>

      {/* Wardrobe Content: Skeleton Shimmer -> Empty State -> Pure Cutout Grid (Req 12.c & 13.c) */}
      {loading ? (
        <SkeletonWardrobeGrid count={6} />
      ) : filtered.length === 0 ? (
        <EmptyStateBox
          icon={<Shirt size={26} />}
          title={garments.length === 0 ? '옷장이 아직 비어 있습니다' : '조건에 맞는 의류가 없습니다'}
          description={
            garments.length === 0
              ? '사진을 촬영해 배경 제거(WebP) 후 AI 자동 분류로 등록하거나, 샘플 아이템을 선택해 가져올 수 있습니다.'
              : '필터 조건을 초기화하거나 새 아이템을 추가해 보세요.'
          }
          action={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                id="wardrobe-empty-add-btn"
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowAddModal(true)}
              >
                <Plus size={15} /> 첫 의류 촬영 · 업로드
              </button>
              {!user?.isSampleDemo && garments.length === 0 && (
                <button
                  id="wardrobe-empty-import-samples-btn"
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onOpenSampleImport?.()}
                >
                  <Sparkles size={15} /> 샘플 아이템 선택 가져오기
                </button>
              )}
            </div>
          }
        />
      ) : (
        <div className="hig-cutout-grid" role="list" aria-label="옷장 의류 그리드">
          {filtered.map((item) => (
            <div
              key={item.id}
              role="listitem"
              tabIndex={0}
              aria-label={item.name}
              data-garment-id={item.id}
              className="hig-cutout-tile"
              onPointerDown={() => startTilePress(item)}
              onPointerUp={cancelTilePress}
              onPointerLeave={cancelTilePress}
              onPointerCancel={cancelTilePress}
              onClick={() => handleTileClick(item)}
              onContextMenu={(e) => {
                e.preventDefault();
                cancelTilePress();
                triggerHaptic('medium');
                setQuickMenuItem(item);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setDetailItem(item);
                }
              }}
            >
              <StudioGarmentImage item={item} alt={item.name} />
            </div>
          ))}
        </div>
      )}

      {/* Filter & Search Bottom Sheet (Progressive Disclosure — Req 12.a) */}
      <ResponsiveSheetModal
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        eyebrow="FILTER & SEARCH"
        title="옷장 검색 및 계절 필터"
        maxWidth={480}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--ink-muted)',
              }}
            />
            <input
              type="search"
              className="text-input"
              style={{ paddingLeft: 36 }}
              placeholder="아이템명, 소재, 브랜드, 컬러 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div>
            <span className="hig-caption" style={{ display: 'block', marginBottom: 8 }}>
              계절감 필터
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`chip ${seasonFilter === 'all' ? 'active' : ''}`}
                onClick={() => setSeasonFilter('all')}
              >
                사계절 전체
              </button>
              {SEASONS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={`chip ${seasonFilter === s.key ? 'active' : ''}`}
                  onClick={() => setSeasonFilter(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setCategoryFilter('all');
                setSeasonFilter('all');
                setSearchQuery('');
              }}
            >
              초기화
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setFilterSheetOpen(false)}
            >
              적용 ({filtered.length}벌)
            </button>
          </div>
        </div>
      </ResponsiveSheetModal>

      {/* Tap -> Garment Detail Bottom Sheet (Req 12.c) */}
      <ResponsiveSheetModal
        open={Boolean(detailItem)}
        onClose={() => setDetailItem(null)}
        eyebrow="GARMENT DETAILS"
        title={detailItem?.name || ''}
        maxWidth={520}
      >
        {detailItem && (
          <div id="garment-detail-sheet" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                height: 220,
                borderRadius: 20,
                background: 'var(--bg-surface)',
                padding: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <StudioGarmentImage
                item={detailItem}
                alt={detailItem.name}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 12 }}>
                <span className="hig-caption">구매가</span>
                <div className="hig-headline tabular-nums" style={{ marginTop: 4 }}>
                  {formatKRW(detailItem.price)}
                </div>
              </div>
              <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 12 }}>
                <span className="hig-caption">누적 착용</span>
                <div className="hig-headline tabular-nums" style={{ marginTop: 4 }}>
                  {detailItem.wear_count || 0}회
                </div>
              </div>
              <div style={{ background: 'var(--bg-surface)', borderRadius: 16, padding: 12 }}>
                <span className="hig-caption">1회 착용 비용</span>
                <div className="hig-headline tabular-nums" style={{ marginTop: 4 }}>
                  {formatKRW(
                    Math.round((detailItem.price || 0) / Math.max(1, detailItem.wear_count || 0))
                  )}
                </div>
              </div>
            </div>

            <div
              className="hig-caption"
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 16,
                padding: 12,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span>컬러: {detailItem.color_name}</span>
              <span>·</span>
              <span>소재: {detailItem.fabric || 'cotton'}</span>
              <span>·</span>
              <span>3D 슬롯: {detailItem.slot_key || detailItem.category}</span>
              <span>·</span>
              <span>상태: {detailItem.status === 'laundry' ? '세탁중' : '보관중'}</span>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <MorphActionButton
                id="detail-wear-plus-btn"
                className="btn btn-primary btn-sm"
                icon={<Plus size={14} />}
                label="오늘 착용 +1"
                morphedLabel="착용 기록됨"
                onClick={async () => {
                  await handleToggleWear(detailItem);
                  setDetailItem((prev) =>
                    prev ? { ...prev, wear_count: (prev.wear_count || 0) + 1 } : null
                  );
                }}
              />

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  handlePatchItem(
                    detailItem,
                    { is_favorite: !detailItem.is_favorite },
                    detailItem.is_favorite ? '즐겨찾기 해제됨' : '즐겨찾기 등록됨'
                  )
                }
              >
                <Heart size={14} />
                <span>{detailItem.is_favorite ? '즐겨찾기됨' : '즐겨찾기'}</span>
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  handlePatchItem(
                    detailItem,
                    {
                      status: detailItem.status === 'laundry' ? 'active' : 'laundry',
                    },
                    '케어 상태가 변경되었습니다'
                  )
                }
              >
                <span>{detailItem.status === 'laundry' ? '세탁 완료 전환' : '세탁 바구니 이동'}</span>
              </button>

              {!user?.isSampleDemo && (
                <button
                  id="detail-delete-garment-btn"
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleDelete(detailItem)}
                >
                  <Trash2 size={14} /> 삭제
                </button>
              )}
            </div>
          </div>
        )}
      </ResponsiveSheetModal>

      {/* Long-Press -> Quick Action Menu Sheet (Req 12.c) */}
      <ResponsiveSheetModal
        open={Boolean(quickMenuItem)}
        onClose={() => setQuickMenuItem(null)}
        eyebrow="QUICK ACTIONS"
        title={quickMenuItem?.name || '빠른 실행'}
        maxWidth={400}
      >
        {quickMenuItem && (
          <div id="garment-quick-menu-sheet" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary btn-full"
              onClick={async () => {
                await handleToggleWear(quickMenuItem);
                setQuickMenuItem(null);
              }}
            >
              오늘 착용 +1
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-full"
              onClick={async () => {
                await handlePatchItem(
                  quickMenuItem,
                  { is_favorite: !quickMenuItem.is_favorite },
                  '즐겨찾기 업데이트됨'
                );
                setQuickMenuItem(null);
              }}
            >
              {quickMenuItem.is_favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-full"
              onClick={async () => {
                await handlePatchItem(
                  quickMenuItem,
                  {
                    status: quickMenuItem.status === 'laundry' ? 'active' : 'laundry',
                  },
                  '세탁 상태 변경됨'
                );
                setQuickMenuItem(null);
              }}
            >
              {quickMenuItem.status === 'laundry' ? '보관중으로 전환' : '세탁중으로 전환'}
            </button>
            {!user?.isSampleDemo && (
              <button
                type="button"
                className="btn btn-secondary btn-full"
                onClick={() => handleDelete(quickMenuItem)}
              >
                의류 삭제
              </button>
            )}
          </div>
        )}
      </ResponsiveSheetModal>

      {/* AI Garment Registration Bottom Sheet (Reqs 6.a-c) */}
      <ResponsiveSheetModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        eyebrow="AI CUTOUT & 3D REGISTRATION"
        title="새 의류 촬영 · AI 자동 등록"
        maxWidth={560}
      >
        <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            id="wardrobe-camera-file-input"
            ref={addCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleSelectPhotoForAdd}
          />
          <input
            id="wardrobe-gallery-file-input"
            ref={addGalleryInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleSelectPhotoForAdd}
          />

          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 18,
              padding: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {croppedDataUrl ? (
                <img
                  id="cropped-webp-preview-img"
                  src={croppedDataUrl}
                  alt="WebP 배경제거 프리뷰"
                  style={{
                    width: 68,
                    height: 84,
                    objectFit: 'contain',
                    borderRadius: 12,
                    background: 'var(--bg-canvas)',
                    padding: 4,
                  }}
                />
              ) : null}
              <div>
                <div className="hig-body" style={{ fontWeight: 600 }}>
                  {croppedDataUrl
                    ? 'WebP 배경 제거 및 AI 매핑 완료'
                    : '카메라 촬영 또는 앨범 업로드'}
                </div>
                <div className="hig-caption">
                  크롭 직후 자동 누끼(WebP) 추출 및 카테고리·소재·3D 슬롯이 매핑됩니다
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                id="trigger-camera-capture-btn"
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => requestPhotoPicker('camera')}
              >
                <Camera size={14} /> 촬영
              </button>
              <button
                id="trigger-gallery-upload-btn"
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => requestPhotoPicker('gallery')}
              >
                <Upload size={14} /> 사진 선택
              </button>
              {rawUploadSrc && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setCropEditorOpen(true)}
                >
                  <Crop size={14} /> 재크롭
                </button>
              )}
            </div>
          </div>

          {aiDetectedBadge && (
            <div
              id="ai-garment-mapping-summary"
              className="hig-caption"
              style={{
                background: 'var(--bg-surface)',
                borderRadius: 14,
                padding: '10px 14px',
              }}
            >
              AI 분석: 포맷 <strong>{aiDetectedBadge.format}</strong> · 슬롯{' '}
              <strong>{aiDetectedBadge.slotKey}</strong> · 베이스 메쉬{' '}
              <strong>{aiDetectedBadge.baseGlb}</strong> · 물리{' '}
              <strong>{aiDetectedBadge.physicsPreset}</strong> · 소재{' '}
              <strong>{aiDetectedBadge.fabricLabel}</strong>
            </div>
          )}

          <input
            id="garment-name-input"
            className="text-input"
            placeholder="아이템 이름 (예: 차콜 캐시미어 코트)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <select
              aria-label="대분류 카테고리"
              className="select-input"
              value={form.category}
              onChange={(e) => {
                const cat = e.target.value;
                const firstSub = SUBCATEGORIES_BY_CAT[cat]?.[0]?.value || 'knit';
                setForm({ ...form, category: cat, subcategory: firstSub, slot_key: cat });
              }}
            >
              {CATEGORIES.filter((c) => c.key !== 'all').map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>

            <select
              aria-label="소분류 아이템"
              className="select-input"
              value={form.subcategory}
              onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
            >
              {(SUBCATEGORIES_BY_CAT[form.category] || []).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <select
              aria-label="의류 소재"
              className="select-input"
              value={form.fabric}
              onChange={(e) => setForm({ ...form, fabric: e.target.value })}
            >
              {FABRIC_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.labelKo.split(' · ')[0]}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <select
              aria-label="대표 컬러"
              className="select-input"
              value={form.color_name}
              onChange={(e) => {
                const found = COLOR_PALETTE.find((c) => c.name === e.target.value);
                setForm({
                  ...form,
                  color_name: e.target.value,
                  color_hex: found ? found.hex : '#1D273B',
                });
              }}
            >
              {COLOR_PALETTE.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>

            <input
              id="garment-price-input"
              type="number"
              className="text-input tabular-nums"
              placeholder="구매가 (원)"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowAddModal(false)}
            >
              취소
            </button>
            <button
              id="submit-add-garment-btn"
              type="submit"
              className="btn btn-primary"
              disabled={savingAdd}
            >
              {savingAdd ? '등록 중...' : '옷장에 저장'}
            </button>
          </div>
        </form>
      </ResponsiveSheetModal>

      {/* Pre-Permission Rationale Modal (Req 10.c) */}
      <PermissionNoticeModal
        open={Boolean(pendingPickerType)}
        mode={pendingPickerType || 'camera'}
        onClose={() => setPendingPickerType(null)}
        onConfirm={() => {
          const target = pendingPickerType;
          setPendingPickerType(null);
          if (target === 'camera') {
            addCameraInputRef.current?.click();
          } else {
            addGalleryInputRef.current?.click();
          }
        }}
      />

      {/* Smart Photo Crop + Auto WebP Cutout Modal */}
      <SmartPhotoCropEditorModal
        open={cropEditorOpen}
        imageSource={rawUploadSrc}
        mode="garment"
        title="의류 영역 크롭 · 자동 WebP 배경제거"
        onClose={() => setCropEditorOpen(false)}
        onApply={handleCropConfirmed}
      />
    </div>
  );
}
