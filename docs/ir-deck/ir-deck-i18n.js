(() => {
  'use strict';

  /**
   * iNVTRY (Ainvtry) Living IR Business Plan Deck v4.0 — Bilingual KO/EN Dictionary
   * - Preserves 100% of live `data-ir-bind` metrics dynamically via regex-backed EN formatters
   * - Preserves rich inline typography (<em>, <strong>, <br>, <small>) in English word order
   * - Translates all 18 slides, inline SVG <text>, toolbar controls, options, alt & aria-labels
   */

  const DOC_TITLE = {
    ko: 'iNVTRY (Ainvtry) — IR 사업계획서 v4.0 (KO/EN · Light/Dark · Auto-Sync · 16:9 · 4:3)',
    en: 'iNVTRY (Ainvtry) — Investor Pitch Deck v4.0 (KO/EN · Light/Dark · Auto-Sync · 16:9 · 4:3)',
  };

  /**
   * Rich inline-HTML English overrides (preserves natural English word order + <em>/<strong>/<br>/<small>).
   */
  const RICH_HTML_EN = {
    '#slide-01 .cover-headline':
      'Turn Your Closet Into a <em>Digital Asset</em>,<br />From Daily Wear to Resale',
    '#slide-01 .cover-lead':
      'A <strong>Privacy-First AI Fashion-Tech OS</strong> unifying 1-photo digitization, 360° 4+ layer AI fitting, 0B on-device privacy, and 1-tap verified resale in one closed loop.',
    '#slide-02 .slide-title':
      'Executive Agenda — From <em>Fragmented Pains</em> to Monetization &amp; Ask',
    '#slide-03 .slide-title':
      'Not a Concept — A Live <em>Circular Digital Wardrobe OS</em>',
    '#slide-04 .slide-title':
      '<em>6 Fragmented Problems</em> Blocking the Fashion Lifecycle',
    '#slide-05 .slide-title':
      '6 Disconnected Fashion Pains, Resolved by <em>One Unified Closet OS</em>',
    '#slide-06 .slide-title':
      '<em>iNVTRY</em> Across 6 Everyday Wardrobe Moments',
    '#slide-07 .slide-title':
      'Live Cross-Platform App <em>(Web · iOS · Android)</em>',
    '#slide-08 .slide-title':
      'Three.js 3D Physics × Multi-Angle 2D VTON × <em>-96% Edge Pipeline</em>',
    '#slide-09 .slide-title':
      'Uncopyable Moat: <em>4 Lines of Data Security Defense</em>',
    '#slide-10 .slide-title':
      'Intersection of <em>$393B</em> Global Resale × <em>$23.9B</em> Virtual Try-On',
    '#slide-11 .slide-title':
      'Beyond Single-Purpose Apps: The Only <em>Circular Wardrobe Asset OS</em>',
    '#slide-12 .slide-title':
      'Subscription × Gap Commerce × Verified Resale × B2B: <em>4-Engine Revenue</em>',
    '#slide-13 .slide-title':
      '5-Stage LTV Flywheel × <em>$0 On-Device Cost Defense</em>',
    '#slide-14 .slide-title':
      'Production-Verified <em>6-Tier Full-Stack</em> Ready to Scale',
    '#slide-15 .slide-title':
      '3-Phase Execution: From Closet Lock-in to <em>Resale Liquidity</em>',
    '#slide-16 .slide-title':
      'Solo MVP Execution Speed × <em>2027 Enterprise Security Governance</em>',
    '#slide-17 .slide-title':
      '18-Month Commercial Scale-Up &amp; <em>Circular Resale</em> Funding Ask',
    '#slide-18 .closing-tagline':
      '<strong>“Turn Your Closet Into a Digital Asset, From Daily Wear to Resale”</strong><br />iNVTRY resolves 6 fragmented fashion pains inside one Privacy-First Wardrobe OS.',
  };

  /**
   * Live `data-ir-bind` dynamic EN formatters — always stay synced with `npm run ir:sync`.
   */
  function formatBoundEn(key, koText) {
    const t = String(koText || '').trim();
    switch (key) {
      case 'tests.summaryShort': {
        const m = t.match(/(\d+)\s*스위트\s*·\s*(\d+)\s*케이스/);
        return m ? `${m[1]} suites · ${m[2]} cases passed` : t;
      }
      case 'tests.summaryLine': {
        const m = t.match(/(\d+)\s*스위트\((\d+)\s*케이스\)/);
        return m
          ? `Unit · API · WebGL E2E ${m[1]} suites (${m[2]} cases) · 3 platforms`
          : t;
      }
      case 'tests.tractionTitle': {
        const m = t.match(/(\d+\+)/);
        return m ? `${m[1]} Automated Tests` : t;
      }
      case 'garment.beforeTitle': {
        const m = t.match(/(\d+\s*KB)/i);
        return m ? `${m[1]} · EXIF / GPS / Room Included` : t;
      }
      case 'garment.afterTitle': {
        const m = t.match(/(\d+\s*KB)/i);
        return m ? `${m[1]} · EXIF 0% · Pure Garment` : t;
      }
      case 'garment.costOldBar': {
        const m = t.match(/(\d+\s*KB)/i);
        return m ? `${m[1]} / img (EXIF & background)` : t;
      }
      case 'garment.costNewNote': {
        const m = t.match(/(-\d+%)/);
        return m ? `${m[1]} smaller · IndexedDB local cache` : t;
      }
      case 'garment.costHeadSaved': {
        const m = t.match(/(-\d+%)/);
        return m ? `${m[1]} payload saved` : t;
      }
      case 'garment.wasmNote': {
        const m = t.match(/(\d+\s*KB)/i);
        return m ? `Local WASM + ${m[1]} No-Train` : t;
      }
      case 'roadmap.pill': {
        if (t.includes('01·02')) return 'LIVE 01·02 DONE';
        const m = t.match(/(\d+)/);
        return m ? `LIVE ${m[1]} DONE` : 'LIVE DONE';
      }
      case 'roadmap.stage-1.badge':
      case 'roadmap.stage-2.badge':
      case 'roadmap.stage-3.badge': {
        return t.replace('완료', 'DONE');
      }
      default:
        return t;
    }
  }

  /**
   * Complete normalized Korean -> English map for all leaf text nodes, buttons, options & SVG <text>.
   */
  const TEXT_EN = {
    // Toolbar & Navigation
    '← 사이트': '← Site',
    '럭셔리': 'Luxury',
    '오로라': 'Aurora',
    '라이트': 'Light',
    '다크': 'Dark',
    '1장씩': 'Deck',
    '스크롤': 'Scroll',
    'PDF / 인쇄': 'PDF / Print',
    '01. 표지 (Cover)': '01. Cover',
    '02. 목차 (Contents)': '02. Contents',
    '03. Executive Summary': '03. Executive Summary',
    '04. 6대 페인포인트': '04. 6 Pain Points',
    '05. 6 → 1 단일 OS 해결': '05. 6 → 1 Unified OS',
    '06. User Journey (6-Cut)': '06. User Journey (6-Cut)',
    '07. 실구동 앱 쇼케이스': '07. Live App Showcase',
    '08. Core Technology': '08. Core Technology',
    '09. 4대 데이터 보안 방어선': '09. 4 Security Defenses',
    '10. Market Size & Why Now': '10. Market Size & Why Now',
    '11. Competitive Landscape': '11. Competitive Landscape',
    '12. BM ① 4중 수익 모델': '12. BM ① 4-Engine Revenue',
    '13. BM ② 플라이휠 & 원가': '13. BM ② Flywheel & Margin',
    '14. 6-Tier 검증 실적': '14. 6-Tier Traction',
    '15. GTM & 18M 로드맵': '15. GTM & 18M Roadmap',
    '16. 팀 & 보안 거버넌스': '16. Team & Governance',
    '17. 투자 제안 & 자금 배분': '17. Funding Ask & Use of Funds',
    '18. 감사합니다 (Closing)': '18. Thank You (Closing)',

    // Slide 01 — Cover
    '21관절 · SpringBone 물리': '21-Bone · SpringBone Physics',
    '안면 클라우드 전송': 'Face Cloud Transmission',
    'IR 사업계획서 v3.1': 'IR Pitch Deck v4.0',
    'IR 사업계획서 v4.0': 'IR Pitch Deck v4.0',
    '360° 4겹+ 2D VTON · 실시간 날씨': '360° 4+ Layer 2D VTON · Live Weather',

    // Slide 02 — TOC
    '클릭 시 즉시 이동': 'Click to Jump',
    '비전 요약 · 6→1 일괄 해결': 'Vision Summary · 6→1 Resolution',
    'Cover — 디지털 순환 옷장 OS': 'Cover — Circular Digital Wardrobe OS',
    'Executive Summary — 핵심 지표': 'Executive Summary — Key Metrics',
    'Problem — 파편화된 6대 문제': 'Problem — 6 Fragmented Pains',
    'Solution — 6 → 1 단일 OS 해결': 'Solution — 6 → 1 Unified OS',
    '실구동 제품 · AI VTON · 0B 보안': 'Live Product · AI VTON · 0B Privacy',
    'User Journey — 일상 6대 시나리오': 'User Journey — 6 Daily Scenarios',
    'Live Showcase — 실제 프로덕션 앱': 'Live Showcase — Real Production App',
    'Security Moat — 4대 방어선': 'Security Moat — 4 Defense Lines',
    '시장 규모 · 경쟁 우위 · 심층 BM': 'Market Size · Moat · Deep BM',
    'Competition — 2×2 포지셔닝': 'Competition — 2×2 Positioning',
    'BM ① — 4중 수익 모델 & 티어': 'BM ① — 4-Engine Revenue & Tiers',
    'BM ② — 플라이휠 & 원가 방어': 'BM ② — Flywheel & Cost Defense',
    '검증 실적 · 로드맵 · 팀 · 투자': 'Traction · Roadmap · Team · Ask',
    'Traction — 6-Tier 풀스택 검증': 'Traction — 6-Tier Full-Stack Proof',
    'GTM & Roadmap — 3단계 전략': 'GTM & Roadmap — 3-Phase Plan',
    'Team & 2027 보안 거버넌스': 'Team & 2027 Security Governance',
    'Funding Ask (+ 18. 감사합니다)': 'Funding Ask (+ 18. Thank You)',

    // Slide 03 — Executive Summary
    '5단계': '5-Stage',
    '촬영 → 날씨 → AI 피팅 → CPW → 1탭 리셀': 'Snap → Weather → AI Fit → CPW → 1-Tap Resale',
    'MediaPipe WASM 안면 100% 온디바이스 분석': '100% On-Device MediaPipe WASM Face Analysis',
    '글로벌 리셀 전망 × VTON 연 19.5% 성장': 'Global Resale Forecast × 19.5% VTON CAGR',
    '사진 1장 (-96%)': '1-Photo (-96%)',
    '날씨·거리뷰 싱크': 'Weather · Street Sync',
    '360° 4겹+ VTON': '360° 4+ Layer VTON',
    'CPW·세탁 관리': 'CPW · Garment Care',
    '1탭 인증 리셀': '1-Tap Verified Resale',
    '내 실제 옷 기반 360° 레이어드': '360° Layering With Your Real Clothes',
    '4겹+ 동시 피팅': '4+ Layer Simultaneous Fit',
    '21-Bone · 28 체형': '21-Bone · 28 Body Morphs',
    '매장 3초 중복 판독': '3-Sec In-Store Duplicate Check',
    '우산·강수 물리': 'Umbrella & Rain Physics',
    '4중 방어선': '4 Defenses',
    '규제·심사 선제 통과 보안 구조': 'Audit-Ready Privacy-by-Design Stack',
    '안면 0B 로컬': '0B Local Biometrics',
    'EXIF -96% 스트리핑': 'EXIF -96% Stripping',
    '무학습 AI · 즉시파기': 'No-Train AI · Instant Wipe',
    '4중 수익': '4-Engine',
    '고마진 복합 LTV 수익 엔진': 'High-Margin Multi-Stream LTV Engine',
    'Pro 월 구독': 'Pro Monthly Sub',
    '갭 커머스 5~12%': 'Gap Commerce 5–12%',
    '리셀·O2O 3~8%': 'Resale · O2O 3–8%',
    '브랜드 B2B SDK': 'Brand B2B SDK',
    'Edge 전처리 ₩0': 'Edge Preprocess $0',
    '목표 마진 70%+': 'Target Margin 70%+',

    // Slide 04 — Problem
    '70%+ 방치': '70%+ Unworn',
    '기억 의존 중복 구매': 'Memory-Driven Duplicate Buying',
    '보유 의류 파악 불가 → 매장서 비슷한 옷 반복 구매': 'No closet visibility → repeated look-alike purchases in store',
    '$743B 손실': '$743B Returns',
    '내 옷과 안 맞는 온라인 반품': 'Online Returns From Outfit Mismatch',
    '보유 바지·아우터와 비율·색감 사전 검증 불가 (Mordor 2026)': 'Cannot pre-check proportion or color with owned clothes (Mordor 2026)',
    '단품 1벌 정면': '1-Item Front Only',
    '레이어드·측후면 검증 불가': 'No Multi-Layer or Back/Side Checks',
    '기존 AI는 정면 단품 합성 한계 → 4겹 외출 코디 불가': 'Legacy AI handles 1 front item only → fails real 4-layer outfits',
    '앱 4개 분절': '4 Split Apps',
    '날씨·장소(TPO)와 단절된 코디': 'Styling Disconnected From Weather & TPO',
    '날씨·지도·옷장 앱이 따로 놀아 매일 아침 의사결정 피로': 'Siloed weather, map, and closet apps cause daily morning fatigue',
    '원본 무방비 전송': 'Raw Cloud Upload',
    '얼굴·GPS·실내 프라이버시 공포': 'Face, GPS & Home Privacy Anxiety',
    '셀카·EXIF 원본을 외부 서버와 무료 AI 학습에 노출': 'Raw selfies and EXIF room photos exposed to external AI training',
    '자산 동결': 'Frozen Assets',
    '세탁 방치 · 중고 리셀 마찰': 'Neglected Care & High Resale Friction',
    '재촬영·실측·신뢰 입증 번거로움으로 안 입는 옷 방치': 'Re-shooting, measuring, and listing friction leaves clothes idle',
    '핵심 병목: 옷장·피팅·날씨·세탁·중고 앱이 따로 놀아 데이터가 끊기므로 어느 앱도 매일 쓰지 못합니다.':
      'Core Bottleneck: Closet, fitting, weather, care, and resale apps are siloed — breaking data continuity and killing daily retention.',

    // Slide 05 — Solution 6 -> 1
    '01. 매장 중복 구매': '01. In-Store Duplicates',
    '보유 의류 망각 · 충동소비': 'Forgotten items · impulse buys',
    '02. 온라인 반품': '02. Online Returns',
    '내 옷과 핏·색감 불일치': 'Fit & color clash with owned items',
    '03. 단품 정면 VTON': '03. 1-Item Front VTON',
    '4겹 레이어드 · 측후면 불가': 'No 4-layer or side/back view',
    '1벌 한계': '1-Item Cap',
    '04. 날씨·TPO 단절': '04. No Weather/TPO',
    '기온·강수·장소 미반영': 'Ignores rain, temp & venue',
    '앱 분절': 'Siloed',
    '05. 개인정보 유출': '05. Data Exposure',
    '셀카·EXIF 원본 서버 전송': 'Raw selfies & EXIF sent to cloud',
    '유출 공포': 'Privacy Risk',
    '06. 세탁·리셀 마찰': '06. Care & Resale Drag',
    '재촬영 · 실측 · 입력 피로': 'Re-shooting & listing fatigue',
    '사진 1장 단일 그래프': '1-Photo Unified Graph',
    '3초 중복 판독 게이트': '3-Sec Duplicate Gate',
    '유사 벌수·착용일 즉시 경고': 'Instant match count & wear-date alert',
    '내 옷장 사전 AI 조합': 'Pre-Buy Closet AI Pairing',
    '28체형 + 보유 옷 매칭 검증': '28 body morphs + owned wardrobe match',
    '360° 4겹+ 멀티앵글 피팅': '360° 4+ Layer Multi-Angle Fit',
    '8방향 2D VTON + Three.js 물리': '8-Angle 2D VTON + Three.js Physics',
    '실시간 기상·거리뷰 싱크': 'Live Weather & Street Sync',
    'Weather v1 · 우산 · 동네 배경': 'Weather v1 · umbrella · local street',
    '0B 얼굴 · -96% 스트리핑': '0B Face · -96% Stripping',
    '세탁 지도 · 1탭 인증 리셀': 'Care Map · 1-Tap Verified Resale',
    'CPW 알림 + 배경 제거 컷 30초 판매': 'CPW alert + clean cutouts listed in 30s',
    '촬영 (-96%)': 'Snap (-96%)',
    '날씨 · TPO': 'Weather · TPO',
    '360° 4겹+': '360° 4+ Layers',
    'CPW · 세탁': 'CPW · Care',

    // Slide 06 — User Journey
    '매장 3초 중복 확인': '3-Sec In-Store Duplicate Check',
    '유사 코트 보유 벌수 즉시 대조 · 충동구매 차단': 'Spot owned look-alikes instantly · block impulse buys',
    '원탭 배경 제거 · 택 스캔': '1-Tap Cutout · Tag Scan',
    '배경·EXIF 제거(LIVE) + 세탁 라벨 OCR(확장)': 'Cutout & EXIF strip (LIVE) + care-tag OCR (Next)',
    '실시간 날씨 · 거리뷰 피팅': 'Live Weather & Street Fitting',
    '동네 배경 + 강수·우산 반영 4겹+ AI 피팅': 'Local street backdrop + rain/umbrella 4+ layer AI fit',
    'OOTD 캘린더 · SNS 공유': 'OOTD Calendar & Social Share',
    '원탭 착장 기록 + 360° 룩북 카드 바이럴': '1-tap wear logging + viral 360° lookbook cards',
    '주변 세탁 지도 · 방문 수거': 'Local Care Map & Pickup O2O',
    '이염 경고·세탁소 지도(LIVE) → 비대면 O2O': 'Color-bleed alert & laundry map (LIVE) → doorstep pickup',
    '이력 인증 원탭 리셀': 'Provenance-Verified 1-Tap Resale',
    '휴면 알림(LIVE) + 배경 제거 컷 · 착용 이력 판매': 'Idle alerts (LIVE) + studio cutouts & wear-log listing',

    // Slide 07 — Live Showcase
    '01 · 360° 레이어드 피팅': '01 · 360° Layered Fitting',
    '4겹+ 2D VTON · 실시간 날씨 · 거리뷰': '4+ Layer 2D VTON · Live Weather · Street View',
    '02 · 자동 배경 제거 · 중복 판독': '02 · Auto Cutout · Duplicate Check',
    '11슬롯 분류 · 계절/색상 · 중복 체크': '11-Slot Auto-Sort · Season/Color · Duplicate Gate',
    '03 · CPW · 자산 리포트': '03 · CPW · Asset Report',
    '실시간 활용률 · 누적 착용 · 1회 단가': 'Live Wear Rate · Total Wears · Cost-Per-Wear',
    '04 · 0B 얼굴 · 체형 볼트': '04 · 0B Face · Body Vault',
    'MediaPipe MST-04 · 28종 모프': 'MediaPipe MST-04 · 28 Body Morphs',

    // Slide 08 — Core Technology
    'Three.js 3D 아바타 & SpringBone 물리': 'Three.js 3D Avatar & SpringBone Physics',
    '21-Bone · 28 체형 모프': '21-Bone · 28 Body Morphs',
    '코트·헤어 지글 물리': 'Coat & Hair Spring Physics',
    'Zero-GC 서브스텝': 'Zero-GC Substeps',
    'WebGL 자동 복구': 'WebGL Auto-Recovery',
    'Three.js 인터랙티브 스테이지': 'Three.js Interactive Stage',
    '2D 폴백 내장': 'Built-In 2D Fallback',
    '4겹+ 멀티앵글 2D VTON & 캐시': '4+ Layer Multi-Angle 2D VTON & Cache',
    '0°~315° 일관성 검수': '0°–315° Consistency QC',
    '@imgly 배경 제거 ₩0': '@imgly Cutout $0',
    'MediaPipe 피부톤 ₩0': 'MediaPipe Skin Tone $0',
    '착장 해시 캐싱': 'Outfit Hash Caching',
    '유료 무학습 AI 경로': 'Paid No-Training AI Path',
    '₩0 엣지 전처리': '$0 Edge Preprocess',
    '실시간 기상 · 거리뷰 무저장 프록시': 'Live Weather & Street Zero-Storage Proxy',
    '실시간 기상 · 거리뷰 미저장 프록시': 'Live Weather & Street Zero-Storage Proxy',
    'Weather v1 강수/UV': 'Weather v1 Rain / UV',
    'Three.js 3D 우산·바람': 'Three.js 3D Umbrella & Wind',
    'Street View 배경': 'Street View Backdrop',
    'Places 세탁소 지도': 'Places Laundry Map',
    '서버 전용 키 격리': 'Server-Only Key Isolation',
    'ToS 100% 준수': '100% ToS Compliant',
    'BEFORE · 원본 JPEG': 'BEFORE · Raw JPEG',
    '촬영 위치·기기 정보·배경 사생활 노출': 'Exposes GPS coordinates, device metadata & room privacy',
    'WASM 로컬 변환 · 서버 ₩0': 'Local WASM Conversion · $0 Server',
    'AFTER · 비식별 WebP': 'AFTER · De-Identified WebP',
    '전송·저장비 96% 절감 + 프라이버시 보호': '96% bandwidth/storage reduction + full privacy protection',

    // Slide 09 — Security Moat
    '얼굴 0B 볼트 · EXIF -96% 제거': '0B Face Vault · EXIF -96% Stripped',
    'Stateless OIDC · IDOR 원천 차단': 'Stateless OIDC · Zero IDOR Surface',
    '무학습 추론 · 탈퇴 시 즉시 영구파기': 'No-Train Inference · Instant Atomic Wipe',
    '01. 생체(얼굴) 0-Byte 로컬 처리': '01. 0-Byte Local Biometric (Face) Processing',
    '일반 AI: 원본 셀카 클라우드 업로드·보관': 'Legacy AI: Uploads & stores raw selfies in the cloud',
    'iNVTRY: MediaPipe WASM 로컬 분석 + 기기 IndexedDB 격리': 'iNVTRY: Local MediaPipe WASM + device IndexedDB isolation',
    '02. Stateless OIDC · 계정 탈취 차단': '02. Stateless OIDC · Anti-Account-Takeover',
    'JWKS 검증': 'JWKS Verified',
    '일반 AI: 소셜 토큰 DB 보관 · 이메일 자동 병합': 'Legacy AI: Stores social tokens in DB · auto-merges email',
    'iNVTRY: 외부 토큰 무보관 · ATO 금지 · HttpOnly + Rate Limit': 'iNVTRY: Zero external token DB · anti-ATO · HttpOnly + Rate Limit',
    '03. 테넌트 강제 격리 · 3-Zone 스토리지': '03. Strict Tenant Isolation · 3-Zone Vault',
    '일반 AI: 단일 공용 버킷 · URL 추측 시 타인 옷장 노출': 'Legacy AI: Single public bucket · guessable URLs leak closets',
    'iNVTRY: 전 API IDOR 차단 · 매직바이트 · 3-Zone Private 버킷': 'iNVTRY: All-API IDOR guard · magic-byte check · 3-Zone private GCS',
    '04. 유료 무학습 AI · 원클릭 영구 파기': '04. Paid No-Train AI · 1-Click Permanent Purge',
    '0일 휘발': '0-Day Retention',
    '일반 AI: 무료 API 학습 유출 · 탈퇴 후 이미지 잔존': 'Legacy AI: Free-tier AI training leaks · orphan images after delete',
    'iNVTRY: Vertex/Gemini 무학습 · 탈퇴 시 DB·파일·캐시 즉시 소거': 'iNVTRY: Paid Vertex/Gemini no-train · atomic DB, file & cache wipe',
    '개인정보보호법(PIPA)': 'Korea PIPA Compliance',
    '제16·21·28조의2·29조': 'Arts. 16, 21, 28-2 & 29',
    '인앱 즉시 삭제·사전동의': 'In-App Purge & Explicit Consent',
    'TIPS·바우처 대응': 'TIPS & Grant Ready',
    'CI 시크릿 스캔·무학습': 'CI Secret Scan · No-Train',
    '2027 상용 거버넌스': '2027 Prod Governance',
    '모의해킹·배상책임보험': 'Pen-Test · Cyber Insurance',

    // Slide 10 — Market Size
    'TAM · 글로벌 순환 패션 + VTON': 'TAM · Global Circular Fashion + VTON',
    'SAM · 국내 리셀 + APAC 피팅': 'SAM · Korea Resale + APAC VTON',
    '₩5조+ (연 ~30%↑)': '$3.6B+ (~30% YoY)',
    'SOM · 초기 거점': 'SOM · Beachhead',
    '서울 2030 [TBD]': 'Seoul [TBD]',
    '* SOM 3개년 목표 MAU·GMV는 투자 규모 확정 시 기입 ([TBD])':
      '* 3-Year SOM target MAU & GMV to be finalized with round size ([TBD])',
    '글로벌 중고 리셀 (ThredUp 2026)': 'Global Secondhand Apparel (ThredUp 2026)',
    '버추얼 피팅 룸 (Mordor 2026)': 'Virtual Fitting Room (Mordor 2026)',
    '국내 중고 의류 시장 (어패럴뉴스)': 'Korea Secondhand Apparel (Apparel News)',
    '₩5조 돌파 (연 ~30%↑)': '₩5T+ / $3.6B+ (~30% YoY)',
    'WHY NOW — 3대 구조적 촉매': 'WHY NOW — 3 Structural Catalysts',
    '미판매 의류 폐기 금지 시행 → 순환 인프라 필수화': 'Unsold apparel destruction ban makes circular infrastructure mandatory',
    'WASM · AI 단가↓': 'WASM & AI Cost Drop',
    '온디바이스 전처리 ₩0 + 멀티모달 VTON 경제성 확보': '$0 on-device preprocessing + viable multimodal VTON unit costs',
    '59% 리셀 대중화': '59% Resale Adoption',
    '소비자 59% 중고 구매 경험 · 2030 리셀 일상화': '59% of shoppers buy secondhand · Gen-Z/Millennial resale normalized',
    '출처: ThredUp 14th Annual Resale Report (2026.04), Mordor Intelligence Virtual Fitting Room Report (2026.09), EU ESPR (2026.07), 어패럴뉴스.':
      'Sources: ThredUp 14th Annual Resale Report (Apr 2026), Mordor Intelligence Virtual Fitting Room Report (Sep 2026), EU ESPR (Jul 2026), Apparel News.',

    // Slide 11 — Competition
    '▲ 0B 보안 · 구매→리셀 순환 완결': '▲ 0B Privacy · Full Buy→Resale Loop',
    '▼ 단절된 단일 기능 · 프라이버시 취약': '▼ Siloed Single Feature · Weak Privacy',
    '◀ 단품 보관/정면': '◀ Single-Item / Front',
    '멀티레이어 AI OS ▶': 'Multi-Layer AI OS ▶',
    '기존 옷장 앱': 'Legacy Closets',
    '단품 AI VTON': '1-Item VTON',
    '중고 플랫폼': 'Resale Apps',
    '유일한 통합 OS': 'Only Unified OS',
    'X: 멀티레이어 피팅 깊이': 'X: Multi-Layer Fitting Depth',
    'Y: 보안 · 순환 완결성': 'Y: Privacy & Circular Loop Depth',
    '핵심 역량': 'Core Capability',
    '옷장 앱': 'Closet Apps',
    '단품 VTON': '1-Item VTON',
    '중고 마켓': 'Resale Market',
    '360° 4겹+ 피팅': '360° 4+ Layer Fit',
    '콜라주': 'Collage',
    '1벌 정면': '1-Item Front',
    '8방향 VTON': '8-Angle VTON',
    '기상·거리뷰 무대': 'Weather · Street Stage',
    '텍스트': 'Text Only',
    '실시간 기상·우산': 'Live Weather · Rain',
    '0B 얼굴·-96%': '0B Face · -96%',
    '4대 방어선': '4 Defenses',
    '중복 판독·CPW': 'Duplicate · CPW',
    '제한적': 'Limited',
    '3초 실시간': '3-Sec Real-Time',
    '외부링크': 'Ext. Link',
    '수동촬영': 'Manual Shoot',
    '사진·이력 연동': 'Cutout + Wear Log',
    '복리 데이터 전환 비용 (Switching Cost)': 'Compounding Data Switching Cost',
    '등록 옷장·착용 이력이 쌓일수록 중복 판독·코디·리셀 신뢰도가 함께 복리 강화':
      'Every logged garment and outfit compounds duplicate detection, styling accuracy, and resale trust.',

    // Slide 12 — Business Model 1
    'iNVTRY Pro 구독': 'iNVTRY Pro Subscription',
    '/월 [TBD]': '/mo [TBD]',
    '무제한 4겹+ 360° VTON · CPW·휴면 리포트': 'Unlimited 4+ layer 360° VTON · CPW & idle asset insights',
    '연간 20% 할인': '20% Annual Discount',
    '갭(Gap) 커머스': 'Gap Commerce',
    '구매 수수료': 'Affiliate CPS',
    '내 옷장 공백 1벌 AI 사전 조합 → 제휴 결제': 'AI pre-pairs 1 missing closet piece → partner checkout',
    '무신사·29CM·자사몰': 'Retail & Brand Partners',
    '반품률↓': 'Lower Returns',
    '인증 리셀 · 세탁 O2O': 'Verified Resale · Care O2O',
    '거래 Take Rate': 'GMV Take Rate',
    '90일+ 휴면 감지 → 1탭 리셀 + 비대면 세탁 수거': '90d+ idle detection → 1-tap resale + doorstep laundry',
    '공급 마찰 0': 'Zero Listing Drag',
    '순환 완결': 'Closed Loop',
    '브랜드 VTON SDK': 'Brand VTON SDK',
    '월정액+CPC': 'SaaS + CPC',
    '편집숍·디자이너 신상 디지털 시드 입점·반품 절감': 'Digital seed drops for boutiques & designers · cuts returns',
    '브랜드 파트너': 'Brand Partners',
    'FREEMIUM → MULTI-STREAM LTV: 무료 유입(₩0) → Pro 구독(ARR) → 갭 커머스(CPS) → 인증 리셀(Take Rate)':
      'FREEMIUM → MULTI-STREAM LTV: $0 Acquisition → Pro Sub (ARR) → Gap Commerce (CPS) → Verified Resale (Take Rate)',
    '여정 단계': 'Journey Stage',
    'Free (₩0 유입 · 락인)': 'Free ($0 Entry · Lock-in)',
    'iNVTRY Pro (유료 전환)': 'iNVTRY Pro (Paid Upgrade)',
    '전환 트리거': 'Upgrade Trigger',
    '① 옷장 · 중복 체크': '① Closet & Duplicate Gate',
    '배경 제거 · EXIF · 중복 판독 무제한 (₩0)': 'Unlimited cutout, EXIF strip & duplicate check ($0)',
    '택 OCR · 이염 경고 · 대용량 백업': 'Tag OCR · color-bleed alerts · cloud backup',
    '옷장 20벌 Lock-in': '20-Item Closet Lock-in',
    '② AI VTON 피팅': '② AI VTON Fitting',
    '기본 아바타 · 월 쿼터 제한': 'Base avatar · monthly VTON quota',
    '무제한 4겹+ 8방향 VTON · 거리뷰 무대': 'Unlimited 4+ layer 8-angle VTON · street backdrop',
    '외출·계절 쿼터 소진': 'Seasonal Quota Limit',
    '③ 커머스 · 리셀': '③ Commerce & Resale',
    '기본 착용 기록 · 세탁 지도 · 갭 추천': 'Basic wear log · care map · gap picks',
    'CPW 자산 리포트 · 리셀 수수료 우대': 'CPW asset report · reduced resale fee',
    '1벌 판매로 연 구독 회수': '1 Resale Pays Annual Sub',

    // Slide 13 — Business Model 2
    '복합 LTV 엔진': 'Multi-LTV Engine',
    '① 무료 중복 체크': '① Free Duplicate Check',
    'Low CAC · 서버 ₩0': 'Low CAC · $0 Server',
    '② 옷장 20벌 등록': '② Log 20+ Garments',
    '데이터 Lock-in': 'Data Lock-in',
    '③ 매일 4겹+ AI 피팅': '③ Daily 4+ Layer Fit',
    'Pro 월 구독 (ARR)': 'Pro Monthly Sub (ARR)',
    '④ 옷장 갭(Gap) 매칭': '④ Closet Gap Match',
    '제휴 CPS 5~12%': 'Affiliate CPS 5–12%',
    '⑤ 1탭 인증 리셀': '⑤ 1-Tap Verified Resale',
    '수수료 3~8% + O2O': '3–8% Fee + Care O2O',
    '리셀 현금화 → 새 옷 재구매': 'Resale Cash-Out → Re-Spend Loop',
    '4-Way LTV 순환': '4-Way LTV Cycle',
    'AI 추론 원가 방어 메커니즘 (BEFORE vs iNVTRY)': 'AI Inference Cost Defense (Legacy Cloud vs iNVTRY)',
    '₩0 온디바이스': '$0 On-Device',
    '01. 의류 배경 제거 & 안면 피부톤': '01. Garment Cutout & Facial Skin-Tone',
    '클라이언트 100% 절감': '100% Offloaded to Client',
    '기존 클라우드': 'Legacy Cloud',
    '서버 GPU 호출 · 유저 비례 적자': 'Server GPU per call · negative unit margin at scale',
    '서버 GPU 호출 · 사용자 비례 적자': 'Server GPU per call · negative unit margin at scale',
    '₩0': '$0',
    'WASM 온디바이스 (0B Egress)': 'On-Device WASM (0B Egress)',
    '02. 이미지 저장 · AI 전송 대역폭': '02. Image Storage & AI Payload Bandwidth',
    '원본 JPEG': 'Raw JPEG',
    '03. 4겹+ VTON 코디 재조회': '03. Repeat 4+ Layer VTON Lookups',
    '중복 추론 원천 제거': 'Zero Redundant Inference',
    '기존 생성 AI': 'Legacy Gen-AI',
    '동일 착장 매 요청 반복 추론 과금': 'Re-runs expensive GPU inference on every repeat view',
    'iNVTRY 캐시': 'iNVTRY Cache',
    '착장 해시 캐시 + 8방향 재활용 + Free 쿼터': 'Outfit hash cache + 8-angle reuse + Free tier quota',
    '세부 P&L [TBD]': 'Detailed P&L [TBD]',
    '목표 총이익률': 'Gross Margin',
    '3초 중복 체크 · 360° OOTD 공유 자연 유입': 'Organic installs via 3-sec duplicate check & 360° OOTD shares',
    '구독 + 갭 CPS + 연 리셀·O2O 수수료 누적': 'Compounds subscription + gap CPS + annual resale & care fees',
    '* 베타 실측 코호트(전환율·리텐션·API 원가) 반영 후 3개년 손익 확정 예정':
      '* 3-year P&L to be finalized with live beta cohort conversion, retention & API unit costs',

    // Slide 14 — Traction & 6-Tier Architecture
    'Three.js 3D 공식 웹 Cloudflare Workers 글로벌 배포 운영': 'Live Three.js 3D official showcase deployed globally on Cloudflare Workers',
    '단위·모바일 WebGL E2E · strict TS · oxlint · 시크릿 스캔': 'Unit & mobile WebGL E2E · strict TS · oxlint · secret scanning',
    '단일 하이브리드 코드': 'Single Hybrid Codebase',
    'Three.js 3D 모캡·물리': 'Three.js 3D Mocap & Physics',
    'Blender 4.0 CMU 모캡 리타게팅 + SpringBone 지글 물리': 'Blender 4.0 CMU mocap retargeting + SpringBone cloth physics',
    '프라이빗 베타 사전 신청 접수 중': 'Private Beta Waitlist Open',
    '코호트 [TBD]': 'Cohort [TBD]',
    '출시 직후 옷장 등록 수 · 주간 피팅 빈도 · 중복 차단율 실측 업데이트 예정':
      'Live closet items, weekly fit frequency & duplicate-block rate updated post-launch',
    'Express 5 · Gzip JSON · 메뉴 · 버튼 RBAC · 전 API IDOR 차단 → Cloud Run':
      'Express 5 · Gzip JSON · Menu/Action RBAC · All-API IDOR Guard → Cloud Run',
    'Vertex AI / Gemini Paid No-Training 멀티레이어 2D VTON + 8방향 QC 워커':
      'Vertex AI / Gemini Paid No-Train Multi-Layer 2D VTON + 8-Angle QC Worker',
    'Google Weather v1 · Places(세탁/수선) · Street View(무저장) · Geocoding':
      'Google Weather v1 · Places (Laundry/Tailor) · Street View (No-Store) · Geocoding',
    'Google Weather v1 · Places(세탁/수선) · Street View(미저장) · Geocoding':
      'Google Weather v1 · Places (Laundry/Tailor) · Street View (No-Store) · Geocoding',

    // Slide 15 — GTM & Roadmap
    '레이어드 피팅 · 온디바이스 기반': 'Layered Fitting & On-Device Core',
    '4겹+ VTON · 8방향 QC': '4+ Layer VTON · 8-Angle QC',
    '배경 제거 · WebP -96%': 'Auto Cutout · WebP -96%',
    'MediaPipe 0B 피부톤': 'MediaPipe 0B Skin Tone',
    '공간 맥락 · 보안 4대 방어선': 'Spatial Context & 4 Security Defenses',
    '실시간 날씨 · 거리뷰 무대': 'Live Weather & Street Stage',
    '주변 세탁·수선소 지도': 'Local Laundry & Tailor Map',
    'OIDC · 원클릭 영구파기': 'OIDC · 1-Click Atomic Wipe',
    '정식 출시 · Pro · 인증 리셀': 'Store Launch · Pro · Verified Resale',
    '스토어 출시 · Pro 구독': 'App Store Launch · Pro Sub',
    '택 OCR · OOTD 캘린더': 'Tag OCR · OOTD Calendar',
    '세탁 O2O · 1탭 리셀': 'Care O2O · 1-Tap Resale',
    'GO-TO-MARKET — 3대 초기 고객 획득 엔진 (SEOUL 2030 → GLOBAL)':
      'GO-TO-MARKET — 3 INITIAL ACQUISITION ENGINES (SEOUL 20s–30s → GLOBAL)',
    '오프라인 3초 중복 훅': '3-Sec In-Store Duplicate Hook',
    '성수·명동·더현대 쇼핑 시 보유 유사 옷 즉석 판독으로 즉시 설치 유인':
      'Instant duplicate alerts while shopping in Seongsu, Myeongdong & flagship malls drive organic installs',
    '360° OOTD 룩북 바이럴': '360° OOTD Lookbook Virality',
    '실시간 날씨·동네 배경 360° 착장 카드를 인스타·틱톡에 공유해 자연 유입':
      'Shareable 360° weather & local street outfit cards fuel Instagram & TikTok organic loops',
    '세탁 O2O · 편집숍 제휴': 'Care O2O & Boutique Partnerships',
    '디자이너 브랜드·세탁 수거·리셀 파트너와 초기 옷장 등록·유동성 동시 확보':
      'Partnering with boutiques, pickup cleaners & resale venues builds supply and liquidity together',

    // Slide 16 — Team & Governance
    'Raymond Moon (대표 · 창업자)': 'Raymond Moon (Founder & CEO)',
    '2D VTON AI 파이프라인': '2D VTON AI Pipeline',
    '0B 보안 백엔드': '0B Security Backend',
    'Web·iOS·Android 앱': 'Web · iOS · Android App',
    '[TBD: 대표 핵심 이력·학력 기입]': '[TBD: Founder Bio & Credentials]',
    '[TBD: 법인 설립 일정]': '[TBD: Incorporation Schedule]',
    'AI · 비전(VTON) 리드': 'AI / Vision (VTON) Lead',
    '멀티앵글 정밀도 · 추론 단가 절감': 'Multi-angle fidelity & inference cost optimization',
    '클라우드·보안 BE': 'Cloud & Security BE',
    '3-Zone·CMEK · 리셀 에스크로': '3-Zone CMEK · resale escrow backend',
    '보안': 'Security',
    '패션 MD·그로스': 'Fashion MD & Growth',
    '브랜드·세탁 O2O · 2030 그로스': 'Brand/O2O partnerships · 20s–30s growth',
    '제휴': 'Growth',
    '투자·정부사업·바우처 심사 대응 체계': 'VC, TIPS & Enterprise Audit Readiness',
    'GCP 3-Zone 물리 격리': 'GCP 3-Zone Physical Isolation',
    '외부 전문 모의해킹 의무화': 'Mandatory External Penetration Testing',
    '정식 출시 전 웹·모바일 취약점 진단 1회 수행': 'Full web & mobile vulnerability audit prior to commercial launch',
    '배상책임보험 · 24h 대응 SOP': 'Cyber Liability Insurance · 24h SOP',
    '개인정보보호 법적 리스크 선제 방어': 'Proactive legal & privacy incident risk coverage',
    '핵심 특허 2건+ 출원': '2+ Core Patent Filings',
    '0B 피부톤 · 8방향 레이어드 QC · 1탭 인증 리셀': '0B skin-tone calibration · 8-angle layering QC · 1-tap verified resale',

    // Slide 17 — Funding Ask
    '기입 필요': 'TO BE FILLED',
    '[TBD] 억원': '$[TBD]M / ₩[TBD]B',
    'Seed / Pre-A / TIPS 연계 ·': 'Seed / Pre-A / TIPS Matched ·',
    '18개월 런웨이': '18-Month Runway',
    '스토어 출시 · Pro 구독 전환 · 인증 리셀 거래 개시': 'App store launch · Pro sub conversion · verified resale GMV kickoff',
    'GCP 상용 보안 전환 · 모의해킹 · 핵심 특허 2건+': 'Production GCP security cutover · pen-test · 2+ core patent filings',
    'USE OF FUNDS — 18개월 자금 배분 계획': 'USE OF FUNDS — 18-MONTH CAPITAL ALLOCATION',
    '멀티레이어 VTON 고도화 · 택 OCR · 캘린더·인증 리셀 개발': 'Multi-layer VTON R&D · tag OCR · OOTD calendar & verified resale build',
    '25% · GTM · 파트너십': '25% · GTM & Partnerships',
    '서울 2030 초기 코호트 · OOTD 캠페인 · 편집숍·세탁 O2O 제휴': 'Seoul 20s–30s cohort · OOTD growth · boutique & laundry O2O alliances',
    '20% · 클라우드 · 보안': '20% · Cloud & Security',
    'GCS 3-Zone·CMEK · Vertex AI 추론 · 외부 모의해킹·보험': 'GCS 3-Zone CMEK · Vertex AI compute · external pen-test & cyber insurance',
    '10% · 운영 · IP 특허': '10% · Ops & IP Patents',
    '핵심 특허 2건+ 출원 · 법률·개인정보 검토 · 예비비': '2+ core patent filings · legal/privacy review · contingency reserve',
    '스토어 출시 · 3-Zone 모의해킹': 'Store Launch · 3-Zone Pen-Test',
    'Pro 구독 · 택 OCR · 갭 CPS 개시': 'Pro Sub · Tag OCR · Gap CPS Launch',
    '인증 리셀 · 특허 출원 → Series A': 'Verified Resale · Patents → Series A',

    // Slide 18 — Closing
    '감사합니다': 'Thank You',
    'Three.js 3D 공식 웹 · AI 피팅 체험': 'Live Three.js 3D Site & Interactive AI Studio',
    'Raymond Moon (대표)': 'Raymond Moon (Founder & CEO)',
    '제품 · AI VTON · Three.js · 보안 총괄': 'Product · AI VTON · Three.js · Security Architecture',
    '투자 · TIPS · 브랜드·세탁 O2O 제휴': 'Investment · TIPS · Brand & Care O2O Partnerships',
  };

  /**
   * Complete normalized Korean -> English map for `aria-label` and `alt` attributes.
   */
  const ATTR_EN = {
    '프레젠테이션 제어 바': 'Presentation Controls',
    'ainvtry.com 공식 사이트로 돌아가기': 'Return to ainvtry.com official site',
    '화면 비율 선택': 'Aspect ratio selector',
    '실크 배경 무드 선택': 'Silk backdrop mood selector',
    '라이트 다크 테마 선택': 'Light or Dark theme selector',
    '언어 선택': 'Language selector',
    '보기 모드': 'View mode selector',
    '이전 슬라이드': 'Previous slide',
    '다음 슬라이드': 'Next slide',
    '슬라이드 바로가기': 'Jump to slide',
    '표지': 'Cover Slide',
    'iNVTRY 로고': 'iNVTRY Logo',
    'iNVTRY 360도 가상 피팅 실구동 화면': 'iNVTRY 360-degree live virtual fitting screen',
    '목차': 'Table of Contents',
    '핵심 요약': 'Executive Summary',
    'iNVTRY 5단계 순환 루프': 'iNVTRY 5-stage circular loop',
    '6대 파편화된 페인포인트': '6 Fragmented Pain Points',
    '6대 페인포인트 일괄 해결 솔루션': '6-to-1 Unified Solution',
    '6단계 사용자 여정': '6-Cut User Journey',
    '사기 전 중복 확인': 'In-store duplicate check before buying',
    '사진 등록 및 택 스캔': 'Garment photo digitization and care tag scan',
    '내 동네 날씨 코디': 'Local neighborhood weather outfit styling',
    '캘린더 및 SNS 공유': 'OOTD calendar and social sharing',
    '세탁법 및 방문 수거': 'Garment care guide and laundry pickup',
    '안 입는 옷 간편 판매': '1-tap resale of unworn garments',
    '실구동 MVP 화면': 'Live MVP App Showcase',
    '360도 가상 피팅 화면': '360-degree layered virtual fitting screen',
    'AI 디지털 옷장 화면': 'AI digital wardrobe screen',
    '옷장 CPW 및 활용률 통계 화면': 'Wardrobe CPW and wear-rate analytics screen',
    '온디바이스 피부톤 및 체형 프로필 화면': 'On-device skin-tone and body morph profile screen',
    '핵심 기술 스택': 'Core Technology Engine',
    '전처리 전 원본 의류': 'Raw garment photo before on-device preprocessing',
    '전처리 후 비식별 WebP': 'De-identified WebP cutout after preprocessing',
    '프라이버시 보안 해자': 'Privacy-by-Design Security Moat',
    '온디바이스에서 클라우드까지의 제로트러스트 데이터 흐름': 'Zero-trust data flow from edge device to cloud',
    '시장 규모 및 성장 배경': 'Market Size and Growth Catalysts',
    'TAM SAM SOM 시장 구조도': 'TAM SAM SOM concentric market sizing chart',
    '경쟁 구도 및 포지셔닝': 'Competitive Landscape and Positioning',
    '경쟁사 2x2 포지셔닝 맵': '2x2 competitive positioning matrix',
    '경쟁사 5대 역량 비교': '5-dimension competitive feature matrix',
    '비즈니스 모델 1 — 4중 수익 모델': 'Business Model 1 — 4-Engine Revenue',
    'Free vs Pro 티어 비교': 'Free vs Pro tier comparison matrix',
    '비즈니스 모델 2 — 플라이휠 및 AI 원가 방어': 'Business Model 2 — LTV Flywheel and AI Cost Defense',
    '5단계 수익 선순환 플라이휠': '5-stage circular LTV flywheel',
    '목표 매출총이익률 70% 이상': 'Target gross margin 70% or higher',
    '개발 검증 실적 및 6-Tier 아키텍처': 'Traction and 6-Tier Full-Stack Architecture',
    '성장 전략 및 로드맵': 'Go-to-Market Strategy and 18-Month Roadmap',
    '팀 구성 및 거버넌스': 'Team and 2027 Security Governance',
    '투자 제안 및 자금 집행 계획': 'Funding Ask and Use of Funds',
    '자금 배분 도넛 차트: R&D 45%, GTM 25%, 보안 20%, 운영 IP 10%': 'Use of funds donut chart: 45% R&D, 25% GTM, 20% Cloud & Security, 10% Ops & IP',
    '감사합니다': 'Thank You Closing Slide',
  };

  window.IR_DECK_I18N = {
    DOC_TITLE,
    RICH_HTML_EN,
    TEXT_EN,
    ATTR_EN,
    formatBoundEn,
  };
})();
