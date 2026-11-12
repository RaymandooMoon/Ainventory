import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import { hexToRgb } from '../shared/colorMath.js';
import { computeSkinShadingPalette } from '../services/skinToneAnalyzer.ts';

const WORK_W = 520;
const WORK_H = 780;

const MODEL_SPECS = {
  male: {
    baseSrc: '/models/25d/male-base.webp',
    maskSrc: '/models/25d/male-skinmask.webp',
    refRgb: [224, 180, 149],
  },
  female: {
    baseSrc: '/models/25d/female-base.webp',
    maskSrc: '/models/25d/female-skinmask.webp',
    refRgb: [222, 181, 151],
  },
};

/** Module-level decoded pixel cache so 2.5D model assets decode once per session */
const decodedAssetCache = new Map();

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function getDecodedModelPixels(genderKey) {
  const key = genderKey === 'female' ? 'female' : 'male';
  if (decodedAssetCache.has(key)) {
    return decodedAssetCache.get(key);
  }

  const spec = MODEL_SPECS[key];
  const promise = Promise.all([loadImageElement(spec.baseSrc), loadImageElement(spec.maskSrc)])
    .then(([baseImg, maskImg]) => {
      const offBase = document.createElement('canvas');
      offBase.width = WORK_W;
      offBase.height = WORK_H;
      const bCtx = offBase.getContext('2d', { willReadFrequently: true });
      bCtx.drawImage(baseImg, 0, 0, WORK_W, WORK_H);
      const baseData = bCtx.getImageData(0, 0, WORK_W, WORK_H).data;

      const offMask = document.createElement('canvas');
      offMask.width = WORK_W;
      offMask.height = WORK_H;
      const mCtx = offMask.getContext('2d', { willReadFrequently: true });
      mCtx.drawImage(maskImg, 0, 0, WORK_W, WORK_H);
      const maskRgba = mCtx.getImageData(0, 0, WORK_W, WORK_H).data;

      const skinWeight = new Uint8Array(WORK_W * WORK_H);
      for (let i = 0, p = 0; i < skinWeight.length; i++, p += 4) {
        skinWeight[i] = maskRgba[p]; // grayscale red channel 0..255
      }

      return {
        baseRgba: new Uint8ClampedArray(baseData),
        skinWeight,
        refRgb: spec.refRgb,
      };
    })
    .catch((err) => {
      decodedAssetCache.delete(key);
      throw err;
    });

  decodedAssetCache.set(key, promise);
  return promise;
}

/**
 * Builds a 256-entry tone-preserving gamma + linear lookup table for a single RGB channel.
 * Guarantees exact color match at the model's median skin tone while preventing
 * chalky highlight clipping on fair porcelain tones and preserving specular sheen on deep tones.
 */
function buildSkinChannelLut(refByte, targetByte) {
  const lut = new Uint8Array(256);
  const rNorm = Math.max(0.08, Math.min(0.96, refByte / 255));
  const tNorm = Math.max(0.08, Math.min(0.97, targetByte / 255));
  const gamma = Math.log(tNorm) / Math.log(rNorm);
  const gain = tNorm / rNorm;

  for (let i = 0; i < 256; i++) {
    if (i === 0) {
      lut[i] = 0;
      continue;
    }
    const x = i / 255;
    const gammaMapped = Math.pow(x, gamma);
    const linearMapped = Math.min(1, x * gain);
    const blended = Math.max(0, Math.min(1, gammaMapped * 0.74 + linearMapped * 0.26));
    lut[i] = Math.round(blended * 255);
  }
  return lut;
}

/**
 * High-Resolution Editorial 2.5D Fashion Studio Model
 * - Uses anatomical 8-head 2.5D studio lookbook models (`male` & `female`)
 * - Re-shades exposed skin in <2ms via 256-entry gamma+linear LUTs while keeping neutral basewear,
 *   eyes, brows, and hair untouched
 * - Applies smart anatomical masking when garments are worn so tank-top straps, inner-leg gaps,
 *   or bare toes never poke out around equipped clothes
 */
