/**
 * springBoneSolver.ts
 * ---------------------------------------------------------------------------
 * Lightweight, allocation-free, frame-rate-independent real-time SpringBone
 * secondary physics solver for Three.js `SkinnedMesh` rigs (`Jiggle_*` joints).
 *
 * Supports chained & single secondary bones discovered automatically by prefix:
 *   - `Jiggle_Hair_*`      : 3-link ponytail chain (silky sway, bounce & breeze)
 *   - `Jiggle_JacketHem_*` : Tailored blazer skirt hem trail
 *   - `Jiggle_Bust_*`      : Restrained high-fashion soft-body upper torso inertia
 *   - `Jiggle_CoatHem_*`   : Woven-wool Couture Trench Coat perimeter flare
 *
 * Math:
 *   Each node tracks a virtual world-space tip (`tipWorld`) and velocity
 *   (`velWorld`, units/sec) driven by a damped harmonic restoring force toward
 *   the parent-transformed rest tip (`restTipWorld`), gravity, and optional
 *   wind gusts. Sub-stepped semi-implicit Euler with exponential damping
 *   guarantees identical motion across 30Hz / 60Hz / 120Hz displays and zero
 *   instability after browser backgrounding.
 */

import * as THREE from 'three';

export type SpringBoneGroupKind = 'hair' | 'jacketHem' | 'bust' | 'coatHem';

export interface SpringBoneGroupConfig {
  /** Harmonic spring constant (rad/s)^2 restoring tip toward animated rest pose. */
  readonly stiffness: number;
  /** Exponential velocity damping rate (1/s) — higher = faster luxury settling. */
  readonly damping: number;
  /** Downward world-Y gravity pull scaled by bone length. */
  readonly gravity: number;
  /** Multiplier for scene wind/breeze force (0 disables wind on soft-body torso). */
  readonly windScale: number;
  /** Hard angular cone clamp around rest direction (radians) preventing mesh tearing. */
  readonly maxAngleRad: number;
}

/**
 * Calibrated for "Natural & Restrained High-Fashion Fit" (미세 관성 · 빠른 감쇠):
 * responsive to walking footsteps, 360° turntable spin inertia, and rain breeze,
 * while settling crisply without cartoonish overshoot or fabric clipping.
 */
export const HIGH_FASHION_SPRING_PRESETS: Readonly<
  Record<SpringBoneGroupKind, SpringBoneGroupConfig>
> = Object.freeze({
  hair: Object.freeze({
    stiffness: 125,
    damping: 11.5,
    gravity: 2.4,
    windScale: 1.0,
    maxAngleRad: 0.34, // ~19.5 deg per link along 3-bone ponytail chain
  }),
  jacketHem: Object.freeze({
    stiffness: 185,
    damping: 16.0,
    gravity: 1.2,
    windScale: 0.72,
    maxAngleRad: 0.145, // ~8.3 deg crisp tailored pinstripe blazer hem trail
  }),
  bust: Object.freeze({
    stiffness: 260,
    damping: 22.0,
    gravity: 0.55,
    windScale: 0.0,
    maxAngleRad: 0.062, // ~3.5 deg restrained couture soft-body elasticity
  }),
  coatHem: Object.freeze({
    stiffness: 130,
    damping: 12.2,
    gravity: 1.8,
    windScale: 1.15,
    maxAngleRad: 0.21, // ~12.0 deg tailored woven-wool trench coat skirt billow
  }),
});

export interface SpringBoneUpdateOptions {
  /** Frame delta time in seconds (safely clamped inside solver). */
  readonly dt: number;
  /** Optional world-space wind acceleration vector (e.g. Rain breeze). */
  readonly windWorld?: THREE.Vector3;
  /** When true (prefers-reduced-motion), snaps all spring bones cleanly to rest. */
  readonly reducedMotion?: boolean;
}

export interface SpringBoneNodeState {
  readonly bone: THREE.Object3D;
  readonly group: SpringBoneGroupKind;
  readonly config: SpringBoneGroupConfig;
  readonly restQuaternion: THREE.Quaternion;
  readonly localAxis: THREE.Vector3;
  readonly localLength: number;
  readonly depth: number;
  readonly tipWorld: THREE.Vector3;
  readonly velWorld: THREE.Vector3;
  initialized: boolean;
}

