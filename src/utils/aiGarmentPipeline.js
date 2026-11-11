import { COLOR_PALETTE } from './api.js';
import { GARMENT_3D_PHYSICS_PRESETS } from './garment3DPhysicsSpecs.js';

/**
 * AI Garment Registration Pipeline (Requirement 6.a & 6.b)
 * 1. `removeBackgroundAndEncodeWebP`: Automatic edge-flood alpha matting (Studio Cutout)
 *    + mobile storage/GPU optimized `image/webp` compression & normalization.
 * 2. `extractGarmentAIMetadata`: Automatic category, subcategory, dominant color,
 *    seasonality, fabric (cotton/denim/knit/leather/wool/silk/padding), and 3D manifest slot/GLB/SpringBone mapping.
 */

export const FABRIC_OPTIONS = [
  { value: 'cotton', labelKo: '면 · 코튼 포플린', roughness: 0.68, metalness: 0.01, normalType: 'cotton' },
  { value: 'denim', labelKo: '셀비지 데님 트윌', roughness: 0.76, metalness: 0.02, normalType: 'denim' },
  { value: 'knit', labelKo: '메리노 니트 · 골지', roughness: 0.78, metalness: 0.01, normalType: 'knit' },
  { value: 'wool', labelKo: '버진 울 · 캐시미어', roughness: 0.66, metalness: 0.02, normalType: 'wool' },
  { value: 'leather', labelKo: '풀그레인 레더 · 가죽', roughness: 0.30, metalness: 0.08, normalType: 'leather' },
  { value: 'silk', labelKo: '실크 · 새틴 드레이프', roughness: 0.28, metalness: 0.05, normalType: 'silk' },
  { value: 'padding', labelKo: '퀼팅 나일론 · 패딩', roughness: 0.38, metalness: 0.06, normalType: 'padding' },
];

