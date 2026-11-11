/**
 * Offline-First IndexedDB Cache & Cloud Sync Queue (Requirement 8.b & 10.a)
 * - Mirrors GET responses into IndexedDB (`ainventory_offline_v1`) with strict user-scope isolation
 * - Serves cached wardrobe, outfits, weather, calendar, analytics & packing lists when offline
 * - Queues offline mutations (`mutation_queue`), rewrites dependent tempIds, dead-letters permanent 4xx errors,
 *   and flushes automatically upon reconnection
 * - Provides atomic `purgeAllLocalUserData()` for App Store / Play Store immediate account deletion
 */

import type { GarmentRecord, PackingListItem, PackingListRecord } from '../contracts/carbonDesignContract.ts';
import {
  getStudioSeedImageForGarment,
  resolveManifestSlotAndGlb,
} from '../shared/garmentTaxonomy.js';

const DB_NAME = 'ainventory_offline_v1';
const DB_VERSION = 1;
const STORE_CACHE = 'kv_cache';
const STORE_QUEUE = 'mutation_queue';
const DEAD_LETTER_KEY = '__dead_letter_mutations__';
const USER_SCOPE_STORAGE_KEY = 'ainventory_offline_user_scope';

export interface SyncStateSnapshot {
  isOnline: boolean;
  queuedCount: number;
  flushed?: number;
}

export type SyncStateListener = (state: SyncStateSnapshot) => void;

export interface OfflineSendOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

export type OfflineSendFn = (
  path: string,
  options: OfflineSendOptions
) => Promise<Record<string, unknown>>;

export interface FlushQueueOptions {
  isOfflineFn?: () => boolean;
}

interface CacheRow {
  key: string;
  data: Record<string, unknown>;
  userScope?: string;
  updatedAt: number;
}

interface QueuedMutationRecord {
  id?: number;
  path: string;
  method: string;
  body: Record<string, unknown>;
  tempId?: number;
  userScope: string;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
const syncListeners = new Set<SyncStateListener>();
let memoryUserScope = '';

function readInitialUserScope(): string {
  if (memoryUserScope) return memoryUserScope;
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(USER_SCOPE_STORAGE_KEY);
      if (saved) {
        memoryUserScope = saved;
        return saved;
      }
    }
  } catch {
    // ignore storage read error
  }
  return 'default';
}

export function getOfflineUserScope(): string {
  return readInitialUserScope();
}

export function setOfflineUserScope(scope: string | null | undefined): void {
  const nextScope = String(scope || '').trim() || 'default';
  const prevScope = readInitialUserScope();
  memoryUserScope = nextScope;
  try {
    if (typeof localStorage !== 'undefined') {
      if (scope) {
        localStorage.setItem(USER_SCOPE_STORAGE_KEY, nextScope);
      } else {
        localStorage.removeItem(USER_SCOPE_STORAGE_KEY);
      }
    }
  } catch {
    // ignore storage error
  }
  if (prevScope && prevScope !== 'default' && prevScope !== nextScope) {
    void clearUserSessionOfflineCache(prevScope);
  }
}

function notifySyncListeners(state: SyncStateSnapshot): void {
  for (const fn of syncListeners) {
    try {
      fn(state);
    } catch {
      // ignore listener error
    }
  }
}

export function subscribeOfflineSync(listener: SyncStateListener): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

function openOfflineDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const idb = req.result;
        if (!idb.objectStoreNames.contains(STORE_CACHE)) {
          idb.createObjectStore(STORE_CACHE, { keyPath: 'key' });
        }
        if (!idb.objectStoreNames.contains(STORE_QUEUE)) {
          idb.createObjectStore(STORE_QUEUE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });
  return dbPromise;
}

