/* ============================================================================
 * iNVTRY (Ainvtry) IR Business Plan Deck v6.0 — Bilingual KO <-> EN Dictionary
 * Covers all 19 slides (14 Core + 5 Appendix), SVG labels, and live bindings.
 * ============================================================================ */
(function initIrDeckI18n() {
  'use strict';

  const DOC_TITLE = {
    ko: 'iNVTRY (인벤토리) — IR 사업계획서 v6.0',
    en: 'iNVTRY — Investor Business Plan v6.0 (14 Core + 5 Appendix)',
  };

  const RICH_HTML_EN = {
    '[data-i18n-rich="s02-h2"]': 'Executive Summary — <span class="accent-text">iNVTRY Business Plan</span>',
    '[data-i18n-rich="s03-h2"]': 'Wardrobe Blindness Drives <span class="accent-text">Duplicate Buying &amp; Return Losses</span>',
    '[data-i18n-rich="s04-h2"]': 'Standalone Try-On Shutdown &amp; <span class="accent-text">Platform Absorption Defense</span>',
    '[data-i18n-rich="s05-h2"]': 'Enter via <span class="accent-text">Pre-Purchase Duplicate Check</span>, Expand to Circular Closet',
    '[data-i18n-rich="s06-h2"]': 'Live Product Demo — <span class="accent-text">Fitting · Weather · On-Device Profile</span>',
    '[data-i18n-rich="s07-h2"]': 'Keep Faces On-Device, <span class="accent-text">Infer Only Lightweight Data</span>',
    '[data-i18n-rich="s08-h2"]': 'Decoupled Markets &amp; <span class="accent-text">Revenue-Pool Sizing</span>',
    '[data-i18n-rich="s09-h2"]': 'The <span class="accent-text">Unoccupied Space</span>: Owned-Closet Check + On-Device Privacy',
    '[data-i18n-rich="s10-h2"]': 'Subscription First, <span class="accent-text">Usage Caps &amp; Caching</span> for Cost Control',
    '[data-i18n-rich="s11-h2"]': 'Working Product Ready — Launching <span class="accent-text">3-Stage Beta Validation</span>',
    '[data-i18n-rich="s12-h2"]': 'Single Pre-Seed Round: <span class="accent-text">3 Milestones</span> to Seed',
    '[data-i18n-rich="s13-h2"]': 'Solo Full-Stack Execution + <span class="accent-text">3 Key Hires</span>',
    '[data-i18n-rich="s14-h2"]': 'One Round to Validate 3 Milestones &amp; <span class="accent-text">Enter Seed</span>',
    '[data-i18n-rich="s15-h2"]': 'Appendix 01 — <span class="accent-text">Academic &amp; Survey Evidence</span>',
    '[data-i18n-rich="s16-h2"]': 'Appendix 02 — <span class="accent-text">8-Service Direct Audit</span>',
    '[data-i18n-rich="s17-h2"]': 'Appendix 03 — <span class="accent-text">6-Layer System Architecture</span>',
    '[data-i18n-rich="s18-h2"]': 'Appendix 04 — <span class="accent-text">Privacy, Security &amp; Retention Policy</span>',
    '[data-i18n-rich="s19-h2"]': 'Appendix 05 — <span class="accent-text">Full References &amp; Contact</span>',
  };

  const TEXT_EN = {
    // Toolbar & Mobile Sheet
    '설정': 'Settings',
    '닫기': 'Close',
    '표시 설정': 'Display Settings',
    '언어': 'Language',
    '테마': 'Theme',
    '← 이전': '← Prev',
    '다음 →': 'Next →',
    '16:9 PDF 저장 / 인쇄': 'Save / Print 16:9 PDF',

    // Jump Select Options
    '02 · 핵심 요약 — 한눈에 보는 사업계획서': '02 · Executive Summary — At a Glance',
    '03 · 핵심 문제 — 중복 구매와 온라인 반품 손실': '03 · Core Problem — Duplicate Buying & Returns',
    '04 · 지금인 이유 — 단독 AI 피팅 종료와 대응 전략': '04 · Why Now — Post-Doppl & Defense',
    '05 · 해법과 첫 진입 기능 — 중복 판독에서 순환 옷장으로': '05 · Solution & Wedge — Pre-Purchase to Circular',
    '06 · 제품 시연 — 실제 구동 앱 화면 (데모 데이터)': '06 · Product Demo — Live App Screens (Demo Data)',
    '07 · 기술과 개인정보 — 서버 전송 vs 기기 내 격리': '07 · Tech & Privacy — Server vs On-Device',
    '08 · 시장 규모 — 거래액·소프트웨어 분리 및 수익풀': '08 · Market Size — Decoupled Pools & SAM/SOM',
    '09 · 경쟁과 차별점 — 기능 비교와 플랫폼 흡수 방어': '09 · Competition — Feature Matrix & Moat',
    '10 · 수익 모델과 단위경제 — 구독 · 원가 통제 · 신뢰 정책': '10 · Revenue & Unit Economics — Guardrails & Policy',
    '11 · 트랙션과 검증 계획 — 사전 출시 및 3단계 베타 실험': '11 · Traction & Plan — Pre-Launch Validation',
    '12 · 시장 진입 전략과 로드맵 — 단일 라운드 18개월 실행': '12 · GTM & Roadmap — 18-Month Single Round',
    '13 · 팀 — 1인 풀스택 실행력과 핵심 채용 계획': '13 · Team — Solo Execution & Key Hires',
    '14 · 투자 제안 — 프리시드 · 자금 사용처 · 마일스톤': '14 · Investment Ask — Pre-Seed & Milestones',
    '부록 01 · 문제별 학술·설문 근거 요약': 'Appendix 01 · Academic & Survey Evidence',
    '부록 02 · 경쟁 서비스 8종 직접 점검표': 'Appendix 02 · 8-Service Direct Audit',
    '부록 03 · 시스템 6개 계층 구조 (현재 vs 목표)': 'Appendix 03 · 6-Layer Architecture (Now vs Target)',
    '부록 04 · 개인정보·보안 상세 및 파기 정책': 'Appendix 04 · Security & Retention Policy',
    '부록 05 · 전체 출처 목록 및 연락처': 'Appendix 05 · Full Sources & Contact',

    // Slide 01
    '(인벤토리)': '(Inventory)',
    '보유 옷 기반 중복 구매 차단 · 8각도 AI 가상 피팅 디지털 옷장': 'Owned-Closet Duplicate Blocker · 8-Angle AI Virtual Try-On Wardrobe',
    'iNVTRY(인벤토리) · 보유 옷 중복 구매 차단 · 8각도 AI 가상 피팅': 'iNVTRY · Owned-Closet Duplicate Blocker · 8-Angle AI Virtual Try-On',
    '프리시드 (협의 중)': 'Pre-Seed (In Discussion)',

    // Common Footers & Eyebrows
    'iNVTRY 사업계획서 v6.0': 'iNVTRY Business Plan v6.0',
    'iNVTRY 사업계획서 v6.0 · 부록': 'iNVTRY Business Plan v6.0 · Appendix',
    '02 / 14 · 핵심 요약': '02 / 14 · Executive Summary',
    '본문 14장 · 부록 5장 (총 19장)': '14 Core Slides · 5 Appendix (19 Total)',
    '03 / 14 · 핵심 문제': '03 / 14 · Core Problem',
    '01부 · 문제 정의': 'Part 01 · Problem',
    '04 / 14 · 지금인 이유': '04 / 14 · Why Now',
    '01부 · 기존 대안의 한계': 'Part 01 · Status Quo Limits',
    '05 / 14 · 해법과 첫 진입 기능': '05 / 14 · Solution & Wedge',
    '01부 · 웨지 확장 전략': 'Part 01 · Wedge Expansion',
    '06 / 14 · 제품 시연': '06 / 14 · Product Demo',
    '02부 · 실제 구동 화면': 'Part 02 · Live Screens',
    '데모 데이터 포함': 'Includes Demo Data',
    '07 / 14 · 기술과 개인정보 설계': '07 / 14 · Tech & Privacy',
    '02부 · 데이터 경계': 'Part 02 · Data Boundaries',
    '08 / 14 · 시장 규모': '08 / 14 · Market Size',
    '03부 · 분리 산정 원칙': 'Part 03 · Decoupled Sizing',
    '09 / 14 · 경쟁과 차별점': '09 / 14 · Competition & Moat',
    '03부 · 구조적 비교': 'Part 03 · Structural Comparison',
    '10 / 14 · 수익 모델과 단위경제': '10 / 14 · Revenue & Unit Economics',
    '03부 · 원가 통제와 신뢰 정책': 'Part 03 · Cost Guardrails & Policy',
    '11 / 14 · 트랙션과 검증 계획': '11 / 14 · Traction & Validation',
    '04부 · 사전 출시 현황': 'Part 04 · Pre-Launch Status',
    '12 / 14 · 시장 진입과 로드맵': '12 / 14 · GTM & Roadmap',
    '04부 · 18개월 실행 계획': 'Part 04 · 18-Month Execution',
    '13 / 14 · 팀': '13 / 14 · Team',
    '04부 · 실행력과 채용 계획': 'Part 04 · Execution & Hiring',
    '14 / 14 · 투자 제안': '14 / 14 · Investment Ask',
    '04부 · 프리시드 라운드': 'Part 04 · Pre-Seed Round',
    '부록 01 / 05 · 근거 자료': 'Appendix 01 / 05 · Evidence',
    '부록 02 / 05 · 경쟁 직접 점검': 'Appendix 02 / 05 · Direct Audit',
    '부록 03 / 05 · 기술 아키텍처': 'Appendix 03 / 05 · Architecture',
    '부록 04 / 05 · 보안 · 파기 정책': 'Appendix 04 / 05 · Security & Retention',
    '부록 05 / 05 · 출처 및 연락처': 'Appendix 05 / 05 · Sources & Contact',

    // Slide 02
    '01부': 'Part 01',
    '02부': 'Part 02',
    '03부': 'Part 03',
    '04부': 'Part 04',
    '문제와 해법': 'Problem & Solution',
    '제품과 기술': 'Product & Tech',
    '시장과 수익': 'Market & Revenue',
    '검증과 투자 제안': 'Traction & Ask',
    '핵심 문제 · 중복과 반품': 'Core Problem · Duplicates & Returns',
    '지금인 이유 · Doppl 종료': 'Why Now · Post-Doppl Shift',
    '첫 진입 기능과 확장': 'Wedge Entry & Expansion',
    '실제 앱 시연 (데모)': 'Live Product Demo',
    '기술과 개인정보 설계': 'Tech & Privacy Boundary',
    '시스템 6개 계층 구조': '6-Layer Architecture',
    '시장 규모 · 수익풀': 'Market Size · Revenue Pools',
    '경쟁과 차별점': 'Competition & Moat',
    '수익 모델 · 단위경제': 'Revenue & Unit Economics',
    '트랙션 · 검증 계획': 'Traction & Validation Plan',
    '진입 전략 · 로드맵': 'GTM & 18-Month Roadmap',
    '팀 · 핵심 채용': 'Team & Key Hires',
    '투자 제안 (프리시드)': 'Investment Ask (Pre-Seed)',
    '항목을 누르면 해당 슬라이드로 바로 이동합니다 · 상세 근거는 부록 01~05 수록': 'Click any item to jump directly · Detailed evidence in Appendix 01–05',

    // Status Badges
    '출시': 'Live',
    '베타': 'Beta',
    '개발 예정': 'Planned',
    '상태 범례:': 'Status:',

    // Slide 08, 10, 14 Key Phrases
    '시장 A · 거래액': 'Market A · GMV',
    '글로벌 중고 의류 시장 (2025→2030)': 'Global Secondhand Apparel (2025→2030)',
    '+36% 성장': '+36% Growth',
    '직접 매출 아님': 'Not Direct Revenue',
    '시장 B · 소프트웨어': 'Market B · Software',
    '글로벌 가상 피팅 시장 (2026→2031)': 'Global Virtual Fitting Software (2026→2031)',
    '연평균 19.5%': '19.5% CAGR',
    '시장 A와 합산 배제': 'Never Summed w/ GMV',
    'iNVTRY 수익풀 산정 구조': 'iNVTRY Revenue-Pool Architecture',
    '순수 매출 기준': 'Net Revenue Basis',
    '거래액이 아닌 실제 수취 매출로 산정합니다': 'Sized strictly on capturable revenue, never summed GMV',
    '유효 수익풀 (SAM) 계산식': 'Serviceable Available Market (SAM) Formula',
    '초기 목표 수익풀 (SOM)': 'Serviceable Obtainable Market (SOM)',
    '확정값 협의 후 공유': 'Shared Upon Discussion',
    '협의 후 공유': 'Shared Upon Discussion',
    '프리시드': 'Pre-Seed',
    '단일 라운드 집중 · 지분 희석 최소화': 'Single Round Discipline · Minimal Dilution',
    'SAFE 또는 지분 투자 유연 협의': 'Flexible SAFE or Equity Structure',
    '월 소진액 상세 내역 데이터룸 협의 공유': 'Monthly burn breakdown shared in dataroom discussion',
    '자금 사용처 (비율 구조)': 'Use of Funds (Allocation)',
    '100% 배분': '100% Allocated',
    '제품 · AI 고도화 및 iOS 출시': 'Product, AI & iOS Launch',
    '베타 고객 확보 및 검증 실험': 'Beta Acquisition & Experiments',
    '인프라 · 보안 · 운영 예비비': 'Infra, Security & Reserve',
    '시드 라운드 진입을 위한 정량 마일스톤 3개': '3 Quantitative Milestones to Seed Round',
    '실구동 체험 및 투자 문의': 'Live Demo & Investor Inquiries',
  };

  const ATTR_EN = {
    'IR 프레젠테이션 도구 모음': 'IR Presentation Toolbar',
    'iNVTRY 공식 사이트로 이동': 'Back to iNVTRY Official Site',
    '슬라이드 바로가기': 'Jump to slide',
    '언어 전환': 'Switch language',
    '테마 전환': 'Switch theme',
    '이전 슬라이드': 'Previous slide',
    '다음 슬라이드': 'Next slide',
    'PDF 인쇄 저장': 'Print / Save PDF',
    '표시 설정 열기': 'Open display settings',
  };

  function formatBoundEn(key, koText) {
    if (key === 'hero.kicker') return 'Digital Wardrobe in Your Pocket';
    if (key === 'hero.titleLead') return 'Welcome to Your Inventory';
    if (key === 'hero.tocCover') return '01 · Cover — Welcome to Your Inventory · iNVTRY';
    if (key === 'meta.founderContact') return 'Raymond Moon (CEO) · raymond@ainvtry.com';
    if (key === 'meta.locationDate') return koText.replace('대한민국 서울', 'Seoul, South Korea');
    if (key === 'journey.buy.badge' || key === 'journey.weather.badge' || key === 'journey.share.badge') return 'Live';
    if (key === 'journey.scan.badge') return 'Beta';
    if (key === 'journey.care.badge' || key === 'journey.resale.badge') return 'Planned';
    if (key === 'roadmap.stage-1.badge') return 'Phase 1 · Built';
    if (key === 'roadmap.stage-2.badge') return 'Phase 2 · Built';
    if (key === 'roadmap.stage-3.badge') return 'Phase 3 · Planned';
    if (key === 'versions.threeVtonTag') return koText.replace('연출 · 8각도 AI 가상 피팅', 'Stage · 8-Angle AI Try-On');
    if (key === 'versions.stackShort') return koText.replace('(Android · Web 우선, iOS 예정)', '(Android & Web First, iOS Planned)');
    if (key === 'versions.clientEdge') return koText.replace('얼굴 원본 0B', 'Face Raw 0B');
    if (key === 'performance.fpsThreeChip') return koText.replace('연출', 'Stage');
    if (key === 'garment.wasmNote') return koText.replace('기기 내 처리', 'On-Device');
    return koText;
  }

  window.IR_DECK_I18N = {
    DOC_TITLE,
    RICH_HTML_EN,
    TEXT_EN,
    ATTR_EN,
    formatBoundEn,
  };
})();
