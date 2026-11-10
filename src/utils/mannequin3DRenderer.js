import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { resolveAnatomicalProfile } from './bodyAnthropometrics.js';

export const SLOT_CAMERA_TARGETS = {
  all: { y: 0.90, dist: 3.25, fov: 35, labelKo: '전신 풀샷 (Full Body)' },
  headwear: { y: 1.62, dist: 1.12, fov: 30, labelKo: '헤드웨어 줌 (Head)' },
  neckwear: { y: 1.42, dist: 1.22, fov: 32, labelKo: '네크웨어 줌 (Neck)' },
  outer: { y: 1.18, dist: 1.68, fov: 34, labelKo: '아우터 줌 (Outer)' },
  top: { y: 1.20, dist: 1.58, fov: 34, labelKo: '상의 줌 (Top)' },
  bottom: { y: 0.66, dist: 1.78, fov: 34, labelKo: '하의 줌 (Bottom)' },
  dress: { y: 0.98, dist: 2.10, fov: 35, labelKo: '원피스 줌 (Dress)' },
  gloves: { y: 0.92, dist: 1.55, fov: 32, labelKo: '핸드/장갑 줌 (Gloves)' },
  underwear: { y: 1.04, dist: 1.65, fov: 34, labelKo: '이너웨어 줌 (Inner)' },
  socks: { y: 0.22, dist: 1.32, fov: 30, labelKo: '레그/양말 줌 (Socks)' },
  shoes: { y: 0.14, dist: 1.28, fov: 30, labelKo: '풋웨어 줌 (Shoes)' },
  accessory: { y: 1.02, dist: 1.75, fov: 34, labelKo: '액세서리 줌 (Accessory)' },
};

const PERSONAL_COLOR_DEFAULT_SKIN = {
  spring_warm: '#EED4BE',
  summer_cool: '#EBD3CE',
  autumn_warm: '#DFC1A6',
  winter_cool: '#E5CCC8',
};

export function resolveSkinHex(profile = {}) {
  if (profile.skinToneHex || profile.skin_tone_hex) {
    return profile.skinToneHex || profile.skin_tone_hex;
  }
  const pc = profile.personalColor || profile.personal_color || 'autumn_warm';
  return PERSONAL_COLOR_DEFAULT_SKIN[pc] || '#E4C8B0';
}

export function inferFabricMaterialSpec(item = {}) {
  const sub = String(item.subcategory || '').toLowerCase();
  const cat = String(item.category || '').toLowerCase();
  const name = String(item.name || '');

  if (sub === 'padding' || name.includes('패딩') || name.includes('다운') || name.includes('퀼팅')) {
    return { type: 'padding', labelKo: '구스다운 퀼팅 나일론', roughness: 0.38, metalness: 0.06, sheen: 0.35, clearcoat: 0.18, bumpScale: 0.028 };
  }
  if (
    sub === 'loafers' ||
    sub === 'boots' ||
    sub === 'heels' ||
    sub === 'sneakers' ||
    sub === 'leather_gloves' ||
    sub === 'bag' ||
    sub === 'belt' ||
    sub === 'watch' ||
    sub === 'glasses' ||
    name.includes('레더') ||
    name.includes('가죽')
  ) {
    return { type: 'leather', labelKo: '이탈리안 풀그레인 레더', roughness: 0.28, metalness: 0.10, sheen: 0.22, clearcoat: 0.48, bumpScale: 0.010 };
  }
  if (sub === 'trench' || name.includes('트렌치') || name.includes('개버딘') || name.includes('발수')) {
    return { type: 'gabardine', labelKo: '발수 코튼 개버딘 트윌', roughness: 0.52, metalness: 0.03, sheen: 0.42, clearcoat: 0.10, bumpScale: 0.016 };
  }
  if (sub === 'denim' || name.includes('데님') || name.includes('청바지')) {
    return { type: 'denim', labelKo: '셀비지 인디고 데님 트윌', roughness: 0.78, metalness: 0.02, sheen: 0.25, clearcoat: 0.0, bumpScale: 0.024 };
  }
  if (sub === 'blouse' || sub === 'necktie' || name.includes('실크') || name.includes('새틴')) {
    return { type: 'silk', labelKo: '실크 크레이프 드레이프', roughness: 0.28, metalness: 0.05, sheen: 0.85, clearcoat: 0.16, bumpScale: 0.006 };
  }
  if (sub === 'coat' || sub === 'blazer' || sub === 'slacks' || sub === 'beret' || sub === 'bucket_hat' || sub === 'scarf' || name.includes('울') || name.includes('캐시미어')) {
    return { type: 'wool', labelKo: '버진 울 · 캐시미어 브러시드', roughness: 0.68, metalness: 0.02, sheen: 0.65, clearcoat: 0.02, bumpScale: 0.018 };
  }
  if (sub === 'knit' || sub === 'cardigan' || sub === 'beanie' || sub === 'muffler' || sub === 'gloves' || cat === 'socks') {
    return { type: 'knit', labelKo: '파인 메리노 골지 니트', roughness: 0.74, metalness: 0.01, sheen: 0.58, clearcoat: 0.0, bumpScale: 0.026 };
  }
  return { type: 'cotton', labelKo: '수피마 코튼 포플린', roughness: 0.62, metalness: 0.02, sheen: 0.35, clearcoat: 0.03, bumpScale: 0.012 };
}

