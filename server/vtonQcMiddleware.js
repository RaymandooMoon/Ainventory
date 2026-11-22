import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ThinkingLevel, Type } from '@google/genai';
import { DATA_DIR } from './db.js';
import { getServerGeminiApiKey, getServerGeminiClient } from './geminiClient.js';
import { cutoutStudioBackdropToRgba } from '../src/services/cutoutService.ts';
import {
  evaluateTurnaroundConsistencyQc,
  inspectPixelSliceQc,
  normalizeHandedness,
  resolveBagCarryAnatomy,
} from '../src/services/vtonQualityControl.ts';
import {
  TURNAROUND_ANGLES,
  eraseSheetGridDividerLinesInBuffer,
  resolveTurnaroundRowSplitYInBuffer,
  resolveTurnaroundSheetGridDecisionInBuffer,
  scrubCutoutArtifactsInBuffer,
} from '../src/services/vton2DService.ts';

export const VISION_QC_MODEL = 'gemini-3.1-flash-lite';
const VISION_QC_TIMEOUT_MS = 25000;
const VISION_QC_RETRY_TIMEOUT_MS = 20000;
const VISION_QC_MAX_ANCHOR_BYTES = 750 * 1024;

export const DEFAULT_VTON_QC_LOG_PATH = path.join(DATA_DIR, 'vton-qc-failures.log');
export const DEFAULT_MAX_QC_ATTEMPTS = 3;

