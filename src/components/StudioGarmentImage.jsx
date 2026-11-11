import { useEffect, useMemo, useState } from 'react';

export const STUDIO_SEED_BY_SUBCATEGORY = {
  // outer
  trench: '/seed/beige-trench.jpg',
  blazer: '/seed/black-blazer.jpg',
  jacket: '/seed/olive-jacket.jpg',
  coat: '/seed/studio-coat.jpg',
  padding: '/seed/studio-padding.jpg',
  cardigan: '/seed/studio-cardigan.png',
  // top
  knit: '/seed/cream-knit.jpg',
  shirt: '/seed/white-shirt.jpg',
  blouse: '/seed/studio-blouse.jpg',
  tshirt: '/seed/studio-tshirt.jpg',
  sweatshirt: '/seed/studio-hoodie.jpg',
  hoodie: '/seed/studio-hoodie.jpg',
  // bottom
  slacks: '/seed/charcoal-slacks.jpg',
  denim: '/seed/indigo-denim.jpg',
  chinos: '/seed/studio-chinos.jpg',
  skirt: '/seed/studio-skirt.jpg',
  shorts: '/seed/studio-shorts.jpg',
  jogger: '/seed/studio-jogger.jpg',
  // dress
  dress: '/seed/studio-dress.jpg',
  onepiece: '/seed/studio-onepiece.jpg',
  jumpsuit: '/seed/studio-onepiece.jpg',
  // headwear
  beanie: '/seed/studio-beanie.jpg',
  cap: '/seed/studio-cap.jpg',
  beret: '/seed/studio-beret.jpg',
  bucket_hat: '/seed/studio-cap.jpg',
  hat: '/seed/studio-beret.jpg',
  // neckwear
  scarf: '/seed/studio-scarf.jpg',
  muffler: '/seed/studio-muffler.jpg',
  necktie: '/seed/studio-necktie.jpg',
  choker: '/seed/studio-scarf.jpg',
  // gloves
  gloves: '/seed/studio-gloves.jpg',
  knit_gloves: '/seed/studio-gloves.jpg',
  leather_gloves: '/seed/studio-leather-gloves.jpg',
  // underwear
  underwear: '/seed/studio-underwear.jpg',
  inner_top: '/seed/studio-inner-top.jpg',
  camisole: '/seed/studio-inner-top.jpg',
  // socks
  socks: '/seed/studio-socks.jpg',
  crew_socks: '/seed/studio-crew-socks.jpg',
  ankle_socks: '/seed/studio-socks.jpg',
  dress_socks: '/seed/studio-crew-socks.jpg',
  // shoes
  sneakers: '/seed/white-sneakers.jpg',
  loafers: '/seed/black-loafers.jpg',
  boots: '/seed/studio-boots.jpg',
  heels: '/seed/studio-heels.jpg',
  sandals: '/seed/white-sneakers.jpg',
  // accessory / bag
  briefcase: '/seed/studio-briefcase.jpg',
  tote: '/seed/studio-tote.jpg',
  bag: '/seed/studio-bag.jpg',
  watch: '/seed/studio-watch.jpg',
  belt: '/seed/studio-belt.jpg',
  glasses: '/seed/studio-glasses.jpg',
  jewelry: '/seed/studio-watch.jpg',
  accessory: '/seed/studio-bag.jpg',
};

export const STUDIO_SEED_BY_CATEGORY = {
  headwear: '/seed/studio-beanie.jpg',
  neckwear: '/seed/studio-scarf.jpg',
  outer: '/seed/beige-trench.jpg',
  top: '/seed/cream-knit.jpg',
  bottom: '/seed/charcoal-slacks.jpg',
  dress: '/seed/studio-dress.jpg',
  gloves: '/seed/studio-gloves.jpg',
  underwear: '/seed/studio-underwear.jpg',
  socks: '/seed/studio-socks.jpg',
  shoes: '/seed/white-sneakers.jpg',
  accessory: '/seed/studio-bag.jpg',
  bag: '/seed/studio-bag.jpg',
};

export function resolveStudioSeedUrl(itemOrUrl, category = 'top', subcategory = 'knit') {
  const rawUrl = typeof itemOrUrl === 'string' ? itemOrUrl : itemOrUrl?.image_url || '';
  const name = (typeof itemOrUrl === 'object' && itemOrUrl?.name) || '';
  const cat = (typeof itemOrUrl === 'object' && itemOrUrl?.category) || category || 'top';
  let sub = (typeof itemOrUrl === 'object' && itemOrUrl?.subcategory) || subcategory || 'knit';

  if (sub === 'bag' && name) {
    if (/서류가방|브리프케이스|briefcase/i.test(name)) sub = 'briefcase';
    else if (/토트|쇼퍼|tote/i.test(name)) sub = 'tote';
  }

  if (
    !rawUrl ||
    rawUrl.startsWith('data:image/svg+xml') ||
    rawUrl === '/seed/store-terracotta-cardigan.jpg' ||
    (rawUrl === '/seed/studio-bag.jpg' && (sub === 'briefcase' || sub === 'tote'))
  ) {
    return STUDIO_SEED_BY_SUBCATEGORY[sub] || STUDIO_SEED_BY_CATEGORY[cat] || '/seed/cream-knit.jpg';
  }
  return rawUrl;
}

