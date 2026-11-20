import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  ANGLE_SCROLL_TICKS,
  FIRST_LOOK_DELAY_MS,
  FIRST_LOOK_MAX_DELAY_MS,
  FIRST_LOOK_MIN_DELAY_MS,
  FIRST_LOOK_TARGET_MS,
  PROGRESSIVE_ANGLE_WAVES,
  computeScrollbarLightingState,
  formatFirstLookCountdownSec,
  hasCompleteTurnaroundSlices,
  mapSignedTickToCanonicalSlice,
  resolveFirstLookDelayMs,
  selectSecondaryAnchorAngle,
  shouldResumeIncompleteTurnaround,
} from '../../src/services/vtonProgressiveState.ts';
import { resolveBagCarryAnatomy } from '../../src/services/vtonQualityControl.ts';
import { resolveGeminiModelChain } from '../../server/vtonService.js';
import {
  buildQcCorrectionHint,
  canApplySoftBagTolerance,
  createVtonQcMiddleware,
  evaluateVisionQcVerdict,
  isAbortOrTimeoutError,
  isOnlySoftBagQcFailure,
  resolveEffectiveHandednessFromFrontVerdict,
  runGeminiVisionAngleQc,
} from '../../server/vtonQcMiddleware.js';

test('First-Look Delay constants & countdown formatter', () => {
  assert.equal(FIRST_LOOK_TARGET_MS, 2000);
  assert.equal(FIRST_LOOK_DELAY_MS, 5000);
  assert.equal(resolveFirstLookDelayMs(), FIRST_LOOK_DELAY_MS);
  assert.equal(resolveFirstLookDelayMs(500), FIRST_LOOK_MIN_DELAY_MS);
  assert.equal(resolveFirstLookDelayMs(99999), FIRST_LOOK_MAX_DELAY_MS);
  assert.equal(resolveFirstLookDelayMs(3200), 3200);

  assert.equal(formatFirstLookCountdownSec(5000, 'ko'), '5초');
  assert.equal(formatFirstLookCountdownSec(4100, 'ko'), '5초');
  assert.equal(formatFirstLookCountdownSec(2001, 'ko'), '3초');
  assert.equal(formatFirstLookCountdownSec(100, 'ko'), '1초');
  assert.equal(formatFirstLookCountdownSec(0, 'ko'), '0초');
  assert.equal(formatFirstLookCountdownSec(3000, 'en'), '3s');
});

test('Progressive waves follow Front (0°) -> Right ([45,90] -> 135) -> Back (180) -> Left ([315,270,225]) with secondary anchors', () => {
  assert.deepEqual(PROGRESSIVE_ANGLE_WAVES, [
    [45, 90],
    [135],
    [180],
    [315, 270, 225],
  ]);
  assert.equal(ANGLE_SCROLL_TICKS.length, 9);
  assert.equal(mapSignedTickToCanonicalSlice(0), 0);
  assert.equal(mapSignedTickToCanonicalSlice(-45), 315);
  assert.equal(mapSignedTickToCanonicalSlice(45), 45);
  assert.equal(mapSignedTickToCanonicalSlice(-90), 270);
  assert.equal(mapSignedTickToCanonicalSlice(90), 90);
  assert.equal(mapSignedTickToCanonicalSlice(135), 135);
  assert.equal(mapSignedTickToCanonicalSlice(-135), 225);
  // Both left and right ends map to the SINGLE canonical 180° back slice
  assert.equal(mapSignedTickToCanonicalSlice(180), 180);
  assert.equal(mapSignedTickToCanonicalSlice(-180), 180);

  assert.equal(selectSecondaryAnchorAngle(45, new Set([0])), null);
  assert.equal(selectSecondaryAnchorAngle(90, new Set([0, 45])), 45);
  assert.equal(selectSecondaryAnchorAngle(135, new Set([0, 45, 90])), 90);
  assert.equal(selectSecondaryAnchorAngle(180, new Set([0, 45, 90, 135])), 135);
  assert.equal(selectSecondaryAnchorAngle(315, new Set([0, 45, 90, 135, 180])), null);
  assert.equal(selectSecondaryAnchorAngle(270, new Set([0, 45, 90, 135, 180, 315])), 315);
  assert.equal(selectSecondaryAnchorAngle(225, new Set([0, 45, 90, 135, 180, 315, 270])), 180);
});

