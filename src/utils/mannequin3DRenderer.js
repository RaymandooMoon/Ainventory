import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { resolveAnatomicalProfile } from './bodyAnthropometrics.js';
import {
  GARMENT_3D_PHYSICS_PRESETS,
  resolveFabricWindSensitivity,
} from './garment3DPhysicsSpecs.js';
import { SpringBoneSystem } from './springBonePhysics.js';
import { setVibrancySolidFallback } from './nativeBridge.js';

export const SLOT_CAMERA_TARGETS = {
  all: { x: 0.0, y: 0.96, dist: 3.62, fov: 35, labelKo: '전신 풀샷 (Full Body)' },
  headwear: { x: 0.0, y: 1.56, dist: 1.12, fov: 30, labelKo: '헤드웨어 줌 (Head)' },
  neckwear: { x: 0.0, y: 1.34, dist: 1.24, fov: 32, labelKo: '네크웨어 · 머플러 줌 (Neck)' },
  outer: { x: 0.0, y: 1.10, dist: 1.82, fov: 34, labelKo: '아우터 줌 (Outer)' },
  top: { x: 0.0, y: 1.16, dist: 1.58, fov: 34, labelKo: '상의 줌 (Top)' },
  bottom: { x: 0.0, y: 0.62, dist: 1.82, fov: 34, labelKo: '하의 줌 (Bottom)' },
  dress: { x: 0.0, y: 0.96, dist: 2.12, fov: 35, labelKo: '원피스 줌 (Dress)' },
  gloves: { x: 0.0, y: 1.11, dist: 1.38, fov: 33, labelKo: '핸드 · 장갑 인스펙션 (Gloves)' },
  underwear: { x: 0.0, y: 1.02, dist: 1.65, fov: 34, labelKo: '이너웨어 줌 (Inner)' },
  socks: { x: 0.0, y: 0.20, dist: 1.32, fov: 30, labelKo: '레그 · 양말 줌 (Socks)' },
  shoes: { x: 0.0, y: 0.14, dist: 1.28, fov: 30, labelKo: '풋웨어 줌 (Shoes)' },
  accessory: { x: 0.06, y: 0.92, dist: 1.82, fov: 34, labelKo: '액세서리 · 백 줌 (Accessory)' },
};

export const MOTION_PRESETS = [
  { key: 'auto', labelKo: '자동(날씨연동)', labelEn: 'Auto (Weather)' },
  { key: 'idle', labelKo: '자연스러운 호흡', labelEn: 'Natural Idle' },
  { key: 'walk', labelKo: '런웨이 워킹', labelEn: 'Runway Walk' },
  { key: 'wind', labelKo: '강풍 바람', labelEn: 'Gale Wind' },
  { key: 'wave', labelKo: '안녕? 인사', labelEn: 'Wave Hello' },
  { key: 'umbrella', labelKo: '우산 쓰기', labelEn: 'Rain Umbrella' },
];

const PERSONAL_COLOR_DEFAULT_SKIN = {
  spring_warm: '#F2CFB6',
  spring_light: '#F6C2B2',
  spring_bright: '#F4AA92',
  summer_cool: '#EBD3CE',
  summer_light: '#D8E3F0',
  summer_mute: '#D7CEDE',
  autumn_warm: '#DFC1A6',
  autumn_mute: '#DEC2A8',
  autumn_deep: '#C99679',
  winter_cool: '#E5CCC8',
  winter_bright: '#D8C8E8',
  winter_deep: '#BFAEC8',
};

export function resolveSkinHex(profile = {}) {
  if (profile.mannequinModelColorHex || profile.personal_color_swatch_hex) {
    return profile.mannequinModelColorHex || profile.personal_color_swatch_hex;
  }
  if (profile.skinToneHex || profile.skin_tone_hex) {
    return profile.skinToneHex || profile.skin_tone_hex;
  }
  const pc = profile.personalColorSubtype || profile.personalColor || profile.personal_color || 'autumn_warm';
  return PERSONAL_COLOR_DEFAULT_SKIN[pc] || '#E4C8B0';
}

const EXPLICIT_FABRIC_PRESETS = {
  padding: { type: 'padding', labelKo: '구스다운 퀼팅 나일론', roughness: 0.38, metalness: 0.06, sheen: 0.35, clearcoat: 0.18, bumpScale: 0.024 },
  leather: { type: 'leather', labelKo: '이탈리안 풀그레인 레더', roughness: 0.30, metalness: 0.08, sheen: 0.24, clearcoat: 0.44, bumpScale: 0.011 },
  metal: { type: 'metal', labelKo: '스테인리스 스틸 · 브러시드 메탈', roughness: 0.22, metalness: 0.88, sheen: 0.08, clearcoat: 0.62, bumpScale: 0.004 },
  acetate: { type: 'acetate', labelKo: '폴리시드 아세테이트 아이웨어', roughness: 0.18, metalness: 0.04, sheen: 0.14, clearcoat: 0.86, bumpScale: 0.003 },
  gabardine: { type: 'gabardine', labelKo: '발수 코튼 개버딘 트윌', roughness: 0.50, metalness: 0.03, sheen: 0.44, clearcoat: 0.10, bumpScale: 0.014 },
  denim: { type: 'denim', labelKo: '셀비지 인디고 데님 트윌', roughness: 0.76, metalness: 0.02, sheen: 0.25, clearcoat: 0.0, bumpScale: 0.020 },
  silk: { type: 'silk', labelKo: '실크 크레이프 드레이프', roughness: 0.28, metalness: 0.05, sheen: 0.85, clearcoat: 0.16, bumpScale: 0.006 },
  wool: { type: 'wool', labelKo: '버진 울 · 캐시미어 브러시드', roughness: 0.66, metalness: 0.02, sheen: 0.68, clearcoat: 0.03, bumpScale: 0.016 },
  knit: { type: 'knit', labelKo: '파인 메리노 골지 니트', roughness: 0.72, metalness: 0.01, sheen: 0.60, clearcoat: 0.0, bumpScale: 0.022 },
  cotton: { type: 'cotton', labelKo: '수피마 코튼 포플린', roughness: 0.60, metalness: 0.02, sheen: 0.36, clearcoat: 0.03, bumpScale: 0.010 },
};

export function inferFabricMaterialSpec(item = {}) {
  const explicit = String(item.fabric || '').toLowerCase().trim();
  if (explicit && EXPLICIT_FABRIC_PRESETS[explicit]) {
    return EXPLICIT_FABRIC_PRESETS[explicit];
  }
  const sub = String(item.subcategory || '').toLowerCase();
  const cat = String(item.category || '').toLowerCase();
  const name = String(item.name || '');

  if (sub === 'watch' || name.includes('시계') || name.includes('워치')) {
    return EXPLICIT_FABRIC_PRESETS.metal;
  }
  if (sub === 'glasses' || name.includes('안경') || name.includes('아이웨어') || name.includes('선글라스')) {
    return EXPLICIT_FABRIC_PRESETS.acetate;
  }
  if (sub === 'padding' || name.includes('패딩') || name.includes('다운') || name.includes('퀼팅')) {
    return EXPLICIT_FABRIC_PRESETS.padding;
  }
  if (
    sub === 'loafers' ||
    sub === 'boots' ||
    sub === 'heels' ||
    sub === 'sneakers' ||
    sub === 'leather_gloves' ||
    sub === 'briefcase' ||
    sub === 'tote' ||
    sub === 'bag' ||
    sub === 'belt' ||
    name.includes('레더') ||
    name.includes('가죽') ||
    name.includes('서류가방') ||
    name.includes('브리프케이스')
  ) {
    return EXPLICIT_FABRIC_PRESETS.leather;
  }
  if (sub === 'trench' || name.includes('트렌치') || name.includes('개버딘') || name.includes('발수')) {
    return EXPLICIT_FABRIC_PRESETS.gabardine;
  }
  if (sub === 'denim' || name.includes('데님') || name.includes('청바지')) {
    return EXPLICIT_FABRIC_PRESETS.denim;
  }
  if (sub === 'blouse' || sub === 'necktie' || name.includes('실크') || name.includes('새틴')) {
    return EXPLICIT_FABRIC_PRESETS.silk;
  }
  if (sub === 'coat' || sub === 'blazer' || sub === 'slacks' || sub === 'beret' || sub === 'bucket_hat' || sub === 'scarf' || name.includes('울') || name.includes('캐시미어')) {
    return EXPLICIT_FABRIC_PRESETS.wool;
  }
  if (sub === 'knit' || sub === 'cardigan' || sub === 'beanie' || sub === 'muffler' || sub === 'gloves' || cat === 'socks') {
    return EXPLICIT_FABRIC_PRESETS.knit;
  }
  return EXPLICIT_FABRIC_PRESETS.cotton;
}

// -----------------------------------------------------------------------------
// Shared GLB / Texture Asset Cache
// -----------------------------------------------------------------------------
const MODEL_BASE = '/models/mannequin';
const TEXTURE_BASE = '/textures/mannequin';

const GARMENT_UV_TEXTURE_MAP = {
  outer_blazer: { normal: 'suit3_normal.jpg', detail: 'suit3_detail.jpg', normalScale: 0.55 },
  outer_coat: { normal: 'dbsuit_normal.jpg', detail: 'dbsuit_detail.jpg', normalScale: 0.52 },
  outer_jacket: { normal: 'jacket_normal.jpg', detail: 'jacket_detail.jpg', normalScale: 0.58 },
  top_knit: { normal: 'knit_normal.jpg', detail: 'knit_detail.jpg', normalScale: 0.62 },
  top_shirt: { normal: 'shirt_normal.jpg', detail: 'shirt_detail.jpg', normalScale: 0.50 },
  top_tshirt: { detail: 'tshirt_detail.jpg' },
  top_sweatshirt: { normal: 'sweatshirt_normal.jpg', detail: 'sweatshirt_detail.jpg', normalScale: 0.52 },
  top_cardigan: { normal: 'polo_normal.jpg', detail: 'polo_detail.jpg', normalScale: 0.52 },
  bottom_slacks: { detail: 'slacks_detail.jpg' },
  bottom_denim: { normal: 'suit3_normal.jpg', detail: 'suit3_detail.jpg', normalScale: 0.48 },
  bottom_shorts: { normal: 'shorts_normal.jpg', detail: 'shorts_detail.jpg', normalScale: 0.55 },
  gloves_short: { detail: 'gloves_detail.jpg' },
  shoes_loafers: { normal: 'loafers_normal.jpg', detail: 'loafers_detail.jpg', normalScale: 0.52 },
  shoes_sneakers: { normal: 'shoes_normal.jpg', detail: 'sneakers_detail.jpg', normalScale: 0.46 },
  shoes_boots: { normal: 'boots_normal.jpg', detail: 'boots_detail.jpg', normalScale: 0.54 },
  shoes_heels: { normal: 'boots_normal.jpg', detail: 'boots_detail.jpg', normalScale: 0.48 },
  headwear_beret: { normal: 'beret_normal.jpg', normalScale: 0.50 },
  headwear_fedora: { normal: 'fedora_normal.jpg', detail: 'fedora_detail.jpg', normalScale: 0.50 },
  neckwear_tie: { normal: 'suit3_normal.jpg', detail: 'suit3_detail.jpg', normalScale: 0.40 },
};

let gltfLoaderInstance = null;
let texLoaderInstance = null;
let manifestPromise = null;
let manifestData = null;
let bodyTemplatePromise = null;
let bodyTemplateMesh = null;
const garmentTemplateCache = new Map();
const garmentPromiseCache = new Map();
const externalTexCache = new Map();
const bumpTextureCache = new Map();
const previewListeners = new Map();
const activeEngineInstances = new Set();

// Default MakeHuman rest-pose joint coordinates (in Three.js Y-up meters)
const DEFAULT_JOINTS = {
  pelvis: [0.0, 0.85587, 0.01035],
  spine3: [0.0, 0.99292, -0.01313],
  spine2: [0.0, 1.06274, -0.01122],
  spine1: [0.0, 1.20144, -0.01980],
  neck: [0.0, 1.37318, 0.00355],
  head: [0.0, 1.47308, 0.04419],
  shoulderL: [0.17445, 1.28018, 0.01769],
  elbowL: [0.33041, 1.10507, 0.01836],
  handL: [0.44875, 0.98420, 0.17602],
  handTipL: [0.47020, 0.95455, 0.19101],
  shoulderR: [-0.17445, 1.28018, 0.01769],
  elbowR: [-0.33041, 1.10507, 0.01836],
  handR: [-0.44875, 0.98420, 0.17602],
  handTipR: [-0.47020, 0.95455, 0.19101],
  hipL: [0.09725, 0.84776, 0.00276],
  kneeL: [0.13651, 0.46747, 0.03500],
  ankleL: [0.17140, 0.06617, 0.01970],
  footL: [0.17644, 0.00854, 0.13105],
  hipR: [-0.09725, 0.84776, 0.00276],
  kneeR: [-0.13651, 0.46747, 0.03500],
  ankleR: [-0.17140, 0.06617, 0.01970],
  footR: [-0.17644, 0.00854, 0.13105],
};

// Bone indices in our 26-bone Articulated & Multi-Chain Jiggle GPU Skeleton
const BONE = {
  ROOT: 0,
  PELVIS: 1,
  SPINE3: 2,
  SPINE2: 3,
  SPINE1: 4,
  NECK: 5,
  HEAD: 6,
  SHOULDER_L: 7,
  ELBOW_L: 8,
  HAND_L: 9,
  SHOULDER_R: 10,
  ELBOW_R: 11,
  HAND_R: 12,
  HIP_L: 13,
  KNEE_L: 14,
  ANKLE_L: 15,
  HIP_R: 16,
  KNEE_R: 17,
  ANKLE_R: 18,
  JIGGLE_NECK_UPPER: 19,
  JIGGLE_NECK_TIP: 20,
  JIGGLE_HEM_UPPER: 21,
  JIGGLE_HEM_LOWER: 22,
  JIGGLE_STRAP: 23,
  JIGGLE_BAG: 24,
  JIGGLE_LAPEL: 25,
};

const BONE_DEFS = [
  { idx: BONE.ROOT, name: 'root', parent: -1, posKey: null, fallback: [0, 0, 0] },
  { idx: BONE.PELVIS, name: 'pelvis', parent: BONE.ROOT, posKey: 'pelvis' },
  { idx: BONE.SPINE3, name: 'spine3', parent: BONE.PELVIS, posKey: 'spine3' },
  { idx: BONE.SPINE2, name: 'spine2', parent: BONE.SPINE3, posKey: 'spine2' },
  { idx: BONE.SPINE1, name: 'spine1', parent: BONE.SPINE2, posKey: 'spine1' },
  { idx: BONE.NECK, name: 'neck', parent: BONE.SPINE1, posKey: 'neck' },
  { idx: BONE.HEAD, name: 'head', parent: BONE.NECK, posKey: 'head' },
  { idx: BONE.SHOULDER_L, name: 'shoulderL', parent: BONE.SPINE1, posKey: 'shoulderL' },
  { idx: BONE.ELBOW_L, name: 'elbowL', parent: BONE.SHOULDER_L, posKey: 'elbowL' },
  { idx: BONE.HAND_L, name: 'handL', parent: BONE.ELBOW_L, posKey: 'handL' },
  { idx: BONE.SHOULDER_R, name: 'shoulderR', parent: BONE.SPINE1, posKey: 'shoulderR' },
  { idx: BONE.ELBOW_R, name: 'elbowR', parent: BONE.SHOULDER_R, posKey: 'elbowR' },
  { idx: BONE.HAND_R, name: 'handR', parent: BONE.ELBOW_R, posKey: 'handR' },
  { idx: BONE.HIP_L, name: 'hipL', parent: BONE.PELVIS, posKey: 'hipL' },
  { idx: BONE.KNEE_L, name: 'kneeL', parent: BONE.HIP_L, posKey: 'kneeL' },
  { idx: BONE.ANKLE_L, name: 'ankleL', parent: BONE.KNEE_L, posKey: 'ankleL' },
  { idx: BONE.HIP_R, name: 'hipR', parent: BONE.PELVIS, posKey: 'hipR' },
  { idx: BONE.KNEE_R, name: 'kneeR', parent: BONE.HIP_R, posKey: 'kneeR' },
  { idx: BONE.ANKLE_R, name: 'ankleR', parent: BONE.KNEE_R, posKey: 'ankleR' },
  { idx: BONE.JIGGLE_NECK_UPPER, name: 'jiggleNeckUpper', parent: BONE.SPINE1, posKey: null, fallback: [0, 1.33, 0.09] },
  { idx: BONE.JIGGLE_NECK_TIP, name: 'jiggleNeckTip', parent: BONE.JIGGLE_NECK_UPPER, posKey: null, fallback: [0, 1.16, 0.14] },
  { idx: BONE.JIGGLE_HEM_UPPER, name: 'jiggleHemUpper', parent: BONE.PELVIS, posKey: null, fallback: [0, 0.92, 0.0] },
  { idx: BONE.JIGGLE_HEM_LOWER, name: 'jiggleHemLower', parent: BONE.JIGGLE_HEM_UPPER, posKey: null, fallback: [0, 0.66, 0.0] },
  { idx: BONE.JIGGLE_STRAP, name: 'jiggleStrap', parent: BONE.PELVIS, posKey: null, fallback: [0.06, 1.08, 0.0] },
  { idx: BONE.JIGGLE_BAG, name: 'jiggleBag', parent: BONE.JIGGLE_STRAP, posKey: null, fallback: [0.168, 0.916, -0.010] },
  { idx: BONE.JIGGLE_LAPEL, name: 'jiggleLapel', parent: BONE.SPINE1, posKey: null, fallback: [0, 1.16, 0.11] },
];

function createHumanoidSkeleton(jointsMap = {}) {
  const j = { ...DEFAULT_JOINTS, ...(jointsMap || {}) };
  const worldRest = BONE_DEFS.map((d) => (d.posKey ? j[d.posKey] || DEFAULT_JOINTS[d.posKey] : d.fallback));
  const bones = BONE_DEFS.map((d, i) => {
    const b = new THREE.Bone();
    b.name = d.name;
    const wp = worldRest[i];
    if (d.parent >= 0) {
      const pp = worldRest[d.parent];
      b.position.set(wp[0] - pp[0], wp[1] - pp[1], wp[2] - pp[2]);
    } else {
      b.position.set(wp[0], wp[1], wp[2]);
    }
    b.userData.restPos = b.position.clone();
    return b;
  });
  BONE_DEFS.forEach((d, i) => {
    if (d.parent >= 0) {
      bones[d.parent].add(bones[i]);
    }
  });
  bones[0].updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  return { skeleton, bones, rootBone: bones[0], joints: j };
}

