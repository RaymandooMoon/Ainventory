import { memo, useEffect, useMemo, useState } from 'react';
import { hexToRgb } from '../shared/colorMath.js';
import {
  NATIVE_SEED_HEX,
  STUDIO_SEED_BY_CATEGORY,
  STUDIO_SEED_BY_SUBCATEGORY,
  resolveStudioSeedUrl,
} from '../shared/garmentTaxonomy.js';

function rgbDist(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const MAX_TINTED_LRU_ENTRIES = 64;
const TINTED_URL_CACHE = new Map();
const PENDING_TINTS = new Map();

function readLruCachedUrl(key) {
  if (!TINTED_URL_CACHE.has(key)) return null;
  const val = TINTED_URL_CACHE.get(key);
  TINTED_URL_CACHE.delete(key);
  TINTED_URL_CACHE.set(key, val);
  return val;
}

function writeLruCachedUrl(key, url) {
  if (TINTED_URL_CACHE.has(key)) {
    TINTED_URL_CACHE.delete(key);
  }
  while (TINTED_URL_CACHE.size >= MAX_TINTED_LRU_ENTRIES) {
    const oldestEntry = TINTED_URL_CACHE.entries().next().value;
    if (!oldestEntry) break;
    const [oldKey, oldUrl] = oldestEntry;
    TINTED_URL_CACHE.delete(oldKey);
    if (typeof oldUrl === 'string' && oldUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(oldUrl);
      } catch {
        // ignore URL revocation errors
      }
    }
  }
  TINTED_URL_CACHE.set(key, url);
}

function runBorderFloodFill(d, w, h, bgR, bgG, bgB, distLimit) {
  const nPx = w * h;
  const bgMask = new Uint8Array(nPx);
  const queue = new Int32Array(nPx);
  let head = 0;
  let tail = 0;

  const trySeed = (p) => {
    if (bgMask[p]) return;
    const i = p * 4;
    if (d[i + 3] < 16) {
      bgMask[p] = 1;
      queue[tail++] = p;
      return;
    }
    const dist = Math.hypot(d[i] - bgR, d[i + 1] - bgG, d[i + 2] - bgB);
    if (dist <= distLimit) {
      bgMask[p] = 1;
      queue[tail++] = p;
    }
  };

  for (let x = 0; x < w; x++) {
    trySeed(x);
    trySeed((h - 1) * w + x);
  }
  for (let y = 1; y < h - 1; y++) {
    trySeed(y * w);
    trySeed(y * w + (w - 1));
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) trySeed(p - 1);
    if (x < w - 1) trySeed(p + 1);
    if (y > 0) trySeed(p - w);
    if (y < h - 1) trySeed(p + w);
  }

  return { bgMask, bgCount: tail };
}

function encodeCanvasObjectUrl(canvas) {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function' || typeof URL === 'undefined' || !URL.createObjectURL) {
      const dataUrl = canvas.toDataURL('image/webp', 0.9);
      canvas.width = 0;
      canvas.height = 0;
      resolve(dataUrl);
      return;
    }
    canvas.toBlob(
      (blob) => {
        let outUrl = '';
        if (blob) {
          outUrl = URL.createObjectURL(blob);
        } else {
          outUrl = canvas.toDataURL('image/webp', 0.9);
        }
        canvas.width = 0;
        canvas.height = 0;
        resolve(outUrl);
      },
      'image/webp',
      0.9
    );
  });
}

