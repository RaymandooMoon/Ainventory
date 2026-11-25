/**
 * megascansMaterialLoader.ts
 * ---------------------------------------------------------------------------
 * Abort-safe, leak-free Three.js 0.187 Quixel Megascans PBR texture loader
 * and per-stage material upgrade session manager.
 *
 * Key guarantees:
 * - Zero network requests in SSR or CPU/software WebGL (SwiftShader/llvmpipe)
 * - Silent 404 / missing-manifest fallback (zero console warnings or errors)
 * - Correct colorSpaces (`SRGBColorSpace` for albedo only, `NoColorSpace` for
 *   Normal / ORM / Roughness / AO / Metalness / Displacement)
 * - Automatic `uv` -> `uv1` aliasing so Three.js `aoMap` renders reliably
 * - Per-stage texture ownership so disposing one stage never invalidates
 *   textures still bound to another mounted stage
 */

import * as THREE from 'three';
import {
  MEGASCANS_MANIFEST_FILENAME,
  MEGASCANS_SLOT_SPECS,
  parseMegascansManifest,
  resolveMegascansAssetUrl,
  resolveMegascansBaseUrl,
  type MegascansManifest,
  type MegascansNormalConvention,
  type MegascansSlotId,
  type MegascansSlotManifestEntry,
  type MegascansTierMaps,
} from './megascansCatalog.ts';

export interface MegascansLoadedTextures {
  readonly albedo?: THREE.Texture;
  readonly normal?: THREE.Texture;
  readonly orm?: THREE.Texture;
  readonly displacement?: THREE.Texture;
}

export interface MegascansLoadedSlot {
  readonly slotId: MegascansSlotId;
  readonly entry: MegascansSlotManifestEntry;
  readonly textures: MegascansLoadedTextures;
}

export interface ApplyMegascansMaterialOptions {
  readonly slotId: MegascansSlotId;
  readonly repeat?: readonly [number, number];
  readonly normalStrength?: number;
  readonly normalConvention?: MegascansNormalConvention;
  readonly preserveOriginalAlbedo?: boolean;
  readonly preserveExistingNormalMap?: boolean;
  readonly aoMapIntensity?: number;
  readonly anisotropy?: number;
  readonly keepScalarRoughness?: boolean;
  readonly keepScalarMetalness?: boolean;
  readonly targetGeometries?: readonly (THREE.BufferGeometry | null | undefined)[];
}

export interface MegascansSessionOptions {
  readonly renderer?: THREE.WebGLRenderer | null;
  readonly isSoftwareGl?: boolean;
  readonly baseUrl?: string | null;
  readonly preferMobileTier?: boolean;
  readonly fetchImpl?: typeof fetch;
}

export interface MegascansSession {
  readonly loadSlot: (slotId: MegascansSlotId) => Promise<MegascansLoadedSlot | null>;
  readonly getManifest: () => Promise<MegascansManifest | null>;
  readonly dispose: () => void;
}

const manifestPromiseCache = new Map<string, Promise<MegascansManifest | null>>();

export function resetMegascansManifestCacheForTest(): void {
  manifestPromiseCache.clear();
}

/**
 * Ensures `uv1` exists on a geometry so Three.js `aoMap` samples properly.
 * Aliases `uv` to `uv1` without allocating a copy when `uv1` is absent.
 * Returns `true` if `uv1` was newly attached, `false` if already present or no `uv`.
 */
export function ensureGeometryUv1ForAo(geometry: THREE.BufferGeometry | null | undefined): boolean {
  if (!geometry) return false;
  if (geometry.getAttribute('uv1')) return false;
  const uv = geometry.getAttribute('uv');
  if (!uv) return false;
  geometry.setAttribute('uv1', uv);
  return true;
}

function configureTextureTile(
  tex: THREE.Texture,
  repeat: readonly [number, number],
  colorSpace: THREE.ColorSpace,
  anisotropy: number
): void {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = colorSpace;
  tex.anisotropy = Math.max(1, anisotropy);
  tex.needsUpdate = true;
}

/**
 * Applies a loaded Megascans PBR texture set onto an existing `MeshStandardMaterial`
 * or `MeshPhysicalMaterial`, preserving `alphaMap`, theme colors, and optional
 * original garment albedo/normal textures.
 */
