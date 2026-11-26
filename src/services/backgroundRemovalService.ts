import type { WardrobeCategoryKey } from '../contracts/carbonDesignContract.ts';
import { matchClosestPaletteColor, rgbToHex } from '../shared/colorMath.js';
import { isGeneratedCameraFilename } from '../shared/garmentMetadata.js';

export interface BackgroundRemovalOptions {
  targetSizePx?: number;
  paddingRatio?: number;
  fileNameHint?: string;
  onProgress?: (progress: number) => void;
}

export interface CutoutQualityMetrics {
  foregroundCoverage: number;
  borderTouchRatio: number;
  qualityScore: number;
  needsStudioRefinement: boolean;
  reason: string;
}

export interface ProcessedGarmentAsset {
  cutoutDataUrl: string;
  width: number;
  height: number;
  aspectRatio: '1:1';
  dominantColorHex: string;
  dominantColorName: string;
  suggestedCategory: WardrobeCategoryKey;
  suggestedName: string;
  foregroundCoverage: number;
  borderTouchRatio?: number;
  quality?: CutoutQualityMetrics;
  providerId: string;
}

export interface BackgroundRemovalProvider {
  readonly id: string;
  process(
    source: File | Blob | string,
    options?: BackgroundRemovalOptions
  ): Promise<ProcessedGarmentAsset>;
}

function readSourceAsDataUrl(source: File | Blob | string): Promise<string> {
  if (typeof source === 'string') {
    return Promise.resolve(source);
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('이미지 파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(source);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 디코딩할 수 없습니다.'));
    img.src = src;
  });
}

/**
 * Compresses any uploaded photo into a clean, lightweight JPEG data URL for
 * instant UI preview and fast server-side AI Vision / Studio Cutout upload.
 */
