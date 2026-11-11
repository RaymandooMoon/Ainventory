/**
 * Standalone Local Runtime Fallback (Capacitor Native APK / Static Web / Offline Cold-Start)
 * - Activates ONLY when `/api/*` is unreachable (no Express backend running, e.g., static hosting or native WebView)
 * - Preserves genuine HTTP 400/401/403/429 JSON responses when the Express backend IS active
 */

const LOCAL_USERS_KEY = 'ainventory_standalone_users_v1';
const LOCAL_OTP_KEY = 'ainventory_standalone_otp_v1';
const LOCAL_SESSION_KEY = 'ainventory_standalone_session_v1';

const DEFAULT_STANDALONE_USERS = [
  {
    id: 1,
    username: 'husband',
    password: 'husband1234',
    displayName: '남편 (준호)',
    role: 'member',
    defaultCloset: 'husband',
    closetName: '준호의 데일리 옷장',
    profileCompleted: true,
    personalColor: 'autumn_warm',
    gender: 'male',
    heightCm: 178,
    weightKg: 73,
    bodyShape: 'standard_balanced',
  },
  {
    id: 2,
    username: 'wife',
    password: 'wife1234',
    displayName: '아내 (서연)',
    role: 'member',
    defaultCloset: 'wife',
    closetName: '서연의 미니멀 옷장',
    profileCompleted: true,
    personalColor: 'summer_cool',
    gender: 'female',
    heightCm: 165,
    weightKg: 52,
    bodyShape: 'slim_straight',
  },
  {
    id: 3,
    username: 'admin',
    password: 'admin1234',
    displayName: '관리자',
    role: 'admin',
    defaultCloset: 'husband',
    closetName: '통합 관리 옷장',
    profileCompleted: true,
    personalColor: 'winter_cool',
    gender: 'male',
    heightCm: 177,
    weightKg: 71,
    bodyShape: 'standard_balanced',
  },
];

export const STANDALONE_SAMPLE_GARMENTS = [
  {
    id: 9001,
    closet_owner: 'sample',
    name: '발마칸 캐시미어 롱코트',
    category: 'outer',
    subcategory: 'coat',
    fabric: 'cashmere',
    color_name: '카멜',
    color_hex: '#BFA98B',
    seasons: ['가을', '겨울'],
    min_temp: -5,
    max_temp: 14,
    water_resistant: false,
    formality: 'smart',
    brand: 'A.Studio',
    price: 420000,
    wear_count: 28,
    cpw: 15000,
    is_favorite: true,
    status: 'active',
    image_url: '/seed/studio-coat.jpg',
    slot_key: 'outer',
    base_glb: 'outer_coat',
    physics_preset: 'hem_sway',
  },
  {
    id: 9002,
    closet_owner: 'sample',
    name: '캐시미어 프린지 머플러',
    category: 'neckwear',
    subcategory: 'scarf',
    fabric: 'cashmere',
    color_name: '카멜',
    color_hex: '#C49245',
    seasons: ['가을', '겨울'],
    min_temp: -10,
    max_temp: 13,
    water_resistant: false,
    formality: 'smart',
    brand: 'A.Studio',
    price: 148000,
    wear_count: 19,
    cpw: 7789,
    is_favorite: true,
    status: 'active',
    image_url: '/seed/studio-scarf.jpg',
    slot_key: 'neckwear',
    base_glb: 'neck_scarf',
    physics_preset: 'spring_cloth',
  },
  {
    id: 9003,
    closet_owner: 'sample',
    name: '아이보리 메리노 크루넥 니트',
    category: 'top',
    subcategory: 'knit',
    fabric: 'wool',
    color_name: '크림',
    color_hex: '#EFECE6',
    seasons: ['봄', '가을', '겨울'],
    min_temp: 2,
    max_temp: 18,
    water_resistant: false,
    formality: 'smart',
    brand: 'Minimal Lab',
    price: 119000,
    wear_count: 24,
    cpw: 4958,
    is_favorite: true,
    status: 'active',
    image_url: '/seed/cream-knit.jpg',
    slot_key: 'top',
    base_glb: 'top_knit',
    physics_preset: 'rigid_fitted',
  },
  {
    id: 9004,
    closet_owner: 'sample',
    name: '차콜 테이퍼드 울 슬랙스',
    category: 'bottom',
    subcategory: 'slacks',
    fabric: 'wool',
    color_name: '차콜',
    color_hex: '#2E3036',
    seasons: ['봄', '가을', '겨울'],
    min_temp: -3,
    max_temp: 20,
    water_resistant: false,
    formality: 'smart',
    brand: 'Tailor Co',
    price: 159000,
    wear_count: 32,
    cpw: 4969,
    is_favorite: false,
    status: 'active',
    image_url: '/seed/charcoal-slacks.jpg',
    slot_key: 'bottom',
    base_glb: 'bottom_slacks',
    physics_preset: 'rigid_fitted',
  },
  {
    id: 9005,
    closet_owner: 'sample',
    name: '코냑 새들 크로스백',
    category: 'accessory',
    subcategory: 'bag',
    fabric: 'leather',
    color_name: '브라운',
    color_hex: '#6B3E26',
    seasons: ['봄', '여름', '가을', '겨울'],
    min_temp: -15,
    max_temp: 35,
    water_resistant: true,
    formality: 'smart',
    brand: 'Atelier Leather',
    price: 260000,
    wear_count: 40,
    cpw: 6500,
    is_favorite: true,
    status: 'active',
    image_url: '/seed/studio-bag.jpg',
    slot_key: 'accessory',
    base_glb: 'acc_crossbody',
    physics_preset: 'pendulum_strap',
  },
  {
    id: 9006,
    closet_owner: 'sample',
    name: '블랙 레더 페니 로퍼',
    category: 'shoes',
    subcategory: 'loafers',
    fabric: 'leather',
    color_name: '블랙',
    color_hex: '#1D1D1F',
    seasons: ['봄', '가을', '겨울'],
    min_temp: -5,
    max_temp: 25,
    water_resistant: true,
    formality: 'smart',
    brand: 'Atelier Leather',
    price: 228000,
    wear_count: 38,
    cpw: 6000,
    is_favorite: true,
    status: 'active',
    image_url: '/seed/black-loafers.jpg',
    slot_key: 'shoes',
    base_glb: 'shoes_loafers',
    physics_preset: 'rigid_fitted',
  },
  {
    id: 9007,
    closet_owner: 'sample',
    name: '차콜 플리츠 미디 스커트',
    category: 'bottom',
    subcategory: 'skirt',
    fabric: 'wool',
    color_name: '차콜',
    color_hex: '#363A45',
    seasons: ['봄', '가을', '겨울'],
    min_temp: 4,
    max_temp: 22,
    water_resistant: false,
    formality: 'smart',
    brand: 'Studio Line',
    price: 168000,
    wear_count: 14,
    cpw: 12000,
    is_favorite: false,
    status: 'active',
    image_url: '/seed/studio-skirt.jpg',
    slot_key: 'bottom',
    base_glb: 'bottom_skirt',
    physics_preset: 'hem_sway',
  },
];

