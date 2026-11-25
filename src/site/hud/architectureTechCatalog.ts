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

type ArchModeKey = 'mvp' | 'prod';

interface NodeTechEntry {
  readonly mvp: readonly ArchTechItem[];
  readonly prod: readonly ArchTechItem[];
}

/**
 * Concrete technology stack items expanded inside the Architecture Blueprint description
 * whenever a user clicks a tier (01..07) or any node pill inside it.
 */
const NODE_TECH_CATALOG: Readonly<Record<string, NodeTechEntry>> = {
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
        name: 'Vite 8',
        badge: 'Build',
        descKo: '초고속 ESM 번들링 및 코드 스플리팅 최적화',
        descEn: 'Fast ESM bundling with route-level code splitting',
      },
      {
        id: 'mediapipe',
        icon: 'scanFace',
        name: 'MediaPipe WASM',
        badge: 'On-Device',
        descKo: '안면 랜드마크·피부톤 분석을 브라우저 로컬에서 0B 처리',
        descEn: '0-byte local browser face landmark & skin-tone inference',
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
        icon: 'smartphone',
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
        descKo: '오프라인 우선 옷장 캐시 및 낙관적 동기화 큐',
        descEn: 'Offline-first closet cache with optimistic mutation queue',
      },
      {
        id: 'mediapipe-prod',
        icon: 'scanFace',
        name: 'On-Device WASM',
        badge: '0B Face',
        descKo: '얼굴 원본 서버 무전송 원칙의 로컬 비전 추론',
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
        descKo: '단일 웹 코드베이스 기반 iOS·Android 네이티브 브리지',
        descEn: 'Single-codebase iOS & Android native WebView bridge',
      },
      {
        id: 'haptics',
        icon: 'sparkles',
        name: 'Native Haptics',
        badge: 'UX',
        descKo: '착장 선택·탭 전환 시 네이티브 촉각 피드백 연동',
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
        descKo: '서명된 AAB·IPA 자동 배포 및 딥링크 라우팅',
        descEn: 'Signed AAB & IPA store builds with universal deep links',
      },
      {
        id: 'capacitor-push',
        icon: 'zap',
        name: 'Native Push & Sync',
        badge: 'Mobile',
        descKo: '날씨·코디 리마인더 및 백그라운드 동기화',
        descEn: 'Weather outfit reminders and background state sync',
      },
    ],
  },
  'ops-console': {
    mvp: [
      {
        id: 'playwright',
        icon: 'checkCircle',
        name: 'Playwright E2E',
        badge: 'QA',
        descKo: 'iOS 노치·폴더블 뷰포트 및 SwiftShader WebGL 자동 검증',
        descEn: 'Automated mobile viewport & SwiftShader WebGL E2E checks',
      },
      {
        id: 'seed-qc',
        icon: 'layoutGrid',
        name: 'Seed Asset QC',
        badge: 'Assets',
        descKo: '8방향 모델 컷아웃·의류 누끼 품질 자동 검수',
        descEn: 'Automated quality checks for 8-angle cutouts & garment assets',
      },
      {
        id: 'admin-rbac',
        icon: 'shieldCheck',
        name: 'Admin RBAC UI',
        badge: 'Console',
        descKo: '유저별 메뉴·버튼 권한 실시간 온/오프 관리 콘솔',
        descEn: 'Real-time per-user menu & button permission console',
      },
    ],
    prod: [
      {
        id: 'rbac-backoffice',
        icon: 'userCheck',
        name: 'RBAC Backoffice',
        badge: 'Ops',
        descKo: '역할 기반 운영자 권한 분리 및 감사 이력 조회',
        descEn: 'Role-segmented operator backoffice with audit trail',
      },
      {
        id: 'resale-qc',
        icon: 'badgeCheck',
        name: 'Resale Verification',
        badge: 'Trust',
        descKo: '영수증·착용 이력 기반 중고 리셀 정품 검수 워크플로우',
        descEn: 'Receipt and wear-history authenticity verification workflow',
      },
      {
        id: 'telemetry-ops',
        icon: 'barChart',
        name: 'Quality Telemetry',
        badge: 'SLA',
        descKo: 'VTON 합성 성공률·지연시간 모니터링 대시보드',
        descEn: 'VTON synthesis quality & latency SLA dashboard',
      },
    ],
  },
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
        descKo: 'QUIC HTTP/3 멀티플렉싱 및 압축 이미지 캐시 헤더',
        descEn: 'HTTP/3 multiplexing with immutable compressed asset caching',
      },
    ],
    prod: [
      {
        id: 'multi-cdn',
        icon: 'globe',
        name: 'Multi-Region CDN',
        badge: 'Global',
        descKo: 'Three.js 3D 에셋·의류 썸네일 글로벌 리전 분산 캐싱',
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
        descKo: '전 구간 암호화 전송 및 엄격한 HSTS/CSP 보안 헤더',
        descEn: 'End-to-end TLS 1.3 encryption with HSTS & strict CSP headers',
      },
      {
        id: 'rate-limit',
        icon: 'shield',
        name: 'Rate Limiter',
        badge: 'Guard',
        descKo: '로그인·합성 API 대상 버스트 트래픽 및 무차별 대입 방어',
        descEn: 'Per-route burst throttling & brute-force request protection',
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
  'invtry-gw': {
    mvp: [
      {
        id: 'express5',
        icon: 'server',
        name: 'Express 5 API',
        badge: 'Runtime',
        descKo: 'REST API 라우팅, 입력 스키마 검증 및 중앙 에러 핸들러',
        descEn: 'Structured REST routing, input validation & safe error envelopes',
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
        id: 'rbac-mw',
        icon: 'shieldCheck',
        name: 'RBAC Middleware',
        badge: 'Policy',
        descKo: '모든 민감 엔드포인트에서 서버 측 메뉴·버튼 권한 검증',
        descEn: 'Server-side permission & role enforcement on every route',
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
        descKo: '화이트리스트 기반 파라미터·페이로드 경계 검증',
        descEn: 'Allowlist payload validation at every API trust boundary',
      },
    ],
  },
  'core-vton': {
    mvp: [
      {
        id: 'threejs',
        icon: 'rotate3d',
        name: 'Three.js r187',
        badge: '3D Engine',
        descKo: '21-Bone 스켈레탈 모션, 28종 체형 모프 및 SpringBone 물리',
        descEn: '21-bone skeletal motion, 28 body morphs & SpringBone physics',
      },
      {
        id: 'vton-8cut',
        icon: 'sparkles',
        name: '8-Angle VTON',
        badge: 'AI Fitting',
        descKo: '무학습(No-Training) 8방향 가상 피팅 및 2D 콜라주 자동 폴백',
        descEn: 'No-training 8-angle virtual try-on with seamless 2D fallback',
      },
      {
        id: 'webgl-guard',
        icon: 'shield',
        name: 'WebGL Recovery',
        badge: 'Resilience',
        descKo: 'webglcontextlost 감지 시 즉시 복구 및 SwiftShader 호환 가드',
        descEn: 'Automatic webglcontextlost recovery & software-GL guard',
      },
    ],
    prod: [
      {
        id: 'gpu-workers',
        icon: 'cpu',
        name: 'L4 / A100 GPU Pool',
        badge: 'Compute',
        descKo: 'VPC 격리 환경의 고성능 가상 피팅 전용 GPU 추론 워커',
        descEn: 'VPC-isolated L4 & A100 GPU inference workers for fast VTON',
      },
      {
        id: 'vertex-ai',
        icon: 'sparkles',
        name: 'Vertex AI Enterprise',
        badge: 'No-Train',
        descKo: '사용자 이미지 학습 제외 계약이 적용된 생성형 피팅 파이프라인',
        descEn: 'Zero-training enterprise generative fitting API pipeline',
      },
      {
        id: 'threejs-prod',
        icon: 'move3d',
        name: 'Three.js + PBR',
        badge: 'Viewport',
        descKo: '실시간 360° 턴테이블·조명 프리셋·스튜디오 배경 렌더링',
        descEn: 'Real-time 360° turntable, studio lighting & backdrop rendering',
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
        descKo: '아우터·상의·하의·양말·신발·주얼리 11슬롯 정밀 착장 규칙',
        descEn: '11-slot garment taxonomy covering outerwear through jewelry',
      },
      {
        id: 'color-math',
        icon: 'sparkles',
        name: 'CIELAB Color Match',
        badge: 'Duplicate',
        descKo: '오프라인 쇼핑 시 기존 보유 의류와의 색상·실루엣 중복 판독',
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
        id: 'tenant-closet',
        icon: 'lock',
        name: 'Tenant-Isolated DB',
        badge: 'Security',
        descKo: '사용자별 옷장 소유권 엄격 격리 및 IDOR 차단 엔진',
        descEn: 'Strict per-tenant closet ownership enforcement blocking IDOR',
      },
      {
        id: 'wardrobe-bi',
        icon: 'barChart',
        name: 'Wardrobe Analytics',
        badge: 'Insights',
        descKo: '계절별 활용률·미착용 자산·스타일 분포 분석 파이프라인',
        descEn: 'Seasonal utilization, idle asset & style distribution analytics',
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
        descKo: '실시간 기온·체감온도·강수 확률 기반 데일리 코디 추천',
        descEn: 'Real-time temperature & precipitation-aware outfit styling',
      },
      {
        id: 'places-api',
        icon: 'mapPin',
        name: 'Places API (New)',
        badge: 'Geo',
        descKo: '주변 세탁소·수선실 탐색 및 지역 기반 스타일 컨텍스트 제공',
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
        descKo: '리전별 기상·지도 API 프록시 및 할당량 보호 계층',
        descEn: 'Regional weather & maps proxy with quota protection',
      },
      {
        id: 'redis-ttl',
        icon: 'zap',
        name: 'Redis TTL Cache',
        badge: '20m TTL',
        descKo: '동일 격자 좌표 기상 응답 20분 캐싱으로 응답속도·비용 최적화',
        descEn: '20-minute spatial weather caching optimizing latency & cost',
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
        descKo: '누끼 사진·소재·실측·착용 횟수를 판매 카드 포맷으로 즉시 생성',
        descEn: 'One-tap export of cutout photos, fabric & wear specs',
      },
    ],
    prod: [
      {
        id: 'receipt-auth',
        icon: 'badgeCheck',
        name: 'Receipt Authenticity',
        badge: 'Verified',
        descKo: '구매 영수증·착용 로그 기반 정품 보증 메타데이터 발급',
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
  'shared-log': {
    mvp: [
      {
        id: 'pii-mask',
        icon: 'fileSearch',
        name: 'PII Masking Logger',
        badge: 'Privacy',
        descKo: '이메일·토큰·인증 헤더 자동 마스킹 구조화 로깅',
        descEn: 'Structured logging with automatic email & bearer-token redaction',
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
        name: 'Tenant Storage',
        badge: 'Isolated',
        descKo: '경로 탐색(Path Traversal)을 원천 차단한 소유자별 격리 저장소',
        descEn: 'Owner-isolated media paths hardened against traversal',
      },
    ],
    prod: [
      {
        id: 'gcs-3zone',
        icon: 'hardDrive',
        name: 'GCS 3-Zone Bucket',
        badge: 'Storage',
        descKo: '의류·시드·임시 VTON 3구역 분리 버킷 및 수명주기 자동 삭제',
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
        descKo: 'GPU 피팅 잡·리셀 웹훅을 비동기 디커플링하는 이벤트 버스',
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
  'data-sql': {
    mvp: [
      {
        id: 'sqljs-wasm',
        icon: 'database',
        name: 'sql.js WASM SQLite',
        badge: 'RDBMS',
        descKo: '파라미터 바인딩 쿼리 기반의 경량 SQLite 옷장·RBAC 저장소',
        descEn: 'Parameterized SQLite store for closets, outfits & RBAC tables',
      },
      {
        id: 'idb-mirror',
        icon: 'hardDrive',
        name: 'IndexedDB Mirror',
        badge: 'Offline',
        descKo: '오프라인 환경에서도 옷장을 즉시 열람하는 클라이언트 미러링',
        descEn: 'Client-side IndexedDB mirror for instant offline wardrobe access',
      },
    ],
    prod: [
      {
        id: 'cloud-sql-pg',
        icon: 'database',
        name: 'Cloud SQL PostgreSQL',
        badge: 'HA DB',
        descKo: '고가용성 리전 복제·자동 백업·행 수준 격리 관계형 DB',
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
        badge: 'Cache',
        descKo: '20~30분 TTL 기상·추천 캐시 및 API 레이트 리밋 버킷',
        descEn: '20–30m TTL weather/styling cache & in-memory rate buckets',
      },
    ],
    prod: [
      {
        id: 'memorystore',
        icon: 'zap',
        name: 'Memorystore Redis HA',
        badge: 'Sub-ms',
        descKo: '서브밀리초 세션·날씨·피팅 결과 캐싱 및 분산 락',
        descEn: 'Sub-millisecond HA Redis for sessions, weather & rate locks',
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
        name: 'WebGL / SwiftShader',
        badge: 'Fallback',
        descKo: '저사양·GPU 미탑재 기기까지 지원하는 적응형 렌더링 가드',
        descEn: 'Adaptive rendering guard supporting GPU-less & mobile devices',
      },
    ],
    prod: [
      {
        id: 'nvidia-l4',
        icon: 'server',
        name: 'NVIDIA L4 / A100',
        badge: 'GPU',
        descKo: '초고속 고해상도 8방향 의류 합성을 위한 전용 GPU 클러스터',
        descEn: 'Dedicated NVIDIA L4 & A100 workers for crisp 8-angle VTON',
      },
      {
        id: 'cloud-run-ha',
        icon: 'cloud',
        name: 'Cloud Run GPU HA',
        badge: 'Autoscale',
        descKo: '요청량 기반 Scale-to-Zero 및 멀티존 오토스케일링',
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
      {
        id: 'local-face',
        icon: 'lock',
        name: 'Local Face Vault',
        badge: '0B Upload',
        descKo: '안면 이미지 및 피부톤 프로필의 기기 내부 전용 보관',
        descEn: 'Device-local storage for facial profile & skin-tone data',
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
  'gov-audit': {
    mvp: [
      {
        id: 'audit-mask',
        icon: 'activity',
        name: 'PII-Masked Audit',
        badge: 'Trace',
        descKo: '권한 변경·로그인·삭제 이벤트를 민감정보 마스킹 후 기록',
        descEn: 'Records auth, RBAC & mutation events with PII redacted',
      },
      {
        id: 'secret-hook',
        icon: 'shieldCheck',
        name: 'verify:secrets Hook',
        badge: 'Git Gate',
        descKo: '커밋 전 API 키·자격증명 유출 여부를 자동 스캔하는 훅',
        descEn: 'Pre-commit hook blocking accidental secret or key leaks',
      },
      {
        id: 'console-hygiene',
        icon: 'fileSearch',
        name: 'verify:console',
        badge: 'Hygiene',
        descKo: '프로덕션 코드 내 불필요한 디버그 로그 잔존 자동 검사',
        descEn: 'Automated guard preventing stray debug logs in production',
      },
    ],
    prod: [
      {
        id: 'worm-audit',
        icon: 'activity',
        name: 'Tamper-Evident Audit',
        badge: 'WORM',
        descKo: '위변조 불가(Append-Only) 해시 체인 기반 보안 감사 로그',
        descEn: 'Append-only tamper-evident audit logs for compliance',
      },
      {
        id: 'siem-alert',
        icon: 'shield',
        name: 'SIEM Anomaly Alerts',
        badge: 'SOC',
        descKo: '비정상 권한 상승·대량 조회 시도 실시간 보안 경보',
        descEn: 'Real-time alerting on anomalous privilege or access spikes',
      },
      {
        id: 'compliance-iso',
        icon: 'badgeCheck',
        name: 'GDPR / PIPA Export',
        badge: 'Privacy',
        descKo: '사용자 데이터 열람·즉시 파기(Forget Me) 감사 증적 관리',
        descEn: 'Auditable user data export & immediate erasure workflows',
      },
    ],
  },
  'gov-rbac': {
    mvp: [
      {
        id: 'rbac-matrix',
        icon: 'userCheck',
        name: 'Per-User RBAC Matrix',
        badge: 'Menu/Btn',
        descKo: '관리자 페이지에서 유저별 메뉴·버튼 권한을 실시간 제어',
        descEn: 'Real-time per-user menu & button toggle matrix in Admin UI',
      },
      {
        id: 'idor-guard',
        icon: 'shieldCheck',
        name: 'IDOR Closet Guard',
        badge: 'Server',
        descKo: 'resolveAuthorizedClosets로 타인 옷장 접근을 서버에서 차단',
        descEn: 'Server-side closet ownership guard preventing IDOR access',
      },
      {
        id: 'denied-flow',
        icon: 'lock',
        name: '403 Inquiry Flow',
        badge: 'UX',
        descKo: '권한 없는 항목 클릭 시 안내 팝업 및 관리자 메일 문의 연동',
        descEn: 'Graceful 403 modal with direct admin email inquiry link',
      },
    ],
    prod: [
      {
        id: 'least-iam',
        icon: 'userCheck',
        name: 'Least-Privilege IAM',
        badge: 'IAM',
        descKo: '서비스 계정·운영자 최소 권한 원칙 및 JIT 임시 승격',
        descEn: 'Least-privilege IAM roles with just-in-time elevation',
      },
      {
        id: 'pentest-gate',
        icon: 'shield',
        name: 'Continuous Pentest',
        badge: 'Red Team',
        descKo: '정기 모의해킹 및 자동화된 RBAC 회귀 보안 테스트',
        descEn: 'Periodic penetration testing & automated RBAC regression checks',
      },
      {
        id: 'policy-engine',
        icon: 'keyRound',
        name: 'Central Policy Engine',
        badge: 'Zero-Trust',
        descKo: '모든 API·UI 액션에 일관 적용되는 중앙 권한 정책 평가',
        descEn: 'Unified policy evaluation across API routes & UI actions',
      },
    ],
  },
  'gov-cicd': {
    mvp: [
      {
        id: 'oxlint-ts',
        icon: 'checkCircle',
        name: 'oxlint + TS Strict',
        badge: 'Static',
        descKo: '초고속 정적 린트 및 TypeScript strict 모드 0-에러 게이트',
        descEn: 'Zero-error oxlint & strict TypeScript static analysis gate',
      },
      {
        id: 'test-suite',
        icon: 'gitBranch',
        name: 'Node + Playwright Tests',
        badge: '340+ QA',
        descKo: '단위·API·RBAC·모바일 WebGL E2E 통합 자동화 검증',
        descEn: 'Automated unit, API, RBAC & mobile WebGL E2E verification',
      },
      {
        id: 'verify-gate',
        icon: 'rocket',
        name: 'npm run verify',
        badge: 'Pipeline',
        descKo: '린트·타입체크·프로덕션 번들 일괄 통과 후 배포 승인',
        descEn: 'Unified lint, typecheck & Vite build release verification',
      },
    ],
    prod: [
      {
        id: 'exif-gate',
        icon: 'shieldCheck',
        name: 'PII / EXIF CI Gate',
        badge: 'Security',
        descKo: '이미지 EXIF 잔존·시크릿 유출을 차단하는 자동 CI 게이트',
        descEn: 'Automated CI gate blocking EXIF metadata & secret leaks',
      },
      {
        id: 'canary-deploy',
        icon: 'rocket',
        name: 'Canary Rollout',
        badge: 'CD',
        descKo: '트래픽 단계적 전환 및 오류율 감지 시 자동 롤백 배포',
        descEn: 'Progressive canary traffic shifting with automated rollback',
      },
      {
        id: 'sbom-scan',
        icon: 'gitBranch',
        name: 'SBOM & Vuln Scan',
        badge: 'Supply',
        descKo: '컨테이너·패키지 취약점 상시 스캔 및 서명된 아티팩트',
        descEn: 'Automated dependency SBOM & container vulnerability scanning',
      },
    ],
  },
};

export function getTechItemsForBlueprintNode(
  nodeId: string,
  mode: ArchModeKey
): readonly ArchTechItem[] {
  const entry = NODE_TECH_CATALOG[nodeId];
  if (!entry) return [];
  return mode === 'mvp' ? entry.mvp : entry.prod;
}

export function getTechItemDescription(item: ArchTechItem, lang: SiteLang): string {
  return lang === 'ko' ? item.descKo : item.descEn;
}
