import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyOfficialSyncSelection,
  buildGarmentRegistrationStepperState,
  buildOfficialSyncFields,
} from '../../src/utils/garmentRegistrationStepper.ts';
import { computeVtonStageProgress } from '../../src/utils/vtonStageProgress.ts';

test('garment registration stepper locks save until BOTH front and back photos are uploaded', () => {
  const empty = buildGarmentRegistrationStepperState({
    hasFront: false,
    hasBack: false,
    hasNeckTag: false,
    hasCareLabel: false,
    hasOfficialSync: false,
    currentFormStep: 0,
    lang: 'ko',
  });
  assert.equal(empty.canSave, false);
  assert.equal(empty.requiredCapturedCount, 0);
  assert.equal(empty.requiredTotalCount, 2);
  assert.equal(empty.stages[0].status, 'active');
  assert.match(empty.missingRequirementText, /앞면 1장 \+ 뒷면 1장/);

  const frontOnly = buildGarmentRegistrationStepperState({
    hasFront: true,
    hasBack: false,
    hasNeckTag: false,
    hasCareLabel: false,
    hasOfficialSync: false,
    currentFormStep: 0,
    lang: 'ko',
  });
  assert.equal(frontOnly.canSave, false);
  assert.equal(frontOnly.requiredCapturedCount, 1);
  assert.equal(frontOnly.stages[0].status, 'done');
  assert.equal(frontOnly.stages[1].status, 'active');
  assert.match(frontOnly.missingRequirementText, /뒷면/);

  const backOnly = buildGarmentRegistrationStepperState({
    hasFront: false,
    hasBack: true,
    hasNeckTag: false,
    hasCareLabel: false,
    hasOfficialSync: false,
    currentFormStep: 0,
    lang: 'ko',
  });
  assert.equal(backOnly.canSave, false);
  assert.equal(backOnly.requiredCapturedCount, 1);
  assert.match(backOnly.missingRequirementText, /앞면/);

  const ready = buildGarmentRegistrationStepperState({
    hasFront: true,
    hasBack: true,
    hasNeckTag: true,
    hasCareLabel: true,
    hasOfficialSync: true,
    currentFormStep: 2,
    lang: 'ko',
  });
  assert.equal(ready.canSave, true);
  assert.equal(ready.requiredCapturedCount, 2);
  assert.equal(ready.stages[0].status, 'done');
  assert.equal(ready.stages[1].status, 'done');
  assert.equal(ready.stages[2].status, 'done');
  assert.equal(ready.stages[3].status, 'active');
});

test('official info sync fields diff current form and apply only selected updates', () => {
  const webMatch = {
    found: true,
    official_name: '우영미 울 블렌드 싱글 블레이저',
    brand: 'WOOYOUNGMI',
    product_code: 'W243JK01999',
    material_composition: '울 70%, 나일론 25%, 캐시미어 5%',
    material: '울',
    care_tip: '드라이클리닝 전용',
    retail_price_krw: 1280000,
    purchase_store: 'SSENSE',
    official_image_data: 'data:image/webp;base64,AAA',
  };

  const fields = buildOfficialSyncFields(
    webMatch,
    {
      name: '검정 재킷',
      brand: '',
      productCode: '',
      materialComposition: '',
      material: '',
      careTip: '',
      price: '',
      purchaseStore: '',
    },
    'ko'
  );

  assert.ok(fields.length >= 6);
  const brandField = fields.find((f) => f.key === 'brand');
  const codeField = fields.find((f) => f.key === 'product_code');
  const compField = fields.find((f) => f.key === 'material_composition');
  assert.equal(brandField?.officialValue, 'WOOYOUNGMI');
  assert.equal(codeField?.officialValue, 'W243JK01999');
  assert.equal(compField?.officialValue, '울 70%, 나일론 25%, 캐시미어 5%');

  const applied = applyOfficialSyncSelection(
    webMatch,
    ['brand', 'product_code', 'material_composition'],
    true
  );

  assert.equal(applied.patch.brand, 'WOOYOUNGMI');
  assert.equal(applied.patch.productCode, 'W243JK01999');
  assert.equal(applied.patch.materialComposition, '울 70%, 나일론 25%, 캐시미어 5%');
  assert.equal(applied.patch.name, undefined);
  assert.equal(applied.applyOfficialPhoto, true);
  assert.equal(applied.appliedCount, 4);
});

test('computeVtonStageProgress transitions cleanly across anchor, turnaround streaming, and repair stages', () => {
  const idle = computeVtonStageProgress({
    aiLoading: false,
    progressiveBgAnglesLoading: false,
    lang: 'ko',
  });
  assert.equal(idle.visible, false);
  assert.equal(idle.phase, 'idle');

  const anchorStart = computeVtonStageProgress({
    aiLoading: true,
    elapsedMs: 1000,
    equippedCount: 4,
    lang: 'ko',
  });
  assert.equal(anchorStart.visible, true);
  assert.equal(anchorStart.phase, 'front_anchor');
  assert.ok(anchorStart.progressPct >= 10 && anchorStart.progressPct < 40);
  assert.match(anchorStart.label, /착장 4종/);

  const anchorLate = computeVtonStageProgress({
    aiLoading: true,
    elapsedMs: 12000,
    equippedCount: 4,
    lang: 'ko',
  });
  assert.ok(anchorLate.progressPct > anchorStart.progressPct);
  assert.ok(anchorLate.progressPct <= 94);

  const turnaround = computeVtonStageProgress({
    aiLoading: false,
    progressiveBgAnglesLoading: true,
    readyAnglesCount: 4,
    totalAnglesCount: 8,
    elapsedMs: 0,
    lang: 'ko',
  });
  assert.equal(turnaround.visible, true);
  assert.equal(turnaround.phase, 'turnaround_streaming');
  assert.equal(turnaround.progressPct, 50);
  assert.match(turnaround.label, /4\/8/);

  const repair = computeVtonStageProgress({
    aiLoading: false,
    isRepairingAngle: true,
    activeAngleDeg: 180,
    elapsedMs: 3200,
    lang: 'ko',
  });
  assert.equal(repair.visible, true);
  assert.equal(repair.phase, 'repairing_angle');
  assert.match(repair.label, /180°/);
});
