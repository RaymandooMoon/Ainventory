import type { GarmentRecord, WearSlotKey } from '../contracts/carbonDesignContract.ts';
import type { FittingSlotAssignments } from './fittingRenderer.ts';

export type BodyShapeKey =
  | 'slim'
  | 'standard_balanced'
  | 'upper_developed'
  | 'lower_developed'
  | 'muscular';

export interface BodyMorphSpec {
  gender: 'male' | 'female';
  heightCm: number;
  weightKg: number;
  bodyShape: BodyShapeKey;
  shoulderScale: number;
  waistScale: number;
  hipScale: number;
}

export interface BodyShapePresetOption {
  key: BodyShapeKey;
  labelKo: string;
  labelEn: string;
}

export const BODY_SHAPE_OPTIONS: readonly BodyShapePresetOption[] = [
  { key: 'slim', labelKo: '슬림', labelEn: 'Slim' },
  { key: 'standard_balanced', labelKo: '표준', labelEn: 'Balanced' },
  { key: 'upper_developed', labelKo: '상체 발달', labelEn: 'Broad' },
  { key: 'lower_developed', labelKo: '하체 볼륨', labelEn: 'Curvy' },
  { key: 'muscular', labelKo: '탄탄·머슬', labelEn: 'Athletic' },
] as const;

export type CameraPresetKey = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export interface CameraViewPreset {
  key: CameraPresetKey;
  labelKo: string;
  labelEn: string;
  yawRad: number;
  polarRad: number;
  zoom: number;
}

export const CAMERA_VIEW_PRESETS: Record<CameraPresetKey, CameraViewPreset> = {
  front: { key: 'front', labelKo: '앞', labelEn: 'F', yawRad: 0, polarRad: 1.52, zoom: 0.98 },
  back: { key: 'back', labelKo: '뒤', labelEn: 'B', yawRad: Math.PI, polarRad: 1.52, zoom: 0.98 },
  left: { key: 'left', labelKo: '좌', labelEn: 'L', yawRad: -Math.PI / 2, polarRad: 1.52, zoom: 0.98 },
  right: { key: 'right', labelKo: '우', labelEn: 'R', yawRad: Math.PI / 2, polarRad: 1.52, zoom: 0.98 },
  top: { key: 'top', labelKo: '상', labelEn: 'Top', yawRad: 0, polarRad: 0.28, zoom: 0.88 },
  bottom: { key: 'bottom', labelKo: '하', labelEn: 'Bot', yawRad: 0, polarRad: 2.34, zoom: 0.92 },
};

const BODY_STORAGE_KEY = 'ainventory_body_spec_v1';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function normalizeBodyShape(raw?: string | null): BodyShapeKey {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === 'slim' || s === 'lean' || s === 'ectomorph_thin' || s === 'slim_lean') {
    return 'slim';
  }
  if (s === 'upper_developed' || s === 'inverted_triangle' || s === 'broad') {
    return 'upper_developed';
  }
  if (s === 'lower_developed' || s === 'pear' || s === 'curvy' || s === 'plus_curvy') {
    return 'lower_developed';
  }
  if (s === 'muscular' || s === 'athletic' || s === 'muscular_athletic' || s === 'athletic_muscular') {
    return 'muscular';
  }
  return 'standard_balanced';
}

export function getDefaultBodySpec(gender: 'male' | 'female' = 'male'): BodyMorphSpec {
  const isFemale = gender === 'female';
  return {
    gender: isFemale ? 'female' : 'male',
    heightCm: isFemale ? 164 : 176,
    weightKg: isFemale ? 52 : 70,
    bodyShape: 'standard_balanced',
    shoulderScale: 1,
    waistScale: 1,
    hipScale: 1,
  };
}

export function sanitizeBodySpec(partial?: Partial<BodyMorphSpec> | null): BodyMorphSpec {
  const gender: 'male' | 'female' = partial?.gender === 'female' ? 'female' : 'male';
  const def = getDefaultBodySpec(gender);
  const h = Number(partial?.heightCm);
  const w = Number(partial?.weightKg);
  const sh = Number(partial?.shoulderScale);
  const wa = Number(partial?.waistScale);
  const hi = Number(partial?.hipScale);

  return {
    gender,
    heightCm: Number.isFinite(h) && h > 0 ? clamp(Math.round(h), 145, 200) : def.heightCm,
    weightKg: Number.isFinite(w) && w > 0 ? clamp(Math.round(w), 38, 130) : def.weightKg,
    bodyShape: normalizeBodyShape(partial?.bodyShape),
    shoulderScale: Number.isFinite(sh) && sh > 0 ? clamp(Number(sh.toFixed(2)), 0.85, 1.2) : 1,
    waistScale: Number.isFinite(wa) && wa > 0 ? clamp(Number(wa.toFixed(2)), 0.82, 1.25) : 1,
    hipScale: Number.isFinite(hi) && hi > 0 ? clamp(Number(hi.toFixed(2)), 0.85, 1.22) : 1,
  };
}

