/**
 * Shared Underwear Show-Through / VPL Simulation & Hip-Hop/Street Sagging Pants Fit Engine
 * Pure ESM module usable by both React client UI and Node.js VTON server.
 */

const SAGGING_ELIGIBLE_SUBCATEGORIES = new Set([
  'jeans',
  'denim',
  'cargo',
  'jogger',
  'sweatpants',
  'track_pants',
  'chinos',
  'wide_pants',
  'baggy_pants',
  'parachute_pants',
  'street_pants',
  'pants',
]);

const SAGGING_EXCLUDED_SUBCATEGORIES = new Set([
  'skirt',
  'mini_skirt',
  'midi_skirt',
  'long_skirt',
  'slacks',
  'dress_pants',
  'suit_pants',
  'leggings',
  'tights',
]);

const SAGGING_ELIGIBLE_NAME_RE =
  /청바지|데님|트레이닝|조거|스웻팬츠|스웨트팬츠|트랙팬츠|카고|배기|와이드|파라슈트|스트릿|힙합|코듀로이|치노|면바지|denim|jeans?|jogger|sweatpants?|track\s*pants?|cargo|baggy|wide|parachute|hip[\s-]*hop|street/i;

const SAGGING_EXCLUDED_NAME_RE =
  /스커트|치마|정장\s*슬랙스|수트\s*팬츠|포멀\s*슬랙스|레깅스|skirt|formal\s*slacks?|suit\s*trousers?|leggings?/i;

const SHEER_OR_THIN_FABRICS = new Set([
  'silk',
  'linen',
  'chiffon',
  'satin',
  'mesh',
  'modal',
  'rayon',
  'viscose',
  'cotton',
  'jersey',
  'fabric',
]);

const HEAVY_OPAQUE_FABRICS = new Set([
  'denim',
  'leather',
  'suede',
  'wool',
  'tweed',
  'corduroy',
  'fleece',
  'down',
  'nylon',
  'cashmere',
]);

