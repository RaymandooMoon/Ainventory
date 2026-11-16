---
version: "v3"
name: "Ainventory — Tailored Atelier Editorial System (Master Design v3)"
description: >
  Editorial, tactile, calm, tailored-atelier design system for a private fitting studio app:
  3D/2D digital closet, AI model virtual try-on, weather-aware styling, calendar lookbook and
  wardrobe statistics. Monochrome architecture on Paper White / Gallery Gray / Atelier Linen in
  light mode and Warm Obsidian / Graphite in dark mode, so garments, skin tones and weather
  light carry all of the chroma. All product copy is Korean.
colors:
  # Light — "Atelier Daylight"
  canvas: "#FFFFFF"
  surface: "#F5F5F7"
  surface-sunken: "#EDEDF0"
  linen: "#F4F0E8"
  linen-mid: "#ECE7DD"
  linen-horizon: "#E6E0D5"
  packshot: "#F7F7F5"
  ink: "#1D1D1F"
  ink-secondary: "#515154"
  ink-tertiary: "#636366"
  ink-on-linen: "#1D1C1A"
  ink-on-linen-secondary: "#55524C"
  hairline: "rgba(29, 29, 31, 0.08)"
  hairline-strong: "rgba(29, 29, 31, 0.16)"
  primary: "#1D1D1F"
  on-primary: "#FFFFFF"
  # Dark — "Warm Obsidian Gallery"
  dark-canvas: "#141413"
  dark-surface: "#1C1C1E"
  dark-elevated: "#2C2C2E"
  dark-card: "#21201E"
  dark-ink: "#F5F5F7"
  dark-ink-secondary: "#AEAEB2"
  dark-ink-tertiary: "#98989D"
  dark-hairline: "rgba(245, 245, 247, 0.12)"
  dark-primary: "#F5F5F7"
  dark-on-primary: "#141413"
  # Atelier accent (hairline/focus only — never a fill for chrome)
  sand: "#D8C3A5"
  sand-ink: "#7A5F3E"
  # Semantic (validation & destructive only)
  danger: "#B42318"
  danger-dark: "#FF6961"
  success: "#1F6F43"
  success-dark: "#4ADE80"
  focus-ring: "#1D4ED8"
  focus-ring-dark: "#60A5FA"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 740
    lineHeight: 1.08
    letterSpacing: "-0.034em"
  screen-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 720
    lineHeight: 1.14
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 680
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "-0.012em"
  body-input:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "-0.012em"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 640
    lineHeight: 1.38
    letterSpacing: "-0.008em"
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 540
    lineHeight: 1.42
    letterSpacing: "-0.004em"
  kicker:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.08em"
  display-metric:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  metric-inline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "0em"
    fontFeature: "tnum"
rounded:
  micro: "8px"
  sm: "10px"
  md: "14px"
  squircle: "22px"
  lg: "26px"
  pill: "9999px"
spacing:
  "1": "4px"
  "2": "8px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  touch: "48px"
  gutter-mobile: "16px"
  gutter-tablet: "24px"
  gutter-desktop: "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "24px"
  button-primary-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.dark-on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "24px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "20px"
  button-google:
    backgroundColor: "#FFFFFF"
    textColor: "#1F1F1F"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "16px"
  button-google-dark:
    backgroundColor: "#131314"
    textColor: "#E3E3E3"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "16px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-input}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "16px"
  closet-squircle-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.squircle}"
    padding: "16px"
  packshot-card:
    backgroundColor: "{colors.packshot}"
    textColor: "{colors.ink-on-linen}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "8px"
  category-pill-inactive:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "16px"
  category-pill-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "16px"
  glass-hud-capsule:
    backgroundColor: "rgba(255, 255, 255, 0.84)"
    textColor: "{colors.ink}"
    typography: "{typography.metric-inline}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "16px"
  glass-hud-capsule-dark:
    backgroundColor: "rgba(20, 20, 19, 0.84)"
    textColor: "{colors.dark-ink}"
    typography: "{typography.metric-inline}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "16px"
  studio-status-capsule:
    backgroundColor: "rgba(255, 255, 255, 0.84)"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "8px"
  studio-stage:
    backgroundColor: "{colors.linen}"
    textColor: "{colors.ink-on-linen}"
    typography: "{typography.headline}"
    rounded: "{rounded.lg}"
    padding: "16px"
  studio-drawer:
    backgroundColor: "{colors.dark-canvas}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "16px"
  bottom-sheet:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "24px"
  bottom-sheet-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "24px"
  floating-tab-dock:
    backgroundColor: "rgba(255, 255, 255, 0.84)"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    height: "64px"
    padding: "8px"
  stats-bento-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.display-metric}"
    rounded: "{rounded.squircle}"
    padding: "24px"
  calendar-day-cell:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.metric-inline}"
    rounded: "{rounded.md}"
    padding: "8px"
  inline-note:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "16px"
