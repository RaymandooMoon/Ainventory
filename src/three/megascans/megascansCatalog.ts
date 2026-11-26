/**
 * megascansCatalog.ts
 * ---------------------------------------------------------------------------
 * Canonical Quixel Megascans (Fab Standard License) slot registry, manifest
 * schema validator, safe URL resolver, and PBR texture filename classifier
 * shared across Ainventory's Three.js stages (site showroom + mobile app).
 *
 * Pure & SSR-safe (zero DOM/WebGL side effects).
 */

export const DEFAULT_MEGASCANS_BASE_URL = '/assets/megascans';
export const MEGASCANS_MANIFEST_FILENAME = 'manifest.json';

export const MEGASCANS_SLOT_IDS = [
  'showroom-pedestal',
  'specs-floor',
  'atelier-fabric',
  'fitting-floor-stone',
  'fitting-floor-oak',
  'fitting-floor-outdoor',
  'gacha-plinth',
  'gacha-metal',
] as const;

export type MegascansSlotId = (typeof MEGASCANS_SLOT_IDS)[number];

export type FittingFloorSlotId =
  | 'fitting-floor-stone'
  | 'fitting-floor-oak'
  | 'fitting-floor-outdoor';

export type MegascansNormalConvention = 'opengl' | 'directx';

export type MegascansTextureRole =
  | 'albedo'
  | 'normal'
  | 'orm'
  | 'ordp'
  | 'ao'
  | 'roughness'
  | 'metalness'
  | 'displacement';

export interface MegascansTextureClassification {
  readonly role: MegascansTextureRole;
  readonly normalConvention: MegascansNormalConvention | null;
  readonly isGloss: boolean;
}

export interface MegascansSlotSpec {
  readonly id: MegascansSlotId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly targetFiles: readonly string[];
  readonly fabKeywords: readonly string[];
  readonly defaultRepeat: readonly [number, number];
  readonly defaultNormalStrength: number;
  readonly defaultAoIntensity: number;
  readonly preserveOriginalAlbedo: boolean;
  readonly targetDefaultMetalness: number;
}

export interface MegascansTierMaps {
  readonly size: number;
  readonly albedo?: string;
  readonly normal?: string;
  readonly orm?: string;
  readonly displacement?: string;
}

export interface MegascansSlotManifestEntry {
  readonly assetName: string;
  readonly license: string;
  readonly normalConvention: MegascansNormalConvention;
  readonly repeat: readonly [number, number];
  readonly normalStrength: number;
  readonly aoMapIntensity: number;
  readonly preserveOriginalAlbedo: boolean;
  readonly tiers: {
    readonly desktop?: MegascansTierMaps;
    readonly mobile?: MegascansTierMaps;
  };
  readonly glb?: string;
}

export interface MegascansManifest {
  readonly version: 1;
  readonly generatedAt: string;
  readonly slots: Partial<Record<MegascansSlotId, MegascansSlotManifestEntry>>;
}

const VALID_SLOT_ID_SET = new Set<string>(MEGASCANS_SLOT_IDS);

const OAK_PARQUET_BACKGROUND_IDS = new Set<string>([
  'c_oak_dressing_room',
  's_grand_paris_atelier',
  'b_minimal_loft_window',
]);

