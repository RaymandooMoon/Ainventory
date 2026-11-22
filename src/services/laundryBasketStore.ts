export const LAUNDRY_BASKET_EVENT = 'ainventory:laundry-basket-changed';
const STORAGE_KEY = 'ainventory_laundry_basket_v1';

export interface LaundryBasketState {
  garmentIds: number[];
  lastWashedByGarmentId: Record<string, string>;
}

const DEFAULT_STATE: LaundryBasketState = {
  garmentIds: [],
  lastWashedByGarmentId: {},
};

function sanitizeState(raw: unknown): LaundryBasketState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STATE };
  const obj = raw as Record<string, unknown>;
  const ids = Array.isArray(obj.garmentIds)
    ? Array.from(
        new Set(
          obj.garmentIds
            .map((v) => Number(v))
            .filter((n) => Number.isFinite(n) && n !== 0)
        )
      )
    : [];
  const lastWashed: Record<string, string> = {};
  if (obj.lastWashedByGarmentId && typeof obj.lastWashedByGarmentId === 'object') {
    for (const [k, v] of Object.entries(obj.lastWashedByGarmentId as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length >= 8) {
        lastWashed[k] = v;
      }
    }
  }
  return {
    garmentIds: ids,
    lastWashedByGarmentId: lastWashed,
  };
}

export function loadLaundryBasket(): LaundryBasketState {
  if (typeof window === 'undefined') return { ...DEFAULT_STATE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return sanitizeState(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function persistLaundryBasket(next: LaundryBasketState): LaundryBasketState {
  const clean = sanitizeState(next);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // ignore storage quota
    }
    window.dispatchEvent(new CustomEvent(LAUNDRY_BASKET_EVENT, { detail: clean }));
  }
  return clean;
}

export function toggleLaundryBasketItem(garmentId: number): {
  state: LaundryBasketState;
  added: boolean;
} {
  const id = Number(garmentId);
  const current = loadLaundryBasket();
  if (!Number.isFinite(id)) return { state: current, added: false };
  const exists = current.garmentIds.includes(id);
  const nextIds = exists
    ? current.garmentIds.filter((x) => x !== id)
    : [...current.garmentIds, id];
  const state = persistLaundryBasket({
    ...current,
    garmentIds: nextIds,
  });
  return { state, added: !exists };
}

export function addManyToLaundryBasket(garmentIds: number[]): {
  state: LaundryBasketState;
  addedCount: number;
} {
  const current = loadLaundryBasket();
  const existing = new Set(current.garmentIds);
  let addedCount = 0;
  const nextIds = [...current.garmentIds];
  for (const rawId of garmentIds) {
    const id = Number(rawId);
    if (!Number.isFinite(id) || existing.has(id)) continue;
    existing.add(id);
    nextIds.push(id);
    addedCount += 1;
  }
  const state = persistLaundryBasket({
    ...current,
    garmentIds: nextIds,
  });
  return { state, addedCount };
}

export function removeFromLaundryBasket(garmentId: number): LaundryBasketState {
  const id = Number(garmentId);
  const current = loadLaundryBasket();
  return persistLaundryBasket({
    ...current,
    garmentIds: current.garmentIds.filter((x) => x !== id),
  });
}

export function markLaundryItemsWashed(garmentIds: number[]): LaundryBasketState {
  const current = loadLaundryBasket();
  const removeSet = new Set(garmentIds.map((v) => Number(v)).filter((n) => Number.isFinite(n)));
  const nowIso = new Date().toISOString().slice(0, 10);
  const nextWashed = { ...current.lastWashedByGarmentId };
  for (const id of removeSet) {
    nextWashed[String(id)] = nowIso;
  }
  return persistLaundryBasket({
    garmentIds: current.garmentIds.filter((id) => !removeSet.has(id)),
    lastWashedByGarmentId: nextWashed,
  });
}

export function clearLaundryBasket(): LaundryBasketState {
  const current = loadLaundryBasket();
  return persistLaundryBasket({
    ...current,
    garmentIds: [],
  });
}
