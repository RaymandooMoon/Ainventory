import { useState } from 'react';
import { Check, Layers, Trash2 } from 'lucide-react';
import {
  CARBON_DOM_CONTRACT,
  WARDROBE_CATEGORY_OPTIONS,
  normalizeWardrobeCategoryKey,
} from '../contracts/carbonDesignContract.ts';
import { apiFetch } from '../utils/api.ts';
import { tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
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
  const [name, setName] = useState(() => garment.name || '');
  const [brand, setBrand] = useState(() => garment.brand || '');
  const [category, setCategory] = useState(() => normalizeWardrobeCategoryKey(garment.category));
  const [size, setSize] = useState(() => garment.size || '');
  const [memo, setMemo] = useState(() => garment.memo ?? garment.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const catOpt =
        WARDROBE_CATEGORY_OPTIONS.find((opt) => opt.key === category) ||
        WARDROBE_CATEGORY_OPTIONS[0];
      const currentNormCat = normalizeWardrobeCategoryKey(garment.category);
      const payload = {
        name: name.trim() || garment.name,
        brand: brand.trim(),
        category: catOpt.key,
        ...(catOpt.key !== currentNormCat ? { subcategory: catOpt.defaultSubcategory } : {}),
        size: size.trim(),
        memo: memo.trim(),
        notes: memo.trim(),
      };

      const res = await apiFetch(`/garments/${garment.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      triggerHaptic('selection');
      onUpdated?.(res?.garment || { ...garment, ...payload });
      showToast?.(tx(lang, '아이템 정보가 저장되었습니다.', 'Item details saved.'));
    } catch (err) {
      showToast?.(err?.message || tx(lang, '저장에 실패했습니다.', 'Failed to save changes.'));
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
      showToast?.(err?.message || tx(lang, '삭제에 실패했습니다.', 'Failed to delete item.'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="hig-item-detail-body">
      {/* Interactive Tilt-Responsive Zoomed Garment View */}
      <div className="hig-detail-25d-squircle">
        <GarmentObject25D
          stageId={CARBON_DOM_CONTRACT.itemDetailTiltStageId}
          item={garment}
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
            <span>{garment.color_name || garment.color_hex}</span>
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

  return (
    <ResponsiveSheetModal
      id={CARBON_DOM_CONTRACT.garmentDetailSheetId}
      open={open}
      onClose={onClose}
      lang={lang}
      title={garment.name}
      eyebrow={garment.brand || undefined}
      maxWidth={560}
    >
      <ItemDetailContent
        key={garment.id}
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
