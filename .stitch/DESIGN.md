---
version: "alpha"
name: "Ainventory — Apple HIG Monochrome & 2.5D Atelier System"
description: >
  Tactile Apple HIG monochrome digital wardrobe and 2.5D/3D styling studio combining a
  Warm Alabaster Atelier light theme and Obsidian Gallery OLED dark theme with a
  scoped warm-beige cyclorama and smoked-glass Outfits studio.
colors:
  primary: "#1D1D1F"
  on-primary: "#FFFFFF"
  canvas: "#FAFBFD"
  surface: "#F5F5F7"
  surface-tertiary: "#E8E8ED"
  secondary: "#515154"
  muted: "#6E6E73"
  dark-canvas: "#000000"
  dark-surface: "#161618"
  dark-elevated: "#1C1C1F"
  dark-ink: "#F5F5F7"
  dark-muted: "#AEAEB2"
  atelier-obsidian: "#141413"
  atelier-cyclorama: "#F4F0E8"
  atelier-packshot: "#F7F7F5"
  atelier-sand: "#D8C3A5"
  atelier-ink-light: "#1D1C1A"
  danger: "#B91C1C"
  danger-surface: "#FEF2F2"
  success: "#065F46"
  success-surface: "#ECFDF5"
  info: "#1D4ED8"
  info-surface: "#EFF6FF"
typography:
  hero:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 750
    lineHeight: 1.08
    letterSpacing: "-0.034em"
  screen-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 740
    lineHeight: 1.12
    letterSpacing: "-0.032em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 680
    lineHeight: 1.24
    letterSpacing: "-0.022em"
  body-md:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 500
    lineHeight: 1.48
    letterSpacing: "-0.014em"
    fontFeature: "tnum"
  label-md:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 640
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 540
    lineHeight: 1.42
    letterSpacing: "-0.008em"
  kicker-caps:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.085em"
  mono-metric:
    fontFamily: "'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0em"
    fontFeature: "tnum"
rounded:
  sm: "10px"
  md: "14px"
  squircle: "22px"
  lg: "26px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "40px"
  touch: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "22px"
  button-primary-dark:
    backgroundColor: "{colors.dark-ink}"
    textColor: "{colors.dark-canvas}"
    typography: "{typography.label-md}"
    rounded: "{rounded.pill}"
    height: "48px"
    padding: "22px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "18px"
  button-destructive:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.md}"
    height: "48px"
    padding: "18px"
  squircle-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.squircle}"
    padding: "12px"
  squircle-card-dark:
    backgroundColor: "{colors.dark-elevated}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.body-md}"
    rounded: "{rounded.squircle}"
    padding: "12px"
  filter-pill-inactive:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.pill}"
    height: "38px"
    padding: "16px"
  filter-pill-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.pill}"
    height: "38px"
    padding: "16px"
  floating-tabbar-dock:
    backgroundColor: "{colors.on-primary}"
    textColor: "{colors.secondary}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "8px"
  bottom-sheet-light:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "24px"
  bottom-sheet-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-muted}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "24px"
  atelier-stage-canvas:
    backgroundColor: "{colors.atelier-cyclorama}"
    textColor: "{colors.atelier-ink-light}"
    typography: "{typography.headline}"
    rounded: "{rounded.lg}"
    padding: "16px"
  atelier-drawer:
    backgroundColor: "{colors.atelier-obsidian}"
    textColor: "{colors.atelier-sand}"
    typography: "{typography.mono-metric}"
    rounded: "{rounded.lg}"
    padding: "16px"
  atelier-packshot-card:
    backgroundColor: "{colors.atelier-packshot}"
    textColor: "{colors.atelier-obsidian}"
    typography: "{typography.caption}"
    rounded: "{rounded.md}"
    padding: "8px"
  badge-neutral:
    backgroundColor: "{colors.surface-tertiary}"
    textColor: "{colors.secondary}"
    typography: "{typography.kicker-caps}"
    rounded: "{rounded.pill}"
    padding: "4px"
  badge-success:
    backgroundColor: "{colors.success-surface}"
    textColor: "{colors.success}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "4px"
  badge-danger:
    backgroundColor: "{colors.danger-surface}"
    textColor: "{colors.danger}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "4px"
  badge-info:
    backgroundColor: "{colors.info-surface}"
    textColor: "{colors.info}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "4px"
  kicker-label:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.muted}"
    typography: "{typography.kicker-caps}"
    rounded: "{rounded.sm}"
    padding: "4px"
