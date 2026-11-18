export type DominantHand = 'right' | 'left';
export type StageAuraTier = 'C' | 'B' | 'A' | 'S';

export const VTON_QC_LOG_STORAGE_KEY = 'ainventory_vton_qc_failures_v1';
const MAX_QC_LOG_ENTRIES = 30;

export interface BagCarryAnatomyDirective {
  dominantHand: DominantHand;
  carrySide: 'left' | 'right';
  freeSide: 'right' | 'left';
  carryLabelKo: string;
  carryLabelEn: string;
  slotPrompt: string;
  crossAngleLockPrompt: string;
}

/**
 * Enforces realistic anatomical handedness for bag carry:
 * - Right-handed wearer keeps right arm/hand free and carries bags on ANATOMICAL LEFT arm/shoulder.
 * - Left-handed wearer keeps left arm/hand free and carries bags on ANATOMICAL RIGHT arm/shoulder.
 */
export function resolveBagCarryAnatomy(
  rawDominantHand?: unknown
): BagCarryAnatomyDirective {
  const normalized: DominantHand =
    String(rawDominantHand || '')
      .trim()
      .toLowerCase() === 'left'
      ? 'left'
      : 'right';

  if (normalized === 'left') {
    return {
      dominantHand: 'left',
      carrySide: 'right',
      freeSide: 'left',
      carryLabelKo: '오른팔 · 오른손 (왼손잡이)',
      carryLabelEn: 'Right arm / shoulder (Left-handed)',
      slotPrompt:
        "carried EXCLUSIVELY on the model's ANATOMICAL RIGHT shoulder / RIGHT forearm / RIGHT hand across ALL turnaround angles (viewer's LEFT on 0° front view; NEVER switch sides to the left arm)",
      crossAngleLockPrompt:
        "ANATOMICAL HANDEDNESS BAG-CARRY LOCK (LEFT-HANDED WEARER -> RIGHT SIDE CARRY): Keep the wearer's dominant ANATOMICAL LEFT arm/hand completely free and unburdened across ALL turnaround views (0°, 45°, 90°, 135°, 180°, 225°). Every equipped bag/tote/briefcase MUST stay consistently on the wearer's ANATOMICAL RIGHT shoulder/arm/hand without swapping sides between front, side, and back views.",
    };
  }

  return {
    dominantHand: 'right',
    carrySide: 'left',
    freeSide: 'right',
    carryLabelKo: '왼팔 · 왼손 (오른손잡이)',
    carryLabelEn: 'Left arm / shoulder (Right-handed)',
    slotPrompt:
      "carried EXCLUSIVELY on the model's ANATOMICAL LEFT shoulder / LEFT forearm / LEFT hand across ALL turnaround angles (viewer's RIGHT on 0° front view; NEVER switch sides to the right arm)",
    crossAngleLockPrompt:
      "ANATOMICAL HANDEDNESS BAG-CARRY LOCK (RIGHT-HANDED WEARER -> LEFT SIDE CARRY): Keep the wearer's dominant ANATOMICAL RIGHT arm/hand completely free and unburdened across ALL turnaround views (0°, 45°, 90°, 135°, 180°, 225°). Every equipped bag/tote/briefcase MUST stay consistently on the wearer's ANATOMICAL LEFT shoulder/arm/hand without swapping sides between front, side, and back views.",
  };
}

/**
 * Resolves backdrop aura radiance tier (`C` | `B` | `A` | `S`) from a tier string or backdrop ID.
 */
export function resolveStageAuraTier(rawTierOrId?: unknown): StageAuraTier {
  const token = String(rawTierOrId || '')
    .trim()
    .toUpperCase();
  if (token === 'S' || token.startsWith('S_')) return 'S';
  if (token === 'A' || token.startsWith('A_')) return 'A';
  if (token === 'B' || token.startsWith('B_')) return 'B';
  return 'C';
}

export interface VtonQcSliceMetrics {
  width: number;
  height: number;
  fgPixels: number;
  fgHeightRatio: number;
  minY: number;
  maxY: number;
  minX: number;
  maxX: number;
  footBaselineRatio: number;
  coreCenterXRatio: number;
  clippedTop: boolean;
  clippedBottom: boolean;
  halfBody: boolean;
  interiorChromaRatio: number;
  outfitMeanRgb: [number, number, number] | null;
}

