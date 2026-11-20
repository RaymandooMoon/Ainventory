import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeminiTryOnPrompt,
  buildServerPoseBlueprintPart,
  normalizeVtonProfile,
  resolveTurnaroundThinkingLevel,
} from '../../server/vtonService.js';
import { planLocalTurnaroundDirectionalRecovery } from '../../src/services/vton2DService.ts';
import {
  TURNAROUND_BLUR_MAX_PX,
  TURNAROUND_BRIDGE_MAX_YAW_DEG,
  computeCrossfadeBridgeState,
  computeDirectionalBlurPx,
  continuousAngleToTurnaround360,
  shortestAngleDeltaDeg,
  snapToNearest45Deg,
  stepTurnaroundInertia,
  wrapSignedAngleDeg,
} from '../../src/utils/turnaroundPhysics.ts';

describe('4x2 Nano Banana Blueprint Pipeline & Thinking Level', () => {
  it('defaults turnaround thinking level to HIGH and respects GEMINI_VTON_THINKING_LEVEL overrides', () => {
    const prev = process.env.GEMINI_VTON_THINKING_LEVEL;
    try {
      delete process.env.GEMINI_VTON_THINKING_LEVEL;
      assert.equal(resolveTurnaroundThinkingLevel(), 'HIGH');

      process.env.GEMINI_VTON_THINKING_LEVEL = 'medium';
      assert.equal(resolveTurnaroundThinkingLevel(), 'MEDIUM');

      process.env.GEMINI_VTON_THINKING_LEVEL = 'minimal';
      assert.equal(resolveTurnaroundThinkingLevel(), 'MINIMAL');

      process.env.GEMINI_VTON_THINKING_LEVEL = 'off';
      assert.equal(resolveTurnaroundThinkingLevel(), null);

      process.env.GEMINI_VTON_THINKING_LEVEL = 'invalid_value';
      assert.equal(resolveTurnaroundThinkingLevel(), 'HIGH');
    } finally {
      if (prev === undefined) {
        delete process.env.GEMINI_VTON_THINKING_LEVEL;
      } else {
        process.env.GEMINI_VTON_THINKING_LEVEL = prev;
      }
    }
  });

  it('loads the static 800x600 (4:3) 3D clay mannequin pose blueprint for 4x2 sheets only', () => {
    const profile4x2 = normalizeVtonProfile({
      turnaroundSheet: true,
      turnaroundLayout: 'turnaround_4x2',
    });
    const part = buildServerPoseBlueprintPart(profile4x2);
    assert.ok(part, 'Expected pose blueprint part for 4x2 turnaround');
    assert.equal(part.mimeType, 'image/png');
    const pngBuf = Buffer.from(part.data, 'base64');
    assert.equal(pngBuf.readUInt32BE(16), 800);
    assert.equal(pngBuf.readUInt32BE(20), 600);

    const profile3x2 = normalizeVtonProfile({
      turnaroundSheet: true,
      turnaroundLayout: 'turnaround_3x2',
    });
    assert.equal(buildServerPoseBlueprintPart(profile3x2), null);

    const profileSingle = normalizeVtonProfile({ turnaroundSheet: false, viewAngleDeg: 0 });
    assert.equal(buildServerPoseBlueprintPart(profileSingle), null);
  });

  it('generates concise affirmative 4x2 narrative prompt with Image 1 blueprint mapping and zero NEVER LEFT/RIGHT bloat', () => {
    const profile = normalizeVtonProfile({
      gender: 'male',
      heightCm: 178,
      weightKg: 72,
      dominantHand: 'right',
      turnaroundSheet: true,
      turnaroundLayout: 'turnaround_4x2',
      styleMode: 'stylized_isometric',
    });
    const prompt = buildGeminiTryOnPrompt(profile, {
      outer: {
        name: '네이비 울 오버코트',
        category: 'outer',
        subcategory: 'coat',
        color_name: '네이비',
        color_hex: '#1E293B',
        fabric: 'wool',
      },
      accessory: {
        name: '탄 레더 메신저백',
        category: 'accessory',
        subcategory: 'bag',
        color_name: '탄',
        color_hex: '#B07D52',
        fabric: 'leather',
        isBag: true,
        hasStrap: true,
        bagCarryStyle: 'shoulder',
      },
    });

    assert.match(prompt, /IMAGE 1 — 8-ANGLE 4x2 POSE, FACING & SCALE BLUEPRINT ONLY/);
    assert.match(prompt, /Reference Role Mapping/);
    assert.match(prompt, /8-ANGLE 4x2/i);
    assert.match(prompt, /EQUAL-SCALE FULL-BODY BOTH-ROWS/i);
    assert.match(prompt, /RIGHT EAR/);
    assert.match(prompt, /LEFT EAR/);
    assert.match(prompt, /270°/);
    assert.match(prompt, /315°/);
    assert.doesNotMatch(prompt, /NEVER LEFT/i);
    assert.doesNotMatch(prompt, /NEVER RIGHT/i);
    assert.doesNotMatch(prompt, /STRICTLY FORBIDDEN/i);
  });
});