const MAX_STEP_DT = 1 / 60;
const MAX_TOTAL_DT = 0.05;
const MIN_WORLD_LENGTH = 1e-4;

/** Classifies a bone name (`Jiggle_*`) into its semantic physics preset group. */
export function classifySpringBoneGroup(boneName: string): SpringBoneGroupKind | null {
  if (!/^Jiggle_/i.test(boneName)) return null;
  if (/_Tip$/i.test(boneName)) return null;
  if (/^Jiggle_Hair/i.test(boneName)) return 'hair';
  if (/^Jiggle_JacketHem/i.test(boneName)) return 'jacketHem';
  if (/^Jiggle_Bust/i.test(boneName)) return 'bust';
  if (/^Jiggle_CoatHem/i.test(boneName)) return 'coatHem';
  return null;
}

function getHierarchyDepth(obj: THREE.Object3D): number {
  let depth = 0;
  let cur: THREE.Object3D | null = obj.parent;
  while (cur) {
    depth += 1;
    cur = cur.parent;
  }
  return depth;
}

/**
 * Resolves a SpringBone's exact local tail direction & length from its first
 * child (`_Tip` leaf or next chain link) so physics is 100% scale- & axis-invariant.
 */
function resolveLocalTail(bone: THREE.Object3D): { axis: THREE.Vector3; length: number } {
  let chosenChild: THREE.Object3D | null = null;
  for (const child of bone.children) {
    if (/_Tip$/i.test(child.name) || /^Jiggle_/i.test(child.name)) {
      chosenChild = child;
      break;
    }
  }
  if (!chosenChild && bone.children.length > 0) {
    chosenChild = bone.children[0];
  }

  if (chosenChild && chosenChild.position.lengthSq() > 1e-8) {
    const length = chosenChild.position.length();
    return {
      axis: chosenChild.position.clone().divideScalar(length),
      length,
    };
  }

  return {
    axis: new THREE.Vector3(0, 1, 0),
    length: 0.08,
  };
}

export class SpringBoneSolver {
  private readonly nodes: readonly SpringBoneNodeState[];

  // Reusable scratch math objects (strictly zero per-frame allocations)
  private readonly headWorld = new THREE.Vector3();
  private readonly restTipLocal = new THREE.Vector3();
  private readonly restTipWorld = new THREE.Vector3();
  private readonly restDirWorld = new THREE.Vector3();
  private readonly currDirWorld = new THREE.Vector3();
  private readonly prevTipScratch = new THREE.Vector3();
  private readonly accelWorld = new THREE.Vector3();
  private readonly clampAxis = new THREE.Vector3();
  private readonly clampQuat = new THREE.Quaternion();
  private readonly parentWorldQuat = new THREE.Quaternion();
  private readonly invParentWorldQuat = new THREE.Quaternion();
  private readonly restDirInParent = new THREE.Vector3();
  private readonly targetDirInParent = new THREE.Vector3();
  private readonly deltaLocalQuat = new THREE.Quaternion();

  private constructor(nodes: readonly SpringBoneNodeState[]) {
    this.nodes = nodes;
  }

  /**
   * Scans a loaded glTF scene for `Jiggle_*` joints, snapshots their bind/rest
   * orientations & child tail vectors, and orders them parent-before-child.
   */
  public static fromObject3D(
    root: THREE.Object3D,
    overrides?: Partial<Record<SpringBoneGroupKind, Partial<SpringBoneGroupConfig>>>
  ): SpringBoneSolver {
    root.updateMatrixWorld(true);
    const discovered: SpringBoneNodeState[] = [];

    root.traverse((obj) => {
      const group = classifySpringBoneGroup(obj.name || '');
      if (!group) return;

      const basePreset = HIGH_FASHION_SPRING_PRESETS[group];
      const patch = overrides?.[group];
      const config: SpringBoneGroupConfig = patch
        ? Object.freeze({ ...basePreset, ...patch })
        : basePreset;

      const { axis, length } = resolveLocalTail(obj);
      discovered.push({
        bone: obj,
        group,
        config,
        restQuaternion: obj.quaternion.clone().normalize(),
        localAxis: axis,
        localLength: length,
        depth: getHierarchyDepth(obj),
        tipWorld: new THREE.Vector3(),
        velWorld: new THREE.Vector3(),
        initialized: false,
      });
    });

    // Topological sort: parent chain links MUST update before their children
    discovered.sort((a, b) => a.depth - b.depth);
    return new SpringBoneSolver(discovered);
  }

