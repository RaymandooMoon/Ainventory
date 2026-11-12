/**
 * Lightweight Multi-Chain `SpringBone` & Aerodynamic Wind Solver (Requirement 6.d)
 *
 * Replaces expensive per-vertex cloth simulation with O(1) GPU-skinned articulated chains:
 *  1. 2-Link Ribbon Chain (`neckUpper` -> `neckTip`): Phase-lagged S-curve wave + Karman flutter for mufflers & ties.
 *  2. 2-Link Hem + Lapel Chain (`hemUpper` -> `hemLower`, `lapel`) + Radial Billow Scale: Wind-filled volume for coats, skirts, dresses & tops.
 *  3. Coupled Strap & D-Ring Pouch Rig (`bagStrap` -> `crossbodyBag`): Footstrike vertical bounce, stride pendulum, elastic strap tension & hip-tap rebound.
 *  4. 3-DOF Hand-Socket Pendulum (`handBag`): Stride swing, centrifugal roll & wind twist for briefcases & shopper totes.
 */

export class SpringBoneConstraint {
  constructor({
    name,
    stiffness = 26.0,
    damping = 5.0,
    linearStiffness = 38.0,
    linearDamping = 6.2,
    gravityDroop = 0.0,
    minRx = -0.28,
    maxRx = 0.28,
    minRy = -0.22,
    maxRy = 0.22,
    minRz = -0.28,
    maxRz = 0.28,
    minDy = -0.012,
    maxDy = 0.012,
    restRollRad = 0.0,
    rebound = 0.24,
  }) {
    this.name = name;
    this.stiffness = stiffness;
    this.damping = damping;
    this.linearStiffness = linearStiffness;
    this.linearDamping = linearDamping;
    this.gravityDroop = gravityDroop;
    this.minRx = minRx;
    this.maxRx = maxRx;
    this.minRy = minRy;
    this.maxRy = maxRy;
    this.minRz = minRz;
    this.maxRz = maxRz;
    this.minDy = minDy;
    this.maxDy = maxDy;
    this.restRollRad = restRollRad;
    this.rebound = rebound;

    this.rx = 0;
    this.ry = 0;
    this.rz = restRollRad;
    this.dy = 0;

    this.vrx = 0;
    this.vry = 0;
    this.vrz = 0;
    this.vdy = 0;
  }

  configure(preset = {}) {
    if (preset.stiffness !== undefined) this.stiffness = preset.stiffness;
    if (preset.damping !== undefined) this.damping = preset.damping;
    if (preset.maxPitchRad !== undefined) {
      this.minRx = -preset.maxPitchRad;
      this.maxRx = preset.maxPitchRad;
    }
    if (preset.maxYawRad !== undefined) {
      this.minRy = -preset.maxYawRad;
      this.maxRy = preset.maxYawRad;
    }
    if (preset.maxRollRad !== undefined) {
      this.minRz = preset.outwardRestRollRad ? 0.018 : -preset.maxRollRad;
      this.maxRz = preset.maxRollRad + (preset.outwardRestRollRad || 0);
    }
    if (preset.outwardRestRollRad !== undefined) {
      this.restRollRad = preset.outwardRestRollRad;
    }
    if (preset.windSensitivity !== undefined) {
      this.windSensitivity = preset.windSensitivity;
    }
  }

  step(dt, targetRx = 0, targetRz = 0, targetRy = 0, targetDy = 0) {
    const clampedDt = Math.min(0.033, Math.max(0.004, dt));
    const goalRx = targetRx + this.gravityDroop;
    const goalRy = targetRy;
    const goalRz = targetRz + this.restRollRad;
    const goalDy = targetDy;

    const ax = (goalRx - this.rx) * this.stiffness - this.vrx * this.damping;
    const ay = (goalRy - this.ry) * this.stiffness - this.vry * this.damping;
    const az = (goalRz - this.rz) * this.stiffness - this.vrz * this.damping;
    const ady = (goalDy - this.dy) * this.linearStiffness - this.vdy * this.linearDamping;

    this.vrx += ax * clampedDt;
    this.vry += ay * clampedDt;
    this.vrz += az * clampedDt;
    this.vdy += ady * clampedDt;

    let nextRx = this.rx + this.vrx * clampedDt;
    if (nextRx < this.minRx) {
      nextRx = this.minRx;
      if (this.vrx < 0) this.vrx *= -this.rebound;
    } else if (nextRx > this.maxRx) {
      nextRx = this.maxRx;
      if (this.vrx > 0) this.vrx *= -this.rebound;
    }

    let nextRy = this.ry + this.vry * clampedDt;
    if (nextRy < this.minRy) {
      nextRy = this.minRy;
      if (this.vry < 0) this.vry *= -this.rebound;
    } else if (nextRy > this.maxRy) {
      nextRy = this.maxRy;
      if (this.vry > 0) this.vry *= -this.rebound;
    }

    let nextRz = this.rz + this.vrz * clampedDt;
    if (nextRz < this.minRz) {
      nextRz = this.minRz;
      if (this.vrz < 0) this.vrz *= -this.rebound;
    } else if (nextRz > this.maxRz) {
      nextRz = this.maxRz;
      if (this.vrz > 0) this.vrz *= -this.rebound;
    }

    let nextDy = this.dy + this.vdy * clampedDt;
    if (nextDy < this.minDy) {
      nextDy = this.minDy;
      if (this.vdy < 0) this.vdy *= -this.rebound;
    } else if (nextDy > this.maxDy) {
      nextDy = this.maxDy;
      if (this.vdy > 0) this.vdy *= -this.rebound;
    }

    this.rx = nextRx;
    this.ry = nextRy;
    this.rz = nextRz;
    this.dy = nextDy;

    return { rx: this.rx, ry: this.ry, rz: this.rz, dy: this.dy };
  }