const Character25DMannequin = memo(function Character25DMannequin({
  skinToneHex = '#DFBA9B',
  personalColor = 'autumn_warm',
  gender = 'male',
  theme = 'light',
  hasTopOrOuter = false,
  hasOuter = false,
  isShortSleeveOnly = false,
  isDress = false,
  hasBottom = false,
  isSkirtOrShorts = false,
  hasShoes = false,
  pointer = { x: 0, y: 0 },
  compact = false,
}) {
  const canvasRef = useRef(null);
  const [decodedModel, setDecodedModel] = useState(null);

  const genderKey = gender === 'female' ? 'female' : 'male';
  const palette = useMemo(
    () => computeSkinShadingPalette(skinToneHex, personalColor, theme),
    [skinToneHex, personalColor, theme]
  );

  useEffect(() => {
    let cancelled = false;
    getDecodedModelPixels(genderKey)
      .then((res) => {
        if (!cancelled) setDecodedModel(res);
      })
      .catch(() => {
        // Fallback silently if asset fails
      });
    return () => {
      cancelled = true;
    };
  }, [genderKey]);

  // Real-time 60fps skin-tone LUT + anatomical garment masking onto `<canvas>`
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !decodedModel) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const targetRgb = hexToRgb(palette.base);
    const [refR, refG, refB] = decodedModel.refRgb;
    const lutR = buildSkinChannelLut(refR, targetRgb.r);
    const lutG = buildSkinChannelLut(refG, targetRgb.g);
    const lutB = buildSkinChannelLut(refB, targetRgb.b);

    const src = decodedModel.baseRgba;
    const weights = decodedModel.skinWeight;
    const outImg = ctx.createImageData(WORK_W, WORK_H);
    const dst = outImg.data;

    const applyClothesMask = !compact && (hasTopOrOuter || isDress || hasBottom || hasShoes);
    // Outerwear sleeves extend straight down to the wrists; standalone flat-lay shirts often fold sleeves inward
    const showLowerHandsWithTop = isShortSleeveOnly || hasOuter;

    for (let y = 0; y < WORK_H; y++) {
      const ny = y / WORK_H;
      const rowOffset = y * WORK_W;

      // Precompute vertical toe fade when shoes are equipped (keeps ankles 100% solid into shoe opening)
      let footAlphaScale = 1;
      if (applyClothesMask && hasShoes && ny > 0.874) {
        footAlphaScale = Math.max(0, Math.min(1, 1 - (ny - 0.874) / 0.024));
      }

      for (let x = 0; x < WORK_W; x++) {
        const idx = rowOffset + x;
        const p = idx * 4;
        const baseA = src[p + 3];
        if (baseA === 0) continue;

        const wSkin = weights[idx];
        let visibility = footAlphaScale;

        if (applyClothesMask && visibility > 0) {
          const nx = x / WORK_W;

          // 1. Upper-body masking (clean neck column into any collar, zero trapezius/strap slivers, natural cuff hands)
          if (hasTopOrOuter || isDress) {
            const upperEndNy = showLowerHandsWithTop ? 0.458 : 0.568;
            const armSleeveEndNy = isShortSleeveOnly ? 0.302 : 0.438;
            if (ny >= 0.174 && ny <= upperEndNy) {
              let neckFactor = 0;
              if (ny < 0.275 && wSkin > 150) {
                const collarHalfW = Math.max(0.032, 0.062 - Math.max(0, ny - 0.174) * 0.28);
                const distX = Math.abs(nx - 0.5);
                const hFade = Math.max(0, Math.min(1, 1 - (distX - (collarHalfW - 0.012)) / 0.015));
                const skinPure = Math.max(0, Math.min(1, (wSkin - 150) / 70));
                neckFactor = hFade * skinPure;
              }

              let armFactor = 0;
              if (
                showLowerHandsWithTop &&
                ny >= armSleeveEndNy &&
                (nx < 0.352 || nx > 0.648) &&
                wSkin > 90
              ) {
                armFactor = Math.min(1, (ny - armSleeveEndNy) / 0.018);
              }

              const topFeather =
                ny < 0.186 && Math.abs(nx - 0.5) < 0.064 && wSkin > 140
                  ? Math.max(0, (0.186 - ny) / 0.012)
                  : 0;

              visibility *= Math.max(neckFactor, armFactor, topFeather);
            }
          }

          // 2. Lower-body masking (hides dark biker shorts & inner-leg gap behind pants/skirts/dresses)
          if (visibility > 0 && (hasBottom || isDress)) {
            const legMaskEndNy = isDress
              ? 0.68
              : isSkirtOrShorts
                ? 0.555
                : 0.815;

            if (ny >= 0.42 && ny <= legMaskEndNy) {
              const isOuterHand =
                showLowerHandsWithTop &&
                ny < 0.575 &&
                (nx < 0.348 || nx > 0.652) &&
                wSkin > 80;
              if (!isOuterHand) {
                if (ny > legMaskEndNy - 0.022) {
                  visibility *= Math.max(0, (ny - (legMaskEndNy - 0.022)) / 0.022);
                } else {
                  visibility = 0;
                }
              }
            }
          }
        }

        if (visibility <= 0.004) continue;

        const r0 = src[p];
        const g0 = src[p + 1];
        const b0 = src[p + 2];

        if (wSkin === 0) {
          dst[p] = r0;
          dst[p + 1] = g0;
          dst[p + 2] = b0;
        } else if (wSkin === 255) {
          dst[p] = lutR[r0];
          dst[p + 1] = lutG[g0];
          dst[p + 2] = lutB[b0];
        } else {
          const inv = 255 - wSkin;
          dst[p] = (r0 * inv + lutR[r0] * wSkin + 127) >> 8;
          dst[p + 1] = (g0 * inv + lutG[g0] * wSkin + 127) >> 8;
          dst[p + 2] = (b0 * inv + lutB[b0] * wSkin + 127) >> 8;
        }

        dst[p + 3] = visibility >= 0.999 ? baseA : Math.round(baseA * visibility);
      }
    }

    ctx.putImageData(outImg, 0, 0);
  }, [
    decodedModel,
    palette.base,
    compact,
    hasTopOrOuter,
    hasOuter,
    isShortSleeveOnly,
    isDress,
    hasBottom,
    isSkirtOrShorts,
    hasShoes,
  ]);

  const px = Number(pointer?.x || 0);
  const py = Number(pointer?.y || 0);

  return (
    <div
      id={compact ? undefined : CARBON_DOM_CONTRACT.character25dMannequinId}
      className={`character-25d-mannequin ${compact ? 'is-compact' : ''}`}
      data-skin-hex={palette.base}
      data-personal-color={personalColor}
      data-character-gender={genderKey}
      style={{
        transform: compact
          ? undefined
          : `translate3d(calc(-50% + ${Math.round(px * 4)}px), ${Math.round(py * 3)}px, 0)`,
      }}
    >
      {/* Personal Color Studio Drape Halo */}
      <div
        aria-hidden="true"
        className="character-25d-aura"
        style={{
          background: `radial-gradient(circle at 50% 24%, ${palette.auraColor} 0%, rgba(0,0,0,0) 66%)`,
        }}
      />

      <canvas
        ref={canvasRef}
        width={WORK_W}
        height={WORK_H}
        className="character-25d-render-canvas"
        role="img"
        aria-label={`2.5D 패션 모델 (${palette.base})`}
      />
    </div>
  );
});

export default Character25DMannequin;
