import { useRef, useState } from 'react';
import { Camera, Check, ChevronDown, ImagePlus, Loader2 } from 'lucide-react';
import {
  CARBON_DOM_CONTRACT,
  WARDROBE_CATEGORY_OPTIONS,
} from '../contracts/carbonDesignContract.ts';
import { processGarmentUpload } from '../services/backgroundRemovalService.ts';
import { apiFetch } from '../utils/api.ts';
import {
  localizeApiMessage,
  localizeColorName,
  localizeGarmentName,
  tx,
} from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { ClearableField, ExclusiveErrorCard } from './ExclusiveViewPrimitives.jsx';
import GarmentObject25D from './GarmentObject25D.jsx';
import { ResponsiveSheetModal } from './common/AppUI.jsx';
import './wardrobe/wardrobeUx.css';

const ACCESSORY_SUBTYPE_OPTIONS = [
  { key: 'bag', ko: '가방 · 휴대', en: 'Bag / Carry' },
  { key: 'umbrella', ko: '우산 · 양산', en: 'Umbrella' },
  { key: 'watch', ko: '손목시계', en: 'Watch' },
  { key: 'gloves', ko: '장갑', en: 'Gloves' },
  { key: 'eyewear', ko: '아이웨어', en: 'Eyewear' },
  { key: 'headwear', ko: '머리 · 모자', en: 'Headwear' },
  { key: 'neckwear', ko: '목 · 머플러', en: 'Neckwear' },
  { key: 'belt', ko: '허리 · 벨트', en: 'Belt' },
];

const JEWELRY_SUBTYPE_OPTIONS = [
  { key: 'necklace', ko: '목걸이 · 펜던트', en: 'Necklace' },
  { key: 'earring', ko: '귀걸이 · 이어커프', en: 'Earring' },
  { key: 'bracelet', ko: '팔찌 · 뱅글', en: 'Bracelet' },
  { key: 'ring', ko: '반지 · 링', en: 'Ring' },
  { key: 'brooch', ko: '브로치 · 코사지', en: 'Brooch' },
];

const SEASON_CHIP_OPTIONS = [
  { key: '봄', ko: '봄', en: 'Spring' },
  { key: '여름', ko: '여름', en: 'Summer' },
  { key: '가을', ko: '가을', en: 'Autumn' },
  { key: '겨울', ko: '겨울', en: 'Winter' },
  { key: '사계절', ko: '사계절', en: 'All Seasons' },
];

const ALL_FOUR_SEASONS = ['봄', '여름', '가을', '겨울'];
const QUICK_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'FREE'];

const MATERIAL_OPTIONS = [
  { key: 'Leather', ko: '가죽', en: 'Leather' },
  { key: 'Fabric', ko: '패브릭', en: 'Fabric' },
  { key: 'Wool', ko: '울', en: 'Wool' },
  { key: 'Cashmere', ko: '캐시미어', en: 'Cashmere' },
  { key: '18K Yellow Gold', ko: '18K 금', en: '18K Gold' },
  { key: '925 Sterling Silver', ko: '925 은', en: '925 Silver' },
  { key: 'Sculptural Bronze', ko: '동 · 브론즈', en: 'Bronze' },
  { key: 'Platinum & Pearl', ko: '플래티넘 · 진주', en: 'Platinum' },
];

