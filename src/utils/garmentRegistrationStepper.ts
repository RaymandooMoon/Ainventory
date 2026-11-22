export type GarmentStepperStageId = 'front' | 'back' | 'label' | 'save';

export type GarmentStepperStageStatus = 'done' | 'active' | 'pending' | 'optional_ready';

export interface GarmentStepperStage {
  id: GarmentStepperStageId;
  index: number;
  label: string;
  shortLabel: string;
  required: boolean;
  status: GarmentStepperStageStatus;
}

export interface GarmentStepperState {
  canSave: boolean;
  requiredCapturedCount: number;
  requiredTotalCount: number;
  progressPct: number;
  missingRequirementText: string;
  stages: GarmentStepperStage[];
}

export interface GarmentStepperInput {
  hasFront: boolean;
  hasBack: boolean;
  hasNeckTag?: boolean;
  hasCareLabel?: boolean;
  hasOfficialSync?: boolean;
  currentFormStep?: number;
  lang?: 'ko' | 'en' | string;
}

export interface OfficialWebMatchLike {
  found?: boolean;
  confidence?: string;
  brand?: string;
  official_name?: string;
  product_code?: string;
  color_name?: string;
  material?: string;
  material_composition?: string;
  fit?: string;
  retail_price_krw?: number;
  purchase_store?: string;
  care_tip?: string;
  fit_summary?: string;
  official_source_url?: string;
  official_image_data?: string | null;
  image_fetch_blocked?: boolean;
  sources?: Array<{ uri: string; title: string }>;
}

export interface RegistrationCurrentValues {
  name?: string;
  brand?: string;
  productCode?: string;
  colorName?: string;
  material?: string;
  materialComposition?: string;
  fit?: string;
  price?: string | number;
  purchaseStore?: string;
  careTip?: string;
  fitNote?: string;
}

export type OfficialSyncFieldKey =
  | 'brand'
  | 'product_code'
  | 'official_name'
  | 'material_composition'
  | 'material'
  | 'color_name'
  | 'fit'
  | 'care_tip'
  | 'retail_price_krw'
  | 'purchase_store'
  | 'fit_summary';

export interface OfficialSyncFieldRow {
  key: OfficialSyncFieldKey;
  label: string;
  currentValue: string;
  officialValue: string;
  changed: boolean;
  defaultChecked: boolean;
}

export interface OfficialSyncPatch {
  name?: string;
  brand?: string;
  productCode?: string;
  colorName?: string;
  material?: string;
  materialComposition?: string;
  fit?: string;
  price?: string;
  purchaseStore?: string;
  careTip?: string;
  fitNote?: string;
  officialSourceUrl?: string;
}

