import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampNormalizedFaceBox,
  computeSingleFacePortraitRect,
  dedupeDetectedFaceCandidates,
  evaluateFacePhotoQuality,
} from '../../src/utils/faceAnalysisDiagnostics.ts';

test('clampNormalizedFaceBox keeps box strictly inside [0..1] with safe min/max bounds', () => {
  const clamped = clampNormalizedFaceBox({ x: -0.2, y: 0.9, w: 0.02, h: 1.5 });
  assert.ok(clamped.x >= 0 && clamped.x <= 1);
  assert.ok(clamped.y >= 0 && clamped.y <= 1);
  assert.ok(clamped.w >= 0.1 && clamped.w <= 0.92);
  assert.ok(clamped.h >= 0.12 && clamped.h <= 0.94);
  assert.ok(clamped.x + clamped.w <= 1.0001);
  assert.ok(clamped.y + clamped.h <= 1.0001);
});

test('computeSingleFacePortraitRect isolates only the chosen face inside a 5-person wide stage shot', () => {
  // 1000x700 group shot with 5 people standing left to right; user is 2nd from left
  const rect = computeSingleFacePortraitRect(
    { cx: 310, cy: 210, w: 84, h: 102 },
    1000,
    700
  );
  assert.ok(rect.side < 320, 'cropped portrait must exclude bystanders across the 1000px wide photo');
  assert.ok(rect.sx >= 0 && rect.sx + rect.side <= 1000);
  assert.ok(rect.sy >= 0 && rect.sy + rect.side <= 700);
  // Selected face center should sit comfortably inside the isolated square crop
  assert.ok(310 > rect.sx && 310 < rect.sx + rect.side);
  assert.ok(210 > rect.sy && 210 < rect.sy + rect.side);
});

test('dedupeDetectedFaceCandidates merges overlapping full+half scans and numbers left-to-right', () => {
  const deduped = dedupeDetectedFaceCandidates(
    [
      { cx: 780, cy: 220, w: 82, h: 98 }, // person 3
      { cx: 180, cy: 215, w: 80, h: 96 }, // person 1
      { cx: 184, cy: 217, w: 82, h: 97 }, // duplicate of person 1 from left-half scan
      { cx: 490, cy: 205, w: 88, h: 104 }, // person 2
    ],
    1000,
    700
  );

  assert.equal(deduped.length, 3);
  assert.equal(deduped[0].index, 0);
  assert.equal(deduped[1].index, 1);
  assert.equal(deduped[2].index, 2);
  assert.ok(deduped[0].cx < deduped[1].cx && deduped[1].cx < deduped[2].cx);
});

test('evaluateFacePhotoQuality flags group photos, missing faces, tiny faces, and extreme stage lighting', () => {
  const groupPhoto = evaluateFacePhotoQuality({
    faceDetected: true,
    detectedFaceCount: 5,
    faceAreaRatio: 0.025,
    confidence: 78,
    labL: 89,
    labChroma: 18,
    manualOverride: false,
    lang: 'ko',
  });
  assert.equal(groupPhoto.level, 'poor');
  assert.equal(groupPhoto.primaryIssue, 'multi_face');
  assert.equal(groupPhoto.recommendedAction, 'correct');
  assert.ok(groupPhoto.issues.includes('too_small'));
  assert.ok(groupPhoto.issues.includes('extreme_lighting'));
  assert.equal(groupPhoto.checklist.length, 4);

  // Once user manually pins their face in a well-lit photo, multi_face warning clears
  const afterManualPin = evaluateFacePhotoQuality({
    faceDetected: true,
    detectedFaceCount: 5,
    faceAreaRatio: 0.14,
    confidence: 86,
    labL: 69,
    labChroma: 14,
    manualOverride: true,
    lang: 'ko',
  });
  assert.equal(afterManualPin.level, 'good');
  assert.equal(afterManualPin.primaryIssue, 'ok');

  const noFace = evaluateFacePhotoQuality({
    faceDetected: false,
    detectedFaceCount: 0,
    faceAreaRatio: 0,
    confidence: 45,
    labL: 52,
    labChroma: 12,
    lang: 'ko',
  });
  assert.equal(noFace.level, 'poor');
  assert.equal(noFace.primaryIssue, 'no_face');
  assert.equal(noFace.recommendedAction, 'reupload');

  const stageLighting = evaluateFacePhotoQuality({
    faceDetected: true,
    detectedFaceCount: 1,
    faceAreaRatio: 0.18,
    confidence: 82,
    labL: 90,
    labChroma: 32,
    gainSkew: 0.34,
    lang: 'en',
  });
  assert.equal(stageLighting.level, 'caution');
  assert.equal(stageLighting.primaryIssue, 'extreme_lighting');
});
