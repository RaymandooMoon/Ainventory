import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Copy,
  Download,
  FolderOpen,
  RotateCcw,
  Upload,
} from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  MEGASCANS_SLOT_IDS,
  MEGASCANS_SLOT_SPECS,
  buildMegascansSlotConfigPayload,
  canAccessAdminMegascansLab,
  classifyMegascansTextureRole,
  type MegascansManifest,
  type MegascansSlotId,
} from '../../three/megascans/megascansCatalog.ts';
import {
  createMegascansSession,
  ensureGeometryUv1ForAo,
} from '../../three/megascans/megascansMaterialLoader.ts';
import { tx } from '../../utils/i18n.ts';
import { emitStatusCapsule, triggerHaptic } from '../../utils/nativeBridge.ts';
import { ResponsiveSheetModal } from '../common/AppUI.jsx';
import {
  createStudioEnvironmentTexture,
  detectSoftwareWebGlFromContext,
  disposeObject3DTree,
} from './threeRuntimeCapabilities.ts';
import './AdminMegascansLabModal.css';

type PreviewGeoKind = 'pedestal' | 'floor' | 'sphere' | 'torus' | 'glb';
type ProceduralPresetKind = 'marble' | 'wool' | 'stone' | 'brass';

interface ChannelEntry {
  tex?: THREE.Texture;
  info: string;
}

interface ChannelStateSnapshot {
  albedo: string | null;
  normal: string | null;
  orm: string | null;
  displacement: string | null;
  glb: string | null;
}

interface RawOrmImages {
  ao: HTMLImageElement | null;
  roughness: HTMLImageElement | null;
  roughnessIsGloss: boolean;
  metalness: HTMLImageElement | null;
}

export interface AdminMegascansLabModalProps {
  open: boolean;
  onClose: () => void;
  user?: {
    role?: string | null;
    username?: string | null;
    permissions?: readonly string[] | null;
    isSampleDemo?: boolean;
  } | null;
  theme?: 'light' | 'dark' | string;
  lang?: 'ko' | 'en' | string;
}

function defaultGeoForSlot(slotId: MegascansSlotId): PreviewGeoKind {
  if (slotId === 'showroom-pedestal' || slotId === 'gacha-plinth') return 'pedestal';
  if (slotId === 'atelier-fabric') return 'sphere';
  if (slotId === 'gacha-metal') return 'torus';
  return 'floor';
}

function decodeImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function generateProceduralPbrCanvases(kind: ProceduralPresetKind): {
  albedo: HTMLCanvasElement;
  normal: HTMLCanvasElement;
  orm: HTMLCanvasElement;
} {
  const size = 256;
  const albCanvas = document.createElement('canvas');
  const normCanvas = document.createElement('canvas');
  const ormCanvas = document.createElement('canvas');
  albCanvas.width = normCanvas.width = ormCanvas.width = size;
  albCanvas.height = normCanvas.height = ormCanvas.height = size;

  const aCtx = albCanvas.getContext('2d');
  const nCtx = normCanvas.getContext('2d');
  const oCtx = ormCanvas.getContext('2d');
  if (!aCtx || !nCtx || !oCtx) {
    return { albedo: albCanvas, normal: normCanvas, orm: ormCanvas };
  }

  const aImg = aCtx.createImageData(size, size);
  const nImg = nCtx.createImageData(size, size);
  const oImg = oCtx.createImageData(size, size);
  const heightField = new Float32Array(size * size);

  const hash = (x: number, y: number): number => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return s - Math.floor(s);
  };
  const smoothNoise = (x: number, y: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const fbm = (x: number, y: number): number => {
    let v = 0;
    let amp = 0.5;
    let freq = 1;
    for (let i = 0; i < 4; i++) {
      v += amp * smoothNoise(x * freq, y * freq);
      freq *= 2;
      amp *= 0.5;
    }
    return v;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const idx = y * size + x;
      const p = idx * 4;
      let r = 40;
      let g = 40;
      let b = 44;
      let ao = 235;
      let rough = 120;
      let metal = 10;
      let h = 0.5;

      if (kind === 'marble') {
        const n = fbm(u * 6, v * 6);
        const vein = Math.pow(Math.abs(Math.sin((u * 3.5 + v * 2.2 + n * 2.4) * Math.PI)), 10);
        const fine = smoothNoise(u * 32, v * 32) * 0.12;
        r = Math.round(24 + vein * 170 + fine * 14);
        g = Math.round(24 + vein * 155 + fine * 12);
        b = Math.round(28 + vein * 130 + fine * 12);
        ao = Math.round(220 + vein * 30);
        rough = Math.round(52 + (1 - vein) * 56 + fine * 40);
        metal = 12;
        h = 0.5 + vein * 0.16 + fine * 0.08;
      } else if (kind === 'wool') {
        const wx = Math.sin(u * Math.PI * 80);
        const wy = Math.sin(v * Math.PI * 80);
        const twill = Math.sin((u + v) * Math.PI * 54);
        const weave = (wx * wy * 0.4 + twill * 0.6) * 0.5 + 0.5;
        const grain = smoothNoise(u * 36, v * 36) * 0.2;
        r = Math.round(48 + weave * 26 + grain * 12);
        g = Math.round(47 + weave * 25 + grain * 12);
        b = Math.round(50 + weave * 25 + grain * 12);
        ao = Math.round(170 + weave * 75);
        rough = Math.round(195 + (1 - weave) * 48);
        metal = 0;
        h = weave * 0.75 + grain * 0.25;
      } else if (kind === 'stone') {
        const n1 = fbm(u * 8, v * 16);
        const pore = smoothNoise(u * 40, v * 24) > 0.78 ? -0.35 : 0;
        r = Math.round(196 + (n1 - 0.5) * 34 + pore * 42);
        g = Math.round(188 + (n1 - 0.5) * 32 + pore * 40);
        b = Math.round(174 + (n1 - 0.5) * 28 + pore * 36);
        ao = Math.round(Math.max(120, 232 + pore * 120));
        rough = Math.round(150 + (1 - n1) * 60 - pore * 60);
        metal = 8;
        h = 0.55 + n1 * 0.25 + pore;
      } else {
        const streak =
          smoothNoise(u * 4, v * 120) * 0.65 + smoothNoise(u * 12, v * 52) * 0.35;
        r = Math.round(196 + streak * 32);
        g = Math.round(168 + streak * 28);
        b = Math.round(122 + streak * 22);
        ao = Math.round(225 + streak * 25);
        rough = Math.round(38 + streak * 54);
        metal = 242;
        h = 0.5 + streak * 0.22;
      }

      heightField[idx] = h;
      aImg.data[p] = Math.max(0, Math.min(255, r));
      aImg.data[p + 1] = Math.max(0, Math.min(255, g));
      aImg.data[p + 2] = Math.max(0, Math.min(255, b));
      aImg.data[p + 3] = 255;

      oImg.data[p] = Math.max(0, Math.min(255, ao));
      oImg.data[p + 1] = Math.max(0, Math.min(255, rough));
      oImg.data[p + 2] = Math.max(0, Math.min(255, metal));
      oImg.data[p + 3] = 255;
    }
  }

  const strength = 2.6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const ym = (y - 1 + size) % size;
      const yp = (y + 1) % size;
      const dx = (heightField[y * size + xp] - heightField[y * size + xm]) * strength;
      const dy = (heightField[yp * size + x] - heightField[ym * size + x]) * strength;
      const len = Math.hypot(dx, dy, 1);
      const p = (y * size + x) * 4;
      nImg.data[p] = Math.round(((-dx / len) * 0.5 + 0.5) * 255);
      nImg.data[p + 1] = Math.round(((-dy / len) * 0.5 + 0.5) * 255);
      nImg.data[p + 2] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      nImg.data[p + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);
  oCtx.putImageData(oImg, 0, 0);
  return { albedo: albCanvas, normal: normCanvas, orm: ormCanvas };
}

