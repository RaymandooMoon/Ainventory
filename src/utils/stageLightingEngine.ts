import {
  DEFAULT_LIGHTING_INTENSITY,
  DEFAULT_LIGHTING_PRESET,
  DEFAULT_STAGE_BACKGROUND_ID,
  type IndoorLightingRigSpec,
  type NightFixtureKind,
  type StageBackgroundItem,
  type StageLightingPresetId,
  type WindowApertureKind,
  clampLightingIntensity,
  getLightingPresetMeta,
  getStageBackgroundById,
  normalizeLightingPreset,
} from './stageBackgroundCatalog.ts';

export type OutdoorOpticalRegime =
  | 'clear'
  | 'bright_overcast'
  | 'bright_fog'
  | 'sunshower'
  | 'rain'
  | 'snow'
  | 'wind';

export type StageOpticalRegime = OutdoorOpticalRegime | 'indoor_day_window' | 'indoor_night_fixture';

export interface SolarEphemerisState {
  timestampMs: number;
  dayOfYear: number;
  /** -1 = Northern winter solstice (Dec 21), 0 = equinox, +1 = Northern summer solstice (Jun 21) */
  seasonIndex: number;
  seasonLabel: 'spring' | 'summer' | 'autumn' | 'winter';
  declinationDeg: number;
  altitudeDeg: number;
  azimuthDeg: number;
  sunriseMs: number;
  sunsetMs: number;
  isPostSunset: boolean;
  /** Smooth 0..1 transition: 0 = full daytime, 1 = post-sunset / pre-sunrise night */
  twilightBlend: number;
  /** 0..1 peak around sunrise / sunset golden hour */
  goldenHourWeight: number;
}

export interface WeatherOpticalInput {
  weatherCode?: number;
  code?: number;
  condition?: string;
  conditionKo?: string;
  effectiveWeather?: string;
  mode?: string;
  scenarioKey?: string;
  precipProb?: number;
  currentPrecipitation?: number;
  precipitation?: number;
  windSpeed?: number;
  cloudCover?: number;
  visibilityM?: number;
  directRadiation?: number;
  diffuseRadiation?: number;
  shortwaveRadiationSum?: number;
  sunrise?: string | null;
  sunset?: string | null;
  latitude?: number;
  longitude?: number;
  date?: string;
}

export interface StageLightingFrame {
  isOutdoor: boolean;
  backgroundId: string;
  solar: SolarEphemerisState;
  opticalRegime: StageOpticalRegime;
  preset: StageLightingPresetId;
  intensityPct: number;
  intensityScale: number;

  // 3D Three.js Light Rig Targets
  keyHex: number;
  keyIntensity: number;
  keyPosX: number;
  keyPosY: number;
  keyPosZ: number;
  skyHex: number;
  groundHex: number;
  hemiIntensity: number;
  rimHex: number;
  rimScale: number;
  fogHex: number;
  fogDensity: number;

  // 3-Axis Atmospheric / Architectural Mesh Controls
  directRatio: number;
  diffuseRatio: number;
  mieScattering: number;

  // Volumetric Beam / Fixture Cone (`volumetricBeamMesh`)
  beamVisible: boolean;
  beamHex: number;
  beamOpacity: number;
  beamPosX: number;
  beamPosY: number;
  beamPosZ: number;
  beamTiltZ: number;
  beamScaleX: number;
  beamScaleY: number;

  // Mie Forward-Scattering Haze / Indoor Cove Wall-Wash (`mieHazeMesh`)
  hazeVisible: boolean;
  hazeHex: number;
  hazeOpacity: number;
  hazeFocusY: number;

  // Indoor Daytime Window Gobo Floor Patch (`goboPatchMesh`)
  goboVisible: boolean;
  goboKind: WindowApertureKind;
  goboHex: number;
  goboOpacity: number;
  goboPosX: number;
  goboPosZ: number;
  goboRotY: number;
  goboScaleX: number;
  goboScaleZ: number;

  // Indoor Post-Sunset Fixture Metadata & Physical Lamp Illumination
  indoorNightFixture: NightFixtureKind | 'none';
  nightFixtureWeight: number;
  /** 0..1.45 physical lamp glow intensity for visible background fixtures (0 = off / outdoor) */
  fixtureOnFactor: number;
  /** Resolved lamp filament/LED color hex for physical fixture emitters */
  fixtureHex: number;

  // Ground Contact Shadow, Dual-Fixture Fill Shadow & Floor Light Pool Controls
  shadowOffsetX: number;
  shadowOffsetZ: number;
  shadowStretchX: number;
  shadowStretchZ: number;
  shadowOpacityScale: number;
  secondaryShadowWeight: number;
  secondaryShadowDirX: number;
  secondaryShadowDirZ: number;
  floorPoolStrength: number;
  floorPoolHex: number;
  wetSpecularBoost: number;
  rainSunGlint: number;

  // Backdrop Photo & 2D Character Sync CSS Variables
  backdropNightDim: number;
  backdropBrightness: number;
  backdropTintRgba: string;
  nightFixtureGlowCss: string;
  characterRimDropShadow: string;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const DEFAULT_SEOUL_LAT = 37.5665;
const DEFAULT_SEOUL_LON = 126.978;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function lerpRgbHex(hexA: number, hexB: number, tRaw: number): number {
  const t = clamp(tRaw, 0, 1);
  const rA = (hexA >> 16) & 0xff;
  const gA = (hexA >> 8) & 0xff;
  const bA = hexA & 0xff;
  const rB = (hexB >> 16) & 0xff;
  const gB = (hexB >> 8) & 0xff;
  const bB = hexB & 0xff;
  const r = Math.round(rA + (rB - rA) * t);
  const g = Math.round(gA + (gB - gA) * t);
  const b = Math.round(bA + (bB - bA) * t);
  return (r << 16) | (g << 8) | b;
}

function hexToRgbTriplet(hex: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `${r}, ${g}, ${b}`;
}

function parseIsoTimeInLocalFrame(iso: string | null | undefined, refDate: Date): number | null {
  if (!iso || typeof iso !== 'string') return null;
  const trimmed = iso.trim();
  const hmMatch = /T(\d{2}):(\d{2})/.exec(trimmed);
  if (hmMatch) {
    const hh = Number(hmMatch[1]);
    const mm = Number(hmMatch[2]);
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      const d = new Date(refDate.getTime());
      d.setHours(hh, mm, 0, 0);
      return d.getTime();
    }
  }
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Computes seasonal solar declination, altitude, azimuth, and sunrise/sunset transitions
 * using NOAA solar geometry with graceful Open-Meteo `sunrise`/`sunset` anchoring.
 */
export function computeSolarEphemeris(params: {
  timestampMs?: number;
  latitude?: number;
  longitude?: number;
  sunriseIso?: string | null;
  sunsetIso?: string | null;
} = {}): SolarEphemerisState {
  const timestampMs =
    typeof params.timestampMs === 'number' && Number.isFinite(params.timestampMs)
      ? params.timestampMs
      : Date.now();
  const lat = clamp(
    typeof params.latitude === 'number' && Number.isFinite(params.latitude)
      ? params.latitude
      : DEFAULT_SEOUL_LAT,
    -66,
    66
  );
  const lon = clamp(
    typeof params.longitude === 'number' && Number.isFinite(params.longitude)
      ? params.longitude
      : DEFAULT_SEOUL_LON,
    -180,
    180
  );

  const d = new Date(timestampMs);
  const startOfYear = new Date(d.getFullYear(), 0, 0);
  const dayOfYear = clamp(
    Math.floor((d.getTime() - startOfYear.getTime()) / 86_400_000),
    1,
    366
  );

  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (d.getHours() - 12) / 24);
  // Solar declination in radians (Spencer / NOAA approximation, ±23.44°)
  const declRad =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  const declinationDeg = declRad * RAD2DEG;
  const seasonIndex = clamp(declinationDeg / 23.44, -1, 1);

