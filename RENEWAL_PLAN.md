# A inventory 전면 감사 결과 및 3-트랙 병렬 리뉴얼 계획서 (`RENEWAL_PLAN.md`)

- **감사 총괄**: 카본(Carbon) 총괄 감사관
- **감사 일시**: 2026-11-11
- **감사 원칙**: 100% Read-Only 전수 독해 (기존 원본 소스 수정 `0`줄 상태에서 작성)
- **스캔 범위**: `node_modules`, `dist`, `.git`, `android/app/build`, 바이너리 에셋(`.glb`, `.wasm`, `.task`)을 제외한 프론트엔드(`src/**`, `index.html`, `public/**`), 백엔드/DB(`server/**`), 3D·비전·물리 엔진(`src/utils/**`, `tools/blender/**`), 모바일 네이티브 설정(`capacitor.config.ts`, `android/**`), E2E 테스트(`playwright.config.js`, `tests/e2e/**`), CI/CD 및 스크립트(`.github/workflows/**`, `scripts/**`), 루트 설정 파일(`package.json`, `tsconfig.json`, `.oxlintrc.json`, `vite.config.js`) **전체 31,202라인 전수 독해 완료**

---

## 0. 총괄 요약 (Executive Summary)

| 감사 트랙 | Critical | Major | Minor | 핵심 진단 요약 |
| :--- | :---: | :---: | :---: | :--- |
| **1. 아키텍처 · 일관성 · 데드 코드** | 3 | 9 | 3 | MediaPipe 엔진 이원화(외부 CDN 유출), 크롭 모달·배경 누끼·색상 수학·시드 맵 다중 중복, `carbonDesignContract.ts` 미연결(0 import), `src/index.css` 95개 데드 클래스(~1,150라인), TS 프로젝트 내 95% JS/JSX 방치 |
| **2. 타입 안전성 · 데이터 무결성 · 오프라인 동기화** | 5 | 9 | 3 | `checkJs: false`로 인한 정적 검증 공백, `standaloneFallback.js` 경로·스키마 불일치, IndexedDB 사용자/옷장 격리 부재 및 로그아웃 시 타 계정 큐 재생, 4xx 영구 큐 독성(Poisoning) 및 음수 `tempId` 참조 깨짐, 비원자적 `sql.js` 전체 파일 덮어쓰기·트랜잭션 부재 |
| **3. 3D WebGL · MediaPipe · 모바일 성능** | 3 | 10 | 5 | 프로필 모달 진입 시 동시 10개 WebGL 컨텍스트 생성으로 모바일 컨텍스트 강제 축출(Thrashing), `forceContextLoss`·`Skeleton.dispose`·`PMREM WebGLRenderTarget` 해제 누락, `FaceLandmarker.close()` 미호출로 WASM 힙 영구 점유, 초기 번들 내 `three`+`@mediapipe` 정적 포함 |
| **4. 보안 · 앱스토어 컴플라이언스 · E2E 정합성** | 7 | 9 | 4 | `/api/auth/apple` 무서명 디코딩 기반 계정 탈취(ATO), 운영 응답 내 OTP·토큰 평문 노출, 수평적 권한 우회(IDOR) 및 `X-Demo-Mode` 전 옷장 열람, `/admin/reset-demo` 전 회원 데이터 삭제, Android `READ_MEDIA_IMAGES` 정책 위반, 회원 탈퇴 시 고아 업로드·Outbox 잔존, E2E 셀렉터 드리프트 |
| **합계** | **18** | **37** | **15** | **총 70건 식별 (중복 교차 항목 통합 정규화 기준)** |

---

## 1. 트랙 1 감사 결과 — 아키텍처, 코드 일관성, HIG UI 및 데드 코드

### [T1-01] `Critical` — MediaPipe 얼굴 랜드마크 엔진 이원화 및 외부 `@latest` CDN 런타임 호출
- **파일 및 라인**: `src/utils/faceLandmarkerLocal.js:9-65` (`lines 19, 26`), `src/utils/faceLandmarkEngine.js:1-420`, `src/components/ProfilePersonalColorModal.jsx:31, 371-395`
- **문제 원인**: 로컬 `/mediapipe/wasm` 및 `/mediapipe/face_landmarker.task`를 사용하는 `faceLandmarkEngine.js`가 이미 존재함에도 `faceLandmarkerLocal.js`가 중복 추가되어 `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm` 및 `https://storage.googleapis.com/...` 외부 CDN을 런타임에 호출함. 또한 피부 샘플링 핀 키가 3종(`cheekL` vs `left_cheek` vs `leftCheek`)으로 파편화되어 있으며, 사진 1장 진단 시 두 엔진이 연달아 2회 추론을 수행함.
- **리뉴얼 방안**: `src/utils/faceLandmarkerLocal.js`를 완전 제거하고 로컬 에셋 전용 `src/utils/faceLandmarkEngine.js`로 단일화하며, 핀 키를 `DEFAULT_SKIN_PINS`(`forehead`, `leftCheek`, `rightCheek`, `noseChin`)로 통일.

### [T1-02] `Critical` — `src/contracts/carbonDesignContract.ts` 미연결(Dead Contract)로 인한 UI-QA 상수 드리프트
- **파일 및 라인**: `src/contracts/carbonDesignContract.ts:1-96`, `src/components/WardrobeView.jsx:577, 709`, `tests/e2e/mobile-flows.spec.js:39-235`
- **문제 원인**: 디자인 토큰·DOM ID·3D 텔레메트리 계약 파일이 정의만 되어 있고 `src/`, `server/`, `tests/` 어디에서도 `import`되지 않아 컴포넌트와 E2E 테스트가 매직 스트링을 중복 하드코딩함.
- **리뉴얼 방안**: `CARBON_HIG_TOKENS`, `CARBON_DOM_CONTRACT`, `Carbon3DTelemetry` 및 공통 도메인 인터페이스를 확장 동결하고 UI 컴포넌트·3D 엔진·Playwright 테스트에서 직접 `import`하도록 일원화.