function packClientOrmCanvas(sources: RawOrmImages, defaultMetalness: number): HTMLCanvasElement {
  const ref = sources.roughness || sources.ao || sources.metalness;
  const size = Math.min(1024, Math.max(ref?.naturalWidth || 512, ref?.naturalHeight || 512));

  const readGray = (img: HTMLImageElement | null, fallback: number, invert: boolean): Uint8ClampedArray => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    if (!ctx) return new Uint8ClampedArray(size * size * 4);
    if (!img) {
      ctx.fillStyle = `rgb(${fallback},${fallback},${fallback})`;
      ctx.fillRect(0, 0, size, size);
    } else {
      ctx.drawImage(img, 0, 0, size, size);
    }
    const data = ctx.getImageData(0, 0, size, size).data;
    if (invert) {
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
      }
    }
    return data;
  };

  const aoData = readGray(sources.ao, 255, false);
  const rghData = readGray(sources.roughness, 190, sources.roughnessIsGloss);
  const metData = readGray(sources.metalness, Math.round(defaultMetalness * 255), false);

  const outCvs = document.createElement('canvas');
  outCvs.width = outCvs.height = size;
  const outCtx = outCvs.getContext('2d');
  if (!outCtx) return outCvs;
  const outImg = outCtx.createImageData(size, size);
  for (let i = 0; i < outImg.data.length; i += 4) {
    outImg.data[i] = aoData[i];
    outImg.data[i + 1] = rghData[i];
    outImg.data[i + 2] = metData[i];
    outImg.data[i + 3] = 255;
  }
  outCtx.putImageData(outImg, 0, 0);
  return outCvs;
}

interface LabEngineHandle {
  readonly applyPreset: (kind: ProceduralPresetKind) => void;
  readonly ingestFiles: (files: FileList | File[]) => Promise<void>;
  readonly syncVisuals: () => void;
  readonly resetAll: () => void;
  readonly dispose: () => void;
}