---

## Overview

**Ainventory**는 내 옷을 사진 한 장으로 디지털화하고, **AI로 생성한 나만의 모델**에게 날씨와 일정에 맞는 착장을 입혀 보는 **프라이빗 피팅 스튜디오**다. 웹(GitHub Pages)과 Capacitor Android에서 동일하게 동작하는 모바일 우선 앱이며, 모든 제품 카피는 한국어로 작성한다.

### Brand Mood — 4 Adjectives

| 형용사 | 의미 | 화면에서의 구현 |
| :--- | :--- | :--- |
| **Editorial** (에디토리얼) | 패션 매거진의 지면처럼 큰 여백·대비가 분명한 타이포·한 화면 한 메시지 | 화면 타이틀은 `screen-title` 1개, 섹션 머리는 `kicker` 대문자 키커 + `headline`. 장식 아이콘·배지 최소화 |
| **Tactile** (촉각적) | 원단과 종이를 만지는 듯한 물성 | 스쿼클 카드의 상단 키라이트·1px 스펙큘러 림·접지 그림자, 탭 시 `scale(0.97)` 압축, 햅틱 `selection` |
| **Calm** (고요함) | 경고·알림이 소리치지 않는 공간 | 무채색 크롬, 붉은색은 파괴적 확인에만, 상태 안내는 1줄 캡슐(`role="status"`), 모션은 180–360ms 스프링 |
| **Tailored Atelier** (맞춤 아틀리에) | 재단사의 작업실 — 리넨 호리존, 샌드 줄자, 오브시디언 작업대 | Outfits 스테이지 `#F4F0E8` 리넨 사이클로라마 + `#141413` 오브시디언 드로어 + `#D8C3A5` 샌드 포커스 헤어라인 |

### Spatial Philosophy — "Gallery, Not Dashboard"
1. **옷과 사람이 주인공이다.** 화면 면적의 85% 이상(`minVisualRatio: 0.85`)은 의류 이미지·AI 모델·여백이 차지하고, 크롬(컨트롤)은 가장자리 글래스 HUD로 물러난다.
2. **세 개의 깊이 평면만 사용한다.** ① 캔버스(벽) ② 표면(카드·스테이지 — 바닥) ③ 플로팅 글래스(HUD·시트·탭 독 — 공중). 그 외 임의의 중간 평면·중첩 카드 금지.
3. **점진적 공개.** 1차 동작만 상시 노출하고, 2차 필터·고급 설정은 사용자가 맥락에 들어설 때(카테고리 선택, AI 모델 활성화) 슬라이드로 드러낸다.
4. **고정된 무대, 바뀌는 조명.** 상태가 바뀌어도 무대(레이아웃 박스)는 움직이지 않고, 조명(불투명도·블러·쉬머)과 내용만 바뀐다 → Zero-CLS.

### Source of Truth in Code
- 아키텍처/DOM 계약: `src/contracts/carbonDesignContract.ts`
- 전역 토큰·모션: `src/index.css` (`--bg-*`, `--ink-*`, `--space-*`, `--radius-*`, `--type-*`, `--spring-ease`)
- 스튜디오 스코프 토큰: `src/styles/atelierTokens.css` (`--atelier-*`)
- UI 프리미티브: `src/components/ui/uiPrimitives.css`, `navigation.css`
- 사전 감사: `.stitch/UX_AUDIT.md`

## Colors

크롬은 엄격한 무채색이다. 색(chroma)은 **의류 사진, 피부톤, 날씨 조명**에서만 나온다. 의미 색상(위험·성공)은 검증 메시지와 파괴적 확인에만 쓰고, 정보성 안내에는 절대 쓰지 않는다.

### Light — "Atelier Daylight"