### [T1-03] `Critical` — 5종 모달·바텀시트 전반의 접근성 다이얼로그 시맨틱(`role="dialog"`, `aria-modal`, `Escape` 닫기, 포커스 관리) 전무
- **파일 및 라인**: `src/components/common/AppUI.jsx:129-183`, `src/App.jsx:573-605`, `src/components/ProfilePersonalColorModal.jsx:611-616`, `src/components/PortraitCropAndPinEditorModal.jsx:274-293`, `src/components/SmartPhotoCropEditorModal.jsx:442-455`
- **문제 원인**: 모든 시트와 모달이 일반 `<div>` 백드롭 클릭에만 의존하여 스크린리더 모달 경계 인식 불가, 키보드 `Escape` 닫기 미동작, 배경 포커스 이탈 발생.
- **리뉴얼 방안**: `ResponsiveSheetModal` 및 전체 커스텀 모달에 `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `Escape` 키 리스너 및 오픈 시 초기 포커스/복원 처리를 표준 적용.

### [T1-04] `Major` — 색상 변환(`hexToRgb` 5중복, `rgbToLab` 3중복) 및 60종 스튜디오 시드·11슬롯·카테고리 사전 다중 복제
- **파일 및 라인**: `src/utils/imageTools.js:4-69`, `src/utils/aiGarmentPipeline.js:12-97`, `src/components/SmartPhotoCropEditorModal.jsx:38-56`, `src/components/StudioGarmentImage.jsx:6-88, 160-172`, `server/engine.js:91-155, 720-852`, `server/wardrobeStatsAndGenerator.js:22-121`, `src/utils/api.js:187-292`
- **문제 원인**: 클라이언트와 서버 간 공유 유틸리티 계층 없이 기능 추가마다 색상 수식, 11개 착용 슬롯, 스튜디오 팩샷 매핑을 파일별로 복사하여 팔레트 매칭 공식까지 3갈래(가중 RGB, 유클리드 RGB, CIELAB $\Delta E$)로 불일치.
- **리뉴얼 방안**: `src/shared/colorMath.js`(`+.d.ts`)와 `src/shared/garmentTaxonomy.js`(`+.d.ts`)로 통합하여 서버(`server/*`)와 클라이언트(`src/*`)가 단일 CIELAB $\Delta E$ 수식 및 단일 11슬롯/시드/퍼스널컬러 카탈로그를 공유.

### [T1-05] `Major` — 3중 배경 제거(Cutout) 루틴 중첩으로 인한 이중 매팅(Double-Matting) 헤일로 결함
- **파일 및 라인**: `src/components/SmartPhotoCropEditorModal.jsx:129-175, 212-218`, `src/utils/aiGarmentPipeline.js:102-241`, `src/components/StudioGarmentImage.jsx:187-374`
- **문제 원인**: `SmartPhotoCropEditorModal`이 크롭된 의류 이미지 배경을 `#F5F5F7` 단색으로 칠하고 PNG DataURL로 인코딩한 직후 `removeBackgroundAndEncodeWebP`로 다시 넘겨, 원래 배경색 경계 정보를 훼손하고 3회 연속 전체 해상도 인코딩/디코딩을 유발함.
- **리뉴얼 방안**: 크롭 캔버스 원본 픽셀을 `#F5F5F7` 합성 없이 곧바로 `removeBackgroundAndEncodeWebP` 및 `extractGarmentAIMetadata`에 전달하여 단일 패스로 처리.

### [T1-06] `Major` — `AppUI.jsx`와 `src/index.css` 클래스명 불일치 및 95개 레거시 데드 CSS 클래스(~1,150라인) 누적
- **파일 및 라인**: `src/components/common/AppUI.jsx:15, 180, 192` vs `src/index.css:163-318, 587-770, 1017-1159, 1348-1718, 2477-2607, 2610-2860`
- **문제 원인**: `AppUI.jsx`는 `.ui-sheet-content`, `.ui-page-header-text`, `.ui-empty-box`를 렌더링하지만 `src/index.css`는 구 명칭(`.ui-sheet-body`, `.ui-page-header-copy`, `.ui-empty-state`)을 스타일링하여 바텀시트 내부 스크롤 제한(`max-height`)이 누락됨. 또한 구 버전 아틀리에/보더 카드/스플릿 로그인용 95개 미사용 클래스와 40여 개 `!important` 패치가 혼재함.
- **리뉴얼 방안**: 미사용 레거시 CSS 블록을 전면 정리하고 `.ui-sheet-content` 스크롤 컨테이너 및 HIG 모노크롬 스타일 규칙을 정합화.

### [T1-07] `Major` — `<ResponsiveSheetModal>`의 `actions` 프롭 누락 및 도달 불가능(Unreachable) JSX 분기 잔존
- **파일 및 라인**: `src/components/OutfitStudioView.jsx:381-389` vs `src/components/common/AppUI.jsx:71-80`; `src/components/VirtualMannequin.jsx:20-35, 748-794`; `src/components/SmartPhotoCropEditorModal.jsx:253-288`; `src/components/AnalyticsCalendarView.jsx:42, 437`
- **문제 원인**: `OutfitStudioView`가 전달하는 `actions`(셔플 버튼)를 `ResponsiveSheetModal`이 받지 않아 무시되며, 항상 `immersiveStudio` 또는 `compactPreview`로만 호출되는 `VirtualMannequin`의 하단 구형 `.atl-fitting` 분기 등이 데드 코드로 남음.
- **리뉴얼 방안**: `ResponsiveSheetModal` 헤더에 `actions` 슬롯을 지원하여 코디 셔플 버튼을 복원하고, 도달 불가능한 레거시 분기를 제거.

### [T1-08] `Major` — Apple HIG `44×44pt` 최소 터치 타깃 미달 버튼 및 키보드/라벨 접근성 결함
- **파일 및 라인**: `src/index.css:1204-1206` (`.icon-btn` `36×36px`), `3495` (`.hig-weather-capsule` `40px`), `3520-3522` (`.hig-float-icon-btn` `40×40px`); `src/App.jsx:297-303`; `src/components/PortraitCropAndPinEditorModal.jsx:526-531`; `src/components/ShoppingCheckView.jsx:414-419`
- **문제 원인**: 아이콘 버튼과 스튜디오 플로팅 컨트롤이 `36px`/`40px`로 설계되어 모바일 터치 최소 규격(`44px`)에 미달하며, 지구본 언어 전환 버튼의 `aria-label` 누락, `role="slider"`의 키보드 조작·`aria-value*` 누락, 폼 `<label>`의 `htmlFor` 미연결이 다수 존재.
- **리뉴얼 방안**: 주요 터치 컨트롤 최소 히트 영역을 `44×44px`로 상향하고, 누락된 `aria-label`, 키보드 핸들러(`Enter`/`Space`/방향키), `<label htmlFor>` 연결을 완비.

### [T1-09] `Major` — 레거시 웜베이지/골드 컬러 잔재, PWA 매니페스트 불일치 및 비반응형 DOM 테마 참조
- **파일 및 라인**: `public/manifest.webmanifest:9-19`, `public/icon.svg:2-4`, `src/index.css:513, 994, 2946`, `src/App.jsx:290, 429`, `src/components/LoginView.jsx:223, 230-240`, `src/utils/i18n.js:3-111`
- **문제 원인**: `manifest.webmanifest`(`#F4F1EA`)와 `icon.svg`(`#1C1917`/`#C9A87C`), 일부 CSS 보더에 구 웜톤 색상이 남아 있고, 렌더링 중 `document.documentElement.getAttribute('data-theme')`를 직접 읽어 시스템 테마 변경 시 아이콘이 즉시 갱신되지 않으며, `LoginView` 한/영 토글 버튼이 `tr()`과 연결되지 않음.
- **리뉴얼 방안**: 매니페스트·아이콘·잔여 CSS를 순수 Apple HIG 모노크롬(`#FFFFFF` / `#F5F5F7` / `#000000` / `#1C1C1E` / `#1D1D1F`)으로 통일하고, 테마 상태 구독 훅과 `LoginView` 다국어 번역을 연결.

### [T1-10] `Major` — TS 프로젝트 내 JS/JSX 혼재(`vite.config.js`, `playwright.config.js`, `tests/e2e/*.js`, `src/utils/*.js`)
- **파일 및 라인**: `tsconfig.json:8-30`, `vite.config.js:1-30`, `playwright.config.js:1-72`, `tests/e2e/mobile-flows.spec.js`, `tests/e2e/studio-webgl-perf.spec.js`
- **문제 원인**: `capacitor.config.ts`와 `carbonDesignContract.ts`만 `.ts`이고 설정·테스트·유틸리티가 `.js`로 작성되어 있으며 `vite.config.js`는 최상위 import 시점에 `server/db.js`의 SQLite 초기화를 부수효과로 실행함.
- **리뉴얼 방안**: `vite.config.ts`, `playwright.config.ts`, `tests/e2e/*.spec.ts` 및 핵심 클라이언트 유틸리티를 `.ts`로 전환하고, `vite.config.ts`에서는 `configureServer`/`configurePreviewServer` 내부 지연 로딩으로 빌드 시 DB 부수효과를 차단.

### [T1-11] `Minor` — 깨진 시드 이미지 경로(`/seed/white-oxford.jpg` 404) 및 블랙리스트 폐기 에셋(`store-terracotta-cardigan.jpg`) 잔존
- **파일 및 라인**: `src/components/WardrobeView.jsx:129, 299`, `public/seed/store-terracotta-cardigan.jpg`, `src/components/AdminPanelView.jsx:125, 232`
- **문제 원인**: 존재하지 않는 `/seed/white-oxford.jpg` 기본값과 DB 마이그레이션에서 사용 금지된 `815KB` 이미지가 `public/seed/`에 남아 있으며, 관리자 화면이 실제 드라이버(`sql.js` 폴백 가능)와 무관하게 `"node:sqlite"`로 고정 표기함.
- **리뉴얼 방안**: 기본 시드를 `/seed/white-shirt.jpg`(공통 시드 헬퍼)로 수정, `public/seed/store-terracotta-cardigan.jpg` 삭제, 서버가 반환하는 실제 SQLite 엔진명을 관리자 뷰에 표기.

### [T1-12] `Minor` — 미사용 호환성 별칭(Alias) export 및 비스프링 전환 곡선 잔존
- **파일 및 라인**: `src/utils/bodyAnthropometrics.js:424-425`, `src/utils/nativeBridge.js:158-159`, `src/utils/offlineSync.js:419`, `src/index.css:306, 2948`
- **문제 원인**: 리팩토링 과도기에 남긴 미사용 별칭과 `ease`/`0.2s` 일반 트랜지션이 일부 남아 있음.
- **리뉴얼 방안**: 호출부를 정규 심볼로 통일하고 모든 인터랙션 트랜지션을 `var(--spring-ease)`(`cubic-bezier(0.32, 0.72, 0, 1)`)로 정렬.

---

## 2. 트랙 2 감사 결과 — 타입 안전성, 데이터 무결성 및 오프라인 동기화

### [T2-01] `Critical` — `tsconfig.json` `checkJs: false` 및 `server/`·`tests/` 제외로 인한 99% 정적 타입 검증 사각지대
- **파일 및 라인**: `tsconfig.json:8-23`, `package.json:10-12`
- **문제 원인**: `strict: true`임에도 `checkJs: false`로 설정되어 `.js`/`.jsx` 전체와 `server/`, `tests/`가 `tsc --noEmit` 검사 대상에서 완전히 빠져 있음.
- **리뉴얼 방안**: `@types/node`, `@types/express`, `@types/three`를 보강하고 `tsconfig.json`에서 `checkJs: true`, `strict: true` 및 `src`, `server`, `tests`, `vite.config.ts`, `playwright.config.ts` 전체 포함으로 `tsc --noEmit` 에러 `0`건을 달성.

### [T2-02] `Critical` — `standaloneFallback.js`(오프라인·단독 APK 폴백)와 실제 Express API 간 경로·응답 스키마 불일치
- **파일 및 라인**: `src/utils/standaloneFallback.js:59-235, 300-365, 486, 514, 604-629`
- **문제 원인**:
  1. 프로필 저장 시 클라이언트는 `POST /auth/profile-setup`을 호출하나 폴백은 `/auth/profile`만 처리하여 `user: undefined` 반환 → 옷장 이름 설정 모달에 갇힘.
  2. 샘플 카탈로그는 `GET /sample-catalog`(`{ samples: [{ key }] }`)를 호출하나 폴백은 `/garments/samples`만 처리하고 `key` 필드가 없음.
  3. 캘린더는 `{ entries }`를 반환하나 UI는 `{ logs }`를 참조하며, 분석 API는 `colorBreakdown`/`categoryBreakdown`을 반환하나 UI는 `colorDist`/`sortedCategories`를 참조함.
  4. 날씨는 `temp`/`windKmh`/`mild_spring`을 반환하여 UI(`avgTemp`, `windSpeed`, `warm_spring`)에서 항상 `14°C` 고정 및 3D 강풍 물리 미작동 발생.
  5. 샘플 의류의 `base_glb`/`physics_preset`에 존재하지 않는 키(`neck_scarf`, `acc_crossbody`, `hem_sway`, `pendulum_strap`)가 기재됨.
- **리뉴얼 방안**: `standaloneFallback.ts`의 모든 엔드포인트 경로·응답 DTO·기상 필드·3D 프리셋 키를 `server/api.js` 및 `carbonDesignContract.ts`와 1:1 일치시킴.

### [T2-03] `Critical` — IndexedDB(`ainventory_offline_v1`) 사용자·옷장 격리 부재 및 로그아웃 후 타 계정 오프라인 큐 오발송
- **파일 및 라인**: `src/utils/offlineSync.js:57-108, 143-182, 236-355`, `src/utils/api.js:95-97, 133, 144-146`, `src/App.jsx:185-198`
- **문제 원인**: `kv_cache` 키에 사용자 식별자가 없고 `listCacheEntriesByPrefix('/garments')`가 `demo:/garments`와 실계정 `/garments` 및 타 옷장 캐시를 동시 변조함. 또한 `handleLogout` 시 IndexedDB를 비우지 않아 이전 사용자의 `mutation_queue` 항목이 다음 로그인 사용자의 `Bearer` 토큰으로 서버에 전송됨.
- **리뉴얼 방안**: 캐시 키와 `mutation_queue` 엔트리에 활성 사용자 스코프(`userScope`)를 기록하여 데모·계정 간 오염을 원천 차단하고, 로그아웃 및 회원 탈퇴 시 모두 로컬 사용자 캐시/큐를 안전하게 정리.

### [T2-04] `Critical` — 오프라인 큐 4xx 영구 독성(Head-of-Line Blocking), 음수 `tempId` 참조 불일치, 재연결 시 캐시 덮어쓰기 경합 및 루프백 동기화 교착
- **파일 및 라인**: `src/utils/offlineSync.js:143-182, 204-376`, `src/utils/api.js:101-110, 142-146`
- **문제 원인**:
  1. `flushOfflineQueue`가 단일 4xx 오류에도 `catch { break; }`로 전체 큐를 영구 중단시킴.
  2. 오프라인 생성 시 부여한 음수 `tempId`를 후속 `PATCH /packing-lists/:id`나 `POST /outfits`(`item_ids`) 재생 시 서버 발급 실제 ID로 치환하지 않음.
  3. 온라인 복귀 직후 `GET` 요청이 `flushOfflineQueue` 완료 전에 `writeCachedResponse`를 먼저 호출하여 낙관적 항목을 덮어씀.
  4. `flushOfflineQueue`가 `isEffectivelyOffline()` 대신 `!navigator.onLine`만 검사하여 격리 VM/루프백 환경에서 동기화가 스킵될 수 있음.
- **리뉴얼 방안**: 큐 순차 재생 시 `tempId -> serverId` 매핑 테이블을 적용하고, 복구 불가능한 4xx(400/404/422 등)는 데드레터 격리 후 후속 큐를 계속 처리하며, 대기 중인 큐가 있을 때 `flushOfflineQueue`를 선행한 뒤 최신 GET 캐시를 갱신하고 루프백 온라인 판정을 통일.

### [T2-05] `Critical` — 퍼스널컬러 동의 우회 및 카메라 비동기 언마운트 트랙 누수
- **파일 및 라인**: `src/components/ProfilePersonalColorModal.jsx:188-224, 411-419, 509, 1333, 1352`, `src/components/ShoppingCheckView.jsx:91-101, 212-233, 416, 467, 476`
- **문제 원인**: `ProfilePersonalColorModal` 오픈 즉시(동의 전) 샘플 얼굴 이미지로 MediaPipe 분석이 자동 실행되며, 하단 카메라 바의 업로드·셔터·전환 버튼 3개가 `requestBiometricCapture` 동의 확인을 우회함. `ShoppingCheckView`도 사전 권한 안내 모달을 건너뛰며, 두 화면 모두 `await getUserMedia()` 대기 중 모달 닫기/언마운트 시 늦게 열린 `MediaStreamTrack`이 정지되지 않고 카메라가 켜진 채 누수됨.
- **리뉴얼 방안**: 동의 전 자동 WASM 추론을 제거하고 모든 촬영/업로드 트리거를 동의 게이트로 통합하며, 요청 토큰(`streamReqIdRef`) 및 마운트 플래그 검증으로 언마운트 후 도착한 `MediaStream` 트랙을 즉시 `.stop()` 처리.

### [T2-06] `Major` — DB 컬럼 `JSON.parse` 배열 검증 누락 및 `Error` 확장 타입 미정의
- **파일 및 라인**: `server/api.js:264, 1716, 1779, 1841, 1903, 1932, 1997`, `server/engine.js:486-487`, `src/utils/standaloneFallback.js:288-293`, `src/utils/offlineSync.js:190-198`, `src/utils/api.js:64-78`
- **문제 원인**: `JSON.parse('null')` 또는 객체 문자열 파싱 시 `Array.isArray` 확인 없이 `.map`/`.forEach`를 호출해 런타임 500 예외 가능성이 있으며, 표준 `Error` 객체에 `.status`/`.isBackendUnavailable`을 임의 주입함.
- **리뉴얼 방안**: `safeParseJsonArray` / `safeParseJsonObject` 유틸리티와 명시적 `ApiError` 클래스를 도입.

### [T2-07] `Major` — 패킹 리스트 체크박스 해제 불가(Lock) 버그 및 서버-오프라인 아이템 스키마 불일치
- **파일 및 라인**: `src/components/AnalyticsCalendarView.jsx:176-178, 814, 849`, `server/engine.js:898-906`, `src/utils/offlineSync.js:321-330`
- **문제 원인**: 서버 아이템(`{ name, checked: true, packed: undefined }`) 토글 시 `packed: !it.packed`가 `true`가 되어 `Boolean(it.packed || it.checked)`가 영구히 `true`로 고정됨. 또한 오프라인 생성 아이템은 `name` 대신 `label` 필드를 사용함.
- **리뉴얼 방안**: 아이템 스키마를 `{ key, garment_id, name, category, image_url, qty, checked }`로 통일하고 토글 상태를 단일 `checked: !(it.checked ?? it.packed ?? false)`로 정규화(`packed` 레거시 제거).

### [T2-08] `Major` — `POST /calendar` 자유 기록 시 임의 의류 3벌 착용 횟수 오염 및 `PATCH /calendar/:id` 코디 착용 횟수 누락
- **파일 및 라인**: `server/api.js:1847-1888, 1900-1912`
- **문제 원인**: 아이템 미선택 자유 메모 기록 시 서버가 임의로 `LIMIT 3` 의류를 조회해 `wear_count`를 증가시켜 CPW 통계를 왜곡하며, 예정(`planned`) 기록을 착용 완료(`worn`)로 변경할 때 `outfits.wear_count` 증가가 누락됨.
- **리뉴얼 방안**: 빈 `item_ids: []` 자유 기록을 그대로 허용하고, `planned -> worn` 전환 시 `outfits.wear_count` 갱신 및 `last_worn_date` 최신값 보존 적용.

### [T2-09] `Major` — 오프라인/샘플 모드 낙관적 변이 미구현 라우트(`PATCH`/`DELETE`/`wear`), `/shopping/analyze` 401 오류 및 `.ics` 인증 헤더 누락
- **파일 및 라인**: `src/utils/offlineSync.js:188-379`, `src/utils/api.js:121-178`, `src/components/AnalyticsCalendarView.jsx:667`
- **문제 원인**: 오프라인 또는 샘플 체험 모드에서 의류 수정(`PATCH /garments/:id`) 시 `{ ok: true }`만 반환되어 상세 시트가 강제 닫히고, `/shopping/analyze`는 샘플 모드에서 무인증 서버 요청을 보내 401이 발생하며, `<a href="/api/calendar/ics">`는 `Bearer` 토큰 헤더를 전달하지 못함.
- **리뉴얼 방안**: `offlineSync.ts`에 의류·코디·캘린더·패킹 `PATCH`/`DELETE`/`wear` 낙관적 갱신을 완비하고, 샘플/오프라인 모드 `/shopping/analyze` 로컬 분석 지원 및 `.ics`의 `apiFetch` Blob 다운로드를 구현.

### [T2-10] `Major` — 다중 SQL 변이 트랜잭션 부재, `sql.js` 외래키 미활성화 및 매 쿼리 동기식 전체 파일 덮어쓰기 병목
- **파일 및 라인**: `server/db.js:34-77, 87-92`, `server/api.js:1124-1142, 1248-1250, 1299-1334, 1528, 1606-1645, 1856-1889`
- **문제 원인**: `sql.js` 폴백에서 `PRAGMA foreign_keys = ON`이 누락되어 있고 매 `.run()`마다 전체 DB를 `fs.writeFileSync`로 직접 덮어쓰며(크래시 시 파일 손상 위험), 다중 테이블 변경이 트랜잭션 없이 실행됨. 또한 `verifyPassword`에서 해시 길이 불일치 시 `timingSafeEqual` `RangeError` 발생 가능, `/shopping/analyze`(`save_history: false`) 시 임시 업로드 파일이 디스크에 영구 잔류함.
- **리뉴얼 방안**: `db.transaction(fn)` 헬퍼 및 `sql.js` 트랜잭션 종료 시 원자적 `.tmp` + `fs.renameSync` 저장 적용, `wasmDb.exec('PRAGMA foreign_keys = ON;')` 활성화, `verifyPassword` 버퍼 길이 선검증, `save_history !== false`일 때만 업로드 파일 영구 저장.

### [T2-11] `Major` — 비동기 핸들러 Unhandled Rejection 및 일시적 네트워크 오류 시 세션 토큰 즉시 삭제 버그
- **파일 및 라인**: `src/components/ProfilePersonalColorModal.jsx:416, 505, 549, 564-608`, `src/components/common/AppUI.jsx:483-500`, `src/components/AccountSettingsSheet.jsx:52-62`, `src/App.jsx:121-123`
- **문제 원인**: `try ... finally`만 있고 `catch`가 없는 저장/동기화/가져오기 핸들러에서 에러 발생 시 미처리 거부(Unhandled Rejection)가 발생하며, `App.jsx` 부팅 시 일시적 5xx/오프라인 에러에도 `setStoredToken('')`을 호출해 로그인 세션을 증발시킴.
- **리뉴얼 방안**: 모든 비동기 액션에 명시적 `catch` 토스트 안내를 추가하고, `checkSession`에서는 HTTP `401`/`403`일 때만 저장 토큰을 파기하도록 수정.

### [T2-12] `Minor` — 캔버스 `getContext('2d')`·`matchedColor` 널 가드 미비 및 입력 폼 숫자/문자열 상태 혼용
- **파일 및 라인**: `src/components/ShoppingCheckView.jsx:205, 242, 254-256, 604`, `src/components/WardrobeView.jsx:119, 126, 959`, `src/components/ProfilePersonalColorModal.jsx:57, 484, 1732`
- **문제 원인**: `getContext('2d')` 반환값 및 선택적 객체 프로퍼티 널 가드가 빠져 있고 숫자 상태가 `onChange` 후 문자열로 변이됨.
- **리뉴얼 방안**: 엄격한 널 가드 및 숫자 파싱 경계 정규화 적용.

---

## 3. 트랙 3 감사 결과 — 3D WebGL, MediaPipe 비전 및 모바일 성능

### [T3-01] `Critical` — 프로필 모달 진입 시 최대 10개 동시 WebGL 컨텍스트 + 60Hz 루프 가동으로 인한 모바일 GPU 컨텍스트 고갈(Thrashing)
- **파일 및 라인**: `src/components/VirtualMannequin.jsx:51-99` (`Mannequin3DBodyPreview`), `src/components/ProfilePersonalColorModal.jsx:668, 929-1002`, `src/utils/mannequin3DRenderer.js:2016-2040, 3310-3536`
- **문제 원인**: `ProfilePersonalColorModal` Step 1 진입 시 상단 프리뷰 1개 + 7개 체형 선택 카드 각각이 독립된 `Mannequin3DWebGLEngine`(`WebGLRenderer` + 60Hz RAF)을 생성하여 배경 스튜디오(1개) 및 소프트웨어 렌더러 탐지 프로브(1개)까지 총 **10개 WebGL 컨텍스트**가 동시 점유됨. iOS/Android 브라우저 한도(8~16개) 도달 시 메인 `#studio-3d-canvas`가 강제 축출(`webglcontextlost`)되고 자동 복구 타이머와 연쇄 충돌함.
- **리뉴얼 방안**: 단일 오프스크린 공유 렌더러 기반 `render3DMannequinScene`을 정규화(모프 타깃 속성 제거 및 `disposeSharedPreviewEngine` 보강)하여 `Mannequin3DBodyPreview`가 추가 WebGL 컨텍스트 없이 경량 2D `<canvas>` 스냅샷으로 렌더링되도록 전환하고, `displayWidth`/`displayHeight`/`style` 프롭을 정상 반영.

### [T3-02] `Critical` — `FaceLandmarker` WASM 인스턴스 미해제(`.close()` 누락)로 인한 영구 메모리 점유
- **파일 및 라인**: `src/utils/faceLandmarkEngine.js:36-59`, `src/utils/imageTools.js:596-609`, `src/components/ProfilePersonalColorModal.jsx:358-419`, `src/components/PortraitCropAndPinEditorModal.jsx:60-85`
- **문제 원인**: `faceLandmarkEngine.js`의 싱글톤 `faceLandmarkerPromise`에 해제 함수가 없어 한 번 로드된 ~50~80MB WASM 선형 메모리와 내부 TFLite 델리게이트가 앱 종료 전까지 반환되지 않으며, `customPins`가 이미 전달된 경우에도 `analyzePersonalColorFromImage`가 중복 추론을 실행함.
- **리뉴얼 방안**: `disposeFaceLandmarker()`(`instance.close()` 호출 및 프로미스 초기화, 초기화 실패 시 캐시 리셋 포함)를 export하여 모달 종료/언마운트 시 즉시 해제하고, `customPins` 존재 시 중복 랜드마크 추론을 건너뜀.

### [T3-03] `Critical` — 코드 스플리팅 전무: 초기 진입 번들에 `three`, `GLTFLoader`, `MeshoptDecoder`, `@mediapipe/tasks-vision` 및 전 화면 정적 포함
- **파일 및 라인**: `src/App.jsx:14-27`, `src/components/VirtualMannequin.jsx:15`, `src/utils/faceLandmarkEngine.js:1`, `vite.config.js:21-29`
- **문제 원인**: 비로그인 첫 화면(`<LoginView>`) 진입 시에도 3D 엔진, 비전 WASM 로더, 관리자/통계 뷰 등 전체 모듈을 정적으로 다운로드·파싱함.
- **리뉴얼 방안**: `App.jsx`의 주요 뷰/모달을 `React.lazy` + `<Suspense>`로 분리하고, `VirtualMannequin.jsx`에서 `mannequin3DRenderer.js` 동적 로딩, `faceLandmarkEngine.js` 내부에서 `@mediapipe/tasks-vision` 동적 `import()`, `vite.config.ts`의 `manualChunks`(`vendor-react`, `vendor-three`, `vendor-mediapipe`) 분리를 적용.

### [T3-04] `Major` — WebGL `.dispose()` 시 `forceContextLoss()`·`Skeleton.dispose()`·`PMREM WebGLRenderTarget`·프로브 컨텍스트 해제 누락
- **파일 및 라인**: `src/utils/mannequin3DRenderer.js:2016-2040, 2274-2288, 3268-3305`
- **문제 원인**:
  1. `detectSoftwareWebGL()`이 생성한 1×1 WebGL 프로브 컨텍스트를 `loseContext()` 하지 않아 슬롯 1개 영구 누수.
  2. `_rebuildEnvironmentMap()`에서 `pmrem.fromScene()`이 반환한 `WebGLRenderTarget`을 저장하지 않고 `.texture`만 보관하여 컨텍스트 복구/해제마다 GPU 프레임버퍼 누수.
  3. `dispose()`에서 `this.skeleton.dispose()`(본 행렬 `DataTexture`)와 `this.renderer.forceContextLoss()`가 호출되지 않음.
- **리뉴얼 방안**: `detectSoftwareWebGL()` 즉시 `loseContext()` 수행, `this._envRenderTarget` 보관 및 해제, `dispose()`에서 리스너 해제 후 `this.skeleton?.dispose?.()` 및 `this.renderer.forceContextLoss()` 호출.

### [T3-05] `Major` — 매 `updateScene()` 호출마다 전 의류 `MeshPhysicalMaterial` 재생성 및 커스텀 컷아웃 `CanvasTexture` 중복 디코딩·업로드
- **파일 및 라인**: `src/utils/mannequin3DRenderer.js:1623-1694, 2554-2556, 2700-2715`
- **문제 원인**: 슬롯 포커스 변경이나 체형 슬라이더 조작 시에도 모든 착용 의류의 재질을 매번 폐기·재생성하고, 커스텀 업로드 의류의 Base64/WebP 이미지를 매번 `new Image()`로 재디코딩해 새 `CanvasTexture`를 업로드하며 `ownedTextures` 덮어쓰기 누수가 발생함.
- **리뉴얼 방안**: 커스텀 컷아웃 텍스처를 `externalTexCache`(참조 카운팅 기반)에 캐싱하고, 동일 의류/소재 구성일 때는 기존 머티리얼의 색상·발광 유니폼만 인플레이스 갱신하며 소프트웨어 렌더러 시 불필요한 피부 범프맵 생성을 생략.

### [T3-06] `Major` — 탭 비가시(`document.hidden`) 및 전체화면 모달 차폐 시에도 백그라운드 60Hz 3D 루프 지속 실행
- **파일 및 라인**: `src/utils/mannequin3DRenderer.js:3136-3266`, `src/components/VirtualMannequin.jsx:224-259`
- **문제 원인**: 브라우저 백그라운드 전환이나 전체화면 프로필/설정 모달 오픈 중에도 스튜디오 3D 루프가 중단 없이 계속 실행됨.
- **리뉴얼 방안**: `visibilitychange` 리스너 및 `paused` 프롭 지원을 추가하여 비가시/차폐 시 RAF 루프를 일시 정지하고 복귀 시 타임스탬프를 안전하게 재동기화.

### [T3-07] `Major` — 오프스크린 `<canvas>` 버퍼 미반환, `StudioGarmentImage` 160개 Base64 문자열 힙 점유 및 메인스레드 색보정 병목
- **파일 및 라인**: `src/utils/aiGarmentPipeline.js:76-241`, `src/utils/imageTools.js:258-289, 405-465`, `src/components/StudioGarmentImage.jsx:184, 231-374`
- **문제 원인**: 임시 캔버스 사용 후 `width = 0; height = 0` 초기화가 없고, `rgbToLab`이 픽셀마다 `Math.pow`를 3회 호출하며, `StudioGarmentImage`가 최대 160개 고해상도 Base64 문자열을 JS 힙에 보관함.
- **리뉴얼 방안**: `sRGB -> Linear` 256-엔트리 `Float32Array` 룩업 테이블(LUT)로 픽셀 루프를 ~6배 가속하고, 임시 캔버스 버퍼를 즉시 반환(`releaseCanvas`)하며, `StudioGarmentImage`는 `React.memo` + `Blob` `ObjectURL` LRU 캐시(`URL.revokeObjectURL` 연동) + `loading="lazy" decoding="async"`를 적용.

### [T3-08] `Major` — 불안정한 객체 프롭(`loadoutBySlot`) 재생성, 크롭 박스 `9999px` 그림자 래스터 병목 및 `data-3d-active` 동기화 누락
- **파일 및 라인**: `src/components/OutfitStudioView.jsx:97-158`, `src/App.jsx:67-70`, `src/index.css:2902, 3268-3305, 3558`
- **문제 원인**: `OutfitStudioView`에서 텍스트 입력만 해도 `loadoutBySlot` 참조가 매번 바뀌어 3D 씬 업데이트가 재실행되고, `.crop-selection-box`의 `box-shadow: 0 0 0 9999px`가 모바일 타일 GPU에서 거대 래스터 레이어를 유발하며, 비-3D 탭에서 프로필 3D 모달 오픈 시 `data-3d-active="true"`가 설정되지 않음.
- **리뉴얼 방안**: `OutfitStudioView`의 `pools`·`loadoutBySlot`을 `useMemo`로 고정하고, 크롭 마스크를 `outline: 200vmax solid`로 교체하며, `showProfileModal` 오픈 시에도 `data-3d-active="true"`를 동기화하고 프리뷰 엔진이 글로벌 `data-vibrancy-fallback` 속성을 덮어쓰지 못하도록 격리.

### [T3-09] `Major` — `manifest.json` 9종 의류 물리 프리셋 불일치(`rigid_fitted` vs `drape_wind_garment`) 및 셔츠/블라우스/가디건 아우터 오분류 정규식
- **파일 및 라인**: `public/models/mannequin/manifest.json:334, 376, 396, 417, 437, 458, 478, 498, 560`, `tools/blender/garment_catalog.py:46-119`, `src/utils/garment3DPhysicsSpecs.js:213-215`, `src/utils/mannequin3DRenderer.js:549-598`
- **문제 원인**: `garment_catalog.py`와 `manifest.json`에서 9종 의류의 `"physics"`가 `"rigid_fitted"`로 잘못 기록되어 있고, `infer3DRegistrationSpec`의 정규식이 `"셔츠"`, `"블라우스"`, `"가디건"`을 `outer / blazer`로 오분류함.
- **리뉴얼 방안**: `garment_catalog.py` 및 `manifest.json`의 9종 의류 물리를 `"drape_wind_garment"`로 정정하고 `mannequin3DRenderer.js`에 범용 `drape_wind_garment` 스키닝 분기를 추가하며, `infer3DRegistrationSpec` 키워드 분기를 정확히 분리.

### [T3-10] `Minor` — 포인터 캡처 해제(`onLostPointerCapture`) 누락, 카메라 `fov` 미보간 및 Blender 스크립트(`export_morph_normal`, `COLOR_0`) 개선점
- **파일 및 라인**: `src/components/VirtualMannequin.jsx:273-325`, `src/utils/mannequin3DRenderer.js:13-26, 3190-3230`, `tools/blender/build_mannequin.py:547`, `tools/blender/preview_render.py:39-45`
- **문제 원인**: 시스템 제스처 개입 시 드래그 상태 고착 가능성, 슬롯별 `fov` 값 미적용, Blender 빌드 스크립트의 미사용 모프 노멀 옵션 및 프리뷰 렌더러 멀티존 미반영.
- **리뉴얼 방안**: `onLostPointerCapture` 바인딩, 카메라 `fov` 부드러운 보간 추가, `build_mannequin.py`(`export_morph_normal=False`) 및 `preview_render.py`(`COLOR_0` 셰이더 노드) 정합화.

---

## 4. 트랙 4 감사 결과 — 보안, 앱스토어 컴플라이언스, CI 및 E2E 테스트 정합성

### [T4-01] `Critical` — `/api/auth/apple` 무서명 JWT 디코딩 및 이메일 자동 연동으로 인한 무인증 계정 탈취(ATO · 관리자 권한 탈취)
- **파일 및 라인**: `server/api.js:1005-1080`, `src/components/LoginView.jsx:65-85`, `src/utils/standaloneFallback.js:389-406`
- **문제 원인**: `POST /api/auth/apple`이 Apple JWKS 서명 검증 없이 `id_token` 페이로드를 단순 Base64 `JSON.parse`하거나 요청 바디의 평문 `email`만으로 `WHERE apple_sub = ? OR lower(email) = ?`를 조회하여 즉시 세션을 발급함(`{"email":"admin@ainventory.kr"}` 전송 시 관리자 계정 즉시 탈취). 또한 `LoginView.jsx`는 하드코딩된 공유 가짜 Apple 계정을 호출함(App Store Guideline 4.8 위반).
- **리뉴얼 방안**: 서명 검증 없는 바디 `email`/`apple_sub` 우회 및 기존 이메일 계정 무검증 자동 연동을 전면 차단하고(`APPLE_CLIENT_ID` 미설정 운영 환경에서는 엔드포인트 거부 및 UI에서 가짜 Apple 로그인 비활성/안내 처리), 관리자 계정 자동 링크를 영구 금지.

### [T4-02] `Critical` — 운영 환경에서의 OTP 인증번호·토큰·파일경로 JSON 평문 노출 및 기본 관리자(`admin`/`admin`) 무조건 시딩
- **파일 및 라인**: `server/api.js:557-564, 758-783, 832-865, 986-995`, `server/db.js:475-520`, `src/components/LoginView.jsx:104-107, 398-402, 444-466, 554-558`
- **문제 원인**: 모든 이메일 인증 API가 `NODE_ENV` 구분 없이 `devPreviewCode`, `verificationToken`, `outboxPath`를 HTTP 응답에 반환하며, `server/db.js`가 운영 환경에서도 `admin`/`admin` 계정을 생성함. 또한 `LoginView.jsx`의 빠른 데모 채우기(`husband`/`husband1234`)는 실제 DB 시드(`admin`/`admin`)와 불일치하여 401이 발생함.
- **리뉴얼 방안**: `NODE_ENV === 'production'`(단, `ALLOW_DEV_OTP_PREVIEW === 'true'` 제외)에서는 응답 내 프리뷰 OTP·토큰·서버 파일 경로 노출과 데모 계정 자동 표시를 엄격히 차단하고, 비운영/테스트 환경에서는 E2E 자동 검증 호환성을 유지하며 데모 시드 자격증명을 정합화.

### [T4-03] `Critical` — 전 도메인 API 수평적 권한 우회(IDOR) 및 `X-Demo-Mode: sample` 무인증 타 회원 옷장 조회
- **파일 및 라인**: `server/api.js:407-418, 1363-2105`
- **문제 원인**: `requireAuth`가 `X-Demo-Mode: sample` 헤더만 있으면 모든 `GET` 요청을 통과시키는데 하위 핸들러들이 `?closet=closet_<타회원>` 또는 `?closet=all`을 검증 없이 조회하며, `POST`/`PATCH`/`DELETE` 엔드포인트들도 리소스의 `closet_owner` 소유권을 확인하지 않고 `:id`만으로 수정·삭제함.
- **리뉴얼 방안**: 중앙 권한 가드 `resolveAuthorizedCloset(req, requestedCloset)`을 도입하여 샘플 게스트는 오직 `'sample'`만 읽기 허용하고, 일반 회원은 본인 소유 옷장만 접근 가능하도록 모든 `SELECT`/`INSERT`/`UPDATE`/`DELETE`에 소유권 조건(`AND closet_owner = ?`)을 강제.

### [T4-04] `Critical` — 타 회원 업로드 이미지 삭제 취약점 및 `/api/admin/reset-demo` 실행 시 전체 실회원 데이터 일괄 삭제
- **파일 및 라인**: `server/api.js:233-258, 1398, 1503-1511, 2176-2179`, `server/db.js:363-371, 686-725`
- **문제 원인**: `saveDataUrlImage`가 `/uploads/...` 경로 문자열을 검증 없이 그대로 신뢰하여 타인의 업로드 경로를 등록 후 삭제하면 원본 파일이 `unlink`되며, `seedIfEmpty(true)`가 `WHERE` 절 없이 전 테이블을 `DELETE`하여 실회원 데이터를 전소시키고 재시딩 시 하드코딩된 의류 ID(`1..16`)가 어긋남.
- **리뉴얼 방안**: 업로드 파일명에 소유 옷장 접두사를 부여하고 참조 카운트/소유권 확인 후 삭제하며, `seedIfEmpty(true)`는 `closet_owner IN ('husband', 'wife', 'sample')`만 초기화하고 동적 `lastInsertRowid`로 코디·착용기록을 연결.

### [T4-05] `Critical` — 회원 탈퇴(`DELETE /api/auth/account`) 시 서버·로컬 잔존 데이터 파기 누락 (App Store 5.1.1(v) · Google Play 데이터 삭제 요건)
- **파일 및 라인**: `server/api.js:540-548, 1099-1150, 1247-1248`, `src/utils/offlineSync.js:384-418`, `src/App.jsx:618-623`
- **문제 원인**: 프로필 재설정(`regenerateWardrobe`) 시 삭제된 의류의 업로드 파일이 고아 파일로 남고, 탈퇴 시 이메일 로컬파트 기반 Outbox HTML·`emailOtpPending` 메모리 맵이 지워지지 않으며 다중 테이블 삭제가 비트랜잭션으로 실행됨. 클라이언트 `purgeAllLocalUserData()`도 `deleteDatabase`가 `onblocked`될 때 오브젝트 스토어를 비우지 않고 종료됨.
- **리뉴얼 방안**: 서버 탈퇴 로직을 단일 트랜잭션으로 묶고 소유 업로드 이미지·Outbox HTML·메모리 OTP 버킷까지 완전 소거하며, 클라이언트는 진행 중 요청 차단 후 `kv_cache`/`mutation_queue`를 명시적으로 `clear()`한 뒤 DB 삭제 및 스토리지 전수 초기화를 수행.

### [T4-06] `Critical` — Android `READ_MEDIA_IMAGES` 권한 선언으로 인한 Google Play 스토어 자동 리젝 위험 및 개인정보처리방침/이용약관 고지 누락
- **파일 및 라인**: `android/app/src/main/AndroidManifest.xml:44`, `src/components/LoginView.jsx`, `src/components/AccountSettingsSheet.jsx`
- **문제 원인**: 단발성 의류/셀피 사진 선택 앱임에도 `READ_MEDIA_IMAGES` 광역 미디어 읽기 권한을 선언하여 Google Play 사진 및 동영상 권한 정책을 위반하며, 로그인/계정 설정 화면에 개인정보처리방침 및 이용약관 열람 수단이 없음.
- **리뉴얼 방안**: `AndroidManifest.xml`에서 `READ_MEDIA_IMAGES`를 제거(시스템 포토 피커 사용)하고, `LoginView` 및 `AccountSettingsSheet`에 개인정보처리방침·이용약관 열람 시트를 제공.

### [T4-07] `Critical` — GitHub Actions CI 내 `${{ vars.* }}` 셸 인젝션 노출 및 Playwright E2E 검증 단계 누락
- **파일 및 라인**: `.github/workflows/ci-verify-ftl.yml:19-21, 37-55, 173-184`, `scripts/setup-gcp-github-ci.sh:366-371, 421-422`
- **문제 원인**: FTL 실행 스텝에서 `${{ vars.* }}`를 `env:` 분리 없이 bash 문자열에 직접 치환하고 `id-token: write`가 상위 전역에 부여되어 있으며, `web-verify` 잡이 설정·테스트 파일 타입체크/린트 및 Playwright E2E를 실행하지 않음. 또한 `setup-gcp-github-ci.sh`의 OIDC 조건에 브랜치 제한(`assertion.ref`)과 기존 버킷 `--public-access-prevention` 보강이 누락됨.
- **리뉴얼 방안**: 워크플로 변수를 모두 `env:` + 정규식 검증으로 격리하고 `id-token: write`를 `firebase-test-lab` 잡으로 국소화하며, `pull_request` 트리거·전역 `oxlint`/`tsc --noEmit`·Playwright E2E 실행 및 스크립트 OIDC 브랜치 조건 강화를 적용.

### [T4-08] `Major` — 로그인/인증 API 레이트리밋·OTP 만료(TTL) 부재, Outbox HTML/ICS 이스케이프 누락 및 보안 헤더 미비
- **파일 및 라인**: `server/api.js:211-231, 466-498, 550-625, 976-1002, 1808-1818, 2133-2142`, `server/start.js:6-16`
- **문제 원인**: `/auth/login`, `/auth/register-email`, `/auth/resend-verification`에 속도 제한이 없고 OTP가 만료되지 않으며, Outbox HTML 및 ICS 출력 시 특수문자 이스케이프가 없고 `server/start.js`에 `nosniff`/`X-Frame-Options` 보안 헤더와 미매칭 `/api/*` 404 JSON 핸들러가 없음.
- **리뉴얼 방안**: 인증 엔드포인트 전반에 레이트리밋 + OTP 10분 만료 및 실패 횟수 제한 + 주기적 메모리 버킷 정리를 적용하고, HTML/ICS 이스케이프, 이미지 매직바이트 검증, 보안 응답 헤더 및 `/api/*` 404 JSON 응답을 추가.

### [T4-09] `Major` — Android 테스트 패키지 네임스페이스 불일치(`com.getcapacitor.myapp`) 및 매니페스트/그레이들 설정 결함
- **파일 및 라인**: `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java:1`, `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java:1, 24`, `android/app/src/main/AndroidManifest.xml:5, 40-45`, `android/app/src/main/res/xml/file_paths.xml:3`, `android/build.gradle:11`, `android/app/build.gradle:20-23`
- **문제 원인**: 앱 ID는 `com.ainventory.app`이나 테스트 코드가 `com.getcapacitor.myapp`(`assertEquals("com.getcapacitor.app", ...)`)으로 되어 있어 실행 시 100% 실패하며, `allowBackup="true"`, 광역 `external-path "."`, 미사용 `google-services` 의존성, 기본 Material 블루/핑크 테마 컬러가 남아 있음.
- **리뉴얼 방안**: 테스트 클래스를 `com.ainventory.app` 경로로 이동·수정하고, `allowBackup="false"`, `android.hardware.location` `required="false"`, 최소 범위 `file_paths.xml`, 모노크롬 `colors.xml`, `proguard-android-optimize.txt`를 적용.

### [T4-10] `Major` — E2E 테스트 셀렉터 드리프트 및 3D 텔레메트리 글로벌 핸들(`__MANNEQUIN_3D_ENGINE__`, `simulateContextLoss`, `resetFpsWindow`) 미정규화
- **파일 및 라인**: `tests/e2e/mobile-flows.spec.js:10, 174, 201, 374, 422, 621-635`, `tests/e2e/studio-webgl-perf.spec.js:63-69, 214-224, 310-317`, `src/utils/mannequin3DRenderer.js:2243-2248`
- **문제 원인**: 테스트가 존재하지 않는 폴백 셀렉터(`[data-sheet-handle="true"]`, `#bento-dormant-card`, `#garment-photo-file-input` 등)에 기대고 있으며, 3D 엔진이 `window.__MANNEQUIN_3D_ENGINE__`, `simulateContextLoss()`, `resetFpsWindow()`를 정식 메서드로 제공하지 않아 테스트가 내부 프라이빗 필드를 직접 조작함.
- **리뉴얼 방안**: `AppUI.jsx` 드래그 존에 `data-sheet-handle="true"`를 부여하고 `Mannequin3DWebGLEngine`에 `window.__MANNEQUIN_3D_ENGINE__`, `window.__MANNEQUIN_3D_TELEMETRY__`, `simulateContextLoss()`, `resetFpsWindow()`를 정식 구현하며, `.spec.ts`로 마이그레이션된 E2E 스위트가 기존 모든 정량 단언(>=50 FPS, 지오메트리/텍스처 누수 제로, 컨텍스트 복구, 블러 <=1, 터치 간섭 0도)을 100% 유지한 채 탈퇴 후 로컬/업로드 완전 파기까지 검증하도록 강화.

---

## 5. 파일 충돌 제로(Zero-Conflict) 3개 병렬 리뉴얼 워커 트랙 분할 계획

### 선행 단계 — 카본(Carbon) 공통 기반 동결 커밋 (`main`)
워커 분기 전 카본이 먼저 롤백 스냅샷 태그(`pre-renewal-snapshot`)를 생성한 뒤, 3개 트랙이 공통 참조할 **계약·타입·공통 상수·TS/패키지 설정**만 선행 커밋합니다.
- **카본 선행 커밋 담당 파일**:
  - `src/contracts/carbonDesignContract.ts` (HIG 디자인 토큰, 정규 DOM ID 계약, 3D 텔레메트리·엔진 핸들 및 공통 API/도메인 TS 인터페이스 동결)
  - `src/types/global.d.ts` (`Window`, `HTMLCanvasElement`, `ImportMetaEnv` 전역 타입 선언)
  - `src/shared/colorMath.js` + `src/shared/colorMath.d.ts` (클라이언트·서버 공용 sRGB/Hex/CIELAB/$\Delta E$ LUT 가속 색상 수학 및 팔레트)
  - `src/shared/garmentTaxonomy.js` + `src/shared/garmentTaxonomy.d.ts` (11슬롯, 카테고리/서브카테고리, 60종 스튜디오 시드 맵, 12톤 퍼스널컬러 카탈로그, 3D 슬롯·GLB·물리 매핑)
  - `tsconfig.json`, `package.json`, `package-lock.json` (`@types/node`, `@types/express`, `@types/three` 반영 및 엄격 타입체크/린트 스크립트 기반 확보)

---

### 병렬 워커 트랙 분할 (독립 Git Worktree 3개 · 수정 파일 교집합 `0`개)

| 구분 | 브랜치 / 워크트리 | 전담 디렉토리 및 파일 경계 (타 트랙 수정 절대 금지) | 핵심 리뉴얼 과업 |
| :--- | :--- | :--- | :--- |
| **Track A**<br>*(Core, Data, Offline Sync & Security)* | `swarm/track-a` | • `server/**` (`api.js`, `db.js`, `engine.js`, `wardrobeStatsAndGenerator.js`, `start.js`)<br>• `src/utils/{api,offlineSync,standaloneFallback,bodyAnthropometrics,i18n,nativeBridge}.*`<br>• `public/seed/store-terracotta-cardigan.jpg` (삭제)<br>• `capacitor.config.ts`, `android/**`<br>• `.github/workflows/ci-verify-ftl.yml`, `scripts/setup-gcp-github-ci.sh` | 1. `/auth/apple` ATO 차단, 운영 OTP 노출 차단, 전 라우트 IDOR 소유권 가드, 업로드 매직바이트·소유권 검증, 레이트리밋/OTP TTL, 보안 헤더 적용<br>2. `db.transaction` 및 `sql.js` 외래키·원자적 `.tmp` 저장, 안전한 데모 리셋 및 탈퇴 시 서버/업로드/Outbox 완전 파기<br>3. `api.ts`·`offlineSync.ts`·`standaloneFallback.ts`·`i18n.ts`·`nativeBridge.ts` TS 전환, 사용자별 IndexedDB 스코프 격리, `tempId -> serverId` 매핑, 4xx 데드레터 격리, 전체 낙관적 변이 및 스키마 통일<br>4. Android `READ_MEDIA_IMAGES` 제거, 테스트 패키지(`com.ainventory.app`) 수정, CI 셸 인젝션 제거 및 E2E 파이프라인 통합 |
| **Track B**<br>*(3D Engine, Vision & Performance)* | `swarm/track-b` | • `src/utils/{mannequin3DRenderer,springBonePhysics,garment3DPhysicsSpecs,faceLandmarkEngine,faceLandmarkerLocal,imageTools,aiGarmentPipeline}.*`<br>• `src/components/{VirtualMannequin,Mannequin2DCollageFallback,StudioGarmentImage,SmartPhotoCropEditorModal,PortraitCropAndPinEditorModal}.jsx`<br>• `public/models/mannequin/manifest.json`<br>• `tools/blender/**` | 1. `Mannequin3DBodyPreview` 공유 오프스크린 2D 스냅샷 전환(동시 WebGL 컨텍스트 10개 → 1~2개로 축소), `forceContextLoss`·`Skeleton.dispose`·`PMREM WebGLRenderTarget`·프로브 컨텍스트 누수 완벽 제거<br>2. 커스텀 컷아웃 텍스처 캐싱·머티리얼 인플레이스 갱신, `visibilitychange`/`paused` 루프 제어, `simulateContextLoss`/`resetFpsWindow`/글로벌 텔레메트리 정규화<br>3. `faceLandmarkerLocal.js` 삭제, `faceLandmarkEngine.js` 동적 `import()` 및 `disposeFaceLandmarker()`(`.close()`) 구현, 단일 패스 알파 누끼 및 `StudioGarmentImage` `Blob` `ObjectURL` LRU 캐시화<br>4. `VirtualMannequin`의 `mannequin3DRenderer` 지연 로딩 및 `manifest.json`/`garment3DPhysicsSpecs` 물리·분류 정합화 |
| **Track C**<br>*(HIG UI, A11y & QA TS Alignment)* | `swarm/track-c` | • `src/{App,main}.jsx`, `src/index.css`, `index.html`, `public/{manifest.webmanifest,icon.svg}`<br>• `src/components/common/AppUI.jsx`<br>• `src/components/{AccountSettingsSheet,AdminPanelView,AnalyticsCalendarView,LoginView,OutfitInspectorModal,OutfitStudioView,ProfilePersonalColorModal,ShoppingCheckView,WardrobeView,WeatherStylingView}.jsx`<br>• `vite.config.js` → `vite.config.ts`<br>• `playwright.config.js` → `playwright.config.ts`<br>• `tests/e2e/*.spec.js` → `tests/e2e/*.spec.ts` | 1. `App.jsx` `React.lazy` 코드 스플리팅, 로그아웃/탈퇴 시 로컬 캐시 정리 연동, 일시 오류 시 세션 보존, `data-3d-active`·`paused` 정밀 동기화<br>2. `src/index.css` ~1,150라인 데드 CSS 제거, `.ui-sheet-content` 스크롤 복구, `44×44px` 터치 타깃, 모달 `role="dialog"`/`aria-modal`/`Escape`, `ResponsiveSheetModal` `actions` 프롭 복원<br>3. 생체·카메라·위치 사전 동의 게이트 우회 수정 및 비동기 `getUserMedia` 트랙 누수 차단, 패킹 체크박스 잠금 버그 및 `.ics` 인증 다운로드 수정, 개인정보처리방침/이용약관 시트 제공<br>4. `vite.config.ts`(`manualChunks` + 지연 서버 마운트), `playwright.config.ts`, `tests/e2e/*.spec.ts` TS 전환 및 `CARBON_DOM_CONTRACT` 바인딩 (기존 수치 단언 100% 보존) |
