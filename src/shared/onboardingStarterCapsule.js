/**
 * Shared Onboarding 2.0 constants, demographic body defaults, and personalized
 * 6-piece starter capsule curator (consumed by both Node Express and React UI).
 */
import { SEASONAL_120_CATALOG } from './seasonal120Catalog.js';

export const ONBOARDING_STEP_KEYS = Object.freeze([
  'identity_body',
  'skin_face',
  'closet_seed',
  'first_tryon',
]);

export const ONBOARDING_STATUS_VALUES = Object.freeze([
  'not_started',
  'in_progress',
  'deferred',
  'completed',
]);

export const STARTER_CAPSULE_NOTE_TAG = '[starter_capsule]';

export const ONBOARDING_AGE_GROUP_OPTIONS = Object.freeze([
  { key: '10s', ko: '10대', en: 'Teens', midAge: 17, styleBias: 'casual' },
  { key: '20s', ko: '20대', en: '20s', midAge: 25, styleBias: 'smart' },
  { key: '30s', ko: '30대', en: '30s', midAge: 34, styleBias: 'smart' },
  { key: '40s', ko: '40대', en: '40s', midAge: 44, styleBias: 'formal' },
  { key: '50s', ko: '50대', en: '50s', midAge: 54, styleBias: 'formal' },
  { key: '60s', ko: '60대+', en: '60s+', midAge: 64, styleBias: 'formal' },
]);

export const ONBOARDING_SILHOUETTE_OPTIONS = Object.freeze([
  { key: 'ectomorph_thin', ko: '슬림', en: 'Slim', archetype: 'petite' },
  { key: 'standard_balanced', ko: '스탠다드', en: 'Standard', archetype: 'rectangle' },
  { key: 'muscular_athletic', ko: '애슬레틱', en: 'Athletic', archetype: 'athletic' },
  { key: 'plus_curvy', ko: '소프트', en: 'Soft', archetype: 'plus_size' },
]);

// Size Korea demographic averages (cm / kg) for instant frictionless Step 1 defaults
const DEMOGRAPHIC_BODY_AVERAGES = Object.freeze({
  male: {
    '10s': { heightCm: 173, weightKg: 66 },
    '20s': { heightCm: 174, weightKg: 72 },
    '30s': { heightCm: 174, weightKg: 75 },
    '40s': { heightCm: 173, weightKg: 75 },
    '50s': { heightCm: 170, weightKg: 72 },
    '60s': { heightCm: 168, weightKg: 69 },
  },
  female: {
    '10s': { heightCm: 161, weightKg: 52 },
    '20s': { heightCm: 162, weightKg: 54 },
    '30s': { heightCm: 161, weightKg: 56 },
    '40s': { heightCm: 160, weightKg: 57 },
    '50s': { heightCm: 158, weightKg: 57 },
    '60s': { heightCm: 156, weightKg: 56 },
  },
});

/**
 * @param {string | null | undefined} rawAgeGroup
 * @param {number | string | null} [rawAge=null]
 * @returns {'10s' | '20s' | '30s' | '40s' | '50s' | '60s' | null}
 */
export function normalizeOnboardingAgeGroup(rawAgeGroup, rawAge = null) {
  const token = String(rawAgeGroup || '').trim().toLowerCase();
  if (token === 'under_10' || token === '10s') return '10s';
  if (token === '20s') return '20s';
  if (token === '30s') return '30s';
  if (token === '40s') return '40s';
  if (token === '50s') return '50s';
  if (token === '60s' || token === '70s' || token === '80s' || token === '90s_plus') return '60s';

  const ageNum = Number(rawAge);
  if (Number.isFinite(ageNum) && ageNum > 0) {
    if (ageNum < 20) return '10s';
    if (ageNum < 30) return '20s';
    if (ageNum < 40) return '30s';
    if (ageNum < 50) return '40s';
    if (ageNum < 60) return '50s';
    return '60s';
  }
  return null;
}