export function getStoredBodySpec(): BodyMorphSpec {
  if (typeof window === 'undefined') return getDefaultBodySpec('male');
  try {
    const raw = window.localStorage.getItem(BODY_STORAGE_KEY);
    if (!raw) return getDefaultBodySpec('male');
    return sanitizeBodySpec(JSON.parse(raw) as Partial<BodyMorphSpec>);
  } catch {
    return getDefaultBodySpec('male');
  }
}

export function saveStoredBodySpec(spec: Partial<BodyMorphSpec>): BodyMorphSpec {
  const clean = sanitizeBodySpec(spec);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(BODY_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // ignore storage quota
    }
  }
  return clean;
}

export function deriveBodySpecFromUser(
  user?: {
    gender?: string | null;
    heightCm?: number | null;
    weightKg?: number | null;
    bodyShape?: string | null;
    isSampleDemo?: boolean;
  } | null,
  current?: BodyMorphSpec | null
): BodyMorphSpec {
  const base = current || getStoredBodySpec();
  if (!user || user.isSampleDemo) {
    return sanitizeBodySpec(base);
  }
  const accountGender: 'male' | 'female' =
    user.gender === 'female' ? 'female' : user.gender === 'male' ? 'male' : base.gender;
  const def = getDefaultBodySpec(accountGender);
  return sanitizeBodySpec({
    ...base,
    gender: accountGender,
    heightCm: user.heightCm ?? (base.gender === accountGender ? base.heightCm : def.heightCm),
    weightKg: user.weightKg ?? (base.gender === accountGender ? base.weightKg : def.weightKg),
    bodyShape: user.bodyShape ? normalizeBodyShape(user.bodyShape) : base.bodyShape,
  });
}

/**
 * Maps the 5-pill Studio UI slot state (`outer`, `top`, `bottom`, `shoes`, `accessory`)
 * onto the 11-slot MakeHuman 3D character garment architecture (`headwear`, `neckwear`,
 * `outer`, `top`, `dress`, `bottom`, `gloves`, `socks`, `shoes`, `accessory`).
 */
export function mapStudioSlotsTo3DLoadout(
  slots?: Partial<FittingSlotAssignments> | null
): Partial<Record<WearSlotKey, Partial<GarmentRecord> | null>> {
  const loadout: Partial<Record<WearSlotKey, Partial<GarmentRecord> | null>> = {};
  if (!slots) return loadout;

  if (slots.outer) {
    loadout.outer = slots.outer;
  }

  if (slots.top) {
    const cat = String(slots.top.category || '').toLowerCase();
    const sub = String(slots.top.subcategory || '').toLowerCase();
    const name = String(slots.top.name || '');
    const isDress =
      cat === 'onepiece' ||
      cat === 'dress' ||
      sub === 'onepiece' ||
      sub === 'dress' ||
      /원피스|드레스|onepiece|dress/i.test(name);
    if (isDress) {
      loadout.dress = slots.top;
    } else {
      loadout.top = slots.top;
    }
  }

  if (slots.bottom && !loadout.dress) {
    loadout.bottom = slots.bottom;
  }

  if (slots.shoes) {
    loadout.shoes = slots.shoes;
  }

  if (slots.accessory) {
    const sub = String(slots.accessory.subcategory || '').toLowerCase();
    const name = String(slots.accessory.name || '');
    const explicitSlot = String(slots.accessory.slot_key || '').toLowerCase();

    if (
      explicitSlot === 'neckwear' ||
      sub === 'scarf' ||
      sub === 'muffler' ||
      sub === 'necktie' ||
      /머플러|스카프|넥타이|타이|muffler|scarf|necktie/i.test(name)
    ) {
      loadout.neckwear = slots.accessory;
    } else if (
      explicitSlot === 'headwear' ||
      sub === 'cap' ||
      sub === 'beanie' ||
      sub === 'beret' ||
      sub === 'bucket_hat' ||
      sub === 'hat' ||
      /볼캡|캡모자|비니|베레|버킷햇|페도라|모자|beanie|beret|fedora|cap/i.test(name)
    ) {
      loadout.headwear = slots.accessory;
    } else if (
      explicitSlot === 'gloves' ||
      sub === 'gloves' ||
      sub === 'leather_gloves' ||
      /장갑|글러브|glove/i.test(name)
    ) {
      loadout.gloves = slots.accessory;
    } else if (
      explicitSlot === 'socks' ||
      sub === 'socks' ||
      /양말|삭스|sock/i.test(name)
    ) {
      loadout.socks = slots.accessory;
    } else {
      loadout.accessory = slots.accessory;
    }
  }

  return loadout;
}
