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
    assert.ok(f100.fixtureOnFactor >= 0.8 && f100.fixtureOnFactor <= 1.0, `${spec.id} 100% neon should stay punchy, got ${f100.fixtureOnFactor}`);
    assert.ok(f100.floorPoolStrength >= 0.25, `${spec.id} 100% neon should illuminate floor pool`);
    assert.ok(f50.fixtureOnFactor > 0.25 && f50.fixtureOnFactor < f100.fixtureOnFactor * 0.65, `${spec.id} 50% neon should visibly dim near midpoint`);
    assert.equal(f0.fixtureOnFactor, 0);
    assert.equal(f0.floorPoolStrength, 0);
    assert.equal(f0.castShadowScale, 0, `${spec.id} unlit 0% night neon must have zero directional cast shadow`);
    assert.ok(f0.contactAoScale >= 0.4 && f0.contactAoScale < f100.contactAoScale, `${spec.id} unlit 0% keeps subtle shoe Contact AO`);
    assert.ok(f0.backdropBrightness < f50.backdropBrightness && f50.backdropBrightness < f100.backdropBrightness);
    assert.ok(f0.backdropSaturate < f50.backdropSaturate && f50.backdropSaturate < f100.backdropSaturate);
  }
});

test('post-sunset wall-sconce loft turns lamps ON with refined headroom and casts directional + secondary fill shadows', () => {
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
  assert.ok(frame.fixtureOnFactor >= 0.85 && frame.fixtureOnFactor <= 1.0, `expected boosted 100% sconce level, got ${frame.fixtureOnFactor}`);
  assert.ok(frame.directRatio >= 0.78, `night indoor directRatio must stay crisp at 100%, got ${frame.directRatio}`);
  // Left wall sconce sits on negative X, casting primary shadow to positive X (right)
  assert.ok(frame.keyPosX < -1.8, `expected left wall sconce keyPosX < -1.8, got ${frame.keyPosX}`);
  // Opposing right wall sconce casts softer secondary fill shadow to the left
  assert.ok(frame.secondaryShadowWeight >= 0.25, `expected secondary fill shadow, got ${frame.secondaryShadowWeight}`);
  assert.ok(frame.secondaryShadowDirX < -0.5);
  assert.ok(frame.floorPoolStrength > 0.4);
  assert.ok(frame.castShadowScale >= 0.9, `expected full directional cast shadow at 100%, got ${frame.castShadowScale}`);
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

  assert.ok(frame.fixtureOnFactor >= 0.85 && frame.fixtureOnFactor <= 1.0);
  assert.ok(frame.directRatio >= 0.84, `pin-spot directRatio should be crisp, got ${frame.directRatio}`);
  assert.ok(frame.floorPoolStrength >= 0.45, `dark basalt floor needs warm pool, got ${frame.floorPoolStrength}`);
  assert.ok(frame.castShadowScale >= 0.9);
});

