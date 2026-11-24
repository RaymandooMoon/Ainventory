import type { ActiveStageId, StageInteractionState } from '../../three/ainvtryStageDirector.ts';
import type { SiteCopy } from '../siteContent.ts';

export type TopControlsDockKind = 'none' | 'studio-3d' | 'arch-mode' | 'arch-weather';

export function normalizeTurntableDegrees(angleRad: number): number {
  if (!Number.isFinite(angleRad)) return 0;
  const deg = Math.round(((angleRad * 180) / Math.PI) % 360);
  const wrapped = deg < 0 ? deg + 360 : deg;
  return wrapped === 0 || wrapped === 360 ? 0 : wrapped;
}

export function getTopControlsDockKind(
  activeStage: ActiveStageId,
  interaction: StageInteractionState,
  copy: SiteCopy
): TopControlsDockKind {
  if (activeStage === 'studio' && interaction.studioSubtab === 'atelier') {
    return 'studio-3d';
  }
  if (activeStage === 'architecture' && interaction.architectureSubtab === 'blueprint') {
    return 'arch-mode';
  }
  if (activeStage === 'architecture' && interaction.architectureSubtab === 'maps') {
    const activeApi =
      copy.architecture.mapsNodes[interaction.googleApiIndex] ?? copy.architecture.mapsNodes[0];
    if (activeApi?.id === 'weather') {
      return 'arch-weather';
    }
  }
  return 'none';
}
