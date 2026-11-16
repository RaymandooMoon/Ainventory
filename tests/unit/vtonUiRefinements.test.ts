import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  angle360ToSignedScrollDeg,
  computeIdealDeviceMannequinScale,
  resolve360AngleRenderSpec,
  resolveEffectiveVtonStyleMode,
  resolveSignedAngleScrollState,
} from '../../src/services/vton2DService.ts';
import { CANONICAL_ANGLE_PROMPT_DIRECTIVES } from '../../src/services/weatherPromptBuilder.ts';

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

  it('aligns slider direction with head/gaze direction across front-quarter, side, and rear-quarter views', () => {
    assert.match(CANONICAL_ANGLE_PROMPT_DIRECTIVES[45], /SCREEN-RIGHT/i);
    assert.match(CANONICAL_ANGLE_PROMPT_DIRECTIVES[90], /SCREEN-RIGHT/i);
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
    assert.ok(mobilePortraitSlice >= 1.07 && mobilePortraitSlice <= 1.2);

    const foldableWide = computeIdealDeviceMannequinScale({
      stageWidth: 717,
      stageHeight: 512,
      imageAspectRatio: 0.74,
    });
    assert.ok(foldableWide >= 1.05 && foldableWide <= 1.16);
  });
});
