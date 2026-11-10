import * as THREE from 'three';
import { resolveAnatomicalProfile } from './bodyAnthropometrics.js';

export const SLOT_CAMERA_TARGETS = {
  all: { y: 0.92, dist: 3.3, fov: 36, labelKo: '전신 풀샷 (Full Body)' },
  headwear: { y: 1.66, dist: 1.15, fov: 30, labelKo: '헤드웨어 줌 (Head)' },
  neckwear: { y: 1.48, dist: 1.25, fov: 32, labelKo: '네크웨어 줌 (Neck)' },
  outer: { y: 1.22, dist: 1.68, fov: 34, labelKo: '아우터 줌 (Outer)' },
  top: { y: 1.24, dist: 1.58, fov: 34, labelKo: '상의 줌 (Top)' },
  bottom: { y: 0.68, dist: 1.75, fov: 34, labelKo: '하의 줌 (Bottom)' },
  dress: { y: 1.02, dist: 2.10, fov: 35, labelKo: '원피스 줌 (Dress)' },
  gloves: { y: 0.92, dist: 1.55, fov: 32, labelKo: '핸드/장갑 줌 (Gloves)' },
  underwear: { y: 1.08, dist: 1.65, fov: 34, labelKo: '이너웨어 줌 (Inner)' },
  socks: { y: 0.25, dist: 1.35, fov: 30, labelKo: '레그/양말 줌 (Socks)' },
  shoes: { y: 0.14, dist: 1.30, fov: 30, labelKo: '풋웨어 줌 (Shoes)' },
  accessory: { y: 1.05, dist: 1.75, fov: 34, labelKo: '액세서리 줌 (Accessory)' },
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
    return { type: 'padding', labelKo: '구스다운 퀼팅 나일론', roughness: 0.36, metalness: 0.08, sheen: 0.35, clearcoat: 0.22, bumpScale: 0.035 };
  }
  if (
    sub === 'loafers' ||
    sub === 'boots' ||
    sub === 'heels' ||
    sub === 'leather_gloves' ||
    sub === 'bag' ||
    sub === 'belt' ||
    name.includes('레더') ||
    name.includes('가죽')
  ) {
    return { type: 'leather', labelKo: '이탈리안 풀그레인 레더', roughness: 0.24, metalness: 0.12, sheen: 0.2, clearcoat: 0.55, bumpScale: 0.012 };
  }
  if (sub === 'trench' || name.includes('트렌치') || name.includes('개버딘') || name.includes('발수')) {
    return { type: 'gabardine', labelKo: '발수 코튼 개버딘 트윌', roughness: 0.52, metalness: 0.04, sheen: 0.45, clearcoat: 0.12, bumpScale: 0.018 };
  }
  if (sub === 'denim' || name.includes('데님') || name.includes('청바지')) {
    return { type: 'denim', labelKo: '셀비지 인디고 데님 트윌', roughness: 0.78, metalness: 0.02, sheen: 0.25, clearcoat: 0.0, bumpScale: 0.028 };
  }
  if (sub === 'blouse' || sub === 'necktie' || name.includes('실크') || name.includes('새틴')) {
    return { type: 'silk', labelKo: '실크 크레이프 드레이프', roughness: 0.28, metalness: 0.06, sheen: 0.88, clearcoat: 0.18, bumpScale: 0.008 };
  }
  if (sub === 'coat' || sub === 'blazer' || sub === 'slacks' || sub === 'beret' || sub === 'scarf' || name.includes('울') || name.includes('캐시미어')) {
    return { type: 'wool', labelKo: '버진 울 · 캐시미어 브러시드', roughness: 0.68, metalness: 0.02, sheen: 0.65, clearcoat: 0.02, bumpScale: 0.022 };
  }
  if (sub === 'knit' || sub === 'cardigan' || sub === 'beanie' || sub === 'muffler' || sub === 'gloves' || cat === 'socks') {
    return { type: 'knit', labelKo: '파인 메리노 골지 니트', roughness: 0.76, metalness: 0.01, sheen: 0.55, clearcoat: 0.0, bumpScale: 0.032 };
  }
  return { type: 'cotton', labelKo: '수피마 코튼 포플린', roughness: 0.62, metalness: 0.02, sheen: 0.35, clearcoat: 0.04, bumpScale: 0.014 };
}

// Procedural micro-texture bump map generator for Three.js PBR materials
const bumpTextureCache = new Map();

