# iNVTRY (Ainvtry) 2027 정부 창업지원사업 · 바우처 공급기업 제출용 사업계획서 보강안
## — 사용자 데이터 보안 · 개인정보 보호 체계 및 평가 차별화 전략 —

> **작성 배경**: 최근 ‘모두의 창업’ 등 창업 생태계 플랫폼에서 연이어 발생한 개인정보 유출 이슈로 인해, 2027년 정부 창업지원사업(예비·초기창업패키지, TIPS, 디딤돌 R&D) 서류·발표 심사 및 AI·데이터 바우처 공급기업 검증에서는 **“민감한 사용자 데이터(얼굴·전신 아바타·개인 의류 이미지)를 구조적으로 어떻게 보호·격리·파기하는가”**가 서류·발표 심사에서 반드시 확인하는 평가 기준이 되었습니다.  
> 본 문서는 사업계획서 본문(실현가능성·기술성·사업성·리스크 관리 섹션)과 발표 심사 Q&A에 바로 인용할 수 있도록 작성했습니다.

---

## 1. 서비스 개요 및 민감 데이터 보호의 중요성

### 1-1. iNVTRY(A inventory) 핵심 가치
**iNVTRY**는 사용자의 실제 옷장 사진 한 장으로 디지털 옷장을 자동 정리하고, 실시간 날씨·장소(TPO)·퍼스널컬러를 결합해 8각도 AI 가상 피팅(VTON)과 오프라인 매장 내 중복 구매 확인을 함께 제공하는 **디지털 옷장 서비스**입니다.

### 1-2. 다루는 데이터의 민감도 인식
패션 AI 서비스는 단순 텍스트가 아닌 **① 사용자의 얼굴·피부톤(생체 특징 정보)**, **② 전신 체형·치수**, **③ 사적인 생활 공간이 노출될 수 있는 개인 의류 사진**을 취급합니다. iNVTRY는 이를 ‘추후 보완할 운영 이슈’가 아니라 **처음부터 전제로 둔 보안 기준(Privacy-by-Design)**으로 정의하고, MVP 단계부터 코드 수준으로 핵심 보안 통제를 내재화했습니다.

---

## 2. 경쟁사 대비 핵심 차별화: 「Privacy-by-Design 4대 방어선」

일반적인 초기 패션·AI 스타트업이 “원본 셀카·의류 사진을 단일 공용 버킷에 올리고 무료 LLM API에 그대로 전송”하는 관행과 달리, iNVTRY는 **수집·인증·저장·AI 전송·파기 전 구간을 4중 방어선으로 설계**했습니다.

| 구분 | 일반 초기 AI 패션 서비스 (취약 관행) | **iNVTRY 보안 아키텍처 (평가 차별화 포인트)** |
| :--- | :--- | :--- |
| **1. 생체(얼굴) 처리** | 원본 셀카를 서버·클라우드로 업로드하여 분석 | **0-Byte 온디바이스 처리**: 클라이언트 MediaPipe WASM에서 100% 로컬 분석 후 IndexedDB 페이스 볼트 격리 |
| **2. OAuth · 인증 토큰** | 소셜 Access/Refresh 토큰 DB 저장, 이메일 일치 시 무단 자동 병합 | **OAuth 토큰 무보관(Stateless OIDC)**: 서버 JWKS/OIDC 서명 검증 후 `sub`만 매핑, 이메일 자동 병합 금지(ATO 차단), `HttpOnly` 세션 쿠키 + Rate Limit |
| **3. 스토리지 권한 분리** | 공용 URL/단일 폴더에 타인 이미지 혼재(URL 추측 시 유출 위험) | **테넌트 강제 격리 + 3-Zone 스토리지**: 모든 API `resolveAuthorizedClosets` IDOR 차단, 파일 매직바이트·경로순회 검증·샌드박스 CSP 적용, 상용 전환 시 Private 버킷 + 15분 단기 Signed URL + CMEK 암호화 |
| **4. 제3자 AI 전송 · 파기** | 원본 JPEG(GPS·EXIF·실내 배경 포함) 전송, 무료 API 학습 활용 우려, 탈퇴 후 잔존 | **EXIF·배경 제거 비식별 WebP + PII 배제 + No-Training**: Vertex AI/Gemini 유료 엔터프라이즈 무학습 경로, 응답 즉시 메모리 파기, 회원 탈퇴 시 DB·파일·캐시·로컬 볼트 **원스톱 즉시 영구 파기** |