export function applyMegascansPbrToMaterial(
  material: THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial,
  textures: MegascansLoadedTextures,
  options: ApplyMegascansMaterialOptions
): void {
  const spec = MEGASCANS_SLOT_SPECS[options.slotId];
  const repeat = options.repeat ?? spec.defaultRepeat;
  const normalStrength = options.normalStrength ?? spec.defaultNormalStrength;
  const normalConvention = options.normalConvention ?? 'opengl';
  const preserveOriginalAlbedo = options.preserveOriginalAlbedo ?? spec.preserveOriginalAlbedo;
  const preserveExistingNormalMap = Boolean(options.preserveExistingNormalMap);
  const aoMapIntensity = options.aoMapIntensity ?? spec.defaultAoIntensity;
  const anisotropy = options.anisotropy ?? 4;

  if (options.targetGeometries) {
    for (const geo of options.targetGeometries) {
      ensureGeometryUv1ForAo(geo);
    }
  }

  if (textures.albedo && !preserveOriginalAlbedo) {
    configureTextureTile(textures.albedo, repeat, THREE.SRGBColorSpace, anisotropy);
    material.map = textures.albedo;
  }

  if (textures.normal && !(preserveExistingNormalMap && material.normalMap)) {
    configureTextureTile(textures.normal, repeat, THREE.NoColorSpace, anisotropy);
    material.normalMap = textures.normal;
    material.normalScale.set(
      normalStrength,
      normalConvention === 'directx' ? -normalStrength : normalStrength
    );
    // Clear low-res procedural bumpMap when high-res tangent-space normalMap is active
    material.bumpMap = null;
  }

  if (textures.orm) {
    configureTextureTile(textures.orm, repeat, THREE.NoColorSpace, anisotropy);
    // Three.js MeshStandardMaterial reads R=AO, G=Roughness, B=Metalness from a single ORM texture
    material.aoMap = textures.orm;
    material.aoMapIntensity = aoMapIntensity;
    material.roughnessMap = textures.orm;
    material.metalnessMap = textures.orm;
    if (!options.keepScalarRoughness) {
      material.roughness = 1.0;
    }
    if (!options.keepScalarMetalness) {
      material.metalness = Math.max(material.metalness, spec.targetDefaultMetalness > 0.5 ? 1.0 : 0.25);
    }
  }

  material.userData.megascansSlotId = options.slotId;
  material.userData.hasMegascansOrm = Boolean(textures.orm);
  material.needsUpdate = true;
}

function shouldPreferMobileTier(explicit?: boolean): boolean {
  if (typeof explicit === 'boolean') return explicit;
  if (typeof window === 'undefined') return false;
  const minViewport = Math.min(window.innerWidth || 1024, window.innerHeight || 768);
  return minViewport <= 768;
}

function selectTierMaps(
  entry: MegascansSlotManifestEntry,
  preferMobile: boolean
): MegascansTierMaps | null {
  if (preferMobile) {
    return entry.tiers.mobile ?? entry.tiers.desktop ?? null;
  }
  return entry.tiers.desktop ?? entry.tiers.mobile ?? null;
}

async function fetchManifestOnce(
  baseUrl: string,
  fetchImpl: typeof fetch
): Promise<MegascansManifest | null> {
  const manifestUrl = `${baseUrl}/${MEGASCANS_MANIFEST_FILENAME}`;
  try {
    const res = await fetchImpl(manifestUrl);
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.includes('application/json') && !contentType.includes('text/plain')) {
      return null;
    }
    const raw = (await res.json()) as unknown;
    return parseMegascansManifest(raw);
  } catch {
    return null;
  }
}

async function decodeImageTexture(
  url: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch
): Promise<THREE.Texture | null> {
  if (signal.aborted) return null;
  try {
    const res = await fetchImpl(url, { signal });
    if (!res.ok || signal.aborted) return null;
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (contentType.includes('text/html')) return null;

    const blob = await res.blob();
    if (signal.aborted) return null;

    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' });
      if (signal.aborted) {
        bitmap.close();
        return null;
      }
      const tex = new THREE.Texture(bitmap);
      tex.flipY = false; // Already flipped vertically via createImageBitmap
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      return tex;
    }

    if (typeof Image === 'undefined' || typeof URL === 'undefined') {
      return null;
    }

    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.decoding = 'async';
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('image decode failed'));
        el.src = objectUrl;
      });
      if (signal.aborted) return null;
      const tex = new THREE.Texture(img);
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      return tex;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

