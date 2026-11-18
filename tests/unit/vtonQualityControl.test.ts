import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clearVtonQcLogs,
  computeBagAssetPlacementBox,
  evaluateTurnaroundConsistencyQc,
  formatKoreanDistrictLocation,
  inspectPixelSliceQc,
  isBagGarmentItem,
  isValidHandednessToken,
  logVtonQcFailure,
  mirrorRgbaPixelBufferHorizontally,
  normalizeHandedness,
  readVtonQcLogs,
  resolveBagCarryAnatomy,
  resolveStageAuraTier,
  VTON_QC_LOG_STORAGE_KEY,
} from '../../src/services/vtonQualityControl.ts';
import { computeOutfitComboId } from '../../src/services/vton2DService.ts';
import {
  clearPostLoginReveal,
  computeLogoFlipTransform,
  consumePostLoginReveal,
  peekPostLoginReveal,
  triggerPostLoginReveal,
} from '../../src/utils/logoTransition.ts';
import { selectOptimalStudioKeyHex } from '../../src/services/weatherPromptBuilder.ts';

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

    // Explicit per-angle IMAGE-LEFT / IMAGE-RIGHT screen-side coordinates prevent front/back shoulder swap
    assert.match(rightHanded.perAngleScreenPrompt[0], /IMAGE-RIGHT/);
    assert.match(rightHanded.perAngleScreenPrompt[45], /IMAGE-RIGHT/);
    assert.match(rightHanded.perAngleScreenPrompt[135], /IMAGE-LEFT/);
    assert.match(rightHanded.perAngleScreenPrompt[180], /IMAGE-LEFT/);
    assert.match(rightHanded.perAngleScreenPrompt[225], /IMAGE-LEFT/);
    assert.match(leftHanded.perAngleScreenPrompt[0], /IMAGE-LEFT/);
    assert.match(leftHanded.perAngleScreenPrompt[180], /IMAGE-RIGHT/);

    // Defaults safely to right-handed
    assert.equal(resolveBagCarryAnatomy(undefined).carrySide, 'left');
    assert.equal(resolveBagCarryAnatomy('left-handed').carrySide, 'right');
    assert.equal(resolveBagCarryAnatomy('right-handed').carrySide, 'left');
  });

  it('normalizes and validates handedness tokens and mirrors bag asset placement boxes when left-handed', () => {
    assert.equal(normalizeHandedness(undefined), 'right');
    assert.equal(normalizeHandedness(null), 'right');
    assert.equal(normalizeHandedness('right'), 'right');
    assert.equal(normalizeHandedness('right-handed'), 'right');
    assert.equal(normalizeHandedness('오른손잡이'), 'right');
    assert.equal(normalizeHandedness('left'), 'left');
    assert.equal(normalizeHandedness('left-handed'), 'left');
    assert.equal(normalizeHandedness('LEFT_HANDED'), 'left');
    assert.equal(normalizeHandedness('왼손잡이'), 'left');

    assert.equal(isValidHandednessToken('right'), true);
    assert.equal(isValidHandednessToken('left'), true);
    assert.equal(isValidHandednessToken('right-handed'), true);
    assert.equal(isValidHandednessToken('left-handed'), true);
    assert.equal(isValidHandednessToken('ambidextrous'), false);
    assert.equal(isValidHandednessToken(123), false);

    assert.equal(
      isBagGarmentItem({
        slot: 'accessory',
        category: 'accessory',
        subcategory: 'briefcase',
        name: '브라운 이탈리안 풀그레인 레더 서류가방',
      }),
      true
    );
    assert.equal(
      isBagGarmentItem({
        slot: 'acc_umbrella',
        category: 'accessory',
        subcategory: 'umbrella',
        name: '장우산',
      }),
      false
    );
    assert.equal(
      isBagGarmentItem({
        slot: 'acc_neck',
        category: 'accessory',
        subcategory: 'muffler',
        name: '캐시미어 머플러',
      }),
      false
    );

    const geom = {
      cx: 224,
      shoulderY: 160,
      waistY: 310,
      shoulderW: 112,
      hipW: 96,
      headH: 95,
    };

    for (const angleDeg of [0, 45, 135, 180] as const) {
      const rightBox = computeBagAssetPlacementBox({ ...geom, angleDeg, handedness: 'right' });
      const leftBox = computeBagAssetPlacementBox({
        ...geom,
        angleDeg,
        handedness: 'left-handed',
      });
      assert.equal(rightBox.visible, true);
      assert.equal(leftBox.visible, true);
      assert.equal(rightBox.mirrored, false);
      assert.equal(leftBox.mirrored, true);
      assert.equal(leftBox.centerOffsetFromAxis, -rightBox.centerOffsetFromAxis);
    }

    const frontRightHanded = computeBagAssetPlacementBox({
      ...geom,
      angleDeg: 0,
      handedness: 'right',
    });
    const frontLeftHanded = computeBagAssetPlacementBox({
      ...geom,
      angleDeg: 0,
      handedness: 'left-handed',
    });
    assert.ok(frontRightHanded.bagCenterX > geom.cx);
    assert.ok(frontLeftHanded.bagCenterX < geom.cx);

    const sideRightHanded = computeBagAssetPlacementBox({
      ...geom,
      angleDeg: 90,
      handedness: 'right',
    });
    const sideLeftHanded = computeBagAssetPlacementBox({
      ...geom,
      angleDeg: 90,
      handedness: 'left-handed',
    });
    assert.equal(sideRightHanded.visible, false);
    assert.equal(sideLeftHanded.visible, true);
    assert.ok(sideLeftHanded.bagRect !== null);

    // Pure RGBA pixel buffer horizontal flip (`x -> width - 1 - x`)
    const srcPixels = new Uint8ClampedArray([
      10, 20, 30, 255, 200, 210, 220, 128,
    ]);
    const flipped = mirrorRgbaPixelBufferHorizontally(srcPixels, 2, 1);
    assert.deepEqual(Array.from(flipped), [200, 210, 220, 128, 10, 20, 30, 255]);
    // Immutability check
    assert.deepEqual(Array.from(srcPixels), [10, 20, 30, 255, 200, 210, 220, 128]);

    // Outfit combo ID isolates mirrored bag renders when left-handed while keeping default right-handed unchanged
    const slotsWithBag = {
      top: { id: 101, category: 'top', subcategory: 'knit', color_hex: '#333333', name: '니트' },
      accessory: {
        id: 202,
        category: 'accessory',
        subcategory: 'briefcase',
        color_hex: '#5C3A21',
        name: '레더 서류가방',
      },
    };
    const defaultCombo = computeOutfitComboId(slotsWithBag);
    const rightCombo = computeOutfitComboId(slotsWithBag, 'right');
    const leftCombo = computeOutfitComboId(slotsWithBag, 'left-handed');
    assert.equal(defaultCombo.outfitComboId, rightCombo.outfitComboId);
    assert.notEqual(leftCombo.outfitComboId, rightCombo.outfitComboId);
  });

  it('avoids #94A3B8 cool-slate studio key backdrop when denim/indigo/blue pants are worn', () => {
    const selectedHex = selectOptimalStudioKeyHex([
      { name: '다크 브라운 스웨이드 자켓', color: '브라운', color_hex: '#3E2E24' },
      { name: '카멜 캐시미어 가디건', color: '카멜', color_hex: '#C19A6B' },
      { name: '라이트 인디고 스트레이트 데님 팬츠', color: '라이트 블루', color_hex: '#6C8CB5' },
    ]);
    assert.notEqual(selectedHex.toUpperCase(), '#94A3B8');
  });

  it('rejects headless collar-cut and scale-invariant thigh-cut slices during QC', () => {
    // 1) Headless collar-cut silhouette: tall enough overall, but top 16% has wide flat jacket collar with no narrow neck taper
    const headlessBack = makeSliceRgba({
      topY: 16,
      bottomY: 168,
      leftX: 34,
      rightX: 86,
      headCrownNarrow: false,
      rgb: [58, 46, 38],
    });
    const mHeadless = inspectPixelSliceQc(headlessBack.buf, headlessBack.width, headlessBack.height);
    assert.equal(mHeadless.clippedTop, true);
    const clean0 = makeSliceRgba({
      topY: 12,
      bottomY: 168,
      leftX: 40,
      rightX: 80,
      headCrownNarrow: true,
      rgb: [58, 46, 38],
    });
    const mClean0 = inspectPixelSliceQc(clean0.buf, clean0.width, clean0.height);
    const headlessReport = evaluateTurnaroundConsistencyQc({ 0: mClean0, 225: mHeadless });
    assert.equal(headlessReport.ok, false);
    assert.ok(headlessReport.failedAngles.includes(225));

    // 2) Thigh-cut half-body even after being stretched to fill 79% vertical stature (heightAspect < 2.08 with wide bottom cut)
    const stretchedThighCut = makeSliceRgba({
      topY: 16,
      bottomY: 158,
      leftX: 20,
      rightX: 100,
      headCrownNarrow: true,
      rgb: [58, 46, 38],
    });
    const mThighCut = inspectPixelSliceQc(
      stretchedThighCut.buf,
      stretchedThighCut.width,
      stretchedThighCut.height
    );
    assert.equal(mThighCut.halfBody, true);
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