test('computeScrollbarLightingState advances contiguously and NEVER falsely lights missing left angles when 180° is ready', () => {
  const empty = computeScrollbarLightingState([]);
  assert.equal(empty.frontReady, false);
  assert.equal(empty.backReady, false);
  assert.equal(empty.leftReachPct, 0);
  assert.equal(empty.rightReachPct, 0);
  assert.equal(empty.readyCount, 0);
  assert.equal(empty.totalCount, 8);

  const frontOnly = computeScrollbarLightingState([0]);
  assert.equal(frontOnly.frontReady, true);
  assert.equal(frontOnly.backReady, false);
  assert.equal(frontOnly.readyTicks[0], true);
  assert.equal(frontOnly.readyTicks[45], false);
  assert.equal(frontOnly.readyTicks[-45], false);
  assert.equal(frontOnly.leftReachPct, 5);
  assert.equal(frontOnly.rightReachPct, 5);

  // After Stage 2 (Right) + Stage 3 (180° Back), right bar reaches 50% and BOTH -180/+180 ticks glow,
  // while left bar stays at 5% because 315°/270°/225° are NOT yet generated!
  const rightAndBack = computeScrollbarLightingState([0, 45, 90, 135, 180]);
  assert.equal(rightAndBack.rightReachPct, 50);
  assert.equal(rightAndBack.leftReachPct, 5);
  assert.equal(rightAndBack.readyTicks[180], true);
  assert.equal(rightAndBack.readyTicks[-180], true);
  assert.equal(rightAndBack.readyTicks[-45], false);
  assert.equal(rightAndBack.readyTicks[-90], false);
  assert.equal(rightAndBack.readyTicks[-135], false);

  // If 315° failed while 270°/225°/180° succeeded, leftReachPct MUST NOT bridge over missing 315°
  const missing315 = computeScrollbarLightingState([0, 45, 90, 135, 180, 270, 225]);
  assert.equal(missing315.leftReachPct, 5);
  assert.equal(missing315.readyTicks[-45], false);
  assert.equal(missing315.readyTicks[-90], true);

  const allReady = computeScrollbarLightingState([0, 45, 90, 135, 180, 225, 270, 315]);
  assert.equal(allReady.allReady, true);
  assert.equal(allReady.readyCount, 8);
  assert.equal(allReady.backReady, true);
  assert.equal(allReady.leftReachPct, 50);
  assert.equal(allReady.rightReachPct, 50);
  assert.equal(allReady.readyTicks[-180], true);
  assert.equal(allReady.readyTicks[180], true);
});

test('Server model chain prioritizes nano-banana-2.1 by default for high-res 4x2 sheets and falls back to flash-lite', async () => {
  const { resolveTurnaroundSheetImageSize, buildGeminiTryOnPrompt, buildServerBagPositionGuidePngPart } =
    await import('../../server/vtonService.js');
  const prev = process.env.GEMINI_VTON_MODEL;
  const prevSize = process.env.GEMINI_VTON_SHEET_IMAGE_SIZE;
  delete process.env.GEMINI_VTON_MODEL;
  delete process.env.GEMINI_VTON_SHEET_IMAGE_SIZE;
  try {
    const chain = resolveGeminiModelChain();
    assert.equal(chain[0], 'gemini-nano-banana-2.1');
    assert.equal(chain[1], 'gemini-3.1-flash-lite-image');

    const fallbackChain = resolveGeminiModelChain({ preferFallbackModel: true });
    assert.equal(fallbackChain[0], 'gemini-3.1-flash-lite-image');
    assert.equal(fallbackChain[1], 'gemini-nano-banana-2.1');

    // High-res 2K default for 8-angle 4x2 sheets (configurable to 4K via env)
    assert.equal(resolveTurnaroundSheetImageSize(), '2K');
    process.env.GEMINI_VTON_SHEET_IMAGE_SIZE = '4K';
    assert.equal(resolveTurnaroundSheetImageSize(), '4K');

    // Default turnaround sheet prompt locks 8-angle 4x2 4:3 full-body grid (0°..315°)
    const prompt4x2 = buildGeminiTryOnPrompt({
      turnaroundSheet: true,
      turnaroundLayout: 'turnaround_4x2',
    });
    assert.match(prompt4x2, /8-ANGLE 4x2/i);
    assert.match(prompt4x2, /4:3/);
    assert.match(prompt4x2, /EQUAL-SCALE FULL-BODY BOTH-ROWS/i);
    assert.match(prompt4x2, /RIGHT EAR/i);
    assert.match(prompt4x2, /LEFT EAR/i);
    assert.match(prompt4x2, /270°/);
    assert.match(prompt4x2, /315°/);

    // 4x2 spatial bag guide PNG renders 4:3 (480x360 -> 120x180 2:3 full-body cells)
    const guidePart = buildServerBagPositionGuidePngPart(
      { turnaroundSheet: true, turnaroundLayout: 'turnaround_4x2', dominantHand: 'right' },
      '#94A3B8',
      { hasStrap: true, bagCarryStyle: 'shoulder' }
    );
    assert.ok(guidePart && guidePart.mimeType === 'image/png' && guidePart.data.length > 100);
    const pngBuf = Buffer.from(guidePart.data, 'base64');
    assert.equal(pngBuf.readUInt32BE(16), 480);
    assert.equal(pngBuf.readUInt32BE(20), 360);

    // Handedness-safe mirrored pair swap guard catches swapped 135°/225° without false positives
    const { shouldSwapMirroredAnglePair } = await import('../../src/services/vton2DService.ts');
    assert.equal(shouldSwapMirroredAnglePair('left', 'right'), true);
    assert.equal(shouldSwapMirroredAnglePair('right', 'left'), false);
    assert.equal(shouldSwapMirroredAnglePair('left', 'neutral'), false);
    assert.equal(shouldSwapMirroredAnglePair('neutral', 'right'), false);
  } finally {
    if (prev !== undefined) {
      process.env.GEMINI_VTON_MODEL = prev;
    } else {
      delete process.env.GEMINI_VTON_MODEL;
    }
    if (prevSize !== undefined) {
      process.env.GEMINI_VTON_SHEET_IMAGE_SIZE = prevSize;
    } else {
      delete process.env.GEMINI_VTON_SHEET_IMAGE_SIZE;
    }
  }
});

