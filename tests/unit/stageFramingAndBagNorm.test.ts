import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  computeHeightAwareStageFraming,
  computeThreeCameraLookAtForSolePct,
} from '../../src/utils/stageFramingEngine.ts';
import { inferBagCarrySpec } from '../../src/shared/garmentTaxonomy.js';
import {
  computeBagAssetPlacementBox,
  computeMasterLandmarkAlignment,
  resolveBagCarryAnatomy,
} from '../../src/services/vtonQualityControl.ts';
import {
  TURNAROUND_ANGLES,
  computeMannequinFloorPlacement,
  resolve360AngleRenderSpec,
} from '../../src/services/vton2DService.ts';
import { buildQcCorrectionHint } from '../../server/vtonQcMiddleware.js';

test('Height-linked stage framing scales character height fraction & backdrop naturally across 150..198cm', () => {
  const shortF = computeHeightAwareStageFraming({ heightCm: 150, stageWidth: 720, stageHeight: 820 });
  const midF = computeHeightAwareStageFraming({ heightCm: 172, stageWidth: 720, stageHeight: 820 });
  const tallF = computeHeightAwareStageFraming({ heightCm: 198, stageWidth: 720, stageHeight: 820 });

  assert.ok(shortF.targetCharacterHeightFraction < midF.targetCharacterHeightFraction);
  assert.ok(midF.targetCharacterHeightFraction < tallF.targetCharacterHeightFraction);
  assert.ok(
    midF.targetCharacterHeightFraction >= 0.68 && midF.targetCharacterHeightFraction <= 0.72,
    `Expected ~70% stage height at 172cm, got ${midF.targetCharacterHeightFraction}`
  );
  // Wide-angle backdrop never shrinks below 1.02 (zero white margins)
  assert.ok(shortF.backdropScale >= 1.02);
  assert.ok(midF.backdropScale >= 1.02);
  assert.ok(tallF.backdropScale >= 1.02);

  // computeMannequinFloorPlacement respects heightCm and returns topRatio/bottomRatio
  const p155 = computeMannequinFloorPlacement({
    stageWidth: 720,
    stageHeight: 820,
    imageAspectRatio: 0.75,
    topRatio: 0.14,
    bottomRatio: 0.945,
    heightCm: 155,
  });
  const p192 = computeMannequinFloorPlacement({
    stageWidth: 720,
    stageHeight: 820,
    imageAspectRatio: 0.75,
    topRatio: 0.14,
    bottomRatio: 0.945,
    heightCm: 192,
  });
  assert.ok(p155.effectiveBaseScale < p192.effectiveBaseScale);
  assert.equal(p155.topRatio, 0.14);
  assert.equal(p155.bottomRatio, 0.945);
});

test('Closed-form Three.js camera lookAtY projects world (0,0,0) to exact 2D soleStageTopPct (0px gap)', () => {
  const fovDeg = 34;
  const cameraY = 1.45;
  const cameraZ = 4.55;
  for (const solePct of [79.5, 83.2, 86.4, 89.0]) {
    const { lookAtY } = computeThreeCameraLookAtForSolePct({
      cameraPosY: cameraY,
      cameraPosZ: cameraZ,
      fovDeg,
      soleStageTopPct: solePct,
    });
    const cam = new THREE.PerspectiveCamera(fovDeg, 720 / 820, 0.1, 40);
    cam.position.set(0, cameraY, cameraZ);
    cam.lookAt(0, lookAtY, 0);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();

    const projected = new THREE.Vector3(0, 0, 0).project(cam);
    const projectedTopPct = ((1 - projected.y) / 2) * 100;
    assert.ok(
      Math.abs(projectedTopPct - solePct) < 0.05,
      `Expected projected soleTopPct ${projectedTopPct.toFixed(3)} to match target ${solePct}`
    );
  }
});

test('True 8-angle turnaround removes mirrorX completely on 270° and 315°', () => {
  assert.deepEqual([...TURNAROUND_ANGLES], [0, 45, 90, 135, 180, 225, 270, 315]);
  for (const angle of TURNAROUND_ANGLES) {
    const spec = resolve360AngleRenderSpec(angle);
    assert.equal(spec.mirrorX, false, `Angle ${angle}° must NEVER mirrorX`);
    assert.equal(spec.canonicalSliceAngle, angle);
  }
});

