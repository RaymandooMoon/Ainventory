import type { SiteIconKey } from '../site/SiteIcon.tsx';

export type { SiteIconKey };

export type SiteLang = 'en' | 'ko';
export type SiteTheme = 'dark' | 'light';
export type SiteMood = 'luxury' | 'aurora';
export type LegalDocKind = 'privacy' | 'terms';
export type SiteViewId = 'home' | 'studio' | 'technology' | 'benchmarks' | 'about';
export type SiteStageId = 'hero' | 'studio' | 'architecture' | 'specs' | 'about';
export type SiteActiveStageId = Exclude<SiteStageId, 'hero'>;
export type AppPreviewScreenId = 'outfits' | 'closet' | 'stats' | 'profile';
export type BlueprintScaleMode = 'dev' | 'prod';
export type StudioPoseId = 'stand' | 'walk' | 'rain';
export type WeatherMoodId = 'sunny' | 'rain' | 'wind';
export type JourneyCutStatus = 'live' | 'hybrid' | 'todo';

const PREVIEW_FILE_PREFIX: Readonly<Record<AppPreviewScreenId, string>> = {
  outfits: 'app-fitting-live',
  closet: 'app-closet',
  stats: 'app-stats',
  profile: 'app-profile',
};

export function resolveAppPreviewSrc(
  screenId: AppPreviewScreenId,
  lang: SiteLang,
  theme: SiteTheme
): string {
  return `/assets/previews/${PREVIEW_FILE_PREFIX[screenId]}-${lang}-${theme}.webp`;
}

export function viewIdToStageId(viewId: SiteViewId): SiteStageId {
  switch (viewId) {
    case 'home':
      return 'hero';
    case 'studio':
      return 'studio';
    case 'technology':
      return 'architecture';
    case 'benchmarks':
      return 'specs';
    case 'about':
      return 'about';
  }
}

export function stageIdToViewId(stageId: SiteStageId): SiteViewId {
  switch (stageId) {
    case 'hero':
      return 'home';
    case 'studio':
      return 'studio';
    case 'architecture':
      return 'technology';
    case 'specs':
      return 'benchmarks';
    case 'about':
      return 'about';
  }
}

export interface SiteMeta {
  readonly brandName: string;
  readonly logoMark: string;
  readonly productName: string;
  readonly domain: string;
  readonly contactEmail: string;
  readonly founderName: string;
  readonly location: string;
  readonly copyrightYear: string;
}

export const SITE_META: SiteMeta = {
  brandName: 'Ainvtry',
  logoMark: 'iNVTRY',
  productName: 'A inventory',
  domain: 'ainvtry.com',
  contactEmail: 'raymond@ainvtry.com',
  founderName: 'Raymond Moon',
  location: 'Seoul, South Korea',
  copyrightYear: '2026',
};

export const BRAND_LOGO_ASSETS = {
  light: '/assets/brand/invtry-logo-light.png',
  dark: '/assets/brand/invtry-logo-dark.png',
} as const;

export const STUDIO_GARMENT_ASSETS = {
  trenchWebp: '/assets/garments/beige-trench.webp',
  trenchOriginalJpg: '/assets/garments/beige-trench.jpg',
  knitWebp: '/assets/garments/cream-knit.webp',
  slacksWebp: '/assets/garments/charcoal-slacks.webp',
  loafersWebp: '/assets/garments/black-loafers.webp',
} as const;

export const SPECS_3D_PILLAR_LABELS = [
  '5-STAGE',
  '0B FACE',
  '210+ TESTS',
  '4 APIs',
  '21-BONE',
  'EXIF -96%',
] as const;

export interface SiteStagePillDescriptor {
  readonly stageId: SiteActiveStageId;
  readonly viewId: Exclude<SiteViewId, 'home'>;
  readonly icon: SiteIconKey;
  readonly navKey: 'studio' | 'technology' | 'metrics' | 'about';
}

export const BOTTOM_STAGE_PILLS: readonly SiteStagePillDescriptor[] = [
  { stageId: 'studio', viewId: 'studio', icon: 'shirt', navKey: 'studio' },
  { stageId: 'architecture', viewId: 'technology', icon: 'layers', navKey: 'technology' },
  { stageId: 'specs', viewId: 'benchmarks', icon: 'gauge', navKey: 'metrics' },
  { stageId: 'about', viewId: 'about', icon: 'compass', navKey: 'about' },
];

export interface SiteHudMetric {
  readonly label: string;
  readonly value: string;
  readonly emphasis?: boolean;
}

export interface SitePoseTelemetry {
  readonly id: StudioPoseId;
  readonly label: string;
  readonly bone: string;
  readonly drape: string;
  readonly summary: string;
}

export const STUDIO_POSE_TELEMETRY: Readonly<
  Record<StudioPoseId, { readonly bone: string; readonly drape: string }>
> = {
  stand: { bone: 'BONE_SPINE_02', drape: '0.942 N/m²' },
  walk: { bone: 'BONE_L_CLAVICLE_12', drape: '1.184 N/m²' },
  rain: { bone: 'BONE_R_WRIST_UMBRELLA', drape: '1.310 N/m²' },
};

export interface SiteIconFeature {
  readonly id: string;
  readonly icon: SiteIconKey;
  readonly label: string;
  readonly tag: string;
  readonly detail: string;
}

export interface SitePillarCopy {
  readonly code: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly features: readonly SiteIconFeature[];
}

export interface SiteAppPreviewScreen {
  readonly id: AppPreviewScreenId;
  readonly icon: SiteIconKey;
  readonly tabLabel: string;
  readonly title: string;
  readonly caption: string;
  readonly metricTag: string;
  readonly imageAlt: string;
  readonly locationTag?: string;
  readonly brands?: readonly string[];
  readonly modeOptions?: readonly string[];
  readonly densityOptions?: readonly string[];
  readonly hudMetrics: readonly SiteHudMetric[];
}

export interface SiteBlueprintNode {
  readonly id: string;
  readonly icon: SiteIconKey;
  readonly label: string;
  readonly shortSub: string;
  readonly highlight?: boolean;
  readonly devSpec: string;
  readonly prodSpec: string;
}

export interface SiteBlueprintTier {
  readonly id: 'client' | 'edge' | 'gateway' | 'core' | 'shared' | 'data';
  readonly num: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly highlight?: boolean;
  readonly nodes: readonly SiteBlueprintNode[];
}

export interface SitePrivacyShield {
  readonly id: 'biometric' | 'oidc' | 'vault' | 'exif';
  readonly icon: SiteIconKey;
  readonly code: string;
  readonly shortLabel: string;
  readonly title: string;
  readonly statusTag: string;
  readonly devStatus: string;
  readonly prodTarget: string;
  readonly retention: string;
}

export interface SitePipelineNode {
  readonly id: 'weather' | 'streetview' | 'places' | 'vertex' | 'mediapipe' | 'calendar';
  readonly icon: SiteIconKey;
  readonly code: string;
  readonly apiName: string;
  readonly status: 'live' | 'todo';
  readonly statusLabel: string;
  readonly role: string;
  readonly theaterHeadline: string;
  readonly theaterTelemetry: string;
  readonly detail: string;
  readonly compliance: string;
  readonly sceneChips: readonly string[];
  readonly coordinates?: string;
  readonly nearbyCareSpots?: readonly { readonly label: string; readonly distance: string }[];
}

export interface SiteJourneyCut {
  readonly id: 'buy' | 'scan' | 'weather' | 'share' | 'care' | 'resale';
  readonly num: string;
  readonly icon: SiteIconKey;
  readonly shortTitle: string;
  readonly title: string;
  readonly status: JourneyCutStatus;
  readonly statusLabel: string;
  readonly shortStatusLabel: 'LIVE' | 'LIVE+' | 'TO-DO';
  readonly imageSrc: string;
  readonly imageAlt: string;
  readonly speechBubble: string;
  readonly apiChips: readonly string[];
  readonly detail: string;
}

export interface SiteIrKpi {
  readonly id: string;
  readonly icon: SiteIconKey;
  readonly value: string;
  readonly label: string;
  readonly detail: string;
}

export interface SiteBenchmarkRow {
  readonly id: string;
  readonly icon: SiteIconKey;
  readonly shortLabel: string;
  readonly label: string;
  readonly valueText: string;
  readonly detail: string;
}

export interface SiteSpecsPillar3d {
  readonly index: number;
  readonly label: string;
  readonly value: string;
  readonly title: string;
  readonly detail: string;
  readonly normalizedHeight: number;
}

export interface SiteSpecCard {
  readonly id: string;
  readonly icon: SiteIconKey;
  readonly eyebrow: string;
  readonly metric: string;
  readonly title: string;
  readonly detail: string;
  readonly boundary: string;
}

export interface SiteMissionCommitment {
  readonly id: 'wear' | 'cpw' | 'resale';
  readonly icon: SiteIconKey;
  readonly num: string;
  readonly title: string;
  readonly tag: string;
  readonly detail: string;
}

export interface SiteLifecycleNode {
  readonly id: 'closet' | 'weather' | 'avatar' | 'calendar' | 'cpw';
  readonly icon: SiteIconKey;
  readonly num: string;
  readonly title: string;
  readonly subtitle: string;
  readonly detail: string;
}

export interface SiteLifecycleExit {
  readonly id: 'resale' | 'purchase';
  readonly icon: SiteIconKey;
  readonly title: string;
  readonly subtitle: string;
  readonly detail: string;
}

export interface SiteMilestone {
  readonly id: string;
  readonly icon: SiteIconKey;
  readonly phase: string;
  readonly status: 'done' | 'active';
  readonly title: string;
  readonly tag: string;
  readonly detail: string;
}

export interface SiteRevenuePillar {
  readonly id: string;
  readonly icon: SiteIconKey;
  readonly num: string;
  readonly title: string;
  readonly mechanism: string;
  readonly detail: string;
}

export interface SiteMoatItem {
  readonly id: string;
  readonly icon: SiteIconKey;
  readonly title: string;
  readonly tag: string;
  readonly detail: string;
}

