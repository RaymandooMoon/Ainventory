export type CanonicalBodyShapeKey =
  | 'ectomorph_thin'
  | 'skinny_fat'
  | 'standard_balanced'
  | 'upper_developed'
  | 'lower_developed'
  | 'muscular_athletic'
  | 'plus_curvy';

export interface BodyShapePresetMorph {
  shoulderScale: number;
  chestScale: number;
  waistScale: number;
  bellyDepth: number;
  hipScale: number;
  thighScale: number;
  calfScale: number;
  armScale: number;
  neckScale: number;
}

export interface ResolvedAnatomicalMorph extends BodyShapePresetMorph {
  heightScale: number;
  headScale: number;
}

export interface BodyShapeOption {
  key: CanonicalBodyShapeKey;
  labelKo: string;
  labelEn: string;
  shortKo: string;
  badge: string;
  summaryKo: string;
  stylingAdviceKo: string;
  defaultBodyFatMale: number;
  defaultBodyFatFemale: number;
  morph: BodyShapePresetMorph;
}

export interface SuggestBodyShapeMetricsInput {
  heightCm?: number | string | null;
  weightKg?: number | string | null;
  gender?: string | null;
  bodyFatPct?: number | string | null;
  chestCm?: number | string | null;
  waistCm?: number | string | null;
  hipCm?: number | string | null;
}

export interface AnatomicalProfileInput {
  gender?: string | null;
  height_cm?: number | string | null;
  heightCm?: number | string | null;
  weight_kg?: number | string | null;
  weightKg?: number | string | null;
  body_shape?: string | null;
  bodyShape?: string | null;
  body_type?: string | null;
  bodyType?: string | null;
  body_fat_pct?: number | string | null;
  bodyFatPct?: number | string | null;
  chest_cm?: number | string | null;
  chestCm?: number | string | null;
  waist_cm?: number | string | null;
  waistCm?: number | string | null;
  hip_cm?: number | string | null;
  hipCm?: number | string | null;
  head_cm?: number | string | null;
  headCm?: number | string | null;
  [key: string]: unknown;
}

export interface ResolvedAnatomicalProfile {
  gender: string;
  heightCm: number;
  weightKg: number;
  bmi: number;
  bmiCategory: string;
  bodyShape: CanonicalBodyShapeKey;
  recommendedShape: CanonicalBodyShapeKey;
  shapeLabelKo: string;
  shapeLabelEn: string;
  shapeShortKo: string;
  shapeBadge: string;
  shapeSummaryKo: string;
  stylingAdviceKo: string;
  bodyFatPct: number;
  chestCm: number;
  waistCm: number;
  hipCm: number;
  headCm: number;
  headToBodyRatio: number;
  defaults: {
    bodyShape: CanonicalBodyShapeKey;
    bodyFatPct: number;
    chestCm: number;
    waistCm: number;
    hipCm: number;
    headCm: number;
  };
  sources: {
    bodyShape: 'user' | 'default';
    bodyFatPct: 'user' | 'default';
    chestCm: 'user' | 'default';
    waistCm: 'user' | 'default';
    hipCm: 'user' | 'default';
    headCm: 'user' | 'default';
  };
  morph: ResolvedAnatomicalMorph;
}

export const BODY_SHAPE_OPTIONS: ReadonlyArray<BodyShapeOption>;
export const BODY_SHAPES: ReadonlyArray<BodyShapeOption>;
export const BODY_SHAPE_MAP: Readonly<Record<string, BodyShapeOption | undefined>>;

export function normalizeBodyShapeKey(raw: unknown): CanonicalBodyShapeKey | null;
export function suggestBodyShapeFromMetrics(
  metrics?: SuggestBodyShapeMetricsInput
): CanonicalBodyShapeKey;
export function recommendBodyShapeFromMetrics(
  metrics?: SuggestBodyShapeMetricsInput
): CanonicalBodyShapeKey;
export function resolveAnatomicalProfile(
  rawProfile?: AnatomicalProfileInput
): ResolvedAnatomicalProfile;
export function getBodyShapeStylingAdvice(bodyShapeKey?: string | null): string;
