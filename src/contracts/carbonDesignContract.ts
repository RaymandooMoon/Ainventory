/**
 * Carbon Architecture Freeze Contract (Reqs 1–16 + Full Renewal)
 * Shared immutable Apple HIG design tokens, progressive-disclosure DOM anchors,
 * 3D WebGL telemetry/engine contracts, and core domain DTO interfaces frozen prior to
 * parallel Git Worktree execution across Track A (Core/Security), Track B (3D/Vision), and Track C (HIG UI/QA).
 */

export const CARBON_HIG_TOKENS = {
  light: {
    bgCanvas: '#FFFFFF',
    bgSurface: '#F5F5F7',
    bgElevated: '#FFFFFF',
    inkPrimary: '#1D1D1F',
    inkSecondary: '#6E6E73',
    accentMono: '#1D1D1F',
    vibrancyHairline: 'rgba(29, 29, 31, 0.12)',
  },
  dark: {
    bgCanvas: '#000000',
    bgSurface: '#1C1C1E',
    bgElevated: '#2C2C2E',
    inkPrimary: '#F5F5F7',
    inkSecondary: '#AEAEB2',
    accentMono: '#F5F5F7',
    vibrancyHairline: 'rgba(245, 245, 247, 0.14)',
  },
  gridUnitPt: 8,
  touchTargetMinPx: 44,
  spacingScalePx: [4, 8, 16, 24, 32, 40, 48] as const,
  fontStack:
    "-apple-system, BlinkMacSystemFont, 'Pretendard Variable', 'Pretendard', system-ui, sans-serif",
  typographyTiers: ['large-title', 'headline', 'body', 'caption'] as const,
  numericVariant: 'tabular-nums' as const,
  springEasing: 'cubic-bezier(0.32, 0.72, 0, 1)' as const,
  vibrancyBackdropFilter: 'blur(20px) saturate(180%)' as const,
  maxConcurrent3DBlurLayers: 1,
  minStudioViewportRatio: 0.85,
  minSteadyFps: 50,
} as const;

export const CARBON_DOM_CONTRACT = {
  sampleDemoButtonId: 'enter-sample-demo-btn',
  sampleDemoAriaLabel: '샘플 옷장 체험 모드 시작',
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
  studioScreenClass: 'hig-studio-screen',
  studioCanvasId: 'studio-3d-canvas',
  studioWeatherCapsuleId: 'studio-weather-capsule',
  studioWardrobeDrawerId: 'studio-wardrobe-drawer',
  studioDrawerHandleId: 'studio-drawer-handle',
  studioEmptyClosetCardId: 'studio-empty-closet-card',
  drawerUnequipSlotBtnId: 'drawer-unequip-slot-btn',
  cutoutTileClass: 'hig-cutout-tile',
  garmentDetailSheetId: 'garment-detail-sheet',
  garmentQuickMenuSheetId: 'garment-quick-menu-sheet',
  wardrobeOpenAddBtnId: 'open-add-garment-btn',
  wardrobeGalleryInputId: 'wardrobe-gallery-file-input',
  wardrobeCameraInputId: 'wardrobe-camera-file-input',
  wardrobeSubmitAddBtnId: 'submit-add-garment-btn',
  confirmSmartCropBtnId: 'confirm-smart-crop-btn',
  croppedWebpPreviewImgId: 'cropped-webp-preview-img',
  aiGarmentMappingSummaryId: 'ai-garment-mapping-summary',
  bentoCardClass: 'hig-bento-card',
  bentoCpwCardId: 'bento-cpw-card',
  bentoUtilizationCardId: 'bento-utilization-card',
  bentoPackingCardId: 'bento-packing-card',
  packingTitleInputId: 'packing-title-input',
  packingDestInputId: 'packing-dest-input',
  createPackingListBtnId: 'create-packing-list-btn',
  openAccountSettingsBtnId: 'open-account-settings-btn',
  mobileOpenAccountSettingsBtnId: 'mobile-open-account-settings-btn',
  initiateDeleteAccountBtnId: 'initiate-delete-account-btn',
  confirmPermanentDeleteBtnId: 'delete-account-permanent-btn',
  attrData3DActive: 'data-3d-active',
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

export type SkinPinId = 'forehead' | 'leftCheek' | 'rightCheek' | 'noseChin';

export interface SkinSamplingPin {
  id: SkinPinId;
  labelKo: string;
  labelEn: string;
  x: number;
  y: number;
  landmarkIdx?: number;
}

export interface FaceLandmarkDetectionResult {
  detected: boolean;
  isLowConfidence: boolean;
  confidence: number;
  engine: string;
  detectionStage: string;
  landmarkCount: number;
  orientationDeg: number;
  faceBox: { x: number; y: number; w: number; h: number };
  pins: SkinSamplingPin[];
  meshPoints: Array<{ x: number; y: number; landmarkIdx?: number }>;
  processedDataUrl?: string;
}

export interface CarbonSpringAxisSample {
  rx: number;
  ry?: number;
  rz: number;
  dy?: number;
}

export interface CarbonJiggleTelemetry {
  windIntensity: number;
  neckUpper: CarbonSpringAxisSample;
  neckTip: CarbonSpringAxisSample;
  hemUpper: CarbonSpringAxisSample;
  hemLower: CarbonSpringAxisSample;
  billowX: number;
  billowZ: number;
  lapel: CarbonSpringAxisSample;
  bagStrap: CarbonSpringAxisSample;
  crossbodyBag: CarbonSpringAxisSample;
  handBag: CarbonSpringAxisSample;
}

export interface Carbon3DTelemetry {
  frameCount: number;
  avgFps: number;
  geometries: number;
  textures: number;
  calls: number;
  isContextLost: boolean;
  recoveryCount: number;
  currentYawDeg: number;
  targetYawDeg: number;
  effectiveMotion: string;
  windSpeedKmh: number;
  activeGarmentIds: Array<string | number>;
  equippedDbGarmentIds?: number[];
  isSoftwareRenderer: boolean;
  vibrancyDegraded: boolean;
  jiggle: CarbonJiggleTelemetry | null;
}

export interface Mannequin3DEngineHandle {
  getTelemetry: () => Carbon3DTelemetry;
  markDirty: () => void;
  setSimulatedLowFps: (degraded?: boolean) => boolean;
  simulateContextLoss: (opts?: { autoRestoreMs?: number }) => boolean;
  resetFpsWindow: () => void;
  dispose: () => void;
  _fpsSamples?: number[];
  _frameMsSamples?: number[];
  lastRawNowMs?: number;
}

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
  category: string;
  subcategory: string;
  fabric?: string;
  color_name: string;
  color_hex: string;
  seasons: string[];
  min_temp: number;
  max_temp: number;
  water_resistant: boolean | number;
  formality: string;
  brand: string;
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