/**
 * Creates a lifecycle-bound Megascans loader session for a single Three.js stage
 * or component. Automatically bypasses all network I/O on SSR and software WebGL.
 */
export function createMegascansSession(options: MegascansSessionOptions = {}): MegascansSession {
  const isSoftwareGl = Boolean(options.isSoftwareGl);
  const canLoadInBrowser =
    !isSoftwareGl && typeof window !== 'undefined' && typeof fetch === 'function';
  const fetchImpl = options.fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
  const baseUrl = resolveMegascansBaseUrl(options.baseUrl);
  const preferMobile = shouldPreferMobileTier(options.preferMobileTier);
  const maxAnisotropy = options.renderer
    ? Math.min(options.renderer.capabilities.getMaxAnisotropy(), 4)
    : 4;

  const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const ownedTextures = new Set<THREE.Texture>();
  const slotCache = new Map<MegascansSlotId, Promise<MegascansLoadedSlot | null>>();
  let disposed = false;

  const trackTexture = (tex: THREE.Texture | null): THREE.Texture | undefined => {
    if (!tex) return undefined;
    if (disposed) {
      tex.dispose();
      return undefined;
    }
    ownedTextures.add(tex);
    return tex;
  };

  const getManifest = (): Promise<MegascansManifest | null> => {
    if (disposed || !canLoadInBrowser || !fetchImpl) {
      return Promise.resolve(null);
    }
    let cached = manifestPromiseCache.get(baseUrl);
    if (!cached) {
      cached = fetchManifestOnce(baseUrl, fetchImpl);
      manifestPromiseCache.set(baseUrl, cached);
    }
    return cached;
  };

  const loadSlot = (slotId: MegascansSlotId): Promise<MegascansLoadedSlot | null> => {
    if (disposed || !canLoadInBrowser || !fetchImpl || !abortController) {
      return Promise.resolve(null);
    }

    const existing = slotCache.get(slotId);
    if (existing) return existing;

    const pending = (async (): Promise<MegascansLoadedSlot | null> => {
      const manifest = await getManifest();
      if (disposed || !manifest) return null;

      const entry = manifest.slots[slotId];
      if (!entry) return null;

      const tier = selectTierMaps(entry, preferMobile);
      if (!tier) return null;

      const signal = abortController.signal;
      const loadMap = async (rel?: string): Promise<THREE.Texture | undefined> => {
        if (!rel || disposed || signal.aborted) return undefined;
        let url: string;
        try {
          url = resolveMegascansAssetUrl(rel, baseUrl);
        } catch {
          return undefined;
        }
        const tex = await decodeImageTexture(url, signal, fetchImpl);
        if (tex) {
          tex.anisotropy = maxAnisotropy;
        }
        return trackTexture(tex);
      };

      const [albedo, normal, orm, displacement] = await Promise.all([
        entry.preserveOriginalAlbedo ? Promise.resolve(undefined) : loadMap(tier.albedo),
        loadMap(tier.normal),
        loadMap(tier.orm),
        loadMap(tier.displacement),
      ]);

      if (disposed || (!albedo && !normal && !orm && !displacement)) {
        return null;
      }

      return {
        slotId,
        entry,
        textures: {
          ...(albedo ? { albedo } : {}),
          ...(normal ? { normal } : {}),
          ...(orm ? { orm } : {}),
          ...(displacement ? { displacement } : {}),
        },
      };
    })();

    slotCache.set(slotId, pending);
    return pending;
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    abortController?.abort();
    slotCache.clear();
    for (const tex of ownedTextures) {
      const img = tex.image as { close?: () => void } | null;
      tex.dispose();
      if (img && typeof img.close === 'function') {
        try {
          img.close();
        } catch {
          // ignore already-closed ImageBitmap
        }
      }
    }
    ownedTextures.clear();
  };

  return {
    loadSlot,
    getManifest,
    dispose,
  };
}
