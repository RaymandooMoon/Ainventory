import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { DATA_DIR } from './db.js';
import { cutoutStudioBackdropToRgba } from '../src/services/cutoutService.ts';
import {
  evaluateTurnaroundConsistencyQc,
  inspectPixelSliceQc,
} from '../src/services/vtonQualityControl.ts';
import {
  TURNAROUND_ANGLES,
  eraseSheetGridDividerLinesInBuffer,
  resolveTurnaroundRowSplitYInBuffer,
  resolveTurnaroundSheetGridDecisionInBuffer,
  scrubCutoutArtifactsInBuffer,
} from '../src/services/vton2DService.ts';

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

function sliceTurnaroundPanelsInServerBuffer(rgba, w, h, layout) {
  const working = new Uint8ClampedArray(rgba);
  if (w >= 256 && h >= 256) {
    eraseSheetGridDividerLinesInBuffer(working, w, h);
  }
  const isExplicit2x2 = layout === 'turnaround_2x2' || w < 256 || h < 256;
  const isHorizontal1x6 = !isExplicit2x2 && w / h >= 3.15;
  const isHorizontal1x4 = !isHorizontal1x6 && w / h >= 2.15;
  const splitY = resolveTurnaroundRowSplitYInBuffer(working, w, h);
  const gridDecision = resolveTurnaroundSheetGridDecisionInBuffer(working, w, h, { layout });

  const rects = [];
  if (isHorizontal1x6) {
    const colW = Math.floor(w / 6);
    const trimX = Math.max(1, Math.round(colW * 0.015));
    const trimY = Math.max(1, Math.round(h * 0.012));
    for (let i = 0; i < TURNAROUND_ANGLES.length; i += 1) {
      rects.push({
        angle: TURNAROUND_ANGLES[i],
        sx: colW * i + trimX,
        sy: trimY,
        cw: Math.max(16, colW - trimX * 2),
        ch: Math.max(16, h - trimY * 2),
      });
    }
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
    result.layout === 'turnaround_3x2' || result.layout === 'turnaround_2x2';

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
  if (tokens.includes('palette_drift') || tokens.includes('height_mismatch')) {
    cues.push(
      'CRITICAL FIX: Match exact garment palette and full-body stature height identically across all 6 panels (0°, 45°, 90°, 135°, 180°, 225°).'
    );
  }
  return cues.join(' ');
}

export function appendVtonQcFailureLog(entry, logFilePath) {
  const targetPath = path.resolve(
    String(logFilePath || process.env.AINVENTORY_VTON_QC_LOG_PATH || DEFAULT_VTON_QC_LOG_PATH)
  );
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const record = {
      timestamp: Date.now(),
      isoTime: new Date().toISOString(),
      comboHash: String(entry?.comboHash || 'unknown'),
      avatarConfigHash: entry?.avatarConfigHash || null,
      attempts: Math.max(1, Math.round(Number(entry?.attempts) || 3)),
      reasons: Array.isArray(entry?.reasons) ? entry.reasons.slice(0, 24) : [],
      failedAngles: Array.isArray(entry?.failedAngles) ? entry.failedAngles.slice(0, 8) : [],
      equippedSlots: Array.isArray(entry?.equippedSlots) ? entry.equippedSlots : [],
      handedness: entry?.handedness || 'right',
      fallbackView: 'positive-only',
      frontOnlyDegraded: true,
      provider: entry?.provider || 'gemini-vton',
      model: entry?.model || null,
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
export function createVtonQcMiddleware({
  synthesizeLook,
  invalidateCache,
  logFilePath,
  maxAttempts = DEFAULT_MAX_QC_ATTEMPTS,
}) {
  const attemptLimit = Math.max(1, Math.min(5, Math.round(Number(maxAttempts) || 3)));

  return async function vtonQualityControlMiddleware(req, res, next) {
    try {
      const baseParams = req.vtonSynthesisParams;
      if (!baseParams || typeof baseParams !== 'object') {
        return next(new Error('Missing vtonSynthesisParams before QC middleware'));
      }

      let lastResult = null;
      let lastReport = null;
      let bestFrontCutoutUrl = null;
      let correctionHint = '';

      for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
        const result = await synthesizeLook({
          ...baseParams,
          forceRefresh: attempt > 1 ? true : Boolean(baseParams.forceRefresh),
          ...(correctionHint ? { qcCorrectionHint: correctionHint } : {}),
        });
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
        lastReport = report;
        if (report.frontValid && report.frontCutoutDataUrl) {
          bestFrontCutoutUrl = report.frontCutoutDataUrl;
        }

        if (report.ok) {
          res.locals.vtonResult = {
            ...result,
            qcStatus: 'passed',
            qcPassed: true,
            qcAttempts: attempt,
            qcReasons: [],
            failedAngles: [],
            frontOnlyDegraded: false,
          };
          return next();
        }

        // Invalidate broken sheet in server cache before retrying so defective images are never reused
        if (typeof invalidateCache === 'function' && result.cacheKey) {
          try {
            invalidateCache(result.cacheKey);
          } catch {
            // ignore cache invalidation error
          }
        }

        correctionHint = buildQcCorrectionHint(report.reasons);
      }

      // All 3 QC attempts failed -> log failure to file and prepare `'positive-only'` (0° front) rescue view
      appendVtonQcFailureLog(
        {
          comboHash: lastResult?.comboHash,
          avatarConfigHash: lastResult?.avatarConfigHash,
          attempts: attemptLimit,
          reasons: lastReport?.reasons || ['qc_validation_failed'],
          failedAngles: lastReport?.failedAngles || [0],
          equippedSlots: lastResult?.equippedSlots || [],
          handedness: lastResult?.handedness || 'right',
          provider: lastResult?.provider || 'gemini-vton',
          model: lastResult?.model || null,
        },
        logFilePath
      );

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
        positiveOnlyImageUrl = lastResult?.compositeImageUrl || null;
      }

      res.locals.vtonResult = {
        ...lastResult,
        ok: true,
        layout: 'single',
        viewAngleDeg: 0,
        compositeImageUrl: positiveOnlyImageUrl,
        baseModelImageUrl: null,
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
      return next(err);
    }
  };
}