function distToSegmentSq(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const lenSq = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (lenSq > 1e-10) {
    t = ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }
  const cx = ax + t * abx - px;
  const cy = ay + t * aby - py;
  const cz = az + t * abz - pz;
  return cx * cx + cy * cy + cz * cz;
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Computes smooth 4-bone GPU skinning attributes (`skinIndex`, `skinWeight`) on a rest-pose geometry,
 * including soft-cloth jiggle weights (`JIGGLE_NECK`, `JIGGLE_HEM`) for mufflers, ties, coats & skirts.
 */
function attachHumanoidSkinAttributes(geom, jointsMap = {}, gid = '', spec = {}) {
  if (geom.attributes.skinIndex && geom.attributes.skinWeight) return;
  if (spec?.mount && spec.mount !== 'body') return;

  const pos = geom.attributes.position;
  if (!pos) return;
  const j = { ...DEFAULT_JOINTS, ...(jointsMap || {}) };
  const n = pos.count;
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);

  // Rigid head-mounted items (hats, eyewear) follow HEAD 100% so brims/frames never warp
  if (spec?.slot === 'headwear' || gid === 'accessory_glasses') {
    for (let i = 0; i < n; i++) {
      skinIndex[i * 4] = BONE.HEAD;
      skinWeight[i * 4] = 1.0;
    }
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    return;
  }

  // Rigid steel wristwatch follows left forearm 100% so circular bezel never warps
  if (gid === 'accessory_watch') {
    for (let i = 0; i < n; i++) {
      skinIndex[i * 4] = BONE.ELBOW_L;
      skinWeight[i * 4] = 1.0;
    }
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    return;
  }

  // Waist belt binds strictly to PELVIS + SPINE3 (never arms/hands)
  if (gid === 'accessory_belt') {
    for (let i = 0; i < n; i++) {
      const [, y] = readMeterCoord(geom, i);
      const wSpine = smoothstep(0.97, 1.02, y) * 0.45;
      skinIndex[i * 4] = BONE.PELVIS;
      skinWeight[i * 4] = 1.0 - wSpine;
      skinIndex[i * 4 + 1] = BONE.SPINE3;
      skinWeight[i * 4 + 1] = wSpine;
    }
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    return;
  }

  // Crossbody saddle bag: coupled D-ring pouch (`JIGGLE_BAG`) + elastic diagonal leather strap (`JIGGLE_STRAP`)
  if (gid === 'accessory_bag') {
    for (let i = 0; i < n; i++) {
      const [x, y] = readMeterCoord(geom, i);
      const isPouch = y <= 0.919 && x > 0.130;
      if (isPouch) {
        skinIndex[i * 4] = BONE.PELVIS;
        skinWeight[i * 4] = 0.18;
        skinIndex[i * 4 + 1] = BONE.JIGGLE_BAG;
        skinWeight[i * 4 + 1] = 0.82;
        continue;
      }

      // C1-continuous weld at D-rings (`y = 0.919`) -> elastic leather strap flex (`y = 0.95..1.22`) -> shoulder anchor
      const wBagWeld = 0.82 * smoothstep(0.985, 0.919, y) * smoothstep(0.08, 0.145, x);
      const wStrapFlex =
        0.54 *
        smoothstep(1.23, 1.03, y) *
        smoothstep(0.919, 0.985, y) *
        Math.max(0, 1.0 - wBagWeld / 0.82);
      const remain = Math.max(0, 1.0 - wBagWeld - wStrapFlex);

      let b0 = BONE.PELVIS;
      let b1 = BONE.SPINE3;
      let tBlend = 0.0;
      if (y <= 0.94) {
        b0 = BONE.PELVIS;
        b1 = BONE.SPINE3;
        tBlend = 0.0;
      } else if (y <= 1.04) {
        b0 = BONE.PELVIS;
        b1 = BONE.SPINE3;
        tBlend = smoothstep(0.94, 1.04, y);
      } else if (y <= 1.16) {
        b0 = BONE.SPINE3;
        b1 = BONE.SPINE2;
        tBlend = smoothstep(1.04, 1.16, y);
      } else {
        b0 = BONE.SPINE2;
        b1 = BONE.SPINE1;
        tBlend = smoothstep(1.16, 1.28, y);
      }
      skinIndex[i * 4] = b0;
      skinWeight[i * 4] = remain * (1.0 - tBlend);
      skinIndex[i * 4 + 1] = b1;
      skinWeight[i * 4 + 1] = remain * tBlend;
      if (wStrapFlex > 0.0005) {
        skinIndex[i * 4 + 2] = BONE.JIGGLE_STRAP;
        skinWeight[i * 4 + 2] = wStrapFlex;
      }
      if (wBagWeld > 0.0005) {
        skinIndex[i * 4 + 3] = BONE.JIGGLE_BAG;
        skinWeight[i * 4 + 3] = wBagWeld;
      }
    }
    geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    return;
  }

  const capsules = [
    { bone: BONE.HEAD, a: j.head, b: [0, 1.62, 0.02], r: 0.095, filter: (x, y) => y > 1.38 && Math.abs(x) < 0.16 },
    { bone: BONE.NECK, a: [0, 1.30, 0.0], b: j.head, r: 0.062, filter: (x, y) => y > 1.24 && y < 1.50 && Math.abs(x) < 0.14 },
    { bone: BONE.SPINE1, a: [0, 1.13, -0.015], b: [0, 1.31, 0.0], r: 0.132, filter: (x, y) => y > 1.05 && y < 1.42 && Math.abs(x) < 0.23 },
    { bone: BONE.SPINE2, a: [0, 1.01, -0.012], b: [0, 1.13, -0.015], r: 0.125, filter: (x, y) => y > 0.94 && y < 1.22 && Math.abs(x) < 0.22 },
    { bone: BONE.SPINE3, a: [0, 0.90, -0.005], b: [0, 1.01, -0.012], r: 0.125, filter: (x, y) => y > 0.82 && y < 1.09 && Math.abs(x) < 0.22 },
    { bone: BONE.PELVIS, a: [-0.075, 0.85, 0.01], b: [0.075, 0.85, 0.01], r: 0.132, filter: (x, y) => y > 0.72 && y < 0.98 && Math.abs(x) < 0.24 },

    { bone: BONE.SHOULDER_L, a: j.shoulderL, b: j.elbowL, r: 0.052, filter: (x, y) => x > 0.12 && y > 0.98 },
    { bone: BONE.ELBOW_L, a: j.elbowL, b: j.handL, r: 0.044, filter: (x, y) => x > 0.24 && y > 0.88 },
    { bone: BONE.HAND_L, a: j.handL, b: j.handTipL, r: 0.046, filter: (x, y) => x > 0.36 && y > 0.84 },

    { bone: BONE.SHOULDER_R, a: j.shoulderR, b: j.elbowR, r: 0.052, filter: (x, y) => x < -0.12 && y > 0.98 },
    { bone: BONE.ELBOW_R, a: j.elbowR, b: j.handR, r: 0.044, filter: (x, y) => x < -0.24 && y > 0.88 },
    { bone: BONE.HAND_R, a: j.handR, b: j.handTipR, r: 0.046, filter: (x, y) => x < -0.36 && y > 0.84 },

    { bone: BONE.HIP_L, a: j.hipL, b: j.kneeL, r: 0.078, filter: (x, y) => x >= -0.025 && y < 0.92 && y > 0.38 },
    { bone: BONE.KNEE_L, a: j.kneeL, b: j.ankleL, r: 0.056, filter: (x, y) => x >= -0.01 && y < 0.54 },
    { bone: BONE.ANKLE_L, a: j.ankleL, b: j.footL, r: 0.058, filter: (x, y) => x >= 0.0 && y < 0.16 },

    { bone: BONE.HIP_R, a: j.hipR, b: j.kneeR, r: 0.078, filter: (x, y) => x <= 0.025 && y < 0.92 && y > 0.38 },
    { bone: BONE.KNEE_R, a: j.kneeR, b: j.ankleR, r: 0.056, filter: (x, y) => x <= 0.01 && y < 0.54 },
    { bone: BONE.ANKLE_R, a: j.ankleR, b: j.footR, r: 0.058, filter: (x, y) => x <= 0.0 && y < 0.16 },
  ];

  const physicsKey = spec?.physics || 'rigid_fitted';
  const isShoes = spec?.slot === 'shoes';
  const isGloves = spec?.slot === 'gloves';

  for (let i = 0; i < n; i++) {
    const [x, y, z] = readMeterCoord(geom, i);

    // Crisp rigid soles for footwear so heels/loafers don't bend like rubber
    if (isShoes) {
      const ankleBone = x >= 0 ? BONE.ANKLE_L : BONE.ANKLE_R;
      const kneeBone = x >= 0 ? BONE.KNEE_L : BONE.KNEE_R;
      const upperBlend = smoothstep(0.09, 0.19, y) * 0.45;
      skinIndex[i * 4] = ankleBone;
      skinWeight[i * 4] = 1.0 - upperBlend;
      skinIndex[i * 4 + 1] = kneeBone;
      skinWeight[i * 4 + 1] = upperBlend;
      continue;
    }

    // Gloves only bind to forearm & hand so fingers never pull toward hips
    if (isGloves) {
      const isLeft = x >= 0;
      const handB = isLeft ? BONE.HAND_L : BONE.HAND_R;
      const elbowB = isLeft ? BONE.ELBOW_L : BONE.ELBOW_R;
      const handJ = isLeft ? j.handL : j.handR;
      const elbowJ = isLeft ? j.elbowL : j.elbowR;
      const dHand = Math.hypot(x - handJ[0], y - handJ[1], z - handJ[2]);
      const dElbow = Math.hypot(x - elbowJ[0], y - elbowJ[1], z - elbowJ[2]);
      const wHand = smoothstep(0.08, -0.03, dHand - dElbow * 0.42);
      skinIndex[i * 4] = handB;
      skinWeight[i * 4] = Math.max(0.15, wHand);
      skinIndex[i * 4 + 1] = elbowB;
      skinWeight[i * 4 + 1] = 1.0 - Math.max(0.15, wHand);
      continue;
    }

    const cand = [];
    for (let c = 0; c < capsules.length; c++) {
      const cap = capsules[c];
      if (!cap.filter(x, y, z)) continue;
      const dSq = distToSegmentSq(x, y, z, cap.a[0], cap.a[1], cap.a[2], cap.b[0], cap.b[1], cap.b[2]);
      const dist = Math.max(0.002, Math.sqrt(dSq) - cap.r * 0.55);
      cand.push({ bone: cap.bone, score: 1.0 / (dist * dist * dist + 1e-5) });
    }

    if (cand.length === 0) {
      // Fallback for wide skirts/coats outside standard limb capsules
      if (y > 1.35) cand.push({ bone: BONE.HEAD, score: 1 });
      else if (y > 1.05) cand.push({ bone: BONE.SPINE1, score: 1 });
      else if (y > 0.80) cand.push({ bone: BONE.PELVIS, score: 1 });
      else {
        cand.push({ bone: BONE.HIP_L, score: x >= 0 ? 1.4 : 0.6 });
        cand.push({ bone: BONE.HIP_R, score: x <= 0 ? 1.4 : 0.6 });
      }
    }

    cand.sort((a, b) => b.score - a.score);

    // Compute up to 2 articulated GPU Jiggle Bone weights `(jBoneA, jWeightA)` & `(jBoneB, jWeightB)`
    let jBoneA = -1;
    let jWeightA = 0;
    let jBoneB = -1;
    let jWeightB = 0;
    const torsoCoreMask = smoothstep(0.22, 0.13, Math.abs(x));

    if (
      physicsKey === 'soft_jiggle_muffler' ||
      physicsKey === 'soft_jiggle_tie' ||
      gid === 'neckwear_scarf' ||
      gid === 'neckwear_tie'
    ) {
      // 2-Link Ribbon Chain: collar anchored at neck (`y >= 1.35`), upper panel -> fringe tip S-wave
      const downFactor = smoothstep(1.345, 1.175, y);
      const frontFactor = smoothstep(0.01, 0.075, z);
      const maxFlutter = gid === 'neckwear_tie' ? 0.82 : 0.90;
      const totalW = downFactor * (0.32 + 0.68 * frontFactor) * maxFlutter;
      const tipRatio = smoothstep(1.24, 1.075, y);
      jBoneA = BONE.JIGGLE_NECK_UPPER;
      jWeightA = totalW * (1.0 - tipRatio);
      jBoneB = BONE.JIGGLE_NECK_TIP;
      jWeightB = totalW * tipRatio;
    } else if (physicsKey === 'hem_sway_coat' || gid === 'outer_coat') {
      // 2-Link Coat Flare & Wind Billow below waist + Open Front Lapel Flutter above waist
      // Keep front-thigh leg-follow strong so walking strides never poke slacks through the coat front
      if (y < 0.90) {
        const frontStrideGuard = z > 0.03 ? 0.56 : 1.0;
        const totalHem = smoothstep(0.90, 0.49, y) * 0.44 * frontStrideGuard;
        const lowerRatio = smoothstep(0.74, 0.48, y);
        jBoneA = BONE.JIGGLE_HEM_UPPER;
        jWeightA = totalHem * (1.0 - lowerRatio);
        jBoneB = BONE.JIGGLE_HEM_LOWER;
        jWeightB = totalHem * lowerRatio;
      } else if (y <= 1.27 && z > 0.085 && torsoCoreMask > 0.01) {
        jBoneA = BONE.JIGGLE_LAPEL;
        jWeightA =
          smoothstep(0.97, 1.10, y) *
          smoothstep(1.27, 1.16, y) *
          smoothstep(0.085, 0.155, z) *
          torsoCoreMask *
          0.34;
      }
    } else if (
      physicsKey === 'hem_sway_skirt' ||
      gid === 'bottom_skirt' ||
      gid === 'dress_shift' ||
      gid === 'dress_onepiece'
    ) {
      // 2-Link Pleated Skirt / Dress Wave & Radial Wind Billow
      if (y < 0.90) {
        const totalHem = smoothstep(0.90, 0.40, y) * 0.56;
        const lowerRatio = smoothstep(0.73, 0.40, y);
        jBoneA = BONE.JIGGLE_HEM_UPPER;
        jWeightA = totalHem * (1.0 - lowerRatio);
        jBoneB = BONE.JIGGLE_HEM_LOWER;
        jWeightB = totalHem * lowerRatio;
      }
    } else if (gid === 'outer_blazer' || gid === 'outer_jacket') {
      // Tailored Blazer / Jacket: wind-responsive lower vent hem + open lapel flutter (sleeves & collar excluded)
      const isBlazer = gid === 'outer_blazer';
      if (y < 0.89 && torsoCoreMask > 0.02) {
        jBoneA = BONE.JIGGLE_HEM_UPPER;
        jWeightA = smoothstep(0.89, 0.72, y) * torsoCoreMask * (isBlazer ? 0.28 : 0.20);
      } else if (y > 0.98 && y < 1.25 && z > 0.088 && torsoCoreMask > 0.05) {
        jBoneA = BONE.JIGGLE_LAPEL;
        jWeightA =
          smoothstep(0.98, 1.10, y) *
          smoothstep(1.25, 1.15, y) *
          smoothstep(0.088, 0.15, z) *
          torsoCoreMask *
          (isBlazer ? 0.20 : 0.15);
      }
    } else if (gid === 'top_cardigan' || gid === 'top_shirt') {
      // Poplin Shirt / Cardigan: untucked lower hem sway + front placket wind ripple
      if (y < 0.885 && torsoCoreMask > 0.02) {
        jBoneA = BONE.JIGGLE_HEM_UPPER;
        jWeightA = smoothstep(0.885, 0.78, y) * torsoCoreMask * 0.16;
      } else if (y > 0.98 && y < 1.24 && z > 0.078 && torsoCoreMask > 0.05) {
        jBoneA = BONE.JIGGLE_LAPEL;
        jWeightA =
          smoothstep(0.98, 1.10, y) *
          smoothstep(1.24, 1.14, y) *
          smoothstep(0.078, 0.135, z) *
          torsoCoreMask *
          0.18;
      }
    } else if (gid === 'top_knit' || gid === 'top_tshirt' || gid === 'top_sweatshirt') {
      // Knit / Tee / Sweatshirt: subtle waist-hem & chest fabric wind response
      if (y < 0.885 && torsoCoreMask > 0.02) {
        jBoneA = BONE.JIGGLE_HEM_UPPER;
        jWeightA = smoothstep(0.885, 0.79, y) * torsoCoreMask * 0.14;
      } else if (y > 1.00 && y < 1.24 && z > 0.088 && torsoCoreMask > 0.1) {
        jBoneA = BONE.JIGGLE_LAPEL;
        jWeightA = smoothstep(0.088, 0.14, z) * torsoCoreMask * 0.14;
      }
    } else if (gid === 'bottom_slacks') {
      // Tailored Slacks: upper pleat breeze drape above knee so ankles track SHIN_L/SHIN_R 100% cleanly
      if (y > 0.64 && y < 0.87) {
        jBoneA = BONE.JIGGLE_HEM_UPPER;
        jWeightA = smoothstep(0.87, 0.76, y) * smoothstep(0.64, 0.74, y) * 0.12;
      }
    } else if (gid === 'bottom_shorts') {
      if (y > 0.48 && y < 0.64) {
        jBoneA = BONE.JIGGLE_HEM_UPPER;
        jWeightA = smoothstep(0.64, 0.52, y) * 0.12;
      }
    } else if (physicsKey === 'drape_wind_garment') {
      if (y < 0.885 && torsoCoreMask > 0.02) {
        jBoneA = BONE.JIGGLE_HEM_UPPER;
        jWeightA = smoothstep(0.885, 0.78, y) * torsoCoreMask * 0.15;
      } else if (y > 0.98 && y < 1.24 && z > 0.082 && torsoCoreMask > 0.05) {
        jBoneA = BONE.JIGGLE_LAPEL;
        jWeightA = smoothstep(0.082, 0.14, z) * torsoCoreMask * 0.15;
      }
    }

    const hasTwoJiggle = jBoneB >= 0 && jWeightB > 0.0008;
    const totalJiggle = (jBoneA >= 0 ? jWeightA : 0) + (hasTwoJiggle ? jWeightB : 0);
    const remain = Math.max(0, 1.0 - totalJiggle);
    const maxBodySlots = hasTwoJiggle ? 2 : jBoneA >= 0 && jWeightA > 0.0008 ? 3 : 4;
    const top = cand.slice(0, maxBodySlots);
    const sum = top.reduce((acc, it) => acc + it.score, 0) || 1;

    for (let k = 0; k < top.length; k++) {
      skinIndex[i * 4 + k] = top[k].bone;
      skinWeight[i * 4 + k] = (top[k].score / sum) * remain;
    }
    if (hasTwoJiggle) {
      skinIndex[i * 4 + 2] = jBoneA;
      skinWeight[i * 4 + 2] = jWeightA;
      skinIndex[i * 4 + 3] = jBoneB;
      skinWeight[i * 4 + 3] = jWeightB;
    } else if (jBoneA >= 0 && jWeightA > 0.0008) {
      skinIndex[i * 4 + 3] = jBoneA;
      skinWeight[i * 4 + 3] = jWeightA;
    }
  }

  geom.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geom.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
}

/**
 * Splits procedural multi-zone triangle indices via `COLOR_0` into BufferGeometry material groups:
 * - group 0: Primary fabric/leather (tinted by item `color_hex`)
 * - group 1: Brushed silver/palladium hardware (`r > 0.85 && g < 0.25`)
 * - group 2: Watch ivory dial (`g > 0.85 && r < 0.25`)
 * - group 3: Optical eyeglass lens (`b > 0.85 && r < 0.25`)
 */
function buildMultiZoneMaterialGroups(geom) {
  const col = geom.attributes.color;
  const idx = geom.userData.fullIndexArray || geom.index?.array;
  if (!col || !idx) return false;

  const buckets = [[], [], [], []];
  let nonPrimaryCount = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i];
    const b = idx[i + 1];
    const c = idx[i + 2];
    const r = (col.getX(a) + col.getX(b) + col.getX(c)) / 3;
    const g = (col.getY(a) + col.getY(b) + col.getY(c)) / 3;
    const bl = (col.getZ(a) + col.getZ(b) + col.getZ(c)) / 3;
    let zone = 0;
    if (r > 0.82 && g < 0.26) {
      zone = 1;
      nonPrimaryCount++;
    } else if (g > 0.82 && r < 0.26) {
      zone = 2;
      nonPrimaryCount++;
    } else if (bl > 0.82 && r < 0.26) {
      zone = 3;
      nonPrimaryCount++;
    }
    buckets[zone].push(a, b, c);
  }

  if (nonPrimaryCount === 0) return false;

  const ordered = [];
  const zoneGroups = [];
  for (let z = 0; z < buckets.length; z++) {
    if (buckets[z].length === 0) continue;
    zoneGroups.push({ start: ordered.length, count: buckets[z].length, materialIndex: z });
    ordered.push(...buckets[z]);
  }
  const ArrType = idx.constructor;
  const sortedArr = new ArrType(ordered);
  geom.setIndex(new THREE.BufferAttribute(sortedArr, 1));
  geom.userData.fullIndexArray = sortedArr.slice();
  geom.userData.zoneGroups = zoneGroups;
  geom.clearGroups();
  for (const g of zoneGroups) {
    geom.addGroup(g.start, g.count, g.materialIndex);
  }
  return true;
}

function getGLTFLoader() {
  if (!gltfLoaderInstance) {
    gltfLoaderInstance = new GLTFLoader();
    gltfLoaderInstance.setMeshoptDecoder(MeshoptDecoder);
  }
  return gltfLoaderInstance;
}

function getTexLoader() {
  if (!texLoaderInstance) {
    texLoaderInstance = new THREE.TextureLoader();
  }
  return texLoaderInstance;
}

function acquireCachedTexture(url, { srgb = false, repeat = 1 } = {}) {
  const cacheKey = `${url}|srgb:${srgb ? 1 : 0}|rep:${repeat}`;
  let entry = externalTexCache.get(cacheKey);
  if (!entry) {
    const tex = getTexLoader().load(
      url,
      () => notifyPreviewListeners(),
      undefined,
      () => {}
    );
    // MakeHuman UV textures align cleanly with flipY = false when exported via glTF!
    tex.flipY = false;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    if (repeat > 1) {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
    }
    entry = { tex, refCount: 0, cacheKey, mapRef: externalTexCache };
    externalTexCache.set(cacheKey, entry);
  }
  entry.refCount += 1;
  return entry;
}

