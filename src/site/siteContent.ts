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

export interface SiteMissionCommitment {
  readonly num: string;
  readonly title: string;
  readonly tag: string;
  readonly detail: string;
}

export interface SiteLifecycleNode {
  readonly id: 'closet' | 'weather' | 'avatar' | 'calendar' | 'cpw';
  readonly num: string;
  readonly title: string;
  readonly subtitle: string;
  readonly detail: string;
}

export interface SiteLifecycleExit {
  readonly id: 'resale' | 'purchase';
  readonly title: string;
  readonly subtitle: string;
}

export interface SiteLegacySilo {
  readonly side: 'left' | 'right';
  readonly tag: string;
  readonly title: string;
  readonly step1: string;
  readonly step2: string;
  readonly gapNote: string;
}

export interface SiteRevenuePillar {
  readonly num: string;
  readonly title: string;
  readonly mechanism: string;
  readonly detail: string;
}

export interface SiteMoatItem {
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
    readonly aboutRoadmap: string;
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
  readonly mission: {
    readonly eyebrow: string;
    readonly badge: string;
    readonly headingLead: string;
    readonly headingAccent: string;
    readonly statement: string;
    readonly commitments: readonly SiteMissionCommitment[];
    readonly diagramEyebrow: string;
    readonly diagramTitle: string;
    readonly diagramLegendSilo: string;
    readonly diagramLegendCore: string;
    readonly centerKicker: string;
    readonly centerTitle: string;
    readonly centerSub: string;
    readonly silos: readonly SiteLegacySilo[];
    readonly loopNodes: readonly SiteLifecycleNode[];
    readonly exits: readonly SiteLifecycleExit[];
    readonly diagramFooter: string;
  };
  readonly vision: {
    readonly eyebrow: string;
    readonly heading: string;
    readonly irBadge: string;
    readonly quote: string;
    readonly body: string;
    readonly roadmapTitle: string;
    readonly milestones: readonly SiteMilestone[];
    readonly revenueTitle: string;
    readonly revenueNote: string;
    readonly revenuePillars: readonly SiteRevenuePillar[];
    readonly moatsTitle: string;
    readonly moats: readonly SiteMoatItem[];
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
      aboutMission: 'Our Mission',
      aboutRoadmap: 'Roadmap',
      aboutFounder: 'Founder',
    },
    appPreview: {
      code: 'iNVTRY · Mobile App',
      eyebrow: 'Live build capture',
      title: 'iNVTRY in active development',
      description:
        'Real screens from our React 19 + Capacitor 8 mobile build. Switching language or theme at the top updates the preview alongside the site.',
      badge: '4-Mode Sync',
      syncHint: 'Matches site language and theme',
      screens: [
        {
          id: 'outfits',
          tabLabel: 'Fitting',
          title: 'Multi-Angle Fitting Room',
          caption: '0°–360° multi-layer fitting with live weather and Street View backdrops',
          metricTag: '360°',
          imageAlt: 'iNVTRY mobile app multi-angle fitting studio',
        },
        {
          id: 'closet',
          tabLabel: 'Closet',
          title: 'Digital Closet',
          caption: 'Auto-tagged 11-slot archive, wear counters, and care-aware laundry basket',
          metricTag: '11 Slots',
          imageAlt: 'iNVTRY mobile app digital closet view',
        },
        {
          id: 'stats',
          tabLabel: 'Stats',
          title: 'CPW & Dormant Insights',
          caption: 'Cost-per-wear analytics, dormant garment flags, and one-tap resale prep',
          metricTag: 'CPW',
          imageAlt: 'iNVTRY mobile app wear and cost analytics',
        },
        {
          id: 'profile',
          tabLabel: 'Profile',
          title: 'Tone & Fit Calibration',
          caption: '0-byte local skin-tone sampling, body measurements, and fit tuning',
          metricTag: '0B Local',
          imageAlt: 'iNVTRY mobile app skin-tone and body calibration',
        },
      ],
    },
    hero: {
      kicker: 'AINVTRY.COM · iNVTRY',
      titleLead: 'Your wardrobe, ',
      titleAccent: 'fitted in 3D',
      titleTail: ' before you wear it.',
      subtitle:
        'A weather-reactive personal Wardrobe Asset OS uniting owned clothes, 360° multi-layer fitting, Cost-Per-Wear telemetry, and one-tap circular resale—with on-device biometric privacy.',
      marbleHint: 'Roll the marble into any menu below, or tap to open',
      primaryCta: 'Open Studio',
      secondaryCta: 'Contact Founder',
    },
    capabilities: {
      sectionCode: 'Product',
      eyebrow: 'iNVTRY',
      heading: 'Built around the full lifecycle of clothes you own',
      subheading: 'Daily weather outfits, 360° multi-layer fit, garment care, and circular resale in one loop.',
      badge: 'Working MVP',
      pillars: {
        atelier: {
          code: '3D Fitting',
          eyebrow: 'Three.js 0.187 · Four-Season Multi-Layering',
          title: '21-Bone Rig & 11-Slot 360° Multi-Layering',
          description:
            'Beyond single-item size checks, stack inner, mid, outer, footwear, and umbrella slots across 28 body morphs with 21-bone skeletal motion, SpringBone drape physics, and 8-angle turnaround tailored to daily temperature swings.',
          bullets: [
            'Idle, walking, rain umbrella, and hand-pose motion states',
            'Show-through, relaxed fit, and 11-slot multi-layer balance checks',
            'Adaptive 120Hz/30Hz pacing with instant 2D fallback on WebGL loss',
          ],
        },
        ingestion: {
          code: 'Image & Privacy',
          eyebrow: 'EXIF/GPS Stripped · 0-Byte Local Face Vault',
          title: 'De-Identified Garment Separation & Local Biometrics',
          description:
            'Client-side cropping, background separation, and WebP re-encoding (582 KB → 23 KB) strip GPS, device EXIF, and indoor backgrounds before AI processing. Facial skin-tone calibration runs strictly on-device in MediaPipe WASM.',
          bullets: [
            'Automated fabric, color, and season tagging cuts onboarding friction',
            'PII-free prompts & Paid Tier No-Training 2K multi-angle try-on',
            'Zero stored OAuth tokens, tenant isolation & atomic account deletion',
          ],
        },
        intelligence: {
          code: 'Care & Schedule',
          eyebrow: 'Calendar · CPW Telemetry · Nearby Care Map',
          title: 'Cost-Per-Wear Economics, Resale & Live Weather',
          description:
            'Calendar wear logs compute real Cost-Per-Wear (Price ÷ Wears) and surface dormant pieces for one-tap resale using already-stored photos and metadata—paired with live weather alerts, laundry rules, and nearby care shops.',
          bullets: [
            'Grounded outfit suggestions strictly from owned clothes & live weather',
            'Automatic dormant garment detection feeding one-tap circular resale',
            'Wash/bleed care alerts, nearby care map, and offline duplicate guard',
          ],
        },
        privacy: {
          code: 'Privacy',
          eyebrow: 'Privacy-by-Design 4-Line Defense',
          title: '0-Byte Biometric Upload & Offline-First Storage',
          description:
            'Facial landmarks and lighting calibration run 100% locally (0 bytes transmitted). Your catalog opens offline via IndexedDB on web, iOS, and Android, and one-stop deletion wipes server records, caches, and local vaults atomically.',
          bullets: [
            'Server-verified Apple/Google OIDC with zero stored IdP tokens',
            'Per-user tenant guard (IDOR prevention), magic-byte & sandbox CSP',
            'Single React 19 + Capacitor 8 codebase across web, iOS, and Android',
          ],
        },
      },
    },
    architecture: {
      eyebrow: 'System Architecture',
      heading: '3D Engine, No-Training AI, Geo-Proxy & Privacy-by-Design',
      badge: '4 Layers · 4 Security Lines',
      inspectorLabel: 'Layer Specification',
      modulesLabel: 'Production Modules',
      guaranteeLabel: 'Boundary & Guarantee',
      layers: [
        {
          id: 'spatial',
          shortCode: 'L1',
          shortLabel: '3D GPU',
          tier: 'L1 · Client GPU',
          boundary: 'WebGL2 · 120Hz',
          title: 'Four-Season Multi-Layer 3D & Adaptive Renderer',
          subtitle: 'Three.js 0.187 · 21-Bone Rig · 8-Angle Flow · 120Hz/30Hz Pacing',
          summary:
            'Handles 21-bone skeletal motion, SpringBone drape physics, 11-slot inner/mid/outer layering, weighted GLSL silk and marble shaders, adaptive 120Hz→30Hz frame pacing, and automatic 2D WebGL recovery.',
          modules: [
            'loginThreeScenes.ts + adaptiveFramePacer.ts',
            'vton2DService.ts (8-Angle Optical Flow)',
            'underwearStylingEngine.js (Show-through & Fit)',
            'StageStreetViewMapSheet.tsx (Street View Sheet)',
          ],
          guarantee: '120Hz active / 30Hz idle / 0Hz modal pause · instant 2D fallback on WebGL loss',
          latencyOrBudget: '120Hz / 30Hz',
        },
        {
          id: 'multimodal',
          shortCode: 'L2',
          shortLabel: 'AI Model',
          tier: 'L2 · De-Identified AI',
          boundary: 'Vertex · Paid',
          title: 'De-Identified Tagging, 2K Try-On & Outfit Rationale',
          subtitle: 'Gemini / Vertex Paid No-Training · PII-Free · Automated QC',
          summary:
            'Accepts only EXIF/GPS-stripped, background-separated WebP garments without PII to tag fabrics, generate grounded outfits strictly from owned inventory and live weather, verify angles, and discard payloads immediately.',
          modules: [
            'server/garmentVisionService.js (De-Identified)',
            'server/vtonService.js + vtonQcMiddleware.js',
            'outfitRationaleEngine.ts (Owned Closet & TPO)',
            'vtonStageProgress.ts (Progressive Stream)',
          ],
          guarantee: 'Zero PII in prompts · No-Training Paid Tier · 0-day payload retention',
          latencyOrBudget: '0-Day · 2K',
        },
        {
          id: 'maps',
          shortCode: 'L3',
          shortLabel: 'Maps',
          tier: 'L3 · Weather & Places',
          boundary: 'Server Proxy',
          title: 'Google Maps Platform Weather, Street View & Care',
          subtitle: 'Weather v1 · Places (New) · Free Street View Pre-Check · Care Map',
          summary:
            'Routes all Maps and Weather requests through an Express 5 server proxy: Weather API v1 temperature swings, alerts and UV, Places API (New) with minimal FieldMask for TPO venues and nearby care shops, and free Street View metadata checks.',
          modules: [
            'server/googleWeatherService.js (v1 & Alerts)',
            'server/mapsProxyService.js (Places New)',
            'server/mapsBackdropService.js (Zero-Cache)',
            'garmentCareEngine.ts + NearbyCareMapModal',
          ],
          guarantee: 'Zero permanent media caching · server-only keys · free metadata pre-check',
          latencyOrBudget: '20m TTL cache',
        },
        {
          id: 'privacy',
          shortCode: 'L4',
          shortLabel: 'Security',
          tier: 'L4 · Privacy-by-Design',
          boundary: '0B Face · Guard',
          title: 'Local Biometric Vault, Stateless OIDC & Tenant Isolation',
          subtitle: 'MediaPipe WASM · Zero Stored OAuth Tokens · Tenant Guard · Atomic Erase',
          summary:
            'Completes facial tone calibration on-device (0 bytes uploaded), verifies Apple/Google OIDC signatures without storing IdP tokens or auto-merging unverified emails, enforces per-closet tenant isolation, and erases all data atomically on account deletion.',
          modules: [
            'skinToneAnalyzer.ts + faceMemoryStore.ts (0B)',
            'server/api.js (Stateless OIDC · Tenant Guard)',
            'server/start.js (Magic-Byte · Sandbox CSP)',
            'Capacitor 8 (Offline-First iOS & Android)',
          ],
          guarantee: '0 bytes raw facial upload · zero stored OAuth tokens · atomic one-stop deletion',
          latencyOrBudget: '4-Line Defense',
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
      heading: 'Measured codebase, security & lifecycle metrics',
      note: 'Verified directly from the active repository & security spec',
      heroKpis: [
        {
          value: '5-Stage',
          label: 'Closed Lifecycle Loop',
          sub: 'Closet → Weather → 360° Fit → Calendar → CPW & Resale',
        },
        {
          value: '0 Bytes',
          label: 'Face Data Uploaded',
          sub: 'Local MediaPipe WASM · IndexedDB Isolated Vault',
        },
        {
          value: '210+',
          label: 'Automated Tests',
          sub: '30+ suites across VTON, Weather, Maps, Care & Pacing',
        },
        {
          value: '4 APIs',
          label: 'Google Cloud & Maps',
          sub: 'Vertex/Gemini No-Training, Weather v1, Places (New), Street View',
        },
      ],
      benchmarkTitle: 'Verified Engineering & Security Specifications',
      specs: [
        {
          label: 'Background separation & EXIF/GPS strip',
          valueText: '582 KB → 23 KB (-96%)',
          detail: 'Client WebP re-encoding strips GPS, device EXIF, and private indoor backgrounds',
        },
        {
          label: 'Privacy-by-Design 4-line defense',
          valueText: '0 Bytes face · Zero IdP tokens',
          detail: 'Stateless OIDC auth, tenant isolation, No-Training AI, atomic account deletion',
        },
        {
          label: 'Four-season 3D layering & turnaround',
          valueText: '21 Bones · 28 Morphs · 8 Angles',
          detail: '11-slot layering, 0°–360° optical flow, and 120Hz/60Hz/30Hz adaptive pacing',
        },
        {
          label: 'CPW economics & circular care engine',
          valueText: '11 Slots · 253+ catalog items',
          detail: 'Cost-per-wear dormant alerts, wash/bleed care rules, and one-tap resale prep',
        },
      ],
      cards: [
        {
          eyebrow: '3D Graphics',
          metric: 'Three.js 0.187',
          title: 'Multi-Layer Rig & Adaptive Pacing',
          detail: '21-bone rig, SpringBone drape, 28 morphs, 8-angle turnaround, 120Hz/30Hz pacer.',
          boundary: 'WebGL2',
        },
        {
          eyebrow: 'Multimodal AI',
          metric: 'Gemini · Vertex',
          title: 'Tagging, 2K Try-On & No-Training',
          detail: 'PII-free prompts, Paid Tier No-Training path, automated angle QC & outfit notes.',
          boundary: 'No-Training',
        },
        {
          eyebrow: 'Location & Weather',
          metric: 'Google Maps',
          title: 'Weather v1, Places & Street View',
          detail: 'Live alerts & diurnal swings, interactive Street View sheet, and nearby care map.',
          boundary: 'Server Proxy',
        },
        {
          eyebrow: 'On-Device Security',
          metric: '0-Byte Biometric',
          title: 'Local Tone Vault, OIDC & Isolation',
          detail: 'MediaPipe WASM locally, zero stored OAuth tokens, tenant isolation & atomic erase.',
          boundary: 'Privacy-by-Design',
        },
        {
          eyebrow: 'Wardrobe Asset OS',
          metric: 'CPW · Care',
          title: 'Wear Economics & One-Tap Resale',
          detail: 'Calendar OOTD logging, cost-per-wear tracking, dormant resale & duplicate guard.',
          boundary: 'Closed Loop',
        },
        {
          eyebrow: 'App Runtime',
          metric: 'Capacitor 8',
          title: 'React 19, Express 5 & sql.js',
          detail: 'Strict TypeScript 7, offline-first IndexedDB, single codebase for web, iOS & Android.',
          boundary: 'Cross-Platform',
        },
      ],
    },
    mission: {
      eyebrow: 'Our Mission',
      badge: 'Circular Wardrobe Loop',
      headingLead: 'Sustainable wardrobe intelligence, ',
      headingAccent: 'built around what you already own',
      statement:
        'Instead of isolated pre-purchase try-on widgets or manual secondhand apps, Ainventory connects your digital closet, live hyperlocal weather, 360° multi-layer fitting, and Cost-Per-Wear telemetry into one closed lifecycle loop—eliminating duplicate purchases and extending garment lifespan.',
      commitments: [
        {
          num: '01',
          title: 'Wear First',
          tag: 'WEAR FIRST',
          detail: 'Start every morning with clothes you already own, layered in 360° around real local temperature and rain before buying anything new.',
        },
        {
          num: '02',
          title: 'Measure Cost-Per-Wear',
          tag: 'CPW TELEMETRY',
          detail: 'Log daily outfits in Calendar to compute real Cost-Per-Wear (Price ÷ Wears) and surface dormant pieces objectively.',
        },
        {
          num: '03',
          title: 'Circular Exit & Gap-Only Sync',
          tag: 'CIRCULAR EXIT',
          detail: 'Turn unworn pieces into one-tap resale listings using stored photos and specs, while limiting new buys strictly to verified wardrobe gaps.',
        },
      ],
      diagramEyebrow: 'System Paradigm Comparison',
      diagramTitle: 'Disconnected Legacy Silos vs. iNVTRY Closed Lifecycle',
      diagramLegendSilo: 'Disconnected Silos',
      diagramLegendCore: 'iNVTRY Apparel Lifecycle Loop',
      centerKicker: 'iNVTRY LOOP',
      centerTitle: 'Apparel Lifecycle',
      centerSub: 'Closed-Loop OS',
      silos: [
        {
          side: 'left',
          tag: 'LEGACY SILO 01',
          title: '1st/2nd Try-On',
          step1: 'E-commerce catalog',
          step2: 'Pre-purchase size check only',
          gapNote: 'No owned-closet memory',
        },
        {
          side: 'right',
          tag: 'LEGACY SILO 02',
          title: 'Standalone Resale',
          step1: 'Manual photo & listing',
          step2: 'Separate C2C resale apps',
          gapNote: 'Zero wear-frequency data',
        },
      ],
      loopNodes: [
        {
          id: 'closet',
          num: '01',
          title: 'Digital Closet',
          subtitle: 'AI 11-Slot Archive',
          detail: 'Background-separated, EXIF-stripped WebP items with automated fabric, color, and season tagging.',
        },
        {
          id: 'weather',
          num: '02',
          title: 'Local Weather',
          subtitle: 'Temp · Swings · Rain',
          detail: 'Injects Google Weather v1 conditions, diurnal swings, severe alerts, and UV directly into daily outfit rules.',
        },
        {
          id: 'avatar',
          num: '03',
          title: '360° Layered Avatar',
          subtitle: 'Inner · Mid · Outer Fit',
          detail: 'Simulates four-season multi-layer stacking and 8-angle turnaround fit before you get dressed.',
        },
        {
          id: 'calendar',
          num: '04',
          title: 'Calendar Log',
          subtitle: 'Daily OOTD History',
          detail: 'Tracks worn outfits by date to prevent repetitive styling and build objective wardrobe telemetry.',
        },
        {
          id: 'cpw',
          num: '05',
          title: 'CPW & Dormant',
          subtitle: 'Price ÷ Wears',
          detail: 'Flags low-utilization deadstock automatically to trigger circular resale and block duplicate purchases.',
        },
      ],
      exits: [
        {
          id: 'resale',
          title: 'One-Tap Resale',
          subtitle: 'Reuse stored photos & specs for idle items',
        },
        {
          id: 'purchase',
          title: 'Tailored Purchase Sync',
          subtitle: 'Fill verified gaps · block duplicates',
        },
      ],
      diagramFooter: 'Select any node to inspect its role · Grounded closed-loop wardrobe workflow',
    },
    vision: {
      eyebrow: 'About Ainvtry',
      heading: 'A weather-reactive personal Wardrobe Asset OS',
      irBadge: 'Seoul · 2026',
      quote:
        '“When you can see how your own clothes layer for today’s weather—and how often each piece is actually worn—you get far more out of your closet and buy far fewer duplicates.”',
      body: 'Ainvtry (iNVTRY) is an independent fashion-tech startup in Seoul building a closed-loop personal Wardrobe Asset OS across web, iOS, and Android—uniting owned inventory, live weather, 360° multi-layer fitting, CPW analytics, and circular resale.',
      roadmapTitle: 'Milestones & Validation',
      milestones: [
        {
          phase: 'Stage 1',
          status: 'done',
          title: '3D Multi-Layer Rig, 8-Angle Try-On & Local Biometrics',
          detail: '21-bone rig, 28 morphs, 11-slot layering, EXIF-stripped WebP separation, and MediaPipe WASM local analysis.',
        },
        {
          phase: 'Stage 2',
          status: 'done',
          title: 'Google Maps Weather/Places & Privacy-by-Design 4-Line Defense',
          detail: 'Weather v1 alerts, Street View map sheet, care map, stateless OIDC auth, tenant isolation, and one-stop deletion.',
        },
        {
          phase: 'Stage 3',
          status: 'active',
          title: 'Closed Beta (CBT), Patent Priority, 3-Zone Cloud & Store Release',
          detail: '30–50 user CBT measuring decision time & CPW resale intent, core algorithm patent filing, GCS 3-Zone, iOS/Android launch.',
        },
      ],
      revenueTitle: 'Sustainable 3-Pillar Business Model',
      revenueNote: 'Daily weather-outfit retention offsets generative AI inference costs',
      revenuePillars: [
        {
          num: '01',
          title: 'Pro Subscription',
          mechanism: 'Recurring SaaS',
          detail: 'Unlimited multi-angle virtual try-on, advanced TPO/travel capsule planning, and deep CPW asset insights.',
        },
        {
          num: '02',
          title: 'Gap-Only Affiliate Commerce',
          mechanism: 'Tailored Gaps',
          detail: 'Recommends only verified missing layers or color gaps that complement owned garments—high intent, zero duplicates.',
        },
        {
          num: '03',
          title: 'One-Tap Circular Resale',
          mechanism: 'Resale Supply',
          detail: 'Converts low-CPW dormant items into instant resale listings from stored metadata without C2C cold-start friction.',
        },
      ],
      moatsTitle: 'Four Product & Engineering Moats',
      moats: [
        {
          title: 'Working Cross-Platform MVP',
          detail: 'React 19, Capacitor 8 (iOS/Android), and 210+ automated tests ready for live demonstration.',
        },
        {
          title: 'Four-Season 360° Multi-Layering',
          detail: 'Full inner, mid, outer, footwear, and umbrella simulation tuned for diurnal temperature swings.',
        },
        {
          title: 'Closed-Loop Retention & 3-Pillar BM',
          detail: 'Daily morning weather styling feeds Calendar logs, CPW telemetry, one-tap resale, and gap-only buys.',
        },
        {
          title: 'Privacy-by-Design 4-Line Defense',
          detail: '0-byte biometric upload, zero stored OAuth tokens, tenant storage isolation, No-Training AI, atomic erasure.',
        },
      ],
      statusMvp: '210+ tests · Working MVP',
      statusRelease: 'Preparing iOS & Android release',
      founderRole: 'Founder & Engineer · Ainvtry',
      founderBio:
        'Building Ainvtry end-to-end across Three.js graphics, Gemini/Vertex AI virtual try-on, Google Maps Platform weather and place proxies, local WebAssembly biometrics, security architecture, and Capacitor mobile apps.',
      hqLabel: 'Location',
      hqValue: 'Seoul, South Korea',
      domainLabel: 'Website',
      stackSummaryLabel: 'Cloud',
      stackSummaryValue: 'Google Cloud · Vertex AI · Maps Platform',
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
      aboutMission: '우리의 미션',
      aboutRoadmap: '로드맵 · BM',
      aboutFounder: '창업자',
    },
    appPreview: {
      code: 'iNVTRY · 모바일 앱',
      eyebrow: '개발 중인 실구동 화면',
      title: '실제로 만들고 있는 앱 화면입니다',
      description:
        'React 19와 Capacitor 8로 개발 중인 최신 모바일 앱 화면입니다. 상단에서 한/영 또는 다크/라이트를 바꾸면 프리뷰도 함께 바뀝니다.',
      badge: '4모드 연동',
      syncHint: '사이트 언어 · 테마와 함께 전환',
      screens: [
        {
          id: 'outfits',
          tabLabel: '피팅',
          title: '멀티앵글 가상 피팅',
          caption: '0°–360° 다중 레이어드 피팅과 실시간 기상 · 거리뷰 배경 연동',
          metricTag: '360°',
          imageAlt: 'iNVTRY 모바일 앱 가상 피팅 스튜디오 화면',
        },
        {
          id: 'closet',
          tabLabel: '옷장',
          title: '디지털 옷장',
          caption: '자동 태깅 11슬롯 아카이브, 착용 횟수 카운터 및 세탁 바구니',
          metricTag: '11슬롯',
          imageAlt: 'iNVTRY 모바일 앱 디지털 옷장 화면',
        },
        {
          id: 'stats',
          tabLabel: '통계',
          title: 'CPW · 유휴 의류 분석',
          caption: '1회 착용 단가(CPW), 유휴 의류 식별 및 원탭 중고 리셀 연동',
          metricTag: 'CPW',
          imageAlt: 'iNVTRY 모바일 앱 옷장 통계 화면',
        },
        {
          id: 'profile',
          tabLabel: '프로필',
          title: '피부톤 · 체형 설정',
          caption: '외부 전송 0 Bytes 기기 내 피부톤 분석, 체형 비율 및 핏 보정',
          metricTag: '0B 로컬',
          imageAlt: 'iNVTRY 모바일 앱 피부톤 및 체형 설정 화면',
        },
      ],
    },
    hero: {
      kicker: 'AINVTRY.COM · iNVTRY',
      titleLead: '입어보기 전에 ',
      titleAccent: '먼저 맞춰보는',
      titleTail: ' 나만의 3D 옷장',
      subtitle:
        '실시간 국지 기상과 보유 옷장을 연결해 360° 다중 레이어드로 시뮬레이션하고, 캘린더·CPW 분석·원탭 리셀까지 잇는 개인 의류 자산 운영체제.',
      marbleHint: '유리 구슬을 굴려 아래 메뉴를 맞추거나 눌러서 이동해 보세요',
      primaryCta: '스튜디오 보기',
      secondaryCta: '창업자 문의',
    },
    capabilities: {
      sectionCode: '제품 소개',
      eyebrow: 'iNVTRY',
      heading: '이미 가진 옷의 생애주기를 완성하는 도구',
      subheading: '아침 기상 코디부터 360° 다중 레이어링, 세탁 케어, CPW 순환 리셀까지 한곳에서 정리합니다.',
      badge: '실구동 MVP',
      pillars: {
        atelier: {
          code: '3D 피팅',
          eyebrow: 'Three.js 0.187 · 사계절 다중 레이어링',
          title: '21개 관절 리그와 11슬롯 360° 다중 레이어드',
          description:
            '단품 핏 확인을 넘어 이너·미드·아우터·신발·액세서리까지 11개 슬롯을 겹쳐 입히고, 21개 관절 모션·SpringBone 원단 물리·8앵글 회전으로 사계절 일교차와 강수에 맞춘 착장을 미리 검증합니다.',
          bullets: [
            '기본 자세, 워킹, 우산 들기(강수 연동), 손 디테일 동작 지원',
            '이너웨어 비침·새깅 핏과 28종 체형 비율 실시간 동기화',
            '120Hz/30Hz 가변 프레임 제어 및 WebGL 손실 시 2D 즉시 폴백',
          ],
        },
        ingestion: {
          code: '배경 분리 · 보안',
          eyebrow: 'EXIF/GPS 제거 · 기기 내 피부톤 볼트',
          title: '비식별 의류 배경 분리와 0-Byte 로컬 페이스 볼트',
          description:
            '클라이언트 크롭·배경 분리와 WebP 재인코딩(582 KB → 23 KB) 과정에서 GPS·기기 EXIF와 실내 사생활 배경을 100% 제거합니다. 안면 피부톤 분석은 기기 내 MediaPipe WASM에서만 완결됩니다.',
          bullets: [
            '자동 배경 분리·소재·계절 태깅으로 초기 옷장 등록 장벽 최소화',
            'PII 배제 · 유료 무학습(No-Training) 2K 멀티앵글 VTON 추론',
            'OAuth 토큰 비보관 · 계정별 테넌트 격리 · 탈퇴 시 원스톱 파기',
          ],
        },
        intelligence: {
          code: '케어 · 일정',
          eyebrow: '캘린더 · CPW 자산 분석 · 주변 케어 지도',
          title: '1회 착용 비용(CPW), 유휴 의류 순환, 실시간 날씨 코디',
          description:
            '캘린더 착용 기록으로 구매가 ÷ 착용 횟수(CPW)와 미착용 유휴 의류를 자동 식별해 원탭 중고 리셀로 연결합니다. 실시간 기상 특보와 세탁 라벨 규칙, 주변 세탁·수선 지도까지 함께 관리합니다.',
          bullets: [
            '보유 옷장·실시간 기상·최근 착용 이력 안에서만 실행 가능한 코디 제안',
            'CPW 하위 유휴 의류 자동 포착 → 기존 사진·스펙 기반 원탭 리셀 전환',
            '세탁 이염 경고, 주변 케어 매장 지도 및 오프라인 중복 구매 차단',
          ],
        },
        privacy: {
          code: '프라이버시',
          eyebrow: 'Privacy-by-Design 4대 방어선',
          title: '안면 외부 전송 0 Bytes & 오프라인 우선 구조',
          description:
            '생체 안면 분석은 100% 기기 내부에서 수행해 외부 전송량이 0 Bytes입니다. 등록한 옷장은 로컬 IndexedDB로 오프라인에서도 빠르게 열리며, 탈퇴 시 서버·캐시·로컬 볼트를 원스톱으로 영구 파기합니다.',
          bullets: [
            'Apple/Google OIDC 서버 서명 검증 · 외부 IdP 토큰 전면 미저장',
            '모든 API 테넌트 격리(IDOR 차단) 및 파일 매직바이트·샌드박스 CSP',
            'React 19 · Capacitor 8 단일 코드베이스로 웹·iOS·Android 동시 지원',
          ],
        },
      },
    },
    architecture: {
      eyebrow: '시스템 구조',
      heading: '3D 엔진 · 무학습 AI · 기상 프록시 · Privacy-by-Design 4계층',
      badge: '4계층 · 4대 보안 방어선',
      inspectorLabel: '선택 계층 상세',
      modulesLabel: '주요 구현 모듈',
      guaranteeLabel: '보안 경계 및 보장',
      layers: [
        {
          id: 'spatial',
          shortCode: 'L1',
          shortLabel: '3D 엔진',
          tier: 'L1 · 클라이언트 GPU',
          boundary: 'WebGL2 · 120Hz',
          title: '사계절 다중 레이어드 3D & 가변 프레임 렌더러',
          subtitle: 'Three.js 0.187 · 21관절 · 8앵글 회전 · 120Hz/30Hz 페이싱',
          summary:
            '21개 관절 모션, SpringBone 옷감 물리, 이너·미드·아우터 11슬롯 다겹 레이어링, 중력 침강 GLSL 실크·구슬 셰이더, 120Hz→30Hz 가변 프레임 제어와 WebGL 복구 폴백을 브라우저 GPU에서 처리합니다.',
          modules: [
            'loginThreeScenes.ts + adaptiveFramePacer.ts',
            'vton2DService.ts (8앵글 옵티컬 플로우)',
            'underwearStylingEngine.js (비침 · 새깅 핏)',
            'StageStreetViewMapSheet.tsx (거리뷰 시트)',
          ],
          guarantee: '활성 120Hz / 유휴 30Hz / 모달 0Hz 자동 제어 · WebGL 손실 시 2D 즉시 전환',
          latencyOrBudget: '120Hz / 30Hz',
        },
        {
          id: 'multimodal',
          shortCode: 'L2',
          shortLabel: 'AI 모델',
          tier: 'L2 · 비식별 클라우드 AI',
          boundary: 'Vertex · 무학습',
          title: '비식별 의류 태깅 · 2K 가상 피팅 · 코디 해설',
          subtitle: 'Gemini / Vertex AI 유료 무학습 · PII 배제 · 자동 품질 검수',
          summary:
            '배경·EXIF/GPS가 제거된 WebP 의류만 PII 없이 전달해 소재·계절을 자동 태깅하고, 보유 옷장과 기상·착용 이력 안에서만 실행 가능한 2K 멀티앵글 코디와 해설을 생성한 뒤 페이로드를 즉시 파기합니다.',
          modules: [
            'server/garmentVisionService.js (비식별 태깅)',
            'server/vtonService.js + vtonQcMiddleware.js',
            'outfitRationaleEngine.ts (보유 의류·TPO 해설)',
            'vtonStageProgress.ts (단계별 스트리밍)',
          ],
          guarantee: 'PII 완전 배제 · AI 모델 재학습 미사용(No-Training) · 응답 직후 0일 파기',
          latencyOrBudget: '0일 파기 · 2K',
        },
        {
          id: 'maps',
          shortCode: 'L3',
          shortLabel: '지도·기상',
          tier: 'L3 · 실시간 기상 · 장소',
          boundary: '서버 프록시',
          title: 'Google Maps Platform 기상 · 거리뷰 · 주변 케어',
          subtitle: 'Weather v1 · Places (New) · Street View 사전 확인 · 케어 지도',
          summary:
            'Express 5 서버 프록시로 Google Weather API v1(기온·일교차·특보·UV), 최소 FieldMask 기반 Places API (New)(방문 장소 배경·주변 세탁/수선 매장), 무료 Street View 메타데이터 사전 확인을 연동합니다.',
          modules: [
            'server/googleWeatherService.js (v1 · 특보)',
            'server/mapsProxyService.js (Places New)',
            'server/mapsBackdropService.js (무저장 프록시)',
            'garmentCareEngine.ts + NearbyCareMapModal',
          ],
          guarantee: '지도 미디어 영구 DB 저장 0건 · API 키 서버 전용 격리 · 무료 메타데이터 선조회',
          latencyOrBudget: '20분 TTL 캐시',
        },
        {
          id: 'privacy',
          shortCode: 'L4',
          shortLabel: '보안·기기',
          tier: 'L4 · Privacy-by-Design',
          boundary: '0B 생체 · 격리',
          title: '로컬 생체 볼트 · Stateless OIDC · 테넌트 스토리지 격리',
          subtitle: 'MediaPipe WASM · OAuth 토큰 비보관 · resolveAuthorizedClosets · 원스톱 파기',
          summary:
            '안면 피부톤 분석을 기기 내 WASM으로 완결(외부 전송 0 Bytes)하고, Apple/Google OIDC 서명 검증(외부 토큰 미저장·이메일 자동 병합 금지), 계정별 테넌트 격리, 탈퇴 시 DB·파일·로컬 볼트 원스톱 파기를 강제합니다.',
          modules: [
            'skinToneAnalyzer.ts + faceMemoryStore.ts (0B)',
            'server/api.js (Stateless OIDC · Tenant Guard)',
            'server/start.js (매직바이트 · 샌드박스 CSP)',
            'Capacitor 8 (오프라인 우선 iOS · Android)',
          ],
          guarantee: '안면 원본 외부 전송 0 Bytes · OAuth 토큰 비보관 · 탈퇴 시 원스톱 영구 파기',
          latencyOrBudget: '4대 방어선',
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
      heading: '실제 코드베이스 · 보안 · 생애주기 실측 지표',
      note: '현재 저장소 테스트 · 빌드 · 보안 아키텍처 기준',
      heroKpis: [
        {
          value: '5-Stage',
          label: '폐루프 의류 생애주기',
          sub: '옷장 → 국지 기상 → 360° 피팅 → 캘린더 → CPW · 원탭 리셀',
        },
        {
          value: '0 Bytes',
          label: '안면 원본 외부 전송',
          sub: '기기 내 MediaPipe WASM · IndexedDB 격리 볼트',
        },
        {
          value: '210+',
          label: '자동화 검증 테스트',
          sub: '피팅 · 날씨 · 지도 · 케어 · 스로틀링 30+ 스위트',
        },
        {
          value: '4 APIs',
          label: 'Google Cloud · Maps',
          sub: 'Vertex/Gemini 무학습, Weather v1, Places (New), Street View',
        },
      ],
      benchmarkTitle: '실측 엔지니어링 & 보안 스펙 요약',
      specs: [
        {
          label: '의류 배경 분리 & EXIF/GPS 제거',
          valueText: '582 KB → 23 KB (-96%)',
          detail: 'WebP 재인코딩 단계에서 사생활 배경·GPS·기기 메타데이터 100% 제거',
        },
        {
          label: 'Privacy-by-Design 4대 방어선',
          valueText: '0 Bytes 생체 · 토큰 비보관',
          detail: 'OIDC 서명 검증, 테넌트 격리, 무학습 AI 추론, 탈퇴 시 원스톱 즉시 파기',
        },
        {
          label: '사계절 3D 다중 레이어드 & 회전',
          valueText: '21관절 · 28모프 · 8앵글',
          detail: '11슬롯 다겹 레이어링, 0°–360° 회전 및 120Hz/60Hz/30Hz 가변 프레임 제어',
        },
        {
          label: 'CPW 자산 분석 & 순환 케어 엔진',
          valueText: '11슬롯 · 253+ 아이템',
          detail: '1회 착용 비용(CPW)·유휴 의류 감지, 세탁·이염 규칙 및 원탭 리셀 파이프라인',
        },
      ],
      cards: [
        {
          eyebrow: '3D 그래픽',
          metric: 'Three.js 0.187',
          title: '다중 레이어드 · 가변 프레임 제어',
          detail: '21관절 리그, SpringBone 물리, 28모프, 8앵글 회전, 120Hz/30Hz 자동 페이싱.',
          boundary: 'WebGL2',
        },
        {
          eyebrow: '멀티모달 AI',
          metric: 'Gemini · Vertex',
          title: '자동 태깅 · 2K VTON · 무학습 추론',
          detail: 'PII 배제 프롬프트, 유료 무학습 경로, 자동 각도 검수 및 코디 이유 해설.',
          boundary: 'No-Training',
        },
        {
          eyebrow: '지도 · 기상',
          metric: 'Google Maps',
          title: 'Weather v1 · Places · Street View',
          detail: '실시간 기상특보·일교차 반영, 거리뷰 위치 시트 및 주변 세탁·수선 케어 지도.',
          boundary: '서버 프록시',
        },
        {
          eyebrow: '온디바이스 보안',
          metric: '0-Byte Biometric',
          title: '로컬 피부톤 분석 · OIDC · 테넌트 격리',
          detail: 'MediaPipe WASM 로컬 진단, OAuth 토큰 비보관, 계정별 스토리지 격리 · 원스톱 파기.',
          boundary: 'Privacy-by-Design',
        },
        {
          eyebrow: '의류 자산 OS',
          metric: 'CPW · Care',
          title: '착용 단가 · 유휴 감지 · 원탭 리셀',
          detail: '캘린더 OOTD 로깅, 1회 착용 단가 산출, 유휴 의류 리셀 전환 및 중복 구매 차단.',
          boundary: '폐루프 엔진',
        },
        {
          eyebrow: '앱 런타임',
          metric: 'Capacitor 8',
          title: 'React 19 · Express 5 · sql.js',
          detail: 'TypeScript 7 strict, 오프라인 우선 IndexedDB, 웹·iOS·Android 단일 코드베이스.',
          boundary: '크로스플랫폼',
        },
      ],
    },
    mission: {
      eyebrow: '우리의 미션',
      badge: '순환형 옷장 루프',
      headingLead: '이미 가진 옷의 생애주기를 완성하는 ',
      headingAccent: '지속 가능한 AI 옷장',
      statement:
        '단발성 구매 전 피팅이나 파편화된 중고 장터 대신, 보유 의류·실시간 국지 기상·360° 다중 레이어링·CPW 착용 효율을 하나의 닫힌 순환 구조로 연결해 충동적 중복 구매를 줄이고 옷의 수명을 늘립니다.',
      commitments: [
        {
          num: '01',
          title: '보유 의류 우선 착장',
          tag: 'WEAR FIRST',
          detail: '새 옷을 사기 전에 내 옷장 속 의류를 오늘 기온·강수에 맞춰 360° 다중 레이어드로 조합합니다.',
        },
        {
          num: '02',
          title: '1회 착용 비용(CPW) 계량화',
          tag: 'CPW TELEMETRY',
          detail: '캘린더 착용 기록으로 구매가 ÷ 착용 횟수를 자동 계산해 미착용 유휴 의류를 객관적으로 포착합니다.',
        },
        {
          num: '03',
          title: '원탭 리셀 & 공백 보완 구매',
          tag: 'CIRCULAR EXIT',
          detail: '이미 등록된 사진·메타데이터로 유휴 의류를 원탭 리셀로 순환하고, 신규 구매는 꼭 비어 있는 슬롯만 제안합니다.',
        },
      ],
      diagramEyebrow: '패러다임 비교',
      diagramTitle: '단절된 기존 기능군 vs iNVTRY 폐루프 생애주기',
      diagramLegendSilo: '단절된 기존 사일로',
      diagramLegendCore: 'iNVTRY 의류 생애주기 루프',
      centerKicker: 'iNVTRY LOOP',
      centerTitle: '의류 생애주기',
      centerSub: 'Closed-Loop OS',
      silos: [
        {
          side: 'left',
          tag: '기존 사일로 01',
          title: '1·2차 가상피팅군',
          step1: '쇼핑몰 상품 카탈로그',
          step2: '구매 전 단품 사이즈 확인',
          gapNote: '보유 옷장·착용 이력 단절',
        },
        {
          side: 'right',
          tag: '기존 사일로 02',
          title: '단독 중고거래군',
          step1: '수동 재촬영 · 판매글 작성',
          step2: '개별 직거래 앱 등록',
          gapNote: '착용 빈도·유휴 감지 단절',
        },
      ],
      loopNodes: [
        {
          id: 'closet',
          num: '01',
          title: '디지털 옷장',
          subtitle: 'AI 11슬롯 아카이브',
          detail: '배경 분리·EXIF 제거 WebP와 소재·계절 자동 태깅으로 보유 의류를 구조화합니다.',
        },
        {
          id: 'weather',
          num: '02',
          title: '실시간 국지 기상',
          subtitle: '기온 · 일교차 · 강수',
          detail: 'Google Weather v1 실황·특보·UV를 착장 추천의 1차 제약 조건으로 주입합니다.',
        },
        {
          id: 'avatar',
          num: '03',
          title: '360° 레이어드 아바타',
          subtitle: '이너·미드·아우터 다겹',
          detail: '사계절 일교차에 맞춘 다층 레이어링과 8앵글 회전 핏을 입기 전에 검증합니다.',
        },
        {
          id: 'calendar',
          num: '04',
          title: '캘린더 기록',
          subtitle: '일정별 OOTD 로깅',
          detail: '실제 착용 이력을 누적해 최근 코디 중복 추천을 막고 활용 데이터를 쌓습니다.',
        },
        {
          id: 'cpw',
          num: '05',
          title: 'CPW · 유휴의류 식별',
          subtitle: '구매가 ÷ 착용 횟수',
          detail: '착용 빈도가 낮은 유휴 의류를 자동 포착해 리셀 전환과 중복 구매 차단을 연결합니다.',
        },
      ],
      exits: [
        {
          id: 'resale',
          title: '원탭 중고 리셀',
          subtitle: '등록 사진·스펙 즉시 재활용',
        },
        {
          id: 'purchase',
          title: '맞춤 구매 연동',
          subtitle: '부족 아이템만 선별 · 중복 차단',
        },
      ],
      diagramFooter: '각 단계를 누르면 상세 동작을 확인할 수 있습니다 · 보유 의류 기반 순환 워크플로우',
    },
    vision: {
      eyebrow: 'Ainvtry 소개',
      heading: '실시간 기상 반응형 개인 의류 자산 운영체제',
      irBadge: '서울 · 2026',
      quote:
        '“내 옷장 속 옷이 오늘 날씨와 장소에 어떻게 어울리고 얼마나 자주 입히는지 한눈에 볼 수 있다면, 이미 가진 옷을 끝까지 활용하고 불필요한 중복 구매를 줄일 수 있습니다.”',
      body: 'Ainvtry(iNVTRY)는 서울에서 개발 중인 패션테크 스타트업입니다. 단발성 가상 피팅 위젯이 아니라 보유 의류·기상·3D 레이어링·CPW·원탭 리셀을 하나로 잇는 개인 의류 자산 운영체제를 만들고 있습니다.',
      roadmapTitle: '개발 및 검증 로드맵',
      milestones: [
        {
          phase: '1단계',
          status: 'done',
          title: '3D 다중 레이어드 리그 · 8앵글 VTON · 로컬 피부톤 분석',
          detail: '21관절 · 28모프 · 11슬롯 레이어링, 의류 배경 분리(EXIF 제거), MediaPipe WASM 로컬 분석 구현 완료.',
        },
        {
          phase: '2단계',
          status: 'done',
          title: 'Google Maps 날씨·장소 배경 · Privacy-by-Design 4대 방어선',
          detail: 'Weather v1 특보, Street View 위치 시트, 세탁·주변 케어 지도, OAuth 토큰 비보관 · 테넌트 격리 완료.',
        },
        {
          phase: '3단계',
          status: 'active',
          title: '사전 CBT 정량 검증 · 특허 출원 · 3-Zone 클라우드 및 스토어 출시',
          detail: '30~50명 클로즈드 베타(코디 시간·CPW 실측), 핵심 알고리즘 특허 출원, GCS 3-Zone · iOS/Android 출시.',
        },
      ],
      revenueTitle: '지속 가능한 3중 수익 구조',
      revenueNote: '일간 무료 코디 습관 위에서 AI 추론 원가를 자체 상쇄하는 구조',
      revenuePillars: [
        {
          num: '01',
          title: '프리미엄 구독',
          mechanism: 'Pro Tier',
          detail: '무제한 멀티앵글 가상 피팅, 고급 TPO·여행 캡슐 스타일링 및 심층 CPW 자산 리포트.',
        },
        {
          num: '02',
          title: '부족 아이템 제휴 커머스',
          mechanism: 'Gap-Only Affiliate',
          detail: '보유 옷장에 실제로 비어 있는 레이어·색상 공백만 정교하게 보완 추천해 높은 전환과 제로 중복 달성.',
        },
        {
          num: '03',
          title: '유휴 의류 원탭 리셀',
          mechanism: 'Circular Resale',
          detail: 'CPW 하위 미착용 의류를 기존 등록 사진·브랜드 메타데이터로 즉시 판매글 전환해 순환 수수료 창출.',
        },
      ],
      moatsTitle: '4대 기술 · 제품 해자',
      moats: [
        {
          title: '실구동 크로스플랫폼 MVP',
          detail: 'React 19 · Capacitor 8(iOS/Android) · 210+ 테스트로 즉시 검증 가능한 코드베이스.',
        },
        {
          title: '사계절 360° 다중 레이어링',
          detail: '단품 핏을 넘어 이너·미드·아우터·우산까지 일교차·강수 환경에 맞춰 전 각도 시뮬레이션.',
        },
        {
          title: '폐루프 일간 리텐션 & 3중 BM',
          detail: '매일 아침 기상 코디 습관 → CPW 통계 → 원탭 리셀 · 공백 보완 구매로 이어지는 선순환.',
        },
        {
          title: 'Privacy-by-Design 4대 방어선',
          detail: '안면 외부 전송 0 Bytes, OAuth 토큰 비보관, 테넌트 격리, EXIF/PII 배제 무학습 AI · 원스톱 파기.',
        },
      ],
      statusMvp: '210+ 테스트 · 실구동 MVP',
      statusRelease: 'iOS · Android 출시 준비',
      founderRole: '창업자 & 엔지니어 · Ainvtry',
      founderBio:
        'Three.js 3D 그래픽, Gemini/Vertex AI 가상 피팅 파이프라인, Google Maps Platform 날씨·장소 프록시, 기기 내 WebAssembly 피부톤 분석, 보안 아키텍처와 Capacitor 모바일 앱까지 엔드투엔드로 설계·개발합니다.',
      hqLabel: '거점',
      hqValue: '대한민국 서울',
      domainLabel: '웹사이트',
      stackSummaryLabel: '클라우드',
      stackSummaryValue: 'Google Cloud · Vertex AI · Maps Platform',
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
          heading: '1. 온디바이스 생체 처리 및 페이스 메모리 볼트 원칙',
          body: 'Ainvtry(iNVTRY)는 안면 피부톤 랜드마크 분석을 사용자 기기 내 클라이언트 MediaPipe WebAssembly에서만 수행하며 보정된 페이스 메모리는 로컬 IndexedDB에만 격리 저장합니다. 피부톤 보정 목적의 안면 카메라 원본 프레임은 외부 서버로 전송·저장되지 않습니다(외부 전송 0 Bytes).',
        },
        {
          heading: '2. OAuth 토큰 관리 및 스토리지 접근 권한 분리',
          body: 'Apple·Google OAuth 로그인 시 서버가 OIDC 서명을 직접 검증하며 외부 IdP Access/Refresh 토큰은 저장하지 않고 미검증 이메일 자동 병합을 금지합니다. 내부 세션은 HttpOnly 쿠키와 Rate Limit으로 보호되며, 모든 옷장 API 및 파일 스토리지는 사용자별 테넌트 권한 검증으로 타 계정 접근을 원천 차단합니다.',
        },
        {
          heading: '3. 제3자 AI API 비식별화 · 무학습 추론 및 보유기간',
          body: '의류 이미지는 클라이언트에서 크롭·배경 분리 및 WebP 재인코딩을 거쳐 EXIF/GPS 메타데이터와 생활 배경을 제거한 뒤 전송됩니다. AI 프롬프트에서 성명·이메일 등 직접 식별자(PII)를 완전 배제하고, 모델 재학습 미사용(No-Training) 유료 Vertex AI / Gemini 경로로 처리한 뒤 전송 페이로드는 응답 직후 즉시 파기합니다. 지도 미디어는 영구 DB에 저장하지 않습니다.',
        },
        {
          heading: '4. 원스톱 즉시 영구 파기 및 개인정보 보호 문의',
          body: '사용자는 계정 설정에서 언제든 회원 탈퇴를 실행해 계정·활성 세션·옷장 DB·업로드 이미지·임시 VTON 캐시 및 로컬 IndexedDB 볼트까지 즉시 영구 파기할 수 있습니다. 개인정보 관련 문의는 창업자 공식 이메일(raymond@ainvtry.com)로 연락해 주시기 바랍니다.',
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
