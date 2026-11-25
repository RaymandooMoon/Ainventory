import type { SiteIconKey } from '../SiteIcon.tsx';
import type { SiteLang } from '../siteContent.ts';

export interface ArchTechItem {
  readonly id: string;
  readonly icon: SiteIconKey;
  readonly name: string;
  readonly badge: string;
  readonly descKo: string;
  readonly descEn: string;
}

export interface GovernanceUnifiedTechItem extends ArchTechItem {
  readonly nodeId: 'gov-audit' | 'gov-rbac' | 'gov-cicd';
  readonly pillarIndex: 0 | 1 | 2;
}

type ArchModeKey = 'mvp' | 'prod';

interface NodeTechEntry {
  readonly mvp: readonly ArchTechItem[];
  readonly prod: readonly ArchTechItem[];
}

/**
 * Deduplicated, zero-overlap technology stack catalog expanded inside the
 * Architecture Blueprint HUD across Tiers 01..07 (MVP & Prod).
 *
 * Ownership boundaries (single source of truth):
 * - 01 Client     : Browser/PWA, Capacitor Mobile, Seed Asset QC & Telemetry Ops
 * - 02 Edge       : CDN Delivery, TLS/HSTS, Rate Limiter, Cloud LB & WAF
 * - 03 Gateway    : Express 5 / Cloud Run Routing, Stateless OIDC/JWT, Payload Schema Guard
 * - 04 Core       : Three.js 3D & VTON Engine, 11-Slot Closet/CPW, Geo/Weather Proxy, Resale
 * - 05 Shared     : Runtime Logging/OTel, Object Storage (3-Zone / Signed URL), Async Queue
 * - 06 Data · HW  : SQL DB, TTL/Redis Cache, Vertex AI & NVIDIA L4/A100 GPU, Secrets/KMS Vault
 * - 07 Governance : Audit (PII Audit · Secret Gate), RBAC (Menu/Btn UI · IDOR), CI/CD (360+ QA)
 */