function acquireFabricBumpMap(fabricType = 'knit') {
  let entry = bumpTextureCache.get(fabricType);
  if (!entry) {
    if (typeof document === 'undefined') return null;

    const size = 192;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    const imgData = ctx.createImageData(size, size);
    const { data } = imgData;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let v = 128;
        if (fabricType === 'knit') {
          const rib = Math.sin((x / size) * Math.PI * 36) * 38;
          const loop = Math.sin((y / size) * Math.PI * 48 + (x % 4) * 0.9) * 26;
          v = 128 + rib + loop;
        } else if (fabricType === 'padding') {
          const baffle = Math.abs(Math.sin((y / size) * Math.PI * 6));
          v = baffle < 0.08 ? 36 : 122 + Math.pow(baffle, 0.45) * 112;
        } else if (fabricType === 'denim' || fabricType === 'gabardine') {
          const twill = Math.sin(((x + y * 1.4) / size) * Math.PI * 42) * 34;
          v = 128 + twill;
        } else if (fabricType === 'leather') {
          const grain = Math.sin(x * 0.85) * Math.cos(y * 0.85) * 16 + Math.sin((x + y) * 1.7) * 8;
          v = 128 + grain;
        } else if (fabricType === 'wool') {
          const felt = Math.sin((x - y) * 0.65) * 20 + Math.cos((x + y) * 0.85) * 18;
          v = 128 + felt;
        } else if (fabricType === 'skin') {
          const pore = Math.sin(x * 1.3) * Math.cos(y * 1.3) * 7 + Math.sin(x * 0.4 + y * 0.5) * 5;
          v = 128 + pore;
        } else {
          const weave = (Math.sin(x * 1.3) + Math.sin(y * 1.3)) * 14;
          v = 128 + weave;
        }
        const clamped = Math.max(0, Math.min(255, Math.round(v)));
        const idx = (y * size + x) * 4;
        data[idx] = clamped;
        data[idx + 1] = clamped;
        data[idx + 2] = clamped;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    const rep = fabricType === 'padding' ? 2 : fabricType === 'skin' ? 16 : 6;
    tex.repeat.set(rep, rep);
    entry = { tex, refCount: 0, cacheKey: fabricType, mapRef: bumpTextureCache };
    bumpTextureCache.set(fabricType, entry);
  }
  entry.refCount += 1;
  return entry;
}

function releaseTextureEntry(entry) {
  if (!entry) return;
  entry.refCount -= 1;
  if (entry.refCount <= 0) {
    entry.mapRef?.delete(entry.cacheKey);
    entry.tex?.dispose?.();
  }
}

function loadManifest() {
  if (manifestData) return Promise.resolve(manifestData);
  if (!manifestPromise) {
    manifestPromise = fetch(`${MODEL_BASE}/manifest.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        manifestData = json;
        return json;
      });
  }
  return manifestPromise;
}

function extractFirstMesh(gltf) {
  gltf.scene.updateMatrixWorld(true);
  let found = null;
  gltf.scene.traverse((obj) => {
    if (!found && obj.isMesh) found = obj;
  });
  if (!found) throw new Error('No mesh in GLB');
  if (found.geometry.index) {
    found.geometry.userData.fullIndexArray = found.geometry.index.array.slice();
  }
  found.geometry.userData.nodePosition = found.position.clone();
  found.geometry.userData.nodeScale = found.scale.clone();
  found.geometry.userData.nodeQuaternion = found.quaternion.clone();
  return found;
}

function readMeterCoord(geom, i) {
  const pos = geom.attributes.position;
  const s = geom.userData.nodeScale || { x: 1, y: 1, z: 1 };
  const t = geom.userData.nodePosition || { x: 0, y: 0, z: 0 };
  return [
    pos.getX(i) * s.x + t.x,
    pos.getY(i) * s.y + t.y,
    pos.getZ(i) * s.z + t.z,
  ];
}

function applyNodeTransform(mesh, tpl) {
  mesh.position.copy(tpl.position);
  mesh.scale.copy(tpl.scale);
  mesh.quaternion.copy(tpl.quaternion);
  mesh.geometry.userData.nodePosition = tpl.position.clone();
  mesh.geometry.userData.nodeScale = tpl.scale.clone();
}

function loadBodyTemplate() {
  if (bodyTemplateMesh) return Promise.resolve(bodyTemplateMesh);
  if (!bodyTemplatePromise) {
    bodyTemplatePromise = Promise.all([
      loadManifest(),
      getGLTFLoader().loadAsync(`${MODEL_BASE}/body.glb`),
    ]).then(([manifest, gltf]) => {
      const mesh = extractFirstMesh(gltf);
      attachHumanoidSkinAttributes(mesh.geometry, manifest.joints, 'body', { slot: 'body', mount: 'body' });
      bodyTemplateMesh = mesh;
      notifyPreviewListeners();
      return bodyTemplateMesh;
    });
  }
  return bodyTemplatePromise;
}

function loadGarmentTemplate(gid) {
  if (garmentTemplateCache.has(gid)) {
    return Promise.resolve(garmentTemplateCache.get(gid));
  }
  if (garmentPromiseCache.has(gid)) {
    return garmentPromiseCache.get(gid);
  }
  const p = loadManifest().then((manifest) => {
    const spec = manifest.garments?.[gid];
    if (!spec) throw new Error(`Unknown garment ${gid}`);
    return Promise.all([
      loadBodyTemplate(),
      getGLTFLoader().loadAsync(`${MODEL_BASE}/${spec.file}`),
    ]).then(([bodyTpl, gltf]) => {
      const mesh = extractFirstMesh(gltf);
      mesh.userData.gid = gid;
      mesh.userData.spec = spec;
      mesh.userData.hasMultiZones = buildMultiZoneMaterialGroups(mesh.geometry);
      attachHumanoidSkinAttributes(mesh.geometry, manifest.joints, gid, spec);
      if (bodyTpl && spec.cullBody) {
        mesh.userData.coveredBodyVerts = computeCoveredVertices(
          bodyTpl.geometry,
          mesh.geometry,
          spec.slot
        );
      }
      garmentTemplateCache.set(gid, mesh);
      notifyPreviewListeners();
      return mesh;
    });
  });
  garmentPromiseCache.set(gid, p);
  return p;
}

// -----------------------------------------------------------------------------
// Fast 3D Spatial Coverage Culling (prevents skin / inner-sleeve poke-through)
// -----------------------------------------------------------------------------
function findBoundaryVertexCoords(geom) {
  const pos = geom.attributes.position;
  const idx = geom.userData.fullIndexArray || geom.index?.array;
  if (!idx || !pos) return new Float32Array(0);

  const vKey = new Int32Array(pos.count);
  const keyMap = new Map();
  let nextId = 0;
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = readMeterCoord(geom, i);
    const k = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`;
    let id = keyMap.get(k);
    if (id === undefined) {
      id = nextId++;
      keyMap.set(k, id);
    }
    vKey[i] = id;
  }

  const edgeCounts = new Map();
  const edgeRep = new Map();
  for (let i = 0; i < idx.length; i += 3) {
    const tri = [idx[i], idx[i + 1], idx[i + 2]];
    for (let e = 0; e < 3; e++) {
      const va = tri[e];
      const vb = tri[(e + 1) % 3];
      const ka = vKey[va];
      const kb = vKey[vb];
      if (ka === kb) continue;
      const ek = ka < kb ? `${ka}_${kb}` : `${kb}_${ka}`;
      edgeCounts.set(ek, (edgeCounts.get(ek) || 0) + 1);
      if (!edgeRep.has(ek)) edgeRep.set(ek, [va, vb]);
    }
  }

  const bndIndices = new Set();
  for (const [ek, count] of edgeCounts.entries()) {
    if (count === 1) {
      const [va, vb] = edgeRep.get(ek);
      bndIndices.add(va);
      bndIndices.add(vb);
    }
  }

  const out = new Float32Array(bndIndices.size * 3);
  let ptr = 0;
  for (const vi of bndIndices) {
    const [x, y, z] = readMeterCoord(geom, vi);
    out[ptr++] = x;
    out[ptr++] = y;
    out[ptr++] = z;
  }
  return out;
}

function computeCoveredVertices(bodyGeom, garmentGeom, slot) {
  const bPos = bodyGeom.attributes.position;
  const gPos = garmentGeom.attributes.position;
  if (!bPos || !gPos) return new Uint8Array(0);

  let yMin = Infinity;
  let yMax = -Infinity;
  const cell = 0.035;
  const grid = new Map();
  for (let i = 0; i < gPos.count; i++) {
    const [x, y, z] = readMeterCoord(garmentGeom, i);
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    const gz = Math.floor(z / cell);
    const key = `${gx},${gy},${gz}`;
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(x, y, z);
  }

  const bndCoords = findBoundaryVertexCoords(garmentGeom);
  const covered = new Uint8Array(bPos.count);
  const maxSurfDist2 = 0.036 * 0.036;
  const minBndDist2 = (slot === 'shoes' ? 0.016 : 0.026) ** 2;

  for (let i = 0; i < bPos.count; i++) {
    const [x, y, z] = readMeterCoord(bodyGeom, i);
    if (y < yMin - 0.01 || y > yMax + 0.01) continue;
    if (slot === 'gloves' && Math.abs(x) < 0.25) continue;
    if (slot === 'shoes' && y > 0.145) continue;
    if ((slot === 'top' || slot === 'bottom' || slot === 'dress') && (y < 0.13 || y > 1.38 || Math.abs(x) > 0.37)) {
      continue;
    }

    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    const gz = Math.floor(z / cell);
    let minD2 = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
          if (!bucket) continue;
          for (let k = 0; k < bucket.length; k += 3) {
            const d2 = (x - bucket[k]) ** 2 + (y - bucket[k + 1]) ** 2 + (z - bucket[k + 2]) ** 2;
            if (d2 < minD2) minD2 = d2;
          }
        }
      }
    }
    if (minD2 > maxSurfDist2) continue;

    let bndD2 = Infinity;
    for (let k = 0; k < bndCoords.length; k += 3) {
      const d2 = (x - bndCoords[k]) ** 2 + (y - bndCoords[k + 1]) ** 2 + (z - bndCoords[k + 2]) ** 2;
      if (d2 < bndD2) bndD2 = d2;
    }
    if (bndD2 > minBndDist2) {
      covered[i] = 1;
    }
  }
  return covered;
}

function applyTriangleMask(mesh, hiddenVertMask) {
  const geom = mesh.geometry;
  const full = geom.userData.fullIndexArray;
  if (!full || !geom.index || geom.userData.zoneGroups) return;

  let idxAttr = geom.index;
  if (idxAttr.array.length < full.length) {
    idxAttr = new THREE.BufferAttribute(full.slice(), 1);
    geom.setIndex(idxAttr);
  }

  if (!hiddenVertMask) {
    if (geom.userData.isMasked) {
      idxAttr.array.set(full);
      idxAttr.needsUpdate = true;
      geom.setDrawRange(0, full.length);
      geom.userData.isMasked = false;
    }
    return;
  }

  const arr = idxAttr.array;
  let ptr = 0;
  for (let i = 0; i < full.length; i += 3) {
    const a = full[i];
    const b = full[i + 1];
    const c = full[i + 2];
    if (hiddenVertMask[a] && hiddenVertMask[b] && hiddenVertMask[c]) continue;
    arr[ptr++] = a;
    arr[ptr++] = b;
    arr[ptr++] = c;
  }
  idxAttr.needsUpdate = true;
  geom.setDrawRange(0, ptr);
  geom.userData.isMasked = true;
}

function maskInnerTopUnderOuter(topMesh, hasOuter, outerGid = null) {
  const geom = topMesh.geometry;
  const full = geom.userData.fullIndexArray;
  if (!full || !geom.index) return;
  if (!hasOuter) {
    applyTriangleMask(topMesh, null);
    return;
  }
  const isDoubleBreastedCoat = outerGid === 'outer_coat';
  const pos = geom.attributes.position;
  const hide = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = readMeterCoord(geom, i);
    const absX = Math.abs(x);
    const inFrontOpening = isDoubleBreastedCoat
      ? y > 1.245 && z > 0.02 && absX < Math.min(0.068, 0.014 + Math.max(0, y - 1.245) * 0.42)
      : absX < 0.084 && y > 1.11 && z > 0.02;
    const inCollar = isDoubleBreastedCoat ? absX < 0.076 && y > 1.355 : absX < 0.094 && y > 1.34;
    if (!inFrontOpening && !inCollar) {
      hide[i] = 1;
    }
  }
  applyTriangleMask(topMesh, hide);
}

function maskSocksUnderLongPants(sockMesh, hasLongPants) {
  const geom = sockMesh.geometry;
  const full = geom.userData.fullIndexArray;
  if (!full || !geom.index) return;
  if (!hasLongPants) {
    applyTriangleMask(sockMesh, null);
    return;
  }
  const pos = geom.attributes.position;
  const hide = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const [, y] = readMeterCoord(geom, i);
    if (y > 0.145) {
      hide[i] = 1;
    }
  }
  applyTriangleMask(sockMesh, hide);
}

function maskBottomUnderOuterAndTop(bottomMesh, outerGid, hasTop) {
  const geom = bottomMesh.geometry;
  const full = geom.userData.fullIndexArray;
  if (!full || !geom.index) return;

  let cutoffY = null;
  if (outerGid === 'outer_coat') {
    cutoffY = 0.57;
  } else if (outerGid === 'outer_blazer') {
    cutoffY = 0.80;
  } else if (outerGid === 'outer_jacket') {
    cutoffY = 0.83;
  } else if (hasTop) {
    cutoffY = 0.90;
  }

  if (cutoffY === null) {
    applyTriangleMask(bottomMesh, null);
    return;
  }

  const pos = geom.attributes.position;
  const hide = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const [, y] = readMeterCoord(geom, i);
    if (y > cutoffY) {
      hide[i] = 1;
    }
  }
  applyTriangleMask(bottomMesh, hide);
}

// -----------------------------------------------------------------------------
// Morph Target Mapping (7 Body Shapes + Custom 3-Sizes + BMI/BodyFat + Gender)
// -----------------------------------------------------------------------------
const SHAPE_MACRO_PRESETS = {
  ectomorph_thin: {
    weight_down: 0.78,
    muscle_down: 0.45,
    shoulder_down: 0.28,
    chest_down: 0.26,
    waist_down: 0.32,
    hips_down: 0.28,
    thigh_down: 0.45,
    calf_down: 0.40,
    arm_down: 0.45,
  },
  skinny_fat: {
    weight_up: 0.18,
    muscle_down: 0.55,
    shoulder_down: 0.22,
    arm_down: 0.30,
    waist_up: 0.38,
    belly_up: 0.34,
  },
  standard_balanced: {
    muscle_up: 0.22,
  },
  upper_developed: {
    muscle_up: 0.55,
    shoulder_up: 0.46,
    chest_up: 0.40,
    arm_up: 0.35,
    waist_down: 0.20,
    hips_down: 0.24,
  },
  inverted_triangle: {
    muscle_up: 0.55,
    shoulder_up: 0.46,
    chest_up: 0.40,
    arm_up: 0.35,
    waist_down: 0.20,
    hips_down: 0.24,
  },
  lower_developed: {
    weight_up: 0.16,
    shoulder_down: 0.20,
    chest_down: 0.18,
    waist_down: 0.12,
    hips_up: 0.48,
    thigh_up: 0.55,
    calf_up: 0.45,
  },
  pear_lower: {
    weight_up: 0.16,
    shoulder_down: 0.20,
    chest_down: 0.18,
    waist_down: 0.12,
    hips_up: 0.48,
    thigh_up: 0.55,
    calf_up: 0.45,
  },
  muscular_athletic: {
    muscle_up: 0.88,
    weight_up: 0.12,
    shoulder_up: 0.40,
    chest_up: 0.36,
    waist_down: 0.32,
    belly_down: 0.16,
    thigh_up: 0.40,
    calf_up: 0.35,
    arm_up: 0.45,
  },
  plus_curvy: {
    weight_up: 0.72,
    muscle_up: 0.14,
    shoulder_up: 0.22,
    chest_up: 0.36,
    waist_up: 0.42,
    belly_up: 0.30,
    hips_up: 0.44,
    thigh_up: 0.42,
  },
  endomorph_volume: {
    weight_up: 0.72,
    muscle_up: 0.14,
    shoulder_up: 0.22,
    chest_up: 0.36,
    waist_up: 0.42,
    belly_up: 0.30,
    hips_up: 0.44,
    thigh_up: 0.42,
  },
};

export function computeMorphTargetWeights(profile = {}) {
  const anat = resolveAnatomicalProfile(profile);
  const m = anat.morph;
  const weights = {};
  const clamp01 = (v, max = 1.05) => Math.max(0, Math.min(max, Number(v) || 0));
  const setBipolar = (upKey, downKey, delta, gainUp = 1.4, gainDown = 1.4, maxVal = 1.0) => {
    if (delta >= 0) {
      weights[upKey] = clamp01((weights[upKey] || 0) + delta * gainUp, maxVal);
    } else {
      weights[downKey] = clamp01((weights[downKey] || 0) + -delta * gainDown, maxVal);
    }
  };

  if (anat.gender === 'female') {
    weights.gender_female = 0.92;
    setBipolar('bust_up', 'bust_down', m.chestScale - 1.0, 1.8, 1.6, 0.95);
  } else if (anat.gender === 'male') {
    weights.gender_male = 0.90;
  }

  const preset = SHAPE_MACRO_PRESETS[anat.bodyShape] || SHAPE_MACRO_PRESETS.standard_balanced;
  for (const [k, v] of Object.entries(preset)) {
    weights[k] = clamp01(v, 1.0);
  }

  const refBmi = anat.gender === 'female' ? 20.5 : 22.0;
  const bmiDelta = (anat.bmi - refBmi) / 10.0;
  setBipolar('weight_up', 'weight_down', bmiDelta, 0.65, 0.65, 0.95);

  setBipolar('shoulder_up', 'shoulder_down', m.shoulderScale - 1.0, 1.35, 1.35, 0.85);
  setBipolar('chest_up', 'chest_down', m.chestScale - 1.0, 1.30, 1.30, 0.85);
  setBipolar('waist_up', 'waist_down', m.waistScale - 1.0, 1.35, 1.35, 0.85);
  setBipolar('belly_up', 'belly_down', m.bellyDepth - 1.0, 0.75, 0.65, 0.58);
  setBipolar('hips_up', 'hips_down', m.hipScale - 1.0, 1.40, 1.40, 0.85);
  setBipolar('thigh_up', 'thigh_down', m.thighScale - 1.0, 1.65, 1.65, 0.90);
  setBipolar('calf_up', 'calf_down', m.calfScale - 1.0, 1.55, 1.55, 0.85);
  setBipolar('arm_up', 'arm_down', m.armScale - 1.0, 1.55, 1.55, 0.85);
  setBipolar('head_up', 'head_down', m.headScale - 1.0, 1.25, 1.25, 0.75);

  return { anat, weights };
}

function cloneRuntimeGeometryWithoutMorphs(tplGeom) {
  const geom = new THREE.BufferGeometry();
  const basePos = tplGeom.attributes.position;
  if (basePos) {
    const count = basePos.count;
    const posArr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      posArr[i * 3] = basePos.getX(i);
      posArr[i * 3 + 1] = basePos.getY(i);
      posArr[i * 3 + 2] = basePos.getZ(i);
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  }
  for (const [attrName, attr] of Object.entries(tplGeom.attributes)) {
    if (attrName === 'position') continue;
    geom.setAttribute(attrName, attr.clone());
  }
  if (tplGeom.index) {
    geom.setIndex(tplGeom.index.clone());
  }
  geom.morphAttributes = {};
  geom.morphTargetsRelative = false;
  if (tplGeom.boundingBox) geom.boundingBox = tplGeom.boundingBox.clone();
  if (tplGeom.boundingSphere) geom.boundingSphere = tplGeom.boundingSphere.clone();
  return geom;
}

