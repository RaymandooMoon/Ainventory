import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { resolveAnatomicalProfile } from './bodyAnthropometrics.js';
import { GARMENT_3D_PHYSICS_PRESETS } from './garment3DPhysicsSpecs.js';

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

export function inferFabricMaterialSpec(item = {}) {
  const sub = String(item.subcategory || '').toLowerCase();
  const cat = String(item.category || '').toLowerCase();
  const name = String(item.name || '');

  if (sub === 'padding' || name.includes('패딩') || name.includes('다운') || name.includes('퀼팅')) {
    return { type: 'padding', labelKo: '구스다운 퀼팅 나일론', roughness: 0.38, metalness: 0.06, sheen: 0.35, clearcoat: 0.18, bumpScale: 0.024 };
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
    sub === 'watch' ||
    sub === 'glasses' ||
    name.includes('레더') ||
    name.includes('가죽') ||
    name.includes('서류가방') ||
    name.includes('브리프케이스')
  ) {
    return { type: 'leather', labelKo: '이탈리안 풀그레인 레더', roughness: 0.30, metalness: 0.08, sheen: 0.24, clearcoat: 0.44, bumpScale: 0.011 };
  }
  if (sub === 'trench' || name.includes('트렌치') || name.includes('개버딘') || name.includes('발수')) {
    return { type: 'gabardine', labelKo: '발수 코튼 개버딘 트윌', roughness: 0.50, metalness: 0.03, sheen: 0.44, clearcoat: 0.10, bumpScale: 0.014 };
  }
  if (sub === 'denim' || name.includes('데님') || name.includes('청바지')) {
    return { type: 'denim', labelKo: '셀비지 인디고 데님 트윌', roughness: 0.76, metalness: 0.02, sheen: 0.25, clearcoat: 0.0, bumpScale: 0.020 };
  }
  if (sub === 'blouse' || sub === 'necktie' || name.includes('실크') || name.includes('새틴')) {
    return { type: 'silk', labelKo: '실크 크레이프 드레이프', roughness: 0.28, metalness: 0.05, sheen: 0.85, clearcoat: 0.16, bumpScale: 0.006 };
  }
  if (sub === 'coat' || sub === 'blazer' || sub === 'slacks' || sub === 'beret' || sub === 'bucket_hat' || sub === 'scarf' || name.includes('울') || name.includes('캐시미어')) {
    return { type: 'wool', labelKo: '버진 울 · 캐시미어 브러시드', roughness: 0.66, metalness: 0.02, sheen: 0.68, clearcoat: 0.03, bumpScale: 0.016 };
  }
  if (sub === 'knit' || sub === 'cardigan' || sub === 'beanie' || sub === 'muffler' || sub === 'gloves' || cat === 'socks') {
    return { type: 'knit', labelKo: '파인 메리노 골지 니트', roughness: 0.72, metalness: 0.01, sheen: 0.60, clearcoat: 0.0, bumpScale: 0.022 };
  }
  return { type: 'cotton', labelKo: '수피마 코튼 포플린', roughness: 0.60, metalness: 0.02, sheen: 0.36, clearcoat: 0.03, bumpScale: 0.010 };
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

// Bone indices in our 21-bone GPU Skeleton
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
  JIGGLE_NECK: 19,
  JIGGLE_HEM: 20,
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
  { idx: BONE.JIGGLE_NECK, name: 'jiggleNeck', parent: BONE.SPINE1, posKey: null, fallback: [0, 1.34, 0.08] },
  { idx: BONE.JIGGLE_HEM, name: 'jiggleHem', parent: BONE.PELVIS, posKey: null, fallback: [0, 0.90, 0.0] },
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
    const top = cand.slice(0, 3);
    let sum = top.reduce((acc, it) => acc + it.score, 0) || 1;
    for (let k = 0; k < top.length; k++) {
      top[k].w = top[k].score / sum;
    }

    // Inject GPU Jiggle Bone weight on slot 3 for soft cloth / hem / crossbody items!
    let jiggleBone = -1;
    let jiggleW = 0;
    if (physicsKey === 'soft_jiggle_muffler' || physicsKey === 'soft_jiggle_tie') {
      jiggleBone = BONE.JIGGLE_NECK;
      // Front chest hanging panels sway smoothly while neck collar stays anchored
      const downFactor = smoothstep(1.34, 1.04, y);
      const frontFactor = smoothstep(0.02, 0.08, z);
      jiggleW = downFactor * (0.35 + 0.65 * frontFactor) * 0.78;
    } else if (physicsKey === 'hem_sway_coat' || physicsKey === 'hem_sway_skirt') {
      jiggleBone = BONE.JIGGLE_HEM;
      jiggleW = smoothstep(0.95, 0.50, y) * 0.42;
    } else if (physicsKey === 'pendulum_crossbody') {
      jiggleBone = BONE.JIGGLE_HEM;
      // Bag body at hip bounces while upper strap stays flush on torso
      jiggleW = smoothstep(1.02, 0.78, y) * smoothstep(0.10, 0.20, x) * 0.65;
    }

    const remain = 1.0 - jiggleW;
    for (let k = 0; k < 3; k++) {
      if (top[k]) {
        skinIndex[i * 4 + k] = top[k].bone;
        skinWeight[i * 4 + k] = top[k].w * remain;
      }
    }
    if (jiggleBone >= 0 && jiggleW > 0.001) {
      skinIndex[i * 4 + 3] = jiggleBone;
      skinWeight[i * 4 + 3] = jiggleW;
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

function loadCachedTexture(url, { srgb = false, repeat = 1 } = {}) {
  if (externalTexCache.has(url)) return externalTexCache.get(url);
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
  externalTexCache.set(url, tex);
  return tex;
}

function getProceduralFabricBumpMap(fabricType = 'knit') {
  if (bumpTextureCache.has(fabricType)) {
    return bumpTextureCache.get(fabricType);
  }
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
  bumpTextureCache.set(fabricType, tex);
  return tex;
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
  if (!hiddenVertMask) {
    if (geom.index.array.length !== full.length) {
      geom.setIndex(new THREE.BufferAttribute(full.slice(), 1));
    }
    return;
  }
  const kept = [];
  for (let i = 0; i < full.length; i += 3) {
    const a = full[i];
    const b = full[i + 1];
    const c = full[i + 2];
    if (hiddenVertMask[a] && hiddenVertMask[b] && hiddenVertMask[c]) continue;
    kept.push(a, b, c);
  }
  const ArrType = full.constructor;
  geom.setIndex(new THREE.BufferAttribute(new ArrType(kept), 1));
}

function maskInnerTopUnderOuter(topMesh, hasOuter) {
  const geom = topMesh.geometry;
  const full = geom.userData.fullIndexArray;
  if (!full || !geom.index) return;
  if (!hasOuter) {
    applyTriangleMask(topMesh, null);
    return;
  }
  const pos = geom.attributes.position;
  const hide = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = readMeterCoord(geom, i);
    const inFrontOpening = Math.abs(x) < 0.095 && y > 1.06 && z > 0.02;
    const inCollar = Math.abs(x) < 0.105 && y > 1.33;
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

function applyMorphsToMesh(mesh, weights) {
  const dict = mesh.morphTargetDictionary;
  const inf = mesh.morphTargetInfluences;
  if (!dict || !inf) return;
  for (let i = 0; i < inf.length; i++) inf[i] = 0;
  for (const [name, val] of Object.entries(weights)) {
    const idx = dict[name];
    if (idx !== undefined) {
      inf[idx] = val;
    }
  }
}

export function resolveGarmentIdForItem(slotKey, item) {
  if (!item) return null;
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

function createSkinMaterial(skinHex) {
  const baseColor = new THREE.Color(skinHex);
  const skinBump = getProceduralFabricBumpMap('skin');
  return new THREE.MeshPhysicalMaterial({
    color: baseColor,
    roughness: 0.40,
    metalness: 0.01,
    clearcoat: 0.14,
    clearcoatRoughness: 0.42,
    sheen: 0.48,
    sheenRoughness: 0.56,
    sheenColor: baseColor.clone().lerp(new THREE.Color('#fff2ec'), 0.44),
    bumpMap: skinBump,
    bumpScale: 0.0018,
  });
}

function createGarmentMaterial(item, gid, slotKey, isHighlighted, hasMultiZones = false) {
  const hex = item?.color_hex || '#2E3540';
  const spec = inferFabricMaterialSpec(item || { category: slotKey });
  const bump = getProceduralFabricBumpMap(spec.type);
  const baseColor = new THREE.Color(hex);
  const emissiveColor = isHighlighted
    ? baseColor.clone().lerp(new THREE.Color('#f3e6cf'), 0.55)
    : new THREE.Color('#000000');

  const uvTex = GARMENT_UV_TEXTURE_MAP[gid];
  const matProps = {
    color: baseColor,
    roughness: spec.roughness,
    metalness: spec.metalness,
    sheen: spec.sheen,
    sheenRoughness: 0.52,
    sheenColor: baseColor.clone().offsetHSL(0, 0, 0.14),
    clearcoat: spec.clearcoat,
    clearcoatRoughness: 0.34,
    bumpMap: bump,
    bumpScale: spec.bumpScale,
    emissive: emissiveColor,
    emissiveIntensity: isHighlighted ? 0.22 : 0.0,
    side: THREE.DoubleSide,
  };

  if (uvTex?.detail) {
    matProps.map = loadCachedTexture(`${TEXTURE_BASE}/${uvTex.detail}`, { srgb: true, repeat: 1 });
  }
  if (uvTex?.normal) {
    matProps.normalMap = loadCachedTexture(`${TEXTURE_BASE}/${uvTex.normal}`, { repeat: 1 });
    const ns = uvTex.normalScale || 0.5;
    matProps.normalScale = new THREE.Vector2(ns, ns);
  }

  const primaryMat = new THREE.MeshPhysicalMaterial(matProps);
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
    emissiveIntensity: isHighlighted ? 0.16 : 0.0,
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

function disposeMaterialOrArray(mat) {
  if (!mat) return;
  if (Array.isArray(mat)) {
    for (const m of mat) m?.dispose?.();
  } else {
    mat.dispose?.();
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

function inferBodySlotFromPoint(localY, localX) {
  if (localY > 1.50) return 'headwear';
  if (localY > 1.36) return 'neckwear';
  if (Math.abs(localX) > 0.25 && localY > 0.85 && localY < 1.20) return 'gloves';
  if (localY > 0.94) return 'top';
  if (localY > 0.42) return 'bottom';
  if (localY > 0.14) return 'socks';
  return 'shoes';
}

/**
 * Game-Quality Skinned GLB Mannequin WebGL Engine
 * - 21-Bone GPU Skeleton (`idle`, `walk`, `wave`, `umbrella`, `pose_hands`)
 * - 28 Real-Time Anthropometric Morph Targets
 * - 60fps Damped Pendulum & Soft-Cloth Jiggle Physics (`briefcase`, `tote`, `scarf`, `tie`, `coat`, `skirt`)
 * - Multi-Zone PBR Hardware Materials (`COLOR_0`) + Real MakeHuman Baked Normal/Detail Maps
 */
export class Mannequin3DWebGLEngine {
  constructor(canvas) {
    this.canvas = canvas;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.07;

    this.scene = new THREE.Scene();

    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envScene = new RoomEnvironment();
      this.envMap = pmrem.fromScene(envScene, 0.04).texture;
      this.scene.environment = this.envMap;
      this.scene.environmentIntensity = 0.58;
      envScene.dispose?.();
      pmrem.dispose();
    } catch {
      // Fallback on software WebGL
    }

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 30);
    this.camera.position.set(0, 1.00, 3.62);

    this.rootGroup = new THREE.Group();
    this.characterGroup = new THREE.Group();
    this.pedestalGroup = new THREE.Group();
    this.rootGroup.add(this.pedestalGroup);
    this.rootGroup.add(this.characterGroup);
    this.scene.add(this.rootGroup);

    // Build shared 21-bone humanoid skeleton + handheld prop sockets
    const rig = createHumanoidSkeleton(DEFAULT_JOINTS);
    this.skeleton = rig.skeleton;
    this.bones = rig.bones;
    this.characterGroup.add(rig.rootBone);

    this.leftHandSocket = new THREE.Group();
    this.characterGroup.add(this.leftHandSocket);

    this.rightHandSocket = new THREE.Group();
    this.characterGroup.add(this.rightHandSocket);

    this.umbrellaProp = buildClassicUmbrellaGroup();
    this.rightHandSocket.add(this.umbrellaProp);

    this.rainStreaks = buildRainStreaksGroup();
    this.rootGroup.add(this.rainStreaks);

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

    // Motion & real-time jiggle physics state
    this.motionMode = 'auto';
    this.weatherInfo = null;
    this.clockStart = performance.now() * 0.001;
    this.lastFrameTime = this.clockStart;
    this.poseBlend = { walk: 0, wave: 0, umbrella: 0, hands: 0 };

    // 2-DOF spring-damper oscillators:
    // 1. Handheld bag pendulum (pitch X along stride, roll Z lateral)
    this.bagSpring = {
      pitch: 0,
      velPitch: 0,
      roll: 0,
      velRoll: 0,
      prevHandPos: new THREE.Vector3(0.45, 0.98, 0.18),
      prevHandVel: new THREE.Vector3(),
      preset: GARMENT_3D_PHYSICS_PRESETS.pendulum_briefcase,
    };
    // 2. Neckwear soft cloth jiggle (muffler / tie)
    this.neckJiggle = { rx: 0, vrx: 0, rz: 0, vrz: 0 };
    // 3. Coat / skirt hem sway jiggle
    this.hemJiggle = { rx: 0, vrx: 0, rz: 0, vrz: 0 };

    this._tmpVecA = new THREE.Vector3();
    this._tmpVecB = new THREE.Vector3();
    this._invCharMat = new THREE.Matrix4();

    this._setupLightsAndPedestal();
    this._startLoop();
    this._initAssets();
  }

  _initAssets() {
    loadBodyTemplate()
      .then((tpl) => {
        if (this.disposed) return;
        const geom = tpl.geometry.clone();
        geom.userData.fullIndexArray = tpl.geometry.userData.fullIndexArray?.slice();
        const skinHex = resolveSkinHex(this.lastState.profile || {});
        const mesh = new THREE.SkinnedMesh(geom, createSkinMaterial(skinHex));
        applyNodeTransform(mesh, tpl);
        mesh.bind(this.skeleton, new THREE.Matrix4());
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.morphTargetDictionary = { ...tpl.morphTargetDictionary };
        mesh.morphTargetInfluences = tpl.morphTargetInfluences ? [...tpl.morphTargetInfluences] : [];
        mesh.userData.isBody = true;
        this.bodyMesh = mesh;
        this.characterGroup.add(mesh);
        this.updateScene(this.lastState);
      })
      .catch(() => {});
  }

  _setupLightsAndPedestal() {
    const hemi = new THREE.HemisphereLight(0xfbf8f2, 0xd8cfc0, 0.88);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfffaf2, 1.9);
    keyLight.position.set(1.8, 2.95, 2.55);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.radius = 5;
    this.scene.add(keyLight);

    const coolRim = new THREE.PointLight(0xe8eef6, 1.28, 5.5);
    coolRim.position.set(-1.65, 1.68, -1.28);
    this.scene.add(coolRim);

    const warmRim = new THREE.PointLight(0xf3dcc0, 1.12, 5.5);
    warmRim.position.set(1.65, 1.15, -1.35);
    this.scene.add(warmRim);

    const frontFill = new THREE.DirectionalLight(0xf6f2ea, 0.68);
    frontFill.position.set(-0.75, 1.42, 2.45);
    this.scene.add(frontFill);

    const baseDisk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.64, 0.04, 56),
      new THREE.MeshPhysicalMaterial({
        color: 0xebe4d8,
        metalness: 0.0,
        roughness: 0.58,
        clearcoat: 0.28,
        clearcoatRoughness: 0.45,
      })
    );
    baseDisk.position.y = -0.02;
    baseDisk.receiveShadow = true;
    this.pedestalGroup.add(baseDisk);

    const ringOuter = new THREE.Mesh(
      new THREE.RingGeometry(0.555, 0.565, 64),
      new THREE.MeshBasicMaterial({
        color: 0x1c1917,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.22,
      })
    );
    ringOuter.rotation.x = -Math.PI / 2;
    ringOuter.position.y = 0.002;
    this.pedestalGroup.add(ringOuter);

    const ringInner = new THREE.Mesh(
      new THREE.RingGeometry(0.415, 0.421, 64),
      new THREE.MeshBasicMaterial({
        color: 0xc8b294,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.62,
      })
    );
    ringInner.rotation.x = -Math.PI / 2;
    ringInner.position.y = 0.003;
    this.pedestalGroup.add(ringInner);

    const scanRingGeom = new THREE.RingGeometry(0.34, 0.4, 48);
    this.scanRingMat = new THREE.MeshBasicMaterial({
      color: 0xc8b294,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
    });
    this.scanRingMesh = new THREE.Mesh(scanRingGeom, this.scanRingMat);
    this.scanRingMesh.rotation.x = -Math.PI / 2;
    this.scanRingMesh.position.y = 0.9;
    this.rootGroup.add(this.scanRingMesh);
  }

  triggerEquipScanPulse() {
    this.scanProgress = 0.0;
  }

  setRotationDeg(deg) {
    this.targetYaw = ((Number(deg) || 0) * Math.PI) / 180;
  }

  setMotionMode(mode = 'auto') {
    this.motionMode = mode || 'auto';
  }

  setWeatherInfo(weather = null) {
    this.weatherInfo = weather;
  }

  setParallax(nx, ny) {
    this.parallaxX = Math.max(-1, Math.min(1, Number(nx) || 0));
    this.parallaxY = Math.max(-1, Math.min(1, Number(ny) || 0));
  }

  setFocusSlot(slotKey = 'all') {
    this.focusSlot = SLOT_CAMERA_TARGETS[slotKey] ? slotKey : 'all';
  }

  resize(width, height) {
    const w = Math.max(200, Math.floor(width));
    const h = Math.max(260, Math.floor(height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _getOrCreateGarmentInstance(tpl, gid) {
    if (this.garmentMeshes.has(gid)) {
      return this.garmentMeshes.get(gid);
    }
    const spec = tpl.userData.spec || {};
    const isHandSocket = spec.mount === 'hand_l' || spec.mount === 'hand_r';
    const geom = tpl.geometry.clone();
    geom.userData.fullIndexArray = tpl.geometry.userData.fullIndexArray?.slice();
    if (tpl.geometry.userData.zoneGroups) {
      geom.userData.zoneGroups = tpl.geometry.userData.zoneGroups;
      geom.clearGroups();
      for (const g of geom.userData.zoneGroups) {
        geom.addGroup(g.start, g.count, g.materialIndex);
      }
    }

    let mesh;
    if (isHandSocket) {
      mesh = new THREE.Mesh(geom, new THREE.MeshPhysicalMaterial());
      applyNodeTransform(mesh, tpl);
      this.leftHandSocket.add(mesh);
    } else {
      mesh = new THREE.SkinnedMesh(geom, new THREE.MeshPhysicalMaterial());
      applyNodeTransform(mesh, tpl);
      mesh.bind(this.skeleton, new THREE.Matrix4());
      this.characterGroup.add(mesh);
    }

    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.morphTargetDictionary = tpl.morphTargetDictionary ? { ...tpl.morphTargetDictionary } : undefined;
    mesh.morphTargetInfluences = tpl.morphTargetInfluences ? [...tpl.morphTargetInfluences] : undefined;
    mesh.userData.gid = gid;
    mesh.userData.spec = spec;
    mesh.userData.hasMultiZones = Boolean(tpl.userData.hasMultiZones);
    mesh.userData.coveredBodyVerts = tpl.userData.coveredBodyVerts;
    this.garmentMeshes.set(gid, mesh);
    return mesh;
  }

  updateScene({
    profile = {},
    loadout = {},
    headMode = 'mannequin',
    selectedSlot = null,
    hoveredSlot = null,
    motionMode,
    weather,
  } = {}) {
    if (motionMode !== undefined) this.motionMode = motionMode;
    if (weather !== undefined) this.weatherInfo = weather;
    this.lastState = {
      profile,
      loadout,
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
    this.bodyMesh.material.sheenColor.set(skinHex).lerp(new THREE.Color('#ffdad0'), 0.42);
    applyMorphsToMesh(this.bodyMesh, weights);

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

    for (const mesh of this.garmentMeshes.values()) {
      mesh.visible = false;
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
      const outerEntry = active.find((d) => d.slotKey === 'outer') || null;
      const hasOuter = Boolean(outerEntry);
      const hasTopActive = active.some((d) => d.slotKey === 'top');
      const hasLongPants = active.some(
        (d) => d.slotKey === 'bottom' && (d.gid === 'bottom_slacks' || d.gid === 'bottom_denim')
      );
      const bodyVertCount = this.bodyMesh.geometry.attributes.position.count;
      let combinedBodyMask = null;

      this.interactiveMeshes = [this.bodyMesh];

      for (const { slotKey, item, gid, tpl } of active) {
        const mesh = this._getOrCreateGarmentInstance(tpl, gid);
        mesh.visible = true;
        mesh.userData.slot = slotKey;
        const isHighlighted = Boolean(slotKey && (slotKey === selectedSlot || slotKey === hoveredSlot));

        disposeMaterialOrArray(mesh.material);
        mesh.material = createGarmentMaterial(item, gid, slotKey, isHighlighted, mesh.userData.hasMultiZones);
        applyMorphsToMesh(mesh, weights);

        if (gid === 'accessory_briefcase') {
          this.bagSpring.preset = GARMENT_3D_PHYSICS_PRESETS.pendulum_briefcase;
        } else if (gid === 'accessory_tote') {
          this.bagSpring.preset = GARMENT_3D_PHYSICS_PRESETS.pendulum_tote;
        }

        if (slotKey === 'top') {
          maskInnerTopUnderOuter(mesh, hasOuter);
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

      applyTriangleMask(this.bodyMesh, combinedBodyMask);
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
    const isRainy = Boolean(
      w &&
        (w.isRainy ||
          Number(w.precipProb) >= 50 ||
          /비|소나기|우천|눈|폭우|장마|rain|shower|snow|drizzle/i.test(String(w.condition || w.summary || '')))
    );
    return isRainy ? 'umbrella' : 'idle';
  }

  _updateSkeletalMotionAndPhysics(nowSec, dt, yawVel) {
    const t = nowSec - this.clockStart;
    const mode = this._resolveEffectiveMotion();
    const blendRate = Math.min(1, dt * 6.5);

    this.poseBlend.walk += ((mode === 'walk' ? 1 : 0) - this.poseBlend.walk) * blendRate;
    this.poseBlend.wave += ((mode === 'wave' ? 1 : 0) - this.poseBlend.wave) * blendRate;
    this.poseBlend.umbrella += ((mode === 'umbrella' ? 1 : 0) - this.poseBlend.umbrella) * blendRate;
    this.poseBlend.hands += ((mode === 'pose_hands' ? 1 : 0) - this.poseBlend.hands) * blendRate;

    const wWalk = this.poseBlend.walk;
    const wWave = this.poseBlend.wave;
    const wUmb = this.poseBlend.umbrella;
    const wHands = this.poseBlend.hands;

    const b = this.bones;
    // Reset bone rotations before layering smooth procedural animation
    for (let i = 0; i <= BONE.ANKLE_R; i++) {
      b[i].rotation.set(0, 0, 0);
    }

    // 1. Default Natural Breathing & Editorial Contrapposto Life (always active at base!)
    const breath = Math.sin(t * 1.85);
    const sway = Math.sin(t * 0.72);
    const look = Math.sin(t * 0.48 + 0.7);

    // Relax stiff MakeHuman 42-deg A-pose arms smoothly down beside the silhouette (~11 deg)
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

      // Natural leg stride (negative X swings forward +Z in Three.js!)
      hipLX += -stride * 0.34 * wWalk;
      hipRX += -oppStride * 0.34 * wWalk;
      kneeLX += (0.06 + liftL * 0.46) * wWalk;
      kneeRX += (0.06 + liftR * 0.46) * wWalk;
      ankleLX += (-liftL * 0.18 + stride * 0.08) * wWalk;
      ankleRX += (-liftR * 0.18 + oppStride * 0.08) * wWalk;

      // Counter-swinging arms
      shLX += oppStride * 0.24 * wWalk;
      shRX += stride * 0.24 * wWalk;
      elLX += (-0.12 - Math.max(0, -oppStride) * 0.18) * wWalk;
      elRX += (-0.12 - Math.max(0, -stride) * 0.18) * wWalk;
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

    // 4. Weather Umbrella Hold Layer (`umbrella`) — right hand holds walnut grip comfortably in front of chest
    if (wUmb > 0.005) {
      shRX = THREE.MathUtils.lerp(shRX, -0.36, wUmb);
      shRY = THREE.MathUtils.lerp(shRY, 0.16, wUmb);
      shRZ = THREE.MathUtils.lerp(shRZ, 0.48, wUmb);
      elRX = THREE.MathUtils.lerp(elRX, -0.82 + breath * 0.02, wUmb);
      elRY = THREE.MathUtils.lerp(elRY, 0.38, wUmb);
      elRZ = THREE.MathUtils.lerp(elRZ, 0.22, wUmb);
    }

    // 5. Hands / Gloves Inspection Pose (`pose_hands`) — presents BOTH hands side-by-side at x = ±0.145m, y = 1.12m, z = +0.32m!
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

    // 6. Update Soft-Cloth Jiggle Bones (`JIGGLE_NECK` & `JIGGLE_HEM`) via Spring-Damper Physics
    const windWave = Math.sin(t * 2.1) * 0.4 + Math.sin(t * 3.7) * 0.25;
    const walkImpulseZ = wWalk * Math.cos(t * 3.8) * 1.1;
    const walkImpulseX = wWalk * Math.abs(Math.sin(t * 3.8)) * 0.55;
    const spinImpulseZ = Math.max(-2.5, Math.min(2.5, yawVel)) * 0.65;

    // Neckwear jiggle (muffler panels & fringe / silk necktie)
    {
      const k = 26.0;
      const c = 5.2;
      const targetRx = -(0.02 + walkImpulseX * 0.06 + Math.max(0, windWave) * 0.045);
      const targetRz = spinImpulseZ * 0.09 + walkImpulseZ * 0.045 + windWave * 0.032;
      this.neckJiggle.vrx += ((targetRx - this.neckJiggle.rx) * k - this.neckJiggle.vrx * c) * dt;
      this.neckJiggle.vrz += ((targetRz - this.neckJiggle.rz) * k - this.neckJiggle.vrz * c) * dt;
      this.neckJiggle.rx = Math.min(0.01, Math.max(-0.22, this.neckJiggle.rx + this.neckJiggle.vrx * dt));
      this.neckJiggle.rz = Math.min(0.20, Math.max(-0.20, this.neckJiggle.rz + this.neckJiggle.vrz * dt));
      b[BONE.JIGGLE_NECK].rotation.set(this.neckJiggle.rx, 0, this.neckJiggle.rz);
    }

    // Coat / Skirt / Crossbody hem jiggle
    {
      const k = 28.0;
      const c = 5.8;
      const targetRx = walkImpulseX * 0.04 + windWave * 0.022;
      const targetRz = spinImpulseZ * 0.11 + walkImpulseZ * 0.055 + windWave * 0.025;
      this.hemJiggle.vrx += ((targetRx - this.hemJiggle.rx) * k - this.hemJiggle.vrx * c) * dt;
      this.hemJiggle.vrz += ((targetRz - this.hemJiggle.rz) * k - this.hemJiggle.vrz * c) * dt;
      this.hemJiggle.rx = Math.min(0.16, Math.max(-0.16, this.hemJiggle.rx + this.hemJiggle.vrx * dt));
      this.hemJiggle.rz = Math.min(0.18, Math.max(-0.18, this.hemJiggle.rz + this.hemJiggle.vrz * dt));
      b[BONE.JIGGLE_HEM].rotation.set(this.hemJiggle.rx, 0, this.hemJiggle.rz);
    }

    this.characterGroup.updateMatrixWorld(true);
    this._invCharMat.copy(this.characterGroup.matrixWorld).invert();

    // 7. Update Left-Hand Pendulum Socket (`accessory_briefcase` / `accessory_tote`)
    this._tmpVecA.setFromMatrixPosition(b[BONE.HAND_L].matrixWorld).applyMatrix4(this._invCharMat);
    const handLocalL = this._tmpVecA;
    this.leftHandSocket.position.set(handLocalL.x + 0.028, handLocalL.y - 0.028, handLocalL.z + 0.006);

    const invDt = 1.0 / Math.max(0.008, dt);
    const vx = (handLocalL.x - this.bagSpring.prevHandPos.x) * invDt;
    const vz = (handLocalL.z - this.bagSpring.prevHandPos.z) * invDt;
    const ax = Math.max(-8, Math.min(8, (vx - this.bagSpring.prevHandVel.x) * invDt));
    const az = Math.max(-8, Math.min(8, (vz - this.bagSpring.prevHandVel.z) * invDt));
    this.bagSpring.prevHandPos.copy(handLocalL);
    this.bagSpring.prevHandVel.set(vx, 0, vz);

    const bagP = this.bagSpring.preset || GARMENT_3D_PHYSICS_PRESETS.pendulum_briefcase;
    const pitchTarget = Math.max(-bagP.maxPitchRad, Math.min(bagP.maxPitchRad, -az * 0.032 + Math.sin(t * 1.9) * 0.018));
    const rollTarget = Math.max(
      -0.02,
      Math.min(bagP.maxRollRad, bagP.outwardRestRollRad - ax * 0.022 + Math.abs(yawVel) * 0.06)
    );
    this.bagSpring.velPitch += ((pitchTarget - this.bagSpring.pitch) * bagP.stiffness - this.bagSpring.velPitch * bagP.damping) * dt;
    this.bagSpring.velRoll += ((rollTarget - this.bagSpring.roll) * bagP.stiffness - this.bagSpring.velRoll * bagP.damping) * dt;
    this.bagSpring.pitch = Math.max(-bagP.maxPitchRad, Math.min(bagP.maxPitchRad, this.bagSpring.pitch + this.bagSpring.velPitch * dt));
    this.bagSpring.roll = Math.max(0.03, Math.min(bagP.maxRollRad + 0.08, this.bagSpring.roll + this.bagSpring.velRoll * dt));
    this.leftHandSocket.rotation.set(this.bagSpring.pitch, 0, this.bagSpring.roll);

    // 8. Update Right-Hand Weather Umbrella Socket + Raindrop Streaks
    const showUmbrella = wUmb > 0.18;
    this.umbrellaProp.visible = showUmbrella;
    this.rainStreaks.visible = showUmbrella;
    if (showUmbrella) {
      this._tmpVecB.setFromMatrixPosition(b[BONE.HAND_R].matrixWorld).applyMatrix4(this._invCharMat);
      this.rightHandSocket.position.set(this._tmpVecB.x + 0.015, this._tmpVecB.y - 0.012, this._tmpVecB.z + 0.022);
      // Tilt shaft inward (-Z rot on right side) & back (-X rot) so canopy centers directly above head
      this.rightHandSocket.rotation.set(-0.28 + Math.sin(t * 1.4) * 0.015, 0, -0.24);

      const seeds = this.rainStreaks.userData.seeds;
      const posAttr = this.rainStreaks.userData.lines.geometry.attributes.position;
      for (let i = 0; i < seeds.length; i++) {
        seeds[i].y -= seeds[i].speed * dt;
        if (seeds[i].y < 0.04) seeds[i].y = 2.18;
        posAttr.setXYZ(i * 2, seeds[i].x, seeds[i].y, seeds[i].z);
        posAttr.setXYZ(i * 2 + 1, seeds[i].x - 0.008, seeds[i].y - 0.095, seeds[i].z);
      }
      posAttr.needsUpdate = true;
    }
  }

  _startLoop() {
    const animate = () => {
      if (this.disposed) return;
      this.rafId = requestAnimationFrame(animate);

      const nowSec = performance.now() * 0.001;
      const dt = Math.min(0.05, Math.max(0.004, nowSec - this.lastFrameTime));
      this.lastFrameTime = nowSec;

      const desiredYaw = this.targetYaw + this.parallaxX * 0.18;
      this.prevYaw = this.currentYaw;
      this.currentYaw += (desiredYaw - this.currentYaw) * 0.12;
      const yawVel = (this.currentYaw - this.prevYaw) / dt;

      this.characterGroup.rotation.y = this.currentYaw;
      this.characterGroup.rotation.x = this.parallaxY * 0.04;

      this._updateSkeletalMotionAndPhysics(nowSec, dt, yawVel);

      // Context-aware camera target (e.g. umbrella canopy headroom, glasses/watch/briefcase focus)
      let targetSpec = SLOT_CAMERA_TARGETS[this.focusSlot] || SLOT_CAMERA_TARGETS.all;
      if (this.focusSlot === 'all' && this._resolveEffectiveMotion() === 'umbrella') {
        targetSpec = { x: 0.0, y: 1.08, dist: 4.18 };
      } else if (this.focusSlot === 'accessory') {
        if (this.activeAccessorySub === 'accessory_glasses') {
          targetSpec = { x: 0.0, y: 1.54, dist: 1.06 };
        } else if (this.activeAccessorySub === 'accessory_watch') {
          targetSpec = { x: 0.0, y: 1.07, dist: 1.42 };
        } else if (this.activeAccessorySub === 'accessory_briefcase' || this.activeAccessorySub === 'accessory_tote') {
          targetSpec = { x: 0.12, y: 0.72, dist: 1.88 };
        }
      }

      this.camTargetX += ((targetSpec.x || 0) - this.camTargetX) * 0.10;
      this.camTargetY += (targetSpec.y - this.camTargetY) * 0.10;
      this.camDist += (targetSpec.dist - this.camDist) * 0.10;

      this.camera.position.set(this.camTargetX + this.parallaxX * 0.08, this.camTargetY + 0.04, this.camDist);
      this.camera.lookAt(this.camTargetX, this.camTargetY - 0.02, 0);

      if (this.scanProgress < 1.0) {
        this.scanProgress = Math.min(1.0, this.scanProgress + 0.028);
        this.scanRingMesh.position.y = 1.82 - this.scanProgress * 1.78;
        this.scanRingMat.opacity = Math.sin(this.scanProgress * Math.PI) * 0.85;
      } else {
        this.scanRingMat.opacity = 0.0;
      }

      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  dispose() {
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    for (const mesh of this.garmentMeshes.values()) {
      mesh.geometry?.dispose?.();
      disposeMaterialOrArray(mesh.material);
    }
    this.bodyMesh?.geometry?.dispose?.();
    disposeMaterialOrArray(this.bodyMesh?.material);
    this.envMap?.dispose?.();
    this.renderer.dispose();
  }
}

// -----------------------------------------------------------------------------
// Shared Offscreen 3D Renderer for Mini Body-Shape Cards & Modal Live Preview
// -----------------------------------------------------------------------------
let sharedPreviewEngine = null;

function notifyPreviewListeners() {
  const callbacks = [...previewListeners.values()];
  previewListeners.clear();
  for (const fn of callbacks) {
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
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 360;
    offCanvas.height = 500;
    const renderer = new THREE.WebGLRenderer({
      canvas: offCanvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(33, 360 / 500, 0.1, 20);

    const hemi = new THREE.HemisphereLight(0xfbf8f2, 0xd8cfc0, 1.05);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfffaf2, 2.0);
    key.position.set(1.6, 2.6, 2.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xe8eef6, 1.1);
    rim.position.set(-1.5, 1.6, -1.4);
    scene.add(rim);

    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.50, 0.03, 40),
      new THREE.MeshStandardMaterial({ color: 0xe8e0d2, roughness: 0.7 })
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

    sharedPreviewEngine = {
      offCanvas,
      renderer,
      scene,
      camera,
      group,
      skeleton: rig.skeleton,
      bodyMesh: null,
      briefsMesh: null,
      topMesh: null,
    };
    return sharedPreviewEngine;
  } catch {
    return null;
  }
}

export function render3DMannequinScene(canvas, options = {}) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const width = canvas.width || 240;
  const height = canvas.height || 340;
  const {
    profile = {},
    rotationDeg = 0,
    compact = false,
    darkHud = false,
  } = options;

  if (
    !bodyTemplateMesh ||
    !garmentTemplateCache.has('underwear_briefs') ||
    !garmentTemplateCache.has('underwear_top')
  ) {
    previewListeners.set(canvas, () => {
      render3DMannequinScene(canvas, options);
    });
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
    if (darkHud) {
      bgGrad.addColorStop(0, 'rgba(30, 27, 24, 0.52)');
      bgGrad.addColorStop(1, 'rgba(18, 16, 14, 0.0)');
    } else {
      bgGrad.addColorStop(0, 'rgba(255, 252, 246, 0.92)');
      bgGrad.addColorStop(1, 'rgba(235, 228, 216, 0.25)');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);
  }

  const eng = bodyTemplateMesh ? getSharedPreviewEngine() : null;
  if (eng && bodyTemplateMesh) {
    if (!eng.bodyMesh) {
      const geom = bodyTemplateMesh.geometry.clone();
      eng.bodyMesh = new THREE.SkinnedMesh(geom, createSkinMaterial(resolveSkinHex(profile)));
      applyNodeTransform(eng.bodyMesh, bodyTemplateMesh);
      eng.bodyMesh.bind(eng.skeleton, new THREE.Matrix4());
      eng.bodyMesh.frustumCulled = false;
      eng.bodyMesh.morphTargetDictionary = { ...bodyTemplateMesh.morphTargetDictionary };
      eng.bodyMesh.morphTargetInfluences = [...bodyTemplateMesh.morphTargetInfluences];
      eng.group.add(eng.bodyMesh);
    }
    if (!eng.briefsMesh && garmentTemplateCache.has('underwear_briefs')) {
      const tpl = garmentTemplateCache.get('underwear_briefs');
      eng.briefsMesh = new THREE.SkinnedMesh(
        tpl.geometry.clone(),
        new THREE.MeshPhysicalMaterial({ color: 0x2c2623, roughness: 0.68, sheen: 0.3 })
      );
      applyNodeTransform(eng.briefsMesh, tpl);
      eng.briefsMesh.bind(eng.skeleton, new THREE.Matrix4());
      eng.briefsMesh.frustumCulled = false;
      eng.briefsMesh.morphTargetDictionary = { ...tpl.morphTargetDictionary };
      eng.briefsMesh.morphTargetInfluences = [...tpl.morphTargetInfluences];
      eng.group.add(eng.briefsMesh);
    }
    if (!eng.topMesh && garmentTemplateCache.has('underwear_top')) {
      const tpl = garmentTemplateCache.get('underwear_top');
      eng.topMesh = new THREE.SkinnedMesh(
        tpl.geometry.clone(),
        new THREE.MeshPhysicalMaterial({ color: 0x2c2623, roughness: 0.68, sheen: 0.3 })
      );
      applyNodeTransform(eng.topMesh, tpl);
      eng.topMesh.bind(eng.skeleton, new THREE.Matrix4());
      eng.topMesh.frustumCulled = false;
      eng.topMesh.morphTargetDictionary = { ...tpl.morphTargetDictionary };
      eng.topMesh.morphTargetInfluences = [...tpl.morphTargetInfluences];
      eng.group.add(eng.topMesh);
    }

    const { anat, weights } = computeMorphTargetWeights(profile);
    const skinHex = resolveSkinHex(profile);
    eng.bodyMesh.material.color.set(skinHex);
    eng.bodyMesh.material.sheenColor.set(skinHex).lerp(new THREE.Color('#fff5f0'), 0.38);
    applyMorphsToMesh(eng.bodyMesh, weights);

    const briefsHex = profile.mannequinBriefsColorHex || '#2c2623';
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
