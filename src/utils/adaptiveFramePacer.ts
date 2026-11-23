/**
 * Adaptive 3-Tier Frame Pacer & Display Refresh Rate Detector (120Hz / 90Hz / 60Hz / 30Hz / 0Hz)
 *
 * Designed for zero-GC operation inside high-frequency animation loops (Anti-Gravity CSS field
 * and Three.js 3D Silk + Marble WebGL renderer):
 * - Automatically probes native display refresh rate (60Hz / 90Hz / 120Hz ProMotion) from raw rAF deltas.
 * - Dynamically scales frame commits across 3 active tiers:
 *   - boost120 (~120fps, min interval 7.2ms): direct touch/drag/flick, high kinetic energy, transitions
 *   - active60 (~60fps,  min interval 15.2ms): deceleration, gentle glide, 60Hz displays, or budget fallback
 *   - idle30   (~30fps,  min interval 31.0ms): calm ambient breathing & low-power rest
 *   - paused   (0fps): rAF completely halted when hidden or occluded by a modal dialog
 * - Frame-budget thermal guard steps down from 120fps to 60fps if consecutive frame work exceeds budget,
 *   then safely re-enables 120fps after a cooldown period.
 */

export type AdaptiveFpsTier = 'boost120' | 'active60' | 'idle30' | 'paused';
export type DetectedRefreshHz = 60 | 90 | 120;

export const TIER_MIN_INTERVAL_MS: Readonly<Record<AdaptiveFpsTier, number>> = {
  // Thresholds intentionally sit ~1.0–2.3ms below nominal vSync (8.33 / 16.67 / 33.33ms)
  // so real-world browser rAF jitter never causes accidental frame skipping.
  boost120: 7.2,
  active60: 15.2,
  idle30: 31.0,
  paused: Number.POSITIVE_INFINITY,
};

const REFRESH_SAMPLE_CAPACITY = 8;
const REFRESH_MIN_SAMPLES = 5;
const BUDGET_GUARD_WORK_MS = 6.8;
const BUDGET_GUARD_EMA_MS = 5.8;
const BUDGET_GUARD_STREAK = 6;
const BUDGET_GUARD_COOLDOWN_MS = 12_000;

export interface AdaptivePacerState {
  detectedRefreshHz: DetectedRefreshHz;
  allowHighRefresh: boolean;
  fpsTier: AdaptiveFpsTier;
  budgetGuardActive: boolean;
  budgetGuardUntilNow: number;
  slowFrameStreak: number;
  emaWorkMs: number;
  lastRawRafNow: number;
  lastCommitNow: number;
  lastActivityNow: number;
  lastHighActivityNow: number;
  sampleIntervals: number[];
  sampleScratch: number[];
  sampleCount: number;
  sampleCursor: number;
  committedFrames: number;
  skippedFrames: number;
}

export interface AdaptivePacerOptions {
  allowHighRefresh?: boolean;
  now?: number;
}

export interface TierResolutionSignals {
  paused: boolean;
  isBoostActive: boolean;
  isStandardActive: boolean;
  boostHoldMs?: number;
  idleHoldMs?: number;
}

function detectLowPowerDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 8;
  const navWithConnection = navigator as Navigator & {
    connection?: { saveData?: boolean };
  };
  return cores <= 2 || Boolean(navWithConnection.connection?.saveData);
}

