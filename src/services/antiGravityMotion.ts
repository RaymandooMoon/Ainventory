/**
 * Zero-G Anti-Gravity Motion Field for Main Screen Garments & Items
 *
 * Drives 4 staggered harmonic channels via CSS custom properties directly on the app shell
 * (zero React re-renders, 100% GPU-composited transforms) using a shared mutable state ref:
 * - Adaptive 3-tier rAF throttling: up to 120fps on ProMotion/high-Hz screens during active
 *   scroll/touch/drag gestures, 60fps during gentle deceleration, 30fps when calm/idle.
 * - Quantized CSS diffing skips redundant `style.setProperty` commits below 0.04px / 0.04deg.
 * - True 0fps auto-pause (rAF fully cancelled) when hidden or occluded by any modal dialog,
 *   resuming softly from the exact prior harmonic phase with zero jump.
 */

import {
  createAdaptivePacerState,
  markPacerActivity,
  observeOpenModalDialogs,
  recordFrameWorkCost,
  resetPacerOnResume,
  resolveFpsTier,
  sampleDisplayRefreshHz,
  shouldCommitFrame,
  type AdaptiveFpsTier,
  type AdaptivePacerState,
} from '../utils/adaptiveFramePacer.ts';

const PHASE_OFFSETS = [0, 1.5707963, 3.1415926, 4.7123889] as const;
const ROT_MULTIPLIERS = [1.0, -0.88, 0.94, -1.06] as const;
const DRIFT_FREQS = [1.0, 0.92, 1.08, 0.86] as const;

// Precomputed CSS property name tables (zero template-string churn on skipped writes)
const PROP_Y = ['--ag-y-0', '--ag-y-1', '--ag-y-2', '--ag-y-3'] as const;
const PROP_RX = ['--ag-rx-0', '--ag-rx-1', '--ag-rx-2', '--ag-rx-3'] as const;
const PROP_RY = ['--ag-ry-0', '--ag-ry-1', '--ag-ry-2', '--ag-ry-3'] as const;
const PROP_RZ = ['--ag-rz-0', '--ag-rz-1', '--ag-rz-2', '--ag-rz-3'] as const;
const PROP_SH = ['--ag-sh-0', '--ag-sh-1', '--ag-sh-2', '--ag-sh-3'] as const;
const PROP_SH_OP = ['--ag-sh-op-0', '--ag-sh-op-1', '--ag-sh-op-2', '--ag-sh-op-3'] as const;

// Quantization scales: 0.04px (1/25), 0.04deg (1/25), 0.002 shadow (1/500)
const QUANT_PX_SCALE = 25;
const QUANT_DEG_SCALE = 25;
const QUANT_SHADOW_SCALE = 500;

export interface AntiGravityChannelCache {
  yQ: number;
  rxQ: number;
  ryQ: number;
  rzQ: number;
  shQ: number;
  shOpQ: number;
}

export interface AntiGravityCycleState {
  // Continuous integrated harmonic physics (never resets across pauses or tier transitions)
  phase: number;
  rotPhase: number;
  kineticEnergy: number; // 0..1 smooth unsigned boost
  signedMomentum: number; // -1..1 gesture direction for anti-gravity pitch & yaw
  rawImpulseAccum: number;
  rawSignedAccum: number;

  // Frame scheduling & lifecycle coordination
  lastFrameNow: number;
  rafId: number;
  disposed: boolean;
  paused: boolean;
  externalPaused: boolean;
  modalPaused: boolean;
  docHidden: boolean;
  pacer: AdaptivePacerState;

  // Pre-allocated quantized CSS write cache (4 channels)
  lastWritten: [
    AntiGravityChannelCache,
    AntiGravityChannelCache,
    AntiGravityChannelCache,
    AntiGravityChannelCache,
  ];

  // Bound pause-sync hook registered while attached to an element
  onPauseStateChanged: (() => void) | null;
}

export interface AntiGravityStateRef {
  current: AntiGravityCycleState;
}

export interface CreateAntiGravityStateOptions {
  allowHighRefresh?: boolean;
  now?: number;
}

export interface AttachAntiGravityOptions {
  stateRef?: AntiGravityStateRef;
  initialPaused?: boolean;
  observeModals?: boolean;
  allowHighRefresh?: boolean;
}

