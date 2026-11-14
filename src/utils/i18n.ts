import { ACCESSORY_JEWELRY_CATALOG } from '../shared/accessoryJewelryCatalog.js';
import { SEASONAL_120_CATALOG } from '../shared/seasonal120Catalog.js';

export type LangCode = 'ko' | 'en';

const LANG_STORAGE_KEY = 'ainventory_lang';
const HANGUL_REGEX = /[\uAC00-\uD7A3\u3131-\u318E]/;

export function syncDocumentLang(lang: string): LangCode {
  const next: LangCode = lang === 'en' ? 'en' : 'ko';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next;
  }
  return next;
}

export function getStoredLang(): LangCode {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === 'en' || saved === 'ko') {
        return syncDocumentLang(saved);
      }
    }
  } catch {
    // ignore storage errors
  }
  return syncDocumentLang('ko');
}

export function setStoredLang(lang: string): LangCode {
  const next = syncDocumentLang(lang);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    }
  } catch {
    // ignore
  }
  return next;
}

/**
 * Concise inline bilingual selector (`ko` vs `en`).
 */
export function tx(lang: string | undefined | null, ko: string, en: string): string {
  return lang === 'en' ? en : ko;
}

const KO_DICT = {
  brandTitle: 'A inventory',
  brandSub: 'Minimal Digital Wardrobe & Studio',
  brandSubtitle: '디지털 옷장 · 스튜디오',
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
  editProfileBtn: '사진 · 피부톤 · 체형 설정',
  profileBtn: '프로필',
  closetPersonal: '내 옷장',
  closetHusband: '남편 옷장',
  closetWife: '와이프 옷장',
  closetAll: '전체 옷장',
  myClosetFallback: '나만의 디지털 옷장',
  loginTitle: '로그인',
  loginSubtitle: '미니멀 디지털 옷장 & 스마트 피팅 스튜디오',
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
  brandSub: 'Minimal Digital Wardrobe & Studio',
  brandSubtitle: 'Digital Wardrobe · Studio',
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
  editProfileBtn: 'Photo, Skin Tone & Body Profile',
  profileBtn: 'Profile',
  closetPersonal: 'My Closet',
  closetHusband: 'Husband Closet',
  closetWife: 'Wife Closet',
  closetAll: 'All Closets',
  myClosetFallback: 'My Personal Closet',
  loginTitle: 'Sign In',
  loginSubtitle: 'Minimal Digital Wardrobe & Smart Fitting Studio',
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

// ============================================================================
// Dynamic Content Localization (Garments, Brands, Colors, Memos, Outfits, Logs)
// ============================================================================

const COLOR_KO_TO_EN: Readonly<Record<string, string>> = {
  '카키/올리브': 'Khaki Olive',
  '머스타드 골드': 'Mustard Gold',
  '버건디 와인': 'Burgundy Wine',
  '라벤더 그레이': 'Lavender Gray',
  '올리브 그린': 'Olive Green',
  '더스티 로즈': 'Dusty Rose',
  '코랄 피치': 'Coral Peach',
  스카이블루: 'Sky Blue',
  '스카이 블루': 'Sky Blue',
  테라코타: 'Terracotta',
  아이보리: 'Ivory',
  오트밀: 'Oatmeal',
  버건디: 'Burgundy',
  머스타드: 'Mustard',
  올리브: 'Olive',
  화이트: 'White',
  베이지: 'Beige',
  브라운: 'Brown',
  네이비: 'Navy',
  인디고: 'Indigo',
  그레이: 'Gray',
  차콜: 'Charcoal',
  블랙: 'Black',
  크림: 'Cream',
  카멜: 'Camel',
  카키: 'Khaki',
  코랄: 'Coral',
  코냑: 'Cognac',
  실버: 'Silver',
  골드: 'Gold',
  브론즈: 'Bronze',
  로즈골드: 'Rose Gold',
  '로즈 골드': 'Rose Gold',
  플래티넘: 'Platinum',
  진주: 'Pearl',
  오닉스: 'Onyx',
  '포레스트 그린': 'Forest Green',
  에스프레소: 'Espresso',
  토프: 'Taupe',
  샴페인: 'Champagne',
};

const COLOR_PREFIXES_SORTED = Object.keys(COLOR_KO_TO_EN).sort((a, b) => b.length - a.length);

const CATALOG_GARMENT_KO_TO_EN: Record<string, string> = {};
for (const item of SEASONAL_120_CATALOG) {
  if (item.name && item.name_en) {
    CATALOG_GARMENT_KO_TO_EN[item.name] = item.name_en;
  }
}
for (const item of ACCESSORY_JEWELRY_CATALOG) {
  if (item.name && item.name_en) {
    CATALOG_GARMENT_KO_TO_EN[item.name] = item.name_en;
  }
}

const EXACT_GARMENT_KO_TO_EN: Readonly<Record<string, string>> = {
  ...CATALOG_GARMENT_KO_TO_EN,
  // Sample closet & Sample capsule catalog (`server/db.js`, `server/api.js`, `standaloneFallback.ts`)
  '발수 코튼 개버딘 트렌치코트': 'Water-Repellent Cotton Gabardine Trench Coat',
  '발수 코튼 싱글 맥 트렌치코트': 'Water-Repellent Cotton Single Mac Trench Coat',
  '더블 페이스 캐시미어 테일러드 코트': 'Double-Faced Cashmere Tailored Coat',
  '더블 페이스 캐시미어 핸드메이드 코트': 'Double-Faced Cashmere Handmade Coat',
  '발마칸 캐시미어 롱코트': 'Balmacaan Cashmere Long Coat',
  '테일러드 버진 울 싱글 블레이저': 'Tailored Virgin Wool Single Blazer',
  '테일러드 버진 울 블레이저': 'Tailored Virgin Wool Blazer',
  '테일러드 싱글 울 블레이저': 'Tailored Single Wool Blazer',
  '파인 메리노 크루넥 니트': 'Fine Merino Crewneck Knit',
  '파인 메리노 울 크루넥 니트': 'Fine Merino Wool Crewneck Knit',
  '아이보리 메리노 크루넥 니트': 'Ivory Merino Crewneck Knit',
  '캐시미어 블렌드 라운드 스웨터': 'Cashmere-Blend Crewneck Sweater',
  '수피마 코튼 옥스포드 셔츠': 'Supima Cotton Oxford Shirt',
  '수피마 코튼 옥스포드 화이트 셔츠': 'Supima Cotton White Oxford Shirt',
  '크리스프 코튼 옥스포드 셔츠': 'Crisp Cotton Oxford Shirt',
  '크리스프 포플린 옥스포드 셔츠': 'Crisp Poplin Oxford Shirt',
  '오트밀 캐시미어 라운드 니트': 'Oatmeal Cashmere Crewneck Knit',
  '오트밀 캐시미어 터틀넥 니트': 'Oatmeal Cashmere Turtleneck Knit',
  '소프트 캐시미어 터틀넥 풀오버': 'Soft Cashmere Turtleneck Pullover',
  '릴랙스핏 포플린 화이트 셔츠': 'Relaxed-Fit White Poplin Shirt',
  '울 블렌드 원턱 와이드 슬랙스': 'Wool-Blend One-Tuck Wide Slacks',
  '차콜 테이퍼드 울 슬랙스': 'Charcoal Tapered Wool Slacks',
  '하이웨이스트 울 와이드 팬츠': 'High-Waisted Wool Wide Pants',
  '셀비지 스트레이트 데님': 'Selvedge Straight Denim',
  '셀비지 스트레이트 데님 팬츠': 'Selvedge Straight Denim Jeans',
  '셀비지 스트레이트 인디고 데님': 'Selvedge Straight Indigo Denim',
  '코튼 트윌 테이퍼드 치노 팬츠': 'Cotton Twill Tapered Chino Pants',
  '버뮤다 플리츠 하프 팬츠': 'Pleated Bermuda Shorts',
  '미니멀 레더 코트 스니커즈': 'Minimal Leather Court Sneakers',
  '미니멀 풀그레인 레더 코트 스니커즈': 'Minimal Full-Grain Leather Court Sneakers',
  '미니멀 화이트 레더 스니커즈': 'Minimal White Leather Sneakers',
  '미니멀 화이트 스웨이드코트 스니커즈': 'Minimal White Suede Court Sneakers',
  '클린 화이트 레더 스니커즈': 'Clean White Leather Sneakers',
  '클래식 스무스 레더 페니 로퍼': 'Classic Smooth Leather Penny Loafers',
  '클래식 굿이어웰트 페니 로퍼': 'Classic Goodyear-Welted Penny Loafers',
  '발수 스무스 레더 첼시 부츠': 'Water-Repellent Smooth Leather Chelsea Boots',
  '블랙 레더 페니 로퍼': 'Black Leather Penny Loafers',
  '이탈리안 풀그레인 레더 서류가방': 'Italian Full-Grain Leather Briefcase',
  '페블 레더 미니멀 쇼퍼 토트백': 'Pebbled Leather Minimal Shopper Tote',
  '페블 레더 쇼퍼 토트백': 'Pebbled Leather Shopper Tote',
  '미니멀 레더 크로스 & 토트백': 'Minimal Leather Crossbody & Tote Bag',
  '코냑 새들 크로스백': 'Cognac Saddle Crossbody Bag',
  '퓨어 캐시미어 프린지 머플러': 'Pure Cashmere Fringed Scarf',
  '캐시미어 프린지 머플러': 'Cashmere Fringed Scarf',
  '울 니트 쁘띠 스카프': 'Wool Knit Petit Scarf',
  '실크 자카드 클래식 네이비 타이': 'Classic Silk Jacquard Navy Tie',
  '실크 자카드 클래식 타이': 'Classic Silk Jacquard Tie',
  '캐시미어 골지 비니': 'Cashmere Ribbed Beanie',
  '코튼 트윌 아틀리에 볼캡': 'Cotton Twill Atelier Ball Cap',
  '코튼 트윌 볼캡': 'Cotton Twill Ball Cap',
  '메리노 울 프렌치 베레모': 'Merino Wool French Beret',
  '나파 레더 캐시미어 라이닝 장갑': 'Nappa Leather Cashmere-Lined Gloves',
  '터치스크린 울 니트 글러브': 'Touchscreen Wool Knit Gloves',
  '메리노 울 골지 크루 삭스': 'Merino Wool Ribbed Crew Socks',
  '코마 코튼 데일리 앵클 삭스': 'Combed Cotton Daily Ankle Socks',
  '심리스 모달 에어 이너탑': 'Seamless Modal Air Base Top',
  '심리스 립 모달 발열 이너탑': 'Seamless Ribbed Modal Thermal Top',
  '브리즈 수피마 코튼 에어 이너웨어': 'Supima Cotton Air Base Layer',
  '경량 올리브 퀼팅 라이너 자켓': 'Lightweight Olive Quilted Liner Jacket',
  '경량 퀼팅 유틸리티 자켓': 'Lightweight Quilted Utility Jacket',
  '클래식 벨티드 맥 코트': 'Classic Belted Mac Coat',
  '발수 개버딘 싱글 트렌치코트': 'Water-Repellent Gabardine Trench Coat',
  '구스다운 경량 스탠드넥 패딩': 'Lightweight Goose-Down Stand-Collar Puffer',
  '메리노 울 V넥 버튼 가디건': 'Merino Wool V-Neck Button Cardigan',
  '헤비웨이트 수피마 코튼 티셔츠': 'Heavyweight Supima Cotton T-Shirt',
  '프렌치 테리 세미오버 후드 스웨트': 'French Terry Relaxed Hoodie',
  '실크 크레이프 드레이프 셔츠': 'Silk Crepe Draped Shirt',
  '벨티드 미디 셔츠 원피스': 'Belted Midi Shirt Dress',
  '메리노 니트 롱 원피스': 'Merino Knit Maxi Dress',
  '스틸 케이스 레더 스트랩 드레스 워치': 'Steel-Case Leather Strap Dress Watch',
  '이탈리안 카프스킨 실버 버클 벨트': 'Italian Calfskin Silver-Buckle Belt',
  '아세테이트 아틀리에 아이웨어': 'Acetate Atelier Eyewear',
  '네이비 버진 울 코트': 'Navy Virgin Wool Coat',
  '매장 촬영 · 다크 네이비 크루넥 니트': 'In-Store Scan · Dark Navy Crewneck Knit',
  '매장 촬영 새 옷': 'In-Store Scanned Item',
  '오프라인 매장 촬영 아이템': 'In-Store Scanned Garment',
  '신규 등록 의류': 'New Garment',
  '새 아이템': 'New Garment',
};

const BRAND_KO_TO_EN: Readonly<Record<string, string>> = {
  'Valextra 무드': 'Valextra Style',
  'Polène 무드': 'Polène Style',
  'Johnstons of Elgin 무드': 'Johnstons of Elgin Style',
  '커먼프로젝트 무드': 'Common Projects Style',
  'TOTEME 무드': 'TOTEME Style',
  '무신사 스탠다드': 'Musinsa Standard',
  '폴로 랄프로렌': 'Polo Ralph Lauren',
  '유니클로 U': 'Uniqlo U',
  유니클로: 'Uniqlo',
  '리바이스 프리미엄': "Levi's Premium",
  리바이스: "Levi's",
  버윅: 'Berwick',
  보세: 'Indie Label',
};

const OUTFIT_TITLE_KO_TO_EN: Readonly<Record<string, string>> = {
  '단정한 간절기 트렌치 출근룩': 'Clean Mid-Season Trench Commute',
  '주말 미니멀 네이비 & 데님': 'Weekend Minimal Navy & Denim',
  '어텀 올리브 & 크림 산책룩': 'Autumn Olive & Cream Stroll',
  '간절기 캐시미어 코트 출근룩': 'Mid-Season Cashmere Coat Commute',
  '비 예보 대비 단정한 출근 코디': 'Rain-Ready Tailored Commute Look',
  '강풍 대비 방풍 아우터 출근 코디': 'Wind-Resistant Outerwear Office Look',
  '일교차 대응 깔끔한 오피스룩': 'Layered Smart Office Look',
  '바람 부는 날 포근한 레이어드 데일리룩': 'Cozy Windproof Layered Daily Look',
  '하루 종일 편안하고 정돈된 데일리룩': 'Effortless Refined Daily Look',
  '옷장 속 숨은 아이템을 깨우는 기분 전환룩': 'Fresh Wardrobe Rediscovery Look',
  '오프라인 코디': 'Saved Outfit',
  '데일리 룩': 'Daily Look',
  데일리룩: 'Daily Look',
  출근룩: 'Office Look',
  '주말 데이트': 'Weekend Date',
  '실시간 내일 예보': 'Live Forecast',
  '선선한 가을 맑음': 'Crisp Clear',
  '강풍 부는 날': 'Windy',
  '비 오는 쌀쌀한 날': 'Cool Rain',
  '포근한 봄 · 초여름': 'Mild Spring',
  '영하권 겨울 칼바람': 'Freezing Cold',
};

const MEMO_KO_TO_EN: Readonly<Record<string, string>> = {
  '샘플 체험용 캡슐 아틀리에 아이템': 'Sample Atelier Capsule Item',
  '샘플 캡슐에서 가져온 아이템': 'Imported from Sample Capsule',
  '오프라인 쇼핑 판독 후 구매 등록': 'Added after In-Store Duplicate Check',
  '왼손 그립 소켓 진자 물리(Pendulum Physics)가 적용된 비스포크 브리프케이스':
    'Bespoke Italian full-grain leather briefcase',
  '보행 리듬에 따라 경쾌하게 흔들리는 쇼퍼 토트백':
    'Minimal pebbled leather shopper tote for everyday carry',
  '소프트 클로스 지글 피직스가 적용된 캐시미어 머플러':
    'Pure cashmere fringed scarf with soft natural drape',
  '간절기 출근 및 비 오는 날 주력 아우터 (생활 발수 코팅)':
    'Go-to mid-season commute & rainy-day outerwear (water-repellent finish)',
  '미팅 및 주말 레스토랑 외출용 미니멀 블레이저':
    'Minimal tailored blazer for meetings and dinner outings',
  '단품으로도 셔츠 레이어드용으로도 가장 손이 자주 가는 기본 니트':
    'Essential knit worn solo or layered over an Oxford shirt',
  '작년 세일 때 중복 구매해서 옷장 서랍에 잠자고 있는 니트':
    'Archive crewneck sweater kept as a backup layer',
  '사계절 내내 입는 에센셜 옥스포드 셔츠': 'All-season essential crisp cotton Oxford shirt',
  '추운 날 블레이저나 코트 이너로 착용': 'Warm base layer under blazers and winter coats',
  '구김이 적고 실루엣이 깔끔한 주력 슬랙스': 'Wrinkle-resistant tailored wide slacks',
  '주말 데일리 착용률 1위 청바지': 'Most-worn weekend selvedge straight denim',
  '앞코 스웨이드 소재라 비 오는 날은 피하는 편':
    'Suede toe cap — best reserved for dry weather',
  '비 오는 날이나 포멀 출근룩에 든든한 가죽 로퍼':
    'Reliable smooth leather loafers for formal commutes and rainy days',
  '가볍고 따뜻해서 산책 및 주말 마실용으로 최고':
    'Lightweight warm quilted liner for weekend walks',
  '남편 맥코트와 시밀러룩으로 입기 좋은 베이지 코트':
    'Classic belted beige mac coat for effortless tonal styling',
  '목 따가움 없는 포근한 오트밀 크림 니트': 'Ultra-soft itch-free oatmeal cashmere pullover',
  '단독 및 니트 레이어드 활용도 높은 셔츠': 'Versatile poplin shirt for solo wear or knit layering',
  '다리가 길어 보이는 차콜 와이드 슬랙스': 'Elongating high-waisted charcoal wool trousers',
  '어디에나 잘 어울리는 데일리 스니커즈': 'Clean white leather sneakers that pair with everything',
  '가볍게 동네 카페 외출': 'Neighborhood Cafe Outing',
  '와이프랑 성수동 쇼핑 데이트': 'Weekend Shopping Date in Seongsu',
  '발수 트렌치코트 덕분에 쾌적했던 출근길': 'Dry Commute in Water-Repellent Trench',
  '올림픽공원 산책 코디': 'Olympic Park Walk',
  '일교차 큰 날 실패 없는 베이지 트렌치 + 화이트 셔츠 + 차콜 슬랙스 조합':
    'Foolproof beige trench, white shirt, and charcoal slacks for transitional weather',
  '깔끔하고 편안한 주말 브런치 코디': 'Clean and relaxed weekend brunch outfit',
  '올리브 퀼팅 자켓에 포근한 크림 니트 매치': 'Olive quilted jacket paired with a cozy cream knit',
};

const USER_NAME_KO_TO_EN: Readonly<Record<string, string>> = {
  남편: 'Husband',
  '남편 (준호)': 'Husband (Junho)',
  와이프: 'Wife',
  '와이프 (서연)': 'Wife (Seoyeon)',
  '어드민 (남편)': 'Admin',
  어드민: 'Admin',
  'Apple 사용자': 'Apple Member',
  사용자: 'Member',
  신규회원: 'Member',
  모바일E2E테스터: 'Mobile E2E Tester',
};

const SEASON_KO_TO_EN: Readonly<Record<string, string>> = {
  봄: 'Spring',
  여름: 'Summer',
  가을: 'Autumn',
  겨울: 'Winter',
  '봄/가을': 'Spring/Autumn',
  사계절: 'All-Season',
};

const PERSONAL_COLOR_KO_TO_EN: Readonly<Record<string, string>> = {
  '봄 웜톤': 'Spring Warm',
  '여름 쿨톤': 'Summer Cool',
  '가을 웜톤': 'Autumn Warm',
  '겨울 쿨톤': 'Winter Cool',
  '봄 웜 라이트': 'Spring Warm Light',
  '봄 웜 브라이트': 'Spring Warm Bright',
  '봄 웜 트루': 'Spring Warm True',
  '여름 쿨 라이트': 'Summer Cool Light',
  '여름 쿨 뮤트': 'Summer Cool Mute',
  '여름 쿨 트루': 'Summer Cool True',
  '가을 웜 뮤트': 'Autumn Warm Mute',
  '가을 웜 딥': 'Autumn Warm Deep',
  '가을 웜 트루': 'Autumn Warm True',
  '겨울 쿨 브라이트': 'Winter Cool Bright',
  '겨울 쿨 딥': 'Winter Cool Deep',
  '겨울 쿨 다크': 'Winter Cool Dark',
  '겨울 쿨 트루': 'Winter Cool True',
};

// Ordered longest-first fashion & UI glossary for compositional Korean -> English translation
const FASHION_PHRASE_PAIRS: ReadonlyArray< readonly [string, string] > = [
  ['카키/올리브', 'Khaki Olive'],
  ['머스타드 골드', 'Mustard Gold'],
  ['버건디 와인', 'Burgundy Wine'],
  ['라벤더 그레이', 'Lavender Gray'],
  ['올리브 그린', 'Olive Green'],
  ['더스티 로즈', 'Dusty Rose'],
  ['코랄 피치', 'Coral Peach'],
  ['스카이블루', 'Sky Blue'],
  ['더블 페이스', 'Double-Faced'],
  ['풀그레인 레더', 'Full-Grain Leather'],
  ['이탈리안 카프스킨', 'Italian Calfskin'],
  ['이탈리안', 'Italian'],
  ['굿이어웰트', 'Goodyear-Welted'],
  ['스무스 레더', 'Smooth Leather'],
  ['나파 레더', 'Nappa Leather'],
  ['페블 레더', 'Pebbled Leather'],
  ['수피마 코튼', 'Supima Cotton'],
  ['코마 코튼', 'Combed Cotton'],
  ['코튼 트윌', 'Cotton Twill'],
  ['파인 메리노 울', 'Fine Merino Wool'],
  ['파인 메리노', 'Fine Merino'],
  ['메리노 울', 'Merino Wool'],
  ['버진 울', 'Virgin Wool'],
  ['울 블렌드', 'Wool-Blend'],
  ['캐시미어 블렌드', 'Cashmere-Blend'],
  ['퓨어 캐시미어', 'Pure Cashmere'],
  ['캐시미어 라이닝', 'Cashmere-Lined'],
  ['실크 크레이프', 'Silk Crepe'],
  ['실크 자카드', 'Silk Jacquard'],
  ['프렌치 테리', 'French Terry'],
  ['헤비웨이트', 'Heavyweight'],
  ['하프 팬츠', 'Shorts'],
  ['데님 팬츠', 'Denim Jeans'],
  ['치노 팬츠', 'Chino Pants'],
  ['와이드 슬랙스', 'Wide Slacks'],
  ['와이드 팬츠', 'Wide Pants'],
  ['셔츠 원피스', 'Shirt Dress'],
  ['롱 원피스', 'Maxi Dress'],
  ['크로스 & 토트백', 'Crossbody & Tote Bag'],
  ['쇼퍼 토트백', 'Shopper Tote'],
  ['드레스 워치', 'Dress Watch'],
  ['레더 스트랩', 'Leather Strap'],
  ['스틸 케이스', 'Steel-Case'],
  ['실버 버클', 'Silver-Buckle'],
  ['크루 삭스', 'Crew Socks'],
  ['앵클 삭스', 'Ankle Socks'],
  ['페니 로퍼', 'Penny Loafers'],
  ['첼시 부츠', 'Chelsea Boots'],
  ['코트 스니커즈', 'Court Sneakers'],
  ['스웨이드코트', 'Suede Court'],
  ['트렌치코트', 'Trench Coat'],
  ['롱코트', 'Long Coat'],
  ['맥 코트', 'Mac Coat'],
  ['맥코트', 'Mac Coat'],
  ['오버코트', 'Overcoat'],
  ['핸드메이드', 'Handmade'],
  ['트렌치', 'Trench'],
  ['블레이저', 'Blazer'],
  ['가디건', 'Cardigan'],
  ['카디건', 'Cardigan'],
  ['풀오버', 'Pullover'],
  ['스웨터', 'Sweater'],
  ['스웨트', 'Sweatshirt'],
  ['맨투맨', 'Sweatshirt'],
  ['후드', 'Hoodie'],
  ['터틀넥', 'Turtleneck'],
  ['크루넥', 'Crewneck'],
  ['라운드', 'Crewneck'],
  ['스탠드넥', 'Stand-Collar'],
  ['하이웨이스트', 'High-Waisted'],
  ['세미오버', 'Relaxed'],
  ['릴랙스핏', 'Relaxed-Fit'],
  ['스트레이트', 'Straight'],
  ['테이퍼드', 'Tapered'],
  ['테일러드', 'Tailored'],
  ['싱글', 'Single'],
  ['원턱', 'One-Tuck'],
  ['플리츠', 'Pleated'],
  ['벨티드', 'Belted'],
  ['프린지', 'Fringed'],
  ['골지', 'Ribbed'],
  ['심리스', 'Seamless'],
  ['발열', 'Thermal'],
  ['발수', 'Water-Repellent'],
  ['방풍', 'Windproof'],
  ['경량', 'Lightweight'],
  ['구스다운', 'Goose-Down'],
  ['퀼팅', 'Quilted'],
  ['셀비지', 'Selvedge'],
  ['개버딘', 'Gabardine'],
  ['옥스포드', 'Oxford'],
  ['포플린', 'Poplin'],
  ['캐시미어', 'Cashmere'],
  ['메리노', 'Merino'],
  ['아세테이트', 'Acetate'],
  ['모달', 'Modal'],
  ['스웨이드', 'Suede'],
  ['실크', 'Silk'],
  ['린넨', 'Linen'],
  ['데님', 'Denim'],
  ['코튼', 'Cotton'],
  ['레더', 'Leather'],
  ['가죽', 'Leather'],
  ['나일론', 'Nylon'],
  ['울', 'Wool'],
  ['립', 'Ribbed'],
  ['서류가방', 'Briefcase'],
  ['브리프케이스', 'Briefcase'],
  ['크로스백', 'Crossbody Bag'],
  ['토트백', 'Tote Bag'],
  ['토트', 'Tote'],
  ['가방', 'Bag'],
  ['머플러', 'Scarf'],
  ['스카프', 'Scarf'],
  ['넥타이', 'Tie'],
  ['타이', 'Tie'],
  ['베레모', 'Beret'],
  ['버킷햇', 'Bucket Hat'],
  ['볼캡', 'Ball Cap'],
  ['비니', 'Beanie'],
  ['모자', 'Cap'],
  ['아이웨어', 'Eyewear'],
  ['선글라스', 'Sunglasses'],
  ['안경', 'Glasses'],
  ['워치', 'Watch'],
  ['시계', 'Watch'],
  ['벨트', 'Belt'],
  ['장갑', 'Gloves'],
  ['글러브', 'Gloves'],
  ['이너웨어', 'Base Layer'],
  ['이너탑', 'Base Top'],
  ['삭스', 'Socks'],
  ['양말', 'Socks'],
  ['스니커즈', 'Sneakers'],
  ['로퍼', 'Loafers'],
  ['부츠', 'Boots'],
  ['슈즈', 'Shoes'],
  ['신발', 'Shoes'],
  ['슬랙스', 'Slacks'],
  ['청바지', 'Jeans'],
  ['팬츠', 'Pants'],
  ['바지', 'Trousers'],
  ['스커트', 'Skirt'],
  ['쇼츠', 'Shorts'],
  ['버뮤다', 'Bermuda'],
  ['원피스', 'Dress'],
  ['티셔츠', 'T-Shirt'],
  ['블라우스', 'Blouse'],
  ['셔츠', 'Shirt'],
  ['니트', 'Knit'],
  ['패딩', 'Puffer'],
  ['자켓', 'Jacket'],
  ['재킷', 'Jacket'],
  ['라이너', 'Liner'],
  ['유틸리티', 'Utility'],
  ['코트', 'Coat'],
  ['아우터', 'Outerwear'],
  ['상의', 'Top'],
  ['하의', 'Bottoms'],
  ['액세서리', 'Accessory'],
  ['미니멀', 'Minimal'],
  ['클래식', 'Classic'],
  ['크리스프', 'Crisp'],
  ['소프트', 'Soft'],
  ['클린', 'Clean'],
  ['드레이프', 'Draped'],
  ['프렌치', 'French'],
  ['쁘띠', 'Petit'],
  ['미디', 'Midi'],
  ['아틀리에', 'Atelier'],
  ['터치스크린', 'Touchscreen'],
  ['브리즈', 'Breeze'],
  ['에어', 'Air'],
  ['버튼', 'Button'],
  ['새들', 'Saddle'],
  ['데일리', 'Daily'],
  ['출근룩', 'Office Look'],
  ['오피스룩', 'Office Look'],
  ['산책룩', 'Walk Look'],
  ['출근', 'Commute'],
  ['주말', 'Weekend'],
  ['코디', 'Look'],
  ['무드', 'Style'],
  ['테라코타', 'Terracotta'],
  ['아이보리', 'Ivory'],
  ['오트밀', 'Oatmeal'],
  ['버건디', 'Burgundy'],
  ['머스타드', 'Mustard'],
  ['올리브', 'Olive'],
  ['화이트', 'White'],
  ['베이지', 'Beige'],
  ['브라운', 'Brown'],
  ['네이비', 'Navy'],
  ['인디고', 'Indigo'],
  ['그레이', 'Gray'],
  ['차콜', 'Charcoal'],
  ['블랙', 'Black'],
  ['크림', 'Cream'],
  ['카멜', 'Camel'],
  ['카키', 'Khaki'],
  ['코랄', 'Coral'],
  ['코냑', 'Cognac'],
  ['서울', 'Seoul'],
  ['분당', 'Bundang'],
  ['성남', 'Seongnam'],
  ['인천', 'Incheon'],
  ['송도', 'Songdo'],
  ['대전', 'Daejeon'],
  ['대구', 'Daegu'],
  ['부산', 'Busan'],
  ['제주', 'Jeju'],
  ['도쿄', 'Tokyo'],
  ['뉴욕', 'New York'],
  ['파리', 'Paris'],
];

// Standard Revised Romanization of Korean (국어의 로마자 표기법) fallback for arbitrary proper nouns
const RR_INITIALS = [
  'g',
  'kk',
  'n',
  'd',
  'tt',
  'r',
  'm',
  'b',
  'pp',
  's',
  'ss',
  '',
  'j',
  'jj',
  'ch',
  'k',
  't',
  'p',
  'h',
];
const RR_MEDIALS = [
  'a',
  'ae',
  'ya',
  'yae',
  'eo',
  'e',
  'yeo',
  'ye',
  'o',
  'wa',
  'wae',
  'oe',
  'yo',
  'u',
  'wo',
  'we',
  'wi',
  'yu',
  'eu',
  'ui',
  'i',
];
const RR_FINALS = [
  '',
  'k',
  'k',
  'k',
  'n',
  'n',
  'n',
  't',
  'l',
  'k',
  'm',
  'p',
  'l',
  'l',
  'p',
  'l',
  'm',
  'p',
  'p',
  't',
  't',
  'ng',
  't',
  't',
  'k',
  't',
  'p',
  't',
];

function romanizeHangulWord(word: string): string {
  let out = '';
  for (let i = 0; i < word.length; i += 1) {
    const code = word.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const offset = code - 0xac00;
      const initial = Math.floor(offset / 588);
      const medial = Math.floor((offset % 588) / 28);
      const final = offset % 28;
      out += (RR_INITIALS[initial] ?? '') + (RR_MEDIALS[medial] ?? '') + (RR_FINALS[final] ?? '');
    } else if (code >= 0x3131 && code <= 0x318e) {
      // standalone jamo omitted cleanly
    } else {
      out += word[i];
    }
  }
  if (!out) return '';
  return out.charAt(0).toUpperCase() + out.slice(1);
}

