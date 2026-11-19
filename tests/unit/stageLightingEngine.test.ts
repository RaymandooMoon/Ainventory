import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAGE_BACKGROUNDS,
  STAGE_LIGHTING_PRESETS,
  normalizeEconomyState,
} from '../../src/utils/stageBackgroundCatalog.ts';
import {
  classifyOutdoorWeatherOptics,
  computeSolarEphemeris,
  resolveStageLightingFrame,
} from '../../src/utils/stageLightingEngine.ts';

test('computeSolarEphemeris differentiates summer vs winter solar altitude and morning vs afternoon azimuth', () => {
  const summerNoon = new Date(2026, 5, 21, 12, 30, 0).getTime();
  const winterNoon = new Date(2026, 11, 21, 12, 30, 0).getTime();

  const summer = computeSolarEphemeris({
    timestampMs: summerNoon,
    latitude: 37.5665,
    longitude: 126.978,
  });
  const winter = computeSolarEphemeris({
    timestampMs: winterNoon,
    latitude: 37.5665,
    longitude: 126.978,
  });

  assert.equal(summer.seasonLabel, 'summer');
  assert.equal(winter.seasonLabel, 'winter');
  assert.ok(
    summer.altitudeDeg > winter.altitudeDeg + 35,
    `Expected summer noon altitude (${summer.altitudeDeg}) >> winter noon altitude (${winter.altitudeDeg})`
  );
  assert.ok(summer.seasonIndex > 0.9);
  assert.ok(winter.seasonIndex < -0.9);

  const morning = computeSolarEphemeris({
    timestampMs: new Date(2026, 4, 15, 9, 0, 0).getTime(),
    latitude: 37.5665,
    longitude: 126.978,
  });
  const afternoon = computeSolarEphemeris({
    timestampMs: new Date(2026, 4, 15, 15, 30, 0).getTime(),
    latitude: 37.5665,
    longitude: 126.978,
  });
  assert.ok(morning.azimuthDeg < 180, `Expected morning sun in East (<180), got ${morning.azimuthDeg}`);
  assert.ok(afternoon.azimuthDeg > 180, `Expected afternoon sun in West (>180), got ${afternoon.azimuthDeg}`);
});

test('outdoor composite weather optics resolves bright overcast, bright fog, and sunshower accurately', () => {
  const middaySolar = computeSolarEphemeris({
    timestampMs: new Date(2026, 4, 10, 13, 0, 0).getTime(),
    sunriseIso: '2026-05-10T05:25',
    sunsetIso: '2026-05-10T19:32',
  });

  const overcast = classifyOutdoorWeatherOptics(
    { weatherCode: 3, cloudCover: 88, directRadiation: 70, diffuseRadiation: 240 },
    middaySolar
  );
  assert.equal(overcast.regime, 'bright_overcast');
  assert.ok(overcast.diffuseRatio > overcast.directRatio);

  const brightFog = classifyOutdoorWeatherOptics(
    { weatherCode: 45, visibilityM: 1800, condition: '안개' },
    middaySolar
  );
  assert.equal(brightFog.regime, 'bright_fog');
  assert.ok(brightFog.mieScattering > 0.85);

  const sunshower = classifyOutdoorWeatherOptics(
    {
      weatherCode: 80,
      precipProb: 65,
      cloudCover: 48,
      directRadiation: 310,
      condition: '소나기 · 여우비',
    },
    middaySolar
  );
  assert.equal(sunshower.regime, 'sunshower');
  assert.ok(sunshower.godRayStrength > 0.7);
  assert.equal(sunshower.rainSunGlint, 1);

  const sunshowerFrame = resolveStageLightingFrame({
    backgroundId: 's_palais_royal_outdoor',
    isOutdoor: true,
    weather: {
      weatherCode: 80,
      precipProb: 65,
      cloudCover: 45,
      directRadiation: 320,
      sunrise: '2026-05-10T05:25',
      sunset: '2026-05-10T19:32',
    },
    timestampMs: middaySolar.timestampMs,
  });
  assert.equal(sunshowerFrame.opticalRegime, 'sunshower');
  assert.equal(sunshowerFrame.beamVisible, true);
  assert.equal(sunshowerFrame.goboVisible, false);

  // Winter noon casts longer contact shadow than summer noon on clear outdoor courtyard
  const summerFrame = resolveStageLightingFrame({
    backgroundId: 'b_brick_courtyard',
    isOutdoor: true,
    weather: { weatherCode: 0 },
    timestampMs: new Date(2026, 5, 21, 12, 30, 0).getTime(),
  });
  const winterFrame = resolveStageLightingFrame({
    backgroundId: 'b_brick_courtyard',
    isOutdoor: true,
    weather: { weatherCode: 0 },
    timestampMs: new Date(2026, 11, 21, 12, 30, 0).getTime(),
  });
  assert.ok(
    winterFrame.shadowStretchZ > summerFrame.shadowStretchZ,
    `Expected winter shadow (${winterFrame.shadowStretchZ}) > summer shadow (${summerFrame.shadowStretchZ})`
  );
});

