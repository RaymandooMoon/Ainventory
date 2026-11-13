import { useRef, useState } from 'react';
import { Camera, Check, ImagePlus, Loader2 } from 'lucide-react';
import {
  CARBON_DOM_CONTRACT,
  WARDROBE_CATEGORY_OPTIONS,
} from '../contracts/carbonDesignContract.ts';
import { processGarmentUpload } from '../services/backgroundRemovalService.ts';
import { apiFetch } from '../utils/api.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import GarmentObject25D from './GarmentObject25D.jsx';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

function AddGarmentForm({ activeCloset, onClose, onRegistered, showToast }) {
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [processedAsset, setProcessedAsset] = useState(null);
  const [category, setCategory] = useState('top');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');

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
      setCategory(asset.suggestedCategory || 'top');
      setName((prev) => prev.trim() || asset.suggestedName || 'New Garment');
      triggerHaptic('selection');
    } catch (err) {
      showToast?.(err?.message || '이미지를 처리하지 못했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!processedAsset?.cutoutDataUrl) {
      showToast?.('의류 사진을 먼저 선택해주세요.');
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast?.('아이템 이름을 입력해주세요.');
      return;
    }

    setSubmitting(true);
    try {
      const catOption =
        WARDROBE_CATEGORY_OPTIONS.find((opt) => opt.key === category) ||
        WARDROBE_CATEGORY_OPTIONS[0];
      const targetOwner = !activeCloset || activeCloset === 'all' ? 'sample' : activeCloset;

      const res = await apiFetch('/garments', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: targetOwner,
          name: trimmedName,
          brand: brand.trim(),
          category: catOption.key,
          subcategory: catOption.defaultSubcategory,
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
      showToast?.(err?.message || '등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

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

        {/* 1:1 Normalized 2.5D Studio Preview Stage + Optical Scan Viewfinder */}
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
              <span>Cutout &amp; 2.5D Studio Normalization</span>
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
                  <span>Photo Library</span>
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
                  <span>Camera</span>
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
              <span>{processedAsset.dominantColorName || processedAsset.dominantColorHex}</span>
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
              Replace
            </button>
          )}
        </div>

        {/* Category Pill Selector */}
        <div className="hig-field-group">
          <label className="hig-field-label">Category</label>
          <div className="hig-pill-row" role="radiogroup" aria-label="Category">
            {WARDROBE_CATEGORY_OPTIONS.map((opt) => {
              const selected = category === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`hig-filter-pill ${selected ? 'active' : ''}`}
                  onClick={() => setCategory(opt.key)}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Minimal Tags: Name & Brand */}
        <div className="hig-field-grid-2">
          <div className="hig-field-group">
            <label htmlFor="add-garment-name-input" className="hig-field-label">
              Name
            </label>
            <input
              id="add-garment-name-input"
              type="text"
              className="hig-native-input"
              placeholder="Cashmere Crewneck"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
            />
          </div>

          <div className="hig-field-group">
            <label htmlFor="add-garment-brand-input" className="hig-field-label">
              Brand
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
          <span>{submitting ? 'Saving...' : 'Add to Wardrobe'}</span>
        </button>
    </form>
  );
}

export default function AddGarmentModal({
  open,
  activeCloset,
  onClose,
  onRegistered,
  showToast,
}) {
  return (
    <ResponsiveSheetModal
      open={open}
      onClose={onClose}
      title="Add Item"
      maxWidth={500}
    >
      {open && (
        <AddGarmentForm
          activeCloset={activeCloset}
          onClose={onClose}
          onRegistered={onRegistered}
          showToast={showToast}
        />
      )}
    </ResponsiveSheetModal>
  );
}
