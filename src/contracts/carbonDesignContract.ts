/**
 * Carbon Architecture Freeze Contract (Reqs 11–16)
 * Shared immutable design tokens, progressive-disclosure DOM anchors, and 3D WebGL telemetry schema
 * frozen prior to parallel worker execution across Track 1 (ui), Track 2 (qa), and Track 3 (ci).
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
  studioScreenClass: 'hig-studio-screen',
  studioCanvasId: 'studio-3d-canvas',
  studioWeatherCapsuleId: 'studio-weather-capsule',
  studioWardrobeDrawerId: 'studio-wardrobe-drawer',
  studioDrawerHandleId: 'studio-drawer-handle',
  cutoutTileClass: 'hig-cutout-tile',
  garmentDetailSheetId: 'garment-detail-sheet',
  garmentQuickMenuSheetId: 'garment-quick-menu-sheet',
  bentoCpwCardId: 'bento-cpw-card',
  bentoUtilizationCardId: 'bento-utilization-card',
  bentoPackingCardId: 'bento-packing-card',
  attrData3DActive: 'data-3d-active',
  attrVibrancyFallback: 'data-vibrancy-fallback',
} as const;

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
  isSoftwareRenderer: boolean;
  vibrancyDegraded: boolean;
  jiggle: CarbonJiggleTelemetry | null;
}
