/**
 * Lightweight Bone-Based `SpringBone` Physics Solver (Requirement 6.d)
 * Replaces heavy per-vertex cloth simulation with O(1) damped rotational/pendulum
 * spring-bone constraints to guarantee mobile 60 FPS on mufflers, scarves, bags, coats, and skirts.
 */

export class SpringBoneConstraint {
  constructor({
    name,
    stiffness = 26.0,
    damping = 5.4,
    gravityDroop = 0.0,
    minRx = -0.24,
    maxRx = 0.24,
    minRz = -0.24,
    maxRz = 0.24,
    restRollRad = 0.0,
  }) {
    this.name = name;
    this.stiffness = stiffness;
    this.damping = damping;
    this.gravityDroop = gravityDroop;
    this.minRx = minRx;
    this.maxRx = maxRx;
    this.minRz = minRz;
    this.maxRz = maxRz;
    this.restRollRad = restRollRad;

    this.rx = 0;
    this.rz = restRollRad;
    this.vrx = 0;
    this.vrz = 0;
  }

  configure(preset = {}) {
    if (preset.stiffness !== undefined) this.stiffness = preset.stiffness;
    if (preset.damping !== undefined) this.damping = preset.damping;
    if (preset.maxPitchRad !== undefined) {
      this.minRx = -preset.maxPitchRad;
      this.maxRx = preset.maxPitchRad;
    }
    if (preset.maxRollRad !== undefined) {
      this.minRz = preset.outwardRestRollRad ? 0.02 : -preset.maxRollRad;
      this.maxRz = preset.maxRollRad + (preset.outwardRestRollRad || 0);
    }
    if (preset.outwardRestRollRad !== undefined) {
      this.restRollRad = preset.outwardRestRollRad;
    }
  }

  step(dt, targetRx, targetRz) {
    const clampedDt = Math.min(0.033, Math.max(0.004, dt));
    const goalRx = targetRx + this.gravityDroop;
    const goalRz = targetRz + this.restRollRad;

    const ax = (goalRx - this.rx) * this.stiffness - this.vrx * this.damping;
    const az = (goalRz - this.rz) * this.stiffness - this.vrz * this.damping;

    this.vrx += ax * clampedDt;
    this.vrz += az * clampedDt;

    this.rx = Math.min(this.maxRx, Math.max(this.minRx, this.rx + this.vrx * clampedDt));
    this.rz = Math.min(this.maxRz, Math.max(this.minRz, this.rz + this.vrz * clampedDt));

    return { rx: this.rx, rz: this.rz };
  }

  reset() {
    this.rx = 0;
    this.rz = this.restRollRad;
    this.vrx = 0;
    this.vrz = 0;
  }
}

export class SpringBoneSystem {
  constructor() {
    this.neckSpring = new SpringBoneConstraint({
      name: 'jiggleNeck',
      stiffness: 26.0,
      damping: 5.2,
      gravityDroop: -0.02,
      minRx: -0.22,
      maxRx: 0.02,
      minRz: -0.20,
      maxRz: 0.20,
    });

    this.hemSpring = new SpringBoneConstraint({
      name: 'jiggleHem',
      stiffness: 28.0,
      damping: 5.8,
      minRx: -0.16,
      maxRx: 0.16,
      minRz: -0.18,
      maxRz: 0.18,
    });

    this.handBagSpring = new SpringBoneConstraint({
      name: 'handSocketBag',
      stiffness: 26.0,
      damping: 4.8,
      minRx: -0.32,
      maxRx: 0.32,
      minRz: 0.015,
      maxRz: 0.26,
      restRollRad: 0.065,
    });
  }

  update({ dt, timeSec, walkWeight, yawVel, handAccelX, handAccelZ }) {
    const wind = Math.sin(timeSec * 2.1) * 0.4 + Math.sin(timeSec * 3.7) * 0.25;
    const walkZ = walkWeight * Math.cos(timeSec * 3.8) * 1.1;
    const walkX = walkWeight * Math.abs(Math.sin(timeSec * 3.8)) * 0.55;
    const spinZ = Math.max(-2.5, Math.min(2.5, yawVel)) * 0.65;

    const neck = this.neckSpring.step(
      dt,
      -(walkX * 0.06 + Math.max(0, wind) * 0.045),
      spinZ * 0.09 + walkZ * 0.045 + wind * 0.032
    );

    const hem = this.hemSpring.step(
      dt,
      walkX * 0.04 + wind * 0.022,
      spinZ * 0.11 + walkZ * 0.055 + wind * 0.025
    );

    const bag = this.handBagSpring.step(
      dt,
      -handAccelZ * 0.032 + Math.sin(timeSec * 1.9) * 0.018,
      -handAccelX * 0.022 + Math.abs(yawVel) * 0.055
    );

    return { neck, hem, bag };
  }
}