function isChromaKeyLeakRgb(r: number, g: number, b: number): boolean {
  // Legacy green #5E9C7E
  const isGreenKey =
    g > r + 14 &&
    g > b + 6 &&
    Math.abs(r - 94) <= 36 &&
    Math.abs(g - 156) <= 36 &&
    Math.abs(b - 126) <= 36;
  // Slate #94A3B8 or closely adjacent cool grey studio wall hole
  const isSlateHole =
    Math.abs(r - 148) <= 16 &&
    Math.abs(g - 163) <= 16 &&
    Math.abs(b - 184) <= 16;
  return isGreenKey || isSlateHole;
}

/**
 * Pure RGBA buffer inspection for a single cut-out VTON angle slice.
 * Evaluates full-body completeness, baseline grounding, horizontal centering,
 * interior unkeyed green/slate pockets, and central garment palette signature.
 */
export function inspectPixelSliceQc(
  data: Uint8ClampedArray,
  width: number,
  height: number
): VtonQcSliceMetrics {
  if (width < 16 || height < 16 || data.length < width * height * 4) {
    return {
      width,
      height,
      fgPixels: 0,
      fgHeightRatio: 0,
      minY: height,
      maxY: -1,
      minX: width,
      maxX: -1,
      footBaselineRatio: 0,
      coreCenterXRatio: 0.5,
      clippedTop: false,
      clippedBottom: false,
      halfBody: true,
      interiorChromaRatio: 0,
      outfitMeanRgb: null,
    };
  }

  let minY = height;
  let maxY = -1;
  let minX = width;
  let maxX = -1;
  let fgPixels = 0;

  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += 1) {
      if (data[(rowOff + x) * 4 + 3] > 48) {
        fgPixels += 1;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }

  if (fgPixels < 16 || maxY < minY) {
    return {
      width,
      height,
      fgPixels,
      fgHeightRatio: 0,
      minY,
      maxY,
      minX,
      maxX,
      footBaselineRatio: 0,
      coreCenterXRatio: 0.5,
      clippedTop: false,
      clippedBottom: false,
      halfBody: true,
      interiorChromaRatio: 0,
      outfitMeanRgb: null,
    };
  }

  const fgH = maxY - minY + 1;
  const fgHeightRatio = fgH / Math.max(1, height);
  const footBaselineRatio = maxY / Math.max(1, height - 1);

  const rowCounts = new Int32Array(height);
  const rowSpans = new Int32Array(height);
  const bodyWidths: number[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    const rowOff = y * width;
    let cnt = 0;
    let rMin = width;
    let rMax = -1;
    for (let x = minX; x <= maxX; x += 1) {
      if (data[(rowOff + x) * 4 + 3] > 48) {
        cnt += 1;
        if (x < rMin) rMin = x;
        if (x > rMax) rMax = x;
      }
    }
    rowCounts[y] = cnt;
    rowSpans[y] = rMax >= rMin ? rMax - rMin + 1 : 0;
    if (cnt > 0 && y >= minY + fgH * 0.25 && y <= minY + fgH * 0.85) {
      bodyWidths.push(cnt);
    }
  }
  bodyWidths.sort((a, b) => a - b);
  const medianBodyWidth =
    bodyWidths.length > 0 ? bodyWidths[Math.floor(bodyWidths.length / 2)] : Math.max(1, width * 0.2);

  // Lower-calf/ankle core horizontal center X (0.78..0.92 of subject height)
  const cxY0 = Math.max(minY, Math.round(minY + fgH * 0.78));
  const cxY1 = Math.min(height - 1, Math.max(cxY0, Math.round(minY + fgH * 0.92)));
  const rowCenters: number[] = [];
  for (let y = cxY0; y <= cxY1; y += 1) {
    const rowOff = y * width;
    let rMin = width;
    let rMax = -1;
    for (let x = minX; x <= maxX; x += 1) {
      if (data[(rowOff + x) * 4 + 3] > 48) {
        if (x < rMin) rMin = x;
        if (x > rMax) rMax = x;
      }
    }
    if (rMax >= rMin) {
      rowCenters.push((rMin + rMax) * 0.5);
    }
  }
  rowCenters.sort((a, b) => a - b);
  const coreCenterX =
    rowCenters.length > 0
      ? rowCenters[Math.floor(rowCenters.length / 2)]
      : (minX + maxX) * 0.5;
  const coreCenterXRatio = coreCenterX / Math.max(1, width);

  // Top clip check (headless / waist-down crop)
  const topEdgeCount = Math.max(rowCounts[0] || 0, rowCounts[1] || 0, rowCounts[2] || 0);
  const yFlat = Math.min(maxY, minY + 2);
  const topAtMin = rowCounts[minY] || 0;
  const topAtFlat = rowCounts[yFlat] || 0;
  const topFlatSpan = Math.max(1, rowSpans[yFlat] || 1);
  const probeY = Math.min(maxY, minY + Math.max(4, Math.round(fgH * 0.14)));
  const probeBelow = rowCounts[probeY] || 0;

  const clippedTop =
    (minY <= 2 && topEdgeCount >= Math.max(width * 0.14, medianBodyWidth * 0.52)) ||
    (fgHeightRatio < 0.78 &&
      topAtFlat >= Math.max(width * 0.16, medianBodyWidth * 0.6) &&
      topAtMin >= topAtFlat * 0.68 &&
      topAtFlat / topFlatSpan >= 0.62 &&
      probeBelow <= topAtFlat * 1.45);

  // Bottom clip check (cut off at torso/knees flush against canvas bottom)
  const botEdgeCount = Math.max(
    rowCounts[height - 1] || 0,
    rowCounts[height - 2] || 0,
    rowCounts[height - 3] || 0
  );
  const clippedBottom =
    maxY >= height - 3 && botEdgeCount >= Math.max(width * 0.2, medianBodyWidth * 0.62);

  // Half-body / waist-up check
  const botTrimY = Math.max(minY, Math.round(maxY - fgH * 0.04));
  let maxBotBar = 0;
  for (let y = botTrimY; y <= maxY; y += 1) {
    if (rowCounts[y] > maxBotBar) maxBotBar = rowCounts[y];
  }
  const heightAspect = fgH / Math.max(1, medianBodyWidth);
  const halfBody =
    fgHeightRatio < 0.44 ||
    (fgHeightRatio < 0.54 && heightAspect < 2.15 && maxBotBar >= medianBodyWidth * 0.52);

  // Interior chroma-key pocket & garment RGB palette inspection
  const chromaY0 = Math.min(maxY, Math.round(minY + fgH * 0.16));
  const chromaY1 = Math.max(chromaY0, Math.round(maxY - fgH * 0.06));
  const outfitY0 = Math.min(maxY, Math.round(minY + fgH * 0.22));
  const outfitY1 = Math.max(outfitY0, Math.round(minY + fgH * 0.74));
  let interiorChromaPixels = 0;
  let interiorSpanPixels = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let outfitCount = 0;

  for (let y = chromaY0; y <= chromaY1; y += 1) {
    const rowOff = y * width;
    let firstNonKey = -1;
    let lastNonKey = -1;
    for (let x = minX; x <= maxX; x += 1) {
      const idx = (rowOff + x) * 4;
      if (data[idx + 3] > 64 && !isChromaKeyLeakRgb(data[idx], data[idx + 1], data[idx + 2])) {
        if (firstNonKey === -1) firstNonKey = x;
        lastNonKey = x;
      }
    }
    if (firstNonKey === -1 || lastNonKey - firstNonKey < 4) continue;
    for (let x = firstNonKey + 1; x < lastNonKey; x += 1) {
      const idx = (rowOff + x) * 4;
      if (data[idx + 3] > 64) {
        interiorSpanPixels += 1;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        if (isChromaKeyLeakRgb(r, g, b)) {
          interiorChromaPixels += 1;
        } else if (y >= outfitY0 && y <= outfitY1) {
          sumR += r;
          sumG += g;
          sumB += b;
          outfitCount += 1;
        }
      }
    }
  }

  const interiorChromaRatio =
    interiorSpanPixels > 0 ? interiorChromaPixels / interiorSpanPixels : 0;
  const outfitMeanRgb: [number, number, number] | null =
    outfitCount >= 16
      ? [
          Math.round(sumR / outfitCount),
          Math.round(sumG / outfitCount),
          Math.round(sumB / outfitCount),
        ]
      : null;

  return {
    width,
    height,
    fgPixels,
    fgHeightRatio,
    minY,
    maxY,
    minX,
    maxX,
    footBaselineRatio,
    coreCenterXRatio,
    clippedTop,
    clippedBottom,
    halfBody,
    interiorChromaRatio,
    outfitMeanRgb,
  };
}

