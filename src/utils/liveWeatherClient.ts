export interface DirectOpenMeteoOptions {
  readonly cityKey: string;
  readonly cityName: string;
  readonly lat: number;
  readonly lon: number;
  readonly dayTarget: 'today' | 'tomorrow';
}

export interface DirectOpenMeteoWeather {
  readonly cityKey: string;
  readonly cityName: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly date: string;
  readonly dayTarget: 'today' | 'tomorrow';
  readonly scenarioKey: 'live';
  readonly condition: string;
  readonly weatherCode: number;
  readonly tempMin: number;
  readonly tempMax: number;
  readonly avgTemp: number;
  readonly tempC: number;
  readonly currentTemp?: number;
  readonly currentWeatherCode?: number;
  readonly currentWindSpeed?: number;
  readonly diurnalSwing: number;
  readonly precipProb: number;
  readonly windSpeed: number;
  readonly humidity: number;
  readonly sunrise: string | null;
  readonly sunset: string | null;
  readonly shortwaveRadiationSum?: number;
  readonly cloudCover?: number;
  readonly visibilityM?: number;
  readonly directRadiation?: number;
  readonly diffuseRadiation?: number;
  readonly currentPrecipitation?: number;
  readonly isDay?: boolean;
  readonly isRainy: boolean;
  readonly isRaining: boolean;
  readonly isSnowy: boolean;
  readonly isWindy: boolean;
  readonly isSimulated: false;
  readonly fallbackUsed: false;
  readonly weatherUnavailable: false;
  readonly recommendedMotion: string;
  readonly summary: string;
  readonly weatherTip: string;
}

const DIRECT_WEATHER_TTL_MS = 15 * 60 * 1000;
const DIRECT_OPEN_METEO_TIMEOUT_MS = 5000;
const directWeatherCache = new Map<string, { fetchedAt: number; data: DirectOpenMeteoWeather }>();

function weatherCodeToKorean(code: number): string {
  if (code === 0) return '쾌청함';
  if (code === 1 || code === 2) return '대체로 맑음';
  if (code === 3) return '흐림';
  if (code >= 45 && code <= 48) return '안개';
  if (code >= 51 && code <= 67) return '비 예보';
  if (code >= 71 && code <= 77) return '눈 예보';
  if (code >= 80 && code <= 82) return '소나기 가능성';
  if (code >= 95) return '뇌우 동반 비';
  return '구름 조금';
}

function inferWeatherMotion(
  code: number,
  precipProb: number,
  windSpeed: number,
  condition: string
): string {
  if (
    precipProb >= 45 ||
    (code >= 51 && code <= 99) ||
    /비|눈|소나기|우산|뇌우/.test(condition)
  ) {
    return 'umbrella';
  }
  if (windSpeed >= 22 || /강풍|돌풍|칼바람|바람|gale|windy/i.test(condition)) {
    return 'wind';
  }
  if (windSpeed >= 15) {
    return 'walk';
  }
  return 'idle';
}

