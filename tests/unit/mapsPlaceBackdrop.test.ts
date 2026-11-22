import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isValidPlacePhotoName,
  isValidStreetViewPanoId,
  sanitizeMapsExternalUrl,
  clampStreetViewHeading,
  clampBackdropImageSize,
  normalizePlacePhotosList,
  normalizeStreetViewMetadata,
  isOfficialGroundStreetViewMetadata,
} from '../../server/mapsBackdropService.js';
import {
  clampPlaceBackdropBlurPx,
  resolveBlurPresetKey,
  sanitizePlaceBackdropPref,
  resolveActivePlaceBackdropVisual,
} from '../../src/services/placeBackdropStore.ts';
import {
  classifyStreetViewPano,
  filterPlacesByEyeLevelStreetView,
} from '../../src/services/streetViewProbeService.ts';
import {
  STREET_VIEW_LIVE_ZOOM,
  STREET_VIEW_PORTRAIT_FOV,
  STREET_VIEW_PORTRAIT_PITCH,
  computePlaceBackdropOptics,
} from '../../src/utils/placeBackdropOptics.ts';

test('mapsBackdropService validators block SSRF / injection payloads and accept valid Google Maps IDs', () => {
  assert.equal(
    isValidPlacePhotoName('places/ChIJ2fzCmcW7j4AR2JzfXBBoh6E/photos/AUacShh3_Dd8yvV2JZMtNjjbb'),
    true
  );
  assert.equal(isValidPlacePhotoName('places/../etc/passwd/photos/abc123456'), false);
  assert.equal(isValidPlacePhotoName('https://evil.com/photo.jpg'), false);
  assert.equal(isValidPlacePhotoName('places/short/photos/short'), false);

  assert.equal(isValidStreetViewPanoId('rZ9KeTyhA11i0VppYNzsSg'), true);
  assert.equal(isValidStreetViewPanoId('../../../etc/passwd'), false);
  assert.equal(isValidStreetViewPanoId('pano&key=leak'), false);

  assert.equal(clampStreetViewHeading(450), 90);
  assert.equal(clampStreetViewHeading(-90), 270);
  assert.deepEqual(clampBackdropImageSize(9999, 100, 640, 640), { width: 640, height: 320 });
});

test('sanitizeMapsExternalUrl normalizes protocol-relative URLs and blocks unsafe schemes', () => {
  assert.equal(
    sanitizeMapsExternalUrl('//maps.google.com/maps/contrib/101563'),
    'https://maps.google.com/maps/contrib/101563'
  );
  assert.equal(
    sanitizeMapsExternalUrl('https://www.google.com/maps'),
    'https://www.google.com/maps'
  );
  assert.equal(sanitizeMapsExternalUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeMapsExternalUrl('data:text/html,xss'), null);
  assert.equal(sanitizeMapsExternalUrl(''), null);
});

test('normalizePlacePhotosList and normalizeStreetViewMetadata parse live Google payloads cleanly', () => {
  const photos = normalizePlacePhotosList([
    {
      name: 'places/ChIJ2fzCmcW7j4AR2JzfXBBoh6E/photos/AUacShh3_Dd8yvV2JZMtNjjbb',
      widthPx: 4000,
      heightPx: 3000,
      authorAttributions: [
        { displayName: 'Minjun Kim', uri: '//maps.google.com/maps/contrib/12345' },
        { displayName: 'Bad Actor', uri: 'javascript:alert(1)' },
      ],
    },
    {
      name: 'https://evil.example/ssrf',
      widthPx: 800,
      heightPx: 600,
    },
  ]);

  assert.equal(photos.length, 1);
  assert.equal(photos[0].authorAttributions.length, 2);
  assert.equal(photos[0].authorAttributions[0].uri, 'https://maps.google.com/maps/contrib/12345');
  assert.equal(photos[0].authorAttributions[1].uri, null);

  const okSv = normalizeStreetViewMetadata({
    status: 'OK',
    pano_id: 'rZ9KeTyhA11i0VppYNzsSg',
    copyright: '© 2026 Google',
    date: '2026-03',
  });
  assert.equal(okSv.available, true);
  assert.equal(okSv.panoId, 'rZ9KeTyhA11i0VppYNzsSg');
  assert.match(String(okSv.reportProblemLink), /^https:\/\/cbks0\.googleapis\.com\/cbk\?output=report&panoid=rZ9KeTyhA11i0VppYNzsSg/);

  const missingSv = normalizeStreetViewMetadata({ status: 'ZERO_RESULTS' });
  assert.equal(missingSv.available, false);
  assert.equal(missingSv.panoId, null);
});

