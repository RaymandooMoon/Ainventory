/**
 * Offline-First IndexedDB Cache & Cloud Sync Queue (Requirement 8.b & 10.a)
 * - Mirrors GET responses into IndexedDB (`ainventory_offline_v1`)
 * - Serves cached wardrobe, outfits, weather, calendar, analytics & packing lists when offline
 * - Queues offline mutations (`mutation_queue`) and flushes automatically upon reconnection
 * - Provides atomic `purgeAllLocalUserData()` for App Store / Play Store immediate account deletion
 */

const DB_NAME = 'ainventory_offline_v1';
const DB_VERSION = 1;
const STORE_CACHE = 'kv_cache';
const STORE_QUEUE = 'mutation_queue';

let dbPromise = null;
const syncListeners = new Set();

function notifySyncListeners(state) {
  for (const fn of syncListeners) {
    try {
      fn(state);
    } catch {
      // ignore listener error
    }
  }
}

export function subscribeOfflineSync(listener) {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

function openOfflineDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
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
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function readCachedResponse(key) {
  const idb = await openOfflineDb();
  if (!idb) return null;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(STORE_CACHE, 'readonly');
      const req = tx.objectStore(STORE_CACHE).get(key);
      req.onsuccess = () => resolve(req.result?.data ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeCachedResponse(key, data) {
  const idb = await openOfflineDb();
  if (!idb) return;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(STORE_CACHE, 'readwrite');
      tx.objectStore(STORE_CACHE).put({ key, data, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function listCacheEntriesByPrefix(prefix) {
  const idb = await openOfflineDb();
  if (!idb) return [];
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(STORE_CACHE, 'readonly');
      const req = tx.objectStore(STORE_CACHE).getAll();
      req.onsuccess = () => {
        const all = Array.isArray(req.result) ? req.result : [];
        resolve(
          all.filter((row) => {
            const k = String(row.key || '');
            return k.startsWith(prefix) || k.startsWith(`demo:${prefix}`);
          })
        );
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function enqueueOfflineMutation(entry) {
  const idb = await openOfflineDb();
  if (!idb) return;
  await new Promise((resolve) => {
    try {
      const tx = idb.transaction(STORE_QUEUE, 'readwrite');
      tx.objectStore(STORE_QUEUE).add({ ...entry, createdAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
  const count = await getQueuedMutationCount();
  notifySyncListeners({ isOnline: navigator.onLine, queuedCount: count });
}

export async function getQueuedMutationCount() {
  const idb = await openOfflineDb();
  if (!idb) return 0;
  return new Promise((resolve) => {
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

let flushing = false;
export async function flushOfflineQueue(sendFn) {
  if (flushing || (typeof navigator !== 'undefined' && !navigator.onLine)) return 0;
  const idb = await openOfflineDb();
  if (!idb) return 0;

  flushing = true;
  let flushed = 0;
  try {
    const items = await new Promise((resolve) => {
      const tx = idb.transaction(STORE_QUEUE, 'readonly');
      const req = tx.objectStore(STORE_QUEUE).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    });

    for (const item of items) {
      try {
        await sendFn(item.path, {
          method: item.method,
          body: item.body ? JSON.stringify(item.body) : undefined,
        });
        await new Promise((resolve) => {
          const tx = idb.transaction(STORE_QUEUE, 'readwrite');
          tx.objectStore(STORE_QUEUE).delete(item.id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        });
        flushed += 1;
      } catch {
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

/**
 * Optimistically updates local IndexedDB cache when offline or in Guest Sample Demo mode
 * so wardrobe browsing, garment registration, outfit creation, and packing toggles work offline!
 */
export async function applyOptimisticLocalMutation(path, method, rawBody, shouldQueue = true) {
  let body = {};
  if (typeof rawBody === 'string') {
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = {};
    }
  } else if (rawBody && typeof rawBody === 'object') {
    body = rawBody;
  }

  if (shouldQueue) {
    await enqueueOfflineMutation({ path, method, body });
  }

  const tempId = -Math.floor(Date.now() % 100000000);

  // 1. POST /garments
  if (path === '/garments' && method === 'POST') {
    const fakeGarment = {
      id: tempId,
      closet_owner: body.closet_owner || 'husband',
      name: body.name || '오프라인 등록 의류',
      category: body.category || 'top',
      subcategory: body.subcategory || 'knit',
      fabric: body.fabric || 'cotton',
      color_name: body.color_name || '블랙',
      color_hex: body.color_hex || '#1D1D1F',
      seasons: body.seasons || ['봄', '가을'],
      min_temp: body.min_temp ?? 8,
      max_temp: body.max_temp ?? 20,
      water_resistant: Boolean(body.water_resistant),
      formality: body.formality || 'smart',
      brand: body.brand || '',
      price: Number(body.price) || 0,
      wear_count: Number(body.wear_count) || 0,
      cpw: Number(body.price) || 0,
      is_favorite: false,
      status: 'active',
      image_url: body.image_data || body.image_url || '/seed/cream-knit.jpg',
      slot_key: body.slot_key || body.category || 'top',
      base_glb: body.base_glb || 'top_knit',
      physics_preset: body.physics_preset || 'rigid_fitted',
      custom_texture: Boolean(body.image_data),
      offlinePending: shouldQueue,
    };

    const entries = await listCacheEntriesByPrefix('/garments');
    for (const row of entries) {
      const prev = Array.isArray(row.data?.garments) ? row.data.garments : [];
      await writeCachedResponse(row.key, {
        ...row.data,
        garments: [fakeGarment, ...prev],
      });
    }
    if (entries.length === 0) {
      await writeCachedResponse(
        `/garments?closet=${encodeURIComponent(fakeGarment.closet_owner)}`,
        { garments: [fakeGarment] }
      );
    }
    return { garment: fakeGarment, offlineQueued: shouldQueue };
  }

  // 2. POST /outfits
  if (path === '/outfits' && method === 'POST') {
    const garmentCaches = await listCacheEntriesByPrefix('/garments');
    const allItems = garmentCaches.flatMap((c) => c.data?.garments || []);
    const byId = new Map(allItems.map((g) => [Number(g.id), g]));
    const newOutfit = {
      id: tempId,
      closet_owner: body.closet_owner || 'husband',
      title: body.title || '오프라인 코디',
      occasion: body.occasion || '데일리',
      season: body.season || '사계절',
      item_ids: (body.item_ids || []).map(Number),
      items: (body.item_ids || []).map((id) => byId.get(Number(id))).filter(Boolean),
      memo: body.memo || '',
      wear_count: 0,
      offlinePending: shouldQueue,
    };
    const entries = await listCacheEntriesByPrefix('/outfits');
    for (const row of entries) {
      const prev = Array.isArray(row.data?.outfits) ? row.data.outfits : [];
      await writeCachedResponse(row.key, { outfits: [newOutfit, ...prev] });
    }
    if (entries.length === 0) {
      await writeCachedResponse(
        `/outfits?closet=${encodeURIComponent(newOutfit.closet_owner)}`,
        { outfits: [newOutfit] }
      );
    }
    return { id: tempId, outfit: newOutfit, offlineQueued: shouldQueue };
  }

  // 3. POST /calendar
  if (path === '/calendar' && method === 'POST') {
    const todayStr = new Date().toISOString().slice(0, 10);
    const wornDate = body.worn_date || todayStr;
    const status = body.status || (wornDate > todayStr ? 'planned' : 'worn');
    const garmentCaches = await listCacheEntriesByPrefix('/garments');
    const allItems = garmentCaches.flatMap((c) => c.data?.garments || []);
    const byId = new Map(allItems.map((g) => [Number(g.id), g]));
    const logRow = {
      id: tempId,
      closet_owner: body.closet_owner || 'husband',
      worn_date: wornDate,
      status,
      item_ids: (body.item_ids || []).map(Number),
      items: (body.item_ids || []).map((id) => byId.get(Number(id))).filter(Boolean),
      weather_summary: body.weather_summary || '',
      temp_c: body.temp_c ?? null,
      note: body.note || '',
    };
    const entries = await listCacheEntriesByPrefix('/calendar');
    for (const row of entries) {
      const prev = Array.isArray(row.data?.logs) ? row.data.logs : [];
      await writeCachedResponse(row.key, { logs: [logRow, ...prev] });
    }
    return { ok: true, id: tempId, status, offlineQueued: shouldQueue };
  }

  // 4. POST /packing-lists
  if (path === '/packing-lists' && method === 'POST') {
    const start = body.start_date || new Date().toISOString().slice(0, 10);
    const end = body.end_date || start;
    const owner = body.closet_owner || body.owner || 'husband';
    let generatedItems = Array.isArray(body.items) ? body.items : null;
    if (!generatedItems) {
      const garmentCaches = await listCacheEntriesByPrefix('/garments');
      const cachedGarments = garmentCaches.flatMap((c) => c.data?.garments || []).slice(0, 4);
      generatedItems = [
        ...cachedGarments.map((g, idx) => ({
          key: `garment_${g.id || idx}`,
          label: g.name,
          category: g.category,
          qty: 1,
          checked: false,
        })),
        { key: 'essential_pouch', label: '워시 파우치 · 충전기 어댑터', category: 'essential', qty: 1, checked: false },
        { key: 'essential_inner', label: '여분 언더웨어 · 양말 세트', category: 'underwear', qty: 2, checked: false },
      ];
    }
    const newList = {
      id: tempId,
      closet_owner: owner,
      title: body.title || `${body.destination || '여행'} 패킹 리스트`,
      destination: body.destination || '서울',
      start_date: start,
      end_date: end,
      climate: body.climate || body.climate_hint || 'mild',
      items: generatedItems,
      offlinePending: shouldQueue,
    };
    const entries = await listCacheEntriesByPrefix('/packing-lists');
    for (const row of entries) {
      const prev = Array.isArray(row.data?.lists) ? row.data.lists : [];
      await writeCachedResponse(row.key, { lists: [newList, ...prev] });
    }
    if (entries.length === 0) {
      const key = shouldQueue
        ? `/packing-lists?closet=${encodeURIComponent(newList.closet_owner)}`
        : `demo:/packing-lists?closet=${encodeURIComponent(newList.closet_owner)}`;
      await writeCachedResponse(key, { lists: [newList] });
    }
    return { list: newList, offlineQueued: shouldQueue };
  }

  // 5. PATCH /packing-lists/:id
  if (path.startsWith('/packing-lists/') && method === 'PATCH') {
    const listId = Number(path.split('/')[2]);
    const entries = await listCacheEntriesByPrefix('/packing-lists');
    let updatedItems = [];
    for (const row of entries) {
      const lists = (row.data?.lists || []).map((lst) => {
        if (Number(lst.id) !== listId) return lst;
        const nextItems = Array.isArray(body.items)
          ? body.items
          : (lst.items || []).map((it) =>
              it.key === body.toggleKey ? { ...it, checked: !it.checked } : it
            );
        updatedItems = nextItems;
        return { ...lst, items: nextItems };
      });
      await writeCachedResponse(row.key, { lists });
    }
    return { ok: true, items: updatedItems, offlineQueued: shouldQueue };
  }

  return { ok: true, offlineQueued: shouldQueue };
}

/**
 * Requirement 10.a: Immediate, complete local data purge upon account deletion
 */
export async function purgeAllLocalUserData() {
  try {
    const idb = await openOfflineDb();
    if (idb) {
      idb.close();
      dbPromise = null;
    }
    if (typeof indexedDB !== 'undefined') {
      await new Promise((resolve) => {
        const delReq = indexedDB.deleteDatabase(DB_NAME);
        delReq.onsuccess = () => resolve();
        delReq.onerror = () => resolve();
        delReq.onblocked = () => resolve();
      });
    }
  } catch {
    // ignore IndexedDB delete error
  }

  try {
    if (typeof localStorage !== 'undefined') {
      const keysToRemove = [];
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
}
export const getOfflineQueueCount = getQueuedMutationCount;