function loadUsers() {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return [...DEFAULT_STANDALONE_USERS];
}

function saveUsers(users) {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {
    // ignore
  }
}

function sanitizeUser(u) {
  if (!u) return null;
  const copy = { ...u };
  delete copy.password;
  return copy;
}

function getActiveSessionUser() {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setActiveSessionUser(user) {
  try {
    if (user) {
      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(sanitizeUser(user)));
    } else {
      localStorage.removeItem(LOCAL_SESSION_KEY);
    }
  } catch {
    // ignore
  }
}

function parseBody(rawBody) {
  if (!rawBody) return {};
  if (typeof rawBody === 'string') {
    try {
      return JSON.parse(rawBody);
    } catch {
      return {};
    }
  }
  if (typeof rawBody === 'object') return rawBody;
  return {};
}

const WEATHER_SCENARIOS = {
  crisp_autumn: {
    key: 'crisp_autumn',
    city: '서울 성수동',
    condition: '맑음 · 선선함',
    conditionKey: 'clear',
    temp: 14,
    feelsLike: 13,
    humidity: 48,
    windKmh: 11,
    precipProb: 10,
    defaultMotion: 'walk',
    stylingTip: '일교차가 있는 선선한 날씨입니다. 니트 위에 가벼운 코트 레이어드를 추천합니다.',
  },
  windy_gale: {
    key: 'windy_gale',
    city: '서울 여의도',
    condition: '강풍 주의보',
    conditionKey: 'windy',
    temp: 12,
    feelsLike: 8,
    humidity: 44,
    windKmh: 32,
    precipProb: 15,
    defaultMotion: 'wind',
    stylingTip: '초속 9m/s 강풍이 불고 있습니다. 체온을 지키는 롱코트와 캐시미어 머플러를 매치하세요.',
  },
  rainy_cool: {
    key: 'rainy_cool',
    city: '서울 강남',
    condition: '비 예보',
    conditionKey: 'rain',
    temp: 11,
    feelsLike: 9,
    humidity: 86,
    windKmh: 19,
    precipProb: 85,
    defaultMotion: 'umbrella',
    stylingTip: '비와 바람이 동반됩니다. 발수 아우터와 어두운 톤 하의를 추천합니다.',
  },
  winter_cold: {
    key: 'winter_cold',
    city: '서울 광화문',
    condition: '한파 · 칼바람',
    conditionKey: 'snow',
    temp: -3,
    feelsLike: -8,
    humidity: 40,
    windKmh: 26,
    precipProb: 20,
    defaultMotion: 'wind',
    stylingTip: '영하권 칼바람 날씨입니다. 보온성이 높은 울·캐시미어 레이어드가 필수입니다.',
  },
  mild_spring: {
    key: 'mild_spring',
    city: '서울 한남동',
    condition: '포근한 봄날',
    conditionKey: 'clear',
    temp: 19,
    feelsLike: 19,
    humidity: 50,
    windKmh: 8,
    precipProb: 5,
    defaultMotion: 'walk',
    stylingTip: '가볍게 걷기 좋은 산뜻한 기온입니다. 단품 니트와 크로스백 조합이 잘 어울립니다.',
  },
};

