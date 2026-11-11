export type LangCode = 'ko' | 'en';

const LANG_STORAGE_KEY = 'ainventory_lang';

export function getStoredLang(): LangCode {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === 'en' || saved === 'ko') return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'ko';
}

export function setStoredLang(lang: string): LangCode {
  const next: LangCode = lang === 'en' ? 'en' : 'ko';
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    }
  } catch {
    // ignore
  }
  return next;
}

const KO_DICT = {
  brandTitle: 'A inventory',
  brandSub: 'Minimal Digital Wardrobe & 3D Studio',
  brandSubtitle: '디지털 옷장 · 3D 스튜디오',
  navWeather: '내일 날씨 코디',
  navShopping: '쇼핑 판독기',
  navShoppingBadge: '핵심',
  navWardrobe: '디지털 옷장',
  navStudio: '코디 북 · Dress Me',
  navAnalytics: '캘린더 · CPW 리포트',
  navAdmin: '어드민 · 서버 관리',
  mobileWeather: '내일코디',
  mobileWardrobe: '옷장',
  mobileShopping: '쇼핑판독',
  mobileStudio: '코디북',
  mobileAnalytics: '인사이트',
  mobileReport: '인사이트',
  logout: '로그아웃',
  editProfileBtn: '체형 · 퍼스널컬러 설정',
  profileBtn: '체형 · 프로필',
  closetPersonal: '내 옷장',
  closetHusband: '남편 옷장',
  closetWife: '와이프 옷장',
  closetAll: '전체 옷장',
  myClosetFallback: '나만의 디지털 옷장',
  loginTitle: '로그인',
  loginSubtitle: 'Apple HIG 기반 디지털 옷장 & 3D 사이버 피팅 스튜디오',
  sampleDemoCta: '가입 없이 샘플 옷장 체험하기',
  emailPlaceholder: 'name@example.com',
  requestOtpBtn: '6자리 인증번호 받기',
  verifyOtpBtn: '인증번호 확인',
  privacyTermsLabel: '서비스 이용약관 및 개인정보 처리방침 동의',
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
  closetNameLabel: '옷장 이름',
  closetNamePlaceholder: '예: 민준의 미니멀 옷장, 수현의 캡슐 옷장',
  closetSetupSubmit: '옷장 생성 및 시작하기',
  closetSaveBtn: '옷장 저장 및 시작',
} as const;

export type I18nKey = keyof typeof KO_DICT;

const EN_DICT: Record<I18nKey, string> = {
  brandTitle: 'A inventory',
  brandSub: 'Minimal Digital Wardrobe & 3D Studio',
  brandSubtitle: 'Digital Wardrobe · 3D Studio',
  navWeather: 'Tomorrow Weather Look',
  navShopping: 'Shopping Checker',
  navShoppingBadge: 'CORE',
  navWardrobe: 'Digital Wardrobe',
  navStudio: 'Lookbook · Dress Me',
  navAnalytics: 'Calendar · CPW Report',
  navAdmin: 'Admin · Server',
  mobileWeather: 'Weather',
  mobileWardrobe: 'Closet',
  mobileShopping: 'Scan',
  mobileStudio: 'Studio',
  mobileAnalytics: 'Insights',
  mobileReport: 'Insights',
  logout: 'Sign Out',
  editProfileBtn: 'Body & Personal Color',
  profileBtn: 'Body · Profile',
  closetPersonal: 'My Closet',
  closetHusband: 'Husband Closet',
  closetWife: 'Wife Closet',
  closetAll: 'All Closets',
  myClosetFallback: 'My Personal Closet',
  loginTitle: 'Sign In',
  loginSubtitle: 'Apple HIG Digital Wardrobe & 3D Cyber Fitting Studio',
  sampleDemoCta: 'Try Sample Closet Without Sign-Up',
  emailPlaceholder: 'name@example.com',
  requestOtpBtn: 'Send 6-Digit Code',
  verifyOtpBtn: 'Verify Code',
  privacyTermsLabel: 'Agree to Terms of Service & Privacy Policy',
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
  closetSetupDesc:
    'Welcome to your first login! Give your personal digital wardrobe a signature name.',
  closetNameLabel: 'Closet Name',
  closetNamePlaceholder: 'e.g., Minimal Capsule Wardrobe',
  closetSetupSubmit: 'Save Closet & Continue',
  closetSaveBtn: 'Save Closet',
};

export const I18N_DICT: Readonly<Record<LangCode, Readonly<Record<I18nKey, string>>>> = {
  ko: KO_DICT,
  en: EN_DICT,
};

export function tr(lang: string = 'ko', key: string, fallback = ''): string {
  const resolvedLang: LangCode = lang === 'en' ? 'en' : 'ko';
  const table = I18N_DICT[resolvedLang] as Record<string, string>;
  const koTable = I18N_DICT.ko as Record<string, string>;
  if (Object.hasOwn(table, key)) return table[key];
  if (Object.hasOwn(koTable, key)) return koTable[key];
  return fallback || key;
}
