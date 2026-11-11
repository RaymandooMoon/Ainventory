export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface CieLabColor {
  L: number;
  a: number;
  b: number;
}

export interface PaletteColorEntry {
  name: string;
  hex: string;
  lab?: CieLabColor;
}

export const COLOR_PALETTE: ReadonlyArray<{ name: string; hex: string }>;
export function hexToRgb(hex?: string): RgbColor;
export function rgbToHex(r: number, g: number, b: number): string;
export function rgbToCieLab(r: number, g: number, b: number): CieLabColor;
export function deltaE76(lab1: CieLabColor, lab2: CieLabColor): number;
export function colorSimilarityScore(hexA: string, hexB: string): number;
export function matchClosestPaletteColor(
  hexOrRgb: string | RgbColor,
  palette?: ReadonlyArray<PaletteColorEntry>
): { name: string; hex: string };
