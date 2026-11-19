export type BaseStageBackgroundTier = 'S' | 'A' | 'B' | 'C';
export type StageBackgroundTier = 'S+' | 'S' | 'A+' | 'A' | 'B+' | 'B' | 'C';

export type WindowApertureKind =
  | 'overhead-skylight'
  | 'clerestory-slit'
  | 'full-glass-mullion'
  | 'arched-grid-gobo'
  | 'left-sheer-curtain'
  | 'high-clerestory'
  | 'windowless-salon'
  | 'archway-sun';

export type WindowSide = 'left' | 'right' | 'center' | 'overhead' | 'none';

export type NightFixtureKind =
  | 'chandelier-arcade'
  | 'pin-spot'
  | 'rail-pendant'
  | 'wall-sconce'
  | 'recessed-cove'
  | 'gallery-wall-washer'
  | 'louver-strip-cove'
  | 'arch-uplight'
  | 'cyber-neon-plaza'
  | 'cyber-neon-runway'
  | 'cyber-neon-alley'
  | 'cyber-neon-lounge';

export type StageFixtureEmitterKind =
  | 'sconce'
  | 'spot'
  | 'chandelier'
  | 'cove-strip'
  | 'uplight'
  | 'pendant'
  | 'bar-sconce'
  | 'neon-tube'
  | 'neon-sign';

export interface StageFixtureEmitter {
  id: string;
  kind: StageFixtureEmitterKind;
  /** Horizontal center on the raw 3:4 photograph (0..100%) */
  xPct: number;
  /** Vertical center on the raw 3:4 photograph (0..100%) */
  yPct: number;
  /** Optional end coordinates for linear `cove-strip`, `bar-sconce`, or `neon-tube` fixtures (0..100%) */
  x2Pct?: number;
  y2Pct?: number;
  /** Base optical halo radius in % of photo width */
  radiusPct: number;
  /** Relative brightness weight (0.4..1.4) */
  intensity: number;
  /** Optional emitter-specific warm/cool/neon color hex override */
  kelvinHex?: number;
  /** Directional wall/floor light-cone span in % of photo height */
  washSpanPct?: number;
  /** Aim/tilt angle in degrees for directional cones (0 = vertical) */
  tiltDeg?: number;
  /** Optional physical shade or neon-sign width in % of photo width */
  shadeWidthPct?: number;
  /** Optional physical shade or neon-sign height in % of photo height */
  shadeHeightPct?: number;
}

export interface IndoorLightingRigSpec {
  windowAperture: WindowApertureKind;
  windowSide: WindowSide;
  /** Compass azimuth (deg, 180 = South, 135 = SE, 225 = SW) where daylight enters strongest */
  windowAzimuthDeg: number;
  daylightStrength: number;
  nightFixture: NightFixtureKind;
  nightKelvinHex: number;
  /** Optional opposing accent hue for dual-color cyberpunk neon rim/fill lighting */
  secondaryKelvinHex?: number;
  /** Marks cyberpunk/multi-color neon stages so per-emitter neon hues & breaker-off dimming activate */
  isNeonScene?: boolean;
  /** Selective photo exposure reduction (0..0.42) applied after sunset so indoor lamps read warmly */
  nightPhotoDim: number;
  /** Directional shadow crispness (0..1) cast by the room's active indoor lamps */
  nightDirectRatio?: number;
  /** Exact 3:4 photo-space coordinates of visible physical light fixtures to illuminate */
  fixtureEmitters?: readonly StageFixtureEmitter[];
  rigNoteKo: string;
  rigNoteEn: string;
}

export type StageLightingPresetId =
  | 'auto'
  | 'daylight'
  | 'warm_white'
  | 'golden_amber'
  | 'cool_gallery'
  | 'moonlight';

export interface StageLightingPresetMeta {
  id: StageLightingPresetId;
  labelKo: string;
  labelEn: string;
  kelvinLabel: string;
  swatchHex: string;
  keyHex: number;
  skyHex: number;
  groundHex: number;
  rimHex: number;
  tintRgb: string;
}

export const DEFAULT_LIGHTING_PRESET: StageLightingPresetId = 'auto';
export const DEFAULT_LIGHTING_INTENSITY = 100;
export const MIN_LIGHTING_INTENSITY = 0;
export const MAX_LIGHTING_INTENSITY = 100;

export const STAGE_LIGHTING_PRESETS: readonly StageLightingPresetMeta[] = [
  {
    id: 'auto',
    labelKo: '자동 연동',
    labelEn: 'Auto Sync',
    kelvinLabel: 'AUTO',
    swatchHex: '#F3E7CE',
    keyHex: 0xfff4e0,
    skyHex: 0xd8e6fb,
    groundHex: 0x46423d,
    rimHex: 0xf4dcb0,
    tintRgb: '255, 244, 224',
  },
  {
    id: 'daylight',
    labelKo: '자연 주광',
    labelEn: 'Daylight',
    kelvinLabel: '5600K',
    swatchHex: '#FFFDF7',
    keyHex: 0xfffbf2,
    skyHex: 0xc8e0ff,
    groundHex: 0x4b4f56,
    rimHex: 0xffffff,
    tintRgb: '255, 251, 242',
  },
  {
    id: 'warm_white',
    labelKo: '웜화이트',
    labelEn: 'Warm White',
    kelvinLabel: '3000K',
    swatchHex: '#FFE4B8',
    keyHex: 0xffe6be,
    skyHex: 0xf7dcb4,
    groundHex: 0x4c3f33,
    rimHex: 0xffdba4,
    tintRgb: '255, 230, 190',
  },
  {
    id: 'golden_amber',
    labelKo: '골든 앰버',
    labelEn: 'Golden Amber',
    kelvinLabel: '2700K',
    swatchHex: '#FFC278',
    keyHex: 0xffbc6e,
    skyHex: 0xe6a87c,
    groundHex: 0x453228,
    rimHex: 0xffb35c,
    tintRgb: '255, 188, 110',
  },
  {
    id: 'cool_gallery',
    labelKo: '쿨 갤러리',
    labelEn: 'Cool Gallery',
    kelvinLabel: '6500K',
    swatchHex: '#DCEBFF',
    keyHex: 0xe4f0ff,
    skyHex: 0xb6d2f8,
    groundHex: 0x3e4756,
    rimHex: 0xd6e8ff,
    tintRgb: '224, 238, 255',
  },
  {
    id: 'moonlight',
    labelKo: '문라이트',
    labelEn: 'Moonlight',
    kelvinLabel: '4200K',
    swatchHex: '#9EB8F0',
    keyHex: 0xaec6ff,
    skyHex: 0x4a6294,
    groundHex: 0x1e2538,
    rimHex: 0x9ab6f5,
    tintRgb: '166, 194, 255',
  },
] as const;

export interface StageBackgroundItem {
  id: string;
  tier: StageBackgroundTier;
  nameKo: string;
  nameEn: string;
  subtitleKo: string;
  subtitleEn: string;
  imageUrl: string;
  floorToneLight: string;
  floorToneDark: string;
  weight: number;
  isDefaultUnlocked: boolean;
  isOutdoor: boolean;
  lightingRig?: IndoorLightingRigSpec;
}

export const DEFAULT_STAGE_BACKGROUND_ID = 'c_atelier_plaster';
export const STORE_DRAW_COST_I = 10;
export const DUPLICATE_REFUND_I = 5;
export const ATTENDANCE_DAILY_REWARD_I = 10;
export const ATTENDANCE_STREAK_7_BONUS_I = 50;
export const ATTENDANCE_STREAK_30_BONUS_I = 200;

export const DEFAULT_NAV_OPACITY = 0.5;
export const MIN_NAV_OPACITY = 0.15;
export const MAX_NAV_OPACITY = 1.0;

export const ECONOMY_STORAGE_KEY = 'ainventory_stage_economy_v1';
export const NAV_OPACITY_STORAGE_KEY = 'ainventory_nav_opacity_v1';
export const ECONOMY_STATE_EVENT = 'ainventory:economy-updated';
export const NAV_OPACITY_EVENT = 'ainventory:nav-opacity-updated';

export const TIER_DROP_RATES: Record<BaseStageBackgroundTier, number> = {
  S: 3,
  A: 17,
  B: 35,
  C: 45,
};

export const BASE_TIER_ORDER: readonly BaseStageBackgroundTier[] = ['S', 'A', 'B', 'C'] as const;
export const TIER_ORDER: readonly StageBackgroundTier[] = [
  'S+',
  'S',
  'A+',
  'A',
  'B+',
  'B',
  'C',
] as const;

export function getBaseStageTier(tier: StageBackgroundTier | string): BaseStageBackgroundTier {
  const clean = String(tier || 'C')
    .trim()
    .toUpperCase();
  if (clean.startsWith('S')) return 'S';
  if (clean.startsWith('A')) return 'A';
  if (clean.startsWith('B')) return 'B';
  return 'C';
}

export function isPlusStageTier(tier: StageBackgroundTier | string): boolean {
  return String(tier || '').trim().endsWith('+');
}

export function tierToCssSlug(tier: StageBackgroundTier | string): string {
  const clean = String(tier || 'C')
    .trim()
    .toLowerCase();
  return clean.endsWith('+') ? `${clean.slice(0, -1)}-plus` : clean;
}

