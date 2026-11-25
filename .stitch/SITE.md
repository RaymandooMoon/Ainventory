---
stitch-project-id: 11505180160165595336
design-system-asset: assets/98bc4c44edea4f0898f4a037ca720090
domain: ainvtry.com
---
# Project Vision & Constitution — Ainvtry (`ainvtry.com`)

> **AGENT INSTRUCTION:** Read this file together with `.stitch/DESIGN.md` and `.agent/rules/web/stitch-first-ui.md` before every site design or build iteration. It serves as the official marketing & showcase site's "Long-Term Memory." Never alter React/CSS source until the user picks a generated Stitch variant.

## 1. Core Identity
* **Project Name:** Ainvtry (`ainvtry.com`) — Official Product Showcase & Interactive Spatial Site for *A inventory* (`iNVTRY`)
* **Stitch Project ID:** `11505180160165595336` (`A inventory UI rev`)
* **Design System Asset:** `assets/98bc4c44edea4f0898f4a037ca720090` (canonical spec: `.stitch/DESIGN.md`)
* **Mission:** Present Ainvtry's privacy-first digital wardrobe OS — 1-photo on-device cutout (EXIF -96%), 8-angle 2D virtual try-on, Three.js 3D silk/drape stage previews, live weather & place context, and 0-byte face-upload skin-tone calibration — inside a single-viewport luxury spatial experience where visitors can launch the live embedded app immediately.
* **Target Audience:** Fashion-forward consumers seeking a digital closet & virtual fitting studio, private-beta early adopters, brand/retail partners, and seed/pre-A investors reviewing product architecture and the interactive IR deck (`/ir/`).
* **Voice:** Quiet luxury, editorial, architecturally precise, privacy-confident, bilingual (`EN` / `KO`), zero AI-slop clichés, real verifiable metrics only.

## 2. Visual Language (Stitch Prompt Strategy)
*Strictly adhere to these descriptive rules when prompting Stitch. Preserve the `iNVTRY` continuous one-line hanger-garments calligraphy logo on every screen.*

* **The "Vibe" (Adjectives):**
    * *Primary:* **Spatial Editorial Noir** (OLED pure black darkness, dramatic architectural negative space, kinetic 3D silk/marble canvas breathing behind glass chrome).
    * *Secondary:* **Monochrome Restraint** (Apple HIG clarity, hairline borders, concentric squircle geometry, zero neon/purple/generic SaaS gradients).
    * *Tertiary:* **Champagne Atelier Craft** (Whisper-restrained Champagne Gold / Sand accents solely for focus lines, active indicators, and editorial italic typographic emphasis; warm alabaster stone ivory in daylight mode).

* **Color Philosophy (Semantic):**
    * **Dark Mode (Default — OLED Obsidian Glass):** True OLED Black (`#000000`) primary canvas, translucent obsidian glass panels (`#141418` solid fallback) controlled dynamically by the bottom-right `Glass %` slider, Alabaster White (`#F5F5F7`) headlines and inverted primary actions, restrained Champagne Gold (`#D6B889` / `#E2CFA8` ink) for hairlines and active cues.
    * **Light Mode (Warm Alabaster & Stone Ivory Daylight):** Warm Alabaster (`#F6F3EC`) canvas, Ivory Paper (`#FAF8F4`) solid fallback panels, Carbon Ink (`#1D1D1F`) headlines and inverted primary actions, Antique Champagne (`#B8955F` / `#73552B` ink) hairlines and emphasis.
    * **Accessibility & Fallback:** WCAG 2.2 AA contrast across both modes, `44–48px` minimum hit targets, `tabular-nums` on all numeric metrics, and full support for `prefers-reduced-motion`, `prefers-reduced-transparency`, and `html[data-vibrancy-fallback='solid']`.

## 3. Architecture & File Structure
* **Site Entry & Config:** `vite.site.config.ts` (build output `dist-site/`, dev server `npm run dev:site` on port `3000`)
* **HTML Entrypoints:**
    * `site/index.html` → `src/site/main.tsx` → `src/site/AinvtrySiteApp.tsx` (Official spatial site)
    * `site/app.html` → `src/site/liveAppEmbed.tsx` (Embedded real live Ainventory app hosted inside Stage 01 Live Studio)
    * `site/public/ir/index.html` (Auto-synced interactive HTML IR Business Plan `/ir/`)