export function createAdaptivePacerState(options?: AdaptivePacerOptions): AdaptivePacerState {
  const now = options?.now ?? (typeof performance !== 'undefined' ? performance.now() : 0);
  const allowHighRefresh =
    options?.allowHighRefresh !== undefined ? options.allowHighRefresh : !detectLowPowerDevice();

  return {
    // Start optimistically at 120Hz when allowed so 120Hz ProMotion screens get instant 120fps
    // from frame 1; 60Hz browsers naturally fire rAF at 60Hz and lock detectedRefreshHz = 60 within 5 frames.
    detectedRefreshHz: allowHighRefresh ? 120 : 60,
    allowHighRefresh,
    fpsTier: allowHighRefresh ? 'boost120' : 'active60',
    budgetGuardActive: false,
    budgetGuardUntilNow: 0,
    slowFrameStreak: 0,
    emaWorkMs: 0,
    lastRawRafNow: 0,
    lastCommitNow: 0,
    lastActivityNow: now,
    lastHighActivityNow: now,
    sampleIntervals: new Array<number>(REFRESH_SAMPLE_CAPACITY).fill(0),
    sampleScratch: new Array<number>(REFRESH_SAMPLE_CAPACITY).fill(0),
    sampleCount: 0,
    sampleCursor: 0,
    committedFrames: 0,
    skippedFrames: 0,
  };
}

/**
 * Samples raw rAF interval without heap allocations and classifies display refresh rate (60 / 90 / 120Hz).
 */
export function sampleDisplayRefreshHz(state: AdaptivePacerState, now: number): DetectedRefreshHz {
  if (state.lastRawRafNow > 0) {
    const rawDelta = now - state.lastRawRafNow;
    // Ignore tab-switch gaps, pauses, or duplicate timestamps
    if (rawDelta >= 3.2 && rawDelta <= 45.0) {
      state.sampleIntervals[state.sampleCursor] = rawDelta;
      state.sampleCursor = (state.sampleCursor + 1) % REFRESH_SAMPLE_CAPACITY;
      if (state.sampleCount < REFRESH_SAMPLE_CAPACITY) {
        state.sampleCount += 1;
      }

      if (state.sampleCount >= REFRESH_MIN_SAMPLES) {
        const count = state.sampleCount;
        const scratch = state.sampleScratch;
        for (let i = 0; i < count; i += 1) {
          scratch[i] = state.sampleIntervals[i];
        }
        // Small fixed-size insertion sort (n <= 8, zero allocations)
        for (let i = 1; i < count; i += 1) {
          const key = scratch[i];
          let j = i - 1;
          while (j >= 0 && scratch[j] > key) {
            scratch[j + 1] = scratch[j];
            j -= 1;
          }
          scratch[j + 1] = key;
        }
        const medianMs = scratch[count >> 1];
        if (medianMs <= 9.8) {
          state.detectedRefreshHz = 120;
        } else if (medianMs <= 13.4) {
          state.detectedRefreshHz = 90;
        } else {
          state.detectedRefreshHz = 60;
        }
      }
    }
  }

  state.lastRawRafNow = now;
  return state.detectedRefreshHz;
}

export function markPacerActivity(
  state: AdaptivePacerState,
  now: number,
  highIntensity = false
): void {
  state.lastActivityNow = now;
  if (highIntensity) {
    state.lastHighActivityNow = now;
  }
}

export function getTierMinIntervalMs(tier: AdaptiveFpsTier): number {
  return TIER_MIN_INTERVAL_MS[tier];
}

export function resolveFpsTier(
  state: AdaptivePacerState,
  now: number,
  signals: TierResolutionSignals
): AdaptiveFpsTier {
  if (signals.paused) {
    state.fpsTier = 'paused';
    return 'paused';
  }

  if (state.budgetGuardActive && now >= state.budgetGuardUntilNow) {
    state.budgetGuardActive = false;
    state.slowFrameStreak = 0;
  }

  const boostHoldMs = signals.boostHoldMs ?? 650;
  const idleHoldMs = signals.idleHoldMs ?? 1800;

  const canBoostHighRefresh =
    state.allowHighRefresh && !state.budgetGuardActive && state.detectedRefreshHz > 60;

  if (
    canBoostHighRefresh &&
    (signals.isBoostActive || now - state.lastHighActivityNow <= boostHoldMs)
  ) {
    state.fpsTier = 'boost120';
    return 'boost120';
  }

  if (
    signals.isBoostActive ||
    signals.isStandardActive ||
    now - state.lastActivityNow <= idleHoldMs
  ) {
    state.fpsTier = 'active60';
    return 'active60';
  }

  state.fpsTier = 'idle30';
  return 'idle30';
}

