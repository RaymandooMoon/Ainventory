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
  | 'arch-uplight';

export interface IndoorLightingRigSpec {
  windowAperture: WindowApertureKind;
  windowSide: WindowSide;
  /** Compass azimuth (deg, 180 = South, 135 = SE, 225 = SW) where daylight enters strongest */
  windowAzimuthDeg: number;
  daylightStrength: number;
  nightFixture: NightFixtureKind;
  nightKelvinHex: number;
  /** Selective photo exposure reduction (0..0.42) applied after sunset so indoor lamps read warmly */
  nightPhotoDim: number;
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
export const MAX_LIGHTING_INTENSITY = 200;

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
    weight: 2,
    isDefaultUnlocked: false,
    isOutdoor: false,
    lightingRig: {
      windowAperture: 'overhead-skylight',
      windowSide: 'overhead',
      windowAzimuthDeg: 180,
      daylightStrength: 0.92,
      nightFixture: 'chandelier-arcade',
      nightKelvinHex: 0xffd79c,
      nightPhotoDim: 0.28,
      rigNoteKo: '낮 천창 아케이드 채광 · 일몰 후 2800K 샹들리에 점등',
      rigNoteEn: 'Daytime glass skylight · Post-sunset 2800K chandelier arcade',
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
    weight: 1,
    isDefaultUnlocked: false,
    isOutdoor: true,
  },
  {
    id: 'a_hannam_flagship',
    tier: 'A',
    nameKo: '한남 플래그십 살롱',
    nameEn: 'Hannam Flagship Salon',
    subtitleKo: '다크 마블 필라 & 혼드 바살트 쇼룸',
    subtitleEn: 'Charcoal Marble Pillars & Basalt Floor',
    imageUrl: '/assets/backgrounds/a_hannam_flagship.jpg',
    floorToneLight: 'rgba(54, 56, 62, 0.24)',
    floorToneDark: 'rgba(18, 20, 24, 0.46)',
    weight: 6,
    isDefaultUnlocked: false,
    isOutdoor: false,
    lightingRig: {
      windowAperture: 'clerestory-slit',
      windowSide: 'right',
      windowAzimuthDeg: 205,
      daylightStrength: 0.56,
      nightFixture: 'pin-spot',
      nightKelvinHex: 0xffe0b2,
      nightPhotoDim: 0.34,
      rigNoteKo: '낮 상부 슬릿 채광 · 일몰 후 3000K 핀스팟 트랙 조명 점등',
      rigNoteEn: 'Daytime clerestory slit · Post-sunset 3000K museum pin-spot',
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
    weight: 5,
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
    weight: 6,
    isDefaultUnlocked: false,
    isOutdoor: true,
  },
  {
    id: 'b_seoul_cafe_terrace',
    tier: 'B',
    nameKo: '성수 글래스 테라스',
    nameEn: 'Seongsu Glass Terrace',
    subtitleKo: '미니멀 통유리 채광 & 그레이 테라조',
    subtitleEn: 'Sunlit Floor-to-Ceiling Glass & Terrazzo',
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
      nightKelvinHex: 0xffdca8,
      nightPhotoDim: 0.32,
      rigNoteKo: '낮 통유리 커튼월 주광 · 일몰 후 2900K 레일 펜던트 점등',
      rigNoteEn: 'Daytime curtain-wall sunlight · Post-sunset 2900K rail pendant',
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
    subtitleKo: '소프트 웜 플라스터 & 마이크로시멘트 바닥',
    subtitleEn: 'Warm Plaster Wall & Microcement Floor',
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
      nightKelvinHex: 0xffdcb0,
      nightPhotoDim: 0.27,
      rigNoteKo: '낮 좌측 쉬어 커튼 채광 · 일몰 후 2900K 매입 코브등 점등',
      rigNoteEn: 'Daytime left sheer-curtain sun · Post-sunset 2900K recessed cove',
    },
  },
  {
    id: 'c_concrete_gallery',
    tier: 'C',
    nameKo: '콘크리트 갤러리',
    nameEn: 'Concrete Gallery',
    subtitleKo: '미니멀 노출 콘크리트 & 테라조 바닥',
    subtitleEn: 'Architectural Concrete & Light Terrazzo',
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
      nightKelvinHex: 0xffe8c8,
      nightPhotoDim: 0.29,
      rigNoteKo: '낮 하이 클리어스토리 사선광 · 일몰 후 3200K 월워셔 점등',
      rigNoteEn: 'Daytime high clerestory slash · Post-sunset 3200K wall washer',
    },
  },
  {
    id: 'c_oak_dressing_room',
    tier: 'C',
    nameKo: '오크 드레싱 룸',
    nameEn: 'Oak Dressing Room',
    subtitleKo: '내추럴 오크 플루티드 월 & 우드 플로어',
    subtitleEn: 'Pale Oak Paneling & Natural Wood Floor',
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
      nightKelvinHex: 0xffcf90,
      nightPhotoDim: 0.24,
      rigNoteKo: '무창 프라이빗 룸 · 낮 4000K 간접광 / 일몰 후 2700K 루버 무드등 전환',
      rigNoteEn: 'Windowless dressing room · Day 4000K cove / Post-sunset 2700K louver',
    },
  },
  {
    id: 'c_stone_boutique',
    tier: 'C',
    nameKo: '트래버틴 부티크',
    nameEn: 'Travertine Boutique',
    subtitleKo: '베이지 라임스톤 아치 & 스톤 플로어',
    subtitleEn: 'Honed Travertine Arch & Stone Floor',
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
      nightKelvinHex: 0xffd8a2,
      nightPhotoDim: 0.28,
      rigNoteKo: '낮 트래버틴 아치 채광 · 일몰 후 2850K 아치 업라이트 점등',
      rigNoteEn: 'Daytime travertine arch sun · Post-sunset 2850K arch uplight',
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
