import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildGeminiTryOnPrompt,
  normalizeVtonProfile,
} from '../../server/vtonService.js';
import {
  CHARACTER_IDENTITY_ANCHOR_STORAGE_KEY,
  angle360ToSignedScrollDeg,
  buildTurnaround3x2LayoutGuideDataUrl,
  computeCharacterIdentityAnchorKey,
  computeIdealDeviceMannequinScale,
  detectLateralFacingDirectionInBuffer,
  eraseSheetGridDividerLinesInBuffer,
  getShowcaseDemoSheetUrl,
  normalizeGenderNeutralProfile,
  resolve360AngleRenderSpec,
  resolveEffectiveVtonStyleMode,
  resolveSignedAngleScrollState,
  scrubCutoutArtifactsInBuffer,
} from '../../src/services/vton2DService.ts';
import {
  CANONICAL_ANGLE_PROMPT_DIRECTIVES,
  CUTOUT_PIPELINE_VERSION,
  buildCanonicalCharacterIdentityPromptBlock,
  buildWeatherPosePromptDirectives,
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
    assert.equal(CUTOUT_PIPELINE_VERSION, 'v8-consistent-avatar-3x2-cyclorama');
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
    assert.equal(resolve360AngleRenderSpec(neg45.angle360).mirrorX, true);

    const neg90 = resolveSignedAngleScrollState(-90);
    assert.equal(neg90.angle360, 270);
    assert.equal(resolve360AngleRenderSpec(neg90.angle360).mirrorX, true);

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
    assert.equal(CHARACTER_IDENTITY_ANCHOR_STORAGE_KEY, 'ainventory_char_identity_anchor_v8');
    const anchorKey = computeCharacterIdentityAnchorKey(normalizedClientProfile);
    assert.match(anchorKey, /^v8:male:176:70:standard_balanced:#DFBA9B:/);

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
    assert.ok(mobileSquare >= 1.25 && mobileSquare <= 1.44);

    const mobilePortraitSlice = computeIdealDeviceMannequinScale({
      stageWidth: 361,
      stageHeight: 500,
      imageAspectRatio: 0.74,
    });
    assert.ok(mobilePortraitSlice >= 1.07 && mobilePortraitSlice <= 1.16);

    const foldableWide = computeIdealDeviceMannequinScale({
      stageWidth: 717,
      stageHeight: 512,
      imageAspectRatio: 0.74,
    });
    assert.ok(foldableWide >= 1.05 && foldableWide <= 1.14);
  });
});