export const MEGASCANS_SLOT_SPECS: Readonly<Record<MegascansSlotId, MegascansSlotSpec>> = {
  'showroom-pedestal': {
    id: 'showroom-pedestal',
    labelKo: '쇼룸 턴테이블 대좌 (흑요석/네로 대리석)',
    labelEn: 'Showroom Turntable Pedestal (Obsidian / Nero Marble)',
    targetFiles: ['src/three/stages/studioStage.ts'],
    fabKeywords: ['Black Marble', 'Honed Basalt', 'Polished Dark Marble'],
    defaultRepeat: [2, 2],
    defaultNormalStrength: 0.72,
    defaultAoIntensity: 0.65,
    preserveOriginalAlbedo: false,
    targetDefaultMetalness: 0.08,
  },
  'specs-floor': {
    id: 'specs-floor',
    labelKo: '스펙 스테이지 반사 바닥 (폴리시드 콘크리트/테라조)',
    labelEn: 'Specs Stage Reflective Floor (Polished Concrete / Terrazzo)',
    targetFiles: ['src/three/stages/specsStage.ts'],
    fabKeywords: ['Polished Concrete', 'Dark Terrazzo', 'Venetian Plaster'],
    defaultRepeat: [3.5, 3.5],
    defaultNormalStrength: 0.55,
    defaultAoIntensity: 0.55,
    preserveOriginalAlbedo: true,
    targetDefaultMetalness: 0.12,
  },
  'atelier-fabric': {
    id: 'atelier-fabric',
    labelKo: '쇼룸 쿠튀르 코트·아바타 원단 (울/트윌 직조)',
    labelEn: 'Showroom Couture Coat & Avatar Fabric (Wool / Twill Weave)',
    targetFiles: ['src/three/stages/studioStage.ts'],
    fabKeywords: ['Wool Fabric', 'Twill Fabric', 'Tailored Linen'],
    defaultRepeat: [4, 4],
    defaultNormalStrength: 0.62,
    defaultAoIntensity: 0.5,
    preserveOriginalAlbedo: true,
    targetDefaultMetalness: 0.0,
  },
  'fitting-floor-stone': {
    id: 'fitting-floor-stone',
    labelKo: '피팅 스튜디오 실내 석재 바닥 (트래버틴/콘크리트)',
    labelEn: 'Fitting Studio Indoor Stone Floor (Travertine / Concrete)',
    targetFiles: ['src/components/three/StudioThreeStageLayer.tsx'],
    fabKeywords: ['Travertine Stone', 'Architectural Concrete', 'Honed Limestone'],
    defaultRepeat: [3, 3],
    defaultNormalStrength: 0.68,
    defaultAoIntensity: 0.5,
    preserveOriginalAlbedo: true,
    targetDefaultMetalness: 0.06,
  },
  'fitting-floor-oak': {
    id: 'fitting-floor-oak',
    labelKo: '피팅 스튜디오 실내 원목 바닥 (오크 파케트)',
    labelEn: 'Fitting Studio Indoor Oak Floor (Herringbone Oak Parquet)',
    targetFiles: ['src/components/three/StudioThreeStageLayer.tsx'],
    fabKeywords: ['Herringbone Oak Parquet', 'Oak Wood Planks', 'Pale Hardwood Floor'],
    defaultRepeat: [3, 3],
    defaultNormalStrength: 0.7,
    defaultAoIntensity: 0.55,
    preserveOriginalAlbedo: true,
    targetDefaultMetalness: 0.02,
  },
  'fitting-floor-outdoor': {
    id: 'fitting-floor-outdoor',
    labelKo: '피팅 스튜디오 야외 보도 바닥 (화강암/슬레이트)',
    labelEn: 'Fitting Studio Outdoor Paving (Granite / Slate)',
    targetFiles: ['src/components/three/StudioThreeStageLayer.tsx'],
    fabKeywords: ['Granite Paving', 'Slate Courtyard Tiles', 'Cobblestone Paving'],
    defaultRepeat: [3.2, 3.2],
    defaultNormalStrength: 0.78,
    defaultAoIntensity: 0.55,
    preserveOriginalAlbedo: true,
    targetDefaultMetalness: 0.06,
  },
  'gacha-plinth': {
    id: 'gacha-plinth',
    labelKo: '스토어 가챠 석재 대좌 (라임스톤/트래버틴)',
    labelEn: 'Store Gacha Stone Plinth (Honed Limestone / Travertine)',
    targetFiles: ['src/components/three/StoreThreeGachaStage.tsx'],
    fabKeywords: ['Honed Limestone', 'Travertine Marble', 'Dark Basalt Stone'],
    defaultRepeat: [2.2, 2.2],
    defaultNormalStrength: 0.74,
    defaultAoIntensity: 0.65,
    preserveOriginalAlbedo: false,
    targetDefaultMetalness: 0.06,
  },
  'gacha-metal': {
    id: 'gacha-metal',
    labelKo: '스토어 가챠 브러시드 메탈 (브라스/아노다이즈드)',
    labelEn: 'Store Gacha Brushed Metal (Brushed Brass / Anodized)',
    targetFiles: ['src/components/three/StoreThreeGachaStage.tsx'],
    fabKeywords: ['Brushed Brass', 'Brushed Metal', 'Anodized Aluminum'],
    defaultRepeat: [2, 2],
    defaultNormalStrength: 0.45,
    defaultAoIntensity: 0.4,
    preserveOriginalAlbedo: true,
    targetDefaultMetalness: 0.94,
  },
};

export function isMegascansSlotId(value: string): value is MegascansSlotId {
  return VALID_SLOT_ID_SET.has(value);
}

