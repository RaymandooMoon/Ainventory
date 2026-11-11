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

function runBorderFloodFill(d, w, h, bgR, bgG, bgB, profile) {
  const { distLimit, stepLimit, shadowLumDrop, chromaLimit } = profile;
  const nPx = w * h;
  const bgMask = new Uint8Array(nPx);
  const queue = new Int32Array(nPx);
  let head = 0;
  let tail = 0;

  const bgLum = Math.max(1, 0.299 * bgR + 0.587 * bgG + 0.114 * bgB);
  const bgRn = bgR / bgLum;
  const bgGn = bgG / bgLum;
  const bgBn = bgB / bgLum;

  const tryAccept = (p, fromP) => {
    if (bgMask[p]) return;
    const i = p * 4;
    if (d[i + 3] < 16) {
      bgMask[p] = 1;
      queue[tail++] = p;
      return;
    }
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];

    if (fromP >= 0) {
      const fi = fromP * 4;
      const stepDist = Math.hypot(r - d[fi], g - d[fi + 1], b - d[fi + 2]);
      if (stepDist > stepLimit) return;
    }

    const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
    if (dist <= distLimit) {
      bgMask[p] = 1;
      queue[tail++] = p;
      return;
    }

    if (shadowLumDrop > 0) {
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum >= bgLum - shadowLumDrop && lum <= bgLum + 14 && lum > 30) {
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        if (sat <= 26) {
          const chromaDist = Math.hypot(r / lum - bgRn, g / lum - bgGn, b / lum - bgBn);
          if (chromaDist <= chromaLimit) {
            bgMask[p] = 1;
            queue[tail++] = p;
          }
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

  // Measure central garment core invasion to protect white/ivory garments on bright studio paper
  const x0 = Math.floor(w * 0.35);
  const x1 = Math.ceil(w * 0.65);
  const y0 = Math.floor(h * 0.3);
  const y1 = Math.ceil(h * 0.7);
  let coreTotal = 0;
  let coreBg = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * w;
    for (let x = x0; x < x1; x++) {
      coreTotal++;
      if (bgMask[row + x]) coreBg++;
    }
  }
  const coreBgRatio = coreTotal > 0 ? coreBg / coreTotal : 0;

  return { bgMask, bgCount: tail, coreBgRatio };
}

function pruneForegroundSpeckles(bgMask, w, h, minIslandPx = 64) {
  const nPx = w * h;
  const visited = new Uint8Array(nPx);
  const stack = new Int32Array(nPx);
  const component = new Int32Array(nPx);
  let removed = 0;

  for (let start = 0; start < nPx; start++) {
    if (bgMask[start] || visited[start]) continue;
    let sp = 0;
    let compLen = 0;
    visited[start] = 1;
    stack[sp++] = start;

    while (sp > 0) {
      const p = stack[--sp];
      component[compLen++] = p;
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0) {
        const n = p - 1;
        if (!bgMask[n] && !visited[n]) {
          visited[n] = 1;
          stack[sp++] = n;
        }
      }
      if (x < w - 1) {
        const n = p + 1;
        if (!bgMask[n] && !visited[n]) {
          visited[n] = 1;
          stack[sp++] = n;
        }
      }
      if (y > 0) {
        const n = p - w;
        if (!bgMask[n] && !visited[n]) {
          visited[n] = 1;
          stack[sp++] = n;
        }
      }
      if (y < h - 1) {
        const n = p + w;
        if (!bgMask[n] && !visited[n]) {
          visited[n] = 1;
          stack[sp++] = n;
        }
      }
    }

    if (compLen < minIslandPx) {
      for (let k = 0; k < compLen; k++) {
        bgMask[component[k]] = 1;
      }
      removed += compLen;
    }
  }
  return removed;
}

const CUTOUT_PROFILES = [
  { distLimit: 24, stepLimit: 11.5, shadowLumDrop: 62, chromaLimit: 0.056 },
  { distLimit: 14, stepLimit: 6.2, shadowLumDrop: 20, chromaLimit: 0.026 },
  { distLimit: 9, stepLimit: 4.2, shadowLumDrop: 8, chromaLimit: 0.015 },
  { distLimit: 5.5, stepLimit: 2.8, shadowLumDrop: 0, chromaLimit: 0 },
];

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

        // Sample corner & edge blocks to measure studio paper background RGB
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
        const nativeHex = NATIVE_SEED_HEX[srcUrl];
        const nativeRgb = nativeHex ? hexToRgb(nativeHex) : null;
        const nativeLum = nativeRgb
          ? 0.299 * nativeRgb.r + 0.587 * nativeRgb.g + 0.114 * nativeRgb.b
          : 120;
        const startProfileIdx = nativeLum > 208 ? 1 : 0;

        let chosen = runBorderFloodFill(d, w, h, bgR, bgG, bgB, CUTOUT_PROFILES[startProfileIdx]);
        for (let pi = startProfileIdx + 1; pi < CUTOUT_PROFILES.length; pi++) {
          if (chosen.bgCount <= nPx * 0.84 && chosen.coreBgRatio <= 0.16) break;
          chosen = runBorderFloodFill(d, w, h, bgR, bgG, bgB, CUTOUT_PROFILES[pi]);
        }

        const bgMask = chosen.bgMask;
        let bgCount = chosen.bgCount;
        const applyAlphaCutout =
          bgCount > nPx * 0.04 && bgCount < nPx * 0.92 && chosen.coreBgRatio <= 0.28;
        if (applyAlphaCutout) {
          bgCount += pruneForegroundSpeckles(bgMask, w, h, 72);
        }

        const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

        // Pass 1: compute foreground weights, transparent studio background alpha & edge color decontamination
        let fgLumSum = 0;
        let fgWeightSum = 0;
        const masks = new Float32Array(nPx);
        for (let p = 0; p < nPx; p++) {
          const i = p * 4;
          let r = d[i];
          let g = d[i + 1];
          let b = d[i + 2];
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
            let bgNeighbors = 0;
            if (x > 0 && bgMask[p - 1]) bgNeighbors++;
            if (x < w - 1 && bgMask[p + 1]) bgNeighbors++;
            if (y > 0 && bgMask[p - w]) bgNeighbors++;
            if (y < h - 1 && bgMask[p + w]) bgNeighbors++;
            if (bgNeighbors > 0) {
              const featherLow = nativeLum > 208 ? 4 : 14;
              const featherHigh = nativeLum > 208 ? 18 : 44;
              edgeAlpha = smoothstep(featherLow, featherHigh, distBg);
              d[i + 3] = Math.round(d[i + 3] * edgeAlpha);
              // Decontaminate studio paper fringe on semi-transparent boundary pixels
              if (edgeAlpha > 0.08 && edgeAlpha < 0.94 && nativeLum <= 208) {
                const invA = 1 / Math.max(0.28, edgeAlpha);
                r = Math.max(0, Math.min(255, Math.round((r - bgR * (1 - edgeAlpha)) * invA)));
                g = Math.max(0, Math.min(255, Math.round((g - bgG * (1 - edgeAlpha)) * invA)));
                b = Math.max(0, Math.min(255, Math.round((b - bgB * (1 - edgeAlpha)) * invA)));
                d[i] = r;
                d[i + 1] = g;
                d[i + 2] = b;
              }
            }
          }

          const sat = Math.max(r, g, b) - Math.min(r, g, b);
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
