import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSaggingVtonDirective,
  classifyUnderwearProfile,
  doesUnderwearMatchGender,
  evaluateUnderwearOuterInteraction,
  isSaggingEligibleBottom,
} from '../../src/shared/underwearStylingEngine.js';
import {
  FITTING_SLOTS,
  isUnderwearGarment,
  isWearableStudioGarment,
  mapGarmentToDefaultSubSlot,
  mapGarmentToFittingSlot,
  resolveParentFittingTab,
} from '../../src/services/fittingRenderer.ts';
import { computeOutfitComboId } from '../../src/services/vton2DService.ts';

test('isSaggingEligibleBottom matches jeans, sweatpants/joggers, cargo/baggy pants and excludes formal slacks/skirts', () => {
  assert.equal(
    isSaggingEligibleBottom({ category: 'bottom', subcategory: 'denim', name: '워시드 배기 청바지' }),
    true
  );
  assert.equal(
    isSaggingEligibleBottom({ category: 'bottom', subcategory: 'jogger', name: '헤비 코튼 트레이닝 조거 팬츠' }),
    true
  );
  assert.equal(
    isSaggingEligibleBottom({ category: 'bottom', subcategory: 'cargo', name: '스트릿 와이드 카고 팬츠' }),
    true
  );
  assert.equal(
    isSaggingEligibleBottom({ category: 'bottom', subcategory: 'slacks', name: '포멀 정장 슬랙스' }),
    false
  );
  assert.equal(
    isSaggingEligibleBottom({ category: 'bottom', subcategory: 'skirt', name: '플리츠 미디 스커트' }),
    false
  );
  assert.equal(
    isSaggingEligibleBottom({ category: 'top', subcategory: 'hoodie', name: '오버사이즈 후디' }),
    false
  );
});

test('evaluateUnderwearOuterInteraction contrasts black lace vs nude seamless under a thin white dress', () => {
  const thinWhiteDress = {
    name: '화이트 시어 린넨 썸머 슬립 원피스',
    category: 'dress',
    subcategory: 'dress',
    color_name: '아이보리 화이트',
    color_hex: '#F6F5F0',
    fabric: 'linen',
    garment_details_json: JSON.stringify({ thickness: 'thin', opacity_level: 'semi_sheer', fit: 'slim' }),
  };

  const blackLace = {
    name: '제트 블랙 레이스 브라렛 & 브리프 세트',
    category: 'underwear',
    subcategory: 'lace_underwear',
    color_name: '블랙',
    color_hex: '#141417',
    fabric: 'lace',
  };

  const nudeSeamless = {
    name: '누드 베이지 심리스 노라인 이너웨어 세트',
    category: 'underwear',
    subcategory: 'seamless_underwear',
    color_name: '누드 베이지',
    color_hex: '#D6B8A3',
    fabric: 'microfiber',
  };

  const blackResult = evaluateUnderwearOuterInteraction({
    underwear: blackLace,
    outerGarment: thinWhiteDress,
    gender: 'female',
  });
  assert.equal(blackResult.showThroughLevel, 'visible');
  assert.equal(blackResult.vplLevel, 'visible');
  assert.equal(blackResult.riskLevel, 'high');
  assert.ok(blackResult.vtonDirective.includes('REALISTIC FABRIC TRANSLUCENCY'));

  const nudeResult = evaluateUnderwearOuterInteraction({
    underwear: nudeSeamless,
    outerGarment: thinWhiteDress,
    gender: 'female',
  });
  assert.equal(nudeResult.showThroughLevel, 'none');
  assert.equal(nudeResult.vplLevel, 'none');
  assert.equal(nudeResult.riskLevel, 'low');
  assert.ok(nudeResult.vtonDirective.includes('CLEAN SEAMLESS UNDERLAYER FIT'));
});

test('buildSaggingVtonDirective emits hip-hop sagging waistband directive only when enabled on eligible pants', () => {
  const jeans = { category: 'bottom', subcategory: 'denim', name: '힙합 배기 데님 팬츠' };
  const boxerBriefs = {
    category: 'underwear',
    subcategory: 'boxer_briefs',
    name: '힙합 로고 밴드 블랙 드로즈 언더웨어',
    color_name: '블랙',
    color_hex: '#161618',
  };

  assert.equal(buildSaggingVtonDirective({ saggingFit: false, bottom: jeans, underwear: boxerBriefs }), '');
  const directive = buildSaggingVtonDirective({ saggingFit: true, bottom: jeans, underwear: boxerBriefs });
  assert.ok(directive.includes('AUTHENTIC DEEP HIP-HOP / STREETWEAR SAGGING PANTS FIT'));
  assert.ok(directive.includes('DEEP DROP-CROTCH'));
  assert.ok(directive.includes('STRICT ANTI-ROLL / ANTI-BUNCH RULE'));
  assert.ok(directive.includes('10cm–14cm'));
  assert.ok(!directive.includes('gathered above the hip'));
  assert.ok(directive.includes('힙합 로고 밴드 블랙 드로즈 언더웨어'));

  const profile = classifyUnderwearProfile(boxerBriefs);
  assert.equal(profile?.isDesignerWaistband, true);
});