test('Deterministic Vision QC catches 45° swapped-hand bag even if LLM wrongly returns bagSideValid=true', () => {
  const anatomyRightHanded = resolveBagCarryAnatomy('right', {
    hasStrap: false,
    bagCarryStyle: 'hand_only',
  });
  // Exact failure mode from screenshot: 45° Front-Right with bag on image_left (wrong hand!)
  const swapped45 = evaluateVisionQcVerdict({
    verdict: {
      facingDirection: 'front_right',
      orientationValid: true,
      isRearNotFront: true,
      bagObservedImageSide: 'image_left',
      bagSideValid: true, // LLM rubber-stamped true by mistake!
      armpitTuckDetected: false,
      strapMatchesSpec: true,
      outfitConsistent: true,
      hasTextOrLabels: false,
      defectCode: 'none',
    },
    canonicalAngle: 45,
    hasEquippedBag: true,
    anatomy: anatomyRightHanded,
  });
  assert.equal(swapped45.ok, false);
  assert.ok(swapped45.reasons.includes('45:wrong_bag_side'));

  // Correct 45° with bag on image_right passes cleanly
  const valid45 = evaluateVisionQcVerdict({
    verdict: {
      facingDirection: 'front_right',
      orientationValid: true,
      isRearNotFront: true,
      bagObservedImageSide: 'image_right',
      bagSideValid: true,
      armpitTuckDetected: false,
      strapMatchesSpec: true,
      outfitConsistent: true,
      hasTextOrLabels: false,
      defectCode: 'none',
    },
    canonicalAngle: 45,
    hasEquippedBag: true,
    anatomy: anatomyRightHanded,
  });
  assert.equal(valid45.ok, true);

  // Reversed horizontal facing at 45° (nose & shoe toes pointing toward LEFT border) MUST fail
  // deterministically even if LLM mislabels facingDirection as 'front_right'
  const reversed45 = evaluateVisionQcVerdict({
    verdict: {
      noseAndToesImageDirection: 'toward_left_edge',
      facingDirection: 'front_right',
      orientationValid: true,
      isRearNotFront: true,
      torsoBodyRotated: true,
      bagObservedImageSide: 'image_right',
      bagSideValid: true,
      armpitTuckDetected: false,
      strapMatchesSpec: true,
      outfitConsistent: true,
      hasTextOrLabels: false,
      defectCode: 'none',
    },
    canonicalAngle: 45,
    hasEquippedBag: true,
    anatomy: anatomyRightHanded,
  });
  assert.equal(reversed45.ok, false);
  assert.ok(reversed45.reasons.includes('45:reversed_horizontal_facing'));

  const reversedHint = buildQcCorrectionHint(['45:reversed_horizontal_facing']);
  assert.match(reversedHint, /HORIZONTAL REVERSAL FIX/i);

  // Head-only turn at 45° (shoulders flat 0° while only head turned) MUST fail deterministically
  const headOnly45 = evaluateVisionQcVerdict({
    verdict: {
      noseAndToesImageDirection: 'toward_right_edge',
      facingDirection: 'front_right',
      orientationValid: true,
      isRearNotFront: true,
      torsoBodyRotated: false,
      bagObservedImageSide: 'image_right',
      bagSideValid: true,
      armpitTuckDetected: false,
      strapMatchesSpec: true,
      outfitConsistent: true,
      hasTextOrLabels: false,
      defectCode: 'none',
    },
    canonicalAngle: 45,
    hasEquippedBag: true,
    anatomy: anatomyRightHanded,
  });
  assert.equal(headOnly45.ok, false);
  assert.ok(headOnly45.reasons.includes('45:head_only_turn'));

  const headOnlyHint = buildQcCorrectionHint(['45:head_only_turn']);
  assert.match(headOnlyHint, /FULL-BODY 45° TORSO ROTATION/i);

  // Front-angle wrong_orientation hint MUST NOT tell Gemini to turn its back away!
  const frontHint = buildQcCorrectionHint(['45:wrong_orientation']);
  assert.match(frontHint, /horizontal direction/i);
  assert.doesNotMatch(frontHint, /ZERO front face/i);
});

