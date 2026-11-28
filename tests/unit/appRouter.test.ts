import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildAppLoginPath,
  buildExternalBrowserUrl,
  buildGoogleOAuthStartUrl,
  detectAppBasePath,
  detectInAppBrowser,
  formatOAuthErrorMessage,
  isMountedUnderAppRoute,
  parseOAuthCallbackParams,
  stripAppBasePath,
  toAppPath,
} from '../../src/utils/appRouter.ts';
import { getPathForTab, resolveInitialTabFromPath } from '../../src/utils/logoTransition.ts';

describe('appRouter & base-path routing (/app, /, /Ainventory)', () => {
  it('detects base paths accurately for /app, /Ainventory, and root mounts', () => {
    assert.equal(detectAppBasePath('/app'), '/app');
    assert.equal(detectAppBasePath('/app/'), '/app');
    assert.equal(detectAppBasePath('/app/closet'), '/app');
    assert.equal(detectAppBasePath('/app/item/42'), '/app');
    assert.equal(isMountedUnderAppRoute('/app/login'), true);
    assert.equal(detectAppBasePath('/app.html'), '');
    assert.equal(isMountedUnderAppRoute('/app.html'), false);
    assert.equal(detectAppBasePath('/Ainventory/closet'), '/Ainventory');
    assert.equal(detectAppBasePath('/closet'), '');
    assert.equal(detectAppBasePath('/'), '');
  });

  it('strips and prefixes sub-paths without double slashes or trailing slash leaks', () => {
    assert.equal(stripAppBasePath('/app'), '/');
    assert.equal(stripAppBasePath('/app/'), '/');
    assert.equal(stripAppBasePath('/app/closet'), '/closet');
    assert.equal(stripAppBasePath('/app/login'), '/login');
    assert.equal(stripAppBasePath('/app/item/99'), '/item/99');

    assert.equal(toAppPath('/', '/app'), '/app');
    assert.equal(toAppPath('/closet', '/app'), '/app/closet');
    assert.equal(toAppPath('/item/99', '/app'), '/app/item/99');
    assert.equal(toAppPath('/', ''), '/');
    assert.equal(toAppPath('/closet', ''), '/closet');
    assert.equal(toAppPath('/', '/Ainventory'), '/Ainventory/');
    assert.equal(toAppPath('/closet', '/Ainventory'), '/Ainventory/closet');
  });

  it('resolves login path and tab mapping for both /app and root mounts', () => {
    assert.equal(buildAppLoginPath('/app'), '/app/login');
    assert.equal(buildAppLoginPath(''), '/?auth=1');
    assert.equal(resolveInitialTabFromPath('/app'), 'outfits');
    assert.equal(resolveInitialTabFromPath('/app/closet'), 'closet');
    assert.equal(resolveInitialTabFromPath('/app/calendar'), 'calendar');
    assert.equal(resolveInitialTabFromPath('/app/stats'), 'stats');
    assert.equal(resolveInitialTabFromPath('/app/admin'), 'admin');
    assert.equal(resolveInitialTabFromPath('/app/item/7'), 'closet');
    assert.equal(getPathForTab('closet', '/app'), '/app/closet');
    assert.equal(getPathForTab('outfits', '/app'), '/app');
    assert.equal(getPathForTab('closet'), '/closet');
  });

  it('parses OAuth callback parameters and builds same-origin start URLs', () => {
    assert.equal(
      buildGoogleOAuthStartUrl({ returnTo: '/app/closet' }),
      '/api/auth/google/start?returnTo=%2Fapp%2Fcloset'
    );
    assert.equal(
      buildGoogleOAuthStartUrl({ returnTo: '/app', mode: 'link' }),
      '/api/auth/google/start?returnTo=%2Fapp&mode=link'
    );
    assert.deepEqual(parseOAuthCallbackParams('?auth_result=google_new'), {
      authResult: 'google_new',
      authError: null,
    });
    assert.deepEqual(parseOAuthCallbackParams('?auth_error=account_email_conflict'), {
      authResult: null,
      authError: 'account_email_conflict',
    });
    assert.match(formatOAuthErrorMessage('account_email_conflict', 'ko'), /이미 다른 방식으로/);
    assert.match(formatOAuthErrorMessage('access_denied', 'en'), /cancelled/i);
  });

  it('detects social in-app browsers and builds safe external browser links without flagging Chrome/Safari', () => {
    const chromeUa =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
    const safariUa =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
    const kakaoIosUa =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 KAKAOTALK 11.2.0';
    const instaAndroidUa =
      'Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 Instagram 345.0.0.34.96';
    const instaIosUa =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Instagram 345.0.0';

    assert.equal(detectInAppBrowser(chromeUa).isInApp, false);
    assert.equal(detectInAppBrowser(safariUa).isInApp, false);
    assert.equal(buildExternalBrowserUrl('https://ainvtry.com/app/login', chromeUa), null);

    const kakao = detectInAppBrowser(kakaoIosUa);
    assert.equal(kakao.isInApp, true);
    assert.equal(kakao.appName, 'KakaoTalk');
    assert.equal(
      buildExternalBrowserUrl('https://ainvtry.com/app/login', kakaoIosUa),
      'kakaotalk://web/openExternal?url=https%3A%2F%2Fainvtry.com%2Fapp%2Flogin'
    );

    const instaAndroid = detectInAppBrowser(instaAndroidUa);
    assert.equal(instaAndroid.isInApp, true);
    assert.equal(instaAndroid.appName, 'Instagram');
    assert.equal(
      buildExternalBrowserUrl('https://ainvtry.com/app/login', instaAndroidUa),
      'intent://ainvtry.com/app/login#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fainvtry.com%2Fapp%2Flogin;end'
    );

    assert.equal(detectInAppBrowser(instaIosUa).isInApp, true);
    assert.equal(buildExternalBrowserUrl('https://ainvtry.com/app/login', instaIosUa), null);
    assert.equal(buildExternalBrowserUrl('javascript:alert(1)', kakaoIosUa), null);
  });
});
