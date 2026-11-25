/**
 * Canonical Shared Garment Taxonomy, 11 Wear Slots, Studio Packshot Seeds,
 * 12-Tone -> 4-Season Personal Color Resolver, and 3D Manifest Slot/GLB/Physics Mapping.
 * Consumed by both Node Express (`server/*`) and Vite Client (`src/*`).
 */

import {
  ACCESSORY_JEWELRY_BY_SUBCATEGORY,
  ACCESSORY_JEWELRY_CATALOG,
  ACCESSORY_JEWELRY_NATIVE_HEX_MAP,
} from './accessoryJewelryCatalog.js';
import {
  LAYERED_10_BY_IMAGE_URL,
  LAYERED_10_CATALOG,
  LAYERED_10_NATIVE_HEX_MAP,
} from './layered10Catalog.js';
import {
  LUXURY_STREET_BY_IMAGE_URL,
  LUXURY_STREET_CATALOG,
  LUXURY_STREET_NATIVE_HEX_MAP,
} from './luxuryStreetCatalog.js';
import {
  SEASONAL_120_BY_IMAGE_URL,
  SEASONAL_120_BY_SEASON,
  SEASONAL_120_CATALOG,
  SEASONAL_120_NATIVE_HEX_MAP,
} from './seasonal120Catalog.js';

export {
  ACCESSORY_JEWELRY_BY_SUBCATEGORY,
  ACCESSORY_JEWELRY_CATALOG,
  ACCESSORY_JEWELRY_NATIVE_HEX_MAP,
  LAYERED_10_BY_IMAGE_URL,
  LAYERED_10_CATALOG,
  LAYERED_10_NATIVE_HEX_MAP,
  LUXURY_STREET_BY_IMAGE_URL,
  LUXURY_STREET_CATALOG,
  LUXURY_STREET_NATIVE_HEX_MAP,
  SEASONAL_120_BY_IMAGE_URL,
  SEASONAL_120_BY_SEASON,
  SEASONAL_120_CATALOG,
  SEASONAL_120_NATIVE_HEX_MAP,
};

export const WEAR_SLOTS_11 = [
  { key: 'headwear', code: '01', labelKo: '모자 · 헤드웨어', shortKo: '모자', labelEn: 'Headwear', order: 1 },
  { key: 'neckwear', code: '02', labelKo: '목도리 · 스카프 · 타이', shortKo: '넥웨어', labelEn: 'Neckwear', order: 2 },
  { key: 'outer', code: '03', labelKo: '아우터 · 코트 · 자켓', shortKo: '아우터', labelEn: 'Outerwear', order: 3 },
  { key: 'top', code: '04', labelKo: '상의 · 니트 · 셔츠', shortKo: '상의', labelEn: 'Tops', order: 4 },
  { key: 'bottom', code: '05', labelKo: '하의 · 팬츠 · 스커트', shortKo: '하의', labelEn: 'Bottoms', order: 5 },
  { key: 'dress', code: '06', labelKo: '원피스 · 점프수트', shortKo: '원피스', labelEn: 'Dress / One-Piece', order: 6 },
  { key: 'gloves', code: '07', labelKo: '장갑 · 핸드웨어', shortKo: '장갑', labelEn: 'Gloves', order: 7 },
  { key: 'underwear', code: '08', labelKo: '언더웨어 · 이너웨어', shortKo: '이너웨어', labelEn: 'Underwear / Inner', order: 8 },
  { key: 'socks', code: '09', labelKo: '양말 · 레그웨어', shortKo: '양말', labelEn: 'Socks / Legwear', order: 9 },
  { key: 'shoes', code: '10', labelKo: '신발 · 풋웨어', shortKo: '신발', labelEn: 'Footwear', order: 10 },
  { key: 'accessory', code: '11', labelKo: '가방 · 시계 · 액세서리', shortKo: '액세서리', labelEn: 'Accessories', order: 11 },
];

export const CATEGORIES = [
  { key: 'all', value: 'all', label: '전체', labelEn: 'All' },
  { key: 'headwear', value: 'headwear', label: '모자·헤드웨어', labelEn: 'Headwear' },
  { key: 'neckwear', value: 'neckwear', label: '목도리·스카프·타이', labelEn: 'Neckwear' },
  { key: 'outer', value: 'outer', label: '아우터', labelEn: 'Outerwear' },
  { key: 'top', value: 'top', label: '상의', labelEn: 'Tops' },
  { key: 'bottom', value: 'bottom', label: '하의', labelEn: 'Bottoms' },
  { key: 'dress', value: 'dress', label: '원피스', labelEn: 'Dress' },
  { key: 'gloves', value: 'gloves', label: '장갑', labelEn: 'Gloves' },
  { key: 'underwear', value: 'underwear', label: '언더웨어·이너', labelEn: 'Innerwear' },
  { key: 'socks', value: 'socks', label: '양말', labelEn: 'Socks' },
  { key: 'shoes', value: 'shoes', label: '신발', labelEn: 'Footwear' },
  { key: 'accessory', value: 'accessory', label: '가방·액세서리', labelEn: 'Accessories' },
  { key: 'jewelry', value: 'jewelry', label: '주얼리', labelEn: 'Jewelry' },
];

