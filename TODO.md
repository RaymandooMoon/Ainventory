# A inventory — TODO

> Restored from `HANDOFF_SPEC.md` §3 (the original PC1 `TODO.md` was not pushed because of the Zscaler `HTTP 403` block).
> Status as of 2026-11-10 (`main`).

## Requirements (verbatim from the original TODO.md)

1. **체형 설정 및 스리사이즈/머리둘레 기능**
   - 마른 비만형, 상체 발달형, 하체 발달형, 깡마른형 등 BMI와 체질량수치에 따른 각 3D 마네킹의 렌더를 확보하고 사용자가 선택할 수 있도록 구현.
   - 스리사이즈(가슴·허리·엉덩이둘레), 머리둘레 등도 설정할 수 있게 해주고, 설정이 되어 있으면 마네킹에 반영해주고, 설정되어 있지 않다면 디폴트 옵션으로 표현.
2. **고품질 무안면 3D 마네킹 및 실사 질감 의류 착장 렌더링**
   - 얼굴은 제외하고 1번에서 고른 체형 및 개인 신체조건에 따른 마네킹(남/여/젠더리스)을 등장시키고(색깔은 퍼스널컬러), 마네킹이 선택된 옷을 정말 입고 있는 것처럼 옷의 질감과 색이 잘 나타나도록 렌더링.
3. **샘플 옷 실사 퀄리티 개선**
   - 샘플 옷의 퀄리티를 실사에 가깝게 생성 및 교체.

## Implementation checklist (HANDOFF_SPEC §3 a ~ h)