function replaceKoreanPhrasesAndRomanize(raw: string): string {
  let text = raw;
  for (const [ko, en] of FASHION_PHRASE_PAIRS) {
    if (text.includes(ko)) {
      text = text.split(ko).join(` ${en} `);
    }
  }
  if (HANGUL_REGEX.test(text)) {
    text = text.replace(/[\uAC00-\uD7A3\u3131-\u318E]+/g, (match) => romanizeHangulWord(match));
  }
  return text.replace(/\s+/g, ' ').trim();
}

export function localizeColorName(
  colorName: string | undefined | null,
  lang: string = 'ko'
): string {
  const raw = String(colorName ?? '').trim();
  if (!raw || lang !== 'en' || !HANGUL_REGEX.test(raw)) return raw;
  if (Object.hasOwn(COLOR_KO_TO_EN, raw)) {
    return COLOR_KO_TO_EN[raw];
  }
  return replaceKoreanPhrasesAndRomanize(raw);
}

export function localizeBrandName(
  brand: string | undefined | null,
  lang: string = 'ko'
): string {
  const raw = String(brand ?? '').trim();
  if (!raw || lang !== 'en' || !HANGUL_REGEX.test(raw)) return raw;
  if (Object.hasOwn(BRAND_KO_TO_EN, raw)) {
    return BRAND_KO_TO_EN[raw];
  }
  const moodStripped = raw.replace(/\s*무드$/, ' Style');
  if (!HANGUL_REGEX.test(moodStripped)) {
    return moodStripped.trim();
  }
  return replaceKoreanPhrasesAndRomanize(moodStripped);
}

