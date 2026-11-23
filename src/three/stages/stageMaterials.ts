/**
 * stageMaterials.ts
 * ---------------------------------------------------------------------------
 * Shared Three.js 0.187 visual primitives, procedural studio PMREM environment,
 * smoked-glass & champagne-gold PBR materials, luminous stage marble, 2× Retina
 * floating 3D HUD pill sprites, and leak-free GPU resource disposal utilities.
 *
 * Designed for mobile 60fps & SwiftShader WebGL compatibility with ZERO
 * external network asset fetches.
 */

import * as THREE from 'three';
import type { MoodMode, ThemeMode } from '../ainvtryStageDirector.ts';

/* ==========================================================================
 * 1. Shared Luxury / Aurora Palette Tokens
 * ========================================================================== */

export const STAGE_PALETTE = {
  obsidianDeep: 0x09090d,
  obsidianGlassDark: 0x141318,
  auroraGlassDark: 0x121826,
  alabasterGlassLight: 0xf4f0e8,
  auroraGlassLight: 0xedf2fa,

  champagneGold: 0xd6b889,
  champagneGoldBright: 0xe2cfa8,
  champagneGoldLightTheme: 0xb08a4f,
  champagneEmissiveDark: 0xc8a36a,
  champagneEmissiveLight: 0x8f6b32,

  auroraSilverGold: 0xdce4f4,
  auroraSilverLightTheme: 0x889ab8,
  auroraEmissiveDark: 0x8fb6ec,
  auroraEmissiveLight: 0x607fa8,
} as const;

const ENV_RENDER_TARGETS = new WeakMap<THREE.Texture, THREE.WebGLRenderTarget>();

/* ==========================================================================
 * 2. Procedural PMREM Studio Light-Box Environment (Zero Network Fetches)
 * ========================================================================== */

/**
 * Generates a lightweight procedural PMREM studio environment texture featuring
 * a warm champagne key softbox, crisp overhead pearl fill, obsidian-cool rim
 * strip, and subtle under-bounce so smoked glass and metallic gold surfaces
 * exhibit high-craft studio reflections without loading external HDRI files.
 */
export function createStudioEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(STAGE_PALETTE.obsidianDeep);

  const boxGeo = new THREE.BoxGeometry(18, 12, 18);
  const boxMat = new THREE.MeshBasicMaterial({
    color: 0x0b0b10,
    side: THREE.BackSide,
  });
  envScene.add(new THREE.Mesh(boxGeo, boxMat));

  const panelGeos: THREE.BufferGeometry[] = [boxGeo];
  const panelMats: THREE.Material[] = [boxMat];

  const addSoftbox = (
    width: number,
    height: number,
    colorHex: number,
    position: [number, number, number],
    lookAt: [number, number, number]
  ) => {
    const geo = new THREE.PlaneGeometry(width, height);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.lookAt(lookAt[0], lookAt[1], lookAt[2]);
    envScene.add(mesh);
    panelGeos.push(geo);
    panelMats.push(mat);
  };

  // Warm champagne key softbox (upper left-front)
  addSoftbox(6.2, 4.0, 0xf7e2be, [-5.2, 4.4, 4.4], [0, 0, 0]);
  // Crisp ivory studio overhead strip
  addSoftbox(8.5, 2.2, 0xf4f1ea, [0, 5.8, -0.4], [0, 0, 0]);
  // Cool platinum-obsidian rim panel (right back)
  addSoftbox(4.8, 5.2, 0xbfd0e8, [6.0, 2.2, -4.6], [0, 0, 0]);
  // Subtle Aurora prismatic accent edge (left back)
  addSoftbox(3.4, 3.6, 0x9bc4ec, [-6.2, 1.1, -3.8], [0, 0, 0]);
  // Warm low champagne bounce card
  addSoftbox(7.0, 2.6, 0x8f7144, [0, -5.2, 2.4], [0, 0, 0]);

  const renderTarget = pmrem.fromScene(envScene, 0.04);
  const envTexture = renderTarget.texture;
  ENV_RENDER_TARGETS.set(envTexture, renderTarget);

  for (const geo of panelGeos) {
    geo.dispose();
  }
  for (const mat of panelMats) {
    mat.dispose();
  }
  pmrem.dispose();

  return envTexture;
}

/**
 * Releases both the WebGLRenderTarget and GPU texture allocated by
 * `createStudioEnvMap`.
 */
