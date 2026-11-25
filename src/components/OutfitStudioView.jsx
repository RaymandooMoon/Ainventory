import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarPlus,
  Check,
  ChevronLeft,
  Cloud,
  CloudRain,
  CloudSun,
  Filter,
  Flame,
  Loader2,
  LocateFixed,
  MapPin,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Snowflake,
  Store,
  Sun,
  Trash2,
  Wind,
  X,
} from 'lucide-react';
import { CARBON_DOM_CONTRACT } from '../contracts/carbonDesignContract.ts';
import {
  bridgeLegacyPropsToAvatarSpec,
  useAvatarSpec,
} from '../services/avatarSpecStore.ts';
import {
  ACCESSORY_SUBTREE_SLOTS,
  ALL_EQUIPPABLE_SLOT_KEYS,
  FITTING_SLOTS,
  JEWELRY_SUBTREE_SLOTS,
  SUB_SLOT_META_BY_KEY,
  doesGarmentMatchSubSlot,
  getOppositeSideSubSlot,
  isAccessorySlotKey,
  isJewelrySlotKey,
  isSwimwearGarment,
  isUmbrellaGarment,
  isWearableStudioGarment,
  mapGarmentToDefaultSubSlot,
  mapGarmentToFittingSlot,
  resolveParentFittingTab,
} from '../services/fittingRenderer.ts';
import { SEASON_BEST_SWATCHES } from '../services/skinToneAnalyzer.ts';
import { formatKoreanDistrictLocation } from '../services/vtonQualityControl.ts';
import { inferBagCarrySpec, isBagGarmentItem } from '../shared/garmentTaxonomy.js';
import {
  doesUnderwearMatchGender,
  evaluateUnderwearOuterInteraction,
  isSaggingEligibleBottom,
} from '../shared/underwearStylingEngine.js';
import { CITY_COORDS, apiFetch, isDemoVtonAccount } from '../utils/api.ts';
import { guardUserPermission } from '../utils/accessControl.ts';
import { fetchDirectOpenMeteoWeather } from '../utils/liveWeatherClient.ts';
import {
  localizeApiMessage,
  localizeBrandName,
  localizeColorName,
  localizeGarmentName,
  localizeMaterialLabel,
  localizeOutfitTitle,
  tx,
} from '../utils/i18n.ts';
import { triggerHaptic, withPublicBaseUrl } from '../utils/nativeBridge.ts';
import { computeNextVisibleBatch } from '../utils/resourcePriority.ts';
import { buildAutoOutfitTitle } from '../utils/outfitTitleGenerator.ts';
import {
  getLocalDateKey,
  incrementTomorrowPromptShownCount,
  markTodayOutfitGenerated,
  readTodayOutfitGeneratedDate,
  readTomorrowPromptShownCount,
  shouldShowTomorrowOutfitPrompt,
} from '../utils/tomorrowPromptPolicy.ts';
import {
  DEFAULT_LIGHTING_INTENSITY,
  DEMO_CYBERPUNK_LIGHTING_INTENSITY,
  ECONOMY_STATE_EVENT,
  createDemoCyberpunkEconomyState,
  equipStageBackground,
  getStageBackgroundById,
  hasFreeDailyDrawRemaining,
  loadStoredEconomyState,
  rollBackgroundGacha,
  saveStoredEconomyState,
  updateStageLightingSettings,
} from '../utils/stageBackgroundCatalog.ts';
import BackgroundPickerModal from './BackgroundPickerModal.jsx';
import GarmentObject25D from './GarmentObject25D.jsx';
import OutfitCategorySilhouetteRail from './OutfitCategorySilhouetteRail.tsx';
import StoreModal from './StoreModal.jsx';
import Studio25DCanvas from './Studio25DCanvas.jsx';
import StudioWeatherAlertBanner from './StudioWeatherAlertBanner.jsx';
import StudioUvSuggestionCard from './StudioUvSuggestionCard.jsx';
import {
  STYLING_PREF_EVENT,
  applyStylingDensityFilter,
  getStoredSelectedPlace,
  getStoredStylingPreference,
  inferTpoFromPlaceTypes,
  saveStoredSelectedPlace,
  saveStoredStylingPreference,
} from '../services/stylingPreferenceStore.ts';
import {
  autocompleteDestinationPlaces,
  buildPlacePhotoProxyUrl,
  buildStreetViewProxyUrl,
  createPlacesSessionToken,
  fetchDestinationPlaceDetails,
  fetchPlaceBackdropBundle,
  notifyGmpQuotaExceeded,
  peekCachedPlaceBackdropBundle,
  preloadBackdropImage,
  searchDestinationPlacesWithLocation,
} from '../services/mapsClientService.ts';
import { filterPlacesByEyeLevelStreetView } from '../services/streetViewProbeService.ts';
import {
  EMPTY_PLACE_BACKDROP_DATA,
  STREET_VIEW_HEADING_OPTIONS,
  getStoredPlaceBackdropPref,
  resolveActivePlaceBackdropVisual,
  saveStoredPlaceBackdropPref,
} from '../services/placeBackdropStore.ts';
import {
  PLACE_PHOTO_PROXY_MAX_HEIGHT,
  PLACE_PHOTO_PROXY_MAX_WIDTH,
  STREET_VIEW_PORTRAIT_PITCH,
} from '../utils/placeBackdropOptics.ts';
import {
  classifyUvLevelClient,
  formatUvLevelLabel,
  getEffectiveFeelsLikeTemp,
} from '../utils/uvSmartAccessory.ts';
import AppHeaderBrand from './common/AppHeaderBrand.tsx';
import { ResponsiveSheetModal, TopRightUtilityActions } from './common/AppUI.jsx';
import '../styles/atelierTokens.css';
import './OutfitWardrobeDrawer.css';

const DEFAULT_CITIES = [
  { key: 'seoul', name: '서울 · 중구 명동' },
  { key: 'gangnam_yeoksam', name: '서울 강남구 역삼동' },
  { key: 'mapo_yeonnam', name: '서울 마포구 연남동' },
  { key: 'seongdong_seongsu', name: '서울 성동구 성수동' },
  { key: 'jongno_samcheong', name: '서울 종로구 삼청동' },
  { key: 'yongsan_hannam', name: '서울 용산구 한남동' },
  { key: 'bundang_jeongja', name: '성남 분당구 정자동' },
  { key: 'busan_haeundae', name: '부산 해운대구 우동' },
  { key: 'jeju_aewol', name: '제주 제주시 애월읍' },
  { key: 'busan', name: '부산 중구 중앙동' },
  { key: 'jeju', name: '제주 제주시 연동' },
  { key: 'tokyo', name: '도쿄 시부야' },
  { key: 'newyork', name: '뉴욕 소호' },
  { key: 'paris', name: '파리 마레' },
];

const CITY_EN_NAMES = {
  seoul: 'Seoul · Myeongdong, Jung-gu',
  gangnam_yeoksam: 'Seoul · Yeoksam-dong, Gangnam-gu',
  mapo_yeonnam: 'Seoul · Yeonnam-dong, Mapo-gu',
  seongdong_seongsu: 'Seoul · Seongsu-dong, Seongdong-gu',
  jongno_samcheong: 'Seoul · Samcheong-dong, Jongno-gu',
  yongsan_hannam: 'Seoul · Hannam-dong, Yongsan-gu',
  bundang_jeongja: 'Seongnam · Jeongja-dong, Bundang-gu',
  busan_haeundae: 'Busan · U-dong, Haeundae-gu',
  jeju_aewol: 'Jeju · Aewol-eup',
  busan: 'Busan · Jungang-dong, Jung-gu',
  jeju: 'Jeju · Yeon-dong',
  tokyo: 'Tokyo · Shibuya',
  newyork: 'New York · SoHo',
  paris: 'Paris · Le Marais',
};

const SHORT_SCENARIO_LABELS = {
  live: { ko: '예보', en: 'Live' },
  crisp_autumn: { ko: '맑음', en: 'Clear' },
  cloudy_overcast: { ko: '흐림', en: 'Cloudy' },
  rainy_cool: { ko: '비', en: 'Rain' },
  snowy_winter: { ko: '눈', en: 'Snow' },
  windy_gale: { ko: '강풍', en: 'Windy' },
  warm_spring: { ko: '포근', en: 'Mild' },
  summer_heatwave: { ko: '폭염', en: 'Heatwave' },
  winter_cold: { ko: '한파', en: 'Coldwave' },
};

const DEFAULT_SCENARIOS = [
  { key: 'live', label: '예보' },
  { key: 'crisp_autumn', label: '맑음' },
  { key: 'cloudy_overcast', label: '흐림' },
  { key: 'rainy_cool', label: '비' },
  { key: 'snowy_winter', label: '눈' },
  { key: 'windy_gale', label: '강풍' },
  { key: 'warm_spring', label: '포근' },
  { key: 'summer_heatwave', label: '폭염' },
  { key: 'winter_cold', label: '한파' },
];

const STUDIO_OCCASION_TABS = [
  { key: 'all', ko: '전체', en: 'All' },
  { key: 'daily', ko: '데일리', en: 'Daily' },
  { key: 'office', ko: '오피스', en: 'Office' },
  { key: 'formal', ko: '포멀', en: 'Formal' },
];

const DAILY_KEYWORDS_RE =
  /daily|casual|sport|street|hiphop|hip-hop|bomber|varsity|teddy|oversized|cargo|jogger|track|sling|trucker|combat|tshirt|t-shirt|tee|hood|sweat|denim|jean|short|sneaker|sandal|flip_flop|cap|beanie|bucket|windbreaker|parka|padding|puffer|cardigan|knit|tote|backpack|messenger|duffel|weekender|hobo|swim|bikini|rashguard|데일리|캐주얼|스트릿|힙합|보머|바시티|오버사이즈|카고|조거|트랙|슬링백|트러커|컴뱃|티셔츠|데님|청바지|스니커즈|후드|맨투맨|패딩|푸퍼|볼캡|비니|버킷햇|윈드브레이커|가디건|니트|토트|백팩|메신저|더플|위켄더|호보|수영복/i;

const OFFICE_KEYWORDS_RE =
  /office|smart|business|shirt|blouse|slacks|trouser|blazer|trench|coat|loafer|derby|oxford|heel|pump|briefcase|shoulder|messenger|backpack|watch|belt|eyewear|glasses|scarf|cardigan|skirt|pleat|dress|onepiece|오피스|출근|셔츠|블라우스|슬랙스|블레이저|트렌치|코트|로퍼|브리프케이스|숄더백|메신저|백팩|안경|아이웨어|시계|벨트|스커트|원피스/i;

const FORMAL_KEYWORDS_RE =
  /formal|ceremony|evening|suit|blazer|coat|dress|onepiece|silk|cashmere|wool|necktie|tie|oxford|derby|heel|pump|boot|clutch|briefcase|pearl|diamond|gold|silver|platinum|brooch|necklace|earring|ring|bracelet|watch|포멀|정장|수트|하객|블레이저|핸드메이드|실크|캐시미어|타이|넥타이|옥스포드|더비|힐|부츠|원피스|브로치|목걸이|귀걸이|반지|진주|골드|실버/i;

function doesGarmentMatchOccasion(garment, occasionFilter) {
  if (!occasionFilter || occasionFilter === 'all') return true;
  if (!garment) return false;

  const formality = String(garment.formality || '')
    .trim()
    .toLowerCase();
  const occasionRaw = String(garment.occasion || '')
    .trim()
    .toLowerCase();
  const blob = [
    garment.occasion,
    garment.subcategory,
    garment.name,
    garment.name_en,
    garment.fabric,
    garment.brand,
  ]
    .filter(Boolean)
    .join(' ');

  if (occasionFilter === 'daily') {
    if (formality === 'casual' || formality === 'sport') return true;
    if (occasionRaw.includes('daily') || occasionRaw.includes('데일리') || occasionRaw.includes('casual')) {
      return true;
    }
    if (DAILY_KEYWORDS_RE.test(blob)) return true;
    return !formality && !FORMAL_KEYWORDS_RE.test(blob);
  }

  if (occasionFilter === 'office') {
    if (formality === 'smart') return true;
    if (
      occasionRaw.includes('office') ||
      occasionRaw.includes('오피스') ||
      occasionRaw.includes('business') ||
      occasionRaw.includes('출근')
    ) {
      return true;
    }
    return OFFICE_KEYWORDS_RE.test(blob);
  }

  if (occasionFilter === 'formal') {
    if (formality === 'formal') return true;
    if (
      occasionRaw.includes('formal') ||
      occasionRaw.includes('포멀') ||
      occasionRaw.includes('하객') ||
      occasionRaw.includes('정장')
    ) {
      return true;
    }
    return FORMAL_KEYWORDS_RE.test(blob);
  }

  return true;
}

const STUDIO_SEASON_FILTERS = [
  { key: 'all', ko: '사계절 전체', en: 'All Seasons' },
  { key: '봄', ko: '봄', en: 'Spring' },
  { key: '여름', ko: '여름', en: 'Summer' },
  { key: '가을', ko: '가을', en: 'Autumn' },
  { key: '겨울', ko: '겨울', en: 'Winter' },
];

const SEASON_TOKEN_ALIAS = {
  spring: '봄',
  summer: '여름',
  autumn: '가을',
  fall: '가을',
  winter: '겨울',
  봄: '봄',
  여름: '여름',
  가을: '가을',
  겨울: '겨울',
};

function groupSubSlotsByBranch(subSlots) {
  const branches = [];
  const byKey = new Map();
  for (const slot of subSlots) {
    let group = byKey.get(slot.branchKey);
    if (!group) {
      group = {
        branchKey: slot.branchKey,
        branchKo: slot.branchKo,
        branchEn: slot.branchEn,
        items: [],
      };
      byKey.set(slot.branchKey, group);
      branches.push(group);
    }
    group.items.push(slot);
  }
  return branches;
}

const ACCESSORY_BRANCH_GROUPS = groupSubSlotsByBranch(ACCESSORY_SUBTREE_SLOTS);
const JEWELRY_BRANCH_GROUPS = groupSubSlotsByBranch(JEWELRY_SUBTREE_SLOTS);

const EMPTY_STUDIO_SLOTS = Object.freeze(
  Object.fromEntries(ALL_EQUIPPABLE_SLOT_KEYS.map((k) => [k, null]))
);

function normalizeSeasonToken(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  return SEASON_TOKEN_ALIAS[s.toLowerCase()] || s;
}

function parseSeasons(rawSeasons) {
  if (Array.isArray(rawSeasons)) {
    return rawSeasons.map(normalizeSeasonToken).filter(Boolean);
  }
  if (typeof rawSeasons === 'string') {
    const trimmed = rawSeasons.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map(normalizeSeasonToken).filter(Boolean);
        }
      } catch {
        // fall through to delimiter split
      }
    }
    return trimmed
      .split(/[,/|]+/)
      .map(normalizeSeasonToken)
      .filter(Boolean);
  }
  return [];
}

const HANGUL_CHAR_RE = /[\uAC00-\uD7A3\u3131-\u318E]/;

const PARENT_CATEGORY_HEADER_LABELS = {
  outer: { ko: '외투', en: 'Outerwear' },
  top: { ko: '상의', en: 'Tops' },
  bottom: { ko: '하의', en: 'Bottoms' },
  onepiece: { ko: '원피스', en: 'Dresses' },
  underwear: { ko: '언더웨어', en: 'Underwear' },
  socks: { ko: '양말', en: 'Socks' },
  shoes: { ko: '신발', en: 'Shoes' },
  bag: { ko: '가방', en: 'Bags' },
  accessory: { ko: '액세서리', en: 'Accessories' },
  jewelry: { ko: '주얼리', en: 'Jewelry' },
};

const SUBCATEGORY_DISPLAY_MAP = {
  trench: { ko: '트렌치코트', en: 'Trench Coat' },
  trench_coat: { ko: '트렌치코트', en: 'Trench Coat' },
  coat: { ko: '코트', en: 'Coat' },
  mac_coat: { ko: '맥코트', en: 'Mac Coat' },
  blazer: { ko: '블레이저', en: 'Blazer' },
  jacket: { ko: '자켓', en: 'Jacket' },
  liner_jacket: { ko: '라이너 자켓', en: 'Liner Jacket' },
  cardigan: { ko: '가디건', en: 'Cardigan' },
  puffer: { ko: '패딩', en: 'Puffer' },
  padding: { ko: '패딩', en: 'Puffer' },
  parka: { ko: '파카', en: 'Parka' },
  windbreaker: { ko: '윈드브레이커', en: 'Windbreaker' },
  knit: { ko: '니트', en: 'Knitwear' },
  sweater: { ko: '스웨터', en: 'Sweater' },
  turtleneck: { ko: '터틀넥', en: 'Turtleneck' },
  shirt: { ko: '셔츠', en: 'Shirt' },
  blouse: { ko: '블라우스', en: 'Blouse' },
  tshirt: { ko: '티셔츠', en: 'T-Shirt' },
  't-shirt': { ko: '티셔츠', en: 'T-Shirt' },
  tee: { ko: '티셔츠', en: 'T-Shirt' },
  hoodie: { ko: '후드', en: 'Hoodie' },
  sweatshirt: { ko: '맨투맨', en: 'Sweatshirt' },
  innerwear: { ko: '이너웨어', en: 'Base Layer' },
  base_layer: { ko: '이너웨어', en: 'Base Layer' },
  slacks: { ko: '슬랙스', en: 'Slacks' },
  trousers: { ko: '트라우저', en: 'Trousers' },
  pants: { ko: '팬츠', en: 'Pants' },
  denim: { ko: '데님 팬츠', en: 'Denim' },
  jeans: { ko: '데님 팬츠', en: 'Jeans' },
  chino: { ko: '치노 팬츠', en: 'Chinos' },
  shorts: { ko: '쇼츠', en: 'Shorts' },
  skirt: { ko: '스커트', en: 'Skirt' },
  dress: { ko: '원피스', en: 'Dress' },
  onepiece: { ko: '원피스', en: 'Dress' },
  jumpsuit: { ko: '점프수트', en: 'Jumpsuit' },
  swimwear: { ko: '수영복', en: 'Swimwear' },
  sneakers: { ko: '스니커즈', en: 'Sneakers' },
  loafers: { ko: '로퍼', en: 'Loafers' },
  loafer: { ko: '로퍼', en: 'Loafers' },
  boots: { ko: '부츠', en: 'Boots' },
  heels: { ko: '힐', en: 'Heels' },
  pumps: { ko: '펌프스', en: 'Pumps' },
  sandals: { ko: '샌들', en: 'Sandals' },
  derby: { ko: '더비 슈즈', en: 'Derby Shoes' },
  oxford: { ko: '옥스포드 슈즈', en: 'Oxford Shoes' },
  bag: { ko: '가방', en: 'Bag' },
  tote: { ko: '토트백', en: 'Tote Bag' },
  briefcase: { ko: '브리프케이스', en: 'Briefcase' },
  crossbody: { ko: '크로스백', en: 'Crossbody Bag' },
  shoulder_bag: { ko: '숄더백', en: 'Shoulder Bag' },
  backpack: { ko: '백팩', en: 'Backpack' },
  messenger: { ko: '메신저백', en: 'Messenger Bag' },
  clutch: { ko: '클러치백', en: 'Clutch' },
  duffel: { ko: '더플백', en: 'Duffel Bag' },
  hobo: { ko: '호보백', en: 'Hobo Bag' },
  scarf: { ko: '스카프·머플러', en: 'Scarf' },
  muffler: { ko: '머플러', en: 'Scarf' },
  necktie: { ko: '넥타이', en: 'Necktie' },
  tie: { ko: '넥타이', en: 'Tie' },
  cap: { ko: '볼캡', en: 'Cap' },
  beanie: { ko: '비니', en: 'Beanie' },
  beret: { ko: '베레모', en: 'Beret' },
  hat: { ko: '모자', en: 'Hat' },
  bucket_hat: { ko: '버킷햇', en: 'Bucket Hat' },
  gloves: { ko: '장갑', en: 'Gloves' },
  glove: { ko: '장갑', en: 'Gloves' },
  socks: { ko: '양말', en: 'Socks' },
  street_crew_socks: { ko: '스트릿 크루 삭스', en: 'Street Crew Socks' },
  sheer_socks: { ko: '시어 드레스 삭스', en: 'Sheer Dress Socks' },
  no_show_socks: { ko: '페이크 삭스', en: 'No-Show Socks' },
  underwear: { ko: '언더웨어', en: 'Underwear' },
  boxer_briefs: { ko: '드로즈 (박서 브리프)', en: 'Boxer Briefs' },
  woven_boxers: { ko: '트렁크 복서', en: 'Woven Boxers' },
  seamless_underwear: { ko: '심리스 이너웨어', en: 'Seamless Innerwear' },
  lace_underwear: { ko: '레이스 언더웨어', en: 'Lace Underwear' },
  nubra: { ko: '누브라', en: 'Nubra' },
  adhesive_bra: { ko: '누브라', en: 'Adhesive Bra' },
  thong_underwear: { ko: 'T팬티', en: 'Thong' },
  watch: { ko: '시계', en: 'Watch' },
  belt: { ko: '벨트', en: 'Belt' },
  eyewear: { ko: '아이웨어', en: 'Eyewear' },
  glasses: { ko: '안경', en: 'Glasses' },
  sunglasses: { ko: '선글라스', en: 'Sunglasses' },
  umbrella: { ko: '우산', en: 'Umbrella' },
  necklace: { ko: '목걸이', en: 'Necklace' },
  earring: { ko: '귀걸이', en: 'Earrings' },
  earrings: { ko: '귀걸이', en: 'Earrings' },
  bracelet: { ko: '팔찌', en: 'Bracelet' },
  ring: { ko: '반지', en: 'Ring' },
  brooch: { ko: '브로치', en: 'Brooch' },
};

const SEASON_DISPLAY_MAP = {
  봄: { ko: '봄', en: 'Spring' },
  여름: { ko: '여름', en: 'Summer' },
  가을: { ko: '가을', en: 'Autumn' },
  겨울: { ko: '겨울', en: 'Winter' },
};