export function localizeGarmentName(
  name: string | undefined | null,
  lang: string = 'ko'
): string {
  const raw = String(name ?? '').trim();
  if (!raw || lang !== 'en' || !HANGUL_REGEX.test(raw)) return raw;

  // 1. Exact seed/catalog match
  if (Object.hasOwn(EXACT_GARMENT_KO_TO_EN, raw)) {
    return EXACT_GARMENT_KO_TO_EN[raw];
  }

  // 2. Statistical wardrobe generator pattern: `${swatch.name} ${tpl.nameKo}`
  for (const colorKo of COLOR_PREFIXES_SORTED) {
    if (raw.startsWith(`${colorKo} `)) {
      const rest = raw.slice(colorKo.length + 1).trim();
      const colorEn = COLOR_KO_TO_EN[colorKo];
      if (Object.hasOwn(EXACT_GARMENT_KO_TO_EN, rest)) {
        const restEn = EXACT_GARMENT_KO_TO_EN[rest];
        // Avoid duplicate leading color word if template already starts with it
        if (restEn.toLowerCase().startsWith(colorEn.toLowerCase())) {
          return restEn;
        }
        return `${colorEn} ${restEn}`;
      }
      return `${colorEn} ${replaceKoreanPhrasesAndRomanize(rest)}`.replace(/\s+/g, ' ').trim();
    }
  }

  // 3. Phrase glossary + clean Romanization safety net
  return replaceKoreanPhrasesAndRomanize(raw);
}

