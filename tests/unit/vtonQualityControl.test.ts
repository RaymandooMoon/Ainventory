import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearVtonQcLogs,
  evaluateTurnaroundConsistencyQc,
  formatKoreanDistrictLocation,
  inspectPixelSliceQc,
  logVtonQcFailure,
  readVtonQcLogs,
  resolveBagCarryAnatomy,
  resolveStageAuraTier,
  VTON_QC_LOG_STORAGE_KEY,
} from '../../src/services/vtonQualityControl.ts';
import {
  clearPostLoginReveal,
  computeLogoFlipTransform,
  consumePostLoginReveal,
  peekPostLoginReveal,
  triggerPostLoginReveal,
} from '../../src/utils/logoTransition.ts';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}

function makeSliceRgba(params: {
  width?: number;
  height?: number;
  topY: number;
  bottomY: number;
  leftX: number;
  rightX: number;
  headCrownNarrow?: boolean;
  rgb?: [number, number, number];
  chromaHoleRect?: { x0: number; x1: number; y0: number; y1: number; rgb: [number, number, number] };
}) {
  const width = params.width ?? 120;
  const height = params.height ?? 180;
  const buf = new Uint8ClampedArray(width * height * 4);
  const [r, g, b] = params.rgb ?? [48, 52, 64];
  const cx = Math.round((params.leftX + params.rightX) / 2);

  for (let y = params.topY; y <= params.bottomY; y += 1) {
    if (y < 0 || y >= height) continue;
    let xStart = params.leftX;
    let xEnd = params.rightX;
    if (params.headCrownNarrow && y < params.topY + 18) {
      const halfHead = Math.max(8, Math.round((params.rightX - params.leftX) * 0.28));
      xStart = cx - halfHead;
      xEnd = cx + halfHead;
    }
    for (let x = xStart; x <= xEnd; x += 1) {
      if (x < 0 || x >= width) continue;
      const idx = (y * width + x) * 4;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = 255;
    }
  }

  if (params.chromaHoleRect) {
    const { x0, x1, y0, y1, rgb } = params.chromaHoleRect;
    for (let y = y0; y <= y1; y += 1) {
      if (y < 0 || y >= height) continue;
      for (let x = x0; x <= x1; x += 1) {
        if (x < 0 || x >= width) continue;
        const idx = (y * width + x) * 4;
        buf[idx] = rgb[0];
        buf[idx + 1] = rgb[1];
        buf[idx + 2] = rgb[2];
        buf[idx + 3] = 255;
      }
    }
  }

  return { buf, width, height };
}

