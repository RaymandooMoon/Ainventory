import type { PersonalColorMacroKey, WearSlotKey } from '../contracts/carbonDesignContract.ts';

export {
  ACCESSORY_JEWELRY_BY_SUBCATEGORY,
  ACCESSORY_JEWELRY_CATALOG,
  ACCESSORY_JEWELRY_NATIVE_HEX_MAP,
  type AccessoryJewelryCatalogItem,
} from './accessoryJewelryCatalog.js';

export interface WearSlotDefinition {
  key: WearSlotKey;
  code: string;
  labelKo: string;
  shortKo: string;
  labelEn: string;
  order: number;
}

export interface CategoryOption {
  key: string;
  value: string;
  label: string;
  labelEn: string;
}

export interface SubcategoryOption {
  value: string;
  label: string;
}

export interface ManifestSlotGlbSpec {
  slotKey: WearSlotKey;
  baseGlb: string;
  physicsPreset: string;
}

export const WEAR_SLOTS_11: ReadonlyArray<WearSlotDefinition>;
export const CATEGORIES: ReadonlyArray<CategoryOption>;
export const SUBCATEGORIES_BY_CAT: Readonly<Record<string, ReadonlyArray<SubcategoryOption>>>;
export const FOUR_SEASONS: ReadonlyArray<string>;
export const SEASONS: ReadonlyArray<CategoryOption>;
export const CITY_COORDS: ReadonlyArray<{ key: string; name: string; lat: number; lon: number }>;
export const STUDIO_SEED_BY_SUBCATEGORY: Readonly<Record<string, string>>;
export const STUDIO_SEED_BY_CATEGORY: Readonly<Record<string, string>>;
export const NATIVE_SEED_HEX: Readonly<Record<string, string>>;
export const PERSONAL_COLOR_CATALOG: Readonly<
  Record<string, { macro: PersonalColorMacroKey; ko: string; en: string }>
>;
export const MANIFEST_SLOT_GLB_BY_SUB: Readonly<Record<string, ManifestSlotGlbSpec>>;

export function upgradeStudioSeedToWebp(url?: string | null): string;
export function getNativeSeedHex(url?: string | null): string | null;
export function getStudioSeedImageForGarment(category?: string, subcategory?: string): string;
export function resolveStudioSeedUrl(
  itemOrUrl?: string | { image_url?: string; name?: string; category?: string; subcategory?: string } | null,
  category?: string,
  subcategory?: string
): string;
export function resolveMacroPersonalColor(key?: string | null): PersonalColorMacroKey;
export function getPersonalColorLabels(key?: string | null): {
  ko: string | null;
  en: string | null;
  macro: PersonalColorMacroKey;
};
export function resolveManifestSlotAndGlb(category?: string, subcategory?: string): ManifestSlotGlbSpec;
