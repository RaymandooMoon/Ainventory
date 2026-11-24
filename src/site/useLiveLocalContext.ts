import { useCallback, useEffect, useRef, useState } from 'react';
import type { SiteLang } from './siteContent.ts';

export type LocalContextSource = 'loading' | 'ip' | 'gps' | 'unavailable';

export interface LiveLocalContext {
  readonly status: LocalContextSource;
  readonly isLocatingGps: boolean;
  readonly placeLabel: string;
  readonly streetLabel: string | null;
  readonly weatherLabel: string;
  readonly temperatureC: number | null;
  readonly isRainy: boolean;
  readonly coords: { readonly lat: number; readonly lon: number } | null;
  readonly errorHint: string | null;
  readonly requestGpsLocation: () => void;
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
}

interface BigDataCloudResponse {
  readonly city?: string;
  readonly locality?: string;
  readonly principalSubdivision?: string;
}

interface NominatimResponse {
  readonly address?: {
    readonly road?: string;
    readonly pedestrian?: string;
    readonly neighbourhood?: string;
    readonly suburb?: string;
    readonly quarter?: string;
    readonly borough?: string;
    readonly city_district?: string;
    readonly city?: string;
    readonly town?: string;
    readonly village?: string;
  };
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

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 5500): Promise<T | null> {
  const controller = new AbortController();
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
  }
}

async function fetchFreeWeather(
  lat: number,
  lon: number
): Promise<{ temperatureC: number | null; weatherCode: number | null; isRainy: boolean }> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    '&current=temperature_2m,weather_code,precipitation&timezone=auto';
  const data = await fetchJsonWithTimeout<OpenMeteoResponse>(url, 5500);
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

async function fetchFreeStreetName(
  lat: number,
  lon: number,
  lang: SiteLang
): Promise<{ placeLabel: string | null; streetLabel: string | null }> {
  const nomUrl =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}` +
    `&zoom=17&accept-language=${lang === 'ko' ? 'ko,en' : 'en'}`;
  const bdcUrl =
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat.toFixed(5)}&longitude=${lon.toFixed(5)}` +
    `&localityLanguage=${lang === 'ko' ? 'ko' : 'en'}`;

  const [nom, bdc] = await Promise.all([
    fetchJsonWithTimeout<NominatimResponse>(nomUrl, 4500),
    fetchJsonWithTimeout<BigDataCloudResponse>(bdcUrl, 4500),
  ]);

  const addr = nom?.address;
  const road = addr?.road ?? addr?.pedestrian ?? null;
  const area =
    addr?.neighbourhood ??
    addr?.quarter ??
    addr?.suburb ??
    addr?.borough ??
    addr?.city_district ??
    bdc?.locality ??
    null;
  const rawCity =
    addr?.city ?? addr?.town ?? addr?.village ?? bdc?.city ?? bdc?.principalSubdivision ?? null;
  const city = rawCity
    ? rawCity.replace(/(특별자치시|특별자치도|특별시|광역시)$/, '')
    : null;

  const parts = [city, area, road].filter(
    (v, idx, arr): v is string => Boolean(v) && arr.indexOf(v) === idx
  );
  if (parts.length >= 2) {
    return {
      placeLabel: `${parts[0]} · ${parts[parts.length - 1]}`,
      streetLabel: road ?? area,
    };
  }
  if (parts.length === 1) {
    return {
      placeLabel: parts[0],
      streetLabel: road ?? area,
    };
  }

  return { placeLabel: null, streetLabel: null };
}

interface InternalLiveState {
  readonly status: LocalContextSource;
  readonly isLocatingGps: boolean;
  readonly coords: { readonly lat: number; readonly lon: number } | null;
  readonly rawPlace: string | null;
  readonly rawStreet: string | null;
  readonly rawWeatherCode: number | null;
  readonly temperatureC: number | null;
  readonly isRainy: boolean;
  readonly errorKind: 'denied' | 'unsupported' | 'timeout' | null;
}

const INITIAL_STATE: InternalLiveState = {
  status: 'loading',
  isLocatingGps: false,
  coords: null,
  rawPlace: null,
  rawStreet: null,
  rawWeatherCode: null,
  temperatureC: null,
  isRainy: false,
  errorKind: null,
};