function getGarmentTintedPackshot(srcUrl, targetHex, shouldTint = true) {
  const key = `${srcUrl}|${shouldTint ? (targetHex || '').toUpperCase() : 'RAW_CUTOUT'}`;
  const cached = readLruCachedUrl(key);
  if (cached) {
    return Promise.resolve(cached);
  }
  if (PENDING_TINTS.has(key)) {
    return PENDING_TINTS.get(key);
  }

  const job = new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(srcUrl);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      let canvas = null;
      try {
        const maxSide = 360;
        const scale = Math.min(
          1,
          maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1)
        );
        const w = Math.max(64, Math.round((img.naturalWidth || 300) * scale));
        const h = Math.max(64, Math.round((img.naturalHeight || 400) * scale));
        canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;

        // Sample 4 corner blocks to measure exact studio paper background RGB
        let bgR = 0;
        let bgG = 0;
        let bgB = 0;
        let bgSampleCount = 0;
        const samplePts = [
          [2, 2],
          [w - 3, 2],
          [2, h - 3],
          [w - 3, h - 3],
          [Math.floor(w * 0.5), 2],
          [Math.floor(w * 0.5), h - 3],
        ];
        for (const [sx, sy] of samplePts) {
          const idx = (sy * w + sx) * 4;
          bgR += d[idx];
          bgG += d[idx + 1];
          bgB += d[idx + 2];
          bgSampleCount++;
        }
        bgR /= bgSampleCount;
        bgG /= bgSampleCount;
        bgB /= bgSampleCount;

        const nPx = w * h;
        let { bgMask, bgCount } = runBorderFloodFill(d, w, h, bgR, bgG, bgB, 20);
        if (bgCount > nPx * 0.88) {
          ({ bgMask, bgCount } = runBorderFloodFill(d, w, h, bgR, bgG, bgB, 10));
        }
        const applyAlphaCutout = bgCount > nPx * 0.04 && bgCount < nPx * 0.94;

        // Pass 1: compute foreground weights and transparent studio background alpha
        let fgLumSum = 0;
        let fgWeightSum = 0;
        const masks = new Float32Array(nPx);
        for (let p = 0; p < nPx; p++) {
          const i = p * 4;
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;

          if (applyAlphaCutout && bgMask[p]) {
            masks[p] = 0;
            d[i + 3] = 0;
            continue;
          }

          const distBg = Math.hypot(r - bgR, g - bgG, b - bgB);
          let edgeAlpha = 1;
          if (applyAlphaCutout) {
            const x = p % w;
            const y = (p - x) / w;
            const touchesBg =
              (x > 0 && bgMask[p - 1]) ||
              (x < w - 1 && bgMask[p + 1]) ||
              (y > 0 && bgMask[p - w]) ||
              (y < h - 1 && bgMask[p + w]);
            if (touchesBg) {
              edgeAlpha = smoothstep(8, 28, distBg);
              d[i + 3] = Math.round(d[i + 3] * edgeAlpha);
            }
          }

          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
          const isPaperOrSoftShadow = sat < 14 && lum > bgLum - 32 && distBg < 36;
          const m = isPaperOrSoftShadow ? 0 : smoothstep(16, 42, distBg) * edgeAlpha;
          masks[p] = m;
          if (m > 0.35) {
            fgLumSum += lum * m;
            fgWeightSum += m;
          }
        }

        // Pass 2: optional re-shade of garment pixels, preserving grain, seams, folds & metallic glints
        if (shouldTint && targetHex && fgWeightSum >= 40) {
          const meanFgLum = Math.max(42, Math.min(215, fgLumSum / fgWeightSum));
          const tgt = hexToRgb(targetHex);
          const tgtLum = 0.299 * tgt.r + 0.587 * tgt.g + 0.114 * tgt.b;

          for (let p = 0; p < nPx; p++) {
            const m = masks[p];
            if (m <= 0.01) continue;
            const i = p * 4;
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const sat = Math.max(r, g, b) - Math.min(r, g, b);

            const metalSpecularProtect =
              sat < 18 && lum > 205 ? smoothstep(205, 242, lum) * 0.75 : 0;
            const blend = m * (1 - metalSpecularProtect) * 0.88;
            const shadeRatio = Math.pow(
              Math.max(0.08, lum / meanFgLum),
              tgtLum < 55 ? 0.85 : 0.95
            );
            const specLift = Math.max(0, (lum - meanFgLum * 1.18) * 0.32);

            const nr = Math.min(255, Math.max(0, tgt.r * shadeRatio + specLift));
            const ng = Math.min(255, Math.max(0, tgt.g * shadeRatio + specLift));
            const nb = Math.min(255, Math.max(0, tgt.b * shadeRatio + specLift));

            d[i] = Math.round(r * (1 - blend) + nr * blend);
            d[i + 1] = Math.round(g * (1 - blend) + ng * blend);
            d[i + 2] = Math.round(b * (1 - blend) + nb * blend);
          }
        }

        ctx.putImageData(imgData, 0, 0);
        const outUrl = await encodeCanvasObjectUrl(canvas);
        writeLruCachedUrl(key, outUrl);
        resolve(outUrl);
      } catch {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        resolve(srcUrl);
      } finally {
        PENDING_TINTS.delete(key);
      }
    };
    img.onerror = () => {
      PENDING_TINTS.delete(key);
      resolve(srcUrl);
    };
    img.src = srcUrl;
  });

  PENDING_TINTS.set(key, job);
  return job;
}

