import type { WearSlotKey } from '../contracts/carbonDesignContract.ts';

export interface FabricOption {
  value: string;
  labelKo: string;
  labelEn: string;
}

export interface GarmentAIMetadata {
  sampled_hex: string;
  color_name: string;
  color_hex: string;
  category: string;
  subcategory: string;
  slot_key: WearSlotKey | string;
  base_glb: string;
  physics_preset: string;
  fabric: string;
  seasons: string[];
  min_temp: number;
  max_temp: number;
  water_resistant: boolean;
  formality: string;
  suggested_name: string;
}

export interface CutoutEncodeResult {
  webpDataUrl: string;
  format: string;
  cutoutApplied: boolean;
  width: number;
  height: number;
  aiMetadata?: GarmentAIMetadata;
}

export const FABRIC_OPTIONS: ReadonlyArray<FabricOption>;
export const MANIFEST_SLOT_MAP: Readonly<
  Record<string, { slot: WearSlotKey | string; glb: string; physics: string }>
>;

export function removeBackgroundAndEncodeWebP(
  imageSource: string | HTMLImageElement | HTMLCanvasElement,
  options?: {
    maxDim?: number;
    quality?: number;
    withMetadata?: boolean;
    hints?: Record<string, unknown>;
  }
): Promise<CutoutEncodeResult>;

export function extractGarmentAIMetadata(
  imageSource: string | HTMLImageElement | HTMLCanvasElement,
  hints?: Record<string, unknown>
): Promise<GarmentAIMetadata>;
