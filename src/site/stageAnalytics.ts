import type { StageId, StageInteractionState } from '../three/ainvtryStageDirector.ts';
import type { SiteLang } from './siteContent.ts';

const STAGE_ANALYTICS_STORAGE_KEY = 'ainvtry:site:stage-analytics:v1';

export type StageAnalyticsBucket = 'hero' | 'tryOn' | 'calendar' | 'other';
export type StageSwitchTrigger = 'brand' | 'dock' | 'keyboard' | 'subtab';

export interface StageSwitchEventDetail {
  readonly fromStage: StageId;
  readonly toStage: StageId;
  readonly fromBucket: StageAnalyticsBucket;
  readonly toBucket: StageAnalyticsBucket;
  readonly trigger: StageSwitchTrigger;
  readonly timestamp: number;
  readonly counts: Readonly<Record<StageAnalyticsBucket, number>>;
  readonly stageCounts: Readonly<Record<StageId, number>>;
  readonly totalSwitches: number;
}

export interface StageAnalyticsSnapshot {
  readonly totalSwitches: number;
  readonly byBucket: Readonly<Record<StageAnalyticsBucket, number>>;
  readonly byStage: Readonly<Record<StageId, number>>;
  readonly transitions: Readonly<Record<string, number>>;
  readonly lastSwitchAt: number | null;
}

export interface StageSwitchTracker {
  recordSwitch: (
    fromStage: StageId,
    toStage: StageId,
    interaction: Readonly<StageInteractionState>,
    trigger: StageSwitchTrigger,
    prevInteraction?: Readonly<StageInteractionState>
  ) => StageSwitchEventDetail | null;
  getSnapshot: () => StageAnalyticsSnapshot;
  reset: () => void;
}

export interface StagePreferenceBarItem {
  readonly id: string;
  readonly label: string;
  readonly shortHint: string;
  readonly count: number;
  readonly sharePct: number;
  readonly ratio: number;
  readonly color: string;
  readonly targetStage: StageId;
  readonly targetStudioSubtab?: StageInteractionState['studioSubtab'];
}

export interface TransitionPieSlice {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly sharePct: number;
  readonly startAngle: number;
  readonly endAngle: number;
  readonly color: string;
}

declare global {
  interface Window {
    __AINVTRY_STAGE_ANALYTICS__?: {
      readonly getSnapshot: () => StageAnalyticsSnapshot;
      readonly reset: () => void;
    };
  }
}

export function resolveStageAnalyticsBucket(
  stageId: StageId,
  interaction: Readonly<Pick<StageInteractionState, 'studioSubtab' | 'aboutSubtab'>>
): StageAnalyticsBucket {
  if (stageId === 'hero') return 'hero';
  if (stageId === 'studio') {
    return interaction.studioSubtab === 'intelligence' ? 'calendar' : 'tryOn';
  }
  if (stageId === 'about' && interaction.aboutSubtab === 'journey') {
    return 'calendar';
  }
  return 'other';
}

export function createEmptyAnalyticsSnapshot(): StageAnalyticsSnapshot {
  return {
    totalSwitches: 0,
    byBucket: {
      hero: 0,
      tryOn: 0,
      calendar: 0,
      other: 0,
    },
    byStage: {
      hero: 0,
      studio: 0,
      architecture: 0,
      specs: 0,
      about: 0,
    },
    transitions: {},
    lastSwitchAt: null,
  };
}

function loadStoredAnalyticsSnapshot(): StageAnalyticsSnapshot {
  const empty = createEmptyAnalyticsSnapshot();
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.sessionStorage.getItem(STAGE_ANALYTICS_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<StageAnalyticsSnapshot> | null;
    if (!parsed || typeof parsed !== 'object') return empty;
    const safeNum = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
    return {
      totalSwitches: safeNum(parsed.totalSwitches),
      byBucket: {
        hero: safeNum(parsed.byBucket?.hero),
        tryOn: safeNum(parsed.byBucket?.tryOn),
        calendar: safeNum(parsed.byBucket?.calendar),
        other: safeNum(parsed.byBucket?.other),
      },
      byStage: {
        hero: safeNum(parsed.byStage?.hero),
        studio: safeNum(parsed.byStage?.studio),
        architecture: safeNum(parsed.byStage?.architecture),
        specs: safeNum(parsed.byStage?.specs),
        about: safeNum(parsed.byStage?.about),
      },
      transitions:
        parsed.transitions && typeof parsed.transitions === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.transitions)
                .slice(0, 32)
                .map(([k, v]) => [k, safeNum(v)])
            )
          : {},
      lastSwitchAt:
        typeof parsed.lastSwitchAt === 'number' && Number.isFinite(parsed.lastSwitchAt)
          ? parsed.lastSwitchAt
          : null,
    };
  } catch {
    return empty;
  }
}