| Role | Hex | CSS Variable | 용도 | 대비 (본문 잉크 기준) |
| :--- | :--- | :--- | :--- | :--- |
| Canvas (벽) | `#FFFFFF` | `--bg-canvas` | 앱 배경, 시트 본문, 캘린더 셀 | `#1D1D1F` 16.83:1 |
| Surface (바닥) | `#F5F5F7` | `--bg-surface` | 스쿼클 카드, 입력 필드, 비활성 필 | `#1D1D1F` 15.46:1 |
| Surface Sunken | `#EDEDF0` | `--bg-tertiary` | 세그먼트 트랙, 스켈레톤 | — |
| Atelier Linen | `#F4F0E8` | `--atelier-stage-warm-base` | Outfits 사이클로라마, 로그인 무대 | `#1D1C1A` 14.98:1 |
| Linen Mid / Horizon | `#ECE7DD` / `#E6E0D5` | `--atelier-stage-warm-mid/shadow` | 호리존 그라디언트(바닥 접지선) | — |
| Packshot | `#F7F7F5` | `--atelier-packshot-card-bg` | 드로어 의류 팩샷 카드 | `#55524C` 7.26:1 |
| Ink Primary | `#1D1D1F` | `--ink-primary` | 제목, 본문, 1차 CTA 배경 | — |
| Ink Secondary | `#515154` | `--ink-secondary` | 보조 본문, 비활성 필 라벨 | 7.9:1 on `#FFFFFF` |
| Ink Tertiary | `#636366` | `--ink-muted` | 캡션, 메타데이터 (`#6E6E73`은 `#F5F5F7` 위에서 4.66:1로 경계값이므로 **표면 위 캡션은 `#636366` 5.5:1 사용**) | 5.5:1 on `#F5F5F7` |
| Ink on Linen 2nd | `#55524C` | `--atelier-ink-secondary-on-light` (solid) | 리넨 스테이지 위 보조 텍스트 | 6.85:1 on `#F4F0E8` |
| Hairline | `rgba(29,29,31,0.08)` / strong `0.16` | `--hairline` | 카드 외곽선, 구분선 | — |

### Dark — "Warm Obsidian Gallery"

| Role | Hex | CSS Variable | 용도 | 대비 |
| :--- | :--- | :--- | :--- | :--- |
| Canvas | `#141413` | `--bg-canvas` | 앱 배경 (순흑 `#000` 대신 따뜻한 오브시디언 — 할레이션·번인 완화, 에디토리얼 톤 유지) | `#F5F5F7` 16.93:1 |
| Surface | `#1C1C1E` | `--bg-surface` | 카드, 입력, 시트 | `#F5F5F7` 15.63:1 |
| Elevated | `#2C2C2E` | `--bg-elevated` | 모달 내부 카드, 활성 세그먼트 | — |
| Studio Card | `#21201E` | `--atelier-obsidian-card` | 드로어 카드 | `#D8C3A5` 9.51:1 |
| Ink Primary | `#F5F5F7` | `--ink-primary` | 제목·본문·1차 CTA 배경 | — |
| Ink Secondary | `#AEAEB2` | `--ink-secondary` | 보조 본문 | 7.69:1 on `#1C1C1E` |
| Ink Tertiary | `#98989D` | `--ink-muted` | 캡션 | 5.93:1 on `#1C1C1E` |
| Hairline | `rgba(245,245,247,0.12)` | `--hairline` | 외곽선 | — |

> Outfits 스테이지는 **라이트 모드에서 항상 리넨(`#F4F0E8`, 휘도 ≥ 225)** 을 유지하고, 다크 모드에서만 `#141413 → #1B1A18` 로 전환한다. 드로어는 양 모드 모두 오브시디언 스모크 글래스다.

### Atelier Accent & Semantic

| Role | Light | Dark | 규칙 |
| :--- | :--- | :--- | :--- |
| Sand (재단 줄자) | `#D8C3A5` 헤어라인 / 텍스트 시 `#7A5F3E` (5.23:1 on linen) | `#D8C3A5` (10.77:1 on `#141413`) | **채우기 금지.** 착용/포커스 링(2px), 날씨 큐레이션 점(6px), 진행 쉬머 하이라이트에만 |
| Danger | `#B42318` (6.57:1 on white) | `#FF6961` (6.03:1 on `#1C1C1E`) | 필드 검증 오류 텍스트, 삭제 확인 버튼에만. 정보성 상태 안내·API 키 미설정 안내에 사용 금지 |
| Success | `#1F6F43` (6.15:1) | `#4ADE80` (9.76:1) | 인증 완료 체크, 저장 완료 캡슐 아이콘 |
| Focus Ring | `#1D4ED8` | `#60A5FA` | `:focus-visible` 2px 링 + 2px 오프셋. 유일하게 허용되는 유채색 UI 링 |

### Weather Overlay Legibility (WCAG AA ≥ 4.5:1)