export const STAGE_BACKGROUNDS: readonly StageBackgroundItem[] = [
  {
    id: 's_grand_paris_atelier',
    tier: 'S',
    nameKo: '파리 오트 쿠튀르 살롱',
    nameEn: 'Grand Paris Atelier',
    subtitleKo: '유리 천창 아케이드 & 헤링본 마블 런웨이',
    subtitleEn: 'Skylight Limestone Arcade & Parquet Runway',
    imageUrl: '/assets/backgrounds/s_grand_paris_atelier.jpg',
    floorToneLight: 'rgba(214, 198, 174, 0.28)',
    floorToneDark: 'rgba(44, 38, 30, 0.42)',
    weight: 1,
    isDefaultUnlocked: false,
    isOutdoor: false,
    lightingRig: {
      windowAperture: 'overhead-skylight',
      windowSide: 'overhead',
      windowAzimuthDeg: 180,
      daylightStrength: 0.92,
      nightFixture: 'chandelier-arcade',
      nightKelvinHex: 0xffd592,
      nightPhotoDim: 0.32,
      nightDirectRatio: 0.78,
      fixtureEmitters: [
        { id: 'paris_ch_fl', kind: 'chandelier', xPct: 15.6, yPct: 49.4, radiusPct: 11.5, intensity: 1.05, washSpanPct: 20, shadeWidthPct: 6.2, shadeHeightPct: 5.2 },
        { id: 'paris_sc_fl', kind: 'sconce', xPct: 11.0, yPct: 55.4, radiusPct: 6.4, intensity: 0.96, washSpanPct: 13, shadeWidthPct: 2.8, shadeHeightPct: 2.1 },
        { id: 'paris_ch_ml', kind: 'chandelier', xPct: 28.5, yPct: 54.4, radiusPct: 8.5, intensity: 1.0, washSpanPct: 16, shadeWidthPct: 3.6, shadeHeightPct: 3.4 },
        { id: 'paris_sc_ml', kind: 'sconce', xPct: 27.6, yPct: 58.6, radiusPct: 4.8, intensity: 0.9, washSpanPct: 10, shadeWidthPct: 1.8, shadeHeightPct: 1.5 },
        { id: 'paris_ch_mr', kind: 'chandelier', xPct: 71.8, yPct: 54.4, radiusPct: 8.5, intensity: 1.0, washSpanPct: 16, shadeWidthPct: 3.6, shadeHeightPct: 3.4 },
        { id: 'paris_sc_mr', kind: 'sconce', xPct: 72.4, yPct: 58.6, radiusPct: 4.8, intensity: 0.9, washSpanPct: 10, shadeWidthPct: 1.8, shadeHeightPct: 1.5 },
        { id: 'paris_ch_fr', kind: 'chandelier', xPct: 84.4, yPct: 49.4, radiusPct: 11.5, intensity: 1.05, washSpanPct: 20, shadeWidthPct: 6.2, shadeHeightPct: 5.2 },
        { id: 'paris_sc_fr', kind: 'sconce', xPct: 89.2, yPct: 55.4, radiusPct: 6.4, intensity: 0.96, washSpanPct: 13, shadeWidthPct: 2.8, shadeHeightPct: 2.1 },
      ],
      rigNoteKo: '낮 천창 아케이드 채광 · 일몰 후 2800K 크리스탈 샹들리에 & 촛대 스콘스 점등',
      rigNoteEn: 'Daytime glass skylight · Post-sunset 2800K crystal chandeliers & brass candle sconces',
    },
  },
  {
    id: 's_cyber_neon_atelier',
    tier: 'S',
    nameKo: '사이버 네온 쿠튀르 랩',
    nameEn: 'Cyber Neon Couture Lab',
    subtitleKo: '바이올렛 · 아이스 시안 · 크림슨 네온 런웨이 홀',
    subtitleEn: 'Violet, Ice-Cyan & Laser-Crimson Neon Runway Hall',
    imageUrl: '/assets/backgrounds/s_cyber_neon_atelier.jpg',
    floorToneLight: 'rgba(66, 48, 110, 0.28)',
    floorToneDark: 'rgba(18, 14, 34, 0.54)',
    weight: 1,
    isDefaultUnlocked: false,
    isOutdoor: false,
    lightingRig: {
      windowAperture: 'windowless-salon',
      windowSide: 'none',
      windowAzimuthDeg: 180,
      daylightStrength: 0,
      nightFixture: 'cyber-neon-runway',
      nightKelvinHex: 0x00f5ff,
      secondaryKelvinHex: 0xa855f7,
      isNeonScene: true,
      nightPhotoDim: 0.24,
      nightDirectRatio: 0.88,
      fixtureEmitters: [
        { id: 'cyber_s_sign_l_top', kind: 'neon-sign', xPct: 20.3, yPct: 33.6, radiusPct: 16, intensity: 1.25, kelvinHex: 0xa855f7, shadeWidthPct: 6.4, shadeHeightPct: 6.6 },
        { id: 'cyber_s_sign_l_outer', kind: 'neon-sign', xPct: 7.1, yPct: 46.8, radiusPct: 16, intensity: 1.2, kelvinHex: 0xa855f7, shadeWidthPct: 7.6, shadeHeightPct: 12.0 },
        { id: 'cyber_s_sign_l_mid', kind: 'neon-sign', xPct: 27.8, yPct: 48.2, radiusPct: 14, intensity: 1.28, kelvinHex: 0x00f5ff, shadeWidthPct: 3.1, shadeHeightPct: 6.8 },
        { id: 'cyber_s_tube_l_diag', kind: 'neon-tube', xPct: 26.0, yPct: 40.0, x2Pct: 29.5, y2Pct: 41.8, radiusPct: 8, intensity: 1.08, kelvinHex: 0x00f5ff, washSpanPct: 14 },
        { id: 'cyber_s_sign_r_mid', kind: 'neon-sign', xPct: 72.1, yPct: 48.2, radiusPct: 14, intensity: 1.28, kelvinHex: 0xff2e63, shadeWidthPct: 3.1, shadeHeightPct: 6.8 },
        { id: 'cyber_s_tube_r_top', kind: 'neon-tube', xPct: 75.0, yPct: 38.8, x2Pct: 85.8, y2Pct: 33.4, radiusPct: 8.5, intensity: 1.12, kelvinHex: 0x00f5ff, washSpanPct: 15 },
        { id: 'cyber_s_portal_l', kind: 'neon-tube', xPct: 20.9, yPct: 44.0, x2Pct: 20.9, y2Pct: 59.8, radiusPct: 8, intensity: 0.96, kelvinHex: 0xd8f8ff, washSpanPct: 14 },
        { id: 'cyber_s_portal_r', kind: 'neon-tube', xPct: 79.1, yPct: 44.0, x2Pct: 79.1, y2Pct: 59.8, radiusPct: 8, intensity: 0.96, kelvinHex: 0xd8f8ff, washSpanPct: 14 },
        { id: 'cyber_s_arch_back', kind: 'neon-sign', xPct: 50.0, yPct: 50.2, radiusPct: 14, intensity: 0.92, kelvinHex: 0x9de8ff, shadeWidthPct: 8.8, shadeHeightPct: 8.2 },
      ],
      rigNoteKo: '실내 사이버 펑크 런웨이 · 일렉트릭 바이올렛 · 시안 · 크림슨 다색 네온 점등',
      rigNoteEn: 'Indoor cyberpunk runway · Electric violet, ice-cyan & laser-crimson neon rig',
    },
  },
  {
    id: 's_palais_royal_outdoor',
    tier: 'S+',
    nameKo: '파리 팔레 루아얄 콜로네이드',
    nameEn: 'Palais-Royal Colonnade Plaza',
    subtitleKo: '날씨 반응형 오픈 스카이 아케이드 & 파리지앵 코트야드',
    subtitleEn: 'Weather-Active Limestone Colonnade & Parisian Courtyard',
    imageUrl: '/assets/backgrounds/s_palais_royal_outdoor.jpg',
    floorToneLight: 'rgba(210, 198, 178, 0.26)',
    floorToneDark: 'rgba(40, 36, 31, 0.44)',
    weight: 0.5,
    isDefaultUnlocked: false,
    isOutdoor: true,
  },
  {
    id: 's_cyber_megacity_plaza',
    tier: 'S+',
    nameKo: '네오 서울 스카이브릿지 플라자',
    nameEn: 'Neo-Seoul Skybridge Plaza',
    subtitleKo: '날씨 반응형 오픈 스카이 & 시안 · 마젠타 · 앰버 네온 스카이브릿지',
    subtitleEn: 'Weather-Active Open-Sky Neon Megacity Skybridge Deck',
    imageUrl: '/assets/backgrounds/s_cyber_megacity_plaza.jpg',
    floorToneLight: 'rgba(34, 68, 92, 0.32)',
    floorToneDark: 'rgba(12, 20, 34, 0.56)',
    weight: 0.5,
    isDefaultUnlocked: false,
    isOutdoor: true,
    lightingRig: {
      windowAperture: 'overhead-skylight',
      windowSide: 'overhead',
      windowAzimuthDeg: 180,
      daylightStrength: 0.4,
      nightFixture: 'cyber-neon-plaza',
      nightKelvinHex: 0x00f0ff,
      secondaryKelvinHex: 0xff2a85,
      isNeonScene: true,
      nightPhotoDim: 0.22,
      nightDirectRatio: 0.86,
      fixtureEmitters: [
        { id: 'cyber_sp_sign_l_top', kind: 'neon-sign', xPct: 23.8, yPct: 42.6, radiusPct: 16, intensity: 1.26, kelvinHex: 0x00f0ff, shadeWidthPct: 6.4, shadeHeightPct: 12.2 },
        { id: 'cyber_sp_sign_l_bot', kind: 'neon-sign', xPct: 23.8, yPct: 51.6, radiusPct: 13, intensity: 1.18, kelvinHex: 0xff2a85, shadeWidthPct: 6.4, shadeHeightPct: 4.1 },
        { id: 'cyber_sp_tube_l_outer', kind: 'neon-tube', xPct: 14.7, yPct: 40.9, x2Pct: 14.7, y2Pct: 52.8, radiusPct: 10, intensity: 1.16, kelvinHex: 0x00f0ff, washSpanPct: 16 },
        { id: 'cyber_sp_tube_l_inner', kind: 'neon-tube', xPct: 33.1, yPct: 42.6, x2Pct: 33.1, y2Pct: 52.6, radiusPct: 9, intensity: 1.1, kelvinHex: 0xffb800, washSpanPct: 14 },
        { id: 'cyber_sp_sign_r_top', kind: 'neon-sign', xPct: 76.0, yPct: 40.4, radiusPct: 15, intensity: 1.26, kelvinHex: 0xff2a85, shadeWidthPct: 6.2, shadeHeightPct: 7.8 },
        { id: 'cyber_sp_sign_r_bot', kind: 'neon-sign', xPct: 76.0, yPct: 49.6, radiusPct: 15, intensity: 1.22, kelvinHex: 0x00f0ff, shadeWidthPct: 6.2, shadeHeightPct: 7.8 },
        { id: 'cyber_sp_tube_r_outer', kind: 'neon-tube', xPct: 85.3, yPct: 40.8, x2Pct: 85.3, y2Pct: 52.8, radiusPct: 10, intensity: 1.18, kelvinHex: 0xffb800, washSpanPct: 16 },
        { id: 'cyber_sp_rail_l', kind: 'neon-tube', xPct: 0.5, yPct: 70.8, x2Pct: 30.8, y2Pct: 59.3, radiusPct: 7.5, intensity: 1.0, kelvinHex: 0xff2a85, washSpanPct: 12 },
        { id: 'cyber_sp_rail_r', kind: 'neon-tube', xPct: 69.2, yPct: 59.3, x2Pct: 99.5, y2Pct: 70.8, radiusPct: 7.5, intensity: 1.0, kelvinHex: 0x00f0ff, washSpanPct: 12 },
      ],
      rigNoteKo: '오픈 스카이 네온 스카이브릿지 · 실시간 기상 연동 & 시안·마젠타·앰버 네온사인 점등',
      rigNoteEn: 'Open-sky neon skybridge · Live weather sync & cyan/magenta/amber neon signage',
    },
  },
  {
    id: 'a_hannam_flagship',
    tier: 'A',
    nameKo: '한남 플래그십 살롱',
    nameEn: 'Hannam Flagship Salon',
    subtitleKo: '다크 마블 필라 · 알라바스터 바 스콘스 & 바살트 쇼룸',
    subtitleEn: 'Charcoal Marble Pillars, Alabaster Bar Sconces & Basalt Floor',
    imageUrl: '/assets/backgrounds/a_hannam_flagship.jpg',
    floorToneLight: 'rgba(54, 56, 62, 0.24)',
    floorToneDark: 'rgba(18, 20, 24, 0.46)',
    weight: 4,
    isDefaultUnlocked: false,
    isOutdoor: false,
    lightingRig: {
      windowAperture: 'clerestory-slit',
      windowSide: 'right',
      windowAzimuthDeg: 205,
      daylightStrength: 0.56,
      nightFixture: 'pin-spot',
      nightKelvinHex: 0xffdca6,
      nightPhotoDim: 0.34,
      nightDirectRatio: 0.88,
      fixtureEmitters: [
        { id: 'hannam_bar_fl', kind: 'bar-sconce', xPct: 9.2, yPct: 30.2, x2Pct: 9.2, y2Pct: 45.8, radiusPct: 8.5, intensity: 1.15, washSpanPct: 22 },
        { id: 'hannam_bar_ml', kind: 'bar-sconce', xPct: 26.0, yPct: 38.2, x2Pct: 26.0, y2Pct: 47.4, radiusPct: 7.2, intensity: 1.2, washSpanPct: 19 },
        { id: 'hannam_bar_bl', kind: 'bar-sconce', xPct: 34.4, yPct: 41.2, x2Pct: 34.4, y2Pct: 48.2, radiusPct: 5.8, intensity: 1.05, washSpanPct: 16 },
        { id: 'hannam_bar_br', kind: 'bar-sconce', xPct: 66.0, yPct: 40.8, x2Pct: 66.0, y2Pct: 48.2, radiusPct: 5.8, intensity: 1.05, washSpanPct: 16 },
        { id: 'hannam_bar_mr', kind: 'bar-sconce', xPct: 75.3, yPct: 36.6, x2Pct: 75.3, y2Pct: 47.0, radiusPct: 7.4, intensity: 1.2, washSpanPct: 19 },
        { id: 'hannam_bar_fr', kind: 'bar-sconce', xPct: 94.4, yPct: 29.0, x2Pct: 94.4, y2Pct: 44.6, radiusPct: 8.5, intensity: 1.15, washSpanPct: 22 },
        { id: 'hannam_f1', kind: 'spot', xPct: 28.3, yPct: 12.4, radiusPct: 8.5, intensity: 0.96, washSpanPct: 34, tiltDeg: 6 },
        { id: 'hannam_f2', kind: 'spot', xPct: 49.6, yPct: 12.4, radiusPct: 9.5, intensity: 1.1, washSpanPct: 38, tiltDeg: 0 },
        { id: 'hannam_f3', kind: 'spot', xPct: 70.5, yPct: 12.4, radiusPct: 8.5, intensity: 0.96, washSpanPct: 34, tiltDeg: -6 },
        { id: 'hannam_m1', kind: 'spot', xPct: 34.4, yPct: 23.0, radiusPct: 7.6, intensity: 1.06, washSpanPct: 36, tiltDeg: 4 },
        { id: 'hannam_m2', kind: 'spot', xPct: 49.7, yPct: 23.0, radiusPct: 8.6, intensity: 1.18, washSpanPct: 40, tiltDeg: 0 },
        { id: 'hannam_m3', kind: 'spot', xPct: 64.7, yPct: 23.0, radiusPct: 7.6, intensity: 1.06, washSpanPct: 36, tiltDeg: -4 },
        { id: 'hannam_r1', kind: 'spot', xPct: 37.7, yPct: 28.6, radiusPct: 6.4, intensity: 0.94, washSpanPct: 30, tiltDeg: 3 },
        { id: 'hannam_r2', kind: 'spot', xPct: 49.9, yPct: 28.6, radiusPct: 7.2, intensity: 1.04, washSpanPct: 34, tiltDeg: 0 },
        { id: 'hannam_r3', kind: 'spot', xPct: 61.7, yPct: 28.6, radiusPct: 6.4, intensity: 0.94, washSpanPct: 30, tiltDeg: -3 },
      ],
      rigNoteKo: '낮 상부 슬릿 채광 · 일몰 후 3000K 마블 필라 바 스콘스 & 핀스팟 점등',
      rigNoteEn: 'Daytime clerestory slit · Post-sunset 3000K marble pillar bar sconces & pin-spots',
    },
  },
  {
    id: 'a_cyber_arcade_lounge',
    tier: 'A',
    nameKo: '사이버 아케이드 부티크',
    nameEn: 'Cyber Arcade Boutique',
    subtitleKo: '코발트 블루 · 로즈 마젠타 · 볼트 라임 네온 피팅 라운지',
    subtitleEn: 'Cobalt Blue, Rose-Magenta & Volt-Lime Neon Fitting Lounge',
    imageUrl: '/assets/backgrounds/a_cyber_arcade_lounge.jpg',
    floorToneLight: 'rgba(54, 48, 84, 0.28)',
    floorToneDark: 'rgba(16, 18, 30, 0.52)',
    weight: 4,
    isDefaultUnlocked: false,
    isOutdoor: false,
    lightingRig: {
      windowAperture: 'windowless-salon',
      windowSide: 'none',
      windowAzimuthDeg: 180,
      daylightStrength: 0,
      nightFixture: 'cyber-neon-lounge',
      nightKelvinHex: 0xf43f8e,
      secondaryKelvinHex: 0x3b82f6,
      isNeonScene: true,
      nightPhotoDim: 0.24,
      nightDirectRatio: 0.86,
      fixtureEmitters: [
        { id: 'cyber_a_ring_l', kind: 'neon-sign', xPct: 14.9, yPct: 33.4, radiusPct: 16, intensity: 1.24, kelvinHex: 0xf43f8e, shadeWidthPct: 7.4, shadeHeightPct: 11.4 },
        { id: 'cyber_a_chev_l', kind: 'neon-sign', xPct: 23.3, yPct: 37.3, radiusPct: 14, intensity: 1.26, kelvinHex: 0xf43f8e, shadeWidthPct: 5.2, shadeHeightPct: 8.6 },
        { id: 'cyber_a_lime_l_diag', kind: 'neon-tube', xPct: 26.8, yPct: 36.2, x2Pct: 30.8, y2Pct: 44.2, radiusPct: 9.5, intensity: 1.18, kelvinHex: 0xc8ff00, washSpanPct: 15 },
        { id: 'cyber_a_cobalt_l', kind: 'neon-tube', xPct: 5.5, yPct: 34.8, x2Pct: 5.5, y2Pct: 63.8, radiusPct: 13, intensity: 1.28, kelvinHex: 0x3b82f6, washSpanPct: 20 },
        { id: 'cyber_a_cobalt_l_mid', kind: 'neon-tube', xPct: 32.1, yPct: 45.2, x2Pct: 32.1, y2Pct: 61.5, radiusPct: 9.5, intensity: 1.16, kelvinHex: 0x3b82f6, washSpanPct: 14 },
        { id: 'cyber_a_center_sign', kind: 'neon-sign', xPct: 50.4, yPct: 45.2, radiusPct: 12, intensity: 1.14, kelvinHex: 0xf43f8e, shadeWidthPct: 10.2, shadeHeightPct: 3.4 },
        { id: 'cyber_a_lime_r_diag', kind: 'neon-tube', xPct: 75.4, yPct: 36.2, x2Pct: 71.2, y2Pct: 48.6, radiusPct: 10, intensity: 1.2, kelvinHex: 0xc8ff00, washSpanPct: 16 },
        { id: 'cyber_a_sign_r', kind: 'neon-sign', xPct: 83.4, yPct: 35.0, radiusPct: 16, intensity: 1.25, kelvinHex: 0xf43f8e, shadeWidthPct: 8.2, shadeHeightPct: 9.6 },
        { id: 'cyber_a_future_r', kind: 'neon-sign', xPct: 82.8, yPct: 44.8, radiusPct: 13, intensity: 1.15, kelvinHex: 0xf43f8e, shadeWidthPct: 11.2, shadeHeightPct: 3.4 },
        { id: 'cyber_a_cobalt_r', kind: 'neon-tube', xPct: 94.3, yPct: 35.0, x2Pct: 94.3, y2Pct: 63.8, radiusPct: 13, intensity: 1.28, kelvinHex: 0x3b82f6, washSpanPct: 20 },
        { id: 'cyber_a_lime_r_vert', kind: 'neon-tube', xPct: 84.7, yPct: 53.0, x2Pct: 84.7, y2Pct: 74.0, radiusPct: 9, intensity: 1.15, kelvinHex: 0xc8ff00, washSpanPct: 14 },
      ],
      rigNoteKo: '실내 사이버 스트리트 부티크 · 코발트·마젠타·라임 멀티 네온 아트 점등',
      rigNoteEn: 'Indoor cyberpunk streetwear boutique · Cobalt, magenta & volt-lime neon art',
    },
  },
  {
    id: 'a_sunset_rooftop',
    tier: 'A+',
    nameKo: '노을 루프탑 테라스',
    nameEn: 'Sunset Rooftop Terrace',
    subtitleKo: '날씨 반응형 골든아워 오픈 스카이 & 슬레이트 테라스',
    subtitleEn: 'Weather-Active Open-Sky Terrace & Slate Floor',
    imageUrl: '/assets/backgrounds/a_sunset_rooftop.jpg',
    floorToneLight: 'rgba(184, 146, 114, 0.22)',
    floorToneDark: 'rgba(48, 36, 32, 0.44)',
    weight: 3,
    isDefaultUnlocked: false,
    isOutdoor: true,
  },
  {
    id: 'a_hannam_terrace_outdoor',
    tier: 'A+',
    nameKo: '한남 갤러리 스카이 테라스',
    nameEn: 'Hannam Sky Terrace',
    subtitleKo: '날씨 반응형 오픈 스카이 정원 & 혼드 그라나이트 데크',
    subtitleEn: 'Weather-Active Courtyard Terrace & Honed Granite Deck',
    imageUrl: '/assets/backgrounds/a_hannam_terrace_outdoor.jpg',
    floorToneLight: 'rgba(174, 178, 184, 0.22)',
    floorToneDark: 'rgba(30, 33, 38, 0.44)',
    weight: 3,
    isDefaultUnlocked: false,
    isOutdoor: true,
  },
  {
    id: 'a_cyber_neon_alley',
    tier: 'A+',
    nameKo: '네온 레인 사이버 골목',
    nameEn: 'Neon Rain Cyber Alley',
    subtitleKo: '날씨 반응형 오픈 스카이 & 민트 · 핫핑크 · 탠저린 네온 블레이드',
    subtitleEn: 'Weather-Active Open-Sky Cyber Alley & Layered Neon Blade Signs',
    imageUrl: '/assets/backgrounds/a_cyber_neon_alley.jpg',
    floorToneLight: 'rgba(42, 68, 72, 0.3)',
    floorToneDark: 'rgba(14, 22, 28, 0.54)',
    weight: 3,
    isDefaultUnlocked: false,
    isOutdoor: true,
    lightingRig: {
      windowAperture: 'overhead-skylight',
      windowSide: 'overhead',
      windowAzimuthDeg: 180,
      daylightStrength: 0.38,
      nightFixture: 'cyber-neon-alley',
      nightKelvinHex: 0x00ffa3,
      secondaryKelvinHex: 0xff3cac,
      isNeonScene: true,
      nightPhotoDim: 0.22,
      nightDirectRatio: 0.84,
      fixtureEmitters: [
        { id: 'cyber_ap_blade_l_mint', kind: 'neon-sign', xPct: 22.3, yPct: 28.6, radiusPct: 17, intensity: 1.28, kelvinHex: 0x00ffa3, shadeWidthPct: 6.6, shadeHeightPct: 26.5 },
        { id: 'cyber_ap_blade_l_pink', kind: 'neon-sign', xPct: 31.3, yPct: 37.2, radiusPct: 14, intensity: 1.24, kelvinHex: 0xff3cac, shadeWidthPct: 4.5, shadeHeightPct: 8.6 },
        { id: 'cyber_ap_blade_l_orange', kind: 'neon-sign', xPct: 38.9, yPct: 47.4, radiusPct: 13, intensity: 1.18, kelvinHex: 0xff5e3a, shadeWidthPct: 2.8, shadeHeightPct: 13.4 },
        { id: 'cyber_ap_awning_l', kind: 'neon-tube', xPct: 15.0, yPct: 48.0, x2Pct: 29.0, y2Pct: 51.0, radiusPct: 9.5, intensity: 1.12, kelvinHex: 0x00ffa3, washSpanPct: 16 },
        { id: 'cyber_ap_blade_r_mint', kind: 'neon-sign', xPct: 73.6, yPct: 28.6, radiusPct: 15, intensity: 1.24, kelvinHex: 0x00ffa3, shadeWidthPct: 7.0, shadeHeightPct: 9.8 },
        { id: 'cyber_ap_blade_r_pink', kind: 'neon-sign', xPct: 61.1, yPct: 44.3, radiusPct: 14, intensity: 1.26, kelvinHex: 0xff3cac, shadeWidthPct: 3.1, shadeHeightPct: 13.8 },
        { id: 'cyber_ap_blade_r_orange', kind: 'neon-sign', xPct: 57.9, yPct: 51.8, radiusPct: 11, intensity: 1.16, kelvinHex: 0xff5e3a, shadeWidthPct: 2.2, shadeHeightPct: 9.2 },
        { id: 'cyber_ap_awning_r', kind: 'neon-tube', xPct: 68.5, yPct: 50.8, x2Pct: 98.5, y2Pct: 40.5, radiusPct: 11, intensity: 1.2, kelvinHex: 0xff5e3a, washSpanPct: 18 },
      ],
      rigNoteKo: '오픈 스카이 네온 골목 · 실시간 날씨 효과 & 민트·핫핑크·탠저린 블레이드 네온',
      rigNoteEn: 'Open-sky cyber alley · Live weather & mint/hot-pink/tangerine blade neon',
    },
  },
  {
    id: 'b_seoul_cafe_terrace',
    tier: 'B',
    nameKo: '성수 글래스 테라스',
    nameEn: 'Seongsu Glass Terrace',
    subtitleKo: '미니멀 통유리 채광 · 오팔 글로브 펜던트 & 테라조',
    subtitleEn: 'Sunlit Floor-to-Ceiling Glass, Opal Globe Pendants & Terrazzo',
    imageUrl: '/assets/backgrounds/b_seoul_cafe_terrace.jpg',
    floorToneLight: 'rgba(164, 166, 170, 0.2)',
    floorToneDark: 'rgba(32, 34, 38, 0.36)',
    weight: 7,
    isDefaultUnlocked: false,
    isOutdoor: false,
    lightingRig: {
      windowAperture: 'full-glass-mullion',
      windowSide: 'right',
      windowAzimuthDeg: 195,
      daylightStrength: 0.96,
      nightFixture: 'rail-pendant',
      nightKelvinHex: 0xffd89e,
      nightPhotoDim: 0.33,
      nightDirectRatio: 0.84,
      fixtureEmitters: [
        { id: 'seongsu_globe_l', kind: 'pendant', xPct: 23.4, yPct: 40.4, radiusPct: 12.0, intensity: 1.22, washSpanPct: 34, shadeWidthPct: 5.5, shadeHeightPct: 4.1 },
        { id: 'seongsu_globe_r', kind: 'pendant', xPct: 58.0, yPct: 40.4, radiusPct: 12.0, intensity: 1.22, washSpanPct: 34, shadeWidthPct: 5.4, shadeHeightPct: 4.1 },
        { id: 'seongsu_wall_sc', kind: 'sconce', xPct: 32.0, yPct: 45.6, radiusPct: 7.5, intensity: 1.12, washSpanPct: 18, shadeWidthPct: 1.8, shadeHeightPct: 3.1 },
        { id: 'seongsu_art_1', kind: 'spot', xPct: 17.2, yPct: 28.9, radiusPct: 6.2, intensity: 0.92, washSpanPct: 22, tiltDeg: 18 },
        { id: 'seongsu_art_2', kind: 'spot', xPct: 21.1, yPct: 31.3, radiusPct: 5.6, intensity: 0.88, washSpanPct: 20, tiltDeg: 16 },
        { id: 'seongsu_f1', kind: 'spot', xPct: 14.4, yPct: 17.5, radiusPct: 7.2, intensity: 0.85, washSpanPct: 22, tiltDeg: 8 },
        { id: 'seongsu_f2', kind: 'spot', xPct: 39.4, yPct: 17.5, radiusPct: 7.8, intensity: 0.92, washSpanPct: 24, tiltDeg: 0 },
        { id: 'seongsu_f3', kind: 'spot', xPct: 64.4, yPct: 17.5, radiusPct: 7.2, intensity: 0.85, washSpanPct: 22, tiltDeg: -6 },
        { id: 'seongsu_m1', kind: 'spot', xPct: 26.1, yPct: 28.1, radiusPct: 6.0, intensity: 0.84, washSpanPct: 20, tiltDeg: 4 },
        { id: 'seongsu_m2', kind: 'spot', xPct: 43.1, yPct: 28.1, radiusPct: 6.4, intensity: 0.9, washSpanPct: 22, tiltDeg: 0 },
        { id: 'seongsu_m3', kind: 'spot', xPct: 59.9, yPct: 28.1, radiusPct: 6.0, intensity: 0.84, washSpanPct: 20, tiltDeg: -4 },
      ],
      rigNoteKo: '낮 통유리 커튼월 주광 · 일몰 후 2900K 오팔 글로브 펜던트 & 월 스콘스 점등',
      rigNoteEn: 'Daytime curtain-wall sunlight · Post-sunset 2900K opal globe pendants & wall sconce',
    },
  },
  {
    id: 'b_brick_courtyard',
    tier: 'B+',
    nameKo: '유럽 브릭 코트야드',
    nameEn: 'European Brick Courtyard',
    subtitleKo: '날씨 반응형 오픈 스카이 중정 & 코블스톤 플라자',
    subtitleEn: 'Weather-Active Brick Arcade & Cobblestone Floor',
    imageUrl: '/assets/backgrounds/b_brick_courtyard.jpg',
    floorToneLight: 'rgba(176, 154, 134, 0.2)',
    floorToneDark: 'rgba(42, 34, 28, 0.38)',
    weight: 7,
    isDefaultUnlocked: false,
    isOutdoor: true,
  },
  {
    id: 'b_minimal_loft_window',
    tier: 'B',
    nameKo: '로프트 아치 윈도우',
    nameEn: 'Minimal Loft Window',
    subtitleKo: '블랙 스틸 아치 창 & 헤링본 오크',
    subtitleEn: 'Steel Arched Window & Oak Parquet',
    imageUrl: '/assets/backgrounds/b_minimal_loft_window.jpg',
    floorToneLight: 'rgba(192, 166, 134, 0.2)',
    floorToneDark: 'rgba(38, 32, 26, 0.38)',
    weight: 7,
    isDefaultUnlocked: false,
    isOutdoor: false,
    lightingRig: {
      windowAperture: 'arched-grid-gobo',
      windowSide: 'center',
      windowAzimuthDeg: 170,
      daylightStrength: 0.98,
      nightFixture: 'wall-sconce',
      nightKelvinHex: 0xffce8c,
      nightPhotoDim: 0.33,
      nightDirectRatio: 0.82,
      fixtureEmitters: [
        { id: 'loft_sc_fl', kind: 'sconce', xPct: 10.38, yPct: 38.0, radiusPct: 8.8, intensity: 1.15, washSpanPct: 21, shadeWidthPct: 3.55, shadeHeightPct: 3.25 },
        { id: 'loft_sc_bl', kind: 'sconce', xPct: 24.22, yPct: 42.65, radiusPct: 7.0, intensity: 1.22, washSpanPct: 17.5, shadeWidthPct: 2.4, shadeHeightPct: 2.45 },
        { id: 'loft_sc_br', kind: 'sconce', xPct: 75.78, yPct: 42.65, radiusPct: 7.0, intensity: 1.18, washSpanPct: 17.5, shadeWidthPct: 2.4, shadeHeightPct: 2.45 },
        { id: 'loft_sc_fr', kind: 'sconce', xPct: 89.62, yPct: 38.0, radiusPct: 8.8, intensity: 1.12, washSpanPct: 21, shadeWidthPct: 3.55, shadeHeightPct: 3.25 },
      ],
      rigNoteKo: '낮 아치 격자창 고보 햇빛 · 일몰 후 2700K 월 스콘스 점등',
      rigNoteEn: 'Daytime arched window grid sun · Post-sunset 2700K wall sconce',
    },
  },
  {
    id: 'b_stone_courtyard_outdoor',
    tier: 'B+',
    nameKo: '트래버틴 오픈 중정',
    nameEn: 'Travertine Open Courtyard',
    subtitleKo: '날씨 반응형 오픈 스카이 스톤 월 & 페이빙 중정',
    subtitleEn: 'Weather-Active Limestone Walls & Slate Paving Courtyard',
    imageUrl: '/assets/backgrounds/b_stone_courtyard_outdoor.jpg',
    floorToneLight: 'rgba(188, 182, 172, 0.2)',
    floorToneDark: 'rgba(34, 33, 31, 0.4)',
    weight: 7,
    isDefaultUnlocked: false,
    isOutdoor: true,
  },
  {
    id: 'b_seoul_plaza_outdoor',
    tier: 'B+',
    nameKo: '광화문 스톤 플라자',
    nameEn: 'Seoul Stone-Paved Plaza',
    subtitleKo: '날씨 반응형 오픈 스카이 석재 아케이드 & 플라자',
    subtitleEn: 'Weather-Active Granite Colonnade & Plaza',
    imageUrl: '/assets/backgrounds/b_seoul_plaza_outdoor.jpg',
    floorToneLight: 'rgba(178, 180, 184, 0.2)',
    floorToneDark: 'rgba(32, 34, 38, 0.42)',
    weight: 7,
    isDefaultUnlocked: false,
    isOutdoor: true,
  },
  {
    id: 'c_atelier_plaster',
    tier: 'C',
    nameKo: '아틀리에 플라스터',
    nameEn: 'Atelier Plaster',
    subtitleKo: '소프트 웜 플라스터 · 한지 돔 펜던트 & 플로어 랜턴',
    subtitleEn: 'Warm Plaster Wall, Sculptural Dome Pendant & Floor Lantern',
    imageUrl: '/assets/backgrounds/c_atelier_plaster.jpg',
    floorToneLight: 'rgba(218, 212, 204, 0.16)',
    floorToneDark: 'rgba(26, 26, 28, 0.34)',
    weight: 12,
    isDefaultUnlocked: true,
    isOutdoor: false,
    lightingRig: {
      windowAperture: 'left-sheer-curtain',
      windowSide: 'left',
      windowAzimuthDeg: 145,
      daylightStrength: 0.82,
      nightFixture: 'recessed-cove',
      nightKelvinHex: 0xffd292,
      nightPhotoDim: 0.33,
      nightDirectRatio: 0.78,
      fixtureEmitters: [
        { id: 'plaster_dome_pendant', kind: 'pendant', xPct: 34.8, yPct: 41.2, radiusPct: 18.0, intensity: 1.24, washSpanPct: 36, shadeWidthPct: 14.5, shadeHeightPct: 7.2 },
        { id: 'plaster_floor_lantern', kind: 'sconce', xPct: 75.2, yPct: 48.2, radiusPct: 13.0, intensity: 1.18, washSpanPct: 26, shadeWidthPct: 5.0, shadeHeightPct: 5.8 },
        { id: 'plaster_cove_main', kind: 'cove-strip', xPct: 23.6, yPct: 27.1, x2Pct: 86.4, y2Pct: 27.1, radiusPct: 9.0, intensity: 1.05, washSpanPct: 20 },
      ],
      rigNoteKo: '낮 쉬어 커튼 채광 · 일몰 후 2700K 한지 돔 펜던트 · 스탠드 랜턴 · 코브등 점등',
      rigNoteEn: 'Daytime sheer-curtain sun · Post-sunset 2700K dome pendant, floor lantern & cove',
    },
  },
  {
    id: 'c_concrete_gallery',
    tier: 'C',
    nameKo: '콘크리트 갤러리',
    nameEn: 'Concrete Gallery',
    subtitleKo: '노출 콘크리트 · 뮤지엄 픽처 라이트 & 월워셔 바',
    subtitleEn: 'Architectural Concrete, Museum Picture Lights & Linear Wall Washers',
    imageUrl: '/assets/backgrounds/c_concrete_gallery.jpg',
    floorToneLight: 'rgba(182, 184, 188, 0.18)',
    floorToneDark: 'rgba(24, 25, 28, 0.36)',
    weight: 11,
    isDefaultUnlocked: false,
    isOutdoor: false,
    lightingRig: {
      windowAperture: 'high-clerestory',
      windowSide: 'left',
      windowAzimuthDeg: 155,
      daylightStrength: 0.76,
      nightFixture: 'gallery-wall-washer',
      nightKelvinHex: 0xffe4be,
      nightPhotoDim: 0.34,
      nightDirectRatio: 0.82,
      fixtureEmitters: [
        { id: 'gallery_pic_1', kind: 'bar-sconce', xPct: 0.4, yPct: 33.4, x2Pct: 9.0, y2Pct: 36.2, radiusPct: 7.0, intensity: 1.02, washSpanPct: 20 },
        { id: 'gallery_pic_2', kind: 'bar-sconce', xPct: 14.5, yPct: 38.2, x2Pct: 22.4, y2Pct: 40.7, radiusPct: 7.2, intensity: 1.15, washSpanPct: 22 },
        { id: 'gallery_pic_3', kind: 'bar-sconce', xPct: 24.8, yPct: 41.7, x2Pct: 28.9, y2Pct: 43.1, radiusPct: 6.4, intensity: 1.12, washSpanPct: 18 },
        { id: 'gallery_pic_4', kind: 'bar-sconce', xPct: 30.2, yPct: 43.7, x2Pct: 33.4, y2Pct: 44.7, radiusPct: 5.4, intensity: 1.04, washSpanPct: 16 },
        { id: 'gallery_pic_5', kind: 'bar-sconce', xPct: 34.4, yPct: 44.9, x2Pct: 36.5, y2Pct: 45.7, radiusPct: 4.5, intensity: 0.94, washSpanPct: 14 },
        { id: 'gallery_pic_6', kind: 'bar-sconce', xPct: 37.3, yPct: 45.8, x2Pct: 39.4, y2Pct: 46.5, radiusPct: 4.0, intensity: 0.86, washSpanPct: 12 },
        { id: 'gallery_bar_r1', kind: 'bar-sconce', xPct: 73.9, yPct: 41.5, x2Pct: 73.9, y2Pct: 53.3, radiusPct: 8.6, intensity: 1.22, washSpanPct: 22 },
        { id: 'gallery_bar_r2', kind: 'bar-sconce', xPct: 87.2, yPct: 36.2, x2Pct: 87.2, y2Pct: 55.0, radiusPct: 10.0, intensity: 1.2, washSpanPct: 26 },
        { id: 'gallery_rail_l', kind: 'cove-strip', xPct: 25.3, yPct: 0.5, x2Pct: 44.4, y2Pct: 38.2, radiusPct: 5.5, intensity: 0.92, washSpanPct: 14 },
        { id: 'gallery_rail_r', kind: 'cove-strip', xPct: 74.1, yPct: 0.5, x2Pct: 55.9, y2Pct: 38.2, radiusPct: 5.5, intensity: 0.92, washSpanPct: 14 },
      ],
      rigNoteKo: '낮 하이 클리어스토리 채광 · 일몰 후 3200K 픽처 라이트 바 & 콘크리트 월워셔 점등',
      rigNoteEn: 'Daytime clerestory slash · Post-sunset 3200K picture light bars & wall washers',
    },
  },
  {
    id: 'c_oak_dressing_room',
    tier: 'C',
    nameKo: '오크 드레싱 룸',
    nameEn: 'Oak Dressing Room',
    subtitleKo: '내추럴 오크 플루티드 월 · 플루티드 글라스 바 스콘스',
    subtitleEn: 'Pale Oak Paneling, Fluted-Glass Sconces & Indirect Cove',
    imageUrl: '/assets/backgrounds/c_oak_dressing_room.jpg',
    floorToneLight: 'rgba(198, 174, 146, 0.18)',
    floorToneDark: 'rgba(36, 30, 24, 0.36)',
    weight: 11,
    isDefaultUnlocked: false,
    isOutdoor: false,
    lightingRig: {
      windowAperture: 'windowless-salon',
      windowSide: 'none',
      windowAzimuthDeg: 180,
      daylightStrength: 0,
      nightFixture: 'louver-strip-cove',
      nightKelvinHex: 0xffcf8e,
      nightPhotoDim: 0.3,
      nightDirectRatio: 0.76,
      fixtureEmitters: [
        { id: 'oak_bar_fl', kind: 'bar-sconce', xPct: 9.4, yPct: 31.2, x2Pct: 9.4, y2Pct: 46.8, radiusPct: 8.4, intensity: 1.16, washSpanPct: 22 },
        { id: 'oak_bar_ml', kind: 'bar-sconce', xPct: 24.0, yPct: 38.2, x2Pct: 24.0, y2Pct: 47.8, radiusPct: 7.4, intensity: 1.2, washSpanPct: 20 },
        { id: 'oak_bar_nl', kind: 'bar-sconce', xPct: 31.8, yPct: 41.6, x2Pct: 31.8, y2Pct: 48.6, radiusPct: 6.4, intensity: 1.18, washSpanPct: 18 },
        { id: 'oak_bar_nr', kind: 'bar-sconce', xPct: 68.1, yPct: 41.6, x2Pct: 68.1, y2Pct: 48.6, radiusPct: 6.4, intensity: 1.18, washSpanPct: 18 },
        { id: 'oak_pend_center', kind: 'bar-sconce', xPct: 49.9, yPct: 24.4, x2Pct: 49.9, y2Pct: 34.4, radiusPct: 6.8, intensity: 1.12, washSpanPct: 20 },
        { id: 'oak_cove_back', kind: 'cove-strip', xPct: 29.0, yPct: 29.2, x2Pct: 71.0, y2Pct: 29.2, radiusPct: 7.5, intensity: 0.96, washSpanPct: 15 },
        { id: 'oak_cove_left', kind: 'cove-strip', xPct: 1.0, yPct: 2.0, x2Pct: 29.0, y2Pct: 29.2, radiusPct: 6.5, intensity: 0.85, washSpanPct: 13 },
        { id: 'oak_cove_right', kind: 'cove-strip', xPct: 99.0, yPct: 2.0, x2Pct: 71.0, y2Pct: 29.2, radiusPct: 6.5, intensity: 0.85, washSpanPct: 13 },
        { id: 'oak_niche_top', kind: 'cove-strip', xPct: 35.2, yPct: 38.2, x2Pct: 64.6, y2Pct: 38.2, radiusPct: 6.2, intensity: 1.0, washSpanPct: 14 },
        { id: 'oak_niche_l', kind: 'cove-strip', xPct: 35.6, yPct: 38.5, x2Pct: 35.6, y2Pct: 63.5, radiusPct: 4.8, intensity: 0.88, washSpanPct: 10 },
        { id: 'oak_niche_r', kind: 'cove-strip', xPct: 64.2, yPct: 38.5, x2Pct: 64.2, y2Pct: 63.5, radiusPct: 4.8, intensity: 0.88, washSpanPct: 10 },
      ],
      rigNoteKo: '무창 프라이빗 드레싱 룸 · 브러시드 브라스 글라스 스콘스 & 루버 간접 코브등',
      rigNoteEn: 'Windowless dressing room · Brushed-brass glass sconces & indirect louver cove',
    },
  },
  {
    id: 'c_stone_boutique',
    tier: 'C',
    nameKo: '트래버틴 부티크',
    nameEn: 'Travertine Boutique',
    subtitleKo: '베이지 라임스톤 아치 · 알라바스터 토치 스콘스 & 글로브 펜던트',
    subtitleEn: 'Honed Travertine Arch, Alabaster Torch Sconces & Vault Pendant',
    imageUrl: '/assets/backgrounds/c_stone_boutique.jpg',
    floorToneLight: 'rgba(208, 198, 182, 0.18)',
    floorToneDark: 'rgba(34, 31, 28, 0.36)',
    weight: 11,
    isDefaultUnlocked: false,
    isOutdoor: false,
    lightingRig: {
      windowAperture: 'archway-sun',
      windowSide: 'right',
      windowAzimuthDeg: 210,
      daylightStrength: 0.8,
      nightFixture: 'arch-uplight',
      nightKelvinHex: 0xffd394,
      nightPhotoDim: 0.33,
      nightDirectRatio: 0.82,
      fixtureEmitters: [
        { id: 'stone_torch_l', kind: 'sconce', xPct: 9.5, yPct: 29.8, radiusPct: 15.0, intensity: 1.18, washSpanPct: 28, shadeWidthPct: 7.4, shadeHeightPct: 15.2 },
        { id: 'stone_torch_r', kind: 'sconce', xPct: 63.4, yPct: 41.4, radiusPct: 11.0, intensity: 1.22, washSpanPct: 22, shadeWidthPct: 3.5, shadeHeightPct: 6.4 },
        { id: 'stone_arch_pendant', kind: 'pendant', xPct: 37.8, yPct: 38.5, radiusPct: 10.5, intensity: 1.18, washSpanPct: 26, shadeWidthPct: 3.1, shadeHeightPct: 2.5 },
        { id: 'stone_up_l', kind: 'uplight', xPct: 30.2, yPct: 61.2, radiusPct: 7.5, intensity: 1.05, washSpanPct: 24 },
        { id: 'stone_up_r', kind: 'uplight', xPct: 46.8, yPct: 61.2, radiusPct: 7.5, intensity: 1.05, washSpanPct: 24 },
      ],
      rigNoteKo: '낮 트래버틴 아치 채광 · 일몰 후 2800K 알라바스터 토치 스콘스 · 볼트 펜던트 · 업라이트',
      rigNoteEn: 'Daytime travertine arch sun · Post-sunset 2800K alabaster torches, pendant & uplights',
    },
  },
];

