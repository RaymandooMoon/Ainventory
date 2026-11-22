export interface NormalizedFaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DetectedFaceCandidate {
  id: string;
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  areaRatio: number;
}

export type FaceQualityLevel = 'good' | 'caution' | 'poor';

export type FaceQualityIssue =
  | 'ok'
  | 'no_face'
  | 'multi_face'
  | 'too_small'
  | 'extreme_lighting'
  | 'low_confidence';

export interface FacePhotoQualityReport {
  level: FaceQualityLevel;
  primaryIssue: FaceQualityIssue;
  issues: FaceQualityIssue[];
  headline: string;
  description: string;
  checklist: string[];
  recommendedAction: 'correct' | 'reupload' | 'none';
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function clampNormalizedFaceBox(box: NormalizedFaceBox): NormalizedFaceBox {
  const safeW = clamp(Number.isFinite(box.w) ? box.w : 0.34, 0.1, 0.92);
  const safeH = clamp(Number.isFinite(box.h) ? box.h : 0.42, 0.12, 0.94);
  const safeX = clamp(Number.isFinite(box.x) ? box.x : 0.33, 0, Math.max(0, 1 - safeW));
  const safeY = clamp(Number.isFinite(box.y) ? box.y : 0.2, 0, Math.max(0, 1 - safeH));
  return {
    x: Number(safeX.toFixed(4)),
    y: Number(safeY.toFixed(4)),
    w: Number(safeW.toFixed(4)),
    h: Number(safeH.toFixed(4)),
  };
}

/**
 * Computes a clean square single-face portrait crop rect in source image pixel coordinates.
 * Adds headroom for hair/crown + upper neckline so AI VTON receives ONLY the selected person's
 * face & hairstyle rather than bystanders in a group shot.
 */
export function computeSingleFacePortraitRect(
  faceBoxPx: { cx: number; cy: number; w: number; h: number },
  srcW: number,
  srcH: number
): { sx: number; sy: number; side: number } {
  const safeSrcW = Math.max(1, Math.round(srcW));
  const safeSrcH = Math.max(1, Math.round(srcH));
  const minSrcSide = Math.min(safeSrcW, safeSrcH);
  const baseFaceSpan = Math.max(faceBoxPx.w, faceBoxPx.h, minSrcSide * 0.08);
  const desiredSide = Math.round(baseFaceSpan * 2.1);
  const side = clamp(desiredSide, Math.min(minSrcSide, 96), minSrcSide);

  // Shift crop slightly upward by 8% of face height so full hairline/crown is preserved
  const targetCenterX = faceBoxPx.cx;
  const targetCenterY = faceBoxPx.cy - faceBoxPx.h * 0.08;

  const sx = clamp(Math.round(targetCenterX - side * 0.5), 0, Math.max(0, safeSrcW - side));
  const sy = clamp(Math.round(targetCenterY - side * 0.5), 0, Math.max(0, safeSrcH - side));
  return { sx, sy, side };
}

function computeBoxIoU(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): number {
  const ix0 = Math.max(a.x, b.x);
  const iy0 = Math.max(a.y, b.y);
  const ix1 = Math.min(a.x + a.w, b.x + b.w);
  const iy1 = Math.min(a.y + a.h, b.y + b.h);
  const iw = Math.max(0, ix1 - ix0);
  const ih = Math.max(0, iy1 - iy0);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Deduplicates overlapping detections merged across full-frame and split-half scans
 * and sorts them left-to-right so `얼굴 1, 2, 3...` numbering matches visual order.
 */
export function dedupeDetectedFaceCandidates(
  rawBoxes: ReadonlyArray<{ cx: number; cy: number; w: number; h: number }>,
  srcW: number,
  srcH: number
): DetectedFaceCandidate[] {
  const safeW = Math.max(1, srcW);
  const safeH = Math.max(1, srcH);

  const normalized = rawBoxes
    .filter((b) => b.w >= 10 && b.h >= 10)
    .map((b) => {
      const w = clamp(b.w / safeW, 0.02, 0.96);
      const h = clamp(b.h / safeH, 0.02, 0.96);
      const x = clamp((b.cx - b.w * 0.5) / safeW, 0, Math.max(0, 1 - w));
      const y = clamp((b.cy - b.h * 0.5) / safeH, 0, Math.max(0, 1 - h));
      return {
        x,
        y,
        w,
        h,
        cx: x + w * 0.5,
        cy: y + h * 0.5,
        areaRatio: w * h,
      };
    })
    .sort((a, b) => b.areaRatio - a.areaRatio);

  const kept: typeof normalized = [];
  for (const cand of normalized) {
    const duplicate = kept.some((existing) => {
      const iou = computeBoxIoU(cand, existing);
      const centerDist = Math.hypot(cand.cx - existing.cx, cand.cy - existing.cy);
      const avgSpan = (Math.max(cand.w, cand.h) + Math.max(existing.w, existing.h)) * 0.5;
      return iou >= 0.32 || centerDist <= avgSpan * 0.42;
    });
    if (!duplicate) {
      kept.push(cand);
    }
  }

  // Sort left-to-right, then top-to-bottom for intuitive human numbering
  const ordered = [...kept].sort((a, b) => {
    if (Math.abs(a.cx - b.cx) > 0.06) return a.cx - b.cx;
    return a.cy - b.cy;
  });

  return ordered.map((item, idx) => ({
    id: `face-${idx + 1}`,
    index: idx,
    x: Number(item.x.toFixed(4)),
    y: Number(item.y.toFixed(4)),
    w: Number(item.w.toFixed(4)),
    h: Number(item.h.toFixed(4)),
    cx: Number(item.cx.toFixed(4)),
    cy: Number(item.cy.toFixed(4)),
    areaRatio: Number(item.areaRatio.toFixed(4)),
  }));
}

export interface EvaluateFaceQualityInput {
  faceDetected: boolean;
  detectedFaceCount: number;
  faceAreaRatio: number;
  confidence: number;
  labL: number;
  labChroma: number;
  gainSkew?: number;
  manualOverride?: boolean;
  lang?: 'ko' | 'en' | string;
}

export function evaluateFacePhotoQuality(
  input: EvaluateFaceQualityInput
): FacePhotoQualityReport {
  const isEn = input.lang === 'en';
  const issues: FaceQualityIssue[] = [];

  if (!input.faceDetected) {
    issues.push('no_face');
  }
  if (input.detectedFaceCount >= 2 && !input.manualOverride) {
    issues.push('multi_face');
  }
  if (input.faceDetected && input.faceAreaRatio > 0 && input.faceAreaRatio < 0.045) {
    issues.push('too_small');
  }
  const hasExtremeExposure = input.labL > 86 || input.labL < 24;
  const hasStageColorCast =
    input.labChroma > 28 || (typeof input.gainSkew === 'number' && input.gainSkew > 0.28);
  if (hasExtremeExposure || hasStageColorCast) {
    issues.push('extreme_lighting');
  }
  if (input.confidence < 72) {
    issues.push('low_confidence');
  }

  const checklist = isEn
    ? [
        'Use a solo front-facing photo without other people',
        'Natural daylight or even indoor light (avoid stage/neon glare)',
        'Keep your face occupying at least 25% of the frame',
        'Remove sunglasses, masks, or heavy bangs over cheeks',
      ]
    : [
        '다른 사람 없이 정면 단독 얼굴이 나온 사진',
        '무대·네온 조명 대신 자연광 또는 균일한 실내 조명',
        '얼굴이 화면의 25% 이상 크기로 선명하게 보이는 구도',
        '선글라스·마스크·심한 역광 없이 볼과 이마가 드러난 상태',
      ];

  if (issues.length === 0) {
    return {
      level: 'good',
      primaryIssue: 'ok',
      issues: [],
      headline: isEn ? 'Clear solo face portrait verified' : '선명한 정면 얼굴이 인식되었어요',
      description: isEn
        ? 'Your face contours and natural skin tone are clearly captured for AI fitting.'
        : '이목구비와 피부톤이 안정적으로 추출되어 AI 피팅에 바로 반영됩니다.',
      checklist,
      recommendedAction: 'none',
    };
  }

  const primaryIssue = issues[0];

  if (primaryIssue === 'no_face') {
    return {
      level: 'poor',
      primaryIssue,
      issues,
      headline: isEn
        ? 'Face could not be clearly recognized'
        : '얼굴이 선명하게 인식되지 않았어요',
      description: isEn
        ? 'Select your face directly in the correction tool, or upload/capture a clearer solo front photo.'
        : '사진에서 얼굴 영역을 정확히 찾지 못했습니다. 내 얼굴을 직접 지정하거나 밝은 정면 단독 사진으로 다시 시도해 주세요.',
      checklist,
      recommendedAction: 'reupload',
    };
  }

  if (primaryIssue === 'multi_face') {
    const count = Math.max(2, input.detectedFaceCount);
    return {
      level: 'poor',
      primaryIssue,
      issues,
      headline: isEn
        ? `${count} faces detected — please pin your own face`
        : `단체 사진(${count}명 감지) — 내 얼굴을 직접 선택해 주세요`,
      description: isEn
        ? 'Another person in the photo may be reflected in AI fitting. Open the correction tool to lock only your face, or upload a solo portrait.'
        : '단체 사진에서는 다른 사람이 내 얼굴로 잘못 인식될 수 있습니다. "내 얼굴 선택·교정"에서 본인 얼굴만 지정해 고정하거나 단독 사진을 올려 주세요.',
      checklist,
      recommendedAction: 'correct',
    };
  }

  if (primaryIssue === 'too_small') {
    return {
      level: 'caution',
      primaryIssue,
      issues,
      headline: isEn
        ? 'Face appears too small in the photo'
        : '사진 속 얼굴 크기가 너무 작아요',
      description: isEn
        ? 'A distant or full-body photo lowers facial accuracy. Frame your face closely or upload a closer selfie.'
        : '멀리서 찍힌 전신·단체 사진은 이목구비와 피부톤 정확도가 떨어집니다. 내 얼굴 영역을 직접 확대 지정하거나 더 가까운 정면 사진을 등록해 주세요.',
      checklist,
      recommendedAction: 'reupload',
    };
  }

  if (primaryIssue === 'extreme_lighting') {
    return {
      level: 'caution',
      primaryIssue,
      issues,
      headline: isEn
        ? 'Strong stage/colored lighting detected'
        : '강한 조명·색 번짐이 감지되었어요',
      description: isEn
        ? 'Overexposed or colorful stage lighting can skew your skin tone. Try a daylight photo or adjust lighting calibration below.'
        : '강한 무대 조명이나 과노출·역광으로 실제 피부톤이 왜곡될 수 있어요. 자연광 정면 사진으로 변경하거나 아래 조명 보정을 조정해 주세요.',
      checklist,
      recommendedAction: 'reupload',
    };
  }

  return {
    level: 'caution',
    primaryIssue: 'low_confidence',
    issues,
    headline: isEn
      ? 'Face recognition confidence is low'
      : '얼굴 분석 신뢰도가 낮아요',
    description: isEn
      ? 'If the wrong region was selected, adjust your face frame directly or try another front-facing photo.'
      : '다른 영역이나 인물이 잡혔을 수 있습니다. 내 얼굴을 직접 교정하거나 또렷한 정면 사진으로 다시 올려 주세요.',
    checklist,
    recommendedAction: 'correct',
  };
}
