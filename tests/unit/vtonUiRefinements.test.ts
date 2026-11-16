import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  angle360ToSignedScrollDeg,
  resolveEffectiveVtonStyleMode,
  resolveSignedAngleScrollState,
} from '../../src/services/vton2DService.ts';

describe('Outfits & Profile VTON Style Gate and Symmetrical Angle Scrollbar', () => {
  it('enforces Character Simulation (stylized_isometric) whenever no user portrait photo is registered', () => {
    assert.equal(
      resolveEffectiveVtonStyleMode({ preferredStyle: null, hasFacePhoto: false }),
      'stylized_isometric'
    );
    assert.equal(
      resolveEffectiveVtonStyleMode({ preferredStyle: 'photorealistic', hasFacePhoto: false }),
      'stylized_isometric'
    );
    assert.equal(
      resolveEffectiveVtonStyleMode({ preferredStyle: 'stylized_isometric', hasFacePhoto: false }),
      'stylized_isometric'
    );
  });

  it('honors Photorealistic Model when a user portrait photo is registered and selected', () => {
    assert.equal(
      resolveEffectiveVtonStyleMode({ preferredStyle: 'photorealistic', hasFacePhoto: true }),
      'photorealistic'
    );
    assert.equal(
      resolveEffectiveVtonStyleMode({ preferredStyle: 'stylized_isometric', hasFacePhoto: true }),
      'stylized_isometric'
    );
  });

  it('starts symmetrical angle scrollbar at 0° Front in the center and maps both -180 and +180 ends to 180° Back', () => {
    const center = resolveSignedAngleScrollState(0);
    assert.equal(center.clampedScrollDeg, 0);
    assert.equal(center.angle360, 0);
    assert.equal(center.residualYawDeg, 0);

    const leftBack = resolveSignedAngleScrollState(-180);
    assert.equal(leftBack.clampedScrollDeg, -180);
    assert.equal(leftBack.angle360, 180);
    assert.equal(leftBack.residualYawDeg, 0);

    const rightBack = resolveSignedAngleScrollState(180);
    assert.equal(rightBack.clampedScrollDeg, 180);
    assert.equal(rightBack.angle360, 180);
    assert.equal(rightBack.residualYawDeg, 0);
  });

  it('interpolates intermediate scrollbar angles smoothly across all 8 turnaround views and preserves left/right 180° sign', () => {
    const pos45 = resolveSignedAngleScrollState(45);
    assert.equal(pos45.angle360, 45);
    assert.equal(pos45.residualYawDeg, 0);

    const neg45 = resolveSignedAngleScrollState(-45);
    assert.equal(neg45.angle360, 315);
    assert.equal(neg45.residualYawDeg, 0);

    const neg90 = resolveSignedAngleScrollState(-90);
    assert.equal(neg90.angle360, 270);

    const microScrub = resolveSignedAngleScrollState(18);
    assert.equal(microScrub.angle360, 0);
    assert.ok(microScrub.residualYawDeg > 0 && microScrub.residualYawDeg <= 11);

    assert.equal(angle360ToSignedScrollDeg(0, 0), 0);
    assert.equal(angle360ToSignedScrollDeg(45, 0), 45);
    assert.equal(angle360ToSignedScrollDeg(315, 0), -45);
    assert.equal(angle360ToSignedScrollDeg(270, 0), -90);
    assert.equal(angle360ToSignedScrollDeg(180, -135), -180);
    assert.equal(angle360ToSignedScrollDeg(180, 135), 180);
  });
});
