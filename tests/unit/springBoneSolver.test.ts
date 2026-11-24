import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  HIGH_FASHION_SPRING_PRESETS,
  SpringBoneSolver,
  classifySpringBoneGroup,
} from '../../src/three/stages/springBoneSolver.ts';

function buildSyntheticSpringRig(): {
  root: THREE.Group;
  turntable: THREE.Group;
  head: THREE.Bone;
  hair1: THREE.Bone;
  hair2: THREE.Bone;
  jacketFL: THREE.Bone;
  bustL: THREE.Bone;
  coatF: THREE.Bone;
} {
  const root = new THREE.Group();
  const turntable = new THREE.Group();
  root.add(turntable);

  // Use Rocketbox-like 0.01 armature scale to verify scale-invariance!
  const armature = new THREE.Group();
  armature.scale.setScalar(0.01);
  turntable.add(armature);

  const head = new THREE.Bone();
  head.name = 'Bip01 Head';
  head.position.set(0, 152, 0);
  armature.add(head);

  // 2-link chained ponytail (hanging down -Y in Y-up Three.js space)
  const hair1 = new THREE.Bone();
  hair1.name = 'Jiggle_Hair_01';
  hair1.position.set(0, 10, -14);
  head.add(hair1);

  const hair2 = new THREE.Bone();
  hair2.name = 'Jiggle_Hair_02';
  hair2.position.set(0, -10, -2);
  hair1.add(hair2);

  const hairTip = new THREE.Bone();
  hairTip.name = 'Jiggle_Hair_02_Tip';
  hairTip.position.set(0, -10, -1);
  hair2.add(hairTip);

  // Blazer jacket hem bone
  const jacketFL = new THREE.Bone();
  jacketFL.name = 'Jiggle_JacketHem_FL';
  jacketFL.position.set(8, 102, 10);
  armature.add(jacketFL);

  const jacketFLTip = new THREE.Bone();
  jacketFLTip.name = 'Jiggle_JacketHem_FL_Tip';
  jacketFLTip.position.set(1, -11, 2);
  jacketFL.add(jacketFLTip);

  // Soft-body bust bone
  const bustL = new THREE.Bone();
  bustL.name = 'Jiggle_Bust_L';
  bustL.position.set(7, 128, 3);
  armature.add(bustL);

  const bustLTip = new THREE.Bone();
  bustLTip.name = 'Jiggle_Bust_L_Tip';
  bustLTip.position.set(0.5, -1, 8.5);
  bustL.add(bustLTip);

  // Couture coat hem bone (unit scale child)
  const coatF = new THREE.Bone();
  coatF.name = 'Jiggle_CoatHem_F';
  coatF.position.set(0, 1.08, 0.16);
  turntable.add(coatF);

  const coatFTip = new THREE.Bone();
  coatFTip.name = 'Jiggle_CoatHem_F_Tip';
  coatFTip.position.set(0, -0.48, 0.06);
  coatF.add(coatFTip);

  root.updateMatrixWorld(true);
  return { root, turntable, head, hair1, hair2, jacketFL, bustL, coatF };
}

