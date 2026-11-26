import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { isDemoVtonAccount } from '../../src/utils/api.ts';
import {
  DEMO_CYBERPUNK_LIGHTING_INTENSITY,
  DEMO_CYBERPUNK_STAGE_BACKGROUND_ID,
  DEMO_CYBERPUNK_UNLOCKED_IDS,
  createDemoCyberpunkEconomyState,
} from '../../src/utils/stageBackgroundCatalog.ts';
import {
  CYBER_DEMO_SHOWCASE_GARMENTS,
  STANDALONE_SAMPLE_GARMENTS,
} from '../../src/utils/standaloneFallback.ts';
import {
  getNativeSeedHex,
  resolveStudioSeedUrl,
} from '../../src/shared/garmentTaxonomy.js';
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
  it('equips the Neo-Seoul Skybridge Plaza cyberpunk stage at 50% brightness and unlocks all 4 cyberpunk stages immutably', () => {
    const base = {
      iBalance: 500,
      unlockedIds: ['c_studio_minimal'],
      equippedBackgroundId: 'c_studio_minimal',
      lightingIntensity: 100,
    };
    const demoState = createDemoCyberpunkEconomyState(base);

    assert.equal(demoState.equippedBackgroundId, DEMO_CYBERPUNK_STAGE_BACKGROUND_ID);
    assert.equal(demoState.equippedBackgroundId, 's_cyber_megacity_plaza');
    assert.equal(demoState.lightingPreset, 'auto');
    assert.equal(demoState.lightingIntensity, DEMO_CYBERPUNK_LIGHTING_INTENSITY);
    assert.equal(demoState.lightingIntensity, 50);
    for (const cyberId of DEMO_CYBERPUNK_UNLOCKED_IDS) {
      assert.equal(demoState.unlockedIds.includes(cyberId), true);
    }
    // Original object must remain untouched (immutability)
    assert.equal(base.equippedBackgroundId, 'c_studio_minimal');
    assert.equal(base.lightingIntensity, 100);
    assert.deepEqual(base.unlockedIds, ['c_studio_minimal']);
  });

  it('ships 2 paired studio-cutout variants each for black pleated mini skirts, sheer stockings, and chunky lace-up combat boots on disk', () => {
    const skirts = CYBER_DEMO_SHOWCASE_GARMENTS.filter((g) => g.category === 'bottom');
    const stockings = CYBER_DEMO_SHOWCASE_GARMENTS.filter((g) => g.category === 'socks');
    const boots = CYBER_DEMO_SHOWCASE_GARMENTS.filter((g) => g.category === 'shoes');

    assert.equal(skirts.length, 2, 'Expected 2 cyber black pleated mini skirts');
    assert.equal(stockings.length, 2, 'Expected 2 cyber black sheer stockings');
    assert.equal(boots.length, 2, 'Expected 2 cyber black chunky lace-up boots');
    assert.equal(CYBER_DEMO_SHOWCASE_GARMENTS.length, 8);

    const sampleUrls = new Set(STANDALONE_SAMPLE_GARMENTS.map((g) => g.image_url));
    const publicDir = path.resolve(import.meta.dirname, '../../public');
    for (const item of CYBER_DEMO_SHOWCASE_GARMENTS) {
      assert.ok(sampleUrls.has(item.image_url), `Missing in STANDALONE_SAMPLE_GARMENTS: ${item.image_url}`);
      assert.ok(getNativeSeedHex(item.image_url), `Missing NATIVE_SEED_HEX registration for ${item.image_url}`);
      assert.equal(
        resolveStudioSeedUrl(item, item.category, item.subcategory),
        item.image_url,
        `resolveStudioSeedUrl must preserve ${item.image_url} without generic fallback`
      );
      const diskPath = path.join(publicDir, item.image_url.replace(/^\/+/, ''));
      assert.ok(fs.existsSync(diskPath), `Missing cyber studio garment asset on disk: ${diskPath}`);
      const buf = fs.readFileSync(diskPath);
      assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
      assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
      assert.equal(buf.toString('ascii', 12, 16), 'VP8X');
      assert.ok((buf[20] & 0x10) !== 0, `${item.image_url} must carry WebP alpha channel`);
    }
  });

  it('resolves high-resolution female cyber-couture turnaround sheet and 8 proportion-unified 720x960 RGBA WebP slices', () => {
    const stylizedUrl = getShowcaseDemoSheetUrl('stylized_isometric');
    const photorealUrl = getShowcaseDemoSheetUrl('photorealistic');
    assert.match(stylizedUrl, /vton-showcase-3x2-cyber-female\.jpg/);
    assert.match(photorealUrl, /vton-showcase-3x2-cyber-female\.jpg/);

    const slices = getShowcaseDemoSliceUrls();
    const seedDir = path.resolve(import.meta.dirname, '../../public/seed');
    for (const deg of [0, 45, 90, 135, 180, 225, 270, 315] as const) {
      assert.match(slices[deg], new RegExp(`demo-cyber-female-${deg}\\.webp\\?v=4$`));
      const diskPath = path.join(seedDir, `demo-cyber-female-${deg}.webp`);
      assert.ok(fs.existsSync(diskPath), `Missing demo slice on disk: ${diskPath}`);
      const buf = fs.readFileSync(diskPath);
      assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
      assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
      assert.equal(buf.toString('ascii', 12, 16), 'VP8X');
      assert.ok((buf[20] & 0x10) !== 0, `Slice ${deg}deg must carry WebP alpha channel`);
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      assert.equal(width, 720, `Slice ${deg}deg width must be 720`);
      assert.equal(height, 960, `Slice ${deg}deg height must be 960`);
    }
  });
});