function getProceduralFabricBumpMap(fabricType = 'knit') {
  if (bumpTextureCache.has(fabricType)) {
    return bumpTextureCache.get(fabricType);
  }
  if (typeof document === 'undefined') return null;

  const size = 128;
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
        const rib = Math.sin((x / size) * Math.PI * 28) * 38;
        const loop = Math.sin((y / size) * Math.PI * 36 + (x % 4) * 0.9) * 26;
        v = 128 + rib + loop;
      } else if (fabricType === 'padding') {
        const baffle = Math.abs(Math.sin((y / size) * Math.PI * 6));
        v = baffle < 0.1 ? 40 : 120 + Math.pow(baffle, 0.45) * 115;
      } else if (fabricType === 'denim' || fabricType === 'gabardine') {
        const twill = Math.sin(((x + y * 1.4) / size) * Math.PI * 32) * 36;
        v = 128 + twill;
      } else if (fabricType === 'leather') {
        const grain = Math.sin(x * 0.9) * Math.cos(y * 0.9) * 18;
        v = 128 + grain;
      } else if (fabricType === 'wool') {
        const felt = Math.sin((x - y) * 0.6) * 20 + Math.cos((x + y) * 0.8) * 18;
        v = 128 + felt;
      } else {
        const weave = (Math.sin(x * 1.2) + Math.sin(y * 1.2)) * 14;
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
  tex.repeat.set(fabricType === 'padding' ? 2 : 5, fabricType === 'padding' ? 2 : 5);
  bumpTextureCache.set(fabricType, tex);
  return tex;
}

function createLatheFromProfile(points2D, segments = 36, scaleX = 1.0, scaleZ = 0.78) {
  const lathePts = points2D.map(([r, y]) => new THREE.Vector2(Math.max(0.002, r), y));
  const geom = new THREE.LatheGeometry(lathePts, segments);
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) * scaleX);
    pos.setZ(i, pos.getZ(i) * scaleZ);
  }
  geom.computeVertexNormals();
  return geom;
}

function createLimbGeometry(yTop, yBottom, rTop, rMid, rBot, xTop, xBot, zTop = 0, zBot = 0, zAspect = 0.88) {
  const steps = 18;
  const radialSegs = 24;
  const geom = new THREE.CylinderGeometry(1, 1, 1, radialSegs, steps, false);
  const pos = geom.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    // Cylinder default y is in [-0.5, 0.5], where +0.5 is top
    const t = 0.5 - pos.getY(i); // 0 at top, 1 at bottom
    const y = yTop + (yBottom - yTop) * t;
    const cx = xTop + (xBot - xTop) * t;
    const cz = zTop + (zBot - zTop) * t;

    let r;
    if (t < 0.5) {
      const u = t * 2;
      r = rTop * (1 - u) + rMid * u + Math.sin(u * Math.PI) * (rMid * 0.06);
    } else {
      const u = (t - 0.5) * 2;
      r = rMid * (1 - u) + rBot * u;
    }

    const vx = pos.getX(i) * r + cx;
    const vz = pos.getZ(i) * r * zAspect + cz;
    pos.setXYZ(i, vx, y, vz);
  }
  geom.computeVertexNormals();
  return geom;
}

/**
 * High-End Three.js WebGL PBR Mannequin Renderer (atelier studio lighting, faceless by default)
 */
