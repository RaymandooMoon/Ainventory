import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeGoogleWeatherResponses,
  sanitizeAuthorityUrl,
  classifyUvLevel,
  classifyWeatherAlertDirective,
  estimateFeelsLikeTemp,
  mapGoogleConditionToWmo,
} from '../../server/googleWeatherService.js';
import { buildWeatherRecommendations } from '../../server/engine.js';
import {
  buildUvSmartSuggestion,
  getEffectiveFeelsLikeTemp,
} from '../../src/utils/uvSmartAccessory.ts';
import { applyStylingDensityFilter } from '../../src/services/stylingPreferenceStore.ts';
import { buildOutfitRationaleNote } from '../../src/utils/outfitRationaleEngine.ts';

test('sanitizeAuthorityUrl allows http/https and rejects javascript/data/invalid URLs', () => {
  assert.equal(
    sanitizeAuthorityUrl('https://www.weather.go.kr/w/index.do'),
    'https://www.weather.go.kr/w/index.do'
  );
  assert.equal(sanitizeAuthorityUrl('http://example.com/alert'), 'http://example.com/alert');
  assert.equal(sanitizeAuthorityUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeAuthorityUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(sanitizeAuthorityUrl('not-a-valid-url'), null);
  assert.equal(sanitizeAuthorityUrl(''), null);
});

test('classifyUvLevel and classifyWeatherAlertDirective map thresholds and alert types accurately', () => {
  assert.equal(classifyUvLevel(1), 'low');
  assert.equal(classifyUvLevel(4), 'moderate');
  assert.equal(classifyUvLevel(6), 'high');
  assert.equal(classifyUvLevel(9), 'very_high');
  assert.equal(classifyUvLevel(11), 'extreme');

  assert.equal(classifyWeatherAlertDirective('HEAVY_RAIN', '호우주의보'), 'rain_storm');
  assert.equal(classifyWeatherAlertDirective('SNOWSTORM', '대설주의보'), 'snow_ice');
  assert.equal(classifyWeatherAlertDirective('COLD_WAVE', '한파주의보'), 'cold_wind');
  assert.equal(classifyWeatherAlertDirective('HEAT_ADVISORY', '폭염주의보'), 'extreme_heat');
  assert.equal(classifyWeatherAlertDirective('FOG', '짙은 안개'), 'advisory');
});

test('estimateFeelsLikeTemp applies wind chill in cold wind and heat index in humid heat', () => {
  const coldWindFeels = estimateFeelsLikeTemp({ tempC: 5, windSpeedKmh: 30, humidity: 45 });
  assert.ok(typeof coldWindFeels === 'number' && coldWindFeels < 5);

  const humidHeatFeels = estimateFeelsLikeTemp({ tempC: 32, windSpeedKmh: 6, humidity: 75 });
  assert.ok(typeof humidHeatFeels === 'number' && humidHeatFeels > 32);

  const mildFeels = estimateFeelsLikeTemp({ tempC: 20, windSpeedKmh: 8, humidity: 50 });
  assert.equal(mildFeels, 20);
});

test('normalizeGoogleWeatherResponses normalizes current, forecast, UV, feels-like, and KMA alerts', () => {
  const normalized = normalizeGoogleWeatherResponses({
    currentPayload: {
      isDaytime: true,
      temperature: { degrees: 12.4, unit: 'CELSIUS' },
      feelsLikeTemperature: { degrees: 7.6, unit: 'CELSIUS' },
      relativeHumidity: 62,
      uvIndex: 7,
      cloudCover: 35,
      visibility: { distance: 10, unit: 'KILOMETERS' },
      weatherCondition: {
        type: 'PARTLY_CLOUDY',
        description: { text: '구름 조금' },
      },
      precipitation: {
        probability: { percent: 20, type: 'RAIN' },
      },
      wind: {
        speed: { value: 26, unit: 'KILOMETERS_PER_HOUR' },
        gust: { value: 38, unit: 'KILOMETERS_PER_HOUR' },
      },
    },
    dailyPayload: {
      forecastDays: [
        {
          displayDate: { year: 2026, month: 4, day: 12 },
          minTemperature: { degrees: 7.2, unit: 'CELSIUS' },
          maxTemperature: { degrees: 15.8, unit: 'CELSIUS' },
          feelsLikeMinTemperature: { degrees: 4.1, unit: 'CELSIUS' },
          feelsLikeMaxTemperature: { degrees: 13.4, unit: 'CELSIUS' },
          daytimeForecast: {
            uvIndex: 8,
            relativeHumidity: 58,
            precipitation: { probability: { percent: 25, type: 'RAIN' } },
            wind: { speed: { value: 24, unit: 'KILOMETERS_PER_HOUR' } },
            weatherCondition: { type: 'PARTLY_CLOUDY', description: { text: '구름 조금' } },
          },
          sunEvents: {
            sunriseTime: '2026-04-12T06:00:00Z',
            sunsetTime: '2026-04-12T19:05:00Z',
          },
        },
      ],
    },
    alertsPayload: {
      weatherAlerts: [
        {
          alertId: 'kma-wind-1',
          alertTitle: { text: '강풍주의보' },
          eventType: 'HIGH_WIND',
          severity: 'MODERATE',
          areaName: '서울특별시',
          description: '강한 바람으로 체감온도가 크게 낮아집니다.',
          instruction: ['방풍 아우터를 착용하세요.'],
          dataSource: {
            name: '기상청 (KMA)',
            authorityUri: 'https://www.weather.go.kr/',
          },
        },
        {
          alertId: 'unsafe-uri-alert',
          alertTitle: { text: '테스트 특보' },
          eventType: 'RAIN',
          severity: 'MINOR',
          dataSource: {
            name: 'Test Agency',
            authorityUri: 'javascript:alert(1)',
          },
        },
      ],
    },
    cityKey: 'seoul',
    cityName: '서울',
    lat: 37.5665,
    lon: 126.978,
    dayTarget: 'today',
    targetDateStr: '2026-04-12',
  });

  assert.ok(normalized);
  assert.equal(normalized.weatherProvider, 'google_weather');
  assert.equal(normalized.currentTemp, 12);
  assert.equal(normalized.feelsLikeTemp, 8);
  assert.equal(normalized.tempMin, 7);
  assert.equal(normalized.tempMax, 16);
  assert.equal(normalized.uvIndex, 8);
  assert.equal(normalized.uvLevel, 'very_high');
  assert.equal(normalized.isWindy, true);
  assert.equal(normalized.alerts.length, 2);
  assert.equal(normalized.alerts[0].dataSource?.name, '기상청 (KMA)');
  assert.equal(normalized.alerts[0].dataSource?.authorityUri, 'https://www.weather.go.kr/');
  assert.equal(normalized.alerts[0].stylingDirective, 'cold_wind');
  assert.equal(normalized.alerts[1].dataSource?.authorityUri, null);
  assert.equal(mapGoogleConditionToWmo('HEAVY_RAIN').code, 65);
});

test('buildWeatherRecommendations prioritizes feels-like temp and applies weather alert directives', () => {
  const sampleCloset = [
    {
      id: 1,
      name: '워터프루프 트렌치 코트',
      category: 'outer',
      subcategory: 'trench',
      color_name: '베이지',
      color_hex: '#C4B193',
      warmth_level: 3,
      water_resistant: 1,
      status: 'active',
    },
    {
      id: 2,
      name: '헤비 다운 패딩',
      category: 'outer',
      subcategory: 'short_padding',
      color_name: '블랙',
      color_hex: '#1B1C1E',
      warmth_level: 5,
      water_resistant: 0,
      status: 'active',
    },
    {
      id: 3,
      name: '울 니트 스웨터',
      category: 'top',
      subcategory: 'knit',
      color_name: '크림',
      color_hex: '#F2EFE9',
      warmth_level: 4,
      status: 'active',
    },
    {
      id: 4,
      name: '코튼 셔츠',
      category: 'top',
      subcategory: 'shirt',
      color_name: '화이트',
      color_hex: '#F6F7F9',
      warmth_level: 2,
      status: 'active',
    },
    {
      id: 5,
      name: '차콜 울 슬랙스',
      category: 'bottom',
      subcategory: 'slacks',
      color_name: '차콜',
      color_hex: '#34373D',
      warmth_level: 3,
      status: 'active',
    },
    {
      id: 6,
      name: '레더 더비 슈즈',
      category: 'shoes',
      subcategory: 'derby',
      color_name: '블랙',
      color_hex: '#1B1C1E',
      warmth_level: 3,
      status: 'active',
    },
  ];

  // Actual 14C ~ 20C, but feelsLikeTemp is 6C with cold_wind alert => avgTemp becomes 4C, requires outer
  const coldResult = buildWeatherRecommendations(
    {
      cityName: '서울',
      tempMin: 14,
      tempMax: 20,
      feelsLikeTemp: 6,
      precipProb: 10,
      windSpeed: 30,
      weatherCode: 2,
      alerts: [{ stylingDirective: 'cold_wind', title: '강풍주의보' }],
      alertStylingDirectives: ['cold_wind'],
    },
    sampleCloset
  );

  assert.equal(coldResult.weather.avgTemp, 4);
  assert.equal(coldResult.weather.isWindy, true);
  assert.ok(coldResult.recommendations.length > 0);
  assert.ok(coldResult.recommendations[0].loadoutBySlot.outer);

  // Rain storm alert should trigger isRainy & select water-resistant trench coat
  const rainResult = buildWeatherRecommendations(
    {
      cityName: '서울',
      tempMin: 14,
      tempMax: 19,
      feelsLikeTemp: 15,
      precipProb: 85,
      windSpeed: 18,
      weatherCode: 65,
      alerts: [{ stylingDirective: 'rain_storm', title: '호우주의보' }],
      alertStylingDirectives: ['rain_storm'],
    },
    sampleCloset
  );

  assert.equal(rainResult.weather.isRainy, true);
  assert.equal(rainResult.recommendations[0].loadoutBySlot.outer?.id, 1);
});

test('buildUvSmartSuggestion suggests sunglasses & hat at UV >= 6 daytime without auto-equipping', () => {
  const garments = [
    { id: 101, name: '블랙 아세테이트 선글라스', category: 'eyewear', subcategory: 'sunglasses', status: 'active' },
    { id: 102, name: '코튼 볼캡', category: 'headwear', subcategory: 'cap', status: 'active' },
    { id: 103, name: '울 비니', category: 'headwear', subcategory: 'beanie', status: 'active' },
  ];

  const highUv = buildUvSmartSuggestion({
    weather: { uvIndex: 8, isDay: true },
    garments,
    slots: { acc_eye: null, acc_head: null },
  });
  assert.equal(highUv.shouldSuggest, true);
  assert.equal(highUv.uvLevel, 'very_high');
  assert.equal(highUv.candidates.length, 2);
  assert.equal(highUv.candidates[0].garment.id, 101);
  assert.equal(highUv.candidates[1].garment.id, 102);

  // When both are already equipped, hide suggestion banner
  const alreadyEquipped = buildUvSmartSuggestion({
    weather: { uvIndex: 8, isDay: true },
    garments,
    slots: { acc_eye: garments[0], acc_head: garments[1] },
  });
  assert.equal(alreadyEquipped.shouldSuggest, false);

  // Low UV or nighttime should not suggest
  assert.equal(
    buildUvSmartSuggestion({ weather: { uvIndex: 4, isDay: true }, garments, slots: {} }).shouldSuggest,
    false
  );
  assert.equal(
    buildUvSmartSuggestion({ weather: { uvIndex: 9, isDay: false }, garments, slots: {} }).shouldSuggest,
    false
  );
  assert.equal(getEffectiveFeelsLikeTemp({ currentTemp: 18, feelsLikeTemp: 11 }), 11);
});

test('applyStylingDensityFilter and outfitRationaleEngine respect feels-like temp, alerts, and UV', () => {
  const baseSlots = {
    outer: { id: 1, name: '트렌치 코트', category: 'outer' },
    outer_mid: { id: 2, name: '가디건', category: 'top' },
    top: { id: 3, name: '옥스포드 셔츠', category: 'top' },
    bottom: { id: 4, name: '슬랙스', category: 'bottom' },
    shoes: { id: 5, name: '더비 슈즈', category: 'shoes' },
    acc_eye: { id: 6, name: '선글라스', category: 'eyewear' },
  };

  // Actual avg 18C (> 15C), but feelsLikeTemp is 11C => minimal mode MUST keep outer
  const chillyMinimal = applyStylingDensityFilter(
    baseSlots,
    { density: 'minimal', includeBag: true, includeAccessory: false },
    { avgTemp: 18, feelsLikeTemp: 11 }
  );
  assert.ok(chillyMinimal.outer, 'outer should remain when feelsLikeTemp <= 15C');
  assert.equal(chillyMinimal.outer_mid, null);
  assert.equal(chillyMinimal.acc_eye, null, 'includeAccessory=false strips extra accessories');

  // Warm 24C with rain_storm alert => balanced mode MUST keep protective outer
  const rainAlertBalanced = applyStylingDensityFilter(
    baseSlots,
    { density: 'balanced', includeBag: true, includeAccessory: false },
    { avgTemp: 24, feelsLikeTemp: 24, alertStylingDirectives: ['rain_storm'] }
  );
  assert.ok(rainAlertBalanced.outer, 'rain_storm alert keeps protective outer');

  // Rationale note mentions feels-like temp, UV, and alert title
  const rationale = buildOutfitRationaleNote({
    slots: { outer: baseSlots.outer, top: baseSlots.top, bottom: baseSlots.bottom, shoes: baseSlots.shoes },
    weather: {
      cityName: '서울',
      currentTemp: 14,
      tempMin: 10,
      tempMax: 16,
      feelsLikeTemp: 9,
      uvIndex: 7,
      alerts: [{ title: '강풍주의보', stylingDirective: 'cold_wind' }],
    },
    lang: 'ko',
  });
  const weatherRow = rationale.items.find((item) => item.key === 'weather');
  assert.ok(weatherRow);
  assert.match(weatherRow.summary, /체감 9°C/);
  assert.match(weatherRow.summary, /UV 7/);
  assert.match(weatherRow.summary, /강풍주의보/);
});
