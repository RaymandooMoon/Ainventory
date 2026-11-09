const TOKEN_KEY = 'ainventory_auth_token';

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setStoredToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiFetch(path, options = {}) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
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

export const CATEGORIES = [
  { value: 'all', label: '전체', labelEn: 'All' },
  { value: 'headwear', label: '모자·헤드웨어', labelEn: 'Headwear' },
  { value: 'neckwear', label: '목도리·스카프·타이', labelEn: 'Neckwear' },
  { value: 'outer', label: '아우터', labelEn: 'Outerwear' },
  { value: 'top', label: '상의', labelEn: 'Tops' },
  { value: 'bottom', label: '하의', labelEn: 'Bottoms' },
  { value: 'dress', label: '원피스', labelEn: 'Dress' },
  { value: 'gloves', label: '장갑', labelEn: 'Gloves' },
  { value: 'underwear', label: '언더웨어·이너', labelEn: 'Innerwear' },
  { value: 'socks', label: '양말', labelEn: 'Socks' },
  { value: 'shoes', label: '신발', labelEn: 'Footwear' },
  { value: 'accessory', label: '가방·액세서리', labelEn: 'Accessories' },
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
    { value: 'bag', label: '가방 · 토트백' },
    { value: 'watch', label: '시계 · 워치' },
    { value: 'belt', label: '레더 벨트' },
    { value: 'glasses', label: '아이웨어 · 안경' },
  ],
  bag: [
    { value: 'bag', label: '가방 · 토트백' },
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
    return { tier: 'COMMON', labelKo: '일반', color: '#8E9299', score: 50 };
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
    return { tier: 'ICONIC', labelKo: '아이코닉', color: '#FFB800', glow: 'rgba(255, 184, 0, 0.45)', score };
  }
  if (score >= 78) {
    return { tier: 'LEGENDARY', labelKo: '레전더리', color: '#FF6B2B', glow: 'rgba(255, 107, 43, 0.40)', score };
  }
  if (score >= 66) {
    return { tier: 'EPIC', labelKo: '에픽', color: '#B85CFF', glow: 'rgba(184, 92, 255, 0.36)', score };
  }
  if (score >= 56) {
    return { tier: 'RARE', labelKo: '레어', color: '#00D2FF', glow: 'rgba(0, 210, 255, 0.36)', score };
  }
  return { tier: 'COMMON', labelKo: '커먼', color: '#8896A6', glow: 'rgba(136, 150, 166, 0.25)', score };
}