function applyMorphsToMesh(mesh, weights, extraCacheKey = '') {
  const tpl = mesh?.userData?.templateRef;
  if (tpl?.geometry) {
    const weightsKey = `${JSON.stringify(weights || {})}|${extraCacheKey}`;
    if (mesh.userData.bakedWeightsKey === weightsKey) return false;
    mesh.userData.bakedWeightsKey = weightsKey;

    const tplGeom = tpl.geometry;
    const basePos = tplGeom.attributes.position;
    const targetPos = mesh.geometry.attributes.position;
    if (!basePos || !targetPos) return false;

    const count = basePos.count;
    const dst = targetPos.array;
    for (let i = 0; i < count; i++) {
      dst[i * 3] = basePos.getX(i);
      dst[i * 3 + 1] = basePos.getY(i);
      dst[i * 3 + 2] = basePos.getZ(i);
    }

    const dict = tpl.morphTargetDictionary;
    const morphPosList = tplGeom.morphAttributes?.position;
    if (dict && morphPosList?.length) {
      const isRel = Boolean(tplGeom.morphTargetsRelative);
      for (const [name, rawVal] of Object.entries(weights || {})) {
        const w = Number(rawVal) || 0;
        if (Math.abs(w) < 0.001) continue;
        const idx = dict[name];
        const mAttr = idx !== undefined ? morphPosList[idx] : null;
        if (!mAttr) continue;
        if (isRel) {
          for (let i = 0; i < count; i++) {
            const o = i * 3;
            dst[o] += mAttr.getX(i) * w;
            dst[o + 1] += mAttr.getY(i) * w;
            dst[o + 2] += mAttr.getZ(i) * w;
          }
        } else {
          for (let i = 0; i < count; i++) {
            const o = i * 3;
            dst[o] += (mAttr.getX(i) - dst[o]) * w;
            dst[o + 1] += (mAttr.getY(i) - dst[o + 1]) * w;
            dst[o + 2] += (mAttr.getZ(i) - dst[o + 2]) * w;
          }
        }
      }
    }
    targetPos.needsUpdate = true;
    return true;
  }

  const dict = mesh.morphTargetDictionary;
  const inf = mesh.morphTargetInfluences;
  if (!dict || !inf) return false;
  for (let i = 0; i < inf.length; i++) inf[i] = 0;
  for (const [name, val] of Object.entries(weights)) {
    const idx = dict[name];
    if (idx !== undefined) {
      inf[idx] = val;
    }
  }
  return true;
}

/**
 * Dynamically conforms body-mounted leather accessories (`accessory_bag`, `accessory_belt`)
 * to the outermost equipped torso/hip garment layer (`outer_coat`, `outer_blazer`, `outer_jacket`,
 * `top_*`, `dress_*`, `bottom_*`) so straps never bury inside winter coats and pouches never float.
 */
function conformAccessoryToGarmentLayers(accMesh, gid, bodyMesh, shellMeshes = []) {
  if (!accMesh?.geometry?.attributes?.position || !bodyMesh?.geometry?.attributes?.position) return;
  if (!shellMeshes.length) return;

  const accPos = accMesh.geometry.attributes.position;
  const accArr = accPos.array;
  const accCount = accPos.count;
  const bodyPos = bodyMesh.geometry.attributes.position;

  if (gid === 'accessory_belt') {
    let maxBodyR = 0;
    for (let i = 0; i < bodyPos.count; i++) {
      const bx = bodyPos.getX(i);
      const by = bodyPos.getY(i);
      const bz = bodyPos.getZ(i);
      if (by >= 0.96 && by <= 1.03 && Math.abs(bx) < 0.21 && bz < 0.165) {
        const r = Math.hypot(bx, bz);
        if (r > maxBodyR) maxBodyR = r;
      }
    }
    let maxShellR = maxBodyR;
    for (const sm of shellMeshes) {
      const sp = sm.geometry?.attributes?.position;
      if (!sp) continue;
      for (let i = 0; i < sp.count; i++) {
        const sx = sp.getX(i);
        const sy = sp.getY(i);
        const sz = sp.getZ(i);
        if (sy >= 0.96 && sy <= 1.03 && Math.abs(sx) < 0.22 && sz < 0.195) {
          const r = Math.hypot(sx, sz);
          if (r > maxShellR) maxShellR = r;
        }
      }
    }
    const extraR = Math.max(0, Math.min(0.042, maxShellR - maxBodyR));
    if (extraR > 0.001) {
      for (let i = 0; i < accCount; i++) {
        const o = i * 3;
        const x = accArr[o];
        const z = accArr[o + 2];
        const r = Math.hypot(x, z);
        if (r > 1e-4) {
          const scale = (r + extraR) / r;
          accArr[o] = x * scale;
          accArr[o + 2] = z * scale;
        }
      }
      accPos.needsUpdate = true;
    }
    return;
  }

  if (gid !== 'accessory_bag') return;

  // 1. Measure left-hip lateral garment contact surface strictly at the saddle bag's mid-hip patch
  let bagInnerMinX = Infinity;
  for (let i = 0; i < accCount; i++) {
    const x = accArr[i * 3];
    const y = accArr[i * 3 + 1];
    if (y >= 0.78 && y <= 0.87 && x > 0.13 && x < bagInnerMinX) {
      bagInnerMinX = x;
    }
  }
  let maxHipShellX = 0;
  for (const sm of shellMeshes) {
    const sp = sm.geometry?.attributes?.position;
    if (!sp) continue;
    for (let i = 0; i < sp.count; i++) {
      const sx = sp.getX(i);
      const sy = sp.getY(i);
      const sz = sp.getZ(i);
      if (sy >= 0.78 && sy <= 0.88 && sx > 0.05 && sx < 0.22 && sz >= -0.055 && sz <= 0.045) {
        if (sx > maxHipShellX) maxHipShellX = sx;
      }
    }
  }
  const pouchShiftX =
    bagInnerMinX < Infinity && maxHipShellX > 0
      ? Math.max(-0.008, Math.min(0.036, maxHipShellX - 0.003 - bagInnerMinX))
      : 0;

  // 2. Measure smooth 8-band front/back torso garment thickness along diagonal strap corridor
  const BANDS = 8;
  const yMin = 0.90;
  const yMax = 1.36;
  const bandSpan = (yMax - yMin) / BANDS;
  const bodyFrontZ = new Float32Array(BANDS);
  const bodyBackZ = new Float32Array(BANDS);
  const shellFrontZ = new Float32Array(BANDS);
  const shellBackZ = new Float32Array(BANDS);

  const strapCenterXAtY = (y) => {
    const u = Math.max(0, Math.min(1, (y - 0.91) / 0.44));
    return 0.168 * (1 - u) + -0.128 * u;
  };

  let bodyShoulderMaxY = 1.351;
  for (let i = 0; i < bodyPos.count; i++) {
    const bx = bodyPos.getX(i);
    const by = bodyPos.getY(i);
    const bz = bodyPos.getZ(i);
    if (bx > -0.145 && bx < -0.108 && by > 1.25 && by < 1.41) {
      if (by > bodyShoulderMaxY) bodyShoulderMaxY = by;
    }
    if (by < yMin || by >= yMax) continue;
    const xLim = by < 1.16 ? 0.195 : 0.175;
    if (Math.abs(bx) > xLim || bz > 0.165) continue;
    if (Math.abs(bx - strapCenterXAtY(by)) > 0.056) continue;
    const b = Math.min(BANDS - 1, Math.floor((by - yMin) / bandSpan));
    if (bz > bodyFrontZ[b]) bodyFrontZ[b] = bz;
    if (-bz > bodyBackZ[b]) bodyBackZ[b] = -bz;
  }

  for (let b = 0; b < BANDS; b++) {
    shellFrontZ[b] = bodyFrontZ[b];
    shellBackZ[b] = bodyBackZ[b];
  }

  let shellShoulderMaxY = bodyShoulderMaxY;
  for (const sm of shellMeshes) {
    const sp = sm.geometry?.attributes?.position;
    if (!sp) continue;
    for (let i = 0; i < sp.count; i++) {
      const sx = sp.getX(i);
      const sy = sp.getY(i);
      const sz = sp.getZ(i);
      if (sx > -0.148 && sx < -0.106 && sy > 1.25 && sy < 1.42) {
        if (sy > shellShoulderMaxY) shellShoulderMaxY = sy;
      }
      if (sy < yMin || sy >= yMax) continue;
      const xLim = sy < 1.18 ? 0.215 : 0.205;
      if (Math.abs(sx) > xLim || Math.abs(sz) > 0.215) continue;
      if (Math.abs(sx - strapCenterXAtY(sy)) > 0.060) continue;
      const b = Math.min(BANDS - 1, Math.floor((sy - yMin) / bandSpan));
      if (sz > shellFrontZ[b]) shellFrontZ[b] = sz;
      if (-sz > shellBackZ[b]) shellBackZ[b] = -sz;
    }
  }

  const rawFrontDelta = new Float32Array(BANDS);
  const rawBackDelta = new Float32Array(BANDS);
  for (let b = 0; b < BANDS; b++) {
    rawFrontDelta[b] = Math.max(0, Math.min(0.052, shellFrontZ[b] - bodyFrontZ[b] - 0.002));
    rawBackDelta[b] = Math.max(0, Math.min(0.054, shellBackZ[b] - bodyBackZ[b] - 0.002));
  }
  const frontDelta = new Float32Array(BANDS);
  const backDelta = new Float32Array(BANDS);
  for (let b = 0; b < BANDS; b++) {
    const b0 = Math.max(0, b - 1);
    const b2 = Math.min(BANDS - 1, b + 1);
    frontDelta[b] = 0.25 * rawFrontDelta[b0] + 0.5 * rawFrontDelta[b] + 0.25 * rawFrontDelta[b2];
    backDelta[b] = 0.25 * rawBackDelta[b0] + 0.5 * rawBackDelta[b] + 0.25 * rawBackDelta[b2];
  }
  const shoulderDeltaY = Math.max(0, Math.min(0.024, shellShoulderMaxY - bodyShoulderMaxY + 0.002));

  const sampleBand = (arr, y) => {
    const f = Math.max(0, Math.min(BANDS - 1, (y - yMin) / bandSpan - 0.5));
    const i0 = Math.floor(f);
    const i1 = Math.min(BANDS - 1, i0 + 1);
    const t = f - i0;
    return arr[i0] * (1 - t) + arr[i1] * t;
  };

  for (let i = 0; i < accCount; i++) {
    const o = i * 3;
    const bx = accArr[o];
    const by = accArr[o + 1];
    const bz = accArr[o + 2];

    const isPouch = by <= 0.919 && bx > 0.130;
    if (isPouch) {
      accArr[o] = bx + pouchShiftX;
      continue;
    }

    const dRingWeld = smoothstep(0.99, 0.919, by) * smoothstep(0.07, 0.145, bx);
    const shBlend = smoothstep(1.25, 1.33, by) * smoothstep(-0.05, -0.11, bx);
    const sideHipBlend = smoothstep(1.08, 0.919, by) * smoothstep(0.01, 0.14, bx);
    const axialTorsoMask = smoothstep(0.975, 1.085, by) * (1.0 - dRingWeld);
    const frontMask = smoothstep(0.005, 0.042, bz) * axialTorsoMask;
    const backMask = smoothstep(0.005, 0.042, -bz) * axialTorsoMask;

    accArr[o] = bx + pouchShiftX * Math.max(dRingWeld, sideHipBlend * 0.92);
    accArr[o + 1] = by + shoulderDeltaY * shBlend;
    accArr[o + 2] = bz + sampleBand(frontDelta, by) * frontMask - sampleBand(backDelta, by) * backMask;
  }
  accPos.needsUpdate = true;
}


const VALID_MANIFEST_GARMENT_IDS = new Set([
  'headwear_beanie',
  'headwear_cap',
  'headwear_beret',
  'headwear_fedora',
  'neckwear_scarf',
  'neckwear_tie',
  'outer_blazer',
  'outer_coat',
  'outer_jacket',
  'top_knit',
  'top_shirt',
  'top_tshirt',
  'top_sweatshirt',
  'top_cardigan',
  'bottom_slacks',
  'bottom_denim',
  'bottom_skirt',
  'bottom_shorts',
  'dress_shift',
  'dress_onepiece',
  'gloves_short',
  'underwear_top',
  'underwear_briefs',
  'socks_crew',
  'socks_ankle',
  'shoes_sneakers',
  'shoes_loafers',
  'shoes_boots',
  'shoes_heels',
  'accessory_bag',
  'accessory_briefcase',
  'accessory_tote',
  'accessory_belt',
  'accessory_watch',
  'accessory_glasses',
]);

export function resolveGarmentIdForItem(slotKey, item) {
  if (!item) return null;
  const explicitGlb = String(item.base_glb || '').trim();
  const isKnownManifestGlb = manifestData?.garments
    ? Boolean(manifestData.garments[explicitGlb])
    : VALID_MANIFEST_GARMENT_IDS.has(explicitGlb);
  if (
    explicitGlb &&
    isKnownManifestGlb &&
    (explicitGlb.startsWith(`${slotKey}_`) || manifestData?.garments?.[explicitGlb]?.slot === slotKey)
  ) {
    return explicitGlb;
  }
  const sub = String(item.subcategory || '').toLowerCase().trim();
  const name = String(item.name || '');

  if (slotKey === 'headwear') {
    if (sub === 'cap' || name.includes('캡')) return 'headwear_cap';
    if (sub === 'beret' || name.includes('베레')) return 'headwear_beret';
    if (sub === 'bucket_hat' || name.includes('버킷') || name.includes('페도라')) return 'headwear_fedora';
    return 'headwear_beanie';
  }
  if (slotKey === 'neckwear') {
    if (sub === 'necktie' || name.includes('타이')) return 'neckwear_tie';
    return 'neckwear_scarf';
  }
  if (slotKey === 'outer') {
    if (sub === 'coat' || sub === 'trench' || name.includes('코트') || name.includes('트렌치')) return 'outer_coat';
    if (sub === 'jacket' || sub === 'padding' || name.includes('패딩') || name.includes('자켓') || name.includes('점퍼')) return 'outer_jacket';
    return 'outer_blazer';
  }
  if (slotKey === 'top') {
    if (sub === 'shirt' || sub === 'blouse' || name.includes('셔츠') || name.includes('블라우스')) return 'top_shirt';
    if (sub === 'tshirt' || name.includes('티셔츠')) return 'top_tshirt';
    if (sub === 'sweatshirt' || sub === 'hoodie' || name.includes('맨투맨') || name.includes('후드') || name.includes('스웨트')) return 'top_sweatshirt';
    if (sub === 'cardigan' || name.includes('가디건') || name.includes('폴로')) return 'top_cardigan';
    return 'top_knit';
  }
  if (slotKey === 'bottom') {
    if (sub === 'skirt' || name.includes('스커트')) return 'bottom_skirt';
    if (sub === 'shorts' || name.includes('쇼츠') || name.includes('하프')) return 'bottom_shorts';
    if (sub === 'denim' || sub === 'chinos' || sub === 'jogger' || name.includes('데님') || name.includes('치노')) return 'bottom_denim';
    return 'bottom_slacks';
  }
  if (slotKey === 'dress') {
    if (sub === 'onepiece' || name.includes('롱') || name.includes('니트')) return 'dress_onepiece';
    return 'dress_shift';
  }
  if (slotKey === 'gloves') return 'gloves_short';
  if (slotKey === 'underwear') {
    if (sub === 'underwear' || name.includes('브리프') || name.includes('언더웨어')) return 'underwear_briefs';
    return 'underwear_top';
  }
  if (slotKey === 'socks') {
    if (sub === 'socks' || name.includes('앵클')) return 'socks_ankle';
    return 'socks_crew';
  }
  if (slotKey === 'shoes') {
    if (sub === 'loafers' || name.includes('로퍼') || name.includes('구두')) return 'shoes_loafers';
    if (sub === 'boots' || name.includes('부츠')) return 'shoes_boots';
    if (sub === 'heels' || name.includes('힐') || name.includes('펌프스')) return 'shoes_heels';
    return 'shoes_sneakers';
  }
  if (slotKey === 'accessory') {
    if (sub === 'briefcase' || name.includes('서류가방') || name.includes('브리프케이스') || name.includes('포트폴리오')) {
      return 'accessory_briefcase';
    }
    if (sub === 'tote' || name.includes('토트') || name.includes('쇼퍼')) {
      return 'accessory_tote';
    }
    if (sub === 'belt' || name.includes('벨트')) return 'accessory_belt';
    if (sub === 'watch' || name.includes('시계') || name.includes('워치')) return 'accessory_watch';
    if (sub === 'glasses' || name.includes('안경') || name.includes('아이웨어') || name.includes('선글라스')) return 'accessory_glasses';
    return 'accessory_bag';
  }
  return null;
}

function createSkinMaterial(skinHex, isSoftware = false) {
  const baseColor = new THREE.Color(skinHex);
  if (isSoftware) {
    const mat = new THREE.MeshLambertMaterial({ color: baseColor });
    mat.userData.refTextureEntries = [];
    return mat;
  }
  const skinBumpEntry = acquireFabricBumpMap('skin');
  const mat = new THREE.MeshPhysicalMaterial({
    color: baseColor,
    roughness: 0.40,
    metalness: 0.01,
    clearcoat: 0.14,
    clearcoatRoughness: 0.42,
    sheen: 0.48,
    sheenRoughness: 0.56,
    sheenColor: baseColor.clone().lerp(new THREE.Color('#fff2ec'), 0.44),
    bumpMap: skinBumpEntry?.tex || null,
    bumpScale: 0.0018,
  });
  mat.userData.refTextureEntries = skinBumpEntry ? [skinBumpEntry] : [];
  return mat;
}

/**
 * Requirement 6.c: Hybrid 3D Texture + PBR Synthesis
 * Composites cropped WebP cutout photo over base garment UV carrier while preserving
 * fabric PBR normalMap, bumpMap, roughness & metalness — cached in `externalTexCache`
 * with ref-counted disposal and immediate scratch `<canvas>` release.
 */
function attachDynamicCroppedGarmentTexture(primaryMat, item, baseHex) {
  if (typeof document === 'undefined' || !item) return;
  const imgUrl = String(item.image_url || '');
  const isCustomCutout =
    Boolean(item.custom_texture) ||
    imgUrl.startsWith('/uploads/') ||
    imgUrl.startsWith('data:image/');
  if (!isCustomCutout) return;

  const fillHex = baseHex || '#2E3540';
  const cacheKey = `cutout:${imgUrl}|${fillHex}`;
  primaryMat.userData.refTextureEntries = primaryMat.userData.refTextureEntries || [];

  let entry = externalTexCache.get(cacheKey);
  if (entry) {
    entry.refCount += 1;
    primaryMat.userData.refTextureEntries.push(entry);
    if (entry.ready && entry.tex) {
      primaryMat.map = entry.tex;
      primaryMat.color.set('#ffffff');
      primaryMat.needsUpdate = true;
    } else if (Array.isArray(entry.waiters)) {
      entry.waiters.push((tex) => {
        if (!primaryMat.userData.isDisposed && tex) {
          primaryMat.map = tex;
          primaryMat.color.set('#ffffff');
          primaryMat.needsUpdate = true;
        }
      });
    }
    return;
  }

  entry = {
    tex: null,
    refCount: 1,
    ready: false,
    waiters: [],
    cacheKey,
    mapRef: externalTexCache,
  };
  externalTexCache.set(cacheKey, entry);
  primaryMat.userData.refTextureEntries.push(entry);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (entry.refCount <= 0) {
      externalTexCache.delete(cacheKey);
      return;
    }
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    let pixelBytes;
    try {
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = fillHex;
      ctx.fillRect(0, 0, size, size);

      // Draw cutout texture softly blended into UV torso/limb islands
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.drawImage(img, size * 0.12, size * 0.10, size * 0.76, size * 0.80);
      ctx.restore();
      pixelBytes = new Uint8Array(ctx.getImageData(0, 0, size, size).data);
    } finally {
      c.width = 0;
      c.height = 0;
    }

    const dynTex = new THREE.DataTexture(pixelBytes, size, size, THREE.RGBAFormat);
    dynTex.flipY = false;
    dynTex.colorSpace = THREE.SRGBColorSpace;
    dynTex.minFilter = THREE.LinearFilter;
    dynTex.magFilter = THREE.LinearFilter;
    dynTex.generateMipmaps = false;
    dynTex.needsUpdate = true;

    if (entry.refCount <= 0) {
      dynTex.dispose();
      externalTexCache.delete(cacheKey);
      return;
    }

    entry.tex = dynTex;
    entry.ready = true;

    if (!primaryMat.userData.isDisposed) {
      primaryMat.map = dynTex;
      primaryMat.color.set('#ffffff');
      primaryMat.needsUpdate = true;
    }
    const waiters = entry.waiters || [];
    entry.waiters = [];
    for (const fn of waiters) {
      try {
        fn(dynTex);
      } catch {
        // Ignore waiter errors
      }
    }
    notifyPreviewListeners();
  };
  img.onerror = () => {
    entry.waiters = [];
    if (entry.refCount <= 0) {
      externalTexCache.delete(cacheKey);
    }
  };
  img.src = imgUrl;
}

