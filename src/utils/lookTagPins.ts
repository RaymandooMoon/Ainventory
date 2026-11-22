export interface GarmentLookTagPin {
  id: string;
  slotKey: string;
  garmentId: number | string;
  angleDeg: 0 | 180;
  xPct: number;
  yPct: number;
  categoryLabel: string;
  brand: string;
  name: string;
  productCode: string;
  priceText: string;
  materialText: string;
  thumbnailUrl: string;
}

const FRONT_ANCHORS: Record<string, { x: number; y: number; priority: number }> = {
  acc_head: { x: 50, y: 11, priority: 7 },
  acc_eye: { x: 50, y: 16, priority: 8 },
  acc_neck: { x: 50, y: 24, priority: 6 },
  outer: { x: 38, y: 35, priority: 1 },
  outer_mid: { x: 61, y: 36, priority: 3 },
  onepiece: { x: 50, y: 48, priority: 1 },
  top: { x: 52, y: 37, priority: 2 },
  top_mid: { x: 47, y: 42, priority: 4 },
  inner_top: { x: 50, y: 36, priority: 5 },
  accessory: { x: 68, y: 50, priority: 5 },
  acc_belt: { x: 50, y: 51, priority: 6 },
  bottom: { x: 48, y: 66, priority: 2 },
  underwear: { x: 50, y: 57, priority: 6 },
  socks: { x: 45, y: 84, priority: 7 },
  shoes: { x: 54, y: 90, priority: 2 },
};

const BACK_ANCHORS: Record<string, { x: number; y: number; priority: number }> = {
  acc_head: { x: 50, y: 12, priority: 6 },
  accessory: { x: 50, y: 36, priority: 1 }, // Backpack / crossbody strap on back
  outer: { x: 58, y: 38, priority: 2 },
  outer_mid: { x: 43, y: 40, priority: 3 },
  onepiece: { x: 50, y: 50, priority: 2 },
  top: { x: 46, y: 39, priority: 3 },
  bottom: { x: 50, y: 65, priority: 2 },
  shoes: { x: 53, y: 90, priority: 3 },
};

const SLOT_CATEGORY_LABELS: Record<string, { ko: string; en: string }> = {
  outer: { ko: '아우터', en: 'Outerwear' },
  outer_mid: { ko: '미드 아우터', en: 'Mid Outer' },
  top: { ko: '상의', en: 'Top' },
  top_mid: { ko: '미드 레이어', en: 'Mid Layer' },
  onepiece: { ko: '원피스', en: 'One-Piece' },
  bottom: { ko: '하의', en: 'Bottom' },
  shoes: { ko: '신발', en: 'Shoes' },
  accessory: { ko: '가방 · 소품', en: 'Bag' },
  acc_head: { ko: '모자', en: 'Headwear' },
  acc_neck: { ko: '스카프 · 넥', en: 'Neckwear' },
  acc_belt: { ko: '벨트', en: 'Belt' },
  acc_eye: { ko: '아이웨어', en: 'Eyewear' },
  inner_top: { ko: '이너', en: 'Inner' },
  underwear: { ko: '언더웨어', en: 'Underwear' },
  socks: { ko: '양말', en: 'Socks' },
};

function formatPriceKrw(rawPrice: unknown): string {
  const n = Number(rawPrice);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `₩${Math.round(n).toLocaleString('ko-KR')}`;
}

function resolveMaterialText(garment: Record<string, any>, lang = 'ko'): string {
  const comp = String(garment?.material_composition || '').trim();
  if (comp) return comp;
  const fabric = String(garment?.fabric || '').trim();
  if (fabric) return fabric;
  return lang === 'en' ? 'Material not set' : '소재 미입력';
}

function resolveProductCode(garment: Record<string, any>): string {
  return String(
    garment?.product_code || garment?.sku || garment?.style_code || ''
  ).trim();
}

/**
 * Generates non-overlapping garment hotspot pins strictly for 0° (Front) and 180° (Back) views.
 * Returns an empty array for all other rotation angles (45°, 90°, 135°, 225°, 270°, 315°).
 */
export function buildLookTagPins({
  slots,
  viewAngleDeg,
  lang = 'ko',
}: {
  slots: Record<string, any> | null | undefined;
  viewAngleDeg: number;
  lang?: string;
}): GarmentLookTagPin[] {
  const normalizedAngle = ((Math.round(Number(viewAngleDeg) || 0) % 360) + 360) % 360;
  if (normalizedAngle !== 0 && normalizedAngle !== 180) {
    return [];
  }
  const angleDeg: 0 | 180 = normalizedAngle === 180 ? 180 : 0;
  const anchorTable = angleDeg === 180 ? BACK_ANCHORS : FRONT_ANCHORS;

  const safeSlots = slots && typeof slots === 'object' ? slots : {};
  const seenGarmentIds = new Set<string>();
  const rawCandidates: Array<{
    slotKey: string;
    garment: Record<string, any>;
    x: number;
    y: number;
    priority: number;
  }> = [];

  for (const [slotKey, anchor] of Object.entries(anchorTable)) {
    const garment = safeSlots[slotKey];
    if (!garment || typeof garment !== 'object') continue;
    const gidKey = String(garment.id ?? `${slotKey}:${garment.name || ''}`);
    if (seenGarmentIds.has(gidKey)) continue;
    seenGarmentIds.add(gidKey);
    rawCandidates.push({
      slotKey,
      garment,
      x: anchor.x,
      y: anchor.y,
      priority: anchor.priority,
    });
  }

  // Sort by priority so primary garments hold their exact anatomical anchor first
  rawCandidates.sort((a, b) => a.priority - b.priority);

  // Collision avoidance: ensure minimum Euclidean distance >= 10% between pins
  const placed: Array<{ x: number; y: number }> = [];
  const MIN_DIST = 10;

  return rawCandidates.map((cand) => {
    let x = cand.x;
    let y = cand.y;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const collides = placed.some((pt) => Math.hypot(pt.x - x, pt.y - y) < MIN_DIST);
      if (!collides) break;
      const sign = attempt % 2 === 0 ? 1 : -1;
      const step = Math.ceil((attempt + 1) / 2);
      x = Math.max(18, Math.min(82, cand.x + sign * step * 9));
      y = Math.max(10, Math.min(92, cand.y + (attempt >= 3 ? 5 : 0)));
    }
    placed.push({ x, y });

    const catMeta = SLOT_CATEGORY_LABELS[cand.slotKey] || { ko: '아이템', en: 'Item' };
    const brand = String(cand.garment.brand || '').trim();
    const name =
      lang === 'en' && cand.garment.name_en
        ? String(cand.garment.name_en).trim()
        : String(cand.garment.name || '').trim();

    return {
      id: `${angleDeg}-${cand.slotKey}-${cand.garment.id ?? name}`,
      slotKey: cand.slotKey,
      garmentId: cand.garment.id ?? cand.slotKey,
      angleDeg,
      xPct: Number(x.toFixed(1)),
      yPct: Number(y.toFixed(1)),
      categoryLabel: lang === 'en' ? catMeta.en : catMeta.ko,
      brand: brand || (lang === 'en' ? 'Personal Archive' : '개인 소장'),
      name: name || (lang === 'en' ? 'Garment' : '의류'),
      productCode: resolveProductCode(cand.garment),
      priceText: formatPriceKrw(cand.garment.price ?? cand.garment.purchase_price),
      materialText: resolveMaterialText(cand.garment, lang),
      thumbnailUrl: String(
        cand.garment.image_url || cand.garment.front_image_url || ''
      ).trim(),
    };
  });
}
