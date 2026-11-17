export type StageBackgroundTier = 'S' | 'A' | 'B' | 'C';

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

export const TIER_DROP_RATES: Record<StageBackgroundTier, number> = {
  S: 3,
  A: 17,
  B: 35,
  C: 45,
};

export const TIER_ORDER: readonly StageBackgroundTier[] = ['S', 'A', 'B', 'C'] as const;

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
    weight: 3,
    isDefaultUnlocked: false,
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
    weight: 9,
    isDefaultUnlocked: false,
  },
  {
    id: 'a_sunset_rooftop',
    tier: 'A',
    nameKo: '노을 루프탑 테라스',
    nameEn: 'Sunset Rooftop Terrace',
    subtitleKo: '골든아워 트래버틴 & 슬레이트 루프탑',
    subtitleEn: 'Golden-Hour Skylight Terrace & Slate Floor',
    imageUrl: '/assets/backgrounds/a_sunset_rooftop.jpg',
    floorToneLight: 'rgba(184, 146, 114, 0.22)',
    floorToneDark: 'rgba(48, 36, 32, 0.44)',
    weight: 8,
    isDefaultUnlocked: false,
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
    weight: 12,
    isDefaultUnlocked: false,
  },
  {
    id: 'b_brick_courtyard',
    tier: 'B',
    nameKo: '유럽 브릭 코트야드',
    nameEn: 'European Brick Courtyard',
    subtitleKo: '아치형 석조 회랑 & 코블스톤 중정',
    subtitleEn: 'Warm Brick Arcade & Cobblestone Floor',
    imageUrl: '/assets/backgrounds/b_brick_courtyard.jpg',
    floorToneLight: 'rgba(176, 154, 134, 0.2)',
    floorToneDark: 'rgba(42, 34, 28, 0.38)',
    weight: 12,
    isDefaultUnlocked: false,
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
    weight: 11,
    isDefaultUnlocked: false,
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
  },
];

export interface StageEconomyState {
  iBalance: number;
  unlockedIds: string[];
  equippedBackgroundId: string;
  lastFreeDrawDate: string | null;
  attendanceDates: string[];
  lastAttendanceDate: string | null;
  attendanceStreak: number;
  totalDraws: number;
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

export function pickWeightedStageBackground(
  rng: () => number = Math.random
): StageBackgroundItem {
  const totalWeight = STAGE_BACKGROUNDS.reduce((sum, item) => sum + item.weight, 0);
  const raw = Math.min(0.999999999, Math.max(0, rng())) * totalWeight;
  let acc = 0;
  for (const item of STAGE_BACKGROUNDS) {
    acc += item.weight;
    if (raw < acc) {
      return item;
    }
  }
  return STAGE_BACKGROUNDS[STAGE_BACKGROUNDS.length - 1];
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

  const picked = pickWeightedStageBackground(rng);
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