export function disposeStudioEnvMap(envMap: THREE.Texture | null | undefined): void {
  if (!envMap) return;
  const rt = ENV_RENDER_TARGETS.get(envMap);
  if (rt) {
    rt.dispose();
    ENV_RENDER_TARGETS.delete(envMap);
    return;
  }
  envMap.dispose();
}

/* ==========================================================================
 * 3. Smoked-Glass PBR Material (Synced to Glass %, Mood, and Theme)
 * ========================================================================== */

let softwareGlGlassFallback = false;

/**
 * Enables a transmission-free crisp specular glass fast path for software WebGL
 * renderers (e.g. SwiftShader / llvmpipe) to eliminate the multi-second extra
 * transmission render pass while real GPUs keep full optical `transmission`.
 */
export function setSoftwareGlGlassFallback(enabled: boolean): void {
  softwareGlGlassFallback = Boolean(enabled);
}

/**
 * Returns whether the software WebGL transmission-free glass fast path is active.
 */
export function isSoftwareGlGlassFallback(): boolean {
  return softwareGlGlassFallback;
}

/**
 * Mutates an existing smoked-glass `MeshPhysicalMaterial` in place without
 * shader recompilation so Glass % wheel drags stay locked at 60–120fps.
 */
export function applySmokedGlassState(
  mat: THREE.MeshPhysicalMaterial,
  glassRatio: number,
  mood: MoodMode,
  theme: ThemeMode
): void {
  const g = THREE.MathUtils.clamp(glassRatio, 0, 1);
  const isDark = theme === 'dark';
  const isAurora = mood === 'aurora';

  if (isDark) {
    mat.color.setHex(isAurora ? STAGE_PALETTE.auroraGlassDark : STAGE_PALETTE.obsidianGlassDark);
    mat.attenuationColor.setHex(isAurora ? 0x8db6e8 : STAGE_PALETTE.champagneGoldBright);
    mat.emissive.setHex(isAurora ? 0x162238 : 0x1f180e);
    mat.emissiveIntensity = THREE.MathUtils.lerp(0.18, 0.06, g);
  } else {
    mat.color.setHex(
      isAurora ? STAGE_PALETTE.auroraGlassLight : STAGE_PALETTE.alabasterGlassLight
    );
    mat.attenuationColor.setHex(isAurora ? 0xcfe0f5 : 0xf5e8d2);
    mat.emissive.setHex(isAurora ? 0xdfe8f6 : 0xf5efe6);
    mat.emissiveIntensity = THREE.MathUtils.lerp(0.14, 0.04, g);
  }

  // g = 0 (opaque frosted glass) -> g = 1 (ultra-clear crystal smoked glass)
  mat.transparent = true;
  mat.roughness = THREE.MathUtils.lerp(0.32, 0.06, g);
  mat.metalness = isDark ? 0.08 : 0.04;
  mat.ior = isAurora ? 1.52 : 1.48;
  mat.reflectivity = THREE.MathUtils.lerp(0.65, 0.96, g);
  mat.clearcoatRoughness = THREE.MathUtils.lerp(0.22, 0.05, g);
  mat.iridescence = isAurora ? THREE.MathUtils.lerp(0.38, 0.68, g) : 0.06;
  mat.iridescenceIOR = isAurora ? 1.32 : 1.25;

  if (softwareGlGlassFallback) {
    mat.transmission = 0;
    mat.thickness = 0;
    mat.opacity = THREE.MathUtils.lerp(isDark ? 0.86 : 0.82, isDark ? 0.26 : 0.30, g);
    mat.clearcoat = 1.0;
    mat.envMapIntensity = 1.6;
  } else {
    mat.opacity = THREE.MathUtils.lerp(isDark ? 0.9 : 0.86, isDark ? 0.24 : 0.28, g);
    mat.transmission = THREE.MathUtils.lerp(0.06, 0.56, g);
    mat.thickness = THREE.MathUtils.lerp(0.22, 0.52, g);
    mat.clearcoat = THREE.MathUtils.lerp(0.65, 1.0, g);
    mat.envMapIntensity = THREE.MathUtils.lerp(isDark ? 1.05 : 0.85, isDark ? 1.85 : 1.35, g);
  }
}

/**
 * Creates a Fresnel smoked-glass `MeshPhysicalMaterial` calibrated to the
 * current Glass % ratio, visual mood (`luxury` / `aurora`), and theme (`dark` / `light`).
 */
export function createSmokedGlassMaterial(
  glassRatio: number,
  mood: MoodMode,
  theme: ThemeMode
): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    attenuationDistance: 1.6,
  });
  applySmokedGlassState(mat, glassRatio, mood, theme);
  return mat;
}

