import type {
  Carbon3DTelemetry,
  GarmentRecord,
  Mannequin3DEngineHandle,
  WearSlotKey,
  WeatherSnapshot,
} from '../contracts/carbonDesignContract.ts';

export interface SlotCameraTarget {
  x?: number;
  y: number;
  dist: number;
  fov?: number;
}

export interface FabricMaterialSpec {
  type: string;
  labelKo: string;
  roughness: number;
  metalness: number;
  sheen: number;
  clearcoat: number;
  bumpScale: number;
}

export const SLOT_CAMERA_TARGETS: Readonly<Record<string, SlotCameraTarget>>;
export const MOTION_PRESETS: ReadonlyArray<{ key: string; labelKo: string; labelEn: string }>;

export function resolveSkinHex(profile?: Record<string, unknown> | null): string;
export function inferFabricMaterialSpec(
  item?: Partial<GarmentRecord> | Record<string, unknown> | null
): FabricMaterialSpec;
export function computeMorphTargetWeights(profile?: Record<string, unknown> | null): {
  anat: Record<string, unknown>;
  weights: Record<string, number>;
};
export function resolveGarmentIdForItem(
  slotKey: WearSlotKey | string,
  item?: Partial<GarmentRecord> | Record<string, unknown> | null
): string | null;

export interface Mannequin3DEngineOptions {
  previewOnly?: boolean;
  paused?: boolean;
  exposeDebugGlobal?: boolean;
  onContextStatusChange?: (status: {
    lost?: boolean;
    recovered?: boolean;
    status?: string;
    recoveryCount?: number;
  }) => void;
}

export class Mannequin3DWebGLEngine implements Mannequin3DEngineHandle {
  targetYawDeg: number;
  _fpsSamples: number[];
  _frameMsSamples: number[];
  lastRawNowMs: number;
  constructor(canvas: HTMLCanvasElement, options?: Mannequin3DEngineOptions);
  markDirty(): void;
  simulateContextLoss(opts?: { autoRestoreMs?: number }): boolean;
  resetFpsWindow(): void;
  setPaused(paused?: boolean): void;
  setSimulatedLowFps(degraded?: boolean): boolean;
  setDarkTheme(isDark: boolean): void;
  triggerEquipScanPulse(): void;
  setRotationDeg(deg: number): void;
  setYaw(deg: number, immediate?: boolean): void;
  setMotionMode(mode?: string): void;
  setWeatherInfo(weather?: Partial<WeatherSnapshot> | Record<string, unknown> | null): void;
  setWeatherState(weather?: Partial<WeatherSnapshot> | Record<string, unknown> | null): void;
  setParallax(nx: number, ny: number): void;
  setFocusSlot(slotKey?: string | null): void;
  setFocusedSlot(slotKey?: string | null): void;
  resize(width: number, height: number): void;
  getTelemetry(): Carbon3DTelemetry;
  updateScene(state?: {
    profile?: Record<string, unknown>;
    loadout?: Record<string, Partial<GarmentRecord> | null>;
    loadoutBySlot?: Record<string, Partial<GarmentRecord> | null>;
    headMode?: string;
    selectedSlot?: string | null;
    hoveredSlot?: string | null;
    motionMode?: string;
    weather?: Partial<WeatherSnapshot> | Record<string, unknown> | null;
  }): void;
  hitTestClientPoint(clientX: number, clientY: number): WearSlotKey | null;
  dispose(): void;
}

export function disposeSharedPreviewEngine(): void;
export function render3DMannequinScene(
  canvas: HTMLCanvasElement | null,
  options?: {
    profile?: Record<string, unknown>;
    rotationDeg?: number;
    compact?: boolean;
    darkHud?: boolean;
  }
): { anatomical: Record<string, unknown>; hitTest: () => null } | null;