export interface TurnaroundConsistencyQcReport {
  ok: boolean;
  frontValid: boolean;
  failedAngles: number[];
  reasons: string[];
}

/**
 * Evaluates multi-angle VTON slices against the `0°` front slice for:
 * - Full-body completeness (no headless, bottom-clipped, or half-body crops)
 * - Cross-angle height parity (`0.72..1.32` relative to `0°`)
 * - Foot baseline parity (`<= 0.09` drift)
 * - Horizontal core centering (`|coreCenterXRatio - 0.5| <= 0.16`)
 * - Outfit color consistency vs `0°` (RGB Euclidean distance `<= 95`)
 * - Absence of interior unkeyed green/slate pockets (`<= 0.045`)
 */
export function evaluateTurnaroundConsistencyQc(
  slicesByAngle: Partial<Record<number, VtonQcSliceMetrics>>
): TurnaroundConsistencyQcReport {
  const front = slicesByAngle[0];
  const reasons: string[] = [];
  const failedAnglesSet = new Set<number>();

  if (!front || front.fgPixels < 16) {
    return {
      ok: false,
      frontValid: false,
      failedAngles: [0],
      reasons: ['front_missing'],
    };
  }

  const frontComplete =
    !front.clippedTop &&
    !front.clippedBottom &&
    !front.halfBody &&
    front.fgHeightRatio >= 0.48 &&
    front.interiorChromaRatio <= 0.045;

  if (!frontComplete) {
    failedAnglesSet.add(0);
    if (front.clippedTop) reasons.push('0:clipped_top');
    if (front.clippedBottom) reasons.push('0:clipped_bottom');
    if (front.halfBody) reasons.push('0:half_body');
    if (front.fgHeightRatio < 0.48) reasons.push('0:too_small');
    if (front.interiorChromaRatio > 0.045) reasons.push('0:interior_chroma_hole');
  }

  const angles = Object.keys(slicesByAngle)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  for (const angle of angles) {
    const m = slicesByAngle[angle];
    if (!m) continue;
    if (m.clippedTop) {
      failedAnglesSet.add(angle);
      reasons.push(`${angle}:clipped_top`);
    }
    if (m.clippedBottom) {
      failedAnglesSet.add(angle);
      reasons.push(`${angle}:clipped_bottom`);
    }
    if (m.halfBody || m.fgHeightRatio < 0.48) {
      failedAnglesSet.add(angle);
      reasons.push(`${angle}:incomplete_height`);
    }
    if (m.interiorChromaRatio > 0.045) {
      failedAnglesSet.add(angle);
      reasons.push(`${angle}:interior_chroma_hole`);
    }
    if (Math.abs(m.coreCenterXRatio - 0.5) > 0.16) {
      failedAnglesSet.add(angle);
      reasons.push(`${angle}:off_center_x`);
    }

    if (angle !== 0 && front.fgHeightRatio >= 0.48) {
      const heightRatio = m.fgHeightRatio / Math.max(0.01, front.fgHeightRatio);
      if (heightRatio < 0.72 || heightRatio > 1.32) {
        failedAnglesSet.add(angle);
        reasons.push(`${angle}:height_mismatch`);
      }
      if (Math.abs(m.footBaselineRatio - front.footBaselineRatio) > 0.09) {
        failedAnglesSet.add(angle);
        reasons.push(`${angle}:baseline_drift`);
      }
      if (front.outfitMeanRgb && m.outfitMeanRgb) {
        const dr = m.outfitMeanRgb[0] - front.outfitMeanRgb[0];
        const dg = m.outfitMeanRgb[1] - front.outfitMeanRgb[1];
        const db = m.outfitMeanRgb[2] - front.outfitMeanRgb[2];
        const rgbDist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (rgbDist > 95) {
          failedAnglesSet.add(angle);
          reasons.push(`${angle}:palette_drift`);
        }
      }
    }
  }

  return {
    ok: failedAnglesSet.size === 0 && reasons.length === 0,
    frontValid: frontComplete,
    failedAngles: Array.from(failedAnglesSet).sort((a, b) => a - b),
    reasons,
  };
}

