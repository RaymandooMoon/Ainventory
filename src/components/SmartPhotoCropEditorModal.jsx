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
import { COLOR_PALETTE } from '../utils/api.js';

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

function parseHexRgb(hex) {
  const clean = String(hex || '#1D273B').replace('#', '');
  const n = parseInt(clean.padEnd(6, '0').slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function matchClosestPaletteColor(r, g, b) {
  let best = COLOR_PALETTE[0];
  let minD = Infinity;
  for (const item of COLOR_PALETTE) {
    const c = parseHexRgb(item.hex);
    const d = Math.hypot(r - c.r, g - c.g, b - c.b);
    if (d < minD) {
      minD = d;
      best = item;
    }
  }
  return best;
}

/**
 * Renders rotated/flipped/brightened source image, crops exact normalized `cropBox`,
 * optionally cleans studio background (`studioCutout`), and extracts dominant garment color.
 */
export async function renderCroppedImageOutput(
  imageSource,
  {
    rotation90 = 0,
    straightenDeg = 0,
    flipH = false,
    brightness = 100,
    studioCutout = false,
    cropBox = { x: 0.08, y: 0.06, w: 0.84, h: 0.88 },
    maxOutputSide = 760,
  } = {}
) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
    el.src = imageSource;
  });

  // 1. Render transformed full stage onto intermediate canvas
  const rad90 = ((rotation90 % 360) * Math.PI) / 180;
  const swapWH = Math.abs(rotation90 % 180) === 90;
  const srcW = img.naturalWidth || img.width || 640;
  const srcH = img.naturalHeight || img.height || 640;
  const stageScale = Math.min(1, 1280 / Math.max(srcW, srcH));
  const baseW = Math.round((swapWH ? srcH : srcW) * stageScale);
  const baseH = Math.round((swapWH ? srcW : srcH) * stageScale);

  const stageCanvas = document.createElement('canvas');
  stageCanvas.width = Math.max(64, baseW);
  stageCanvas.height = Math.max(64, baseH);
  const sCtx = stageCanvas.getContext('2d', { willReadFrequently: true });
  sCtx.fillStyle = '#F4F1EA';
  sCtx.fillRect(0, 0, stageCanvas.width, stageCanvas.height);

  sCtx.save();
  if (brightness !== 100) {
    sCtx.filter = `brightness(${brightness}%)`;
  }
  sCtx.translate(stageCanvas.width / 2, stageCanvas.height / 2);
  if (flipH) sCtx.scale(-1, 1);
  sCtx.rotate(rad90 + (straightenDeg * Math.PI) / 180);
  const drawW = Math.round(srcW * stageScale);
  const drawH = Math.round(srcH * stageScale);
  sCtx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  sCtx.restore();

  // 2. Crop exact user box
  const sx = Math.round(clamp(cropBox.x, 0, 0.95) * stageCanvas.width);
  const sy = Math.round(clamp(cropBox.y, 0, 0.95) * stageCanvas.height);
  const sw = Math.max(32, Math.round(clamp(cropBox.w, 0.05, 1 - cropBox.x) * stageCanvas.width));
  const sh = Math.max(32, Math.round(clamp(cropBox.h, 0.05, 1 - cropBox.y) * stageCanvas.height));

  const outScale = Math.min(1, maxOutputSide / Math.max(sw, sh));
  const outW = Math.max(64, Math.round(sw * outScale));
  const outH = Math.max(64, Math.round(sh * outScale));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const oCtx = outCanvas.getContext('2d', { willReadFrequently: true });
  oCtx.drawImage(stageCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

  const imgData = oCtx.getImageData(0, 0, outW, outH);
  const d = imgData.data;

  // Estimate border background color from 4 corners + edge midpoints
  const borderSamples = [
    [2, 2],
    [outW - 3, 2],
    [2, outH - 3],
    [outW - 3, outH - 3],
    [Math.floor(outW / 2), 2],
    [2, Math.floor(outH / 2)],
    [outW - 3, Math.floor(outH / 2)],
  ];
  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  for (const [bx, by] of borderSamples) {
    const bi = (clamp(by, 0, outH - 1) * outW + clamp(bx, 0, outW - 1)) * 4;
    bgR += d[bi];
    bgG += d[bi + 1];
    bgB += d[bi + 2];
  }
  bgR /= borderSamples.length;
  bgG /= borderSamples.length;
  bgB /= borderSamples.length;

  // Optional 1-click Acloset-style Studio Paper Background Cleanup (#F4F1EA)
  if (studioCutout) {
    const studioRGB = [244, 241, 234];
    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const i = (y * outW + x) * 4;
        const distBg = Math.hypot(d[i] - bgR, d[i + 1] - bgG, d[i + 2] - bgB);
        // Stronger cleanup near borders, gentle near center so garment core is preserved
        const nx = (x / outW - 0.5) * 2;
        const ny = (y / outH - 0.5) * 2;
        const edgeBias = Math.hypot(nx, ny);
        const threshold = edgeBias > 0.72 ? 42 : 26;
        if (distBg < threshold) {
          const alpha = clamp((threshold - distBg) / 18, 0, 1);
          d[i] = Math.round(d[i] * (1 - alpha) + studioRGB[0] * alpha);
          d[i + 1] = Math.round(d[i + 1] * (1 - alpha) + studioRGB[1] * alpha);
          d[i + 2] = Math.round(d[i + 2] * (1 - alpha) + studioRGB[2] * alpha);
        }
      }
    }
    oCtx.putImageData(imgData, 0, 0);
  }

  // Dominant center-garment color extraction
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let cnt = 0;
  const x0 = Math.floor(outW * 0.24);
  const x1 = Math.ceil(outW * 0.76);
  const y0 = Math.floor(outH * 0.22);
  const y1 = Math.ceil(outH * 0.78);
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * outW + x) * 4;
      const distBg = Math.hypot(d[i] - bgR, d[i + 1] - bgG, d[i + 2] - bgB);
      if (distBg > 20) {
        sumR += d[i];
        sumG += d[i + 1];
        sumB += d[i + 2];
        cnt++;
      }
    }
  }
  if (cnt < 20) {
    const ci = (Math.floor(outH / 2) * outW + Math.floor(outW / 2)) * 4;
    sumR = d[ci];
    sumG = d[ci + 1];
    sumB = d[ci + 2];
    cnt = 1;
  }
  const avgR = Math.round(sumR / cnt);
  const avgG = Math.round(sumG / cnt);
  const avgB = Math.round(sumB / cnt);
  const detectedHex = `#${[avgR, avgG, avgB]
    .map((v) => clamp(v, 0, 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
  const matchedColor = matchClosestPaletteColor(avgR, avgG, avgB);

  return {
    dataUrl: outCanvas.toDataURL('image/jpeg', 0.92),
    detectedHex,
    matchedColor,
    width: outW,
    height: outH,
  };
}

/**
 * Interactive 8-Handle Photo Crop & Studio Cutout Editor Modal
 * Automatically opens right after uploading a full-body/item photo OR snapping a camera shot.
 */
export default function SmartPhotoCropEditorModal({
  open,
  imageSource,
  mode = 'garment', // 'garment' | 'portrait'
  title = '전신샷 · 촬영 사진 크롭 & 스튜디오 에디터',
  onApply,
  onClose,
}) {
  const stageRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const dragRef = useRef(null);

  const [aspectKey, setAspectKey] = useState(mode === 'portrait' ? '1:1' : '3:4');
  const [rotation90, setRotation90] = useState(0);
  const [straightenDeg, setStraightenDeg] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [studioCutout, setStudioCutout] = useState(mode === 'garment');
  const [cropBox, setCropBox] = useState(
    mode === 'portrait'
      ? { x: 0.22, y: 0.06, w: 0.56, h: 0.56 }
      : { x: 0.12, y: 0.08, w: 0.76, h: 0.84 }
  );
  const [stageDims, setStageDims] = useState({ w: 360, h: 460 });
  const [processing, setProcessing] = useState(false);

  // Reset cleanly whenever a new photo is loaded
  useEffect(() => {
    if (!open || !imageSource) return;
    setRotation90(0);
    setStraightenDeg(0);
    setFlipH(false);
    setBrightness(100);
    setStudioCutout(mode === 'garment');
    setAspectKey(mode === 'portrait' ? '1:1' : '3:4');
    setCropBox(
      mode === 'portrait'
        ? { x: 0.22, y: 0.06, w: 0.56, h: 0.56 }
        : { x: 0.12, y: 0.08, w: 0.76, h: 0.84 }
    );
  }, [open, imageSource, mode]);

  // Draw live transformed photo into preview canvas so user sees exact rotation/flip/brightness
  useEffect(() => {
    if (!open || !imageSource) return;
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
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, cw, ch);
      ctx.save();
      if (brightness !== 100) ctx.filter = `brightness(${brightness}%)`;
      ctx.translate(cw / 2, ch / 2);
      if (flipH) ctx.scale(-1, 1);
      ctx.rotate(((rotation90 + straightenDeg) * Math.PI) / 180);
      const dw = (swap ? ch : cw);
      const dh = (swap ? cw : ch);
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    };
    img.src = imageSource;
    return () => {
      cancelled = true;
    };
  }, [open, imageSource, rotation90, straightenDeg, flipH, brightness]);

  if (!open || !imageSource) return null;

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
      // Convert pixel aspect ratio to normalized stage ratio
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
        className="modal-box ui-sheet-box photo-crop-modal"
        style={{ maxWidth: 780, width: '95vw', padding: '20px 22px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-sheet-drag-handle" aria-hidden="true" />
        <div className="modal-header" style={{ marginBottom: 12 }}>
          <div>
            <span className="rec-tag" style={{ marginBottom: 4, display: 'inline-block' }}>
              SMART PHOTO CROP &amp; STUDIO CUTOUT
            </span>
            <h2>{title}</h2>
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

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setRotation90((r) => (r - 90 + 360) % 360)}
              title="-90° 회전"
            >
              <RotateCcw size={14} /> -90°
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
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

            {/* Interactive Crop Box + Darkened Exterior Scrim via box-shadow */}
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
              {/* Rule of thirds grid */}
              <span className="crop-grid-line v1" />
              <span className="crop-grid-line v2" />
              <span className="crop-grid-line h1" />
              <span className="crop-grid-line h2" />

              {/* 8 Resize Handles */}
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
          <div className="ui-chip-rail" style={{ marginBottom: 10 }}>
            {ASPECT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`chip ${aspectKey === opt.key ? 'active' : ''}`}
                onClick={() => applyAspectPreset(opt)}
              >
                {opt.label}
              </button>
            ))}

            {mode === 'garment' && (
              <button
                type="button"
                className={`chip ${studioCutout ? 'active' : ''}`}
                onClick={() => setStudioCutout((v) => !v)}
              >
                <Sparkles size={12} /> 스튜디오 배경 정돈 {studioCutout ? 'ON' : 'OFF'}
              </button>
            )}
          </div>

          <div className="crop-sliders-grid">
            <label className="crop-slider-item">
              <span>수평 미세 보정 ({straightenDeg > 0 ? `+${straightenDeg}` : straightenDeg}°)</span>
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
              <span>
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
            gap: 10,
            marginTop: 14,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '0.79rem', color: 'var(--ink-secondary)' }}>
            전신샷에서도 원하는 부위(얼굴·상의·하의·가방)로 박스를 드래그해 자연스럽게 크롭하세요.
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
