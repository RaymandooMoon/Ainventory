import {
  hexToRgb,
  matchClosestPaletteColor,
  rgbToCieLab as computeCieLab,
  rgbToHex,
} from '../shared/colorMath.js';
import { removeBackgroundAndEncodeWebP } from './aiGarmentPipeline.js';
import { DEFAULT_SKIN_PINS, detectFaceAndSkinPins } from './faceLandmarkEngine.ts';

export { hexToRgb, rgbToHex };

export function rgbToCieLab(rOrObj, g = 0, b = 0) {
  const rVal = typeof rOrObj === 'object' && rOrObj !== null ? rOrObj.r : rOrObj;
  const gVal = typeof rOrObj === 'object' && rOrObj !== null ? rOrObj.g : g;
  const bVal = typeof rOrObj === 'object' && rOrObj !== null ? rOrObj.b : b;
  const raw = computeCieLab(rVal, gVal, bVal);
  return {
    L: Number(raw.L.toFixed(2)),
    a: Number(raw.a.toFixed(2)),
    b: Number(raw.b.toFixed(2)),
  };
}

export function findClosestPaletteColor(hex) {
  return matchClosestPaletteColor(hex);
}

function clampVal(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function loadDrawableSource(imageSource) {
  if (typeof HTMLCanvasElement !== 'undefined' && imageSource instanceof HTMLCanvasElement) {
    return Promise.resolve({
      drawable: imageSource,
      width: imageSource.width || 640,
      height: imageSource.height || 640,
    });
  }
  if (typeof HTMLImageElement !== 'undefined' && imageSource instanceof HTMLImageElement) {
    return Promise.resolve({
      drawable: imageSource,
      width: imageSource.naturalWidth || imageSource.width || 640,
      height: imageSource.naturalHeight || imageSource.height || 640,
    });
  }
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () =>
      resolve({
        drawable: el,
        width: el.naturalWidth || el.width || 640,
        height: el.naturalHeight || el.height || 640,
      });
    el.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
    el.src = imageSource;
  });
}

