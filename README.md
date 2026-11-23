# iNVTRY (A inventory)

플레이스토어 · 앱스토어 출시 규격 및 **Apple HIG(Human Interface Guidelines)** 무채색 미니멀 디자인 시스템을 적용한 3D 디지털 옷장 · AI 가상 피팅(VTON) · 오프라인 쇼핑 중복 판독 하이브리드 아틀리에입니다.

---

## 핵심 기능 요약

1. **Apple HIG 무채색 미니멀 3D 스튜디오 & 경량 물리 엔진**
   - 라이트(`#FFFFFF` · `#F5F5F7`) / OLED 다크(`#000000` · `#1C1C1E`) 무경계 8pt 그리드 디자인 및 고정폭 수치(`tabular-nums`) 적용
   - 21-Bone 스켈레탈 모션(`idle`, `walk`, `wave`, 날씨 연동 `umbrella`, 장갑 인스펙션 `pose_hands`), 28종 체형 모프 타겟, PCCS 12톤 · MST-04 퍼스널컬러 마네킹 동기화
   - 머플러·스카프·가방·코트·스커트 본 기반 경량 `SpringBone` 물리, 8-앵글 360° 턴어라운드, `webglcontextlost` 자동 복구 + 2D 플랫레이 폴백 뷰어
2. **AI 의류 등록 & 멀티앵글 가상 피팅(VTON) · 컨텍스트 배경 파이프라인**
   - 사진 촬영·업로드 직후 8-핸들 스마트 크롭 → 알파 매팅 배경 제거(누끼) → `image/webp` 압축 정규화(EXIF/GPS 메타데이터 자동 제거)
   - 대분류·소분류, 주요 색상, 계절감, 원단(`cotton`, `denim`, `knit`, `leather`, `wool`, `silk`, `padding`) 자동 추론 및 11-슬롯 매핑
   - Google Weather v1 · Places (New) · Street View(지상 눈높이 거리뷰 필터 + 위치 조절 시트) 서버 프록시 연동으로 실시간 TPO·날씨·실제 장소 배경 동기화
3. **리텐션 · 스마트 케어 & 오프라인 우선(Offline-first) 동기화**
   - 날짜별 OOTD 착용 기록(`worn`) · 미래 코디 예약(`planned`, `.ics` 내보내기) · 여행 기간/목적지별 짐싸기 체크리스트
   - 벤토 인사이트 카드(1회 착용 비용 `CPW`, 미착용 방치 알림, 색상·카테고리 편중도, 스마트 세탁·이염 가이드 & 주변 케어 맵)
   - 비로그인 **샘플 옷장 체험 모드** 분리 및 로그인 사용자용 개인 옷장 + **IndexedDB 오프라인 우선** 동기화
4. **Capacitor 8 모바일 하이브리드 패키징**
   - Capacitor 정식 설정(`com.ainventory.app`, `android/` 네이티브 프로젝트 포함) 및 모바일 스토어(App Store · Google Play) 권한 안내·인앱 계정 즉시 삭제 규격 준수

---

## 보안 아키텍처 및 개인정보 보호 체계 (Privacy-by-Design)

iNVTRY는 사용자의 **전신·안면 아바타 및 개인 의류 이미지**를 취급하는 서비스 특성상, 2027년 정부 창업지원사업 및 AI·데이터 바우처 공급기업 보안 검증 기준에 부합하는 3대 핵심 보안 통제를 아키텍처 전반에 적용했습니다.

### 1. OAuth 인증 및 세션 토큰 관리
- **서버 측 암호학적 OIDC 검증**: **Sign in with Apple**(`POST /api/auth/apple`, JWKS 서명·`iss`/`aud`/`exp` 검증), **Google OAuth 2.0**(`POST /api/auth/google`, `oauth2.googleapis.com/tokeninfo` 검증) 및 이메일 6자리 OTP(60초 재발송 쿨다운 · Rate Limit · 상수 시간 비교)를 지원합니다.
- **계정 탈취(ATO) 차단 및 OAuth 토큰 비보관**: 미검증 이메일 일치 기반의 자동 계정 병합을 금지하고 `(provider, sub)` 고유 식별자로만 매핑합니다. 외부 IdP의 Access/Refresh 토큰은 클라이언트·서버 DB에 저장하지 않으며, 서버 발급 불투명 세션 토큰만 `HttpOnly` · `SameSite=Lax` · `Secure`(HTTPS) 쿠키로 관리합니다.
- **세션 자동 만료 및 즉각 폐기**: 12시간 주기 만료 세션 자동 청소, 로그아웃·회원 탈퇴 시 서버 `sessions` 테이블 즉시 삭제를 수행합니다. (상용 스케일업 시 Short-lived Access + Refresh Token Rotation 및 Capacitor 네이티브 Keychain/Keystore 적용)

### 2. 스토리지 접근 권한 분리 (Tenant & Storage Isolation)
- **계정·옷장 단위 IDOR 원천 차단**: 모든 의류·코디·착용 기록·가상 피팅 API는 중앙 인가 가드(`resolveAuthorizedClosets`)를 통과하여 본인 소유 옷장(`closet_*`) 외 접근을 `403 Forbidden`으로 차단하며, 비로그인 체험자(`sample`)는 읽기 전용으로 격리합니다.
- **업로드 검증 및 저장형 XSS 차단**: 이미지 업로드 시 매직 바이트 시그니처 검증, 4MB 용량 상한, 경로 순회(Path Traversal) 방어, DB 소유권 교차 검증을 수행하며 `/uploads/*` 응답에 `Content-Security-Policy: default-src 'none'; sandbox` 및 `nosniff` 헤더를 강제합니다.
- **온디바이스 생체 볼트 및 3-Zone 클라우드 스토리지 설계**: 안면 피부톤 분석(`MediaPipe FaceLandmarker` WASM)은 100% 기기 로컬에서 수행되어 보정 페이스 메모리가 클라이언트 **IndexedDB**에만 격리 저장됩니다(외부 업로드 `0 Bytes`). 상용 클라우드 전환 시 **Public Seed / Private User Vault(전면 비공개 · 15분 단기 Signed URL · CMEK 암호화) / Ephemeral AI Scratch(24시간 자동 삭제)** 3-Zone으로 물리·IAM 분리합니다.

