import { useRef, useState } from 'react';
import { Camera, Check, ImagePlus, Loader2 } from 'lucide-react';
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
import GarmentObject25D from './GarmentObject25D.jsx';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

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
  const [material, setMaterial] = useState('Fabric');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');

  const categoryOptions = [
    ...WARDROBE_CATEGORY_OPTIONS,
    {
      key: 'jewelry',
      label: tx(lang, '주얼리', 'Jewelry'),
      defaultSubcategory: 'necklace',
    },
  ];

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

  const handleSelectFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setProcessing(true);
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
      showToast?.(
        localizeApiMessage(err?.message, lang) ||
          tx(lang, '이미지를 처리하지 못했습니다.', 'Failed to process image.')
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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
    try {
      const catOption =
        categoryOptions.find((opt) => opt.key === category) || categoryOptions[0];
      const resolvedSubcategory =
        category === 'accessory' || category === 'jewelry'
          ? subpart
          : catOption.defaultSubcategory;
      const targetOwner = !activeCloset || activeCloset === 'all' ? 'sample' : activeCloset;

      const res = await apiFetch('/garments', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: targetOwner,
          name: trimmedName,
          brand: brand.trim(),
          category: catOption.key,
          subcategory: resolvedSubcategory,
          fabric: material,
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
      showToast?.(
        localizeApiMessage(err?.message, lang) ||
          tx(lang, '등록 중 오류가 발생했습니다.', 'Failed to save item.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const subtypeOptions =
    category === 'accessory'
      ? ACCESSORY_SUBTYPE_OPTIONS
      : category === 'jewelry'
        ? JEWELRY_SUBTYPE_OPTIONS
        : null;

  return (
    <form onSubmit={handleSubmit} className="hig-add-garment-form">
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
            <Loader2 size={28} className="hig-spin" />
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
                <ImagePlus size={18} />
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
                <Camera size={18} />
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

      {/* Category Pill Selector */}
      <div className="hig-field-group">
        <label className="hig-field-label">{tx(lang, '카테고리', 'Category')}</label>
        <div className="hig-pill-row" role="radiogroup" aria-label="Category">
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
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sub-Part Selector for Accessories & Jewelry */}
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
                  {tx(lang, opt.ko, opt.en)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Material Selector */}
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
                {tx(lang, mat.ko, mat.en)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Minimal Tags: Name & Brand */}
      <div className="hig-field-grid-2">
        <div className="hig-field-group">
          <label htmlFor="add-garment-name-input" className="hig-field-label">
            {tx(lang, '아이템명', 'Name')}
          </label>
          <input
            id="add-garment-name-input"
            type="text"
            className="hig-native-input"
            placeholder={tx(lang, '캐시미어 크루넥', 'Cashmere Crewneck')}
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
          <input
            id="add-garment-brand-input"
            type="text"
            className="hig-native-input"
            placeholder="Lemaire"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            maxLength={80}
          />
        </div>
      </div>

      <button
        id={CARBON_DOM_CONTRACT.wardrobeSubmitAddBtnId}
        type="submit"
        className="hig-primary-cta-btn"
        disabled={processing || submitting || !processedAsset}
      >
        <Check size={18} />
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