  const month = d.getMonth() + 1;
  const seasonLabel: SolarEphemerisState['seasonLabel'] =
    month >= 3 && month <= 5
      ? 'spring'
      : month >= 6 && month <= 8
        ? 'summer'
        : month >= 9 && month <= 11
          ? 'autumn'
          : 'winter';

  // Equation of time (minutes)
  const eqTimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  // Estimate timezone offset from local Date (e.g. KST getTimezoneOffset() === -540 -> +9h -> 135° meridian)
  const tzOffsetHours = -d.getTimezoneOffset() / 60;
  const standardMeridianDeg = Math.abs(lon - tzOffsetHours * 15) <= 30 ? tzOffsetHours * 15 : Math.round(lon / 15) * 15;
  const localMinutes = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const trueSolarMinutes = localMinutes + eqTimeMin + 4 * (lon - standardMeridianDeg);
  const hourAngleDeg = trueSolarMinutes / 4 - 180;
  const hourAngleRad = hourAngleDeg * DEG2RAD;
  const latRad = lat * DEG2RAD;

  const sinAlt = clamp(
    Math.sin(latRad) * Math.sin(declRad) +
      Math.cos(latRad) * Math.cos(declRad) * Math.cos(hourAngleRad),
    -1,
    1
  );
  const altRad = Math.asin(sinAlt);
  const altitudeDeg = altRad * RAD2DEG;

  const cosAlt = Math.max(1e-4, Math.cos(altRad));
  const cosAz = clamp(
    (Math.sin(declRad) - Math.sin(latRad) * sinAlt) / (Math.max(1e-4, Math.cos(latRad)) * cosAlt),
    -1,
    1
  );
  const baseAzDeg = Math.acos(cosAz) * RAD2DEG;
  const azimuthDeg = hourAngleDeg > 0 ? (360 - baseAzDeg) % 360 : baseAzDeg;

  // Astronomical sunrise / sunset fallback (zenith 90.833° with atmospheric refraction)
  const cosZenith = Math.cos(90.833 * DEG2RAD);
  const cosHaSunrise = clamp(
    (cosZenith - Math.sin(latRad) * Math.sin(declRad)) /
      Math.max(1e-4, Math.cos(latRad) * Math.cos(declRad)),
    -1,
    1
  );
  const haSunriseDeg = Math.acos(cosHaSunrise) * RAD2DEG;
  const solarNoonMin = 720 - 4 * (lon - standardMeridianDeg) - eqTimeMin;
  const astroSunriseMin = clamp(solarNoonMin - haSunriseDeg * 4, 180, 600);
  const astroSunsetMin = clamp(solarNoonMin + haSunriseDeg * 4, 960, 1320);

  const dayMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  const fallbackSunriseMs = dayMidnight + astroSunriseMin * 60_000;
  const fallbackSunsetMs = dayMidnight + astroSunsetMin * 60_000;

  const sunriseMs = parseIsoTimeInLocalFrame(params.sunriseIso, d) ?? fallbackSunriseMs;
  const sunsetMs = parseIsoTimeInLocalFrame(params.sunsetIso, d) ?? fallbackSunsetMs;

  const isPostSunset = timestampMs >= sunsetMs || timestampMs < sunriseMs;

  // Smooth ±28 min twilight ramp around sunrise & sunset so lights never pop abruptly
  const TWILIGHT_HALF_MS = 28 * 60_000;
  const morningDayFactor = smoothstep(
    sunriseMs - TWILIGHT_HALF_MS,
    sunriseMs + TWILIGHT_HALF_MS,
    timestampMs
  );
  const eveningNightFactor = smoothstep(
    sunsetMs - TWILIGHT_HALF_MS,
    sunsetMs + TWILIGHT_HALF_MS,
    timestampMs
  );
  const daytimeFactor = clamp(morningDayFactor * (1 - eveningNightFactor), 0, 1);
  const twilightBlend = clamp(1 - daytimeFactor, 0, 1);

  const distToSunriseMin = Math.abs(timestampMs - sunriseMs) / 60_000;
  const distToSunsetMin = Math.abs(timestampMs - sunsetMs) / 60_000;
  const nearestHorizonMin = Math.min(distToSunriseMin, distToSunsetMin);
  const goldenHourWeight = clamp(1 - smoothstep(8, 58, nearestHorizonMin), 0, 1);

  return {
    timestampMs,
    dayOfYear,
    seasonIndex,
    seasonLabel,
    declinationDeg,
    altitudeDeg,
    azimuthDeg,
    sunriseMs,
    sunsetMs,
    isPostSunset,
    twilightBlend,
    goldenHourWeight,
  };
}

/**
 * Classifies outdoor composite atmospheric regimes (including Bright Overcast, Bright Fog,
 * and Sunshower / 여우비) and computes 3-axis direct/diffuse/Mie ratios.
 */