// -----------------------------------------------------------------------------
// Shared GLB / Texture Asset Cache (loaded once, reused across views & modal)
// -----------------------------------------------------------------------------
const MODEL_BASE = '/models/mannequin';
const TEXTURE_BASE = '/textures/mannequin';

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
const previewListeners = new Set();

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
        const pore = Math.sin(x * 1.3) * Math.cos(y * 1.3) * 9 + Math.sin(x * 0.4 + y * 0.5) * 6;
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
  const rep = fabricType === 'padding' ? 2 : fabricType === 'skin' ? 14 : 6;
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
    ]).then(([, gltf]) => {
      bodyTemplateMesh = extractFirstMesh(gltf);
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
  if (!full || !geom.index) return;
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

  // Continuous BMI / body-fat modulation on top of preset
  const refBmi = anat.gender === 'female' ? 20.5 : 22.0;
  const bmiDelta = (anat.bmi - refBmi) / 10.0;
  setBipolar('weight_up', 'weight_down', bmiDelta, 0.65, 0.65, 0.95);

  // Continuous 3-size & anatomical morphs
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
    if (sub === 'sweatshirt' || name.includes('맨투맨') || name.includes('후드') || name.includes('스웨트')) return 'top_sweatshirt';
    if (sub === 'cardigan' || name.includes('가디건') || name.includes('폴로')) return 'top_cardigan';
    return 'top_knit';
  }
  if (slotKey === 'bottom') {
    if (sub === 'skirt' || name.includes('스커트')) return 'bottom_skirt';
    if (sub === 'shorts' || name.includes('쇼츠') || name.includes('하프')) return 'bottom_shorts';
    if (sub === 'denim' || sub === 'chinos' || name.includes('데님') || name.includes('치노')) return 'bottom_denim';
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
    if (sub === 'belt' || name.includes('벨트')) return 'accessory_belt';
    if (sub === 'watch' || name.includes('시계') || name.includes('워치')) return 'accessory_watch';
    if (sub === 'glasses' || name.includes('안경') || name.includes('아이웨어')) return 'accessory_glasses';
    return 'accessory_bag';
  }
  return null;
}

function createSkinMaterial(skinHex) {
  const baseColor = new THREE.Color(skinHex);
  const skinAlbedo = loadCachedTexture(`${TEXTURE_BASE}/skin_albedo.jpg`, { srgb: true });
  const skinBump = getProceduralFabricBumpMap('skin');
  return new THREE.MeshPhysicalMaterial({
    color: baseColor,
    map: skinAlbedo,
    roughness: 0.46,
    metalness: 0.01,
    clearcoat: 0.08,
    clearcoatRoughness: 0.52,
    sheen: 0.42,
    sheenRoughness: 0.65,
    sheenColor: baseColor.clone().lerp(new THREE.Color('#ffdad0'), 0.42),
    bumpMap: skinBump,
    bumpScale: 0.0025,
  });
}