export class Mannequin3DWebGLEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 30);
    this.camera.position.set(0, 1.02, 2.85);

    this.rootGroup = new THREE.Group();
    this.characterGroup = new THREE.Group();
    this.pedestalGroup = new THREE.Group();
    this.rootGroup.add(this.pedestalGroup);
    this.rootGroup.add(this.characterGroup);
    this.scene.add(this.rootGroup);

    this.raycaster = new THREE.Raycaster();
    this.interactiveMeshes = [];

    this.targetYaw = 0;
    this.currentYaw = 0;
    this.parallaxX = 0;
    this.parallaxY = 0;
    this.focusSlot = 'all';
    this.camTargetY = 0.92;
    this.camDist = 3.3;
    this.scanProgress = 1.0;

    this._setupLightsAndPedestal();
    this._startLoop();
  }

  _setupLightsAndPedestal() {
    // Atelier studio: bright ivory sky light + warm floor bounce
    const hemi = new THREE.HemisphereLight(0xfbf8f2, 0xd9cfc0, 1.05);
    this.scene.add(hemi);

    // Key studio softbox light
    const keyLight = new THREE.DirectionalLight(0xfffaf2, 2.0);
    keyLight.position.set(1.8, 2.9, 2.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.radius = 6;
    this.scene.add(keyLight);

    // Soft neutral rim lights (left/right back) to separate silhouette from the ivory backdrop
    const coolRim = new THREE.PointLight(0xe8eef6, 1.35, 5.5);
    coolRim.position.set(-1.6, 1.65, -1.25);
    this.scene.add(coolRim);

    const warmRim = new THREE.PointLight(0xf3dcc0, 1.15, 5.5);
    warmRim.position.set(1.65, 1.15, -1.35);
    this.scene.add(warmRim);

    // Soft front fill light for collar / fabric detail
    const frontFill = new THREE.DirectionalLight(0xf6f2ea, 0.8);
    frontFill.position.set(-0.6, 1.4, 2.4);
    this.scene.add(frontFill);

    // Studio pedestal (pale travertine disk + hairline espresso rings)
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

    // Subtle sand-tone fitting ring that sweeps vertically on item equip
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

  updateScene({
    profile = {},
    loadout = {},
    headMode = 'mannequin', // 'mannequin' (sculpted faceless) | 'avatar' (game character head)
    selectedSlot = null,
    hoveredSlot = null,
  } = {}) {
    // Clear previous character meshes
    // (dispose GPU buffers too — the scene is rebuilt on every hover/selection change)
    while (this.characterGroup.children.length > 0) {
      const child = this.characterGroup.children[0];
      this.characterGroup.remove(child);
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
    this.interactiveMeshes = [];

    const anat = resolveAnatomicalProfile(profile);
    const m = anat.morph;
    const isFemale = anat.gender === 'female';
    const skinHex = resolveSkinHex(profile);

    const skinMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(skinHex),
      roughness: 0.44,
      metalness: 0.02,
      clearcoat: 0.14,
      clearcoatRoughness: 0.42,
      sheen: 0.38,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color(skinHex).lerp(new THREE.Color('#ffdfd4'), 0.35),
    });

    const addPart = (geom, mat, slotTag = null, pos = null, rot = null) => {
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
      if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
      if (slotTag) {
        mesh.userData.slot = slotTag;
        this.interactiveMeshes.push(mesh);
      }
      this.characterGroup.add(mesh);
      return mesh;
    };

    const makeGarmentMat = (item, fallbackHex = '#2A3446', slotKey = '') => {
      const hex = item?.color_hex || fallbackHex;
      const spec = inferFabricMaterialSpec(item || { category: slotKey });
      const bump = getProceduralFabricBumpMap(spec.type);
      const isHighlighted = slotKey && (slotKey === selectedSlot || slotKey === hoveredSlot);

      const baseColor = new THREE.Color(hex);
      const emissiveColor = isHighlighted
        ? baseColor.clone().lerp(new THREE.Color('#f3e6cf'), 0.5)
        : new THREE.Color('#000000');

      return new THREE.MeshPhysicalMaterial({
        color: baseColor,
        roughness: spec.roughness,
        metalness: spec.metalness,
        sheen: spec.sheen,
        sheenColor: baseColor.clone().offsetHSL(0, 0, 0.16),
        clearcoat: spec.clearcoat,
        bumpMap: bump,
        bumpScale: spec.bumpScale,
        emissive: emissiveColor,
        emissiveIntensity: isHighlighted ? 0.22 : 0.0,
      });
    };

    // Anatomical dimensions in meters (base height ~ 1.82m in scene units)
    const shW = (isFemale ? 0.185 : 0.215) * m.shoulderScale;
    const chR = (isFemale ? 0.138 : 0.155) * m.chestScale;
    const waR = (isFemale ? 0.105 : 0.128) * m.waistScale;
    const hpR = (isFemale ? 0.152 : 0.148) * m.hipScale;
    const thR = (isFemale ? 0.082 : 0.085) * m.thighScale;
    const cfR = (isFemale ? 0.054 : 0.058) * m.calfScale;
    const armR = (isFemale ? 0.044 : 0.050) * m.armScale;
    const hdS = m.headScale;
    const bellyZ = 0.74 * m.bellyDepth;

    // 1. Sculpted Torso + Neck Base (Skin)
    const torsoProfile = [
      [hpR * 0.65, 0.86],
      [hpR * 0.98, 0.94],
      [waR * 0.96, 1.07],
      [waR * 0.94, 1.14],
      [chR * 0.98, 1.29],
      [shW * 0.86, 1.42],
      [0.056 * m.shoulderScale, 1.49],
      [0.052, 1.56],
    ];
    addPart(createLatheFromProfile(torsoProfile, 40, 1.0, bellyZ), skinMat, 'underwear');

    // Bust / Pectoral sculpting
    const bustRadius = (isFemale ? 0.064 : 0.056) * m.chestScale;
    const bustZ = (isFemale ? 0.095 : 0.082) * bellyZ;
    for (const side of [-1, 1]) {
      const pec = new THREE.SphereGeometry(bustRadius, 24, 20);
      pec.scale(1.05, isFemale ? 0.95 : 0.78, isFemale ? 0.95 : 0.65);
      addPart(pec, skinMat, 'top', [side * chR * 0.42, 1.29, bustZ]);
    }

    // 2. Head (Sculpted Mannequin Head vs Game Character Avatar Head)
    const headY = 1.655;
    const headGeom = new THREE.SphereGeometry(0.104 * hdS, 36, 32);
    headGeom.scale(0.86, 1.15, 0.92);
    addPart(headGeom, skinMat, 'headwear', [0, headY, 0.01]);

    // Jaw / Chin contour
    const jawGeom = new THREE.ConeGeometry(0.078 * hdS, 0.11 * hdS, 28);
    jawGeom.rotateX(Math.PI);
    jawGeom.scale(0.88, 1.0, 0.85);
    addPart(jawGeom, skinMat, 'headwear', [0, headY - 0.055 * hdS, 0.022 * hdS]);

    // Ears
    for (const side of [-1, 1]) {
      const ear = new THREE.SphereGeometry(0.018 * hdS, 14, 14);
      ear.scale(0.45, 1.2, 0.8);
      addPart(ear, skinMat, 'headwear', [side * 0.091 * hdS, headY - 0.005, 0.0]);
    }

    if (headMode === 'avatar') {
      // Stylized Unreal/Cyberpunk character facial features + hair
      const hairMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(isFemale ? '#241B18' : '#1A1C22'),
        roughness: 0.48,
        metalness: 0.08,
        sheen: 0.75,
        sheenColor: new THREE.Color('#5a483e'),
      });
      const hairCap = new THREE.SphereGeometry(0.109 * hdS, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.62);
      hairCap.scale(0.89, 1.14, 0.96);
      addPart(hairCap, hairMat, 'headwear', [0, headY + 0.012, -0.004]);

      if (isFemale) {
        // Side hair locks
        for (const side of [-1, 1]) {
          const lock = createLimbGeometry(
            headY + 0.02,
            headY - 0.18,
            0.028 * hdS,
            0.032 * hdS,
            0.018 * hdS,
            side * 0.085 * hdS,
            side * 0.095 * hdS,
            0.015,
            0.025
          );
          addPart(lock, hairMat, 'headwear');
        }
      }

      // Nose bridge
      const noseGeom = new THREE.ConeGeometry(0.014 * hdS, 0.048 * hdS, 12);
      addPart(noseGeom, skinMat, 'headwear', [0, headY - 0.006, 0.098 * hdS], [0.22, 0, 0]);

      // Eyes & Brows
      const irisMat = new THREE.MeshPhysicalMaterial({ color: 0x2b211b, roughness: 0.15, clearcoat: 0.9 });
      const sclMat = new THREE.MeshBasicMaterial({ color: 0xf8f6f2 });
      const browMat = new THREE.MeshStandardMaterial({ color: 0x241c18, roughness: 0.7 });

      for (const side of [-1, 1]) {
        const eyeWhite = new THREE.SphereGeometry(0.014 * hdS, 14, 14);
        eyeWhite.scale(1.25, 0.72, 0.55);
        addPart(eyeWhite, sclMat, 'headwear', [side * 0.034 * hdS, headY + 0.008, 0.088 * hdS]);

        const iris = new THREE.SphereGeometry(0.0075 * hdS, 12, 12);
        addPart(iris, irisMat, 'headwear', [side * 0.034 * hdS, headY + 0.008, 0.095 * hdS]);

        const brow = new THREE.BoxGeometry(0.030 * hdS, 0.0045 * hdS, 0.008 * hdS);
        addPart(
          brow,
          browMat,
          'headwear',
          [side * 0.035 * hdS, headY + 0.026 * hdS, 0.091 * hdS],
          [0, 0, side * -0.08]
        );
      }

      // Lips
      const lipMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(skinHex).lerp(new THREE.Color(isFemale ? '#c85a5a' : '#b56e65'), 0.55),
        roughness: 0.32,
        clearcoat: 0.45,
      });
      const lips = new THREE.SphereGeometry(0.018 * hdS, 16, 12);
      lips.scale(1.35, 0.42, 0.55);
      addPart(lips, lipMat, 'headwear', [0, headY - 0.046 * hdS, 0.091 * hdS]);
    }

    // 3. Arms & Legs (Base Skin)
    const legX = hpR * 0.52;
    for (const side of [-1, 1]) {
      // Thigh to knee to ankle
      addPart(
        createLimbGeometry(0.90, 0.48, thR, thR * 0.86, cfR * 1.05, side * legX, side * legX * 0.92, 0, 0, 0.92),
        skinMat,
        'bottom'
      );
      addPart(
        createLimbGeometry(0.48, 0.08, cfR * 1.04, cfR, cfR * 0.68, side * legX * 0.92, side * legX * 0.88, 0, -0.01, 0.90),
        skinMat,
        'socks'
      );

      // Shoulder to elbow to wrist
      const shX = side * (shW + armR * 0.35);
      const wristX = side * (shW + armR * 1.25);
      addPart(
        createLimbGeometry(1.41, 1.12, armR * 1.12, armR * 0.96, armR * 0.85, shX, side * (shW + armR * 0.85), 0, 0.01),
        skinMat,
        'top'
      );
      addPart(
        createLimbGeometry(1.12, 0.84, armR * 0.85, armR * 0.78, armR * 0.64, side * (shW + armR * 0.85), wristX, 0.01, 0.03),
        skinMat,
        'top'
      );

      // Hands (skin or gloves)
      const gloveItem = loadout.gloves;
      const handMat = gloveItem ? makeGarmentMat(gloveItem, '#2B2B2E', 'gloves') : skinMat;
      const handGeom = new THREE.SphereGeometry(armR * (gloveItem ? 0.88 : 0.78), 18, 16);
      handGeom.scale(0.78, 1.38, 0.58);
      addPart(handGeom, handMat, 'gloves', [wristX, 0.79, 0.035]);
    }

    // 4. Underwear / Innerwear layer (visible when top/bottom are unequipped or at neckline)
    if (loadout.underwear) {
      const uwMat = makeGarmentMat(loadout.underwear, '#E8E4DC', 'underwear');
      const uwProfile = [
        [hpR * 0.99, 0.88],
        [waR * 0.97, 1.08],
        [chR * 0.99, 1.28],
        [shW * 0.74, 1.40],
      ];
      addPart(createLatheFromProfile(uwProfile, 36, 1.01, bellyZ * 1.01), uwMat, 'underwear');
    }

    // 5. Dress OR Top + Bottom
    const dressItem = loadout.dress;
    if (dressItem) {
      const dressMat = makeGarmentMat(dressItem, '#C6B294', 'dress');
      const dressProfile = [
        [hpR * 1.38, 0.36],
        [hpR * 1.18, 0.64],
        [hpR * 1.06, 0.92],
        [waR * 1.02, 1.09],
        [chR * 1.04, 1.30],
        [shW * 0.92, 1.43],
      ];
      addPart(createLatheFromProfile(dressProfile, 44, 1.03, bellyZ * 1.05), dressMat, 'dress');
    }

    // Bottoms (Slacks / Denim / Skirt / Shorts)
    const bottomItem = loadout.bottom;
    if (bottomItem) {
      const botMat = makeGarmentMat(bottomItem, '#35383E', 'bottom');
      const sub = String(bottomItem.subcategory || '').toLowerCase();
      if (sub === 'skirt') {
        const skirtProfile = [
          [hpR * 1.32, 0.46],
          [hpR * 1.14, 0.75],
          [hpR * 1.04, 0.95],
          [waR * 1.02, 1.08],
        ];
        addPart(createLatheFromProfile(skirtProfile, 40, 1.02, bellyZ * 1.04), botMat, 'bottom');
      } else {
        const isShorts = sub === 'shorts';
        const isWide = sub === 'slacks' || (bottomItem.name || '').includes('와이드');
        const pelvisProfile = [
          [hpR * 1.02, 0.87],
          [hpR * 1.04, 0.96],
          [waR * 1.02, 1.08],
        ];
        addPart(createLatheFromProfile(pelvisProfile, 36, 1.02, bellyZ * 1.03), botMat, 'bottom');

        for (const side of [-1, 1]) {
          const yEnd = isShorts ? 0.56 : 0.14;
          const rKnee = isWide ? thR * 1.04 : thR * 0.92;
          const rHem = isShorts ? thR * 0.98 : isWide ? thR * 0.96 : cfR * 0.86;
          addPart(
            createLimbGeometry(
              0.91,
              yEnd,
              thR * 1.08,
              rKnee,
              rHem,
              side * legX,
              side * legX * 0.9,
              0,
              0,
              0.94
            ),
            botMat,
            'bottom'
          );
        }
      }
    }

    // Tops (Knit / Shirt / T-Shirt / Hoodie)
    const topItem = loadout.top;
    if (topItem) {
      const topMat = makeGarmentMat(topItem, '#1C2538', 'top');
      const sub = String(topItem.subcategory || '').toLowerCase();
      const topProfile = [
        [hpR * 1.03, 0.95],
        [waR * 1.05, 1.09],
        [chR * 1.05, 1.30],
        [shW * 0.94, 1.44],
        [0.068 * m.shoulderScale, 1.49],
      ];
      addPart(createLatheFromProfile(topProfile, 40, 1.03, bellyZ * 1.05), topMat, 'top');

      // Sleeves for top
      const isShortSleeve = sub === 'tshirt';
      for (const side of [-1, 1]) {
        const shX = side * (shW + armR * 0.35);
        const endX = side * (shW + armR * (isShortSleeve ? 0.72 : 1.22));
        const endY = isShortSleeve ? 1.20 : 0.86;
        addPart(
          createLimbGeometry(
            1.42,
            endY,
            armR * 1.24,
            armR * 1.08,
            armR * (isShortSleeve ? 1.06 : 0.82),
            shX,
            endX,
            0,
            0.025
          ),
          topMat,
          'top'
        );
      }
    }

    // 6. Outerwear (Trench / Blazer / Coat / Padding / Jacket)
    const outerItem = loadout.outer;
    if (outerItem) {
      const outerMat = makeGarmentMat(outerItem, '#C4B193', 'outer');
      const sub = String(outerItem.subcategory || '').toLowerCase();
      const isLongCoat = sub === 'trench' || sub === 'coat';
      const isPuffer = sub === 'padding';
      const bulk = isPuffer ? 1.15 : 1.09;
      const bottomY = isLongCoat ? 0.52 : 0.88;

      // Open-front tailored outer silhouette (curved C-Wrap Lathe so inner top shows down the center!)
      const outerPts = [
        new THREE.Vector2(hpR * bulk * (isLongCoat ? 1.22 : 1.06), bottomY),
        new THREE.Vector2(hpR * bulk * 1.06, 0.94),
        new THREE.Vector2(waR * bulk * 1.07, 1.10),
        new THREE.Vector2(chR * bulk * 1.08, 1.31),
        new THREE.Vector2(shW * bulk * 0.96, 1.45),
        new THREE.Vector2(0.078 * m.shoulderScale, 1.51),
      ];
      // Leave a 42-degree front opening so layered shirt/knit is clearly visible
      const openAngle = 0.38;
      const outerGeom = new THREE.LatheGeometry(
        outerPts,
        40,
        openAngle,
        Math.PI * 2 - openAngle * 2
      );
      // Rotate so the opening faces +Z (front camera)
      outerGeom.rotateY(Math.PI / 2);
      const pos = outerGeom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        pos.setZ(i, pos.getZ(i) * bellyZ * 1.08);
      }
      outerGeom.computeVertexNormals();
      addPart(outerGeom, outerMat, 'outer');

      // Outer sleeves
      for (const side of [-1, 1]) {
        const shX = side * (shW + armR * 0.42);
        const wristX = side * (shW + armR * 1.28);
        addPart(
          createLimbGeometry(
            1.43,
            0.85,
            armR * 1.36 * (isPuffer ? 1.12 : 1),
            armR * 1.20 * (isPuffer ? 1.12 : 1),
            armR * 0.96,
            shX,
            wristX,
            0,
            0.025
          ),
          outerMat,
          'outer'
        );
      }
    }

    // 7. Neckwear (Scarf / Muffler / Necktie)
    const neckItem = loadout.neckwear;
    if (neckItem) {
      const neckMat = makeGarmentMat(neckItem, '#DDD3C2', 'neckwear');
      const sub = String(neckItem.subcategory || '').toLowerCase();
      if (sub === 'necktie') {
        const tieGeom = new THREE.BoxGeometry(0.042, 0.34, 0.016);
        addPart(tieGeom, neckMat, 'neckwear', [0, 1.29, chR * bellyZ + 0.018]);
      } else {
        const torus = new THREE.TorusGeometry(0.084 * m.shoulderScale, 0.028, 18, 36);
        torus.rotateX(Math.PI / 2 + 0.12);
        torus.scale(1.05, 0.92, 1.0);
        addPart(torus, neckMat, 'neckwear', [0, 1.48, 0.015]);

        // Draped scarf tails
        const tail = new THREE.BoxGeometry(0.052, 0.28, 0.018);
        addPart(tail, neckMat, 'neckwear', [-0.036, 1.33, chR * bellyZ + 0.022], [0, 0, 0.05]);
      }
    }

    // 8. Headwear (Beanie / Cap / Beret)
    const headItem = loadout.headwear;
    if (headItem) {
      const hatMat = makeGarmentMat(headItem, '#283852', 'headwear');
      const sub = String(headItem.subcategory || '').toLowerCase();
      const dome = new THREE.SphereGeometry(0.112 * hdS, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.56);
      dome.scale(0.90, 1.08, 0.96);
      addPart(dome, hatMat, 'headwear', [0, headY + 0.022 * hdS, 0.008]);

      if (sub === 'cap') {
        const visor = new THREE.CylinderGeometry(0.095 * hdS, 0.105 * hdS, 0.008, 24, 1, false, -Math.PI * 0.38, Math.PI * 0.76);
        visor.scale(0.95, 1, 1.25);
        addPart(visor, hatMat, 'headwear', [0, headY + 0.032 * hdS, 0.055 * hdS], [0.18, 0, 0]);
      }
    }

    // 9. Socks & 10. Shoes
    const socksItem = loadout.socks;
    const sockMat = socksItem ? makeGarmentMat(socksItem, '#EAE7E1', 'socks') : null;
    const shoesItem = loadout.shoes;
    const shoeMat = makeGarmentMat(shoesItem, '#1E1F22', 'shoes');

    for (const side of [-1, 1]) {
      const footX = side * legX * 0.88;
      if (sockMat) {
        addPart(
          createLimbGeometry(0.26, 0.07, cfR * 0.92, cfR * 0.82, cfR * 0.74, footX, footX, -0.005, -0.01),
          sockMat,
          'socks'
        );
      }

      const isBoot = String(shoesItem?.subcategory || '').toLowerCase() === 'boots';
      if (isBoot) {
        addPart(
          createLimbGeometry(0.22, 0.06, cfR * 0.98, cfR * 0.90, cfR * 0.86, footX, footX, -0.005, -0.01),
          shoeMat,
          'shoes'
        );
      }
      const shoeBody = new THREE.SphereGeometry(0.062, 22, 16);
      shoeBody.scale(0.84, 0.58, 1.85);
      addPart(shoeBody, shoeMat, 'shoes', [footX, 0.042, 0.038]);
    }

    // 11. Accessory (Bag / Watch / Belt / Glasses)
    const accItem = loadout.accessory;
    if (accItem) {
      const accMat = makeGarmentMat(accItem, '#6E4F3A', 'accessory');
      const sub = String(accItem.subcategory || '').toLowerCase();
      if (sub === 'glasses') {
        const glassGeom = new THREE.BoxGeometry(0.135 * hdS, 0.028 * hdS, 0.02);
        addPart(glassGeom, accMat, 'accessory', [0, headY + 0.01, 0.098 * hdS]);
      } else if (sub === 'watch') {
        const watchGeom = new THREE.CylinderGeometry(0.036 * m.armScale, 0.036 * m.armScale, 0.024, 20);
        addPart(watchGeom, accMat, 'accessory', [-(shW + armR * 1.22), 0.86, 0.03]);
      } else if (sub === 'belt') {
        const beltGeom = new THREE.CylinderGeometry(waR * 1.04, waR * 1.04, 0.032, 36);
        beltGeom.scale(1.02, 1, bellyZ * 1.04);
        addPart(beltGeom, accMat, 'accessory', [0, 1.05, 0]);
      } else {
        // Tote / Crossbody Bag beside hip
        const bagX = shW + armR * 1.55;
        const bagBody = new THREE.BoxGeometry(0.08, 0.22, 0.18);
        addPart(bagBody, accMat, 'accessory', [bagX, 0.68, 0.04]);
      }
    }
  }

  hitTestClientPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactiveMeshes, false);
    return hits.length > 0 ? hits[0].object.userData.slot || null : null;
  }

  _startLoop() {
    const animate = () => {
      if (this.disposed) return;
      this.rafId = requestAnimationFrame(animate);

      // Smoothly interpolate rotation + parallax
      const desiredYaw = this.targetYaw + this.parallaxX * 0.18;
      this.currentYaw += (desiredYaw - this.currentYaw) * 0.12;
      this.characterGroup.rotation.y = this.currentYaw;
      this.characterGroup.rotation.x = this.parallaxY * 0.05;

      // Smooth camera focus zoom per slot
      const targetSpec = SLOT_CAMERA_TARGETS[this.focusSlot] || SLOT_CAMERA_TARGETS.all;
      this.camTargetY += (targetSpec.y - this.camTargetY) * 0.10;
      this.camDist += (targetSpec.dist - this.camDist) * 0.10;

      this.camera.position.set(this.parallaxX * 0.08, this.camTargetY + 0.06, this.camDist);
      this.camera.lookAt(0, this.camTargetY - 0.02, 0);

      // Holographic scan ring animation
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
    this.renderer.dispose();
  }
}

