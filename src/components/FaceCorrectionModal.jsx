import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Crosshair, RotateCcw, Upload, Users } from 'lucide-react';
import {
  clampNormalizedFaceBox,
  computeSingleFacePortraitRect,
} from '../utils/faceAnalysisDiagnostics.ts';
import { tx } from '../utils/i18n.ts';
import { triggerHaptic } from '../utils/nativeBridge.ts';
import { ResponsiveSheetModal } from './common/AppUI.jsx';

function buildInitialBox(initialBox, detectedFaces, selectedFaceIndex) {
  if (
    initialBox &&
    typeof initialBox.x === 'number' &&
    typeof initialBox.y === 'number' &&
    typeof initialBox.w === 'number' &&
    typeof initialBox.h === 'number'
  ) {
    return clampNormalizedFaceBox(initialBox);
  }
  const activeCand =
    Array.isArray(detectedFaces) && detectedFaces.length > 0
      ? detectedFaces[
          typeof selectedFaceIndex === 'number' &&
          selectedFaceIndex >= 0 &&
          selectedFaceIndex < detectedFaces.length
            ? selectedFaceIndex
            : 0
        ]
      : null;
  if (activeCand) {
    return clampNormalizedFaceBox({
      x: activeCand.x,
      y: activeCand.y,
      w: activeCand.w,
      h: activeCand.h,
    });
  }
  return clampNormalizedFaceBox({ x: 0.31, y: 0.16, w: 0.38, h: 0.44 });
}