const VALID_LIGHTING_PRESET_IDS = new Set<StageLightingPresetId>(
  STAGE_LIGHTING_PRESETS.map((p) => p.id)
);

export function normalizeLightingPreset(value: unknown): StageLightingPresetId {
  if (typeof value === 'string' && VALID_LIGHTING_PRESET_IDS.has(value as StageLightingPresetId)) {
    return value as StageLightingPresetId;
  }
  return DEFAULT_LIGHTING_PRESET;
}

export function clampLightingIntensity(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIGHTING_INTENSITY;
  return Math.round(Math.min(MAX_LIGHTING_INTENSITY, Math.max(MIN_LIGHTING_INTENSITY, parsed)));
}

export function getLightingPresetMeta(
  presetId?: StageLightingPresetId | string | null
): StageLightingPresetMeta {
  const normalized = normalizeLightingPreset(presetId);
  return STAGE_LIGHTING_PRESETS.find((p) => p.id === normalized) || STAGE_LIGHTING_PRESETS[0];
}

export interface StageEconomyState {
  iBalance: number;
  unlockedIds: string[];
  equippedBackgroundId: string;
  lastFreeDrawDate: string | null;
  attendanceDates: string[];
  lastAttendanceDate: string | null;
  attendanceStreak: number;
  totalDraws: number;
  lightingPreset: StageLightingPresetId;
  lightingIntensity: number;
}