날씨 캔버스(`WeatherCanvasOverlay`, z-30)는 스테이지 위에 반투명 색조·파티클을 덮는다. 측정치 기반 규칙:

| 날씨 | 오버레이 | 결과 배경 | 규칙 |
| :--- | :--- | :--- | :--- |
| 비 (`rain`) | `rgba(14,16,20,0.22)` (최대 0.32) | `#C1BFB9` → `#AAA8A4` | 스테이지 위 **자유 텍스트 금지** (`#55524C` 4.23:1 → 3.28:1 실패). 모든 텍스트는 글래스 HUD 캡슐 내부에 배치 |
| 맑음 (`clear`) | 웜 글로우 `rgba(255,214,150,0.18)` | `#F6EBD9` | 잉크 14.44:1, 보조 `#55524C` 6.6:1 — 통과 |
| 눈 (`snow`) | 화이트 베일 `rgba(255,255,255,0.35)` | `#F8F5F0` | 보조 `#55524C` 7.16:1 — 통과. 흰 파티클 뒤 흰 텍스트 금지 |
| 다크 + 비 | 동일 | `#131313` | `#F5F5F7` 17.06:1, `#A8A49C` 7.48:1 — 통과 |

**글래스 HUD 불투명도 하한**
- 라이트 HUD: 배경 알파 **≥ 0.84** (`rgba(255,255,255,0.84)`). 최악 조건(비 0.32) 위에서 잉크 14.2:1, 보조 텍스트는 **`#5C5852` 이상 진하게**(6.25:1). `#6E6E73`은 4.29:1로 실패하므로 HUD 내부 사용 금지.
- 다크 HUD: 배경 알파 **≥ 0.84** (`rgba(20,20,19,0.84)`). 밝은 리넨 위 최악 조건에서 잉크 11.09:1, 보조 텍스트 `rgba(247,247,245,0.72)` 6.61:1.
- `html[data-vibrancy-fallback='solid']`일 때 HUD는 불투명 `#F9F9FB` / `#1C1C1F`로 교체 → 대비는 항상 증가.

## Typography

**SF Pro (Display/Text)** 는 라틴·숫자의 광학 선명도를, **Pretendard Variable** 은 한글 균형을 담당한다. 웨이트 대비(740 ↔ 500)와 크기 대비로 위계를 만들고, 색으로 위계를 만들지 않는다.

| Token | Size / Line-height | Weight | Tracking | CSS Variable | 사용처 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `display` | `2.25rem` (36px) / 1.08 | 740 | `-0.034em` | `--type-hero` (`clamp(1.82rem, 3.1vw, 2.28rem)`) | 로그인 히어로, 빈 상태 헤드라인 |
| `screen-title` | `1.75rem` (28px) / 1.14 | 720 | `-0.03em` | `--type-screen-title` | 탭 화면 타이틀 (`내 옷장`, `코디`, `캘린더`, `통계`) |
| `headline` | `1.125rem` (18px) / 1.3 | 680 | `-0.02em` | `--type-title-md` | 섹션·카드 제목, 시트 제목 |
| `body` | `0.9375rem` (15px) / 1.5 | 500 | `-0.012em` | `--type-body` | 본문, 설명 |
| `body-input` | `1rem` (16px) / 1.5 | 500 | `-0.012em` | — | 모든 `<input>` (iOS 자동 확대 방지) |
| `label` | `0.8125rem` (13px) / 1.38 | 640 | `-0.008em` | `--type-label` | 버튼, 필, 탭 라벨 |
| `caption` | `0.75rem` (12px) / 1.42 | 540 | `-0.004em` | `--type-caption` | 메타데이터, 상태 캡슐 |
| `kicker` | `0.6875rem` (11px) / 1.2 | 700, 대문자 | `+0.08em` | `--type-micro` | 섹션 키커 (`TODAY'S LOOK`, `WEAR RATE`) — 영문 키커만 대문자, 한글 키커는 tracking `+0.02em` |
| `display-metric` | `1.75rem` (28px) / 1.0 | 700 | `-0.03em` | `--type-metric-display` | 통계 대표 수치, 온도 대형 표기 |
| `metric-inline` | `0.8125rem` (13px) / 1.2 | 650 | `0` | — | HUD 온도·배율·카운트, 캘린더 날짜 |

**규칙**
- 한글 본문 최소 행간 1.5, 한글 제목 최소 1.14 (받침 충돌 방지). 한 줄 최대 길이 34자(한글)/66자(라틴).
- 한 화면에 웨이트는 최대 3종(740·640·500), 크기는 최대 4종.
- 줄바꿈: 한글 텍스트 블록에 `word-break: keep-all; overflow-wrap: anywhere;`.

