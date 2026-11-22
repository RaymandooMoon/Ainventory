import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  resolveAppPreviewSrc,
  SITE_COPY,
  SITE_META,
  type AppPreviewScreenId,
  type SiteLang,
  type SiteTheme,
} from '../../src/site/siteContent.ts';

describe('ainvtry.com official site content & IR architecture contract', () => {
  it('aligns domain, contact email, and founder identity for startup verification', () => {
    assert.equal(SITE_META.domain, 'ainvtry.com');
    assert.equal(SITE_META.contactEmail, 'raymond@ainvtry.com');
    assert.ok(SITE_META.contactEmail.endsWith(`@${SITE_META.domain}`));
    assert.equal(SITE_META.founderName, 'Raymond Moon');
  });

  it('ships all 16 theme/language-synced live app preview WebP assets on disk', () => {
    const screens: readonly AppPreviewScreenId[] = ['outfits', 'closet', 'stats', 'profile'];
    const langs: readonly SiteLang[] = ['en', 'ko'];
    const themes: readonly SiteTheme[] = ['dark', 'light'];
    const publicDir = path.resolve(import.meta.dirname, '../../site/public');

    for (const screen of screens) {
      for (const lang of langs) {
        for (const theme of themes) {
          const src = resolveAppPreviewSrc(screen, lang, theme);
          assert.equal(src, `/assets/previews/app-${screen}-${lang}-${theme}.webp`);
          const diskPath = path.join(publicDir, src.replace(/^\//, ''));
          assert.ok(fs.existsSync(diskPath), `Missing preview asset on disk: ${diskPath}`);
        }
      }
    }
  });

  it('provides complete bilingual EN/KO IR architecture, Google Maps pipeline, KPI scorecard, and roadmap', () => {
    for (const lang of ['en', 'ko'] as const) {
      const copy = SITE_COPY[lang];
      assert.ok(copy.hero.titleAccent.length > 0);
      assert.ok(copy.hero.marbleHint.length > 0);
      assert.ok(copy.nav.homeAria.length > 0);
      assert.ok(copy.nav.opacityLabel.length > 0);
      assert.equal(copy.appPreview.screens.length, 4);
      assert.equal(copy.architecture.layers.length, 4);
      assert.equal(copy.architecture.mapsNodes.length, 4);
      assert.equal(copy.stack.heroKpis.length, 4);
      assert.equal(copy.stack.specs.length, 4);
      assert.equal(copy.stack.cards.length, 6);
      assert.equal(copy.vision.milestones.length, 3);
      assert.equal(copy.interactive.topologySteps.length, 3);
      assert.ok(copy.legal.privacySections.length >= 4);
      assert.ok(copy.legal.termsSections.length >= 4);
      const serialized = JSON.stringify(copy);
      assert.ok(!serialized.includes('누끼'), 'Must avoid informal 누끼 slang');
      assert.ok(!serialized.includes('Capacitor 6'), 'Must reference Capacitor 8');
      assert.ok(!serialized.includes('concierge@'), 'Must use verified raymond@ainvtry.com contact');
      assert.ok(!serialized.includes('MILANO'), 'Must not contain fabricated office claims');
      assert.ok(serialized.includes('Weather API v1'), 'Must document Google Weather API v1 integration');
      assert.ok(serialized.includes('Places API (New)'), 'Must document Google Places API (New) integration');
    }
  });
});
