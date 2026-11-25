import { RotateCcw, RotateCw } from 'lucide-react';
import type { ActiveStageId, StageInteractionState } from '../../three/ainvtryStageDirector.ts';
import { triggerHaptic } from '../../utils/nativeBridge.ts';
import type { SiteCopy, SiteLang, StudioPoseId, WeatherMoodId } from '../siteContent.ts';
import {
  getTopControlsDockKind,
  normalizeTurntableDegrees,
} from './topControlsDockState.ts';

export interface StageTopControlsDockProps {
  readonly activeStage: ActiveStageId;
  readonly copy: SiteCopy;
  readonly lang: SiteLang;
  readonly interaction: StageInteractionState;
  readonly onUpdateInteraction: (patch: Partial<StageInteractionState>) => void;
}

/**
 * Top-Pinned Floating 3D Control Dock (Stitch v5 Variant A).
 * Keeps live 3D switching controls (model mode, stance, turntable angle, architecture scale,
 * and 3D weather mood) permanently accessible right under the top utility bar on both mobile
 * and desktop without obstructing the 3D subject or hiding behind a collapsed sheet.
 */
export function StageTopControlsDock({
  activeStage,
  copy,
  lang,
  interaction,
  onUpdateInteraction,
}: StageTopControlsDockProps) {
  const dockKind = getTopControlsDockKind(activeStage, interaction, copy);
  if (dockKind === 'none') return null;

  if (dockKind === 'studio-3d') {
    const activeModelMode = interaction.studioModelMode ?? 'mannequin';
    const angleDeg = normalizeTurntableDegrees(interaction.studioAngleRad);

    const modelModes: readonly {
      readonly id: StageInteractionState['studioModelMode'];
      readonly label: string;
    }[] = [
      { id: 'mannequin', label: lang === 'ko' ? '전신' : 'Full' },
      { id: 'dressform', label: lang === 'ko' ? '코트' : 'Coat' },
    ];

    const poses: readonly { readonly id: StudioPoseId; readonly label: string }[] = [
      { id: 'stand', label: copy.interactive.stanceIdle },
      { id: 'walk', label: copy.interactive.stanceWalk },
      { id: 'rain', label: copy.interactive.stanceRain },
    ];

    return (
      <div
        className="site-top-3d-dock"
        data-dock-kind="studio-3d"
        data-hud-surface="true"
        data-no-marble="true"
        role="region"
        aria-label={lang === 'ko' ? '3D 모델 전환 컨트롤' : '3D stage switcher controls'}
      >
        <div className="site-top-3d-dock-inner">
          <div className="site-top-dock-row site-top-dock-row--primary">
            <div
              className="hud-segmented hud-segmented--top-model"
              role="group"
              aria-label={lang === 'ko' ? '3D 모델 전환' : '3D model mode'}
            >
              {modelModes.map((mode) => {
                const isSelected = activeModelMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={isSelected}
                    className={`hud-seg-btn ${isSelected ? 'is-active' : ''}`}
                    onClick={() => {
                      triggerHaptic('selection');
                      onUpdateInteraction({ studioModelMode: mode.id });
                    }}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>

            <div className="hud-angle-ctrl hud-angle-ctrl--top">
              <button
                type="button"
                className="hud-icon-step-btn"
                aria-label={lang === 'ko' ? '-45도 회전' : 'Rotate -45 degrees'}
                onClick={() => {
                  triggerHaptic('selection');
                  onUpdateInteraction({
                    studioAngleRad: interaction.studioAngleRad - Math.PI * 0.25,
                  });
                }}
              >
                <RotateCcw size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="hud-angle-readout"
                title={lang === 'ko' ? '정면 0°로 초기화' : 'Reset 0°'}
                aria-label={
                  lang === 'ko'
                    ? `현재 회전 각도 ${angleDeg}도, 탭하여 0도로 초기화`
                    : `Current angle ${angleDeg} degrees, reset to 0 degrees`
                }
                onClick={() => {
                  triggerHaptic('selection');
                  onUpdateInteraction({ studioAngleRad: 0 });
                }}
              >
                {angleDeg}°
              </button>
              <button
                type="button"
                className="hud-icon-step-btn"
                aria-label={lang === 'ko' ? '+45도 회전' : 'Rotate +45 degrees'}
                onClick={() => {
                  triggerHaptic('selection');
                  onUpdateInteraction({
                    studioAngleRad: interaction.studioAngleRad + Math.PI * 0.25,
                  });
                }}
              >
                <RotateCw size={13} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="site-top-dock-row site-top-dock-row--poses">
            <div
              className="hud-segmented hud-segmented--top-poses"
              role="group"
              aria-label={lang === 'ko' ? '3D 포즈 및 모션 전환' : '3D pose posture'}
            >
              {poses.map((pose) => {
                const isSelected = interaction.studioPose === pose.id;
                return (
                  <button
                    key={pose.id}
                    type="button"
                    aria-pressed={isSelected}
                    className={`hud-seg-btn ${isSelected ? 'is-active' : ''}`}
                    onClick={() => {
                      triggerHaptic('selection');
                      onUpdateInteraction({ studioPose: pose.id });
                    }}
                  >
                    {pose.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (dockKind === 'arch-mode') {
    const arch = copy.architecture;
    const isMvp = interaction.architectureMode === 'mvp';

    return (
      <div
        className="site-top-3d-dock"
        data-dock-kind="arch-mode"
        data-hud-surface="true"
        data-no-marble="true"
        role="region"
        aria-label={lang === 'ko' ? '3D 아키텍처 스케일 전환' : '3D deployment scale controls'}
      >
        <div className="site-top-3d-dock-inner site-top-3d-dock-inner--single">
          <div
            className="hud-segmented hud-segmented--full"
            role="group"
            aria-label={lang === 'ko' ? '배포 스케일 모드' : 'Deployment scale mode'}
          >
            <button
              type="button"
              aria-pressed={isMvp}
              className={`hud-seg-btn ${isMvp ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                onUpdateInteraction({ architectureMode: 'mvp', architectureTechIndex: null });
              }}
            >
              {arch.modeDevLabel}
            </button>
            <button
              type="button"
              aria-pressed={!isMvp}
              className={`hud-seg-btn ${!isMvp ? 'is-active' : ''}`}
              onClick={() => {
                triggerHaptic('selection');
                onUpdateInteraction({ architectureMode: 'prod', architectureTechIndex: null });
              }}
            >
              {arch.modeProdLabel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // dockKind === 'arch-weather'
  const arch = copy.architecture;
  const weatherOptions: readonly { readonly id: WeatherMoodId; readonly label: string }[] = [
    { id: 'sunny', label: arch.weatherMoods.sunny },
    { id: 'rain', label: arch.weatherMoods.rain },
    { id: 'wind', label: arch.weatherMoods.wind },
  ];

  return (
    <div
      className="site-top-3d-dock"
      data-dock-kind="arch-weather"
      data-hud-surface="true"
      data-no-marble="true"
      role="region"
      aria-label={lang === 'ko' ? '3D 날씨 시뮬레이션 전환' : '3D weather simulation controls'}
    >
      <div className="site-top-3d-dock-inner site-top-3d-dock-inner--single">
        <div
          className="hud-segmented hud-segmented--full"
          role="group"
          aria-label={lang === 'ko' ? '3D 날씨 모드' : '3D weather mode'}
        >
          {weatherOptions.map((item) => {
            const isSelected = interaction.weatherMood === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isSelected}
                className={`hud-seg-btn ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  triggerHaptic('selection');
                  onUpdateInteraction({ weatherMood: item.id });
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
