import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildGeminiTryOnPrompt,
  normalizeVtonProfile,
} from '../../server/vtonService.js';
import {
  cutoutStudioBackdropToRgba,
  inferOuterPerimeterBackdropRgb,
} from '../../src/services/cutoutService.ts';
import {
  CANONICAL_FLOOR_BASELINE_RATIO,
  CANONICAL_HUMAN_STATURE_RATIO,
  CANONICAL_PORTRAIT_ASPECT_RATIO,
  CHARACTER_IDENTITY_ANCHOR_STORAGE_KEY,
  angle360ToSignedScrollDeg,
  buildTurnaround3x2LayoutGuideDataUrl,
  computeCharacterIdentityAnchorKey,
  computeCoreAnatomicalCenterXInBuffer,
  computeIdealDeviceMannequinScale,
  computeMannequinFloorPlacement,
  computeOutfitComboId,
  computeUniformStaturePlacement,
  detectCoreHumanVerticalBoundsInBuffer,
  detectLateralFacingDirectionInBuffer,
  detectRowHeadClustersInBuffer,
  eraseSheetGridDividerLinesInBuffer,
  getShowcaseDemoSheetUrl,
  inspectTurnaroundSliceIntegrityInBuffer,
  measureRowCenterForegroundDensityInBuffer,
  normalizeGenderNeutralProfile,
  resolve360AngleRenderSpec,
  resolveEffectiveVtonStyleMode,
  resolveShowcaseCacheKey,
  resolveSignedAngleScrollState,
  resolveTurnaroundRowSplitYInBuffer,
  resolveTurnaroundSheetGridDecisionInBuffer,
  scrubCutoutArtifactsInBuffer,
  splitTouchingTwinSilhouettesInBuffer,
} from '../../src/services/vton2DService.ts';
import {
  CANONICAL_ANGLE_PROMPT_DIRECTIVES,
  CUTOUT_PIPELINE_VERSION,
  CUTOUT_STAGE_BACKDROP_HEX,
  FOOTWEAR_PAIR_SYMMETRY_LOCK,
  SOLO_SINGLE_PERSON_PER_CELL_LOCK,
  buildCanonicalCharacterIdentityPromptBlock,
  buildTurnaround3x2SheetAngleDirectives,
  buildWeatherPosePromptDirectives,
  selectOptimalStudioKeyHex,
} from '../../src/services/weatherPromptBuilder.ts';

