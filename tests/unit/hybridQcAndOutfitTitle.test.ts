import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateSlicedTurnaroundOrientationQc,
  shouldSwapMirroredAnglePair,
} from '../../src/services/vton2DService.ts';
import { buildAutoOutfitTitle } from '../../src/utils/outfitTitleGenerator.ts';

test('evaluateSlicedTurnaroundOrientationQc flags duplicate left-facing 135° rear-quarter while passing valid 225°', () => {
  const verdict = evaluateSlicedTurnaroundOrientationQc(
    {
      45: 'right',
      90: 'right',
      135: 'left',
      180: 'neutral',
      225: 'left',
      270: 'left',
      315: 'left',
    },
    [45, 90, 135, 180, 225, 270, 315]
  );

  assert.deepEqual(verdict.failedAngles, [135]);
  assert.equal(verdict.reasonsByAngle[135], 'rear_quarter_duplicate_facing_left');
  assert.ok(verdict.passedAngles.includes(225));
  assert.ok(!verdict.passedAngles.includes(135));
  assert.equal(shouldSwapMirroredAnglePair('left', 'left'), false);
});

test('evaluateSlicedTurnaroundOrientationQc flags duplicate right-facing 225° rear-quarter', () => {
  const verdict = evaluateSlicedTurnaroundOrientationQc(
    {
      45: 'right',
      90: 'right',
      135: 'right',
      180: 'neutral',
      225: 'right',
      270: 'left',
      315: 'left',
    },
    [45, 90, 135, 180, 225, 270, 315]
  );

  assert.deepEqual(verdict.failedAngles, [225]);
  assert.equal(verdict.reasonsByAngle[225], 'rear_quarter_duplicate_facing_right');
  assert.ok(verdict.passedAngles.includes(135));
});

test('evaluateSlicedTurnaroundOrientationQc passes all 8 angles when directions match canonical sides', () => {
  const verdict = evaluateSlicedTurnaroundOrientationQc({
    0: 'neutral',
    45: 'right',
    90: 'right',
    135: 'right',
    180: 'neutral',
    225: 'left',
    270: 'left',
    315: 'left',
  });

  assert.deepEqual(verdict.failedAngles, []);
  assert.equal(verdict.passedAngles.length, 8);
});

test('buildAutoOutfitTitle generates distinct garment-aware titles and avoids repeating previousTitle', () => {
  const sharedCtx = {
    styleMode: 'stylized_isometric',
    weather: { avgTemp: -1, scenarioKey: 'live' },
    scenarioKey: 'live',
    activeRecommendation: { presetKey: 'business_casual' },
    resolvedCityDisplayLabel: '서울 중구 명동',
    lang: 'ko',
  };

  const titleA = buildAutoOutfitTitle({
    ...sharedCtx,
    slots: {
      outer: { id: 1, name: '화이트 경량 퀼팅 패딩', color: 'white', subcategory: '패딩' },
      acc_scarf: { id: 2, name: '아이보리 캐시미어 머플러', color: 'ivory', subcategory: '머플러' },
    },
    generationNonce: 1,
  });

  const titleB = buildAutoOutfitTitle({
    ...sharedCtx,
    slots: {
      outer: { id: 3, name: '세이지 코튼 싱글 맥 트렌치코트', color: 'olive', subcategory: '트렌치코트' },
      acc_scarf: { id: 4, name: '버건디 울 머플러', color: 'burgundy', subcategory: '머플러' },
    },
    previousTitle: titleA,
    generationNonce: 2,
  });

  const titleC = buildAutoOutfitTitle({
    ...sharedCtx,
    slots: {
      outer: { id: 3, name: '세이지 코튼 싱글 맥 트렌치코트', color: 'olive', subcategory: '트렌치코트' },
      acc_scarf: { id: 4, name: '버건디 울 머플러', color: 'burgundy', subcategory: '머플러' },
    },
    previousTitle: titleB,
    generationNonce: 3,
  });

  assert.notEqual(titleA, titleB);
  assert.notEqual(titleB, titleC);
  assert.ok(titleA.includes('패딩') || titleA.includes('화이트'));
  assert.ok(titleB.includes('세이지') || titleB.includes('트렌치코트'));

  const titleEn = buildAutoOutfitTitle({
    ...sharedCtx,
    lang: 'en',
    slots: {
      outer: { id: 5, name: 'Ivory Puffer Jacket', color: 'ivory', subcategory: 'Puffer' },
    },
    generationNonce: 4,
  });
  assert.ok(titleEn.length > 6 && titleEn.length <= 72);
});
