import { useMemo } from 'react';

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
  const cat = (typeof itemOrUrl === 'object' && itemOrUrl?.category) || category || 'top';
  const sub = (typeof itemOrUrl === 'object' && itemOrUrl?.subcategory) || subcategory || 'knit';

  if (
    !rawUrl ||
    rawUrl.startsWith('data:image/svg+xml') ||
    rawUrl === '/seed/store-terracotta-cardigan.jpg'
  ) {
    return STUDIO_SEED_BY_SUBCATEGORY[sub] || STUDIO_SEED_BY_CATEGORY[cat] || '/seed/cream-knit.jpg';
  }
  return rawUrl;
}

// Natural base color of existing non-neutral studio seed photos so we don't over-tint when matching
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
    return resolveStudioSeedUrl({ image_url: rawSrc, category: cat, subcategory: sub }, cat, sub);
  }, [rawSrc, cat, sub, allowStorePhoto]);

  const tintConfig = useMemo(() => {
    if (!targetHex || !resolvedSrc.startsWith('/seed/')) return null;
    if (
      resolvedSrc.includes('store-navy-sweater') ||
      resolvedSrc.includes('store-terracotta-cardigan')
    ) {
      return null;
    }
    const targetRgb = parseHexRgb(targetHex);
    const nativeHex = NATIVE_SEED_HEX[resolvedSrc];
    if (nativeHex) {
      const nativeRgb = parseHexRgb(nativeHex);
      if (rgbDist(targetRgb, nativeRgb) < 34) {
        return null; // Already matches the native packshot color
      }
    }

    const lum = (0.299 * targetRgb.r + 0.587 * targetRgb.g + 0.114 * targetRgb.b) / 255;
    const isStudioNeutral = resolvedSrc.startsWith('/seed/studio-');
    const opacity = isStudioNeutral
      ? lum < 0.25
        ? 0.62
        : lum > 0.85
          ? 0.22
          : 0.46
      : 0.34;

    return {
      hex: targetHex,
      opacity,
      blendMode: lum < 0.32 ? 'multiply' : 'color',
      brightness: lum < 0.22 ? 0.82 : lum > 0.86 ? 1.04 : 0.96,
    };
  }, [resolvedSrc, targetHex]);

  return (
    <div
      className={`studio-garment-image ${className}`.trim()}
      style={{
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-studio, #f6f4ef)',
        ...style,
      }}
    >
      <img
        src={resolvedSrc}
        alt={label}
        loading="lazy"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          filter: tintConfig ? `brightness(${tintConfig.brightness}) contrast(1.03)` : undefined,
          ...imgStyle,
        }}
      />
      {tintConfig && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: '6%',
            borderRadius: 'inherit',
            background: `radial-gradient(ellipse at 50% 48%, ${tintConfig.hex} 0%, ${tintConfig.hex}CC 56%, transparent 78%)`,
            mixBlendMode: tintConfig.blendMode,
            opacity: tintConfig.opacity,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}