export const SUBCATEGORIES_BY_CAT = {
  headwear: [
    { value: 'headwear', label: '캐시미어 · 울 모자' },
    { value: 'beanie', label: '비니 · 니트모자' },
    { value: 'cap', label: '볼캡 · 캡모자' },
    { value: 'beret', label: '베레모 · 헌팅캡' },
    { value: 'bucket_hat', label: '버킷햇 · 선햇' },
  ],
  neckwear: [
    { value: 'neckwear', label: '스카프 · 볼로타이' },
    { value: 'scarf', label: '캐시미어 · 울 머플러' },
    { value: 'muffler', label: '니트 스카프 · 넥워머' },
    { value: 'necktie', label: '실크 넥타이' },
  ],
  outer: [
    { value: 'trench', label: '트렌치 · 맥코트' },
    { value: 'blazer', label: '블레이저' },
    { value: 'jacket', label: '자켓 · 점퍼' },
    { value: 'windbreaker', label: '윈드브레이커 · 바람막이' },
    { value: 'denim_jacket', label: '데님 · 트러커 자켓' },
    { value: 'leather_jacket', label: '레더 · 라이더 자켓' },
    { value: 'field_jacket', label: '필드 · 사파리 자켓' },
    { value: 'coat', label: '울 · 캐시미어 코트' },
    { value: 'padding', label: '경량 패딩 · 다운' },
    { value: 'short_padding', label: '숏패딩 · 푸퍼' },
    { value: 'long_padding', label: '롱패딩 · 벤치파카' },
    { value: 'fleece', label: '보아 플리스 · 양털' },
    { value: 'mustang', label: '무스탕 · 시어링' },
    { value: 'cardigan', label: '아우터 가디건' },
  ],
  top: [
    { value: 'knit', label: '니트 · 스웨터' },
    { value: 'cardigan', label: '가디건' },
    { value: 'vest', label: '조끼 · 베스트' },
    { value: 'shirt', label: '셔츠' },
    { value: 'short_shirt', label: '반팔 셔츠' },
    { value: 'blouse', label: '블라우스 · 실크탑' },
    { value: 'tshirt', label: '티셔츠' },
    { value: 'tank_top', label: '탱크탑' },
    { value: 'sleeveless', label: '슬리브리스 · 민소매' },
    { value: 'sweatshirt', label: '맨투맨' },
    { value: 'hoodie', label: '후드 스웨트' },
  ],
  bottom: [
    { value: 'slacks', label: '슬랙스 · 팬츠' },
    { value: 'denim', label: '데님 · 청바지' },
    { value: 'chinos', label: '치노 · 면바지' },
    { value: 'cargo', label: '카고 · 유틸리티 팬츠' },
    { value: 'jogger', label: '조거 · 스웨트 팬츠' },
    { value: 'skirt', label: '스커트' },
    { value: 'shorts', label: '하프 팬츠 · 쇼츠' },
  ],
  dress: [
    { value: 'dress', label: '미디 · 셔츠 원피스' },
    { value: 'onepiece', label: '니트 · 롱 원피스' },
    { value: 'swimsuit', label: '원피스 수영복' },
    { value: 'bikini', label: '비키니 수영복' },
    { value: 'rashguard', label: '래시가드' },
    { value: 'swim_trunks', label: '보드쇼츠 · 스윔트렁크' },
  ],
  gloves: [
    { value: 'leather_gloves', label: '가죽 · 스웨이드 장갑' },
    { value: 'gloves', label: '울 · 캐시미어 · 패브릭 장갑' },
  ],
  underwear: [
    { value: 'boxer_briefs', label: '드로즈 · 박서 브리프' },
    { value: 'woven_boxers', label: '우븐 체크 트렁크' },
    { value: 'seamless_underwear', label: '심리스 · 노라인 언더웨어' },
    { value: 'lace_underwear', label: '레이스 언더웨어' },
    { value: 'nubra', label: '누브라 · 스트랩리스' },
    { value: 'thong_underwear', label: 'T팬티 · T-스트링' },
    { value: 'inner_top', label: '발열 · 심리스 이너탑' },
    { value: 'underwear', label: '언더웨어 · 브리프' },
  ],
  socks: [
    { value: 'street_crew_socks', label: '스트릿 스트라이프 크루 삭스' },
    { value: 'crew_socks', label: '울 · 골지 크루 삭스' },
    { value: 'sheer_socks', label: '시스루 나일론 드레스 삭스' },
    { value: 'socks', label: '데일리 앵클 삭스' },
    { value: 'no_show_socks', label: '페이크 삭스 · 덧신' },
  ],
  shoes: [
    { value: 'sneakers', label: '스니커즈' },
    { value: 'loafers', label: '로퍼 · 구두' },
    { value: 'derby', label: '더비 · 옥스포드화' },
    { value: 'boots', label: '첼시 · 앵클 부츠' },
    { value: 'long_boots', label: '롱부츠 · 라이딩부츠' },
    { value: 'snow_boots', label: '방한화 · 스노우부츠' },
    { value: 'heels', label: '힐 · 펌프스' },
    { value: 'sandals', label: '스트랩 샌들' },
    { value: 'slides', label: '슬라이드 · 슬리퍼' },
    { value: 'flip_flops', label: '플립플랍' },
  ],
  accessory: [
    { value: 'bag', label: '크로스백 · 숄더백' },
    { value: 'tote', label: '토트백 · 쇼퍼백' },
    { value: 'briefcase', label: '서류가방 · 브리프케이스' },
    { value: 'backpack', label: '백팩 · 데이팩' },
    { value: 'messenger', label: '메신저백 · 플랩백' },
    { value: 'clutch', label: '클러치 · 포트폴리오백' },
    { value: 'duffel', label: '더플백 · 위켄더백' },
    { value: 'hobo', label: '호보백 · 커브드 숄더백' },
    { value: 'umbrella', label: '우산 · 양산' },
    { value: 'watch', label: '손목시계 · 워치' },
    { value: 'gloves', label: '장갑 · 핸드웨어' },
    { value: 'headwear', label: '모자 · 비니 · 베레모' },
    { value: 'eyewear', label: '아이웨어 · 안경 · 선글라스' },
    { value: 'neckwear', label: '머플러 · 스카프 · 타이' },
    { value: 'belt', label: '벨트 · 스트랩' },
    { value: 'sunglasses', label: '선글라스' },
    { value: 'glasses', label: '아이웨어 · 안경' },
  ],
  jewelry: [
    { value: 'earring', label: '귀걸이 · 이어커프' },
    { value: 'necklace', label: '목걸이 · 펜던트 · 초커' },
    { value: 'bracelet', label: '팔찌 · 뱅글 · 커프' },
    { value: 'ring', label: '반지 · 시그넷 링' },
    { value: 'brooch', label: '브로치 · 코사지 · 라펠핀' },
  ],
  bag: [
    { value: 'briefcase', label: '서류가방 · 브리프케이스' },
    { value: 'tote', label: '토트백 · 쇼퍼백' },
    { value: 'bag', label: '크로스백 · 숄더백' },
    { value: 'backpack', label: '백팩 · 데이팩' },
    { value: 'messenger', label: '메신저백 · 플랩백' },
    { value: 'clutch', label: '클러치 · 포트폴리오백' },
    { value: 'duffel', label: '더플백 · 위켄더백' },
    { value: 'hobo', label: '호보백 · 커브드 숄더백' },
  ],
};

