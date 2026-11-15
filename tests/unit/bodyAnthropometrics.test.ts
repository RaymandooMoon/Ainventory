import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BODY_SHAPE_OPTIONS,
  getBodyShapeStylingAdvice,
  normalizeBodyShapeKey,
  resolveAnatomicalProfile,
  suggestBodyShapeFromMetrics,
} from '../../src/utils/bodyAnthropometrics.js';

describe('bodyAnthropometrics profile & morph target resolution', () => {
  it('exposes all 7 canonical body shape presets', () => {
    assert.equal(BODY_SHAPE_OPTIONS.length, 7);
    const keys = BODY_SHAPE_OPTIONS.map((o) => o.key);
    assert.ok(keys.includes('standard_balanced'));
    assert.ok(keys.includes('plus_curvy'));
  });

  it('normalizes legacy and contract body shape aliases deterministically', () => {
    assert.equal(normalizeBodyShapeKey('slim_lean'), 'ectomorph_thin');
    assert.equal(normalizeBodyShapeKey('athletic_muscular'), 'muscular_athletic');
    assert.equal(normalizeBodyShapeKey('standard_balanced'), 'standard_balanced');
    assert.equal(normalizeBodyShapeKey('unknown_shape_xyz'), null);
  });

  it('suggests realistic body shapes across diverse BMI & proportion regimes', () => {
    const lean = suggestBodyShapeFromMetrics({ heightCm: 180, weightKg: 56, gender: 'male' });
    assert.equal(lean, 'ectomorph_thin');

    const plus = suggestBodyShapeFromMetrics({ heightCm: 164, weightKg: 98, gender: 'female' });
    assert.equal(plus, 'plus_curvy');
  });

  it('resolves complete anatomical profile with clamped dimensions and morph scales', () => {
    const profile = resolveAnatomicalProfile({
      gender: 'female',
      heightCm: 165,
      weightKg: 54,
      bodyShape: 'standard_balanced',
    });
    assert.equal(profile.heightCm, 165);
    assert.equal(profile.weightKg, 54);
    assert.ok(profile.bmi > 18 && profile.bmi < 22);
    assert.ok(profile.morph.heightScale > 0.8 && profile.morph.heightScale < 1.2);
    assert.ok(getBodyShapeStylingAdvice(profile.bodyShape).length > 0);
  });
});
