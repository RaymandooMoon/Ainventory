/**
 * A inventory — 3D Garment & Accessory Registration Architecture + Jiggle Physics Specs
 *
 * Commercial Virtual-Closet & Game-Engine Standard (Unreal/Unity Cloth & Socket Hybrid):
 * When a user registers a new garment or accessory from a 2D photo, full cloth simulation
 * on arbitrary single-view meshes is prohibitively heavy on mobile devices, while rigid
 * static meshes feel lifeless. We therefore classify every item into 3 hybrid 3D archetypes:
 *
 * 1. `rigid_fitted` (Body-Skinned + 28 Parametric Morphs):
 *    Shirts, knitwear, blazers, pants, gloves, hats, belts, watches, eyewear.
 *    Bound to the 19-bone humanoid skeleton + anthropometric morph targets.
 *
 * 2. `socket_pendulum` (`pendulum_briefcase`, `pendulum_tote`, `pendulum_crossbody`):
 *    Handheld bags, briefcases (`서류가방`), shopper totes (`토트백`), crossbody bags.
 *    Mounted to a bone socket (`hand_l` / `pelvis`) with a 2-DOF damped pendulum spring
 *    driven by hand acceleration, walking stride, and turntable spin, with leg-clearance clamping.
 *
 * 3. `soft_cloth_jiggle` (`soft_jiggle_muffler`, `soft_jiggle_tie`, `hem_sway_coat`, `hem_sway_skirt`):
 *    Cashmere mufflers (`머플러`), silk neckties (`넥타이`), trench/wool overcoats (`코트`),
 *    and pleated skirts/dresses (`스커트/원피스`).
 *    Anchored at neck/waist (`weight = 0`) with smooth distance-falloff spring-damper sway
 *    (`weight -> 1` at fringe/hem) reacting to motion, breathing, and wind.
 */