/**
 * Resolves the appropriate Megascans floor preset slot for `StudioThreeStageLayer`
 * from the active stage background ID and indoor/outdoor flag.
 */
export function resolveFittingFloorSlotId(
  stageBackgroundId: string | undefined,
  isOutdoor: boolean
): FittingFloorSlotId {
  if (isOutdoor) {
    return 'fitting-floor-outdoor';
  }
  if (stageBackgroundId && OAK_PARQUET_BACKGROUND_IDS.has(stageBackgroundId)) {
    return 'fitting-floor-oak';
  }
  return 'fitting-floor-stone';
}

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.tif',
  '.tiff',
  '.tga',
  '.exr',
  '.bmp',
]);

const IGNORED_PREVIEW_PATTERN = /(?:^|[_\-\s/])(preview|thumb|thumbnail|render|turntable|icon)(?:[_\-\s.]|$)/i;

/**
 * Classifies a Quixel / Fab texture filename into its canonical PBR channel role.
 * Returns `null` for non-texture files, previews, and thumbnails.
 */
export function classifyMegascansTextureRole(
  filename: string
): MegascansTextureClassification | null {
  const baseName = filename.split(/[/\\]/).pop() ?? '';
  const dotIdx = baseName.lastIndexOf('.');
  if (dotIdx <= 0) return null;

  const ext = baseName.slice(dotIdx).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return null;

  const stem = baseName.slice(0, dotIdx);
  if (IGNORED_PREVIEW_PATTERN.test(stem)) return null;

  const normalized = stem.toLowerCase();

  // Packed multi-channel maps first so "_ORM" is never misclassified
  if (/(?:^|[_\-\s])ordp(?:[_\-\s]|$)/i.test(normalized)) {
    return { role: 'ordp', normalConvention: null, isGloss: false };
  }
  if (
    /(?:^|[_\-\s])(orm|occlusionroughnessmetallic|metallicroughness)(?:[_\-\s]|$)/i.test(
      normalized
    )
  ) {
    return { role: 'orm', normalConvention: null, isGloss: false };
  }

  // Normal maps (distinguish DirectX vs OpenGL conventions)
  if (/(?:^|[_\-\s])(normaldx|normal[_\-\s]?dx|dx[_\-\s]?normal)(?:[_\-\s]|$)/i.test(normalized)) {
    return { role: 'normal', normalConvention: 'directx', isGloss: false };
  }
  if (/(?:^|[_\-\s])(normalgl|normal[_\-\s]?gl|gl[_\-\s]?normal)(?:[_\-\s]|$)/i.test(normalized)) {
    return { role: 'normal', normalConvention: 'opengl', isGloss: false };
  }
  if (/(?:^|[_\-\s])(normal|norm|nrm)(?:[_\-\s]|$)/i.test(normalized)) {
    const isDirectX = /(?:^|[_\-\s])(dx|directx)(?:[_\-\s]|$)/i.test(normalized);
    return {
      role: 'normal',
      normalConvention: isDirectX ? 'directx' : 'opengl',
      isGloss: false,
    };
  }

  // BaseColor / Albedo
  if (
    /(?:^|[_\-\s])(albedo|base[_\-\s]?color|diffuse|color|col|diff)(?:[_\-\s]|$)/i.test(normalized)
  ) {
    return { role: 'albedo', normalConvention: null, isGloss: false };
  }

  // Roughness / Gloss
  if (/(?:^|[_\-\s])(gloss|glossiness|smoothness)(?:[_\-\s]|$)/i.test(normalized)) {
    return { role: 'roughness', normalConvention: null, isGloss: true };
  }
  if (/(?:^|[_\-\s])(roughness|rough|rgh)(?:[_\-\s]|$)/i.test(normalized)) {
    return { role: 'roughness', normalConvention: null, isGloss: false };
  }

  // Ambient Occlusion
  if (/(?:^|[_\-\s])(ao|ambient[_\-\s]?occlusion|occlusion|cavity)(?:[_\-\s]|$)/i.test(normalized)) {
    return { role: 'ao', normalConvention: null, isGloss: false };
  }

  // Metalness
  if (/(?:^|[_\-\s])(metalness|metallic|metal|met)(?:[_\-\s]|$)/i.test(normalized)) {
    return { role: 'metalness', normalConvention: null, isGloss: false };
  }

  // Displacement / Height / Bump
  if (/(?:^|[_\-\s])(displacement|disp|height|bump)(?:[_\-\s]|$)/i.test(normalized)) {
    return { role: 'displacement', normalConvention: null, isGloss: false };
  }

  return null;
}

