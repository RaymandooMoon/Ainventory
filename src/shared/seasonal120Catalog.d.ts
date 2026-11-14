export interface Seasonal120CatalogItem {
  key: string;
  idOffset: number;
  name: string;
  name_en: string;
  category: string;
  subcategory: string;
  fabric: string;
  color_name: string;
  color_hex: string;
  primary_season: '봄' | '여름' | '가을' | '겨울';
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

export const SEASONAL_120_CATALOG: ReadonlyArray<Seasonal120CatalogItem>;
export const SEASONAL_120_NATIVE_HEX_MAP: Readonly<Record<string, string>>;
export const SEASONAL_120_BY_SEASON: Readonly<{
  봄: ReadonlyArray<Seasonal120CatalogItem>;
  여름: ReadonlyArray<Seasonal120CatalogItem>;
  가을: ReadonlyArray<Seasonal120CatalogItem>;
  겨울: ReadonlyArray<Seasonal120CatalogItem>;
}>;
export const SEASONAL_120_BY_IMAGE_URL: Readonly<Record<string, Seasonal120CatalogItem>>;
