import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANGLE_SCROLL_TICKS,
  FIRST_LOOK_DELAY_MS,
  FIRST_LOOK_MAX_DELAY_MS,
  FIRST_LOOK_MIN_DELAY_MS,
  FIRST_LOOK_TARGET_MS,
  PROGRESSIVE_ANGLE_WAVES,
  computeScrollbarLightingState,
  formatFirstLookCountdownSec,
  mapSignedTickToCanonicalSlice,
  resolveFirstLookDelayMs,
} from '../../src/services/vtonProgressiveState.ts';
import { resolveGeminiModelChain } from '../../server/vtonService.js';
import {
  buildQcCorrectionHint,
  createVtonQcMiddleware,
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

test('Progressive angle waves cover all 7 non-front slices in true 8-angle outward order', () => {
  assert.deepEqual(PROGRESSIVE_ANGLE_WAVES, [
    [45, 315],
    [90, 270],
    [135, 225, 180],
  ]);
  assert.equal(ANGLE_SCROLL_TICKS.length, 9);
  assert.equal(mapSignedTickToCanonicalSlice(0), 0);
  assert.equal(mapSignedTickToCanonicalSlice(-45), 315);
  assert.equal(mapSignedTickToCanonicalSlice(45), 45);
  assert.equal(mapSignedTickToCanonicalSlice(-90), 270);
  assert.equal(mapSignedTickToCanonicalSlice(90), 90);
  assert.equal(mapSignedTickToCanonicalSlice(135), 135);
  assert.equal(mapSignedTickToCanonicalSlice(-135), 225);
  assert.equal(mapSignedTickToCanonicalSlice(180), 180);
  assert.equal(mapSignedTickToCanonicalSlice(-180), 180);
});

test('computeScrollbarLightingState lights up independently left/right across all 8 true angles', () => {
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

  // Right-only 45°/90° must NOT light up left -45°/-90° ticks (no horizontal mirroring!)
  const rightOnly = computeScrollbarLightingState([0, 45, 90]);
  assert.equal(rightOnly.readyTicks[45], true);
  assert.equal(rightOnly.readyTicks[90], true);
  assert.equal(rightOnly.readyTicks[-45], false);
  assert.equal(rightOnly.readyTicks[-90], false);
  assert.equal(rightOnly.rightReachPct, 26);
  assert.equal(rightOnly.leftReachPct, 5);

  // Left 315°/270° lights up left ticks independently
  const wave1And2 = computeScrollbarLightingState([0, 45, 315, 90, 270]);
  assert.equal(wave1And2.readyTicks[-45], true);
  assert.equal(wave1And2.readyTicks[-90], true);
  assert.equal(wave1And2.leftReachPct, 26);
  assert.equal(wave1And2.rightReachPct, 26);

  const asymBack = computeScrollbarLightingState([0, 45, 315, 90, 270, 135]);
  assert.equal(asymBack.readyTicks[135], true);
  assert.equal(asymBack.readyTicks[-135], false);
  assert.equal(asymBack.rightReachPct, 39);
  assert.equal(asymBack.leftReachPct, 26);

  const allReady = computeScrollbarLightingState([0, 45, 90, 135, 180, 225, 270, 315]);
  assert.equal(allReady.allReady, true);
  assert.equal(allReady.readyCount, 8);
  assert.equal(allReady.backReady, true);
  assert.equal(allReady.leftReachPct, 50);
  assert.equal(allReady.rightReachPct, 50);
  assert.equal(allReady.readyTicks[-180], true);
  assert.equal(allReady.readyTicks[180], true);
});

test('Server model chain prioritizes gemini-3.1-flash-lite-image with nano-banana-2.1 fallback', () => {
  const prev = process.env.GEMINI_VTON_MODEL;
  delete process.env.GEMINI_VTON_MODEL;
  try {
    const chain = resolveGeminiModelChain();
    assert.equal(chain[0], 'gemini-3.1-flash-lite-image');
    assert.equal(chain[1], 'gemini-nano-banana-2.1');
  } finally {
    if (prev !== undefined) {
      process.env.GEMINI_VTON_MODEL = prev;
    }
  }
});

test('Vision QC hint builder & middleware reject front-face rear views and retry with correction hint', async () => {
  const hint = buildQcCorrectionHint(['180:front_face_in_rear_view', '135:wrong_bag_side']);
  assert.match(hint, /CRITICAL ORIENTATION FIX/i);
  assert.match(hint, /CRITICAL BAG SIDE FIX/i);

  const jpegBuf = Buffer.alloc(128, 0x00);
  // Minimal JPEG SOI + SOF0 marker (height=512, width=384)
  jpegBuf[0] = 0xff;
  jpegBuf[1] = 0xd8;
  jpegBuf[2] = 0xff;
  jpegBuf[3] = 0xc0;
  jpegBuf[4] = 0x00;
  jpegBuf[5] = 0x11;
  jpegBuf[6] = 0x08;
  jpegBuf[7] = 0x02; // height = 512 (0x0200)
  jpegBuf[8] = 0x00;
  jpegBuf[9] = 0x01; // width = 384 (0x0180)
  jpegBuf[10] = 0x80;
  jpegBuf[11] = 0x03;
  const fakeJpegDataUrl = 'data:image/jpeg;base64,' + jpegBuf.toString('base64');
  let synthCalls = 0;
  let capturedRetryHint = '';

  const mw = createVtonQcMiddleware({
    maxAttempts: 2,
    synthesizeLook: async (params: any) => {
      synthCalls += 1;
      if (synthCalls === 2) {
        capturedRetryHint = String(params.qcCorrectionHint || '');
      }
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
      if (synthCalls === 1) {
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
  assert.equal(synthCalls, 2);
  assert.match(capturedRetryHint, /CRITICAL ORIENTATION FIX/i);
  assert.equal(body.qcStatus, 'passed');
  assert.equal(body.qcAttempts, 2);
  assert.equal(body.compositeImageUrl, fakeJpegDataUrl);

  // Verify exhausted non-0° Vision QC returns angleQcFailed: true instead of serving defective front-face rear view
  const failMw = createVtonQcMiddleware({
    maxAttempts: 2,
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
  assert.equal(failBody.compositeImageUrl, null);
});