test('Bag strap metadata & Pre-Normalization branch accurately across all 5 bag styles and 8 angles', () => {
  const backpack = inferBagCarrySpec({
    category: 'bag',
    subcategory: 'backpack',
    name: '블랙 발리스틱 나일론 미니멀 백팩',
  });
  assert.equal(backpack.has_strap, true);
  assert.equal(backpack.bag_carry_style, 'backpack');

  const clutch = inferBagCarrySpec({
    category: 'bag',
    subcategory: 'clutch',
    name: '에스프레소 풀그레인 레더 포트폴리오 클러치',
  });
  assert.equal(clutch.has_strap, false);
  assert.equal(clutch.bag_carry_style, 'hand_only');

  const messenger = inferBagCarrySpec({
    category: 'bag',
    subcategory: 'messenger',
    name: '차콜 왁스 캔버스 크로스 메신저백',
  });
  assert.equal(messenger.has_strap, true);
  assert.equal(messenger.bag_carry_style, 'crossbody');

  const duffel = inferBagCarrySpec({
    category: 'bag',
    subcategory: 'duffel',
    name: '올리브 코튼 캔버스 위켄더 더플백',
  });
  assert.equal(duffel.has_strap, true);
  assert.equal(duffel.bag_carry_style, 'convertible_hand_strap');

  const hobo = inferBagCarrySpec({
    category: 'bag',
    subcategory: 'hobo',
    name: '스톤 스웨이드 미니멀 숄더 호보백',
  });
  assert.equal(hobo.has_strap, true);
  assert.equal(hobo.bag_carry_style, 'shoulder');

  const baseGeom = {
    cx: 90,
    shoulderY: 50,
    waistY: 90,
    shoulderW: 48,
    hipW: 40,
    headH: 24,
  };

  // Strapless hand_only bag MUST have strapRect === null and lowered mid-thigh bagTopY
  const handBox = computeBagAssetPlacementBox({
    angleDeg: 0,
    handedness: 'right',
    hasStrap: false,
    bagCarryStyle: 'hand_only',
    ...baseGeom,
  });
  assert.equal(handBox.strapRect, null);
  assert.ok(handBox.bagRect && handBox.bagRect.y >= baseGeom.waistY + baseGeom.headH * 0.85);
  assert.equal(handBox.screenSide, 'screen-right');

  // Shoulder bag has strapRect and hangs cleanly below waist (never armpit)
  const shoulderBox = computeBagAssetPlacementBox({
    angleDeg: 0,
    handedness: 'right',
    hasStrap: true,
    bagCarryStyle: 'shoulder',
    ...baseGeom,
  });
  assert.ok(shoulderBox.strapRect !== null);
  assert.ok(shoulderBox.bagRect && shoulderBox.bagRect.y >= baseGeom.waistY + baseGeom.headH * 0.3);

  // Backpack shows dual front straps only at 0° (bagRect === null) and centered rear pack at 180°
  const bpFront = computeBagAssetPlacementBox({
    angleDeg: 0,
    handedness: 'right',
    hasStrap: true,
    bagCarryStyle: 'backpack',
    ...baseGeom,
  });
  assert.equal(bpFront.screenSide, 'front-straps-only');
  assert.ok(bpFront.strapRect && bpFront.secondaryStrapRect);
  assert.equal(bpFront.bagRect, null);

  const bpBack = computeBagAssetPlacementBox({
    angleDeg: 180,
    handedness: 'right',
    hasStrap: true,
    bagCarryStyle: 'backpack',
    ...baseGeom,
  });
  assert.equal(bpBack.screenSide, 'center-back');
  assert.ok(bpBack.bagRect !== null);

  // 270° and 315° carry sides for right-handed (anatomical left carry)
  const anatomy = resolveBagCarryAnatomy('right', { hasStrap: false, bagCarryStyle: 'hand_only' });
  assert.equal(anatomy.perAngleScreenSide[270], 'screen-left');
  assert.equal(anatomy.perAngleScreenSide[315], 'screen-right');
  assert.match(anatomy.dualHandRolePrompt, /ZERO ARMPIT TUCK/i);
  assert.match(anatomy.dualHandRolePrompt, /ZERO SHOULDER STRAP/i);
});

test('Post-Normalization computeMasterLandmarkAlignment locks non-0° slice to 0° sole & stature', () => {
  const canonicalW = 768;
  const canonicalH = 1024;
  const masterLandmarks = {
    crownYRatio: 0.22,
    soleYRatio: 0.945,
    statureRatio: 0.725,
    coreCenterXRatio: 0.5,
  };
  // Simulate a 90° slice that came back slightly too small & shifted right/up
  const aligned = computeMasterLandmarkAlignment({
    sourceWidth: 768,
    sourceHeight: 1024,
    sliceCrownY: 180,
    sliceSoleY: 820,
    sliceCoreCx: 430,
    sliceMinX: 300,
    sliceMaxX: 560,
    sliceMinY: 180,
    canonicalW,
    canonicalH,
    masterLandmarks,
  });
  const mappedSoleY = aligned.dstY + 820 * aligned.scale;
  const mappedCrownY = aligned.dstY + 180 * aligned.scale;
  assert.ok(Math.abs(mappedSoleY - canonicalH * masterLandmarks.soleYRatio) <= 2);
  assert.ok(Math.abs(mappedCrownY - canonicalH * masterLandmarks.crownYRatio) <= 3);
});

test('Vision QC correction hints cover armpit tuck and strap spec mismatch', () => {
  const hint = buildQcCorrectionHint(['45:bag_armpit_tuck', '90:bag_strap_mismatch']);
  assert.match(hint, /ANTI-ARMPIT-TUCK/i);
  assert.match(hint, /BAG STRAP SPEC FIX/i);
});
