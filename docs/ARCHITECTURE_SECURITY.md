# iNVTRY (Ainvtry) 시스템 아키텍처 및 데이터 보안 · 개인정보 보호 명세서

> **문서 목적**: 본 문서는 전신·안면 아바타 및 개인 의류 이미지를 처리하는 AI 디지털 옷장·가상 피팅 플랫폼 **iNVTRY(제품명: A inventory / 법인·팀명: Ainvtry)**의 보안 아키텍처, **OAuth 인증 토큰 관리**, **스토리지 접근 권한 분리**, **제3자 AI API 이미지 전송 시 비식별화·보유기간·파기 정책**을 기술적으로 명세합니다.  
> **대상 독자**: 2027년 정부 창업지원사업(예비·초기창업패키지, TIPS, AI·데이터 바우처 공급기업 검증 등) 기술·보안 평가위원, 스토어(Apple App Store · Google Play) 심사 대응팀, 내부 개발팀.  
> **최종 갱신일**: 2026-11-28

---

## 1. 보안 설계 원칙 (Privacy-by-Design 4대 원칙)

iNVTRY는 민감한 생체(안면)·체형·개인 의류 이미지를 다루는 서비스 특성상, 초기 아키텍처 단계부터 다음 4대 보안 원칙을 강제합니다.

1. **생체 데이터 무전송 원칙 (0-Byte Biometric Upload)**: 안면 랜드마크·피부톤(MST-04 / PCCS 12톤) 진단은 100% 사용자 기기 내부(클라이언트 MediaPipe WebAssembly)에서만 수행하며, 피부톤 보정 목적의 안면 카메라 원본 프레임은 외부 서버로 단 1바이트도 전송하지 않습니다.
2. **최소 권한 및 테넌트 격리 (Least Privilege & Strict Tenant Isolation)**: 모든 의류·코디·착용 기록·가상 피팅 요청은 서버 중앙 인가 가드(`resolveAuthorizedClosets`)를 통해 소유자(`closet_owner`) 단위로 강제 격리하여 수평적 권한 상승(IDOR)을 원천 차단합니다.
3. **비식별·무학습 AI 추론 (De-identified, Stateless & Zero-Training AI)**: 제3자 AI API(Google Gemini / Vertex AI)로 의류·피팅 이미지를 전송할 때 EXIF·GPS·기기 메타데이터를 전처리 단계에서 제거하고 직접 식별자(PII)를 페이로드에서 완전 배제하며, 모델 학습 미사용(No-Training) 유료 엔터프라이즈 경로를 적용합니다.
4. **원스톱 즉시 파기 (Atomic One-Stop Erasure)**: 회원 탈퇴(`DELETE /api/auth/account`) 시 서버 DB 레코드·연결된 OAuth 식별자(`user_identities`)·활성 세션·물리 업로드 파일(로컬/GCS Zone B)·VTON 캐시(로컬/GCS Zone C)·로컬 IndexedDB 볼트를 단일 흐름으로 즉시 영구 파기합니다.

---