export function createStageSwitchTracker(initial?: StageAnalyticsSnapshot): StageSwitchTracker {
  let state: StageAnalyticsSnapshot = initial ?? loadStoredAnalyticsSnapshot();

  const persist = (next: StageAnalyticsSnapshot) => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(STAGE_ANALYTICS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota or private-mode restrictions
    }
  };

  return {
    recordSwitch(fromStage, toStage, interaction, trigger, prevInteraction) {
      const fromBucket = resolveStageAnalyticsBucket(fromStage, prevInteraction ?? interaction);
      const toBucket = resolveStageAnalyticsBucket(toStage, interaction);

      if (fromStage === toStage && fromBucket === toBucket) {
        return null;
      }

      const timestamp = Date.now();
      const transitionKey = `${fromBucket}->${toBucket}`;
      const nextByBucket: Record<StageAnalyticsBucket, number> = {
        ...state.byBucket,
        [toBucket]: state.byBucket[toBucket] + 1,
      };
      const nextByStage: Record<StageId, number> = {
        ...state.byStage,
        [toStage]: state.byStage[toStage] + 1,
      };
      const nextTransitions: Record<string, number> = {
        ...state.transitions,
        [transitionKey]: (state.transitions[transitionKey] ?? 0) + 1,
      };

      const nextState: StageAnalyticsSnapshot = {
        totalSwitches: state.totalSwitches + 1,
        byBucket: nextByBucket,
        byStage: nextByStage,
        transitions: nextTransitions,
        lastSwitchAt: timestamp,
      };
      state = nextState;
      persist(nextState);

      const detail: StageSwitchEventDetail = {
        fromStage,
        toStage,
        fromBucket,
        toBucket,
        trigger,
        timestamp,
        counts: nextByBucket,
        stageCounts: nextByStage,
        totalSwitches: nextState.totalSwitches,
      };

      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
          new CustomEvent<StageSwitchEventDetail>('ainvtry:stage-switch', { detail })
        );
      }

      return detail;
    },
    getSnapshot() {
      return {
        totalSwitches: state.totalSwitches,
        byBucket: { ...state.byBucket },
        byStage: { ...state.byStage },
        transitions: { ...state.transitions },
        lastSwitchAt: state.lastSwitchAt,
      };
    },
    reset() {
      state = createEmptyAnalyticsSnapshot();
      persist(state);
    },
  };
}

const BUCKET_COLORS: Readonly<Record<StageAnalyticsBucket, string>> = {
  hero: '#d6b889',
  tryOn: '#9b958c',
  calendar: '#b8a283',
  other: '#6f737b',
};

const STAGE_COLORS: Readonly<Record<StageId, string>> = {
  hero: '#d6b889',
  studio: '#b8a283',
  architecture: '#8c877f',
  specs: '#6f737b',
  about: '#a69882',
};

const PIE_PALETTE = [
  '#d6b889',
  '#a69882',
  '#8c877f',
  '#6f737b',
  '#b8a993',
  '#565a63',
] as const;

export function getBucketLabel(bucket: StageAnalyticsBucket, lang: SiteLang): string {
  if (lang === 'ko') {
    switch (bucket) {
      case 'hero':
        return '히어로';
      case 'tryOn':
        return '가상 피팅';
      case 'calendar':
        return '케어 · 가치';
      case 'other':
        return '아키텍처 · 스펙';
    }
  }
  switch (bucket) {
    case 'hero':
      return 'Hero';
    case 'tryOn':
      return 'Virtual Fit';
    case 'calendar':
      return 'Care & Value';
    case 'other':
      return 'Arch & Specs';
  }
}

export function getStageLabel(stage: StageId, lang: SiteLang): string {
  if (lang === 'ko') {
    switch (stage) {
      case 'hero':
        return '히어로';
      case 'studio':
        return '스튜디오';
      case 'architecture':
        return '기술 구조';
      case 'specs':
        return '핵심 지표';
      case 'about':
        return '여정 · 소개';
    }
  }
  switch (stage) {
    case 'hero':
      return 'Hero';
    case 'studio':
      return 'Studio';
    case 'architecture':
      return 'Architecture';
    case 'specs':
      return 'Specs';
    case 'about':
      return 'About';
  }
}