export async function prepareUploadPreview(
  source: File | Blob | string,
  maxSide = 1200,
  quality = 0.86
): Promise<string> {
  const rawUrl = await readSourceAsDataUrl(source);
  const img = await loadImageElement(rawUrl);
  const srcW = img.naturalWidth || img.width || 640;
  const srcH = img.naturalHeight || img.height || 640;
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const w = Math.max(16, Math.round(srcW * scale));
  const h = Math.max(16, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return rawUrl;
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const out = canvas.toDataURL('image/jpeg', quality);
  canvas.width = 0;
  canvas.height = 0;
  return out;
}

function inferCategoryAndNameFromHint(
  fileNameHint: string,
  fgAspect: number
): { category: WardrobeCategoryKey; defaultName: string } {
  const safeRaw = isGeneratedCameraFilename(fileNameHint) ? '' : fileNameHint;
  const hint = safeRaw
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  const lower = hint.toLowerCase();

  if (/(coat|jacket|blazer|trench|parka|padding|outer|코트|자켓|재킷|패딩|블레이저|아우터)/.test(lower)) {
    return { category: 'outer', defaultName: hint || '' };
  }
  if (/(pant|pants|trouser|slacks|denim|jean|chino|short|skirt|슬랙스|데님|팬츠|바지|스커트)/.test(lower)) {
    return { category: 'bottom', defaultName: hint || '' };
  }
  if (/(shoe|sneaker|loafer|boot|heel|sandal|신발|스니커즈|로퍼|부츠)/.test(lower)) {
    return { category: 'shoes', defaultName: hint || '' };
  }
  if (/(bag|tote|briefcase|scarf|muffler|cap|hat|beanie|belt|watch|가방|머플러|모자|벨트)/.test(lower)) {
    return { category: 'accessory', defaultName: hint || '' };
  }
  if (/(shirt|knit|sweater|tee|tshirt|hoodie|cardigan|top|셔츠|니트|티셔츠|후드|가디건)/.test(lower)) {
    return { category: 'top', defaultName: hint || '' };
  }

  // Geometry heuristic fallback (never return raw camera numbers)
  if (fgAspect < 0.62) {
    return { category: 'bottom', defaultName: hint || '' };
  }
  if (fgAspect > 1.38) {
    return { category: 'shoes', defaultName: hint || '' };
  }
  return { category: 'top', defaultName: hint || '' };
}

function samplePerimeterBackground(data: Uint8ClampedArray, w: number, h: number) {
  const samplesR: number[] = [];
  const samplesG: number[] = [];
  const samplesB: number[] = [];
  let transparentBorderCount = 0;
  let totalBorderCount = 0;

  const pushPixel = (x: number, y: number) => {
    const idx = (y * w + x) * 4;
    totalBorderCount += 1;
    if (data[idx + 3] < 24) {
      transparentBorderCount += 1;
      return;
    }
    samplesR.push(data[idx]);
    samplesG.push(data[idx + 1]);
    samplesB.push(data[idx + 2]);
  };

  const stepX = Math.max(1, Math.floor(w / 40));
  const stepY = Math.max(1, Math.floor(h / 40));
  for (let x = 0; x < w; x += stepX) {
    pushPixel(x, 0);
    pushPixel(x, h - 1);
  }
  for (let y = 0; y < h; y += stepY) {
    pushPixel(0, y);
    pushPixel(w - 1, y);
  }

  const alreadyTransparent =
    totalBorderCount > 0 && transparentBorderCount / totalBorderCount > 0.55;
  if (samplesR.length === 0) {
    return { r: 245, g: 245, b: 247, alreadyTransparent: true, isUniform: true };
  }

  const sortedR = [...samplesR].sort((a, b) => a - b);
  const sortedG = [...samplesG].sort((a, b) => a - b);
  const sortedB = [...samplesB].sort((a, b) => a - b);
  const mid = Math.floor(sortedR.length / 2);
  const medR = sortedR[mid];
  const medG = sortedG[mid];
  const medB = sortedB[mid];

  let spreadSum = 0;
  for (let i = 0; i < samplesR.length; i += 1) {
    spreadSum += Math.hypot(samplesR[i] - medR, samplesG[i] - medG, samplesB[i] - medB);
  }
  const avgSpread = spreadSum / Math.max(1, samplesR.length);

  return {
    r: medR,
    g: medG,
    b: medB,
    alreadyTransparent,
    isUniform: avgSpread < 24,
  };
}

function floodFillBackgroundMask(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  bgR: number,
  bgG: number,
  bgB: number,
  options: { distLimit?: number; stepLimit?: number; pureWhiteMode?: boolean } = {}
): Uint8Array {
  const nPx = w * h;
  const bgMask = new Uint8Array(nPx);
  const queue = new Int32Array(nPx);
  let head = 0;
  let tail = 0;

  const bgLum = Math.max(1, 0.299 * bgR + 0.587 * bgG + 0.114 * bgB);
  const bgRn = bgR / bgLum;
  const bgGn = bgG / bgLum;
  const bgBn = bgB / bgLum;

  const distLimit = options.distLimit ?? (options.pureWhiteMode ? 36 : 30);
  const stepLimit = options.stepLimit ?? (options.pureWhiteMode ? 26 : 14);
  const shadowLumDrop = options.pureWhiteMode ? 34 : 54;
  const chromaLimit = 0.062;

  const tryAccept = (p: number, fromP: number) => {
    if (bgMask[p]) return;
    const i = p * 4;
    if (data[i + 3] < 20) {
      bgMask[p] = 1;
      queue[tail++] = p;
      return;
    }
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (fromP >= 0) {
      const fi = fromP * 4;
      const stepDist = Math.hypot(r - data[fi], g - data[fi + 1], b - data[fi + 2]);
      if (stepDist > stepLimit) return;
    }

    const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
    if (dist <= distLimit) {
      bgMask[p] = 1;
      queue[tail++] = p;
      return;
    }

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum >= bgLum - shadowLumDrop && lum <= bgLum + 16 && lum > 28) {
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (sat <= 24) {
        const chromaDist = Math.hypot(r / lum - bgRn, g / lum - bgGn, b / lum - bgBn);
        if (chromaDist <= chromaLimit) {
          bgMask[p] = 1;
          queue[tail++] = p;
        }
      }
    }
  };

  for (let x = 0; x < w; x++) {
    tryAccept(x, -1);
    tryAccept((h - 1) * w + x, -1);
  }
  for (let y = 1; y < h - 1; y++) {
    tryAccept(y * w, -1);
    tryAccept(y * w + (w - 1), -1);
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) tryAccept(p - 1, p);
    if (x < w - 1) tryAccept(p + 1, p);
    if (y > 0) tryAccept(p - w, p);
    if (y < h - 1) tryAccept(p + w, p);
  }

  const coreX0 = Math.floor(w * 0.35);
  const coreX1 = Math.ceil(w * 0.65);
  const coreY0 = Math.floor(h * 0.32);
  const coreY1 = Math.ceil(h * 0.68);
  let coreTotal = 0;
  let coreBg = 0;
  for (let y = coreY0; y < coreY1; y++) {
    for (let x = coreX0; x < coreX1; x++) {
      coreTotal += 1;
      if (bgMask[y * w + x]) coreBg += 1;
    }
  }
  if (coreTotal > 0 && coreBg / coreTotal > 0.72) {
    return new Uint8Array(nPx);
  }

  return bgMask;
}

