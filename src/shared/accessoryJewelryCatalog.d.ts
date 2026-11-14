export interface AccessoryJewelryCatalogItem {
  key: string;
  idOffset: number;
  name: string;
  name_en: string;
  category: 'accessory' | 'jewelry';
  subcategory: string;
  fabric: string;
  material_key: string;
  color_name: string;
  color_hex: string;
  primary_season: string;
  seasons: string[];
  min_temp: number;
  max_temp: number;
  water_resistant: boolean;
  formality: string;
  brand: string;
  price: number;
  image_url: string;
  sleeveLength: string;
  hemLength: string;
  shoeExposure: string;
  layerOrder: number;
}

export const ACCESSORY_JEWELRY_CATALOG: ReadonlyArray<AccessoryJewelryCatalogItem>;
export const ACCESSORY_JEWELRY_NATIVE_HEX_MAP: Readonly<Record<string, string>>;
export const ACCESSORY_JEWELRY_BY_SUBCATEGORY: Readonly<Record<string, ReadonlyArray<AccessoryJewelryCatalogItem>>>;