function createGarmentMaterial(
  item,
  gid,
  slotKey,
  isHighlighted,
  hasMultiZones = false,
  isSoftware = false
) {
  const hex = item?.color_hex || '#2E3540';
  const spec = inferFabricMaterialSpec(item || { category: slotKey });
  const refEntries = [];
  const bumpEntry = isSoftware ? null : acquireFabricBumpMap(spec.type);
  if (bumpEntry) refEntries.push(bumpEntry);

  const baseColor = new THREE.Color(hex);
  const emissiveColor = isHighlighted
    ? baseColor.clone().lerp(new THREE.Color('#ffffff'), 0.45)
    : new THREE.Color('#000000');

  const uvTex = GARMENT_UV_TEXTURE_MAP[gid];

  if (isSoftware) {
    const lambertProps = {
      color: baseColor,
      emissive: emissiveColor,
      emissiveIntensity: isHighlighted ? 0.18 : 0.0,
      side: THREE.DoubleSide,
    };
    if (uvTex?.detail) {
      const detailEntry = acquireCachedTexture(`${TEXTURE_BASE}/${uvTex.detail}`, {
        srgb: true,
        repeat: 1,
      });
      lambertProps.map = detailEntry.tex;
      refEntries.push(detailEntry);
    }
    const primaryMat = new THREE.MeshLambertMaterial(lambertProps);
    primaryMat.userData.refTextureEntries = refEntries;
    attachDynamicCroppedGarmentTexture(primaryMat, item, hex);
    if (!hasMultiZones) return primaryMat;

    const metalMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color('#dde2e8'),
      emissive: emissiveColor,
      emissiveIntensity: isHighlighted ? 0.14 : 0.0,
      side: THREE.DoubleSide,
    });
    const dialMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color('#f7f3ea'),
      side: THREE.DoubleSide,
    });
    const glassMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color('#dce8f2'),
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
    });
    return [primaryMat, metalMat, dialMat, glassMat];
  }

  const matProps = {
    color: baseColor,
    roughness: spec.roughness,
    metalness: spec.metalness,
    sheen: spec.sheen,
    sheenRoughness: 0.52,
    sheenColor: baseColor.clone().offsetHSL(0, 0, 0.14),
    clearcoat: spec.clearcoat,
    clearcoatRoughness: 0.34,
    bumpMap: bumpEntry?.tex || null,
    bumpScale: spec.bumpScale,
    emissive: emissiveColor,
    emissiveIntensity: isHighlighted ? 0.18 : 0.0,
    side: THREE.DoubleSide,
  };

  if (uvTex?.detail) {
    const detailEntry = acquireCachedTexture(`${TEXTURE_BASE}/${uvTex.detail}`, {
      srgb: true,
      repeat: 1,
    });
    matProps.map = detailEntry.tex;
    refEntries.push(detailEntry);
  }
  if (uvTex?.normal) {
    const normalEntry = acquireCachedTexture(`${TEXTURE_BASE}/${uvTex.normal}`, { repeat: 1 });
    matProps.normalMap = normalEntry.tex;
    refEntries.push(normalEntry);
    const ns = uvTex.normalScale || 0.5;
    matProps.normalScale = new THREE.Vector2(ns, ns);
  }

  const primaryMat = new THREE.MeshPhysicalMaterial(matProps);
  primaryMat.userData.refTextureEntries = refEntries;
  attachDynamicCroppedGarmentTexture(primaryMat, item, hex);

  if (!hasMultiZones) {
    return primaryMat;
  }

  // Zone 1: Gleaming brushed palladium / silver hardware (clasps, buckles, D-rings, watch bezel)
  const metalMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#dde2e8'),
    metalness: 0.92,
    roughness: 0.19,
    clearcoat: 0.65,
    clearcoatRoughness: 0.18,
    emissive: emissiveColor,
    emissiveIntensity: isHighlighted ? 0.14 : 0.0,
    side: THREE.DoubleSide,
  });

  // Zone 2: Crisp champagne-ivory watch dial face
  const dialMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f7f3ea'),
    metalness: 0.06,
    roughness: 0.20,
    clearcoat: 0.88,
    clearcoatRoughness: 0.12,
    side: THREE.DoubleSide,
  });

  // Zone 3: Anti-reflective translucent optical glass lens
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#dce8f2'),
    transparent: true,
    opacity: 0.30,
    metalness: 0.08,
    roughness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    side: THREE.DoubleSide,
  });

  return [primaryMat, metalMat, dialMat, glassMat];
}

function disposeSingleMaterial(m) {
  if (!m) return;
  m.userData = m.userData || {};
  if (m.userData.isDisposed) return;
  m.userData.isDisposed = true;
  if (Array.isArray(m.userData.ownedTextures)) {
    for (const tex of m.userData.ownedTextures) {
      tex?.dispose?.();
    }
    m.userData.ownedTextures = [];
  }
  if (Array.isArray(m.userData.refTextureEntries)) {
    for (const entry of m.userData.refTextureEntries) {
      releaseTextureEntry(entry);
    }
    m.userData.refTextureEntries = [];
  }
  m.dispose?.();
}

function disposeMaterialOrArray(mat) {
  if (!mat) return;
  if (Array.isArray(mat)) {
    for (const m of mat) disposeSingleMaterial(m);
  } else {
    disposeSingleMaterial(mat);
  }
}

/**
 * Builds the 3D Classic Rain Umbrella prop (`prop_umbrella`) + subtle rain streaks
 * anchored at the curved walnut handle grip `(0,0,0)` for weather-reactive motion.
 */
function buildClassicUmbrellaGroup() {
  const group = new THREE.Group();
  group.visible = false;

  const woodMat = new THREE.MeshPhysicalMaterial({
    color: 0x5c3824,
    roughness: 0.34,
    metalness: 0.04,
    clearcoat: 0.55,
  });
  const metalMat = new THREE.MeshPhysicalMaterial({
    color: 0xd8dde4,
    roughness: 0.20,
    metalness: 0.90,
  });
  const canopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e2530,
    roughness: 0.42,
    metalness: 0.06,
    sheen: 0.45,
    sheenColor: new THREE.Color(0x4b5b72),
    clearcoat: 0.32,
    side: THREE.DoubleSide,
  });

  // Straight walnut grip + curved J-hook
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.11, 14), woodMat);
  grip.position.y = -0.02;
  group.add(grip);

  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.0105, 12, 20, Math.PI), woodMat);
  hook.rotation.z = Math.PI;
  hook.position.set(0.028, -0.075, 0);
  group.add(hook);

  // Chrome shaft + top ferrule
  const shaftLen = 0.78;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0052, 0.0058, shaftLen, 12), metalMat);
  shaft.position.y = 0.035 + shaftLen * 0.5;
  group.add(shaft);

  const ferrule = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.055, 12), metalMat);
  ferrule.position.y = 0.035 + shaftLen + 0.025;
  group.add(ferrule);

  // 8-panel domed waterproof canopy
  const canopyRadius = 0.55;
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(canopyRadius, 8, 10, 0, Math.PI * 2, 0, Math.PI * 0.36),
    canopyMat
  );
  canopy.scale.set(1.0, 0.62, 1.0);
  canopy.position.y = 0.035 + shaftLen - canopyRadius * 0.62 + 0.01;
  canopy.castShadow = true;
  group.add(canopy);

  // 8 fine metallic stretcher ribs under canopy
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, canopyRadius * 0.88, 6), metalMat);
    rib.position.set(
      Math.cos(ang) * canopyRadius * 0.42,
      0.035 + shaftLen - 0.11,
      Math.sin(ang) * canopyRadius * 0.42
    );
    rib.rotation.z = -Math.cos(ang) * 1.28;
    rib.rotation.x = Math.sin(ang) * 1.28;
    group.add(rib);
  }

  return group;
}

function buildRainStreaksGroup() {
  const group = new THREE.Group();
  group.visible = false;
  const count = 46;
  const positions = new Float32Array(count * 6);
  const seeds = [];
  for (let i = 0; i < count; i++) {
    const r = 0.52 + Math.random() * 0.62;
    const th = Math.random() * Math.PI * 2;
    const x = Math.cos(th) * r;
    const z = Math.sin(th) * r;
    const y = Math.random() * 2.2;
    seeds.push({ x, y, z, speed: 1.8 + Math.random() * 0.9 });
    positions[i * 6] = x;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x - 0.01;
    positions[i * 6 + 4] = y - 0.09;
    positions[i * 6 + 5] = z;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0x9ab4cc,
    transparent: true,
    opacity: 0.36,
  });
  const lines = new THREE.LineSegments(geom, mat);
  group.add(lines);
  group.userData.seeds = seeds;
  group.userData.lines = lines;
  return group;
}

function buildWindStreaksGroup() {
  const group = new THREE.Group();
  group.visible = false;
  const count = 26;
  const segPts = 4; // 3 connected segments per curved breeze streamline = 6 vertices per streamline
  const vertsPerRibbon = (segPts - 1) * 2;
  const positions = new Float32Array(count * vertsPerRibbon * 3);
  const seeds = [];
  for (let i = 0; i < count; i++) {
    const x = -1.15 + Math.random() * 2.3;
    const y = 0.24 + Math.random() * 1.56;
    const z = (Math.random() - 0.5) * 0.95;
    const len = 0.20 + Math.random() * 0.16;
    const speed = 2.0 + Math.random() * 1.15;
    const phase = Math.random() * Math.PI * 2;
    seeds.push({ x, y, z, len, speed, phase });
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0x8e8e93,
    transparent: true,
    opacity: 0.24,
  });
  const lines = new THREE.LineSegments(geom, mat);
  group.add(lines);
  group.userData.seeds = seeds;
  group.userData.lines = lines;
  group.userData.mat = mat;
  return group;
}

function inferBodySlotFromPoint(localY, localX) {
  if (localY > 1.50) return 'headwear';
  if (localY > 1.36) return 'neckwear';
  if (Math.abs(localX) > 0.25 && localY > 0.85 && localY < 1.20) return 'gloves';
  if (localY > 0.94) return 'top';
  if (localY > 0.42) return 'bottom';
  if (localY > 0.14) return 'socks';
  return 'shoes';
}

let cachedIsSoftwareWebGL = null;
function detectSoftwareWebGL() {
  if (cachedIsSoftwareWebGL !== null) return cachedIsSoftwareWebGL;
  if (typeof document === 'undefined') return false;
  let probe = null;
  let gl = null;
  try {
    probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) {
      cachedIsSoftwareWebGL = true;
      return true;
    }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = String(
      (dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) ||
        gl.getParameter(gl.RENDERER) ||
        ''
    );
    cachedIsSoftwareWebGL = /swiftshader|llvmpipe|software|basic render/i.test(rendererStr);
    return cachedIsSoftwareWebGL;
  } catch {
    cachedIsSoftwareWebGL = false;
    return false;
  } finally {
    try {
      gl?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
    } catch {
      // ignore context release errors
    }
    if (probe) {
      probe.width = 0;
      probe.height = 0;
    }
  }
}

/**
 * Game-Quality Skinned GLB Mannequin WebGL Engine
 * - 26-Bone Multi-Chain GPU Skeleton (`idle`, `walk`, `wind`, `wave`, `umbrella`, `pose_hands`)
 * - 28 Real-Time Anthropometric Morph Targets
 * - Lightweight Multi-Chain `SpringBoneSystem` (2-link muffler/tie flutter, 2-link coat/skirt wave + radial billow, coupled crossbody strap + D-ring hip bounce, 3-DOF handheld bags)
 * - Dynamic Hybrid Cropped WebP + Fabric PBR Normal/Roughness Synthesis
 * - Strict GPU Geometry/Material/Texture Disposal & `webglcontextlost` Auto-Recovery
 */