## 2. 4계층 시스템 아키텍처 및 신뢰 경계 (Trust Boundaries)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [Trust Zone 1] Client / Edge (https://ainvtry.com/app · Capacitor Mobile)   │
│  ├─ Cloudflare Workers Edge Proxy (https://ainvtry.com/app + /api/* + /uploads/*) │
│  │   · www -> apex 301 정규화, OAuth redirect:manual, Multi Set-Cookie 보존  │
│  ├─ Three.js 0.187 (21-Bone Rig, 28 Morphs, SpringBone)                     │
│  ├─ MediaPipe FaceLandmarker WASM ──► 안면 피부톤 로컬 분석 (외부 전송 0B)    │
│  ├─ Image Preprocessor (Smart Crop · 누끼 · WebP 재인코딩 → EXIF/GPS 제거)   │
│  └─ Local IndexedDB Vault (faceMemoryStore · offlineSync, 계정 단위 격리)    │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ HTTPS (TLS 1.3) + Same-Origin HttpOnly Session Cookie
┌───────────────────────────────▼─────────────────────────────────────────────┐
│ [Trust Zone 2] Hardened Express 5 API (GCP Cloud Run asia-northeast3 Seoul) │
│  ├─ Security Headers: CSP(GIS 허용 + frame-ancestors 'none'), COOP, HSTS     │
│  ├─ Auth Guard: Google OAuth 2.0 PKCE(S256) + 로컬 RS256 JWKS 검증 + Apple   │
│  ├─ Identity Store: user_identities 정규화 (이메일 자동 병합 금지, ATO 차단) │
│  ├─ Tenant Guard: resolveAuthorizedClosets (IDOR 차단, Sample Read-Only)    │
│  ├─ Media Guard: Magic-Byte 검증, 4MB 상한, Path Traversal 차단, 소유권 대조 │
│  └─ Secret Manager (Server-Only): GEMINI, GOOGLE_CLIENT_SECRET, DATABASE_URL│
└──────────────┬────────────────────────────────┬─────────────────────────────┘
               │                                │
┌──────────────▼────────────────────┐  ┌────────▼─────────────────────────────┐
│ [Trust Zone 3] Isolated Storage   │  │ [Trust Zone 4] External Cloud APIs   │
│  ├─ Dual DB Adapter (dbAdapter.js)│  │  ├─ Google Gemini / Vertex AI        │
│  │   · Dev: SQLite / Prod: GCP    │  │  │   · 비식별 WebP + PII 배제 프롬프트 │
│  │     Cloud SQL PostgreSQL 16    │  │  │   · Paid/Enterprise No-Training   │
│  │     (asia-northeast3 서울)      │  │  │   · Stateless (요청 후 즉시 휘발)  │
│  ├─ Dual Storage (storageAdapter) │  │  └─ Google Maps / Weather v1 Proxy   │
│  │   · GCS Zone B Private (<=15m  │  │      · 최소 FieldMask, 미디어 DB 0건 │
│  │     V4 Signed URL / 인증 프록시)│  └──────────────────────────────────────┘
│  └─ GCS Zone C Scratch (24h TTL)  │
└───────────────────────────────────┘
```

---

## 3. OAuth 인증 및 세션 토큰 관리 명세

### 3-1. OIDC 인증 흐름 및 계정 탈취(ATO) 방지
- **지원 인증 수단**:
  - **Google OAuth 2.0 Authorization Code + PKCE (S256)** (`GET /api/auth/google/start`, `GET /api/auth/google/callback`) + **GIS Direct ID Token** (`POST /api/auth/google`), 공개 기능 탐색 (`GET /api/auth/config`), 계정 연결/해제 (`GET /api/auth/providers`, `DELETE /api/auth/providers/google`).
  - **Sign in with Apple** (`POST /api/auth/apple`), **이메일 6자리 OTP** (`POST /api/auth/send-verification`, `POST /api/auth/verify-email-code`, `POST /api/auth/register-email`).
- **서버 측 암호학적 로컬 JWKS 서명 검증 (Implemented — `server/googleOAuthService.js`, `server/api.js`)**:
  - **Google OIDC**: Google 공개키 JWKS(`https://www.googleapis.com/oauth2/v3/certs`, `Cache-Control` 캐싱 + 키 로테이션 `kid` 자동 갱신)를 사용해 서버 로컬에서 `RS256` 서명을 암호학적으로 직접 검증하고 `iss`, `aud`, `azp`, `exp`, `nbf`, `email_verified`, `sub`, `nonce`를 검사합니다(매 로그인 `tokeninfo` 외부 왕복 제거).
  - **PKCE · CSRF · Open Redirect 방어**: `code_challenge_method=S256`, HMAC-SHA256 서명된 일회성 `HttpOnly; SameSite=Lax` 상태 쿠키(`ainv_google_oauth`, 콜백 즉시 `Max-Age=0` 폐기), `sanitizeAppReturnTo` 화이트리스트(`/app*` 전용)로 CSRF·리플레이·Open Redirect 공격을 차단합니다.
  - **Apple OIDC**: Apple 공개키(JWKS) 기반 `RS256` 서명 및 `iss`(`https://appleid.apple.com`), `aud`(`APPLE_CLIENT_ID`), `exp` 클레임을 검증합니다.
- **이메일 기반 무단 자동 계정 병합 금지 (ATO 원천 차단, Implemented)**:
  - 정규화된 `user_identities(provider, provider_sub)` 복합 유니크 키로만 계정을 조회·매핑합니다.
  - 기존 이메일/비밀번호 계정과 동일 이메일의 Google 계정이 최초 로그인을 시도하면 자동 병합하지 않고 `409 ACCOUNT_EMAIL_CONFLICT`를 반환하며, 기존 방식으로 로그인한 뒤 명시적 인증 연결 흐름(`GET /api/auth/google/start?mode=link`)으로만 계정을 연결할 수 있습니다.
  - 관리자(`role='admin'`) 계정은 소셜 로그인 및 소셜 계정 연결이 서버 레벨에서 차단됩니다(`403 ADMIN_SOCIAL_FORBIDDEN`).

### 3-2. OAuth 토큰 비보관 및 내부 세션 토큰 수명주기
| 통제 항목 | 현재 구현 상태 (`server/googleOAuthService.js`, `server/api.js`, `server/start.js`) | 2027 프로덕션 고도화 규격 |
| :--- | :--- | :--- |
| **OAuth IdP Access/Refresh 토큰** | **클라이언트·서버 DB 전면 미저장** (인가 코드 교환 직후 `id_token`만 로컬 JWKS 검증 후 `access_token`/`refresh_token` 즉시 폐기, 불투명 `sub`만 `user_identities`에 매핑) | 동일 유지 (최소 Scope `openid email profile` 원칙 유지) |
| **세션 발급 및 전송** | 동일 출처(`https://ainvtry.com`)에서 암호학적 난수 토큰 생성 후 DB `sessions` 저장, `Set-Cookie: ainventory_token=...; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` (`HTTPS` 시 `Secure` 자동 부여). 리다이렉트 URL에 세션 토큰 절대 미노출 | Short-lived Access Token(15~60분) + Rotation Refresh Token(재사용 탐지 시 세션 패밀리 일괄 폐기) 도입 |
| **클라이언트 저장 보안** | 웹 `/app`에서 `HttpOnly` 세션 쿠키 우선(`GET /api/auth/me` 자동 복구, JS 접근 불가), `X-Powered-By` 비활성화, `X-Frame-Options: DENY` 및 엄격한 CSP 적용 | Capacitor iOS **Keychain** · Android **EncryptedSharedPreferences / Keystore** 하드웨어 바인딩 저장 |
| **무차별 대입(Brute-Force) 방어** | IP·이메일·계정 단위 `checkRateLimit` 적용, OTP 재발송 쿨다운(60초), 상수 시간 비교(`timingSafeStringEquals`), 프로덕션 모드 평문 OTP 응답 차단 | Cloud Armor / WAF IP 평판 차단 + 이상 로그인 탐지 알림 |
| **세션 만료 및 즉각 폐기** | 12시간 주기 만료 세션 자동 청소(`DELETE FROM sessions WHERE expires_at <= ?`), 로그아웃 및 회원 탈퇴 시 즉시 무효화 | Redis/Memorystore 세션 블랙리스트 연동 및 전 기기 동시 로그아웃 UI 제공 |

---

## 4. 스토리지 접근 권한 분리 (Storage Access Control & Tenant Isolation)

### 4-1. 계층별 데이터 격리 정책
1. **데이터베이스 계층 — 듀얼 어댑터 및 수평적 테넌트 격리 (Implemented — `server/dbAdapter.js`)**:
   - 로컬 개발은 SQLite(`node:sqlite`/`sql.js`), 프로덕션 GCP(`DATABASE_URL` 주입 시)는 **Cloud SQL for PostgreSQL 16 (`asia-northeast3` 서울 리전)**로 무중단 전환되는 비동기 듀얼 DB 어댑터(`AsyncLocalStorage` 중첩 ACID 트랜잭션·SAVEPOINT 지원)를 구현했습니다.
   - 모든 의류(`/api/garments`), 코디(`/api/outfits`), 착용 기록(`/api/calendar`), 쇼핑 중복 판독(`/api/shopping/*`), 여행 패킹(`/api/packing-lists`), 가상 피팅(`/api/vton/*`) 엔드포인트는 `resolveAuthorizedClosets(req, requestedCloset, { mode })`를 의무 통과합니다.
   - 비로그인 체험자(`sample_guest`)는 읽기 전용(`mode: 'read'`)으로 `sample` 옷장에만 격리되며, 개인 계정은 자신의 `defaultCloset`(`closet_*`) 외 타인 데이터 접근 시 `403 Forbidden`을 반환합니다.
2. **파일 스토리지 계층 — 듀얼 스토리지 어댑터, 업로드 검증 및 소유권 교차 검증 (Implemented — `server/storageAdapter.js`)**:
   - 파일 업로드 시 확장자·MIME 위변조를 막기 위한 **매직 바이트(Magic-Byte) 시그니처 검증**과 용량 상한(4MB 이하)을 적용합니다.
   - 저장 경로는 소유자 접두사(`/uploads/<ownerPrefix>-...`)로 분리하며, 모든 파일 읽기·VTON 입력·삭제 전 `fullPath.startsWith(uploadsRoot + path.sep)` 경로 순회(Path Traversal) 방어 및 DB 소유권 교차 검증을 강제합니다.
   - GCS 모드(`GCS_PRIVATE_BUCKET` 설정 시)에서는 `/uploads/:filename` 요청에 대해 세션 인증 + DB 소유권 검증을 통과한 경우에만 스트리밍하며, `GET /api/uploads/signed-url/:filename`으로 **최대 15분(900초 이하) 단기 V4 Signed URL**을 발급합니다.
   - `/uploads/*` 응답(Express 및 Cloudflare Worker 프록시 모두)에는 `Content-Security-Policy: default-src 'none'; sandbox` 및 `X-Content-Type-Options: nosniff`를 부여하여 저장형 XSS를 원천 차단합니다.
3. **온디바이스 로컬 스토리지 계층 — 생체 볼트 분리 (Implemented)**:
   - 안면 피부톤 보정 레퍼런스(`faceMemoryStore.ts`)와 오프라인 동기화 캐시(`offlineSync.ts`)는 브라우저/웹뷰 내 **IndexedDB**에 사용자 스코프(토큰 또는 `HttpOnly` 쿠키 `userId` 기반)로 분리 저장되며, 로그아웃·회원 탈퇴 시 `purgeAllLocalUserData()`로 전량 초기화됩니다.
4. **서버 전용 시크릿 및 외부 미디어 무저장 격리 (Implemented)**:
   - `GEMINI_API_KEY`, `GOOGLE_CLIENT_SECRET`, `OAUTH_STATE_SECRET`, `DATABASE_URL`, `GOOGLE_MAPS_API_KEY` 등 모든 시크릿은 GCP Secret Manager / 서버 환경변수(`process.env`)에만 상주하며 클라이언트 번들에는 0% 포함됩니다.
   - Google Maps Street View · Place Photos 미디어는 프록시 스트리밍만 수행하며 DB에 영구 저장하지 않습니다(0건 저장, Google Maps Platform ToS 준수).

### 4-2. GCP 서울 리전(`asia-northeast3`) 3-Zone 스토리지 분리 아키텍처 (Adapter & IaC Ready)
`server/storageAdapter.js`, `scripts/setup-gcp-prod.sh`, `.github/workflows/deploy-cloud-run.yml`을 통해 로컬 개발 환경과 GCP 프로덕션 **물리·IAM 3-Zone 분리**가 코드·인프라 스크립트 수준에서 통합되어 있습니다.

| 스토리지 존(Zone) | 저장 대상 | 접근 제어 (IAM / ACL) | 암호화 및 수명주기 |
| :--- | :--- | :--- | :--- |
| **Zone A · Public Seed** | 샘플 캡슐 옷장, 공용 3D 베이스 GLB/텍스처 (`dist-site` / Cloudflare Assets) | Read-Only CDN 배포, 쓰기 권한 CI/CD 한정 | Google/Cloudflare AES-256 |
| **Zone B · Private User Vault** | 사용자 의류 원본·누끼 WebP (`GCS_PRIVATE_BUCKET`, `asia-northeast3`) | **Public Access Prevention 강제**, Uniform Bucket-Level Access, 백엔드 인증+소유권 검증 후 **15분(900초) 이하 단기 V4 Signed URL** 또는 인증 프록시 전용 | AES-256 (확장 시 Cloud KMS CMEK), TLS 1.3 전송 암호화 |
| **Zone C · Ephemeral AI Scratch** | 가상 피팅(VTON) 중간 산출물·멀티앵글 캐시 (`GCS_SCRATCH_BUCKET`) | Cloud Run 최소권한 런타임 SA(`ainventory-api-run`) 전용 | **Object Lifecycle 24시간(1일) 자동 영구 삭제** + 회원 탈퇴 시 접두사 즉시 일괄 삭제 |

---

## 5. 이미지 제3자 AI API 전송 시 비식별화 · 보유기간 · 파기 정책

iNVTRY는 의류 자동 태깅·중복 구매 판독·멀티앵글 가상 피팅(VTON)을 위해 Google Gemini / Vertex AI API를 서버 프록시 경유로 호출합니다.

### 5-1. 전송 전 4단계 비식별화 파이프라인
1. **안면 생체 원천 배제 (On-Device Isolation)**: 피부톤 분석은 온디바이스 MediaPipe WASM에서 완결되므로 생체 안면 원본 프레임은 제3자 AI API로 전송하지 않습니다.
2. **EXIF · GPS · 기기 메타데이터 100% 스트리핑**: 의류 사진 등록 시 클라이언트 스마트 크롭 → 배경 제거(누끼) → `image/webp` 재인코딩 파이프라인을 통과하면서 **촬영 GPS 좌표, 카메라 모델, 촬영 시각, 기기 시리얼 등 모든 EXIF/IPTC/XMP 메타데이터가 구조적으로 제거**됩니다. 배경(실내 공간·가족사진·택배 송장 등 생활 배경) 역시 알파 매팅으로 제거되어 순수 의류 객체만 추출됩니다.
3. **PII(직접 식별자) 페이로드 완전 배제**: 제3자 AI API 요청 본문(Prompt & Payload)에는 사용자의 성명, 이메일, 전화번호, 실명 계정 ID, 거주지 주소를 절대 포함하지 않으며, 오직 익명화된 체형 수치(예: 키·체형 프리셋), PCCS 색상 코드, 의류 카테고리 코드 및 해시 기반 비식별 요청 ID만 전달합니다.
4. **사전 고지·선택적 동의 기반 피팅 전송**: 가상 피팅(VTON) 이미지 생성은 사용자가 명시적으로 버튼을 실행·동의한 경우에만 호출되며, 유료 **Google Cloud Vertex AI / Gemini Enterprise Paid Tier** 경로(`server/vtonService.js` 내 Vertex AI 엔드포인트 지원)를 통해 **입력·출력 이미지의 AI 모델 재학습 미사용(Zero Model Training)** 및 추론 완료 후 즉시 휘발(Stateless Inference) 계약을 보장합니다.

### 5-2. 데이터 유형별 보유기간 및 파기 정책 매트릭스

| 데이터 분류 | 저장 위치 | 제3자 AI 전송 여부 | 보유기간 | 파기 방식 및 시점 |
| :--- | :--- | :--- | :--- | :--- |
| **안면 카메라 원본 프레임** | 클라이언트 RAM (미저장) | **미전송 (0 Bytes)** | **0초 (즉시 휘발)** | 피부톤 수치 추출 직후 메모리 즉시 해제 |
| **보정 페이스 메모리 (로컬 볼트)** | 클라이언트 IndexedDB | 미전송 (사용자 명시 VTON 선택 시에만 비식별 참조) | 사용자 삭제 또는 로그아웃·탈퇴 시까지 | 기기 내 IndexedDB 즉시 삭제 (`purgeAllLocalUserData`) |
| **의류 등록 원본·누끼 WebP** | 사용자 전용 스토리지 (Dev: `/uploads` / Prod: GCS Zone B) | 배경 제거·EXIF 제거 후 태깅/VTON 시 최소 전송 | **회원 탈퇴 또는 개별 삭제 시까지** | DB 레코드 삭제 + 참조 검사 후 물리 파일/GCS 객체 즉시 삭제 |
| **AI API 전송 페이로드 (프롬프트·이미지)** | 서버 메모리 (디스크 미저장) | Vertex AI / Gemini Paid API (No-Training) | **추론 응답 직후 0일 파기** | 서버 메모리 즉시 해제, 제3자 학습·장기 보관 미허용 |
| **오프라인 쇼핑 중복 분석 (이력 미저장 옵션)** | 서버 메모리 | 비식별 의류 크롭 전송 | **0초 (응답 즉시 파기)** | `save_history: false` 시 DB·디스크 흔적 0건 |
| **VTON 멀티앵글 생성 캐시** | 임시 캐시 (Dev: `data/vton-cache` / Prod: GCS Zone C) | 출력 결과 단기 캐시 | **최대 24시간(Prod Lifecycle) / 캐시 상한 자동 순환** | TTL 만료 시 자동 삭제 + 회원 탈퇴 시 소유자 접두사 일괄 영구 삭제 |
| **Google Maps / Weather 컨텍스트** | 서버 메모리 TTL 캐시 | Maps / Weather API (최소 FieldMask) | **지도 미디어 0건 저장 / 날씨 20~30분 TTL** | 메모리 TTL 자동 만료 |
| **계정 인증 정보 (이메일·OAuth `sub`)** | 앱 DB `users`, `user_identities`, `sessions` | 미전송 | **회원 탈퇴 시까지** | `DELETE /api/auth/account` 실행 시 단일 트랜잭션 즉시 영구 삭제 |
| **보안·접속 감사 로그 (비식별 해시)** | GCP Cloud Logging (`asia-northeast3`) | 미전송 | 법정 보존 기한(통신비밀보호법 3개월 등) | 보존 기한 만료 시 자동 롤오버 영구 파기 |

### 5-3. 회원 탈퇴 원스톱 영구 파기 절차 (`DELETE /api/auth/account`)
사용자가 앱 내 `[계정 설정 → 회원 탈퇴 및 데이터 영구 삭제]`를 실행하면(`requireStrictUserAuth` 인증 검증 통과 필수), 서버와 클라이언트는 다음 순서로 데이터를 원자적으로 파기합니다.
1. **인증·세션 즉시 무효화**: 해당 `user_id`의 모든 활성 세션(`DELETE FROM sessions WHERE user_id = ?`), 소셜 연결(`user_identities`), RBAC 매핑(`user_roles`, `user_permission_overrides`) 및 인증 쿠키(`Max-Age=0`) 즉시 폐기.
2. **DB 레코드 일괄 삭제**: 사용자 옷장 소속 의류(`garments`), 코디(`outfits`), 착용 로그(`wear_logs`), 쇼핑 판독 이력(`shopping_checks`), 여행 패킹(`packing_lists`), 계정(`users`) 행 영구 삭제.
3. **물리 미디어·VTON 캐시 삭제**: 해당 사용자 소유 업로드 파일(`unlinkUploadIfUnreferenced` → 로컬/GCS Zone B) 및 `storage.deleteVtonCacheByOwnerPrefix` → 로컬/GCS Zone C 캐시 파일 전량 삭제.
4. **클라이언트 로컬 볼트 파기**: 클라이언트 `purgeAllLocalUserData()` 호출로 IndexedDB(`faceMemoryStore`, `offlineSync`), LocalStorage/SessionStorage 내 사용자 잔존 데이터 완전 소거.

---

## 6. 보안 헤더 · 침해 대응 및 구현 로드맵 요약

### 6-1. 웹·API 전송 계층 하드닝 (`worker/index.js`, `site/public/_headers`, `server/start.js` 적용 완료)
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), camera=(self), microphone=()`
- `https://ainvtry.com/app` 풀 앱 경로: `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow, noai, noimageai`, Google GIS 허용 + `frame-ancestors 'none'` CSP, `www.ainvtry.com/app*` → `ainvtry.com/app*` 301 정규화
- `/uploads/*` 샌드박스 CSP(`default-src 'none'; sandbox`) 및 API JSON 파싱·대용량 페이로드(`413`) 에러 마스킹(스택 트레이스 노출 차단)