export const BAG_SUBCATEGORY_SET = new Set([
  'bag',
  'tote',
  'briefcase',
  'backpack',
  'messenger',
  'clutch',
  'duffel',
  'hobo',
  'crossbody',
  'shoulder',
]);

export const BAG_CARRY_STYLES = Object.freeze({
  hand_only: {
    key: 'hand_only',
    hasStrap: false,
    labelKo: '핸드캐리 (끈 없음)',
    labelEn: 'Hand-carry (No strap)',
  },
  shoulder: {
    key: 'shoulder',
    hasStrap: true,
    labelKo: '숄더 스트랩',
    labelEn: 'Shoulder strap',
  },
  crossbody: {
    key: 'crossbody',
    hasStrap: true,
    labelKo: '크로스바디 스트랩',
    labelEn: 'Crossbody strap',
  },
  backpack: {
    key: 'backpack',
    hasStrap: true,
    labelKo: '양어깨 백팩 스트랩',
    labelEn: 'Dual-shoulder backpack',
  },
  convertible_hand_strap: {
    key: 'convertible_hand_strap',
    hasStrap: true,
    labelKo: '핸들 + 탈부착 스트랩',
    labelEn: 'Top handle + detachable strap',
  },
});

export function isBagGarmentItem(item) {
  if (!item || typeof item !== 'object') return false;
  const cat = String(item.category || '').toLowerCase().trim();
  const sub = String(item.subcategory || '').toLowerCase().trim();
  const name = `${item.name || ''} ${item.name_en || ''}`.toLowerCase();
  if (cat === 'bag' || BAG_SUBCATEGORY_SET.has(sub)) return true;
  if (cat === 'accessory' && /(백|가방|토트|브리프|클러치|백팩|더플|호보|메신저|bag|tote|briefcase|clutch|backpack|duffel|hobo|messenger|satchel|pouch)/i.test(name)) {
    return true;
  }
  return false;
}

export function inferBagCarrySpec(item) {
  const isBag = isBagGarmentItem(item);
  if (!isBag) {
    return {
      isBag: false,
      has_strap: false,
      bag_carry_style: null,
      labelKo: '',
      labelEn: '',
    };
  }
  const sub = String(item?.subcategory || '').toLowerCase().trim();
  const name = `${item?.name || ''} ${item?.name_en || ''} ${item?.notes || ''}`.toLowerCase();
  const explicitStyle = String(item?.bag_carry_style || '').toLowerCase().trim();
  const hasExplicitStrap =
    item?.has_strap === true ||
    item?.has_strap === false ||
    item?.has_strap === 1 ||
    item?.has_strap === 0;

  let carryStyle = BAG_CARRY_STYLES[explicitStyle] ? explicitStyle : '';
  if (!carryStyle) {
    if (sub === 'backpack' || /백팩|배낭|데이팩|backpack|rucksack|daypack/i.test(name)) {
      carryStyle = 'backpack';
    } else if (sub === 'clutch' || /클러치|포트폴리오|파우치|clutch|portfolio|folio/i.test(name)) {
      carryStyle = 'hand_only';
    } else if (sub === 'duffel' || /더플|위켄더|보스턴|duffel|duffle|weekender|boston/i.test(name)) {
      carryStyle = 'convertible_hand_strap';
    } else if (sub === 'messenger' || /메신저|크로스|사첼|새들|체인|미니백|messenger|crossbody|satchel|saddle|chain/i.test(name)) {
      carryStyle = 'crossbody';
    } else if (sub === 'hobo' || /호보|숄더|hobo|shoulder/i.test(name)) {
      carryStyle = 'shoulder';
    } else if (sub === 'briefcase' || /서류가방|브리프|briefcase|brief bag|attache/i.test(name)) {
      carryStyle = 'hand_only';
    } else if (sub === 'tote' || /토트|쇼퍼|tote|shopper/i.test(name)) {
      carryStyle = 'hand_only';
    } else {
      carryStyle = 'shoulder';
    }
  }

  let hasStrap = hasExplicitStrap
    ? Boolean(Number(item.has_strap))
    : BAG_CARRY_STYLES[carryStyle].hasStrap;

  // Enforce consistency: if user explicitly marked no strap, force hand_only unless backpack
  if (hasExplicitStrap && !hasStrap && carryStyle !== 'hand_only') {
    carryStyle = 'hand_only';
  }
  if (carryStyle === 'hand_only' && !hasExplicitStrap) {
    hasStrap = false;
  }

  const meta = BAG_CARRY_STYLES[carryStyle] || BAG_CARRY_STYLES.hand_only;
  return {
    isBag: true,
    has_strap: hasStrap,
    bag_carry_style: carryStyle,
    labelKo: hasStrap ? meta.labelKo : BAG_CARRY_STYLES.hand_only.labelKo,
    labelEn: hasStrap ? meta.labelEn : BAG_CARRY_STYLES.hand_only.labelEn,
  };
}

export const FOUR_SEASONS = ['봄', '여름', '가을', '겨울'];

