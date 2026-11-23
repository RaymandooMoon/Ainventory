import type { SiteIconKey } from './SiteIcon.tsx';

export type SiteLang = 'en' | 'ko';
export type SiteTheme = 'dark' | 'light';
export type LegalDocKind = 'privacy' | 'terms';
export type SiteViewId = 'home' | 'studio' | 'technology' | 'benchmarks' | 'about';
export type AppPreviewScreenId = 'outfits' | 'closet' | 'stats' | 'profile';
export type BlueprintScaleMode = 'dev' | 'prod';

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
}

export type JourneyCutStatus = 'live' | 'hybrid' | 'todo';

export interface SiteJourneyCut {
  readonly id: 'buy' | 'scan' | 'weather' | 'share' | 'care' | 'resale';
  readonly num: string;
  readonly icon: SiteIconKey;
  readonly shortTitle: string;
  readonly title: string;
  readonly status: JourneyCutStatus;
  readonly statusLabel: string;
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
      studioPreview: 'Live App',
      studioAtelier: '3D Fitting',
      studioIntel: 'Care & CPW',
      archBlueprint: 'System Blueprint',
      archPrivacy: 'Privacy & Security',
      archMaps: 'Google API × 3D',
      benchKpi: 'Key Metrics',
      benchMatrix: 'Tech Stack',
      aboutJourney: '01 User Journey',
      aboutMission: '02 Mission & Roadmap',
      aboutFounder: '03 BM & Founder',
    },
    tapHint: 'Tap an icon to inspect',
    appPreview: {
      code: 'iNVTRY · Mobile Build',
      title: 'Live Cross-Platform App',
      badge: '4-Mode Sync',
      screens: [
        {
          id: 'outfits',
          icon: 'shirt',
          tabLabel: 'Fitting',
          title: '360° Fitting',
          caption: 'Multi-layer 0°–360° try-on with live weather and Street View backdrops.',
          metricTag: '360°',
          imageAlt: 'iNVTRY mobile app multi-angle fitting studio',
        },
        {
          id: 'closet',
          icon: 'layoutGrid',
          tabLabel: 'Closet',
          title: '11-Slot Closet',
          caption: 'Auto-tagged owned wardrobe with wear counters and care-aware laundry basket.',
          metricTag: '11 Slots',
          imageAlt: 'iNVTRY mobile app digital closet view',
        },
        {
          id: 'stats',
          icon: 'barChart',
          tabLabel: 'Stats',
          title: 'CPW & Resale',
          caption: 'Cost-per-wear analytics, dormant flags, and verified one-tap resale prep.',
          metricTag: 'CPW',
          imageAlt: 'iNVTRY mobile app wear and cost analytics',
        },
        {
          id: 'profile',
          icon: 'scanFace',
          tabLabel: 'Profile',
          title: '0B Local Tone',
          caption: 'On-device MediaPipe WASM skin-tone calibration with zero facial upload.',
          metricTag: '0B Face',
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
        'A weather-reactive Wardrobe Asset OS uniting owned clothes, 360° fitting, CPW analytics, and verified one-tap resale.',
      marbleHint: 'Roll the marble into any menu below, or tap to open',
      primaryCta: 'Open Studio',
      secondaryCta: 'Contact Founder',
    },
    capabilities: {
      badge: 'Working MVP',
      pillars: {
        atelier: {
          code: '3D Fitting Engine',
          eyebrow: 'Three.js 0.187 · Multi-Layer',
          title: 'Four-Season 360° Fitting',
          features: [
            {
              id: 'rig',
              icon: 'move3d',
              label: '21-Bone Rig',
              tag: 'SpringBone',
              detail: 'Simulates idle, walking, rain-umbrella, and hand postures with cloth drape.',
            },
            {
              id: 'slots',
              icon: 'layers',
              label: '11-Slot Layers',
              tag: '28 Morphs',
              detail: 'Stacks inner, mid, outer, shoes, and accessories with show-through fit checks.',
            },
            {
              id: 'angles',
              icon: 'rotate3d',
              label: '8-Angle 360°',
              tag: 'Optical Flow',
              detail: 'Generates smooth full-turnaround views across front, side, and back silhouettes.',
            },
            {
              id: 'pacer',
              icon: 'gauge',
              label: '120Hz / 30Hz',
              tag: '2D Fallback',
              detail: 'Adapts GPU refresh dynamically and falls back to 2D collage on WebGL loss.',
            },
          ],
        },
        intelligence: {
          code: 'Care & Asset OS',
          eyebrow: 'CPW · Care · Verified Resale',
          title: 'Wear Economics & Care',
          features: [
            {
              id: 'cpw',
              icon: 'trendingDown',
              label: 'CPW Telemetry',
              tag: 'Price ÷ Wears',
              detail: 'Calendar wear logs calculate real cost-per-wear and flag idle pieces.',
            },
            {
              id: 'resale',
              icon: 'badgeCheck',
              label: 'Authentic Resale',
              tag: '1-Tap Trust',
              detail: 'Pairs stored photos with luxury and purchase records for verified one-tap resale.',
            },
            {
              id: 'care',
              icon: 'droplets',
              label: 'Care Rules',
              tag: 'Bleed Guard',
              detail: 'Matches fabric care tags to wash rules and warns on color-bleed risk.',
            },
            {
              id: 'map',
              icon: 'mapPin',
              label: 'Nearby Care Map',
              tag: 'Places API',
              detail: 'Locates nearby dry-cleaners, tailors, and leather-care shops via server proxy.',
            },
          ],
        },
      },
    },
    architecture: {
      badge: '6-Tier · Privacy-by-Design',
      blueprintTitle: 'iNVTRY 6-Tier System & Hardware',
      modeDevLabel: 'Current Dev (MVP)',
      modeProdLabel: 'Prod Scale + GPU',
      devTag: 'MVP',
      prodTag: 'PROD',
      govLabel: 'Governance',
      privacyStripLabel: 'Privacy 4-Shield',
      openPrivacyCta: 'Details',
      tiers: [
        {
          id: 'client',
          num: '01',
          label: 'Client Apps',
          shortLabel: '01 Client',
          nodes: [
            {
              id: 'invtry-web',
              icon: 'globe',
              label: 'iNVTRY Web',
              shortSub: 'React 19 PWA',
              highlight: true,
              devSpec: 'React 19 + TypeScript 7 + Vite 8 + MediaPipe WASM local analysis.',
              prodSpec: 'Global PWA with IndexedDB offline sync and zero biometric uploads.',
            },
            {
              id: 'invtry-native',
              icon: 'smartphone',
              label: 'iNVTRY Mobile',
              shortSub: 'iOS · Android',
              highlight: true,
              devSpec: 'Capacitor 8 single-codebase hybrid wrapper with native haptics.',
              prodSpec: 'App Store & Google Play release with Keychain / Keystore binding.',
            },
            {
              id: 'ops-console',
              icon: 'layoutGrid',
              label: 'Ops Console',
              shortSub: 'Catalog · QC',
              devSpec: 'Local seed curation, visual VTON QC audit, and Playwright E2E gate.',
              prodSpec: 'Role-scoped curation admin, resale partner verification, and alerts.',
            },
          ],
        },
        {
          id: 'edge',
          num: '02',
          label: 'Edge Access',
          shortLabel: '02 Edge',
          nodes: [
            {
              id: 'cdn',
              icon: 'cloud',
              label: 'CDN Edge',
              shortSub: 'Cloudflare',
              devSpec: 'Cloudflare Workers Static Assets serving immutable hashed bundles.',
              prodSpec: 'Multi-region Edge CDN caching static 3D base assets and web shells.',
            },
            {
              id: 'lb-waf',
              icon: 'network',
              label: 'Load Balancer · WAF',
              shortSub: 'TLS 1.3',
              devSpec: 'Managed HTTPS ingress with HSTS, CSP headers, and IP rate limits.',
              prodSpec: 'Global Cloud Load Balancer + Cloud Armor WAF DDoS and bot defense.',
            },
          ],
        },
        {
          id: 'gateway',
          num: '03',
          label: 'API Gateway',
          shortLabel: '03 Gateway',
          highlight: true,
          nodes: [
            {
              id: 'invtry-gw',
              icon: 'keyRound',
              label: 'iNVTRY Unified API Gateway',
              shortSub: 'Stateless OIDC · Rate Limit',
              highlight: true,
              devSpec: 'Express 5 hardened proxy: Apple/Google OIDC JWKS, HttpOnly cookie, zero IdP tokens.',
              prodSpec: 'Cloud Run API Gateway: short-lived JWT + rotating refresh tokens + anomaly alerts.',
            },
          ],
        },
        {
          id: 'core',
          num: '04',
          label: 'iNVTRY Core',
          shortLabel: '04 iNVTRY',
          highlight: true,
          nodes: [
            {
              id: 'core-vton',
              icon: 'cpu',
              label: 'iNVTRY 3D · VTON',
              shortSub: 'L4 / A100 GPU',
              highlight: true,
              devSpec: 'Three.js 21-bone rig + Gemini / Vertex Paid No-Training VTON proxy.',
              prodSpec: 'Auto-scaling Cloud Run + NVIDIA L4 / A100 GPU workers in VPC boundary.',
            },
            {
              id: 'core-closet',
              icon: 'shirt',
              label: 'iNVTRY Closet · CPW',
              shortSub: '11-Slot OS',
              highlight: true,
              devSpec: '11-slot taxonomy, calendar wear logs, CPW calculator, and duplicate guard.',
              prodSpec: 'Multi-tenant wardrobe service with real-time wear analytics pipelines.',
            },
            {
              id: 'core-weather',
              icon: 'cloudSun',
              label: 'iNVTRY Weather · TPO',
              shortSub: 'Maps Proxy',
              highlight: true,
              devSpec: 'Server proxy for Weather API v1, Places API (New), and Street View.',
              prodSpec: 'Regional geo-proxy with shared Redis TTL cache and zero media persistence.',
            },
            {
              id: 'core-resale',
              icon: 'badgeCheck',
              label: 'iNVTRY Auth Resale',
              shortSub: 'Provenance Sync',
              highlight: true,
              devSpec: 'Dormant CPW item detector reusing stored photos and garment metadata.',
              prodSpec: 'Luxury & purchase-record authentication API feeding transparent 1-tap resale.',
            },
          ],
        },
        {
          id: 'shared',
          num: '05',
          label: 'Shared Base',
          shortLabel: '05 Shared',
          nodes: [
            {
              id: 'shared-log',
              icon: 'fileSearch',
              label: 'Logging · Tracing',
              shortSub: 'Masked Audit',
              devSpec: 'Structured server logs with PII redaction and stack-trace masking.',
              prodSpec: 'Cloud Logging + OpenTelemetry tracing with retention rollover.',
            },
            {
              id: 'shared-oss',
              icon: 'hardDrive',
              label: 'Object Storage',
              shortSub: '3-Zone Private',
              devSpec: 'Owner-prefix /uploads with magic-byte check, 4MB cap, and sandbox CSP.',
              prodSpec: 'GCS 3-Zone (Public Seed / Private 15m Signed URL / 24h Ephemeral VTON).',
            },
            {
              id: 'shared-mq',
              icon: 'workflow',
              label: 'Async Queue (MQ)',
              shortSub: 'Pub/Sub Jobs',
              devSpec: 'Progressive stage streaming for 8-angle try-on and vision tagging.',
              prodSpec: 'Google Cloud Pub/Sub decoupling GPU VTON jobs and resale sync webhooks.',
            },
          ],
        },
        {
          id: 'data',
          num: '06',
          label: 'Data · Hardware',
          shortLabel: '06 Data/HW',
          nodes: [
            {
              id: 'data-sql',
              icon: 'database',
              label: 'Primary DB',
              shortSub: 'SQLite → Cloud SQL',
              devSpec: 'sql.js WASM SQLite + client IndexedDB offline vault for rapid MVP.',
              prodSpec: 'Cloud SQL PostgreSQL HA (Multi-AZ) with strict row-level tenant isolation.',
            },
            {
              id: 'data-redis',
              icon: 'zap',
              label: 'Memory Cache',
              shortSub: 'TTL → Redis HA',
              devSpec: 'In-process 20–30m weather TTL cache and IP rate-limit buckets.',
              prodSpec: 'Memorystore Redis Cluster for sessions, revocation lists, and geo cache.',
            },
            {
              id: 'data-gpu',
              icon: 'server',
              label: 'Compute · GPU',
              shortSub: 'Cloud Run · L4/A100',
              devSpec: 'Single Node Express 5 server + serverless Vertex AI Paid inference.',
              prodSpec: 'Auto-scaled Cloud Run HA + dedicated NVIDIA L4 / A100 GPU worker pool.',
            },
            {
              id: 'data-vault',
              icon: 'lock',
              label: 'Encrypted Vault',
              shortSub: 'CMEK AES-256',
              devSpec: 'Isolated local faceMemoryStore + server-only process.env secrets.',
              prodSpec: 'Cloud KMS CMEK (AES-256-GCM) + Secret Manager + VPC Service Controls.',
            },
          ],
        },
      ],
      governance: [
        {
          id: 'gov-audit',
          icon: 'activity',
          label: 'Audit Log',
          shortSub: 'Trace',
          devSpec: 'Masked API request logs and automated verify:secrets pre-commit scan.',
          prodSpec: 'Tamper-evident security audit logs with 24h incident response SOP.',
        },
        {
          id: 'gov-rbac',
          icon: 'userCheck',
          label: 'Access Control',
          shortSub: 'Tenant Guard',
          devSpec: 'resolveAuthorizedClosets enforces strict per-user isolation (anti-IDOR).',
          prodSpec: 'Least-privilege IAM service accounts + periodic penetration testing.',
        },
        {
          id: 'gov-cicd',
          icon: 'gitBranch',
          label: 'Git CI / CD',
          shortSub: 'Verify Gate',
          devSpec: 'oxlint + TypeScript 7 strict + 210+ unit/E2E tests before auto deploy.',
          prodSpec: 'Automated PII/EXIF regression gates + canary Cloud Run rollout.',
        },
      ],
      privacyEyebrow: 'Risk Mitigation · Privacy-by-Design',
      privacyHeading: '4-Line Personal Data Defense',
      privacyBadge: '0B Biometrics · Zero OAuth Tokens',
      privacyCurrentLabel: 'Implemented Now (MVP)',
      privacyProdLabel: 'Production Hardening',
      privacyRetentionLabel: 'Retention & Disposal',
      privacyShields: [
        {
          id: 'biometric',
          icon: 'scanFace',
          code: '01',
          shortLabel: '0B Face WASM',
          title: 'On-Device Biometric Isolation',
          statusTag: 'Implemented',
          devStatus: 'MediaPipe FaceLandmarker WASM runs 100% on-device; calibrated tone stays in local IndexedDB (0 bytes uploaded).',
          prodTarget: 'Maintains strict 0-byte raw face upload invariant across iOS, Android, and Web.',
          retention: 'Camera frames: 0s RAM volatile · Local vault purged on logout/delete.',
        },
        {
          id: 'oidc',
          icon: 'keyRound',
          code: '02',
          shortLabel: 'Zero OAuth Keys',
          title: 'Stateless OIDC & Anti-ATO Guard',
          statusTag: 'Implemented',
          devStatus: 'Server verifies Apple/Google OIDC signatures, stores zero external IdP tokens, blocks unverified email auto-merge, and issues HttpOnly cookies.',
          prodTarget: 'Adds short-lived access + rotating refresh tokens bound to iOS Keychain & Android Keystore.',
          retention: 'IdP tokens: Never stored · Expired sessions auto-purged every 12h.',
        },
        {
          id: 'vault',
          icon: 'shieldCheck',
          code: '03',
          shortLabel: '3-Zone CMEK',
          title: 'Tenant & 3-Zone Storage Isolation',
          statusTag: 'MVP + Prod 3-Zone',
          devStatus: 'Every API passes resolveAuthorizedClosets (anti-IDOR) with magic-byte upload checks, path-traversal guard, and sandbox CSP.',
          prodTarget: 'Physical GCS 3-Zone split (Public Seed / Private Bucket with 15m Signed URL + CMEK / 24h Ephemeral VTON).',
          retention: 'VTON scratch: 24h auto-expire · Zero public URL access to user garments.',
        },
        {
          id: 'exif',
          icon: 'trash',
          code: '04',
          shortLabel: 'EXIF · Atomic Erase',
          title: 'EXIF Strip, No-Training AI & One-Stop Erase',
          statusTag: 'Implemented',
          devStatus: 'Client separation & WebP re-encoding strip GPS/EXIF and indoor rooms; Vertex Paid No-Training excludes PII; DELETE /api/auth/account wipes all stores atomically.',
          prodTarget: 'Enforces Vertex AI VPC Service Controls and automated CI PII/EXIF regression gates.',
          retention: 'AI payload: 0-day volatile · Account delete wipes DB, files, cache & IndexedDB.',
        },
      ],
      mapsEyebrow: 'Google Cloud · Maps · Three.js 0.187',
      mapsHeading: 'Google API × 3D Live Engine',
      mapsBadge: '5 Live · 1 TO-DO',
      mapsComplianceFooter:
        'Server-only keys · Minimal FieldMask · Free Street View metadata pre-check · 0 permanent media cached',
      weatherMoods: {
        sunny: 'Clear · Sun',
        rain: 'Rain · Umbrella',
        wind: 'Wind · Drape',
      },
      mapsNodes: [
        {
          id: 'weather',
          icon: 'umbrella',
          code: '01',
          apiName: 'Weather API v1',
          status: 'live',
          statusLabel: 'LIVE',
          role: '3D Motion · Rain',
          theaterHeadline: 'Live Weather × 3D Umbrella Motion',
          theaterTelemetry: 'Three.js 0.187 · Real-Time Weather Motion · Umbrella Rain Collision',
          detail:
            'Streams real temperature swings, precipitation alerts, and wind directly into Three.js 0.187 umbrella posture, raindrop collision, and outfit layering.',
          compliance: '20–30m Memory TTL',
        },
        {
          id: 'streetview',
          icon: 'compass',
          code: '02',
          apiName: 'Street View',
          status: 'live',
          statusLabel: 'LIVE',
          role: 'Avatar in Street',
          theaterHeadline: 'Dressed Avatar in Real Destination Street',
          theaterTelemetry: 'Free streetview/metadata Pre-Check · 37.54°N 127.05°E · 0 Media Stored',
          detail:
            'Verifies coverage via free Street View metadata pre-check and stages your dressed 3D avatar directly on the actual street you plan to visit.',
          compliance: '0 Media Stored in DB',
        },
        {
          id: 'places',
          icon: 'mapPin',
          code: '03',
          apiName: 'Places API (New)',
          status: 'live',
          statusLabel: 'LIVE',
          role: 'TPO · Care Map',
          theaterHeadline: 'Nearby Care & Venue Context Map',
          theaterTelemetry: 'Minimal FieldMask · Dry Cleaners · Tailors · Leather Care',
          detail:
            'Matches venue TPO context for outfit recommendations and locates nearby dry-cleaners, tailors, and leather-care shops via server proxy.',
          compliance: 'Minimal FieldMask',
        },
        {
          id: 'vertex',
          icon: 'sparkles',
          code: '04',
          apiName: 'Gemini · Vertex AI',
          status: 'live',
          statusLabel: 'LIVE',
          role: 'No-Training VTON',
          theaterHeadline: 'PII-Free Auto Tagging & 2K Multi-Angle VTON',
          theaterTelemetry: 'Paid Tier No-Training · 11-Slot Classification · 8-Angle QC',
          detail:
            'Auto-classifies front/back EXIF-stripped garment photos and synthesizes 2K multi-angle try-on views with zero training retention.',
          compliance: '0-Day Stateless',
        },
        {
          id: 'mediapipe',
          icon: 'scanFace',
          code: '05',
          apiName: 'MediaPipe WASM',
          status: 'live',
          statusLabel: 'LIVE',
          role: '0B Local Tone',
          theaterHeadline: 'On-Device FaceLandmarker Skin-Tone Engine',
          theaterTelemetry: '100% Client WASM · PCCS 12-Tone · 0 Bytes Uploaded',
          detail:
            'Calibrates personal skin tone and body proportions locally on-device with zero facial camera frames ever leaving your browser or phone.',
          compliance: '0 Bytes Uploaded',
        },
        {
          id: 'calendar',
          icon: 'calendar',
          code: '06',
          apiName: 'Calendar API',
          status: 'todo',
          statusLabel: 'TO-DO',
          role: 'OOTD · SNS Sync',
          theaterHeadline: 'Google Calendar OOTD & SNS Tagging',
          theaterTelemetry: 'TO-DO Roadmap · Calendar Event Save · Instagram Garment Tags',
          detail:
            'Planned integration: save modeled daily looks straight to Google Calendar events and export Instagram/SNS OOTD captions with garment tags.',
          compliance: 'TO-DO Roadmap',
        },
      ],
    },
    interactive: {
      stanceIdle: 'Stand',
      stanceWalk: 'Walk',
      stanceRain: 'Rain',
      pccsNote: 'PCCS 12-Tone · MST-04',
      beforeLabel: 'Original',
      afterLabel: 'Separated WebP',
      sliderHint: 'Drag to compare original photo and background-separated WebP',
      ingestionBadge: 'EXIF / GPS & Background Stripped',
      ingestionMeta: '582 KB → 23 KB WebP (-96%)',
      cpwLabel: 'Avg Cost / Wear',
      cpwValue: '₩14,200',
      cpwDelta: '-18% MoM',
      balanceLabel: 'Closet Utilization',
      balanceValue: '98.4%',
      balanceMeta: '0 bleed conflicts',
      dupTitle: 'Care & Nearby Map',
      dupStatus: 'Places API',
      ootdDate: 'Weather v1',
      ootdTitle: 'Alerts & UV Guidance',
    },
    stack: {
      eyebrow: 'Verified Specs',
      heading: 'Measured Engineering & Security Metrics',
      note: 'Verified directly from active codebase',
      heroKpis: [
        {
          id: 'loop',
          icon: 'refreshCw',
          value: '5-Stage',
          label: 'Closed Loop',
          detail: 'Connects Closet → Weather → 360° Fit → Calendar → CPW & Verified One-Tap Resale.',
        },
        {
          id: 'face',
          icon: 'shieldCheck',
          value: '0 Bytes',
          label: 'Face Uploaded',
          detail: 'MediaPipe WASM runs locally on-device with zero external transmission of facial frames.',
        },
        {
          id: 'tests',
          icon: 'checkCircle',
          value: '210+',
          label: 'Automated Tests',
          detail: '30+ unit & E2E suites covering VTON, Weather, Maps, Care, Security, and GPU Pacing.',
        },
        {
          id: 'apis',
          icon: 'cloud',
          value: '4 APIs',
          label: 'Google Cloud',
          detail: 'Integrates Vertex/Gemini No-Training, Weather API v1, Places API (New), and Street View.',
        },
      ],
      benchmarkTitle: 'Core Verification Specs',
      specs: [
        {
          id: 'webp',
          icon: 'imageMinus',
          shortLabel: 'EXIF Strip',
          label: 'Background Separation & EXIF Strip',
          valueText: '582 KB → 23 KB (-96%)',
          detail: 'Client WebP re-encoding strips GPS, device EXIF, and indoor room backgrounds before upload.',
        },
        {
          id: 'defense',
          icon: 'lock',
          shortLabel: '4-Line Privacy',
          label: 'Privacy-by-Design 4-Line Defense',
          valueText: '0B Face · Zero IdP',
          detail: 'Local WASM biometrics, stateless OIDC, tenant isolation, No-Training AI, and atomic erasure.',
        },
        {
          id: 'rig3d',
          icon: 'box',
          shortLabel: '3D Rig',
          label: 'Four-Season 3D Multi-Layering',
          valueText: '21B · 28M · 8A',
          detail: '21-bone skeletal rig, 28 body morphs, 11-slot layering, 8-angle turnaround, 120Hz/30Hz pacing.',
        },
        {
          id: 'cpw',
          icon: 'coins',
          shortLabel: 'CPW & Resale',
          label: 'CPW Telemetry & Verified Resale',
          valueText: '11 Slots · 253+ Items',
          detail: 'Calculates real cost-per-wear, flags dormant pieces, and links purchase provenance to 1-tap resale.',
        },
      ],
      cards: [
        {
          id: 'three',
          icon: 'box',
          eyebrow: '3D Graphics',
          metric: 'Three.js 0.187',
          title: 'Multi-Layer Rig',
          detail: '21-bone rig, SpringBone cloth, 28 morphs, 8-angle turnaround, and 120Hz/30Hz pacer.',
          boundary: 'WebGL2',
        },
        {
          id: 'ai',
          icon: 'sparkles',
          eyebrow: 'Multimodal AI',
          metric: 'Gemini · Vertex',
          title: 'No-Training VTON',
          detail: 'PII-free prompts, Paid No-Training path, automated angle QC, and plain-language rationale.',
          boundary: '0-Day Stateless',
        },
        {
          id: 'maps',
          icon: 'mapPin',
          eyebrow: 'Maps & Weather',
          metric: 'Google Maps',
          title: 'Weather · Places',
          detail: 'Weather API v1 alerts, Places API (New) care map, and zero-cache Street View proxy.',
          boundary: 'Server Proxy',
        },
        {
          id: 'security',
          icon: 'shield',
          eyebrow: 'On-Device Privacy',
          metric: '0-Byte Face',
          title: 'OIDC · 3-Zone',
          detail: 'MediaPipe WASM local tone, zero stored OAuth tokens, tenant isolation, and atomic erase.',
          boundary: '4-Line Defense',
        },
        {
          id: 'asset',
          icon: 'badgeCheck',
          eyebrow: 'Wardrobe OS',
          metric: 'CPW · Auth Resale',
          title: 'Circular Economy',
          detail: 'Calendar OOTD logging, dormant item detection, and purchase-verified one-tap resale.',
          boundary: 'Closed Loop',
        },
        {
          id: 'runtime',
          icon: 'smartphone',
          eyebrow: 'Cross-Platform',
          metric: 'Capacitor 8',
          title: 'React 19 · Express 5',
          detail: 'Strict TypeScript 7, offline-first IndexedDB, single codebase for web, iOS, and Android.',
          boundary: 'Web · iOS · AOS',
        },
      ],
    },
    journey: {
      badge: '6-Cut AI Cycle',
      autoPlayLabel: 'Auto',
      pausePlayLabel: 'Pause',
      prevLabel: 'Previous cut',
      nextCutLabel: 'Next cut',
      nextStepLabel: 'Next: 02 Mission & Roadmap',
      cuts: [
        {
          id: 'buy',
          num: '01',
          icon: 'shoppingBag',
          shortTitle: 'Buy Check',
          title: 'Smart Purchase Decision',
          status: 'live',
          statusLabel: 'LIVE',
          imageSrc: '/assets/journey/clay-cut-01-v1.webp',
          imageAlt: 'Minimal 3D clay figurine comparing a boutique coat against owned closet duplicate hologram',
          speechBubble: '“2 similar coats owned — 1 wear since last year. Buy this & list the idle one!”',
          apiChips: ['Closet AI Compare', 'Wear & CPW History'],
          detail:
            'Compares a new item against your closet (similar count, purchase date, wear count) to guide smarter buy-or-resale decisions.',
        },
        {
          id: 'scan',
          num: '02',
          icon: 'camera',
          shortTitle: 'Smart Scan',
          title: 'Auto Classify & Tag Lookup',
          status: 'hybrid',
          statusLabel: 'LIVE + TO-DO',
          imageSrc: '/assets/journey/clay-cut-02-v1.webp',
          imageAlt: 'Minimal 3D clay figurine scanning a wool coat paper tag with instant studio packshot and care icons',
          speechBubble: '“Snap front/back to auto-classify — or snap the tag/model code for clean web photo & care!”',
          apiChips: ['Gemini Vision (LIVE)', 'Tag · Model Web Lookup (TO-DO)'],
          detail:
            'LIVE: Front/back photo AI auto-classification. TO-DO: Snap tag or model code to fetch clean official web photos & care instructions.',
        },
        {
          id: 'weather',
          num: '03',
          icon: 'umbrella',
          shortTitle: 'Weather & Street',
          title: 'Weather 3D Motion & Street View',
          status: 'live',
          statusLabel: 'LIVE',
          imageSrc: '/assets/journey/clay-cut-03-v1.webp',
          imageAlt: 'Minimal 3D clay figurine in a trench coat walking down a rainy street with translucent umbrella',
          speechBubble: '“Rain forecast! 3D umbrella stance & my dressed look right on the actual Street View.”',
          apiChips: ['Weather API v1', 'Three.js 0.187', 'Street View'],
          detail:
            'Combines Weather API v1, owned closet, and on-device face/body data for 3D umbrella physics and Google Street View staging.',
        },
        {
          id: 'share',
          num: '04',
          icon: 'share2',
          shortTitle: 'Calendar & SNS',
          title: 'Google Calendar & SNS OOTD',
          status: 'todo',
          statusLabel: 'TO-DO',
          imageSrc: '/assets/journey/clay-cut-04-v1.webp',
          imageAlt: 'Minimal 3D clay figurine pinning a miniature coat outfit onto a dark glass calendar lookbook wall',
          speechBubble: '“Save today’s 3D look to Google Calendar & auto-tag my garments for Instagram OOTD!”',
          apiChips: ['Google Calendar API (TO-DO)', 'SNS Auto-Tagging (TO-DO)'],
          detail:
            'TO-DO Roadmap: Save modeled outfits directly into Google Calendar and generate Instagram/SNS OOTD captions with garment tags.',
        },
        {
          id: 'care',
          num: '05',
          icon: 'truck',
          shortTitle: 'Care & Pickup',
          title: 'Laundry Guide & Door Pickup',
          status: 'hybrid',
          statusLabel: 'LIVE + TO-DO',
          imageSrc: '/assets/journey/clay-cut-05-v1.webp',
          imageAlt: 'Minimal 3D clay figurine checking fabric laundry care symbols beside a glowing pickup delivery cube',
          speechBubble: '“Dry-clean wool coat — view care symbols and book door pickup via laundry service app!”',
          apiChips: ['Care Rules · Places API (LIVE)', 'Laundry Pickup App (TO-DO)'],
          detail:
            'LIVE: Fabric care rules & nearby dry-cleaners via Places API. TO-DO: One-tap door pickup booking with laundry service apps.',
        },
        {
          id: 'resale',
          num: '06',
          icon: 'badgeCheck',
          shortTitle: 'Verified Resale',
          title: 'Authentic One-Tap Resale',
          status: 'hybrid',
          statusLabel: 'LIVE + TO-DO',
          imageSrc: '/assets/journey/clay-cut-06-v1.webp',
          imageAlt: 'Two minimal 3D clay figurines exchanging a verified authentic jacket with a golden seal in a resale gallery',
          speechBubble: '“Unused piece found! Stored photos, AI analysis & purchase proof go straight to trusted resale.”',
          apiChips: ['Idle CPW Alert (LIVE)', 'Auth Provenance Resale (TO-DO)'],
          detail:
            'LIVE: Dormant CPW detection. TO-DO: Bundle stored photos, AI metadata & retailer purchase records for transparent authentic resale.',
        },
      ],
    },
    mission: {
      eyebrow: '02 · Mission & Roadmap',
      badge: 'Verified Circular Wardrobe',
      headingLead: 'Wear what you own. ',
      headingAccent: 'Circulate with trust.',
      commitments: [
        {
          id: 'wear',
          icon: 'shirt',
          num: '01',
          title: 'Wear First',
          tag: 'OWNED CLOSET',
          detail: 'Start every morning with clothes you already own, fitted in 360° for today’s real weather.',
        },
        {
          id: 'cpw',
          icon: 'barChart',
          num: '02',
          title: 'CPW Telemetry',
          tag: 'PRICE ÷ WEARS',
          detail: 'Track real cost-per-wear from daily calendar logs to surface dormant garments objectively.',
        },
        {
          id: 'resale',
          icon: 'badgeCheck',
          num: '03',
          title: 'Verified Resale',
          tag: 'AUTH PROVENANCE',
          detail: 'Link luxury receipts and purchase history with authenticity checks for transparent one-tap resale.',
        },
      ],
      centerKicker: 'iNVTRY LOOP',
      centerTitle: 'Closed Loop',
      centerSub: 'Sustainable AI Closet',
      autoPlayLabel: 'Auto',
      pausePlayLabel: 'Pause',
      loopNodes: [
        {
          id: 'closet',
          icon: 'shirt',
          num: '01',
          title: 'Closet',
          subtitle: '11-Slot Archive',
          detail: 'EXIF-stripped WebP items auto-tagged by fabric, color, season, and purchase provenance.',
        },
        {
          id: 'weather',
          icon: 'cloudSun',
          num: '02',
          title: 'Weather',
          subtitle: 'Temp · Rain · UV',
          detail: 'Injects Google Weather API v1 temperature swings, alerts, and UV directly into daily outfits.',
        },
        {
          id: 'avatar',
          icon: 'personStanding',
          num: '03',
          title: '360° Fit',
          subtitle: 'Multi-Layer 3D',
          detail: 'Simulates four-season inner, mid, and outer layering across 8 turnaround angles before dressing.',
        },
        {
          id: 'calendar',
          icon: 'calendar',
          num: '04',
          title: 'Calendar',
          subtitle: 'OOTD Log',
          detail: 'Logs real worn outfits by date and prepares Google Calendar sync + SNS OOTD garment tagging.',
        },
        {
          id: 'cpw',
          icon: 'coins',
          num: '05',
          title: 'CPW & Idle',
          subtitle: 'Wear Value',
          detail: 'Flags low-CPW dormant items automatically to unlock verified one-tap resale and block duplicates.',
        },
      ],
      exits: [
        {
          id: 'resale',
          icon: 'badgeCheck',
          title: 'Verified 1-Tap Resale',
          subtitle: 'Luxury & purchase-record authenticity',
          detail: 'Reuses stored photos, AI analysis, and purchase receipts with authenticity checks for transparent one-tap resale.',
        },
        {
          id: 'purchase',
          icon: 'shoppingBag',
          title: 'Gap-Only Purchase',
          subtitle: 'Zero duplicates · verified gaps',
          detail: 'Checks new items against your owned 11-slot closet so you only buy verified missing layers.',
        },
      ],
      nextLabel: 'Next: 03 BM & Founder',
    },
    vision: {
      eyebrow: '03 · BM & Founder',
      heading: 'From Working MVP to Verified Circular Platform',
      irBadge: 'Seoul · 2026',
      quote:
        '“When your closet connects daily weather, 3D fit, real wear counts, and verified authenticity, every garment lives longer and trades with trust.”',
      roadmapTitle: 'Execution & TO-DO Roadmap',
      milestones: [
        {
          id: 'stage-1',
          icon: 'checkCircle',
          phase: 'LIVE 01',
          status: 'done',
          title: '3D Rig · 0B Vision',
          tag: 'Implemented',
          detail: 'LIVE: 21-bone umbrella rig, 28 morphs, 11-slot front/back auto-classification, EXIF strip, MediaPipe WASM.',
        },
        {
          id: 'stage-2',
          icon: 'shieldCheck',
          phase: 'LIVE 02',
          status: 'done',
          title: 'Google API · 4-Shield',
          tag: 'Implemented',
          detail: 'LIVE: Weather API v1, Street View avatar backdrop, Places Care Map, Stateless OIDC, tenant guard & atomic erase.',
        },
        {
          id: 'stage-3',
          icon: 'rocket',
          phase: 'TO-DO',
          status: 'active',
          title: 'Tag · Calendar · SNS · Pickup · Resale',
          tag: 'TO-DO Plan',
          detail: 'TO-DO: Tag/model web image & care lookup, Google Calendar sync, Instagram/SNS OOTD tagging, laundry pickup app & verified authentic resale API.',
        },
      ],
      moatsTitle: 'Four Core Moats',
      moats: [
        {
          id: 'mvp',
          icon: 'smartphone',
          title: 'Working MVP',
          tag: '210+ Tests',
          detail: 'React 19 + Capacitor 8 (iOS/Android) live build ready for hands-on evaluation.',
        },
        {
          id: 'layer360',
          icon: 'layers',
          title: '360° Multi-Layer',
          tag: '11 Slots',
          detail: 'Full inner, mid, outer, and umbrella simulation tuned for four-season temperature swings.',
        },
        {
          id: 'provenance',
          icon: 'badgeCheck',
          title: 'Verified Resale Loop',
          tag: 'Trust Loop',
          detail: 'Daily wear logs + purchase provenance create counterfeit-free supply without cold-start friction.',
        },
        {
          id: 'privacy',
          icon: 'lock',
          title: '4-Line Privacy',
          tag: '0B Biometrics',
          detail: 'On-device WASM biometrics, zero OAuth tokens, 3-Zone CMEK isolation, and atomic deletion.',
        },
      ],
      nextToBmLabel: 'Next: 03 BM & Founder',
      revenueTitle: '3-Pillar Circular Business Model',
      revenueNote: 'Daily weather styling retention powers sustainable monetization',
      revenuePillars: [
        {
          id: 'pro',
          icon: 'crown',
          num: '01',
          title: 'Pro Subscription',
          mechanism: 'Recurring SaaS',
          detail: 'Unlimited multi-angle 2K try-on, TPO & travel capsule plans, and deep CPW asset analytics.',
        },
        {
          id: 'affiliate',
          icon: 'shoppingBag',
          num: '02',
          title: 'Gap-Only Affiliate',
          mechanism: 'Zero Duplicates',
          detail: 'Recommends only verified missing layers or color gaps tailored to owned clothes for high conversion.',
        },
        {
          id: 'resale-bm',
          icon: 'badgeCheck',
          num: '03',
          title: 'Verified Auth Resale',
          mechanism: 'Trust Commission',
          detail: 'Monetizes one-tap resale backed by luxury purchase records and partner authenticity verification.',
        },
      ],
      backToMissionLabel: '01 User Journey',
      founderRole: 'Founder & Engineer · Ainvtry',
      hqLabel: 'Location',
      hqValue: 'Seoul, South Korea',
      domainLabel: 'Website',
      stackSummaryLabel: 'Cloud',
      stackSummaryValue: 'Google Cloud · Vertex AI · Maps Platform',
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
      studioIntel: '케어 · CPW',
      archBlueprint: '시스템 구성도',
      archPrivacy: '개인정보 · 보안',
      archMaps: 'Google API × 3D',
      benchKpi: '핵심 지표',
      benchMatrix: '기술 스택',
      aboutJourney: '01 유저 여정',
      aboutMission: '02 미션 · 로드맵',
      aboutFounder: '03 BM · 창업자',
    },
    tapHint: '아이콘을 눌러 간결한 설명 보기',
    appPreview: {
      code: 'iNVTRY · 모바일 앱',
      title: '실구동 하이브리드 앱',
      badge: '4모드 연동',
      screens: [
        {
          id: 'outfits',
          icon: 'shirt',
          tabLabel: '피팅',
          title: '360° 가상 피팅',
          caption: '실시간 날씨와 거리뷰 배경 위에서 0°–360° 다중 레이어드를 미리 확인합니다.',
          metricTag: '360°',
          imageAlt: 'iNVTRY 모바일 앱 가상 피팅 스튜디오 화면',
        },
        {
          id: 'closet',
          icon: 'layoutGrid',
          tabLabel: '옷장',
          title: '11슬롯 옷장',
          caption: '자동 태깅 보유 의류, 착용 횟수 카운터, 세탁 바구니를 한 번에 관리합니다.',
          metricTag: '11슬롯',
          imageAlt: 'iNVTRY 모바일 앱 디지털 옷장 화면',
        },
        {
          id: 'stats',
          icon: 'barChart',
          tabLabel: '통계',
          title: 'CPW · 리셀',
          caption: '1회 착용 단가(CPW)와 유휴 의류를 식별해 정품 인증 원탭 리셀로 연결합니다.',
          metricTag: 'CPW',
          imageAlt: 'iNVTRY 모바일 앱 옷장 통계 화면',
        },
        {
          id: 'profile',
          icon: 'scanFace',
          tabLabel: '프로필',
          title: '0B 로컬 피부톤',
          caption: '외부 전송 0 Bytes 기기 내 MediaPipe WASM 피부톤 진단과 체형 보정.',
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
        '보유 옷장과 실시간 날씨를 360° 피팅, CPW 분석, 정품 인증 원탭 리셀로 잇는 개인 의류 자산 OS.',
      marbleHint: '유리 구슬을 굴려 아래 메뉴를 맞추거나 눌러서 이동해 보세요',
      primaryCta: '스튜디오 보기',
      secondaryCta: '창업자 문의',
    },
    capabilities: {
      badge: '실구동 MVP',
      pillars: {
        atelier: {
          code: '3D 피팅 엔진',
          eyebrow: 'Three.js 0.187 · 다중 레이어링',
          title: '사계절 360° 가상 피팅',
          features: [
            {
              id: 'rig',
              icon: 'move3d',
              label: '21관절 리그',
              tag: 'SpringBone',
              detail: '기본 · 워킹 · 우산 · 손 포즈와 원단 드레이프 물리를 실시간 구동합니다.',
            },
            {
              id: 'slots',
              icon: 'layers',
              label: '11슬롯 레이어',
              tag: '28종 모프',
              detail: '이너 · 미드 · 아우터 · 신발을 겹쳐 입히고 비침과 핏 균형을 확인합니다.',
            },
            {
              id: 'angles',
              icon: 'rotate3d',
              label: '8앵글 360°',
              tag: '회전 뷰',
              detail: '정면 · 측면 · 후면 전 각도 실루엣을 부드러운 회전 피팅으로 검증합니다.',
            },
            {
              id: 'pacer',
              icon: 'gauge',
              label: '120Hz / 30Hz',
              tag: '2D 폴백',
              detail: '상황에 맞춰 GPU 주사율을 조절하고 WebGL 손실 시 2D 콜라주로 즉시 복구합니다.',
            },
          ],
        },
        intelligence: {
          code: '케어 · 자산 OS',
          eyebrow: 'CPW · 케어 · 정품 인증 리셀',
          title: '착용 효율과 의류 케어',
          features: [
            {
              id: 'cpw',
              icon: 'trendingDown',
              label: 'CPW 분석',
              tag: '구매가 ÷ 착용',
              detail: '캘린더 착용 기록으로 1회 착용 단가와 미착용 유휴 의류를 자동 계산합니다.',
            },
            {
              id: 'resale',
              icon: 'badgeCheck',
              label: '정품 인증 리셀',
              tag: '투명 거래',
              detail: '명품 구매 이력과 정품 인증 연동을 묶어 신뢰할 수 있는 원탭 리셀을 지원합니다.',
            },
            {
              id: 'care',
              icon: 'droplets',
              label: '세탁 규칙',
              tag: '이염 경고',
              detail: '소재별 세탁 라벨 주의사항과 이염 위험 조합을 사전에 알려줍니다.',
            },
            {
              id: 'map',
              icon: 'mapPin',
              label: '주변 케어 지도',
              tag: 'Places 연동',
              detail: '서버 프록시로 가까운 드라이클리닝 · 수선실 · 가죽 케어 매장을 찾아줍니다.',
            },
          ],
        },
      },
    },
    architecture: {
      badge: '6계층 · Privacy-by-Design',
      blueprintTitle: 'iNVTRY 6계층 시스템 · 하드웨어 구성',
      modeDevLabel: '현재 개발 (MVP)',
      modeProdLabel: '상용 스케일 · GPU',
      devTag: '현재 개발',
      prodTag: '상용 확장',
      govLabel: '운영 · 거버넌스',
      privacyStripLabel: '4중 보안 방어',
      openPrivacyCta: '상세',
      tiers: [
        {
          id: 'client',
          num: '01',
          label: '프론트엔드',
          shortLabel: '01 클라이언트',
          nodes: [
            {
              id: 'invtry-web',
              icon: 'globe',
              label: 'iNVTRY 웹',
              shortSub: 'React 19 PWA',
              highlight: true,
              devSpec: 'React 19 · TypeScript 7 · Vite 8 및 기기 내 MediaPipe WASM 분석.',
              prodSpec: 'IndexedDB 오프라인 동기화와 안면 0-Byte 격리를 유지하는 글로벌 PWA.',
            },
            {
              id: 'invtry-native',
              icon: 'smartphone',
              label: 'iNVTRY 모바일 앱',
              shortSub: 'iOS · Android',
              highlight: true,
              devSpec: 'Capacitor 8 단일 코드베이스 하이브리드 앱 및 네이티브 햅틱 연동.',
              prodSpec: 'App Store · Google Play 출시 및 Keychain · Keystore 하드웨어 키 바인딩.',
            },
            {
              id: 'ops-console',
              icon: 'layoutGrid',
              label: '운영 콘솔',
              shortSub: '카탈로그 · 검수',
              devSpec: '샘플 시드 관리, VTON 품질 검수, Playwright 모바일 자동 검증.',
              prodSpec: '권한 분리 운영 백오피스, 정품 인증 파트너 검수 및 이상 징후 관제.',
            },
          ],
        },
        {
          id: 'edge',
          num: '02',
          label: '서비스 접근',
          shortLabel: '02 엣지',
          nodes: [
            {
              id: 'cdn',
              icon: 'cloud',
              label: 'CDN 가속',
              shortSub: 'Cloudflare',
              devSpec: 'Cloudflare Workers Static Assets 기반 불변 해시 에셋 배포.',
              prodSpec: '글로벌 멀티 리전 CDN으로 공용 3D 베이스 에셋과 앱 셸 초저지연 전송.',
            },
            {
              id: 'lb-waf',
              icon: 'network',
              label: '부하 분산 · WAF',
              shortSub: 'TLS 1.3',
              devSpec: 'HTTPS 강제, HSTS · CSP 보안 헤더 및 IP 단위 Rate Limit 적용.',
              prodSpec: '글로벌 Cloud Load Balancer + Cloud Armor WAF 디도스 · 봇 방어.',
            },
          ],
        },
        {
          id: 'gateway',
          num: '03',
          label: 'API 게이트웨이',
          shortLabel: '03 게이트웨이',
          highlight: true,
          nodes: [
            {
              id: 'invtry-gw',
              icon: 'keyRound',
              label: 'iNVTRY 통합 API 게이트웨이',
              shortSub: 'Stateless OIDC · 토큰 인증',
              highlight: true,
              devSpec: 'Express 5 보안 프록시: Apple/Google OIDC 서명 검증, HttpOnly 쿠키, 외부 토큰 무저장.',
              prodSpec: 'Cloud Run 게이트웨이: 단기 JWT + Refresh 토큰 순환 및 이상 로그인 차단.',
            },
          ],
        },
        {
          id: 'core',
          num: '04',
          label: 'iNVTRY 코어',
          shortLabel: '04 iNVTRY',
          highlight: true,
          nodes: [
            {
              id: 'core-vton',
              icon: 'cpu',
              label: 'iNVTRY 3D · VTON',
              shortSub: 'L4 / A100 GPU',
              highlight: true,
              devSpec: 'Three.js 21관절 엔진 + Gemini · Vertex 유료 무학습 VTON 프록시.',
              prodSpec: '자동 확장 Cloud Run + VPC 경계 내 NVIDIA L4 / A100 전용 GPU 워커.',
            },
            {
              id: 'core-closet',
              icon: 'shirt',
              label: 'iNVTRY 옷장 · CPW',
              shortSub: '11슬롯 OS',
              highlight: true,
              devSpec: '11슬롯 분류, 캘린더 착용 기록, CPW 단가 산출 및 중복 구매 차단.',
              prodSpec: '테넌트 격리 기반 대규모 의류 자산 관리 및 실시간 활용도 분석 엔진.',
            },
            {
              id: 'core-weather',
              icon: 'cloudSun',
              label: 'iNVTRY 기상 · 장소',
              shortSub: 'Maps 프록시',
              highlight: true,
              devSpec: 'Weather API v1 · Places API (New) · Street View 서버 전용 프록시.',
              prodSpec: '리전별 기상 · 장소 프록시와 공유 Redis TTL 캐시 (지도 미디어 무저장).',
            },
            {
              id: 'core-resale',
              icon: 'badgeCheck',
              label: 'iNVTRY 정품 리셀',
              shortSub: '구매 기록 연동',
              highlight: true,
              devSpec: '유휴 의류 자동 감지 및 기존 등록 사진 · 스펙 기반 원탭 판매글 생성.',
              prodSpec: '명품 구매 이력 · 영수증 기반 정품 인증 파트너 API 연동 투명 리셀.',
            },
          ],
        },
        {
          id: 'shared',
          num: '05',
          label: '공공 기초',
          shortLabel: '05 기초 서비스',
          nodes: [
            {
              id: 'shared-log',
              icon: 'fileSearch',
              label: '로그 · 추적',
              shortSub: '비식별 감사',
              devSpec: 'PII 마스킹 구조화 로그 및 스택 트레이스 노출 차단 에러 핸들러.',
              prodSpec: 'Cloud Logging + OpenTelemetry 분산 추적 및 법정 기한 자동 롤오버.',
            },
            {
              id: 'shared-oss',
              icon: 'hardDrive',
              label: '파일 스토리지',
              shortSub: '3-Zone 비공개',
              devSpec: '소유자 접두사 /uploads, 매직바이트 검증, 4MB 상한, 샌드박스 CSP.',
              prodSpec: 'GCS 3-Zone 분리 (공용 시드 / 비공개 15분 서명 URL / 24시간 임시 VTON).',
            },
            {
              id: 'shared-mq',
              icon: 'workflow',
              label: '메시지 큐 (MQ)',
              shortSub: '비동기 작업',
              devSpec: '8앵글 가상 피팅과 비전 태깅을 위한 단계별 스트리밍 파이프라인.',
              prodSpec: 'Google Cloud Pub/Sub 기반 GPU 피팅 큐잉 및 리셀 인증 웹훅 처리.',
            },
          ],
        },
        {
          id: 'data',
          num: '06',
          label: '데이터 · HW',
          shortLabel: '06 데이터/HW',
          nodes: [
            {
              id: 'data-sql',
              icon: 'database',
              label: '관계형 DB',
              shortSub: 'SQLite → Cloud SQL',
              devSpec: 'sql.js WASM SQLite 및 단말 IndexedDB 오프라인 우선 구조.',
              prodSpec: 'Cloud SQL PostgreSQL HA (Multi-AZ) 및 행 단위 테넌트 격리.',
            },
            {
              id: 'data-redis',
              icon: 'zap',
              label: '인메모리 캐시',
              shortSub: 'TTL → Redis HA',
              devSpec: '서버 메모리 20~30분 날씨 TTL 캐시 및 Rate Limit 버킷.',
              prodSpec: 'Memorystore Redis 클러스터 (세션 블랙리스트 · 기상 · 인증 캐시).',
            },
            {
              id: 'data-gpu',
              icon: 'server',
              label: '연산 · GPU 장비',
              shortSub: 'Cloud Run · L4/A100',
              devSpec: '단일 Express 5 서버 + 서버리스 Vertex AI 유료 API 추론.',
              prodSpec: '오토스케일링 Cloud Run HA + 전용 NVIDIA L4 / A100 GPU 워커 풀.',
            },
            {
              id: 'data-vault',
              icon: 'lock',
              label: '암호화 볼트',
              shortSub: 'CMEK AES-256',
              devSpec: '로컬 IndexedDB 페이스 볼트 및 서버 전용 환경변수 시크릿 격리.',
              prodSpec: 'Cloud KMS CMEK (AES-256-GCM) · Secret Manager · VPC Service Controls.',
            },
          ],
        },
      ],
      governance: [
        {
          id: 'gov-audit',
          icon: 'activity',
          label: '감사 로그',
          shortSub: '추적',
          devSpec: '비식별 접속 로그 및 커밋 전 자동 시크릿 스캔(verify:secrets) 적용.',
          prodSpec: '위변조 방지 보안 감사 로그 및 침해사고 24시간 대응 매뉴얼(SOP) 운영.',
        },
        {
          id: 'gov-rbac',
          icon: 'userCheck',
          label: '권한 제어',
          shortSub: '테넌트 가드',
          devSpec: 'resolveAuthorizedClosets 중앙 가드로 계정 간 교차 접근(IDOR) 원천 차단.',
          prodSpec: '최소 권한 IAM 서비스 계정 분리 및 출시 전 외부 모의해킹 진단 수행.',
        },
        {
          id: 'gov-cicd',
          icon: 'gitBranch',
          label: 'Git 배포',
          shortSub: '자동 검증',
          devSpec: 'oxlint · TypeScript strict · 210+ 단위/E2E 테스트 통과 후 자동 배포.',
          prodSpec: 'PII · EXIF 누수 회귀 테스트 CI 게이트 및 무중단 카나리 배포.',
        },
      ],
      privacyEyebrow: '핵심 리스크 대응 · Privacy-by-Design',
      privacyHeading: '개인정보 4중 방어 아키텍처',
      privacyBadge: '안면 0 Bytes · OAuth 토큰 무저장',
      privacyCurrentLabel: '현재 구현 완료 (MVP)',
      privacyProdLabel: '상용 확장 보안 고도화',
      privacyRetentionLabel: '보유기간 및 파기 원칙',
      privacyShields: [
        {
          id: 'biometric',
          icon: 'scanFace',
          code: '01',
          shortLabel: '0B 로컬 안면',
          title: '온디바이스 0-Byte 생체 격리',
          statusTag: '구현 완료',
          devStatus: '안면 피부톤 분석을 기기 내 MediaPipe WASM에서만 수행하고 로컬 IndexedDB에만 보관합니다 (외부 전송 0\u00A0Bytes).',
          prodTarget: '웹 · iOS · Android 전 플랫폼에서 안면 원본 무전송 원칙을 영구 유지합니다.',
          retention: '카메라 원본: 0초 즉시 휘발 · 로그아웃/탈퇴 시 로컬 볼트 전량 초기화.',
        },
        {
          id: 'oidc',
          icon: 'keyRound',
          code: '02',
          shortLabel: 'OAuth 무저장',
          title: 'Stateless OIDC · 계정 탈취(ATO) 차단',
          statusTag: '구현 완료',
          devStatus: 'Apple/Google OIDC 서명을 서버에서 직접 검증하고 외부 IdP 토큰을 저장하지 않으며, 미검증 이메일 자동 병합을 금지합니다.',
          prodTarget: '단기 Access + 회전 Refresh 토큰 및 iOS Keychain · Android Keystore 바인딩 추가.',
          retention: '외부 IdP 토큰: 전면 미저장 · 만료 세션 12시간 주기 자동 소거.',
        },
        {
          id: 'vault',
          icon: 'shieldCheck',
          code: '03',
          shortLabel: '3-Zone 격리',
          title: '테넌트 · 3-Zone 암호화 스토리지 격리',
          statusTag: 'MVP + 상용 3-Zone',
          devStatus: '모든 API에 resolveAuthorizedClosets 테넌트 가드를 강제하고 업로드 매직바이트 검증과 샌드박스 CSP를 적용했습니다.',
          prodTarget: 'GCS 3-Zone 물리 분리 (공용 시드 / 비공개 버킷 15분 서명 URL + CMEK / 24시간 임시 VTON).',
          retention: '임시 VTON 캐시: 24시간 자동 영구 삭제 · 사용자 의류 공개 URL 접근 원천 차단.',
        },
        {
          id: 'exif',
          icon: 'trash',
          code: '04',
          shortLabel: 'EXIF · 원스톱 파기',
          title: 'EXIF 제거 · 무학습 AI · 원스톱 즉시 파기',
          statusTag: '구현 완료',
          devStatus: '클라이언트 배경 분리 · WebP 변환으로 GPS/EXIF와 실내 배경을 제거하고, PII 없는 Vertex 유료 무학습 추론과 탈퇴 즉시 원스톱 파기를 구현했습니다.',
          prodTarget: 'Vertex AI VPC Service Controls 경계 격리 및 CI 단계 PII/EXIF 회귀 검증 자동화.',
          retention: 'AI 페이로드: 0일 즉시 폐기 · 탈퇴 시 DB · 파일 · 캐시 · IndexedDB 동시 파기.',
        },
      ],
      mapsEyebrow: 'Google Cloud · Maps · Three.js 0.187',
      mapsHeading: 'Google API × 3D 라이브 엔진',
      mapsBadge: '5 LIVE · 1 TO-DO',
      mapsComplianceFooter:
        'API 키 서버 전용 격리 · 최소 FieldMask · Street View 무료 메타데이터 선조회 · 미디어 DB 저장 0건',
      weatherMoods: {
        sunny: '맑음 · 햇빛',
        rain: '비 · 우산 모션',
        wind: '강풍 · 드레이프',
      },
      mapsNodes: [
        {
          id: 'weather',
          icon: 'umbrella',
          code: '01',
          apiName: 'Weather API v1',
          status: 'live',
          statusLabel: 'LIVE',
          role: '3D 모션 · 강수',
          theaterHeadline: '실시간 날씨 × 3D 우산 모션 · 빗방울 물리',
          theaterTelemetry: 'Three.js 0.187 · 실시간 기상 모션 · 우산 빗방울 충돌 물리',
          detail:
            '실시간 기온 · 일교차 · 강수 · 바람 데이터를 최신 Three.js 0.187 21관절 우산 모션, 빗방울 충돌 효과, 일일 코디 레이어링에 즉시 반영합니다.',
          compliance: '20~30분 메모리 TTL',
        },
        {
          id: 'streetview',
          icon: 'compass',
          code: '02',
          apiName: 'Street View',
          status: 'live',
          statusLabel: 'LIVE',
          role: '거리 위 아바타',
          theaterHeadline: '실제 방문할 거리뷰 위에 서 있는 내 캐릭터',
          theaterTelemetry: 'streetview/metadata 무료 선조회 · 37.54°N 127.05°E · 미디어 무저장',
          detail:
            'Google Street View와 연동해 무료 메타데이터 확인 후 내가 입은 옷 그대로 실제 방문할 거리뷰 배경 위에 캐릭터를 연출합니다.',
          compliance: '미디어 DB 무저장',
        },
        {
          id: 'places',
          icon: 'mapPin',
          code: '03',
          apiName: 'Places API (New)',
          status: 'live',
          statusLabel: 'LIVE',
          role: '장소 · 케어 지도',
          theaterHeadline: '장소 맥락 추천 · 주변 세탁 · 수선 지도',
          theaterTelemetry: '최소 FieldMask · 드라이클리닝 · 수선실 · 가죽 케어 프록시',
          detail:
            '방문 장소 맥락에 맞는 코디를 돕고, 집에서 세탁하기 어려운 의류를 위해 가까운 드라이클리닝 · 수선실 · 가죽 케어를 지도에 연결합니다.',
          compliance: '최소 FieldMask',
        },
        {
          id: 'vertex',
          icon: 'sparkles',
          code: '04',
          apiName: 'Gemini · Vertex AI',
          status: 'live',
          statusLabel: 'LIVE',
          role: '무학습 VTON',
          theaterHeadline: 'PII 배제 앞뒤 자동 분류 · 2K 멀티앵글 피팅',
          theaterTelemetry: '유료 무학습 경로 · 11슬롯 자동 분류 · 8앵글 품질 검수',
          detail:
            'EXIF가 제거된 의류 앞뒤 사진을 자동 분류하고, 모델 재학습 없는 2K 멀티앵글 가상 피팅과 코디 추천 해설을 제공합니다.',
          compliance: '0일 즉시 폐기',
        },
        {
          id: 'mediapipe',
          icon: 'scanFace',
          code: '05',
          apiName: 'MediaPipe WASM',
          status: 'live',
          statusLabel: 'LIVE',
          role: '0B 로컬 피부톤',
          theaterHeadline: '온디바이스 안면 피부톤 · 체형 보정 엔진',
          theaterTelemetry: '100% 기기 내 WASM · PCCS 12톤 · 안면 외부 전송 0\u00A0Bytes',
          detail:
            '사용자 기기 안에서 MediaPipe WASM으로 얼굴 피부톤과 체형을 보정해 개인 맞춤 모델링을 제공하며 원본 얼굴은 외부로 전송하지 않습니다.',
          compliance: '안면 전송 0\u00A0Bytes',
        },
        {
          id: 'calendar',
          icon: 'calendar',
          code: '06',
          apiName: 'Calendar API',
          status: 'todo',
          statusLabel: 'TO-DO',
          role: '코디 저장 · SNS',
          theaterHeadline: 'Google Calendar 코디 저장 · SNS OOTD 태깅',
          theaterTelemetry: 'TO-DO 구현 계획 · 캘린더 일정 기록 · 인스타그램 착용 태깅',
          detail:
            '구현 계획(TO-DO): 모델링한 오늘 코디를 Google Calendar에 일정으로 저장하고 인스타그램 등 SNS 설명과 착용 의류 태깅을 자동 완성합니다.',
          compliance: 'TO-DO 구현 계획',
        },
      ],
    },
    interactive: {
      stanceIdle: '기본 자세',
      stanceWalk: '워킹',
      stanceRain: '우산',
      pccsNote: 'PCCS 12톤 · MST-04',
      beforeLabel: '원본 사진',
      afterLabel: '배경 분리 WebP',
      sliderHint: '좌우로 드래그해 원본 사진과 배경 분리 WebP 결과를 비교하세요',
      ingestionBadge: 'EXIF / GPS · 배경 완전 제거',
      ingestionMeta: '582 KB → 23 KB WebP (-96%)',
      cpwLabel: '평균 1회 착용 단가',
      cpwValue: '₩14,200',
      cpwDelta: '전월 대비 -18%',
      balanceLabel: '옷장 활용률',
      balanceValue: '98.4%',
      balanceMeta: '이염 충돌 0건',
      dupTitle: '세탁 · 주변 케어 지도',
      dupStatus: 'Places 연동',
      ootdDate: 'Weather v1',
      ootdTitle: '기상특보 · UV 안내',
    },
    stack: {
      eyebrow: '검증 스펙',
      heading: '실측 엔지니어링 · 보안 지표',
      note: '현재 저장소 테스트 · 보안 명세 기준',
      heroKpis: [
        {
          id: 'loop',
          icon: 'refreshCw',
          value: '5-Stage',
          label: '순환 생애주기',
          detail: '옷장 → 국지 기상 → 360° 피팅 → 캘린더 → CPW · 정품 인증 원탭 리셀 연결.',
        },
        {
          id: 'face',
          icon: 'shieldCheck',
          value: '0 Bytes',
          label: '안면 외부 전송',
          detail: '기기 내 MediaPipe WASM 처리로 얼굴 카메라 원본이 외부로 전송되지 않습니다.',
        },
        {
          id: 'tests',
          icon: 'checkCircle',
          value: '210+',
          label: '자동화 테스트',
          detail: 'VTON · 날씨 · 지도 · 케어 · 보안 · 프레임 제어 30+ 자동 스위트 검증.',
        },
        {
          id: 'apis',
          icon: 'cloud',
          value: '4 APIs',
          label: 'Google Cloud',
          detail: 'Vertex/Gemini 무학습, Weather API v1, Places API (New), Street View 연동.',
        },
      ],
      benchmarkTitle: '핵심 검증 항목',
      specs: [
        {
          id: 'webp',
          icon: 'imageMinus',
          shortLabel: 'EXIF 제거',
          label: '배경 분리 및 EXIF 제거',
          valueText: '582 KB → 23 KB (-96%)',
          detail: '클라이언트 WebP 재인코딩 단계에서 GPS · 기기 정보와 실내 사생활 배경을 제거합니다.',
        },
        {
          id: 'defense',
          icon: 'lock',
          shortLabel: '4중 보안',
          label: 'Privacy-by-Design 4대 방어선',
          valueText: '0B 생체 · 토큰 무저장',
          detail: '온디바이스 WASM, Stateless OIDC, 테넌트 격리, 무학습 AI, 원스톱 즉시 파기.',
        },
        {
          id: 'rig3d',
          icon: 'box',
          shortLabel: '3D 엔진',
          label: '사계절 3D 다중 레이어링',
          valueText: '21관절 · 28모프 · 8앵글',
          detail: '11슬롯 다겹 피팅, 0°–360° 회전 및 120Hz/60Hz/30Hz 가변 프레임 제어.',
        },
        {
          id: 'cpw',
          icon: 'coins',
          shortLabel: 'CPW · 리셀',
          label: 'CPW 분석 및 정품 인증 리셀',
          valueText: '11슬롯 · 253+ 아이템',
          detail: '1회 착용 단가와 유휴 의류를 식별해 구매 이력 기반 정품 인증 리셀로 연결합니다.',
        },
      ],
      cards: [
        {
          id: 'three',
          icon: 'box',
          eyebrow: '3D 그래픽',
          metric: 'Three.js 0.187',
          title: '다중 레이어 리그',
          detail: '21관절 리그, SpringBone 물리, 28모프, 8앵글 회전, 120Hz/30Hz 페이서.',
          boundary: 'WebGL2',
        },
        {
          id: 'ai',
          icon: 'sparkles',
          eyebrow: '멀티모달 AI',
          metric: 'Gemini · Vertex',
          title: '무학습 2K VTON',
          detail: 'PII 배제 프롬프트, 유료 무학습 추론, 자동 각도 검수 및 코디 이유 해설.',
          boundary: '0일 즉시 폐기',
        },
        {
          id: 'maps',
          icon: 'mapPin',
          eyebrow: '지도 · 기상',
          metric: 'Google Maps',
          title: 'Weather · Places',
          detail: 'Weather API v1 특보, Places API (New) 케어 지도, 무저장 거리뷰 프록시.',
          boundary: '서버 프록시',
        },
        {
          id: 'security',
          icon: 'shield',
          eyebrow: '온디바이스 보안',
          metric: '0-Byte 안면',
          title: 'OIDC · 3-Zone',
          detail: '로컬 MediaPipe WASM, OAuth 토큰 무저장, 테넌트 격리 및 원스톱 파기.',
          boundary: '4대 방어선',
        },
        {
          id: 'asset',
          icon: 'badgeCheck',
          eyebrow: '의류 자산 OS',
          metric: 'CPW · 정품 리셀',
          title: '순환 리셀 엔진',
          detail: '캘린더 착용 로깅, 유휴 의류 감지, 명품 · 구매 이력 정품 인증 원탭 리셀.',
          boundary: '폐루프 엔진',
        },
        {
          id: 'runtime',
          icon: 'smartphone',
          eyebrow: '앱 런타임',
          metric: 'Capacitor 8',
          title: 'React 19 · Express 5',
          detail: 'TypeScript 7 strict, 오프라인 우선 IndexedDB, 웹 · iOS · Android 단일 코드.',
          boundary: '크로스플랫폼',
        },
      ],
    },
    journey: {
      badge: '6컷 AI 여정',
      autoPlayLabel: '자동 재생',
      pausePlayLabel: '일시정지',
      prevLabel: '이전 컷',
      nextCutLabel: '다음 컷',
      nextStepLabel: '다음: 02 미션 · 로드맵',
      cuts: [
        {
          id: 'buy',
          num: '01',
          icon: 'shoppingBag',
          shortTitle: '구매 판단',
          title: '옷장 비교 기반 현명한 구매 결정',
          status: 'live',
          statusLabel: 'LIVE',
          imageSrc: '/assets/journey/clay-cut-01-v1.webp',
          imageAlt: '매장에서 미니멀 3D 클레이 캐릭터가 보유 옷장 중복 코트와 착용 기록 홀로그램을 비교하는 장면',
          speechBubble: '“비슷한 코트가 2벌! 작년에 1회 입었으니 이건 사고 안 입는 옷은 중고로 팔자.”',
          apiChips: ['옷장 유사도 비교', '구매 시기 · 착용 횟수'],
          detail:
            '구매 전 기존 옷장의 비슷한 옷 수량 · 구매 시기 · 착용 횟수를 비교해 새 옷 구매와 기존 옷 리셀 판단을 돕습니다.',
        },
        {
          id: 'scan',
          num: '02',
          icon: 'camera',
          shortTitle: '스마트 등록',
          title: '앞뒤 자동 분류 · 택 모델명 검색',
          status: 'hybrid',
          statusLabel: 'LIVE + TO-DO',
          imageSrc: '/assets/journey/clay-cut-02-v1.webp',
          imageAlt: '미니멀 3D 클레이 캐릭터가 울 코트 택을 스마트폰으로 스캔해 공식 이미지와 세탁 기호를 불러오는 장면',
          speechBubble: '“앞뒤 사진은 자동 분류! 택이나 모델명만 찍으면 공식 이미지와 세탁법까지 자동 등록.”',
          apiChips: ['앞뒤 AI 분류 (LIVE)', '택 · 모델명 웹 검색 (TO-DO)'],
          detail:
            'LIVE: 앞뒤 사진 AI 자동 감지 · 분류. TO-DO: 택 · 모델명 촬영 시 인터넷 공식 깨끗한 이미지 자동 등록 및 세탁법 안내.',
        },
        {
          id: 'weather',
          num: '03',
          icon: 'umbrella',
          shortTitle: '날씨 · 거리뷰',
          title: '실시간 날씨 3D 모션 · 거리뷰 모델링',
          status: 'live',
          statusLabel: 'LIVE',
          imageSrc: '/assets/journey/clay-cut-03-v1.webp',
          imageAlt: '트렌치코트를 입은 미니멀 3D 클레이 캐릭터가 비 오는 거리뷰 배경에서 투명 우산을 쓰고 걷는 장면',
          speechBubble: '“오늘 비 예보! 얼굴 · 체형 맞춤 코디를 3D 우산 모션과 실제 거리뷰 위에서 확인해요.”',
          apiChips: ['Weather API v1', 'Three.js 0.187', 'Street View'],
          detail:
            '실시간 날씨 API · 보유 옷장 · 얼굴과 체형 정보로 코디를 추천하고 3D 우산 모션 및 Google Street View 위 모델링을 연출합니다.',
        },
        {
          id: 'share',
          num: '04',
          icon: 'share2',
          shortTitle: '캘린더 · SNS',
          title: 'Google Calendar 저장 · SNS 태깅',
          status: 'todo',
          statusLabel: 'TO-DO',
          imageSrc: '/assets/journey/clay-cut-04-v1.webp',
          imageAlt: '미니멀 3D 클레이 캐릭터가 캘린더 룩북 벽면에 오늘의 코디를 정리하고 태깅하는 장면',
          speechBubble: '“모델링한 코디를 구글 캘린더에 저장하고 인스타 OOTD 설명과 옷 태깅까지 한 번에!”',
          apiChips: ['Google Calendar (TO-DO)', '인스타 · SNS 태깅 (TO-DO)'],
          detail:
            'TO-DO 구현 계획: 모델링한 코디를 Google Calendar에 저장하고 인스타그램 등 SNS 오늘 코디 설명과 의류 태깅을 지원합니다.',
        },
        {
          id: 'care',
          num: '05',
          icon: 'truck',
          shortTitle: '세탁 · 방문수거',
          title: '세탁법 안내 · 세탁 앱 방문수거',
          status: 'hybrid',
          statusLabel: 'LIVE + TO-DO',
          imageSrc: '/assets/journey/clay-cut-05-v1.webp',
          imageAlt: '미니멀 3D 클레이 캐릭터가 의류 세탁 기호를 확인하고 세탁 방문수거 박스를 신청하는 장면',
          speechBubble: '“집에서 세탁 어려운 옷은 세탁법 확인 후 세탁 서비스 앱으로 방문수거 바로 신청!”',
          apiChips: ['세탁법 · Places 지도 (LIVE)', '세탁 앱 방문수거 (TO-DO)'],
          detail:
            'LIVE: 입은 옷 세탁법 안내 및 주변 세탁소 지도. TO-DO: 집에서 세탁 어려운 의류의 세탁 서비스 앱 연동 방문수거 신청.',
        },
        {
          id: 'resale',
          num: '06',
          icon: 'badgeCheck',
          shortTitle: '정품 리셀',
          title: '구매 이력 연동 투명 정품 중고거래',
          status: 'hybrid',
          statusLabel: 'LIVE + TO-DO',
          imageSrc: '/assets/journey/clay-cut-06-v1.webp',
          imageAlt: '두 미니멀 3D 클레이 캐릭터가 정품 인증 실과 영수증 태그가 붙은 재킷을 투명하게 거래하는 장면',
          speechBubble: '“잘 안 입는 옷 발견! 기존 사진 · AI 분석 · 구매처 이력을 묶어 투명한 정품 중고거래로.”',
          apiChips: ['미착용 CPW 감지 (LIVE)', '정품 인증 중고 연동 (TO-DO)'],
          detail:
            'LIVE: 잘 안 입는 옷 자동 탐지. TO-DO: 기존 촬영 사진 · AI 분석 정보 · 구매처 구매 이력을 연동한 투명한 정품 중고거래 플랫폼.',
        },
      ],
    },
    mission: {
      eyebrow: '02 · 미션 · 로드맵',
      badge: '정품 인증 순환 옷장',
      headingLead: '보유 의류로 완성하는 ',
      headingAccent: '지속 가능한 AI 옷장',
      commitments: [
        {
          id: 'wear',
          icon: 'shirt',
          num: '01',
          title: '보유 의류 우선',
          tag: 'WEAR FIRST',
          detail: '새 옷을 사기 전, 내 옷장 속 의류를 오늘 기온과 강수에 맞춰 360° 레이어드로 조합합니다.',
        },
        {
          id: 'cpw',
          icon: 'barChart',
          num: '02',
          title: 'CPW 착용 효율',
          tag: '구매가 ÷ 착용',
          detail: '캘린더 착용 기록으로 1회 착용 단가와 미착용 유휴 의류를 객관적으로 파악합니다.',
        },
        {
          id: 'resale',
          icon: 'badgeCheck',
          num: '03',
          title: '정품 인증 리셀',
          tag: '신뢰 순환',
          detail: '명품과 구매 이력을 정품 인증 파트너와 연동해 가품 걱정 없는 투명한 원탭 리셀로 확장합니다.',
        },
      ],
      centerKicker: 'iNVTRY LOOP',
      centerTitle: '의류 순환 루프',
      centerSub: '지속 가능한 AI 옷장',
      autoPlayLabel: '자동 재생',
      pausePlayLabel: '일시정지',
      loopNodes: [
        {
          id: 'closet',
          icon: 'shirt',
          num: '01',
          title: '디지털 옷장',
          subtitle: '11슬롯 아카이브',
          detail: 'EXIF가 제거된 WebP 의류와 소재 · 계절 · 구매 이력을 구조화해 저장합니다.',
        },
        {
          id: 'weather',
          icon: 'cloudSun',
          num: '02',
          title: '실시간 기상',
          subtitle: '기온 · 강수 · UV',
          detail: 'Google Weather API v1 일교차와 특보를 매일 아침 코디의 기준 조건으로 주입합니다.',
        },
        {
          id: 'avatar',
          icon: 'personStanding',
          num: '03',
          title: '360° 피팅',
          subtitle: '다중 레이어드',
          detail: '이너 · 미드 · 아우터를 8개 각도로 미리 겹쳐 입혀 입기 전에 핏을 검증합니다.',
        },
        {
          id: 'calendar',
          icon: 'calendar',
          num: '04',
          title: '캘린더 기록',
          subtitle: '착용 이력',
          detail: '실제 착용 코디를 날짜별로 기록하고 Google Calendar 저장 · SNS 태깅으로 확장합니다.',
        },
        {
          id: 'cpw',
          icon: 'coins',
          num: '05',
          title: 'CPW · 유휴 감지',
          subtitle: '착용 가치',
          detail: '착용 빈도가 낮은 유휴 의류를 자동 포착해 정품 인증 원탭 리셀과 중복 차단을 실행합니다.',
        },
      ],
      exits: [
        {
          id: 'resale',
          icon: 'badgeCheck',
          title: '정품 인증 원탭 리셀',
          subtitle: '명품 · 구매 기록 연동 투명 거래',
          detail: '이미 저장된 사진 · AI 분석 정보 · 구매처 구매 이력을 정품 인증과 결합해 믿을 수 있는 원탭 중고 리셀을 구현합니다.',
        },
        {
          id: 'purchase',
          icon: 'shoppingBag',
          title: '공백 보완 맞춤 구매',
          subtitle: '중복 차단 · 부족 슬롯만 제안',
          detail: '보유 옷장에 실제로 비어 있는 레이어만 검증해 충동적 중복 구매를 원천적으로 줄입니다.',
        },
      ],
      nextLabel: '다음: 03 BM · 창업자',
    },
    vision: {
      eyebrow: '03 · BM · 창업자',
      heading: '실구동 MVP에서 신뢰 기반 순환 플랫폼으로',
      irBadge: '서울 · 2026',
      quote:
        '“내 옷장의 날씨 코디, 3D 핏, 실제 착용 횟수, 정품 구매 이력이 하나로 이어질 때, 옷은 더 오래 입히고 투명하게 순환됩니다.”',
      roadmapTitle: '구현 현황 · TO-DO 로드맵',
      milestones: [
        {
          id: 'stage-1',
          icon: 'checkCircle',
          phase: 'LIVE 01',
          status: 'done',
          title: '3D 엔진 · 0B 비전',
          tag: '구현 완료',
          detail: 'LIVE: 21관절 우산 리그 · 28모프 · 앞뒤 사진 AI 자동 분류 · EXIF 제거 · MediaPipe WASM 완료.',
        },
        {
          id: 'stage-2',
          icon: 'shieldCheck',
          phase: 'LIVE 02',
          status: 'done',
          title: 'Google API · 4중 보안',
          tag: '구현 완료',
          detail: 'LIVE: Weather API v1 · Street View 아바타 · Places 케어 지도 · Stateless OIDC · 원스톱 파기 완료.',
        },
        {
          id: 'stage-3',
          icon: 'rocket',
          phase: 'TO-DO',
          status: 'active',
          title: '택 검색 · 캘린더 · SNS · 수거 · 리셀',
          tag: 'TO-DO 계획',
          detail: 'TO-DO: 택 · 모델명 공식 이미지 및 세탁법 자동 등록, Google Calendar 저장, 인스타그램 SNS 태깅, 세탁 방문수거 앱, 정품 인증 중고 연동.',
        },
      ],
      moatsTitle: '4대 기술 · 제품 해자',
      moats: [
        {
          id: 'mvp',
          icon: 'smartphone',
          title: '실구동 MVP',
          tag: '210+ 테스트',
          detail: 'React 19 · Capacitor 8(iOS/Android) 기반 즉시 시연 가능한 코드베이스.',
        },
        {
          id: 'layer360',
          icon: 'layers',
          title: '360° 다중 레이어',
          tag: '11슬롯',
          detail: '일교차와 강수 환경에 맞춰 이너 · 미드 · 아우터 · 우산까지 전 각도 시뮬레이션.',
        },
        {
          id: 'provenance',
          icon: 'badgeCheck',
          title: '정품 인증 리셀 루프',
          tag: '신뢰 공급',
          detail: '착용 이력과 명품 구매 기록을 묶어 가품 리스크와 판매 등록 장벽을 동시에 해소.',
        },
        {
          id: 'privacy',
          icon: 'lock',
          title: '4중 개인정보 방어',
          tag: '0B 생체',
          detail: '온디바이스 WASM, OAuth 토큰 무저장, 3-Zone CMEK 격리 및 원스톱 파기.',
        },
      ],
      nextToBmLabel: '다음: 03 BM · 창업자',
      revenueTitle: '지속 가능한 3중 수익 모델 (BM)',
      revenueNote: '매일 아침 코디 습관이 구독 · 제휴 · 정품 리셀로 자연스럽게 전환',
      revenuePillars: [
        {
          id: 'pro',
          icon: 'crown',
          num: '01',
          title: '프리미엄 구독',
          mechanism: 'Pro SaaS',
          detail: '무제한 2K 멀티앵글 가상 피팅, 여행 캡슐 · TPO 스타일링, 심층 CPW 자산 리포트.',
        },
        {
          id: 'affiliate',
          icon: 'shoppingBag',
          num: '02',
          title: '공백 보완 커머스',
          mechanism: '제로 중복 제휴',
          detail: '보유 옷장에 실제 비어 있는 레이어 · 색상 공백만 추천해 높은 전환과 제로 중복 달성.',
        },
        {
          id: 'resale-bm',
          icon: 'badgeCheck',
          num: '03',
          title: '정품 인증 원탭 리셀',
          mechanism: '신뢰 순환 수수료',
          detail: '명품 · 구매 기록 정품 인증 연동으로 유휴 의류를 투명한 중고 거래로 즉시 전환해 수수료 창출.',
        },
      ],
      backToMissionLabel: '01 유저 여정',
      founderRole: '창업자 & 엔지니어 · Ainvtry',
      hqLabel: '거점',
      hqValue: '대한민국 서울',
      domainLabel: '웹사이트',
      stackSummaryLabel: '클라우드',
      stackSummaryValue: 'Google Cloud · Vertex AI · Maps Platform',
      directCta: '창업자에게 메일 보내기',
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