test('Vision QC middleware retries up to 3 attempts and escalates to preferFallbackModel on attempt 3', async () => {
  const hint = buildQcCorrectionHint(['180:front_face_in_rear_view', '135:wrong_bag_side']);
  assert.match(hint, /CRITICAL ORIENTATION FIX/i);
  assert.match(hint, /CRITICAL BAG SIDE FIX/i);

  const jpegBuf = Buffer.alloc(128, 0x00);
  jpegBuf[0] = 0xff;
  jpegBuf[1] = 0xd8;
  jpegBuf[2] = 0xff;
  jpegBuf[3] = 0xc0;
  jpegBuf[4] = 0x00;
  jpegBuf[5] = 0x11;
  jpegBuf[6] = 0x08;
  jpegBuf[7] = 0x02;
  jpegBuf[8] = 0x00;
  jpegBuf[9] = 0x01;
  jpegBuf[10] = 0x80;
  jpegBuf[11] = 0x03;
  const fakeJpegDataUrl = 'data:image/jpeg;base64,' + jpegBuf.toString('base64');
  let synthCalls = 0;
  const preferFallbackFlags: boolean[] = [];

  const mw = createVtonQcMiddleware({
    maxAttempts: 3,
    synthesizeLook: async (params: any) => {
      synthCalls += 1;
      preferFallbackFlags.push(Boolean(params.preferFallbackModel));
      return {
        ok: true,
        fallbackToFlatLay: false,
        geminiUsed: true,
        cached: false,
        cacheKey: `test-180-${synthCalls}`,
        compositeImageUrl: fakeJpegDataUrl,
        viewAngleDeg: 180,
        hasEquippedBag: true,
        handedness: 'right',
        profile: { dominantHand: 'right', viewAngleDeg: 180 },
      };
    },
    invalidateCache: () => {},
    visionQcImpl: async () => {
      if (synthCalls < 3) {
        return {
          ok: false,
          reasons: ['180:front_face_in_rear_view', '180:wrong_bag_side'],
        };
      }
      return { ok: true, reasons: [] };
    },
  });

  const req: any = {
    vtonSynthesisParams: {
      viewAngleDeg: 180,
      turnaroundSheet: false,
      masterAnchorDataUrl: fakeJpegDataUrl,
    },
  };
  const res: any = { locals: {} };
  let nextErr: any = null;

  await mw(req, res, (err: any) => {
    nextErr = err || null;
  });
  assert.equal(nextErr, null);
  const body = res.locals.vtonResult;
  assert.equal(synthCalls, 3);
  assert.deepEqual(preferFallbackFlags, [false, false, true]);
  assert.equal(body.qcStatus, 'passed');
  assert.equal(body.qcAttempts, 3);
  assert.equal(body.compositeImageUrl, fakeJpegDataUrl);

  // Verify exhausted 3-attempt non-0° Vision QC returns angleQcFailed: true
  const failMw = createVtonQcMiddleware({
    maxAttempts: 3,
    logFilePath: path.join(os.tmpdir(), 'ainventory-test-vton-qc-failures.log'),
    synthesizeLook: async () => ({
      ok: true,
      fallbackToFlatLay: false,
      geminiUsed: true,
      cached: false,
      cacheKey: 'test-180-fail',
      compositeImageUrl: fakeJpegDataUrl,
      viewAngleDeg: 180,
      hasEquippedBag: true,
      handedness: 'right',
      profile: { dominantHand: 'right', viewAngleDeg: 180 },
    }),
    invalidateCache: () => {},
    visionQcImpl: async () => ({
      ok: false,
      reasons: ['180:front_face_in_rear_view'],
    }),
  });

  const failRes: any = { locals: {} };
  await failMw(
    {
      vtonSynthesisParams: {
        viewAngleDeg: 180,
        turnaroundSheet: false,
        masterAnchorDataUrl: fakeJpegDataUrl,
      },
    },
    failRes,
    () => {}
  );
  const failBody = failRes.locals.vtonResult;
  assert.equal(failBody.angleQcFailed, true);
  assert.equal(failBody.qcAttempts, 3);
  assert.equal(failBody.compositeImageUrl, null);

  // Verify 0° Master Anchor with an equipped bag ALSO runs Vision QC so wrong-hand 0° never poisons 45°..315°
  let frontCalls = 0;
  const frontBagMw = createVtonQcMiddleware({
    maxAttempts: 3,
    synthesizeLook: async () => {
      frontCalls += 1;
      return {
        ok: true,
        fallbackToFlatLay: false,
        geminiUsed: true,
        cached: false,
        cacheKey: `test-0-bag-${frontCalls}`,
        compositeImageUrl: fakeJpegDataUrl,
        viewAngleDeg: 0,
        hasEquippedBag: true,
        handedness: 'right',
        profile: { dominantHand: 'right', viewAngleDeg: 0 },
      };
    },
    invalidateCache: () => {},
    visionQcImpl: async () =>
      frontCalls === 1
        ? { ok: false, reasons: ['0:wrong_bag_side'] }
        : { ok: true, reasons: [] },
  });
  const frontBagRes: any = { locals: {} };
  await frontBagMw(
    {
      vtonSynthesisParams: {
        viewAngleDeg: 0,
        turnaroundSheet: false,
      },
    },
    frontBagRes,
    () => {}
  );
  assert.equal(frontCalls, 2);
  assert.equal(frontBagRes.locals.vtonResult.qcStatus, 'passed');
  assert.equal(frontBagRes.locals.vtonResult.qcAttempts, 2);
});

