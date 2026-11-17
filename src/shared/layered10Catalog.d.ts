export interface Layered10CatalogItem {
  key: string;
  idOffset: number;
  name: string;
  name_en: string;
  category: 'top' | 'outer';
  subcategory: string;
  slot_key: 'top' | 'top_mid' | 'outer_mid' | 'outer';
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

export const LAYERED_10_CATALOG: ReadonlyArray<Layered10CatalogItem>;
export const LAYERED_10_NATIVE_HEX_MAP: Readonly<Record<string, string>>;
export const LAYERED_10_BY_IMAGE_URL: Readonly<Record<string, Layered10CatalogItem>>;
