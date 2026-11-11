import type { FaceLandmarker as FaceLandmarkerInstance } from '@mediapipe/tasks-vision';
import type {
  FaceLandmarkDetectionResult,
  SkinSamplingPin,
} from '../contracts/carbonDesignContract.ts';

/**
 * Orientation-Invariant 478-Landmark Face & Skin Pin Detector
 * Powered by `@mediapipe/tasks-vision` (lazy-loaded local WASM + `face_landmarker.task` in `/mediapipe/`)
 * with automatic YCbCr skin-cluster fallback for synthetic test swatches or occluded portraits.
 *
 * Supports:
 * - Lazy-loaded 478 3D facial landmarks from `@mediapipe/tasks-vision` (zero initial bundle bloat)
 * - Explicit WASM/WebGL lifecycle teardown via `disposeFaceLandmarker()`
 * - Arbitrary face orientation (-90° / +90° / 180° / tilted portraits)
 * - 2-stage full-body portrait zoom re-detection (전신샷 2단계 재탐색)
 * - 4 anatomical skin sampling pins: forehead (이마), leftCheek (좌볼), rightCheek (우볼), noseChin (콧대·턱)
 */

export interface CropRectNormalized {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DetectFaceOptions {
  rotationDeg?: number;
  cropRect?: CropRectNormalized | null;
}

interface Point2D {
  x: number;
  y: number;
}

interface SkinClusterScan {
  found: boolean;
  ratio: number;
  cx: number;
  cy: number;
  box: CropRectNormalized;
  tiltDeg: number;
}

export const DEFAULT_SKIN_PINS: SkinSamplingPin[] = [
  { id: 'forehead', labelKo: '이마 중앙', labelEn: 'Forehead', x: 0.50, y: 0.30, landmarkIdx: 10 },
  { id: 'leftCheek', labelKo: '좌측 볼', labelEn: 'Left Cheek', x: 0.36, y: 0.54, landmarkIdx: 234 },
  { id: 'rightCheek', labelKo: '우측 볼', labelEn: 'Right Cheek', x: 0.64, y: 0.54, landmarkIdx: 454 },
  { id: 'noseChin', labelKo: '콧대 · 턱', labelEn: 'Nose Bridge / Chin', x: 0.50, y: 0.68, landmarkIdx: 152 },
];

// MediaPipe 478-Landmark indices for face oval + key facial contours
const FACE_OVAL_INDICES: readonly number[] = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109,
];
const FEATURE_MESH_INDICES: readonly number[] = [
  ...FACE_OVAL_INDICES,
  // Eyebrows & nose bridge & cheek malar line
  70, 63, 105, 66, 107, 336, 296, 334, 293, 300,
  168, 6, 197, 195, 5, 4,
  50, 101, 118, 280, 330, 347,
];

let faceLandmarkerPromise: Promise<FaceLandmarkerInstance | null> | null = null;
let landmarkerGeneration = 0;

export async function getMediaPipeFaceLandmarker(): Promise<FaceLandmarkerInstance | null> {
  if (typeof window === 'undefined') return null;
  if (!faceLandmarkerPromise) {
    const gen = landmarkerGeneration;
    faceLandmarkerPromise = (async () => {
      try {
        const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
        const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        const instance = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/face_landmarker.task',
          },
          runningMode: 'IMAGE',
          numFaces: 1,
          minFaceDetectionConfidence: 0.35,
          minFacePresenceConfidence: 0.35,
        });
        if (gen !== landmarkerGeneration) {
          try {
            instance.close();
          } catch {
            // Ignore teardown race errors
          }
          return null;
        }
        return instance;
      } catch {
        faceLandmarkerPromise = null;
        return null;
      }
    })();
  }
  return faceLandmarkerPromise;
}

export async function disposeFaceLandmarker(): Promise<void> {
  landmarkerGeneration += 1;
  const pending = faceLandmarkerPromise;
  faceLandmarkerPromise = null;
  if (!pending) return;
  try {
    const instance = await pending;
    instance?.close?.();
  } catch {
    // Ignore errors during MediaPipe WASM cleanup
  }
}

function clampCoord(v: number): number {
  return Number(Math.max(0.06, Math.min(0.94, v)).toFixed(3));
}

function averageLandmarks(
  landmarks: readonly Point2D[],
  indices: readonly number[],
  mapPt: (p: Point2D) => Point2D = (p) => p
): Point2D {
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (const idx of indices) {
    const pt = landmarks[idx];
    if (pt) {
      const m = mapPt(pt);
      sx += m.x;
      sy += m.y;
      count += 1;
    }
  }
  if (!count) return { x: 0.5, y: 0.5 };
  return { x: clampCoord(sx / count), y: clampCoord(sy / count) };
}

