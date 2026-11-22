export type SiteLang = 'en' | 'ko';
export type SiteTheme = 'dark' | 'light';
export type LegalDocKind = 'privacy' | 'terms';
export type SiteViewId = 'home' | 'studio' | 'technology' | 'benchmarks' | 'about';

export interface SiteMeta {
  readonly brandName: string;
  readonly productName: string;
  readonly domain: string;
  readonly contactEmail: string;
  readonly founderName: string;
  readonly location: string;
  readonly copyrightYear: string;
}

export const SITE_META: SiteMeta = {
  brandName: 'Ainvtry',
  productName: 'A inventory',
  domain: 'ainvtry.com',
  contactEmail: 'raymond@ainvtry.com',
  founderName: 'Raymond Moon',
  location: 'Seoul, South Korea',
  copyrightYear: '2026',
};

export interface SiteSpecCard {
  readonly eyebrow: string;
  readonly metric: string;
  readonly title: string;
  readonly detail: string;
}

export interface SitePillarCopy {
  readonly code: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly bullets: readonly string[];
}

export interface SiteAppPreviewScreen {
  readonly id: 'outfits' | 'closet' | 'stats' | 'profile';
  readonly tabLabel: string;
  readonly title: string;
  readonly caption: string;
  readonly imageSrc: string;
  readonly imageAlt: string;
}

export interface SiteCopy {
  readonly nav: {
    readonly homeAria: string;
    readonly studio: string;
    readonly technology: string;
    readonly metrics: string;
    readonly about: string;
    readonly silkLuxury: string;
    readonly silkAurora: string;
    readonly switchToLight: string;
    readonly switchToDark: string;
    readonly switchLang: string;
    readonly opacityLabel: string;
    readonly opacityHint: string;
  };
  readonly subtabs: {
    readonly studioPreview: string;
    readonly studioAtelier: string;
    readonly studioIntel: string;
    readonly techIngestion: string;
    readonly techPrivacy: string;
    readonly aboutMission: string;
    readonly aboutFounder: string;
  };
  readonly appPreview: {
    readonly code: string;
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly badge: string;
    readonly screens: readonly SiteAppPreviewScreen[];
  };
  readonly hero: {
    readonly kicker: string;
    readonly titleLead: string;
    readonly titleAccent: string;
    readonly titleTail: string;
    readonly subtitle: string;
    readonly marbleHint: string;
    readonly primaryCta: string;
    readonly secondaryCta: string;
  };
  readonly capabilities: {
    readonly sectionCode: string;
    readonly eyebrow: string;
    readonly heading: string;
    readonly subheading: string;
    readonly badge: string;
    readonly pillars: {
      readonly atelier: SitePillarCopy;
      readonly ingestion: SitePillarCopy;
      readonly intelligence: SitePillarCopy;
      readonly privacy: SitePillarCopy;
    };
  };
  readonly interactive: {
    readonly stanceIdle: string;
    readonly stanceWalk: string;
    readonly stanceRain: string;
    readonly rigLabel: string;
    readonly rigValue: string;
    readonly rigMeta: string;
    readonly morphLabel: string;
    readonly morphValue: string;
    readonly morphMeta: string;
    readonly pccsNote: string;
    readonly beforeLabel: string;
    readonly afterLabel: string;
    readonly sliderHint: string;
    readonly ingestionBadge: string;
    readonly ingestionMeta: string;
    readonly cpwLabel: string;
    readonly cpwValue: string;
    readonly cpwDelta: string;
    readonly balanceLabel: string;
    readonly balanceValue: string;
    readonly balanceMeta: string;
    readonly dupTitle: string;
    readonly dupStatus: string;
    readonly dupDesc: string;
    readonly ootdDate: string;
    readonly ootdTitle: string;
    readonly ootdMeta: string;
    readonly topologyTitle: string;
    readonly topologySteps: readonly {
      readonly title: string;
      readonly sub: string;
    }[];
    readonly topologyFooterLeft: string;
    readonly topologyFooterRight: string;
  };
  readonly stack: {
    readonly eyebrow: string;
    readonly heading: string;
    readonly note: string;
    readonly cards: readonly SiteSpecCard[];
  };
  readonly vision: {
    readonly eyebrow: string;
    readonly heading: string;
    readonly quote: string;
    readonly body: string;
    readonly statusMvp: string;
    readonly statusRelease: string;
    readonly founderRole: string;
    readonly founderBio: string;
    readonly hqLabel: string;
    readonly hqValue: string;
    readonly domainLabel: string;
    readonly directCta: string;
  };
  readonly beta: {
    readonly eyebrow: string;
    readonly headingLine1: string;
    readonly headingLine2: string;
    readonly body: string;
    readonly cta: string;
  };
  readonly footer: {
    readonly summary: string;
    readonly rights: string;
    readonly privacy: string;
    readonly terms: string;
    readonly contact: string;
    readonly backToTop: string;
  };
  readonly legal: {
    readonly closeLabel: string;
    readonly updatedAt: string;
    readonly privacyTitle: string;
    readonly privacySections: readonly { readonly heading: string; readonly body: string }[];
    readonly termsTitle: string;
    readonly termsSections: readonly { readonly heading: string; readonly body: string }[];
  };
}

