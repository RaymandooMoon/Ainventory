/**
 * A inventory — 3D Garment & Accessory Registration Architecture + Multi-Chain Jiggle Physics Specs
 *
 * Commercial Virtual-Closet & Game-Engine Standard (Unreal/Unity SpringBone & Socket Hybrid):
 * Replaces expensive per-vertex CPU cloth simulation with O(1) GPU multi-chain SpringBone
 * constraints, coupled strap-and-pouch suspension, and radial billow bone inflation to sustain
 * 60 FPS on mobile while reacting vividly to walking strides, turntable spin, and live weather wind.
 */

export const FABRIC_WIND_SENSITIVITY = {
  silk: 1.32,
  cotton: 0.96,
  gabardine: 0.88,
  wool: 0.84,
  knit: 0.78,
  denim: 0.44,
  leather: 0.42,
  padding: 0.34,
};

export function resolveFabricWindSensitivity(itemOrFabric = '') {
  const f =
    typeof itemOrFabric === 'string'
      ? itemOrFabric.toLowerCase().trim()
      : String(itemOrFabric?.fabric || '').toLowerCase().trim();
  if (f && FABRIC_WIND_SENSITIVITY[f] !== undefined) {
    return FABRIC_WIND_SENSITIVITY[f];
  }
  const sub = typeof itemOrFabric === 'object' ? String(itemOrFabric?.subcategory || '').toLowerCase() : '';
  const name = typeof itemOrFabric === 'object' ? String(itemOrFabric?.name || '') : '';
  if (sub === 'blouse' || sub === 'necktie' || /실크|새틴|쉬폰/.test(name)) return FABRIC_WIND_SENSITIVITY.silk;
  if (sub === 'scarf' || sub === 'muffler' || /캐시미어|머플러|스카프/.test(name)) return 1.18;
  if (sub === 'trench' || /트렌치|개버딘/.test(name)) return FABRIC_WIND_SENSITIVITY.gabardine;
  if (sub === 'padding' || /패딩|다운|퀼팅/.test(name)) return FABRIC_WIND_SENSITIVITY.padding;
  if (sub === 'denim' || /데님|청바지/.test(name)) return FABRIC_WIND_SENSITIVITY.denim;
  if (/레더|가죽/.test(name)) return FABRIC_WIND_SENSITIVITY.leather;
  if (sub === 'coat' || sub === 'blazer' || /울/.test(name)) return FABRIC_WIND_SENSITIVITY.wool;
  if (sub === 'knit' || sub === 'cardigan') return FABRIC_WIND_SENSITIVITY.knit;
  return FABRIC_WIND_SENSITIVITY.cotton;
}

