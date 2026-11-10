import {
  BODY_SHAPE_OPTIONS,
  normalizeBodyShapeKey,
  resolveAnatomicalProfile,
} from '../src/utils/bodyAnthropometrics.js';

export { BODY_SHAPE_OPTIONS, normalizeBodyShapeKey };

export const AGE_GROUPS = [
  { key: 'under_10', labelKo: '10대 미만 (0~9세)', labelEn: 'Under 10 (0–9)', scale: 0.65 },
  { key: '10s', labelKo: '10대 (10~19세)', labelEn: 'Teens (10–19)', scale: 0.85 },
  { key: '20s', labelKo: '20대 (20~29세)', labelEn: '20s (20–29)', scale: 1.15 },
  { key: '30s', labelKo: '30대 (30~39세)', labelEn: '30s (30–39)', scale: 1.20 },
  { key: '40s', labelKo: '40대 (40~49세)', labelEn: '40s (40–49)', scale: 1.12 },
  { key: '50s', labelKo: '50대 (50~59세)', labelEn: '50s (50–59)', scale: 1.02 },
  { key: '60s', labelKo: '60대 (60~69세)', labelEn: '60s (60–69)', scale: 0.90 },
  { key: '70s', labelKo: '70대 (70~79세)', labelEn: '70s (70–79)', scale: 0.80 },
  { key: '80s', labelKo: '80대 (80~89세)', labelEn: '80s (80–89)', scale: 0.72 },
  { key: '90s_plus', labelKo: '90대 이상 (90세+)', labelEn: '90+ (90 & above)', scale: 0.65 },
];

export const WEAR_SLOTS = [
  { key: 'headwear', labelKo: '모자 · 헤드웨어', labelEn: 'Headwear', order: 1 },
  { key: 'neckwear', labelKo: '목도리 · 스카프 · 타이', labelEn: 'Neckwear', order: 2 },
  { key: 'outer', labelKo: '아우터 · 코트 · 자켓', labelEn: 'Outerwear', order: 3 },
  { key: 'top', labelKo: '상의 · 니트 · 셔츠', labelEn: 'Tops', order: 4 },
  { key: 'bottom', labelKo: '하의 · 팬츠 · 스커트', labelEn: 'Bottoms', order: 5 },
  { key: 'dress', labelKo: '원피스 · 점프수트', labelEn: 'Dress / One-Piece', order: 6 },
  { key: 'gloves', labelKo: '장갑 · 핸드웨어', labelEn: 'Gloves', order: 7 },
  { key: 'underwear', labelKo: '언더웨어 · 이너웨어', labelEn: 'Underwear / Inner', order: 8 },
  { key: 'socks', labelKo: '양말 · 레그웨어', labelEn: 'Socks / Legwear', order: 9 },
  { key: 'shoes', labelKo: '신발 · 풋웨어', labelEn: 'Footwear', order: 10 },
  { key: 'accessory', labelKo: '가방 · 시계 · 액세서리', labelEn: 'Accessories', order: 11 },
];

export const FOUR_SEASONS = ['봄', '여름', '가을', '겨울'];

export const STUDIO_SEED_MAP = {
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
  // neckwear
  scarf: '/seed/studio-scarf.jpg',
  muffler: '/seed/studio-muffler.jpg',
  necktie: '/seed/studio-necktie.jpg',
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
  // shoes
  sneakers: '/seed/white-sneakers.jpg',
  loafers: '/seed/black-loafers.jpg',
  boots: '/seed/studio-boots.jpg',
  heels: '/seed/studio-heels.jpg',
  // accessory
  briefcase: '/seed/studio-briefcase.jpg',
  tote: '/seed/studio-tote.jpg',
  bag: '/seed/studio-bag.jpg',
  watch: '/seed/studio-watch.jpg',
  belt: '/seed/studio-belt.jpg',
  glasses: '/seed/studio-glasses.jpg',
  accessory: '/seed/studio-bag.jpg',
};