export interface SiteCopy {
  readonly nav: {
    readonly homeAria: string;
    readonly studio: string;
    readonly technology: string;
    readonly metrics: string;
    readonly about: string;
    readonly silkLuxury: string;
    readonly silkAurora: string;
    readonly switchToLight: string;
    readonly switchToDark: string;
    readonly switchLang: string;
    readonly opacityLabel: string;
    readonly opacityHint: string;
  };
  readonly subtabs: {
    readonly studioPreview: string;
    readonly studioAtelier: string;
    readonly studioIntel: string;
    readonly archBlueprint: string;
    readonly archPrivacy: string;
    readonly archMaps: string;
    readonly benchKpi: string;
    readonly benchMatrix: string;
    readonly aboutJourney: string;
    readonly aboutMission: string;
    readonly aboutFounder: string;
  };
  readonly tapHint: string;
  readonly appPreview: {
    readonly code: string;
    readonly title: string;
    readonly badge: string;
    readonly screens: readonly SiteAppPreviewScreen[];
  };
  readonly hero: {
    readonly kicker: string;
    readonly titleLead: string;
    readonly titleAccent: string;
    readonly titleTail: string;
    readonly subtitle: string;
    readonly marbleHint: string;
    readonly primaryCta: string;
    readonly secondaryCta: string;
  };
  readonly capabilities: {
    readonly badge: string;
    readonly pillars: {
      readonly atelier: SitePillarCopy;
      readonly intelligence: SitePillarCopy;
    };
  };
  readonly architecture: {
    readonly badge: string;
    readonly blueprintTitle: string;
    readonly modeDevLabel: string;
    readonly modeProdLabel: string;
    readonly devTag: string;
    readonly prodTag: string;
    readonly govLabel: string;
    readonly privacyStripLabel: string;
    readonly openPrivacyCta: string;
    readonly tiers: readonly SiteBlueprintTier[];
    readonly governance: readonly SiteBlueprintNode[];
    readonly privacyEyebrow: string;
    readonly privacyHeading: string;
    readonly privacyBadge: string;
    readonly privacyCurrentLabel: string;
    readonly privacyProdLabel: string;
    readonly privacyRetentionLabel: string;
    readonly privacyShields: readonly SitePrivacyShield[];
    readonly mapsEyebrow: string;
    readonly mapsHeading: string;
    readonly mapsBadge: string;
    readonly mapsComplianceFooter: string;
    readonly weatherMoods: {
      readonly sunny: string;
      readonly rain: string;
      readonly wind: string;
    };
    readonly mapsNodes: readonly SitePipelineNode[];
  };
  readonly interactive: {
    readonly stanceIdle: string;
    readonly stanceWalk: string;
    readonly stanceRain: string;
    readonly poseTelemetry: Readonly<Record<StudioPoseId, SitePoseTelemetry>>;
    readonly pccsNote: string;
    readonly beforeLabel: string;
    readonly afterLabel: string;
    readonly sliderHint: string;
    readonly ingestionBadge: string;
    readonly ingestionMeta: string;
    readonly cpwLabel: string;
    readonly cpwValue: string;
    readonly cpwDelta: string;
    readonly balanceLabel: string;
    readonly balanceValue: string;
    readonly balanceMeta: string;
    readonly dupTitle: string;
    readonly dupStatus: string;
    readonly ootdDate: string;
    readonly ootdTitle: string;
    readonly careDashboardMetrics: readonly SiteHudMetric[];
  };
  readonly stack: {
    readonly eyebrow: string;
    readonly heading: string;
    readonly note: string;
    readonly heroKpis: readonly SiteIrKpi[];
    readonly benchmarkTitle: string;
    readonly specs: readonly SiteBenchmarkRow[];
    readonly pillarLabels: readonly string[];
    readonly pillars3d: readonly SiteSpecsPillar3d[];
    readonly cards: readonly SiteSpecCard[];
  };
  readonly journey: {
    readonly badge: string;
    readonly autoPlayLabel: string;
    readonly pausePlayLabel: string;
    readonly prevLabel: string;
    readonly nextCutLabel: string;
    readonly nextStepLabel: string;
    readonly cuts: readonly SiteJourneyCut[];
  };
  readonly mission: {
    readonly eyebrow: string;
    readonly badge: string;
    readonly slogan: string;
    readonly headingLead: string;
    readonly headingAccent: string;
    readonly commitments: readonly SiteMissionCommitment[];
    readonly centerKicker: string;
    readonly centerTitle: string;
    readonly centerSub: string;
    readonly autoPlayLabel: string;
    readonly pausePlayLabel: string;
    readonly loopNodes: readonly SiteLifecycleNode[];
    readonly exits: readonly SiteLifecycleExit[];
    readonly nextLabel: string;
  };
  readonly vision: {
    readonly eyebrow: string;
    readonly heading: string;
    readonly irBadge: string;
    readonly quote: string;
    readonly roadmapTitle: string;
    readonly milestones: readonly SiteMilestone[];
    readonly moatsTitle: string;
    readonly moats: readonly SiteMoatItem[];
    readonly nextToBmLabel: string;
    readonly revenueTitle: string;
    readonly revenueNote: string;
    readonly revenuePillars: readonly SiteRevenuePillar[];
    readonly backToMissionLabel: string;
    readonly founderRole: string;
    readonly hqLabel: string;
    readonly hqValue: string;
    readonly domainLabel: string;
    readonly stackSummaryLabel: string;
    readonly stackSummaryValue: string;
    readonly directCta: string;
  };
  readonly footer: {
    readonly rights: string;
    readonly privacy: string;
    readonly terms: string;
  };
  readonly legal: {
    readonly closeLabel: string;
    readonly updatedAt: string;
    readonly privacyTitle: string;
    readonly privacySections: readonly { readonly heading: string; readonly body: string }[];
    readonly termsTitle: string;
    readonly termsSections: readonly { readonly heading: string; readonly body: string }[];
  };
}