### 3. 제3자 AI API 이미지 전송 시 비식별화 · 보유기간 · 파기 정책
- **전송 전 비식별화**: 클라이언트 크롭·배경 제거(누끼) 및 `image/webp` 재인코딩 단계에서 **GPS·기기정보 등 EXIF 메타데이터와 실내 사생활 배경을 100% 제거**하며, AI 프롬프트·페이로드에는 성명·이메일·전화번호·실제 주소 등 직접 식별자(PII)를 절대 포함하지 않습니다.
- **모델 학습 미사용(Zero Model Training)**: Google Cloud **Vertex AI / Gemini Enterprise Paid Tier** 경로를 사용하여 입력·출력 이미지의 AI 재학습 미사용 및 추론 직후 휘발(Stateless Inference)을 보장합니다.
- **데이터 유형별 보유기간 및 원스톱 파기**:

| 데이터 유형 | 제3자 AI 전송 | 보유기간 | 파기 방식 |
| :--- | :--- | :--- | :--- |
| 안면 카메라 원본 프레임 | **미전송 (0 Bytes)** | **0초 (미저장)** | 로컬 WASM 분석 직후 RAM 즉시 해제 |
| 보정 페이스 메모리 (로컬 볼트) | 미전송 (명시 VTON 선택 시 제외) | 로그아웃·탈퇴 시까지 | 기기 IndexedDB 즉시 삭제 (`purgeAllLocalUserData`) |
| AI 전송 페이로드 · 1회성 쇼핑 분석 | 비식별 WebP · PII 배제 | **0일 (응답 직후)** | 서버 메모리 즉시 파기, 디스크 미보관 |
| VTON 멀티앵글 임시 캐시 | 출력 결과 단기 캐시 | **최대 24시간(상용) / 자동 순환** | TTL 자동 만료 및 탈퇴 시 소유자 접두사 일괄 삭제 |
| 사용자 의류 업로드 · 옷장 DB | 태깅/VTON 요청 시 최소 전송 | **회원 탈퇴 시까지** | `DELETE /api/auth/account` 단일 트랜잭션 즉시 영구 파기 |
| Google Maps / Weather 미디어 | 서버 프록시 (최소 FieldMask) | **지도 미디어 0건 / 날씨 20~30분** | 지도 DB 미저장, 날씨 메모리 TTL 자동 만료 |

### 관련 상세 보안 · 사업계획 문서
- **[시스템 아키텍처 및 데이터 보안 명세서 (`docs/ARCHITECTURE_SECURITY.md`)](docs/ARCHITECTURE_SECURITY.md)** — 4계층 신뢰 경계, OAuth 토큰 수명주기, 3-Zone 스토리지 권한 분리, AI 비식별화·파기 매트릭스 및 구현/상용 로드맵
- **[2027 정부 창업지원사업 · 바우처 공급기업 사업계획서 보안 보강안 (`docs/BUSINESS_PLAN_2027_SECURITY.md`)](docs/BUSINESS_PLAN_2027_SECURITY.md)** — ‘모두의 창업’ 이슈 대응 평가 차별화 표, PIPA·스토어·바우처 점검표, 발표 심사 예상 Q&A

---

## 로컬 환경에서 바로 열기 & 실행

**권장 환경**: Node.js 20.19+ 또는 Node.js 22 / 24 LTS (`sql.js` 순수 WASM SQLite 내장으로 별도 네이티브 DB 빌드 불필요)

```bash
git clone https://github.com/RaymandooMoon/Ainventory.git
# 이미 클론되어 있다면:
# git pull origin main

cd Ainventory
npm install
npm run dev
```

- 실행 후 브라우저에서 로컬 개발 서버(`http://localhost:3000`)로 접속하면 프론트엔드와 내장 Express API 서버(`/api/*`)가 함께 동작합니다.
- 초기 진입 화면에서 **샘플 옷장 체험 모드**로 즉시 테스트하거나, 이메일 OTP(로컬 개발 시 `data/outbox/` 안내 확인) / Apple 로그인 / Google 로그인을 사용할 수 있습니다.
- 서버 API 키(`GEMINI_API_KEY`, `GOOGLE_MAPS_API_KEY` 등)는 `.env.example`을 참고해 로컬 `.env`에만 설정하며 절대 저장소에 커밋하지 않습니다.

## 주요 명령어

```bash
# 개발 서버 실행 (Vite + Express API 통합, Port 3000)
npm run dev

# 프로덕션 빌드 및 정적/API 서버 단독 실행
npm run build
PORT=3000 npm start

# 빠른 정적 검증 (oxlint + tsc --noEmit) 및 시크릿 스캔
npm run verify:quick
npm run verify:secrets

# 통합 검증 (lint + typecheck + build)
npm run verify

# Capacitor Android 웹 에셋 빌드 및 네이티브 동기화
npm run cap:sync

# 무인 모바일 E2E 검증 스위트 (최초 1회 브라우저 설치 시: npx playwright install chromium)
npm run test:e2e
```