const NODE_TECH_CATALOG: Readonly<Record<string, NodeTechEntry>> = {
  /* ----------------------------------------------------------------------
   * 01 CLIENT APPS
   * ---------------------------------------------------------------------- */
  'invtry-web': {
    mvp: [
      {
        id: 'react19',
        icon: 'globe',
        name: 'React 19 + TS 7',
        badge: 'UI',
        descKo: '컴포넌트 기반 반응형 SPA 및 엄격한 타입 검증',
        descEn: 'Strict-typed component SPA with concurrent UI updates',
      },
      {
        id: 'vite8',
        icon: 'zap',
        name: 'Vite 8 · Priority',
        badge: 'Perf',
        descKo: '초고속 ESM 코드 스플리팅 및 페인트 후 리소스 우선순위 스케줄러',
        descEn: 'Fast ESM code splitting with post-paint resource priority scheduling',
      },
      {
        id: 'mediapipe',
        icon: 'scanFace',
        name: 'MediaPipe WASM',
        badge: '0B Face',
        descKo: '안면 랜드마크 · 피부톤 분석을 기기 로컬에서 0B 처리 및 보관',
        descEn: '0-byte on-device face landmark & skin-tone inference kept strictly local',
      },
      {
        id: 'bg-removal',
        icon: 'imageMinus',
        name: 'WebP Cutout',
        badge: 'WASM',
        descKo: '의류 배경 제거 및 투명 WebP 정규화 파이프라인',
        descEn: 'Client-side garment background removal to transparent WebP',
      },
    ],
    prod: [
      {
        id: 'pwa-sw',
        icon: 'globe',
        name: 'Service Worker PWA',
        badge: 'Offline',
        descKo: '오프라인 앱 셸 캐싱 및 설치형 PWA 런타임',
        descEn: 'Installable PWA shell with resilient offline caching',
      },
      {
        id: 'indexeddb',
        icon: 'database',
        name: 'IndexedDB Sync',
        badge: 'Local-First',
        descKo: '오프라인 우선 옷장 로컬 캐시 및 낙관적 동기화 큐',
        descEn: 'Offline-first closet cache with optimistic mutation queue',
      },
      {
        id: 'mediapipe-prod',
        icon: 'scanFace',
        name: 'On-Device WASM',
        badge: '0B Face',
        descKo: '전 플랫폼 얼굴 원본 서버 무전송 원칙의 로컬 비전 추론',
        descEn: 'Zero-upload on-device vision inference for biometric privacy',
      },
    ],
  },
  'invtry-native': {
    mvp: [
      {
        id: 'capacitor8',
        icon: 'smartphone',
        name: 'Capacitor 8',
        badge: 'Hybrid',
        descKo: '단일 웹 코드베이스 기반 iOS · Android 네이티브 브리지',
        descEn: 'Single-codebase iOS & Android native WebView bridge',
      },
      {
        id: 'haptics',
        icon: 'sparkles',
        name: 'Native Haptics',
        badge: 'UX',
        descKo: '착장 선택 · 탭 전환 시 네이티브 촉각 피드백 연동',
        descEn: 'Tactile native haptic feedback for garment & tab actions',
      },
      {
        id: 'camera-native',
        icon: 'camera',
        name: 'Camera Bridge',
        badge: 'Capture',
        descKo: '모바일 카메라 의류 촬영 및 EXIF 즉시 제거 파이프라인',
        descEn: 'Native camera capture with instant EXIF metadata stripping',
      },
    ],
    prod: [
      {
        id: 'keychain',
        icon: 'lock',
        name: 'Keychain / Keystore',
        badge: 'Secure',
        descKo: '하드웨어 보안 영역에 세션 자격증명 암호화 저장',
        descEn: 'Hardware-backed credential storage on iOS & Android',
      },
      {
        id: 'store-release',
        icon: 'rocket',
        name: 'App Store / Play',
        badge: 'Release',
        descKo: '서명된 AAB · IPA 자동 배포 및 유니버설 딥링크 라우팅',
        descEn: 'Signed AAB & IPA store builds with universal deep links',
      },
      {
        id: 'capacitor-push',
        icon: 'zap',
        name: 'Native Push & Sync',
        badge: 'Mobile',
        descKo: '날씨 · 코디 리마인더 및 백그라운드 상태 동기화',
        descEn: 'Weather outfit reminders and background state sync',
      },
    ],
  },
  'ops-console': {
    mvp: [
      {
        id: 'seed-qc',
        icon: 'layoutGrid',
        name: 'Seed Asset QC',
        badge: 'Assets',
        descKo: '8방향 모델 비율 · 컷아웃 및 시드 의류 에셋 품질 검수',
        descEn: 'Quality checks for 8-angle model proportions & seed garment cutouts',
      },
      {
        id: 'demo-sandbox',
        icon: 'box',
        name: 'Demo Sandbox',
        badge: 'Preview',
        descKo: '비로그인 방문자용 읽기 전용 시연 옷장 및 스타일 프리셋 운영',
        descEn: 'Read-only showcase wardrobe & style preset sandbox for visitors',
      },
    ],
    prod: [
      {
        id: 'telemetry-ops',
        icon: 'barChart',
        name: 'Quality Telemetry',
        badge: 'SLA',
        descKo: 'VTON 합성 성공률 · 응답 지연시간 실시간 모니터링 콘솔',
        descEn: 'Real-time VTON synthesis success rate & latency SLA dashboard',
      },
      {
        id: 'catalog-ops',
        icon: 'layoutGrid',
        name: 'Catalog Curation',
        badge: 'Ops',
        descKo: '시즌 룩북 · 브랜드 텍소노미 · 스타일 템플릿 운영 도구',
        descEn: 'Seasonal lookbook, brand taxonomy & style template curation console',
      },
    ],
  },

  /* ----------------------------------------------------------------------
   * 02 EDGE ACCESS
   * ---------------------------------------------------------------------- */
  cdn: {
    mvp: [
      {
        id: 'cf-workers',
        icon: 'cloud',
        name: 'Cloudflare Workers',
        badge: 'Edge',
        descKo: '전 세계 엣지 POP에서 정적 앱 셸과 시드 WebP 초저지연 전송',
        descEn: 'Low-latency global edge delivery for static app shell & WebP',
      },
      {
        id: 'brotli-webp',
        icon: 'zap',
        name: 'HTTP/3 + WebP',
        badge: 'Perf',
        descKo: 'QUIC HTTP/3 멀티플렉싱 및 불변 압축 이미지 캐시 헤더',
        descEn: 'HTTP/3 multiplexing with immutable compressed asset caching',
      },
    ],
    prod: [
      {
        id: 'multi-cdn',
        icon: 'globe',
        name: 'Multi-Region CDN',
        badge: 'Global',
        descKo: 'Three.js 3D 에셋 · 의류 썸네일 글로벌 리전 분산 캐싱',
        descEn: 'Multi-region edge caching for Three.js 3D & garment assets',
      },
      {
        id: 'edge-cache',
        icon: 'layers',
        name: 'Tiered Edge Cache',
        badge: 'Cache',
        descKo: '오리진 부하를 차단하는 계층형 엣지 리밸리데이션',
        descEn: 'Tiered stale-while-revalidate caching shielding origins',
      },
    ],
  },
  'lb-waf': {
    mvp: [
      {
        id: 'tls13',
        icon: 'lock',
        name: 'TLS 1.3 + HSTS',
        badge: 'Transport',
        descKo: '전 구간 암호화 전송 및 엄격한 HSTS · CSP 보안 헤더',
        descEn: 'End-to-end TLS 1.3 encryption with HSTS & strict CSP headers',
      },
      {
        id: 'rate-limit',
        icon: 'shield',
        name: 'Rate Limiter',
        badge: 'Guard',
        descKo: '로그인 · 합성 · 뉴스레터 API 대상 버스트 트래픽 방어',
        descEn: 'Per-route burst throttling across auth, VTON & newsletter APIs',
      },
    ],
    prod: [
      {
        id: 'cloud-lb',
        icon: 'network',
        name: 'Cloud Load Balancer',
        badge: 'Anycast',
        descKo: '글로벌 애니캐스트 트래픽 분산 및 자동 헬스체크 페일오버',
        descEn: 'Global Anycast L7 load balancing with health-check failover',
      },
      {
        id: 'cloud-armor',
        icon: 'shieldCheck',
        name: 'Cloud Armor WAF',
        badge: 'DDoS',
        descKo: 'OWASP Top 10 룰셋 및 L7 DDoS 자동 완화 방화벽',
        descEn: 'Managed OWASP ruleset & automated L7 DDoS mitigation',
      },
    ],
  },

  /* ----------------------------------------------------------------------
   * 03 API GATEWAY
   * ---------------------------------------------------------------------- */
  'invtry-gw': {
    mvp: [
      {
        id: 'express5',
        icon: 'server',
        name: 'Express 5 + Gzip',
        badge: 'Runtime',
        descKo: 'REST API 라우팅, JSON Gzip 응답 압축 및 뉴스레터 구독 API',
        descEn: 'Structured REST routing, JSON Gzip compression & newsletter API',
      },
      {
        id: 'oidc-jwt',
        icon: 'keyRound',
        name: 'Stateless OIDC / JWT',
        badge: 'Auth',
        descKo: '외부 IdP 토큰 미저장 원칙의 서명된 세션 토큰 인증',
        descEn: 'Signed bearer session auth without storing external IdP tokens',
      },
      {
        id: 'cors-boundary',
        icon: 'shield',
        name: 'CORS · Payload Guard',
        badge: 'Boundary',
        descKo: '허용 출처(Origin) 화이트리스트 및 API 페이로드 경계 검증',
        descEn: 'Strict origin allowlist & structured request payload validation',
      },
    ],
    prod: [
      {
        id: 'cloud-run-gw',
        icon: 'cloud',
        name: 'Cloud Run Gateway',
        badge: 'Serverless',
        descKo: '트래픽 급증 시 자동 수평 확장되는 무상태 컨테이너 게이트웨이',
        descEn: 'Auto-scaling stateless container gateway on Cloud Run',
      },
      {
        id: 'jwt-rotate',
        icon: 'refreshCw',
        name: 'Short JWT + Rotate',
        badge: 'Zero-Trust',
        descKo: '단기 만료 액세스 토큰과 순환 리프레시 토큰 보안 체계',
        descEn: 'Short-lived access JWTs paired with rotating refresh tokens',
      },
      {
        id: 'schema-val',
        icon: 'checkCircle',
        name: 'Strict Schema Guard',
        badge: 'Validation',
        descKo: '화이트리스트 기반 파라미터 · 페이로드 경계 검증',
        descEn: 'Allowlist payload validation at every API trust boundary',
      },
    ],
  },

  /* ----------------------------------------------------------------------
   * 04 iNVTRY CORE (Pure Domain Engines — Infra/GPU lives in Tier 06)
   * ---------------------------------------------------------------------- */
  'core-vton': {
    mvp: [
      {
        id: 'threejs',
        icon: 'rotate3d',
        name: 'Three.js r187',
        badge: 'Three.js 3D',
        descKo: '21-Bone 스켈레탈 모션, 28종 체형 모프 및 SpringBone 물리',
        descEn: '21-bone skeletal motion, 28 body morphs & SpringBone physics',
      },
      {
        id: 'vton-8cut',
        icon: 'sparkles',
        name: '8-Angle VTON',
        badge: 'AI Fitting',
        descKo: '무학습 8방향 가상 피팅, 스타일 밀도 선택(미니멀 · 밸런스 · 레이어드) 및 2D 폴백',
        descEn: 'No-training 8-angle VTON with styling density presets & 2D fallback',
      },
      {
        id: 'webgl-guard',
        icon: 'shield',
        name: 'WebGL Recovery',
        badge: 'Resilience',
        descKo: 'webglcontextlost 감지 시 자동 복구 및 안정적 2D 폴백 전환',
        descEn: 'Automatic webglcontextlost recovery with seamless 2D fallback',
      },
    ],
    prod: [
      {
        id: 'threejs-prod',
        icon: 'move3d',
        name: 'Three.js + PBR',
        badge: 'Viewport',
        descKo: '실시간 360° 턴테이블 · 조명 프리셋 · 스튜디오 배경 렌더링',
        descEn: 'Real-time 360° turntable, studio lighting & backdrop rendering',
      },
      {
        id: 'vton-orchestrator',
        icon: 'sparkles',
        name: 'Zero-Train VTON',
        badge: 'Pipeline',
        descKo: '사용자 이미지 학습 제외 계약 기반 고해상도 8방향 피팅 오케스트레이션',
        descEn: 'Zero-training 8-angle generative fitting orchestration pipeline',
      },
    ],
  },
  'core-closet': {
    mvp: [
      {
        id: 'slot-11',
        icon: 'shirt',
        name: '11-Slot Taxonomy',
        badge: 'Domain',
        descKo: '아우터 · 상의 · 하의 · 양말 · 신발 · 주얼리 11슬롯 정밀 착장 규칙',
        descEn: '11-slot garment taxonomy covering outerwear through jewelry',
      },
      {
        id: 'color-math',
        icon: 'droplets',
        name: 'CIELAB Color Match',
        badge: 'Duplicate',
        descKo: '오프라인 쇼핑 시 기존 보유 의류와의 색상 · 실루엣 중복 판독',
        descEn: 'Perceptual color & silhouette similarity for duplicate detection',
      },
      {
        id: 'cpw-engine',
        icon: 'trendingDown',
        name: 'CPW Analytics',
        badge: 'Metrics',
        descKo: '착용 횟수 대비 단가(Cost-Per-Wear) 및 스마트 세탁 바구니 추적',
        descEn: 'Automated Cost-Per-Wear tracking & smart laundry basket logic',
      },
    ],
    prod: [
      {
        id: 'wardrobe-bi',
        icon: 'barChart',
        name: 'Wardrobe Analytics',
        badge: 'Insights',
        descKo: '계절별 활용률 · 미착용 자산 · 스타일 분포 분석 파이프라인',
        descEn: 'Seasonal utilization, idle asset & style distribution analytics',
      },
      {
        id: 'capsule-engine',
        icon: 'shirt',
        name: 'Capsule Engine',
        badge: 'Styling',
        descKo: '착용 로그와 기온 곡선 기반 시즌별 캡슐 워드로브 자동 추천',
        descEn: 'Seasonal capsule wardrobe optimization driven by wear history',
      },
    ],
  },
  'core-weather': {
    mvp: [
      {
        id: 'weather-api',
        icon: 'cloudSun',
        name: 'Weather API v1',
        badge: 'Climate',
        descKo: '실시간 기온 · 체감온도 · 강수 확률 기반 데일리 코디 추천',
        descEn: 'Real-time temperature & precipitation-aware outfit styling',
      },
      {
        id: 'places-api',
        icon: 'mapPin',
        name: 'Places API (New)',
        badge: 'Geo',
        descKo: '주변 세탁소 · 수선실 탐색 및 지역 기반 스타일 컨텍스트 제공',
        descEn: 'Nearby laundry & tailoring discovery with local context',
      },
      {
        id: 'street-view',
        icon: 'compass',
        name: 'Street View Proxy',
        badge: 'Stage',
        descKo: '서버 프록시 경유로 API 키를 보호하며 실사 거리 배경 연동',
        descEn: 'Server-proxied Street View backdrops keeping API keys hidden',
      },
    ],
    prod: [
      {
        id: 'geo-proxy',
        icon: 'globe',
        name: 'Regional Geo-Proxy',
        badge: 'Edge',
        descKo: '리전별 기상 · 지도 API 프록시 및 할당량 보호 계층',
        descEn: 'Regional weather & maps proxy with quota protection',
      },
      {
        id: 'calendar-ootd',
        icon: 'calendar',
        name: 'Calendar OOTD Sync',
        badge: 'Schedule',
        descKo: '일정 · 장소 · 드레스코드 기반 사전 코디 스케줄링 연동',
        descEn: 'Schedule & dress-code aware outfit planning integration',
      },
    ],
  },
  'core-resale': {
    mvp: [
      {
        id: 'idle-detect',
        icon: 'tag',
        name: 'Idle Garment AI',
        badge: 'Circular',
        descKo: '장기 미착용 의류 자동 탐지 및 예상 리셀가 산출',
        descEn: 'Automatic idle garment detection with resale value estimate',
      },
      {
        id: 'onetap-export',
        icon: 'share2',
        name: '1-Tap Spec Export',
        badge: 'Card',
        descKo: '배경 제거 사진 · 소재 · 실측 · 착용 횟수를 판매 카드 포맷으로 즉시 생성',
        descEn: 'One-tap export of cutout photos, fabric & wear specs',
      },
    ],
    prod: [
      {
        id: 'receipt-auth',
        icon: 'badgeCheck',
        name: 'Receipt Authenticity',
        badge: 'Verified',
        descKo: '구매 영수증 · 착용 로그 기반 중고 리셀 정품 보증 워크플로우',
        descEn: 'Receipt-backed provenance & wear-history authenticity tokens',
      },
      {
        id: 'partner-api',
        icon: 'truck',
        name: 'Resale Partner API',
        badge: 'Webhook',
        descKo: '검수 파트너 플랫폼 직접 등록 및 정산 상태 웹훅 동기화',
        descEn: 'Direct partner marketplace listing & settlement webhooks',
      },
    ],
  },

  /* ----------------------------------------------------------------------
   * 05 SHARED BASE
   * ---------------------------------------------------------------------- */
  'shared-log': {
    mvp: [
      {
        id: 'req-logger',
        icon: 'fileSearch',
        name: 'Structured Req Log',
        badge: 'Runtime',
        descKo: '응답 지연시간 · 상태코드 · 경로별 구조화 런타임 요청 로깅',
        descEn: 'Structured runtime request logging for latency & route health',
      },
      {
        id: 'safe-err',
        icon: 'shield',
        name: 'Safe Error Envelope',
        badge: 'API',
        descKo: '내부 스택 트레이스 노출을 차단하는 표준 JSON 에러 응답',
        descEn: 'Standardized JSON error envelopes hiding internal stack traces',
      },
    ],
    prod: [
      {
        id: 'cloud-logging',
        icon: 'fileSearch',
        name: 'Cloud Logging',
        badge: 'Central',
        descKo: '전 서비스 중앙 집중형 JSON 로그 수집 및 이상 탐지 알림',
        descEn: 'Centralized JSON log aggregation & anomaly alerting',
      },
      {
        id: 'otel',
        icon: 'activity',
        name: 'OpenTelemetry',
        badge: 'Tracing',
        descKo: '게이트웨이부터 GPU 워커까지 분산 트레이싱 및 병목 분석',
        descEn: 'Distributed request tracing from gateway through GPU workers',
      },
    ],
  },
  'shared-oss': {
    mvp: [
      {
        id: 'magic-byte',
        icon: 'shieldCheck',
        name: 'Magic-Byte Guard',
        badge: 'Upload',
        descKo: '파일 확장자 위조 차단, 매직바이트 검증 및 4MB 용량 제한',
        descEn: 'Binary magic-byte verification & 4MB payload ceiling',
      },
      {
        id: 'tenant-dir',
        icon: 'hardDrive',
        name: 'Isolated Media Path',
        badge: 'Storage',
        descKo: '경로 탐색(Path Traversal)을 원천 차단한 소유자별 파일 저장소',
        descEn: 'Owner-isolated media paths hardened against traversal',
      },
    ],
    prod: [
      {
        id: 'gcs-3zone',
        icon: 'hardDrive',
        name: 'GCS 3-Zone Bucket',
        badge: 'Storage',
        descKo: '의류 · 시드 · 임시 VTON 3구역 분리 버킷 및 수명주기 자동 삭제',
        descEn: '3-zone isolated buckets with 24h auto-TTL for VTON renders',
      },
      {
        id: 'signed-url',
        icon: 'lock',
        name: '15m Signed URL',
        badge: 'Access',
        descKo: '15분 만료 서명 URL로 비인가 이미지 직접 접근 차단',
        descEn: 'Short-lived 15-minute signed URLs preventing public scraping',
      },
    ],
  },
  'shared-mq': {
    mvp: [
      {
        id: 'sse-stream',
        icon: 'workflow',
        name: 'Streaming 8-Cut Job',
        badge: 'Async',
        descKo: '8방향 가상 피팅과 자동 태깅 진행률을 실시간 스트리밍 처리',
        descEn: 'Progressive streaming pipeline for 8-angle VTON & tagging',
      },
      {
        id: 'retry-queue',
        icon: 'refreshCw',
        name: 'Idempotent Retry',
        badge: 'Queue',
        descKo: '네트워크 오류 시 중복 과금을 막는 멱등성 재시도 큐',
        descEn: 'Idempotent retry queue preventing duplicate synthesis runs',
      },
    ],
    prod: [
      {
        id: 'pubsub',
        icon: 'workflow',
        name: 'Cloud Pub/Sub',
        badge: 'Event Bus',
        descKo: 'GPU 피팅 잡 · 리셀 웹훅을 비동기 디커플링하는 이벤트 버스',
        descEn: 'Asynchronous event bus decoupling GPU jobs & webhooks',
      },
      {
        id: 'dlq',
        icon: 'shield',
        name: 'Dead-Letter Queue',
        badge: 'Reliable',
        descKo: '실패 작업 격리 및 자동 재처리 파이프라인',
        descEn: 'Dead-letter isolation with controlled backoff replay',
      },
    ],
  },

  /* ----------------------------------------------------------------------
   * 06 DATA · HARDWARE
   * ---------------------------------------------------------------------- */
  'data-sql': {
    mvp: [
      {
        id: 'sqljs-wasm',
        icon: 'database',
        name: 'sql.js WASM SQLite',
        badge: 'RDBMS',
        descKo: '파라미터 바인딩 쿼리 기반의 경량 SQLite 옷장 · 뉴스레터 저장소',
        descEn: 'Parameterized SQLite store for closets & newsletter tables',
      },
      {
        id: 'atomic-flush',
        icon: 'hardDrive',
        name: 'Atomic DB Flush',
        badge: 'Durability',
        descKo: '트랜잭션 커밋 후 원자적 스냅샷 기록 및 안전한 종료 플러시',
        descEn: 'Atomic snapshot persistence with graceful shutdown flush',
      },
    ],
    prod: [
      {
        id: 'cloud-sql-pg',
        icon: 'database',
        name: 'Cloud SQL PostgreSQL',
        badge: 'HA DB',
        descKo: '고가용성 리전 복제 · 자동 백업 · 행 수준 격리 관계형 DB',
        descEn: 'High-availability PostgreSQL with regional failover & backups',
      },
      {
        id: 'pg-pool',
        icon: 'layers',
        name: 'Connection Pooling',
        badge: 'Scale',
        descKo: '동시 접속 트래픽을 안정적으로 소화하는 커넥션 풀링',
        descEn: 'Managed connection pooling for burst serverless workloads',
      },
    ],
  },
  'data-redis': {
    mvp: [
      {
        id: 'ttl-cache',
        icon: 'zap',
        name: 'In-Memory TTL Cache',
        badge: '20m TTL',
        descKo: '20~30분 TTL 기상 · 코디 응답 캐싱으로 중복 외부 호출 절감',
        descEn: '20–30m TTL spatial weather & styling response cache',
      },
    ],
    prod: [
      {
        id: 'memorystore',
        icon: 'zap',
        name: 'Memorystore Redis HA',
        badge: 'Sub-ms',
        descKo: '서브밀리초 세션 · 기상 · 피팅 결과 캐싱 및 분산 락',
        descEn: 'Sub-millisecond HA Redis for sessions, weather & distributed locks',
      },
    ],
  },
  'data-gpu': {
    mvp: [
      {
        id: 'vertex-paid',
        icon: 'cpu',
        name: 'Vertex AI Inference',
        badge: 'API',
        descKo: 'Express 5 서버 프록시를 통한 안전한 유료 추론 티어 연동',
        descEn: 'Server-proxied Vertex AI inference without browser key exposure',
      },
      {
        id: 'swiftshader',
        icon: 'gauge',
        name: 'SwiftShader Fallback',
        badge: 'Fallback',
        descKo: '저사양 · GPU 미탑재 기기까지 지원하는 소프트웨어 WebGL 가드',
        descEn: 'Software WebGL guard supporting GPU-less & mobile devices',
      },
    ],
    prod: [
      {
        id: 'nvidia-l4',
        icon: 'server',
        name: 'NVIDIA L4 / A100',
        badge: 'GPU',
        descKo: '초고속 고해상도 8방향 의류 합성을 위한 전용 VPC GPU 클러스터',
        descEn: 'Dedicated VPC-isolated NVIDIA L4 & A100 workers for 8-angle VTON',
      },
      {
        id: 'cloud-run-ha',
        icon: 'cloud',
        name: 'Cloud Run GPU HA',
        badge: 'Autoscale',
        descKo: '요청량 기반 Scale-to-Zero 및 멀티존 GPU 오토스케일링',
        descEn: 'Demand-driven scale-to-zero & multi-zone GPU autoscaling',
      },
    ],
  },
  'data-vault': {
    mvp: [
      {
        id: 'env-secrets',
        icon: 'keyRound',
        name: 'Server Env Secrets',
        badge: 'Zero-Leak',
        descKo: '모든 API 키를 서버 환경변수에만 격리하고 클라이언트 노출 차단',
        descEn: 'API secrets isolated strictly in server environment variables',
      },
    ],
    prod: [
      {
        id: 'cloud-kms',
        icon: 'lock',
        name: 'Cloud KMS CMEK',
        badge: 'AES-256',
        descKo: '고객 관리 암호화 키(CMEK) 기반 저장 데이터 AES-256 암호화',
        descEn: 'Customer-managed AES-256 encryption keys via Cloud KMS',
      },
      {
        id: 'vpc-sc',
        icon: 'shieldCheck',
        name: 'VPC Service Controls',
        badge: 'Perimeter',
        descKo: '데이터 반출을 원천 차단하는 VPC 보안 경계 격리',
        descEn: 'Strict VPC security perimeter preventing data exfiltration',
      },
    ],
  },

  /* ----------------------------------------------------------------------
   * 07 GOVERNANCE (Consolidated 6 unique items: Audit 2 + RBAC 2 + CI/CD 2)
   * Every icon within MVP (6) and within Prod (6) is 100% distinct.
   * ---------------------------------------------------------------------- */
  'gov-audit': {
    mvp: [
      {
        id: 'audit-mask',
        icon: 'activity',
        name: 'PII-Masked Audit',
        badge: 'Trace',
        descKo: '권한 변경 · 로그인 · 삭제 이벤트를 민감정보 마스킹 후 감사 기록',
        descEn: 'Records auth, RBAC & deletion events with PII redacted',
      },
      {
        id: 'secret-gate',
        icon: 'fileSearch',
        name: 'Secret & Log Gate',
        badge: 'Git Gate',
        descKo: '커밋 전 verify:secrets · verify:console 훅으로 키 유출 및 디버그 로그 차단',
        descEn: 'Pre-commit verify:secrets & verify:console hooks blocking leaks',
      },
    ],
    prod: [
      {
        id: 'worm-audit',
        icon: 'activity',
        name: 'WORM Audit & Export',
        badge: 'WORM',
        descKo: '위변조 불가 해시 체인 감사 로그 및 GDPR · PIPA 즉시 파기 증적 관리',
        descEn: 'Append-only audit trail with auditable GDPR/PIPA erasure logs',
      },
      {
        id: 'siem-alert',
        icon: 'shield',
        name: 'SIEM Anomaly Alerts',
        badge: 'SOC',
        descKo: '비정상 권한 상승 · 대량 조회 시도 실시간 보안 경보',
        descEn: 'Real-time alerting on anomalous privilege or access spikes',
      },
    ],
  },
  'gov-rbac': {
    mvp: [
      {
        id: 'rbac-matrix',
        icon: 'userCheck',
        name: 'Per-User RBAC UI',
        badge: 'Menu/Btn',
        descKo: '관리자 메뉴 · 버튼 실시간 권한 제어 및 403 관리자 문의 팝업 연동',
        descEn: 'Real-time per-user menu & button matrix with 403 admin inquiry flow',
      },
      {
        id: 'idor-guard',
        icon: 'shieldCheck',
        name: 'IDOR Closet Guard',
        badge: 'Server',
        descKo: 'resolveAuthorizedClosets 미들웨어로 타인 옷장 접근을 서버에서 차단',
        descEn: 'Server-side resolveAuthorizedClosets guard blocking IDOR access',
      },
    ],
    prod: [
      {
        id: 'least-iam',
        icon: 'userCheck',
        name: 'Least-Privilege IAM',
        badge: 'Zero-Trust',
        descKo: '최소 권한 중앙 정책 엔진 · 서비스 계정 분리 및 JIT 임시 승격',
        descEn: 'Central least-privilege IAM policy engine with JIT elevation',
      },
      {
        id: 'pentest-gate',
        icon: 'keyRound',
        name: 'Continuous Pentest',
        badge: 'Red Team',
        descKo: '정기 모의해킹 및 자동화된 RBAC 회귀 보안 테스트',
        descEn: 'Periodic penetration testing & automated RBAC regression checks',
      },
    ],
  },
  'gov-cicd': {
    mvp: [
      {
        id: 'static-verify',
        icon: 'checkCircle',
        name: 'oxlint · TS · Build',
        badge: 'Pipeline',
        descKo: 'oxlint · TypeScript strict · Vite 일괄 npm run verify 배포 승인 게이트',
        descEn: 'Unified oxlint, strict TypeScript & Vite build release gate',
      },
      {
        id: 'test-suite',
        icon: 'gitBranch',
        name: 'Node + Playwright',
        badge: '360+ QA',
        descKo: '단위 · API · RBAC · 모바일 WebGL E2E 55스위트 통합 자동화 검증',
        descEn: 'Automated 55-suite unit, API, RBAC & mobile WebGL E2E verification',
      },
    ],
    prod: [
      {
        id: 'exif-sbom-gate',
        icon: 'shieldCheck',
        name: 'EXIF · SBOM CI Gate',
        badge: 'Supply',
        descKo: '이미지 EXIF · 시크릿 차단 및 컨테이너 · 의존성 취약점 상시 스캔',
        descEn: 'Automated CI gate for EXIF hygiene, secret blocking & SBOM scans',
      },
      {
        id: 'canary-deploy',
        icon: 'rocket',
        name: 'Canary Rollout',
        badge: 'CD',
        descKo: '트래픽 단계적 전환 및 오류율 감지 시 자동 롤백 배포',
        descEn: 'Progressive canary traffic shifting with automated rollback',
      },
    ],
  },
};