export function buildGarmentRegistrationStepperState(
  input: GarmentStepperInput
): GarmentStepperState {
  const isEn = input.lang === 'en';
  const hasFront = Boolean(input.hasFront);
  const hasBack = Boolean(input.hasBack);
  const hasLabel = Boolean(input.hasNeckTag || input.hasCareLabel);
  const hasOfficialSync = Boolean(input.hasOfficialSync);
  const currentStep = Number(input.currentFormStep || 0);

  const requiredCapturedCount = (hasFront ? 1 : 0) + (hasBack ? 1 : 0);
  const requiredTotalCount = 2;
  const canSave = hasFront && hasBack;

  let progressPct = 0;
  if (hasFront) progressPct += 35;
  if (hasBack) progressPct += 35;
  if (hasLabel || hasOfficialSync) progressPct += 15;
  if (canSave && currentStep >= 1) {
    progressPct = Math.min(100, progressPct + (currentStep >= 3 ? 15 : 10));
  }
  if (canSave && currentStep >= 3 && (hasLabel || hasOfficialSync)) {
    progressPct = 100;
  }

  let missingRequirementText: string;
  if (!hasFront && !hasBack) {
    missingRequirementText = isEn
      ? 'Capture 1 front + 1 back photo to unlock Save.'
      : '앞면 1장 + 뒷면 1장을 모두 촬영해야 저장할 수 있어요.';
  } else if (!hasFront) {
    missingRequirementText = isEn
      ? '1 front photo is still required before saving.'
      : '앞면 사진 1장을 추가로 등록해야 저장할 수 있어요.';
  } else if (!hasBack) {
    missingRequirementText = isEn
      ? '1 back photo is still required before saving.'
      : '뒷면 사진 1장을 추가로 등록해야 저장할 수 있어요.';
  } else {
    missingRequirementText = isEn
      ? 'Front + back required photos complete · Ready to save'
      : '필수 앞·뒷면 2장 촬영 완료 · 저장 가능';
  }

  const frontStatus: GarmentStepperStageStatus = hasFront ? 'done' : 'active';
  const backStatus: GarmentStepperStageStatus = hasBack
    ? 'done'
    : hasFront
      ? 'active'
      : 'pending';
  const labelStatus: GarmentStepperStageStatus =
    hasOfficialSync || hasLabel
      ? 'done'
      : canSave && currentStep === 0
        ? 'optional_ready'
        : 'pending';
  const saveStatus: GarmentStepperStageStatus =
    canSave && currentStep >= 1
      ? 'active'
      : canSave
        ? 'optional_ready'
        : 'pending';

  const stages: GarmentStepperStage[] = [
    {
      id: 'front',
      index: 1,
      label: isEn ? 'Front Photo' : '앞면 촬영',
      shortLabel: isEn ? 'Front' : '앞면',
      required: true,
      status: frontStatus,
    },
    {
      id: 'back',
      index: 2,
      label: isEn ? 'Back Photo' : '뒷면 촬영',
      shortLabel: isEn ? 'Back' : '뒷면',
      required: true,
      status: backStatus,
    },
    {
      id: 'label',
      index: 3,
      label: isEn ? 'Care / Neck Tag' : '라벨·목탭',
      shortLabel: isEn ? 'Label' : '라벨·DB',
      required: false,
      status: labelStatus,
    },
    {
      id: 'save',
      index: 4,
      label: isEn ? 'Details & Save' : '상세·저장',
      shortLabel: isEn ? 'Save' : '저장',
      required: true,
      status: saveStatus,
    },
  ];

  return {
    canSave,
    requiredCapturedCount,
    requiredTotalCount,
    progressPct,
    missingRequirementText,
    stages,
  };
}

function formatKrwPrice(val: string | number | undefined): string {
  const num = Math.max(0, Math.round(Number(String(val ?? '').replace(/[^0-9]/g, '')) || 0));
  return num > 0 ? `₩${num.toLocaleString('ko-KR')}` : '';
}

export function buildOfficialSyncFields(
  webMatch: OfficialWebMatchLike | null | undefined,
  currentValues: RegistrationCurrentValues = {},
  lang: 'ko' | 'en' | string = 'ko'
): OfficialSyncFieldRow[] {
  if (!webMatch?.found) return [];
  const isEn = lang === 'en';

  const specs: Array<{
    key: OfficialSyncFieldKey;
    label: string;
    currentValue: string;
    officialValue: string;
  }> = [
    {
      key: 'brand',
      label: isEn ? 'Official Brand' : '공식 브랜드',
      currentValue: String(currentValues.brand || '').trim(),
      officialValue: String(webMatch.brand || '').trim(),
    },
    {
      key: 'product_code',
      label: isEn ? 'Style / SKU Code' : '품번 · 스타일 코드',
      currentValue: String(currentValues.productCode || '').trim(),
      officialValue: String(webMatch.product_code || '').trim(),
    },
    {
      key: 'official_name',
      label: isEn ? 'Official Product Name' : '공식 제품명',
      currentValue: String(currentValues.name || '').trim(),
      officialValue: String(webMatch.official_name || '').trim(),
    },
    {
      key: 'material_composition',
      label: isEn ? 'Fiber Composition' : '소재 혼용률',
      currentValue: String(currentValues.materialComposition || '').trim(),
      officialValue: String(webMatch.material_composition || '').trim(),
    },
    {
      key: 'material',
      label: isEn ? 'Primary Fabric' : '대표 소재',
      currentValue: String(currentValues.material || '').trim(),
      officialValue: String(webMatch.material || '').trim(),
    },
    {
      key: 'color_name',
      label: isEn ? 'Official Color' : '공식 컬러',
      currentValue: String(currentValues.colorName || '').trim(),
      officialValue: String(webMatch.color_name || '').trim(),
    },
    {
      key: 'fit',
      label: isEn ? 'Fit Silhouette' : '핏 실루엣',
      currentValue: String(currentValues.fit || '').trim(),
      officialValue: String(webMatch.fit || '').trim(),
    },
    {
      key: 'care_tip',
      label: isEn ? 'Care Instructions' : '세탁 · 관리 가이드',
      currentValue: String(currentValues.careTip || '').trim(),
      officialValue: String(webMatch.care_tip || '').trim(),
    },
    {
      key: 'retail_price_krw',
      label: isEn ? 'Official Retail Price' : '공식 정가',
      currentValue: formatKrwPrice(currentValues.price),
      officialValue: formatKrwPrice(webMatch.retail_price_krw),
    },
    {
      key: 'purchase_store',
      label: isEn ? 'Official Store' : '공식 판매처',
      currentValue: String(currentValues.purchaseStore || '').trim(),
      officialValue: String(webMatch.purchase_store || '').trim(),
    },
    {
      key: 'fit_summary',
      label: isEn ? 'Official Fit Note' : '공식 피팅 요약',
      currentValue: String(currentValues.fitNote || '').trim(),
      officialValue: String(webMatch.fit_summary || '').trim(),
    },
  ];

  return specs
    .filter((row) => row.officialValue.length > 0)
    .map((row) => {
      const changed = row.currentValue.toLowerCase() !== row.officialValue.toLowerCase();
      return {
        ...row,
        changed,
        defaultChecked: true,
      };
    });
}