function AddGarmentForm({ activeCloset, lang = 'ko', onClose, onRegistered, showToast }) {
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [processedAsset, setProcessedAsset] = useState(null);
  const [category, setCategory] = useState('top');
  const [subpart, setSubpart] = useState('bag');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');

  // Optional metadata collapsed by default under '선택 입력 더보기'
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [seasons, setSeasons] = useState(ALL_FOUR_SEASONS);
  const [material, setMaterial] = useState('Fabric');
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [memo, setMemo] = useState('');
  const [formError, setFormError] = useState(null);

  const categoryOptions = [
    ...WARDROBE_CATEGORY_OPTIONS,
    {
      key: 'jewelry',
      label: tx(lang, '주얼리', 'Jewelry'),
      defaultSubcategory: 'necklace',
    },
  ];

  const isAllSeasons = ALL_FOUR_SEASONS.every((s) => seasons.includes(s));

  const handleSelectCategory = (nextCat) => {
    setCategory(nextCat);
    if (nextCat === 'accessory') {
      setSubpart('bag');
      setMaterial('Leather');
    } else if (nextCat === 'jewelry') {
      setSubpart('necklace');
      setMaterial('18K Yellow Gold');
    }
  };

  const handleToggleSeasonChip = (chipKey) => {
    triggerHaptic('selection');
    if (chipKey === '사계절') {
      setSeasons(ALL_FOUR_SEASONS);
      return;
    }
    if (isAllSeasons) {
      setSeasons([chipKey]);
      return;
    }
    setSeasons((prev) => {
      if (prev.includes(chipKey)) {
        const next = prev.filter((s) => s !== chipKey);
        return next.length > 0 ? next : ALL_FOUR_SEASONS;
      }
      const next = [...prev, chipKey];
      return ALL_FOUR_SEASONS.every((s) => next.includes(s)) ? ALL_FOUR_SEASONS : next;
    });
  };

  const handleSelectFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setProcessing(true);
    setFormError(null);
    try {
      const asset = await processGarmentUpload(file, {
        targetSizePx: 640,
        paddingRatio: 0.11,
        fileNameHint: file.name,
      });
      setProcessedAsset(asset);
      const suggestedCat = asset.suggestedCategory || 'top';
      handleSelectCategory(suggestedCat);
      setName(
        (prev) =>
          prev.trim() ||
          localizeGarmentName(asset.suggestedName, lang) ||
          tx(lang, '새 아이템', 'New Garment')
      );
      triggerHaptic('selection');
    } catch (err) {
      const errMsg =
        localizeApiMessage(err?.message, lang) ||
        tx(lang, '이미지를 처리하지 못했습니다. 다른 사진으로 다시 시도해 주세요.', 'Failed to process image. Please try another photo.');
      setFormError(errMsg);
      showToast?.(errMsg);
    } finally {
      setProcessing(false);
    }
  };

  const submitGarment = async () => {
    if (!processedAsset?.cutoutDataUrl) {
      showToast?.(
        tx(lang, '의류 사진을 먼저 선택해주세요.', 'Please select a garment photo first.')
      );
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast?.(tx(lang, '아이템 이름을 입력해주세요.', 'Please enter an item name.'));
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const catOption =
        categoryOptions.find((opt) => opt.key === category) || categoryOptions[0];
      const resolvedSubcategory =
        category === 'accessory' || category === 'jewelry'
          ? subpart
          : catOption.defaultSubcategory;
      const targetOwner = !activeCloset || activeCloset === 'all' ? 'sample' : activeCloset;
      const numericPrice = price.trim() !== '' && Number.isFinite(Number(price))
        ? Math.max(0, Math.round(Number(price)))
        : 0;
      const trimmedMemo = memo.trim();

      const res = await apiFetch('/garments', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: targetOwner,
          name: trimmedName,
          brand: brand.trim(),
          category: catOption.key,
          subcategory: resolvedSubcategory,
          seasons,
          fabric: material,
          size: size.trim(),
          price: numericPrice,
          memo: trimmedMemo,
          notes: trimmedMemo,
          color_hex: processedAsset.dominantColorHex,
          color_name: processedAsset.dominantColorName,
          image_data: processedAsset.cutoutDataUrl,
          custom_texture: true,
        }),
      });

      triggerHaptic('medium');
      onRegistered?.(res?.garment);
      onClose?.();
    } catch (err) {
      const errMsg =
        localizeApiMessage(err?.message, lang) ||
        tx(lang, '등록 중 오류가 발생했습니다.', 'Failed to save item.');
      setFormError(errMsg);
      showToast?.(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await submitGarment();
  };

  const subtypeOptions =
    category === 'accessory'
      ? ACCESSORY_SUBTYPE_OPTIONS
      : category === 'jewelry'
        ? JEWELRY_SUBTYPE_OPTIONS
        : null;

  const activeSeasonSummary = isAllSeasons
    ? tx(lang, '사계절', 'All Seasons')
    : seasons
        .map((s) => {
          const found = SEASON_CHIP_OPTIONS.find((opt) => opt.key === s);
          return found ? tx(lang, found.ko, found.en) : s;
        })
        .join(' · ');

  const activeMaterialOption = MATERIAL_OPTIONS.find((m) => m.key === material);
  const activeMaterialLabel = activeMaterialOption
    ? tx(lang, activeMaterialOption.ko, activeMaterialOption.en)
    : material;

  return (
    <form onSubmit={handleSubmit} className="hig-add-garment-form wd-ux-add-form">
      <input
        id={CARBON_DOM_CONTRACT.wardrobeGalleryInputId}
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        onChange={handleSelectFile}
        className="sr-only-input"
      />
      <input
        id={CARBON_DOM_CONTRACT.wardrobeCameraInputId}
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleSelectFile}
        className="sr-only-input"
      />

      {formError && (
        <ExclusiveErrorCard
          lang={lang}
          compact
          title={tx(lang, '등록 처리 중 오류가 발생했습니다', 'Registration Error')}
          message={formError}
          onRetry={processedAsset?.cutoutDataUrl ? submitGarment : () => galleryInputRef.current?.click()}
          retrying={submitting || processing}
        />
      )}

      {/* 1:1 Normalized Studio Preview Stage + Optical Scan Viewfinder */}
      <div
        id={CARBON_DOM_CONTRACT.addGarmentPreviewId}
        className="hig-add-preview-squircle"
        onClick={() => {
          if (!processedAsset && !processing) {
            galleryInputRef.current?.click();
          }
        }}
      >
        <div
          aria-hidden="true"
          className={`hig-optical-scan-overlay ${processing ? 'is-scanning' : ''}`}
        >
          <span className="wardrobe-scanner-corner is-tl" />
          <span className="wardrobe-scanner-corner is-tr" />
          <span className="wardrobe-scanner-corner is-bl" />
          <span className="wardrobe-scanner-corner is-br" />
        </div>

        {processing ? (
          <div className="hig-add-upload-prompt">
            <Loader2 size={28} className="hig-spin" aria-hidden="true" />
            <span>
              {tx(lang, '배경 제거 및 스튜디오 보정 중...', 'Studio Cutout Normalization...')}
            </span>
          </div>
        ) : processedAsset ? (
          <GarmentObject25D
            src={processedAsset.cutoutDataUrl}
            category={category}
            colorHex={processedAsset.dominantColorHex}
            alt={name || 'Preview'}
            interactive
            padding="10%"
          />
        ) : (
          <div className="hig-add-upload-prompt">
            <div className="hig-upload-action-pair">
              <button
                type="button"
                className="hig-pill-action-btn"
                onClick={(ev) => {
                  ev.stopPropagation();
                  galleryInputRef.current?.click();
                }}
              >
                <ImagePlus size={18} aria-hidden="true" />
                <span>{tx(lang, '사진 보관함', 'Photo Library')}</span>
              </button>
              <button
                type="button"
                className="hig-pill-action-btn"
                onClick={(ev) => {
                  ev.stopPropagation();
                  cameraInputRef.current?.click();
                }}
              >
                <Camera size={18} aria-hidden="true" />
                <span>{tx(lang, '카메라 촬영', 'Camera')}</span>
              </button>
            </div>
          </div>
        )}

        {processedAsset && !processing && processedAsset.dominantColorHex && (
          <div className="hig-detail-color-chip tabular-nums">
            <span
              className="hig-detail-color-dot"
              style={{ backgroundColor: processedAsset.dominantColorHex }}
            />
            <span>
              {localizeColorName(processedAsset.dominantColorName, lang) ||
                processedAsset.dominantColorHex}
            </span>
          </div>
        )}

        {processedAsset && !processing && (
          <button
            type="button"
            className="hig-reselect-photo-chip"
            onClick={(ev) => {
              ev.stopPropagation();
              galleryInputRef.current?.click();
            }}
          >
            {tx(lang, '사진 변경', 'Replace')}
          </button>
        )}
      </div>

      {/* Essential Property 1: Category Pill Selector */}
      <div className="hig-field-group">
        <label className="hig-field-label">{tx(lang, '카테고리 (필수)', 'Category (Required)')}</label>
        <div className="hig-pill-row" role="radiogroup" aria-label={tx(lang, '카테고리', 'Category')}>
          {categoryOptions.map((opt) => {
            const selected = category === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`hig-filter-pill ${selected ? 'active' : ''}`}
                onClick={() => handleSelectCategory(opt.key)}
              >
                {selected && <Check size={14} strokeWidth={2.6} aria-hidden="true" />}
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Essential Sub-Part Selector for Accessories & Jewelry */}
      {subtypeOptions && (
        <div className="hig-field-group">
          <label className="hig-field-label">
            {tx(lang, '착용 부위 · 세부 종류', 'Body Part / Sub-Type')}
          </label>
          <div
            className="hig-pill-row"
            role="group"
            data-add-subpart-group={category}
            aria-label={tx(lang, '착용 부위', 'Body Part')}
          >
            {subtypeOptions.map((opt) => {
              const selected = subpart === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  data-add-subpart-btn={opt.key}
                  aria-pressed={selected}
                  className={`hig-filter-pill ${selected ? 'active' : ''}`}
                  onClick={() => setSubpart(opt.key)}
                >
                  {selected && <Check size={14} strokeWidth={2.6} aria-hidden="true" />}
                  <span>{tx(lang, opt.ko, opt.en)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Essential Properties 2 & 3: Name & Brand with 48x48px Clear Buttons */}
      <div className="hig-field-grid-2">
        <div className="hig-field-group">
          <label htmlFor="add-garment-name-input" className="hig-field-label">
            {tx(lang, '아이템명 (필수)', 'Name (Required)')}
          </label>
          <ClearableField
            id="add-garment-name-input"
            type="text"
            className="hig-native-input"
            placeholder={tx(lang, '캐시미어 크루넥', 'Cashmere Crewneck')}
            clearLabel={tx(lang, '아이템명 지우기', 'Clear item name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
          />
        </div>

        <div className="hig-field-group">
          <label htmlFor="add-garment-brand-input" className="hig-field-label">
            {tx(lang, '브랜드', 'Brand')}
          </label>
          <ClearableField
            id="add-garment-brand-input"
            type="text"
            className="hig-native-input"
            placeholder="Lemaire"
            clearLabel={tx(lang, '브랜드 지우기', 'Clear brand')}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            maxLength={80}
          />
        </div>
      </div>

      {/* Progressive Disclosure: Collapsible Optional Metadata Accordion */}
      <div className="wd-ux-accordion">
        <button
          type="button"
          className="wd-ux-accordion-trigger"
          aria-expanded={detailsExpanded}
          aria-controls="add-garment-optional-panel"
          onClick={() => {
            triggerHaptic('selection');
            setDetailsExpanded((prev) => !prev);
          }}
        >
          <span className="wd-ux-accordion-summary">
            <span>{tx(lang, '선택 입력 더보기', 'More Optional Details')}</span>
            <span className="wd-ux-accordion-sub">
              {tx(
                lang,
                `${activeSeasonSummary} · ${activeMaterialLabel} · 사이즈/구매가/세탁 메모`,
                `${activeSeasonSummary} · ${activeMaterialLabel} · Size, Price & Care Notes`
              )}
            </span>
          </span>
          <span
            className={`wd-ux-accordion-chevron ${detailsExpanded ? 'is-open' : ''}`}
            aria-hidden="true"
          >
            <ChevronDown size={17} strokeWidth={2.2} />
          </span>
        </button>

        {detailsExpanded && (
          <div id="add-garment-optional-panel" className="wd-ux-accordion-body">
            {/* Inline 5-Chip Season Selector (zero <select>) */}
            <div className="hig-field-group">
              <label className="hig-field-label">{tx(lang, '착용 계절', 'Season')}</label>
              <div
                className="hig-pill-row"
                role="group"
                aria-label={tx(lang, '착용 계절 선택', 'Select Season')}
              >
                {SEASON_CHIP_OPTIONS.map((chip) => {
                  const active =
                    chip.key === '사계절'
                      ? isAllSeasons
                      : !isAllSeasons && seasons.includes(chip.key);
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      data-add-season-chip={chip.key}
                      aria-pressed={active}
                      className={`hig-filter-pill ${active ? 'active' : ''}`}
                      onClick={() => handleToggleSeasonChip(chip.key)}
                    >
                      {active && <Check size={14} strokeWidth={2.6} aria-hidden="true" />}
                      <span>{tx(lang, chip.ko, chip.en)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Inline Material Selector */}
            <div className="hig-field-group">
              <label className="hig-field-label">{tx(lang, '소재', 'Material')}</label>
              <div
                className="hig-pill-row"
                role="group"
                data-add-material-group="true"
                aria-label={tx(lang, '소재', 'Material')}
              >
                {MATERIAL_OPTIONS.map((mat) => {
                  const selected = material === mat.key;
                  return (
                    <button
                      key={mat.key}
                      type="button"
                      data-add-material-btn={mat.key}
                      aria-pressed={selected}
                      className={`hig-filter-pill ${selected ? 'active' : ''}`}
                      onClick={() => setMaterial(mat.key)}
                    >
                      {selected && <Check size={14} strokeWidth={2.6} aria-hidden="true" />}
                      <span>{tx(lang, mat.ko, mat.en)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Size & Price */}
            <div className="hig-field-grid-2">
              <div className="hig-field-group">
                <label htmlFor="add-garment-size-input" className="hig-field-label">
                  {tx(lang, '사이즈', 'Size')}
                </label>
                <ClearableField
                  id="add-garment-size-input"
                  type="text"
                  className="hig-native-input"
                  placeholder="M / 100 / 270"
                  clearLabel={tx(lang, '사이즈 지우기', 'Clear size')}
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  maxLength={32}
                />
                <div className="hig-quick-size-chips">
                  {QUICK_SIZES.map((sz) => {
                    const active = size === sz;
                    return (
                      <button
                        key={sz}
                        type="button"
                        aria-pressed={active}
                        className={`hig-mini-chip ${active ? 'active' : ''}`}
                        onClick={() => setSize(sz)}
                      >
                        {active && <Check size={12} strokeWidth={2.6} aria-hidden="true" />}
                        <span>{sz}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="hig-field-group">
                <label htmlFor="add-garment-price-input" className="hig-field-label">
                  {tx(lang, '구매가 (원)', 'Purchase Price (KRW)')}
                </label>
                <ClearableField
                  id="add-garment-price-input"
                  type="number"
                  inputMode="numeric"
                  className="hig-native-input tabular-nums"
                  placeholder="189000"
                  clearLabel={tx(lang, '구매가 지우기', 'Clear price')}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  min={0}
                />
              </div>
            </div>

            {/* Care / Styling Memo */}
            <div className="hig-field-group">
              <label htmlFor="add-garment-memo-input" className="hig-field-label">
                {tx(lang, '세탁 · 스타일링 메모', 'Care & Styling Notes')}
              </label>
              <ClearableField
                as="textarea"
                id="add-garment-memo-input"
                className="hig-native-textarea"
                rows={2}
                placeholder={tx(
                  lang,
                  '드라이클리닝 권장, 봄·가을 출근룩 레이어드용',
                  'Dry clean recommended, great for layered office looks'
                )}
                clearLabel={tx(lang, '메모 지우기', 'Clear memo')}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                maxLength={500}
              />
            </div>
          </div>
        )}
      </div>

      <button
        id={CARBON_DOM_CONTRACT.wardrobeSubmitAddBtnId}
        type="submit"
        className="hig-primary-cta-btn"
        disabled={processing || submitting || !processedAsset}
      >
        <Check size={18} aria-hidden="true" />
        <span>
          {submitting
            ? tx(lang, '저장 중...', 'Saving...')
            : tx(lang, '옷장에 추가', 'Add to Wardrobe')}
        </span>
      </button>
    </form>
  );
}

export default function AddGarmentModal({
  open,
  activeCloset,
  lang = 'ko',
  onClose,
  onRegistered,
  showToast,
}) {
  return (
    <ResponsiveSheetModal
      open={open}
      onClose={onClose}
      lang={lang}
      title={tx(lang, '옷 등록', 'Add Item')}
      maxWidth={500}
    >
      {open && (
        <AddGarmentForm
          activeCloset={activeCloset}
          lang={lang}
          onClose={onClose}
          onRegistered={onRegistered}
          showToast={showToast}
        />
      )}
    </ResponsiveSheetModal>
  );
}