export function localizeGarmentMemo(
  memo: string | undefined | null,
  lang: string = 'ko'
): string {
  const raw = String(memo ?? '').trim();
  if (!raw || lang !== 'en' || !HANGUL_REGEX.test(raw)) return raw;

  if (Object.hasOwn(MEMO_KO_TO_EN, raw)) {
    return MEMO_KO_TO_EN[raw];
  }

  // Statistical wardrobe curation note pattern:
  // `${ageGroup} 연령대 통계 벤치마크(${primarySeason}) & ${pcLabel} 퍼스널컬러 맞춤 큐레이션`
  const benchMatch = raw.match(
    /^(\S+)\s*연령대 통계 벤치마크\(([^)]+)\)\s*&\s*(.+?)\s*퍼스널컬러 맞춤 큐레이션$/
  );
  if (benchMatch) {
    const [, ageGroup, seasonKo, pcKo] = benchMatch;
    const seasonEn = SEASON_KO_TO_EN[seasonKo.trim()] || replaceKoreanPhrasesAndRomanize(seasonKo);
    const pcEn =
      PERSONAL_COLOR_KO_TO_EN[pcKo.trim()] || replaceKoreanPhrasesAndRomanize(pcKo.trim());
    return `Curated for ${ageGroup} ${seasonEn} Capsule & ${pcEn} Palette`;
  }

  return replaceKoreanPhrasesAndRomanize(raw);
}