/* ==========================================================================
 * 4. Champagne Gold / Prismatic Silver-Gold Metallic Material
 * ========================================================================== */

/**
 * Updates a champagne-gold `MeshStandardMaterial` to match Luxury/Aurora and
 * Dark/Light contrast tokens.
 */
export function applyGoldModeState(
  mat: THREE.MeshStandardMaterial,
  mood: MoodMode,
  theme: ThemeMode,
  emissiveIntensity?: number
): void {
  const isDark = theme === 'dark';
  const isAurora = mood === 'aurora';

  const storedBase =
    typeof mat.userData.baseEmissiveIntensity === 'number'
      ? (mat.userData.baseEmissiveIntensity as number)
      : 0.22;

  const baseEmissive =
    typeof emissiveIntensity === 'number' ? emissiveIntensity : storedBase;

  if (typeof emissiveIntensity === 'number') {
    mat.userData.baseEmissiveIntensity = emissiveIntensity;
  }

  if (isAurora) {
    mat.color.setHex(
      isDark ? STAGE_PALETTE.auroraSilverGold : STAGE_PALETTE.auroraSilverLightTheme
    );
    mat.emissive.setHex(
      isDark ? STAGE_PALETTE.auroraEmissiveDark : STAGE_PALETTE.auroraEmissiveLight
    );
    mat.metalness = isDark ? 0.9 : 0.84;
    mat.roughness = isDark ? 0.18 : 0.24;
    mat.envMapIntensity = isDark ? 1.6 : 1.25;
  } else {
    mat.color.setHex(
      isDark ? STAGE_PALETTE.champagneGold : STAGE_PALETTE.champagneGoldLightTheme
    );
    mat.emissive.setHex(
      isDark ? STAGE_PALETTE.champagneEmissiveDark : STAGE_PALETTE.champagneEmissiveLight
    );
    mat.metalness = isDark ? 0.86 : 0.82;
    mat.roughness = isDark ? 0.23 : 0.28;
    mat.envMapIntensity = isDark ? 1.48 : 1.18;
  }

  mat.emissiveIntensity = isDark ? baseEmissive : baseEmissive * 0.62;
}

/**
 * Creates a metallic champagne-gold (`#D6B889`) material in Luxury mode that
 * shifts seamlessly into pearlescent prismatic silver-gold in Aurora mode and
 * higher-contrast brushed bronze/platinum in Light mode.
 */
export function createChampagneGoldMaterial(
  mood: MoodMode,
  theme: ThemeMode,
  emissiveIntensity = 0.22
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: STAGE_PALETTE.champagneGold,
    metalness: 0.86,
    roughness: 0.23,
  });
  mat.userData.baseEmissiveIntensity = emissiveIntensity;
  applyGoldModeState(mat, mood, theme, emissiveIntensity);
  return mat;
}

/* ==========================================================================
 * 5. Luminous Stage Marble Mesh + Radial Aura Halo
 * ========================================================================== */

function createRadialHaloTexture(size = 128): THREE.Texture {
  if (typeof document === 'undefined') {
    const data = new Uint8Array([230, 206, 168, 180]);
    const fallback = new THREE.DataTexture(data, 1, 1);
    fallback.needsUpdate = true;
    return fallback;
  }

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const half = size * 0.5;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, 'rgba(255, 248, 234, 1.0)');
    grad.addColorStop(0.24, 'rgba(226, 207, 168, 0.72)');
    grad.addColorStop(0.54, 'rgba(214, 184, 137, 0.26)');
    grad.addColorStop(0.82, 'rgba(214, 184, 137, 0.06)');
    grad.addColorStop(1.0, 'rgba(214, 184, 137, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export interface StageMarbleHandle {
  readonly group: THREE.Group;
  readonly coreMat: THREE.MeshPhysicalMaterial;
  readonly haloMat: THREE.SpriteMaterial;
  readonly updateVisual: (
    mood: MoodMode,
    theme: ThemeMode,
    glassRatio: number,
    elapsed: number
  ) => void;
  readonly dispose: () => void;
}

/**
 * Creates the signature glowing champagne-gold glass marble with inner nucleus,
 * sculpted equatorial rim, and soft radial aura sprite reused across all 4
 * interactive 3D stages.
 */
