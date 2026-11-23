# iNVTRY (Ainvtry) 시스템 아키텍처 및 데이터 보안 · 개인정보 보호 명세서

> **문서 목적**: 본 문서는 전신·안면 아바타 및 개인 의류 이미지를 처리하는 AI 디지털 옷장·가상 피팅 플랫폼 **iNVTRY(제품명: A inventory / 법인·팀명: Ainvtry)**의 보안 아키텍처, **OAuth 인증 토큰 관리**, **스토리지 접근 권한 분리**, **제3자 AI API 이미지 전송 시 비식별화·보유기간·파기 정책**을 기술적으로 명세합니다.  
> **대상 독자**: 2027년 정부 창업지원사업(예비·초기창업패키지, TIPS, AI·데이터 바우처 공급기업 검증 등) 기술·보안 평가위원, 스토어(Apple App Store · Google Play) 심사 대응팀, 내부 개발팀.  
> **최종 갱신일**: 2026-11-22

---

## 1. 보안 설계 원칙 (Privacy-by-Design 4대 원칙)

iNVTRY는 민감한 생체(안면)·체형·개인 의류 이미지를 다루는 서비스 특성상, 초기 아키텍처 단계부터 다음 4대 보안 원칙을 강제합니다.

1. **생체 데이터 무전송 원칙 (0-Byte Biometric Upload)**: 안면 랜드마크·피부톤(MST-04 / PCCS 12톤) 진단은 100% 사용자 기기 내부(클라이언트 MediaPipe WebAssembly)에서만 수행하며, 피부톤 보정 목적의 안면 카메라 원본 프레임은 외부 서버로 단 1바이트도 전송하지 않습니다.
2. **최소 권한 및 테넌트 격리 (Least Privilege & Strict Tenant Isolation)**: 모든 의류·코디·착용 기록·가상 피팅 요청은 서버 중앙 인가 가드(`resolveAuthorizedClosets`)를 통해 소유자(`closet_owner`) 단위로 강제 격리하여 수평적 권한 상승(IDOR)을 원천 차단합니다.
3. **비식별·무학습 AI 추론 (De-identified, Stateless & Zero-Training AI)**: 제3자 AI API(Google Gemini / Vertex AI)로 의류·피팅 이미지를 전송할 때 EXIF·GPS·기기 메타데이터를 전처리 단계에서 제거하고 직접 식별자(PII)를 페이로드에서 완전 배제하며, 모델 학습 미사용(No-Training) 유료 엔터프라이즈 경로를 적용합니다.
4. **원스톱 즉시 파기 (Atomic One-Stop Erasure)**: 회원 탈퇴(`DELETE /api/auth/account`) 시 서버 DB 레코드·활성 세션·물리 업로드 파일·VTON 캐시·로컬 IndexedDB 볼트를 단일 흐름으로 즉시 영구 파기합니다.

---

## 2. 4계층 시스템 아키텍처 및 신뢰 경계 (Trust Boundaries)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ [Trust Zone 1] Client / On-Device Edge (Web SPA · Capacitor iOS/Android)    │
│  ├─ Three.js 0.187 (21-Bone Rig, 28 Morphs, SpringBone)                     │
│  ├─ MediaPipe FaceLandmarker WASM ──► 안면 피부톤 로컬 분석 (외부 전송 0B)    │
│  ├─ Image Preprocessor (Smart Crop · 누끼 · WebP 재인코딩 → EXIF/GPS 제거)   │
│  └─ Local IndexedDB Vault (faceMemoryStore · offlineSync, 계정 단위 격리)    │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ HTTPS (TLS 1.3) + HttpOnly Session Cookie / Bearer
┌───────────────────────────────▼─────────────────────────────────────────────┐
│ [Trust Zone 2] Hardened Express 5 API & Security Proxy (Server-Only Keys)   │
│  ├─ Security Headers: CSP, HSTS, X-Frame-Options, nosniff, Permissions-Pol  │
│  ├─ Auth Guard: Apple/Google OIDC ID Token 검증 + Email OTP + Rate Limiter  │
│  ├─ Tenant Guard: resolveAuthorizedClosets (IDOR 차단, Sample Read-Only)    │
│  ├─ Media Guard: Magic-Byte 검증, 4MB 상한, Path Traversal 차단, 소유권 대조 │
│  └─ Server-Only Secrets: GEMINI_API_KEY, GOOGLE_MAPS_API_KEY (클라 노출 0%) │
└──────────────┬────────────────────────────────┬─────────────────────────────┘
               │                                │