export function localizeOutfitTitle(
  title: string | undefined | null,
  lang: string = 'ko'
): string {
  const raw = String(title ?? '').trim();
  if (!raw || lang !== 'en' || !HANGUL_REGEX.test(raw)) return raw;

  if (Object.hasOwn(OUTFIT_TITLE_KO_TO_EN, raw)) {
    return OUTFIT_TITLE_KO_TO_EN[raw];
  }

  // Compound garment look title (`Item A · Item B`)
  if (raw.includes(' · ')) {
    return raw
      .split(' · ')
      .map((part) => localizeGarmentName(part, 'en'))
      .join(' · ');
  }

  const cityTomorrowMatch = raw.match(/^(.+?)\s*내일 코디$/);
  if (cityTomorrowMatch) {
    const cityEn = replaceKoreanPhrasesAndRomanize(cityTomorrowMatch[1]);
    return `${cityEn} Tomorrow Look`;
  }

  const dailyTempMatch = raw.match(/^내일\s*(-?\d+°C)\s*일교차 대응 데일리룩$/);
  if (dailyTempMatch) {
    return `Tomorrow ${dailyTempMatch[1]} Layered Daily Look`;
  }

  return replaceKoreanPhrasesAndRomanize(raw);
}

export function localizeCalendarNote(
  note: string | undefined | null,
  lang: string = 'ko'
): string {
  const raw = String(note ?? '').trim();
  if (!raw || lang !== 'en' || !HANGUL_REGEX.test(raw)) return raw;

  if (Object.hasOwn(MEMO_KO_TO_EN, raw)) {
    return MEMO_KO_TO_EN[raw];
  }
  if (Object.hasOwn(OUTFIT_TITLE_KO_TO_EN, raw)) {
    return OUTFIT_TITLE_KO_TO_EN[raw];
  }

  // Tomorrow weather log format: `${labelTitle} (${min}°/${max}°)`
  const tempSuffixMatch = raw.match(/^(.+?)\s*(\(-?\d+°\/-?\d+°\))$/);
  if (tempSuffixMatch) {
    return `${localizeOutfitTitle(tempSuffixMatch[1], 'en')} ${tempSuffixMatch[2]}`;
  }

  return replaceKoreanPhrasesAndRomanize(raw);
}

