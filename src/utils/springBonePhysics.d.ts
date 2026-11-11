export interface SpringAxisOutput {
  rx: number;
  ry: number;
  rz: number;
  dy: number;
}

export class SpringBoneConstraint {
  constructor(config?: Record<string, number>);
  configure(config?: Record<string, number>): void;
  reset(): void;
  step(dt: number, externalForce?: { x?: number; y?: number; z?: number; dy?: number }): SpringAxisOutput;
}

export class SpringBoneSystem {
  handBagSpring: SpringBoneConstraint;
  constructor();
  reset(): void;
  setGarmentWindScales(scales?: {
    neck?: number;
    hem?: number;
    top?: number;
    crossbody?: number;
  }): void;
  step(
    dt: number,
    nowSec: number,
    inputs?: Record<string, unknown>
  ): Record<string, unknown>;
}