---

## 3. 사업계획서 본문 삽입용 3대 핵심 보안 정책

### 3-1. OAuth 인증 및 세션 토큰 보안 관리
- **신뢰된 OIDC 서명 검증 (PKCE S256 + 로컬 RS256 JWKS)**: Google OAuth 2.0 Authorization Code + PKCE(`GET /api/auth/google/start`, `/callback`) 및 Apple Sign-In 시 클라이언트가 전달한 이메일을 신뢰하지 않고, 서버가 직접 IdP 공개키(JWKS)로 `RS256` 서명과 `iss`·`aud`·`azp`·`exp`·`nonce`·`email_verified` 클레임을 암호학적으로 검증합니다.
- **계정 탈취(ATO) 구조적 차단**: 미검증 이메일 일치만으로 기존 계정에 소셜 계정을 자동 연결하는 취약 패턴을 코드 레벨에서 금지(`409 ACCOUNT_EMAIL_CONFLICT`)하고, 정규화된 `user_identities(provider, provider_sub)` 매핑과 인증된 명시적 계정 연결(`mode=link`)만 허용합니다.
- **OAuth 토큰 비보관 정책**: 외부 IdP의 Access/Refresh 토큰을 클라이언트 LocalStorage나 서버 DB에 저장하지 않고 교환 직후 즉시 폐기해, 단말이나 일부 세션이 탈취되더라도 사용자의 Apple/Google 계정으로 이어지는 2차 유출을 막습니다.
- **동일 출처(`ainvtry.com/app`) 세션 수명주기 및 무차별 대입 방어**: `HttpOnly` · `SameSite=Lax` · `Secure`(HTTPS) 쿠키로 XSS 기반 토큰 탈취와 Safari ITP 서드파티 쿠키 차단을 동시 해결하며, 12시간 주기 만료 세션 자동 소거, IP/계정별 Rate Limiting, OTP 60초 쿨다운 및 상수 시간 비교(`timingSafeStringEquals`)를 적용했습니다. 상용 스케일업 시 단기 Access + Refresh Token Rotation 및 모바일 하드웨어 Keychain/Keystore 바인딩을 추가합니다.

### 3-2. 스토리지 접근 권한 분리 및 멀티테넌트 격리
- **애플리케이션 계층 IDOR 차단**: 모든 의류·코디·착용 기록·가상 피팅 API에 중앙 인가 가드(`resolveAuthorizedClosets`)를 의무 적용하여, 비로그인 체험자(`sample`)는 읽기 전용 샘플 옷장에만, 정식 회원은 본인 소유 옷장(`closet_*`)에만 접근할 수 있도록 수평적 권한을 엄격히 분리했습니다.
- **파일 업로드 검증 및 저장형 XSS 차단**: 이미지 업로드 시 매직 바이트 시그니처 검증, 4MB 용량 상한, 경로 순회(Path Traversal) 차단, DB 소유권 교차 검증을 수행하며, 정적 미디어 응답(Express 및 Cloudflare Worker `/uploads/*` 프록시)에 `Content-Security-Policy: default-src 'none'; sandbox` 및 `X-Content-Type-Options: nosniff` 헤더를 강제합니다.
- **GCP 서울 리전(`asia-northeast3`) 3-Zone 클라우드 스토리지 및 Cloud SQL 아키텍처 (`dbAdapter.js` · `storageAdapter.js` · `scripts/setup-gcp-prod.sh` 구현 완료)**:
  - **Zone A (Public Seed)**: 샘플 캡슐 의류·공용 3D 베이스 에셋(읽기 전용 CDN).
  - **Zone B (Private User Vault)**: 사용자 의류·코디 전용 비공개 GCS 버킷(`Public Access Prevention` 강제, Uniform Bucket-Level Access, 인증·소유권 검증 통과 사용자에게만 **15분 이하 단기 V4 Signed URL** 또는 인증 프록시 제공, 상용 확장 시 Cloud KMS CMEK 적용).
  - **Zone C (Ephemeral AI Scratch)**: 가상 피팅 중간 산출물 전용 임시 버킷(**24시간 Object Lifecycle 자동 영구 삭제** + 회원 탈퇴 시 즉시 삭제).
  - **관계형 DB**: 서울 리전 **Cloud SQL for PostgreSQL 16**(`db-f1-micro`, 7일 자동 백업) 기반으로 서울 리전 안에서 데이터를 처리합니다.
