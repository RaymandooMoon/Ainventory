import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAntiGravityStateRef,
  injectAntiGravityImpulse,
  stepAntiGravityCycle,
  syncAntiGravityExternalPause,
} from '../../src/services/antiGravityMotion.ts';
import {
  createAdaptivePacerState,
  markPacerActivity,
  recordFrameWorkCost,
  resetPacerOnResume,
  resolveFpsTier,
  sampleDisplayRefreshHz,
  shouldCommitFrame,
} from '../../src/utils/adaptiveFramePacer.ts';

function createMockStyleCollector() {
  const props = new Map<string, string>();
  let writeCount = 0;
  return {
    style: {
      setProperty(name: string, value: string) {
        props.set(name, value);
        writeCount += 1;
      },
    },
    props,
    getWriteCount: () => writeCount,
    resetWriteCount: () => {
      writeCount = 0;
    },
  };
}

test('adaptiveFramePacer auto-detects 120Hz, 90Hz, and 60Hz displays while ignoring long pause gaps', () => {
  const p120 = createAdaptivePacerState({ now: 0 });
  let t = 100;
  for (let i = 0; i < 8; i += 1) {
    sampleDisplayRefreshHz(p120, t);
    t += 8.33;
  }
  assert.equal(p120.detectedRefreshHz, 120);

  // Inject a 250ms tab-switch pause gap: must NOT corrupt 120Hz classification
  sampleDisplayRefreshHz(p120, t + 250);
  assert.equal(p120.detectedRefreshHz, 120);

  const p90 = createAdaptivePacerState({ now: 0 });
  t = 100;
  for (let i = 0; i < 8; i += 1) {
    sampleDisplayRefreshHz(p90, t);
    t += 11.11;
  }
  assert.equal(p90.detectedRefreshHz, 90);

  const p60 = createAdaptivePacerState({ now: 0 });
  t = 100;
  for (let i = 0; i < 8; i += 1) {
    sampleDisplayRefreshHz(p60, t);
    t += 16.67;
  }
  assert.equal(p60.detectedRefreshHz, 60);
});

test('adaptiveFramePacer transitions smoothly across boost120 -> active60 -> idle30 -> paused', () => {
  const pacer = createAdaptivePacerState({ allowHighRefresh: true, now: 1000 });
  // Feed 120Hz display samples
  for (let i = 0; i < 7; i += 1) {
    sampleDisplayRefreshHz(pacer, 1000 + i * 8.33);
  }
  assert.equal(pacer.detectedRefreshHz, 120);

  // 1) Active gesture -> boost120
  markPacerActivity(pacer, 1100, true);
  assert.equal(
    resolveFpsTier(pacer, 1120, { paused: false, isBoostActive: true, isStandardActive: true }),
    'boost120'
  );
  // 8.33ms later should commit at 120fps
  pacer.lastCommitNow = 1120;
  assert.equal(shouldCommitFrame(pacer, 1128.33, 'boost120'), true);

  // 2) After boost hold (>650ms) but within idle hold (<=1800ms) -> active60
  const tier60 = resolveFpsTier(pacer, 2000, {
    paused: false,
    isBoostActive: false,
    isStandardActive: false,
  });
  assert.equal(tier60, 'active60');
  pacer.lastCommitNow = 2000;
  assert.equal(shouldCommitFrame(pacer, 2008.33, 'active60'), false);
  assert.equal(shouldCommitFrame(pacer, 2016.67, 'active60'), true);

  // 3) After idle hold (>1800ms) -> idle30
  const tier30 = resolveFpsTier(pacer, 3200, {
    paused: false,
    isBoostActive: false,
    isStandardActive: false,
  });
  assert.equal(tier30, 'idle30');
  pacer.lastCommitNow = 3200;
  assert.equal(shouldCommitFrame(pacer, 3208.33, 'idle30'), false);
  assert.equal(shouldCommitFrame(pacer, 3216.67, 'idle30'), false);
  assert.equal(shouldCommitFrame(pacer, 3225.0, 'idle30'), false);
  assert.equal(shouldCommitFrame(pacer, 3233.33, 'idle30'), true);

  // 4) Paused -> 0fps
  const tierPaused = resolveFpsTier(pacer, 3300, {
    paused: true,
    isBoostActive: true,
    isStandardActive: true,
  });
  assert.equal(tierPaused, 'paused');
  assert.equal(shouldCommitFrame(pacer, 3400, 'paused'), false);
});