### `tabular-nums` 강제 규칙 (MUST)
다음 텍스트에는 예외 없이 `font-variant-numeric: tabular-nums;`(+ 클래스 `.tabular-nums`)를 적용한다. 숫자 폭이 바뀌어 레이아웃이 흔들리면 Zero-CLS 위반이다.
1. 통계 수치: 착용 횟수, 착용률 %, CPW(1회 착용 비용) 금액, 랭킹 순위, 바/도넛 범례 값
2. 온도·날씨: `14°C`, 체감 온도, 강수 확률
3. 카운트: 옷장 아이템 수(`42벌`), 보관함 배지, 착용 배지(`3회`), 필 카운트
4. 캘린더: 날짜 숫자, 요일 그리드, 주차
5. 스튜디오: 줌 배율(`1.2×`), 각도(`45°`), MST 단계(`MST 6`), 체형 수치(cm/kg)
6. 인증: OTP 6자리 입력, 재전송 타이머(`0:59`)

## Layout

### 8pt Grid
- 기본 단위 `8px`. 허용 간격 스케일은 **`4 · 8 · 16 · 24 · 32 · 40 · 48`** (`--space-1 … --space-12`) 뿐이다. `2px/3px/5px/6px/10px/12px` 등 스케일 밖 간격 신규 도입 금지(4px는 아이콘-라벨 사이 등 미세 간격 전용).
- 화면 거터: 모바일 `16px` / 태블릿 `24px` / 데스크톱 `40px`. Galaxy Z Fold 커버(`≤ 359px`)만 `12px` 예외.
- 섹션 간 수직 리듬: 섹션 사이 `32px`, 섹션 제목과 내용 `16px`, 카드 내부 `16px`(통계 벤토 `24px`).

### Touch Targets
- 모든 인터랙티브 요소의 히트 영역 **≥ 48×48dp** (시각 크기가 작아도 패딩/의사요소로 확장). 인접 타깃 간격 ≥ 8px.
- 예외 없음: 칩 해제 `×`, 히스토리 삭제, 캘린더 날짜 셀, 비밀번호 표시 토글 포함.

### Information Architecture (4-Tab)
1. **옷장 (`closet`)**: 타이틀 + 아이템 수 → 단일 카테고리 레일(전체·상의·하의·아우터·신발·액세서리·주얼리) → (선택 시) 서브파트 레일 → 스쿼클 그리드(2→3→4열). 검색·정렬은 헤더 아이콘에서 펼침.
2. **코디 (`outfits`)**: AI 모델 스튜디오 무대(리넨 사이클로라마) + 오브시디언 드로어. `≥ 600px` 58:42 분할, 모바일은 전체 무대 + 바텀시트 드로어.
3. **캘린더 (`calendar`)**: 월간 룩북 그리드(착장 썸네일 셀) + 슬라이드 오버 데이 드로어.
4. **통계 (`stats`)**: 벤토 카드(대표 수치 → 차트 → 랭킹) 에디토리얼 그리드.

### Breakpoints & Safe Areas
- `≤ 359px` 폴드 커버 / `360–599px` 표준 모바일 / `≥ 600px` 태블릿·언폴드 / `≥ 1024px` 데스크톱(`max-width: 1160px`).
- `env(safe-area-inset-*)` 항상 준수. 하단 탭 독 여유 `calc(112px + var(--safe-bottom))`. 가로 오버플로 0.

## Elevation & Depth

세 평면(캔버스 · 표면 · 플로팅 글래스)만 존재한다.

| Level | 토큰 | 값 | 사용처 |
| :--- | :--- | :--- | :--- |
| 0 Canvas | — | 그림자 없음 | 배경 |
| 1 Surface | `--elevation-xs` | `0 1px 2px rgba(15,23,42,0.04)` + 1px 헤어라인 | 카드, 입력, 스테이지 |
| 1+ Lifted (hover/press) | `--elevation-sm` | `0 6px 16px rgba(15,23,42,0.08)` + `translateY(-2px)` | 카드 hover (모바일 없음) |
| 2 Floating Glass | `--elevation-lg` | `0 24px 56px rgba(15,23,42,0.15)` | 탭 독, HUD 캡슐, 시트, 팝오버 |

