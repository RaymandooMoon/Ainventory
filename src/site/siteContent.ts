export type SiteLang = 'en' | 'ko';
export type SiteTheme = 'dark' | 'light';
export type LegalDocKind = 'privacy' | 'terms';
export type SiteViewId = 'home' | 'studio' | 'technology' | 'benchmarks' | 'about';
export type AppPreviewScreenId = 'outfits' | 'closet' | 'stats' | 'profile';

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

export interface SiteBenchmarkRow {
  readonly label: string;
  readonly valueText: string;
  readonly detail: string;
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
    readonly specs: readonly SiteBenchmarkRow[];
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
      studioPreview: 'Live App',
      studioAtelier: '3D Fitting',
      studioIntel: 'Care & Schedule',
      archStack: 'System Stack',
      archMaps: 'Maps & Weather',
      archCutoutPrivacy: 'Image & Privacy',
      benchKpi: 'Key Metrics',
      benchMatrix: 'Tech Stack',
      aboutMission: 'Vision & Roadmap',
      aboutFounder: 'Founder',
    },
    appPreview: {
      code: 'A inventory · Mobile App',
      eyebrow: 'Live build capture',
      title: 'A inventory in active development',
      description:
        'Real screens from our React 19 + Capacitor mobile build. Switching language or theme at the top updates the preview alongside the site.',
      badge: '4-Mode Sync',
      syncHint: 'Matches site language and theme',
      screens: [
        {
          id: 'outfits',
          tabLabel: 'Fitting',
          title: 'Multi-Angle Fitting Room',
          caption: '0°–360° turnaround preview with live weather and place backdrop',
          metricTag: '360°',
          imageAlt: 'A inventory mobile app multi-angle fitting studio',
        },
        {
          id: 'closet',
          tabLabel: 'Closet',
          title: 'Digital Closet',
          caption: '253-item catalog, wear counter, and care-aware laundry basket',
          metricTag: '253 items',
          imageAlt: 'A inventory mobile app digital closet view',
        },
        {
          id: 'stats',
          tabLabel: 'Stats',
          title: 'Wear & Cost Records',
          caption: 'Closet utilization, cumulative wears, and cost-per-wear tracking',
          metricTag: 'CPW',
          imageAlt: 'A inventory mobile app wear and cost analytics',
        },
        {
          id: 'profile',
          tabLabel: 'Profile',
          title: 'Tone & Fit Calibration',
          caption: 'On-device skin-tone sampling, body measurements, and fit tuning',
          metricTag: 'Local',
          imageAlt: 'A inventory mobile app skin-tone and body calibration',
        },
      ],
    },
    hero: {
      kicker: 'AINVTRY.COM · A INVENTORY',
      titleLead: 'Your wardrobe, ',
      titleAccent: 'fitted in 3D',
      titleTail: ' before you wear it.',
      subtitle:
        'Cloth physics, multi-angle try-on, live weather and place backdrops, and private skin-tone calibration on your device.',
      marbleHint: 'Roll the marble into any menu below, or tap to open',
      primaryCta: 'Open Studio',
      secondaryCta: 'Contact Founder',
    },
    capabilities: {
      sectionCode: 'Product',
      eyebrow: 'A inventory',
      heading: 'Built around the clothes you actually own',
      subheading: 'Calm, accurate tools for planning outfits, fit, and garment care.',
      badge: 'MVP v0.2',
      pillars: {
        atelier: {
          code: '3D Fitting',
          eyebrow: 'Three.js 0.187 · Turnaround',
          title: '21-Bone Rig & 11-Slot Layering',
          description:
            'A 21-bone skeletal rig, lightweight SpringBone cloth motion, and 8-angle optical-flow turnaround let you check coat length, layered tops, underwear show-through, and relaxed fits across 28 body proportions.',
          bullets: [
            'Idle, walking, umbrella, and hand-pose motion states',
            '11 garment slots covering inner layers, outerwear, and fit rules',
            'Automatic 2D fallback whenever WebGL context is unavailable',
          ],
        },
        ingestion: {
          code: 'Image & Privacy',
          eyebrow: 'Background separation · Local face vault',
          title: 'Clean Garment Separation & On-Device Skin Tone',
          description:
            'Studio background separation reduces a 582 KB raw garment photo down to a 23 KB WebP asset. Facial skin-tone calibration runs locally in MediaPipe WebAssembly and stays inside IndexedDB.',
          bullets: [
            'Step-by-step garment registration with brand metadata lookup',
            '2K multi-angle try-on with automated quality check and angle repair',
            'Multi-face manual selection with zero raw facial uploads',
          ],
        },
        intelligence: {
          code: 'Care & Schedule',
          eyebrow: 'Laundry rules · Nearby care map · Weather',
          title: 'Wear Economics, Garment Care & Real Weather',
          description:
            'Track cost per wear alongside care-label laundry rules, locate nearby dry-cleaners and tailors through Google Places, and check weather alerts with clear outfit notes before heading out.',
          bullets: [
            'Plain-language outfit notes explaining weather, TPO, and fit balance',
            'Smart Laundry Basket with color-bleed warnings and nearby care map',
            'UV accessory reminders and offline duplicate-purchase checks',
          ],
        },
        privacy: {
          code: 'Privacy',
          eyebrow: 'On-device WebAssembly · IndexedDB',
          title: 'Local Biometrics & Offline-First Storage',
          description:
            'Facial landmarks and lighting calibration run entirely on your device. Your wardrobe catalog stays responsive offline via IndexedDB and syncs cleanly on iOS and Android through Capacitor 8.',
          bullets: [
            'Explicit camera permission prompt with manual face selection',
            'Apple, Google, or 6-digit email sign-in with immediate deletion',
            'Single React 19 + TypeScript codebase across web, iOS, and Android',
          ],
        },
      },
    },
    architecture: {
      eyebrow: 'System Architecture',
      heading: 'Four-layer client, AI, and geo-context design',
      badge: '4 Layers · 210+ Tests',
      inspectorLabel: 'Layer Specification',
      modulesLabel: 'Production Modules',
      guaranteeLabel: 'Boundary & Guarantee',
      layers: [
        {
          id: 'spatial',
          shortCode: 'L1',
          shortLabel: '3D GPU',
          tier: 'L1 · Client GPU',
          boundary: 'WebGL2 · GLSL',
          title: '3D Fitting & Turnaround Renderer',
          subtitle: 'Three.js 0.187 · 21-Bone Rig · 8-Angle Optical Flow',
          summary:
            'Handles real-time 21-bone animation, SpringBone drape physics, 28 body morph targets, GLSL silk and marble shaders, and smooth 8-angle turnaround transitions with automatic WebGL recovery.',
          modules: [
            'loginThreeScenes.ts (GLSL Silk & Marble)',
            'vton2DService.ts (8-Angle Optical Flow)',
            'underwearStylingEngine.js (Show-through & Fit)',
            'stageLightingEngine.ts (Studio Lighting)',
          ],
          guarantee: '60 fps target with instant 2D fallback on WebGL context loss',
          latencyOrBudget: '16.6ms budget',
        },
        {
          id: 'multimodal',
          shortCode: 'L2',
          shortLabel: 'Gemini',
          tier: 'L2 · Cloud AI',
          boundary: 'Gemini · Vertex',
          title: 'Vision Classification, Try-On & Outfit Notes',
          subtitle: '@google/genai 3.6 · Quality Check · Outfit Rationale',
          summary:
            'Classifies fabric, season, and garment attributes, streams progressive multi-angle try-on renders through an automated visual quality check, repairs broken angles, and writes clear styling notes.',
          modules: [
            'server/garmentVisionService.js',
            'server/vtonService.js + vtonQcMiddleware.js',
            'outfitRationaleEngine.ts (TPO & Weather Notes)',
            'vtonStageProgress.ts (Progressive Stream)',
          ],
          guarantee: 'Automated angle quality check and garment edge preservation',
          latencyOrBudget: '2K 8-Angle',
        },
        {
          id: 'maps',
          shortCode: 'L3',
          shortLabel: 'Maps',
          tier: 'L3 · Geo-Context',
          boundary: 'Server Proxy',
          title: 'Google Maps Platform Weather, Places & Care',
          subtitle: 'Weather v1 · Places (New) · Street View Pre-Check · Care Map',
          summary:
            'Routes all Maps and Weather requests through an Express 5 server proxy: Weather API v1 alerts and UV data, Places API (New) with minimal FieldMask for TPO backdrops and nearby care shops, and free Street View metadata checks.',
          modules: [
            'server/googleWeatherService.js (v1 & Alerts)',
            'server/mapsProxyService.js (Places New)',
            'server/mapsBackdropService.js (Zero-Cache)',
            'garmentCareEngine.ts + NearbyCareMapModal',
          ],
          guarantee: 'Zero permanent media caching, server-only keys, free metadata check',
          latencyOrBudget: '20m TTL cache',
        },
        {
          id: 'privacy',
          shortCode: 'L4',
          shortLabel: 'Device',
          tier: 'L4 · On-Device',
          boundary: 'Local WASM',
          title: 'Local Biometrics, Vault & Mobile Runtime',
          subtitle: 'MediaPipe WASM · IndexedDB · Express 5 + sql.js · Capacitor 8',
          summary:
            'Runs MediaPipe FaceLandmarker locally in WebAssembly with multi-face diagnostics and manual selection. Keeps face memory in local IndexedDB alongside sql.js persistence and Capacitor 8 mobile packaging.',
          modules: [
            'skinToneAnalyzer.ts + faceAnalysisDiagnostics.ts',
            'faceMemoryStore.ts (Local IndexedDB)',
            'laundryBasketStore.ts + stylingPreferenceStore.ts',
            'Capacitor 8 (iOS & Android Bridge)',
          ],
          guarantee: '0 bytes of raw facial camera frames leave the user device',
          latencyOrBudget: 'Offline-first',
        },
      ],
      mapsEyebrow: 'Google Cloud & Maps Platform',
      mapsHeading: 'ToS-compliant weather, place, and care proxy',
      mapsSub:
        'All Maps and Weather requests stay on the Express 5 server with minimal X-Goog-FieldMask, solution attribution, and zero permanent media caching.',
      mapsComplianceFooter:
        'Server-only API keys · Minimal FieldMask · Free Street View metadata pre-check · Zero permanent media storage',
      mapsNodes: [
        {
          code: '01',
          apiName: 'Google Weather API v1',
          role: 'Conditions, Forecast & Alerts',
          detail:
            'Reads severe weather alerts and UV index to update fitting studio banners, umbrella stance, and sun-protection prompts.',
          compliance: '20–30m memory TTL',
        },
        {
          code: '02',
          apiName: 'Places API (New)',
          role: 'TPO Venues & Nearby Care',
          detail:
            'Finds real venues for outfit context and maps nearby dry-cleaners, laundries, tailors, and leather-care shops.',
          compliance: 'Minimal FieldMask',
        },
        {
          code: '03',
          apiName: 'Place Photos & Street View',
          role: 'Live Location Backdrops',
          detail:
            'Checks free streetview/metadata before fetching imagery, placing real street or venue lighting behind the model.',
          compliance: 'No media DB cache',
        },
        {
          code: '04',
          apiName: 'Gemini & Vertex AI',
          role: 'Tagging, Try-On & Notes',
          detail:
            'Combines weather, place context, personal tone, and 11-slot wardrobe data into multi-angle try-on renders and outfit notes.',
          compliance: 'Visual QC check',
        },
      ],
    },
    interactive: {
      stanceIdle: 'Stand',
      stanceWalk: 'Walk',
      stanceRain: 'Rain',
      rigLabel: 'Rig & Slots',
      rigValue: '21 Bones · 11 Slots',
      rigMeta: 'SpringBone cloth & fit engine',
      morphLabel: 'Morphs & Views',
      morphValue: '28 Morphs · 8 Angles',
      morphMeta: '0°–360° optical-flow turnaround',
      pccsNote: 'PCCS 12-Tone · MST-04',
      beforeLabel: 'Original',
      afterLabel: 'Separated WebP',
      sliderHint: 'Drag to compare original photo and background-separated WebP',
      ingestionBadge: 'Background separation · Gemini Vision',
      ingestionMeta: '582 KB → 23 KB WebP (-96%) · 11-slot classification',
      cpwLabel: 'Average Cost / Wear',
      cpwValue: '₩14,200',
      cpwDelta: '-18% from last month',
      balanceLabel: 'Closet Utilization',
      balanceValue: '98.4%',
      balanceMeta: '0 color-bleed conflicts',
      dupTitle: 'Care Rules & Nearby Care Map',
      dupStatus: 'Places API',
      dupDesc:
        'Matches garment care tags with wash/bleed rules and locates nearby dry-cleaners, tailors, and leather-care shops.',
      ootdDate: 'Weather',
      ootdTitle: 'Alerts & Plain-Language Notes',
      ootdMeta: 'Weather v1 · UV accessory & umbrella guidance',
      topologyTitle: 'On-Device Facial Processing Path',
      topologySteps: [
        { title: 'Camera', sub: 'Local frame capture' },
        { title: 'MediaPipe WASM', sub: 'On-device MST-04' },
        { title: 'IndexedDB', sub: 'Local face memory' },
      ],
      topologyFooterLeft: 'External biometric upload',
      topologyFooterRight: '0 Bytes',
    },
    stack: {
      eyebrow: 'Specifications',
      heading: 'Measured codebase metrics & stack',
      note: 'Measured directly from the active repository',
      heroKpis: [
        {
          value: '210+',
          label: 'Unit Tests',
          sub: '29 suites across VTON, Weather, Maps & Care',
        },
        {
          value: '4 APIs',
          label: 'Google Cloud & Maps',
          sub: 'Gemini, Weather v1, Places (New), Street View',
        },
        {
          value: '0 Bytes',
          label: 'Face Data Uploaded',
          sub: 'Local MediaPipe WASM + IndexedDB storage',
        },
        {
          value: '23 KB',
          label: 'Normalized Garment',
          sub: '582 KB source photo → 23 KB transparent WebP',
        },
      ],
      benchmarkTitle: 'Verified Technical Specifications',
      specs: [
        {
          label: 'Garment image optimization',
          valueText: '582 KB → 23 KB (-96%)',
          detail: 'Automated studio background separation into transparent WebP',
        },
        {
          label: 'On-device biometric isolation',
          valueText: '0 Bytes transmitted',
          detail: 'MediaPipe FaceLandmarker WASM + local IndexedDB memory',
        },
        {
          label: '3D & multi-angle turnaround',
          valueText: '21 Bones · 28 Morphs · 8 Angles',
          detail: 'Three.js 0.187 rig paired with continuous 0°–360° optical flow',
        },
        {
          label: 'Wardrobe taxonomy & care rules',
          valueText: '11 Slots · 253+ catalog items',
          detail: 'Shared client/server fit, show-through, and laundry-care engine',
        },
      ],
      cards: [
        {
          eyebrow: '3D Graphics',
          metric: 'Three.js 0.187',
          title: 'Rigging, Shaders & Optical Flow',
          detail: '21-bone rig, SpringBone drape, 28 body morphs, and 8-angle turnaround.',
          boundary: 'WebGL2',
        },
        {
          eyebrow: 'Multimodal AI',
          metric: 'Gemini 3.6',
          title: 'Classification, 2K Try-On & QC',
          detail: 'Progressive try-on streaming, angle quality checks, and outfit notes.',
          boundary: 'Google Cloud',
        },
        {
          eyebrow: 'Location & Weather',
          metric: 'Google Maps',
          title: 'Weather v1, Places & Street View',
          detail: 'Server proxy for alerts, UV tips, real place backdrops, and care map.',
          boundary: 'Server Proxy',
        },
        {
          eyebrow: 'On-Device ML',
          metric: 'MediaPipe',
          title: 'Local Skin Tone & Face Memory',
          detail: 'Multi-face diagnostics and manual correction stored locally in IndexedDB.',
          boundary: 'Local WASM',
        },
        {
          eyebrow: 'Apparel Logic',
          metric: 'Care & Fit',
          title: 'Laundry, Show-Through & TPO',
          detail: 'Wash/bleed rules, inner-layer fit simulation, and duplicate purchase checks.',
          boundary: 'Shared ESM',
        },
        {
          eyebrow: 'App Runtime',
          metric: 'Capacitor 8',
          title: 'React 19, Express 5 & sql.js',
          detail: 'Strict TypeScript 7, Tailwind CSS 4, offline-first sync, iOS & Android.',
          boundary: 'Cross-Platform',
        },
      ],
    },
    vision: {
      eyebrow: 'About Ainvtry',
      heading: 'Helping people wear what they already own',
      irBadge: 'Seoul · 2026',
      quote:
        '“When you can see how your own clothes actually fit, layer, and match today’s weather before getting dressed, you get far more out of your closet—and buy fewer duplicates.”',
      body: 'Ainvtry (product: A inventory) is an independent fashion-tech startup in Seoul building a practical 3D wardrobe, virtual try-on, and garment-care app across web, iOS, and Android.',
      roadmapTitle: 'Milestones',
      milestones: [
        {
          phase: 'Stage 1',
          status: 'done',
          title: '3D Fitting Rig, 8-Angle Try-On & Local Biometrics',
          detail: '21-bone rig, 28 morphs, background separation, MediaPipe local analysis.',
        },
        {
          phase: 'Stage 2',
          status: 'done',
          title: 'Google Maps Platform Weather, Places & Smart Care',
          detail: 'Weather v1 alerts, real street/venue backdrops, laundry rules, and nearby care map.',
        },
        {
          phase: 'Stage 3',
          status: 'active',
          title: 'Private Beta, Cloud Scaling & Store Release',
          detail: 'Vertex AI / Cloud Run production deployment and iOS / Android release.',
        },
      ],
      statusMvp: '210+ tests · Working MVP',
      statusRelease: 'Preparing iOS & Android release',
      founderRole: 'Founder & Engineer · Ainvtry',
      founderBio:
        'Building Ainvtry end-to-end across Three.js graphics, Gemini virtual try-on, Google Maps Platform weather and place proxies, local WebAssembly biometrics, and Capacitor mobile apps.',
      hqLabel: 'Location',
      hqValue: 'Seoul, South Korea',
      domainLabel: 'Website',
      stackSummaryLabel: 'Cloud',
      stackSummaryValue: 'Google Cloud · Gemini · Maps Platform',
      directCta: 'Email Raymond',
    },
    footer: {
      summary: 'Ainvtry (A inventory) — 3D Digital Wardrobe & Fitting App. Built in Seoul.',
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
          heading: '1. On-Device Biometrics & Local Storage',
          body: 'Ainvtry processes facial skin-tone landmarks strictly on your device using client-side MediaPipe WebAssembly and stores calibrated face memory inside local IndexedDB. Raw facial camera frames are never uploaded to external servers for skin-tone calibration.',
        },
        {
          heading: '2. Wardrobe, Virtual Try-On & Location Context',
          body: 'Garment photos submitted for background separation or virtual try-on are processed strictly for your requested output. Optional location queries for Google Weather or Nearby Care Map pass through a server-only proxy with zero permanent media caching.',
        },
        {
          heading: '3. Account Security & Permanent Deletion',
          body: 'Users authenticate via Sign in with Apple, Google, or email 6-digit OTP. You may permanently delete your account and all associated wardrobe records immediately from Account Settings.',
        },
        {
          heading: '4. Contact',
          body: 'For privacy questions or data removal requests, contact Founder Raymond Moon at raymond@ainvtry.com.',
        },
      ],
      termsTitle: 'Terms of Service',
      termsSections: [
        {
          heading: '1. Service Scope',
          body: 'Ainvtry (ainvtry.com, product: A inventory) provides 3D digital wardrobe management, garment classification, multi-angle virtual try-on previews, garment care guidance, and weather/TPO outfit planning tools.',
        },
        {
          heading: '2. User Content Ownership',
          body: 'You retain full ownership of all wardrobe photographs, outfit logs, and notes you upload to Ainvtry. You grant Ainvtry only the limited technical license needed to render and process your requested features.',
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
      studioPreview: '라이브 앱',
      studioAtelier: '3D 피팅',
      studioIntel: '케어 · 일정',
      archStack: '시스템 구조',
      archMaps: '지도 · 날씨',
      archCutoutPrivacy: '배경 분리 · 보안',
      benchKpi: '핵심 지표',
      benchMatrix: '기술 스택',
      aboutMission: '비전 · 로드맵',
      aboutFounder: '창업자',
    },
    appPreview: {
      code: 'A inventory · 모바일 앱',
      eyebrow: '개발 중인 실구동 화면',
      title: '실제로 만들고 있는 앱 화면입니다',
      description:
        'React 19와 Capacitor로 개발 중인 최신 모바일 앱 화면입니다. 상단에서 한/영 또는 다크/라이트를 바꾸면 프리뷰도 함께 바뀝니다.',
      badge: '4모드 연동',
      syncHint: '사이트 언어 · 테마와 함께 전환',
      screens: [
        {
          id: 'outfits',
          tabLabel: '피팅',
          title: '멀티앵글 가상 피팅',
          caption: '0°–360° 회전 피팅과 실시간 날씨 · 실제 장소 배경 연동',
          metricTag: '360°',
          imageAlt: 'A inventory 모바일 앱 가상 피팅 스튜디오 화면',
        },
        {
          id: 'closet',
          tabLabel: '옷장',
          title: '디지털 옷장',
          caption: '253벌 의류 정리, 착용 횟수 기록, 세탁 바구니 관리',
          metricTag: '253벌',
          imageAlt: 'A inventory 모바일 앱 디지털 옷장 화면',
        },
        {
          id: 'stats',
          tabLabel: '통계',
          title: '착용 기록과 비용',
          caption: '옷장 활용률, 누적 착용 횟수, 1회 착용 단가 확인',
          metricTag: '착용 단가',
          imageAlt: 'A inventory 모바일 앱 옷장 통계 화면',
        },
        {
          id: 'profile',
          tabLabel: '프로필',
          title: '피부톤 · 체형 설정',
          caption: '기기 내 피부톤 분석, 체형 비율 조절, 핏 설정',
          metricTag: '로컬 분석',
          imageAlt: 'A inventory 모바일 앱 피부톤 및 체형 설정 화면',
        },
      ],
    },
    hero: {
      kicker: 'AINVTRY.COM · A INVENTORY',
      titleLead: '입어보기 전에 ',
      titleAccent: '먼저 맞춰보는',
      titleTail: ' 나만의 3D 옷장',
      subtitle:
        '옷감의 움직임, 멀티앵글 가상 피팅, 날씨와 장소에 맞춘 코디, 그리고 기기 안에서 끝나는 피부톤 분석.',
      marbleHint: '유리 구슬을 굴려 아래 메뉴를 맞추거나 눌러서 이동해 보세요',
      primaryCta: '스튜디오 보기',
      secondaryCta: '창업자 문의',
    },
    capabilities: {
      sectionCode: '제품 소개',
      eyebrow: 'A inventory',
      heading: '이미 가진 옷을 제대로 입기 위한 도구',
      subheading: '코디 계획부터 핏 확인, 세탁 관리까지 한곳에서 정리합니다.',
      badge: 'MVP v0.2',
      pillars: {
        atelier: {
          code: '3D 피팅',
          eyebrow: 'Three.js 0.187 · 8앵글 회전',
          title: '21개 관절 리그와 11슬롯 레이어링',
          description:
            'Three.js 기반 21개 관절 리그, SpringBone 원단 움직임, 8앵글 옵티컬 플로우 회전으로 코트 기장, 상의 겹쳐 입기, 이너 비침과 새깅 핏까지 28가지 체형 비율에 맞춰 확인합니다.',
          bullets: [
            '기본 자세, 워킹, 우산 들기, 손 디테일 동작 지원',
            '이너웨어부터 아우터까지 11개 의류 슬롯 레이어링',
            'WebGL 컨텍스트 손실 시 2D 화면으로 즉시 전환',
          ],
        },
        ingestion: {
          code: '배경 분리 · 보안',
          eyebrow: '의류 배경 분리 · 기기 내 피부톤 분석',
          title: '깔끔한 의류 배경 분리와 로컬 페이스 저장',
          description:
            '스튜디오 배경 분리 파이프라인으로 582 KB 원본 의류 사진을 23 KB 투명 WebP로 가볍게 정리합니다. 얼굴 피부톤 분석은 기기 내 MediaPipe WASM에서만 실행되고 로컬 IndexedDB에 저장됩니다.',
          bullets: [
            '단계별 의류 등록과 브랜드 공식 정보 자동 조회',
            '2K 멀티앵글 가상 피팅과 자동 품질 검수 · 각도 보정',
            '다중 얼굴 직접 선택 지원, 얼굴 원본 외부 전송 0 Bytes',
          ],
        },
        intelligence: {
          code: '케어 · 일정',
          eyebrow: '세탁 관리 · 주변 케어 지도 · 실시간 날씨',
          title: '착용 단가, 세탁 관리, 날씨 맞춤 코디',
          description:
            '옷별 1회 착용 단가와 세탁 라벨 규칙을 함께 관리하고, Google Places 지도로 가까운 세탁소·수선실·가죽케어 매장을 찾습니다. 외출 전 날씨 특보와 코디 이유를 간단히 확인합니다.',
          bullets: [
            '날씨, 방문 장소, 스타일 밀도를 반영한 알기 쉬운 코디 설명',
            '이염 주의 세탁 바구니와 주변 드라이클리닝 · 수선실 지도',
            '자외선 지수에 따른 선글라스·모자 제안 및 중복 구매 확인',
          ],
        },
        privacy: {
          code: '프라이버시',
          eyebrow: '기기 내 WebAssembly · IndexedDB',
          title: '얼굴 원본 무전송 & 오프라인 우선 구조',
          description:
            '안면 피부톤 측정과 조명 보정은 100% 기기 안에서 처리합니다. 등록한 옷장은 IndexedDB에 저장되어 오프라인에서도 빠르게 열리며 Capacitor 8로 iOS와 Android를 함께 지원합니다.',
          bullets: [
            '카메라 사용 전 명시적 동의 및 수동 얼굴 선택 모달',
            'Apple · Google · 이메일 6자리 코드 로그인 및 즉시 계정 삭제',
            'React 19 · TypeScript 단일 코드베이스로 웹과 모바일 동시 배포',
          ],
        },
      },
    },
    architecture: {
      eyebrow: '시스템 구조',
      heading: '클라이언트 3D, 클라우드 모델, 지도 · 날씨 프록시 4계층',
      badge: '4계층 · 210+ 테스트',
      inspectorLabel: '선택 계층 상세',
      modulesLabel: '주요 구현 모듈',
      guaranteeLabel: '보안 경계 및 보장',
      layers: [
        {
          id: 'spatial',
          shortCode: 'L1',
          shortLabel: '3D 엔진',
          tier: 'L1 · 클라이언트 GPU',
          boundary: 'WebGL2 · GLSL',
          title: '3D 피팅 및 8앵글 회전 렌더러',
          subtitle: 'Three.js 0.187 · 21개 관절 · 8앵글 옵티컬 플로우',
          summary:
            '21개 관절 모션, SpringBone 옷감 물리, 28가지 체형 모프, GLSL 실크·유리 구슬 셰이더, 0°–360° 8앵글 회전 보간을 브라우저 GPU에서 처리하며 WebGL 복구 폴백을 포함합니다.',
          modules: [
            'loginThreeScenes.ts (GLSL 실크 · 구슬)',
            'vton2DService.ts (8앵글 옵티컬 플로우)',
            'underwearStylingEngine.js (비침 · 새깅 핏)',
            'stageLightingEngine.ts (실내 조명 보정)',
          ],
          guarantee: '60fps 목표 · WebGL 손실 시 2D 화면 즉시 전환',
          latencyOrBudget: '16.6ms 예산',
        },
        {
          id: 'multimodal',
          shortCode: 'L2',
          shortLabel: 'Gemini',
          tier: 'L2 · 클라우드 모델',
          boundary: 'Gemini · Vertex',
          title: '의류 분류 · 2K 가상 피팅 · 코디 설명',
          subtitle: '@google/genai 3.6 · 품질 검수 · 코디 해설 엔진',
          summary:
            '의류 소재·계절·카테고리 분류와 브랜드 정보 조회를 처리하고, 2K 멀티앵글 가상 피팅을 단계별로 스트리밍하면서 품질 검수 미들웨어로 어긋난 각도를 자동 보정합니다.',
          modules: [
            'server/garmentVisionService.js',
            'server/vtonService.js + vtonQcMiddleware.js',
            'outfitRationaleEngine.ts (TPO · 날씨 해설)',
            'vtonStageProgress.ts (단계별 스트리밍)',
          ],
          guarantee: '자동 각도 품질 검수 · 의류 외곽선 보호 처리',
          latencyOrBudget: '2K 8앵글',
        },
        {
          id: 'maps',
          shortCode: 'L3',
          shortLabel: '지도·날씨',
          tier: 'L3 · 지도 · 날씨',
          boundary: '서버 프록시',
          title: 'Google Maps Platform 날씨 · 장소 · 케어 연동',
          subtitle: 'Weather v1 · Places (New) · Street View 사전 확인 · 케어 지도',
          summary:
            'Express 5 서버 프록시로 Google Weather API v1(실황·예보·기상특보·UV), 최소 FieldMask 기반 Places API (New)(방문 장소 배경·주변 세탁/수선 매장), 무료 Street View 메타데이터 확인을 연동합니다.',
          modules: [
            'server/googleWeatherService.js (v1 · 특보)',
            'server/mapsProxyService.js (Places New)',
            'server/mapsBackdropService.js (무저장 프록시)',
            'garmentCareEngine.ts + NearbyCareMapModal',
          ],
          guarantee: '미디어 영구 DB 저장 0건 · API 키 서버 격리 · 무료 메타데이터 선조회',
          latencyOrBudget: '20분 TTL 캐시',
        },
        {
          id: 'privacy',
          shortCode: 'L4',
          shortLabel: '기기 보안',
          tier: 'L4 · 기기 내 처리',
          boundary: '로컬 WASM',
          title: '로컬 피부톤 분석 · 저장소 · 모바일 앱',
          subtitle: 'MediaPipe WASM · IndexedDB · Express 5 + sql.js · Capacitor 8',
          summary:
            'MediaPipe FaceLandmarker를 기기 내 WebAssembly로 실행해 다중 얼굴 진단과 피부톤 보정을 끝내고 로컬 IndexedDB에 보관합니다. sql.js와 Capacitor 8로 오프라인 동기화와 모바일 빌드를 지원합니다.',
          modules: [
            'skinToneAnalyzer.ts + faceAnalysisDiagnostics.ts',
            'faceMemoryStore.ts (로컬 IndexedDB)',
            'laundryBasketStore.ts + stylingPreferenceStore.ts',
            'Capacitor 8 (iOS · Android 네이티브 브리지)',
          ],
          guarantee: '얼굴 카메라 원본 프레임 외부 서버 전송 0 Bytes',
          latencyOrBudget: '오프라인 우선',
        },
      ],
      mapsEyebrow: 'Google Cloud & Maps Platform',
      mapsHeading: '약관을 준수하는 날씨 · 장소 · 케어 서버 프록시',
      mapsSub:
        '모든 Maps·Weather 호출은 Express 5 서버를 거치며 최소 X-Goog-FieldMask, 솔루션 식별 헤더, 미디어 무저장 원칙을 지킵니다.',
      mapsComplianceFooter:
        'API 키 서버 전용 격리 · 최소 FieldMask 적용 · Street View 무료 메타데이터 선조회 · 미디어 영구 저장 0건',
      mapsNodes: [
        {
          code: '01',
          apiName: 'Google Weather API v1',
          role: '실황 · 예보 · 기상특보 · UV',
          detail:
            '한파·호우·대설·폭염 특보와 자외선 지수를 반영해 날씨 배너, 우산 동작, 선글라스·모자 제안을 보여줍니다.',
          compliance: '20~30분 메모리 TTL',
        },
        {
          code: '02',
          apiName: 'Places API (New)',
          role: '방문 장소 & 주변 케어 지도',
          detail:
            '실제 방문할 장소 배경을 찾고, 의류 세탁 라벨에 맞는 가까운 드라이클리닝·수선실·가죽케어 매장을 지도에 표시합니다.',
          compliance: '최소 FieldMask',
        },
        {
          code: '03',
          apiName: 'Place Photos & Street View',
          role: '실제 장소 라이브 배경',
          detail:
            '이미지 요청 전 무료 streetview/metadata를 먼저 확인한 뒤 피팅 모델 뒤에 실제 거리와 공간 배경을 배치합니다.',
          compliance: '미디어 DB 무저장',
        },
        {
          code: '04',
          apiName: 'Gemini & Vertex AI',
          role: '의류 분류 · 가상 피팅 · 설명',
          detail:
            '날씨, 방문 장소, 피부톤, 11슬롯 옷장 데이터를 묶어 2K 멀티앵글 가상 피팅과 코디 추천 이유를 생성합니다.',
          compliance: '자동 품질 검수',
        },
      ],
    },
    interactive: {
      stanceIdle: '기본 자세',
      stanceWalk: '워킹',
      stanceRain: '우산',
      rigLabel: '관절 · 슬롯',
      rigValue: '21개 관절 · 11슬롯',
      rigMeta: 'SpringBone 원단 및 핏 엔진',
      morphLabel: '체형 · 회전',
      morphValue: '28종 모프 · 8앵글',
      morphMeta: '0°–360° 옵티컬 플로우 회전',
      pccsNote: 'PCCS 12톤 · MST-04',
      beforeLabel: '원본 사진',
      afterLabel: '배경 분리 WebP',
      sliderHint: '좌우로 드래그해 원본 사진과 배경 분리 WebP 결과를 비교하세요',
      ingestionBadge: '의류 배경 분리 · Gemini 비전 분류',
      ingestionMeta: '582 KB → 23 KB WebP (-96%) · 11슬롯 자동 분류',
      cpwLabel: '평균 1회 착용 단가',
      cpwValue: '₩14,200',
      cpwDelta: '지난달 대비 -18%',
      balanceLabel: '옷장 활용률',
      balanceValue: '98.4%',
      balanceMeta: '이염 충돌 0건',
      dupTitle: '세탁 관리 & 주변 케어 지도',
      dupStatus: 'Places 연동',
      dupDesc:
        '세탁 라벨별 주의사항과 이염 위험을 확인하고, Google Places 지도로 가까운 세탁소와 수선실을 바로 찾습니다.',
      ootdDate: '실시간 날씨',
      ootdTitle: '기상특보 & 코디 추천 이유',
      ootdMeta: 'Weather v1 · 자외선 액세서리 및 우산 안내',
      topologyTitle: '기기 내 피부톤 분석 처리 흐름',
      topologySteps: [
        { title: '카메라', sub: '기기 내 프레임 입력' },
        { title: 'MediaPipe WASM', sub: '로컬 MST-04 분석' },
        { title: 'IndexedDB', sub: '로컬 저장소 보관' },
      ],
      topologyFooterLeft: '외부 얼굴 원본 전송량',
      topologyFooterRight: '0 Bytes',
    },
    stack: {
      eyebrow: '핵심 스펙',
      heading: '실제 코드베이스 기준 구현 지표',
      note: '현재 저장소 테스트 및 빌드 실측 기준',
      heroKpis: [
        {
          value: '210+',
          label: '단위 테스트',
          sub: '피팅 · 날씨 · 지도 · 케어 29개 스위트',
        },
        {
          value: '4 APIs',
          label: 'Google Cloud · Maps',
          sub: 'Gemini, Weather v1, Places (New), Street View',
        },
        {
          value: '0 Bytes',
          label: '얼굴 원본 외부 전송',
          sub: '기기 내 MediaPipe WASM · IndexedDB 보관',
        },
        {
          value: '23 KB',
          label: '최적화 의류 이미지',
          sub: '582 KB 원본 사진 → 23 KB 투명 WebP',
        },
      ],
      benchmarkTitle: '실측 스펙 요약',
      specs: [
        {
          label: '의류 이미지 용량 최적화',
          valueText: '582 KB → 23 KB (-96%)',
          detail: '원본 사진의 배경을 분리해 투명 WebP로 자동 저장',
        },
        {
          label: '안면 데이터 기기 내 격리',
          valueText: '외부 전송 0 Bytes',
          detail: 'MediaPipe FaceLandmarker WASM 및 로컬 IndexedDB 보관',
        },
        {
          label: '3D 및 멀티앵글 회전 범위',
          valueText: '21관절 · 28모프 · 8앵글',
          detail: 'Three.js 0.187 리그와 0°–360° 연속 옵티컬 플로우 보간',
        },
        {
          label: '의류 분류 및 세탁·핏 규칙',
          valueText: '11슬롯 · 253+ 아이템',
          detail: '클라이언트·서버 공유 이너 비침/새깅 및 세탁 라벨 엔진',
        },
      ],
      cards: [
        {
          eyebrow: '3D 그래픽',
          metric: 'Three.js 0.187',
          title: '관절 리그 · 셰이더 · 옵티컬 플로우',
          detail: '21개 관절, SpringBone 원단 물리, 28종 체형 모프, 8앵글 회전.',
          boundary: 'WebGL2',
        },
        {
          eyebrow: '멀티모달 모델',
          metric: 'Gemini 3.6',
          title: '의류 분류 · 2K 피팅 · 품질 검수',
          detail: '단계별 가상 피팅 스트리밍, 각도 검수 및 코디 추천 이유 생성.',
          boundary: 'Google Cloud',
        },
        {
          eyebrow: '지도 · 날씨',
          metric: 'Google Maps',
          title: 'Weather v1 · Places · Street View',
          detail: '기상특보, UV 제안, 실제 장소 배경 및 주변 케어 매장 프록시.',
          boundary: '서버 프록시',
        },
        {
          eyebrow: '온디바이스 ML',
          metric: 'MediaPipe',
          title: '로컬 피부톤 분석 · 페이스 저장',
          detail: '다중 얼굴 진단 및 수동 선택, 로컬 IndexedDB 격리 보관.',
          boundary: '로컬 WASM',
        },
        {
          eyebrow: '의류 도메인',
          metric: '케어 · 핏',
          title: '세탁 바구니 · 비침/새깅 · 중복 방지',
          detail: '세탁 라벨 이염 규칙, 이너웨어 비침 시뮬레이션 및 중복 확인.',
          boundary: '공유 ESM',
        },
        {
          eyebrow: '앱 런타임',
          metric: 'Capacitor 8',
          title: 'React 19 · Express 5 · sql.js',
          detail: 'TypeScript 7 strict, Tailwind 4, 오프라인 우선 및 iOS/Android.',
          boundary: '크로스플랫폼',
        },
      ],
    },
    vision: {
      eyebrow: 'Ainvtry 소개',
      heading: '이미 가진 옷을 더 자주, 정확하게 입도록 만듭니다',
      irBadge: '서울 · 2026',
      quote:
        '“내 옷장 속 옷이 실제로 어떻게 떨어지고 오늘 날씨와 장소에 어울리는지 미리 볼 수 있다면, 이미 가진 옷을 훨씬 잘 활용하고 불필요한 중복 구매를 줄일 수 있습니다.”',
      body: 'Ainvtry(제품명 A inventory)는 서울에서 개발 중인 1인 패션테크 스타트업입니다. 3D 피팅, 가상 시착, 세탁·날씨 관리를 웹과 모바일 앱으로 만들고 있습니다.',
      roadmapTitle: '개발 단계',
      milestones: [
        {
          phase: '1단계',
          status: 'done',
          title: '3D 피팅 리그 · 8앵글 가상 피팅 · 로컬 피부톤 분석',
          detail: '21개 관절, 28종 체형 모프, 의류 배경 분리, MediaPipe 기기 내 분석 구현 완료.',
        },
        {
          phase: '2단계',
          status: 'done',
          title: 'Google Maps Platform 날씨 · 장소 배경 · 세탁 케어 연동',
          detail: 'Weather v1 특보, 실제 거리/공간 배경, 세탁 바구니 및 주변 케어 지도 구현 완료.',
        },
        {
          phase: '3단계',
          status: 'active',
          title: '프라이빗 베타 · 클라우드 확장 · 스토어 출시',
          detail: 'Vertex AI · Cloud Run 프로덕션 구성 및 iOS · Android 정식 출시 준비 중.',
        },
      ],
      statusMvp: '210+ 테스트 · 실구동 MVP',
      statusRelease: 'iOS · Android 출시 준비',
      founderRole: '창업자 & 개발 · Ainvtry',
      founderBio:
        'Three.js 3D 그래픽, Gemini 가상 피팅 파이프라인, Google Maps Platform 날씨·장소 프록시, 기기 내 WebAssembly 피부톤 분석, Capacitor 모바일 앱까지 직접 설계하고 개발합니다.',
      hqLabel: '거점',
      hqValue: '대한민국 서울',
      domainLabel: '웹사이트',
      stackSummaryLabel: '클라우드',
      stackSummaryValue: 'Google Cloud · Gemini · Maps Platform',
      directCta: '창업자에게 메일 보내기',
    },
    footer: {
      summary: 'Ainvtry (A inventory) — 3D 디지털 옷장 및 가상 피팅 앱. 서울에서 만듭니다.',
      rights: '© 2026 Ainvtry. All rights reserved.',
      privacy: '개인정보처리방침',
      terms: '이용약관',
      contact: '문의',
      backToTop: '맨 위로',
    },
    legal: {
      closeLabel: '안내 닫기',
      updatedAt: '시행일 2026년 11월 22일 · ainvtry.com',
      privacyTitle: '개인정보처리방침',
      privacySections: [
        {
          heading: '1. 기기 내 피부톤 분석 및 로컬 저장',
          body: 'Ainvtry는 얼굴 피부톤 측정에 필요한 안면 랜드마크 분석을 사용자 기기 내 클라이언트 MediaPipe WebAssembly로만 실행하며, 보정된 페이스 정보는 로컬 IndexedDB에 보관합니다. 얼굴 카메라 원본 프레임은 피부톤 보정을 위해 외부 서버로 전송하지 않습니다.',
        },
        {
          heading: '2. 의류 이미지, 가상 피팅 및 위치 정보 처리',
          body: '의류 배경 분리나 가상 피팅을 위해 사용자가 선택한 의류 이미지는 요청한 결과 생성 목적에만 사용됩니다. 날씨 조회나 주변 케어 매장 검색에 쓰이는 위치 정보는 서버 프록시로만 전달되며 외부 지도 미디어를 영구 저장하지 않습니다.',
        },
        {
          heading: '3. 계정 보안 및 즉시 영구 삭제',
          body: 'Apple 로그인, Google 로그인 또는 이메일 6자리 코드로 안전하게 로그인하며, 계정 설정에서 언제든 계정과 모든 옷장 데이터를 즉시 영구 삭제할 수 있습니다.',
        },
        {
          heading: '4. 개인정보 문의',
          body: '개인정보 관련 문의 또는 삭제 요청은 창업자 Raymond Moon(raymond@ainvtry.com)에게 직접 연락하실 수 있습니다.',
        },
      ],
      termsTitle: '이용약관',
      termsSections: [
        {
          heading: '1. 서비스 범위',
          body: 'Ainvtry(ainvtry.com, 제품명 A inventory)는 3D 디지털 옷장 관리, 의류 자동 분류, 멀티앵글 가상 피팅, 세탁 케어 안내 및 날씨·장소 맞춤 코디 계획 기능을 제공합니다.',
        },
        {
          heading: '2. 사용자 콘텐츠 소유권',
          body: '사용자가 등록한 모든 의류 사진, 코디 기록, 메모의 소유권은 전적으로 사용자에게 있습니다. Ainvtry는 사용자가 요청한 기능을 처리하고 표시하는 데 필요한 제한적 기술 권한만 사용합니다.',
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
