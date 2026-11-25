import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isDemoVtonAccount } from '../../src/utils/api.ts';
import {
  DEMO_CYBERPUNK_STAGE_BACKGROUND_ID,
  DEMO_CYBERPUNK_UNLOCKED_IDS,
  createDemoCyberpunkEconomyState,
} from '../../src/utils/stageBackgroundCatalog.ts';
import {
  getShowcaseDemoSheetUrl,
  getShowcaseDemoSliceUrls,
} from '../../src/services/vton2DService.ts';

describe('isDemoVtonAccount', () => {
  it('returns true for site_demo role, flag, or username', () => {
    assert.equal(isDemoVtonAccount({ role: 'site_demo' }), true);
    assert.equal(isDemoVtonAccount({ isSiteDemo: true }), true);
    assert.equal(isDemoVtonAccount({ username: 'site_demo' }), true);
  });

  it('returns true for sample demo fallback accounts', () => {
    assert.equal(isDemoVtonAccount({ isSampleDemo: true, role: 'guest' }), true);
  });

  it('returns true for read-only RBAC roles that have vton:preview without vton:synthesize', () => {
    assert.equal(
      isDemoVtonAccount({
        role: 'partner_preview',
        permissions: ['closet:read_sample', 'outfit:read', 'vton:preview'],
      }),
      true
    );
  });

  it('returns false for regular member, admin, and nullish accounts', () => {
    assert.equal(isDemoVtonAccount(null), false);
    assert.equal(isDemoVtonAccount(undefined), false);
    assert.equal(
      isDemoVtonAccount({
        role: 'user',
        username: 'alice',
        permissions: ['vton:preview', 'vton:synthesize'],
      }),
      false
    );
    assert.equal(
      isDemoVtonAccount({
        role: 'admin',
        username: 'admin',
        permissions: ['vton:preview', 'vton:synthesize', 'admin:users'],
      }),
      false
    );
  });
});

describe('Cyberpunk Female Demo Showcase Defaults', () => {
  it('equips the Neo-Seoul Skybridge Plaza cyberpunk stage and unlocks all 4 cyberpunk stages immutably', () => {
    const base = {
      iBalance: 500,
      unlockedIds: ['c_studio_minimal'],
      equippedBackgroundId: 'c_studio_minimal',
    };
    const demoState = createDemoCyberpunkEconomyState(base);

    assert.equal(demoState.equippedBackgroundId, DEMO_CYBERPUNK_STAGE_BACKGROUND_ID);
    assert.equal(demoState.equippedBackgroundId, 's_cyber_megacity_plaza');
    assert.equal(demoState.lightingPreset, 'auto');
    for (const cyberId of DEMO_CYBERPUNK_UNLOCKED_IDS) {
      assert.equal(demoState.unlockedIds.includes(cyberId), true);
    }
    // Original object must remain untouched (immutability)
    assert.equal(base.equippedBackgroundId, 'c_studio_minimal');
    assert.deepEqual(base.unlockedIds, ['c_studio_minimal']);
  });

  it('resolves high-resolution female cyber-couture turnaround sheet and 8 pre-matted transparent WebP slices', () => {
    const stylizedUrl = getShowcaseDemoSheetUrl('stylized_isometric');
    const photorealUrl = getShowcaseDemoSheetUrl('photorealistic');
    assert.match(stylizedUrl, /vton-showcase-3x2-cyber-female\.jpg/);
    assert.match(photorealUrl, /vton-showcase-3x2-cyber-female\.jpg/);

    const slices = getShowcaseDemoSliceUrls();
    for (const deg of [0, 45, 90, 135, 180, 225, 270, 315] as const) {
      assert.match(slices[deg], new RegExp(`demo-cyber-female-${deg}\\.webp(\\?v=[a-z0-9]+)?$`));
    }
  });
});