function buildResultFrom478Landmarks(
  landmarks: readonly Point2D[],
  detectionStage: string,
  processedDataUrl: string,
  mapPt: (p: Point2D) => Point2D = (p) => p
): FaceLandmarkDetectionResult {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;

  for (const rawPt of landmarks) {
    const pt = mapPt(rawPt);
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const fPos = averageLandmarks(landmarks, [10, 151, 9, 108, 337], mapPt);
  const lcPos = averageLandmarks(landmarks, [116, 117, 118, 123, 50, 205], mapPt);
  const rcPos = averageLandmarks(landmarks, [345, 346, 347, 352, 280, 425], mapPt);
  const ncPos = averageLandmarks(landmarks, [6, 197, 195, 152, 199], mapPt);

  const leftEye = landmarks[33] ? mapPt(landmarks[33]) : { x: 0.4, y: 0.4 };
  const rightEye = landmarks[263] ? mapPt(landmarks[263]) : { x: 0.6, y: 0.4 };
  const tiltRad = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const tiltDeg = Math.max(-45, Math.min(45, Math.round((tiltRad * 180) / Math.PI)));

  const pins: SkinSamplingPin[] = [
    { id: 'forehead', labelKo: '이마 중앙', labelEn: 'Forehead', x: fPos.x, y: fPos.y, landmarkIdx: 10 },
    { id: 'leftCheek', labelKo: '좌측 볼', labelEn: 'Left Cheek', x: lcPos.x, y: lcPos.y, landmarkIdx: 234 },
    { id: 'rightCheek', labelKo: '우측 볼', labelEn: 'Right Cheek', x: rcPos.x, y: rcPos.y, landmarkIdx: 454 },
    { id: 'noseChin', labelKo: '콧대 · 턱', labelEn: 'Nose Bridge / Chin', x: ncPos.x, y: ncPos.y, landmarkIdx: 152 },
  ];

  const meshPoints: Array<{ x: number; y: number; landmarkIdx?: number }> = [];
  for (const idx of FEATURE_MESH_INDICES) {
    const raw = landmarks[idx];
    if (!raw) continue;
    const pt = mapPt(raw);
    meshPoints.push({ x: clampCoord(pt.x), y: clampCoord(pt.y), landmarkIdx: idx });
  }

  const boxW = Math.max(0.14, Math.min(0.88, maxX - minX));
  const boxH = Math.max(0.16, Math.min(0.90, maxY - minY));

  return {
    detected: true,
    isLowConfidence: false,
    confidence: 96,
    engine: 'mediapipe_tasks_vision_478',
    detectionStage,
    landmarkCount: landmarks.length,
    orientationDeg: tiltDeg,
    faceBox: {
      x: clampCoord(minX),
      y: clampCoord(minY),
      w: Number(boxW.toFixed(3)),
      h: Number(boxH.toFixed(3)),
    },
    pins,
    meshPoints,
    processedDataUrl,
  };
}

function isSkinPixel(r: number, g: number, b: number): boolean {
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

function scanSkinClusterInRegion(
  imageData: ImageData,
  w: number,
  h: number,
  rx0: number,
  ry0: number,
  rx1: number,
  ry1: number
): SkinClusterScan {
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

  for (let y = yStart; y <= yEnd; y += 2) {
    for (let x = xStart; x <= xEnd; x += 2) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];
      if (a < 180) continue;

      if (isSkinPixel(r, g, b)) {
        sumX += x;
        sumY += y;
        sumXX += x * x;
        sumYY += y * y;
        sumXY += x * y;
        count += 1;
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

function buildFallbackFailure(): FaceLandmarkDetectionResult {
  return {
    detected: false,
    isLowConfidence: true,
    confidence: 0,
    engine: 'fallback',
    detectionStage: 'fallback',
    landmarkCount: 478,
    orientationDeg: 0,
    faceBox: { x: 0.25, y: 0.15, w: 0.5, h: 0.65 },
    pins: DEFAULT_SKIN_PINS.map((pin) => ({ ...pin })),
    meshPoints: [],
  };
}

export async function detectFaceAndSkinPins(
  imageSource: string | HTMLImageElement | HTMLCanvasElement,
  options: DetectFaceOptions = {}
): Promise<FaceLandmarkDetectionResult> {
  const { rotationDeg = 0, cropRect = null } = options;
  const landmarker = await getMediaPipeFaceLandmarker();

  return new Promise<FaceLandmarkDetectionResult>((resolve) => {
    const runOnDrawable = (
      drawable: HTMLImageElement | HTMLCanvasElement,
      srcWidth: number,
      srcHeight: number
    ) => {
      const workW = 360;
      const workH = 360;
      const canvas = document.createElement('canvas');
      canvas.width = workW;
      canvas.height = workH;

      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(buildFallbackFailure());
          return;
        }

        ctx.save();
        ctx.translate(workW / 2, workH / 2);
        ctx.rotate(((rotationDeg || 0) * Math.PI) / 180);

        if (cropRect) {
          const sx = cropRect.x * srcWidth;
          const sy = cropRect.y * srcHeight;
          const sw = cropRect.w * srcWidth;
          const sh = cropRect.h * srcHeight;
          ctx.drawImage(drawable, sx, sy, sw, sh, -workW / 2, -workH / 2, workW, workH);
        } else {
          ctx.drawImage(drawable, -workW / 2, -workH / 2, workW, workH);
        }
        ctx.restore();

        const processedDataUrl = canvas.toDataURL('image/jpeg', 0.9);

        // 1) Primary: MediaPipe Tasks Vision 478-Landmark Detector (Stage 1 full frame + Stage 2 upper-head zoom)
        if (landmarker) {
          try {
            const mpStage1 = landmarker.detect(canvas);
            if (mpStage1?.faceLandmarks?.length > 0 && mpStage1.faceLandmarks[0].length >= 468) {
              resolve(
                buildResultFrom478Landmarks(
                  mpStage1.faceLandmarks[0],
                  'mediapipe_478_stage1',
                  processedDataUrl
                )
              );
              return;
            }

            // Stage 2: Full-body upper-head zoom re-detection
            const zoomCrop = { x: 0.18, y: 0.03, w: 0.64, h: 0.45 };
            const zoomCanvas = document.createElement('canvas');
            zoomCanvas.width = 256;
            zoomCanvas.height = 256;
            try {
              const zCtx = zoomCanvas.getContext('2d');
              if (zCtx) {
                zCtx.drawImage(
                  canvas,
                  zoomCrop.x * workW,
                  zoomCrop.y * workH,
                  zoomCrop.w * workW,
                  zoomCrop.h * workH,
                  0,
                  0,
                  256,
                  256
                );
                const mpStage2 = landmarker.detect(zoomCanvas);
                if (mpStage2?.faceLandmarks?.length > 0 && mpStage2.faceLandmarks[0].length >= 468) {
                  resolve(
                    buildResultFrom478Landmarks(
                      mpStage2.faceLandmarks[0],
                      'mediapipe_478_stage2_fullbody_zoom',
                      processedDataUrl,
                      (pt) => ({
                        x: zoomCrop.x + pt.x * zoomCrop.w,
                        y: zoomCrop.y + pt.y * zoomCrop.h,
                      })
                    )
                  );
                  return;
                }
              }
            } finally {
              zoomCanvas.width = 0;
              zoomCanvas.height = 0;
            }
          } catch {
            // Fall through to YCbCr skin cluster fallback
          }
        }

        // 2) Fallback: YCbCr Chromaticity Skin Cluster (Stage 1 + Stage 2 full-body head zoom)
        const imgData = ctx.getImageData(0, 0, workW, workH);
        let cluster = scanSkinClusterInRegion(imgData, workW, workH, 0.08, 0.06, 0.92, 0.92);
        let detectionStage = 'stage1_portrait';

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

        const transformOffset = (dx: number, dy: number): Point2D => {
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

        const pins: SkinSamplingPin[] = [
          { id: 'forehead', labelKo: '이마 중앙', labelEn: 'Forehead', x: fPos.x, y: fPos.y, landmarkIdx: 10 },
          { id: 'leftCheek', labelKo: '좌측 볼', labelEn: 'Left Cheek', x: lcPos.x, y: lcPos.y, landmarkIdx: 234 },
          { id: 'rightCheek', labelKo: '우측 볼', labelEn: 'Right Cheek', x: rcPos.x, y: rcPos.y, landmarkIdx: 454 },
          { id: 'noseChin', labelKo: '콧대 · 턱', labelEn: 'Nose Bridge / Chin', x: ncPos.x, y: ncPos.y, landmarkIdx: 152 },
        ];

        const meshPoints: Array<{ x: number; y: number; landmarkIdx?: number }> = [];
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
          engine: 'ycbcr_skin_cluster_fallback',
          detectionStage,
          landmarkCount: 478,
          orientationDeg: tiltDeg,
          faceBox: box,
          pins,
          meshPoints,
          processedDataUrl,
        });
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    };

    if (typeof imageSource === 'string') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => runOnDrawable(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
      img.onerror = () => resolve(buildFallbackFailure());
      img.src = imageSource;
    } else if (typeof HTMLImageElement !== 'undefined' && imageSource instanceof HTMLImageElement) {
      runOnDrawable(imageSource, imageSource.naturalWidth || imageSource.width, imageSource.naturalHeight || imageSource.height);
    } else if (typeof HTMLCanvasElement !== 'undefined' && imageSource instanceof HTMLCanvasElement) {
      runOnDrawable(imageSource, imageSource.width, imageSource.height);
    } else {
      resolve(buildFallbackFailure());
    }
  });
}