/**
 * @param {string | null | undefined} [gender='male']
 * @param {string | null | undefined} [ageGroup='30s']
 * @returns {{ heightCm: number; weightKg: number }}
 */
export function getDefaultBodyStatsForDemographic(gender = 'male', ageGroup = '30s') {
  const g = gender === 'female' ? 'female' : 'male';
  const ag = normalizeOnboardingAgeGroup(ageGroup) || '30s';
  return { ...(DEMOGRAPHIC_BODY_AVERAGES[g][ag] || DEMOGRAPHIC_BODY_AVERAGES[g]['30s']) };
}

/**
 * @param {string | null | undefined} rawStep
 * @returns {'identity_body' | 'skin_face' | 'closet_seed' | 'first_tryon'}
 */
export function normalizeOnboardingStepKey(rawStep) {
  const s = String(rawStep || '').trim();
  if (s === 'identity_body' || s === 'skin_face' || s === 'closet_seed' || s === 'first_tryon') {
    return s;
  }
  return 'identity_body';
}

/**
 * @param {string | null | undefined} rawStatus
 * @returns {'not_started' | 'in_progress' | 'deferred' | 'completed'}
 */
export function normalizeOnboardingStatus(rawStatus) {
  const s = String(rawStatus || '').trim();
  if (s === 'not_started' || s === 'in_progress' || s === 'deferred' || s === 'completed') {
    return s;
  }
  return 'not_started';
}

/**
 * @param {unknown} rawJson
 * @returns {Record<string, boolean | string>}
 */
