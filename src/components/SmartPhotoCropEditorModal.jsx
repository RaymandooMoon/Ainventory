import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Crop,
  FlipHorizontal,
  RotateCcw,
  RotateCw,
  Sparkles,
  Sun,
  User,
  X,
} from 'lucide-react';
import { renderCroppedImageOutput } from '../utils/imageTools.js';

const ASPECT_OPTIONS = [
  { key: 'free', label: '자유 비율', ratio: null },
  { key: '3:4', label: '3:4 의류 팩샷', ratio: 3 / 4 },
  { key: '1:1', label: '1:1 정방형', ratio: 1 },
  { key: '4:5', label: '4:5 피드', ratio: 4 / 5 },
];

const BODY_REGION_SHORTCUTS = [
  { key: 'full', label: '전체 영역', box: { x: 0.06, y: 0.05, w: 0.88, h: 0.90 } },
  { key: 'face', label: '얼굴·헤드', box: { x: 0.26, y: 0.04, w: 0.48, h: 0.34 } },
  { key: 'upper', label: '상의·아우터', box: { x: 0.16, y: 0.18, w: 0.68, h: 0.44 } },
  { key: 'lower', label: '하의·스커트', box: { x: 0.20, y: 0.46, w: 0.60, h: 0.44 } },
  { key: 'acc', label: '가방·신발 클로즈업', box: { x: 0.22, y: 0.56, w: 0.56, h: 0.38 } },
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function SmartPhotoCropEditorContent({ imageSource, title, onApply, onClose }) {
  const stageRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const dragRef = useRef(null);

  const [aspectKey, setAspectKey] = useState('3:4');
  const [rotation90, setRotation90] = useState(0);
  const [straightenDeg, setStraightenDeg] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [studioCutout, setStudioCutout] = useState(true);
  const [cropBox, setCropBox] = useState({ x: 0.12, y: 0.08, w: 0.76, h: 0.84 });
  const [stageDims, setStageDims] = useState({ w: 360, h: 460 });
  const [processing, setProcessing] = useState(false);

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

  // Release backing store on unmount
  useEffect(() => {
    const canvasEl = previewCanvasRef.current;
    return () => {
      if (canvasEl) {
        canvasEl.width = 0;
        canvasEl.height = 0;
      }
    };
  }, []);

  // Draw live transformed photo into preview canvas
  useEffect(() => {
    if (!imageSource) return undefined;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled || !previewCanvasRef.current) return;
      const swap = Math.abs(rotation90 % 180) === 90;
      const iw = swap ? img.naturalHeight : img.naturalWidth;
      const ih = swap ? img.naturalWidth : img.naturalHeight;
      const maxW = Math.min(540, window.innerWidth - 56);
      const maxH = Math.min(430, Math.max(280, window.innerHeight - 340));
      const scale = Math.min(maxW / Math.max(1, iw), maxH / Math.max(1, ih));
      const cw = Math.max(180, Math.round(iw * scale));
      const ch = Math.max(180, Math.round(ih * scale));

      setStageDims({ w: cw, h: ch });
      const canvas = previewCanvasRef.current;
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
  }, [imageSource, rotation90, straightenDeg, flipH, brightness]);

  const getClientXY = (e) => {
    const t = e.touches?.[0] || e.changedTouches?.[0];
    return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY };
  };

  const beginDrag = (e, handleType) => {
    e.stopPropagation();
    const { x, y } = getClientXY(e);
    dragRef.current = {
      handle: handleType,
      startX: x,
      startY: y,
      startBox: { ...cropBox },
    };
  };

  const handleStageMove = (e) => {
    if (!dragRef.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const { x, y } = getClientXY(e);
    const dx = (x - dragRef.current.startX) / rect.width;
    const dy = (y - dragRef.current.startY) / rect.height;
    const s = dragRef.current.startBox;
    const h = dragRef.current.handle;
    const minSize = 0.14;

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

    if (h.includes('e')) nw = clamp(s.w + dx, minSize, 1 - s.x);
    if (h.includes('s')) nh = clamp(s.h + dy, minSize, 1 - s.y);
    if (h.includes('w')) {
      const maxDelta = s.w - minSize;
      const d = clamp(dx, -s.x, maxDelta);
      nx = s.x + d;
      nw = s.w - d;
    }
    if (h.includes('n')) {
      const maxDelta = s.h - minSize;
      const d = clamp(dy, -s.y, maxDelta);
      ny = s.y + d;
      nh = s.h - d;
    }

    const aspectObj = ASPECT_OPTIONS.find((a) => a.key === aspectKey);
    if (aspectObj?.ratio && stageDims.w > 0 && stageDims.h > 0) {
      const normRatio = (aspectObj.ratio * stageDims.h) / stageDims.w;
      nh = clamp(nw / normRatio, minSize, 1 - ny);
      nw = clamp(nh * normRatio, minSize, 1 - nx);
    }

    setCropBox({ x: nx, y: ny, w: nw, h: nh });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const applyAspectPreset = (opt) => {
    setAspectKey(opt.key);
    if (!opt.ratio || !stageDims.w || !stageDims.h) return;
    const normRatio = (opt.ratio * stageDims.h) / stageDims.w;
    let nw = Math.min(0.82, cropBox.w);
    let nh = nw / normRatio;
    if (nh > 0.86) {
      nh = 0.86;
      nw = nh * normRatio;
    }
    setCropBox({
      x: clamp(0.5 - nw / 2, 0, 1 - nw),
      y: clamp(cropBox.y, 0, 1 - nh),
      w: nw,
      h: nh,
    });
  };

  const handleConfirm = async () => {
    setProcessing(true);
    try {
      const res = await renderCroppedImageOutput(imageSource, {
        rotation90,
        straightenDeg,
        flipH,
        brightness,
        studioCutout,
        cropBox,
      });
      onApply?.(res);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div
      className="modal-backdrop ui-sheet-backdrop"
      onClick={onClose}
      onMouseMove={handleStageMove}
      onMouseUp={endDrag}
      onTouchMove={handleStageMove}
      onTouchEnd={endDrag}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || '사진 크롭 에디터'}
        className="modal-box ui-sheet-box photo-crop-modal"
        data-sheet-panel="true"
        style={{ maxWidth: 780, width: '95vw', padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-sheet-drag-handle" aria-hidden="true" />
        <div className="modal-header" style={{ marginBottom: 16 }}>
          <div>
            <span className="rec-tag" style={{ marginBottom: 4, display: 'inline-block' }}>
              SMART PHOTO CROP &amp; STUDIO CUTOUT
            </span>
            <h2 className="hig-headline">{title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        {/* Top Quick Region Bar for Full-Body Shots */}
        <div className="crop-toolbar-row">
          <div className="ui-chip-rail" style={{ flex: 1 }}>
            {BODY_REGION_SHORTCUTS.map((sc) => (
              <button
                key={sc.key}
                type="button"
                className="chip"
                onClick={() => {
                  setAspectKey('free');
                  setCropBox(sc.box);
                }}
              >
                {sc.key === 'face' ? <User size={12} /> : <Crop size={12} />} {sc.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm tabular-nums"
              onClick={() => setRotation90((r) => (r - 90 + 360) % 360)}
              title="-90° 회전"
            >
              <RotateCcw size={14} /> -90°
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm tabular-nums"
              onClick={() => setRotation90((r) => (r + 90) % 360)}
              title="+90° 회전"
            >
              <RotateCw size={14} /> +90°
            </button>
            <button
              type="button"
              className={`btn btn-secondary btn-sm ${flipH ? 'active' : ''}`}
              onClick={() => setFlipH((f) => !f)}
              title="좌우 반전"
            >
              <FlipHorizontal size={14} /> 반전
            </button>
          </div>
        </div>

        {/* Interactive Crop Stage */}
        <div className="crop-stage-outer">
          <div
            ref={stageRef}
            className="crop-stage-inner"
            style={{ width: stageDims.w, height: stageDims.h }}
          >
            <canvas ref={previewCanvasRef} className="crop-preview-canvas" />

            <div
              className="crop-selection-box"
              style={{
                left: `${cropBox.x * 100}%`,
                top: `${cropBox.y * 100}%`,
                width: `${cropBox.w * 100}%`,
                height: `${cropBox.h * 100}%`,
              }}
              onMouseDown={(e) => beginDrag(e, 'move')}
              onTouchStart={(e) => beginDrag(e, 'move')}
            >
              <span className="crop-grid-line v1" />
              <span className="crop-grid-line v2" />
              <span className="crop-grid-line h1" />
              <span className="crop-grid-line h2" />

              {['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'].map((dir) => (
                <span
                  key={dir}
                  className={`crop-handle handle-${dir}`}
                  onMouseDown={(e) => beginDrag(e, dir)}
                  onTouchStart={(e) => beginDrag(e, dir)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Aspect Ratio + Fine Sliders + Studio Background Toggle */}
        <div className="crop-controls-panel">
          <div className="ui-chip-rail" style={{ marginBottom: 8 }}>
            {ASPECT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`chip tabular-nums ${aspectKey === opt.key ? 'active' : ''}`}
                onClick={() => applyAspectPreset(opt)}
              >
                {opt.label}
              </button>
            ))}

            <button
              type="button"
              className={`chip ${studioCutout ? 'active' : ''}`}
              onClick={() => setStudioCutout((v) => !v)}
            >
              <Sparkles size={12} /> 스튜디오 배경 정돈 {studioCutout ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="crop-sliders-grid">
            <label className="crop-slider-item">
              <span className="tabular-nums">
                수평 미세 보정 ({straightenDeg > 0 ? `+${straightenDeg}` : straightenDeg}°)
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
                노출 · 밝기 ({brightness}%)
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
            원하는 부위로 박스를 드래그해 크롭하면 자동 WebP 배경제거가 적용됩니다.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              취소
            </button>
            <button
              id="confirm-smart-crop-btn"
              type="button"
              className="btn btn-primary"
              disabled={processing}
              onClick={handleConfirm}
            >
              <Check size={16} /> {processing ? '크롭 처리 중...' : '크롭 완료 및 적용'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Interactive 8-Handle Photo Crop & Studio Cutout Editor Modal
 * Automatically opens right after uploading a full-body/item photo OR snapping a camera shot.
 */
export default function SmartPhotoCropEditorModal({
  open,
  imageSource,
  title = '전신샷 · 촬영 사진 크롭 & 스튜디오 에디터',
  onApply,
  onClose,
}) {
  if (!open || !imageSource) return null;
  return (
    <SmartPhotoCropEditorContent
      key={imageSource}
      imageSource={imageSource}
      title={title}
      onApply={onApply}
      onClose={onClose}
    />
  );
}