export const SITE_COPY: Readonly<Record<SiteLang, SiteCopy>> = {
  en: {
    nav: {
      homeAria: 'Return to first page',
      studio: 'Studio',
      technology: 'Architecture',
      metrics: 'Benchmarks',
      about: 'Founder',
      silkLuxury: 'Luxury',
      silkAurora: 'Aurora',
      switchToLight: 'Light',
      switchToDark: 'Dark',
      switchLang: 'KO',
      opacityLabel: 'Glass',
      opacityHint: 'Drag up for more transparency, drag down for less',
    },
    subtabs: {
      studioPreview: '01 App Preview',
      studioAtelier: '02 3D Atelier',
      studioIntel: '03 Wardrobe Intel',
      techIngestion: '01 AI Cutout & VTON',
      techPrivacy: '02 Local WASM',
      aboutMission: 'Vision',
      aboutFounder: 'Founder & Beta',
    },
    appPreview: {
      code: 'LIVE BUILD · IN DEVELOPMENT',
      eyebrow: 'REAL WORKING MVP PREVIEW',
      title: 'Inside the A inventory Mobile App',
      description:
        'Captured directly from our active React + Capacitor + Three.js build. Explore the live weather-synced outfit studio, 253-item monochrome closet, wear telemetry, and on-device facial skin-tone studio.',
      badge: 'iOS · ANDROID MVP',
      screens: [
        {
          id: 'outfits',
          tabLabel: 'Outfits',
          title: 'Multi-Angle Outfit Studio',
          caption: 'Weather-synced flatlay lookbook & 0°–360° turnaround fitting bar',
          imageSrc: '/assets/previews/app-outfits.webp',
          imageAlt: 'A inventory mobile app Outfits fitting studio screen preview',
        },
        {
          id: 'closet',
          tabLabel: 'Closet',
          title: '253-Item Digital Closet',
          caption: 'Apple HIG monochrome squircle grid with brand & wear-count badges',
          imageSrc: '/assets/previews/app-closet.webp',
          imageAlt: 'A inventory mobile app Digital Closet wardrobe grid preview',
        },
        {
          id: 'stats',
          tabLabel: 'Stats',
          title: 'Wardrobe Bento Analytics',
          caption: 'Capsule utilization ring, cumulative wears, and Cost-Per-Wear telemetry',
          imageSrc: '/assets/previews/app-stats.webp',
          imageAlt: 'A inventory mobile app Wardrobe Stats analytics preview',
        },
        {
          id: 'profile',
          tabLabel: 'Profile',
          title: 'Local Skin-Tone & Body Studio',
          caption: 'On-device MST-04 personal color mesh palette & stature calibration',
          imageSrc: '/assets/previews/app-profile.webp',
          imageAlt: 'A inventory mobile app Profile skin-tone and body morph preview',
        },
      ],
    },
    hero: {
      kicker: 'AINVTRY.COM · PRIVATE 3D WARDROBE ATELIER',
      titleLead: 'Your Private ',
      titleAccent: '3D Digital Atelier',
      titleTail: ' & AI Styling Studio',
      subtitle:
        'Tactile cloth kinematics, multi-angle Gemini Virtual Try-On, and on-device privacy-first wardrobe intelligence.',
      marbleHint: 'Roll the marble like pinball into any menu pill or tap to explore',
      primaryCta: 'Explore the Atelier',
      secondaryCta: 'Contact Founder',
    },
    capabilities: {
      sectionCode: '01 / 04 ARCHITECTURE REVEAL',
      eyebrow: 'CURATED CAPABILITIES · A INVENTORY ENGINE',
      heading: 'The 3D Haute Wardrobe Architecture',
      subheading:
        'Designed strictly as an architectural gallery. Tactile, precise, and free from cluttered dashboard noise.',
      badge: 'WORKING MVP · v0.1',
      pillars: {
        atelier: {
          code: '01 / SPATIAL KINEMATICS',
          eyebrow: 'SKELETAL CLOTH SIMULATION',
          title: '3D Fitting Atelier & Mannequin Morphing',
          description:
            'Move beyond static 2D paper dolls. Our Three.js 21-bone skeletal rig and lightweight SpringBone cloth physics simulate coat drape, scarves, and structured silhouettes across 28 anthropometric body morph targets.',
          bullets: [
            'Idle, runway walk, wave, and weather-synced umbrella postures',
            'PCCS 12-tone personal color mannequin synchronization',
            'WebGL context-loss auto recovery with instant 2D editorial fallback',
          ],
        },
        ingestion: {
          code: '02 / MULTIMODAL AI PIPELINE',
          eyebrow: 'AI GARMENT INGESTION & GEMINI VTON',
          title: 'Photo-to-Atelier Cutout & Multi-Angle Try-On',
          description:
            'Turn any garment snapshot into a studio-ready WebP asset. Guided 8-handle smart crop and edge alpha-matting remove backgrounds cleanly while Google Gemini multimodal vision classifies fabric, season, and palette for 2K multi-angle virtual try-on.',
          bullets: [
            'Edge alpha-matting background removal normalized to lightweight WebP',
            'Automated fabric weave, silhouette, color, and 11-slot wardrobe mapping',
            'Gemini & Vertex AI multi-angle VTON with automated visual QC loop',
          ],
        },
        intelligence: {
          code: '03 / WARDROBE ECONOMICS',
          eyebrow: 'BENTO TELEMETRY & OOTD CALENDAR',
          title: 'Wardrobe Intelligence & Duplicate Guard',
          description:
            'Apple HIG monochrome Bento analytics quantify Cost-Per-Wear (CPW), surface dormant unworn pieces, and sync planned outfits to your calendar—while in-store visual checks stop impulsive duplicate purchases.',
          bullets: [
            'Cost-Per-Wear (CPW) and category balance telemetry in tabular-nums',
            'OOTD wear logging, future outfit scheduling (.ics export), & trip packing',
            'Offline in-store duplicate purchase similarity check against your closet',
          ],
        },
        privacy: {
          code: '04 / SOVEREIGN PRIVACY',
          eyebrow: 'ON-DEVICE WASM & OFFLINE-FIRST SYNC',
          title: 'Local MediaPipe WASM & Native Hybrid Runtime',
          description:
            'Facial skin-tone landmark analysis runs 100% locally in client-side WebAssembly via MediaPipe FaceLandmarker. Your personal closet remains fast and operational offline through IndexedDB and Capacitor 8.',
          bullets: [
            'Explicit pre-consent camera & local facial analysis guardrails',
            'Sign in with Apple, email 6-digit OTP, and one-tap permanent data deletion',
            'Single React + TypeScript codebase packaged for iOS & Android via Capacitor 8',
          ],
        },
      },
    },
    interactive: {
      stanceIdle: 'Idle',
      stanceWalk: 'Runway Walk',
      stanceRain: 'Rain Umbrella',
      rigLabel: 'SKELETAL RIG',
      rigValue: '21 Bones',
      rigMeta: 'SpringBone Cloth Physics',
      morphLabel: 'MORPH TARGETS',
      morphValue: '28 Targets',
      morphMeta: 'Anthropometric Fit Sync',
      pccsNote: 'PCCS 12-Tone Personal Color Harmonized',
      beforeLabel: 'RAW SNAPSHOT',
      afterLabel: 'ALPHA-MATTE WEBP',
      sliderHint: 'Drag slider to inspect studio edge matting',
      ingestionBadge: 'GEMINI VISION · COTTON TWILL TRENCH',
      ingestionMeta: '23 KB WebP · Slot 01 Outer · 2K VTON Ready',
      cpwLabel: 'AVG COST-PER-WEAR',
      cpwValue: '₩14,200',
      cpwDelta: '-18% vs prior month',
      balanceLabel: 'CLOSET UTILIZATION',
      balanceValue: '98.4%',
      balanceMeta: '4 dormant items surfaced',
      dupTitle: 'DUPLICATE PURCHASE GUARD',
      dupStatus: 'ACTIVE',
      dupDesc: 'Matches in-store candidate photos against your existing closet before checkout.',
      ootdDate: 'NOV 22',
      ootdTitle: 'Structured Camel Trench · Rain Editorial',
      ootdMeta: 'Calendar .ics synced · 3 layered pieces',
      topologyTitle: 'ZERO-UPLOAD FACIAL TOPOLOGY',
      topologySteps: [
        { title: 'Local Camera', sub: 'On-device frame' },
        { title: 'MediaPipe WASM', sub: '100% Local Inference' },
        { title: 'IndexedDB Vault', sub: 'Offline-first Sync' },
      ],
      topologyFooterLeft: 'BIOMETRIC FACE UPLINK',
      topologyFooterRight: '0 BYTES TRANSMITTED',
    },
    stack: {
      eyebrow: 'HARDENED ENGINEERING STACK',
      heading: 'Production Architecture at a Glance',
      note: 'BUILT ON OPEN WEB STANDARDS & GOOGLE CLOUD AI',
      cards: [
        {
          eyebrow: '3D GRAPHICS',
          metric: 'Three.js 0.187',
          title: '21-Bone & SpringBone Rig',
          detail: '28 anthropometric morph targets, procedural PBR cloth shading, and WebGL recovery.',
        },
        {
          eyebrow: 'GENERATIVE AI',
          metric: 'Gemini & Vertex',
          title: 'Multimodal Vision & VTON',
          detail: 'Automated garment classification, 2K multi-angle try-on synthesis, and vision QC.',
        },
        {
          eyebrow: 'ON-DEVICE ML',
          metric: '100% Local',
          title: 'MediaPipe FaceLandmarker',
          detail: 'Facial skin-tone calibration executes entirely in client-side WebAssembly.',
        },
        {
          eyebrow: 'MOBILE HYBRID',
          metric: 'Capacitor 8',
          title: 'iOS & Android Native',
          detail: 'React 19 + TypeScript 7 + Express 5 + SQLite WASM with native haptic feedback.',
        },
      ],
    },
    vision: {
      eyebrow: 'COMPANY & FOUNDER DOSSIER',
      heading: 'Built to Eliminate Wardrobe Friction and Impulsive Duplicate Purchases',
      quote:
        '“When every garment in your closet can be experienced with physical drape, honest cost-per-wear telemetry, and responsible AI styling, you wear what you own more creatively—and stop buying duplicates.”',
      body: 'Ainvtry (product name: A inventory) is an independent AI fashion-tech startup building a private 3D digital wardrobe and styling atelier. Powered by Three.js spatial rendering, Google Gemini multimodal pipelines, and local privacy-first ML, our working MVP is preparing for App Store and Google Play launch.',
      statusMvp: 'Working MVP Operational',
      statusRelease: 'Preparing iOS App Store & Google Play Release',
      founderRole: 'Founder & Product Engineer · Ainvtry',
      founderBio:
        'Architecting Ainvtry end-to-end across Three.js spatial graphics, Gemini & Vertex AI fitting pipelines, local WASM vision, and cross-platform mobile delivery.',
      hqLabel: 'Headquarters',
      hqValue: 'Seoul, South Korea',
      domainLabel: 'Official Domain',
      directCta: 'Email Raymond directly',
    },
    beta: {
      eyebrow: 'EARLY ACCESS & PARTNERSHIPS',
      headingLine1: 'Dress with Intention.',
      headingLine2: 'Own with Clarity.',
      body: 'Interested in testing the Ainvtry mobile beta, investor briefings, or fashion archive collaborations? Reach out directly to the founder.',
      cta: 'Request Private Beta Access',
    },
    footer: {
      summary:
        'Ainvtry (A inventory) — Private 3D Digital Wardrobe Atelier & AI Virtual Try-On Studio. Built in Seoul.',
      rights: '© 2026 Ainvtry. All rights reserved.',
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
      contact: 'Contact',
      backToTop: 'Back to Top',
    },
    legal: {
      closeLabel: 'Close legal notice',
      updatedAt: 'Effective November 22, 2026 · ainvtry.com',
      privacyTitle: 'Privacy Policy',
      privacySections: [
        {
          heading: '1. Data We Process & On-Device First Principle',
          body: 'Ainvtry processes facial skin-tone landmarks strictly on your device using client-side MediaPipe WebAssembly. Raw facial camera frames are never uploaded to external servers for skin-tone calibration.',
        },
        {
          heading: '2. Wardrobe & AI Fitting Processing',
          body: 'When you explicitly submit garment photos for background removal, attribute tagging, or Gemini virtual try-on generation, only the selected garment/fitting assets are processed to deliver the requested styling output.',
        },
        {
          heading: '3. Account Security & Immediate Permanent Deletion',
          body: 'Users authenticate via Sign in with Apple, Google, or email 6-digit OTP. You may permanently delete your account and all associated wardrobe records immediately from Account Settings.',
        },
        {
          heading: '4. Privacy Inquiries',
          body: 'For privacy questions or data removal requests, contact Founder Raymond Moon directly at raymond@ainvtry.com.',
        },
      ],
      termsTitle: 'Terms of Service',
      termsSections: [
        {
          heading: '1. Service Scope',
          body: 'Ainvtry (ainvtry.com, product: A inventory) provides 3D digital wardrobe management, AI-assisted garment categorization, virtual try-on previews, and OOTD calendar planning tools.',
        },
        {
          heading: '2. User Content Ownership',
          body: 'You retain full ownership of all wardrobe photographs, outfit logs, and notes you upload to Ainvtry. You grant Ainvtry only the limited technical license needed to render and process your requested features.',
        },
        {
          heading: '3. AI Preview Accuracy',
          body: 'Virtual try-on renders and styling recommendations are visual aids intended to support wardrobe planning and do not guarantee exact physical garment measurements across third-party apparel brands.',
        },
        {
          heading: '4. Contact',
          body: 'Official operator: Ainvtry (Founder: Raymond Moon, Seoul, South Korea). Inquiries: raymond@ainvtry.com.',
        },
      ],
    },
  },
  ko: {
    nav: {
      homeAria: '첫 페이지로 돌아가기',
      studio: '스튜디오',
      technology: '아키텍처',
      metrics: '핵심 스펙',
      about: '소개',
      silkLuxury: '럭셔리',
      silkAurora: '오로라',
      switchToLight: '라이트',
      switchToDark: '다크',
      switchLang: 'EN',
      opacityLabel: '투명도',
      opacityHint: '위로 드래그하면 투명도 상승, 아래로 내리면 하락',
    },
    subtabs: {
      studioPreview: '01 앱 프리뷰',
      studioAtelier: '02 3D 피팅',
      studioIntel: '03 옷장 인텔리전스',
      techIngestion: '01 AI 누끼 · VTON',
      techPrivacy: '02 로컬 프라이버시',
      aboutMission: '비전',
      aboutFounder: '창업자 · 베타',
    },
    appPreview: {
      code: 'LIVE BUILD · 개발 중인 실제 앱',
      eyebrow: '작동 중인 MVP 실시간 캡처',
      title: '개발 중인 A inventory 모바일 앱 프리뷰',
      description:
        '현재 개발 중인 React · Capacitor · Three.js 실구동 빌드 화면입니다. 날씨 연동 코디 스튜디오, 253벌 디지털 옷장, 착용 단가 통계, 온디바이스 피부톤·체형 스튜디오를 미리 살펴보세요.',
      badge: 'iOS · ANDROID MVP',
      screens: [
        {
          id: 'outfits',
          tabLabel: '코디',
          title: '멀티앵글 코디 스튜디오',
          caption: '실시간 날씨 연동 플랫레이 룩북 & 0° 정면·뒷모습 회전 피팅 바',
          imageSrc: '/assets/previews/app-outfits.webp',
          imageAlt: 'A inventory 모바일 앱 코디 스튜디오 프리뷰',
        },
        {
          id: 'closet',
          tabLabel: '옷장',
          title: '253벌 디지털 옷장 그리드',
          caption: 'Apple HIG 무채색 스쿼클 카드 · 브랜드·착용 횟수 실시간 배지',
          imageSrc: '/assets/previews/app-closet.webp',
          imageAlt: 'A inventory 모바일 앱 디지털 옷장 그리드 프리뷰',
        },
        {
          id: 'stats',
          tabLabel: '통계',
          title: '옷장 벤토 인텔리전스',
          caption: '캡슐 활용률 링 · 누적 착용 횟수 · 1회 평균 착용 단가(CPW) 분석',
          imageSrc: '/assets/previews/app-stats.webp',
          imageAlt: 'A inventory 모바일 앱 옷장 통계 화면 프리뷰',
        },
        {
          id: 'profile',
          tabLabel: '피부톤',
          title: '로컬 피부톤 & 체형 스튜디오',
          caption: '온디바이스 MST-04 퍼스널컬러 메시 팔레트 & 신장·체형 정밀 설정',
          imageSrc: '/assets/previews/app-profile.webp',
          imageAlt: 'A inventory 모바일 앱 피부톤 및 체형 스튜디오 프리뷰',
        },
      ],
    },
    hero: {
      kicker: 'AINVTRY.COM · 프라이빗 3D 디지털 옷장 아틀리에',
      titleLead: '나만의 ',
      titleAccent: '3D 디지털 아틀리에',
      titleTail: ' & AI 피팅 스튜디오',
      subtitle:
        '실제 원단의 드레이프 물리, 멀티앵글 Gemini AI 가상 피팅, 그리고 얼굴 데이터를 기기 밖으로 보내지 않는 로컬 퍼스널컬러 인텔리전스.',
      marbleHint: '유리 구슬을 핀볼처럼 굴려 메뉴를 맞추거나 탭해 보세요',
      primaryCta: '아틀리에 둘러보기',
      secondaryCta: '창업자 문의',
    },
    capabilities: {
      sectionCode: '01 / 04 아키텍처 프리뷰',
      eyebrow: '핵심 기능 · A INVENTORY 엔진',
      heading: '3D 오트 아틀리에 옷장 아키텍처',
      subheading:
        '복잡한 대시보드가 아닌 정제된 패션 갤러리처럼 설계했습니다. Apple HIG 무채색 미니멀과 8pt 그리드 위에 구현된 디지털 피팅 경험입니다.',
      badge: '작동 중인 MVP · v0.1',
      pillars: {
        atelier: {
          code: '01 / 3D 공간 물리',
          eyebrow: '스켈레탈 의류 시뮬레이션',
          title: '3D 피팅 아틀리에 & 체형 모프',
          description:
            '평면 2D 콜라주를 넘어 Three.js 21-Bone 스켈레탈 모션과 경량 SpringBone 물리로 코트·스카프·가방의 움직임을 구현합니다. 28종 체형 모프 타겟과 PCCS 12톤 퍼스널컬러 마네킹이 정밀하게 동기화됩니다.',
          bullets: [
            'Idle · 워킹 · 인사 · 날씨 연동 우산 모션 및 손 인스펙션 포즈',
            '28종 인체 모프 타겟 & PCCS 12톤 퍼스널컬러 동기화',
            'WebGL 컨텍스트 손실 자동 복구 및 2D 에디토리얼 폴백 뷰어',
          ],
        },
        ingestion: {
          code: '02 / 멀티모달 AI 파이프라인',
          eyebrow: 'AI 의류 등록 & GEMINI 가상 피팅',
          title: '원탭 누끼 WebP 정규화 & 2K 멀티앵글 VTON',
          description:
            '옷 사진을 촬영하면 8-핸들 스마트 크롭과 에지 알파 매팅이 배경을 깔끔하게 분리합니다. Google Gemini 멀티모달 비전이 원단·계절·색상을 자동 추론하고 2K 멀티앵글 가상 피팅과 자동 품질 검수(QC)까지 수행합니다.',
          bullets: [
            '에지 알파 매팅 기반 자동 배경제거 및 초경량 WebP 압축',
            '카테고리·원단·계절·주요 색상 자동 분석 및 11슬롯 매핑',
            'Gemini · Vertex AI 기반 멀티앵글 VTON 및 자동 비전 QC 루프',
          ],
        },
        intelligence: {
          code: '03 / 옷장 인텔리전스',
          eyebrow: '벤토 인사이트 & OOTD 캘린더',
          title: '1회 착용 비용(CPW) 분석 & 오프라인 중복 판독',
          description:
            '애플 피트니스 스타일 무채색 벤토 카드로 1회 착용 비용(CPW)과 미착용 방치 의류를 한눈에 파악합니다. OOTD 캘린더 예약(.ics 내보내기)과 매장 내 중복 구매 판독으로 불필요한 소비를 막아줍니다.',
          bullets: [
            '고정폭 수치(tabular-nums) 기반 CPW · 색상/카테고리 편중도 리포트',
            '날짜별 OOTD 착용 기록 · 미래 코디 예약(.ics) · 여행 짐싸기 체크리스트',
            '오프라인 매장 촬영 즉시 내 옷장 유사 아이템 중복 판독',
          ],
        },
        privacy: {
          code: '04 / 프라이버시 우선 설계',
          eyebrow: '로컬 WASM 추론 & 오프라인 우선 동기화',
          title: '온디바이스 MediaPipe WASM & 하이브리드 앱',
          description:
            '안면 피부톤 분석은 MediaPipe FaceLandmarker WASM을 통해 100% 사용자 기기 내부에서만 처리됩니다. IndexedDB 오프라인 우선 동기화와 Capacitor 8 네이티브 래퍼로 지하철·매장에서도 끊김 없이 작동합니다.',
          bullets: [
            '카메라·갤러리 사전 권한 안내 및 로컬 피부톤 분석 사전 동의 가드레일',
            'Sign in with Apple · 이메일 6자리 OTP · 설정 내 즉시 영구 탈퇴/파기',
            'React 19 + TypeScript 7 단일 코드베이스 기반 iOS · Android 패키징',
          ],
        },
      },
    },
    interactive: {
      stanceIdle: '기본 대기',
      stanceWalk: '런웨이 워킹',
      stanceRain: '우산 모드',
      rigLabel: '스켈레탈 리그',
      rigValue: '21 Bones',
      rigMeta: 'SpringBone 경량 물리',
      morphLabel: '체형 모프',
      morphValue: '28 Targets',
      morphMeta: '체형·비율 정밀 동기화',
      pccsNote: 'PCCS 12톤 퍼스널컬러 조화',
      beforeLabel: '원본 촬영 사진',
      afterLabel: '알파 매팅 WEBP',
      sliderHint: '슬라이더를 움직여 누끼 전후를 비교해 보세요',
      ingestionBadge: 'GEMINI VISION · 코튼 트윌 트렌치코트',
      ingestionMeta: '23 KB WebP · 슬롯 01 아우터 · 2K VTON 준비',
      cpwLabel: '평균 1회 착용 비용(CPW)',
      cpwValue: '₩14,200',
      cpwDelta: '전월 대비 -18%',
      balanceLabel: '옷장 활용률',
      balanceValue: '98.4%',
      balanceMeta: '90일 미착용 의류 4벌 감지',
      dupTitle: '오프라인 중복 구매 판독',
      dupStatus: '활성',
      dupDesc: '매장에서 고른 옷을 촬영하면 내 옷장에 이미 비슷한 실루엣·색상이 있는지 즉시 비교합니다.',
      ootdDate: '11월 22일',
      ootdTitle: '카멜 트렌치 코트 · 비 오는 날 코디',
      ootdMeta: '캘린더 .ics 동기화 · 3겹 레이어드',
      topologyTitle: '서버 무전송(ZERO-UPLOAD) 안면 분석 구조',
      topologySteps: [
        { title: '기기 카메라', sub: '로컬 프레임 입력' },
        { title: 'MediaPipe WASM', sub: '100% 기기 내 추론' },
        { title: 'IndexedDB 저장소', sub: '오프라인 우선 동기화' },
      ],
      topologyFooterLeft: '안면 생체 이미지 외부 전송',
      topologyFooterRight: '0 BYTES (완전 로컬)',
    },
    stack: {
      eyebrow: '프로덕션 기술 스택',
      heading: '핵심 엔진 아키텍처 요약',
      note: '오픈 웹 표준 & GOOGLE CLOUD AI 기반',
      cards: [
        {
          eyebrow: '3D 그래픽스',
          metric: 'Three.js 0.187',
          title: '21-Bone & SpringBone 물리',
          detail: '28종 체형 모프 타겟, 절차적 PBR 실크/원단 셰이딩, WebGL 자동 복구.',
        },
        {
          eyebrow: '생성형 AI',
          metric: 'Gemini & Vertex',
          title: '멀티모달 비전 & VTON',
          detail: '의류 원단·계절 자동 분류, 2K 멀티앵글 가상 피팅 합성, 자동 비전 QC.',
        },
        {
          eyebrow: '온디바이스 ML',
          metric: '100% 로컬',
          title: 'MediaPipe FaceLandmarker',
          detail: '안면 랜드마크 및 피부톤 캘리브레이션을 외부 전송 없이 기기 내 WASM으로 처리.',
        },
        {
          eyebrow: '모바일 하이브리드',
          metric: 'Capacitor 8',
          title: 'iOS · Android 네이티브',
          detail: 'React 19 · TypeScript 7 · Express 5 · SQLite WASM · 네이티브 햅틱 통합.',
        },
      ],
    },
    vision: {
      eyebrow: '회사 및 창업자 소개',
      heading: '옷장의 마찰과 충동적인 중복 구매를 기술로 해결합니다',
      quote:
        '“내 옷장 속 모든 옷을 실제 드레이프 물리, 투명한 1회 착용 비용 데이터, 책임감 있는 AI 스타일링으로 경험할 수 있다면 우리는 이미 가진 옷을 더 창의적으로 입고 중복 소비를 멈출 수 있습니다.”',
      body: 'Ainvtry(제품명: A inventory)는 프라이빗 3D 디지털 옷장과 AI 피팅 아틀리에를 만드는 초기 AI 패션테크 스타트업입니다. Three.js 3D 렌더링, Google Gemini 멀티모달 파이프라인, 온디바이스 프라이버시 ML을 결합한 작동 MVP를 완성했으며 iOS App Store 및 Google Play 정식 출시를 준비 중입니다.',
      statusMvp: '작동하는 MVP 구축 완료',
      statusRelease: 'iOS App Store · Google Play 출시 준비 중',
      founderRole: '창업자 & 프로덕트 엔지니어 · Ainvtry',
      founderBio:
        'Three.js 3D 그래픽스, Gemini & Vertex AI 가상 피팅 파이프라인, 로컬 WASM 비전, 크로스플랫폼 모바일 앱까지 Ainvtry 제품 아키텍처 전반을 설계·개발합니다.',
      hqLabel: '거점',
      hqValue: '대한민국 서울',
      domainLabel: '공식 도메인',
      directCta: '창업자에게 바로 메일 보내기',
    },
    beta: {
      eyebrow: '얼리 액세스 & 협업 문의',
      headingLine1: '의도를 담아 입고,',
      headingLine2: '명확하게 소유하세요.',
      body: 'Ainvtry 모바일 프라이빗 베타 테스트, 투자/파트너십 논의, 패션 아카이브 협업 문의는 창업자 공식 메일로 직접 연락해 주세요.',
      cta: '프라이빗 베타 참여 문의',
    },
    footer: {
      summary: 'Ainvtry (A inventory) — 3D 디지털 옷장 아틀리에 & AI 가상 피팅 스튜디오 · 서울.',
      rights: '© 2026 Ainvtry. All rights reserved.',
      privacy: '개인정보처리방침',
      terms: '이용약관',
      contact: '문의하기',
      backToTop: '맨 위로',
    },
    legal: {
      closeLabel: '약관 창 닫기',
      updatedAt: '시행일 2026년 11월 22일 · ainvtry.com',
      privacyTitle: '개인정보처리방침',
      privacySections: [
        {
          heading: '1. 온디바이스 우선 처리 원칙',
          body: 'Ainvtry는 안면 피부톤 캘리브레이션에 필요한 랜드마크 분석을 사용자 기기 내부의 MediaPipe WebAssembly로만 처리하며, 원본 얼굴 카메라 프레임을 외부 서버로 전송하거나 저장하지 않습니다.',
        },
        {
          heading: '2. 의류 이미지 및 AI 피팅 처리',
          body: '사용자가 직접 요청한 의류 배경제거, 속성 분류, Gemini 가상 피팅 생성에 한해 선택된 의류 및 피팅 데이터를 처리합니다.',
        },
        {
          heading: '3. 계정 보안 및 즉시 영구 파기',
          body: 'Sign in with Apple, Google 로그인, 이메일 6자리 OTP 인증을 지원하며, 사용자는 앱 내 계정 설정에서 언제든 회원 탈퇴 및 모든 개인·옷장 데이터의 즉시 영구 파기를 실행할 수 있습니다.',
        },
        {
          heading: '4. 개인정보 보호 책임자 및 문의',
          body: '개인정보 관련 문의 및 삭제 요청은 창업자 Raymond Moon(raymond@ainvtry.com)에게 직접 연락해 주세요.',
        },
      ],
      termsTitle: '서비스 이용약관',
      termsSections: [
        {
          heading: '1. 서비스 범위',
          body: 'Ainvtry(ainvtry.com, 제품명: A inventory)는 3D 디지털 옷장 관리, AI 기반 의류 분류, 가상 피팅 프리뷰, OOTD 캘린더 기능을 제공합니다.',
        },
        {
          heading: '2. 사용자 콘텐츠 소유권',
          body: '사용자가 등록한 모든 의류 사진, 코디 기록, 메모의 권리는 사용자 본인에게 있으며, Ainvtry는 사용자가 요청한 기능을 렌더링·처리하기 위한 범위 내에서만 이를 사용합니다.',
        },
        {
          heading: '3. AI 피팅 결과 참고 고지',
          body: '가상 피팅 이미지와 스타일 추천은 코디 의사결정을 돕기 위한 시각적 보조 수단이며, 외부 의류 브랜드의 실제 물리적 치수 차이를 보증하지 않습니다.',
        },
        {
          heading: '4. 운영자 정보',
          body: '운영: Ainvtry (창업자 Raymond Moon, 대한민국 서울) · 공식 이메일: raymond@ainvtry.com',
        },
      ],
    },
  },
};