- **API 시크릿 및 위치 미디어 격리**: Gemini·Google OAuth Secret·Google Maps·Weather 키는 GCP Secret Manager 및 서버 환경변수(`process.env`)에만 격리하며, Google Maps Street View/Place Photos 미디어는 DB에 영구 저장하지 않아 제3자 약관(ToS)과 위치 프라이버시를 동시에 준수합니다.

### 3-3. 제3자 AI API 이미지 전송 시 비식별화 · 보유기간 · 파기 정책
- **전송 전 비식별화(De-identification)**:
  1. **생체 분리**: 안면 피부톤 분석은 온디바이스 MediaPipe WASM에서만 처리합니다(외부 전송 `0 Bytes`).
  2. **배경·메타데이터 제거**: 의류 촬영·업로드 직후 클라이언트 스마트 크롭 및 배경 제거(알파 매팅) → `image/webp` 재인코딩을 거쳐 **GPS·촬영기기·일시 등 EXIF 메타데이터와 실내 사생활 배경을 100% 제거**한 순수 의류 객체만 서버·AI로 전달합니다.
  3. **직접 식별자(PII) 차단**: AI 프롬프트·페이로드에 성명·이메일·전화번호·실명 ID·실제 주소를 포함하지 않고, 익명화된 스타일/체형 코드 및 난수 요청 키만 사용합니다.
- **AI 모델 학습 미사용(Zero Model Training) 보장**:
  - 유료 Google Cloud **Vertex AI / Gemini Enterprise Paid Tier** 경로를 사용하여, 사용자의 의류·가상 피팅 이미지가 제3자 AI 모델 학습 데이터로 재활용되지 않도록 기술적·계약적 경계를 확보합니다.
- **명확한 보유기간 및 즉시 파기(Retention & Disposal)**:
  - **안면 카메라 원본 프레임**: `0초` (클라이언트 메모리 즉시 해제, 미저장)
  - **AI API 전송 페이로드 · 일회성 쇼핑 중복 분석**: `0일` (추론 응답 직후 서버 메모리 즉시 폐기)
  - **VTON 생성 임시 캐시**: `최대 24시간`(상용 Zone C 자동 만료) 및 탈퇴 시 즉시 영구 삭제
  - **사용자 의류 이미지 · 옷장 DB**: `회원 탈퇴 시까지` (탈퇴 실행 시 `DELETE /api/auth/account`를 통해 DB 레코드·모든 세션·물리 업로드 파일·VTON 캐시·로컬 IndexedDB 볼트까지 **원스톱 즉시 영구 파기**)

---

## 4. 규제 준수 및 2027 바우처 공급기업 보안 자체 점검표

