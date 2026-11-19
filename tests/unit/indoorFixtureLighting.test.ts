import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_BACKGROUNDS } from '../../src/utils/stageBackgroundCatalog.ts';
import { computeCoverPhotoFrame } from '../../src/utils/stageFramingEngine.ts';
import { resolveStageLightingFrame } from '../../src/utils/stageLightingEngine.ts';

// Local-frame 22:30 post-sunset night (matches user's 22:30 KST screenshot in any container timezone)
const NIGHT_LOCAL_MS = new Date(2026, 10, 19, 22, 30, 0).getTime();
// Local-frame 13:00 summer midday
const NOON_LOCAL_MS = new Date(2026, 5, 21, 13, 0, 0).getTime();

test('computeCoverPhotoFrame matches CSS object-fit: cover; object-position: center bottom on mobile and desktop', () => {
  // Mobile portrait stage (narrower than 3:4): fits height, centers horizontally
  const mobile = computeCoverPhotoFrame(358, 560, 0.75);
  assert.equal(mobile.height, 560);
  assert.equal(mobile.width, 420);
  assert.equal(mobile.top, 0);
  assert.equal(mobile.left, -31);

  // Desktop stage (wider than 3:4): fits width, anchors bottom edge
  const desktop = computeCoverPhotoFrame(720, 820, 0.75);
  assert.equal(desktop.width, 720);
  assert.equal(desktop.height, 960);
  assert.equal(desktop.left, 0);
  assert.equal(desktop.top, -140);

  // Zero-size safety
  const zero = computeCoverPhotoFrame(0, 0);
  assert.deepEqual(zero, { width: 0, height: 0, left: 0, top: 0 });
});

test('all 10 indoor backgrounds and 2 outdoor cyberpunk neon stages define valid physical fixtureEmitters within 0..100% photo coordinates', () => {
  const indoorBgs = STAGE_BACKGROUNDS.filter((bg) => !bg.isOutdoor);
  assert.equal(indoorBgs.length, 10);

  const neonBgs = STAGE_BACKGROUNDS.filter((bg) => bg.lightingRig?.isNeonScene);
  assert.equal(neonBgs.length, 4);

  const litStageBgs = STAGE_BACKGROUNDS.filter(
    (bg) => !bg.isOutdoor || Boolean(bg.lightingRig?.isNeonScene)
  );
  assert.equal(litStageBgs.length, 12);

  for (const bg of litStageBgs) {
    assert.ok(bg.lightingRig, `${bg.id} must have lightingRig`);
    const emitters = bg.lightingRig?.fixtureEmitters;
    assert.ok(Array.isArray(emitters) && emitters.length > 0, `${bg.id} must define fixtureEmitters`);

    for (const em of emitters) {
      assert.ok(em.xPct >= 0 && em.xPct <= 100, `${bg.id}/${em.id} xPct out of range`);
      assert.ok(em.yPct >= 0 && em.yPct <= 100, `${bg.id}/${em.id} yPct out of range`);
      if (em.kind === 'cove-strip' || em.kind === 'bar-sconce' || em.kind === 'neon-tube') {
        assert.equal(typeof em.x2Pct, 'number', `${bg.id}/${em.id} ${em.kind} requires x2Pct`);
        assert.equal(typeof em.y2Pct, 'number', `${bg.id}/${em.id} ${em.kind} requires y2Pct`);
        assert.ok((em.x2Pct as number) >= 0 && (em.x2Pct as number) <= 100);
        assert.ok((em.y2Pct as number) >= 0 && (em.y2Pct as number) <= 100);
      }
      assert.ok(em.radiusPct > 0 && em.intensity > 0);
    }
  }
});

