/**
 * Shared Garment Metadata & Taxonomy Options
 * Used across AddGarmentModal, ItemDetailSheet, and server validation/prompting.
 */

export const GARMENT_COLOR_SWATCHES = Object.freeze([
  { nameKo: '블랙', nameEn: 'Black', hex: '#1D1D1F' },
  { nameKo: '차콜', nameEn: 'Charcoal', hex: '#3B3D42' },
  { nameKo: '다크 브라운', nameEn: 'Dark Brown', hex: '#4A3628' },
  { nameKo: '브라운', nameEn: 'Brown', hex: '#735139' },
  { nameKo: '카멜', nameEn: 'Camel', hex: '#B5895A' },
  { nameKo: '베이지', nameEn: 'Beige', hex: '#D4C4AE' },
  { nameKo: '아이보리', nameEn: 'Ivory', hex: '#EFECE6' },
  { nameKo: '화이트', nameEn: 'White', hex: '#F7F7F7' },
  { nameKo: '그레이', nameEn: 'Gray', hex: '#8E9198' },
  { nameKo: '네이비', nameEn: 'Navy', hex: '#1E2C47' },
  { nameKo: '블루', nameEn: 'Blue', hex: '#4B6F99' },
  { nameKo: '카키/올리브', nameEn: 'Khaki / Olive', hex: '#636B52' },
  { nameKo: '그린', nameEn: 'Green', hex: '#2E5440' },
  { nameKo: '버건디', nameEn: 'Burgundy', hex: '#6B2430' },
  { nameKo: '핑크', nameEn: 'Pink', hex: '#D4A5B0' },
  { nameKo: '옐로우', nameEn: 'Yellow', hex: '#D9B65B' },
]);

export const GARMENT_MATERIAL_OPTIONS = Object.freeze([
  { key: 'Corduroy', ko: '코듀로이', en: 'Corduroy' },
  { key: 'Cotton', ko: '면 · 코튼', en: 'Cotton' },
  { key: 'Denim', ko: '데님', en: 'Denim' },
  { key: 'Wool', ko: '울', en: 'Wool' },
  { key: 'Cashmere', ko: '캐시미어', en: 'Cashmere' },
  { key: 'Knit', ko: '니트', en: 'Knit' },
  { key: 'Linen', ko: '린넨', en: 'Linen' },
  { key: 'Nylon', ko: '나일론 · 테크', en: 'Nylon / Tech' },
  { key: 'Leather', ko: '가죽', en: 'Leather' },
  { key: 'Suede', ko: '스웨이드', en: 'Suede' },
  { key: 'Silk', ko: '실크 · 새틴', en: 'Silk / Satin' },
  { key: 'Fleece', ko: '플리스 · 기모', en: 'Fleece' },
  { key: 'Polyester', ko: '폴리 · 혼방', en: 'Poly / Blend' },
  { key: 'Fabric', ko: '패브릭', en: 'Fabric' },
  { key: '18K Yellow Gold', ko: '18K 금', en: '18K Gold' },
  { key: '925 Sterling Silver', ko: '925 은', en: '925 Silver' },
  { key: 'Sculptural Bronze', ko: '동 · 브론즈', en: 'Bronze' },
  { key: 'Platinum & Pearl', ko: '플래티넘 · 진주', en: 'Platinum' },
]);

export const TEXTURE_FEEL_OPTIONS = Object.freeze([
  { key: 'soft', ko: '부드러움', en: 'Soft' },
  { key: 'structured', ko: '탄탄함', en: 'Structured' },
  { key: 'crisp', ko: '바스락 · 쾌적', en: 'Crisp' },
  { key: 'plush', ko: '포근 · 도톰', en: 'Plush' },
  { key: 'silky', ko: '매끄러움', en: 'Silky' },
  { key: 'airy', ko: '가벼움 · 통기', en: 'Airy' },
]);

