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

describe('ainvtry.com official site content & icon-first architecture contract', () => {
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
      const prefix = screen === 'outfits' ? 'app-fitting-live' : `app-${screen}`;
      for (const lang of langs) {
        for (const theme of themes) {
          const src = resolveAppPreviewSrc(screen, lang, theme);
          assert.equal(src, `/assets/previews/${prefix}-${lang}-${theme}.webp`);
          const diskPath = path.join(publicDir, src.replace(/^\//, ''));
          assert.ok(fs.existsSync(diskPath), `Missing preview asset on disk: ${diskPath}`);
        }
      }
    }
  });

  it('ships all 6 minimal 3D clay comic journey WebP assets on disk', () => {
    const publicDir = path.resolve(import.meta.dirname, '../../site/public');
    for (const lang of ['en', 'ko'] as const) {
      assert.equal(SITE_COPY[lang].journey.cuts.length, 6);
      for (const cut of SITE_COPY[lang].journey.cuts) {
        assert.match(cut.imageSrc, /^\/assets\/journey\/clay-cut-0[1-6]-v1\.webp$/);
        const diskPath = path.join(publicDir, cut.imageSrc.replace(/^\//, ''));
        assert.ok(fs.existsSync(diskPath), `Missing clay journey asset on disk: ${diskPath}`);
      }
    }
  });

  it('provides complete bilingual EN/KO icon-first content, 6-cut clay journey, Google API x 3D theater, 6-tier Dev/Prod blueprint, and 4-line privacy defense', () => {
    for (const lang of ['en', 'ko'] as const) {
      const copy = SITE_COPY[lang];
      assert.ok(copy.hero.titleAccent.length > 0);
      assert.ok(copy.hero.marbleHint.length > 0);
      assert.ok(copy.nav.homeAria.length > 0);
      assert.ok(copy.nav.opacityLabel.length > 0);
      assert.ok(copy.tapHint.length > 0);

      // Studio icon-first features
      assert.equal(copy.appPreview.screens.length, 4);
      assert.equal(copy.capabilities.pillars.atelier.features.length, 4);
      assert.equal(copy.capabilities.pillars.intelligence.features.length, 4);

      // Architecture: 6-Tier System & Hardware Blueprint + Right Governance + 4-Line Privacy + 6 Google API x 3D
      assert.equal(copy.architecture.tiers.length, 6);
      assert.equal(copy.architecture.governance.length, 3);
      assert.equal(copy.architecture.privacyShields.length, 4);
      assert.equal(copy.architecture.mapsNodes.length, 6);
      assert.equal(copy.subtabs.archMaps, 'Google API × 3D');
      assert.ok(
        copy.architecture.tiers.some((tier) => tier.highlight && tier.id === 'core'),
        'Core service tier must spotlight iNVTRY'
      );
      for (const tier of copy.architecture.tiers) {
        assert.ok(tier.nodes.length >= 1, `Tier ${tier.id} must have at least one node`);
        for (const node of tier.nodes) {
          assert.ok(node.devSpec.length > 0, `Node ${node.id} must define devSpec`);
          assert.ok(node.prodSpec.length > 0, `Node ${node.id} must define prodSpec`);
        }
      }

      // Specs & About narrative flow (01 User Journey -> 02 Mission & Roadmap -> 03 BM & Founder)
      assert.equal(copy.stack.heroKpis.length, 4);
      assert.equal(copy.stack.specs.length, 4);
      assert.equal(copy.stack.cards.length, 6);
      assert.equal(copy.journey.cuts.length, 6);
      assert.ok(copy.journey.cuts.some((cut) => cut.status === 'todo'), 'Journey must explicitly mark TO-DO cuts');
      assert.equal(copy.mission.commitments.length, 3);
      assert.equal(copy.mission.loopNodes.length, 5);
      assert.equal(copy.mission.exits.length, 2);
      assert.equal(copy.vision.milestones.length, 3);
      assert.equal(copy.vision.moats.length, 4);
      assert.equal(copy.vision.revenuePillars.length, 3);

      // Legal & Privacy compliance
      assert.ok(copy.legal.privacySections.length >= 4);
      assert.ok(copy.legal.termsSections.length >= 4);

      const serialized = JSON.stringify(copy);
      // Domain authenticity, Google APIs x Three.js, & TO-DO roadmap coverage
      assert.ok(serialized.includes('Weather API v1'), 'Must document Google Weather API v1');
      assert.ok(serialized.includes('Places API (New)'), 'Must document Google Places API (New)');
      assert.ok(serialized.includes('Street View'), 'Must spotlight Google Street View avatar staging');
      assert.ok(serialized.includes('Three.js 0.187'), 'Must spotlight Three.js 0.187 engine');
      assert.ok(serialized.includes('Google Calendar'), 'Must include Google Calendar TO-DO integration');
      assert.ok(serialized.includes('SNS'), 'Must include Instagram/SNS OOTD tagging TO-DO');
      assert.ok(
        lang === 'ko' ? serialized.includes('방문수거') : serialized.includes('pickup'),
        'Must include laundry service app pickup TO-DO'
      );
      assert.ok(
        lang === 'ko' ? serialized.includes('모델명') : serialized.includes('model code'),
        'Must include tag/model-code web lookup TO-DO'
      );
      assert.ok(serialized.includes('L4 / A100'), 'Must contrast Prod GPU hardware spec');
      assert.ok(serialized.includes('OIDC'), 'Must highlight Stateless OIDC privacy defense');
      assert.ok(serialized.includes('CMEK'), 'Must highlight 3-Zone CMEK vault defense');
      assert.ok(
        lang === 'ko' ? serialized.includes('정품 인증') : serialized.includes('Authentic'),
        'Must expand resale concept to luxury/purchase-record verified authentic resale'
      );

      // Hygiene & anti-AI / anti-leak / anti-trademark / line-break safety guards
      assert.ok(!serialized.includes('누끼'), 'Must avoid informal 누끼 slang');
      assert.ok(!serialized.includes('모두의 창업'), 'Must not leak internal program strategy report');
      assert.ok(!serialized.includes('쇼미룩'), 'Must not mention external competitor names');
      assert.ok(!serialized.includes('스타일봇'), 'Must not mention external competitor names');
      assert.ok(!/burberry/i.test(serialized), 'Must never contain third-party luxury brand trademarks');
      assert.ok(!serialized.includes('Capacitor 6'), 'Must reference Capacitor 8');
      assert.ok(!serialized.includes('concierge@'), 'Must use verified raymond@ainvtry.com');
      assert.ok(!serialized.includes('MILANO'), 'Must not contain fabricated office claims');
      assert.ok(!serialized.includes('99.99%'), 'Must not contain unverified mock SLA metrics');
      assert.ok(!serialized.includes('Kyber768'), 'Must not contain fabricated cryptography claims');
      assert.ok(!serialized.includes('H100'), 'Must not contain fabricated H100 hardware claims');
      assert.ok(!serialized.includes('V4.8'), 'Must not contain fake Stitch version badges');
      assert.ok(
        !/[가-힣]·[가-힣]/.test(serialized),
        'Must place spaces around Korean middle dots ( · ) to prevent awkward line-break runs'
      );
    }
  });
});
