import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeOnboardingSummary,
  getDefaultBodyStatsForDemographic,
  normalizeOnboardingAgeGroup,
  selectStarterCapsule6,
} from '../../src/shared/onboardingStarterCapsule.js';
import {
  resolveInitialOnboardingStep,
  resolveOnboardingPresentation,
} from '../../src/services/onboardingService.ts';

describe('Onboarding 2.0 shared demographics, starter capsule, and presentation state', () => {
  it('computes demographic default body stats across gender and age groups', () => {
    const male30s = getDefaultBodyStatsForDemographic('male', '30s');
    const female20s = getDefaultBodyStatsForDemographic('female', '20s');
    assert.equal(male30s.heightCm, 174);
    assert.equal(male30s.weightKg, 75);
    assert.equal(female20s.heightCm, 162);
    assert.equal(female20s.weightKg, 54);
    assert.equal(normalizeOnboardingAgeGroup(null, 27), '20s');
    assert.equal(normalizeOnboardingAgeGroup(null, 65), '60s');
  });

  it('curates 6 balanced starter capsule garments (1 outer, 2 top, 2 bottom, 1 shoes) with studio webp assets', () => {
    for (const gender of ['male', 'female'] as const) {
      for (const personalColor of ['spring_warm', 'summer_cool', 'autumn_warm', 'winter_cool']) {
        const items = selectStarterCapsule6({ personalColor, gender, ageGroup: '30s' });
        assert.equal(items.length, 6);
        const counts = items.reduce<Record<string, number>>((acc, item) => {
          acc[item.category] = (acc[item.category] || 0) + 1;
          return acc;
        }, {});
        assert.equal(counts.outer, 1);
        assert.equal(counts.top, 2);
        assert.equal(counts.bottom, 2);
        assert.equal(counts.shoes, 1);
        for (const item of items) {
          assert.ok(String(item.image_url).endsWith('.webp'));
          if (gender === 'male') {
            assert.ok(!String(item.subcategory).includes('skirt'));
            assert.ok(!String(item.name).includes('스커트'));
          }
        }
      }
    }
  });

  it('resolves wizard vs slim banner vs none presentation states accurately', () => {
    const newGoogleUser = {
      id: 10,
      username: 'google_newuser',
      displayName: 'New User',
      role: 'member' as const,
      defaultCloset: 'closet_google_newuser',
      profileCompleted: false,
      garmentCount: 0,
      onboarding: computeOnboardingSummary({
        onboarding_status: 'not_started',
        onboarding_step: 'identity_body',
        onboarding_steps_json: '{}',
      }),
    };
    assert.equal(resolveOnboardingPresentation(newGoogleUser, 0, 'google_new'), 'wizard');
    assert.equal(resolveInitialOnboardingStep(newGoogleUser, 0), 'identity_body');

    // Legacy pre-v2 user who saved skin tone once (profileCompleted=true) yet still has 0 garments
    const legacyZeroItemUser = {
      ...newGoogleUser,
      profileCompleted: true,
      personalColor: 'autumn_warm',
      skinToneHex: '#DFBA9B',
      onboarding: computeOnboardingSummary({
        onboarding_status: 'not_started',
        onboarding_step: 'identity_body',
        onboarding_steps_json: '{}',
        personal_color: 'autumn_warm',
        skin_tone_hex: '#DFBA9B',
      }),
    };
    assert.equal(resolveOnboardingPresentation(legacyZeroItemUser, 0, null), 'banner');
    assert.equal(legacyZeroItemUser.onboarding.completedCount, 1);

    // Deferred user gets slim resume banner
    const deferredUser = {
      ...newGoogleUser,
      onboarding: computeOnboardingSummary({
        onboarding_status: 'deferred',
        onboarding_step: 'closet_seed',
        onboarding_steps_json: JSON.stringify({ identity_body: true, skin_face: 'photo' }),
      }),
    };
    assert.equal(resolveOnboardingPresentation(deferredUser, 0, null), 'banner');
    assert.equal(resolveInitialOnboardingStep(deferredUser, 0), 'closet_seed');

    // Completed user gets neither wizard nor banner
    const completedUser = {
      ...newGoogleUser,
      profileCompleted: true,
      onboarding: computeOnboardingSummary({
        onboarding_status: 'completed',
        onboarding_step: 'first_tryon',
      }),
    };
    assert.equal(resolveOnboardingPresentation(completedUser, 6, null), 'none');

    // Demo accounts never trigger onboarding
    assert.equal(
      resolveOnboardingPresentation({ ...newGoogleUser, isSampleDemo: true }, 0, null),
      'none'
    );
  });
});
