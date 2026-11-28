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

export const SITE_IR_DECK_HREF = '/ir/';

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
  'WEBP -96%',
  'HTTP/3 EDGE',
  'GZIP API',
  '21-BONE 3D',
  'LOCAL-FIRST',
  '360+ TESTS',
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

export interface SitePainPoint {
  readonly id: string;
  readonly icon: SiteIconKey;
  readonly code: string;
  readonly metric: string;
  readonly title: string;
  readonly detail: string;
}

export interface SiteBusinessModelSummary {
  readonly eyebrow: string;
  readonly headline: string;
  readonly funnelTitle: string;
  readonly funnelSteps: readonly {
    readonly step: string;
    readonly label: string;
    readonly value: string;
  }[];
  readonly costTitle: string;
  readonly marginValue: string;
  readonly marginLabel: string;
  readonly costDefenses: readonly {
    readonly title: string;
    readonly metric: string;
    readonly detail: string;
  }[];
  readonly footnote: string;
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
    readonly benchFitting: string;
    readonly benchCare: string;
    readonly aboutJourney: string;
    readonly aboutMission: string;
    readonly aboutFounder: string;
    readonly aboutConnect: string;
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
    readonly proofTabVton: string;
    readonly proofTabExif: string;
    readonly proofBadgeVton: string;
    readonly proofBadgeExif: string;
    readonly proofInputLabel: string;
    readonly proofOutputLabel: string;
    readonly proofFooterCta: string;
    readonly proofMetrics: readonly {
      readonly value: string;
      readonly label: string;
    }[];
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
  readonly painPoints: {
    readonly eyebrow: string;
    readonly heading: string;
    readonly bottleneckTitle: string;
    readonly bottleneckDetail: string;
    readonly items: readonly SitePainPoint[];
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
    readonly businessModel: SiteBusinessModelSummary;
    readonly faqTitle: string;
    readonly faqs: readonly {
      readonly id: string;
      readonly question: string;
      readonly answer: string;
    }[];
    readonly backToMissionLabel: string;
    readonly founderRole: string;
    readonly hqLabel: string;
    readonly hqValue: string;
    readonly domainLabel: string;
    readonly stackSummaryLabel: string;
    readonly stackSummaryValue: string;
    readonly directCta: string;
    readonly irDeckCta: string;
  };
  readonly footer: {
    readonly rights: string;
    readonly newsletter: string;
    readonly newsletterShort: string;
    readonly privacy: string;
    readonly terms: string;
  };
  readonly newsletter: {
    readonly kicker: string;
    readonly title: string;
    readonly subtitle: string;
    readonly inlineTitle: string;
    readonly inlineSubtitle: string;
    readonly emailLabel: string;
    readonly emailPlaceholder: string;
    readonly consentLabel: string;
    readonly submitLabel: string;
    readonly submittingLabel: string;
    readonly closeLabel: string;
    readonly privacyNote: string;
    readonly invalidEmailError: string;
    readonly consentRequiredError: string;
    readonly rateLimitedError: string;
    readonly genericError: string;
    readonly successTitle: string;
    readonly successBody: string;
    readonly alreadyTitle: string;
    readonly alreadyBody: string;
    readonly offlineTitle: string;
    readonly offlineBody: string;
    readonly mailtoFallbackCta: string;
    readonly doneCta: string;
    readonly unsubscribeCta: string;
    readonly unsubscribedNotice: string;
    readonly changeEmailCta: string;
    readonly verifyTitle: string;
    readonly verifySubtitle: string;
    readonly verifyCodeLabel: string;
    readonly verifyCodePlaceholder: string;
    readonly verifySubmitLabel: string;
    readonly verifyingLabel: string;
    readonly resendCta: string;
    readonly resendCooldownTemplate: string;
    readonly resentNotice: string;
    readonly invalidCodeError: string;
    readonly expiredCodeError: string;
    readonly attemptsExceededError: string;
    readonly deliveryNotConfiguredError: string;
    readonly verifyLinkHint: string;
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
      archMaps: 'Google API × Three.js 3D',
      benchKpi: 'Metrics',
      benchMatrix: 'Stack',
      benchFitting: 'Three.js 3D',
      benchCare: 'Care',
      aboutJourney: 'Journey',
      aboutMission: 'Pain Points',
      aboutFounder: 'Business Model',
      aboutConnect: 'Connect',
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
          caption: 'Layer shirt, knit, blazer, and long coat for today’s weather.',
          metricTag: '8 Views',
          imageAlt: 'iNVTRY multi-angle fitting view',
          locationTag: 'Seoul · Myeongdong',
          hudMetrics: [
            { label: 'Angles', value: '8 Views · 45°', emphasis: true },
            { label: 'City', value: 'Seoul · Myeongdong' },
          ],
        },
        {
          id: 'closet',
          icon: 'layoutGrid',
          tabLabel: 'Closet',
          title: 'Smart Closet',
          caption: 'Auto-sort every garment by category and track wear history and laundry care.',
          metricTag: '11 Slots',
          imageAlt: 'iNVTRY digital closet view',
          brands: ['ARKET', 'LEMAIRE', 'PATAGONIA', 'A.P.C.'],
          hudMetrics: [
            { label: 'Pieces', value: '233 ITEMS', emphasis: true },
            { label: 'Labels', value: 'ARKET · LEMAIRE' },
            { label: 'Categories', value: '11 Slots' },
          ],
        },
        {
          id: 'stats',
          icon: 'barChart',
          tabLabel: 'Stats',
          title: 'Wear Report',
          caption: 'Track cost per wear and surface unworn garments effortlessly.',
          metricTag: 'CPW',
          imageAlt: 'iNVTRY wear analytics view',
          hudMetrics: [
            { label: 'Avg / Wear', value: '₩83,000', emphasis: true },
            { label: 'Usage', value: '100% UTILIZATION', emphasis: true },
            { label: 'Total Wears', value: '3167' },
          ],
        },
        {
          id: 'profile',
          icon: 'scanFace',
          tabLabel: 'Profile',
          title: 'Body & Skin Tone',
          caption: 'Calibrated strictly on-device — never uploaded to a server.',
          metricTag: 'On-Device',
          imageAlt: 'iNVTRY skin-tone calibration view',
          modeOptions: ['Character Simulation', 'Real'],
          densityOptions: ['Minimal', 'Balanced', 'Layered'],
          hudMetrics: [
            { label: 'Face Data', value: 'Phone Only', emphasis: true },
            { label: 'Density', value: 'Minimal / Balanced / Layered' },
          ],
        },
      ],
    },
    hero: {
      kicker: 'The CyberTrunk',
      titleLead: 'Welcome to your',
      titleAccent: 'iNVTRY',
      titleTail: '',
      subtitle: 'Compare before you shop, preview for today’s weather, and turn unworn clothes into cash or donations.',
      marbleHint: 'Roll the marble or select a stage below.',
      primaryCta: 'Launch Live Studio',
      secondaryCta: 'Contact Founder',
      proofTabVton: '2D VTON',
      proofTabExif: 'EXIF -96%',
      proofBadgeVton: '8-ANGLE 2D VTON · LIVE PREVIEW',
      proofBadgeExif: 'CLIENT WEBP · EXIF 0% STRIPPED',
      proofInputLabel: 'Clean Cutout · 24 KB',
      proofOutputLabel: 'Live 8-Angle Fitting',
      proofFooterCta: 'Open Live App',
      proofMetrics: [
        { value: '582→24 KB', label: 'EXIF 0% WebP' },
        { value: '0 Bytes', label: 'Face Upload' },
        { value: '360+', label: 'Auto Tests' },
      ],
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
              label: 'Verified Resale Prep',
              tag: 'Roadmap',
              detail: 'Bundles saved photos & authentic receipts for upcoming resale.',
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
              devSpec: 'Seed asset QC · read-only demo sandbox.',
              prodSpec: 'VTON quality telemetry · catalog curation.',
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
              prodSpec: 'Multi-region CDN for Three.js 3D & shell.',
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
              devSpec: 'Express 5 · Gzip JSON · Stateless OIDC · CORS guard.',
              prodSpec: 'Cloud Run · Short JWT + strict schema guard.',
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
              label: 'Three.js · VTON',
              shortSub: '3D Fit',
              highlight: true,
              devSpec: 'Three.js 21-bone + No-Training 8-angle VTON.',
              prodSpec: 'Zero-training VTON orchestrator + PBR 3D viewport.',
            },
            {
              id: 'core-closet',
              icon: 'shirt',
              label: 'Closet',
              shortSub: '11-Slot',
              highlight: true,
              devSpec: '11-slot closet · CIELAB duplicate check · CPW.',
              prodSpec: 'Wardrobe analytics + seasonal capsule engine.',
            },
            {
              id: 'core-weather',
              icon: 'cloudSun',
              label: 'Geo Proxy',
              shortSub: 'Maps',
              highlight: true,
              devSpec: 'Weather API v1 · Places API (New) · Street View proxy.',
              prodSpec: 'Regional geo-proxy + calendar OOTD sync.',
            },
            {
              id: 'core-resale',
              icon: 'badgeCheck',
              label: 'Resale',
              shortSub: 'Verified',
              highlight: true,
              devSpec: 'Idle detector + 1-tap photo/spec export.',
              prodSpec: 'Authentic receipt-backed resale partner API.',
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
              shortSub: 'Runtime',
              devSpec: 'Structured request logs & safe JSON error envelope.',
              prodSpec: 'Cloud Logging + OpenTelemetry tracing.',
            },
            {
              id: 'shared-oss',
              icon: 'hardDrive',
              label: 'Storage',
              shortSub: '3-Zone',
              devSpec: 'Isolated media paths · magic-byte · 4MB cap.',
              prodSpec: 'GCS 3-Zone · 15m Signed URL · 24h VTON.',
            },
            {
              id: 'shared-mq',
              icon: 'workflow',
              label: 'Queue',
              shortSub: 'Async',
              devSpec: 'Streaming 8-cut VTON & idempotent retries.',
              prodSpec: 'Cloud Pub/Sub GPU jobs & dead-letter queue.',
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
              devSpec: 'sql.js WASM SQLite + atomic flush.',
              prodSpec: 'Cloud SQL PostgreSQL HA + connection pooling.',
            },
            {
              id: 'data-redis',
              icon: 'zap',
              label: 'Cache',
              shortSub: 'Redis',
              devSpec: '20–30m TTL spatial weather & styling cache.',
              prodSpec: 'Memorystore Redis HA sub-ms cache.',
            },
            {
              id: 'data-gpu',
              icon: 'server',
              label: 'GPU',
              shortSub: 'L4/A100',
              devSpec: 'Vertex AI Paid inference + SwiftShader fallback.',
              prodSpec: 'Cloud Run GPU HA + NVIDIA L4 / A100 workers.',
            },
            {
              id: 'data-vault',
              icon: 'lock',
              label: 'Vault',
              shortSub: 'AES-256',
              devSpec: 'Server-only env secrets with zero client key leak.',
              prodSpec: 'Cloud KMS CMEK + VPC Service Controls.',
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
          devSpec: 'PII-masked audit logs + verify:secrets · console gate.',
          prodSpec: 'Tamper-evident WORM audit + SIEM anomaly alerts.',
        },
        {
          id: 'gov-rbac',
          icon: 'userCheck',
          label: 'RBAC',
          shortSub: 'Tenant',
          devSpec: 'Menu/button RBAC matrix + resolveAuthorizedClosets IDOR guard.',
          prodSpec: 'Least-privilege IAM policy engine + continuous pentest.',
        },
        {
          id: 'gov-cicd',
          icon: 'gitBranch',
          label: 'CI / CD',
          shortSub: 'Gate',
          devSpec: 'oxlint · TS strict · Vite verify + 360+ automated tests.',
          prodSpec: 'EXIF / SBOM CI gate + progressive canary rollout.',
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
          devStatus: 'resolveAuthorizedClosets guard, magic-byte check, CSP.',
          prodTarget: 'GCS 3-Zone · 15m Signed URL · CMEK.',
          retention: 'VTON scratch expires in 24h.',
        },
        {
          id: 'exif',
          icon: 'trash',
          code: '04',
          shortLabel: 'EXIF Wipe',
          title: 'EXIF & 1-Tap Erase',
          statusTag: 'LIVE',
          devStatus: 'Strips GPS/EXIF · No-Training · DELETE /api/auth/account.',
          prodTarget: 'VPC Service Controls + CI PII gate.',
          retention: '0-day AI payload · Atomic account erase.',
        },
      ],
      mapsEyebrow: 'APIs',
      mapsHeading: 'Google API × Three.js 3D',
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
          apiName: 'Weather API v1',
          status: 'live',
          statusLabel: 'LIVE',
          role: 'Three.js 3D',
          theaterHeadline: 'Live Weather × Three.js 3D',
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
          coordinates: '37.54°N · 127.00°E',
          sceneChips: ['City Preview'],
        },
        {
          id: 'places',
          icon: 'mapPin',
          code: '03',
          apiName: 'Places API (New)',
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
          apiName: 'Google Calendar',
          status: 'todo',
          statusLabel: 'TO-DO',
          role: 'OOTD',
          theaterHeadline: 'Calendar & SNS',
          theaterTelemetry: 'TO-DO',
          detail: 'Save daily looks to Google Calendar & auto-tag SNS items.',
          compliance: 'TO-DO',
          sceneChips: ['Calendar'],
        },
      ],
    },
    interactive: {
      stanceIdle: 'Stand',
      stanceWalk: 'Walk',
      stanceRain: 'Rain',
      poseTelemetry: {
        stand: {
          id: 'stand',
          label: 'Stand',
          bone: STUDIO_POSE_TELEMETRY.stand.bone,
          drape: STUDIO_POSE_TELEMETRY.stand.drape,
          summary: 'Clean silhouette & coat length.',
        },
        walk: {
          id: 'walk',
          label: 'Walk',
          bone: STUDIO_POSE_TELEMETRY.walk.bone,
          drape: STUDIO_POSE_TELEMETRY.walk.drape,
          summary: 'Natural stride & hem flow.',
        },
        rain: {
          id: 'rain',
          label: 'Rain',
          bone: STUDIO_POSE_TELEMETRY.rain.bone,
          drape: STUDIO_POSE_TELEMETRY.rain.drape,
          summary: 'Umbrella grip & shoulder drape.',
        },
      },
      pccsNote: 'PCCS 12-Tone · MST-04',
      beforeLabel: 'Original',
      afterLabel: 'WebP',
      sliderHint: 'Compare original and WebP cutout',
      ingestionBadge: 'EXIF Stripped',
      ingestionMeta: '582 KB → 24 KB WebP (-96%)',
      cpwLabel: 'Cost / Wear',
      cpwValue: '₩14,200',
      cpwDelta: '-18% MoM',
      balanceLabel: 'Utilization',
      balanceValue: '98.4%',
      balanceMeta: '0 bleed conflicts',
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
      heading: 'Engineering Specs',
      note: 'Architecture-mapped',
      heroKpis: [
        {
          id: 'webp',
          icon: 'imageMinus',
          value: '582→24 KB',
          label: 'WebP -96%',
          detail: 'Client-side alpha WebP compression cuts transfer payload by 96%.',
        },
        {
          id: 'rig3d',
          icon: 'box',
          value: '21-Bone',
          label: 'Three.js 3D Rig',
          detail: '21 bones, 28 body morphs, SpringBone cloth & 8-angle 45° rig.',
        },
        {
          id: 'tests',
          icon: 'checkCircle',
          value: '360+',
          label: 'Auto Tests',
          detail: '55+ unit, API, RBAC & mobile WebGL E2E test suites.',
        },
        {
          id: 'apis',
          icon: 'cloud',
          value: '4 APIs',
          label: 'Google Cloud',
          detail: 'Vertex AI, Weather API v1, Places API (New), Street View.',
        },
      ],
      benchmarkTitle: 'Runtime Specs',
      specs: [
        {
          id: 'webp',
          icon: 'imageMinus',
          shortLabel: 'WEBP -96%',
          label: 'Image Pipeline',
          valueText: '582→24 KB',
          detail: 'Client alpha WebP resizing & EXIF strip cut bandwidth 96%.',
        },
        {
          id: 'edge',
          icon: 'zap',
          shortLabel: 'HTTP/3 EDGE',
          label: 'Edge Delivery',
          valueText: 'Brotli · WebP',
          detail: 'Vite 8 chunk splitting with immutable edge cache headers.',
        },
        {
          id: 'rig3d',
          icon: 'box',
          shortLabel: '21-BONE 3D',
          label: 'Three.js 3D Rig',
          valueText: '21-Bone · 8-Cut',
          detail: '21 bones, 28 morphs, SpringBone cloth, 11 slots & 8 cuts.',
        },
        {
          id: 'qa',
          icon: 'checkCircle',
          shortLabel: '360+ TESTS',
          label: 'QA Gate',
          valueText: '55+ Suites',
          detail: 'oxlint, strict TS 7, RBAC API & mobile WebGL Playwright E2E.',
        },
      ],
      pillarLabels: [...SPECS_3D_PILLAR_LABELS],
      pillars3d: [
        {
          index: 0,
          label: 'WEBP -96%',
          value: '582→24 KB',
          title: '01 Client · Image Compression',
          detail: 'Compresses 582 KB originals into 24 KB alpha WebP locally (-96% bandwidth).',
          normalizedHeight: 0.96,
        },
        {
          index: 1,
          label: 'HTTP/3 EDGE',
          value: 'HTTP/3 · Brotli',
          title: '02 Edge · Static Delivery',
          detail: 'Vite 8 ESM code splitting, immutable asset hashing & Cloudflare Workers POPs.',
          normalizedHeight: 0.78,
        },
        {
          index: 2,
          label: 'GZIP API',
          value: 'Express 5 · Gzip',
          title: '03 Gateway · API Runtime',
          detail: 'JSON Gzip compression middleware, strict payload schema guards & rate limits.',
          normalizedHeight: 0.72,
        },
        {
          index: 3,
          label: '21-BONE 3D',
          value: '21-Bone · 28 Morph',
          title: '04 Core · Three.js 3D Rig',
          detail: 'Three.js 0.187 WebGL2 skeletal motion, SpringBone physics & 8-angle 45° VTON.',
          normalizedHeight: 0.88,
        },
        {
          index: 4,
          label: 'LOCAL-FIRST',
          value: 'IndexedDB + SQL',
          title: '05/06 Data · Offline-First Sync',
          detail: 'IndexedDB optimistic local queue, atomic sql.js flush & 20m TTL weather cache.',
          normalizedHeight: 0.82,
        },
        {
          index: 5,
          label: '360+ TESTS',
          value: '360+ · 55 Suites',
          title: '07 Governance · Automated QA',
          detail: 'oxlint, TS 7 strict & 55+ unit, API, RBAC & mobile WebGL Playwright E2E suites.',
          normalizedHeight: 0.92,
        },
      ],
      cards: [
        {
          id: 'runtime',
          icon: 'globe',
          eyebrow: '01 Client',
          metric: 'React 19 · TS 7',
          title: 'Web SPA & Bundler',
          detail: 'React 19, TypeScript 7 strict, Vite 8 ESM code splitting & post-paint priority.',
          boundary: 'Client',
        },
        {
          id: 'mobile',
          icon: 'smartphone',
          eyebrow: '01/02 Hybrid',
          metric: 'Capacitor 8',
          title: 'iOS · Android · Edge',
          detail: 'Single web codebase wrapped for iOS & Android with haptics, camera & HTTP/3.',
          boundary: 'Hybrid',
        },
        {
          id: 'backend',
          icon: 'server',
          eyebrow: '03/06 Server',
          metric: 'Express 5 · SQL',
          title: 'Gzip API & Storage',
          detail: 'Express 5 Gzip JSON API, sql.js WASM SQLite / Cloud SQL PG & IndexedDB sync.',
          boundary: 'API/DB',
        },
        {
          id: 'three',
          icon: 'box',
          eyebrow: '04 Core 3D',
          metric: 'Three.js 0.187',
          title: 'WebGL2 Motion Engine',
          detail: '21-bone rig, SpringBone cloth, 28 body morphs & SwiftShader recovery fallback.',
          boundary: 'WebGL2',
        },
        {
          id: 'ai',
          icon: 'sparkles',
          eyebrow: '04/06 Compute',
          metric: 'Enterprise AI',
          title: '8-Angle VTON Pipeline',
          detail: 'Paid-tier 2K layered synthesis, angle QC & 11-slot garment metadata tagging.',
          boundary: '0-Day',
        },
        {
          id: 'maps',
          icon: 'mapPin',
          eyebrow: '04 Geo APIs',
          metric: 'Google Maps',
          title: 'Weather · Places · Street',
          detail: 'Weather API v1, Places API (New) FieldMask & proxied zero-cache Street View.',
          boundary: 'Proxy',
        },
      ],
    },
    journey: {
      badge: '6-Cut AI Cycle',
      autoPlayLabel: 'Auto',
      pausePlayLabel: 'Pause',
      prevLabel: 'Previous',
      nextCutLabel: 'Next',
      nextStepLabel: 'Pain Points',
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
          speechBubble: '“2 similar coats already owned.”',
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
          speechBubble: '“Snap to sort, scan model code.”',
          apiChips: ['Auto Sort'],
          detail: 'Auto-sort photos (LIVE) · Tag & model code lookup (TO-DO).',
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
          speechBubble: '“Rain ahead — preview my coat.”',
          apiChips: ['Weather'],
          detail: '8-cut layered fit on your real street.',
        },
        {
          id: 'share',
          num: '04',
          icon: 'share2',
          shortTitle: 'Calendar',
          title: 'Calendar & SNS',
          status: 'todo',
          statusLabel: 'TO-DO',
          shortStatusLabel: 'TO-DO',
          imageSrc: '/assets/journey/clay-cut-04-v1.webp',
          imageAlt: 'Saving an outfit to a calendar lookbook',
          speechBubble: '“Log look & auto-tag pieces.”',
          apiChips: ['Calendar'],
          detail: 'Google Calendar lookbook & SNS item tags (TO-DO).',
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
          detail: 'Nearby care map (LIVE) · Doorstep pickup (TO-DO).',
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
          detail: 'Idle alerts (LIVE) · Authentic receipt resale (TO-DO).',
        },
      ],
    },
    painPoints: {
      eyebrow: '6 Disconnected Silos',
      heading: '6 Fragmented Pain Points Across Fashion Consumption',
      bottleneckTitle: 'Core Bottleneck: 6 Siloed Apps → 0 Daily Retention',
      bottleneckDetail:
        'Closet, fitting, weather, laundry, and resale apps break data continuity so none earn daily habit — unified inside one Privacy-First Wardrobe OS.',
      items: [
        {
          id: 'pain-dup',
          icon: 'shoppingBag',
          code: 'PAIN 01',
          metric: '70%+ Idle',
          title: 'Memory-Driven Duplicate Buying',
          detail: 'Without real-time closet visibility, shoppers repeatedly buy near-identical garments in stores.',
        },
        {
          id: 'pain-return',
          icon: 'box',
          code: 'PAIN 02',
          metric: '$743B Loss',
          title: 'Online Returns From Unverified Fit',
          detail: 'Cannot verify silhouette or color harmony against owned pants & outerwear beforehand (Mordor 2026).',
        },
        {
          id: 'pain-layer',
          icon: 'layers',
          code: 'PAIN 03',
          metric: '1-Piece Front',
          title: 'No Layered or Multi-Angle Fitting',
          detail: 'Legacy AI stops at single-piece front swaps, failing real 4+ layer outdoor styling.',
        },
        {
          id: 'pain-tpo',
          icon: 'cloudRain',
          code: 'PAIN 04',
          metric: '4 Siloed Apps',
          title: 'Styling Split From Weather & TPO',
          detail: 'Weather, maps, calendar, and closet apps stay disconnected, compounding morning decision fatigue.',
        },
        {
          id: 'pain-privacy',
          icon: 'lock',
          code: 'PAIN 05',
          metric: 'Raw Upload Risk',
          title: 'Face, GPS & Home Privacy Anxiety',
          detail: 'Selfies and EXIF location metadata risk exposure to external servers and free AI model training.',
        },
        {
          id: 'pain-resale',
          icon: 'refreshCw',
          code: 'PAIN 06',
          metric: 'Frozen Assets',
          title: 'Laundry Neglect & Resale Friction',
          detail: 'Re-shooting, measuring, and proving authenticity keep unworn clothes trapped in the closet.',
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
        { id: 'resale', icon: 'badgeCheck', num: '03', title: 'Resale', tag: 'TO-DO', detail: 'Authentic receipt resale roadmap.' },
      ],
      centerKicker: 'iNVTRY LOOP',
      centerTitle: 'iNVTRY Loop',
      centerSub: 'Circular Closet',
      autoPlayLabel: 'Auto',
      pausePlayLabel: 'Pause',
      loopNodes: [
        { id: 'closet', icon: 'shirt', num: '01', title: 'Closet', subtitle: 'Sort', detail: 'Auto-sorted studio photos.' },
        { id: 'weather', icon: 'cloudSun', num: '02', title: 'Weather', subtitle: 'City', detail: 'Live local street & weather.' },
        { id: 'avatar', icon: 'personStanding', num: '03', title: '8-Cut Fit', subtitle: 'Layers', detail: '4+ layers across 8 angles.' },
        { id: 'calendar', icon: 'calendar', num: '04', title: 'Calendar', subtitle: 'Log', detail: 'Daily outfit wear logs.' },
        { id: 'cpw', icon: 'coins', num: '05', title: 'Value', subtitle: 'CPW', detail: 'Cost per wear & idle alerts.' },
      ],
      exits: [
        { id: 'resale', icon: 'badgeCheck', title: 'Verified Resale', subtitle: 'TO-DO', detail: 'Idle alerts (LIVE) & receipt resale.' },
        { id: 'purchase', icon: 'shoppingBag', title: 'Gap Shopping', subtitle: 'No dupes', detail: 'Buy only missing layers.' },
      ],
      nextLabel: 'Business Model',
    },
    vision: {
      eyebrow: 'Business Model',
      heading: '4-Layer Revenue Engine',
      irBadge: 'Seoul',
      quote: '',
      roadmapTitle: 'Roadmap',
      milestones: [
        { id: 'stage-1', icon: 'checkCircle', phase: 'LIVE 01', status: 'done', title: '8-Cut Fit & Local Tone', tag: 'LIVE', detail: '8-cut layers, auto-sort, 0B skin tone.' },
        { id: 'stage-2', icon: 'shieldCheck', phase: 'LIVE 02', status: 'done', title: 'Weather · Care Map · Wipe', tag: 'LIVE', detail: 'Local weather, care map, 1-tap erase.' },
        { id: 'stage-3', icon: 'rocket', phase: 'TO-DO', status: 'active', title: 'Tag · Calendar · Resale', tag: 'TO-DO', detail: 'Model code scan, Calendar, pickup, Authentic resale.' },
      ],
      moatsTitle: 'Strengths',
      moats: [
        { id: 'mvp', icon: 'smartphone', title: 'Cross-Platform', tag: 'LIVE', detail: 'Web, iOS, Android.' },
        { id: 'layer360', icon: 'layers', title: '8-Cut Layers', tag: '4+', detail: 'Deep coat layering.' },
        { id: 'provenance', icon: 'badgeCheck', title: 'Authentic Resale', tag: 'TO-DO', detail: 'Receipt-backed resale roadmap.' },
        { id: 'privacy', icon: 'lock', title: 'Privacy First', tag: '0B', detail: 'On-device biometrics.' },
      ],
      nextToBmLabel: 'Business Model',
      revenueTitle: '4-Layer Business Model',
      revenueNote: 'High-level overview · Full pricing & unit economics are available in the Investor Data Room',
      revenuePillars: [
        {
          id: 'pro',
          icon: 'crown',
          num: '01',
          title: 'iNVTRY Pro Subscription',
          mechanism: 'Pro Tier · Private Beta',
          detail:
            'Expanded multi-layer 8-angle fitting, real street weather staging, wear-value analytics, and upcoming garment care intelligence.',
        },
        {
          id: 'affiliate',
          icon: 'shoppingBag',
          num: '02',
          title: 'Gap Commerce',
          mechanism: 'Partner Commerce',
          detail:
            'Detects genuine wardrobe gaps, verifies layering harmony against owned garments, and routes high-intent demand to select brand partners.',
        },
        {
          id: 'resale-bm',
          icon: 'badgeCheck',
          num: '03',
          title: 'Authentic Resale & Care O2O',
          mechanism: 'Resale · Care O2O',
          detail:
            'Pairs LIVE idle-garment alerts with upcoming purchase-verified authentic resale listings and doorstep garment care partnerships.',
        },
        {
          id: 'b2b-sdk',
          icon: 'server',
          num: '04',
          title: 'Brand VTON SDK',
          mechanism: 'B2B Enterprise',
          detail:
            'Enables fashion houses and retail partners to onboard digital garment seeds and embed virtual try-on previews across storefronts.',
        },
      ],
      businessModel: {
        eyebrow: 'CIRCULAR WARDROBE ECOSYSTEM',
        headline: 'Subscription × Gap Commerce × Authentic Resale × B2B SDK',
        funnelTitle: 'Circular Lifecycle Flywheel',
        funnelSteps: [
          { step: '01', label: 'Local Onboarding', value: 'On-Device' },
          { step: '02', label: 'Active Wardrobe', value: 'Daily Habit' },
          { step: '03', label: 'Pro & Gap Fit', value: 'Subscription' },
          { step: '04', label: 'Circular Resale', value: 'Ecosystem' },
        ],
        costTitle: '3-Layer Architecture Efficiency',
        marginValue: 'IR Brief',
        marginLabel: 'Unit Economics',
        costDefenses: [
          {
            title: 'On-Device WASM Inference',
            metric: 'Client-First',
            detail: 'Garment cutout, EXIF strip & skin-tone analysis run locally on client devices to minimize server compute overhead.',
          },
          {
            title: 'WebP Payload Compression',
            metric: '582→24 KB',
            detail: 'Reduces image transfer size with local IndexedDB caching for responsive multi-device browsing.',
          },
          {
            title: 'Outfit Hash Cache & Quotas',
            metric: 'Smart Cache',
            detail: 'Reuses cached multi-angle outfit renders across revisits with disciplined per-tier usage quotas.',
          },
        ],
        footnote: '* Detailed pricing, take rates, and unit economics are unlocked after investor passcode verification below.',
      },
      faqTitle: 'FAQ',
      faqs: [
        {
          id: 'faq-privacy',
          question: 'Are face photos ever uploaded?',
          answer: 'Never. MediaPipe WASM analyzes skin tone locally in RAM (0B uploaded), and garments are WebP-stripped of EXIF/GPS before inference.',
        },
        {
          id: 'faq-vton',
          question: 'How does 2D VTON differ from Three.js 3D?',
          answer: 'Photorealistic 4+ layer fitting runs via 8-angle 2D VTON, while Three.js 3D powers interactive garment motion and live weather previews.',
        },
        {
          id: 'faq-platform',
          question: 'Which platforms are supported?',
          answer: 'Web, iOS, and Android run from one React 19 + Capacitor 8 codebase with IndexedDB offline-first wardrobe storage.',
        },
        {
          id: 'faq-partner',
          question: 'Can fashion brands or investors pilot iNVTRY?',
          answer: 'Yes. Reach out directly via raymond@ainvtry.com for private beta access, B2B SDK pilots, or IR materials.',
        },
      ],
      backToMissionLabel: 'Journey',
      founderRole: 'Founder',
      hqLabel: 'Location',
      hqValue: 'Seoul',
      domainLabel: 'Web',
      stackSummaryLabel: 'Focus',
      stackSummaryValue: 'Digital Closet · Resale',
      directCta: 'Email Raymond',
      irDeckCta: 'Business Plan',
    },
    footer: {
      rights: '© 2026 Ainvtry. All rights reserved.',
      newsletter: 'Newsletter',
      newsletterShort: 'Updates',
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
    },
    newsletter: {
      kicker: 'PRIVATE UPDATES',
      title: 'Get the iNVTRY Newsletter',
      subtitle: 'Receive private beta invites, 8-angle fitting drops, and release notes directly from Seoul.',
      inlineTitle: 'Newsletter',
      inlineSubtitle: 'Private beta access & product release notes.',
      emailLabel: 'Email address',
      emailPlaceholder: 'you@domain.com',
      consentLabel: 'I agree to receive occasional Ainvtry email updates and know I can unsubscribe anytime.',
      submitLabel: 'Send Verification Code',
      submittingLabel: 'Sending code…',
      closeLabel: 'Close newsletter dialog',
      privacyNote: 'Zero spam · Email verification required · Unsubscribe in one click.',
      invalidEmailError: 'Please enter a valid email address.',
      consentRequiredError: 'Please confirm email update consent before subscribing.',
      rateLimitedError: 'Too many requests. Please try again in a few minutes.',
      genericError: 'Could not complete your request. Please try again.',
      successTitle: 'Email verified & subscribed',
      successBody: 'Your email ownership is confirmed. We will send private beta invites and release notes here.',
      alreadyTitle: 'Already subscribed',
      alreadyBody: 'This email is already verified and registered for Ainvtry updates.',
      offlineTitle: 'Saved on this device',
      offlineBody: 'The subscription server is currently unreachable. Retry when online or confirm directly via email below.',
      mailtoFallbackCta: 'Send Confirmation Email',
      doneCta: 'Done',
      unsubscribeCta: 'Unsubscribe',
      unsubscribedNotice: 'Your email has been unsubscribed from Ainvtry updates.',
      changeEmailCta: 'Use another email',
      verifyTitle: 'Verify your email address',
      verifySubtitle: 'We sent a 6-digit verification code and one-click link to this inbox. Valid for 10 minutes.',
      verifyCodeLabel: '6-digit verification code',
      verifyCodePlaceholder: '000000',
      verifySubmitLabel: 'Verify & Subscribe',
      verifyingLabel: 'Verifying…',
      resendCta: 'Resend code',
      resendCooldownTemplate: 'Resend in {sec}s',
      resentNotice: 'A new 6-digit verification code has been sent to your inbox.',
      invalidCodeError: 'The 6-digit code does not match. Please check and try again.',
      expiredCodeError: 'Your verification code expired. Tap resend for a fresh code.',
      attemptsExceededError: 'Too many incorrect attempts. Please request a new verification code.',
      deliveryNotConfiguredError: 'Email verification delivery (RESEND_API_KEY) is not configured on the server yet.',
      verifyLinkHint: 'Or tap the verification link inside the email to confirm automatically.',
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
          body: 'Raw facial photos are never uploaded (0 bytes transmitted). Only garment photos requested for virtual try-on are cropped, background-separated, and WebP re-encoded on-device to strip EXIF/GPS and room backgrounds before encrypted server-proxied Paid Enterprise AI (No-Training) inference. Direct PII (name, email, address) is excluded from AI payloads, images are never used for model training, and inference payloads are discarded immediately after response. Google Maps media is never cached in permanent DB.',
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
          body: 'Ainvtry (ainvtry.com, product: A inventory) provides digital wardrobe management, garment classification, multi-angle virtual try-on previews, Three.js 3D motion staging, garment care guidance, weather/TPO outfit planning, and purchase-verified resale preparation tools.',
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
      opacityHint: '위로 드래그하면 투명도가 높아지고, 아래로 내리면 낮아집니다',
    },
    subtabs: {
      studioPreview: '앱',
      studioAtelier: '피팅',
      studioIntel: '케어',
      archBlueprint: '구성도',
      archPrivacy: '보안',
      archMaps: 'Google API × Three.js 3D',
      benchKpi: '지표',
      benchMatrix: '스택',
      benchFitting: 'Three.js 3D',
      benchCare: '케어',
      aboutJourney: '여정',
      aboutMission: '페인포인트',
      aboutFounder: '비즈니스 모델',
      aboutConnect: '소통',
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
          caption: '오늘 날씨에 맞춰 셔츠부터 롱코트까지 겹쳐 입어봅니다.',
          metricTag: '8방향',
          imageAlt: 'iNVTRY 가상 피팅 화면',
          locationTag: '서울 · 명동',
          hudMetrics: [
            { label: '보기', value: '앞 · 옆 · 뒤 8방향', emphasis: true },
            { label: '지역', value: '서울 · 명동' },
          ],
        },
        {
          id: 'closet',
          icon: 'layoutGrid',
          tabLabel: '옷장',
          title: '스마트 옷장',
          caption: '옷장 속 모든 의류를 종류별로 자동 분류하고 세탁·착용 이력까지 관리합니다.',
          metricTag: '11분류',
          imageAlt: 'iNVTRY 디지털 옷장 화면',
          brands: ['ARKET', 'LEMAIRE', 'PATAGONIA', 'A.P.C.'],
          hudMetrics: [
            { label: '보유', value: '233 ITEMS', emphasis: true },
            { label: '브랜드', value: 'ARKET · LEMAIRE' },
            { label: '분류', value: '11개 슬롯' },
          ],
        },
        {
          id: 'stats',
          icon: 'barChart',
          tabLabel: '통계',
          title: '옷장 리포트',
          caption: '1회 착용 비용과 오래 안 입은 옷을 한눈에 파악합니다.',
          metricTag: '가치',
          imageAlt: 'iNVTRY 옷장 통계 화면',
          hudMetrics: [
            { label: '1회 비용', value: '₩83,000', emphasis: true },
            { label: '활용률', value: '100% UTILIZATION', emphasis: true },
            { label: '누적 착용', value: '3167' },
          ],
        },
        {
          id: 'profile',
          icon: 'scanFace',
          tabLabel: '프로필',
          title: '내 체형 · 피부톤',
          caption: '얼굴 사진은 서버로 보내지 않고 기기 내에서만 분석합니다.',
          metricTag: '기기 보관',
          imageAlt: 'iNVTRY 피부톤 · 체형 설정 화면',
          modeOptions: ['캐릭터 시뮬레이션', '실사'],
          densityOptions: ['미니멀', '밸런스', '레이어드'],
          hudMetrics: [
            { label: '얼굴 사진', value: '기기 내 단독 보관', emphasis: true },
            { label: '밀도', value: '미니멀 / 밸런스 / 레이어드' },
          ],
        },
      ],
    },
    hero: {
      kicker: '손 안의 디지털 옷장',
      titleLead: '어서 오세요, 당신의 인벤토리에',
      titleAccent: 'iNVTRY',
      titleTail: '',
      subtitle: '쇼핑 전엔 내 옷과 비교하고, 날씨에 맞게 미리 입혀보고, 잠든 옷은 현금과 기부로.',
      marbleHint: '구슬을 굴리거나 하단 스테이지를 선택하세요.',
      primaryCta: '라이브 스튜디오 체험',
      secondaryCta: '창업자 문의',
      proofTabVton: '2D VTON',
      proofTabExif: 'EXIF -96%',
      proofBadgeVton: '8방향 2D VTON · 라이브 프리뷰',
      proofBadgeExif: '로컬 WebP · EXIF 0% 제거',
      proofInputLabel: '배경 제거 · 24 KB',
      proofOutputLabel: '실시간 8방향 피팅',
      proofFooterCta: '라이브 앱 열기',
      proofMetrics: [
        { value: '582→24 KB', label: 'EXIF 0% WebP' },
        { value: '0 Bytes', label: '얼굴 외부 전송' },
        { value: '360+', label: '자동 검증 테스트' },
      ],
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
              detail: '셔츠, 니트, 블레이저, 롱코트까지 여러 겹을 한 번에 입어봅니다.',
            },
            {
              id: 'angles',
              icon: 'rotate3d',
              label: '앞 · 옆 · 뒤 8방향',
              tag: '45°',
              detail: '45° 간격 8방향 뷰로 앞모습부터 뒤태까지 또렷하게 확인합니다.',
            },
            {
              id: 'rig',
              icon: 'move3d',
              label: '3가지 자세',
              tag: '움직임',
              detail: '서기, 걷기, 우산 자세로 움직일 때의 코트 실루엣을 미리 봅니다.',
            },
            {
              id: 'pacer',
              icon: 'gauge',
              label: '가벼운 실행',
              tag: '배터리',
              detail: '모바일에서도 매끄럽게 구동되고, 멈추면 배터리를 아낍니다.',
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
              detail: '구매가와 착용 횟수로 진짜 가치와 안 입는 옷을 찾습니다.',
            },
            {
              id: 'resale',
              icon: 'badgeCheck',
              label: '정품 인증 리셀 준비',
              tag: '로드맵',
              detail: '저장된 사진과 정품 인증 구매 기록을 묶어 향후 간편 리셀에 대비합니다.',
            },
            {
              id: 'care',
              icon: 'droplets',
              label: '세탁 가이드',
              tag: '이염 방지',
              detail: '옷감에 맞는 세탁법과 물 빠짐, 이염 위험을 미리 알려줍니다.',
            },
            {
              id: 'map',
              icon: 'mapPin',
              label: '주변 세탁 · 수선',
              tag: '내 주변',
              detail: '가까운 세탁소, 수선실, 가죽 케어 매장을 바로 찾아줍니다.',
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
              shortSub: 'QC',
              devSpec: '시드 에셋 QC · 읽기 전용 시연 샌드박스.',
              prodSpec: 'VTON 품질 텔레메트리 · 카탈로그 운영.',
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
              prodSpec: '멀티 리전 Three.js 3D · 앱 셸 CDN.',
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
              devSpec: 'Express 5 · Gzip JSON · OIDC 검증 · CORS 경계 방어.',
              prodSpec: 'Cloud Run · 단기 JWT + 엄격한 스키마 검증.',
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
              label: 'Three.js · VTON',
              shortSub: '3D 피팅',
              highlight: true,
              devSpec: 'Three.js 21관절 + 무학습 8방향 VTON.',
              prodSpec: '무학습 VTON 오케스트레이터 + PBR 3D 뷰포트.',
            },
            {
              id: 'core-closet',
              icon: 'shirt',
              label: '옷장',
              shortSub: '11슬롯',
              highlight: true,
              devSpec: '11슬롯 · CIELAB 중복 감지 · CPW.',
              prodSpec: '워드로브 분석 + 시즌 캡슐 코디 엔진.',
            },
            {
              id: 'core-weather',
              icon: 'cloudSun',
              label: '기상 · 장소',
              shortSub: '프록시',
              highlight: true,
              devSpec: 'Weather API v1 · Places API (New) · Street View 프록시.',
              prodSpec: '리전 프록시 + 캘린더 코디 일정 연동.',
            },
            {
              id: 'core-resale',
              icon: 'badgeCheck',
              label: '리셀',
              shortSub: '인증',
              highlight: true,
              devSpec: '미착용 감지 · 원탭 판매글.',
              prodSpec: '영수증 기반 정품 인증 파트너 API.',
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
              shortSub: '런타임',
              devSpec: '구조화 요청 로그 · 안전 JSON 에러 응답.',
              prodSpec: 'Cloud Logging + OpenTelemetry 트레이싱.',
            },
            {
              id: 'shared-oss',
              icon: 'hardDrive',
              label: '스토리지',
              shortSub: '3-Zone',
              devSpec: '소유자 격리 경로 · 매직바이트 · 4MB 제한.',
              prodSpec: 'GCS 3-Zone · 15분 서명 URL · 24h VTON.',
            },
            {
              id: 'shared-mq',
              icon: 'workflow',
              label: '큐',
              shortSub: '비동기',
              devSpec: '8방향 VTON 스트리밍 · 멱등 재시도.',
              prodSpec: 'Cloud Pub/Sub GPU 큐 · Dead-Letter 큐.',
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
              devSpec: 'sql.js WASM SQLite + 원자적 스냅샷 플러시.',
              prodSpec: 'Cloud SQL PostgreSQL HA + 커넥션 풀링.',
            },
            {
              id: 'data-redis',
              icon: 'zap',
              label: '캐시',
              shortSub: 'Redis',
              devSpec: '20~30분 TTL 기상 · 코디 응답 캐시.',
              prodSpec: 'Memorystore Redis HA 서브밀리초 캐시.',
            },
            {
              id: 'data-gpu',
              icon: 'server',
              label: 'GPU',
              shortSub: 'L4/A100',
              devSpec: 'Vertex AI 유료 추론 + SwiftShader 폴백.',
              prodSpec: 'Cloud Run GPU HA + NVIDIA L4 / A100 워커.',
            },
            {
              id: 'data-vault',
              icon: 'lock',
              label: '볼트',
              shortSub: 'AES-256',
              devSpec: '서버 전용 env 시크릿 격리 (클라이언트 키 0 노출).',
              prodSpec: 'Cloud KMS CMEK · VPC-SC 보안 경계.',
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
          devSpec: '비식별 감사 로그 + verify:secrets · console 훅 게이트.',
          prodSpec: '위변조 방지 WORM 감사 + SIEM 이상 경보.',
        },
        {
          id: 'gov-rbac',
          icon: 'userCheck',
          label: '권한',
          shortSub: 'IDOR',
          devSpec: '메뉴 · 버튼 RBAC 매트릭스 + resolveAuthorizedClosets 가드.',
          prodSpec: '최소 권한 IAM 정책 엔진 · 정기 모의해킹.',
        },
        {
          id: 'gov-cicd',
          icon: 'gitBranch',
          label: 'CI/CD',
          shortSub: '검증',
          devSpec: 'oxlint · TS strict · Vite verify + 360+ 자동화 테스트.',
          prodSpec: 'EXIF · SBOM CI 게이트 + 카나리 점진 배포.',
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
          prodTarget: '전 플랫폼 얼굴 원본 미전송 원칙 유지.',
          retention: '원본 즉시 휘발 · 탈퇴 시 로컬 삭제.',
        },
        {
          id: 'oidc',
          icon: 'keyRound',
          code: '02',
          shortLabel: '로그인 토큰 미저장',
          title: 'Stateless OIDC',
          statusTag: 'LIVE',
          devStatus: 'Apple/Google OIDC 검증 · 외부 토큰 미저장.',
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
          devStatus: 'resolveAuthorizedClosets 가드 · 매직바이트 검증 · CSP.',
          prodTarget: 'GCS 3-Zone · 15분 서명 URL · CMEK.',
          retention: '임시 VTON 24시간 자동 삭제.',
        },
        {
          id: 'exif',
          icon: 'trash',
          code: '04',
          shortLabel: '사진 정보 제거 · 삭제',
          title: 'EXIF 제거 · 즉시 삭제',
          statusTag: 'LIVE',
          devStatus: '위치 · EXIF 제거 · AI 무학습 · DELETE /api/auth/account 즉시 삭제.',
          prodTarget: 'VPC-SC · CI PII/EXIF 회귀 검증.',
          retention: 'AI 전송 데이터 즉시 폐기 · 탈퇴 시 전체 삭제.',
        },
      ],
      mapsEyebrow: 'API',
      mapsHeading: 'Google API × Three.js 3D',
      mapsBadge: '5 LIVE',
      mapsComplianceFooter: '키 격리 · 미디어 미저장',
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
          apiName: 'Weather API v1',
          status: 'live',
          statusLabel: 'LIVE',
          role: '기상',
          theaterHeadline: '날씨 × Three.js 3D 우산',
          theaterTelemetry: '빗방울 · 우산',
          detail: '실시간 기상 → Three.js 3D 우산 · 레이어.',
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
          theaterTelemetry: '무료 조회 · 미저장',
          detail: '무료 메타 확인 · 내 거리 피팅.',
          compliance: '미저장',
          coordinates: '37.54°N · 127.00°E',
          sceneChips: ['도시 프리뷰'],
        },
        {
          id: 'places',
          icon: 'mapPin',
          code: '03',
          apiName: 'Places API (New)',
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
          apiName: 'Google Calendar',
          status: 'todo',
          statusLabel: 'TO-DO',
          role: 'OOTD',
          theaterHeadline: '캘린더 · SNS',
          theaterTelemetry: 'TO-DO',
          detail: 'Google Calendar 코디 기록 · SNS 자동 태깅.',
          compliance: 'TO-DO',
          sceneChips: ['일정'],
        },
      ],
    },
    interactive: {
      stanceIdle: '서기',
      stanceWalk: '걷기',
      stanceRain: '우산',
      poseTelemetry: {
        stand: {
          id: 'stand',
          label: '서기',
          bone: STUDIO_POSE_TELEMETRY.stand.bone,
          drape: STUDIO_POSE_TELEMETRY.stand.drape,
          summary: '전체 실루엣 · 기장.',
        },
        walk: {
          id: 'walk',
          label: '걷기',
          bone: STUDIO_POSE_TELEMETRY.walk.bone,
          drape: STUDIO_POSE_TELEMETRY.walk.drape,
          summary: '자연스러운 보폭과 옷자락 흐름.',
        },
        rain: {
          id: 'rain',
          label: '우산',
          bone: STUDIO_POSE_TELEMETRY.rain.bone,
          drape: STUDIO_POSE_TELEMETRY.rain.drape,
          summary: '우산을 들었을 때의 어깨선과 핏.',
        },
      },
      pccsNote: 'PCCS 12톤 · MST-04',
      beforeLabel: '원본',
      afterLabel: 'WebP',
      sliderHint: '원본과 배경 제거 WebP 비교',
      ingestionBadge: 'EXIF 제거',
      ingestionMeta: '582 KB → 24 KB WebP (-96%)',
      cpwLabel: '1회 착용 비용',
      cpwValue: '₩14,200',
      cpwDelta: '전월 대비 -18%',
      balanceLabel: '옷장 활용률',
      balanceValue: '98.4%',
      balanceMeta: '이염 충돌 0건',
      dupTitle: '주변 세탁 · 수선',
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
      heading: '엔지니어링 스펙',
      note: '아키텍처 계층별 실측',
      heroKpis: [
        {
          id: 'webp',
          icon: 'imageMinus',
          value: '582→24 KB',
          label: 'WebP -96%',
          detail: '기기 내 알파 WebP 변환으로 전송 용량을 96% 절감합니다.',
        },
        {
          id: 'rig3d',
          icon: 'box',
          value: '21관절',
          label: 'Three.js 3D 리그',
          detail: '21관절 · 28종 체형 모프 · SpringBone 물리 · 8방향 45° 회전.',
        },
        {
          id: 'tests',
          icon: 'checkCircle',
          value: '360+',
          label: '자동 테스트',
          detail: '55개 이상의 단위 · API · RBAC · 모바일 WebGL E2E 테스트 스위트.',
        },
        {
          id: 'apis',
          icon: 'cloud',
          value: '4 APIs',
          label: 'Google Cloud',
          detail: 'Vertex AI · Weather API v1 · Places API (New) · Street View.',
        },
      ],
      benchmarkTitle: '런타임 규격',
      specs: [
        {
          id: 'webp',
          icon: 'imageMinus',
          shortLabel: 'WEBP -96%',
          label: '이미지 경량 파이프라인',
          valueText: '582→24 KB',
          detail: '로컬 알파 WebP 변환과 EXIF 제거로 전송 대역폭을 96% 절감합니다.',
        },
        {
          id: 'edge',
          icon: 'zap',
          shortLabel: 'HTTP/3 EDGE',
          label: '엣지 전송 규격',
          valueText: 'Brotli · WebP',
          detail: 'Vite 8 코드 스플리팅과 불변 해시 엣지 캐시 헤더.',
        },
        {
          id: 'rig3d',
          icon: 'box',
          shortLabel: '21-BONE 3D',
          label: 'Three.js 3D 리그',
          valueText: '21관절 · 8방향',
          detail: '21관절 · 28모프 · SpringBone 물리 · 11슬롯 · 8방향 회전.',
        },
        {
          id: 'qa',
          icon: 'checkCircle',
          shortLabel: '360+ TESTS',
          label: '자동 검증 게이트',
          valueText: '55+ 스위트',
          detail: 'oxlint · TS 7 strict · RBAC API · 모바일 WebGL Playwright E2E.',
        },
      ],
      pillarLabels: [...SPECS_3D_PILLAR_LABELS],
      pillars3d: [
        {
          index: 0,
          label: 'WEBP -96%',
          value: '582→24 KB',
          title: '01 클라이언트 · 이미지 경량화',
          detail: '582 KB 원본을 기기 내 24 KB 알파 WebP로 압축해 전송 용량을 96% 절감합니다.',
          normalizedHeight: 0.96,
        },
        {
          index: 1,
          label: 'HTTP/3 EDGE',
          value: 'HTTP/3 · Brotli',
          title: '02 엣지 · 정적 전송 규격',
          detail: 'Vite 8 ESM 코드 스플리팅, 불변 해시 캐시 및 Cloudflare Workers 글로벌 전송.',
          normalizedHeight: 0.78,
        },
        {
          index: 2,
          label: 'GZIP API',
          value: 'Express 5 · Gzip',
          title: '03 게이트웨이 · API 런타임',
          detail: 'JSON Gzip 응답 압축 미들웨어, 엄격한 스키마 경계 검증 및 라우트 레이트 리밋.',
          normalizedHeight: 0.72,
        },
        {
          index: 3,
          label: '21-BONE 3D',
          value: '21관절 · 28모프',
          title: '04 코어 · Three.js 3D 리그',
          detail: 'Three.js 0.187 WebGL2 스켈레탈 모션, SpringBone 의류 물리 및 8방향 45° 피팅.',
          normalizedHeight: 0.88,
        },
        {
          index: 4,
          label: 'LOCAL-FIRST',
          value: 'IndexedDB + SQL',
          title: '05/06 데이터 · 오프라인 동기화',
          detail: 'IndexedDB 낙관적 로컬 큐, sql.js 원자적 플러시 및 20분 TTL 기상 캐시.',
          normalizedHeight: 0.82,
        },
        {
          index: 5,
          label: '360+ TESTS',
          value: '360+ · 55 스위트',
          title: '07 거버넌스 · 자동 검증 게이트',
          detail: 'oxlint · TS 7 strict 및 55개 이상의 단위 · API · RBAC · 모바일 WebGL E2E 스위트.',
          normalizedHeight: 0.92,
        },
      ],
      cards: [
        {
          id: 'runtime',
          icon: 'globe',
          eyebrow: '01 클라이언트',
          metric: 'React 19 · TS 7',
          title: '웹 SPA · 번들러',
          detail: 'React 19 · TypeScript 7 strict · Vite 8 ESM 스플리팅 및 페인트 후 우선순위 로딩.',
          boundary: '클라이언트',
        },
        {
          id: 'mobile',
          icon: 'smartphone',
          eyebrow: '01/02 하이브리드',
          metric: 'Capacitor 8',
          title: 'iOS · Android · Edge',
          detail: '단일 웹 코드베이스로 iOS · Android 햅틱 · 카메라 브리지 및 HTTP/3 배포.',
          boundary: '하이브리드',
        },
        {
          id: 'backend',
          icon: 'server',
          eyebrow: '03/06 서버',
          metric: 'Express 5 · SQL',
          title: 'Gzip API · 저장소',
          detail: 'Express 5 Gzip JSON API, sql.js WASM SQLite / Cloud SQL PG 및 IndexedDB 동기화.',
          boundary: 'API/DB',
        },
        {
          id: 'three',
          icon: 'box',
          eyebrow: '04 코어 3D',
          metric: 'Three.js 0.187',
          title: 'WebGL2 모션 엔진',
          detail: '21관절 리그 · SpringBone 물리 · 28종 체형 모프 및 SwiftShader 자동 복구.',
          boundary: 'WebGL2',
        },
        {
          id: 'ai',
          icon: 'sparkles',
          eyebrow: '04/06 추론',
          metric: '엔터프라이즈 AI',
          title: '8방향 VTON 파이프라인',
          detail: '유료 무학습 2K 레이어드 합성, 8방향 자동 검수 및 11슬롯 메타데이터 태깅.',
          boundary: '0일 보관',
        },
        {
          id: 'maps',
          icon: 'mapPin',
          eyebrow: '04 Geo API',
          metric: 'Google Maps',
          title: '기상 · 장소 · 거리뷰',
          detail: 'Weather API v1 · Places API (New) 최소 FieldMask 및 미저장 거리뷰 프록시.',
          boundary: '프록시',
        },
      ],
    },
    journey: {
      badge: '6컷 AI 여정',
      autoPlayLabel: '자동',
      pausePlayLabel: '정지',
      prevLabel: '이전',
      nextCutLabel: '다음',
      nextStepLabel: '페인포인트',
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
          imageAlt: '보유 코트와 착용 기록을 비교하는 클레이 캐릭터',
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
          imageAlt: '울 코트 택을 스캔해 세탁법을 불러오는 클레이 캐릭터',
          speechBubble: '“찍기만 하면 정리부터 세탁법까지.”',
          apiChips: ['자동 정리'],
          detail: '사진으로 자동 분류하고(LIVE), 택 · 모델명 스캔으로 세탁법까지 불러옵니다(TO-DO).',
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
          imageAlt: '비 오는 거리 위에서 우산을 든 클레이 캐릭터',
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
          statusLabel: 'TO-DO',
          shortStatusLabel: 'TO-DO',
          imageSrc: '/assets/journey/clay-cut-04-v1.webp',
          imageAlt: '캘린더 룩북을 정리하는 클레이 캐릭터',
          speechBubble: '“오늘 입은 옷을 캘린더에 바로 기록.”',
          apiChips: ['캘린더'],
          detail: 'Google Calendar에 코디를 기록하고 SNS에 태그와 함께 공유합니다(TO-DO).',
        },
        {
          id: 'care',
          num: '05',
          icon: 'truck',
          shortTitle: '세탁 · 수거',
          title: '세탁법 · 방문수거',
          status: 'hybrid',
          statusLabel: 'LIVE+',
          shortStatusLabel: 'LIVE+',
          imageSrc: '/assets/journey/clay-cut-05-v1.webp',
          imageAlt: '세탁 기호를 확인하고 방문수거를 신청하는 클레이 캐릭터',
          speechBubble: '“세탁법 확인하고 문 앞 방문수거 신청.”',
          apiChips: ['세탁'],
          detail: '주변 세탁소 찾기(LIVE)와 문 앞 방문수거(TO-DO)까지 한 번에 연결합니다.',
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
          imageAlt: '영수증 태그가 붙은 재킷을 거래하는 클레이 캐릭터',
          speechBubble: '“안 입는 옷, 사진과 이력 묶어 바로 판매.”',
          apiChips: ['리셀'],
          detail: '오래 안 입은 옷을 알려주고(LIVE), 정품 인증 구매 이력으로 바로 판매합니다(TO-DO).',
        },
      ],
    },
    painPoints: {
      eyebrow: '파편화된 6대 문제',
      heading: '패션 소비 전 과정을 가로막는 6대 페인포인트',
      bottleneckTitle: '핵심 병목: 6개 앱 분절 → 매일 쓰지 못하는 구조',
      bottleneckDetail:
        '옷장 · 피팅 · 날씨 · 세탁 · 중고 앱이 따로 놀아 데이터가 끊기므로 어느 앱도 매일 쓰지 못합니다. 단 하나의 Privacy-First 옷장 OS로 6대 문제를 한 번에 해결합니다.',
      items: [
        {
          id: 'pain-dup',
          icon: 'shoppingBag',
          code: 'PAIN 01',
          metric: '70%+ 방치',
          title: '기억 의존 중복 구매',
          detail: '보유 의류 파악 불가 → 매장에서 비슷한 옷을 반복 구매하게 됩니다.',
        },
        {
          id: 'pain-return',
          icon: 'box',
          code: 'PAIN 02',
          metric: '$743B 손실',
          title: '내 옷과 안 맞는 온라인 반품',
          detail: '보유 바지 · 아우터와의 비율 · 색감을 사전에 검증할 수 없습니다 (Mordor 2026).',
        },
        {
          id: 'pain-layer',
          icon: 'layers',
          code: 'PAIN 03',
          metric: '단품 1벌 정면',
          title: '레이어드 · 측후면 검증 불가',
          detail: '기존 AI는 정면 단품 합성에 머물러 4겹 이상 외출 코디 확인이 불가합니다.',
        },
        {
          id: 'pain-tpo',
          icon: 'cloudRain',
          code: 'PAIN 04',
          metric: '앱 4개 분절',
          title: '날씨 · 장소(TPO)와 단절된 코디',
          detail: '날씨 · 지도 · 옷장 앱이 따로 놀아 매일 아침 의사결정 피로가 쌓입니다.',
        },
        {
          id: 'pain-privacy',
          icon: 'lock',
          code: 'PAIN 05',
          metric: '원본 무방비 전송',
          title: '얼굴 · GPS · 실내 프라이버시 공포',
          detail: '셀카와 EXIF 원본이 외부 서버와 무료 AI 학습에 노출될 우려가 큽니다.',
        },
        {
          id: 'pain-resale',
          icon: 'refreshCw',
          code: 'PAIN 06',
          metric: '자산 동결',
          title: '세탁 방치 · 중고 리셀 마찰',
          detail: '재촬영 · 실측 · 신뢰 입증의 번거로움으로 안 입는 옷이 방치됩니다.',
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
        { id: 'resale', icon: 'badgeCheck', num: '03', title: '믿고 판매', tag: '로드맵', detail: '구매 기록과 사진 기반 리셀을 준비합니다.' },
      ],
      centerKicker: 'iNVTRY LOOP',
      centerTitle: '옷장 순환 흐름',
      centerSub: '순환 옷장',
      autoPlayLabel: '자동',
      pausePlayLabel: '정지',
      loopNodes: [
        { id: 'closet', icon: 'shirt', num: '01', title: '옷장 정리', subtitle: '정리', detail: '배경을 지우고 종류별로 깔끔하게 정리합니다.' },
        { id: 'weather', icon: 'cloudSun', num: '02', title: '실시간 날씨', subtitle: '도시', detail: '지금 있는 도시의 기온과 거리를 반영합니다.' },
        { id: 'avatar', icon: 'personStanding', num: '03', title: '레이어드 피팅', subtitle: '4겹+', detail: '셔츠부터 롱코트까지 여러 겹을 미리 입어봅니다.' },
        { id: 'calendar', icon: 'calendar', num: '04', title: '착용 기록', subtitle: '캘린더', detail: '날짜별로 오늘 입은 코디를 기록합니다.' },
        { id: 'cpw', icon: 'coins', num: '05', title: '가치 · 리셀', subtitle: '순환', detail: '1회 착용 비용을 보고 안 입는 옷을 정리합니다.' },
      ],
      exits: [
        { id: 'resale', icon: 'badgeCheck', title: '정품 인증 리셀', subtitle: 'TO-DO', detail: '미착용 알림(LIVE) 및 이력 기반 리셀 준비.' },
        { id: 'purchase', icon: 'shoppingBag', title: '꼭 필요한 구매', subtitle: '중복 방지', detail: '옷장에 정말 없는 옷만 골라 추천합니다.' },
      ],
      nextLabel: '비즈니스 모델',
    },
    vision: {
      eyebrow: '비즈니스 모델',
      heading: '4중 수익 엔진',
      irBadge: '서울',
      quote: '',
      roadmapTitle: '로드맵',
      milestones: [
        { id: 'stage-1', icon: 'checkCircle', phase: 'LIVE 01', status: 'done', title: '레이어드 피팅 · 온디바이스 피부톤', tag: 'LIVE', detail: '여러 겹 가상 피팅, 자동 분류, 기기 내 피부톤 분석.' },
        { id: 'stage-2', icon: 'shieldCheck', phase: 'LIVE 02', status: 'done', title: '실시간 날씨 · 세탁 지도 · 즉시 삭제', tag: 'LIVE', detail: '내 지역 날씨 · 거리 배경, 주변 세탁소 찾기, 탈퇴 시 즉시 삭제.' },
        { id: 'stage-3', icon: 'rocket', phase: 'TO-DO', status: 'active', title: '택 스캔 · 캘린더 · 방문수거 · 리셀', tag: 'TO-DO', detail: '모델명 스캔, 코디 캘린더, 방문수거, 정품 인증 리셀.' },
      ],
      moatsTitle: '강점',
      moats: [
        { id: 'mvp', icon: 'smartphone', title: '웹 · 모바일', tag: 'LIVE', detail: '웹 · iOS · Android 동시 지원.' },
        { id: 'layer360', icon: 'layers', title: '다중 레이어드', tag: '4겹+', detail: '셔츠부터 롱코트까지 겹쳐 입기.' },
        { id: 'provenance', icon: 'badgeCheck', title: '정품 인증 리셀', tag: 'TO-DO', detail: '사진 · 구매 기록 연동 로드맵.' },
        { id: 'privacy', icon: 'lock', title: '온디바이스 보안', tag: '0B', detail: '얼굴 사진 외부 전송 없음.' },
      ],
      nextToBmLabel: '비즈니스 모델',
      revenueTitle: '4중 수익 비즈니스 모델',
      revenueNote: '공개 요약본 · 상세 요금 · 수수료율 · 단위 경제성은 투자자 인증 후 공개됩니다',
      revenuePillars: [
        {
          id: 'pro',
          icon: 'crown',
          num: '01',
          title: 'iNVTRY Pro 구독',
          mechanism: 'Pro 구독 · 비공개',
          detail:
            '확장된 다중 레이어드 8방향 가상 피팅, 실시간 거리 배경 연출, 착용 가치 분석 및 향후 세탁 · 케어 인텔리전스를 제공합니다.',
        },
        {
          id: 'affiliate',
          icon: 'shoppingBag',
          num: '02',
          title: '갭(Gap) 커머스',
          mechanism: '파트너 커머스',
          detail:
            '보유 옷장에 없는 공백 1벌을 기존 의류와 사전 조합 검증한 뒤 엄선된 파트너 브랜드 · 스토어와 연결해 중복 구매와 반품을 줄입니다.',
        },
        {
          id: 'resale-bm',
          icon: 'badgeCheck',
          num: '03',
          title: '인증 리셀 · 세탁 O2O',
          mechanism: '리셀 · 세탁 제휴',
          detail:
            '장기 미착용 알림(LIVE)을 바탕으로 향후 구매 이력 기반 정품 인증 리셀과 비대면 세탁 방문수거 제휴로 확장합니다.',
        },
        {
          id: 'b2b-sdk',
          icon: 'server',
          num: '04',
          title: '브랜드 VTON SDK',
          mechanism: 'B2B 파트너',
          detail:
            '디자이너 브랜드 · 편집숍 신상을 디지털 시드로 입점하고 가상 피팅 프리뷰 위젯을 공급해 온라인 반품 부담을 낮춥니다.',
        },
      ],
      businessModel: {
        eyebrow: 'CIRCULAR WARDROBE ECOSYSTEM',
        headline: '구독 × 갭 커머스 × 인증 리셀 × B2B 4중 수익 엔진',
        funnelTitle: '순환 라이프사이클 구조',
        funnelSteps: [
          { step: '01', label: '온디바이스 유입', value: '로컬 처리' },
          { step: '02', label: '일상 옷장 정착', value: '데일리 습관' },
          { step: '03', label: 'Pro · 갭 코디', value: '구독 전환' },
          { step: '04', label: '순환 리셀 확장', value: '생태계 순환' },
        ],
        costTitle: '3중 아키텍처 원가 효율화',
        marginValue: 'IR 공개',
        marginLabel: '단위 경제성',
        costDefenses: [
          {
            title: '온디바이스 WASM 추론',
            metric: '클라이언트 우선',
            detail: '의류 배경 제거 · EXIF 제거 · 피부톤 분석을 기기 내에서 처리해 서버 연산 부담을 줄입니다.',
          },
          {
            title: 'WebP 초경량 전송 압축',
            metric: '582→24 KB',
            detail: '경량화 포맷과 IndexedDB 로컬 캐시로 멀티 디바이스 열람 속도와 전송 효율을 높입니다.',
          },
          {
            title: '착장 해시 캐시 · 쿼터 제어',
            metric: '스마트 캐시',
            detail: '동일 착장 재조회 시 기존 멀티앵글 결과를 재활용하고 등급별 사용량 정책을 적용합니다.',
          },
        ],
        footnote: '* 상세 요금 · 수수료율 · 단위 경제성은 아래 투자자 접근 코드 인증 후 공개됩니다.',
      },
      faqTitle: '자주 묻는 질문',
      faqs: [
        {
          id: 'faq-privacy',
          question: '얼굴 사진이 서버로 전송되나요?',
          answer: '아니요. MediaPipe WASM이 기기 메모리에서만 피부톤을 분석(외부 전송 0B)하며, 의류 사진도 로컬 WebP로 EXIF · GPS를 제거한 뒤 처리합니다.',
        },
        {
          id: 'faq-vton',
          question: '2D VTON과 Three.js 3D의 역할 차이는 무엇인가요?',
          answer: '실사 4겹+ 멀티앵글 가상 피팅은 8방향 2D VTON이 담당하고, 인터랙티브 의류 모션과 실시간 날씨 우산 연출은 Three.js 3D 엔진이 구동합니다.',
        },
        {
          id: 'faq-platform',
          question: '어떤 기기에서 사용할 수 있나요?',
          answer: 'React 19 · Capacitor 8 단일 코드베이스로 웹 · iOS · Android를 모두 지원하며, 오프라인에서도 IndexedDB 옷장을 열람할 수 있습니다.',
        },
        {
          id: 'faq-partner',
          question: '패션 브랜드 제휴나 투자 문의는 어떻게 하나요?',
          answer: '프라이빗 베타, B2B 브랜드 SDK 파일럿, IR 자료 요청 모두 raymond@ainvtry.com으로 창업자에게 직접 연락하실 수 있습니다.',
        },
      ],
      backToMissionLabel: '여정',
      founderRole: '창업자',
      hqLabel: '거점',
      hqValue: '서울',
      domainLabel: '웹',
      stackSummaryLabel: '핵심',
      stackSummaryValue: '디지털 옷장 · 리셀',
      directCta: '창업자 메일',
      irDeckCta: '사업기획서',
    },
    footer: {
      rights: '© 2026 Ainvtry. All rights reserved.',
      newsletter: '뉴스레터 받기',
      newsletterShort: '뉴스레터',
      privacy: '개인정보처리방침',
      terms: '이용약관',
    },
    newsletter: {
      kicker: '뉴스레터',
      title: 'iNVTRY 뉴스레터 받기',
      subtitle: '프라이빗 베타 초대, 새로운 기능 업데이트 및 제품 소식을 이메일로 받아 보세요.',
      inlineTitle: '뉴스레터 받기',
      inlineSubtitle: '프라이빗 베타 초대 · 주요 업데이트 소식.',
      emailLabel: '이메일 주소',
      emailPlaceholder: 'name@example.com',
      consentLabel: '뉴스레터 발송을 위한 이메일 수집 · 이용에 동의하며 언제든 수신 거부할 수 있습니다.',
      submitLabel: '인증코드 받기',
      submittingLabel: '인증코드 발송 중…',
      closeLabel: '뉴스레터 창 닫기',
      privacyNote: '광고성 스팸 없음 · 본인 이메일 인증 필수 · 언제든 즉시 수신 거부.',
      invalidEmailError: '올바른 이메일 주소를 입력해 주세요.',
      consentRequiredError: '이메일 수신 및 개인정보 수집 동의에 체크해 주세요.',
      rateLimitedError: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
      genericError: '요청 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
      successTitle: '이메일 인증 및 구독이 완료되었습니다',
      successBody: '이메일 소유 확인이 완료되었습니다. 프라이빗 베타 초대와 주요 릴리스 소식을 보내 드리겠습니다.',
      alreadyTitle: '이미 구독 중인 이메일입니다',
      alreadyBody: '입력하신 주소는 이미 인증이 완료되어 iNVTRY 뉴스레터에 등록되어 있습니다.',
      offlineTitle: '이 기기에 구독 요청을 임시 저장했습니다',
      offlineBody: '현재 서버와 연결할 수 없어 아래 버튼으로 다시 시도하거나 확인 메일을 보내 주시면 바로 등록해 드립니다.',
      mailtoFallbackCta: '이메일로 구독 신청 보내기',
      doneCta: '확인',
      unsubscribeCta: '수신 거부',
      unsubscribedNotice: '뉴스레터 수신 거부가 처리되었습니다.',
      changeEmailCta: '다른 이메일로 변경',
      verifyTitle: '이메일 인증을 완료해 주세요',
      verifySubtitle: '입력하신 주소로 6자리 인증코드와 원클릭 인증 링크를 보냈습니다. (10분 유효)',
      verifyCodeLabel: '6자리 인증코드',
      verifyCodePlaceholder: '000000',
      verifySubmitLabel: '인증 완료하고 구독하기',
      verifyingLabel: '인증 확인 중…',
      resendCta: '인증코드 재발송',
      resendCooldownTemplate: '{sec}초 후 재발송 가능',
      resentNotice: '새 6자리 인증코드를 이메일로 다시 발송했습니다.',
      invalidCodeError: '인증코드 6자리가 일치하지 않습니다. 다시 확인해 주세요.',
      expiredCodeError: '인증코드 유효시간(10분)이 만료되었습니다. 재발송 버튼을 눌러 주세요.',
      attemptsExceededError: '인증 시도 횟수를 초과했습니다. 인증코드를 다시 발송해 주세요.',
      deliveryNotConfiguredError: '인증 메일 발송 서버(RESEND_API_KEY)가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.',
      verifyLinkHint: '또는 수신한 메일 안의 인증 버튼을 눌러 바로 완료할 수도 있습니다.',
    },
    legal: {
      closeLabel: '안내 닫기',
      updatedAt: '시행일 2026년 11월 23일 · ainvtry.com',
      privacyTitle: '개인정보처리방침',
      privacySections: [
        {
          heading: '1. 온디바이스 생체정보 처리 및 페이스 메모리 볼트 원칙',
          body: 'Ainvtry(iNVTRY)는 안면 피부톤 랜드마크 분석을 사용자 기기 내 클라이언트 MediaPipe WebAssembly에서만 수행하며 보정된 페이스 메모리는 로컬 IndexedDB에만 격리 저장합니다. 피부톤 보정 목적의 안면 카메라 원본 프레임은 외부 서버로 전송되거나 저장되지 않습니다 (외부 전송 0 Bytes).',
        },
        {
          heading: '2. OAuth 토큰 관리 및 스토리지 접근 권한 분리',
          body: 'Apple · Google OAuth 로그인 시 서버가 OIDC 서명을 직접 검증하며 외부 IdP Access/Refresh 토큰은 저장하지 않고 미검증 이메일 자동 병합을 금지합니다. 내부 세션은 HttpOnly 쿠키와 Rate Limit으로 보호되며, 모든 옷장 API 및 파일 스토리지는 사용자별 테넌트 권한 검증으로 타 계정 접근을 원천 차단합니다.',
        },
        {
          heading: '3. 제3자 AI API 비식별화 · 무학습 추론 및 보유기간',
          body: '얼굴 원본 사진은 기기 밖으로 일절 전송되지 않습니다 (외부 전송 0 Bytes). 가상 피팅을 요청한 의류 이미지만 클라이언트에서 크롭 · 배경 분리 및 WebP 재인코딩을 거쳐 EXIF/GPS 메타데이터와 생활 배경을 제거한 뒤 암호화 서버 프록시를 통해 모델 재학습 미사용(No-Training) 유료 엔터프라이즈 AI 추론으로 처리하며, 전송 페이로드는 응답 직후 즉시 파기합니다. AI 페이로드에는 성명 · 이메일 등 직접 식별자(PII)를 완전 배제하며, 지도 미디어는 영구 DB에 저장하지 않습니다.',
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
          body: 'Ainvtry(ainvtry.com, 제품명 A inventory)는 디지털 옷장 관리, 의류 자동 분류, 멀티앵글 가상 피팅, Three.js 3D 모션 연출, 세탁 케어 안내, 날씨 · 장소 맞춤 코디 계획 및 구매 이력 기반 정품 인증 리셀 연동 기능을 제공합니다.',
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
