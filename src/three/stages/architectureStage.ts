/**
 * architectureStage.ts
 * ---------------------------------------------------------------------------
 * Interactive 3D Architecture Stage ("6-Tier Smoked-Glass Tower + Cross-Cutting Governance Frame") for ainvtry.com.
 *
 * Implements the frozen `StageModule` contract from `ainvtryStageDirector.ts`:
 *  - 6 stacked translucent smoked-glass operational tiers (01 Client Apps -> 06 Data · Hardware)
 *    with champagne-gold wireframes, active bloom rim halos, inner glow shells,
 *    base reflection puddles, floating active-tier badges, and tap raycasting.
 *  - 07 Governance rendered as an encompassing Cross-Cutting Vertical Control Plane Frame
 *    (4 structural corner pillars, top/bottom perimeter crowns, per-tier audit ticks, and a
 *    gliding cross-layer scan ring) wrapping all 6 tiers from top to bottom.
 *  - ~112 rising golden micro-particles streaming vertically along the tower spine
 *    with live `MVP <-> Prod Scale + GPU` throughput & GPU compute rim accents.
 *  - Reused glowing gold marble docking inside the active tier (or mapped Google API
 *    tier in `maps` subtab) tracked by an internal warm PointLight.
 *  - Live subtab overlays: 4 concentric Privacy Shield Halo Rings (`privacy`) and
 *    3D atmospheric weather effects (`maps`: rain streaks, wind ribbons, solar glow).
 *  - Left-58% pointer drag orbit, hover/tap selection, Glass %, Luxury/Aurora, and
 *    Light/Dark visual parity, with leak-free GPU disposal via `disposeObject3D`.
 */

import * as THREE from 'three';
import {
  STAGE_CAMERA_PRESETS,
  type MoodMode,
  type StageContext,
  type StageInteractionState,
  type StageModule,
  type ThemeMode,
} from '../ainvtryStageDirector.ts';
import { BRAND_LOGO_ASSETS } from '../../data/content.ts';
import {
  STAGE_PALETTE,
  applyGoldModeState,
  applySmokedGlassState,
  createChampagneGoldMaterial,
  createFloatingLabelSprite,
  createSmokedGlassMaterial,
  createTierTechDrawer,
  createTopSurfaceLogoFallbackTexture,
  disposeObject3D,
  type ArchStackMode,
  type FloatingLabelHandle,
  type TechRibbonItem,
  type TierTechDrawerHandle,
} from './stageMaterials.ts';

/* ==========================================================================
 * 1. Constants, Palette Helpers & Tier Metadata
 * ========================================================================== */

const SLAB_COUNT = 6;
const GOV_TIER_INDEX = 6;
const TIER_COUNT = 7;
const TIER_WIDTH = 1.32;
const TIER_HEIGHT = 0.29;
const TIER_DEPTH = 1.32;
const TIER_SPACING = 0.43;
const TOWER_CENTER_Y = -0.04;
const FLOOR_GRID_Y = -1.72;
const DEFAULT_TOWER_YAW = Math.PI * 0.22;
const DRAG_SENSITIVITY = 0.0085;

const GOV_FRAME_HALF_W = TIER_WIDTH * 0.5 + 0.28;
const GOV_FRAME_HALF_D = TIER_DEPTH * 0.5 + 0.28;

const STREAM_PARTICLE_COUNT = 112;
const STREAM_Y_MIN = -2.1;
const STREAM_Y_MAX = 2.2;
const STREAM_SPAN = STREAM_Y_MAX - STREAM_Y_MIN;

const RAIN_STREAK_COUNT = 52;
const GPU_ACCENT_TIERS: readonly number[] = [3, 5]; // 04 iNVTRY Core & 06 Data · Hardware

const INTRO_HOLD_TOP = 0.85;
const INTRO_PIVOT_END = 2.25;
const INTRO_TOP_PITCH = 1.28; // ~73 deg forward tilt showing Tier 01 top face with iNVTRY logo

interface TierSpecEntry {
  readonly label: string;
  readonly subtext: string;
  readonly mvpTechIcons: readonly TechRibbonItem[];
  readonly prodTechIcons: readonly TechRibbonItem[];
}

const TIER_SPECS: readonly TierSpecEntry[] = [
  {
    label: '01 Client Apps',
    subtext: 'Web · Mobile · Ops',
    mvpTechIcons: [
      { icon: 'react', label: 'Web PWA', tag: 'REACT · 0B' },
      { icon: 'mobile', label: 'Capacitor 8', tag: 'iOS · AOS' },
      { icon: 'sparkle', label: 'Seed QC', tag: 'SANDBOX' },
    ],
    prodTechIcons: [
      { icon: 'mobile', label: 'PWA · IDB', tag: 'OFFLINE' },
      { icon: 'lock', label: 'Keychain', tag: 'STORE HA' },
      { icon: 'activity', label: 'Telemetry', tag: 'CATALOG' },
    ],
  },
  {
    label: '02 Edge Access',
    subtext: 'CDN · TLS · WAF',
    mvpTechIcons: [
      { icon: 'cloud', label: 'CF Workers', tag: 'EDGE POP' },
      { icon: 'lock', label: 'TLS 1.3', tag: 'HSTS · CSP' },
      { icon: 'shield', label: 'Rate Limit', tag: 'API GUARD' },
    ],
    prodTechIcons: [
      { icon: 'cloud', label: 'Multi-CDN', tag: 'GLOBAL HA' },
      { icon: 'server', label: 'Anycast LB', tag: 'FAILOVER' },
      { icon: 'shieldCheck', label: 'Armor WAF', tag: 'L7 DDoS' },
    ],
  },
  {
    label: '03 API Gateway',
    subtext: 'Express · OIDC · Guard',
    mvpTechIcons: [
      { icon: 'server', label: 'Express 5', tag: 'REST · GZIP' },
      { icon: 'key', label: 'OIDC · JWT', tag: 'STATELESS' },
      { icon: 'shield', label: 'CORS Guard', tag: 'BOUNDARY' },
    ],
    prodTechIcons: [
      { icon: 'cloud', label: 'Cloud Run', tag: 'AUTOSCALE' },
      { icon: 'sync', label: 'JWT Rotate', tag: 'ZERO-TRUST' },
      { icon: 'shieldCheck', label: 'Schema Guard', tag: 'ALLOWLIST' },
    ],
  },
  {
    label: '04 iNVTRY Core',
    subtext: '3D Fit · Closet · Geo · Resale',
    mvpTechIcons: [
      { icon: 'cube3d', label: 'Three.js 3D', tag: '21-BONE' },
      { icon: 'sparkle', label: '11-Slot CPW', tag: 'CIELAB' },
      { icon: 'mapPin', label: 'Geo · Resale', tag: 'MAPS API' },
    ],
    prodTechIcons: [
      { icon: 'cube3d', label: 'Three.js PBR', tag: 'VTON PIPE' },
      { icon: 'sparkle', label: 'Wardrobe BI', tag: 'CAPSULE' },
      { icon: 'mapPin', label: 'Geo · Resale', tag: 'PARTNER' },
    ],
  },
  {
    label: '05 Shared Base',
    subtext: 'Logs · Storage · Queue',
    mvpTechIcons: [
      { icon: 'activity', label: 'Req Logger', tag: 'SAFE ERR' },
      { icon: 'storage', label: 'Media Path', tag: '4MB GUARD' },
      { icon: 'sync', label: 'SSE Retry', tag: '8-CUT JOB' },
    ],
    prodTechIcons: [
      { icon: 'activity', label: 'OTel Trace', tag: 'CLOUD LOG' },
      { icon: 'storage', label: 'GCS 3-Zone', tag: '15M SIGN' },
      { icon: 'sync', label: 'Pub/Sub DLQ', tag: 'EVENT BUS' },
    ],
  },
  {
    label: '06 Data · Hardware',
    subtext: 'SQL · Cache · GPU · Vault',
    mvpTechIcons: [
      { icon: 'database', label: 'SQLite WASM', tag: 'ATOMIC DB' },
      { icon: 'bolt', label: 'TTL Cache', tag: '20M TTL' },
      { icon: 'gpu', label: 'Vertex · Env', tag: 'ZERO-LEAK' },
    ],
    prodTechIcons: [
      { icon: 'database', label: 'CloudSQL HA', tag: 'POSTGRES' },
      { icon: 'bolt', label: 'Redis HA', tag: 'SUB-MS' },
      { icon: 'gpu', label: 'L4 / A100', tag: 'KMS CMEK' },
    ],
  },
  {
    label: '07 Governance',
    subtext: 'Cross-Cutting Control Plane',
    mvpTechIcons: [
      { icon: 'activity', label: 'Audit Gate', tag: 'PII · HOOK' },
      { icon: 'shieldCheck', label: 'RBAC · IDOR', tag: 'MENU/BTN' },
      { icon: 'gitBranch', label: 'CI · E2E', tag: '460+ QA' },
    ],
    prodTechIcons: [
      { icon: 'activity', label: 'WORM Audit', tag: 'SIEM · SOC' },
      { icon: 'key', label: 'Least IAM', tag: 'PENTEST' },
      { icon: 'gitBranch', label: 'Canary CD', tag: 'SBOM GATE' },
    ],
  },
];

const MAPS_API_SPECS = [
  { id: 'weather', label: '04 CORE · Weather API v1', tierIndex: 3 },
  { id: 'streetview', label: '04 CORE · Street View', tierIndex: 3 },
  { id: 'places', label: '04 CORE · Places API (New)', tierIndex: 3 },
  { id: 'vertex', label: '06 DATA · Vertex AI GPU', tierIndex: 5 },
  { id: 'mediapipe', label: '01 CLIENT · MediaPipe 0B', tierIndex: 0 },
  { id: 'calendar', label: '04 CORE · Calendar Sync', tierIndex: 3 },
] as const;

type PrivacyShieldKey = StageInteractionState['privacyShieldId'];

const PRIVACY_SHIELD_ORDER: readonly PrivacyShieldKey[] = ['biometric', 'oidc', 'vault', 'exif'];

const PRIVACY_SHIELD_SPECS: Readonly<
  Record<PrivacyShieldKey, { readonly index: number; readonly label: string; readonly tierIndex: number }>
> = {
  biometric: { index: 0, label: '01 CLIENT · 0B Local WASM', tierIndex: 0 },
  oidc: { index: 1, label: '03 GATEWAY · Stateless OIDC', tierIndex: 2 },
  vault: { index: 2, label: '05 SHARED · 3-Zone Vault', tierIndex: 4 },
  exif: { index: 3, label: '07 GOV · EXIF & Erase', tierIndex: 6 },
};

const getSlabCenterY = (slabIndex: number): number =>
  TOWER_CENTER_Y + ((SLAB_COUNT - 1) * 0.5 - slabIndex) * TIER_SPACING;

const GOV_TOP_Y = getSlabCenterY(0) + TIER_HEIGHT * 0.5 + 0.18;
const GOV_BOT_Y = getSlabCenterY(SLAB_COUNT - 1) - TIER_HEIGHT * 0.5 - 0.18;
const GOV_MID_Y = (GOV_TOP_Y + GOV_BOT_Y) * 0.5;
const GOV_FRAME_H = GOV_TOP_Y - GOV_BOT_Y;

const getTierCenterY = (index: number): number =>
  index >= SLAB_COUNT ? TOWER_CENTER_Y : getSlabCenterY(index);

const resolveActiveTierIndex = (state: StageInteractionState): number => {
  if (state.architectureSubtab === 'maps') {
    const apiIdx = THREE.MathUtils.clamp(Math.round(state.googleApiIndex), 0, MAPS_API_SPECS.length - 1);
    return MAPS_API_SPECS[apiIdx].tierIndex;
  }
  if (state.architectureSubtab === 'privacy') {
    return PRIVACY_SHIELD_SPECS[state.privacyShieldId]?.tierIndex ?? 0;
  }
  return THREE.MathUtils.clamp(Math.round(state.architectureTier), 0, TIER_COUNT - 1);
};

const fract = (n: number): number => n - Math.floor(n);

const pickTone = (
  isAurora: boolean,
  isDark: boolean,
  luxDark: number,
  luxLight: number,
  aurDark: number,
  aurLight: number
): number => (isAurora ? (isDark ? aurDark : aurLight) : isDark ? luxDark : luxLight);

const setMaterialBlending = (mat: THREE.Material, blending: THREE.Blending): void => {
  if (mat.blending !== blending) {
    mat.blending = blending;
    mat.needsUpdate = true;
  }
};