/**
 * Synchronous 2D / Z-buffer Mannequin Renderer for Mini Body-Shape Preview Cards
 * and Pixel-Exact Hit-Testing Compatibility (`render3DMannequinScene`)
 */
export function render3DMannequinScene(canvas, options = {}) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const width = canvas.width || 240;
  const height = canvas.height || 340;
  const {
    profile = {},
    loadout = {},
    rotationDeg = 0,
    compact = false,
    darkHud = false,
  } = options;

  const anat = resolveAnatomicalProfile(profile);
  const m = anat.morph;
  const isFemale = anat.gender === 'female';
  const skinHex = resolveSkinHex(profile);
  const yawRad = ((Number(rotationDeg) || 0) * Math.PI) / 180;
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);

  ctx.clearRect(0, 0, width, height);

  // Subtle background glow
  if (darkHud) {
    const bgGrad = ctx.createRadialGradient(width * 0.5, height * 0.45, 10, width * 0.5, height * 0.5, width * 0.65);
    bgGrad.addColorStop(0, 'rgba(0, 229, 255, 0.14)');
    bgGrad.addColorStop(1, 'rgba(10, 15, 24, 0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);
  } else {
    // Atelier studio spotlight
    const bgGrad = ctx.createRadialGradient(width * 0.5, height * 0.42, 6, width * 0.5, height * 0.5, width * 0.7);
    bgGrad.addColorStop(0, 'rgba(200, 178, 148, 0.18)');
    bgGrad.addColorStop(1, 'rgba(250, 248, 244, 0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);
  }

  const cx = width * 0.5;
  const scale = height * (compact ? 0.44 : 0.46);
  const baseY = height * (compact ? 0.91 : 0.92);

  // Effective width projection when rotated around Y axis
  const projW = (rx, rz) => Math.hypot(rx * cosY, rz * sinY);

  const shW = (isFemale ? 0.20 : 0.23) * m.shoulderScale * scale;
  const chW = projW((isFemale ? 0.15 : 0.17) * m.chestScale, 0.12 * m.bellyDepth) * scale;
  const waW = projW((isFemale ? 0.115 : 0.14) * m.waistScale, 0.115 * m.bellyDepth) * scale;
  const hpW = projW((isFemale ? 0.168 : 0.16) * m.hipScale, 0.13 * m.hipScale) * scale;
  const thW = (isFemale ? 0.084 : 0.088) * m.thighScale * scale;
  const cfW = (isFemale ? 0.056 : 0.060) * m.calfScale * scale;
  const armW = (isFemale ? 0.044 : 0.050) * m.armScale * scale;
  const hdR = 0.105 * m.headScale * scale;

  const yHead = baseY - 1.68 * scale;
  const yNeck = baseY - 1.48 * scale;
  const yShoulder = baseY - 1.40 * scale;
  const yChest = baseY - 1.24 * scale;
  const yWaist = baseY - 1.04 * scale;
  const yHip = baseY - 0.88 * scale;
  const yKnee = baseY - 0.48 * scale;
  const yAnkle = baseY - 0.08 * scale;

  const makeCylinderGrad = (x0, x1, hexColor) => {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, shadeHex(hexColor, 0.74));
    g.addColorStop(0.32, shadeHex(hexColor, 1.10));
    g.addColorStop(0.68, hexColor);
    g.addColorStop(1, shadeHex(hexColor, 0.68));
    return g;
  };

  // Pedestal ellipse
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, baseY + 6, scale * 0.36, scale * 0.07, 0, 0, Math.PI * 2);
  ctx.fillStyle = darkHud ? 'rgba(0, 229, 255, 0.14)' : 'rgba(28, 25, 23, 0.07)';
  ctx.fill();
  ctx.strokeStyle = darkHud ? 'rgba(0, 229, 255, 0.55)' : 'rgba(28, 25, 23, 0.18)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Legs
  const legColor = loadout.bottom?.color_hex || skinHex;
  const legSpacing = hpW * 0.48;
  for (const side of [-1, 1]) {
    const lx = cx + side * legSpacing * cosY;
    ctx.beginPath();
    ctx.moveTo(lx - thW * 0.55, yHip);
    ctx.quadraticCurveTo(lx - thW * 0.58, (yHip + yKnee) / 2, lx - cfW * 0.52, yKnee);
    ctx.lineTo(lx - cfW * 0.42, yAnkle);
    ctx.lineTo(lx + cfW * 0.42, yAnkle);
    ctx.lineTo(lx + cfW * 0.52, yKnee);
    ctx.quadraticCurveTo(lx + thW * 0.58, (yHip + yKnee) / 2, lx + thW * 0.55, yHip);
    ctx.closePath();
    ctx.fillStyle = makeCylinderGrad(lx - thW, lx + thW, legColor);
    ctx.fill();
  }

  // Torso (silhouette clearly showing chest / waist / belly / hip differences across the 7 body shapes)
  const torsoColor = loadout.outer?.color_hex || loadout.top?.color_hex || skinHex;
  const bellyShift = sinY * (m.bellyDepth - 1.0) * scale * 0.16;

  ctx.beginPath();
  ctx.moveTo(cx - shW, yShoulder);
  ctx.quadraticCurveTo(cx - chW, yChest, cx - waW + bellyShift, yWaist);
  ctx.quadraticCurveTo(cx - hpW, (yWaist + yHip) / 2, cx - hpW * 0.92, yHip + 10);
  ctx.lineTo(cx + hpW * 0.92, yHip + 10);
  ctx.quadraticCurveTo(cx + hpW, (yWaist + yHip) / 2, cx + waW + bellyShift, yWaist);
  ctx.quadraticCurveTo(cx + chW, yChest, cx + shW, yShoulder);
  ctx.closePath();
  ctx.fillStyle = makeCylinderGrad(cx - shW, cx + shW, torsoColor);
  ctx.fill();

  // Arms
  const armColor = loadout.outer?.color_hex || loadout.top?.color_hex || skinHex;
  for (const side of [-1, 1]) {
    const sx = cx + side * (shW + armW * 0.2);
    const wx = cx + side * (shW + armW * 0.95);
    ctx.beginPath();
    ctx.moveTo(sx - armW * 0.5, yShoulder + 4);
    ctx.lineTo(wx - armW * 0.38, yHip + 8);
    ctx.lineTo(wx + armW * 0.38, yHip + 8);
    ctx.lineTo(sx + armW * 0.5, yShoulder + 4);
    ctx.closePath();
    ctx.fillStyle = makeCylinderGrad(sx - armW, sx + armW, armColor);
    ctx.fill();
  }

  // Neck & Head
  const neckW = hdR * 0.44;
  ctx.fillStyle = makeCylinderGrad(cx - neckW, cx + neckW, skinHex);
  ctx.fillRect(cx - neckW, yNeck - 6, neckW * 2, yShoulder - yNeck + 10);

  ctx.beginPath();
  ctx.ellipse(cx, yHead, hdR * 0.84, hdR * 1.08, 0, 0, Math.PI * 2);
  ctx.fillStyle = makeCylinderGrad(cx - hdR, cx + hdR, skinHex);
  ctx.fill();

  return { anat };
}

function shadeHex(hex, factor = 1.0) {
  const clean = String(hex || '#CCCCCC').replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return '#CCCCCC';
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * factor)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