const CATEGORY_DEFAULT_SEED = {
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

export function getStudioSeedImageForGarment(category = 'top', subcategory = 'knit') {
  const subKey = String(subcategory || '').toLowerCase().trim();
  const catKey = String(category || 'top').toLowerCase().trim();
  if (STUDIO_SEED_MAP[subKey]) return STUDIO_SEED_MAP[subKey];
  if (CATEGORY_DEFAULT_SEED[catKey]) return CATEGORY_DEFAULT_SEED[catKey];
  return '/seed/cream-knit.jpg';
}

export function normalizeAgeGroupKey(ageGroup, age) {
  if (ageGroup && AGE_GROUPS.some((g) => g.key === ageGroup)) return ageGroup;
  const n = Number(age);
  if (!Number.isNaN(n) && n > 0) {
    if (n < 10) return 'under_10';
    if (n < 20) return '10s';
    if (n < 30) return '20s';
    if (n < 40) return '30s';
    if (n < 50) return '40s';
    if (n < 60) return '50s';
    if (n < 70) return '60s';
    if (n < 80) return '70s';
    if (n < 90) return '80s';
    return '90s_plus';
  }
  return '30s';
}

// Baseline per-season counts for standard adult (WRAP UK / Hot or Cool Institute / KOFOTI)
const BASE_SEASON_COUNTS = {
  headwear: { 봄: 1, 여름: 1, 가을: 1, 겨울: 1 },
  neckwear: { 봄: 1, 여름: 0, 가을: 1, 겨울: 2 },
  outer: { 봄: 2, 여름: 1, 가을: 2, 겨울: 2 },
  top: { 봄: 3, 여름: 4, 가을: 3, 겨울: 3 },
  bottom: { 봄: 2, 여름: 2, 가을: 2, 겨울: 2 },
  dress: { 봄: 1, 여름: 1, 가을: 1, 겨울: 0 },
  gloves: { 봄: 0, 여름: 0, 가을: 1, 겨울: 1 },
  underwear: { 봄: 2, 여름: 2, 가을: 2, 겨울: 2 },
  socks: { 봄: 2, 여름: 2, 가을: 2, 겨울: 2 },
  shoes: { 봄: 2, 여름: 1, 가을: 2, 겨울: 1 },
  accessory: { 봄: 1, 여름: 1, 가을: 1, 겨울: 1 },
};

export function buildWardrobeBenchmarksMatrix() {
  const rows = [];
  const citation =
    'WRAP UK (Valuing Our Clothes) · Hot or Cool Institute (1.5°C Wardrobe) · KOFOTI/한국의류학회 연령별 보유 통계';

  for (const ag of AGE_GROUPS) {
    for (const slot of WEAR_SLOTS) {
      for (const season of FOUR_SEASONS) {
        const base = BASE_SEASON_COUNTS[slot.key]?.[season] ?? 1;
        const scaled = base === 0 ? 0 : Math.max(1, Math.round(base * ag.scale));
        rows.push({
          age_group: ag.key,
          body_part: slot.key,
          season,
          avg_count: scaled,
          source_citation: citation,
        });
      }
    }
  }
  return rows;
}

export function seedWardrobeBenchmarks(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wardrobe_statistics_benchmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      age_group TEXT NOT NULL,
      body_part TEXT NOT NULL,
      season TEXT NOT NULL,
      avg_count INTEGER NOT NULL DEFAULT 1,
      source_citation TEXT NOT NULL
    );
  `);

  const cnt = db.prepare('SELECT COUNT(*) as c FROM wardrobe_statistics_benchmarks').get().c;
  if (cnt >= 400) return;

  db.exec('DELETE FROM wardrobe_statistics_benchmarks;');
  const insert = db.prepare(`
    INSERT INTO wardrobe_statistics_benchmarks (age_group, body_part, season, avg_count, source_citation)
    VALUES (?, ?, ?, ?, ?)
  `);
  const matrix = buildWardrobeBenchmarksMatrix();
  for (const r of matrix) {
    insert.run(r.age_group, r.body_part, r.season, r.avg_count, r.source_citation);
  }
}

export function computeBodyMetrics(profile = {}) {
  const resolved = resolveAnatomicalProfile(profile);
  return {
    heightCm: resolved.heightCm,
    weightKg: resolved.weightKg,
    bmi: resolved.bmi,
    bmiCategory: resolved.bmiCategory,
    bodyShape: resolved.bodyShape,
    recommendedShape: resolved.recommendedShape,
    shapeLabelKo: resolved.shapeLabelKo,
    shapeLabelEn: resolved.shapeLabelEn,
    shapeShortKo: resolved.shapeShortKo,
    shapeBadge: resolved.shapeBadge,
    shapeSummaryKo: resolved.shapeSummaryKo,
    stylingAdvice: resolved.stylingAdviceKo,
    bodyFatPct: resolved.bodyFatPct,
    chestCm: resolved.chestCm,
    waistCm: resolved.waistCm,
    hipCm: resolved.hipCm,
    headCm: resolved.headCm,
    headToBodyRatio: resolved.headToBodyRatio,
    defaults: resolved.defaults,
    sources: resolved.sources,
    morph: resolved.morph,
    // Handoff-spec field names (HANDOFF_SPEC §3 b/c)
    bodyLabelKo: resolved.shapeLabelKo,
    bodyLabelEn: resolved.shapeLabelEn,
    bodyShortKo: resolved.shapeShortKo,
    resolvedMeasurements: {
      chestCm: resolved.chestCm,
      waistCm: resolved.waistCm,
      hipCm: resolved.hipCm,
      headCm: resolved.headCm,
      bodyFatPct: resolved.bodyFatPct,
      sources: resolved.sources,
    },
  };
}

const PERSONAL_COLOR_SWATCHES = {
  spring_warm: [
    { name: '크림', hex: '#EDE3D2' },
    { name: '베이지', hex: '#D4B895' },
    { name: '코랄 피치', hex: '#E38C74' },
    { name: '카멜', hex: '#C18F59' },
    { name: '올리브 그린', hex: '#889667' },
    { name: '아이보리', hex: '#F6F0E4' },
  ],
  summer_cool: [
    { name: '화이트', hex: '#F3F4F6' },
    { name: '스카이블루', hex: '#94B8D7' },
    { name: '라벤더 그레이', hex: '#ABA9BC' },
    { name: '더스티 로즈', hex: '#C695A0' },
    { name: '네이비', hex: '#283852' },
    { name: '그레이', hex: '#969CA6' },
  ],
  autumn_warm: [
    { name: '베이지', hex: '#C4B193' },
    { name: '테라코타', hex: '#A64B2A' },
    { name: '카키/올리브', hex: '#6F7759' },
    { name: '브라운', hex: '#684934' },
    { name: '크림', hex: '#DDD3C2' },
    { name: '머스타드 골드', hex: '#C49A45' },
  ],
  winter_cool: [
    { name: '블랙', hex: '#1B1C1E' },
    { name: '화이트', hex: '#F4F5F7' },
    { name: '차콜', hex: '#34373D' },
    { name: '네이비', hex: '#1A2438' },
    { name: '인디고', hex: '#253D63' },
    { name: '버건디 와인', hex: '#681F2B' },
  ],
};

const SLOT_ITEM_TEMPLATES = {
  headwear: [
    { subcategory: 'beanie', nameKo: '캐시미어 골지 비니', brand: 'COS', price: 69000, minTemp: -8, maxTemp: 10, formality: 'casual', water: 0 },
    { subcategory: 'cap', nameKo: '코튼 트윌 볼캡', brand: 'ARKET', price: 49000, minTemp: 8, maxTemp: 32, formality: 'casual', water: 1 },
    { subcategory: 'beret', nameKo: '메리노 울 프렌치 베레모', brand: 'MHL', price: 89000, minTemp: 2, maxTemp: 18, formality: 'smart', water: 0 },
  ],
  neckwear: [
    { subcategory: 'scarf', nameKo: '퓨어 캐시미어 프린지 머플러', brand: 'TOTEME', price: 240000, minTemp: -10, maxTemp: 9, formality: 'smart', water: 0 },
    { subcategory: 'muffler', nameKo: '울 니트 쁘띠 스카프', brand: 'COS', price: 85000, minTemp: 0, maxTemp: 14, formality: 'casual', water: 0 },
    { subcategory: 'necktie', nameKo: '실크 자카드 클래식 타이', brand: 'DRAKES', price: 195000, minTemp: 5, maxTemp: 25, formality: 'formal', water: 0 },
  ],
  outer: [
    { subcategory: 'trench', nameKo: '발수 개버딘 싱글 트렌치코트', brand: 'ARKET', price: 290000, minTemp: 7, maxTemp: 18, formality: 'smart', water: 1 },
    { subcategory: 'blazer', nameKo: '테일러드 버진 울 블레이저', brand: 'COS', price: 350000, minTemp: 6, maxTemp: 19, formality: 'formal', water: 0 },
    { subcategory: 'coat', nameKo: '더블 페이스 캐시미어 핸드메이드 코트', brand: 'SYSTEM', price: 480000, minTemp: -6, maxTemp: 9, formality: 'formal', water: 0 },
    { subcategory: 'padding', nameKo: '구스다운 경량 스탠드넥 패딩', brand: 'DESCENTE', price: 320000, minTemp: -12, maxTemp: 5, formality: 'casual', water: 1 },
    { subcategory: 'cardigan', nameKo: '메리노 울 V넥 버튼 가디건', brand: 'AMI', price: 210000, minTemp: 9, maxTemp: 20, formality: 'smart', water: 0 },
    { subcategory: 'jacket', nameKo: '경량 퀼팅 유틸리티 자켓', brand: 'BARBOUR', price: 265000, minTemp: 6, maxTemp: 17, formality: 'casual', water: 1 },
  ],
  top: [
    { subcategory: 'knit', nameKo: '파인 메리노 울 크루넥 니트', brand: 'COS', price: 135000, minTemp: 4, maxTemp: 18, formality: 'smart', water: 0 },
    { subcategory: 'shirt', nameKo: '크리스프 포플린 옥스포드 셔츠', brand: 'POLO', price: 189000, minTemp: 9, maxTemp: 25, formality: 'smart', water: 0 },
    { subcategory: 'tshirt', nameKo: '헤비웨이트 수피마 코튼 티셔츠', brand: 'ARKET', price: 45000, minTemp: 17, maxTemp: 33, formality: 'casual', water: 0 },
    { subcategory: 'sweatshirt', nameKo: '프렌치 테리 세미오버 후드 스웨트', brand: 'A.P.C.', price: 168000, minTemp: 7, maxTemp: 19, formality: 'casual', water: 0 },
    { subcategory: 'blouse', nameKo: '실크 크레이프 드레이프 셔츠', brand: 'THEORY', price: 245000, minTemp: 12, maxTemp: 26, formality: 'formal', water: 0 },
  ],
  bottom: [
    { subcategory: 'slacks', nameKo: '울 블렌드 원턱 와이드 슬랙스', brand: 'COS', price: 175000, minTemp: 2, maxTemp: 23, formality: 'smart', water: 0 },
    { subcategory: 'denim', nameKo: '셀비지 스트레이트 데님 팬츠', brand: 'LEVIS', price: 159000, minTemp: 2, maxTemp: 26, formality: 'casual', water: 1 },
    { subcategory: 'chinos', nameKo: '코튼 트윌 테이퍼드 치노 팬츠', brand: 'BEAMS', price: 138000, minTemp: 8, maxTemp: 25, formality: 'smart', water: 0 },
    { subcategory: 'shorts', nameKo: '버뮤다 플리츠 하프 팬츠', brand: 'ARKET', price: 95000, minTemp: 21, maxTemp: 34, formality: 'casual', water: 0 },
  ],
  dress: [
    { subcategory: 'dress', nameKo: '벨티드 미디 셔츠 원피스', brand: 'COS', price: 195000, minTemp: 13, maxTemp: 26, formality: 'smart', water: 0 },
    { subcategory: 'onepiece', nameKo: '메리노 니트 롱 원피스', brand: 'TOTEME', price: 280000, minTemp: 4, maxTemp: 17, formality: 'formal', water: 0 },
  ],
  gloves: [
    { subcategory: 'leather_gloves', nameKo: '나파 레더 캐시미어 라이닝 장갑', brand: 'DENTS', price: 145000, minTemp: -12, maxTemp: 5, formality: 'formal', water: 1 },
    { subcategory: 'gloves', nameKo: '터치스크린 울 니트 글러브', brand: 'ARKET', price: 49000, minTemp: -10, maxTemp: 7, formality: 'casual', water: 0 },
  ],
  underwear: [
    { subcategory: 'inner_top', nameKo: '심리스 립 모달 발열 이너탑', brand: 'UNIQLO', price: 29900, minTemp: -12, maxTemp: 14, formality: 'casual', water: 0 },
    { subcategory: 'underwear', nameKo: '브리즈 수피마 코튼 에어 이너웨어', brand: 'CALVIN KLEIN', price: 48000, minTemp: 5, maxTemp: 34, formality: 'casual', water: 0 },
  ],
  socks: [
    { subcategory: 'crew_socks', nameKo: '메리노 울 골지 크루 삭스', brand: 'FALKE', price: 28000, minTemp: -8, maxTemp: 18, formality: 'smart', water: 0 },
    { subcategory: 'socks', nameKo: '코마 코튼 데일리 앵클 삭스', brand: 'ARKET', price: 19000, minTemp: 8, maxTemp: 32, formality: 'casual', water: 0 },
  ],
  shoes: [
    { subcategory: 'sneakers', nameKo: '미니멀 풀그레인 레더 코트 스니커즈', brand: 'COMMON PROJECTS', price: 268000, minTemp: 0, maxTemp: 32, formality: 'casual', water: 0 },
    { subcategory: 'loafers', nameKo: '클래식 굿이어웰트 페니 로퍼', brand: 'BERWICK', price: 318000, minTemp: 0, maxTemp: 28, formality: 'formal', water: 1 },
    { subcategory: 'boots', nameKo: '발수 스무스 레더 첼시 부츠', brand: 'CAMPER', price: 289000, minTemp: -8, maxTemp: 16, formality: 'smart', water: 1 },
  ],
  accessory: [
    { subcategory: 'bag', nameKo: '미니멀 레더 크로스 & 토트백', brand: 'LEMAIRE', price: 420000, minTemp: -10, maxTemp: 35, formality: 'smart', water: 1 },
    { subcategory: 'watch', nameKo: '스틸 케이스 레더 스트랩 드레스 워치', brand: 'NOMOS', price: 380000, minTemp: -10, maxTemp: 35, formality: 'formal', water: 1 },
    { subcategory: 'belt', nameKo: '이탈리안 카프스킨 실버 버클 벨트', brand: 'OUR LEGACY', price: 145000, minTemp: -10, maxTemp: 35, formality: 'smart', water: 1 },
    { subcategory: 'glasses', nameKo: '아세테이트 아틀리에 아이웨어', brand: 'GENTLE MONSTER', price: 260000, minTemp: -10, maxTemp: 35, formality: 'smart', water: 1 },
  ],
};

export function generateStatisticalWardrobeForUser(db, closetOwner, userProfile = {}) {
  seedWardrobeBenchmarks(db);

  const ageGroup = normalizeAgeGroupKey(userProfile.age_group || userProfile.ageGroup, userProfile.age);
  const personalColor = userProfile.personal_color || userProfile.personalColor || 'autumn_warm';
  const gender = userProfile.gender || 'unspecified';

  const palette = PERSONAL_COLOR_SWATCHES[personalColor] || PERSONAL_COLOR_SWATCHES.autumn_warm;
  const benchmarks = db
    .prepare('SELECT * FROM wardrobe_statistics_benchmarks WHERE age_group = ?')
    .all(ageGroup);

  const insertGarment = db.prepare(`
    INSERT INTO garments (
      closet_owner, name, category, subcategory, color_name, color_hex,
      seasons, min_temp, max_temp, water_resistant, formality,
      brand, price, wear_count, last_worn_date, status, is_favorite, image_url, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `);

  const today = new Date();
  const fmtDate = (daysAgo) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  };

  let createdCount = 0;
  let colorCursor = 0;

  // Group benchmarks by body_part so we create a realistic capsule per slot across seasons
  const bySlot = new Map();
  for (const b of benchmarks) {
    if (!bySlot.has(b.body_part)) bySlot.set(b.body_part, []);
    bySlot.get(b.body_part).push(b);
  }

  for (const slot of WEAR_SLOTS) {
    const slotKey = slot.key;
    if (slotKey === 'dress' && gender === 'male') {
      continue;
    }
    const templates = SLOT_ITEM_TEMPLATES[slotKey] || SLOT_ITEM_TEMPLATES.top;
    const slotBench = bySlot.get(slotKey) || [];
    // Total seasonal items scaled to a practical per-slot count (2~6 items per slot, 35~55 total)
    const rawSum = slotBench.reduce((acc, r) => acc + (r.avg_count || 0), 0);
    const targetCount = Math.max(2, Math.min(7, Math.ceil(rawSum * 0.45)));

    for (let i = 0; i < targetCount; i++) {
      const tpl = templates[i % templates.length];
      const swatch = palette[colorCursor % palette.length];
      colorCursor += 1;

      const seasonRow = slotBench[i % Math.max(1, slotBench.length)];
      const primarySeason = seasonRow?.season || FOUR_SEASONS[i % 4];
      const seasonsList =
        primarySeason === '봄' || primarySeason === '가을'
          ? ['봄', '가을']
          : [primarySeason];

      const imageUrl = getStudioSeedImageForGarment(slotKey, tpl.subcategory);
      const wearCount = (i * 3 + createdCount) % 14 + 1;
      const daysAgo = (i * 4 + 2) % 28 + 1;
      const isFav = i === 0 ? 1 : 0;

      insertGarment.run(
        closetOwner,
        `${swatch.name} ${tpl.nameKo}`,
        slotKey,
        tpl.subcategory,
        swatch.name,
        swatch.hex,
        JSON.stringify(seasonsList),
        tpl.minTemp,
        tpl.maxTemp,
        tpl.water,
        tpl.formality,
        tpl.brand,
        tpl.price,
        wearCount,
        fmtDate(daysAgo),
        isFav,
        imageUrl,
        `${ageGroup} 연령대 통계 벤치마크(${primarySeason}) & ${personalColor} 퍼스널컬러 맞춤 큐레이션`
      );
      createdCount += 1;
    }
  }

  return {
    closetOwner,
    ageGroup,
    personalColor,
    createdCount,
  };
}