function encodeTransparentCanvas(canvas: HTMLCanvasElement): string {
  try {
    const webp = canvas.toDataURL('image/webp', 0.9);
    if (webp.startsWith('data:image/webp')) {
      return webp;
    }
  } catch {
    // Fallback to lossless PNG alpha
  }
  return canvas.toDataURL('image/png');
}

function evaluateCutoutQuality(
  foregroundCoverage: number,
  borderTouchRatio: number,
  providerId: string,
  uniformBg = true
): CutoutQualityMetrics {
  let score = 0.92;
  const reasons: string[] = [];

  if (foregroundCoverage < 0.08) {
    score -= 0.45;
    reasons.push('의류 영역이 과도하게 지워졌습니다');
  } else if (foregroundCoverage > 0.84) {
    score -= 0.42;
    reasons.push('배경이 충분히 제거되지 않았습니다');
  }

  if (borderTouchRatio > 0.28) {
    score -= 0.36;
    reasons.push('가장자리에 배경 또는 바닥 잔여물이 남아 있습니다');
  } else if (borderTouchRatio > 0.14) {
    score -= 0.14;
  }

  if (providerId === 'client-studio-cutout-v1' && !uniformBg) {
    score -= 0.3;
    reasons.push('복잡한 배경 패턴이 감지되었습니다');
  }

  const clamped = Number(Math.max(0, Math.min(1, score)).toFixed(2));
  return {
    foregroundCoverage,
    borderTouchRatio,
    qualityScore: clamped,
    needsStudioRefinement: clamped < 0.68,
    reason: reasons[0] || '',
  };
}