export function createInitialEconomyState(): StageEconomyState {
  return {
    iBalance: 0,
    unlockedIds: [DEFAULT_STAGE_BACKGROUND_ID],
    equippedBackgroundId: DEFAULT_STAGE_BACKGROUND_ID,
    lastFreeDrawDate: null,
    attendanceDates: [],
    lastAttendanceDate: null,
    attendanceStreak: 0,
    totalDraws: 0,
    lightingPreset: DEFAULT_LIGHTING_PRESET,
    lightingIntensity: DEFAULT_LIGHTING_INTENSITY,
  };
}

export function normalizeEconomyState(
  raw: Partial<StageEconomyState> | null | undefined
): StageEconomyState {
  const validIdSet = new Set(STAGE_BACKGROUNDS.map((b) => b.id));
  const unlockedSet = new Set<string>([DEFAULT_STAGE_BACKGROUND_ID]);
  if (Array.isArray(raw?.unlockedIds)) {
    for (const id of raw.unlockedIds) {
      if (typeof id === 'string' && validIdSet.has(id)) {
        unlockedSet.add(id);
      }
    }
  }
  const equippedCandidate =
    typeof raw?.equippedBackgroundId === 'string' && unlockedSet.has(raw.equippedBackgroundId)
      ? raw.equippedBackgroundId
      : DEFAULT_STAGE_BACKGROUND_ID;

  const attendanceDates = Array.isArray(raw?.attendanceDates)
    ? Array.from(
        new Set(
          raw.attendanceDates.filter(
            (d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
          )
        )
      ).sort()
    : [];

  return {
    iBalance:
      typeof raw?.iBalance === 'number' && Number.isFinite(raw.iBalance) && raw.iBalance >= 0
        ? Math.floor(raw.iBalance)
        : 0,
    unlockedIds: Array.from(unlockedSet),
    equippedBackgroundId: equippedCandidate,
    lastFreeDrawDate:
      typeof raw?.lastFreeDrawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastFreeDrawDate)
        ? raw.lastFreeDrawDate
        : null,
    attendanceDates,
    lastAttendanceDate:
      typeof raw?.lastAttendanceDate === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(raw.lastAttendanceDate)
        ? raw.lastAttendanceDate
        : null,
    attendanceStreak:
      typeof raw?.attendanceStreak === 'number' &&
      Number.isFinite(raw.attendanceStreak) &&
      raw.attendanceStreak >= 0
        ? Math.floor(raw.attendanceStreak)
        : 0,
    totalDraws:
      typeof raw?.totalDraws === 'number' && Number.isFinite(raw.totalDraws) && raw.totalDraws >= 0
        ? Math.floor(raw.totalDraws)
        : 0,
    lightingPreset: normalizeLightingPreset(raw?.lightingPreset),
    lightingIntensity:
      raw?.lightingIntensity === undefined
        ? DEFAULT_LIGHTING_INTENSITY
        : clampLightingIntensity(raw.lightingIntensity),
  };
}