### 6-2. 현재 구현 완료(Implemented) vs 2027 프로덕션 운영 고도화(Planned) 대조표
| 보안 영역 | 현재 저장소 구현 완료 (Implemented) | 프로덕션 운영 활성화 및 2027 고도화 (Operations / Planned) |
| :--- | :--- | :--- |
| **OAuth · 세션** | Google OAuth 2.0 PKCE(S256) + 로컬 RS256 JWKS 검증, Apple OIDC 검증, `user_identities` 정규화, 이메일 자동 병합 금지(ATO 차단), `ainvtry.com/app` 동일 출처 `HttpOnly` 쿠키, Rate Limit, 12h 만료 세션 청소 | GCP OAuth 클라이언트 실등록·시크릿 주입, Short-lived Access + Refresh Token Rotation, Capacitor Keychain/Keystore 네이티브 암호화 저장 |
| **스토리지 · 인프라** | `dbAdapter.js`(SQLite + Cloud SQL PostgreSQL 16), `storageAdapter.js`(Local + GCS Zone B 15분 V4 Signed URL / 인증 프록시 + Zone C 24h TTL), `scripts/setup-gcp-prod.sh` IaC, Keyless WIF Cloud Run CD(`.github/workflows/deploy-cloud-run.yml`), `resolveAuthorizedClosets` 테넌트 격리 | `scripts/setup-gcp-prod.sh` 실행으로 서울 리전 Cloud Run · Cloud SQL · GCS 3-Zone 라이브 프로비저닝, Cloud KMS CMEK 및 Cloud Armor WAF 확장 |
| **AI 비식별·파기** | MediaPipe WASM 0-Byte 생체 격리, 누끼·WebP EXIF 제거, PII 미전송, Vertex AI 경로 지원, 탈퇴 원스톱 파기(DB+Zone B+Zone C+IndexedDB) | Vertex AI VPC Service Controls 경계 격리, 자동화 PII/EXIF 회귀 테스트 게이트(CI), 분기별 모의해킹·취약점 진단 |
| **거버넌스·감사** | `.env` 시크릿 검증(`verify:secrets`), `oxlint` + TypeScript strict 정적 검증, 단위·API·Worker 자동화 테스트 스위트 | 개인정보보호책임자(CPO) 지정, ISMS-P 수준 자체 점검표 운영, 침해사고 24시간 내 통지·신고 대응 매뉴얼(SOP) |
