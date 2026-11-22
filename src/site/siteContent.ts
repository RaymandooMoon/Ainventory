export type SiteLang = 'en' | 'ko';
export type SiteTheme = 'dark' | 'light';
export type LegalDocKind = 'privacy' | 'terms';
export type SiteViewId = 'home' | 'studio' | 'technology' | 'benchmarks' | 'about';
export type AppPreviewScreenId = 'outfits' | 'closet' | 'stats' | 'profile';

export function resolveAppPreviewSrc(
  screenId: AppPreviewScreenId,
  lang: SiteLang,
  theme: SiteTheme
): string {
  return `/assets/previews/app-${screenId}-${lang}-${theme}.webp`;
}

export interface SiteMeta {
  readonly brandName: string;
  readonly productName: string;
  readonly domain: string;
  readonly contactEmail: string;
  readonly founderName: string;
  readonly location: string;
  readonly copyrightYear: string;
}

export const SITE_META: SiteMeta = {
  brandName: 'Ainvtry',
  productName: 'A inventory',
  domain: 'ainvtry.com',
  contactEmail: 'raymond@ainvtry.com',
  founderName: 'Raymond Moon',
  location: 'Seoul, South Korea',
  copyrightYear: '2026',
};

export interface SiteSpecCard {
  readonly eyebrow: string;
  readonly metric: string;
  readonly title: string;
  readonly detail: string;
  readonly boundary: string;
}

export interface SitePillarCopy {
  readonly code: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly bullets: readonly string[];
}

export interface SiteAppPreviewScreen {
  readonly id: AppPreviewScreenId;
  readonly tabLabel: string;
  readonly title: string;
  readonly caption: string;
  readonly metricTag: string;
  readonly imageAlt: string;
}

export interface SiteArchLayer {
  readonly id: 'spatial' | 'multimodal' | 'maps' | 'privacy';
  readonly shortCode: string;
  readonly shortLabel: string;
  readonly tier: string;
  readonly boundary: string;
  readonly title: string;
  readonly subtitle: string;
  readonly summary: string;
  readonly modules: readonly string[];
  readonly guarantee: string;
  readonly latencyOrBudget: string;
}

export interface SitePipelineNode {
  readonly code: string;
  readonly apiName: string;
  readonly role: string;
  readonly detail: string;
  readonly compliance: string;
}

export interface SiteIrKpi {
  readonly value: string;
  readonly label: string;
  readonly sub: string;
}

export interface SiteBenchmarkBar {
  readonly label: string;
  readonly valueText: string;
  readonly detail: string;
  readonly pct: number;
}