describe('SpringBoneSolver', () => {
  it('classifies Jiggle_* joint names accurately and ignores _Tip leaves & non-jiggle bones', () => {
    assert.equal(classifySpringBoneGroup('Jiggle_Hair_01'), 'hair');
    assert.equal(classifySpringBoneGroup('Jiggle_Hair_03_Tip'), null);
    assert.equal(classifySpringBoneGroup('Jiggle_JacketHem_FL'), 'jacketHem');
    assert.equal(classifySpringBoneGroup('Jiggle_Bust_R'), 'bust');
    assert.equal(classifySpringBoneGroup('Jiggle_CoatHem_BL'), 'coatHem');
    assert.equal(classifySpringBoneGroup('Bip01 Head'), null);
    assert.equal(classifySpringBoneGroup('CoatRoot'), null);
  });

  it('discovers chained & single Jiggle_* bones across mixed scales and reacts to 360° turntable spin inertia', () => {
    const rig = buildSyntheticSpringRig();
    const solver = SpringBoneSolver.fromObject3D(rig.root);

    assert.equal(solver.boneCount, 5);
    assert.deepEqual(solver.getGroupCounts(), {
      hair: 2,
      jacketHem: 1,
      bust: 1,
      coatHem: 1,
    });

    // Prime initial rest state
    solver.update({ dt: 1 / 60 });
    const hairRestQ = rig.hair1.quaternion.clone();
    const coatRestQ = rig.coatF.quaternion.clone();

    // Rapidly rotate 360° turntable -> centrifugal/tangential inertia must deflect hair & coat hem!
    for (let i = 0; i < 12; i += 1) {
      rig.turntable.rotation.y += 0.14;
      rig.root.updateMatrixWorld(true);
      solver.update({ dt: 1 / 60 });
    }

    const hairDeflection = rig.hair1.quaternion.angleTo(hairRestQ);
    const coatDeflection = rig.coatF.quaternion.angleTo(coatRestQ);

    assert.ok(
      hairDeflection > 0.03,
      `Expected hair chain to lag behind rapid turntable spin (got ${hairDeflection.toFixed(4)} rad)`
    );
    assert.ok(
      coatDeflection > 0.02,
      `Expected coat hem to flare/trail during turntable spin (got ${coatDeflection.toFixed(4)} rad)`
    );
    assert.ok(
      hairDeflection <= HIGH_FASHION_SPRING_PRESETS.hair.maxAngleRad + 1e-3,
      `Hair deflection must respect maxAngleRad (${hairDeflection.toFixed(4)})`
    );
    assert.ok(
      coatDeflection <= HIGH_FASHION_SPRING_PRESETS.coatHem.maxAngleRad + 1e-3,
      `Coat deflection must respect maxAngleRad (${coatDeflection.toFixed(4)})`
    );

    // Hold turntable still and step 120 frames -> must damp smoothly back near gravity equilibrium
    for (let i = 0; i < 120; i += 1) {
      rig.root.updateMatrixWorld(true);
      solver.update({ dt: 1 / 60 });
    }
    const settledBefore = rig.hair1.quaternion.clone();
    solver.update({ dt: 1 / 60 });
    const residualStep = rig.hair1.quaternion.angleTo(settledBefore);
    assert.ok(
      residualStep < 0.002,
      `Expected fast high-fashion damping to settle cleanly (step delta ${residualStep.toFixed(5)} rad)`
    );
  });

  it('responds to wind on hair/jacket/coat while keeping bust wind-immune and strictly angular-clamped', () => {
    const rig = buildSyntheticSpringRig();
    const solver = SpringBoneSolver.fromObject3D(rig.root);

    // Prime
    solver.update({ dt: 1 / 60 });
    const hairRest = rig.hair1.quaternion.clone();
    const bustRest = rig.bustL.quaternion.clone();
    const extremeWind = new THREE.Vector3(60, 0, 40);

    for (let i = 0; i < 30; i += 1) {
      rig.root.updateMatrixWorld(true);
      solver.update({ dt: 1 / 60, windWorld: extremeWind });
    }

    const hairAngle = rig.hair1.quaternion.angleTo(hairRest);
    const bustAngle = rig.bustL.quaternion.angleTo(bustRest);

    assert.ok(hairAngle > 0.12, `Expected hair to sway in breeze (got ${hairAngle.toFixed(4)})`);
    assert.ok(
      hairAngle <= HIGH_FASHION_SPRING_PRESETS.hair.maxAngleRad + 1e-3,
      `Hair must hard-clamp at maxAngleRad under extreme gusts (got ${hairAngle.toFixed(4)})`
    );
    assert.ok(
      bustAngle <= HIGH_FASHION_SPRING_PRESETS.bust.maxAngleRad + 1e-3,
      `Bust must remain tightly restrained under maxAngleRad (got ${bustAngle.toFixed(4)})`
    );

    // Under extreme vertical walking bounce impulses, bust responds subtly but never exceeds maxAngleRad
    for (let i = 0; i < 20; i += 1) {
      rig.turntable.position.y = Math.sin(i * 1.1) * 0.25;
      rig.root.updateMatrixWorld(true);
      solver.update({ dt: 1 / 60 });
    }
    const bustBounceAngle = rig.bustL.quaternion.angleTo(bustRest);
    assert.ok(
      bustBounceAngle > 0.004 && bustBounceAngle <= HIGH_FASHION_SPRING_PRESETS.bust.maxAngleRad + 1e-3,
      `Expected subtle bust bounce in (0.004, ${HIGH_FASHION_SPRING_PRESETS.bust.maxAngleRad}], got ${bustBounceAngle.toFixed(4)}`
    );
  });

  it('stays numerically finite under huge dt spikes and resets cleanly under reducedMotion', () => {
    const rig = buildSyntheticSpringRig();
    const solver = SpringBoneSolver.fromObject3D(rig.root);
    const hairRest = rig.hair1.quaternion.clone();

    solver.update({ dt: 1 / 60 });
    rig.turntable.rotation.y = 1.2;
    rig.root.updateMatrixWorld(true);
    // Simulate returning from a backgrounded browser tab (dt = 10 seconds!)
    solver.update({ dt: 10.0, windWorld: new THREE.Vector3(12, 0, -8) });

    for (const bone of [rig.hair1, rig.hair2, rig.jacketFL, rig.bustL, rig.coatF]) {
      assert.ok(
        Number.isFinite(bone.quaternion.x) &&
          Number.isFinite(bone.quaternion.y) &&
          Number.isFinite(bone.quaternion.z) &&
          Number.isFinite(bone.quaternion.w),
        `Bone ${bone.name} quaternion must stay finite after dt spike`
      );
    }

    // reducedMotion must immediately snap back to rest quaternion
    solver.update({ dt: 1 / 60, reducedMotion: true });
    assert.ok(
      rig.hair1.quaternion.angleTo(hairRest) < 1e-6,
      'reducedMotion must restore exact bind/rest quaternion'
    );
  });
});