export const GARMENT_3D_PHYSICS_PRESETS = {
  rigid_fitted: {
    key: 'rigid_fitted',
    tier: 'body_skinned',
    mount: 'body',
    labelKo: '바디 스키닝 밀착형 (28체형 모프 연동)',
    labelEn: 'Body-Skinned Fitted Mesh',
    descriptionKo: '체형 슬라이더와 19개 관절 애니메이션을 정밀하게 따라가는 스키닝 의류',
    stiffness: 0,
    damping: 0,
    maxAngleRad: 0,
  },
  soft_jiggle_muffler: {
    key: 'soft_jiggle_muffler',
    tier: 'soft_cloth_jiggle',
    mount: 'body',
    labelKo: '소프트 지글 피직스 · 머플러/프린지',
    labelEn: 'Soft Jiggle Physics (Muffler & Fringe)',
    descriptionKo: '목 둘레는 고정되고 하단 캐시미어 패널과 수술(Fringe)이 걸음·바람에 흔들림',
    anchorY: 1.36,
    falloffSpan: 0.30,
    stiffness: 26.0,
    damping: 5.2,
    swayAmpX: 0.032,
    swayAmpZ: 0.042,
    windSensitivity: 1.0,
  },
  soft_jiggle_tie: {
    key: 'soft_jiggle_tie',
    tier: 'soft_cloth_jiggle',
    mount: 'body',
    labelKo: '소프트 지글 피직스 · 실크 타이',
    labelEn: 'Soft Jiggle Physics (Silk Tie)',
    descriptionKo: '노트(매듭)는 셔츠 칼라에 고정되고 타이 블레이드가 가슴 위에서 자연스럽게 흔들림',
    anchorY: 1.35,
    falloffSpan: 0.32,
    stiffness: 32.0,
    damping: 6.0,
    swayAmpX: 0.022,
    swayAmpZ: 0.026,
    windSensitivity: 0.75,
  },
  hem_sway_coat: {
    key: 'hem_sway_coat',
    tier: 'soft_cloth_jiggle',
    mount: 'body',
    labelKo: '코트 밑단 플레어 지글 피직스',
    labelEn: 'Coat Hem Sway Physics',
    descriptionKo: '어깨·가슴은 테일러드 핏을 유지하고 무릎 아래 코트 자락이 보행 리듬에 맞춰 퍼짐',
    anchorY: 0.96,
    falloffSpan: 0.38,
    stiffness: 30.0,
    damping: 6.4,
    swayAmpX: 0.024,
    swayAmpZ: 0.036,
    windSensitivity: 0.85,
  },
  hem_sway_skirt: {
    key: 'hem_sway_skirt',
    tier: 'soft_cloth_jiggle',
    mount: 'body',
    labelKo: '플리츠 · 드레스 헴라인 지글 피직스',
    labelEn: 'Pleated Skirt / Dress Hem Physics',
    descriptionKo: '허리 밴드는 고정되고 스커트 플리츠 자락이 회전·걸음에 따라 유연하게 물결침',
    anchorY: 0.94,
    falloffSpan: 0.44,
    stiffness: 24.0,
    damping: 5.0,
    swayAmpX: 0.034,
    swayAmpZ: 0.044,
    windSensitivity: 1.0,
  },
  pendulum_briefcase: {
    key: 'pendulum_briefcase',
    tier: 'socket_pendulum',
    mount: 'hand_l',
    labelKo: '핸드 소켓 진자 피직스 · 서류가방',
    labelEn: 'Hand-Socket Pendulum (Executive Briefcase)',
    descriptionKo: '왼손 그립 소켓에 마운트되어 보행 가속도·턴테이블 회전에 반응하는 묵직한 가죽 브리프케이스 물리',
    stiffness: 28.0,
    damping: 4.8,
    mass: 1.65,
    maxPitchRad: 0.30,
    maxRollRad: 0.18,
    outwardRestRollRad: 0.065,
  },
  pendulum_tote: {
    key: 'pendulum_tote',
    tier: 'socket_pendulum',
    mount: 'hand_l',
    labelKo: '핸드 소켓 진자 피직스 · 쇼퍼 토트백',
    labelEn: 'Hand-Socket Pendulum (Shopper Tote)',
    descriptionKo: '긴 가죽 스트랩이 손에 걸려 걸을 때마다 경쾌하게 스윙하는 쇼퍼백 진자 물리',
    stiffness: 22.0,
    damping: 4.1,
    mass: 1.15,
    maxPitchRad: 0.36,
    maxRollRad: 0.22,
    outwardRestRollRad: 0.075,
  },
  pendulum_crossbody: {
    key: 'pendulum_crossbody',
    tier: 'socket_pendulum',
    mount: 'body',
    labelKo: '힙 바운스 지글 피직스 · 크로스백',
    labelEn: 'Hip-Bounce Strap Physics (Crossbody Bag)',
    descriptionKo: '어깨 스트랩은 밀착되고 골반 옆 새들백 본체가 보행 시 미세하게 바운스됨',
    anchorY: 1.02,
    falloffSpan: 0.26,
    stiffness: 34.0,
    damping: 6.2,
    swayAmpX: 0.018,
    swayAmpZ: 0.028,
    windSensitivity: 0.5,
  },
};

const KEYWORD_SUBCATEGORY_RULES = [
  { re: /서류가방|브리프케이스|briefcase|포트폴리오|서류/i, category: 'accessory', subcategory: 'briefcase', physics: 'pendulum_briefcase' },
  { re: /토트|쇼퍼|에코백|tote|shopper/i, category: 'accessory', subcategory: 'tote', physics: 'pendulum_tote' },
  { re: /크로스|숄더|새들|메신저|핸드백|가방|백|bag/i, category: 'accessory', subcategory: 'bag', physics: 'pendulum_crossbody' },
  { re: /머플러|목도리|스카프|숄|muffler|scarf/i, category: 'neckwear', subcategory: 'scarf', physics: 'soft_jiggle_muffler' },
  { re: /넥타이|타이|tie/i, category: 'neckwear', subcategory: 'necktie', physics: 'soft_jiggle_tie' },
  { re: /트렌치|코트|오버코트|맥코트|trench|coat/i, category: 'outer', subcategory: 'coat', physics: 'hem_sway_coat' },
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

  const preset = GARMENT_3D_PHYSICS_PRESETS[physicsKey] || GARMENT_3D_PHYSICS_PRESETS.rigid_fitted;
  return {
    category,
    subcategory: subcategory || 'knit',
    physicsKey,
    preset,
  };
}
