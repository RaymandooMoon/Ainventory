/**
 * Carbon Apple HIG & 2.5D Inventory Architecture Contract
 * Defines immutable Apple HIG tokens, 4-tab inventory-first IA,
 * 6-pill wardrobe taxonomy, DOM anchors, and core domain DTO interfaces.
 */

export const CARBON_HIG_TOKENS = {
  light: {
    bgCanvas: '#FFFFFF',
    bgSurface: '#F5F5F7',
    bgElevated: '#FFFFFF',
    inkPrimary: '#1D1D1F',
    inkSecondary: '#6E6E73',
    accentMono: '#1D1D1F',
    vibrancyHairline: 'rgba(29, 29, 31, 0.08)',
  },
  dark: {
    bgCanvas: '#000000',
    bgSurface: '#1C1C1E',
    bgElevated: '#2C2C2E',
    inkPrimary: '#F5F5F7',
    inkSecondary: '#AEAEB2',
    accentMono: '#F5F5F7',
    vibrancyHairline: 'rgba(245, 245, 247, 0.12)',
  },
  gridUnitPt: 8,
  touchTargetMinPx: 44,
  squircleRadiusPx: 22,
  spacingScalePx: [4, 8, 16, 24, 32, 40, 48] as const,
  fontStack:
    "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Pretendard Variable', 'Pretendard', system-ui, sans-serif",
  numericVariant: 'tabular-nums' as const,
  springEasing: 'cubic-bezier(0.32, 0.72, 0, 1)' as const,
  vibrancyBackdropFilter: 'blur(22px) saturate(180%)' as const,
  minVisualRatio: 0.85,
} as const;

export type AppTabKey = 'closet' | 'outfits' | 'calendar' | 'stats';

export type WardrobeCategoryKey = 'top' | 'bottom' | 'outer' | 'shoes' | 'accessory';
export type WardrobePillKey = 'all' | WardrobeCategoryKey;

export interface WardrobePillOption {
  key: WardrobePillKey;
  label: 'All' | 'Tops' | 'Bottoms' | 'Outerwear' | 'Shoes' | 'Accessories';
}

export const WARDROBE_PILL_FILTERS: readonly WardrobePillOption[] = [
  { key: 'all', label: 'All' },
  { key: 'top', label: 'Tops' },
  { key: 'bottom', label: 'Bottoms' },
  { key: 'outer', label: 'Outerwear' },
  { key: 'shoes', label: 'Shoes' },
  { key: 'accessory', label: 'Accessories' },
] as const;

export const WARDROBE_CATEGORY_OPTIONS: ReadonlyArray<{
  key: WardrobeCategoryKey;
  label: 'Tops' | 'Bottoms' | 'Outerwear' | 'Shoes' | 'Accessories';
  defaultSubcategory: string;
}> = [
  { key: 'top', label: 'Tops', defaultSubcategory: 'knit' },
  { key: 'bottom', label: 'Bottoms', defaultSubcategory: 'slacks' },
  { key: 'outer', label: 'Outerwear', defaultSubcategory: 'coat' },
  { key: 'shoes', label: 'Shoes', defaultSubcategory: 'sneakers' },
  { key: 'accessory', label: 'Accessories', defaultSubcategory: 'bag' },
] as const;

export function normalizeWardrobeCategoryKey(rawCategory?: string | null): WardrobeCategoryKey {
  const key = String(rawCategory || '')
    .trim()
    .toLowerCase();
  if (key === 'top' || key === 'tops' || key === 'onepiece' || key === 'dress') {
    return 'top';
  }
  if (key === 'bottom' || key === 'bottoms') {
    return 'bottom';
  }
  if (key === 'outer' || key === 'outerwear') {
    return 'outer';
  }
  if (key === 'shoes' || key === 'footwear') {
    return 'shoes';
  }
  return 'accessory';
}

export function getWardrobeCategoryLabel(
  rawCategory?: string | null
): 'Tops' | 'Bottoms' | 'Outerwear' | 'Shoes' | 'Accessories' {
  const normalized = normalizeWardrobeCategoryKey(rawCategory);
  const found = WARDROBE_CATEGORY_OPTIONS.find((opt) => opt.key === normalized);
  return found ? found.label : 'Tops';
}

