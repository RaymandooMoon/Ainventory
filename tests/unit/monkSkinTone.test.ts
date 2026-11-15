import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MST_LEVELS,
  MST_UNDERTONES,
  computeAdaptiveMstShading,
} from '../../src/services/monkSkinTone.ts';
import { hexToRgb, rgbToCieLab } from '../../src/shared/colorMath.js';

describe('monkSkinTone inclusive MST 1-10 adaptive shading', () => {
  it('supports all 10 Monk Skin Tone levels and 4 undertones', () => {
    assert.deepEqual([...MST_LEVELS], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.deepEqual([...MST_UNDERTONES], ['cool', 'neutral', 'warm', 'olive']);
  });

  it('prevents washout on fair skin (MST 1) and prevents black shadow crush on deep skin (MST 10)', () => {
    const fair = computeAdaptiveMstShading({
      skinToneHex: '#F6EDE4',
      mstLevel: 1,
      mstUndertone: 'cool',
      theme: 'light',
    });
    const fairContourRgb = hexToRgb(fair.contourInk);
    const fairContourLab = rgbToCieLab(fairContourRgb.r, fairContourRgb.g, fairContourRgb.b);
    assert.ok(fairContourLab.L < 55, 'Fair contour ink must remain visible on white canvas');

    const deep = computeAdaptiveMstShading({
      skinToneHex: '#291711',
      mstLevel: 10,
      mstUndertone: 'warm',
      theme: 'dark',
    });
    const deepShadowRgb = hexToRgb(deep.deepShadow);
    assert.ok(deepShadowRgb.r >= 0x1a, 'MST-10 deepShadow must respect espresso floor (#1A0F0B)');
    assert.equal(deep.mstLevel, 10);
  });
});
