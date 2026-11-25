import type { ActiveStageId, StageModule } from '../three/ainvtryStageDirector.ts';

export interface StageFactoryOptions {
  readonly onModelLoaded?: () => void;
}

export type StageFactory = (options?: StageFactoryOptions) => StageModule;

const loadedFactories: Partial<Record<ActiveStageId, StageFactory>> = {};
const inFlightLoads: Partial<Record<ActiveStageId, Promise<StageFactory>>> = {};

export function getLoadedStageFactory(stageId: ActiveStageId): StageFactory | undefined {
  return loadedFactories[stageId];
}

export function preloadStageModule(stageId: ActiveStageId): Promise<StageFactory> {
  const existing = loadedFactories[stageId];
  if (existing) return Promise.resolve(existing);

  const pending = inFlightLoads[stageId];
  if (pending) return pending;

  const loader: Promise<StageFactory> = (async () => {
    if (stageId === 'studio') {
      const mod = await import('../three/stages/studioStage.ts');
      return (opts?: StageFactoryOptions) =>
        mod.createStudioStage({ onModelLoaded: opts?.onModelLoaded });
    }
    if (stageId === 'architecture') {
      const mod = await import('../three/stages/architectureStage.ts');
      return () => mod.createArchitectureStage();
    }
    if (stageId === 'specs') {
      const mod = await import('../three/stages/specsStage.ts');
      return () => mod.createSpecsStage();
    }
    const mod = await import('../three/stages/aboutStage.ts');
    return () => mod.createAboutStage();
  })()
    .then((factory) => {
      loadedFactories[stageId] = factory;
      delete inFlightLoads[stageId];
      return factory;
    })
    .catch((err) => {
      delete inFlightLoads[stageId];
      throw err;
    });

  inFlightLoads[stageId] = loader;
  return loader;
}

/**
 * Best-effort speculative chunk prefetch (e.g. pill hover/focus).
 * Swallows transient offline/network blips so hover never causes unhandled rejections.
 */
export function warmStageModule(stageId: ActiveStageId): void {
  void preloadStageModule(stageId).catch(() => {});
}
