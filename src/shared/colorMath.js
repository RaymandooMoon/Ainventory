/**
 * Isomorphic LUT-Accelerated sRGB / Hex / CIELAB Color Math & Canonical Garment Palette
 * Shared across Node Express backend (`server/*`) and browser/WebWorker pipelines (`src/*`).
 */

const SRGB_TO_LINEAR_LUT = new Float32Array(256);
for (let i = 0; i < 256; i += 1) {
  const s = i / 255;
  SRGB_TO_LINEAR_LUT[i] = s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export const COLOR_PALETTE = [
  { name: '블랙', hex: '#1D1D1F' },
  { name: '차콜', hex: '#373A40' },
  { name: '그레이', hex: '#8E9299' },
  { name: '화이트', hex: '#F3F2EE' },
  { name: '크림', hex: '#DFD5C4' },
  { name: '베이지', hex: '#C6B294' },
  { name: '카멜', hex: '#C18F59' },
  { name: '브라운', hex: '#6E4F3A' },
  { name: '테라코타', hex: '#A64B2A' },
  { name: '버건디 와인', hex: '#681F2B' },
  { name: '코랄 피치', hex: '#E38C74' },
  { name: '더스티 로즈', hex: '#C695A0' },
  { name: '카키/올리브', hex: '#7B826B' },
  { name: '네이비', hex: '#1D273B' },
  { name: '인디고', hex: '#2B446B' },
  { name: '스카이블루', hex: '#8FB2CE' },
  { name: '라벤더 그레이', hex: '#ABA9BC' },
];

export function hexToRgb(hex = '#8E9299') {
  const clean = String(hex || '#8E9299').replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return { r: 142, g: 146, b: 153 };
  }
  const num = Number.parseInt(full, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r, g, b) {
  const clampByte = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)));
  return `#${[clampByte(r), clampByte(g), clampByte(b)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

export function rgbToCieLab(r, g, b) {
  const ri = Math.max(0, Math.min(255, r | 0));
  const gi = Math.max(0, Math.min(255, g | 0));
  const bi = Math.max(0, Math.min(255, b | 0));

  const lr = SRGB_TO_LINEAR_LUT[ri];
  const lg = SRGB_TO_LINEAR_LUT[gi];
  const lb = SRGB_TO_LINEAR_LUT[bi];

  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;

  const fx = x > 0.008856 ? Math.cbrt(x) : 7.787 * x + 16 / 116;
  const fy = y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116;
  const fz = z > 0.008856 ? Math.cbrt(z) : 7.787 * z + 16 / 116;

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function deltaE76(lab1, lab2) {
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

export function colorSimilarityScore(hexA, hexB) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const de = deltaE76(rgbToCieLab(a.r, a.g, a.b), rgbToCieLab(b.r, b.g, b.b));
  return Math.max(0, Math.min(100, Math.round(100 - de * 1.45)));
}

const PALETTE_WITH_LAB = COLOR_PALETTE.map((entry) => {
  const rgb = hexToRgb(entry.hex);
  return { ...entry, lab: rgbToCieLab(rgb.r, rgb.g, rgb.b) };
});

export function matchClosestPaletteColor(hexOrRgb, palette = PALETTE_WITH_LAB) {
  const rgb =
    typeof hexOrRgb === 'string'
      ? hexToRgb(hexOrRgb)
      : {
          r: Number(hexOrRgb?.r) || 0,
          g: Number(hexOrRgb?.g) || 0,
          b: Number(hexOrRgb?.b) || 0,
        };
  const targetLab = rgbToCieLab(rgb.r, rgb.g, rgb.b);

  let best = COLOR_PALETTE[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const item of palette) {
    const itemLab = item.lab || (() => {
      const c = hexToRgb(item.hex);
      return rgbToCieLab(c.r, c.g, c.b);
    })();
    const dist = deltaE76(targetLab, itemLab);
    if (dist < bestDist) {
      bestDist = dist;
      best = { name: item.name, hex: item.hex };
    }
  }
  return best;
}
