const LANG_STORAGE_KEY = 'ainventory_lang';

export function getStoredLang() {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'en' || saved === 'ko') return saved;
  } catch {
    // ignore storage errors
  }
  return 'ko';
}

export function setStoredLang(lang) {
  const next = lang === 'en' ? 'en' : 'ko';
  try {
    localStorage.setItem(LANG_STORAGE_KEY, next);
  } catch {
    // ignore
  }
  return next;
}

export const I18N_DICT = {
  ko: {
    brandSub: 'Smart Wardrobe & Cyberpunk 3D Atelier',
    navWeather: '내일 날씨 코디',
    navShopping: '쇼핑 판독기',
    navShoppingBadge: '핵심',
    navWardrobe: '디지털 옷장',
    navStudio: '코디 북 · Dress Me',
    navAnalytics: '캘린더 · CPW 리포트',
    navAdmin: '어드민 · 맥미니 서버',
    mobileWeather: '내일코디',
    mobileWardrobe: '옷장',
    mobileShopping: '쇼핑판독',
    mobileStudio: '코디북',
    mobileAnalytics: '리포트',
    logout: '로그아웃',
    editProfileBtn: '체형 · 퍼스널컬러 설정',
    closetHusband: '남편 옷장',
    closetWife: '와이프 옷장',
    closetAll: '전체 옷장',
    myClosetFallback: '나만의 아틀리에 옷장',
    loginTitle: '아틀리에 로그인',
    registerTitle: '이메일 인증 회원가입',
    verifyTitle: '이메일 인증 확인',
    loginTab: '로그인',
    registerTab: '회원가입',
    usernameLabel: '아이디',
    emailLabel: '이메일 주소',
    passwordLabel: '비밀번호',
    displayNameLabel: '이름 / 닉네임',
    loginSubmit: 'A inventory 시작하기',
    registerSubmit: '가입 및 인증 링크 발급',
    verifyNowBtn: '지금 즉시 이메일 인증 완료하기',
    verifiedBadge: 'SHA-256 이메일 인증 완료',
    closetSetupTitle: '나만의 디지털 옷장 이름 설정',
    closetSetupDesc: '최초 로그인을 환영합니다! 앞으로 사용할 기본 옷장의 이름을 입력해 주세요.',
    closetNamePlaceholder: '예: 민준의 사이버 아틀리에, 수현의 캡슐 옷장',
    closetSetupSubmit: '옷장 생성 및 시작하기',
  },
  en: {
    brandSub: 'Smart Wardrobe & Cyberpunk 3D Atelier',
    navWeather: 'Tomorrow Weather Look',
    navShopping: 'Shopping Checker',
    navShoppingBadge: 'CORE',
    navWardrobe: 'Digital Wardrobe',
    navStudio: 'Lookbook · Dress Me',
    navAnalytics: 'Calendar · CPW Report',
    navAdmin: 'Admin · Mac mini Server',
    mobileWeather: 'Weather',
    mobileWardrobe: 'Closet',
    mobileShopping: 'Scan',
    mobileStudio: 'Studio',
    mobileAnalytics: 'Report',
    logout: 'Sign Out',
    editProfileBtn: 'Body & Personal Color',
    closetHusband: 'Husband Closet',
    closetWife: 'Wife Closet',
    closetAll: 'All Closets',
    myClosetFallback: 'My Personal Closet',
    loginTitle: 'Atelier Sign In',
    registerTitle: 'Email Verified Sign Up',
    verifyTitle: 'Email Verification',
    loginTab: 'Sign In',
    registerTab: 'Create Account',
    usernameLabel: 'Username',
    emailLabel: 'Email Address',
    passwordLabel: 'Password',
    displayNameLabel: 'Display Name',
    loginSubmit: 'Enter A inventory',
    registerSubmit: 'Register & Issue Verification Link',
    verifyNowBtn: 'Verify Email Account Now',
    verifiedBadge: 'SHA-256 Email Verified',
    closetSetupTitle: 'Name Your Personal Closet',
    closetSetupDesc: 'Welcome to your first login! Give your personal digital wardrobe a signature name.',
    closetNamePlaceholder: 'e.g., V’s Cyber Atelier, Capsule Wardrobe',
    closetSetupSubmit: 'Save Closet & Continue',
  },
};

export function tr(lang = 'ko', key, fallback = '') {
  const table = I18N_DICT[lang] || I18N_DICT.ko;
  return table[key] ?? I18N_DICT.ko[key] ?? fallback ?? key;
}
