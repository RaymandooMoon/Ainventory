import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SITE_COPY, SITE_META } from '../../src/site/siteContent.ts';

describe('ainvtry.com official site content contract', () => {
  it('aligns domain, contact email, and founder identity for startup verification', () => {
    assert.equal(SITE_META.domain, 'ainvtry.com');
    assert.equal(SITE_META.contactEmail, 'raymond@ainvtry.com');
    assert.ok(SITE_META.contactEmail.endsWith(`@${SITE_META.domain}`));
    assert.equal(SITE_META.founderName, 'Raymond Moon');
  });

  it('provides complete bilingual EN/KO copy with four architecture pillars and stack cards', () => {
    for (const lang of ['en', 'ko'] as const) {
      const copy = SITE_COPY[lang];
      assert.ok(copy.hero.titleAccent.length > 0);
      assert.ok(copy.hero.marbleHint.length > 0);
      assert.ok(copy.nav.homeAria.length > 0);
      assert.ok(copy.nav.opacityLabel.length > 0);
      assert.ok(copy.nav.opacityHint.length > 0);
      assert.ok(copy.subtabs.studioPreview.length > 0);
      assert.ok(copy.subtabs.studioAtelier.length > 0);
      assert.ok(copy.subtabs.techIngestion.length > 0);
      assert.ok(copy.subtabs.aboutFounder.length > 0);
      assert.equal(copy.appPreview.screens.length, 4);
      for (const screen of copy.appPreview.screens) {
        assert.ok(screen.imageSrc.startsWith('/assets/previews/app-'));
        assert.ok(screen.imageSrc.endsWith('.webp'));
      }
      assert.equal(copy.stack.cards.length, 4);
      assert.equal(copy.interactive.topologySteps.length, 3);
      assert.ok(copy.legal.privacySections.length >= 4);
      assert.ok(copy.legal.termsSections.length >= 4);
      const serialized = JSON.stringify(copy);
      assert.ok(!serialized.includes('Capacitor 6'), 'Must reference Capacitor 8, not outdated Capacitor 6');
      assert.ok(!serialized.includes('concierge@'), 'Must use verified raymond@ainvtry.com contact');
      assert.ok(!serialized.includes('MILANO'), 'Must not contain fabricated international office claims');
    }
  });
});