test('lightingIntensity 0% turns indoor lamps and night directional cast shadow OFF while keeping grounded Contact AO, and natural outdoor keeps fixtures at 0', () => {
  const offFrame = resolveStageLightingFrame({
    backgroundId: 'b_seoul_cafe_terrace',
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
  assert.equal(offFrame.castShadowScale, 0, 'unlit night indoor room must have 0 directional cast shadow');
  assert.ok(offFrame.contactAoScale >= 0.4 && offFrame.contactAoScale <= 0.5, 'unlit room retains subtle grounded Contact AO');
  assert.equal(offFrame.characterRimDropShadow, 'drop-shadow(0 0 0 rgba(0, 0, 0, 0))');
  assert.ok(offFrame.characterAmbientBrightness < 0.9, 'unlit room subtly dims character ambient brightness');

  // Daytime windowed salon at 0% dimmer still retains soft window-daylight cast shadow
  const dayWindowOff = resolveStageLightingFrame({
    backgroundId: 'b_minimal_loft_window',
    isOutdoor: false,
    timestampMs: NOON_LOCAL_MS,
    theme: 'light',
    lightingPreset: 'auto',
    lightingIntensity: 0,
    weather: { latitude: 37.5665, longitude: 126.978 },
  });
  assert.equal(dayWindowOff.fixtureOnFactor, 0);
  assert.ok(dayWindowOff.castShadowScale > 0.3, 'daytime windowed room keeps natural window directional shadow even when artificial lamps are off');

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
  assert.ok(dressingDay.fixtureOnFactor >= 0.44, `windowless room lamps should stay lit in daytime, got ${dressingDay.fixtureOnFactor}`);
  assert.ok(dressingDay.directRatio >= 0.5);
});

test('zero-continuous dimming across 0%..5%..50%..100% eliminates low-end floor jump, keeps 100% refined, and scales cast shadow cleanly', () => {
  const levels = [0, 5, 25, 50, 75, 100];
  const frames = levels.map((lightingIntensity) =>
    resolveStageLightingFrame({
      backgroundId: 'b_seoul_cafe_terrace',
      isOutdoor: false,
      timestampMs: NIGHT_LOCAL_MS,
      theme: 'dark',
      lightingPreset: 'auto',
      lightingIntensity,
      weather: { latitude: 37.5665, longitude: 126.978 },
    })
  );

  const [f0, f5, f25, f50, f75, f100] = frames;

  // 0% strictly OFF (zero directional cast shadow, subtle grounded Contact AO only)
  assert.equal(f0.fixtureOnFactor, 0);
  assert.equal(f0.floorPoolStrength, 0);
  assert.equal(f0.nightFixtureGlowCss, 'none');
  assert.equal(f0.castShadowScale, 0);
  assert.ok(f0.contactAoScale > 0.35 && f0.contactAoScale < f100.contactAoScale);

  // 5% is genuinely whisper-dim (< 10% of 100% output, no abrupt floor jump)
  assert.ok(f5.fixtureOnFactor > 0 && f5.fixtureOnFactor < f100.fixtureOnFactor * 0.1, `5% fixtureOnFactor (${f5.fixtureOnFactor}) must be whisper-dim vs 100% (${f100.fixtureOnFactor})`);
  assert.ok(f5.castShadowScale > 0 && f5.castShadowScale < f100.castShadowScale * 0.1, `5% castShadowScale (${f5.castShadowScale}) must be faint vs 100% (${f100.castShadowScale})`);

  // 50% sits cleanly near halfway across fixture glow, wall wash, floor pool, and cast shadow
  assert.ok(f50.fixtureOnFactor > f100.fixtureOnFactor * 0.4 && f50.fixtureOnFactor < f100.fixtureOnFactor * 0.6, `50% fixtureOnFactor (${f50.fixtureOnFactor}) should sit near midpoint of 100% (${f100.fixtureOnFactor})`);
  assert.ok(f50.castShadowScale > f100.castShadowScale * 0.4 && f50.castShadowScale < f100.castShadowScale * 0.6);
  assert.notEqual(f50.nightFixtureGlowCss, 'none');
  assert.equal(f50.beamVisible, true);
  assert.equal(f50.hazeVisible, true);

  // Strictly monotonic progression 0% < 5% < 25% < 50% < 75% < 100%
  for (let i = 1; i < frames.length; i += 1) {
    assert.ok(
      frames[i].fixtureOnFactor > frames[i - 1].fixtureOnFactor,
      `fixtureOnFactor must increase from ${levels[i - 1]}% to ${levels[i]}%`
    );
    assert.ok(
      frames[i].castShadowScale > frames[i - 1].castShadowScale,
      `castShadowScale must increase from ${levels[i - 1]}% to ${levels[i]}%`
    );
    assert.ok(
      frames[i].contactAoScale > frames[i - 1].contactAoScale,
      `contactAoScale must increase from ${levels[i - 1]}% to ${levels[i]}%`
    );
    assert.ok(
      frames[i].floorPoolStrength > frames[i - 1].floorPoolStrength,
      `floorPoolStrength must increase from ${levels[i - 1]}% to ${levels[i]}%`
    );
    assert.ok(
      frames[i].keyIntensity > frames[i - 1].keyIntensity,
      `keyIntensity must increase from ${levels[i - 1]}% to ${levels[i]}%`
    );
    assert.ok(
      frames[i].characterAmbientBrightness > frames[i - 1].characterAmbientBrightness,
      `characterAmbientBrightness must increase from ${levels[i - 1]}% to ${levels[i]}%`
    );
  }

  // 100% delivers 3x brighter headroom while staying cleanly bounded without clipping
  assert.ok(f25.fixtureOnFactor > f5.fixtureOnFactor);
  assert.ok(f75.fixtureOnFactor > f50.fixtureOnFactor);
  assert.ok(f100.fixtureOnFactor >= 0.85 && f100.fixtureOnFactor <= 1.0, `100% indoor fixtureOnFactor (${f100.fixtureOnFactor}) must reflect boosted 100% output`);
  assert.ok(
    f100.backdropBrightness >= 0.95 && f100.backdropBrightness <= 1.35,
    `100% night dark-mode cafe brightness (${f100.backdropBrightness}) must be well-lit and bounded`
  );
  assert.ok(
    f100.characterAmbientBrightness >= 1.0 && f100.characterAmbientBrightness <= 1.2,
    `100% characterAmbientBrightness (${f100.characterAmbientBrightness}) must stay cleanly bounded`
  );

  // Physical geometric invariance: at night, dimming a fixed lamp must NEVER drift light direction or shadow shape
  for (const f of frames) {
    assert.equal(f.keyPosX, f100.keyPosX, `night keyPosX must stay locked to lamp across dimmer (${f.intensityPct}%)`);
    assert.equal(f.keyPosY, f100.keyPosY, `night keyPosY must stay locked to lamp across dimmer (${f.intensityPct}%)`);
    assert.equal(f.keyPosZ, f100.keyPosZ, `night keyPosZ must stay locked to lamp across dimmer (${f.intensityPct}%)`);
    assert.equal(f.shadowOffsetX, f100.shadowOffsetX, `night shadowOffsetX must not drift with dimmer (${f.intensityPct}%)`);
    assert.equal(f.shadowOffsetZ, f100.shadowOffsetZ, `night shadowOffsetZ must not drift with dimmer (${f.intensityPct}%)`);
    assert.equal(f.shadowStretchX, f100.shadowStretchX, `night shadowStretchX must not drift with dimmer (${f.intensityPct}%)`);
    assert.equal(f.shadowStretchZ, f100.shadowStretchZ, `night shadowStretchZ must not drift with dimmer (${f.intensityPct}%)`);
    assert.ok(
      f.directRatio >= f100.directRatio * 0.88,
      `night directRatio (${f.directRatio}) must stay geometrically consistent with 100% (${f100.directRatio})`
    );
  }
});

test('daytime windowed rooms strictly separate natural sunlight shadow from artificial fixture shadow across 0%..100% dimmer (0° drift)', () => {
  const windowedRooms = [
    'b_seoul_cafe_terrace',
    'c_atelier_plaster',
    'b_minimal_loft_window',
    'c_stone_boutique',
    's_grand_paris_atelier',
  ] as const;

  const levels = [0, 25, 50, 75, 100];
  for (const bgId of windowedRooms) {
    const frames = levels.map((lightingIntensity) =>
      resolveStageLightingFrame({
        backgroundId: bgId,
        isOutdoor: false,
        timestampMs: NOON_LOCAL_MS,
        theme: 'light',
        lightingPreset: 'auto',
        lightingIntensity,
        weather: { latitude: 37.5665, longitude: 126.978 },
      })
    );
    const [f0, , , , f100] = frames;

    assert.ok(f0.naturalShadowOpacity > 0.35, `${bgId} daytime natural sunlight shadow must remain visible at 0% lamp dimmer`);
    assert.equal(f0.fixtureShadowOpacity, 0, `${bgId} artificial fixture shadow must be strictly 0 at 0% lamp dimmer`);
    assert.ok(f100.fixtureShadowOpacity > 0.35, `${bgId} artificial fixture shadow must emerge cleanly at 100% lamp dimmer`);

    for (let i = 0; i < frames.length; i += 1) {
      const f = frames[i];
      // Natural sunlight shadow & daytime window gobo MUST be 100% invariant to artificial lamp brightness
      assert.equal(f.naturalShadowDirX, f0.naturalShadowDirX, `${bgId} naturalShadowDirX must not drift at ${f.intensityPct}%`);
      assert.equal(f.naturalShadowDirZ, f0.naturalShadowDirZ, `${bgId} naturalShadowDirZ must not drift at ${f.intensityPct}%`);
      assert.equal(f.naturalShadowLengthScale, f0.naturalShadowLengthScale, `${bgId} naturalShadowLengthScale must not drift at ${f.intensityPct}%`);
      assert.equal(f.naturalShadowOpacity, f0.naturalShadowOpacity, `${bgId} naturalShadowOpacity must not change with lamp dimmer at ${f.intensityPct}%`);
      assert.equal(f.goboOpacity, f0.goboOpacity, `${bgId} daytime window goboOpacity must stay independent of lamp dimmer at ${f.intensityPct}%`);
      // Artificial lamp shadow angle & length MUST also stay locked to physical fixture geometry
      assert.equal(f.fixtureShadowDirX, f100.fixtureShadowDirX, `${bgId} fixtureShadowDirX must stay fixed at ${f.intensityPct}%`);
      assert.equal(f.fixtureShadowDirZ, f100.fixtureShadowDirZ, `${bgId} fixtureShadowDirZ must stay fixed at ${f.intensityPct}%`);
      assert.equal(f.fixtureShadowLengthScale, f100.fixtureShadowLengthScale, `${bgId} fixtureShadowLengthScale must stay fixed at ${f.intensityPct}%`);
      // Artificial lamp shadow opacity increases strictly monotonically with lamp dimmer
      if (i > 0) {
        assert.ok(
          f.fixtureShadowOpacity > frames[i - 1].fixtureShadowOpacity,
          `${bgId} fixtureShadowOpacity must increase monotonically from ${levels[i - 1]}% to ${levels[i]}%`
        );
      }
    }
  }
});

test('shaded indoor pendants and sconces declare shadeOptics and restrained halo radii to prevent whole-shade whiteout', () => {
  const shadedRooms = [
    'c_atelier_plaster',
    'b_seoul_cafe_terrace',
    'b_minimal_loft_window',
    'c_stone_boutique',
    's_grand_paris_atelier',
  ] as const;

  for (const bgId of shadedRooms) {
    const bg = STAGE_BACKGROUNDS.find((b) => b.id === bgId);
    assert.ok(bg?.lightingRig?.fixtureEmitters);
    for (const em of bg.lightingRig.fixtureEmitters) {
      if (em.kind === 'pendant' || em.kind === 'sconce') {
        assert.ok(em.shadeOptics, `${bgId}/${em.id} must declare shadeOptics for internal bulb optics`);
        assert.ok(em.radiusPct <= 12.5, `${bgId}/${em.id} radiusPct (${em.radiusPct}) must stay restrained to avoid wall blowout`);
      }
    }
  }
});