function sanitizeZeroHangulEn(value, lang, fallbackEn = '') {
  const str = String(value ?? '').trim();
  if (!str) return fallbackEn;
  if (lang !== 'en') return str;
  if (!HANGUL_CHAR_RE.test(str)) return str;
  const localized = localizeGarmentName(str, 'en');
  if (localized && !HANGUL_CHAR_RE.test(localized)) return localized;
  const stripped = str
    .replace(/[\uAC00-\uD7A3\u3131-\u318E]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || fallbackEn;
}

function resolveGarmentDisplayName(item, lang) {
  if (!item) return '';
  if (lang === 'en' && typeof item.name_en === 'string' && item.name_en.trim()) {
    const candidate = item.name_en.trim();
    if (!HANGUL_CHAR_RE.test(candidate)) return candidate;
  }
  const localized = localizeGarmentName(item.name, lang);
  return sanitizeZeroHangulEn(localized, lang, 'Wardrobe Item');
}

function resolveInspectorSubcategoryLabel(item, lang) {
  const rawSub = String(item?.subcategory ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (rawSub && SUBCATEGORY_DISPLAY_MAP[rawSub]) {
    const pair = SUBCATEGORY_DISPLAY_MAP[rawSub];
    return lang === 'en' ? pair.en : pair.ko;
  }
  const rawOriginal = String(item?.subcategory ?? '').trim();
  if (rawOriginal) {
    if (lang === 'en') {
      if (!HANGUL_CHAR_RE.test(rawOriginal)) {
        return rawOriginal
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (ch) => ch.toUpperCase());
      }
      return sanitizeZeroHangulEn(localizeGarmentName(rawOriginal, 'en'), 'en', 'Apparel');
    }
    return rawOriginal.replace(/_/g, ' ');
  }
  const slotKey = item ? mapGarmentToFittingSlot(item) : 'top';
  const parentKey = resolveParentFittingTab(slotKey);
  const parentPair = PARENT_CATEGORY_HEADER_LABELS[parentKey] || PARENT_CATEGORY_HEADER_LABELS.top;
  return lang === 'en' ? parentPair.en : parentPair.ko;
}

function resolveInspectorMaterialLabel(rawFabric, lang) {
  const s = String(rawFabric ?? '').trim().toLowerCase();
  const isEn = lang === 'en';
  if (!s) return isEn ? 'Cotton Blend' : '코튼 혼방';
  if (/gabardine|개버딘/.test(s)) return isEn ? 'Cotton Gabardine' : '코튼 개버딘';
  if (/supima|수피마/.test(s)) return isEn ? 'Supima Cotton' : '수피마 코튼';
  if (/poplin|포플린/.test(s)) return isEn ? 'Cotton Poplin' : '포플린 코튼';
  if (/oxford|옥스포드/.test(s)) return isEn ? 'Oxford Cotton' : '옥스포드 코튼';
  if (/denim|selvedge|데님|셀비지/.test(s)) return isEn ? 'Denim' : '데님';
  if (/linen|리넨|린넨/.test(s)) return isEn ? 'Linen' : '리넨';
  if (/merino|메리노/.test(s)) return isEn ? 'Merino Wool' : '메리노 울';
  if (/cashmere|캐시미어/.test(s)) return isEn ? 'Cashmere' : '캐시미어';
  if (/goose|down|구스|다운/.test(s)) return isEn ? 'Goose Down' : '구스다운';
  if (/suede|스웨이드/.test(s)) return isEn ? 'Suede' : '스웨이드';
  if (/modal|모달/.test(s)) return isEn ? 'Modal' : '모달';
  if (/nylon|나일론/.test(s)) return isEn ? 'Nylon' : '나일론';
  if (/cotton|코튼|면/.test(s)) return isEn ? 'Cotton' : '코튼';
  const fallback = localizeMaterialLabel(rawFabric, lang);
  return sanitizeZeroHangulEn(fallback, lang, 'Fabric');
}

function resolveInspectorSeasonLabel(rawSeasons, lang) {
  const tokens = parseSeasons(rawSeasons);
  const unique = [];
  for (const tk of tokens) {
    if (SEASON_DISPLAY_MAP[tk] && !unique.includes(tk)) {
      unique.push(tk);
    }
  }
  if (unique.length === 0 || unique.length >= 4) {
    return tx(lang, '사계절', 'All Seasons');
  }
  const labels = unique.map((tk) =>
    lang === 'en' ? SEASON_DISPLAY_MAP[tk].en : SEASON_DISPLAY_MAP[tk].ko
  );
  return lang === 'en' ? labels.join('/') : labels.join('·');
}

function resolveGarmentInspectorSpecs(item, lang) {
  const displayName = resolveGarmentDisplayName(item, lang);
  const rawBrand = String(item?.brand ?? '').trim();
  const brandLabel = rawBrand
    ? sanitizeZeroHangulEn(localizeBrandName(rawBrand, lang), lang, 'Ainventory Closet')
    : tx(lang, '개인 옷장', 'Ainventory Closet');
  const subcategoryLabel = resolveInspectorSubcategoryLabel(item, lang);
  const colorHex =
    typeof item?.color_hex === 'string' && item.color_hex.trim()
      ? item.color_hex.trim()
      : '#8E8E93';
  const rawColor = String(item?.color_name ?? '').trim();
  const colorLabel = rawColor
    ? sanitizeZeroHangulEn(localizeColorName(rawColor, lang), lang, 'Neutral')
    : tx(lang, '모노톤', 'Neutral');
  const materialLabel = resolveInspectorMaterialLabel(item?.fabric, lang);
  const seasonLabel = resolveInspectorSeasonLabel(item?.seasons, lang);

  return {
    displayName,
    brandLabel,
    subcategoryLabel,
    colorHex,
    colorLabel,
    materialLabel,
    seasonLabel,
  };
}

function mapWeatherRecToSlots(rec, allGarments, weather, options = {}) {
  const allowOutdoorUmbrella = options?.allowOutdoorUmbrella !== false;
  const byId = new Map((allGarments || []).map((g) => [Number(g.id), g]));
  const resolveItem = (raw) => {
    if (!raw) return null;
    const candidate = byId.get(Number(raw.id)) || raw;
    return isWearableStudioGarment(candidate) ? candidate : null;
  };

  const slotMap = rec?.loadoutBySlot || {};
  const isChillyOrWindy = Boolean(
    weather?.isWindy || (typeof weather?.avgTemp === 'number' && weather.avgTemp <= 11)
  );
  const isRainyWeather = Boolean(
    weather?.isRainy || weather?.isRaining || weather?.scenarioKey === 'rainy_cool'
  );

  const next = { ...EMPTY_STUDIO_SLOTS };

  next.outer = resolveItem(slotMap.outer);
  next.outer_mid = resolveItem(slotMap.outer_mid);
  next.onepiece = resolveItem(slotMap.onepiece) || resolveItem(slotMap.dress);
  const rawTop = resolveItem(slotMap.top);
  if (!next.onepiece && rawTop && mapGarmentToFittingSlot(rawTop) === 'onepiece') {
    next.onepiece = rawTop;
  }

  const hasNonSwimOnepiece = Boolean(next.onepiece && !isSwimwearGarment(next.onepiece));
  next.top =
    hasNonSwimOnepiece || (rawTop && mapGarmentToFittingSlot(rawTop) === 'onepiece')
      ? null
      : rawTop;
  next.top_mid = hasNonSwimOnepiece ? null : resolveItem(slotMap.top_mid);
  next.bottom = hasNonSwimOnepiece ? null : resolveItem(slotMap.bottom);
  next.underwear_top = resolveItem(slotMap.underwear_top);
  next.underwear = resolveItem(slotMap.underwear);
  next.shoes = resolveItem(slotMap.shoes);

  const isBottomBeltAllowed = (bottomItem) => {
    if (!bottomItem || typeof bottomItem !== 'object') return false;
    const rawDet = bottomItem.garment_details;
    let det = rawDet && typeof rawDet === 'object' ? rawDet : null;
    if (!det && typeof bottomItem.garment_details_json === 'string' && bottomItem.garment_details_json.trim()) {
      try {
        det = JSON.parse(bottomItem.garment_details_json);
      } catch {
        det = null;
      }
    }
    if (det?.belt_compatible === false) return false;
    if (det?.belt_compatible === true) return true;
    const waistType = String(det?.waist_type || '').toLowerCase();
    if (waistType === 'elastic' || waistType === 'drawstring') return false;
    return true;
  };

  const candidateAcc = resolveItem(slotMap.accessory);
  const candidateNeck = resolveItem(slotMap.neckwear) || resolveItem(slotMap.acc_neck);
  const candidateHead = resolveItem(slotMap.headwear) || resolveItem(slotMap.acc_head);
  const candidateBelt = resolveItem(slotMap.acc_belt) || resolveItem(slotMap.belt);
  const candidateUmbrella = allowOutdoorUmbrella
    ? resolveItem(slotMap.acc_umbrella) ||
      resolveItem(slotMap.umbrella) ||
      (isRainyWeather
        ? (allGarments || []).find((g) => isWearableStudioGarment(g) && isUmbrellaGarment(g)) || null
        : null)
    : null;

  if (candidateAcc) {
    const mappedAccSlot = mapGarmentToDefaultSubSlot(candidateAcc);
    if (mappedAccSlot !== 'acc_belt' || isBottomBeltAllowed(next.bottom)) {
      next[mappedAccSlot] = candidateAcc;
    }
  }
  if (candidateBelt && isBottomBeltAllowed(next.bottom) && !next.acc_belt) {
    next.acc_belt = candidateBelt;
  }
  if (candidateNeck && !next.acc_neck) {
    next.acc_neck = candidateNeck;
  }
  if (isChillyOrWindy && candidateHead && !next.acc_head) {
    next.acc_head = candidateHead;
  }
  if (candidateUmbrella) {
    next.acc_umbrella = candidateUmbrella;
  }

  if (Array.isArray(rec?.items)) {
    for (const raw of rec.items) {
      const item = resolveItem(raw);
      if (!item) continue;
      const defaultKey = mapGarmentToDefaultSubSlot(item);
      if (defaultKey === 'acc_belt' && !isBottomBeltAllowed(next.bottom)) {
        continue;
      }
      if (defaultKey === 'onepiece') {
        if (!next.onepiece) {
          next.onepiece = item;
          if (!isSwimwearGarment(item)) {
            next.top = null;
            next.top_mid = null;
            next.bottom = null;
            next.acc_belt = null;
          }
        }
      } else if (defaultKey === 'top' || defaultKey === 'top_mid' || defaultKey === 'bottom') {
        if (!next[defaultKey] && !(next.onepiece && !isSwimwearGarment(next.onepiece))) {
          next[defaultKey] = item;
        }
      } else if (!next[defaultKey]) {
        next[defaultKey] = item;
      }
    }
  }

  if (next.acc_belt && !isBottomBeltAllowed(next.bottom)) {
    next.acc_belt = null;
  }

  return next;
}

function buildInitialStudioSlots(garments, preEquippedGarment, preferDemoShowcaseLook = false) {
  const wearableList = (Array.isArray(garments) ? garments : []).filter((g) =>
    isWearableStudioGarment(g)
  );
  const findFirst = (slotKey) =>
    wearableList.find((g) => doesGarmentMatchSubSlot(g, slotKey)) || null;
  const findMatching = (slotKey, pattern) =>
    wearableList.find(
      (g) =>
        doesGarmentMatchSubSlot(g, slotKey) &&
        pattern.test(
          `${g.name || ''} ${g.name_en || ''} ${g.subcategory || ''} ${g.color_name || ''} ${g.image_url || ''}`
        )
    ) || null;

  if (preEquippedGarment && isWearableStudioGarment(preEquippedGarment)) {
    const targetSlot = mapGarmentToDefaultSubSlot(preEquippedGarment);
    const preIsNonSwimOnepiece =
      targetSlot === 'onepiece' && !isSwimwearGarment(preEquippedGarment);
    const next = {
      ...EMPTY_STUDIO_SLOTS,
      top: preIsNonSwimOnepiece ? null : findFirst('top'),
      bottom: preIsNonSwimOnepiece ? null : findFirst('bottom'),
      shoes: findFirst('shoes'),
    };
    next[targetSlot] = preEquippedGarment;
    return next;
  }

  if (preferDemoShowcaseLook && wearableList.length > 0) {
    const showcaseOuter =
      findMatching('outer', /cyber-black-moto-jacket|크롭.*레더.*모토/i) ||
      findMatching('outer', /(블랙|black).*(라이더|모토|레더.*자켓|moto|rider|leather)/i) ||
      findMatching('outer', /(블랙|black).*(보머|자켓|bomber|jacket)/i);
    const showcaseTop =
      findMatching('top', /(블랙|black).*(메리노|하프.*터틀넥|터틀넥|모크넥|mockneck|turtleneck)/i) ||
      findMatching('top', /(차콜|블랙|black).*(모크넥|터틀넥|니트|turtleneck|knit|mock)/i) ||
      findFirst('top');
    const showcaseBottom =
      findMatching('bottom', /cyber-black-belted-pleated-skirt|버클.*벨티드.*플리츠.*미니/i) ||
      findMatching('bottom', /cyber-black-pleated-skirt|(블랙|black).*(플리츠.*미니|미니.*스커트|pleated.*mini)/i) ||
      findMatching('bottom', /(블랙|차콜|black).*(스커트|skirt)/i) ||
      findMatching('bottom', /(블랙|차콜|black).*(카고|팬츠|슬랙스|cargo|pants)/i) ||
      findFirst('bottom');
    const showcaseSocks =
      findMatching('socks', /cyber-black-sheer-stockings|(블랙|black).*(시어.*싸이하이|싸이하이.*스타킹|thigh.?high)/i) ||
      findMatching('socks', /cyber-black-overknee-stockings|(블랙|black).*(오버니|스타킹|over.?knee|stocking)/i) ||
      findMatching('socks', /(차콜|블랙|시어|나일론|black|sheer|charcoal)/i) ||
      findFirst('socks');
    const showcaseShoes =
      findMatching('shoes', /cyber-black-combat-boots|(블랙|black).*(레이스업.*컴뱃|컴뱃.*부츠|combat.*boot)/i) ||
      findMatching('shoes', /cyber-black-platform-walker-boots|(블랙|black).*(플랫폼.*레이스업|워커.*부츠|walker.*boot)/i) ||
      findMatching('shoes', /(매트 블랙|블랙|black).*(청키|러그솔|첼시|부츠|boot)/i) ||
      findMatching('shoes', /부츠|boot/i) ||
      findFirst('shoes');
    const showcaseBelt = findMatching(
      'acc_belt',
      /(블랙|가죽|카프스킨|레더|black|leather).*벨트|belt/i
    );
    const showcaseNeck =
      findMatching('jwl_neck', /cyber-silver-chain-choker|(925.*실버|실버|silver).*(레이어드.*체인|초커|체인|choker|chain)/i) ||
      findMatching('jwl_neck', /초커|체인|목걸이|choker|chain|necklace/i);
    return {
      ...EMPTY_STUDIO_SLOTS,
      outer: showcaseOuter,
      top: showcaseTop,
      bottom: showcaseBottom,
      socks: showcaseSocks,
      shoes: showcaseShoes,
      acc_belt: showcaseBelt,
      jwl_neck: showcaseNeck,
    };
  }

  if (wearableList.length > 0) {
    const initialTop = findFirst('top');
    const initialBottom = findFirst('bottom');
    const initialOnepiece = !initialTop && !initialBottom ? findFirst('onepiece') : null;
    return {
      ...EMPTY_STUDIO_SLOTS,
      top: initialTop,
      bottom: initialBottom,
      onepiece: initialOnepiece,
      shoes: findFirst('shoes'),
    };
  }

  return { ...EMPTY_STUDIO_SLOTS };
}

const LOOK_STYLE_STORAGE_KEY = 'ainventory_look_style_config_v1';

const LOOK_STYLE_PRESETS = [
  {
    key: 'business_casual',
    ko: '직장생활을 위한 비즈니스 캐주얼',
    en: 'Business Casual',
  },
  {
    key: 'comfortable_casual',
    ko: '편한 캐주얼',
    en: 'Comfortable Casual',
  },
  {
    key: 'formal_office',
    ko: '포멀 · 오피스 정장',
    en: 'Formal Office',
  },
  {
    key: 'minimal_daily',
    ko: '미니멀 데일리',
    en: 'Minimal Daily',
  },
  {
    key: 'street',
    ko: '스트릿',
    en: 'Street',
  },
  {
    key: 'hiphop',
    ko: '힙합',
    en: 'Hip-Hop',
  },
];

const VALID_LOOK_STYLE_KEYS = new Set(LOOK_STYLE_PRESETS.map((p) => p.key));

const DEFAULT_LOOK_STYLE_CONFIG = {
  look1Style: 'business_casual',
  look2Style: 'comfortable_casual',
};

function readStoredLookStyleConfig() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_LOOK_STYLE_CONFIG };
  }
  try {
    const raw = window.localStorage.getItem(LOOK_STYLE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LOOK_STYLE_CONFIG };
    const parsed = JSON.parse(raw);
    const look1Style = VALID_LOOK_STYLE_KEYS.has(parsed?.look1Style)
      ? parsed.look1Style
      : DEFAULT_LOOK_STYLE_CONFIG.look1Style;
    const look2Style = VALID_LOOK_STYLE_KEYS.has(parsed?.look2Style)
      ? parsed.look2Style
      : DEFAULT_LOOK_STYLE_CONFIG.look2Style;
    return { look1Style, look2Style };
  } catch {
    return { ...DEFAULT_LOOK_STYLE_CONFIG };
  }
}

function writeStoredLookStyleConfig(nextConfig) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(LOOK_STYLE_STORAGE_KEY, JSON.stringify(nextConfig));
  } catch {
    // ignore storage quota errors
  }
}

const NEUTRAL_PALETTE_RE =
  /black|white|grey|gray|charcoal|slate|ivory|cream|beige|taupe|stone|oat|navy|블랙|화이트|그레이|차콜|아이보리|크림|베이지|네이비|무채/i;
const RELAXED_CASUAL_RE =
  /hood|sweat|jogger|track|flip_flop|sandal|sport|puffer|parka|windbreaker|후드|맨투맨|조거|슬리퍼|샌들|패딩|윈드브레이커/i;
const STRICT_FORMAL_RE =
  /suit|tuxedo|necktie|stiletto|evening|ceremony|수트|정장|넥타이|타이|하객|이브닝/i;

function isLowSaturationNeutralHex(hex) {
  if (typeof hex !== 'string') return false;
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return Math.max(r, g, b) - Math.min(r, g, b) <= 38;
}

function scoreGarmentForLookPreset(garment, styleKey, avgTemp) {
  if (!garment) return -999;
  let score = 0;

  const minT = typeof garment.min_temp === 'number' ? garment.min_temp : 5;
  const maxT = typeof garment.max_temp === 'number' ? garment.max_temp : 26;
  if (avgTemp >= minT - 3 && avgTemp <= maxT + 3) {
    score += 24;
  } else {
    const dist = avgTemp < minT ? minT - avgTemp : avgTemp - maxT;
    score -= Math.min(20, dist * 1.4);
  }

  const blob = [
    garment.name,
    garment.name_en,
    garment.subcategory,
    garment.formality,
    garment.occasion,
    garment.color_name,
    garment.fabric,
  ]
    .filter(Boolean)
    .join(' ');

  if (styleKey === 'business_casual') {
    if (doesGarmentMatchOccasion(garment, 'office')) score += 30;
    if (doesGarmentMatchOccasion(garment, 'formal')) score += 10;
    if (RELAXED_CASUAL_RE.test(blob)) score -= 24;
  } else if (styleKey === 'comfortable_casual') {
    if (doesGarmentMatchOccasion(garment, 'daily')) score += 30;
    if (RELAXED_CASUAL_RE.test(blob)) score += 12;
    if (STRICT_FORMAL_RE.test(blob)) score -= 22;
  } else if (styleKey === 'formal_office') {
    if (doesGarmentMatchOccasion(garment, 'formal')) score += 34;
    if (doesGarmentMatchOccasion(garment, 'office')) score += 18;
    if (RELAXED_CASUAL_RE.test(blob)) score -= 30;
  } else if (styleKey === 'minimal_daily') {
    if (isLowSaturationNeutralHex(garment.color_hex) || NEUTRAL_PALETTE_RE.test(blob)) {
      score += 26;
    }
    if (doesGarmentMatchOccasion(garment, 'office') || doesGarmentMatchOccasion(garment, 'daily')) {
      score += 14;
    }
    if (/logo|graphic|neon|형광|그래픽/i.test(blob)) score -= 18;
  } else if (styleKey === 'street') {
    const isStreetPackshot = String(garment.image_url || '').includes('/seed/st-');
    const streetBlob = `${blob} ${garment.brand || ''}`;
    if (isStreetPackshot) score += 26;
    if (doesGarmentMatchOccasion(garment, 'daily')) score += 16;
    if (
      /bomber|windbreaker|track|ripstop|parka|overshirt|denim|trucker|utility|vest|sweatshirt|hoodie|boxy|cargo|parachute|jogger|chunky|runner|sneaker|combat|cap|sling|duffel|street|보머|윈드브레이커|트랙|립스톱|파카|오버셔츠|유틸리티|베스트|맨투맨|스웨트|후드|박시|카고|파라슈트|조거|청키|러너|스니커즈|컴뱃|캡|슬링|더플|스트릿|stone island|prada|balenciaga|stussy|off-white|fear of god|rick owens|chrome hearts/i.test(
        streetBlob
      )
    ) {
      score += 24;
    }
    if (STRICT_FORMAL_RE.test(blob) || /briefcase|loafer|derby|blazer|suit|서류가방|로퍼|더비|블레이저|정장/i.test(blob)) {
      score -= 28;
    }
  } else if (styleKey === 'hiphop') {
    const isStreetPackshot = String(garment.image_url || '').includes('/seed/st-');
    const hiphopBlob = `${blob} ${garment.brand || ''}`;
    if (isStreetPackshot) score += 28;
    if (doesGarmentMatchOccasion(garment, 'daily')) score += 14;
    if (
      /varsity|puffer|oversized|heavy|wide|baggy|loose|hoodie|fleece|bauhaus|cargo|jogger|geobasket|hightop|high-top|melting|hiphop|hip-hop|work boots|nubuck|chunky|combat|cross|cap|sling|duffel|chain|바시티|푸퍼|오버사이즈|헤비|와이드|배기|루즈|후드|플리스|바우하우스|카고|조거|지오바스켓|하이탑|멜팅|힙합|워크부츠|누벅|청키|컴뱃|크로스|캡|슬링|더플|체인|rick owens|balenciaga|fear of god|chrome hearts|mihara|timberland|amiri|off-white|dior|gucci/i.test(
        hiphopBlob
      )
    ) {
      score += 28;
    }
    if (STRICT_FORMAL_RE.test(blob) || /briefcase|loafer|derby|blazer|suit|slacks|trench|서류가방|로퍼|더비|블레이저|정장|슬랙스|트렌치/i.test(blob)) {
      score -= 34;
    }
  }

  return score;
}

function curateStyledRecommendations({
  rawRecs,
  garments,
  weather,
  lookStyleConfig,
  allowOutdoorUmbrella = true,
}) {
  const safeRaw = Array.isArray(rawRecs) ? rawRecs : [];
  const wearable = (Array.isArray(garments) ? garments : []).filter(
    (g) => isWearableStudioGarment(g) && !isSwimwearGarment(g)
  );
  const lookStyles = [
    lookStyleConfig?.look1Style || DEFAULT_LOOK_STYLE_CONFIG.look1Style,
    lookStyleConfig?.look2Style || DEFAULT_LOOK_STYLE_CONFIG.look2Style,
  ];

  if (wearable.length === 0) {
    return safeRaw.slice(0, 2).map((rec, idx) => {
      const styleKey = lookStyles[idx] || DEFAULT_LOOK_STYLE_CONFIG.look1Style;
      const preset = LOOK_STYLE_PRESETS.find((p) => p.key === styleKey) || LOOK_STYLE_PRESETS[0];
      return {
        ...rec,
        id: rec?.id || `look_${idx + 1}`,
        presetKey: styleKey,
        presetLabelKo: preset.ko,
        presetLabelEn: preset.en,
      };
    });
  }

  const avgTemp =
    typeof weather?.avgTemp === 'number' && Number.isFinite(weather.avgTemp)
      ? weather.avgTemp
      : typeof weather?.tempMin === 'number' && typeof weather?.tempMax === 'number'
        ? (weather.tempMin + weather.tempMax) / 2
        : 13;
  const isRainy = Boolean(
    weather?.isRainy || weather?.isRaining || weather?.scenarioKey === 'rainy_cool'
  );
  const isWindyOrCold = Boolean(weather?.isWindy || avgTemp <= 11);
  const needsOuter = avgTemp < 20 || isRainy || isWindyOrCold;

  const usedCoreIdsInLook1 = new Set();

  return lookStyles.map((styleKey, idx) => {
    const preset = LOOK_STYLE_PRESETS.find((p) => p.key === styleKey) || LOOK_STYLE_PRESETS[0];
    const rawRec = safeRaw[idx] || null;
    const rawMatchedPreset =
      rawRec && rawRec.presetKey && rawRec.presetKey === styleKey;

    if (rawMatchedPreset && Array.isArray(rawRec.items) && rawRec.items.length > 0) {
      for (const it of rawRec.items) {
        if (it?.id != null && idx === 0) usedCoreIdsInLook1.add(Number(it.id));
      }
      return {
        ...rawRec,
        id: rawRec.id || `look_${idx + 1}`,
        presetKey: styleKey,
        presetLabelKo: preset.ko,
        presetLabelEn: preset.en,
      };
    }

    const rawItemIds = new Set(
      (rawRec?.items || []).map((it) => Number(it?.id)).filter((n) => Number.isFinite(n))
    );
    const defaultStyleForIdx =
      idx === 0
        ? DEFAULT_LOOK_STYLE_CONFIG.look1Style
        : DEFAULT_LOOK_STYLE_CONFIG.look2Style;

    const pickSlotBest = (slotKey, avoidDuplicateFromLook1 = true) => {
      const candidates = wearable.filter((g) => doesGarmentMatchSubSlot(g, slotKey));
      if (candidates.length === 0) return null;
      const scored = candidates
        .map((g) => {
          let sc = scoreGarmentForLookPreset(g, styleKey, avgTemp);
          if (styleKey === defaultStyleForIdx && rawItemIds.has(Number(g.id))) {
            sc += 8;
          }
          if (
            idx === 1 &&
            avoidDuplicateFromLook1 &&
            candidates.length > 1 &&
            usedCoreIdsInLook1.has(Number(g.id))
          ) {
            sc -= 26;
          }
          return { g, sc };
        })
        .sort((a, b) => b.sc - a.sc || Number(a.g.id) - Number(b.g.id));
      return scored[0]?.g || null;
    };

    const top = pickSlotBest('top');
    const bottom = pickSlotBest('bottom');
    const onepiece =
      !top || !bottom
        ? pickSlotBest('onepiece')
        : styleKey === 'formal_office'
          ? (() => {
              const dress = pickSlotBest('onepiece');
              if (!dress) return null;
              const dressScore = scoreGarmentForLookPreset(dress, styleKey, avgTemp);
              const pairScore =
                (scoreGarmentForLookPreset(top, styleKey, avgTemp) +
                  scoreGarmentForLookPreset(bottom, styleKey, avgTemp)) /
                2;
              return dressScore > pairScore + 8 ? dress : null;
            })()
          : null;

    const topMid = !onepiece && avgTemp <= 21 ? pickSlotBest('top_mid') : null;
    const outerMid = avgTemp <= 19 ? pickSlotBest('outer_mid') : null;
    const outer =
      needsOuter && (avgTemp <= 12 || !outerMid || isRainy || isWindyOrCold)
        ? pickSlotBest('outer')
        : null;
    const shoes = pickSlotBest('shoes');
    const accessory = pickSlotBest('accessory', false);
    const neckwear = avgTemp <= 9 ? pickSlotBest('acc_neck', false) : null;
    const umbrella =
      isRainy && allowOutdoorUmbrella
        ? wearable.find((g) => isUmbrellaGarment(g)) || null
        : null;

    const loadoutBySlot = {
      outer: outer || null,
      outer_mid: outerMid || null,
      onepiece: onepiece || null,
      top_mid: onepiece ? null : topMid || null,
      top: onepiece ? null : top,
      bottom: onepiece ? null : bottom,
      shoes: shoes || null,
      accessory: accessory || null,
      acc_neck: neckwear || null,
      acc_umbrella: umbrella || null,
    };

    const items = [
      loadoutBySlot.outer,
      loadoutBySlot.outer_mid,
      loadoutBySlot.onepiece,
      loadoutBySlot.top_mid,
      loadoutBySlot.top,
      loadoutBySlot.bottom,
      loadoutBySlot.shoes,
      loadoutBySlot.accessory,
      loadoutBySlot.acc_neck,
      loadoutBySlot.acc_umbrella,
    ].filter(Boolean);

    if (idx === 0) {
      for (const core of [
        loadoutBySlot.outer,
        loadoutBySlot.outer_mid,
        loadoutBySlot.onepiece,
        loadoutBySlot.top_mid,
        loadoutBySlot.top,
        loadoutBySlot.bottom,
        loadoutBySlot.shoes,
      ]) {
        if (core?.id != null) usedCoreIdsInLook1.add(Number(core.id));
      }
    }

    return {
      ...(rawRec || {}),
      id: rawRec?.id || `look_${idx + 1}`,
      title: preset.ko,
      presetKey: styleKey,
      presetLabelKo: preset.ko,
      presetLabelEn: preset.en,
      items,
      itemIds: items.map((it) => it.id),
      loadoutBySlot,
    };
  });
}