/* ==========================================================================
 * 2. Procedural Zero-Network Canvas Textures
 * ========================================================================== */

function createSoftGlowTexture(size = 64, warmBias = true): THREE.Texture {
  if (typeof document === 'undefined') {
    const fallback = new THREE.DataTexture(new Uint8Array([255, 240, 210, 220]), 1, 1);
    fallback.needsUpdate = true;
    return fallback;
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size * 0.5;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    if (warmBias) {
      grad.addColorStop(0.0, 'rgba(255, 250, 236, 1.0)');
      grad.addColorStop(0.28, 'rgba(244, 220, 174, 0.78)');
      grad.addColorStop(0.62, 'rgba(214, 184, 137, 0.24)');
      grad.addColorStop(1.0, 'rgba(214, 184, 137, 0.0)');
    } else {
      grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.32, 'rgba(240, 234, 222, 0.65)');
      grad.addColorStop(0.7, 'rgba(214, 184, 137, 0.14)');
      grad.addColorStop(1.0, 'rgba(214, 184, 137, 0.0)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/* ==========================================================================
 * 3. Architectural Floor Grid, GPU Accents, Particle Stream & Subtab Overlays
 * ========================================================================== */

function createArchitecturalFloorGrid() {
  const floorGroup = new THREE.Group();
  floorGroup.name = 'architecture-floor-grid';
  floorGroup.position.y = FLOOR_GRID_Y;

  const half = 4.2;
  const divisions = 18;
  const step = (half * 2) / divisions;
  const positions: number[] = [];
  for (let i = 0; i <= divisions; i += 1) {
    const c = -half + i * step;
    positions.push(-half, 0, c, half, 0, c, c, 0, -half, c, 0, half);
  }

  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

  const gridMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(STAGE_PALETTE.champagneGold) },
      uOpacity: { value: 0.24 },
      uFadeStart: { value: 1.4 },
      uFadeEnd: { value: 4.15 },
    },
    vertexShader:
      'varying vec2 vLocalXZ; void main() { vLocalXZ = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'uniform vec3 uColor; uniform float uOpacity; uniform float uFadeStart; uniform float uFadeEnd; varying vec2 vLocalXZ; void main() { float a = uOpacity * (1.0 - smoothstep(uFadeStart, uFadeEnd, length(vLocalXZ))); if (a < 0.004) discard; gl_FragColor = vec4(uColor, a); }',
  });
  floorGroup.add(new THREE.LineSegments(gridGeo, gridMat));

  const rippleRingMats: THREE.MeshBasicMaterial[] = [];
  const rippleMeshes: THREE.Mesh[] = [];
  [0.46, 0.78, 1.12].forEach((r, i) => {
    const mat = new THREE.MeshBasicMaterial({
      color: STAGE_PALETTE.champagneGoldBright,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(r - 0.012, r + 0.012, 64), mat);
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.position.y = 0.004 + i * 0.001;
    floorGroup.add(mesh);
    rippleRingMats.push(mat);
    rippleMeshes.push(mesh);
  });

  return { group: floorGroup, gridMat, rippleRingMats, rippleMeshes };
}

interface SharedGpuAccentGeometries {
  readonly finGeo: THREE.BoxGeometry;
  readonly railGeo: THREE.BufferGeometry;
  readonly ledGeo: THREE.BoxGeometry;
}

function createSharedGpuAccentGeometries(): SharedGpuAccentGeometries {
  const rHalf = TIER_WIDTH * 0.5 + 0.13;
  return {
    finGeo: new THREE.BoxGeometry(0.16, 0.11, 0.035),
    railGeo: new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-rHalf, 0, -rHalf),
      new THREE.Vector3(rHalf, 0, -rHalf),
      new THREE.Vector3(rHalf, 0, rHalf),
      new THREE.Vector3(-rHalf, 0, rHalf),
    ]),
    ledGeo: new THREE.BoxGeometry(0.14, 0.022, 0.022),
  };
}