test('fittingRenderer isolates underwear and socks into dedicated slots without leaking into accessory', () => {
  const slotKeys = FITTING_SLOTS.map((s) => s.key);
  assert.ok(slotKeys.includes('underwear'));
  assert.ok(slotKeys.includes('socks'));

  const boxer = { category: 'underwear', subcategory: 'boxer_briefs', name: '블랙 드로즈', status: 'active' };
  const socks = { category: 'socks', subcategory: 'street_crew_socks', name: '화이트 크루 삭스', status: 'active' };

  assert.equal(isWearableStudioGarment(boxer), true);
  assert.equal(isWearableStudioGarment(socks), true);
  assert.equal(mapGarmentToFittingSlot(boxer), 'underwear');
  assert.equal(mapGarmentToFittingSlot(socks), 'socks');
});

test('computeOutfitComboId differentiates saggingFit ON vs OFF for clean VTON cache invalidation', () => {
  const slots = {
    bottom: { id: 42, category: 'bottom', subcategory: 'denim', color_hex: '#2B3A52', image_url: '/seed/s4-denim.webp' },
    underwear: { id: 901, category: 'underwear', subcategory: 'boxer_briefs', color_hex: '#161618', image_url: '/seed/studio-hiphop-boxer-briefs.webp' },
  };
  const standard = computeOutfitComboId(slots, 'right', { saggingFit: false });
  const sagging = computeOutfitComboId(slots, 'right', { saggingFit: true });
  assert.notEqual(standard.outfitComboId, sagging.outfitComboId);
  assert.ok(standard.equippedSlotKeys.includes('underwear'));
});

test('server buildGeminiTryOnPrompt applies deep sagging per-slot overrides, anti-roll flat tee hem, and suppresses conflicting rise', async () => {
  const { buildGeminiTryOnPrompt, normalizeVtonProfile } = await import('../../server/vtonService.js');
  const profile = normalizeVtonProfile({ gender: 'male', viewAngleDeg: 0, saggingFit: true });
  const prompt = buildGeminiTryOnPrompt(profile, {
    top: {
      slot: 'top',
      category: 'top',
      subcategory: 'tshirt',
      name: '화이트 박시 크루넥 티셔츠',
      colorName: '화이트',
      colorHex: '#F5F5F3',
      fabric: 'cotton',
    },
    underwear: {
      slot: 'underwear',
      category: 'underwear',
      subcategory: 'boxer_briefs',
      name: '힙합 로고 밴드 블랙 드로즈 언더웨어',
      colorName: '블랙',
      colorHex: '#161618',
      fabric: 'cotton',
    },
    bottom: {
      slot: 'bottom',
      category: 'bottom',
      subcategory: 'cargo',
      name: '블랙 멀티지퍼 바우하우스 카고 팬츠',
      colorName: '블랙',
      colorHex: '#1E1E20',
      fabric: 'cotton',
      garmentDetails: { rise: 'high', waist_type: 'drawstring' },
    },
  });

  assert.ok(prompt.includes('HERO EXPOSED SAGGING LAYER'));
  assert.ok(prompt.includes('DEEP HIP-HOP SAGGING PANTS FIT OVERRIDE'));
  assert.ok(prompt.includes('FLAT STRAIGHT-HEM STREETWEAR DRAPE'));
  assert.ok(prompt.includes('WRIST-BONE height'));
  assert.ok(prompt.includes('BELOW THE FINGERTIPS'));
  assert.ok(prompt.includes('BRIGHT CRISP WHITE'));
  assert.ok(!prompt.includes('high rise'));
});