export const FIT_OPTIONS = Object.freeze([
  { key: 'wide', ko: '와이드', en: 'Wide' },
  { key: 'relaxed', ko: '릴랙스드 · 루즈', en: 'Relaxed' },
  { key: 'straight', ko: '스트레이트', en: 'Straight' },
  { key: 'regular', ko: '스탠다드', en: 'Regular' },
  { key: 'slim', ko: '슬림 · 테이퍼드', en: 'Slim / Tapered' },
  { key: 'oversized', ko: '오버사이즈', en: 'Oversized' },
  { key: 'cropped', ko: '크롭', en: 'Cropped' },
]);

export const SEASON_OPTIONS = Object.freeze([
  { key: '봄', ko: '봄', en: 'Spring' },
  { key: '여름', ko: '여름', en: 'Summer' },
  { key: '가을', ko: '가을', en: 'Autumn' },
  { key: '겨울', ko: '겨울', en: 'Winter' },
]);

export const THICKNESS_OPTIONS = Object.freeze([
  { key: 'thin', ko: '얇음', en: 'Light', minTemp: 18, maxTemp: 32 },
  { key: 'medium', ko: '보통', en: 'Medium', minTemp: 10, maxTemp: 23 },
  { key: 'thick', ko: '도톰 · 보온', en: 'Heavy', minTemp: -6, maxTemp: 13 },
]);

export const STYLE_MOOD_OPTIONS = Object.freeze([
  { key: 'minimal', ko: '미니멀', en: 'Minimal', formality: 'smart' },
  { key: 'casual', ko: '캐주얼', en: 'Casual', formality: 'casual' },
  { key: 'smart', ko: '스마트 캐주얼', en: 'Smart Casual', formality: 'smart' },
  { key: 'formal', ko: '포멀 · 클래식', en: 'Formal', formality: 'formal' },
  { key: 'street', ko: '스트리트', en: 'Street', formality: 'casual' },
  { key: 'sporty', ko: '스포티 · 애슬레저', en: 'Sporty', formality: 'sporty' },
]);

export const WAIST_TYPE_OPTIONS = Object.freeze([
  { key: 'elastic', ko: '고무줄 밴딩', en: 'Elastic Waist', defaultBelt: false },
  { key: 'semi_elastic', ko: '뒤밴딩 (세미)', en: 'Back-Elastic', defaultBelt: true },
  { key: 'belt_loops', ko: '벨트 루프', en: 'Belt Loops', defaultBelt: true },
  { key: 'drawstring', ko: '스트링 · 끈', en: 'Drawstring', defaultBelt: false },
]);

export const RISE_OPTIONS = Object.freeze([
  { key: 'high', ko: '하이웨이스트', en: 'High Rise' },
  { key: 'mid', ko: '미드라이즈', en: 'Mid Rise' },
  { key: 'low', ko: '로우라이즈', en: 'Low Rise' },
]);

export const BOTTOM_LENGTH_OPTIONS = Object.freeze([
  { key: 'cropped', ko: '크롭 · 8부', en: 'Cropped' },
  { key: 'ankle', ko: '복숭아뼈 · 9부', en: 'Ankle' },
  { key: 'full', ko: '풀렝스 · 신발 덮음', en: 'Full Length' },
  { key: 'long', ko: '롱 · 끌림 주의', en: 'Extra Long' },
]);

export const TOP_NECKLINE_OPTIONS = Object.freeze([
  { key: 'crew', ko: '크루넥', en: 'Crew' },
  { key: 'v_neck', ko: '브이넥', en: 'V-Neck' },
  { key: 'collar', ko: '카라 · 셔츠', en: 'Collared' },
  { key: 'turtle', ko: '터틀 · 모크넥', en: 'Turtleneck' },
  { key: 'open', ko: '오픈 · 가디건', en: 'Open / Cardigan' },
]);

export const SLEEVE_LENGTH_OPTIONS = Object.freeze([
  { key: 'sleeveless', ko: '민소매', en: 'Sleeveless' },
  { key: 'short', ko: '반팔', en: 'Short' },
  { key: 'half', ko: '5~7부', en: 'Half / 3/4' },
  { key: 'long', ko: '긴팔', en: 'Long' },
]);