export function getLocalTodayDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getStageBackgroundById(id?: string | null): StageBackgroundItem {
  return (
    STAGE_BACKGROUNDS.find((bg) => bg.id === id) ||
    STAGE_BACKGROUNDS.find((bg) => bg.id === DEFAULT_STAGE_BACKGROUND_ID)!
  );
}

export function hasFreeDailyDrawRemaining(
  state: StageEconomyState,
  todayDateKey: string = getLocalTodayDateKey()
): boolean {
  return state.lastFreeDrawDate !== todayDateKey;
}

export interface GachaRollOutcome {
  ok: boolean;
  reason?: 'insufficient_i';
  usedFreeDraw: boolean;
  costI: number;
  refundI: number;
  isNewUnlock: boolean;
  background: StageBackgroundItem;
  nextState: StageEconomyState;
}

/**
 * Checks whether a `+` outdoor weather-active tier (`S+`, `A+`, `B+`) is unlocked in the gacha pool.
 * Base tiers (`S`, `A`, `B`, `C`) are always eligible (`true`).
 * `+` tiers (`B+`, `A+`, `S+`) ONLY enter the draw pool after ALL base backgrounds of the same
 * letter (`B`, `A`, `S`) have been collected in `unlockedIds`.
 */
export function isPlusTierEligibleForDraw(
  tier: StageBackgroundTier,
  unlockedIds?: Iterable<string> | null
): boolean {
  if (!isPlusStageTier(tier)) return true;
  if (!unlockedIds) return false;
  const unlockedSet = unlockedIds instanceof Set ? unlockedIds : new Set(unlockedIds);
  const baseTier = getBaseStageTier(tier);
  const baseItems = STAGE_BACKGROUNDS.filter((bg) => bg.tier === baseTier);
  if (baseItems.length === 0) return true;
  return baseItems.every((bg) => unlockedSet.has(bg.id));
}

