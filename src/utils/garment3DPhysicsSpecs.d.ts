import type { WearSlotKey } from '../contracts/carbonDesignContract.ts';

export interface Garment3DRegistrationSpec {
  slotKey: WearSlotKey;
  baseGlb: string;
  physicsPreset: string;
  fabricWindSensitivity: number;
  presetDetail: Record<string, unknown>;
}

export const FABRIC_WIND_SENSITIVITY: Readonly<Record<string, number>>;
export const GARMENT_3D_PHYSICS_PRESETS: Readonly<Record<string, Record<string, unknown>>>;

export function resolveFabricWindSensitivity(
  itemOrFabric?: string | { fabric?: string; name?: string; subcategory?: string } | null
): number;
export function infer3DRegistrationSpec(
  item?: { category?: string; subcategory?: string; name?: string; fabric?: string } | null
): Garment3DRegistrationSpec;
