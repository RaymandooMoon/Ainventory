import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COLOR_PALETTE,
  colorSimilarityScore,
  deltaE76,
  hexToRgb,
  matchClosestPaletteColor,
  rgbToCieLab,
  rgbToHex,
} from '../../src/shared/colorMath.js';

describe('colorMath isomorphic color conversions', () => {
  it('parses 6-digit, 3-digit, and malformed hex strings safely', () => {
    assert.deepEqual(hexToRgb('#1D1D1F'), { r: 29, g: 29, b: 31 });
    assert.deepEqual(hexToRgb('#fff'), { r: 255, g: 255, b: 255 });
    assert.deepEqual(hexToRgb('invalid-hex'), { r: 142, g: 146, b: 153 });
  });

  it('clamps and formats RGB bytes into uppercase 6-digit hex', () => {
    assert.equal(rgbToHex(255, 255, 255), '#FFFFFF');
    assert.equal(rgbToHex(-12, 128.4, 300), '#0080FF');
  });

  it('computes D65 CIELAB coordinates and symmetric deltaE76 distance', () => {
    const whiteLab = rgbToCieLab(255, 255, 255);
    const blackLab = rgbToCieLab(0, 0, 0);
    assert.ok(whiteLab.L > 99.5 && whiteLab.L <= 100.1);
    assert.ok(blackLab.L >= -0.1 && blackLab.L < 0.5);

    const d1 = deltaE76(whiteLab, blackLab);
    const d2 = deltaE76(blackLab, whiteLab);
    assert.ok(Math.abs(d1 - d2) < 1e-9);
    assert.ok(d1 > 95);
  });

  it('scores identical colors at 100 and distant colors near 0', () => {
    assert.equal(colorSimilarityScore('#1D1D1F', '#1D1D1F'), 100);
    assert.ok(colorSimilarityScore('#1D1D1F', '#FFFFFF') < 10);
  });

  it('matches closest canonical palette entry without mutating COLOR_PALETTE', () => {
    const beforeLen = COLOR_PALETTE.length;
    const matched = matchClosestPaletteColor('#1E1E20');
    assert.equal(matched.name, '블랙');
    assert.equal(matched.hex, '#1D1D1F');
    assert.equal(COLOR_PALETTE.length, beforeLen);
  });
});