export function getEligibleGachaPool(
  unlockedIds?: Iterable<string> | null
): StageBackgroundItem[] {
  return STAGE_BACKGROUNDS.filter((item) => isPlusTierEligibleForDraw(item.tier, unlockedIds));
}

export function pickWeightedStageBackground(
  rng: () => number = Math.random,
  unlockedIds?: Iterable<string> | null
): StageBackgroundItem {
  // Roll family bucket first (`S/S+` 3%, `A/A+` 17%, `B/B+` 35%, `C` 45% = 100%)
  // and distribute that family's probability across currently eligible items in the family
  // so `B+` has 0% chance until all base `B` items are unlocked (and likewise for `A+` / `S+`).
  const totalFamilyWeight = BASE_TIER_ORDER.reduce((sum, t) => sum + TIER_DROP_RATES[t], 0);
  const clampedRoll = Math.min(0.999999999, Math.max(0, rng())) * totalFamilyWeight;

  let chosenFamily: BaseStageBackgroundTier = 'C';
  let familyStart = 0;
  for (const baseTier of BASE_TIER_ORDER) {
    const bucketWeight = TIER_DROP_RATES[baseTier];
    if (clampedRoll < familyStart + bucketWeight) {
      chosenFamily = baseTier;
      break;
    }
    familyStart += bucketWeight;
  }

  const familyBucketWeight = Math.max(1, TIER_DROP_RATES[chosenFamily]);
  const withinBucketFraction = Math.min(
    0.999999999,
    Math.max(0, (clampedRoll - familyStart) / familyBucketWeight)
  );

  const familyEligible = STAGE_BACKGROUNDS.filter(
    (item) =>
      getBaseStageTier(item.tier) === chosenFamily &&
      isPlusTierEligibleForDraw(item.tier, unlockedIds)
  );
  const pool =
    familyEligible.length > 0
      ? familyEligible
      : STAGE_BACKGROUNDS.filter((item) => getBaseStageTier(item.tier) === chosenFamily);

  const poolWeight = pool.reduce((sum, item) => sum + item.weight, 0);
  const targetInPool = withinBucketFraction * Math.max(1, poolWeight);
  let acc = 0;
  for (const item of pool) {
    acc += item.weight;
    if (targetInPool < acc) {
      return item;
    }
  }
  return pool[pool.length - 1] || STAGE_BACKGROUNDS[STAGE_BACKGROUNDS.length - 1];
}