* **Styling Source of Truth:** `src/site/ainvtrySite.css` → `src/site/styles/{tokensAndShell,stageHud,modalsAndAnalytics,responsive}.css`
* **Asset Flow:**
    * Stitch design artifacts → `.stitch/designs/{slug}.{html,png}` (staging & visual audit)
    * Approved production UI → modular React/TSX components in `src/site/` (or standalone static subpages in `site/public/`) after user variant selection
    * Static media & SEO assets → `site/public/` (`assets/brand/`, `assets/garments/`, `assets/journey/`, `assets/models/`, `assets/previews/`, `sitemap.xml`, `robots.txt`, `_headers`)
* **Navigation Strategy:**
    * **Global Topbar (3-Column Zero-Chrome):** Left utility rail (Theme toggle + Three.js 3D Silk mood switcher) · Center official dual-theme `iNVTRY` calligraphy mark (click to return Home + dismissible callout when inside sub-stages) · Right utility rail (`EN / KO` language toggle).
    * **Bottom Architectural 4-Stage Dock:** `01 Live Studio` (inverted primary pill) · `02 Architecture` · `03 Specs` · `04 About` — synced with persistent single-canvas Three.js 4-Stage Director (`src/three/ainvtryStageDirector.ts`) and wheel/keyboard (`Escape`) controls.
    * **Global Bottombar Tray:** Copyright, direct founder email (`raymond@ainvtry.com`), Newsletter modal trigger, Privacy & Terms legal modals, Session Stage Analytics modal, and interactive vertical `Glass %` opacity control (`--site-ui-alpha`).

## 4. Live Sitemap (Current State)
*Update this section whenever a new page or major stage revision is merged.*

* [x] `site/index.html` (`/`) — Spatial Editorial Noir single-viewport shell hosting 5 interactive stages:
    * [x] `Stage 00 · hero` — Opening editorial headline over interactive Three.js Silk & Rolling Marble canvas
    * [x] `Stage 01 · studio` — Live embedded Ainventory app (`/app.html`) with synchronized theme/lang/mood & tab bridge
    * [x] `Stage 02 · architecture` — Interactive 7-tier system blueprint (`dev`/`prod` toggle), Google Maps/Weather/Gemini API pipeline, and 4 Privacy Shields
    * [x] `Stage 03 · specs` — 3D KPI pillars (`5-STAGE`, `0B FACE`, `360+ TESTS`, `4 APIs`, `21-BONE`, `EXIF -96%`), Tech Stack, 3D Fitting pose/angle rig, and Care telemetry
    * [x] `Stage 04 · about` — 6-cut Journey storyboard, Circular Mission loop & Roadmap, Business Model, FAQ, Inline Newsletter signup, Founder contact, and IR Deck link
* [x] `site/app.html` (`/app.html`) — Live embedded Ainventory web application entrypoint (CSP `frame-ancestors` restricted to `ainvtry.com`)
* [x] `site/public/ir/index.html` (`/ir/`) — Interactive HTML IR Business Plan (16:9 / 4:3, auto-synced via `npm run ir:sync`)
* [ ] `site/public/privacy-whitepaper.html` — Dedicated On-Device Privacy & Zero-Upload Architecture whitepaper (planned)
* [ ] `site/public/changelog.html` — Product release notes & QA milestone log (planned)

## 5. The Roadmap (Backlog)
*Pick the highest-priority task here when preparing the next Stitch iteration.*

### High Priority (P0)
- [ ] **Hero Redesign (2 Stitch Variants):** Restore a clear primary conversion CTA (`Launch Live Studio` / `라이브 스튜디오 체험`) on Hero, upgrade the generic editorial italic serif (`Georgia, 'Times New Roman'`) to a modern couture editorial serif (`Instrument Serif` / `Cormorant Garamond` for Latin, Pretendard for Korean), and compare **Variant A (Ultra-Minimal Runway Focus)** vs **Variant B (Asymmetric Editorial Split with live 2D VTON / EXIF -96% proof)**.
- [ ] **Dead Code & CSS Hygiene:** After user selects Hero Variant A or B, either cleanly remove orphaned `src/site/HeroVisualProofCard.tsx` + ~350 lines of unused `.site-hero-proof-*` CSS (Variant A) or re-architect it to match the approved Variant B Stitch screen.
- [ ] **Stitch Design System Sync:** Upload the updated `.stitch/DESIGN.md` (now covering both App v5 and Official Site Spatial Editorial Noir) to Stitch project `11505180160165595336` via `upload-to-stitch` + `manage-design-system` (non-destructive versioned asset) and populate `.stitch/metadata.json` via `get_project`.

