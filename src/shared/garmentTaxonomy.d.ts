import type { PersonalColorMacroKey, WearSlotKey } from '../contracts/carbonDesignContract.ts';

export {
  ACCESSORY_JEWELRY_BY_SUBCATEGORY,
  ACCESSORY_JEWELRY_CATALOG,
  ACCESSORY_JEWELRY_NATIVE_HEX_MAP,
  type AccessoryJewelryCatalogItem,
} from './accessoryJewelryCatalog.js';
export {
  LAYERED_10_BY_IMAGE_URL,
  LAYERED_10_CATALOG,
  LAYERED_10_NATIVE_HEX_MAP,
  type Layered10CatalogItem,
} from './layered10Catalog.js';
export {
  SEASONAL_120_BY_IMAGE_URL,
  SEASONAL_120_BY_SEASON,
  SEASONAL_120_CATALOG,
  SEASONAL_120_NATIVE_HEX_MAP,
  type Seasonal120CatalogItem,
} from './seasonal120Catalog.js';

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

export type BagCarryStyle =
  | 'hand_only'
  | 'shoulder'
  | 'crossbody'
  | 'backpack'
  | 'convertible_hand_strap';

export interface BagCarryStyleMeta {
  value: BagCarryStyle;
  hasStrap: boolean;
  labelKo: string;
  shortKo: string;
  labelEn: string;
}

export interface BagCarrySpec {
  has_strap: boolean;
  bag_carry_style: BagCarryStyle;
}

export const BAG_SUBCATEGORY_SET: ReadonlySet<string>;
export const BAG_CARRY_STYLES: Readonly<Record<BagCarryStyle, BagCarryStyleMeta>>;

export function isBagGarmentItem(
  item?: { category?: string | null; subcategory?: string | null } | null
): boolean;

export function inferBagCarrySpec(
  item?: {
    category?: string | null;
    subcategory?: string | null;
    name?: string | null;
    has_strap?: boolean | number | string | null;
    bag_carry_style?: string | null;
  } | null
): BagCarrySpec;