test('briefcase bags containing 브리프 NEVER classify as underwear and route cleanly to accessory', () => {
  const feltBriefBag = {
    name: '차콜 메리노 울 펠트 브리프백',
    category: 'accessory',
    subcategory: 'briefcase',
    status: 'active',
  };
  const leatherBriefcase = {
    name: '에스프레소 브리프케이스 서류가방',
    category: 'bag',
    subcategory: 'briefcase',
    status: 'active',
  };
  const unnamedBriefBag = {
    name: '미니멀 레더 브리프백',
    category: '',
    subcategory: '',
    status: 'active',
  };

  assert.equal(isUnderwearGarment(feltBriefBag), false);
  assert.equal(mapGarmentToFittingSlot(feltBriefBag), 'accessory');
  assert.equal(isUnderwearGarment(leatherBriefcase), false);
  assert.equal(mapGarmentToFittingSlot(leatherBriefcase), 'accessory');
  assert.equal(isUnderwearGarment(unnamedBriefBag), false);
});

test('doesUnderwearMatchGender isolates male underwear for male profiles and includes nubra/thong for female profiles', () => {
  const maleBoxers = {
    name: '힙합 로고 밴드 블랙 드로즈 언더웨어',
    category: 'underwear',
    subcategory: 'boxer_briefs',
    garment_details_json: JSON.stringify({ target_gender: 'male' }),
  };
  const maleTrunks = {
    name: '네이비 체크 우븐 코튼 트렁크 복서',
    category: 'underwear',
    subcategory: 'woven_boxers',
    garment_details_json: JSON.stringify({ target_gender: 'male' }),
  };
  const femaleLace = {
    name: '제트 블랙 레이스 브라렛 & 브리프 세트',
    category: 'underwear',
    subcategory: 'lace_underwear',
    garment_details_json: JSON.stringify({ target_gender: 'female' }),
  };
  const femaleNubra = {
    name: '누드 실리콘 심리스 누브라',
    category: 'underwear',
    subcategory: 'nubra',
    color_name: '누드 베이지',
    color_hex: '#D8BDA8',
    fabric: 'silicone',
    garment_details_json: JSON.stringify({
      target_gender: 'female',
      underwear_style: 'nubra',
      seam_profile: 'seamless',
      strapless: true,
    }),
  };
  const femaleThong = {
    name: '제트 블랙 레이저컷 심리스 T팬티',
    category: 'underwear',
    subcategory: 'thong_underwear',
    color_name: '블랙',
    color_hex: '#1B1B1E',
    fabric: 'microfiber',
    garment_details_json: JSON.stringify({
      target_gender: 'female',
      underwear_style: 'thong',
      seam_profile: 'seamless',
      vpl_free: true,
    }),
  };

  // Male profile sees ONLY male underwear (no female lace, nubra, or thong)
  assert.equal(doesUnderwearMatchGender(maleBoxers, 'male'), true);
  assert.equal(doesUnderwearMatchGender(maleTrunks, 'male'), true);
  assert.equal(doesUnderwearMatchGender(femaleLace, 'male'), false);
  assert.equal(doesUnderwearMatchGender(femaleNubra, 'male'), false);
  assert.equal(doesUnderwearMatchGender(femaleThong, 'male'), false);

  // Female profile sees female underwear including nubra & T팬티 (no male boxers/trunks)
  assert.equal(doesUnderwearMatchGender(maleBoxers, 'female'), false);
  assert.equal(doesUnderwearMatchGender(maleTrunks, 'female'), false);
  assert.equal(doesUnderwearMatchGender(femaleLace, 'female'), true);
  assert.equal(doesUnderwearMatchGender(femaleNubra, 'female'), true);
  assert.equal(doesUnderwearMatchGender(femaleThong, 'female'), true);

  // Slot mapping & underwear styling engine profile classification
  assert.equal(isUnderwearGarment(femaleNubra), true);
  assert.equal(mapGarmentToFittingSlot(femaleNubra), 'underwear');
  assert.equal(isUnderwearGarment(femaleThong), true);
  assert.equal(mapGarmentToFittingSlot(femaleThong), 'underwear');

  const nubraProfile = classifyUnderwearProfile(femaleNubra);
  assert.equal(nubraProfile?.isNubra, true);
  assert.equal(nubraProfile?.isSeamless, true);

  const thongProfile = classifyUnderwearProfile(femaleThong);
  assert.equal(thongProfile?.isThong, true);
  assert.equal(thongProfile?.isSeamless, true);

  const slipDress = {
    name: '블랙 실크 슬립 원피스',
    category: 'dress',
    subcategory: 'dress',
    color_hex: '#18181A',
    fabric: 'silk',
    garment_details_json: JSON.stringify({ thickness: 'thin', fit: 'slim' }),
  };

  const nubraInteraction = evaluateUnderwearOuterInteraction({
    underwear: femaleNubra,
    outerGarment: slipDress,
    gender: 'female',
  });
  assert.equal(nubraInteraction.vplLevel, 'none');
  assert.ok(nubraInteraction.vtonDirective.includes('NUBRA FIT'));

  const thongInteraction = evaluateUnderwearOuterInteraction({
    underwear: femaleThong,
    outerGarment: slipDress,
    gender: 'female',
  });
  assert.equal(thongInteraction.vplLevel, 'none');
  assert.ok(thongInteraction.vtonDirective.includes('ZERO-VPL THONG'));
});