export class Mannequin3DWebGLEngine {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.onContextStatusChange = options.onContextStatusChange || null;
    this.isPreviewOnly = Boolean(options.previewOnly);
    this.isSoftwareRenderer = detectSoftwareWebGL();
    this._paused = Boolean(options.paused);
    this._contextRestoreTimer = null;
    this._customRestoreDelayMs = null;
    this.equippedDbGarmentIds = [];
    this._envRenderTarget = null;
    this.envMap = null;
    this.rafId = 0;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !this.isSoftwareRenderer,
      alpha: this.isPreviewOnly,
      stencil: false,
      preserveDrawingBuffer: this.isPreviewOnly || this.isSoftwareRenderer,
      powerPreference: 'high-performance',
    });
    if (!this.isPreviewOnly) {
      this.renderer.setClearColor(0xffffff, 1);
    }
    this.renderer.setPixelRatio(
      this.isSoftwareRenderer
        ? 1
        : Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, isMobile ? 1.5 : 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareRenderer;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = this.isSoftwareRenderer
      ? THREE.NoToneMapping
      : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.scene = new THREE.Scene();
    this._rebuildEnvironmentMap();

    // Cache WEBGL_lose_context extension handle prior to any context loss for deterministic recovery
    try {
      this._loseContextExt = this.renderer.getContext()?.getExtension?.('WEBGL_lose_context') || null;
    } catch {
      this._loseContextExt = null;
    }

    this.isContextLost = false;
    this.recoveryCount = 0;

    this._handleContextLost = (e) => {
      e.preventDefault();
      this.isContextLost = true;
      this.onContextStatusChange?.({ lost: true, recoveryCount: this.recoveryCount });
      if (this._contextRestoreTimer) {
        clearTimeout(this._contextRestoreTimer);
        this._contextRestoreTimer = null;
      }
      const delayMs = this._customRestoreDelayMs ?? 150;
      this._customRestoreDelayMs = null;
      // Auto-recover synthetic WEBGL_lose_context invocations as well as OS GPU resets
      if (this._loseContextExt) {
        this._contextRestoreTimer = setTimeout(() => {
          this._contextRestoreTimer = null;
          if (this.isContextLost && !this.disposed) {
            try {
              this._loseContextExt.restoreContext();
            } catch {
              // Already restored by caller or browser
            }
          }
        }, delayMs);
      }
    };

    this._handleContextRestored = () => {
      if (this.disposed) return;
      this.isContextLost = false;
      this.recoveryCount += 1;
      this._sceneDirty = true;
      this._rebuildEnvironmentMap();
      this.updateScene(this.lastState);
      this.onContextStatusChange?.({
        lost: false,
        recovered: true,
        recoveryCount: this.recoveryCount,
      });
    };

    this._handleVisibilityChange = () => {
      if (this.disposed) return;
      this._syncLoopRunState();
    };

    this.canvas.addEventListener('webglcontextlost', this._handleContextLost, false);
    this.canvas.addEventListener('webglcontextrestored', this._handleContextRestored, false);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._handleVisibilityChange, false);
    }

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 30);
    this.camera.position.set(0, 1.00, 3.62);

    this.rootGroup = new THREE.Group();
    this.characterGroup = new THREE.Group();
    this.pedestalGroup = new THREE.Group();
    this.rootGroup.add(this.pedestalGroup);
    this.rootGroup.add(this.characterGroup);
    this.scene.add(this.rootGroup);

    // Build shared 26-bone humanoid + multi-chain jiggle skeleton + handheld prop sockets
    const rig = createHumanoidSkeleton(DEFAULT_JOINTS);
    this.skeleton = rig.skeleton;
    this.bones = rig.bones;
    this.characterGroup.add(rig.rootBone);

    // Anatomical palm/finger grip anchors parented directly to wrist bones so
    // handheld props (briefcase, tote, umbrella) track true palm center across every pose
    this.leftPalmGripAnchor = new THREE.Object3D();
    this.leftPalmGripAnchor.position.set(0.036, -0.074, 0.070);
    this.bones[BONE.HAND_L].add(this.leftPalmGripAnchor);

    this.rightPalmGripAnchor = new THREE.Object3D();
    this.rightPalmGripAnchor.position.set(-0.036, -0.068, 0.070);
    this.bones[BONE.HAND_R].add(this.rightPalmGripAnchor);

    this.leftHandSocket = new THREE.Group();
    this.characterGroup.add(this.leftHandSocket);

    this.rightHandSocket = new THREE.Group();
    this.characterGroup.add(this.rightHandSocket);

    this.umbrellaProp = buildClassicUmbrellaGroup();
    this.rightHandSocket.add(this.umbrellaProp);

    this.rainStreaks = buildRainStreaksGroup();
    this.rootGroup.add(this.rainStreaks);

    this.windStreaks = buildWindStreaksGroup();
    this.rootGroup.add(this.windStreaks);

    this.raycaster = new THREE.Raycaster();
    this.interactiveMeshes = [];

    this.bodyMesh = null;
    this.garmentMeshes = new Map();
    this.lastState = {};
    this.updateSeq = 0;

    this.targetYaw = 0;
    this.currentYaw = 0;
    this.prevYaw = 0;
    this.parallaxX = 0;
    this.parallaxY = 0;
    this.focusSlot = 'all';
    this.activeAccessorySub = '';
    this.camTargetX = 0.0;
    this.camTargetY = 0.96;
    this.camDist = 3.62;
    this.scanProgress = 1.0;

    // Motion & lightweight SpringBone physics state (Req 6.d)
    this.motionMode = 'auto';
    this.weatherInfo = null;
    this.clockStart = performance.now() * 0.001;
    this.lastFrameTime = this.clockStart;
    this.lastRawNowMs = performance.now();
    this.poseBlend = { walk: 0, wind: 0, wave: 0, umbrella: 0, hands: 0 };

    this.springBones = new SpringBoneSystem();
    this.lastSprings = null;
    this.bagSpringState = {
      prevHandPos: new THREE.Vector3(0.45, 0.98, 0.18),
      prevHandVel: new THREE.Vector3(),
    };

    // FPS telemetry & Vibrancy auto-fallback ring buffer (Req 14.b & 15.b)
    this.frameCount = 0;
    this._frameMsSamples = [];
    this.avgFps = 60;
    this._vibrancyDegraded = false;
    this._simulatedLowFps = false;
    this._sceneDirty = true;
    this._lastSoftwareRenderMs = 0;

    this._tmpVecA = new THREE.Vector3();
    this._tmpVecB = new THREE.Vector3();
    this._invCharMat = new THREE.Matrix4();

    activeEngineInstances.add(this);

    this._setupLightsAndPedestal();
    if (typeof document !== 'undefined') {
      this.setDarkTheme(document.documentElement.dataset.theme === 'dark');
      if (
        !this.isPreviewOnly &&
        document.documentElement.getAttribute('data-vibrancy-fallback') !== 'solid'
      ) {
        document.documentElement.setAttribute('data-vibrancy-fallback', 'blur');
      }
    }

    const syncCanvasSize = () => {
      if (this.disposed || !this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      const w = rect.width || this.canvas.clientWidth || 360;
      const h = rect.height || this.canvas.clientHeight || 520;
      if (w > 20 && h > 20) {
        this.resize(w, h);
      }
    };
    syncCanvasSize();
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => syncCanvasSize());
      this._resizeObserver.observe(this.canvas);
    }

    if (!this.isPreviewOnly) {
      this.canvas.__mannequinEngine = this;
      if (typeof window !== 'undefined') {
        window.__MANNEQUIN_3D_ENGINE__ = this;
        window.__ainventory3DEngine = this;
      }
    }

    this._syncLoopRunState();
    this._initAssets();
  }

  markDirty() {
    this._sceneDirty = true;
  }

  simulateContextLoss({ autoRestoreMs = 280 } = {}) {
    if (this.disposed) return false;
    if (!this._loseContextExt) {
      try {
        this._loseContextExt =
          this.renderer?.getContext?.()?.getExtension?.('WEBGL_lose_context') || null;
      } catch {
        this._loseContextExt = null;
      }
    }
    if (!this._loseContextExt) return false;
    this._customRestoreDelayMs = Math.max(16, Number(autoRestoreMs) || 280);
    try {
      this._loseContextExt.loseContext();
      return true;
    } catch {
      this._customRestoreDelayMs = null;
      return false;
    }
  }

  resetFpsWindow() {
    this._frameMsSamples = [];
    this.avgFps = 60;
    this.lastRawNowMs = performance.now();
  }

  setPaused(paused = false) {
    const next = Boolean(paused);
    if (this._paused === next) return;
    this._paused = next;
    this._syncLoopRunState();
  }

  _syncLoopRunState() {
    if (this.disposed) return;
    const shouldPause =
      this._paused || (typeof document !== 'undefined' && document.hidden === true);
    if (shouldPause) {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = 0;
      }
      return;
    }
    if (!this.rafId) {
      const nowMs = performance.now();
      this.lastRawNowMs = nowMs;
      this.lastFrameTime = nowMs * 0.001;
      this._sceneDirty = true;
      this._startLoop();
    }
  }

  setSimulatedLowFps(degraded = true) {
    const next = Boolean(degraded);
    this._simulatedLowFps = next;
    this._vibrancyDegraded = next;
    if (next) {
      this.avgFps = Math.min(this.avgFps, 28);
    } else {
      this._frameMsSamples = [];
      this.avgFps = 60;
      this.lastRawNowMs = performance.now();
    }
    if (!this.isPreviewOnly) {
      setVibrancySolidFallback(next);
    }
    this._sceneDirty = true;
    return this._vibrancyDegraded;
  }

  _rebuildEnvironmentMap() {
    if (this.isSoftwareRenderer) return;
    try {
      this._envRenderTarget?.dispose?.();
      this._envRenderTarget = null;
      this.envMap = null;
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envScene = new RoomEnvironment();
      this._envRenderTarget = pmrem.fromScene(envScene, 0.04);
      this.envMap = this._envRenderTarget.texture;
      this.scene.environment = this.envMap;
      this.scene.environmentIntensity = 0.56;
      envScene.dispose?.();
      pmrem.dispose();
    } catch {
      // Fallback to analytical studio lights
    }
  }

  _initAssets() {
    loadBodyTemplate()
      .then((tpl) => {
        if (this.disposed) return;
        const geom = cloneRuntimeGeometryWithoutMorphs(tpl.geometry);
        geom.userData.fullIndexArray = tpl.geometry.userData.fullIndexArray?.slice();
        const skinHex = resolveSkinHex(this.lastState.profile || {});
        const mesh = new THREE.SkinnedMesh(geom, createSkinMaterial(skinHex, this.isSoftwareRenderer));
        applyNodeTransform(mesh, tpl);
        mesh.bind(this.skeleton, new THREE.Matrix4());
        mesh.frustumCulled = false;
        mesh.castShadow = !this.isSoftwareRenderer;
        mesh.receiveShadow = !this.isSoftwareRenderer;
        mesh.userData.templateRef = tpl;
        mesh.userData.isBody = true;
        this.bodyMesh = mesh;
        this.characterGroup.add(mesh);
        this.lastRawNowMs = performance.now();
        this._sceneDirty = true;
        this.updateScene(this.lastState);
      })
      .catch(() => {});
  }

  _setupLightsAndPedestal() {
    const hemi = new THREE.HemisphereLight(0xffffff, 0xd8d8dc, this.isSoftwareRenderer ? 1.45 : 0.92);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, this.isSoftwareRenderer ? 1.85 : 1.9);
    keyLight.position.set(1.8, 2.95, 2.55);
    keyLight.castShadow = !this.isSoftwareRenderer;
    if (!this.isSoftwareRenderer) {
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.radius = 5;

      const coolRim = new THREE.PointLight(0xf0f2f7, 1.24, 5.5);
      coolRim.position.set(-1.65, 1.68, -1.28);
      this.scene.add(coolRim);

      const warmRim = new THREE.PointLight(0xf5f5f7, 1.08, 5.5);
      warmRim.position.set(1.65, 1.15, -1.35);
      this.scene.add(warmRim);
    }
    this.scene.add(keyLight);

    const frontFill = new THREE.DirectionalLight(0xfafafc, this.isSoftwareRenderer ? 0.65 : 0.72);
    frontFill.position.set(-0.75, 1.42, 2.45);
    this.scene.add(frontFill);

    this.pedestalDiskMat = this.isSoftwareRenderer
      ? new THREE.MeshLambertMaterial({ color: 0xf2f2f5 })
      : new THREE.MeshPhysicalMaterial({
          color: 0xf2f2f5,
          metalness: 0.0,
          roughness: 0.62,
          clearcoat: 0.22,
          clearcoatRoughness: 0.48,
        });
    const baseDisk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 0.61, 0.032, 48),
      this.pedestalDiskMat
    );
    baseDisk.position.y = -0.016;
    baseDisk.receiveShadow = !this.isSoftwareRenderer;
    this.pedestalGroup.add(baseDisk);

    this.pedestalRingMat = new THREE.MeshBasicMaterial({
      color: 0x86868b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.18,
    });
    const ringOuter = new THREE.Mesh(new THREE.RingGeometry(0.535, 0.541, 56), this.pedestalRingMat);
    ringOuter.rotation.x = -Math.PI / 2;
    ringOuter.position.y = 0.002;
    this.pedestalGroup.add(ringOuter);

    const scanRingGeom = new THREE.RingGeometry(0.34, 0.39, 44);
    this.scanRingMat = new THREE.MeshBasicMaterial({
      color: 0x86868b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
    });
    this.scanRingMesh = new THREE.Mesh(scanRingGeom, this.scanRingMat);
    this.scanRingMesh.rotation.x = -Math.PI / 2;
    this.scanRingMesh.position.y = 0.9;
    this.rootGroup.add(this.scanRingMesh);
  }

  setDarkTheme(isDark) {
    if (!this.isPreviewOnly) {
      this.renderer.setClearColor(isDark ? 0x000000 : 0xffffff, 1);
    }
    if (this.pedestalDiskMat) {
      this.pedestalDiskMat.color.set(isDark ? 0x1c1c1e : 0xf2f2f5);
    }
    if (this.pedestalRingMat) {
      this.pedestalRingMat.color.set(isDark ? 0x48484a : 0x86868b);
    }
    if (this.scanRingMat) {
      this.scanRingMat.color.set(isDark ? 0xf5f5f7 : 0x1d1d1f);
    }
    if (this.windStreaks?.userData?.mat) {
      this.windStreaks.userData.mat.color.set(isDark ? 0x636366 : 0x8e8e93);
    }
    this._sceneDirty = true;
  }

  triggerEquipScanPulse() {
    this.scanProgress = 0.0;
    this._sceneDirty = true;
  }

  get targetYawDeg() {
    return (this.targetYaw * 180) / Math.PI;
  }

  setRotationDeg(deg) {
    const nextYaw = ((Number(deg) || 0) * Math.PI) / 180;
    if (Math.abs(nextYaw - this.targetYaw) > 0.0001) {
      this.targetYaw = nextYaw;
      this._sceneDirty = true;
    }
  }

  setYaw(deg, immediate = false) {
    this.setRotationDeg(deg);
    if (immediate) {
      this.currentYaw = this.targetYaw;
      this.prevYaw = this.targetYaw;
      this._sceneDirty = true;
    }
  }

  setMotionMode(mode = 'auto') {
    const next = mode || 'auto';
    if (this.motionMode !== next) {
      this.motionMode = next;
      this._sceneDirty = true;
    }
  }

  setWeatherInfo(weather = null) {
    this.weatherInfo = weather;
    this._sceneDirty = true;
  }

  setWeatherState(weather = null) {
    this.setWeatherInfo(weather);
  }

  setParallax(nx, ny) {
    const px = Math.max(-1, Math.min(1, Number(nx) || 0));
    const py = Math.max(-1, Math.min(1, Number(ny) || 0));
    if (Math.abs(px - this.parallaxX) > 0.001 || Math.abs(py - this.parallaxY) > 0.001) {
      this.parallaxX = px;
      this.parallaxY = py;
      this._sceneDirty = true;
    }
  }

  setFocusSlot(slotKey = 'all') {
    const next = SLOT_CAMERA_TARGETS[slotKey] ? slotKey : 'all';
    if (this.focusSlot !== next) {
      this.focusSlot = next;
      this._sceneDirty = true;
    }
  }

  setFocusedSlot(slotKey = 'all') {
    this.setFocusSlot(slotKey || 'all');
  }

  get _fpsSamples() {
    return this._frameMsSamples;
  }

  set _fpsSamples(arr) {
    this._frameMsSamples = Array.isArray(arr) ? arr : [];
    this.lastRawNowMs = performance.now();
  }

  resize(width, height) {
    const w = Math.max(200, Math.floor(width));
    const h = Math.max(260, Math.floor(height));
    const swScale = this.isSoftwareRenderer
      ? Math.min(1, 320 / Math.max(w, h), 220 / Math.min(w, h))
      : 1;
    this.renderer.setSize(
      Math.max(120, Math.round(w * swScale)),
      Math.max(160, Math.round(h * swScale)),
      false
    );
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._sceneDirty = true;
  }

  getTelemetry() {
    const sp = this.lastSprings;
    const telemetry = {
      frameCount: this.frameCount,
      avgFps: Math.round(this.avgFps * 10) / 10,
      geometries: this.renderer?.info?.memory?.geometries ?? 0,
      textures: this.renderer?.info?.memory?.textures ?? 0,
      calls: this.renderer?.info?.render?.calls ?? 0,
      isContextLost: Boolean(this.isContextLost),
      recoveryCount: this.recoveryCount,
      currentYawDeg: (this.currentYaw * 180) / Math.PI,
      targetYawDeg: (this.targetYaw * 180) / Math.PI,
      effectiveMotion: this._resolveEffectiveMotion(),
      windSpeedKmh: Number(this.weatherInfo?.windSpeed) || 11,
      activeGarmentIds: [...this.garmentMeshes.keys()],
      equippedDbGarmentIds: [...(this.equippedDbGarmentIds || [])],
      isSoftwareRenderer: this.isSoftwareRenderer,
      vibrancyDegraded: Boolean(this._vibrancyDegraded),
      jiggle: sp
        ? {
            windIntensity: Number(sp.windIntensity.toFixed(4)),
            neckUpper: { rx: sp.neckUpper.rx, ry: sp.neckUpper.ry, rz: sp.neckUpper.rz },
            neckTip: { rx: sp.neckTip.rx, ry: sp.neckTip.ry, rz: sp.neckTip.rz },
            hemUpper: { rx: sp.hemUpper.rx, ry: sp.hemUpper.ry, rz: sp.hemUpper.rz },
            hemLower: { rx: sp.hemLower.rx, ry: sp.hemLower.ry, rz: sp.hemLower.rz },
            billowX: sp.billowX,
            billowZ: sp.billowZ,
            lapel: { rx: sp.lapel.rx, ry: sp.lapel.ry, rz: sp.lapel.rz },
            bagStrap: { rx: sp.bagStrap.rx, rz: sp.bagStrap.rz, dy: sp.bagStrap.dy },
            crossbodyBag: {
              rx: sp.crossbodyBag.rx,
              ry: sp.crossbodyBag.ry,
              rz: sp.crossbodyBag.rz,
              dy: sp.crossbodyBag.dy,
            },
            handBag: { rx: sp.handBag.rx, ry: sp.handBag.ry, rz: sp.handBag.rz, dy: sp.handBag.dy },
          }
        : null,
    };
    if (!this.isPreviewOnly && typeof window !== 'undefined') {
      window.__MANNEQUIN_3D_TELEMETRY__ = telemetry;
    }
    return telemetry;
  }

  _disposeGarmentInstance(gid) {
    const mesh = this.garmentMeshes.get(gid);
    if (!mesh) return;
    mesh.parent?.remove(mesh);
    mesh.geometry?.dispose?.();
    disposeMaterialOrArray(mesh.material);
    this.garmentMeshes.delete(gid);
  }

  _getOrCreateGarmentInstance(tpl, gid, createMaterialFn = null, matKey = '') {
    if (this.garmentMeshes.has(gid)) {
      return this.garmentMeshes.get(gid);
    }
    const spec = tpl.userData.spec || {};
    const isHandSocket = spec.mount === 'hand_l' || spec.mount === 'hand_r';
    const hasMultiZones = Boolean(tpl.userData.hasMultiZones);
    const geom = cloneRuntimeGeometryWithoutMorphs(tpl.geometry);
    geom.userData.fullIndexArray = tpl.geometry.userData.fullIndexArray?.slice();
    if (tpl.geometry.userData.zoneGroups) {
      geom.userData.zoneGroups = tpl.geometry.userData.zoneGroups;
      geom.clearGroups();
      for (const g of geom.userData.zoneGroups) {
        geom.addGroup(g.start, g.count, g.materialIndex);
      }
    }

    const initialMat = createMaterialFn
      ? createMaterialFn(hasMultiZones)
      : this.isSoftwareRenderer
        ? new THREE.MeshLambertMaterial()
        : new THREE.MeshPhysicalMaterial();
    let mesh;
    if (isHandSocket) {
      mesh = new THREE.Mesh(geom, initialMat);
      applyNodeTransform(mesh, tpl);
      this.leftHandSocket.add(mesh);
    } else {
      mesh = new THREE.SkinnedMesh(geom, initialMat);
      applyNodeTransform(mesh, tpl);
      mesh.bind(this.skeleton, new THREE.Matrix4());
      this.characterGroup.add(mesh);
    }

    mesh.frustumCulled = false;
    mesh.castShadow = !this.isSoftwareRenderer;
    mesh.receiveShadow = !this.isSoftwareRenderer;
    mesh.userData.templateRef = tpl;
    mesh.userData.gid = gid;
    mesh.userData.spec = spec;
    mesh.userData.hasMultiZones = hasMultiZones;
    mesh.userData.materialKey = createMaterialFn ? matKey : '';
    mesh.userData.coveredBodyVerts = tpl.userData.coveredBodyVerts;
    this.garmentMeshes.set(gid, mesh);
    return mesh;
  }

  updateScene({
    profile = {},
    loadout: rawLoadout,
    loadoutBySlot,
    headMode = 'mannequin',
    selectedSlot = null,
    hoveredSlot = null,
    motionMode,
    weather,
  } = {}) {
    const loadout = loadoutBySlot || rawLoadout || {};
    if (motionMode !== undefined) this.motionMode = motionMode;
    if (weather !== undefined) this.weatherInfo = weather;
    this.lastState = {
      profile,
      loadout,
      loadoutBySlot: loadout,
      headMode,
      selectedSlot,
      hoveredSlot,
      motionMode: this.motionMode,
      weather: this.weatherInfo,
    };
    if (!this.bodyMesh) return;

    const seq = ++this.updateSeq;
    const { anat, weights } = computeMorphTargetWeights(profile);
    const skinHex = resolveSkinHex(profile);

    this.bodyMesh.material.color.set(skinHex);
    this.bodyMesh.material.sheenColor?.set(skinHex)?.lerp(new THREE.Color('#ffdad0'), 0.42);
    applyMorphsToMesh(this.bodyMesh, weights);
    this._sceneDirty = true;

    const baseScale = 1.075;
    const hScale = baseScale * anat.morph.heightScale;
    const frameWidthFactor =
      0.42 * anat.morph.shoulderScale +
      0.30 * anat.morph.waistScale +
      0.28 * anat.morph.hipScale;
    const xScale = baseScale * (0.35 + 0.65 * anat.morph.heightScale) * (0.35 + 0.65 * frameWidthFactor);
    const zScale = baseScale * (0.35 + 0.65 * anat.morph.heightScale) * (0.45 + 0.55 * anat.morph.bellyDepth);
    this.characterGroup.scale.set(xScale, hScale, zScale);

    const desired = [];
    const hasDress = Boolean(loadout?.dress);
    const hasTop = Boolean(loadout?.top);
    const hasBottom = Boolean(loadout?.bottom);
    const isInspectingUnderwear = selectedSlot === 'underwear' || hoveredSlot === 'underwear';

    this.activeAccessorySub = '';
    for (const [slotKey, item] of Object.entries(loadout || {})) {
      if (!item) continue;
      if (hasDress && (slotKey === 'top' || slotKey === 'bottom')) continue;
      if (slotKey === 'underwear' && !isInspectingUnderwear && (hasTop || hasBottom || hasDress)) {
        continue;
      }
      const gid = resolveGarmentIdForItem(slotKey, item);
      if (gid) {
        desired.push({ slotKey, item, gid });
        if (slotKey === 'accessory') {
          this.activeAccessorySub = gid;
        }
      }
    }

    Promise.all(
      desired.map((d) =>
        loadGarmentTemplate(d.gid)
          .then((tpl) => ({ ...d, tpl }))
          .catch(() => null)
      )
    ).then((loadedList) => {
      if (this.disposed || seq !== this.updateSeq) return;

      const active = loadedList.filter(Boolean);
      const activeGids = new Set(active.map((d) => d.gid));
      this.equippedDbGarmentIds = active
        .map((d) => Number(d.item?.id))
        .filter((n) => Number.isFinite(n) && n > 0);

      // Requirement 9.b: Strictly dispose unequipped / swapped-out garment Geometry, Material & Textures
      for (const existingGid of [...this.garmentMeshes.keys()]) {
        if (!activeGids.has(existingGid)) {
          this._disposeGarmentInstance(existingGid);
        }
      }

      const outerEntry = active.find((d) => d.slotKey === 'outer') || null;
      const topEntry = active.find((d) => d.slotKey === 'top') || null;
      const dressEntry = active.find((d) => d.slotKey === 'dress') || null;
      const bottomEntry = active.find((d) => d.slotKey === 'bottom') || null;
      const neckEntry = active.find((d) => d.slotKey === 'neckwear') || null;
      const accEntry = active.find((d) => d.slotKey === 'accessory') || null;

      // Sync fabric-aware aerodynamic wind sensitivities across all jiggle chains
      const hemSourceItem = dressEntry?.item || outerEntry?.item || bottomEntry?.item || topEntry?.item;
      const topSourceItem = outerEntry?.item || topEntry?.item;
      this.springBones.setGarmentWindScales({
        neck: neckEntry ? resolveFabricWindSensitivity(neckEntry.item) * 1.08 : 1.22,
        hem: hemSourceItem ? resolveFabricWindSensitivity(hemSourceItem) * 1.05 : 1.0,
        top: topSourceItem ? resolveFabricWindSensitivity(topSourceItem) : 0.90,
        crossbody: accEntry?.gid === 'accessory_bag' ? 0.76 : 0.68,
      });

      const hasOuter = Boolean(outerEntry);
      const hasTopActive = Boolean(topEntry);
      const hasLongPants = active.some(
        (d) => d.slotKey === 'bottom' && (d.gid === 'bottom_slacks' || d.gid === 'bottom_denim')
      );
      const bodyVertCount = this.bodyMesh.geometry.attributes.position.count;
      let combinedBodyMask = null;

      this.interactiveMeshes = [this.bodyMesh];
      const layerShellKey = active
        .filter((d) => ['outer', 'top', 'dress', 'bottom'].includes(d.slotKey))
        .map((d) => d.gid)
        .sort()
        .join(',');
      const shellMeshes = [];
      const rebakedBodyAccessories = [];

      for (const { slotKey, item, gid, tpl } of active) {
        const isHighlighted = Boolean(slotKey && (slotKey === selectedSlot || slotKey === hoveredSlot));
        const hex = String(item?.color_hex || '#2E3540').toUpperCase();
        const matSpec = inferFabricMaterialSpec(item || { category: slotKey });
        const imgUrl = String(item?.image_url || '');
        const isCustomCutout =
          imgUrl.startsWith('data:image/') ||
          imgUrl.startsWith('blob:') ||
          Boolean(item?.custom_texture);
        const matKey = `${gid}|${slotKey}|${hex}|${matSpec.type}|${isHighlighted ? 1 : 0}|${isCustomCutout ? imgUrl : ''}|${this.isSoftwareRenderer ? 1 : 0}`;

        const mesh = this._getOrCreateGarmentInstance(
          tpl,
          gid,
          (hasMultiZones) =>
            createGarmentMaterial(
              item,
              gid,
              slotKey,
              isHighlighted,
              hasMultiZones,
              this.isSoftwareRenderer
            ),
          matKey
        );
        mesh.visible = true;
        mesh.userData.slot = slotKey;

        if (mesh.userData.materialKey !== matKey) {
          const prevMat = mesh.material;
          mesh.material = createGarmentMaterial(
            item,
            gid,
            slotKey,
            isHighlighted,
            mesh.userData.hasMultiZones,
            this.isSoftwareRenderer
          );
          mesh.userData.materialKey = matKey;
          disposeMaterialOrArray(prevMat);
        }

        const isLayerConformedAcc = gid === 'accessory_bag' || gid === 'accessory_belt';
        const didRebake = applyMorphsToMesh(mesh, weights, isLayerConformedAcc ? layerShellKey : '');
        if (['outer', 'top', 'dress', 'bottom'].includes(slotKey)) {
          shellMeshes.push(mesh);
        }
        if (isLayerConformedAcc && didRebake) {
          rebakedBodyAccessories.push({ mesh, gid });
        }

        if (gid === 'accessory_briefcase') {
          this.springBones.handBagSpring.configure(GARMENT_3D_PHYSICS_PRESETS.pendulum_briefcase);
        } else if (gid === 'accessory_tote') {
          this.springBones.handBagSpring.configure(GARMENT_3D_PHYSICS_PRESETS.pendulum_tote);
        }

        if (slotKey === 'top') {
          maskInnerTopUnderOuter(mesh, hasOuter, outerEntry?.gid || null);
        } else if (slotKey === 'bottom') {
          maskBottomUnderOuterAndTop(mesh, outerEntry?.gid || null, hasTopActive);
        } else if (slotKey === 'socks') {
          maskSocksUnderLongPants(mesh, hasLongPants);
        } else {
          applyTriangleMask(mesh, null);
        }

        const cov = tpl.userData.coveredBodyVerts;
        if (cov && cov.length === bodyVertCount) {
          if (!combinedBodyMask) combinedBodyMask = new Uint8Array(bodyVertCount);
          for (let i = 0; i < bodyVertCount; i++) {
            if (cov[i]) combinedBodyMask[i] = 1;
          }
        }
        this.interactiveMeshes.push(mesh);
      }

      for (const { mesh: accMesh, gid: accGid } of rebakedBodyAccessories) {
        conformAccessoryToGarmentLayers(accMesh, accGid, this.bodyMesh, shellMeshes);
      }

      applyTriangleMask(this.bodyMesh, combinedBodyMask);
      this.renderer.renderLists?.dispose?.();
      this._sceneDirty = true;
    });
  }

  hitTestClientPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactiveMeshes, false);
    if (hits.length === 0) return null;
    const hit = hits[0];
    if (hit.object.userData.slot) return hit.object.userData.slot;
    const localPt = this.characterGroup.worldToLocal(hit.point.clone());
    return inferBodySlotFromPoint(localPt.y, localPt.x);
  }

  _resolveEffectiveMotion() {
    if (this.focusSlot === 'gloves' || (this.focusSlot === 'accessory' && this.activeAccessorySub === 'accessory_watch')) {
      return 'pose_hands';
    }
    if (this.motionMode && this.motionMode !== 'auto') {
      return this.motionMode;
    }
    const w = this.weatherInfo;
    if (w?.recommendedMotion === 'umbrella') return 'umbrella';
    const isRainy = Boolean(
      w &&
        (w.isRainy ||
          Number(w.precipProb) >= 50 ||
          /비|소나기|우천|눈|폭우|장마|rain|shower|snow|drizzle/i.test(String(w.condition || w.summary || '')))
    );
    if (isRainy) return 'umbrella';
    if (
      w?.recommendedMotion === 'wind' ||
      w?.isWindy ||
      Number(w?.windSpeed) >= 22 ||
      /강풍|돌풍|칼바람|gale|windy/i.test(String(w?.condition || ''))
    ) {
      return 'wind';
    }
    if (w?.recommendedMotion === 'walk') return 'walk';
    return 'idle';
  }

  _updateSkeletalMotionAndPhysics(nowSec, dt, yawVel) {
    const t = nowSec - this.clockStart;
    const mode = this._resolveEffectiveMotion();
    const blendRate = Math.min(1, dt * 6.5);

    this.poseBlend.walk += ((mode === 'walk' ? 1 : 0) - this.poseBlend.walk) * blendRate;
    this.poseBlend.wind += ((mode === 'wind' ? 1 : 0) - this.poseBlend.wind) * blendRate;
    this.poseBlend.wave += ((mode === 'wave' ? 1 : 0) - this.poseBlend.wave) * blendRate;
    this.poseBlend.umbrella += ((mode === 'umbrella' ? 1 : 0) - this.poseBlend.umbrella) * blendRate;
    this.poseBlend.hands += ((mode === 'pose_hands' ? 1 : 0) - this.poseBlend.hands) * blendRate;

    const wWalk = this.poseBlend.walk;
    const wWind = this.poseBlend.wind;
    const wWave = this.poseBlend.wave;
    const wUmb = this.poseBlend.umbrella;
    const wHands = this.poseBlend.hands;

    const b = this.bones;
    for (let i = 0; i <= BONE.ANKLE_R; i++) {
      b[i].rotation.set(0, 0, 0);
    }

    // 1. Default Natural Breathing & Editorial Contrapposto Life
    const breath = Math.sin(t * 1.85);
    const sway = Math.sin(t * 0.72);
    const look = Math.sin(t * 0.48 + 0.7);

    let shLZ = -0.52 + breath * 0.015;
    let shRZ = 0.52 - breath * 0.015;
    let shLY = 0.0;
    let shRY = 0.0;
    let shLX = 0.03 + sway * 0.015;
    let shRX = -0.02 - sway * 0.015;
    let elLX = -0.14 - breath * 0.02;
    let elRX = -0.14 - breath * 0.02;
    let elLY = 0.0;
    let elRY = 0.0;
    let elLZ = 0.0;
    let elRZ = 0.0;

    let pelvisY = DEFAULT_JOINTS.pelvis[1] + breath * 0.0025;
    let pelvisZRot = sway * 0.022 * (1 - wWalk * 0.7);
    let pelvisYRot = sway * 0.028 * (1 - wWalk * 0.6);
    let spine1X = breath * 0.018;
    let spine2Z = -sway * 0.016 * (1 - wWalk * 0.7);
    let headY = look * 0.055 * (1 - wHands * 0.6);
    let headX = breath * 0.018;
    let headZ = sway * 0.018;

    let hipLX = 0.02 * sway;
    let hipRX = -0.02 * sway;
    let kneeLX = 0.03;
    let kneeRX = 0.04;
    let ankleLX = 0.0;
    let ankleRX = 0.0;

    // 2. Runway Walk Layer (`walk`)
    if (wWalk > 0.005) {
      const wPhase = t * 3.8;
      const stride = Math.sin(wPhase);
      const oppStride = Math.sin(wPhase + Math.PI);
      const liftL = Math.max(0, Math.sin(wPhase + Math.PI * 0.5));
      const liftR = Math.max(0, Math.sin(wPhase - Math.PI * 0.5));

      pelvisY += (Math.abs(Math.cos(wPhase)) - 0.5) * 0.018 * wWalk;
      pelvisZRot += stride * 0.042 * wWalk;
      pelvisYRot += stride * 0.055 * wWalk;
      spine2Z += -stride * 0.032 * wWalk;

      hipLX += -stride * 0.34 * wWalk;
      hipRX += -oppStride * 0.34 * wWalk;
      kneeLX += (0.06 + liftL * 0.46) * wWalk;
      kneeRX += (0.06 + liftR * 0.46) * wWalk;
      ankleLX += (-liftL * 0.18 + stride * 0.08) * wWalk;
      ankleRX += (-liftR * 0.18 + oppStride * 0.08) * wWalk;

      shLX += oppStride * 0.24 * wWalk;
      shRX += stride * 0.24 * wWalk;
      elLX += (-0.12 - Math.max(0, -oppStride) * 0.18) * wWalk;
      elRX += (-0.12 - Math.max(0, -stride) * 0.18) * wWalk;
    }

    // 2b. Gale Wind Bracing Layer (`wind`) — natural editorial lean & balance into gusts
    if (wWind > 0.005) {
      const gustSwell = 0.5 + 0.5 * Math.sin(t * 1.65);
      spine1X += (0.046 + gustSwell * 0.026) * wWind;
      spine2Z += (-0.028 - gustSwell * 0.016) * wWind;
      pelvisYRot += -0.055 * wWind;
      headY = THREE.MathUtils.lerp(headY, 0.095 + Math.sin(t * 1.3) * 0.03, wWind * 0.75);
      headX += 0.032 * wWind;
      headZ += -0.026 * wWind;
      shRX = THREE.MathUtils.lerp(shRX, -0.14 - gustSwell * 0.05, wWind * 0.65);
      elRX = THREE.MathUtils.lerp(elRX, -0.30 - gustSwell * 0.06, wWind * 0.65);
      shRZ += -0.04 * wWind;
      hipLX += -0.035 * wWind;
      hipRX += 0.030 * wWind;
      kneeLX += 0.035 * wWind;
    }

    // 3. Friendly "안녕?" Greeting Wave Layer (`wave`)
    if (wWave > 0.005) {
      const waveOsc = Math.sin(t * 6.4);
      shRZ = THREE.MathUtils.lerp(shRZ, -0.96, wWave);
      shRX = THREE.MathUtils.lerp(shRX, -0.18, wWave);
      elRZ = THREE.MathUtils.lerp(elRZ, -1.32 + waveOsc * 0.28, wWave);
      elRX = THREE.MathUtils.lerp(elRX, -0.16, wWave);
      headZ = THREE.MathUtils.lerp(headZ, 0.075 + Math.sin(t * 3.2) * 0.025, wWave);
      headY = THREE.MathUtils.lerp(headY, -0.05, wWave);
    }

    // 4. Weather Umbrella Hold Layer (`umbrella`)
    if (wUmb > 0.005) {
      shRX = THREE.MathUtils.lerp(shRX, -0.36, wUmb);
      shRY = THREE.MathUtils.lerp(shRY, 0.16, wUmb);
      shRZ = THREE.MathUtils.lerp(shRZ, 0.48, wUmb);
      elRX = THREE.MathUtils.lerp(elRX, -0.82 + breath * 0.02, wUmb);
      elRY = THREE.MathUtils.lerp(elRY, 0.38, wUmb);
      elRZ = THREE.MathUtils.lerp(elRZ, 0.22, wUmb);
    }

    // 5. Hands / Gloves Inspection Pose (`pose_hands`)
    if (wHands > 0.005) {
      const handPulse = Math.sin(t * 1.6) * 0.025;
      shLX = THREE.MathUtils.lerp(shLX, -0.34, wHands);
      shRX = THREE.MathUtils.lerp(shRX, -0.34, wHands);
      shLY = THREE.MathUtils.lerp(shLY, -0.18, wHands);
      shRY = THREE.MathUtils.lerp(shRY, 0.18, wHands);
      shLZ = THREE.MathUtils.lerp(shLZ, -0.58, wHands);
      shRZ = THREE.MathUtils.lerp(shRZ, 0.58, wHands);
      elLX = THREE.MathUtils.lerp(elLX, -0.58 + handPulse, wHands);
      elRX = THREE.MathUtils.lerp(elRX, -0.58 - handPulse, wHands);
      elLY = THREE.MathUtils.lerp(elLY, -0.52, wHands);
      elRY = THREE.MathUtils.lerp(elRY, 0.52, wHands);
      elLZ = THREE.MathUtils.lerp(elLZ, -0.28, wHands);
      elRZ = THREE.MathUtils.lerp(elRZ, 0.28, wHands);
    }

    // 5b. Bag-aware left-arm clearance & natural carrying posture
    if (wHands < 0.5) {
      const freeArm = 1.0 - wHands;
      if (this.activeAccessorySub === 'accessory_bag') {
        // Subtle lateral clearance so the gloved left hand never brushes the hip saddle bag
        shLZ += 0.065 * freeArm;
        shLX -= 0.04 * freeArm;
      } else if (
        this.activeAccessorySub === 'accessory_briefcase' ||
        this.activeAccessorySub === 'accessory_tote'
      ) {
        // Relaxed vertical bag-carrying arm so handle hangs naturally from the side palm
        shLX = THREE.MathUtils.lerp(shLX, -0.03 + sway * 0.01, 0.72 * freeArm);
        elLX = THREE.MathUtils.lerp(elLX, -0.05, 0.78 * freeArm);
        shLZ += 0.035 * freeArm;
      }
    }

    b[BONE.PELVIS].position.y = pelvisY;
    b[BONE.PELVIS].rotation.set(0, pelvisYRot, pelvisZRot);
    b[BONE.SPINE3].rotation.set(spine1X * 0.4, -pelvisYRot * 0.35, spine2Z * 0.5);
    b[BONE.SPINE2].rotation.set(spine1X * 0.5, -pelvisYRot * 0.35, spine2Z);
    b[BONE.SPINE1].rotation.set(spine1X, 0, 0);
    b[BONE.NECK].rotation.set(headX * 0.4, headY * 0.35, headZ * 0.35);
    b[BONE.HEAD].rotation.set(headX * 0.6, headY * 0.65, headZ * 0.65);

    b[BONE.SHOULDER_L].rotation.set(shLX, shLY, shLZ);
    b[BONE.ELBOW_L].rotation.set(elLX, elLY, elLZ);
    b[BONE.HAND_L].rotation.set(0, 0, Math.sin(t * 1.5) * 0.04);

    b[BONE.SHOULDER_R].rotation.set(shRX, shRY, shRZ);
    b[BONE.ELBOW_R].rotation.set(elRX, elRY, elRZ);
    b[BONE.HAND_R].rotation.set(0, 0, wWave > 0.2 ? Math.sin(t * 6.4 + 0.5) * 0.16 * wWave : -Math.sin(t * 1.5) * 0.04);

    b[BONE.HIP_L].rotation.set(hipLX, 0, 0.015);
    b[BONE.KNEE_L].rotation.set(kneeLX, 0, 0);
    b[BONE.ANKLE_L].rotation.set(ankleLX, 0, 0);

    b[BONE.HIP_R].rotation.set(hipRX, 0, -0.015);
    b[BONE.KNEE_R].rotation.set(kneeRX, 0, 0);
    b[BONE.ANKLE_R].rotation.set(ankleRX, 0, 0);

    this.characterGroup.updateMatrixWorld(true);
    this._invCharMat.copy(this.characterGroup.matrixWorld).invert();

    // 6. Compute Palm Grip Anchor + Step Multi-Chain `SpringBoneSystem` (Req 6.d)
    this._tmpVecA
      .setFromMatrixPosition(this.leftPalmGripAnchor.matrixWorld)
      .applyMatrix4(this._invCharMat);
    const palmLocalL = this._tmpVecA;

    const invDt = 1.0 / Math.max(0.008, dt);
    const vx = (palmLocalL.x - this.bagSpringState.prevHandPos.x) * invDt;
    const vz = (palmLocalL.z - this.bagSpringState.prevHandPos.z) * invDt;
    const ax = Math.max(-8, Math.min(8, (vx - this.bagSpringState.prevHandVel.x) * invDt));
    const az = Math.max(-8, Math.min(8, (vz - this.bagSpringState.prevHandVel.z) * invDt));
    this.bagSpringState.prevHandPos.copy(palmLocalL);
    this.bagSpringState.prevHandVel.set(vx, 0, vz);

    const weatherWindKmh = Number(this.weatherInfo?.windSpeed) || (wUmb > 0.2 ? 19 : 11);
    const springs = this.springBones.update({
      dt,
      timeSec: t,
      walkWeight: wWalk,
      windWeight: wWind,
      windSpeedKmh: weatherWindKmh,
      yawVel,
      handAccelX: ax,
      handAccelZ: az,
    });
    this.lastSprings = springs;

    // Apply 2-Link Muffler/Tie Flutter + Lapel Drape
    b[BONE.JIGGLE_NECK_UPPER].rotation.set(
      springs.neckUpper.rx,
      springs.neckUpper.ry,
      springs.neckUpper.rz
    );
    b[BONE.JIGGLE_NECK_TIP].rotation.set(
      springs.neckTip.rx,
      springs.neckTip.ry,
      springs.neckTip.rz
    );
    b[BONE.JIGGLE_LAPEL].rotation.set(springs.lapel.rx, springs.lapel.ry, springs.lapel.rz);

    // Apply 2-Link Coat/Skirt/Dress Wave + Radial Billow Volume Inflation
    b[BONE.JIGGLE_HEM_UPPER].rotation.set(
      springs.hemUpper.rx,
      springs.hemUpper.ry,
      springs.hemUpper.rz
    );
    b[BONE.JIGGLE_HEM_LOWER].rotation.set(
      springs.hemLower.rx,
      springs.hemLower.ry,
      springs.hemLower.rz
    );
    b[BONE.JIGGLE_HEM_LOWER].scale.set(
      1 + springs.billowX * 1.48,
      1,
      1 + springs.billowZ + wWalk * 0.055
    );

    // Apply Coupled Crossbody Leather Strap Flex & D-Ring Hip Bounce
    const strapRest = b[BONE.JIGGLE_STRAP].userData.restPos;
    b[BONE.JIGGLE_STRAP].position.set(
      strapRest.x + Math.max(0, springs.bagStrap.rz) * 0.016,
      strapRest.y + springs.bagStrap.dy,
      strapRest.z
    );
    b[BONE.JIGGLE_STRAP].rotation.set(
      springs.bagStrap.rx,
      springs.bagStrap.ry,
      springs.bagStrap.rz
    );

    const bagRest = b[BONE.JIGGLE_BAG].userData.restPos;
    b[BONE.JIGGLE_BAG].position.set(
      bagRest.x + Math.max(0, springs.crossbodyBag.rz) * 0.012,
      bagRest.y + springs.crossbodyBag.dy,
      bagRest.z
    );
    b[BONE.JIGGLE_BAG].rotation.set(
      springs.crossbodyBag.rx,
      springs.crossbodyBag.ry,
      springs.crossbodyBag.rz
    );

    // Apply 3-DOF Handheld Briefcase / Shopper Tote Socket Swing & Bounce
    this.leftHandSocket.position.set(
      palmLocalL.x - 0.006,
      palmLocalL.y + springs.handBag.dy,
      palmLocalL.z
    );
    this.leftHandSocket.rotation.set(
      springs.handBag.rx,
      springs.handBag.ry,
      springs.handBag.rz
    );

    b[BONE.SPINE1].updateMatrixWorld(true);
    b[BONE.PELVIS].updateMatrixWorld(true);

    // 7. Update Right-Hand Weather Umbrella Socket + Raindrop / Wind Breeze Streamlines
    const showUmbrella = wUmb > 0.18;
    this.umbrellaProp.visible = showUmbrella;
    this.rainStreaks.visible = showUmbrella;
    if (showUmbrella) {
      this._tmpVecB
        .setFromMatrixPosition(this.rightPalmGripAnchor.matrixWorld)
        .applyMatrix4(this._invCharMat);
      this.rightHandSocket.position.set(this._tmpVecB.x + 0.008, this._tmpVecB.y + 0.012, this._tmpVecB.z);
      this.rightHandSocket.rotation.set(-0.28 + Math.sin(t * 1.4) * 0.015, 0, -0.24);

      const seeds = this.rainStreaks.userData.seeds;
      const posAttr = this.rainStreaks.userData.lines.geometry.attributes.position;
      for (let i = 0; i < seeds.length; i++) {
        seeds[i].y -= seeds[i].speed * dt;
        if (seeds[i].y < 0.04) seeds[i].y = 2.18;
        posAttr.setXYZ(i * 2, seeds[i].x, seeds[i].y, seeds[i].z);
        posAttr.setXYZ(i * 2 + 1, seeds[i].x - 0.008 - springs.windNorm * 0.022, seeds[i].y - 0.095, seeds[i].z);
      }
      posAttr.needsUpdate = true;
    }

    const showWindStreaks = !showUmbrella && (wWind > 0.16 || weatherWindKmh >= 22);
    this.windStreaks.visible = showWindStreaks;
    if (showWindStreaks) {
      const seeds = this.windStreaks.userData.seeds;
      const posAttr = this.windStreaks.userData.lines.geometry.attributes.position;
      const windSpeedScale = 0.75 + springs.windNorm * 0.85;
      this.windStreaks.userData.mat.opacity = Math.min(0.30, 0.12 + springs.windIntensity * 0.14);
      for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        s.x += s.speed * windSpeedScale * dt;
        s.y -= s.speed * 0.11 * dt;
        if (s.x > 1.25 || s.y < 0.12) {
          s.x = -1.25 - Math.random() * 0.25;
          s.y = 0.32 + Math.random() * 1.48;
        }
        const segLen = s.len * (0.85 + 0.25 * springs.windNorm);
        const baseIdx = i * 6;
        for (let seg = 0; seg < 3; seg++) {
          const u0 = seg / 3;
          const u1 = (seg + 1) / 3;
          const x0 = s.x - u0 * segLen;
          const x1 = s.x - u1 * segLen;
          const wave0 = Math.sin(t * 5.2 + s.phase - u0 * 2.6) * 0.016;
          const wave1 = Math.sin(t * 5.2 + s.phase - u1 * 2.6) * 0.016;
          posAttr.setXYZ(baseIdx + seg * 2, x0, s.y + u0 * 0.028 + wave0, s.z);
          posAttr.setXYZ(baseIdx + seg * 2 + 1, x1, s.y + u1 * 0.028 + wave1, s.z);
        }
      }
      posAttr.needsUpdate = true;
    }
  }

  _startLoop() {
    const animate = () => {
      if (
        this.disposed ||
        this._paused ||
        (typeof document !== 'undefined' && document.hidden === true)
      ) {
        this.rafId = 0;
        return;
      }
      this.rafId = requestAnimationFrame(animate);

      const nowMs = performance.now();
      const rawDeltaMs = nowMs - this.lastRawNowMs;
      this.lastRawNowMs = nowMs;

      const isHidden = typeof document !== 'undefined' && document.hidden === true;
      if (!this._simulatedLowFps && !isHidden && rawDeltaMs > 1 && this.frameCount >= 2) {
        const clampedDeltaMs = Math.min(1000, rawDeltaMs);
        this._frameMsSamples.push(clampedDeltaMs);
        if (this._frameMsSamples.length > 40) this._frameMsSamples.shift();
        const meanMs =
          this._frameMsSamples.reduce((acc, v) => acc + v, 0) / this._frameMsSamples.length;
        this.avgFps = Math.min(120, 1000 / Math.max(1, meanMs));

        // Requirement 14.b: Auto-degrade Vibrancy backdrop-filter to solid surface on FPS drop
        if (!this.isPreviewOnly && this._frameMsSamples.length >= 25) {
          if (!this._vibrancyDegraded && this.avgFps < 46) {
            this._vibrancyDegraded = true;
            setVibrancySolidFallback(true);
          } else if (this._vibrancyDegraded && this.avgFps >= 52) {
            this._vibrancyDegraded = false;
            setVibrancySolidFallback(false);
          }
        }
      }

      if (this.isContextLost) return;

      const nowSec = nowMs * 0.001;
      const dt = Math.min(0.05, Math.max(0.004, nowSec - this.lastFrameTime));
      this.lastFrameTime = nowSec;

      const desiredYaw = this.targetYaw + this.parallaxX * 0.18;
      this.prevYaw = this.currentYaw;
      const yawLerp = this.isSoftwareRenderer ? 0.24 : 0.12;
      const yawDiff = desiredYaw - this.currentYaw;
      if (Math.abs(yawDiff) < 0.0015) {
        if (this.currentYaw !== desiredYaw) {
          this.currentYaw = desiredYaw;
          this._sceneDirty = true;
        }
      } else {
        this.currentYaw += yawDiff * yawLerp;
      }
      const yawVel = (this.currentYaw - this.prevYaw) / dt;

      this.characterGroup.rotation.y = this.currentYaw;
      this.characterGroup.rotation.x = this.parallaxY * 0.04;

      this._updateSkeletalMotionAndPhysics(nowSec, dt, yawVel);

      const mode = this._resolveEffectiveMotion();
      let targetSpec = SLOT_CAMERA_TARGETS[this.focusSlot] || SLOT_CAMERA_TARGETS.all;
      if (this.focusSlot === 'all' && mode === 'umbrella') {
        targetSpec = { x: 0.0, y: 1.08, dist: 4.18, fov: 35 };
      } else if (this.focusSlot === 'accessory') {
        if (this.activeAccessorySub === 'accessory_glasses') {
          targetSpec = { x: 0.0, y: 1.54, dist: 1.06, fov: 30 };
        } else if (this.activeAccessorySub === 'accessory_watch') {
          targetSpec = { x: 0.0, y: 1.07, dist: 1.42, fov: 30 };
        } else if (this.activeAccessorySub === 'accessory_bag') {
          targetSpec = { x: 0.06, y: 0.96, dist: 1.86, fov: 33 };
        } else if (
          this.activeAccessorySub === 'accessory_briefcase' ||
          this.activeAccessorySub === 'accessory_tote'
        ) {
          targetSpec = { x: 0.12, y: 0.72, dist: 1.88, fov: 33 };
        }
      }

      const camLerp = this.isSoftwareRenderer ? 0.24 : 0.10;
      const tx = targetSpec.x || 0;
      const dxCam = tx - this.camTargetX;
      const dyCam = targetSpec.y - this.camTargetY;
      const ddCam = targetSpec.dist - this.camDist;
      const targetFov = targetSpec.fov ?? 35;
      const dFov = targetFov - this.camera.fov;
      const isFovSettling = Math.abs(dFov) > 0.05;
      const isPosSettling =
        Math.abs(dxCam) > 0.0018 || Math.abs(dyCam) > 0.0018 || Math.abs(ddCam) > 0.0018;
      const isCamSettling = isPosSettling || isFovSettling;

      if (isPosSettling) {
        this.camTargetX += dxCam * camLerp;
        this.camTargetY += dyCam * camLerp;
        this.camDist += ddCam * camLerp;
      } else if (
        this.camTargetX !== tx ||
        this.camTargetY !== targetSpec.y ||
        this.camDist !== targetSpec.dist
      ) {
        this.camTargetX = tx;
        this.camTargetY = targetSpec.y;
        this.camDist = targetSpec.dist;
        this._sceneDirty = true;
      }

      if (isFovSettling) {
        this.camera.fov += dFov * camLerp;
        this.camera.updateProjectionMatrix();
      } else if (this.camera.fov !== targetFov) {
        this.camera.fov = targetFov;
        this.camera.updateProjectionMatrix();
        this._sceneDirty = true;
      }

      this.camera.position.set(
        this.camTargetX + this.parallaxX * 0.08,
        this.camTargetY + 0.04,
        this.camDist
      );
      this.camera.lookAt(this.camTargetX, this.camTargetY - 0.02, 0);

      if (this.scanProgress < 1.0) {
        this.scanProgress = Math.min(
          1.0,
          this.scanProgress + (this.isSoftwareRenderer ? 0.12 : 0.028)
        );
        this.scanRingMesh.position.y = 1.82 - this.scanProgress * 1.78;
        this.scanRingMat.opacity = Math.sin(this.scanProgress * Math.PI) * 0.55;
      } else if (this.scanRingMat.opacity !== 0.0) {
        this.scanRingMat.opacity = 0.0;
        this._sceneDirty = true;
      }

      const isInteractingOrMoving =
        Math.abs(yawDiff) >= 0.0015 || isCamSettling || this.scanProgress < 1.0;
      const isPoseTransitioning =
        Math.abs((mode === 'walk' ? 1 : 0) - this.poseBlend.walk) > 0.04 ||
        Math.abs((mode === 'wind' ? 1 : 0) - this.poseBlend.wind) > 0.04 ||
        Math.abs((mode === 'wave' ? 1 : 0) - this.poseBlend.wave) > 0.04 ||
        Math.abs((mode === 'umbrella' ? 1 : 0) - this.poseBlend.umbrella) > 0.04 ||
        Math.abs((mode === 'pose_hands' ? 1 : 0) - this.poseBlend.hands) > 0.04;

      const shouldRender =
        !this.isSoftwareRenderer ||
        this._sceneDirty ||
        isInteractingOrMoving ||
        isPoseTransitioning ||
        nowMs - this._lastSoftwareRenderMs >= 520;

      if (shouldRender) {
        this._sceneDirty = false;
        this._lastSoftwareRenderMs = nowMs;
        this.renderer.render(this.scene, this.camera);
      }
      if (this._lastSoftwareRenderMs > 0 || !this.isSoftwareRenderer) {
        this.frameCount += 1;
      }
    };
    animate();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    activeEngineInstances.delete(this);
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this._contextRestoreTimer) {
      clearTimeout(this._contextRestoreTimer);
      this._contextRestoreTimer = null;
    }
    this._resizeObserver?.disconnect?.();
    this.canvas?.removeEventListener?.('webglcontextlost', this._handleContextLost, false);
    this.canvas?.removeEventListener?.('webglcontextrestored', this._handleContextRestored, false);
    if (typeof document !== 'undefined' && this._handleVisibilityChange) {
      document.removeEventListener('visibilitychange', this._handleVisibilityChange, false);
    }

    for (const gid of [...this.garmentMeshes.keys()]) {
      this._disposeGarmentInstance(gid);
    }
    if (this.bodyMesh) {
      this.bodyMesh.parent?.remove(this.bodyMesh);
      this.bodyMesh.geometry?.dispose?.();
      disposeMaterialOrArray(this.bodyMesh.material);
      this.bodyMesh = null;
    }

    const disposeSubtree = (root) => {
      root?.traverse?.((obj) => {
        obj.geometry?.dispose?.();
        disposeMaterialOrArray(obj.material);
      });
    };
    disposeSubtree(this.pedestalGroup);
    disposeSubtree(this.umbrellaProp);
    disposeSubtree(this.rainStreaks);
    disposeSubtree(this.windStreaks);
    disposeSubtree(this.scanRingMesh);

    this._envRenderTarget?.dispose?.();
    this._envRenderTarget = null;
    this.envMap = null;
    this.skeleton?.dispose?.();
    this.renderer?.renderLists?.dispose?.();
    this.renderer?.dispose?.();
    try {
      this.renderer?.forceContextLoss?.();
    } catch {
      // ignore context loss errors on teardown
    }

    if (this.canvas?.__mannequinEngine === this) {
      delete this.canvas.__mannequinEngine;
    }
    if (typeof window !== 'undefined') {
      if (window.__MANNEQUIN_3D_ENGINE__ === this) {
        delete window.__MANNEQUIN_3D_ENGINE__;
        delete window.__MANNEQUIN_3D_TELEMETRY__;
      }
      if (window.__ainventory3DEngine === this) {
        delete window.__ainventory3DEngine;
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Shared Offscreen 3D Renderer for Mini Body-Shape Cards & Modal Live Preview
// -----------------------------------------------------------------------------
let sharedPreviewEngine = null;

function pruneDisconnectedPreviewListeners() {
  for (const canvasKey of [...previewListeners.keys()]) {
    if (canvasKey && canvasKey.isConnected === false) {
      previewListeners.delete(canvasKey);
    }
  }
}

function notifyPreviewListeners() {
  for (const eng of activeEngineInstances) {
    eng.markDirty?.();
  }
  pruneDisconnectedPreviewListeners();
  const entries = [...previewListeners.entries()];
  previewListeners.clear();
  for (const [canvasKey, fn] of entries) {
    if (canvasKey && canvasKey.isConnected === false) continue;
    try {
      fn();
    } catch {
      // ignore listener errors
    }
  }
}

function getSharedPreviewEngine() {
  if (sharedPreviewEngine) return sharedPreviewEngine;
  if (typeof document === 'undefined') return null;
  try {
    const isSoftware = detectSoftwareWebGL();
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 360;
    offCanvas.height = 500;
    const renderer = new THREE.WebGLRenderer({
      canvas: offCanvas,
      antialias: !isSoftware,
      alpha: true,
      stencil: false,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.toneMapping = isSoftware ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(33, 360 / 500, 0.1, 20);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xd8d8dc, 1.05);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(1.6, 2.6, 2.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xf5f5f7, 1.1);
    rim.position.set(-1.5, 1.6, -1.4);
    scene.add(rim);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.50, 0.03, 40),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f5, roughness: 0.7 })
    );
    pedestal.position.y = -0.015;
    scene.add(pedestal);

    const group = new THREE.Group();
    scene.add(group);

    const rig = createHumanoidSkeleton(DEFAULT_JOINTS);
    // Natural relaxed arms on preview cards as well!
    rig.bones[BONE.SHOULDER_L].rotation.z = -0.50;
    rig.bones[BONE.SHOULDER_R].rotation.z = 0.50;
    rig.bones[BONE.ELBOW_L].rotation.x = -0.12;
    rig.bones[BONE.ELBOW_R].rotation.x = -0.12;
    group.add(rig.rootBone);
    rig.rootBone.updateMatrixWorld(true);

    const eng = {
      offCanvas,
      renderer,
      scene,
      camera,
      pedestal,
      group,
      skeleton: rig.skeleton,
      isSoftware,
      isContextLost: false,
      bodyMesh: null,
      briefsMesh: null,
      topMesh: null,
      onContextLost: null,
      onContextRestored: null,
    };

    eng.onContextLost = (e) => {
      e.preventDefault();
      eng.isContextLost = true;
    };
    eng.onContextRestored = () => {
      eng.isContextLost = false;
      notifyPreviewListeners();
    };
    offCanvas.addEventListener('webglcontextlost', eng.onContextLost, false);
    offCanvas.addEventListener('webglcontextrestored', eng.onContextRestored, false);

    sharedPreviewEngine = eng;
    return sharedPreviewEngine;
  } catch {
    return null;
  }
}

