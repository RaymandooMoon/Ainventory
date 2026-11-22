/**
 * Server-side proxy & normalizer for Google Maps Platform Weather API v1.
 * Endpoints used:
 *  - GET https://weather.googleapis.com/v1/currentConditions:lookup
 *  - GET https://weather.googleapis.com/v1/forecast/days:lookup
 *  - GET https://weather.googleapis.com/v1/publicAlerts:lookup
 * Reference: https://developers.google.com/maps/documentation/weather/overview?utm_campaign=gmp_mcp_codeassist_v1_aistudio
 */

import { getServerGoogleMapsApiKey } from './mapsProxyService.js';

const WEATHER_API_BASE = 'https://weather.googleapis.com/v1';
const MAPS_SOLUTION_ID = 'gmp_mcp_codeassist_v1_aistudio';
const REQUEST_TIMEOUT_MS = 6500;
const WEATHER_TTL_MS = 20 * 60 * 1000; // 20 minutes
const ALERTS_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_CACHE_ENTRIES = 80;

const weatherCache = new Map();
const alertsCache = new Map();

function roundCoordKey(lat, lon) {
  return `${Number(lat).toFixed(2)}:${Number(lon).toFixed(2)}`;
}

function pruneCache(map, ttlMs) {
  const now = Date.now();
  if (map.size >= MAX_CACHE_ENTRIES) {
    for (const [k, v] of map.entries()) {
      if (now - v.fetchedAt >= ttlMs) map.delete(k);
    }
  }
  if (map.size >= MAX_CACHE_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}

export function sanitizeAuthorityUrl(rawUrl) {
  const str = String(rawUrl || '').trim();
  if (!str) return null;
  try {
    const parsed = new URL(str);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function classifyUvLevel(uvIndex) {
  const n = Number(uvIndex);
  if (!Number.isFinite(n) || n < 0) return 'low';
  if (n >= 11) return 'extreme';
  if (n >= 8) return 'very_high';
  if (n >= 6) return 'high';
  if (n >= 3) return 'moderate';
  return 'low';
}

export function classifyWeatherAlertDirective(eventType, title = '') {
  const joined = `${String(eventType || '')} ${String(title || '')}`.toUpperCase();
  if (
    /SNOW|BLIZZARD|ICE|FREEZING_RAIN|FREEZING_DRIZZLE|FROST|GLAZE|WINTER_STORM|AVALANCHE|대설|한파결빙|빙판/.test(
      joined
    )
  ) {
    return 'snow_ice';
  }
  if (
    /RAIN|FLOOD|STORM|TYPHOON|CYCLONE|HURRICANE|MONSOON|THUNDER|HAIL|호우|태풍|폭풍|뇌우/.test(
      joined
    )
  ) {
    return 'rain_storm';
  }
  if (
    /COLD|FREEZING|WIND_CHILL|GALE|WIND|한파|강풍|풍랑/.test(joined)
  ) {
    return 'cold_wind';
  }
  if (/HEAT|DROUGHT|FIRE|폭염|건조/.test(joined)) {
    return 'extreme_heat';
  }
  return 'advisory';
}

export function estimateFeelsLikeTemp({ tempC, windSpeedKmh = 10, humidity = 50 }) {
  const t = Number(tempC);
  if (!Number.isFinite(t)) return null;
  const v = Math.max(0, Number(windSpeedKmh) || 0);
  const rh = Math.max(0, Math.min(100, Number(humidity) || 50));

  // Wind chill for cool/cold temperatures (<= 10C & wind > 4.8 km/h)
  if (t <= 10 && v > 4.8) {
    const wc =
      13.12 +
      0.6215 * t -
      11.37 * Math.pow(v, 0.16) +
      0.3965 * t * Math.pow(v, 0.16);
    return Math.round(wc);
  }
  // Mild breeze cooling adjustment between 11C and 18C with noticeable wind
  if (t > 10 && t <= 18 && v >= 18) {
    const drop = Math.min(4, Math.round((v - 14) * 0.16));
    return Math.round(t - drop);
  }
  // Apparent heat index for warm & humid conditions (>= 26C & RH >= 45%)
  if (t >= 26 && rh >= 45) {
    const hi = t + (rh - 40) * 0.085;
    return Math.round(hi);
  }
  return Math.round(t);
}

export function mapGoogleConditionToWmo(conditionType) {
  const type = String(conditionType || '').toUpperCase();
  if (/THUNDER|STORM/.test(type)) return { code: 95, ko: '뇌우 · 소나기' };
  if (/HEAVY_SNOW|BLOWING_SNOW|SNOWSTORM/.test(type)) return { code: 75, ko: '강한 눈' };
  if (/SNOW|FLURRIES/.test(type)) return { code: 73, ko: '눈' };
  if (/RAIN_AND_SNOW|SLEET|HAIL|ICE|FREEZING/.test(type)) return { code: 67, ko: '진눈깨비 · 빙판' };
  if (/HEAVY_RAIN|POURING/.test(type)) return { code: 65, ko: '강한 비' };
  if (/RAIN|SHOWER|DRIZZLE/.test(type)) return { code: 61, ko: '비' };
  if (/FOG|MIST|HAZE/.test(type)) return { code: 45, ko: '안개' };
  if (/CLOUDY|OVERCAST/.test(type)) {
    if (/MOSTLY_CLOUDY|PARTLY_CLOUDY/.test(type)) return { code: 2, ko: '구름 많음' };
    return { code: 3, ko: '흐림' };
  }
  if (/MOSTLY_CLEAR|PARTLY_CLEAR/.test(type)) return { code: 1, ko: '대체로 맑음' };
  if (/WIND/.test(type)) return { code: 2, ko: '강풍' };
  return { code: 0, ko: '맑음' };
}

function readTempDegrees(obj) {
  const val = Number(obj?.degrees);
  return Number.isFinite(val) ? val : null;
}

function readSpeedKmh(speedObj) {
  const val = Number(speedObj?.value);
  if (!Number.isFinite(val)) return null;
  const unit = String(speedObj?.unit || 'KILOMETERS_PER_HOUR').toUpperCase();
  if (unit === 'MILES_PER_HOUR') return Math.round(val * 1.60934);
  if (unit === 'METERS_PER_SECOND') return Math.round(val * 3.6);
  return Math.round(val);
}

function normalizeAlertsList(rawAlertsPayload) {
  const list = Array.isArray(rawAlertsPayload?.weatherAlerts)
    ? rawAlertsPayload.weatherAlerts
    : [];

  return list
    .map((item) => {
      const alertId = String(item?.alertId || '').trim();
      const title = String(
        item?.alertTitle?.text || item?.alertTitle || item?.eventType || ''
      ).trim();
      if (!title) return null;
      const eventType = String(item?.eventType || 'UNKNOWN').trim().toUpperCase();
      const severity = String(item?.severity || 'MODERATE').trim().toUpperCase();
      const areaName = String(item?.areaName || '').trim();
      const description = String(item?.description || '').trim();
      const instructions = Array.isArray(item?.instruction)
        ? item.instruction.map((s) => String(s || '').trim()).filter(Boolean)
        : [];
      const safetyRecs = Array.isArray(item?.safetyRecommendations)
        ? item.safetyRecommendations
            .map((r) => String(r?.directive || r?.subtext || '').trim())
            .filter(Boolean)
        : [];
      const publisherName = String(
        item?.dataSource?.name || item?.dataSource?.publisher || ''
      ).trim();
      const authorityUri = sanitizeAuthorityUrl(
        item?.dataSource?.authorityUri || item?.dataSource?.authority_uri
      );
      const stylingDirective = classifyWeatherAlertDirective(eventType, title);

      return {
        alertId: alertId || `${eventType}:${areaName || 'local'}`,
        title,
        eventType,
        severity,
        areaName,
        description,
        instructions: instructions.length > 0 ? instructions : safetyRecs,
        startTime: typeof item?.startTime === 'string' ? item.startTime : null,
        expirationTime:
          typeof item?.expirationTime === 'string' ? item.expirationTime : null,
        dataSource: publisherName
          ? { name: publisherName, authorityUri }
          : null,
        stylingDirective,
      };
    })
    .filter(Boolean)
    .slice(0, 5);
}

export function normalizeGoogleWeatherResponses({
  currentPayload,
  dailyPayload,
  alertsPayload,
  cityKey,
  cityName,
  lat,
  lon,
  dayTarget = 'today',
  targetDateStr,
}) {
  const forecastDays = Array.isArray(dailyPayload?.forecastDays)
    ? dailyPayload.forecastDays
    : [];
  const dayIdx = dayTarget === 'tomorrow' && forecastDays.length > 1 ? 1 : 0;
  const dayRecord = forecastDays[dayIdx] || forecastDays[0] || null;
  const daytime = dayRecord?.daytimeForecast || null;
  const nighttime = dayRecord?.nighttimeForecast || null;
  const useCurrent = dayTarget === 'today' && currentPayload && typeof currentPayload === 'object';

  const currentTempRaw = useCurrent ? readTempDegrees(currentPayload.temperature) : null;
  const currentFeelsRaw = useCurrent
    ? readTempDegrees(currentPayload.feelsLikeTemperature)
    : null;

  const minRaw =
    readTempDegrees(dayRecord?.minTemperature) ??
    readTempDegrees(currentPayload?.currentConditionsHistory?.minTemperature) ??
    currentTempRaw;
  const maxRaw =
    readTempDegrees(dayRecord?.maxTemperature) ??
    readTempDegrees(currentPayload?.currentConditionsHistory?.maxTemperature) ??
    currentTempRaw;

  if (minRaw === null || maxRaw === null) {
    return null;
  }

  const feelsMinRaw =
    readTempDegrees(dayRecord?.feelsLikeMinTemperature) ??
    (currentFeelsRaw !== null ? Math.min(currentFeelsRaw, minRaw) : minRaw);
  const feelsMaxRaw =
    readTempDegrees(dayRecord?.feelsLikeMaxTemperature) ??
    (currentFeelsRaw !== null ? Math.max(currentFeelsRaw, maxRaw) : maxRaw);

  const conditionSource = useCurrent
    ? currentPayload.weatherCondition
    : daytime?.weatherCondition || nighttime?.weatherCondition;
  const mappedCond = mapGoogleConditionToWmo(conditionSource?.type);
  const localizedCondText = String(conditionSource?.description?.text || '').trim();

  const currentPrecipProb = Number(currentPayload?.precipitation?.probability?.percent);
  const dayPrecipProb = Number(daytime?.precipitation?.probability?.percent);
  const nightPrecipProb = Number(nighttime?.precipitation?.probability?.percent);
  const precipCandidates = [currentPrecipProb, dayPrecipProb, nightPrecipProb].filter((v) =>
    Number.isFinite(v)
  );
  const precipProb =
    precipCandidates.length > 0 ? Math.round(Math.max(...precipCandidates)) : 10;

  const precipitationType = String(
    (useCurrent
      ? currentPayload?.precipitation?.probability?.type
      : daytime?.precipitation?.probability?.type) ||
      daytime?.precipitation?.probability?.type ||
      'NONE'
  ).toUpperCase();

  const currentWindSpeed = useCurrent
    ? readSpeedKmh(currentPayload?.wind?.speed)
    : null;
  const dayWindSpeed = readSpeedKmh(daytime?.wind?.speed);
  const windGust =
    readSpeedKmh(useCurrent ? currentPayload?.wind?.gust : daytime?.wind?.gust) ??
    readSpeedKmh(daytime?.wind?.gust);
  const windSpeed = Math.round(dayWindSpeed ?? currentWindSpeed ?? 10);

  const humidityRaw = useCurrent
    ? Number(currentPayload?.relativeHumidity)
    : Number(daytime?.relativeHumidity);
  const humidity = Number.isFinite(humidityRaw)
    ? Math.round(humidityRaw)
    : precipProb >= 50
      ? 75
      : 50;

  const uvCandidates = [
    useCurrent ? Number(currentPayload?.uvIndex) : NaN,
    Number(daytime?.uvIndex),
  ].filter((v) => Number.isFinite(v) && v >= 0);
  const uvIndex = uvCandidates.length > 0 ? Math.round(Math.max(...uvCandidates)) : 0;
  const uvLevel = classifyUvLevel(uvIndex);

  const cloudRaw = useCurrent
    ? Number(currentPayload?.cloudCover)
    : Number(daytime?.cloudCover);
  const cloudCover = Number.isFinite(cloudRaw) ? Math.round(cloudRaw) : undefined;

  const visRaw = Number(currentPayload?.visibility?.distance);
  const visibilityM = Number.isFinite(visRaw)
    ? String(currentPayload?.visibility?.unit || '').toUpperCase() === 'KILOMETERS'
      ? Math.round(visRaw * 1000)
      : Math.round(visRaw)
    : undefined;

  const displayDateObj = dayRecord?.displayDate;
  const formattedDate =
    displayDateObj && displayDateObj.year && displayDateObj.month && displayDateObj.day
      ? `${String(displayDateObj.year).padStart(4, '0')}-${String(displayDateObj.month).padStart(2, '0')}-${String(displayDateObj.day).padStart(2, '0')}`
      : targetDateStr;

  const tempMin = Math.round(minRaw);
  const tempMax = Math.round(maxRaw);
  const feelsLikeMin = Math.round(feelsMinRaw);
  const feelsLikeMax = Math.round(feelsMaxRaw);
  const currentTemp = currentTempRaw !== null ? Math.round(currentTempRaw) : undefined;
  const feelsLikeTemp =
    currentFeelsRaw !== null
      ? Math.round(currentFeelsRaw)
      : Math.round(feelsLikeMin * 0.45 + feelsLikeMax * 0.55);

  const alerts = normalizeAlertsList(alertsPayload);
  const alertStylingDirectives = Array.from(
    new Set(alerts.map((a) => a.stylingDirective).filter(Boolean))
  );

  const isSnowy =
    precipitationType === 'SNOW' ||
    precipitationType === 'RAIN_AND_SNOW' ||
    (mappedCond.code >= 71 && mappedCond.code <= 86) ||
    alertStylingDirectives.includes('snow_ice');
  const isRainy =
    precipitationType === 'RAIN' ||
    precipitationType === 'RAIN_AND_SNOW' ||
    precipProb >= 45 ||
    (mappedCond.code >= 51 && mappedCond.code <= 69) ||
    mappedCond.code === 95 ||
    alertStylingDirectives.includes('rain_storm');
  const isWindy =
    windSpeed >= 22 ||
    (Number.isFinite(windGust) && windGust >= 32) ||
    alertStylingDirectives.includes('cold_wind');

  return {
    cityKey,
    cityName,
    latitude: lat,
    longitude: lon,
    date: formattedDate,
    dayTarget,
    scenarioKey: 'live',
    weatherProvider: 'google_weather',
    condition: localizedCondText || mappedCond.ko,
    weatherCode: mappedCond.code,
    tempMin,
    tempMax,
    ...(currentTemp !== undefined ? { currentTemp } : {}),
    feelsLikeTemp,
    feelsLikeMin,
    feelsLikeMax,
    uvIndex,
    uvLevel,
    precipitationType,
    precipProb,
    windSpeed,
    ...(windGust !== null ? { windGust } : {}),
    ...(currentWindSpeed !== null ? { currentWindSpeed } : {}),
    humidity,
    cloudCover,
    visibilityM,
    sunrise: typeof dayRecord?.sunEvents?.sunriseTime === 'string' ? dayRecord.sunEvents.sunriseTime : null,
    sunset: typeof dayRecord?.sunEvents?.sunsetTime === 'string' ? dayRecord.sunEvents.sunsetTime : null,
    isDay: typeof currentPayload?.isDaytime === 'boolean' ? currentPayload.isDaytime : true,
    isRainy,
    isSnowy,
    isWindy,
    alerts,
    alertStylingDirectives,
    isSimulated: false,
    fallbackUsed: false,
    weatherUnavailable: false,
    quotaFallbackTriggered: false,
  };
}

async function fetchGoogleWeatherJson(pathWithQuery) {
  const url = `${WEATHER_API_BASE}${pathWithQuery}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Goog-Maps-Solution-ID': MAPS_SOLUTION_ID,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const statusStr = String(payload?.error?.status || '').toUpperCase();
    const isQuota =
      res.status === 429 ||
      statusStr === 'RESOURCE_EXHAUSTED' ||
      /quota|rate limit/i.test(String(payload?.error?.message || ''));
    const err = new Error(payload?.error?.message || `Google Weather HTTP ${res.status}`);
    err.status = res.status;
    err.isQuota = isQuota;
    throw err;
  }
  return payload;
}

/**
 * Fetches Google Maps Weather API v1 (current + 2-day forecast + public alerts)
 * with coordinate rounding caches and non-throwing quota detection so callers
 * can cleanly fall back to Open-Meteo without disrupting Studio UX.
 */
export async function fetchGoogleWeatherSnapshot({
  lat,
  lon,
  cityKey,
  cityName,
  dayTarget = 'today',
  targetDateStr,
  languageCode = 'ko',
}) {
  const apiKey = getServerGoogleMapsApiKey();
  if (!apiKey) {
    return { weather: null, quotaExceeded: false, reason: 'missing_key' };
  }

  const safeLat = Number(lat);
  const safeLon = Number(lon);
  if (
    !Number.isFinite(safeLat) ||
    !Number.isFinite(safeLon) ||
    safeLat < -90 ||
    safeLat > 90 ||
    safeLon < -180 ||
    safeLon > 180
  ) {
    return { weather: null, quotaExceeded: false, reason: 'invalid_coords' };
  }

  const safeLang = languageCode === 'en' ? 'en' : 'ko';
  const coordKey = roundCoordKey(safeLat, safeLon);
  const weatherCacheKey = `${coordKey}:${safeLang}`;
  const now = Date.now();

  let cachedWeather = weatherCache.get(weatherCacheKey);
  if (cachedWeather && now - cachedWeather.fetchedAt >= WEATHER_TTL_MS) {
    weatherCache.delete(weatherCacheKey);
    cachedWeather = null;
  }

  let cachedAlerts = alertsCache.get(weatherCacheKey);
  if (cachedAlerts && now - cachedAlerts.fetchedAt >= ALERTS_TTL_MS) {
    alertsCache.delete(weatherCacheKey);
    cachedAlerts = null;
  }

  try {
    const baseQuery = `key=${encodeURIComponent(apiKey)}&location.latitude=${encodeURIComponent(
      String(safeLat)
    )}&location.longitude=${encodeURIComponent(String(safeLon))}&languageCode=${encodeURIComponent(
      safeLang
    )}`;

    const [currentPayload, dailyPayload, alertsPayload] = await Promise.all([
      cachedWeather
        ? Promise.resolve(cachedWeather.currentPayload)
        : fetchGoogleWeatherJson(`/currentConditions:lookup?${baseQuery}&unitsSystem=METRIC`),
      cachedWeather
        ? Promise.resolve(cachedWeather.dailyPayload)
        : fetchGoogleWeatherJson(
            `/forecast/days:lookup?${baseQuery}&unitsSystem=METRIC&days=2&pageSize=2`
          ),
      cachedAlerts
        ? Promise.resolve(cachedAlerts.alertsPayload)
        : fetchGoogleWeatherJson(`/publicAlerts:lookup?${baseQuery}&pageSize=5`).catch(
            (alertErr) => {
              if (alertErr?.isQuota) throw alertErr;
              return { weatherAlerts: [] };
            }
          ),
    ]);

    if (!cachedWeather) {
      pruneCache(weatherCache, WEATHER_TTL_MS);
      weatherCache.set(weatherCacheKey, {
        fetchedAt: now,
        currentPayload,
        dailyPayload,
      });
    }
    if (!cachedAlerts) {
      pruneCache(alertsCache, ALERTS_TTL_MS);
      alertsCache.set(weatherCacheKey, {
        fetchedAt: now,
        alertsPayload,
      });
    }

    const normalized = normalizeGoogleWeatherResponses({
      currentPayload,
      dailyPayload,
      alertsPayload,
      cityKey,
      cityName,
      lat: safeLat,
      lon: safeLon,
      dayTarget,
      targetDateStr,
    });

    if (!normalized) {
      return { weather: null, quotaExceeded: false, reason: 'incomplete_payload' };
    }

    return { weather: normalized, quotaExceeded: false };
  } catch (err) {
    return {
      weather: null,
      quotaExceeded: Boolean(err?.isQuota),
      reason: err instanceof Error ? err.message : 'google_weather_failed',
    };
  }
}