┌──────────────▼────────────────────┐  ┌────────▼─────────────────────────────┐
│ [Trust Zone 3] Isolated Storage   │  │ [Trust Zone 4] External Cloud APIs   │
│  ├─ App DB (MVP: sql.js SQLite /  │  │  ├─ Google Gemini / Vertex AI        │
│  │   Prod: Cloud SQL Postgres)    │  │  │   · 비식별 WebP + PII 배제 프롬프트 │
│  ├─ User Uploads (Owner Prefix /  │  │  │   · Paid/Enterprise No-Training   │
│  │   Prod: GCS Private 3-Zone +   │  │  │   · Stateless (요청 후 즉시 휘발)  │
│  │   15분 단기 Signed URL + CMEK) │  │  └─ Google Maps / Weather v1 Proxy   │
│  └─ Ephemeral VTON Cache (TTL)    │  │      · 최소 FieldMask, 미디어 DB 0건 │
└───────────────────────────────────┘  └──────────────────────────────────────┘
```

---

## 3. OAuth 인증 및 세션 토큰 관리 명세

### 3-1. OIDC 인증 흐름 및 계정 탈취(ATO) 방지
- **지원 인증 수단**: Sign in with Apple(`POST /api/auth/apple`), Google OAuth 2.0 OIDC(`POST /api/auth/google`), 이메일 6자리 OTP(`POST /api/auth/email/request`, `POST /api/auth/email/verify`).
- **서버 측 암호학적 ID Token 검증 (Implemented)**:
  - **Apple OIDC**: Apple 공개키(JWKS) 기반 서명 검증 및 `iss`(`https://appleid.apple.com`), `aud`(`APPLE_CLIENT_ID`), `exp` 클레임 검증을 서버에서 수행합니다.
  - **Google OIDC**: Google 토큰 검증 엔드포인트(`oauth2.googleapis.com/tokeninfo`)를 통해 `iss`(`accounts.google.com` / `https://accounts.google.com`), `aud`(`GOOGLE_CLIENT_ID`) 일치 여부를 검증합니다.
- **이메일 기반 무단 자동 계정 병합 금지 (ATO 원천 차단, Implemented)**:
  - 소셜 로그인 시 미검증 이메일 일치만으로 기존 계정에 자동 병합하지 않고, 반드시 `(apple_sub, auth_provider)` 복합 키로만 계정을 조회·매핑합니다(`WHERE apple_sub = ? AND auth_provider = 'apple' | 'google'`).