export function shouldCommitFrame(
  state: AdaptivePacerState,
  now: number,
  tier: AdaptiveFpsTier
): boolean {
  if (tier === 'paused') return false;
  if (state.lastCommitNow <= 0) return true;
  const elapsed = now - state.lastCommitNow;
  return elapsed >= getTierMinIntervalMs(tier);
}

/**
 * Tracks per-frame CPU/GPU submission time and automatically guards 120fps against micro-stutter
 * by stepping down to 60fps for a cooldown window when frame cost repeatedly exceeds budget.
 */
export function recordFrameWorkCost(
  state: AdaptivePacerState,
  workMs: number,
  now: number,
  tier: AdaptiveFpsTier
): void {
  if (!Number.isFinite(workMs) || workMs < 0) return;
  state.emaWorkMs = state.emaWorkMs <= 0 ? workMs : state.emaWorkMs * 0.82 + workMs * 0.18;

  if (tier === 'boost120') {
    if (workMs > BUDGET_GUARD_WORK_MS || state.emaWorkMs > BUDGET_GUARD_EMA_MS) {
      state.slowFrameStreak += 1;
      if (state.slowFrameStreak >= BUDGET_GUARD_STREAK) {
        state.budgetGuardActive = true;
        state.budgetGuardUntilNow = now + BUDGET_GUARD_COOLDOWN_MS;
        state.slowFrameStreak = 0;
      }
    } else if (state.slowFrameStreak > 0) {
      state.slowFrameStreak -= 1;
    }
  }
}

/**
 * Resets transient timing anchors after a pause or background tab resume so the first resumed
 * frame commits smoothly without corrupting refresh-rate sampling or jumping simulation phase.
 */
export function resetPacerOnResume(state: AdaptivePacerState, now: number): void {
  state.lastRawRafNow = 0;
  state.lastCommitNow = 0;
  state.slowFrameStreak = 0;
  if (state.budgetGuardActive && now >= state.budgetGuardUntilNow) {
    state.budgetGuardActive = false;
  }
}

/**
 * Checks whether any visible, non-hidden modal dialog is currently open in the DOM.
 */
export function hasVisibleModalDialog(): boolean {
  if (typeof document === 'undefined' || !document.body) return false;
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]');
  for (let i = 0; i < dialogs.length; i += 1) {
    const el = dialogs[i];
    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') {
      continue;
    }
    if (el.style.display === 'none' || el.style.visibility === 'hidden') {
      continue;
    }
    // Elements detached or display:none have no client rects in real browsers
    if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) {
      continue;
    }
    return true;
  }
  return false;
}

/**
 * Lightweight DOM observer that invokes `onChange` only when visible modal presence transitions.
 * Coalesces rapid DOM mutations within a single microtask to stay near-zero overhead.
 */
export function observeOpenModalDialogs(onChange: (hasOpenModal: boolean) => void): () => void {
  if (typeof document === 'undefined' || !document.body) {
    return () => {};
  }

  let lastState = hasVisibleModalDialog();
  let queued = false;
  let disposed = false;

  const flushCheck = () => {
    queued = false;
    if (disposed) return;
    const nextState = hasVisibleModalDialog();
    if (nextState !== lastState) {
      lastState = nextState;
      onChange(nextState);
    }
  };

  const scheduleCheck = () => {
    if (queued || disposed) return;
    queued = true;
    queueMicrotask(flushCheck);
  };

  let observer: MutationObserver | null = null;
  if (typeof MutationObserver === 'function') {
    observer = new MutationObserver(scheduleCheck);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['role', 'aria-modal', 'aria-hidden', 'hidden', 'style'],
    });
  }

  // Emit initial state if a modal is already open at mount time
  if (lastState) {
    onChange(true);
  }

  return () => {
    disposed = true;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };
}