test('all 4 cyberpunk stages (S+, S, A+, A) illuminate diverse multi-color neon signs and dim cleanly from 100% to 0%', () => {
  const cyberSpecs = [
    { id: 's_cyber_megacity_plaza', tier: 'S+', isOutdoor: true },
    { id: 's_cyber_neon_atelier', tier: 'S', isOutdoor: false },
    { id: 'a_cyber_neon_alley', tier: 'A+', isOutdoor: true },
    { id: 'a_cyber_arcade_lounge', tier: 'A', isOutdoor: false },
  ] as const;

  for (const spec of cyberSpecs) {
    const bg = STAGE_BACKGROUNDS.find((b) => b.id === spec.id);
    assert.ok(bg, `Missing cyberpunk stage ${spec.id}`);
    assert.equal(bg?.tier, spec.tier);
    assert.equal(bg?.isOutdoor, spec.isOutdoor);
    assert.equal(bg?.lightingRig?.isNeonScene, true);

    const distinctNeonColors = new Set(
      (bg?.lightingRig?.fixtureEmitters || [])
        .map((e) => e.kelvinHex)
        .filter((h): h is number => typeof h === 'number')
    );
    assert.ok(
      distinctNeonColors.size >= 3,
      `${spec.id} should feature at least 3 distinct neon colors, found ${distinctNeonColors.size}`
    );

    const f100 = resolveStageLightingFrame({
      backgroundId: spec.id,
      isOutdoor: spec.isOutdoor,
      timestampMs: NIGHT_LOCAL_MS,
      theme: 'dark',
      lightingPreset: 'auto',
      lightingIntensity: 100,
    });
    const f50 = resolveStageLightingFrame({
      backgroundId: spec.id,
      isOutdoor: spec.isOutdoor,
      timestampMs: NIGHT_LOCAL_MS,
      theme: 'dark',
      lightingPreset: 'auto',
      lightingIntensity: 50,
    });
    const f0 = resolveStageLightingFrame({
      backgroundId: spec.id,
      isOutdoor: spec.isOutdoor,
      timestampMs: NIGHT_LOCAL_MS,
      theme: 'dark',
      lightingPreset: 'auto',
      lightingIntensity: 0,
    });

    assert.equal(f100.isNeonScene, true);
    assert.ok(f100.fixtureOnFactor >= 1.0, `${spec.id} 100% neon should be brightly lit`);
    assert.ok(f100.floorPoolStrength >= 0.3, `${spec.id} 100% neon should illuminate floor pool`);
    assert.ok(f50.fixtureOnFactor > 0 && f50.fixtureOnFactor < f100.fixtureOnFactor);
    assert.equal(f0.fixtureOnFactor, 0);
    assert.equal(f0.floorPoolStrength, 0);
    assert.ok(f0.backdropBrightness < f50.backdropBrightness && f50.backdropBrightness < f100.backdropBrightness);
    assert.ok(f0.backdropSaturate < f100.backdropSaturate);
  }
});

test('post-sunset wall-sconce loft turns lamps ON and casts strong directional + secondary fill shadows', () => {
  const frame = resolveStageLightingFrame({
    backgroundId: 'b_minimal_loft_window',
    isOutdoor: false,
    timestampMs: NIGHT_LOCAL_MS,
    theme: 'dark',
    lightingPreset: 'auto',
    lightingIntensity: 100,
    weather: { latitude: 37.5665, longitude: 126.978 },
  });

  assert.equal(frame.opticalRegime, 'indoor_night_fixture');
  assert.ok(frame.fixtureOnFactor >= 0.9, `expected lit sconces, got ${frame.fixtureOnFactor}`);
  assert.ok(frame.directRatio >= 0.78, `night indoor directRatio must stay crisp, got ${frame.directRatio}`);
  // Left wall sconce sits on negative X, casting primary shadow to positive X (right)
  assert.ok(frame.keyPosX < -1.8, `expected left wall sconce keyPosX < -1.8, got ${frame.keyPosX}`);
  // Opposing right wall sconce casts softer secondary fill shadow to the left
  assert.ok(frame.secondaryShadowWeight >= 0.25, `expected secondary fill shadow, got ${frame.secondaryShadowWeight}`);
  assert.ok(frame.secondaryShadowDirX < -0.5);
  assert.ok(frame.floorPoolStrength > 0.15);
});

test('post-sunset dark basalt flagship casts crisp pin-spot shadow over warm floor spotlight pool', () => {
  const frame = resolveStageLightingFrame({
    backgroundId: 'a_hannam_flagship',
    isOutdoor: false,
    timestampMs: NIGHT_LOCAL_MS,
    theme: 'dark',
    lightingPreset: 'auto',
    lightingIntensity: 100,
    weather: { latitude: 37.5665, longitude: 126.978 },
  });

  assert.ok(frame.fixtureOnFactor >= 0.9);
  assert.ok(frame.directRatio >= 0.84, `pin-spot directRatio should be crisp, got ${frame.directRatio}`);
  assert.ok(frame.floorPoolStrength >= 0.3, `dark basalt floor needs warm pool, got ${frame.floorPoolStrength}`);
});

