/**
 * Login "Look" (lookbook variant) + intro choreography preferences.
 *
 * Two brand-surface looks share one auth form:
 *  - `maison`: couture serif wordmark, gold silk-thread canvas, hairline fields.
 *  - `runway`: wide-tracked sans wordmark, runway spotlight + typographic marquee, boxed fields.
 *
 * Pure helpers only (no React) so they can be unit tested with node:test.
 */

export type LoginLook = 'maison' | 'runway';
export type LoginPhase = 'intro' | 'form';

export const LOGIN_LOOKS: readonly LoginLook[] = ['maison', 'runway'] as const;
export const DEFAULT_LOGIN_LOOK: LoginLook = 'maison';
export const LOGIN_LOOK_STORAGE_KEY = 'ainventory.loginLook';
export const LOGIN_INTRO_SEEN_KEY = 'ainventory.loginIntroSeen';

/** Auto-advance delay for the intro (ms). Users can skip earlier via the CTA. */
export const LOGIN_INTRO_AUTO_ADVANCE_MS = 3200;

export interface LoginLookMeta {
  look: LoginLook;
  index: string;
  labelEn: string;
  labelKo: string;
}

export const LOGIN_LOOK_META: Readonly<Record<LoginLook, LoginLookMeta>> = {
  maison: { look: 'maison', index: '01', labelEn: 'Maison', labelKo: '메종' },
  runway: { look: 'runway', index: '02', labelEn: 'Runway', labelKo: '런웨이' },
};

export function isLoginLook(value: unknown): value is LoginLook {
  return value === 'maison' || value === 'runway';
}

/** Accepts `maison|runway|1|2|01|02` (case-insensitive) and returns a canonical look or null. */
export function parseLoginLook(raw: unknown): LoginLook | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value === '1' || value === '01') return 'maison';
  if (value === '2' || value === '02') return 'runway';
  return isLoginLook(value) ? value : null;
}

/** URL `?look=` wins over the stored preference, which wins over the default. */
export function resolveLoginLook(search: string, stored: string | null | undefined): LoginLook {
  let fromUrl: LoginLook | null = null;
  try {
    fromUrl = parseLoginLook(new URLSearchParams(search || '').get('look'));
  } catch {
    fromUrl = null;
  }
  return fromUrl ?? parseLoginLook(stored ?? null) ?? DEFAULT_LOGIN_LOOK;
}

export function nextLoginLook(current: LoginLook): LoginLook {
  const idx = LOGIN_LOOKS.indexOf(current);
  return LOGIN_LOOKS[(idx + 1) % LOGIN_LOOKS.length];
}

/**
 * The intro plays on the first visit in a tab session. It is skipped when the
 * user prefers reduced motion or has already advanced past it this session.
 */
export function resolveInitialLoginPhase(options: {
  prefersReducedMotion: boolean;
  introSeenThisSession: boolean;
}): LoginPhase {
  if (options.prefersReducedMotion || options.introSeenThisSession) return 'form';
  return 'intro';
}

/**
 * Vertical translation (px) that places the logo block at the viewport center
 * during the intro, given the logo slot's final layout rect.
 */
export function computeIntroShift(viewportHeight: number, slotTop: number, slotHeight: number): number {
  if (![viewportHeight, slotTop, slotHeight].every(Number.isFinite)) return 0;
  const shift = viewportHeight / 2 - (slotTop + slotHeight / 2);
  return Math.round(shift);
}