export const SEASONS = [
  { key: 'spring', value: 'spring', label: '봄', labelEn: 'Spring' },
  { key: 'summer', value: 'summer', label: '여름', labelEn: 'Summer' },
  { key: 'autumn', value: 'autumn', label: '가을', labelEn: 'Autumn' },
  { key: 'winter', value: 'winter', label: '겨울', labelEn: 'Winter' },
];

export const CITY_COORDS = [
  { key: 'seoul', name: '서울 · 중구 명동', lat: 37.5665, lon: 126.978 },
  { key: 'gangnam_yeoksam', name: '서울 강남구 역삼동', lat: 37.5007, lon: 127.0366 },
  { key: 'mapo_yeonnam', name: '서울 마포구 연남동', lat: 37.5636, lon: 126.9254 },
  { key: 'seongdong_seongsu', name: '서울 성동구 성수동', lat: 37.5446, lon: 127.056 },
  { key: 'jongno_samcheong', name: '서울 종로구 삼청동', lat: 37.5844, lon: 126.9818 },
  { key: 'yongsan_hannam', name: '서울 용산구 한남동', lat: 37.5349, lon: 127.0024 },
  { key: 'bundang_jeongja', name: '성남 분당구 정자동', lat: 37.3665, lon: 127.1082 },
  { key: 'busan_haeundae', name: '부산 해운대구 우동', lat: 35.1631, lon: 129.1636 },
  { key: 'jeju_aewol', name: '제주 제주시 애월읍', lat: 33.4622, lon: 126.3292 },
  { key: 'busan', name: '부산 중구 중앙동', lat: 35.1796, lon: 129.0756 },
  { key: 'jeju', name: '제주 제주시 연동', lat: 33.4996, lon: 126.5312 },
  { key: 'tokyo', name: '도쿄 시부야', lat: 35.6762, lon: 139.6503 },
  { key: 'newyork', name: '뉴욕 소호', lat: 40.7128, lon: -74.006 },
  { key: 'paris', name: '파리 마레', lat: 48.8566, lon: 2.3522 },
];

export const STUDIO_SEED_BY_SUBCATEGORY = {
  trench: '/seed/beige-trench.jpg',
  blazer: '/seed/black-blazer.jpg',
  jacket: '/seed/olive-jacket.jpg',
  windbreaker: '/seed/s4-spring-03-ivory-windbreaker.webp',
  denim_jacket: '/seed/s4-spring-04-indigo-trucker.webp',
  leather_jacket: '/seed/s4-autumn-02-black-leather-rider.webp',
  field_jacket: '/seed/s4-autumn-04-olive-waxed-field.webp',
  coat: '/seed/studio-coat.jpg',
  padding: '/seed/studio-padding.jpg',
  short_padding: '/seed/s4-winter-01-black-short-puffer.webp',
  long_padding: '/seed/s4-winter-03-navy-long-puffer.webp',
  fleece: '/seed/s4-winter-09-cream-boa-fleece.webp',
  mustang: '/seed/s4-winter-08-brown-shearling-mustang.webp',
  cardigan: '/seed/layer-topmid-01-oatmeal-cardigan.webp',
  vest: '/seed/layer-topmid-02-charcoal-vest.webp',
  knit: '/seed/cream-knit.jpg',
  shirt: '/seed/white-shirt.jpg',
  short_shirt: '/seed/s4-summer-10-sage-linen-short-shirt.webp',
  blouse: '/seed/studio-blouse.jpg',
  tshirt: '/seed/studio-tshirt.jpg',
  tank_top: '/seed/s4-summer-03-white-rib-tank.webp',
  sleeveless: '/seed/s4-summer-05-sky-linen-sleeveless.webp',
  sweatshirt: '/seed/studio-hoodie.jpg',
  hoodie: '/seed/studio-hoodie.jpg',
  slacks: '/seed/charcoal-slacks.jpg',
  denim: '/seed/indigo-denim.jpg',
  chinos: '/seed/studio-chinos.jpg',
  cargo: '/seed/s4-autumn-19-khaki-cargo-pants.webp',
  skirt: '/seed/studio-skirt.jpg',
  shorts: '/seed/studio-shorts.jpg',
  jogger: '/seed/studio-jogger.jpg',
  dress: '/seed/studio-dress.jpg',
  onepiece: '/seed/studio-onepiece.jpg',
  jumpsuit: '/seed/studio-onepiece.jpg',
  swimsuit: '/seed/s4-summer-19-navy-onepiece-swimsuit.webp',
  bikini: '/seed/s4-summer-20-terracotta-bikini.webp',
  rashguard: '/seed/s4-summer-22-navy-uv-rashguard.webp',
  swim_trunks: '/seed/s4-summer-23-olive-swim-trunks.webp',
  beanie: '/seed/studio-beanie.jpg',
  cap: '/seed/studio-cap.jpg',
  beret: '/seed/studio-beret.jpg',
  bucket_hat: '/seed/studio-cap.jpg',
  hat: '/seed/studio-beret.jpg',
  scarf: '/seed/studio-scarf.jpg',
  muffler: '/seed/studio-muffler.jpg',
  necktie: '/seed/studio-necktie.jpg',
  choker: '/seed/studio-scarf.jpg',
  gloves: '/seed/studio-gloves.jpg',
  knit_gloves: '/seed/studio-gloves.jpg',
  leather_gloves: '/seed/studio-leather-gloves.jpg',
  underwear: '/seed/studio-underwear.jpg',
  boxer_briefs: '/seed/studio-hiphop-boxer-briefs.webp',
  woven_boxers: '/seed/studio-check-boxers.webp',
  seamless_underwear: '/seed/studio-seamless-nude-set.webp',
  lace_underwear: '/seed/studio-black-lace-set.webp',
  nubra: '/seed/studio-nubra.webp',
  adhesive_bra: '/seed/studio-nubra.webp',
  thong_underwear: '/seed/studio-thong.webp',
  inner_top: '/seed/studio-inner-top.jpg',
  camisole: '/seed/studio-inner-top.jpg',
  socks: '/seed/studio-socks.jpg',
  crew_socks: '/seed/studio-crew-socks.jpg',
  street_crew_socks: '/seed/studio-street-crew-socks.webp',
  sheer_socks: '/seed/studio-sheer-dress-socks.webp',
  ankle_socks: '/seed/studio-socks.jpg',
  no_show_socks: '/seed/studio-socks.jpg',
  dress_socks: '/seed/studio-sheer-dress-socks.webp',
  sneakers: '/seed/white-sneakers.jpg',
  loafers: '/seed/black-loafers.jpg',
  derby: '/seed/s4-autumn-26-brown-derby-shoes.webp',
  boots: '/seed/studio-boots.jpg',
  long_boots: '/seed/s4-winter-24-black-riding-long-boots.webp',
  snow_boots: '/seed/s4-winter-26-sand-shearling-snow-boots.webp',
  heels: '/seed/studio-heels.jpg',
  sandals: '/seed/s4-summer-27-cognac-strap-sandals.webp',
  slides: '/seed/s4-summer-29-charcoal-pool-slides.webp',
  flip_flops: '/seed/s4-summer-25-black-flip-flops.webp',
  briefcase: '/seed/studio-briefcase.jpg',
  tote: '/seed/studio-tote.jpg',
  bag: '/seed/studio-bag.jpg',
  backpack: '/seed/s5-66-black-ballistic-backpack.webp',
  messenger: '/seed/s5-67-charcoal-waxed-messenger.webp',
  clutch: '/seed/s5-68-espresso-leather-clutch.webp',
  duffel: '/seed/s5-69-olive-weekender-duffel.webp',
  hobo: '/seed/s5-70-stone-suede-hobo.webp',
  sunglasses: '/seed/s4-summer-30-black-uv-sunglasses.webp',
  eyewear: '/seed/s5-16-gold-round-glasses.webp',
  umbrella: '/seed/s5-01-maple-fabric-umbrella.webp',
  watch: '/seed/s5-06-espresso-leather-watch.webp',
  belt: '/seed/s5-31-black-leather-belt.webp',
  glasses: '/seed/s5-16-gold-round-glasses.webp',
  headwear: '/seed/s5-21-cream-cashmere-beanie.webp',
  neckwear: '/seed/s5-26-ivory-cashmere-muffler.webp',
  earring: '/seed/s5-41-gold-hoop-earring.webp',
  necklace: '/seed/s5-46-gold-herringbone-necklace.webp',
  bracelet: '/seed/s5-51-gold-open-cuff-bracelet.webp',
  ring: '/seed/s5-56-gold-oval-signet-ring.webp',
  brooch: '/seed/s5-61-gold-botanical-brooch.webp',
  jewelry: '/seed/s5-46-gold-herringbone-necklace.webp',
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
  jewelry: '/seed/s5-46-gold-herringbone-necklace.webp',
  bag: '/seed/studio-bag.jpg',
};