export interface VtonQcFailureLogEntry {
  timestamp: number;
  outfitComboId: string;
  avatarConfigHash: string;
  attempts: number;
  reasons: string[];
  failedAngles: number[];
  frontOnlyFallback: boolean;
}

export function readVtonQcLogs(): VtonQcFailureLogEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(VTON_QC_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as VtonQcFailureLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function logVtonQcFailure(
  entry: Omit<VtonQcFailureLogEntry, 'timestamp'> & { timestamp?: number }
): VtonQcFailureLogEntry[] {
  const nextEntry: VtonQcFailureLogEntry = {
    timestamp: entry.timestamp ?? Date.now(),
    outfitComboId: String(entry.outfitComboId || 'unknown'),
    avatarConfigHash: String(entry.avatarConfigHash || 'unknown'),
    attempts: Math.max(1, Math.round(Number(entry.attempts) || 1)),
    reasons: Array.isArray(entry.reasons) ? entry.reasons.slice(0, 12) : [],
    failedAngles: Array.isArray(entry.failedAngles) ? entry.failedAngles.slice(0, 8) : [],
    frontOnlyFallback: Boolean(entry.frontOnlyFallback),
  };
  const prev = readVtonQcLogs();
  const next = [...prev, nextEntry].slice(-MAX_QC_LOG_ENTRIES);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(VTON_QC_LOG_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  }
  return next;
}

export function clearVtonQcLogs(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(VTON_QC_LOG_STORAGE_KEY);
  } catch {
    // ignore storage removal errors
  }
}