export function buildOpenMeteoForecastUrl(lat: number, lon: number): string {
  const safeLat = Number(lat).toFixed(4);
  const safeLon = Number(lon).toFixed(4);
  return (
    `https://api.open-meteo.com/v1/forecast?latitude=${safeLat}&longitude=${safeLon}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset,shortwave_radiation_sum' +
    '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,cloud_cover,visibility,is_day,precipitation,direct_radiation,diffuse_radiation' +
    '&timezone=auto&forecast_days=3'
  );
}

interface RawOpenMeteoPayload {
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    wind_speed_10m_max?: number[];
    sunrise?: string[];
    sunset?: string[];
    shortwave_radiation_sum?: number[];
  };
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    cloud_cover?: number;
    visibility?: number;
    is_day?: number;
    precipitation?: number;
    direct_radiation?: number;
    diffuse_radiation?: number;
  };
}

export function parseOpenMeteoForecastPayload(
  raw: unknown,
  options: DirectOpenMeteoOptions
): DirectOpenMeteoWeather | null {
  if (!raw || typeof raw !== 'object') return null;
  const json = raw as RawOpenMeteoPayload;
  const daily = json.daily;
  if (!daily || !Array.isArray(daily.time) || daily.time.length === 0) return null;

  const idx = options.dayTarget === 'tomorrow' && daily.time.length > 1 ? 1 : 0;
  const minRaw = Number(daily.temperature_2m_min?.[idx]);
  const maxRaw = Number(daily.temperature_2m_max?.[idx]);
  if (!Number.isFinite(minRaw) || !Number.isFinite(maxRaw)) return null;

  const tempMin = Math.round(minRaw) || 0;
  const tempMax = Math.round(maxRaw) || 0;
  const avgTemp = Math.round(tempMin * 0.45 + tempMax * 0.55) || 0;
  const diurnalSwing = tempMax - tempMin;

  const dailyCode = Number(daily.weather_code?.[idx] ?? 1);
  const cur = options.dayTarget === 'today' && json.current && typeof json.current === 'object'
    ? json.current
    : null;
  const currentTemp =
    cur && Number.isFinite(Number(cur.temperature_2m))
      ? Math.round(Number(cur.temperature_2m)) || 0
      : undefined;
  const currentWeatherCode =
    cur && Number.isFinite(Number(cur.weather_code))
      ? Number(cur.weather_code)
      : undefined;
  const currentWindSpeed =
    cur && Number.isFinite(Number(cur.wind_speed_10m))
      ? Math.round(Number(cur.wind_speed_10m))
      : undefined;
  const currentHumidity =
    cur && Number.isFinite(Number(cur.relative_humidity_2m))
      ? Math.round(Number(cur.relative_humidity_2m))
      : undefined;

  const code = Number.isFinite(currentWeatherCode)
    ? (currentWeatherCode as number)
    : Number.isFinite(dailyCode)
      ? dailyCode
      : 1;
  const condition = weatherCodeToKorean(code);
  const precipProb = Math.round(Number(daily.precipitation_probability_max?.[idx] ?? 0));
  const windSpeed = Math.round(Number(daily.wind_speed_10m_max?.[idx] ?? currentWindSpeed ?? 10));
  const humidity = currentHumidity ?? (precipProb >= 50 ? 78 : 50);

  const isRainy =
    precipProb >= 45 ||
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    code >= 95;
  const isSnowy = (code >= 71 && code <= 77) || code === 85 || code === 86;
  const isWindy = windSpeed >= 22;

  const dayLabelKo = options.dayTarget === 'tomorrow' ? '내일' : '오늘';
  let weatherTip = '';
  if (isRainy) {
    weatherTip = `${dayLabelKo} 비 소식(${precipProb}%)이 있습니다. 밝은 밑단 바지나 스웨이드 슈즈는 피하고 발수 아우터·가죽 슈즈 위주로 준비하세요.`;
  } else if (isWindy) {
    weatherTip = `강한 바람(풍속 ${windSpeed}km/h)이 예보되어 있습니다. 바람을 막아주는 트렌치·오버코트와 머플러 레이어드를 추천합니다.`;
  } else if (diurnalSwing >= 9) {
    weatherTip = `${dayLabelKo} 최저(${tempMin}°C)와 최고(${tempMax}°C) 기온 차가 ${diurnalSwing}°C로 큽니다. 얇은 이너 위에 탈착하기 좋은 아우터가 필수입니다.`;
  } else if (avgTemp <= 4) {
    weatherTip = `${dayLabelKo}은 평균 ${avgTemp}°C로 쌀쌀합니다. 캐시미어·울 니트와 머플러·장갑 레이어드로 체온을 지켜 주세요.`;
  } else {
    weatherTip = `${dayLabelKo} ${options.cityName} 기온은 ${tempMin}°C ~ ${tempMax}°C로 활동하기 쾌적합니다.`;
  }

  return {
    cityKey: options.cityKey,
    cityName: options.cityName,
    latitude: options.lat,
    longitude: options.lon,
    date: daily.time[idx] || new Date().toISOString().slice(0, 10),
    dayTarget: options.dayTarget,
    scenarioKey: 'live',
    condition,
    weatherCode: code,
    tempMin,
    tempMax,
    avgTemp,
    tempC: currentTemp ?? avgTemp,
    ...(currentTemp !== undefined ? { currentTemp } : {}),
    ...(currentWeatherCode !== undefined ? { currentWeatherCode } : {}),
    ...(currentWindSpeed !== undefined ? { currentWindSpeed } : {}),
    diurnalSwing,
    precipProb,
    windSpeed,
    humidity,
    sunrise: typeof daily.sunrise?.[idx] === 'string' ? daily.sunrise[idx] : null,
    sunset: typeof daily.sunset?.[idx] === 'string' ? daily.sunset[idx] : null,
    shortwaveRadiationSum: Number.isFinite(Number(daily.shortwave_radiation_sum?.[idx]))
      ? Number(daily.shortwave_radiation_sum?.[idx])
      : undefined,
    cloudCover:
      cur && Number.isFinite(Number(cur.cloud_cover))
        ? Math.round(Number(cur.cloud_cover))
        : undefined,
    visibilityM:
      cur && Number.isFinite(Number(cur.visibility))
        ? Math.round(Number(cur.visibility))
        : undefined,
    directRadiation:
      cur && Number.isFinite(Number(cur.direct_radiation))
        ? Math.round(Number(cur.direct_radiation))
        : undefined,
    diffuseRadiation:
      cur && Number.isFinite(Number(cur.diffuse_radiation))
        ? Math.round(Number(cur.diffuse_radiation))
        : undefined,
    currentPrecipitation:
      cur && Number.isFinite(Number(cur.precipitation))
        ? Number(cur.precipitation)
        : undefined,
    isDay: cur && (cur.is_day === 0 || cur.is_day === 1) ? Boolean(cur.is_day) : undefined,
    isRainy,
    isRaining: isRainy,
    isSnowy,
    isWindy,
    isSimulated: false,
    fallbackUsed: false,
    weatherUnavailable: false,
    recommendedMotion: inferWeatherMotion(code, precipProb, windSpeed, condition),
    summary: weatherTip,
    weatherTip,
  };
}

/**
 * Fetches live forecast data directly from Open-Meteo (public, keyless, CORS-enabled).
 * Used as a fast browser-side rescue when the Express backend is cold-starting on Render
 * or when the server's upstream Open-Meteo fetch degraded to local fallback values.
 */
export async function fetchDirectOpenMeteoWeather(
  options: DirectOpenMeteoOptions
): Promise<DirectOpenMeteoWeather | null> {
  if (typeof fetch !== 'function') return null;
  if (!Number.isFinite(options.lat) || !Number.isFinite(options.lon)) return null;

  const cacheKey = `${options.lat.toFixed(2)},${options.lon.toFixed(2)}:${options.dayTarget}`;
  const cached = directWeatherCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < DIRECT_WEATHER_TTL_MS) {
    return {
      ...cached.data,
      cityKey: options.cityKey,
      cityName: options.cityName,
    };
  }

  try {
    const url = buildOpenMeteoForecastUrl(options.lat, options.lon);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), DIRECT_OPEN_METEO_TIMEOUT_MS)
      : null;
    try {
      const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
      if (!res.ok) return null;
      const json = await res.json();
      const parsed = parseOpenMeteoForecastPayload(json, options);
      if (!parsed) return null;
      directWeatherCache.set(cacheKey, { fetchedAt: Date.now(), data: parsed });
      return parsed;
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch {
    return null;
  }
}
