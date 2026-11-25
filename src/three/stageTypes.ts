export type StageId = 'hero' | 'studio' | 'architecture' | 'specs' | 'about';
export type ActiveStageId = Exclude<StageId, 'hero'>;
export type MoodMode = 'luxury' | 'aurora';
export type ThemeMode = 'dark' | 'light';

export interface StageInteractionState {
  studioSubtab: 'preview' | 'atelier' | 'intelligence';
  studioPreviewScreen: 'outfits' | 'closet' | 'stats' | 'profile';
  studioPose: 'stand' | 'walk' | 'rain';
  studioModelMode: 'dressform' | 'mannequin';
  studioAngleRad: number;
  architectureSubtab: 'blueprint' | 'privacy' | 'maps';
  architectureTier: number; // 0..5
  architectureMode: 'mvp' | 'prod';
  googleApiIndex: number; // 0..5
  weatherMood: 'sunny' | 'rain' | 'wind';
  specsSubtab: 'kpi' | 'matrix' | 'fitting' | 'care';
  specsFocusedIndex: number; // 0..5
  aboutSubtab: 'journey' | 'mission' | 'founder';
  aboutJourneyIndex: number; // 0..5
  aboutLoopIndex: number; // 0..4
  aboutLoopPaused: boolean;
}

export const DEFAULT_STAGE_INTERACTION_STATE: Readonly<StageInteractionState> = {
  studioSubtab: 'atelier',
  studioPreviewScreen: 'outfits',
  studioPose: 'stand',
  studioModelMode: 'mannequin',
  studioAngleRad: 0,
  architectureSubtab: 'blueprint',
  architectureTier: 3, // 04 iNVTRY Core active by default
  architectureMode: 'mvp',
  googleApiIndex: 0,
  weatherMood: 'rain',
  specsSubtab: 'kpi',
  specsFocusedIndex: 0,
  aboutSubtab: 'journey',
  aboutJourneyIndex: 0,
  aboutLoopIndex: 0,
  aboutLoopPaused: false,
};
