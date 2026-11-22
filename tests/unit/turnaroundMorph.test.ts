import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MORPH_FLOW_H,
  MORPH_FLOW_W,
  MORPH_MAX_FLOW_U,
  MORPH_PYRAMID_H,
  MORPH_PYRAMID_W,
  MORPH_SILHOUETTE_BANDS,
  computeGroundShadowScaleX,
  computeIndependentLayerYaws,
  computePairwiseMorphField,
  extractMorphAnalysisFrame,
  resolveContinuousTurnaroundPair,
  stepContinuousTurnaroundAngle,
} from '../../src/utils/turnaroundMorph.ts';
import type { TurnaroundAngle360 } from '../../src/utils/turnaroundPhysics.ts';

const ALL_8_ANGLES: readonly TurnaroundAngle360[] = [0, 45, 90, 135, 180, 225, 270, 315];

function fillRgba(
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
): void {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = (y * w + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
}

describe('Option 1 + Option 2 Turnaround Morphing Engine', () => {
  it('resolves exact bracketing angles and continuous t across full 360° including 315°↔0° wrap and partial subsets', () => {
    const exact0 = resolveContinuousTurnaroundPair(0, ALL_8_ANGLES);
    assert.equal(exact0.isExactCanonical, true);
    assert.equal(exact0.angleA, 0);
    assert.equal(exact0.t, 0);

    const exactBackNeg = resolveContinuousTurnaroundPair(-180, ALL_8_ANGLES);
    assert.equal(exactBackNeg.isExactCanonical, true);
    assert.equal(exactBackNeg.angleA, 180);

    const scrubMid = resolveContinuousTurnaroundPair(18, ALL_8_ANGLES);
    assert.equal(scrubMid.isExactCanonical, false);
    assert.equal(scrubMid.angleA, 0);
    assert.equal(scrubMid.angleB, 45);
    assert.ok(Math.abs(scrubMid.t - 0.4) < 1e-6);

    // Negative signed scrub (-18° === 342°) wraps seamlessly between 315° and 0° (t = 27/45 = 0.6)
    const scrubWrap = resolveContinuousTurnaroundPair(-18, ALL_8_ANGLES);
    assert.equal(scrubWrap.isExactCanonical, false);
    assert.equal(scrubWrap.angleA, 315);
    assert.equal(scrubWrap.angleB, 0);
    assert.equal(scrubWrap.spanDeg, 45);
    assert.ok(Math.abs(scrubWrap.t - 0.6) < 1e-6);

    // Progressive partial load subset [0, 45, 180]
    const partial = resolveContinuousTurnaroundPair(112.5, [0, 45, 180]);
    assert.equal(partial.angleA, 45);
    assert.equal(partial.angleB, 180);
    assert.equal(partial.spanDeg, 135);
    assert.ok(Math.abs(partial.t - 0.5) < 1e-6);
  });

  it('produces strictly monotonic, teleport-free independent layer yaws with zero discontinuity at t=0.5', () => {
    let prev = computeIndependentLayerYaws(0, 1, 9.5);
    assert.equal(prev.yawADeg, 0);
    assert.equal(prev.yawBDeg, -9.5);

    for (let step = 1; step <= 100; step += 1) {
      const t = step / 100;
      const cur = computeIndependentLayerYaws(t, 1, 9.5);
      // Monotonic increase for both A (0 -> +9.5) and B (-9.5 -> 0), never teleporting!
      assert.ok(
        cur.yawADeg >= prev.yawADeg,
        `yawADeg regressed at t=${t}: ${prev.yawADeg} -> ${cur.yawADeg}`
      );
      assert.ok(
        cur.yawBDeg >= prev.yawBDeg,
        `yawBDeg regressed at t=${t}: ${prev.yawBDeg} -> ${cur.yawBDeg}`
      );
      assert.ok(
        Math.abs(cur.yawADeg - prev.yawADeg) < 0.35,
        `Discontinuous jump in yawADeg at t=${t}: ${prev.yawADeg} -> ${cur.yawADeg}`
      );
      assert.ok(
        Math.abs(cur.yawBDeg - prev.yawBDeg) < 0.35,
        `Discontinuous jump in yawBDeg at t=${t}: ${prev.yawBDeg} -> ${cur.yawBDeg}`
      );
      prev = cur;
    }

    assert.equal(prev.yawADeg, 9.5);
    assert.equal(prev.yawBDeg, 0);
    assert.equal(prev.swapMix, 1);
  });

  it('glides multi-angle jumps (0° -> 180°) smoothly through intermediate 45°/90°/135° frames and snaps immediately on reducedMotion', () => {
    const visitedBuckets = new Set<number>();
    let deg = 0;
    let settled = false;
    for (let f = 0; f < 45; f += 1) {
      const res = stepContinuousTurnaroundAngle({
        currentDeg: deg,
        targetDeg: 180,
        dtSec: 1 / 60,
        isLiveScrubbing: false,
      });
      deg = res.nextDeg;
      visitedBuckets.add(Math.round(deg / 45) * 45);
      if (res.settled) {
        settled = true;
        break;
      }
    }
    assert.equal(settled, true);
    assert.equal(deg, 180);
    assert.ok(visitedBuckets.has(45) && visitedBuckets.has(90) && visitedBuckets.has(135));

    // Wrap across 315° -> 0° takes the short +45° path (increasing through 330°+, never going backward via 180°)
    const wrapStep = stepContinuousTurnaroundAngle({
      currentDeg: 315,
      targetDeg: 0,
      dtSec: 1 / 60,
      isLiveScrubbing: false,
    });
    assert.ok(wrapStep.nextDeg > 315 || wrapStep.nextDeg === 0);

    // Reduced motion snaps instantaneously
    const rm = stepContinuousTurnaroundAngle({
      currentDeg: 0,
      targetDeg: 180,
      dtSec: 1 / 60,
      isLiveScrubbing: false,
      reducedMotion: true,
    });
    assert.equal(rm.nextDeg, 180);
    assert.equal(rm.settled, true);
  });

  it('modulates ground shadow horizontal width smoothly between front/back (1.0) and side profile (0.84)', () => {
    assert.equal(computeGroundShadowScaleX(0), 1);
    assert.equal(computeGroundShadowScaleX(180), 1);
    assert.equal(computeGroundShadowScaleX(90), 0.84);
    assert.equal(computeGroundShadowScaleX(270), 0.84);
    assert.equal(computeGroundShadowScaleX(45), 0.92);
  });

  it('extracts 64-band narrowing silhouette contour bounds and positive interior optical flow shift between 0° Front and 45° Quarter', () => {
    const w = MORPH_PYRAMID_W;
    const h = MORPH_PYRAMID_H;

    // Frame A (0° Front): wide torso (x=12..35, width=24) with bright vertical scarf/zipper stripe centered at x=23..25
    const bufA = new Uint8ClampedArray(w * h * 4);
    fillRgba(bufA, w, 19, 28, 6, 17, 210, 175, 150, 255); // head
    fillRgba(bufA, w, 12, 35, 18, 46, 48, 52, 60, 255); // wide dark puffer
    fillRgba(bufA, w, 23, 25, 18, 44, 240, 236, 224, 255); // centered ivory scarf stripe
    fillRgba(bufA, w, 15, 32, 47, 68, 130, 132, 131, 255); // trousers + shoes

    // Frame B (45° Quarter): narrower torso (x=15..32, width=18) with scarf stripe shifted right to x=26..28!
    const bufB = new Uint8ClampedArray(w * h * 4);
    fillRgba(bufB, w, 20, 28, 6, 17, 210, 175, 150, 255); // head
    fillRgba(bufB, w, 15, 32, 18, 46, 48, 52, 60, 255); // narrower rotated puffer
    fillRgba(bufB, w, 26, 28, 18, 44, 240, 236, 224, 255); // rightward-shifted scarf stripe
    fillRgba(bufB, w, 17, 30, 47, 68, 130, 132, 131, 255); // narrower rotated trousers

    const frameA = extractMorphAnalysisFrame(bufA, w, h, false);
    const frameB = extractMorphAnalysisFrame(bufB, w, h, false);

    // Mid-torso band (bottom-to-top band ~36 corresponds to top-down y ~31)
    const torsoBand = 36;
    const widthA = frameA.rightU[torsoBand] - frameA.leftU[torsoBand];
    const widthB = frameB.rightU[torsoBand] - frameB.leftU[torsoBand];
    assert.ok(
      widthA > widthB + 0.08,
      `Expected 0° torso width (${widthA.toFixed(3)}) > 45° torso width (${widthB.toFixed(3)})`
    );

    const t0 = performance.now();
    const field = computePairwiseMorphField(frameA, frameB);
    const elapsedMs = performance.now() - t0;

    assert.equal(field.contourWidth, MORPH_SILHOUETTE_BANDS);
    assert.equal(field.flowWidth, MORPH_FLOW_W);
    assert.equal(field.flowHeight, MORPH_FLOW_H);
    assert.ok(elapsedMs < 120, `Pairwise optical flow took too long: ${elapsedMs.toFixed(1)}ms`);

    // Contour texture encodes wider A and narrower B at torso band
    const cOff = torsoBand * 4;
    const encWidthA = (field.contourRgba[cOff + 1] - field.contourRgba[cOff]) / 255;
    const encWidthB = (field.contourRgba[cOff + 3] - field.contourRgba[cOff + 2]) / 255;
    assert.ok(encWidthA > encWidthB + 0.07);

    // Center torso flow detects rightward shift (flowAB.dx > 0 -> R > 128) & leftward reverse (flowBA.dx < 0 -> B < 128)
    const centerNodeIdx = (Math.floor(MORPH_FLOW_H * 0.56) * MORPH_FLOW_W + Math.floor(MORPH_FLOW_W * 0.5)) * 4;
    const decodedFwdDx = ((field.flowRgba[centerNodeIdx] - 128) / 127) * MORPH_MAX_FLOW_U;
    const decodedBwdDx = ((field.flowRgba[centerNodeIdx + 2] - 128) / 127) * MORPH_MAX_FLOW_U;
    assert.ok(
      decodedFwdDx > 0.004,
      `Expected positive rightward optical flow for scarf shift, got ${decodedFwdDx}`
    );
    assert.ok(
      decodedBwdDx < -0.002,
      `Expected negative leftward reverse flow for scarf shift, got ${decodedBwdDx}`
    );

    // Outer background corner stays neutral (zero flow)
    assert.equal(field.flowRgba[0], 128);
    assert.equal(field.flowRgba[1], 128);
  });
});