export function applyOfficialSyncSelection(
  webMatch: OfficialWebMatchLike | null | undefined,
  selectedFieldKeys: Iterable<OfficialSyncFieldKey>,
  includePhoto: boolean
): {
  patch: OfficialSyncPatch;
  applyOfficialPhoto: boolean;
  appliedCount: number;
} {
  if (!webMatch?.found) {
    return { patch: {}, applyOfficialPhoto: false, appliedCount: 0 };
  }

  const selected = new Set(selectedFieldKeys);
  const patch: OfficialSyncPatch = {};
  let appliedCount = 0;

  if (selected.has('official_name') && webMatch.official_name) {
    patch.name = webMatch.official_name.trim();
    appliedCount += 1;
  }
  if (selected.has('brand') && webMatch.brand) {
    patch.brand = webMatch.brand.trim();
    appliedCount += 1;
  }
  if (selected.has('product_code') && webMatch.product_code) {
    patch.productCode = webMatch.product_code.trim();
    appliedCount += 1;
  }
  if (selected.has('color_name') && webMatch.color_name) {
    patch.colorName = webMatch.color_name.trim();
    appliedCount += 1;
  }
  if (selected.has('material') && webMatch.material) {
    patch.material = webMatch.material.trim();
    appliedCount += 1;
  }
  if (selected.has('material_composition') && webMatch.material_composition) {
    patch.materialComposition = webMatch.material_composition.trim();
    appliedCount += 1;
  }
  if (selected.has('fit') && webMatch.fit) {
    patch.fit = webMatch.fit.trim();
    appliedCount += 1;
  }
  if (selected.has('retail_price_krw') && Number(webMatch.retail_price_krw) > 0) {
    patch.price = String(Math.round(Number(webMatch.retail_price_krw)));
    appliedCount += 1;
  }
  if (selected.has('purchase_store') && webMatch.purchase_store) {
    patch.purchaseStore = webMatch.purchase_store.trim();
    appliedCount += 1;
  }
  if (selected.has('care_tip') && webMatch.care_tip) {
    patch.careTip = webMatch.care_tip.trim();
    appliedCount += 1;
  }
  if (selected.has('fit_summary') && webMatch.fit_summary) {
    patch.fitNote = webMatch.fit_summary.trim();
    appliedCount += 1;
  }
  if (webMatch.official_source_url) {
    patch.officialSourceUrl = webMatch.official_source_url.trim();
  }

  const applyOfficialPhoto = Boolean(includePhoto && webMatch.official_image_data);
  if (applyOfficialPhoto) {
    appliedCount += 1;
  }

  return {
    patch,
    applyOfficialPhoto,
    appliedCount,
  };
}