function createGarmentMaterial(item, gid, slotKey, isHighlighted) {
  const hex = item?.color_hex || '#2E3540';
  const spec = inferFabricMaterialSpec(item || { category: slotKey });
  const bump = getProceduralFabricBumpMap(spec.type);
  const baseColor = new THREE.Color(hex);
  const emissiveColor = isHighlighted
    ? baseColor.clone().lerp(new THREE.Color('#f3e6cf'), 0.55)
    : new THREE.Color('#000000');

  const matProps = {
    color: baseColor,
    roughness: spec.roughness,
    metalness: spec.metalness,
    sheen: spec.sheen,
    sheenRoughness: 0.55,
    sheenColor: baseColor.clone().offsetHSL(0, 0, 0.14),
    clearcoat: spec.clearcoat,
    clearcoatRoughness: 0.38,
    bumpMap: bump,
    bumpScale: spec.bumpScale,
    emissive: emissiveColor,
    emissiveIntensity: isHighlighted ? 0.22 : 0.0,
    side: THREE.DoubleSide,
  };

  if (gid === 'top_knit') {
    matProps.normalMap = loadCachedTexture(`${TEXTURE_BASE}/knit_normal.jpg`, { repeat: 1 });
    matProps.normalScale = new THREE.Vector2(0.55, 0.55);
  } else if (gid === 'shoes_loafers' || gid === 'shoes_sneakers') {
    matProps.normalMap = loadCachedTexture(`${TEXTURE_BASE}/shoes_normal.jpg`, { repeat: 1 });
    matProps.normalScale = new THREE.Vector2(0.45, 0.45);
  }

  return new THREE.MeshPhysicalMaterial(matProps);
}

// Determine which body slot a clicked point on the bare body belongs to
function inferBodySlotFromPoint(localY, localX) {
  if (localY > 1.50) return 'headwear';
  if (localY > 1.36) return 'neckwear';
  if (Math.abs(localX) > 0.30 && localY > 0.85) return 'gloves';
  if (localY > 0.94) return 'top';
  if (localY > 0.42) return 'bottom';
  if (localY > 0.14) return 'socks';
  return 'shoes';
}

