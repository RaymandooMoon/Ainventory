import { expect, type Page } from '@playwright/test';

const LIVE_TEST_USERNAME = 'husband';
const LIVE_TEST_PASSWORD = 'husband1234';

const DEFAULT_LIVE_PROFILE = {
  gender: 'male',
  height_cm: 178,
  weight_kg: 73,
  personal_color: 'autumn_warm',
  skin_tone_hex: '#DEC2A7',
  body_shape: 'upper_developed',
  handedness: 'right',
} as const;

let cachedLiveToken = '';

export interface LiveAuthOptions {
  lang?: 'ko' | 'en';
  resetProfile?: boolean;
}

/**
 * Authenticates a Playwright browser context as a real live member (`husband`,
 * `isDemoVtonAccount === false`) with full RBAC permissions (`closet:write`,
 * `vton:synthesize`, `btn:outfits:store`, `btn:calendar:attendance`, etc.)
 * and ensures server profile state (`handedness`, anthropometrics, skin tone)
 * is clean before navigating.
 *
 * Unauthenticated sessions intentionally boot into the read-only Cyberpunk
 * Female Demo Showcase (`isSampleDemo: true`, `s_cyber_megacity_plaza`,
 * pre-rendered `/seed/demo-cyber-female-*.webp`), so tests exercising live
 * member features (Flat-Lay fallback, Gemini VTON synthesis, garment CRUD,
 * Stage Store gacha, Calendar attendance) should call `loginAsLiveMember`.
 */
export async function loginAsLiveMember(
  page: Page,
  options: LiveAuthOptions = {}
): Promise<string> {
  const { lang = 'ko', resetProfile = true } = options;

  let token = cachedLiveToken;
  let userPayload: Record<string, unknown> | null = null;

  if (token) {
    const meRes = await page.request.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (meRes.ok()) {
      const meJson = (await meRes.json()) as { user?: Record<string, unknown> };
      userPayload = meJson?.user || null;
    } else {
      token = '';
      cachedLiveToken = '';
    }
  }

  if (!token) {
    const loginRes = await page.request.post('/api/auth/login', {
      data: { username: LIVE_TEST_USERNAME, password: LIVE_TEST_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();
    const loginJson = (await loginRes.json()) as {
      token?: string;
      user?: Record<string, unknown>;
    };
    token = String(loginJson.token || '');
    expect(token.length).toBeGreaterThan(10);
    cachedLiveToken = token;
    userPayload = loginJson.user || null;
  }

  if (resetProfile) {
    const needsProfileReset =
      !userPayload ||
      userPayload.gender !== DEFAULT_LIVE_PROFILE.gender ||
      Number(userPayload.heightCm) !== DEFAULT_LIVE_PROFILE.height_cm ||
      Number(userPayload.weightKg) !== DEFAULT_LIVE_PROFILE.weight_kg ||
      userPayload.personalColor !== DEFAULT_LIVE_PROFILE.personal_color ||
      userPayload.skinToneHex !== DEFAULT_LIVE_PROFILE.skin_tone_hex ||
      userPayload.bodyShape !== DEFAULT_LIVE_PROFILE.body_shape ||
      (userPayload.handedness || userPayload.dominantHand || 'right') !==
        DEFAULT_LIVE_PROFILE.handedness;

    if (needsProfileReset) {
      await page.request.post('/api/auth/profile', {
        headers: { Authorization: `Bearer ${token}` },
        data: DEFAULT_LIVE_PROFILE,
      });
    }

    const cfgRes = await page.request.get('/api/profile/config', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (cfgRes.ok()) {
      const cfgJson = (await cfgRes.json()) as {
        config?: { handedness?: string; dominantHand?: string };
      };
      const curHand = cfgJson?.config?.handedness || cfgJson?.config?.dominantHand || 'right';
      if (curHand !== DEFAULT_LIVE_PROFILE.handedness) {
        await page.request.put('/api/profile/config', {
          headers: { Authorization: `Bearer ${token}` },
          data: { handedness: DEFAULT_LIVE_PROFILE.handedness },
        });
      }
    }
  }

  await page.addInitScript(
    ({ authToken, initialLang }) => {
      window.localStorage.setItem('ainventory_auth_token', authToken);
      window.localStorage.setItem('ainventory_sample_demo_mode', '0');
      if (!window.localStorage.getItem('ainventory_lang_v1')) {
        window.localStorage.setItem('ainventory_lang_v1', initialLang);
      }
    },
    { authToken: token, initialLang: lang }
  );

  return token;
}