const RAW_NATIVE_SEED_HEX = {
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
  '/seed/studio-cardigan.png': '#DFD1BE',
  '/seed/studio-coat.jpg': '#BA9163',
  '/seed/studio-padding.jpg': '#DCD8CE',
  '/seed/studio-hoodie.jpg': '#BEBDB8',
  '/seed/studio-tshirt.jpg': '#EFECE6',
  '/seed/studio-blouse.jpg': '#ECE5DA',
  '/seed/studio-hiphop-boxer-briefs.webp': '#18181B',
  '/seed/studio-check-boxers.webp': '#243248',
  '/seed/studio-seamless-nude-set.webp': '#D8B79E',
  '/seed/studio-black-lace-set.webp': '#151517',
  '/seed/studio-nubra.webp': '#D8BDA8',
  '/seed/studio-thong.webp': '#1B1B1E',
  '/seed/studio-street-crew-socks.webp': '#F4F4F2',
  '/seed/studio-sheer-dress-socks.webp': '#232327',
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
  ...SEASONAL_120_NATIVE_HEX_MAP,
  ...ACCESSORY_JEWELRY_NATIVE_HEX_MAP,
  ...LAYERED_10_NATIVE_HEX_MAP,
  ...LUXURY_STREET_NATIVE_HEX_MAP,
};

export function upgradeStudioSeedToWebp(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed.startsWith('/seed/')) return trimmed;
  if (
    trimmed === '/seed/store-navy-sweater.jpg' ||
    trimmed === '/seed/store-terracotta-cardigan.jpg'
  ) {
    return trimmed;
  }
  return trimmed.replace(/\.(jpe?g|png)$/i, '.webp');
}

export const NATIVE_SEED_HEX = Object.freeze(
  Object.entries(RAW_NATIVE_SEED_HEX).reduce((acc, [key, hex]) => {
    acc[key] = hex;
    acc[upgradeStudioSeedToWebp(key)] = hex;
    return acc;
  }, {})
);

export function getNativeSeedHex(url) {
  if (!url || typeof url !== 'string') return null;
  return NATIVE_SEED_HEX[url] || NATIVE_SEED_HEX[upgradeStudioSeedToWebp(url)] || null;
}

export function getStudioSeedImageForGarment(category = 'top', subcategory = 'knit') {
  const subKey = String(subcategory || '').toLowerCase().trim();
  const catKey = String(category || 'top').toLowerCase().trim();
  if (STUDIO_SEED_BY_SUBCATEGORY[subKey]) {
    return upgradeStudioSeedToWebp(STUDIO_SEED_BY_SUBCATEGORY[subKey]);
  }
  if (STUDIO_SEED_BY_CATEGORY[catKey]) {
    return upgradeStudioSeedToWebp(STUDIO_SEED_BY_CATEGORY[catKey]);
  }
  return '/seed/cream-knit.webp';
}

