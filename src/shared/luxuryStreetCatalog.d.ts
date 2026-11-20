export interface LuxuryStreetCatalogItem {
  key: string;
  idOffset: number;
  name: string;
  name_en: string;
  category: 'outer' | 'top' | 'bottom' | 'shoes' | 'headwear' | 'accessory';
  subcategory: string;
  slot_key: 'outer' | 'outer_mid' | 'top' | 'top_mid' | 'bottom' | 'shoes' | 'headwear' | 'accessory';
  fabric: string;
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

export const LUXURY_STREET_CATALOG: ReadonlyArray<LuxuryStreetCatalogItem>;
export const LUXURY_STREET_NATIVE_HEX_MAP: Readonly<Record<string, string>>;
export const LUXURY_STREET_BY_IMAGE_URL: Readonly<Record<string, LuxuryStreetCatalogItem>>;
