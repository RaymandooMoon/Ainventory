# Next Stitch Prompt — iNVTRY Onboarding 2.0 (Apple Ultra-Minimal 4-Step Setup)

> **Stitch Project**: `projects/11505180160165595336` (`A inventory UI rev`)
> **Design System Asset**: `assets/98bc4c44edea4f0898f4a037ca720090` (synced from `.stitch/DESIGN.md`)
> **Status**: Stitch exception approved by user for local interactive Apple HIG prototype review (`onboarding_v2_mockups.html`); prompts preserved here for non-destructive Stitch mirroring when Stitch MCP is connected.

## Variant A — Apple Setup Sheet (Centered Minimal Single Card)

Create an ultra-minimal, Apple Human Interface Guidelines onboarding wizard modal for the iNVTRY private digital wardrobe app.

**PLATFORM:** Web & Mobile responsive, Mobile-first (`390px` phone & centered modal on `1440px` desktop)

**PAGE STRUCTURE:**
1. **Top Sheet Navigation:** Subtle translucent backdrop dimming the Outfits studio behind a centered floating card (`460px` max width). Header contains the continuous one-line hanger-garments iNVTRY logo on the left (or a back arrow on steps 2–4) and a quiet "Later" ("나중에 하기") ghost action on the right, followed by a hairline 4-segment progress bar.
2. **Step Content (One Screen, One Decision):**
   - Step 1 (Body): Compact silhouette preview card, 2-option segmented gender frame selector, twin numeric height/weight steppers with tabular numerals, and a 4-card silhouette row (Slim, Standard, Athletic, Soft).
   - Step 2 (Face & Skin Tone — Path A Hero): Prominent hero card for single-photo automatic on-device face skin-tone analysis with a subtle local-storage privacy caption, live 5-swatch best palette bar, and a quiet 4-season quick-select fallback strip below.
   - Step 3 (First Wardrobe — Option B Hero): Recommended starter capsule card featuring a clean 6-item monochrome thumbnail grid (outer, 2 tops, 2 bottoms, shoes) with one-tap cleanup note, followed by an Apple Settings grouped list with two secondary options ("Upload 1 Garment Photo" and "Start with Empty Closet").
   - Step 4 (Ready): Editorial summary card showing body profile, skin tone swatch, and starter closet readiness.
3. **Footer:** Full-width 48px primary pill button ("Continue" / "Start My Atelier").
4. **Deferred State:** When dismissed via "Later", display a slim 1-row inline resume banner at the top of Outfits/Closet showing circular `2/4` progress badge, short caption, and a compact "Resume" pill button, while hiding secondary promotional tooltips when closet count is 0.

## Variant B — Editorial Split Studio (Live Atelier Preview + 1-Decision Panel)

Create an ultra-minimal Apple Store configurator-style split onboarding modal for the iNVTRY private digital wardrobe app.

**PLATFORM:** Web & Mobile responsive (`860px` 50:50 split sheet on Desktop, collapsing cleanly into a compact top preview + bottom 1-decision sheet on `390px` Mobile)

**PAGE STRUCTURE:**
1. **Left Live Atelier Stage (Desktop 42% / Mobile top compact strip):** Displays the iNVTRY hanger-garments logo, live `LIVE ATELIER` micro label, real-time centered mannequin silhouette that reflects body frame, skin tone swatch, and 6-item starter capsule readiness chips below.
2. **Right 1-Decision Panel (Desktop 58%):** Generous negative space, quiet top bar with back/Later controls, 4-segment hairline progress bar, bold editorial step headline (`STEP 01 / 04` tabular kicker), identical ultra-minimal 4-step controls (Path A single-photo skin analysis hero + Option B 6-item starter capsule hero), and a full-width 48px primary pill CTA at the bottom.