### Medium Priority (P1)
- [ ] **IR Deck (`/ir/`) Discoverability:** Design and validate a restrained topbar/footer/hero secondary entry point for investors & partners so `/ir/` is no longer buried exclusively at the bottom of `About -> Model`.
- [ ] **Component Modularization & Accessibility (`react-components` / `react-vite-dashboard`):** Split the 975-line `src/site/AinvtrySiteApp.tsx` into focused components (`SiteTopBar`, `SiteHeroStage`, `SiteBottomDock`, `SiteBottomBar`) and custom hooks (`useStageWheelNavigation`, `useGlassAlphaDrag`); add full keyboard Tab focus trap to `src/site/SiteStageAnalytics.tsx` (matching `SiteNewsletterModal.tsx`).
- [ ] **Stage Deep-Linking & SEO:** Sync `activeStage` with URL query/hash (`?stage=studio|architecture|specs|about`) + browser history, and expand `site/public/sitemap.xml` to include `/ir/`.

### Low Priority (P2)
- [ ] **Remotion Walkthrough Video (`remotion` skill):** Create an isolated `video/` Remotion project combining approved Stitch screens and `site/public/assets/previews/` (16 real EN/KO Dark/Light captures) to render a 30–45s showcase video for Hero/IR/Product Hunt.
- [ ] **Token Convergence Audit:** Evaluate unifying site Champagne Gold (`#D6B889`) and app Atelier Sand (`#D8C3A5`) into a single shared token or keeping deliberate marketing-vs-app separation documented in `.stitch/DESIGN.md`.

## 6. Creative Freedom Guidelines
*When the core roadmap is complete, explore static subpages or showcase modules aligned with Ainvtry's Spatial Editorial Noir identity:*

1. **Stay On-Brand:** Every screen must uphold OLED Noir (`#000000`) / Warm Alabaster (`#F6F3EC`), monochrome chrome, concentric squircles, real metrics only, and the official `iNVTRY` calligraphy logo.
2. **Enhance the Core:** Every addition must drive visitors toward experiencing the Live Studio (`/app.html`), trusting on-device privacy, or contacting the founder / reviewing `/ir/`.
3. **Naming Convention:** Lowercase kebab-case filenames under `site/public/` or modular PascalCase components under `src/site/`.

### Ideas to Explore
*Pick one, design 2 variants in Stitch, get user approval, build it, then REMOVE it from this list.*

- [ ] `privacy-whitepaper.html` — Visual technical breakdown of 0B face upload (MediaPipe WASM), client EXIF/GPS stripping (582 KB → 24 KB WebP), and RBAC/vault boundaries.
- [ ] `changelog.html` — Editorial timeline of verified product & QA milestones (360+ automated tests, 8-angle VTON, Living IR Deck).
- [ ] `press-kit.html` — Official brand guidelines, downloadable dual-theme `iNVTRY` logos, and curated studio lookbook stills.

## 7. Rules of Engagement
1. **Stitch-First Mandatory Gate (`.agent/rules/web/stitch-first-ui.md`):** Never alter visual layouts or write UI redesign code before generating non-destructive Stitch variants (default: 2) in project `11505180160165595336` and receiving explicit user selection.
2. **Do Not Overwrite Existing Stitch Assets:** Generate new screens or variants; never destructively overwrite existing Stitch screens or design systems without approval.
3. **Preserve Sitemap & Living Baton:** Do not recreate already-shipped stages listed in Section 4; always update `.stitch/next-prompt.md` and `.stitch/metadata.json` after each Stitch iteration.
4. **Zero-Regression Verification:** After implementing any user-approved design on a separate branch, pass `npm run verify`, `npm run build:site`, `npm run verify:secrets`, `npm run verify:docs`, and `npm run verify:stitch-skills`.
