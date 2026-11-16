/**
 * Standalone Local Runtime Fallback (Capacitor Native APK / Static Web / Offline Cold-Start)
 * - Activates ONLY when `/api/*` is unreachable or in offline / local stateless compute mode
 * - Preserves genuine HTTP 400/401/403/429 JSON responses when the Express backend IS active
 */

import type { GarmentRecord, UserProfile } from '../contracts/carbonDesignContract.ts';
import { colorSimilarityScore } from '../shared/colorMath.js';
import {
  ACCESSORY_JEWELRY_BY_SUBCATEGORY,
  ACCESSORY_JEWELRY_CATALOG,
  CITY_COORDS,
  getPersonalColorLabels,
  getStudioSeedImageForGarment,
  resolveManifestSlotAndGlb,
} from '../shared/garmentTaxonomy.js';
import { SEASONAL_120_CATALOG } from '../shared/seasonal120Catalog.js';
import { readCachedResponse } from './offlineSync.ts';

const LOCAL_USERS_KEY = 'ainventory_standalone_users_v2';
const LOCAL_OTP_KEY = 'ainventory_standalone_otp_v1';
const LOCAL_SESSION_KEY = 'ainventory_standalone_session_v1';
const LOCAL_CUSTOM_GARMENTS_KEY = 'ainventory_standalone_custom_garments_v1';

interface StoredStandaloneUser extends UserProfile {
  passwordHash?: string;
}

export interface SampleCatalogGarment extends GarmentRecord {
  key: string;
  name_en?: string;
  material_key?: string | null;
  primary_season?: string;
  sleeveLength?: string;
  hemLength?: string;
  shoeExposure?: string;
  layerOrder?: number;
}