export default function AdminMegascansLabModal({
  open,
  onClose,
  user,
  theme = 'dark',
  lang = 'ko',
}: AdminMegascansLabModalProps) {
  const isAdminAllowed = canAccessAdminMegascansLab(user);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const engineRef = useRef<LabEngineHandle | null>(null);

  const [slotId, setSlotId] = useState<MegascansSlotId>('showroom-pedestal');
  const [geo, setGeo] = useState<PreviewGeoKind>('pedestal');
  const [stageTheme, setStageTheme] = useState<'dark' | 'light'>(
    theme === 'light' ? 'light' : 'dark'
  );
  const [autoSpin, setAutoSpin] = useState(true);
  const [rainSheen, setRainSheen] = useState(false);
  const [flipNormalY, setFlipNormalY] = useState(false);
  const [preserveAlbedo, setPreserveAlbedo] = useState(false);
  const [repeat, setRepeat] = useState(2.0);
  const [normalStrength, setNormalStrength] = useState(0.72);
  const [roughness, setRoughness] = useState(1.0);
  const [metalness, setMetalness] = useState(0.08);
  const [aoIntensity, setAoIntensity] = useState(0.65);
  const [envIntensity, setEnvIntensity] = useState(1.25);
  const [assetName, setAssetName] = useState('Procedural Demo (Obsidian Marble)');
  const [dragActive, setDragActive] = useState(false);
  const [fpsText, setFpsText] = useState('60');
  const [webglError, setWebglError] = useState<string | null>(null);
  const [liveManifest, setLiveManifest] = useState<MegascansManifest | null>(null);
  const [channels, setChannels] = useState<ChannelStateSnapshot>({
    albedo: null,
    normal: null,
    orm: null,
    displacement: null,
    glb: null,
  });

  const paramsRef = useRef({
    slotId,
    geo,
    stageTheme,
    autoSpin,
    rainSheen,
    flipNormalY,
    preserveAlbedo,
    repeat,
    normalStrength,
    roughness,
    metalness,
    aoIntensity,
    envIntensity,
    assetName,
  });

  // Query live `/assets/megascans/manifest.json` status when admin opens the modal
  useEffect(() => {
    if (!open || !isAdminAllowed) return undefined;
    let active = true;
    const session = createMegascansSession({ isSoftwareGl: false });
    void session.getManifest().then((manifest) => {
      if (active) setLiveManifest(manifest);
    });
    return () => {
      active = false;
      session.dispose();
    };
  }, [open, isAdminAllowed]);

  // Boot Three.js 0.187 studio canvas strictly while modal is open for admin
  useEffect(() => {
    if (!open || !isAdminAllowed) return undefined;
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      queueMicrotask(() => setWebglError(errMsg));
      return undefined;
    }

    const isSoftwareGl = detectSoftwareWebGlFromContext(renderer.getContext());
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftwareGl ? 1 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const envTexture = createStudioEnvironmentTexture(renderer, isSoftwareGl);
    scene.environment = envTexture;

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 1.45, 3.6);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0.48, 0);
    controls.minDistance = 1.2;
    controls.maxDistance = 10;

    const keyLight = new THREE.DirectionalLight(0xfff6e9, 1.75);
    keyLight.position.set(3.2, 5.2, 3.4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xd8c3a5, 1.1);
    rimLight.position.set(-3.4, 2.8, -3.0);
    scene.add(rimLight);

    const fillLight = new THREE.HemisphereLight(0xf3f6fc, 0x1c1b18, 0.55);
    scene.add(fillLight);

    const stageRoot = new THREE.Group();
    scene.add(stageRoot);

    const previewMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 1.0,
      metalness: 0.08,
      clearcoat: 0,
      clearcoatRoughness: 0.14,
      envMapIntensity: 1.25,
    });

    const champagneRimMat = new THREE.MeshStandardMaterial({
      color: 0xd6b889,
      metalness: 0.9,
      roughness: 0.2,
      envMapIntensity: 1.5,
    });

    // 1. Stepped Atelier Pedestal
    const pedestalGroup = new THREE.Group();
    const plinthPts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(1.08, 0),
      new THREE.Vector2(1.06, 0.14),
      new THREE.Vector2(0.96, 0.17),
      new THREE.Vector2(0.92, 0.44),
      new THREE.Vector2(0.84, 0.52),
      new THREE.Vector2(0, 0.52),
    ];
    const plinthGeo = new THREE.LatheGeometry(plinthPts, 56);
    ensureGeometryUv1ForAo(plinthGeo);
    pedestalGroup.add(new THREE.Mesh(plinthGeo, previewMat));

    const collarGeo = new THREE.TorusGeometry(0.965, 0.014, 12, 56);
    collarGeo.rotateX(Math.PI / 2);
    const collarMesh = new THREE.Mesh(collarGeo, champagneRimMat);
    collarMesh.position.y = 0.165;
    pedestalGroup.add(collarMesh);

    const topRimGeo = new THREE.TorusGeometry(0.845, 0.011, 12, 56);
    topRimGeo.rotateX(Math.PI / 2);
    const topRimMesh = new THREE.Mesh(topRimGeo, champagneRimMat);
    topRimMesh.position.y = 0.52;
    pedestalGroup.add(topRimMesh);
    stageRoot.add(pedestalGroup);

    // 2. Floor Disc
    const floorGeo = new THREE.CircleGeometry(2.1, 56);
    ensureGeometryUv1ForAo(floorGeo);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMesh = new THREE.Mesh(floorGeo, previewMat);
    floorMesh.position.y = 0.02;
    stageRoot.add(floorMesh);

    // 3. PBR Calibration Sphere
    const sphereGeo = new THREE.SphereGeometry(0.72, 64, 48);
    ensureGeometryUv1ForAo(sphereGeo);
    const sphereMesh = new THREE.Mesh(sphereGeo, previewMat);
    sphereMesh.position.y = 0.78;
    stageRoot.add(sphereMesh);

    // 4. Grazing-Angle TorusKnot
    const torusGeo = new THREE.TorusKnotGeometry(0.5, 0.17, 140, 28);
    ensureGeometryUv1ForAo(torusGeo);
    const torusMesh = new THREE.Mesh(torusGeo, previewMat);
    torusMesh.position.y = 0.78;
    stageRoot.add(torusMesh);

    // 5. Custom Dropped GLB Container
    const glbContainer = new THREE.Group();
    stageRoot.add(glbContainer);
    let glbMixer: THREE.AnimationMixer | null = null;
    const gltfLoader = new GLTFLoader();

    const channelRefs: {
      albedo: ChannelEntry | null;
      normal: ChannelEntry | null;
      orm: ChannelEntry | null;
      displacement: ChannelEntry | null;
      glb: ChannelEntry | null;
    } = {
      albedo: null,
      normal: null,
      orm: null,
      displacement: null,
      glb: null,
    };
    let rawOrm: RawOrmImages = {
      ao: null,
      roughness: null,
      roughnessIsGloss: false,
      metalness: null,
    };

    let disposed = false;
    let rafId = 0;

    const pushChannelSnapshot = () => {
      if (disposed) return;
      setChannels({
        albedo: channelRefs.albedo?.info ?? null,
        normal: channelRefs.normal?.info ?? null,
        orm: channelRefs.orm?.info ?? null,
        displacement: channelRefs.displacement?.info ?? null,
        glb: channelRefs.glb?.info ?? null,
      });
    };

    const disposeChannelTextures = () => {
      for (const key of ['albedo', 'normal', 'orm', 'displacement'] as const) {
        if (channelRefs[key]?.tex) {
          channelRefs[key]?.tex?.dispose();
          channelRefs[key] = null;
        }
      }
      rawOrm = { ao: null, roughness: null, roughnessIsGloss: false, metalness: null };
    };

    const clearGlb = () => {
      if (glbMixer) {
        glbMixer.stopAllAction();
        glbMixer = null;
      }
      disposeObject3DTree(glbContainer);
      glbContainer.clear();
      channelRefs.glb = null;
    };

    const syncVisuals = () => {
      if (disposed) return;
      const p = paramsRef.current;
      const aniso = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);

      const configure = (entry: ChannelEntry | null, cs: THREE.ColorSpace): THREE.Texture | null => {
        if (!entry?.tex) return null;
        const t = entry.tex;
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(p.repeat, p.repeat);
        t.colorSpace = cs;
        t.anisotropy = aniso;
        t.needsUpdate = true;
        return t;
      };

      const albedoTex = p.preserveAlbedo
        ? null
        : configure(channelRefs.albedo, THREE.SRGBColorSpace);
      const normalTex = configure(channelRefs.normal, THREE.NoColorSpace);
      const ormTex = configure(channelRefs.orm, THREE.NoColorSpace);

      previewMat.map = albedoTex;
      previewMat.color.setHex(
        albedoTex ? 0xffffff : p.stageTheme === 'dark' ? 0x26262c : 0xe4dfd6
      );
      previewMat.normalMap = normalTex;
      previewMat.normalScale.set(
        p.normalStrength,
        p.flipNormalY ? -p.normalStrength : p.normalStrength
      );
      previewMat.aoMap = ormTex;
      previewMat.aoMapIntensity = p.aoIntensity;
      previewMat.roughnessMap = ormTex;
      previewMat.metalnessMap = ormTex;
      previewMat.metalness = p.metalness;
      previewMat.envMapIntensity = p.envIntensity;

      if (p.rainSheen) {
        previewMat.roughness = Math.min(p.roughness, 0.22);
        previewMat.clearcoat = 0.85;
        previewMat.clearcoatRoughness = 0.08;
      } else {
        previewMat.roughness = p.roughness;
        previewMat.clearcoat = 0;
      }
      previewMat.needsUpdate = true;

      fillLight.groundColor.setHex(p.stageTheme === 'dark' ? 0x1c1b18 : 0xd6cfc2);

      glbContainer.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.envMapIntensity = p.envIntensity;
          }
        }
      });

      pedestalGroup.visible = p.geo === 'pedestal';
      floorMesh.visible = p.geo === 'floor';
      sphereMesh.visible = p.geo === 'sphere';
      torusMesh.visible = p.geo === 'torus';
      glbContainer.visible = p.geo === 'glb';
    };

    const applyPreset = (kind: ProceduralPresetKind) => {
      if (disposed) return;
      const canvases = generateProceduralPbrCanvases(kind);
      const mkTex = (cvs: HTMLCanvasElement, cs: THREE.ColorSpace): THREE.CanvasTexture => {
        const t = new THREE.CanvasTexture(cvs);
        t.colorSpace = cs;
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
        t.needsUpdate = true;
        return t;
      };

      disposeChannelTextures();
      channelRefs.albedo = {
        tex: mkTex(canvases.albedo, THREE.SRGBColorSpace),
        info: 'Procedural 256px',
      };
      channelRefs.normal = {
        tex: mkTex(canvases.normal, THREE.NoColorSpace),
        info: 'Procedural GL 256px',
      };
      channelRefs.orm = {
        tex: mkTex(canvases.orm, THREE.NoColorSpace),
        info: 'Packed ORM 256px',
      };
      channelRefs.displacement = null;

      const labelMap: Record<ProceduralPresetKind, { name: string; metal: number }> = {
        marble: { name: 'Procedural Demo (Obsidian Marble)', metal: 0.12 },
        wool: { name: 'Procedural Demo (Tailored Wool)', metal: 0.0 },
        stone: { name: 'Procedural Demo (Honed Travertine)', metal: 0.08 },
        brass: { name: 'Procedural Demo (Brushed Brass)', metal: 1.0 },
      };

      setFlipNormalY(false);
      setRoughness(1.0);
      setMetalness(labelMap[kind].metal);
      setAssetName(labelMap[kind].name);
      paramsRef.current.flipNormalY = false;
      paramsRef.current.roughness = 1.0;
      paramsRef.current.metalness = labelMap[kind].metal;
      paramsRef.current.assetName = labelMap[kind].name;
      syncVisuals();
      pushChannelSnapshot();
    };

    const ingestFiles = async (fileList: FileList | File[]) => {
      const files = Array.from(fileList || []);
      if (!files.length || disposed) return;

      let loadedCount = 0;
      let clearedDemo = false;

      for (const file of files) {
        if (disposed) return;
        const lower = file.name.toLowerCase();
        if (lower.endsWith('.glb') || lower.endsWith('.gltf')) {
          try {
            const buffer = await file.arrayBuffer();
            if (disposed) return;
            await new Promise<void>((resolve, reject) => {
              gltfLoader.parse(
                buffer,
                '',
                (gltf) => {
                  if (disposed) {
                    disposeObject3DTree(gltf.scene);
                    resolve();
                    return;
                  }
                  clearGlb();
                  const model = gltf.scene;
                  const box = new THREE.Box3().setFromObject(model);
                  const size = box.getSize(new THREE.Vector3());
                  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
                  model.scale.setScalar(1.75 / maxDim);
                  const scaledBox = new THREE.Box3().setFromObject(model);
                  const center = scaledBox.getCenter(new THREE.Vector3());
                  model.position.set(-center.x, -scaledBox.min.y, -center.z);
                  glbContainer.add(model);

                  if (gltf.animations.length > 0) {
                    glbMixer = new THREE.AnimationMixer(model);
                    glbMixer.clipAction(gltf.animations[0]).play();
                  }

                  channelRefs.glb = {
                    info: `${file.name} (${Math.round(file.size / 1024)} KB)`,
                  };
                  setGeo('glb');
                  paramsRef.current.geo = 'glb';
                  const cleanName = file.name.replace(/\.(glb|gltf)$/i, '');
                  setAssetName(cleanName);
                  paramsRef.current.assetName = cleanName;
                  loadedCount += 1;
                  resolve();
                },
                reject
              );
            });
          } catch {
            emitStatusCapsule(tx(lang, `GLB 파싱 실패: ${file.name}`, `GLB parse failed: ${file.name}`));
          }
          continue;
        }

        const cls = classifyMegascansTextureRole(file.name);
        if (!cls) continue;

        if (!clearedDemo && paramsRef.current.assetName.startsWith('Procedural Demo')) {
          disposeChannelTextures();
          clearedDemo = true;
        }

        try {
          const img = await decodeImageFile(file);
          if (disposed) return;
          const dimLabel = `${img.naturalWidth}×${img.naturalHeight}`;

          if (cls.role === 'albedo') {
            channelRefs.albedo?.tex?.dispose();
            channelRefs.albedo = { tex: new THREE.Texture(img), info: `${file.name} (${dimLabel})` };
            const inferred = file.name.split('_')[0] || file.name;
            setAssetName(inferred);
            paramsRef.current.assetName = inferred;
            loadedCount += 1;
          } else if (cls.role === 'normal') {
            channelRefs.normal?.tex?.dispose();
            channelRefs.normal = { tex: new THREE.Texture(img), info: `${file.name} (${dimLabel})` };
            const isDx = cls.normalConvention === 'directx';
            setFlipNormalY(isDx);
            paramsRef.current.flipNormalY = isDx;
            loadedCount += 1;
          } else if (cls.role === 'orm' || cls.role === 'ordp') {
            channelRefs.orm?.tex?.dispose();
            channelRefs.orm = { tex: new THREE.Texture(img), info: `${file.name} (${dimLabel})` };
            loadedCount += 1;
          } else if (cls.role === 'ao') {
            rawOrm.ao = img;
            loadedCount += 1;
          } else if (cls.role === 'roughness') {
            rawOrm.roughness = img;
            rawOrm.roughnessIsGloss = cls.isGloss;
            loadedCount += 1;
          } else if (cls.role === 'metalness') {
            rawOrm.metalness = img;
            loadedCount += 1;
          } else if (cls.role === 'displacement') {
            channelRefs.displacement?.tex?.dispose();
            channelRefs.displacement = {
              tex: new THREE.Texture(img),
              info: `${file.name} (${dimLabel})`,
            };
            loadedCount += 1;
          }
        } catch {
          // ignore unreadable image file
        }
      }

      if (rawOrm.ao || rawOrm.roughness || rawOrm.metalness) {
        const ormCanvas = packClientOrmCanvas(rawOrm, paramsRef.current.metalness);
        channelRefs.orm?.tex?.dispose();
        const ormTex = new THREE.CanvasTexture(ormCanvas);
        ormTex.colorSpace = THREE.NoColorSpace;
        ormTex.needsUpdate = true;
        const parts = [
          rawOrm.ao ? 'AO' : null,
          rawOrm.roughness ? (rawOrm.roughnessIsGloss ? 'Gloss→R' : 'Rgh') : null,
          rawOrm.metalness ? 'Met' : null,
        ]
          .filter(Boolean)
          .join('+');
        channelRefs.orm = { tex: ormTex, info: `Auto-ORM (${parts}) ${ormCanvas.width}px` };
      }

      if (loadedCount > 0) {
        syncVisuals();
        pushChannelSnapshot();
        triggerHaptic('success');
        emitStatusCapsule(
          tx(lang, `${loadedCount}개 메가스캔 에셋 로드 완료`, `Loaded ${loadedCount} Megascans asset(s)`)
        );
      } else {
        emitStatusCapsule(
          tx(
            lang,
            '인식 가능한 PBR 텍스처 또는 GLB 파일을 찾지 못했습니다',
            'No recognized PBR textures or GLB files found'
          )
        );
      }
    };

    const resetAll = () => {
      clearGlb();
      const targetGeo = defaultGeoForSlot(paramsRef.current.slotId);
      setGeo(targetGeo);
      paramsRef.current.geo = targetGeo;
      applyPreset('marble');
    };

    const handleResize = () => {
      if (disposed) return;
      const w = Math.max(1, viewport.clientWidth);
      const h = Math.max(1, viewport.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    resizeObserver?.observe(viewport);
    handleResize();

    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    };
    const onContextRestored = () => {
      if (!disposed) {
        rafId = requestAnimationFrame(animate);
      }
    };
    canvas.addEventListener('webglcontextlost', onContextLost, false);
    canvas.addEventListener('webglcontextrestored', onContextRestored, false);

    applyPreset('marble');

    const clock = new THREE.Clock();
    let fpsFrames = 0;
    let fpsAccum = 0;

    function animate() {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (paramsRef.current.autoSpin) {
        stageRoot.rotation.y += dt * 0.32;
      }
      if (glbMixer) {
        glbMixer.update(dt);
      }
      controls.update();
      renderer.render(scene, camera);

      fpsFrames += 1;
      fpsAccum += dt;
      if (fpsAccum >= 0.6) {
        setFpsText(String(Math.round(fpsFrames / fpsAccum)));
        fpsFrames = 0;
        fpsAccum = 0;
      }
    }

    if (isSoftwareGl) {
      renderer.render(scene, camera);
    } else {
      rafId = requestAnimationFrame(animate);
    }

    const handle: LabEngineHandle = {
      applyPreset,
      ingestFiles,
      syncVisuals: () => {
        syncVisuals();
        if (isSoftwareGl && !disposed) {
          renderer.render(scene, camera);
        }
      },
      resetAll,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        if (rafId) cancelAnimationFrame(rafId);
        resizeObserver?.disconnect();
        canvas.removeEventListener('webglcontextlost', onContextLost, false);
        canvas.removeEventListener('webglcontextrestored', onContextRestored, false);
        controls.dispose();
        disposeChannelTextures();
        clearGlb();
        scene.environment = null;
        envTexture.dispose();
        disposeObject3DTree(scene);
        renderer.dispose();
      },
    };
    engineRef.current = handle;

    return () => {
      engineRef.current = null;
      handle.dispose();
    };
  }, [open, isAdminAllowed, lang]);

  // Sync React controls to live Three.js engine without remounting WebGL
  useEffect(() => {
    paramsRef.current = {
      slotId,
      geo,
      stageTheme,
      autoSpin,
      rainSheen,
      flipNormalY,
      preserveAlbedo,
      repeat,
      normalStrength,
      roughness,
      metalness,
      aoIntensity,
      envIntensity,
      assetName,
    };
    engineRef.current?.syncVisuals();
  }, [
    slotId,
    geo,
    stageTheme,
    autoSpin,
    rainSheen,
    flipNormalY,
    preserveAlbedo,
    repeat,
    normalStrength,
    roughness,
    metalness,
    aoIntensity,
    envIntensity,
    assetName,
  ]);

  const handleSelectSlot = useCallback((nextSlot: MegascansSlotId) => {
    const spec = MEGASCANS_SLOT_SPECS[nextSlot];
    setSlotId(nextSlot);
    setRepeat(spec.defaultRepeat[0]);
    setNormalStrength(spec.defaultNormalStrength);
    setAoIntensity(spec.defaultAoIntensity);
    setMetalness(spec.targetDefaultMetalness);
    setPreserveAlbedo(spec.preserveOriginalAlbedo);
    if (!channels.glb) {
      setGeo(defaultGeoForSlot(nextSlot));
    }
    triggerHaptic('selection');
  }, [channels.glb]);

  const buildConfigJson = useCallback((): string => {
    const payload = buildMegascansSlotConfigPayload({
      assetName,
      repeat,
      normalStrength,
      aoMapIntensity: aoIntensity,
      flipNormalY,
      preserveOriginalAlbedo: preserveAlbedo,
    });
    return JSON.stringify(payload, null, 2);
  }, [assetName, repeat, normalStrength, aoIntensity, flipNormalY, preserveAlbedo]);

  const handleCopyConfig = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildConfigJson());
      triggerHaptic('success');
      emitStatusCapsule(
        tx(lang, `${slotId}/slot.config.json 복사됨`, `Copied ${slotId}/slot.config.json`)
      );
    } catch {
      emitStatusCapsule(
        tx(lang, '클립보드 권한이 없어 JSON 저장을 사용해 주세요', 'Use JSON Save (clipboard unavailable)')
      );
    }
  }, [buildConfigJson, slotId, lang]);

  const handleDownloadConfig = useCallback(() => {
    const blob = new Blob([`${buildConfigJson()}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'slot.config.json';
    a.click();
    URL.revokeObjectURL(url);
    triggerHaptic('selection');
    emitStatusCapsule(
      tx(lang, `${slotId}용 slot.config.json 저장됨`, `Saved slot.config.json for ${slotId}`)
    );
  }, [buildConfigJson, slotId, lang]);

  if (!isAdminAllowed) {
    return null;
  }

  const activeSlotSpec = MEGASCANS_SLOT_SPECS[slotId];
  const isSlotSyncedLive = Boolean(liveManifest?.slots?.[slotId]);
  const activeMapCount = [
    channels.albedo,
    channels.normal,
    channels.orm,
    channels.displacement,
    channels.glb,
  ].filter(Boolean).length;

  return (
    <ResponsiveSheetModal
      id="admin-megascans-lab-modal"
      open={open}
      onClose={onClose}
      lang={lang}
      eyebrow="ADMIN · 3D LAB"
      title={tx(lang, 'Quixel Megascans 3D 랩', 'Quixel Megascans 3D Lab')}
      actions={null}
      expandable={false}
      onExpandedChange={undefined}
      footer={null}
      maxWidth={1040}
    >
      <div
        className="megascans-lab-shell"
        data-admin-megascans-lab="true"
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragActive) setDragActive(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setDragActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer?.files?.length) {
            void engineRef.current?.ingestFiles(e.dataTransfer.files);
          }
        }}
      >
        {/* Left: Live Three.js 0.187 Studio Canvas */}
        <div className="megascans-lab-stage-card">
          <div
            ref={viewportRef}
            className={`megascans-lab-viewport ${stageTheme === 'light' ? 'is-light-stage' : ''}`.trim()}
          >
            <canvas ref={canvasRef} className="megascans-lab-canvas" />

            {webglError && (
              <div className="megascans-lab-drop-overlay" role="alert">
                <strong>{tx(lang, 'WebGL 초기화 오류', 'WebGL Initialization Error')}</strong>
                <span className="hig-caption">{webglError}</span>
              </div>
            )}

            {dragActive && (
              <div className="megascans-lab-drop-overlay" aria-hidden="true">
                <strong>{tx(lang, 'Fab Megascans 파일 드롭', 'Drop Fab Megascans Assets')}</strong>
                <span className="hig-caption">
                  {tx(
                    lang,
                    'Albedo · Normal(GL/DX) · ORM · AO · Roughness · Metalness 또는 .glb 모델',
                    'Albedo · Normal(GL/DX) · ORM · AO · Roughness · Metalness or .glb model'
                  )}
                </span>
              </div>
            )}

            <div className="megascans-lab-hud-top">
              <div className="megascans-lab-capsule">
                <span className="megascans-lab-sand-dot" aria-hidden="true" />
                <span>FPS {fpsText}</span>
                <span>·</span>
                <span>Maps {activeMapCount}</span>
                <span>·</span>
                <span>{flipNormalY ? 'DX (-Y)' : 'GL (+Y)'}</span>
              </div>

              <div className="megascans-lab-pill-bar" role="group" aria-label="Stage Theme">
                <button
                  type="button"
                  className="megascans-lab-pill"
                  aria-pressed={stageTheme === 'dark'}
                  onClick={() => setStageTheme('dark')}
                >
                  OLED Noir
                </button>
                <button
                  type="button"
                  className="megascans-lab-pill"
                  aria-pressed={stageTheme === 'light'}
                  onClick={() => setStageTheme('light')}
                >
                  Daylight
                </button>
              </div>
            </div>

            <div className="megascans-lab-hud-bottom">
              <div className="megascans-lab-pill-bar" role="group" aria-label="Geometry">
                {(
                  [
                    ['pedestal', 'Pedestal'],
                    ['floor', 'Floor'],
                    ['sphere', 'Sphere'],
                    ['torus', 'Torus'],
                    ['glb', 'GLB'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className="megascans-lab-pill"
                    aria-pressed={geo === key}
                    onClick={() => setGeo(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="megascans-lab-pill-bar" role="group" aria-label="Motion & Weather">
                <button
                  type="button"
                  className="megascans-lab-pill"
                  aria-pressed={autoSpin}
                  onClick={() => setAutoSpin((v) => !v)}
                >
                  Spin
                </button>
                <button
                  type="button"
                  className="megascans-lab-pill"
                  aria-pressed={rainSheen}
                  onClick={() => setRainSheen((v) => !v)}
                >
                  Rain Sheen
                </button>
              </div>
            </div>
          </div>

          <div className="hig-sheet-row-between" style={{ paddingInline: 4 }}>
            <span className="hig-caption">
              {tx(
                lang,
                '저장한 slot.config.json과 Fab 에셋을 .megascans-inbox/<slot-id>/에 넣고 npm run megascans:sync 실행',
                'Place slot.config.json + Fab files into .megascans-inbox/<slot-id>/ and run npm run megascans:sync'
              )}
            </span>
          </div>
        </div>

        {/* Right: Editorial Inspector */}
        <div className="megascans-lab-inspector">
          {/* 1. Drop-In & Presets */}
          <div className="hig-sheet-card">
            <div className="hig-sheet-row-between">
              <span className="hig-caption" style={{ fontWeight: 700 }}>
                {tx(lang, '1. Fab 에셋 드롭인', '1. Fab Asset Drop-In')}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => engineRef.current?.resetAll()}
              >
                <RotateCcw size={13} />
                <span>{tx(lang, '초기화', 'Reset')}</span>
              </button>
            </div>

            <div className={`megascans-lab-dropzone ${dragActive ? 'is-drag-over' : ''}`.trim()}>
              <p className="hig-caption">
                {tx(
                  lang,
                  'Fab.com PBR 텍스처(여러 장) 또는 .glb를 끌어다 놓으세요. 분리된 AO·Roughness·Metalness는 자동 ORM 패킹됩니다.',
                  'Drop Fab.com PBR textures or .glb files anywhere. Separate AO, Roughness & Metalness auto-pack into ORM.'
                )}
              </p>
              <div className="hig-grid-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} />
                  <span>{tx(lang, '파일 선택', 'Files')}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => folderInputRef.current?.click()}
                >
                  <FolderOpen size={14} />
                  <span>{tx(lang, '폴더 선택', 'Folder')}</span>
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.glb,.gltf"
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) {
                    void engineRef.current?.ingestFiles(e.target.files);
                  }
                  e.target.value = '';
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                multiple
                // @ts-expect-error webkitdirectory is supported by Chromium/Safari for local folder drop-in
                webkitdirectory=""
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) {
                    void engineRef.current?.ingestFiles(e.target.files);
                  }
                  e.target.value = '';
                }}
              />
            </div>

            <div className="hig-grid-2">
              {(
                [
                  ['marble', 'Obsidian Marble'],
                  ['wool', 'Tailored Wool'],
                  ['stone', 'Honed Travertine'],
                  ['brass', 'Brushed Brass'],
                ] as const
              ).map(([presetKey, label]) => (
                <button
                  key={presetKey}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    triggerHaptic('selection');
                    engineRef.current?.applyPreset(presetKey);
                  }}
                >
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Target Slot Preset */}
          <div className="hig-sheet-card">
            <div className="hig-sheet-row-between">
              <span className="hig-caption" style={{ fontWeight: 700 }}>
                {tx(lang, '2. Ainventory 슬롯 프리셋', '2. Ainventory Slot Preset')}
              </span>
              <span className="megascans-lab-slot-badge">
                <span className={`megascans-lab-dot ${isSlotSyncedLive ? 'is-active' : ''}`} />
                {isSlotSyncedLive
                  ? tx(lang, '실서버 반영됨', 'Synced Live')
                  : tx(lang, '프로시저럴 대기', 'Procedural Fallback')}
              </span>
            </div>

            <select
              aria-label={tx(lang, '대상 메가스캔 슬롯', 'Target Megascans Slot')}
              value={slotId}
              onChange={(e) => handleSelectSlot(e.target.value as MegascansSlotId)}
              className="hig-native-input"
              style={{ minHeight: 40, fontSize: 13 }}
            >
              {MEGASCANS_SLOT_IDS.map((id) => {
                const spec = MEGASCANS_SLOT_SPECS[id];
                return (
                  <option key={id} value={id}>
                    {id} — {lang === 'en' ? spec.labelEn : spec.labelKo}
                  </option>
                );
              })}
            </select>

            <div className="megascans-lab-keywords">
              {tx(lang, 'Fab 추천 검색어: ', 'Fab Keywords: ')}
              <strong>{activeSlotSpec.fabKeywords.join(', ')}</strong>
            </div>
          </div>

          {/* 3. PBR Calibration */}
          <div className="hig-sheet-card">
            <span className="hig-caption" style={{ fontWeight: 700 }}>
              {tx(lang, '3. PBR 보정', '3. PBR Calibration')}
            </span>

            <div className="hig-grid-2">
              <button
                type="button"
                className={`btn ${flipNormalY ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                aria-pressed={flipNormalY}
                onClick={() => setFlipNormalY((v) => !v)}
              >
                <span>{flipNormalY ? 'Normal: DX (-Y)' : 'Normal: GL (+Y)'}</span>
              </button>
              <button
                type="button"
                className={`btn ${preserveAlbedo ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                aria-pressed={preserveAlbedo}
                onClick={() => setPreserveAlbedo((v) => !v)}
              >
                <span>{tx(lang, '원본 Albedo 유지', 'Keep Albedo')}</span>
              </button>
            </div>

            <div className="megascans-lab-slider-group">
              <label className="megascans-lab-slider-row">
                <span className="megascans-lab-slider-meta">
                  <span>UV Repeat</span>
                  <span className="megascans-lab-slider-val">{repeat.toFixed(1)}×</span>
                </span>
                <input
                  className="megascans-lab-range"
                  type="range"
                  min={1}
                  max={8}
                  step={0.2}
                  value={repeat}
                  onChange={(e) => setRepeat(Number(e.target.value))}
                />
              </label>

              <label className="megascans-lab-slider-row">
                <span className="megascans-lab-slider-meta">
                  <span>Normal Strength</span>
                  <span className="megascans-lab-slider-val">{normalStrength.toFixed(2)}</span>
                </span>
                <input
                  className="megascans-lab-range"
                  type="range"
                  min={0}
                  max={2}
                  step={0.02}
                  value={normalStrength}
                  onChange={(e) => setNormalStrength(Number(e.target.value))}
                />
              </label>

              <label className="megascans-lab-slider-row">
                <span className="megascans-lab-slider-meta">
                  <span>Roughness</span>
                  <span className="megascans-lab-slider-val">{roughness.toFixed(2)}</span>
                </span>
                <input
                  className="megascans-lab-range"
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.01}
                  value={roughness}
                  onChange={(e) => setRoughness(Number(e.target.value))}
                />
              </label>

              <label className="megascans-lab-slider-row">
                <span className="megascans-lab-slider-meta">
                  <span>Metalness</span>
                  <span className="megascans-lab-slider-val">{metalness.toFixed(2)}</span>
                </span>
                <input
                  className="megascans-lab-range"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={metalness}
                  onChange={(e) => setMetalness(Number(e.target.value))}
                />
              </label>

              <label className="megascans-lab-slider-row">
                <span className="megascans-lab-slider-meta">
                  <span>AO Intensity</span>
                  <span className="megascans-lab-slider-val">{aoIntensity.toFixed(2)}</span>
                </span>
                <input
                  className="megascans-lab-range"
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={aoIntensity}
                  onChange={(e) => setAoIntensity(Number(e.target.value))}
                />
              </label>

              <label className="megascans-lab-slider-row">
                <span className="megascans-lab-slider-meta">
                  <span>Studio IBL</span>
                  <span className="megascans-lab-slider-val">{envIntensity.toFixed(2)}</span>
                </span>
                <input
                  className="megascans-lab-range"
                  type="range"
                  min={0.4}
                  max={2.4}
                  step={0.05}
                  value={envIntensity}
                  onChange={(e) => setEnvIntensity(Number(e.target.value))}
                />
              </label>
            </div>
          </div>

          {/* 4. Loaded Channels & slot.config.json Export */}
          <div className="hig-sheet-card">
            <span className="hig-caption" style={{ fontWeight: 700 }}>
              {tx(lang, '4. 채널 상태 및 내보내기', '4. Channels & Export')}
            </span>

            <div className="megascans-lab-channel-list">
              {(
                [
                  ['Albedo', channels.albedo],
                  ['Normal', channels.normal],
                  ['ORM (AO·Rgh·Met)', channels.orm],
                  ['Displacement', channels.displacement],
                  ['GLB Model', channels.glb],
                ] as const
              ).map(([label, detail]) => (
                <div key={label} className="megascans-lab-channel-row">
                  <span className="megascans-lab-channel-name">
                    <span className={`megascans-lab-dot ${detail ? 'is-active' : ''}`} />
                    <span>{label}</span>
                  </span>
                  <span
                    className="megascans-lab-channel-detail"
                    title={detail ?? tx(lang, '미연결', 'Not loaded')}
                  >
                    {detail ?? tx(lang, '미연결', 'Not loaded')}
                  </span>
                </div>
              ))}
            </div>

            <div className="hig-grid-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleCopyConfig}
              >
                <Copy size={13} />
                <span>{tx(lang, 'JSON 복사', 'Copy JSON')}</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleDownloadConfig}
              >
                <Download size={13} />
                <span>{tx(lang, 'JSON 저장', 'Save JSON')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </ResponsiveSheetModal>
  );
}