describe('Outfits & Profile VTON Style Gate and Symmetrical Angle Scrollbar', () => {
  it('enforces Character Simulation (stylized_isometric) whenever no user portrait photo is registered', () => {
    assert.equal(
      resolveEffectiveVtonStyleMode({ preferredStyle: null, hasFacePhoto: false }),
      'stylized_isometric'
    );
    assert.equal(
      resolveEffectiveVtonStyleMode({ preferredStyle: 'photorealistic', hasFacePhoto: false }),
      'stylized_isometric'
    );
    assert.equal(
      resolveEffectiveVtonStyleMode({ preferredStyle: 'stylized_isometric', hasFacePhoto: false }),
      'stylized_isometric'
    );
    assert.doesNotMatch(getShowcaseDemoSheetUrl('stylized_isometric'), /photoreal/i);
    assert.match(getShowcaseDemoSheetUrl('stylized_isometric'), /stylized/i);
    assert.doesNotMatch(getShowcaseDemoSheetUrl(null), /photoreal/i);
    assert.match(getShowcaseDemoSheetUrl('photorealistic'), /photoreal/i);
  });

  it('honors Photorealistic Model when a user portrait photo is registered and selected', () => {
    assert.equal(
      resolveEffectiveVtonStyleMode({ preferredStyle: 'photorealistic', hasFacePhoto: true }),
      'photorealistic'
    );
    assert.equal(
      resolveEffectiveVtonStyleMode({ preferredStyle: 'stylized_isometric', hasFacePhoto: true }),
      'stylized_isometric'
    );
  });

  it('starts symmetrical angle scrollbar at 0° Front in the center, preserves dedicated ±135° rear-quarter zones, and maps outer back zones (-180..-158 and +158..+180) to 180° Back', () => {
    const center = resolveSignedAngleScrollState(0);
    assert.equal(center.clampedScrollDeg, 0);
    assert.equal(center.angle360, 0);
    assert.equal(center.residualYawDeg, 0);

    const leftBack = resolveSignedAngleScrollState(-180);
    assert.equal(leftBack.clampedScrollDeg, -180);
    assert.equal(leftBack.angle360, 180);
    assert.equal(leftBack.residualYawDeg, 0);

    const rightBack = resolveSignedAngleScrollState(180);
    assert.equal(rightBack.clampedScrollDeg, 180);
    assert.equal(rightBack.angle360, 180);
    assert.equal(rightBack.residualYawDeg, 0);

    // ±135° scrub positions MUST preserve dedicated 135° (우후면) and 225° (좌후면) rear-quarter views!
    const backRight135 = resolveSignedAngleScrollState(135);
    assert.equal(backRight135.angle360, 135);
    assert.equal(resolveSignedAngleScrollState(145).angle360, 135);

    const backLeft225 = resolveSignedAngleScrollState(-135);
    assert.equal(backLeft225.angle360, 225);
    assert.equal(resolveSignedAngleScrollState(-145).angle360, 225);

    // Outer scrollbar zone (±158..±180) reaches 180° Back cleanly
    assert.equal(resolveSignedAngleScrollState(-165).angle360, 180);
    assert.equal(resolveSignedAngleScrollState(165).angle360, 180);

    // 135° (우후면) and 225° (좌후면) use dedicated canonical slices (NEVER 180° straight back!) with mirrorX: false
    const spec135 = resolve360AngleRenderSpec(135);
    const spec180 = resolve360AngleRenderSpec(180);
    const spec225 = resolve360AngleRenderSpec(225);
    assert.equal(spec135.canonicalSliceAngle, 135);
    assert.equal(spec180.canonicalSliceAngle, 180);
    assert.equal(spec225.canonicalSliceAngle, 225);
    assert.notEqual(spec135.canonicalSliceAngle, spec180.canonicalSliceAngle);
    assert.notEqual(spec225.canonicalSliceAngle, spec180.canonicalSliceAngle);
    assert.equal(spec135.mirrorX, false);
    assert.equal(spec180.mirrorX, false);
    assert.equal(spec225.mirrorX, false);
  });

  it('aligns slider direction with head/gaze direction and enforces strict 90° pure orthographic side-profile rules', () => {
    assert.equal(CUTOUT_PIPELINE_VERSION, 'v23-nanobanana-4x2-rear-order');
    assert.match(CANONICAL_ANGLE_PROMPT_DIRECTIVES[45], /SCREEN-RIGHT/i);
    assert.match(CANONICAL_ANGLE_PROMPT_DIRECTIVES[90], /SCREEN-RIGHT/i);
    assert.match(CANONICAL_ANGLE_PROMPT_DIRECTIVES[90], /EXACTLY ONE.*EYE/i);
    assert.match(CANONICAL_ANGLE_PROMPT_DIRECTIVES[90], /NEVER rotate past 90/i);
    assert.match(CANONICAL_ANGLE_PROMPT_DIRECTIVES[135], /BACK-RIGHT/i);
    assert.match(CANONICAL_ANGLE_PROMPT_DIRECTIVES[135], /SCREEN-RIGHT/i);
    assert.match(CANONICAL_ANGLE_PROMPT_DIRECTIVES[180], /NEVER show front face/i);
    assert.match(CANONICAL_ANGLE_PROMPT_DIRECTIVES[225], /BACK-LEFT/i);
    assert.match(CANONICAL_ANGLE_PROMPT_DIRECTIVES[225], /SCREEN-LEFT/i);

    const pos45 = resolveSignedAngleScrollState(45);
    assert.equal(pos45.angle360, 45);
    assert.equal(pos45.residualYawDeg, 0);
    assert.equal(resolve360AngleRenderSpec(pos45.angle360).mirrorX, false);
    assert.equal(resolve360AngleRenderSpec(90).mirrorX, false);

    const neg45 = resolveSignedAngleScrollState(-45);
    assert.equal(neg45.angle360, 315);
    assert.equal(neg45.residualYawDeg, 0);
    assert.equal(resolve360AngleRenderSpec(neg45.angle360).canonicalSliceAngle, 315);
    assert.equal(resolve360AngleRenderSpec(neg45.angle360).mirrorX, false);

    const neg90 = resolveSignedAngleScrollState(-90);
    assert.equal(neg90.angle360, 270);
    assert.equal(resolve360AngleRenderSpec(neg90.angle360).canonicalSliceAngle, 270);
    assert.equal(resolve360AngleRenderSpec(neg90.angle360).mirrorX, false);

    const microScrub = resolveSignedAngleScrollState(18);
    assert.equal(microScrub.angle360, 0);
    assert.ok(microScrub.residualYawDeg > 0 && microScrub.residualYawDeg <= 11);

    assert.equal(angle360ToSignedScrollDeg(0, 0), 0);
    assert.equal(angle360ToSignedScrollDeg(45, 0), 45);
    assert.equal(angle360ToSignedScrollDeg(135, 0), 135);
    assert.equal(angle360ToSignedScrollDeg(225, 0), -135);
    assert.equal(angle360ToSignedScrollDeg(315, 0), -45);
    assert.equal(angle360ToSignedScrollDeg(270, 0), -90);
    assert.equal(angle360ToSignedScrollDeg(180, -135), -180);
    assert.equal(angle360ToSignedScrollDeg(180, 135), 180);
  });

  it('locks 176cm/70kg BMI 22.6 7.5-head adult proportions, unified matte 3D-stylized art style, and male short hair across client & server prompts', () => {
    const block = buildCanonicalCharacterIdentityPromptBlock({
      heightCm: 176,
      weightKg: 70,
      gender: 'male',
      bodyShape: 'standard_balanced',
      skinToneHex: '#DFBA9B',
      hairStyle: 'soft_wavy',
      hairColorHex: '#2B211B',
      styleMode: 'stylized_isometric',
    });

    assert.match(block, /176cm \/ 70kg = BMI 22\.6: lean-balanced standard adult build/);
    assert.match(block, /7\.5 heads tall/);
    assert.match(block, /UNIFIED AINVENTORY SIGNATURE 3D-STYLIZED AVATAR STYLE/);
    assert.match(block, /NEVER render photorealistic human photography/);
    assert.match(block, /NEVER render chibi, super-deformed, 5-head\/6-head/);
    assert.match(
      block,
      /men's clean short tapered ear-length haircut strictly above the shirt collar — NEVER shoulder-length hair or long flowing locks even in strong wind/
    );

    const femaleBobBlock = buildCanonicalCharacterIdentityPromptBlock({
      heightCm: 165,
      weightKg: 54,
      gender: 'female',
      hairStyle: 'straight_bob',
      hairColorHex: '#3A281E',
      styleMode: 'stylized_isometric',
    });
    assert.match(femaleBobBlock, /Explicit FEMALE adult presentation/);
    assert.match(femaleBobBlock, /jawline-to-chin length straight architectural bob/);

    // Verify normalizeGenderNeutralProfile preserves male gender instead of losing it to androgynous
    const normalizedClientProfile = normalizeGenderNeutralProfile({
      heightCm: 176,
      weightKg: 70,
      bodySpec: { gender: 'male', heightCm: 176, weightKg: 70, bodyShape: 'standard_balanced' },
      skinToneHex: '#DFBA9B',
    });
    assert.equal(normalizedClientProfile.gender, 'male');
    assert.equal(CHARACTER_IDENTITY_ANCHOR_STORAGE_KEY, 'ainventory_char_identity_anchor_v9');
    const anchorKey = computeCharacterIdentityAnchorKey(normalizedClientProfile);
    assert.match(anchorKey, /^v9:male:176:70:standard_balanced:#DFBA9B:/);

    // Verify Node-safe behavior when document is undefined
    if (typeof document === 'undefined') {
      assert.equal(
        buildTurnaround3x2LayoutGuideDataUrl({
          backdropHex: '#94A3B8',
          heightCm: 176,
          weightKg: 70,
        }),
        null
      );
    }

    // Verify coldwave & wind pose prompts preserve upright 7.5-head posture and short-hair lock
    const coldwaveDirectives = buildWeatherPosePromptDirectives('coldwave');
    assert.match(coldwaveDirectives.poseDirective, /7\.5-head adult/);
    assert.match(coldwaveDirectives.negativeDirective, /NEVER hunch shoulders up to the ears/);

    const windDirectives = buildWeatherPosePromptDirectives('wind');
    assert.match(windDirectives.physicalTraceDirective, /NEVER grow shoulder-length or long billowing hair locks/);

    // Verify server/vtonService.js prompt integration
    const serverProfile = normalizeVtonProfile({
      gender: 'male',
      heightCm: 176,
      weightKg: 70,
      skinToneHex: '#DFBA9B',
      styleMode: 'stylized_isometric',
      turnaroundSheet: true,
      weather: 'coldwave',
    });
    assert.equal(serverProfile.gender, 'male');
    const serverPrompt = buildGeminiTryOnPrompt(serverProfile, {});
    assert.match(serverPrompt, /176cm \/ 70kg = BMI 22\.6/);
    assert.match(serverPrompt, /7\.5 heads tall/);
    assert.match(serverPrompt, /NEVER render photorealistic human photography/);
    assert.match(serverPrompt, /strictly above the shirt collar/);
  });

  it('erases tall vertical & horizontal panel grid divider lines both pre-crop and post-cutout while keeping the human silhouette intact', () => {
    // 1) Pre-crop 3x2 sheet buffer with #94A3B8 background + 4px #FFFFFF vertical divider lines at x=199..202 & x=399..402
    const sw = 600;
    const sh = 400;
    const sheet = new Uint8ClampedArray(sw * sh * 4);
    for (let i = 0; i < sw * sh; i += 1) {
      sheet[i * 4] = 148;
      sheet[i * 4 + 1] = 163;
      sheet[i * 4 + 2] = 184;
      sheet[i * 4 + 3] = 255;
    }
    // Draw human torso block in panel 0 (x=70..130, y=40..360)
    for (let y = 40; y < 360; y += 1) {
      for (let x = 70; x < 130; x += 1) {
        const idx = (y * sw + x) * 4;
        sheet[idx] = 196;
        sheet[idx + 1] = 158;
        sheet[idx + 2] = 112;
        sheet[idx + 3] = 255;
      }
    }
    // Draw full-height 4px white vertical grid divider line at x=198..201 and horizontal line at y=199..201
    for (let y = 0; y < sh; y += 1) {
      for (let x = 198; x <= 201; x += 1) {
        const idx = (y * sw + x) * 4;
        sheet[idx] = 255;
        sheet[idx + 1] = 255;
        sheet[idx + 2] = 255;
        sheet[idx + 3] = 255;
      }
    }
    for (let y = 199; y <= 201; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const idx = (y * sw + x) * 4;
        sheet[idx] = 255;
        sheet[idx + 1] = 255;
        sheet[idx + 2] = 255;
        sheet[idx + 3] = 255;
      }
    }

    eraseSheetGridDividerLinesInBuffer(sheet, sw, sh);
    // White vertical divider at (x=200, y=100) is overwritten with ~#94A3B8 background
    const divIdx = (100 * sw + 200) * 4;
    assert.ok(sheet[divIdx] < 180 && sheet[divIdx + 2] > 165);
    // Human torso at (x=100, y=100) remains untouched
    const humanIdx = (100 * sw + 100) * 4;
    assert.equal(sheet[humanIdx], 196);

    // 2) Post-cutout RGBA slice (240x360) with opaque white vertical pole at x=14..17 (even grazing sleeve for 6px!)
    const cw = 240;
    const ch = 360;
    const slice = new Uint8ClampedArray(cw * ch * 4);
    // Main human silhouette at x=80..165, y=35..330
    for (let y = 35; y < 330; y += 1) {
      for (let x = 80; x < 165; x += 1) {
        const idx = (y * cw + x) * 4;
        slice[idx] = 198;
        slice[idx + 1] = 160;
        slice[idx + 2] = 114;
        slice[idx + 3] = 255;
      }
    }
    // Tall 4px white vertical line artifact on left margin x=14..17, y=4..352
    for (let y = 4; y < 352; y += 1) {
      for (let x = 14; x <= 17; x += 1) {
        const idx = (y * cw + x) * 4;
        slice[idx] = 255;
        slice[idx + 1] = 255;
        slice[idx + 2] = 255;
        slice[idx + 3] = 255;
      }
    }

    scrubCutoutArtifactsInBuffer(slice, cw, ch);

    // Every pixel of the tall white vertical line MUST be transparent (alpha === 0)
    let remainingLineOpaque = 0;
    for (let y = 4; y < 352; y += 1) {
      for (let x = 14; x <= 17; x += 1) {
        if (slice[(y * cw + x) * 4 + 3] > 0) remainingLineOpaque += 1;
      }
    }
    assert.equal(remainingLineOpaque, 0);
    // Main human center remains 100% opaque
    assert.equal(slice[(180 * cw + 120) * 4 + 3], 255);
  });

  it('detects right-facing lateral direction accurately even when cel-shaded warm brown hair occupies the back-left of the head', () => {
    const cw = 240;
    const ch = 360;
    const buf = new Uint8ClampedArray(cw * ch * 4);
    // Head from y=40..76, x=96..144: left 2/3 warm brown hair (#6A4B3A), right 1/3 peach cheek/ear skin (#E8C0AE)
    for (let y = 40; y <= 76; y += 1) {
      for (let x = 96; x <= 144; x += 1) {
        const idx = (y * cw + x) * 4;
        if (x <= 128) {
          buf[idx] = 106;
          buf[idx + 1] = 75;
          buf[idx + 2] = 58;
          buf[idx + 3] = 255;
        } else {
          buf[idx] = 232;
          buf[idx + 1] = 192;
          buf[idx + 2] = 174;
          buf[idx + 3] = 255;
        }
      }
    }
    // Coat & symmetric-width legs from y=77..330, x=88..152 so fallback head detector is exercised
    for (let y = 77; y <= 330; y += 1) {
      for (let x = 88; x <= 152; x += 1) {
        const idx = (y * cw + x) * 4;
        buf[idx] = 185;
        buf[idx + 1] = 148;
        buf[idx + 2] = 104;
        buf[idx + 3] = 255;
      }
    }

    const dir = detectLateralFacingDirectionInBuffer(buf, cw, ch);
    assert.equal(dir, 'right');
  });

  it('computes device-adaptive ideal 1.0x mannequin base scale across phone, foldable, and desktop viewports', () => {
    const mobileSquare = computeIdealDeviceMannequinScale({
      stageWidth: 361,
      stageHeight: 500,
      imageAspectRatio: 1.0,
    });
    assert.ok(mobileSquare >= 1.32 && mobileSquare <= 1.52);

    const mobilePortraitSlice = computeIdealDeviceMannequinScale({
      stageWidth: 361,
      stageHeight: 500,
      imageAspectRatio: 0.74,
    });
    assert.ok(mobilePortraitSlice >= 1.14 && mobilePortraitSlice <= 1.24);

    const foldableWide = computeIdealDeviceMannequinScale({
      stageWidth: 717,
      stageHeight: 512,
      imageAspectRatio: 0.74,
    });
    assert.ok(foldableWide >= 1.14 && mobilePortraitSlice > 0 && foldableWide <= 1.2);
  });

  it('(a) keeps 3x2 grid active on square sheets when sleeves touch via head-cluster & x=0.50w center-column discriminators, and splits touching side-by-side twins via DP head-valley seam while sparing solo umbrella silhouettes', () => {
    // 1. Square 600x600 turnaround_3x2 sheet where adjacent sleeves/coats touch across x = 200 (1/3 w) and x = 400 (2/3 w)
    const sw = 600;
    const sh = 600;
    const rowH = 300;
    const sheet3x2 = new Uint8ClampedArray(sw * sh * 4);
    for (let i = 0; i < sw * sh; i += 1) {
      sheet3x2[i * 4] = 148;
      sheet3x2[i * 4 + 1] = 163;
      sheet3x2[i * 4 + 2] = 184;
      sheet3x2[i * 4 + 3] = 255;
    }

    const fillRect = (
      buf: Uint8ClampedArray,
      w: number,
      x0: number,
      x1: number,
      y0: number,
      y1: number,
      r: number,
      g: number,
      b: number,
      a = 255
    ) => {
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const idx = (y * w + x) * 4;
          buf[idx] = r;
          buf[idx + 1] = g;
          buf[idx + 2] = b;
          buf[idx + 3] = a;
        }
      }
    };

    for (const rowTop of [0, 300]) {
      // 3 distinct heads at x=100, x=300 (0.50w), x=500 in head-crown band (0.04..0.24 * rowH)
      for (const cx of [100, 300, 500]) {
        fillRect(sheet3x2, sw, cx - 18, cx + 18, rowTop + 20, rowTop + 56, 214, 174, 146);
        // Legs & feet
        fillRect(sheet3x2, sw, cx - 26, cx + 26, rowTop + 190, rowTop + 272, 42, 46, 56);
      }
      // Wide coats bridging across x=200 and x=400 at mid-body so full-row clustering merges into 1 giant run!
      fillRect(sheet3x2, sw, 64, 536, rowTop + 72, rowTop + 189, 52, 44, 38);
    }

    const topRowBuf = sheet3x2.subarray(0, rowH * sw * 4);
    const headSpans = detectRowHeadClustersInBuffer(topRowBuf, sw, rowH);
    assert.equal(headSpans.length, 3);
    const centerDensity = measureRowCenterForegroundDensityInBuffer(topRowBuf, sw, rowH);
    assert.ok(centerDensity > 0.25);

    const decision3x2 = resolveTurnaroundSheetGridDecisionInBuffer(sheet3x2, sw, sh, {
      layout: 'turnaround_3x2',
    });
    assert.equal(decision3x2.use3x2Grid, true);
    assert.ok(decision3x2.topClusters.length <= 2);
    assert.equal(decision3x2.topHeadClusters.length, 3);

    // Contrast: a true 2x2 sheet (figures at x=150 and x=450, empty central gutter at x=300) resolves use3x2Grid === false
    const sheet2x2 = new Uint8ClampedArray(sw * sh * 4);
    for (let i = 0; i < sw * sh; i += 1) {
      sheet2x2[i * 4] = 148;
      sheet2x2[i * 4 + 1] = 163;
      sheet2x2[i * 4 + 2] = 184;
      sheet2x2[i * 4 + 3] = 255;
    }
    for (const rowTop of [0, 300]) {
      for (const cx of [150, 450]) {
        fillRect(sheet2x2, sw, cx - 22, cx + 22, rowTop + 20, rowTop + 58, 214, 174, 146);
        fillRect(sheet2x2, sw, cx - 44, cx + 44, rowTop + 59, rowTop + 270, 52, 44, 38);
      }
    }
    const decision2x2 = resolveTurnaroundSheetGridDecisionInBuffer(sheet2x2, sw, sh, {
      layout: 'turnaround_3x2',
    });
    assert.equal(decision2x2.use3x2Grid, false);
    assert.equal(decision2x2.topCenterDensity, 0);

    // 2. Touching-Twin Head-Valley DP Seam Splitter on a 240x320 transparent slice
    const cw = 240;
    const ch = 320;
    const twinSlice = new Uint8ClampedArray(cw * ch * 4);
    // Primary figure (closer to slice center x=120): crimson coat (#C83C3C)
    fillRect(twinSlice, cw, 84, 112, 32, 66, 200, 60, 60, 255); // head
    fillRect(twinSlice, cw, 70, 130, 67, 210, 200, 60, 60, 255); // coat
    fillRect(twinSlice, cw, 76, 118, 211, 290, 200, 60, 60, 255); // legs
    // Secondary twin on right with touching coat sleeve at x=126..136, y=118..168: royal blue (#2850DC)
    fillRect(twinSlice, cw, 158, 186, 32, 66, 40, 80, 220, 255); // twin head
    fillRect(twinSlice, cw, 128, 202, 67, 210, 40, 80, 220, 255); // touching twin coat
    fillRect(twinSlice, cw, 150, 192, 211, 290, 40, 80, 220, 255); // twin legs

    const splitRes = splitTouchingTwinSilhouettesInBuffer(twinSlice, cw, ch);
    assert.equal(splitRes.modified, true);
    assert.equal(splitRes.keptSide, 'left');

    let crimsonOpaque = 0;
    let blueHeadOrLegOpaque = 0;
    for (let y = 0; y < ch; y += 1) {
      for (let x = 0; x < cw; x += 1) {
        const idx = (y * cw + x) * 4;
        if (twinSlice[idx + 3] === 0) continue;
        if (twinSlice[idx] === 200 && twinSlice[idx + 2] === 60) crimsonOpaque += 1;
        if (
          twinSlice[idx] === 40 &&
          twinSlice[idx + 2] === 220 &&
          (y <= 66 || y >= 211 || x >= 150)
        ) {
          blueHeadOrLegOpaque += 1;
        }
      }
    }
    assert.ok(crimsonOpaque > 8000);
    assert.equal(blueHeadOrLegOpaque, 0);

    // 3. Solo figure holding a wide overhead rain umbrella MUST NOT trigger twin splitting
    const umbrellaSlice = new Uint8ClampedArray(cw * ch * 4);
    fillRect(umbrellaSlice, cw, 52, 188, 20, 50, 48, 56, 68, 255); // wide dome umbrella (> 0.34*cw)
    fillRect(umbrellaSlice, cw, 104, 136, 56, 90, 218, 180, 154, 255); // solo head
    fillRect(umbrellaSlice, cw, 88, 152, 91, 290, 42, 44, 50, 255); // solo body
    const umbrellaRes = splitTouchingTwinSilhouettesInBuffer(umbrellaSlice, cw, ch);
    assert.equal(umbrellaRes.modified, false);
  });

  it('(b) switches studio backdrop key hex away from #94A3B8 when grey/white/slate shoes or garments are equipped, while keeping #94A3B8 by default and enforcing footwear symmetry + solo cell locks', () => {
    // Default / empty slots keep #94A3B8 for backward compatibility
    assert.equal(selectOptimalStudioKeyHex(), CUTOUT_STAGE_BACKDROP_HEX);
    assert.equal(selectOptimalStudioKeyHex([]), '#94A3B8');
    assert.match(buildWeatherPosePromptDirectives('rain').backdropDirective, /#94A3B8/);

    // Grey, slate, silver, charcoal, white, ivory, oatmeal shoes/garments switch away from #94A3B8
    const greyShoeHex = selectOptimalStudioKeyHex([
      { slot: 'shoes', colorHex: '#9CA3AF', colorName: '그레이 스웨이드 스니커즈' },
    ]);
    assert.notEqual(greyShoeHex, '#94A3B8');

    const whiteShoeHex = selectOptimalStudioKeyHex([
      { slot: 'shoes', colorHex: '#FFFFFF', colorName: '화이트 가죽 스니커즈' },
    ]);
    assert.notEqual(whiteShoeHex, '#94A3B8');

    assert.notEqual(
      selectOptimalStudioKeyHex([{ slot: 'shoes', colorName: 'ivory cream runner' }]),
      '#94A3B8'
    );
    assert.notEqual(selectOptimalStudioKeyHex(['그레이']), '#94A3B8');
    assert.notEqual(selectOptimalStudioKeyHex(['흰색']), '#94A3B8');
    assert.notEqual(selectOptimalStudioKeyHex(['slate']), '#94A3B8');

    // Multi-collision safety: if grey shoes + sage-green jacket (#5E9C7E) are both worn, picks another distinct key
    const multiSafeHex = selectOptimalStudioKeyHex([
      { slot: 'shoes', colorHex: '#D1D5DB', colorName: '실버 그레이' },
      { slot: 'outer', colorHex: '#5E9C7E', colorName: '세이지 그린' },
    ]);
    assert.notEqual(multiSafeHex, '#94A3B8');
    assert.notEqual(multiSafeHex, '#5E9C7E');

    // Prompt lock verification across weatherPromptBuilder, client vton2DService, and server vtonService
    assert.match(buildTurnaround3x2SheetAngleDirectives(), /SOLO SINGLE PERSON PER CELL LOCK/);
    assert.ok(SOLO_SINGLE_PERSON_PER_CELL_LOCK.includes('20% empty solid backdrop gutter'));
    assert.ok(FOOTWEAR_PAIR_SYMMETRY_LOCK.includes('IDENTICAL MATCHED PAIR'));

    const serverProfile = normalizeVtonProfile({
      gender: 'male',
      heightCm: 176,
      weightKg: 70,
      skinToneHex: '#DFBA9B',
      styleMode: 'stylized_isometric',
      turnaroundSheet: true,
      weather: 'clear',
    });
    const serverPrompt = buildGeminiTryOnPrompt(serverProfile, {
      shoes: {
        name: '그레이 러닝화',
        category: 'shoes',
        color_name: '그레이',
        color_hex: '#9CA3AF',
      },
    });
    assert.match(serverPrompt, /FOOTWEAR PAIR SYMMETRY LOCK/);
    assert.match(serverPrompt, /SOLO SINGLE PERSON PER CELL LOCK/);
    assert.doesNotMatch(serverPrompt, /\(#94A3B8\)/);
  });

  it('(c) punches enclosed #94A3B8 torso holes (~0.54*h) to alpha === 0 while protecting grey/slate shoe interiors in the footwear zone (>= 0.82*h)', () => {
    const w = 128;
    const h = 160;
    const rgba = new Uint8ClampedArray(w * h * 4);
    // Fill entire studio frame with #94A3B8 (148, 163, 184, 255)
    for (let i = 0; i < w * h; i += 1) {
      rgba[i * 4] = 148;
      rgba[i * 4 + 1] = 163;
      rgba[i * 4 + 2] = 184;
      rgba[i * 4 + 3] = 255;
    }

    // Draw dark navy figure silhouette from y=20..126, x=40..88
    for (let y = 20; y <= 126; y += 1) {
      for (let x = 40; x <= 88; x += 1) {
        const idx = (y * w + x) * 4;
        rgba[idx] = 28;
        rgba[idx + 1] = 34;
        rgba[idx + 2] = 46;
        rgba[idx + 3] = 255;
      }
    }

    // Punch an enclosed #94A3B8 arm-torso gap hole at x=56..72, y=80..92 (cy = 86 ~ 0.538*h)
    for (let y = 80; y <= 92; y += 1) {
      for (let x = 56; x <= 72; x += 1) {
        const idx = (y * w + x) * 4;
        rgba[idx] = 148;
        rgba[idx + 1] = 163;
        rgba[idx + 2] = 184;
        rgba[idx + 3] = 255;
      }
    }

    // Draw matched left & right shoes at y=127..144 (0.794*h .. 0.90*h) with dark outsoles/uppers
    // enclosing cool slate-grey (#94A3B8-identical!) suede tongue/interior panels at y=131..140 (0.82*h .. 0.875*h)
    for (const [sx0, sx1] of [
      [41, 59],
      [69, 87],
    ] as const) {
      for (let y = 127; y <= 144; y += 1) {
        for (let x = sx0; x <= sx1; x += 1) {
          const isShoeInterior = x >= sx0 + 3 && x <= sx1 - 3 && y >= 131 && y <= 140;
          const idx = (y * w + x) * 4;
          if (isShoeInterior) {
            rgba[idx] = 148;
            rgba[idx + 1] = 163;
            rgba[idx + 2] = 184;
            rgba[idx + 3] = 255;
          } else {
            rgba[idx] = 32;
            rgba[idx + 1] = 36;
            rgba[idx + 2] = 44;
            rgba[idx + 3] = 255;
          }
        }
      }
    }

    cutoutStudioBackdropToRgba(rgba, w, h);

    // Outer studio background is keyed to alpha === 0
    assert.equal(rgba[(2 * w + 2) * 4 + 3], 0);
    assert.equal(rgba[(155 * w + 125) * 4 + 3], 0);

    // Enclosed torso #94A3B8 hole at (64, 86) (~0.54*h) IS cleanly punched to alpha === 0
    assert.equal(rgba[(86 * w + 64) * 4 + 3], 0);

    // Grey/slate shoe interiors at y = 135 (0.844*h >= 0.82*h) on BOTH feet remain 100% opaque (alpha === 255)
    assert.equal(rgba[(135 * w + 50) * 4 + 3], 255);
    assert.equal(rgba[(135 * w + 78) * 4 + 3], 255);
  });

  it('(d) purges shaded #5E9C7E green triangles trapped between calves/ankles down to the floor (both opaque & alreadyTransparent PNGs)', () => {
    const w = 140;
    const h = 200;
    const drawScene = (outerAlpha: number) => {
      const buf = new Uint8ClampedArray(w * h * 4);
      // Outer backdrop #5E9C7E (94, 156, 126)
      for (let i = 0; i < w * h; i += 1) {
        buf[i * 4] = 94;
        buf[i * 4 + 1] = 156;
        buf[i * 4 + 2] = 126;
        buf[i * 4 + 3] = outerAlpha;
      }
      // Draw camel coat torso + long leg trousers from y=30..176 enclosing a narrow green triangle gap between calves (y=130..178)
      for (let y = 30; y <= 176; y += 1) {
        for (let x = 44; x <= 96; x += 1) {
          const isCalfGap = y >= 132 && y <= 174 && x >= 66 && x <= 74;
          const idx = (y * w + x) * 4;
          if (isCalfGap) {
            // Shaded sage-green studio triangle (#5E9C7E slightly darkened to ~76,136,108)
            buf[idx] = 76;
            buf[idx + 1] = 136;
            buf[idx + 2] = 108;
            buf[idx + 3] = 255;
          } else {
            buf[idx] = y < 126 ? 176 : 210; // camel coat upper, ivory slacks lower
            buf[idx + 1] = y < 126 ? 138 : 204;
            buf[idx + 2] = y < 126 ? 90 : 192;
            buf[idx + 3] = 255;
          }
        }
      }
      // Solid floor bridge across bottom shoes so the green gap at y=165 (~0.825*h) is 100% enclosed
      for (let y = 175; y <= 184; y += 1) {
        for (let x = 48; x <= 92; x += 1) {
          const idx = (y * w + x) * 4;
          buf[idx] = 28;
          buf[idx + 1] = 28;
          buf[idx + 2] = 32;
          buf[idx + 3] = 255;
        }
      }
      return buf;
    };

    const freshGreenBuf = drawScene(255);
    const freshRes = cutoutStudioBackdropToRgba(freshGreenBuf, w, h);
    assert.ok(freshRes.purgedHolePixels > 100);
    assert.equal(freshGreenBuf[(165 * w + 70) * 4 + 3], 0);
    assert.equal(freshGreenBuf[(150 * w + 55) * 4 + 3], 255); // ivory trouser leg preserved

    // Pre-transparent outer PNG still trapping shaded #5E9C7E leg-gap hole must ALSO purge it!
    const preCutBuf = drawScene(0);
    const preRes = cutoutStudioBackdropToRgba(preCutBuf, w, h);
    assert.ok(preRes.purgedHolePixels > 100);
    assert.equal(preCutBuf[(165 * w + 70) * 4 + 3], 0);
    assert.equal(preCutBuf[(150 * w + 55) * 4 + 3], 255);

    // Anti-aliased darker sage-green shadow band (#416E57) between boots down to floor must also purge
    const shadedGapBuf = drawScene(255);
    for (let y = 132; y <= 174; y += 1) {
      for (let x = 66; x <= 74; x += 1) {
        const idx = (y * w + x) * 4;
        shadedGapBuf[idx] = 65;
        shadedGapBuf[idx + 1] = 110;
        shadedGapBuf[idx + 2] = 87;
        shadedGapBuf[idx + 3] = 255;
      }
    }
    cutoutStudioBackdropToRgba(shadedGapBuf, w, h);
    assert.equal(shadedGapBuf[(165 * w + 70) * 4 + 3], 0);
    assert.equal(shadedGapBuf[(150 * w + 55) * 4 + 3], 255);
  });

  it('(e) finds Row 1 / Row 2 valley above or below h/2 so Row 2 135° heads are never decapitated, detects half-body & headless slices, and centers body axis independent of asymmetric briefcase/umbrella', () => {
    // 1. Dynamic Row Split Y when Row 1 umbrellas occupy y=10..126 and Row 2 begins early at y=136 (h=300, h/2=150 would clip Row 2 heads!)
    const sw = 240;
    const sh = 300;
    const sheet = new Uint8ClampedArray(sw * sh * 4);
    for (let i = 0; i < sw * sh; i += 1) {
      sheet[i * 4] = 148;
      sheet[i * 4 + 1] = 163;
      sheet[i * 4 + 2] = 184;
      sheet[i * 4 + 3] = 255;
    }
    const drawSheetFig = (x0: number, x1: number, y0: number, y1: number) => {
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const idx = (y * sw + x) * 4;
          sheet[idx] = 36;
          sheet[idx + 1] = 42;
          sheet[idx + 2] = 54;
          sheet[idx + 3] = 255;
        }
      }
    };
    // Row 1 figures end at y=126; empty valley y=127..135 (mid 131); Row 2 figures start at y=136 (above h/2=150!)
    drawSheetFig(20, 60, 12, 126);
    drawSheetFig(100, 140, 12, 126);
    drawSheetFig(180, 220, 12, 126);
    drawSheetFig(20, 60, 136, 286);
    drawSheetFig(100, 140, 136, 286);
    drawSheetFig(180, 220, 136, 286);

    const splitY = resolveTurnaroundRowSplitYInBuffer(sheet, sw, sh);
    assert.ok(splitY >= 127 && splitY <= 135, `Expected valley splitY in [127..135], got ${splitY}`);

    // 2. Full-body vs half-body & headless slice integrity
    const pw = 120;
    const ph = 180;
    const fullBody = new Uint8ClampedArray(pw * ph * 4);
    const fillOpaque = (buf: Uint8ClampedArray, x0: number, x1: number, y0: number, y1: number) => {
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const idx = (y * pw + x) * 4;
          buf[idx] = 50;
          buf[idx + 1] = 50;
          buf[idx + 2] = 60;
          buf[idx + 3] = 255;
        }
      }
    };
    fillOpaque(fullBody, 50, 70, 14, 34); // head crown
    fillOpaque(fullBody, 40, 80, 35, 110); // torso & coat
    fillOpaque(fullBody, 46, 56, 111, 166); // left leg + briefcase test extension below
    fillOpaque(fullBody, 64, 74, 111, 166); // right leg + shoe
    assert.equal(inspectTurnaroundSliceIntegrityInBuffer(fullBody, pw, ph).reason, 'ok');

    // Headless cut at y=0..2 (broad coat shoulders hitting top edge)
    const headless = new Uint8ClampedArray(pw * ph * 4);
    fillOpaque(headless, 34, 86, 0, 96);
    fillOpaque(headless, 46, 56, 97, 166);
    fillOpaque(headless, 64, 74, 97, 166);
    const headlessRep = inspectTurnaroundSliceIntegrityInBuffer(headless, pw, ph);
    assert.equal(headlessRep.ok, false);
    assert.equal(headlessRep.reason, 'clipped_top');

    // Floating waist-up half-body shot (~43% height ending wide across coat hem)
    const halfBody = new Uint8ClampedArray(pw * ph * 4);
    fillOpaque(halfBody, 48, 72, 24, 42);
    fillOpaque(halfBody, 34, 86, 43, 98);
    const halfBodyRep = inspectTurnaroundSliceIntegrityInBuffer(halfBody, pw, ph);
    assert.equal(halfBodyRep.ok, false);
    assert.equal(halfBodyRep.reason, 'half_body');

    // 3. Asymmetric prop (heavy left briefcase + tilted right umbrella + long protruding 90° shoe toe)
    // must NOT skew lower-ankle standing center X
    const propFig = new Uint8ClampedArray(pw * ph * 4);
    fillOpaque(propFig, 54, 66, 20, 40); // head centered at x=60
    fillOpaque(propFig, 46, 74, 41, 128); // torso centered at x=60
    fillOpaque(propFig, 10, 45, 76, 118); // huge left-hand briefcase pulling overall bounding box left!
    fillOpaque(propFig, 52, 68, 129, 158); // calves/ankles anchored right around x=60
    fillOpaque(propFig, 52, 92, 159, 168); // long right-pointing 90° dress shoe toe protruding to x=92!
    const coreCx = computeCoreAnatomicalCenterXInBuffer(propFig, pw, ph);
    assert.ok(Math.abs(coreCx - 60) <= 2, `Expected core standing center ~60, got ${coreCx}`);

    // 4. Shifted waist-down crop (moved down to y=42..168 by floor baseline shift!) MUST still fail as clipped_top
    const shiftedWaistCrop = new Uint8ClampedArray(pw * ph * 4);
    fillOpaque(shiftedWaistCrop, 36, 84, 42, 110); // flat cut across waist/coat (width 49)
    fillOpaque(shiftedWaistCrop, 46, 56, 111, 168);
    fillOpaque(shiftedWaistCrop, 64, 74, 111, 168);
    const shiftedRep = inspectTurnaroundSliceIntegrityInBuffer(shiftedWaistCrop, pw, ph);
    assert.equal(shiftedRep.ok, false);
    assert.equal(shiftedRep.reason, 'clipped_top');

    // 5. Genuine full-body character holding a rounded overhead umbrella MUST pass inspectTurnaroundSliceIntegrityInBuffer
    const fullWithUmbrella = new Uint8ClampedArray(pw * ph * 4);
    fillOpaque(fullWithUmbrella, 58, 62, 12, 14); // narrow finial tip
    fillOpaque(fullWithUmbrella, 24, 96, 15, 34); // dome widens sharply below tip
    fillOpaque(fullWithUmbrella, 50, 70, 35, 52); // head
    fillOpaque(fullWithUmbrella, 40, 80, 53, 120); // coat torso
    fillOpaque(fullWithUmbrella, 46, 56, 121, 168);
    fillOpaque(fullWithUmbrella, 64, 74, 121, 168);
    assert.equal(inspectTurnaroundSliceIntegrityInBuffer(fullWithUmbrella, pw, ph).reason, 'ok');
  });

  it('(f) normalizes bare-head, umbrella-holding, undersized, and briefcase-carrying silhouettes to identical human body stature (0.72*H), 0.945*H floor baseline, and exact 3:4 portrait aspect ratio', () => {
    const paintRect = (
      buf: Uint8ClampedArray,
      w: number,
      x0: number,
      x1: number,
      y0: number,
      y1: number
    ) => {
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const idx = (y * w + x) * 4;
          buf[idx] = 48;
          buf[idx + 1] = 52;
          buf[idx + 2] = 64;
          buf[idx + 3] = 255;
        }
      }
    };

    // Figure A: Large bare-head human inside a 600x800 frame (human head y=80..140, feet bottom y=739 -> height 660)
    const wA = 600;
    const hA = 800;
    const figBareLarge = new Uint8ClampedArray(wA * hA * 4);
    paintRect(figBareLarge, wA, 270, 330, 80, 140); // head
    paintRect(figBareLarge, wA, 235, 365, 141, 460); // torso/coat (width 131)
    paintRect(figBareLarge, wA, 255, 285, 461, 739); // left leg
    paintRect(figBareLarge, wA, 315, 345, 461, 739); // right leg

    // Figure B: Undersized umbrella-holding human inside a 540x720 frame (umbrella y=40..105, head y=118..162, feet y=577 -> human height 460)
    const wB = 540;
    const hB = 720;
    const figUmbrellaSmall = new Uint8ClampedArray(wB * hB * 4);
    paintRect(figUmbrellaSmall, wB, 267, 273, 40, 46); // finial tip
    paintRect(figUmbrellaSmall, wB, 140, 400, 47, 105); // wide overhead umbrella dome (span 261 >= 1.38*97)
    paintRect(figUmbrellaSmall, wB, 267, 273, 106, 117); // thin umbrella shaft above crown
    paintRect(figUmbrellaSmall, wB, 248, 292, 118, 162); // head crown at y=118
    paintRect(figUmbrellaSmall, wB, 222, 318, 163, 390); // torso (width 97)
    paintRect(figUmbrellaSmall, wB, 240, 262, 391, 577); // left leg
    paintRect(figUmbrellaSmall, wB, 278, 300, 391, 577); // right leg
    paintRect(figUmbrellaSmall, wB, 170, 218, 290, 380); // side briefcase

    const coreA = detectCoreHumanVerticalBoundsInBuffer(figBareLarge, wA, hA);
    const coreB = detectCoreHumanVerticalBoundsInBuffer(figUmbrellaSmall, wB, hB);
    assert.ok(coreA && coreB);
    assert.equal(coreA.hasOverheadProp, false);
    assert.equal(coreA.humanCrownY, 80);
    assert.equal(coreA.footSoleY, 739);

    assert.equal(coreB.hasOverheadProp, true);
    assert.equal(coreB.humanCrownY, 118);
    assert.equal(coreB.footSoleY, 577);

    const targetH = 800;
    const placeA = computeUniformStaturePlacement({
      totalW: wA,
      totalH: hA,
      coreBounds: coreA,
      targetH,
    });
    const placeB = computeUniformStaturePlacement({
      totalW: wB,
      totalH: hB,
      coreBounds: coreB,
      targetH,
    });

    // Both output onto identical locked 3:4 portrait aspect ratio (600x800)
    assert.equal(placeA.canonicalW, Math.round(targetH * CANONICAL_PORTRAIT_ASPECT_RATIO));
    assert.equal(placeB.canonicalW, Math.round(targetH * CANONICAL_PORTRAIT_ASPECT_RATIO));
    assert.equal(placeA.canonicalH, targetH);
    assert.equal(placeB.canonicalH, targetH);

    // Rendered human crown-to-sole pixel heights match 0.72 * targetH identically!
    const renderedHumanHeightA = (coreA.footSoleY - coreA.humanCrownY + 1) * placeA.scale;
    const renderedHumanHeightB = (coreB.footSoleY - coreB.humanCrownY + 1) * placeB.scale;
    const expectedStature = targetH * CANONICAL_HUMAN_STATURE_RATIO;
    assert.ok(Math.abs(renderedHumanHeightA - expectedStature) <= 2);
    assert.ok(Math.abs(renderedHumanHeightB - expectedStature) <= 2);
    assert.ok(Math.abs(renderedHumanHeightA - renderedHumanHeightB) <= 2);

    // Both foot soles align onto the exact floor baseline (0.945 * targetH) & umbrella top stays inside canvas (> 0)
    const renderedSoleA = coreA.footSoleY * placeA.scale + placeA.dstY;
    const renderedSoleB = coreB.footSoleY * placeB.scale + placeB.dstY;
    const renderedUmbrellaTopB = coreB.minY * placeB.scale + placeB.dstY;
    assert.ok(Math.abs(renderedSoleA - targetH * CANONICAL_FLOOR_BASELINE_RATIO) <= 1.5);
    assert.ok(Math.abs(renderedSoleB - targetH * CANONICAL_FLOOR_BASELINE_RATIO) <= 1.5);
    assert.ok(renderedUmbrellaTopB >= 8, `Umbrella finial clipped top: ${renderedUmbrellaTopB}`);

    // Both anatomical centers land at dead-center X (canonicalW * 0.5)
    const renderedCenterA = coreA.coreCx * placeA.scale + placeA.dstX;
    const renderedCenterB = coreB.coreCx * placeB.scale + placeB.dstX;
    assert.ok(Math.abs(renderedCenterA - placeA.canonicalW * 0.5) <= 2);
    assert.ok(Math.abs(renderedCenterB - placeB.canonicalW * 0.5) <= 2);
  });

  it('(g) protects cool-grey blazers, powder-blue shirts, and cream trousers against low-saturation neutral studio walls while keying outer backdrop cleanly', () => {
    const w = 160;
    const h = 220;
    const rgba = new Uint8ClampedArray(w * h * 4);
    // Cool neutral studio backdrop rgb(188, 194, 201)
    for (let i = 0; i < w * h; i += 1) {
      rgba[i * 4] = 188;
      rgba[i * 4 + 1] = 194;
      rgba[i * 4 + 2] = 201;
      rgba[i * 4 + 3] = 255;
    }

    const paintRect = (
      x0: number,
      x1: number,
      y0: number,
      y1: number,
      r: number,
      g: number,
      b: number
    ) => {
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const idx = (y * w + x) * 4;
          rgba[idx] = r;
          rgba[idx + 1] = g;
          rgba[idx + 2] = b;
          rgba[idx + 3] = 255;
        }
      }
    };

    // Head/skin, powder-blue turtleneck, cool-grey blazer, shaded cream trousers, brown shoes
    paintRect(68, 92, 18, 44, 212, 168, 146);
    paintRect(66, 94, 45, 76, 156, 178, 198); // powder-blue turtleneck close to backdrop
    paintRect(52, 65, 48, 108, 166, 170, 176); // left blazer panel close to backdrop
    paintRect(95, 108, 48, 108, 166, 170, 176); // right blazer panel close to backdrop
    paintRect(58, 76, 109, 184, 208, 204, 192); // shaded cream trousers left leg
    paintRect(84, 102, 109, 184, 208, 204, 192); // shaded cream trousers right leg
    paintRect(58, 76, 185, 196, 128, 72, 42); // brown leather shoes
    paintRect(84, 102, 185, 196, 128, 72, 42);

    cutoutStudioBackdropToRgba(rgba, w, h);

    // Outer backdrop corners become transparent
    assert.equal(rgba[(2 * w + 2) * 4 + 3], 0);
    assert.equal(rgba[(215 * w + 155) * 4 + 3], 0);

    // Blazer, powder-blue shirt, and both legs of cream trousers remain 100% opaque
    assert.equal(rgba[(60 * w + 80) * 4 + 3], 255); // turtleneck chest
    assert.equal(rgba[(80 * w + 58) * 4 + 3], 255); // blazer left panel
    assert.equal(rgba[(80 * w + 102) * 4 + 3], 255); // blazer right panel
    assert.equal(rgba[(150 * w + 67) * 4 + 3], 255); // cream trousers left leg
    assert.equal(rgba[(150 * w + 93) * 4 + 3], 255); // cream trousers right leg
  });

  it('(h) simultaneously serializes 2-stage Top (top + top_mid) and 2-stage Outer (outer_mid + outer) slots into client & server VTON prompts', () => {
    const layeredSlots = {
      top: {
        id: 302,
        name: '스카이블루 코튼 옥스포드 버튼다운 셔츠',
        category: 'top',
        subcategory: 'shirt',
        colorName: '스카이블루',
        colorHex: '#A7C4DC',
        fabric: 'cotton',
      },
      top_mid: {
        id: 305,
        name: '차콜 울 테일러드 웨이스트코트 조끼',
        category: 'top',
        subcategory: 'vest',
        colorName: '차콜',
        colorHex: '#33353A',
        fabric: 'wool',
      },
      outer_mid: {
        id: 307,
        name: '슬레이트 그레이 울 싱글 미드 블레이저',
        category: 'outer',
        subcategory: 'blazer',
        colorName: '그레이',
        colorHex: '#595E66',
        fabric: 'wool',
      },
      outer: {
        id: 309,
        name: '카멜 헤어 더블 브레스티드 오버코트',
        category: 'outer',
        subcategory: 'coat',
        colorName: '카멜',
        colorHex: '#B3895D',
        fabric: 'wool',
      },
    };

    const serverProfile = normalizeVtonProfile({
      gender: 'male',
      heightCm: 176,
      weightKg: 70,
      skinToneHex: '#DFBA9B',
      styleMode: 'stylized_isometric',
      turnaroundSheet: true,
      weather: 'clear',
    });
    const serverPrompt = buildGeminiTryOnPrompt(serverProfile, layeredSlots);
    assert.match(serverPrompt, /Layer the mid-layer cardigan\/vest\/knit cleanly OVER the inner base top/);
    assert.match(serverPrompt, /Layer the 그레이 mid-layer blazer cleanly OVER the inner top\/knit/);
    assert.match(serverPrompt, /worn as the 2nd mid-layer cardigan or tailored vest\/knit cleanly OVER \[TOP\]/);
    assert.match(serverPrompt, /worn as the 3rd mid-outerwear blazer\/blouson\/jacket cleanly OVER \[TOP\]\/\[TOP_MID\]/);
    assert.match(serverPrompt, /Render the outermost 카멜 wool coat uniformly on BOTH/);
  });

  it('(i) preserves shaded muted-cool 0° right sleeves and 45° chest interiors matching #94A3B8 chroma ratio (lum <= 124) while keying outer backdrop', () => {
    const w = 160;
    const h = 220;
    const rgba = new Uint8ClampedArray(w * h * 4);
    // Cool slate-blue studio backdrop rgb(148, 163, 184)
    for (let i = 0; i < w * h; i += 1) {
      rgba[i * 4] = 148;
      rgba[i * 4 + 1] = 163;
      rgba[i * 4 + 2] = 184;
      rgba[i * 4 + 3] = 255;
    }
    const paint = (
      x0: number,
      x1: number,
      y0: number,
      y1: number,
      fn: (x: number, y: number) => [number, number, number]
    ) => {
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const [r, g, b] = fn(x, y);
          const idx = (y * w + x) * 4;
          rgba[idx] = r;
          rgba[idx + 1] = g;
          rgba[idx + 2] = b;
          rgba[idx + 3] = 255;
        }
      }
    };

    // Head
    paint(68, 92, 16, 44, () => [216, 174, 148]);
    // Dark blazer shell around chest & sleeves
    paint(52, 108, 45, 114, () => [32, 36, 44]);
    // 45° Shaded Muted Cool-Slate Knit Chest Interior (lum ~ 115 <= 124, identical hue ratio to #94A3B8!)
    paint(66, 94, 52, 92, () => [102, 116, 134]);
    // 0° Right Sleeve in shaded slate-navy (lum ~ 111 <= 124, identical hue ratio to #94A3B8, y=58..106, x=100..118)
    paint(100, 118, 58, 106, () => [98, 112, 130]);
    // Enclosed real #94A3B8 gap under left arm (x=42..49, y=72..92) bounded by outer sleeve edge (x=38..41)
    paint(38, 41, 58, 106, () => [32, 36, 44]);
    paint(42, 51, 58, 71, () => [32, 36, 44]);
    paint(42, 51, 93, 106, () => [32, 36, 44]);
    // Trousers + shoes
    paint(58, 76, 115, 186, () => [48, 52, 60]);
    paint(84, 102, 115, 186, () => [48, 52, 60]);
    paint(58, 76, 187, 198, () => [28, 28, 32]);
    paint(84, 102, 187, 198, () => [28, 28, 32]);

    cutoutStudioBackdropToRgba(rgba, w, h);

    // Outer studio background & enclosed underarm gap become transparent
    assert.equal(rgba[(2 * w + 2) * 4 + 3], 0);
    assert.equal(rgba[(82 * w + 46) * 4 + 3], 0);
    // Shaded cool-slate 45° knit chest & 0° right sleeve remain 100% opaque (alpha === 255)
    assert.equal(rgba[(72 * w + 80) * 4 + 3], 255);
    assert.equal(rgba[(82 * w + 109) * 4 + 3], 255);
  });

  it('(j) preserves light-blue turtleneck collars during alreadyTransparent hole sweep and preserves cream trouser outer edges in the lower studio floor zone', () => {
    const w = 160;
    const h = 220;
    // 1) Already-transparent PNG with light-blue turtleneck collar rgb(149, 164, 183) at center neck
    const transBuf = new Uint8ClampedArray(w * h * 4);
    const fill = (buf: Uint8ClampedArray, x0: number, x1: number, y0: number, y1: number, r: number, g: number, b: number) => {
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const idx = (y * w + x) * 4;
          buf[idx] = r;
          buf[idx + 1] = g;
          buf[idx + 2] = b;
          buf[idx + 3] = 255;
        }
      }
    };
    fill(transBuf, 68, 92, 18, 44, 214, 174, 150); // face
    fill(transBuf, 68, 92, 45, 76, 149, 164, 183); // light-blue turtleneck collar near #94A3B8!
    fill(transBuf, 52, 67, 48, 114, 144, 148, 154); // grey blazer
    fill(transBuf, 93, 108, 48, 114, 144, 148, 154);
    fill(transBuf, 58, 76, 115, 190, 212, 210, 202); // cream trousers
    fill(transBuf, 84, 102, 115, 190, 212, 210, 202);

    cutoutStudioBackdropToRgba(transBuf, w, h);
    assert.equal(transBuf[(55 * w + 80) * 4 + 3], 255);

    // 2) Cool neutral studio wall/floor rgb(172, 180, 191) with warm cream trousers rgb(199, 200, 195) in floor zone (y >= 0.72*h)
    const opaqueBuf = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
      opaqueBuf[i * 4] = 172;
      opaqueBuf[i * 4 + 1] = 180;
      opaqueBuf[i * 4 + 2] = 191;
      opaqueBuf[i * 4 + 3] = 255;
    }
    fill(opaqueBuf, 68, 92, 18, 44, 214, 174, 150);
    fill(opaqueBuf, 66, 94, 45, 114, 140, 144, 150);
    fill(opaqueBuf, 58, 76, 115, 186, 199, 200, 195); // shaded cream trousers extending down to y=186 (>0.72*h)
    fill(opaqueBuf, 84, 102, 115, 186, 199, 200, 195);
    fill(opaqueBuf, 58, 76, 187, 196, 122, 68, 38);
    fill(opaqueBuf, 84, 102, 187, 196, 122, 68, 38);

    cutoutStudioBackdropToRgba(opaqueBuf, w, h);
    assert.equal(opaqueBuf[(2 * w + 2) * 4 + 3], 0);
    assert.equal(opaqueBuf[(170 * w + 59) * 4 + 3], 255); // outer cream trouser hem preserved in floor zone!
    assert.equal(opaqueBuf[(170 * w + 101) * 4 + 3], 255);
  });

  it('(k) computes responsive ResizeObserver floor placement across iOS notch, Android foldable, and desktop viewports while clamping overhead umbrella headroom', () => {
    const mobilePlace = computeMannequinFloorPlacement({
      stageWidth: 369,
      stageHeight: 610,
      imageAspectRatio: 0.75,
    });
    const foldablePlace = computeMannequinFloorPlacement({
      stageWidth: 693,
      stageHeight: 660,
      imageAspectRatio: 0.75,
    });
    const desktopPlace = computeMannequinFloorPlacement({
      stageWidth: 790,
      stageHeight: 740,
      imageAspectRatio: 0.75,
    });

    // Narrow mobile compensates for aspect/width choke so character stays prominent without clipping
    assert.ok(mobilePlace.effectiveBaseScale > 1.0 && mobilePlace.effectiveBaseScale <= 1.58);
    assert.ok(foldablePlace.effectiveBaseScale >= 1.0 && foldablePlace.effectiveBaseScale <= 1.58);
    assert.ok(desktopPlace.effectiveBaseScale >= 1.0 && desktopPlace.effectiveBaseScale <= 1.58);
    assert.match(mobilePlace.soleTransformOrigin, /^50% \d+\.\d{2}%$/);
    assert.ok(mobilePlace.soleStageTopPct >= 72 && mobilePlace.soleStageTopPct <= 96);

    // Tall umbrella canopy (topRatio near canvas top) clamps scale down safely without vertical crown clipping
    const standardHead = computeMannequinFloorPlacement({
      stageWidth: 600,
      stageHeight: 660,
      imageAspectRatio: 0.75,
      topRatio: 0.14,
      bottomRatio: 0.95,
    });
    const tallUmbrella = computeMannequinFloorPlacement({
      stageWidth: 600,
      stageHeight: 660,
      imageAspectRatio: 0.75,
      topRatio: 0.02,
      bottomRatio: 0.95,
    });
    assert.ok(
      tallUmbrella.effectiveBaseScale <= standardHead.effectiveBaseScale,
      `Expected overhead canopy (${tallUmbrella.effectiveBaseScale}) to clamp scale <= standard (${standardHead.effectiveBaseScale})`
    );
    assert.ok(tallUmbrella.effectiveBaseScale >= 0.72);

    // Null/undefined probe bounds must never coerce via Number(null) === 0 down to 84% floor origin
    const unmeasuredDesktop = computeMannequinFloorPlacement({
      stageWidth: 620,
      stageHeight: 620,
      imageAspectRatio: 0.752,
      topRatio: null,
      bottomRatio: null,
    });
    assert.equal(unmeasuredDesktop.soleTransformOrigin, '50% 95.50%');
    assert.ok(
      unmeasuredDesktop.soleStageTopPct > 84,
      `Expected soleStageTopPct > 84 when unmeasured, got ${unmeasuredDesktop.soleStageTopPct}`
    );
    assert.ok(unmeasuredDesktop.effectiveBaseScale > 1.05);
  });

  it('(l) isolates outfitComboId and showcase cache keys by handedness and equipped bag asset', () => {
    const toteBagA = {
      id: 901,
      name: '레더 구조감 토트백',
      category: 'accessory',
      subcategory: 'tote',
      color_hex: '#2F241D',
      image_url: '/seed/bag-tote-brown.png',
    };
    const crossbodyBagB = {
      id: 902,
      name: '캔버스 크로스백',
      category: 'accessory',
      subcategory: 'crossbody',
      color_hex: '#C4B69F',
      image_url: '/seed/bag-canvas-sand.png',
    };
    const coat = {
      id: 101,
      name: '카멜 헤어 코트',
      category: 'outer',
      subcategory: 'coat',
      color_hex: '#B08048',
    };

    const comboRight = computeOutfitComboId({ outer: coat, accessory: toteBagA }, 'right');
    const comboLeft = computeOutfitComboId({ outer: coat, accessory: toteBagA }, 'left');
    assert.notEqual(comboRight.outfitComboId, comboLeft.outfitComboId);

    const keyRight = resolveShowcaseCacheKey('stylized_isometric', {
      handedness: 'right',
      hasEquippedBag: true,
      bagGarment: toteBagA,
    });
    const keyLeftA = resolveShowcaseCacheKey('stylized_isometric', {
      handedness: 'left',
      hasEquippedBag: true,
      bagGarment: toteBagA,
    });
    const keyLeftB = resolveShowcaseCacheKey('stylized_isometric', {
      handedness: 'left',
      hasEquippedBag: true,
      bagGarment: crossbodyBagB,
    });
    const keyLeftNoBag = resolveShowcaseCacheKey('stylized_isometric', {
      handedness: 'left',
      hasEquippedBag: false,
      bagGarment: null,
    });

    assert.equal(keyRight.mirrorForLeftHanded, false);
    assert.equal(keyLeftA.mirrorForLeftHanded, true);
    assert.notEqual(keyRight.cacheKey, keyLeftA.cacheKey);
    assert.notEqual(keyLeftA.cacheKey, keyLeftB.cacheKey);
    assert.equal(keyLeftNoBag.mirrorForLeftHanded, false);
    assert.equal(keyLeftNoBag.cacheKey, keyRight.cacheKey);
  });

  it('(m) infers #D8CFC4 warm-stone perimeter before @imgly and purges trapped under-umbrella canopy pockets without eating camel outerwear or face skin', () => {
    const w = 160;
    const h = 220;
    const paintScene = (buf: Uint8ClampedArray, outerAlpha: number) => {
      for (let i = 0; i < w * h; i += 1) {
        buf[i * 4] = 216;
        buf[i * 4 + 1] = 207;
        buf[i * 4 + 2] = 196;
        buf[i * 4 + 3] = outerAlpha;
      }
      const fill = (x0: number, x1: number, y0: number, y1: number, r: number, g: number, b: number) => {
        for (let y = y0; y <= y1; y += 1) {
          for (let x = x0; x <= x1; x += 1) {
            const idx = (y * w + x) * 4;
            buf[idx] = r;
            buf[idx + 1] = g;
            buf[idx + 2] = b;
            buf[idx + 3] = 255;
          }
        }
      };
      // Overhead dark umbrella dome + outer enclosure ribs framing under-canopy #D8CFC4 / shaded pockets
      fill(16, 144, 14, 42, 34, 38, 46);
      fill(16, 24, 43, 84, 34, 38, 46);
      fill(136, 144, 43, 84, 34, 38, 46);
      // Trapped #D8CFC4 (left) & shaded #C0B8AE (right) warm-stone backdrop pockets under umbrella dome
      fill(25, 65, 43, 80, 216, 207, 196);
      fill(95, 135, 43, 80, 192, 184, 174);
      // Head/face skin & hair crown at center
      fill(66, 94, 43, 78, 214, 172, 148);
      // Shoulder bridge & tailored camel coat (#B08048) torso/waist
      fill(20, 140, 81, 90, 176, 128, 72);
      fill(52, 108, 91, 144, 176, 128, 72);
      // Cream trousers & shoes
      fill(58, 76, 145, 186, 212, 208, 198);
      fill(84, 102, 145, 186, 212, 208, 198);
      fill(58, 76, 187, 196, 36, 36, 40);
      fill(84, 102, 187, 196, 36, 36, 40);
    };

    const rawOpaque = new Uint8ClampedArray(w * h * 4);
    paintScene(rawOpaque, 255);
    const inferredBackdropRgb = inferOuterPerimeterBackdropRgb(rawOpaque, w, h);
    assert.deepEqual(inferredBackdropRgb, [216, 207, 196]);

    // Simulate @imgly stripping outer perimeter to alpha=0 while trapping #D8CFC4 / shaded pocket under the dome
    const postImglyBuf = new Uint8ClampedArray(w * h * 4);
    paintScene(postImglyBuf, 0);
    const res = cutoutStudioBackdropToRgba(postImglyBuf, w, h, { inferredBackdropRgb });
    assert.ok(res.purgedHolePixels > 150);

    // Both exact #D8CFC4 and shaded #C0B8AE under-umbrella sky cavities become transparent (alpha === 0)
    assert.equal(postImglyBuf[(62 * w + 45) * 4 + 3], 0);
    assert.equal(postImglyBuf[(62 * w + 115) * 4 + 3], 0);

    // Face skin, umbrella canopy, camel coat (#B08048), and trousers stay opaque
    assert.equal(postImglyBuf[(28 * w + 80) * 4 + 3], 255);
    assert.equal(postImglyBuf[(60 * w + 80) * 4 + 3], 255);
    assert.equal(postImglyBuf[(110 * w + 80) * 4 + 3], 255);
    assert.equal(postImglyBuf[(168 * w + 66) * 4 + 3], 255);
  });
});