export function localizeUserName(
  displayName: string | undefined | null,
  lang: string = 'ko'
): string {
  const raw = String(displayName ?? '').trim();
  if (!raw || lang !== 'en' || !HANGUL_REGEX.test(raw)) return raw;

  if (Object.hasOwn(USER_NAME_KO_TO_EN, raw)) {
    return USER_NAME_KO_TO_EN[raw];
  }
  return replaceKoreanPhrasesAndRomanize(raw);
}

const API_ERROR_KO_TO_EN: Readonly<Record<string, string>> = {
  '아이디(이메일) 또는 비밀번호가 올바르지 않습니다.': 'Invalid username/email or password.',
  '유효한 이메일 주소를 입력해주세요.': 'Please enter a valid email address.',
  '아이디 또는 이메일을 입력해주세요.': 'Please enter your username or email.',
  '해당 계정을 찾을 수 없습니다.': 'Account not found.',
  '이미 이메일 인증이 완료된 계정입니다.': 'Email is already verified.',
  '이미 사용 중인 아이디입니다.': 'Username is already taken.',
  '이미 가입된 이메일 주소입니다.': 'Email address is already registered.',
  '이메일 인증이 완료되지 않은 계정입니다. 먼저 이메일 인증을 완료해주세요.':
    'Please complete email verification first.',
  '로그인이 필요합니다.': 'Sign-in required.',
  '옷 이름을 입력해주세요.': 'Please enter an item name.',
  '아이템을 찾을 수 없습니다.': 'Item not found.',
  '코디 이름과 의류를 선택해주세요.': 'Please select items and enter an outfit name.',
  '기본 시스템 데모 계정은 삭제할 수 없습니다.': 'System demo accounts cannot be deleted.',
};

