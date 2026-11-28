import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_FRUITBOX_PREFS,
  normalizeVisualStyle,
} from '../../src/minigame/fruitBoxStorage.ts';

describe('APPLE 10 minigame preferences — visual style normalization', () => {
  it('keeps the current style identifiers as-is', () => {
    assert.equal(normalizeVisualStyle('neon3d'), 'neon3d');
    assert.equal(normalizeVisualStyle('paper2d'), 'paper2d');
  });

  it('migrates the legacy "original2d" preference to the new Paper 2D style', () => {
    assert.equal(normalizeVisualStyle('original2d'), 'paper2d');
  });

  it('falls back to the default style for unknown or malformed values', () => {
    for (const raw of [undefined, null, '', 'fruitbox', 42, {}, ['paper2d']]) {
      assert.equal(normalizeVisualStyle(raw), DEFAULT_FRUITBOX_PREFS.visualStyle);
    }
  });
});
