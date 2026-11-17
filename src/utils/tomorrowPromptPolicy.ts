export type WeatherDayTarget = 'today' | 'tomorrow';

export type TimeOfDayPhase = 'sunrise' | 'day' | 'sunset' | 'night';

export const OUTFIT_GENERATED_DATE_STORAGE_KEY = 'ainventory_outfit_generated_date_v1';
export const TOMORROW_PROMPT_COUNT_STORAGE_KEY = 'ainventory_tomorrow_prompt_count_v1';
export const MAX_TOMORROW_OUTFIT_PROMPTS = 3;

const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const EN_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function getLocalDateKey(date: Date = new Date()): string {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function resolveTimeOfDayPhase(
  date: Date = new Date(),
  hourOverride?: number | null
): TimeOfDayPhase {
  let fractionalHour: number;
  if (typeof hourOverride === 'number' && Number.isFinite(hourOverride)) {
    fractionalHour = ((hourOverride % 24) + 24) % 24;
  } else {
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    fractionalHour = safeDate.getHours() + safeDate.getMinutes() / 60;
  }

  if (fractionalHour >= 5.5 && fractionalHour < 7.5) {
    return 'sunrise';
  }
  if (fractionalHour >= 7.5 && fractionalHour < 17.0) {
    return 'day';
  }
  if (fractionalHour >= 17.0 && fractionalHour < 19.5) {
    return 'sunset';
  }
  return 'night';
}

export function resolveEffectiveClientTimeOfDay(date: Date = new Date()): TimeOfDayPhase {
  if (typeof window !== 'undefined') {
    const validPhases: ReadonlySet<string> = new Set(['sunrise', 'day', 'sunset', 'night']);
    try {
      const search = new URLSearchParams(window.location.search);
      const param = String(search.get('tod') || '').trim().toLowerCase();
      if (validPhases.has(param)) {
        return param as TimeOfDayPhase;
      }
    } catch {
      // ignore URL parse error
    }
    const winOverride = String(
      (window as unknown as { __AINVENTORY_TOD_OVERRIDE__?: string }).__AINVENTORY_TOD_OVERRIDE__ ||
        ''
    )
      .trim()
      .toLowerCase();
    if (validPhases.has(winOverride)) {
      return winOverride as TimeOfDayPhase;
    }
  }
  return resolveTimeOfDayPhase(date);
}

export function formatWeatherCapsuleDateTime(
  dateInput: Date | number = new Date(),
  dayTarget: WeatherDayTarget = 'today',
  lang: 'ko' | 'en' = 'ko'
): string {
  const baseDate =
    typeof dateInput === 'number'
      ? new Date(dateInput)
      : Number.isNaN(dateInput.getTime())
        ? new Date()
        : new Date(dateInput.getTime());

  const hh = String(baseDate.getHours()).padStart(2, '0');
  const mm = String(baseDate.getMinutes()).padStart(2, '0');
  const timeText = `${hh}:${mm}`;

  const targetDate = new Date(baseDate.getTime());
  if (dayTarget === 'tomorrow') {
    targetDate.setDate(targetDate.getDate() + 1);
  }

  const month = targetDate.getMonth() + 1;
  const day = targetDate.getDate();
  const weekdayIdx = targetDate.getDay();

  if (lang === 'en') {
    const weekday = EN_WEEKDAYS[weekdayIdx] || 'Mon';
    const prefix = dayTarget === 'tomorrow' ? 'Tmrw ' : '';
    return `${prefix}${month}/${day}(${weekday}) ${timeText}`;
  }

  const weekday = KO_WEEKDAYS[weekdayIdx] || '월';
  const prefix = dayTarget === 'tomorrow' ? '내일 ' : '오늘 ';
  return `${prefix}${month}.${day}(${weekday}) ${timeText}`;
}

export interface TomorrowOutfitPromptCheckInput {
  hour: number;
  todayDateStr: string;
  lastGeneratedDateStr: string | null | undefined;
  shownCount: number;
  dayTarget: WeatherDayTarget;
}

export function shouldShowTomorrowOutfitPrompt(input: TomorrowOutfitPromptCheckInput): boolean {
  if (input.dayTarget !== 'today') return false;
  if (!Number.isFinite(input.hour) || input.hour < 20) return false;
  if (!input.todayDateStr || !input.lastGeneratedDateStr) return false;
  if (input.lastGeneratedDateStr !== input.todayDateStr) return false;
  if (!Number.isFinite(input.shownCount) || input.shownCount >= MAX_TOMORROW_OUTFIT_PROMPTS) {
    return false;
  }
  return true;
}

export function readTodayOutfitGeneratedDate(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(OUTFIT_GENERATED_DATE_STORAGE_KEY);
    return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function markTodayOutfitGenerated(date: Date = new Date()): string {
  const key = getLocalDateKey(date);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(OUTFIT_GENERATED_DATE_STORAGE_KEY, key);
    } catch {
      // ignore storage quota errors
    }
  }
  return key;
}

export function readTomorrowPromptShownCount(): number {
  if (typeof window === 'undefined' || !window.localStorage) return 0;
  try {
    const raw = window.localStorage.getItem(TOMORROW_PROMPT_COUNT_STORAGE_KEY);
    const parsed = Number.parseInt(String(raw ?? '0'), 10);
    return Number.isFinite(parsed) && parsed > 0
      ? Math.min(MAX_TOMORROW_OUTFIT_PROMPTS, parsed)
      : 0;
  } catch {
    return 0;
  }
}

export function incrementTomorrowPromptShownCount(): number {
  const next = Math.min(MAX_TOMORROW_OUTFIT_PROMPTS, readTomorrowPromptShownCount() + 1);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(TOMORROW_PROMPT_COUNT_STORAGE_KEY, String(next));
    } catch {
      // ignore storage quota errors
    }
  }
  return next;
}