test('Partial turnaround cache (e.g. 0° + 45° only) resumes missing angles instead of freezing', () => {
  const partialSlices = {
    0: 'data:image/png;base64,front',
    45: 'data:image/png;base64,right45',
  };
  assert.equal(hasCompleteTurnaroundSlices(partialSlices), false);
  assert.equal(
    shouldResumeIncompleteTurnaround({
      cachedSlices: partialSlices,
      frontOnlyDegraded: false,
      alreadyExhaustedRun: false,
      demoShowcaseEnabled: false,
    }),
    true
  );

  // Stop once all 8 canonical angles exist or after an exhausted session run / front-only fallback
  const fullSlices = {
    0: 'u0',
    45: 'u45',
    90: 'u90',
    135: 'u135',
    180: 'u180',
    225: 'u225',
    270: 'u270',
    315: 'u315',
  };
  assert.equal(hasCompleteTurnaroundSlices(fullSlices), true);
  assert.equal(
    shouldResumeIncompleteTurnaround({
      cachedSlices: fullSlices,
      frontOnlyDegraded: false,
      alreadyExhaustedRun: false,
      demoShowcaseEnabled: false,
    }),
    false
  );
  assert.equal(
    shouldResumeIncompleteTurnaround({
      cachedSlices: partialSlices,
      alreadyExhaustedRun: true,
    }),
    false
  );
  assert.equal(
    shouldResumeIncompleteTurnaround({
      cachedSlices: partialSlices,
      frontOnlyDegraded: true,
    }),
    false
  );
});

test('90° far-occluded right-handed side profile allows bag peeking behind back and soft-accepts final attempt bag-only ambiguity', async () => {
  const anatomyRightHanded = resolveBagCarryAnatomy('right', {
    hasStrap: true,
    bagCarryStyle: 'shoulder',
  });

  // Bag peeking behind the back on image_left at 90° (with foreground right arm empty -> bagSideValid: true) MUST PASS
  const peeking90 = evaluateVisionQcVerdict({
    verdict: {
      noseAndToesImageDirection: 'toward_right_edge',
      facingDirection: 'right_profile',
      orientationValid: true,
      isRearNotFront: true,
      torsoBodyRotated: true,
      bagObservedImageSide: 'image_left',
      bagSideValid: true,
      armpitTuckDetected: false,
      strapMatchesSpec: true,
      outfitConsistent: true,
      hasTextOrLabels: false,
      defectCode: 'none',
    },
    canonicalAngle: 90,
    hasEquippedBag: true,
    anatomy: anatomyRightHanded,
  });
  assert.equal(peeking90.ok, true);
  assert.deepEqual(peeking90.reasons, []);

  // Foreground shoulder violation at 90° (bagSideValid: false) STILL fails attempt 1..2 for retry
  const foregroundBag90 = evaluateVisionQcVerdict({
    verdict: {
      noseAndToesImageDirection: 'toward_right_edge',
      facingDirection: 'right_profile',
      orientationValid: true,
      isRearNotFront: true,
      torsoBodyRotated: true,
      bagObservedImageSide: 'image_left',
      bagSideValid: false,
      armpitTuckDetected: false,
      strapMatchesSpec: true,
      outfitConsistent: true,
      hasTextOrLabels: false,
      defectCode: 'wrong_bag_side',
    },
    canonicalAngle: 90,
    hasEquippedBag: true,
    anatomy: anatomyRightHanded,
  });
  assert.equal(foregroundBag90.ok, false);
  assert.deepEqual(foregroundBag90.reasons, ['90:wrong_bag_side']);

  assert.equal(isOnlySoftBagQcFailure(['90:wrong_bag_side']), true);
  assert.equal(isOnlySoftBagQcFailure(['90:wrong_bag_side', '90:wrong_orientation']), false);
  assert.equal(isOnlySoftBagQcFailure(['180:front_face_in_rear_view']), false);
  assert.equal(isOnlySoftBagQcFailure([]), false);

  // Middleware retries 3x on bag-only complaint and soft-accepts attempt 3 instead of leaving a dead dark angle
  const jpegBuf = Buffer.alloc(128, 0x00);
  jpegBuf[0] = 0xff;
  jpegBuf[1] = 0xd8;
  jpegBuf[2] = 0xff;
  jpegBuf[3] = 0xc0;
  jpegBuf[4] = 0x00;
  jpegBuf[5] = 0x11;
  jpegBuf[6] = 0x08;
  jpegBuf[7] = 0x02;
  jpegBuf[8] = 0x00;
  jpegBuf[9] = 0x01;
  jpegBuf[10] = 0x80;
  jpegBuf[11] = 0x03;
  const fakeJpegDataUrl = 'data:image/jpeg;base64,' + jpegBuf.toString('base64');

  let calls = 0;
  const softBagMw = createVtonQcMiddleware({
    maxAttempts: 3,
    synthesizeLook: async () => {
      calls += 1;
      return {
        ok: true,
        fallbackToFlatLay: false,
        geminiUsed: true,
        cached: false,
        cacheKey: `test-90-soft-${calls}`,
        compositeImageUrl: fakeJpegDataUrl,
        viewAngleDeg: 90,
        hasEquippedBag: true,
        handedness: 'right',
        profile: { dominantHand: 'right', viewAngleDeg: 90 },
      };
    },
    invalidateCache: () => {},
    visionQcImpl: async () => ({
      ok: false,
      reasons: ['90:wrong_bag_side'],
    }),
  });
  const softRes: any = { locals: {} };
  await softBagMw(
    {
      vtonSynthesisParams: {
        viewAngleDeg: 90,
        turnaroundSheet: false,
        masterAnchorDataUrl: fakeJpegDataUrl,
      },
    },
    softRes,
    () => {}
  );
  assert.equal(calls, 3);
  assert.equal(softRes.locals.vtonResult.qcStatus, 'passed_soft_bag_tolerance');
  assert.equal(softRes.locals.vtonResult.qcPassed, true);
  assert.equal(softRes.locals.vtonResult.compositeImageUrl, fakeJpegDataUrl);
});

