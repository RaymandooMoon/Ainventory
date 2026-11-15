import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CARBON_DOM_CONTRACT,
  CARBON_HIG_TOKENS,
  WARDROBE_PILL_FILTERS,
  getWardrobeCategoryLabel,
  normalizeWardrobeCategoryKey,
} from '../../src/contracts/carbonDesignContract.ts';

describe('carbonDesignContract Apple HIG monochrome & taxonomy invariants', () => {
  it('preserves immutable light and OLED dark monochrome tokens and 8pt grid', () => {
    assert.equal(CARBON_HIG_TOKENS.light.bgCanvas, '#FFFFFF');
    assert.equal(CARBON_HIG_TOKENS.light.bgSurface, '#F5F5F7');
    assert.equal(CARBON_HIG_TOKENS.dark.bgCanvas, '#000000');
    assert.equal(CARBON_HIG_TOKENS.dark.bgSurface, '#1C1C1E');
    assert.equal(CARBON_HIG_TOKENS.gridUnitPt, 8);
    assert.ok(CARBON_HIG_TOKENS.touchTargetMinPx >= 44);
    assert.equal(CARBON_HIG_TOKENS.numericVariant, 'tabular-nums');
  });

  it('normalizes wardrobe category keys across singular, plural, and dress aliases', () => {
    assert.equal(WARDROBE_PILL_FILTERS.length, 6);
    assert.equal(normalizeWardrobeCategoryKey('Tops'), 'top');
    assert.equal(normalizeWardrobeCategoryKey('dress'), 'top');
    assert.equal(normalizeWardrobeCategoryKey('footwear'), 'shoes');
    assert.equal(normalizeWardrobeCategoryKey('outerwear'), 'outer');
    assert.equal(getWardrobeCategoryLabel('bottoms'), 'Bottoms');
    assert.ok(CARBON_DOM_CONTRACT.wardrobeGridId.length > 0);
  });
});
