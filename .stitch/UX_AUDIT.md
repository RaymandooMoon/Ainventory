# UX_AUDIT.md — Ainventory Master Design v3 사전 감사

> 작성: Lead Architect (메인 모델 직접 감사) · 기준 커밋 `049bfda` (`backup/pre-master-design`, tag `v0-before-master-design`)
> 범위: Login · Closet · Outfits(AI 모델 스튜디오) · Calendar · Stats · 공통 크롬
> 후속 산출물: [.stitch/DESIGN.md](DESIGN.md) (v3 에디토리얼 디자인 시스템), Stitch 프로젝트 `A inventory Master Design v3`

---

## 1. 보존 자산 (Do-Not-Regress Anchors)

아래 자산은 사용자 만족도가 높은 **핵심 경험**으로 판정되어 v3 개편에서도 로직·DOM 앵커·데이터 흐름을 100% 유지한다. 시각 표현(토큰·여백·타이포)만 정제할 수 있다.

| # | 자산 | 코드 앵커 | 보존 규칙 |
| :--- | :--- | :--- | :--- |
| A1 | AI 모델 기반 착장 생성 흐름 (Gemini 멀티앵글 VTON, 캐시·보관함·0 크레딧 재사용, Staged CTA, 자동 생성 토글) | `src/components/Studio2DFittingViewer.jsx` (`synthesizeGeminiMultiAngleVton`, `studio-vton-staged-bar`, `studio-vton-history-*`), `src/services/vton2DService.ts` | 생성/캐시/히스토리 상태기계와 `data-vton-*` 속성 불변 |
| A2 | 동적 날씨 캔버스 오버레이 (비·눈·강풍·폭염 파티클, 우산 충돌, 젖은 바닥 반사) | `WeatherCanvasOverlay.tsx`, `WeatherForegroundCanvas.tsx`, `FittingWeatherGroundDeck.tsx`, `FittingAtelierBackdrop.tsx` | `pointer-events: none`, z-30 레이어 순서 불변 |
| A3 | 대칭 Top HUD (좌 줌 배율 · 중앙 날씨 캡슐 · 우 보관함) + 연속 핀치 줌 / 팬 | `.studio-stage-top-hud`, `data-vton-zoom-level`, `EditorialFlatLayBoard` `onZoomChange/onPanChange` | 3-슬롯 대칭 그리드 유지, 줌 단계 `[1, 1.2, 1.5]` + 연속 핀치 |
| A4 | 착용 중 아이템 상세 스펙 카드 / 좌측 착용 슬롯 독 | `.studio-worn-slots-dock`, `data-studio-slot`, `ItemDetailSheet.jsx` | 슬롯 L/R 배지, 해제 버튼, 포커스 동작 유지 |
| A5 | `#profile-studio-sheet` 라이트/다크 동기화 (피부톤 MST 1–10, 체형, AI 스타일, API 키) | `SkinToneAnalysisModal.jsx` (`id="profile-studio-sheet"`), `AvatarStudioModal.css` | 시트 ID·탭 구조·테마 동기화 유지 |
| A6 | 하단 플로팅 탭 독 (4탭 · 48dp · 인디케이터 바) | `src/components/ui/BottomTabBar.tsx`, `navigation.css`, `#floating-glass-tabbar` | 캡슐 형상·safe-area·active 인디케이터 유지 |
| A7 | 오프라인 우선 동기화 + GitHub Pages 스탠드얼론 폴백 | `src/utils/offlineSync.ts`, `src/utils/standaloneFallback.ts` | API 미가용 환경에서도 전 기능 체험 가능해야 함 |

---

## 2. UX 병목 (Ranked Bottlenecks)

심각도: **P0** = 핵심 경험 훼손 / **P1** = 인지 부하·신뢰 저하 / **P2** = 일관성·완성도.