test('Vision QC retries candidate-only on AbortError, skips oversized anchors, and degrades silently on persistent timeout', async () => {
  assert.equal(isAbortOrTimeoutError(new DOMException('This operation was aborted', 'AbortError')), true);
  assert.equal(isAbortOrTimeoutError(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), true);
  assert.equal(isAbortOrTimeoutError(new Error('This operation was aborted')), true);
  assert.equal(isAbortOrTimeoutError(new Error('HTTP 500 internal failure')), false);

  const jpegBuf = Buffer.alloc(128, 0x00);
  jpegBuf[0] = 0xff;
  jpegBuf[1] = 0xd8;
  jpegBuf[2] = 0xff;
  jpegBuf[3] = 0xc0;
  jpegBuf[4] = 0x00;
  jpegBuf[5] = 0x11;
  jpegBuf[6] = 0x08;
  jpegBuf[7] = 0x02;
  jpegBuf[8] = 0x00;
  jpegBuf[9] = 0x01;
  jpegBuf[10] = 0x80;
  jpegBuf[11] = 0x03;
  const compactJpegUrl = 'data:image/jpeg;base64,' + jpegBuf.toString('base64');

  // 1) Compact anchor aborts on attempt 1 -> automatically retries with candidate-only (1 image) and catches real defect!
  const imageCountsPerAttempt: number[] = [];
  let attemptIdx = 0;
  const retryDefectiveRear = await runGeminiVisionAngleQc({
    compositeImageUrl: compactJpegUrl,
    masterAnchorDataUrl: compactJpegUrl,
    viewAngleDeg: 180,
    hasEquippedBag: false,
    generateContentImpl: async (payload: any) => {
      attemptIdx += 1;
      const parts = payload.contents?.[0]?.parts || [];
      imageCountsPerAttempt.push(parts.filter((p: any) => Boolean(p.inlineData)).length);
      if (attemptIdx === 1) {
        throw new DOMException('This operation was aborted', 'AbortError');
      }
      return {
        text: JSON.stringify({
          noseAndToesImageDirection: 'straight_at_viewer',
          facingDirection: 'front',
          orientationValid: false,
          isRearNotFront: false,
          torsoBodyRotated: true,
          bagObservedImageSide: 'occluded_or_none',
          bagSideValid: true,
          armpitTuckDetected: false,
          strapMatchesSpec: true,
          outfitConsistent: true,
          hasTextOrLabels: false,
          defectCode: 'front_face_in_rear_view',
        }),
      };
    },
  });
  assert.deepEqual(imageCountsPerAttempt, [2, 1]);
  assert.equal(retryDefectiveRear.ok, false);
  assert.ok(retryDefectiveRear.reasons.includes('180:front_face_in_rear_view'));

  // 2) Oversized (>750KB) cached PNG anchor is automatically skipped so Vision QC sends only 1 image immediately
  const hugePngBuf = Buffer.alloc(800 * 1024, 0x11);
  const hugeAnchorUrl = 'data:image/png;base64,' + hugePngBuf.toString('base64');
  let hugeAnchorImageCount = 0;
  const leanPass = await runGeminiVisionAngleQc({
    compositeImageUrl: compactJpegUrl,
    masterAnchorDataUrl: hugeAnchorUrl,
    viewAngleDeg: 45,
    hasEquippedBag: false,
    generateContentImpl: async (payload: any) => {
      const parts = payload.contents?.[0]?.parts || [];
      hugeAnchorImageCount = parts.filter((p: any) => Boolean(p.inlineData)).length;
      return {
        text: JSON.stringify({
          noseAndToesImageDirection: 'toward_right_edge',
          facingDirection: 'front_right',
          orientationValid: true,
          isRearNotFront: true,
          torsoBodyRotated: true,
          bagObservedImageSide: 'occluded_or_none',
          bagSideValid: true,
          armpitTuckDetected: false,
          strapMatchesSpec: true,
          outfitConsistent: true,
          hasTextOrLabels: false,
          defectCode: 'none',
        }),
      };
    },
  });
  assert.equal(hugeAnchorImageCount, 1);
  assert.equal(leanPass.ok, true);

  // 3) Persistent AbortError/TimeoutError degrades gracefully with ZERO console.warn noise
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((a) => String(a)).join(' '));
  };
  try {
    const timedOutResult = await runGeminiVisionAngleQc({
      compositeImageUrl: compactJpegUrl,
      masterAnchorDataUrl: compactJpegUrl,
      viewAngleDeg: 90,
      hasEquippedBag: false,
      generateContentImpl: async () => {
        throw new DOMException('This operation was aborted', 'AbortError');
      },
    });
    assert.equal(timedOutResult.ok, true);
    assert.equal(timedOutResult.skipped, true);
    assert.equal(timedOutResult.timedOut, true);
    assert.deepEqual(timedOutResult.reasons, []);
    assert.equal(warnings.length, 0);
  } finally {
    console.warn = origWarn;
  }

  // 4) Client disconnect cancels QC middleware cleanly without running extra synthesis attempts
  let disconnectedSynthCalls = 0;
  const mockRes: any = Object.assign(new EventEmitter(), {
    locals: {},
    writableEnded: false,
  });
  const disconnectMw = createVtonQcMiddleware({
    maxAttempts: 3,
    synthesizeLook: async () => {
      disconnectedSynthCalls += 1;
      mockRes.emit('close');
      return {
        ok: true,
        fallbackToFlatLay: false,
        geminiUsed: true,
        cached: false,
        cacheKey: 'disconnect-test',
        compositeImageUrl: compactJpegUrl,
        viewAngleDeg: 135,
      };
    },
    visionQcImpl: async () => {
      throw new Error('should not be called after client disconnect');
    },
  });
  let nextCalled = false;
  await disconnectMw(
    { vtonSynthesisParams: { viewAngleDeg: 135, turnaroundSheet: false } },
    mockRes,
    () => {
      nextCalled = true;
    }
  );
  assert.equal(disconnectedSynthCalls, 1);
  assert.equal(nextCalled, false);
});

