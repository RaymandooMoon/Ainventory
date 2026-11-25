import { useEffect, useState } from 'react';
import { Check, ExternalLink, Layers, MapPin, Trash2, WashingMachine } from 'lucide-react';
import {
  CARBON_DOM_CONTRACT,
  WARDROBE_CATEGORY_OPTIONS,
  normalizeWardrobeCategoryKey,
} from '../contracts/carbonDesignContract.ts';
import {
  LAUNDRY_BASKET_EVENT,
  loadLaundryBasket,
  toggleLaundryBasketItem,
} from '../services/laundryBasketStore.ts';
import { apiFetch } from '../utils/api.ts';
import { guardUserPermission } from '../utils/accessControl.ts';
import {
  formatCareSummaryTokens,
  resolveGarmentCareProfile,
} from '../utils/garmentCareEngine.ts';
import {
  localizeApiMessage,
  localizeBrandName,
  localizeColorName,
  localizeGarmentMemo,
  localizeGarmentName,
  localizeMaterialLabel,
  tx,
} from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { BAG_CARRY_STYLES, inferBagCarrySpec } from '../shared/garmentTaxonomy.js';
import {
  FIT_OPTIONS,
  GARMENT_MATERIAL_OPTIONS,
  WAIST_TYPE_OPTIONS,
  formatGarmentDetailsSummary,
} from '../shared/garmentMetadata.js';
import GarmentObject25D from './GarmentObject25D.jsx';
import NearbyCareMapModal from './NearbyCareMapModal.jsx';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

const QUICK_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'FREE'];

const CARE_WASH_METHOD_OPTIONS = [
  { key: 'dry_clean_only', ko: '드라이클리닝', en: 'Dry Clean' },
  { key: 'wool_delicate', ko: '울·니트 코스', en: 'Wool Cycle' },
  { key: 'hand_wash', ko: '단독 손세탁', en: 'Hand Wash' },
  { key: 'machine_normal', ko: '일반 물세탁', en: 'Machine Wash' },
  { key: 'spot_clean', ko: '부분 케어', en: 'Spot Care' },
];

const CARE_TUMBLE_OPTIONS = [
  { key: 'no_tumble_flat', ko: '건조기 불가(뉘어 건조)', en: 'Flat Dry' },
  { key: 'no_tumble_hang', ko: '건조기 불가(그늘 건조)', en: 'Line Dry' },
  { key: 'low_heat', ko: '저온 건조', en: 'Low Heat' },
  { key: 'allowed', ko: '건조기 가능', en: 'Tumble OK' },
];