const GOVERNANCE_PILLAR_ORDER: readonly ('gov-audit' | 'gov-rbac' | 'gov-cicd')[] = [
  'gov-audit',
  'gov-rbac',
  'gov-cicd',
];

export function getTechItemsForBlueprintNode(
  nodeId: string,
  mode: ArchModeKey
): readonly ArchTechItem[] {
  const entry = NODE_TECH_CATALOG[nodeId];
  if (!entry) return [];
  return mode === 'mvp' ? entry.mvp : entry.prod;
}

/**
 * Returns the unified, deduplicated 07 Governance stack across all three
 * pillars (`gov-audit`, `gov-rbac`, `gov-cicd`) so all consolidated governance
 * icons render together while remaining 1:1 linked to each pillar & 3D blade.
 */
export function getUnifiedGovernanceTechItems(
  mode: ArchModeKey
): readonly GovernanceUnifiedTechItem[] {
  const unified: GovernanceUnifiedTechItem[] = [];
  GOVERNANCE_PILLAR_ORDER.forEach((nodeId, idx) => {
    const pillarIndex = idx as 0 | 1 | 2;
    for (const item of getTechItemsForBlueprintNode(nodeId, mode)) {
      unified.push({ ...item, nodeId, pillarIndex });
    }
  });
  return unified;
}

export function getTechItemDescription(item: ArchTechItem, lang: SiteLang): string {
  return lang === 'ko' ? item.descKo : item.descEn;
}