test('placeBackdropStore handles 3-step blur presets, fine slider clamping, and source fallback', () => {
  assert.equal(clampPlaceBackdropBlurPx(-5), 0);
  assert.equal(clampPlaceBackdropBlurPx(99), 24);
  assert.equal(resolveBlurPresetKey(0), 'sharp');
  assert.equal(resolveBlurPresetKey(8), 'soft');
  assert.equal(resolveBlurPresetKey(16), 'strong');
  assert.equal(resolveBlurPresetKey(11), 'custom');

  const sanitized = sanitizePlaceBackdropPref({
    enabled: true,
    sourceMode: 'street_view',
    blurPx: 14,
    selectedPhotoIndex: 2,
    streetViewHeading: -90,
  });
  assert.equal(sanitized.blurPx, 14);
  assert.equal(sanitized.streetViewHeading, 270);

  const baseData = {
    placeId: 'ChIJ2fzCmcW7j4AR2JzfXBBoh6E',
    placeName: '성수 카페',
    lat: 37.5445,
    lng: 127.056,
    photos: [
      {
        photoName: 'places/ChIJ2fzCmcW7j4AR2JzfXBBoh6E/photos/AUacShh3_Dd8yvV2JZMtNjjbb',
        widthPx: 1200,
        heightPx: 900,
        authorAttributions: [{ displayName: 'Photographer A', uri: 'https://maps.google.com/a' }],
      },
    ],
    streetView: {
      available: false,
      panoId: null,
      copyright: null,
      date: null,
      reportProblemLink: null,
    },
    loading: false,
    error: null,
    quotaExceeded: false,
  };

  // Street View requested with coords but no server Static pano -> switches to live Maps JS Street View
  const liveSv = resolveActivePlaceBackdropVisual({
    pref: { enabled: true, sourceMode: 'street_view', blurPx: 8, selectedPhotoIndex: 0, streetViewHeading: 90 },
    data: baseData,
    buildPhotoUrl: (n) => `/api/maps/place-photo?name=${encodeURIComponent(n)}`,
    buildStreetViewUrl: (p, h) => `/api/maps/streetview?panoId=${p}&heading=${h}`,
  });
  assert.equal(liveSv.active, true);
  assert.equal(liveSv.sourceMode, 'street_view');
  assert.equal(liveSv.liveMapMode, 'street_view');

  // Place Photo requested when photos exist -> returns Place Photo with attribution
  const photoActive = resolveActivePlaceBackdropVisual({
    pref: { enabled: true, sourceMode: 'place_photo', blurPx: 8, selectedPhotoIndex: 0, streetViewHeading: 0 },
    data: baseData,
    buildPhotoUrl: (n) => `/api/maps/place-photo?name=${encodeURIComponent(n)}`,
    buildStreetViewUrl: (p, h) => `/api/maps/streetview?panoId=${p}&heading=${h}`,
  });
  assert.equal(photoActive.active, true);
  assert.equal(photoActive.sourceMode, 'place_photo');
  assert.equal(photoActive.attributions[0].displayName, 'Photographer A');

  // No Place Photos returned (e.g. demo key) -> falls back to eye-level outdoor Street View, or inactive if unavailable
  const svFallback = resolveActivePlaceBackdropVisual({
    pref: { enabled: true, sourceMode: 'place_photo', blurPx: 8, selectedPhotoIndex: 0, streetViewHeading: 0 },
    data: { ...baseData, photos: [] },
    buildPhotoUrl: (n) => `/api/maps/place-photo?name=${encodeURIComponent(n)}`,
    buildStreetViewUrl: (p, h) => `/api/maps/streetview?panoId=${p}&heading=${h}`,
  });
  assert.equal(svFallback.active, true);
  assert.equal(svFallback.sourceMode, 'street_view');
  assert.equal(svFallback.liveMapMode, 'street_view');

  const studioFallback = resolveActivePlaceBackdropVisual({
    pref: { enabled: true, sourceMode: 'place_photo', blurPx: 8, selectedPhotoIndex: 0, streetViewHeading: 0 },
    data: { ...baseData, photos: [] },
    liveStreetViewUnavailable: true,
    buildPhotoUrl: (n) => `/api/maps/place-photo?name=${encodeURIComponent(n)}`,
    buildStreetViewUrl: (p, h) => `/api/maps/streetview?panoId=${p}&heading=${h}`,
  });
  assert.equal(studioFallback.active, false);

  // Street View Static available -> switches cleanly to proxied Street View with heading and copyright
  const svActive = resolveActivePlaceBackdropVisual({
    pref: { enabled: true, sourceMode: 'street_view', blurPx: 12, selectedPhotoIndex: 0, streetViewHeading: 180 },
    data: {
      ...baseData,
      streetView: {
        available: true,
        panoId: 'rZ9KeTyhA11i0VppYNzsSg',
        copyright: '© 2026 Google',
        date: '2026-02',
        reportProblemLink: 'https://cbks0.googleapis.com/cbk?output=report&panoid=rZ9KeTyhA11i0VppYNzsSg',
      },
    },
    buildPhotoUrl: (n) => `/api/maps/place-photo?name=${encodeURIComponent(n)}`,
    buildStreetViewUrl: (p, h) => `/api/maps/streetview?panoId=${p}&heading=${h}`,
  });
  assert.equal(svActive.active, true);
  assert.equal(svActive.sourceMode, 'street_view');
  assert.equal(svActive.imageUrl, '/api/maps/streetview?panoId=rZ9KeTyhA11i0VppYNzsSg&heading=180');
  assert.equal(svActive.streetViewCopyright, '© 2026 Google');

  // Disabled or quotaExceeded -> inactive (keeps default architectural studio backdrop)
  assert.equal(
    resolveActivePlaceBackdropVisual({
      pref: { enabled: false, sourceMode: 'place_photo', blurPx: 8, selectedPhotoIndex: 0, streetViewHeading: 0 },
      data: baseData,
      buildPhotoUrl: (n) => n,
      buildStreetViewUrl: (p) => p,
    }).active,
    false
  );
  assert.equal(
    resolveActivePlaceBackdropVisual({
      pref: { enabled: true, sourceMode: 'place_photo', blurPx: 8, selectedPhotoIndex: 0, streetViewHeading: 0 },
      data: { ...baseData, quotaExceeded: true },
      buildPhotoUrl: (n) => n,
      buildStreetViewUrl: (p) => p,
    }).active,
    false
  );
});

