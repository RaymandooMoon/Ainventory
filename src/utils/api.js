import {
  readCachedResponse,
  writeCachedResponse,
  applyOptimisticLocalMutation,
  flushOfflineQueue,
} from './offlineSync.js';

const TOKEN_KEY = 'ainventory_auth_token';
const SAMPLE_DEMO_KEY = 'ainventory_sample_demo_mode';

export function getStoredToken() {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setStoredToken(token) {
  if (typeof localStorage === 'undefined') return;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(SAMPLE_DEMO_KEY);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function isSampleDemoMode() {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(SAMPLE_DEMO_KEY) === '1';
}

export function setSampleDemoMode(enabled) {
  if (typeof localStorage === 'undefined') return;
  if (enabled) {
    localStorage.setItem(SAMPLE_DEMO_KEY, '1');
  } else {
    localStorage.removeItem(SAMPLE_DEMO_KEY);
  }
}

async function rawNetworkFetch(path, options = {}) {
  const token = getStoredToken();
  const sampleDemo = isSampleDemoMode();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };
  if (sampleDemo) {
    headers['X-Demo-Mode'] = 'sample';
  } else if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `요청 실패 (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export function flushPendingOfflineSync() {
  return flushOfflineQueue((p, opts) => rawNetworkFetch(p, opts));
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (!isSampleDemoMode() && getStoredToken()) {
      flushPendingOfflineSync().catch(() => {});
    }
  });
}

/**
 * Offline-First + Sample Demo Mode API Client (Requirements 8.a & 8.b)
 * - Mirrors GET responses into IndexedDB (`ainventory_offline_v1`)
 * - Serves cached IndexedDB data seamlessly when offline
 * - Routes Guest Sample Demo mutations locally without requiring login
 * - Queues authenticated offline mutations and syncs automatically when online
 */
export async function apiFetch(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const sampleDemo = isSampleDemoMode();
  const isAuthEndpoint = path.startsWith('/auth/');
  const isStatelessCompute =
    path === '/garments/analyze' || path === '/shopping/analyze' || path === '/shopping-check';

  // In Sample Closet Demo Mode, mutations stay sandboxed in local IndexedDB
  if (sampleDemo && method !== 'GET' && !isAuthEndpoint && !isStatelessCompute) {
    return applyOptimisticLocalMutation(path, method, options.body, false);
  }

  const isBrowserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;

  if (method === 'GET') {
    const cacheKey = sampleDemo ? `demo:${path}` : path;
    if (isBrowserOffline) {
      const cached = await readCachedResponse(cacheKey);
      if (cached) return { ...cached, _fromOfflineCache: true };
    }
    try {
      const data = await rawNetworkFetch(path, options);
      writeCachedResponse(cacheKey, data).catch(() => {});
      if (!sampleDemo && getStoredToken()) {
        flushOfflineQueue((p, opts) => rawNetworkFetch(p, opts)).catch(() => {});
      }
      return data;
    } catch (err) {
      // Network failure fallback to IndexedDB cache (do not swallow HTTP 401/4xx errors)
      if (!err.status) {
        const cached = await readCachedResponse(cacheKey);
        if (cached) return { ...cached, _fromOfflineCache: true };
      }
      throw err;
    }
  }

  // Authenticated write operations (POST / PATCH / DELETE)
  if (!isAuthEndpoint && isBrowserOffline) {
    return applyOptimisticLocalMutation(path, method, options.body, true);
  }

  try {
    const data = await rawNetworkFetch(path, options);
    return data;
  } catch (err) {
    if (!isAuthEndpoint && !err.status) {
      return applyOptimisticLocalMutation(path, method, options.body, true);
    }
    throw err;
  }
}

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
];

export const SUBCATEGORIES_BY_CAT = {
  headwear: [
    { value: 'beanie', label: '비니 · 니트모자' },
    { value: 'cap', label: '볼캡 · 캡모자' },
    { value: 'beret', label: '베레모 · 헌팅캡' },
    { value: 'bucket_hat', label: '버킷햇 · 페도라' },
  ],
  neckwear: [
    { value: 'scarf', label: '캐시미어 · 울 머플러' },
    { value: 'muffler', label: '니트 스카프 · 넥워머' },
    { value: 'necktie', label: '실크 넥타이' },
  ],
  outer: [
    { value: 'trench', label: '트렌치 · 맥코트' },
    { value: 'blazer', label: '블레이저' },
    { value: 'jacket', label: '자켓 · 점퍼' },
    { value: 'coat', label: '울 · 캐시미어 코트' },
    { value: 'padding', label: '패딩 · 다운' },
    { value: 'cardigan', label: '아우터 가디건' },
  ],
  top: [
    { value: 'knit', label: '니트 · 스웨터' },
    { value: 'cardigan', label: '가디건' },
    { value: 'shirt', label: '셔츠' },
    { value: 'blouse', label: '블라우스 · 실크탑' },
    { value: 'tshirt', label: '티셔츠' },
    { value: 'sweatshirt', label: '맨투맨 · 후드' },
  ],
  bottom: [
    { value: 'slacks', label: '슬랙스 · 팬츠' },
    { value: 'denim', label: '데님 · 청바지' },
    { value: 'chinos', label: '치노 · 면바지' },
    { value: 'skirt', label: '스커트' },
    { value: 'shorts', label: '하프 팬츠 · 쇼츠' },
  ],
  dress: [
    { value: 'dress', label: '미디 · 셔츠 원피스' },
    { value: 'onepiece', label: '니트 · 롱 원피스' },
  ],
  gloves: [
    { value: 'leather_gloves', label: '가죽 장갑' },
    { value: 'gloves', label: '울 · 니트 장갑' },
  ],
  underwear: [
    { value: 'inner_top', label: '발열 · 심리스 이너탑' },
    { value: 'underwear', label: '언더웨어 · 브리프' },
  ],
  socks: [
    { value: 'crew_socks', label: '울 · 골지 크루 삭스' },
    { value: 'socks', label: '데일리 앵클 삭스' },
  ],
  shoes: [
    { value: 'sneakers', label: '스니커즈' },
    { value: 'loafers', label: '로퍼 · 구두' },
    { value: 'boots', label: '첼시 · 앵클 부츠' },
    { value: 'heels', label: '힐 · 펌프스' },
  ],
  accessory: [
    { value: 'briefcase', label: '서류가방 · 브리프케이스' },
    { value: 'tote', label: '토트백 · 쇼퍼백' },
    { value: 'bag', label: '크로스백 · 숄더백' },
    { value: 'watch', label: '시계 · 워치' },
    { value: 'belt', label: '레더 벨트' },
    { value: 'glasses', label: '아이웨어 · 안경' },
  ],
  bag: [
    { value: 'briefcase', label: '서류가방 · 브리프케이스' },
    { value: 'tote', label: '토트백 · 쇼퍼백' },
    { value: 'bag', label: '크로스백 · 숄더백' },
  ],
};

export const COLOR_PALETTE = [
  { name: '블랙', hex: '#1D1D1F' },
  { name: '차콜', hex: '#373A40' },
  { name: '그레이', hex: '#8E9299' },
  { name: '화이트', hex: '#F3F2EE' },
  { name: '크림', hex: '#DFD5C4' },
  { name: '베이지', hex: '#C6B294' },
  { name: '카멜', hex: '#C18F59' },
  { name: '브라운', hex: '#6E4F3A' },
  { name: '테라코타', hex: '#A64B2A' },
  { name: '버건디 와인', hex: '#681F2B' },
  { name: '코랄 피치', hex: '#E38C74' },
  { name: '더스티 로즈', hex: '#C695A0' },
  { name: '카키/올리브', hex: '#7B826B' },
  { name: '네이비', hex: '#1D273B' },
  { name: '인디고', hex: '#2B446B' },
  { name: '스카이블루', hex: '#8FB2CE' },
  { name: '라벤더 그레이', hex: '#ABA9BC' },
];

export function formatKRW(num) {
  const n = Number(num) || 0;
  return `₩${n.toLocaleString('ko-KR')}`;
}

export function computeItemTier(item, personalColor = '') {
  if (!item) {
    return { tier: 'COMMON', labelKo: '일반', color: '#86868B', score: 50 };
  }
  const wears = Number(item.wear_count) || 0;
  const price = Number(item.price) || 0;
  const cpw = wears > 0 ? price / wears : price;
  const isFav = Boolean(item.is_favorite);

  let score = 52;
  if (isFav) score += 22;
  if (wears >= 18) score += 24;
  else if (wears >= 10) score += 16;
  else if (wears >= 5) score += 9;

  if (price > 0 && cpw <= 9000) score += 14;
  else if (price > 0 && cpw <= 16000) score += 8;

  if (item.water_resistant) score += 5;
  if (personalColor && (item.notes || '').includes(personalColor)) score += 8;

  if (score >= 90 || (isFav && wears >= 16)) {
    return { tier: 'ICONIC', labelKo: '아이코닉', color: '#1D1D1F', score };
  }
  if (score >= 78) {
    return { tier: 'LEGENDARY', labelKo: '프리미엄', color: '#3A3A3C', score };
  }
  if (score >= 66) {
    return { tier: 'EPIC', labelKo: '핵심', color: '#48484A', score };
  }
  if (score >= 56) {
    return { tier: 'RARE', labelKo: '자주 착용', color: '#636366', score };
  }
  return { tier: 'COMMON', labelKo: '기본', color: '#8E8E93', score };
}

export const SEASONS = [
  { key: 'spring', value: 'spring', label: '봄', labelEn: 'Spring' },
  { key: 'summer', value: 'summer', label: '여름', labelEn: 'Summer' },
  { key: 'autumn', value: 'autumn', label: '가을', labelEn: 'Autumn' },
  { key: 'winter', value: 'winter', label: '겨울', labelEn: 'Winter' },
];

export const CITY_COORDS = [
  { key: 'seoul', name: '서울', lat: 37.5665, lon: 126.978 },
  { key: 'busan', name: '부산', lat: 35.1796, lon: 129.0756 },
  { key: 'jeju', name: '제주', lat: 33.4996, lon: 126.5312 },
  { key: 'tokyo', name: '도쿄', lat: 35.6762, lon: 139.6503 },
  { key: 'newyork', name: '뉴욕', lat: 40.7128, lon: -74.006 },
  { key: 'paris', name: '파리', lat: 48.8566, lon: 2.3522 },
];
