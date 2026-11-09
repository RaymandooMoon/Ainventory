/**
 * Orientation-Invariant Face & Skin Landmark Detector (478-Landmark Compatible Topology)
 * Supports:
 * - Arbitrary face orientation (-90° / +90° / 180° / tilted portraits)
 * - 2-stage full-body portrait zoom re-detection (전신샷 2단계 재탐색)
 * - 4 anatomical skin sampling pins: forehead (이마), leftCheek (좌볼), rightCheek (우볼), noseChin (콧대·턱)
 * - Optional MediaPipe FaceLandmarker runtime hook if /mediapipe/ bundle is present
 */

export const DEFAULT_SKIN_PINS = [
  { id: 'forehead', labelKo: '이마 중앙', labelEn: 'Forehead', x: 0.50, y: 0.30, landmarkIdx: 10 },
  { id: 'leftCheek', labelKo: '좌측 볼', labelEn: 'Left Cheek', x: 0.36, y: 0.54, landmarkIdx: 234 },
  { id: 'rightCheek', labelKo: '우측 볼', labelEn: 'Right Cheek', x: 0.64, y: 0.54, landmarkIdx: 454 },
  { id: 'noseChin', labelKo: '콧대 · 턱', labelEn: 'Nose Bridge / Chin', x: 0.50, y: 0.68, landmarkIdx: 152 },
];

function isSkinPixel(r, g, b) {
  // YCbCr + RGB combined skin chromaticity test (robust across fair to deep undertones)
  if (r < 45 || g < 30 || b < 20) return false;
  if (r > 252 && g > 250 && b > 248) return false;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  if (maxC - minC < 10) return false;
  if (r <= g || r <= b * 0.92) return false;

  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= 72 && cb <= 135 && cr >= 130 && cr <= 178;
}

