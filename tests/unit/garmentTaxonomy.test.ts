import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CATEGORIES,
  WEAR_SLOTS_11,
  getPersonalColorLabels,
  resolveMacroPersonalColor,
  resolveManifestSlotAndGlb,
  resolveStudioSeedUrl,
  upgradeStudioSeedToWebp,
} from '../../src/shared/garmentTaxonomy.js';

describe('garmentTaxonomy 11-slot & seed resolution', () => {
  it('defines 11 canonical wear slots and core categories', () => {
    assert.equal(WEAR_SLOTS_11.length, 11);
    assert.ok(CATEGORIES.length >= 5);
  });

  it('upgrades legacy png/jpg studio seed URLs under /seed/ to webp', () => {
    assert.equal(
      upgradeStudioSeedToWebp('/seed/studio-cardigan.png'),
      '/seed/studio-cardigan.webp'
    );
    assert.equal(
      upgradeStudioSeedToWebp('https://example.com/custom.png'),
      'https://example.com/custom.png'
    );
  });

  it('maps subcategories to 3D manifest slots and GLB physics presets', () => {
    const coatSpec = resolveManifestSlotAndGlb('outer', 'coat');
    assert.equal(coatSpec.slotKey, 'outer');
    assert.ok(coatSpec.baseGlb.length > 0);

    const sneakerSpec = resolveManifestSlotAndGlb('shoes', 'sneakers');
    assert.equal(sneakerSpec.slotKey, 'shoes');
  });

  it('resolves studio seed fallback URLs and personal color macro seasons', () => {
    const url = resolveStudioSeedUrl(null, 'top', 'knit');
    assert.ok(url.endsWith('.webp'));

    assert.equal(resolveMacroPersonalColor('autumn_mute'), 'autumn_warm');
    assert.equal(resolveMacroPersonalColor('winter_bright'), 'winter_cool');
    const labels = getPersonalColorLabels('summer_mute');
    assert.equal(labels.macro, 'summer_cool');
    assert.ok(Boolean(labels.ko) && Boolean(labels.en));
  });
});
