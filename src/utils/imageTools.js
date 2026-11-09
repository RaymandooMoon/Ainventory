import { COLOR_PALETTE } from './api.js';
import { DEFAULT_SKIN_PINS, detectFaceAndSkinPins } from './faceLandmarkEngine.js';

export function hexToRgb(hex) {
  const clean = String(hex || '#CCCCCC').replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return { r: 204, g: 185, b: 168 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

export function rgbToCieLab({ r, g, b }) {
  let rn = r / 255;
  let gn = g / 255;
  let bn = b / 255;

  rn = rn > 0.04045 ? ((rn + 0.055) / 1.055) ** 2.4 : rn / 12.92;
  gn = gn > 0.04045 ? ((gn + 0.055) / 1.055) ** 2.4 : gn / 12.92;
  bn = bn > 0.04045 ? ((bn + 0.055) / 1.055) ** 2.4 : bn / 12.92;

  const x = (rn * 0.4124 + gn * 0.3576 + bn * 0.1805) / 0.95047;
  const y = (rn * 0.2126 + gn * 0.7152 + bn * 0.0722) / 1.0;
  const z = (rn * 0.0193 + gn * 0.1192 + bn * 0.9505) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return {
    L: Number((116 * fy - 16).toFixed(2)),
    a: Number((500 * (fx - fy)).toFixed(2)),
    b: Number((200 * (fy - fz)).toFixed(2)),
  };
}

export function findClosestPaletteColor(hex) {
  const target = hexToRgb(hex);
  let best = COLOR_PALETTE[0];
  let bestDist = Infinity;

  for (const entry of COLOR_PALETTE) {
    const c = hexToRgb(entry.hex);
    const dr = target.r - c.r;
    const dg = target.g - c.g;
    const db = target.b - c.b;
    const dist = Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return best;
}

export function processUploadedImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지 디코딩에 실패했습니다.'));
      img.onload = () => {
        const maxEdge = 1000;
        let { width, height } = img;
        if (width > maxEdge || height > maxEdge) {
          if (width >= height) {
            height = Math.round((height * maxEdge) / width);
            width = maxEdge;
          } else {
            width = Math.round((width * maxEdge) / height);
            height = maxEdge;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const sx = Math.floor(width * 0.27);
        const sy = Math.floor(height * 0.24);
        const sw = Math.max(1, Math.floor(width * 0.46));
        const sh = Math.max(1, Math.floor(height * 0.52));
        const { data } = ctx.getImageData(sx, sy, sw, sh);

        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let count = 0;

        for (let i = 0; i < data.length; i += 16) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 180) continue;
          if (r > 238 && g > 235 && b > 228) continue;
          rSum += r;
          gSum += g;
          bSum += b;
          count += 1;
        }

        let detectedHex = '#F2F1EC';
        if (count > 20) {
          detectedHex = rgbToHex(rSum / count, gSum / count, bSum / count);
        }

        const matchedColor = findClosestPaletteColor(detectedHex);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.86);

        resolve({
          dataUrl,
          detectedHex,
          matchedColor,
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
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

export const PERSONAL_COLOR_DETAILS = {
  spring_warm: {
    key: 'spring_warm',
    labelKo: '봄 웜톤 (Spring Warm)',
    labelEn: 'Spring Warm',
    summaryKo: '밝은 명도(L*)와 따뜻한 황색 언더톤(b*)이 조화를 이루며 생기 넘치는 코랄·크림·카멜 계열이 가장 잘 어울립니다.',
    bestColors: ['크림', '베이지', '코랄 피치', '카멜', '올리브 그린'],
  },
  summer_cool: {
    key: 'summer_cool',
    labelKo: '여름 쿨톤 (Summer Cool)',
    labelEn: 'Summer Cool',
    summaryKo: '맑고 높은 명도(L*)와 은은한 핑크·블루 언더톤을 지녀 스카이블루·라벤더·더스티로즈·소프트화이트가 피부를 투명하게 살려줍니다.',
    bestColors: ['화이트', '스카이블루', '라벤더 그레이', '더스티 로즈', '네이비'],
  },
  autumn_warm: {
    key: 'autumn_warm',
    labelKo: '가을 웜톤 (Autumn Warm)',
    labelEn: 'Autumn Warm',
    summaryKo: '차분하고 깊이 있는 황색 언더톤(b*)이 돋보이며 베이지·테라코타·올리브·브라운 등 성숙한 얼씨 컬러가 고급스럽게 어우러집니다.',
    bestColors: ['베이지', '테라코타', '카키/올리브', '브라운', '크림'],
  },
  winter_cool: {
    key: 'winter_cool',
    labelKo: '겨울 쿨톤 (Winter Cool)',
    labelEn: 'Winter Cool',
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

  const landmarkRes = await detectFaceAndSkinPins(imageSource, { rotationDeg, cropRect });
  const activePins = customPins && customPins.length === 4 ? customPins : landmarkRes.pins || DEFAULT_SKIN_PINS;
  const modeInfo = LIGHTING_MODES.find((m) => m.key === lightingMode) || LIGHTING_MODES[0];

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const W = 360;
      const H = 360;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      const { data } = ctx.getImageData(0, 0, W, H);

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
        const lab = rgbToCieLab({ r: rAvg, g: gAvg, b: bAvg });

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
      const isWarm = warmthIndex >= 11.8;
      const isBright = L >= 65.5;

      let seasonKey = 'autumn_warm';
      if (isWarm && isBright) seasonKey = 'spring_warm';
      else if (!isWarm && isBright) seasonKey = 'summer_cool';
      else if (isWarm && !isBright) seasonKey = 'autumn_warm';
      else seasonKey = 'winter_cool';

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
      const chromaVal = Math.hypot(a, b);
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

      resolve({
        personalColor: seasonKey,
        labelKo: detail.labelKo,
        labelEn: detail.labelEn,
        summaryKo: detail.summaryKo,
        bestColors: detail.bestColors,
        skinToneHex,
        lightingMode,
        lightingLabelKo: modeInfo.labelKo,
        lab: { L, a, b, itaDeg, warmthIndex },
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
        processedDataUrl: canvas.toDataURL('image/jpeg', 0.9),
      });
    };
    img.src = landmarkRes.processedDataUrl || (typeof imageSource === 'string' ? imageSource : '');
  });
}