export interface SiteMilestone {
  readonly phase: string;
  readonly status: 'done' | 'active';
  readonly title: string;
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
    readonly archStack: string;
    readonly archMaps: string;
    readonly archCutoutPrivacy: string;
    readonly benchKpi: string;
    readonly benchMatrix: string;
    readonly aboutMission: string;
    readonly aboutFounder: string;
  };
  readonly appPreview: {
    readonly code: string;
    readonly eyebrow: string;
    readonly title: string;
    readonly description: string;
    readonly badge: string;
    readonly syncHint: string;
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
    readonly sectionCode: string;
    readonly eyebrow: string;
    readonly heading: string;
    readonly subheading: string;
    readonly badge: string;
    readonly pillars: {
      readonly atelier: SitePillarCopy;
      readonly ingestion: SitePillarCopy;
      readonly intelligence: SitePillarCopy;
      readonly privacy: SitePillarCopy;
    };
  };
  readonly architecture: {
    readonly eyebrow: string;
    readonly heading: string;
    readonly badge: string;
    readonly inspectorLabel: string;
    readonly modulesLabel: string;
    readonly guaranteeLabel: string;
    readonly layers: readonly SiteArchLayer[];
    readonly mapsEyebrow: string;
    readonly mapsHeading: string;
    readonly mapsSub: string;
    readonly mapsComplianceFooter: string;
    readonly mapsNodes: readonly SitePipelineNode[];
  };
  readonly interactive: {
    readonly stanceIdle: string;
    readonly stanceWalk: string;
    readonly stanceRain: string;
    readonly rigLabel: string;
    readonly rigValue: string;
    readonly rigMeta: string;
    readonly morphLabel: string;
    readonly morphValue: string;
    readonly morphMeta: string;
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
    readonly dupDesc: string;
    readonly ootdDate: string;
    readonly ootdTitle: string;
    readonly ootdMeta: string;
    readonly topologyTitle: string;
    readonly topologySteps: readonly {
      readonly title: string;
      readonly sub: string;
    }[];
    readonly topologyFooterLeft: string;
    readonly topologyFooterRight: string;
  };
  readonly stack: {
    readonly eyebrow: string;
    readonly heading: string;
    readonly note: string;
    readonly heroKpis: readonly SiteIrKpi[];
    readonly benchmarkTitle: string;
    readonly bars: readonly SiteBenchmarkBar[];
    readonly cards: readonly SiteSpecCard[];
  };
  readonly vision: {
    readonly eyebrow: string;
    readonly heading: string;
    readonly irBadge: string;
    readonly quote: string;
    readonly body: string;
    readonly roadmapTitle: string;
    readonly milestones: readonly SiteMilestone[];
    readonly statusMvp: string;
    readonly statusRelease: string;
    readonly founderRole: string;
    readonly founderBio: string;
    readonly hqLabel: string;
    readonly hqValue: string;
    readonly domainLabel: string;
    readonly stackSummaryLabel: string;
    readonly stackSummaryValue: string;
    readonly directCta: string;
  };
  readonly footer: {
    readonly summary: string;
    readonly rights: string;
    readonly privacy: string;
    readonly terms: string;
    readonly contact: string;
    readonly backToTop: string;
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
      metrics: 'Benchmarks',
      about: 'Founder',
      silkLuxury: 'Luxury',
      silkAurora: 'Aurora',
      switchToLight: 'Light',
      switchToDark: 'Dark',
      switchLang: 'KO',
      opacityLabel: 'Glass',
      opacityHint: 'Drag up for more transparency, drag down for less',
    },
    subtabs: {
      studioPreview: '01 Live App',
      studioAtelier: '02 3D Fitting',
      studioIntel: '03 Care & TPO',
      archStack: '01 4-Tier Stack',
      archMaps: '02 Google Maps',
      archCutoutPrivacy: '03 Vision & Privacy',
      benchKpi: '01 IR Scorecard',
      benchMatrix: '02 Production Stack',
      aboutMission: 'Vision & Roadmap',
      aboutFounder: 'Founder Dossier',
    },
    appPreview: {
      code: 'LIVE BUILD · 4-MODE SYNCED CAPTURE',
      eyebrow: 'REAL WORKING MVP · AUTO-SYNCED WITH LANG & THEME',
      title: 'Inside the A inventory Mobile App',
      description:
        'Live captures from our active React 19 + Capacitor 8 + Three.js + Google Maps Platform build. Toggle EN/KO or Dark/Light above to watch the real app preview switch instantaneously.',
      badge: '16 LIVE VARIANTS',
      syncHint: 'Synced live with site language & theme',
      screens: [
        {
          id: 'outfits',
          tabLabel: 'Outfits',
          title: 'Multi-Angle Outfit Studio',
          caption: 'Weather-synced flatlay lookbook, 0°–360° turnaround bar & TPO rationale',
          metricTag: '8-ANGLE · WEATHER',
          imageAlt: 'A inventory mobile app Outfits fitting studio preview',
        },
        {
          id: 'closet',
          tabLabel: 'Closet',
          title: '253-Item Digital Closet',
          caption: 'Monochrome squircle grid, wear-count telemetry & Smart Laundry Basket',
          metricTag: '253 ITEMS · CARE',
          imageAlt: 'A inventory mobile app Digital Closet preview',
        },
        {
          id: 'stats',
          tabLabel: 'Stats',
          title: 'Wardrobe Bento Analytics',
          caption: 'Capsule utilization ring, cumulative wears & Cost-Per-Wear efficiency',
          metricTag: 'CPW · TELEMETRY',
          imageAlt: 'A inventory mobile app Wardrobe Stats analytics preview',
        },
        {
          id: 'profile',
          tabLabel: 'Profile',
          title: 'Skin-Tone, Fit & Density Studio',
          caption: 'On-device MST-04 facial mesh, sagging/VPL fit simulation & styling density',
          metricTag: '0-BYTE LOCAL ML',
          imageAlt: 'A inventory mobile app Profile skin-tone and body studio preview',
        },
      ],
    },
    hero: {
      kicker: 'AINVTRY.COM · PRIVATE 3D WARDROBE ATELIER',
      titleLead: 'Your Private ',
      titleAccent: '3D Digital Atelier',
      titleTail: ' & AI Styling Studio',
      subtitle:
        'Spatial cloth physics, Gemini multi-angle VTON, Google Maps weather & care intelligence, and zero-upload on-device biometrics.',
      marbleHint: 'Roll the marble like pinball into any menu pill or tap to explore',
      primaryCta: 'Explore the Atelier',
      secondaryCta: 'Contact Founder',
    },
    capabilities: {
      sectionCode: '01 / 04 PRODUCT BRIEFING',
      eyebrow: 'SPATIAL ENGINE · A INVENTORY',
      heading: '3D Haute Wardrobe Architecture',
      subheading:
        'Engineered as an architectural fashion gallery: tactile, quantitative, and free of cluttered SaaS noise.',
      badge: 'WORKING MVP · v0.2',
      pillars: {
        atelier: {
          code: '01 / SPATIAL KINEMATICS & LAYERING',
          eyebrow: 'THREE.JS 0.187 · OPTICAL-FLOW TURNAROUND',
          title: '21-Bone Fitting Rig & 11-Slot Multi-Stage Layering',
          description:
            'Our Three.js 21-bone skeletal rig, SpringBone cloth physics, and dual-layer optical-flow 8-angle turnaround simulate coat drape, 2-stage tops/outers, underwear VPL/show-through, and hip-hop sagging fit across 28 anthropometric morphs.',
          bullets: [
            'Idle, runway walk, weather-synced umbrella & hand inspection stances',
            '11 garment slots including dual-stage Top/Outer & Underwear VPL/sagging engine',
            'Continuous 0°–360° optical-flow turnaround with WebGL auto-recovery',
          ],
        },
        ingestion: {
          code: '02 / MULTIMODAL VISION & PRIVACY',
          eyebrow: 'OPPONENT-CHROMA MATTING · ZERO-UPLOAD BIOMETRICS',
          title: '23 KB WebP Matting & On-Device Facial Vault',
          description:
            'Opponent-chroma studio matting + 8-handle smart crop compresses raw snapshots by 96% to crisp WebP cutouts, while MediaPipe FaceLandmarker WASM stores calibrated MST-04 facial identity strictly inside local IndexedDB.',
          bullets: [
            'Guided registration stepper with official brand spec sync & Gemini tagging',
            '2K multi-angle VTON with automated Vision QC middleware & angle repair',
            'Multi-face diagnostics & Face Memory Vault — 0 bytes of biometrics uploaded',
          ],
        },
        intelligence: {
          code: '03 / LIFECYCLE CARE, TPO & ECONOMICS',
          eyebrow: 'SMART LAUNDRY · NEARBY CARE MAP · RATIONALE ENGINE',
          title: 'Wardrobe Economics, Garment Care & TPO Intelligence',
          description:
            'Beyond Cost-Per-Wear analytics: care-label wash/bleed rules power a Smart Laundry Basket and Nearby Care Map (dry-clean, alteration, leather care via Google Places), while Weather/UV alerts explain every outfit decision.',
          bullets: [
            'Explainable Outfit Rationale Engine (TPO + Weather + Styling Density + Color)',
            'Smart Laundry Basket with color-bleed risk & Google Places Nearby Care Map',
            'UV Smart Accessory alerts (sunglasses/headwear) & offline Duplicate Guard',
          ],
        },
        privacy: {
          code: '04 / SOVEREIGN PRIVACY',
          eyebrow: 'ON-DEVICE WASM · INDEXEDDB VAULT',
          title: 'Zero-Upload Facial Memory & Offline-First Sync',
          description:
            'Facial landmark detection and lighting calibration run 100% locally in WebAssembly. Your calibrated facial identity and wardrobe stay responsive offline via IndexedDB and Capacitor 8.',
          bullets: [
            'Explicit pre-consent camera gate & multi-face manual correction modal',
            'Sign in with Apple, Google, or 6-digit OTP + one-tap permanent deletion',
            'Single React 19 + TypeScript codebase shipping to iOS & Android via Capacitor 8',
          ],
        },
      },
    },
    architecture: {
      eyebrow: 'SYSTEM ARCHITECTURE · TECHNICAL IR BRIEFING',
      heading: '4-Tier Spatial, Multimodal & Geo-Context Stack',
      badge: '126+ MODULES · 210 TESTS',
      inspectorLabel: 'ACTIVE TIER SPECIFICATION',
      modulesLabel: 'CORE PRODUCTION MODULES',
      guaranteeLabel: 'TRUST BOUNDARY & SLA',
      layers: [
        {
          id: 'spatial',
          shortCode: 'L1',
          shortLabel: '3D GPU',
          tier: 'L1 · CLIENT GPU',
          boundary: 'WEBGL2 + GLSL',
          title: 'Spatial 3D Fitting & Turnaround Engine',
          subtitle: 'Three.js 0.187 · 21-Bone Rig · Dual-Layer Optical-Flow 8-Angle Morph',
          summary:
            'Drives real-time 21-bone skeletal animation, SpringBone drape physics, 28 body morph targets, GLSL draped silk + caustic marble shaders, and continuous 8-angle turnaround morphing with WebGL context-loss auto-recovery.',
          modules: [
            'loginThreeScenes.ts (GLSL Silk + Marble)',
            'vton2DService.ts (8-Angle Optical Flow)',
            'underwearStylingEngine.js (VPL & Sagging)',
            'stageLightingEngine.ts (Indoor Fixtures)',
          ],
          guarantee: '60fps target · Instant 2D Flatlay fallback on WebGL context loss',
          latencyOrBudget: '16.6ms Frame Budget',
        },
        {
          id: 'multimodal',
          shortCode: 'L2',
          shortLabel: 'Gemini',
          tier: 'L2 · CLOUD AI',
          boundary: 'GEMINI & VERTEX',
          title: 'Multimodal Vision, VTON & Styling Rationale',
          subtitle: '@google/genai 3.6 · VTON QC Loop · Explainable Outfit Rationale',
          summary:
            'Orchestrates garment attribute classification, official brand metadata sync, progressive multi-angle VTON streaming with automated Vision QC middleware, single-angle repair, and explainable TPO/weather/density styling notes.',
          modules: [
            'server/garmentVisionService.js',
            'server/vtonService.js + vtonQcMiddleware.js',
            'outfitRationaleEngine.ts (TPO / Weather)',
            'vtonStageProgress.ts (Progressive Stream)',
          ],
          guarantee: 'Automated visual QC gate · Strict opponent-chroma garment protection',
          latencyOrBudget: '2K Multi-Angle VTON',
        },
        {
          id: 'maps',
          shortCode: 'L3',
          shortLabel: 'Maps',
          tier: 'L3 · GEO-CONTEXT',
          boundary: 'SERVER-ONLY PROXY',
          title: 'Google Maps Platform Weather, Places & Care',
          subtitle: 'Weather API v1 · Places API (New) · Street View Pre-Check · Care Map',
          summary:
            'Server-only proxy connects Google Weather API v1 (current, forecast, severe alerts, UV index), Places API (New) with minimal FieldMask for TPO live backdrops and nearby dry-clean/alteration shops, plus free Street View metadata pre-checks.',
          modules: [
            'server/googleWeatherService.js (v1 + Alerts)',
            'server/mapsProxyService.js (Places New)',
            'server/mapsBackdropService.js (Zero-Cache)',
            'garmentCareEngine.ts + NearbyCareMapModal',
          ],
          guarantee: 'Zero permanent media caching · Server-only API keys · Free metadata probe',
          latencyOrBudget: '20m Weather TTL Cache',
        },
        {
          id: 'privacy',
          shortCode: 'L4',
          shortLabel: 'Edge',
          tier: 'L4 · SOVEREIGN EDGE',
          boundary: '0-BYTE LOCAL WASM',
          title: 'On-Device Biometrics, Vault & Native Hybrid',
          subtitle: 'MediaPipe WASM · IndexedDB Face Memory · Express 5 + sql.js · Capacitor 8',
          summary:
            'Runs MediaPipe FaceLandmarker 100% locally in WebAssembly with multi-face diagnostics and manual correction. Persists calibrated skin/face memory inside local IndexedDB, backed by Express 5, sql.js WASM SQLite, and Capacitor 8.',
          modules: [
            'skinToneAnalyzer.ts + faceAnalysisDiagnostics.ts',
            'faceMemoryStore.ts (IndexedDB Vault)',
            'laundryBasketStore.ts + stylingPreferenceStore.ts',
            'Capacitor 8 (iOS / Android Native Bridge)',
          ],
          guarantee: '0 bytes of biometric facial frames transmitted to external servers',
          latencyOrBudget: '100% Offline-First Core',
        },
      ],
      mapsEyebrow: 'GOOGLE CLOUD & MAPS PLATFORM INTEGRATION',
      mapsHeading: 'ToS-Compliant Context & Care Pipeline',
      mapsSub:
        'Every Google Maps & Weather call routes through hardened Express 5 server proxies with minimal X-Goog-FieldMask, attribution headers, and zero permanent media caching.',
      mapsComplianceFooter:
        'Strict GMP Compliance · Server-Only Keys · Free Street View Metadata Pre-Check · Zero Media DB Caching',
      mapsNodes: [
        {
          code: '01 · WEATHER v1',
          apiName: 'Google Weather API v1',
          role: 'Current · Forecast · Severe Alerts',
          detail:
            'Classifies snow_ice, rain_storm, cold_wind, extreme_heat & UV index to trigger studio weather banners and UV accessory suggestions.',
          compliance: '20–30m In-Memory TTL',
        },
        {
          code: '02 · PLACES NEW',
          apiName: 'Places API (New)',
          role: 'TPO Destinations & Nearby Care',
          detail:
            'Resolves real TPO venues for live fitting context and locates nearby dry-cleaning, laundry, alteration & leather-care shops.',
          compliance: 'Minimal X-Goog-FieldMask',
        },
        {
          code: '03 · STREET VIEW',
          apiName: 'Place Photos & Street View',
          role: 'Live Fitting Backdrop Layer',
          detail:
            'Executes free streetview/metadata pre-check before paid imagery fetch, rendering contextual place backdrops cleanly behind the avatar.',
          compliance: 'Zero Permanent Media Storage',
        },
        {
          code: '04 · GEMINI AI',
          apiName: 'Gemini & Vertex Multimodal',
          role: 'Vision Tagging · VTON · Rationale',
          detail:
            'Fuses weather, TPO place context, personal color & 11-slot garment taxonomy into 2K multi-angle VTON renders and rationale cards.',
          compliance: 'Automated Vision QC Loop',
        },
      ],
    },
    interactive: {
      stanceIdle: 'Idle',
      stanceWalk: 'Runway Walk',
      stanceRain: 'Rain Umbrella',
      rigLabel: 'SKELETAL RIG & LAYERS',
      rigValue: '21 Bones · 11 Slots',
      rigMeta: 'SpringBone + VPL/Sagging Fit',
      morphLabel: 'MORPHS & TURNAROUND',
      morphValue: '28 Morphs · 8-Angle',
      morphMeta: 'Optical-Flow 360° Sync',
      pccsNote: 'PCCS 12-Tone & MST-04 Harmonized',
      beforeLabel: 'RAW SNAPSHOT',
      afterLabel: 'ALPHA-MATTE WEBP',
      sliderHint: 'Drag to compare raw garment photo and WebP cutout',
      ingestionBadge: 'OPPONENT-CHROMA MATTING · GEMINI VISION',
      ingestionMeta: '582 KB → 23 KB WebP (-96%) · 11-Slot Auto-Tag',
      cpwLabel: 'AVG COST-PER-WEAR',
      cpwValue: '₩14,200',
      cpwDelta: '-18% vs prior month',
      balanceLabel: 'CAPSULE UTILIZATION',
      balanceValue: '98.4%',
      balanceMeta: 'Smart Laundry · 0 bleed conflicts',
      dupTitle: 'SMART CARE & NEARBY PLACES MAP',
      dupStatus: 'GMP ACTIVE',
      dupDesc:
        'Care-label wash/bleed rules pair with Google Places (New) to surface verified dry-cleaners, alterations & leather-care shops nearby.',
      ootdDate: 'UV · TPO',
      ootdTitle: 'Weather Alert + Explainable Rationale',
      ootdMeta: 'Google Weather v1 · UV accessory & umbrella sync',
      topologyTitle: 'ZERO-UPLOAD BIOMETRIC & FACE MEMORY TOPOLOGY',
      topologySteps: [
        { title: 'Local Camera', sub: 'Multi-face diagnostic' },
        { title: 'MediaPipe WASM', sub: '100% local MST-04' },
        { title: 'IndexedDB Vault', sub: 'Face Memory & Offline' },
      ],
      topologyFooterLeft: 'BIOMETRIC FACE UPLINK',
      topologyFooterRight: '0 BYTES TRANSMITTED',
    },
    stack: {
      eyebrow: 'ENGINEERING SCORECARD · IR BENCHMARKS',
      heading: 'Verified Production Architecture & Metrics',
      note: 'ALL METRICS MEASURED DIRECTLY FROM ACTIVE REPOSITORY',
      heroKpis: [
        {
          value: '210+',
          label: 'Automated Unit Tests',
          sub: '29 suites covering VTON, Weather, Maps & Care',
        },
        {
          value: '4 APIs',
          label: 'Google Cloud & Maps',
          sub: 'Gemini · Weather v1 · Places New · Street View',
        },
        {
          value: '0 Bytes',
          label: 'Biometric Upload',
          sub: '100% on-device MediaPipe WASM + Face Vault',
        },
        {
          value: '-96%',
          label: 'Cutout Compression',
          sub: '582 KB raw studio photo → 23 KB alpha WebP',
        },
      ],
      benchmarkTitle: 'RUNTIME EFFICIENCY & COVERAGE BENCHMARKS',
      bars: [
        {
          label: 'Garment Asset Optimization (Opponent-Chroma WebP)',
          valueText: '96.0% smaller (23 KB)',
          detail: '582 KB raw JPEG normalized to alpha-matted 23 KB WebP',
          pct: 96,
        },
        {
          label: 'On-Device Biometric Isolation (MediaPipe FaceLandmarker)',
          valueText: '100% Local WASM',
          detail: 'Zero raw facial frames leave browser or mobile WebView',
          pct: 100,
        },
        {
          label: '360° Multi-Angle Coverage (Dual-Layer Optical-Flow Morph)',
          valueText: '8 Angles · 28 Morphs',
          detail: 'Continuous 0°–360° silhouette & interior flow interpolation',
          pct: 88,
        },
        {
          label: 'Wardrobe Taxonomy & Layering Depth (Client + Server Shared)',
          valueText: '11 Slots · 253+ Items',
          detail: 'Dual-stage Top/Outer + Underwear VPL/sagging + Smart Care rules',
          pct: 92,
        },
      ],
      cards: [
        {
          eyebrow: '3D & KINEMATICS',
          metric: 'Three.js 0.187',
          title: '21-Bone Rig, GLSL & Optical Flow',
          detail: 'SpringBone cloth physics, 28 morph targets, 8-angle turnaround & GLSL silk shaders.',
          boundary: 'CLIENT GPU',
        },
        {
          eyebrow: 'MULTIMODAL AI',
          metric: 'Gemini 3.6',
          title: 'Vision Tagging, 2K VTON & QC Gate',
          detail: 'Progressive multi-angle try-on streaming, automated QC repair & explainable rationale.',
          boundary: 'CLOUD AI',
        },
        {
          eyebrow: 'GEO & WEATHER',
          metric: 'Google Maps',
          title: 'Weather v1, Places & Street View',
          detail: 'Severe weather alerts, UV gear tips, TPO live backdrops & Nearby Care Map proxy.',
          boundary: 'SERVER PROXY',
        },
        {
          eyebrow: 'LOCAL PRIVACY',
          metric: 'MediaPipe',
          title: 'On-Device MST-04 & Face Vault',
          detail: 'Multi-face diagnostic correction & IndexedDB face memory with zero biometric upload.',
          boundary: '0-BYTE LOCAL',
        },
        {
          eyebrow: 'DOMAIN ENGINES',
          metric: 'Care & Fit',
          title: 'Smart Laundry, VPL & TPO Suites',
          detail: 'Care-label wash/bleed matrix, underwear show-through/sagging & duplicate purchase guard.',
          boundary: 'SHARED ESM',
        },
        {
          eyebrow: 'HYBRID RUNTIME',
          metric: 'Capacitor 8',
          title: 'React 19, Express 5 & sql.js',
          detail: 'Strict TypeScript 7, Tailwind CSS 4, offline-first IndexedDB & iOS/Android native bridge.',
          boundary: 'CROSS-PLATFORM',
        },
      ],
    },
    vision: {
      eyebrow: 'EXECUTIVE IR DOSSIER · ROADMAP',
      heading: 'Eliminating Wardrobe Friction Through Spatial & Contextual AI',
      irBadge: 'INVESTOR & STARTUP BRIEFING · 2026',
      quote:
        '“When every garment you own is paired with physical drape, real weather & place context, garment care intelligence, and honest cost-per-wear data, you wear your closet creatively—and stop impulsive duplicate purchases.”',
      body: 'Ainvtry (product: A inventory) is an independent AI fashion-tech startup built in Seoul. Combining Three.js spatial graphics, Google Gemini multimodal pipelines, Google Maps Platform weather/place intelligence, and zero-upload on-device ML, our working MVP is scaling toward iOS App Store and Google Play launch.',
      roadmapTitle: 'EXECUTION MILESTONES',
      milestones: [
        {
          phase: 'PHASE 01',
          status: 'done',
          title: '3D Atelier, 8-Angle VTON & Local WASM Privacy',
          detail: '21-bone rig, 28 morphs, opponent-chroma matting, MediaPipe MST-04 vault.',
        },
        {
          phase: 'PHASE 02',
          status: 'done',
          title: 'Google Maps Platform Weather · Places · Smart Care',
          detail: 'Weather v1 alerts, UV gear, TPO live backdrops, Laundry Basket & Nearby Care Map.',
        },
        {
          phase: 'PHASE 03',
          status: 'active',
          title: 'Private Beta, Google Cloud Scale & Store Launch',
          detail: 'iOS App Store & Google Play release with Vertex AI / Cloud Run production scaling.',
        },
      ],
      statusMvp: '210+ Tests · Live Working MVP',
      statusRelease: 'iOS & Android Launch Prep',
      founderRole: 'Founder & Product Engineer · Ainvtry',
      founderBio:
        'Architecting Ainvtry end-to-end across Three.js spatial graphics, Gemini & Vertex AI VTON pipelines, Google Maps Platform geo-context proxies, local WASM biometrics, and Capacitor mobile delivery.',
      hqLabel: 'Headquarters',
      hqValue: 'Seoul, South Korea',
      domainLabel: 'Official Domain',
      stackSummaryLabel: 'Cloud Infrastructure',
      stackSummaryValue: 'Google Cloud · Gemini · Maps Platform',
      directCta: 'Email Raymond directly',
    },
    footer: {
      summary:
        'Ainvtry (A inventory) — Private 3D Digital Wardrobe Atelier & AI Virtual Try-On Studio. Built in Seoul.',
      rights: '© 2026 Ainvtry. All rights reserved.',
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
      contact: 'Contact',
      backToTop: 'Back to Top',
    },
    legal: {
      closeLabel: 'Close legal notice',
      updatedAt: 'Effective November 22, 2026 · ainvtry.com',
      privacyTitle: 'Privacy Policy',
      privacySections: [
        {
          heading: '1. On-Device First Biometrics & Face Memory Vault',
          body: 'Ainvtry processes facial skin-tone landmarks strictly on your device using client-side MediaPipe WebAssembly and stores calibrated face memory inside local IndexedDB. Raw facial camera frames are never uploaded to external servers for skin-tone calibration.',
        },
        {
          heading: '2. Wardrobe, AI Fitting & Location Context',
          body: 'Garment photos submitted for background removal or Gemini virtual try-on are processed strictly for your requested styling output. Optional location queries for Google Weather or Nearby Care Map pass through a server-only proxy with zero permanent media caching.',
        },
        {
          heading: '3. Account Security & Immediate Permanent Deletion',
          body: 'Users authenticate via Sign in with Apple, Google, or email 6-digit OTP. You may permanently delete your account and all associated wardrobe records immediately from Account Settings.',
        },
        {
          heading: '4. Privacy Inquiries',
          body: 'For privacy questions or data removal requests, contact Founder Raymond Moon directly at raymond@ainvtry.com.',
        },
      ],
      termsTitle: 'Terms of Service',
      termsSections: [
        {
          heading: '1. Service Scope',
          body: 'Ainvtry (ainvtry.com, product: A inventory) provides 3D digital wardrobe management, AI garment categorization, multi-angle virtual try-on previews, garment care guidance, and weather/TPO OOTD planning tools.',
        },
        {
          heading: '2. User Content Ownership',
          body: 'You retain full ownership of all wardrobe photographs, outfit logs, and notes you upload to Ainvtry. You grant Ainvtry only the limited technical license needed to render and process your requested features.',
        },
        {
          heading: '3. AI Preview & Care Guidance Accuracy',
          body: 'Virtual try-on renders, styling rationales, and garment care recommendations are decision-support aids and do not replace manufacturer care tags or physical garment sizing across third-party brands.',
        },
        {
          heading: '4. Contact',
          body: 'Official operator: Ainvtry (Founder: Raymond Moon, Seoul, South Korea). Inquiries: raymond@ainvtry.com.',
        },
      ],
    },
  },
  ko: {
    nav: {
      homeAria: '첫 페이지로 돌아가기',
      studio: '스튜디오',
      technology: '아키텍처',
      metrics: '핵심 스펙',
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
      studioPreview: '01 라이브 앱',
      studioAtelier: '02 3D 피팅',
      studioIntel: '03 케어 · TPO',
      archStack: '01 4계층 스택',
      archMaps: '02 Google Maps',
      archCutoutPrivacy: '03 누끼 · 보안',
      benchKpi: '01 IR 핵심 지표',
      benchMatrix: '02 프로덕션 스택',
      aboutMission: '비전 · 로드맵',
      aboutFounder: '창업자 프로필',
    },
    appPreview: {
      code: 'LIVE BUILD · 4모드 실시간 연동 캡처',
      eyebrow: '실구동 MVP · 상단 한/영 · 다크/라이트 전환 즉시 동기화',
      title: '개발 중인 A inventory 모바일 앱 프리뷰',
      description:
        '최신 React 19 · Capacitor 8 · Three.js · Google Maps Platform 실구동 빌드 캡처입니다. 상단의 한/영 또는 다크/라이트 버튼을 누르면 앱 프리뷰 화면도 함께 즉시 전환됩니다.',
      badge: '16종 실시간 연동',
      syncHint: '사이트 언어 · 테마와 실시간 동기화',
      screens: [
        {
          id: 'outfits',
          tabLabel: '코디',
          title: '멀티앵글 코디 스튜디오',
          caption: '실시간 날씨 연동 플랫레이 룩북 · 0°~360° 회전 피팅 & TPO 코디 해설',
          metricTag: '8앵글 · 날씨연동',
          imageAlt: 'A inventory 모바일 앱 코디 스튜디오 프리뷰',
        },
        {
          id: 'closet',
          tabLabel: '옷장',
          title: '253벌 디지털 옷장 그리드',
          caption: '무채색 스쿼클 카드 · 착용 횟수 배지 & 스마트 세탁 바구니 연동',
          metricTag: '253벌 · 스마트케어',
          imageAlt: 'A inventory 모바일 앱 디지털 옷장 프리뷰',
        },
        {
          id: 'stats',
          tabLabel: '통계',
          title: '옷장 벤토 인텔리전스',
          caption: '캡슐 활용률 링 · 누적 착용 횟수 · 1회 평균 착용 단가(CPW) 분석',
          metricTag: 'CPW · 텔레메트리',
          imageAlt: 'A inventory 모바일 앱 옷장 통계 프리뷰',
        },
        {
          id: 'profile',
          tabLabel: '피부톤',
          title: '피부톤 · 체형 · 밀도 스튜디오',
          caption: '온디바이스 MST-04 피부톤 메시 · 새깅/비침 시뮬레이션 & 코디 밀도',
          metricTag: '0-BYTE 로컬 ML',
          imageAlt: 'A inventory 모바일 앱 피부톤 및 체형 스튜디오 프리뷰',
        },
      ],
    },
    hero: {
      kicker: 'AINVTRY.COM · 프라이빗 3D 디지털 옷장 아틀리에',
      titleLead: '나만의 ',
      titleAccent: '3D 디지털 아틀리에',
      titleTail: ' & AI 피팅 스튜디오',
      subtitle:
        '3D 원단 물리, Gemini 멀티앵글 가상 피팅, Google Maps 날씨·세탁 케어 인텔리전스, 그리고 0-Byte 온디바이스 퍼스널컬러.',
      marbleHint: '유리 구슬을 핀볼처럼 굴려 메뉴를 맞추거나 탭해 보세요',
      primaryCta: '아틀리에 둘러보기',
      secondaryCta: '창업자 문의',
    },
    capabilities: {
      sectionCode: '01 / 04 프로덕트 브리핑',
      eyebrow: '공간 물리 엔진 · A INVENTORY',
      heading: '3D 오트 아틀리에 옷장 아키텍처',
      subheading:
        '복잡한 대시보드가 아닌 정제된 패션 갤러리와 엔지니어링 정밀함을 결합한 디지털 피팅 경험입니다.',
      badge: '작동 중인 MVP · v0.2',
      pillars: {
        atelier: {
          code: '01 / 3D 공간 물리 & 멀티 레이어링',
          eyebrow: 'THREE.JS 0.187 · 옵티컬 플로우 턴어라운드',
          title: '21-Bone 피팅 리그 & 11슬롯 정밀 레이어링',
          description:
            'Three.js 21-Bone 스켈레탈 리그, SpringBone 의류 물리, 듀얼 레이어 옵티컬 플로우 8앵글 턴어라운드로 코트 드레이프, 2단계 상의/아우터, 이너웨어 비침(VPL)·새깅 핏을 28종 체형 모프에 정밀 동기화합니다.',
          bullets: [
            'Idle · 런웨이 워킹 · 날씨 연동 우산 · 손 인스펙션 모션',
            '2단계 상의/아우터 및 이너웨어 VPL·새깅 엔진 포함 11슬롯 체계',
            '연속 0°~360° 옵티컬 플로우 보간 및 WebGL 컨텍스트 자동 복구',
          ],
        },
        ingestion: {
          code: '02 / 멀티모달 비전 & 로컬 프라이버시',
          eyebrow: '오포넌트 크로마 매팅 · 0-BYTE 생체 격리',
          title: '23 KB WebP 누끼 & 온디바이스 페이스 볼트',
          description:
            '오포넌트 크로마 스튜디오 매팅과 8-핸들 스마트 크롭으로 원본 사진을 96% 경량화하고, MediaPipe FaceLandmarker WASM이 보정한 MST-04 안면 데이터를 로컬 IndexedDB 페이스 메모리 볼트에만 격리 보관합니다.',
          bullets: [
            '단계별 의류 등록 스테퍼 · 브랜드 공식 스펙 동기화 · Gemini 자동 태깅',
            '2K 멀티앵글 VTON 및 자동 비전 품질 검수(QC) · 단일 각도 리페어',
            '다중 얼굴 진단·수동 보정 모달 — 안면 원본 이미지 서버 전송 0 Bytes',
          ],
        },
        intelligence: {
          code: '03 / 의류 케어 · TPO · 옷장 경제학',
          eyebrow: '스마트 세탁 바구니 · 주변 케어 맵 · 코디 해설 엔진',
          title: '착용 단가(CPW), 스마트 케어 & TPO 인텔리전스',
          description:
            '1회 착용 단가 분석을 넘어 세탁 라벨·이염 위험도 기반 스마트 세탁 바구니와 Google Places 주변 세탁소·수선실 지도를 연결하고, 날씨·UV 특보와 TPO 코디 추천 근거를 설명합니다.',
          bullets: [
            '설명 가능한 코디 추천 해설 엔진 (TPO · 날씨 · 코디 밀도 · 컬러 조화)',
            '이염 위험 감지 스마트 세탁 바구니 & Google Places 주변 케어 맵',
            'UV 지수 연동 선글라스/모자 추천 & 오프라인 중복 구매 판독',
          ],
        },
        privacy: {
          code: '04 / 소버린 프라이버시',
          eyebrow: '온디바이스 WASM · INDEXEDDB 볼트',
          title: '무전송 안면 메모리 볼트 & 오프라인 우선 동기화',
          description:
            '얼굴 랜드마크 추출과 조명 보정이 기기 내 WebAssembly에서만 실행됩니다. IndexedDB와 Capacitor 8 기반으로 오프라인에서도 빠르고 안전하게 작동합니다.',
          bullets: [
            '사전 동의 카메라 게이트 및 다중 얼굴 수동 보정 모달 제공',
            'Apple · Google · 이메일 6자리 OTP 인증 및 원탭 영구 삭제',
            '단일 React 19 + TypeScript 코드베이스로 iOS · Android 동시 배포',
          ],
        },
      },
    },
    architecture: {
      eyebrow: 'SYSTEM ARCHITECTURE · 테크니컬 IR 브리핑',
      heading: '4계층 공간 물리 · 멀티모달 AI · 지오 컨텍스트 스택',
      badge: '126+ 모듈 · 210 테스트',
      inspectorLabel: '선택 계층 상세 스펙',
      modulesLabel: '실구동 핵심 모듈',
      guaranteeLabel: '보안 경계 & SLA 보장',
      layers: [
        {
          id: 'spatial',
          shortCode: 'L1',
          shortLabel: '3D 엔진',
          tier: 'L1 · CLIENT GPU',
          boundary: 'WEBGL2 + GLSL',
          title: '공간 3D 피팅 & 턴어라운드 렌더링 엔진',
          subtitle: 'Three.js 0.187 · 21-Bone 리그 · 듀얼 레이어 옵티컬 플로우 8앵글',
          summary:
            '실시간 21-Bone 스켈레탈 모션, SpringBone 원단 물리, 28종 체형 모프 타겟, GLSL 실크·유리 구슬 셰이더, 연속 8앵글 360° 턴어라운드 모핑과 WebGL 자동 복구를 담당합니다.',
          modules: [
            'loginThreeScenes.ts (GLSL 실크 · 구슬)',
            'vton2DService.ts (8앵글 옵티컬 플로우)',
            'underwearStylingEngine.js (VPL · 새깅 핏)',
            'stageLightingEngine.ts (실내 조명 보정)',
          ],
          guarantee: '60fps 타겟 · WebGL 손실 시 2D 플랫레이 에디토리얼 즉시 폴백',
          latencyOrBudget: '16.6ms 프레임 예산',
        },
        {
          id: 'multimodal',
          shortCode: 'L2',
          shortLabel: 'Gemini',
          tier: 'L2 · CLOUD AI',
          boundary: 'GEMINI & VERTEX',
          title: '멀티모달 비전 · 2K VTON & 코디 해설 AI',
          subtitle: '@google/genai 3.6 · 자동 비전 QC 루프 · 설명 가능한 코디 해설',
          summary:
            '의류 원단·계절·색상 자동 추론, 브랜드 공식 정보 동기화, 2K 멀티앵글 VTON 프로그레시브 스트리밍, 비전 QC 미들웨어 자동 검수·각도 리페어 및 TPO/날씨 기반 추천 사유 생성을 오케스트레이션합니다.',
          modules: [
            'server/garmentVisionService.js',
            'server/vtonService.js + vtonQcMiddleware.js',
            'outfitRationaleEngine.ts (TPO · 날씨 해설)',
            'vtonStageProgress.ts (단계별 스트리밍)',
          ],
          guarantee: '자동 비전 QC 게이트 · 오포넌트 크로마 의류 외곽선 보호',
          latencyOrBudget: '2K 멀티앵글 VTON',
        },
        {
          id: 'maps',
          shortCode: 'L3',
          shortLabel: 'Maps',
          tier: 'L3 · GEO-CONTEXT',
          boundary: 'SERVER-ONLY PROXY',
          title: 'Google Maps Platform 날씨 · 장소 · 케어 파이프라인',
          subtitle: 'Weather API v1 · Places API (New) · Street View 프리체크 · 케어 맵',
          summary:
            '서버 전용 프록시로 Google Weather API v1(실시간 날씨·예보·기상특보·UV), 최소 FieldMask 기반 Places API (New)(TPO 실제 장소 배경·주변 세탁/수선/가죽케어 지도), 무료 Street View 메타데이터 사전 조회를 연동합니다.',
          modules: [
            'server/googleWeatherService.js (v1 · 특보)',
            'server/mapsProxyService.js (Places New)',
            'server/mapsBackdropService.js (무캐시 프록시)',
            'garmentCareEngine.ts + NearbyCareMapModal',
          ],
          guarantee: '미디어 영구 DB 캐싱 0건 · API 키 서버 격리 · 무료 메타데이터 선조회',
          latencyOrBudget: '20분 날씨 TTL 캐시',
        },
        {
          id: 'privacy',
          shortCode: 'L4',
          shortLabel: '프라이버시',
          tier: 'L4 · SOVEREIGN EDGE',
          boundary: '0-BYTE LOCAL WASM',
          title: '온디바이스 생체 격리 · 페이스 볼트 & 네이티브',
          subtitle: 'MediaPipe WASM · IndexedDB 페이스 메모리 · Express 5 + sql.js · Capacitor 8',
          summary:
            'MediaPipe FaceLandmarker가 100% 기기 내 WASM에서 다중 얼굴 진단·수동 보정과 피부톤 보정을 수행하고 로컬 IndexedDB에 격리 저장합니다. Express 5, sql.js WASM SQLite, Capacitor 8로 네이티브 동기화합니다.',
          modules: [
            'skinToneAnalyzer.ts + faceAnalysisDiagnostics.ts',
            'faceMemoryStore.ts (IndexedDB 페이스 볼트)',
            'laundryBasketStore.ts + stylingPreferenceStore.ts',
            'Capacitor 8 (iOS · Android 네이티브 브리지)',
          ],
          guarantee: '외부 서버로 안면 생체 원본 프레임 전송 0 Bytes 보장',
          latencyOrBudget: '100% 오프라인 우선',
        },
      ],
      mapsEyebrow: 'GOOGLE CLOUD & MAPS PLATFORM 통합 파이프라인',
      mapsHeading: '약관 준수형 컨텍스트 · 날씨 · 케어 아키텍처',
      mapsSub:
        '모든 Google Maps·Weather 호출은 Express 5 서버 프록시, 최소 X-Goog-FieldMask, 솔루션 어트리뷰션 헤더 및 미디어 무저장 원칙을 준수합니다.',
      mapsComplianceFooter:
        'GMP 약관 엄격 준수 · 서버 전용 API 키 격리 · Street View 무료 메타데이터 사전 검증 · 영구 미디어 캐싱 0건',
      mapsNodes: [
        {
          code: '01 · WEATHER v1',
          apiName: 'Google Weather API v1',
          role: '실황 · 예보 · 기상특보 · UV',
          detail:
            '한파·호우·대설·폭염 특보와 UV 지수를 정규화해 스튜디오 기상 배너, 우산 자동 장착 및 선글라스/모자 제안을 트리거합니다.',
          compliance: '20~30분 메모리 TTL',
        },
        {
          code: '02 · PLACES NEW',
          apiName: 'Places API (New)',
          role: 'TPO 장소 검색 & 주변 케어 맵',
          detail:
            '실제 방문할 TPO 장소를 배경으로 검색하고, 세탁 라벨에 맞는 주변 드라이클리닝·수선실·가죽케어 매장을 지도에 표시합니다.',
          compliance: '최소 X-Goog-FieldMask',
        },
        {
          code: '03 · STREET VIEW',
          apiName: 'Place Photos & Street View',
          role: '실제 장소 라이브 피팅 배경',
          detail:
            '유료 이미지 요청 전 무료 streetview/metadata 프리체크를 선행해 아바타 뒤에 실제 방문 장소의 자연광 배경을 합성합니다.',
          compliance: '미디어 DB 영구저장 금지',
        },
        {
          code: '04 · GEMINI AI',
          apiName: 'Gemini & Vertex 멀티모달',
          role: '의류 비전 · 2K VTON · 해설',
          detail:
            '날씨·TPO 장소·퍼스널컬러·11슬롯 의류 체계를 통합해 2K 멀티앵글 가상 피팅과 설명 가능한 코디 해설 카드를 생성합니다.',
          compliance: '자동 비전 QC 미들웨어',
        },
      ],
    },
    interactive: {
      stanceIdle: '기본 대기',
      stanceWalk: '런웨이 워킹',
      stanceRain: '우산 모드',
      rigLabel: '스켈레탈 · 레이어링',
      rigValue: '21 Bones · 11 Slots',
      rigMeta: 'SpringBone + VPL·새깅 핏',
      morphLabel: '체형 모프 · 턴어라운드',
      morphValue: '28 Morphs · 8-Angle',
      morphMeta: '옵티컬 플로우 360° 동기화',
      pccsNote: 'PCCS 12톤 & MST-04 퍼스널컬러 조화',
      beforeLabel: '원본 촬영 사진',
      afterLabel: '알파 매팅 WEBP',
      sliderHint: '좌우로 드래그해 원본과 WebP 누끼 결과를 비교하세요',
      ingestionBadge: '오포넌트 크로마 매팅 · GEMINI VISION',
      ingestionMeta: '582 KB → 23 KB WebP (-96%) · 11슬롯 자동 분류',
      cpwLabel: '평균 1회 착용 단가',
      cpwValue: '₩14,200',
      cpwDelta: '전월 대비 -18% 효율 개선',
      balanceLabel: '캡슐 옷장 활용률',
      balanceValue: '98.4%',
      balanceMeta: '스마트 세탁 · 이염 충돌 0건',
      dupTitle: '스마트 케어 & 주변 케어 맵',
      dupStatus: 'GMP 연동',
      dupDesc:
        '세탁 라벨·이염 규칙 기반 스마트 세탁 바구니와 Google Places (New)로 주변 드라이클리닝·수선·가죽케어 매장을 즉시 탐색합니다.',
      ootdDate: 'UV · TPO',
      ootdTitle: '기상특보 & 설명 가능한 코디 해설',
      ootdMeta: 'Google Weather v1 · UV 액세서리 · 우산 자동 연동',
      topologyTitle: '무전송 생체 격리 & 페이스 메모리 토폴로지',
      topologySteps: [
        { title: '로컬 카메라', sub: '다중 얼굴 진단' },
        { title: 'MediaPipe WASM', sub: '100% 로컬 MST-04' },
        { title: 'IndexedDB 볼트', sub: '페이스 메모리 격리' },
      ],
      topologyFooterLeft: '안면 생체 외부 서버 업로드',
      topologyFooterRight: '0 BYTES TRANSMITTED',
    },
    stack: {
      eyebrow: 'ENGINEERING SCORECARD · IR 핵심 벤치마크',
      heading: '실제 코드베이스 기반 프로덕션 스펙 및 지표',
      note: '모든 수치는 실구동 리포지토리 테스트·빌드 실측값 기준',
      heroKpis: [
        {
          value: '210+',
          label: '자동화 단위 테스트',
          sub: 'VTON · 날씨 · Maps · 케어 29개 스위트 검증',
        },
        {
          value: '4 APIs',
          label: 'Google Cloud · Maps',
          sub: 'Gemini · Weather v1 · Places New · Street View',
        },
        {
          value: '0 Bytes',
          label: '안면 생체 외부 전송',
          sub: '100% 로컬 MediaPipe WASM + 페이스 볼트',
        },
        {
          value: '-96%',
          label: '의류 누끼 경량화',
          sub: '582 KB 원본 사진 → 23 KB 알파 WebP 정규화',
        },
      ],
      benchmarkTitle: '핵심 엔진 효율 및 커버리지 벤치마크',
      bars: [
        {
          label: '의류 에셋 경량화 (오포넌트 크로마 WebP 정규화)',
          valueText: '96.0% 절감 (23 KB)',
          detail: '582 KB 원본 JPEG → 23 KB 투명 알파 WebP 자동 압축',
          pct: 96,
        },
        {
          label: '온디바이스 생체 격리율 (MediaPipe FaceLandmarker)',
          valueText: '100% 로컬 WASM',
          detail: '안면 원본 프레임 외부 전송 0 Bytes · IndexedDB 페이스 볼트',
          pct: 100,
        },
        {
          label: '360° 멀티앵글 커버리지 (듀얼 레이어 옵티컬 플로우)',
          valueText: '8앵글 · 28 모프',
          detail: '0°~360° 연속 실루엣·내부 옵티컬 플로우 턴어라운드 보간',
          pct: 88,
        },
        {
          label: '의류 분류 · 레이어링 깊이 (클라이언트·서버 공유 엔진)',
          valueText: '11슬롯 · 253+ 아이템',
          detail: '2단계 상의/아우터 · VPL/새깅 시뮬레이션 · 스마트 케어 규칙',
          pct: 92,
        },
      ],
      cards: [
        {
          eyebrow: '3D & KINEMATICS',
          metric: 'Three.js 0.187',
          title: '21-Bone 리그 · GLSL · 옵티컬 플로우',
          detail: 'SpringBone 의류 물리, 28종 체형 모프, 8앵글 턴어라운드 및 GLSL 실크 셰이더.',
          boundary: 'CLIENT GPU',
        },
        {
          eyebrow: 'MULTIMODAL AI',
          metric: 'Gemini 3.6',
          title: '비전 태깅 · 2K VTON · QC 게이트',
          detail: '멀티앵글 가상 피팅 스트리밍, 자동 QC 각도 리페어 및 설명 가능한 코디 해설.',
          boundary: 'CLOUD AI',
        },
        {
          eyebrow: 'GEO & WEATHER',
          metric: 'Google Maps',
          title: 'Weather v1 · Places · Street View',
          detail: '기상특보·UV 액세서리 제안, TPO 실제 장소 배경 및 주변 케어 맵 프록시.',
          boundary: 'SERVER PROXY',
        },
        {
          eyebrow: 'LOCAL PRIVACY',
          metric: 'MediaPipe',
          title: '온디바이스 MST-04 · 페이스 볼트',
          detail: '다중 얼굴 수동 보정 진단과 무전송 IndexedDB 페이스 메모리 격리 저장.',
          boundary: '0-BYTE LOCAL',
        },
        {
          eyebrow: 'DOMAIN ENGINES',
          metric: 'Care & Fit',
          title: '스마트 세탁 · VPL · TPO 엔진',
          detail: '세탁 라벨·이염 규칙, 이너웨어 비침/새깅 시뮬레이션 및 중복 구매 판독.',
          boundary: 'SHARED ESM',
        },
        {
          eyebrow: 'HYBRID RUNTIME',
          metric: 'Capacitor 8',
          title: 'React 19 · Express 5 · sql.js',
          detail: 'TypeScript 7 strict, Tailwind 4, 오프라인 우선 IndexedDB 및 iOS/Android 브리지.',
          boundary: 'CROSS-PLATFORM',
        },
      ],
    },
    vision: {
      eyebrow: 'EXECUTIVE IR DOSSIER · 로드맵',
      heading: '공간 물리 · 컨텍스트 AI로 옷장의 마찰과 중복 소비를 해결합니다',
      irBadge: 'INVESTOR & STARTUP BRIEFING · 2026',
      quote:
        '“내 옷장 속 모든 옷이 실제 드레이프 물리, 실시간 날씨·장소 컨텍스트, 스마트 세탁 케어, 투명한 1회 착용 단가와 연결되면 우리는 이미 가진 옷을 더 창의적으로 입고 중복 구매를 멈출 수 있습니다.”',
      body: 'Ainvtry(제품명: A inventory)는 서울 기반의 독립 AI 패션테크 스타트업입니다. Three.js 3D 렌더링, Google Gemini 멀티모달 파이프라인, Google Maps Platform 날씨·장소·케어 연동, 온디바이스 프라이버시 ML을 통합한 작동 MVP를 완성해 iOS App Store 및 Google Play 정식 출시를 준비 중입니다.',
      roadmapTitle: '실행 마일스톤',
      milestones: [
        {
          phase: 'PHASE 01',
          status: 'done',
          title: '3D 아틀리에 · 8앵글 VTON · 로컬 WASM 프라이버시',
          detail: '21-Bone 리그, 28 모프, 오포넌트 크로마 매팅, MediaPipe MST-04 볼트 구축.',
        },
        {
          phase: 'PHASE 02',
          status: 'done',
          title: 'Google Maps Platform 날씨 · 장소 · 스마트 케어 통합',
          detail: 'Weather v1 특보, UV 제안, TPO 실제 장소 배경, 세탁 바구니 & 주변 케어 맵 완료.',
        },
        {
          phase: 'PHASE 03',
          status: 'active',
          title: '프라이빗 베타 · Google Cloud 스케일업 & 스토어 출시',
          detail: 'Vertex AI · Cloud Run 프로덕션 스케일링 및 iOS · Android 정식 출시.',
        },
      ],
      statusMvp: '210+ 테스트 · 실구동 MVP 완료',
      statusRelease: 'iOS · Android 정식 출시 준비',
      founderRole: '창업자 & 프로덕트 엔지니어 · Ainvtry',
      founderBio:
        'Three.js 공간 그래픽스, Gemini & Vertex AI 가상 피팅 파이프라인, Google Maps Platform 지오 컨텍스트 프록시, 로컬 WASM 생체 분석, Capacitor 모바일 배포까지 제품 아키텍처 전반을 설계·개발합니다.',
      hqLabel: '거점',
      hqValue: '대한민국 서울',
      domainLabel: '공식 도메인',
      stackSummaryLabel: '클라우드 인프라',
      stackSummaryValue: 'Google Cloud · Gemini · Maps Platform',
      directCta: '창업자에게 바로 메일 보내기',
    },
    footer: {
      summary:
        'Ainvtry (A inventory) — 3D 디지털 옷장 아틀리에 & AI 가상 피팅 스튜디오 · 서울.',
      rights: '© 2026 Ainvtry. All rights reserved.',
      privacy: '개인정보처리방침',
      terms: '이용약관',
      contact: '문의',
      backToTop: '맨 위로',
    },
    legal: {
      closeLabel: '법적 고지 닫기',
      updatedAt: '시행일 2026년 11월 22일 · ainvtry.com',
      privacyTitle: '개인정보처리방침',
      privacySections: [
        {
          heading: '1. 온디바이스 생체 처리 및 페이스 메모리 볼트 원칙',
          body: 'Ainvtry는 안면 피부톤 랜드마크 분석을 사용자 기기 내 클라이언트 MediaPipe WebAssembly에서만 수행하며 보정된 페이스 메모리는 로컬 IndexedDB에만 저장합니다. 피부톤 보정 목적의 안면 카메라 원본 프레임은 외부 서버로 업로드되지 않습니다.',
        },
        {
          heading: '2. 의류 · AI 피팅 및 위치 컨텍스트 처리',
          body: '배경 제거 또는 Gemini 가상 피팅을 위해 사용자가 명시적으로 제출한 의류 이미지만 요청된 결과 생성에 활용됩니다. 선택적 날씨·주변 케어 맵 조회는 서버 전용 프록시를 통해 처리되며 지도 미디어는 영구 DB에 저장하지 않습니다.',
        },
        {
          heading: '3. 계정 보안 및 즉시 영구 삭제',
          body: 'Apple 로그인, Google 로그인 및 이메일 6자리 OTP 인증을 지원하며, 사용자는 언제든 계정 설정에서 계정과 모든 옷장 데이터를 즉시 영구 삭제할 수 있습니다.',
        },
        {
          heading: '4. 개인정보 보호 문의',
          body: '개인정보 관련 문의 및 삭제 요청은 창업자 공식 이메일(raymond@ainvtry.com)로 직접 연락해 주시기 바랍니다.',
        },
      ],
      termsTitle: '이용약관',
      termsSections: [
        {
          heading: '1. 서비스 범위',
          body: 'Ainvtry(ainvtry.com, 제품명: A inventory)는 3D 디지털 옷장 관리, AI 의류 속성 분석, 멀티앵글 가상 피팅 프리뷰, 의류 케어 가이드 및 날씨·TPO OOTD 플래닝 도구를 제공합니다.',
        },
        {
          heading: '2. 사용자 콘텐츠 소유권',
          body: '사용자가 업로드한 모든 의류 사진, 코디 기록 및 메모의 소유권은 전적으로 사용자에게 있으며, Ainvtry는 요청된 기능의 렌더링과 처리에 필요한 제한적 기술 라이선스만 행사합니다.',
        },
        {
          heading: '3. AI 프리뷰 및 케어 가이드 고지',
          body: '가상 피팅 렌더링, 코디 추천 해설 및 세탁 케어 안내는 의사결정을 돕는 시각·정보 보조 도구이며 제3자 의류 브랜드의 실제 치수나 공식 세탁 라벨 표기를 대체하지 않습니다.',
        },
        {
          heading: '4. 운영자 및 문의처',
          body: '공식 운영: Ainvtry (창업자 Raymond Moon, 대한민국 서울). 공식 문의: raymond@ainvtry.com.',
        },
      ],
    },
  },
};
