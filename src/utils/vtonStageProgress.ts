export type VtonStageProgressPhase =
  | 'idle'
  | 'repairing_angle'
  | 'front_anchor'
  | 'turnaround_streaming';

export interface VtonStageProgressInput {
  aiLoading: boolean;
  progressiveBgAnglesLoading?: boolean;
  isRepairingAngle?: boolean;
  readyAnglesCount?: number;
  totalAnglesCount?: number;
  elapsedMs?: number;
  activeAngleDeg?: number;
  equippedCount?: number;
  lang?: 'ko' | 'en' | string;
}

export interface VtonStageProgressState {
  visible: boolean;
  phase: VtonStageProgressPhase;
  badge: string;
  label: string;
  progressPct: number;
  readyAnglesCount: number;
  totalAnglesCount: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Computes a smooth, stage-aware progress readout and percentage for the Studio fitting HUD pill.
 * - During 0° master anchor synthesis (`aiLoading`): advances smoothly along a realistic
 *   asymptotic time curve (10% -> 94%) across four clear fitting sub-stages.
 * - During 360° background angle streaming (`progressiveBgAnglesLoading`): reflects the real
 *   `readyAnglesCount / totalAnglesCount` fraction plus gentle intra-wave movement (capped at 97%).
 * - During single-angle repair (`isRepairingAngle`): shows exact angle badge and repair progress.
 */
export function computeVtonStageProgress(
  input: VtonStageProgressInput
): VtonStageProgressState {
  const isEn = input.lang === 'en';
  const total = Math.max(1, Math.round(Number(input.totalAnglesCount) || 8));
  const ready = clamp(Math.round(Number(input.readyAnglesCount) || 0), 0, total);
  const elapsed = Math.max(0, Number(input.elapsedMs) || 0);
  const angleDeg = Number.isFinite(Number(input.activeAngleDeg))
    ? Math.round(Number(input.activeAngleDeg))
    : 0;

  if (input.isRepairingAngle) {
    const pct = Math.round(clamp(16 + (1 - Math.exp(-elapsed / 6500)) * 76, 16, 92));
    return {
      visible: true,
      phase: 'repairing_angle',
      badge: `${angleDeg}°`,
      label: isEn
        ? `Refining ${angleDeg}° angle...`
        : `${angleDeg}° 각도를 정밀 교정하고 있어요`,
      progressPct: pct,
      readyAnglesCount: ready,
      totalAnglesCount: total,
    };
  }

  if (input.aiLoading) {
    // Smooth asymptotic progress: reaches ~28% by 2.4s, ~62% by 8.5s, ~84% by 15.5s, capped at 94%
    const pct = Math.round(clamp(10 + (1 - Math.exp(-elapsed / 9000)) * 84, 10, 94));
    const itemCount = Math.max(0, Math.round(Number(input.equippedCount) || 0));

    let label: string;
    if (elapsed < 2400) {
      label = isEn
        ? itemCount > 0
          ? `Analyzing ${itemCount} items & body fit`
          : 'Analyzing outfit & body fit'
        : itemCount > 0
          ? `착장 ${itemCount}종과 체형을 분석하고 있어요`
          : '착장과 체형을 분석하고 있어요';
    } else if (elapsed < 8500) {
      label = isEn
        ? 'Generating AI virtual try-on'
        : 'AI 가상 피팅 모델을 생성하고 있어요';
    } else if (elapsed < 15500) {
      label = isEn
        ? 'Refining fabric drape & fit details'
        : '원단 드레이프와 핏을 다듬고 있어요';
    } else {
      label = isEn
        ? 'Finalizing virtual try-on look'
        : '가상 피팅 결과를 마무리하고 있어요';
    }

    return {
      visible: true,
      phase: 'front_anchor',
      badge: isEn ? 'AI Fit' : 'AI 피팅',
      label,
      progressPct: pct,
      readyAnglesCount: ready,
      totalAnglesCount: total,
    };
  }

  if (input.progressiveBgAnglesLoading && ready < total) {
    const completedBase = (ready / total) * 100;
    const stepSpan = (1 / total) * 100;
    const intraWaveBoost = (1 - Math.exp(-elapsed / 6000)) * (stepSpan * 0.82);
    const pct = Math.round(clamp(Math.max(14, completedBase + intraWaveBoost), 14, 97));

    return {
      visible: true,
      phase: 'turnaround_streaming',
      badge: `${ready}/${total}`,
      label: isEn
        ? `Rendering 360° angles (${ready}/${total})`
        : `360° 다각도 모델 생성 중 (${ready}/${total})`,
      progressPct: pct,
      readyAnglesCount: ready,
      totalAnglesCount: total,
    };
  }

  return {
    visible: false,
    phase: 'idle',
    badge: '',
    label: '',
    progressPct: 0,
    readyAnglesCount: ready,
    totalAnglesCount: total,
  };
}