export function createStageMarbleMesh(): StageMarbleHandle {
  const group = new THREE.Group();
  group.name = 'ainvtry-stage-marble';

  // Outer crystal glass sphere
  const shellGeo = new THREE.SphereGeometry(0.18, 32, 24);
  const coreMat = new THREE.MeshPhysicalMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    emissive: STAGE_PALETTE.champagneEmissiveDark,
    emissiveIntensity: 0.35,
    roughness: 0.08,
    metalness: 0.14,
    transmission: softwareGlGlassFallback ? 0 : 0.45,
    thickness: softwareGlGlassFallback ? 0 : 0.4,
    ior: 1.5,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: softwareGlGlassFallback ? 0.78 : 0.94,
    envMapIntensity: softwareGlGlassFallback ? 1.6 : 1.8,
  });
  const shellMesh = new THREE.Mesh(shellGeo, coreMat);
  group.add(shellMesh);

  // Inner luminous filament nucleus
  const nucleusGeo = new THREE.SphereGeometry(0.085, 20, 16);
  const nucleusMat = new THREE.MeshStandardMaterial({
    color: 0xfff4df,
    emissive: STAGE_PALETTE.champagneGoldBright,
    emissiveIntensity: 1.15,
    roughness: 0.2,
    metalness: 0.4,
  });
  const nucleusMesh = new THREE.Mesh(nucleusGeo, nucleusMat);
  group.add(nucleusMesh);

  // Delicate specular rim ring
  const rimGeo = new THREE.TorusGeometry(0.194, 0.0045, 8, 40);
  const rimMat = createChampagneGoldMaterial('luxury', 'dark', 0.4);
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.rotation.x = Math.PI * 0.42;
  group.add(rimMesh);

  // Radial aura halo sprite
  const haloTexture = createRadialHaloTexture(128);
  const haloMat = new THREE.SpriteMaterial({
    map: haloTexture,
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const haloSprite = new THREE.Sprite(haloMat);
  haloSprite.scale.set(0.95, 0.95, 1);
  group.add(haloSprite);

  const updateVisual = (
    mood: MoodMode,
    theme: ThemeMode,
    glassRatio: number,
    elapsed: number
  ): void => {
    const g = THREE.MathUtils.clamp(glassRatio, 0, 1);
    const isDark = theme === 'dark';
    const isAurora = mood === 'aurora';
    const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2.4);

    if (isAurora) {
      coreMat.color.setHex(isDark ? 0xe4ecfc : 0xc0d2ec);
      coreMat.emissive.setHex(isDark ? 0x8bb8f2 : 0x6488be);
      coreMat.iridescence = 0.85;
      coreMat.iridescenceIOR = 1.35;
      nucleusMat.color.setHex(0xf4f8ff);
      nucleusMat.emissive.setHex(0x9ec5f8);
      haloMat.color.setHex(isDark ? 0xa5c9f8 : 0x7b9fd4);
    } else {
      coreMat.color.setHex(isDark ? STAGE_PALETTE.champagneGoldBright : 0xcfa96c);
      coreMat.emissive.setHex(
        isDark ? STAGE_PALETTE.champagneEmissiveDark : STAGE_PALETTE.champagneEmissiveLight
      );
      coreMat.iridescence = 0.14;
      nucleusMat.color.setHex(0xfff4df);
      nucleusMat.emissive.setHex(STAGE_PALETTE.champagneGoldBright);
      haloMat.color.setHex(isDark ? STAGE_PALETTE.champagneGoldBright : 0xc9a162);
    }

    coreMat.roughness = THREE.MathUtils.lerp(0.18, 0.05, g);
    if (softwareGlGlassFallback) {
      coreMat.transparent = true;
      coreMat.transmission = 0;
      coreMat.thickness = 0;
      coreMat.opacity = THREE.MathUtils.lerp(0.86, 0.62, g);
      coreMat.clearcoat = 1.0;
      coreMat.envMapIntensity = 1.6;
    } else {
      coreMat.transmission = THREE.MathUtils.lerp(0.22, 0.58, g);
      coreMat.thickness = 0.4;
      coreMat.opacity = 0.94;
      coreMat.clearcoat = 1.0;
      coreMat.envMapIntensity = 1.8;
    }
    coreMat.emissiveIntensity = (isDark ? 0.34 : 0.22) + pulse * 0.14;

    nucleusMat.emissiveIntensity = (isDark ? 1.05 : 0.72) + pulse * 0.3;
    const nucleusScale = 0.94 + pulse * 0.1;
    nucleusMesh.scale.setScalar(nucleusScale);

    applyGoldModeState(rimMat, mood, theme, 0.35 + pulse * 0.15);
    rimMesh.rotation.z = elapsed * 0.45;
    rimMesh.rotation.y = Math.sin(elapsed * 0.6) * 0.35;

    const nextBlending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (haloMat.blending !== nextBlending) {
      haloMat.blending = nextBlending;
      haloMat.needsUpdate = true;
    }
    haloMat.opacity = (isDark ? 0.62 : 0.32) + pulse * (isDark ? 0.18 : 0.1);
    const haloScale = 0.92 + pulse * 0.14;
    haloSprite.scale.set(haloScale, haloScale, 1);
  };

  const dispose = (): void => {
    shellGeo.dispose();
    coreMat.dispose();
    nucleusGeo.dispose();
    nucleusMat.dispose();
    rimGeo.dispose();
    rimMat.dispose();
    haloMat.dispose();
    haloTexture.dispose();
  };

  return { group, coreMat, haloMat, updateVisual, dispose };
}