### Glass HUD / Sheet Blur
- 블러: `backdrop-filter: blur(24px) saturate(160%)` (`--vibrancy-filter`). 드로어는 `blur(24px) saturate(135%)` (`--atelier-drawer-blur`).
- 배경 알파: 라이트 `rgba(255,255,255,0.84)`, 다크 `rgba(20,20,19,0.84)` (Weather Overlay Legibility 참조). 외곽 1px 헤어라인 필수.
- **GPU 폴백**: WebGL 프레임 드롭 감지 시 `html[data-vibrancy-fallback='solid']` → 모든 `backdrop-filter: none`, 배경 `--glass-bg-solid-fallback` (`#F9F9FB` / `#1C1C1F`). `prefers-reduced-transparency: reduce`도 동일 처리.

### 2.5D Garment Lighting
- 스쿼클 카드: 좌상단 방사형 키라이트(`--squircle-illumination`) + 1px 상단 스펙큘러 림 + 의류 드롭섀도 + 타원형 접지 그림자(`.garment-25d-floor-shadow`).

## Shapes

### Squircle Curvature Hierarchy (동심원 규칙: 내부 반경 = 외부 반경 − 패딩, 최소 8px)

| Level | Radius | Token | Surface |
| :--- | :--- | :--- | :--- |
| L1 Micro | `8px` | `--radius-micro` | 카드 내부 썸네일, 슬롯 칩 이미지, 캘린더 셀 내부 썸네일 |
| L2 Small | `10px` | `--radius-sm` | 드로어 아이콘 버튼, 세그먼트 내부 thumb |
| L3 Medium | `14px` | `--radius-md` | 입력 필드, 팩샷 카드, 캘린더 날짜 셀, 인라인 노트 |
| L4 Squircle | `22px` | `--radius-squircle` | 옷장 스쿼클 카드(1:1), 통계 벤토 카드 — **시그니처 곡률** |
| L5 Large | `26px` | `--radius-lg` | 바텀시트 상단 모서리, 모달, 분할 스튜디오 외곽 |
| Pill | `9999px` | `--radius-pill` | CTA, 필, 탭 독, HUD 캡슐, 배지 |

- 반경은 위 6단만 허용. `9px/11px/12px/13px/18px` 등 임의 값 금지.
- 가능하면 `corner-shape: squircle` 점진 적용(미지원 브라우저는 일반 radius).

## Components

### Floating Tab Dock (보존)
- 화면 하단 중앙 캡슐, 글래스(0.84) + `--elevation-lg`, 높이 64px, 탭 4개 각 ≥ 48dp, 간격 8px.
- 활성: 대비 반전 + 2px 외곽 링 + 라벨 760 + `18×2.5px` 하단 인디케이터(색 이외 단서).

### Login Atelier
- 무대: 리넨(`#F4F0E8`) / 다크 `#141413` 배경 + 의류 모션 스테이지(`#login-wardrobe-motion-stage`).
- 순서: 브랜드 워드마크 → 한 줄 가치 제안(`display`) → **Google 계정으로 로그인**(최상단 1순위) → Apple 로그인 → `또는` 구분선 → 로그인/회원가입 세그먼트 → 폼 → 샘플 옷장 체험(보조 텍스트 버튼).
- **Google 버튼**: 공식 4색 G 로고 SVG(18px, 색 변경 금지), 라이트 `#FFFFFF` 배경 + `#747775` 1px 테두리 + `#1F1F1F` 텍스트(16.48:1), 다크 `#131314` 배경 + `#8E918F` 테두리 + `#E3E3E3` 텍스트(14.47:1). 높이 48px, pill, 라벨 `Google 계정으로 로그인`.
- 오류: 필드 오류는 필드 하단 `caption` + danger 잉크. 시스템 오류는 폼 하단 **인라인 노트**(surface 배경, 14px 아이콘, 1–2줄, 우측 텍스트 버튼 `다시 시도`). 상단을 밀어내는 경고 카드 금지.

### Closet
- **단일 카테고리 레일**: 40px 필, 간격 8px, 활성은 대비 반전 + 체크 없는 굵은 라벨, 우측에 카운트(`tabular-nums`). 주얼리는 레일 말미 필로 흡수.
- **서브파트 레일**: 액세서리/주얼리 선택 시에만 180ms 슬라이드 다운(높이는 예약 슬롯 내 opacity 전환).
- **검색/정렬**: 헤더 아이콘 버튼(48dp) → 펼침 시 레일 위에 검색 필드 + 정렬 세그먼트.
- **스쿼클 카드**: 1:1, `#F5F5F7`, 22px, 의류 13% 패딩, 하단 2줄 메타(이름 640 / 브랜드 `#636366`), 착용 배지(`3회`, tabular).

