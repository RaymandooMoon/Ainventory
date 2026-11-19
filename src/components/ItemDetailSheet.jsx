import { useState } from 'react';
import { Check, Layers, Trash2 } from 'lucide-react';
import {
  CARBON_DOM_CONTRACT,
  WARDROBE_CATEGORY_OPTIONS,
  normalizeWardrobeCategoryKey,
} from '../contracts/carbonDesignContract.ts';
import { apiFetch } from '../utils/api.ts';
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
import GarmentObject25D from './GarmentObject25D.jsx';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

const QUICK_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'FREE'];

function ItemDetailContent({
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
  const rawMemoSource = garment.memo ?? garment.notes ?? '';
  const initialDisplayMemo = localizeGarmentMemo(rawMemoSource, lang);

  const initialBagSpec = inferBagCarrySpec(garment);
  const [name, setName] = useState(() => initialDisplayName);
  const [brand, setBrand] = useState(() => initialDisplayBrand);
  const [category, setCategory] = useState(() => normalizeWardrobeCategoryKey(garment.category));
  const [size, setSize] = useState(() => garment.size || '');
  const [memo, setMemo] = useState(() => initialDisplayMemo);
  const [hasStrap, setHasStrap] = useState(() => Boolean(initialBagSpec.has_strap));
  const [bagCarryStyle, setBagCarryStyle] = useState(
    () => initialBagSpec.bag_carry_style || 'hand_only'
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isBagItem = initialBagSpec.isBag;

  const handleSave = async (e) => {
    e.preventDefault();
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
        size: size.trim(),
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
  const purchasePrice = Number(garment.purchase_price || 0);
  const cpwText =
    purchasePrice > 0
      ? `₩${Math.round(purchasePrice / Math.max(1, wearCount)).toLocaleString('ko-KR')}`
      : garment.season || tx(lang, '사계절', 'All-Season');

  return (
    <div className="hig-item-detail-body">
      {/* Interactive Tilt-Responsive Zoomed Garment View */}
      <div className="hig-detail-25d-squircle">
        <GarmentObject25D
          stageId={CARBON_DOM_CONTRACT.itemDetailTiltStageId}
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
            {localizeMaterialLabel(garment.fabric, lang)}
          </span>
        </div>
      </div>

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
          <label htmlFor="detail-memo-input" className="hig-field-label">
            {tx(lang, '메모', 'Memo')}
          </label>
          <textarea
            id="detail-memo-input"
            className="hig-native-textarea"
            rows={2}
            placeholder={tx(
              lang,
              '핏, 소재, 수선 또는 스타일링 메모',
              'Fit, fabric, tailoring, or styling notes'
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
    </div>
  );
}

export default function ItemDetailSheet({
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
