import type {
  FaceLandmarkDetectionResult,
  PersonalColorKey,
  PersonalColorMacroKey,
  SkinSamplingPin,
} from '../contracts/carbonDesignContract.ts';
import type { GarmentAIMetadata } from './aiGarmentPipeline.d.ts';

export function hexToRgb(hex?: string): { r: number; g: number; b: number };
export function rgbToHex(r: number, g: number, b: number): string;
export function rgbToCieLab(
  rOrObj: number | { r: number; g: number; b: number },
  g?: number,
  b?: number
): { L: number; a: number; b: number };
export function findClosestPaletteColor(hex: string): { name: string; hex: string };

export interface CroppedImageOutputResult {
  dataUrl: string;
  format: string;
  cutoutApplied: boolean;
  detectedHex: string;
  matchedColor: { name: string; hex: string };
  aiMetadata: GarmentAIMetadata | null;
  width: number;
  height: number;
}

export function renderCroppedImageOutput(
  imageSource: string | HTMLImageElement | HTMLCanvasElement,
  options?: {
    rotation90?: number;
    straightenDeg?: number;
    flipH?: boolean;
    brightness?: number;
    studioCutout?: boolean;
    cropBox?: { x: number; y: number; w: number; h: number };
    maxOutputSide?: number;
  }
): Promise<CroppedImageOutputResult>;

export const LIGHTING_MODES: ReadonlyArray<Record<string, unknown>>;
export const DIRECTIONAL_20_DRAPE_COLORS: Readonly<Record<string, ReadonlyArray<Record<string, unknown>>>>;
export const PCCS_GRAYSCALE_BAR: ReadonlyArray<Record<string, unknown>>;
export const PCCS_12_TONES: ReadonlyArray<Record<string, unknown>>;
export const PERSONAL_COLOR_SUBTYPES: Readonly<Record<string, Record<string, unknown>>>;
export const PERSONAL_COLOR_DETAILS: Readonly<Record<string, Record<string, unknown>>>;

export interface PersonalColorAnalysisResult {
  recommendedType: PersonalColorMacroKey;
  recommendedSubtype: PersonalColorKey;
  skinToneHex: string;
  confidence: number;
  lab: { L: number; a: number; b: number };
  itaAngle: number;
  pins: SkinSamplingPin[];
  detectionInfo?: FaceLandmarkDetectionResult | null;
  [key: string]: unknown;
}

export function analyzePersonalColorFromImage(
  imageSource: string | HTMLImageElement | HTMLCanvasElement,
  options?: {
    lightingMode?: string;
    customPins?: SkinSamplingPin[] | null;
    precomputedDetection?: FaceLandmarkDetectionResult | null;
    rotationDeg?: number;
    cropRect?: { x: number; y: number; w: number; h: number } | null;
  }
): Promise<PersonalColorAnalysisResult>;