export const OUTER_LENGTH_OPTIONS = Object.freeze([
  { key: 'cropped', ko: '크롭', en: 'Cropped' },
  { key: 'hip', ko: '골반 · 레귤러', en: 'Hip / Regular' },
  { key: 'mid', ko: '허벅지 · 미디', en: 'Mid-Thigh' },
  { key: 'long', ko: '롱 · 무릎 아래', en: 'Long' },
]);

export const OUTER_CLOSURE_OPTIONS = Object.freeze([
  { key: 'single', ko: '싱글 버튼', en: 'Single-Breasted' },
  { key: 'double', ko: '더블 버튼', en: 'Double-Breasted' },
  { key: 'zip', ko: '지퍼', en: 'Zip-Up' },
  { key: 'open', ko: '오픈 · 벨티드', en: 'Open / Belted' },
]);

export const SHOE_HEEL_OPTIONS = Object.freeze([
  { key: 'flat', ko: '플랫 (~2cm)', en: 'Flat' },
  { key: 'low', ko: '로우 (3~4cm)', en: 'Low' },
  { key: 'mid', ko: '미들 (5~6cm)', en: 'Mid' },
  { key: 'high', ko: '하이 (7cm+)', en: 'High' },
]);

export const QUICK_FIT_NOTES_BY_CATEGORY = Object.freeze({
  bottom: [
    { ko: '올려 입으면 복숭아뼈, 내려 입으면 끌려요', en: 'Ankle-length worn high, drags if worn low' },
    { ko: '벨트 없이 편하게 입는 밴딩 핏', en: 'Easy elastic waist, no belt needed' },
    { ko: '밑단 한 번 롤업하면 비율이 좋아요', en: 'Looks best with a single cuff roll-up' },
  ],
  top: [
    { ko: '바지에 넣어 입기 좋은 적당한 기장', en: 'Good length for tucking in' },
    { ko: '안에 티셔츠 레이어드하기 여유로워요', en: 'Roomy enough to layer over a tee' },
    { ko: '단독 착용 시 어깨 라인이 자연스러워요', en: 'Natural shoulder drape when worn solo' },
  ],
  outer: [
    { ko: '두꺼운 니트 위에도 여유롭게 걸쳐져요', en: 'Fits comfortably over chunky knits' },
    { ko: '단추를 열고 입으면 실루엣이 더 슬림해요', en: 'Sleeker silhouette worn unbuttoned' },
  ],
  shoes: [
    { ko: '오래 걸어도 발이 편한 데일리 착화감', en: 'Comfortable for all-day walking' },
    { ko: '두꺼운 양말과 신기 딱 좋아요', en: 'Fits nicely with thick socks' },
  ],
});

export const SUBCATEGORY_OPTIONS_BY_CATEGORY = Object.freeze({
  top: [
    { key: 'knit', ko: '니트 · 스웨터', en: 'Knit / Sweater' },
    { key: 'shirt', ko: '셔츠 · 블라우스', en: 'Shirt / Blouse' },
    { key: 'tshirt', ko: '티셔츠', en: 'T-Shirt' },
    { key: 'sweatshirt', ko: '맨투맨 · 후드', en: 'Sweatshirt / Hoodie' },
    { key: 'cardigan', ko: '가디건 · 베스트', en: 'Cardigan / Vest' },
  ],
  bottom: [
    { key: 'trousers', ko: '코튼 · 코듀로이 팬츠', en: 'Cotton / Corduroy Pants' },
    { key: 'slacks', ko: '슬랙스 · 트라우저', en: 'Slacks / Trousers' },
    { key: 'denim', ko: '데님 · 진', en: 'Denim / Jeans' },
    { key: 'shorts', ko: '쇼츠 · 반바지', en: 'Shorts' },
    { key: 'skirt', ko: '스커트', en: 'Skirt' },
  ],
  outer: [
    { key: 'coat', ko: '코트 · 트렌치', en: 'Coat / Trench' },
    { key: 'jacket', ko: '자켓 · 블루종', en: 'Jacket / Blouson' },
    { key: 'blazer', ko: '블레이저', en: 'Blazer' },
    { key: 'padding', ko: '패딩 · 다운', en: 'Down / Puffer' },
  ],
  shoes: [
    { key: 'sneakers', ko: '스니커즈', en: 'Sneakers' },
    { key: 'loafer', ko: '로퍼 · 더비', en: 'Loafer / Derby' },
    { key: 'boots', ko: '부츠', en: 'Boots' },
    { key: 'sandal', ko: '샌들 · 뮬', en: 'Sandals / Mules' },
  ],
});

