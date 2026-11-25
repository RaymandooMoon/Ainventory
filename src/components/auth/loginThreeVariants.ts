export type LoginThreeVariantId = 'luxury' | 'aurora';

export interface LoginThreeVariantMeta {
  id: LoginThreeVariantId;
  num: string;
  labelKo: string;
  labelEn: string;
  shortKo: string;
  shortEn: string;
}

export const LOGIN_THREE_VARIANTS: readonly LoginThreeVariantMeta[] = [
  {
    id: 'luxury',
    num: 'A',
    labelKo: '럭셔리 유체',
    labelEn: 'Luxury Fluid',
    shortKo: '럭셔리',
    shortEn: 'Luxury',
  },
  {
    id: 'aurora',
    num: 'B',
    labelKo: '오로라 프리즘',
    labelEn: 'Aurora Prism',
    shortKo: '오로라',
    shortEn: 'Aurora',
  },
];

export const DEFAULT_LOGIN_THREE_VARIANT: LoginThreeVariantId = 'luxury';

export function normalizeLoginThreeVariant(raw?: string | null): LoginThreeVariantId {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'aurora' || v === 'b' || v === '2' || v === 'prism') return 'aurora';
  return 'luxury';
}

export function getLoginThreeVariantMeta(id: LoginThreeVariantId): LoginThreeVariantMeta {
  return LOGIN_THREE_VARIANTS.find((v) => v.id === id) ?? LOGIN_THREE_VARIANTS[0];
}

export function cycleLoginThreeVariant(current: LoginThreeVariantId): LoginThreeVariantId {
  const idx = LOGIN_THREE_VARIANTS.findIndex((v) => v.id === current);
  if (idx < 0) return DEFAULT_LOGIN_THREE_VARIANT;
  return LOGIN_THREE_VARIANTS[(idx + 1) % LOGIN_THREE_VARIANTS.length].id;
}