export default function FaceCorrectionModal({
  open,
  lang = 'ko',
  sourceImageUrl = '',
  detectedFaces = [],
  initialFaceBox = null,
  selectedFaceIndex = 0,
  onClose,
  onConfirmFace,
  onRequestUpload,
  onRequestCamera,
}) {
  const stageRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const imgNaturalRef = useRef({ w: 0, h: 0 });
  const loadedImgRef = useRef(null);

  const [draftBox, setDraftBox] = useState(() =>
    buildInitialBox(initialFaceBox, detectedFaces, selectedFaceIndex)
  );
  const [activeCandidateIndex, setActiveCandidateIndex] = useState(() =>
    typeof selectedFaceIndex === 'number' && selectedFaceIndex >= 0 ? selectedFaceIndex : null
  );
  const [dragging, setDragging] = useState(false);
  const [imageReadySeq, setImageReadySeq] = useState(0);

  useEffect(() => {
    if (!open) return;
    setDraftBox(buildInitialBox(initialFaceBox, detectedFaces, selectedFaceIndex));
    setActiveCandidateIndex(
      typeof selectedFaceIndex === 'number' && selectedFaceIndex >= 0 ? selectedFaceIndex : null
    );
  }, [open, initialFaceBox, detectedFaces, selectedFaceIndex, sourceImageUrl]);

  useEffect(() => {
    if (!open || !sourceImageUrl) {
      loadedImgRef.current = null;
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      loadedImgRef.current = img;
      imgNaturalRef.current = {
        w: img.naturalWidth || img.width || 320,
        h: img.naturalHeight || img.height || 320,
      };
      setImageReadySeq((s) => s + 1);
    };
    img.src = sourceImageUrl;
    return () => {
      cancelled = true;
    };
  }, [open, sourceImageUrl]);

  // Live cropped single-face portrait preview so the user sees EXACTLY what AI VTON will memorize
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    const img = loadedImgRef.current;
    if (!open || !canvas || !img) return;
    const srcW = Math.max(1, imgNaturalRef.current.w || img.naturalWidth || 320);
    const srcH = Math.max(1, imgNaturalRef.current.h || img.naturalHeight || 320);
    const faceBoxPx = {
      cx: (draftBox.x + draftBox.w * 0.5) * srcW,
      cy: (draftBox.y + draftBox.h * 0.5) * srcH,
      w: draftBox.w * srcW,
      h: draftBox.h * srcH,
    };
    const rect = computeSingleFacePortraitRect(faceBoxPx, srcW, srcH);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1C1C1E';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    try {
      ctx.drawImage(
        img,
        rect.sx,
        rect.sy,
        rect.side,
        rect.side,
        0,
        0,
        canvas.width,
        canvas.height
      );
    } catch {
      // Ignore transient drawImage errors
    }
  }, [open, draftBox, imageReadySeq]);

  const boxSizePercent = useMemo(
    () => Math.round(Math.max(draftBox.w, draftBox.h) * 100),
    [draftBox.w, draftBox.h]
  );

  const repositionCenterFromPointer = (clientX, clientY) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const normX = Math.max(0.04, Math.min(0.96, (clientX - rect.left) / rect.width));
    const normY = Math.max(0.04, Math.min(0.96, (clientY - rect.top) / rect.height));
    setActiveCandidateIndex(null);
    setDraftBox((prev) =>
      clampNormalizedFaceBox({
        x: normX - prev.w * 0.5,
        y: normY - prev.h * 0.5,
        w: prev.w,
        h: prev.h,
      })
    );
  };

  const handleStagePointerDown = (e) => {
    if (e.target instanceof HTMLElement && e.target.closest('[data-face-candidate-btn="true"]')) {
      return;
    }
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
    repositionCenterFromPointer(e.clientX, e.clientY);
  };

  const handleStagePointerMove = (e) => {
    if (!dragging) return;
    repositionCenterFromPointer(e.clientX, e.clientY);
  };

  const handleStagePointerUp = (e) => {
    if (!dragging) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(false);
    triggerHaptic('selection');
  };

  const handleSelectCandidate = (cand) => {
    triggerHaptic('selection');
    setActiveCandidateIndex(cand.index);
    setDraftBox(
      clampNormalizedFaceBox({
        x: cand.x,
        y: cand.y,
        w: cand.w,
        h: cand.h,
      })
    );
  };

  const handleResizeBox = (nextPercent) => {
    const clampedPct = Math.max(12, Math.min(72, Number(nextPercent) || 34)) / 100;
    setActiveCandidateIndex(null);
    setDraftBox((prev) => {
      const cx = prev.x + prev.w * 0.5;
      const cy = prev.y + prev.h * 0.5;
      const ratio = prev.h / Math.max(0.08, prev.w);
      const nextW = clampedPct;
      const nextH = Math.min(0.9, Math.max(0.12, clampedPct * Math.min(1.4, Math.max(0.85, ratio))));
      return clampNormalizedFaceBox({
        x: cx - nextW * 0.5,
        y: cy - nextH * 0.5,
        w: nextW,
        h: nextH,
      });
    });
  };

  const handleResetBox = () => {
    triggerHaptic('selection');
    setDraftBox(buildInitialBox(initialFaceBox, detectedFaces, selectedFaceIndex));
    setActiveCandidateIndex(
      typeof selectedFaceIndex === 'number' && selectedFaceIndex >= 0 ? selectedFaceIndex : null
    );
  };

  const handleConfirm = () => {
    triggerHaptic('medium');
    onConfirmFace?.({
      manualFaceBox: clampNormalizedFaceBox(draftBox),
      selectedFaceIndex: activeCandidateIndex,
    });
  };

  return (
    <ResponsiveSheetModal
      id="face-correction-sheet"
      open={open}
      onClose={onClose}
      lang={lang}
      title={tx(lang, '내 얼굴 직접 선택 · 교정', 'Select & Correct My Face')}
      subtitle={tx(
        lang,
        '단체 사진이나 잘못 인식된 얼굴에서 본인 얼굴만 지정해 기억합니다',
        'Pin your own face so AI fitting remembers only you across refreshes'
      )}
      maxWidth={540}
      footer={
        <div className="face-correction-footer">
          <div className="face-correction-alt-actions">
            <button
              type="button"
              className="face-correction-ghost-btn"
              onClick={() => {
                onClose?.();
                onRequestUpload?.();
              }}
            >
              <Upload size={14} aria-hidden="true" />
              <span>{tx(lang, '다른 사진', 'Other Photo')}</span>
            </button>
            <button
              type="button"
              className="face-correction-ghost-btn"
              onClick={() => {
                onClose?.();
                onRequestCamera?.();
              }}
            >
              <Camera size={14} aria-hidden="true" />
              <span>{tx(lang, '다시 촬영', 'Retake')}</span>
            </button>
          </div>
          <button
            type="button"
            data-confirm-face-correction-btn="true"
            className="face-correction-primary-btn"
            onClick={handleConfirm}
          >
            <Check size={15} aria-hidden="true" />
            <span>{tx(lang, '이 얼굴로 고정 · 기억하기', 'Lock & Memorize My Face')}</span>
          </button>
        </div>
      }
    >
      <div className="face-correction-body" data-face-correction-modal="true">
        {Array.isArray(detectedFaces) && detectedFaces.length > 1 && (
          <div className="face-correction-candidate-bar" role="group">
            <span className="face-correction-candidate-label">
              <Users size={13} aria-hidden="true" />
              <span>
                {tx(
                  lang,
                  `감지된 얼굴 ${detectedFaces.length}명 — 본인 번호를 탭하세요`,
                  `${detectedFaces.length} faces detected — tap yours`
                )}
              </span>
            </span>
            <div className="face-correction-candidate-chips">
              {detectedFaces.map((cand, idx) => {
                const isSelected = activeCandidateIndex === cand.index;
                return (
                  <button
                    key={cand.id}
                    type="button"
                    data-face-candidate-chip={idx}
                    className={`face-correction-chip ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => handleSelectCandidate(cand)}
                  >
                    {tx(lang, `얼굴 ${idx + 1}`, `Face ${idx + 1}`)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Full-frame interactive selection stage (shrink-wraps image bounds for 1:1 coordinate accuracy) */}
        <div className="face-correction-stage-outer">
          <div
            ref={stageRef}
            className={`face-correction-stage ${dragging ? 'is-dragging' : ''}`}
            onPointerDown={handleStagePointerDown}
            onPointerMove={handleStagePointerMove}
            onPointerUp={handleStagePointerUp}
            onPointerCancel={handleStagePointerUp}
          >
            {sourceImageUrl && (
              <img
                src={sourceImageUrl}
                alt={tx(lang, '원본 업로드 사진', 'Uploaded source photo')}
                className="face-correction-source-img"
                draggable={false}
              />
            )}

            {/* Auto-detected clickable face boxes */}
            {Array.isArray(detectedFaces) &&
              detectedFaces.map((cand, idx) => {
                const isSelected = activeCandidateIndex === cand.index;
                return (
                  <button
                    key={cand.id}
                    type="button"
                    data-face-candidate-btn="true"
                    className={`face-correction-detected-box ${isSelected ? 'is-selected' : ''}`}
                    style={{
                      left: `${cand.x * 100}%`,
                      top: `${cand.y * 100}%`,
                      width: `${cand.w * 100}%`,
                      height: `${cand.h * 100}%`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectCandidate(cand);
                    }}
                    aria-label={tx(lang, `감지된 얼굴 ${idx + 1} 선택`, `Select detected face ${idx + 1}`)}
                  >
                    <span className="face-correction-box-num tabular-nums">{idx + 1}</span>
                  </button>
                );
              })}

            {/* Active locked target box */}
            <div
              className="face-correction-active-box"
              aria-hidden="true"
              style={{
                left: `${draftBox.x * 100}%`,
                top: `${draftBox.y * 100}%`,
                width: `${draftBox.w * 100}%`,
                height: `${draftBox.h * 100}%`,
              }}
            >
              <span className="face-correction-active-tag">
                <Crosshair size={11} aria-hidden="true" />
                <span>{tx(lang, '내 얼굴', 'My Face')}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Size control + live isolated single-face preview */}
        <div className="face-correction-preview-row">
          <div className="face-correction-crop-box">
            <canvas
              ref={previewCanvasRef}
              width={160}
              height={160}
              className="face-correction-crop-canvas"
              aria-label={tx(lang, 'AI 피팅에 반영될 내 얼굴 미리보기', 'Isolated face preview for AI fitting')}
            />
          </div>
          <div className="face-correction-controls">
            <div className="face-correction-preview-copy">
              <strong>
                {tx(lang, 'AI 피팅에 기억·반영될 내 얼굴', 'Isolated Face Memorized for AI')}
              </strong>
              <p>
                {tx(
                  lang,
                  '사진 위에서 내 얼굴 위치를 직접 탭하거나 드래그해 맞춘 뒤, 크기를 조절해 주세요. 새로고침 후에도 이 얼굴이 유지됩니다.',
                  'Tap or drag directly on your face above and adjust frame size. This face stays memorized across refreshes.'
                )}
              </p>
            </div>
            <div className="face-correction-slider-row">
              <label htmlFor="face-correction-size-range">
                <span>{tx(lang, '얼굴 프레임 크기', 'Face Frame Size')}</span>
                <span className="tabular-nums">{boxSizePercent}%</span>
              </label>
              <div className="face-correction-slider-controls">
                <input
                  id="face-correction-size-range"
                  type="range"
                  min={12}
                  max={72}
                  step={1}
                  value={boxSizePercent}
                  onChange={(e) => handleResizeBox(Number(e.target.value))}
                />
                <button
                  type="button"
                  className="face-correction-reset-mini"
                  onClick={handleResetBox}
                  title={tx(lang, '기본 위치로 되돌리기', 'Reset selection')}
                >
                  <RotateCcw size={13} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ResponsiveSheetModal>
  );
}