export function useLiveLocalContext(lang: SiteLang): LiveLocalContext {
  const [state, setState] = useState<InternalLiveState>(INITIAL_STATE);
  const langRef = useRef<SiteLang>(lang);

  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  // Automatic zero-permission free IP city + Open-Meteo live weather lookup on mount
  useEffect(() => {
    let cancelled = false;

    const loadCoarseLocation = async () => {
      const geo = await fetchJsonWithTimeout<GeoJsResponse>(
        'https://get.geojs.io/v1/ip/geo.json',
        4500
      );
      if (cancelled) return;

      const lat = geo?.latitude ? Number.parseFloat(geo.latitude) : Number.NaN;
      const lon = geo?.longitude ? Number.parseFloat(geo.longitude) : Number.NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        setState((prev) => (prev.status === 'gps' ? prev : { ...prev, status: 'unavailable' }));
        return;
      }

      const [weather, street] = await Promise.all([
        fetchFreeWeather(lat, lon),
        fetchFreeStreetName(lat, lon, langRef.current),
      ]);
      if (cancelled) return;

      const fallbackCity = [geo?.city, geo?.region].filter(Boolean).join(' · ') || null;

      setState((prev) => {
        if (prev.status === 'gps') return prev;
        return {
          status: 'ip',
          isLocatingGps: false,
          coords: { lat, lon },
          rawPlace: street.placeLabel ?? fallbackCity,
          rawStreet: street.streetLabel,
          rawWeatherCode: weather.weatherCode,
          temperatureC: weather.temperatureC,
          isRainy: weather.isRainy,
          errorKind: null,
        };
      });
    };

    void loadCoarseLocation();

    return () => {
      cancelled = true;
    };
  }, []);

  // Re-localize resolved street name cleanly when user switches KO <-> EN
  const lat = state.coords?.lat ?? null;
  const lon = state.coords?.lon ?? null;
  useEffect(() => {
    if (lat === null || lon === null) return undefined;
    let cancelled = false;
    void fetchFreeStreetName(lat, lon, lang).then((localized) => {
      if (cancelled || !localized.placeLabel) return;
      setState((prev) => ({
        ...prev,
        rawPlace: localized.placeLabel,
        rawStreet: localized.streetLabel ?? prev.rawStreet,
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lon, lang]);

  // Precise user-triggered GPS + Free OpenStreetMap Street + Open-Meteo Live Weather
  const requestGpsLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        isLocatingGps: false,
        errorKind: 'unsupported',
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      isLocatingGps: true,
      errorKind: null,
    }));

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLat = pos.coords.latitude;
        const nextLon = pos.coords.longitude;
        void (async () => {
          const [street, weather] = await Promise.all([
            fetchFreeStreetName(nextLat, nextLon, langRef.current),
            fetchFreeWeather(nextLat, nextLon),
          ]);
          setState({
            status: 'gps',
            isLocatingGps: false,
            coords: { lat: nextLat, lon: nextLon },
            rawPlace:
              street.placeLabel ?? `${nextLat.toFixed(2)}°, ${nextLon.toFixed(2)}°`,
            rawStreet: street.streetLabel,
            rawWeatherCode: weather.weatherCode,
            temperatureC: weather.temperatureC,
            isRainy: weather.isRainy,
            errorKind: null,
          });
        })();
      },
      (err) => {
        setState((prev) => ({
          ...prev,
          isLocatingGps: false,
          errorKind: err.code === err.PERMISSION_DENIED ? 'denied' : 'timeout',
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 120000,
      }
    );
  }, []);

  const placeLabel =
    state.rawPlace ??
    (state.status === 'loading'
      ? lang === 'ko'
        ? '내 위치 확인 중…'
        : 'Detecting location…'
      : lang === 'ko'
        ? '내 위치 자동 연동'
        : 'Auto Current Location');

  const weatherLabel = (() => {
    if (state.temperatureC !== null && state.rawWeatherCode !== null) {
      const desc = describeWmoWeather(state.rawWeatherCode, lang);
      return `${state.temperatureC}°C · ${desc.label}`;
    }
    if (state.temperatureC !== null) {
      return `${state.temperatureC}°C`;
    }
    if (state.status === 'loading') {
      return lang === 'ko' ? '실시간 날씨 확인 중…' : 'Checking weather…';
    }
    return lang === 'ko' ? '실시간 지역 날씨' : 'Live Local Weather';
  })();

  const errorHint =
    state.errorKind === 'denied'
      ? lang === 'ko'
        ? '위치 권한이 거부되어 현재 IP 기준 지역을 표시합니다.'
        : 'Location permission denied — showing approximate area.'
      : state.errorKind === 'timeout'
        ? lang === 'ko'
          ? '정밀 위치 확인 시간이 초과되었습니다.'
          : 'GPS lookup timed out.'
        : state.errorKind === 'unsupported'
          ? lang === 'ko'
            ? '이 브라우저에서 정밀 위치 기능을 지원하지 않습니다.'
            : 'Geolocation is unavailable in this browser.'
          : null;

  return {
    status: state.status,
    isLocatingGps: state.isLocatingGps,
    placeLabel,
    streetLabel: state.rawStreet,
    weatherLabel,
    temperatureC: state.temperatureC,
    isRainy: state.isRainy,
    coords: state.coords,
    errorHint,
    requestGpsLocation,
  };
}