test('filterPlacesByEyeLevelStreetView retains only verified outdoor Street View locations with snapped metadata', async () => {
  const candidates = [
    {
      placeId: 'ChIJ_seongsu_cafe_01',
      fullText: '성수동 카페거리',
      mainText: '성수동 카페거리',
      secondaryText: '서울 성동구',
      formattedAddress: '서울 성동구 성수동',
      lat: 37.5446,
      lng: 127.058,
      primaryType: 'cafe',
      types: ['cafe'],
      googleMapsUri: null,
    },
    {
      placeId: 'ChIJ_ifc_mall_indoor_02',
      fullText: 'IFC몰',
      mainText: 'IFC몰',
      secondaryText: '서울 영등포구',
      formattedAddress: '서울 영등포구 국제금융로 10',
      lat: 37.5252,
      lng: 126.9255,
      primaryType: 'shopping_mall',
      types: ['shopping_mall'],
      googleMapsUri: null,
    },
  ];

  const verified = await filterPlacesByEyeLevelStreetView(candidates, {
    onlySupported: true,
    probeFn: async (lat) =>
      lat > 37.54
        ? {
            available: true,
            panoId: 'rZ9KeTyhA11i0VppYNzsSg',
            snappedLat: 37.5447,
            snappedLng: 127.0581,
            copyright: '© 2026 Google',
            source: 'outdoor',
          }
        : {
            available: false,
            panoId: null,
            snappedLat: null,
            snappedLng: null,
            copyright: null,
            source: 'none',
          },
  });

  assert.equal(verified.totalChecked, 2);
  assert.equal(verified.filteredOutCount, 1);
  assert.equal(verified.places.length, 1);
  assert.equal(verified.places[0].placeId, 'ChIJ_seongsu_cafe_01');
  assert.equal(verified.places[0].streetViewAvailable, true);
  assert.equal(verified.places[0].streetViewPanoId, 'rZ9KeTyhA11i0VppYNzsSg');
  assert.equal(verified.places[0].streetViewLat, 37.5447);
});

test('computePlaceBackdropOptics aligns eye-level horizon by avatar height and scales edge-bleed across 3 blur steps', () => {
  assert.equal(STREET_VIEW_PORTRAIT_FOV, 16);
  assert.equal(STREET_VIEW_PORTRAIT_PITCH, -4);
  assert.ok(STREET_VIEW_LIVE_ZOOM >= 3.4);

  const sharp = computePlaceBackdropOptics({
    heightCm: 172,
    sourceMode: 'street_view',
    blurPx: 0,
  });
  const soft = computePlaceBackdropOptics({
    heightCm: 172,
    sourceMode: 'street_view',
    blurPx: 8,
  });
  const strong = computePlaceBackdropOptics({
    heightCm: 172,
    sourceMode: 'street_view',
    blurPx: 16,
  });

  // 3-step blur increases overscan edge-bleed scale monotonically and splits DoF naturally
  assert.equal(sharp.blurPx, 0);
  assert.equal(sharp.groundFocusBlurPx, 0);
  assert.equal(sharp.liveDofOverlayBlurPx, 0);
  assert.ok(soft.edgeBleedScale > sharp.edgeBleedScale);
  assert.ok(strong.edgeBleedScale > soft.edgeBleedScale);
  assert.ok(strong.groundFocusBlurPx > 0 && strong.groundFocusBlurPx < strong.blurPx);
  assert.ok(strong.liveDofOverlayBlurPx > soft.liveDofOverlayBlurPx);
  assert.equal(sharp.transformOrigin, '50% 34%');

  // Height-coupled eye-level perspective alignment
  const shorter = computePlaceBackdropOptics({
    heightCm: 155,
    sourceMode: 'street_view',
    blurPx: 8,
  });
  const taller = computePlaceBackdropOptics({
    heightCm: 192,
    sourceMode: 'street_view',
    blurPx: 8,
  });
  assert.ok(taller.objectPositionY > shorter.objectPositionY);
  assert.ok(taller.liveTopOffsetPct < shorter.liveTopOffsetPct);
});