---

## Overview

**Ainventory** is an Apple HIG-inspired monochrome digital wardrobe, 3D/2.5D styling studio, and offline shopping duplicate checker built as a responsive mobile-first web and Capacitor Android application.

- **Aesthetic Direction:** **Warm Alabaster Atelier** (Light) paired with **Obsidian Gallery** (OLED Dark), anchoring garment photographs and 3D avatars against restrained neutral architecture so real textiles, silhouettes, and skin tones carry 100% of the visual chroma.
- **Source of Truth in Code:**
  - Architectural contract: `src/contracts/carbonDesignContract.ts`
  - Global palette & motion curves: `src/index.css`
  - Scoped Outfits & Profile Studio tokens: `src/styles/atelierTokens.css`, `src/components/OutfitWardrobeDrawer.css`
  - Navigation & Accessible UI primitives: `src/components/ui/navigation.css`, `src/components/ui/uiPrimitives.css`
- **Visual-First Mandate (`minVisualRatio: 0.85`):** Keep screens airy and editorial. Avoid noisy chrome, multi-accent rainbows, and boxed dashboard templates; communicate hierarchy via crisp weight/scale contrast, translucent vibrancy, and tactile 2.5D elevation.

## Colors

All global UI chrome stays strictly monochrome (`#1D1D1F` ink on alabaster/white in Light; `#F5F5F7` ink on OLED `#000000`/`#161618` in Dark). Semantic hues exist solely for validation, focus rings, destructive confirmations, and garment color chips.

### Core Dual-Theme Tokens (`src/index.css` & `carbonDesignContract.ts`)

| Role | Light ("Warm Alabaster Atelier") | Dark ("Obsidian Gallery") | CSS Variable |
| :--- | :--- | :--- | :--- |
| App Canvas | `#FAFBFD` (contract `#FFFFFF` baseline) | `#000000` (pure OLED) | `--bg-canvas` |
| Surface / 2.5D Squircle | `#F5F5F7` | `#161618` / `#1C1C1E` (squircle) | `--bg-surface`, `--squircle-bg-color` |
| Elevated Modal / Card | `#FFFFFF` | `#1C1C1F` | `--bg-elevated`, `--card-bg` |
| Tertiary Fill | `#E8E8ED` | `#2A2A2E` | `--bg-tertiary` |
| Primary Ink | `#1D1D1F` | `#F5F5F7` | `--ink-primary` |
| Secondary Ink (WCAG AA/AAA) | `#515154` | `#AEAEB2` | `--ink-secondary` |
| Muted / Kicker Ink (WCAG AA) | `#6E6E73` | `#98989D` | `--ink-muted` |
| Monochrome CTA / Active Pill | `#1D1D1F` (ink `#FFFFFF`) | `#F5F5F7` (ink `#000000`) | `--accent-mono`, `--accent-mono-ink` |
| Refractive Glass Surface | `rgba(255, 255, 255, 0.78)` | `rgba(24, 24, 28, 0.80)` | `--glass-bg` |
| Solid GPU Fallback | `#F9F9FB` | `#1C1C1F` | `--glass-bg-solid-fallback` |
| Danger Ink | `#D70015` (UI solid `#B91C1C`) | `#FF453A` (UI solid `#EF4444`) | `--danger-ink`, `--ui-danger-solid` |
| Success Ink | `#166534` (badge `#065F46`) | `#32D74B` (badge `#6EE7B7`) | `--success-ink`, `--ui-badge-success-ink` |
| Keyboard Focus Ring | `#1D4ED8` | `#60A5FA` | `--ui-focus-ring` |

### Scoped Outfits Studio & Profile Sheet (`src/styles/atelierTokens.css`)