export function rollBackgroundGacha(
  state: StageEconomyState,
  todayDateKey: string = getLocalTodayDateKey(),
  rng: () => number = Math.random
): GachaRollOutcome {
  const normalized = normalizeEconomyState(state);
  const usedFreeDraw = hasFreeDailyDrawRemaining(normalized, todayDateKey);
  const costI = usedFreeDraw ? 0 : STORE_DRAW_COST_I;

  if (!usedFreeDraw && normalized.iBalance < STORE_DRAW_COST_I) {
    return {
      ok: false,
      reason: 'insufficient_i',
      usedFreeDraw: false,
      costI: STORE_DRAW_COST_I,
      refundI: 0,
      isNewUnlock: false,
      background: getStageBackgroundById(normalized.equippedBackgroundId),
      nextState: normalized,
    };
  }

  const picked = pickWeightedStageBackground(rng, normalized.unlockedIds);
  const alreadyUnlocked = normalized.unlockedIds.includes(picked.id);
  const isNewUnlock = !alreadyUnlocked;
  const refundI = alreadyUnlocked ? DUPLICATE_REFUND_I : 0;
  const nextUnlockedIds = isNewUnlock
    ? [...normalized.unlockedIds, picked.id]
    : normalized.unlockedIds;

  const nextBalance = Math.max(0, normalized.iBalance - costI + refundI);
  const nextState: StageEconomyState = {
    ...normalized,
    iBalance: nextBalance,
    unlockedIds: nextUnlockedIds,
    equippedBackgroundId: isNewUnlock ? picked.id : normalized.equippedBackgroundId,
    lastFreeDrawDate: usedFreeDraw ? todayDateKey : normalized.lastFreeDrawDate,
    totalDraws: normalized.totalDraws + 1,
  };

  return {
    ok: true,
    usedFreeDraw,
    costI,
    refundI,
    isNewUnlock,
    background: picked,
    nextState,
  };
}

