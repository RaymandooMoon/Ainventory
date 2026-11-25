---
version: "v5"
name: "Ainventory — Haute Atelier Editorial System (Fashion Core v5)"
description: >
  High-fashion editorial, tactile, runway-calm private fitting studio & digital wardrobe system:
  Outfits-first default landing studio, 3D/2D digital closet, AI model virtual try-on,
  weather-aware styling, calendar lookbook and wardrobe statistics. Grounded in contemporary
  luxury fashion maison aesthetics — sculptural negative space, architectural hairline framing,
  kinetic silk motion, Paper White / Atelier Linen in light mode, and True OLED Black (#000000)
  in dark mode so garments, silhouettes, and skin tones hold 100% of the chroma.
  CRITICAL MANDATES:
  (1) Every screen across the entire app MUST feature the exact continuous one-line hanger-garments
      "iNVTRY" calligraphy logo (dual-theme transparent PNG assets) — NEVER substitute with plain text.
  (2) Stitch-First UI Evolution: ALL UI improvements, screen redesigns, and layout updates MUST
      use Google Stitch first and persist generated/edited screens in Stitch project
      projects/11505180160165595336 as the visual record before implementation.
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
  # Dark — "OLED Noir Runway" (Pixels off #000000 primary canvas)
  dark-canvas: "#000000"
  dark-surface: "#121214"
  dark-elevated: "#1C1C1E"
  dark-card: "#161618"
  dark-ink: "#F5F5F7"
  dark-ink-secondary: "#AEAEB2"
  dark-ink-tertiary: "#98989D"
  dark-hairline: "rgba(245, 245, 247, 0.14)"
  dark-primary: "#F5F5F7"
  dark-on-primary: "#000000"
  # Atelier accent (hairline/focus/logo-shadow only — never a loud fill for chrome)
  sand: "#D8C3A5"
  sand-ink: "#7A5F3E"
  # Semantic (validation & destructive only)
  danger: "#B42318"
  danger-dark: "#FF6961"
  success: "#1F6F43"
  success-dark: "#4ADE80"
  focus-ring: "#1D4ED8"
  focus-ring-dark: "#60A5FA"
  # Official Site Surface — "ainvtry.com · Spatial Editorial Noir" (src/site/styles/tokensAndShell.css)
  site-dark-canvas: "#000000"
  site-dark-panel-solid: "#141418"
  site-dark-ink: "#F5F5F7"
  site-dark-ctrl-active-bg: "#F5F5F7"
  site-dark-ctrl-active-fg: "#101013"
  site-dark-gold: "#D6B889"
  site-dark-gold-ink: "#E2CFA8"
  site-dark-status-live: "#68C694"
  site-light-canvas: "#F6F3EC"
  site-light-panel-solid: "#FAF8F4"
  site-light-ink: "#1D1D1F"
  site-light-ink-secondary: "#484642"
  site-light-ink-tertiary: "#63605A"
  site-light-ctrl-active-bg: "#1D1D1F"
  site-light-ctrl-active-fg: "#FAF8F4"
  site-light-gold: "#B8955F"
  site-light-gold-ink: "#73552B"
  site-light-status-live: "#1F6F43"
  site-light-status-hybrid: "#7C5C2E"
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
  site-hero-display:
    fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif"
    fontSize: "3.65rem"
    fontWeight: 700
    lineHeight: 1.09
    letterSpacing: "-0.036em"
  site-hero-editorial-accent:
    fontFamily: "'Instrument Serif', 'Cormorant Garamond', Georgia, serif"
    fontSize: "3.65rem"
    fontWeight: 400
    lineHeight: 1.09
    letterSpacing: "-0.016em"
  site-hero-subtitle:
    fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif"
    fontSize: "1.02rem"
    fontWeight: 480
    lineHeight: 1.56
    letterSpacing: "-0.012em"
  site-eyebrow:
    fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 680
    lineHeight: 1.2
    letterSpacing: "0.14em"
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
  site-cta-primary:
    backgroundColor: "{colors.site-dark-ctrl-active-bg}"
    textColor: "{colors.site-dark-ctrl-active-fg}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "46px"
    padding: "22px"
  site-cta-secondary:
    backgroundColor: "rgba(13, 13, 16, 0.46)"
    textColor: "{colors.site-dark-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "46px"
    padding: "22px"
  site-stage-dock:
    backgroundColor: "rgba(13, 13, 16, 0.46)"
    textColor: "{colors.site-dark-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "52px"
    padding: "3px"
  site-hud-panel:
    backgroundColor: "rgba(11, 11, 14, 0.47)"
    textColor: "{colors.site-dark-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.squircle}"
    padding: "20px"
---

## Overview

**Ainventory**는 내 옷을 사진 한 장으로 디지털화하고, **AI로 생성한 나만의 모델**에게 날씨와 일정에 맞는 착장을 입혀 보는 **프라이빗 피팅 스튜디오**다. 웹(GitHub Pages)과 Capacitor Android에서 동일하게 동작하는 모바일 우선 앱이며, 모든 제품 카피는 한국어로 작성한다.

### Brand Mood — 4 Fashion Editorial Pillars

| 형용사 | 의미 | 화면에서의 구현 |
| :--- | :--- | :--- |
| **Fashion-Forward Editorial** (하이패션 에디토리얼) | 럭셔리 패션 하우스 룩북·런웨이의 절제된 긴장감과 여백 | 로고 중심 오프닝(Boro식 침묵 + Rimowa식 상승 전환), `screen-title` 1개, 불필요한 배지·장식 태그·상태 캡슐 배제 |
| **Tactile** (촉각적) | 실크·오간자·리넨과 종이를 만지는 듯한 물성 | 스쿼클 카드의 상단 키라이트·1px 스펙큘러 림·접지 그림자, 탭 시 `scale(0.97)` 압축, 햅틱 `selection` |
| **OLED Noir & Daylight Calm** (순흑·백야의 고요함) | 다크모드 OLED 픽셀 오프(`#000000`) 순흑 스테이지와 종이 백색의 극단적 무채색 정제 | 무채색 크롬, 다크 배경 `#000000` 극대화(글래스/카드만 최소 1px 헤어라인 분리), 모션은 180–620ms 감속 스프링 |
| **Tailored Atelier** (맞춤 아틀리에) | 재단사의 작업실 — 리넨 호리존, 샌드 줄자, 행어 원라인 로고 `iNVTRY` | Outfits 스테이지 `#F4F0E8` 리넨 / `#000000` OLED 순흑 + 듀얼 테마 `"iNVTRY"` 로고(라이트 `#1D1D1F`+`#CCB596`, 다크 `#F5F5F7`+`#B29A7A`) |

### Default Theme, Whole-App Brand Mark & Stitch-First Governance (NON-NEGOTIABLE)
- **디폴트 테마**: 앱 최초 진입 시 항상 **`system`**(`ThemePreference = 'system'`)으로 동작해 OS 라이트/다크 설정을 즉시 따른다.
- **기본 진입 화면 (`Outfits` First)**: 로그인·샘플 옷장 진입·루트(`/`) 접속 시 첫 화면은 항상 **`Outfits` 스튜디오**다. 옷장(`Closet`)은 `/closet` 경로와 하단 탭에서 1탭으로 전환한다.
- **전체 앱 `"iNVTRY"` 로고 활용 & 스무스 상승 글라이드 (절대 망각 금지)**:
  - 서비스의 유일한 공식 로고는 다섯 개의 옷걸이와 의류 실루엣이 하나로 이어진 **원라인 캘리그라피 `"iNVTRY"` 로고**다(`public/assets/brand/invtry-logo-light.png` & `invtry-logo-dark.png`, `<BrandLogo />` 컴포넌트).
  - 로그인 화면에서 메인 화면으로 진입할 때, 로그인 화면의 `"iNVTRY"` 로고가 끊김 없이 메인 화면 **최상단 중앙 헤더 슬롯(top-center)으로 품격 있게 약간 축소되며 부드럽게 상승(FLIP Glide, `620ms cubic-bezier(0.22, 1, 0.36, 1)`)** 하여 정착한다. 상단 중앙 `"iNVTRY"` 로고는 어느 탭에서나 클릭 시 기본 화면(`Outfits`)으로 즉시 복귀한다.
  - 앞으로 신규 화면, 리디자인, Stitch 시안 생성, 앱 내 브랜딩 영역을 설계할 때 **반드시 전체 앱 전반에 이 공식 `"iNVTRY"` 로고를 일관되게 활용**해야 한다.
  - **금지 사항**: 로고 대신 일반 세리프/산세리프 폰트로 `"I N V T R Y"`, `"A INVENTORY"`, `"A inventory"` 또는 불필요한 `"MY WARDROBE"` 영문 헤더 타이틀을 남용하거나 로고를 누락해서는 절대 안 된다.
  - **듀얼 테마 색상 규약**: 라이트 모드에서는 카본 블랙(`#1D1D1F`) + 웜 샌드 오프셋(`#CCB596`), OLED 다크 모드에서는 알라바스터 화이트(`#F5F5F7`) + 샴페인 샌드 오프셋(`#B29A7A`)을 자동 전환한다.
- **Stitch-First UI 개선 & 영구 기록 의무 (MANDATORY)**:
  - 앞으로 **모든 UI 개선·신규 화면 설계·레이아웃 개편 시 반드시 Google Stitch를 먼저 활용**(`upload_design_md` → `generate_screen_from_text` / `edit_screens`)하여 시안을 제작·검증한 뒤 코드에 반영한다.
  - 모든 UI 변경 이력과 최종 확정 시안 스크린은 **Stitch 프로젝트(`projects/11505180160165595336`, `A inventory UI rev`)에 누락 없이 영구 기록·보존**해야 한다.

### Spatial Philosophy — "Gallery, Not Dashboard"
1. **옷과 사람이 주인공이다.** 화면 면적의 85% 이상(`minVisualRatio: 0.85`)은 의류 이미지·AI 모델·여백이 차지하고, 크롬(컨트롤)은 가장자리 글래스 HUD로 물러난다.
2. **세 개의 깊이 평면만 사용한다.** ① 캔버스(벽) ② 표면(카드·스테이지 — 바닥) ③ 플로팅 글래스(HUD·시트·탭 독 — 공중). 그 외 임의의 중간 평면·중첩 카드 금지.
3. **점진적 공개.** 1차 동작만 상시 노출하고, 2차 필터·고급 설정은 사용자가 맥락에 들어설 때(카테고리 선택, AI 모델 활성화) 슬라이드로 드러낸다.
4. **고정된 무대, 바뀌는 조명.** 상태가 바뀌어도 무대(레이아웃 박스)는 움직이지 않고, 조명(불투명도·블러·쉬머)과 내용만 바뀐다 → Zero-CLS.

### Source of Truth in Code
- 앱 아키텍처/DOM 계약: `src/contracts/carbonDesignContract.ts`
- 앱 전역 토큰·모션: `src/index.css` (`--bg-*`, `--ink-*`, `--space-*`, `--radius-*`, `--type-*`, `--spring-ease`)
- 앱 스튜디오 스코프 토큰: `src/styles/atelierTokens.css` (`--atelier-*`)
- 앱 UI 프리미티브: `src/components/ui/uiPrimitives.css`, `navigation.css`
- 공식 사이트(`ainvtry.com`) 토큰·셸·HUD·모달·반응형: `src/site/styles/tokensAndShell.css`, `stageHud.css`, `modalsAndAnalytics.css`, `responsive.css`
- 공식 사이트 헌장·사이트맵·로드맵: `.stitch/SITE.md`
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

### Dark — "OLED Noir Runway" (True `#000000` Background Priority)

다크 모드에서는 OLED 디스플레이의 서브픽셀이 완전히 소등되는 **완벽한 순흑(`#000000`)** 을 화면 캔버스와 주요 배경에 폭넓게 사용한다. 표면 위계는 두꺼운 회색 박스 대신 **순흑(`#000000`) 배경 + 미묘한 1px 헤어라인 및 최소 고도(`#121214` / `#1C1C1E`)** 로 구분한다.

| Role | Hex | CSS Variable | 용도 | 대비 |
| :--- | :--- | :--- | :--- | :--- |
| Canvas (OLED Off) | `#000000` | `--bg-canvas` | 앱 배경, 로그인 스테이지, Outfits 다크 스테이지 베이스 (OLED 완벽 소등) | `#F5F5F7` 19.56:1 |
| Surface | `#121214` / `#1C1C1E` | `--bg-surface` | 카드, 입력, 시트 (순흑 위 절제된 구분) | `#F5F5F7` 15.63:1+ |
| Elevated | `#2C2C2E` | `--bg-elevated` | 모달 내부 카드, 활성 세그먼트 | — |
| Studio Card | `#161618` | `--atelier-obsidian-card` | 드로어 카드 | `#D8C3A5` 10.6:1 |
| Ink Primary | `#F5F5F7` | `--ink-primary` | 제목·본문·1차 CTA 배경 | — |
| Ink Secondary | `#AEAEB2` | `--ink-secondary` | 보조 본문 | 9.2:1 on `#000000` |
| Ink Tertiary | `#98989D` | `--ink-muted` | 캡션 | 7.1:1 on `#000000` |
| Hairline | `rgba(245,245,247,0.14)` | `--hairline` | 순흑 위 미세 경계선 | — |

> Outfits 스테이지는 **라이트 모드에서 항상 리넨(`#F4F0E8`, 휘도 ≥ 225)** 을 유지하고, 다크 모드에서는 **OLED 순흑(`#000000 → #0C0C0E`)** 로 전환한다. 드로어는 양 모드 모두 스모크 글래스다.

### Atelier Accent & Semantic

| Role | Light | Dark | 규칙 |
| :--- | :--- | :--- | :--- |
| Sand (재단 줄자) | `#D8C3A5` 헤어라인 / 텍스트 시 `#7A5F3E` (5.23:1 on linen) | `#D8C3A5` (12.1:1 on `#000000`) | **채우기 금지.** 착용/포커스 링(2px), 날씨 큐레이션 점(6px), 진행 쉬머 하이라이트, 로고 오프셋 그림자에만 |
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

### Information Architecture (4-Tab · Outfits Default Home)
1. **코디 (`outfits`, 기본 홈 `/`)**: 상단 좌측 테마·새로고침 유틸리티 + **상단 중앙 클릭 가능한 `"iNVTRY"` 로고** + 우측 스토어·프로필·계정 설정 유틸리티 → 날씨·AI 스튜디오 무대(리넨 사이클로라마 / OLED 순흑 `#000000` / 오픈 스카이 S·A·B 야외 및 실내 배경 + 등급별 캐릭터 후광 `C/B/A/S`) + 스모크 글래스 드로어. `≥ 600px` 58:42 분할, 모바일은 스테이지 내부 좌하단 `Look 1/2` 도크와 대칭되는 **우하단 `"옷장 서랍 열기"` 아이콘 버튼**(각도 슬라이더 바로 위), 그리고 제목 클릭 시 펼쳐지는 검색 입력창(`"눌러서 검색"`)으로 서랍 공간을 극대화한다.
2. **옷장 (`closet`, `/closet`)**: **상단 중앙 `"iNVTRY"` 로고**(`MY WARDROBE` 문구 삭제, 클릭 시 `Outfits` 복귀) + 우측 검색·추가·프로필·설정(모바일 비겹침 40dp/48dp 히트박스) → 카테고리 레일 상단 우측/인라인 메타 슬롯에 `{N} ITEMS` 정숙 배치 → 단일 카테고리 레일 → 스쿼클 그리드(2→3→4열).
3. **캘린더 (`calendar`, `/calendar`)**: **상단 중앙 `"iNVTRY"` 로고** + 출석 체크 `i` 코인 리워드 배너 + 기록 건수 서브헤더 + 월간 룩북 그리드(착장 썸네일 셀) + 슬라이드 오버 데이 드로어.
4. **통계 (`stats`, `/stats`)**: **상단 중앙 `"iNVTRY"` 로고** + 벤토 카드(대표 수치 → 차트 → 랭킹) 에디토리얼 그리드.

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

### Login Atelier (2-Stage Boro Intro → Rimowa Reveal · Glamorous Runway Edition)
- **현재 로그인 패널 레이아웃 보존**: 중앙 정렬 단일 컬럼 글래스 모놀리스(`.atelier-monolith`) 구조와 구성 순서는 현행 구현을 그대로 유지한다.
- **화려한 키네틱 런웨이 백드롭 (`#login-wardrobe-motion-stage`)**: 라이트(`#FFFFFF → #F3F1EC`) 또는 다크 **OLED 순흑(`#000000`)** 캔버스 위에 ① 대각선 볼류메트릭 캣워크 스포트라이트 빔, ② 7중 오간자/실크 하모닉 리본 + 이중 스펙큘러 림, ③ 회전하는 미세 아틀리에 궤도 아크, ④ 샴페인 샌드·실버 보케 및 4각 쿠튀르 스타 글린트가 입체적으로 흐른다. 상단 라이브 상태 캡슐·보조 브랜드 마크·서브타이틀 문구는 모두 제거해 순수 패션 하우스 오프닝을 유지한다.
- **Stage 1 — Intro (`Get started`)**:
  - 즉시 로그인 폼을 띄우지 않는다.
  - 화면 정중앙에 듀얼 테마 `"iNVTRY"` 행어 원라인 로고만 크게 배치하고, 하단 안전 영역에 단일 pill 버튼 **`Get started`**(국문: `시작하기`)만 고정한다. 우측 상단에는 테마/언어 유틸리티 버튼만 절제해 둔다.
- **Stage 2 — Rimowa-Style Reveal Transition**:
  - `Get started` 클릭 시 중앙의 `"iNVTRY"` 로고가 `transform: translate3d(...) scale(...)`로 상단 헤더 위치까지 부드럽게 미끄러져 올라가며, 동시에 로그인 모놀리스 패널과 약관 푸터가 아래에서 위로(`translate3d(0, 96px, 0) → 0`) 올라오면서 **투명(`opacity: 0`)에서 불투명(`opacity: 1`)으로** 자연스럽게 전환된다 (`680ms cubic-bezier(0.16, 1, 0.3, 1)`).
- **Auth Panel 순서**: 듀얼 테마 `iNVTRY` 로고 → **Google 계정으로 로그인**(최상단 1순위) → Apple 로그인 → `또는` 구분선 → 로그인/회원가입 세그먼트 → 폼 → 샘플 옷장 체험(보조 텍스트 버튼).
- **Google 버튼**: 공식 4색 G 로고 SVG(18px, 색 변경 금지), 라이트 `#FFFFFF` 배경 + `#747775` 1px 테두리 + `#1F1F1F` 텍스트(16.48:1), 다크 `#131314` 배경 + `#8E918F` 테두리 + `#E3E3E3` 텍스트(14.47:1). 높이 48px, pill, 라벨 `Google 계정으로 로그인`.
- **오류**: 필드 오류는 필드 하단 `caption` + danger 잉크. 시스템 오류는 폼 하단 **인라인 노트**(surface 배경, 14px 아이콘, 1–2줄, 우측 텍스트 버튼 `다시 시도`). 상단을 밀어내는 경고 카드 금지.

### Closet (`/closet`)
- **헤더 정돈**: 기존의 큰 `"MY WARDROBE"` 영문 타이틀은 제거하고 좌측에 공식 `"iNVTRY"` 로고를 배치한다. 우측 유틸리티 버튼(검색·`+`·프로필·계정 설정)은 모바일 360–393px 폭에서도 좌측 로고와 최소 12px 이상 여유 간격을 유지한다(프로필 스와치는 `< 480px`에서 콤팩트 서클 아바타로 축약하되 48dp 터치 영역 보장).
- **`{N} ITEMS` 카운터 위치**: 상단 우측 버튼과 충돌하지 않도록 카테고리 레일과 짝을 이루는 서브 헤더 우측(`tabular-nums`) 또는 필터 레일 인라인 메타 텍스트로 정갈하게 배치한다.
- **단일 카테고리 레일**: 40px 필, 간격 8px, 활성은 대비 반전 + 체크 없는 굵은 라벨. 주얼리는 레일 말미 필로 흡수.
- **서브파트 레일**: 액세서리/주얼리 선택 시에만 180ms 슬라이드 다운(높이는 예약 슬롯 내 opacity 전환).
- **스쿼클 카드**: 1:1, `#F5F5F7` / 다크 `#161618`, 22px, 의류 13% 패딩, 하단 2줄 메타(이름 640 / 브랜드 `#636366`), 착용 배지(`3회`, tabular).

### Outfits — AI Model Studio (Default Home `/`)
- **상단 헤더 3-칼럼 중앙 로고 규칙**: 좌/우 유틸리티 버튼(`테마`, `새로고침`, `초기화`, `배경 스토어`, `프로필 스와치`, `계정 설정`)을 양측에 균형 배치하고, 공식 `"iNVTRY"` 로고를 최상단 정중앙에 배치한다(클릭 시 `Outfits` 기본 화면 복귀).
- **플랫레이 ↔ AI 캐릭터 동일 무대 규격 & 자동 전환 룩북**:
  - 플랫레이 룩북(`.editorial-flatlay-board`)은 AI 캐릭터 무대와 **동일한 외곽 크기·패딩·20px 라운드**를 유지한다.
  - 로그인 직후 `Look 1`을 우선 스태거 카드로 노출하고(`Look 1/2` 도크로 즉시 전환 가능), 사용자가 편집하지 않으면 비차단 로딩 진행 바와 함께 AI 캐릭터 렌더링 완료 즉시 자연스럽게 전환된다.
- **오픈 스카이 야외 배경(S/A/B) & 등급별 캐릭터 후광(Aura)**:
  - `S(s_palais_royal_outdoor)`, `A(a_sunset_rooftop, a_hannam_terrace_outdoor)`, `B(b_brick_courtyard, b_stone_courtyard_outdoor, b_seoul_plaza_outdoor)` 오픈 스카이 배경은 하늘/날씨 효과를 그대로 적용하고, 실내는 간접 전구색 라이팅을 유지한다.
  - 캐릭터 뒤 후광(`.studio-stage-aura[data-aura-tier="C|B|A|S"]`)은 **C 없음**, **B 미세 림 & 반짝임**, **A 선명한 실루엣 후광 & 글린트**, **S 고급 쿠튀르 방사형 후광 & 입체 쉬머**를 무채·실버·아이보리 톤으로 적용한다.
- **스테이지 HUD 테마·투명도 연동 & 우하단 서랍 아이콘**:
  - 무대 위 모든 글래스 HUD·캡슐·도크·각도 슬라이더·의류 선택 팝업은 라이트/다크 테마 및 `--hig-nav-bg-opacity`(`15%~100%`)와 정밀 연동되며, 터치/슬라이드 시 미세 확대(`scale 1.04~1.06`) 및 `selection` 햅틱 피드백을 제공한다.
  - 모바일 하단 `"옷장 서랍 열기"`는 무대 아래 바를 제거하고, 스테이지 내부 **우하단(각도 슬라이더 바로 위)** 콤팩트 아이콘 버튼으로 배치해 좌하단 `Look 1/2` 도크와 시각적 균형을 이룬다.
- **무대 레이어**: z-0 사이클로라마/배경(라이트 `#F4F0E8` / 다크 OLED 순흑 `#000000`→`#0A0A0C`) → z-10 접지 데크 → z-18 등급별 후광 → z-20 모델/플랫레이 → z-30 날씨 캔버스 → z-55 HUD.
- **3D 각도 독**: AI 모델 뷰(이미지 존재·생성 중·샘플)에서만 노출. 플랫레이 룩북에서는 같은 높이의 빈 슬롯을 유지한 채 `opacity: 0; visibility: hidden; inert`. (통신/품질 실패 3회 후 정면 전용 폴백 시 3초 토스트와 함께 임시 숨김)
- **Profile Studio Sheet (보존)**: 피부톤 MST 1–10 스와치 행(각 48dp), 체형 슬라이더(cm/kg tabular), 주 사용 손(`오른손잡이`/`왼손잡이`), AI 스타일(캐릭터/실사).
- **팩샷 카드**: 라이트 `#F7F7F5` / 다크 OLED `#161618` + `1px solid rgba(245,245,247,0.12)` 헤어라인, 14px 라운드, 착용 시 샌드 2px 링.

### Calendar Lookbook
- 7열 그리드, 셀 간격 8px, 셀 14px 반경, 날짜 `metric-inline` 좌상단, 착장 썸네일 8px 반경 하단 정렬. 오늘은 잉크 2px 링(색 이외 단서), 선택은 대비 반전 날짜 배지.
- 월 타이틀 `screen-title`, 요일 헤더 `kicker`.

### Stats Bento
- 2열(모바일) / 3열(태블릿+) 벤토, 카드 22px 반경, 패딩 24px, 간격 16px.
- 카드 내부 위계: `kicker` 라벨 → `display-metric` 대표 수치(tabular) + 단위 `caption` → 차트/랭킹. 수치 정렬은 오른쪽 정렬 + tabular.

### Inline Note / Status Capsule (공통)
- 정보성 안내는 항상 무채색 + `role="status"` + `aria-live="polite"`. `role="alert"`는 사용자의 즉시 행동이 필요한 파괴적/차단 오류에만.

## Imagery — Theme-Coordinated Packshots

- **배경 톤 일치**: 의류 팩샷은 누끼(`image/webp`, 투명) 후 테마 표면 위에 놓는다. 라이트: 옷장 `#F5F5F7`, 드로어 `#F7F7F5`, 스테이지 `#F4F0E8`. 다크: `#121214` / `#161618` / `#000000` (OLED 순흑). 흰 배경이 박힌 원본 사진은 `mix-blend-mode: multiply`(라이트 한정) 또는 표면색 패딩으로 경계를 숨긴다.
- **조명 방향 통일**: 모든 2.5D 카드·AI 모델·아바타 실루엣은 **좌상단 45° 키라이트**, 우하단 접지 그림자. 다크 모드에서는 키라이트 강도 −40%, 림 라이트(스펙큘러) 유지.
- **AI 모델 실루엣 조명**: 라이트 = 리넨 반사광의 따뜻한 화이트, 다크 = OLED 순흑 위 샌드 림 라이트. 생성 쉬머 색도 동일 계열.
- **아이콘**: Lucide 1.75–2.1 stroke, 잉크 색 상속(`currentColor`). 유채색 아이콘 금지(Google G 로고만 예외).
- **날씨와 이미지**: 비 → 젖은 바닥 반사(데크), 맑음 → 웜 글로우, 눈 → 화이트 베일. 의류 이미지 자체 색은 오버레이로 왜곡하지 않는다(오버레이는 z-30, 텍스트·이미지 대비 규칙 준수).

## Motion — Zero-CLS Rules

- **커브**: `--spring-ease: cubic-bezier(0.32, 0.72, 0, 1)` (인트로→로그인 리빌 및 원형 테마 전환은 `cubic-bezier(0.22, 1, 0.36, 1)`). 지속시간: 마이크로 120–180ms, 전환 240ms, 시트 340–360ms, 원형 테마 팽창 640ms, 인트로 리빌 680ms.
- **원형 확산 테마 전환 (Circular Button-Origin Theme Ripple)**:
  - 라이트 ↔ 다크 전환 버튼(로그인 상단바, 앱 헤더 유틸리티, 계정 설정 화면 테마 버튼 등)을 누르면 클릭된 버튼의 중심 좌표 `(cx, cy)` 에서 **`circle(0px at cx cy) → circle(maxR at cx cy)`** 원형 파동이 View Transitions API(`::view-transition-new(root)`)로 바깥까지 부드럽게 커지며 테마와 `"iNVTRY"` 로고 컬러, 캔버스를 즉시 전환한다.
  - `prefers-reduced-motion: reduce`에서는 원형 확산을 생략하고 즉각 전환한다.
- **애니메이션 허용 속성은 `opacity`, `transform`, `filter`, `clip-path` 뿐.** `height/width/top/margin` 애니메이션 금지.
- **예약 슬롯**: 조건부 UI(상태 캡슐, Staged CTA, 각도 독, 서브파트 레일)는 항상 고정 크기 컨테이너를 렌더하고 내부만 crossfade. 마운트/언마운트로 형제 요소를 밀어내지 않는다.
- **이미지 박스**: 모든 이미지 컨테이너에 `aspect-ratio` 명시. 로딩은 스켈레톤 쉬머(같은 크기).
- **숫자**: tabular-nums로 폭 고정, 카운트업 애니메이션 시에도 폭 불변.
- **상태 전환 매트릭스 (Outfits)**: 플랫레이 ↔ 생성 중 ↔ AI 모델 뷰 ↔ 피부톤/체형 시트 — 무대 박스 크기·HUD 위치 변화 0px, 바뀌는 것은 무대 내용(crossfade 240ms)과 HUD 내용뿐.
- `prefers-reduced-motion: reduce` → 쉬머·스윕·파티클·원형 확산 정지, crossfade만 120ms.

## Official Site Surface — `ainvtry.com` (Spatial Editorial Noir)

공식 제품 쇼케이스 사이트(`site/index.html`, `src/site/`, 빌드 `vite.site.config.ts`)는 모바일 앱과 동일한 **무채색 미니멀 · 동심원 스쿼클 · `iNVTRY` 원라인 로고** 계약을 계승하되, 단일 뷰포트(`100dvh`) 3D 실크·마블 런웨이 캔버스 위에 부유하는 **Spatial Editorial Noir** 프로스트 글래스 셸을 정의한다. (상세 IA·사이트맵·로드맵: `.stitch/SITE.md`)

### Site Color Palette & Glass Materiality (`src/site/styles/tokensAndShell.css`)

| Role | Dark Default ("OLED Obsidian Glass") | Light ("Warm Alabaster Daylight") | CSS Variable | 용도 |
| :--- | :--- | :--- | :--- | :--- |
| Canvas | `#000000` (True OLED Black) | `#F6F3EC` (Warm Alabaster) | `--bg-canvas` | 3D 실크/마블 배경 아래 기본 캔버스 |
| Glass Chrome | `rgba(13,13,16, 0.03 + α×0.86)` (`#141418` solid 폴백) | `rgba(252,250,246, 0.05 + α×0.87)` (`#FAF8F4` solid 폴백) | `--bg-glass` | 탑바 유틸리티 레일, 하단 4스테이지 독, 보조 CTA |
| Inspector Panel | `rgba(11,11,14, 0.03 + α×0.88)` | `rgba(252,250,246, 0.05 + α×0.89)` | `--bg-panel` | 우측 3D HUD 패널, 푸터 트레이, 모달 카드 |
| Ink Primary | `#F5F5F7` | `#1D1D1F` | `--ink-primary` | 히어로 헤드라인, 패널 제목 |
| Ink Secondary | `rgba(235,235,240,0.78)` | `#484642` | `--ink-secondary` | 서브타이틀, 본문, 비활성 탭 |
| Ink Tertiary | `rgba(206,206,216,0.68)` | `#63605A` | `--ink-tertiary` | 키커, 저작권, 메타데이터 |
| Active Chrome (Inverted) | `#F5F5F7` bg / `#101013` ink | `#1D1D1F` bg / `#FAF8F4` ink | `--ctrl-active-bg/fg` | `01 Live Studio` 론치 필, 1차 CTA, 활성 세그먼트 |
| Champagne Gold Accent | `#D6B889` / ink `#E2CFA8` | `#B8955F` / ink `#73552B` | `--accent-gold` / `-ink` | 헤어라인, 활성 언더라인, 히어로 이탤릭 포인트, Glass 미터 |
| Status Live / Hybrid | `#68C694` / `#D6B889` | `#1F6F43` / `#7C5C2E` | `--status-live/hybrid` | 6컷 저니·API 파이프라인 상태 배지 |
| Focus Ring | `#60A5FA` | `#1D4ED8` | `--focus-ring` | 키보드 `:focus-visible` 2px 링 + 2px 오프셋 |

- **동적 글래스 알파 (`--site-ui-alpha`)**: 기본값 `0.5` (`Glass 50%`), 범위 `0.02–0.96`. 우하단 수직 드래그/휠 슬라이더로 모든 글래스 표면의 불투명도(`--bg-glass`, `--bg-panel`)와 블러(`calc(2px + α × 26px)`)를 실시간 연동한다.
- **앱 Sand(`#D8C3A5`) vs 사이트 Champagne Gold(`#D6B889`) 정렬 메모**: 현재 공식 사이트는 에디토리얼 웜 톤을 위해 `#D6B889`를 사용하며, 앱 스튜디오는 `#D8C3A5`를 사용한다. 향후 토큰 통합 또는 의도적 분리(마케팅 vs 앱) 여부를 디자인 시스템 버전업 시 명시적으로 관리한다.

### Site Typography, Geometry & Layout
- **Sans Stack**: `'Pretendard Variable', 'Pretendard', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif` (EN/KO 이중 언어 지원, `word-break: keep-all`).
- **Editorial Italic Accent**: 현재 코드(`tokensAndShell.css` L11)는 `Georgia, 'Times New Roman', serif`를 사용 중이나, `taste-design` 기준에 따라 **라틴 이탤릭 포인트는 `Instrument Serif` 또는 `Cormorant Garamond` 등 모던 에디토리얼 세리프로 고도화**한다(한글 강조는 Pretendard 유지).
- **Scale**: 히어로 타이틀 `clamp(2.15rem, 4.25vw, 3.65rem)` (700, `-0.036em`, line-height `1.09`), 서브타이틀 `clamp(0.9rem, 1.24vw, 1.02rem)` (480, `1.56`, `max-width: 500px`), 키커 `0.7rem` (680, `+0.14em`, 대문자). 수치(`01`–`04`, `Glass %`, KPI, 각도)는 예외 없이 `tabular-nums`.
- **Concentric Radii**: 앱과 100% 동일 (`--r-micro: 8px`, `--r-sm: 10px`, `--r-md: 14px`, `--r-panel: 22px`, `--r-lg: 26px`, `--r-pill: 9999px`).
- **Shell & Components**:
  - **Zero-Chrome 3-Column Topbar** (`max-width: 1320px`): 좌(테마 + 3D 실크 무드 필 레일) · 중(공식 듀얼 테마 `iNVTRY` 로고 `width: 108px` + 서브스테이지 복귀 콜아웃) · 우(`EN/KO` 전환 필).
  - **4-Stage Hairline Bottom Dock** (`max-width: 760px`): `01 Live Studio`(반전 1차 론치 필) · `02 Architecture` · `03 Specs` · `04 About` + 전환 시 골드 리플 버스트.
  - **Right Floating Inspector HUD** (`clamp(390px, 37vw, 536px)`): FLIP 애니메이션 `HudSpotlightDeck` + 상단 3D 컨트롤 독(`.site-top-3d-dock`).
  - **Full-Bleed Bottombar Tray**: 저작권, `raymond@ainvtry.com`, 뉴스레터 모달, 개인정보/약관 모달, 세션 분석 차트 모달, 수직 드래그 `Glass %` 슬라이더.
- **Responsive Breakpoints & Fallbacks**: `<= 1080px`(컴팩트 데스크톱 HUD) · `<= 859px`(태블릿/폴더블 분할 드로어) · `<= 520px`(About 바텀시트) · `<= 359px`(폴드 커버 320px), 전 컨트롤 최소 `44px` 터치 타깃, `html[data-vibrancy-fallback='solid']` 및 `prefers-reduced-transparency` / `prefers-reduced-motion` 완전 지원.
- **현행 사이트 감사 메모 (차기 Stitch 개선 대상)**:
  1. Hero에 1차 제품 진입 CTA(`Launch Live Studio`)가 제거되어 `Contact Founder` 보조 버튼만 노출 중이며, 미사용 `HeroVisualProofCard.tsx`(226줄) 및 `.site-hero-proof-*` CSS(~350줄)가 잔존 → `.stitch/next-prompt.md`의 2종 시안으로 정리 예정.
  2. `/ir/` IR 사업계획서 링크가 `About -> Model` 최하단에만 위치 → 상단/푸터 발견성 검토.
  3. `SiteStageAnalytics.tsx` 모달에 키보드 `Tab` 포커스 트랩 보강 필요(`SiteNewsletterModal.tsx` 수준과 통일).

## Do's and Don'ts

### Do's
- 크롬은 무채색(`#FFFFFF`/`#F5F5F7`/`#1D1D1F`, 다크 `#000000` OLED 순흑/`#121214`/`#F5F5F7`), 색은 옷·피부·날씨에서만.
- 모든 수치에 `tabular-nums`, 모든 타깃 48dp, 모든 간격 8pt 스케일.
- 상태는 1줄 캡슐로 조용히, 다음 행동은 하나의 명확한 CTA로.
- 조건부 UI는 예약 슬롯에서 crossfade (Zero-CLS).
- 모든 카피는 자연스러운 한국어(숫자·단위·브랜드명만 예외), 기술 용어(누끼, 크레딧, V7, reason code) 사용자 노출 금지.
- `html[data-vibrancy-fallback='solid']`, `prefers-reduced-motion`, `prefers-reduced-transparency`, safe-area 항상 지원.

### Don'ts
- 붉은 점·붉은 박스로 정보성 상태(API 키 미설정 등)를 알리지 않는다.
- 로그인 화면에 불필요한 라이브 상태 필·보조 브랜드 배지·장식 서브타이틀을 중복 노출하지 않는다.
- 플랫레이 룩북에 3D 각도 컨트롤을 노출하지 않는다.
- 같은 의미의 필터 축을 두 줄 이상 동시에 노출하지 않는다.
- 웜골드·보라-파랑 그라디언트·네온 액센트를 크롬에 넣지 않는다. 샌드는 헤어라인/점/로고 오프셋 그림자만.
- 라이트 모드 Outfits 스테이지를 어둡게 만들지 않는다.
- 날씨 오버레이 위에 HUD 없이 텍스트를 직접 올리지 않는다.
- 임의 반경(9/11/12/13/18px), 스케일 밖 간격(2/3/5/6px)을 새로 도입하지 않는다.

## Stitch Generation Notes (for screen prompts)

### App Screens (`Ainventory — Haute Atelier v5`)
- 기본 바이브 문구: *"High-fashion luxury maison editorial private fitting studio; minimal runway silhouette framing, dramatic volumetric spotlight beams & kinetic silk/organza motion; monochrome chrome on paper white #FFFFFF, gallery gray #F5F5F7 and warm linen #F4F0E8 (dark: true OLED black #000000 pixels-off primary background, deep surface #121214, elevated #1C1C1E); sand #D8C3A5 hairline accents only; MANDATORY: always display the exact continuous one-line hanger-garments 'iNVTRY' calligraphy logo mark across every screen (never replace with generic serif/sans text); Keep all product copy and button text in Korean."*
- 이미지 일체화: *"Garment packshot cards use #F7F7F5 backgrounds with transparent cutouts and a soft top-left key light; AI model silhouette lit with warm linen bounce light (dark: sand rim light on pure OLED black #000000); icons inherit ink color."*
- 정제는 `edit_screens`로 프롬프트당 1–2개 요소만(예: "Replace generic text header with the exact continuous one-line hanger-garments iNVTRY logo"), UI 요소명(`navigation bar`, `primary call-to-action button`, `card layout`, `floating HUD`, `bottom sheet`)을 정확히 지목한다.

### Official Site (`ainvtry.com — Spatial Editorial Noir`)
- **MCP 바운드 생성 시 (`designSystem: "assets/98bc4c44edea4f0898f4a037ca720090"` 전달)**: `generate-design` 원칙에 따라 생성 프롬프트에는 hex 코드·폰트명을 중복 기재하지 않고 **레이아웃·섹션 구조·인터랙션·카피**만 기술한다 (예시: `.stitch/next-prompt.md`).
- **언바운드 / 웹 UI 직접 투입 시 기본 바이브 문구**: *"Spatial Editorial Noir single-viewport (100dvh) luxury fashion tech showcase for Ainvtry (ainvtry.com); dark default true OLED black #000000 canvas behind atmospheric kinetic 3D silk and rolling obsidian marble (light mode: warm alabaster #F6F3EC); translucent obsidian frosted-glass chrome with 1px specular hairline rims and concentric squircle geometry (22px panels, 14px cards, pill CTAs); inverted alabaster white #F5F5F7 primary CTA with #101013 ink; restrained champagne gold #D6B889 hairlines and modern editorial italic serif accent only (no neon/purple gradients, no emojis, no generic 3-equal-card rows, no scroll-down filler text); MANDATORY: centered continuous one-line hanger-garments 'iNVTRY' calligraphy logo in the zero-chrome 3-column header; real verified metrics in tabular numerals only."*