test('lightingIntensity 0% cleanly turns indoor lamps and floor pools OFF, and natural outdoor stages keep fixtures at 0', () => {
  const offFrame = resolveStageLightingFrame({
    backgroundId: 'b_minimal_loft_window',
    isOutdoor: false,
    timestampMs: NIGHT_LOCAL_MS,
    theme: 'dark',
    lightingPreset: 'auto',
    lightingIntensity: 0,
    weather: { latitude: 37.5665, longitude: 126.978 },
  });

  assert.equal(offFrame.fixtureOnFactor, 0);
  assert.equal(offFrame.floorPoolStrength, 0);
  assert.equal(offFrame.secondaryShadowWeight, 0);

  const outdoorFrame = resolveStageLightingFrame({
    backgroundId: 'a_sunset_rooftop',
    isOutdoor: true,
    timestampMs: NIGHT_LOCAL_MS,
    theme: 'dark',
    lightingPreset: 'auto',
    lightingIntensity: 100,
    weather: { latitude: 37.5665, longitude: 126.978 },
  });

  assert.equal(outdoorFrame.fixtureOnFactor, 0);
  assert.equal(outdoorFrame.floorPoolStrength, 0);

  // Daytime windowless dressing room keeps warm indirect coves illuminated
  const dressingDay = resolveStageLightingFrame({
    backgroundId: 'c_oak_dressing_room',
    isOutdoor: false,
    timestampMs: NOON_LOCAL_MS,
    theme: 'light',
    lightingPreset: 'auto',
    lightingIntensity: 100,
    weather: { latitude: 37.5665, longitude: 126.978 },
  });
  assert.ok(dressingDay.fixtureOnFactor >= 0.7, `windowless room lamps should stay lit in daytime`);
  assert.ok(dressingDay.directRatio >= 0.5);
});

test('dimming lightingIntensity across 0%..100% keeps wall sconces, wall wash, floor pool, and shadows clearly lit with preserved wall contrast', () => {
  const levels = [0, 25, 50, 75, 100];
  const frames = levels.map((lightingIntensity) =>
    resolveStageLightingFrame({
      backgroundId: 'b_minimal_loft_window',
      isOutdoor: false,
      timestampMs: NIGHT_LOCAL_MS,
      theme: 'light',
      lightingPreset: 'auto',
      lightingIntensity,
      weather: { latitude: 37.5665, longitude: 126.978 },
    })
  );

  const [f0, f25, f50, f75, f100] = frames;

  // 0% strictly OFF
  assert.equal(f0.fixtureOnFactor, 0);
  assert.equal(f0.floorPoolStrength, 0);
  assert.equal(f0.nightFixtureGlowCss, 'none');

  // 50% stays genuinely lit (does NOT extinguish sconce glow, beam, haze, floor pool, or cast shadow)
  assert.ok(f50.fixtureOnFactor >= 0.8, `50% fixtureOnFactor should stay >= 0.8, got ${f50.fixtureOnFactor}`);
  assert.ok(f50.floorPoolStrength >= 0.16, `50% floorPoolStrength should stay >= 0.16, got ${f50.floorPoolStrength}`);
  assert.notEqual(f50.nightFixtureGlowCss, 'none');
  assert.equal(f50.beamVisible, true);
  assert.equal(f50.hazeVisible, true);
  assert.ok(f50.shadowOpacityScale >= 0.78, `50% shadowOpacityScale should stay >= 0.78, got ${f50.shadowOpacityScale}`);

  // Strictly monotonic perceptual progression 0% < 25% < 50% < 75% < 100%
  for (let i = 1; i < frames.length; i += 1) {
    assert.ok(
      frames[i].fixtureOnFactor > frames[i - 1].fixtureOnFactor,
      `fixtureOnFactor must increase from ${levels[i - 1]}% to ${levels[i]}%`
    );
    assert.ok(
      frames[i].floorPoolStrength > frames[i - 1].floorPoolStrength,
      `floorPoolStrength must increase from ${levels[i - 1]}% to ${levels[i]}%`
    );
    assert.ok(
      frames[i].keyIntensity > frames[i - 1].keyIntensity,
      `keyIntensity must increase from ${levels[i - 1]}% to ${levels[i]}%`
    );
  }

  // 100% delivers full incandescent brilliance while keeping room wall luminance restrained for crisp shade contrast
  assert.ok(f25.fixtureOnFactor > 0.6, `25% fixtureOnFactor should stay > 0.6, got ${f25.fixtureOnFactor}`);
  assert.ok(f75.fixtureOnFactor > f50.fixtureOnFactor);
  assert.ok(f100.fixtureOnFactor >= 1.05, `100% fixtureOnFactor should be >= 1.05, got ${f100.fixtureOnFactor}`);
  assert.ok(
    f100.backdropBrightness <= 0.94,
    `100% night light-mode loft wall brightness (${f100.backdropBrightness}) must preserve contrast headroom for lit sconces`
  );
});