### P0-1. AI 모델 기능이 "에러 복구 작업"처럼 보임 (Outfits)
- **증상**: Gemini 키 미설정/오류 시 `studio-vton-status-toast`(`role="alert"`)가 붉은 점(`.studio-vton-toast-dot`) + 장문 경고 + 3개 버튼(다시 시도 · API 키 설정 · 샘플 피팅)으로 스테이지 상단을 덮는다.
  - 근거: `Studio2DFittingViewer.jsx` L2061–2134, 메시지 `formatFallbackToastMessage()` L183–232 ("Gemini API 키가 설정되지 않아…", 원시 에러코드 `[reason]` 노출).
- **영향**: 사용자는 "AI로 내 모델을 만든다"는 핵심 가치 대신 "설정이 고장났다"는 인상을 받는다. `role="alert"`는 비긴급 정보에도 스크린리더를 즉시 인터럽트한다.
- **개선 방향**: 붉은 경고 박스 → **슬림 스튜디오 상태 캡슐**(`role="status"`, 무채색, 1줄) + 인라인 **'AI 모델 피팅 활성화'** 1차 CTA. 원시 에러코드는 `title`/개발자 영역으로 격리. 키 입력은 `#profile-studio-sheet`의 `api-key` 섹션으로 딥링크.

### P0-2. 2D 플랫레이 룩북 상태에서 3D 각도 컨트롤 노이즈
- **증상**: `.studio-angle-scroll-dock`(−180°…0°…+180° 레인지 + 9 tick + 뒷모습/정면 라벨)이 `stageMode`와 무관하게 **항상 렌더링**된다(L2403–2474). 플랫레이(평면 펼침) 상태에서는 회전 대상이 없으므로 의미 없는 컨트롤이다.
- **개선 방향**: `stageMode === 'ai-vton'` && (AI 이미지 존재 || 로딩 중 || 데모 쇼케이스)일 때만 노출. 비노출 시에도 **동일 높이 placeholder 슬롯을 유지**(visibility/opacity 전환)해 Zero-CLS 보장.

### P0-3. 상태 전환 시 레이아웃 흔들림 (CLS)
- **증상**: 플랫레이 ↔ 생성 중 ↔ 완성 뷰 전환 시 진행 바·단계 pill·Staged bar·Toast가 조건부 마운트로 삽입/제거되며 하단 독과 Look 1/2 독 위치가 튄다. 생성 중 표시는 텍스트 단계 pill("V7 투명 누끼 및 호리존 스튜디오 접지 중…")로 기술 용어가 노출된다.
- **개선 방향**: 고정 높이 **HUD 레일 슬롯**(top 48px / bottom 112px)을 항상 확보하고 내부 콘텐츠만 crossfade. 생성 중에는 **실루엣 조명 쉬머**(마네킹 실루엣 위 대각 하이라이트 스윕)로 표현, 문구는 사용자 언어("체형에 맞춰 원단을 드레이핑하는 중")로 교체.

### P1-1. 옷장 필터 축 중복 (Closet)
- **증상**: 검색+정렬 툴바(1행) → 6-pill 카테고리 레일(2행) → 주얼리 단독 pill + 서브파트 레일(3행)로 **필터 3줄**이 상시 노출. `주얼리`는 사실상 카테고리인데 별도 축으로 분리되어 "Accessories"와 의미가 겹친다. 헤더 `MY WARDROBE`/`ITEMS`가 영어 고정.
  - 근거: `WardrobeView.jsx` L221–345.
- **개선 방향**: **점진적 공개** — 1행: 카테고리 레일(주얼리를 레일 말미 pill로 흡수) / 검색·정렬은 헤더 아이콘 → 펼침 시트 / 서브파트 레일은 해당 카테고리 선택 시에만 슬라이드 다운. 헤더 카피 한국어 우선(`내 옷장`, `{n}벌`).