// Natural base color of studio packshot photos so matching items stay 100% raw photographic
const NATIVE_SEED_HEX = {
  '/seed/beige-trench.jpg': '#C4B193',
  '/seed/black-blazer.jpg': '#1E1F22',
  '/seed/black-loafers.jpg': '#1A1A1C',
  '/seed/charcoal-slacks.jpg': '#35383E',
  '/seed/cream-knit.jpg': '#DDD3C2',
  '/seed/indigo-denim.jpg': '#284064',
  '/seed/navy-knit.jpg': '#1C2538',
  '/seed/olive-jacket.jpg': '#7D836D',
  '/seed/white-shirt.jpg': '#F2F1EC',
  '/seed/white-sneakers.jpg': '#EAE7E1',
  '/seed/studio-coat.jpg': '#BA9163',
  '/seed/studio-padding.jpg': '#DCD8CE',
  '/seed/studio-hoodie.jpg': '#BEBDB8',
  '/seed/studio-tshirt.jpg': '#EFECE6',
  '/seed/studio-blouse.jpg': '#ECE5DA',
  '/seed/studio-skirt.jpg': '#C6B79F',
  '/seed/studio-dress.jpg': '#C9BA9E',
  '/seed/studio-onepiece.jpg': '#C9BA9E',
  '/seed/studio-chinos.jpg': '#C2B194',
  '/seed/studio-jogger.jpg': '#C2B194',
  '/seed/studio-shorts.jpg': '#CFC6B6',
  '/seed/studio-beanie.jpg': '#B8B1A6',
  '/seed/studio-cap.jpg': '#CBC2B2',
  '/seed/studio-beret.jpg': '#353433',
  '/seed/studio-scarf.jpg': '#CBBBA4',
  '/seed/studio-muffler.jpg': '#CBBBA4',
  '/seed/studio-necktie.jpg': '#233149',
  '/seed/studio-leather-gloves.jpg': '#242120',
  '/seed/studio-gloves.jpg': '#A99F91',
  '/seed/studio-crew-socks.jpg': '#CFC9BE',
  '/seed/studio-socks.jpg': '#EAE7E1',
  '/seed/studio-inner-top.jpg': '#EBE8E1',
  '/seed/studio-underwear.jpg': '#DAD6CE',
  '/seed/studio-boots.jpg': '#211E1D',
  '/seed/studio-heels.jpg': '#CCB89E',
  '/seed/studio-briefcase.jpg': '#5A3A27',
  '/seed/studio-tote.jpg': '#C3AE93',
  '/seed/studio-bag.jpg': '#9C6B43',
  '/seed/studio-watch.jpg': '#4A3528',
  '/seed/studio-belt.jpg': '#362720',
  '/seed/studio-glasses.jpg': '#4A3222',
};

