---
page: site-hero-redesign
projectId: "11505180160165595336"
designSystem: "assets/98bc4c44edea4f0898f4a037ca720090"
deviceType: DESKTOP
variants: 2
status: ready-for-stitch-mcp
---
# Baton — `ainvtry.com` Hero Redesign (2 Stitch Variants for User Selection)

> **Execution Note (`generate-design` + `stitch-first-ui.md`):**
> - **When calling Stitch MCP with bound `designSystem: "assets/98bc4c44edea4f0898f4a037ca720090"`**: Use the **MCP Bound-System Structural Prompt** under each variant (intentionally free of hex codes/font tokens so it does not conflict with the project-level design system).
> - **When pasting directly into `stitch.google.com` or running unbound generation**: Prepend the **Standalone DESIGN SYSTEM Block** below to the structural prompt.
> - Generate both **Variant A** and **Variant B** non-destructively (Desktop `1440x900` + optional Mobile `390x844` check), download HTML & PNG screenshots into `.stitch/designs/`, and present Screen IDs + layout diffs to the user before editing any React/CSS source.

---

## Standalone DESIGN SYSTEM (REQUIRED — For Unbound / Web UI Use Only)

- **Platform:** Web, Desktop-first (`1440x900` single-viewport `100dvh`) with clean single-column mobile collapse (`390x844`)
- **Theme:** Dark default ("OLED Obsidian Glass — Spatial Editorial Noir"), luxury fashion maison editorial, generous sculptural negative space, calm confidence
- **Background:** True OLED Pure Black (`#000000`) canvas behind an atmospheric dark kinetic 3D silk ribbon and rolling obsidian-chrome marble stage
- **Glass Surfaces:** Translucent Obsidian Glass (`rgba(11, 11, 14, 0.48)`, `blur(15px)`, hairline `1px` specular rim `rgba(245, 245, 247, 0.14)`, solid fallback `#141418`)
- **Primary CTA:** Inverted Alabaster White (`#F5F5F7`) pill button with Obsidian ink (`#101013`), pill-shaped (`9999px`), 46–48px height, tactile micro-lift on hover
- **Secondary / Ghost CTA:** Frosted glass pill with strong hairline border and Alabaster White (`#F5F5F7`) ink
- **Accent (Hairlines & Editorial Italic Only):** Restrained Champagne Gold (`#D6B889` / `#E2CFA8` ink) — never loud fills, never neon/purple glows
- **Text Hierarchy:** Alabaster White (`#F5F5F7`) headlines, Soft Mist (`rgba(235, 235, 240, 0.78)`) body copy, Muted Silver (`rgba(206, 206, 216, 0.68)`) uppercase kickers and metadata
- **Typography:** Pretendard Variable / SF Pro Display for tight-tracked geometric sans headlines (`-0.036em`, weight 700) paired with a refined modern editorial italic serif (Instrument Serif / Cormorant Garamond, never generic Georgia/Times) for the single accented hero phrase; `tabular-nums` for all numbers
- **Brand Mark (MANDATORY):** Exact continuous one-line hanger-garments `"iNVTRY"` calligraphy logo centered in the top navigation bar — never replace with plain text
- **Geometry:** Concentric squircle hierarchy (`22px` panels → `14px` cards → `10px` inner controls → `8px` micro thumbnails → `9999px` pills), 8pt spacing grid, minimum `44–48px` touch targets
- **Anti-Patterns (STRICTLY BANNED):** No emojis, no neon/purple/blue AI gradients, no generic 3-equal-card horizontal rows, no "Scroll to explore" filler text or bouncing chevrons, no fabricated uptime/SLA numbers

---

## Variant A — Ultra-Minimal Runway Focus (Spatial Canvas Hero + Restored Primary CTA)

### MCP Bound-System Structural Prompt (`generate_screen_from_text`)