### 3-2. OAuth 토큰 비보관 및 내부 세션 토큰 수명주기
| 통제 항목 | 현재 구현 상태 (`server/api.js`, `server/start.js`) | 2027 프로덕션 고도화 규격 |
| :--- | :--- | :--- |
| **OAuth IdP Access/Refresh 토큰** | **클라이언트·서버 DB 전면 미저장** (OIDC 신원 확인용 ID Token만 일회성 검증 후 즉시 폐기, 불투명 `sub`만 매핑) | 동일 유지 (외부 OAuth Scope 최소화 원칙 유지) |
| **세션 발급 및 전송** | 암호학적 난수 토큰 생성 후 DB `sessions` 테이블 저장, `Set-Cookie: ainventory_token=...; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` (`HTTPS` 시 `Secure` 자동 부여) | Short-lived Access Token(15~60분) + Rotation Refresh Token(재사용 탐지 시 세션 패밀리 일괄 폐기) 도입 |
| **클라이언트 저장 보안** | 웹 브라우저에서 JavaScript로 세션 쿠키 접근 불가(`HttpOnly`), `X-Powered-By` 비활성화 및 엄격한 CSP 적용 | Capacitor iOS **Keychain** · Android **EncryptedSharedPreferences / Keystore** 하드웨어 바인딩 저장 |
| **무차별 대입(Brute-Force) 방어** | IP·이메일·계정 단위 `checkRateLimit` 적용, OTP 재발송 쿨다운(60초), 상수 시간 비교(`timingSafeStringEquals`), 프로덕션 모드 평문 OTP 응답 차단 | Cloud Armor / WAF IP 평판 차단 + 이상 로그인 탐지 알림 |
| **세션 만료 및 즉각 폐기** | 12시간 주기 만료 세션 자동 청소(`DELETE FROM sessions WHERE expires_at <= datetime('now')`), 로그아웃(`DELETE FROM sessions WHERE token = ?`) 및 회원 탈퇴(`DELETE FROM sessions WHERE user_id = ?`) 시 즉시 무효화 | Redis/Memorystore 세션 블랙리스트 연동 및 전 기기 동시 로그아웃 UI 제공 |

---

## 4. 스토리지 접근 권한 분리 (Storage Access Control & Tenant Isolation)

### 4-1. 계층별 데이터 격리 정책
1. **데이터베이스 계층 — 수평적 테넌트 격리 (Implemented)**:
   - 모든 의류(`/api/garments`), 코디(`/api/outfits`), 착용 기록(`/api/wear-logs`), 쇼핑 중복 판독(`/api/shopping-check`), 여행 패킹(`/api/packing-lists`), 가상 피팅(`/api/vton/*`) 엔드포인트는 `resolveAuthorizedClosets(req, requestedCloset, { mode })`를 의무 통과합니다.
   - 비로그인 체험자(`sample_guest`)는 읽기 전용(`mode: 'read'`)으로 `sample` 옷장에만 격리되며, 개인 계정은 자신의 `defaultCloset`(`closet_*`) 외 타인 데이터 접근 시 `403 Forbidden`을 반환합니다.
2. **파일 스토리지 계층 — 업로드 검증 및 소유권 교차 검증 (Implemented)**:
   - 파일 업로드 시 확장자·MIME 위변조를 막기 위한 **매직 바이트(Magic-Byte) 시그니처 검증**과 용량 상한(4MB 이하)을 적용합니다.
   - 저장 경로는 소유자 접두사(`/uploads/<ownerPrefix>-...`)로 분리하며, 모든 파일 읽기·VTON 입력·삭제 전 `fullPath.startsWith(uploadsRoot + path.sep)` 경로 순회(Path Traversal) 방어 및 DB 소유권 교차 검증을 강제합니다.
   - `/uploads` 정적 응답에는 `Content-Security-Policy: default-src 'none'; sandbox` 및 `X-Content-Type-Options: nosniff`를 부여하여 저장형 XSS(SVG/HTML 스크립트 실행)를 원천 차단합니다.
3. **온디바이스 로컬 스토리지 계층 — 생체 볼트 분리 (Implemented)**:
   - 안면 피부톤 보정 레퍼런스(`faceMemoryStore.ts`)와 오프라인 동기화 캐시(`offlineSync.ts`)는 브라우저/웹뷰 내 **IndexedDB**에 사용자 스코프로 분리 저장되며, 로그아웃·회원 탈퇴 시 `purgeAllLocalUserData()`로 전량 초기화됩니다.