async function sha256Hex(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Deterministic FNV-1a 256-bit fallback when SubtleCrypto is unavailable on non-HTTPS WebView
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`.repeat(4);
}

async function hashStandalonePassword(password: string, salt?: string): Promise<string> {
  const resolvedSalt =
    salt ||
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 14));
  const digest = await sha256Hex(`ainventory-standalone:${resolvedSalt}:${password}`);
  return `sha256$${resolvedSalt}$${digest}`;
}

async function verifyStandalonePassword(
  password: string,
  user: StoredStandaloneUser & { demoId?: string }
): Promise<boolean> {
  if (user.passwordHash && user.passwordHash.startsWith('sha256$')) {
    const parts = user.passwordHash.split('$');
    if (parts.length === 3) {
      const candidate = await hashStandalonePassword(password, parts[1]);
      return candidate === user.passwordHash;
    }
  }
  // Built-in demo credentials parity with server/db.js (never persisted in plaintext)
  if (user.username === 'admin') {
    return password === 'admin' || password === 'admin1234';
  }
  if (user.username === 'husband') {
    return password === 'husband1234';
  }
  if (user.username === 'wife') {
    return password === 'wife1234';
  }
  return false;
}

const DEFAULT_STANDALONE_USERS: StoredStandaloneUser[] = [
  {
    id: 1,
    username: 'husband',
    email: 'husband@ainventory.kr',
    displayName: '남편 (준호)',
    role: 'member',
    defaultCloset: 'husband',
    closetName: '남편의 사이버 아틀리에',
    profileCompleted: true,
    emailVerified: true,
    personalColor: 'autumn_warm',
    personalColorLabelKo: '가을 웜톤',
    personalColorLabelEn: 'Autumn Warm',
    gender: 'male',
    heightCm: 178,
    weightKg: 73,
    bodyShape: 'upper_developed',
  },
  {
    id: 2,
    username: 'wife',
    email: 'wife@ainventory.kr',
    displayName: '와이프 (서연)',
    role: 'member',
    defaultCloset: 'wife',
    closetName: '와이프의 시그니처 옷장',
    profileCompleted: true,
    emailVerified: true,
    personalColor: 'spring_warm',
    personalColorLabelKo: '봄 웜톤',
    personalColorLabelEn: 'Spring Warm',
    gender: 'female',
    heightCm: 165,
    weightKg: 53,
    bodyShape: 'standard_balanced',
  },
  {
    id: 3,
    username: 'admin',
    email: 'admin@ainventory.kr',
    displayName: '어드민 (남편)',
    role: 'admin',
    defaultCloset: 'husband',
    closetName: '남편의 사이버 아틀리에',
    profileCompleted: true,
    emailVerified: true,
    personalColor: 'autumn_warm',
    personalColorLabelKo: '가을 웜톤',
    personalColorLabelEn: 'Autumn Warm',
    gender: 'male',
    heightCm: 178,
    weightKg: 73,
    bodyShape: 'upper_developed',
  },
];

export const STANDALONE_SAMPLE_GARMENTS: SampleCatalogGarment[] = [
  ...SEASONAL_120_CATALOG,
  ...ACCESSORY_JEWELRY_CATALOG,
].map((item) => {
  const spec = resolveManifestSlotAndGlb(item.category, item.subcategory);
  const wearCount = ((item.idOffset * 3) % 24) + 2;
  const cpw = wearCount > 0 ? Math.round(item.price / wearCount) : item.price;
  const materialKey = 'material_key' in item ? (item.material_key ?? null) : null;
  return {
    key: item.key,
    id: 9000 + item.idOffset,
    closet_owner: 'sample',
    name: item.name,
    name_en: item.name_en,
    category: item.category,
    subcategory: item.subcategory,
    fabric: item.fabric,
    material_key: materialKey,
    color_name: item.color_name,
    color_hex: item.color_hex,
    primary_season: item.primary_season,
    seasons: [...item.seasons],
    min_temp: item.min_temp,
    max_temp: item.max_temp,
    water_resistant: item.water_resistant,
    formality: item.formality,
    brand: item.brand,
    size: 'M',
    memo: '샘플 체험용 캡슐 아틀리에 아이템',
    notes: '샘플 체험용 캡슐 아틀리에 아이템',
    price: item.price,
    wear_count: wearCount,
    cpw,
    is_favorite: item.idOffset % 4 === 1,
    status: 'active',
    image_url:
      item.image_url || getStudioSeedImageForGarment(item.category, item.subcategory),
    slot_key: spec.slotKey,
    base_glb: spec.baseGlb,
    physics_preset: spec.physicsPreset,
    custom_texture: false,
    sleeveLength: item.sleeveLength,
    hemLength: item.hemLength,
    shoeExposure: item.shoeExposure,
    layerOrder: item.layerOrder,
  };
});

function loadCustomStandaloneGarments(): GarmentRecord[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_CUSTOM_GARMENTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as GarmentRecord[];
      }
    }
  } catch {
    // ignore
  }
  return [];
}

function saveCustomStandaloneGarments(list: GarmentRecord[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_CUSTOM_GARMENTS_KEY, JSON.stringify(list));
    }
  } catch {
    // ignore
  }
}

const STANDALONE_SUB_ALIASES: Readonly<Record<string, readonly string[]>> = {
  umbrella: ['umbrella'],
  watch: ['watch'],
  gloves: ['gloves', 'leather_gloves', 'mittens'],
  eyewear: ['eyewear', 'sunglasses', 'glasses'],
  headwear: ['headwear', 'cap', 'hat', 'beanie', 'beret', 'bucket_hat'],
  neckwear: ['neckwear', 'scarf', 'muffler', 'tie', 'necktie'],
  belt: ['belt'],
  bag: ['bag', 'tote', 'crossbody', 'briefcase', 'backpack'],
  earring: ['earring'],
  necklace: ['necklace'],
  bracelet: ['bracelet'],
  ring: ['ring'],
  brooch: ['brooch'],
};

function ensureStandaloneMaterialSeedsForCloset(closetOwner: string): GarmentRecord[] {
  const custom = loadCustomStandaloneGarments();
  const forCloset = custom.filter((g) => g.closet_owner === closetOwner);
  let mutated = false;
  for (const [subKey, items] of Object.entries(ACCESSORY_JEWELRY_BY_SUBCATEGORY)) {
    if (!Array.isArray(items) || items.length === 0) continue;
    const targetCategory = items[0].category;
    const aliases = STANDALONE_SUB_ALIASES[subKey] || [subKey];
    const existing = forCloset.filter(
      (g) => g.category === targetCategory && aliases.includes(String(g.subcategory || ''))
    );
    if (existing.length > 0) continue;
    for (const item of items) {
      const spec = resolveManifestSlotAndGlb(item.category, item.subcategory);
      const created: GarmentRecord = {
        id: 19000 + item.idOffset + Math.floor(Math.random() * 900),
        closet_owner: closetOwner,
        name: item.name,
        name_en: item.name_en,
        category: item.category,
        subcategory: item.subcategory,
        fabric: item.fabric,
        color_name: item.color_name,
        color_hex: item.color_hex,
        seasons: [...item.seasons],
        min_temp: item.min_temp,
        max_temp: item.max_temp,
        water_resistant: item.water_resistant,
        formality: item.formality,
        brand: item.brand,
        size: 'FREE',
        memo: '샘플 체험용 캡슐 아틀리에 아이템',
        notes: '샘플 체험용 캡슐 아틀리에 아이템',
        price: item.price,
        wear_count: 2,
        cpw: Math.round(item.price / 2),
        is_favorite: item.idOffset % 5 === 1,
        status: 'active',
        image_url: item.image_url,
        slot_key: spec.slotKey,
        base_glb: spec.baseGlb,
        physics_preset: spec.physicsPreset,
        custom_texture: false,
      };
      custom.push(created);
      forCloset.push(created);
      mutated = true;
    }
  }
  if (mutated) {
    saveCustomStandaloneGarments(custom);
  }
  return custom.filter((g) => g.closet_owner === closetOwner);
}

function loadUsers(): StoredStandaloneUser[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_USERS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as StoredStandaloneUser[];
        }
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_STANDALONE_USERS.map((u) => ({ ...u }));
}

function saveUsers(users: StoredStandaloneUser[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const sanitizedForDisk = users.map((u) => {
        const copy = { ...u } as StoredStandaloneUser & { password?: string };
        delete copy.password;
        return copy;
      });
      localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(sanitizedForDisk));
    }
  } catch {
    // ignore
  }
}

function sanitizeUser(u: StoredStandaloneUser | null | undefined): UserProfile | null {
  if (!u) return null;
  const copy = { ...u } as StoredStandaloneUser & { password?: string };
  delete copy.password;
  delete copy.passwordHash;
  return copy;
}

function getActiveSessionUser(): UserProfile | null {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LOCAL_SESSION_KEY);
      return raw ? (JSON.parse(raw) as UserProfile) : null;
    }
  } catch {
    // ignore
  }
  return null;
}

function setActiveSessionUser(user: StoredStandaloneUser | UserProfile | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (user) {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(sanitizeUser(user as StoredStandaloneUser)));
    } else {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    }
  } catch {
    // ignore
  }
}

function parseBody(rawBody: unknown): Record<string, unknown> {
  if (!rawBody) return {};
  if (typeof rawBody === 'string') {
    try {
      const parsed = JSON.parse(rawBody);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof rawBody === 'object') return rawBody as Record<string, unknown>;
  return {};
}

function createHttpError(message: string, status: number): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

interface StandaloneScenarioSpec {
  key: string;
  label: string;
  cityName: string;
  condition: string;
  weatherCode: number;
  tempMin: number;
  tempMax: number;
  windSpeed: number;
  precipProb: number;
  humidity: number;
  recommendedMotion: string;
  weatherTip: string;
  isSnowy?: boolean;
}

const LIVE_WEATHER_SCENARIO: StandaloneScenarioSpec = {
  key: 'live',
  label: '실시간 내일 예보',
  cityName: '서울',
  condition: '내일 예보 · 구름 조금',
  weatherCode: 2,
  tempMin: 9,
  tempMax: 18,
  windSpeed: 12,
  precipProb: 15,
  humidity: 50,
  recommendedMotion: 'idle',
  weatherTip:
    '내일 아침 9°C · 낮 18°C로 활동하기 쾌적한 구름 조금 예보입니다. 탈착하기 좋은 가벼운 아우터 레이어드를 추천합니다.',
};

type LookStylePresetKey =
  | 'business_casual'
  | 'comfortable_casual'
  | 'formal_office'
  | 'minimal_daily';

interface LookStylePresetSpec {
  key: LookStylePresetKey;
  badge: string;
  badgeEn: string;
  title: string;
  titleEn: string;
  preferredFormality: 'formal' | 'smart' | 'casual';
}

const LOOK_STYLE_PRESETS: Readonly<Record<LookStylePresetKey, LookStylePresetSpec>> = {
  business_casual: {
    key: 'business_casual',
    badge: '직장생활 · 비즈니스 캐주얼',
    badgeEn: 'Office · Business Casual',
    title: '직장생활을 위한 비즈니스 캐주얼 코디',
    titleEn: 'Business Casual Look for Work',
    preferredFormality: 'smart',
  },
  comfortable_casual: {
    key: 'comfortable_casual',
    badge: '일상 · 편한 캐주얼',
    badgeEn: 'Daily · Comfortable Casual',
    title: '하루 종일 편안한 데일리 캐주얼 코디',
    titleEn: 'All-Day Comfortable Daily Casual Look',
    preferredFormality: 'casual',
  },
  formal_office: {
    key: 'formal_office',
    badge: '포멀 · 오피스 정장',
    badgeEn: 'Formal · Office Tailoring',
    title: '격식 있는 포멀 오피스 코디',
    titleEn: 'Tailored Formal Office Look',
    preferredFormality: 'formal',
  },
  minimal_daily: {
    key: 'minimal_daily',
    badge: '미니멀 · 클린 데일리',
    badgeEn: 'Minimal · Clean Daily',
    title: '단정한 미니멀 데일리 코디',
    titleEn: 'Clean Monochrome Minimal Daily Look',
    preferredFormality: 'smart',
  },
};

function resolveLookStylePresetKey(
  raw: string | null | undefined,
  fallback: LookStylePresetKey
): LookStylePresetKey {
  const key = String(raw || '').trim() as LookStylePresetKey;
  return Object.hasOwn(LOOK_STYLE_PRESETS, key) ? key : fallback;
}

function computeStandaloneStylePresetBonus(
  item: GarmentRecord,
  presetKey: LookStylePresetKey
): number {
  const sub = String(item.subcategory || '').toLowerCase();
  const formality = String(item.formality || '').toLowerCase();
  const colorName = String(item.color_name || '');
  const text = `${sub} ${item.fabric || ''} ${item.name || ''} ${item.name_en || ''}`.toLowerCase();

  let bonus = 0;
  if (presetKey === 'business_casual') {
    if (formality === 'smart') bonus += 18;
    else if (formality === 'formal') bonus += 12;
    else if (formality === 'casual') bonus -= 8;

    if (
      /blazer|trench|coat|shirt|oxford|blouse|merino|knit|turtleneck|slacks|trousers|chino|loafer|derby|chelsea|briefcase|블레이저|트렌치|코트|셔츠|블라우스|메리노|니트|슬랙스|로퍼|더비|서류가방/.test(
        text
      )
    ) {
      bonus += 18;
    }
    if (/hoodie|sweatshirt|jogger|windbreaker|backpack|후드|맨투맨|스웨트|윈드브레이커|백팩/.test(text)) {
      bonus -= 18;
    }
  } else if (presetKey === 'comfortable_casual') {
    if (formality === 'casual') bonus += 20;
    else if (formality === 'smart') bonus += 4;
    else if (formality === 'formal') bonus -= 16;

    if (
      /cardigan|windbreaker|denim|trucker|quilted|puffer|padding|fleece|jacket|sweatshirt|hoodie|tee|t-shirt|tshirt|sweater|jeans|cotton|cargo|sneaker|court|runner|crossbody|tote|backpack|가디건|카디건|윈드브레이커|데님|퀼팅|패딩|자켓|스웨트|후드|티셔츠|청바지|스니커즈|크로스|토트|백팩/.test(
        text
      )
    ) {
      bonus += 20;
    }
    if (/briefcase|suit|oxford_shoes|derby|tie|서류가방|정장|더비|타이/.test(text)) {
      bonus -= 20;
    }
  } else if (presetKey === 'formal_office') {
    if (formality === 'formal') bonus += 24;
    else if (formality === 'smart') bonus += 10;
    else if (formality === 'casual') bonus -= 18;

    if (
      /suit|blazer|coat|trench|oxford|silk|shirt|blouse|slacks|trousers|loafer|derby|briefcase|tie|정장|블레이저|코트|옥스포드|실크|셔츠|슬랙스|로퍼|더비|서류가방|타이/.test(
        text
      )
    ) {
      bonus += 20;
    }
    if (/denim|jeans|hoodie|sweatshirt|sneaker|windbreaker|backpack|데님|후드|스니커즈|윈드브레이커|백팩/.test(text)) {
      bonus -= 22;
    }
  } else if (presetKey === 'minimal_daily') {
    if (formality === 'smart') bonus += 16;
    else if (formality === 'casual') bonus += 10;

    if (/블랙|화이트|아이보리|크림|오트밀|그레이|차콜|베이지|토프|네이비/.test(colorName)) {
      bonus += 14;
    }
    if (
      /coat|trench|blazer|cardigan|knit|turtleneck|shirt|tee|slacks|denim|sneaker|loafer|chelsea|tote|crossbody|코트|트렌치|가디건|니트|터틀넥|셔츠|슬랙스|스니커즈|로퍼|토트|크로스/.test(
        text
      )
    ) {
      bonus += 12;
    }
  }

  return bonus;
}

const WEATHER_SCENARIOS: Record<string, StandaloneScenarioSpec> = {
  crisp_autumn: {
    key: 'crisp_autumn',
    label: '선선한 가을 맑음',
    cityName: '서울',
    condition: '맑음',
    weatherCode: 1,
    tempMin: 7,
    tempMax: 16,
    windSpeed: 11,
    precipProb: 10,
    humidity: 48,
    recommendedMotion: 'idle',
    weatherTip: '일교차가 있는 선선한 날씨입니다. 니트 위에 가벼운 코트 레이어드를 추천합니다.',
  },
  cloudy_overcast: {
    key: 'cloudy_overcast',
    label: '구름 낀 흐린 날',
    cityName: '서울',
    condition: '흐림',
    weatherCode: 3,
    tempMin: 10,
    tempMax: 16,
    windSpeed: 10,
    precipProb: 25,
    humidity: 66,
    recommendedMotion: 'idle',
    weatherTip: '부드러운 흐림 날씨입니다. 차분한 뉴트럴 니트와 트렌치 레이어드가 잘 어울립니다.',
  },
  rainy_cool: {
    key: 'rainy_cool',
    label: '비 오는 쌀쌀한 날',
    cityName: '서울',
    condition: '비 예보',
    weatherCode: 61,
    tempMin: 9,
    tempMax: 13,
    windSpeed: 19,
    precipProb: 80,
    humidity: 84,
    recommendedMotion: 'umbrella',
    weatherTip: '비와 바람이 동반됩니다. 발수 아우터와 어두운 톤 하의·우산 매치를 추천합니다.',
  },
  snowy_winter: {
    key: 'snowy_winter',
    label: '함박눈 내리는 겨울날',
    cityName: '서울',
    condition: '눈 예보',
    weatherCode: 73,
    tempMin: -4,
    tempMax: 1,
    windSpeed: 12,
    precipProb: 85,
    humidity: 76,
    isSnowy: true,
    recommendedMotion: 'umbrella',
    weatherTip: '함박눈이 예보된 겨울 날씨입니다. 울 코트·패딩과 방한 비니 레이어드를 추천합니다.',
  },
  windy_gale: {
    key: 'windy_gale',
    label: '강풍 부는 날',
    cityName: '서울',
    condition: '강풍 주의보',
    weatherCode: 2,
    tempMin: 8,
    tempMax: 15,
    windSpeed: 32,
    precipProb: 15,
    humidity: 44,
    recommendedMotion: 'wind',
    weatherTip: '강한 바람(풍속 32km/h)이 예보되어 있습니다. 트렌치·오버코트와 캐시미어 머플러를 매치하세요.',
  },
  warm_spring: {
    key: 'warm_spring',
    label: '포근한 봄 · 초여름',
    cityName: '서울',
    condition: '구름 조금',
    weatherCode: 2,
    tempMin: 14,
    tempMax: 24,
    windSpeed: 9,
    precipProb: 15,
    humidity: 52,
    recommendedMotion: 'idle',
    weatherTip: '가볍게 걷기 좋은 산뜻한 기온입니다. 단품 니트나 셔츠와 크로스백 조합이 잘 어울립니다.',
  },
  summer_heatwave: {
    key: 'summer_heatwave',
    label: '한여름 폭염 주의보',
    cityName: '서울',
    condition: '폭염 주의보',
    weatherCode: 0,
    tempMin: 26,
    tempMax: 34,
    windSpeed: 8,
    precipProb: 10,
    humidity: 68,
    recommendedMotion: 'idle',
    weatherTip: '33°C 이상의 무더운 폭염 날씨입니다. 통기성 좋은 리넨·코튼 상의와 선글라스를 매치하세요.',
  },
  winter_cold: {
    key: 'winter_cold',
    label: '영하권 겨울 한파',
    cityName: '서울',
    condition: '한파 주의보',
    weatherCode: 0,
    tempMin: -10,
    tempMax: -4,
    windSpeed: 28,
    precipProb: 10,
    humidity: 34,
    recommendedMotion: 'wind',
    weatherTip: '영하 10도 안팎의 매서운 한파 날씨입니다. 헤비 울·패딩 아우터와 방한 비니·머플러가 필수입니다.',
  },
};

function computeStandaloneShoppingAnalysis(
  body: Record<string, unknown>,
  closetItems: GarmentRecord[]
) {
  const candidateName = String(body.candidate_name || '매장 촬영 새 옷');
  const category = String(body.category || 'top');
  const subcategory = String(body.subcategory || 'knit');
  const colorName = String(body.color_name || '네이비');
  const colorHex = String(body.color_hex || '#1E273B');
  const price = Math.max(0, Number(body.price) || 0);
  const imageUrl = String(
    body.image_data || body.image_url || '/seed/store-navy-sweater.jpg'
  );

  const sameCat = closetItems.filter((g) => g.category === category);
  const scored = sameCat
    .map((item) => {
      const subScore = item.subcategory === subcategory ? 45 : 22;
      const cRatio = colorSimilarityScore(colorHex, item.color_hex) / 100;
      const similarity = Math.min(98, subScore + Math.round(cRatio * 53));
      const cpw =
        item.wear_count > 0 ? Math.round(item.price / item.wear_count) : item.price;
      return { ...item, similarity, cpw };
    })
    .sort((a, b) => b.similarity - a.similarity);

  const similarItems = scored.filter((i) => i.similarity >= 68);
  const maxSimilarity = scored[0]?.similarity ?? 0;

  let verdict: 'buy' | 'consider' | 'skip' = 'buy';
  let confidenceLabel = '옷장 빈틈 채우기 · 구매 적극 지지';
  let headline = '내 옷장에 비슷한 옷이 없습니다. 사셔도 좋습니다!';
  let summary = `현재 옷장에 ${colorName} 톤의 동일 카테고리 중복 아이템이 없습니다. 옷장 활용도를 높여줄 선택입니다.`;

  if (similarItems.length >= 2 || maxSimilarity >= 86) {
    verdict = 'skip';
    confidenceLabel = '중복 구매 주의 · 보유 아이템 활용 권장';
    headline = `내 옷장에 비슷한 옷이 ${similarItems.length}벌 있습니다 (최대 유사도 ${maxSimilarity}%)`;
    summary = `'${similarItems[0]?.name || '보유 의류'}'와 색감·실루엣이 크게 겹칩니다. 기존 옷을 먼저 활용하시는 것을 권장합니다.`;
  } else if (similarItems.length === 1) {
    verdict = 'consider';
    confidenceLabel = '비슷한 무드 1벌 보유 · 디테일 비교 권장';
    headline = `비슷한 계열의 옷이 1벌 있습니다 (유사도 ${maxSimilarity}%)`;
    summary = `보유 중인 '${similarItems[0]?.name || '보유 의류'}'과 같은 계열이지만 소재나 두께감이 다르다면 교차 착용용으로 고려해볼 만합니다.`;
  }

  const pairingPool = closetItems.filter((g) => g.category !== category).slice(0, 3);
  const pairingOutfits =
    pairingPool.length >= 2
      ? [
          {
            key: pairingPool.map((x) => x.id).join('-'),
            label: '즉시 활용 데일리 조합',
            existingItems: pairingPool,
          },
        ]
      : [];

  return {
    checkId: null,
    isSampleDemo: true,
    candidate: {
      closet_owner: String(body.closet_owner || 'sample'),
      candidate_name: candidateName,
      category,
      subcategory,
      color_name: colorName,
      color_hex: colorHex,
      price,
      image_url: imageUrl,
    },
    analysis: {
      verdict,
      confidenceLabel,
      headline,
      summary,
      similarCount: similarItems.length,
      maxSimilarity,
      similarItems: similarItems.slice(0, 4),
      closestOtherItems: similarItems.length === 0 ? scored.slice(0, 2) : [],
      compatibleCount: closetItems.filter((g) => g.category !== category).length,
      pairingOutfits,
      partnerInsight: null,
      estimatedCpw10Wears: price > 0 ? Math.round(price / 10) : null,
    },
  };
}

export async function handleStandaloneApiFallback(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<Record<string, unknown>> {
  const method = String(options.method || 'GET').toUpperCase();
  const body = parseBody(options.body);
  const [pathname, queryStr = ''] = path.split('?');
  const params = new URLSearchParams(queryStr);

  // ---------------- AUTH ENDPOINTS ----------------
  if (pathname === '/auth/login' && method === 'POST') {
    const uname = String(body.username || '').trim().toLowerCase();
    const pw = String(body.password || '');
    const users = loadUsers();
    const found = users.find(
      (u) =>
        String(u.username).toLowerCase() === uname ||
        (u.email && String(u.email).toLowerCase() === uname)
    );
    if (!found || !(await verifyStandalonePassword(pw, found))) {
      throw createHttpError('아이디(이메일) 또는 비밀번호가 올바르지 않습니다.', 401);
    }
    const clean = sanitizeUser(found)!;
    setActiveSessionUser(clean);
    return { token: `standalone_tok_${found.id}_${Date.now()}`, user: clean };
  }

  if (pathname === '/auth/apple' && method === 'POST') {
    const sub = String(body.appleSub || body.apple_sub || 'apple_hig_member_01').trim();
    const subSuffix = (await sha256Hex(sub)).slice(0, 8);
    const appleUsername = `apple_${subSuffix}`;
    const appleUser: UserProfile = {
      id: 77,
      username: appleUsername,
      email: String(body.email || `${appleUsername}@privaterelay.appleid.com`),
      displayName: String(body.fullName || body.full_name || 'Apple 사용자'),
      role: 'member',
      defaultCloset: `closet_${appleUsername}`,
      closetName: '내 옷장',
      profileCompleted: true,
      emailVerified: true,
      personalColor: 'summer_cool',
      personalColorLabelKo: '여름 쿨톤',
      personalColorLabelEn: 'Summer Cool',
      gender: 'unspecified',
      heightCm: 168,
      weightKg: 58,
      bodyShape: 'standard_balanced',
    };
    setActiveSessionUser(appleUser);
    return { ok: true, token: `standalone_apple_${Date.now()}`, user: appleUser };
  }

  if (pathname === '/auth/send-verification' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw createHttpError('유효한 이메일 주소를 입력해주세요.', 400);
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          LOCAL_OTP_KEY,
          JSON.stringify({ email, code, expiresAt: Date.now() + 10 * 60 * 1000, verified: false })
        );
      }
    } catch {
      // ignore
    }
    return { ok: true, resendCooldownSec: 60, cooldownSec: 60, devPreviewCode: code };
  }

  if (pathname === '/auth/verify-email-code' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    let stored: { email?: string; code?: string; expiresAt?: number; verified?: boolean } | null =
      null;
    try {
      if (typeof localStorage !== 'undefined') {
        stored = JSON.parse(localStorage.getItem(LOCAL_OTP_KEY) || 'null');
      }
    } catch {
      stored = null;
    }
    if (
      !stored ||
      stored.email !== email ||
      stored.code !== code ||
      (stored.expiresAt && Date.now() > stored.expiresAt)
    ) {
      throw createHttpError('인증코드 6자리가 일치하지 않거나 만료되었습니다.', 400);
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LOCAL_OTP_KEY, JSON.stringify({ ...stored, verified: true }));
      }
    } catch {
      // ignore
    }
    return { ok: true, verified: true };
  }

  if ((pathname === '/auth/register-email' || pathname === '/auth/register') && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const rawPw = String(body.password || '');
    if (rawPw.length < 6) {
      throw createHttpError('비밀번호는 6자 이상 입력해주세요.', 400);
    }
    const users = loadUsers();
    const newId = Date.now();
    const baseUser = String(body.username || email.split('@')[0] || `member_${newId}`)
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, '');
    const displayName = String(body.displayName || body.display_name || baseUser || '신규회원');
    const passwordHash = await hashStandalonePassword(rawPw);

    const newUser: StoredStandaloneUser = {
      id: newId,
      username: baseUser,
      email,
      passwordHash,
      displayName,
      role: 'member',
      defaultCloset: `closet_${baseUser}`,
      closetName: String(body.closetName || body.closet_name || `${displayName}의 옷장`),
      profileCompleted: false,
      emailVerified: true,
      personalColor: 'autumn_warm',
      personalColorLabelKo: '가을 웜톤',
      personalColorLabelEn: 'Autumn Warm',
      gender: String(body.gender || 'unspecified'),
      heightCm: body.gender === 'female' ? 164 : 175,
      weightKg: body.gender === 'female' ? 53 : 70,
      bodyShape: 'standard_balanced',
    };
    users.push(newUser);
    saveUsers(users);
    const clean = sanitizeUser(newUser)!;
    setActiveSessionUser(clean);
    return { ok: true, token: `standalone_reg_${newId}`, user: clean };
  }

  if (pathname === '/auth/me' && method === 'GET') {
    const u = getActiveSessionUser();
    if (!u) {
      throw createHttpError('로그인이 필요합니다.', 401);
    }
    return { user: u };
  }

  if (pathname === '/auth/logout' && method === 'POST') {
    setActiveSessionUser(null);
    return { ok: true };
  }

  if (pathname === '/auth/closet-setup' && method === 'POST') {
    const u = getActiveSessionUser() || sanitizeUser(DEFAULT_STANDALONE_USERS[0])!;
    const updated: UserProfile = {
      ...u,
      closetName: String(body.closet_name || body.closetName || '내 옷장'),
    };
    setActiveSessionUser(updated);
    return { ok: true, user: updated };
  }

  if (
    (pathname === '/auth/profile-setup' || pathname === '/auth/profile') &&
    (method === 'POST' || method === 'PATCH')
  ) {
    const u = getActiveSessionUser() || sanitizeUser(DEFAULT_STANDALONE_USERS[0])!;
    const pcKey = String(body.personal_color || body.personalColor || u.personalColor || 'autumn_warm');
    const pcLabels = getPersonalColorLabels(pcKey);
    const updated: UserProfile = {
      ...u,
      ageGroup: String(body.age_group || body.ageGroup || u.ageGroup || '30s'),
      age: body.age !== undefined && body.age !== null ? Number(body.age) : u.age ?? null,
      heightCm:
        body.height_cm !== undefined || body.heightCm !== undefined
          ? Number(body.height_cm ?? body.heightCm)
          : u.heightCm ?? null,
      weightKg:
        body.weight_kg !== undefined || body.weightKg !== undefined
          ? Number(body.weight_kg ?? body.weightKg)
          : u.weightKg ?? null,
      gender: String(body.gender || u.gender || 'unspecified'),
      personalColor: pcKey,
      personalColorLabelKo: pcLabels.ko,
      personalColorLabelEn: pcLabels.en,
      skinToneHex: String(body.skin_tone_hex || body.skinToneHex || u.skinToneHex || '#E2C6AE'),
      bodyShape: String(body.body_shape || body.bodyShape || u.bodyShape || 'standard_balanced'),
      profileCompleted: true,
    };
    setActiveSessionUser(updated);
    return { ok: true, user: updated, generatedWardrobe: null };
  }

  if (pathname === '/auth/account' && method === 'DELETE') {
    const u = getActiveSessionUser();
    if (u) {
      const next = loadUsers().filter((item) => item.username !== u.username);
      saveUsers(next);
    }
    setActiveSessionUser(null);
    return { ok: true, purged: true, deletedImmediately: true };
  }

  // ---------------- STATELESS / SAMPLE CATALOG ENDPOINTS ----------------
  if ((pathname === '/sample-catalog' || pathname === '/garments/samples') && method === 'GET') {
    return { samples: STANDALONE_SAMPLE_GARMENTS };
  }

  if (pathname === '/garments/analyze' && method === 'POST') {
    const category = String(body.category || 'top');
    const subcategory = String(body.subcategory || 'knit');
    const spec = resolveManifestSlotAndGlb(category, subcategory);
    return {
      ok: true,
      category,
      subcategory,
      color_name: String(body.color_name || '블랙'),
      color_hex: String(body.color_hex || '#1D1D1F'),
      fabric: String(body.fabric || 'cotton'),
      slot_key: spec.slotKey,
      base_glb: spec.baseGlb,
      physics_preset: spec.physicsPreset,
    };
  }

  // ---------------- DATA ENDPOINTS ----------------
  const activeUser = getActiveSessionUser();
  const closet = String(
    params.get('closet') || body.closet_owner || activeUser?.defaultCloset || 'sample'
  );
  const isSeededCloset = closet === 'sample' || closet === 'husband' || closet === 'wife';
  const rawCustomForCloset = loadCustomStandaloneGarments().filter((g) => g.closet_owner === closet);
  const customForCloset =
    !isSeededCloset && rawCustomForCloset.length > 0
      ? ensureStandaloneMaterialSeedsForCloset(closet)
      : rawCustomForCloset;
  const seededGarments: GarmentRecord[] = isSeededCloset
    ? [
        ...customForCloset,
        ...STANDALONE_SAMPLE_GARMENTS.map((g) => ({ ...g, closet_owner: closet })),
      ]
    : customForCloset;

  if (pathname === '/garments' && method === 'GET') {
    const reqCat = params.get('category') || 'all';
    const reqQuery = (params.get('q') || '').trim().toLowerCase();
    let filtered = seededGarments;
    if (reqCat && reqCat !== 'all') {
      filtered = filtered.filter((g) => g.category === reqCat);
    }
    if (reqQuery) {
      filtered = filtered.filter((g) =>
        `${g.name || ''} ${g.name_en || ''} ${g.brand || ''} ${g.color_name || ''}`
          .toLowerCase()
          .includes(reqQuery)
      );
    }
    return { garments: filtered, isSampleDemo: closet === 'sample' };
  }

  if (pathname === '/garments/ensure-material-seeds' && method === 'POST') {
    const targetCloset = String(body.closet_owner || activeUser?.defaultCloset || closet);
    const beforeLen = loadCustomStandaloneGarments().filter(
      (g) => g.closet_owner === targetCloset
    ).length;
    const updatedForCloset =
      targetCloset === 'sample' || targetCloset === 'husband' || targetCloset === 'wife'
        ? STANDALONE_SAMPLE_GARMENTS.map((g) => ({ ...g, closet_owner: targetCloset }))
        : ensureStandaloneMaterialSeedsForCloset(targetCloset);
    const inserted =
      targetCloset === 'sample' || targetCloset === 'husband' || targetCloset === 'wife'
        ? 0
        : Math.max(0, updatedForCloset.length - beforeLen);
    return { ok: true, inserted, insertedCount: inserted, garments: updatedForCloset };
  }

  if (pathname === '/garments' && method === 'POST') {
    const targetCloset = String(body.closet_owner || activeUser?.defaultCloset || closet);
    const category = String(body.category || 'top');
    const subcategory = String(body.subcategory || category);
    const spec = resolveManifestSlotAndGlb(category, subcategory);
    const price = Math.max(0, Number(body.price) || 0);
    const created: GarmentRecord = {
      id: Date.now(),
      closet_owner: targetCloset,
      name: String(body.name || '새 아이템').trim(),
      category,
      subcategory,
      fabric: String(body.fabric || 'cotton'),
      color_name: String(body.color_name || '블랙'),
      color_hex: String(body.color_hex || '#1D1D1F'),
      seasons: Array.isArray(body.seasons) ? body.seasons.map(String) : ['봄', '가을'],
      min_temp: Number(body.min_temp ?? 8),
      max_temp: Number(body.max_temp ?? 22),
      water_resistant: Boolean(body.water_resistant),
      formality: String(body.formality || 'smart'),
      brand: String(body.brand || ''),
      size: String(body.size || ''),
      memo: String(body.notes || body.memo || ''),
      notes: String(body.notes || body.memo || ''),
      price,
      wear_count: Math.max(0, Number(body.wear_count) || 0),
      cpw: price,
      is_favorite: false,
      status: 'active',
      image_url: String(
        body.image_data || body.image_url || getStudioSeedImageForGarment(category, subcategory)
      ),
      slot_key: String(body.slot_key || spec.slotKey),
      base_glb: String(body.base_glb || spec.baseGlb),
      physics_preset: String(body.physics_preset || spec.physicsPreset),
      custom_texture: Boolean(body.image_data),
    };
    const allCustom = loadCustomStandaloneGarments();
    allCustom.unshift(created);
    saveCustomStandaloneGarments(allCustom);
    return { ok: true, garment: created };
  }

  if (pathname.startsWith('/garments/') && method === 'DELETE') {
    const targetId = Number(pathname.split('/')[2]);
    const allCustom = loadCustomStandaloneGarments().filter((g) => Number(g.id) !== targetId);
    saveCustomStandaloneGarments(allCustom);
    return { ok: true };
  }

  if (pathname === '/garments/import-samples' && method === 'POST') {
    const targetCloset = String(body.closet_owner || activeUser?.defaultCloset || closet);
    const requestedKeys = Array.isArray(body.sample_keys) ? body.sample_keys.map(String) : [];
    const selected =
      requestedKeys.length > 0
        ? STANDALONE_SAMPLE_GARMENTS.filter((g) => requestedKeys.includes(g.key))
        : STANDALONE_SAMPLE_GARMENTS;
    const imported: GarmentRecord[] = selected.map((g, i) => ({
      ...g,
      id: Date.now() + i,
      closet_owner: targetCloset,
    }));
    const existingCustom = loadCustomStandaloneGarments();
    saveCustomStandaloneGarments([...existingCustom, ...imported]);
    return {
      ok: true,
      count: imported.length,
      importedCount: imported.length,
      garments: imported,
    };
  }

  if ((pathname === '/shopping/analyze' || pathname === '/shopping-check') && method === 'POST') {
    const targetCloset = String(body.closet_owner || closet || 'sample');
    const cachedAuth = await readCachedResponse<{ garments?: GarmentRecord[] }>(
      `/garments?closet=${encodeURIComponent(targetCloset)}`
    );
    const cachedDemo = await readCachedResponse<{ garments?: GarmentRecord[] }>(
      `demo:/garments?closet=${encodeURIComponent(targetCloset)}`
    );
    const pool =
      cachedAuth?.garments ||
      cachedDemo?.garments ||
      (targetCloset === 'sample' || targetCloset === 'husband' || targetCloset === 'wife'
        ? STANDALONE_SAMPLE_GARMENTS
        : []);
    return computeStandaloneShoppingAnalysis(body, pool);
  }

  if (pathname === '/shopping/history' && method === 'GET') {
    return { history: [] };
  }

  if (
    (pathname === '/weather-styling' || pathname === '/weather/recommendations') &&
    method === 'GET'
  ) {
    const rawScKey = params.get('scenario') || 'live';
    const normalizedScKey = rawScKey === 'mild_spring' ? 'warm_spring' : rawScKey;
    const spec =
      normalizedScKey === 'live'
        ? LIVE_WEATHER_SCENARIO
        : (Object.hasOwn(WEATHER_SCENARIOS, normalizedScKey)
            ? WEATHER_SCENARIOS[normalizedScKey]
            : null) || LIVE_WEATHER_SCENARIO;

    const look1Style = resolveLookStylePresetKey(params.get('look1_style'), 'business_casual');
    const look2Style = resolveLookStylePresetKey(params.get('look2_style'), 'comfortable_casual');

    const cityKey = params.get('city') || 'seoul';
    const matchedCity = CITY_COORDS.find((c) => c.key === cityKey);
    const resolvedCityName = params.get('location_label') || matchedCity?.name || spec.cityName;

    const pcKey =
      params.get('personal_color') || activeUser?.personalColor || 'autumn_warm';
    const pcLabels = getPersonalColorLabels(pcKey);
    const resolvedSkinHex =
      params.get('skin_tone_hex') || activeUser?.skinToneHex || '#DFBA9B';

    const avgTemp = Math.round(spec.tempMin * 0.45 + spec.tempMax * 0.55);
    const isRainy = spec.precipProb >= 45;
    const isWindy = spec.windSpeed >= 22;
    const needOuter =
      (spec.tempMax < 23 && (avgTemp <= 19 || spec.tempMax - spec.tempMin >= 8)) ||
      isRainy ||
      isWindy;
    const needWarmAcc = avgTemp <= 9 || (isWindy && avgTemp <= 15);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const openSummerShoes = new Set(['flip_flops', 'slides', 'sandals']);
    const scoreStandaloneItem = (item: GarmentRecord, presetKey: LookStylePresetKey): number => {
      const midTemp = (Number(item.min_temp ?? 10) + Number(item.max_temp ?? 22)) * 0.5;
      let score = 60 - Math.min(40, Math.abs(midTemp - avgTemp) * 2.4);
      if (avgTemp >= Number(item.min_temp ?? 10) && avgTemp <= Number(item.max_temp ?? 22)) {
        score += 18;
      }
      if (isRainy && item.water_resistant) {
        score += 22;
      }
      if (isWindy && item.category === 'outer' && item.water_resistant) {
        score += 10;
      }
      score += computeStandaloneStylePresetBonus(item, presetKey);
      return score;
    };

    const outersPool = seededGarments.filter((g) => g.category === 'outer');
    const topsPool = seededGarments.filter(
      (g) =>
        g.category === 'top' &&
        !(avgTemp < 22 && (g.subcategory === 'tank_top' || g.subcategory === 'sleeveless'))
    );
    const bottomsPool = seededGarments.filter(
      (g) => g.category === 'bottom' && !(avgTemp < 21 && g.subcategory === 'shorts')
    );
    const shoesPool = seededGarments.filter(
      (g) =>
        g.category === 'shoes' &&
        !((avgTemp < 23 || isRainy) && openSummerShoes.has(String(g.subcategory || '')))
    );
    const isUmbrellaItem = (g: GarmentRecord) =>
      String(g.subcategory || '') === 'umbrella' ||
      /우산|양산|umbrella|parasol/i.test(`${g.name || ''} ${g.name_en || ''}`);
    const bagSubs = new Set(['bag', 'tote', 'crossbody', 'briefcase', 'backpack']);
    const headSubs = new Set(['headwear', 'cap', 'hat', 'beanie', 'beret', 'bucket_hat']);
    const neckSubs = new Set(['neckwear', 'scarf', 'muffler', 'tie', 'necktie']);
    const gloveSubs = new Set(['gloves', 'leather_gloves', 'mittens']);

    const umbrellaList = seededGarments.filter(isUmbrellaItem);
    const accPool = seededGarments.filter(
      (g) =>
        !isUmbrellaItem(g) &&
        ((g.category === 'accessory' && bagSubs.has(String(g.subcategory || 'bag'))) ||
          g.category === 'bag')
    );
    const headPool = seededGarments.filter(
      (g) =>
        g.category === 'headwear' ||
        (g.category === 'accessory' && headSubs.has(String(g.subcategory || '')))
    );
    const neckPool = seededGarments.filter(
      (g) =>
        g.category === 'neckwear' ||
        (g.category === 'accessory' && neckSubs.has(String(g.subcategory || '')))
    );
    const glovePool = seededGarments.filter(
      (g) =>
        g.category === 'gloves' ||
        (g.category === 'accessory' && gloveSubs.has(String(g.subcategory || '')))
    );

    const pickForPreset = (
      pool: GarmentRecord[],
      presetKey: LookStylePresetKey,
      excludeIds: ReadonlySet<number>,
      fallbackIdx = 0
    ): GarmentRecord | null => {
      if (!pool.length) return null;
      const ranked = [...pool].sort(
        (a, b) => scoreStandaloneItem(b, presetKey) - scoreStandaloneItem(a, presetKey)
      );
      const distinct = ranked.filter((g) => !excludeIds.has(g.id));
      if (distinct.length > 0) {
        return distinct[0];
      }
      return ranked[fallbackIdx % ranked.length] || ranked[0];
    };

    const buildFallbackRec = (
      idx: number,
      id: string,
      presetKey: LookStylePresetKey,
      excludeIds: ReadonlySet<number>
    ) => {
      const preset = LOOK_STYLE_PRESETS[presetKey];
      const chosenOuter = needOuter ? pickForPreset(outersPool, presetKey, excludeIds, idx) : null;
      const chosenTop = pickForPreset(topsPool, presetKey, excludeIds, idx);
      const chosenBottom = pickForPreset(bottomsPool, presetKey, excludeIds, idx);
      const chosenShoes = pickForPreset(shoesPool, presetKey, excludeIds, idx);
      const chosenAcc = pickForPreset(accPool, presetKey, excludeIds, idx);
      const chosenHeadwear = needWarmAcc
        ? pickForPreset(headPool, presetKey, excludeIds, idx)
        : null;
      const chosenNeckwear =
        needWarmAcc || isWindy || presetKey === 'formal_office'
          ? pickForPreset(neckPool, presetKey, excludeIds, idx)
          : null;
      const chosenGloves =
        avgTemp <= 4 ? pickForPreset(glovePool, presetKey, excludeIds, idx) : null;
      const chosenUmbrella =
        isRainy || spec.isSnowy ? pickForPreset(umbrellaList, presetKey, excludeIds, idx) : null;
      const items = [
        chosenHeadwear,
        chosenNeckwear,
        chosenOuter,
        chosenTop,
        chosenBottom,
        chosenGloves,
        chosenShoes,
        chosenAcc,
        chosenUmbrella,
      ].filter((x): x is GarmentRecord => Boolean(x));
      return {
        id,
        stylePreset: preset.key,
        badge: preset.badge,
        badgeEn: preset.badgeEn,
        title: preset.title,
        titleEn: preset.titleEn,
        items,
        loadoutBySlot: {
          headwear: chosenHeadwear,
          neckwear: chosenNeckwear,
          outer: chosenOuter,
          top: chosenTop,
          bottom: chosenBottom,
          gloves: chosenGloves,
          shoes: chosenShoes,
          accessory: chosenAcc,
          umbrella: chosenUmbrella,
          acc_umbrella: chosenUmbrella,
        },
        rationale: `${spec.weatherTip} [${preset.badge} · ${pcLabels.ko || '가을 웜톤'} 톤 매칭]`,
        suitabilityScore: Math.max(88, 97 - idx * 3),
        personalColorSync: Math.max(86, 95 - idx * 2),
      };
    };

    const recommendations = (() => {
      if (!seededGarments.length) return [];
      const look1 = buildFallbackRec(0, 'commute', look1Style, new Set<number>());
      const look1Ids = new Set<number>(look1.items.map((item) => item.id));
      const look2 = buildFallbackRec(1, 'daily', look2Style, look1Ids);
      return [look1, look2];
    })();

    return {
      weather: {
        cityKey,
        cityName: resolvedCityName,
        date: tomorrow,
        scenarioKey: normalizedScKey,
        condition: spec.condition,
        weatherCode: spec.weatherCode,
        tempMin: spec.tempMin,
        tempMax: spec.tempMax,
        avgTemp,
        tempC: avgTemp,
        diurnalSwing: spec.tempMax - spec.tempMin,
        precipProb: spec.precipProb,
        windSpeed: spec.windSpeed,
        humidity: spec.humidity,
        isRainy,
        isRaining: isRainy,
        isSnowy: Boolean(spec.isSnowy),
        isWindy,
        summary: spec.weatherTip,
        weatherTip: spec.weatherTip,
        recommendedMotion: spec.recommendedMotion,
        isSimulated: normalizedScKey !== 'live',
      },
      stylingProfile: {
        personalColor: pcKey,
        personalColorLabel: `${pcLabels.ko || '가을 웜톤'} (${pcLabels.en || 'Autumn Warm'})`,
        personalColorAdvice:
          '피부 언더톤과 명도에 맞춘 톤온톤 컬러 매치로 얼굴 혈색을 또렷하게 살려줍니다.',
        skinToneHex: resolvedSkinHex,
        heightCm: activeUser?.heightCm || 175,
        weightKg: activeUser?.weightKg || 68,
        bodyShape: activeUser?.bodyShape || 'standard_balanced',
        shapeShortKo: '표준 밸런스형',
      },
      cities: CITY_COORDS.map((c) => ({ key: c.key, name: c.name })),
      scenarios: [
        { key: LIVE_WEATHER_SCENARIO.key, label: LIVE_WEATHER_SCENARIO.label },
        ...Object.values(WEATHER_SCENARIOS).map((s) => ({
          key: s.key,
          label: s.label,
        })),
      ],
      lookStylePresets: Object.values(LOOK_STYLE_PRESETS).map((p) => ({
        key: p.key,
        badge: p.badge,
        badgeEn: p.badgeEn,
        title: p.title,
        titleEn: p.titleEn,
      })),
      recommendations,
      isClosetEmpty: seededGarments.length === 0,
      isSampleDemo: closet === 'sample',
    };
  }

  if (pathname === '/outfits' && method === 'GET') {
    return {
      outfits: seededGarments.length
        ? [
            {
              id: 501,
              closet_owner: closet,
              title: '간절기 캐시미어 코트 출근룩',
              occasion: '출근 · 데일리',
              season: '봄/가을',
              item_ids: seededGarments.slice(0, 5).map((g) => g.id),
              items: seededGarments.slice(0, 5),
              wear_count: 6,
            },
          ]
        : [],
    };
  }

  if (pathname === '/analytics' && method === 'GET') {
    const totalItems = seededGarments.length;
    const totalValue = seededGarments.reduce((acc, g) => acc + (Number(g.price) || 0), 0);
    const totalWears = seededGarments.reduce((acc, g) => acc + (Number(g.wear_count) || 0), 0);
    const avgCpw = totalWears > 0 ? Math.round(totalValue / totalWears) : 0;

    const cpwRanking = [...seededGarments]
      .map((g) => ({
        ...g,
        cpw: g.wear_count > 0 ? Math.round(g.price / g.wear_count) : g.price,
        daysUnworn: 3,
      }))
      .sort((a, b) => a.cpw - b.cpw);

    const categoryDist: Record<string, number> = {};
    const colorMap: Record<string, { count: number; hex: string }> = {};
    for (const g of seededGarments) {
      categoryDist[g.category] = (categoryDist[g.category] || 0) + 1;
      if (!colorMap[g.color_name]) {
        colorMap[g.color_name] = { count: 0, hex: g.color_hex };
      }
      colorMap[g.color_name].count += 1;
    }

    const sortedCategories = Object.entries(categoryDist)
      .map(([category, count]) => ({
        category,
        count,
        sharePct: totalItems > 0 ? Math.round((count / totalItems) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const sortedColors = Object.entries(colorMap)
      .map(([name, info]) => ({
        name,
        count: info.count,
        hex: info.hex,
        sharePct: totalItems > 0 ? Math.round((info.count / totalItems) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const utilizationRate = totalItems > 0 ? 92 : 0;

    return {
      totalItems,
      totalValue,
      totalWears,
      avgCpw,
      utilizationRate,
      cpwRanking,
      bestValueItems: cpwRanking.slice(0, 6),
      sleepingItems: [],
      categoryDist,
      sortedCategories,
      categoryDistribution: sortedCategories,
      colorDist: sortedColors,
      colorDistribution: sortedColors,
      topColorSharePct: sortedColors[0]?.sharePct || 0,
      topColorName: sortedColors[0]?.name || '-',
      savedMoney: 0,
      passedCount: 0,
      summary: {
        totalItems,
        totalGarments: totalItems,
        totalValue,
        avgCpw,
        utilizationRate,
        unwornCount: 0,
      },
    };
  }

  if (pathname === '/calendar' && method === 'GET') {
    return { logs: [], entries: [] };
  }

  if (pathname === '/packing-lists' && method === 'GET') {
    return { lists: [] };
  }

  if (pathname === '/vton/status') {
    return {
      ok: true,
      mode: '2d-vton',
      geminiConfigured: false,
      vertexConfigured: false,
      fallbackReason: 'backend_unavailable',
    };
  }

  if (pathname === '/vton/synthesize') {
    return {
      ok: true,
      mode: '2d-vton',
      provider: 'flatlay-fallback',
      geminiUsed: false,
      compositeImageUrl: null,
      baseModelImageUrl: null,
      fallbackReason: 'backend_unavailable',
    };
  }

  return { ok: true };
}