```markdown
A restrained, high-fashion editorial single-viewport landing page for Ainvtry (ainvtry.com), a privacy-first digital wardrobe and multi-angle virtual fitting studio OS. Maximize breathing room around the central kinetic 3D silk and rolling marble runway canvas while establishing an unmistakable primary path into the live interactive studio.

**PLATFORM:** Web, Desktop-first (1440x900 single-viewport layout)

**PAGE STRUCTURE:**
1. **Zero-Chrome 3-Column Header Navigation Bar:**
   - Left slot: Compact pill-shaped frosted glass utility rail with two icon-label controls separated by a vertical hairline divider — Theme switcher ("Light") and 3D Silk backdrop mood toggle ("Silk").
   - Center slot: Borderless clickable official continuous one-line hanger-garments "iNVTRY" calligraphy logo mark with a subtle thin underline active-home indicator beneath it.
   - Right slot: Compact frosted glass pill button for bilingual toggle ("KO") paired with a subtle text link to the interactive IR Deck ("IR Deck").
2. **Hero Section (Centered Runway Focal Stage):**
   - Occupies generous sculptural whitespace over the full-bleed dark 3D silk ribbon and rolling marble stage so the motion artwork remains the focal atmosphere.
   - Small uppercase eyebrow kicker with a tiny diamond motif: "PRIVACY-FIRST DIGITAL CLOSET OS".
   - Tight-tracked editorial display headline with a single contrasting italic serif emphasis phrase: "Your entire wardrobe, *in one place*."
   - Concise two-line subtitle capped at readable line width: "1-photo cutout, 8-angle 2D VTON layering, weather context & 0B face privacy."
   - Clean action cluster with clear hierarchy: one high-contrast inverted pill primary call-to-action button ("Launch Live Studio" with right arrow) as the clear visual anchor, next to a quiet frosted-glass secondary pill ("Contact Founder" with diagonal arrow).
   - Minimal architectural hairline proof strip directly underneath with three real tabular-numeral verification anchors separated by thin vertical dividers: "582→24 KB · EXIF 0% WebP", "0 Bytes · Face Upload", "360+ · Auto Tests".
3. **Bottom Architectural 4-Stage Navigation Dock:**
   - Floating centered frosted-glass capsule housing four equal-height stage pills with tabular index numbers: "01 Live Studio →" (highlighted primary launch pill), "02 Architecture", "03 Specs", and "04 About".
4. **Full-Bleed Hairline Footer Tray:**
   - Left cluster: Copyright ("© 2026 Ainvtry"), direct email link ("raymond@ainvtry.com"), Newsletter dialog trigger with mail icon, Privacy link, Terms link, and IR Deck link.
   - Right cluster: Quiet Analytics chart modal button and interactive vertical Glass opacity slider pill ("Glass 50%") with a thin vertical level meter.
```

---

## Variant B — Asymmetric Editorial Split (Immediate Visual Proof Showcase)

### MCP Bound-System Structural Prompt (`generate_screen_from_text`)

```markdown
A confident, asymmetric luxury-maison editorial single-viewport landing page for Ainvtry (ainvtry.com), a privacy-first digital wardrobe and multi-angle virtual fitting studio OS. Pair a crisp left-aligned typographic hero with a weightless frosted-glass visual proof showcase on the right so first-time visitors immediately see real 1-photo garment cutout to 8-angle 2D virtual try-on results without clicking away.

**PLATFORM:** Web, Desktop-first (1440x900 single-viewport split grid, collapsing cleanly to single column on mobile)

**PAGE STRUCTURE:**
1. **Zero-Chrome 3-Column Header Navigation Bar:**
   - Left slot: Compact pill-shaped frosted glass utility rail with Theme toggle ("Light") and 3D Silk backdrop mood toggle ("Silk") separated by a vertical hairline.
   - Center slot: Official continuous one-line hanger-garments "iNVTRY" calligraphy logo mark with a minimal active-home underline indicator.
   - Right slot: Frosted glass utility rail containing "IR Deck" shortcut and bilingual toggle ("KO").
2. **Hero Section (Asymmetric 2-Column Editorial Split, 54% Left / 46% Right):**
   - **Left Column (Left-Aligned Editorial Copy & Primary Action):**
     - Uppercase eyebrow kicker with a tiny diamond motif: "PRIVACY-FIRST DIGITAL CLOSET OS".
     - Bold editorial display headline with a single italic serif emphasis phrase: "Your entire wardrobe, *in one place*."
     - Concise subtitle: "1-photo cutout, 8-angle 2D VTON layering, weather context & 0B face privacy."
     - Primary action row: Single high-contrast inverted pill primary call-to-action button ("Launch Live Studio" with right arrow) plus a quiet borderless text link ("Contact Founder ↗") so only one button competes visually.
     - Grounded bottom hairline metric strip with three real tabular-numeral anchors: "582→24 KB · EXIF 0% WebP", "0 Bytes · Face Upload", "360+ · Auto Tests".
   - **Right Column (Floating Frosted-Glass Visual Proof Showcase Card):**
     - Elevated concentric-squircle frosted glass panel with hairline rim and generous internal framing, floating cleanly over the kinetic 3D silk backdrop without overlapping any text.
     - Card header bar: tiny status dot + uppercase micro-label ("8-ANGLE 2D VTON · LIVE PREVIEW") on the left, and a compact 2-option segmented tab switcher ("2D VTON" | "EXIF -96%") on the right.
     - Card visual body (side-by-side split pane with subtle arrow bridge): left pane displays a clean studio trench coat cutout packshot on a calm neutral stone surface with caption chip "1-Photo Cutout · 24 KB"; right pane displays a full-figure 8-angle virtual fitting lookbook preview with caption chip "Live 8-Angle Fitting".
     - Card footer hairline bar: concise technical metadata on the left ("On-device WebP · Zero GPS/EXIF") and a quiet right-aligned action link ("Open Live App ↗").
3. **Bottom Architectural 4-Stage Navigation Dock:**
   - Floating centered frosted-glass pill rail with four indexed stages: "01 Live Studio →" (inverted launch pill), "02 Architecture", "03 Specs", and "04 About".
4. **Full-Bleed Hairline Footer Tray:**
   - Left cluster: Copyright ("© 2026 Ainvtry"), "raymond@ainvtry.com", Newsletter dialog trigger, Privacy, and Terms.
   - Right cluster: Analytics chart modal trigger and vertical Glass opacity slider pill ("Glass 50%").
```
