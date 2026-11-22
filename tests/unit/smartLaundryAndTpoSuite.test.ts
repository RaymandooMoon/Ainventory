import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractRecentCalendarGarmentIds,
  formatCareSummaryTokens,
  inferDefaultCareServiceType,
  inferGarmentCareProfile,
  resolveGarmentCareProfile,
  sortLaundryBasket,
} from '../../src/utils/garmentCareEngine.ts';
import {
  applyStylingDensityFilter,
  inferTpoFromPlaceTypes,
} from '../../src/services/stylingPreferenceStore.ts';
import { buildLookTagPins } from '../../src/utils/lookTagPins.ts';
import { buildOutfitRationaleNote } from '../../src/utils/outfitRationaleEngine.ts';

describe('Smart Laundry Care Engine & Mixed-Load Conflict Detection', () => {
  it('infers conservative care profiles for cashmere coats, wool knits, raw denim, and leather goods', () => {
    const cashmereCoat = inferGarmentCareProfile({
      id: 1,
      name: '캐시미어 싱글 코트',
      category: 'outer',
      fabric: 'Cashmere 100%',
      color_name: '카멜',
    });
    assert.equal(cashmereCoat.washMethod, 'dry_clean_only');
    assert.equal(cashmereCoat.waterTempC, 0);

    const woolKnit = inferGarmentCareProfile({
      id: 2,
      name: '메리노 울 니트 스웨터',
      category: 'top',
      subcategory: 'knit',
      fabric: 'Merino Wool',
      color_name: '아이보리',
    });
    assert.equal(woolKnit.washMethod, 'wool_delicate');
    assert.equal(woolKnit.waterTempC, 30);
    assert.equal(woolKnit.tumbleDry, 'no_tumble_flat');
    assert.equal(woolKnit.needsLaundryNet, true);

    const rawDenim = inferGarmentCareProfile({
      id: 3,
      name: '생지 인디고 셀비지 데님',
      category: 'bottom',
      subcategory: 'denim',
      fabric: 'Raw Denim Cotton',
      color_name: '인디고',
    });
    assert.equal(rawDenim.colorBleedRisk, 'high');
    assert.equal(rawDenim.colorGroup, 'denim_indigo');

    const leatherBag = inferGarmentCareProfile({
      id: 4,
      name: '카프스킨 레더 토트백',
      category: 'accessory',
      subcategory: 'tote',
      fabric: 'Leather',
      color_name: '블랙',
    });
    assert.equal(leatherBag.washMethod, 'spot_clean');
  });

  it('prefers saved care_label_scan profile over inferred fallback', () => {
    const garment = {
      id: 10,
      name: '코튼 셔츠',
      category: 'top',
      fabric: 'Cotton',
      garment_details: {
        care_profile: {
          washMethod: 'dry_clean_only',
          waterTempC: 0,
          tumbleDry: 'no_tumble_hang',
          bleach: 'no_bleach',
          iron: 'low_cloth',
          colorBleedRisk: 'low',
          colorGroup: 'white_light',
          needsLaundryNet: false,
          source: 'care_label_scan',
        },
      },
    };
    const resolved = resolveGarmentCareProfile(garment);
    assert.equal(resolved.washMethod, 'dry_clean_only');
    assert.equal(resolved.source, 'care_label_scan');
    const tokens = formatCareSummaryTokens(resolved, 'ko');
    assert.ok(tokens.length >= 2);
  });

  it('sorts mixed laundry basket into wash buckets and flags critical conflicts', () => {
    const garments = [
      { id: 1, name: '캐시미어 코트', category: 'outer', fabric: 'Cashmere', color_name: '블랙' },
      { id: 2, name: '울 니트', category: 'top', subcategory: 'knit', fabric: 'Wool', color_name: '그레이' },
      { id: 3, name: '생지 데님', category: 'bottom', subcategory: 'denim', fabric: 'Raw Denim', color_name: '인디고' },
      { id: 4, name: '화이트 코튼 티셔츠', category: 'top', fabric: 'Cotton', color_name: '화이트', color_hex: '#FFFFFF' },
    ];

    const plan = sortLaundryBasket(garments);
    assert.equal(plan.totalCount, 4);
    assert.equal(plan.canWashTogether, false);

    const bucketKeys = plan.buckets.map((b) => b.key);
    assert.ok(bucketKeys.includes('dry_clean'));
    assert.ok(bucketKeys.includes('wool_hand'));
    assert.ok(bucketKeys.includes('dark_normal'));
    assert.ok(bucketKeys.includes('light_normal'));

    const conflictCodes = plan.conflicts.map((c) => c.code);
    assert.ok(conflictCodes.includes('dry_clean_mixed'));
    assert.ok(conflictCodes.includes('wool_shrink_risk'));
    assert.ok(conflictCodes.includes('color_bleed_risk'));
    assert.ok(conflictCodes.includes('no_tumble_dry'));
  });

  it('extracts worn garment IDs from calendar logs within the last 7 days', () => {
    const logs = [
      { worn_date: '2026-11-21', outfit_id: 101 },
      { worn_date: '2026-11-18', garment_ids: [3, 4] },
      { worn_date: '2026-11-01', outfit_id: 102 }, // older than 7 days
    ];
    const outfits = [
      { id: 101, items: [{ id: 1 }, { id: 2 }] },
      { id: 102, items: [{ id: 99 }] },
    ];
    const ids = extractRecentCalendarGarmentIds(logs, outfits, 7, '2026-11-22');
    assert.deepEqual(ids.sort((a, b) => a - b), [1, 2, 3, 4]);
  });

  it('infers default nearby care service type from garment material', () => {
    assert.equal(
      inferDefaultCareServiceType({ name: '가죽 자켓', category: 'outer', fabric: 'Leather' }),
      'leather_care'
    );
    assert.equal(
      inferDefaultCareServiceType({ name: '캐시미어 코트', category: 'outer', fabric: 'Cashmere' }),
      'dry_clean'
    );
  });
});