export const QC_FRONT_ONLY_NOTIFICATION_POPUP = Object.freeze({
  code: 'QC_FRONT_ONLY_FALLBACK',
  durationMs: 3000,
  messageKo: '현재 통신 오류로 인하여 정면 캐릭터만 보여드립니다.',
  messageEn: 'Due to a temporary connection issue, only the front view is shown.',
});

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const PNG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32Buf(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c = PNG_CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(typeAscii, dataBuf) {
  const typeBuf = Buffer.from(typeAscii, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(dataBuf.length, 0);
  const crcInput = Buffer.concat([typeBuf, dataBuf]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32Buf(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, dataBuf, crcBuf]);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Parses a base64 `data:image/...;base64,...` URI into `{ mimeType, buffer }`.
 */
export function parseImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    if (buffer.length < 16) return null;
    return {
      mimeType: match[1].toLowerCase(),
      buffer,
    };
  } catch {
    return null;
  }
}

/**
 * Encodes a pure RGBA pixel buffer (`Uint8ClampedArray`) as an uncompressed-filter-0 RGBA PNG data URL.
 */
export function encodeRgbaToPngDataUrl(width, height, rgba) {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const stride = w * 4 + 1;
  const rawScanlines = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y += 1) {
    const dstRow = y * stride;
    rawScanlines[dstRow] = 0;
    const srcStart = y * w * 4;
    for (let i = 0; i < w * 4; i += 1) {
      rawScanlines[dstRow + 1 + i] = rgba[srcStart + i] ?? 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA color type
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(rawScanlines, { level: 6 });
  const full = Buffer.concat([
    PNG_SIGNATURE,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idat),
    makePngChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${full.toString('base64')}`;
}

/**
 * Pure-Node non-interlaced 8-bit PNG decoder supporting color types:
 * 0 (Grayscale), 2 (RGB), 3 (Indexed PLTE+tRNS), 4 (Gray+Alpha), 6 (RGBA).
 */
export function decodePngBufferToRgba(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33) return null;
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let plte = null;
  let trns = null;
  const idatChunks = [];

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) return null;
    const chunkData = buffer.subarray(dataStart, dataEnd);

    if (type === 'IHDR' && length >= 13) {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
      interlace = chunkData[12];
    } else if (type === 'PLTE') {
      plte = chunkData;
    } else if (type === 'tRNS') {
      trns = chunkData;
    } else if (type === 'IDAT') {
      idatChunks.push(chunkData);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  if (
    width < 1 ||
    height < 1 ||
    width > 8192 ||
    height > 8192 ||
    bitDepth !== 8 ||
    interlace !== 0 ||
    idatChunks.length === 0
  ) {
    return null;
  }

  let channels = 0;
  if (colorType === 0) channels = 1;
  else if (colorType === 2) channels = 3;
  else if (colorType === 3) channels = 1;
  else if (colorType === 4) channels = 2;
  else if (colorType === 6) channels = 4;
  else return null;

  let inflated;
  try {
    inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  } catch {
    return null;
  }

  const rowBytes = width * channels;
  const expectedBytes = (rowBytes + 1) * height;
  if (inflated.length < expectedBytes) return null;

  const raw = new Uint8Array(height * rowBytes);
  for (let y = 0; y < height; y += 1) {
    const srcRowStart = y * (rowBytes + 1);
    const filter = inflated[srcRowStart];
    const dstRowStart = y * rowBytes;
    const prevRowStart = (y - 1) * rowBytes;

    for (let x = 0; x < rowBytes; x += 1) {
      const xVal = inflated[srcRowStart + 1 + x];
      const a = x >= channels ? raw[dstRowStart + x - channels] : 0;
      const b = y > 0 ? raw[prevRowStart + x] : 0;
      const c = y > 0 && x >= channels ? raw[prevRowStart + x - channels] : 0;

      let recon;
      if (filter === 0) recon = xVal;
      else if (filter === 1) recon = (xVal + a) & 0xff;
      else if (filter === 2) recon = (xVal + b) & 0xff;
      else if (filter === 3) recon = (xVal + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) recon = (xVal + paethPredictor(a, b, c)) & 0xff;
      else return null;

      raw[dstRowStart + x] = recon;
    }
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  const nPx = width * height;
  if (colorType === 6) {
    rgba.set(raw);
  } else if (colorType === 2) {
    for (let p = 0; p < nPx; p += 1) {
      const si = p * 3;
      const di = p * 4;
      rgba[di] = raw[si];
      rgba[di + 1] = raw[si + 1];
      rgba[di + 2] = raw[si + 2];
      rgba[di + 3] = 255;
    }
  } else if (colorType === 0) {
    for (let p = 0; p < nPx; p += 1) {
      const v = raw[p];
      const di = p * 4;
      rgba[di] = v;
      rgba[di + 1] = v;
      rgba[di + 2] = v;
      rgba[di + 3] = 255;
    }
  } else if (colorType === 4) {
    for (let p = 0; p < nPx; p += 1) {
      const v = raw[p * 2];
      const di = p * 4;
      rgba[di] = v;
      rgba[di + 1] = v;
      rgba[di + 2] = v;
      rgba[di + 3] = raw[p * 2 + 1];
    }
  } else if (colorType === 3) {
    if (!plte) return null;
    for (let p = 0; p < nPx; p += 1) {
      const idx = raw[p];
      const pOff = idx * 3;
      const di = p * 4;
      rgba[di] = pOff + 2 < plte.length ? plte[pOff] : 0;
      rgba[di + 1] = pOff + 2 < plte.length ? plte[pOff + 1] : 0;
      rgba[di + 2] = pOff + 2 < plte.length ? plte[pOff + 2] : 0;
      rgba[di + 3] = trns && idx < trns.length ? trns[idx] : 255;
    }
  }

  return { width, height, rgba };
}

function parseJpegDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 < buffer.length) {
    if (buffer[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buffer[i + 1];
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x00) {
      i += 2;
      continue;
    }
    const segLen = buffer.readUInt16BE(i + 2);
    if (segLen < 2) return null;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof && i + 9 <= buffer.length) {
      const height = buffer.readUInt16BE(i + 5);
      const width = buffer.readUInt16BE(i + 7);
      if (width > 0 && height > 0) return { width, height };
      return null;
    }
    i += 2 + segLen;
  }
  return null;
}

function cropRgbaRect(src, srcW, sx, sy, cw, ch) {
  const out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y += 1) {
    const srcStart = ((sy + y) * srcW + sx) * 4;
    const dstStart = y * cw * 4;
    out.set(src.subarray(srcStart, srcStart + cw * 4), dstStart);
  }
  return out;
}

function resolveThreeColSpansServer(clusters, headClusters, w) {
  if (clusters.length === 3) {
    const m01 = Math.round((clusters[0].x1 + clusters[1].x0) * 0.5);
    const m12 = Math.round((clusters[1].x1 + clusters[2].x0) * 0.5);
    return [
      { x0: 2, x1: Math.max(18, m01 - 1) },
      { x0: m01 + 1, x1: Math.max(m01 + 17, m12 - 1) },
      { x0: m12 + 1, x1: Math.max(m12 + 17, w - 3) },
    ];
  }
  if (headClusters.length === 3) {
    const m01 = Math.round((headClusters[0].x1 + headClusters[1].x0) * 0.5);
    const m12 = Math.round((headClusters[1].x1 + headClusters[2].x0) * 0.5);
    return [
      { x0: 2, x1: Math.max(18, m01 - 1) },
      { x0: m01 + 1, x1: Math.max(m01 + 17, m12 - 1) },
      { x0: m12 + 1, x1: Math.max(m12 + 17, w - 3) },
    ];
  }
  const colW = Math.floor(w / 3);
  const trimX = Math.max(2, Math.round(colW * 0.018));
  return [
    { x0: trimX, x1: colW - trimX },
    { x0: colW + trimX, x1: colW * 2 - trimX },
    { x0: colW * 2 + trimX, x1: w - trimX },
  ];
}

function resolveFourColSpansServer(clusters, headClusters, w) {
  if (clusters.length === 4) {
    const m01 = Math.round((clusters[0].x1 + clusters[1].x0) * 0.5);
    const m12 = Math.round((clusters[1].x1 + clusters[2].x0) * 0.5);
    const m23 = Math.round((clusters[2].x1 + clusters[3].x0) * 0.5);
    return [
      { x0: 2, x1: Math.max(18, m01 - 1) },
      { x0: m01 + 1, x1: Math.max(m01 + 17, m12 - 1) },
      { x0: m12 + 1, x1: Math.max(m12 + 17, m23 - 1) },
      { x0: m23 + 1, x1: Math.max(m23 + 17, w - 3) },
    ];
  }
  if (headClusters.length === 4) {
    const m01 = Math.round((headClusters[0].x1 + headClusters[1].x0) * 0.5);
    const m12 = Math.round((headClusters[1].x1 + headClusters[2].x0) * 0.5);
    const m23 = Math.round((headClusters[2].x1 + headClusters[3].x0) * 0.5);
    return [
      { x0: 2, x1: Math.max(18, m01 - 1) },
      { x0: m01 + 1, x1: Math.max(m01 + 17, m12 - 1) },
      { x0: m12 + 1, x1: Math.max(m12 + 17, m23 - 1) },
      { x0: m23 + 1, x1: Math.max(m23 + 17, w - 3) },
    ];
  }
  const colW = Math.floor(w / 4);
  const trimX = Math.max(2, Math.round(colW * 0.015));
  return [
    { x0: trimX, x1: colW - trimX },
    { x0: colW + trimX, x1: colW * 2 - trimX },
    { x0: colW * 2 + trimX, x1: colW * 3 - trimX },
    { x0: colW * 3 + trimX, x1: w - trimX },
  ];
}

function sliceTurnaroundPanelsInServerBuffer(rgba, w, h, layout) {
  const working = new Uint8ClampedArray(rgba);
  if (w >= 256 && h >= 256) {
    eraseSheetGridDividerLinesInBuffer(working, w, h, { layout });
  }
  const isExplicit4x2 = layout === 'turnaround_4x2' && w >= 256 && h >= 256;
  const isExplicit2x2 = layout === 'turnaround_2x2' || w < 256 || h < 256;
  const isHorizontal1x6 = !isExplicit4x2 && !isExplicit2x2 && w / h >= 3.15;
  const isHorizontal1x4 = !isExplicit4x2 && !isHorizontal1x6 && w / h >= 2.15;
  const splitY = resolveTurnaroundRowSplitYInBuffer(working, w, h);
  const gridDecision = resolveTurnaroundSheetGridDecisionInBuffer(working, w, h, { layout });
  const use4x2Grid =
    isExplicit4x2 ||
    (!isExplicit2x2 &&
      !isHorizontal1x6 &&
      !isHorizontal1x4 &&
      layout !== 'turnaround_3x2' &&
      (gridDecision.topClusters.length === 4 ||
        gridDecision.botClusters.length === 4 ||
        gridDecision.topHeadClusters.length === 4 ||
        gridDecision.botHeadClusters.length === 4));

  const rects = [];
  if (isHorizontal1x6) {
    const legacy6Angles = [0, 45, 90, 135, 180, 225];
    const colW = Math.floor(w / 6);
    const trimX = Math.max(1, Math.round(colW * 0.015));
    const trimY = Math.max(1, Math.round(h * 0.012));
    for (let i = 0; i < legacy6Angles.length; i += 1) {
      rects.push({
        angle: legacy6Angles[i],
        sx: colW * i + trimX,
        sy: trimY,
        cw: Math.max(16, colW - trimX * 2),
        ch: Math.max(16, h - trimY * 2),
      });
    }
  } else if (use4x2Grid) {
    const trimTop = Math.max(1, Math.round(splitY * 0.012));
    const botH = h - splitY;
    const trimBot = Math.max(1, Math.round(botH * 0.012));
    const topCh = Math.max(16, splitY - trimTop * 2);
    const botCh = Math.max(16, botH - trimBot * 2);
    const topSpans = resolveFourColSpansServer(
      gridDecision.topClusters,
      gridDecision.topHeadClusters,
      w
    );
    const botSpans = resolveFourColSpansServer(
      gridDecision.botClusters,
      gridDecision.botHeadClusters,
      w
    );
    [0, 45, 90, 135].forEach((angle, i) => {
      rects.push({
        angle,
        sx: topSpans[i].x0,
        sy: trimTop,
        cw: Math.max(16, topSpans[i].x1 - topSpans[i].x0),
        ch: topCh,
      });
    });
    [180, 225, 270, 315].forEach((angle, i) => {
      rects.push({
        angle,
        sx: botSpans[i].x0,
        sy: splitY + trimBot,
        cw: Math.max(16, botSpans[i].x1 - botSpans[i].x0),
        ch: botCh,
      });
    });
  } else if (gridDecision.use3x2Grid) {
    const trimTop = Math.max(1, Math.round(splitY * 0.012));
    const botH = h - splitY;
    const trimBot = Math.max(1, Math.round(botH * 0.012));
    const topCh = Math.max(16, splitY - trimTop * 2);
    const botCh = Math.max(16, botH - trimBot * 2);
    const topSpans = resolveThreeColSpansServer(
      gridDecision.topClusters,
      gridDecision.topHeadClusters,
      w
    );
    const botSpans = resolveThreeColSpansServer(
      gridDecision.botClusters,
      gridDecision.botHeadClusters,
      w
    );
    [0, 45, 90].forEach((angle, i) => {
      rects.push({
        angle,
        sx: topSpans[i].x0,
        sy: trimTop,
        cw: Math.max(16, topSpans[i].x1 - topSpans[i].x0),
        ch: topCh,
      });
    });
    [135, 180, 225].forEach((angle, i) => {
      rects.push({
        angle,
        sx: botSpans[i].x0,
        sy: splitY + trimBot,
        cw: Math.max(16, botSpans[i].x1 - botSpans[i].x0),
        ch: botCh,
      });
    });
  } else if (isHorizontal1x4) {
    const colW = Math.floor(w / 4);
    const trimX = Math.max(1, Math.round(colW * 0.015));
    const trimY = Math.max(1, Math.round(h * 0.012));
    const cw = Math.max(16, colW - trimX * 2);
    const ch = Math.max(16, h - trimY * 2);
    [0, 45, 90, 180].forEach((angle, i) => {
      rects.push({ angle, sx: colW * i + trimX, sy: trimY, cw, ch });
    });
  } else {
    const halfW = Math.floor(w / 2);
    const trimX = Math.max(2, Math.round(halfW * 0.016));
    const trimTop = Math.max(1, Math.round(splitY * 0.012));
    const botH = h - splitY;
    const trimBot = Math.max(1, Math.round(botH * 0.012));
    const cw = Math.max(16, halfW - trimX * 2);
    const topCh = Math.max(16, splitY - trimTop * 2);
    const botCh = Math.max(16, botH - trimBot * 2);
    rects.push({ angle: 0, sx: trimX, sy: trimTop, cw, ch: topCh });
    rects.push({ angle: 45, sx: halfW + trimX, sy: trimTop, cw, ch: topCh });
    rects.push({ angle: 90, sx: trimX, sy: splitY + trimBot, cw, ch: botCh });
    rects.push({ angle: 180, sx: halfW + trimX, sy: splitY + trimBot, cw, ch: botCh });
  }

  const slicedBuffers = {};
  for (const r of rects) {
    const sx = Math.max(0, Math.min(w - 1, r.sx));
    const sy = Math.max(0, Math.min(h - 1, r.sy));
    const cw = Math.max(1, Math.min(w - sx, r.cw));
    const ch = Math.max(1, Math.min(h - sy, r.ch));
    slicedBuffers[r.angle] = {
      width: cw,
      height: ch,
      rgba: cropRgbaRect(working, w, sx, sy, cw, ch),
    };
  }
  return slicedBuffers;
}

/**
 * Validates synthesized VTON image(s) on the server before returning to the client:
 * - Decodes PNG slices (`panelImages` or turnaround `compositeImageUrl` sheet or single portrait)
 * - Runs V4 hole-aware studio backdrop matting + artifact scrubber in pure Node
 * - Inspects full-body framing, consistency, split outerwear color, outerwear palette drift,
 *   and under-umbrella background cutout cavities
 * - Extracts a clean cutout `0°` front PNG data URL when `frontValid` passes for positive-only fallback
 */
export function validateSynthesizedVtonPayload(result) {
  if (!result || !result.geminiUsed || result.provider === 'flatlay-fallback') {
    return {
      ok: true,
      skipped: true,
      frontValid: false,
      failedAngles: [],
      reasons: [],
      frontCutoutDataUrl: null,
    };
  }

  const studioBackdropHex = result.studioBackdropHex || null;
  const isTurnaround =
    result.layout === 'turnaround_4x2' ||
    result.layout === 'turnaround_3x2' ||
    result.layout === 'turnaround_2x2';

  if (result.panelImages && typeof result.panelImages === 'object') {
    const metricsByAngle = {};
    let frontCutoutDataUrl = null;

    for (const angle of TURNAROUND_ANGLES) {
      const rawUrl = result.panelImages[String(angle)];
      if (!rawUrl) continue;
      const parsed = parseImageDataUrl(rawUrl);
      if (!parsed) continue;
      if (parsed.mimeType !== 'image/png') {
        const dims = parseJpegDimensions(parsed.buffer);
        if (!dims || dims.width < 32 || dims.height < 32) {
          return {
            ok: false,
            skipped: false,
            frontValid: angle !== 0,
            failedAngles: [angle],
            reasons: [`${angle}:invalid_image_payload`],
            frontCutoutDataUrl,
          };
        }
        continue;
      }
      const decoded = decodePngBufferToRgba(parsed.buffer);
      if (!decoded) {
        return {
          ok: false,
          skipped: false,
          frontValid: angle !== 0,
          failedAngles: [angle],
          reasons: [`${angle}:corrupt_png`],
          frontCutoutDataUrl,
        };
      }
      const panelData = new Uint8ClampedArray(decoded.rgba);
      cutoutStudioBackdropToRgba(panelData, decoded.width, decoded.height);
      scrubCutoutArtifactsInBuffer(panelData, decoded.width, decoded.height);
      metricsByAngle[angle] = inspectPixelSliceQc(panelData, decoded.width, decoded.height, {
        studioBackdropHex,
      });
      if (angle === 0) {
        frontCutoutDataUrl = encodeRgbaToPngDataUrl(decoded.width, decoded.height, panelData);
      }
    }

    if (Object.keys(metricsByAngle).length === 0) {
      return {
        ok: true,
        skipped: false,
        frontValid: true,
        failedAngles: [],
        reasons: [],
        frontCutoutDataUrl: null,
      };
    }

    const report = evaluateTurnaroundConsistencyQc(metricsByAngle);
    return {
      ...report,
      skipped: false,
      frontCutoutDataUrl: report.frontValid ? frontCutoutDataUrl : null,
    };
  }

  const parsedComposite = parseImageDataUrl(result.compositeImageUrl);
  if (!parsedComposite) {
    return {
      ok: false,
      skipped: false,
      frontValid: false,
      failedAngles: [0],
      reasons: ['invalid_image_data_url'],
      frontCutoutDataUrl: null,
    };
  }

  if (parsedComposite.mimeType !== 'image/png') {
    const jpegDims = parseJpegDimensions(parsedComposite.buffer);
    if (!jpegDims || jpegDims.width < 64 || jpegDims.height < 64) {
      return {
        ok: false,
        skipped: false,
        frontValid: false,
        failedAngles: [0],
        reasons: ['corrupt_non_png_image'],
        frontCutoutDataUrl: null,
      };
    }
    // Non-PNG responses (e.g. direct model JPEG) pass basic dimension verification
    // while client Canvas matting completes full pixel cutout & QC.
    return {
      ok: true,
      skipped: false,
      nonPngVerified: true,
      frontValid: true,
      failedAngles: [],
      reasons: [],
      frontCutoutDataUrl: null,
    };
  }

  const decoded = decodePngBufferToRgba(parsedComposite.buffer);
  if (!decoded) {
    return {
      ok: false,
      skipped: false,
      frontValid: false,
      failedAngles: [0],
      reasons: ['corrupt_png_image'],
      frontCutoutDataUrl: null,
    };
  }

  if (isTurnaround) {
    const slicedPanels = sliceTurnaroundPanelsInServerBuffer(
      decoded.rgba,
      decoded.width,
      decoded.height,
      result.layout
    );
    const metricsByAngle = {};
    let frontCutoutDataUrl = null;

    for (const [angleStr, panel] of Object.entries(slicedPanels)) {
      const angle = Number(angleStr);
      const panelData = new Uint8ClampedArray(panel.rgba);
      cutoutStudioBackdropToRgba(panelData, panel.width, panel.height);
      scrubCutoutArtifactsInBuffer(panelData, panel.width, panel.height);
      metricsByAngle[angle] = inspectPixelSliceQc(panelData, panel.width, panel.height, {
        studioBackdropHex,
      });
      if (angle === 0) {
        frontCutoutDataUrl = encodeRgbaToPngDataUrl(panel.width, panel.height, panelData);
      }
    }

    const report = evaluateTurnaroundConsistencyQc(metricsByAngle);
    return {
      ...report,
      skipped: false,
      frontCutoutDataUrl: report.frontValid ? frontCutoutDataUrl : null,
    };
  }

  const singleData = new Uint8ClampedArray(decoded.rgba);
  cutoutStudioBackdropToRgba(singleData, decoded.width, decoded.height);
  scrubCutoutArtifactsInBuffer(singleData, decoded.width, decoded.height);
  const singleMetrics = inspectPixelSliceQc(singleData, decoded.width, decoded.height, {
    studioBackdropHex,
  });
  const singleReport = evaluateTurnaroundConsistencyQc({ 0: singleMetrics });
  return {
    ...singleReport,
    skipped: false,
    frontCutoutDataUrl: singleReport.frontValid
      ? encodeRgbaToPngDataUrl(decoded.width, decoded.height, singleData)
      : null,
  };
}

/**
 * Generates targeted corrective instructions injected into retry prompts when QC rejects an attempt.
 */
export function buildQcCorrectionHint(reasons = []) {
  const tokens = Array.isArray(reasons) ? reasons.join(' ') : String(reasons || '');
  const cues = [];
  if (tokens.includes('split_outerwear_color') || tokens.includes('outerwear_palette_drift')) {
    cues.push(
      'CRITICAL FIX: Render the equipped outer coat/jacket in ONE IDENTICAL unified color and fabric across BOTH left & right halves and ALL 6 angles — NEVER split left/right coat colors and NEVER swap outer coat for inner jacket on side/back views.'
    );
  }
  if (tokens.includes('umbrella_gap_cutout_failed') || tokens.includes('interior_chroma_hole')) {
    cues.push(
      'CRITICAL FIX: Fill every enclosed air gap under the open umbrella canopy, between arms and waist, and between legs 100% with the flat solid studio backdrop color (ZERO grey overhang haze or unkeyed shadows).'
    );
  }
  if (
    tokens.includes('clipped_top') ||
    tokens.includes('clipped_bottom') ||
    tokens.includes('half_body') ||
    tokens.includes('incomplete_height') ||
    tokens.includes('too_small')
  ) {
    cues.push(
      'CRITICAL FIX: Frame ALL figures cleanly from head crown to shoe soles with 8–10% top and bottom padding; NEVER crop heads, ankles, or thighs.'
    );
  }
  if (tokens.includes('garment_cutout_hole')) {
    cues.push(
      'CRITICAL FIX: Render every garment (especially denim trousers, jackets, and shirts) with crisp, solid, high-contrast fabric color completely distinct from the studio backdrop — NEVER blend studio backdrop hues onto pant legs or garment folds.'
    );
  }
  if (tokens.includes('front_face_in_rear_view')) {
    cues.push(
      'CRITICAL ORIENTATION FIX: The previous attempt rendered a front face/eyes/chest on a rear 135°/180°/225° angle. Turn the model STRICTLY AWAY from the camera showing ONLY the back of the head/hair, rear shoulders, back of coat, and rear heels — ZERO front face, ZERO eyes, ZERO front buttons!'
    );
  } else if (tokens.includes('reversed_horizontal_facing')) {
    cues.push(
      'CRITICAL HORIZONTAL REVERSAL FIX: The previous attempt pointed the person’s nose, chest, and shoe toes toward the WRONG BORDER of the photo! Flip the body yaw horizontally so the nose tip, coat lapels, and BOTH shoe toes point unmistakably toward the EXACT TARGET PHOTO BORDER (RIGHT BORDER -> for 45°/90°, LEFT BORDER <- for 315°/270°)!'
    );
  } else if (tokens.includes('head_only_turn')) {
    cues.push(
      'CRITICAL FULL-BODY 45° TORSO ROTATION FIX: The previous attempt turned ONLY the head/neck while leaving the shoulders, coat, pelvis, and shoes facing flat straight forward (0°)! Physically rotate the ENTIRE BODY as a rigid 45° diagonal three-quarter pose — near shoulder forward, far shoulder clearly receded behind torso, coat lapels angled diagonally, and both feet/toes angled 45° toward the target photo border!'
    );
  } else if (tokens.includes('wrong_orientation')) {
    cues.push(
      'CRITICAL ORIENTATION FIX: The previous attempt faced the wrong horizontal direction (e.g. facing left photo border instead of right photo border, or straight front instead of 45°/90°/270°/315°). Match the EXACT requested yaw angle and photo border direction (-> RIGHT BORDER or <- LEFT BORDER) strictly!'
    );
  }
  if (tokens.includes('wrong_bag_side')) {
    cues.push(
      'CRITICAL BAG SIDE FIX: The bag appeared on the wrong shoulder/hand/screen-side in the previous attempt. Lock the bag STRICTLY to the exact anatomical hand/shoulder and exact screen-left/screen-right side specified in the BAG SCREEN-SIDE LOCK and spatial guide — NEVER mirror or switch the bag to the opposite side.'
    );
  }
  if (tokens.includes('bag_armpit_tuck')) {
    cues.push(
      'CRITICAL ANTI-ARMPIT-TUCK FIX: The previous attempt tucked/clamped the bag awkwardly under the armpit or high against the ribs! Extend the carrying arm downward so the bag hangs naturally BELOW hip/mid-thigh height with clear separation below the armpit, and keep the opposite free arm 100% empty and relaxed.'
    );
  }
  if (tokens.includes('bag_strap_mismatch')) {
    cues.push(
      'CRITICAL BAG STRAP SPEC FIX: The previous attempt violated the bag strap specification (e.g., hallucinating a shoulder strap on a strapless hand-carry bag, or carrying a backpack in hand instead of on the back). Obey has_strap and bag_carry_style strictly: ZERO shoulder strap if has_strap=false; wear dual straps symmetrically on the back if backpack!'
    );
  }
  if (tokens.includes('outfit_mismatch')) {
    cues.push(
      'CRITICAL OUTFIT CONSISTENCY FIX: Match the exact coat/jacket/top/pants/shoes silhouette and color palette from the attached 0° MASTER ANCHOR image identically without changing garments or colors.'
    );
  }
  if (tokens.includes('text_overlay_in_image')) {
    cues.push(
      'CRITICAL CLEAN CANVAS FIX: Remove ALL floating text, Korean/English garment labels, captions, and hex color codes — render ONLY the person on a completely blank solid studio backdrop.'
    );
  }
  if (tokens.includes('palette_drift') || tokens.includes('height_mismatch')) {
    cues.push(
      'CRITICAL FIX: Match exact garment palette and full-body stature height identically across all 8 angles (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°).'
    );
  }
  return cues.join(' ');
}

function resolveExpectedBagScreenRule(angleDeg, dominantHand, bagSpec = null) {
  const canonical =
    angleDeg === -135
      ? 225
      : angleDeg === -90
        ? 270
        : angleDeg === -45
          ? 315
          : TURNAROUND_ANGLES.includes(angleDeg)
            ? angleDeg
            : 0;
  const anatomy = resolveBagCarryAnatomy(normalizeHandedness(dominantHand, 'right'), bagSpec);
  return {
    canonicalAngle: canonical,
    anatomy,
    screenRule: anatomy.perAngleScreenPrompt[canonical] || anatomy.perAngleScreenPrompt[0],
  };
}

const EXPECTED_FACING_BY_ANGLE = Object.freeze({
  0: ['front'],
  45: ['front_right'],
  90: ['right_profile'],
  135: ['back_right'],
  180: ['back'],
  225: ['back_left'],
  270: ['left_profile'],
  315: ['front_left'],
});

/**
 * Pure deterministic server-side evaluator for Vision QC structured verdicts.
 * Prevents LLM boolean rubber-stamping (e.g. confusing anatomical-left with image-left at 45°)
 * by explicitly checking objective pixel-space `bagObservedImageSide` and `facingDirection`
 * against our exact 3D trigonometry rules.
 *
 * @param {{
 *   verdict: Record<string, any> | null | undefined;
 *   canonicalAngle?: number;
 *   hasEquippedBag?: boolean;
 *   anatomy?: { perAngleScreenSide?: Record<number, string>; bagCarryStyle?: string } | null;
 * }} params
 */
export function evaluateVisionQcVerdict({
  verdict,
  canonicalAngle = 0,
  hasEquippedBag = false,
  anatomy = null,
}) {
  const reasons = [];
  const isRearAngle = canonicalAngle === 135 || canonicalAngle === 180 || canonicalAngle === 225;
  const facing = String(verdict?.facingDirection || '')
    .trim()
    .toLowerCase();
  const expectedFacings = EXPECTED_FACING_BY_ANGLE[canonicalAngle] || ['front'];

  const isFrontQuarterAngle = canonicalAngle === 45 || canonicalAngle === 315;
  const noseDir = String(verdict?.noseAndToesImageDirection || '')
    .trim()
    .toLowerCase();
  const expectedNoseEdge =
    canonicalAngle === 45 || canonicalAngle === 90
      ? 'toward_right_edge'
      : canonicalAngle === 315 || canonicalAngle === 270
        ? 'toward_left_edge'
        : null;

  if (isRearAngle) {
    const isFrontFacing =
      facing === 'front' || facing === 'front_right' || facing === 'front_left';
    if (verdict?.isRearNotFront === false || isFrontFacing || noseDir === 'straight_at_viewer') {
      reasons.push(`${canonicalAngle}:front_face_in_rear_view`);
    } else if (verdict?.orientationValid === false || (facing && !expectedFacings.includes(facing))) {
      reasons.push(`${canonicalAngle}:wrong_orientation`);
    }
  } else if (expectedNoseEdge && noseDir && noseDir !== expectedNoseEdge) {
    reasons.push(
      noseDir === 'toward_left_edge' || noseDir === 'toward_right_edge'
        ? `${canonicalAngle}:reversed_horizontal_facing`
        : `${canonicalAngle}:wrong_orientation`
    );
  } else if (isFrontQuarterAngle && verdict?.torsoBodyRotated === false) {
    reasons.push(`${canonicalAngle}:head_only_turn`);
  } else if (
    verdict?.orientationValid === false ||
    (facing && !expectedFacings.includes(facing))
  ) {
    reasons.push(`${canonicalAngle}:wrong_orientation`);
  }

  if (hasEquippedBag) {
    const expectedScreenSide = anatomy?.perAngleScreenSide?.[canonicalAngle] || null;
    const observedSide = String(verdict?.bagObservedImageSide || '')
      .trim()
      .toLowerCase();

    let bagSideMismatch = verdict?.bagSideValid === false;
    if (expectedScreenSide === 'screen-right' && observedSide === 'image_left') {
      bagSideMismatch = true;
    } else if (expectedScreenSide === 'screen-left' && observedSide === 'image_right') {
      bagSideMismatch = true;
    } else if (
      expectedScreenSide === 'center-back' &&
      (observedSide === 'image_left' || observedSide === 'image_right')
    ) {
      bagSideMismatch = true;
    } else if (
      expectedScreenSide === 'front-straps-only' &&
      (observedSide === 'image_left' || observedSide === 'image_right')
    ) {
      bagSideMismatch = true;
    }
    // Note: For `expectedScreenSide === 'far-occluded'` (e.g. 90° right-facing profile with bag on
    // far left side, or 270° left-facing profile with bag on far right side), a bag partially peeking
    // behind the back naturally sits on `image_left` at 90° and `image_right` at 270°. Do NOT
    // deterministically reject based on `observedSide` there — rely on `verdict.bagSideValid === false`
    // (foreground shoulder/arm violation) only.

    if (bagSideMismatch) {
      reasons.push(`${canonicalAngle}:wrong_bag_side`);
    }
    if (verdict?.armpitTuckDetected === true) {
      reasons.push(`${canonicalAngle}:bag_armpit_tuck`);
    }
    if (verdict?.strapMatchesSpec === false) {
      reasons.push(`${canonicalAngle}:bag_strap_mismatch`);
    }
  }

  if (verdict?.outfitConsistent === false) {
    reasons.push(
      verdict?.defectCode === 'cropped_body'
        ? `${canonicalAngle}:half_body`
        : `${canonicalAngle}:outfit_mismatch`
    );
  }
  if (verdict?.hasTextOrLabels === true) {
    reasons.push(`${canonicalAngle}:text_overlay_in_image`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

const SOFT_BAG_DEFECT_TOKENS = new Set([
  'wrong_bag_side',
  'bag_armpit_tuck',
  'bag_strap_mismatch',
]);

/**
 * Returns true ONLY when every Vision QC failure reason is a non-fatal bag-placement nuance
 * (zero orientation errors, zero front-face-in-rear, zero reversed facing, zero head-only turn,
 * zero cropped body, zero outfit mismatch, zero text overlay, and zero Vision QC error).
 */
export function isOnlySoftBagQcFailure(reasons = []) {
  if (!Array.isArray(reasons) || reasons.length === 0) return false;
  return reasons.every((raw) => {
    const token = String(raw || '').trim();
    if (!token) return false;
    const colonIdx = token.indexOf(':');
    const code = colonIdx >= 0 ? token.slice(colonIdx + 1) : token;
    return SOFT_BAG_DEFECT_TOKENS.has(code);
  });
}

/**
 * Soft bag tolerance on the final attempt is ONLY allowed for `far-occluded` side profiles
 * (e.g. 90° for right-handed / 270° for left-handed where the bag hangs behind the torso and
 * slight back-edge peeking is ambiguous). All visible-bag angles (0°, 45°, 135°, 180°, 225°, 315°,
 * and foreground 90°/270°) MUST strictly enforce exact bag shoulder/hand placement.
 * @param {object} options
 * @param {string[]} [options.reasons]
 * @param {number} [options.viewAngleDeg]
 * @param {string} [options.dominantHand]
 * @param {boolean | null} [options.bagHasStrap]
 * @param {string | null} [options.bagCarryStyle]
 */
export function canApplySoftBagTolerance({
  reasons = [],
  viewAngleDeg = 0,
  dominantHand = 'right',
  bagHasStrap = null,
  bagCarryStyle = null,
}) {
  if (!isOnlySoftBagQcFailure(reasons)) return false;
  const { canonicalAngle, anatomy } = resolveExpectedBagScreenRule(viewAngleDeg, dominantHand, {
    hasStrap: bagHasStrap,
    bagCarryStyle,
  });
  return anatomy?.perAngleScreenSide?.[canonicalAngle] === 'far-occluded';
}

/**
 * Resolves the effective anatomical bag handedness (`'right' | 'left'`) to lock onto downstream
 * 45°..315° waves when 0° Master Anchor falls back after exhausting bag-side retries.
 * - `bagObservedImageSide === 'image_left'` at 0° means wearer's RIGHT side -> `'left'` handedness carry rule.
 * - `bagObservedImageSide === 'image_right'` at 0° means wearer's LEFT side -> `'right'` handedness carry rule.
 * @param {object} options
 * @param {string} [options.requestedHandedness]
 * @param {{ bagObservedImageSide?: string | null } | null} [options.verdict]
 * @param {string | null} [options.bagCarryStyle]
 */
export function resolveEffectiveHandednessFromFrontVerdict({
  requestedHandedness = 'right',
  verdict = null,
  bagCarryStyle = null,
}) {
  const normalized = normalizeHandedness(requestedHandedness, 'right');
  if (bagCarryStyle === 'backpack') return normalized;
  const observed = String(verdict?.bagObservedImageSide || '')
    .trim()
    .toLowerCase();
  if (observed === 'image_left') return 'left';
  if (observed === 'image_right') return 'right';
  return normalized;
}

export function isAbortOrTimeoutError(err) {
  if (!err) return false;
  const name = String(err?.name || '');
  const code = String(err?.code || '');
  const message = String(err?.message || err || '');
  return (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    code === 'ABORT_ERR' ||
    code === 'ETIMEDOUT' ||
    /this operation was aborted|aborted|abort_err|timed?\s*out|timeout/i.test(message)
  );
}

function buildCombinedAbortSignal(timeoutMs, callerSignal = null) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!callerSignal) return timeoutSignal;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([callerSignal, timeoutSignal]);
  }
  return callerSignal.aborted ? callerSignal : timeoutSignal;
}

/**
 * Hardened Multimodal Vision QC judge (works on PNG, JPEG, and WebP) using `gemini-3.1-flash-lite`.
 * Verifies 8-angle body orientation (`facingDirection`, `isRearNotFront`), explicit pixel-space
 * `bagObservedImageSide`, anti-armpit-tuck (`armpitTuckDetected`), strap spec fidelity (`strapMatchesSpec`),
 * and outfit consistency. Guards against oversized PNG anchor timeouts with a candidate-only retry
 * and degrades gracefully if the upstream Vision QC inspector times out so pixel-verified images
 * are not discarded and spurious abort errors are not emitted.
 *
 * @param {object} options
 * @param {string} options.compositeImageUrl
 * @param {string | null} [options.masterAnchorDataUrl]
 * @param {number} [options.viewAngleDeg]
 * @param {boolean} [options.hasEquippedBag]
 * @param {string} [options.dominantHand]
 * @param {boolean | null} [options.bagHasStrap]
 * @param {string | null} [options.bagCarryStyle]
 * @param {AbortSignal | null} [options.signal]
 * @param {((payload: any) => Promise<{ text?: string | null }>) | null} [options.generateContentImpl]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.retryTimeoutMs]
 * @returns {Promise<{ ok: boolean; skipped: boolean; reasons: string[]; verdict?: any; timedOut?: boolean; aborted?: boolean }>}
 */
export async function runGeminiVisionAngleQc({
  compositeImageUrl,
  masterAnchorDataUrl = null,
  viewAngleDeg = 0,
  hasEquippedBag = false,
  dominantHand = 'right',
  bagHasStrap = null,
  bagCarryStyle = null,
  signal = null,
  generateContentImpl = null,
  timeoutMs = VISION_QC_TIMEOUT_MS,
  retryTimeoutMs = VISION_QC_RETRY_TIMEOUT_MS,
}) {
  if (signal?.aborted) {
    return { ok: true, skipped: true, aborted: true, reasons: [] };
  }

  let generateContent = typeof generateContentImpl === 'function' ? generateContentImpl : null;
  if (!generateContent) {
    const apiKey = getServerGeminiApiKey();
    const client = apiKey ? getServerGeminiClient(apiKey) : null;
    if (!client) {
      return { ok: true, skipped: true, reasons: [] };
    }
    generateContent = (reqPayload) => client.models.generateContent(reqPayload);
  }

  const parsedCandidate = parseImageDataUrl(compositeImageUrl);
  if (!parsedCandidate) {
    return { ok: false, skipped: false, reasons: ['invalid_image_data_url'] };
  }

  const rawParsedAnchor = masterAnchorDataUrl ? parseImageDataUrl(masterAnchorDataUrl) : null;
  // Oversized uncompressed RGBA PNG anchors (e.g. >750KB from cached cutouts) frequently push
  // concurrent multimodal Vision QC calls past the timeout window; keep Vision QC lean by skipping
  // bloated anchors while still inspecting orientation, framing, bag pixel-side, and canvas hygiene.
  const compactAnchor =
    rawParsedAnchor && rawParsedAnchor.buffer.length <= VISION_QC_MAX_ANCHOR_BYTES
      ? rawParsedAnchor
      : null;

  const bagSpec = hasEquippedBag
    ? {
        hasStrap: bagHasStrap,
        bagCarryStyle,
      }
    : null;
  const { canonicalAngle, anatomy, screenRule } = resolveExpectedBagScreenRule(
    viewAngleDeg,
    dominantHand,
    bagSpec
  );
  const isRearAngle = canonicalAngle === 135 || canonicalAngle === 180 || canonicalAngle === 225;

  const orientationSpec =
    canonicalAngle === 180
      ? 'STRICT 180° BACK VIEW: Model back MUST face camera. ZERO front face, ZERO eyes, ZERO nose/mouth, ZERO front chest/buttons visible.'
      : canonicalAngle === 135
        ? 'STRICT 135° BACK-RIGHT THREE-QUARTER REAR VIEW: Model turned away facing back-right (->); back of head/hair and back of coat dominant; ZERO front eyes/front chest facing camera.'
        : canonicalAngle === 225
          ? 'STRICT 225° BACK-LEFT THREE-QUARTER REAR VIEW: Model turned away facing back-left (<-); back of head/hair and back of coat dominant; ZERO front eyes/front chest facing camera.'
          : canonicalAngle === 90
            ? 'STRICT 90° RIGHT LATERAL SIDE PROFILE: Model facing straight toward VIEWER-RIGHT (->) in pure side profile (NOT facing viewer-left, NOT straight front, NOT back).'
            : canonicalAngle === 270
              ? 'STRICT 270° LEFT LATERAL SIDE PROFILE: Model facing straight toward VIEWER-LEFT (<-) in pure side profile (NOT facing viewer-right, NOT straight front, NOT back).'
              : canonicalAngle === 45
                ? 'STRICT 45° FRONT-RIGHT THREE-QUARTER VIEW: Model angled ~45° toward VIEWER-RIGHT (->), front face & chest visible (NOT facing viewer-left, NOT back).'
                : canonicalAngle === 315
                  ? 'STRICT 315° FRONT-LEFT THREE-QUARTER VIEW: Model angled ~45° toward VIEWER-LEFT (<-), front face & chest visible (NOT facing viewer-right, NOT back).'
                  : 'STRICT 0° DIRECT FRONT VIEW: Full symmetrical front-facing full-body portrait.';

  const buildParts = (anchorToAttach) => {
    const parts = [];
    if (anchorToAttach) {
      parts.push({
        text: '[IMAGE 1 — MASTER 0° FRONT ANCHOR REFERENCE]: Reference person, outfit colors, and bag.',
      });
      parts.push({
        inlineData: {
          mimeType: anchorToAttach.mimeType,
          data: anchorToAttach.buffer.toString('base64'),
        },
      });
    }
    parts.push({
      text: `[IMAGE ${anchorToAttach ? '2' : '1'} — CANDIDATE IMAGE TO INSPECT FOR TARGET ANGLE ${canonicalAngle}°]:`,
    });
    parts.push({
      inlineData: {
        mimeType: parsedCandidate.mimeType,
        data: parsedCandidate.buffer.toString('base64'),
      },
    });
    parts.push({
      text: [
        `You are a strict automated Visual QC Inspector for an 8-angle 360° virtual try-on avatar at target angle ${canonicalAngle}°.`,
        `1. ORIENTATION & PIXEL-SPACE FACING DIRECTION CHECK: ${orientationSpec}`,
        '   FIRST report noseAndToesImageDirection strictly in 2D VIEWER IMAGE PIXEL SPACE (IGNORE anatomical left/right!):',
        '     * "toward_right_edge" = the tip of the person’s NOSE, chest front, and SHOE TOES point toward the RIGHT BORDER (->) of the image frame.',
        '     * "toward_left_edge" = the tip of the person’s NOSE, chest front, and SHOE TOES point toward the LEFT BORDER (<-) of the image frame.',
        '     * "straight_at_viewer" = nose & toes face straight forward at the camera (0°).',
        '     * "away_from_viewer" = back of head / rear coat facing camera (135°/180°/225°).',
        '   Report facingDirection as one of: "front", "front_right" (pointing toward RIGHT BORDER ->), "right_profile" (pointing toward RIGHT BORDER ->), "back_right", "back", "back_left", "left_profile" (pointing toward LEFT BORDER <-), "front_left" (pointing toward LEFT BORDER <-).',
        isRearAngle
          ? '   CRITICAL REAR CHECK: Set isRearNotFront=true ONLY if the model is genuinely facing AWAY from the camera (back of head/hair & rear torso visible, ZERO front eyes/chest). If a front face or front chest is visible, you MUST set isRearNotFront=false, orientationValid=false, and defectCode="front_face_in_rear_view"! Set torsoBodyRotated=true for genuine rear views.'
          : canonicalAngle === 45 || canonicalAngle === 315
            ? `   CRITICAL FULL-BODY QUARTER-TURN & BORDER CHECK (${canonicalAngle}°): Target requires noseAndToesImageDirection="${canonicalAngle === 45 ? 'toward_right_edge' : 'toward_left_edge'}". If the nose/toes point toward the OPPOSITE photo border, you MUST set orientationValid=false and defectCode="reversed_horizontal_facing"! Also inspect SHOULDERS, CHEST/COAT FRONT, HIPS, and FEET — set torsoBodyRotated=true ONLY if the shoulders, torso, coat, pelvis, and shoes are genuinely turned ~45° diagonally (if shoulders stayed flat 0° while only the head turned, set torsoBodyRotated=false, orientationValid=false, defectCode="head_only_turn"). Set isRearNotFront=true.`
            : '   Set isRearNotFront=true and torsoBodyRotated=true (for 0°/90°/270°), and set orientationValid=false with defectCode="reversed_horizontal_facing" if noseAndToesImageDirection points to the opposite photo border!',
        hasEquippedBag
          ? `2. BAG PIXEL-SIDE, ARMPIT-TUCK & STRAP CHECK (REQUIRED):
   - FIRST report bagObservedImageSide strictly in VIEWER IMAGE PIXEL COORDINATES (NOT wearer anatomy):
     * "image_left" = the bag body sits on the LEFT half of the image frame (viewer's left <-).
     * "image_right" = the bag body sits on the RIGHT half of the image frame (viewer's right ->).
     * "center_back" = backpack centered on the middle of the wearer's back.
     * "occluded_or_none" = bag is hidden behind the torso or only shoulder straps are visible on front.
   - Expected rule for ${canonicalAngle}° (has_strap=${anatomy.hasStrap}, carry_style=${anatomy.bagCarryStyle}): ${screenRule}.${
              anatomy.perAngleScreenSide[canonicalAngle] === 'far-occluded'
                ? `\n   - FAR-OCCLUDED SIDE PROFILE TOLERANCE (${canonicalAngle}°): Because the bag hangs on the FAR side behind the torso, if the bag is occluded behind the body OR only partially peeking behind/past the torso while the FOREGROUND shoulder/arm facing the camera stays empty, set bagSideValid=true! Set bagSideValid=false ONLY if the bag or its strap is clearly worn on the FOREGROUND shoulder/arm facing the camera.`
                : ''
            }
   - Set bagSideValid=false (defectCode="wrong_bag_side") if the bag is placed on the wrong side of the body/screen or switched hands compared to IMAGE 1.
   - Set armpitTuckDetected=true (defectCode="bag_armpit_tuck") if the bag is awkwardly clamped/wedged high under the armpit or crushed into the upper torso instead of hanging naturally at hand/thigh or hip level.
   - Set strapMatchesSpec=false (defectCode="bag_strap_mismatch") if has_strap=false yet a shoulder/crossbody strap is drawn, OR if carry_style=backpack yet the backpack is carried in one hand instead of worn on the back.`
          : '2. BAG CHECK: No bag equipped; set bagObservedImageSide="occluded_or_none", bagSideValid=true, armpitTuckDetected=false, strapMatchesSpec=true.',
        '3. OUTFIT & FULL-BODY CHECK: Verify full head-to-shoe framing (not cropped at waist/thigh) and consistent coat/outfit colors matching the reference (if provided). Set outfitConsistent=false if coat color changed dramatically or body is cropped.',
        '4. CLEAN CANVAS / NO TEXT CHECK: Set hasTextOrLabels=true if ANY text, Korean/English captions, garment spec labels, or #hex color codes are drawn anywhere in the image.',
        'Return strict JSON only.',
      ].join('\n'),
    });
    return parts;
  };

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      noseAndToesImageDirection: {
        type: Type.STRING,
        description:
          'Pure 2D image-border direction that nose tip and shoe toes point toward: toward_right_edge, toward_left_edge, straight_at_viewer, or away_from_viewer',
      },
      facingDirection: {
        type: Type.STRING,
        description:
          'Detected facing direction: front, front_right, right_profile, back_right, back, back_left, left_profile, front_left',
      },
      orientationValid: { type: Type.BOOLEAN },
      isRearNotFront: { type: Type.BOOLEAN },
      torsoBodyRotated: {
        type: Type.BOOLEAN,
        description:
          'For 45°/315°: true ONLY if shoulders, chest/coat, hips, and feet rotated diagonally ~45° (false if only the head turned while shoulders stayed flat 0°)',
      },
      bagObservedImageSide: {
        type: Type.STRING,
        description:
          'Observed pixel location of bag body in image frame: image_left, image_right, center_back, occluded_or_none',
      },
      bagSideValid: { type: Type.BOOLEAN },
      armpitTuckDetected: { type: Type.BOOLEAN },
      strapMatchesSpec: { type: Type.BOOLEAN },
      outfitConsistent: { type: Type.BOOLEAN },
      hasTextOrLabels: { type: Type.BOOLEAN },
      defectCode: {
        type: Type.STRING,
        description:
          'One of: none, front_face_in_rear_view, reversed_horizontal_facing, head_only_turn, wrong_orientation, wrong_bag_side, bag_armpit_tuck, bag_strap_mismatch, outfit_mismatch, cropped_body, text_overlay_in_image',
      },
    },
    required: [
      'noseAndToesImageDirection',
      'facingDirection',
      'orientationValid',
      'isRearNotFront',
      'torsoBodyRotated',
      'bagObservedImageSide',
      'bagSideValid',
      'armpitTuckDetected',
      'strapMatchesSpec',
      'outfitConsistent',
      'hasTextOrLabels',
      'defectCode',
    ],
  };

  const invokeVisionQc = async (anchorToAttach, callTimeoutMs) => {
    const parts = buildParts(anchorToAttach);
    return generateContent({
      model: VISION_QC_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: 'application/json',
        responseSchema,
        abortSignal: buildCombinedAbortSignal(callTimeoutMs, signal),
      },
    });
  };

  const attempts = compactAnchor
    ? [
        { anchor: compactAnchor, callTimeoutMs: timeoutMs },
        { anchor: null, callTimeoutMs: retryTimeoutMs },
      ]
    : [{ anchor: null, callTimeoutMs: timeoutMs }];

  let lastErr = null;
  for (let i = 0; i < attempts.length; i += 1) {
    if (signal?.aborted) {
      return { ok: true, skipped: true, aborted: true, reasons: [] };
    }
    const { anchor, callTimeoutMs } = attempts[i];
    try {
      const response = await invokeVisionQc(anchor, callTimeoutMs);
      const rawText = String(response?.text || '').trim();
      if (!rawText) {
        if (canonicalAngle !== 0) {
          return {
            ok: false,
            skipped: false,
            reasons: [`${canonicalAngle}:vision_qc_empty_response`],
          };
        }
        return { ok: true, skipped: true, reasons: [] };
      }
      const verdict = JSON.parse(rawText);
      const evaluated = evaluateVisionQcVerdict({
        verdict,
        canonicalAngle,
        hasEquippedBag,
        anatomy,
      });
      return {
        ok: evaluated.ok,
        skipped: false,
        reasons: evaluated.reasons,
        verdict,
      };
    } catch (err) {
      lastErr = err;
      if (signal?.aborted) {
        return { ok: true, skipped: true, aborted: true, reasons: [] };
      }
      if (isAbortOrTimeoutError(err)) {
        // Retry once without the anchor image if the multi-image payload timed out
        if (i + 1 < attempts.length) {
          continue;
        }
        // Vision QC timed out even on the lightweight candidate-only pass: degrade gracefully
        // without emitting a noisy abort error or throwing away a pixel-verified image.
        return {
          ok: true,
          skipped: true,
          timedOut: true,
          reasons: [],
        };
      }
      break;
    }
  }

  console.warn('[VTON Vision QC] inspector error:', lastErr?.message || lastErr);
  if (canonicalAngle !== 0) {
    return {
      ok: false,
      skipped: false,
      reasons: [`${canonicalAngle}:vision_qc_error`],
    };
  }
  return { ok: true, skipped: true, reasons: [] };
}

export function sanitizeQcLogString(value, maxLen = 160) {
  return String(value || '')
    .replace(/\p{Cc}/gu, ' ')
    .trim()
    .slice(0, maxLen);
}

const MAX_QC_LOG_BYTES = 5 * 1024 * 1024;

export function appendVtonQcFailureLog(entry, logFilePath) {
  const targetPath = path.resolve(
    String(logFilePath || process.env.AINVENTORY_VTON_QC_LOG_PATH || DEFAULT_VTON_QC_LOG_PATH)
  );
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    try {
      const stat = fs.statSync(targetPath);
      if (stat.size >= MAX_QC_LOG_BYTES) {
        fs.renameSync(targetPath, `${targetPath}.1`);
      }
    } catch {
      // File does not exist yet
    }
    const isFrontOnlyFallback =
      entry?.frontOnlyFallback !== false && entry?.frontOnlyDegraded !== false;
    const record = {
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      comboHash: sanitizeQcLogString(entry?.comboHash || 'unknown', 128) || 'unknown',
      avatarConfigHash: entry?.avatarConfigHash
        ? sanitizeQcLogString(entry.avatarConfigHash, 64) || null
        : null,
      attempts: Math.max(1, Math.round(Number(entry?.attempts) || 3)),
      reasons: Array.isArray(entry?.reasons)
        ? entry.reasons
            .slice(0, 24)
            .map((r) => sanitizeQcLogString(r, 160))
            .filter(Boolean)
        : [],
      failedAngles: Array.isArray(entry?.failedAngles) ? entry.failedAngles.slice(0, 8) : [],
      equippedSlots: Array.isArray(entry?.equippedSlots)
        ? entry.equippedSlots.slice(0, 24).map((s) => sanitizeQcLogString(s, 48)).filter(Boolean)
        : [],
      handedness: sanitizeQcLogString(entry?.handedness, 16).toLowerCase() === 'left' ? 'left' : 'right',
      fallbackView: isFrontOnlyFallback ? 'positive-only' : 'flatlay-fallback',
      frontOnlyDegraded: isFrontOnlyFallback,
      provider: sanitizeQcLogString(entry?.provider || 'gemini-vton', 64) || 'gemini-vton',
      model: entry?.model ? sanitizeQcLogString(entry.model, 96) || null : null,
    };
    fs.appendFileSync(targetPath, `${JSON.stringify(record)}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Server-side pre-processing Quality Control (QC) Express middleware for `POST /api/vton/synthesize`.
 * Executes synthesis & pixel-consistency validation BEFORE serving to the client:
 * - Retries up to 3 attempts with corrective prompts when character consistency or cutout QC fails.
 * - After 3 failed attempts, logs the error to `logFilePath` and serves the clean `'positive-only'`
 *   (`0°` front) fallback view with a 3-second notification popup payload.
 */
/**
 * @param {object} options
 * @param {(params: any) => Promise<any>} options.synthesizeLook
 * @param {(cacheKey: string) => void} [options.invalidateCache]
 * @param {string} [options.logFilePath]
 * @param {number} [options.maxAttempts]
 * @param {((args: any) => Promise<{ ok: boolean; reasons: string[]; skipped?: boolean }>) | null} [options.visionQcImpl]
 */
export function createVtonQcMiddleware({
  synthesizeLook,
  invalidateCache,
  logFilePath,
  maxAttempts,
  visionQcImpl = null,
}) {
  const hasExplicitMaxAttempts =
    maxAttempts !== undefined && maxAttempts !== null && Number.isFinite(Number(maxAttempts));
  const attemptLimit = Math.max(
    1,
    Math.min(5, Math.round(Number(maxAttempts) || DEFAULT_MAX_QC_ATTEMPTS))
  );

  return async function vtonQualityControlMiddleware(req, res, next) {
    const requestAbortController = new AbortController();
    const handleClientClose = () => {
      if (!res?.writableEnded && !requestAbortController.signal.aborted) {
        requestAbortController.abort(new Error('client_disconnected'));
      }
    };
    if (typeof res?.on === 'function') {
      res.on('close', handleClientClose);
    }

    try {
      const baseParams = req.vtonSynthesisParams;
      if (!baseParams || typeof baseParams !== 'object') {
        return next(new Error('Missing vtonSynthesisParams before QC middleware'));
      }

      const isSingleNonZeroAngle =
        !baseParams.turnaroundSheet &&
        Number.isFinite(Number(baseParams.viewAngleDeg)) &&
        Number(baseParams.viewAngleDeg) !== 0;
      const isSingleShot4x2Sheet =
        Boolean(baseParams.turnaroundSheet) &&
        baseParams.turnaroundLayout === 'turnaround_4x2';
      const envSheetMaxAttempts = Number(process.env.GEMINI_VTON_SHEET_MAX_QC_ATTEMPTS);
      const sheetAttemptCap =
        Number.isFinite(envSheetMaxAttempts) && envSheetMaxAttempts >= 1
          ? Math.min(3, Math.round(envSheetMaxAttempts))
          : 1;
      const effectiveAttemptLimit =
        !hasExplicitMaxAttempts && isSingleShot4x2Sheet ? sheetAttemptCap : attemptLimit;

      let lastResult = null;
      let lastReport = null;
      let lastVisionVerdict = null;
      let bestFrontCutoutUrl = null;
      let correctionHint =
        typeof baseParams.correctionHint === 'string' ? baseParams.correctionHint.trim() : '';

      for (let attempt = 1; attempt <= effectiveAttemptLimit; attempt += 1) {
        if (requestAbortController.signal.aborted) {
          return undefined;
        }
        const hadFrontBagFailure =
          !isSingleNonZeroAngle &&
          !baseParams.turnaroundSheet &&
          Array.isArray(lastReport?.reasons) &&
          isOnlySoftBagQcFailure(lastReport.reasons);
        const escalateToFallbackModel =
          (isSingleNonZeroAngle && effectiveAttemptLimit >= 3 && attempt === effectiveAttemptLimit) ||
          (hadFrontBagFailure && attempt >= 2);
        const result = await synthesizeLook({
          ...baseParams,
          forceRefresh: attempt > 1 ? true : Boolean(baseParams.forceRefresh),
          ...(escalateToFallbackModel ? { preferFallbackModel: true } : {}),
          ...(correctionHint ? { qcCorrectionHint: correctionHint } : {}),
        });
        if (requestAbortController.signal.aborted) {
          return undefined;
        }
        lastResult = result;

        // Pass through immediate non-Gemini flatlay fallbacks without retrying or logging QC errors
        if (!result?.geminiUsed || result.provider === 'flatlay-fallback' || !result.compositeImageUrl) {
          res.locals.vtonResult = {
            ...result,
            qcStatus: 'skipped_fallback',
            qcPassed: false,
            qcAttempts: attempt,
            frontOnlyDegraded: false,
          };
          return next();
        }

        const report = validateSynthesizedVtonPayload(result);

        const hasEquippedBagForQc = Boolean(
          result.hasEquippedBag ||
            (Array.isArray(result.equippedSlots) &&
              result.equippedSlots.includes('accessory'))
        );

        // Run Multimodal Vision Orientation & Bag-Side QC on all live non-0° angles AND on 0° Master Anchor
        // whenever a bag is equipped (so 0° NEVER locks in a swapped-hand or armpit-tucked bag that would
        // contradict every downstream 45°..315° angle!).
        const shouldRunVisionQc =
          report.ok &&
          !baseParams.skipVisionQc &&
          !result.cached &&
          (isSingleNonZeroAngle || (hasEquippedBagForQc && !baseParams.turnaroundSheet)) &&
          (typeof visionQcImpl === 'function' || Boolean(getServerGeminiApiKey()));

        if (shouldRunVisionQc) {
          const runVision =
            typeof visionQcImpl === 'function' ? visionQcImpl : runGeminiVisionAngleQc;
          const visionReport = await runVision({
            compositeImageUrl: result.compositeImageUrl,
            masterAnchorDataUrl: isSingleNonZeroAngle ? baseParams.masterAnchorDataUrl || null : null,
            viewAngleDeg: result.viewAngleDeg ?? baseParams.viewAngleDeg ?? 0,
            hasEquippedBag: hasEquippedBagForQc,
            dominantHand: result.handedness || baseParams.handedness || 'right',
            bagHasStrap: result.bagHasStrap ?? null,
            bagCarryStyle: result.bagCarryStyle ?? null,
            signal: requestAbortController.signal,
          });
          if (requestAbortController.signal.aborted) {
            return undefined;
          }
          if (visionReport && 'verdict' in visionReport && visionReport.verdict) {
            lastVisionVerdict = visionReport.verdict;
          }
          if (visionReport && visionReport.ok === false) {
            report.ok = false;
            report.reasons = [
              ...(Array.isArray(report.reasons) ? report.reasons : []),
              ...(Array.isArray(visionReport.reasons) ? visionReport.reasons : ['wrong_orientation']),
            ];
            report.failedAngles = [result.viewAngleDeg ?? baseParams.viewAngleDeg ?? 0];
            report.visionQcRejected = true;
          }
        }

        lastReport = report;
        if (report.frontValid && report.frontCutoutDataUrl) {
          bestFrontCutoutUrl = report.frontCutoutDataUrl;
        }

        if (report.ok) {
          res.locals.vtonResult = {
            ...result,
            effectiveBagHandedness: normalizeHandedness(
              result.handedness || baseParams.handedness,
              'right'
            ),
            qcStatus: 'passed',
            qcPassed: true,
            qcAttempts: attempt,
            qcReasons: [],
            failedAngles: [],
            frontOnlyDegraded: false,
          };
          return next();
        }

        const willPassSingleShotBudget =
          isSingleShot4x2Sheet && effectiveAttemptLimit === 1 && Boolean(result.compositeImageUrl);

        // Invalidate broken sheet/angle in server cache before retrying so defective images are never reused.
        // Skip invalidation for single-shot 4x2 budget passes so cached sheets remain reusable at $0 cost.
        if (typeof invalidateCache === 'function' && result.cacheKey && !willPassSingleShotBudget) {
          try {
            invalidateCache(result.cacheKey);
          } catch {
            // ignore cache invalidation error
          }
        }

        correctionHint = buildQcCorrectionHint(report.reasons);
      }

      // On the final attempt of a `far-occluded` side profile ONLY (e.g. 90° right-handed or
      // 270° left-handed where the bag hangs behind the torso), accept verified-orientation images
      // with soft bag ambiguity instead of leaving a dead angle. Visible angles (45°/135°/180°/225°/315°)
      // NEVER accept wrong_bag_side so opposite-shoulder bugs cannot leak through!
      if (
        isSingleNonZeroAngle &&
        lastResult?.compositeImageUrl &&
        lastReport?.visionQcRejected &&
        canApplySoftBagTolerance({
          reasons: lastReport.reasons,
          viewAngleDeg: lastResult.viewAngleDeg ?? baseParams.viewAngleDeg ?? 0,
          dominantHand: lastResult.handedness || baseParams.handedness || 'right',
          bagHasStrap: lastResult.bagHasStrap ?? null,
          bagCarryStyle: lastResult.bagCarryStyle ?? null,
        })
      ) {
        res.locals.vtonResult = {
          ...lastResult,
          qcStatus: 'passed_soft_bag_tolerance',
          qcPassed: true,
          qcAttempts: effectiveAttemptLimit,
          qcReasons: lastReport.reasons || [],
          failedAngles: [],
          frontOnlyDegraded: false,
        };
        return next();
      }

      // Cost-safe single-shot 4x2 Nano Banana 2.1 sheet: return the generated 8-panel sheet
      // directly so the client slices all 8 angles locally at $0 extra API cost instead of triggering
      // paid retries or single-angle rescue calls.
      if (isSingleShot4x2Sheet && effectiveAttemptLimit === 1 && lastResult?.compositeImageUrl) {
        res.locals.vtonResult = {
          ...lastResult,
          effectiveBagHandedness: normalizeHandedness(
            lastResult.handedness || baseParams.handedness,
            'right'
          ),
          qcStatus: 'single_shot_budget_pass',
          qcPassed: true,
          qcAttempts: 1,
          qcReasons: lastReport?.reasons || [],
          failedAngles: [],
          frontOnlyDegraded: false,
        };
        return next();
      }

      // All QC attempts failed -> log failure to file
      appendVtonQcFailureLog(
        {
          comboHash: lastResult?.comboHash,
          avatarConfigHash: lastResult?.avatarConfigHash,
          attempts: effectiveAttemptLimit,
          reasons: lastReport?.reasons || ['qc_validation_failed'],
          failedAngles: lastReport?.failedAngles || [baseParams.viewAngleDeg ?? 0],
          equippedSlots: lastResult?.equippedSlots || [],
          handedness: lastResult?.handedness || 'right',
          frontOnlyFallback: !isSingleNonZeroAngle,
          provider: lastResult?.provider || 'gemini-vton',
          model: lastResult?.model || null,
        },
        logFilePath
      );

      // For a single non-0° progressive angle request, NEVER return a defective front-face rear image or swap in 0°!
      if (isSingleNonZeroAngle) {
        res.locals.vtonResult = {
          ...lastResult,
          ok: true,
          provider: 'flatlay-fallback',
          geminiUsed: false,
          fallbackToFlatLay: false,
          compositeImageUrl: null,
          baseModelImageUrl: null,
          frontOnlyDegraded: false,
          angleQcFailed: true,
          qcStatus: 'angle_qc_failed',
          qcPassed: false,
          qcAttempts: effectiveAttemptLimit,
          qcReasons: lastReport?.reasons || ['angle_qc_failed'],
          failedAngles: lastReport?.failedAngles || [baseParams.viewAngleDeg],
          fallbackReason: 'angle_qc_failed',
        };
        return next();
      }

      let positiveOnlyImageUrl = bestFrontCutoutUrl;

      // If even 0° inside all 3 sheets failed, request one dedicated 0° front single portrait rescue
      if (!positiveOnlyImageUrl) {
        try {
          const singleRescue = await synthesizeLook({
            ...baseParams,
            viewAngleDeg: 0,
            turnaroundSheet: false,
            forceRefresh: true,
            skipCacheWrite: true,
            profile: {
              ...(baseParams.profile || {}),
              viewAngleDeg: 0,
              turnaroundSheet: false,
            },
            ...(correctionHint ? { qcCorrectionHint: correctionHint } : {}),
          });
          if (singleRescue?.geminiUsed && singleRescue.compositeImageUrl) {
            const singleQc = validateSynthesizedVtonPayload({
              ...singleRescue,
              layout: 'single',
              viewAngleDeg: 0,
            });
            positiveOnlyImageUrl =
              singleQc.frontCutoutDataUrl || singleRescue.compositeImageUrl;
          }
        } catch {
          // fall through to best available last image
        }
      }

      if (!positiveOnlyImageUrl) {
        const isLastTurnaround =
          lastResult?.layout === 'turnaround_4x2' ||
          lastResult?.layout === 'turnaround_3x2' ||
          lastResult?.layout === 'turnaround_2x2';
        if (isLastTurnaround) {
          const panelZero = lastResult?.panelImages?.['0'];
          if (typeof panelZero === 'string' && panelZero.startsWith('data:image/')) {
            positiveOnlyImageUrl = panelZero;
          } else {
            const parsedLast = parseImageDataUrl(lastResult?.compositeImageUrl);
            if (parsedLast?.mimeType === 'image/png') {
              const decodedLast = decodePngBufferToRgba(parsedLast.buffer);
              if (decodedLast) {
                const panels = sliceTurnaroundPanelsInServerBuffer(
                  decodedLast.rgba,
                  decodedLast.width,
                  decodedLast.height,
                  lastResult.layout
                );
                const cell0 = panels?.[0];
                if (cell0) {
                  const cell0Data = new Uint8ClampedArray(cell0.rgba);
                  cutoutStudioBackdropToRgba(cell0Data, cell0.width, cell0.height);
                  scrubCutoutArtifactsInBuffer(cell0Data, cell0.width, cell0.height);
                  positiveOnlyImageUrl = encodeRgbaToPngDataUrl(
                    cell0.width,
                    cell0.height,
                    cell0Data
                  );
                }
              }
            }
          }
        } else {
          positiveOnlyImageUrl = lastResult?.compositeImageUrl || null;
        }
      }

      if (!positiveOnlyImageUrl) {
        res.locals.vtonResult = {
          ...lastResult,
          ok: true,
          provider: 'flatlay-fallback',
          geminiUsed: false,
          fallbackToFlatLay: true,
          compositeImageUrl: null,
          baseModelImageUrl: null,
          frontOnlyDegraded: false,
          fallbackView: 'flatlay-fallback',
          qcStatus: 'failed_fallback_flatlay',
          qcPassed: false,
          qcAttempts: attemptLimit,
          qcReasons: lastReport?.reasons || ['qc_validation_failed'],
          failedAngles: lastReport?.failedAngles || [0],
          fallbackReason: 'qc_validation_failed',
        };
        return next();
      }

      const effectiveBagHandedness = resolveEffectiveHandednessFromFrontVerdict({
        requestedHandedness: lastResult?.handedness || baseParams.handedness || 'right',
        verdict: lastVisionVerdict,
        bagCarryStyle: lastResult?.bagCarryStyle ?? null,
      });

      res.locals.vtonResult = {
        ...lastResult,
        ok: true,
        layout: 'single',
        viewAngleDeg: 0,
        compositeImageUrl: positiveOnlyImageUrl,
        baseModelImageUrl: null,
        effectiveBagHandedness,
        frontOnlyDegraded: true,
        fallbackView: 'positive-only',
        qcStatus: 'fallback_positive_only',
        qcPassed: false,
        qcAttempts: attemptLimit,
        qcReasons: lastReport?.reasons || ['qc_validation_failed'],
        failedAngles: lastReport?.failedAngles || [0],
        fallbackReason: 'qc_front_only_fallback',
        notificationPopup: { ...QC_FRONT_ONLY_NOTIFICATION_POPUP },
      };
      return next();
    } catch (err) {
      if (requestAbortController.signal.aborted) {
        return undefined;
      }
      return next(err);
    } finally {
      if (typeof res?.off === 'function') {
        res.off('close', handleClientClose);
      } else if (typeof res?.removeListener === 'function') {
        res.removeListener('close', handleClientClose);
      }
    }
  };
}
