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

## Open / follow-up

- [ ] `@mediapipe/tasks-vision` 실제 478-랜드마크 런타임 도입 여부 결정 (현재 `faceLandmarkEngine.js`는 `/mediapipe/` 번들이 있을 때만 쓰는 선택적 훅 + 대체 방식)
- [ ] 번들 크기(~970 kB) — Three.js / 3D 스테이지 `dynamic import()` 코드 스플리팅 검토