export const GARMENT_3D_PHYSICS_PRESETS = {
  rigid_fitted: {
    key: 'rigid_fitted',
    tier: 'body_skinned',
    mount: 'body',
    chainLinks: 0,
    labelKo: '바디 스키닝 밀착형 (28체형 모프 연동)',
    labelEn: 'Body-Skinned Fitted Mesh',
    descriptionKo: '체형 슬라이더와 26개 관절 스켈레톤을 정밀하게 따라가는 밀착 의류',
    stiffness: 0,
    damping: 0,
    maxAngleRad: 0,
    windSensitivity: 0.15,
  },
  drape_wind_garment: {
    key: 'drape_wind_garment',
    tier: 'soft_cloth_jiggle',
    mount: 'body',
    chainLinks: 2,
    labelKo: '바람 반응형 라펠 · 밑단 드레이프 피직스',
    labelEn: 'Wind-Responsive Lapel & Hem Drape Physics',
    descriptionKo: '어깨·품은 체형에 맞추고 오픈 라펠과 상·하의 밑단이 강풍·걸음에 자연스럽게 흔들림',
    anchorY: 1.06,
    falloffSpan: 0.34,
    stiffness: 32.0,
    damping: 6.0,
    swayAmpX: 0.022,
    swayAmpZ: 0.028,
    billowAmp: 0.045,
    windSensitivity: 0.82,
  },
  soft_jiggle_muffler: {
    key: 'soft_jiggle_muffler',
    tier: 'soft_cloth_jiggle',
    mount: 'body',
    chainLinks: 2,
    labelKo: '2단 리본 체인 지글 · 흩날리는 머플러/프린지',
    labelEn: '2-Chain Flutter Physics (Muffler & Cashmere Fringe)',
    descriptionKo: '목 둘레 칼라는 고정되고 상단 패널과 하단 수술(Fringe)이 위상차를 두고 바람에 S자로 흩날림',
    anchorY: 1.35,
    midChainY: 1.17,
    falloffSpan: 0.34,
    stiffness: 22.0,
    tipStiffness: 15.5,
    damping: 4.1,
    tipDamping: 2.9,
    swayAmpX: 0.048,
    swayAmpZ: 0.062,
    flutterHarmonic: 1.15,
    windSensitivity: 1.28,
  },
  soft_jiggle_tie: {
    key: 'soft_jiggle_tie',
    tier: 'soft_cloth_jiggle',
    mount: 'body',
    chainLinks: 2,
    labelKo: '2단 리본 체인 지글 · 실크 타이',
    labelEn: '2-Chain Flutter Physics (Silk Tie)',
    descriptionKo: '노트(매듭)는 셔츠 칼라에 고정되고 실크 타이 블레이드 끝단이 보행·바람에 경쾌하게 날림',
    anchorY: 1.35,
    midChainY: 1.24,
    falloffSpan: 0.22,
    stiffness: 28.0,
    tipStiffness: 19.0,
    damping: 4.8,
    tipDamping: 3.4,
    swayAmpX: 0.032,
    swayAmpZ: 0.038,
    flutterHarmonic: 0.95,
    windSensitivity: 1.05,
  },
  hem_sway_coat: {
    key: 'hem_sway_coat',
    tier: 'soft_cloth_jiggle',
    mount: 'body',
    chainLinks: 2,
    labelKo: '2단 플레어 & 강풍 빌로우 · 코트 피직스',
    labelEn: '2-Chain Coat Hem Sway & Wind Billow Physics',
    descriptionKo: '어깨는 테일러드 핏을 유지하고 오픈 라펠과 무릎 아래 코트 자락이 보행과 강풍에 입체적으로 부풀며 퍼짐',
    anchorY: 0.95,
    midChainY: 0.66,
    falloffSpan: 0.48,
    stiffness: 26.0,
    tipStiffness: 18.5,
    damping: 5.2,
    tipDamping: 3.8,
    swayAmpX: 0.038,
    swayAmpZ: 0.052,
    billowAmp: 0.085,
    windSensitivity: 1.05,
  },
  hem_sway_skirt: {
    key: 'hem_sway_skirt',
    tier: 'soft_cloth_jiggle',
    mount: 'body',
    chainLinks: 2,
    labelKo: '2단 플리츠 웨이브 & 빌로우 · 스커트/원피스 피직스',
    labelEn: '2-Chain Pleated Skirt / Dress Wave & Billow Physics',
    descriptionKo: '허리 밴드는 고정되고 스커트·원피스 자락이 회전·보행·강풍에 물결치듯 부풀어 오름',
    anchorY: 0.94,
    midChainY: 0.62,
    falloffSpan: 0.54,
    stiffness: 22.0,
    tipStiffness: 15.0,
    damping: 4.4,
    tipDamping: 3.1,
    swayAmpX: 0.048,
    swayAmpZ: 0.064,
    billowAmp: 0.105,
    windSensitivity: 1.22,
  },
  pendulum_briefcase: {
    key: 'pendulum_briefcase',
    tier: 'socket_pendulum',
    mount: 'hand_l',
    chainLinks: 1,
    labelKo: '3축 핸드 소켓 진자 · 서류가방',
    labelEn: '3-DOF Hand-Socket Pendulum (Executive Briefcase)',
    descriptionKo: '왼손 그립에 마운트되어 보행 팔 스윙·턴테이블 원심력·측풍에 묵직하게 반응하는 가죽 브리프케이스 물리',
    stiffness: 26.0,
    damping: 4.3,
    mass: 1.65,
    maxPitchRad: 0.34,
    maxRollRad: 0.22,
    maxYawRad: 0.18,
    outwardRestRollRad: 0.065,
    windSensitivity: 0.55,
  },
  pendulum_tote: {
    key: 'pendulum_tote',
    tier: 'socket_pendulum',
    mount: 'hand_l',
    chainLinks: 1,
    labelKo: '3축 핸드 소켓 진자 · 쇼퍼 토트백',
    labelEn: '3-DOF Hand-Socket Pendulum (Shopper Tote)',
    descriptionKo: '긴 가죽 핸들이 손에 걸려 보행 리듬과 바람에 경쾌하게 스윙·트위스트되는 쇼퍼백 진자 물리',
    stiffness: 20.0,
    damping: 3.6,
    mass: 1.10,
    maxPitchRad: 0.42,
    maxRollRad: 0.26,
    maxYawRad: 0.24,
    outwardRestRollRad: 0.075,
    windSensitivity: 0.78,
  },
  pendulum_crossbody: {
    key: 'pendulum_crossbody',
    tier: 'socket_pendulum',
    mount: 'body',
    chainLinks: 2,
    labelKo: '연동 스트랩 텐션 & D링 힙 바운스 · 크로스백',
    labelEn: 'Coupled Strap-Flex & D-Ring Hip-Bounce (Crossbody Bag)',
    descriptionKo: '어깨 패드는 고정되고 대각선 가죽 끈의 탄성 텐션과 골반 옆 새들백 본체가 발걸음·바람에 함께 바운스됨',
    anchorY: 1.18,
    dRingPivot: [0.168, 0.916, -0.010],
    falloffSpan: 0.28,
    stiffness: 30.0,
    damping: 4.6,
    strapElasticity: 0.52,
    swayAmpX: 0.026,
    swayAmpZ: 0.038,
    windSensitivity: 0.68,
  },
};