function ItemDetailContent({
  user,
  garment,
  lang = 'ko',
  onClose,
  onUpdated,
  onDeleted,
  onTryInOutfits,
  showToast,
}) {
  const initialDisplayName = localizeGarmentName(garment.name || '', lang);
  const initialDisplayBrand = localizeBrandName(garment.brand || '', lang);
  const rawMemoSource = garment.fit_note || garment.memo || garment.notes || '';
  const initialDisplayMemo = localizeGarmentMemo(rawMemoSource, lang);

  const initialBagSpec = inferBagCarrySpec(garment);
  const [viewMode, setViewMode] = useState('front'); // front | back | original
  const [name, setName] = useState(() => initialDisplayName);
  const [brand, setBrand] = useState(() => initialDisplayBrand);
  const [category, setCategory] = useState(() => normalizeWardrobeCategoryKey(garment.category));
  const [fabric, setFabric] = useState(() => garment.fabric || 'Cotton');
  const [fit, setFit] = useState(() => garment.fit || '');
  const [size, setSize] = useState(() => garment.size || '');
  const [price, setPrice] = useState(() =>
    garment.price > 0 ? String(garment.price) : garment.purchase_price > 0 ? String(garment.purchase_price) : ''
  );
  const [purchaseDate, setPurchaseDate] = useState(() => garment.purchase_date || '');
  const [purchaseStore, setPurchaseStore] = useState(() => garment.purchase_store || '');
  const [productCode, setProductCode] = useState(() => garment.product_code || '');
  const [materialComposition, setMaterialComposition] = useState(
    () => garment.material_composition || ''
  );
  const [careTip, setCareTip] = useState(() => garment.care_tip || '');
  const [garmentDetails, setGarmentDetails] = useState(() => garment.garment_details || {});
  const [careProfile, setCareProfile] = useState(() => resolveGarmentCareProfile(garment));
  const [careMapOpen, setCareMapOpen] = useState(false);
  const [inLaundryBasket, setInLaundryBasket] = useState(() =>
    loadLaundryBasket().garmentIds.includes(Number(garment.id))
  );
  const [memo, setMemo] = useState(() => initialDisplayMemo);
  const [hasStrap, setHasStrap] = useState(() => Boolean(initialBagSpec.has_strap));
  const [bagCarryStyle, setBagCarryStyle] = useState(
    () => initialBagSpec.bag_carry_style || 'hand_only'
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const syncBasket = (ev) => {
      const next = ev?.detail || loadLaundryBasket();
      setInLaundryBasket(next.garmentIds.includes(Number(garment.id)));
    };
    window.addEventListener(LAUNDRY_BASKET_EVENT, syncBasket);
    return () => window.removeEventListener(LAUNDRY_BASKET_EVENT, syncBasket);
  }, [garment.id]);

  const isBagItem = initialBagSpec.isBag;
  const hasBackImage = Boolean(garment.back_image_url);
  const hasOriginalFront = Boolean(garment.original_front_url);

  const activePreviewSrc =
    viewMode === 'back' && hasBackImage
      ? garment.back_image_url
      : viewMode === 'original' && hasOriginalFront
        ? garment.original_front_url
        : garment.image_url;

  const detailTags = formatGarmentDetailsSummary(garmentDetails, category, lang);
  const fitLabel = FIT_OPTIONS.find((o) => o.key === fit);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!guardUserPermission(user, 'btn:closet:edit_delete')) return;
    setSaving(true);
    try {
      const catOpt =
        WARDROBE_CATEGORY_OPTIONS.find((opt) => opt.key === category) ||
        WARDROBE_CATEGORY_OPTIONS[0];
      const currentNormCat = normalizeWardrobeCategoryKey(garment.category);
      const trimmedName = name.trim();
      const trimmedBrand = brand.trim();
      const trimmedMemo = memo.trim();

      const resolvedName =
        trimmedName === initialDisplayName ? garment.name : trimmedName || garment.name;
      const resolvedBrand =
        trimmedBrand === initialDisplayBrand ? garment.brand || '' : trimmedBrand;
      const resolvedMemo =
        trimmedMemo === initialDisplayMemo ? rawMemoSource : trimmedMemo;

      const payload = {
        name: resolvedName,
        brand: resolvedBrand,
        category: catOpt.key,
        ...(catOpt.key !== currentNormCat ? { subcategory: catOpt.defaultSubcategory } : {}),
        fabric,
        fit,
        size: size.trim(),
        price: Math.max(0, Number(String(price).replace(/[^0-9]/g, '')) || 0),
        purchase_date: purchaseDate.trim(),
        purchase_store: purchaseStore.trim(),
        product_code: productCode.trim(),
        material_composition: materialComposition.trim(),
        care_tip: careTip.trim(),
        garment_details: {
          ...(garmentDetails && typeof garmentDetails === 'object' ? garmentDetails : {}),
          care_profile: careProfile,
        },
        fit_note: resolvedMemo,
        memo: resolvedMemo,
        notes: resolvedMemo,
        ...(isBagItem
          ? {
              has_strap: hasStrap,
              bag_carry_style: hasStrap ? bagCarryStyle : 'hand_only',
            }
          : {}),
      };

      const res = await apiFetch(`/garments/${garment.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      triggerHaptic('selection');
      onUpdated?.(res?.garment || { ...garment, ...payload });
      showToast?.(tx(lang, '아이템 정보가 저장되었습니다.', 'Item details saved.'));
    } catch (err) {
      showToast?.(
        localizeApiMessage(err?.message, lang) ||
          tx(lang, '저장에 실패했습니다.', 'Failed to save changes.')
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!guardUserPermission(user, 'btn:closet:edit_delete')) return;
    setDeleting(true);
    try {
      await apiFetch(`/garments/${garment.id}`, { method: 'DELETE' });
      triggerHaptic('medium');
      onDeleted?.(garment.id);
      onClose?.();
      showToast?.(tx(lang, '아이템이 삭제되었습니다.', 'Item deleted.'));
    } catch (err) {
      showToast?.(
        localizeApiMessage(err?.message, lang) ||
          tx(lang, '삭제에 실패했습니다.', 'Failed to delete item.')
      );
    } finally {
      setDeleting(false);
    }
  };

  const wearCount = Math.max(0, Number(garment.wear_count || 0));
  const purchasePrice = Number(garment.price || garment.purchase_price || 0);
  const cpwText =
    purchasePrice > 0
      ? `₩${Math.round(purchasePrice / Math.max(1, wearCount)).toLocaleString('ko-KR')}`
      : Array.isArray(garment.seasons) && garment.seasons.length > 0
        ? garment.seasons.join('·')
        : tx(lang, '사계절', 'All-Season');

  return (
    <div className="hig-item-detail-body">
      {/* Interactive Tilt-Responsive Zoomed Garment View + Front/Back Switcher */}
      <div className="hig-detail-25d-squircle">
        <GarmentObject25D
          stageId={CARBON_DOM_CONTRACT.itemDetailTiltStageId}
          src={activePreviewSrc}
          item={garment}
          alt={initialDisplayName}
          interactive
          maxTiltDeg={13}
          padding="11%"
        />
        {garment.color_hex && (
          <div className="hig-detail-color-chip tabular-nums">
            <span
              className="hig-detail-color-dot"
              style={{ backgroundColor: garment.color_hex }}
            />
            <span>{localizeColorName(garment.color_name, lang) || garment.color_hex}</span>
          </div>
        )}

        {(hasBackImage || hasOriginalFront) && (
          <div className="hig-detail-side-switcher" role="tablist" aria-label={tx(lang, '사진 면 전환', 'Switch garment view')}>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'front'}
              className={`hig-reg-seg-btn ${viewMode === 'front' ? 'active' : ''}`}
              onClick={() => setViewMode('front')}
            >
              {tx(lang, '앞면', 'Front')}
            </button>
            {hasBackImage && (
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'back'}
                className={`hig-reg-seg-btn ${viewMode === 'back' ? 'active' : ''}`}
                onClick={() => setViewMode('back')}
              >
                {tx(lang, '뒷면', 'Back')}
              </button>
            )}
            {hasOriginalFront && (
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'original'}
                className={`hig-reg-seg-btn ${viewMode === 'original' ? 'active' : ''}`}
                onClick={() => setViewMode('original')}
              >
                {tx(lang, '실사', 'My Photo')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Monochrome Editorial Readout Strip (tabular-nums) */}
      <div className="hig-detail-kpi-strip tabular-nums">
        <div className="hig-detail-kpi-cell">
          <span className="hig-detail-kpi-label">
            {tx(lang, '착용 횟수', 'WEARS')}
          </span>
          <span className="hig-detail-kpi-value">
            {tx(lang, `${wearCount}회`, `${wearCount}×`)}
          </span>
        </div>
        <div className="hig-detail-kpi-cell">
          <span className="hig-detail-kpi-label">
            {purchasePrice > 0
              ? tx(lang, '1회 착용가', 'COST / WEAR')
              : tx(lang, '시즌', 'SEASON')}
          </span>
          <span className="hig-detail-kpi-value">{cpwText}</span>
        </div>
        <div className="hig-detail-kpi-cell">
          <span className="hig-detail-kpi-label">
            {tx(lang, '소재', 'MATERIAL')}
          </span>
          <span className="hig-detail-kpi-value">
            {localizeMaterialLabel(fabric, lang)}
          </span>
        </div>
      </div>

      {/* Unboxed Spec Summary Line (Fit + Wearing Details + Official Link) */}
      {(fitLabel || detailTags.length > 0 || garment.official_source_url) && (
        <div className="hig-detail-spec-strip">
          <div className="hig-detail-spec-text">
            {[
              fitLabel ? tx(lang, `${fitLabel.ko} 핏`, `${fitLabel.en} Fit`) : '',
              ...detailTags,
              materialComposition,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {garment.official_source_url && (
            <a
              href={garment.official_source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hig-web-source-link"
            >
              <span>{tx(lang, '공식 페이지', 'Official Page')}</span>
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      )}

      {/* Primary Action: Try in Outfits */}
      <button
        id={CARBON_DOM_CONTRACT.itemDetailTryOutfitBtnId}
        type="button"
        className="hig-primary-cta-btn"
        onClick={() => {
          triggerHaptic('medium');
          onTryInOutfits?.(garment);
        }}
      >
        <Layers size={18} />
        <span>{tx(lang, 'Outfits에서 코디해보기', 'Try in Outfits')}</span>
      </button>

      {/* Editable Metadata Form */}
      <form onSubmit={handleSave} className="hig-detail-edit-form">
        <div className="hig-field-grid-2">
          <div className="hig-field-group">
            <label htmlFor="detail-name-input" className="hig-field-label">
              {tx(lang, '아이템명', 'Name')}
            </label>
            <input
              id="detail-name-input"
              type="text"
              className="hig-native-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="hig-field-group">
            <label htmlFor="detail-brand-input" className="hig-field-label">
              {tx(lang, '브랜드', 'Brand')}
            </label>
            <input
              id="detail-brand-input"
              type="text"
              className="hig-native-input"
              placeholder="Brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              maxLength={80}
            />
          </div>
        </div>

        <div className="hig-field-group">
          <label className="hig-field-label">{tx(lang, '카테고리', 'Category')}</label>
          <div className="hig-pill-row" role="radiogroup" aria-label="Item Category">
            {WARDROBE_CATEGORY_OPTIONS.map((opt) => {
              const active = category === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`hig-filter-pill ${active ? 'active' : ''}`}
                  onClick={() => setCategory(opt.key)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="hig-field-grid-2">
          <div className="hig-field-group">
            <label htmlFor="detail-material-select" className="hig-field-label">
              {tx(lang, '재질 · 소재', 'Material')}
            </label>
            <select
              id="detail-material-select"
              className="hig-native-input"
              value={fabric}
              onChange={(e) => setFabric(e.target.value)}
            >
              {GARMENT_MATERIAL_OPTIONS.map((m) => (
                <option key={m.key} value={m.key}>
                  {tx(lang, m.ko, m.en)}
                </option>
              ))}
            </select>
          </div>

          <div className="hig-field-group">
            <label htmlFor="detail-fit-select" className="hig-field-label">
              {tx(lang, '핏 실루엣', 'Fit')}
            </label>
            <select
              id="detail-fit-select"
              className="hig-native-input"
              value={fit}
              onChange={(e) => setFit(e.target.value)}
            >
              <option value="">{tx(lang, '선택 안 함', 'Unspecified')}</option>
              {FIT_OPTIONS.map((f) => (
                <option key={f.key} value={f.key}>
                  {tx(lang, f.ko, f.en)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {category === 'bottom' && (
          <div className="hig-field-group">
            <label className="hig-field-label">
              {tx(lang, '허리 방식 · 벨트 가능 여부', 'Waistband & Belt')}
            </label>
            <div className="hig-pill-row">
              {WAIST_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`hig-filter-pill ${garmentDetails.waist_type === opt.key ? 'active' : ''}`}
                  onClick={() =>
                    setGarmentDetails((prev) => ({
                      ...prev,
                      waist_type: opt.key,
                      belt_compatible: opt.defaultBelt,
                    }))
                  }
                >
                  {tx(lang, opt.ko, opt.en)}
                </button>
              ))}
              <button
                type="button"
                className={`hig-filter-pill ${garmentDetails.belt_compatible === false ? 'active' : ''}`}
                onClick={() =>
                  setGarmentDetails((prev) => ({
                    ...prev,
                    belt_compatible: prev.belt_compatible === false ? true : false,
                  }))
                }
              >
                {garmentDetails.belt_compatible === false
                  ? tx(lang, '벨트 불가', 'No Belt')
                  : tx(lang, '벨트 가능', 'Belt OK')}
              </button>
            </div>
          </div>
        )}

        {isBagItem && (
          <div className="hig-field-group" data-bag-strap-editor="true">
            <label className="hig-field-label">
              {tx(lang, '가방끈 유무 · 착용 방식', 'Bag Strap & Carry Style')}
            </label>
            <div className="hig-grid-2" style={{ marginBottom: 8 }}>
              <button
                type="button"
                className={`hig-filter-pill ${hasStrap ? 'active' : ''}`}
                aria-pressed={hasStrap}
                onClick={() => {
                  setHasStrap(true);
                  if (bagCarryStyle === 'hand_only') setBagCarryStyle('shoulder');
                }}
              >
                {tx(lang, '가방끈 있음', 'Has Strap')}
              </button>
              <button
                type="button"
                className={`hig-filter-pill ${!hasStrap ? 'active' : ''}`}
                aria-pressed={!hasStrap}
                onClick={() => {
                  setHasStrap(false);
                  setBagCarryStyle('hand_only');
                }}
              >
                {tx(lang, '가방끈 없음 (핸드캐리)', 'No Strap (Hand-carry)')}
              </button>
            </div>
            {hasStrap && (
              <div className="hig-pill-row" role="radiogroup" aria-label="Bag Carry Style">
                {Object.values(BAG_CARRY_STYLES)
                  .filter((s) => s.hasStrap)
                  .map((styleOpt) => {
                    const active = bagCarryStyle === styleOpt.key;
                    return (
                      <button
                        key={styleOpt.key}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`hig-filter-pill ${active ? 'active' : ''}`}
                        onClick={() => setBagCarryStyle(styleOpt.key)}
                      >
                        {lang === 'en' ? styleOpt.labelEn : styleOpt.labelKo}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        <div className="hig-field-grid-2">
          <div className="hig-field-group">
            <label htmlFor="detail-price-input" className="hig-field-label">
              {tx(lang, '구매가 (원)', 'Price (KRW)')}
            </label>
            <input
              id="detail-price-input"
              type="number"
              inputMode="numeric"
              min={0}
              className="hig-native-input tabular-nums"
              placeholder="89000"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          <div className="hig-field-group">
            <label htmlFor="detail-purchase-date" className="hig-field-label">
              {tx(lang, '구매시기', 'Purchase Month')}
            </label>
            <input
              id="detail-purchase-date"
              type="month"
              className="hig-native-input tabular-nums"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>
        </div>

        <div className="hig-field-grid-2">
          <div className="hig-field-group">
            <label htmlFor="detail-store-input" className="hig-field-label">
              {tx(lang, '구매처', 'Store')}
            </label>
            <input
              id="detail-store-input"
              type="text"
              className="hig-native-input"
              placeholder={tx(lang, '매장 / 플랫폼', 'Store / Retailer')}
              value={purchaseStore}
              onChange={(e) => setPurchaseStore(e.target.value)}
              maxLength={80}
            />
          </div>

          <div className="hig-field-group">
            <label htmlFor="detail-code-input" className="hig-field-label">
              {tx(lang, '품번', 'Product Code')}
            </label>
            <input
              id="detail-code-input"
              type="text"
              className="hig-native-input tabular-nums"
              placeholder="SKU / Code"
              value={productCode}
              onChange={(e) => setProductCode(e.target.value)}
              maxLength={64}
            />
          </div>
        </div>

        <div className="hig-field-group">
          <label htmlFor="detail-size-input" className="hig-field-label">
            {tx(lang, '사이즈', 'Size')}
          </label>
          <div className="hig-size-selector-row">
            <input
              id="detail-size-input"
              type="text"
              className="hig-native-input hig-size-input"
              placeholder="M / 100 / 270"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              maxLength={32}
            />
            <div className="hig-quick-size-chips">
              {QUICK_SIZES.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  className={`hig-mini-chip ${size === sz ? 'active' : ''}`}
                  onClick={() => setSize(sz)}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="hig-field-group">
          <label htmlFor="detail-comp-input" className="hig-field-label">
            {tx(lang, '소재 혼용률', 'Fiber Composition')}
          </label>
          <input
            id="detail-comp-input"
            type="text"
            className="hig-native-input"
            placeholder={tx(lang, '면 98%, 폴리우레탄 2%', '98% Cotton, 2% Elastane')}
            value={materialComposition}
            onChange={(e) => setMaterialComposition(e.target.value)}
            maxLength={140}
          />
        </div>

        <div className="hig-field-group">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label htmlFor="detail-care-input" className="hig-field-label m-0">
              {tx(lang, '세탁 · 케어 가이드', 'Washing & Care Guide')}
            </label>
            <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {careProfile.source === 'care_label_scan'
                ? tx(lang, '세탁탭 분석 반영', 'From care label')
                : careProfile.source === 'user_edited'
                  ? tx(lang, '직접 설정됨', 'Custom')
                  : tx(lang, '소재 자동 추정', 'Auto-inferred')}
            </span>
          </div>

          <div className="rounded-xl border border-black/10 dark:border-white/12 p-3 space-y-2.5 bg-black/[0.02] dark:bg-white/[0.03] mb-2">
            <div className="text-xs font-medium text-neutral-800 dark:text-neutral-200 tabular-nums">
              {formatCareSummaryTokens(careProfile, lang).join(' · ')}
            </div>

            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={tx(lang, '세탁 방식', 'Wash Method')}>
              {CARE_WASH_METHOD_OPTIONS.map((opt) => {
                const active = careProfile.washMethod === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      triggerHaptic('selection');
                      setCareProfile((prev) => ({
                        ...prev,
                        washMethod: opt.key,
                        waterTempC:
                          opt.key === 'dry_clean_only' || opt.key === 'spot_clean'
                            ? 0
                            : prev.waterTempC || 30,
                        source: 'user_edited',
                      }));
                    }}
                    className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                      active
                        ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-950 dark:border-white'
                        : 'border-black/10 dark:border-white/15 text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    {lang === 'en' ? opt.en : opt.ko}
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {CARE_TUMBLE_OPTIONS.map((opt) => {
                const active = careProfile.tumbleDry === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      triggerHaptic('selection');
                      setCareProfile((prev) => ({
                        ...prev,
                        tumbleDry: opt.key,
                        source: 'user_edited',
                      }));
                    }}
                    className={`min-h-[32px] px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                      active
                        ? 'bg-neutral-900/10 dark:bg-white/15 border-neutral-900/40 dark:border-white/40 text-neutral-900 dark:text-white font-semibold'
                        : 'border-black/8 dark:border-white/10 text-neutral-500 dark:text-neutral-400'
                    }`}
                  >
                    {lang === 'en' ? opt.en : opt.ko}
                  </button>
                );
              })}

              <button
                type="button"
                aria-pressed={careProfile.needsLaundryNet}
                onClick={() => {
                  triggerHaptic('selection');
                  setCareProfile((prev) => ({
                    ...prev,
                    needsLaundryNet: !prev.needsLaundryNet,
                    source: 'user_edited',
                  }));
                }}
                className={`min-h-[32px] px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                  careProfile.needsLaundryNet
                    ? 'bg-neutral-900/10 dark:bg-white/15 border-neutral-900/40 dark:border-white/40 text-neutral-900 dark:text-white font-semibold'
                    : 'border-black/8 dark:border-white/10 text-neutral-500 dark:text-neutral-400'
                }`}
              >
                {tx(lang, '세탁망 권장', 'Mesh Bag')}
              </button>

              <button
                type="button"
                aria-pressed={careProfile.colorBleedRisk === 'high'}
                onClick={() => {
                  triggerHaptic('selection');
                  setCareProfile((prev) => ({
                    ...prev,
                    colorBleedRisk: prev.colorBleedRisk === 'high' ? 'low' : 'high',
                    source: 'user_edited',
                  }));
                }}
                className={`min-h-[32px] px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                  careProfile.colorBleedRisk === 'high'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-300 font-semibold'
                    : 'border-black/8 dark:border-white/10 text-neutral-500 dark:text-neutral-400'
                }`}
              >
                {tx(lang, '이염 주의', 'Color Bleed')}
              </button>
            </div>

            {careProfile.careLabelImageUrl && (
              <div className="pt-1 flex items-center gap-2.5">
                <img
                  src={careProfile.careLabelImageUrl}
                  alt={tx(lang, '저장된 세탁 케어 라벨', 'Saved Care Label')}
                  className="w-14 h-14 rounded-lg object-cover border border-black/10 dark:border-white/15 shrink-0"
                />
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  {tx(lang, '등록 시 촬영한 내부 세탁탭 사진이 보관되어 있습니다.', 'Captured care label photo archived.')}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (!guardUserPermission(user, 'btn:closet:laundry')) return;
                  triggerHaptic('selection');
                  const { added } = toggleLaundryBasketItem(Number(garment.id));
                  setInLaundryBasket(added);
                  showToast?.(
                    added
                      ? tx(lang, '스마트 세탁 바구니에 담았습니다.', 'Added to Smart Laundry Basket.')
                      : tx(lang, '세탁 바구니에서 제외했습니다.', 'Removed from Smart Laundry Basket.')
                  );
                }}
                className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  inLaundryBasket
                    ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-950 dark:border-white'
                    : 'border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10'
                }`}
              >
                <WashingMachine size={14} />
                <span>
                  {inLaundryBasket
                    ? tx(lang, '세탁 바구니 담김', 'In Laundry Basket')
                    : tx(lang, '세탁 바구니 담기', 'Add to Laundry')}
                </span>
              </button>

              <button
                type="button"
                data-open-nearby-care-map="true"
                onClick={() => {
                  triggerHaptic('selection');
                  setCareMapOpen(true);
                }}
                className="min-h-[42px] px-3 py-2 rounded-xl border border-black/15 dark:border-white/15 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <MapPin size={14} />
                <span>{tx(lang, '주변 세탁·수선소 찾기', 'Nearby Cleaners')}</span>
              </button>
            </div>
          </div>

          <input
            id="detail-care-input"
            type="text"
            className="hig-native-input"
            placeholder={tx(lang, '드라이클리닝 또는 찬물 단독 세탁', 'Dry clean or cold gentle wash')}
            value={careTip}
            onChange={(e) => setCareTip(e.target.value)}
            maxLength={240}
          />
        </div>

        <div className="hig-field-group">
          <label htmlFor="detail-memo-input" className="hig-field-label">
            {tx(lang, '개인 피팅 메모 (가상 피팅 반영)', 'Personal Fit & Styling Note')}
          </label>
          <textarea
            id="detail-memo-input"
            className="hig-native-textarea"
            rows={2}
            placeholder={tx(
              lang,
              '예: 올려 입으면 복숭아뼈, 내려 입으면 끌려요',
              'Fit, hem length, tailoring, or styling notes'
            )}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={500}
          />
        </div>

        <div className="hig-detail-footer-actions">
          <button
            id={CARBON_DOM_CONTRACT.itemDetailDeleteBtnId}
            type="button"
            className="hig-danger-outline-btn"
            onClick={handleDelete}
            disabled={deleting || saving}
          >
            <Trash2 size={16} />
            <span>
              {deleting ? tx(lang, '삭제 중...', 'Deleting...') : tx(lang, '삭제', 'Delete')}
            </span>
          </button>

          <button
            id={CARBON_DOM_CONTRACT.itemDetailSaveBtnId}
            type="submit"
            className="hig-secondary-save-btn"
            disabled={saving || deleting}
          >
            <Check size={16} />
            <span>
              {saving
                ? tx(lang, '저장 중...', 'Saving...')
                : tx(lang, '정보 저장', 'Save Details')}
            </span>
          </button>
        </div>
      </form>

      <NearbyCareMapModal
        open={careMapOpen}
        onClose={() => setCareMapOpen(false)}
        garment={{
          ...garment,
          fabric,
          material_composition: materialComposition,
          care_tip: careTip,
          garment_details: {
            ...(garmentDetails && typeof garmentDetails === 'object' ? garmentDetails : {}),
            care_profile: careProfile,
          },
        }}
        lang={lang}
      />
    </div>
  );
}

export default function ItemDetailSheet({
  user,
  garment,
  open,
  lang = 'ko',
  onClose,
  onUpdated,
  onDeleted,
  onTryInOutfits,
  showToast,
}) {
  if (!open || !garment) return null;

  const displayTitle = localizeGarmentName(garment.name, lang);
  const displayEyebrow = localizeBrandName(garment.brand, lang) || undefined;

  return (
    <ResponsiveSheetModal
      id={CARBON_DOM_CONTRACT.garmentDetailSheetId}
      open={open}
      onClose={onClose}
      lang={lang}
      title={displayTitle}
      eyebrow={displayEyebrow}
      maxWidth={560}
    >
      <ItemDetailContent
        key={`${garment.id}-${lang}`}
        user={user}
        garment={garment}
        lang={lang}
        onClose={onClose}
        onUpdated={onUpdated}
        onDeleted={onDeleted}
        onTryInOutfits={onTryInOutfits}
        showToast={showToast}
      />
    </ResponsiveSheetModal>
  );
}