test('frame-budget guard steps down from 120fps to 60fps on consecutive slow frames and recovers after cooldown', () => {
  const pacer = createAdaptivePacerState({ allowHighRefresh: true, now: 0 });
  for (let i = 0; i < 7; i += 1) {
    sampleDisplayRefreshHz(pacer, 100 + i * 8.33);
  }
  assert.equal(pacer.detectedRefreshHz, 120);

  // Simulate 6 consecutive slow frames (> 6.8ms work on a 120Hz frame budget)
  for (let i = 0; i < 6; i += 1) {
    recordFrameWorkCost(pacer, 8.4, 200 + i * 8.33, 'boost120');
  }
  assert.equal(pacer.budgetGuardActive, true);

  // Even during active boost, tier safely caps at active60
  const guardedTier = resolveFpsTier(pacer, 300, {
    paused: false,
    isBoostActive: true,
    isStandardActive: true,
  });
  assert.equal(guardedTier, 'active60');

  // After 12s cooldown, boost120 cleanly re-enables
  const recoveredTier = resolveFpsTier(pacer, 13000, {
    paused: false,
    isBoostActive: true,
    isStandardActive: true,
  });
  assert.equal(pacer.budgetGuardActive, false);
  assert.equal(recoveredTier, 'boost120');
});

test('Anti-Gravity shared state ref throttles 120Hz -> 30fps at rest and skips redundant quantized CSS writes', () => {
  const stateRef = createAntiGravityStateRef({ allowHighRefresh: true, now: 0 });
  const collector = createMockStyleCollector();

  // Warm up 120Hz display with active scroll impulse
  injectAntiGravityImpulse(stateRef.current, 90, 1, 100);
  let activeCommits = 0;
  let now = 100;
  for (let i = 0; i < 24; i += 1) {
    const res = stepAntiGravityCycle(stateRef.current, now, collector.style);
    if (res.committed) activeCommits += 1;
    now += 8.33;
  }
  // Every 8.33ms frame commits during active 120Hz boost
  assert.equal(stateRef.current.pacer.detectedRefreshHz, 120);
  assert.equal(activeCommits, 24);
  assert.equal(collector.props.size, 24); // 4 channels * 6 CSS custom properties

  // Advance past cooldown and let kinetic energy settle to zero (idle30 mode)
  stateRef.current.kineticEnergy = 0;
  stateRef.current.signedMomentum = 0;
  stateRef.current.rawImpulseAccum = 0;
  stateRef.current.rawSignedAccum = 0;
  now += 2500;
  stateRef.current.lastFrameNow = now - 8.33;
  stateRef.current.pacer.lastCommitNow = now - 8.33;

  let idleCommits = 0;
  let idleSkipped = 0;
  let idleWrites = 0;
  for (let i = 0; i < 40; i += 1) {
    const res = stepAntiGravityCycle(stateRef.current, now, collector.style);
    if (res.committed) {
      idleCommits += 1;
      idleWrites += res.writes;
    } else {
      idleSkipped += 1;
    }
    now += 8.33;
  }

  // On a 120Hz screen in idle30 mode, ~75% of raw rAF ticks are skipped (~10 commits out of 40 ticks)
  assert.equal(stateRef.current.pacer.fpsTier, 'idle30');
  assert.ok(idleCommits >= 8 && idleCommits <= 12, `Expected ~10 idle commits, got ${idleCommits}`);
  assert.ok(idleSkipped >= 28, `Expected >=28 skipped ticks, got ${idleSkipped}`);
  // Quantized diffing skips unchanged CSS properties (strictly fewer than idleCommits * 24)
  assert.ok(
    idleWrites < idleCommits * 24,
    `Expected quantized diffing to skip writes (${idleWrites} < ${idleCommits * 24})`
  );
});