describe('Local $0 Directional Turnaround Safety Net', () => {
  it('swaps transposed 135/225 and 45/315 even with a bag while protecting asymmetric 90/270 occlusion', () => {
    const plan = planLocalTurnaroundDirectionalRecovery(
      {
        45: 'left',
        90: 'left',
        135: 'left',
        225: 'right',
        270: 'right',
        315: 'right',
      },
      { hasEquippedBag: true }
    );
    assert.deepEqual(plan.swaps, [
      [45, 315],
      [135, 225],
    ]);
    assert.deepEqual(plan.mirrorCopies, []);
    assert.deepEqual(plan.flipInPlace, []);
  });

  it('recovers duplicated or neutral opposite angles via $0 horizontal mirroring on bag-free outfits', () => {
    const plan = planLocalTurnaroundDirectionalRecovery(
      {
        45: 'right',
        90: 'right',
        135: 'right',
        225: 'right', // duplicated facing right -> mirror 135° into 225°
        270: 'neutral', // ambiguous -> mirror 90° into 270°
        315: 'left',
      },
      { hasEquippedBag: false }
    );
    assert.deepEqual(plan.swaps, []);
    assert.deepEqual(plan.mirrorCopies, [
      { targetAngle: 270, sourceAngle: 90 },
      { targetAngle: 225, sourceAngle: 135 },
    ]);
    assert.deepEqual(plan.flipInPlace, []);
  });

  it('swaps full-row inversion including 90/270 when bag-free', () => {
    const plan = planLocalTurnaroundDirectionalRecovery(
      {
        45: 'left',
        90: 'left',
        135: 'left',
        225: 'right',
        270: 'right',
        315: 'right',
      },
      { hasEquippedBag: false }
    );
    assert.deepEqual(plan.swaps, [
      [45, 315],
      [90, 270],
      [135, 225],
    ]);
  });
});

describe('Smooth 8-Angle Turnaround Physics & Crossfade Bridge', () => {
  it('wraps signed angles and computes shortest angular delta accurately', () => {
    assert.equal(wrapSignedAngleDeg(225), -135);
    assert.equal(wrapSignedAngleDeg(-225), 135);
    assert.equal(wrapSignedAngleDeg(-180), -180);
    assert.equal(snapToNearest45Deg(68), 90);
    assert.equal(continuousAngleToTurnaround360(-45), 315);
    assert.equal(shortestAngleDeltaDeg(315, 0), 45);
    assert.equal(shortestAngleDeltaDeg(0, 315), -45);
  });

  it('keeps idle/slow velocity razor sharp (0px blur), ramps smoothly on fast flicks, and respects reduced motion', () => {
    assert.equal(computeDirectionalBlurPx(0), 0);
    assert.equal(computeDirectionalBlurPx(105), 0);
    const midBlur = computeDirectionalBlurPx(450);
    assert.ok(midBlur > 0.5 && midBlur < TURNAROUND_BLUR_MAX_PX);
    assert.equal(computeDirectionalBlurPx(1200), TURNAROUND_BLUR_MAX_PX);
    assert.equal(computeDirectionalBlurPx(-1200), TURNAROUND_BLUR_MAX_PX);
    assert.equal(computeDirectionalBlurPx(1200, true), 0);
  });

  it('produces symmetric smoothstep crossfade opacity and counter-rotating 2.5D yaw bridge', () => {
    const start = computeCrossfadeBridgeState({ progress: 0, directionSign: 1 });
    assert.equal(start.outgoingOpacity, 1);
    assert.equal(start.incomingOpacity, 0);
    assert.equal(start.outgoingYawDeg, 0);
    assert.equal(start.incomingYawDeg, -TURNAROUND_BRIDGE_MAX_YAW_DEG);

    const mid = computeCrossfadeBridgeState({ progress: 0.5, directionSign: 1 });
    assert.equal(mid.outgoingOpacity, 0.5);
    assert.equal(mid.incomingOpacity, 0.5);
    assert.ok(mid.outgoingYawDeg > 0);
    assert.ok(mid.incomingYawDeg < 0);

    const end = computeCrossfadeBridgeState({ progress: 1, directionSign: 1 });
    assert.equal(end.done, true);
    assert.equal(end.outgoingOpacity, 0);
    assert.equal(end.incomingOpacity, 1);

    const reduced = computeCrossfadeBridgeState({
      progress: 0.25,
      directionSign: 1,
      reducedMotion: true,
    });
    assert.equal(reduced.done, true);
    assert.equal(reduced.incomingOpacity, 1);
  });

  it('coasts smoothly on a fast flick and converges cleanly onto a 45-degree magnetic detent', () => {
    let state = {
      angleDeg: 0,
      velocityDegPerSec: 880,
      targetDetentDeg: null as number | null,
    };
    let settled = false;
    let maxBlurSeen = 0;
    const visitedSlices = new Set<number>([0]);

    for (let frame = 0; frame < 180; frame += 1) {
      const next = stepTurnaroundInertia(state, { dtSec: 1 / 60 });
      state = {
        angleDeg: next.angleDeg,
        velocityDegPerSec: next.velocityDegPerSec,
        targetDetentDeg: next.targetDetentDeg,
      };
      visitedSlices.add(next.snappedAngle360);
      if (next.blurPx > maxBlurSeen) maxBlurSeen = next.blurPx;
      if (next.settled) {
        settled = true;
        assert.equal(next.velocityDegPerSec, 0);
        assert.equal(next.residualYawDeg, 0);
        assert.equal(next.blurPx, 0);
        assert.equal(Math.abs(next.angleDeg % 45), 0);
        break;
      }
    }

    assert.equal(settled, true, 'Inertial spin must settle onto a 45° magnetic detent');
    assert.ok(visitedSlices.size >= 3, `Expected multi-angle coast, visited: ${[...visitedSlices]}`);
    assert.ok(maxBlurSeen >= 3.5, `Expected noticeable kinetic blur during fast flick, got ${maxBlurSeen}`);
  });
});
