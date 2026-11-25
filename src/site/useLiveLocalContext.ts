import { useCallback, useEffect, useRef, useState } from 'react';
import type { SiteLang } from './siteContent.ts';

export type LocalContextSource = 'idle' | 'loading' | 'city' | 'unavailable';

export interface LiveLocalContext {
  readonly status: LocalContextSource;
  readonly isLoading: boolean;
  readonly placeLabel: string;
  readonly weatherLabel: string;
  readonly temperatureC: number | null;
  readonly isRainy: boolean;
  readonly errorHint: string | null;
  readonly requestCityWeather: () => void;
}

interface OpenMeteoResponse {
  readonly current?: {
    readonly temperature_2m?: number;
    readonly weather_code?: number;
    readonly precipitation?: number;
  };
}

interface GeoJsResponse {
  readonly latitude?: string;
  readonly longitude?: string;
  readonly city?: string;
  readonly region?: string;
  readonly country?: string;
}

function describeWmoWeather(code: number, lang: SiteLang): { label: string; isRainy: boolean } {
  if (code === 0) {
    return { label: lang === 'ko' ? '맑음' : 'Clear', isRainy: false };
  }
  if (code >= 1 && code <= 3) {
    return { label: lang === 'ko' ? '구름 조금' : 'Partly Cloudy', isRainy: false };
  }
  if (code === 45 || code === 48) {
    return { label: lang === 'ko' ? '안개' : 'Foggy', isRainy: false };
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return { label: lang === 'ko' ? '비' : 'Rain', isRainy: true };
  }
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return { label: lang === 'ko' ? '눈' : 'Snow', isRainy: true };
  }
  if (code >= 95) {
    return { label: lang === 'ko' ? '뇌우 · 비' : 'Storm', isRainy: true };
  }
  return { label: lang === 'ko' ? '흐림' : 'Cloudy', isRainy: false };
}

async function fetchJsonWithTimeout<T>(
  url: string,
  signal: AbortSignal,
  timeoutMs = 5000
): Promise<T | null> {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  signal.addEventListener('abort', onParentAbort, { once: true });
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener('abort', onParentAbort);
  }
}

async function fetchCityWeather(
  lat: number,
  lon: number,
  signal: AbortSignal
): Promise<{ temperatureC: number | null; weatherCode: number | null; isRainy: boolean }> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}` +
    '&current=temperature_2m,weather_code,precipitation&timezone=auto';
  const data = await fetchJsonWithTimeout<OpenMeteoResponse>(url, signal, 5000);
  const tempRaw = data?.current?.temperature_2m;
  const codeRaw = data?.current?.weather_code;
  const precip = data?.current?.precipitation ?? 0;

  const temperatureC =
    typeof tempRaw === 'number' && Number.isFinite(tempRaw) ? Math.round(tempRaw) : null;
  const weatherCode = typeof codeRaw === 'number' ? codeRaw : null;
  const desc = weatherCode !== null ? describeWmoWeather(weatherCode, 'en') : null;
  const isRainy = Boolean(desc?.isRainy) || precip > 0.1;

  return { temperatureC, weatherCode, isRainy };
}

interface InternalLiveState {
  readonly status: LocalContextSource;
  readonly rawPlace: string | null;
  readonly rawWeatherCode: number | null;
  readonly temperatureC: number | null;
  readonly isRainy: boolean;
}

const INITIAL_STATE: InternalLiveState = {
  status: 'idle',
  rawPlace: null,
  rawWeatherCode: null,
  temperatureC: null,
  isRainy: false,
};

/**
 * Privacy-first, zero-permission opt-in city weather lookup.
 * - Fires ZERO network requests on mount and never invokes navigator.geolocation
 *   (honoring `Permissions-Policy: geolocation=()` in `site/public/_headers`).
 * - Only queries coarse IP city + Open-Meteo current weather when explicitly requested.
 */
export function useLiveLocalContext(lang: SiteLang): LiveLocalContext {
  const [state, setState] = useState<InternalLiveState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const requestCityWeather = useCallback(() => {
    if (typeof window === 'undefined' || typeof fetch !== 'function') {
      setState({
        status: 'unavailable',
        rawPlace: null,
        rawWeatherCode: null,
        temperatureC: null,
        isRainy: false,
      });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({
      ...prev,
      status: 'loading',
    }));

    void (async () => {
      const geo = await fetchJsonWithTimeout<GeoJsResponse>(
        'https://get.geojs.io/v1/ip/geo.json',
        controller.signal,
        4500
      );
      if (controller.signal.aborted) return;

      const lat = geo?.latitude ? Number.parseFloat(geo.latitude) : Number.NaN;
      const lon = geo?.longitude ? Number.parseFloat(geo.longitude) : Number.NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        setState({
          status: 'unavailable',
          rawPlace: null,
          rawWeatherCode: null,
          temperatureC: null,
          isRainy: false,
        });
        return;
      }

      const weather = await fetchCityWeather(lat, lon, controller.signal);
      if (controller.signal.aborted) return;

      const cityParts = [geo?.city, geo?.region].filter(
        (v, idx, arr): v is string => Boolean(v && v.trim()) && arr.indexOf(v) === idx
      );
      const place = cityParts.slice(0, 2).join(' · ') || geo?.country || null;

      setState({
        status: 'city',
        rawPlace: place,
        rawWeatherCode: weather.weatherCode,
        temperatureC: weather.temperatureC,
        isRainy: weather.isRainy,
      });
    })();
  }, []);

  const placeLabel =
    state.rawPlace ??
    (state.status === 'loading'
      ? lang === 'ko'
        ? '도시 확인 중…'
        : 'Checking city…'
      : lang === 'ko'
        ? '서울 · 명동'
        : 'Seoul · Myeongdong');

  const weatherLabel = (() => {
    if (state.temperatureC !== null && state.rawWeatherCode !== null) {
      const desc = describeWmoWeather(state.rawWeatherCode, lang);
      return `${state.temperatureC}°C · ${desc.label}`;
    }
    if (state.temperatureC !== null) {
      return `${state.temperatureC}°C`;
    }
    if (state.status === 'loading') {
      return lang === 'ko' ? '날씨 조회 중…' : 'Checking weather…';
    }
    return lang === 'ko' ? '실시간 날씨 조회 가능' : 'Opt-in live weather';
  })();

  const errorHint =
    state.status === 'unavailable'
      ? lang === 'ko'
        ? '날씨 서버 연결이 제한되어 기본 서울 프리뷰를 표시합니다.'
        : 'Live weather unavailable — showing Seoul preview.'
      : null;

  return {
    status: state.status,
    isLoading: state.status === 'loading',
    placeLabel,
    weatherLabel,
    temperatureC: state.temperatureC,
    isRainy: state.isRainy,
    errorHint,
    requestCityWeather,
  };
}