export function resolveStudioSeedUrl(itemOrUrl, category = 'top', subcategory = 'knit') {
  const rawUrl = typeof itemOrUrl === 'string' ? itemOrUrl : itemOrUrl?.image_url || '';
  const name = (typeof itemOrUrl === 'object' && itemOrUrl?.name) || '';
  const cat = (typeof itemOrUrl === 'object' && itemOrUrl?.category) || category || 'top';
  let sub = (typeof itemOrUrl === 'object' && itemOrUrl?.subcategory) || subcategory || 'knit';

  if (sub === 'bag' && name) {
    if (/서류가방|브리프케이스|briefcase/i.test(name)) sub = 'briefcase';
    else if (/토트|쇼퍼|tote/i.test(name)) sub = 'tote';
    else if (/백팩|배낭|backpack/i.test(name)) sub = 'backpack';
    else if (/메신저|플랩|messenger/i.test(name)) sub = 'messenger';
    else if (/클러치|포트폴리오|clutch/i.test(name)) sub = 'clutch';
    else if (/더플|위켄더|duffel|weekender/i.test(name)) sub = 'duffel';
    else if (/호보|hobo/i.test(name)) sub = 'hobo';
  }

  const normalizedBagCheck = rawUrl.replace(/\.(jpe?g|png|webp)$/i, '');
  const isUnknownSeed =
    rawUrl.startsWith('/seed/') &&
    !getNativeSeedHex(rawUrl) &&
    rawUrl !== '/seed/store-navy-sweater.jpg';

  if (
    !rawUrl ||
    rawUrl.startsWith('data:image/svg+xml') ||
    rawUrl === '/seed/store-terracotta-cardigan.jpg' ||
    isUnknownSeed ||
    (normalizedBagCheck === '/seed/studio-bag' && (sub === 'briefcase' || sub === 'tote'))
  ) {
    return getStudioSeedImageForGarment(cat, sub);
  }
  return upgradeStudioSeedToWebp(rawUrl);
}

export const PERSONAL_COLOR_CATALOG = {
  spring_warm: { macro: 'spring_warm', ko: '봄 웜톤', en: 'Spring Warm' },
  spring_light: { macro: 'spring_warm', ko: '봄 웜 라이트', en: 'Spring Light' },
  spring_bright: { macro: 'spring_warm', ko: '봄 웜 브라이트', en: 'Spring Bright' },
  spring_true: { macro: 'spring_warm', ko: '봄 웜 트루', en: 'Spring True' },
  summer_cool: { macro: 'summer_cool', ko: '여름 쿨톤', en: 'Summer Cool' },
  summer_light: { macro: 'summer_cool', ko: '여름 쿨 라이트', en: 'Summer Light' },
  summer_true: { macro: 'summer_cool', ko: '여름 쿨 트루', en: 'Summer True' },
  summer_mute: { macro: 'summer_cool', ko: '여름 쿨 뮤트', en: 'Summer Mute' },
  autumn_warm: { macro: 'autumn_warm', ko: '가을 웜톤', en: 'Autumn Warm' },
  autumn_mute: { macro: 'autumn_warm', ko: '가을 웜 뮤트', en: 'Autumn Mute' },
  autumn_true: { macro: 'autumn_warm', ko: '가을 웜 트루', en: 'Autumn True' },
  autumn_deep: { macro: 'autumn_warm', ko: '가을 웜 딥', en: 'Autumn Deep' },
  winter_cool: { macro: 'winter_cool', ko: '겨울 쿨톤', en: 'Winter Cool' },
  winter_bright: { macro: 'winter_cool', ko: '겨울 쿨 브라이트', en: 'Winter Bright' },
  winter_true: { macro: 'winter_cool', ko: '겨울 쿨 트루', en: 'Winter True' },
  winter_dark: { macro: 'winter_cool', ko: '겨울 쿨 다크', en: 'Winter Dark' },
};

export function resolveMacroPersonalColor(key) {
  const clean = String(key || '').toLowerCase().trim();
  if (PERSONAL_COLOR_CATALOG[clean]) return PERSONAL_COLOR_CATALOG[clean].macro;
  if (clean.startsWith('spring')) return 'spring_warm';
  if (clean.startsWith('summer')) return 'summer_cool';
  if (clean.startsWith('winter')) return 'winter_cool';
  return 'autumn_warm';
}

export function getPersonalColorLabels(key) {
  const clean = String(key || '').toLowerCase().trim();
  if (!clean) return { ko: null, en: null, macro: 'autumn_warm' };
  const entry = PERSONAL_COLOR_CATALOG[clean];
  if (entry) return entry;
  const macro = resolveMacroPersonalColor(clean);
  return PERSONAL_COLOR_CATALOG[macro];
}