- **Obsidian Studio Drawer & Profile Sheet:** `#141413` (`--atelier-obsidian-bg`), `#1C1C1A` (`--atelier-obsidian-elevated`), `#21201E` (`--atelier-obsidian-card`), smoked-glass backdrop `rgba(20, 20, 19, 0.80)` with `blur(24px) saturate(135%)` (`--atelier-drawer-blur`).
- **Warm Beige Cyclorama Stage (Light Mode Invariant):** `#F4F0E8` base -> `#ECE7DD` mid -> `#E6E0D5` horizon shadow (`luminance >= 225` safety floor verified by E2E; dark mode switches to `#141413` -> `#1B1A18`). Rain overlay `rgba(14, 16, 20, 0.22)` activates strictly when `weather === 'rain'`.
- **Packshot Garment Cards:** Crisp off-white `#F7F7F5` (`#FFFFFF` on active/focus) framed by `#D8C3A5` (`--atelier-packshot-focus-ring`) and `#FFFFFF` outer halo.

## Typography

Ainventory pairs **SF Pro Display / Apple system sans** for English & geometric optical clarity with **Pretendard Variable** for balanced Hangul legibility, and **JetBrains Mono** inside editorial measurement readouts.

- **Global Tabular Alignment:** `font-variant-numeric: tabular-nums` and OpenType features `'cv11', 'ss01'` are enforced globally across counters, CPW prices, temperature chips, calendar dates, and body anthropometrics.
- **Fluid CSS Clamps (`src/index.css`):**
  - `--type-hero`: `clamp(1.82rem, 3.1vw, 2.28rem)`, tight negative tracking `-0.034em`
  - `--type-screen-title`: `clamp(1.46rem, 2.5vw, 1.92rem)`, weight `740–750`, tracking `-0.032em`
  - `--type-title-md`: `clamp(1.06rem, 1.5vw, 1.2rem)`, weight `680`, tracking `-0.022em`
  - `--type-body`: `0.9375rem` (`15px`), line-height `1.48–1.50` (`TouchInput` controls use `1rem` / `16px` to prevent iOS Safari auto-zoom)
  - `--type-label`: `0.8125rem` (`13px`)
  - `--type-caption`: `0.78rem`
  - `--type-micro` (`.hig-kicker` / `.hig-eyebrow`): `0.6875rem` (`11px`), weight `700`, uppercase, wide `+0.085em` letter spacing

## Layout

### Spatial Rhythm & 8pt Grid

- Base unit is `8px` (`gridUnitPt: 8`) with immutable scale `[4, 8, 16, 24, 32, 40, 48]` (`--space-1` through `--space-12`).
- Minimum physical hit area is **`44px`** per Apple HIG contract (`--touch-target`) and **`48x48dp`** (`>= 8px` inter-control gap) for navigation docks, top utility buttons, and UI primitives (`uiPrimitives.css`, `navigation.css`).

### Information Architecture (4-Tab Model)

1. **`Closet` (`closet`):** Large display header + item count badge + quick add icon button + horizontal 6-pill taxonomy rail (`All`, `Tops`, `Bottoms`, `Outerwear`, `Shoes`, `Accessories`) + responsive 2.5D squircle grid (`2` -> `3` -> `4` columns).
2. **`Outfits` (`outfits`):** Compact Atelier utility bar + weather curation strip + **`58fr : 42fr` split 3D mannequin cyclorama and smoked-glass wardrobe drawer** (`>= 600px`), collapsing cleanly to a full-width 3D stage plus expandable smoked-glass bottom sheet (`#outfit-mobile-wardrobe-sheet`) on narrow mobile (`< 600px`).
3. **`Calendar` (`calendar`):** Daily look planner & travel packing checklist powered by local SQLite + IndexedDB offline queue.
4. **`Stats` (`stats`):** Tabular-numeric wardrobe utilization, cost-per-wear (CPW), and duplicate-purchase insights.

### Responsive Breakpoints & Safe Areas