export interface AntiGravityStepResult {
  committed: boolean;
  tier: AdaptiveFpsTier;
  writes: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function createEmptyChannelCache(): AntiGravityChannelCache {
  return {
    yQ: Number.NaN,
    rxQ: Number.NaN,
    ryQ: Number.NaN,
    rzQ: Number.NaN,
    shQ: Number.NaN,
    shOpQ: Number.NaN,
  };
}

export function createAntiGravityState(
  options?: CreateAntiGravityStateOptions
): AntiGravityCycleState {
  const now = options?.now ?? (typeof performance !== 'undefined' ? performance.now() : 0);
  return {
    phase: 0,
    rotPhase: 0,
    kineticEnergy: 0,
    signedMomentum: 0,
    rawImpulseAccum: 0,
    rawSignedAccum: 0,
    lastFrameNow: now,
    rafId: 0,
    disposed: false,
    paused: false,
    externalPaused: false,
    modalPaused: false,
    docHidden: false,
    pacer: createAdaptivePacerState({
      allowHighRefresh: options?.allowHighRefresh,
      now,
    }),
    lastWritten: [
      createEmptyChannelCache(),
      createEmptyChannelCache(),
      createEmptyChannelCache(),
      createEmptyChannelCache(),
    ],
    onPauseStateChanged: null,
  };
}

export function createAntiGravityStateRef(
  options?: CreateAntiGravityStateOptions
): AntiGravityStateRef {
  return {
    current: createAntiGravityState(options),
  };
}

export function injectAntiGravityImpulse(
  state: AntiGravityCycleState,
  deltaMag: number,
  signedDir: number,
  now = typeof performance !== 'undefined' ? performance.now() : 0
): void {
  const norm = clamp(deltaMag / 85, 0, 1.35);
  state.rawImpulseAccum = Math.min(1.8, state.rawImpulseAccum + norm * 0.55);
  state.rawSignedAccum = clamp(state.rawSignedAccum + signedDir * norm * 0.65, -1.5, 1.5);
  markPacerActivity(state.pacer, now, norm >= 0.08);
}

/**
 * Updates external pause state (e.g., from React modal flags) on the shared state ref
 * with zero React re-renders and without detaching input listeners.
 */
export function syncAntiGravityExternalPause(
  stateRef: AntiGravityStateRef | null | undefined,
  paused: boolean
): void {
  const state = stateRef?.current;
  if (!state) return;
  if (state.externalPaused === paused) return;
  state.externalPaused = paused;
  state.onPauseStateChanged?.();
}

/**
 * Runs a single Anti-Gravity calculation cycle on the shared state ref with 3-tier adaptive
 * rAF throttling (120 / 60 / 30 / 0 fps) and quantized CSS custom property diffing.
 */
export function stepAntiGravityCycle(
  state: AntiGravityCycleState,
  now: number,
  targetStyle?: Pick<CSSStyleDeclaration, 'setProperty'> | null
): AntiGravityStepResult {
  if (state.disposed || state.paused || state.docHidden || state.externalPaused || state.modalPaused) {
    state.pacer.fpsTier = 'paused';
    return { committed: false, tier: 'paused', writes: 0 };
  }

  sampleDisplayRefreshHz(state.pacer, now);

  const isBoostActive =
    state.kineticEnergy > 0.12 ||
    state.rawImpulseAccum > 0.06 ||
    Math.abs(state.signedMomentum) > 0.14;
  const isStandardActive =
    state.kineticEnergy > 0.015 ||
    state.rawImpulseAccum > 0.005 ||
    Math.abs(state.signedMomentum) > 0.015;

  const tier = resolveFpsTier(state.pacer, now, {
    paused: false,
    isBoostActive,
    isStandardActive,
    boostHoldMs: 650,
    idleHoldMs: 1600,
  });

  if (!shouldCommitFrame(state.pacer, now, tier)) {
    state.pacer.skippedFrames += 1;
    return { committed: false, tier, writes: 0 };
  }

  const workStart = typeof performance !== 'undefined' ? performance.now() : now;
  const rawDt =
    Number.isFinite(state.lastFrameNow) && state.lastFrameNow >= 0
      ? (now - state.lastFrameNow) / 1000
      : 1 / 60;
  const dt = clamp(rawDt, 0.001, 0.05);
  state.lastFrameNow = now;
  state.pacer.lastCommitNow = now;
  state.pacer.committedFrames += 1;

  // Absorb recent scroll/touch impulses with dt-invariant exponential easing (identical at 30/60/90/120Hz)
  if (state.rawImpulseAccum > 0.001) {
    const absorb = 1.0 - Math.exp(-dt * 14.0);
    state.kineticEnergy = clamp(state.kineticEnergy + state.rawImpulseAccum * absorb, 0, 1);
    state.rawImpulseAccum *= Math.exp(-dt * 12.0);
  }
  if (Math.abs(state.rawSignedAccum) > 0.001) {
    const absorbSigned = 1.0 - Math.exp(-dt * 12.0);
    state.signedMomentum = clamp(state.signedMomentum + state.rawSignedAccum * absorbSigned, -1, 1);
    state.rawSignedAccum *= Math.exp(-dt * 10.0);
  }

  state.kineticEnergy *= Math.exp(-dt * 2.45);
  state.signedMomentum *= Math.exp(-dt * 3.1);
  if (state.kineticEnergy < 0.0005) state.kineticEnergy = 0;
  if (Math.abs(state.signedMomentum) < 0.0005) state.signedMomentum = 0;

  // Accelerate orbital float & slow 3D rotation smoothly with scroll/touch kinetic energy
  const speedFactor = 1.0 + state.kineticEnergy * 2.55;
  state.phase += dt * 1.18 * speedFactor;
  state.rotPhase += dt * 0.72 * (1.0 + state.kineticEnergy * 2.8);

  let writes = 0;
  if (targetStyle) {
    const globalLiftPx = -state.kineticEnergy * 5.2;
    const ampY = 3.8 + state.kineticEnergy * 4.4;
    const ryAmp = 7.5 + state.kineticEnergy * 11.5;
    const rzAmp = 1.9 + state.kineticEnergy * 3.4;
    const rxAmp = 2.4 + state.kineticEnergy * 3.2;
    const pitchBias = state.signedMomentum * 5.5;

    for (let i = 0; i < 4; i += 1) {
      const offset = PHASE_OFFSETS[i];
      const freq = DRIFT_FREQS[i];
      const rotDir = ROT_MULTIPLIERS[i];
      const cache = state.lastWritten[i];

      const waveY = Math.sin(state.phase * freq + offset);
      const waveY2 = Math.cos(state.phase * 0.54 * freq + offset * 1.3) * 0.35;
      const yPx = (waveY + waveY2) * ampY + globalLiftPx;

      // Gentle zero-G 3D yaw (rotateY), soft banking roll (rotateZ), and momentum-synced pitch (rotateX)
      const ryDeg = Math.sin(state.rotPhase * freq + offset * 0.85) * ryAmp * rotDir;
      const rzDeg = Math.cos(state.rotPhase * 0.78 * freq + offset) * rzAmp * rotDir;
      const rxDeg = Math.sin(state.rotPhase * 0.64 + offset * 1.2) * rxAmp + pitchBias;

      // Floor contact shadow subtly shrinks & softens as garment floats higher off the ground
      const heightNorm = clamp(-yPx / 14, -0.45, 1.0);
      const shadowScale = clamp(1.0 - heightNorm * 0.19, 0.72, 1.08);
      const shadowOpacity = clamp(0.92 - heightNorm * 0.34, 0.42, 1.0);

      const yQ = Math.round(yPx * QUANT_PX_SCALE);
      if (yQ !== cache.yQ) {
        cache.yQ = yQ;
        targetStyle.setProperty(PROP_Y[i], `${(yQ / QUANT_PX_SCALE).toFixed(2)}px`);
        writes += 1;
      }

      const rxQ = Math.round(rxDeg * QUANT_DEG_SCALE);
      if (rxQ !== cache.rxQ) {
        cache.rxQ = rxQ;
        targetStyle.setProperty(PROP_RX[i], `${(rxQ / QUANT_DEG_SCALE).toFixed(2)}deg`);
        writes += 1;
      }

      const ryQ = Math.round(ryDeg * QUANT_DEG_SCALE);
      if (ryQ !== cache.ryQ) {
        cache.ryQ = ryQ;
        targetStyle.setProperty(PROP_RY[i], `${(ryQ / QUANT_DEG_SCALE).toFixed(2)}deg`);
        writes += 1;
      }

      const rzQ = Math.round(rzDeg * QUANT_DEG_SCALE);
      if (rzQ !== cache.rzQ) {
        cache.rzQ = rzQ;
        targetStyle.setProperty(PROP_RZ[i], `${(rzQ / QUANT_DEG_SCALE).toFixed(2)}deg`);
        writes += 1;
      }

      const shQ = Math.round(shadowScale * QUANT_SHADOW_SCALE);
      if (shQ !== cache.shQ) {
        cache.shQ = shQ;
        targetStyle.setProperty(PROP_SH[i], (shQ / QUANT_SHADOW_SCALE).toFixed(3));
        writes += 1;
      }

      const shOpQ = Math.round(shadowOpacity * QUANT_SHADOW_SCALE);
      if (shOpQ !== cache.shOpQ) {
        cache.shOpQ = shOpQ;
        targetStyle.setProperty(PROP_SH_OP[i], (shOpQ / QUANT_SHADOW_SCALE).toFixed(3));
        writes += 1;
      }
    }
  }

  const workEnd = typeof performance !== 'undefined' ? performance.now() : now;
  recordFrameWorkCost(state.pacer, Math.max(0, workEnd - workStart), now, tier);

  return { committed: true, tier, writes };
}

export function attachAntiGravityField(
  targetEl: HTMLElement,
  options?: AttachAntiGravityOptions
): () => void {
  if (typeof window === 'undefined' || !targetEl) {
    return () => {};
  }

  const reducedMotion = Boolean(
    typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  if (reducedMotion) {
    targetEl.dataset.antiGravity = 'reduced';
    return () => {
      delete targetEl.dataset.antiGravity;
    };
  }

  const now0 = performance.now();
  const stateRef: AntiGravityStateRef =
    options?.stateRef ??
    createAntiGravityStateRef({
      allowHighRefresh: options?.allowHighRefresh,
      now: now0,
    });
  const state = stateRef.current;

  // Reset lifecycle flags for (re)attachment while preserving continuous harmonic phase
  state.disposed = false;
  state.docHidden = typeof document !== 'undefined' ? document.hidden : false;
  if (options?.initialPaused !== undefined) {
    state.externalPaused = options.initialPaused;
  }
  if (options?.allowHighRefresh !== undefined) {
    state.pacer.allowHighRefresh = options.allowHighRefresh;
  }
  state.lastFrameNow = now0;
  resetPacerOnResume(state.pacer, now0);
  // Invalidate quantized write cache on (re)attach so the target element receives fresh CSS vars
  for (let i = 0; i < 4; i += 1) {
    const c = state.lastWritten[i];
    c.yQ = Number.NaN;
    c.rxQ = Number.NaN;
    c.ryQ = Number.NaN;
    c.rzQ = Number.NaN;
    c.shQ = Number.NaN;
    c.shOpQ = Number.NaN;
  }

  targetEl.dataset.antiGravity = 'active';

  let lastTouchX = 0;
  let lastTouchY = 0;
  let touchActive = false;
  let lastWindowScrollY = window.scrollY || 0;
  let pointerDown = false;
  let lastPtrX = 0;
  let lastPtrY = 0;
  const scrollTargetPositions = new WeakMap<EventTarget, { top: number; left: number }>();

  const stopLoop = () => {
    if (state.rafId) {
      window.cancelAnimationFrame(state.rafId);
      state.rafId = 0;
    }
  };

  const step = (now: number) => {
    state.rafId = 0;
    if (state.disposed || state.paused) return;
    stepAntiGravityCycle(state, now, targetEl.style);
    if (!state.disposed && !state.paused) {
      state.rafId = window.requestAnimationFrame(step);
    }
  };

  const syncPausedState = () => {
    const shouldPause = state.disposed || state.docHidden || state.externalPaused || state.modalPaused;
    if (shouldPause) {
      state.paused = true;
      state.pacer.fpsTier = 'paused';
      targetEl.dataset.antiGravity = 'paused';
      stopLoop();
      return;
    }

    const wasPaused = state.paused;
    state.paused = false;
    targetEl.dataset.antiGravity = 'active';

    if (wasPaused || !state.rafId) {
      const resumeNow = performance.now();
      state.lastFrameNow = resumeNow;
      resetPacerOnResume(state.pacer, resumeNow);
      state.rafId = window.requestAnimationFrame(step);
    }
  };

  state.onPauseStateChanged = syncPausedState;

  const pushImpulse = (deltaMag: number, signedDir: number) => {
    if (state.paused || state.disposed) return;
    injectAntiGravityImpulse(state, deltaMag, signedDir, performance.now());
  };

  const onWheel = (e: WheelEvent) => {
    if (state.paused) return;
    const dy = Number.isFinite(e.deltaY) ? e.deltaY : 0;
    const dx = Number.isFinite(e.deltaX) ? e.deltaX : 0;
    const mag = Math.hypot(dx, dy);
    if (mag < 0.5) return;
    const dir = Math.abs(dy) >= Math.abs(dx) ? Math.sign(dy) : Math.sign(dx);
    pushImpulse(mag * 0.9, dir || 1);
  };

  const onScrollCapture = (e: Event) => {
    if (state.paused) return;
    const target = e.target;
    if (!target || target === document || target === window) {
      const nextY = window.scrollY || 0;
      const dy = nextY - lastWindowScrollY;
      lastWindowScrollY = nextY;
      if (Math.abs(dy) > 0.5) {
        pushImpulse(Math.abs(dy) * 1.15, Math.sign(dy));
      }
      return;
    }

    if (target instanceof HTMLElement) {
      const prev = scrollTargetPositions.get(target);
      const curTop = target.scrollTop;
      const curLeft = target.scrollLeft;
      scrollTargetPositions.set(target, { top: curTop, left: curLeft });
      if (prev) {
        const dy = curTop - prev.top;
        const dx = curLeft - prev.left;
        const mag = Math.hypot(dx, dy);
        if (mag > 0.5) {
          const dir = Math.abs(dy) >= Math.abs(dx) ? Math.sign(dy) : Math.sign(dx);
          pushImpulse(mag * 1.25, dir || 1);
        }
      }
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    if (state.paused) return;
    const t = e.touches?.[0];
    if (!t) return;
    touchActive = true;
    lastTouchX = t.clientX;
    lastTouchY = t.clientY;
    // Gentle anti-gravity wake on initial touch contact
    pushImpulse(24, -1);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (state.paused) return;
    const t = e.touches?.[0];
    if (!t) return;
    if (!touchActive) {
      touchActive = true;
      lastTouchX = t.clientX;
      lastTouchY = t.clientY;
      return;
    }
    const dx = t.clientX - lastTouchX;
    const dy = t.clientY - lastTouchY;
    lastTouchX = t.clientX;
    lastTouchY = t.clientY;
    const mag = Math.hypot(dx, dy);
    if (mag > 0.8) {
      const dir = Math.abs(dy) >= Math.abs(dx) ? -Math.sign(dy) : Math.sign(dx);
      pushImpulse(mag * 1.45, dir || -1);
    }
  };

  const onTouchEnd = () => {
    touchActive = false;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (state.paused || e.pointerType === 'touch') return;
    pointerDown = true;
    lastPtrX = e.clientX;
    lastPtrY = e.clientY;
    pushImpulse(16, -1);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (state.paused || !pointerDown || e.pointerType === 'touch') return;
    const dx = e.clientX - lastPtrX;
    const dy = e.clientY - lastPtrY;
    lastPtrX = e.clientX;
    lastPtrY = e.clientY;
    const mag = Math.hypot(dx, dy);
    if (mag > 1.0) {
      const dir = Math.abs(dy) >= Math.abs(dx) ? -Math.sign(dy) : Math.sign(dx);
      pushImpulse(mag * 1.15, dir || -1);
    }
  };

  const onPointerUp = () => {
    pointerDown = false;
  };

  const onVisibilityChange = () => {
    state.docHidden = document.hidden;
    syncPausedState();
  };

  window.addEventListener('wheel', onWheel, { passive: true });
  document.addEventListener('scroll', onScrollCapture, { passive: true, capture: true });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', onPointerUp, { passive: true });
  window.addEventListener('pointercancel', onPointerUp, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);

  const stopModalObserver =
    options?.observeModals === false
      ? () => {}
      : observeOpenModalDialogs((hasOpenModal) => {
          state.modalPaused = hasOpenModal;
          syncPausedState();
        });

  // Start loop (or hold paused at 0fps if initially hidden or a modal is already open)
  syncPausedState();

  return () => {
    state.disposed = true;
    state.onPauseStateChanged = null;
    stopLoop();
    stopModalObserver();
    window.removeEventListener('wheel', onWheel);
    document.removeEventListener('scroll', onScrollCapture, true);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    window.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    delete targetEl.dataset.antiGravity;
  };
}