- [x] **a. `server/db.js`** — `users` 신체 치수 6개 컬럼(`body_shape`, `body_fat_pct`, `chest_cm`, `waist_cm`, `hip_cm`, `head_cm`) + 레거시 SVG/매장 사진 의류 → `/seed/studio-*` 팩샷 일괄 마이그레이션
- [x] **b. `server/api.js`** — `formatUserPayload`에 `bodyShape`, `bodyShapeLabelKo/En`, `bodyShapeShortKo`, 치수 5종, `resolvedBody`, `personalColorLabelKo/En` 포함 / `POST /api/auth/profile-setup`에서 치수 저장(`''`·`null` → `NULL` = 디폴트 자동 계산), `normalizeBodyShapeKey`로 체형 키 정규화 / `GET /api/body-shapes` 카탈로그
- [x] **c. `server/engine.js`** — 날씨 추천 `stylingProfile`에 `bodyShape`, `bodyShortKo`, `resolvedMeasurements` 포함 (`computeBodyMetrics` 경유)
- [x] **d. `src/components/VirtualMannequin.jsx`** — Three.js 무안면(기본) 퍼스널컬러 3D 마네킹, 아틀리에 톤 피팅 스튜디오, 체형·스리사이즈/두위(커스텀/디폴트) 배지, 각도 프리셋(`좌측면 -28°`, `3/4 입체 -14°`, `정면 0°`, `우측면 +24°`), 드래그 회전, 캔버스·슬롯 카드 클릭 → `onSelectSlot` / `onItemClick`, `Mannequin3DBodyPreview` export
- [x] **e. `src/components/ProfilePersonalColorModal.jsx`** — 체지방률 + BMI·체지방 기반 추천 체형, 7종 체형 카드(`Mannequin3DBodyPreview`), 스리사이즈·머리둘레(디폴트 placeholder + 비우기), 실시간 3D 프리뷰, 저장 시 치수 6종 전송
- [x] **f.** 전 화면 의류 썸네일 `<StudioGarmentImage item={item} />` 적용 (`WeatherStylingView`, `OutfitInspectorModal`, `WardrobeView`, `OutfitStudioView`, `AnalyticsCalendarView`, `ShoppingCheckView`)
- [x] **g ~ h.** `npm run build` 통과 + 브라우저 검증 + `conversation_log.md` 업데이트
- [x] **i. 실사 인체 3D 마네킹 & 29종 3D 의류 피팅 파이프라인 (`tools/blender/*`, `public/models/mannequin/*`, `src/utils/mannequin3DRenderer.js`)** — Blender 4.2 LTS + MakeHuman/MPFB2(CC0) 기반 무안면(TPS + Tutte 위상 릴랙세이션) 13,380 버텍스 인체 메쉬 + 29개 모프 타깃 + 11부위 29종 3D 의류 MHCLO 피팅 + Meshopt GLB 압축(5.8 MB) + Three.js `GLTFLoader`/`MeshoptDecoder`/`RoomEnvironment` PBR 스킨·패브릭 셰이더 및 실시간 바디/레이어 컬링
- [x] **j. `@mediapipe/tasks-vision` 478-랜드마크 런타임 도입 (`src/utils/faceLandmarkEngine.js`, `public/mediapipe/*`)** — 로컬 WASM + `face_landmarker.task` 기반 478개 3D 얼굴 랜드마크 검출(1단계 정면 + 2단계 전신샷 상단 헤드 줌 재탐색 + YCbCr 피부 클러스터 자동 폴백)
- [x] **k. 상용 앱(에이클로젯 · 겟워드롭 · 웨어링) 벤치마크 & 앱스토어/플레이스토어 반응형 공통 표준 (`src/components/common/AppUI.jsx`, `src/index.css`, `public/manifest.webmanifest`)** — 전 메뉴 공통 `PageHeader`, `HorizontalChipRail`, `KpiMetricStrip`, `ResponsiveSheetModal`, `EmptyStateBox`, iOS/Android Safe Area(`env(safe-area-inset-*)`), 44px 터치 타깃, 가로 스크롤 제로(`overflow-x: hidden`) 달성
- [x] **l. 21-Bone GPU 스켈레탈 모션 & 부위별 즉시 벗기/포커스 개선 (`src/utils/mannequin3DRenderer.js`, `src/components/VirtualMannequin.jsx`, `src/components/WeatherStylingView.jsx`)** — 뻣뻣한 A-포즈를 자연스러운 부티크 컨트라포스토 스탠스로 개선, 4종 실시간 모션(`idle` 숨쉬기, `walk` 워킹, `wave` "안녕?" 인사, `umbrella` 우천 시 3D 우산+빗줄기 자동 착용), `07 · 장갑` 등 부위별 원클릭 벗기(`×`) 버그 수정 및 `pose_hands` 양손 정중앙 카메라 프레이밍
- [x] **m. 실사 스튜디오 팩샷 28종 + 멀티존 PBR 3D 의류/액세서리 34종 + 3단계 지글 피직스 아키텍처 (`public/seed/studio-*.jpg`, `public/textures/mannequin/*.jpg`, `src/utils/garment3DPhysicsSpecs.js`, `src/components/StudioGarmentImage.jsx`)** — 픽셀 단위 무배경 의류 리컬러링, `COLOR_0` 버텍스 컬러 기반 금속 버클/가죽/유리 멀티존 셰이딩, 서류가방(`briefcase`)·토트백(`tote`) 왼손 진자 피직스(`socket_pendulum`) 및 프린지 캐시미어 머플러·코트·스커트 소프트 클로스 지글 피직스(`soft_cloth_jiggle`) 구현
- [x] **n. 전신샷·카메라 촬영 즉시 크롭 포토 에디터 (`src/components/SmartPhotoCropEditorModal.jsx`, `src/components/PortraitCropAndPinEditorModal.jsx`)** — 사진 업로드 또는 라이브 카메라 촬영 직후 8핸들 자유/비율 크롭, 부위 숏컷(얼굴/상의/하의/가방), AI 얼굴 자동 탐색, 회전·수평·밝기 보정, 원클릭 `#F4F1EA` 스튜디오 배경 정돈 즉시 실행
- [x] **o. 첫 페이지 이메일 인증 회원가입 완성 (`src/components/LoginView.jsx`, `server/api.js`, `server/db.js`)** — 6자리 OTP 인증번호 + 인증 링크(`/?verify_token=...`) + Outbox HTML 메일 발송 + 재발송 + `verified_at` 및 `SHA-256` 무결성 영수증 검증 및 즉시 로그인 연동

## Open / follow-up

- [ ] 번들 크기 — Three.js / 3D 스테이지 `dynamic import()` 코드 스플리팅 검토
