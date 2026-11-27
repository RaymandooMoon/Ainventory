import * as THREE from 'three';
import type { FruitBoxCell, GridSelectionRect } from '../fruitBoxEngine.ts';
import {
  createAppleLeafGeometry,
  createDigitAtlasTexture,
  createInstancedDigitMaterial,
  createJuiceParticleMaterial,
  createNeonBackdropMaterial,
  createSculptedAppleGeometry,
  createShockwaveRingMaterial,
} from './appleAssets.ts';

export type SelectionVisualState = 'idle' | 'under' | 'exact' | 'over';

export interface AppleStageBurstEvent {
  readonly clearedCells: readonly FruitBoxCell[];
  readonly centroidCol: number;
  readonly centroidRow: number;
  readonly combo: number;
  readonly goldenCount: number;
  readonly isFever: boolean;
}

export interface AppleStageController {
  syncBoard: (cells: readonly FruitBoxCell[], cols: number, rows: number, animateEntrance?: boolean) => void;
  setSelection: (
    rect: GridSelectionRect | null,
    selectedIds: readonly number[],
    state: SelectionVisualState
  ) => void;
  setHintIds: (ids: readonly number[]) => void;
  triggerBurst: (event: AppleStageBurstEvent) => void;
  setFeverLevel: (level: number) => void;
  setSoftColors: (soft: boolean) => void;
  setHighFx: (highFx: boolean) => void;
  setReducedMotion: (reduced: boolean) => void;
  clientToGrid: (clientX: number, clientY: number) => { col: number; row: number } | null;
  gridToClient: (col: number, row: number) => { x: number; y: number } | null;
  resize: (width: number, height: number) => void;
  dispose: () => void;
}

export interface CreateAppleArcadeStageOptions {
  readonly canvas: HTMLCanvasElement;
  readonly cols: number;
  readonly rows: number;
  readonly softColors?: boolean;
  readonly highFx?: boolean;
  readonly reducedMotion?: boolean;
  readonly onWebglUnavailable?: (reason: string) => void;
}

interface FlyingAppleAnim {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  vRotX: number;
  vRotY: number;
  age: number;
  duration: number;
  scale: number;
  isGolden: boolean;
}

interface ShockwaveEntry {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  active: boolean;
  age: number;
  duration: number;
  maxScale: number;
}

const MAX_CELLS = 170;
const CELL_PITCH = 1.06;
const MAX_PARTICLES = 1200;
const MAX_SHOCKWAVES = 14;
const AMBIENT_ORB_COUNT = 64;

function isSoftwareWebGL(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const label = String(
      dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    ).toLowerCase();
    return (
      label.includes('swiftshader') ||
      label.includes('llvmpipe') ||
      label.includes('software') ||
      label.includes('warp')
    );
  } catch {
    return false;
  }
}

