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

  // Indoor / Cyberpunk Neon Fixture Metadata & Physical Lamp Illumination
  indoorNightFixture: NightFixtureKind | 'none';
  nightFixtureWeight: number;
  /** 0..1.45 physical lamp/neon glow intensity for visible background fixtures (0 = off / natural outdoor) */
  fixtureOnFactor: number;
  /** Resolved lamp filament/LED/neon color hex for physical fixture emitters */
  fixtureHex: number;
  /** True for cyberpunk neon stages with per-emitter chromatic signage */
  isNeonScene: boolean;

  // Ground Contact Shadow, Dual-Fixture Fill Shadow & Floor Light Pool Controls
  shadowOffsetX: number;
  shadowOffsetZ: number;
  shadowStretchX: number;
  shadowStretchZ: number;
  shadowOpacityScale: number;
  /** Grounded shoe-sole Contact AO multiplier (stays subtle even when lights are OFF so model stays grounded) */
  contactAoScale: number;
  /** Directional projected silhouette cast shadow multiplier (strictly 0 when unlit at night / windowless / neon 0%) */
  castShadowScale: number;
  /** Strictly decoupled Natural Daylight / Window Sun cast shadow channel (NEVER drifts with artificial lamp dimmer) */
  naturalShadowDirX: number;
  naturalShadowDirZ: number;
  naturalShadowLengthScale: number;
  naturalShadowOpacity: number;
  naturalShadowDirectRatio: number;
  /** Strictly decoupled Artificial Fixture cast shadow channel (fixed direction per room rig; opacity scales with dimmer only) */
  fixtureShadowDirX: number;
  fixtureShadowDirZ: number;
  fixtureShadowLengthScale: number;
  fixtureShadowOpacity: number;
  fixtureShadowDirectRatio: number;
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
  backdropSaturate: number;
  backdropTintRgba: string;
  nightFixtureGlowCss: string;
  characterRimDropShadow: string;
  /** Environmental luminance sync for 2D character image (0.84 unlit dark room -> 1.0 lit) */
  characterAmbientBrightness: number;
  /** Left-side chromatic light color (0xRRGGBB) for Three.js GLSL character relighting */
  characterLeftRimHex: number;
  /** Right-side chromatic light color (0xRRGGBB) for Three.js GLSL character relighting */
  characterRightRimHex: number;
  /** Soft environmental shadow/ambient color tint (0xRRGGBB) for Three.js GLSL character relighting */
  characterAmbientTintHex: number;
  /** Normalized 0..1 relighting intensity (vivid on cyberpunk neon, subtle on bright daylight) */
  characterRelightStrength: number;
  /** Floor bounce uplight color (0xRRGGBB) reflected onto shoes & lower trousers */
  characterFloorBounceHex: number;
  /** Floor bounce uplight intensity (0..1) */
  characterFloorBounceStrength: number;
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
  rigNoteKo: '낮 좌측 시어 커튼 채광 · 일몰 후 2900K 매입 간접등 점등',
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

    const outdoorRig = bgItem.lightingRig;
    const isOutdoorNeon = Boolean(
      outdoorRig?.isNeonScene &&
        outdoorRig?.fixtureEmitters &&
        outdoorRig.fixtureEmitters.length > 0
    );
    const clampedOutdoorScale = clamp(intensityScale, 0, 1);
    // Zero-continuous perceptual dimmer curves (no abrupt 0% -> 5% floor jump)
    const outdoorNeonDimmer =
      clampedOutdoorScale <= 0.001 ? 0 : Math.pow(clampedOutdoorScale, 1.08);
    const outdoorAmbientDimmer =
      clampedOutdoorScale <= 0.001 ? 0 : Math.pow(clampedOutdoorScale, 1.12);

    const primaryNeonHex = outdoorRig?.nightKelvinHex ?? keyHex;
    const secondaryNeonHex = outdoorRig?.secondaryKelvinHex ?? primaryNeonHex;

    if (isOutdoorNeon && preset === 'auto') {
      keyHex = lerpRgbHex(keyHex, primaryNeonHex, 0.76);
      rimHex = secondaryNeonHex;
      skyHex = lerpRgbHex(skyHex, primaryNeonHex, 0.44);
      groundHex = lerpRgbHex(groundHex, secondaryNeonHex, 0.38);
      fogHex = lerpRgbHex(0x10182b, primaryNeonHex, 0.16);
      backdropTintRgba =
        clampedOutdoorScale <= 0.001
          ? 'rgba(8, 12, 22, 0.24)'
          : `rgba(${hexToRgbTriplet(primaryNeonHex)}, ${(0.12 * outdoorAmbientDimmer).toFixed(3)})`;
    }

    const keyIntensity = isOutdoorNeon
      ? keyIntensityBase * (clampedOutdoorScale <= 0.001 ? 0 : outdoorAmbientDimmer)
      : keyIntensityBase * intensityScale;
    const hemiIntensity = hemiIntensityBase * (0.35 + 0.65 * intensityScale);
    const rimEdgePx = Math.round(clamp(-solarStageX * 1.4, -5, 5));
    const rimAlpha = clamp(0.2 * intensityScale * (0.5 + optics.directRatio * 0.5), 0, 0.36);
    const characterRimDropShadow = isOutdoorNeon
      ? clampedOutdoorScale > 0.001
        ? `drop-shadow(-3px -1px 7px rgba(${hexToRgbTriplet(preset === 'auto' ? primaryNeonHex : rimHex)}, ${(0.28 * outdoorAmbientDimmer).toFixed(3)})) drop-shadow(3px -1px 7px rgba(${hexToRgbTriplet(preset === 'auto' ? secondaryNeonHex : keyHex)}, ${(0.26 * outdoorAmbientDimmer).toFixed(3)}))`
        : 'drop-shadow(0 0 0 rgba(0, 0, 0, 0))'
      : rimAlpha > 0.005
        ? `drop-shadow(${rimEdgePx}px -1px 6px rgba(${hexToRgbTriplet(rimHex)}, ${rimAlpha.toFixed(3)}))`
        : 'drop-shadow(0 0 0 rgba(0, 0, 0, 0))';

    const backdropBrightness = isOutdoorNeon
      ? clamp(0.36 + 0.62 * outdoorAmbientDimmer, 0.34, 1.0)
      : clamp(
          (isDark ? 0.86 : 1.0) * (0.76 + 0.24 * intensityScale) * (optics.regime === 'bright_fog' ? 1.04 : 1),
          0.52,
          1.28
        );
    const backdropSaturate = isOutdoorNeon
      ? clamp(0.42 + 0.72 * outdoorNeonDimmer, 0.4, 1.16)
      : 1.0;

    const outdoorFixtureOnFactor = isOutdoorNeon
      ? clampedOutdoorScale <= 0.001
        ? 0
        : clamp((0.68 + nightWeight * 0.18) * outdoorNeonDimmer, 0, 0.92)
      : 0;
    const outdoorFixtureHex =
      isOutdoorNeon && preset === 'auto' ? primaryNeonHex : keyHex;
    const outdoorFloorPoolStrength =
      isOutdoorNeon && clampedOutdoorScale > 0.001
        ? clamp(0.32 * outdoorAmbientDimmer, 0, 0.36)
        : 0;
    const outdoorNightGlowCss =
      isOutdoorNeon && clampedOutdoorScale > 0.001
        ? `radial-gradient(ellipse 62% 46% at 24% 44%, rgba(${hexToRgbTriplet(preset === 'auto' ? primaryNeonHex : keyHex)}, ${(0.12 * outdoorAmbientDimmer).toFixed(3)}) 0%, transparent 72%), radial-gradient(ellipse 62% 46% at 76% 44%, rgba(${hexToRgbTriplet(preset === 'auto' ? secondaryNeonHex : rimHex)}, ${(0.12 * outdoorAmbientDimmer).toFixed(3)}) 0%, transparent 72%)`
        : 'none';

    // 2-channel shadows: subtle grounded shoe Contact AO stays present when unlit,
    // while directional Cast Shadow drops strictly to 0 on unlit outdoor cyberpunk night scenes.
    const outdoorNeonDaylightCast = isOutdoorNeon
      ? clamp((1 - nightWeight) * optics.directRatio * 0.45, 0, 0.45)
      : 0;
    const outdoorCastShadowScale = isOutdoorNeon
      ? clamp(Math.max(outdoorNeonDaylightCast, 0.92 * outdoorAmbientDimmer), 0, 1.05)
      : solar.isPostSunset
        ? clamp(0.18 * clampedOutdoorScale, 0, 0.28)
        : clamp(shadowOpacityScale * (0.4 + 0.6 * clampedOutdoorScale), 0.16, 1.12);
    const outdoorContactAoScale = isOutdoorNeon
      ? clamp(0.44 + 0.56 * Math.max(outdoorNeonDaylightCast, outdoorAmbientDimmer), 0.42, 1.0)
      : clamp(0.62 + 0.38 * clampedOutdoorScale, 0.58, 1.0);
    const outdoorEffectiveShadowScale = isOutdoorNeon
      ? clamp(0.44 + 0.58 * outdoorAmbientDimmer, 0.42, 1.05)
      : shadowOpacityScale;
    const outdoorCharacterBrightness = isOutdoorNeon
      ? clamp(0.84 + 0.16 * Math.max((1 - nightWeight) * 0.65, outdoorAmbientDimmer), 0.84, 1.0)
      : clamp(0.88 + 0.12 * (1 - nightWeight * 0.42 * (1 - clampedOutdoorScale)), 0.86, 1.0);

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
      keyPosX: isOutdoorNeon ? -1.85 : solar.isPostSunset ? 1.4 : solarStageX,
      keyPosY: isOutdoorNeon ? 2.75 : solar.isPostSunset ? 4.4 : solarStageY,
      keyPosZ: isOutdoorNeon ? 1.15 : solar.isPostSunset ? 2.6 : solarStageZ,
      skyHex,
      groundHex,
      hemiIntensity,
      rimHex,
      rimScale: clamp(0.75 + 0.45 * intensityScale, 0, 1.85),
      fogHex,
      fogDensity,
      directRatio: isOutdoorNeon
        ? clamp(
            Math.max(optics.directRatio, 0.82) *
              (0.9 + 0.1 * Math.max(outdoorNeonDaylightCast, clampedOutdoorScale)),
            0.45,
            1.0
          )
        : optics.directRatio,
      diffuseRatio: optics.diffuseRatio,
      mieScattering: isOutdoorNeon ? Math.max(optics.mieScattering, 0.34) : optics.mieScattering,
      beamVisible: (beamVisible || (isOutdoorNeon && clampedOutdoorScale > 0.05)) && intensityScale > 0.05,
      beamHex: isOutdoorNeon ? outdoorFixtureHex : preset === 'auto' ? beamHexBase : keyHex,
      beamOpacity: clamp(
        (isOutdoorNeon
          ? Math.max(beamOpacityBase, 0.14) * outdoorAmbientDimmer
          : (preset === 'auto' ? beamOpacityBase : Math.max(beamOpacityBase, 0.16)) * intensityScale),
        0,
        0.32
      ),
      beamPosX: isOutdoorNeon ? 0 : clamp(solarStageX * 0.36, -1.25, 1.25),
      beamPosY: 2.35,
      beamPosZ: -0.22,
      beamTiltZ: isOutdoorNeon ? 0.08 : beamTiltZ,
      beamScaleX: optics.regime === 'sunshower' ? 2.35 : 2.05,
      beamScaleY: 3.8,
      hazeVisible: (hazeVisible || (isOutdoorNeon && clampedOutdoorScale > 0.05)) && intensityScale > 0.05,
      hazeHex: isOutdoorNeon ? (preset === 'auto' ? secondaryNeonHex : skyHex) : preset === 'auto' ? hazeHexBase : skyHex,
      hazeOpacity: clamp(
        (isOutdoorNeon ? Math.max(hazeOpacityBase, 0.15) * outdoorAmbientDimmer : hazeOpacityBase * intensityScale),
        0,
        0.3
      ),
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
      indoorNightFixture: isOutdoorNeon && outdoorRig ? outdoorRig.nightFixture : 'none',
      nightFixtureWeight: nightWeight,
      fixtureOnFactor: outdoorFixtureOnFactor,
      fixtureHex: outdoorFixtureHex,
      isNeonScene: isOutdoorNeon,
      shadowOffsetX: isOutdoorNeon ? 0.16 : shadowOffsetX,
      shadowOffsetZ: isOutdoorNeon ? -0.06 : shadowOffsetZ,
      shadowStretchX,
      shadowStretchZ: isOutdoorNeon ? 0.96 : shadowStretchZ,
      shadowOpacityScale: outdoorEffectiveShadowScale,
      contactAoScale: outdoorContactAoScale,
      castShadowScale: outdoorCastShadowScale,
      naturalShadowDirX: isOutdoorNeon ? 0 : -solarStageX * 0.72 + shadowOffsetX * 1.35,
      naturalShadowDirZ: isOutdoorNeon ? -1 : -solarStageZ * 0.34 + shadowOffsetZ * 0.9,
      naturalShadowLengthScale: isOutdoorNeon
        ? 1
        : clamp(3.9 / Math.max(1.4, solarStageY), 0.68, 1.55) *
          clamp((shadowStretchX + shadowStretchZ) * 0.58, 0.72, 1.58),
      naturalShadowOpacity: isOutdoorNeon ? 0 : outdoorCastShadowScale,
      naturalShadowDirectRatio: optics.directRatio,
      fixtureShadowDirX: isOutdoorNeon ? -(-2.35) * 0.72 + 0.16 * 1.35 : 0,
      fixtureShadowDirZ: isOutdoorNeon ? -1.45 * 0.34 - 0.06 * 0.9 : -1,
      fixtureShadowLengthScale: isOutdoorNeon ? 1.08 : 1,
      fixtureShadowOpacity: isOutdoorNeon ? outdoorCastShadowScale : 0,
      fixtureShadowDirectRatio: isOutdoorNeon ? outdoorRig?.nightDirectRatio ?? 0.84 : 0.75,
      secondaryShadowWeight: isOutdoorNeon && clampedOutdoorScale > 0.001 ? clamp(0.32 * outdoorAmbientDimmer, 0, 0.38) : 0,
      secondaryShadowDirX: isOutdoorNeon ? -0.84 : 0,
      secondaryShadowDirZ: isOutdoorNeon ? -0.54 : -1,
      floorPoolStrength: outdoorFloorPoolStrength,
      floorPoolHex: outdoorFixtureHex,
      wetSpecularBoost: isOutdoorNeon
        ? clamp(Math.max(optics.wetSpecularBoost, 0.58 * outdoorAmbientDimmer), 0, 1)
        : optics.wetSpecularBoost,
      rainSunGlint: optics.rainSunGlint,
      backdropNightDim: isOutdoorNeon ? 0.18 : 0,
      backdropBrightness,
      backdropSaturate,
      backdropTintRgba,
      nightFixtureGlowCss: outdoorNightGlowCss,
      characterRimDropShadow,
      characterAmbientBrightness: outdoorCharacterBrightness,
      characterLeftRimHex: isOutdoorNeon
        ? preset === 'auto'
          ? primaryNeonHex
          : keyHex
        : solarStageX <= 0
          ? keyHex
          : rimHex,
      characterRightRimHex: isOutdoorNeon
        ? preset === 'auto'
          ? secondaryNeonHex
          : rimHex
        : solarStageX > 0
          ? keyHex
          : rimHex,
      characterAmbientTintHex: isOutdoorNeon
        ? lerpRgbHex(primaryNeonHex, secondaryNeonHex, 0.5)
        : skyHex,
      characterRelightStrength: isOutdoorNeon
        ? clamp(0.92 * outdoorAmbientDimmer, 0, 1)
        : clamp((0.16 + nightWeight * 0.24 + (preset !== 'auto' ? 0.16 : 0)) * intensityScale, 0, 0.72),
      characterFloorBounceHex: isOutdoorNeon
        ? lerpRgbHex(primaryNeonHex, secondaryNeonHex, 0.45)
        : groundHex,
      characterFloorBounceStrength: isOutdoorNeon
        ? clamp(0.62 * outdoorAmbientDimmer, 0, 0.75)
        : clamp(0.14 * intensityScale, 0, 0.28),
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
      // Marble pillar alabaster bar sconces + recessed ceiling pin-spots -> crisp dual shadow + warm basalt pool
      nightKeyX = 1.85;
      nightKeyY = 2.65;
      nightKeyZ = 1.05;
      nightBeamX = 0.14;
      nightBeamTiltZ = -0.09;
      nightBeamScaleX = 1.42;
      nightConeStrength = 0.34;
      nightWallWashStrength = 0.2;
      fixtureGlowAnchor = '50% 42%';
      nightShadowStretchZ = 1.08;
      nightSecondaryWeight = 0.34;
      nightSecondaryDirX = 0.82;
      nightSecondaryDirZ = -0.56;
      nightFloorPoolStrength = 0.42;
      break;
    case 'rail-pendant':
      // Twin frosted opal-glass globe pendants + back sconce -> crisp directional shadow & warm terrazzo glow
      nightKeyX = -1.9;
      nightKeyY = 2.75;
      nightKeyZ = 1.15;
      nightBeamX = -0.22;
      nightBeamTiltZ = 0.12;
      nightBeamScaleX = 1.85;
      nightConeStrength = 0.28;
      nightWallWashStrength = 0.22;
      fixtureGlowAnchor = '40% 38%';
      nightShadowStretchZ = 1.04;
      nightSecondaryWeight = 0.3;
      nightSecondaryDirX = -0.76;
      nightSecondaryDirZ = -0.65;
      nightFloorPoolStrength = 0.32;
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
      // Left museum picture lights + right concrete linear wall-washer bars + dual ceiling rails
      nightKeyX = -1.75;
      nightKeyY = 2.95;
      nightKeyZ = 1.25;
      nightBeamX = -0.2;
      nightBeamTiltZ = 0.1;
      nightBeamScaleX = 2.0;
      nightConeStrength = 0.25;
      nightWallWashStrength = 0.24;
      fixtureGlowAnchor = '50% 42%';
      nightShadowStretchZ = 0.94;
      nightSecondaryWeight = 0.34;
      nightSecondaryDirX = -0.82;
      nightSecondaryDirZ = -0.56;
      nightFloorPoolStrength = 0.28;
      break;
    case 'louver-strip-cove':
      // Twin fluted-glass brass dressing sconces + perimeter & shelf indirect coves
      nightKeyX = -1.65;
      nightKeyY = 2.75;
      nightKeyZ = 0.85;
      nightBeamX = 0;
      nightBeamScaleX = 2.15;
      nightConeStrength = 0.22;
      nightWallWashStrength = 0.26;
      fixtureGlowAnchor = '50% 40%';
      nightShadowStretchZ = 0.92;
      nightSecondaryWeight = 0.32;
      nightSecondaryDirX = -0.84;
      nightSecondaryDirZ = -0.54;
      nightFloorPoolStrength = 0.28;
      break;
    case 'arch-uplight':
      // Alabaster travertine torch sconces + arch vault globe pendant + rear niche grazing uplights
      nightKeyX = -1.65;
      nightKeyY = 2.55;
      nightKeyZ = 0.75;
      nightBeamX = -0.18;
      nightBeamTiltZ = 0.12;
      nightBeamScaleX = 1.85;
      nightConeStrength = 0.26;
      nightWallWashStrength = 0.24;
      fixtureGlowAnchor = '46% 42%';
      nightShadowStretchZ = 1.04;
      nightSecondaryWeight = 0.32;
      nightSecondaryDirX = -0.82;
      nightSecondaryDirZ = -0.56;
      nightFloorPoolStrength = 0.3;
      break;
    case 'cyber-neon-runway':
    case 'cyber-neon-plaza':
      // High-contrast cyberpunk dual opposing neon portals/pylons -> vivid chromatic dual shadows + neon resin pool
      nightKeyX = -2.25;
      nightKeyY = 2.45;
      nightKeyZ = 0.95;
      nightBeamX = -0.24;
      nightBeamTiltZ = 0.14;
      nightBeamScaleX = 2.15;
      nightConeStrength = 0.2;
      nightWallWashStrength = 0.16;
      fixtureGlowAnchor = '50% 46%';
      nightShadowStretchZ = 1.06;
      nightSecondaryWeight = 0.42;
      nightSecondaryDirX = -0.86;
      nightSecondaryDirZ = -0.5;
      nightFloorPoolStrength = 0.42;
      break;
    case 'cyber-neon-lounge':
    case 'cyber-neon-alley':
      // Multi-color cyberpunk arcade neon walls -> crisp cross-lit chromatic shadows + rich terrazzo floor pool
      nightKeyX = -2.1;
      nightKeyY = 2.35;
      nightKeyZ = 0.85;
      nightBeamX = -0.2;
      nightBeamTiltZ = 0.12;
      nightBeamScaleX = 2.0;
      nightConeStrength = 0.2;
      nightWallWashStrength = 0.16;
      fixtureGlowAnchor = '50% 44%';
      nightShadowStretchZ = 1.04;
      nightSecondaryWeight = 0.4;
      nightSecondaryDirX = -0.88;
      nightSecondaryDirZ = -0.47;
      nightFloorPoolStrength = 0.4;
      break;
    case 'recessed-cove':
    default:
      // Sculptural ribbed paper dome pendant (left) + floor lantern (right) + back ceiling cove
      nightKeyX = -1.75;
      nightKeyY = 2.6;
      nightKeyZ = 0.9;
      nightBeamX = -0.26;
      nightBeamTiltZ = 0.14;
      nightBeamScaleX = 1.9;
      nightConeStrength = 0.25;
      nightWallWashStrength = 0.24;
      fixtureGlowAnchor = '40% 42%';
      nightShadowStretchZ = 0.98;
      nightSecondaryWeight = 0.3;
      nightSecondaryDirX = -0.82;
      nightSecondaryDirZ = -0.56;
      nightFloorPoolStrength = 0.3;
      break;
  }

  const isNeonScene = Boolean(rig.isNeonScene);
  const secondaryNeonHex = rig.secondaryKelvinHex ?? rig.nightKelvinHex;

  // Daytime window sunlight Kelvin: warm golden near sunrise/sunset, crisp 5200K ivory at midday
  const dayWindowHex = isNeonScene
    ? rig.nightKelvinHex
    : isWindowless
      ? 0xfff3de
      : lerpRgbHex(0xfff7ea, 0xffbe7d, solar.goldenHourWeight * 0.78);
  const daySkyFillHex = isNeonScene
    ? secondaryNeonHex
    : isWindowless
      ? 0xf7e7cc
      : 0xe9eff8;

  let keyHex = isNeonScene
    ? rig.nightKelvinHex
    : lerpRgbHex(dayWindowHex, rig.nightKelvinHex, nightWeight);
  let skyHex = isNeonScene
    ? secondaryNeonHex
    : lerpRgbHex(daySkyFillHex, rig.nightKelvinHex, nightWeight * 0.82);
  let groundHex = isNeonScene
    ? lerpRgbHex(0x161426, secondaryNeonHex, 0.28)
    : lerpRgbHex(0x4d453c, 0x332920, nightWeight);
  let rimHex = isNeonScene
    ? secondaryNeonHex
    : lerpRgbHex(dayWindowHex, rig.nightKelvinHex, nightWeight);
  let fogHex = isNeonScene
    ? lerpRgbHex(0x121020, rig.nightKelvinHex, 0.16)
    : lerpRgbHex(0x2d2823, 0x1c1713, nightWeight);

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
  const beamOpacityBase = isNeonScene
    ? nightConeStrength
    : dayWeight * dayShaftStrength + nightWeight * nightConeStrength;
  const beamPosX = isNeonScene
    ? nightBeamX
    : dayWeight * clamp(dayKeyX * 0.28, -0.85, 0.85) + nightWeight * nightBeamX;
  const beamTiltZ = isNeonScene
    ? nightBeamTiltZ
    : dayWeight * clamp((dayKeyX / 3.2) * 0.34, -0.38, 0.38) + nightWeight * nightBeamTiltZ;
  const beamScaleX = isNeonScene
    ? nightBeamScaleX
    : dayWeight * 1.85 + nightWeight * nightBeamScaleX;

  // Wall-wash / ambient glow behind character rises after sunset when room lamps turn on
  const hazeOpacityBase = isNeonScene
    ? nightWallWashStrength
    : dayWeight * 0.06 + nightWeight * nightWallWashStrength;

  // Physical lamp power factor calibrated for ~3x stronger luminous output at 100% while
  // keeping 0% strictly OFF (0) and maintaining smooth monotonic dimmer progression.
  const hasVisibleFixtures = Boolean(rig.fixtureEmitters && rig.fixtureEmitters.length > 0);
  const daytimeFixtureBase = isNeonScene
    ? 0.94
    : isWindowless
      ? 0.92
      : preset !== 'auto' && preset !== 'daylight'
        ? 0.88
        : isDark
          ? 0.86
          : 0.8;
  const nightFixtureCeiling = isNeonScene ? 1.0 : 0.98;
  const rawFixtureOn = hasVisibleFixtures
    ? dayWeight * daytimeFixtureBase + nightWeight * nightFixtureCeiling
    : 0;
  // Zero-continuous perceptual 0%..100% dimmer curves (eliminates the abrupt 0% -> 5% floor jump)
  const clampedScale = clamp(intensityScale, 0, 1);
  const fixtureDimmerCurve =
    clampedScale <= 0.001 ? 0 : Math.pow(clampedScale, 1.04);
  const ambientDimmerCurve =
    clampedScale <= 0.001 ? 0 : Math.pow(clampedScale, 1.06);
  const fixtureOnFactor =
    clampedScale <= 0.001 ? 0 : clamp(rawFixtureOn * fixtureDimmerCurve, 0, 1.0);

  // STRICT PHYSICAL SEPARATION OF NATURAL SUNLIGHT VS ARTIFICIAL FIXTURE SHADOWS:
  // 1) Natural Window Sunlight Shadow (`naturalShadow*`): direction, length & opacity depend SOLELY on
  //    solar ephemeris, room window aperture, and dayWeight — NEVER altered by the artificial lamp dimmer!
  // 2) Artificial Fixture Shadow (`fixtureShadow*` + `secondaryShadow*`): direction & length stay LOCKED
  //    to the room's physical lamp geometry (`nightKeyX/Y/Z`), while the lamp dimmer scales ONLY opacity!
  // 3) `keyPosX/Y/Z` stays geometrically invariant across 0%..100% lamp dimming (locked to window sun in
  //    daytime windowed rooms, locked to physical lamps at night / windowless / neon rooms) — zero drift!
  const windowLightEnergy =
    isWindowless || isNeonScene
      ? 0
      : clamp(dayWeight * rig.daylightStrength, 0, 1);
  const useDaylightPrimaryAxis = windowLightEnergy > 0.001;
  const keyPosX = useDaylightPrimaryAxis ? dayKeyX : nightKeyX;
  const keyPosY = useDaylightPrimaryAxis ? dayKeyY : nightKeyY;
  const keyPosZ = useDaylightPrimaryAxis ? dayKeyZ : nightKeyZ;

  // Natural Sunlight / Window Shadow Channel (100% invariant to artificial lamp dimmer)
  const natShadowOffsetX = clamp((-dayKeyX / 3.0) * 0.28, -0.34, 0.34);
  const natShadowOffsetZ = clamp((-dayKeyZ / 3.0) * 0.16 + 0.02, -0.22, 0.22);
  const natShadowStretchX = clamp(1.04 + Math.abs(natShadowOffsetX) * 0.72, 0.98, 1.32);
  const natShadowStretchZ = clamp(0.78 + (lowSunStretch - 0.85) * 0.36, 0.72, 1.28);
  const naturalShadowDirX = -dayKeyX * 0.72 + natShadowOffsetX * 1.35;
  const naturalShadowDirZ = -dayKeyZ * 0.34 + natShadowOffsetZ * 0.9;
  const naturalShadowLengthScale =
    clamp(3.9 / Math.max(1.4, dayKeyY), 0.68, 1.55) *
    clamp((natShadowStretchX + natShadowStretchZ) * 0.58, 0.72, 1.58);
  const naturalShadowOpacity =
    isWindowless || isNeonScene
      ? 0
      : clamp(dayWeight * rig.daylightStrength * 0.66, 0, 0.66);
  const naturalShadowDirectRatio = clamp(Math.max(0.55, rig.daylightStrength), 0.45, 1);

  // Artificial Indoor Fixture Shadow Channel (fixed room fixture angle; dimmer scales opacity ONLY)
  const fixShadowOffsetX = clamp((-nightKeyX / 3.0) * 0.28, -0.34, 0.34);
  const fixShadowOffsetZ = clamp((-nightKeyZ / 3.0) * 0.16 + 0.02, -0.22, 0.22);
  const fixShadowStretchX = clamp(1.04 + Math.abs(fixShadowOffsetX) * 0.72, 0.98, 1.32);
  const fixShadowStretchZ = clamp(nightShadowStretchZ, 0.72, 1.28);
  const fixtureShadowDirX = -nightKeyX * 0.72 + fixShadowOffsetX * 1.35;
  const fixtureShadowDirZ = -nightKeyZ * 0.34 + fixShadowOffsetZ * 0.9;
  const fixtureShadowLengthScale =
    clamp(3.9 / Math.max(1.4, nightKeyY), 0.68, 1.55) *
    clamp((fixShadowStretchX + fixShadowStretchZ) * 0.58, 0.72, 1.58);
  const fixtureCastDominance =
    isWindowless || isNeonScene
      ? isNeonScene
        ? 0.92
        : 0.96
      : clamp(nightWeight * 0.96 + dayWeight * (isDark ? 0.58 : 0.46), 0.42, 0.96);
  const fixtureShadowOpacity =
    clampedScale <= 0.001 ? 0 : clamp(fixtureCastDominance * ambientDimmerCurve, 0, 0.96);
  const fixtureShadowDirectRatio = clamp(nightDirectRatio, 0.45, 1);

  const shadowOffsetX = useDaylightPrimaryAxis ? natShadowOffsetX : fixShadowOffsetX;
  const shadowOffsetZ = useDaylightPrimaryAxis ? natShadowOffsetZ : fixShadowOffsetZ;
  const shadowStretchX = useDaylightPrimaryAxis ? natShadowStretchX : fixShadowStretchX;
  const shadowStretchZ = useDaylightPrimaryAxis ? natShadowStretchZ : fixShadowStretchZ;

  // Legacy aggregate scalar kept monotonic & backward-compatible for unit/telemetry consumers
  const daylightWindowCastBase = naturalShadowOpacity;
  const fixtureCastPower = clamp((isNeonScene ? 0.92 : 0.96) * ambientDimmerCurve, 0, 1);
  const castShadowScale = clamp(Math.max(daylightWindowCastBase, fixtureCastPower), 0, 1.05);
  const contactAoScale = clamp(
    0.42 + 0.58 * Math.max(daylightWindowCastBase, ambientDimmerCurve),
    0.4,
    1.0
  );

  // Direct shadow sharpness stays locked to the active primary physical source geometry
  const litDirectTarget = useDaylightPrimaryAxis ? naturalShadowDirectRatio : fixtureShadowDirectRatio;
  const directRatio = clamp(
    litDirectTarget * (0.9 + 0.1 * Math.max(daylightWindowCastBase, clampedScale)),
    0.45,
    1
  );

  // Opposing secondary fixture shadow (twin wall sconces / colonnade chandeliers / dual gallery tracks / neon walls)
  const secondaryShadowWeight =
    clampedScale <= 0.001
      ? 0
      : clamp(
          nightSecondaryWeight *
            (useDaylightPrimaryAxis ? 0.52 : 1.0) *
            ambientDimmerCurve,
          0,
          0.44
        );

  // Warm / neon fixture spotlight pool on the floor around the character's feet (~3x brighter at 100%)
  const floorPoolStrength =
    clampedScale <= 0.001
      ? 0
      : clamp(
          nightFloorPoolStrength *
            (useDaylightPrimaryAxis ? 0.72 : 1.0) *
            (isNeonScene ? 2.15 : 2.35) *
            ambientDimmerCurve,
          0,
          0.88
        );

  let backdropTintRgba = isNeonScene
    ? clampedScale <= 0.001
      ? 'rgba(8, 10, 20, 0.24)'
      : `rgba(${hexToRgbTriplet(keyHex)}, ${(0.22 * ambientDimmerCurve).toFixed(3)})`
    : clampedScale <= 0.001
      ? `rgba(12, 11, 10, ${(0.08 + nightWeight * 0.1).toFixed(3)})`
      : `rgba(${hexToRgbTriplet(keyHex)}, ${((0.1 + nightWeight * 0.12) * ambientDimmerCurve).toFixed(3)})`;

  if (preset !== 'auto') {
    const pm = getLightingPresetMeta(preset);
    keyHex = pm.keyHex;
    skyHex = pm.skyHex;
    groundHex = pm.groundHex;
    rimHex = pm.rimHex;
    fogHex = lerpRgbHex(fogHex, pm.groundHex, 0.5);
    backdropTintRgba =
      clampedScale <= 0.001
        ? 'rgba(12, 11, 10, 0.14)'
        : `rgba(${pm.tintRgb}, ${clamp(0.22 * ambientDimmerCurve, 0, 0.36).toFixed(3)})`;
  }

  const fixtureHex = preset === 'auto' ? rig.nightKelvinHex : keyHex;
  const floorPoolHex = fixtureHex;

  const keyIntensityBase = dayWeight * (isWindowless ? 2.85 : 3.25) + nightWeight * 3.6;
  const hemiIntensityBase = dayWeight * 1.48 + nightWeight * 1.32;
  const keyIntensity = keyIntensityBase * (clampedScale <= 0.001 ? 0 : ambientDimmerCurve);
  const hemiIntensity = hemiIntensityBase * (0.28 + 1.02 * clampedScale);

  // Selective raw photo dimming after sunset (and breaker-off contrast on cyberpunk scenes),
  // scaling up brightly at 100% (~3x perceived brightness headroom over prior dim 0.76 cap).
  const backdropNightDim =
    preset === 'daylight' || preset === 'cool_gallery'
      ? nightWeight * rig.nightPhotoDim * 0.26
      : preset === 'moonlight'
        ? Math.max(nightWeight * rig.nightPhotoDim * 0.8, 0.24)
        : nightWeight * rig.nightPhotoDim;

  const litContrastAnchor = hasVisibleFixtures && nightWeight > 0.35 ? (isDark ? 0.98 : 1.06) : isDark ? 1.02 : 1.1;
  const backdropBrightness = isNeonScene
    ? clamp(0.36 + 0.92 * ambientDimmerCurve, 0.34, 1.28)
    : clamp(
        litContrastAnchor * (1 - backdropNightDim * 0.42 * (1 - ambientDimmerCurve * 0.65)) * (0.48 + 0.78 * ambientDimmerCurve),
        0.42,
        1.32
      );
  const backdropSaturate = isNeonScene
    ? clamp(0.42 + 0.8 * fixtureDimmerCurve, 0.4, 1.24)
    : clamp(0.92 + 0.14 * ambientDimmerCurve, 0.9, 1.08);

  const fixtureRgb = hexToRgbTriplet(fixtureHex);
  const secondaryRgb = hexToRgbTriplet(preset === 'auto' ? secondaryNeonHex : rimHex);
  const ambientWashScale = isNeonScene ? 0.34 : rig.nightFixture === 'wall-sconce' ? 0.21 : 0.23;
  const fixtureGlowWeight =
    preset === 'auto'
      ? Math.max(nightWeight, hasVisibleFixtures ? fixtureOnFactor * 0.88 : 0)
      : Math.max(nightWeight, 0.72);
  const fixtureGlowAlpha =
    clampedScale <= 0.001
      ? 0
      : clamp(
          fixtureGlowWeight * ambientWashScale * ambientDimmerCurve,
          0,
          isNeonScene ? 0.38 : 0.28
        );
  const nightFixtureGlowCss =
    fixtureGlowAlpha > 0.003
      ? isNeonScene
        ? `radial-gradient(ellipse 68% 54% at 24% 46%, rgba(${fixtureRgb}, ${(fixtureGlowAlpha * 0.96).toFixed(3)}) 0%, transparent 74%), radial-gradient(ellipse 68% 54% at 76% 46%, rgba(${secondaryRgb}, ${(fixtureGlowAlpha * 0.96).toFixed(3)}) 0%, transparent 74%)`
        : `radial-gradient(ellipse 66% 46% at ${fixtureGlowAnchor}, rgba(${fixtureRgb}, ${fixtureGlowAlpha.toFixed(3)}) 0%, rgba(${fixtureRgb}, ${(fixtureGlowAlpha * 0.44).toFixed(3)}) 48%, transparent 82%)`
      : 'none';

  const rimEdgePx = Math.round(clamp(-keyPosX * 1.45, -5, 5));
  const rimAlpha =
    clampedScale <= 0.001
      ? 0
      : clamp((0.36 + (useDaylightPrimaryAxis ? 0.06 : 0.12)) * ambientDimmerCurve, 0, 0.52);
  const characterRimDropShadow =
    clampedScale <= 0.001
      ? 'drop-shadow(0 0 0 rgba(0, 0, 0, 0))'
      : isNeonScene
        ? `drop-shadow(-3px -1px 9px rgba(${fixtureRgb}, ${(0.44 * ambientDimmerCurve).toFixed(3)})) drop-shadow(3px -1px 9px rgba(${secondaryRgb}, ${(0.42 * ambientDimmerCurve).toFixed(3)}))`
        : `drop-shadow(${rimEdgePx}px -1px 8px rgba(${hexToRgbTriplet(rimHex)}, ${rimAlpha.toFixed(3)}))`;

  // Character environmental luminance sync: natural moody unlit room (0.84) -> luminous 1.18 at 100%
  const characterAmbientBrightness = clamp(
    0.84 + 0.34 * Math.max(daylightWindowCastBase * 0.45, ambientDimmerCurve),
    0.84,
    1.18
  );

  return {
    isOutdoor: false,
    backgroundId: bgItem.id,
    solar,
    opticalRegime: nightWeight >= 0.5 || isNeonScene ? 'indoor_night_fixture' : 'indoor_day_window',
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
    rimScale: clamp(0.65 + 1.15 * clampedScale, 0, 1.95),
    fogHex,
    fogDensity: 0.022,
    directRatio,
    diffuseRatio: 0.68,
    mieScattering: nightWeight * 0.35,
    beamVisible: beamOpacityBase * 1.25 * ambientDimmerCurve > 0.008,
    beamHex: keyHex,
    beamOpacity: clamp(beamOpacityBase * 1.25 * ambientDimmerCurve, 0, 0.46),
    beamPosX,
    beamPosY: 2.38,
    beamPosZ: -0.2,
    beamTiltZ,
    beamScaleX,
    beamScaleY: 3.7,
    hazeVisible: (hazeOpacityBase > 0.08 || preset !== 'auto') && clampedScale > 0.001,
    hazeHex: keyHex,
    hazeOpacity: clamp(
      (preset === 'auto' ? hazeOpacityBase : Math.max(hazeOpacityBase, 0.16)) *
        1.15 *
        ambientDimmerCurve,
      0,
      0.42
    ),
    hazeFocusY: 0.58,
    goboVisible: goboOpacityBase > 0.015,
    goboKind: rig.windowAperture,
    goboHex: dayWindowHex,
    goboOpacity: clamp(goboOpacityBase, 0, 0.34),
    goboPosX,
    goboPosZ,
    goboRotY,
    goboScaleX,
    goboScaleZ,
    indoorNightFixture: rig.nightFixture,
    nightFixtureWeight: nightWeight,
    fixtureOnFactor,
    fixtureHex,
    isNeonScene,
    shadowOffsetX,
    shadowOffsetZ,
    shadowStretchX,
    shadowStretchZ,
    shadowOpacityScale: clamp(
      0.42 + 0.6 * Math.max(daylightWindowCastBase, ambientDimmerCurve),
      0.4,
      1.06
    ),
    contactAoScale,
    castShadowScale,
    naturalShadowDirX,
    naturalShadowDirZ,
    naturalShadowLengthScale,
    naturalShadowOpacity,
    naturalShadowDirectRatio,
    fixtureShadowDirX,
    fixtureShadowDirZ,
    fixtureShadowLengthScale,
    fixtureShadowOpacity,
    fixtureShadowDirectRatio,
    secondaryShadowWeight,
    secondaryShadowDirX: nightSecondaryDirX,
    secondaryShadowDirZ: nightSecondaryDirZ,
    floorPoolStrength,
    floorPoolHex,
    wetSpecularBoost: isNeonScene ? clamp(0.64 * ambientDimmerCurve, 0, 0.78) : 0,
    rainSunGlint: 0,
    backdropNightDim,
    backdropBrightness,
    backdropSaturate,
    backdropTintRgba,
    nightFixtureGlowCss,
    characterRimDropShadow,
    characterAmbientBrightness,
    characterLeftRimHex: isNeonScene
      ? fixtureHex
      : keyPosX <= 0
        ? keyHex
        : rimHex,
    characterRightRimHex: isNeonScene
      ? preset === 'auto'
        ? secondaryNeonHex
        : rimHex
      : keyPosX > 0
        ? keyHex
        : rimHex,
    characterAmbientTintHex: isNeonScene
      ? lerpRgbHex(fixtureHex, preset === 'auto' ? secondaryNeonHex : rimHex, 0.52)
      : lerpRgbHex(skyHex, fixtureHex, nightWeight * 0.6),
    characterRelightStrength: isNeonScene
      ? clamp(1.0 * ambientDimmerCurve, 0, 1)
      : clamp(
          (0.32 + nightWeight * 0.42 + (preset !== 'auto' ? 0.2 : 0)) *
            Math.max(daylightWindowCastBase * 0.45, ambientDimmerCurve),
          0,
          0.95
        ),
    characterFloorBounceHex: isNeonScene
      ? lerpRgbHex(floorPoolHex, preset === 'auto' ? secondaryNeonHex : rimHex, 0.42)
      : floorPoolHex,
    characterFloorBounceStrength: isNeonScene
      ? clamp(0.84 * ambientDimmerCurve, 0, 0.94)
      : clamp(floorPoolStrength * 0.72 * ambientDimmerCurve, 0, 0.68),
  };
}