export function classifyOutdoorWeatherOptics(
  weather: WeatherOpticalInput | null | undefined,
  solar: SolarEphemerisState
): {
  regime: OutdoorOpticalRegime;
  directRatio: number;
  diffuseRatio: number;
  mieScattering: number;
  godRayStrength: number;
  wetSpecularBoost: number;
  rainSunGlint: number;
} {
  const w = weather || {};
  const code = Number(w.weatherCode ?? w.code ?? -1);
  const condText = `${w.condition || ''} ${w.conditionKo || ''} ${w.effectiveWeather || ''} ${w.mode || ''} ${w.scenarioKey || ''}`.toLowerCase();
  const precipProb = Number.isFinite(Number(w.precipProb)) ? Number(w.precipProb) : 0;
  const currentPrecip = Number.isFinite(Number(w.currentPrecipitation ?? w.precipitation))
    ? Number(w.currentPrecipitation ?? w.precipitation)
    : 0;
  const cloudCover = Number.isFinite(Number(w.cloudCover)) ? Number(w.cloudCover) : undefined;
  const visibilityM = Number.isFinite(Number(w.visibilityM)) ? Number(w.visibilityM) : undefined;
  const directRad = Number.isFinite(Number(w.directRadiation))
    ? Number(w.directRadiation)
    : undefined;
  const diffuseRad = Number.isFinite(Number(w.diffuseRadiation))
    ? Number(w.diffuseRadiation)
    : undefined;
  const windSpeed = Number.isFinite(Number(w.windSpeed)) ? Number(w.windSpeed) : 0;

  const isDaylightSunUp = solar.twilightBlend < 0.72 && solar.altitudeDeg > 2.5;

  const isSnowSignal =
    (code >= 71 && code <= 77) ||
    code === 85 ||
    code === 86 ||
    /눈|대설|진눈깨비|snow|blizzard|sleet/.test(condText);

  const isRainSignal =
    !isSnowSignal &&
    ((code >= 51 && code <= 67) ||
      (code >= 80 && code <= 82) ||
      (code >= 95 && code <= 99) ||
      currentPrecip > 0.08 ||
      precipProb >= 60 ||
      /비|소나기|여우비|장마|뇌우|우천|rain|shower|drizzle|storm/.test(condText));

  const isSunshowerSignal =
    isRainSignal &&
    isDaylightSunUp &&
    (/여우비|sunshower|비 오면서 해|비오면서 해/.test(condText) ||
      (directRad !== undefined && directRad >= 115) ||
      (cloudCover !== undefined && cloudCover <= 68) ||
      ((code === 80 || code === 51 || code === 53) &&
        (cloudCover === undefined ? precipProb <= 68 : cloudCover <= 78)));

  const isFogSignal =
    !isRainSignal &&
    !isSnowSignal &&
    (code === 45 ||
      code === 48 ||
      (visibilityM !== undefined && visibilityM > 0 && visibilityM < 4800) ||
      /안개|박무|연무|해무|fog|mist|haze/.test(condText));

  const isOvercastSignal =
    !isRainSignal &&
    !isSnowSignal &&
    !isFogSignal &&
    (code === 2 ||
      code === 3 ||
      (cloudCover !== undefined && cloudCover >= 65) ||
      (diffuseRad !== undefined &&
        directRad !== undefined &&
        diffuseRad > directRad * 1.15 &&
        diffuseRad >= 85) ||
      /흐림|구름 많음|구름많음|구름 짙|overcast|cloudy/.test(condText));

  const isWindSignal =
    !isRainSignal &&
    !isSnowSignal &&
    (windSpeed >= 24 || /강풍|돌풍|칼바람|한파|wind|gale|coldwave/.test(condText));

  if (isSunshowerSignal) {
    return {
      regime: 'sunshower',
      directRatio: 0.76,
      diffuseRatio: 0.58,
      mieScattering: 0.62,
      godRayStrength: 0.85,
      wetSpecularBoost: 0.92,
      rainSunGlint: 1.0,
    };
  }

  if (isFogSignal && isDaylightSunUp) {
    return {
      regime: 'bright_fog',
      directRatio: 0.24,
      diffuseRatio: 0.88,
      mieScattering: 0.94,
      godRayStrength: 0.28,
      wetSpecularBoost: 0.22,
      rainSunGlint: 0,
    };
  }

  if (isOvercastSignal && isDaylightSunUp) {
    return {
      regime: 'bright_overcast',
      directRatio: 0.22,
      diffuseRatio: 0.95,
      mieScattering: 0.36,
      godRayStrength: 0.08,
      wetSpecularBoost: 0.14,
      rainSunGlint: 0,
    };
  }

  if (isSnowSignal) {
    return {
      regime: 'snow',
      directRatio: 0.28,
      diffuseRatio: 0.86,
      mieScattering: 0.54,
      godRayStrength: 0.12,
      wetSpecularBoost: 0.18,
      rainSunGlint: 0,
    };
  }

  if (isRainSignal) {
    return {
      regime: 'rain',
      directRatio: 0.18,
      diffuseRatio: 0.68,
      mieScattering: 0.48,
      godRayStrength: 0,
      wetSpecularBoost: 0.82,
      rainSunGlint: 0,
    };
  }

  if (isWindSignal) {
    return {
      regime: 'wind',
      directRatio: 0.82,
      diffuseRatio: 0.52,
      mieScattering: 0.16,
      godRayStrength: 0.22,
      wetSpecularBoost: 0.1,
      rainSunGlint: 0,
    };
  }

  // Clear sky — modulated by seasonal irradiance (summer brighter & crisper, winter softer & warmer)
  const seasonalBoost = 0.88 + (solar.seasonIndex + 1) * 0.11; // 0.88 winter .. 1.10 summer
  return {
    regime: 'clear',
    directRatio: clamp(0.92 * seasonalBoost * (1 - solar.twilightBlend * 0.72), 0.18, 1.08),
    diffuseRatio: clamp(0.52 + solar.goldenHourWeight * 0.12, 0.35, 0.74),
    mieScattering: clamp(0.12 + solar.goldenHourWeight * 0.34, 0.08, 0.55),
    godRayStrength: clamp(solar.goldenHourWeight * 0.56, 0, 0.65),
    wetSpecularBoost: 0.08,
    rainSunGlint: 0,
  };
}

const DEFAULT_INDOOR_RIG: IndoorLightingRigSpec = {
  windowAperture: 'left-sheer-curtain',
  windowSide: 'left',
  windowAzimuthDeg: 145,
  daylightStrength: 0.82,
  nightFixture: 'recessed-cove',
  nightKelvinHex: 0xffdcb0,
  nightPhotoDim: 0.27,
  rigNoteKo: '낮 좌측 쉬어 커튼 채광 · 일몰 후 2900K 매입 코브등 점등',
  rigNoteEn: 'Daytime left sheer-curtain sun · Post-sunset 2900K recessed cove',
};

/**
 * Resolves the complete per-frame 3D + CSS lighting state for both Outdoor (`S+/A+/B+`)
 * and Indoor (`S/A/B/C`) architectural stages, then applies optional user preset & brightness overrides.
 */
