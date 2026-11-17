import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CATEGORIES,
  CITY_COORDS,
  LAYERED_10_CATALOG,
  WEAR_SLOTS_11,
  getPersonalColorLabels,
  resolveMacroPersonalColor,
  resolveManifestSlotAndGlb,
  resolveStudioSeedUrl,
  upgradeStudioSeedToWebp,
} from '../../src/shared/garmentTaxonomy.js';
import { ACCESSORY_SUBTREE_SLOTS } from '../../src/services/fittingRenderer.ts';

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

  it('provides 10 photorealistic 2-stage layering items across top, top_mid, outer_mid, and outer', () => {
    assert.equal(LAYERED_10_CATALOG.length, 10);
    const counts = { top: 0, top_mid: 0, outer_mid: 0, outer: 0 };
    for (const item of LAYERED_10_CATALOG) {
      counts[item.slot_key as keyof typeof counts] += 1;
      assert.ok(item.image_url.startsWith('/seed/layer-') && item.image_url.endsWith('.webp'));
      assert.ok(item.idOffset >= 301 && item.idOffset <= 310);
    }
    assert.deepEqual(counts, { top: 3, top_mid: 3, outer_mid: 2, outer: 2 });
  });

  it('renames Carry & Waist branch to 가방 · 허리 (Bag & Waist) and provides Korean district/neighborhood CITY_COORDS', () => {
    const carrySlots = ACCESSORY_SUBTREE_SLOTS.filter((s) => s.branchKey === 'carry');
    assert.ok(carrySlots.length >= 3);
    for (const s of carrySlots) {
      assert.equal(s.branchKo, '가방 · 허리');
      assert.equal(s.branchEn, 'Bag & Waist');
    }

    const cityNames = CITY_COORDS.map((c) => c.name);
    assert.ok(cityNames.includes('서울 · 중구 명동'));
    assert.ok(cityNames.includes('서울 강남구 역삼동'));
    assert.ok(cityNames.includes('서울 마포구 연남동'));
    assert.ok(cityNames.includes('부산 해운대구 우동'));
    assert.ok(cityNames.includes('제주 제주시 애월읍'));
  });
});