export default function OutfitStudioView({
  user,
  activeCloset,
  garments = [],
  theme = 'light',
  lang = 'ko',
  skinProfile,
  bodySpec,
  onUpdateSkinProfile,
  onToggleTheme,
  onOpenProfile,
  onOpenAccount,
  onOpenSkinToneModal,
  onOpenBodyProfile,
  preEquippedGarment,
  onConsumePreEquipped,
  onClosetUpdated,
  onNavigateTab,
  showToast,
}) {
  const {
    spec: storedAvatarSpec,
    avatarConfigHash: storedAvatarHash,
    patchAvatarSpec,
  } = useAvatarSpec();

  const bridgedAvatar = useMemo(() => {
    void storedAvatarSpec;
    void storedAvatarHash;
    return bridgeLegacyPropsToAvatarSpec({
      skinProfile,
      bodySpec,
      user,
      personReferenceUrl:
        skinProfile?.portraitDataUrl || storedAvatarSpec?.appearance?.facePhotoUrl || null,
    });
  }, [skinProfile, bodySpec, user, storedAvatarSpec, storedAvatarHash]);

  const isDemoShowcaseAccount = useMemo(() => isDemoVtonAccount(user), [user]);

  const [rawSlots, setSlots] = useState(() =>
    preEquippedGarment || garments.length > 0
      ? buildInitialStudioSlots(garments, preEquippedGarment, isDemoShowcaseAccount)
      : { ...EMPTY_STUDIO_SLOTS }
  );
  const [hasExplicitSlotState, setHasExplicitSlotState] = useState(true);
  const [activeSlotKey, setActiveSlotKey] = useState(() =>
    preEquippedGarment ? mapGarmentToDefaultSubSlot(preEquippedGarment) : 'top'
  );
  const [occasionFilter, setOccasionFilter] = useState('all');
  const [seasonFilter, setSeasonFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [drawerSearchOpen, setDrawerSearchOpen] = useState(false);
  const [drawerVisibleCount, setDrawerVisibleCount] = useState(18);
  const drawerLoadMoreRef = useRef(null);
  const [selectedInspectorId, setSelectedInspectorId] = useState(
    () => preEquippedGarment?.id ?? null
  );
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [weatherPopupOpen, setWeatherPopupOpen] = useState(false);
  const [manualRainUmbrellaCleared, setManualRainUmbrellaCleared] = useState(false);
  const [lookStyleConfig, setLookStyleConfig] = useState(() => readStoredLookStyleConfig());
  const [saggingFit, setSaggingFit] = useState(false);
  const [streetSaggingPrompt, setStreetSaggingPrompt] = useState(false);
  const [underwearSimModalOpen, setUnderwearSimModalOpen] = useState(false);

  const userModifiedSlotsRef = useRef(Boolean(preEquippedGarment));
  const provisionalInitialSlotsRef = useRef(
    Boolean(!preEquippedGarment && !isDemoShowcaseAccount && garments.length > 0)
  );
  const forceAutoApplyWeatherRef = useRef(false);
  const scenarioSnapshotsRef = useRef({});
  const ensuredSeedClosetsRef = useRef(new Set());
  const desktopSearchInputRef = useRef(null);
  const mobileSearchInputRef = useRef(null);

  const [cityKey, setCityKey] = useState('seoul');
  const [scenarioKey, setScenarioKey] = useState('live');
  const [dayTarget, setDayTarget] = useState('today');
  const [gpsCoords, setGpsCoords] = useState(null);
  const [locatingGps, setLocatingGps] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState(() => getStoredSelectedPlace());
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [placePickingId, setPlacePickingId] = useState(null);
  const [placeSearchError, setPlaceSearchError] = useState('');
  const [streetViewOnlySearch, setStreetViewOnlySearch] = useState(true);
  const [placeSearchFilteredOutCount, setPlaceSearchFilteredOutCount] = useState(0);
  const placeSessionTokenRef = useRef(createPlacesSessionToken());
  const placeSearchTimerRef = useRef(null);
  const placeSearchSeqRef = useRef(0);

  const [stylingPref, setStylingPref] = useState(() => getStoredStylingPreference());
  const stylingPrefRef = useRef(stylingPref);
  useEffect(() => {
    stylingPrefRef.current = stylingPref;
  }, [stylingPref]);

  useEffect(() => {
    const syncPref = () => {
      setStylingPref(getStoredStylingPreference());
    };
    window.addEventListener(STYLING_PREF_EVENT, syncPref);
    window.addEventListener('storage', syncPref);
    return () => {
      window.removeEventListener(STYLING_PREF_EVENT, syncPref);
      window.removeEventListener('storage', syncPref);
      if (placeSearchTimerRef.current) {
        clearTimeout(placeSearchTimerRef.current);
      }
    };
  }, []);

  const [weatherPayload, setWeatherPayload] = useState(null);
  const [activeRecId, setActiveRecId] = useState(null);
  const activeRecIdRef = useRef(null);
  const [loggingTomorrow, setLoggingTomorrow] = useState(false);
  const [showTomorrowPrompt, setShowTomorrowPrompt] = useState(false);
  const tomorrowPromptEvaluatedRef = useRef(false);
  const autoEquippedUmbrellaIdRef = useRef(null);

  const [savedOutfits, setSavedOutfits] = useState([]);
  const [outfitTitle, setOutfitTitle] = useState('');
  const [goldTitleAnimNonce, setGoldTitleAnimNonce] = useState(0);
  const [isGoldTitleWriting, setIsGoldTitleWriting] = useState(false);
  const [savingOutfit, setSavingOutfit] = useState(false);
  const [calendarSavedModal, setCalendarSavedModal] = useState(null);
  const hasCustomOutfitTitleRef = useRef(false);
  const outfitTitleRef = useRef('');
  const titleGenCounterRef = useRef(0);
  const goldTitleTimerRef = useRef(null);
  const prevEquippedTitleSigRef = useRef('');

  useEffect(() => {
    outfitTitleRef.current = outfitTitle;
  }, [outfitTitle]);

  useEffect(() => {
    return () => {
      if (goldTitleTimerRef.current) {
        clearTimeout(goldTitleTimerRef.current);
      }
    };
  }, []);

  const triggerGoldAutoOutfitTitle = useCallback((nextTitle) => {
    const clean = String(nextTitle || '').trim();
    if (!clean) return;
    setOutfitTitle(clean);
    outfitTitleRef.current = clean;
    setGoldTitleAnimNonce((n) => n + 1);
    setIsGoldTitleWriting(true);
    if (goldTitleTimerRef.current) {
      clearTimeout(goldTitleTimerRef.current);
    }
    goldTitleTimerRef.current = setTimeout(() => {
      setIsGoldTitleWriting(false);
      goldTitleTimerRef.current = null;
    }, 1250);
  }, []);

  const [economyState, setEconomyState] = useState(() =>
    isDemoShowcaseAccount
      ? createDemoCyberpunkEconomyState(loadStoredEconomyState())
      : loadStoredEconomyState()
  );
  const [bgPickerOpen, setBgPickerOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [placeBackdropPref, setPlaceBackdropPref] = useState(() => getStoredPlaceBackdropPref());
  const [placeBackdropData, setPlaceBackdropData] = useState(EMPTY_PLACE_BACKDROP_DATA);
  const [placeBackdropRefreshNonce, setPlaceBackdropRefreshNonce] = useState(0);
  const [failedBackdropUrls, setFailedBackdropUrls] = useState(() => new Set());
  const [liveSvUnavailableKey, setLiveSvUnavailableKey] = useState('');
  const [liveSvBillingError, setLiveSvBillingError] = useState(false);
  const [liveSvCopyright, setLiveSvCopyright] = useState(null);
  const [mapAdjusterOpen, setMapAdjusterOpen] = useState(false);
  const [customBackdropSpot, setCustomBackdropSpot] = useState(null);
  const prevBackdropTargetKeyRef = useRef('');

  const handleUpdatePlaceBackdropPref = useCallback((patch) => {
    setPlaceBackdropPref((prev) => {
      const next = saveStoredPlaceBackdropPref({ ...prev, ...patch });
      if (!next.enabled) {
        setMapAdjusterOpen(false);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (isDemoShowcaseAccount) {
      setEconomyState((prev) => createDemoCyberpunkEconomyState(prev));
    } else {
      setEconomyState(loadStoredEconomyState());
    }
  }, [isDemoShowcaseAccount]);

  useEffect(() => {
    const syncEconomy = (ev) => {
      const incoming = ev?.detail ? ev.detail : loadStoredEconomyState();
      setEconomyState(
        isDemoShowcaseAccount ? createDemoCyberpunkEconomyState(incoming) : incoming
      );
    };
    window.addEventListener(ECONOMY_STATE_EVENT, syncEconomy);
    window.addEventListener('storage', syncEconomy);
    return () => {
      window.removeEventListener(ECONOMY_STATE_EVENT, syncEconomy);
      window.removeEventListener('storage', syncEconomy);
    };
  }, [isDemoShowcaseAccount]);

  const freeDailyDrawAvailable = hasFreeDailyDrawRemaining(economyState, getLocalDateKey());
  const equippedStageBg = useMemo(
    () => getStageBackgroundById(economyState?.equippedBackgroundId),
    [economyState?.equippedBackgroundId]
  );
  const isEquippedStageOutdoor = Boolean(equippedStageBg.isOutdoor);

  const handleSelectStageBackground = useCallback(
    (bgId) => {
      if (isDemoShowcaseAccount) {
        setEconomyState((prev) =>
          prev.unlockedIds.includes(bgId) ? { ...prev, equippedBackgroundId: bgId } : prev
        );
      } else {
        const next = equipStageBackground(bgId);
        setEconomyState(next);
      }
      const item = getStageBackgroundById(bgId);
      showToast?.(
        tx(
          lang,
          `${item.tier}등급 '${item.nameKo}' 배경 적용됨`,
          `Equipped ${item.tier} · ${item.nameEn}`
        )
      );
    },
    [isDemoShowcaseAccount, lang, showToast]
  );

  const handleUpdateStageLighting = useCallback(
    (patch) => {
      if (isDemoShowcaseAccount) {
        setEconomyState((prev) => ({
          ...prev,
          ...(patch?.lightingPreset !== undefined ? { lightingPreset: patch.lightingPreset } : {}),
          ...(patch?.lightingIntensity !== undefined
            ? { lightingIntensity: patch.lightingIntensity }
            : {}),
        }));
        return;
      }
      const next = updateStageLightingSettings(patch);
      setEconomyState(next);
    },
    [isDemoShowcaseAccount]
  );

  const handlePerformStoreDraw = useCallback(() => {
    const outcome = rollBackgroundGacha(economyState, getLocalDateKey());
    if (outcome.ok) {
      const saved = saveStoredEconomyState(outcome.nextState);
      setEconomyState(saved);
    }
    return {
      ...outcome,
      drawnItem: outcome.background,
      isDuplicate: !outcome.isNewUnlock,
    };
  }, [economyState]);

  const activeParentTab = useMemo(
    () => resolveParentFittingTab(activeSlotKey),
    [activeSlotKey]
  );

  const handleSelectTopFittingTab = useCallback((tabKey) => {
    triggerHaptic('selection');
    setSelectedInspectorId(null);
    if (tabKey === 'outer') {
      setActiveSlotKey((prev) => (prev === 'outer' || prev === 'outer_mid' ? prev : 'outer'));
    } else if (tabKey === 'top') {
      setActiveSlotKey((prev) => (prev === 'top' || prev === 'top_mid' ? prev : 'top'));
    } else if (tabKey === 'underwear') {
      setActiveSlotKey((prev) =>
        prev === 'underwear' || prev === 'underwear_top' ? prev : 'underwear'
      );
    } else if (tabKey === 'accessory') {
      setActiveSlotKey((prev) => (isAccessorySlotKey(prev) ? prev : 'accessory'));
    } else if (tabKey === 'jewelry') {
      setActiveSlotKey((prev) => (isJewelrySlotKey(prev) ? prev : 'jwl_neck'));
    } else {
      setActiveSlotKey(tabKey);
    }
  }, []);

  const handleStepPrevFittingTab = useCallback(() => {
    const curIdx = FITTING_SLOTS.findIndex((s) => s.key === activeParentTab);
    const prevIdx = curIdx > 0 ? curIdx - 1 : FITTING_SLOTS.length - 1;
    handleSelectTopFittingTab(FITTING_SLOTS[prevIdx].key);
  }, [activeParentTab, handleSelectTopFittingTab]);

  const handleOpenBodyModal = useCallback(() => {
    if (onOpenBodyProfile) {
      onOpenBodyProfile();
    } else {
      onOpenProfile?.('body');
    }
  }, [onOpenBodyProfile, onOpenProfile]);

  useEffect(() => {
    if (preEquippedGarment) {
      onConsumePreEquipped?.();
    }
  }, [preEquippedGarment, onConsumePreEquipped]);

  const reloadOutfits = useCallback(async () => {
    try {
      const q = encodeURIComponent(activeCloset || 'sample');
      const res = await apiFetch(`/outfits?closet=${q}`);
      setSavedOutfits(res.outfits || []);
    } catch {
      // keep local state
    }
  }, [activeCloset]);

  useEffect(() => {
    let cancelled = false;
    const q = encodeURIComponent(activeCloset || 'sample');
    apiFetch(`/outfits?closet=${q}`)
      .then((res) => {
        if (!cancelled) {
          setSavedOutfits(res.outfits || []);
        }
      })
      .catch(() => {
        // keep local state
      });
    return () => {
      cancelled = true;
    };
  }, [activeCloset]);

  const effectiveGender =
    (user && !user.isSampleDemo
      ? user.gender
      : bodySpec?.gender || skinProfile?.gender) === 'female'
      ? 'female'
      : 'male';

  useEffect(() => {
    const evaluatePrompt = () => {
      if (tomorrowPromptEvaluatedRef.current) return;
      const winHour =
        typeof window !== 'undefined' && typeof window.__AINVENTORY_HOUR_OVERRIDE__ === 'number'
          ? window.__AINVENTORY_HOUR_OVERRIDE__
          : null;
      const now = new Date();
      const currentHour = winHour != null && Number.isFinite(winHour) ? winHour : now.getHours();
      const shouldShow = shouldShowTomorrowOutfitPrompt({
        hour: currentHour,
        todayDateStr: getLocalDateKey(now),
        lastGeneratedDateStr: readTodayOutfitGeneratedDate(),
        shownCount: readTomorrowPromptShownCount(),
        dayTarget,
      });
      if (shouldShow) {
        tomorrowPromptEvaluatedRef.current = true;
        incrementTomorrowPromptShownCount();
        setShowTomorrowPrompt(true);
      }
    };

    evaluatePrompt();
    const handleFocusOrVis = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        evaluatePrompt();
      }
    };
    window.addEventListener('focus', handleFocusOrVis);
    document.addEventListener('visibilitychange', handleFocusOrVis);
    return () => {
      window.removeEventListener('focus', handleFocusOrVis);
      document.removeEventListener('visibilitychange', handleFocusOrVis);
    };
  }, [dayTarget]);

  const weatherSnapshotScopeKey = `${scenarioKey}:${dayTarget}`;

  useEffect(() => {
    if (Object.values(rawSlots).some(Boolean)) {
      scenarioSnapshotsRef.current[weatherSnapshotScopeKey] = {
        rawSlots,
        activeRecId,
        manualRainUmbrellaCleared,
      };
    }
  }, [weatherSnapshotScopeKey, rawSlots, activeRecId, manualRainUmbrellaCleared]);

  // Seed provisional outfit slots immediately as soon as garments load (never wait on weather/Open-Meteo roundtrip!)
  useEffect(() => {
    if (garments.length === 0 || userModifiedSlotsRef.current) return;
    setSlots((prev) => {
      if (isDemoShowcaseAccount) {
        provisionalInitialSlotsRef.current = false;
        const target = buildInitialStudioSlots(garments, preEquippedGarment || null, true);
        const alreadyMatches = ALL_EQUIPPABLE_SLOT_KEYS.every(
          (key) => (prev[key]?.id ?? null) === (target[key]?.id ?? null)
        );
        return alreadyMatches ? prev : target;
      }
      if (Object.values(prev).some(Boolean)) return prev;
      provisionalInitialSlotsRef.current = true;
      return buildInitialStudioSlots(garments, preEquippedGarment || null, false);
    });
  }, [garments, preEquippedGarment, isDemoShowcaseAccount]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      closet: activeCloset || 'sample',
      city: cityKey,
      scenario: scenarioKey,
      day_target: dayTarget,
      gender: effectiveGender,
      look1_style: lookStyleConfig.look1Style,
      look2_style: lookStyleConfig.look2Style,
    });
    if (skinProfile?.personalColor) {
      params.set('personal_color', skinProfile.personalColor);
    }
    if (skinProfile?.skinToneHex) {
      params.set('skin_tone_hex', skinProfile.skinToneHex);
    }
    if (selectedPlace && Number.isFinite(selectedPlace.lat) && Number.isFinite(selectedPlace.lng)) {
      params.set('lat', String(selectedPlace.lat));
      params.set('lon', String(selectedPlace.lng));
      params.set('location_label', selectedPlace.name);
    } else if (cityKey === 'gps' && gpsCoords) {
      params.set('lat', String(gpsCoords.lat));
      params.set('lon', String(gpsCoords.lon));
      params.set('location_label', gpsCoords.label || 'GPS');
    }

    apiFetch(`/weather/recommendations?${params.toString()}`)
      .then(async (rawData) => {
        if (cancelled) return;
        let data = rawData;
        if (scenarioKey === 'live' && rawData?.weather?.fallbackUsed) {
          const fallbackCity =
            CITY_COORDS.find((c) => c.key === cityKey) ||
            CITY_COORDS.find((c) => c.key === 'seoul') ||
            CITY_COORDS[0];
          const rescueLat =
            selectedPlace && Number.isFinite(selectedPlace.lat)
              ? Number(selectedPlace.lat)
              : cityKey === 'gps' && gpsCoords && Number.isFinite(Number(gpsCoords.lat))
                ? Number(gpsCoords.lat)
                : Number(rawData?.weather?.latitude ?? fallbackCity?.lat ?? 37.5665);
          const rescueLon =
            selectedPlace && Number.isFinite(selectedPlace.lng)
              ? Number(selectedPlace.lng)
              : cityKey === 'gps' && gpsCoords && Number.isFinite(Number(gpsCoords.lon))
                ? Number(gpsCoords.lon)
                : Number(rawData?.weather?.longitude ?? fallbackCity?.lon ?? 126.978);
          const rescueName =
            selectedPlace?.name ||
            (cityKey === 'gps' && gpsCoords?.label) ||
            rawData?.weather?.cityName ||
            fallbackCity?.name ||
            '서울';
          const rescuedWeather = await fetchDirectOpenMeteoWeather({
            cityKey,
            cityName: rescueName,
            lat: rescueLat,
            lon: rescueLon,
            dayTarget,
          });
          if (cancelled) return;
          if (rescuedWeather) {
            data = {
              ...rawData,
              weather: {
                ...(rawData?.weather || {}),
                ...rescuedWeather,
              },
            };
          }
        }
        if (data?.weather?.quotaFallbackTriggered) {
          notifyGmpQuotaExceeded();
        }
        setWeatherPayload(data);

        const effectiveW = {
          ...(data?.weather || {}),
          scenarioKey,
          dayTarget,
          ...(scenarioKey === 'rainy_cool' ? { isRainy: true, isRaining: true } : {}),
          ...(scenarioKey === 'snowy_winter' ? { isSnowy: true } : {}),
        };
        const recs = curateStyledRecommendations({
          rawRecs: data?.recommendations,
          garments,
          weather: effectiveW,
          lookStyleConfig,
          allowOutdoorUmbrella: isEquippedStageOutdoor,
        });
        const shouldForceOverwriteSlots = Boolean(forceAutoApplyWeatherRef.current);
        forceAutoApplyWeatherRef.current = false;
        if (
          recs.length > 0 &&
          (shouldForceOverwriteSlots || !userModifiedSlotsRef.current)
        ) {
          const chosenRec = recs.find((r) => r.id === activeRecIdRef.current) || recs[0];
          const rawMappedSlots = mapWeatherRecToSlots(chosenRec, garments, effectiveW, {
            allowOutdoorUmbrella: isEquippedStageOutdoor,
          });
          const mappedSlots = applyStylingDensityFilter(
            rawMappedSlots,
            stylingPrefRef.current,
            effectiveW
          );
          if (!effectiveW.isRainy && !effectiveW.isRaining && !effectiveW.isSnowy) {
            autoEquippedUmbrellaIdRef.current = null;
          }
          setSlots((prev) => {
            if (isDemoShowcaseAccount && !shouldForceOverwriteSlots && !userModifiedSlotsRef.current) {
              provisionalInitialSlotsRef.current = false;
              return Object.values(prev).some(Boolean)
                ? prev
                : buildInitialStudioSlots(garments, preEquippedGarment || null, true);
            }
            if (
              !shouldForceOverwriteSlots &&
              !provisionalInitialSlotsRef.current &&
              Object.values(prev).some(Boolean)
            ) {
              return prev;
            }
            provisionalInitialSlotsRef.current = false;
            return mappedSlots;
          });
          setHasExplicitSlotState(true);
          activeRecIdRef.current = chosenRec.id;
          setActiveRecId(chosenRec.id);
        } else if (recs.length === 0 && !userModifiedSlotsRef.current && garments.length > 0) {
          setSlots((prev) =>
            Object.values(prev).some(Boolean)
              ? prev
              : buildInitialStudioSlots(garments, null, isDemoShowcaseAccount)
          );
          setHasExplicitSlotState(true);
        }
      })
      .catch(() => {
        if (!cancelled && !userModifiedSlotsRef.current && garments.length > 0) {
          setSlots((prev) =>
            Object.values(prev).some(Boolean)
              ? prev
              : buildInitialStudioSlots(garments, null, isDemoShowcaseAccount)
          );
          setHasExplicitSlotState(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeCloset,
    cityKey,
    scenarioKey,
    dayTarget,
    gpsCoords,
    selectedPlace,
    skinProfile,
    effectiveGender,
    garments,
    lookStyleConfig,
    isEquippedStageOutdoor,
    isDemoShowcaseAccount,
    preEquippedGarment,
  ]);

  const weather = useMemo(() => {
    const raw = weatherPayload?.weather || null;
    const rawMatchesScenario = Boolean(
      raw &&
        raw.scenarioKey === scenarioKey &&
        (!raw.dayTarget || raw.dayTarget === dayTarget)
    );

    if (scenarioKey === 'rainy_cool') {
      return {
        ...(rawMatchesScenario
          ? raw
          : {
              tempMin: 9,
              tempMax: 13,
              avgTemp: 11,
              cityName: raw?.cityName || '서울',
            }),
        scenarioKey: 'rainy_cool',
        dayTarget,
        isRainy: true,
        isRaining: true,
        isSnowy: false,
      };
    }
    if (scenarioKey === 'winter_cold') {
      return {
        ...(rawMatchesScenario
          ? raw
          : {
              tempMin: -10,
              tempMax: -4,
              avgTemp: -7,
              windSpeed: 28,
              cityName: raw?.cityName || '서울',
            }),
        scenarioKey: 'winter_cold',
        isRainy: false,
        isSnowy: false,
        isWindy: true,
      };
    }
    if (scenarioKey === 'snowy_winter') {
      return {
        ...(rawMatchesScenario
          ? raw
          : {
              tempMin: -3,
              tempMax: 1,
              avgTemp: -1,
              cityName: raw?.cityName || '서울',
            }),
        scenarioKey: 'snowy_winter',
        isRainy: false,
        isSnowy: true,
      };
    }
    if (scenarioKey === 'cloudy_overcast') {
      return {
        ...(rawMatchesScenario
          ? raw
          : {
              tempMin: 11,
              tempMax: 16,
              avgTemp: 13.5,
              cityName: raw?.cityName || '서울',
            }),
        scenarioKey: 'cloudy_overcast',
        isRainy: false,
        isSnowy: false,
      };
    }
    if (scenarioKey === 'windy_gale') {
      return {
        ...(rawMatchesScenario
          ? raw
          : {
              tempMin: 6,
              tempMax: 14,
              avgTemp: 10,
              windSpeed: 31,
              cityName: raw?.cityName || '서울',
            }),
        scenarioKey: 'windy_gale',
        isWindy: true,
        isRainy: false,
        isSnowy: false,
      };
    }
    if (scenarioKey === 'summer_heatwave') {
      return {
        ...(rawMatchesScenario
          ? raw
          : {
              tempMin: 26,
              tempMax: 34,
              avgTemp: 31,
              cityName: raw?.cityName || '서울',
            }),
        scenarioKey: 'summer_heatwave',
        isRainy: false,
        isSnowy: false,
      };
    }
    if (scenarioKey === 'crisp_autumn' || scenarioKey === 'warm_spring') {
      return rawMatchesScenario
        ? { ...raw, scenarioKey, isRainy: false, isSnowy: false }
        : {
            tempMin: scenarioKey === 'warm_spring' ? 14 : 8,
            tempMax: scenarioKey === 'warm_spring' ? 23 : 17,
            avgTemp: scenarioKey === 'warm_spring' ? 18.5 : 12.5,
            cityName: raw?.cityName || '서울',
            scenarioKey,
            isRainy: false,
            isSnowy: false,
          };
    }
    if (!rawMatchesScenario) {
      return {
        cityName: raw?.cityName || '서울',
        tempMin: 9,
        tempMax: 18,
        avgTemp: 13,
        condition: dayTarget === 'tomorrow' ? '내일 예보' : '오늘 예보',
        dayTarget,
        scenarioKey: 'live',
        isRainy: false,
        isRaining: false,
        isSnowy: false,
        isWindy: false,
      };
    }
    return { ...raw, scenarioKey: 'live', dayTarget: raw.dayTarget || dayTarget };
  }, [weatherPayload, scenarioKey, dayTarget]);

  const isRainyWeatherActive = Boolean(
    scenarioKey === 'rainy_cool' || weather?.isRainy || weather?.isRaining
  );

  // Conditional Google Maps Real-Place Backdrop auto-refresh (strictly fetches ONLY when enabled)
  const backdropTargetPlaceId = selectedPlace?.placeId || '';
  const backdropTargetLat =
    selectedPlace && Number.isFinite(selectedPlace.lat)
      ? Number(selectedPlace.lat)
      : Number.isFinite(Number(weather?.latitude))
        ? Number(weather.latitude)
        : null;
  const backdropTargetLng =
    selectedPlace && Number.isFinite(selectedPlace.lng)
      ? Number(selectedPlace.lng)
      : Number.isFinite(Number(weather?.longitude))
        ? Number(weather.longitude)
        : null;
  const backdropTargetQuery = selectedPlace?.name || weather?.cityName || '';
  const backdropTargetKey = `${backdropTargetPlaceId}|${backdropTargetLat ?? ''}|${backdropTargetLng ?? ''}|${backdropTargetQuery}`;

  useEffect(() => {
    if (!placeBackdropPref.enabled) {
      return undefined;
    }
    if (!backdropTargetPlaceId && backdropTargetLat === null && !backdropTargetQuery) {
      return undefined;
    }

    const targetChanged =
      prevBackdropTargetKeyRef.current !== '' &&
      prevBackdropTargetKeyRef.current !== backdropTargetKey;
    prevBackdropTargetKeyRef.current = backdropTargetKey;

    const controller = new AbortController();
    let cancelled = false;

    const loadBackdrop = async () => {
      if (targetChanged) {
        setPlaceBackdropPref((prev) =>
          prev.selectedPhotoIndex === 0
            ? prev
            : saveStoredPlaceBackdropPref({ ...prev, selectedPhotoIndex: 0 })
        );
        setFailedBackdropUrls(new Set());
      }

      // Instant 0ms hydration when the destination was already loaded in this session
      const cachedBundle =
        placeBackdropRefreshNonce === 0
          ? peekCachedPlaceBackdropBundle({
              placeId: backdropTargetPlaceId || null,
              lat: backdropTargetLat,
              lng: backdropTargetLng,
              query: backdropTargetQuery,
              lang,
            })
          : null;
      if (cachedBundle) {
        setPlaceBackdropData({
          ...cachedBundle,
          loading: false,
          error: null,
          quotaExceeded: false,
        });
        return;
      }

      await Promise.resolve();
      if (cancelled || controller.signal.aborted) return;

      setPlaceBackdropData((prev) => ({
        ...prev,
        loading: true,
        error: null,
        quotaExceeded: false,
      }));

      try {
        const bundle = await fetchPlaceBackdropBundle({
          placeId: backdropTargetPlaceId || null,
          lat: backdropTargetLat,
          lng: backdropTargetLng,
          query: backdropTargetQuery,
          lang,
          signal: controller.signal,
          bypassCache: placeBackdropRefreshNonce > 0,
        });
        if (cancelled || controller.signal.aborted) return;
        setPlaceBackdropData({
          ...bundle,
          loading: false,
          error: null,
          quotaExceeded: false,
        });
      } catch (err) {
        if (cancelled || controller.signal.aborted) return;
        const isQuota = err instanceof Error && err.message === 'QUOTA_EXCEEDED';
        setPlaceBackdropData((prev) => ({
          ...prev,
          photos: [],
          streetView: EMPTY_PLACE_BACKDROP_DATA.streetView,
          loading: false,
          quotaExceeded: isQuota,
          error: isQuota
            ? tx(
                lang,
                'Google Maps 할당량 한도에 도달해 기본 스튜디오 배경을 유지합니다.',
                'Google Maps quota reached; keeping your default studio backdrop.'
              )
            : tx(
                lang,
                '장소 배경을 불러오지 못해 기본 스튜디오 배경을 유지합니다.',
                'Unable to load place backdrop; keeping your studio backdrop.'
              ),
        }));
      }
    };

    void loadBackdrop();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    placeBackdropPref.enabled,
    backdropTargetKey,
    backdropTargetPlaceId,
    backdropTargetLat,
    backdropTargetLng,
    backdropTargetQuery,
    placeBackdropRefreshNonce,
    lang,
  ]);

  const isLiveSvUnavailableForTarget = Boolean(
    liveSvUnavailableKey && liveSvUnavailableKey === backdropTargetKey
  );

  const activeCustomSpot =
    customBackdropSpot && customBackdropSpot.targetKey === backdropTargetKey
      ? customBackdropSpot
      : null;

  const activePlaceBackdrop = useMemo(() => {
    const initialLat =
      typeof selectedPlace?.streetViewLat === 'number' && Number.isFinite(selectedPlace.streetViewLat)
        ? selectedPlace.streetViewLat
        : backdropTargetLat ?? 37.5636;
    const initialLng =
      typeof selectedPlace?.streetViewLng === 'number' && Number.isFinite(selectedPlace.streetViewLng)
        ? selectedPlace.streetViewLng
        : backdropTargetLng ?? 126.9826;
    const resolvedLat = activeCustomSpot ? activeCustomSpot.lat : initialLat;
    const resolvedLng = activeCustomSpot ? activeCustomSpot.lng : initialLng;

    // When the user manually drags/taps a spot on the bottom Google Map adjuster,
    // override Street View panoId immediately with zero extra Places API roundtrips.
    const effectiveBackdropData = activeCustomSpot
      ? {
          ...placeBackdropData,
          lat: activeCustomSpot.lat,
          lng: activeCustomSpot.lng,
          streetView: {
            available: true,
            panoId: activeCustomSpot.panoId,
            copyright: activeCustomSpot.copyright || '© Google',
            date: null,
            reportProblemLink: `https://cbks0.googleapis.com/cbk?output=report&panoid=${encodeURIComponent(
              activeCustomSpot.panoId
            )}&cb_client=api&cbp=1,0,,0,0`,
          },
        }
      : placeBackdropData;

    const resolved = resolveActivePlaceBackdropVisual({
      pref: placeBackdropPref,
      data: effectiveBackdropData,
      fallbackLat: resolvedLat,
      fallbackLng: resolvedLng,
      fallbackPlaceName: backdropTargetQuery || selectedPlace?.name || weather?.cityName || '',
      fallbackStreetViewPanoId:
        activeCustomSpot?.panoId || selectedPlace?.streetViewPanoId || null,
      fallbackStreetViewCopyright:
        activeCustomSpot?.copyright || selectedPlace?.streetViewCopyright || null,
      liveStreetViewUnavailable: isLiveSvUnavailableForTarget || liveSvBillingError,
      buildPhotoUrl: (photoName) =>
        buildPlacePhotoProxyUrl(
          photoName,
          PLACE_PHOTO_PROXY_MAX_WIDTH,
          PLACE_PHOTO_PROXY_MAX_HEIGHT
        ),
      buildStreetViewUrl: (panoId, heading) =>
        buildStreetViewProxyUrl(panoId, heading, STREET_VIEW_PORTRAIT_PITCH),
    });
    const isBrokenImage = Boolean(resolved.imageUrl && failedBackdropUrls.has(resolved.imageUrl));
    if (!resolved.active || (!resolved.imageUrl && !resolved.liveMapMode) || isBrokenImage) {
      return { ...resolved, active: false, imageUrl: null, liveMapMode: null };
    }
    return {
      ...resolved,
      lat: resolvedLat,
      lng: resolvedLng,
      initialLat,
      initialLng,
      hasCustomSpot: Boolean(activeCustomSpot),
      panoQuality: activeCustomSpot?.panoQuality || null,
      streetViewPanoId:
        activeCustomSpot?.panoId ||
        placeBackdropData?.streetView?.panoId ||
        selectedPlace?.streetViewPanoId ||
        null,
      streetViewCopyright:
        activeCustomSpot?.copyright ||
        liveSvCopyright ||
        selectedPlace?.streetViewCopyright ||
        resolved.streetViewCopyright,
      onLiveStatusChange: (status) => {
        if (status?.billingError || status?.authFailed) {
          setLiveSvBillingError(true);
          setLiveSvUnavailableKey('');
          setLiveSvCopyright(null);
        } else if (!status?.available) {
          setLiveSvBillingError(false);
          setLiveSvUnavailableKey(backdropTargetKey);
          setLiveSvCopyright(null);
        } else {
          setLiveSvBillingError(false);
          setLiveSvUnavailableKey('');
          if (status.copyright) setLiveSvCopyright(status.copyright);
        }
      },
      onImageError: () => {
        const brokenUrl = resolved.imageUrl;
        if (!brokenUrl) return;
        setFailedBackdropUrls((prev) => {
          const next = new Set(prev);
          next.add(brokenUrl);
          return next;
        });
        if (
          resolved.sourceMode === 'place_photo' &&
          placeBackdropData.photos.length > 1 &&
          resolved.photoIndex + 1 < placeBackdropData.photos.length
        ) {
          handleUpdatePlaceBackdropPref({ selectedPhotoIndex: resolved.photoIndex + 1 });
        }
      },
    };
  }, [
    activeCustomSpot,
    placeBackdropPref,
    placeBackdropData,
    backdropTargetKey,
    backdropTargetLat,
    backdropTargetLng,
    backdropTargetQuery,
    selectedPlace?.name,
    selectedPlace?.streetViewLat,
    selectedPlace?.streetViewLng,
    selectedPlace?.streetViewPanoId,
    selectedPlace?.streetViewCopyright,
    weather?.cityName,
    isLiveSvUnavailableForTarget,
    liveSvBillingError,
    liveSvCopyright,
    failedBackdropUrls,
    handleUpdatePlaceBackdropPref,
  ]);

  const handleSelectPlaceMapSpot = useCallback(
    (spot) => {
      if (!spot?.panoId || !Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) return;
      setCustomBackdropSpot({
        targetKey: backdropTargetKey,
        lat: spot.lat,
        lng: spot.lng,
        panoId: spot.panoId,
        copyright: spot.copyright || '© Google',
        panoQuality: spot.panoQuality || 'ground_street',
      });
      setLiveSvUnavailableKey('');
      setLiveSvBillingError(false);
      setLiveSvCopyright(spot.copyright || '© Google');
      handleUpdatePlaceBackdropPref({ enabled: true, sourceMode: 'street_view' });
    },
    [backdropTargetKey, handleUpdatePlaceBackdropPref]
  );

  const handleResetPlaceMapSpot = useCallback(() => {
    setCustomBackdropSpot(null);
  }, []);

  const handleChangePlaceBackdropHeading = useCallback(
    (nextHeading) => {
      handleUpdatePlaceBackdropPref({ streetViewHeading: nextHeading });
    },
    [handleUpdatePlaceBackdropPref]
  );

  const handleOpenMapAdjusterFromPicker = useCallback(() => {
    setBgPickerOpen(false);
    handleUpdatePlaceBackdropPref({ enabled: true, sourceMode: 'street_view' });
    setMapAdjusterOpen(true);
  }, [handleUpdatePlaceBackdropPref]);

  // Low-priority background preload of sibling Street View headings (0°/90°/180°/270°) & next Place Photo
  // so changing viewing direction or cycling photos applies instantaneously (0ms blank flash).
  useEffect(() => {
    if (!placeBackdropPref.enabled || !activePlaceBackdrop?.active || !activePlaceBackdrop?.imageUrl) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      if (activePlaceBackdrop.sourceMode === 'street_view' && activePlaceBackdrop.streetViewPanoId) {
        const currentHeading = activePlaceBackdrop.streetViewHeading ?? 0;
        for (const opt of STREET_VIEW_HEADING_OPTIONS) {
          if (opt.heading === currentHeading) continue;
          preloadBackdropImage(
            buildStreetViewProxyUrl(
              activePlaceBackdrop.streetViewPanoId,
              opt.heading,
              STREET_VIEW_PORTRAIT_PITCH
            )
          );
        }
      } else if (
        activePlaceBackdrop.sourceMode === 'place_photo' &&
        Array.isArray(placeBackdropData.photos) &&
        placeBackdropData.photos.length > 1
      ) {
        const nextIdx = (activePlaceBackdrop.photoIndex + 1) % placeBackdropData.photos.length;
        const nextPhoto = placeBackdropData.photos[nextIdx];
        if (nextPhoto?.photoName) {
          preloadBackdropImage(
            buildPlacePhotoProxyUrl(
              nextPhoto.photoName,
              PLACE_PHOTO_PROXY_MAX_WIDTH,
              PLACE_PHOTO_PROXY_MAX_HEIGHT
            )
          );
        }
      }
    }, 320);

    return () => window.clearTimeout(timer);
  }, [
    placeBackdropPref.enabled,
    activePlaceBackdrop?.active,
    activePlaceBackdrop?.imageUrl,
    activePlaceBackdrop?.sourceMode,
    activePlaceBackdrop?.streetViewPanoId,
    activePlaceBackdrop?.streetViewHeading,
    activePlaceBackdrop?.photoIndex,
    placeBackdropData.photos,
  ]);

  // Auto-seed 5 material items per newly created sub-slot (including rainy-day umbrellas) when empty
  useEffect(() => {
    const needsSubSlotCheck =
      isAccessorySlotKey(activeSlotKey) || isJewelrySlotKey(activeSlotKey);
    if (!needsSubSlotCheck && !isRainyWeatherActive) return;

    const closetKey = activeCloset || 'sample';
    const checkSlot = isRainyWeatherActive && !needsSubSlotCheck ? 'acc_umbrella' : activeSlotKey;
    const matchingCount = garments.filter((g) => doesGarmentMatchSubSlot(g, checkSlot)).length;
    const umbrellaCount = isRainyWeatherActive
      ? garments.filter((g) => isWearableStudioGarment(g) && isUmbrellaGarment(g)).length
      : 1;

    if (matchingCount > 0 && umbrellaCount > 0) return;

    const guardKey = `${closetKey}:${checkSlot}:${isRainyWeatherActive ? 'rain' : 'slot'}`;
    if (ensuredSeedClosetsRef.current.has(guardKey)) return;
    ensuredSeedClosetsRef.current.add(guardKey);

    let cancelled = false;
    apiFetch('/garments/ensure-material-seeds', {
      method: 'POST',
      body: JSON.stringify({ closet_owner: closetKey }),
    })
      .then((res) => {
        if (!cancelled && res?.inserted > 0) {
          onClosetUpdated?.();
        }
      })
      .catch(() => {
        // ignore offline/seed race
      });

    return () => {
      cancelled = true;
    };
  }, [activeSlotKey, isRainyWeatherActive, garments, activeCloset, onClosetUpdated]);

  const slots = useMemo(() => {
    const hasRawSelection = Object.values(rawSlots).some(Boolean);
    const baseSlots =
      !hasRawSelection && !hasExplicitSlotState && garments.length > 0
        ? buildInitialStudioSlots(garments, null, isDemoShowcaseAccount)
        : rawSlots;

    const next = { ...EMPTY_STUDIO_SLOTS };
    if (garments.length === 0) {
      for (const key of ALL_EQUIPPABLE_SLOT_KEYS) {
        next[key] = baseSlots[key] || null;
      }
      return next;
    }

    const byId = new Map(garments.map((g) => [Number(g.id), g]));
    for (const key of ALL_EQUIPPABLE_SLOT_KEYS) {
      const cur = baseSlots[key];
      if (!cur) continue;
      const resolved = byId.get(Number(cur.id)) || cur;
      next[key] = resolved && isWearableStudioGarment(resolved) ? resolved : null;
    }

    // Automatically equip first available umbrella ONLY on open-sky outdoor stages during rain
    // (unless user explicitly unequipped it). Enclosed-ceiling indoor stages suppress umbrella action.
    const shouldAutoEquipUmbrella = isRainyWeatherActive && isEquippedStageOutdoor;
    if (shouldAutoEquipUmbrella && !manualRainUmbrellaCleared && !next.acc_umbrella) {
      const firstUmbrella =
        garments.find((g) => isWearableStudioGarment(g) && isUmbrellaGarment(g)) || null;
      if (firstUmbrella) {
        next.acc_umbrella = firstUmbrella;
        autoEquippedUmbrellaIdRef.current = firstUmbrella.id;
      }
    } else if (
      !shouldAutoEquipUmbrella &&
      next.acc_umbrella &&
      autoEquippedUmbrellaIdRef.current != null &&
      Number(next.acc_umbrella.id) === Number(autoEquippedUmbrellaIdRef.current)
    ) {
      next.acc_umbrella = null;
    }

    return next;
  }, [
    rawSlots,
    hasExplicitSlotState,
    garments,
    isDemoShowcaseAccount,
    isRainyWeatherActive,
    isEquippedStageOutdoor,
    manualRainUmbrellaCleared,
  ]);

  const equippedTitleSig = useMemo(
    () =>
      ALL_EQUIPPABLE_SLOT_KEYS.map((slotKey) => `${slotKey}:${slots[slotKey]?.id ?? ''}`).join(
        '|'
      ),
    [slots]
  );

  useEffect(() => {
    if (prevEquippedTitleSigRef.current && prevEquippedTitleSigRef.current !== equippedTitleSig) {
      hasCustomOutfitTitleRef.current = false;
    }
    prevEquippedTitleSigRef.current = equippedTitleSig;
  }, [equippedTitleSig]);

  const totalWearableCount = useMemo(
    () => garments.filter((g) => isWearableStudioGarment(g)).length,
    [garments]
  );

  const activeProfileGender = useMemo(() => {
    const raw =
      bridgedAvatar?.spec?.framePreset === 'feminine'
        ? 'female'
        : bridgedAvatar?.spec?.framePreset === 'masculine'
          ? 'male'
          : bodySpec?.gender || skinProfile?.gender || user?.gender || 'male';
    return raw === 'female' ? 'female' : 'male';
  }, [bridgedAvatar, bodySpec, skinProfile, user]);

  const hasGenderMismatchedUnderwear = Boolean(
    (slots.underwear && !doesUnderwearMatchGender(slots.underwear, activeProfileGender)) ||
      (slots.underwear_top && !doesUnderwearMatchGender(slots.underwear_top, activeProfileGender))
  );

  useEffect(() => {
    if (!hasGenderMismatchedUnderwear) return undefined;
    const timer = window.setTimeout(() => {
      setSlots((prev) => {
        const dropBottom =
          Boolean(prev.underwear) && !doesUnderwearMatchGender(prev.underwear, activeProfileGender);
        const dropTop =
          Boolean(prev.underwear_top) &&
          !doesUnderwearMatchGender(prev.underwear_top, activeProfileGender);
        if (!dropBottom && !dropTop) return prev;
        return {
          ...prev,
          ...(dropBottom ? { underwear: null } : {}),
          ...(dropTop ? { underwear_top: null } : {}),
        };
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hasGenderMismatchedUnderwear, activeProfileGender]);

  const rawSlotGarmentCount = useMemo(
    () =>
      garments.filter((g) => {
        if (!isWearableStudioGarment(g) || !doesGarmentMatchSubSlot(g, activeSlotKey)) {
          return false;
        }
        if (
          (activeSlotKey === 'underwear' || activeSlotKey === 'underwear_top') &&
          !doesUnderwearMatchGender(g, activeProfileGender)
        ) {
          return false;
        }
        return true;
      }).length,
    [garments, activeSlotKey, activeProfileGender]
  );

  const slotGarments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const isUnderwearTab = activeSlotKey === 'underwear' || activeSlotKey === 'underwear_top';
    const filtered = garments.filter((g) => {
      if (!isWearableStudioGarment(g)) return false;
      if (!doesGarmentMatchSubSlot(g, activeSlotKey)) return false;
      if (isUnderwearTab && !doesUnderwearMatchGender(g, activeProfileGender)) {
        return false;
      }
      if (!doesGarmentMatchOccasion(g, occasionFilter)) return false;
      if (seasonFilter !== 'all' && !parseSeasons(g.seasons).includes(seasonFilter)) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        g.name,
        g.name_en,
        localizeGarmentName(g.name, lang),
        g.brand,
        g.color_name,
        g.subcategory,
        g.fabric,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    if (isUnderwearTab) {
      const equippedUnderwearIds = new Set(
        [slots.underwear?.id, slots.underwear_top?.id]
          .filter((id) => id != null)
          .map((id) => Number(id))
      );
      if (equippedUnderwearIds.size === 0) return filtered;
      return filtered.filter((item) => !equippedUnderwearIds.has(Number(item.id)));
    }

    const equippedId = slots[activeSlotKey]?.id;
    if (equippedId == null) return filtered;
    // Exclude currently equipped slot item so "착용 중" appears ONLY once in .atelier-pinned-equipped-dock
    return filtered.filter((item) => Number(item.id) !== Number(equippedId));
  }, [
    garments,
    activeSlotKey,
    activeProfileGender,
    occasionFilter,
    seasonFilter,
    searchQuery,
    lang,
    slots,
  ]);

  const equippedItems = useMemo(() => {
    return ALL_EQUIPPABLE_SLOT_KEYS.map((k) => slots[k]).filter(Boolean);
  }, [slots]);

  const equippedCountByParentTab = useMemo(() => {
    const accCount = ACCESSORY_SUBTREE_SLOTS.filter((s) => Boolean(slots[s.key])).length;
    const jwlCount = JEWELRY_SUBTREE_SLOTS.filter((s) => Boolean(slots[s.key])).length;
    return {
      outer: (slots.outer ? 1 : 0) + (slots.outer_mid ? 1 : 0),
      top: (slots.top ? 1 : 0) + (slots.top_mid ? 1 : 0),
      bottom: slots.bottom ? 1 : 0,
      onepiece: slots.onepiece ? 1 : 0,
      underwear: (slots.underwear ? 1 : 0) + (slots.underwear_top ? 1 : 0),
      socks: slots.socks ? 1 : 0,
      shoes: slots.shoes ? 1 : 0,
      accessory: accCount,
      jewelry: jwlCount,
    };
  }, [slots]);

  useEffect(() => {
    setDrawerVisibleCount(18);
  }, [activeSlotKey, occasionFilter, seasonFilter, searchQuery, mobileSheetOpen]);

  useEffect(() => {
    if (drawerVisibleCount >= slotGarments.length) return undefined;
    const sentinel = drawerLoadMoreRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') {
      setDrawerVisibleCount(slotGarments.length);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setDrawerVisibleCount((prev) => computeNextVisibleBatch(prev, slotGarments.length, 24));
        }
      },
      { rootMargin: '280px 0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [drawerVisibleCount, slotGarments.length, mobileSheetOpen]);

  const isBottomSaggingEligible = useMemo(
    () => isSaggingEligibleBottom(slots.bottom),
    [slots.bottom]
  );
  const effectiveSaggingFit = isBottomSaggingEligible && saggingFit;

  const underwearInteraction = useMemo(() => {
    const outerTarget = slots.onepiece || slots.bottom || slots.top || null;
    const activeUnderwear = slots.underwear || slots.underwear_top || null;
    if (!activeUnderwear || !outerTarget) return null;
    return evaluateUnderwearOuterInteraction({
      underwear: activeUnderwear,
      outerGarment: outerTarget,
      gender: activeProfileGender,
    });
  }, [slots.underwear, slots.underwear_top, slots.onepiece, slots.bottom, slots.top, activeProfileGender]);

  const findPreferredHipHopUnderwear = useCallback(
    (catalog = garments) => {
      const list = (Array.isArray(catalog) ? catalog : []).filter((g) =>
        doesUnderwearMatchGender(g, activeProfileGender)
      );
      const boxerBriefs = list.find(
        (g) => String(g?.subcategory || '').toLowerCase() === 'boxer_briefs'
      );
      if (boxerBriefs) return boxerBriefs;
      const wovenBoxers = list.find(
        (g) => String(g?.subcategory || '').toLowerCase() === 'woven_boxers'
      );
      if (wovenBoxers) return wovenBoxers;
      return list.find((g) => mapGarmentToFittingSlot(g) === 'underwear') || null;
    },
    [garments, activeProfileGender]
  );

  const applySaggingPolicyForStyle = useCallback(
    (styleKey, mappedSlots) => {
      const eligible = isSaggingEligibleBottom(mappedSlots?.bottom);
      if (styleKey === 'hiphop' && eligible) {
        setSaggingFit(true);
        setStreetSaggingPrompt(false);
        if (!mappedSlots.underwear) {
          const preferred = findPreferredHipHopUnderwear(garments);
          if (preferred) {
            return { ...mappedSlots, underwear: preferred };
          }
        }
        return mappedSlots;
      }
      if (styleKey === 'street' && eligible) {
        setSaggingFit(false);
        setStreetSaggingPrompt(true);
        return mappedSlots;
      }
      setSaggingFit(false);
      setStreetSaggingPrompt(false);
      return mappedSlots;
    },
    [findPreferredHipHopUnderwear, garments]
  );

  const uniqueSavedOutfits = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const outfit of savedOutfits) {
      const key = String(outfit.title || '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push(outfit);
      if (list.length >= 6) break;
    }
    return list;
  }, [savedOutfits]);

  const cities = weatherPayload?.cities?.length ? weatherPayload.cities : DEFAULT_CITIES;
  const scenarios = useMemo(() => {
    const rawList = Array.isArray(weatherPayload?.scenarios) ? weatherPayload.scenarios : [];
    const byKey = new Map(
      rawList
        .filter((item) => item && typeof item.key === 'string')
        .map((item) => [item.key, item])
    );
    return DEFAULT_SCENARIOS.map((def) => {
      const matched = byKey.get(def.key);
      return matched?.label ? { ...def, label: matched.label } : def;
    });
  }, [weatherPayload]);

  const recommendations = useMemo(
    () =>
      curateStyledRecommendations({
        rawRecs: weatherPayload?.recommendations,
        garments,
        weather,
        lookStyleConfig,
        allowOutdoorUmbrella: isEquippedStageOutdoor,
      }),
    [weatherPayload, garments, weather, lookStyleConfig, isEquippedStageOutdoor]
  );

  const activeRecommendation =
    recommendations.find((r) => r.id === activeRecId) || recommendations[0] || null;

  const resolvedCityDisplayLabel = useMemo(() => {
    if (selectedPlace?.name) {
      const tpoShort = lang === 'en' ? selectedPlace.tpoLabelEn : selectedPlace.tpoLabelKo;
      return `${selectedPlace.name} · ${tpoShort}`;
    }
    if (cityKey === 'gps') {
      return gpsCoords?.label || tx(lang, '내 위치', 'My Location');
    }
    const matched = cities.find((c) => c.key === cityKey);
    if (matched?.name) {
      const koName = String(matched.name).replace(/\s*·\s*/g, ' ').trim();
      return lang === 'en'
        ? CITY_EN_NAMES[matched.key] || localizeOutfitTitle(koName, 'en')
        : koName;
    }
    if (weather?.cityName) {
      const koName = String(weather.cityName).replace(/\s*·\s*/g, ' ').trim();
      return lang === 'en' ? localizeOutfitTitle(koName, 'en') : koName;
    }
    return tx(lang, '서울 중구 명동', 'Seoul · Myeongdong, Jung-gu');
  }, [selectedPlace, cityKey, gpsCoords, cities, weather, lang]);

  const handleSelectCity = (nextCity) => {
    scenarioSnapshotsRef.current = {};
    userModifiedSlotsRef.current = false;
    forceAutoApplyWeatherRef.current = true;
    setManualRainUmbrellaCleared(false);
    activeRecIdRef.current = null;
    setActiveRecId(null);
    setSelectedPlace(null);
    saveStoredSelectedPlace(null);
    setCityKey(nextCity);
    triggerHaptic('selection');
  };

  const runDestinationPlaceSearch = (rawInput, onlyStreetView = streetViewOnlySearch) => {
    setPlaceSearchError('');
    if (placeSearchTimerRef.current) {
      clearTimeout(placeSearchTimerRef.current);
    }
    const trimmed = String(rawInput || '').trim();
    if (trimmed.length < 2) {
      placeSearchSeqRef.current += 1;
      setPlaceSuggestions([]);
      setPlaceSearchFilteredOutCount(0);
      setPlaceSearching(false);
      return;
    }
    const reqSeq = ++placeSearchSeqRef.current;
    setPlaceSearching(true);
    placeSearchTimerRef.current = setTimeout(async () => {
      try {
        if (onlyStreetView) {
          const candidates = await searchDestinationPlacesWithLocation({
            input: trimmed,
            lang,
            lat: gpsCoords?.lat,
            lng: gpsCoords?.lon,
          });
          if (placeSearchSeqRef.current !== reqSeq) return;
          const verified = await filterPlacesByEyeLevelStreetView(candidates, {
            onlySupported: true,
          });
          if (placeSearchSeqRef.current !== reqSeq) return;
          setPlaceSuggestions(verified.places);
          setPlaceSearchFilteredOutCount(verified.filteredOutCount);
        } else {
          const list = await autocompleteDestinationPlaces({
            input: trimmed,
            sessionToken: placeSessionTokenRef.current,
            lang,
            lat: gpsCoords?.lat,
            lng: gpsCoords?.lon,
          });
          if (placeSearchSeqRef.current !== reqSeq) return;
          setPlaceSuggestions(list);
          setPlaceSearchFilteredOutCount(0);
        }
      } catch (err) {
        if (placeSearchSeqRef.current !== reqSeq) return;
        setPlaceSuggestions([]);
        setPlaceSearchFilteredOutCount(0);
        setPlaceSearchError(
          err?.message ||
            tx(lang, '장소 검색에 실패했습니다.', 'Failed to search places.')
        );
      } finally {
        if (placeSearchSeqRef.current === reqSeq) {
          setPlaceSearching(false);
        }
      }
    }, 280);
  };

  const handlePlaceQueryChange = (rawInput) => {
    setPlaceQuery(rawInput);
    runDestinationPlaceSearch(rawInput, streetViewOnlySearch);
  };

  const handleToggleStreetViewOnlySearch = (nextOnly) => {
    triggerHaptic('selection');
    setStreetViewOnlySearch(nextOnly);
    if (placeQuery.trim().length >= 2) {
      runDestinationPlaceSearch(placeQuery, nextOnly);
    }
  };

  const applySelectedDestinationPlace = (nextPlace, { enableStreetViewBackdrop = false } = {}) => {
    scenarioSnapshotsRef.current = {};
    userModifiedSlotsRef.current = false;
    forceAutoApplyWeatherRef.current = true;
    setLiveSvUnavailableKey('');
    setLiveSvBillingError(false);
    setLiveSvCopyright(nextPlace.streetViewCopyright || null);
    setCustomBackdropSpot(null);
    setSelectedPlace(nextPlace);
    saveStoredSelectedPlace(nextPlace);
    setPlaceQuery('');
    setPlaceSuggestions([]);
    setPlaceSearchFilteredOutCount(0);
    setPlaceBackdropRefreshNonce((n) => n + 1);
    if (enableStreetViewBackdrop) {
      handleUpdatePlaceBackdropPref({ enabled: true, sourceMode: 'street_view' });
    }
    triggerHaptic('medium');
    showToast?.(
      tx(
        lang,
        `${nextPlace.name} (${nextPlace.tpoLabelKo}) 기준 날씨와 눈높이 배경을 불러옵니다.`,
        `Loading weather & eye-level backdrop for ${nextPlace.name} (${nextPlace.tpoLabelEn}).`
      )
    );
  };

  const handleSelectVerifiedStreetViewPlace = (candidate) => {
    if (!candidate?.placeId || typeof candidate.lat !== 'number' || typeof candidate.lng !== 'number') {
      return;
    }
    const tpo = inferTpoFromPlaceTypes(
      candidate.primaryType,
      candidate.types,
      candidate.mainText || candidate.fullText
    );
    applySelectedDestinationPlace(
      {
        placeId: candidate.placeId,
        name: candidate.mainText || candidate.fullText,
        formattedAddress: candidate.formattedAddress || candidate.secondaryText || '',
        lat: candidate.lat,
        lng: candidate.lng,
        primaryType: candidate.primaryType || '',
        streetViewPanoId: candidate.streetViewPanoId || null,
        streetViewLat:
          typeof candidate.streetViewLat === 'number' ? candidate.streetViewLat : candidate.lat,
        streetViewLng:
          typeof candidate.streetViewLng === 'number' ? candidate.streetViewLng : candidate.lng,
        streetViewCopyright: candidate.streetViewCopyright || '© Google',
        ...tpo,
      },
      { enableStreetViewBackdrop: true }
    );
  };

  const handlePickDestinationPlace = async (suggestion) => {
    if (!suggestion?.placeId || placePickingId) return;
    // Fast-path: candidates from eye-level Street View filtered search already carry verified coords & panoId
    if (typeof suggestion.lat === 'number' && typeof suggestion.lng === 'number') {
      handleSelectVerifiedStreetViewPlace(suggestion);
      return;
    }
    setPlacePickingId(suggestion.placeId);
    setPlaceSearchError('');
    try {
      const details = await fetchDestinationPlaceDetails({
        placeId: suggestion.placeId,
        sessionToken: placeSessionTokenRef.current,
        lang,
      });
      placeSessionTokenRef.current = createPlacesSessionToken();
      const tpo = inferTpoFromPlaceTypes(
        details.primaryType,
        details.types,
        details.name || suggestion.mainText
      );
      applySelectedDestinationPlace({
        placeId: details.placeId,
        name: details.name || suggestion.mainText,
        formattedAddress: details.formattedAddress || suggestion.secondaryText,
        lat: details.lat,
        lng: details.lng,
        primaryType: details.primaryType,
        ...tpo,
      });
    } catch (err) {
      setPlaceSearchError(
        err?.message ||
          tx(lang, '장소 좌표를 불러오지 못했습니다.', 'Could not load place details.')
      );
    } finally {
      setPlacePickingId(null);
    }
  };

  const handleClearSelectedPlace = () => {
    triggerHaptic('selection');
    scenarioSnapshotsRef.current = {};
    forceAutoApplyWeatherRef.current = true;
    setSelectedPlace(null);
    saveStoredSelectedPlace(null);
    setPlaceQuery('');
    setPlaceSuggestions([]);
    setPlaceSearchFilteredOutCount(0);
  };

  const handleSelectScenario = (nextScenario) => {
    if (!nextScenario || nextScenario === scenarioKey) return;
    if (Object.values(rawSlots).some(Boolean)) {
      scenarioSnapshotsRef.current[weatherSnapshotScopeKey] = {
        rawSlots,
        activeRecId,
        manualRainUmbrellaCleared,
      };
    }

    const nextScopeKey = `${nextScenario}:${dayTarget}`;
    const savedSnap = scenarioSnapshotsRef.current[nextScopeKey];
    if (savedSnap && Object.values(savedSnap.rawSlots || {}).some(Boolean)) {
      const restoredSlots = { ...savedSnap.rawSlots };
      if (
        nextScenario !== 'rainy_cool' &&
        restoredSlots.acc_umbrella &&
        autoEquippedUmbrellaIdRef.current != null &&
        Number(restoredSlots.acc_umbrella.id) === Number(autoEquippedUmbrellaIdRef.current)
      ) {
        restoredSlots.acc_umbrella = null;
      }
      if (nextScenario !== 'rainy_cool') {
        autoEquippedUmbrellaIdRef.current = null;
      }
      setSlots(restoredSlots);
      setActiveRecId(savedSnap.activeRecId ?? null);
      activeRecIdRef.current = savedSnap.activeRecId ?? null;
      setManualRainUmbrellaCleared(Boolean(savedSnap.manualRainUmbrellaCleared));
      setHasExplicitSlotState(true);
      userModifiedSlotsRef.current = true;
      forceAutoApplyWeatherRef.current = false;
      setScenarioKey(nextScenario);
      triggerHaptic('selection');
      return;
    }

    userModifiedSlotsRef.current = false;
    forceAutoApplyWeatherRef.current = true;
    setManualRainUmbrellaCleared(false);
    activeRecIdRef.current = null;
    setActiveRecId(null);
    if (nextScenario !== 'rainy_cool') {
      autoEquippedUmbrellaIdRef.current = null;
      setSlots((prev) => ({ ...prev, acc_umbrella: null }));
    }
    setScenarioKey(nextScenario);
    if (nextScenario === 'rainy_cool' && isEquippedStageOutdoor) {
      const firstUmbrella = garments.find(
        (g) => isWearableStudioGarment(g) && isUmbrellaGarment(g)
      );
      if (firstUmbrella) {
        autoEquippedUmbrellaIdRef.current = firstUmbrella.id;
        setSlots((prev) => ({ ...prev, acc_umbrella: firstUmbrella }));
        setHasExplicitSlotState(true);
      }
    }
    triggerHaptic('selection');
  };

  const handleSelectDayTarget = (nextDayTarget) => {
    const normalized = nextDayTarget === 'tomorrow' ? 'tomorrow' : 'today';
    if (normalized === dayTarget) return;
    if (Object.values(rawSlots).some(Boolean)) {
      scenarioSnapshotsRef.current[weatherSnapshotScopeKey] = {
        rawSlots,
        activeRecId,
        manualRainUmbrellaCleared,
      };
    }
    scenarioSnapshotsRef.current = {
      ...scenarioSnapshotsRef.current,
    };
    userModifiedSlotsRef.current = false;
    forceAutoApplyWeatherRef.current = true;
    setManualRainUmbrellaCleared(false);
    activeRecIdRef.current = null;
    setActiveRecId(null);
    setDayTarget(normalized);
    triggerHaptic('selection');
  };

  const handleUseGpsLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      showToast?.(tx(lang, '위치 정보를 사용할 수 없습니다.', 'Geolocation is unavailable.'));
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        let geoJson = null;
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller
          ? setTimeout(() => {
              controller.abort();
            }, 5000)
          : null;
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=ko`,
            controller ? { signal: controller.signal } : undefined
          );
          if (resp.ok) {
            geoJson = await resp.json();
          }
        } catch {
          // Fallback to closest city centroid if reverse geocoding times out or fails offline
        } finally {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
        const resolvedLabel = formatKoreanDistrictLocation(geoJson, lat, lon, CITY_COORDS);
        setLocatingGps(false);
        setGpsCoords({
          lat,
          lon,
          label: resolvedLabel,
        });
        scenarioSnapshotsRef.current = {};
        userModifiedSlotsRef.current = false;
        forceAutoApplyWeatherRef.current = true;
        setManualRainUmbrellaCleared(false);
        activeRecIdRef.current = null;
        setActiveRecId(null);
        setCityKey('gps');
        setScenarioKey('live');
      },
      () => {
        setLocatingGps(false);
        showToast?.(tx(lang, '위치 권한을 확인해주세요.', 'Please check location permissions.'));
      },
      { timeout: 6000 }
    );
  };

  const handleApplyRecommendation = (rec) => {
    if (!rec) return;
    triggerHaptic('selection');
    markTodayOutfitGenerated();
    userModifiedSlotsRef.current = false;
    setManualRainUmbrellaCleared(false);
    activeRecIdRef.current = rec.id;
    setActiveRecId(rec.id);
    setHasExplicitSlotState(true);
    const rawMapped = mapWeatherRecToSlots(rec, garments, weather, {
      allowOutdoorUmbrella: isEquippedStageOutdoor,
    });
    const mapped = applyStylingDensityFilter(rawMapped, stylingPrefRef.current, weather);
    const recIndex = recommendations.findIndex((r) => r.id === rec.id);
    const resolvedStyleKey =
      rec.styleKey ||
      (recIndex === 1 ? lookStyleConfig.look2Style : lookStyleConfig.look1Style);
    const finalizedSlots = applySaggingPolicyForStyle(resolvedStyleKey, mapped);
    setSlots(finalizedSlots);
  };

  const handleUpdateStylingPref = (patch) => {
    triggerHaptic('selection');
    const nextPref = { ...stylingPrefRef.current, ...patch };
    stylingPrefRef.current = nextPref;
    setStylingPref(nextPref);
    saveStoredStylingPreference(nextPref);

    if (activeRecommendation) {
      const rawMapped = mapWeatherRecToSlots(activeRecommendation, garments, weather, {
        allowOutdoorUmbrella: isEquippedStageOutdoor,
      });
      const filtered = applyStylingDensityFilter(rawMapped, nextPref, weather);
      const recIndex = recommendations.findIndex((r) => r.id === activeRecommendation.id);
      const resolvedStyleKey =
        activeRecommendation.styleKey ||
        (recIndex === 1 ? lookStyleConfig.look2Style : lookStyleConfig.look1Style);
      setSlots(applySaggingPolicyForStyle(resolvedStyleKey, filtered));
    } else {
      setSlots((prev) => applyStylingDensityFilter(prev, nextPref, weather));
    }
  };

  const handleToggleUvAccessorySlot = (slotKey, garment, isEquipped) => {
    if (!slotKey || !garment) return;
    userModifiedSlotsRef.current = true;
    setHasExplicitSlotState(true);
    setSlots((prev) => ({
      ...prev,
      [slotKey]: isEquipped ? null : garment,
    }));
    showToast?.(
      isEquipped
        ? tx(lang, `${garment.name} 착용을 해제했어요.`, `Removed ${garment.name}.`)
        : tx(lang, `UV 대비 ${garment.name}을(를) 착용했어요.`, `Equipped ${garment.name} for UV protection.`)
    );
  };

  const handleChangeLookStyle = (lookIndex, nextStyleKey) => {
    if (!VALID_LOOK_STYLE_KEYS.has(nextStyleKey)) return;
    triggerHaptic('selection');
    const nextConfig =
      lookIndex === 0
        ? { ...lookStyleConfig, look1Style: nextStyleKey }
        : { ...lookStyleConfig, look2Style: nextStyleKey };
    setLookStyleConfig(nextConfig);
    writeStoredLookStyleConfig(nextConfig);

    const nextRecs = curateStyledRecommendations({
      rawRecs: weatherPayload?.recommendations,
      garments,
      weather,
      lookStyleConfig: nextConfig,
      allowOutdoorUmbrella: isEquippedStageOutdoor,
    });
    const targetRec = nextRecs[lookIndex];
    const prevRecAtIdx = recommendations[lookIndex];
    const isTargetLookActive = Boolean(
      (prevRecAtIdx && activeRecId === prevRecAtIdx.id) ||
        (targetRec && activeRecId === targetRec.id) ||
        (lookIndex === 0 && !activeRecId && !userModifiedSlotsRef.current)
    );
    if (targetRec && isTargetLookActive) {
      userModifiedSlotsRef.current = false;
      setManualRainUmbrellaCleared(false);
      activeRecIdRef.current = targetRec.id;
      setActiveRecId(targetRec.id);
      setHasExplicitSlotState(true);
      const rawMapped = mapWeatherRecToSlots(targetRec, garments, weather, {
        allowOutdoorUmbrella: isEquippedStageOutdoor,
      });
      const mapped = applyStylingDensityFilter(rawMapped, stylingPrefRef.current, weather);
      const finalizedSlots = applySaggingPolicyForStyle(nextStyleKey, mapped);
      setSlots(finalizedSlots);
    }
  };

  const handleQuickSelectSkinPreset = (preset) => {
    if (!preset) return;
    const seasonInfo =
      SEASON_BEST_SWATCHES[preset.personalColor] || SEASON_BEST_SWATCHES.autumn_warm;
    triggerHaptic('selection');
    if (!userModifiedSlotsRef.current) {
      forceAutoApplyWeatherRef.current = true;
    }
    onUpdateSkinProfile?.({
      skinToneHex: preset.skinToneHex,
      personalColor: preset.personalColor,
      personalColorLabelKo: seasonInfo.labelKo,
      subTypeLabelKo: preset.subTypeLabelKo,
      gender: effectiveGender,
      presetKey: preset.key,
    });
    patchAvatarSpec({
      appearance: {
        skinToneHex: preset.skinToneHex,
        personalColor: preset.personalColor,
      },
    });
  };

  const handleLogTomorrowCalendar = async () => {
    if (equippedItems.length === 0) return;
    setLoggingTomorrow(true);
    try {
      const targetDate =
        weather?.date ||
        (dayTarget === 'tomorrow'
          ? new Date(Date.now() + 86400000).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10));
      const labelTitle =
        localizeOutfitTitle(activeRecommendation?.title, lang) ||
        tx(
          lang,
          dayTarget === 'tomorrow'
            ? `${weather?.cityName || '서울'} 내일 코디`
            : `${weather?.cityName || '서울'} 오늘 코디`,
          dayTarget === 'tomorrow' ? 'Tomorrow Weather Look' : 'Today Weather Look'
        );
      await apiFetch('/calendar', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: activeCloset || 'sample',
          worn_date: targetDate,
          outfit_id: null,
          item_ids: equippedItems.map((g) => g.id),
          status: 'planned',
          note: `${labelTitle} (${weather?.tempMin ?? 9}°/${weather?.tempMax ?? 17}°)`,
        }),
      });
      triggerHaptic('medium');
      onClosetUpdated?.();
      showToast?.(
        tx(
          lang,
          dayTarget === 'tomorrow' ? '내일 캘린더에 추가됨' : '오늘 캘린더에 추가됨',
          dayTarget === 'tomorrow' ? 'Added to tomorrow calendar' : 'Added to today calendar'
        )
      );
    } catch (err) {
      showToast?.(
        localizeApiMessage(err?.message, lang) || tx(lang, '기록 실패', 'Failed to log outfit')
      );
    } finally {
      setLoggingTomorrow(false);
    }
  };

  const handleToggleEquip = (item) => {
    const defaultSubSlot = mapGarmentToDefaultSubSlot(item);
    const isUnderwearItem = defaultSubSlot === 'underwear' || defaultSubSlot === 'underwear_top';
    const targetSlotKey = isUnderwearItem
      ? defaultSubSlot
      : doesGarmentMatchSubSlot(item, activeSlotKey)
        ? activeSlotKey
        : defaultSubSlot;
    const isUnequipping = slots[targetSlotKey]?.id === item.id;

    setSelectedInspectorId(item?.id ?? null);
    userModifiedSlotsRef.current = true;
    markTodayOutfitGenerated();
    setActiveRecId(null);
    setHasExplicitSlotState(true);
    if (targetSlotKey === 'acc_umbrella') {
      autoEquippedUmbrellaIdRef.current = null;
      setManualRainUmbrellaCleared(isUnequipping);
    }
    triggerHaptic('selection');

    const nextSlots = {
      ...slots,
      [targetSlotKey]: isUnequipping ? null : item,
    };

    if (!isUnequipping) {
      if (targetSlotKey === 'onepiece' && !isSwimwearGarment(item)) {
        // Non-swimwear dress/jumpsuit replaces top, top_mid & bottom cleanly
        nextSlots.top = null;
        nextSlots.top_mid = null;
        nextSlots.bottom = null;
      } else if (
        (targetSlotKey === 'top' || targetSlotKey === 'top_mid' || targetSlotKey === 'bottom') &&
        nextSlots.onepiece &&
        !isSwimwearGarment(nextSlots.onepiece)
      ) {
        // Equipping top, top_mid, or bottom clears a non-swimwear dress (swimwear stays layerable!)
        nextSlots.onepiece = null;
      }
    }

    setSlots(nextSlots);
  };

  const handleUnequipSlot = (slotKey) => {
    const removedId = slots[slotKey]?.id;
    if (removedId != null) {
      setSelectedInspectorId((prev) => (prev === removedId ? null : prev));
    }
    userModifiedSlotsRef.current = true;
    setActiveRecId(null);
    setHasExplicitSlotState(true);
    if (slotKey === 'acc_umbrella') {
      autoEquippedUmbrellaIdRef.current = null;
      setManualRainUmbrellaCleared(true);
    }
    triggerHaptic('selection');
    setSlots({ ...slots, [slotKey]: null });
  };

  const handleSaveOutfit = async (e) => {
    e?.preventDefault?.();
    if (!guardUserPermission(user, 'btn:outfits:save')) return;
    if (equippedItems.length === 0) return;
    setSavingOutfit(true);
    try {
      const title =
        outfitTitle.trim() ||
        localizeOutfitTitle(activeRecommendation?.title, lang) ||
        equippedItems
          .slice(0, 2)
          .map((g) => resolveGarmentDisplayName(g, lang))
          .join(' · ');
      const savedOutfitRes = await apiFetch('/outfits', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: activeCloset || 'sample',
          title,
          occasion: 'Daily',
          season: '봄/가을',
          item_ids: equippedItems.map((g) => g.id),
        }),
      });

      const targetDate =
        weather?.date && /^\d{4}-\d{2}-\d{2}$/.test(String(weather.date))
          ? String(weather.date)
          : dayTarget === 'tomorrow'
            ? getLocalDateKey(new Date(Date.now() + 86400000))
            : getLocalDateKey(new Date());

      await apiFetch('/calendar', {
        method: 'POST',
        body: JSON.stringify({
          closet_owner: activeCloset || 'sample',
          worn_date: targetDate,
          outfit_id: savedOutfitRes?.id ?? null,
          item_ids: equippedItems.map((g) => g.id),
          weather_summary: weather?.condition || SHORT_SCENARIO_LABELS[scenarioKey]?.ko || '예보',
          temp_c:
            typeof weather?.avgTemp === 'number' && Number.isFinite(weather.avgTemp)
              ? Math.round(weather.avgTemp)
              : null,
          status: dayTarget === 'tomorrow' ? 'planned' : 'worn',
          note: title,
        }),
      });

      markTodayOutfitGenerated();
      hasCustomOutfitTitleRef.current = false;
      setOutfitTitle('');
      triggerHaptic('medium');
      await reloadOutfits();
      onClosetUpdated?.();

      const [, mPart, dPart] = targetDate.split('-');
      setCalendarSavedModal({
        dateStr: targetDate,
        monthNum: Number(mPart) || new Date().getMonth() + 1,
        dayNum: Number(dPart) || new Date().getDate(),
        title,
      });
    } catch (err) {
      showToast?.(
        localizeApiMessage(err?.message, lang) || tx(lang, '저장 실패', 'Failed to save outfit')
      );
    } finally {
      setSavingOutfit(false);
    }
  };

  const handleApplySavedOutfit = (outfit) => {
    const byId = new Map(garments.map((g) => [Number(g.id), g]));
    const next = { ...EMPTY_STUDIO_SLOTS };
    for (const rawId of outfit.item_ids || []) {
      const g = byId.get(Number(rawId));
      if (!g || !isWearableStudioGarment(g)) continue;
      const defaultKey = mapGarmentToDefaultSubSlot(g);
      if (!next[defaultKey]) {
        next[defaultKey] = g;
      } else {
        const oppKey = getOppositeSideSubSlot(defaultKey);
        if (oppKey && !next[oppKey]) {
          next[oppKey] = g;
        }
      }
    }
    if (next.onepiece && !isSwimwearGarment(next.onepiece)) {
      next.top = null;
      next.bottom = null;
    }
    userModifiedSlotsRef.current = true;
    setActiveRecId(null);
    setHasExplicitSlotState(true);
    if (next.acc_umbrella) {
      setManualRainUmbrellaCleared(false);
    }
    triggerHaptic('selection');
    setSlots(next);
  };

  const handleRestoreHistorySlots = useCallback(
    (slotGarmentIds) => {
      if (!slotGarmentIds || typeof slotGarmentIds !== 'object') return false;
      const entries = Object.entries(slotGarmentIds);
      if (entries.length === 0) return false;
      const byId = new Map(garments.map((g) => [Number(g.id), g]));
      const next = { ...EMPTY_STUDIO_SLOTS };
      let matchedCount = 0;
      for (const [slotKey, rawId] of entries) {
        const g = byId.get(Number(rawId));
        if (!g || !isWearableStudioGarment(g)) continue;
        if (ALL_EQUIPPABLE_SLOT_KEYS.includes(slotKey)) {
          next[slotKey] = g;
          matchedCount += 1;
        }
      }
      if (matchedCount === 0) return false;
      userModifiedSlotsRef.current = true;
      setActiveRecId(null);
      setHasExplicitSlotState(true);
      setManualRainUmbrellaCleared(!next.acc_umbrella);
      triggerHaptic('selection');
      setSlots(next);
      return true;
    },
    [garments]
  );

  const handleDeleteSavedOutfit = async (outfitId) => {
    try {
      await apiFetch(`/outfits/${outfitId}`, { method: 'DELETE' });
      await reloadOutfits();
    } catch (err) {
      showToast?.(
        localizeApiMessage(err?.message, lang) ||
          tx(lang, '코디 삭제에 실패했습니다.', 'Failed to delete outfit.')
      );
    }
  };

  const handleNavigateToCloset = useCallback(() => {
    setMobileSheetOpen(false);
    triggerHaptic('selection');
    const closetTabBtn =
      typeof document !== 'undefined'
        ? document.querySelector('[data-nav-tab="closet"]')
        : null;
    if (closetTabBtn && typeof closetTabBtn.click === 'function') {
      closetTabBtn.click();
    }
  }, []);

  const renderSlotSearchBar = (inputRef) => (
    <div className="studio-slot-search-wrap studio-clearable-input-wrap">
      <Search size={15} className="studio-slot-search-icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        data-outfit-garment-search="true"
        className="hig-native-input studio-slot-search-input has-clear-btn"
        placeholder={tx(
          lang,
          '의류 이름 · 브랜드 · 색상 검색',
          'Search item, brand, color...'
        )}
        aria-label={tx(lang, '코디 의류 검색', 'Search garments in slot')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        maxLength={60}
      />
      {searchQuery.length > 0 && (
        <button
          type="button"
          data-clear-outfit-search="true"
          className="studio-input-clear-btn"
          aria-label={tx(lang, '검색어 전체 지우기', 'Clear search text')}
          onClick={() => {
            triggerHaptic('selection');
            setSearchQuery('');
            inputRef?.current?.focus?.();
          }}
        >
          <X size={15} />
        </button>
      )}
    </div>
  );

  const handleToggleSaggingFit = useCallback(() => {
    triggerHaptic('selection');
    const next = !effectiveSaggingFit;
    setSaggingFit(next);
    setStreetSaggingPrompt(false);
    if (next && !slots.underwear) {
      const preferred = findPreferredHipHopUnderwear(garments);
      if (preferred) {
        setSlots((prev) => ({ ...prev, underwear: preferred }));
        setHasExplicitSlotState(true);
      }
    }
    showToast?.(
      next
        ? tx(
            lang,
            '새깅 팬츠 핏 ON — AI 피팅 생성 시 로우 드롭 & 밴드 노출이 반영됩니다',
            'Sagging Fit ON — low-drop waist & exposed band will apply on AI Try-On'
          )
        : tx(lang, '새깅 팬츠 핏 OFF — 기본 웨이스트 핏으로 전환됨', 'Sagging Fit OFF — standard waist fit')
    );
  }, [effectiveSaggingFit, slots.underwear, findPreferredHipHopUnderwear, garments, lang, showToast]);

  const renderFitToolsMicroBar = () => {
    if (!isBottomSaggingEligible && !underwearInteraction) return null;
    const vplStatusLabel =
      underwearInteraction?.riskLevel === 'high'
        ? tx(lang, '비침·VPL 주의', 'VPL / Sheer')
        : underwearInteraction?.riskLevel === 'medium'
          ? tx(lang, '비침·VPL 미세', 'VPL Subtle')
          : tx(lang, '비침·VPL 안정', 'VPL Clean');
    return (
      <div className="atelier-fit-micro-bar" data-fit-tools-micro-bar="true">
        {isBottomSaggingEligible && (
          <button
            type="button"
            data-sagging-fit-toggle="true"
            aria-pressed={effectiveSaggingFit}
            className={`atelier-fit-micro-btn ${effectiveSaggingFit ? 'is-active' : ''}`}
            onClick={handleToggleSaggingFit}
          >
            <span>
              {effectiveSaggingFit
                ? tx(lang, '새깅 핏 · ON', 'Sagging · ON')
                : tx(lang, '새깅 핏 · OFF', 'Sagging · OFF')}
            </span>
          </button>
        )}
        {underwearInteraction && (
          <button
            type="button"
            data-underwear-sim-trigger="true"
            data-underwear-risk={underwearInteraction.riskLevel}
            className={`atelier-fit-micro-btn ${
              underwearInteraction.riskLevel === 'high' ? 'is-alert' : ''
            }`}
            onClick={() => {
              triggerHaptic('selection');
              setUnderwearSimModalOpen(true);
            }}
          >
            <span>{vplStatusLabel}</span>
          </button>
        )}
      </div>
    );
  };

  const renderSeasonFilterRail = () => (
    <div className="studio-season-dropdown-row">
      <select
        data-outfit-season-select="true"
        className="studio-dropdown-select"
        aria-label={tx(lang, '계절 필터', 'Season Filter')}
        value={seasonFilter}
        onChange={(e) => {
          triggerHaptic('selection');
          setSeasonFilter(e.target.value);
        }}
      >
        {STUDIO_SEASON_FILTERS.map((s) => (
          <option key={s.key} value={s.key} data-outfit-season-filter={s.key}>
            {tx(lang, s.ko, s.en)}
          </option>
        ))}
      </select>
    </div>
  );

  const renderSubTreePanel = () => {
    if (activeParentTab === 'top') {
      const topStageValue = activeSlotKey === 'top_mid' ? 'top_mid' : 'top';
      return (
        <div
          className="studio-subtree-panel"
          data-layer-subtree="top"
          role="region"
          aria-label={tx(lang, '상의 레이어링 단계 선택', 'Top Layering Stage')}
        >
          <div className="studio-subtree-select-wrap">
            <select
              data-layer-stage-select="top"
              className="studio-dropdown-select"
              aria-label={tx(lang, '상의 단계 선택', 'Select Top Layer Stage')}
              value={topStageValue}
              onChange={(e) => {
                triggerHaptic('selection');
                setSelectedInspectorId(null);
                setActiveSlotKey(e.target.value);
              }}
            >
              <option value="top">
                {tx(lang, '1단계 · 이너 상의 (티·셔츠·니트)', 'Stage 1 · Base Top (Tee · Shirt · Knit)')}
              </option>
              <option value="top_mid">
                {tx(lang, '2단계 · 미드 레이어 (가디건·조끼)', 'Stage 2 · Mid Layer (Cardigan · Vest)')}
              </option>
            </select>
          </div>
        </div>
      );
    }

    if (activeParentTab === 'outer') {
      const outerStageValue = activeSlotKey === 'outer_mid' ? 'outer_mid' : 'outer';
      return (
        <div
          className="studio-subtree-panel"
          data-layer-subtree="outer"
          role="region"
          aria-label={tx(lang, '외투 레이어링 단계 선택', 'Outerwear Layering Stage')}
        >
          <div className="studio-subtree-select-wrap">
            <select
              data-layer-stage-select="outer"
              className="studio-dropdown-select"
              aria-label={tx(lang, '외투 단계 선택', 'Select Outerwear Layer Stage')}
              value={outerStageValue}
              onChange={(e) => {
                triggerHaptic('selection');
                setSelectedInspectorId(null);
                setActiveSlotKey(e.target.value);
              }}
            >
              <option value="outer_mid">
                {tx(lang, '1단계 · 미드 아우터 (블레이저·자켓)', 'Stage 1 · Mid Outer (Blazer · Jacket)')}
              </option>
              <option value="outer">
                {tx(lang, '2단계 · 아우터 (코트·트렌치·패딩)', 'Stage 2 · Outer Coat (Coat · Trench · Puffer)')}
              </option>
            </select>
          </div>
        </div>
      );
    }

    if (activeParentTab === 'underwear') {
      const underwearStageValue = activeSlotKey === 'underwear_top' ? 'underwear_top' : 'underwear';
      return (
        <div
          className="studio-subtree-panel"
          data-layer-subtree="underwear"
          role="region"
          aria-label={tx(lang, '언더웨어 멀티 착용 구성 선택', 'Underwear Multi-Wear View')}
        >
          <div className="studio-subtree-select-wrap">
            <select
              data-layer-stage-select="underwear"
              className="studio-dropdown-select"
              aria-label={tx(lang, '언더웨어 파트 선택', 'Select Underwear Part')}
              value={underwearStageValue}
              onChange={(e) => {
                triggerHaptic('selection');
                setSelectedInspectorId(null);
                setActiveSlotKey(e.target.value);
              }}
            >
              <option value="underwear">
                {tx(
                  lang,
                  '전체 · 멀티 착용 (상의+하의 동시 선택)',
                  'All · Multi-Wear (Top + Bottom)'
                )}
              </option>
              <option value="underwear_top">
                {tx(
                  lang,
                  '이너 상의만 보기 (누브라 · 이너탑)',
                  'Inner Top Only (Nubra · Inner Top)'
                )}
              </option>
            </select>
          </div>
        </div>
      );
    }

    const isAcc = activeParentTab === 'accessory';
    const isJwl = activeParentTab === 'jewelry';
    if (!isAcc && !isJwl) return null;

    const branchGroups = isAcc ? ACCESSORY_BRANCH_GROUPS : JEWELRY_BRANCH_GROUPS;

    return (
      <div
        className="studio-subtree-panel"
        data-accessory-subtree={isAcc ? 'true' : undefined}
        data-jewelry-subtree={isJwl ? 'true' : undefined}
        role="region"
        aria-label={
          isAcc
            ? tx(lang, '액세서리 부위별 착용 선택', 'Accessory Body-Part Selector')
            : tx(lang, '주얼리 부위별 착용 선택', 'Jewelry Body-Part Selector')
        }
      >
        <div className="studio-subtree-select-wrap">
          <select
            data-subtree-select={isAcc ? 'accessory' : 'jewelry'}
            className="studio-dropdown-select"
            aria-label={
              isAcc
                ? tx(lang, '액세서리 부위 선택', 'Select Accessory Part')
                : tx(lang, '주얼리 부위 선택', 'Select Jewelry Part')
            }
            value={activeSlotKey}
            onChange={(e) => {
              triggerHaptic('selection');
              setSelectedInspectorId(null);
              setActiveSlotKey(e.target.value);
            }}
          >
            {branchGroups.map((group) => (
              <optgroup
                key={group.branchKey}
                label={lang === 'en' ? group.branchEn : group.branchKo}
              >
                {group.items.map((sub) => {
                  const equippedInSub = Boolean(slots[sub.key]);
                  const labelText = lang === 'en' ? sub.labelEn : sub.labelKo;
                  return (
                    <option key={sub.key} value={sub.key}>
                      {equippedInSub ? `✓ ${labelText} (${tx(lang, '착용 중', 'Worn')})` : labelText}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
    );
  };

  const activeSlotCategoryTitle = useMemo(() => {
    const parentPair = PARENT_CATEGORY_HEADER_LABELS[activeParentTab];
    const parentLabel = parentPair
      ? tx(lang, parentPair.ko, parentPair.en)
      : tx(lang, '아이템 선택', 'Select Item');
    const subMeta = SUB_SLOT_META_BY_KEY[activeSlotKey];
    if (subMeta && activeSlotKey !== 'accessory') {
      const subShort = lang === 'en' ? subMeta.shortEn : subMeta.shortKo;
      return `${parentLabel} · ${subShort}`;
    }
    return parentLabel;
  }, [activeSlotKey, activeParentTab, lang]);

  const focusedDrawerTitle = activeSlotCategoryTitle;

  const pinnedSlotInfo = useMemo(() => {
    if (slots[activeSlotKey]) {
      return {
        item: slots[activeSlotKey],
        slotKey: activeSlotKey,
        isOnepieceFallback: false,
      };
    }
    if (activeParentTab === 'top' && slots.onepiece) {
      return {
        item: slots.onepiece,
        slotKey: 'onepiece',
        isOnepieceFallback: true,
      };
    }
    return null;
  }, [slots, activeSlotKey, activeParentTab]);

  const hasActiveDrawerFilter =
    occasionFilter !== 'all' || seasonFilter !== 'all' || searchQuery.trim().length > 0;

  const renderDrawerHeader = (isMobileSheet, inputRef) => (
    <div className="atelier-drawer-header">
      <div className="atelier-drawer-title-group">
        <button
          type="button"
          className="atelier-drawer-nav-btn"
          aria-label={
            isMobileSheet
              ? tx(lang, '옷장 서랍 닫기', 'Close wardrobe drawer')
              : tx(lang, '이전 카테고리', 'Previous category')
          }
          onClick={() => {
            if (isMobileSheet) {
              triggerHaptic('selection');
              setMobileSheetOpen(false);
            } else {
              handleStepPrevFittingTab();
            }
          }}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          className={`atelier-drawer-focused-title is-search-trigger ${drawerSearchOpen ? 'is-open' : ''}`.trim()}
          data-drawer-focused-title="true"
          aria-expanded={drawerSearchOpen}
          title={tx(lang, '눌러서 의류 검색', 'Tap to search garments')}
          onClick={() => {
            triggerHaptic('selection');
            setDrawerSearchOpen((prev) => {
              const next = !prev;
              if (next) {
                requestAnimationFrame(() => inputRef?.current?.focus?.());
              }
              return next;
            });
          }}
        >
          <span className="atelier-drawer-focused-title-label">{focusedDrawerTitle}</span>
          <span className="atelier-drawer-search-hint">
            {tx(lang, '눌러서 검색', 'Tap to search')}
          </span>
        </button>
      </div>
      <button
        type="button"
        className={`atelier-drawer-filter-btn ${hasActiveDrawerFilter ? 'has-active-filter' : ''}`.trim()}
        aria-label={tx(lang, '의류 검색 및 필터 포커스', 'Focus search and filters')}
        title={tx(lang, '검색 및 필터', 'Search & Filters')}
        onClick={() => {
          triggerHaptic('selection');
          setDrawerSearchOpen(true);
          requestAnimationFrame(() => inputRef?.current?.focus?.());
        }}
      >
        <Filter size={15} />
        {hasActiveDrawerFilter && <span className="atelier-drawer-filter-dot" aria-hidden="true" />}
      </button>
    </div>
  );

  const renderOccasionTabs = () => (
    <div
      className="atelier-occasion-tabs"
      role="tablist"
      aria-label={tx(lang, '무드 및 상황 필터', 'Mood & Occasion Filter')}
    >
      {STUDIO_OCCASION_TABS.map((tab) => {
        const active = occasionFilter === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            data-outfit-occasion-tab={tab.key}
            aria-selected={active}
            className={`atelier-occasion-tab ${active ? 'is-active' : ''}`.trim()}
            onClick={() => {
              triggerHaptic('selection');
              setOccasionFilter(tab.key);
            }}
          >
            <span>{tx(lang, tab.ko, tab.en)}</span>
          </button>
        );
      })}
    </div>
  );

  const renderPinnedEquippedCard = (closeOnPick = false) => {
    const inspectedItem =
      selectedInspectorId != null
        ? slotGarments.find((g) => g.id === selectedInspectorId) || null
        : null;

    if (inspectedItem) {
      const specs = resolveGarmentInspectorSpecs(inspectedItem, lang);
      const oppositeSlotKey = getOppositeSideSubSlot(activeSlotKey);
      const oppositeItem = oppositeSlotKey ? slots[oppositeSlotKey] : null;
      const isEquippedOpposite = Boolean(oppositeItem && oppositeItem.id === inspectedItem.id);
      const oppositeBadgeLabel = oppositeSlotKey?.endsWith('_left')
        ? tx(lang, 'L 착용', 'Worn L')
        : tx(lang, 'R 착용', 'Worn R');

      return (
        <div className="atelier-pinned-equipped-dock">
          <div
            className="atelier-inventory-spec-card is-pinned is-inspecting"
            data-pinned-inspector-card={inspectedItem.id}
            role="region"
            aria-label={tx(lang, '선택한 아이템 상세 정보', 'Selected item details')}
          >
            <div className="atelier-spec-status-bar">
              <div className="atelier-spec-status-left">
                <span className="atelier-spec-status-pill is-selected">
                  <span>{tx(lang, '선택됨', 'Selected')}</span>
                </span>
                {isEquippedOpposite && (
                  <span className="atelier-spec-opposite-chip">{oppositeBadgeLabel}</span>
                )}
              </div>
              <div className="atelier-spec-status-actions">
                <button
                  type="button"
                  data-equip-inspector-btn="true"
                  className="atelier-spec-equip-btn"
                  onClick={() => {
                    handleToggleEquip(inspectedItem);
                    if (closeOnPick) setMobileSheetOpen(false);
                  }}
                >
                  {tx(lang, '착용', 'Wear')}
                </button>
                <button
                  type="button"
                  className="atelier-spec-dismiss-btn"
                  aria-label={tx(lang, '선택 닫기', 'Close preview')}
                  onClick={() => {
                    triggerHaptic('selection');
                    setSelectedInspectorId(null);
                  }}
                >
                  <X size={13} strokeWidth={2.4} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="atelier-spec-main-row">
              <div className="atelier-spec-info-col">
                <span className="atelier-spec-item-name">{specs.displayName}</span>
                <span className="atelier-spec-brand-line">
                  {`${specs.brandLabel} · ${specs.subcategoryLabel}`}
                </span>
                <div className="atelier-spec-meta-pills">
                  <span className="atelier-spec-meta-pill">
                    <span
                      className="atelier-spec-color-dot"
                      style={{ backgroundColor: specs.colorHex }}
                      aria-hidden="true"
                    />
                    <span>{specs.colorLabel}</span>
                  </span>
                  <span className="atelier-spec-meta-pill">{specs.materialLabel}</span>
                  <span className="atelier-spec-meta-pill">{specs.seasonLabel}</span>
                  {isBagGarmentItem(inspectedItem) && (() => {
                    const carrySpec = inferBagCarrySpec(inspectedItem);
                    const carryLabelMap = {
                      hand_only: tx(lang, '끈 없음 · 핸드캐리', 'No Strap · Hand Carry'),
                      shoulder: tx(lang, '끈 있음 · 숄더', 'Strap · Shoulder'),
                      crossbody: tx(lang, '끈 있음 · 크로스', 'Strap · Crossbody'),
                      backpack: tx(lang, '끈 있음 · 백팩', 'Dual Straps · Backpack'),
                      convertible_hand_strap: tx(lang, '끈 있음 · 핸드/숄더', 'Strap · Convertible'),
                    };
                    return (
                      <span
                        className="atelier-spec-meta-pill"
                        data-bag-strap-badge={carrySpec.hasStrap ? 'strap' : 'no-strap'}
                        data-bag-carry-style={carrySpec.carryStyle}
                      >
                        {carryLabelMap[carrySpec.carryStyle] || carryLabelMap.hand_only}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div className="atelier-spec-thumb-squircle">
                <GarmentObject25D item={inspectedItem} alt={specs.displayName} padding="8%" />
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (activeParentTab === 'underwear') {
      const equippedUnderwearCards = [
        slots.underwear_top
          ? {
              slotKey: 'underwear_top',
              item: slots.underwear_top,
              statusLabel: tx(lang, '착용 중 · 이너 상의', 'Equipped · Inner Top'),
            }
          : null,
        slots.underwear
          ? {
              slotKey: 'underwear',
              item: slots.underwear,
              statusLabel: tx(lang, '착용 중 · 이너 하의', 'Equipped · Underwear'),
            }
          : null,
      ].filter(Boolean);

      if (equippedUnderwearCards.length === 0) return null;

      return (
        <div className="atelier-pinned-equipped-dock flex flex-col gap-2">
          {equippedUnderwearCards.map((entry) => {
            const specs = resolveGarmentInspectorSpecs(entry.item, lang);
            return (
              <div
                key={entry.slotKey}
                className="atelier-inventory-spec-card is-pinned"
                data-pinned-equipped-card={entry.item.id}
                role="region"
                aria-label={tx(lang, '현재 착용 중인 언더웨어', 'Currently equipped underwear')}
              >
                <div className="atelier-spec-status-bar">
                  <span className="atelier-spec-status-pill is-equipped">
                    <Check size={11} strokeWidth={2.8} aria-hidden="true" />
                    <span>{entry.statusLabel}</span>
                  </span>
                  <button
                    type="button"
                    data-pinned-unequip-btn="true"
                    className="atelier-spec-unequip-btn"
                    onClick={() => handleUnequipSlot(entry.slotKey)}
                  >
                    {tx(lang, '해제', 'Remove')}
                  </button>
                </div>

                <div className="atelier-spec-main-row">
                  <div className="atelier-spec-info-col">
                    <span className="atelier-spec-item-name">{specs.displayName}</span>
                    <span className="atelier-spec-brand-line">
                      {`${specs.brandLabel} · ${specs.subcategoryLabel}`}
                    </span>
                    <div className="atelier-spec-meta-pills">
                      <span className="atelier-spec-meta-pill">
                        <span
                          className="atelier-spec-color-dot"
                          style={{ backgroundColor: specs.colorHex }}
                          aria-hidden="true"
                        />
                        <span>{specs.colorLabel}</span>
                      </span>
                      <span className="atelier-spec-meta-pill">{specs.materialLabel}</span>
                      <span className="atelier-spec-meta-pill">{specs.seasonLabel}</span>
                    </div>
                  </div>

                  <div className="atelier-spec-thumb-squircle">
                    <GarmentObject25D item={entry.item} alt={specs.displayName} padding="8%" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (!pinnedSlotInfo?.item) return null;
    const equippedItem = pinnedSlotInfo.item;
    const specs = resolveGarmentInspectorSpecs(equippedItem, lang);
    const statusLabel = pinnedSlotInfo.isOnepieceFallback
      ? tx(lang, '착용 중 · 원피스', 'Equipped · Dress')
      : tx(lang, '착용 중', 'Equipped');

    return (
      <div className="atelier-pinned-equipped-dock">
        <div
          className="atelier-inventory-spec-card is-pinned"
          data-pinned-equipped-card={equippedItem.id}
          role="region"
          aria-label={tx(lang, '현재 착용 중인 아이템', 'Currently equipped item')}
        >
          <div className="atelier-spec-status-bar">
            <span className="atelier-spec-status-pill is-equipped">
              <Check size={11} strokeWidth={2.8} aria-hidden="true" />
              <span>{statusLabel}</span>
            </span>
            <button
              type="button"
              data-pinned-unequip-btn="true"
              className="atelier-spec-unequip-btn"
              onClick={() => handleUnequipSlot(pinnedSlotInfo.slotKey)}
            >
              {tx(lang, '해제', 'Remove')}
            </button>
          </div>

          <div className="atelier-spec-main-row">
            <div className="atelier-spec-info-col">
              <span className="atelier-spec-item-name">{specs.displayName}</span>
              <span className="atelier-spec-brand-line">
                {`${specs.brandLabel} · ${specs.subcategoryLabel}`}
              </span>
              <div className="atelier-spec-meta-pills">
                <span className="atelier-spec-meta-pill">
                  <span
                    className="atelier-spec-color-dot"
                    style={{ backgroundColor: specs.colorHex }}
                    aria-hidden="true"
                  />
                  <span>{specs.colorLabel}</span>
                </span>
                <span className="atelier-spec-meta-pill">{specs.materialLabel}</span>
                <span className="atelier-spec-meta-pill">{specs.seasonLabel}</span>
                {isBagGarmentItem(equippedItem) && (() => {
                  const carrySpec = inferBagCarrySpec(equippedItem);
                  const carryLabelMap = {
                    hand_only: tx(lang, '끈 없음 · 핸드캐리', 'No Strap · Hand Carry'),
                    shoulder: tx(lang, '끈 있음 · 숄더', 'Strap · Shoulder'),
                    crossbody: tx(lang, '끈 있음 · 크로스', 'Strap · Crossbody'),
                    backpack: tx(lang, '끈 있음 · 백팩', 'Dual Straps · Backpack'),
                    convertible_hand_strap: tx(lang, '끈 있음 · 핸드/숄더', 'Strap · Convertible'),
                  };
                  return (
                    <span
                      className="atelier-spec-meta-pill"
                      data-bag-strap-badge={carrySpec.hasStrap ? 'strap' : 'no-strap'}
                      data-bag-carry-style={carrySpec.carryStyle}
                    >
                      {carryLabelMap[carrySpec.carryStyle] || carryLabelMap.hand_only}
                    </span>
                  );
                })()}
              </div>
            </div>

            <div className="atelier-spec-thumb-squircle">
              <GarmentObject25D item={equippedItem} alt={specs.displayName} padding="8%" />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSlotInventoryGrid = () => {
    const oppositeSlotKey = getOppositeSideSubSlot(activeSlotKey);
    const oppositeItem = oppositeSlotKey ? slots[oppositeSlotKey] : null;
    const showMaterialBadge =
      isAccessorySlotKey(activeSlotKey) || isJewelrySlotKey(activeSlotKey);
    const hasFilterOrSearch =
      occasionFilter !== 'all' || seasonFilter !== 'all' || searchQuery.trim().length > 0;
    const isFilterEmptyOnly = rawSlotGarmentCount > 0 && hasFilterOrSearch;

    const hasEquippedInSlot =
      activeParentTab === 'underwear'
        ? Boolean(slots.underwear || slots.underwear_top)
        : Boolean(slots[activeSlotKey]);
    const hasOnlyEquippedInSlot =
      slotGarments.length === 0 && hasEquippedInSlot && !hasFilterOrSearch;

    if (hasOnlyEquippedInSlot) {
      return (
        <div className="studio-slot-equipped-only-note" data-slot-equipped-only="true">
          <p className="studio-slot-empty-desc">
            {tx(
              lang,
              '현재 착용 중인 아이템 외 추가 의류가 없습니다.',
              'No other garments in this category besides the currently worn item.'
            )}
          </p>
          <button
            type="button"
            data-empty-go-closet-btn="true"
            className="studio-empty-cta-btn"
            onClick={handleNavigateToCloset}
          >
            <Plus size={14} />
            <span>{tx(lang, '옷장에서 의류 추가하기', 'Add Garments in Closet')}</span>
          </button>
        </div>
      );
    }

    if (slotGarments.length === 0) {
      return (
        <div className="studio-slot-empty-state" data-slot-empty-state="true">
          <p className="studio-slot-empty-title">
            {isFilterEmptyOnly
              ? tx(
                  lang,
                  '검색어 또는 필터 조건에 맞는 의류가 없습니다.',
                  'No garments match the current search or filter.'
                )
              : totalWearableCount === 0
                ? tx(
                    lang,
                    '아직 옷장에 등록된 의류가 없습니다.',
                    'Your closet has no garments yet.'
                  )
                : tx(
                    lang,
                    '이 카테고리에 선택 가능한 의류가 없습니다.',
                    'No selectable garments in this category yet.'
                  )}
          </p>
          <p className="studio-slot-empty-desc">
            {isFilterEmptyOnly
              ? tx(
                  lang,
                  '필터를 초기화하면 이 카테고리의 전체 의류를 다시 확인할 수 있습니다.',
                  'Reset filters to view all garments available in this slot.'
                )
              : tx(
                  lang,
                  '옷장에서 의류 사진을 등록하면 4각도 AI 가상 피팅과 날씨 코디에 즉시 활용됩니다.',
                  'Add garments in your Closet to try them on across 4 angles and weather scenes.'
                )}
          </p>
          {isFilterEmptyOnly ? (
            <button
              type="button"
              data-reset-outfit-filters="true"
              className="studio-empty-cta-btn"
              onClick={() => {
                triggerHaptic('selection');
                setOccasionFilter('all');
                setSeasonFilter('all');
                setSearchQuery('');
              }}
            >
              <RotateCcw size={14} />
              <span>{tx(lang, '필터·검색 초기화', 'Reset Search & Filter')}</span>
            </button>
          ) : (
            <button
              type="button"
              data-empty-go-closet-btn="true"
              className="studio-empty-cta-btn is-primary"
              onClick={handleNavigateToCloset}
            >
              <Plus size={15} />
              <span>{tx(lang, '옷장에서 의류 추가하기', 'Add Garments in Closet')}</span>
            </button>
          )}
        </div>
      );
    }

    const visibleSlotGarments = slotGarments.slice(0, drawerVisibleCount);
    const hasMoreDrawerItems = drawerVisibleCount < slotGarments.length;

    return (
      <div className="studio-mini-inventory-grid">
        {visibleSlotGarments.map((item, idx) => {
          const isExpanded = selectedInspectorId === item.id;
          const isEquippedOpposite = Boolean(oppositeItem && oppositeItem.id === item.id);
          const oppositeBadgeLabel = oppositeSlotKey?.endsWith('_left')
            ? tx(lang, 'L 착용', 'Worn L')
            : tx(lang, 'R 착용', 'Worn R');
          const displayName = resolveGarmentDisplayName(item, lang);
          return (
            <button
              key={item.id}
              type="button"
              data-slot-garment-id={item.id}
              aria-expanded={isExpanded ? 'true' : 'false'}
              className={`studio-mini-garment-card atelier-packshot-card${
                isExpanded ? ' is-inspector-selected' : ''
              }`}
              onClick={() => {
                triggerHaptic('selection');
                setSelectedInspectorId((prev) => (prev === item.id ? null : item.id));
              }}
            >
              <div className="studio-mini-squircle">
                <GarmentObject25D
                  item={item}
                  alt={displayName}
                  padding="10%"
                  eager={idx < 4}
                  fetchPriority={idx < 4 ? 'auto' : 'low'}
                />
                {isExpanded && (
                  <span className="atelier-packshot-selected-tag">
                    {tx(lang, '선택', 'Pick')}
                  </span>
                )}
                {isEquippedOpposite && (
                  <span className="studio-opposite-side-badge">{oppositeBadgeLabel}</span>
                )}
              </div>
              <span className="hig-garment-name atelier-packshot-tooltip" title={displayName}>
                {displayName}
              </span>
              {showMaterialBadge && item.fabric && (
                <span className="studio-mini-material-tag">
                  {resolveInspectorMaterialLabel(item.fabric, lang)}
                </span>
              )}
            </button>
          );
        })}
        {hasMoreDrawerItems && (
          <div
            ref={drawerLoadMoreRef}
            aria-hidden="true"
            style={{ gridColumn: '1 / -1', height: 20 }}
          />
        )}
      </div>
    );
  };

  return (
    <section className="hig-screen-container hig-outfits-screen" aria-label="Outfits">
      <header id="hig-top-bar" className="hig-top-bar atelier-top-bar">
        <div className="hig-top-bar-left">
          {onToggleTheme && (
            <button
              type="button"
              data-outfit-theme-toggle="true"
              className="hig-circle-icon-btn is-subtle"
              onClick={onToggleTheme}
              aria-label={
                theme === 'dark'
                  ? tx(lang, '라이트 모드로 전환', 'Switch to Light Mode')
                  : tx(lang, '다크 모드로 전환', 'Switch to Dark Mode')
              }
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          )}
          <div className="store-header-btn-wrap">
            <button
              type="button"
              data-open-store-btn="true"
              className={`hig-circle-icon-btn is-subtle store-header-btn ${
                freeDailyDrawAvailable ? 'has-free-draw' : ''
              }`.trim()}
              onClick={() => {
                if (!guardUserPermission(user, 'btn:outfits:store')) return;
                triggerHaptic('selection');
                setStoreOpen(true);
              }}
              title={tx(lang, '배경 스토어', 'Backdrop Store')}
              aria-label={tx(lang, '배경 스토어 열기', 'Open Backdrop Store')}
            >
              <Store size={17} />
              {freeDailyDrawAvailable && (
                <span className="store-header-dot" aria-hidden="true" />
              )}
            </button>

            {freeDailyDrawAvailable && (
              <button
                type="button"
                data-store-free-draw-bubble="true"
                className="store-free-draw-bubble"
                onClick={() => {
                  if (!guardUserPermission(user, 'btn:outfits:store')) return;
                  triggerHaptic('selection');
                  setStoreOpen(true);
                }}
              >
                <span>
                  {tx(
                    lang,
                    '오늘의 무료 뽑기 상품이 남았어요!',
                    'Free daily draw left!'
                  )}
                </span>
              </button>
            )}
          </div>
        </div>

        <div className="hig-top-bar-titles">
          <h1 className="sr-only">Outfits</h1>
          <AppHeaderBrand effectiveTheme={theme} lang={lang} />
        </div>

        <div className="hig-top-bar-actions">
          <TopRightUtilityActions
            skinProfile={skinProfile}
            lang={lang}
            onOpenProfile={onOpenProfile}
            onOpenAccount={onOpenAccount}
          />
        </div>
      </header>

      <div className="studio-25d-layout">
        {/* Ambient full-bleed stage backdrop behind both panes so the translucent right inventory drawer refracts live color & light */}
        <div className="studio-layout-ambient-bleed" aria-hidden="true">
          <img
            src={
              activePlaceBackdrop?.active && activePlaceBackdrop?.imageUrl
                ? activePlaceBackdrop.imageUrl
                : withPublicBaseUrl(equippedStageBg.imageUrl)
            }
            alt=""
            draggable={false}
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Center: Isometric Parametric Character Stage */}
        <div className="studio-25d-stage-col">
          {/* Collapsible Weather Alert Banner (renders only when alerts are active) */}
          <StudioWeatherAlertBanner weather={weather} lang={lang} />

          <Studio25DCanvas
            slots={slots}
            theme={theme}
            lang={lang}
            user={user}
            skinProfile={skinProfile}
            bodySpec={bodySpec}
            avatarSpec={bridgedAvatar.spec}
            avatarConfigHash={bridgedAvatar.avatarConfigHash}
            weather={weather}
            dayTarget={dayTarget}
            scenarioKey={scenarioKey}
            locationLabel={resolvedCityDisplayLabel}
            onOpenWeatherPopup={() => {
              if (!guardUserPermission(user, 'btn:outfits:weather_scenario')) return;
              setWeatherPopupOpen(true);
            }}
            weatherPopupOpen={weatherPopupOpen}
            recommendations={recommendations}
            activeRecId={activeRecId}
            lookStyleConfig={lookStyleConfig}
            onApplyRecommendation={handleApplyRecommendation}
            onAiLookGenerated={(meta) => {
              markTodayOutfitGenerated();
              if (!hasCustomOutfitTitleRef.current) {
                titleGenCounterRef.current += 1;
                const nextTitle = buildAutoOutfitTitle({
                  styleMode: meta?.styleMode,
                  weather,
                  scenarioKey,
                  slots: meta?.slots || slots,
                  activeRecommendation,
                  resolvedCityDisplayLabel,
                  lang,
                  previousTitle: outfitTitleRef.current,
                  generationNonce: titleGenCounterRef.current,
                });
                triggerGoldAutoOutfitTitle(nextTitle);
              }
            }}
            forceRefreshNonce={0}
            activeSlotKey={activeSlotKey}
            onSelectSlot={(slotKey) => {
              setSelectedInspectorId(null);
              setActiveSlotKey(slotKey);
              if (window.innerWidth < 600) {
                setMobileSheetOpen(true);
              }
            }}
            onUnequipSlot={handleUnequipSlot}
            onRestoreHistorySlots={handleRestoreHistorySlots}
            onQuickSelectPreset={handleQuickSelectSkinPreset}
            onOpenSkinToneModal={(tabHint) => {
              if (typeof tabHint === 'string' && onOpenProfile) {
                onOpenProfile(tabHint);
              } else if (onOpenSkinToneModal) {
                onOpenSkinToneModal();
              } else {
                onOpenProfile?.('skin');
              }
            }}
            onOpenBodyModal={handleOpenBodyModal}
            stageBackgroundId={economyState.equippedBackgroundId}
            lightingPreset={economyState.lightingPreset}
            lightingIntensity={economyState.lightingIntensity}
            placeBackdrop={activePlaceBackdrop}
            onUpdatePlaceBackdropBlur={(blurPx) => handleUpdatePlaceBackdropPref({ blurPx })}
            placeMapAdjusterOpen={mapAdjusterOpen}
            onTogglePlaceMapAdjuster={() => setMapAdjusterOpen((prev) => !prev)}
            onClosePlaceMapAdjuster={() => setMapAdjusterOpen(false)}
            onSelectPlaceMapSpot={handleSelectPlaceMapSpot}
            onChangePlaceBackdropHeading={handleChangePlaceBackdropHeading}
            onResetPlaceMapSpot={handleResetPlaceMapSpot}
            onOpenBackgroundPicker={() => {
              if (!guardUserPermission(user, 'btn:outfits:stage_bg')) return;
              setBgPickerOpen(true);
            }}
            onOpenMobileDrawer={() => setMobileSheetOpen(true)}
            mobileDrawerOpen={mobileSheetOpen}
            saggingFit={effectiveSaggingFit}
            stylingPref={stylingPref}
            onUpdateStylingPref={handleUpdateStylingPref}
            selectedPlace={selectedPlace}
            outfitSaveBar={{
              title: outfitTitle,
              onTitleChange: (val) => {
                hasCustomOutfitTitleRef.current = val.trim().length > 0;
                setIsGoldTitleWriting(false);
                setOutfitTitle(val);
              },
              onClearTitle: () => {
                triggerHaptic('selection');
                hasCustomOutfitTitleRef.current = false;
                setIsGoldTitleWriting(false);
                setOutfitTitle('');
              },
              onSave: handleSaveOutfit,
              saving: savingOutfit,
              canSave: equippedItems.length > 0,
              isGoldTitleWriting,
              goldTitleAnimNonce,
            }}
          />

          {/* Non-intrusive UV Smart Accessory 1-Tap Suggestion Card */}
          <StudioUvSuggestionCard
            weather={weather}
            garments={garments}
            slots={slots}
            onToggleAccessorySlot={handleToggleUvAccessorySlot}
            lang={lang}
          />
        </div>

        {/* Right Side (>= 600px): 42% Dark Smoked-Glass Wardrobe Drawer */}
        <aside id={CARBON_DOM_CONTRACT.studioSlotPickerId} className="studio-desktop-picker-col">
          {renderDrawerHeader(false, desktopSearchInputRef)}

          {renderOccasionTabs()}

          <div className="atelier-filter-strip">
            {(drawerSearchOpen || searchQuery.trim().length > 0) &&
              renderSlotSearchBar(desktopSearchInputRef)}
            {renderSeasonFilterRail()}
            {renderFitToolsMicroBar()}
          </div>

          {renderSubTreePanel()}

          <div className="atelier-drawer-body">
            <OutfitCategorySilhouetteRail
              activeParentTab={activeParentTab}
              equippedCountByParentTab={equippedCountByParentTab}
              lang={lang}
              isDesktopDrawer={true}
              onSelectTab={handleSelectTopFittingTab}
            />
            <div className="atelier-drawer-grid-col">
              {renderPinnedEquippedCard(false)}
              <div className="atelier-drawer-grid-scroll">{renderSlotInventoryGrid()}</div>
            </div>
          </div>

          {uniqueSavedOutfits.length > 0 && (
            <div className="studio-saved-looks-rail" aria-label="Saved Outfits">
              {uniqueSavedOutfits.map((outfit) => {
                const displayOutfitTitle = localizeOutfitTitle(outfit.title, lang);
                return (
                  <div key={outfit.id} className="studio-saved-look-chip">
                    <button
                      type="button"
                      className="studio-saved-look-select"
                      onClick={() => handleApplySavedOutfit(outfit)}
                    >
                      {displayOutfitTitle}
                    </button>
                    <button
                      type="button"
                      className="studio-saved-look-del"
                      aria-label={
                        lang === 'en'
                          ? `Delete ${displayOutfitTitle}`
                          : `${outfit.title} 삭제`
                      }
                      onClick={() => handleDeleteSavedOutfit(outfit.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      {/* Weather · Location · AI Look 1/2 Unified Settings Popup */}
      <ResponsiveSheetModal
        id={CARBON_DOM_CONTRACT.weatherRecommendPanelId}
        open={weatherPopupOpen}
        onClose={() => setWeatherPopupOpen(false)}
        lang={lang}
        eyebrow={tx(
          lang,
          dayTarget === 'tomorrow' ? '내일 날씨 코디' : '오늘 날씨 코디',
          dayTarget === 'tomorrow' ? 'Tomorrow Weather' : 'Today Weather'
        )}
        title={tx(
          lang,
          `${resolvedCityDisplayLabel} · ${dayTarget === 'tomorrow' ? '내일' : '오늘'} 날씨 및 AI 코디 설정`,
          `${resolvedCityDisplayLabel} · ${dayTarget === 'tomorrow' ? 'Tomorrow' : 'Today'} Weather & AI Look`
        )}
        maxWidth={480}
      >
        <div className="weather-popup-content">
          {/* Today vs Tomorrow Forecast Target Toggle */}
          <div className="weather-popup-day-toggle-row" role="group" aria-label={tx(lang, '날씨 기준일', 'Forecast Day')}>
            <button
              type="button"
              data-weather-day-target="today"
              aria-pressed={dayTarget === 'today'}
              className={`weather-popup-day-btn ${dayTarget === 'today' ? 'is-active' : ''}`}
              onClick={() => handleSelectDayTarget('today')}
            >
              {tx(lang, '오늘 날씨', 'Today')}
            </button>
            <button
              type="button"
              data-weather-day-target="tomorrow"
              aria-pressed={dayTarget === 'tomorrow'}
              className={`weather-popup-day-btn ${dayTarget === 'tomorrow' ? 'is-active' : ''}`}
              onClick={() => handleSelectDayTarget('tomorrow')}
            >
              {tx(lang, '내일 날씨', 'Tomorrow')}
            </button>
          </div>

          {/* 1) 오늘/내일의 날씨 정보 & 시뮬레이션 선택 */}
          <div className="weather-popup-section">
            <div className="weather-popup-section-head">
              <span className="weather-popup-section-title">
                {tx(
                  lang,
                  dayTarget === 'tomorrow' ? '내일의 날씨' : '오늘의 날씨',
                  dayTarget === 'tomorrow' ? 'Tomorrow Forecast' : 'Today Forecast'
                )}
              </span>
            </div>

            <div className="weather-popup-summary-card">
              <div className="weather-popup-summary-top">
                <div className="weather-popup-temp-group">
                  <span className="weather-popup-cond-icon" aria-hidden="true">
                    {weather?.isRainy ? (
                      <CloudRain size={18} />
                    ) : weather?.isSnowy || scenarioKey === 'winter_cold' ? (
                      <Snowflake size={18} />
                    ) : scenarioKey === 'summer_heatwave' ? (
                      <Flame size={18} />
                    ) : scenarioKey === 'cloudy_overcast' ? (
                      <Cloud size={18} />
                    ) : weather?.isWindy ? (
                      <Wind size={18} />
                    ) : weather ? (
                      <CloudSun size={18} />
                    ) : (
                      <Sun size={18} />
                    )}
                  </span>
                  <div className="weather-popup-temp-texts">
                    <div className="weather-popup-temp-row tabular-nums">
                      <strong className="weather-popup-temp-main">
                        {weather ? `${weather.tempMin}°/${weather.tempMax}°` : '9°/17°'}
                      </strong>
                      <span className="weather-popup-cond-badge">
                        {SHORT_SCENARIO_LABELS[scenarioKey]
                          ? lang === 'en'
                            ? SHORT_SCENARIO_LABELS[scenarioKey].en
                            : SHORT_SCENARIO_LABELS[scenarioKey].ko
                          : tx(lang, '예보', 'Forecast')}
                      </span>
                    </div>
                    <span className="weather-popup-env-meta tabular-nums">
                      {(() => {
                        const feelsC = getEffectiveFeelsLikeTemp(weather);
                        const uvVal = Number(weather?.uvIndex);
                        const uvText =
                          Number.isFinite(uvVal) && uvVal > 0
                            ? ` · UV ${Math.round(uvVal)} (${formatUvLevelLabel(
                                classifyUvLevelClient(uvVal),
                                lang
                              )})`
                            : '';
                        const feelsText =
                          feelsC !== null
                            ? lang === 'en'
                              ? ` · Feels ${feelsC}°C`
                              : ` · 체감 ${feelsC}°C`
                            : '';
                        if (
                          scenarioKey === 'live' &&
                          dayTarget !== 'tomorrow' &&
                          typeof weather?.currentTemp === 'number' &&
                          Number.isFinite(weather.currentTemp)
                        ) {
                          return tx(
                            lang,
                            `현재 ${Math.round(weather.currentTemp)}°C${feelsText} · 강수 ${
                              weather?.precipProb ?? (isRainyWeatherActive ? 80 : 10)
                            }% · 풍속 ${Math.round(weather?.windSpeed ?? 8)}km/h${uvText}`,
                            `Now ${Math.round(weather.currentTemp)}°C${feelsText} · Precip ${
                              weather?.precipProb ?? (isRainyWeatherActive ? 80 : 10)
                            }% · Wind ${Math.round(weather?.windSpeed ?? 8)}km/h${uvText}`
                          );
                        }
                        return tx(
                          lang,
                          `평균 ${Math.round(weather?.avgTemp ?? 13)}°C${feelsText} · 강수 ${
                            weather?.precipProb ?? (isRainyWeatherActive ? 80 : 10)
                          }% · 풍속 ${Math.round(weather?.windSpeed ?? 8)}km/h${uvText}`,
                          `Avg ${Math.round(weather?.avgTemp ?? 13)}°C${feelsText} · Precip ${
                            weather?.precipProb ?? (isRainyWeatherActive ? 80 : 10)
                          }% · Wind ${Math.round(weather?.windSpeed ?? 8)}km/h${uvText}`
                        );
                      })()}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  id="log-tomorrow-outfit-btn"
                  className="weather-popup-calendar-btn"
                  disabled={loggingTomorrow || equippedItems.length === 0}
                  onClick={handleLogTomorrowCalendar}
                  title={tx(
                    lang,
                    dayTarget === 'tomorrow' ? '내일 캘린더에 기록' : '오늘 캘린더에 기록',
                    dayTarget === 'tomorrow' ? 'Log to Tomorrow Calendar' : 'Log to Today Calendar'
                  )}
                  aria-label={tx(
                    lang,
                    dayTarget === 'tomorrow' ? '내일 캘린더에 기록' : '오늘 캘린더에 기록',
                    dayTarget === 'tomorrow' ? 'Log to Tomorrow Calendar' : 'Log to Today Calendar'
                  )}
                >
                  <CalendarPlus size={14} />
                  <span>
                    {tx(
                      lang,
                      dayTarget === 'tomorrow' ? '내일 캘린더에 기록' : '오늘 캘린더에 기록',
                      dayTarget === 'tomorrow' ? 'Log Tomorrow' : 'Log Today'
                    )}
                  </span>
                </button>
              </div>

              <p className="weather-popup-tip">
                {weather?.weatherTip &&
                (lang !== 'en' || !HANGUL_CHAR_RE.test(String(weather.weatherTip)))
                  ? String(weather.weatherTip).trim()
                  : tx(
                      lang,
                      isRainyWeatherActive
                        ? '비 예보에 맞춰 생활 방수 아우터와 우산 코디를 우선 추천합니다.'
                        : dayTarget === 'tomorrow'
                          ? '일교차와 체감 온도를 고려해 레이어링 밸런스를 맞춘 내일 코디입니다.'
                          : '일교차와 체감 온도를 고려해 레이어링 밸런스를 맞춘 오늘 코디입니다.',
                      isRainyWeatherActive
                        ? 'Water-resistant outerwear and umbrella styling prioritized for rain.'
                        : dayTarget === 'tomorrow'
                          ? 'Balanced layering curated for tomorrow’s temperature range.'
                          : 'Balanced layering curated for today’s temperature range.'
                    )}
              </p>

              <p className="weather-popup-source-caption" data-weather-source-caption="true">
                {weather?.fallbackUsed && scenarioKey === 'live'
                  ? tx(
                      lang,
                      '기상 정보: 오프라인 기본 예보 (네트워크 연결 확인 필요)',
                      'Weather source: Offline fallback estimate (check network connection)'
                    )
                  : tx(
                      lang,
                      '기상 정보 출처: Open-Meteo 예보 API (기상청·글로벌 수치예보 연동)',
                      'Weather source: Open-Meteo Forecast API (KMA & Global NWP)'
                    )}
              </p>
            </div>

            <div
              className="weather-popup-scenario-row"
              role="group"
              aria-label={tx(lang, '날씨', 'Weather Conditions')}
            >
              <button
                type="button"
                data-weather-scenario="live"
                aria-pressed={scenarioKey === 'live'}
                className={`weather-popup-live-btn ${scenarioKey === 'live' ? 'is-active' : ''}`.trim()}
                onClick={() => handleSelectScenario('live')}
              >
                {tx(lang, '예보', 'Live')}
              </button>

              <select
                data-weather-scenario-select="true"
                aria-label={tx(lang, '날씨 시뮬레이션 선택', 'Select Weather Simulation')}
                className="weather-popup-scenario-select"
                value={scenarioKey === 'live' ? '' : scenarioKey}
                onChange={(e) => {
                  if (e.target.value) handleSelectScenario(e.target.value);
                }}
              >
                <option value="" disabled>
                  {tx(
                    lang,
                    '날씨 시뮬레이션 (맑음·비·눈·한파...)',
                    'Simulate Weather (Sunny, Rain, Snow...)'
                  )}
                </option>
                {scenarios
                  .filter((sc) => sc.key !== 'live')
                  .map((sc) => {
                    const pair = SHORT_SCENARIO_LABELS[sc.key];
                    const shortLabel = pair
                      ? lang === 'en'
                        ? pair.en
                        : pair.ko
                      : sanitizeZeroHangulEn(localizeOutfitTitle(sc.label, lang), lang, sc.key);
                    return (
                      <option key={sc.key} value={sc.key} data-weather-scenario={sc.key}>
                        {shortLabel}
                      </option>
                    );
                  })}
              </select>
            </div>
          </div>

          {/* 2) 위치 정보 설정 */}
          <div className="weather-popup-section">
            <div className="weather-popup-section-head">
              <span className="weather-popup-section-title">
                {tx(lang, '위치 정보 설정', 'Location Settings')}
              </span>
            </div>

            <div className="weather-popup-location-row">
              <select
                aria-label={tx(lang, '도시 선택', 'Select City')}
                className="weather-city-select weather-popup-city-select"
                value={cityKey}
                onChange={(e) => handleSelectCity(e.target.value)}
              >
                {gpsCoords && (
                  <option value="gps">{tx(lang, '내 위치', 'My Location')}</option>
                )}
                {cities.map((c) => {
                  const koName = String(c.name || '').replace(/\s*·\s*/g, ' ').trim();
                  const label =
                    lang === 'en'
                      ? CITY_EN_NAMES[c.key] ||
                        sanitizeZeroHangulEn(localizeOutfitTitle(koName, 'en'), 'en', c.key)
                      : koName;
                  return (
                    <option key={c.key} value={c.key}>
                      {label}
                    </option>
                  );
                })}
              </select>

              <button
                type="button"
                className="weather-popup-gps-btn"
                onClick={handleUseGpsLocation}
                disabled={locatingGps}
                aria-label={tx(lang, '현재 위치 예보', 'Use Current GPS Location')}
              >
                <LocateFixed size={14} />
                <span>
                  {locatingGps
                    ? tx(lang, '확인 중...', 'Locating...')
                    : tx(lang, '현재 위치', 'Use GPS')}
                </span>
              </button>
            </div>

            {/* Google Maps Places TPO Destination Search */}
            <div className="mt-3 pt-3 border-t border-black/8 dark:border-white/10 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="studio-tpo-place-search"
                  className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200 flex items-center gap-1.5"
                >
                  <MapPin size={12} aria-hidden="true" />
                  <span>{tx(lang, '목적지 장소 검색 (TPO 연동)', 'Destination Search (TPO)')}</span>
                </label>
                {selectedPlace && (
                  <button
                    type="button"
                    onClick={handleClearSelectedPlace}
                    className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white underline underline-offset-2"
                  >
                    {tx(lang, '장소 해제', 'Clear place')}
                  </button>
                )}
              </div>

              {selectedPlace && (
                <div className="rounded-xl border border-black/10 dark:border-white/12 bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-neutral-900 dark:text-white truncate">
                      {selectedPlace.name}
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                      {lang === 'en' ? selectedPlace.tpoLabelEn : selectedPlace.tpoLabelKo}
                      {selectedPlace.formattedAddress ? ` · ${selectedPlace.formattedAddress}` : ''}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={streetViewOnlySearch}
                  data-maps-sv-filter-toggle="true"
                  onClick={() => handleToggleStreetViewOnlySearch(!streetViewOnlySearch)}
                  className={`inline-flex items-center gap-1.5 min-h-[30px] px-2.5 rounded-lg border text-[11px] font-semibold transition-colors ${
                    streetViewOnlySearch
                      ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white'
                      : 'bg-transparent text-neutral-600 border-black/12 dark:text-neutral-300 dark:border-white/15'
                  }`}
                >
                  <span>
                    {tx(lang, '눈높이 거리뷰 지원 장소만', 'Eye-Level Street View only')}
                  </span>
                  <span className="opacity-75">
                    {streetViewOnlySearch ? 'ON' : 'OFF'}
                  </span>
                </button>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  {streetViewOnlySearch
                    ? tx(lang, '야외 지상 도로 확인된 곳만 표시', 'Outdoor ground-level verified')
                    : tx(lang, '실내·전체 장소 검색', 'All places')}
                </span>
              </div>

              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="studio-tpo-place-search"
                  type="text"
                  value={placeQuery}
                  onChange={(e) => handlePlaceQueryChange(e.target.value)}
                  placeholder={
                    streetViewOnlySearch
                      ? tx(
                          lang,
                          '예: 성수동 카페거리, 명동, 도쿄 시부야...',
                          'e.g., Seongsu Cafe Street, Myeongdong, Shibuya...'
                        )
                      : tx(
                          lang,
                          '예: 여의도 IFC몰, 성수동 카페, 해운대...',
                          'e.g., IFC Mall Yeouido, Seongsu Cafe...'
                        )
                  }
                  className="w-full min-h-[40px] pl-8 pr-8 rounded-xl border border-black/12 dark:border-white/15 bg-white dark:bg-neutral-900 text-[12px] text-neutral-900 dark:text-white placeholder:text-neutral-400"
                />
                {placeSearching && (
                  <Loader2
                    size={13}
                    className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-neutral-400"
                    aria-hidden="true"
                  />
                )}
              </div>

              {placeSearchError && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">{placeSearchError}</p>
              )}

              {!placeSearching &&
                !placeSearchError &&
                streetViewOnlySearch &&
                placeQuery.trim().length >= 2 &&
                placeSuggestions.length === 0 && (
                  <div className="rounded-xl border border-black/10 dark:border-white/12 bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-neutral-600 dark:text-neutral-300">
                      {placeSearchFilteredOutCount > 0
                        ? tx(
                            lang,
                            `검색된 ${placeSearchFilteredOutCount}곳은 야외 눈높이 거리뷰 미지원 구역입니다.`,
                            `${placeSearchFilteredOutCount} matched spots lack outdoor eye-level Street View.`
                          )
                        : tx(
                            lang,
                            '눈높이 거리뷰 지원 장소를 찾지 못했습니다.',
                            'No eye-level Street View places found.'
                          )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleStreetViewOnlySearch(false)}
                      className="shrink-0 text-[11px] font-semibold text-neutral-900 dark:text-white underline underline-offset-2"
                    >
                      {tx(lang, '전체 보기', 'Show all')}
                    </button>
                  </div>
                )}

              {placeSuggestions.length > 0 && (
                <ul
                  className="rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-neutral-900 divide-y divide-black/6 dark:divide-white/8 overflow-hidden"
                  role="listbox"
                  aria-label={tx(lang, '목적지 검색 결과', 'Destination suggestions')}
                >
                  {placeSuggestions.map((s) => (
                    <li key={s.placeId}>
                      <button
                        type="button"
                        disabled={Boolean(placePickingId)}
                        onClick={() => handlePickDestinationPlace(s)}
                        className="w-full min-h-[42px] px-3 py-2 text-left hover:bg-black/[0.04] dark:hover:bg-white/[0.06] flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="text-[12px] font-medium text-neutral-900 dark:text-white truncate">
                            {s.mainText}
                          </div>
                          {s.secondaryText && (
                            <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                              {s.secondaryText}
                            </div>
                          )}
                        </div>
                        {s.streetViewAvailable && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded border border-black/12 dark:border-white/18 text-[10px] font-semibold text-neutral-800 dark:text-neutral-200">
                            {tx(lang, '눈높이 거리뷰', 'Street View')}
                          </span>
                        )}
                        {placePickingId === s.placeId && (
                          <Loader2 size={13} className="animate-spin text-neutral-400 shrink-0" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* 3) AI 생성 코디 Look 1 · Look 2 설정 */}
          <div className="weather-popup-section">
            <div className="weather-popup-section-head">
              <span className="weather-popup-section-title">
                {tx(lang, 'AI 생성 코디 Look 1 · Look 2 설정', 'AI Look 1 & Look 2 Style Presets')}
              </span>
            </div>

            <div className="weather-popup-looks-stack">
              {[0, 1].map((lookIdx) => {
                const selectedStyleKey =
                  lookIdx === 0 ? lookStyleConfig.look1Style : lookStyleConfig.look2Style;
                const rec = recommendations[lookIdx] || null;
                const isLookActive = Boolean(rec && activeRecId === rec.id);

                return (
                  <div
                    key={`popup-look-card-${lookIdx + 1}`}
                    data-weather-look-card={lookIdx + 1}
                    className={`weather-popup-look-card weather-popup-look-row ${
                      isLookActive ? 'is-active' : ''
                    }`.trim()}
                  >
                    <span className="weather-popup-look-badge tabular-nums">
                      {`Look ${lookIdx + 1}`}
                    </span>

                    <select
                      data-look-style-select={String(lookIdx + 1)}
                      aria-label={`Look ${lookIdx + 1} style preset`}
                      className="weather-popup-look-select"
                      value={selectedStyleKey}
                      onChange={(e) => handleChangeLookStyle(lookIdx, e.target.value)}
                    >
                      {LOOK_STYLE_PRESETS.map((preset) => (
                        <option key={preset.key} value={preset.key}>
                          {lang === 'en' ? preset.en : preset.ko}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      data-popup-apply-look={String(lookIdx)}
                      aria-pressed={isLookActive}
                      disabled={!rec}
                      className={`weather-popup-apply-btn ${isLookActive ? 'is-applied' : ''}`.trim()}
                      onClick={() => {
                        if (rec) {
                          handleApplyRecommendation(rec);
                        }
                      }}
                    >
                      {isLookActive && <Check size={12} strokeWidth={2.6} aria-hidden="true" />}
                      <span>{tx(lang, '적용', 'Apply')}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </ResponsiveSheetModal>

      {/* Mobile Narrow-Viewport (< 600px) Dark Smoked-Glass Wardrobe Sheet */}
      <ResponsiveSheetModal
        id="outfit-mobile-wardrobe-sheet"
        open={mobileSheetOpen}
        onClose={() => setMobileSheetOpen(false)}
        lang={lang}
        title={activeSlotCategoryTitle}
        maxWidth={520}
        expandable={true}
      >
        {renderDrawerHeader(true, mobileSearchInputRef)}
        {renderOccasionTabs()}
        <div className="atelier-filter-strip">
          {(drawerSearchOpen || searchQuery.trim().length > 0) &&
            renderSlotSearchBar(mobileSearchInputRef)}
          {renderSeasonFilterRail()}
          {renderFitToolsMicroBar()}
        </div>
        {renderSubTreePanel()}
        <div className="atelier-drawer-body">
          <OutfitCategorySilhouetteRail
            activeParentTab={activeParentTab}
            equippedCountByParentTab={equippedCountByParentTab}
            lang={lang}
            isDesktopDrawer={false}
            onSelectTab={handleSelectTopFittingTab}
          />
          <div className="atelier-drawer-grid-col">
            {renderPinnedEquippedCard(true)}
            <div className="atelier-drawer-grid-scroll">{renderSlotInventoryGrid()}</div>
          </div>
        </div>
      </ResponsiveSheetModal>

      {/* Non-blocking Street Look Sagging Fit Confirmation Modal */}
      <ResponsiveSheetModal
        id="street-sagging-prompt-modal"
        open={Boolean(streetSaggingPrompt && isBottomSaggingEligible)}
        onClose={() => setStreetSaggingPrompt(false)}
        lang={lang}
        eyebrow={tx(lang, '스트릿 핏 옵션', 'Street Fit Option')}
        title={tx(lang, '새깅 팬츠 핏을 적용할까요?', 'Apply Sagging Pants Fit?')}
        maxWidth={380}
      >
        <div className="atelier-fit-modal-body" data-street-sagging-prompt="true">
          <p className="atelier-fit-modal-desc">
            {tx(
              lang,
              '스트릿 룩에 바지를 로우 드롭으로 내려 입어 언더웨어 밴드가 드러나는 새깅 핏을 연출할 수 있습니다.',
              'Drop the waistband low on the hips to showcase the innerwear waistband for an authentic street sagging silhouette.'
            )}
          </p>
          <div className="atelier-fit-modal-actions">
            <button
              type="button"
              className="atelier-sagging-btn is-primary"
              data-street-sagging-accept="true"
              onClick={() => {
                triggerHaptic('selection');
                setSaggingFit(true);
                setStreetSaggingPrompt(false);
                if (!slots.underwear) {
                  const preferred = findPreferredHipHopUnderwear(garments);
                  if (preferred) {
                    setSlots((prev) => ({ ...prev, underwear: preferred }));
                    setHasExplicitSlotState(true);
                  }
                }
                showToast?.(
                  tx(
                    lang,
                    '새깅 팬츠 핏 적용됨 — AI 피팅 생성 시 로우 드롭이 반영됩니다',
                    'Sagging Fit applied — will render on AI Try-On'
                  )
                );
              }}
            >
              {tx(lang, '새깅 핏 적용', 'Apply Sagging Fit')}
            </button>
            <button
              type="button"
              className="atelier-sagging-btn"
              data-street-sagging-decline="true"
              onClick={() => {
                triggerHaptic('selection');
                setSaggingFit(false);
                setStreetSaggingPrompt(false);
              }}
            >
              {tx(lang, '기본 핏 유지', 'Keep Standard Fit')}
            </button>
          </div>
        </div>
      </ResponsiveSheetModal>

      {/* Non-blocking Underwear Show-Through & VPL Simulation Detail Sheet */}
      <ResponsiveSheetModal
        id="underwear-vpl-sim-modal"
        open={Boolean(underwearSimModalOpen && underwearInteraction)}
        onClose={() => setUnderwearSimModalOpen(false)}
        lang={lang}
        eyebrow={tx(lang, '이너웨어 시뮬레이션', 'Innerwear Simulation')}
        title={tx(lang, '속옷 비침 · 라인(VPL) 분석', 'Show-Through & VPL Analysis')}
        maxWidth={400}
      >
        {underwearInteraction && (
          <div
            className="atelier-fit-modal-body"
            data-underwear-sim-card="true"
            data-underwear-risk={underwearInteraction.riskLevel}
          >
            <div className="atelier-fit-modal-metrics">
              <span>
                {tx(lang, '비침', 'Show-Through')}:{' '}
                <strong>
                  {underwearInteraction.showThroughLevel === 'visible'
                    ? tx(lang, '보임', 'Visible')
                    : underwearInteraction.showThroughLevel === 'subtle'
                      ? tx(lang, '은은함', 'Subtle')
                      : tx(lang, '없음', 'None')}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {tx(lang, '속옷선(VPL)', 'VPL Line')}:{' '}
                <strong>
                  {underwearInteraction.vplLevel === 'visible'
                    ? tx(lang, '도드라짐', 'Visible')
                    : underwearInteraction.vplLevel === 'subtle'
                      ? tx(lang, '미세함', 'Subtle')
                      : tx(lang, '노라인', 'No-Show')}
                </strong>
              </span>
            </div>
            <p className="atelier-fit-modal-desc">
              {lang === 'en' ? underwearInteraction.summaryEn : underwearInteraction.summaryKo}
            </p>
            {(underwearInteraction.tipKo || underwearInteraction.tipEn) && (
              <p className="atelier-fit-modal-tip">
                {lang === 'en' ? underwearInteraction.tipEn : underwearInteraction.tipKo}
              </p>
            )}
            <div className="atelier-fit-modal-actions">
              <button
                type="button"
                className="atelier-sagging-btn is-primary"
                onClick={() => {
                  triggerHaptic('selection');
                  setUnderwearSimModalOpen(false);
                  handleSelectTopFittingTab('underwear');
                }}
              >
                {tx(lang, '언더웨어 변경하기', 'Change Underwear')}
              </button>
              <button
                type="button"
                className="atelier-sagging-btn"
                onClick={() => setUnderwearSimModalOpen(false)}
              >
                {tx(lang, '닫기', 'Close')}
              </button>
            </div>
          </div>
        )}
      </ResponsiveSheetModal>

      {/* After-8-PM Tomorrow Outfit Setup Modal (up to 3 impressions when today's outfit was created) */}
      <ResponsiveSheetModal
        id="tomorrow-outfit-prompt-modal"
        open={showTomorrowPrompt}
        onClose={() => setShowTomorrowPrompt(false)}
        lang={lang}
        eyebrow={tx(lang, '내일 코디 안내', 'Tomorrow Outfit')}
        title={tx(lang, '내일 코디를 설정할까요?', 'Set up tomorrow’s outfit?')}
        maxWidth={400}
      >
        <div className="tomorrow-prompt-modal-body" data-tomorrow-outfit-modal="true">
          <p className="tomorrow-prompt-modal-desc">
            {tx(
              lang,
              '오늘 코디를 생성하셨네요. 내일 날씨 예보에 맞춘 내일 코디로 전환할까요?',
              'Your outfit for today is ready. Switch the weather forecast to plan tomorrow’s look?'
            )}
          </p>
          <div className="tomorrow-prompt-modal-actions">
            <button
              type="button"
              data-tomorrow-prompt-no="true"
              className="tomorrow-prompt-btn is-secondary"
              onClick={() => {
                triggerHaptic('selection');
                setShowTomorrowPrompt(false);
              }}
            >
              {tx(lang, '아니오', 'No, keep today')}
            </button>
            <button
              type="button"
              data-tomorrow-prompt-yes="true"
              className="tomorrow-prompt-btn is-primary"
              onClick={() => {
                triggerHaptic('medium');
                setShowTomorrowPrompt(false);
                handleSelectDayTarget('tomorrow');
              }}
            >
              {tx(lang, '예', 'Yes, switch to tomorrow')}
            </button>
          </div>
        </div>
      </ResponsiveSheetModal>
      {/* Stage Background Selector Modal */}
      <BackgroundPickerModal
        open={bgPickerOpen}
        onClose={() => setBgPickerOpen(false)}
        lang={lang}
        economyState={economyState}
        onSelectBackground={handleSelectStageBackground}
        onUpdateLighting={handleUpdateStageLighting}
        onOpenStore={() => {
          if (!guardUserPermission(user, 'btn:outfits:store')) return;
          setStoreOpen(true);
        }}
        placeBackdropPref={placeBackdropPref}
        placeBackdropData={placeBackdropData}
        selectedPlaceName={backdropTargetQuery}
        gpsCoords={gpsCoords}
        onSelectVerifiedPlace={handleSelectVerifiedStreetViewPlace}
        onUpdatePlaceBackdropPref={handleUpdatePlaceBackdropPref}
        onOpenMapAdjuster={handleOpenMapAdjusterFromPicker}
        onRefreshPlaceBackdrop={() => {
          setLiveSvUnavailableKey('');
          setLiveSvBillingError(false);
          setPlaceBackdropRefreshNonce((n) => n + 1);
        }}
        streetViewUnavailable={isLiveSvUnavailableForTarget}
        streetViewBillingRequired={liveSvBillingError}
        defaultLightingIntensity={
          isDemoShowcaseAccount ? DEMO_CYBERPUNK_LIGHTING_INTENSITY : DEFAULT_LIGHTING_INTENSITY
        }
      />

      {/* In-App Stage Background Store & Tiered Gacha Modal */}
      <StoreModal
        open={storeOpen}
        onClose={() => setStoreOpen(false)}
        lang={lang}
        economyState={economyState}
        onPerformDraw={handlePerformStoreDraw}
        onSelectBackground={handleSelectStageBackground}
        onGoCalendar={() => onNavigateTab?.('calendar')}
      />

      {/* Outfit Saved -> Calendar Navigation Confirmation Modal */}
      <ResponsiveSheetModal
        id="outfit-saved-calendar-modal"
        open={Boolean(calendarSavedModal)}
        onClose={() => setCalendarSavedModal(null)}
        lang={lang}
        eyebrow={tx(lang, '저장 완료', 'Saved to Calendar')}
        title={
          calendarSavedModal
            ? tx(
                lang,
                `${calendarSavedModal.monthNum}월 ${calendarSavedModal.dayNum}일 캘린더에 저장되었습니다`,
                `Saved to Calendar (${calendarSavedModal.monthNum}/${calendarSavedModal.dayNum})`
              )
            : ''
        }
        maxWidth={400}
      >
        <div className="tomorrow-prompt-modal-body" data-outfit-saved-calendar-modal="true">
          <p className="tomorrow-prompt-modal-desc">
            {calendarSavedModal?.title
              ? tx(
                  lang,
                  `‘${calendarSavedModal.title}’ 코디가 옷장 코디북과 ${calendarSavedModal.monthNum}월 ${calendarSavedModal.dayNum}일 캘린더에 함께 기록되었습니다.`,
                  `“${calendarSavedModal.title}” has been saved to your lookbook and logged for ${calendarSavedModal.monthNum}/${calendarSavedModal.dayNum}.`
                )
              : ''}
          </p>
          <div className="tomorrow-prompt-modal-actions">
            <button
              type="button"
              data-saved-calendar-close="true"
              className="tomorrow-prompt-btn is-secondary"
              onClick={() => {
                triggerHaptic('selection');
                setCalendarSavedModal(null);
              }}
            >
              {tx(lang, '닫기', 'Close')}
            </button>
            <button
              type="button"
              data-saved-calendar-go="true"
              className="tomorrow-prompt-btn is-primary"
              onClick={() => {
                triggerHaptic('medium');
                setCalendarSavedModal(null);
                onNavigateTab?.('calendar');
              }}
            >
              <CalendarPlus size={15} />
              <span>{tx(lang, '캘린더 보러가기', 'View Calendar')}</span>
            </button>
          </div>
        </div>
      </ResponsiveSheetModal>
    </section>
  );
}
