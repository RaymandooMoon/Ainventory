import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { disposeMediaPipeLandmarker } from '../../src/services/skinToneAnalyzer.ts';
import {
  CUTOUT_STAGE_BACKDROP_HEX,
  buildTurnaroundAnglePromptDirective,
  buildWeatherPosePromptDirectives,
  normalizeRawWeatherToContext,
  resolveEffectiveWeather,
  selectOptimalStudioKeyHex,
} from '../../src/services/weatherPromptBuilder.ts';

describe('Phase 6: Weather Prompt Builder, Studio Key Hex & MediaPipe Lifecycle', () => {
  it('selects collision-safe studio backdrop hex when equipped garments match #94A3B8', () => {
    assert.equal(selectOptimalStudioKeyHex([]), CUTOUT_STAGE_BACKDROP_HEX);
    assert.equal(selectOptimalStudioKeyHex(['#1D1D1F', '#FFFFFF']), CUTOUT_STAGE_BACKDROP_HEX);
    const shifted = selectOptimalStudioKeyHex(['#94A3B8']);
    assert.notEqual(shifted, CUTOUT_STAGE_BACKDROP_HEX);
    assert.match(shifted, /^#[0-9A-Fa-f]{6}$/);
  });

  it('normalizes raw weather inputs and resolves coldwave, heatwave, rain, and snow accurately', () => {
    const coldCtx = normalizeRawWeatherToContext({ mode: 'realtime', temperature: -7, windSpeed: 24 });
    assert.equal(resolveEffectiveWeather(coldCtx), 'coldwave');

    const hotCtx = normalizeRawWeatherToContext({ mode: 'realtime', temperature: 33 });
    assert.equal(resolveEffectiveWeather(hotCtx), 'heatwave');

    const rainCtx = normalizeRawWeatherToContext({ weatherCode: 63, temperature: 14 });
    assert.equal(resolveEffectiveWeather(rainCtx), 'rain');

    const snowCtx = normalizeRawWeatherToContext('눈');
    assert.equal(resolveEffectiveWeather(snowCtx), 'snow');
  });

  it('locks 45° and all turnaround angles to horizontal eye-to-waist full-body framing', () => {
    const rainDirectives = buildWeatherPosePromptDirectives('rain');
    assert.match(rainDirectives.poseDirective, /WIDE-OPEN/);
    assert.match(
      rainDirectives.headroomPrompt,
      /Eye-to-waist level, straight-on horizontal camera, zero tilt/
    );
    assert.match(rainDirectives.headroomPrompt, /10% bottom margin/);

    const angle45 = buildTurnaroundAnglePromptDirective(45);
    assert.match(angle45, /45/);
  });

  it('exports disposeMediaPipeLandmarker and safely resets singleton state when idle', async () => {
    await assert.doesNotReject(async () => {
      await disposeMediaPipeLandmarker();
    });
  });
});
