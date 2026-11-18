import { apiFetch } from '../utils/api.ts';
import {
  type DominantHand,
  normalizeHandedness,
  resolveBagCarryAnatomy,
} from './vtonQualityControl.ts';

export const PROFILE_CONFIG_KEY_STORAGE = 'ainventory_profile_config_key_v1';
export const PROFILE_HANDEDNESS_CACHE_STORAGE = 'ainventory_server_handedness_v1';
export const PROFILE_CONFIG_UPDATED_EVENT = 'ainventory:profile-config-updated';

export interface ServerProfileConfig {
  profileKey: string;
  userId: number | null;
  handedness: DominantHand;
  handednessLabel: 'right-handed' | 'left-handed';
  bagCarrySide: 'left' | 'right';
  mirrorBagAsset: boolean;
  hasStoredRecord: boolean;
  updatedAt: string | null;
}

interface ProfileConfigEnvelope {
  ok?: boolean;
  config?: Partial<ServerProfileConfig>;
}

function sanitizeClientProfileKey(raw: unknown): string {
  const cleaned = String(raw ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_:-]/g, '')
    .slice(0, 64);
  return cleaned || '';
}

export function getOrCreateClientProfileKey(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'default';
  }
  try {
    const existing = sanitizeClientProfileKey(
      window.localStorage.getItem(PROFILE_CONFIG_KEY_STORAGE)
    );
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `client_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
        : `client_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(PROFILE_CONFIG_KEY_STORAGE, generated);
    return generated;
  } catch {
    return 'default';
  }
}

export function getCachedServerHandedness(fallback: DominantHand = 'right'): DominantHand {
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(PROFILE_HANDEDNESS_CACHE_STORAGE);
    return normalizeHandedness(raw, fallback);
  } catch {
    return fallback;
  }
}

function writeCachedServerHandedness(handedness: DominantHand): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(PROFILE_HANDEDNESS_CACHE_STORAGE, handedness);
  } catch {
    // ignore storage write error
  }
}

function normalizeServerProfileConfigPayload(
  raw: Partial<ServerProfileConfig> | null | undefined,
  fallbackHandedness: DominantHand = 'right'
): ServerProfileConfig {
  const handedness = normalizeHandedness(raw?.handedness, fallbackHandedness);
  const anatomy = resolveBagCarryAnatomy(handedness);
  const profileKey = sanitizeClientProfileKey(raw?.profileKey) || getOrCreateClientProfileKey();
  return {
    profileKey,
    userId: typeof raw?.userId === 'number' ? raw.userId : null,
    handedness,
    handednessLabel: handedness === 'left' ? 'left-handed' : 'right-handed',
    bagCarrySide: anatomy.carrySide,
    mirrorBagAsset: handedness === 'left',
    hasStoredRecord: Boolean(raw?.hasStoredRecord),
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

function emitProfileConfigUpdated(config: ServerProfileConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent(PROFILE_CONFIG_UPDATED_EVENT, { detail: config })
    );
  } catch {
    // ignore event dispatch failure
  }
}

/**
 * Explicitly fetches the server-side profile configuration (`GET /api/profile/config`)
 * to resolve `handedness` (default: `'right'`) before rendering the VTON character.
 */
export async function fetchServerProfileConfig(
  fallbackHandedness: DominantHand = 'right'
): Promise<ServerProfileConfig> {
  const profileKey = getOrCreateClientProfileKey();
  const localFallback = getCachedServerHandedness(fallbackHandedness);
  try {
    const res = await apiFetch<ProfileConfigEnvelope>('/profile/config', {
      method: 'GET',
      headers: {
        'X-Profile-Key': profileKey,
      },
    });
    const normalized = normalizeServerProfileConfigPayload(res?.config, localFallback);
    writeCachedServerHandedness(normalized.handedness);
    return normalized;
  } catch {
    return normalizeServerProfileConfigPayload({ profileKey }, localFallback);
  }
}

/**
 * Persists the user's handedness preference (`'right'` | `'left'` | `'right-handed'` | `'left-handed'`)
 * to the server-side profile configuration (`PUT /api/profile/config`).
 */
export async function saveServerHandednessConfig(
  rawHandedness: DominantHand | 'right-handed' | 'left-handed' | string
): Promise<ServerProfileConfig> {
  const handedness = normalizeHandedness(rawHandedness, 'right');
  const profileKey = getOrCreateClientProfileKey();
  writeCachedServerHandedness(handedness);
  const res = await apiFetch<ProfileConfigEnvelope>('/profile/config', {
    method: 'PUT',
    headers: {
      'X-Profile-Key': profileKey,
    },
    body: JSON.stringify({
      profileKey,
      handedness,
    }),
  });
  const normalized = normalizeServerProfileConfigPayload(res?.config, handedness);
  writeCachedServerHandedness(normalized.handedness);
  emitProfileConfigUpdated(normalized);
  return normalized;
}