test('resolveActivePlaceBackdropVisual fast-paths verified fallbackStreetViewPanoId to Static proxy immediately', () => {
  const loadingData = {
    placeId: null,
    placeName: '',
    lat: null,
    lng: null,
    photos: [],
    streetView: {
      available: false,
      panoId: null,
      copyright: null,
      date: null,
      reportProblemLink: null,
    },
    loading: true,
    error: null,
    quotaExceeded: false,
  };

  const fastPath = resolveActivePlaceBackdropVisual({
    pref: { enabled: true, sourceMode: 'street_view', blurPx: 8, selectedPhotoIndex: 0, streetViewHeading: 90 },
    data: loadingData,
    fallbackLat: 37.5759,
    fallbackLng: 126.9768,
    fallbackPlaceName: '경복궁 광화문',
    fallbackStreetViewPanoId: 'gwanghwamun_verified_pano_01',
    fallbackStreetViewCopyright: '© 2026 Google',
    buildPhotoUrl: (n) => `/api/maps/place-photo?name=${encodeURIComponent(n)}`,
    buildStreetViewUrl: (p, h) => `/api/maps/streetview?panoId=${p}&heading=${h}`,
  });

  assert.equal(fastPath.active, true);
  assert.equal(fastPath.liveMapMode, null);
  assert.equal(
    fastPath.imageUrl,
    '/api/maps/streetview?panoId=gwanghwamun_verified_pano_01&heading=90'
  );
  assert.equal(fastPath.streetViewCopyright, '© 2026 Google');
  assert.match(String(fastPath.streetViewReportUrl), /panoid=gwanghwamun_verified_pano_01/);
});

test('classifyStreetViewPano and isOfficialGroundStreetViewMetadata distinguish ground streets from floating/UGC photospheres', () => {
  // Official Google connected ground-level Street View car/trekker pano
  assert.equal(
    classifyStreetViewPano({
      panoId: 'rZ9KeTyhA11i0VppYNzsSg',
      copyright: '© 2026 Google',
      linksCount: 2,
    }),
    'ground_street'
  );
  assert.equal(
    isOfficialGroundStreetViewMetadata('rZ9KeTyhA11i0VppYNzsSg', '© 2026 Google'),
    true
  );

  // User-uploaded photosphere ID prefixes (drone/rooftop/balcony)
  assert.equal(
    classifyStreetViewPano({
      panoId: 'CAoSLEFGMVFpcE9aY0Z1aHdqbWRpWTVyWUp6',
      copyright: '© 2026 Google',
      linksCount: 2,
    }),
    'user_photosphere'
  );
  assert.equal(
    isOfficialGroundStreetViewMetadata('CAoSLEFGMVFpcE9aY0Z1aHdqbWRpWTVyWUp6', '© 2026 Google'),
    false
  );
  assert.equal(
    classifyStreetViewPano({
      panoId: 'CIHM0ogKEICAgIDg57a3qwE',
      copyright: '© 2026 Google',
      linksCount: 1,
    }),
    'user_photosphere'
  );
  assert.equal(
    isOfficialGroundStreetViewMetadata('CIHM0ogKEICAgIDg57a3qwE', '© 2026 Google'),
    false
  );

  // Third-party copyright author or isolated 0-link photosphere
  assert.equal(
    classifyStreetViewPano({
      panoId: 'rZ9KeTyhA11i0VppYNzsSg',
      copyright: '© SD "SDKM" KIM',
      linksCount: 1,
    }),
    'user_photosphere'
  );
  assert.equal(
    isOfficialGroundStreetViewMetadata('rZ9KeTyhA11i0VppYNzsSg', '© SD "SDKM" KIM'),
    false
  );
  assert.equal(
    classifyStreetViewPano({
      panoId: 'rZ9KeTyhA11i0VppYNzsSg',
      copyright: '© 2026 Google',
      linksCount: 0,
    }),
    'user_photosphere'
  );

  // Empty panoId
  assert.equal(classifyStreetViewPano({ panoId: '', copyright: '© 2026 Google' }), 'none');
  assert.equal(isOfficialGroundStreetViewMetadata('', '© 2026 Google'), false);
});