export interface AttendanceClaimOutcome {
  ok: boolean;
  alreadyClaimed: boolean;
  dailyRewardI: number;
  streak7BonusI: number;
  streak30BonusI: number;
  totalAwardedI: number;
  newStreak: number;
  nextState: StageEconomyState;
}

export function shiftDateKeyDays(dateKey: string, deltaDays: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return dateKey;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  dt.setDate(dt.getDate() + deltaDays);
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

export function claimDailyAttendance(
  state: StageEconomyState,
  todayDateKey: string = getLocalTodayDateKey()
): AttendanceClaimOutcome {
  const normalized = normalizeEconomyState(state);
  if (
    normalized.lastAttendanceDate === todayDateKey ||
    normalized.attendanceDates.includes(todayDateKey)
  ) {
    return {
      ok: false,
      alreadyClaimed: true,
      dailyRewardI: 0,
      streak7BonusI: 0,
      streak30BonusI: 0,
      totalAwardedI: 0,
      newStreak: normalized.attendanceStreak,
      nextState: normalized,
    };
  }

  const yesterdayKey = shiftDateKeyDays(todayDateKey, -1);
  const newStreak =
    normalized.lastAttendanceDate === yesterdayKey ? normalized.attendanceStreak + 1 : 1;

  const dailyRewardI = ATTENDANCE_DAILY_REWARD_I;
  const streak7BonusI = newStreak > 0 && newStreak % 7 === 0 ? ATTENDANCE_STREAK_7_BONUS_I : 0;
  const streak30BonusI = newStreak > 0 && newStreak % 30 === 0 ? ATTENDANCE_STREAK_30_BONUS_I : 0;
  const totalAwardedI = dailyRewardI + streak7BonusI + streak30BonusI;

  const nextState: StageEconomyState = {
    ...normalized,
    iBalance: normalized.iBalance + totalAwardedI,
    attendanceDates: [...normalized.attendanceDates, todayDateKey].sort(),
    lastAttendanceDate: todayDateKey,
    attendanceStreak: newStreak,
  };

  return {
    ok: true,
    alreadyClaimed: false,
    dailyRewardI,
    streak7BonusI,
    streak30BonusI,
    totalAwardedI,
    newStreak,
    nextState,
  };
}

export function loadStoredEconomyState(): StageEconomyState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createInitialEconomyState();
  }
  try {
    const raw = window.localStorage.getItem(ECONOMY_STORAGE_KEY);
    if (!raw) return createInitialEconomyState();
    return normalizeEconomyState(JSON.parse(raw));
  } catch {
    return createInitialEconomyState();
  }
}

export function saveStoredEconomyState(state: StageEconomyState): StageEconomyState {
  const normalized = normalizeEconomyState(state);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.setItem(ECONOMY_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // ignore storage quota errors
    }
    try {
      window.dispatchEvent(new CustomEvent(ECONOMY_STATE_EVENT, { detail: normalized }));
    } catch {
      // ignore event dispatch errors
    }
  }
  return normalized;
}

export function equipStageBackground(backgroundId: string): StageEconomyState {
  const cur = loadStoredEconomyState();
  if (!cur.unlockedIds.includes(backgroundId)) {
    return cur;
  }
  return saveStoredEconomyState({
    ...cur,
    equippedBackgroundId: backgroundId,
  });
}

export function updateStageLightingSettings(patch: {
  lightingPreset?: StageLightingPresetId | string;
  lightingIntensity?: number;
}): StageEconomyState {
  const cur = loadStoredEconomyState();
  return saveStoredEconomyState({
    ...cur,
    lightingPreset:
      patch.lightingPreset !== undefined
        ? normalizeLightingPreset(patch.lightingPreset)
        : cur.lightingPreset,
    lightingIntensity:
      patch.lightingIntensity !== undefined
        ? clampLightingIntensity(patch.lightingIntensity)
        : cur.lightingIntensity,
  });
}

export function clampNavOpacity(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_NAV_OPACITY;
  return Math.round(Math.min(MAX_NAV_OPACITY, Math.max(MIN_NAV_OPACITY, parsed)) * 100) / 100;
}

export function getStoredNavOpacity(): number {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_NAV_OPACITY;
  }
  try {
    const raw = window.localStorage.getItem(NAV_OPACITY_STORAGE_KEY);
    if (raw === null || raw.trim() === '') return DEFAULT_NAV_OPACITY;
    return clampNavOpacity(raw);
  } catch {
    return DEFAULT_NAV_OPACITY;
  }
}

export function applyNavOpacityCss(opacity: number): number {
  const safeOpacity = clampNavOpacity(opacity);
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--hig-nav-bg-opacity', safeOpacity.toFixed(2));
  }
  return safeOpacity;
}

export function saveStoredNavOpacity(opacity: number): number {
  const safeOpacity = applyNavOpacityCss(opacity);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.setItem(NAV_OPACITY_STORAGE_KEY, String(safeOpacity));
    } catch {
      // ignore storage quota errors
    }
    try {
      window.dispatchEvent(new CustomEvent(NAV_OPACITY_EVENT, { detail: safeOpacity }));
    } catch {
      // ignore event dispatch errors
    }
  }
  return safeOpacity;
}

export function setAdminCurrencyBalance(targetI: number): StageEconomyState {
  const cur = loadStoredEconomyState();
  const safeBalance = Number.isFinite(Number(targetI))
    ? Math.max(0, Math.min(99999, Math.floor(Number(targetI))))
    : cur.iBalance;
  return saveStoredEconomyState({
    ...cur,
    iBalance: safeBalance,
  });
}

export function adjustAdminCurrencyBalance(deltaI: number): StageEconomyState {
  const cur = loadStoredEconomyState();
  const delta = Number.isFinite(Number(deltaI)) ? Math.trunc(Number(deltaI)) : 0;
  return saveStoredEconomyState({
    ...cur,
    iBalance: Math.max(0, Math.min(99999, cur.iBalance + delta)),
  });
}

export function resetAdminFreeDraw(): StageEconomyState {
  const cur = loadStoredEconomyState();
  return saveStoredEconomyState({
    ...cur,
    lastFreeDrawDate: null,
  });
}

export function setAdminAttendanceStreak(streak: number): StageEconomyState {
  const cur = loadStoredEconomyState();
  const safeStreak = Number.isFinite(Number(streak))
    ? Math.max(0, Math.min(365, Math.floor(Number(streak))))
    : cur.attendanceStreak;
  return saveStoredEconomyState({
    ...cur,
    attendanceStreak: safeStreak,
  });
}