export function localizeApiMessage(
  message: string | undefined | null,
  lang: string = 'ko'
): string {
  const raw = String(message ?? '').trim();
  if (!raw || lang !== 'en' || !HANGUL_REGEX.test(raw)) return raw;
  if (Object.hasOwn(API_ERROR_KO_TO_EN, raw)) {
    return API_ERROR_KO_TO_EN[raw];
  }
  return 'Request could not be completed. Please try again.';
}

export function localizeMaterialLabel(
  fabricOrMaterial: string | undefined | null,
  lang: string = 'ko'
): string {
  const s = String(fabricOrMaterial ?? '').trim().toLowerCase();
  const isEn = lang === 'en';
  if (!s) return isEn ? 'Atelier' : '아틀리에';
  if (/18k.*yellow|yellow.*gold|gold|골드|금/.test(s) && !/rose|로즈/.test(s)) {
    return isEn ? '18K Gold' : '18K 금';
  }
  if (/rose.*gold|로즈\s*골드/.test(s)) {
    return isEn ? 'Rose Gold' : '로즈골드';
  }
  if (/silver|925|실버|은/.test(s)) {
    return isEn ? '925 Silver' : '925 은';
  }
  if (/bronze|brass|copper|브론즈|황동|구리|동/.test(s)) {
    return isEn ? 'Bronze' : '동·브론즈';
  }
  if (/platinum|titanium|플래티넘|백금|티타늄/.test(s)) {
    return isEn ? 'Platinum' : '플래티넘';
  }
  if (/pearl|onyx|진주|오닉스/.test(s)) {
    return isEn ? 'Pearl & Onyx' : '진주·오닉스';
  }
  if (/cashmere|캐시미어/.test(s)) {
    return isEn ? 'Cashmere' : '캐시미어';
  }
  if (/wool|merino|울/.test(s)) {
    return isEn ? 'Wool' : '울';
  }
  if (/leather|calf|nappa|suede|가죽/.test(s)) {
    return isEn ? 'Leather' : '가죽';
  }
  if (/silk|실크/.test(s)) {
    return isEn ? 'Silk' : '실크';
  }
  if (/fabric|canvas|cotton|nylon|gabardine|linen|패브릭/.test(s)) {
    return isEn ? 'Fabric' : '패브릭';
  }
  if (/acetate|horn/.test(s)) {
    return isEn ? 'Acetate' : '아세테이트';
  }
  if (isEn && HANGUL_REGEX.test(s)) {
    return replaceKoreanPhrasesAndRomanize(s);
  }
  return isEn ? 'Atelier' : '패브릭';
}