export function disposeSharedPreviewEngine() {
  previewListeners.clear();
  if (!sharedPreviewEngine) return;
  const eng = sharedPreviewEngine;
  sharedPreviewEngine = null;

  eng.offCanvas?.removeEventListener?.('webglcontextlost', eng.onContextLost, false);
  eng.offCanvas?.removeEventListener?.('webglcontextrestored', eng.onContextRestored, false);

  for (const mesh of [eng.bodyMesh, eng.briefsMesh, eng.topMesh, eng.pedestal]) {
    if (!mesh) continue;
    mesh.parent?.remove(mesh);
    mesh.geometry?.dispose?.();
    disposeMaterialOrArray(mesh.material);
  }
  eng.skeleton?.dispose?.();
  eng.renderer?.renderLists?.dispose?.();
  eng.renderer?.dispose?.();
  try {
    eng.renderer?.forceContextLoss?.();
  } catch {
    // ignore context release errors
  }
  if (eng.offCanvas) {
    eng.offCanvas.width = 0;
    eng.offCanvas.height = 0;
  }
}

export function render3DMannequinScene(canvas, options = {}) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  pruneDisconnectedPreviewListeners();

  const width = canvas.width || 240;
  const height = canvas.height || 340;
  const {
    profile = {},
    rotationDeg = 0,
    compact = false,
    darkHud = false,
  } = options;

  const isDarkTheme =
    Boolean(darkHud) ||
    (typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-theme') === 'dark');

  if (
    !bodyTemplateMesh ||
    !garmentTemplateCache.has('underwear_briefs') ||
    !garmentTemplateCache.has('underwear_top')
  ) {
    if (canvas.isConnected !== false) {
      previewListeners.set(canvas, () => {
        if (canvas.isConnected === false) return;
        render3DMannequinScene(canvas, options);
      });
    }
    loadBodyTemplate().catch(() => {});
    loadGarmentTemplate('underwear_briefs').catch(() => {});
    loadGarmentTemplate('underwear_top').catch(() => {});
  } else {
    previewListeners.delete(canvas);
  }

  ctx.clearRect(0, 0, width, height);

  if (!compact) {
    const bgGrad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.42,
      16,
      width * 0.5,
      height * 0.48,
      Math.max(width, height) * 0.65
    );
    if (isDarkTheme) {
      bgGrad.addColorStop(0, 'rgba(28, 28, 30, 0.56)');
      bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
    } else {
      bgGrad.addColorStop(0, 'rgba(245, 245, 247, 0.94)');
      bgGrad.addColorStop(1, 'rgba(245, 245, 247, 0.18)');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);
  }

  const eng = bodyTemplateMesh ? getSharedPreviewEngine() : null;
  if (eng && !eng.isContextLost && bodyTemplateMesh) {
    if (eng.pedestal?.material?.color) {
      eng.pedestal.material.color.set(isDarkTheme ? 0x2c2c2e : 0xf2f2f5);
    }

    if (!eng.bodyMesh) {
      const geom = cloneRuntimeGeometryWithoutMorphs(bodyTemplateMesh.geometry);
      eng.bodyMesh = new THREE.SkinnedMesh(
        geom,
        createSkinMaterial(resolveSkinHex(profile), eng.isSoftware)
      );
      applyNodeTransform(eng.bodyMesh, bodyTemplateMesh);
      eng.bodyMesh.bind(eng.skeleton, new THREE.Matrix4());
      eng.bodyMesh.frustumCulled = false;
      eng.bodyMesh.userData.templateRef = bodyTemplateMesh;
      eng.group.add(eng.bodyMesh);
    }
    if (!eng.briefsMesh && garmentTemplateCache.has('underwear_briefs')) {
      const tpl = garmentTemplateCache.get('underwear_briefs');
      const briefsGeom = cloneRuntimeGeometryWithoutMorphs(tpl.geometry);
      const briefsMat = eng.isSoftware
        ? new THREE.MeshLambertMaterial({ color: 0x1d1d1f })
        : new THREE.MeshPhysicalMaterial({ color: 0x1d1d1f, roughness: 0.68, sheen: 0.3 });
      eng.briefsMesh = new THREE.SkinnedMesh(briefsGeom, briefsMat);
      applyNodeTransform(eng.briefsMesh, tpl);
      eng.briefsMesh.bind(eng.skeleton, new THREE.Matrix4());
      eng.briefsMesh.frustumCulled = false;
      eng.briefsMesh.userData.templateRef = tpl;
      eng.group.add(eng.briefsMesh);
    }
    if (!eng.topMesh && garmentTemplateCache.has('underwear_top')) {
      const tpl = garmentTemplateCache.get('underwear_top');
      const topGeom = cloneRuntimeGeometryWithoutMorphs(tpl.geometry);
      const topMat = eng.isSoftware
        ? new THREE.MeshLambertMaterial({ color: 0x1d1d1f })
        : new THREE.MeshPhysicalMaterial({ color: 0x1d1d1f, roughness: 0.68, sheen: 0.3 });
      eng.topMesh = new THREE.SkinnedMesh(topGeom, topMat);
      applyNodeTransform(eng.topMesh, tpl);
      eng.topMesh.bind(eng.skeleton, new THREE.Matrix4());
      eng.topMesh.frustumCulled = false;
      eng.topMesh.userData.templateRef = tpl;
      eng.group.add(eng.topMesh);
    }

    const { anat, weights } = computeMorphTargetWeights(profile);
    const skinHex = resolveSkinHex(profile);
    eng.bodyMesh.material.color.set(skinHex);
    eng.bodyMesh.material.sheenColor?.set(skinHex)?.lerp(new THREE.Color('#fff5f0'), 0.38);
    applyMorphsToMesh(eng.bodyMesh, weights);

    const defaultBriefsHex = isDarkTheme ? '#2C2C2E' : '#1D1D1F';
    const rawBriefsHex = profile.mannequinBriefsColorHex;
    const briefsHex =
      !rawBriefsHex || String(rawBriefsHex).toLowerCase() === '#2c2623'
        ? defaultBriefsHex
        : rawBriefsHex;
    if (eng.briefsMesh) {
      eng.briefsMesh.material.color.set(briefsHex);
      applyMorphsToMesh(eng.briefsMesh, weights);
    }
    if (eng.topMesh) {
      eng.topMesh.visible = anat.gender === 'female';
      eng.topMesh.material.color.set(briefsHex);
      applyMorphsToMesh(eng.topMesh, weights);
    }

    const baseScale = 1.075;
    const frameWidthFactor =
      0.42 * anat.morph.shoulderScale +
      0.30 * anat.morph.waistScale +
      0.28 * anat.morph.hipScale;
    eng.group.scale.set(
      baseScale * (0.35 + 0.65 * anat.morph.heightScale) * (0.35 + 0.65 * frameWidthFactor),
      baseScale * anat.morph.heightScale,
      baseScale * (0.35 + 0.65 * anat.morph.heightScale) * (0.45 + 0.55 * anat.morph.bellyDepth)
    );
    eng.group.rotation.y = ((Number(rotationDeg) || 0) * Math.PI) / 180;
    eng.group.updateMatrixWorld(true);

    if (eng.offCanvas.width !== width || eng.offCanvas.height !== height) {
      eng.renderer.setSize(width, height, false);
      eng.camera.aspect = width / height;
      eng.camera.updateProjectionMatrix();
    }
    eng.camera.position.set(0, 0.92, compact ? 3.16 : 3.22);
    eng.camera.lookAt(0, 0.90, 0);
    eng.renderer.render(eng.scene, eng.camera);
    ctx.drawImage(eng.offCanvas, 0, 0, width, height);

    return {
      anatomical: anat,
      hitTest() {
        return null;
      },
    };
  }

  return {
    anatomical: resolveAnatomicalProfile(profile),
    hitTest() {
      return null;
    },
  };
}