export function resolveStageLightingFrame(params: {
  backgroundId?: string | null;
  isOutdoor?: boolean;
  weather?: WeatherOpticalInput | null;
  timestampMs?: number;
  lightingPreset?: StageLightingPresetId | string | null;
  lightingIntensity?: number | null;
  theme?: 'light' | 'dark' | string;
}): StageLightingFrame {
  const bgItem: StageBackgroundItem = getStageBackgroundById(
    params.backgroundId || DEFAULT_STAGE_BACKGROUND_ID
  );
  const isOutdoor = typeof params.isOutdoor === 'boolean' ? params.isOutdoor : Boolean(bgItem.isOutdoor);
  const isDark = params.theme === 'dark';

  const solar = computeSolarEphemeris({
    timestampMs: params.timestampMs,
    latitude: params.weather?.latitude,
    longitude: params.weather?.longitude,
    sunriseIso: params.weather?.sunrise,
    sunsetIso: params.weather?.sunset,
  });

  const preset = normalizeLightingPreset(params.lightingPreset ?? DEFAULT_LIGHTING_PRESET);
  const intensityPct =
    params.lightingIntensity === undefined || params.lightingIntensity === null
      ? DEFAULT_LIGHTING_INTENSITY
      : clampLightingIntensity(params.lightingIntensity);
  // 100% -> 1.0x, 0% -> 0.0x, 200% -> 2.0x
  const intensityScale = clamp(intensityPct / 100, 0, 2);

  // Convert solar azimuth (90° = East -> -X stage left, 180° = South -> +Z front, 270° = West -> +X stage right)
  const azRad = ((solar.azimuthDeg - 180) * DEG2RAD);
  const clampedAltDeg = clamp(solar.altitudeDeg, 8, 80);
  const altRad = clampedAltDeg * DEG2RAD;
  const horizDist = Math.cos(altRad) * 4.4;
  const solarStageX = clamp(Math.sin(azRad) * horizDist, -3.6, 3.6);
  const solarStageY = clamp(Math.sin(altRad) * 5.6, 1.35, 6.2);
  const solarStageZ = clamp(2.1 + Math.cos(azRad) * 1.45, 1.1, 3.8);

  if (isOutdoor) {
    const optics = classifyOutdoorWeatherOptics(params.weather, solar);
    const nightWeight = solar.twilightBlend;
    const goldenWeight = solar.goldenHourWeight * (1 - nightWeight * 0.65);

    // Seasonal daylight Kelvin: winter (+warm 4500K `0xffe9cc`) -> summer (crisp 5700K `0xfffbf2`)
    const summerT = (solar.seasonIndex + 1) * 0.5;
    let dayKeyHex = lerpRgbHex(0xffebd0, 0xfffbf4, summerT);
    let daySkyHex = lerpRgbHex(0x8cb4e2, 0xa4ceff, summerT);
    let dayGroundHex = lerpRgbHex(0x494542, 0x454c56, summerT);
    let dayFogHex = lerpRgbHex(0x9ab0cc, 0xb2cce8, summerT);

    if (optics.regime === 'bright_overcast') {
      dayKeyHex = 0xe8f0fc;
      daySkyHex = 0xb8cae0;
      dayGroundHex = 0x525862;
      dayFogHex = 0xc3d0e0;
    } else if (optics.regime === 'bright_fog') {
      dayKeyHex = 0xf5f7fb;
      daySkyHex = 0xdbe3ee;
      dayGroundHex = 0x626872;
      dayFogHex = 0xdce4ef;
    } else if (optics.regime === 'sunshower') {
      dayKeyHex = 0xffdf9e;
      daySkyHex = 0x9bb8dc;
      dayGroundHex = 0x434954;
      dayFogHex = 0xa9bed6;
    } else if (optics.regime === 'rain') {
      dayKeyHex = 0xcfdcf0;
      daySkyHex = 0x7c92b0;
      dayGroundHex = 0x343b46;
      dayFogHex = 0x70829a;
    } else if (optics.regime === 'snow') {
      dayKeyHex = 0xebf3ff;
      daySkyHex = 0xb8cce6;
      dayGroundHex = 0x5c6573;
      dayFogHex = 0xc4d3e6;
    }

    // Blend golden hour & post-sunset moonlight
    const goldenKeyHex = lerpRgbHex(dayKeyHex, 0xffa663, goldenWeight * 0.85);
    const goldenSkyHex = lerpRgbHex(daySkyHex, 0x8290c4, goldenWeight * 0.7);
    let keyHex = lerpRgbHex(goldenKeyHex, 0xb4cbff, nightWeight);
    let skyHex = lerpRgbHex(goldenSkyHex, 0x32456b, nightWeight);
    let groundHex = lerpRgbHex(dayGroundHex, 0x181f2e, nightWeight);
    let fogHex = lerpRgbHex(dayFogHex, 0x1b2436, nightWeight);
    let rimHex = lerpRgbHex(dayKeyHex, 0x9fbaff, nightWeight * 0.8);

    const keyIntensityBase =
      (0.45 + optics.directRatio * 1.45) * (1 - nightWeight * 0.46) + nightWeight * 0.52;
    const hemiIntensityBase =
      (0.48 + optics.diffuseRatio * 0.78) * (1 - nightWeight * 0.42) + nightWeight * 0.36;

    // Seasonal & solar-altitude shadow stretch:
    // Summer high sun (~75°) -> compact centered shadow; Winter low sun (~28°) -> longer oblique shadow
    const cotAlt = clamp(1 / Math.tan(Math.max(14, solar.altitudeDeg) * DEG2RAD), 0.22, 1.65);
    const directCrispness = clamp(optics.directRatio, 0.15, 1);
    const shadowStretchZ =
      solar.isPostSunset
        ? 0.62
        : clamp(0.48 + cotAlt * 0.28 * directCrispness + (1 - directCrispness) * 0.22, 0.48, 1.05);
    const shadowStretchX =
      optics.regime === 'bright_overcast' || optics.regime === 'bright_fog'
        ? 1.24
        : clamp(0.92 + cotAlt * 0.12 * directCrispness, 0.9, 1.22);
    const shadowOffsetX = solar.isPostSunset
      ? 0
      : clamp((-solarStageX / 4.4) * 0.24 * directCrispness, -0.26, 0.26);
    const shadowOffsetZ = solar.isPostSunset
      ? 0.08
      : clamp(0.06 - cotAlt * 0.06 * directCrispness, -0.06, 0.12);
    const shadowOpacityScale =
      optics.regime === 'bright_fog'
        ? 0.62
        : optics.regime === 'bright_overcast'
          ? 0.74
          : clamp(0.78 + optics.directRatio * 0.28, 0.65, 1.15);

    const beamVisible =
      (optics.godRayStrength > 0.14 && nightWeight < 0.78) ||
      (preset !== 'auto' && intensityScale > 0.2);
    const beamTiltZ = clamp((solarStageX / 4.2) * 0.42, -0.45, 0.45);
    const beamHexBase = optics.regime === 'sunshower' ? 0xffe29e : keyHex;
    const beamOpacityBase = clamp(optics.godRayStrength * 0.28, 0, 0.3);

    const hazeVisible = optics.mieScattering > 0.24;
    const hazeHexBase =
      optics.regime === 'bright_fog'
        ? 0xf4f8ff
        : optics.regime === 'sunshower'
          ? 0xffe9ba
          : skyHex;
    const hazeOpacityBase =
      optics.regime === 'bright_fog'
        ? 0.34
        : optics.regime === 'sunshower'
          ? 0.2
          : clamp(optics.mieScattering * 0.22, 0, 0.24);

    const fogDensity =
      optics.regime === 'bright_fog'
        ? 0.095
        : optics.regime === 'rain' || optics.regime === 'snow'
          ? 0.068
          : optics.regime === 'sunshower'
            ? 0.052
            : 0.032;

    let backdropTintRgba =
      optics.regime === 'bright_fog'
        ? 'rgba(238, 244, 252, 0.22)'
        : optics.regime === 'bright_overcast'
          ? 'rgba(218, 230, 246, 0.14)'
          : optics.regime === 'sunshower'
            ? 'rgba(255, 224, 162, 0.18)'
            : `rgba(${hexToRgbTriplet(keyHex)}, ${nightWeight > 0.5 ? 0.1 : 0.08})`;

    // Apply user preset override if not 'auto'
    if (preset !== 'auto') {
      const pm = getLightingPresetMeta(preset);
      keyHex = pm.keyHex;
      skyHex = pm.skyHex;
      groundHex = pm.groundHex;
      rimHex = pm.rimHex;
      fogHex = lerpRgbHex(fogHex, pm.skyHex, 0.65);
      backdropTintRgba = `rgba(${pm.tintRgb}, ${clamp(0.16 * intensityScale, 0, 0.34).toFixed(3)})`;
    }

    const keyIntensity = keyIntensityBase * intensityScale;
    const hemiIntensity = hemiIntensityBase * (0.35 + 0.65 * intensityScale);
    const rimEdgePx = Math.round(clamp(-solarStageX * 1.4, -5, 5));
    const rimAlpha = clamp(0.24 * intensityScale * (0.5 + optics.directRatio * 0.5), 0, 0.42);
    const characterRimDropShadow = `drop-shadow(${rimEdgePx}px -1px 6px rgba(${hexToRgbTriplet(rimHex)}, ${rimAlpha.toFixed(3)}))`;
    const backdropBrightness = clamp(
      (isDark ? 0.86 : 1.0) * (0.76 + 0.24 * intensityScale) * (optics.regime === 'bright_fog' ? 1.04 : 1),
      0.52,
      1.28
    );

    return {
      isOutdoor: true,
      backgroundId: bgItem.id,
      solar,
      opticalRegime: optics.regime,
      preset,
      intensityPct,
      intensityScale,
      keyHex,
      keyIntensity,
      keyPosX: solar.isPostSunset ? 1.4 : solarStageX,
      keyPosY: solar.isPostSunset ? 4.4 : solarStageY,
      keyPosZ: solar.isPostSunset ? 2.6 : solarStageZ,
      skyHex,
      groundHex,
      hemiIntensity,
      rimHex,
      rimScale: clamp(0.75 + 0.45 * intensityScale, 0, 1.85),
      fogHex,
      fogDensity,
      directRatio: optics.directRatio,
      diffuseRatio: optics.diffuseRatio,
      mieScattering: optics.mieScattering,
      beamVisible: beamVisible && intensityScale > 0.05,
      beamHex: preset === 'auto' ? beamHexBase : keyHex,
      beamOpacity: clamp(
        (preset === 'auto' ? beamOpacityBase : Math.max(beamOpacityBase, 0.16)) * intensityScale,
        0,
        0.44
      ),
      beamPosX: clamp(solarStageX * 0.36, -1.25, 1.25),
      beamPosY: 2.35,
      beamPosZ: -0.22,
      beamTiltZ,
      beamScaleX: optics.regime === 'sunshower' ? 2.35 : 2.05,
      beamScaleY: 3.8,
      hazeVisible: hazeVisible && intensityScale > 0.05,
      hazeHex: preset === 'auto' ? hazeHexBase : skyHex,
      hazeOpacity: clamp(hazeOpacityBase * intensityScale, 0, 0.42),
      hazeFocusY: 0.52,
      goboVisible: false,
      goboKind: 'windowless-salon',
      goboHex: keyHex,
      goboOpacity: 0,
      goboPosX: 0,
      goboPosZ: 0.25,
      goboRotY: 0,
      goboScaleX: 1,
      goboScaleZ: 1,
      indoorNightFixture: 'none',
      nightFixtureWeight: nightWeight,
      fixtureOnFactor: 0,
      fixtureHex: keyHex,
      shadowOffsetX,
      shadowOffsetZ,
      shadowStretchX,
      shadowStretchZ,
      shadowOpacityScale,
      secondaryShadowWeight: 0,
      secondaryShadowDirX: 0,
      secondaryShadowDirZ: -1,
      floorPoolStrength: 0,
      floorPoolHex: keyHex,
      wetSpecularBoost: optics.wetSpecularBoost,
      rainSunGlint: optics.rainSunGlint,
      backdropNightDim: 0,
      backdropBrightness,
      backdropTintRgba,
      nightFixtureGlowCss: 'none',
      characterRimDropShadow,
    };
  }

  // =========================================================================
  // INDOOR ARCHITECTURAL LIGHTING (`isOutdoor === false`, 8 curated salons)
  // Daytime: Room-specific window sunlight & moving floor gobo patch
  // Post-Sunset (`solar.twilightBlend -> 1`): Window sun fades out, interior lamps turn ON!
  // =========================================================================
  const rig = bgItem.lightingRig || DEFAULT_INDOOR_RIG;
  const nightWeight = solar.twilightBlend; // 0 = day, 1 = post-sunset
  const dayWeight = 1 - nightWeight;
  const isWindowless = rig.windowAperture === 'windowless-salon' || rig.windowSide === 'none';

  // Azimuth sweep across the day (-1 morning East -> 0 noon South -> +1 late afternoon West)
  const daySweep = clamp((solar.azimuthDeg - 180) / 75, -1, 1);
  const baseSideSign =
    rig.windowSide === 'left' ? -1 : rig.windowSide === 'right' ? 1 : 0;

  // Window key light originates from the room's actual window wall (back-center window casts forward!)
  const dayKeyX = isWindowless
    ? 0.65
    : rig.windowSide === 'overhead'
      ? clamp(daySweep * 1.85 + (Math.abs(daySweep) < 0.18 ? 0.85 : 0), -2.1, 2.1)
      : rig.windowSide === 'center'
        ? clamp(daySweep * 1.65 - 1.15, -2.4, 2.4)
        : clamp(baseSideSign * 2.65 + daySweep * 0.75, -3.2, 3.2);
  const dayKeyY = isWindowless
    ? 3.3
    : rig.windowSide === 'overhead'
      ? 4.4
      : clamp(2.15 + Math.sin(clamp(solar.altitudeDeg, 12, 72) * DEG2RAD) * 2.1, 2.0, 4.3);
  const dayKeyZ = isWindowless
    ? -1.25
    : rig.windowSide === 'center'
      ? -1.65
      : 1.15;

  // Night fixture position, shadow geometry, opposing fill shadow & floor spotlight pool per room
  let nightKeyX = 0;
  let nightKeyY = 3.2;
  let nightKeyZ = 1.35;
  let nightBeamX = 0;
  let nightBeamTiltZ = 0;
  let nightBeamScaleX = 1.65;
  let nightConeStrength = 0.24;
  let nightWallWashStrength = 0.22;
  let fixtureGlowAnchor = '50% 8%';
  let nightDirectRatio =
    typeof rig.nightDirectRatio === 'number' && Number.isFinite(rig.nightDirectRatio)
      ? clamp(rig.nightDirectRatio, 0.2, 1)
      : 0.74;
  let nightShadowStretchZ = 0.86;
  let nightSecondaryWeight = 0;
  let nightSecondaryDirX = 0;
  let nightSecondaryDirZ = -1;
  let nightFloorPoolStrength = 0.22;

  switch (rig.nightFixture) {
    case 'chandelier-arcade':
      // Twin colonnade chandeliers + sconces on left & right arcades -> soft cross-lit shadows
      nightKeyX = -1.65;
      nightKeyY = 3.45;
      nightKeyZ = 1.65;
      nightBeamX = 0;
      nightBeamScaleX = 2.4;
      nightConeStrength = 0.26;
      nightWallWashStrength = 0.26;
      fixtureGlowAnchor = '50% 10%';
      nightShadowStretchZ = 0.88;
      nightSecondaryWeight = 0.36;
      nightSecondaryDirX = -0.78;
      nightSecondaryDirZ = -0.62;
      nightFloorPoolStrength = 0.26;
      break;
    case 'pin-spot':
      // Recessed ceiling pin-spots angled from upper right-front -> crisp museum shadow to left-back + warm basalt pool
      nightKeyX = 1.75;
      nightKeyY = 2.75;
      nightKeyZ = 1.15;
      nightBeamX = 0.14;
      nightBeamTiltZ = -0.09;
      nightBeamScaleX = 1.32;
      nightConeStrength = 0.36;
      nightWallWashStrength = 0.18;
      fixtureGlowAnchor = '52% 8%';
      nightShadowStretchZ = 1.08;
      nightSecondaryWeight = 0.2;
      nightSecondaryDirX = 0.72;
      nightSecondaryDirZ = -0.68;
      nightFloorPoolStrength = 0.42;
      break;
    case 'rail-pendant':
      // Overhead track spotlights slightly left-of-center -> crisp directional shadow to right-back
      nightKeyX = -1.85;
      nightKeyY = 2.85;
      nightKeyZ = 1.25;
      nightBeamX = -0.22;
      nightBeamTiltZ = 0.11;
      nightBeamScaleX = 1.82;
      nightConeStrength = 0.28;
      nightWallWashStrength = 0.22;
      fixtureGlowAnchor = '44% 12%';
      nightShadowStretchZ = 1.04;
      nightSecondaryWeight = 0.22;
      nightSecondaryDirX = -0.64;
      nightSecondaryDirZ = -0.76;
      nightFloorPoolStrength = 0.3;
      break;
    case 'wall-sconce':
      // Brass wall sconces on left & right plaster walls (prominent left sconce visible on mobile!)
      // Primary shadow sweeps clearly right-and-slightly-back across oak parquet; softer opposite sconce fill sweeps left
      nightKeyX = -2.75;
      nightKeyY = 2.2;
      nightKeyZ = 0.65;
      nightBeamX = -0.58;
      nightBeamTiltZ = 0.26;
      nightBeamScaleX = 1.72;
      nightConeStrength = 0.25;
      nightWallWashStrength = 0.26;
      fixtureGlowAnchor = '24% 38%';
      nightShadowStretchZ = 1.15;
      nightSecondaryWeight = 0.36;
      nightSecondaryDirX = -0.92;
      nightSecondaryDirZ = -0.38;
      nightFloorPoolStrength = 0.26;
      break;
    case 'gallery-wall-washer':
      // Parallel left & right ceiling gallery tracks -> clean architectural dual-rail shadow
      nightKeyX = -1.45;
      nightKeyY = 3.55;
      nightKeyZ = 1.55;
      nightBeamX = -0.18;
      nightBeamTiltZ = 0.09;
      nightBeamScaleX = 2.05;
      nightConeStrength = 0.24;
      nightWallWashStrength = 0.26;
      fixtureGlowAnchor = '50% 14%';
      nightShadowStretchZ = 0.88;
      nightSecondaryWeight = 0.32;
      nightSecondaryDirX = -0.74;
      nightSecondaryDirZ = -0.67;
      nightFloorPoolStrength = 0.26;
      break;
    case 'louver-strip-cove':
      // Back alcove & perimeter ceiling coves -> warm forward-projecting soft shadow
      nightKeyX = 0.18;
      nightKeyY = 3.2;
      nightKeyZ = -1.25;
      nightBeamX = 0;
      nightBeamScaleX = 2.25;
      nightConeStrength = 0.2;
      nightWallWashStrength = 0.3;
      fixtureGlowAnchor = '50% 24%';
      nightShadowStretchZ = 0.84;
      nightSecondaryWeight = 0;
      nightFloorPoolStrength = 0.24;
      break;
    case 'arch-uplight':
      // Back travertine arched niche floor uplights (slightly left of center) -> dramatic forward-right shadow
      nightKeyX = -0.95;
      nightKeyY = 2.4;
      nightKeyZ = -1.65;
      nightBeamX = -0.18;
      nightBeamTiltZ = 0.08;
      nightBeamScaleX = 1.9;
      nightConeStrength = 0.25;
      nightWallWashStrength = 0.28;
      fixtureGlowAnchor = '38% 54%';
      nightShadowStretchZ = 1.04;
      nightSecondaryWeight = 0;
      nightFloorPoolStrength = 0.28;
      break;
    case 'recessed-cove':
    default:
      // Back-wall horizontal ceiling cove -> soft forward-left shadow across microcement floor
      nightKeyX = 0.65;
      nightKeyY = 3.2;
      nightKeyZ = -1.35;
      nightBeamX = 0.14;
      nightBeamTiltZ = -0.05;
      nightBeamScaleX = 1.95;
      nightConeStrength = 0.23;
      nightWallWashStrength = 0.25;
      fixtureGlowAnchor = '54% 24%';
      nightShadowStretchZ = 0.86;
      nightSecondaryWeight = 0;
      nightFloorPoolStrength = 0.24;
      break;
  }

  // Daytime window sunlight Kelvin: warm golden near sunrise/sunset, crisp 5200K ivory at midday
  const dayWindowHex = isWindowless
    ? 0xfff3de
    : lerpRgbHex(0xfff7ea, 0xffbe7d, solar.goldenHourWeight * 0.78);
  const daySkyFillHex = isWindowless ? 0xf7e7cc : 0xe9eff8;

  let keyHex = lerpRgbHex(dayWindowHex, rig.nightKelvinHex, nightWeight);
  let skyHex = lerpRgbHex(daySkyFillHex, rig.nightKelvinHex, nightWeight * 0.82);
  let groundHex = lerpRgbHex(0x4d453c, 0x332920, nightWeight);
  let rimHex = lerpRgbHex(dayWindowHex, rig.nightKelvinHex, nightWeight);
  let fogHex = lerpRgbHex(0x2d2823, 0x1c1713, nightWeight);

  // Projected floor window gobo patch (only daytime + rooms that actually have windows)
  const goboOpacityBase = isWindowless
    ? 0
    : clamp(rig.daylightStrength * dayWeight * (0.22 + (1 - solar.goldenHourWeight) * 0.1), 0, 0.34);
  const goboPosX =
    rig.windowSide === 'overhead'
      ? clamp(-daySweep * 0.52, -0.65, 0.65)
      : clamp(-baseSideSign * 0.34 - daySweep * 0.42, -0.88, 0.88);
  const goboPosZ = clamp(0.22 + (1 - clamp(solar.altitudeDeg / 75, 0.15, 1)) * 0.24, 0.16, 0.52);
  const goboRotY = clamp(-daySweep * 0.36 + baseSideSign * 0.14, -0.58, 0.58);
  const lowSunStretch = clamp(1.38 - clamp(solar.altitudeDeg, 12, 72) / 95, 0.82, 1.32);
  const goboScaleX = rig.windowAperture === 'full-glass-mullion' ? 1.32 : 1.08;
  const goboScaleZ = lowSunStretch;

  // Volumetric shaft blends smoothly from daytime window sunbeam -> post-sunset interior fixture cone
  const dayShaftStrength = isWindowless ? 0 : rig.daylightStrength * (0.14 + solar.goldenHourWeight * 0.12);
  const beamOpacityBase = dayWeight * dayShaftStrength + nightWeight * nightConeStrength;
  const beamPosX = dayWeight * clamp(dayKeyX * 0.28, -0.85, 0.85) + nightWeight * nightBeamX;
  const beamTiltZ =
    dayWeight * clamp((dayKeyX / 3.2) * 0.34, -0.38, 0.38) + nightWeight * nightBeamTiltZ;
  const beamScaleX = dayWeight * 1.85 + nightWeight * nightBeamScaleX;

  // Wall-wash / ambient glow behind character rises after sunset when room lamps turn on
  const hazeOpacityBase = dayWeight * 0.06 + nightWeight * nightWallWashStrength;

  // Physical lamp power factor: interior architectural lamps stay genuinely ON whenever lightingIntensity > 0
  // (warm sculptural salon glow in daytime -> full dramatic 2700K-3200K brilliance after sunset / in dark mode).
  const hasVisibleFixtures = Boolean(rig.fixtureEmitters && rig.fixtureEmitters.length > 0);
  const daytimeFixtureBase = isWindowless
    ? 0.9
    : preset !== 'auto' && preset !== 'daylight'
      ? 0.9
      : isDark
        ? 0.86
        : 0.76;
  const rawFixtureOn = hasVisibleFixtures
    ? dayWeight * daytimeFixtureBase + nightWeight * 1.18
    : 0;
  // Smooth perceptual 0%..100% dimmer curve:
  // 0% turns lamps strictly OFF; 10%..100% transitions smoothly from intimate warm glow to full salon brilliance.
  const clampedScale = clamp(intensityScale, 0, 1);
  const fixtureDimmerCurve =
    clampedScale <= 0.001 ? 0 : 0.3 + 0.7 * Math.pow(clampedScale, 0.72);
  const ambientDimmerCurve =
    clampedScale <= 0.001 ? 0 : 0.24 + 0.76 * Math.pow(clampedScale, 0.82);
  const fixtureOnFactor =
    clampedScale <= 0.001 ? 0 : clamp(rawFixtureOn * fixtureDimmerCurve, 0, 1.3);

  // Active key-light position blends daytime window sun + active indoor fixtures
  // (even during daytime, lit salon fixtures noticeably ground the directional cast shadow & floor pool!)
  const fixtureShadowWeight = isWindowless
    ? Math.max(nightWeight, 0.92)
    : clamp(nightWeight + dayWeight * (isDark ? 0.62 : 0.45), 0, 1);
  const windowShadowWeight = 1 - fixtureShadowWeight;
  const keyPosX = windowShadowWeight * dayKeyX + fixtureShadowWeight * nightKeyX;
  const keyPosY = windowShadowWeight * dayKeyY + fixtureShadowWeight * nightKeyY;
  const keyPosZ = windowShadowWeight * dayKeyZ + fixtureShadowWeight * nightKeyZ;

  const shadowOffsetX = clamp((-keyPosX / 3.0) * 0.28, -0.34, 0.34);
  const shadowOffsetZ = clamp((-keyPosZ / 3.0) * 0.16 + 0.02, -0.22, 0.22);
  const shadowStretchX = clamp(1.04 + Math.abs(shadowOffsetX) * 0.72, 0.98, 1.32);
  const shadowStretchZ = clamp(
    windowShadowWeight * (0.78 + (lowSunStretch - 0.85) * 0.36) +
      fixtureShadowWeight * nightShadowStretchZ,
    0.72,
    1.28
  );

  // Direct shadow crispness stays strong whenever physical room lamps are lit!
  const directRatio = clamp(
    windowShadowWeight * Math.max(0.55, rig.daylightStrength) +
      fixtureShadowWeight * nightDirectRatio,
    0.45,
    1
  );

  // Opposing secondary fixture shadow (twin wall sconces / colonnade chandeliers / dual gallery tracks)
  const secondaryShadowWeight =
    clampedScale <= 0.001
      ? 0
      : clamp(fixtureShadowWeight * nightSecondaryWeight * ambientDimmerCurve, 0, 0.52);

  // Warm fixture spotlight pool on the floor around the character's feet (crucial on dark stone floors!)
  const floorPoolStrength =
    clampedScale <= 0.001
      ? 0
      : clamp(
          (fixtureShadowWeight * nightFloorPoolStrength +
            windowShadowWeight * nightFloorPoolStrength * 0.52) *
            ambientDimmerCurve,
          0,
          0.54
        );

  let backdropTintRgba = `rgba(${hexToRgbTriplet(keyHex)}, ${((0.06 + nightWeight * 0.1) * (0.35 + 0.65 * ambientDimmerCurve)).toFixed(3)})`;

  if (preset !== 'auto') {
    const pm = getLightingPresetMeta(preset);
    keyHex = pm.keyHex;
    skyHex = pm.skyHex;
    groundHex = pm.groundHex;
    rimHex = pm.rimHex;
    fogHex = lerpRgbHex(fogHex, pm.groundHex, 0.5);
    backdropTintRgba = `rgba(${pm.tintRgb}, ${clamp(0.14 * ambientDimmerCurve, 0, 0.32).toFixed(3)})`;
  }

  const fixtureHex = preset === 'auto' ? rig.nightKelvinHex : keyHex;
  const floorPoolHex = fixtureHex;

  const keyIntensityBase = dayWeight * (isWindowless ? 1.15 : 1.48) + nightWeight * 1.48;
  const hemiIntensityBase = dayWeight * 0.88 + nightWeight * 0.68;
  const keyIntensity = keyIntensityBase * (clampedScale <= 0.001 ? 0 : ambientDimmerCurve);
  const hemiIntensity = hemiIntensityBase * (0.35 + 0.65 * clampedScale);

  // Selective raw photo dimming after sunset (and slight evening richness even in light mode) so lit
  // lampshades & hourglass wall cones keep unmistakable luminance headroom instead of washing out on pale plaster.
  const backdropNightDim =
    preset === 'daylight' || preset === 'cool_gallery'
      ? nightWeight * rig.nightPhotoDim * 0.35
      : preset === 'moonlight'
        ? Math.max(nightWeight * rig.nightPhotoDim, 0.3)
        : nightWeight * rig.nightPhotoDim;

  const litContrastAnchor = hasVisibleFixtures && nightWeight > 0.35 ? (isDark ? 0.78 : 0.9) : isDark ? 0.84 : 1.0;
  const backdropBrightness = clamp(
    litContrastAnchor * (1 - backdropNightDim * 0.64) * (0.76 + 0.24 * clampedScale),
    0.46,
    1.04
  );

  const fixtureRgb = hexToRgbTriplet(fixtureHex);
  const ambientWashScale = rig.nightFixture === 'wall-sconce' ? 0.24 : 0.28;
  const fixtureGlowWeight =
    preset === 'auto'
      ? Math.max(nightWeight, hasVisibleFixtures ? fixtureOnFactor * 0.48 : 0)
      : Math.max(nightWeight, 0.6);
  const fixtureGlowAlpha =
    clampedScale <= 0.001
      ? 0
      : clamp(fixtureGlowWeight * ambientWashScale * ambientDimmerCurve, 0, 0.36);
  const nightFixtureGlowCss =
    fixtureGlowAlpha > 0.01
      ? `radial-gradient(ellipse 68% 44% at ${fixtureGlowAnchor}, rgba(${fixtureRgb}, ${fixtureGlowAlpha.toFixed(3)}) 0%, rgba(${fixtureRgb}, ${(fixtureGlowAlpha * 0.38).toFixed(3)}) 48%, transparent 82%)`
      : 'none';

  const rimEdgePx = Math.round(clamp(-keyPosX * 1.45, -5, 5));
  const rimAlpha =
    clampedScale <= 0.001
      ? 0
      : clamp((0.22 + fixtureShadowWeight * 0.08) * ambientDimmerCurve, 0, 0.44);
  const characterRimDropShadow = `drop-shadow(${rimEdgePx}px -1px 6px rgba(${hexToRgbTriplet(rimHex)}, ${rimAlpha.toFixed(3)}))`;

  return {
    isOutdoor: false,
    backgroundId: bgItem.id,
    solar,
    opticalRegime: nightWeight >= 0.5 ? 'indoor_night_fixture' : 'indoor_day_window',
    preset,
    intensityPct,
    intensityScale: clampedScale,
    keyHex,
    keyIntensity,
    keyPosX,
    keyPosY,
    keyPosZ,
    skyHex,
    groundHex,
    hemiIntensity,
    rimHex,
    rimScale: clamp(0.65 + 0.55 * clampedScale, 0, 1.35),
    fogHex,
    fogDensity: 0.022,
    directRatio,
    diffuseRatio: 0.68,
    mieScattering: nightWeight * 0.35,
    beamVisible: beamOpacityBase * ambientDimmerCurve > 0.02,
    beamHex: keyHex,
    beamOpacity: clamp(beamOpacityBase * ambientDimmerCurve, 0, 0.42),
    beamPosX,
    beamPosY: 2.38,
    beamPosZ: -0.2,
    beamTiltZ,
    beamScaleX,
    beamScaleY: 3.7,
    hazeVisible: (hazeOpacityBase > 0.08 || preset !== 'auto') && clampedScale > 0.001,
    hazeHex: keyHex,
    hazeOpacity: clamp(
      (preset === 'auto' ? hazeOpacityBase : Math.max(hazeOpacityBase, 0.16)) * ambientDimmerCurve,
      0,
      0.38
    ),
    hazeFocusY: 0.58,
    goboVisible: goboOpacityBase * ambientDimmerCurve > 0.015,
    goboKind: rig.windowAperture,
    goboHex: preset === 'auto' ? dayWindowHex : keyHex,
    goboOpacity: clamp(goboOpacityBase * ambientDimmerCurve, 0, 0.42),
    goboPosX,
    goboPosZ,
    goboRotY,
    goboScaleX,
    goboScaleZ,
    indoorNightFixture: rig.nightFixture,
    nightFixtureWeight: nightWeight,
    fixtureOnFactor,
    fixtureHex,
    shadowOffsetX,
    shadowOffsetZ,
    shadowStretchX,
    shadowStretchZ,
    shadowOpacityScale:
      clampedScale <= 0.001
        ? 0.52
        : clamp(
            (0.86 + fixtureShadowWeight * 0.16) * (0.68 + 0.32 * ambientDimmerCurve),
            0.52,
            1.22
          ),
    secondaryShadowWeight,
    secondaryShadowDirX: nightSecondaryDirX,
    secondaryShadowDirZ: nightSecondaryDirZ,
    floorPoolStrength,
    floorPoolHex,
    wetSpecularBoost: 0,
    rainSunGlint: 0,
    backdropNightDim,
    backdropBrightness,
    backdropTintRgba,
    nightFixtureGlowCss,
    characterRimDropShadow,
  };
}