function normalizeAndExtractSquareAsset(
  workCanvas: HTMLCanvasElement,
  targetSizePx: number,
  paddingRatio: number,
  fileNameHint: string,
  providerId: string,
  uniformBg = true
): ProcessedGarmentAsset {
  const w = workCanvas.width;
  const h = workCanvas.height;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D 컨텍스트를 생성할 수 없습니다.');
  }

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let fgPixels = 0;
  let borderTotal = 0;
  let borderOpaque = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = d[i + 3];
      const isBorder = x < 2 || x >= w - 2 || y < 2 || y >= h - 2;
      if (isBorder) {
        borderTotal += 1;
        if (a > 40) borderOpaque += 1;
      }
      if (a > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        fgPixels += 1;
        sumR += d[i];
        sumG += d[i + 1];
        sumB += d[i + 2];
      }
    }
  }

  if (fgPixels === 0 || minX >= maxX || minY >= maxY) {
    minX = 0;
    minY = 0;
    maxX = w - 1;
    maxY = h - 1;
    fgPixels = w * h;
  }

  const cropW = Math.max(1, maxX - minX + 1);
  const cropH = Math.max(1, maxY - minY + 1);
  const fgAspect = cropW / cropH;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetSizePx;
  outCanvas.height = targetSizePx;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) {
    throw new Error('정방형 정규화 캔버스를 초기화할 수 없습니다.');
  }

  outCtx.clearRect(0, 0, targetSizePx, targetSizePx);
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';

  const usableSpan = targetSizePx * (1 - paddingRatio * 2);
  const scale = Math.min(usableSpan / cropW, usableSpan / cropH);
  const drawW = Math.round(cropW * scale);
  const drawH = Math.round(cropH * scale);
  const drawX = Math.round((targetSizePx - drawW) / 2);
  const drawY = Math.round((targetSizePx - drawH) / 2);

  outCtx.drawImage(workCanvas, minX, minY, cropW, cropH, drawX, drawY, drawW, drawH);

  const avgR = fgPixels > 0 ? Math.round(sumR / fgPixels) : 32;
  const avgG = fgPixels > 0 ? Math.round(sumG / fgPixels) : 32;
  const avgB = fgPixels > 0 ? Math.round(sumB / fgPixels) : 36;
  const rawHex = rgbToHex(avgR, avgG, avgB);
  const matchedColor = matchClosestPaletteColor(rawHex);
  const { category, defaultName } = inferCategoryAndNameFromHint(fileNameHint, fgAspect);

  const cutoutDataUrl = encodeTransparentCanvas(outCanvas);
  const foregroundCoverage = Number((fgPixels / Math.max(1, w * h)).toFixed(3));
  const borderTouchRatio = Number((borderOpaque / Math.max(1, borderTotal)).toFixed(3));
  const quality = evaluateCutoutQuality(foregroundCoverage, borderTouchRatio, providerId, uniformBg);

  outCanvas.width = 0;
  outCanvas.height = 0;

  return {
    cutoutDataUrl,
    width: targetSizePx,
    height: targetSizePx,
    aspectRatio: '1:1',
    dominantColorHex: matchedColor?.hex || rawHex,
    dominantColorName: matchedColor?.name || '차콜',
    suggestedCategory: category,
    suggestedName: defaultName,
    foregroundCoverage,
    borderTouchRatio,
    quality,
    providerId,
  };
}

/**
 * Keys pure-white studio backgrounds (from AI Studio refinement or official e-commerce packshots)
 * into clean anti-aliased transparent 1:1 2.5D cutouts.
 */
