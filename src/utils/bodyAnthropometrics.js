/**
 * 7 Anatomical Body Shapes + Three-Sizes / Head Circumference / Body Fat % Resolver
 * Shared between Client (3D Mannequin & Profile Modal) and Server (Engine & API)
 */

export const BODY_SHAPES = [
  {
    key: 'ectomorph_thin',
    labelKo: '슬림 · 깡마른 체형',
    labelEn: 'Ectomorph · Ultra Slim',
    shortKo: '깡마른형',
    badge: 'SLIM FRAME',
    summaryKo: '골격과 사지가 가늘고 체지방·근육 볼륨이 모두 낮은 슬림 실루엣',
    stylingAdviceKo: '레이어드 니트·케이블 조직·더블 브레스티드 자켓으로 상체 볼륨감을 보완하고 세미 와이드 팬츠로 안정감을 주세요.',
    defaultBodyFatMale: 10.5,
    defaultBodyFatFemale: 17.5,
    morph: {
      shoulderScale: 0.90,
      chestScale: 0.87,
      waistScale: 0.84,
      bellyDepth: 0.82,
      hipScale: 0.88,
      thighScale: 0.84,
      calfScale: 0.86,
      armScale: 0.83,
      neckScale: 0.88,
    },
  },
  {
    key: 'skinny_fat',
    labelKo: '마른 비만형 (복부 집중)',
    labelEn: 'Skinny-Fat · Central Soft',
    shortKo: '마른 비만형',
    badge: 'CENTRAL SOFT',
    summaryKo: '팔다리는 가는 편이나 체지방률이 상대적으로 높고 복부·허리 둘레에 볼륨이 모이는 체형',
    stylingAdviceKo: '복부 실루엣이 드러나는 얇은 저지 소재보다 탄탄한 개버딘·울 소재 아우터나 구조적인 셔츠/가디건 오픈 레이어드가 유리합니다.',
    defaultBodyFatMale: 23.5,
    defaultBodyFatFemale: 30.0,
    morph: {
      shoulderScale: 0.93,
      chestScale: 0.96,
      waistScale: 1.12,
      bellyDepth: 1.24,
      hipScale: 0.98,
      thighScale: 0.90,
      calfScale: 0.89,
      armScale: 0.88,
      neckScale: 0.96,
    },
  },
  {
    key: 'standard_balanced',
    labelKo: '표준 밸런스 체형',
    labelEn: 'Standard Balanced',
    shortKo: '표준 밸런스형',
    badge: 'BALANCED',
    summaryKo: '어깨·가슴·허리·골반 비율이 고르게 균형 잡힌 스탠다드 실루엣',
    stylingAdviceKo: '정핏 테일러드 블레이저부터 세미 오버핏 캐주얼까지 폭넓게 소화하며, 상·하의 3:7 비율 연출 시 가장 이상적입니다.',
    defaultBodyFatMale: 16.5,
    defaultBodyFatFemale: 23.5,
    morph: {
      shoulderScale: 1.0,
      chestScale: 1.0,
      waistScale: 1.0,
      bellyDepth: 1.0,
      hipScale: 1.0,
      thighScale: 1.0,
      calfScale: 1.0,
      armScale: 1.0,
      neckScale: 1.0,
    },
  },
  {
    key: 'upper_developed',
    labelKo: '상체 발달형 (역삼각/흉곽 발달)',
    labelEn: 'Upper-Body Developed · Inverted V',
    shortKo: '상체 발달형',
    badge: 'UPPER FRAME',
    summaryKo: '어깨 너비와 가슴(흉곽) 둘레가 발달하고 하체는 상대적으로 슬림한 체형',
    stylingAdviceKo: '어깨 패드가 과한 상의는 피하고 래글런 코트나 브이넥 니트로 시선을 분산하며, 하의는 스트레이트·와이드 핏으로 상하 밸런스를 맞추세요.',
    defaultBodyFatMale: 15.0,
    defaultBodyFatFemale: 22.0,
    morph: {
      shoulderScale: 1.14,
      chestScale: 1.12,
      waistScale: 0.95,
      bellyDepth: 0.94,
      hipScale: 0.94,
      thighScale: 0.95,
      calfScale: 0.95,
      armScale: 1.09,
      neckScale: 1.05,
    },
  },
  {
    key: 'lower_developed',
    labelKo: '하체 발달형 (골반/허벅지 발달)',
    labelEn: 'Lower-Body Developed · Pear/Grounded',
    shortKo: '하체 발달형',
    badge: 'LOWER FRAME',
    summaryKo: '상체·허리는 날씬한 반면 엉덩이(골반)와 허벅지 볼륨이 탄탄하게 발달한 체형',
    stylingAdviceKo: '원턱 와이드 슬랙스나 A라인 롱 스커트/코트로 힙·허벅지 라인을 자연스럽게 흐르게 하고, 상의나 네크웨어에 밝은 퍼스널컬러 포인트를 주세요.',
    defaultBodyFatMale: 17.5,
    defaultBodyFatFemale: 25.0,
    morph: {
      shoulderScale: 0.95,
      chestScale: 0.95,
      waistScale: 0.96,
      bellyDepth: 0.95,
      hipScale: 1.14,
      thighScale: 1.16,
      calfScale: 1.08,
      armScale: 0.95,
      neckScale: 0.96,
    },
  },
  {
    key: 'muscular_athletic',
    labelKo: '근육질 · 애슬레틱 체형',
    labelEn: 'Muscular Athletic · Mesomorph',
    shortKo: '근육질 애슬레틱형',
    badge: 'ATHLETIC PRO',
    summaryKo: '넓은 어깨와 두터운 흉근·광배근·대퇴부를 갖추고 허리가 단단하게 잡힌 고근량 체형',
    stylingAdviceKo: '신축성 있는 파인 메리노 울·실크 혼방 니트와 여유 있는 테이퍼드/와이드 팬츠가 활동성과 고급스러운 실루엣을 동시에 살려줍니다.',
    defaultBodyFatMale: 12.0,
    defaultBodyFatFemale: 18.5,
    morph: {
      shoulderScale: 1.18,
      chestScale: 1.15,
      waistScale: 0.91,
      bellyDepth: 0.88,
      hipScale: 1.04,
      thighScale: 1.13,
      calfScale: 1.09,
      armScale: 1.16,
      neckScale: 1.08,
    },
  },
  {
    key: 'plus_curvy',
    labelKo: '글래머 · 볼륨 체형',
    labelEn: 'Full Volume · Plus / Curvy',
    shortKo: '볼륨·플러사이즈형',
    badge: 'FULL VOLUME',
    summaryKo: '가슴·허리·힙 전반에 풍부한 볼륨감과 중후한 존재감을 지닌 체형',
    stylingAdviceKo: '수직 라인을 강조하는 롱 트렌치/싱글 코트와 톤온톤 이너 매치로 시선을 위아래로 길게 연결하면 세련된 실루엣이 완성됩니다.',
    defaultBodyFatMale: 26.5,
    defaultBodyFatFemale: 32.5,
    morph: {
      shoulderScale: 1.09,
      chestScale: 1.16,
      waistScale: 1.18,
      bellyDepth: 1.22,
      hipScale: 1.16,
      thighScale: 1.15,
      calfScale: 1.10,
      armScale: 1.13,
      neckScale: 1.08,
    },
  },
];