export function buildStagePreferenceBars(
  snapshot: Readonly<StageAnalyticsSnapshot>,
  mode: 'bucket' | 'stage',
  lang: SiteLang
): readonly StagePreferenceBarItem[] {
  if (mode === 'bucket') {
    const order: readonly StageAnalyticsBucket[] = ['hero', 'tryOn', 'calendar', 'other'];
    const total = order.reduce((acc, k) => acc + snapshot.byBucket[k], 0);
    const maxCount = Math.max(1, ...order.map((k) => snapshot.byBucket[k]));

    return order.map((id) => {
      const count = snapshot.byBucket[id];
      const sharePct = total > 0 ? Math.round((count / total) * 100) : 0;
      const targetStage: StageId =
        id === 'hero'
          ? 'hero'
          : id === 'tryOn' || id === 'calendar'
            ? 'studio'
            : 'architecture';
      const targetStudioSubtab: StageInteractionState['studioSubtab'] | undefined =
        id === 'tryOn' ? 'atelier' : id === 'calendar' ? 'intelligence' : undefined;

      const shortHint =
        lang === 'ko'
          ? id === 'hero'
            ? '실크 · 구슬 메인'
            : id === 'tryOn'
              ? 'Three.js 3D · 라이브 앱'
              : id === 'calendar'
                ? '착용 기록 · 여정'
                : '기술 구조 · 지표'
          : id === 'hero'
            ? 'Silk & marble home'
            : id === 'tryOn'
              ? 'Three.js 3D & live app'
              : id === 'calendar'
                ? 'Care, value & journey'
                : 'Architecture & specs';

      return {
        id,
        label: getBucketLabel(id, lang),
        shortHint,
        count,
        sharePct,
        ratio: total > 0 ? count / maxCount : 0,
        color: BUCKET_COLORS[id],
        targetStage,
        targetStudioSubtab,
      };
    });
  }

  const stages: readonly StageId[] = ['hero', 'studio', 'architecture', 'specs', 'about'];
  const total = stages.reduce((acc, s) => acc + snapshot.byStage[s], 0);
  const maxCount = Math.max(1, ...stages.map((s) => snapshot.byStage[s]));

  return stages.map((stage) => {
    const count = snapshot.byStage[stage];
    const sharePct = total > 0 ? Math.round((count / total) * 100) : 0;
    return {
      id: stage,
      label: getStageLabel(stage, lang),
      shortHint: stage.toUpperCase(),
      count,
      sharePct,
      ratio: total > 0 ? count / maxCount : 0,
      color: STAGE_COLORS[stage],
      targetStage: stage,
    };
  });
}

function formatTransitionLabel(rawKey: string, lang: SiteLang): string {
  const [fromRaw, toRaw] = rawKey.split('->');
  const buckets: readonly StageAnalyticsBucket[] = ['hero', 'tryOn', 'calendar', 'other'];
  const isBucket = (v: string): v is StageAnalyticsBucket =>
    buckets.includes(v as StageAnalyticsBucket);

  const fromText = isBucket(fromRaw) ? getBucketLabel(fromRaw, lang) : fromRaw || '—';
  const toText = isBucket(toRaw) ? getBucketLabel(toRaw, lang) : toRaw || '—';
  return `${fromText} → ${toText}`;
}

export function buildTransitionSlices(
  snapshot: Readonly<StageAnalyticsSnapshot>,
  lang: SiteLang
): readonly TransitionPieSlice[] {
  const entries = Object.entries(snapshot.transitions)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total <= 0) return [];

  const maxPrimary = 5;
  const grouped: Array<{ id: string; label: string; count: number }> = [];
  let tailCount = 0;

  entries.forEach(([key, count], idx) => {
    if (idx < maxPrimary) {
      grouped.push({
        id: key,
        label: formatTransitionLabel(key, lang),
        count,
      });
    } else {
      tailCount += count;
    }
  });

  if (tailCount > 0) {
    grouped.push({
      id: 'other-paths',
      label: lang === 'ko' ? '기타 전환 경로' : 'Other transitions',
      count: tailCount,
    });
  }

  let cursor = 0;
  return grouped.map((item, idx) => {
    const span = (item.count / total) * 360;
    const startAngle = cursor;
    const endAngle = cursor + span;
    cursor = endAngle;
    return {
      id: item.id,
      label: item.label,
      count: item.count,
      sharePct: Math.round((item.count / total) * 100),
      startAngle,
      endAngle,
      color: PIE_PALETTE[idx % PIE_PALETTE.length],
    };
  });
}