export async function keyStudioWhiteCutout(
  studioDataUrl: string,
  options: BackgroundRemovalOptions = {}
): Promise<ProcessedGarmentAsset> {
  const targetSizePx = options.targetSizePx || 640;
  const paddingRatio = options.paddingRatio ?? 0.09;
  const fileNameHint = options.fileNameHint || '';

  const img = await loadImageElement(studioDataUrl);
  const maxWorkSide = 840;
  const srcW = img.naturalWidth || img.width || 640;
  const srcH = img.naturalHeight || img.height || 640;
  const workScale = Math.min(1, maxWorkSide / Math.max(srcW, srcH));
  const w = Math.max(16, Math.round(srcW * workScale));
  const h = Math.max(16, Math.round(srcH * workScale));

  const workCanvas = document.createElement('canvas');
  workCanvas.width = w;
  workCanvas.height = h;
  const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('스튜디오 배경 제거 캔버스를 열 수 없습니다.');
  }

  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  const perimeter = samplePerimeterBackground(d, w, h);

  if (!perimeter.alreadyTransparent && perimeter.isUniform) {
    const bgMask = floodFillBackgroundMask(d, w, h, perimeter.r, perimeter.g, perimeter.b, {
      pureWhiteMode: perimeter.r > 230 && perimeter.g > 230 && perimeter.b > 230,
    });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const i = p * 4;
        if (bgMask[p]) {
          d[i + 3] = 0;
          continue;
        }
        let bgNeighbors = 0;
        if (x > 0 && bgMask[p - 1]) bgNeighbors += 1;
        if (x < w - 1 && bgMask[p + 1]) bgNeighbors += 1;
        if (y > 0 && bgMask[p - w]) bgNeighbors += 1;
        if (y < h - 1 && bgMask[p + w]) bgNeighbors += 1;
        if (bgNeighbors > 0) {
          d[i + 3] = Math.round(d[i + 3] * (1 - bgNeighbors * 0.18));
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  try {
    return normalizeAndExtractSquareAsset(
      workCanvas,
      targetSizePx,
      paddingRatio,
      fileNameHint,
      'ai-studio-cutout-v1',
      true
    );
  } finally {
    workCanvas.width = 0;
    workCanvas.height = 0;
  }
}

/**
 * Client-side Studio Cutout Provider (Fast heuristic fallback for uniform backgrounds).
 */
export class ClientStudioCutoutProvider implements BackgroundRemovalProvider {
  readonly id = 'client-studio-cutout-v1';

  async process(
    source: File | Blob | string,
    options: BackgroundRemovalOptions = {}
  ): Promise<ProcessedGarmentAsset> {
    const targetSizePx = options.targetSizePx || 640;
    const paddingRatio = options.paddingRatio ?? 0.1;
    const fileNameHint =
      options.fileNameHint || (source instanceof File ? source.name : '');

    const dataUrl = await readSourceAsDataUrl(source);
    const img = await loadImageElement(dataUrl);

    const maxWorkSide = 768;
    const srcW = img.naturalWidth || img.width || 640;
    const srcH = img.naturalHeight || img.height || 640;
    const workScale = Math.min(1, maxWorkSide / Math.max(srcW, srcH));
    const w = Math.max(16, Math.round(srcW * workScale));
    const h = Math.max(16, Math.round(srcH * workScale));

    const workCanvas = document.createElement('canvas');
    workCanvas.width = w;
    workCanvas.height = h;
    const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      throw new Error('배경제거용 캔버스 컨텍스트를 열 수 없습니다.');
    }

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const perimeter = samplePerimeterBackground(d, w, h);

    if (!perimeter.alreadyTransparent) {
      const bgMask = floodFillBackgroundMask(d, w, h, perimeter.r, perimeter.g, perimeter.b);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const p = y * w + x;
          const i = p * 4;
          if (bgMask[p]) {
            d[i + 3] = 0;
            continue;
          }
          let bgNeighbors = 0;
          if (x > 0 && bgMask[p - 1]) bgNeighbors += 1;
          if (x < w - 1 && bgMask[p + 1]) bgNeighbors += 1;
          if (y > 0 && bgMask[p - w]) bgNeighbors += 1;
          if (y < h - 1 && bgMask[p + w]) bgNeighbors += 1;
          if (bgNeighbors > 0) {
            d[i + 3] = Math.round(d[i + 3] * (1 - bgNeighbors * 0.16));
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    try {
      return normalizeAndExtractSquareAsset(
        workCanvas,
        targetSizePx,
        paddingRatio,
        fileNameHint,
        this.id,
        perimeter.isUniform
      );
    } finally {
      workCanvas.width = 0;
      workCanvas.height = 0;
    }
  }
}

/**
 * On-Device ML Segmentation Provider powered by @imgly/background-removal.
 * Handles textured floors, beds, and cluttered rooms dramatically better than flood-fill,
 * falling back cleanly to ClientStudioCutoutProvider if WASM/model loading fails.
 */
export class OnDeviceMlCutoutProvider implements BackgroundRemovalProvider {
  readonly id = 'ondevice-ml-cutout-v1';
  private readonly fallback = new ClientStudioCutoutProvider();

  async process(
    source: File | Blob | string,
    options: BackgroundRemovalOptions = {}
  ): Promise<ProcessedGarmentAsset> {
    const targetSizePx = options.targetSizePx || 640;
    const paddingRatio = options.paddingRatio ?? 0.1;
    const fileNameHint =
      options.fileNameHint || (source instanceof File ? source.name : '');

    try {
      options.onProgress?.(0.12);
      const { removeBackground } = await import('@imgly/background-removal');
      const resultBlob = await removeBackground(source, {
        model: 'isnet_fp16',
        output: {
          format: 'image/png',
          quality: 0.92,
        },
        progress: (_key: string, current: number, total: number) => {
          if (total > 0 && options.onProgress) {
            const pct = Math.min(0.92, Math.max(0.15, (current / total) * 0.8 + 0.12));
            options.onProgress(pct);
          }
        },
      });

      const blobUrl = URL.createObjectURL(resultBlob);
      try {
        const img = await loadImageElement(blobUrl);
        const workCanvas = document.createElement('canvas');
        workCanvas.width = img.naturalWidth || 640;
        workCanvas.height = img.naturalHeight || 640;
        const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          throw new Error('Canvas unavailable');
        }
        ctx.drawImage(img, 0, 0);
        options.onProgress?.(1);
        try {
          return normalizeAndExtractSquareAsset(
            workCanvas,
            targetSizePx,
            paddingRatio,
            fileNameHint,
            this.id,
            true
          );
        } finally {
          workCanvas.width = 0;
          workCanvas.height = 0;
        }
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    } catch {
      options.onProgress?.(0.85);
      const fallbackAsset = await this.fallback.process(source, options);
      options.onProgress?.(1);
      return fallbackAsset;
    }
  }
}

/**
 * Remote API Cutout Provider (optional external endpoint override).
 */
export class RemoteApiCutoutProvider implements BackgroundRemovalProvider {
  readonly id = 'remote-api-cutout-v1';
  private readonly endpointUrl: string;
  private readonly apiKey: string;
  private readonly fallback = new OnDeviceMlCutoutProvider();

  constructor(endpointUrl: string, apiKey = '') {
    this.endpointUrl = endpointUrl;
    this.apiKey = apiKey;
  }

  async process(
    source: File | Blob | string,
    options: BackgroundRemovalOptions = {}
  ): Promise<ProcessedGarmentAsset> {
    if (!this.endpointUrl) {
      return this.fallback.process(source, options);
    }
    try {
      const targetSizePx = options.targetSizePx || 640;
      const paddingRatio = options.paddingRatio ?? 0.1;
      const fileNameHint =
        options.fileNameHint || (source instanceof File ? source.name : '');
      const dataUrl = await readSourceAsDataUrl(source);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }

      const res = await fetch(this.endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ image: dataUrl }),
      });
      if (!res.ok) {
        throw new Error(`Remote BG removal failed (${res.status})`);
      }

      const payload = (await res.json()) as { cutoutDataUrl?: string; image?: string };
      const remoteCutoutSrc = payload.cutoutDataUrl || payload.image;
      if (!remoteCutoutSrc) {
        throw new Error('Remote BG removal response missing cutout image');
      }

      const img = await loadImageElement(remoteCutoutSrc);
      const workCanvas = document.createElement('canvas');
      workCanvas.width = img.naturalWidth || 640;
      workCanvas.height = img.naturalHeight || 640;
      const ctx = workCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        throw new Error('Canvas unavailable');
      }
      ctx.drawImage(img, 0, 0);
      try {
        return normalizeAndExtractSquareAsset(
          workCanvas,
          targetSizePx,
          paddingRatio,
          fileNameHint,
          this.id,
          true
        );
      } finally {
        workCanvas.width = 0;
        workCanvas.height = 0;
      }
    } catch {
      return this.fallback.process(source, options);
    }
  }
}

const configuredEndpoint = String(import.meta.env?.VITE_BG_REMOVAL_API_URL || '').trim();
const configuredApiKey = String(import.meta.env?.VITE_BG_REMOVAL_API_KEY || '').trim();

const onDeviceMlProvider = new OnDeviceMlCutoutProvider();

let activeProvider: BackgroundRemovalProvider = configuredEndpoint
  ? new RemoteApiCutoutProvider(configuredEndpoint, configuredApiKey)
  : onDeviceMlProvider;

export function registerBackgroundRemovalProvider(provider: BackgroundRemovalProvider): void {
  activeProvider = provider;
}

export function getActiveBackgroundRemovalProvider(): BackgroundRemovalProvider {
  return activeProvider;
}

export function runOnDeviceMlCutout(
  source: File | Blob | string,
  options?: BackgroundRemovalOptions
): Promise<ProcessedGarmentAsset> {
  return onDeviceMlProvider.process(source, options);
}

export function processGarmentUpload(
  source: File | Blob | string,
  options?: BackgroundRemovalOptions
): Promise<ProcessedGarmentAsset> {
  return activeProvider.process(source, options);
}