const SAFE_RELATIVE_ASSET_PATH_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*\.(?:webp|png|jpg|jpeg|ktx2|glb|gltf)$/i;

function isSafeRelativeAssetPath(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('/') || trimmed.includes('..') || trimmed.includes('\\')) {
    return false;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return false;
  }
  return SAFE_RELATIVE_ASSET_PATH_RE.test(trimmed);
}

/**
 * Resolves the Megascans base URL from `VITE_MEGASCANS_BASE_URL` or explicit override.
 * Only permits root-relative paths (`/assets/...`) or `https://` / `http://` origins.
 */
export function resolveMegascansBaseUrl(configured?: string | null): string {
  const raw =
    configured !== undefined
      ? configured
      : typeof import.meta !== 'undefined' &&
          typeof (import.meta as unknown as { env?: Record<string, unknown> }).env
            ?.VITE_MEGASCANS_BASE_URL === 'string'
        ? ((import.meta as unknown as { env: Record<string, string> }).env
            .VITE_MEGASCANS_BASE_URL as string)
        : undefined;

  if (!raw || typeof raw !== 'string') {
    return DEFAULT_MEGASCANS_BASE_URL;
  }
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_MEGASCANS_BASE_URL;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.includes('..')) {
    return trimmed;
  }
  if (/^https?:\/\/[a-zA-Z0-9.-]+(?::\d+)?(?:\/[^\s?#]*)?$/.test(trimmed) && !trimmed.includes('..')) {
    return trimmed;
  }
  return DEFAULT_MEGASCANS_BASE_URL;
}

/**
 * Joins a validated relative asset path onto a base URL. Throws if path traversal
 * or an unsafe protocol is passed.
 */
export function resolveMegascansAssetUrl(
  relativePath: string,
  baseUrl = resolveMegascansBaseUrl()
): string {
  if (!isSafeRelativeAssetPath(relativePath)) {
    throw new Error(`Unsafe Megascans relative asset path: ${relativePath}`);
  }
  const cleanBase = resolveMegascansBaseUrl(baseUrl);
  return `${cleanBase}/${relativePath.replace(/^\/+/, '')}`;
}

function parseTierMaps(raw: unknown): MegascansTierMaps | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const size = typeof record.size === 'number' && Number.isFinite(record.size) && record.size > 0
    ? Math.round(record.size)
    : 0;
  if (size <= 0) return undefined;

  const albedo = isSafeRelativeAssetPath(record.albedo) ? record.albedo : undefined;
  const normal = isSafeRelativeAssetPath(record.normal) ? record.normal : undefined;
  const orm = isSafeRelativeAssetPath(record.orm) ? record.orm : undefined;
  const displacement = isSafeRelativeAssetPath(record.displacement)
    ? record.displacement
    : undefined;

  if (!albedo && !normal && !orm && !displacement) {
    return undefined;
  }
  return {
    size,
    ...(albedo ? { albedo } : {}),
    ...(normal ? { normal } : {}),
    ...(orm ? { orm } : {}),
    ...(displacement ? { displacement } : {}),
  };
}

function parseRepeatPair(
  raw: unknown,
  fallback: readonly [number, number]
): readonly [number, number] {
  if (
    Array.isArray(raw) &&
    raw.length === 2 &&
    typeof raw[0] === 'number' &&
    typeof raw[1] === 'number' &&
    Number.isFinite(raw[0]) &&
    Number.isFinite(raw[1]) &&
    raw[0] > 0 &&
    raw[1] > 0
  ) {
    return [raw[0], raw[1]];
  }
  return fallback;
}

/**
 * Strictly validates an untrusted JSON payload into a typed `MegascansManifest`.
 * Unknown slots or entries with unsafe paths are silently dropped.
 */