4. **서버 전용 시크릿 및 외부 미디어 무저장 격리 (Implemented)**:
   - `GEMINI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `GOOGLE_WEATHER_API_KEY` 등 모든 API 키는 서버 환경변수(`process.env`)에만 상주하며 클라이언트 번들에는 0% 포함됩니다.
   - Google Maps Street View · Place Photos 미디어는 프록시 스트리밍만 수행하며 DB에 영구 저장하지 않습니다(0건 저장, Google Maps Platform ToS 준수).

### 4-2. 2027 프로덕션 클라우드 스토리지 3-Zone 분리 설계 (Production Target)
현재 MVP의 로컬 디스크(`/uploads`, `data/vton-cache`) 구조는 2027년 상용 스케일업(Google Cloud Run + Cloud Storage) 단계에서 아래와 같이 **물리·IAM 3-Zone 분리**로 전환합니다.

| 스토리지 존(Zone) | 저장 대상 | 접근 제어 (IAM / ACL) | 암호화 및 수명주기 |
| :--- | :--- | :--- | :--- |
| **Zone A · Public Seed** | 샘플 캡슐 옷장, 공용 3D 베이스 GLB/텍스처 | Read-Only CDN 배포, 쓰기 권한 CI/CD 서비스 계정 한정 | Google-managed AES-256 |
| **Zone B · Private User Vault** | 사용자 의류 원본·누끼 WebP, 저장 코디 스냅샷 (`gs://invtry-user-private/{userId}/...`) | **Public Access Prevention 강제**, Uniform Bucket-Level Access, 백엔드 인증 검증 후 **15분 이하 단기 Signed URL** 발급 전용 (비인증 직접 URL 접근 원천 차단) | Cloud KMS **CMEK(AES-256-GCM)**, TLS 1.3 전송 암호화 |
| **Zone C · Ephemeral AI Scratch** | 가상 피팅(VTON) 중간 산출물·멀티앵글 캐시 | VTON 워커 전용 서비스 계정(최소 권한 IAM)만 접근, 타 서비스 접근 불가 | **Object Lifecycle 24시간 자동 영구 삭제** + 회원 탈퇴 시 즉시 삭제 |

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
| **의류 등록 원본·누끼 WebP** | 사용자 전용 스토리지 (MVP: `/uploads` / Prod: Zone B) | 배경 제거·EXIF 제거 후 태깅/VTON 시 최소 전송 | **회원 탈퇴 또는 개별 삭제 시까지** | DB 레코드 삭제 + 참조 검사 후 물리 파일 즉시 언링크/삭제 |
| **AI API 전송 페이로드 (프롬프트·이미지)** | 서버 메모리 (디스크 미저장) | Vertex AI / Gemini Paid API (No-Training) | **추론 응답 직후 0일 파기** | 서버 메모리 즉시 해제, 제3자 학습·장기 보관 미허용 |
| **오프라인 쇼핑 중복 분석 (이력 미저장 옵션)** | 서버 메모리 | 비식별 의류 크롭 전송 | **0초 (응답 즉시 파기)** | `save_history: false` 시 DB·디스크 흔적 0건 |
| **VTON 멀티앵글 생성 캐시** | 임시 캐시 (`data/vton-cache` / Prod: Zone C) | 출력 결과 단기 캐시 | **최대 24시간(Prod) / 캐시 상한 자동 순환** | TTL 만료 시 자동 삭제 + 회원 탈퇴 시 소유자 접두사 일괄 영구 삭제 |
| **Google Maps / Weather 컨텍스트** | 서버 메모리 TTL 캐시 | Maps / Weather API (최소 FieldMask) | **지도 미디어 0건 저장 / 날씨 20~30분 TTL** | 메모리 TTL 자동 만료 |
| **계정 인증 정보 (이메일·OAuth `sub`)** | 앱 DB `users`, `sessions` | 미전송 | **회원 탈퇴 시까지** | `DELETE /api/auth/account` 실행 시 단일 트랜잭션 즉시 영구 삭제 |
| **보안·접속 감사 로그 (비식별 해시)** | 분리된 로그 저장소 | 미전송 | 법정 보존 기한(통신비밀보호법 3개월 등) | 보존 기한 만료 시 자동 롤오버 영구 파기 |