test('Anti-Gravity shared state ref preserves exact phase continuity across pause and resume (zero jump)', () => {
  const stateRef = createAntiGravityStateRef({ allowHighRefresh: true, now: 1000 });
  const collector = createMockStyleCollector();

  // Advance a few frames
  stepAntiGravityCycle(stateRef.current, 1000, collector.style);
  stepAntiGravityCycle(stateRef.current, 1016.67, collector.style);
  const phaseBeforePause = stateRef.current.phase;
  const rotBeforePause = stateRef.current.rotPhase;

  // Pause via external modal sync
  let syncCalls = 0;
  stateRef.current.onPauseStateChanged = () => {
    syncCalls += 1;
    stateRef.current.paused = stateRef.current.externalPaused;
  };
  syncAntiGravityExternalPause(stateRef, true);
  assert.equal(syncCalls, 1);
  assert.equal(stateRef.current.paused, true);

  // Ticks during pause must NOT advance physics or write CSS
  collector.resetWriteCount();
  const pausedRes = stepAntiGravityCycle(stateRef.current, 6000, collector.style);
  assert.equal(pausedRes.committed, false);
  assert.equal(pausedRes.tier, 'paused');
  assert.equal(collector.getWriteCount(), 0);
  assert.equal(stateRef.current.phase, phaseBeforePause);
  assert.equal(stateRef.current.rotPhase, rotBeforePause);

  // Resume cleanly after 5 seconds with timestamp reset
  syncAntiGravityExternalPause(stateRef, false);
  stateRef.current.lastFrameNow = 6000;
  resetPacerOnResume(stateRef.current.pacer, 6000);
  const resumedRes = stepAntiGravityCycle(stateRef.current, 6016.67, collector.style);
  assert.equal(resumedRes.committed, true);

  // Phase advance must equal ~1 frame (16.67ms * 1.18 ≈ 0.0197 rad), NOT 5 seconds (~5.9 rad)!
  const phaseDelta = stateRef.current.phase - phaseBeforePause;
  assert.ok(phaseDelta > 0.01 && phaseDelta < 0.05, `Unexpected phase jump on resume: ${phaseDelta}`);
});

test('Anti-Gravity physics integration is dt-invariant across 120fps and 30fps', () => {
  const ref120 = createAntiGravityStateRef({ allowHighRefresh: true, now: 0 });
  const ref30 = createAntiGravityStateRef({ allowHighRefresh: false, now: 0 });

  ref120.current.kineticEnergy = 0.8;
  ref30.current.kineticEnergy = 0.8;
  ref120.current.lastFrameNow = 0;
  ref30.current.lastFrameNow = 0;

  // Simulate 0.5 seconds at 120Hz (60 steps of 8.333ms)
  for (let i = 1; i <= 60; i += 1) {
    ref120.current.pacer.lastCommitNow = 0; // force commit each step
    stepAntiGravityCycle(ref120.current, i * (1000 / 120), null);
  }

  // Simulate 0.5 seconds at 30Hz (15 steps of 33.333ms)
  for (let i = 1; i <= 15; i += 1) {
    ref30.current.pacer.lastCommitNow = 0;
    stepAntiGravityCycle(ref30.current, i * (1000 / 30), null);
  }

  // Exponential decay & phase integration should match closely across 30Hz and 120Hz
  assert.ok(
    Math.abs(ref120.current.kineticEnergy - ref30.current.kineticEnergy) < 0.005,
    `Kinetic energy diverged: 120Hz=${ref120.current.kineticEnergy}, 30Hz=${ref30.current.kineticEnergy}`
  );
  assert.ok(
    Math.abs(ref120.current.phase - ref30.current.phase) < 0.04,
    `Phase diverged: 120Hz=${ref120.current.phase}, 30Hz=${ref30.current.phase}`
  );
});