test('multi-underwear equips nubra/inner_top to underwear_top simultaneously with thong/boxers in underwear', () => {
  const nubra = {
    id: 908,
    name: '누드 실리콘 심리스 누브라',
    category: 'underwear',
    subcategory: 'nubra',
    color_hex: '#D8BDA8',
  };
  const thong = {
    id: 909,
    name: '제트 블랙 레이저컷 심리스 T팬티',
    category: 'underwear',
    subcategory: 'thong_underwear',
    color_hex: '#1B1B1E',
  };
  const innerTop = {
    id: 910,
    name: '심리스 립 모달 발열 이너탑',
    category: 'underwear',
    subcategory: 'inner_top',
    color_hex: '#EBE8E1',
  };
  const boxers = {
    id: 901,
    name: '힙합 로고 밴드 블랙 드로즈 언더웨어',
    category: 'underwear',
    subcategory: 'boxer_briefs',
    color_hex: '#161618',
  };

  assert.equal(mapGarmentToDefaultSubSlot(nubra), 'underwear_top');
  assert.equal(mapGarmentToDefaultSubSlot(innerTop), 'underwear_top');
  assert.equal(mapGarmentToDefaultSubSlot(thong), 'underwear');
  assert.equal(mapGarmentToDefaultSubSlot(boxers), 'underwear');
  assert.equal(resolveParentFittingTab('underwear_top'), 'underwear');

  const combo = computeOutfitComboId({ underwear_top: nubra, underwear: thong }, 'right');
  assert.equal(combo.equippedSlotKeys.includes('underwear_top'), true);
  assert.equal(combo.equippedSlotKeys.includes('underwear'), true);
  assert.equal(combo.equippedGarments.length, 2);
});

test('server buildGeminiTryOnPrompt supports standalone lingerie/intimates lookbook mode without covering T-shirt or trousers', async () => {
  const { buildGeminiTryOnPrompt, normalizeVtonProfile } = await import('../../server/vtonService.js');
  const femaleProfile = normalizeVtonProfile({ gender: 'female', viewAngleDeg: 0 });

  // Case 1: Combined Nubra + T-string lookbook
  const dualPrompt = buildGeminiTryOnPrompt(femaleProfile, {
    underwear_top: {
      slot: 'underwear_top',
      category: 'underwear',
      subcategory: 'nubra',
      name: '누드 실리콘 심리스 누브라',
      colorName: '누드 베이지',
      colorHex: '#D8BDA8',
      fabric: 'silicone',
    },
    underwear: {
      slot: 'underwear',
      category: 'underwear',
      subcategory: 'thong_underwear',
      name: '제트 블랙 레이저컷 심리스 T팬티',
      colorName: '블랙',
      colorHex: '#1B1B1E',
      fabric: 'microfiber',
    },
  });

  assert.ok(dualPrompt.includes('HIGH-FASHION INTIMATES / LINGERIE EDITORIAL STUDIO LOOKBOOK'));
  assert.ok(dualPrompt.includes('DO NOT cover them with an outer T-shirt'));
  assert.ok(!dualPrompt.includes('crew-neck studio inner tee'));
  assert.ok(!dualPrompt.includes('straight tailored studio trousers'));
  assert.ok(dualPrompt.includes('studio slides'));

  // Case 2: Single T-string alone adds modest matching bandeau coverage so Gemini can render safely
  const singleThongPrompt = buildGeminiTryOnPrompt(femaleProfile, {
    underwear: {
      slot: 'underwear',
      category: 'underwear',
      subcategory: 'thong_underwear',
      name: '제트 블랙 레이저컷 심리스 T팬티',
      colorName: '블랙',
      colorHex: '#1B1B1E',
      fabric: 'microfiber',
    },
  });
  assert.ok(singleThongPrompt.includes('HIGH-FASHION INTIMATES / LINGERIE EDITORIAL STUDIO LOOKBOOK'));
  assert.ok(singleThongPrompt.includes('bandeau bralette'));
  assert.ok(!singleThongPrompt.includes('straight tailored studio trousers'));
});


