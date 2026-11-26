import {
  Check,
  ExternalLink,
  Eye,
  Globe,
  Loader2,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { localizeColorName, tx } from '../utils/i18n.ts';
import GarmentObject25D from './GarmentObject25D.jsx';

export function CompactPreviewBar({
  lang = 'ko',
  activeSide,
  onChangeSide,
  showOriginal,
  onToggleOriginal,
  frontOriginal,
  backOriginal,
  frontCutout,
  backCutout,
  officialImageCutout,
  usingOfficialPhoto,
  onToggleOfficialPhoto,
  cutoutStatusFront,
  cutoutStatusBack,
  needsStudioFront,
  needsStudioBack,
  studioBusySide,
  onRunStudioRefinement,
  category,
  colorHex,
  colorName,
  name,
  analysisStatus,
}) {
  const isFront = activeSide === 'front';
  const currentCutout = isFront
    ? usingOfficialPhoto && officialImageCutout
      ? officialImageCutout
      : frontCutout?.cutoutDataUrl || null
    : backCutout?.cutoutDataUrl || null;
  const currentOriginal = isFront ? frontOriginal : backOriginal;
  const displaySrc = showOriginal ? currentOriginal : currentCutout || currentOriginal;
  const currentStatus = isFront ? cutoutStatusFront : cutoutStatusBack;
  const currentNeedsStudio = isFront ? needsStudioFront : needsStudioBack;
  const isStudioBusy = studioBusySide === activeSide;
  const isLocalWorking =
    currentStatus === 'processing_local' ||
    (isFront && cutoutStatusFront === 'idle') ||
    (!isFront && Boolean(backOriginal) && cutoutStatusBack === 'idle');

  const statusText = (() => {
    if (usingOfficialPhoto && isFront) {
      return tx(lang, '공식 상품 이미지 적용됨', 'Official product photo applied');
    }
    if (isStudioBusy || currentStatus === 'processing_studio') {
      return tx(lang, 'AI 스튜디오 배경 제거 보정 중...', 'Refining with AI Studio...');
    }
    if (isLocalWorking) {
      return isFront
        ? tx(lang, '앞면 배경 제거 처리 중...', 'Cutting out front in background...')
        : tx(lang, '뒷면 배경 제거 처리 중...', 'Cutting out back in background...');
    }
    if (currentStatus === 'ready_studio') {
      return tx(lang, 'AI 스튜디오 배경 제거 완료', 'AI Studio cutout ready');
    }
    if (currentNeedsStudio) {
      return tx(lang, '배경 복잡 · AI 스튜디오 보정 권장', 'Complex background · AI Studio recommended');
    }
    if (currentCutout) {
      return cutoutStatusBack === 'processing_local' && isFront
        ? tx(lang, '앞면 배경 제거 완료 · 뒷면 정리 중...', 'Front ready · cutting back...')
        : tx(lang, '배경 제거 완료', 'Cutout ready');
    }
    return tx(lang, '원본 미리보기', 'Original preview');
  })();

  return (
    <div className="hig-reg-sticky-preview">
      <div className="hig-reg-preview-thumb-box">
        {displaySrc ? (
          showOriginal ? (
            <img
              src={displaySrc}
              alt={name || 'Preview'}
              className="hig-reg-preview-raw-img"
            />
          ) : (
            <GarmentObject25D
              src={displaySrc}
              category={category}
              colorHex={colorHex}
              alt={name || 'Preview'}
              interactive={false}
              padding="8%"
            />
          )
        ) : null}

        {(isLocalWorking || isStudioBusy) && (
          <div className="hig-reg-thumb-progress" aria-hidden="true">
            <Loader2 size={16} className="hig-spin" />
          </div>
        )}
      </div>

      <div className="hig-reg-preview-meta">
        <div className="hig-reg-preview-top-row">
          <div className="hig-reg-preview-title-wrap">
            <span className="hig-reg-preview-title">
              {name?.trim() ||
                (analysisStatus === 'analyzing'
                  ? tx(lang, 'AI가 의류를 분석 중...', 'Analyzing garment...')
                  : tx(lang, '새 의류 아이템', 'New Garment'))}
            </span>
            <span className="hig-reg-preview-sub tabular-nums">
              <span
                className="hig-detail-color-dot"
                style={{ backgroundColor: colorHex || '#3B3D42' }}
              />
              <span>{localizeColorName(colorName, lang) || colorHex}</span>
              <span aria-hidden="true">·</span>
              <span className={currentNeedsStudio && !usingOfficialPhoto ? 'is-warn-text' : ''}>
                {statusText}
              </span>
            </span>
          </div>
        </div>

        <div className="hig-reg-preview-controls">
          <div className="hig-reg-segment" role="tablist" aria-label={tx(lang, '앞뒷면 전환', 'Front and back view')}>
            <button
              type="button"
              role="tab"
              aria-selected={isFront}
              className={`hig-reg-seg-btn ${isFront ? 'active' : ''}`}
              onClick={() => onChangeSide('front')}
            >
              {tx(lang, '앞면', 'Front')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isFront}
              className={`hig-reg-seg-btn ${!isFront ? 'active' : ''}`}
              disabled={!backOriginal}
              onClick={() => onChangeSide('back')}
            >
              {tx(lang, '뒷면', 'Back')}
            </button>
          </div>

          {currentCutout && (
            <button
              type="button"
              className={`hig-reg-mini-btn ${showOriginal ? 'active' : ''}`}
              onClick={onToggleOriginal}
              title={tx(lang, '원본과 배경 제거 비교', 'Compare original and cutout')}
            >
              <Eye size={13} />
              <span>{showOriginal ? tx(lang, '배경 제거 보기', 'Cutout') : tx(lang, '원본 비교', 'Original')}</span>
            </button>
          )}

          {officialImageCutout && isFront && (
            <button
              type="button"
              className={`hig-reg-mini-btn ${usingOfficialPhoto ? 'active' : ''}`}
              onClick={onToggleOfficialPhoto}
            >
              <Globe size={13} />
              <span>{usingOfficialPhoto ? tx(lang, '내 실사', 'My Photo') : tx(lang, '공식 사진', 'Official')}</span>
            </button>
          )}

          {!usingOfficialPhoto && currentOriginal && (
            <button
              type="button"
              className={`hig-reg-mini-btn ${currentNeedsStudio ? 'is-recommended' : ''}`}
              disabled={Boolean(studioBusySide)}
              onClick={() => onRunStudioRefinement(activeSide)}
            >
              {isStudioBusy ? (
                <Loader2 size={13} className="hig-spin" />
              ) : (
                <Wand2 size={13} />
              )}
              <span>{tx(lang, 'AI 스튜디오 보정', 'AI Studio Cutout')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function OfficialProductProposalCard({
  lang = 'ko',
  webLookupStatus,
  webMatch,
  onApplyAll,
  onApplyInfoOnly,
  onOpenSyncModal,
  onDismiss,
  onRunStudioInstead,
}) {
  if (webLookupStatus === 'searching') {
    return (
      <div className="hig-web-match-banner is-loading" role="status" aria-live="polite">
        <Loader2 size={16} className="hig-spin" />
        <span>
          {tx(
            lang,
            '목탭·내부 세탁 케어 라벨 정보로 공식 브랜드 DB를 검색하고 있어요...',
            'Searching official brand database using neck & care tag...'
          )}
        </span>
      </div>
    );
  }

  if (webLookupStatus !== 'found' || !webMatch?.found) {
    return null;
  }

  const priceFormatted =
    webMatch.retail_price_krw > 0
      ? `₩${Number(webMatch.retail_price_krw).toLocaleString('ko-KR')}`
      : '';

  return (
    <section
      className="hig-web-match-card"
      aria-label={tx(lang, '공식 브랜드 DB 매칭 제안', 'Official Brand DB Suggestion')}
    >
      <div className="hig-web-match-header">
        <div className="hig-web-match-eyebrow">
          <Sparkles size={14} />
          <span>
            {tx(
              lang,
              '공식 브랜드 DB에서 일치하는 제품을 찾았어요',
              'Matching official product found in brand DB'
            )}
          </span>
        </div>
        <button
          type="button"
          className="hig-web-match-close"
          aria-label={tx(lang, '닫기', 'Dismiss')}
          onClick={onDismiss}
        >
          <X size={15} />
        </button>
      </div>

      <div className="hig-web-match-body">
        {webMatch.official_image_data ? (
          <div className="hig-web-match-thumb">
            <img
              src={webMatch.official_image_data}
              alt={webMatch.official_name || 'Official product'}
            />
          </div>
        ) : (
          <div className="hig-web-match-thumb is-placeholder">
            <Globe size={20} />
            <span>{tx(lang, '이미지 차단됨', 'Site blocks image')}</span>
          </div>
        )}

        <div className="hig-web-match-info">
          <div className="hig-web-match-brand-row">
            {webMatch.brand && <strong>{webMatch.brand}</strong>}
            {webMatch.product_code && (
              <span className="hig-web-match-code tabular-nums">{webMatch.product_code}</span>
            )}
          </div>
          <p className="hig-web-match-name">{webMatch.official_name}</p>
          <p className="hig-web-match-specs tabular-nums">
            {[priceFormatted, webMatch.color_name, webMatch.material_composition]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {webMatch.image_fetch_blocked && (
            <p className="hig-web-match-note">
              {tx(
                lang,
                '공식몰 정책으로 이미지는 직접 가져올 수 없어요. 정보만 적용하거나 내 사진에 AI 스튜디오 보정을 써 보세요.',
                'Official store blocks direct image fetch. Apply specs or use AI Studio Cutout on your photo.'
              )}
            </p>
          )}
          {Array.isArray(webMatch.sources) && webMatch.sources.length > 0 && (
            <div className="hig-web-match-sources">
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
      </div>

      <div className="hig-web-match-actions">
        {webMatch.official_image_data ? (
          <button
            type="button"
            className="hig-web-apply-primary"
            onClick={onApplyAll}
          >
            <Check size={14} />
            <span>{tx(lang, '공식 사진 + 정보 모두 업데이트', 'Apply Official Photo + Info')}</span>
          </button>
        ) : (
          <button
            type="button"
            className="hig-web-apply-primary"
            onClick={onApplyInfoOnly}
          >
            <Check size={14} />
            <span>{tx(lang, '공식 정보로 업데이트', 'Update with Official Info')}</span>
          </button>
        )}

        {onOpenSyncModal && (
          <button
            type="button"
            className="hig-web-apply-secondary"
            data-open-official-sync-modal="true"
            onClick={onOpenSyncModal}
          >
            <Sparkles size={13} />
            <span>{tx(lang, '정보 확인 및 동기화', 'Review & Sync')}</span>
          </button>
        )}

        {webMatch.official_image_data ? (
          <button
            type="button"
            className="hig-web-apply-secondary"
            onClick={onApplyInfoOnly}
          >
            {tx(lang, '정보만 적용 (내 사진 유지)', 'Info Only (Keep My Photo)')}
          </button>
        ) : (
          <button
            type="button"
            className="hig-web-apply-secondary"
            onClick={onRunStudioInstead}
          >
            <Wand2 size={13} />
            <span>{tx(lang, '내 사진 AI 스튜디오 보정', 'AI Studio Refine Mine')}</span>
          </button>
        )}

        <button type="button" className="hig-web-apply-ghost" onClick={onDismiss}>
          {tx(lang, '유지', 'Keep Mine')}
        </button>
      </div>
    </section>
  );
}