export function parseOnboardingStepsJson(rawJson) {
  if (!rawJson) return {};
  if (typeof rawJson === 'object' && !Array.isArray(rawJson)) return { ...rawJson };
  try {
    const parsed = JSON.parse(String(rawJson));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, any> | null | undefined} userRow
 * @returns {{
 *   status: 'not_started' | 'in_progress' | 'deferred' | 'completed';
 *   currentStep: 'identity_body' | 'skin_face' | 'closet_seed' | 'first_tryon';
 *   steps: Record<string, boolean | string>;
 *   completedCount: number;
 *   totalSteps: number;
 *   completedAt: string | null;
 * }}
 */
export function computeOnboardingSummary(userRow) {
  const status = normalizeOnboardingStatus(userRow?.onboarding_status ?? userRow?.onboardingStatus);
  const currentStep = normalizeOnboardingStepKey(userRow?.onboarding_step ?? userRow?.onboardingStep);
  const steps = parseOnboardingStepsJson(
    userRow?.onboarding_steps_json ?? userRow?.onboardingStepsJson ?? userRow?.steps
  );

  // Backfill inferred completion ticks for partial legacy data
  const effectiveSteps = { ...steps };
  if (
    !effectiveSteps.identity_body &&
    (userRow?.gender === 'male' || userRow?.gender === 'female') &&
    Number(userRow?.height_cm ?? userRow?.heightCm ?? 0) >= 100
  ) {
    effectiveSteps.identity_body = true;
  }
  if (
    !effectiveSteps.skin_face &&
    Boolean(userRow?.personal_color ?? userRow?.personalColor) &&
    Boolean(userRow?.skin_tone_hex ?? userRow?.skinToneHex)
  ) {
    effectiveSteps.skin_face = true;
  }

  let completedCount = 0;
  for (const key of ONBOARDING_STEP_KEYS) {
    if (effectiveSteps[key]) completedCount += 1;
  }
  if (status === 'completed') {
    completedCount = ONBOARDING_STEP_KEYS.length;
  }

  return {
    status,
    currentStep,
    steps: effectiveSteps,
    completedCount,
    totalSteps: ONBOARDING_STEP_KEYS.length,
    completedAt: userRow?.onboarding_completed_at ?? userRow?.onboardingCompletedAt ?? null,
  };
}

const SEASON_COLOR_AFFINITY = Object.freeze({
  spring_warm: ['베이지', '아이보리', '크림', '올리브', '카멜', '화이트', '라이트', '스카이'],
  summer_cool: ['화이트', '라이트', '그레이', '실버', '스카이', '네이비', '차콜', '라벤더'],
  autumn_warm: ['카멜', '브라운', '베이지', '올리브', '버건디', '차콜', '아이보리', '네이비'],
  winter_cool: ['블랙', '화이트', '차콜', '네이비', '그레이', '실버', '버건디', '인디고'],
});

const FEMININE_ONLY_SUBCATS = new Set(['skirt', 'pleated_skirt', 'midi_skirt', 'mini_skirt', 'dress', 'heels', 'mary_jane']);

function scoreStarterItem(item, { personalColor, gender, ageGroup }) {
  let score = 0;
  const pc = String(personalColor || 'autumn_warm').toLowerCase();
  const affinityTokens = SEASON_COLOR_AFFINITY[pc] || SEASON_COLOR_AFFINITY.autumn_warm;
  const colorLabel = String(item.color_name || '').toLowerCase();
  const nameLower = String(item.name || '').toLowerCase();

  for (let i = 0; i < affinityTokens.length; i += 1) {
    if (colorLabel.includes(affinityTokens[i].toLowerCase())) {
      score += 18 - i;
      break;
    }
  }

  const ag = normalizeOnboardingAgeGroup(ageGroup) || '30s';
  const formality = String(item.formality || 'smart').toLowerCase();
  if (ag === '10s' || ag === '20s') {
    if (formality === 'casual' || formality === 'smart') score += 10;
  } else if (ag === '30s' || ag === '40s') {
    if (formality === 'smart' || formality === 'formal') score += 12;
  } else {
    if (formality === 'formal' || formality === 'smart') score += 12;
  }

  // Prefer versatile 2+ season staples for an immediately usable capsule
  if (Array.isArray(item.seasons) && item.seasons.length >= 2) {
    score += 6;
  }

  const sub = String(item.subcategory || '').toLowerCase();
  if (gender === 'male' && (FEMININE_ONLY_SUBCATS.has(sub) || nameLower.includes('스커트') || nameLower.includes('원피스'))) {
    score -= 1000;
  }

  return score;
}

/**
 * Curates a balanced 6-piece monochrome/personal-color starter capsule
 * (1 outer, 2 tops, 2 bottoms, 1 shoes) using authentic `.webp` studio cutouts.
 */
export function selectStarterCapsule6({
  personalColor = 'autumn_warm',
  gender = 'male',
  ageGroup = '30s',
} = {}) {
  const ctx = { personalColor, gender, ageGroup };
  const slotQuotas = [
    { category: 'outer', count: 1 },
    { category: 'top', count: 2 },
    { category: 'bottom', count: 2 },
    { category: 'shoes', count: 1 },
  ];

  const picked = [];
  const usedKeys = new Set();
  const usedSubcats = new Set();

  for (const { category, count } of slotQuotas) {
    const candidates = SEASONAL_120_CATALOG.filter(
      (item) => item.category === category && !usedKeys.has(item.key) && Boolean(item.image_url)
    )
      .map((item) => ({ item, score: scoreStarterItem(item, ctx) }))
      .filter((entry) => entry.score > -500)
      .sort((a, b) => b.score - a.score || a.item.idOffset - b.item.idOffset);

    let added = 0;
    for (const { item } of candidates) {
      if (added >= count) break;
      // Encourage subcategory variety inside top/bottom pairs (e.g. shirt + knit, slacks + denim)
      if (count > 1 && added > 0 && usedSubcats.has(`${category}:${item.subcategory}`) && candidates.length > count + 2) {
        continue;
      }
      picked.push(item);
      usedKeys.add(item.key);
      usedSubcats.add(`${category}:${item.subcategory}`);
      added += 1;
    }

    // Backfill if diversity skip left slot short
    if (added < count) {
      for (const { item } of candidates) {
        if (added >= count) break;
        if (usedKeys.has(item.key)) continue;
        picked.push(item);
        usedKeys.add(item.key);
        added += 1;
      }
    }
  }

  return picked;
}