describe('Styling Density, TPO Inference, 0°/180° Tag Pins, and Outfit Rationale', () => {
  it('filters equipped slots cleanly by Minimal / Balanced / Layered and Bag/Accessory toggles', () => {
    const fullSlots = {
      outer: { id: 1, name: '트렌치 코트' },
      outer_mid: { id: 2, name: '울 가디건' },
      top: { id: 3, name: '코튼 셔츠' },
      bottom: { id: 4, name: '슬랙스' },
      shoes: { id: 5, name: '로퍼' },
      acc_bag: { id: 6, name: '레더 토트백' },
      acc_eye: { id: 7, name: '안경' },
      acc_ring: { id: 8, name: '실버 링' },
    };

    const minimalNoBag = applyStylingDensityFilter(
      fullSlots,
      { density: 'minimal', includeBag: false, includeAccessory: false },
      { tempMax: 20, tempMin: 14 }
    );
    assert.equal(minimalNoBag.outer_mid, null);
    assert.equal(minimalNoBag.outer, null);
    assert.equal(minimalNoBag.acc_bag, null);
    assert.equal(minimalNoBag.acc_eye, null);
    assert.equal(minimalNoBag.acc_ring, null);
    assert.ok(minimalNoBag.top && minimalNoBag.bottom && minimalNoBag.shoes);

    const balancedWithBag = applyStylingDensityFilter(
      fullSlots,
      { density: 'balanced', includeBag: true, includeAccessory: false },
      { tempMax: 18, tempMin: 14 }
    );
    assert.ok(balancedWithBag.outer);
    assert.equal(balancedWithBag.outer_mid, null);
    assert.ok(balancedWithBag.acc_bag);
    assert.equal(balancedWithBag.acc_eye, null);

    const layeredFull = applyStylingDensityFilter(
      fullSlots,
      { density: 'layered', includeBag: true, includeAccessory: true },
      { tempMax: 10, tempMin: 3 }
    );
    assert.ok(layeredFull.outer && layeredFull.outer_mid && layeredFull.acc_bag && layeredFull.acc_eye);
  });

  it('infers TPO category from Google Places types and Korean/English place names', () => {
    assert.equal(inferTpoFromPlaceTypes('corporate_office', [], '여의도 IFC').tpoCategory, 'office');
    assert.equal(inferTpoFromPlaceTypes('cafe', ['coffee_shop'], '성수동 카페').tpoCategory, 'cafe_casual');
    assert.equal(inferTpoFromPlaceTypes('park', [], '한강공원').tpoCategory, 'outdoor_active');
    assert.equal(inferTpoFromPlaceTypes('art_gallery', [], '리움 미술관').tpoCategory, 'formal_dining');
  });

  it('renders interactive look tag pins strictly at 0° and 180° and returns empty for side angles', () => {
    const slots = {
      top: { id: 1, name: '울 크루넥 니트', brand: 'COS', product_code: 'COS-101', price: 150000, fabric: 'Wool 100%' },
      bottom: { id: 2, name: '와이드 슬랙스', brand: 'Lemaire', product_code: 'LM-202', price: 540000, fabric: 'Wool Twill' },
      shoes: { id: 3, name: '더비 슈즈', brand: 'Paraboot', product_code: 'PB-303', price: 620000, fabric: 'Calf Leather' },
    };

    const frontPins = buildLookTagPins({ slots, viewAngleDeg: 0, lang: 'ko' });
    const backPins = buildLookTagPins({ slots, viewAngleDeg: 180, lang: 'ko' });
    const side45 = buildLookTagPins({ slots, viewAngleDeg: 45, lang: 'ko' });
    const side90 = buildLookTagPins({ slots, viewAngleDeg: 90, lang: 'ko' });
    const side270 = buildLookTagPins({ slots, viewAngleDeg: 270, lang: 'ko' });

    assert.equal(frontPins.length, 3);
    assert.equal(backPins.length, 3);
    assert.equal(side45.length, 0);
    assert.equal(side90.length, 0);
    assert.equal(side270.length, 0);

    assert.equal(frontPins[0].brand, 'COS');
    assert.equal(frontPins[0].productCode, 'COS-101');
    assert.ok(frontPins[0].priceText.includes('150,000'));
    assert.equal(frontPins[0].materialText, 'Wool 100%');
  });

  it('builds a 4-row Outfit Rationale Note reflecting Place/TPO, Weather, Density, and Skin Tone', () => {
    const note = buildOutfitRationaleNote({
      slots: {
        outer: { id: 1, name: '네이비 블레이저', color_name: '네이비' },
        top: { id: 2, name: '화이트 셔츠', color_name: '화이트' },
        bottom: { id: 3, name: '차콜 슬랙스', color_name: '차콜' },
        shoes: { id: 4, name: '블랙 로퍼', color_name: '블랙' },
      },
      weather: { avgTemp: 15, tempMin: 11, tempMax: 18, summary: '맑음' },
      selectedPlace: {
        placeId: 'p1',
        name: '여의도 IFC몰',
        formattedAddress: '서울 영등포구',
        lat: 37.525,
        lng: 126.925,
        tpoCategory: 'office',
        tpoLabelKo: '오피스 · 비즈니스',
        tpoLabelEn: 'Office · Business',
      },
      stylingPref: { density: 'balanced', includeBag: true, includeAccessory: false },
      skinProfile: { seasonLabel: '겨울 쿨톤' },
      lang: 'ko',
    });

    assert.equal(note.equippedCount, 4);
    assert.equal(note.items.length, 4);
    assert.ok(note.headline.includes('여의도 IFC몰'));
    assert.ok(note.items.some((r) => r.key === 'tpo' && r.summary.includes('여의도 IFC몰')));
    assert.ok(note.items.some((r) => r.key === 'density' && r.summary.includes('밸런스')));
  });
});