function createGpuComputeRimAccent(tierIndex: number, shared: SharedGpuAccentGeometries) {
  const accentGroup = new THREE.Group();
  accentGroup.name = `gpu-compute-rim-${tierIndex}`;
  const baseY = getTierCenterY(tierIndex);
  accentGroup.position.y = baseY;
  accentGroup.visible = false;

  const bracketMat = createChampagneGoldMaterial('luxury', 'dark', 0.52);
  bracketMat.transparent = true;
  bracketMat.opacity = 0;

  const cOff = TIER_WIDTH * 0.5 + 0.11;
  const corners: ReadonlyArray<readonly [number, number, number]> = [
    [cOff, cOff, Math.PI * 0.25],
    [-cOff, cOff, -Math.PI * 0.25],
    [-cOff, -cOff, Math.PI * 0.25],
    [cOff, -cOff, -Math.PI * 0.25],
  ];
  for (const [cx, cz, ry] of corners) {
    const fin = new THREE.Mesh(shared.finGeo, bracketMat);
    fin.position.set(cx, 0, cz);
    fin.rotation.y = ry;
    accentGroup.add(fin);
  }

  const rHalf = TIER_WIDTH * 0.5 + 0.13;
  const railMat = new THREE.LineBasicMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  accentGroup.add(new THREE.LineLoop(shared.railGeo, railMat));

  const ledMat = new THREE.MeshBasicMaterial({
    color: 0xfff0ce,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  for (const s of [-0.34, 0.34]) {
    const slots: ReadonlyArray<readonly [number, number, number, number]> = [
      [s, 0.06, -rHalf, 0],
      [s, 0.06, rHalf, 0],
      [rHalf, -0.06, s, Math.PI * 0.5],
      [-rHalf, -0.06, s, Math.PI * 0.5],
    ];
    for (const [x, y, z, ry] of slots) {
      const bar = new THREE.Mesh(shared.ledGeo, ledMat);
      bar.position.set(x, y, z);
      bar.rotation.y = ry;
      accentGroup.add(bar);
    }
  }

  return { group: accentGroup, bracketMat, railMat, ledMat, baseY };
}

function createVerticalParticleStream(glowTexture: THREE.Texture) {
  const streamGroup = new THREE.Group();
  streamGroup.name = 'architecture-data-stream';

  const positions = new Float32Array(STREAM_PARTICLE_COUNT * 3);
  const colors = new Float32Array(STREAM_PARTICLE_COUNT * 3);
  const radii = new Float32Array(STREAM_PARTICLE_COUNT);
  const angles = new Float32Array(STREAM_PARTICLE_COUNT);
  const speeds = new Float32Array(STREAM_PARTICLE_COUNT);
  const phases = new Float32Array(STREAM_PARTICLE_COUNT);
  const isCore = new Uint8Array(STREAM_PARTICLE_COUNT);

  for (let i = 0; i < STREAM_PARTICLE_COUNT; i += 1) {
    const h1 = fract(Math.sin(i * 12.9898 + 1.23) * 43758.5453);
    const h2 = fract(Math.sin(i * 78.233 + 4.56) * 24634.6345);
    const h3 = fract(Math.sin(i * 39.425 + 7.89) * 19283.7465);

    const core = i < 82 ? 1 : 0;
    isCore[i] = core;
    radii[i] = core === 1 ? 0.05 + h1 * 0.42 : 0.56 + h1 * 0.68;
    angles[i] = h2 * Math.PI * 2;
    speeds[i] = (core === 1 ? 0.46 : 0.3) + h3 * 0.36;
    phases[i] = h2 * Math.PI * 2;

    const y = STREAM_Y_MIN + ((i / STREAM_PARTICLE_COUNT + h3 * 0.27) % 1) * STREAM_SPAN;
    positions[i * 3] = Math.cos(angles[i]) * radii[i];
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(angles[i]) * radii[i];
    colors[i * 3] = 0.9;
    colors[i * 3 + 1] = 0.78;
    colors[i * 3 + 2] = 0.58;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const pointsMat = new THREE.PointsMaterial({
    size: 0.085,
    map: glowTexture,
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, pointsMat);
  points.renderOrder = 3;
  streamGroup.add(points);

  const conduitMat = new THREE.MeshBasicMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0.04,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const conduit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.16, STREAM_SPAN * 0.88, 20, 1, true),
    conduitMat
  );
  conduit.position.y = TOWER_CENTER_Y;
  streamGroup.add(conduit);

  return { group: streamGroup, points, pointsMat, conduitMat, positions, colors, radii, angles, speeds, phases, isCore };
}

function createPrivacyVaultShield() {
  const privacyGroup = new THREE.Group();
  privacyGroup.name = 'architecture-privacy-shield';
  privacyGroup.position.y = TOWER_CENTER_Y;
  privacyGroup.visible = false;

  const HEX_RADIUS = 1.44;
  const HEX_SEGMENTS = 6;

  // Inner unit-height scalable vault cage (glides & resizes vertically to wrap active tier or full stack)
  const cageGroup = new THREE.Group();
  cageGroup.name = 'architecture-privacy-hex-cage';
  privacyGroup.add(cageGroup);

  // Translucent faceted hexagonal containment wall
  const hexWallGeo = new THREE.CylinderGeometry(HEX_RADIUS, HEX_RADIUS, 1.0, HEX_SEGMENTS, 1, true);
  const hexWallMat = new THREE.MeshBasicMaterial({
    color: STAGE_PALETTE.champagneGold,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const hexWallMesh = new THREE.Mesh(hexWallGeo, hexWallMat);
  hexWallMesh.renderOrder = 3;
  cageGroup.add(hexWallMesh);

  // Crisp hexagonal wireframe edges
  const hexEdgeGeo = new THREE.EdgesGeometry(hexWallGeo);
  const hexEdgeMat = new THREE.LineBasicMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const hexEdgeLines = new THREE.LineSegments(hexEdgeGeo, hexEdgeMat);
  hexEdgeLines.renderOrder = 4;
  cageGroup.add(hexEdgeLines);

  // 6 vertical armored firewall struts placed at every hexagonal vertex
  const strutGeo = new THREE.BoxGeometry(0.032, 1.0, 0.032);
  const strutMat = createChampagneGoldMaterial('luxury', 'dark', 0.48);
  strutMat.transparent = true;
  strutMat.opacity = 0;
  strutMat.depthWrite = false;

  const lockNodeGeo = new THREE.OctahedronGeometry(0.052, 0);
  const lockNodeMat = new THREE.MeshBasicMaterial({
    color: 0xfff3d8,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const vertexNodes: THREE.Mesh[] = [];
  const hexPts: THREE.Vector3[] = [];
  for (let i = 0; i < HEX_SEGMENTS; i += 1) {
    const a = (i / HEX_SEGMENTS) * Math.PI * 2 + Math.PI / 6;
    const vx = Math.cos(a) * HEX_RADIUS;
    const vz = Math.sin(a) * HEX_RADIUS;
    hexPts.push(new THREE.Vector3(vx, 0, vz));

    const strut = new THREE.Mesh(strutGeo, strutMat);
    strut.position.set(vx, 0, vz);
    strut.renderOrder = 4;
    cageGroup.add(strut);

    for (const signY of [-0.5, 0.5]) {
      const node = new THREE.Mesh(lockNodeGeo, lockNodeMat);
      node.position.set(vx, signY, vz);
      node.renderOrder = 5;
      cageGroup.add(node);
      vertexNodes.push(node);
    }
  }

  // Top & Bottom hexagonal perimeter collars + 4 armored corner vault clamps
  const hexRingGeo = new THREE.BufferGeometry().setFromPoints(hexPts);
  const collarMat = new THREE.LineBasicMaterial({
    color: 0xfff0cc,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const topCollar = new THREE.LineLoop(hexRingGeo, collarMat);
  topCollar.position.y = 0.5;
  topCollar.scale.setScalar(1.015);
  topCollar.renderOrder = 5;
  cageGroup.add(topCollar);

  const botCollar = new THREE.LineLoop(hexRingGeo, collarMat);
  botCollar.position.y = -0.5;
  botCollar.scale.setScalar(1.015);
  botCollar.renderOrder = 5;
  cageGroup.add(botCollar);

  // 4 chamfered vault lock brackets (not scaled vertically so their thickness stays crisp)
  const clampGroup = new THREE.Group();
  clampGroup.name = 'architecture-privacy-vault-clamps';
  privacyGroup.add(clampGroup);

  const clampMat = createChampagneGoldMaterial('luxury', 'dark', 0.56);
  clampMat.transparent = true;
  clampMat.opacity = 0;
  clampMat.depthWrite = false;

  const clampBarGeo = new THREE.BoxGeometry(0.26, 0.044, 0.044);
  const clamps: Array<{ readonly pivot: THREE.Group; readonly angle: number }> = [];
  for (let i = 0; i < 4; i += 1) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const pivot = new THREE.Group();
    pivot.rotation.y = angle;

    const armA = new THREE.Mesh(clampBarGeo, clampMat);
    armA.position.set(0.11, 0, 0);
    pivot.add(armA);

    const armB = new THREE.Mesh(clampBarGeo, clampMat);
    armB.rotation.y = Math.PI * 0.5;
    armB.position.set(0, 0, 0.11);
    pivot.add(armB);

    clampGroup.add(pivot);
    clamps.push({ pivot, angle });
  }

  // Sweeping horizontal cryptographic firewall verification beam inside the hex cage
  const scanMat = new THREE.LineBasicMaterial({
    color: 0xfff4d8,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const scanRing = new THREE.LineLoop(hexRingGeo, scanMat);
  scanRing.scale.setScalar(0.98);
  scanRing.renderOrder = 6;
  privacyGroup.add(scanRing);

  const scanBandMat = new THREE.MeshBasicMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const scanBand = new THREE.Mesh(
    new THREE.CylinderGeometry(HEX_RADIUS * 0.985, HEX_RADIUS * 0.985, 0.08, HEX_SEGMENTS, 1, true),
    scanBandMat
  );
  scanBand.renderOrder = 5;
  privacyGroup.add(scanBand);

  return {
    group: privacyGroup,
    cageGroup,
    clampGroup,
    clamps,
    hexWallMat,
    hexEdgeMat,
    strutMat,
    lockNodeMat,
    collarMat,
    clampMat,
    scanMat,
    scanBandMat,
    scanRing,
    scanBand,
    vertexNodes,
  };
}

function createWeatherOverlay(solarTexture: THREE.Texture) {
  const weatherGroup = new THREE.Group();
  weatherGroup.name = 'architecture-weather-overlay';

  // Rain: diagonal falling streaks + top-lid droplet splash ripple
  const rainGroup = new THREE.Group();
  rainGroup.name = 'architecture-weather-rain';
  rainGroup.visible = false;

  const rPos = new Float32Array(RAIN_STREAK_COUNT * 6);
  const headX = new Float32Array(RAIN_STREAK_COUNT);
  const headY = new Float32Array(RAIN_STREAK_COUNT);
  const headZ = new Float32Array(RAIN_STREAK_COUNT);
  const rSpeeds = new Float32Array(RAIN_STREAK_COUNT);
  const rLens = new Float32Array(RAIN_STREAK_COUNT);

  for (let i = 0; i < RAIN_STREAK_COUNT; i += 1) {
    const h1 = fract(Math.sin(i * 45.164 + 2.11) * 43758.5453);
    const h2 = fract(Math.sin(i * 93.719 + 5.73) * 28461.1923);
    const h3 = fract(Math.sin(i * 19.381 + 8.37) * 15927.4312);
    const r = 1.18 + h1 * 1.18;
    const theta = h2 * Math.PI * 2;
    headX[i] = Math.cos(theta) * r;
    headY[i] = -1.9 + h3 * 4.3;
    headZ[i] = Math.sin(theta) * r;
    rSpeeds[i] = 3.2 + h1 * 1.85;
    rLens[i] = 0.28 + h2 * 0.24;

    const b = i * 6;
    rPos[b] = headX[i];
    rPos[b + 1] = headY[i];
    rPos[b + 2] = headZ[i];
    rPos[b + 3] = headX[i] - rLens[i] * 0.28;
    rPos[b + 4] = headY[i] - rLens[i];
    rPos[b + 5] = headZ[i] - rLens[i] * 0.08;
  }

  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
  const rainMat = new THREE.LineBasicMaterial({
    color: 0xd8e6fa,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const rainLines = new THREE.LineSegments(rainGeo, rainMat);
  rainLines.renderOrder = 4;
  rainGroup.add(rainLines);

  const splashMat = new THREE.MeshBasicMaterial({
    color: 0xe2eeff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const splashRing = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 36), splashMat);
  splashRing.rotation.x = -Math.PI * 0.5;
  splashRing.position.set(0.14, getTierCenterY(0) + TIER_HEIGHT * 0.5 + 0.012, 0.08);
  rainGroup.add(splashRing);
  weatherGroup.add(rainGroup);

  // Wind: sweeping curved horizontal golden wind ribbons
  const windGroup = new THREE.Group();
  windGroup.name = 'architecture-weather-wind';
  windGroup.visible = false;

  const ribbonSpecs = [
    { r: 1.56, y: -1.15, span: Math.PI * 0.85, speed: 1.25, phase: 0.0 },
    { r: 1.78, y: -0.45, span: Math.PI * 1.05, speed: 1.48, phase: 1.3 },
    { r: 1.94, y: 0.22, span: Math.PI * 0.95, speed: 1.15, phase: 2.6 },
    { r: 1.72, y: 0.88, span: Math.PI * 0.88, speed: 1.58, phase: 3.9 },
    { r: 1.5, y: 1.46, span: Math.PI * 0.78, speed: 1.32, phase: 5.1 },
  ] as const;

  const windRibbons = ribbonSpecs.map((spec) => {
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 24; s += 1) {
      const t = s / 24;
      const a = t * spec.span;
      const rad = spec.r + Math.sin(t * Math.PI) * 0.14;
      pts.push(new THREE.Vector3(Math.cos(a) * rad, Math.sin(t * Math.PI * 2) * 0.12, Math.sin(a) * rad));
    }
    const mat = new THREE.MeshBasicMaterial({
      color: STAGE_PALETTE.champagneGoldBright,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.013, 6, false),
      mat
    );
    mesh.position.y = spec.y;
    mesh.rotation.y = spec.phase;
    windGroup.add(mesh);
    return { mesh, mat, baseY: spec.y, speed: spec.speed, phase: spec.phase };
  });
  weatherGroup.add(windGroup);

  // Sunny: warm top-right solar key-light glow intensification
  const sunnyGroup = new THREE.Group();
  sunnyGroup.name = 'architecture-weather-sunny';
  sunnyGroup.visible = false;

  const solarLight = new THREE.PointLight(0xffe6b8, 0, 11.5, 1.6);
  solarLight.position.set(2.35, 2.55, 1.85);
  sunnyGroup.add(solarLight);

  const solarCoreMat = new THREE.SpriteMaterial({
    map: solarTexture,
    color: 0xffe8bc,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const solarCoreSprite = new THREE.Sprite(solarCoreMat);
  solarCoreSprite.position.set(1.72, 2.02, -0.55);
  solarCoreSprite.scale.set(2.4, 2.4, 1);
  sunnyGroup.add(solarCoreSprite);

  const solarHaloMat = new THREE.MeshBasicMaterial({
    color: 0xffe2a8,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const solarHaloRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.455, 48), solarHaloMat);
  solarHaloRing.position.set(1.72, 2.02, -0.58);
  sunnyGroup.add(solarHaloRing);
  weatherGroup.add(sunnyGroup);

  return {
    group: weatherGroup,
    rain: { group: rainGroup, lines: rainLines, mat: rainMat, splashRing, splashMat, positions: rPos, headX, headY, headZ, speeds: rSpeeds, lengths: rLens },
    windGroup,
    windRibbons,
    sunnyGroup,
    solarLight,
    solarCoreSprite,
    solarCoreMat,
    solarHaloRing,
    solarHaloMat,
  };
}

/* ==========================================================================
 * 4. Architecture 3D Stage Factory (`StageModule`)
 * ========================================================================== */

interface TierRuntime {
  readonly root: THREE.Group;
  readonly baseY: number;
  readonly glassMat: THREE.MeshPhysicalMaterial;
  readonly edgeMat: THREE.LineBasicMaterial;
  readonly edgeHaloMat: THREE.LineBasicMaterial;
  readonly innerShellMat: THREE.MeshBasicMaterial;
  readonly baseGlowMat: THREE.MeshBasicMaterial;
  readonly blueprintLabel: FloatingLabelHandle;
  readonly techDrawer: TierTechDrawerHandle;
}

export function createArchitectureStage(): StageModule {
  const group = new THREE.Group();
  group.name = 'ainvtry-stage-architecture';

  const towerPivot = new THREE.Group();
  towerPivot.name = 'architecture-tower-pivot';
  towerPivot.rotation.y = DEFAULT_TOWER_YAW;
  group.add(towerPivot);

  const labelGroup = new THREE.Group();
  labelGroup.name = 'architecture-tier-labels';
  group.add(labelGroup);

  const particleGlowTex = createSoftGlowTexture(64, true);
  const baseGlowTex = createSoftGlowTexture(128, true);
  const solarGlowTex = createSoftGlowTexture(128, false);

  // Top-surface iNVTRY logo textures (immediate procedural fallback + async official PNG upgrade)
  let topLogoDarkTex: THREE.Texture = createTopSurfaceLogoFallbackTexture('dark');
  let topLogoLightTex: THREE.Texture = createTopSurfaceLogoFallbackTexture('light');
  let isDisposed = false;

  const topLogoMat = new THREE.MeshBasicMaterial({
    map: topLogoDarkTex,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
    toneMapped: false,
  });

  if (typeof window !== 'undefined') {
    const texLoader = new THREE.TextureLoader();
    const loadBrandTex = (url: string, target: 'dark' | 'light'): void => {
      texLoader.load(
        url,
        (loaded) => {
          if (isDisposed) {
            loaded.dispose();
            return;
          }
          loaded.colorSpace = THREE.SRGBColorSpace;
          loaded.minFilter = THREE.LinearMipmapLinearFilter;
          loaded.magFilter = THREE.LinearFilter;
          loaded.anisotropy = 4;
          if (target === 'dark') {
            topLogoDarkTex.dispose();
            topLogoDarkTex = loaded;
            if (currentTheme === 'dark') {
              topLogoMat.map = loaded;
              topLogoMat.needsUpdate = true;
            }
          } else {
            topLogoLightTex.dispose();
            topLogoLightTex = loaded;
            if (currentTheme === 'light') {
              topLogoMat.map = loaded;
              topLogoMat.needsUpdate = true;
            }
          }
        },
        undefined,
        () => {
          // Keep crisp procedural canvas fallback silently if asset fails to load
        }
      );
    };
    loadBrandTex(BRAND_LOGO_ASSETS.dark, 'dark');
    loadBrandTex(BRAND_LOGO_ASSETS.light, 'light');
  }

  const tierBoxGeo = new THREE.BoxGeometry(TIER_WIDTH, TIER_HEIGHT, TIER_DEPTH);
  const tierEdgeGeo = new THREE.EdgesGeometry(tierBoxGeo);
  const innerShellGeo = new THREE.BoxGeometry(TIER_WIDTH - 0.08, TIER_HEIGHT - 0.06, TIER_DEPTH - 0.08);
  const baseGlowPlaneGeo = new THREE.PlaneGeometry(TIER_WIDTH - 0.14, TIER_DEPTH - 0.14);

  let currentGlassRatio = 0.5;
  let currentMood: MoodMode = 'luxury';
  let currentTheme: ThemeMode = 'dark';
  let currentArchMode: ArchStackMode = 'mvp';
  let lastReducedMotion = false;
  let isStageEntered = false;

  // 2-Phase Intro Choreography state: Top-Face iNVTRY Logo -> Sideways Pivot & Layer Reveal
  let introClock = INTRO_PIVOT_END;
  let userDraggedDuringIntro = false;
  let lastSelectedTierIdx = 3;

  let targetYaw = DEFAULT_TOWER_YAW;
  let currentYaw = DEFAULT_TOWER_YAW;
  let towerOffsetY = 0;
  let hoveredTierIndex: number | null = null;
  let tapPulse = 0;

  let prodBlend = 0;
  let privacyBlend = 0;
  let mapsBlend = 0;
  let rainBlend = 0;
  let windBlend = 0;
  let sunnyBlend = 0;

  const activeWeights = new Float32Array(TIER_COUNT);
  activeWeights[3] = 1; // 04 iNVTRY Core highlighted by default
  const drawerUnfurls = new Float32Array(TIER_COUNT);
  const drawerOpacities = new Float32Array(TIER_COUNT);
  const slabScalesY = new Float32Array(SLAB_COUNT);
  const slabCentersY = new Float32Array(SLAB_COUNT);
  for (let i = 0; i < SLAB_COUNT; i += 1) {
    slabScalesY[i] = 1;
    slabCentersY[i] = getSlabCenterY(i);
  }
  let dynamicGovBotY = GOV_BOT_Y;

  const marbleAnchorOut = new THREE.Vector3(0, getTierCenterY(3), 0);
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const tmpColorA = new THREE.Color();
  const tmpColorB = new THREE.Color();
  const tmpColorMix = new THREE.Color();

  // Build 6 stacked operational smoked-glass tiers (01 Client -> 06 Data · Hardware)
  // + 07 Governance as an encompassing Cross-Cutting Vertical Control Plane wrapping all 6 slabs.
  const tiers: TierRuntime[] = [];
  const tierHitMeshes: THREE.Mesh[] = [];

  for (let i = 0; i < SLAB_COUNT; i += 1) {
    const baseY = getSlabCenterY(i);
    const tierRoot = new THREE.Group();
    tierRoot.name = `architecture-tier-${i}`;
    tierRoot.position.y = baseY;

    const glassMat = createSmokedGlassMaterial(currentGlassRatio, currentMood, currentTheme);
    const cubeMesh = new THREE.Mesh(tierBoxGeo, glassMat);
    cubeMesh.name = `architecture-tier-cube-${i}`;
    cubeMesh.userData.tierIndex = i;
    cubeMesh.renderOrder = 2;
    tierRoot.add(cubeMesh);
    tierHitMeshes.push(cubeMesh);

    const edgeMat = new THREE.LineBasicMaterial({
      color: STAGE_PALETTE.champagneGold,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    const edgeLines = new THREE.LineSegments(tierEdgeGeo, edgeMat);
    edgeLines.renderOrder = 3;
    tierRoot.add(edgeLines);

    const edgeHaloMat = new THREE.LineBasicMaterial({
      color: STAGE_PALETTE.champagneGoldBright,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const edgeHaloLines = new THREE.LineSegments(tierEdgeGeo, edgeHaloMat);
    edgeHaloLines.scale.setScalar(1.007);
    edgeHaloLines.renderOrder = 3;
    tierRoot.add(edgeHaloLines);

    const innerShellMat = new THREE.MeshBasicMaterial({
      color: STAGE_PALETTE.champagneGoldBright,
      transparent: true,
      opacity: 0.025,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const innerShell = new THREE.Mesh(innerShellGeo, innerShellMat);
    innerShell.renderOrder = 1;
    tierRoot.add(innerShell);

    const baseGlowMat = new THREE.MeshBasicMaterial({
      map: baseGlowTex,
      color: 0xffe4b2,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const baseGlowMesh = new THREE.Mesh(baseGlowPlaneGeo, baseGlowMat);
    baseGlowMesh.rotation.x = -Math.PI * 0.5;
    baseGlowMesh.position.y = -TIER_HEIGHT * 0.5 + 0.015;
    baseGlowMesh.renderOrder = 1;
    tierRoot.add(baseGlowMesh);

    // Emboss the official iNVTRY brand mark onto the TOP surface (+Y face) of Tier 01 for the intro reveal
    if (i === 0) {
      const topLogoW = TIER_WIDTH * 0.88;
      const topLogoH = topLogoW * (394 / 1120);
      const topLogoGeo = new THREE.PlaneGeometry(topLogoW, topLogoH);
      const topLogoMesh = new THREE.Mesh(topLogoGeo, topLogoMat);
      topLogoMesh.name = 'architecture-top-surface-logo';
      topLogoMesh.rotation.x = -Math.PI * 0.5;
      topLogoMesh.position.y = TIER_HEIGHT * 0.5 + 0.008;
      topLogoMesh.renderOrder = 5;
      tierRoot.add(topLogoMesh);
    }

    towerPivot.add(tierRoot);

    const labelOpts = { accent: true, width: 224, height: 52, worldHeight: 0.22 } as const;
    const blueprintLabel = createFloatingLabelSprite(TIER_SPECS[i].label, labelOpts);
    blueprintLabel.sprite.position.set(0, baseY + 0.02, 0.92);
    blueprintLabel.sprite.material.depthTest = false;
    blueprintLabel.sprite.renderOrder = 26;
    blueprintLabel.sprite.material.opacity = 0;
    blueprintLabel.sprite.visible = false;
    labelGroup.add(blueprintLabel.sprite);

    // True 3D horizontally sliding Tech Drawer with mode-specific MVP vs Prod GPU HA icon blades
    const techDrawer = createTierTechDrawer(
      TIER_SPECS[i].label,
      TIER_SPECS[i].mvpTechIcons,
      TIER_SPECS[i].prodTechIcons
    );
    techDrawer.group.position.set(0, baseY + 0.02, 0.68);
    labelGroup.add(techDrawer.group);

    tiers.push({
      root: tierRoot,
      baseY,
      glassMat,
      edgeMat,
      edgeHaloMat,
      innerShellMat,
      baseGlowMat,
      blueprintLabel,
      techDrawer,
    });
  }

  // ── 07 Governance: Cross-Cutting Vertical Control Plane wrapping ALL 6 tiers (01..06) ──
  const govRoot = new THREE.Group();
  govRoot.name = 'architecture-tier-6-governance-frame';
  govRoot.position.y = GOV_MID_Y;

  const govGlassMat = createSmokedGlassMaterial(currentGlassRatio, currentMood, currentTheme);
  const govEdgeMat = new THREE.LineBasicMaterial({
    color: STAGE_PALETTE.champagneGold,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
  });
  const govEdgeHaloMat = new THREE.LineBasicMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0.06,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const govInnerShellMat = new THREE.MeshBasicMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const govBaseGlowMat = new THREE.MeshBasicMaterial({
    map: baseGlowTex,
    color: 0xffe4b2,
    transparent: true,
    opacity: 0.04,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const pillarGeo = new THREE.BoxGeometry(0.044, GOV_FRAME_H, 0.044);
  const pillarEdgeGeo = new THREE.EdgesGeometry(pillarGeo);
  const tickGeo = new THREE.BoxGeometry(0.082, 0.02, 0.082);
  const crownBarXGeo = new THREE.BoxGeometry(GOV_FRAME_HALF_W * 2 + 0.044, 0.032, 0.032);
  const crownBarZGeo = new THREE.BoxGeometry(0.032, 0.032, GOV_FRAME_HALF_D * 2 + 0.044);

  const govCorners: ReadonlyArray<readonly [number, number]> = [
    [-GOV_FRAME_HALF_W, -GOV_FRAME_HALF_D],
    [GOV_FRAME_HALF_W, -GOV_FRAME_HALF_D],
    [GOV_FRAME_HALF_W, GOV_FRAME_HALF_D],
    [-GOV_FRAME_HALF_W, GOV_FRAME_HALF_D],
  ];

  for (const [cx, cz] of govCorners) {
    const pillar = new THREE.Mesh(pillarGeo, govGlassMat);
    pillar.position.set(cx, 0, cz);
    pillar.userData.tierIndex = GOV_TIER_INDEX;
    pillar.renderOrder = 2;
    govRoot.add(pillar);
    tierHitMeshes.push(pillar);

    const pillarLines = new THREE.LineSegments(pillarEdgeGeo, govEdgeMat);
    pillarLines.position.set(cx, 0, cz);
    pillarLines.renderOrder = 3;
    govRoot.add(pillarLines);

    const pillarHalo = new THREE.LineSegments(pillarEdgeGeo, govEdgeHaloMat);
    pillarHalo.position.set(cx, 0, cz);
    pillarHalo.scale.set(1.22, 1.003, 1.22);
    pillarHalo.renderOrder = 3;
    govRoot.add(pillarHalo);

    // Per-tier audit node ticks linking the vertical Governance pillar to each of the 6 operational slabs
    for (let s = 0; s < SLAB_COUNT; s += 1) {
      const tick = new THREE.Mesh(tickGeo, govInnerShellMat);
      tick.position.set(cx, getSlabCenterY(s) - GOV_MID_Y, cz);
      tick.renderOrder = 4;
      govRoot.add(tick);
    }
  }

  // Top Crown & Bottom Base horizontal perimeter bars
  const halfH = GOV_FRAME_H * 0.5;
  for (const yOff of [halfH, -halfH]) {
    for (const zOff of [-GOV_FRAME_HALF_D, GOV_FRAME_HALF_D]) {
      const barX = new THREE.Mesh(crownBarXGeo, govGlassMat);
      barX.position.set(0, yOff, zOff);
      barX.userData.tierIndex = GOV_TIER_INDEX;
      barX.renderOrder = 2;
      govRoot.add(barX);
      tierHitMeshes.push(barX);
    }
    for (const xOff of [-GOV_FRAME_HALF_W, GOV_FRAME_HALF_W]) {
      const barZ = new THREE.Mesh(crownBarZGeo, govGlassMat);
      barZ.position.set(xOff, yOff, 0);
      barZ.userData.tierIndex = GOV_TIER_INDEX;
      barZ.renderOrder = 2;
      govRoot.add(barZ);
      tierHitMeshes.push(barZ);
    }
  }

  // Crisp top & bottom perimeter halo wireframes
  const ringPts = [
    new THREE.Vector3(-GOV_FRAME_HALF_W, 0, -GOV_FRAME_HALF_D),
    new THREE.Vector3(GOV_FRAME_HALF_W, 0, -GOV_FRAME_HALF_D),
    new THREE.Vector3(GOV_FRAME_HALF_W, 0, GOV_FRAME_HALF_D),
    new THREE.Vector3(-GOV_FRAME_HALF_W, 0, GOV_FRAME_HALF_D),
  ];
  const govPerimeterGeo = new THREE.BufferGeometry().setFromPoints(ringPts);

  for (const yOff of [halfH, -halfH]) {
    const ringLine = new THREE.LineLoop(govPerimeterGeo, govEdgeMat);
    ringLine.position.y = yOff;
    ringLine.renderOrder = 3;
    govRoot.add(ringLine);

    const ringHalo = new THREE.LineLoop(govPerimeterGeo, govEdgeHaloMat);
    ringHalo.position.y = yOff;
    ringHalo.scale.setScalar(1.015);
    ringHalo.renderOrder = 3;
    govRoot.add(ringHalo);
  }

  // Gliding Cross-Cutting Audit Scan Ring (sweeps across all 6 tiers when 07 Governance is active)
  const govScanMat = new THREE.LineBasicMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const govScanRing = new THREE.LineLoop(govPerimeterGeo, govScanMat);
  govScanRing.scale.setScalar(0.97);
  govScanRing.renderOrder = 4;
  govRoot.add(govScanRing);

  // Subtle base beacon glow plane at the bottom of the Governance frame
  const govCrownGlowPlane = new THREE.Mesh(baseGlowPlaneGeo, govBaseGlowMat);
  govCrownGlowPlane.rotation.x = -Math.PI * 0.5;
  govCrownGlowPlane.position.y = -halfH;
  govCrownGlowPlane.scale.setScalar(1.38);
  govCrownGlowPlane.renderOrder = 1;
  govRoot.add(govCrownGlowPlane);

  towerPivot.add(govRoot);

  // Floating 07 Governance bottom badge & expanding tech drawer
  const govLabelOpts = { accent: true, width: 224, height: 52, worldHeight: 0.22 } as const;
  const govBlueprintLabel = createFloatingLabelSprite(TIER_SPECS[GOV_TIER_INDEX].label, govLabelOpts);
  govBlueprintLabel.sprite.position.set(0, GOV_BOT_Y + 0.06, 0.92);
  govBlueprintLabel.sprite.material.depthTest = false;
  govBlueprintLabel.sprite.renderOrder = 26;
  govBlueprintLabel.sprite.material.opacity = 0;
  govBlueprintLabel.sprite.visible = false;
  labelGroup.add(govBlueprintLabel.sprite);

  const govTechDrawer = createTierTechDrawer(
    TIER_SPECS[GOV_TIER_INDEX].label,
    TIER_SPECS[GOV_TIER_INDEX].mvpTechIcons,
    TIER_SPECS[GOV_TIER_INDEX].prodTechIcons
  );
  govTechDrawer.group.position.set(0, GOV_BOT_Y + 0.06, 0.68);
  labelGroup.add(govTechDrawer.group);

  tiers.push({
    root: govRoot,
    baseY: GOV_BOT_Y + 0.06,
    glassMat: govGlassMat,
    edgeMat: govEdgeMat,
    edgeHaloMat: govEdgeHaloMat,
    innerShellMat: govInnerShellMat,
    baseGlowMat: govBaseGlowMat,
    blueprintLabel: govBlueprintLabel,
    techDrawer: govTechDrawer,
  });

  // Real-tier floating callout labels for Google APIs (01/04/06) & Privacy Shields (01/03/05/07)
  const overlayCalloutOpts = { accent: true, width: 296, height: 54, worldHeight: 0.23 } as const;
  const mapsApiLabels: FloatingLabelHandle[] = MAPS_API_SPECS.map((spec) => {
    const handle = createFloatingLabelSprite(spec.label, overlayCalloutOpts);
    handle.sprite.position.set(0, getTierCenterY(spec.tierIndex) + 0.02, 0.98);
    handle.sprite.material.depthTest = false;
    handle.sprite.renderOrder = 27;
    handle.sprite.material.opacity = 0;
    handle.sprite.visible = false;
    labelGroup.add(handle.sprite);
    return handle;
  });

  const privacyShieldLabels: FloatingLabelHandle[] = PRIVACY_SHIELD_ORDER.map((key) => {
    const spec = PRIVACY_SHIELD_SPECS[key];
    const handle = createFloatingLabelSprite(spec.label, overlayCalloutOpts);
    handle.sprite.position.set(0, getTierCenterY(spec.tierIndex) + 0.02, 1.02);
    handle.sprite.material.depthTest = false;
    handle.sprite.renderOrder = 28;
    handle.sprite.material.opacity = 0;
    handle.sprite.visible = false;
    labelGroup.add(handle.sprite);
    return handle;
  });

  const floorGrid = createArchitecturalFloorGrid();
  towerPivot.add(floorGrid.group);

  const sharedGpuAccentGeos = createSharedGpuAccentGeometries();
  const gpuAccents = GPU_ACCENT_TIERS.map((tierIdx) => {
    const accent = createGpuComputeRimAccent(tierIdx, sharedGpuAccentGeos);
    towerPivot.add(accent.group);
    return accent;
  });

  const dataStream = createVerticalParticleStream(particleGlowTex);
  towerPivot.add(dataStream.group);

  const privacyOverlay = createPrivacyVaultShield();
  towerPivot.add(privacyOverlay.group);

  const weatherOverlay = createWeatherOverlay(solarGlowTex);
  group.add(weatherOverlay.group);

  const marbleLight = new THREE.PointLight(0xffe0a6, 0, 5.2, 1.85);
  marbleLight.position.set(0, getTierCenterY(3), 0);
  group.add(marbleLight);

  const towerRimLight = new THREE.PointLight(0xd6b889, 0, 8.5, 1.6);
  towerRimLight.position.set(-2.4, 1.6, 2.2);
  group.add(towerRimLight);

  /* ------------------------------------------------------------------------
   * Palette, Glass & Sub-System Update Helpers
   * ------------------------------------------------------------------------ */

  const applyTierGlassGlow = (tier: TierRuntime, weight: number): void => {
    const isDark = currentTheme === 'dark';
    const isAurora = currentMood === 'aurora';
    const baseHex = pickTone(isAurora, isDark, 0x1f180e, 0xf5efe6, 0x162238, 0xdfe8f6);
    const activeHex = pickTone(isAurora, isDark, 0xd69e4a, 0xc99a52, 0x5c96e0, 0x6f96cc);
    const baseIntensity = isDark
      ? THREE.MathUtils.lerp(0.18, 0.06, currentGlassRatio)
      : THREE.MathUtils.lerp(0.14, 0.04, currentGlassRatio);

    tmpColorA.setHex(baseHex);
    tmpColorB.setHex(activeHex);
    tier.glassMat.emissive.copy(tmpColorA).lerp(tmpColorB, weight);
    tier.glassMat.emissiveIntensity =
      baseIntensity + weight * (isDark ? 0.34 : 0.2) + weight * prodBlend * 0.1;
  };

  const syncVisualPalette = (): void => {
    const isDark = currentTheme === 'dark';
    const isAurora = currentMood === 'aurora';
    const glowBlend = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;

    const warmCore = pickTone(isAurora, isDark, 0xffdca0, 0xb88940, 0xa8cef8, 0x628bc4);
    const edgeHaloHex = pickTone(isAurora, isDark, 0xffe9be, 0x9c7230, 0xd2e6ff, 0x5c82b8);

    for (let i = 0; i < TIER_COUNT; i += 1) {
      const tier = tiers[i];
      applySmokedGlassState(tier.glassMat, currentGlassRatio, currentMood, currentTheme);
      applyTierGlassGlow(tier, activeWeights[i]);
      setMaterialBlending(tier.edgeHaloMat, glowBlend);
      setMaterialBlending(tier.innerShellMat, glowBlend);
      setMaterialBlending(tier.baseGlowMat, glowBlend);
      tier.innerShellMat.color.setHex(warmCore);
      tier.baseGlowMat.color.setHex(warmCore);
      tier.edgeHaloMat.color.setHex(edgeHaloHex);
      tier.blueprintLabel.setHighlight(true, currentTheme);
      tier.techDrawer.setModeAndTheme(currentArchMode, currentTheme);
    }

    for (const label of mapsApiLabels) {
      label.setHighlight(true, currentTheme);
    }
    for (const label of privacyShieldLabels) {
      label.setHighlight(true, currentTheme);
    }

    topLogoMat.map = isDark ? topLogoDarkTex : topLogoLightTex;
    topLogoMat.needsUpdate = true;

    govScanMat.color.setHex(edgeHaloHex);
    setMaterialBlending(govScanMat, glowBlend);

    (floorGrid.gridMat.uniforms.uColor.value as THREE.Color).setHex(
      pickTone(isAurora, isDark, STAGE_PALETTE.champagneGold, 0x8a7048, 0x7ea2d4, 0x627896)
    );
    floorGrid.gridMat.uniforms.uOpacity.value = isDark ? 0.24 : 0.3;

    const accentGold = pickTone(isAurora, isDark, STAGE_PALETTE.champagneGoldBright, STAGE_PALETTE.champagneGoldLightTheme, 0xa8c9f5, 0x5d82b4);
    for (const rMat of floorGrid.rippleRingMats) {
      rMat.color.setHex(accentGold);
      setMaterialBlending(rMat, glowBlend);
    }

    setMaterialBlending(dataStream.pointsMat, glowBlend);
    setMaterialBlending(dataStream.conduitMat, glowBlend);
    dataStream.conduitMat.color.setHex(accentGold);

    const railHex = pickTone(isAurora, isDark, 0xffe4b0, 0x9a7132, 0xc2ddff, 0x587fb5);
    const ledHex = pickTone(isAurora, isDark, 0xfff2d2, 0x8f6624, 0xe4f1ff, 0x4b74b0);
    for (const accent of gpuAccents) {
      applyGoldModeState(accent.bracketMat, currentMood, currentTheme, 0.52);
      accent.railMat.color.setHex(railHex);
      accent.ledMat.color.setHex(ledHex);
      setMaterialBlending(accent.railMat, glowBlend);
      setMaterialBlending(accent.ledMat, glowBlend);
    }

    // Security Vault Shield palette (monochrome gold / cool aurora firewall barrier)
    const shieldWallHex = pickTone(isAurora, isDark, STAGE_PALETTE.champagneGold, 0x9b7537, 0x6ba6f0, 0x486ea8);
    const shieldEdgeHex = pickTone(isAurora, isDark, 0xffebc2, 0x876021, 0xd4e8ff, 0x3b639e);
    const shieldNodeHex = pickTone(isAurora, isDark, 0xfff4dc, 0x9c722e, 0xe6f2ff, 0x4b74b0);
    privacyOverlay.hexWallMat.color.setHex(shieldWallHex);
    setMaterialBlending(privacyOverlay.hexWallMat, glowBlend);
    privacyOverlay.hexEdgeMat.color.setHex(shieldEdgeHex);
    setMaterialBlending(privacyOverlay.hexEdgeMat, glowBlend);
    privacyOverlay.collarMat.color.setHex(shieldNodeHex);
    setMaterialBlending(privacyOverlay.collarMat, glowBlend);
    privacyOverlay.lockNodeMat.color.setHex(shieldNodeHex);
    setMaterialBlending(privacyOverlay.lockNodeMat, glowBlend);
    privacyOverlay.scanMat.color.setHex(shieldNodeHex);
    setMaterialBlending(privacyOverlay.scanMat, glowBlend);
    privacyOverlay.scanBandMat.color.setHex(shieldEdgeHex);
    setMaterialBlending(privacyOverlay.scanBandMat, glowBlend);
    applyGoldModeState(privacyOverlay.strutMat, currentMood, currentTheme, 0.48);
    applyGoldModeState(privacyOverlay.clampMat, currentMood, currentTheme, 0.56);

    weatherOverlay.rain.mat.color.setHex(pickTone(isAurora, isDark, 0xd8e5f6, 0x5c728c, 0xcde4ff, 0x4e709e));
    setMaterialBlending(weatherOverlay.rain.mat, glowBlend);
    weatherOverlay.rain.splashMat.color.setHex(isDark ? 0xddeaff : 0x5a7394);
    setMaterialBlending(weatherOverlay.rain.splashMat, glowBlend);

    const windHex = pickTone(isAurora, isDark, STAGE_PALETTE.champagneGoldBright, 0xa37a38, 0xbce0ff, 0x567fb5);
    for (const ribbon of weatherOverlay.windRibbons) {
      ribbon.mat.color.setHex(windHex);
      setMaterialBlending(ribbon.mat, glowBlend);
    }

    weatherOverlay.solarLight.color.setHex(isAurora ? 0xeaf4ff : 0xffe6b6);
    weatherOverlay.solarCoreMat.color.setHex(pickTone(isAurora, isDark, 0xffe6b4, 0xdcb46c, 0xdbeeff, 0x9cbfe8));
    weatherOverlay.solarHaloMat.color.setHex(pickTone(isAurora, isDark, 0xffe2a8, 0xb58a42, 0xc2defa, 0x6f96c9));
    setMaterialBlending(weatherOverlay.solarCoreMat, glowBlend);
    setMaterialBlending(weatherOverlay.solarHaloMat, glowBlend);

    marbleLight.color.setHex(isAurora ? 0xaad0ff : 0xffdfa2);
    towerRimLight.color.setHex(isAurora ? 0x8eb8f0 : STAGE_PALETTE.champagneGold);
  };

  const updateParticleStream = (dt: number, elapsed: number, activeTierY: number, reducedMotion: boolean): void => {
    const isDark = currentTheme === 'dark';
    const isAurora = currentMood === 'aurora';
    const speedMult = THREE.MathUtils.lerp(1.0, 2.2, prodBlend);
    const stepDt = reducedMotion ? 0 : dt;
    const pos = dataStream.positions;
    const col = dataStream.colors;

    tmpColorA.setHex(pickTone(isAurora, isDark, STAGE_PALETTE.champagneGold, 0x9c7432, 0xa6caf8, 0x4f74ab));
    tmpColorB.setHex(pickTone(isAurora, isDark, 0xfff0c4, 0xc48b2b, 0xeaf4ff, 0x2f5a99));

    for (let i = 0; i < STREAM_PARTICLE_COUNT; i += 1) {
      const idx3 = i * 3;
      let y = pos[idx3 + 1] + dataStream.speeds[i] * speedMult * stepDt;
      if (y > STREAM_Y_MAX) y = STREAM_Y_MIN + ((y - STREAM_Y_MIN) % STREAM_SPAN);

      const angle = dataStream.angles[i] + (reducedMotion ? 0 : elapsed * (dataStream.isCore[i] === 1 ? 0.22 : 0.14));
      const radius = dataStream.radii[i] * (1 - prodBlend * 0.08 * dataStream.isCore[i]);
      pos[idx3] = Math.cos(angle) * radius;
      pos[idx3 + 1] = y;
      pos[idx3 + 2] = Math.sin(angle) * radius;

      const edgeFade =
        THREE.MathUtils.smoothstep(y, STREAM_Y_MIN, STREAM_Y_MIN + 0.55) *
        (1 - THREE.MathUtils.smoothstep(y, STREAM_Y_MAX - 0.55, STREAM_Y_MAX));
      const coreBoost = Math.max(0, 1 - Math.abs(y - activeTierY) / 0.65);
      const twinkle = reducedMotion ? 0.85 : 0.72 + 0.28 * Math.sin(elapsed * 4.2 + dataStream.phases[i]);
      const warmth = THREE.MathUtils.clamp(coreBoost * 0.7 + prodBlend * 0.42, 0, 1);

      tmpColorMix.copy(tmpColorA).lerp(tmpColorB, warmth);
      const lum = edgeFade * twinkle * (0.62 + coreBoost * 0.45 + prodBlend * 0.28);
      col[idx3] = tmpColorMix.r * lum;
      col[idx3 + 1] = tmpColorMix.g * lum;
      col[idx3 + 2] = tmpColorMix.b * lum;
    }

    (dataStream.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (dataStream.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    dataStream.pointsMat.size = THREE.MathUtils.lerp(0.084, 0.108, prodBlend);
    dataStream.pointsMat.opacity = THREE.MathUtils.lerp(isDark ? 0.86 : 0.76, isDark ? 0.98 : 0.92, prodBlend);
    dataStream.conduitMat.opacity = (isDark ? 0.028 : 0.018) + prodBlend * (isDark ? 0.1 : 0.055);
  };

  const updateWeatherEffects = (dt: number, elapsed: number, reducedMotion: boolean): void => {
    const isDark = currentTheme === 'dark';

    const showRain = rainBlend > 0.008;
    weatherOverlay.rain.group.visible = showRain;
    if (showRain) {
      const rPos = weatherOverlay.rain.positions;
      const rainDt = reducedMotion ? 0 : dt;
      for (let i = 0; i < RAIN_STREAK_COUNT; i += 1) {
        let y = weatherOverlay.rain.headY[i] - weatherOverlay.rain.speeds[i] * rainDt;
        let x = weatherOverlay.rain.headX[i] - weatherOverlay.rain.speeds[i] * 0.28 * rainDt;
        if (y < -1.95) {
          y += 4.35;
          x += 4.35 * 0.28;
        }
        weatherOverlay.rain.headY[i] = y;
        weatherOverlay.rain.headX[i] = x;

        const len = weatherOverlay.rain.lengths[i];
        const b = i * 6;
        rPos[b] = x;
        rPos[b + 1] = y;
        rPos[b + 2] = weatherOverlay.rain.headZ[i];
        rPos[b + 3] = x - len * 0.28;
        rPos[b + 4] = y - len;
        rPos[b + 5] = weatherOverlay.rain.headZ[i] - len * 0.08;
      }
      (weatherOverlay.rain.lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      weatherOverlay.rain.mat.opacity = rainBlend * (isDark ? 0.56 : 0.48);

      const dropPhase = reducedMotion ? 0.45 : (elapsed * 1.35) % 1;
      weatherOverlay.rain.splashRing.scale.setScalar(0.55 + dropPhase * 1.4);
      weatherOverlay.rain.splashMat.opacity = rainBlend * Math.sin(dropPhase * Math.PI) * (isDark ? 0.48 : 0.36);
    }

    const showWind = windBlend > 0.008;
    weatherOverlay.windGroup.visible = showWind;
    if (showWind) {
      for (const ribbon of weatherOverlay.windRibbons) {
        if (!reducedMotion) {
          ribbon.mesh.rotation.y += ribbon.speed * dt;
          ribbon.mesh.position.y = ribbon.baseY + Math.sin(elapsed * 2.1 + ribbon.phase) * 0.09;
        }
        const shimmer = reducedMotion ? 0.85 : 0.68 + 0.32 * Math.sin(elapsed * 3.1 + ribbon.phase);
        ribbon.mat.opacity = windBlend * shimmer * (isDark ? 0.62 : 0.52);
      }
    }

    const showSunny = sunnyBlend > 0.008;
    weatherOverlay.sunnyGroup.visible = showSunny;
    if (showSunny) {
      const sunPulse = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(elapsed * 1.7);
      weatherOverlay.solarLight.intensity = sunnyBlend * ((isDark ? 3.8 : 2.3) + sunPulse * 0.75);
      weatherOverlay.solarCoreMat.opacity = sunnyBlend * ((isDark ? 0.74 : 0.44) + sunPulse * 0.14);
      const s = 2.35 * (0.94 + sunPulse * 0.16);
      weatherOverlay.solarCoreSprite.scale.set(s, s, 1);
      weatherOverlay.solarHaloMat.opacity = sunnyBlend * (isDark ? 0.34 : 0.24);
      weatherOverlay.solarHaloRing.scale.setScalar(1.0 + sunPulse * 0.22);
      if (!reducedMotion) weatherOverlay.solarHaloRing.rotation.z = elapsed * 0.35;
    } else {
      weatherOverlay.solarLight.intensity = 0;
    }
  };

  const applyFrame = (dt: number, elapsed: number, ctx: StageContext, instant: boolean): void => {
    lastReducedMotion = ctx.reducedMotion;
    const snap = instant || ctx.reducedMotion;
    const smooth = snap ? 1 : 1 - Math.exp(-7.5 * dt);
    const fast = snap ? 1 : 1 - Math.exp(-11 * dt);
    const isDark = currentTheme === 'dark';
    const isAurora = currentMood === 'aurora';

    const { architectureSubtab, architectureMode, weatherMood } = ctx.interaction;
    const activeIdx = resolveActiveTierIndex(ctx.interaction);

    // Sync MVP vs Prod GPU tech blades immediately on mode toggle & replay horizontal unfurl
    const nextArchMode: ArchStackMode = architectureMode === 'prod' ? 'prod' : 'mvp';
    if (nextArchMode !== currentArchMode) {
      currentArchMode = nextArchMode;
      for (let i = 0; i < TIER_COUNT; i += 1) {
        tiers[i].techDrawer.setModeAndTheme(currentArchMode, currentTheme);
      }
      drawerUnfurls[activeIdx] = snap ? 1 : 0;
      tapPulse = 0.85;
    }

    if (activeIdx !== lastSelectedTierIdx) {
      lastSelectedTierIdx = activeIdx;
      drawerUnfurls[activeIdx] = snap ? 1 : 0;
    }

    // 2-Phase Intro Choreography:
    //  Phase 1 (0 -> INTRO_HOLD_TOP): Pitch forward so Tier 01's top face + iNVTRY logo face viewer
    //  Phase 2 (INTRO_HOLD_TOP -> INTRO_PIVOT_END): Pivot sideways & fan all 6 slabs apart
    if (ctx.reducedMotion) {
      introClock = INTRO_PIVOT_END;
    } else if (!instant && introClock < INTRO_PIVOT_END) {
      introClock = Math.min(INTRO_PIVOT_END, introClock + dt);
    }
    const rawPivotT = THREE.MathUtils.clamp(
      (introClock - INTRO_HOLD_TOP) / (INTRO_PIVOT_END - INTRO_HOLD_TOP),
      0,
      1
    );
    const pivotEase =
      rawPivotT < 0.5
        ? 4 * rawPivotT * rawPivotT * rawPivotT
        : 1 - Math.pow(-2 * rawPivotT + 2, 3) / 2;
    const layerSpread = THREE.MathUtils.lerp(0.2, 1.0, pivotEase);
    const drawerIntroGate = THREE.MathUtils.smoothstep(pivotEase, 0.62, 1.0);

    tapPulse = instant ? tapPulse : Math.max(0, tapPulse - dt * 2.4);
    currentYaw = THREE.MathUtils.lerp(currentYaw, targetYaw, fast);

    const idleYawSway = ctx.reducedMotion ? 0 : Math.sin(elapsed * 0.38) * 0.04 * pivotEase;
    towerPivot.rotation.x = THREE.MathUtils.lerp(INTRO_TOP_PITCH, 0, pivotEase);
    towerPivot.rotation.y =
      !userDraggedDuringIntro && rawPivotT < 1
        ? THREE.MathUtils.lerp(0.0, DEFAULT_TOWER_YAW, pivotEase)
        : currentYaw + idleYawSway;

    // Bright top-surface iNVTRY logo during Phase 1 -> refined glass engraving once pivoted sideways
    topLogoMat.opacity = THREE.MathUtils.lerp(0.98, isDark ? 0.52 : 0.62, pivotEase);

    const aspect = ctx.camera instanceof THREE.PerspectiveCamera ? ctx.camera.aspect : 1.5;
    const isNarrowSplit = aspect < 0.85;

    // Update activeWeights first so we can compute exact collision-free vertical accordion layout
    const govActiveWeight = THREE.MathUtils.lerp(
      activeWeights[GOV_TIER_INDEX],
      activeIdx === GOV_TIER_INDEX ? 1 : hoveredTierIndex === GOV_TIER_INDEX ? 0.35 : 0,
      smooth
    );
    activeWeights[GOV_TIER_INDEX] = govActiveWeight;

    const slabGap = TIER_SPACING - TIER_HEIGHT;
    const activeHeightBoost = isNarrowSplit ? 1.82 : 2.55; // Slab stretches to ~2.82x (mobile) / ~3.55x (desktop) tall!
    const heightExpandFactor = (1 - mapsBlend) * (1 - privacyBlend) * drawerIntroGate;

    let totalStackH = (SLAB_COUNT - 1) * slabGap;
    for (let i = 0; i < SLAB_COUNT; i += 1) {
      const isSelected = i === activeIdx;
      const isHovered = hoveredTierIndex === i;
      activeWeights[i] = THREE.MathUtils.lerp(
        activeWeights[i],
        isSelected ? 1 : isHovered ? 0.35 : 0,
        smooth
      );
      const expandW = isSelected ? activeWeights[i] : Math.max(0, activeWeights[i] - 0.35) / 0.65;
      const scY = 1 + expandW * heightExpandFactor * activeHeightBoost;
      slabScalesY[i] = scY;
      totalStackH += TIER_HEIGHT * scY;
    }

    let cursorY = TOWER_CENTER_Y + totalStackH * 0.5;
    for (let i = 0; i < SLAB_COUNT; i += 1) {
      const h = TIER_HEIGHT * slabScalesY[i];
      slabCentersY[i] = cursorY - h * 0.5;
      cursorY -= h + slabGap;
    }

    const dynamicGovFrameH = totalStackH + 0.36;
    dynamicGovBotY = TOWER_CENTER_Y - dynamicGovFrameH * 0.5;
    const govDrawerOffset = isNarrowSplit ? -0.6 : -0.76;
    const activeDynamicY = activeIdx < SLAB_COUNT ? slabCentersY[activeIdx] : dynamicGovBotY;

    // Center monolith cleanly during top-logo showcase, then glide vertically to frame expanded active tier
    // When 07 Governance is active, lift the tower cleanly so the entire 3D cage sits unobstructed above the bottom cards
    const govLiftY = isNarrowSplit ? 0.58 : 0.54;
    const settledTowerOffsetY =
      activeIdx === GOV_TIER_INDEX
        ? govLiftY * (1 - privacyBlend * 0.65)
        : THREE.MathUtils.clamp(-activeDynamicY * 0.48, -0.78, 0.78);
    const targetTowerOffsetY = THREE.MathUtils.lerp(0.08, settledTowerOffsetY, pivotEase);
    towerOffsetY = instant
      ? targetTowerOffsetY
      : THREE.MathUtils.lerp(towerOffsetY, targetTowerOffsetY, smooth);
    // Slightly scale tower on desktop when 07 Governance is selected so both the full 3D cage and bottom drawer clear top/bottom docks
    const targetTowerScale =
      activeIdx === GOV_TIER_INDEX && !isNarrowSplit ? THREE.MathUtils.lerp(1, 0.82, pivotEase) : 1;
    const nextTowerScale = instant
      ? targetTowerScale
      : THREE.MathUtils.lerp(towerPivot.scale.x, targetTowerScale, smooth);
    towerPivot.scale.setScalar(nextTowerScale);
    towerPivot.position.y = towerOffsetY;
    labelGroup.position.y = towerOffsetY;

    const targetMaps = architectureSubtab === 'maps' ? 1 : 0;
    prodBlend = THREE.MathUtils.lerp(prodBlend, architectureMode === 'prod' ? 1 : 0, smooth);
    privacyBlend = THREE.MathUtils.lerp(privacyBlend, architectureSubtab === 'privacy' ? 1 : 0, smooth);
    mapsBlend = THREE.MathUtils.lerp(mapsBlend, targetMaps, smooth);
    rainBlend = THREE.MathUtils.lerp(rainBlend, targetMaps * (weatherMood === 'rain' ? 1 : 0), smooth);
    windBlend = THREE.MathUtils.lerp(windBlend, targetMaps * (weatherMood === 'wind' ? 1 : 0), smooth);
    sunnyBlend = THREE.MathUtils.lerp(sunnyBlend, targetMaps * (weatherMood === 'sunny' ? 1 : 0), smooth);

    const targetLightY = isStageEntered && !instant ? ctx.marbleMesh.position.y : activeDynamicY + towerOffsetY;
    marbleLight.position.set(0, THREE.MathUtils.lerp(marbleLight.position.y, targetLightY, fast), 0);
    const pulseWave = ctx.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(elapsed * 2.2);
    marbleLight.intensity = (isDark ? 2.85 : 1.75) + prodBlend * 0.95 + tapPulse * 0.75 + pulseWave * 0.3;
    towerRimLight.intensity = (isDark ? 0.82 : 0.48) + sunnyBlend * 0.4;

    const baseEdgeHex = pickTone(isAurora, isDark, STAGE_PALETTE.champagneGold, STAGE_PALETTE.champagneGoldLightTheme, 0x9db8df, 0x6c84a8);
    const activeEdgeHex = pickTone(isAurora, isDark, 0xfff0cc, 0x8f6220, 0xe8f3ff, 0x3b639e);
    const innerPulse = 0.92 + pulseWave * 0.16;

    for (let i = 0; i < TIER_COUNT; i += 1) {
      const tier = tiers[i];
      const isGov = i === GOV_TIER_INDEX;
      const isSelected = i === activeIdx;
      const isHovered = hoveredTierIndex === i;
      const w = activeWeights[i];
      const auditHaloBoost = !isGov ? govActiveWeight * 0.28 : 0;
      const effectiveW = Math.min(1, w + auditHaloBoost) * pivotEase;

      // Fan the 6 slabs apart from the compact top-logo monolith into their dynamic accordion Y centers
      // Anchor 07 Governance cleanly underneath the bottom of the 3D Governance frame so the 3D cage is never obscured
      const dynamicCenterY = isGov
        ? (dynamicGovBotY + govDrawerOffset) * nextTowerScale
        : slabCentersY[i] * nextTowerScale;
      if (!isGov) {
        const compactY = TOWER_CENTER_Y + (2.5 - i) * 0.085;
        tier.root.position.y = THREE.MathUtils.lerp(compactY, slabCentersY[i], layerSpread);
      }

      const scBase = isGov
        ? 1 + w * 0.012 + (isSelected ? tapPulse * 0.01 : 0)
        : 1 + w * 0.02 + (isSelected ? tapPulse * 0.014 : 0);
      // Selected operational 3D prism expands BOTH vertically (to frame its cards) and horizontally
      const scX = isGov
        ? scBase
        : scBase + w * heightExpandFactor * (isNarrowSplit ? 0.16 : 0.42);
      const govScaleY = (dynamicGovFrameH / GOV_FRAME_H) * (1 + w * 0.006);
      const scY = isGov
        ? THREE.MathUtils.lerp(0.24, govScaleY, layerSpread)
        : slabScalesY[i];
      tier.root.scale.set(scX, scY, scBase);
      applyTierGlassGlow(tier, isGov ? effectiveW : i === 0 ? Math.max(effectiveW, (1 - pivotEase) * 0.55) : effectiveW);

      tmpColorA.setHex(baseEdgeHex);
      tmpColorB.setHex(activeEdgeHex);
      tier.edgeMat.color.copy(tmpColorA).lerp(tmpColorB, effectiveW);
      const govIntroFade = isGov ? THREE.MathUtils.smoothstep(pivotEase, 0.25, 0.9) : 1;
      tier.edgeMat.opacity = isGov
        ? ((isDark ? 0.32 : 0.42) + w * (isDark ? 0.64 : 0.5)) * govIntroFade
        : (isDark ? 0.42 : 0.56) + effectiveW * (isDark ? 0.56 : 0.4);
      tier.edgeHaloMat.opacity = isGov
        ? ((isDark ? 0.06 : 0.04) + w * (isDark ? 0.62 : 0.34) * (1 + prodBlend * 0.2 + (isSelected ? tapPulse * 0.35 : 0))) * govIntroFade
        : effectiveW * (isDark ? 0.46 : 0.22) * (1 + prodBlend * 0.25 + (isSelected ? tapPulse * 0.35 : 0));
      tier.innerShellMat.opacity = isGov
        ? ((isDark ? 0.14 : 0.12) + w * (isDark ? 0.72 : 0.52) * innerPulse) * govIntroFade
        : (isDark ? 0.02 : 0.015) + effectiveW * (isDark ? 0.24 : 0.14) * innerPulse * (1 + prodBlend * 0.22);
      tier.baseGlowMat.opacity = isGov
        ? ((isDark ? 0.03 : 0.02) + w * (isDark ? 0.38 : 0.22) * innerPulse) * govIntroFade
        : (isDark ? 0.05 : 0.03) + w * (isDark ? 0.46 : 0.24) * innerPulse * (1 + prodBlend * 0.18);

      // Hover shows compact title pill; selected blueprint tier slides open its horizontal Tech Drawer
      const showCompactBlueprintLabel = !isSelected && isHovered && drawerIntroGate > 0.5;
      const blueprintLabelTarget = showCompactBlueprintLabel ? 0.8 : 0;
      tier.blueprintLabel.sprite.position.y = dynamicCenterY + 0.02;
      tier.blueprintLabel.sprite.material.opacity = THREE.MathUtils.lerp(
        tier.blueprintLabel.sprite.material.opacity,
        blueprintLabelTarget * (1 - mapsBlend) * (1 - privacyBlend),
        fast
      );
      tier.blueprintLabel.sprite.visible = tier.blueprintLabel.sprite.material.opacity > 0.015;

      // True 3D horizontally sliding Tech Drawer centered INSIDE the tall expanded glass prism (blueprint mode only)
      const drawerTargetOp = isSelected
        ? (1 - mapsBlend) * (1 - privacyBlend) * drawerIntroGate
        : 0;
      if (isSelected && drawerTargetOp > 0.02) {
        drawerOpacities[i] = snap
          ? drawerTargetOp
          : THREE.MathUtils.lerp(drawerOpacities[i], drawerTargetOp, fast);
        drawerUnfurls[i] = snap
          ? 1
          : Math.min(1, drawerUnfurls[i] + dt * 2.35);
      } else {
        drawerOpacities[i] = snap ? 0 : Math.max(0, drawerOpacities[i] - dt * 16);
        if (drawerOpacities[i] <= 0.015) {
          drawerUnfurls[i] = 0;
        }
      }

      const bob = ctx.reducedMotion ? 0 : Math.sin(elapsed * 1.9 + i) * 0.014;
      tier.techDrawer.group.position.set(
        isNarrowSplit ? 0.05 : 0,
        dynamicCenterY + bob,
        isNarrowSplit ? 0.58 : 0.76
      );
      tier.techDrawer.group.scale.setScalar(isGov && !isNarrowSplit ? 0.8 : 1);
      tier.techDrawer.setUnfurl(
        drawerUnfurls[i],
        drawerOpacities[i],
        isNarrowSplit,
        aspect,
        isSelected ? ctx.interaction.architectureTechIndex : null
      );
    }

    // Dynamic Google API callouts anchored to each API's REAL architectural tier (01 / 04 / 06)
    const activeApiIdx = THREE.MathUtils.clamp(
      Math.round(ctx.interaction.googleApiIndex),
      0,
      MAPS_API_SPECS.length - 1
    );
    for (let k = 0; k < mapsApiLabels.length; k += 1) {
      const label = mapsApiLabels[k];
      const spec = MAPS_API_SPECS[k];
      const targetTierY =
        (spec.tierIndex < SLAB_COUNT ? slabCentersY[spec.tierIndex] : dynamicGovBotY) * nextTowerScale;
      label.sprite.position.set(0, targetTierY + 0.02, 0.98);
      const targetOp = k === activeApiIdx ? 0.96 * mapsBlend * drawerIntroGate : 0;
      label.sprite.material.opacity = snap
        ? targetOp
        : THREE.MathUtils.lerp(label.sprite.material.opacity, targetOp, fast);
      label.sprite.visible = label.sprite.material.opacity > 0.015;
    }

    // Dynamic Privacy Shield callouts anchored to each defense's REAL security tier (01 / 03 / 05 / 07)
    const activePrivacySpec = PRIVACY_SHIELD_SPECS[ctx.interaction.privacyShieldId] ?? PRIVACY_SHIELD_SPECS.biometric;
    for (let k = 0; k < privacyShieldLabels.length; k += 1) {
      const label = privacyShieldLabels[k];
      const spec = PRIVACY_SHIELD_SPECS[PRIVACY_SHIELD_ORDER[k]];
      const targetTierY =
        (spec.tierIndex < SLAB_COUNT ? slabCentersY[spec.tierIndex] : TOWER_CENTER_Y) * nextTowerScale;
      label.sprite.position.set(0, targetTierY + 0.04, 1.04);
      const targetOp = k === activePrivacySpec.index ? 0.98 * privacyBlend * drawerIntroGate : 0;
      label.sprite.material.opacity = snap
        ? targetOp
        : THREE.MathUtils.lerp(label.sprite.material.opacity, targetOp, fast);
      label.sprite.visible = label.sprite.material.opacity > 0.015;
    }

    // Animate the cross-cutting Governance Audit Scan Ring sweeping vertically across all 6 tiers
    const scanVisible = govActiveWeight > 0.04 && pivotEase > 0.6;
    govScanRing.visible = scanVisible;
    if (scanVisible) {
      const scanWave = ctx.reducedMotion ? 0 : Math.sin(elapsed * 1.45);
      govScanRing.position.y = scanWave * (GOV_FRAME_H * 0.44);
      govScanMat.opacity =
        govActiveWeight *
        pivotEase *
        (isDark ? 0.68 : 0.44) *
        (0.75 + 0.25 * Math.abs(Math.cos(elapsed * 1.45)));
    }

    for (let i = 0; i < floorGrid.rippleMeshes.length; i += 1) {
      const wave = ctx.reducedMotion ? 0.5 : (elapsed * 0.45 + i * 0.33) % 1;
      floorGrid.rippleMeshes[i].scale.setScalar(0.92 + wave * 0.26);
      floorGrid.rippleRingMats[i].opacity =
        Math.sin(wave * Math.PI) * (isDark ? 0.24 : 0.18) * (1 + prodBlend * 0.35) * pivotEase;
    }

    updateParticleStream(dt, elapsed, activeDynamicY, ctx.reducedMotion);

    const showGpu = prodBlend > 0.008 && pivotEase > 0.45;
    for (let i = 0; i < gpuAccents.length; i += 1) {
      const accent = gpuAccents[i];
      accent.group.visible = showGpu;
      if (!showGpu) continue;
      const accentTierIdx = GPU_ACCENT_TIERS[i];
      const accentY = accentTierIdx < SLAB_COUNT ? slabCentersY[accentTierIdx] : accent.baseY;
      accent.group.position.y = accentY + (ctx.reducedMotion ? 0 : Math.sin(elapsed * 2.6 + i * 1.4) * 0.025);
      accent.group.scale.setScalar(THREE.MathUtils.lerp(0.94, 1.0, prodBlend));
      accent.bracketMat.opacity = prodBlend * pivotEase * (isDark ? 0.92 : 0.88);
      accent.railMat.opacity = prodBlend * pivotEase * (isDark ? 0.56 : 0.44);
      const ledPulse = ctx.reducedMotion ? 0.85 : 0.65 + 0.35 * Math.sin(elapsed * 5.2 + i * 2.1);
      accent.ledMat.opacity = prodBlend * pivotEase * ledPulse * (isDark ? 0.95 : 0.82);
    }

    // Tier-Locked Hexagonal Cryptographic Security Vault Barrier (replaces circular orbit rings)
    const showPrivacy = privacyBlend > 0.006 && pivotEase > 0.5;
    privacyOverlay.group.visible = showPrivacy;
    if (showPrivacy) {
      const isFullStackShield = activePrivacySpec.tierIndex === GOV_TIER_INDEX;
      const targetShieldY = isFullStackShield
        ? TOWER_CENTER_Y
        : slabCentersY[activePrivacySpec.tierIndex];
      const targetShieldH = isFullStackShield
        ? dynamicGovFrameH + 0.16
        : TIER_HEIGHT * slabScalesY[activePrivacySpec.tierIndex] + 0.44;
      const targetShieldRadiusScale = isFullStackShield ? 1.12 : 1.0;
      const lockPulse = 1 + tapPulse * 0.055;

      privacyOverlay.group.position.y = snap
        ? targetShieldY
        : THREE.MathUtils.lerp(privacyOverlay.group.position.y, targetShieldY, fast);
      const nextCageH = snap
        ? targetShieldH
        : THREE.MathUtils.lerp(privacyOverlay.cageGroup.scale.y || targetShieldH, targetShieldH, fast);
      const nextCageR = snap
        ? targetShieldRadiusScale
        : THREE.MathUtils.lerp(
            privacyOverlay.cageGroup.scale.x || targetShieldRadiusScale,
            targetShieldRadiusScale * lockPulse,
            fast
          );
      privacyOverlay.cageGroup.scale.set(nextCageR, Math.max(0.45, nextCageH), nextCageR);

      // Slow crisp hexagonal indexing (subtle architectural presence, not planetary orbit)
      if (!ctx.reducedMotion) {
        privacyOverlay.cageGroup.rotation.y = Math.sin(elapsed * 0.32) * 0.12;
      } else {
        privacyOverlay.cageGroup.rotation.y = 0;
      }

      // Position 4 armored corner clamps flush around the locked security zone
      const clampRadius = (isFullStackShield ? 1.56 : 1.38) * (1.06 - privacyBlend * 0.06 + tapPulse * 0.04);
      for (const clamp of privacyOverlay.clamps) {
        clamp.pivot.position.set(
          Math.cos(clamp.angle) * clampRadius,
          0,
          Math.sin(clamp.angle) * clampRadius
        );
      }

      // Vertical firewall verification scan beam oscillating inside the locked tier height
      const scanSpan = Math.max(0.22, nextCageH * 0.44);
      const scanOffset = ctx.reducedMotion ? 0 : Math.sin(elapsed * 2.15) * scanSpan;
      privacyOverlay.scanRing.position.y = scanOffset;
      privacyOverlay.scanBand.position.y = scanOffset;
      privacyOverlay.scanRing.scale.setScalar(nextCageR * 0.985);
      privacyOverlay.scanBand.scale.set(nextCageR, 1, nextCageR);

      const shieldAlpha = privacyBlend * pivotEase;
      const shieldPulse = ctx.reducedMotion ? 0.85 : 0.78 + 0.22 * Math.sin(elapsed * 3.1);
      privacyOverlay.hexWallMat.opacity = shieldAlpha * (isDark ? 0.11 : 0.08) * shieldPulse;
      privacyOverlay.hexEdgeMat.opacity = shieldAlpha * (isDark ? 0.72 : 0.56);
      privacyOverlay.collarMat.opacity = shieldAlpha * (isDark ? 0.88 : 0.68);
      privacyOverlay.strutMat.opacity = shieldAlpha * (isDark ? 0.86 : 0.78);
      privacyOverlay.lockNodeMat.opacity = shieldAlpha * (isDark ? 0.95 : 0.8) * shieldPulse;
      privacyOverlay.clampMat.opacity = shieldAlpha * (isDark ? 0.94 : 0.86);
      privacyOverlay.scanMat.opacity = shieldAlpha * (isDark ? 0.92 : 0.68);
      privacyOverlay.scanBandMat.opacity = shieldAlpha * (isDark ? 0.22 : 0.14);
    }

    updateWeatherEffects(dt, elapsed, ctx.reducedMotion);
  };

  /* ------------------------------------------------------------------------
   * Raycasting & Public StageModule Lifecycle Hooks
   * ------------------------------------------------------------------------ */

  const pickActiveTechBladeIndex = (ndcX: number, ndcY: number, ctx: StageContext): number | null => {
    if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;
    if (ctx.interaction.architectureSubtab !== 'blueprint') return null;
    const activeIdx = resolveActiveTierIndex(ctx.interaction);
    const activeDrawer = tiers[activeIdx]?.techDrawer;
    if (!activeDrawer || !activeDrawer.group.visible || drawerOpacities[activeIdx] < 0.25) {
      return null;
    }
    labelGroup.updateMatrixWorld(true);
    pointerNdc.set(ndcX, ndcY);
    raycaster.setFromCamera(pointerNdc, ctx.camera);
    const hits = raycaster.intersectObjects([...activeDrawer.bladeSprites], false);
    if (hits.length === 0) return null;
    const rawBladeIdx = hits[0].object.userData.techBladeIndex;
    return typeof rawBladeIdx === 'number' && rawBladeIdx >= 0 ? rawBladeIdx : null;
  };

  const pickTierIndex = (ndcX: number, ndcY: number, ctx: StageContext): number | null => {
    if (!Number.isFinite(ndcX) || !Number.isFinite(ndcY)) return null;
    towerPivot.updateMatrixWorld(true);
    pointerNdc.set(ndcX, ndcY);
    raycaster.setFromCamera(pointerNdc, ctx.camera);

    const hits = raycaster.intersectObjects(tierHitMeshes, false);
    if (hits.length === 0) return null;
    const rawIndex = hits[0].object.userData.tierIndex;
    return typeof rawIndex === 'number' && rawIndex >= 0 && rawIndex < TIER_COUNT ? rawIndex : null;
  };

  const getMarbleAnchor = (elapsed: number, state: StageInteractionState): THREE.Vector3 => {
    const activeIdx = resolveActiveTierIndex(state);
    const s = towerPivot.scale.x;
    const tierY =
      (activeIdx === GOV_TIER_INDEX ? dynamicGovBotY : slabCentersY[activeIdx]) * s + towerOffsetY;
    const amp = state.architectureSubtab === 'maps' ? 0.04 : 0.035;
    marbleAnchorOut.set(0, tierY + (lastReducedMotion ? 0 : Math.sin(elapsed * 2.2) * amp), 0);
    return marbleAnchorOut;
  };

  const onEnter = (ctx: StageContext): void => {
    isStageEntered = true;
    currentGlassRatio = THREE.MathUtils.clamp(ctx.glassRatio, 0, 1);
    currentMood = ctx.mood;
    currentTheme = ctx.theme;
    currentArchMode = ctx.interaction.architectureMode === 'prod' ? 'prod' : 'mvp';
    lastReducedMotion = ctx.reducedMotion;
    lastSelectedTierIdx = resolveActiveTierIndex(ctx.interaction);

    // Start the 2-phase intro: Top-surface iNVTRY logo showcase -> sideways layer reveal
    introClock = ctx.reducedMotion ? INTRO_PIVOT_END : 0;
    userDraggedDuringIntro = false;
    targetYaw = DEFAULT_TOWER_YAW;
    currentYaw = DEFAULT_TOWER_YAW;
    towerPivot.rotation.x = ctx.reducedMotion ? 0 : INTRO_TOP_PITCH;
    towerPivot.rotation.y = ctx.reducedMotion ? DEFAULT_TOWER_YAW : 0;
    hoveredTierIndex = null;
    tapPulse = 0.45;

    for (let i = 0; i < TIER_COUNT; i += 1) {
      drawerUnfurls[i] = ctx.reducedMotion && i === lastSelectedTierIdx ? 1 : 0;
      drawerOpacities[i] = 0;
    }

    syncVisualPalette();
    applyFrame(0, 0, ctx, true);
  };

  const onExit = (_ctx: StageContext): void => {
    isStageEntered = false;
    hoveredTierIndex = null;
    marbleLight.intensity = 0;
    towerRimLight.intensity = 0;
    weatherOverlay.solarLight.intensity = 0;
  };

  const onGlassChange = (glassRatio: number): void => {
    currentGlassRatio = THREE.MathUtils.clamp(glassRatio, 0, 1);
    for (let i = 0; i < TIER_COUNT; i += 1) {
      applySmokedGlassState(tiers[i].glassMat, currentGlassRatio, currentMood, currentTheme);
      applyTierGlassGlow(tiers[i], activeWeights[i]);
    }
  };

  const onVisualModeChange = (mood: MoodMode, theme: ThemeMode): void => {
    currentMood = mood;
    currentTheme = theme;
    syncVisualPalette();
  };

  const onInteractionChange = (patch: Partial<StageInteractionState>, _ctx: StageContext): void => {
    if (
      patch.architectureSubtab === 'privacy' ||
      patch.architectureSubtab === 'maps' ||
      patch.privacyShieldId !== undefined ||
      patch.googleApiIndex !== undefined
    ) {
      // Immediately pivot tower upright when inspecting Privacy Vault Shield or Google API tiers
      introClock = INTRO_PIVOT_END;
      tapPulse = 0.78;
    } else if (patch.architectureTier !== undefined || patch.architectureSubtab !== undefined) {
      introClock = Math.max(introClock, INTRO_HOLD_TOP);
      tapPulse = 0.78;
    }
    if (patch.architectureMode !== undefined) {
      introClock = Math.max(introClock, INTRO_HOLD_TOP);
      tapPulse = 0.85;
    }
    if (patch.architectureTechIndex !== undefined) {
      introClock = INTRO_PIVOT_END;
      tapPulse = Math.max(tapPulse, 0.52);
    }
  };

  const onPointerDrag = (dx: number, _dy: number, _ctx: StageContext): void => {
    if (!Number.isFinite(dx)) return;
    userDraggedDuringIntro = true;
    targetYaw += dx * DRAG_SENSITIVITY;
  };

  const onPointerMove = (ndcX: number, ndcY: number, ctx: StageContext): void => {
    hoveredTierIndex = pickTierIndex(ndcX, ndcY, ctx);
  };

  const onPointerTap = (ndcX: number, ndcY: number, ctx: StageContext): void => {
    const hitBlade = pickActiveTechBladeIndex(ndcX, ndcY, ctx);
    if (hitBlade !== null) {
      tapPulse = 0.85;
      const nextTechIndex = ctx.interaction.architectureTechIndex === hitBlade ? null : hitBlade;
      ctx.emitUiSync({ architectureTechIndex: nextTechIndex });
      return;
    }

    const hitTier = pickTierIndex(ndcX, ndcY, ctx);
    if (hitTier === null) return;
    tapPulse = 1.0;

    if (ctx.interaction.architectureSubtab === 'maps') {
      const matchingApis = MAPS_API_SPECS.map((s, idx) => ({ idx, tierIndex: s.tierIndex })).filter(
        (entry) => entry.tierIndex === hitTier
      );
      if (matchingApis.length > 0) {
        const curPos = matchingApis.findIndex((e) => e.idx === ctx.interaction.googleApiIndex);
        const nextApi = matchingApis[(curPos + 1) % matchingApis.length];
        ctx.emitUiSync({ googleApiIndex: nextApi.idx });
      }
      return;
    }

    if (ctx.interaction.architectureSubtab === 'privacy') {
      const exactMatch = PRIVACY_SHIELD_ORDER.find(
        (key) => PRIVACY_SHIELD_SPECS[key].tierIndex === hitTier
      );
      if (exactMatch) {
        ctx.emitUiSync({ privacyShieldId: exactMatch });
      } else {
        let closestKey: PrivacyShieldKey = 'biometric';
        let bestDist = Infinity;
        for (const key of PRIVACY_SHIELD_ORDER) {
          const d = Math.abs(PRIVACY_SHIELD_SPECS[key].tierIndex - hitTier);
          if (d < bestDist) {
            bestDist = d;
            closestKey = key;
          }
        }
        ctx.emitUiSync({ privacyShieldId: closestKey });
      }
      return;
    }

    ctx.emitUiSync({ architectureTier: hitTier, architectureTechIndex: null });
  };

  const dispose = (): void => {
    isDisposed = true;
    for (let i = 0; i < tiers.length; i += 1) {
      tiers[i].techDrawer.dispose();
    }
    for (const label of mapsApiLabels) {
      label.dispose();
    }
    for (const label of privacyShieldLabels) {
      label.dispose();
    }
    topLogoDarkTex.dispose();
    topLogoLightTex.dispose();
    disposeObject3D(group);
  };

  return {
    id: 'architecture',
    group,
    cameraPreset: STAGE_CAMERA_PRESETS.architecture,
    getMarbleAnchor,
    onEnter,
    onExit,
    onGlassChange,
    onVisualModeChange,
    onInteractionChange,
    onPointerDrag,
    onPointerMove,
    onPointerTap,
    update: (dt, elapsed, ctx) => applyFrame(dt, elapsed, ctx, false),
    dispose,
  };
}