### Outfits — AI Model Studio
- **무대 레이어**: z-0 사이클로라마 → z-10 접지 데크 → z-20 모델/플랫레이 → z-30 날씨 캔버스 → z-55 HUD.
- **대칭 Top HUD (보존)**: 좌 줌 배율 캡슐 · 중앙 날씨 캡슐(`지역 · 14°C` + 큐레이션 점 + 서브라인) · 우 보관함 버튼. 높이 40px 캡슐, 상단 슬롯 48px 고정.
- **Studio Status Capsule (신규, 붉은 경고 박스 대체)**: 무대 하단 HUD 레일 안의 1줄 글래스 캡슐(`role="status"`). 구성: 6px 샌드 점(정보) → 상태 문구(`AI 모델 피팅이 꺼져 있어요` 등) → 우측 1차 텍스트 CTA(`AI 모델 피팅 활성화`) → 닫기(48dp). 원시 에러 코드는 `title`/`data-reason`에만.
- **AI 모델 피팅 활성화 동선**: CTA → `#profile-studio-sheet` `api-key` 섹션 딥링크(키 미설정) 또는 즉시 재시도(일시 오류). `샘플 피팅`은 캡슐 오버플로 대신 시트 내 보조 버튼으로.
- **3D 각도 독**: AI 모델 뷰(이미지 존재·생성 중·샘플)에서만 노출. 플랫레이 룩북에서는 같은 높이의 빈 슬롯을 유지한 채 `opacity: 0; visibility: hidden; inert`.
- **생성 중 — 실루엣 조명 쉬머**: 모델 실루엣(마네킹 윤곽) 위로 샌드→화이트 대각 하이라이트가 1.6s 주기로 스윕, 상단 2px 진행 라인. 문구는 3단계 사용자 언어(`옷감을 고르는 중` → `체형에 맞춰 드레이핑하는 중` → `조명을 맞추는 중`).
- **Profile Studio Sheet (보존)**: 피부톤 MST 1–10 스와치 행(각 48dp, 선택 시 샌드 2px 링 + 체크), 체형 슬라이더(cm/kg tabular), AI 스타일(캐릭터/실사), API 키. 시트 높이 상태 64dvh / 92dvh.
- **팩샷 카드**: `#F7F7F5`, 14px, 1:1.06, 착용 시 샌드 2px 링 + 흰 외곽 헤일로.

### Calendar Lookbook
- 7열 그리드, 셀 간격 8px, 셀 14px 반경, 날짜 `metric-inline` 좌상단, 착장 썸네일 8px 반경 하단 정렬. 오늘은 잉크 2px 링(색 이외 단서), 선택은 대비 반전 날짜 배지.
- 월 타이틀 `screen-title`, 요일 헤더 `kicker`.

### Stats Bento
- 2열(모바일) / 3열(태블릿+) 벤토, 카드 22px 반경, 패딩 24px, 간격 16px.
- 카드 내부 위계: `kicker` 라벨 → `display-metric` 대표 수치(tabular) + 단위 `caption` → 차트/랭킹. 수치 정렬은 오른쪽 정렬 + tabular.

### Inline Note / Status Capsule (공통)
- 정보성 안내는 항상 무채색 + `role="status"` + `aria-live="polite"`. `role="alert"`는 사용자의 즉시 행동이 필요한 파괴적/차단 오류에만.

## Imagery — Theme-Coordinated Packshots

- **배경 톤 일치**: 의류 팩샷은 누끼(`image/webp`, 투명) 후 테마 표면 위에 놓는다. 라이트: 옷장 `#F5F5F7`, 드로어 `#F7F7F5`, 스테이지 `#F4F0E8`. 다크: `#1C1C1E` / `#21201E` / `#141413`. 흰 배경이 박힌 원본 사진은 `mix-blend-mode: multiply`(라이트 한정) 또는 표면색 패딩으로 경계를 숨긴다.
- **조명 방향 통일**: 모든 2.5D 카드·AI 모델·아바타 실루엣은 **좌상단 45° 키라이트**, 우하단 접지 그림자. 다크 모드에서는 키라이트 강도 −40%, 림 라이트(스펙큘러) 유지.
- **AI 모델 실루엣 조명**: 라이트 = 리넨 반사광의 따뜻한 화이트, 다크 = 오브시디언 위 샌드 림 라이트. 생성 쉬머 색도 동일 계열.
- **아이콘**: Lucide 1.75–2.1 stroke, 잉크 색 상속(`currentColor`). 유채색 아이콘 금지(Google G 로고만 예외).
- **날씨와 이미지**: 비 → 젖은 바닥 반사(데크), 맑음 → 웜 글로우, 눈 → 화이트 베일. 의류 이미지 자체 색은 오버레이로 왜곡하지 않는다(오버레이는 z-30, 텍스트·이미지 대비 규칙 준수).

