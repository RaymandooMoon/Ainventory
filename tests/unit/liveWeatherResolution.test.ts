import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  buildOpenMeteoForecastUrl,
  parseOpenMeteoForecastPayload,
} from '../../src/utils/liveWeatherClient.ts';

const ROOT = process.cwd();

const SAMPLE_OPEN_METEO_SEOUL_WINTER = {
  latitude: 37.55,
  longitude: 127.0625,
  timezone: 'Asia/Seoul',
  current: {
    time: '2026-11-20T16:45',
    temperature_2m: 1.1,
    relative_humidity_2m: 47,
    weather_code: 0,
    wind_speed_10m: 14.3,
    cloud_cover: 8,
    visibility: 35820,
    is_day: 1,
    precipitation: 0,
    direct_radiation: 22.6,
    diffuse_radiation: 49.4,
  },
  daily: {
    time: ['2026-11-20', '2026-11-21', '2026-11-22'],
    weather_code: [1, 0, 2],
    temperature_2m_max: [1.6, 1.0, 4.3],
    temperature_2m_min: [-2.8, -4.3, -4.9],
    precipitation_probability_max: [0, 0, 0],
    wind_speed_10m_max: [18.5, 13.3, 6.9],
    sunrise: ['2026-11-20T07:16', '2026-11-21T07:17', '2026-11-22T07:18'],
    sunset: ['2026-11-20T17:18', '2026-11-21T17:17', '2026-11-22T17:16'],
    shortwave_radiation_sum: [11.52, 12.21, 11.31],
  },
};

describe('Live Open-Meteo Weather Resolution & Anti-Stale Cache Guards', () => {
  it('builds Open-Meteo URL with current temperature_2m, relative_humidity_2m, weather_code, and timezone=auto', () => {
    const url = buildOpenMeteoForecastUrl(37.5446, 127.0436);
    assert.match(url, /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?/);
    assert.match(url, /temperature_2m/);
    assert.match(url, /relative_humidity_2m/);
    assert.match(url, /wind_speed_10m/);
    assert.match(url, /timezone=auto/);
  });

  it('parses real today winter Open-Meteo payload accurately with currentTemp and daily min/max', () => {
    const parsed = parseOpenMeteoForecastPayload(SAMPLE_OPEN_METEO_SEOUL_WINTER, {
      cityKey: 'gps',
      cityName: '서울시 성동구 성수1가2동',
      lat: 37.5446,
      lon: 127.0436,
      dayTarget: 'today',
    });
    assert.ok(parsed);
    assert.equal(parsed.tempMin, -3);
    assert.equal(parsed.tempMax, 2);
    assert.equal(parsed.currentTemp, 1);
    assert.equal(parsed.avgTemp, 0);
    assert.equal(parsed.humidity, 47);
    assert.equal(parsed.precipProb, 0);
    assert.equal(parsed.windSpeed, 19);
    assert.equal(parsed.fallbackUsed, false);
    assert.equal(parsed.isRainy, false);
    assert.equal(parsed.date, '2026-11-20');
  });

  it('parses tomorrow forecast cleanly without attaching today currentTemp', () => {
    const parsed = parseOpenMeteoForecastPayload(SAMPLE_OPEN_METEO_SEOUL_WINTER, {
      cityKey: 'seoul',
      cityName: '서울',
      lat: 37.5665,
      lon: 126.978,
      dayTarget: 'tomorrow',
    });
    assert.ok(parsed);
    assert.equal(parsed.tempMin, -4);
    assert.equal(parsed.tempMax, 1);
    assert.equal(parsed.currentTemp, undefined);
    assert.equal(parsed.date, '2026-11-21');
    assert.equal(parsed.fallbackUsed, false);
  });

  it('server/engine.js uses >= 5000ms Open-Meteo timeout and requests current temperature_2m', () => {
    const engineSrc = fs.readFileSync(path.join(ROOT, 'server/engine.js'), 'utf8');
    const timeoutMatch = engineSrc.match(/OPEN_METEO_TIMEOUT_MS\s*=\s*(\d+)/);
    assert.ok(timeoutMatch, 'Expected OPEN_METEO_TIMEOUT_MS constant in server/engine.js');
    assert.ok(
      Number(timeoutMatch[1]) >= 5000,
      `OPEN_METEO_TIMEOUT_MS (${timeoutMatch[1]}ms) must be >= 5000ms for remote cloud regions`
    );
    assert.match(engineSrc, /current=[^`]*temperature_2m/);
  });

  it('src/utils/api.ts bypasses stale IndexedDB cache for live /weather/recommendations requests', () => {
    const apiSrc = fs.readFileSync(path.join(ROOT, 'src/utils/api.ts'), 'utf8');
    assert.match(apiSrc, /\/weather\/recommendations/);
    assert.match(apiSrc, /isLiveWeatherEndpoint|isLiveStatusOrWeatherEndpoint/);
  });
});