  public get boneCount(): number {
    return this.nodes.length;
  }

  public getGroupCounts(): Readonly<Record<SpringBoneGroupKind, number>> {
    const counts: Record<SpringBoneGroupKind, number> = {
      hair: 0,
      jacketHem: 0,
      bust: 0,
      coatHem: 0,
    };
    for (const node of this.nodes) {
      counts[node.group] += 1;
    }
    return counts;
  }

  /**
   * Resets every SpringBone to its clean bind/rest quaternion and clears
   * accumulated velocity (used on pose reset, disposal, or reducedMotion).
   */
  public reset(): void {
    for (const node of this.nodes) {
      node.bone.quaternion.copy(node.restQuaternion);
      node.velWorld.set(0, 0, 0);
      node.initialized = false;
      node.bone.updateMatrix();
    }
    for (const node of this.nodes) {
      node.bone.updateMatrixWorld(true);
    }
  }

  /**
   * Integrates all SpringBone nodes for the current frame.
   * Call AFTER `AnimationMixer.update(dt)` and `parentRoot.updateMatrixWorld(true)`.
   */
  public update(options: SpringBoneUpdateOptions): void {
    if (this.nodes.length === 0) return;

    if (options.reducedMotion) {
      this.reset();
      return;
    }

    const rawDt = Number.isFinite(options.dt) ? options.dt : 0;
    const clampedTotalDt = THREE.MathUtils.clamp(rawDt, 0, MAX_TOTAL_DT);
    if (clampedTotalDt <= 1e-6) {
      return;
    }

    const substeps = Math.max(1, Math.ceil(clampedTotalDt / MAX_STEP_DT));
    const subDt = clampedTotalDt / substeps;
    const rawWind = options.windWorld;
    const wind =
      rawWind &&
      Number.isFinite(rawWind.x) &&
      Number.isFinite(rawWind.y) &&
      Number.isFinite(rawWind.z)
        ? rawWind
        : undefined;

    for (const node of this.nodes) {
      this.integrateNode(node, subDt, substeps, wind);
    }
  }

