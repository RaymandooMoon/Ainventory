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
    throw err;
  }
  return data;
}

export const CATEGORIES = [
  { value: 'all', label: '전체' },
  { value: 'outer', label: '아우터' },
  { value: 'top', label: '상의' },
  { value: 'bottom', label: '하의' },
  { value: 'dress', label: '원피스' },
  { value: 'shoes', label: '신발' },
  { value: 'bag', label: '가방·액세서리' },
];

export const SUBCATEGORIES_BY_CAT = {
  outer: [
    { value: 'trench', label: '트렌치 · 맥코트' },
    { value: 'blazer', label: '블레이저' },
    { value: 'jacket', label: '자켓 · 점퍼' },
    { value: 'coat', label: '울 코트' },
    { value: 'padding', label: '패딩 · 다운' },
  ],
  top: [
    { value: 'knit', label: '니트 · 스웨터' },
    { value: 'cardigan', label: '가디건' },
    { value: 'shirt', label: '셔츠 · 블라우스' },
    { value: 'tshirt', label: '티셔츠' },
    { value: 'sweatshirt', label: '맨투맨 · 후드' },
  ],
  bottom: [
    { value: 'slacks', label: '슬랙스 · 팬츠' },
    { value: 'denim', label: '데님 · 청바지' },
    { value: 'chinos', label: '치노 · 면바지' },
    { value: 'skirt', label: '스커트' },
  ],
  dress: [
    { value: 'dress', label: '원피스' },
  ],
  shoes: [
    { value: 'sneakers', label: '스니커즈' },
    { value: 'loafers', label: '로퍼 · 구두' },
    { value: 'boots', label: '부츠' },
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
  { name: '브라운', hex: '#6E4F3A' },
  { name: '테라코타', hex: '#A64B2A' },
  { name: '카키/올리브', hex: '#7B826B' },
  { name: '네이비', hex: '#1D273B' },
  { name: '인디고', hex: '#2B446B' },
  { name: '스카이블루', hex: '#8FB2CE' },
];

export function formatKRW(num) {
  const n = Number(num) || 0;
  return `₩${n.toLocaleString('ko-KR')}`;
}