export async function handleStandaloneApiFallback(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const body = parseBody(options.body);
  const [pathname, queryStr = ''] = path.split('?');
  const params = new URLSearchParams(queryStr);

  // ---------------- AUTH ENDPOINTS ----------------
  if (pathname === '/auth/login' && method === 'POST') {
    const uname = String(body.username || '').trim().toLowerCase();
    const pw = String(body.password || '');
    const users = loadUsers();
    const found = users.find((u) => String(u.username).toLowerCase() === uname);
    if (!found || found.password !== pw) {
      const err = new Error('아이디 또는 비밀번호가 일치하지 않습니다.');
      err.status = 401;
      throw err;
    }
    const clean = sanitizeUser(found);
    setActiveSessionUser(clean);
    return { token: `standalone_tok_${found.id}_${Date.now()}`, user: clean };
  }

  if (pathname === '/auth/apple' && method === 'POST') {
    const appleUser = {
      id: 77,
      username: body.email || 'apple.user@privaterelay.appleid.com',
      displayName: body.fullName || 'Apple 사용자',
      role: 'member',
      defaultCloset: 'wife',
      closetName: 'Apple 프라이빗 옷장',
      profileCompleted: true,
      personalColor: 'summer_cool',
      gender: 'female',
      heightCm: 166,
      weightKg: 53,
      bodyShape: 'standard_balanced',
    };
    setActiveSessionUser(appleUser);
    return { token: `standalone_apple_${Date.now()}`, user: appleUser };
  }

  if (pathname === '/auth/send-verification' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(Math.floor(100000 + Math.random() * 900000));
    try {
      localStorage.setItem(LOCAL_OTP_KEY, JSON.stringify({ email, code, verified: false }));
    } catch {
      // ignore
    }
    return { ok: true, resendCooldownSec: 60, devPreviewCode: code };
  }

  if (pathname === '/auth/verify-email-code' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '').trim();
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(LOCAL_OTP_KEY) || 'null');
    } catch {
      stored = null;
    }
    if (!stored || stored.email !== email || stored.code !== code) {
      const err = new Error('인증코드 6자리가 일치하지 않습니다.');
      err.status = 400;
      throw err;
    }
    localStorage.setItem(LOCAL_OTP_KEY, JSON.stringify({ ...stored, verified: true }));
    return { ok: true, verified: true };
  }

  if (pathname === '/auth/register-email' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const users = loadUsers();
    const newId = Date.now();
    const displayName = body.displayName || email.split('@')[0] || '신규회원';
    const newUser = {
      id: newId,
      username: email,
      password: body.password || '1234',
      displayName,
      role: 'member',
      defaultCloset: `user_${newId}`,
      closetName: body.closetName || `${displayName}의 옷장`,
      profileCompleted: true,
      personalColor: 'autumn_warm',
      gender: body.gender || 'male',
      heightCm: body.gender === 'female' ? 164 : 176,
      weightKg: body.gender === 'female' ? 52 : 70,
      bodyShape: 'standard_balanced',
    };
    users.push(newUser);
    saveUsers(users);
    const clean = sanitizeUser(newUser);
    setActiveSessionUser(clean);
    return { token: `standalone_reg_${newId}`, user: clean };
  }

  if (pathname === '/auth/me' && method === 'GET') {
    const u = getActiveSessionUser();
    if (!u) {
      const err = new Error('로그인이 필요합니다.');
      err.status = 401;
      throw err;
    }
    return { user: u };
  }

  if (pathname === '/auth/logout' && method === 'POST') {
    setActiveSessionUser(null);
    return { ok: true };
  }

  if (pathname === '/auth/closet-setup' && method === 'POST') {
    const u = getActiveSessionUser() || sanitizeUser(DEFAULT_STANDALONE_USERS[0]);
    const updated = { ...u, closetName: body.closetName || '내 옷장' };
    setActiveSessionUser(updated);
    return { user: updated };
  }

  if (pathname === '/auth/profile' && (method === 'POST' || method === 'PATCH')) {
    const u = getActiveSessionUser() || sanitizeUser(DEFAULT_STANDALONE_USERS[0]);
    const updated = { ...u, ...body, profileCompleted: true };
    setActiveSessionUser(updated);
    return { user: updated };
  }

  if (pathname === '/auth/account' && method === 'DELETE') {
    const u = getActiveSessionUser();
    if (u) {
      const next = loadUsers().filter((item) => item.username !== u.username);
      saveUsers(next);
    }
    setActiveSessionUser(null);
    return { ok: true, deletedImmediately: true };
  }

  // ---------------- DATA ENDPOINTS ----------------
  const closet = params.get('closet') || 'sample';
  const isSeededCloset = closet === 'sample' || closet === 'husband' || closet === 'wife';
  const garments = isSeededCloset
    ? STANDALONE_SAMPLE_GARMENTS.map((g) => ({ ...g, closet_owner: closet }))
    : [];

  if (pathname === '/garments' && method === 'GET') {
    return { garments };
  }

  if (pathname === '/garments/samples' && method === 'GET') {
    return { samples: STANDALONE_SAMPLE_GARMENTS };
  }

  if (pathname === '/garments/import-samples' && method === 'POST') {
    const targetCloset = body.closet_owner || closet;
    const imported = STANDALONE_SAMPLE_GARMENTS.map((g, i) => ({
      ...g,
      id: Date.now() + i,
      closet_owner: targetCloset,
    }));
    return { ok: true, importedCount: imported.length, garments: imported };
  }

  if ((pathname === '/weather-styling' || pathname === '/weather/recommendations') && method === 'GET') {
    const scKey = params.get('scenario') || 'windy_gale';
    const weather = WEATHER_SCENARIOS[scKey] || WEATHER_SCENARIOS.windy_gale;
    const outfitItems = garments.slice(0, 6);
    return {
      weather,
      scenarios: Object.values(WEATHER_SCENARIOS).map((s) => ({
        key: s.key,
        label: `${s.city} · ${s.condition} (${s.temp}°C)`,
        temp: s.temp,
        conditionKey: s.conditionKey,
        windKmh: s.windKmh,
      })),
      recommendations: outfitItems.length
        ? [
            {
              id: 'rec_primary',
              title: `${weather.condition} 맞춤 캡슐 코디`,
              score: 96,
              reason: weather.stylingTip,
              items: outfitItems,
            },
          ]
        : [],
      garmentCount: garments.length,
    };
  }

  if (pathname === '/outfits' && method === 'GET') {
    return {
      outfits: garments.length
        ? [
            {
              id: 501,
              closet_owner: closet,
              title: '강풍 대비 캐시미어 코트 룩',
              occasion: '출근 · 데일리',
              season: '가을/겨울',
              item_ids: garments.slice(0, 6).map((g) => g.id),
              items: garments.slice(0, 6),
              wear_count: 6,
            },
          ]
        : [],
    };
  }

  if (pathname === '/analytics' && method === 'GET') {
    const totalValue = garments.reduce((acc, g) => acc + (Number(g.price) || 0), 0);
    const withCpw = garments.map((g) => {
      const price = Number(g.price) || 0;
      const wears = Math.max(1, Number(g.wear_count) || 1);
      return {
        ...g,
        cpw: Number(g.cpw) || Math.round(price / wears),
      };
    });
    const sortedByCpw = [...withCpw].sort((a, b) => a.cpw - b.cpw);
    const avgCpw = withCpw.length
      ? Math.round(withCpw.reduce((acc, g) => acc + g.cpw, 0) / withCpw.length)
      : 0;
    return {
      summary: {
        totalItems: garments.length,
        totalGarments: garments.length,
        totalValue,
        avgCpw,
        utilizationRate: garments.length ? 86 : 0,
        unwornCount: 0,
      },
      cpwRanking: sortedByCpw,
      bestValueItems: sortedByCpw.slice(0, 4),
      bestCpw: sortedByCpw.slice(0, 4),
      worstCpw: [...sortedByCpw].reverse().slice(0, 4),
      unwornItems: [],
      sleepingItems: [],
      categoryBreakdown: [
        { category: 'outer', count: 1 },
        { category: 'neckwear', count: 1 },
        { category: 'top', count: 1 },
        { category: 'bottom', count: 2 },
        { category: 'shoes', count: 1 },
        { category: 'accessory', count: 1 },
      ],
      colorBreakdown: [
        { color_name: '카멜', color_hex: '#BFA98B', count: 2 },
        { color_name: '차콜', color_hex: '#2E3036', count: 2 },
        { color_name: '블랙', color_hex: '#1D1D1F', count: 1 },
        { color_name: '크림', color_hex: '#EFECE6', count: 1 },
      ],
    };
  }

  if (pathname === '/calendar' && method === 'GET') {
    return { entries: [] };
  }

  if (pathname === '/packing-lists' && method === 'GET') {
    return { lists: [] };
  }

  return { ok: true };
}