export function parseMegascansManifest(raw: unknown): MegascansManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) return null;
  if (!obj.slots || typeof obj.slots !== 'object' || Array.isArray(obj.slots)) return null;

  const generatedAt =
    typeof obj.generatedAt === 'string' && obj.generatedAt.trim().length > 0
      ? obj.generatedAt.trim()
      : '';

  const slots: Partial<Record<MegascansSlotId, MegascansSlotManifestEntry>> = {};
  const rawSlots = obj.slots as Record<string, unknown>;

  for (const [key, entryRaw] of Object.entries(rawSlots)) {
    if (!isMegascansSlotId(key)) continue;
    if (!entryRaw || typeof entryRaw !== 'object') continue;
    const entry = entryRaw as Record<string, unknown>;
    const spec = MEGASCANS_SLOT_SPECS[key];

    const tiersRaw =
      entry.tiers && typeof entry.tiers === 'object'
        ? (entry.tiers as Record<string, unknown>)
        : {};
    const desktop = parseTierMaps(tiersRaw.desktop);
    const mobile = parseTierMaps(tiersRaw.mobile);
    const glb = isSafeRelativeAssetPath(entry.glb) ? entry.glb : undefined;

    if (!desktop && !mobile && !glb) continue;

    const normalConvention: MegascansNormalConvention =
      entry.normalConvention === 'directx' ? 'directx' : 'opengl';

    const normalStrength =
      typeof entry.normalStrength === 'number' &&
      Number.isFinite(entry.normalStrength) &&
      entry.normalStrength > 0
        ? Math.min(3, entry.normalStrength)
        : spec.defaultNormalStrength;

    const aoMapIntensity =
      typeof entry.aoMapIntensity === 'number' &&
      Number.isFinite(entry.aoMapIntensity) &&
      entry.aoMapIntensity >= 0
        ? Math.min(2, entry.aoMapIntensity)
        : spec.defaultAoIntensity;

    slots[key] = {
      assetName:
        typeof entry.assetName === 'string' && entry.assetName.trim().length > 0
          ? entry.assetName.trim()
          : spec.labelEn,
      license:
        typeof entry.license === 'string' && entry.license.trim().length > 0
          ? entry.license.trim()
          : 'Fab Standard License',
      normalConvention,
      repeat: parseRepeatPair(entry.repeat, spec.defaultRepeat),
      normalStrength,
      aoMapIntensity,
      preserveOriginalAlbedo:
        typeof entry.preserveOriginalAlbedo === 'boolean'
          ? entry.preserveOriginalAlbedo
          : spec.preserveOriginalAlbedo,
      tiers: {
        ...(desktop ? { desktop } : {}),
        ...(mobile ? { mobile } : {}),
      },
      ...(glb ? { glb } : {}),
    };
  }

  return {
    version: 1,
    generatedAt,
    slots,
  };
}

export interface MegascansSlotConfigExport {
  readonly assetName: string;
  readonly license: string;
  readonly repeat: readonly [number, number];
  readonly normalStrength: number;
  readonly aoMapIntensity: number;
  readonly flipNormalY: boolean;
  readonly preserveOriginalAlbedo: boolean;
}

/**
 * Pure admin access guard for the Settings -> Quixel Megascans 3D Lab menu.
 * Grants access strictly to authenticated admin accounts (never demo/guest/member).
 */
export function canAccessAdminMegascansLab(
  user:
    | {
        role?: string | null;
        username?: string | null;
        permissions?: readonly string[] | null;
        isSampleDemo?: boolean;
      }
    | null
    | undefined
): boolean {
  if (!user || user.isSampleDemo) return false;
  if (user.role === 'admin' || user.username === 'admin') return true;
  if (Array.isArray(user.permissions) && user.permissions.includes('admin:manage_roles')) {
    return true;
  }
  return false;
}

/**
 * Builds a sanitized `slot.config.json` override object consumed by `scripts/sync-megascans.py`.
 */
export function buildMegascansSlotConfigPayload(input: {
  readonly assetName?: string;
  readonly repeat: number;
  readonly normalStrength: number;
  readonly aoMapIntensity: number;
  readonly flipNormalY: boolean;
  readonly preserveOriginalAlbedo: boolean;
}): MegascansSlotConfigExport {
  const clampNum = (v: number, min: number, max: number): number =>
    Number(Math.min(max, Math.max(min, Number.isFinite(v) ? v : min)).toFixed(2));
  const rep = clampNum(input.repeat, 0.25, 16);
  const cleanName = String(input.assetName || '').trim() || 'Megascans Asset';
  return {
    assetName: cleanName.slice(0, 120),
    license: 'Fab Standard License',
    repeat: [rep, rep],
    normalStrength: clampNum(input.normalStrength, 0, 3),
    aoMapIntensity: clampNum(input.aoMapIntensity, 0, 2),
    flipNormalY: Boolean(input.flipNormalY),
    preserveOriginalAlbedo: Boolean(input.preserveOriginalAlbedo),
  };
}