### 5-3. 회원 탈퇴 원스톱 영구 파기 절차 (`DELETE /api/auth/account`)
사용자가 앱 내 `[계정 설정 → 회원 탈퇴 및 데이터 영구 삭제]`를 실행하면(`requireStrictUserAuth` 인증 검증 통과 필수), 서버와 클라이언트는 다음 순서로 데이터를 원자적으로 파기합니다.
1. **인증·세션 즉시 무효화**: 해당 `user_id`의 모든 활성 세션(`DELETE FROM sessions WHERE user_id = ?`) 및 인증 쿠키(`Max-Age=0`) 즉시 폐기.
2. **DB 레코드 일괄 삭제**: 사용자 옷장 소속 의류(`garments`), 코디(`outfits`), 착용 로그(`wear_logs`), 쇼핑 판독 이력(`shopping_checks`), 여행 패킹(`packing_lists`), 계정(`users`) 행 영구 삭제.
3. **물리 미디어·VTON 캐시 삭제**: 해당 사용자 소유 업로드 파일(`unlinkUploadIfUnreferenced`) 및 `data/vton-cache` 내 소유자 접두사 캐시 파일 전량 삭제.
4. **클라이언트 로컬 볼트 파기**: 클라이언트 `purgeAllLocalUserData()` 호출로 IndexedDB(`faceMemoryStore`, `offlineSync`), LocalStorage/SessionStorage 내 사용자 잔존 데이터 완전 소거.

---

## 6. 보안 헤더 · 침해 대응 및 구현 로드맵 요약

### 6-1. 웹·API 전송 계층 하드닝 (`server/start.js` 적용 완료)
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), camera=(self), microphone=()`
- 프로덕션 환경 `X-Frame-Options: DENY` 및 CSP `frame-ancestors 'none'`, HTTPS 구간 `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `/uploads/*` 샌드박스 CSP(`default-src 'none'; sandbox`) 및 API JSON 파싱·대용량 페이로드(`413`) 에러 마스킹(스택 트레이스 노출 차단)

### 6-2. 현재 구현 완료(Implemented) vs 2027 프로덕션 고도화(Planned) 대조표
| 보안 영역 | 현재 저장소 구현 완료 (Implemented) | 2027 상용·바우처 공급 시 고도화 (Planned) |
| :--- | :--- | :--- |
| **OAuth · 세션** | Apple/Google OIDC 서버 검증, 이메일 자동 병합 금지, HttpOnly 쿠키, Rate Limit, 12h 만료 세션 청소 | Short-lived Access + Refresh Token Rotation, Capacitor Keychain/Keystore 네이티브 암호화 저장 |
| **스토리지 분리** | `resolveAuthorizedClosets` 테넌트 격리, 업로드 매직바이트·경로순회 차단·샌드박스 CSP, IndexedDB 로컬 페이스 볼트 | GCS 3-Zone 분리(Public/Private/Ephemeral), Private 버킷 전면 비공개 + 15분 Signed URL + CMEK 암호화 |
| **AI 비식별·파기** | MediaPipe WASM 0-Byte 생체 격리, 누끼·WebP EXIF 제거, PII 미전송, Vertex AI 경로 지원, 탈퇴 원스톱 파기 | Vertex AI VPC Service Controls 경계 격리, 자동화 PII/EXIF 회귀 테스트 게이트(CI), 분기별 모의해킹·취약점 진단 |
| **거버넌스·감사** | `.env` 시크릿 검증 스크립트(`verify:secrets`), `oxlint` + TypeScript strict 정적 검증, 210+ 단위·E2E 테스트 | 개인정보보호책임자(CPO) 지정, ISMS-P 수준 자체 점검표 운영, 침해사고 24시간 내 통지·신고 대응 매뉴얼(SOP) |