export const MANIFEST_SLOT_GLB_BY_SUB = {
  beanie: { slotKey: 'headwear', baseGlb: 'headwear_beanie', physicsPreset: 'rigid_fitted' },
  cap: { slotKey: 'headwear', baseGlb: 'headwear_cap', physicsPreset: 'rigid_fitted' },
  beret: { slotKey: 'headwear', baseGlb: 'headwear_beret', physicsPreset: 'rigid_fitted' },
  bucket_hat: { slotKey: 'headwear', baseGlb: 'headwear_fedora', physicsPreset: 'rigid_fitted' },
  scarf: { slotKey: 'neckwear', baseGlb: 'neckwear_scarf', physicsPreset: 'soft_jiggle_muffler' },
  muffler: { slotKey: 'neckwear', baseGlb: 'neckwear_scarf', physicsPreset: 'soft_jiggle_muffler' },
  necktie: { slotKey: 'neckwear', baseGlb: 'neckwear_tie', physicsPreset: 'soft_jiggle_tie' },
  trench: { slotKey: 'outer', baseGlb: 'outer_coat', physicsPreset: 'hem_sway_coat' },
  coat: { slotKey: 'outer', baseGlb: 'outer_coat', physicsPreset: 'hem_sway_coat' },
  blazer: { slotKey: 'outer', baseGlb: 'outer_blazer', physicsPreset: 'drape_wind_garment' },
  jacket: { slotKey: 'outer', baseGlb: 'outer_jacket', physicsPreset: 'drape_wind_garment' },
  windbreaker: { slotKey: 'outer', baseGlb: 'outer_jacket', physicsPreset: 'drape_wind_garment' },
  denim_jacket: { slotKey: 'outer', baseGlb: 'outer_jacket', physicsPreset: 'rigid_fitted' },
  leather_jacket: { slotKey: 'outer', baseGlb: 'outer_jacket', physicsPreset: 'rigid_fitted' },
  field_jacket: { slotKey: 'outer', baseGlb: 'outer_jacket', physicsPreset: 'drape_wind_garment' },
  padding: { slotKey: 'outer', baseGlb: 'outer_jacket', physicsPreset: 'drape_wind_garment' },
  short_padding: { slotKey: 'outer', baseGlb: 'outer_jacket', physicsPreset: 'drape_wind_garment' },
  long_padding: { slotKey: 'outer', baseGlb: 'outer_coat', physicsPreset: 'hem_sway_coat' },
  fleece: { slotKey: 'outer', baseGlb: 'outer_jacket', physicsPreset: 'drape_wind_garment' },
  mustang: { slotKey: 'outer', baseGlb: 'outer_jacket', physicsPreset: 'rigid_fitted' },
  knit: { slotKey: 'top', baseGlb: 'top_knit', physicsPreset: 'drape_wind_garment' },
  cardigan: { slotKey: 'top_mid', baseGlb: 'top_cardigan', physicsPreset: 'drape_wind_garment' },
  vest: { slotKey: 'top_mid', baseGlb: 'top_knit', physicsPreset: 'rigid_fitted' },
  shirt: { slotKey: 'top', baseGlb: 'top_shirt', physicsPreset: 'drape_wind_garment' },
  short_shirt: { slotKey: 'top', baseGlb: 'top_shirt', physicsPreset: 'drape_wind_garment' },
  blouse: { slotKey: 'top', baseGlb: 'top_shirt', physicsPreset: 'drape_wind_garment' },
  tshirt: { slotKey: 'top', baseGlb: 'top_tshirt', physicsPreset: 'drape_wind_garment' },
  tank_top: { slotKey: 'top', baseGlb: 'top_tshirt', physicsPreset: 'rigid_fitted' },
  sleeveless: { slotKey: 'top', baseGlb: 'top_tshirt', physicsPreset: 'drape_wind_garment' },
  sweatshirt: { slotKey: 'top', baseGlb: 'top_sweatshirt', physicsPreset: 'drape_wind_garment' },
  hoodie: { slotKey: 'top', baseGlb: 'top_sweatshirt', physicsPreset: 'drape_wind_garment' },
  slacks: { slotKey: 'bottom', baseGlb: 'bottom_slacks', physicsPreset: 'drape_wind_garment' },
  denim: { slotKey: 'bottom', baseGlb: 'bottom_denim', physicsPreset: 'rigid_fitted' },
  chinos: { slotKey: 'bottom', baseGlb: 'bottom_slacks', physicsPreset: 'drape_wind_garment' },
  cargo: { slotKey: 'bottom', baseGlb: 'bottom_slacks', physicsPreset: 'drape_wind_garment' },
  jogger: { slotKey: 'bottom', baseGlb: 'bottom_slacks', physicsPreset: 'drape_wind_garment' },
  skirt: { slotKey: 'bottom', baseGlb: 'bottom_skirt', physicsPreset: 'hem_sway_skirt' },
  shorts: { slotKey: 'bottom', baseGlb: 'bottom_shorts', physicsPreset: 'drape_wind_garment' },
  dress: { slotKey: 'dress', baseGlb: 'dress_shift', physicsPreset: 'hem_sway_skirt' },
  onepiece: { slotKey: 'dress', baseGlb: 'dress_onepiece', physicsPreset: 'hem_sway_skirt' },
  swimsuit: { slotKey: 'dress', baseGlb: 'dress_onepiece', physicsPreset: 'rigid_fitted' },
  bikini: { slotKey: 'dress', baseGlb: 'dress_onepiece', physicsPreset: 'rigid_fitted' },
  rashguard: { slotKey: 'dress', baseGlb: 'dress_onepiece', physicsPreset: 'rigid_fitted' },
  swim_trunks: { slotKey: 'dress', baseGlb: 'dress_onepiece', physicsPreset: 'drape_wind_garment' },
  gloves: { slotKey: 'gloves', baseGlb: 'gloves_short', physicsPreset: 'rigid_fitted' },
  leather_gloves: { slotKey: 'gloves', baseGlb: 'gloves_short', physicsPreset: 'rigid_fitted' },
  inner_top: { slotKey: 'underwear', baseGlb: 'underwear_top', physicsPreset: 'rigid_fitted' },
  nubra: { slotKey: 'underwear', baseGlb: 'underwear_top', physicsPreset: 'rigid_fitted' },
  adhesive_bra: { slotKey: 'underwear', baseGlb: 'underwear_top', physicsPreset: 'rigid_fitted' },
  boxer_briefs: { slotKey: 'underwear', baseGlb: 'underwear_briefs', physicsPreset: 'rigid_fitted' },
  woven_boxers: { slotKey: 'underwear', baseGlb: 'underwear_briefs', physicsPreset: 'rigid_fitted' },
  seamless_underwear: { slotKey: 'underwear', baseGlb: 'underwear_briefs', physicsPreset: 'rigid_fitted' },
  lace_underwear: { slotKey: 'underwear', baseGlb: 'underwear_briefs', physicsPreset: 'rigid_fitted' },
  thong_underwear: { slotKey: 'underwear', baseGlb: 'underwear_briefs', physicsPreset: 'rigid_fitted' },
  underwear: { slotKey: 'underwear', baseGlb: 'underwear_briefs', physicsPreset: 'rigid_fitted' },
  crew_socks: { slotKey: 'socks', baseGlb: 'socks_crew', physicsPreset: 'rigid_fitted' },
  socks: { slotKey: 'socks', baseGlb: 'socks_crew', physicsPreset: 'rigid_fitted' },
  sneakers: { slotKey: 'shoes', baseGlb: 'shoes_sneakers', physicsPreset: 'rigid_fitted' },
  loafers: { slotKey: 'shoes', baseGlb: 'shoes_loafers', physicsPreset: 'rigid_fitted' },
  derby: { slotKey: 'shoes', baseGlb: 'shoes_loafers', physicsPreset: 'rigid_fitted' },
  boots: { slotKey: 'shoes', baseGlb: 'shoes_boots', physicsPreset: 'rigid_fitted' },
  long_boots: { slotKey: 'shoes', baseGlb: 'shoes_boots', physicsPreset: 'rigid_fitted' },
  snow_boots: { slotKey: 'shoes', baseGlb: 'shoes_boots', physicsPreset: 'rigid_fitted' },
  heels: { slotKey: 'shoes', baseGlb: 'shoes_heels', physicsPreset: 'rigid_fitted' },
  sandals: { slotKey: 'shoes', baseGlb: 'shoes_loafers', physicsPreset: 'rigid_fitted' },
  slides: { slotKey: 'shoes', baseGlb: 'shoes_sneakers', physicsPreset: 'rigid_fitted' },
  flip_flops: { slotKey: 'shoes', baseGlb: 'shoes_sneakers', physicsPreset: 'rigid_fitted' },
  briefcase: { slotKey: 'accessory', baseGlb: 'accessory_briefcase', physicsPreset: 'pendulum_briefcase' },
  tote: { slotKey: 'accessory', baseGlb: 'accessory_tote', physicsPreset: 'pendulum_tote' },
  bag: { slotKey: 'accessory', baseGlb: 'accessory_bag', physicsPreset: 'pendulum_crossbody' },
  backpack: { slotKey: 'accessory', baseGlb: 'accessory_bag', physicsPreset: 'rigid_fitted' },
  messenger: { slotKey: 'accessory', baseGlb: 'accessory_bag', physicsPreset: 'pendulum_crossbody' },
  clutch: { slotKey: 'accessory', baseGlb: 'accessory_briefcase', physicsPreset: 'pendulum_briefcase' },
  duffel: { slotKey: 'accessory', baseGlb: 'accessory_briefcase', physicsPreset: 'pendulum_briefcase' },
  hobo: { slotKey: 'accessory', baseGlb: 'accessory_tote', physicsPreset: 'pendulum_tote' },
  sunglasses: { slotKey: 'accessory', baseGlb: 'accessory_glasses', physicsPreset: 'rigid_fitted' },
  eyewear: { slotKey: 'accessory', baseGlb: 'accessory_glasses', physicsPreset: 'rigid_fitted' },
  umbrella: { slotKey: 'accessory', baseGlb: 'accessory_bag', physicsPreset: 'pendulum_briefcase' },
  watch: { slotKey: 'accessory', baseGlb: 'accessory_watch', physicsPreset: 'rigid_fitted' },
  belt: { slotKey: 'accessory', baseGlb: 'accessory_belt', physicsPreset: 'rigid_fitted' },
  glasses: { slotKey: 'accessory', baseGlb: 'accessory_glasses', physicsPreset: 'rigid_fitted' },
  headwear: { slotKey: 'headwear', baseGlb: 'headwear_beanie', physicsPreset: 'rigid_fitted' },
  neckwear: { slotKey: 'neckwear', baseGlb: 'neckwear_scarf', physicsPreset: 'drape_wind_garment' },
  earring: { slotKey: 'accessory', baseGlb: 'accessory_watch', physicsPreset: 'rigid_fitted' },
  necklace: { slotKey: 'accessory', baseGlb: 'accessory_watch', physicsPreset: 'rigid_fitted' },
  bracelet: { slotKey: 'accessory', baseGlb: 'accessory_watch', physicsPreset: 'rigid_fitted' },
  ring: { slotKey: 'accessory', baseGlb: 'accessory_watch', physicsPreset: 'rigid_fitted' },
  brooch: { slotKey: 'accessory', baseGlb: 'accessory_watch', physicsPreset: 'rigid_fitted' },
};