test('Strict bag QC blocks soft tolerance on visible angles, escalates 0° bag retry to fallback model, and syncs effectiveBagHandedness', async () => {
  // 1) Soft bag tolerance is ONLY allowed for far-occluded profiles (90° right-handed / 270° left-handed)
  assert.equal(
    canApplySoftBagTolerance({
      reasons: ['90:wrong_bag_side'],
      viewAngleDeg: 90,
      dominantHand: 'right',
      bagHasStrap: true,
      bagCarryStyle: 'shoulder',
    }),
    true
  );
  assert.equal(
    canApplySoftBagTolerance({
      reasons: ['270:wrong_bag_side'],
      viewAngleDeg: 270,
      dominantHand: 'left',
      bagHasStrap: true,
      bagCarryStyle: 'shoulder',
    }),
    true
  );
  // Visible angles (45°, 135°, 180°, 225°, 315°, foreground 270° right-handed) MUST NEVER soft-accept wrong_bag_side
  for (const angle of [0, 45, 135, 180, 225, 270, 315]) {
    assert.equal(
      canApplySoftBagTolerance({
        reasons: [`${angle}:wrong_bag_side`],
        viewAngleDeg: angle,
        dominantHand: 'right',
        bagHasStrap: true,
        bagCarryStyle: 'shoulder',
      }),
      false,
      `visible angle ${angle}° must reject soft bag tolerance`
    );
  }

  // 2) Effective handedness resolution from 0° verdict mirrors observed anchor side (unless backpack)
  assert.equal(
    resolveEffectiveHandednessFromFrontVerdict({
      requestedHandedness: 'right',
      verdict: { bagObservedImageSide: 'image_left' },
      bagCarryStyle: 'shoulder',
    }),
    'left'
  );
  assert.equal(
    resolveEffectiveHandednessFromFrontVerdict({
      requestedHandedness: 'left',
      verdict: { bagObservedImageSide: 'image_right' },
      bagCarryStyle: 'shoulder',
    }),
    'right'
  );
  assert.equal(
    resolveEffectiveHandednessFromFrontVerdict({
      requestedHandedness: 'right',
      verdict: { bagObservedImageSide: 'image_left' },
      bagCarryStyle: 'backpack',
    }),
    'right'
  );

  const jpegBuf = Buffer.alloc(128, 0x00);
  jpegBuf[0] = 0xff;
  jpegBuf[1] = 0xd8;
  jpegBuf[2] = 0xff;
  jpegBuf[3] = 0xc0;
  jpegBuf[4] = 0x00;
  jpegBuf[5] = 0x11;
  jpegBuf[6] = 0x08;
  jpegBuf[7] = 0x02;
  jpegBuf[8] = 0x00;
  jpegBuf[9] = 0x01;
  jpegBuf[10] = 0x80;
  jpegBuf[11] = 0x03;
  const fakeJpegDataUrl = 'data:image/jpeg;base64,' + jpegBuf.toString('base64');

  // 3) Persistent 45:wrong_bag_side MUST FAIL with angleQcFailed: true instead of silently soft-passing
  let calls45 = 0;
  const strict45Mw = createVtonQcMiddleware({
    maxAttempts: 3,
    logFilePath: path.join(os.tmpdir(), 'ainventory-test-strict-45-bag.log'),
    synthesizeLook: async () => {
      calls45 += 1;
      return {
        ok: true,
        fallbackToFlatLay: false,
        geminiUsed: true,
        cached: false,
        cacheKey: `test-45-strict-${calls45}`,
        compositeImageUrl: fakeJpegDataUrl,
        viewAngleDeg: 45,
        hasEquippedBag: true,
        bagHasStrap: true,
        bagCarryStyle: 'shoulder',
        handedness: 'right',
        profile: { dominantHand: 'right', viewAngleDeg: 45 },
      };
    },
    invalidateCache: () => {},
    visionQcImpl: async () => ({
      ok: false,
      reasons: ['45:wrong_bag_side'],
      verdict: { bagObservedImageSide: 'image_left', bagSideValid: false },
    }),
  });
  const strict45Res: any = { locals: {} };
  await strict45Mw(
    {
      vtonSynthesisParams: {
        viewAngleDeg: 45,
        turnaroundSheet: false,
        masterAnchorDataUrl: fakeJpegDataUrl,
      },
    },
    strict45Res,
    () => {}
  );
  assert.equal(calls45, 3);
  assert.equal(strict45Res.locals.vtonResult.angleQcFailed, true);
  assert.equal(strict45Res.locals.vtonResult.compositeImageUrl, null);

  // 4) 0° bag-side failure escalates preferFallbackModel from attempt 2 and emits effectiveBagHandedness on fallback
  const frontFallbackFlags: boolean[] = [];
  const frontSyncMw = createVtonQcMiddleware({
    maxAttempts: 3,
    logFilePath: path.join(os.tmpdir(), 'ainventory-test-0-bag-sync.log'),
    synthesizeLook: async (params: any) => {
      frontFallbackFlags.push(Boolean(params.preferFallbackModel));
      return {
        ok: true,
        fallbackToFlatLay: false,
        geminiUsed: true,
        cached: false,
        cacheKey: `test-0-sync-${frontFallbackFlags.length}`,
        compositeImageUrl: fakeJpegDataUrl,
        viewAngleDeg: 0,
        hasEquippedBag: true,
        bagHasStrap: true,
        bagCarryStyle: 'shoulder',
        handedness: 'right',
        profile: { dominantHand: 'right', viewAngleDeg: 0 },
      };
    },
    invalidateCache: () => {},
    visionQcImpl: async () => ({
      ok: false,
      reasons: ['0:wrong_bag_side'],
      verdict: { bagObservedImageSide: 'image_left', bagSideValid: false },
    }),
  });
  const frontSyncRes: any = { locals: {} };
  await frontSyncMw(
    {
      vtonSynthesisParams: {
        viewAngleDeg: 0,
        turnaroundSheet: false,
      },
    },
    frontSyncRes,
    () => {}
  );
  assert.deepEqual(frontFallbackFlags.slice(0, 3), [false, true, true]);
  assert.equal(frontFallbackFlags.length, 4);
  assert.equal(frontSyncRes.locals.vtonResult.qcStatus, 'fallback_positive_only');
  assert.equal(frontSyncRes.locals.vtonResult.effectiveBagHandedness, 'left');
});