  reset() {
    this.rx = 0;
    this.ry = 0;
    this.rz = this.restRollRad;
    this.dy = 0;
    this.vrx = 0;
    this.vry = 0;
    this.vrz = 0;
    this.vdy = 0;
  }
}

export class SpringBoneSystem {
  constructor() {
    // 1. 2-Link Muffler & Silk Tie Chain (`rx <= 0.015` strictly prevents chest penetration)
    this.neckUpperSpring = new SpringBoneConstraint({
      name: 'jiggleNeckUpper',
      stiffness: 22.0,
      damping: 4.1,
      gravityDroop: -0.018,
      minRx: -0.38,
      maxRx: 0.014,
      minRy: -0.24,
      maxRy: 0.24,
      minRz: -0.30,
      maxRz: 0.34,
      rebound: 0.20,
    });

    this.neckTipSpring = new SpringBoneConstraint({
      name: 'jiggleNeckTip',
      stiffness: 15.5,
      damping: 2.9,
      gravityDroop: -0.012,
      minRx: -0.46,
      maxRx: 0.025,
      minRy: -0.32,
      maxRy: 0.32,
      minRz: -0.40,
      maxRz: 0.44,
      rebound: 0.22,
    });

    // 2. 2-Link Coat / Skirt / Dress Hem Chain + Open Lapel Drape Bone
    this.hemUpperSpring = new SpringBoneConstraint({
      name: 'jiggleHemUpper',
      stiffness: 26.0,
      damping: 5.0,
      minRx: -0.20,
      maxRx: 0.20,
      minRy: -0.16,
      maxRy: 0.16,
      minRz: -0.22,
      maxRz: 0.24,
    });

    this.hemLowerSpring = new SpringBoneConstraint({
      name: 'jiggleHemLower',
      stiffness: 17.5,
      damping: 3.5,
      minRx: -0.28,
      maxRx: 0.26,
      minRy: -0.24,
      maxRy: 0.24,
      minRz: -0.30,
      maxRz: 0.32,
    });

    this.lapelSpring = new SpringBoneConstraint({
      name: 'jiggleLapel',
      stiffness: 28.0,
      damping: 4.6,
      gravityDroop: -0.008,
      minRx: -0.24,
      maxRx: 0.010,
      minRy: -0.18,
      maxRy: 0.18,
      minRz: -0.18,
      maxRz: 0.20,
      rebound: 0.18,
    });

    // 3. Coupled Crossbody Strap Flex + D-Ring Saddle Bag (`minRz = -0.004` prevents hip clipping)
    this.bagStrapSpring = new SpringBoneConstraint({
      name: 'jiggleStrap',
      stiffness: 36.0,
      damping: 5.4,
      linearStiffness: 46.0,
      linearDamping: 6.4,
      minRx: -0.09,
      maxRx: 0.09,
      minRy: -0.06,
      maxRy: 0.06,
      minRz: -0.008,
      maxRz: 0.09,
      minDy: -0.005,
      maxDy: 0.005,
      rebound: 0.22,
    });

    this.crossbodyBagSpring = new SpringBoneConstraint({
      name: 'jiggleCrossbodyBag',
      stiffness: 28.0,
      damping: 4.2,
      linearStiffness: 40.0,
      linearDamping: 5.2,
      minRx: -0.26,
      maxRx: 0.26,
      minRy: -0.16,
      maxRy: 0.16,
      minRz: -0.004,
      maxRz: 0.28,
      minDy: -0.009,
      maxDy: 0.008,
      restRollRad: 0.014,
      rebound: 0.28,
    });

    // 4. 3-DOF Handheld Briefcase / Shopper Tote Socket Pendulum
    this.handBagSpring = new SpringBoneConstraint({
      name: 'handSocketBag',
      stiffness: 24.0,
      damping: 4.1,
      linearStiffness: 42.0,
      linearDamping: 5.8,
      minRx: -0.38,
      maxRx: 0.38,
      minRy: -0.22,
      maxRy: 0.22,
      minRz: 0.018,
      maxRz: 0.28,
      minDy: -0.007,
      maxDy: 0.006,
      restRollRad: 0.068,
      rebound: 0.24,
    });
    this.handBagSpring.windSensitivity = 0.65;

    // Backwards-compatible aliases
    this.neckSpring = this.neckUpperSpring;
    this.hemSpring = this.hemUpperSpring;

    // Radial billow smooth state
    this.billowX = 0;
    this.billowZ = 0;

    // Per-slot fabric wind sensitivity multipliers
    this.windScales = {
      neck: 1.22,
      hem: 1.05,
      top: 0.90,
      crossbody: 0.72,
    };
  }