const StudioGarmentImage = memo(function StudioGarmentImage({
  item,
  src,
  colorHex,
  category,
  subcategory,
  alt,
  className = '',
  style = {},
  imgStyle = {},
  allowStorePhoto = false,
}) {
  const rawSrc = src || item?.image_url || '';
  const cat = category || item?.category || 'top';
  const sub = subcategory || item?.subcategory || 'knit';
  const targetHex = colorHex || item?.color_hex || '';
  const label = alt || item?.name || '의류 이미지';

  const fallbackSeedSrc =
    STUDIO_SEED_BY_SUBCATEGORY[sub] || STUDIO_SEED_BY_CATEGORY[cat] || '/seed/cream-knit.jpg';

  const resolvedSrc = useMemo(() => {
    if (
      allowStorePhoto &&
      rawSrc &&
      !rawSrc.startsWith('data:image/svg+xml') &&
      rawSrc !== '/seed/store-terracotta-cardigan.jpg'
    ) {
      return rawSrc;
    }
    return resolveStudioSeedUrl(
      { image_url: rawSrc, category: cat, subcategory: sub, name: item?.name },
      cat,
      sub
    );
  }, [rawSrc, cat, sub, item?.name, allowStorePhoto]);

  const isProcessableSeed = useMemo(() => {
    if (!resolvedSrc.startsWith('/seed/')) return false;
    if (
      allowStorePhoto ||
      resolvedSrc.includes('store-navy-sweater') ||
      resolvedSrc.includes('store-terracotta-cardigan')
    ) {
      return false;
    }
    return true;
  }, [resolvedSrc, allowStorePhoto]);

  const shouldTintSeed = useMemo(() => {
    if (!targetHex || !isProcessableSeed) return false;
    const nativeHex = NATIVE_SEED_HEX[resolvedSrc];
    if (nativeHex) {
      if (rgbDist(hexToRgb(targetHex), hexToRgb(nativeHex)) < 40) {
        return false;
      }
    }
    return true;
  }, [resolvedSrc, targetHex, isProcessableSeed]);

  const cacheKey = `${resolvedSrc}|${shouldTintSeed ? targetHex.toUpperCase() : 'RAW_CUTOUT'}`;

  const [asyncTinted, setAsyncTinted] = useState(null);
  const [failedKey, setFailedKey] = useState(null);

  useEffect(() => {
    if (!isProcessableSeed || TINTED_URL_CACHE.has(cacheKey)) {
      return undefined;
    }
    let cancelled = false;
    getGarmentTintedPackshot(resolvedSrc, targetHex, shouldTintSeed).then((cutoutUrl) => {
      if (!cancelled) {
        setAsyncTinted({ key: cacheKey, url: cutoutUrl });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedSrc, targetHex, shouldTintSeed, isProcessableSeed, cacheKey]);

  const cachedUrl = isProcessableSeed ? readLruCachedUrl(cacheKey) : null;
  const computedSrc = !isProcessableSeed
    ? resolvedSrc
    : cachedUrl || (asyncTinted?.key === cacheKey ? asyncTinted.url : resolvedSrc);
  const displaySrc = failedKey === cacheKey ? fallbackSeedSrc : computedSrc;

  const [loadedSrc, setLoadedSrc] = useState(null);
  const isReady =
    loadedSrc === displaySrc ||
    Boolean(displaySrc && (displaySrc.startsWith('data:') || displaySrc.startsWith('blob:')));

  return (
    <div
      className={`studio-garment-image ${className}`.trim()}
      style={{
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: 'transparent',
        ...style,
      }}
    >
      {!isReady && (
        <div
          aria-hidden="true"
          className="hig-skeleton"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
          }}
        />
      )}
      <img
        ref={(el) => {
          if (el?.complete && el.naturalWidth > 0 && loadedSrc !== displaySrc) {
            setLoadedSrc(displaySrc);
          }
        }}
        src={displaySrc}
        alt={label}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoadedSrc(displaySrc)}
        onError={() => {
          if (displaySrc !== fallbackSeedSrc) {
            setFailedKey(cacheKey);
          } else {
            setLoadedSrc(displaySrc);
          }
        }}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
          opacity: isReady ? 1 : 0,
          transition: 'opacity 0.28s var(--spring-ease)',
          ...imgStyle,
        }}
      />
    </div>
  );
});

export default StudioGarmentImage;