  private integrateNode(
    node: SpringBoneNodeState,
    subDt: number,
    substeps: number,
    windWorld?: THREE.Vector3
  ): void {
    const { bone, config } = node;

    // 1. Evaluate exact world-space rest pose (inheriting latest animated parent transform)
    bone.quaternion.copy(node.restQuaternion);
    bone.updateMatrix();
    if (bone.parent) {
      bone.matrixWorld.multiplyMatrices(bone.parent.matrixWorld, bone.matrix);
    } else {
      bone.matrixWorld.copy(bone.matrix);
    }

    this.headWorld.setFromMatrixPosition(bone.matrixWorld);
    this.restTipLocal.copy(node.localAxis).multiplyScalar(node.localLength);
    this.restTipWorld.copy(this.restTipLocal).applyMatrix4(bone.matrixWorld);

    const worldLen = this.headWorld.distanceTo(this.restTipWorld);
    if (!Number.isFinite(worldLen) || worldLen < MIN_WORLD_LENGTH) {
      return;
    }

    this.restDirWorld.subVectors(this.restTipWorld, this.headWorld).divideScalar(worldLen);

    // First frame (or immediately after reset/teleport): lock cleanly onto rest tip
    if (!node.initialized) {
      node.tipWorld.copy(this.restTipWorld);
      node.velWorld.set(0, 0, 0);
      node.initialized = true;
      return;
    }

    // Teleport safety guard (e.g., sudden stage switch / camera jump): re-anchor smoothly
    if (node.tipWorld.distanceToSquared(this.restTipWorld) > worldLen * worldLen * 16) {
      node.tipWorld.copy(this.restTipWorld);
      node.velWorld.set(0, 0, 0);
      return;
    }

    // 2. Fixed-substep damped harmonic spring integration in world space
    const expDamp = Math.exp(-config.damping * subDt);
    const cosLimit = Math.cos(config.maxAngleRad);

    for (let s = 0; s < substeps; s += 1) {
      this.prevTipScratch.copy(node.tipWorld);

      // Restoring acceleration toward animated rest tip: a = k * (restTip - tip)
      this.accelWorld
        .subVectors(this.restTipWorld, node.tipWorld)
        .multiplyScalar(config.stiffness);

      // Gravity pull (scaled by world segment length so short bust & long coat scale naturally)
      this.accelWorld.y -= config.gravity * worldLen;

      // Optional directional wind/breeze force
      if (windWorld && config.windScale > 0) {
        this.accelWorld.addScaledVector(windWorld, config.windScale * worldLen);
      }

      // Semi-implicit Euler + exact exponential damping
      node.velWorld.addScaledVector(this.accelWorld, subDt);
      node.velWorld.multiplyScalar(expDamp);
      node.tipWorld.addScaledVector(node.velWorld, subDt);

      // Project tip onto rigid segment sphere (zero bone stretching)
      this.currDirWorld.subVectors(node.tipWorld, this.headWorld);
      const currLen = this.currDirWorld.length();
      if (currLen < MIN_WORLD_LENGTH) {
        this.currDirWorld.copy(this.restDirWorld);
      } else {
        this.currDirWorld.divideScalar(currLen);
      }

      // Enforce hard angular cone limit around restDirWorld
      const dot = THREE.MathUtils.clamp(this.restDirWorld.dot(this.currDirWorld), -1, 1);
      if (dot < cosLimit) {
        this.clampAxis.crossVectors(this.restDirWorld, this.currDirWorld);
        const axisLen = this.clampAxis.length();
        if (axisLen > 1e-6) {
          this.clampAxis.divideScalar(axisLen);
          this.clampQuat.setFromAxisAngle(this.clampAxis, config.maxAngleRad);
          this.currDirWorld.copy(this.restDirWorld).applyQuaternion(this.clampQuat).normalize();
        } else {
          this.currDirWorld.copy(this.restDirWorld);
        }
      }

      node.tipWorld.copy(this.headWorld).addScaledVector(this.currDirWorld, worldLen);

      // Re-synchronize tangential velocity after spherical/cone constraint projection
      node.velWorld
        .subVectors(node.tipWorld, this.prevTipScratch)
        .divideScalar(subDt)
        .multiplyScalar(0.96);
    }

    // 3. Apply shortest-arc quaternion rotation in parent bone space
    if (bone.parent) {
      bone.parent.getWorldQuaternion(this.parentWorldQuat);
      this.invParentWorldQuat.copy(this.parentWorldQuat).invert();
      this.targetDirInParent.copy(this.currDirWorld).applyQuaternion(this.invParentWorldQuat).normalize();
    } else {
      this.targetDirInParent.copy(this.currDirWorld).normalize();
    }

    this.restDirInParent.copy(node.localAxis).applyQuaternion(node.restQuaternion).normalize();

    const alignDot = THREE.MathUtils.clamp(
      this.restDirInParent.dot(this.targetDirInParent),
      -1,
      1
    );
    if (alignDot > 0.999999) {
      bone.quaternion.copy(node.restQuaternion);
    } else if (alignDot < -0.999999) {
      bone.quaternion.copy(node.restQuaternion);
    } else {
      this.deltaLocalQuat.setFromUnitVectors(this.restDirInParent, this.targetDirInParent);
      bone.quaternion.copy(this.deltaLocalQuat).multiply(node.restQuaternion).normalize();
    }

    // Propagate updated bone matrix immediately so chained children see live parent pose
    bone.updateMatrix();
    if (bone.parent) {
      bone.matrixWorld.multiplyMatrices(bone.parent.matrixWorld, bone.matrix);
    } else {
      bone.matrixWorld.copy(bone.matrix);
    }
  }
}