- **Safe-area padding:** `.hig-native-viewport` respects `env(safe-area-inset-top/right/bottom/left)` with bottom dock clearance `calc(112px + var(--safe-bottom))` and `max-width: 1160px`.
- **Galaxy Z Fold Cover (`<= 359px`):** Tightened `12px` inline viewport gutters, `2-col` wardrobe grid (`16px 10px` gap), `54px`-min bottom tabs keeping `48px` height and `8px` gaps.
- **Standard Mobile (`360px – 599px`):** Single-column stacked studio canvas (`min-height: 536px`) + sheet trigger bar; modals slide up as draggable bottom sheets (`64dvh` resting, `92dvh` expanded).
- **Tablet / Unfolded Foldable (`>= 600px / >= 700px`):** Grid expands to 3 columns; Outfits locks into `58% : 42%` split frame; foldable dual-pane `@media (horizontal-viewport-segments: 2)` respects hinge env offsets.
- **Desktop Atelier (`>= 1024px / >= 1060px`):** `38px 44px 124px` container padding and 4-column wardrobe grid (`30px 22px` gap).
- **Zero horizontal overflow:** `html, body { overflow-x: hidden; }`; horizontal pill rails hide scrollbars while preserving touch swipe.

## Elevation & Depth

Depth communicates physical garment materiality without noisy drop-shadow clutter:

- **2.5D Garment Studio Lighting:** Every `.hig-squircle-card` combines top-left radial keylight (`--squircle-illumination`), `1px` specular top inset rim (`--squircle-inset-rim`), floating garment drop-shadow, and subtle grounded elliptical `.garment-25d-floor-shadow`.
- **Shadow Hierarchy:**
  - `--elevation-xs`: Subtle hairline lift (`0 1px 2px rgba(15, 23, 42, 0.04)`)
  - `--elevation-sm` / `--elevation-md`: Interactive card/button hover-lift (`translateY(-4px)`) and floating studio pills
  - `--elevation-lg`: Floating bottom tab dock and elevated sheets (`0 24px 56px rgba(15, 23, 42, 0.15)`)
- **Refractive Glassmorphism & GPU FPS Safeguard:** Floating bars and modals use `backdrop-filter: blur(26px) saturate(190%)` (`--vibrancy-filter`). When `html[data-vibrancy-fallback='solid']` toggles during WebGL frame drops, blur disables cleanly and surfaces swap to solid `--glass-bg-solid-fallback` (`#F9F9FB` / `#1C1C1F`) to preserve 60fps.
- **Spring Motion:** Non-linear spring curve `cubic-bezier(0.32, 0.72, 0, 1)` (`--spring-ease`) governs sheet transitions (`0.34s–0.36s`), staggered card reveals (`calc(var(--card-stagger) * 28ms)`), and active tap compression (`scale(0.94–0.975)`).

## Shapes

| Surface / Control | Radius | Token | Notes |
| :--- | :--- | :--- | :--- |
| Nested micro buttons & drawer nav icons | `10px` | `--radius-sm` | Compact dark-glass utility actions |
| Inputs, `TouchButton`, packshot cards, option buttons | `14px` | `--radius-md` | Paired with `1.5px` focusable borders |
| Closet 2.5D garment tiles (`.hig-squircle-card`) | `22px` | `--radius-squircle` | Signature 1:1 squircle container |
| Bottom sheets, modals, split studio outer container | `26px` | `--radius-lg` | Top-corner sheets on mobile, full rounded desktop |
| Floating tab bar, filter pills, CTAs, utility circles, badges | `9999px` | `--radius-pill` | Crisp monochrome capsule geometry |

## Components