## Motion — Zero-CLS Rules

- **커브**: `--spring-ease: cubic-bezier(0.32, 0.72, 0, 1)`. 지속시간: 마이크로 120–180ms, 전환 240ms, 시트 340–360ms.
- **애니메이션 허용 속성은 `opacity`, `transform`, `filter`, `clip-path` 뿐.** `height/width/top/margin` 애니메이션 금지.
- **예약 슬롯**: 조건부 UI(상태 캡슐, Staged CTA, 각도 독, 서브파트 레일)는 항상 고정 크기 컨테이너를 렌더하고 내부만 crossfade. 마운트/언마운트로 형제 요소를 밀어내지 않는다.
- **이미지 박스**: 모든 이미지 컨테이너에 `aspect-ratio` 명시. 로딩은 스켈레톤 쉬머(같은 크기).
- **숫자**: tabular-nums로 폭 고정, 카운트업 애니메이션 시에도 폭 불변.
- **상태 전환 매트릭스 (Outfits)**: 플랫레이 ↔ 생성 중 ↔ AI 모델 뷰 ↔ 피부톤/체형 시트 — 무대 박스 크기·HUD 위치 변화 0px, 바뀌는 것은 무대 내용(crossfade 240ms)과 HUD 내용뿐.
- `prefers-reduced-motion: reduce` → 쉬머·스윕·파티클 정지, crossfade만 120ms.

## Do's and Don'ts

### Do's
- 크롬은 무채색(`#FFFFFF`/`#F5F5F7`/`#1D1D1F`, 다크 `#141413`/`#1C1C1E`/`#F5F5F7`), 색은 옷·피부·날씨에서만.
- 모든 수치에 `tabular-nums`, 모든 타깃 48dp, 모든 간격 8pt 스케일.
- 상태는 1줄 캡슐로 조용히, 다음 행동은 하나의 명확한 CTA로.
- 조건부 UI는 예약 슬롯에서 crossfade (Zero-CLS).
- 모든 카피는 자연스러운 한국어(숫자·단위·브랜드명만 예외), 기술 용어(누끼, 크레딧, V7, reason code) 사용자 노출 금지.
- `html[data-vibrancy-fallback='solid']`, `prefers-reduced-motion`, `prefers-reduced-transparency`, safe-area 항상 지원.

### Don'ts
- 붉은 점·붉은 박스로 정보성 상태(API 키 미설정 등)를 알리지 않는다.
- 플랫레이 룩북에 3D 각도 컨트롤을 노출하지 않는다.
- 같은 의미의 필터 축을 두 줄 이상 동시에 노출하지 않는다.
- 웜골드·보라-파랑 그라디언트·네온 액센트를 크롬에 넣지 않는다. 샌드는 헤어라인/점만.
- 라이트 모드 Outfits 스테이지를 어둡게 만들지 않는다.
- 날씨 오버레이 위에 HUD 없이 텍스트를 직접 올리지 않는다.
- 임의 반경(9/11/12/13/18px), 스케일 밖 간격(2/3/5/6px)을 새로 도입하지 않는다.

## Stitch Generation Notes (for screen prompts)

- 기본 바이브 문구: *"Editorial, tactile, calm tailored-atelier private fitting studio; monochrome chrome on paper white #FFFFFF, gallery gray #F5F5F7 and warm linen #F4F0E8 (dark: warm obsidian #141413, graphite #1C1C1E); sand #D8C3A5 hairline accents only; Keep all product copy and button text in Korean."*
- 이미지 일체화: *"Garment packshot cards use #F7F7F5 backgrounds with transparent cutouts and a soft top-left key light; AI model silhouette lit with warm linen bounce light (dark: sand rim light); icons inherit ink color."*
- 정제는 `edit_screens`로 프롬프트당 1–2개 요소만(예: "Replace the red warning box above the stage with a slim glass studio status capsule"), UI 요소명(`navigation bar`, `primary call-to-action button`, `card layout`, `floating HUD`, `bottom sheet`)을 정확히 지목한다.