export const CARBON_DOM_CONTRACT = {
  sampleDemoButtonId: 'enter-sample-demo-btn',
  sampleDemoAriaLabel: '샘플 옷장 체험 모드 시작',
  loginMotionStageId: 'login-wardrobe-motion-stage',
  loginThemeToggleId: 'login-theme-toggle-btn',
  loginLangToggleId: 'login-lang-toggle-btn',
  appleSignInBtnId: 'apple-sign-in-btn',
  authTabOtpId: 'auth-tab-otp',
  authTabLoginId: 'auth-tab-login',
  authTabRegisterId: 'auth-tab-register',
  emailAuthInputId: 'email-auth-input',
  requestEmailCodeBtnId: 'request-email-code-btn',
  emailOtpCodeInputId: 'email-otp-code-input',
  verifyEmailCodeBtnId: 'verify-email-code-btn',
  floatingTabBarId: 'floating-glass-tabbar',
  wardrobeHeaderTitleId: 'wardrobe-header-title',
  wardrobeItemCountId: 'wardrobe-item-count',
  wardrobeOpenAddBtnId: 'open-add-garment-btn',
  wardrobeCategoryRailId: 'wardrobe-category-pill-rail',
  wardrobeGridId: 'wardrobe-squircle-grid',
  cutoutTileClass: 'hig-squircle-card',
  wardrobeGalleryInputId: 'wardrobe-gallery-file-input',
  wardrobeCameraInputId: 'wardrobe-camera-file-input',
  wardrobeSubmitAddBtnId: 'submit-add-garment-btn',
  addGarmentPreviewId: 'add-garment-25d-preview',
  garmentDetailSheetId: 'garment-detail-sheet',
  itemDetailTiltStageId: 'item-detail-25d-stage',
  itemDetailSaveBtnId: 'item-detail-save-btn',
  itemDetailDeleteBtnId: 'item-detail-delete-btn',
  itemDetailTryOutfitBtnId: 'item-detail-try-outfit-btn',
  studio25dCanvasId: 'studio-25d-canvas',
  studioSlotPickerId: 'studio-slot-picker',
  studioSaveOutfitBtnId: 'studio-save-outfit-btn',
  character25dMannequinId: 'character-25d-mannequin',
  weatherRecommendPanelId: 'weather-recommend-panel',
  openSkinToneModalBtnId: 'open-skin-tone-modal-btn',
  skinToneApplyBtnId: 'skin-tone-apply-btn',
  openAccountSettingsBtnId: 'open-account-settings-btn',
  initiateDeleteAccountBtnId: 'initiate-delete-account-btn',
  confirmPermanentDeleteBtnId: 'delete-account-permanent-btn',
  attrVibrancyFallback: 'data-vibrancy-fallback',
  attrSheetPanel: 'data-sheet-panel',
  attrSheetHandle: 'data-sheet-handle',
} as const;

export type WearSlotKey =
  | 'headwear'
  | 'neckwear'
  | 'outer'
  | 'top'
  | 'bottom'
  | 'dress'
  | 'gloves'
  | 'underwear'
  | 'socks'
  | 'shoes'
  | 'accessory';

export type PersonalColorMacroKey =
  | 'spring_warm'
  | 'summer_cool'
  | 'autumn_warm'
  | 'winter_cool';

export type PersonalColorKey =
  | PersonalColorMacroKey
  | 'spring_light'
  | 'spring_bright'
  | 'spring_true'
  | 'summer_light'
  | 'summer_true'
  | 'summer_mute'
  | 'autumn_mute'
  | 'autumn_true'
  | 'autumn_deep'
  | 'winter_bright'
  | 'winter_true'
  | 'winter_dark';

export type BodyShapeKey =
  | 'slim_lean'
  | 'skinny_fat'
  | 'standard_balanced'
  | 'upper_developed'
  | 'lower_developed'
  | 'athletic_muscular'
  | 'plus_curvy';

export interface UserProfile {
  id: number;
  username: string;
  email?: string | null;
  displayName: string;
  role: 'admin' | 'member';
  defaultCloset: string;
  closetName?: string | null;
  isSampleDemo?: boolean;
  profileCompleted?: boolean;
  emailVerified?: boolean;
  ageGroup?: string | null;
  age?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  gender?: string | null;
  personalColor?: string | null;
  personalColorLabelKo?: string | null;
  personalColorLabelEn?: string | null;
  skinToneHex?: string | null;
  bodyShape?: string | null;
  bodyShapeLabelKo?: string | null;
  bodyShapeLabelEn?: string | null;
  bodyShapeShortKo?: string | null;
  bodyFatPct?: number | null;
  chestCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  headCm?: number | null;
}

export interface GarmentRecord {
  id: number;
  closet_owner: string;
  name: string;
  name_en?: string;
  category: string;
  subcategory: string;
  fabric?: string;
  material_key?: string | null;
  color_name: string;
  color_hex: string;
  seasons: string[];
  min_temp: number;
  max_temp: number;
  water_resistant: boolean | number;
  formality: string;
  brand: string;
  size?: string;
  memo?: string;
  price: number;
  wear_count: number;
  cpw?: number;
  last_worn_date?: string | null;
  status: string;
  is_favorite: boolean | number;
  image_url: string;
  notes?: string;
  slot_key?: string;
  base_glb?: string;
  physics_preset?: string;
  custom_texture?: boolean | number;
  offlinePending?: boolean;
}

export interface PackingListItem {
  key: string;
  garment_id?: number | null;
  name: string;
  label?: string;
  category: string;
  image_url?: string | null;
  qty: number;
  checked: boolean;
}

export interface PackingListRecord {
  id: number;
  closet_owner: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  climate: string;
  items: PackingListItem[];
  offlinePending?: boolean;
}

export interface WeatherSnapshot {
  city?: string;
  cityName?: string;
  scenario?: string;
  condition?: string;
  summary?: string;
  tempC?: number;
  avgTemp: number;
  tempMin: number;
  tempMax: number;
  feelsLike?: number;
  precipProb?: number;
  rainMm?: number;
  isRaining?: boolean;
  windSpeed: number;
  humidity?: number;
}