- **Floating Pill Bottom TabBar (`.hig-floating-tabbar.ui-bottom-tabbar`):** Fixed centered capsule (`9999px`) floating above `env(safe-area-inset-bottom)`. Active tab combines contrast reversal (`#1D1D1F`/`#FFFFFF` in light; `#F5F5F7`/`#000000` in dark), a `2px` outer ring, heavy label weight (`760`), and a crisp `18px x 2.5px` bottom indicator bar (morphological active cue beyond color alone).
- **Top-Right Utility Navigation Group (`.ui-nav-utility-group`):** Always present across all 4 tabs with `48x48dp` minimum targets (`theme toggle`, `Profile Studio pill` `#open-profile-studio-btn`, `Account Settings` `#open-account-settings-btn`) spaced by `>= 8px`.
- **Category Pill Rail (`.hig-pill-rail` / `.ui-chip-rail`):** Horizontally scrollable 6-pill wardrobe taxonomy (`All`, `Tops`, `Bottoms`, `Outerwear`, `Shoes`, `Accessories`) with `4px–8px` spacing and monochrome inversion when active.
- **2.5D Sculptural Squircle Tile (`.hig-squircle-card`):** `1:1` aspect ratio squircle with radial lighting, diagonal specular sweep on pointer tilt (`.is-tilting`), contact floor shadow, and clean 2-line metadata footer (`.hig-garment-name` bold + `.hig-garment-brand` muted).
- **Responsive Sheet Modal (`ResponsiveSheetModal`):** Draggable handle bar (`role="dialog"`, `Escape` & hardware back-stack support), optical scan shimmer (`higModalOpticalSweep`) inside `AddGarmentModal` during image background removal.
- **Outfits Smoked-Glass Wardrobe Drawer (`#studio-slot-picker` / `#outfit-mobile-wardrobe-sheet`):**
  - Header with focused/equipped garment title and filter dot (`#D8C3A5`).
  - 4-column underline mood/occasion tabs (`전체`, `데일리`, `오피스`, `포멀`).
  - Dual-zone body: left `46px` vertical category icon rail (`42x42px` buttons inverting to `#FFFFFF`/`#141413` when active) paired with a 2-column grid of `#F7F7F5` packshot cards (`aspect-ratio: 1 / 1.06`) revealing smoked-glass name tooltips (`rgba(20, 20, 19, 0.92)`) on hover/focus/equipped state.
- **Zero-Lock-In UI Primitives (`src/components/ui/`):** High-contrast `TouchButton` (`primary`, `secondary`, `outline`, `ghost`, `destructive`), `ClearableInput` (`16px` font with `48x48px` clear button), `InlineOptionGroup` (<= 5 direct choices with checkmarks + focus ring), and `AccessibleBadge` (`neutral`, `info`, `success`, `warning`, `danger`, `accent`, all >= `4.9:1` contrast).

## Do's and Don'ts

### Do's
- **Respect Monochrome Restraint:** Keep chrome `#FAFBFD`/`#F5F5F7`/`#1D1D1F` (Light) and `#000000`/`#161618`/`#F5F5F7` (Dark) so uploaded apparel photography pops naturally.
- **Preserve Contract Anchors & Sizing:** Keep `.hig-squircle-card` at `22px` radius, `rgb(245, 245, 247)` light surface, `44px–48px` minimum hit targets, `>= 8px` gaps, and `tabular-nums` on every metric.
- **Maintain Outfits Studio Polarity:** Keep the 3D mannequin cyclorama warm light (`#F4F0E8`, luminance `>= 225` in light mode) directly beside the `#141413` smoked-glass drawer with `#F7F7F5` packshot cards.
- **Provide Non-Color Active Cues:** Pair active pills, tabs, and options with border weight, indicator pills, or checkmarks so states stay unambiguous for color-vision deficiency.
- **Respect Hardware & Performance Fallbacks:** Always honor `env(safe-area-inset-*)` and support `html[data-vibrancy-fallback='solid']`.

### Don'ts
- **Do NOT Introduce Brand Gradients or Warm-Gold Chrome:** Never re-introduce amber/warm-gold accents onto navigation bars, filter pills, or primary CTAs, and never inject generic SaaS purple-blue gradients.
- **Do NOT Darken the Outfits Light Cyclorama Stage:** Do not replace `#F4F0E8` light stage surfaces with dark canvases during light mode.
- **Do NOT Render Generic SaaS Dashboard Clutter:** Avoid left-hand icon sidebars, cramped uniform gray card grids without depth, visible horizontal scrollbars, or `< 44px` icon hit areas.
- **Do NOT Suppress Real Contrast or Safe Area Spacing:** Never drop text contrast below WCAG AA `4.5:1` or place fixed floating docks flush against viewport edges without safe-area padding.
