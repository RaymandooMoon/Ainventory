/**
 * Zero-G Anti-Gravity Motion Field for Main Screen Garments & Items
 *
 * Drives 4 staggered harmonic channels via CSS custom properties directly on the app shell
 * (zero React re-renders, 100% GPU-composited transforms).
 * - At rest: garments softly levitate & rotate slowly in micro-gravity.
 * - On scroll / wheel / touch swipe: integrated orbital phase smoothly accelerates (up to ~3.4x),
 *   items gain buoyant upward anti-gravity lift and subtle kinetic pitch/yaw synced with gesture
 *   momentum, then ease gracefully back to serene zero-G drift.
 */

const PHASE_OFFSETS = [0, 1.5707963, 3.1415926, 4.7123889] as const;
const ROT_MULTIPLIERS = [1.0, -0.88, 0.94, -1.06] as const;
const DRIFT_FREQS = [1.0, 0.92, 1.08, 0.86] as const;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function attachAntiGravityField(targetEl: HTMLElement): () => void {
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

  targetEl.dataset.antiGravity = 'active';

  let rafId = 0;
  let disposed = false;
  let lastNow = performance.now();

  // Continuous integrated phase ensures speed acceleration NEVER jumps or stutters
  let phase = 0;
  let rotPhase = 0;
  let kineticEnergy = 0; // 0..1 smooth unsigned boost
  let signedMomentum = 0; // -1..1 scroll/touch direction for anti-gravity pitch & yaw
  let rawImpulseAccum = 0;
  let rawSignedAccum = 0;

  let lastTouchX = 0;
  let lastTouchY = 0;
  let touchActive = false;
  let lastWindowScrollY = window.scrollY || 0;
  const scrollTargetPositions = new WeakMap<EventTarget, { top: number; left: number }>();

  const injectKineticImpulse = (deltaMag: number, signedDir: number) => {
    const norm = clamp(deltaMag / 85, 0, 1.35);
    rawImpulseAccum = Math.min(1.8, rawImpulseAccum + norm * 0.55);
    rawSignedAccum = clamp(rawSignedAccum + signedDir * norm * 0.65, -1.5, 1.5);
  };

  const onWheel = (e: WheelEvent) => {
    const dy = Number.isFinite(e.deltaY) ? e.deltaY : 0;
    const dx = Number.isFinite(e.deltaX) ? e.deltaX : 0;
    const mag = Math.hypot(dx, dy);
    if (mag < 0.5) return;
    const dir = Math.abs(dy) >= Math.abs(dx) ? Math.sign(dy) : Math.sign(dx);
    injectKineticImpulse(mag * 0.9, dir || 1);
  };

  const onScrollCapture = (e: Event) => {
    const target = e.target;
    if (!target || target === document || target === window) {
      const nextY = window.scrollY || 0;
      const dy = nextY - lastWindowScrollY;
      lastWindowScrollY = nextY;
      if (Math.abs(dy) > 0.5) {
        injectKineticImpulse(Math.abs(dy) * 1.15, Math.sign(dy));
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
          injectKineticImpulse(mag * 1.25, dir || 1);
        }
      }
    }
  };

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches?.[0];
    if (!t) return;
    touchActive = true;
    lastTouchX = t.clientX;
    lastTouchY = t.clientY;
    // Gentle anti-gravity wake on initial touch contact
    injectKineticImpulse(24, -1);
  };

  const onTouchMove = (e: TouchEvent) => {
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
      injectKineticImpulse(mag * 1.45, dir || -1);
    }
  };

  const onTouchEnd = () => {
    touchActive = false;
  };

  let pointerDown = false;
  let lastPtrX = 0;
  let lastPtrY = 0;

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    pointerDown = true;
    lastPtrX = e.clientX;
    lastPtrY = e.clientY;
    injectKineticImpulse(16, -1);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!pointerDown || e.pointerType === 'touch') return;
    const dx = e.clientX - lastPtrX;
    const dy = e.clientY - lastPtrY;
    lastPtrX = e.clientX;
    lastPtrY = e.clientY;
    const mag = Math.hypot(dx, dy);
    if (mag > 1.0) {
      const dir = Math.abs(dy) >= Math.abs(dx) ? -Math.sign(dy) : Math.sign(dx);
      injectKineticImpulse(mag * 1.15, dir || -1);
    }
  };

  const onPointerUp = () => {
    pointerDown = false;
  };

  const onVisibilityChange = () => {
    if (!document.hidden) {
      lastNow = performance.now();
    }
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

  const step = (now: number) => {
    if (disposed) return;
    rafId = window.requestAnimationFrame(step);
    if (document.hidden) return;

    const dt = clamp((now - lastNow) / 1000, 0.001, 0.05);
    lastNow = now;

    // Absorb recent scroll/touch impulses smoothly and decay with weightless zero-G inertia
    if (rawImpulseAccum > 0.001) {
      kineticEnergy = clamp(kineticEnergy + rawImpulseAccum * clamp(dt * 14, 0.15, 0.65), 0, 1);
      rawImpulseAccum *= Math.exp(-dt * 12.0);
    }
    if (Math.abs(rawSignedAccum) > 0.001) {
      signedMomentum = clamp(signedMomentum + rawSignedAccum * clamp(dt * 12, 0.15, 0.6), -1, 1);
      rawSignedAccum *= Math.exp(-dt * 10.0);
    }

    kineticEnergy *= Math.exp(-dt * 2.45);
    signedMomentum *= Math.exp(-dt * 3.1);
    if (kineticEnergy < 0.0005) kineticEnergy = 0;
    if (Math.abs(signedMomentum) < 0.0005) signedMomentum = 0;

    // Accelerate orbital float & slow 3D rotation smoothly with scroll/touch kinetic energy
    const speedFactor = 1.0 + kineticEnergy * 2.55;
    phase += dt * 1.18 * speedFactor;
    rotPhase += dt * 0.72 * (1.0 + kineticEnergy * 2.8);

    // Extra buoyant upward lift when defying gravity on scroll/touch
    const globalLiftPx = -kineticEnergy * 5.2;
    const style = targetEl.style;

    for (let i = 0; i < 4; i += 1) {
      const offset = PHASE_OFFSETS[i];
      const freq = DRIFT_FREQS[i];
      const rotDir = ROT_MULTIPLIERS[i];

      const waveY = Math.sin(phase * freq + offset);
      const waveY2 = Math.cos(phase * 0.54 * freq + offset * 1.3) * 0.35;
      const ampY = 3.8 + kineticEnergy * 4.4;
      const yPx = (waveY + waveY2) * ampY + globalLiftPx;

      // Gentle zero-G 3D yaw (rotateY), soft banking roll (rotateZ), and momentum-synced pitch (rotateX)
      const ryDeg = Math.sin(rotPhase * freq + offset * 0.85) * (7.5 + kineticEnergy * 11.5) * rotDir;
      const rzDeg = Math.cos(rotPhase * 0.78 * freq + offset) * (1.9 + kineticEnergy * 3.4) * rotDir;
      const rxDeg =
        Math.sin(rotPhase * 0.64 + offset * 1.2) * (2.4 + kineticEnergy * 3.2) +
        signedMomentum * 5.5;

      // Floor contact shadow subtly shrinks & softens as garment floats higher off the ground
      const heightNorm = clamp(-yPx / 14, -0.45, 1.0);
      const shadowScale = clamp(1.0 - heightNorm * 0.19, 0.72, 1.08);
      const shadowOpacity = clamp(0.92 - heightNorm * 0.34, 0.42, 1.0);

      style.setProperty(`--ag-y-${i}`, `${yPx.toFixed(2)}px`);
      style.setProperty(`--ag-rx-${i}`, `${rxDeg.toFixed(2)}deg`);
      style.setProperty(`--ag-ry-${i}`, `${ryDeg.toFixed(2)}deg`);
      style.setProperty(`--ag-rz-${i}`, `${rzDeg.toFixed(2)}deg`);
      style.setProperty(`--ag-sh-${i}`, shadowScale.toFixed(3));
      style.setProperty(`--ag-sh-op-${i}`, shadowOpacity.toFixed(3));
    }
  };

  rafId = window.requestAnimationFrame(step);

  return () => {
    disposed = true;
    if (rafId) window.cancelAnimationFrame(rafId);
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