export const MANIFEST_SLOT_MAP = {
  beanie: { slotKey: 'headwear', baseGlb: 'headwear_beanie', physicsPreset: 'rigid_fitted' },
  cap: { slotKey: 'headwear', baseGlb: 'headwear_cap', physicsPreset: 'rigid_fitted' },
  beret: { slotKey: 'headwear', baseGlb: 'headwear_beret', physicsPreset: 'rigid_fitted' },
  bucket_hat: { slotKey: 'headwear', baseGlb: 'headwear_fedora', physicsPreset: 'rigid_fitted' },
  scarf: { slotKey: 'neckwear', baseGlb: 'neckwear_scarf', physicsPreset: 'soft_jiggle_muffler' },
  muffler: { slotKey: 'neckwear', baseGlb: 'neckwear_scarf', physicsPreset: 'soft_jiggle_muffler' },
  necktie: { slotKey: 'neckwear', baseGlb: 'neckwear_tie', physicsPreset: 'soft_jiggle_tie' },
  trench: { slotKey: 'outer', baseGlb: 'outer_coat', physicsPreset: 'hem_sway_coat' },
  coat: { slotKey: 'outer', baseGlb: 'outer_coat', physicsPreset: 'hem_sway_coat' },
  blazer: { slotKey: 'outer', baseGlb: 'outer_blazer', physicsPreset: 'rigid_fitted' },
  jacket: { slotKey: 'outer', baseGlb: 'outer_jacket', physicsPreset: 'rigid_fitted' },
  padding: { slotKey: 'outer', baseGlb: 'outer_jacket', physicsPreset: 'rigid_fitted' },
  cardigan: { slotKey: 'top', baseGlb: 'top_cardigan', physicsPreset: 'rigid_fitted' },
  knit: { slotKey: 'top', baseGlb: 'top_knit', physicsPreset: 'rigid_fitted' },
  shirt: { slotKey: 'top', baseGlb: 'top_shirt', physicsPreset: 'rigid_fitted' },
  blouse: { slotKey: 'top', baseGlb: 'top_shirt', physicsPreset: 'rigid_fitted' },
  tshirt: { slotKey: 'top', baseGlb: 'top_tshirt', physicsPreset: 'rigid_fitted' },
  sweatshirt: { slotKey: 'top', baseGlb: 'top_sweatshirt', physicsPreset: 'rigid_fitted' },
  slacks: { slotKey: 'bottom', baseGlb: 'bottom_slacks', physicsPreset: 'rigid_fitted' },
  chinos: { slotKey: 'bottom', baseGlb: 'bottom_slacks', physicsPreset: 'rigid_fitted' },
  denim: { slotKey: 'bottom', baseGlb: 'bottom_denim', physicsPreset: 'rigid_fitted' },
  skirt: { slotKey: 'bottom', baseGlb: 'bottom_skirt', physicsPreset: 'hem_sway_skirt' },
  shorts: { slotKey: 'bottom', baseGlb: 'bottom_shorts', physicsPreset: 'rigid_fitted' },
  dress: { slotKey: 'dress', baseGlb: 'dress_shift', physicsPreset: 'hem_sway_skirt' },
  onepiece: { slotKey: 'dress', baseGlb: 'dress_onepiece', physicsPreset: 'hem_sway_skirt' },
  gloves: { slotKey: 'gloves', baseGlb: 'gloves_short', physicsPreset: 'rigid_fitted' },
  leather_gloves: { slotKey: 'gloves', baseGlb: 'gloves_short', physicsPreset: 'rigid_fitted' },
  inner_top: { slotKey: 'underwear', baseGlb: 'underwear_top', physicsPreset: 'rigid_fitted' },
  underwear: { slotKey: 'underwear', baseGlb: 'underwear_briefs', physicsPreset: 'rigid_fitted' },
  crew_socks: { slotKey: 'socks', baseGlb: 'socks_crew', physicsPreset: 'rigid_fitted' },
  socks: { slotKey: 'socks', baseGlb: 'socks_ankle', physicsPreset: 'rigid_fitted' },
  sneakers: { slotKey: 'shoes', baseGlb: 'shoes_sneakers', physicsPreset: 'rigid_fitted' },
  loafers: { slotKey: 'shoes', baseGlb: 'shoes_loafers', physicsPreset: 'rigid_fitted' },
  boots: { slotKey: 'shoes', baseGlb: 'shoes_boots', physicsPreset: 'rigid_fitted' },
  heels: { slotKey: 'shoes', baseGlb: 'shoes_heels', physicsPreset: 'rigid_fitted' },
  briefcase: { slotKey: 'accessory', baseGlb: 'accessory_briefcase', physicsPreset: 'pendulum_briefcase' },
  tote: { slotKey: 'accessory', baseGlb: 'accessory_tote', physicsPreset: 'pendulum_tote' },
  bag: { slotKey: 'accessory', baseGlb: 'accessory_bag', physicsPreset: 'pendulum_crossbody' },
  watch: { slotKey: 'accessory', baseGlb: 'accessory_watch', physicsPreset: 'rigid_fitted' },
  belt: { slotKey: 'accessory', baseGlb: 'accessory_belt', physicsPreset: 'rigid_fitted' },
  glasses: { slotKey: 'accessory', baseGlb: 'accessory_glasses', physicsPreset: 'rigid_fitted' },
};

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function rgbToLab(r, g, b) {
  let rn = r / 255;
  let gn = g / 255;
  let bn = b / 255;
  rn = rn > 0.04045 ? ((rn + 0.055) / 1.055) ** 2.4 : rn / 12.92;
  gn = gn > 0.04045 ? ((gn + 0.055) / 1.055) ** 2.4 : gn / 12.92;
  bn = bn > 0.04045 ? ((bn + 0.055) / 1.055) ** 2.4 : bn / 12.92;
  const x = (rn * 0.4124 + gn * 0.3576 + bn * 0.1805) / 0.95047;
  const y = rn * 0.2126 + gn * 0.7152 + bn * 0.0722;
  const z = (rn * 0.0193 + gn * 0.1192 + bn * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function hexToRgb(hex) {
  const clean = String(hex || '#1D1D1F').replace('#', '').trim();
  const num = parseInt(clean.padEnd(6, '0').slice(0, 6), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Requirement 6.a: Automatic Background Removal (Alpha Cutout) + WebP Normalization
 */
export async function removeBackgroundAndEncodeWebP(
  imageSource,
  { maxDim = 860, quality = 0.86 } = {}
) {
  const img = await loadImageElement(imageSource);
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const w = Math.max(64, Math.round((img.naturalWidth || 512) * scale));
  const h = Math.max(64, Math.round((img.naturalHeight || 512) * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  // 1. Estimate background Lab color from perimeter corners & edges
  const samples = [];
  const stepX = Math.max(2, Math.floor(w / 24));
  const stepY = Math.max(2, Math.floor(h / 24));
  for (let x = 0; x < w; x += stepX) {
    const iTop = x * 4;
    const iBot = ((h - 1) * w + x) * 4;
    if (d[iTop + 3] > 200) samples.push(rgbToLab(d[iTop], d[iTop + 1], d[iTop + 2]));
    if (d[iBot + 3] > 200) samples.push(rgbToLab(d[iBot], d[iBot + 1], d[iBot + 2]));
  }
  for (let y = 0; y < h; y += stepY) {
    const iL = (y * w) * 4;
    const iR = (y * w + (w - 1)) * 4;
    if (d[iL + 3] > 200) samples.push(rgbToLab(d[iL], d[iL + 1], d[iL + 2]));
    if (d[iR + 3] > 200) samples.push(rgbToLab(d[iR], d[iR + 1], d[iR + 2]));
  }

  let bgL = 95;
  let bgA = 0;
  let bgB = 1;
  if (samples.length > 0) {
    samples.sort((a, b) => a[0] - b[0]);
    const mid = samples[Math.floor(samples.length * 0.6)];
    [bgL, bgA, bgB] = mid;
  }

  // 2. Perimeter flood-fill background segmentation (preserves bright interior garment highlights!)
  const total = w * h;
  const visited = new Uint8Array(total);
  const isBg = new Uint8Array(total);
  const queue = new Int32Array(total);
  let qHead = 0;
  let qTail = 0;

  const colorDistToBg = (idx) => {
    const p = idx * 4;
    const [L, a, b] = rgbToLab(d[p], d[p + 1], d[p + 2]);
    return Math.hypot((L - bgL) * 0.9, a - bgA, b - bgB);
  };

  const BG_TOLERANCE = 18.5;
  const enqueueIfBorderBg = (idx) => {
    if (visited[idx]) return;
    visited[idx] = 1;
    if (d[idx * 4 + 3] < 20 || colorDistToBg(idx) <= BG_TOLERANCE) {
      isBg[idx] = 1;
      queue[qTail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    enqueueIfBorderBg(x);
    enqueueIfBorderBg((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    enqueueIfBorderBg(y * w);
    enqueueIfBorderBg(y * w + (w - 1));
  }

  while (qHead < qTail) {
    const curr = queue[qHead++];
    const cx = curr % w;
    const cy = (curr - cx) / w;
    const neighbors = [];
    if (cx > 0) neighbors.push(curr - 1);
    if (cx < w - 1) neighbors.push(curr + 1);
    if (cy > 0) neighbors.push(curr - w);
    if (cy < h - 1) neighbors.push(curr + w);

    for (let k = 0; k < neighbors.length; k++) {
      const nb = neighbors[k];
      if (visited[nb]) continue;
      visited[nb] = 1;
      if (colorDistToBg(nb) <= BG_TOLERANCE) {
        isBg[nb] = 1;
        queue[qTail++] = nb;
      }
    }
  }

  // Guard: ensure at least 8% foreground remains so ultra-low-contrast white-on-white items aren't erased
  let fgCount = 0;
  for (let i = 0; i < total; i++) {
    if (!isBg[i]) fgCount++;
  }
  const applyMask = fgCount > total * 0.06 && fgCount < total * 0.985;

  if (applyMask) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (isBg[idx]) {
          d[idx * 4 + 3] = 0;
        } else {
          // Soft 1px anti-aliased edge feathering adjacent to transparent background
          let adjBg = 0;
          if (x > 0 && isBg[idx - 1]) adjBg++;
          if (x < w - 1 && isBg[idx + 1]) adjBg++;
          if (y > 0 && isBg[idx - w]) adjBg++;
          if (y < h - 1 && isBg[idx + w]) adjBg++;
          if (adjBg > 0) {
            d[idx * 4 + 3] = Math.round(d[idx * 4 + 3] * (1 - adjBg * 0.14));
          }
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  let webpDataUrl = canvas.toDataURL('image/webp', quality);
  if (!webpDataUrl.startsWith('data:image/webp')) {
    webpDataUrl = canvas.toDataURL('image/png');
  }

  return {
    webpDataUrl,
    width: w,
    height: h,
    cutoutApplied: applyMask,
    format: webpDataUrl.startsWith('data:image/webp') ? 'webp' : 'png',
  };
}

/**
 * Requirement 6.b: Automatic AI Vision Extraction of Category, Color, Seasonality, Fabric & 3D Slot
 */
export async function extractGarmentAIMetadata(imageSource, hints = {}) {
  const img = await loadImageElement(imageSource);
  const sampleSize = 128;
  const canvas = document.createElement('canvas');
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
  const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);

  let minX = sampleSize;
  let maxX = 0;
  let minY = sampleSize;
  let maxY = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  let highFreqSum = 0;
  let specularCount = 0;
  let lowerSplitGap = 0;

  for (let y = 1; y < sampleSize - 1; y++) {
    for (let x = 1; x < sampleSize - 1; x++) {
      const idx = (y * sampleSize + x) * 4;
      const a = data[idx + 3];
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Treat transparent OR near-white perimeter pixels as background
      const isFg = a > 120 && !(a === 255 && r > 243 && g > 241 && b > 236 && (x < 8 || x > 119 || y < 8 || y > 119));
      if (!isFg) continue;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      sumR += r;
      sumG += g;
      sumB += b;
      count++;

      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      const lumRight = data[idx + 4] * 0.299 + data[idx + 5] * 0.587 + data[idx + 6] * 0.114;
      const lumDown =
        data[idx + sampleSize * 4] * 0.299 +
        data[idx + sampleSize * 4 + 1] * 0.587 +
        data[idx + sampleSize * 4 + 2] * 0.114;
      highFreqSum += Math.abs(lum - lumRight) + Math.abs(lum - lumDown);
      if (lum > 218) specularCount++;
    }
  }

  // Check center gap in lower 35% of bounding box (detects pants/trousers vs dress/skirt/coat)
  if (maxY > minY + 20) {
    const midX = Math.round((minX + maxX) / 2);
    const checkYStart = Math.round(minY + (maxY - minY) * 0.68);
    let transparentMid = 0;
    let rowsChecked = 0;
    for (let y = checkYStart; y < maxY; y++) {
      rowsChecked++;
      if (data[(y * sampleSize + midX) * 4 + 3] < 80) transparentMid++;
    }
    if (rowsChecked > 0) lowerSplitGap = transparentMid / rowsChecked;
  }

  const avgR = count > 0 ? Math.round(sumR / count) : 45;
  const avgG = count > 0 ? Math.round(sumG / count) : 45;
  const avgB = count > 0 ? Math.round(sumB / count) : 48;

  // Nearest palette color in CIELAB
  const targetLab = rgbToLab(avgR, avgG, avgB);
  let bestColor = COLOR_PALETTE[0];
  let minDelta = Infinity;
  for (const c of COLOR_PALETTE) {
    const [cr, cg, cb] = hexToRgb(c.hex);
    const lab = rgbToLab(cr, cg, cb);
    const dE = Math.hypot(targetLab[0] - lab[0], targetLab[1] - lab[1], targetLab[2] - lab[2]);
    if (dE < minDelta) {
      minDelta = dE;
      bestColor = c;
    }
  }

  const realAspect =
    ((maxY - minY + 1) * (img.naturalHeight || 1)) /
    Math.max(1, (maxX - minX + 1) * (img.naturalWidth || 1));
  const microContrast = count > 0 ? highFreqSum / count : 10;
  const specRatio = count > 0 ? specularCount / count : 0;
  const isIndigoTone = avgB > avgR + 16 && avgB > avgG + 8;

  // Infer category & subcategory unless explicitly locked by hint
  let category = hints.category || '';
  let subcategory = hints.subcategory || '';

  if (!category) {
    if (realAspect >= 1.42) {
      if (lowerSplitGap > 0.35) {
        category = 'bottom';
        subcategory = isIndigoTone ? 'denim' : 'slacks';
      } else {
        category = 'outer';
        subcategory = 'coat';
      }
    } else if (realAspect <= 0.78) {
      category = 'shoes';
      subcategory = avgR + avgG + avgB > 580 ? 'sneakers' : 'loafers';
    } else if (realAspect >= 1.16 && lowerSplitGap > 0.25) {
      category = 'bottom';
      subcategory = isIndigoTone ? 'denim' : 'slacks';
    } else {
      category = 'top';
      subcategory = microContrast > 14 ? 'knit' : 'shirt';
    }
  }

  if (!subcategory) {
    const defaultSub = {
      headwear: 'cap',
      neckwear: 'scarf',
      outer: 'coat',
      top: microContrast > 14 ? 'knit' : 'shirt',
      bottom: isIndigoTone ? 'denim' : 'slacks',
      dress: 'dress',
      gloves: 'leather_gloves',
      underwear: 'inner_top',
      socks: 'crew_socks',
      shoes: 'sneakers',
      accessory: 'briefcase',
    };
    subcategory = defaultSub[category] || 'knit';
  }

  // Infer fabric material
  let fabric = 'cotton';
  if (subcategory === 'denim' || (isIndigoTone && microContrast > 11)) {
    fabric = 'denim';
  } else if (
    category === 'shoes' ||
    subcategory === 'leather_gloves' ||
    subcategory === 'briefcase' ||
    subcategory === 'tote' ||
    subcategory === 'bag' ||
    subcategory === 'belt'
  ) {
    fabric = 'leather';
  } else if (subcategory === 'padding') {
    fabric = 'padding';
  } else if (subcategory === 'coat' || subcategory === 'blazer' || subcategory === 'slacks' || subcategory === 'scarf') {
    fabric = 'wool';
  } else if (subcategory === 'knit' || subcategory === 'cardigan' || subcategory === 'beanie' || subcategory === 'crew_socks') {
    fabric = 'knit';
  } else if (subcategory === 'blouse' || subcategory === 'necktie' || (specRatio > 0.18 && microContrast < 8)) {
    fabric = 'silk';
  }

  // Infer seasonality & thermal comfort range
  let seasons = ['봄', '가을'];
  let min_temp = 10;
  let max_temp = 21;
  if (subcategory === 'padding' || category === 'gloves' || subcategory === 'scarf' || subcategory === 'beanie') {
    seasons = ['겨울'];
    min_temp = -10;
    max_temp = 7;
  } else if (subcategory === 'coat') {
    seasons = ['가을', '겨울'];
    min_temp = -3;
    max_temp = 12;
  } else if (subcategory === 'tshirt' || subcategory === 'shorts') {
    seasons = ['여름'];
    min_temp = 21;
    max_temp = 34;
  } else if (category === 'shoes' || category === 'accessory' || subcategory === 'denim') {
    seasons = ['봄', '여름', '가을', '겨울'];
    min_temp = -2;
    max_temp = 30;
  }

  const manifestMapping = MANIFEST_SLOT_MAP[subcategory] || MANIFEST_SLOT_MAP.knit;
  const physicsSpec =
    GARMENT_3D_PHYSICS_PRESETS[manifestMapping.physicsPreset] ||
    GARMENT_3D_PHYSICS_PRESETS.rigid_fitted;
  const fabricSpec = FABRIC_OPTIONS.find((f) => f.value === fabric) || FABRIC_OPTIONS[0];

  const suggestedName = `${bestColor.name} ${fabricSpec.labelKo.split(' · ')[0]} ${
    subcategory === 'coat'
      ? '코트'
      : subcategory === 'trench'
        ? '트렌치'
        : subcategory === 'knit'
          ? '니트'
          : subcategory === 'shirt'
            ? '셔츠'
            : subcategory === 'tshirt'
              ? '티셔츠'
              : subcategory === 'denim'
                ? '데님 팬츠'
                : subcategory === 'slacks'
                  ? '슬랙스'
                  : subcategory === 'sneakers'
                    ? '스니커즈'
                    : subcategory === 'loafers'
                      ? '로퍼'
                      : subcategory === 'scarf'
                        ? '머플러'
                        : subcategory === 'briefcase'
                          ? '서류가방'
                          : '아이템'
  }`;

  return {
    suggestedName,
    category,
    subcategory,
    color_name: bestColor.name,
    color_hex: bestColor.hex,
    sampled_hex: `#${[avgR, avgG, avgB].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`,
    fabric,
    fabricLabelKo: fabricSpec.labelKo,
    seasons,
    min_temp,
    max_temp,
    water_resistant: fabric === 'leather' || fabric === 'padding' || subcategory === 'trench',
    slot_key: manifestMapping.slotKey,
    base_glb: manifestMapping.baseGlb,
    physics_preset: manifestMapping.physicsPreset,
    physicsLabelKo: physicsSpec.labelKo,
  };
}