/**
 * Game-Quality GLB Mannequin WebGL Engine (MakeHuman CC0 + 29 real-time morph targets + IBL)
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
    this.renderer.toneMappingExposure = 1.06;

    this.scene = new THREE.Scene();

    // Studio IBL environment (soft reflections & realistic skin/fabric response)
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envScene = new RoomEnvironment();
      this.envMap = pmrem.fromScene(envScene, 0.04).texture;
      this.scene.environment = this.envMap;
      this.scene.environmentIntensity = 0.55;
      envScene.dispose?.();
      pmrem.dispose();
    } catch {
      // Fallback if PMREM fails on software GL
    }

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 30);
    this.camera.position.set(0, 0.96, 3.25);

    this.rootGroup = new THREE.Group();
    this.characterGroup = new THREE.Group();
    this.pedestalGroup = new THREE.Group();
    this.rootGroup.add(this.pedestalGroup);
    this.rootGroup.add(this.characterGroup);
    this.scene.add(this.rootGroup);

    this.raycaster = new THREE.Raycaster();
    this.interactiveMeshes = [];

    this.bodyMesh = null;
    this.garmentMeshes = new Map(); // gid -> THREE.Mesh
    this.activeGarmentsBySlot = new Map(); // slotKey -> { gid, mesh, item }
    this.lastState = {};
    this.updateSeq = 0;

    this.targetYaw = 0;
    this.currentYaw = 0;
    this.parallaxX = 0;
    this.parallaxY = 0;
    this.focusSlot = 'all';
    this.camTargetY = 0.90;
    this.camDist = 3.25;
    this.scanProgress = 1.0;

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
        const mesh = new THREE.Mesh(geom, createSkinMaterial(skinHex));
        applyNodeTransform(mesh, tpl);
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
    const hemi = new THREE.HemisphereLight(0xfbf8f2, 0xd8cfc0, 0.85);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfffaf2, 1.85);
    keyLight.position.set(1.8, 2.9, 2.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.radius = 5;
    this.scene.add(keyLight);

    const coolRim = new THREE.PointLight(0xe8eef6, 1.25, 5.5);
    coolRim.position.set(-1.6, 1.65, -1.25);
    this.scene.add(coolRim);

    const warmRim = new THREE.PointLight(0xf3dcc0, 1.1, 5.5);
    warmRim.position.set(1.65, 1.15, -1.35);
    this.scene.add(warmRim);

    const frontFill = new THREE.DirectionalLight(0xf6f2ea, 0.65);
    frontFill.position.set(-0.7, 1.4, 2.4);
    this.scene.add(frontFill);

    const baseDisk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.64, 0.04, 48),
      new THREE.MeshPhysicalMaterial({
        color: 0xebe4d8,
        metalness: 0.0,
        roughness: 0.62,
        clearcoat: 0.25,
        clearcoatRoughness: 0.5,
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
        opacity: 0.6,
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
    const geom = tpl.geometry.clone();
    geom.userData.fullIndexArray = tpl.geometry.userData.fullIndexArray?.slice();
    const mesh = new THREE.Mesh(geom, new THREE.MeshPhysicalMaterial());
    applyNodeTransform(mesh, tpl);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.morphTargetDictionary = { ...tpl.morphTargetDictionary };
    mesh.morphTargetInfluences = tpl.morphTargetInfluences ? [...tpl.morphTargetInfluences] : [];
    mesh.userData.gid = gid;
    mesh.userData.coveredBodyVerts = tpl.userData.coveredBodyVerts;
    this.characterGroup.add(mesh);
    this.garmentMeshes.set(gid, mesh);
    return mesh;
  }

  updateScene({
    profile = {},
    loadout = {},
    headMode = 'mannequin',
    selectedSlot = null,
    hoveredSlot = null,
  } = {}) {
    this.lastState = { profile, loadout, headMode, selectedSlot, hoveredSlot };
    if (!this.bodyMesh) return;

    const seq = ++this.updateSeq;
    const { anat, weights } = computeMorphTargetWeights(profile);
    const skinHex = resolveSkinHex(profile);

    // Update skin color & morphs on body
    this.bodyMesh.material.color.set(skinHex);
    this.bodyMesh.material.sheenColor
      .set(skinHex)
      .lerp(new THREE.Color('#ffdad0'), 0.42);
    applyMorphsToMesh(this.bodyMesh, weights);

    // Scale stature & frame width smoothly (native GLB height = 1.615m -> ~1.74m at 172cm)
    const baseScale = 1.075;
    const hScale = baseScale * anat.morph.heightScale;
    const frameWidthFactor =
      0.42 * anat.morph.shoulderScale +
      0.30 * anat.morph.waistScale +
      0.28 * anat.morph.hipScale;
    const xScale = baseScale * (0.35 + 0.65 * anat.morph.heightScale) * (0.35 + 0.65 * frameWidthFactor);
    const zScale = baseScale * (0.35 + 0.65 * anat.morph.heightScale) * (0.45 + 0.55 * anat.morph.bellyDepth);
    this.characterGroup.scale.set(xScale, hScale, zScale);

    // Resolve desired garments from loadout
    const desired = [];
    const hasDress = Boolean(loadout?.dress);
    const hasTop = Boolean(loadout?.top);
    const hasBottom = Boolean(loadout?.bottom);
    const isInspectingUnderwear = selectedSlot === 'underwear' || hoveredSlot === 'underwear';

    for (const [slotKey, item] of Object.entries(loadout || {})) {
      if (!item) continue;
      if (hasDress && (slotKey === 'top' || slotKey === 'bottom')) continue;
      if (slotKey === 'underwear' && !isInspectingUnderwear && (hasTop || hasBottom || hasDress)) {
        continue;
      }
      const gid = resolveGarmentIdForItem(slotKey, item);
      if (gid) desired.push({ slotKey, item, gid });
    }

    // Hide all existing garment meshes first; we'll enable active ones once ready
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

        mesh.material?.dispose?.();
        mesh.material = createGarmentMaterial(item, gid, slotKey, isHighlighted);
        applyMorphsToMesh(mesh, weights);

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

  _startLoop() {
    const animate = () => {
      if (this.disposed) return;
      this.rafId = requestAnimationFrame(animate);

      const desiredYaw = this.targetYaw + this.parallaxX * 0.18;
      this.currentYaw += (desiredYaw - this.currentYaw) * 0.12;
      this.characterGroup.rotation.y = this.currentYaw;
      this.characterGroup.rotation.x = this.parallaxY * 0.04;

      const targetSpec = SLOT_CAMERA_TARGETS[this.focusSlot] || SLOT_CAMERA_TARGETS.all;
      this.camTargetY += (targetSpec.y - this.camTargetY) * 0.10;
      this.camDist += (targetSpec.dist - this.camDist) * 0.10;

      this.camera.position.set(this.parallaxX * 0.08, this.camTargetY + 0.04, this.camDist);
      this.camera.lookAt(0, this.camTargetY - 0.02, 0);

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
      mesh.material?.dispose?.();
    }
    this.bodyMesh?.geometry?.dispose?.();
    this.bodyMesh?.material?.dispose?.();
    this.envMap?.dispose?.();
    this.renderer.dispose();
  }
}

// -----------------------------------------------------------------------------
// Shared Offscreen 3D Renderer for Mini Body-Shape Cards & Modal Live Preview
// -----------------------------------------------------------------------------
let sharedPreviewEngine = null;

function notifyPreviewListeners() {
  for (const fn of previewListeners) {
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

    sharedPreviewEngine = { offCanvas, renderer, scene, camera, group, bodyMesh: null, briefsMesh: null };
    return sharedPreviewEngine;
  } catch {
    return null;
  }
}

/**
 * Renders the real 3D MakeHuman mannequin with exact morph targets onto a 2D `<canvas>`
 * (used by `Mannequin3DBodyPreview` in the 7 body-shape cards & live 3-size preview).
 */
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

  // Kick off background loading of body.glb + briefs if not yet loaded, and re-render when ready
  if (!bodyTemplateMesh || !garmentTemplateCache.has('underwear_briefs')) {
    const rerender = () => {
      previewListeners.delete(rerender);
      render3DMannequinScene(canvas, options);
    };
    previewListeners.add(rerender);
    loadBodyTemplate().catch(() => {});
    loadGarmentTemplate('underwear_briefs').catch(() => {});
    loadGarmentTemplate('underwear_top').catch(() => {});
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
      eng.bodyMesh = new THREE.Mesh(geom, createSkinMaterial(resolveSkinHex(profile)));
      applyNodeTransform(eng.bodyMesh, bodyTemplateMesh);
      eng.bodyMesh.morphTargetDictionary = { ...bodyTemplateMesh.morphTargetDictionary };
      eng.bodyMesh.morphTargetInfluences = [...bodyTemplateMesh.morphTargetInfluences];
      eng.group.add(eng.bodyMesh);
    }
    if (!eng.briefsMesh && garmentTemplateCache.has('underwear_briefs')) {
      const tpl = garmentTemplateCache.get('underwear_briefs');
      eng.briefsMesh = new THREE.Mesh(
        tpl.geometry.clone(),
        new THREE.MeshPhysicalMaterial({ color: 0x2c2623, roughness: 0.68, sheen: 0.3 })
      );
      applyNodeTransform(eng.briefsMesh, tpl);
      eng.briefsMesh.morphTargetDictionary = { ...tpl.morphTargetDictionary };
      eng.briefsMesh.morphTargetInfluences = [...tpl.morphTargetInfluences];
      eng.group.add(eng.briefsMesh);
    }
    if (!eng.topMesh && garmentTemplateCache.has('underwear_top')) {
      const tpl = garmentTemplateCache.get('underwear_top');
      eng.topMesh = new THREE.Mesh(
        tpl.geometry.clone(),
        new THREE.MeshPhysicalMaterial({ color: 0x2c2623, roughness: 0.68, sheen: 0.3 })
      );
      applyNodeTransform(eng.topMesh, tpl);
      eng.topMesh.morphTargetDictionary = { ...tpl.morphTargetDictionary };
      eng.topMesh.morphTargetInfluences = [...tpl.morphTargetInfluences];
      eng.group.add(eng.topMesh);
    }

    const { anat, weights } = computeMorphTargetWeights(profile);
    const skinHex = resolveSkinHex(profile);
    eng.bodyMesh.material.color.set(skinHex);
    applyMorphsToMesh(eng.bodyMesh, weights);
    if (eng.briefsMesh) applyMorphsToMesh(eng.briefsMesh, weights);
    if (eng.topMesh) {
      eng.topMesh.visible = anat.gender === 'female';
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

    if (eng.offCanvas.width !== width || eng.offCanvas.height !== height) {
      eng.renderer.setSize(width, height, false);
      eng.camera.aspect = width / height;
      eng.camera.updateProjectionMatrix();
    }
    eng.camera.position.set(0, 0.92, compact ? 3.24 : 3.28);
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