/* ==========================================================================
 * 6. 2× Retina Floating 3D HUD Pill Label Sprites
 * ========================================================================== */

export interface FloatingLabelOptions {
  readonly subtext?: string;
  readonly accent?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly worldHeight?: number;
}

export interface FloatingLabelHandle {
  readonly sprite: THREE.Sprite;
  readonly setHighlight: (active: boolean, theme: ThemeMode) => void;
  readonly dispose: () => void;
}

function drawRoundedPillPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Creates a crisp 2× Retina CanvasTexture floating pill sprite for 3D labels
 * (`0B FACE`, `210+ TESTS`, `21-BONE`, `Closet`, `Weather`, `iNVTRY LOOP`, etc.).
 * Redraws only when `(active, theme)` actually changes.
 */
export function createFloatingLabelSprite(
  text: string,
  opts: FloatingLabelOptions = {}
): FloatingLabelHandle {
  const hasSubtext = Boolean(opts.subtext && opts.subtext.trim().length > 0);
  const logicalWidth = opts.width ?? (hasSubtext ? 260 : 210);
  const logicalHeight = opts.height ?? (hasSubtext ? 74 : 52);
  const scaleFactor = 2; // 2× Retina backing store

  const pixelWidth = logicalWidth * scaleFactor;
  const pixelHeight = logicalHeight * scaleFactor;
  const worldHeight = opts.worldHeight ?? (hasSubtext ? 0.34 : 0.24);
  const worldWidth = worldHeight * (logicalWidth / logicalHeight);

  let canvas: HTMLCanvasElement | null = null;
  let ctx2d: CanvasRenderingContext2D | null = null;
  let texture: THREE.Texture;

  if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    ctx2d = canvas.getContext('2d');
    const canvasTex = new THREE.CanvasTexture(canvas);
    canvasTex.colorSpace = THREE.SRGBColorSpace;
    canvasTex.minFilter = THREE.LinearFilter;
    canvasTex.magFilter = THREE.LinearFilter;
    canvasTex.generateMipmaps = false;
    texture = canvasTex;
  } else {
    const fallbackData = new Uint8Array([18, 18, 22, 220]);
    texture = new THREE.DataTexture(fallbackData, 1, 1);
    texture.needsUpdate = true;
  }

  let lastActive: boolean | null = null;
  let lastTheme: ThemeMode | null = null;

  const renderBadge = (active: boolean, theme: ThemeMode): void => {
    if (lastActive === active && lastTheme === theme) return;
    lastActive = active;
    lastTheme = theme;

    if (!ctx2d || !canvas) return;

    const isDark = theme === 'dark';
    const highlighted = active || Boolean(opts.accent);

    ctx2d.clearRect(0, 0, pixelWidth, pixelHeight);
    ctx2d.save();
    ctx2d.scale(scaleFactor, scaleFactor);

    const pad = 4;
    const pillW = logicalWidth - pad * 2;
    const pillH = logicalHeight - pad * 2;
    const pillRadius = pillH * 0.5;

    // Smoked obsidian / frosted alabaster pill fill
    drawRoundedPillPath(ctx2d, pad, pad, pillW, pillH, pillRadius);
    if (isDark) {
      ctx2d.fillStyle = highlighted
        ? 'rgba(24, 21, 18, 0.92)'
        : 'rgba(13, 13, 17, 0.80)';
    } else {
      ctx2d.fillStyle = highlighted
        ? 'rgba(255, 252, 245, 0.96)'
        : 'rgba(248, 246, 242, 0.88)';
    }
    ctx2d.fill();

    // Hairline border
    ctx2d.lineWidth = highlighted ? 1.6 : 1.0;
    if (highlighted) {
      ctx2d.strokeStyle = isDark ? 'rgba(226, 207, 168, 0.92)' : 'rgba(168, 132, 74, 0.92)';
    } else {
      ctx2d.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(20, 20, 24, 0.16)';
    }
    ctx2d.stroke();

    // Subtle specular crown hairline inside top rim
    ctx2d.beginPath();
    ctx2d.moveTo(pad + pillRadius * 0.75, pad + 1.4);
    ctx2d.lineTo(pad + pillW - pillRadius * 0.75, pad + 1.4);
    ctx2d.lineWidth = 0.8;
    ctx2d.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.85)';
    ctx2d.stroke();

    // Accent status dot when active
    const fontStack =
      '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';

    const centerX = logicalWidth * 0.5;
    if (hasSubtext && opts.subtext) {
      ctx2d.font = `600 16px ${fontStack}`;
      ctx2d.fillStyle = highlighted
        ? isDark
          ? '#F3E5C8'
          : '#3D2B10'
        : isDark
          ? '#F5F5F7'
          : '#16161A';
      ctx2d.fillText(text, centerX, logicalHeight * 0.37, pillW - 22);

      ctx2d.font = `500 11.5px ${fontStack}`;
      ctx2d.fillStyle = highlighted
        ? isDark
          ? 'rgba(226, 207, 168, 0.88)'
          : 'rgba(128, 96, 46, 0.92)'
        : isDark
          ? 'rgba(220, 222, 230, 0.72)'
          : 'rgba(60, 62, 70, 0.75)';
      ctx2d.fillText(opts.subtext, centerX, logicalHeight * 0.69, pillW - 24);
    } else {
      ctx2d.font = `600 17px ${fontStack}`;
      ctx2d.fillStyle = highlighted
        ? isDark
          ? '#F3E5C8'
          : '#3D2B10'
        : isDark
          ? '#F5F5F7'
          : '#16161A';
      ctx2d.fillText(text, centerX, logicalHeight * 0.51, pillW - 22);
    }

    ctx2d.restore();
    texture.needsUpdate = true;
  };

  renderBadge(Boolean(opts.accent), 'dark');

  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(worldWidth, worldHeight, 1);
  sprite.name = `label-${text}`;

  const dispose = (): void => {
    spriteMat.dispose();
    texture.dispose();
  };

  return {
    sprite,
    setHighlight: renderBadge,
    dispose,
  };
}