### P1-2. 로그인 상단 에러 카드가 투박함 (Login)
- **증상**: `atelier-error-card`(`role="alert"`, AlertCircle 18px + 2개 복구 버튼)가 세그먼트 탭 바로 아래 폼 전체를 밀어낸다(`LoginView.jsx` L502–534). 폼 필드 오류와 시스템 오류가 같은 시각 무게.
- **개선 방향**: 필드 오류는 필드 하단 인라인, 시스템 오류는 폼 하단 **슬림 인라인 노트**(아이콘 14px, 1–2줄, 우측 텍스트 버튼 '다시 시도'). 샘플 체험은 상시 보조 CTA로 이미 존재하므로 중복 제거.

### P1-3. 소셜 로그인 부재 (Login)
- **증상**: Apple 로그인(목업)과 이메일 OTP만 존재. 안드로이드/웹 주 사용자층에 Google 계정 로그인이 없다.
- **개선 방향**: 최상단 **'Google 계정으로 로그인'** (공식 4색 G, 48dp, 라이트/다크) + GIS(`VITE_GOOGLE_CLIENT_ID`) ID 토큰 흐름, 미설정 환경(GitHub Pages)에서는 무중단 인앱 안내 모달 → 샘플 체험/이메일 로그인으로 우회.

### P2-1. Calendar / Stats 스타일 수치 드리프트
- **증상**: `calendarEditorial.css`에 8pt 그리드 밖 간격(`gap: 2px/3px/5px/6px` 15회), 비토큰 반경(`8px/9px/10px/11px/12px/13px/18px`) 산재. `statsBento.css`는 하드코딩 폰트(`1.78rem/1.48rem/1.32rem/0.65rem`)와 `font-size` 25회 대비 `tabular-nums` 12회로 수치 위계가 불균일.
- **개선 방향**: 간격은 `--space-*`(4/8/16/24/32/40/48)로 스냅, 반경은 v3 곡률 계층 5단으로 정규화, 모든 수치 텍스트에 `tabular-nums` + `display-metric` 타이포 토큰.

### P2-2. 기술 용어·영문 카피 혼재
- **증상**: "V7 투명 누끼", "0 크레딧", "Look 1", "Auto ON/OFF" 등 내부 용어 노출, 한국어 UI에 영문 헤더 산재.
- **개선 방향**: 한국어 우선 카피 고정, 숫자·단위만 영문/기호 허용.

---

## 3. 워커 분담 매핑

| 병목 | 담당 | 핵심 파일 |
| :--- | :--- | :--- |
| P1-2, P1-3 | Worker 1 — 로그인 아틀리에 & Google 로그인 | `LoginView.jsx`, `auth/loginAtelier.css`, `server/api.js`, `standaloneFallback.ts`, `services/googleIdentity.ts` |
| P0-1, P0-2, P0-3, P2-2(Outfits) | Worker 2 — AI 모델 스튜디오 일체화 | `Studio2DFittingViewer.jsx/.css`, `EditorialFlatLayBoard.jsx`, `OutfitStudioView.jsx`, `SkinToneAnalysisModal.jsx`, `atelierTokens.css` |
| P1-1, P2-1, P2-2(Closet/Cal/Stats) | Worker 3 — Closet·Calendar·Stats 에디토리얼 마감 | `WardrobeView.jsx`, `calendar/*`, `stats/*`, `index.css`, `carbonDesignContract.ts` |

## 4. 수용 기준 (Acceptance)
- 붉은 점/`role="alert"` 경고 박스가 Outfits 기본 흐름에서 0회 노출 (`data-vton-status-toast` → `data-studio-status-capsule`).
- 플랫레이 상태에서 각도 레인지 입력이 접근성 트리에서 제외(`hidden`/`inert`)되며 하단 독 높이 변화 0px.
- 옷장 상시 필터 행 ≤ 1 (서브 레일은 조건부).
- 신규 수치 텍스트 100% `tabular-nums`, 8pt 그리드 밖 간격 신규 도입 0건.
- `npm run verify` / `verify:secrets` / `verify:docs` 전부 통과.