export const BODY_SHAPE_MAP = Object.fromEntries(BODY_SHAPES.map((b) => [b.key, b]));

export function recommendBodyShapeFromMetrics({
  heightCm = 172,
  weightKg = 66,
  gender = 'unspecified',
  bodyFatPct = null,
  chestCm = null,
  waistCm = null,
  hipCm = null,
} = {}) {
  const h = Math.max(130, Math.min(215, Number(heightCm) || 172));
  const w = Math.max(32, Math.min(160, Number(weightKg) || 66));
  const bmi = w / ((h / 100) ** 2);
  const isFemale = gender === 'female';
  const bf = bodyFatPct !== null && bodyFatPct !== '' && !Number.isNaN(Number(bodyFatPct))
    ? Number(bodyFatPct)
    : null;

  // If 3-sizes are provided, use waist-to-chest and hip-to-chest ratios first
  const cVal = Number(chestCm) || 0;
  const wVal = Number(waistCm) || 0;
  const hVal = Number(hipCm) || 0;

  if (cVal > 50 && wVal > 40 && hVal > 50) {
    const waistToChest = wVal / cVal;
    const hipToChest = hVal / cVal;
    if (waistToChest >= 0.90 && bmi < 25.5) return 'skinny_fat';
    if (hipToChest >= 1.07 && waistToChest < 0.84) return 'lower_developed';
    if (cVal / hVal >= 1.08 && waistToChest <= 0.80) {
      return bf !== null && bf <= (isFemale ? 20 : 13.5) ? 'muscular_athletic' : 'upper_developed';
    }
  }

  if (bf !== null) {
    const highBfThreshold = isFemale ? 28.5 : 21.5;
    const lowBfThreshold = isFemale ? 19.5 : 13.0;
    if (bmi < 23.8 && bf >= highBfThreshold) {
      return 'skinny_fat';
    }
    if (bmi >= 22.0 && bf <= lowBfThreshold) {
      return 'muscular_athletic';
    }
  }

  if (bmi < 18.8) return 'ectomorph_thin';
  if (bmi >= 26.2) return 'plus_curvy';
  if (bmi >= 23.6) return isFemale ? 'lower_developed' : 'upper_developed';
  return 'standard_balanced';
}