test('all 10 indoor backgrounds define architectural lightingRig and switch from daytime window gobo to post-sunset fixtures', () => {
  const indoorBgs = STAGE_BACKGROUNDS.filter((bg) => !bg.isOutdoor);
  assert.equal(indoorBgs.length, 10);
  for (const bg of indoorBgs) {
    assert.ok(bg.lightingRig, `Missing lightingRig on indoor background ${bg.id}`);
  }

  const morningMs = new Date(2026, 9, 14, 9, 30, 0).getTime();
  const afternoonMs = new Date(2026, 9, 14, 15, 30, 0).getTime();
  const nightMs = new Date(2026, 9, 14, 21, 0, 0).getTime();
  const weatherSunTimes = {
    sunrise: '2026-10-14T06:38',
    sunset: '2026-10-14T17:58',
  };

  // Loft arched window moves sun gobo across floor during daytime, then turns on wall-sconce after sunset
  const loftMorning = resolveStageLightingFrame({
    backgroundId: 'b_minimal_loft_window',
    weather: weatherSunTimes,
    timestampMs: morningMs,
  });
  const loftAfternoon = resolveStageLightingFrame({
    backgroundId: 'b_minimal_loft_window',
    weather: weatherSunTimes,
    timestampMs: afternoonMs,
  });
  const loftNight = resolveStageLightingFrame({
    backgroundId: 'b_minimal_loft_window',
    weather: weatherSunTimes,
    timestampMs: nightMs,
  });

  assert.equal(loftMorning.opticalRegime, 'indoor_day_window');
  assert.equal(loftMorning.goboVisible, true);
  assert.equal(loftMorning.goboKind, 'arched-grid-gobo');
  assert.ok(
    Math.abs(loftMorning.goboPosX - loftAfternoon.goboPosX) > 0.15,
    'Expected window gobo floor patch to shift horizontally as sun moves from morning to afternoon'
  );

  assert.equal(loftNight.opticalRegime, 'indoor_night_fixture');
  assert.equal(loftNight.solar.isPostSunset, true);
  assert.equal(loftNight.goboVisible, false);
  assert.equal(loftNight.indoorNightFixture, 'wall-sconce');
  assert.equal(loftNight.beamVisible, true);
  assert.ok(loftNight.backdropNightDim > 0.2);

  // Windowless Oak Dressing Room never projects fake daytime window gobos
  const oakDay = resolveStageLightingFrame({
    backgroundId: 'c_oak_dressing_room',
    weather: weatherSunTimes,
    timestampMs: morningMs,
  });
  assert.equal(oakDay.goboVisible, false);
  assert.equal(oakDay.goboOpacity, 0);
});

test('user lighting preset and brightness slider override colors and scale intensities cleanly within 0..100%', () => {
  assert.equal(STAGE_LIGHTING_PRESETS.length, 6);

  const normalizedDefault = normalizeEconomyState({});
  assert.equal(normalizedDefault.lightingPreset, 'auto');
  assert.equal(normalizedDefault.lightingIntensity, 100);

  // Legacy values > 100% are safely clamped down to 100%
  const normalizedClamped = normalizeEconomyState({
    lightingPreset: 'golden_amber',
    lightingIntensity: 260,
  });
  assert.equal(normalizedClamped.lightingPreset, 'golden_amber');
  assert.equal(normalizedClamped.lightingIntensity, 100);

  const base100 = resolveStageLightingFrame({
    backgroundId: 'c_atelier_plaster',
    lightingPreset: 'golden_amber',
    lightingIntensity: 100,
    timestampMs: new Date(2026, 9, 14, 13, 0, 0).getTime(),
  });
  const dimmed50 = resolveStageLightingFrame({
    backgroundId: 'c_atelier_plaster',
    lightingPreset: 'golden_amber',
    lightingIntensity: 50,
    timestampMs: new Date(2026, 9, 14, 13, 0, 0).getTime(),
  });
  const muted0 = resolveStageLightingFrame({
    backgroundId: 'c_atelier_plaster',
    lightingPreset: 'cool_gallery',
    lightingIntensity: 0,
    timestampMs: new Date(2026, 9, 14, 13, 0, 0).getTime(),
  });

  assert.equal(base100.keyHex, 0xffbc6e);
  assert.ok(
    dimmed50.keyIntensity > 0 && dimmed50.keyIntensity < base100.keyIntensity,
    `Expected 0 < dimmed50.keyIntensity (${dimmed50.keyIntensity}) < base100.keyIntensity (${base100.keyIntensity})`
  );
  assert.equal(muted0.keyHex, 0xe4f0ff);
  assert.equal(muted0.keyIntensity, 0);
  assert.equal(muted0.beamVisible, false);
});
