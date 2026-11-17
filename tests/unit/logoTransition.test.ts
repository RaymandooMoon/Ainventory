import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_LOGO_FLIGHT_AGE_MS,
  capturePendingLogoFlight,
  clearPendingLogoFlight,
  computeLogoFlipTransform,
  consumePendingLogoFlight,
  getPathForTab,
  resolveInitialTabFromPath,
} from '../../src/utils/logoTransition.ts';

test('resolveInitialTabFromPath makes Outfits the default landing screen', () => {
  assert.equal(resolveInitialTabFromPath('/'), 'outfits');
  assert.equal(resolveInitialTabFromPath(''), 'outfits');
  assert.equal(resolveInitialTabFromPath('/outfits'), 'outfits');
  assert.equal(resolveInitialTabFromPath('/outfits/today'), 'outfits');
  assert.equal(resolveInitialTabFromPath('/closet'), 'closet');
  assert.equal(resolveInitialTabFromPath('/item/18'), 'closet');
  assert.equal(resolveInitialTabFromPath('/calendar'), 'calendar');
  assert.equal(resolveInitialTabFromPath('/stats'), 'stats');
  assert.equal(resolveInitialTabFromPath('/unknown-route'), 'outfits');
});

test('getPathForTab maps canonical tab URLs symmetrically', () => {
  assert.equal(getPathForTab('outfits'), '/');
  assert.equal(getPathForTab('closet'), '/closet');
  assert.equal(getPathForTab('calendar'), '/calendar');
  assert.equal(getPathForTab('stats'), '/stats');
});

test('capturePendingLogoFlight & consumePendingLogoFlight handle one-shot capture and TTL', () => {
  clearPendingLogoFlight();
  assert.equal(consumePendingLogoFlight(1000), null);

  assert.equal(
    capturePendingLogoFlight({ getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) }, 1000),
    null
  );

  const captured = capturePendingLogoFlight(
    { getBoundingClientRect: () => ({ left: 80, top: 220, width: 240, height: 84 }) },
    1000
  );
  assert.ok(captured);

  // Within TTL: returns rect and clears immediately
  const consumed = consumePendingLogoFlight(1500);
  assert.deepEqual(consumed, { left: 80, top: 220, width: 240, height: 84 });
  assert.equal(consumePendingLogoFlight(1600), null);

  // Expired beyond TTL: returns null
  capturePendingLogoFlight(
    { getBoundingClientRect: () => ({ left: 80, top: 220, width: 240, height: 84 }) },
    2000
  );
  assert.equal(consumePendingLogoFlight(2000 + MAX_LOGO_FLIGHT_AGE_MS + 1), null);
});

test('computeLogoFlipTransform calculates exact center deltas and scale ratios', () => {
  const flip = computeLogoFlipTransform(
    { left: 80, top: 220, width: 200, height: 70 },
    { left: 16, top: 18, width: 100, height: 35 }
  );
  assert.ok(flip);
  // Source center: (180, 255); Target center: (66, 35.5) -> dx = 114, dy = 219.5
  assert.equal(flip.translateX, 114);
  assert.equal(flip.translateY, 219.5);
  assert.equal(flip.scaleX, 2);
  assert.equal(flip.scaleY, 2);
  assert.match(flip.transformCss, /^translate3d\(114px, 219\.5px, 0\) scale\(2, 2\)$/);

  assert.equal(computeLogoFlipTransform(null, { left: 0, top: 0, width: 100, height: 35 }), null);
  assert.equal(
    computeLogoFlipTransform(
      { left: 0, top: 0, width: 100, height: 35 },
      { left: 0, top: 0, width: 0, height: 35 }
    ),
    null
  );
});