/**
 * Computes sensible min/max temperature range from seasons + thickness.
 */
export function computeTemperatureRange(seasons = ['봄', '가을'], thickness = 'medium') {
  const s = new Set(Array.isArray(seasons) ? seasons : ['봄', '가을']);
  let minT = 10;
  let maxT = 22;
  if (s.has('겨울')) minT = Math.min(minT, thickness === 'thick' ? -8 : 0);
  if (s.has('봄') || s.has('가을')) {
    minT = Math.min(minT, thickness === 'thick' ? 4 : 9);
    maxT = Math.max(maxT, thickness === 'thin' ? 24 : 21);
  }
  if (s.has('여름')) {
    minT = s.size === 1 ? 20 : Math.min(minT, 18);
    maxT = 34;
  }
  if (thickness === 'thick') maxT = Math.min(maxT, 16);
  if (thickness === 'thin') minT = Math.max(minT, 14);
  return { min_temp: Math.round(minT), max_temp: Math.round(maxT) };
}

/**
 * Formats structured garment details into a compact human-readable tag list.
 */
export function formatGarmentDetailsSummary(details, category, lang = 'ko') {
  if (!details || typeof details !== 'object') return [];
  const tags = [];
  const isEn = lang === 'en';
  if (category === 'bottom') {
    const waistOpt = WAIST_TYPE_OPTIONS.find((o) => o.key === details.waist_type);
    if (waistOpt) tags.push(isEn ? waistOpt.en : waistOpt.ko);
    if (details.belt_compatible === false) {
      tags.push(isEn ? 'No Belt' : '벨트 불가');
    } else if (details.belt_compatible === true) {
      tags.push(isEn ? 'Belt Compatible' : '벨트 가능');
    }
    const riseOpt = RISE_OPTIONS.find((o) => o.key === details.rise);
    if (riseOpt) tags.push(isEn ? riseOpt.en : riseOpt.ko);
    const lenOpt = BOTTOM_LENGTH_OPTIONS.find((o) => o.key === details.length_profile);
    if (lenOpt) tags.push(isEn ? lenOpt.en : lenOpt.ko);
  } else if (category === 'top') {
    const neckOpt = TOP_NECKLINE_OPTIONS.find((o) => o.key === details.neckline);
    if (neckOpt) tags.push(isEn ? neckOpt.en : neckOpt.ko);
    const slvOpt = SLEEVE_LENGTH_OPTIONS.find((o) => o.key === details.sleeve_length);
    if (slvOpt) tags.push(isEn ? slvOpt.en : slvOpt.ko);
  } else if (category === 'outer') {
    const outLen = OUTER_LENGTH_OPTIONS.find((o) => o.key === details.coat_length);
    if (outLen) tags.push(isEn ? outLen.en : outLen.ko);
    const cls = OUTER_CLOSURE_OPTIONS.find((o) => o.key === details.closure_type);
    if (cls) tags.push(isEn ? cls.en : cls.ko);
  } else if (category === 'shoes') {
    const heel = SHOE_HEEL_OPTIONS.find((o) => o.key === details.heel_height);
    if (heel) tags.push(isEn ? heel.en : heel.ko);
  }
  return tags;
}

/**
 * Strips meaningless camera/OS auto-generated filenames so they never pollute item name inputs.
 */
export function isGeneratedCameraFilename(rawName = '') {
  const base = String(rawName || '')
    .replace(/\.[^.]+$/, '')
    .trim();
  if (!base) return true;
  if (/^\d{6,}$/.test(base)) return true;
  if (/^(img|pxl|dsc|photo|image|screenshot|kakaotalk|mvimg|vid|capture|camera)[-_ ]?\d+/i.test(base)) {
    return true;
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base)) {
    return true;
  }
  return false;
}