  setGarmentWindScales({ neck, hem, top, crossbody, handBag } = {}) {
    if (neck !== undefined) this.windScales.neck = neck;
    if (hem !== undefined) this.windScales.hem = hem;
    if (top !== undefined) this.windScales.top = top;
    if (crossbody !== undefined) this.windScales.crossbody = crossbody;
    if (handBag !== undefined) this.handBagSpring.windSensitivity = handBag;
  }

  update({
    dt,
    timeSec,
    walkWeight = 0,
    windWeight = 0,
    windSpeedKmh = 11,
    yawVel = 0,
    handAccelX = 0,
    handAccelZ = 0,
  }) {
    const clampedDt = Math.min(0.033, Math.max(0.004, dt));

    // Multi-octave atmospheric wind & Karman fabric flutter synthesis
    const effWindKmh = Math.max(Number(windSpeedKmh) || 10, windWeight * 34);
    const windNorm = Math.min(1.28, Math.max(0.12, (effWindKmh - 4) / 25));
    const swell = 0.52 + 0.48 * Math.sin(timeSec * 1.18) * Math.sin(timeSec * 0.49 + 0.7);
    const gustBurst = Math.max(
      0,
      Math.sin(timeSec * 2.38 + 0.35) * 0.65 + Math.sin(timeSec * 3.72 - 0.5) * 0.35
    );
    const flutterA = Math.sin(timeSec * 6.9);
    const flutterB = Math.sin(timeSec * 10.6 + 1.15);
    const flutterWave = flutterA * 0.64 + flutterB * 0.36;

    const gustEnv = windNorm * (0.46 + 0.50 * swell + 0.48 * gustBurst);

    // Gait harmonics (`wPhase = timeSec * 3.8` matches skeletal walk cycle)
    const wPhase = timeSec * 3.8;
    const stride = Math.sin(wPhase);
    const stepDouble = Math.cos(wPhase * 2.0); // 2 footstrikes per full stride cycle
    const walkSway = walkWeight * Math.cos(wPhase) * 1.12;
    const walkLift = walkWeight * Math.abs(stride) * 0.68;
    const spinZ = Math.max(-2.6, Math.min(2.6, yawVel)) * 0.68;

    // 1. 2-Link Muffler & Silk Tie Flutter (`neckUpper` -> `neckTip`)
    const nSens = this.windScales.neck;
    const neckUpper = this.neckUpperSpring.step(
      clampedDt,
      -(walkLift * 0.085 + gustEnv * nSens * 0.21 + Math.abs(spinZ) * 0.035),
      spinZ * 0.105 + walkSway * 0.062 + gustEnv * nSens * (0.155 + 0.065 * Math.sin(timeSec * 2.85)),
      gustEnv * nSens * 0.105 * Math.sin(timeSec * 3.15 + 0.4) + spinZ * 0.045,
      0
    );

    const neckTip = this.neckTipSpring.step(
      clampedDt,
      -(
        walkLift * 0.105 +
        gustEnv * nSens * (0.195 + 0.115 * Math.max(0, flutterA))
      ) - this.neckUpperSpring.vrx * 0.028,
      spinZ * 0.095 +
        walkSway * 0.078 +
        gustEnv * nSens * (0.115 + 0.165 * flutterWave) -
        this.neckUpperSpring.vrz * 0.034,
      gustEnv * nSens * 0.185 * flutterA - this.neckUpperSpring.vry * 0.025,
      0
    );

    // 2. 2-Link Coat / Skirt / Dress Hem + Radial Billow + Upper Lapel
    const hSens = this.windScales.hem;
    const hemUpper = this.hemUpperSpring.step(
      clampedDt,
      walkWeight * stride * 0.055 - gustEnv * hSens * 0.062,
      spinZ * 0.092 + walkSway * 0.056 + gustEnv * hSens * (0.082 + 0.036 * Math.sin(timeSec * 2.4)),
      spinZ * 0.052 + gustEnv * hSens * 0.042 * Math.sin(timeSec * 2.8),
      0
    );

    const hemLower = this.hemLowerSpring.step(
      clampedDt,
      walkWeight * stride * 0.075 -
        gustEnv * hSens * (0.088 + 0.055 * flutterA) -
        this.hemUpperSpring.vrx * 0.026,
      spinZ * 0.118 +
        walkSway * 0.076 +
        gustEnv * hSens * (0.108 + 0.086 * flutterWave) -
        this.hemUpperSpring.vrz * 0.030,
      spinZ * 0.078 + gustEnv * hSens * 0.092 * flutterB,
      0
    );

    const targetBillow = Math.min(
      0.115,
      Math.max(
        0,
        gustEnv * hSens * (0.054 + 0.032 * Math.abs(flutterA)) +
          Math.min(0.052, Math.abs(yawVel) * 0.022) +
          walkWeight * (0.022 + 0.012 * Math.abs(stride))
      )
    );
    const billowLerp = Math.min(1, clampedDt * 7.5);
    this.billowX += (targetBillow * 1.15 - this.billowX) * billowLerp;
    this.billowZ += (targetBillow * 0.95 - this.billowZ) * billowLerp;

    const tSens = this.windScales.top;
    const lapel = this.lapelSpring.step(
      clampedDt,
      -(walkLift * 0.042 + gustEnv * tSens * (0.115 + 0.062 * Math.max(0, flutterB))),
      spinZ * 0.052 + walkSway * 0.035 + gustEnv * tSens * (0.068 + 0.052 * flutterWave),
      gustEnv * tSens * 0.085 * flutterA,
      0
    );

    // 3. Coupled Crossbody Leather Strap Flex & D-Ring Saddle Bag Bounce
    const cSens = this.windScales.crossbody;
    const footBounceDy = walkWeight * (-stepDouble * 0.0068) + gustEnv * cSens * 0.0016 * flutterA;
    const hipOutwardImpulse =
      walkWeight * (0.045 + Math.max(0, -stepDouble) * 0.085) +
      Math.max(0, spinZ) * 0.075 +
      Math.abs(spinZ) * 0.035 +
      gustEnv * cSens * (0.075 + 0.042 * Math.max(0, flutterWave));
    const bagForeAftPitch =
      walkWeight * (-stride * 0.145) -
      gustEnv * cSens * (0.085 + 0.045 * flutterA) +
      spinZ * 0.04;
    const bagTwistYaw =
      walkWeight * (stride * 0.065) +
      gustEnv * cSens * 0.065 * Math.sin(timeSec * 3.4) +
      spinZ * 0.05;

    const bagStrap = this.bagStrapSpring.step(
      clampedDt,
      bagForeAftPitch * 0.24,
      hipOutwardImpulse * 0.26,
      bagTwistYaw * 0.18,
      footBounceDy * 0.46
    );

    const crossbodyBag = this.crossbodyBagSpring.step(
      clampedDt,
      bagForeAftPitch * 0.82 - this.bagStrapSpring.vrx * 0.02,
      hipOutwardImpulse * 0.86 - this.bagStrapSpring.vrz * 0.02,
      bagTwistYaw * 0.80,
      footBounceDy * 0.72
    );

    // 4. 3-DOF Handheld Briefcase / Shopper Tote Socket Pendulum
    const hbSens = this.handBagSpring.windSensitivity ?? 0.65;
    const handBag = this.handBagSpring.step(
      clampedDt,
      -handAccelZ * 0.038 +
        walkWeight * (stride * 0.095) -
        gustEnv * hbSens * (0.095 + 0.048 * flutterA) +
        Math.sin(timeSec * 1.9) * 0.018,
      -handAccelX * 0.025 +
        Math.abs(yawVel) * 0.065 +
        walkWeight * (Math.abs(stride) * 0.042) +
        gustEnv * hbSens * (0.085 + 0.042 * Math.max(0, flutterWave)),
      walkWeight * (-stride * 0.068) +
        gustEnv * hbSens * 0.088 * Math.sin(timeSec * 3.1 + 0.6) +
        spinZ * 0.05,
      walkWeight * (-stepDouble * 0.0042)
    );

    return {
      windIntensity: gustEnv,
      windNorm,
      neck: neckUpper,
      neckUpper,
      neckTip,
      hem: hemUpper,
      hemUpper,
      hemLower,
      billowX: this.billowX,
      billowZ: this.billowZ,
      lapel,
      bagStrap,
      crossbodyBag,
      bag: handBag,
      handBag,
    };
  }
}