const KEYWORD_SUBCATEGORY_RULES = [
  { re: /서류가방|브리프케이스|briefcase|포트폴리오|서류/i, category: 'accessory', subcategory: 'briefcase', physics: 'pendulum_briefcase' },
  { re: /토트|쇼퍼|에코백|tote|shopper/i, category: 'accessory', subcategory: 'tote', physics: 'pendulum_tote' },
  { re: /크로스|숄더|새들|메신저|핸드백|가방|백|bag/i, category: 'accessory', subcategory: 'bag', physics: 'pendulum_crossbody' },
  { re: /머플러|목도리|스카프|숄|muffler|scarf/i, category: 'neckwear', subcategory: 'scarf', physics: 'soft_jiggle_muffler' },
  { re: /넥타이|타이|tie/i, category: 'neckwear', subcategory: 'necktie', physics: 'soft_jiggle_tie' },
  { re: /트렌치|코트|오버코트|맥코트|trench|coat/i, category: 'outer', subcategory: 'coat', physics: 'hem_sway_coat' },
  { re: /블레이저|자켓|점퍼|가디건|셔츠|블라우스|blazer|jacket|cardigan|shirt|blouse/i, category: 'outer', subcategory: 'blazer', physics: 'drape_wind_garment' },
  { re: /스커트|치마|플리츠|skirt/i, category: 'bottom', subcategory: 'skirt', physics: 'hem_sway_skirt' },
  { re: /원피스|드레스|dress|onepiece/i, category: 'dress', subcategory: 'dress', physics: 'hem_sway_skirt' },
  { re: /장갑|글러브|glove/i, category: 'gloves', subcategory: 'leather_gloves', physics: 'rigid_fitted' },
  { re: /시계|워치|watch/i, category: 'accessory', subcategory: 'watch', physics: 'rigid_fitted' },
  { re: /벨트|belt/i, category: 'accessory', subcategory: 'belt', physics: 'rigid_fitted' },
  { re: /안경|선글라스|아이웨어|glasses/i, category: 'accessory', subcategory: 'glasses', physics: 'rigid_fitted' },
];

/**
 * Automatically resolves the optimal 3D mesh archetype, bone mount, PBR surface preset,
 * and real-time Jiggle Physics profile when registering or rendering any garment/accessory.
 */
export function infer3DRegistrationSpec(item = {}) {
  const name = String(item.name || '').trim();
  let category = String(item.category || 'top').toLowerCase().trim();
  let subcategory = String(item.subcategory || '').toLowerCase().trim();

  for (const rule of KEYWORD_SUBCATEGORY_RULES) {
    if (rule.re.test(name)) {
      if (!item.subcategory || (category === 'accessory' && subcategory === 'bag')) {
        category = rule.category;
        subcategory = rule.subcategory;
      }
      const preset = GARMENT_3D_PHYSICS_PRESETS[rule.physics] || GARMENT_3D_PHYSICS_PRESETS.rigid_fitted;
      return {
        category,
        subcategory,
        physicsKey: preset.key,
        windSensitivity: resolveFabricWindSensitivity(item),
        preset,
      };
    }
  }

  let physicsKey = 'rigid_fitted';
  if (subcategory === 'briefcase') physicsKey = 'pendulum_briefcase';
  else if (subcategory === 'tote') physicsKey = 'pendulum_tote';
  else if (subcategory === 'bag' || category === 'bag') physicsKey = 'pendulum_crossbody';
  else if (subcategory === 'scarf' || subcategory === 'muffler') physicsKey = 'soft_jiggle_muffler';
  else if (subcategory === 'necktie') physicsKey = 'soft_jiggle_tie';
  else if (subcategory === 'coat' || subcategory === 'trench') physicsKey = 'hem_sway_coat';
  else if (subcategory === 'skirt' || category === 'dress') physicsKey = 'hem_sway_skirt';
  else if (['blazer', 'jacket', 'cardigan', 'shirt', 'blouse', 'slacks'].includes(subcategory)) {
    physicsKey = 'drape_wind_garment';
  }

  const preset = GARMENT_3D_PHYSICS_PRESETS[physicsKey] || GARMENT_3D_PHYSICS_PRESETS.rigid_fitted;
  return {
    category,
    subcategory: subcategory || 'knit',
    physicsKey,
    windSensitivity: resolveFabricWindSensitivity(item),
    preset,
  };
}