| 검증 기준 | 준수 항목 | iNVTRY 대응 현황 |
| :--- | :--- | :--- |
| **개인정보보호법 (PIPA)** | 제16조(최소수집), 제21조(파기), 제28조의2(가명·비식별), 제29조(안전성 확보조치) | 온디바이스 0-Byte 생체 처리, EXIF/배경 제거 WebP, 탈퇴 즉시 원스톱 파기, TLS 1.3·보안 헤더·Rate Limit 적용 |
| **Apple App Store / Google Play** | App Store 5.1.1(v) 인앱 계정 삭제 의무, Google Play 데이터 보안 섹션 | 앱 내 `[계정 설정 → 회원 탈퇴 및 즉시 영구 삭제]` 구현 완료, 카메라·갤러리·안면 분석 사전 동의 모달 구현 완료 |
| **AI·데이터 바우처 공급기업 검증** | AI 학습 데이터 오염·유출 방지, 제3자 API 비식별화, 멀티테넌트 접근 통제 | Vertex AI Paid/No-Training 엔드포인트 지원, PII 배제 프롬프트, `resolveAuthorizedClosets` 테넌트 격리, CI 시크릿 스캔(`verify:secrets`) |
| **2027 상용 보안 고도화 예산 계획** | 사업비(외주용역·인프라) 보안 항목 명시 | ① GCP Cloud Storage 3-Zone + CMEK + Cloud Armor 구축, ② 출시 전 외부 전문기관 웹·모바일 취약점 진단(모의해킹) 1회 수행, ③ 개인정보보호 배상책임보험 및 침해사고 24시간 대응 SOP 수립 |

---

## 5. 발표 심사 · 현장 실사 예상 Q&A (대응 스크립트)

**Q1. 사용자의 얼굴과 전신 사진이 외부 생성형 AI(Gemini 등)에 넘어가면 학습에 쓰이거나 유출될 위험이 있지 않나요?**  
> **A.** iNVTRY는 데이터를 두 갈래로 엄격히 분리합니다. 첫째, 얼굴 피부톤 분석은 100% 사용자 스마트폰·브라우저 내부의 MediaPipe WebAssembly에서만 처리해 외부 전송량이 **0 Bytes**입니다. 둘째, 사용자가 명시적으로 요청한 의류 태깅·가상 피팅은 클라이언트에서 배경과 EXIF(GPS·기기정보)를 제거한 비식별 WebP 이미지만 전송하며, 개인 식별정보(PII)를 페이로드에서 완전 배제하고 **모델 재학습 미사용(No-Training)**이 보장되는 Google Cloud Vertex AI / Gemini 유료 엔터프라이즈 경로로 처리한 뒤 즉시 휘발합니다.

**Q2. 최근 ‘모두의 창업’ 사례처럼 인증 토큰이나 타인 스토리지 URL이 노출되어 개인정보가 유출되는 사고는 어떻게 막나요?**  
> **A.** 인증 단계에서는 외부 OAuth(Apple/Google)의 Access/Refresh 토큰을 아예 저장하지 않고, 서버에서 암호학적으로 서명 검증한 `sub`만 내부 `HttpOnly` 세션으로 발급하며 이메일 기반 자동 병합을 코드로 금지했습니다. 스토리지 단계에서는 모든 API가 `resolveAuthorizedClosets` 테넌트 가드를 통과하도록 강제했고, 상용 클라우드(GCS) 배포 시 사용자 의류 버킷을 전면 비공개(Public Access Prevention)로 잠근 뒤 권한 검증을 거친 **15분 이하 단기 Signed URL**로만 제한 접근하도록 설계했습니다.

**Q3. 사용자가 탈퇴하면 정말 모든 사진과 AI 피팅 결과물이 지워지나요?**  
> **A.** 네. 앱 내 원클릭 회원 탈퇴(`DELETE /api/auth/account`) 실행 시 서버에서 DB 레코드와 모든 활성 세션, 참조 검사된 물리 업로드 파일, VTON 생성 캐시(`data/vton-cache`)를 즉시 삭제하고, 동시에 클라이언트 단말의 로컬 IndexedDB 페이스 볼트까지 전량 소거하는 원스톱 영구 파기 파이프라인을 이미 구현·검증했습니다.
