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
  tx,
} from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { ClearableField, ExclusiveErrorCard } from './ExclusiveViewPrimitives.jsx';
import GarmentObject25D from './GarmentObject25D.jsx';
import { ResponsiveSheetModal } from './common/AppUI.jsx';
import './wardrobe/wardrobeUx.css';

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
  const initialPriceStr =
    Number(garment.price) > 0 ? String(Math.round(Number(garment.price))) : '';

  const [name, setName] = useState(() => initialDisplayName);
  const [brand, setBrand] = useState(() => initialDisplayBrand);
  const [category, setCategory] = useState(() => normalizeWardrobeCategoryKey(garment.category));
  const [size, setSize] = useState(() => garment.size || '');
  const [price, setPrice] = useState(() => initialPriceStr);
  const [memo, setMemo] = useState(() => initialDisplayMemo);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [lastFailedAction, setLastFailedAction] = useState('save');

  const performSave = async () => {
    setSaving(true);
    setDetailError(null);
    setLastFailedAction('save');
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
      const resolvedPrice =
        price.trim() !== '' && Number.isFinite(Number(price))
          ? Math.max(0, Math.round(Number(price)))
          : 0;

      const payload = {
        name: resolvedName,
        brand: resolvedBrand,
        category: catOpt.key,
        ...(catOpt.key !== currentNormCat ? { subcategory: catOpt.defaultSubcategory } : {}),
        size: size.trim(),
        price: resolvedPrice,
        memo: resolvedMemo,
        notes: resolvedMemo,
      };

      const res = await apiFetch(`/garments/${garment.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      triggerHaptic('selection');
      onUpdated?.(res?.garment || { ...garment, ...payload });
      showToast?.(tx(lang, '아이템 정보가 저장되었습니다.', 'Item details saved.'));
    } catch (err) {
      const msg =
        localizeApiMessage(err?.message, lang) ||
        tx(lang, '저장에 실패했습니다.', 'Failed to save changes.');
      setDetailError(msg);
      showToast?.(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    await performSave();
  };

  const handleDelete = async () => {
    setDeleting(true);
    setDetailError(null);
    setLastFailedAction('delete');
    try {
      await apiFetch(`/garments/${garment.id}`, { method: 'DELETE' });
      triggerHaptic('medium');
      onDeleted?.(garment.id);
      onClose?.();
      showToast?.(tx(lang, '아이템이 삭제되었습니다.', 'Item deleted.'));
    } catch (err) {
      const msg =
        localizeApiMessage(err?.message, lang) ||
        tx(lang, '삭제에 실패했습니다.', 'Failed to delete item.');
      setDetailError(msg);
      showToast?.(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="hig-item-detail-body wd-ux-detail-body">
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
        <Layers size={18} aria-hidden="true" />
        <span>{tx(lang, 'Outfits에서 코디해보기', 'Try in Outfits')}</span>
      </button>

      {detailError && (
        <ExclusiveErrorCard
          lang={lang}
          compact
          title={tx(lang, '작업 처리 중 오류가 발생했습니다', 'Action Failed')}
          message={detailError}
          onRetry={lastFailedAction === 'delete' ? handleDelete : performSave}
          retrying={saving || deleting}
        />
      )}

      {/* Editable Metadata Form */}
      <form onSubmit={handleSave} className="hig-detail-edit-form">
        <div className="hig-field-grid-2">
          <div className="hig-field-group">
            <label htmlFor="detail-name-input" className="hig-field-label">
              {tx(lang, '아이템명', 'Name')}
            </label>
            <ClearableField
              id="detail-name-input"
              type="text"
              className="hig-native-input"
              clearLabel={tx(lang, '아이템명 지우기', 'Clear item name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="hig-field-group">
            <label htmlFor="detail-brand-input" className="hig-field-label">
              {tx(lang, '브랜드', 'Brand')}
            </label>
            <ClearableField
              id="detail-brand-input"
              type="text"
              className="hig-native-input"
              placeholder="Brand"
              clearLabel={tx(lang, '브랜드 지우기', 'Clear brand')}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              maxLength={80}
            />
          </div>
        </div>

        <div className="hig-field-group">
          <label className="hig-field-label">{tx(lang, '카테고리', 'Category')}</label>
          <div
            className="hig-pill-row"
            role="radiogroup"
            aria-label={tx(lang, '카테고리', 'Item Category')}
          >
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
                  {active && <Check size={14} strokeWidth={2.6} aria-hidden="true" />}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="hig-field-group">
          <label htmlFor="detail-size-input" className="hig-field-label">
            {tx(lang, '사이즈', 'Size')}
          </label>
          <div className="hig-size-selector-row">
            <ClearableField
              id="detail-size-input"
              type="text"
              className="hig-native-input hig-size-input"
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
        </div>

        <div className="hig-field-group">
          <label htmlFor="detail-price-input" className="hig-field-label">
            {tx(lang, '구매가 (원)', 'Purchase Price (KRW)')}
          </label>
          <ClearableField
            id="detail-price-input"
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

        <div className="hig-field-group">
          <label htmlFor="detail-memo-input" className="hig-field-label">
            {tx(lang, '메모', 'Memo')}
          </label>
          <ClearableField
            as="textarea"
            id="detail-memo-input"
            className="hig-native-textarea"
            rows={2}
            placeholder={tx(
              lang,
              '핏, 소재, 수선 또는 스타일링 메모',
              'Fit, fabric, tailoring, or styling notes'
            )}
            clearLabel={tx(lang, '메모 지우기', 'Clear memo')}
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
            <Trash2 size={16} aria-hidden="true" />
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
            <Check size={16} aria-hidden="true" />
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