export interface CityCentroidEntry {
  key?: string;
  name: string;
  lat: number;
  lon: number;
}

interface ReverseGeoAddress {
  city?: string;
  province?: string;
  state?: string;
  county?: string;
  borough?: string;
  city_district?: string;
  suburb?: string;
  quarter?: string;
  neighbourhood?: string;
  town?: string;
  village?: string;
}

function cleanKoreanCityToken(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (s === '서울' || s === '서울특별시' || s === '서울시' || /^seoul/i.test(s)) return '서울시';
  if (s === '부산' || s === '부산광역시' || s === '부산시' || /^busan/i.test(s)) return '부산시';
  if (s === '인천' || s === '인천광역시' || s === '인천시' || /^incheon/i.test(s)) return '인천시';
  if (s === '대구' || s === '대구광역시' || s === '대구시' || /^daegu/i.test(s)) return '대구시';
  if (s === '대전' || s === '대전광역시' || s === '대전시' || /^daejeon/i.test(s)) return '대전시';
  if (s === '광주' || s === '광주광역시' || s === '광주시' || /^gwangju/i.test(s)) return '광주시';
  if (s === '울산' || s === '울산광역시' || s === '울산시' || /^ulsan/i.test(s)) return '울산시';
  if (s === '세종' || s === '세종특별자치시' || /^sejong/i.test(s)) return '세종시';
  return s.replace(/특별시$|광역시$|특별자치시$|특별자치도$/u, '시');
}

function sanitizeCityCoordsLabel(name: string): string {
  return String(name || '')
    .replace(/\s*·\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Formats reverse-geocoded coordinates into crisp Korean `~시 ~구` or `~시 ~구 ~동` labels
 * (e.g., `서울시 노원구` or `서울시 강남구 역삼동`), falling back cleanly to the nearest centroid
 * in `cityCoords` when reverse-geocoding returns incomplete or empty fields.
 */
export function formatKoreanDistrictLocation(
  reverseGeoJson: { address?: ReverseGeoAddress } | null | undefined,
  lat: number,
  lon: number,
  cityCoords: readonly CityCentroidEntry[] = []
): string {
  const addr = reverseGeoJson?.address;
  if (addr && typeof addr === 'object') {
    const rawCity = addr.city || addr.state || addr.province || addr.town || '';
    const cityToken = cleanKoreanCityToken(String(rawCity || ''));

    const districtCandidates = [
      addr.borough,
      addr.city_district,
      addr.county,
    ]
      .map((v) => String(v || '').trim())
      .filter((v) => v && v !== rawCity);
    const guToken =
      districtCandidates.find((v) => /(구|군)$/u.test(v)) || districtCandidates[0] || '';

    const dongCandidates = [addr.quarter, addr.suburb, addr.neighbourhood, addr.village]
      .map((v) => String(v || '').trim())
      .filter((v) => v && v !== guToken && v !== rawCity);
    const dongToken =
      dongCandidates.find((v) => /(동|읍|면|가)$/u.test(v)) || '';

    const parts = [cityToken, guToken, dongToken].filter(Boolean);
    if (parts.length >= 2) {
      return parts.slice(0, 3).join(' ');
    }
    if (parts.length === 1 && guToken) {
      return parts[0];
    }
  }

  if (Array.isArray(cityCoords) && cityCoords.length > 0 && Number.isFinite(lat) && Number.isFinite(lon)) {
    let best: CityCentroidEntry = cityCoords[0];
    let bestDistSq = Infinity;
    for (const c of cityCoords) {
      const dLat = lat - c.lat;
      const dLon = lon - c.lon;
      const distSq = dLat * dLat + dLon * dLon;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = c;
      }
    }
    return sanitizeCityCoordsLabel(best.name);
  }

  return '서울시 중구 명동';
}
