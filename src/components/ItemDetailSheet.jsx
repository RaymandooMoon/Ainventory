import { useState } from 'react';
import { Check, Layers, Trash2 } from 'lucide-react';
import {
  CARBON_DOM_CONTRACT,
  WARDROBE_CATEGORY_OPTIONS,
  normalizeWardrobeCategoryKey,
} from '../contracts/carbonDesignContract.ts';
import { apiFetch } from '../utils/api.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import GarmentObject25D from './GarmentObject25D.jsx';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

const QUICK_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'FREE'];

function ItemDetailContent({
  garment,
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
      showToast?.('아이템 정보가 저장되었습니다.');
    } catch (err) {
      showToast?.(err?.message || '저장에 실패했습니다.');
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
      showToast?.('아이템이 삭제되었습니다.');
    } catch (err) {
      showToast?.(err?.message || '삭제에 실패했습니다.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="hig-item-detail-body">
      {/* Interactive 2.5D Tilt-Responsive Zoomed Garment View */}
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

        {/* Primary Action: Try in Outfits (Clearly Separated from Metadata Form & Delete) */}
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
          <span>Outfits에서 코디해보기</span>
        </button>

        {/* Editable Metadata Form */}
        <form onSubmit={handleSave} className="hig-detail-edit-form">
          <div className="hig-field-grid-2">
            <div className="hig-field-group">
              <label htmlFor="detail-name-input" className="hig-field-label">
                Name
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
                Brand
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
            <label className="hig-field-label">Category</label>
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
              Size
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
              Memo
            </label>
            <textarea
              id="detail-memo-input"
              className="hig-native-textarea"
              rows={2}
              placeholder="핏, 소재, 수선 또는 스타일링 메모"
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
              <span>{deleting ? '삭제 중...' : '삭제'}</span>
            </button>

            <button
              id={CARBON_DOM_CONTRACT.itemDetailSaveBtnId}
              type="submit"
              className="hig-secondary-save-btn"
              disabled={saving || deleting}
            >
              <Check size={16} />
              <span>{saving ? '저장 중...' : '정보 저장'}</span>
            </button>
          </div>
        </form>
      </div>
  );
}

export default function ItemDetailSheet({
  garment,
  open,
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
      title={garment.name}
      eyebrow={garment.brand || undefined}
      maxWidth={560}
    >
      <ItemDetailContent
        key={garment.id}
        garment={garment}
        onClose={onClose}
        onUpdated={onUpdated}
        onDeleted={onDeleted}
        onTryInOutfits={onTryInOutfits}
        showToast={showToast}
      />
    </ResponsiveSheetModal>
  );
}