export const SITE_COPY: Readonly<Record<SiteLang, SiteCopy>> = {
  en: {
    nav: {
      homeAria: 'Return to first page',
      studio: 'Studio',
      technology: 'Architecture',
      metrics: 'Specs',
      about: 'About',
      silkLuxury: 'Luxury',
      silkAurora: 'Aurora',
      switchToLight: 'Light',
      switchToDark: 'Dark',
      switchLang: 'KO',
      opacityLabel: 'Glass',
      opacityHint: 'Drag up for more transparency, drag down for less',
    },
    subtabs: {
      studioPreview: 'App',
      studioAtelier: 'Fitting',
      studioIntel: 'Care',
      archBlueprint: 'Blueprint',
      archPrivacy: 'Privacy',
      archMaps: 'Maps',
      benchKpi: 'Metrics',
      benchMatrix: 'Stack',
      aboutJourney: 'Journey',
      aboutMission: 'Mission',
      aboutFounder: 'Model',
    },
    tapHint: 'Tap an item to inspect',
    appPreview: {
      code: 'iNVTRY',
      title: 'Live App',
      badge: '4 Views',
      screens: [
        {
          id: 'outfits',
          icon: 'shirt',
          tabLabel: 'Fitting',
          title: 'Multi-Angle Fit',
          caption: 'Layer Shirt → Knit → Blazer → Long Coat for your local weather.',
          metricTag: '8 Views',
          imageAlt: 'iNVTRY multi-angle fitting view',
          locationTag: 'GPS',
          hudMetrics: [{ label: 'Angles', value: '8 Views · 45°', emphasis: true }],
        },
        {
          id: 'closet',
          icon: 'layoutGrid',
          tabLabel: 'Closet',
          title: 'Smart Closet',
          caption: 'Snap once to auto-sort items and track laundry.',
          metricTag: '11 Slots',
          imageAlt: 'iNVTRY digital closet view',
          brands: ['ARKET', 'LEMAIRE', 'PATAGONIA', 'A.P.C.'],
          hudMetrics: [
            { label: 'Categories', value: '11', emphasis: true },
            { label: 'Pieces', value: '233', emphasis: true },
          ],
        },
        {
          id: 'stats',
          icon: 'barChart',
          tabLabel: 'Stats',
          title: 'Wear Report',
          caption: 'See cost per wear and spot unworn clothes fast.',
          metricTag: 'CPW',
          imageAlt: 'iNVTRY wear analytics view',
          hudMetrics: [
            { label: 'Wears', value: '3,167', emphasis: true },
            { label: 'Avg / Wear', value: '₩83,000', emphasis: true },
          ],
        },
        {
          id: 'profile',
          icon: 'scanFace',
          tabLabel: 'Profile',
          title: 'Body & Skin Tone',
          caption: 'Analyzed only on your phone — never uploaded.',
          metricTag: 'On-Device',
          imageAlt: 'iNVTRY skin-tone calibration view',
          modeOptions: ['3D', 'Real'],
          densityOptions: ['Minimal', 'Balanced', 'Layered'],
          hudMetrics: [
            { label: 'Face Photo', value: 'Phone Only', emphasis: true },
            { label: 'Fit', value: 'Tone · Body' },
          ],
        },
      ],
    },
    hero: {
      kicker: '',
      titleLead: 'Your entire wardrobe, ',
      titleAccent: 'in one place',
      titleTail: '.',
      subtitle: 'Duplicate checks, weather layering, laundry care & 1-tap resale.',
      marbleHint: '',
      primaryCta: 'Studio',
      secondaryCta: 'Contact',
    },
    capabilities: {
      badge: 'Live',
      pillars: {
        atelier: {
          code: 'Fitting',
          eyebrow: 'Try-On',
          title: 'Multi-Layer Fitting',
          features: [
            {
              id: 'slots',
              icon: 'layers',
              label: 'Multi-Layering',
              tag: '4+ Layers',
              detail: 'Stack shirt, knit, blazer, and long coat together in one try-on.',
            },
            {
              id: 'angles',
              icon: 'rotate3d',
              label: '8-Angle View',
              tag: '45°',
              detail: 'Check front, side, and back silhouettes across 8 angles.',
            },
            {
              id: 'rig',
              icon: 'move3d',
              label: '3 Postures',
              tag: 'Motion',
              detail: 'Preview coat drape while standing, walking, or holding an umbrella.',
            },
            {
              id: 'pacer',
              icon: 'gauge',
              label: 'Smooth & Light',
              tag: 'Battery',
              detail: 'Runs smoothly on mobile and saves battery when paused.',
            },
          ],
        },
        intelligence: {
          code: 'Care',
          eyebrow: 'Care',
          title: 'Care & Value',
          features: [
            {
              id: 'cpw',
              icon: 'trendingDown',
              label: 'Cost / Wear',
              tag: 'CPW',
              detail: 'Real cost per wear & idle alerts.',
            },
            {
              id: 'resale',
              icon: 'badgeCheck',
              label: '1-Tap Resale',
              tag: 'Verified',
              detail: 'Saved photos & receipts ready to list.',
            },
            {
              id: 'care',
              icon: 'droplets',
              label: 'Wash Guard',
              tag: 'Safe',
              detail: 'Fabric care & color-bleed alerts.',
            },
            {
              id: 'map',
              icon: 'mapPin',
              label: 'Care Map',
              tag: 'Nearby',
              detail: 'Nearby cleaners, tailors, leather care.',
            },
          ],
        },
      },
    },
    architecture: {
      badge: '6-Tier',
      blueprintTitle: '6-Tier System',
      modeDevLabel: 'MVP',
      modeProdLabel: 'Prod GPU',
      devTag: 'MVP',
      prodTag: 'PROD',
      govLabel: 'Governance',
      privacyStripLabel: 'Privacy',
      openPrivacyCta: 'Details',
      tiers: [
        {
          id: 'client',
          num: '01',
          label: 'Client',
          shortLabel: '01 Client',
          nodes: [
            {
              id: 'invtry-web',
              icon: 'globe',
              label: 'Web PWA',
              shortSub: 'React 19',
              highlight: true,
              devSpec: 'React 19 · TS 7 · Vite 8 · Local WASM.',
              prodSpec: 'Offline PWA · IndexedDB · 0B face.',
            },
            {
              id: 'invtry-native',
              icon: 'smartphone',
              label: 'Mobile',
              shortSub: 'iOS · AOS',
              highlight: true,
              devSpec: 'Capacitor 8 · iOS · Android.',
              prodSpec: 'Keychain / Keystore native release.',
            },
            {
              id: 'ops-console',
              icon: 'layoutGrid',
              label: 'Ops',
              shortSub: 'QC',
              devSpec: 'Seed QC · Playwright mobile E2E.',
              prodSpec: 'RBAC admin · resale verification.',
            },
          ],
        },
        {
          id: 'edge',
          num: '02',
          label: 'Edge',
          shortLabel: '02 Edge',
          nodes: [
            {
              id: 'cdn',
              icon: 'cloud',
              label: 'CDN',
              shortSub: 'Cloudflare',
              devSpec: 'Cloudflare Workers static edge.',
              prodSpec: 'Multi-region CDN for 3D & shell.',
            },
            {
              id: 'lb-waf',
              icon: 'network',
              label: 'LB · WAF',
              shortSub: 'TLS 1.3',
              devSpec: 'HTTPS · HSTS · CSP · Rate limit.',
              prodSpec: 'Cloud LB + Cloud Armor WAF.',
            },
          ],
        },
        {
          id: 'gateway',
          num: '03',
          label: 'Gateway',
          shortLabel: '03 Gateway',
          highlight: true,
          nodes: [
            {
              id: 'invtry-gw',
              icon: 'keyRound',
              label: 'API Gateway',
              shortSub: 'OIDC',
              highlight: true,
              devSpec: 'Express 5 · Stateless OIDC · 0 IdP tokens.',
              prodSpec: 'Cloud Run · Short JWT + rotating refresh.',
            },
          ],
        },
        {
          id: 'core',
          num: '04',
          label: 'Core',
          shortLabel: '04 Core',
          highlight: true,
          nodes: [
            {
              id: 'core-vton',
              icon: 'cpu',
              label: '3D · VTON',
              shortSub: 'GPU',
              highlight: true,
              devSpec: 'Three.js 21-bone + No-Training VTON.',
              prodSpec: 'Cloud Run + L4/A100 VPC GPU workers.',
            },
            {
              id: 'core-closet',
              icon: 'shirt',
              label: 'Closet',
              shortSub: '11-Slot',
              highlight: true,
              devSpec: '11-slot closet · CPW · duplicate check.',
              prodSpec: 'Tenant-isolated wardrobe analytics.',
            },
            {
              id: 'core-weather',
              icon: 'cloudSun',
              label: 'Geo Proxy',
              shortSub: 'Maps',
              highlight: true,
              devSpec: 'Weather · Places · Street View proxy.',
              prodSpec: 'Regional geo-proxy + Redis TTL.',
            },
            {
              id: 'core-resale',
              icon: 'badgeCheck',
              label: 'Resale',
              shortSub: 'Verified',
              highlight: true,
              devSpec: 'Idle detector + 1-tap photo/spec export.',
              prodSpec: 'Receipt-backed resale partner API.',
            },
          ],
        },
        {
          id: 'shared',
          num: '05',
          label: 'Shared',
          shortLabel: '05 Shared',
          nodes: [
            {
              id: 'shared-log',
              icon: 'fileSearch',
              label: 'Logging',
              shortSub: 'Masked',
              devSpec: 'PII-masked logs & safe error handler.',
              prodSpec: 'Cloud Logging + OpenTelemetry.',
            },
            {
              id: 'shared-oss',
              icon: 'hardDrive',
              label: 'Storage',
              shortSub: '3-Zone',
              devSpec: 'Tenant uploads · magic-byte · 4MB cap.',
              prodSpec: 'GCS 3-Zone · 15m Signed · 24h VTON.',
            },
            {
              id: 'shared-mq',
              icon: 'workflow',
              label: 'Queue',
              shortSub: 'Async',
              devSpec: 'Streaming 8-cut VTON & tagging.',
              prodSpec: 'Cloud Pub/Sub GPU jobs & webhooks.',
            },
          ],
        },
        {
          id: 'data',
          num: '06',
          label: 'Data · HW',
          shortLabel: '06 Data',
          nodes: [
            {
              id: 'data-sql',
              icon: 'database',
              label: 'DB',
              shortSub: 'SQL',
              devSpec: 'sql.js WASM SQLite + IndexedDB.',
              prodSpec: 'Cloud SQL PostgreSQL HA.',
            },
            {
              id: 'data-redis',
              icon: 'zap',
              label: 'Cache',
              shortSub: 'Redis',
              devSpec: '20–30m TTL cache + rate limits.',
              prodSpec: 'Memorystore Redis HA.',
            },
            {
              id: 'data-gpu',
              icon: 'server',
              label: 'GPU',
              shortSub: 'L4/A100',
              devSpec: 'Express 5 + Vertex AI Paid tier.',
              prodSpec: 'Cloud Run HA + L4/A100 workers.',
            },
            {
              id: 'data-vault',
              icon: 'lock',
              label: 'Vault',
              shortSub: 'AES-256',
              devSpec: 'Local face store + server env secrets.',
              prodSpec: 'Cloud KMS CMEK + VPC Controls.',
            },
          ],
        },
      ],
      governance: [
        {
          id: 'gov-audit',
          icon: 'activity',
          label: 'Audit',
          shortSub: 'Trace',
          devSpec: 'Masked logs + verify:secrets hook.',
          prodSpec: 'Tamper-evident audit logs.',
        },
        {
          id: 'gov-rbac',
          icon: 'userCheck',
          label: 'RBAC',
          shortSub: 'Tenant',
          devSpec: 'Tenant guard blocks IDOR.',
          prodSpec: 'Least-privilege IAM + pentest.',
        },
        {
          id: 'gov-cicd',
          icon: 'gitBranch',
          label: 'CI / CD',
          shortSub: 'Gate',
          devSpec: 'oxlint · TS strict · 210+ tests.',
          prodSpec: 'PII/EXIF CI gate + canary deploy.',
        },
      ],
      privacyEyebrow: 'Privacy',
      privacyHeading: '4-Line Defense',
      privacyBadge: '0B Face',
      privacyCurrentLabel: 'MVP',
      privacyProdLabel: 'Prod',
      privacyRetentionLabel: 'Retention',
      privacyShields: [
        {
          id: 'biometric',
          icon: 'scanFace',
          code: '01',
          shortLabel: '0B Face',
          title: 'Local Biometrics',
          statusTag: 'LIVE',
          devStatus: 'Local MediaPipe WASM. Zero face uploads.',
          prodTarget: '0B raw face invariant across platforms.',
          retention: 'Frames: 0s RAM · Local wipe on delete.',
        },
        {
          id: 'oidc',
          icon: 'keyRound',
          code: '02',
          shortLabel: 'Zero OAuth',
          title: 'Stateless OIDC',
          statusTag: 'LIVE',
          devStatus: 'Apple/Google OIDC verified. 0 IdP tokens.',
          prodTarget: 'Short JWT + rotating Keychain refresh.',
          retention: '0 IdP tokens · Sessions purged 12h.',
        },
        {
          id: 'vault',
          icon: 'shieldCheck',
          code: '03',
          shortLabel: '3-Zone',
          title: 'Tenant Isolation',
          statusTag: 'LIVE',
          devStatus: 'Per-user guard, magic-byte check, CSP.',
          prodTarget: 'GCS 3-Zone · 15m Signed · CMEK.',
          retention: 'VTON scratch expires in 24h.',
        },
        {
          id: 'exif',
          icon: 'trash',
          code: '04',
          shortLabel: 'EXIF Wipe',
          title: 'EXIF & 1-Tap Erase',
          statusTag: 'LIVE',
          devStatus: 'Strips GPS/EXIF · No-Training · 1-tap wipe.',
          prodTarget: 'VPC Service Controls + CI PII gate.',
          retention: '0-day AI payload · Atomic account erase.',
        },
      ],
      mapsEyebrow: 'APIs',
      mapsHeading: 'Google API × 3D',
      mapsBadge: '5 Live',
      mapsComplianceFooter: 'Server keys · 0 media cached',
      weatherMoods: {
        sunny: 'Clear',
        rain: 'Rain',
        wind: 'Wind',
      },
      mapsNodes: [
        {
          id: 'weather',
          icon: 'umbrella',
          code: '01',
          apiName: 'Weather v1',
          status: 'live',
          statusLabel: 'LIVE',
          role: '3D Rain',
          theaterHeadline: 'Live Weather × 3D',
          theaterTelemetry: 'Rain · Umbrella',
          detail: 'Drives raindrop physics & daily layers.',
          compliance: 'TTL Cache',
          sceneChips: ['Clear', 'Rain', 'Wind'],
        },
        {
          id: 'streetview',
          icon: 'compass',
          code: '02',
          apiName: 'Street View',
          status: 'live',
          statusLabel: 'LIVE',
          role: 'Backdrop',
          theaterHeadline: 'Real Street Backdrop',
          theaterTelemetry: 'Free Check · 0 Cached',
          detail: 'Free metadata check · real street fit.',
          compliance: '0 Cached',
          coordinates: 'Live GPS',
          sceneChips: ['Live GPS'],
        },
        {
          id: 'places',
          icon: 'mapPin',
          code: '03',
          apiName: 'Places (New)',
          status: 'live',
          statusLabel: 'LIVE',
          role: 'Care Map',
          theaterHeadline: 'Nearby Care Map',
          theaterTelemetry: 'Minimal FieldMask',
          detail: 'Nearby cleaners, tailors, leather care.',
          compliance: 'FieldMask',
          sceneChips: ['Cleaners'],
          nearbyCareSpots: [
            { label: 'Dry Clean', distance: '180m' },
            { label: 'Tailor', distance: '320m' },
            { label: 'Leather', distance: '490m' },
          ],
        },
        {
          id: 'vertex',
          icon: 'sparkles',
          code: '04',
          apiName: 'Vertex AI',
          status: 'live',
          statusLabel: 'LIVE',
          role: 'VTON',
          theaterHeadline: 'No-Training VTON',
          theaterTelemetry: 'Paid No-Training',
          detail: 'EXIF-free tagging & 8-cut 2K VTON.',
          compliance: '0-Day',
          sceneChips: ['8-Cut VTON'],
        },
        {
          id: 'mediapipe',
          icon: 'scanFace',
          code: '05',
          apiName: 'MediaPipe',
          status: 'live',
          statusLabel: 'LIVE',
          role: '0B Tone',
          theaterHeadline: 'Local Skin Tone',
          theaterTelemetry: 'WASM · 0B Upload',
          detail: 'On-device skin tone. 0B face upload.',
          compliance: '0B Upload',
          sceneChips: ['WASM'],
        },
        {
          id: 'calendar',
          icon: 'calendar',
          code: '06',
          apiName: 'Calendar',
          status: 'todo',
          statusLabel: 'NEXT',
          role: 'OOTD',
          theaterHeadline: 'Calendar & SNS',
          theaterTelemetry: 'Planned',
          detail: 'Save daily looks & auto-tag items.',
          compliance: 'NEXT',
          sceneChips: ['Calendar'],
        },
      ],
    },
    interactive: {
      stanceIdle: 'Stand',
      stanceWalk: 'Walk',
      stanceRain: 'Rain',
      poseTelemetry: {
        stand: { id: 'stand', label: 'Stand', bone: 'Stand', drape: 'Natural', summary: 'Silhouette & length.' },
        walk: { id: 'walk', label: 'Walk', bone: 'Walk', drape: 'Motion', summary: 'Stride & coat flow.' },
        rain: { id: 'rain', label: 'Rain', bone: 'Umbrella', drape: 'Outer', summary: 'Umbrella grip fit.' },
      },
      pccsNote: '8-Angle Fit',
      beforeLabel: 'Original',
      afterLabel: 'WebP',
      sliderHint: 'Compare original and WebP cutout',
      ingestionBadge: 'EXIF Stripped',
      ingestionMeta: '582 KB → 23 KB (-96%)',
      cpwLabel: 'Cost / Wear',
      cpwValue: '₩14,200',
      cpwDelta: '-18%',
      balanceLabel: 'Utilization',
      balanceValue: '98.4%',
      balanceMeta: '0 alerts',
      dupTitle: 'Care Map',
      dupStatus: 'Nearby',
      ootdDate: '1-Tap',
      ootdTitle: 'Resale',
      careDashboardMetrics: [
        { label: 'Cost / Wear', value: '₩14,200', emphasis: true },
        { label: 'Utilization', value: '98.4%', emphasis: true },
      ],
    },
    stack: {
      eyebrow: 'Specs',
      heading: 'Verified Specs',
      note: 'Codebase verified',
      heroKpis: [
        {
          id: 'loop',
          icon: 'refreshCw',
          value: '5-Stage',
          label: 'Closed Loop',
          detail: 'Closet → Weather → 8-Cut → Log → Resale.',
        },
        {
          id: 'face',
          icon: 'shieldCheck',
          value: '0 Bytes',
          label: 'Face Upload',
          detail: 'Local MediaPipe WASM. Zero uploads.',
        },
        {
          id: 'tests',
          icon: 'checkCircle',
          value: '210+',
          label: 'Auto Tests',
          detail: '30+ unit & mobile E2E test suites.',
        },
        {
          id: 'apis',
          icon: 'cloud',
          value: '4 APIs',
          label: 'Google Cloud',
          detail: 'Vertex, Weather v1, Places, Street View.',
        },
      ],
      benchmarkTitle: 'Core Specs',
      specs: [
        {
          id: 'webp',
          icon: 'imageMinus',
          shortLabel: 'EXIF -96%',
          label: 'EXIF Strip',
          valueText: '582→23 KB',
          detail: 'Client WebP strips GPS, EXIF & background.',
        },
        {
          id: 'defense',
          icon: 'lock',
          shortLabel: '4-Line Privacy',
          label: 'Privacy',
          valueText: '0B Face',
          detail: 'WASM, Stateless OIDC, 3-Zone, atomic wipe.',
        },
        {
          id: 'rig3d',
          icon: 'box',
          shortLabel: '21-Bone 3D',
          label: '3D Rig',
          valueText: '21-Bone · 8-Cut',
          detail: '21 bones, 28 morphs, 11 slots, 8 cuts.',
        },
        {
          id: 'cpw',
          icon: 'coins',
          shortLabel: 'CPW · Resale',
          label: 'Value OS',
          valueText: '11 Slots',
          detail: 'Wear cost, idle alerts, 1-tap resale.',
        },
      ],
      pillarLabels: [...SPECS_3D_PILLAR_LABELS],
      pillars3d: [
        {
          index: 0,
          label: '5-STAGE',
          value: '5-Stage',
          title: 'Closed Loop',
          detail: 'Closet → Weather → 8-Cut → Log → Resale.',
          normalizedHeight: 0.72,
        },
        {
          index: 1,
          label: '0B FACE',
          value: '0 Bytes',
          title: 'Face Upload',
          detail: 'Local MediaPipe WASM. Zero uploads.',
          normalizedHeight: 1.0,
        },
        {
          index: 2,
          label: '210+ TESTS',
          value: '210+',
          title: 'Auto Tests',
          detail: '30+ unit & mobile E2E test suites.',
          normalizedHeight: 0.88,
        },
        {
          index: 3,
          label: '4 APIs',
          value: '4 APIs',
          title: 'Google Cloud',
          detail: 'Vertex, Weather v1, Places, Street View.',
          normalizedHeight: 0.64,
        },
        {
          index: 4,
          label: '21-BONE',
          value: '21-Bone · 8-Cut',
          title: '3D Engine',
          detail: '21 bones, 28 morphs, 11 slots, 8 cuts.',
          normalizedHeight: 0.78,
        },
        {
          index: 5,
          label: 'EXIF -96%',
          value: '582→23 KB',
          title: 'EXIF Strip',
          detail: 'Client WebP strips GPS, EXIF & background.',
          normalizedHeight: 0.94,
        },
      ],
      cards: [
        {
          id: 'three',
          icon: 'box',
          eyebrow: '3D',
          metric: 'Three.js 0.187',
          title: '3D Rig',
          detail: '21-bone rig, SpringBone, 28 morphs, 8 cuts.',
          boundary: 'WebGL2',
        },
        {
          id: 'ai',
          icon: 'sparkles',
          eyebrow: 'AI',
          metric: 'Gemini · Vertex',
          title: 'VTON',
          detail: 'No-Training Paid VTON + auto angle QC.',
          boundary: '0-Day',
        },
        {
          id: 'maps',
          icon: 'mapPin',
          eyebrow: 'Maps',
          metric: 'Google Maps',
          title: 'Geo APIs',
          detail: 'Weather v1, Places care map, 0-cache Street.',
          boundary: 'Proxy',
        },
        {
          id: 'security',
          icon: 'shield',
          eyebrow: 'Security',
          metric: '0B Face · OIDC',
          title: 'Privacy',
          detail: 'Local WASM, 0 IdP tokens, atomic erase.',
          boundary: '4-Line',
        },
        {
          id: 'asset',
          icon: 'badgeCheck',
          eyebrow: 'OS',
          metric: 'CPW · Resale',
          title: 'Loop',
          detail: 'Wear logs, idle alerts, verified resale.',
          boundary: 'Loop',
        },
        {
          id: 'runtime',
          icon: 'smartphone',
          eyebrow: 'Runtime',
          metric: 'React 19 · Cap 8',
          title: 'Cross-Platform',
          detail: 'TS 7 strict, Express 5, IndexedDB, iOS/AOS.',
          boundary: 'Hybrid',
        },
      ],
    },
    journey: {
      badge: '6-Step Cycle',
      autoPlayLabel: 'Auto',
      pausePlayLabel: 'Pause',
      prevLabel: 'Previous',
      nextCutLabel: 'Next',
      nextStepLabel: 'Mission',
      cuts: [
        {
          id: 'buy',
          num: '01',
          icon: 'shoppingBag',
          shortTitle: 'Buy Check',
          title: 'Duplicate Check',
          status: 'live',
          statusLabel: 'LIVE',
          shortStatusLabel: 'LIVE',
          imageSrc: '/assets/journey/clay-cut-01-v1.webp',
          imageAlt: 'Comparing a store coat with owned closet duplicates',
          speechBubble: '“2 similar coats owned.”',
          apiChips: ['Closet'],
          detail: 'Spot owned duplicates before you buy.',
        },
        {
          id: 'scan',
          num: '02',
          icon: 'camera',
          shortTitle: 'Auto Sort',
          title: 'Snap & Tag Scan',
          status: 'hybrid',
          statusLabel: 'LIVE+',
          shortStatusLabel: 'LIVE+',
          imageSrc: '/assets/journey/clay-cut-02-v1.webp',
          imageAlt: 'Scanning a garment tag for studio photo and care icons',
          speechBubble: '“Snap to sort, scan tag.”',
          apiChips: ['Auto Sort'],
          detail: 'Auto-sort photos (LIVE) · Tag scan (NEXT).',
        },
        {
          id: 'weather',
          num: '03',
          icon: 'umbrella',
          shortTitle: 'Weather Fit',
          title: 'Local Weather & Street',
          status: 'live',
          statusLabel: 'LIVE',
          shortStatusLabel: 'LIVE',
          imageSrc: '/assets/journey/clay-cut-03-v1.webp',
          imageAlt: 'Rainy-day trench coat preview on a real street',
          speechBubble: '“Rain ahead — check my look.”',
          apiChips: ['Weather'],
          detail: '8-cut layered fit on your real street.',
        },
        {
          id: 'share',
          num: '04',
          icon: 'share2',
          shortTitle: 'Calendar',
          title: 'Calendar & Tags',
          status: 'todo',
          statusLabel: 'NEXT',
          shortStatusLabel: 'TO-DO',
          imageSrc: '/assets/journey/clay-cut-04-v1.webp',
          imageAlt: 'Saving an outfit to a calendar lookbook',
          speechBubble: '“Log look & auto-tag items.”',
          apiChips: ['Calendar'],
          detail: 'Planned: Calendar log & SNS item tags.',
        },
        {
          id: 'care',
          num: '05',
          icon: 'truck',
          shortTitle: 'Care',
          title: 'Laundry & Pickup',
          status: 'hybrid',
          statusLabel: 'LIVE+',
          shortStatusLabel: 'LIVE+',
          imageSrc: '/assets/journey/clay-cut-05-v1.webp',
          imageAlt: 'Checking care symbols with laundry pickup',
          speechBubble: '“Check care & book pickup.”',
          apiChips: ['Care'],
          detail: 'Care map (LIVE) · Door pickup (NEXT).',
        },
        {
          id: 'resale',
          num: '06',
          icon: 'badgeCheck',
          shortTitle: 'Resale',
          title: '1-Tap Resale',
          status: 'hybrid',
          statusLabel: 'LIVE+',
          shortStatusLabel: 'LIVE+',
          imageSrc: '/assets/journey/clay-cut-06-v1.webp',
          imageAlt: 'Verified authentic secondhand jacket exchange',
          speechBubble: '“List unworn piece in 1 tap.”',
          apiChips: ['Resale'],
          detail: 'Idle alerts (LIVE) · Receipt resale (NEXT).',
        },
      ],
    },
    mission: {
      eyebrow: 'Mission',
      badge: 'Circular',
      slogan: 'Wear what you own. Circulate with trust.',
      headingLead: 'Wear more. ',
      headingAccent: 'Circulate with trust.',
      commitments: [
        { id: 'wear', icon: 'shirt', num: '01', title: 'Wear First', tag: '8-CUT', detail: 'Style owned clothes first.' },
        { id: 'cpw', icon: 'barChart', num: '02', title: 'Know Value', tag: 'CPW', detail: 'Track cost per wear.' },
        { id: 'resale', icon: 'badgeCheck', num: '03', title: 'Resale', tag: '1-TAP', detail: 'Receipt-verified resale.' },
      ],
      centerKicker: 'LOOP',
      centerTitle: 'iNVTRY Loop',
      centerSub: 'Circular Closet',
      autoPlayLabel: 'Auto',
      pausePlayLabel: 'Pause',
      loopNodes: [
        { id: 'closet', icon: 'shirt', num: '01', title: 'Closet', subtitle: 'Sort', detail: 'Auto-sorted clean photos.' },
        { id: 'weather', icon: 'cloudSun', num: '02', title: 'Weather', subtitle: 'GPS', detail: 'Live local street & weather.' },
        { id: 'avatar', icon: 'personStanding', num: '03', title: '8-Cut Fit', subtitle: 'Layers', detail: '4+ layers in 8 angles.' },
        { id: 'calendar', icon: 'calendar', num: '04', title: 'Calendar', subtitle: 'Log', detail: 'Daily outfit wear logs.' },
        { id: 'cpw', icon: 'coins', num: '05', title: 'Value', subtitle: 'CPW', detail: 'Cost per wear & idle alerts.' },
      ],
      exits: [
        { id: 'resale', icon: 'badgeCheck', title: '1-Tap Resale', subtitle: 'Verified', detail: 'Saved photos & receipts.' },
        { id: 'purchase', icon: 'shoppingBag', title: 'Gap Shopping', subtitle: 'No dupes', detail: 'Buy only missing layers.' },
      ],
      nextLabel: 'Model',
    },
    vision: {
      eyebrow: 'Model',
      heading: 'Business Model',
      irBadge: 'Seoul',
      quote: '',
      roadmapTitle: 'Roadmap',
      milestones: [
        { id: 'stage-1', icon: 'checkCircle', phase: 'LIVE 01', status: 'done', title: '8-Cut Fit & Local Tone', tag: 'Live', detail: '8-cut layers, auto-sort, 0B skin tone.' },
        { id: 'stage-2', icon: 'shieldCheck', phase: 'LIVE 02', status: 'done', title: 'Weather · Care Map · Wipe', tag: 'Live', detail: 'Local weather, care map, 1-tap erase.' },
        { id: 'stage-3', icon: 'rocket', phase: 'NEXT', status: 'active', title: 'Tag · Calendar · Resale', tag: 'Next', detail: 'Tag scan, Calendar, pickup, resale.' },
      ],
      moatsTitle: 'Strengths',
      moats: [
        { id: 'mvp', icon: 'smartphone', title: 'Cross-Platform', tag: 'LIVE', detail: 'Web, iOS, Android.' },
        { id: 'layer360', icon: 'layers', title: '8-Cut Layers', tag: '4+', detail: 'Deep coat layering.' },
        { id: 'provenance', icon: 'badgeCheck', title: 'Verified Resale', tag: '1-Tap', detail: 'Receipt-backed listings.' },
        { id: 'privacy', icon: 'lock', title: 'Privacy First', tag: '0B', detail: 'On-device biometrics.' },
      ],
      nextToBmLabel: 'Model',
      revenueTitle: 'Business Model',
      revenueNote: '',
      revenuePillars: [
        { id: 'pro', icon: 'crown', num: '01', title: 'Pro', mechanism: 'Sub', detail: 'Unlimited 8-cut try-on & CPW insights.' },
        { id: 'affiliate', icon: 'shoppingBag', num: '02', title: 'Gap Shop', mechanism: 'Affiliate', detail: 'Only missing layers — zero duplicates.' },
        { id: 'resale-bm', icon: 'badgeCheck', num: '03', title: 'Resale', mechanism: 'Fee', detail: 'Receipt-verified secondhand trades.' },
      ],
      backToMissionLabel: 'Journey',
      founderRole: 'Founder',
      hqLabel: 'Location',
      hqValue: 'Seoul',
      domainLabel: 'Web',
      stackSummaryLabel: 'Focus',
      stackSummaryValue: '3D Closet · Resale',
      directCta: 'Email Raymond',
    },
    footer: {
      rights: '© 2026 Ainvtry. All rights reserved.',
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
    },
    legal: {
      closeLabel: 'Close legal notice',
      updatedAt: 'Effective November 23, 2026 · ainvtry.com',
      privacyTitle: 'Privacy Policy',
      privacySections: [
        {
          heading: '1. On-Device First Biometrics & Face Memory Vault',
          body: 'Ainvtry processes facial skin-tone landmarks strictly on your device using client-side MediaPipe WebAssembly and isolates calibrated face memory inside local IndexedDB. Raw facial camera frames are never stored or uploaded to external servers (0 bytes transmitted).',
        },
        {
          heading: '2. OAuth Token Governance & Tenant Storage Isolation',
          body: 'Apple and Google OAuth ID tokens are cryptographically verified on the server without storing external IdP access/refresh tokens or auto-linking unverified emails. Sessions use HttpOnly cookies with rate limiting, and all wardrobe APIs and storage paths enforce strict per-user tenant isolation to prevent cross-account access.',
        },
        {
          heading: '3. Third-Party AI De-Identification, No-Training & Retention',
          body: 'Garment images are cropped, background-separated, and WebP re-encoded on-device to strip EXIF/GPS metadata before server-proxied Gemini / Vertex AI Paid Tier inference. Direct PII (name, email, address) is excluded from AI payloads, images are never used for model training, and inference payloads are discarded immediately after response. Google Maps media is never cached in permanent DB.',
        },
        {
          heading: '4. Immediate One-Stop Permanent Deletion & Inquiries',
          body: 'From Account Settings, you can permanently erase your account, active sessions, wardrobe DB records, uploaded garment files, temporary VTON caches, and local IndexedDB vault in one atomic flow. For privacy inquiries, contact Founder Raymond Moon at raymond@ainvtry.com.',
        },
      ],
      termsTitle: 'Terms of Service',
      termsSections: [
        {
          heading: '1. Service Scope',
          body: 'Ainvtry (ainvtry.com, product: A inventory) provides 3D digital wardrobe management, garment classification, multi-angle virtual try-on previews, garment care guidance, weather/TPO outfit planning, and purchase-verified resale preparation tools.',
        },
        {
          heading: '2. User Content Ownership',
          body: 'You retain full ownership of all wardrobe photographs, outfit logs, and purchase records you store in Ainvtry. You grant Ainvtry only the limited technical license needed to render and process your requested features.',
        },
        {
          heading: '3. Preview & Care Guidance',
          body: 'Virtual try-on renders, outfit notes, and care recommendations are reference aids and do not replace manufacturer care tags or physical garment sizing across third-party brands.',
        },
        {
          heading: '4. Operator',
          body: 'Operator: Ainvtry (Founder: Raymond Moon, Seoul, South Korea). Inquiries: raymond@ainvtry.com.',
        },
      ],
    },
  },
  ko: {
    nav: {
      homeAria: '첫 페이지로 돌아가기',
      studio: '스튜디오',
      technology: '아키텍처',
      metrics: '스펙',
      about: '소개',
      silkLuxury: '럭셔리',
      silkAurora: '오로라',
      switchToLight: '라이트',
      switchToDark: '다크',
      switchLang: 'EN',
      opacityLabel: '투명도',
      opacityHint: '위로 드래그하면 투명도 상승, 아래로 내리면 하락',
    },
    subtabs: {
      studioPreview: '앱',
      studioAtelier: '피팅',
      studioIntel: '케어',
      archBlueprint: '구성도',
      archPrivacy: '보안',
      archMaps: 'API',
      benchKpi: '지표',
      benchMatrix: '스택',
      aboutJourney: '여정',
      aboutMission: '미션',
      aboutFounder: '비즈니스',
    },
    tapHint: '카드를 눌러 자세히 보기',
    appPreview: {
      code: 'iNVTRY',
      title: '앱 화면',
      badge: '4개',
      screens: [
        {
          id: 'outfits',
          icon: 'shirt',
          tabLabel: '피팅',
          title: '가상 피팅',
          caption: '내 위치 날씨에 맞춘 여러 겹 레이어드 코디.',
          metricTag: '8방향',
          imageAlt: 'iNVTRY 가상 피팅 화면',
          locationTag: 'GPS',
          hudMetrics: [{ label: '보기', value: '앞·옆·뒤 8방향', emphasis: true }],
        },
        {
          id: 'closet',
          icon: 'layoutGrid',
          tabLabel: '옷장',
          title: '스마트 옷장',
          caption: '사진만 찍으면 종류별 자동 정리와 세탁 관리까지.',
          metricTag: '11분류',
          imageAlt: 'iNVTRY 디지털 옷장 화면',
          brands: ['ARKET', 'LEMAIRE', 'PATAGONIA', 'A.P.C.'],
          hudMetrics: [
            { label: '분류', value: '11종', emphasis: true },
            { label: '보유', value: '233벌', emphasis: true },
          ],
        },
        {
          id: 'stats',
          icon: 'barChart',
          tabLabel: '통계',
          title: '옷장 리포트',
          caption: '한 번 입을 때마다 드는 비용과 안 입는 옷을 알려줍니다.',
          metricTag: '가치',
          imageAlt: 'iNVTRY 옷장 통계 화면',
          hudMetrics: [
            { label: '착용', value: '3,167회', emphasis: true },
            { label: '1회 비용', value: '₩83,000', emphasis: true },
          ],
        },
        {
          id: 'profile',
          icon: 'scanFace',
          tabLabel: '프로필',
          title: '내 체형·피부톤',
          caption: '얼굴 사진은 서버로 보내지 않고 내 폰에서만 분석합니다.',
          metricTag: '폰 보관',
          imageAlt: 'iNVTRY 피부톤·체형 설정 화면',
          modeOptions: ['3D', '실사'],
          densityOptions: ['미니멀', '밸런스', '레이어드'],
          hudMetrics: [
            { label: '얼굴 사진', value: '내 폰에만 보관', emphasis: true },
            { label: '맞춤', value: '피부톤 · 체형' },
          ],
        },
      ],
    },
    hero: {
      kicker: '',
      titleLead: '내 옷장의 모든 순간, ',
      titleAccent: '하나로',
      titleTail: '.',
      subtitle: '중복 확인부터 날씨 맞춤 코디, 세탁·리셀까지.',
      marbleHint: '',
      primaryCta: '스튜디오',
      secondaryCta: '문의',
    },
    capabilities: {
      badge: '실시간',
      pillars: {
        atelier: {
          code: '피팅',
          eyebrow: '피팅',
          title: '멀티 레이어드 피팅',
          features: [
            {
              id: 'slots',
              icon: 'layers',
              label: '다중 레이어드',
              tag: '4겹+',
              detail: '셔츠·니트·블레이저·롱코트까지 여러 겹을 한 번에 입어봅니다.',
            },
            {
              id: 'angles',
              icon: 'rotate3d',
              label: '앞·옆·뒤 8방향',
              tag: '45°',
              detail: '45° 간격 8장의 사진으로 앞모습부터 뒷태까지 꼼꼼히 확인합니다.',
            },
            {
              id: 'rig',
              icon: 'move3d',
              label: '3가지 자세',
              tag: '움직임',
              detail: '서기·걷기·우산 자세로 움직일 때의 코트 핏을 미리 봅니다.',
            },
            {
              id: 'pacer',
              icon: 'gauge',
              label: '가벼운 실행',
              tag: '배터리',
              detail: '모바일에서도 부드럽게 움직이고, 멈추면 배터리를 아낍니다.',
            },
          ],
        },
        intelligence: {
          code: '케어',
          eyebrow: '케어',
          title: '세탁 · 옷장 가치',
          features: [
            {
              id: 'cpw',
              icon: 'trendingDown',
              label: '1회 착용 비용',
              tag: '가성비',
              detail: '구매가와 착용 횟수로 진짜 가성비와 안 입는 옷을 찾습니다.',
            },
            {
              id: 'resale',
              icon: 'badgeCheck',
              label: '간편 중고 판매',
              tag: '이력 인증',
              detail: '저장해 둔 사진과 구매 기록을 묶어 한 번에 판매글을 올립니다.',
            },
            {
              id: 'care',
              icon: 'droplets',
              label: '세탁 가이드',
              tag: '이염 방지',
              detail: '옷감에 맞는 세탁법과 물 빠짐·이염 위험을 미리 알려줍니다.',
            },
            {
              id: 'map',
              icon: 'mapPin',
              label: '주변 세탁·수선',
              tag: '내 주변',
              detail: '가까운 세탁소·수선실·가죽 케어 매장을 바로 찾아줍니다.',
            },
          ],
        },
      },
    },
    architecture: {
      badge: '6계층',
      blueprintTitle: '6계층 시스템',
      modeDevLabel: 'MVP',
      modeProdLabel: '상용 GPU',
      devTag: 'MVP',
      prodTag: '상용',
      govLabel: '거버넌스',
      privacyStripLabel: '보안',
      openPrivacyCta: '상세',
      tiers: [
        {
          id: 'client',
          num: '01',
          label: '클라이언트',
          shortLabel: '01 웹/앱',
          nodes: [
            {
              id: 'invtry-web',
              icon: 'globe',
              label: '웹 PWA',
              shortSub: 'React 19',
              highlight: true,
              devSpec: 'React 19 · TS 7 · Vite 8 · 로컬 WASM.',
              prodSpec: '오프라인 PWA · IndexedDB · 얼굴 0B.',
            },
            {
              id: 'invtry-native',
              icon: 'smartphone',
              label: '모바일',
              shortSub: 'iOS · AOS',
              highlight: true,
              devSpec: 'Capacitor 8 · iOS · Android.',
              prodSpec: 'Keychain / Keystore 네이티브 출시.',
            },
            {
              id: 'ops-console',
              icon: 'layoutGrid',
              label: '운영',
              shortSub: 'QA',
              devSpec: '시드 QA · Playwright E2E.',
              prodSpec: 'RBAC 백오피스 · 정품 검수.',
            },
          ],
        },
        {
          id: 'edge',
          num: '02',
          label: '엣지',
          shortLabel: '02 엣지',
          nodes: [
            {
              id: 'cdn',
              icon: 'cloud',
              label: 'CDN',
              shortSub: 'Cloudflare',
              devSpec: 'Cloudflare Workers 정적 배포.',
              prodSpec: '멀티 리전 3D · 앱 셸 CDN.',
            },
            {
              id: 'lb-waf',
              icon: 'network',
              label: 'LB · WAF',
              shortSub: 'TLS 1.3',
              devSpec: 'HTTPS · HSTS · CSP · Rate Limit.',
              prodSpec: 'Cloud LB + Cloud Armor WAF.',
            },
          ],
        },
        {
          id: 'gateway',
          num: '03',
          label: '게이트웨이',
          shortLabel: '03 GW',
          highlight: true,
          nodes: [
            {
              id: 'invtry-gw',
              icon: 'keyRound',
              label: 'API 게이트웨이',
              shortSub: 'OIDC',
              highlight: true,
              devSpec: 'Express 5 · OIDC 검증 · 토큰 무저장.',
              prodSpec: 'Cloud Run · 단기 JWT + 순환 Refresh.',
            },
          ],
        },
        {
          id: 'core',
          num: '04',
          label: '코어',
          shortLabel: '04 코어',
          highlight: true,
          nodes: [
            {
              id: 'core-vton',
              icon: 'cpu',
              label: '3D · VTON',
              shortSub: 'GPU',
              highlight: true,
              devSpec: 'Three.js 21관절 + 무학습 8방향 VTON.',
              prodSpec: 'Cloud Run + L4/A100 VPC GPU.',
            },
            {
              id: 'core-closet',
              icon: 'shirt',
              label: '옷장',
              shortSub: '11슬롯',
              highlight: true,
              devSpec: '11슬롯 · CPW · 중복 감지.',
              prodSpec: '테넌트 격리 의류 자산 DB.',
            },
            {
              id: 'core-weather',
              icon: 'cloudSun',
              label: '기상 · 장소',
              shortSub: '프록시',
              highlight: true,
              devSpec: 'Weather · Places · Street 프록시.',
              prodSpec: '리전 프록시 + Redis TTL 캐시.',
            },
            {
              id: 'core-resale',
              icon: 'badgeCheck',
              label: '리셀',
              shortSub: '인증',
              highlight: true,
              devSpec: '미착용 감지 · 원탭 판매글.',
              prodSpec: '영수증 기반 정품 파트너 API.',
            },
          ],
        },
        {
          id: 'shared',
          num: '05',
          label: '기초',
          shortLabel: '05 기초',
          nodes: [
            {
              id: 'shared-log',
              icon: 'fileSearch',
              label: '로그',
              shortSub: '마스킹',
              devSpec: 'PII 마스킹 로그 · 안전 에러.',
              prodSpec: 'Cloud Logging + OpenTelemetry.',
            },
            {
              id: 'shared-oss',
              icon: 'hardDrive',
              label: '스토리지',
              shortSub: '3-Zone',
              devSpec: '소유자 격리 · 매직바이트 · 4MB.',
              prodSpec: 'GCS 3-Zone · 15분 서명 · 24h VTON.',
            },
            {
              id: 'shared-mq',
              icon: 'workflow',
              label: '큐',
              shortSub: '비동기',
              devSpec: '8방향 VTON · 태깅 스트리밍.',
              prodSpec: 'Cloud Pub/Sub GPU 큐 · 웹훅.',
            },
          ],
        },
        {
          id: 'data',
          num: '06',
          label: '데이터',
          shortLabel: '06 DB/HW',
          nodes: [
            {
              id: 'data-sql',
              icon: 'database',
              label: 'DB',
              shortSub: 'SQL',
              devSpec: 'sql.js WASM SQLite + IndexedDB.',
              prodSpec: 'Cloud SQL PostgreSQL HA.',
            },
            {
              id: 'data-redis',
              icon: 'zap',
              label: '캐시',
              shortSub: 'Redis',
              devSpec: '20~30분 TTL · Rate Limit.',
              prodSpec: 'Memorystore Redis HA.',
            },
            {
              id: 'data-gpu',
              icon: 'server',
              label: 'GPU',
              shortSub: 'L4/A100',
              devSpec: 'Express 5 + Vertex AI 유료.',
              prodSpec: 'Cloud Run HA + L4/A100 워커.',
            },
            {
              id: 'data-vault',
              icon: 'lock',
              label: '볼트',
              shortSub: 'AES-256',
              devSpec: '로컬 볼트 · 서버 env 시크릿.',
              prodSpec: 'Cloud KMS CMEK · VPC-SC.',
            },
          ],
        },
      ],
      governance: [
        {
          id: 'gov-audit',
          icon: 'activity',
          label: '감사',
          shortSub: '추적',
          devSpec: '비식별 로그 · 시크릿 스캔.',
          prodSpec: '위변조 방지 감사 로그.',
        },
        {
          id: 'gov-rbac',
          icon: 'userCheck',
          label: '권한',
          shortSub: 'IDOR',
          devSpec: '테넌트 가드 교차 접근 차단.',
          prodSpec: '최소 권한 IAM · 모의해킹.',
        },
        {
          id: 'gov-cicd',
          icon: 'gitBranch',
          label: 'CI/CD',
          shortSub: '검증',
          devSpec: 'oxlint · TS strict · 210+ 테스트.',
          prodSpec: 'PII/EXIF CI · 카나리 배포.',
        },
      ],
      privacyEyebrow: '보안',
      privacyHeading: '4중 보안 방어',
      privacyBadge: '얼굴 0B',
      privacyCurrentLabel: 'MVP',
      privacyProdLabel: '상용',
      privacyRetentionLabel: '파기',
      privacyShields: [
        {
          id: 'biometric',
          icon: 'scanFace',
          code: '01',
          shortLabel: '얼굴 데이터 0B',
          title: '기기 내 얼굴 분석',
          statusTag: 'LIVE',
          devStatus: '기기 내 MediaPipe WASM 처리 · 얼굴 원본 외부 전송 0B.',
          prodTarget: '전 플랫폼 얼굴 원본 무전송 유지.',
          retention: '원본 즉시 휘발 · 탈퇴 시 로컬 삭제.',
        },
        {
          id: 'oidc',
          icon: 'keyRound',
          code: '02',
          shortLabel: '로그인 토큰 무저장',
          title: 'Stateless OIDC',
          statusTag: 'LIVE',
          devStatus: 'Apple/Google OIDC 검증 · 외부 토큰 무저장.',
          prodTarget: '단기 JWT + Keychain 순환.',
          retention: '외부 토큰 미저장 · 세션 12시간 만료.',
        },
        {
          id: 'vault',
          icon: 'shieldCheck',
          code: '03',
          shortLabel: '사용자별 격리 저장',
          title: '테넌트 격리',
          statusTag: 'LIVE',
          devStatus: '사용자별 가드 · 매직바이트 검증 · CSP.',
          prodTarget: 'GCS 3-Zone · 15분 서명 · CMEK.',
          retention: '임시 VTON 24시간 자동 삭제.',
        },
        {
          id: 'exif',
          icon: 'trash',
          code: '04',
          shortLabel: '사진 정보 제거·삭제',
          title: 'EXIF 제거 · 즉시 삭제',
          statusTag: 'LIVE',
          devStatus: '위치·EXIF 제거 · AI 무학습 · 탈퇴 시 즉시 일괄 삭제.',
          prodTarget: 'VPC-SC · CI PII/EXIF 회귀 검증.',
          retention: 'AI 즉시 폐기 · 탈퇴 시 전체 삭제.',
        },
      ],
      mapsEyebrow: 'API',
      mapsHeading: 'Google API × 3D',
      mapsBadge: '5 LIVE',
      mapsComplianceFooter: '키 격리 · 미디어 무저장',
      weatherMoods: {
        sunny: '맑음',
        rain: '비',
        wind: '바람',
      },
      mapsNodes: [
        {
          id: 'weather',
          icon: 'umbrella',
          code: '01',
          apiName: 'Weather v1',
          status: 'live',
          statusLabel: 'LIVE',
          role: '기상',
          theaterHeadline: '날씨 × 3D 우산',
          theaterTelemetry: '빗방울 · 우산',
          detail: '실시간 기상 → 3D 우산 · 레이어.',
          compliance: 'TTL',
          sceneChips: ['맑음', '비', '바람'],
        },
        {
          id: 'streetview',
          icon: 'compass',
          code: '02',
          apiName: 'Street View',
          status: 'live',
          statusLabel: 'LIVE',
          role: '거리',
          theaterHeadline: '내 거리 배경',
          theaterTelemetry: '무료 조회 · 무저장',
          detail: '무료 메타 확인 · 내 거리 피팅.',
          compliance: '무저장',
          coordinates: '실시간 GPS',
          sceneChips: ['GPS'],
        },
        {
          id: 'places',
          icon: 'mapPin',
          code: '03',
          apiName: 'Places (New)',
          status: 'live',
          statusLabel: 'LIVE',
          role: '케어',
          theaterHeadline: '주변 케어 지도',
          theaterTelemetry: '최소 FieldMask',
          detail: '주변 세탁 · 수선 · 가죽 케어.',
          compliance: 'FieldMask',
          sceneChips: ['세탁'],
          nearbyCareSpots: [
            { label: '드라이', distance: '180m' },
            { label: '수선실', distance: '320m' },
            { label: '가죽', distance: '490m' },
          ],
        },
        {
          id: 'vertex',
          icon: 'sparkles',
          code: '04',
          apiName: 'Vertex AI',
          status: 'live',
          statusLabel: 'LIVE',
          role: 'VTON',
          theaterHeadline: '무학습 VTON',
          theaterTelemetry: '유료 무학습',
          detail: 'EXIF 제거 분류 · 8방향 2K 피팅.',
          compliance: '0일 폐기',
          sceneChips: ['8방향'],
        },
        {
          id: 'mediapipe',
          icon: 'scanFace',
          code: '05',
          apiName: 'MediaPipe',
          status: 'live',
          statusLabel: 'LIVE',
          role: '0B',
          theaterHeadline: '로컬 피부톤',
          theaterTelemetry: 'WASM · 0B',
          detail: '기기 내 피부톤 · 외부 전송 0B.',
          compliance: '0B',
          sceneChips: ['WASM'],
        },
        {
          id: 'calendar',
          icon: 'calendar',
          code: '06',
          apiName: 'Calendar',
          status: 'todo',
          statusLabel: '예정',
          role: 'OOTD',
          theaterHeadline: '캘린더 · SNS',
          theaterTelemetry: '예정',
          detail: '코디 일정 저장 · SNS 자동 태깅.',
          compliance: '예정',
          sceneChips: ['일정'],
        },
      ],
    },
    interactive: {
      stanceIdle: '서기',
      stanceWalk: '걷기',
      stanceRain: '우산',
      poseTelemetry: {
        stand: { id: 'stand', label: '서기', bone: '서기', drape: '자연', summary: '전체 실루엣 · 기장.' },
        walk: { id: 'walk', label: '걷기', bone: '걷기', drape: '움직임', summary: '걸을 때 어깨 · 옷자락.' },
        rain: { id: 'rain', label: '우산', bone: '우산', drape: '아우터', summary: '우산 들었을 때 어깨선.' },
      },
      pccsNote: '8방향 피팅',
      beforeLabel: '원본',
      afterLabel: 'WebP',
      sliderHint: '원본과 배경 제거 WebP 비교',
      ingestionBadge: 'EXIF 제거',
      ingestionMeta: '582 KB → 23 KB (-96%)',
      cpwLabel: '1회 착용 비용',
      cpwValue: '₩14,200',
      cpwDelta: '-18%',
      balanceLabel: '옷장 활용률',
      balanceValue: '98.4%',
      balanceMeta: '이염 주의 0건',
      dupTitle: '주변 세탁·수선',
      dupStatus: '내 주변',
      ootdDate: '간편',
      ootdTitle: '중고 판매',
      careDashboardMetrics: [
        { label: '1회 착용 비용', value: '₩14,200', emphasis: true },
        { label: '옷장 활용률', value: '98.4%', emphasis: true },
      ],
    },
    stack: {
      eyebrow: '스펙',
      heading: '핵심 스펙',
      note: '실측 기준',
      heroKpis: [
        {
          id: 'loop',
          icon: 'refreshCw',
          value: '5단계',
          label: '순환 흐름',
          detail: '옷장 → 날씨 → 레이어드 피팅 → 캘린더 → 리셀.',
        },
        {
          id: 'face',
          icon: 'shieldCheck',
          value: '0 Bytes',
          label: '얼굴 전송 0B',
          detail: '기기 내 MediaPipe WASM 전용 · 외부 전송 0B.',
        },
        {
          id: 'tests',
          icon: 'checkCircle',
          value: '210+',
          label: '자동 테스트',
          detail: '단위 · 모바일 E2E 30+ 테스트 스위트.',
        },
        {
          id: 'apis',
          icon: 'cloud',
          value: '4 APIs',
          label: 'Google Cloud',
          detail: 'Vertex · Weather · Places · Street View.',
        },
      ],
      benchmarkTitle: '검증',
      specs: [
        {
          id: 'webp',
          icon: 'imageMinus',
          shortLabel: 'EXIF -96%',
          label: 'EXIF 제거',
          valueText: '582→23 KB',
          detail: '로컬 WebP 변환으로 위치 · EXIF · 배경 제거.',
        },
        {
          id: 'defense',
          icon: 'lock',
          shortLabel: '4중 보안',
          label: '보안',
          valueText: '얼굴 0B',
          detail: 'WASM · OIDC · 3-Zone · 탈퇴 즉시 삭제.',
        },
        {
          id: 'rig3d',
          icon: 'box',
          shortLabel: '21관절 3D',
          label: '3D 관절 리그',
          valueText: '21관절 · 8방향',
          detail: '21관절 · 28모프 · 11슬롯 · 8방향 회전.',
        },
        {
          id: 'cpw',
          icon: 'coins',
          shortLabel: 'CPW · 리셀',
          label: '옷장 가치',
          valueText: '11슬롯',
          detail: '1회 착용 비용 · 안 입는 옷 · 간편 판매.',
        },
      ],
      pillarLabels: [...SPECS_3D_PILLAR_LABELS],
      pillars3d: [
        {
          index: 0,
          label: '5-STAGE',
          value: '5단계',
          title: '5단계 순환',
          detail: '옷장 → 날씨 → 레이어드 피팅 → 캘린더 → 리셀.',
          normalizedHeight: 0.72,
        },
        {
          index: 1,
          label: '0B FACE',
          value: '0 Bytes',
          title: '얼굴 전송 0B',
          detail: '기기 내 MediaPipe WASM 전용 · 외부 전송 0B.',
          normalizedHeight: 1.0,
        },
        {
          index: 2,
          label: '210+ TESTS',
          value: '210+',
          title: '자동 테스트',
          detail: '단위 · 모바일 E2E 30+ 테스트 스위트.',
          normalizedHeight: 0.88,
        },
        {
          index: 3,
          label: '4 APIs',
          value: '4 APIs',
          title: 'Google Cloud',
          detail: 'Vertex · Weather · Places · Street View.',
          normalizedHeight: 0.64,
        },
        {
          index: 4,
          label: '21-BONE',
          value: '21관절 · 8방향',
          title: '3D 관절 리그',
          detail: '21관절 · 28모프 · 11슬롯 · 8방향 회전.',
          normalizedHeight: 0.78,
        },
        {
          index: 5,
          label: 'EXIF -96%',
          value: '582→23 KB',
          title: 'EXIF 제거 · 경량화',
          detail: '로컬 WebP 변환으로 위치 · EXIF · 배경 제거(-96%).',
          normalizedHeight: 0.94,
        },
      ],
      cards: [
        {
          id: 'three',
          icon: 'box',
          eyebrow: '3D',
          metric: 'Three.js 0.187',
          title: '3D 관절 리그',
          detail: '21관절 · SpringBone · 28모프 · 8방향 회전.',
          boundary: 'WebGL2',
        },
        {
          id: 'ai',
          icon: 'sparkles',
          eyebrow: 'AI',
          metric: 'Gemini · Vertex',
          title: 'VTON 엔진',
          detail: '유료 무학습 2K 가상 피팅 · 8방향 자동 검수.',
          boundary: '0일 보관',
        },
        {
          id: 'maps',
          icon: 'mapPin',
          eyebrow: 'Maps',
          metric: 'Google Maps',
          title: '기상 · 지도',
          detail: 'Weather v1 · 주변 세탁소 · 무저장 거리 배경.',
          boundary: '프록시',
        },
        {
          id: 'security',
          icon: 'shield',
          eyebrow: '보안',
          metric: '0B 얼굴 · OIDC',
          title: '프라이버시',
          detail: '로컬 WASM · 토큰 무저장 · 탈퇴 즉시 삭제.',
          boundary: '4중 방어',
        },
        {
          id: 'asset',
          icon: 'badgeCheck',
          eyebrow: 'OS',
          metric: 'CPW · 리셀',
          title: '옷장 순환',
          detail: '착용 기록 · 안 입는 옷 알림 · 간편 리셀.',
          boundary: '순환',
        },
        {
          id: 'runtime',
          icon: 'smartphone',
          eyebrow: '런타임',
          metric: 'React 19 · Cap 8',
          title: '크로스플랫폼',
          detail: 'TS 7 · Express 5 · IndexedDB · iOS/Android.',
          boundary: '하이브리드',
        },
      ],
    },
    journey: {
      badge: '6단계 여정',
      autoPlayLabel: '자동',
      pausePlayLabel: '정지',
      prevLabel: '이전',
      nextCutLabel: '다음',
      nextStepLabel: '미션',
      cuts: [
        {
          id: 'buy',
          num: '01',
          icon: 'shoppingBag',
          shortTitle: '중복 확인',
          title: '사기 전 중복 확인',
          status: 'live',
          statusLabel: 'LIVE',
          shortStatusLabel: 'LIVE',
          imageSrc: '/assets/journey/clay-cut-01-v1.webp',
          imageAlt: '보유 코트와 착용 기록을 비교하는 3D 캐릭터',
          speechBubble: '“비슷한 코트가 이미 2벌 있어요.”',
          apiChips: ['중복 확인'],
          detail: '새 옷을 사기 전에 내 옷장과 먼저 비교해 충동구매를 줄입니다.',
        },
        {
          id: 'scan',
          num: '02',
          icon: 'camera',
          shortTitle: '사진 등록',
          title: '사진 등록 · 택 스캔',
          status: 'hybrid',
          statusLabel: 'LIVE+',
          shortStatusLabel: 'LIVE+',
          imageSrc: '/assets/journey/clay-cut-02-v1.webp',
          imageAlt: '울 코트 택을 스캔해 세탁법을 불러오는 3D 캐릭터',
          speechBubble: '“찍기만 하면 정리부터 세탁법까지.”',
          apiChips: ['자동 정리'],
          detail: '사진으로 자동 분류(LIVE)하고, 택 스캔으로 세탁법까지 불러옵니다(예정).',
        },
        {
          id: 'weather',
          num: '03',
          icon: 'umbrella',
          shortTitle: '날씨 코디',
          title: '내 동네 날씨 코디',
          status: 'live',
          statusLabel: 'LIVE',
          shortStatusLabel: 'LIVE',
          imageSrc: '/assets/journey/clay-cut-03-v1.webp',
          imageAlt: '비 오는 거리 위에서 우산을 든 3D 캐릭터',
          speechBubble: '“비 오는 오늘, 우리 동네에서 미리 입어봐요.”',
          apiChips: ['날씨'],
          detail: '지금 있는 곳의 날씨와 거리 배경에 맞춰 여러 겹 코디를 미리 확인합니다.',
        },
        {
          id: 'share',
          num: '04',
          icon: 'share2',
          shortTitle: '캘린더',
          title: '캘린더 · SNS 공유',
          status: 'todo',
          statusLabel: '예정',
          shortStatusLabel: 'TO-DO',
          imageSrc: '/assets/journey/clay-cut-04-v1.webp',
          imageAlt: '캘린더 룩북을 정리하는 3D 캐릭터',
          speechBubble: '“오늘 입은 옷을 캘린더에 바로 기록.”',
          apiChips: ['캘린더'],
          detail: '매일 입은 코디를 캘린더에 저장하고 SNS에 태그와 함께 공유합니다(예정).',
        },
        {
          id: 'care',
          num: '05',
          icon: 'truck',
          shortTitle: '세탁·수거',
          title: '세탁법 · 방문 수거',
          status: 'hybrid',
          statusLabel: 'LIVE+',
          shortStatusLabel: 'LIVE+',
          imageSrc: '/assets/journey/clay-cut-05-v1.webp',
          imageAlt: '세탁 기호를 확인하고 방문수거를 신청하는 3D 캐릭터',
          speechBubble: '“세탁법 확인하고 문 앞 수거 신청.”',
          apiChips: ['세탁'],
          detail: '주변 세탁소 찾기(LIVE)와 문 앞 세탁 수거(예정)까지 한 번에 연결합니다.',
        },
        {
          id: 'resale',
          num: '06',
          icon: 'badgeCheck',
          shortTitle: '간편 판매',
          title: '안 입는 옷 간편 판매',
          status: 'hybrid',
          statusLabel: 'LIVE+',
          shortStatusLabel: 'LIVE+',
          imageSrc: '/assets/journey/clay-cut-06-v1.webp',
          imageAlt: '영수증 태그가 붙은 재킷을 거래하는 3D 캐릭터',
          speechBubble: '“안 입는 옷, 사진·이력 묶어 바로 판매.”',
          apiChips: ['리셀'],
          detail: '오래 안 입은 옷을 알려주고(LIVE), 저장된 사진과 구매 이력으로 바로 팝니다(예정).',
        },
      ],
    },
    mission: {
      eyebrow: '미션',
      badge: '순환',
      slogan: '가진 옷을 더 잘 입고, 안 입는 옷은 다시 순환',
      headingLead: '가진 옷을 더 잘 입고, ',
      headingAccent: '안 입는 옷은 다시 순환',
      commitments: [
        { id: 'wear', icon: 'shirt', num: '01', title: '내 옷 먼저', tag: '코디', detail: '가진 옷으로 먼저 코디합니다.' },
        { id: 'cpw', icon: 'barChart', num: '02', title: '옷장 가치', tag: '비용', detail: '1회 착용 비용과 안 입는 옷을 파악합니다.' },
        { id: 'resale', icon: 'badgeCheck', num: '03', title: '믿고 판매', tag: '리셀', detail: '구매 기록과 사진으로 간편하게 판매합니다.' },
      ],
      centerKicker: 'LOOP',
      centerTitle: '옷장 순환 흐름',
      centerSub: '순환 옷장',
      autoPlayLabel: '자동',
      pausePlayLabel: '정지',
      loopNodes: [
        { id: 'closet', icon: 'shirt', num: '01', title: '옷장 정리', subtitle: '정리', detail: '배경을 지우고 종류별로 깔끔하게 정리합니다.' },
        { id: 'weather', icon: 'cloudSun', num: '02', title: '실시간 날씨', subtitle: 'GPS', detail: '지금 있는 곳의 기온과 거리를 바로 반영합니다.' },
        { id: 'avatar', icon: 'personStanding', num: '03', title: '레이어드 피팅', subtitle: '4겹+', detail: '셔츠부터 롱코트까지 여러 겹을 미리 입어봅니다.' },
        { id: 'calendar', icon: 'calendar', num: '04', title: '착용 기록', subtitle: '캘린더', detail: '날짜별로 오늘 입은 코디를 기록합니다.' },
        { id: 'cpw', icon: 'coins', num: '05', title: '가치 · 리셀', subtitle: '순환', detail: '1회 착용 비용을 보고 안 입는 옷을 바로 팝니다.' },
      ],
      exits: [
        { id: 'resale', icon: 'badgeCheck', title: '간편 판매', subtitle: '이력', detail: '사진과 구매 기록으로 바로 판매글을 올립니다.' },
        { id: 'purchase', icon: 'shoppingBag', title: '꼭 필요한 구매', subtitle: '중복 방지', detail: '옷장에 정말 없는 옷만 골라 추천합니다.' },
      ],
      nextLabel: '비즈니스',
    },
    vision: {
      eyebrow: '비즈니스',
      heading: '비즈니스 모델',
      irBadge: '서울',
      quote: '',
      roadmapTitle: '로드맵',
      milestones: [
        { id: 'stage-1', icon: 'checkCircle', phase: 'LIVE 01', status: 'done', title: '레이어드 피팅 · 내 폰 피부톤', tag: '완료', detail: '여러 겹 가상 피팅, 자동 분류, 기기 내 피부톤 분석.' },
        { id: 'stage-2', icon: 'shieldCheck', phase: 'LIVE 02', status: 'done', title: '실시간 날씨 · 세탁 지도 · 즉시 삭제', tag: '완료', detail: '내 위치 날씨·거리 배경, 주변 세탁소 찾기, 탈퇴 시 즉시 삭제.' },
        { id: 'stage-3', icon: 'rocket', phase: '예정', status: 'active', title: '택 스캔 · 캘린더 · 방문 수거 · 리셀', tag: '예정', detail: '세탁 택 스캔, 코디 캘린더, 문 앞 세탁 수거, 간편 중고 판매.' },
      ],
      moatsTitle: '강점',
      moats: [
        { id: 'mvp', icon: 'smartphone', title: '웹·모바일', tag: 'LIVE', detail: '웹·iOS·Android 동시 지원.' },
        { id: 'layer360', icon: 'layers', title: '다중 레이어드', tag: '4겹+', detail: '셔츠부터 롱코트까지 겹쳐 입기.' },
        { id: 'provenance', icon: 'badgeCheck', title: '이력 인증 리셀', tag: '간편', detail: '사진·구매 기록 자동 연동.' },
        { id: 'privacy', icon: 'lock', title: '내 폰 보안', tag: '0B', detail: '얼굴 사진 외부 전송 없음.' },
      ],
      nextToBmLabel: '비즈니스',
      revenueTitle: '비즈니스 모델',
      revenueNote: '',
      revenuePillars: [
        { id: 'pro', icon: 'crown', num: '01', title: '멤버십', mechanism: '월 구독', detail: '무제한 레이어드 피팅과 상세 옷장 가치 리포트를 제공합니다.' },
        { id: 'affiliate', icon: 'shoppingBag', num: '02', title: '맞춤 추천', mechanism: '제휴', detail: '내 옷장과 겹치지 않고 꼭 필요한 아이템만 골라 추천합니다.' },
        { id: 'resale-bm', icon: 'badgeCheck', num: '03', title: '인증 리셀', mechanism: '수수료', detail: '구매 기록과 사진이 검증된 안심 중고 거래를 연결합니다.' },
      ],
      backToMissionLabel: '여정',
      founderRole: '창업자',
      hqLabel: '거점',
      hqValue: '서울',
      domainLabel: '웹',
      stackSummaryLabel: '핵심',
      stackSummaryValue: '3D 옷장 · 리셀',
      directCta: '창업자 메일',
    },
    footer: {
      rights: '© 2026 Ainvtry. All rights reserved.',
      privacy: '개인정보처리방침',
      terms: '이용약관',
    },
    legal: {
      closeLabel: '안내 닫기',
      updatedAt: '시행일 2026년 11월 23일 · ainvtry.com',
      privacyTitle: '개인정보처리방침',
      privacySections: [
        {
          heading: '1. 온디바이스 생체 처리 및 페이스 메모리 볼트 원칙',
          body: 'Ainvtry(iNVTRY)는 안면 피부톤 랜드마크 분석을 사용자 기기 내 클라이언트 MediaPipe WebAssembly에서만 수행하며 보정된 페이스 메모리는 로컬 IndexedDB에만 격리 저장합니다. 피부톤 보정 목적의 안면 카메라 원본 프레임은 외부 서버로 전송되거나 저장되지 않습니다 (외부 전송 0 Bytes).',
        },
        {
          heading: '2. OAuth 토큰 관리 및 스토리지 접근 권한 분리',
          body: 'Apple · Google OAuth 로그인 시 서버가 OIDC 서명을 직접 검증하며 외부 IdP Access/Refresh 토큰은 저장하지 않고 미검증 이메일 자동 병합을 금지합니다. 내부 세션은 HttpOnly 쿠키와 Rate Limit으로 보호되며, 모든 옷장 API 및 파일 스토리지는 사용자별 테넌트 권한 검증으로 타 계정 접근을 원천 차단합니다.',
        },
        {
          heading: '3. 제3자 AI API 비식별화 · 무학습 추론 및 보유기간',
          body: '의류 이미지는 클라이언트에서 크롭 · 배경 분리 및 WebP 재인코딩을 거쳐 EXIF/GPS 메타데이터와 생활 배경을 제거한 뒤 전송됩니다. AI 프롬프트에서 성명 · 이메일 등 직접 식별자(PII)를 완전 배제하고, 모델 재학습 미사용(No-Training) 유료 Vertex AI / Gemini 경로로 처리한 뒤 전송 페이로드는 응답 직후 즉시 파기합니다. 지도 미디어는 영구 DB에 저장하지 않습니다.',
        },
        {
          heading: '4. 원스톱 즉시 영구 파기 및 개인정보 보호 문의',
          body: '사용자는 계정 설정에서 언제든 회원 탈퇴를 실행해 계정 · 활성 세션 · 옷장 DB · 업로드 이미지 · 임시 VTON 캐시 및 로컬 IndexedDB 볼트까지 즉시 영구 파기할 수 있습니다. 개인정보 관련 문의는 창업자 공식 이메일(raymond@ainvtry.com)로 연락해 주시기 바랍니다.',
        },
      ],
      termsTitle: '이용약관',
      termsSections: [
        {
          heading: '1. 서비스 범위',
          body: 'Ainvtry(ainvtry.com, 제품명 A inventory)는 3D 디지털 옷장 관리, 의류 자동 분류, 멀티앵글 가상 피팅, 세탁 케어 안내, 날씨 · 장소 맞춤 코디 계획 및 구매 이력 기반 정품 인증 리셀 연동 기능을 제공합니다.',
        },
        {
          heading: '2. 사용자 콘텐츠 소유권',
          body: '사용자가 등록한 모든 의류 사진, 코디 기록, 구매 이력의 소유권은 전적으로 사용자에게 있습니다. Ainvtry는 사용자가 요청한 기능을 처리하고 표시하는 데 필요한 제한적 기술 권한만 사용합니다.',
        },
        {
          heading: '3. 미리보기 및 세탁 안내 참고 기준',
          body: '가상 피팅 이미지, 코디 설명, 세탁 케어 안내는 의사결정을 돕기 위한 참고 자료이며, 브랜드별 실제 의류 치수나 제조사 세탁 라벨을 대체하지 않습니다.',
        },
        {
          heading: '4. 운영자 정보',
          body: '운영: Ainvtry (창업자 Raymond Moon, 대한민국 서울). 문의: raymond@ainvtry.com.',
        },
      ],
    },
  },
};