function parseHexToRgb(hex) {
  const raw = String(hex || '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

function computeRelativeLuminance(hex) {
  const rgb = parseHexToRgb(hex);
  if (!rgb) return 0.5;
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

function isWarmNudeTone(hex) {
  const rgb = parseHexToRgb(hex);
  if (!rgb) return false;
  const lum = computeRelativeLuminance(hex);
  return lum >= 0.52 && lum <= 0.86 && rgb.r >= rgb.g && rgb.g >= rgb.b && rgb.r - rgb.b >= 18;
}

function parseDetailsObject(garment) {
  if (!garment) return {};
  if (garment.garment_details && typeof garment.garment_details === 'object') {
    return garment.garment_details;
  }
  if (typeof garment.garment_details_json === 'string' && garment.garment_details_json.trim()) {
    try {
      const parsed = JSON.parse(garment.garment_details_json);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Determines whether a bottom garment supports Hip-Hop / Street sagging pants fit.
 * Eligible: jeans/denim, sweatpants/joggers/track pants, cargo/parachute/baggy/wide street pants.
 * Excluded: skirts, formal tailored suit slacks, leggings.
 */
export function isSaggingEligibleBottom(garment) {
  if (!garment || typeof garment !== 'object') return false;
  const category = String(garment.category || '').trim().toLowerCase();
  if (category && category !== 'bottom' && category !== 'bottoms') return false;

  const sub = String(garment.subcategory || '').trim().toLowerCase();
  const name = String(garment.name || '').trim();
  const details = parseDetailsObject(garment);

  if (details.sagging_eligible === true) return true;
  if (details.sagging_eligible === false) return false;

  if (SAGGING_EXCLUDED_SUBCATEGORIES.has(sub) || SAGGING_EXCLUDED_NAME_RE.test(name)) {
    return false;
  }
  if (SAGGING_ELIGIBLE_SUBCATEGORIES.has(sub)) {
    return true;
  }
  return SAGGING_ELIGIBLE_NAME_RE.test(name);
}

const FEMALE_ONLY_UNDERWEAR_SUBS = new Set([
  'nubra',
  'adhesive_bra',
  'thong_underwear',
  'lace_underwear',
  'seamless_underwear',
  'camisole',
]);

const MALE_ONLY_UNDERWEAR_SUBS = new Set(['boxer_briefs', 'woven_boxers']);

const FEMALE_UNDERWEAR_NAME_RE =
  /브라렛|누브라|실리콘\s*브라|접착\s*브라|스트랩리스\s*브라|티팬티|T팬티|T-?스트링|레이스|캐미솔|슬립|란제리|여성\s*속옷|여성\s*팬티|심리스\s*노라인\s*이너웨어|bralette|nubra|adhesive\s*bra|strapless\s*bra|thong|t[\s-]*string|lingerie|camisole|\bbra\b/i;

const MALE_UNDERWEAR_NAME_RE =
  /드로즈|박서|트렁크|남성\s*속옷|남성\s*팬티|boxer|trunks?/i;

/**
 * Checks whether an underwear garment matches the active profile gender ('male' | 'female').
 * Explicitly tagged items (`target_gender: 'male' | 'female'`) are strictly restricted;
 * untagged items fall back to subcategory/name heuristics while keeping true unisex thermal innerwear visible.
 */
export function doesUnderwearMatchGender(garment, gender = 'male') {
  if (!garment || typeof garment !== 'object') return false;
  const target = String(gender || 'male').trim().toLowerCase() === 'female' ? 'female' : 'male';
  const details = parseDetailsObject(garment);
  const explicitGender = String(details.target_gender || garment.target_gender || '')
    .trim()
    .toLowerCase();

  if (explicitGender === 'male') return target === 'male';
  if (explicitGender === 'female') return target === 'female';

  const sub = String(garment.subcategory || '').trim().toLowerCase();
  const name = String(garment.name || '').trim();

  if (FEMALE_ONLY_UNDERWEAR_SUBS.has(sub) || FEMALE_UNDERWEAR_NAME_RE.test(name)) {
    return target === 'female';
  }
  if (MALE_ONLY_UNDERWEAR_SUBS.has(sub) || MALE_UNDERWEAR_NAME_RE.test(name)) {
    return target === 'male';
  }
  return true;
}

/**
 * Classifies an underwear item's construction, waistband visibility, and seam profile.
 */
export function classifyUnderwearProfile(underwear) {
  if (!underwear || typeof underwear !== 'object') return null;
  const sub = String(underwear.subcategory || '').trim().toLowerCase();
  const name = String(underwear.name || '').trim();
  const details = parseDetailsObject(underwear);
  const hex = String(underwear.color_hex || '#1C1C1E');
  const lum = computeRelativeLuminance(hex);

  const isNubra =
    details.underwear_style === 'nubra' ||
    details.strapless === true ||
    sub === 'nubra' ||
    sub === 'adhesive_bra' ||
    /누브라|실리콘\s*브라|접착\s*브라|스트랩리스\s*브라|nubra|adhesive\s*bra|strapless\s*bra/i.test(name);

  const isThong =
    details.underwear_style === 'thong' ||
    sub === 'thong_underwear' ||
    /티팬티|T팬티|T-?스트링|thong|t[\s-]*string/i.test(name);

  const isSeamless =
    isNubra ||
    isThong ||
    details.seam_type === 'seamless' ||
    details.seam_profile === 'seamless' ||
    details.vpl_free === true ||
    sub === 'seamless_underwear' ||
    /심리스|노라인|무봉제|seamless|no[\s-]*show|laser[\s-]*cut/i.test(name);

  const isLace =
    !isNubra &&
    (details.seam_type === 'lace' ||
      details.seam_profile === 'lace' ||
      sub === 'lace_underwear' ||
      /레이스|lace|시스루|메쉬/i.test(name));

  const isDesignerWaistband =
    !isNubra &&
    !isThong &&
    !/브리프백|브리프케이스|briefcase|brief\s*bag/i.test(name) &&
    (details.waistband_visible === true ||
      sub === 'boxer_briefs' ||
      sub === 'woven_boxers' ||
      /드로즈|박서|트렁크|밴드|로고|체크|boxer|briefs?(?!\s*bag|case)|trunk|waistband/i.test(name));

  const isDarkColor = lum < 0.34;
  const isNudeTone = isWarmNudeTone(hex) || /누드|스킨|베이지|살구|nude|skin|sand|beige/i.test(name);
  const isHighContrastPattern =
    sub === 'woven_boxers' || /체크|스트라이프|패턴|plaid|check|stripe/i.test(name);

  return {
    isNubra,
    isThong,
    isSeamless,
    isLace,
    isDesignerWaistband,
    isDarkColor,
    isNudeTone,
    isHighContrastPattern,
    luminance: lum,
    colorName: String(underwear.color_name || '').trim() || (isDarkColor ? '블랙' : isNudeTone ? '누드 베이지' : '아이보리'),
    colorHex: hex,
    waistbandLabel: String(details.waistband_label || '').trim(),
  };
}

/**
 * Evaluates visual show-through (color translucency) and VPL (visible panty/underwear line)
 * when wearing an underwear item beneath an outer dress, skirt, or fitted/thin bottom.
 * @param {{ underwear?: any, outerGarment?: any, gender?: string }} [options]
 */
export function evaluateUnderwearOuterInteraction({ underwear, outerGarment, gender = 'female' } = {}) {
  if (!underwear || !outerGarment) {
    return {
      hasInteraction: false,
      showThroughLevel: 'none',
      vplLevel: 'none',
      riskLevel: 'low',
      outerTranslucency: 'opaque',
      summaryKo: '',
      summaryEn: '',
      tipKo: '',
      tipEn: '',
      vtonDirective: '',
    };
  }

  const uw = classifyUnderwearProfile(underwear);
  if (!uw) {
    return {
      hasInteraction: false,
      showThroughLevel: 'none',
      vplLevel: 'none',
      riskLevel: 'low',
      outerTranslucency: 'opaque',
      summaryKo: '',
      summaryEn: '',
      tipKo: '',
      tipEn: '',
      vtonDirective: '',
    };
  }

  const outerCat = String(outerGarment.category || '').trim().toLowerCase();
  const outerSub = String(outerGarment.subcategory || '').trim().toLowerCase();
  const outerName = String(outerGarment.name || '').trim();
  const outerFabric = String(outerGarment.fabric || 'cotton').trim().toLowerCase();
  const outerHex = String(outerGarment.color_hex || '#888888');
  const outerLum = computeRelativeLuminance(outerHex);
  const outerDetails = parseDetailsObject(outerGarment);
  const outerSeasons = Array.isArray(outerGarment.seasons) ? outerGarment.seasons : [];

  const isDressOrSkirt =
    outerCat === 'dress' ||
    outerCat === 'onepiece' ||
    outerSub === 'dress' ||
    outerSub === 'onepiece' ||
    outerSub.includes('skirt') ||
    /원피스|드레스|스커트|슬립|dress|skirt|slip/i.test(outerName);

  const isLightOuter =
    outerLum >= 0.68 || /화이트|아이보리|크림|오프화이트|에크루|연베이지|파스텔|white|ivory|cream|ecru|pastel/i.test(outerName);

  const isThinOuter =
    outerDetails.thickness === 'thin' ||
    outerDetails.opacity_level === 'sheer' ||
    outerDetails.opacity_level === 'semi_sheer' ||
    SHEER_OR_THIN_FABRICS.has(outerFabric) ||
    outerSeasons.includes('여름') ||
    /린넨|시폰|실크|슬립|얇은|썸머|여름|시스루|코튼\s*원피스|니트\s*원피스|linen|chiffon|silk|sheer|lightweight|summer/i.test(outerName);

  const isHeavyOpaque =
    HEAVY_OPAQUE_FABRICS.has(outerFabric) &&
    !/린넨|시폰|실크|얇은|sheer|lightweight/i.test(outerName) &&
    outerDetails.thickness !== 'thin';

  const isFittedSilhouette =
    outerDetails.fit === 'slim' ||
    outerDetails.fit === 'fitted' ||
    /슬림|타이트|머메이드|펜슬|니트|슬립|H라인|bodycon|slim|fitted|pencil|slip/i.test(outerName);

  let showThroughLevel = 'none';
  if (!isHeavyOpaque && isLightOuter && isThinOuter) {
    if (uw.isDarkColor || uw.isHighContrastPattern) {
      showThroughLevel = 'visible';
    } else if (!uw.isNudeTone && Math.abs(outerLum - uw.luminance) > 0.22) {
      showThroughLevel = 'subtle';
    }
  } else if (!isHeavyOpaque && isLightOuter && uw.isDarkColor && isDressOrSkirt) {
    showThroughLevel = 'subtle';
  }

  let vplLevel = 'none';
  if (!isHeavyOpaque && (isDressOrSkirt || isFittedSilhouette || isThinOuter)) {
    if (uw.isSeamless) {
      vplLevel = 'none';
    } else if (uw.isLace) {
      vplLevel = isThinOuter || isFittedSilhouette ? 'visible' : 'subtle';
    } else if (isThinOuter && (isDressOrSkirt || isFittedSilhouette)) {
      vplLevel = 'subtle';
    }
  }

  const outerTranslucency =
    !isHeavyOpaque && isLightOuter && isThinOuter
      ? 'semi_sheer'
      : !isHeavyOpaque && isThinOuter
        ? 'lightweight'
        : 'opaque';

  const hasInteraction = showThroughLevel !== 'none' || vplLevel !== 'none' || isDressOrSkirt;

  let summaryKo = '';
  let summaryEn = '';
  let tipKo = '';
  let tipEn = '';
  let vtonDirective = '';

  if (showThroughLevel === 'visible' && vplLevel === 'visible') {
    summaryKo = `비침 높음 · 속옷선(VPL) 뚜렷 — 어두운 ${uw.colorName} ${uw.isLace ? '레이스' : '이너'}가 얇고 밝은 원단 위로 비치고 라인이 드러납니다.`;
    summaryEn = `High Show-Through · Visible Line (VPL) — Dark ${uw.isLace ? 'lace' : 'innerwear'} contrasts and shows through lightweight pale fabric.`;
    tipKo = '누드 스킨톤 심리스 언더웨어로 바꾸면 비침과 라인을 깔끔하게 줄일 수 있어요.';
    tipEn = 'Switch to nude seamless underwear to eliminate show-through and panty lines.';
    vtonDirective = [
      `REALISTIC FABRIC TRANSLUCENCY & UNDERLAYER FIT SIMULATION (${gender === 'female' ? 'womenswear' : 'menswear'} fashion editorial fit-check):`,
      `The outer ${outerName || 'lightweight garment'} (${outerFabric}, ${outerHex}) is lightweight and semi-sheer in studio light.`,
      `Because the model wears dark contrasting ${underwear.name || 'underwear'} (${uw.colorHex}${uw.isLace ? ', delicate lace trim edge' : ''}) underneath, render a subtle, tasteful, realistic muted dark shadow/translucency tint and faint soft fabric seam contour (VPL) visible ONLY through the thin pale outer fabric at the hip/bodice under-layer — keep it completely clothed, tasteful, editorial garment-fit realism (not sheer/revealing skin).`,
    ].join(' ');
  } else if (showThroughLevel === 'visible') {
    summaryKo = `컬러 비침 주의 · 라인 최소화 — 어두운 ${uw.colorName} 이너 색감이 얇고 밝은 원단 아래로 은은하게 비칩니다.`;
    summaryEn = `Color Show-Through · Minimal Line — Dark ${uw.colorName} tone casts a subtle shadow beneath lightweight pale fabric.`;
    tipKo = '비침을 막으려면 피부톤에 가까운 누드 베이지 심리스 이너를 추천합니다.';
    tipEn = 'Pair with a skin-tone nude seamless set for zero color show-through.';
    vtonDirective = [
      `REALISTIC FABRIC TRANSLUCENCY FIT-CHECK:`,
      `The lightweight pale outer garment (${outerName || 'light dress/bottom'}, ${outerHex}) is worn over dark ${underwear.name || 'underwear'} (${uw.colorHex}).`,
      `Render a subtle, tasteful muted charcoal tonal shadow gently showing through the thin white/pale outer fabric silhouette while keeping smooth seamless edges and fully clothed editorial modesty.`,
    ].join(' ');
  } else if (vplLevel === 'visible' || vplLevel === 'subtle' || showThroughLevel === 'subtle') {
    summaryKo =
      vplLevel === 'visible'
        ? `속옷 라인(VPL) 감지 — ${uw.isLace ? '레이스 질감과 봉제선' : '봉제선 가장자리'}이(가) 얇은 원단 위로 은은하게 드러납니다.`
        : `미세 비침/라인 — 강한 역광에서 이너 윤곽이 살짝 보일 수 있습니다.`;
    summaryEn =
      vplLevel === 'visible'
        ? `Visible Underwear Line (VPL) — ${uw.isLace ? 'Lace texture and trim' : 'Seam edges'} subtly imprint through thin draped fabric.`
        : `Subtle Underlayer Outline — Slight tonal contour may appear under direct studio light.`;
    tipKo = '매끈한 핏을 원하면 레이저컷 심리스 라인을 선택해 보세요.';
    tipEn = 'Choose laser-cut seamless briefs for an uninterrupted drape.';
    vtonDirective = [
      `SUBTLE GARMENT DRAPE & UNDERLAYER FIT-CHECK:`,
      `The thin outer garment (${outerName || 'dress/bottom'}) drapes softly over ${underwear.name || 'underwear'}; show a very subtle, natural tailoring fabric crease/seam contour at the hip consistent with ${uw.isLace ? 'lace-trimmed' : 'cotton-seamed'} innerwear while keeping the look fully clothed and refined.`,
    ].join(' ');
  } else {
    if (uw.isNubra) {
      summaryKo =
        '누브라 완벽 매치 — 어깨끈·등 밴드 자국 없이 오프숄더·슬립·백리스 실루엣에도 매끈하게 밀착됩니다.';
      summaryEn =
        'Strapless Nubra Match — Zero visible shoulder straps or back band under off-shoulder, slip, or backless silhouettes.';
      tipKo = '어깨나 등이 드러나는 원피스·탑과 가장 깔끔하게 어울리는 스트랩리스 조합입니다.';
      tipEn = 'Ideal strapless, backless invisible support for open-shoulder and draped styles.';
      vtonDirective =
        'CLEAN STRAPLESS BACKLESS NUBRA FIT: Because the model wears an invisible skin-tone adhesive silicone nubra underneath, render ZERO visible bra straps on the shoulders, ZERO back-band clasps or indentations across the upper back, and a completely smooth, natural outer bodice drape.';
    } else if (uw.isThong) {
      summaryKo =
        'T팬티 노라인 완벽 매치 — 타이트한 스커트·원피스·슬림 팬츠에서도 힙 라인 속옷선(VPL)이 전혀 드러나지 않습니다.';
      summaryEn =
        'Zero-VPL Thong Match — Eliminates visible panty lines completely beneath fitted skirts, dresses, and slim trousers.';
      tipKo = '얇거나 핏되는 하의·원피스에서 매끈한 힙 실루엣을 유지하기에 최적입니다.';
      tipEn = 'Guarantees an uninterrupted, line-free hip drape under fitted silhouettes.';
      vtonDirective =
        'CLEAN ZERO-VPL THONG UNDERLAYER FIT: Because the model wears a seamless laser-cut thong underneath, keep the entire hip and rear drape of the outer dress/bottom 100% smooth and completely free of any visible panty line (VPL) or seam ridge.';
    } else {
      summaryKo =
        uw.isSeamless && uw.isNudeTone
          ? '비침 없음 · 노라인 완벽 매치 — 스킨톤 심리스 언더웨어로 얇은 원단에도 매끈하게 떨어집니다.'
          : '비침/라인 안정 — 현재 아우터/원단 두께와 컬러 조합에서 속옷 라인 노출이 거의 없습니다.';
      summaryEn =
        uw.isSeamless && uw.isNudeTone
          ? 'Zero Show-Through · Seamless Match — Skin-tone seamless innerwear disappears cleanly under light fabrics.'
          : 'Clean Coverage — Current fabric weight and tone prevent visible show-through or lines.';
      tipKo = '안심하고 착용할 수 있는 매끈한 이너 조합입니다.';
      tipEn = 'Clean, seamless pairing ready for bright studio or daylight wear.';
      vtonDirective = isDressOrSkirt
        ? `CLEAN SEAMLESS UNDERLAYER FIT: Because the model wears ${underwear.name || 'seamless nude underwear'} underneath ${outerName || 'the outer garment'}, keep the outer fabric drape completely smooth, opaque, and free of any visible color show-through or panty lines.`
        : '';
    }
  }

  const riskLevel =
    showThroughLevel === 'visible' || vplLevel === 'visible'
      ? 'high'
      : showThroughLevel === 'subtle' || vplLevel === 'subtle'
        ? 'medium'
        : 'low';

  return {
    hasInteraction,
    showThroughLevel,
    vplLevel,
    riskLevel,
    outerTranslucency,
    summaryKo,
    summaryEn,
    tipKo,
    tipEn,
    vtonDirective,
  };
}

/**
 * Builds the fashion-editorial Hip-Hop / Street deep sagging pants VTON styling directive.
 * Modeled on authentic streetwear sagging anatomy:
 * - Zero T-shirt roll-up/gathering (flat, crisp, straight ungathered top hem)
 * - 14–18cm dropped pant waistband sitting low across lower hips & mid-buttocks
 * - Tall 10–14cm exposed underwear (elastic waistband + upper boxer body/seat) visible 360°
 * - Deep low drop-crotch near mid-thigh, low-sitting rear pockets, and heavy ankle stacking
 * @param {{ saggingFit?: boolean, bottom?: any, underwear?: any }} [options]
 */
export function buildSaggingVtonDirective({ saggingFit, bottom, underwear } = {}) {
  if (!saggingFit || !bottom || !isSaggingEligibleBottom(bottom)) {
    return '';
  }
  const uw = classifyUnderwearProfile(underwear);
  const bottomName = String(bottom.name || 'baggy hip-hop jeans/sweatpants');
  const underwearColor = uw?.colorName || 'black';
  const underwearHex = uw?.colorHex || '#1C1C1E';
  const underwearStyleDesc = underwear
    ? `${underwear.name} (${underwearColor}, ${underwearHex}${
        uw?.isHighContrastPattern
          ? ', woven plaid/check boxer shorts fabric & gathered elastic waist'
          : ', boxer briefs with BRIGHT CRISP CONTRAST ELASTIC WAISTBAND & dark graphic stripes from the reference photo over smooth dark knit trunk'
      })`
    : 'crisp streetwear boxer briefs (bright white contrast elastic waistband + black knit trunk)';

  return [
    `AUTHENTIC DEEP HIP-HOP / STREETWEAR SAGGING PANTS FIT (V3 ANATOMICAL LANDMARK LOCK — 360° FRONT, 3/4, SIDE & 180° BACK):`,
    `1) NORMAL-LENGTH BOXY T-SHIRT HEM AT HIP-BONE / WRIST LEVEL — STRICT ANTI-ROLL / ANTI-BUNCH RULE (NEVER A BELLY CROP-TOP): Keep the equipped T-shirt/top at a FULL NORMAL RELAXED STREETWEAR LENGTH covering the entire stomach and navel, ending cleanly at HIP-BONE / WRIST-BONE height with a 100% FLAT, STRAIGHT, LOOSE, UNGATHERED horizontal bottom hem (NEVER cropped high up at the ribs/elbows, NEVER tucked in, NEVER rolled up, and NEVER curved/cinched inward like a bomber jacket!). Wear any outer jacket or cardigan open at the front with straight vertical hems.`,
    `2) LOW-HIP EXPOSED UNDERWEAR (WRIST-LEVEL DOWN TO KNUCKLE-LEVEL — 10cm–14cm TALL EXPOSURE, NEVER HIKED ONTO BELLY): Wear ${underwearStyleDesc} LOW ON THE HIP BONES (at wrist-bone height, 5–7cm BELOW the navel — NEVER hiked high onto the stomach!). Directly below the flat straight T-shirt hem, expose a bold tall 10cm–14cm vertical panel of BOTH the full contrast elastic waistband (keeping any bright crisp WHITE elastic waistband & dark graphic stripes 100% pure white — NEVER turning a white waistband dark grey!) AND the upper boxer fabric trunk extending down from wrist level to knuckle level all the way around (front fly/panel AND full upper rear boxer seat in 180° back).`,
    `3) EXTREME LOW-SLUNG SAGGED PANTS WAISTBAND AT KNUCKLE / UPPER-THIGH LEVEL: Pull the ${bottomName} DRASTICALLY LOW down off the hips so the pants waistband, drawstring, and front pockets sit at KNUCKLE / MID-HAND HEIGHT (across the lower pelvis / very top of the thighs in front, and across the LOWER HALF OF THE BUTTOCKS in 180° rear view — well BELOW the exposed underwear panel, NEVER at normal belt/hip height!).`,
    `4) EXTREME DEEP DROP-CROTCH (BELOW FINGERTIPS) + OVERSIZED BAGGY SLOUCHY LEGS + HEAVY ANKLE STACKING: Because the pants hang dramatically off the hips, force an unmistakable DEEP DROP-CROTCH hanging visibly BELOW THE FINGERTIPS near MID-THIGH (creating a bold baggy V-drape between the thighs, NEVER tight/high in the groin!), conspicuously LOW-SITTING REAR POCKETS near the upper hamstrings in rear views, WIDE OVERSIZED RELAXED BAGGY LEGS (overriding any slim flat-lay trouser cut!), and THICK HEAVY STACKED / POOLED FABRIC FOLDS collapsing over the tops of the boots/sneakers in ALL views.`,
  ].join(' ');
}