export function createAppleArcadeStage(
  options: CreateAppleArcadeStageOptions
): AppleStageController | null {
  const { canvas, onWebglUnavailable } = options;

  let renderer: THREE.WebGLRenderer;
  try {
    // Use `powerPreference: 'default'` for Windows Optimus/hybrid-GPU stability
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'default',
      failIfMajorPerformanceCaveat: false,
      preserveDrawingBuffer: false,
    });
  } catch {
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        alpha: false,
        powerPreference: 'default',
        failIfMajorPerformanceCaveat: false,
        preserveDrawingBuffer: false,
      });
    } catch (err) {
      onWebglUnavailable?.(err instanceof Error ? err.message : 'webgl_init_failed');
      return null;
    }
  }

  const gl = renderer.getContext();
  if (!gl || gl.isContextLost()) {
    renderer.dispose();
    onWebglUnavailable?.('webgl_context_lost_on_init');
    return null;
  }

  const isSoftwareGl = isSoftwareWebGL(renderer);
  const maxDpr = isSoftwareGl ? 1.0 : 1.75;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;

  // Main 3D scene & backdrop scene
  const backdropScene = new THREE.Scene();
  const backdropCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const backdropMat = createNeonBackdropMaterial();
  const backdropQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), backdropMat);
  backdropScene.add(backdropQuad);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.5, 120);
  camera.position.set(0, 0, 22);

  // Dynamic 3-point Neon Arcade Studio Lighting
  const ambientLight = new THREE.AmbientLight(0xdbe8ff, 0.92);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.35);
  keyLight.position.set(5, 9, 16);
  scene.add(keyLight);

  const cyanRimLight = new THREE.PointLight(0x00f5ff, 34, 48, 1.5);
  cyanRimLight.position.set(-12, 6, 8);
  scene.add(cyanRimLight);

  const magentaRimLight = new THREE.PointLight(0xff2a85, 34, 48, 1.5);
  magentaRimLight.position.set(12, -5, 8);
  scene.add(magentaRimLight);

  const goldAccentLight = new THREE.PointLight(0xffd700, 0, 32, 1.6);
  goldAccentLight.position.set(0, 0, 7);
  scene.add(goldAccentLight);

  // Sculpted Board Frame Platform (translucent neon obsidian glass tray behind apples)
  const boardPlateGeo = new THREE.PlaneGeometry(1, 1);
  const boardPlateMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0c0820'),
    roughness: 0.28,
    metalness: 0.35,
    transparent: true,
    opacity: 0.56,
  });
  const boardPlateMesh = new THREE.Mesh(boardPlateGeo, boardPlateMat);
  boardPlateMesh.position.set(0, 0, -0.62);
  scene.add(boardPlateMesh);

  const tempBorderBox = new THREE.BoxGeometry(1, 1, 0.08);
  const boardBorderGeo = new THREE.EdgesGeometry(tempBorderBox);
  tempBorderBox.dispose();
  const boardBorderMat = new THREE.LineBasicMaterial({
    color: new THREE.Color('#48d8ff'),
    transparent: true,
    opacity: 0.42,
  });
  const boardBorderLines = new THREE.LineSegments(boardBorderGeo, boardBorderMat);
  boardBorderLines.position.set(0, 0, -0.56);
  scene.add(boardBorderLines);

  // Instanced 3D Sculpted Apples (170 instances -> 1 GPU draw call!)
  const appleGeo = createSculptedAppleGeometry(isSoftwareGl ? 14 : 22);
  const appleMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'),
    roughness: 0.2,
    metalness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.12,
    emissive: new THREE.Color('#220512'),
    emissiveIntensity: 0.38,
  });
  const appleMesh = new THREE.InstancedMesh(appleGeo, appleMat, MAX_CELLS);
  appleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(appleMesh);

  // Instanced 3D Emerald Leaves
  const leafGeo = createAppleLeafGeometry();
  const leafMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffffff'),
    roughness: 0.3,
    metalness: 0.12,
    emissive: new THREE.Color('#0a4d2c'),
    emissiveIntensity: 0.45,
  });
  const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, MAX_CELLS);
  leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(leafMesh);

  // Instanced Crisp High-DPI Numbers (1 draw call!)
  const digitAtlas = createDigitAtlasTexture();
  const digitGeo = new THREE.PlaneGeometry(0.68, 0.68);
  const digitValuesAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CELLS), 1);
  const digitStatesAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CELLS), 1);
  const digitAlphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CELLS), 1);
  digitValuesAttr.setUsage(THREE.DynamicDrawUsage);
  digitStatesAttr.setUsage(THREE.DynamicDrawUsage);
  digitAlphaAttr.setUsage(THREE.DynamicDrawUsage);
  digitGeo.setAttribute('aDigit', digitValuesAttr);
  digitGeo.setAttribute('aState', digitStatesAttr);
  digitGeo.setAttribute('aAlpha', digitAlphaAttr);

  const digitMat = digitAtlas
    ? createInstancedDigitMaterial(digitAtlas)
    : new THREE.MeshBasicMaterial({ visible: false });
  const digitMesh = new THREE.InstancedMesh(digitGeo, digitMat, MAX_CELLS);
  digitMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  digitMesh.renderOrder = 4;
  scene.add(digitMesh);

  // 3D Laser Selection Field (translucent prism + glowing border)
  const selGroup = new THREE.Group();
  selGroup.visible = false;
  selGroup.renderOrder = 6;

  const selFillMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#00f5ff'),
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const selFillMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), selFillMat);
  selFillMesh.position.z = 0.56;
  selGroup.add(selFillMesh);

  const selOutlineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.5, -0.5, 0),
    new THREE.Vector3(0.5, -0.5, 0),
    new THREE.Vector3(0.5, 0.5, 0),
    new THREE.Vector3(-0.5, 0.5, 0),
  ]);
  const selOutlineMat = new THREE.LineBasicMaterial({
    color: new THREE.Color('#00f5ff'),
    transparent: true,
    opacity: 0.96,
  });
  const selOutline = new THREE.LineLoop(selOutlineGeo, selOutlineMat);
  selOutline.position.z = 0.6;
  selGroup.add(selOutline);
  scene.add(selGroup);

  // Pooled 3D Shockwave Rings
  const ringGeo = new THREE.PlaneGeometry(1, 1);
  const shockwaves: ShockwaveEntry[] = [];
  for (let i = 0; i < MAX_SHOCKWAVES; i += 1) {
    const material = createShockwaveRingMaterial();
    const mesh = new THREE.Mesh(ringGeo, material);
    mesh.visible = false;
    mesh.renderOrder = 7;
    scene.add(mesh);
    shockwaves.push({ mesh, material, active: false, age: 0, duration: 0.65, maxScale: 4.5 });
  }
  let shockwaveCursor = 0;

  // Pooled 3D Juicy Splash & Neon Spark Particles (1,200 pooled GPU points, zero GC!)
  const pPos = new Float32Array(MAX_PARTICLES * 3);
  const pVel = new Float32Array(MAX_PARTICLES * 3);
  const pCol = new Float32Array(MAX_PARTICLES * 3);
  const pSize = new Float32Array(MAX_PARTICLES);
  const pAlpha = new Float32Array(MAX_PARTICLES);
  const pAge = new Float32Array(MAX_PARTICLES);
  const pLife = new Float32Array(MAX_PARTICLES);

  const particleGeo = new THREE.BufferGeometry();
  const pPosAttr = new THREE.BufferAttribute(pPos, 3);
  const pColAttr = new THREE.BufferAttribute(pCol, 3);
  const pSizeAttr = new THREE.BufferAttribute(pSize, 1);
  const pAlphaAttr = new THREE.BufferAttribute(pAlpha, 1);
  pPosAttr.setUsage(THREE.DynamicDrawUsage);
  pColAttr.setUsage(THREE.DynamicDrawUsage);
  pSizeAttr.setUsage(THREE.DynamicDrawUsage);
  pAlphaAttr.setUsage(THREE.DynamicDrawUsage);
  particleGeo.setAttribute('position', pPosAttr);
  particleGeo.setAttribute('aColor', pColAttr);
  particleGeo.setAttribute('aSize', pSizeAttr);
  particleGeo.setAttribute('aAlpha', pAlphaAttr);

  const particleMat = createJuiceParticleMaterial();
  const particlePoints = new THREE.Points(particleGeo, particleMat);
  particlePoints.frustumCulled = false;
  particlePoints.renderOrder = 8;
  scene.add(particlePoints);
  let particleCursor = 0;

  // Ambient Floating Neon Dust Orbs in background depth
  const orbPos = new Float32Array(AMBIENT_ORB_COUNT * 3);
  const orbCol = new Float32Array(AMBIENT_ORB_COUNT * 3);
  const orbSize = new Float32Array(AMBIENT_ORB_COUNT);
  const orbAlpha = new Float32Array(AMBIENT_ORB_COUNT);
  const orbSeed = new Float32Array(AMBIENT_ORB_COUNT);
  const orbPalette = [
    new THREE.Color('#00f5ff'),
    new THREE.Color('#ff2a85'),
    new THREE.Color('#ffd700'),
    new THREE.Color('#8b5cf6'),
    new THREE.Color('#39ff14'),
  ];
  for (let i = 0; i < AMBIENT_ORB_COUNT; i += 1) {
    orbPos[i * 3] = (Math.random() - 0.5) * 32;
    orbPos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    orbPos[i * 3 + 2] = -2.2 - Math.random() * 8;
    const c = orbPalette[i % orbPalette.length];
    orbCol[i * 3] = c.r;
    orbCol[i * 3 + 1] = c.g;
    orbCol[i * 3 + 2] = c.b;
    orbSize[i] = 0.25 + Math.random() * 0.65;
    orbAlpha[i] = 0.22 + Math.random() * 0.32;
    orbSeed[i] = Math.random() * Math.PI * 2;
  }
  const orbGeo = new THREE.BufferGeometry();
  const orbPosAttr = new THREE.BufferAttribute(orbPos, 3);
  orbGeo.setAttribute('position', orbPosAttr);
  orbGeo.setAttribute('aColor', new THREE.BufferAttribute(orbCol, 3));
  orbGeo.setAttribute('aSize', new THREE.BufferAttribute(orbSize, 1));
  orbGeo.setAttribute('aAlpha', new THREE.BufferAttribute(orbAlpha, 1));
  const orbMat = createJuiceParticleMaterial();
  const orbPoints = new THREE.Points(orbGeo, orbMat);
  orbPoints.frustumCulled = false;
  scene.add(orbPoints);

  // Runtime mutable state
  let boardCols = options.cols;
  let boardRows = options.rows;
  let cells: readonly FruitBoxCell[] = [];
  let selectedSet = new Set<number>();
  let hintSet = new Set<number>();
  let selectionRect: GridSelectionRect | null = null;
  let selectionState: SelectionVisualState = 'idle';
  let softColors = Boolean(options.softColors);
  let highFx = options.highFx ?? !isSoftwareGl;
  let reducedMotion = Boolean(options.reducedMotion);
  let targetFever = 0;
  let smoothFever = 0;
  let smoothSoft = softColors ? 1 : 0;

  let viewportW = Math.max(2, canvas.clientWidth || window.innerWidth || 1280);
  let viewportH = Math.max(2, canvas.clientHeight || window.innerHeight || 720);
  let baseCameraZ = 22;
  let cameraShake = 0;
  let cameraFovPunch = 0;
  let entranceTime = 0;

  const hoverSpring = new Float32Array(MAX_CELLS);
  const flyingAnims: FlyingAppleAnim[] = Array.from({ length: MAX_CELLS }, () => ({
    active: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    vRotX: 0,
    vRotY: 0,
    age: 0,
    duration: 0.45,
    scale: 1,
    isGolden: false,
  }));

  // Reusable math scratch objects (zero per-frame allocations)
  const dummyObj = new THREE.Object3D();
  const digitObj = new THREE.Object3D();
  const scratchColor = new THREE.Color();
  const scratchLeafColor = new THREE.Color();
  const raycaster = new THREE.Raycaster();
  const ndcVec = new THREE.Vector2();
  const boardPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const rayHit = new THREE.Vector3();
  const projVec = new THREE.Vector3();

  // Vivid Neon Arcade Apple Palettes
  const COL_RUBY = new THREE.Color('#ff244c');
  const COL_RUBY_ALT = new THREE.Color('#ff3b6b');
  const COL_SOFT_APPLE = new THREE.Color('#e08a8c');
  const COL_GOLDEN = new THREE.Color('#ffc41c');
  const COL_SELECTED_CYAN = new THREE.Color('#00e5ff');
  const COL_EXACT_EMERALD = new THREE.Color('#2cff75');
  const COL_OVER_PINK = new THREE.Color('#ff1476');
  const COL_HINT_CYAN = new THREE.Color('#4cf8ff');
  const COL_LEAF_NEON = new THREE.Color('#19ff8c');
  const COL_LEAF_GOLD = new THREE.Color('#fff199');
  const COL_LEAF_SOFT = new THREE.Color('#74b58b');

  const gridToWorld = (colCenter: number, rowCenter: number): { x: number; y: number } => {
    const x = (colCenter - boardCols * 0.5) * CELL_PITCH;
    const y = (boardRows * 0.5 - rowCenter) * CELL_PITCH;
    return { x, y };
  };

  const worldToGrid = (wx: number, wy: number): { col: number; row: number } => {
    const col = wx / CELL_PITCH + boardCols * 0.5;
    const row = boardRows * 0.5 - wy / CELL_PITCH;
    return { col, row };
  };

  const updateBoardFrameAndCamera = (): void => {
    const boardW = boardCols * CELL_PITCH;
    const boardH = boardRows * CELL_PITCH;

    boardPlateMesh.scale.set(boardW + 0.9, boardH + 0.9, 1);
    boardBorderLines.scale.set(boardW + 0.92, boardH + 0.92, 1);

    const aspect = Math.max(0.4, viewportW / Math.max(1, viewportH));
    camera.aspect = aspect;
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const tanHalfFov = Math.tan(fovRad * 0.5);

    // Reserve clean breathing margin around the board so nothing clips at any viewport size
    const padX = aspect < 0.85 ? 1.08 : 1.13;
    const padY = aspect < 0.85 ? 1.08 : 1.15;
    const distY = (boardH * 0.5 * padY) / tanHalfFov;
    const distX = (boardW * 0.5 * padX) / (tanHalfFov * aspect);

    baseCameraZ = Math.max(distX, distY) + 1.4;
    camera.position.set(0, 0, baseCameraZ);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    backdropMat.uniforms.uAspect.value = aspect;
  };

  const PARTICLE_PALETTE_GOLDEN = [
    new THREE.Color('#ffe066'),
    new THREE.Color('#ffaa00'),
    new THREE.Color('#ffffff'),
    new THREE.Color('#ff55cc'),
  ];
  const PARTICLE_PALETTE_FEVER = [
    new THREE.Color('#00f5ff'),
    new THREE.Color('#ff2a85'),
    new THREE.Color('#39ff14'),
    new THREE.Color('#ffd700'),
  ];
  const PARTICLE_PALETTE_CLASSIC = [
    new THREE.Color('#ff2e5f'),
    new THREE.Color('#ff8a3d'),
    new THREE.Color('#39ff14'),
    new THREE.Color('#00f5ff'),
  ];

  const spawnBurstParticles = (
    wx: number,
    wy: number,
    count: number,
    isGolden: boolean,
    isFever: boolean
  ): void => {
    const scaledCount = highFx ? count : Math.max(8, Math.round(count * 0.45));
    const palette = isGolden
      ? PARTICLE_PALETTE_GOLDEN
      : isFever
        ? PARTICLE_PALETTE_FEVER
        : PARTICLE_PALETTE_CLASSIC;

    for (let i = 0; i < scaledCount; i += 1) {
      const idx = particleCursor;
      particleCursor = (particleCursor + 1) % MAX_PARTICLES;

      const angle = Math.random() * Math.PI * 2;
      const speed = 2.6 + Math.random() * (isGolden ? 8.2 : 5.8);
      pPos[idx * 3] = wx + (Math.random() - 0.5) * 0.35;
      pPos[idx * 3 + 1] = wy + (Math.random() - 0.5) * 0.35;
      pPos[idx * 3 + 2] = 0.35 + Math.random() * 0.35;

      pVel[idx * 3] = Math.cos(angle) * speed;
      pVel[idx * 3 + 1] = Math.sin(angle) * speed + 1.8;
      pVel[idx * 3 + 2] = 1.6 + Math.random() * 4.4;

      const c = palette[i % palette.length];
      pCol[idx * 3] = c.r;
      pCol[idx * 3 + 1] = c.g;
      pCol[idx * 3 + 2] = c.b;

      pSize[idx] = (isGolden ? 0.55 : 0.36) + Math.random() * 0.52;
      pAge[idx] = 0;
      pLife[idx] = 0.48 + Math.random() * 0.45;
      pAlpha[idx] = 1.0;
    }
  };

  const spawnShockwave = (
    wx: number,
    wy: number,
    colorHex: string,
    maxScale: number,
    duration = 0.62
  ): void => {
    const sw = shockwaves[shockwaveCursor];
    shockwaveCursor = (shockwaveCursor + 1) % MAX_SHOCKWAVES;
    sw.active = true;
    sw.age = 0;
    sw.duration = duration;
    sw.maxScale = maxScale;
    sw.mesh.position.set(wx, wy, 0.48);
    sw.mesh.scale.set(0.4, 0.4, 1);
    sw.material.uniforms.uColor.value.set(colorHex);
    sw.material.uniforms.uAlpha.value = 0.95;
    sw.mesh.visible = true;
  };

  const updateSelectionMesh = (elapsed: number): void => {
    if (!selectionRect) {
      selGroup.visible = false;
      return;
    }
    const minC = Math.min(selectionRect.x1, selectionRect.x2);
    const maxC = Math.max(selectionRect.x1, selectionRect.x2);
    const minR = Math.min(selectionRect.y1, selectionRect.y2);
    const maxR = Math.max(selectionRect.y1, selectionRect.y2);

    const w = Math.max(0.18, (maxC - minC) * CELL_PITCH);
    const h = Math.max(0.18, (maxR - minR) * CELL_PITCH);
    const center = gridToWorld((minC + maxC) * 0.5, (minR + maxR) * 0.5);

    selGroup.visible = true;
    selGroup.position.set(center.x, center.y, 0);
    selFillMesh.scale.set(w, h, 1);
    selOutline.scale.set(w, h, 1);

    if (selectionState === 'exact') {
      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 16.0);
      selFillMat.color.set(pulse > 0.5 ? '#39ff14' : '#ffd700');
      selFillMat.opacity = 0.24 + 0.1 * pulse;
      selOutlineMat.color.set('#b8ff6b');
    } else if (selectionState === 'over') {
      selFillMat.color.set('#ff1476');
      selFillMat.opacity = 0.22;
      selOutlineMat.color.set('#ff5599');
    } else {
      selFillMat.color.set('#00f5ff');
      selFillMat.opacity = 0.16;
      selOutlineMat.color.set('#5cf8ff');
    }
  };

  // Context loss protection
  let isContextLost = false;
  let disposed = false;
  let rafId = 0;
  let lastFrameTime = performance.now();
  let elapsed = 0;

  const onContextLost = (ev: Event): void => {
    ev.preventDefault();
    isContextLost = true;
    onWebglUnavailable?.('webgl_context_lost');
  };
  const onContextRestored = (): void => {
    isContextLost = false;
    updateBoardFrameAndCamera();
  };
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  const resize = (width: number, height: number): void => {
    if (disposed) return;
    viewportW = Math.max(2, Math.floor(width));
    viewportH = Math.max(2, Math.floor(height));
    const dpr = Math.min(window.devicePixelRatio || 1, highFx ? maxDpr : 1.0);
    renderer.setPixelRatio(dpr);
    renderer.setSize(viewportW, viewportH, false);
    updateBoardFrameAndCamera();
  };

  const renderLoop = (now: number): void => {
    if (disposed) return;
    rafId = window.requestAnimationFrame(renderLoop);
    if (isContextLost || document.hidden) {
      lastFrameTime = now;
      return;
    }

    const rawDt = (now - lastFrameTime) * 0.001;
    lastFrameTime = now;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));
    elapsed += dt;
    entranceTime += dt;

    // Smooth shader uniform transitions
    smoothFever += (targetFever - smoothFever) * Math.min(1, dt * 4.5);
    smoothSoft += ((softColors ? 1 : 0) - smoothSoft) * Math.min(1, dt * 6.0);
    backdropMat.uniforms.uTime.value = reducedMotion ? elapsed * 0.2 : elapsed;
    backdropMat.uniforms.uFever.value = smoothFever;
    backdropMat.uniforms.uSoft.value = smoothSoft;
    backdropMat.uniforms.uPulseAge.value += dt;

    if (digitMat instanceof THREE.ShaderMaterial) {
      digitMat.uniforms.uTime.value = elapsed;
    }

    // Orbit neon accent lights gently
    const lightOrbit = reducedMotion ? 0.2 : elapsed * (0.65 + smoothFever * 1.1);
    cyanRimLight.position.x = Math.cos(lightOrbit) * 13;
    cyanRimLight.position.y = Math.sin(lightOrbit * 0.7) * 7;
    cyanRimLight.intensity = 30 + smoothFever * 22;

    magentaRimLight.position.x = Math.cos(lightOrbit + Math.PI) * 13;
    magentaRimLight.position.y = Math.sin(lightOrbit * 0.7 + Math.PI) * 7;
    magentaRimLight.intensity = 30 + smoothFever * 24;

    goldAccentLight.intensity = Math.max(0, goldAccentLight.intensity - dt * 55);

    // Subtle camera punch & shake decay
    if (cameraShake > 0.001) {
      cameraShake = Math.max(0, cameraShake - dt * 2.8);
    }
    if (cameraFovPunch > 0.001) {
      cameraFovPunch = Math.max(0, cameraFovPunch - dt * 9.0);
    }
    const shakeAmp = reducedMotion ? 0 : cameraShake * 0.24;
    camera.position.x = (Math.sin(elapsed * 58) * shakeAmp);
    camera.position.y = (Math.cos(elapsed * 67) * shakeAmp);
    camera.position.z = baseCameraZ - (reducedMotion ? 0 : cameraFovPunch * 0.42);

    // Update border color with fever energy
    boardBorderMat.color.setHSL((0.54 + smoothFever * 0.35 + Math.sin(elapsed * 0.6) * 0.04) % 1, 0.9, 0.64);
    boardBorderMat.opacity = 0.34 + smoothFever * 0.36;

    // Update all 170 instanced 3D apples, leaves & numbers
    const count = Math.min(MAX_CELLS, cells.length);
    for (let i = 0; i < MAX_CELLS; i += 1) {
      const cell = i < count ? cells[i] : null;
      const fly = flyingAnims[i];

      if (fly.active) {
        fly.age += dt;
        const progress = fly.age / fly.duration;
        if (progress >= 1) {
          fly.active = false;
          dummyObj.scale.set(0, 0, 0);
          dummyObj.position.set(0, 0, -50);
          dummyObj.updateMatrix();
          appleMesh.setMatrixAt(i, dummyObj.matrix);
          leafMesh.setMatrixAt(i, dummyObj.matrix);
          digitMesh.setMatrixAt(i, dummyObj.matrix);
          digitAlphaAttr.setX(i, 0);
        } else {
          fly.vy -= 18.0 * dt;
          fly.x += fly.vx * dt;
          fly.y += fly.vy * dt;
          fly.z += fly.vz * dt;
          fly.rotX += fly.vRotX * dt;
          fly.rotY += fly.vRotY * dt;

          const s = fly.scale * (1 - progress * progress) * (1 + Math.sin(progress * Math.PI) * 0.28);
          dummyObj.position.set(fly.x, fly.y, fly.z);
          dummyObj.rotation.set(fly.rotX, fly.rotY, fly.rotZ);
          dummyObj.scale.set(s, s, s);
          dummyObj.updateMatrix();
          appleMesh.setMatrixAt(i, dummyObj.matrix);
          leafMesh.setMatrixAt(i, dummyObj.matrix);

          digitObj.position.set(fly.x, fly.y, fly.z + 0.45 * s);
          digitObj.rotation.set(0, 0, fly.rotY * 0.3);
          digitObj.scale.set(s, s, s);
          digitObj.updateMatrix();
          digitMesh.setMatrixAt(i, digitObj.matrix);
          digitAlphaAttr.setX(i, Math.max(0, 1 - progress * 1.4));
        }
        continue;
      }

      if (!cell || cell.cleared) {
        dummyObj.scale.set(0, 0, 0);
        dummyObj.position.set(0, 0, -50);
        dummyObj.updateMatrix();
        appleMesh.setMatrixAt(i, dummyObj.matrix);
        leafMesh.setMatrixAt(i, dummyObj.matrix);
        digitMesh.setMatrixAt(i, dummyObj.matrix);
        digitAlphaAttr.setX(i, 0);
        continue;
      }

      const isSelected = selectedSet.has(cell.id);
      const isHint = hintSet.has(cell.id);
      const targetHover = isSelected ? 1 : isHint ? 0.55 : 0;
      hoverSpring[i] += (targetHover - hoverSpring[i]) * Math.min(1, dt * 16);

      // Diagonal stadium wave entrance easing (snappy ~0.48s across 17x10 or 10x17)
      const waveDelay = cell.col * 0.011 + cell.row * 0.014;
      const rawEnter = reducedMotion ? 1 : Math.max(0, Math.min(1, (entranceTime - waveDelay) * 4.4));
      const enterScale =
        rawEnter >= 1
          ? 1
          : 1 - Math.pow(1 - rawEnter, 3) + Math.sin(rawEnter * Math.PI) * 0.14;

      const { x, y } = gridToWorld(cell.col + 0.5, cell.row + 0.5);
      const breathe = reducedMotion
        ? 0
        : Math.sin(elapsed * 2.4 + cell.col * 0.45 + cell.row * 0.6) * 0.032;

      const h = hoverSpring[i];
      const exactPulse =
        isSelected && selectionState === 'exact'
          ? 0.08 * Math.sin(elapsed * 18.0 + cell.id)
          : 0;
      const overWobble =
        isSelected && selectionState === 'over' && !reducedMotion
          ? Math.sin(elapsed * 36.0 + cell.id) * 0.09
          : 0;

      const finalScale = Math.max(0.001, enterScale * (1.0 + h * 0.16 + exactPulse));
      const posZ = h * 0.54 + breathe * 1.6 + (cell.isGolden ? 0.1 : 0);

      dummyObj.position.set(x + overWobble, y + breathe, posZ);
      dummyObj.rotation.set(
        breathe * 0.9,
        (reducedMotion ? 0 : Math.sin(elapsed * 1.4 + cell.id * 0.37) * 0.16) +
          (cell.isGolden && !reducedMotion ? Math.sin(elapsed * 3.2 + cell.id) * 0.25 : 0),
        overWobble * 1.4
      );
      dummyObj.scale.set(finalScale, finalScale, finalScale);
      dummyObj.updateMatrix();
      appleMesh.setMatrixAt(i, dummyObj.matrix);
      leafMesh.setMatrixAt(i, dummyObj.matrix);

      // Apple surface color modulation
      if (isSelected && selectionState === 'exact') {
        scratchColor.copy(COL_EXACT_EMERALD).lerp(COL_GOLDEN, 0.32 + 0.25 * Math.sin(elapsed * 16));
      } else if (isSelected && selectionState === 'over') {
        scratchColor.copy(COL_OVER_PINK);
      } else if (isSelected) {
        scratchColor.copy(cell.isGolden ? COL_GOLDEN : COL_RUBY).lerp(COL_SELECTED_CYAN, 0.46);
      } else if (isHint) {
        const hp = 0.5 + 0.5 * Math.sin(elapsed * 9.0);
        scratchColor.copy(cell.isGolden ? COL_GOLDEN : COL_RUBY).lerp(COL_HINT_CYAN, 0.55 * hp);
      } else if (cell.isGolden) {
        scratchColor.copy(COL_GOLDEN);
      } else {
        scratchColor
          .copy((cell.col + cell.row) % 2 === 0 ? COL_RUBY : COL_RUBY_ALT)
          .lerp(COL_SOFT_APPLE, smoothSoft * 0.72);
      }
      appleMesh.setColorAt(i, scratchColor);

      scratchLeafColor
        .copy(cell.isGolden ? COL_LEAF_GOLD : COL_LEAF_NEON)
        .lerp(COL_LEAF_SOFT, smoothSoft * 0.72);
      leafMesh.setColorAt(i, scratchLeafColor);

      // Crisp front-mounted digit quad floating cleanly in front of the apple belly
      digitObj.position.set(x + overWobble, y + breathe - 0.02, posZ + 0.49 * finalScale);
      digitObj.rotation.set(0, 0, overWobble * 0.6);
      digitObj.scale.set(finalScale, finalScale, 1);
      digitObj.updateMatrix();
      digitMesh.setMatrixAt(i, digitObj.matrix);

      digitValuesAttr.setX(i, cell.value);
      const dState = isSelected
        ? selectionState === 'exact'
          ? 2
          : selectionState === 'over'
            ? 3
            : 1
        : isHint
          ? 4
          : 0;
      digitStatesAttr.setX(i, dState);
      digitAlphaAttr.setX(i, Math.min(1, rawEnter * 1.4));
    }

    appleMesh.instanceMatrix.needsUpdate = true;
    if (appleMesh.instanceColor) appleMesh.instanceColor.needsUpdate = true;
    leafMesh.instanceMatrix.needsUpdate = true;
    if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
    digitMesh.instanceMatrix.needsUpdate = true;
    digitValuesAttr.needsUpdate = true;
    digitStatesAttr.needsUpdate = true;
    digitAlphaAttr.needsUpdate = true;

    // Update 3D laser selection box
    updateSelectionMesh(elapsed);

    // Update expanding shockwave rings
    for (let i = 0; i < shockwaves.length; i += 1) {
      const sw = shockwaves[i];
      if (!sw.active) continue;
      sw.age += dt;
      const p = sw.age / sw.duration;
      if (p >= 1) {
        sw.active = false;
        sw.mesh.visible = false;
      } else {
        const eased = 1 - Math.pow(1 - p, 3);
        const s = 0.5 + eased * sw.maxScale;
        sw.mesh.scale.set(s, s, 1);
        sw.material.uniforms.uAlpha.value = (1 - p) * (1 - p) * 0.92;
      }
    }

    // Update juicy splash & spark particles
    let hasActiveParticles = false;
    for (let i = 0; i < MAX_PARTICLES; i += 1) {
      if (pAlpha[i] <= 0.001) continue;
      pAge[i] += dt;
      const ratio = pAge[i] / Math.max(0.05, pLife[i]);
      if (ratio >= 1) {
        pAlpha[i] = 0;
      } else {
        hasActiveParticles = true;
        pVel[i * 3] *= 1 - dt * 1.8;
        pVel[i * 3 + 1] = pVel[i * 3 + 1] * (1 - dt * 1.3) - 10.5 * dt;
        pVel[i * 3 + 2] *= 1 - dt * 2.1;

        pPos[i * 3] += pVel[i * 3] * dt;
        pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
        pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
        pAlpha[i] = Math.pow(1 - ratio, 1.5);
      }
    }
    if (hasActiveParticles) {
      pPosAttr.needsUpdate = true;
      pColAttr.needsUpdate = true;
      pSizeAttr.needsUpdate = true;
      pAlphaAttr.needsUpdate = true;
    }

    // Gentle floating background neon dust
    if (!reducedMotion && highFx) {
      for (let i = 0; i < AMBIENT_ORB_COUNT; i += 1) {
        orbPos[i * 3 + 1] += dt * (0.28 + smoothFever * 0.55);
        orbPos[i * 3] += Math.sin(elapsed * 0.7 + orbSeed[i]) * dt * 0.25;
        if (orbPos[i * 3 + 1] > 11) {
          orbPos[i * 3 + 1] = -11;
        }
      }
      orbPosAttr.needsUpdate = true;
    }

    // Render backdrop pass then 3D arcade scene pass
    renderer.autoClear = false;
    renderer.clear();
    renderer.render(backdropScene, backdropCamera);
    renderer.clearDepth();
    renderer.render(scene, camera);
  };

  resize(viewportW, viewportH);
  rafId = window.requestAnimationFrame(renderLoop);

  return {
    syncBoard(nextCells, cols, rows, animateEntrance = false) {
      const dimsChanged = cols !== boardCols || rows !== boardRows;
      boardCols = cols;
      boardRows = rows;
      cells = nextCells;
      if (dimsChanged) {
        updateBoardFrameAndCamera();
      }
      if (animateEntrance) {
        entranceTime = 0;
        for (let i = 0; i < MAX_CELLS; i += 1) {
          flyingAnims[i].active = false;
          hoverSpring[i] = 0;
        }
      }
    },
    setSelection(rect, selectedIds, state) {
      selectionRect = rect;
      selectedSet = new Set(selectedIds);
      selectionState = state;
    },
    setHintIds(ids) {
      hintSet = new Set(ids);
    },
    triggerBurst(event) {
      const centerWorld = gridToWorld(event.centroidCol, event.centroidRow);
      const hasGolden = event.goldenCount > 0;

      // Launch cleared apples in 3D parabolic arcs + emit particles from every popped apple
      for (let i = 0; i < event.clearedCells.length; i += 1) {
        const c = event.clearedCells[i];
        const w = gridToWorld(c.col + 0.5, c.row + 0.5);
        if (c.id >= 0 && c.id < MAX_CELLS) {
          const fly = flyingAnims[c.id];
          fly.active = true;
          fly.x = w.x;
          fly.y = w.y;
          fly.z = 0.5;
          fly.vx = (w.x - centerWorld.x) * 2.6 + (Math.random() - 0.5) * 4.2;
          fly.vy = 4.2 + Math.random() * 3.8;
          fly.vz = 4.5 + Math.random() * 4.0;
          fly.rotX = 0;
          fly.rotY = 0;
          fly.rotZ = 0;
          fly.vRotX = (Math.random() - 0.5) * 14;
          fly.vRotY = (Math.random() - 0.5) * 14;
          fly.age = 0;
          fly.duration = 0.44 + Math.random() * 0.14;
          fly.scale = 1.15;
          fly.isGolden = c.isGolden;
        }
        spawnBurstParticles(
          w.x,
          w.y,
          c.isGolden ? 48 : 26,
          c.isGolden,
          event.isFever || event.combo >= 3
        );
      }

      // Expanding neon shockwave rings!
      const ringColor = hasGolden
        ? '#ffd700'
        : event.isFever || event.combo >= 4
          ? '#ff2a85'
          : '#39ff14';
      spawnShockwave(
        centerWorld.x,
        centerWorld.y,
        ringColor,
        3.6 + event.clearedCells.length * 0.85,
        0.58
      );
      if (hasGolden || event.combo >= 3 || event.clearedCells.length >= 4) {
        spawnShockwave(centerWorld.x, centerWorld.y, '#00f5ff', 6.4, 0.78);
      }

      // Trigger background shader radial aurora pulse!
      projVec.set(centerWorld.x, centerWorld.y, 0).project(camera);
      backdropMat.uniforms.uPulseCenter.value.set(
        (projVec.x + 1) * 0.5,
        (projVec.y + 1) * 0.5
      );
      backdropMat.uniforms.uPulseAge.value = 0.0;
      backdropMat.uniforms.uPulseStrength.value = Math.min(
        1.5,
        0.75 + event.combo * 0.15 + (hasGolden ? 0.5 : 0)
      );

      // Dynamic golden burst light + micro camera kick
      if (hasGolden) {
        goldAccentLight.position.set(centerWorld.x, centerWorld.y, 5.5);
        goldAccentLight.intensity = 58;
      }
      cameraShake = Math.min(
        1.2,
        0.22 + event.clearedCells.length * 0.09 + (hasGolden ? 0.45 : 0) + Math.min(0.35, event.combo * 0.06)
      );
      cameraFovPunch = Math.min(1.5, 0.35 + (hasGolden ? 0.55 : 0) + (event.clearedCells.length >= 4 ? 0.35 : 0));
    },
    setFeverLevel(level) {
      targetFever = Math.max(0, Math.min(1, level));
    },
    setSoftColors(soft) {
      softColors = soft;
    },
    setHighFx(nextHighFx) {
      highFx = nextHighFx;
      resize(viewportW, viewportH);
    },
    setReducedMotion(reduced) {
      reducedMotion = reduced;
    },
    clientToGrid(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      ndcVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndcVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndcVec, camera);
      const hit = raycaster.ray.intersectPlane(boardPlane, rayHit);
      if (!hit) return null;
      const g = worldToGrid(hit.x, hit.y);
      return {
        col: Math.max(-0.5, Math.min(boardCols + 0.5, g.col)),
        row: Math.max(-0.5, Math.min(boardRows + 0.5, g.row)),
      };
    },
    gridToClient(col, row) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const w = gridToWorld(col, row);
      projVec.set(w.x, w.y, 0.5).project(camera);
      return {
        x: ((projVec.x + 1) * 0.5) * rect.width,
        y: ((-projVec.y + 1) * 0.5) * rect.height,
      };
    },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      window.cancelAnimationFrame(rafId);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);

      backdropQuad.geometry.dispose();
      backdropMat.dispose();
      boardPlateGeo.dispose();
      boardPlateMat.dispose();
      boardBorderGeo.dispose();
      boardBorderMat.dispose();
      appleMesh.dispose();
      appleGeo.dispose();
      appleMat.dispose();
      leafMesh.dispose();
      leafGeo.dispose();
      leafMat.dispose();
      digitMesh.dispose();
      digitGeo.dispose();
      digitMat.dispose();
      digitAtlas?.dispose();
      selFillMesh.geometry.dispose();
      selFillMat.dispose();
      selOutlineGeo.dispose();
      selOutlineMat.dispose();
      ringGeo.dispose();
      for (const sw of shockwaves) {
        sw.material.dispose();
      }
      particleGeo.dispose();
      particleMat.dispose();
      orbGeo.dispose();
      orbMat.dispose();
      renderer.dispose();
    },
  };
}