export function resolveManifestSlotAndGlb(category = 'top', subcategory = 'knit') {
  const cat = String(category || 'top').toLowerCase().trim();
  const sub = String(subcategory || '').toLowerCase().trim();
  if (cat === 'outer' && sub === 'cardigan') {
    return { slotKey: 'outer', baseGlb: 'outer_blazer', physicsPreset: 'drape_wind_garment' };
  }
  if (MANIFEST_SLOT_GLB_BY_SUB[sub]) {
    return MANIFEST_SLOT_GLB_BY_SUB[sub];
  }
  const fallbackByCat = {
    headwear: MANIFEST_SLOT_GLB_BY_SUB.beanie,
    neckwear: MANIFEST_SLOT_GLB_BY_SUB.scarf,
    outer: MANIFEST_SLOT_GLB_BY_SUB.coat,
    top: MANIFEST_SLOT_GLB_BY_SUB.knit,
    bottom: MANIFEST_SLOT_GLB_BY_SUB.slacks,
    dress: MANIFEST_SLOT_GLB_BY_SUB.dress,
    gloves: MANIFEST_SLOT_GLB_BY_SUB.leather_gloves,
    underwear: MANIFEST_SLOT_GLB_BY_SUB.inner_top,
    socks: MANIFEST_SLOT_GLB_BY_SUB.crew_socks,
    shoes: MANIFEST_SLOT_GLB_BY_SUB.loafers,
    accessory: MANIFEST_SLOT_GLB_BY_SUB.bag,
    jewelry: MANIFEST_SLOT_GLB_BY_SUB.necklace,
    bag: MANIFEST_SLOT_GLB_BY_SUB.bag,
  };
  return fallbackByCat[cat] || MANIFEST_SLOT_GLB_BY_SUB.knit;
}
