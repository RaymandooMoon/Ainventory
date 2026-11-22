import { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Globe, Image as ImageIcon, Sparkles, Wand2 } from 'lucide-react';
import {
  applyOfficialSyncSelection,
  buildOfficialSyncFields,
} from '../utils/garmentRegistrationStepper.ts';
import { tx } from '../utils/i18n.ts';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

export default function OfficialInfoSyncModal({
  open,
  lang = 'ko',
  webMatch,
  currentValues,
  currentFrontImage,
  officialImageCutout,
  onClose,
  onConfirmSync,
  onRunStudioInstead,
}) {
  const fieldRows = useMemo(
    () => buildOfficialSyncFields(webMatch, currentValues, lang),
    [webMatch, currentValues, lang]
  );

  const hasOfficialPhoto = Boolean(officialImageCutout || webMatch?.official_image_data);
  const officialPhotoSrc = officialImageCutout || webMatch?.official_image_data || null;

  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [syncPhoto, setSyncPhoto] = useState(true);

  useEffect(() => {
    if (!open || !webMatch?.found) return;
    setSelectedKeys(new Set(fieldRows.filter((r) => r.defaultChecked).map((r) => r.key)));
    setSyncPhoto(Boolean(officialImageCutout || webMatch?.official_image_data));
  }, [open, webMatch, fieldRows, officialImageCutout]);

  if (!webMatch?.found) return null;

  const allSelected = fieldRows.length > 0 && selectedKeys.size === fieldRows.length;
  const totalSelectedCount = selectedKeys.size + (hasOfficialPhoto && syncPhoto ? 1 : 0);

  const toggleField = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(fieldRows.map((r) => r.key)));
    }
  };

  const handleApply = () => {
    const result = applyOfficialSyncSelection(
      webMatch,
      selectedKeys,
      hasOfficialPhoto && syncPhoto
    );
    onConfirmSync?.(result);
    onClose?.();
  };

  const confidenceLabel =
    webMatch.confidence === 'high'
      ? tx(lang, '공식 DB 높은 일치도', 'High Confidence Match')
      : tx(lang, '공식 DB 추천 매칭', 'Recommended Match');

  return (
    <ResponsiveSheetModal
      open={open}
      onClose={onClose}
      lang={lang}
      eyebrow={tx(lang, '케어라벨 · 목탭 브랜드 DB 매칭', 'Care Label · Brand DB Match')}
      title={tx(lang, '공식 제품 정보 동기화', 'Sync Official Product Info')}
      maxWidth={540}
    >
      <div className="hig-sync-modal-body" data-official-sync-modal="true">
        {/* Match Confidence & Source Strip */}
        <div className="hig-sync-meta-strip">
          <span className="hig-sync-confidence-pill">
            <Sparkles size={13} />
            <span>{confidenceLabel}</span>
          </span>
          {Array.isArray(webMatch.sources) && webMatch.sources.length > 0 && (
            <div className="hig-sync-source-links">
              {webMatch.sources.slice(0, 2).map((src) => (
                <a
                  key={src.uri}
                  href={src.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hig-web-source-link"
                >
                  <span>{src.title}</span>
                  <ExternalLink size={11} />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Clean Official Product Photo Comparison */}
        <section
          className="hig-sync-photo-section"
          aria-label={tx(lang, '제품 사진 비교', 'Product Photo Comparison')}
        >
          <div className="hig-sync-section-head">
            <span className="hig-sync-section-title">
              <ImageIcon size={14} />
              <span>{tx(lang, '깔끔한 공식 제품 사진 제안', 'Clean Official Product Photo')}</span>
            </span>
            {hasOfficialPhoto && (
              <label className="hig-sync-checkbox-inline">
                <input
                  type="checkbox"
                  checked={syncPhoto}
                  onChange={(e) => setSyncPhoto(e.target.checked)}
                />
                <span>{tx(lang, '대표 사진 교체', 'Use Official Photo')}</span>
              </label>
            )}
          </div>

          <div className="hig-sync-photo-compare-grid">
            <div className="hig-sync-photo-box">
              <span className="hig-sync-photo-caption">{tx(lang, '내 촬영 앞면', 'My Front Shot')}</span>
              <div className="hig-sync-photo-frame">
                {currentFrontImage ? (
                  <img src={currentFrontImage} alt={tx(lang, '내 촬영 사진', 'Captured front photo')} />
                ) : (
                  <span className="hig-sync-photo-empty">{tx(lang, '미촬영', 'Not captured')}</span>
                )}
              </div>
            </div>

            <div className={`hig-sync-photo-box ${hasOfficialPhoto && syncPhoto ? 'is-selected' : ''}`}>
              <span className="hig-sync-photo-caption">
                {tx(lang, '공식 제품 사진', 'Official Studio Photo')}
              </span>
              <div className="hig-sync-photo-frame is-official">
                {officialPhotoSrc ? (
                  <img
                    src={officialPhotoSrc}
                    alt={webMatch.official_name || tx(lang, '공식 제품 사진', 'Official product photo')}
                  />
                ) : (
                  <div className="hig-sync-photo-blocked">
                    <Globe size={18} />
                    <span>{tx(lang, '공식몰 이미지 직접 가져오기 제한', 'Direct image blocked by store')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {hasOfficialPhoto ? (
            <p className="hig-sync-photo-hint">
              {tx(
                lang,
                '공식 사진으로 교체해도 직접 촬영한 앞·뒷면 실사 원본은 상세 화면에 함께 보관됩니다.',
                'Even when using the official photo, your captured front & back photos remain safely archived.'
              )}
            </p>
          ) : (
            onRunStudioInstead && (
              <button
                type="button"
                className="hig-web-apply-secondary"
                onClick={() => {
                  onClose?.();
                  onRunStudioInstead?.();
                }}
              >
                <Wand2 size={14} />
                <span>{tx(lang, '내 촬영 사진 AI 스튜디오 보정하기', 'Refine My Photo with AI Studio')}</span>
              </button>
            )
          )}
        </section>

        {/* Selectable Official Fields List */}
        <section
          className="hig-sync-fields-section"
          aria-label={tx(lang, '동기화할 공식 상세 정보', 'Official Spec Fields to Sync')}
        >
          <div className="hig-sync-section-head">
            <span className="hig-sync-section-title">
              {tx(lang, '매칭된 공식 상세 정보', 'Matched Official Specifications')}
              <span className="hig-sync-count-badge tabular-nums">
                {selectedKeys.size}/{fieldRows.length}
              </span>
            </span>
            <button type="button" className="hig-sync-select-all-btn" onClick={handleToggleAll}>
              {allSelected ? tx(lang, '전체 해제', 'Deselect All') : tx(lang, '전체 선택', 'Select All')}
            </button>
          </div>

          <div className="hig-sync-field-list">
            {fieldRows.map((row) => {
              const checked = selectedKeys.has(row.key);
              return (
                <label
                  key={row.key}
                  className={`hig-sync-field-row ${checked ? 'is-checked' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleField(row.key)}
                  />
                  <div className="hig-sync-field-content">
                    <div className="hig-sync-field-top">
                      <span className="hig-sync-field-label">{row.label}</span>
                      {row.changed && (
                        <span className="hig-sync-diff-tag">
                          {row.currentValue
                            ? tx(lang, '업데이트', 'Update')
                            : tx(lang, '자동 입력', 'Auto-fill')}
                        </span>
                      )}
                    </div>
                    <div className="hig-sync-field-values tabular-nums">
                      {row.currentValue && row.changed && (
                        <span className="hig-sync-old-val">{row.currentValue}</span>
                      )}
                      <span className="hig-sync-new-val">{row.officialValue}</span>
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        {/* Modal Footer */}
        <div className="hig-sync-modal-footer">
          <button type="button" className="hig-web-apply-ghost" onClick={onClose}>
            {tx(lang, '취소', 'Cancel')}
          </button>
          <button
            type="button"
            className="hig-primary-cta-btn hig-sync-confirm-btn"
            disabled={totalSelectedCount === 0}
            onClick={handleApply}
          >
            <Check size={16} />
            <span className="tabular-nums">
              {tx(
                lang,
                `선택 정보 자동 업데이트 (${totalSelectedCount}개)`,
                `Sync Selected (${totalSelectedCount})`
              )}
            </span>
          </button>
        </div>
      </div>
    </ResponsiveSheetModal>
  );
}