describe('VTON Quality Control, Anatomy, Aura Tiers, GPS District Formatting & Reveal Flow', () => {
  it('resolves anatomical bag carry side inversely to dominant hand', () => {
    const rightHanded = resolveBagCarryAnatomy('right');
    assert.equal(rightHanded.dominantHand, 'right');
    assert.equal(rightHanded.carrySide, 'left');
    assert.equal(rightHanded.freeSide, 'right');
    assert.match(rightHanded.slotPrompt, /ANATOMICAL LEFT/);
    assert.match(rightHanded.crossAngleLockPrompt, /LEFT SIDE CARRY/);

    const leftHanded = resolveBagCarryAnatomy('left');
    assert.equal(leftHanded.dominantHand, 'left');
    assert.equal(leftHanded.carrySide, 'right');
    assert.equal(leftHanded.freeSide, 'left');
    assert.match(leftHanded.slotPrompt, /ANATOMICAL RIGHT/);
    assert.match(leftHanded.crossAngleLockPrompt, /RIGHT SIDE CARRY/);

    // Defaults safely to right-handed
    assert.equal(resolveBagCarryAnatomy(undefined).carrySide, 'left');
  });

  it('resolves backdrop aura tier from explicit grade letters or stage IDs', () => {
    assert.equal(resolveStageAuraTier('S'), 'S');
    assert.equal(resolveStageAuraTier('s_palais_royal_outdoor'), 'S');
    assert.equal(resolveStageAuraTier('A'), 'A');
    assert.equal(resolveStageAuraTier('a_hannam_flagship'), 'A');
    assert.equal(resolveStageAuraTier('B'), 'B');
    assert.equal(resolveStageAuraTier('b_seoul_plaza_outdoor'), 'B');
    assert.equal(resolveStageAuraTier('C'), 'C');
    assert.equal(resolveStageAuraTier('c_atelier_plaster'), 'C');
    assert.equal(resolveStageAuraTier(null), 'C');
  });

  it('inspects slice pixel geometry, detects clipping/half-body/chroma leaks, and validates turnaround consistency', () => {
    const cleanFront = makeSliceRgba({
      topY: 12,
      bottomY: 168,
      leftX: 40,
      rightX: 80,
      headCrownNarrow: true,
      rgb: [52, 56, 68],
    });
    const cleanSide = makeSliceRgba({
      topY: 14,
      bottomY: 167,
      leftX: 42,
      rightX: 78,
      headCrownNarrow: true,
      rgb: [54, 58, 70],
    });
    const cleanBack = makeSliceRgba({
      topY: 13,
      bottomY: 168,
      leftX: 40,
      rightX: 80,
      headCrownNarrow: true,
      rgb: [50, 54, 66],
    });

    const m0 = inspectPixelSliceQc(cleanFront.buf, cleanFront.width, cleanFront.height);
    const m45 = inspectPixelSliceQc(cleanSide.buf, cleanSide.width, cleanSide.height);
    const m180 = inspectPixelSliceQc(cleanBack.buf, cleanBack.width, cleanBack.height);
    assert.equal(m0.clippedTop, false);
    assert.equal(m0.clippedBottom, false);
    assert.equal(m0.halfBody, false);
    assert.ok(m0.interiorChromaRatio < 0.01);

    const passReport = evaluateTurnaroundConsistencyQc({ 0: m0, 45: m45, 180: m180 });
    assert.equal(passReport.ok, true);
    assert.equal(passReport.frontValid, true);
    assert.deepEqual(passReport.failedAngles, []);

    // Half-body / tiny 45° slice triggers failure
    const half45 = makeSliceRgba({
      topY: 20,
      bottomY: 90,
      leftX: 34,
      rightX: 86,
      headCrownNarrow: false,
      rgb: [52, 56, 68],
    });
    const mHalf45 = inspectPixelSliceQc(half45.buf, half45.width, half45.height);
    const halfFail = evaluateTurnaroundConsistencyQc({ 0: m0, 45: mHalf45 });
    assert.equal(halfFail.ok, false);
    assert.equal(halfFail.frontValid, true);
    assert.ok(halfFail.failedAngles.includes(45));

    // Interior #5E9C7E chroma-key pocket triggers failure
    const greenPocket = makeSliceRgba({
      topY: 12,
      bottomY: 168,
      leftX: 36,
      rightX: 84,
      headCrownNarrow: true,
      rgb: [46, 50, 62],
      chromaHoleRect: { x0: 52, x1: 68, y0: 100, y1: 145, rgb: [94, 156, 126] },
    });
    const mGreen = inspectPixelSliceQc(greenPocket.buf, greenPocket.width, greenPocket.height);
    assert.ok(mGreen.interiorChromaRatio > 0.045);
    const greenFail = evaluateTurnaroundConsistencyQc({ 0: m0, 90: mGreen });
    assert.equal(greenFail.ok, false);
    assert.ok(greenFail.failedAngles.includes(90));
    assert.ok(greenFail.reasons.some((r) => r.includes('interior_chroma_hole')));

    // Palette drift at 180° fails consistency
    const neonRedBack = makeSliceRgba({
      topY: 13,
      bottomY: 168,
      leftX: 40,
      rightX: 80,
      headCrownNarrow: true,
      rgb: [230, 40, 40],
    });
    const mRed = inspectPixelSliceQc(neonRedBack.buf, neonRedBack.width, neonRedBack.height);
    const paletteFail = evaluateTurnaroundConsistencyQc({ 0: m0, 180: mRed });
    assert.equal(paletteFail.ok, false);
    assert.ok(paletteFail.reasons.includes('180:palette_drift'));
  });

  it('persists and clears VTON QC failure logs safely', () => {
    const prevStorage = (globalThis as Record<string, unknown>).localStorage;
    const mem = createMemoryStorage();
    (globalThis as Record<string, unknown>).localStorage = mem;
    try {
      clearVtonQcLogs();
      assert.deepEqual(readVtonQcLogs(), []);

      logVtonQcFailure({
        outfitComboId: 'combo-test-1',
        avatarConfigHash: 'cfg-abc',
        attempts: 3,
        reasons: ['135:height_mismatch'],
        failedAngles: [135],
        frontOnlyFallback: true,
        timestamp: 1700000000000,
      });

      const logs = readVtonQcLogs();
      assert.equal(logs.length, 1);
      assert.equal(logs[0].outfitComboId, 'combo-test-1');
      assert.equal(logs[0].attempts, 3);
      assert.equal(logs[0].frontOnlyFallback, true);
      assert.ok(mem.getItem(VTON_QC_LOG_STORAGE_KEY)?.includes('combo-test-1'));

      clearVtonQcLogs();
      assert.deepEqual(readVtonQcLogs(), []);
    } finally {
      (globalThis as Record<string, unknown>).localStorage = prevStorage;
    }
  });

  it('formats reverse-geocoded coordinates into Korean ~시 ~구 / ~시 ~구 ~동 with nearest-centroid fallback', () => {
    const seoulNowon = formatKoreanDistrictLocation(
      {
        address: {
          city: '서울특별시',
          borough: '노원구',
          quarter: '상계동',
        },
      },
      37.654,
      127.056
    );
    assert.equal(seoulNowon, '서울시 노원구 상계동');

    const seoulGangnamGuOnly = formatKoreanDistrictLocation(
      {
        address: {
          city: 'Seoul',
          city_district: '강남구',
        },
      },
      37.517,
      127.047
    );
    assert.equal(seoulGangnamGuOnly, '서울시 강남구');

    const fallbackCity = formatKoreanDistrictLocation(null, 35.179, 129.075, [
      { name: '서울시 · 중구', lat: 37.5665, lon: 126.978 },
      { name: '부산시 · 해운대구', lat: 35.1631, lon: 129.1636 },
    ]);
    assert.equal(fallbackCity, '부산시 해운대구');
  });

  it('handles post-login staggered reveal flags and FLIP logo transforms', () => {
    clearPostLoginReveal();
    assert.equal(peekPostLoginReveal(1000), false);

    triggerPostLoginReveal(1000);
    assert.equal(peekPostLoginReveal(1500), true);
    assert.equal(consumePostLoginReveal(2000), true);
    assert.equal(peekPostLoginReveal(2100), false);

    // Expired post-login reveal (>12s) drops cleanly
    triggerPostLoginReveal(1000);
    assert.equal(consumePostLoginReveal(20000), false);

    const flip = computeLogoFlipTransform(
      { left: 100, top: 300, width: 140, height: 50 },
      { left: 150, top: 10, width: 80, height: 28 }
    );
    assert.ok(flip);
    assert.ok(flip.translateY > 250);
    assert.ok(flip.scaleX > 1.5);
    assert.match(flip.transformCss, /^translate3d\(/);
  });
});
