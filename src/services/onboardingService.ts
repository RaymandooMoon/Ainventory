import type { GarmentRecord, UserProfile } from '../contracts/carbonDesignContract.ts';
import {
  ONBOARDING_STEP_KEYS,
  type selectStarterCapsule6,
} from '../shared/onboardingStarterCapsule.js';
import { apiFetch, isSiteDemoUser } from '../utils/api.ts';

export type OnboardingStepKey = 'identity_body' | 'skin_face' | 'closet_seed' | 'first_tryon';
export type OnboardingStatus = 'not_started' | 'in_progress' | 'deferred' | 'completed';
export type OnboardingPresentation = 'none' | 'wizard' | 'banner';

export type StarterCapsulePreviewItem = ReturnType<typeof selectStarterCapsule6>[number];

export interface OnboardingStepPatchPayload {
  status?: 'in_progress' | 'deferred';
  currentStep?: OnboardingStepKey;
  stepsPatch?: Record<string, boolean | string>;
  gender?: 'male' | 'female';
  lockGender?: boolean;
  ageGroup?: string;
  age?: number;
  heightCm?: number;
  weightKg?: number;
  bodyShape?: string;
  personalColor?: string;
  skinToneHex?: string;
  handedness?: 'right' | 'left';
}

export interface OnboardingUserResponse {
  ok?: boolean;
  user?: UserProfile;
}

export interface StarterCapsuleImportResponse {
  ok?: boolean;
  count?: number;
  insertedCount?: number;
  garments?: GarmentRecord[];
  user?: UserProfile;
}

export interface StarterCapsuleClearResponse {
  ok?: boolean;
  removedCount?: number;
  user?: UserProfile;
}

export function isEligibleForOnboarding(user: UserProfile | null | undefined): boolean {
  if (!user) return false;
  if (user.isSampleDemo || isSiteDemoUser(user)) return false;
  if (user.role === 'guest' || user.role === 'site_demo') return false;
  const uname = String(user.username || '').toLowerCase();
  if (uname === 'husband' || uname === 'wife' || uname === 'admin' || uname === 'site_demo') {
    return false;
  }
  return true;
}

/**
 * Determines whether to show the Onboarding 2.0 wizard, the slim top Resume banner, or nothing.
 * - New signups (`google_new`, `not_started` + `!profileCompleted`, or `in_progress`) -> `'wizard'`
 * - Deferred users or legacy pre-v2 0-garment incomplete accounts -> `'banner'`
 * - Completed or demo accounts -> `'none'`
 */
export function resolveOnboardingPresentation(
  user: UserProfile | null | undefined,
  liveGarmentCount?: number | null,
  authResult?: string | null
): OnboardingPresentation {
  if (!isEligibleForOnboarding(user)) return 'none';

  const status = user?.onboarding?.status || 'not_started';
  if (status === 'completed') return 'none';

  if (authResult === 'google_new') return 'wizard';
  if (status === 'in_progress') return 'wizard';
  if (status === 'not_started' && user?.profileCompleted === false) return 'wizard';

  if (status === 'deferred') return 'banner';

  const resolvedGarments =
    typeof liveGarmentCount === 'number' && Number.isFinite(liveGarmentCount)
      ? liveGarmentCount
      : Number(user?.garmentCount ?? 0);

  // Rescue existing pre-v2 accounts that prematurely got profileCompleted=true while still having 0 garments
  if (status === 'not_started' && resolvedGarments === 0) {
    return 'banner';
  }

  return 'none';
}

export function resolveInitialOnboardingStep(
  user: UserProfile | null | undefined,
  liveGarmentCount?: number | null
): OnboardingStepKey {
  const ob = user?.onboarding;
  const rawStep = ob?.currentStep;
  if (
    (ob?.status === 'in_progress' || ob?.status === 'deferred') &&
    rawStep &&
    ONBOARDING_STEP_KEYS.includes(rawStep)
  ) {
    return rawStep;
  }

  const steps = ob?.steps || {};
  const hasLockedOrCompleteBody =
    Boolean(steps.identity_body) &&
    Boolean(user?.genderLocked) &&
    Boolean(user?.ageGroup && user.ageGroup !== 'unspecified') &&
    Number(user?.heightCm || 0) >= 100;
  if (!hasLockedOrCompleteBody) return 'identity_body';
  if (!steps.skin_face) return 'skin_face';

  const count =
    typeof liveGarmentCount === 'number' ? liveGarmentCount : Number(user?.garmentCount ?? 0);
  if (!steps.closet_seed && count === 0) return 'closet_seed';

  return 'first_tryon';
}

export function getOnboardingStepIndex(step: OnboardingStepKey): number {
  const idx = ONBOARDING_STEP_KEYS.indexOf(step);
  return idx >= 0 ? idx : 0;
}

export async function saveOnboardingProgress(
  payload: OnboardingStepPatchPayload
): Promise<OnboardingUserResponse> {
  return apiFetch<OnboardingUserResponse>('/auth/onboarding', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function importOnboardingStarterCapsule(params?: {
  personalColor?: string;
  gender?: string;
  ageGroup?: string;
}): Promise<StarterCapsuleImportResponse> {
  return apiFetch<StarterCapsuleImportResponse>('/auth/onboarding/starter-capsule', {
    method: 'POST',
    body: JSON.stringify(params || {}),
  });
}

export async function clearOnboardingStarterCapsule(): Promise<StarterCapsuleClearResponse> {
  return apiFetch<StarterCapsuleClearResponse>('/auth/onboarding/starter-capsule', {
    method: 'DELETE',
  });
}

export async function completeOnboardingFlow(
  stepsPatch?: Record<string, boolean | string>
): Promise<OnboardingUserResponse> {
  return apiFetch<OnboardingUserResponse>('/auth/onboarding/complete', {
    method: 'POST',
    body: JSON.stringify(stepsPatch ? { stepsPatch } : {}),
  });
}

export async function resetOnboardingFlow(): Promise<OnboardingUserResponse> {
  return apiFetch<OnboardingUserResponse>('/auth/onboarding/reset', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