function parseHexRgb(hex) {
  const clean = String(hex || '#CCCCCC').replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return { r: 204, g: 204, b: 204 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbDist(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Cached garment-only per-pixel studio packshot recolorizer (keeps #F4F1EA background 100% spotless)
const TINTED_URL_CACHE = new Map();
const PENDING_TINTS = new Map();

function getGarmentTintedPackshot(srcUrl, targetHex) {
  const key = `${srcUrl}|${targetHex.toUpperCase()}`;
  if (TINTED_URL_CACHE.has(key)) {
    return Promise.resolve(TINTED_URL_CACHE.get(key));
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
    img.onload = () => {
      try {
        const maxSide = 360;
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        const w = Math.max(64, Math.round((img.naturalWidth || 300) * scale));
        const h = Math.max(64, Math.round((img.naturalHeight || 400) * scale));
        const canvas = document.createElement('canvas');
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
        let bgCount = 0;
        const samplePts = [
          [2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3],
          [Math.floor(w * 0.5), 2], [Math.floor(w * 0.5), h - 3],
        ];
        for (const [sx, sy] of samplePts) {
          const idx = (sy * w + sx) * 4;
          bgR += d[idx];
          bgG += d[idx + 1];
          bgB += d[idx + 2];
          bgCount++;
        }
        bgR /= bgCount;
        bgG /= bgCount;
        bgB /= bgCount;

        // Pass 1: compute mean luminance of foreground garment pixels
        let fgLumSum = 0;
        let fgWeightSum = 0;
        const nPx = w * h;
        const masks = new Float32Array(nPx);
        for (let p = 0; p < nPx; p++) {
          const i = p * 4;
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const distBg = Math.hypot(r - bgR, g - bgG, b - bgB);
          // Also detect soft drop-shadow on paper (slightly darker neutral pixel near bg hue)
          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
          const isPaperOrSoftShadow = sat < 14 && lum > bgLum - 32 && distBg < 36;
          const m = isPaperOrSoftShadow ? 0 : smoothstep(16, 42, distBg);
          masks[p] = m;
          if (m > 0.35) {
            fgLumSum += lum * m;
            fgWeightSum += m;
          }
        }

        if (fgWeightSum < 40) {
          TINTED_URL_CACHE.set(key, srcUrl);
          resolve(srcUrl);
          return;
        }

        const meanFgLum = Math.max(42, Math.min(215, fgLumSum / fgWeightSum));
        const tgt = parseHexRgb(targetHex);
        const tgtLum = 0.299 * tgt.r + 0.587 * tgt.g + 0.114 * tgt.b;

        // Pass 2: re-shade only garment pixels, preserving grain, seams, folds & metallic glints
        for (let p = 0; p < nPx; p++) {
          const m = masks[p];
          if (m <= 0.01) continue;
          const i = p * 4;
          const r = d[i];
          const g = d[i + 1];
          const b = d[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const sat = Math.max(r, g, b) - Math.min(r, g, b);

          // Protect metallic hardware speculars (bright neutral glints on clasps/watch/buckles)
          const metalSpecularProtect = sat < 18 && lum > 205 ? smoothstep(205, 242, lum) * 0.75 : 0;
          const blend = m * (1 - metalSpecularProtect) * 0.88;

          // Normalized shading ratio with contrast preservation for dark & light garments
          const shadeRatio = Math.pow(Math.max(0.08, lum / meanFgLum), tgtLum < 55 ? 0.85 : 0.95);
          const specLift = Math.max(0, (lum - meanFgLum * 1.18) * 0.32);

          const nr = Math.min(255, Math.max(0, tgt.r * shadeRatio + specLift));
          const ng = Math.min(255, Math.max(0, tgt.g * shadeRatio + specLift));
          const nb = Math.min(255, Math.max(0, tgt.b * shadeRatio + specLift));

          d[i] = Math.round(r * (1 - blend) + nr * blend);
          d[i + 1] = Math.round(g * (1 - blend) + ng * blend);
          d[i + 2] = Math.round(b * (1 - blend) + nb * blend);
        }

        ctx.putImageData(imgData, 0, 0);
        const outUrl = canvas.toDataURL('image/jpeg', 0.9);
        if (TINTED_URL_CACHE.size > 160) {
          const oldest = TINTED_URL_CACHE.keys().next().value;
          TINTED_URL_CACHE.delete(oldest);
        }
        TINTED_URL_CACHE.set(key, outUrl);
        resolve(outUrl);
      } catch {
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

export default function StudioGarmentImage({
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

  const resolvedSrc = useMemo(() => {
    if (allowStorePhoto && rawSrc && !rawSrc.startsWith('data:image/svg+xml')) {
      return rawSrc;
    }
    return resolveStudioSeedUrl(
      { image_url: rawSrc, category: cat, subcategory: sub, name: item?.name },
      cat,
      sub
    );
  }, [rawSrc, cat, sub, item?.name, allowStorePhoto]);

  const shouldTintSeed = useMemo(() => {
    if (!targetHex || !resolvedSrc.startsWith('/seed/')) return false;
    if (
      resolvedSrc.includes('store-navy-sweater') ||
      resolvedSrc.includes('store-terracotta-cardigan')
    ) {
      return false;
    }
    const nativeHex = NATIVE_SEED_HEX[resolvedSrc];
    if (nativeHex) {
      if (rgbDist(parseHexRgb(targetHex), parseHexRgb(nativeHex)) < 40) {
        return false;
      }
    }
    return true;
  }, [resolvedSrc, targetHex]);

  const [displaySrc, setDisplaySrc] = useState(() => {
    if (!shouldTintSeed) return resolvedSrc;
    const cached = TINTED_URL_CACHE.get(`${resolvedSrc}|${targetHex.toUpperCase()}`);
    return cached || resolvedSrc;
  });

  useEffect(() => {
    let cancelled = false;
    if (!shouldTintSeed) {
      setDisplaySrc(resolvedSrc);
      return () => {
        cancelled = true;
      };
    }
    const cached = TINTED_URL_CACHE.get(`${resolvedSrc}|${targetHex.toUpperCase()}`);
    if (cached) {
      setDisplaySrc(cached);
      return () => {
        cancelled = true;
      };
    }
    setDisplaySrc(resolvedSrc);
    getGarmentTintedPackshot(resolvedSrc, targetHex).then((tinted) => {
      if (!cancelled) setDisplaySrc(tinted);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedSrc, targetHex, shouldTintSeed]);

  const [loadedSrc, setLoadedSrc] = useState(null);
  const isReady =
    loadedSrc === displaySrc || Boolean(displaySrc && displaySrc.startsWith('data:'));

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
        onLoad={() => setLoadedSrc(displaySrc)}
        onError={() => setLoadedSrc(displaySrc)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          opacity: isReady ? 1 : 0,
          transition: 'opacity 0.28s var(--spring-ease)',
          ...imgStyle,
        }}
      />
    </div>
  );
}