/* ==========================================================================
 * 7. Recursive Leak-Free Object3D Resource Disposer
 * ========================================================================== */

function isThreeTexture(value: unknown): value is THREE.Texture {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isTexture' in value &&
    (value as { readonly isTexture?: unknown }).isTexture === true
  );
}

function disposeMaterialTextures(
  material: THREE.Material,
  disposedTextures: Set<THREE.Texture>
): void {
  const record = material as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const val = record[key];
    if (isThreeTexture(val) && !disposedTextures.has(val)) {
      disposedTextures.add(val);
      disposeStudioEnvMap(val);
    }
  }

  // Handle ShaderMaterial uniforms carrying textures
  if ('uniforms' in record && typeof record.uniforms === 'object' && record.uniforms !== null) {
    const uniforms = record.uniforms as Record<string, { readonly value?: unknown } | undefined>;
    for (const key of Object.keys(uniforms)) {
      const uniformValue = uniforms[key]?.value;
      if (isThreeTexture(uniformValue) && !disposedTextures.has(uniformValue)) {
        disposedTextures.add(uniformValue);
        disposeStudioEnvMap(uniformValue);
      }
    }
  }
}

/**
 * Recursively disposes every geometry, material, and attached texture beneath
 * `root` while deduplicating shared references so no GPU resource leaks or
 * double-disposes on stage unmount.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedMaterials = new Set<THREE.Material>();
  const disposedTextures = new Set<THREE.Texture>();

  root.traverse((obj) => {
    const renderable = obj as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };

    if (renderable.geometry && !disposedGeometries.has(renderable.geometry)) {
      disposedGeometries.add(renderable.geometry);
      renderable.geometry.dispose();
    }

    if (renderable.material) {
      const mats = Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material];
      for (const mat of mats) {
        if (!disposedMaterials.has(mat)) {
          disposedMaterials.add(mat);
          disposeMaterialTextures(mat, disposedTextures);
          mat.dispose();
        }
      }
    }
  });
}