export function resolveAnatomicalProfile(rawProfile = {}) {
  const gender = rawProfile.gender || 'unspecified';
  const isFemale = gender === 'female';
  const isMale = gender === 'male';

  const defaultHeight = isFemale ? 163 : isMale ? 175 : 169;
  const defaultWeight = isFemale ? 54 : isMale ? 70 : 62;

  const heightCm = Math.max(
    135,
    Math.min(210, Number(rawProfile.height_cm ?? rawProfile.heightCm) || defaultHeight)
  );
  const weightKg = Math.max(
    35,
    Math.min(155, Number(rawProfile.weight_kg ?? rawProfile.weightKg) || defaultWeight)
  );

  const bmi = Number((weightKg / ((heightCm / 100) ** 2)).toFixed(1));
  const rawShape = rawProfile.body_shape ?? rawProfile.bodyShape;
  const recommendedShape = recommendBodyShapeFromMetrics({
    heightCm,
    weightKg,
    gender,
    bodyFatPct: rawProfile.body_fat_pct ?? rawProfile.bodyFatPct,
    chestCm: rawProfile.chest_cm ?? rawProfile.chestCm,
    waistCm: rawProfile.waist_cm ?? rawProfile.waistCm,
    hipCm: rawProfile.hip_cm ?? rawProfile.hipCm,
  });

  const bodyShape = BODY_SHAPE_MAP[rawShape] ? rawShape : recommendedShape;
  const shapeInfo = BODY_SHAPE_MAP[bodyShape] || BODY_SHAPE_MAP.standard_balanced;

  // Anthropometric baseline equations from height, BMI, gender, and bodyShape
  const heightRatio = heightCm / (isFemale ? 163 : 175);
  const bmiDelta = bmi - (isFemale ? 20.5 : 22.2);

  const baseChest = (isFemale ? 85.5 : 96.5) * heightRatio + bmiDelta * 1.65;
  const baseWaist = (isFemale ? 67.5 : 79.5) * heightRatio + bmiDelta * 2.05;
  const baseHip = (isFemale ? 92.0 : 95.5) * heightRatio + bmiDelta * 1.55;
  const baseHead = (isFemale ? 55.2 : 57.6) * (0.7 + 0.3 * heightRatio) + bmiDelta * 0.12;

  const defaultChestCm = Number(
    Math.max(68, Math.min(138, baseChest * (0.65 + 0.35 * shapeInfo.morph.chestScale))).toFixed(1)
  );
  const defaultWaistCm = Number(
    Math.max(54, Math.min(130, baseWaist * (0.62 + 0.38 * shapeInfo.morph.waistScale))).toFixed(1)
  );
  const defaultHipCm = Number(
    Math.max(74, Math.min(138, baseHip * (0.65 + 0.35 * shapeInfo.morph.hipScale))).toFixed(1)
  );
  const defaultHeadCm = Number(Math.max(51, Math.min(64, baseHead)).toFixed(1));
  const defaultBodyFatPct = Number(
    Math.max(
      6,
      Math.min(
        45,
        (isFemale ? shapeInfo.defaultBodyFatFemale : shapeInfo.defaultBodyFatMale) + bmiDelta * 0.45
      )
    ).toFixed(1)
  );

  const parseUserNum = (val, min, max) => {
    if (val === null || val === undefined || val === '') return null;
    const n = Number(val);
    if (Number.isNaN(n) || n <= 0) return null;
    return Number(Math.max(min, Math.min(max, n)).toFixed(1));
  };

  const userBodyFat = parseUserNum(rawProfile.body_fat_pct ?? rawProfile.bodyFatPct, 4, 55);
  const userChest = parseUserNum(rawProfile.chest_cm ?? rawProfile.chestCm, 60, 150);
  const userWaist = parseUserNum(rawProfile.waist_cm ?? rawProfile.waistCm, 48, 145);
  const userHip = parseUserNum(rawProfile.hip_cm ?? rawProfile.hipCm, 65, 150);
  const userHead = parseUserNum(rawProfile.head_cm ?? rawProfile.headCm, 48, 66);

  const chestCm = userChest ?? defaultChestCm;
  const waistCm = userWaist ?? defaultWaistCm;
  const hipCm = userHip ?? defaultHipCm;
  const headCm = userHead ?? defaultHeadCm;
  const bodyFatPct = userBodyFat ?? defaultBodyFatPct;

  // Compute final 3D morph multipliers combining shape preset + exact 3-size / head overrides
  const chestOverrideRatio = Math.max(0.76, Math.min(1.34, chestCm / defaultChestCm));
  const waistOverrideRatio = Math.max(0.74, Math.min(1.42, waistCm / defaultWaistCm));
  const hipOverrideRatio = Math.max(0.76, Math.min(1.36, hipCm / defaultHipCm));
  const headOverrideRatio = Math.max(0.86, Math.min(1.18, headCm / defaultHeadCm));
  const bfDelta = bodyFatPct - defaultBodyFatPct;

  const morph = {
    heightScale: Math.max(0.86, Math.min(1.15, heightCm / 172)),
    shoulderScale: Number(
      (shapeInfo.morph.shoulderScale * (0.72 + 0.28 * chestOverrideRatio)).toFixed(3)
    ),
    chestScale: Number((shapeInfo.morph.chestScale * chestOverrideRatio).toFixed(3)),
    waistScale: Number((shapeInfo.morph.waistScale * waistOverrideRatio).toFixed(3)),
    bellyDepth: Number(
      (
        shapeInfo.morph.bellyDepth *
        waistOverrideRatio *
        Math.max(0.85, Math.min(1.25, 1 + bfDelta * 0.012))
      ).toFixed(3)
    ),
    hipScale: Number((shapeInfo.morph.hipScale * hipOverrideRatio).toFixed(3)),
    thighScale: Number(
      (shapeInfo.morph.thighScale * (0.55 + 0.45 * hipOverrideRatio)).toFixed(3)
    ),
    calfScale: Number(
      (shapeInfo.morph.calfScale * (0.7 + 0.3 * hipOverrideRatio)).toFixed(3)
    ),
    armScale: Number(
      (shapeInfo.morph.armScale * (0.65 + 0.35 * chestOverrideRatio)).toFixed(3)
    ),
    headScale: Number(headOverrideRatio.toFixed(3)),
  };

  let bmiCategory = '정상 체중';
  if (bmi < 18.5) bmiCategory = '저체중 · 슬림';
  else if (bmi < 23.0) bmiCategory = '정상 · 스탠다드';
  else if (bmi < 25.0) bmiCategory = '과체중 · 탄탄/볼륨';
  else bmiCategory = '고BMI · 볼륨';

  // Head-to-body ratio (등신대) from heightCm and headCm
  const headHeightCm = headCm * 0.415;
  const headToBodyRatio = Number((heightCm / Math.max(19, headHeightCm)).toFixed(1));

  return {
    gender,
    heightCm,
    weightKg,
    bmi,
    bmiCategory,
    bodyShape,
    recommendedShape,
    shapeLabelKo: shapeInfo.labelKo,
    shapeLabelEn: shapeInfo.labelEn,
    shapeShortKo: shapeInfo.shortKo,
    shapeBadge: shapeInfo.badge,
    shapeSummaryKo: shapeInfo.summaryKo,
    stylingAdviceKo: shapeInfo.stylingAdviceKo,
    bodyFatPct,
    chestCm,
    waistCm,
    hipCm,
    headCm,
    headToBodyRatio,
    defaults: {
      bodyShape: recommendedShape,
      bodyFatPct: defaultBodyFatPct,
      chestCm: defaultChestCm,
      waistCm: defaultWaistCm,
      hipCm: defaultHipCm,
      headCm: defaultHeadCm,
    },
    sources: {
      bodyShape: BODY_SHAPE_MAP[rawShape] ? 'user' : 'default',
      bodyFatPct: userBodyFat !== null ? 'user' : 'default',
      chestCm: userChest !== null ? 'user' : 'default',
      waistCm: userWaist !== null ? 'user' : 'default',
      hipCm: userHip !== null ? 'user' : 'default',
      headCm: userHead !== null ? 'user' : 'default',
    },
    morph,
  };
}

export function getBodyShapeStylingAdvice(bodyShapeKey) {
  return (BODY_SHAPE_MAP[bodyShapeKey] || BODY_SHAPE_MAP.standard_balanced).stylingAdviceKo;
}
