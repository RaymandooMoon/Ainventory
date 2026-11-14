/**
 * Standalone Local Runtime Fallback (Capacitor Native APK / Static Web / Offline Cold-Start)
 * - Activates ONLY when `/api/*` is unreachable or in offline / local stateless compute mode
 * - Preserves genuine HTTP 400/401/403/429 JSON responses when the Express backend IS active
 */

import type { GarmentRecord, UserProfile } from '../contracts/carbonDesignContract.ts';
import { colorSimilarityScore } from '../shared/colorMath.js';
import {
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

interface StoredStandaloneUser extends UserProfile {
  passwordHash?: string;
}

export interface SampleCatalogGarment extends GarmentRecord {
  key: string;
  name_en?: string;
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

export const STANDALONE_SAMPLE_GARMENTS: SampleCatalogGarment[] = SEASONAL_120_CATALOG.map(
  (item) => {
    const spec = resolveManifestSlotAndGlb(item.category, item.subcategory);
    const wearCount = ((item.idOffset * 3) % 24) + 2;
    const cpw = wearCount > 0 ? Math.round(item.price / wearCount) : item.price;
    return {
      key: item.key,
      id: 9000 + item.idOffset,
      closet_owner: 'sample',
      name: item.name,
      name_en: item.name_en,
      category: item.category,
      subcategory: item.subcategory,
      fabric: item.fabric,
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
  }
);

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
    weatherTip: '비와 바람이 동반됩니다. 발수 아우터와 어두운 톤 하의·가죽 슈즈를 추천합니다.',
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
  winter_cold: {
    key: 'winter_cold',
    label: '영하권 겨울 칼바람',
    cityName: '서울',
    condition: '맑고 강추위',
    weatherCode: 0,
    tempMin: -4,
    tempMax: 4,
    windSpeed: 26,
    precipProb: 10,
    humidity: 38,
    recommendedMotion: 'wind',
    weatherTip: '영하권 칼바람 날씨입니다. 보온성이 높은 울·캐시미어 코트와 머플러 레이어드가 필수입니다.',
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
    summary = `보유 중인 '${similarItems[0].name}'과 같은 계열이지만 소재나 두께감이 다르다면 교차 착용용으로 고려해볼 만합니다.`;
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

  if (pathname === '/vton/status' || pathname === '/vton/synthesize') {
    return {
      ok: true,
      mode: '2d-vton',
      provider: 'client-editorial-2d',
      geminiUsed: false,
      compositeImageUrl: null,
      baseModelImageUrl: null,
    };
  }

  // ---------------- DATA ENDPOINTS ----------------
  const activeUser = getActiveSessionUser();
  const closet = String(
    params.get('closet') || body.closet_owner || activeUser?.defaultCloset || 'sample'
  );
  const isSeededCloset = closet === 'sample' || closet === 'husband' || closet === 'wife';
  const seededGarments: GarmentRecord[] = isSeededCloset
    ? STANDALONE_SAMPLE_GARMENTS.map((g) => ({ ...g, closet_owner: closet }))
    : [];

  if (pathname === '/garments' && method === 'GET') {
    return { garments: seededGarments, isSampleDemo: closet === 'sample' };
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
    const rawScKey = params.get('scenario') || 'crisp_autumn';
    const normalizedScKey = rawScKey === 'mild_spring' ? 'warm_spring' : rawScKey;
    const spec =
      (Object.hasOwn(WEATHER_SCENARIOS, normalizedScKey)
        ? WEATHER_SCENARIOS[normalizedScKey]
        : null) || WEATHER_SCENARIOS.crisp_autumn;

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
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const openSummerShoes = new Set(['flip_flops', 'slides', 'sandals']);
    const sortByTempFit = (list: GarmentRecord[]) =>
      [...list].sort((a, b) => {
        const midA = (Number(a.min_temp ?? 10) + Number(a.max_temp ?? 22)) * 0.5;
        const midB = (Number(b.min_temp ?? 10) + Number(b.max_temp ?? 22)) * 0.5;
        return Math.abs(midA - avgTemp) - Math.abs(midB - avgTemp);
      });

    const outers = sortByTempFit(seededGarments.filter((g) => g.category === 'outer'));
    const tops = sortByTempFit(
      seededGarments.filter(
        (g) =>
          g.category === 'top' &&
          !(avgTemp < 22 && (g.subcategory === 'tank_top' || g.subcategory === 'sleeveless'))
      )
    );
    const bottoms = sortByTempFit(
      seededGarments.filter(
        (g) => g.category === 'bottom' && !(avgTemp < 21 && g.subcategory === 'shorts')
      )
    );
    const shoesList = sortByTempFit(
      seededGarments.filter(
        (g) =>
          g.category === 'shoes' &&
          !((avgTemp < 23 || isRainy) && openSummerShoes.has(String(g.subcategory || '')))
      )
    );
    const accList = seededGarments.filter(
      (g) => g.category === 'accessory' || g.category === 'neckwear'
    );

    const buildFallbackRec = (idx: number, id: string, badge: string, title: string) => {
      const chosenOuter = needOuter && outers.length
        ? (isRainy ? outers.find((o) => o.water_resistant) || outers[idx % outers.length] : outers[idx % outers.length])
        : null;
      const chosenTop = tops.length ? tops[idx % tops.length] : null;
      const chosenBottom = bottoms.length ? bottoms[idx % bottoms.length] : null;
      const chosenShoes = shoesList.length ? shoesList[idx % shoesList.length] : null;
      const chosenAcc = accList.length ? accList[idx % accList.length] : null;
      const items = [chosenOuter, chosenTop, chosenBottom, chosenShoes, chosenAcc].filter(
        (x): x is GarmentRecord => Boolean(x)
      );
      return {
        id,
        badge,
        title,
        items,
        loadoutBySlot: {
          outer: chosenOuter,
          top: chosenTop,
          bottom: chosenBottom,
          shoes: chosenShoes,
          accessory: chosenAcc,
        },
        rationale: `${spec.weatherTip} [${pcLabels.ko || '가을 웜톤'} 톤 매칭]`,
        suitabilityScore: Math.max(88, 97 - idx * 3),
        personalColorSync: Math.max(86, 95 - idx * 2),
      };
    };

    return {
      weather: {
        cityKey,
        cityName: resolvedCityName,
        date: tomorrow,
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
        isWindy,
        summary: spec.weatherTip,
        weatherTip: spec.weatherTip,
        recommendedMotion: spec.recommendedMotion,
        isSimulated: rawScKey !== 'live',
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
        { key: 'live', label: '실시간 내일 예보' },
        ...Object.values(WEATHER_SCENARIOS).map((s) => ({
          key: s.key,
          label: s.label,
        })),
      ],
      recommendations: seededGarments.length
        ? [
            buildFallbackRec(0, 'commute', '출근 · 스마트 포멀', `${spec.condition} 맞춤 출근 코디`),
            buildFallbackRec(1, 'daily', '데일리 · 미니멀', `내일 ${avgTemp}°C 일교차 대응 데일리룩`),
          ]
        : [],
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

  if (pathname === '/vton/status' && method === 'GET') {
    return {
      ok: true,
      mode: '2d-vton',
      geminiConfigured: false,
      vertexConfigured: false,
      fallbackReason: 'backend_unavailable',
    };
  }

  if (pathname === '/vton/synthesize' && method === 'POST') {
    return {
      ok: true,
      mode: '2d-vton',
      provider: 'flatlay-fallback',
      compositeImageUrl: null,
      fallbackReason: 'backend_unavailable',
    };
  }

  return { ok: true };
}