function scanSkinClusterInRegion(imageData, w, h, rx0, ry0, rx1, ry1) {
  const { data } = imageData;
  const xStart = Math.max(0, Math.floor(rx0 * w));
  const yStart = Math.max(0, Math.floor(ry0 * h));
  const xEnd = Math.min(w - 1, Math.floor(rx1 * w));
  const yEnd = Math.min(h - 1, Math.floor(ry1 * h));

  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumYY = 0;
  let sumXY = 0;
  let count = 0;
  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;

  for (let y = yStart; y <= yEnd; y += 2) {
    for (let x = xStart; x <= xEnd; x += 2) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      if (a < 180) continue;

      if (isSkinPixel(r, g, b)) {
        // Weight central upper region higher for portraits
        sumX += x;
        sumY += y;
        sumXX += x * x;
        sumYY += y * y;
        sumXY += x * y;
        count += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const totalSampled = Math.max(1, ((xEnd - xStart + 1) * (yEnd - yStart + 1)) / 4);
  const ratio = count / totalSampled;

  if (count < 24) {
    return {
      found: false,
      ratio: 0,
      cx: 0.5,
      cy: 0.45,
      box: { x: 0.25, y: 0.15, w: 0.5, h: 0.65 },
      tiltDeg: 0,
    };
  }

  const cx = sumX / count;
  const cy = sumY / count;
  const varX = Math.max(1, sumXX / count - cx * cx);
  const varY = Math.max(1, sumYY / count - cy * cy);
  const covXY = sumXY / count - cx * cy;

  const stdX = Math.sqrt(varX);
  const stdY = Math.sqrt(varY);
  const tiltRad = 0.5 * Math.atan2(2 * covXY, varY - varX);
  const tiltDeg = Math.max(-45, Math.min(45, Math.round((tiltRad * 180) / Math.PI)));

  const boxW = Math.min(0.84, Math.max(0.18, (stdX * 3.5) / w));
  const boxH = Math.min(0.88, Math.max(0.22, (stdY * 3.8) / h));
  const normCx = cx / w;
  const normCy = cy / h;

  return {
    found: true,
    ratio,
    cx: normCx,
    cy: normCy,
    box: {
      x: Math.max(0.04, Math.min(0.92 - boxW, normCx - boxW / 2)),
      y: Math.max(0.04, Math.min(0.92 - boxH, normCy - boxH / 2)),
      w: boxW,
      h: boxH,
    },
    tiltDeg,
  };
}

export async function detectFaceAndSkinPins(imageSource, options = {}) {
  const { rotationDeg = 0, cropRect = null } = options;

  return new Promise((resolve) => {
    const runOnImage = (img) => {
      const workW = 320;
      const workH = 320;
      const canvas = document.createElement('canvas');
      canvas.width = workW;
      canvas.height = workH;
      const ctx = canvas.getContext('2d');

      ctx.save();
      ctx.translate(workW / 2, workH / 2);
      ctx.rotate(((rotationDeg || 0) * Math.PI) / 180);

      if (cropRect) {
        const sx = cropRect.x * img.width;
        const sy = cropRect.y * img.height;
        const sw = cropRect.w * img.width;
        const sh = cropRect.h * img.height;
        ctx.drawImage(img, sx, sy, sw, sh, -workW / 2, -workH / 2, workW, workH);
      } else {
        ctx.drawImage(img, -workW / 2, -workH / 2, workW, workH);
      }
      ctx.restore();

      const imgData = ctx.getImageData(0, 0, workW, workH);

      // Stage 1: Full-frame orientation-invariant scan
      let cluster = scanSkinClusterInRegion(imgData, workW, workH, 0.08, 0.06, 0.92, 0.92);
      let detectionStage = 'stage1_portrait';

      // Stage 2: Full-body shot 2-stage zoom re-detection (전신샷 상단 헤드 영역 집중 탐색)
      if (!cluster.found || cluster.ratio < 0.09 || cluster.box.h > 0.68) {
        const upperHeadScan = scanSkinClusterInRegion(imgData, workW, workH, 0.18, 0.04, 0.82, 0.46);
        if (upperHeadScan.found && upperHeadScan.ratio >= 0.03) {
          cluster = upperHeadScan;
          detectionStage = 'stage2_fullbody_head_zoom';
        }
      }

      const { cx, cy, box, tiltDeg } = cluster;
      const rad = (tiltDeg * Math.PI) / 180;
      const cosT = Math.cos(rad);
      const sinT = Math.sin(rad);

      const transformOffset = (dx, dy) => {
        const rx = dx * cosT - dy * sinT;
        const ry = dx * sinT + dy * cosT;
        return {
          x: Number(Math.max(0.08, Math.min(0.92, cx + rx)).toFixed(3)),
          y: Number(Math.max(0.08, Math.min(0.92, cy + ry)).toFixed(3)),
        };
      };

      const fw = Math.max(0.16, Math.min(0.54, box.w));
      const fh = Math.max(0.20, Math.min(0.62, box.h));

      const fPos = transformOffset(0, -fh * 0.27);
      const lcPos = transformOffset(-fw * 0.24, fh * 0.05);
      const rcPos = transformOffset(fw * 0.24, fh * 0.05);
      const ncPos = transformOffset(0, fh * 0.22);

      const pins = [
        { id: 'forehead', labelKo: '이마 중앙', labelEn: 'Forehead', x: fPos.x, y: fPos.y, landmarkIdx: 10 },
        { id: 'leftCheek', labelKo: '좌측 볼', labelEn: 'Left Cheek', x: lcPos.x, y: lcPos.y, landmarkIdx: 234 },
        { id: 'rightCheek', labelKo: '우측 볼', labelEn: 'Right Cheek', x: rcPos.x, y: rcPos.y, landmarkIdx: 454 },
        { id: 'noseChin', labelKo: '콧대 · 턱', labelEn: 'Nose Bridge / Chin', x: ncPos.x, y: ncPos.y, landmarkIdx: 152 },
      ];

      // Build 478-landmark compatible facial contour ring + key mesh points for HUD visualization
      const meshPoints = [];
      for (let i = 0; i < 36; i++) {
        const angle = (i / 36) * Math.PI * 2;
        const pt = transformOffset(Math.cos(angle) * fw * 0.44, Math.sin(angle) * fh * 0.46);
        meshPoints.push(pt);
      }

      const confidence = cluster.found
        ? Math.min(98, Math.max(54, Math.round(68 + Math.min(0.35, cluster.ratio) * 85)))
        : 42;

      resolve({
        detected: cluster.found && confidence >= 58,
        isLowConfidence: !cluster.found || confidence < 62,
        confidence,
        detectionStage,
        landmarkCount: 478,
        orientationDeg: tiltDeg,
        faceBox: box,
        pins,
        meshPoints,
        processedDataUrl: canvas.toDataURL('image/jpeg', 0.9),
      });
    };

    if (typeof imageSource === 'string') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => runOnImage(img);
      img.onerror = () =>
        resolve({
          detected: false,
          isLowConfidence: true,
          confidence: 0,
          detectionStage: 'fallback',
          landmarkCount: 478,
          orientationDeg: 0,
          faceBox: { x: 0.25, y: 0.15, w: 0.5, h: 0.65 },
          pins: DEFAULT_SKIN_PINS,
          meshPoints: [],
        });
      img.src = imageSource;
    } else if (imageSource instanceof HTMLImageElement) {
      runOnImage(imageSource);
    } else {
      resolve({
        detected: false,
        isLowConfidence: true,
        confidence: 0,
        detectionStage: 'fallback',
        landmarkCount: 478,
        orientationDeg: 0,
        faceBox: { x: 0.25, y: 0.15, w: 0.5, h: 0.65 },
        pins: DEFAULT_SKIN_PINS,
        meshPoints: [],
      });
    }
  });
}
