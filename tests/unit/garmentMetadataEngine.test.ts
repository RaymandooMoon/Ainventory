import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  buildWeatherRecommendations,
  isBottomBeltCompatible,
  parseGarmentDetails,
} from '../../server/engine.js';

const ROOT = process.cwd();

function makeGarment(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    status: 'active',
    name: '기본 아이템',
    category: 'top',
    subcategory: 'shirt',
    color_name: '화이트',
    color_hex: '#F5F5F7',
    fabric: 'cotton',
    formality: 'smart',
    min_temp: 5,
    max_temp: 25,
    wear_count: 2,
    water_resistant: false,
    ...overrides,
  };
}

describe('Garment Metadata & Weather Recommendation Engine Rules', () => {
  it('parses garment_details objects and JSON strings safely', () => {
    assert.deepEqual(
      parseGarmentDetails({ garment_details: { belt_compatible: false, waist_type: 'elastic' } }),
      { belt_compatible: false, waist_type: 'elastic' }
    );
    assert.deepEqual(
      parseGarmentDetails({
        garment_details_json: JSON.stringify({ belt_compatible: true, rise: 'high' }),
      }),
      { belt_compatible: true, rise: 'high' }
    );
    assert.deepEqual(parseGarmentDetails({ garment_details_json: '{bad json' }), {});
  });

  it('determines bottom belt compatibility from explicit flags, waist_type, and legacy heuristics', () => {
    assert.equal(
      isBottomBeltCompatible({
        name: '코듀로이 와이드 팬츠',
        garment_details: { waist_type: 'elastic', belt_compatible: false },
      }),
      false
    );
    assert.equal(
      isBottomBeltCompatible({
        name: '코듀로이 밴딩 팬츠',
        garment_details_json: JSON.stringify({ waist_type: 'elastic', belt_compatible: false }),
      }),
      false
    );
    assert.equal(
      isBottomBeltCompatible({
        name: '드로우스트링 코튼 팬츠',
        garment_details: { waist_type: 'drawstring' },
      }),
      false
    );
    assert.equal(
      isBottomBeltCompatible({
        name: '테일러드 울 슬랙스',
        garment_details: { waist_type: 'belt_loops', belt_compatible: true },
      }),
      true
    );
    assert.equal(
      isBottomBeltCompatible({
        name: '세미 밴딩 슬랙스',
        garment_details: { waist_type: 'semi_elastic', belt_compatible: true },
      }),
      true
    );
    assert.equal(
      isBottomBeltCompatible({
        name: '플리스 조거 팬츠',
        subcategory: 'jogger',
      }),
      false
    );
  });

  it('strictly excludes belts from weather looks when chosen bottom has belt_compatible === false', () => {
    const weather = {
      tempMin: 8,
      tempMax: 16,
      precipProb: 10,
      windSpeed: 8,
      weatherCode: 1,
      condition: '맑음',
    };

    const elasticCorduroy = makeGarment({
      id: 101,
      name: '올리브 코듀로이 밴딩 면바지',
      category: 'bottom',
      subcategory: 'trousers',
      color_name: '올리브',
      color_hex: '#556B2F',
      fabric: 'corduroy',
      formality: 'smart',
      fit: 'wide',
      style_mood: 'casual',
      thickness: 'medium',
      garment_details: {
        waist_type: 'elastic',
        belt_compatible: false,
        rise: 'high',
        length_profile: 'full',
      },
    });

    const leatherBelt = makeGarment({
      id: 201,
      name: '블랙 카프스킨 벨트',
      category: 'accessory',
      subcategory: 'belt',
      slot_key: 'acc_belt',
      color_name: '블랙',
      color_hex: '#1D1D1F',
      fabric: 'leather',
      formality: 'formal',
    });

    const closet = [
      makeGarment({ id: 1, name: '화이트 셔츠', category: 'top', subcategory: 'shirt' }),
      elasticCorduroy,
      makeGarment({ id: 2, name: '블랙 로퍼', category: 'shoes', subcategory: 'loafer' }),
      leatherBelt,
    ];

    const { recommendations: recs } = buildWeatherRecommendations(weather, closet, [], null, {
      look1Style: 'formal_office',
      look2Style: 'business_casual',
    });

    assert.ok(recs.length >= 1);
    for (const rec of recs) {
      assert.equal(rec.loadoutBySlot.bottom?.id, elasticCorduroy.id);
      assert.equal(rec.loadoutBySlot.acc_belt, null);
      assert.equal(rec.loadoutBySlot.belt, null);
      assert.equal(
        rec.items.some((it: { id: number }) => it.id === leatherBelt.id),
        false,
        'Belt must be excluded when bottom has belt_compatible === false'
      );
      assert.ok(
        String(rec.rationale || '').includes('벨트'),
        'Expected transparent styling rationale explaining belt exclusion'
      );
    }
  });

  it('includes a matching belt for formal/business looks when chosen bottom is belt-compatible', () => {
    const weather = {
      tempMin: 10,
      tempMax: 18,
      precipProb: 5,
      windSpeed: 6,
      weatherCode: 1,
      condition: '맑음',
    };

    const tailoredSlacks = makeGarment({
      id: 102,
      name: '차콜 울 테일러드 슬랙스',
      category: 'bottom',
      subcategory: 'slacks',
      color_name: '차콜',
      color_hex: '#2F3136',
      fabric: 'wool',
      formality: 'formal',
      fit: 'straight',
      style_mood: 'formal',
      garment_details: {
        waist_type: 'belt_loops',
        belt_compatible: true,
        rise: 'mid',
        length_profile: 'full',
      },
    });

    const leatherBelt = makeGarment({
      id: 202,
      name: '블랙 드레스 레더 벨트',
      category: 'accessory',
      subcategory: 'belt',
      slot_key: 'acc_belt',
      color_name: '블랙',
      color_hex: '#1D1D1F',
      fabric: 'leather',
      formality: 'formal',
    });

    const closet = [
      makeGarment({ id: 1, name: '화이트 옥스포드 셔츠', category: 'top', subcategory: 'shirt', formality: 'formal' }),
      tailoredSlacks,
      makeGarment({ id: 2, name: '블랙 더비 슈즈', category: 'shoes', subcategory: 'derby', formality: 'formal' }),
      leatherBelt,
    ];

    const { recommendations: recs } = buildWeatherRecommendations(weather, closet, [], null, {
      look1Style: 'formal_office',
      look2Style: 'business_casual',
    });

    assert.ok(recs.length >= 1);
    assert.equal(recs[0].loadoutBySlot.bottom?.id, tailoredSlacks.id);
    assert.equal(recs[0].loadoutBySlot.acc_belt?.id, leatherBelt.id);
    assert.equal(
      recs[0].items.some((it: { id: number }) => it.id === leatherBelt.id),
      true
    );
  });

  it('ranks garments by style_mood and fit affinity across formal vs street presets', () => {
    const weather = {
      tempMin: 12,
      tempMax: 20,
      precipProb: 10,
      windSpeed: 7,
      weatherCode: 1,
      condition: '맑음',
    };

    const formalBottom = makeGarment({
      id: 301,
      name: '네이비 팬츠 A',
      category: 'bottom',
      subcategory: 'trousers',
      color_name: '네이비',
      color_hex: '#1F2A44',
      formality: 'smart',
      fit: 'straight',
      style_mood: 'formal',
    });

    const streetBottom = makeGarment({
      id: 302,
      name: '네이비 팬츠 B',
      category: 'bottom',
      subcategory: 'trousers',
      color_name: '네이비',
      color_hex: '#1F2A44',
      formality: 'smart',
      fit: 'oversized',
      style_mood: 'street',
    });

    const closet = [
      makeGarment({ id: 1, name: '화이트 상의', category: 'top', subcategory: 'knit' }),
      formalBottom,
      streetBottom,
      makeGarment({ id: 2, name: '블랙 슈즈', category: 'shoes', subcategory: 'sneakers' }),
    ];

    const { recommendations: formalRecs } = buildWeatherRecommendations(weather, closet, [], null, {
      look1Style: 'formal_office',
      look2Style: 'street',
    });

    assert.equal(formalRecs[0].loadoutBySlot.bottom?.id, formalBottom.id);
    assert.equal(formalRecs[1].loadoutBySlot.bottom?.id, streetBottom.id);
  });

  it('ranks thick vs thin garments accurately according to cold vs warm temperatures', () => {
    const thickPants = makeGarment({
      id: 401,
      name: '헤비 코튼 팬츠',
      category: 'bottom',
      subcategory: 'trousers',
      color_name: '베이지',
      color_hex: '#C8B9A6',
      min_temp: 0,
      max_temp: 30,
      thickness: 'thick',
    });
    const thinPants = makeGarment({
      id: 402,
      name: '라이트 코튼 팬츠',
      category: 'bottom',
      subcategory: 'trousers',
      color_name: '베이지',
      color_hex: '#C8B9A6',
      min_temp: 0,
      max_temp: 30,
      thickness: 'thin',
    });

    const closet = [
      makeGarment({ id: 1, name: '상의', category: 'top', subcategory: 'shirt', min_temp: 0, max_temp: 30 }),
      thickPants,
      thinPants,
      makeGarment({ id: 2, name: '슈즈', category: 'shoes', subcategory: 'loafer', min_temp: 0, max_temp: 30 }),
    ];

    const { recommendations: coldRecs } = buildWeatherRecommendations(
      { tempMin: 2, tempMax: 8, precipProb: 10, windSpeed: 8, weatherCode: 1, condition: '맑음' },
      closet,
      [],
      null,
      { look1Style: 'minimal_daily', look2Style: 'comfortable_casual' }
    );
    const { recommendations: warmRecs } = buildWeatherRecommendations(
      { tempMin: 21, tempMax: 27, precipProb: 10, windSpeed: 6, weatherCode: 1, condition: '맑음' },
      closet,
      [],
      null,
      { look1Style: 'minimal_daily', look2Style: 'comfortable_casual' }
    );

    assert.equal(coldRecs[0].loadoutBySlot.bottom?.id, thickPants.id);
    assert.equal(warmRecs[0].loadoutBySlot.bottom?.id, thinPants.id);
  });

  it('retains VTON prompt construction directives for fit, texture_feel, belt_compatible: false, and fit_note', () => {
    const vtonSource = fs.readFileSync(path.join(ROOT, 'server', 'vtonService.js'), 'utf8');
    assert.match(vtonSource, /det\.belt_compatible === false/);
    assert.match(vtonSource, /NO belt loops, do NOT render a belt/);
    assert.match(vtonSource, /personal wearing fit note:/);
    assert.match(vtonSource, /drape\/handfeel/);
  });

  it('registers vision-analyze, web-lookup, and studio-cutout as stateless compute endpoints in api.ts', () => {
    const apiSource = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'api.ts'), 'utf8');
    assert.match(apiSource, /'\/garments\/vision-analyze'/);
    assert.match(apiSource, /'\/garments\/web-lookup'/);
    assert.match(apiSource, /'\/garments\/studio-cutout'/);
  });
});