export async function readCachedResponse<T = Record<string, unknown>>(
  key: string
): Promise<T | null> {
  const idb = await openOfflineDb();
  if (!idb) return null;
  const isDemoKey = key.startsWith('demo:');
  const activeScope = getOfflineUserScope();

  return new Promise<T | null>((resolve) => {
    try {
      const tx = idb.transaction(STORE_CACHE, 'readonly');
      const req = tx.objectStore(STORE_CACHE).get(key);
      req.onsuccess = () => {
        const row = req.result as CacheRow | undefined;
        if (!row || row.data === undefined) {
          resolve(null);
          return;
        }
        if (key !== DEAD_LETTER_KEY && !isDemoKey) {
          if (
            row.userScope &&
            row.userScope !== 'default' &&
            activeScope !== 'default' &&
            row.userScope !== activeScope
          ) {
            resolve(null);
            return;
          }
        }
        resolve(row.data as T);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeCachedResponse(
  key: string,
  data: unknown
): Promise<void> {
  const idb = await openOfflineDb();
  if (!idb) return;
  const isDemoKey = key.startsWith('demo:');
  const userScope =
    key === DEAD_LETTER_KEY ? 'system' : isDemoKey ? 'demo' : getOfflineUserScope();

  return new Promise<void>((resolve) => {
    try {
      const tx = idb.transaction(STORE_CACHE, 'readwrite');
      tx.objectStore(STORE_CACHE).put({
        key,
        data: (data && typeof data === 'object' ? data : { value: data }) as Record<string, unknown>,
        userScope,
        updatedAt: Date.now(),
      } satisfies CacheRow);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Clears cached authenticated user entries on logout / account switch
 * so another user on the same browser never inherits stale cached closets.
 */
export async function clearUserSessionOfflineCache(specificScope?: string): Promise<void> {
  const idb = await openOfflineDb();
  if (!idb) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = idb.transaction(STORE_CACHE, 'readwrite');
      const store = tx.objectStore(STORE_CACHE);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (Array.isArray(req.result) ? req.result : []) as CacheRow[];
        for (const row of rows) {
          const k = String(row.key || '');
          if (k.startsWith('demo:') || k === DEAD_LETTER_KEY) continue;
          if (!specificScope || !row.userScope || row.userScope === specificScope) {
            store.delete(k);
          }
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function matchesTargetClosetQuery(cacheKey: string, targetCloset?: string): boolean {
  if (!targetCloset) return true;
  const qIdx = cacheKey.indexOf('?');
  if (qIdx < 0) return true;
  const params = new URLSearchParams(cacheKey.slice(qIdx + 1));
  const c = params.get('closet');
  if (!c || c === 'all') return true;
  return c === targetCloset;
}

async function listCacheEntriesByPrefix(
  prefix: string,
  isDemo = false,
  targetCloset?: string
): Promise<CacheRow[]> {
  const idb = await openOfflineDb();
  if (!idb) return [];
  const activeScope = getOfflineUserScope();

  return new Promise<CacheRow[]>((resolve) => {
    try {
      const tx = idb.transaction(STORE_CACHE, 'readonly');
      const req = tx.objectStore(STORE_CACHE).getAll();
      req.onsuccess = () => {
        const all = (Array.isArray(req.result) ? req.result : []) as CacheRow[];
        resolve(
          all.filter((row) => {
            const k = String(row.key || '');
            if (isDemo) {
              return k.startsWith(`demo:${prefix}`) && matchesTargetClosetQuery(k, targetCloset);
            }
            if (!k.startsWith(prefix)) return false;
            if (
              row.userScope &&
              row.userScope !== 'default' &&
              activeScope !== 'default' &&
              row.userScope !== activeScope
            ) {
              return false;
            }
            return matchesTargetClosetQuery(k, targetCloset);
          })
        );
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function enqueueOfflineMutation(entry: {
  path: string;
  method: string;
  body: Record<string, unknown>;
  tempId?: number;
}): Promise<void> {
  const idb = await openOfflineDb();
  if (!idb) return;
  const record: QueuedMutationRecord = {
    path: entry.path,
    method: entry.method,
    body: entry.body,
    tempId: entry.tempId,
    userScope: getOfflineUserScope(),
    createdAt: Date.now(),
  };

  await new Promise<void>((resolve) => {
    try {
      const tx = idb.transaction(STORE_QUEUE, 'readwrite');
      tx.objectStore(STORE_QUEUE).add(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  const count = await getQueuedMutationCount();
  const onlineNow = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  notifySyncListeners({ isOnline: onlineNow, queuedCount: count });
}

export async function getQueuedMutationCount(): Promise<number> {
  const idb = await openOfflineDb();
  if (!idb) return 0;
  return new Promise<number>((resolve) => {
    try {
      const tx = idb.transaction(STORE_QUEUE, 'readonly');
      const req = tx.objectStore(STORE_QUEUE).count();
      req.onsuccess = () => resolve(Number(req.result) || 0);
      req.onerror = () => resolve(0);
    } catch {
      resolve(0);
    }
  });
}

function rewritePathWithIdMap(path: string, idMap: Map<number, number>): string {
  if (idMap.size === 0) return path;
  let nextPath = path;
  for (const [tempId, realId] of idMap.entries()) {
    const token = `/${tempId}`;
    if (nextPath.endsWith(token)) {
      nextPath = `${nextPath.slice(0, -token.length)}/${realId}`;
    } else if (nextPath.includes(`${token}/`)) {
      nextPath = nextPath.replace(`${token}/`, `/${realId}/`);
    }
  }
  return nextPath;
}

function rewriteBodyWithIdMap(
  body: Record<string, unknown> | undefined,
  idMap: Map<number, number>
): Record<string, unknown> | undefined {
  if (!body || idMap.size === 0) return body;
  const cloned: Record<string, unknown> = { ...body };
  if (Array.isArray(cloned.item_ids)) {
    cloned.item_ids = cloned.item_ids.map((rawId) => {
      const n = Number(rawId);
      return idMap.has(n) ? idMap.get(n)! : rawId;
    });
  }
  if (cloned.outfit_id !== undefined && cloned.outfit_id !== null) {
    const oid = Number(cloned.outfit_id);
    if (idMap.has(oid)) {
      cloned.outfit_id = idMap.get(oid)!;
    }
  }
  if (cloned.checkId !== undefined && cloned.checkId !== null) {
    const cid = Number(cloned.checkId);
    if (idMap.has(cid)) {
      cloned.checkId = idMap.get(cid)!;
    }
  }
  return cloned;
}

function extractCreatedServerId(res: Record<string, unknown> | null | undefined): number | null {
  if (!res || typeof res !== 'object') return null;
  const garment = res.garment as { id?: number } | undefined;
  if (garment && Number.isFinite(Number(garment.id))) return Number(garment.id);
  const list = res.list as { id?: number } | undefined;
  if (list && Number.isFinite(Number(list.id))) return Number(list.id);
  if (Number.isFinite(Number(res.id))) return Number(res.id);
  return null;
}

async function appendDeadLetterMutation(
  item: QueuedMutationRecord,
  status: number,
  errorMessage: string
): Promise<void> {
  const existing = await readCachedResponse<{ items?: unknown[] }>(DEAD_LETTER_KEY);
  const prevItems = Array.isArray(existing?.items) ? existing.items : [];
  const nextItems = [
    ...prevItems.slice(-49),
    {
      path: item.path,
      method: item.method,
      createdAt: item.createdAt,
      failedAt: Date.now(),
      status,
      error: errorMessage,
    },
  ];
  await writeCachedResponse(DEAD_LETTER_KEY, { items: nextItems });
}

let flushing = false;

export async function flushOfflineQueue(
  sendFn: OfflineSendFn,
  options: FlushQueueOptions = {}
): Promise<number> {
  const isOffline = options.isOfflineFn ? options.isOfflineFn() : false;
  if (flushing || isOffline) return 0;

  const idb = await openOfflineDb();
  if (!idb) return 0;

  flushing = true;
  let flushed = 0;
  const idMap = new Map<number, number>();
  const activeScope = getOfflineUserScope();

  try {
    const items = await new Promise<QueuedMutationRecord[]>((resolve) => {
      try {
        const tx = idb.transaction(STORE_QUEUE, 'readonly');
        const req = tx.objectStore(STORE_QUEUE).getAll();
        req.onsuccess = () =>
          resolve((Array.isArray(req.result) ? req.result : []) as QueuedMutationRecord[]);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });

    for (const item of items) {
      if (
        item.userScope &&
        item.userScope !== 'default' &&
        activeScope !== 'default' &&
        item.userScope !== activeScope
      ) {
        continue;
      }

      const resolvedPath = rewritePathWithIdMap(item.path, idMap);
      const resolvedBody = rewriteBodyWithIdMap(item.body, idMap);

      try {
        const response = await sendFn(resolvedPath, {
          method: item.method,
          body: resolvedBody ? JSON.stringify(resolvedBody) : undefined,
        });

        const serverId = extractCreatedServerId(response);
        if (item.tempId !== undefined && serverId !== null) {
          idMap.set(Number(item.tempId), serverId);
        }

        if (item.id !== undefined) {
          await new Promise<void>((resolve) => {
            try {
              const tx = idb.transaction(STORE_QUEUE, 'readwrite');
              tx.objectStore(STORE_QUEUE).delete(item.id!);
              tx.oncomplete = () => resolve();
              tx.onerror = () => resolve();
            } catch {
              resolve();
            }
          });
        }
        flushed += 1;
      } catch (err) {
        const status = Number((err as { status?: number })?.status || 0);
        const isBackendUnavailable = Boolean(
          (err as { isBackendUnavailable?: boolean })?.isBackendUnavailable
        );
        const isPermanentClientError =
          !isBackendUnavailable &&
          status >= 400 &&
          status < 500 &&
          status !== 401 &&
          status !== 408 &&
          status !== 429;

        if (isPermanentClientError && item.id !== undefined) {
          const message = err instanceof Error ? err.message : String(err);
          await appendDeadLetterMutation(item, status, message);
          await new Promise<void>((resolve) => {
            try {
              const tx = idb.transaction(STORE_QUEUE, 'readwrite');
              tx.objectStore(STORE_QUEUE).delete(item.id!);
              tx.oncomplete = () => resolve();
              tx.onerror = () => resolve();
            } catch {
              resolve();
            }
          });
          continue;
        }

        // Persist any tempId->serverId rewrites onto remaining queued mutations before stopping
        if (idMap.size > 0) {
          for (const pendingItem of items) {
            if (pendingItem.id === undefined || pendingItem.id < (item.id ?? 0)) continue;
            const nextPath = rewritePathWithIdMap(pendingItem.path, idMap);
            const nextBody = rewriteBodyWithIdMap(pendingItem.body, idMap) || pendingItem.body;
            if (nextPath !== pendingItem.path || nextBody !== pendingItem.body) {
              await new Promise<void>((resolve) => {
                try {
                  const tx = idb.transaction(STORE_QUEUE, 'readwrite');
                  tx.objectStore(STORE_QUEUE).put({
                    ...pendingItem,
                    path: nextPath,
                    body: nextBody,
                  });
                  tx.oncomplete = () => resolve();
                  tx.onerror = () => resolve();
                } catch {
                  resolve();
                }
              });
            }
          }
        }
        break;
      }
    }
  } finally {
    flushing = false;
  }

  const remaining = await getQueuedMutationCount();
  notifySyncListeners({ isOnline: true, queuedCount: remaining, flushed });
  return flushed;
}

let tempIdSeq = 1;

function nextTempNegativeId(): number {
  tempIdSeq = (tempIdSeq + 1) % 1000;
  return -(Math.floor(Date.now() % 100000000) * 1000 + tempIdSeq);
}

function parseBodyRecord(rawBody: unknown): Record<string, unknown> {
  if (typeof rawBody === 'string') {
    try {
      const parsed = JSON.parse(rawBody);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (rawBody && typeof rawBody === 'object') {
    return rawBody as Record<string, unknown>;
  }
  return {};
}

/**
 * Optimistically updates local IndexedDB cache when offline or in Guest Sample Demo mode
 * so wardrobe browsing, garment registration/edits/deletes, outfit creation, calendar OOTD,
 * shopping decisions, and packing toggles work seamlessly offline!
 */
export async function applyOptimisticLocalMutation(
  path: string,
  method: string,
  rawBody: unknown,
  shouldQueue = true
): Promise<Record<string, unknown>> {
  const upperMethod = String(method || 'POST').toUpperCase();
  const body = parseBodyRecord(rawBody);
  const isDemo = !shouldQueue;
  const tempId = upperMethod === 'POST' ? nextTempNegativeId() : undefined;

  if (shouldQueue) {
    await enqueueOfflineMutation({ path, method: upperMethod, body, tempId });
  }

  const cachePrefixKey = (subPath: string) => (isDemo ? `demo:${subPath}` : subPath);

  // 1. POST /garments
  if (path === '/garments' && upperMethod === 'POST') {
    const id = tempId!;
    const category = String(body.category || 'top');
    const subcategory = String(body.subcategory || 'knit');
    const spec = resolveManifestSlotAndGlb(category, subcategory);
    const price = Math.max(0, Number(body.price) || 0);
    const wearCount = Math.max(0, Number(body.wear_count) || 0);
    const closetOwner = String(body.closet_owner || (isDemo ? 'sample' : 'husband'));
    const imageSource = String(
      body.image_data || body.image_url || getStudioSeedImageForGarment(category, subcategory)
    );

    const fakeGarment: GarmentRecord = {
      id,
      closet_owner: closetOwner,
      name: String(body.name || '오프라인 등록 의류'),
      category,
      subcategory,
      fabric: String(body.fabric || 'cotton'),
      color_name: String(body.color_name || '블랙'),
      color_hex: String(body.color_hex || '#1D1D1F'),
      seasons: Array.isArray(body.seasons) ? body.seasons.map(String) : ['봄', '가을'],
      min_temp: Number(body.min_temp ?? 8),
      max_temp: Number(body.max_temp ?? 20),
      water_resistant: Boolean(body.water_resistant),
      formality: String(body.formality || 'smart'),
      brand: String(body.brand || ''),
      price,
      wear_count: wearCount,
      cpw: wearCount > 0 ? Math.round(price / wearCount) : price,
      is_favorite: false,
      status: String(body.status || 'active'),
      image_url: imageSource,
      notes: String(body.notes || ''),
      slot_key: String(body.slot_key || spec.slotKey),
      base_glb: String(body.base_glb || spec.baseGlb),
      physics_preset: String(body.physics_preset || spec.physicsPreset),
      custom_texture: Boolean(body.custom_texture ?? Boolean(body.image_data)),
      offlinePending: shouldQueue,
    };

    const entries = await listCacheEntriesByPrefix('/garments', isDemo, closetOwner);
    for (const row of entries) {
      const prev = Array.isArray(row.data?.garments) ? (row.data.garments as GarmentRecord[]) : [];
      await writeCachedResponse(row.key, {
        ...row.data,
        garments: [fakeGarment, ...prev],
      });
    }
    if (entries.length === 0) {
      await writeCachedResponse(
        cachePrefixKey(`/garments?closet=${encodeURIComponent(closetOwner)}`),
        { garments: [fakeGarment] }
      );
    }
    return { garment: fakeGarment, offlineQueued: shouldQueue };
  }

  // 1b. PATCH /garments/:id
  if (/^\/garments\/-?\d+$/.test(path) && upperMethod === 'PATCH') {
    const garmentId = Number(path.split('/')[2]);
    const entries = await listCacheEntriesByPrefix('/garments', isDemo);
    let updatedGarment: GarmentRecord | null = null;

    for (const row of entries) {
      const garments = Array.isArray(row.data?.garments)
        ? (row.data.garments as GarmentRecord[])
        : [];
      const nextGarments = garments.map((g) => {
        if (Number(g.id) !== garmentId) return g;
        const nextPrice = body.price !== undefined ? Math.max(0, Number(body.price) || 0) : g.price;
        const nextWear =
          body.wear_count !== undefined ? Math.max(0, Number(body.wear_count) || 0) : g.wear_count;
        const next: GarmentRecord = {
          ...g,
          name: body.name !== undefined ? String(body.name) : g.name,
          status: body.status !== undefined ? String(body.status) : g.status,
          is_favorite:
            body.is_favorite !== undefined ? Boolean(body.is_favorite) : Boolean(g.is_favorite),
          price: nextPrice,
          brand: body.brand !== undefined ? String(body.brand) : g.brand,
          notes: body.notes !== undefined ? String(body.notes) : g.notes,
          wear_count: nextWear,
          cpw: nextWear > 0 ? Math.round(nextPrice / nextWear) : nextPrice,
          offlinePending: shouldQueue,
        };
        updatedGarment = next;
        return next;
      });
      await writeCachedResponse(row.key, { ...row.data, garments: nextGarments });
    }
    return { garment: updatedGarment, offlineQueued: shouldQueue };
  }

  // 1c. POST /garments/:id/wear
  if (/^\/garments\/-?\d+\/wear$/.test(path) && upperMethod === 'POST') {
    const garmentId = Number(path.split('/')[2]);
    const todayStr = new Date().toISOString().slice(0, 10);
    const entries = await listCacheEntriesByPrefix('/garments', isDemo);
    let updatedGarment: GarmentRecord | null = null;

    for (const row of entries) {
      const garments = Array.isArray(row.data?.garments)
        ? (row.data.garments as GarmentRecord[])
        : [];
      const nextGarments = garments.map((g) => {
        if (Number(g.id) !== garmentId) return g;
        const nextWears = (Number(g.wear_count) || 0) + 1;
        const price = Number(g.price) || 0;
        const next: GarmentRecord = {
          ...g,
          wear_count: nextWears,
          cpw: Math.round(price / nextWears),
          last_worn_date:
            !g.last_worn_date || g.last_worn_date < todayStr ? todayStr : g.last_worn_date,
          offlinePending: shouldQueue,
        };
        updatedGarment = next;
        return next;
      });
      await writeCachedResponse(row.key, { ...row.data, garments: nextGarments });
    }
    return { garment: updatedGarment, offlineQueued: shouldQueue };
  }

  // 1d. DELETE /garments/:id
  if (/^\/garments\/-?\d+$/.test(path) && upperMethod === 'DELETE') {
    const garmentId = Number(path.split('/')[2]);
    const entries = await listCacheEntriesByPrefix('/garments', isDemo);
    for (const row of entries) {
      const garments = Array.isArray(row.data?.garments)
        ? (row.data.garments as GarmentRecord[])
        : [];
      await writeCachedResponse(row.key, {
        ...row.data,
        garments: garments.filter((g) => Number(g.id) !== garmentId),
      });
    }
    return { ok: true, offlineQueued: shouldQueue };
  }

  // 2. POST /outfits
  if (path === '/outfits' && upperMethod === 'POST') {
    const id = tempId!;
    const closetOwner = String(body.closet_owner || (isDemo ? 'sample' : 'husband'));
    const garmentCaches = await listCacheEntriesByPrefix('/garments', isDemo, closetOwner);
    const allItems = garmentCaches.flatMap(
      (c) => (Array.isArray(c.data?.garments) ? (c.data.garments as GarmentRecord[]) : [])
    );
    const byId = new Map(allItems.map((g) => [Number(g.id), g]));
    const itemIds = Array.isArray(body.item_ids) ? body.item_ids.map(Number) : [];
    const newOutfit = {
      id,
      closet_owner: closetOwner,
      title: String(body.title || '오프라인 코디'),
      occasion: String(body.occasion || '데일리'),
      season: String(body.season || '봄/가을'),
      item_ids: itemIds,
      items: itemIds.map((gid) => byId.get(gid)).filter(Boolean),
      memo: String(body.memo || ''),
      wear_count: 0,
      offlinePending: shouldQueue,
    };
    const entries = await listCacheEntriesByPrefix('/outfits', isDemo, closetOwner);
    for (const row of entries) {
      const prev = Array.isArray(row.data?.outfits) ? row.data.outfits : [];
      await writeCachedResponse(row.key, { ...row.data, outfits: [newOutfit, ...prev] });
    }
    if (entries.length === 0) {
      await writeCachedResponse(
        cachePrefixKey(`/outfits?closet=${encodeURIComponent(closetOwner)}`),
        { outfits: [newOutfit] }
      );
    }
    return { id, outfit: newOutfit, offlineQueued: shouldQueue };
  }

  // 2b. DELETE /outfits/:id
  if (/^\/outfits\/-?\d+$/.test(path) && upperMethod === 'DELETE') {
    const outfitId = Number(path.split('/')[2]);
    const entries = await listCacheEntriesByPrefix('/outfits', isDemo);
    for (const row of entries) {
      const prev = Array.isArray(row.data?.outfits)
        ? (row.data.outfits as Array<{ id: number }>)
        : [];
      await writeCachedResponse(row.key, {
        ...row.data,
        outfits: prev.filter((o) => Number(o.id) !== outfitId),
      });
    }
    return { ok: true, offlineQueued: shouldQueue };
  }

  // 3. POST /calendar
  if (path === '/calendar' && upperMethod === 'POST') {
    const id = tempId!;
    const todayStr = new Date().toISOString().slice(0, 10);
    const wornDate = String(body.worn_date || todayStr);
    const status = String(body.status || (wornDate > todayStr ? 'planned' : 'worn'));
    const closetOwner = String(body.closet_owner || body.owner || (isDemo ? 'sample' : 'husband'));
    const garmentCaches = await listCacheEntriesByPrefix('/garments', isDemo, closetOwner);
    const allItems = garmentCaches.flatMap(
      (c) => (Array.isArray(c.data?.garments) ? (c.data.garments as GarmentRecord[]) : [])
    );
    const byId = new Map(allItems.map((g) => [Number(g.id), g]));
    const itemIds = Array.isArray(body.item_ids) ? body.item_ids.map(Number) : [];
    const logRow = {
      id,
      closet_owner: closetOwner,
      worn_date: wornDate,
      outfit_id: body.outfit_id ? Number(body.outfit_id) : null,
      status,
      item_ids: itemIds,
      items: itemIds.map((gid) => byId.get(gid)).filter(Boolean),
      weather_summary: String(body.weather_summary || ''),
      temp_c: body.temp_c ?? null,
      note: String(body.note || ''),
      offlinePending: shouldQueue,
    };
    const entries = await listCacheEntriesByPrefix('/calendar', isDemo, closetOwner);
    for (const row of entries) {
      const prev = Array.isArray(row.data?.logs) ? row.data.logs : [];
      await writeCachedResponse(row.key, { ...row.data, logs: [logRow, ...prev] });
    }
    if (entries.length === 0) {
      await writeCachedResponse(
        cachePrefixKey(`/calendar?closet=${encodeURIComponent(closetOwner)}`),
        { logs: [logRow] }
      );
    }
    return { ok: true, id, status, offlineQueued: shouldQueue };
  }

  // 3b. PATCH /calendar/:id
  if (/^\/calendar\/-?\d+$/.test(path) && upperMethod === 'PATCH') {
    const logId = Number(path.split('/')[2]);
    const nextStatus = String(body.status || 'worn');
    const entries = await listCacheEntriesByPrefix('/calendar', isDemo);
    for (const row of entries) {
      const prev = Array.isArray(row.data?.logs)
        ? (row.data.logs as Array<Record<string, unknown>>)
        : [];
      const nextLogs = prev.map((l) =>
        Number(l.id) === logId ? { ...l, status: nextStatus } : l
      );
      await writeCachedResponse(row.key, { ...row.data, logs: nextLogs });
    }
    return { ok: true, status: nextStatus, offlineQueued: shouldQueue };
  }

  // 3c. DELETE /calendar/:id
  if (/^\/calendar\/-?\d+$/.test(path) && upperMethod === 'DELETE') {
    const logId = Number(path.split('/')[2]);
    const entries = await listCacheEntriesByPrefix('/calendar', isDemo);
    for (const row of entries) {
      const prev = Array.isArray(row.data?.logs)
        ? (row.data.logs as Array<{ id: number }>)
        : [];
      await writeCachedResponse(row.key, {
        ...row.data,
        logs: prev.filter((l) => Number(l.id) !== logId),
      });
    }
    return { ok: true, offlineQueued: shouldQueue };
  }

  // 4. POST /packing-lists (Canonical PackingListItem schema: { key, garment_id, name, category, image_url, qty, checked })
  if (path === '/packing-lists' && upperMethod === 'POST') {
    const id = tempId!;
    const start = String(body.start_date || new Date().toISOString().slice(0, 10));
    const end = String(body.end_date || start);
    const owner = String(body.closet_owner || body.owner || (isDemo ? 'sample' : 'husband'));
    const destination = String(body.destination || '서울');

    let generatedItems: PackingListItem[] | null = Array.isArray(body.items)
      ? (body.items as PackingListItem[]).map((it, idx) => ({
          key: String(it.key || `item_${idx}`),
          garment_id: it.garment_id ?? null,
          name: String(it.name || it.label || '패킹 아이템'),
          label: String(it.label || it.name || '패킹 아이템'),
          category: String(it.category || 'essential'),
          image_url: it.image_url ?? null,
          qty: Number(it.qty) || 1,
          checked: Boolean(it.checked),
        }))
      : null;

    if (!generatedItems) {
      const garmentCaches = await listCacheEntriesByPrefix('/garments', isDemo, owner);
      const cachedGarments = garmentCaches
        .flatMap((c) => (Array.isArray(c.data?.garments) ? (c.data.garments as GarmentRecord[]) : []))
        .slice(0, 4);
      generatedItems = [
        ...cachedGarments.map((g, idx) => ({
          key: `g-${g.id || idx}`,
          garment_id: g.id ?? null,
          name: g.name,
          label: g.name,
          category: g.category,
          image_url: g.image_url || null,
          qty: 1,
          checked: false,
        })),
        {
          key: 'essential-pouch',
          garment_id: null,
          name: `${destination} 여행 워시 파우치 · 충전 키트`,
          label: `${destination} 여행 워시 파우치 · 충전 키트`,
          category: 'essential',
          image_url: null,
          qty: 1,
          checked: false,
        },
      ];
    }

    const newList: PackingListRecord = {
      id,
      closet_owner: owner,
      title: String(body.title || `${destination} 패킹 리스트`),
      destination,
      start_date: start,
      end_date: end,
      climate: String(body.climate || body.climate_hint || 'mild'),
      items: generatedItems,
      offlinePending: shouldQueue,
    };
    const entries = await listCacheEntriesByPrefix('/packing-lists', isDemo, owner);
    for (const row of entries) {
      const prev = Array.isArray(row.data?.lists) ? (row.data.lists as PackingListRecord[]) : [];
      await writeCachedResponse(row.key, { ...row.data, lists: [newList, ...prev] });
    }
    if (entries.length === 0) {
      await writeCachedResponse(
        cachePrefixKey(`/packing-lists?closet=${encodeURIComponent(owner)}`),
        { lists: [newList] }
      );
    }
    return { list: newList, offlineQueued: shouldQueue };
  }

  // 5. PATCH /packing-lists/:id
  if (/^\/packing-lists\/-?\d+$/.test(path) && upperMethod === 'PATCH') {
    const listId = Number(path.split('/')[2]);
    const entries = await listCacheEntriesByPrefix('/packing-lists', isDemo);
    let updatedItems: PackingListItem[] = [];
    for (const row of entries) {
      const prevLists = Array.isArray(row.data?.lists)
        ? (row.data.lists as PackingListRecord[])
        : [];
      const lists = prevLists.map((lst) => {
        if (Number(lst.id) !== listId) return lst;
        const nextItems = Array.isArray(body.items)
          ? (body.items as PackingListItem[])
          : (lst.items || []).map((it) =>
              it.key === body.toggleKey ? { ...it, checked: !it.checked } : it
            );
        updatedItems = nextItems;
        return { ...lst, items: nextItems };
      });
      await writeCachedResponse(row.key, { ...row.data, lists });
    }
    return { ok: true, items: updatedItems, offlineQueued: shouldQueue };
  }

  // 5b. DELETE /packing-lists/:id
  if (/^\/packing-lists\/-?\d+$/.test(path) && upperMethod === 'DELETE') {
    const listId = Number(path.split('/')[2]);
    const entries = await listCacheEntriesByPrefix('/packing-lists', isDemo);
    for (const row of entries) {
      const prevLists = Array.isArray(row.data?.lists)
        ? (row.data.lists as PackingListRecord[])
        : [];
      await writeCachedResponse(row.key, {
        ...row.data,
        lists: prevLists.filter((lst) => Number(lst.id) !== listId),
      });
    }
    return { ok: true, offlineQueued: shouldQueue };
  }

  // 6. POST /shopping/decision
  if (path === '/shopping/decision' && upperMethod === 'POST') {
    const checkId = Number(body.checkId);
    const decision = String(body.decision || 'undecided');
    const historyEntries = await listCacheEntriesByPrefix('/shopping/history', isDemo);
    for (const row of historyEntries) {
      const prev = Array.isArray(row.data?.history)
        ? (row.data.history as Array<Record<string, unknown>>)
        : [];
      await writeCachedResponse(row.key, {
        ...row.data,
        history: prev.map((c) => (Number(c.id) === checkId ? { ...c, decision } : c)),
      });
    }
    return { ok: true, createdGarment: null, offlineQueued: shouldQueue };
  }

  return { ok: true, offlineQueued: shouldQueue };
}

/**
 * Requirement 10.a: Immediate, complete local data purge upon account deletion.
 * Explicitly clears both object stores BEFORE closing & deleting the database so even if
 * `deleteDatabase` is temporarily blocked by another open handle, zero user data remains.
 */
export async function purgeAllLocalUserData(): Promise<void> {
  memoryUserScope = 'default';
  try {
    const idb = await openOfflineDb();
    if (idb) {
      await new Promise<void>((resolve) => {
        try {
          const tx = idb.transaction([STORE_CACHE, STORE_QUEUE], 'readwrite');
          tx.objectStore(STORE_CACHE).clear();
          tx.objectStore(STORE_QUEUE).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch {
          resolve();
        }
      });
      idb.close();
      dbPromise = null;
    }
    if (typeof indexedDB !== 'undefined') {
      await new Promise<void>((resolve) => {
        try {
          const delReq = indexedDB.deleteDatabase(DB_NAME);
          delReq.onsuccess = () => resolve();
          delReq.onerror = () => resolve();
          delReq.onblocked = () => resolve();
        } catch {
          resolve();
        }
      });
    }
  } catch {
    // ignore IndexedDB delete error
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('ainventory')) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }
  } catch {
    // ignore storage clear error
  }

  notifySyncListeners({ isOnline: true, queuedCount: 0, flushed: 0 });
}

export const getOfflineQueueCount = getQueuedMutationCount;