/**
 * Renders rotated/flipped/brightened source image, crops exact normalized `cropBox`,
 * optionally runs single-pass transparent alpha studio cutout + AI metadata extraction
 * directly on `outCanvas` (without painting opaque #F5F5F7 or re-decoding PNG/WebP),
 * and frees temporary canvas backing stores immediately.
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
  const { drawable, width: srcW, height: srcH } = await loadDrawableSource(imageSource);

  const rad90 = ((rotation90 % 360) * Math.PI) / 180;
  const swapWH = Math.abs(rotation90 % 180) === 90;
  const stageScale = Math.min(1, 1280 / Math.max(srcW, srcH));
  const baseW = Math.round((swapWH ? srcH : srcW) * stageScale);
  const baseH = Math.round((swapWH ? srcW : srcH) * stageScale);

  const stageCanvas = document.createElement('canvas');
  stageCanvas.width = Math.max(64, baseW);
  stageCanvas.height = Math.max(64, baseH);

  const outCanvas = document.createElement('canvas');

  try {
    const sCtx = stageCanvas.getContext('2d');
    if (!studioCutout) {
      sCtx.fillStyle = '#F5F5F7';
      sCtx.fillRect(0, 0, stageCanvas.width, stageCanvas.height);
    }

    sCtx.save();
    if (brightness !== 100) {
      sCtx.filter = `brightness(${brightness}%)`;
    }
    sCtx.translate(stageCanvas.width / 2, stageCanvas.height / 2);
    if (flipH) sCtx.scale(-1, 1);
    sCtx.rotate(rad90 + (straightenDeg * Math.PI) / 180);
    const drawW = Math.round(srcW * stageScale);
    const drawH = Math.round(srcH * stageScale);
    sCtx.drawImage(drawable, -drawW / 2, -drawH / 2, drawW, drawH);
    sCtx.restore();

    const sx = Math.round(clampVal(cropBox.x, 0, 0.95) * stageCanvas.width);
    const sy = Math.round(clampVal(cropBox.y, 0, 0.95) * stageCanvas.height);
    const sw = Math.max(32, Math.round(clampVal(cropBox.w, 0.05, 1 - cropBox.x) * stageCanvas.width));
    const sh = Math.max(32, Math.round(clampVal(cropBox.h, 0.05, 1 - cropBox.y) * stageCanvas.height));

    const outScale = Math.min(1, maxOutputSide / Math.max(sw, sh));
    const outW = Math.max(64, Math.round(sw * outScale));
    const outH = Math.max(64, Math.round(sh * outScale));

    outCanvas.width = outW;
    outCanvas.height = outH;
    const oCtx = outCanvas.getContext('2d', { willReadFrequently: true });
    oCtx.drawImage(stageCanvas, sx, sy, sw, sh, 0, 0, outW, outH);

    // Free stageCanvas backing store immediately after cropping
    stageCanvas.width = 0;
    stageCanvas.height = 0;

    if (studioCutout) {
      const cutoutRes = await removeBackgroundAndEncodeWebP(outCanvas, {
        maxDim: maxOutputSide,
        quality: 0.86,
        withMetadata: true,
      });
      const aiMeta = cutoutRes.aiMetadata;
      return {
        dataUrl: cutoutRes.webpDataUrl,
        format: cutoutRes.format,
        cutoutApplied: cutoutRes.cutoutApplied,
        detectedHex: aiMeta?.sampled_hex || '#1D1D1F',
        matchedColor: {
          name: aiMeta?.color_name || '블랙',
          hex: aiMeta?.color_hex || '#1D1D1F',
        },
        aiMetadata: aiMeta,
        width: cutoutRes.width,
        height: cutoutRes.height,
      };
    }

    const imgData = oCtx.getImageData(0, 0, outW, outH);
    const d = imgData.data;

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
      const bi = (clampVal(by, 0, outH - 1) * outW + clampVal(bx, 0, outW - 1)) * 4;
      bgR += d[bi];
      bgG += d[bi + 1];
      bgB += d[bi + 2];
    }
    bgR /= borderSamples.length;
    bgG /= borderSamples.length;
    bgB /= borderSamples.length;

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
    const detectedHex = rgbToHex(avgR, avgG, avgB);
    const matchedColor = matchClosestPaletteColor({ r: avgR, g: avgG, b: avgB });
    const dataUrl = outCanvas.toDataURL('image/webp', 0.88);

    return {
      dataUrl,
      format: dataUrl.startsWith('data:image/webp') ? 'webp' : 'png',
      cutoutApplied: false,
      detectedHex,
      matchedColor,
      aiMetadata: null,
      width: outW,
      height: outH,
    };
  } finally {
    stageCanvas.width = 0;
    stageCanvas.height = 0;
    outCanvas.width = 0;
    outCanvas.height = 0;
  }
}

// ============================================================================
// PERSONAL COLOR EVIDENCE ANALYSIS (D65 Illumination + 4 Skin Pins + 20 Swatches + 40/25/20/15 Confidence)
// ============================================================================

export const LIGHTING_MODES = [
  {
    key: 'auto_d65',
    labelKo: 'D65 자연광 표준 보정 (권장)',
    labelEn: 'Auto D65 Daylight Calibration',
    descKo: 'CIE 표준 주광(D65, 6500K) 화이트밸런스로 이미지 색온도를 자동 정규화합니다.',
    gains: { r: 1.0, g: 1.0, b: 1.0, autoGreyWorld: true },
  },
  {
    key: 'studio_cool_fix',
    labelKo: '창백한 형광등 · 스튜디오 쿨조명 보정',
    labelEn: 'Cool Fluorescent / Studio LED Fix',
    descKo: '푸른빛/창백한 실내 LED 조명으로 인해 손실된 웜 언더톤(b*)을 보정합니다.',
    gains: { r: 1.06, g: 1.01, b: 0.91, autoGreyWorld: false },
  },
  {
    key: 'indoor_warm_fix',
    labelKo: '실내 노란 조명 · 카페 백열등 보정',
    labelEn: 'Indoor Warm / Tungsten Fix',
    descKo: '노란 실내 조명으로 과도하게 높게 측정된 황색도(b*)와 붉은기(a*)를 중화합니다.',
    gains: { r: 0.93, g: 0.99, b: 1.09, autoGreyWorld: false },
  },
  {
    key: 'raw_original',
    labelKo: '무보정 원본 픽셀 분석',
    labelEn: 'Raw Uncalibrated Original',
    descKo: '전처리 보정 없이 원본 이미지 픽셀의 RGB → CIE L*a*b* 값을 그대로 추출합니다.',
    gains: { r: 1.0, g: 1.0, b: 1.0, autoGreyWorld: false },
  },
];

export const DIRECTIONAL_20_DRAPE_COLORS = {
  top: {
    direction: '상 (Top 5)',
    seasonKey: 'spring_warm',
    seasonLabel: '봄 웜톤 (Spring Warm)',
    swatches: [
      { name: '피치 코랄', hex: '#F39A82', targetLab: { L: 72, a: 14, b: 22 } },
      { name: '버터 크림', hex: '#F5E8C7', targetLab: { L: 76, a: 11, b: 20 } },
      { name: '웜 아이보리', hex: '#F7EFE1', targetLab: { L: 78, a: 10, b: 18 } },
      { name: '애프리콧 베이지', hex: '#E6BC98', targetLab: { L: 71, a: 13, b: 23 } },
      { name: '라이트 애플그린', hex: '#A8C686', targetLab: { L: 73, a: 11, b: 21 } },
    ],
  },
  bottom: {
    direction: '하 (Bottom 5)',
    seasonKey: 'autumn_warm',
    seasonLabel: '가을 웜톤 (Autumn Warm)',
    swatches: [
      { name: '테라코타 브릭', hex: '#B45334', targetLab: { L: 62, a: 15, b: 24 } },
      { name: '올리브 카키', hex: '#79825E', targetLab: { L: 61, a: 12, b: 22 } },
      { name: '카멜 브라운', hex: '#C08B57', targetLab: { L: 64, a: 14, b: 25 } },
      { name: '오트밀 샌드', hex: '#D6C4AA', targetLab: { L: 66, a: 12, b: 20 } },
      { name: '머스타드 골드', hex: '#C99E42', targetLab: { L: 63, a: 13, b: 26 } },
    ],
  },
  left: {
    direction: '좌 (Left 5)',
    seasonKey: 'summer_cool',
    seasonLabel: '여름 쿨톤 (Summer Cool)',
    swatches: [
      { name: '파우더 블루', hex: '#9ABBD9', targetLab: { L: 73, a: 9, b: 13 } },
      { name: '라벤더 미스트', hex: '#B8B2CC', targetLab: { L: 72, a: 10, b: 12 } },
      { name: '더스티 로즈', hex: '#CE9AA6', targetLab: { L: 70, a: 12, b: 14 } },
      { name: '소프트 화이트', hex: '#F1F3F6', targetLab: { L: 76, a: 9, b: 13 } },
      { name: '모브 그레이', hex: '#9D97A5', targetLab: { L: 69, a: 10, b: 12 } },
    ],
  },
  right: {
    direction: '우 (Right 5)',
    seasonKey: 'winter_cool',
    seasonLabel: '겨울 쿨톤 (Winter Cool)',
    swatches: [
      { name: '퓨어 블랙', hex: '#1B1C20', targetLab: { L: 59, a: 9, b: 12 } },
      { name: '아이시 화이트', hex: '#F6F8FB', targetLab: { L: 64, a: 8, b: 11 } },
      { name: '로열 네이비', hex: '#1C2C54', targetLab: { L: 60, a: 10, b: 13 } },
      { name: '딥 버건디', hex: '#6E1D2F', targetLab: { L: 58, a: 12, b: 13 } },
      { name: '차콜 슬레이트', hex: '#373B44', targetLab: { L: 61, a: 9, b: 12 } },
    ],
  },
};

export const PCCS_GRAYSCALE_BAR = [
  { label: 'White', hex: '#FFFFFF', textDark: true },
  { label: 'N8.5', hex: '#DCDCDC', textDark: true },
  { label: 'N7.5', hex: '#C0C0C0', textDark: true },
  { label: 'N6.5', hex: '#A4A4A4', textDark: true },
  { label: 'N5.5', hex: '#888888', textDark: false },
  { label: 'N4.5', hex: '#6C6C6C', textDark: false },
  { label: 'N3.5', hex: '#505050', textDark: false },
  { label: 'N2.5', hex: '#363636', textDark: false },
  { label: 'Black', hex: '#141414', textDark: false },
];

// Helper to build a 12-dot PCCS hue ring at a given HSL lightness & saturation
function buildPccsRingDots(lightnessPct, saturationPct, warmShift = 0) {
  const baseHues = [0, 28, 52, 85, 135, 175, 205, 235, 268, 298, 325, 345];
  return baseHues.map((h) => {
    const hue = (h + warmShift + 360) % 360;
    const s = saturationPct / 100;
    const l = lightnessPct / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (hue < 60) [r, g, b] = [c, x, 0];
    else if (hue < 120) [r, g, b] = [x, c, 0];
    else if (hue < 180) [r, g, b] = [0, c, x];
    else if (hue < 240) [r, g, b] = [0, x, c];
    else if (hue < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
  });
}

// 12 PCCS Tones positioned on Brightness (yPct: 0=top..100=bottom) × Saturation (xPct: 0=left..100=right)
export const PCCS_12_TONES = [
  {
    key: 'pale',
    label: 'pale',
    labelKo: '페일 (Pale · 고명도 저채도)',
    xPct: 15,
    yPct: 14,
    lightness: 88,
    saturation: 48,
    warmHex: '#F9D5CB',
    coolHex: '#D8E6F6',
    dots: buildPccsRingDots(86, 55, 6),
  },
  {
    key: 'light',
    label: 'light',
    labelKo: '라이트 (Light · 고명도 중채도)',
    xPct: 40,
    yPct: 17,
    lightness: 80,
    saturation: 72,
    warmHex: '#FF9E91',
    coolHex: '#A7C7E7',
    dots: buildPccsRingDots(78, 76, 6),
  },
  {
    key: 'bright',
    label: 'bright',
    labelKo: '브라이트 (Bright · 중고명도 고채도)',
    xPct: 65,
    yPct: 28,
    lightness: 66,
    saturation: 86,
    warmHex: '#FF7F6B',
    coolHex: '#7BA7F7',
    dots: buildPccsRingDots(65, 88, 4),
  },
  {
    key: 'light_grayish',
    label: 'light\ngrayish',
    labelKo: '라이트 그레이시 (Light Grayish)',
    xPct: 15,
    yPct: 38,
    lightness: 74,
    saturation: 24,
    warmHex: '#DECBC0',
    coolHex: '#C7C9D6',
    dots: buildPccsRingDots(72, 26, 0),
  },
  {
    key: 'soft',
    label: 'soft',
    labelKo: '소프트 (Soft · 중명도 중저채도)',
    xPct: 40,
    yPct: 40,
    lightness: 66,
    saturation: 44,
    warmHex: '#DFA88F',
    coolHex: '#B8A9C9',
    dots: buildPccsRingDots(64, 46, 2),
  },
  {
    key: 'strong',
    label: 'strong',
    labelKo: '스트롱 (Strong · 중명도 고채도)',
    xPct: 65,
    yPct: 52,
    lightness: 50,
    saturation: 82,
    warmHex: '#D95B38',
    coolHex: '#3B6FD9',
    dots: buildPccsRingDots(49, 82, 0),
  },
  {
    key: 'vivid',
    label: 'vivid',
    labelKo: '비비드 (Vivid · 순색 최고채도)',
    xPct: 88,
    yPct: 52,
    lightness: 50,
    saturation: 96,
    warmHex: '#F24423',
    coolHex: '#E03177',
    dots: buildPccsRingDots(50, 96, 0),
  },
  {
    key: 'grayish',
    label: 'grayish',
    labelKo: '그레이시 (Grayish · 중저명도 저채도)',
    xPct: 15,
    yPct: 62,
    lightness: 52,
    saturation: 20,
    warmHex: '#9E8E82',
    coolHex: '#878B96',
    dots: buildPccsRingDots(52, 22, 0),
  },
  {
    key: 'dull',
    label: 'dull',
    labelKo: '덜 (Dull · 중저명도 중채도)',
    xPct: 40,
    yPct: 60,
    lightness: 48,
    saturation: 42,
    warmHex: '#B57B5E',
    coolHex: '#7A7496',
    dots: buildPccsRingDots(48, 44, 0),
  },
  {
    key: 'deep',
    label: 'deep',
    labelKo: '딥 (Deep · 저명도 중고채도)',
    xPct: 65,
    yPct: 75,
    lightness: 34,
    saturation: 74,
    warmHex: '#9E3D22',
    coolHex: '#5E2346',
    dots: buildPccsRingDots(34, 76, 0),
  },
  {
    key: 'dark_grayish',
    label: 'dark\ngrayish',
    labelKo: '다크 그레이시 (Dark Grayish)',
    xPct: 15,
    yPct: 86,
    lightness: 26,
    saturation: 18,
    warmHex: '#4A403B',
    coolHex: '#383B44',
    dots: buildPccsRingDots(26, 20, 0),
  },
  {
    key: 'dark',
    label: 'dark',
    labelKo: '다크 (Dark · 저명도 중저채도)',
    xPct: 40,
    yPct: 84,
    lightness: 26,
    saturation: 44,
    warmHex: '#633727',
    coolHex: '#332947',
    dots: buildPccsRingDots(26, 46, 0),
  },
];

export const PERSONAL_COLOR_SUBTYPES = {
  spring_light: {
    key: 'spring_light',
    seasonKey: 'spring_warm',
    toneFamily: 'WARM TONE',
    labelKo: '봄 라이트 (Spring Light)',
    shortKo: '봄\n라이트',
    bubbleHex: '#FF9E91',
    mannequinModelColorHex: '#F6B09E',
    mannequinBriefsColorHex: '#D9725B',
    pccsTones: ['pale', 'light'],
    secondarySubtypes: [
      { key: 'spring_bright', labelKo: '봄 브라이트', shortKo: '봄\n브라이트' },
      { key: 'summer_light', labelKo: '여름 라이트', shortKo: '여름\n라이트' },
    ],
    tipTitleKo: '채도에 영향을 덜 받는다면?',
    tipBodyKo:
      '채도가 좀 낮아져도 괜찮은 사람으로, 파스텔컬러 위주로 스타일링하면 피부가 한층 맑고 화사해 보입니다.',
  },
  spring_bright: {
    key: 'spring_bright',
    seasonKey: 'spring_warm',
    toneFamily: 'WARM TONE',
    labelKo: '봄 브라이트 (Spring Bright)',
    shortKo: '봄\n브라이트',
    bubbleHex: '#FF7A63',
    mannequinModelColorHex: '#F39379',
    mannequinBriefsColorHex: '#C84B31',
    pccsTones: ['bright', 'vivid'],
    secondarySubtypes: [
      { key: 'spring_light', labelKo: '봄 라이트', shortKo: '봄\n라이트' },
      { key: 'winter_bright', labelKo: '겨울 브라이트', shortKo: '겨울\n브라이트' },
    ],
    tipTitleKo: '선명한 고채도가 잘 어울린다면?',
    tipBodyKo:
      '맑고 비비드한 코랄 피치·버터 옐로우·애플그린 포인트 아이템이 얼굴의 입체감과 생기를 즉시 살려줍니다.',
  },
  summer_light: {
    key: 'summer_light',
    seasonKey: 'summer_cool',
    toneFamily: 'COOL TONE',
    labelKo: '여름 라이트 (Summer Light)',
    shortKo: '여름\n라이트',
    bubbleHex: '#9AC0E6',
    mannequinModelColorHex: '#B6D0EB',
    mannequinBriefsColorHex: '#4E7399',
    pccsTones: ['pale', 'light'],
    secondarySubtypes: [
      { key: 'spring_light', labelKo: '봄 라이트', shortKo: '봄\n라이트' },
      { key: 'summer_mute', labelKo: '여름 뮤트', shortKo: '여름\n뮤트' },
    ],
    tipTitleKo: '명도가 높고 맑은 쿨 파스텔이 어울린다면?',
    tipBodyKo:
      '화이트가 섞인 파우더 블루·라벤더 미스트·베이비 핑크 톤이 피부의 붉은기를 잡아주고 투명하게 연출합니다.',
  },
  summer_mute: {
    key: 'summer_mute',
    seasonKey: 'summer_cool',
    toneFamily: 'COOL TONE',
    labelKo: '여름 뮤트 (Summer Mute · Soft)',
    shortKo: '여름\n뮤트',
    bubbleHex: '#B5A4C7',
    mannequinModelColorHex: '#C5B8D4',
    mannequinBriefsColorHex: '#5D516E',
    pccsTones: ['light_grayish', 'soft', 'grayish'],
    secondarySubtypes: [
      { key: 'summer_light', labelKo: '여름 라이트', shortKo: '여름\n라이트' },
      { key: 'autumn_mute', labelKo: '가을 뮤트', shortKo: '가을\n뮤트' },
    ],
    tipTitleKo: '차분한 저채도 세련미가 돋보인다면?',
    tipBodyKo:
      '회색빛이 은은하게 감도는 더스티 로즈·모브 그레이·세이지 블루 톤온톤 코디가 우아한 분위기를 완성합니다.',
  },
  autumn_mute: {
    key: 'autumn_mute',
    seasonKey: 'autumn_warm',
    toneFamily: 'WARM TONE',
    labelKo: '가을 뮤트 (Autumn Mute · Soft)',
    shortKo: '가을\n뮤트',
    bubbleHex: '#D8A483',
    mannequinModelColorHex: '#DDB496',
    mannequinBriefsColorHex: '#7D563C',
    pccsTones: ['soft', 'dull', 'light_grayish'],
    secondarySubtypes: [
      { key: 'summer_mute', labelKo: '여름 뮤트', shortKo: '여름\n뮤트' },
      { key: 'autumn_deep', labelKo: '가을 딥', shortKo: '가을\n딥' },
    ],
    tipTitleKo: '부드러운 내추럴 얼씨 톤이 어울린다면?',
    tipBodyKo:
      '오트밀·샌드 베이지·소프트 카멜·뮤트 올리브처럼 자연을 닮은 중명도·중저채도 컬러가 가장 고급스럽습니다.',
  },
  autumn_deep: {
    key: 'autumn_deep',
    seasonKey: 'autumn_warm',
    toneFamily: 'WARM TONE',
    labelKo: '가을 딥 (Autumn Deep · Rich)',
    shortKo: '가을\n딥',
    bubbleHex: '#B85D3B',
    mannequinModelColorHex: '#C67B5C',
    mannequinBriefsColorHex: '#592816',
    pccsTones: ['deep', 'dark', 'strong'],
    secondarySubtypes: [
      { key: 'autumn_mute', labelKo: '가을 뮤트', shortKo: '가을\n뮤트' },
      { key: 'winter_deep', labelKo: '겨울 딥', shortKo: '겨울\n딥' },
    ],
    tipTitleKo: '깊이감 있는 저명도가 잘 받는다면?',
    tipBodyKo:
      '테라코타 브릭·초콜릿 브라운·딥 카키·머스타드 골드 등 무게감 있는 컬러가 이목구비를 또렷하게 살려줍니다.',
  },
  winter_bright: {
    key: 'winter_bright',
    seasonKey: 'winter_cool',
    toneFamily: 'COOL TONE',
    labelKo: '겨울 브라이트 (Winter Bright)',
    shortKo: '겨울\n브라이트',
    bubbleHex: '#D94B78',
    mannequinModelColorHex: '#B89AD9',
    mannequinBriefsColorHex: '#251D3A',
    pccsTones: ['vivid', 'bright', 'strong'],
    secondarySubtypes: [
      { key: 'spring_bright', labelKo: '봄 브라이트', shortKo: '봄\n브라이트' },
      { key: 'winter_deep', labelKo: '겨울 딥', shortKo: '겨울\n딥' },
    ],
    tipTitleKo: '대비감과 선명한 컬러가 어울린다면?',
    tipBodyKo:
      '아이시 화이트·퓨어 블랙의 강한 대비나 로열 블루·마젠타 포인트가 도시적인 세련미를 극대화합니다.',
  },
  winter_deep: {
    key: 'winter_deep',
    seasonKey: 'winter_cool',
    toneFamily: 'COOL TONE',
    labelKo: '겨울 딥 (Winter Deep · Dark)',
    shortKo: '겨울\n딥',
    bubbleHex: '#523A68',
    mannequinModelColorHex: '#9E90B5',
    mannequinBriefsColorHex: '#1C1626',
    pccsTones: ['deep', 'dark', 'dark_grayish'],
    secondarySubtypes: [
      { key: 'autumn_deep', labelKo: '가을 딥', shortKo: '가을\n딥' },
      { key: 'winter_bright', labelKo: '겨울 브라이트', shortKo: '겨울\n브라이트' },
    ],
    tipTitleKo: '다크하고 시크한 무드가 어울린다면?',
    tipBodyKo:
      '차콜·미드나잇 네이비·딥 버건디·퓨어 블랙 등 깊고 차가운 다크 톤이 카리스마 있는 실루엣을 만들어 줍니다.',
  },
};

export const PERSONAL_COLOR_DETAILS = {
  spring_warm: {
    key: 'spring_warm',
    labelKo: '봄 웜톤 (Spring Warm)',
    labelEn: 'Spring Warm',
    defaultSubTypeKey: 'spring_light',
    mannequinModelColorHex: '#F6B09E',
    summaryKo: '밝은 명도(L*)와 따뜻한 황색 언더톤(b*)이 조화를 이루며 생기 넘치는 코랄·크림·카멜 계열이 가장 잘 어울립니다.',
    bestColors: ['크림', '베이지', '코랄 피치', '카멜', '올리브 그린'],
  },
  summer_cool: {
    key: 'summer_cool',
    labelKo: '여름 쿨톤 (Summer Cool)',
    labelEn: 'Summer Cool',
    defaultSubTypeKey: 'summer_light',
    mannequinModelColorHex: '#B6D0EB',
    summaryKo: '맑고 높은 명도(L*)와 은은한 핑크·블루 언더톤을 지녀 스카이블루·라벤더·더스티로즈·소프트화이트가 피부를 투명하게 살려줍니다.',
    bestColors: ['화이트', '스카이블루', '라벤더 그레이', '더스티 로즈', '네이비'],
  },
  autumn_warm: {
    key: 'autumn_warm',
    labelKo: '가을 웜톤 (Autumn Warm)',
    labelEn: 'Autumn Warm',
    defaultSubTypeKey: 'autumn_mute',
    mannequinModelColorHex: '#DDB496',
    summaryKo: '차분하고 깊이 있는 황색 언더톤(b*)이 돋보이며 베이지·테라코타·올리브·브라운 등 성숙한 얼씨 컬러가 고급스럽게 어우러집니다.',
    bestColors: ['베이지', '테라코타', '카키/올리브', '브라운', '크림'],
  },
  winter_cool: {
    key: 'winter_cool',
    labelKo: '겨울 쿨톤 (Winter Cool)',
    labelEn: 'Winter Cool',
    defaultSubTypeKey: 'winter_bright',
    mannequinModelColorHex: '#B89AD9',
    summaryKo: '시원한 언더톤과 또렷한 대비감을 지녀 블랙·퓨어화이트·차콜·다크네이비·버건디 등 선명하고 모던한 컬러가 가장 빛납니다.',
    bestColors: ['블랙', '화이트', '차콜', '네이비', '버건디 와인'],
  },
};

export async function analyzePersonalColorFromImage(imageSource, options = {}) {
  const {
    lightingMode = 'auto_d65',
    customPins = null,
    rotationDeg = 0,
    cropRect = null,
  } = options;

  const hasCustomPins = Array.isArray(customPins) && customPins.length > 0;
  const landmarkRes = hasCustomPins
    ? {
        detected: true,
        isLowConfidence: false,
        confidence: 96,
        engine: 'custom_pins',
        detectionStage: 'custom_pins',
        landmarkCount: 478,
        orientationDeg: rotationDeg || 0,
        faceBox: { x: 0.25, y: 0.15, w: 0.5, h: 0.65 },
        pins: customPins,
        meshPoints: [],
      }
    : await detectFaceAndSkinPins(imageSource, { rotationDeg, cropRect });

  const activePins =
    hasCustomPins
      ? customPins
      : landmarkRes.pins && landmarkRes.pins.length > 0
        ? landmarkRes.pins
        : DEFAULT_SKIN_PINS;
  const modeInfo = LIGHTING_MODES.find((m) => m.key === lightingMode) || LIGHTING_MODES[0];

  const sourceForSampling = landmarkRes.processedDataUrl || imageSource;
  const { drawable, width: srcW, height: srcH } = await loadDrawableSource(sourceForSampling);

  const W = 360;
  const H = 360;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;

  let data;
  let processedDataUrl;
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!landmarkRes.processedDataUrl && (rotationDeg || cropRect)) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(((rotationDeg || 0) * Math.PI) / 180);
      if (cropRect) {
        ctx.drawImage(
          drawable,
          cropRect.x * srcW,
          cropRect.y * srcH,
          cropRect.w * srcW,
          cropRect.h * srcH,
          -W / 2,
          -H / 2,
          W,
          H
        );
      } else {
        ctx.drawImage(drawable, -W / 2, -H / 2, W, H);
      }
      ctx.restore();
    } else {
      ctx.drawImage(drawable, 0, 0, W, H);
    }
    data = ctx.getImageData(0, 0, W, H).data;
    processedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }

  // Compute scene white balance gains if auto_d65 is active
  let gainR = modeInfo.gains.r;
  let gainG = modeInfo.gains.g;
  let gainB = modeInfo.gains.b;

  if (modeInfo.gains.autoGreyWorld) {
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let cnt = 0;
    for (let i = 0; i < data.length; i += 32) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 25 && r < 245 && g > 25 && g < 245 && b > 25 && b < 245) {
        sr += r;
        sg += g;
        sb += b;
        cnt += 1;
      }
    }
    if (cnt > 20) {
      const avgR = sr / cnt;
      const avgG = sg / cnt;
      const avgB = sb / cnt;
      const lum = (avgR + avgG + avgB) / 3;
      // Gentle D65 daylight normalization (clamped to preserve natural skin chrominance)
      gainR = Math.max(0.88, Math.min(1.12, 0.65 + 0.35 * (lum / Math.max(1, avgR))));
      gainG = Math.max(0.92, Math.min(1.08, 0.70 + 0.30 * (lum / Math.max(1, avgG))));
      gainB = Math.max(0.88, Math.min(1.12, 0.65 + 0.35 * (lum / Math.max(1, avgB))));
    }
  }

  // Sample 4 anatomical skin pins
  const pinSamples = activePins.map((pin) => {
    const px = Math.max(8, Math.min(W - 9, Math.round(pin.x * W)));
    const py = Math.max(8, Math.min(H - 9, Math.round(pin.y * H)));
    const radius = 11;

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let c = 0;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const idx = ((py + dy) * W + (px + dx)) * 4;
        const r = Math.min(255, Math.max(0, data[idx] * gainR));
        const g = Math.min(255, Math.max(0, data[idx + 1] * gainG));
        const b = Math.min(255, Math.max(0, data[idx + 2] * gainB));
        rSum += r;
        gSum += g;
        bSum += b;
        c += 1;
      }
    }

    const rAvg = Math.round(rSum / Math.max(1, c));
    const gAvg = Math.round(gSum / Math.max(1, c));
    const bAvg = Math.round(bSum / Math.max(1, c));
    const hex = rgbToHex(rAvg, gAvg, bAvg);
    const lab = rgbToCieLab(rAvg, gAvg, bAvg);

    return {
      ...pin,
      rgb: { r: rAvg, g: gAvg, b: bAvg },
      hex,
      lab,
    };
  });

  // Weighted average across the 4 skin regions (forehead 25%, leftCheek 30%, rightCheek 30%, noseChin 15%)
  const weights = [0.25, 0.30, 0.30, 0.15];
  let L = 0;
  let a = 0;
  let b = 0;
  let rMean = 0;
  let gMean = 0;
  let bMean = 0;

  pinSamples.forEach((s, idx) => {
    const w = weights[idx] ?? 0.25;
    L += s.lab.L * w;
    a += s.lab.a * w;
    b += s.lab.b * w;
    rMean += s.rgb.r * w;
    gMean += s.rgb.g * w;
    bMean += s.rgb.b * w;
  });

  L = Number(L.toFixed(2));
  a = Number(a.toFixed(2));
  b = Number(b.toFixed(2));
  const skinToneHex = rgbToHex(rMean, gMean, bMean);

  // ITA° (Individual Typology Angle) & Warm/Cool Undertone Index
  const itaDeg = Number(((Math.atan2(L - 50, Math.max(0.5, b)) * 180) / Math.PI).toFixed(1));
  const warmthIndex = Number((b - a * 0.42).toFixed(2));
  const chromaVal = Number(Math.hypot(a, b).toFixed(2));
  const isWarm = warmthIndex >= 8.5;
  const isBright = L >= 65.5;

  let seasonKey = 'autumn_warm';
  if (isWarm && isBright) seasonKey = 'spring_warm';
  else if (!isWarm && isBright) seasonKey = 'summer_cool';
  else if (isWarm && !isBright) seasonKey = 'autumn_warm';
  else seasonKey = 'winter_cool';

  // Determine 8-Season Subtype & PCCS Tone Position
  let subTypeKey = 'spring_light';
  if (seasonKey === 'spring_warm') {
    subTypeKey = chromaVal >= 21.5 && L < 74.5 ? 'spring_bright' : 'spring_light';
  } else if (seasonKey === 'summer_cool') {
    subTypeKey = L >= 70.5 && chromaVal < 19.5 ? 'summer_light' : 'summer_mute';
  } else if (seasonKey === 'autumn_warm') {
    subTypeKey = L >= 62.0 ? 'autumn_mute' : 'autumn_deep';
  } else {
    subTypeKey = chromaVal >= 17.5 || L >= 61.5 ? 'winter_bright' : 'winter_deep';
  }
  const subType = PERSONAL_COLOR_SUBTYPES[subTypeKey] || PERSONAL_COLOR_SUBTYPES.spring_light;
  const pccsToneKey = subType.pccsTones[0];

  // Compute 20-color directional undertone similarity (상/하/좌/우 각 5색)
  const computeSwatchSimilarity = (targetLab) => {
    const dL = (L - targetLab.L) * 0.55;
    const da = (a - targetLab.a) * 1.15;
    const db = (b - targetLab.b) * 1.35;
    const dist = Math.sqrt(dL * dL + da * da + db * db);
    return Math.max(48, Math.min(99, Math.round(99 - dist * 1.65)));
  };

  const directional20 = {};
  for (const [dirKey, group] of Object.entries(DIRECTIONAL_20_DRAPE_COLORS)) {
    const scoredSwatches = group.swatches.map((sw) => ({
      ...sw,
      similarity: computeSwatchSimilarity(sw.targetLab),
    }));
    const avgSim = Math.round(
      scoredSwatches.reduce((acc, s) => acc + s.similarity, 0) / scoredSwatches.length
    );
    directional20[dirKey] = {
      ...group,
      avgSimilarity: avgSim,
      swatches: scoredSwatches,
    };
  }

  // Confidence (%) Formula Disclosure: 40% Region Uniformity + 25% Undertone Separation + 20% Chroma Clarity + 15% D65 Lighting Fit
  const bValues = pinSamples.map((p) => p.lab.b);
  const bSpread = Math.max(...bValues) - Math.min(...bValues);
  const uniformityScore = Math.max(55, Math.min(99, Math.round(98 - bSpread * 2.2)));
  const separationScore = Math.max(
    58,
    Math.min(99, Math.round(68 + Math.min(12, Math.abs(warmthIndex - 11.8)) * 2.6))
  );
  const chromaScore = Math.max(60, Math.min(98, Math.round(64 + Math.min(28, chromaVal) * 1.2)));
  const lightingFitScore =
    lightingMode === 'auto_d65' ? 95 : lightingMode === 'raw_original' ? 78 : 90;

  const totalConfidence = Math.round(
    uniformityScore * 0.4 +
      separationScore * 0.25 +
      chromaScore * 0.2 +
      lightingFitScore * 0.15
  );

  const detail = PERSONAL_COLOR_DETAILS[seasonKey];

  return {
    personalColor: seasonKey,
    subTypeKey,
    subType,
    pccsToneKey,
    matchedPccsTones: subType.pccsTones,
    toneFamily: subType.toneFamily,
    mannequinModelColorHex: subType.mannequinModelColorHex,
    mannequinBriefsColorHex: subType.mannequinBriefsColorHex,
    labelKo: detail.labelKo,
    labelEn: detail.labelEn,
    summaryKo: detail.summaryKo,
    bestColors: detail.bestColors,
    skinToneHex,
    lightingMode,
    lightingLabelKo: modeInfo.labelKo,
    lab: { L, a, b, itaDeg, warmthIndex, chroma: chromaVal },
    pins: pinSamples,
    directional20,
    confidence: totalConfidence,
    confidenceBreakdown: {
      formulaText: '신뢰도(%) = 부위간 균일도(40%) + 언더톤 분리도(25%) + 채도 명확도(20%) + D65 광원 적합도(15%)',
      uniformity40: uniformityScore,
      separation25: separationScore,
      chroma20: chromaScore,
      lighting15: lightingFitScore,
      total: totalConfidence,
    },
    landmarkDetection: landmarkRes,
    processedDataUrl,
  };
}
