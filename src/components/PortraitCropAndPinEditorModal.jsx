import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Crop,
  Crosshair,
  FlipHorizontal,
  RotateCcw,
  RotateCw,
  ScanFace,
  Sun,
  X,
} from 'lucide-react';
import {
  DEFAULT_SKIN_PINS,
  detectFaceAndSkinPins,
  disposeFaceLandmarker,
} from '../utils/faceLandmarkEngine.ts';
import { renderCroppedImageOutput } from '../utils/imageTools.js';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

const FACE_CROP_SHORTCUTS = [
  { key: 'full_face', label: '셀피 기본 프레임', box: { x: 0.12, y: 0.06, w: 0.76, h: 0.82 } },
  { key: 'fullbody_head', label: '전신샷 상단 얼굴 클로즈업', box: { x: 0.28, y: 0.03, w: 0.44, h: 0.30 } },
  { key: 'upper_portrait', label: '반신샷 얼굴 포커스', box: { x: 0.22, y: 0.05, w: 0.56, h: 0.46 } },
];

function PortraitCropAndPinEditorContent({
  imageSource,
  initialStage = 'crop',
  initialPins = null,
  onApply,
  onClose,
}) {
  const cropStageRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const dragRef = useRef(null);
  const pinContainerRef = useRef(null);

  const [stage, setStage] = useState(initialStage || 'crop');
  const [rotation90, setRotation90] = useState(0);
  const [straightenDeg, setStraightenDeg] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [cropBox, setCropBox] = useState({ x: 0.14, y: 0.06, w: 0.72, h: 0.78 });
  const [stageDims, setStageDims] = useState({ w: 360, h: 420 });

  const [croppedDataUrl, setCroppedDataUrl] = useState('');
  const [pins, setPins] = useState(initialPins || DEFAULT_SKIN_PINS);
  const [draggingPinId, setDraggingPinId] = useState(null);
  const [detectionInfo, setDetectionInfo] = useState(null);
  const [lowConfPopup, setLowConfPopup] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Escape key closes modal cleanly
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Release MediaPipe WASM FaceLandmarker + preview canvas backing store on close/unmount
  useEffect(() => {
    const canvasEl = cropCanvasRef.current;
    return () => {
      if (canvasEl) {
        canvasEl.width = 0;
        canvasEl.height = 0;
      }
      disposeFaceLandmarker();
    };
  }, []);

  // Smart initial crop based on natural aspect ratio (async onload only — zero sync setState)
  useEffect(() => {
    if (!imageSource) return undefined;
    let cancelled = false;
    const probe = new Image();
    probe.crossOrigin = 'anonymous';
    probe.onload = () => {
      if (cancelled) return;
      const ratio = (probe.naturalHeight || 1) / Math.max(1, probe.naturalWidth || 1);
      if (ratio > 1.45) {
        setCropBox({ x: 0.20, y: 0.04, w: 0.60, h: 0.44 });
      } else {
        setCropBox({ x: 0.12, y: 0.06, w: 0.76, h: 0.82 });
      }
    };
    probe.src = imageSource;
    return () => {
      cancelled = true;
    };
  }, [imageSource]);

  // Render live transformed preview canvas in Stage 1
  useEffect(() => {
    if (!imageSource || stage !== 'crop') return undefined;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled || !cropCanvasRef.current) return;
      const swap = Math.abs(rotation90 % 180) === 90;
      const iw = swap ? img.naturalHeight : img.naturalWidth;
      const ih = swap ? img.naturalWidth : img.naturalHeight;
      const maxW = Math.min(500, window.innerWidth - 56);
      const maxH = Math.min(390, Math.max(250, window.innerHeight - 360));
      const scale = Math.min(maxW / Math.max(1, iw), maxH / Math.max(1, ih));
      const cw = Math.max(180, Math.round(iw * scale));
      const ch = Math.max(180, Math.round(ih * scale));

      setStageDims({ w: cw, h: ch });
      const canvas = cropCanvasRef.current;
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1C1C1E';
      ctx.fillRect(0, 0, cw, ch);
      ctx.save();
      if (brightness !== 100) ctx.filter = `brightness(${brightness}%)`;
      ctx.translate(cw / 2, ch / 2);
      if (flipH) ctx.scale(-1, 1);
      ctx.rotate(((rotation90 + straightenDeg) * Math.PI) / 180);
      const dw = swap ? ch : cw;
      const dh = swap ? cw : ch;
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    };
    img.src = imageSource;
    return () => {
      cancelled = true;
    };
  }, [imageSource, stage, rotation90, straightenDeg, flipH, brightness]);

  const getClientXY = (e) => {
    const t = e.touches?.[0] || e.changedTouches?.[0];
    return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY };
  };

  const beginCropDrag = (e, handle) => {
    e.stopPropagation();
    const { x, y } = getClientXY(e);
    dragRef.current = { handle, startX: x, startY: y, startBox: { ...cropBox } };
  };

  const handleCropMove = (e) => {
    if (!dragRef.current || !cropStageRef.current) return;
    const rect = cropStageRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const { x, y } = getClientXY(e);
    const dx = (x - dragRef.current.startX) / rect.width;
    const dy = (y - dragRef.current.startY) / rect.height;
    const s = dragRef.current.startBox;
    const h = dragRef.current.handle;
    const minS = 0.14;

    if (h === 'move') {
      setCropBox({
        x: clamp(s.x + dx, 0, 1 - s.w),
        y: clamp(s.y + dy, 0, 1 - s.h),
        w: s.w,
        h: s.h,
      });
      return;
    }

    let nx = s.x;
    let ny = s.y;
    let nw = s.w;
    let nh = s.h;
    if (h.includes('e')) nw = clamp(s.w + dx, minS, 1 - s.x);
    if (h.includes('s')) nh = clamp(s.h + dy, minS, 1 - s.y);
    if (h.includes('w')) {
      const d = clamp(dx, -s.x, s.w - minS);
      nx = s.x + d;
      nw = s.w - d;
    }
    if (h.includes('n')) {
      const d = clamp(dy, -s.y, s.h - minS);
      ny = s.y + d;
      nh = s.h - d;
    }
    setCropBox({ x: nx, y: ny, w: nw, h: nh });
  };

  const endCropDrag = () => {
    dragRef.current = null;
  };

  const handleAutoLocateFace = async () => {
    setScanning(true);
    try {
      const fullOut = await renderCroppedImageOutput(imageSource, {
        rotation90,
        straightenDeg,
        flipH,
        brightness,
        studioCutout: false,
        cropBox: { x: 0, y: 0, w: 1, h: 1 },
        maxOutputSide: 640,
      });
      const det = await detectFaceAndSkinPins(fullOut.dataUrl, { rotationDeg: 0, cropRect: null });
      if (det?.meshPoints?.length > 4) {
        let minX = 1;
        let maxX = 0;
        let minY = 1;
        let maxY = 0;
        for (const pt of det.meshPoints) {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
        const padX = Math.max(0.08, (maxX - minX) * 0.48);
        const padY = Math.max(0.08, (maxY - minY) * 0.55);
        const nx = clamp(minX - padX, 0, 0.85);
        const ny = clamp(minY - padY, 0, 0.85);
        const nw = clamp(maxX - minX + padX * 2, 0.18, 1 - nx);
        const nh = clamp(maxY - minY + padY * 2, 0.18, 1 - ny);
        setCropBox({ x: nx, y: ny, w: nw, h: nh });
      } else {
        setCropBox({ x: 0.24, y: 0.04, w: 0.52, h: 0.36 });
      }
    } finally {
      setScanning(false);
    }
  };

  const proceedToPinStage = async (autoFinish = false) => {
    setScanning(true);
    try {
      const cropped = await renderCroppedImageOutput(imageSource, {
        rotation90,
        straightenDeg,
        flipH,
        brightness,
        studioCutout: false,
        cropBox,
        maxOutputSide: 680,
      });
      setCroppedDataUrl(cropped.dataUrl);
      const res = await detectFaceAndSkinPins(cropped.dataUrl, { rotationDeg: 0, cropRect: null });
      setDetectionInfo(res);
      const nextPins = res?.pins?.length === 4 ? res.pins : DEFAULT_SKIN_PINS;
      setPins(nextPins);

      if (autoFinish) {
        onApply?.({
          croppedDataUrl: res?.processedDataUrl || cropped.dataUrl,
          pins: nextPins,
          rotationDeg: 0,
          cropRect: null,
          detectionInfo: res,
        });
        return;
      }

      if (res?.isLowConfidence) setLowConfPopup(true);
      setStage('pins');
    } finally {
      setScanning(false);
    }
  };

  const handlePinPointerMove = (e) => {
    if (!draggingPinId || !pinContainerRef.current) return;
    const rect = pinContainerRef.current.getBoundingClientRect();
    const { x, y } = getClientXY(e);
    const nx = clamp((x - rect.left) / Math.max(1, rect.width), 0.06, 0.94);
    const ny = clamp((y - rect.top) / Math.max(1, rect.height), 0.06, 0.94);
    setPins((prev) =>
      prev.map((p) =>
        p.id === draggingPinId ? { ...p, x: Number(nx.toFixed(3)), y: Number(ny.toFixed(3)) } : p
      )
    );
  };

  const handlePinKeyDown = (e, pinId) => {
    const step = e.shiftKey ? 0.03 : 0.01;
    let dx = 0;
    let dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else return;

    e.preventDefault();
    e.stopPropagation();
    setPins((prev) =>
      prev.map((p) =>
        p.id === pinId
          ? {
              ...p,
              x: Number(clamp(p.x + dx, 0.06, 0.94).toFixed(3)),
              y: Number(clamp(p.y + dy, 0.06, 0.94).toFixed(3)),
            }
          : p
      )
    );
  };

  const dialogLabel =
    stage === 'crop'
      ? '전신샷 · 셀피 크롭 & 방향 보정 에디터'
      : '얼굴 4대 피부 참조 핀 정밀 확인';

  return (
    <div
      className="modal-backdrop ui-sheet-backdrop"
      onClick={onClose}
      onMouseMove={stage === 'crop' ? handleCropMove : handlePinPointerMove}
      onMouseUp={() => {
        endCropDrag();
        setDraggingPinId(null);
      }}
      onTouchMove={stage === 'crop' ? handleCropMove : handlePinPointerMove}
      onTouchEnd={() => {
        endCropDrag();
        setDraggingPinId(null);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        className="modal-box ui-sheet-box"
        data-sheet-panel="true"
        style={{ maxWidth: 780, width: '95vw', padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-sheet-drag-handle" aria-hidden="true" />
        <div className="modal-header" style={{ marginBottom: 16 }}>
          <div>
            <span className="rec-tag tabular-nums" style={{ marginBottom: 4, display: 'inline-block' }}>
              {stage === 'crop' ? 'STEP 1/2 · SMART PORTRAIT CROP' : 'STEP 2/2 · 478 LANDMARK & 4-PIN'}
            </span>
            <h2 className="hig-headline">{dialogLabel}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        {stage === 'crop' ? (
          <>
            <div className="crop-toolbar-row">
              <div className="ui-chip-rail" style={{ flex: 1 }}>
                <button
                  type="button"
                  className="chip active"
                  onClick={handleAutoLocateFace}
                  disabled={scanning}
                >
                  <ScanFace size={13} /> {scanning ? '얼굴 탐색 중...' : 'AI 얼굴 자동 찾기'}
                </button>
                {FACE_CROP_SHORTCUTS.map((sc) => (
                  <button
                    key={sc.key}
                    type="button"
                    className="chip"
                    onClick={() => setCropBox(sc.box)}
                  >
                    <Crop size={12} /> {sc.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm tabular-nums"
                  onClick={() => setRotation90((r) => (r - 90 + 360) % 360)}
                >
                  <RotateCcw size={14} /> -90°
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm tabular-nums"
                  onClick={() => setRotation90((r) => (r + 90) % 360)}
                >
                  <RotateCw size={14} /> +90°
                </button>
                <button
                  type="button"
                  className={`btn btn-secondary btn-sm ${flipH ? 'active' : ''}`}
                  onClick={() => setFlipH((f) => !f)}
                >
                  <FlipHorizontal size={14} /> 반전
                </button>
              </div>
            </div>

            <div className="crop-stage-outer">
              <div
                ref={cropStageRef}
                className="crop-stage-inner"
                style={{ width: stageDims.w, height: stageDims.h }}
              >
                <canvas ref={cropCanvasRef} className="crop-preview-canvas" />
                <div
                  className="crop-selection-box"
                  style={{
                    left: `${cropBox.x * 100}%`,
                    top: `${cropBox.y * 100}%`,
                    width: `${cropBox.w * 100}%`,
                    height: `${cropBox.h * 100}%`,
                  }}
                  onMouseDown={(e) => beginCropDrag(e, 'move')}
                  onTouchStart={(e) => beginCropDrag(e, 'move')}
                >
                  <span className="crop-grid-line v1" />
                  <span className="crop-grid-line v2" />
                  <span className="crop-grid-line h1" />
                  <span className="crop-grid-line h2" />
                  {['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'].map((dir) => (
                    <span
                      key={dir}
                      className={`crop-handle handle-${dir}`}
                      onMouseDown={(e) => beginCropDrag(e, dir)}
                      onTouchStart={(e) => beginCropDrag(e, dir)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="crop-controls-panel">
              <div className="crop-sliders-grid">
                <label className="crop-slider-item">
                  <span className="tabular-nums">
                    수평 기울기 보정 ({straightenDeg > 0 ? `+${straightenDeg}` : straightenDeg}°)
                  </span>
                  <input
                    type="range"
                    min="-20"
                    max="20"
                    step="1"
                    value={straightenDeg}
                    onChange={(e) => setStraightenDeg(Number(e.target.value))}
                  />
                </label>
                <label className="crop-slider-item">
                  <span className="tabular-nums">
                    <Sun size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    조명 밝기 보정 ({brightness}%)
                  </span>
                  <input
                    type="range"
                    min="80"
                    max="130"
                    step="2"
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                  />
                </label>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                marginTop: 16,
                flexWrap: 'wrap',
              }}
            >
              <span className="hig-caption">
                얼굴이 잘 보이도록 크롭 박스를 맞춘 뒤 다음 단계로 이동하세요.
              </span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  id="portrait-crop-quick-diagnose-btn"
                  type="button"
                  className="btn btn-secondary"
                  disabled={scanning}
                  onClick={() => proceedToPinStage(true)}
                >
                  <Check size={15} /> 크롭 후 바로 자동 진단
                </button>
                <button
                  id="portrait-crop-next-pins-btn"
                  type="button"
                  className="btn btn-primary"
                  disabled={scanning}
                  onClick={() => proceedToPinStage(false)}
                >
                  크롭 완료 · 피부 핀 확인 <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {lowConfPopup && (
              <div
                style={{
                  background: 'var(--bg-surface)',
                  color: 'var(--ink-primary)',
                  padding: '8px 16px',
                  borderRadius: 12,
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                }}
              >
                <span className="hig-caption tabular-nums" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} />
                  얼굴 자동 인식 신뢰도가 낮아({detectionInfo?.confidence ?? 48}%) 4개 피부 핀 위치를 직접 드래그해 맞출 수 있습니다.
                </span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setLowConfPopup(false)}>
                  확인
                </button>
              </div>
            )}

            <div className="pcm-pin-editor-grid">
              <div
                ref={pinContainerRef}
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '1 / 1',
                  maxHeight: 384,
                  background: '#000000',
                  borderRadius: 16,
                  overflow: 'hidden',
                  userSelect: 'none',
                  touchAction: 'none',
                }}
              >
                <img
                  src={detectionInfo?.processedDataUrl || croppedDataUrl || imageSource}
                  alt="크롭된 얼굴 피부 핀 편집"
                  decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
                />

                {(detectionInfo?.meshPoints || []).map((pt, i) => (
                  <span
                    key={i}
                    style={{
                      position: 'absolute',
                      left: `${pt.x * 100}%`,
                      top: `${pt.y * 100}%`,
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.72)',
                      transform: 'translate(-50%, -50%)',
                      pointerEvents: 'none',
                    }}
                  />
                ))}

                {pins.map((pin, idx) => {
                  const pctX = Math.round(pin.x * 100);
                  const pctY = Math.round(pin.y * 100);
                  return (
                    <div
                      key={pin.id}
                      role="slider"
                      aria-label={pin.labelKo}
                      aria-valuemin={6}
                      aria-valuemax={94}
                      aria-valuenow={pctX}
                      aria-valuetext={`X ${pctX}%, Y ${pctY}%`}
                      tabIndex={0}
                      className="tabular-nums"
                      onKeyDown={(e) => handlePinKeyDown(e, pin.id)}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingPinId(pin.id);
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation();
                        setDraggingPinId(pin.id);
                      }}
                      style={{
                        position: 'absolute',
                        left: `${pin.x * 100}%`,
                        top: `${pin.y * 100}%`,
                        transform: 'translate(-50%, -50%)',
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: draggingPinId === pin.id ? '#000000' : 'rgba(29, 29, 31, 0.92)',
                        color: '#FFFFFF',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'grab',
                      }}
                    >
                      {idx + 1}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Crosshair size={16} />
                    <strong className="hig-headline tabular-nums">
                      4대 피부 샘플링 좌표 ({String(detectionInfo?.engine || '').includes('478') ? '478 랜드마크' : '스마트 감지'})
                    </strong>
                  </div>
                  <p className="hig-caption" style={{ marginBottom: 16 }}>
                    머리카락·안경테·그늘을 피해 이마·양볼·콧등 피부 위에 1~4번 핀이 놓였는지 확인하세요.
                  </p>

                  <div style={{ display: 'grid', gap: 8 }}>
                    {pins.map((pin, idx) => (
                      <div
                        key={pin.id}
                        style={{
                          padding: '8px 16px',
                          borderRadius: 12,
                          background: 'var(--bg-surface)',
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <strong className="hig-body tabular-nums">
                          {idx + 1}. {pin.labelKo}
                        </strong>
                        <span className="hig-caption tabular-nums">
                          ({Math.round(pin.x * 100)}%, {Math.round(pin.y * 100)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setStage('crop')}
                  >
                    <ArrowLeft size={15} /> 다시 크롭하기
                  </button>
                  <button
                    id="apply-portrait-pins-btn"
                    type="button"
                    className="btn btn-primary"
                    onClick={() =>
                      onApply?.({
                        croppedDataUrl: detectionInfo?.processedDataUrl || croppedDataUrl,
                        pins,
                        rotationDeg: 0,
                        cropRect: null,
                        detectionInfo,
                      })
                    }
                  >
                    <Check size={16} /> 퍼스널컬러 측정 반영
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 2-Stage Personal Color Photo Editor:
 * - Stage 1 (`crop`): Interactive 8-handle crop box + AI auto-locate face + rotation/straighten/brightness
 * - Stage 2 (`pins`): 478-landmark contour + 4 draggable skin sampling pins with keyboard accessibility
 */
export default function PortraitCropAndPinEditorModal({
  open,
  imageSource,
  initialStage = 'crop',
  initialPins = null,
  onApply,
  onClose,
}) {
  if (!open || !imageSource) return null;
  return (
    <PortraitCropAndPinEditorContent
      key={`${imageSource}::${initialStage}`}
      imageSource={imageSource}
      initialStage={initialStage}
      initialPins={initialPins}
      onApply={onApply}
      onClose={onClose}
    />
  );
}
