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
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
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
 * 2. Studio PMREM RoomEnvironment (Zero External Network Fetches)
 * ========================================================================== */

/**
 * Generates a high-dynamic-range procedural studio PMREM environment texture
 * combining Three.js `RoomEnvironment` with tailored fashion-runway softboxes
 * (warm champagne key, cool platinum rim strip, overhead gallery diffuser) so
 * obsidian marble, champagne gold rings, brushed glass tiers, and clearcoat
 * umbrella panels exhibit crisp reflections with zero external HDRI fetches.
 */
export function createStudioEnvMap(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = softwareGlGlassFallback ? new THREE.Scene() : new RoomEnvironment();
  if (softwareGlGlassFallback) {
    envScene.background = new THREE.Color(0x16151a);
  }

  const softboxGeo = new THREE.PlaneGeometry(1, 1);
  const keyMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xfff1dc).multiplyScalar(2.2),
    side: THREE.DoubleSide,
  });
  const rimMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xdce6f8).multiplyScalar(1.85),
    side: THREE.DoubleSide,
  });
  const overheadMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xf9f5ec).multiplyScalar(1.6),
    side: THREE.DoubleSide,
  });

  const keyBox = new THREE.Mesh(softboxGeo, keyMat);
  keyBox.position.set(-5.2, 4.4, 4.6);
  keyBox.scale.set(4.8, 3.2, 1);
  keyBox.lookAt(0, 0, 0);

  const rimStrip = new THREE.Mesh(softboxGeo, rimMat);
  rimStrip.position.set(5.8, 2.2, -3.8);
  rimStrip.scale.set(1.8, 6.2, 1);
  rimStrip.lookAt(0, 0, 0);

  const overheadPanel = new THREE.Mesh(softboxGeo, overheadMat);
  overheadPanel.position.set(0, 7.2, 0.8);
  overheadPanel.scale.set(6.4, 2.8, 1);
  overheadPanel.lookAt(0, 0, 0);

  envScene.add(keyBox, rimStrip, overheadPanel);

  const renderTarget = pmrem.fromScene(envScene, softwareGlGlassFallback ? 0 : 0.035);
  const envTexture = renderTarget.texture;
  ENV_RENDER_TARGETS.set(envTexture, renderTarget);

  softboxGeo.dispose();
  keyMat.dispose();
  rimMat.dispose();
  overheadMat.dispose();
  if (envScene instanceof RoomEnvironment) {
    envScene.dispose();
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
    elapsed: number,
    opacityScale?: number
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
    transparent: true,
    opacity: 1,
  });
  const nucleusMesh = new THREE.Mesh(nucleusGeo, nucleusMat);
  group.add(nucleusMesh);

  // Delicate specular rim ring
  const rimGeo = new THREE.TorusGeometry(0.194, 0.0045, 8, 40);
  const rimMat = createChampagneGoldMaterial('luxury', 'dark', 0.4);
  rimMat.transparent = true;
  rimMat.opacity = 1;
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
    elapsed: number,
    opacityScale = 1
  ): void => {
    const g = THREE.MathUtils.clamp(glassRatio, 0, 1);
    const fade = THREE.MathUtils.clamp(opacityScale, 0, 1);
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
      coreMat.opacity = THREE.MathUtils.lerp(0.86, 0.62, g) * fade;
      coreMat.clearcoat = 1.0;
      coreMat.envMapIntensity = 1.6;
    } else {
      coreMat.transmission = THREE.MathUtils.lerp(0.22, 0.58, g) * fade;
      coreMat.thickness = 0.4;
      coreMat.opacity = 0.94 * fade;
      coreMat.clearcoat = 1.0;
      coreMat.envMapIntensity = 1.8;
    }
    coreMat.emissiveIntensity = ((isDark ? 0.34 : 0.22) + pulse * 0.14) * fade;

    nucleusMat.opacity = fade;
    nucleusMat.emissiveIntensity = ((isDark ? 1.05 : 0.72) + pulse * 0.3) * fade;
    const nucleusScale = 0.94 + pulse * 0.1;
    nucleusMesh.scale.setScalar(nucleusScale);

    applyGoldModeState(rimMat, mood, theme, 0.35 + pulse * 0.15);
    rimMat.opacity = fade;
    rimMesh.rotation.z = elapsed * 0.45;
    rimMesh.rotation.y = Math.sin(elapsed * 0.6) * 0.35;

    const nextBlending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (haloMat.blending !== nextBlending) {
      haloMat.blending = nextBlending;
      haloMat.needsUpdate = true;
    }
    haloMat.opacity = ((isDark ? 0.62 : 0.32) + pulse * (isDark ? 0.18 : 0.1)) * fade;
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
      ctx2d.font = `700 18px ${fontStack}`;
      ctx2d.fillStyle = highlighted
        ? isDark
          ? '#F3E5C8'
          : '#3D2B10'
        : isDark
          ? '#F5F5F7'
          : '#16161A';
      ctx2d.fillText(text, centerX, logicalHeight * 0.36, pillW - 20);

      ctx2d.font = `600 13px ${fontStack}`;
      ctx2d.fillStyle = highlighted
        ? isDark
          ? 'rgba(226, 207, 168, 0.92)'
          : 'rgba(128, 96, 46, 0.94)'
        : isDark
          ? 'rgba(226, 228, 236, 0.8)'
          : 'rgba(54, 56, 64, 0.82)';
      ctx2d.fillText(opts.subtext, centerX, logicalHeight * 0.7, pillW - 22);
    } else {
      ctx2d.font = `700 20px ${fontStack}`;
      ctx2d.fillStyle = highlighted
        ? isDark
          ? '#F3E5C8'
          : '#3D2B10'
        : isDark
          ? '#F5F5F7'
          : '#16161A';
      ctx2d.fillText(text, centerX, logicalHeight * 0.51, pillW - 20);
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
    toneMapped: false,
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

export type TechRibbonIconKind =
  | 'react'
  | 'bolt'
  | 'mobile'
  | 'cloud'
  | 'lock'
  | 'shield'
  | 'server'
  | 'key'
  | 'shieldCheck'
  | 'cube3d'
  | 'sparkle'
  | 'mapPin'
  | 'activity'
  | 'storage'
  | 'sync'
  | 'database'
  | 'gpu'
  | 'gitBranch';

export type ArchStackMode = 'mvp' | 'prod';

export interface TechRibbonItem {
  readonly icon: TechRibbonIconKind;
  readonly label: string;
  readonly tag?: string;
}

export interface TechRibbonHandle {
  readonly sprite: THREE.Sprite;
  readonly aspect: number;
  readonly setTheme: (theme: ThemeMode) => void;
  readonly dispose: () => void;
}

export interface TierTechDrawerHandle {
  readonly group: THREE.Group;
  readonly bladeSprites: readonly THREE.Sprite[];
  readonly setModeAndTheme: (mode: ArchStackMode, theme: ThemeMode) => void;
  readonly setUnfurl: (
    unfurl: number,
    opacity: number,
    isNarrowSplit: boolean,
    aspect: number,
    focusedBladeIndex?: number | null
  ) => void;
  readonly dispose: () => void;
}

function drawTechVectorIcon(
  ctx: CanvasRenderingContext2D,
  kind: TechRibbonIconKind,
  cx: number,
  cy: number,
  r: number
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.0;

  switch (kind) {
    case 'database': {
      // Classic 3-tier cylindrical Database icon
      const rx = r * 0.78;
      const ry = r * 0.28;
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.56, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-rx, -r * 0.56);
      ctx.lineTo(-rx, r * 0.54);
      ctx.ellipse(0, r * 0.54, rx, ry, 0, Math.PI, 0, true);
      ctx.lineTo(rx, -r * 0.56);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.02, rx, ry, 0, 0.08 * Math.PI, 0.92 * Math.PI);
      ctx.stroke();
      break;
    }
    case 'gpu': {
      // GPU / Compute Chip with core & pins
      const s = r * 0.56;
      ctx.strokeRect(-s, -s, s * 2, s * 2);
      ctx.strokeRect(-s * 0.45, -s * 0.45, s * 0.9, s * 0.9);
      const pinLen = r * 0.34;
      for (const offset of [-s * 0.48, 0, s * 0.48]) {
        ctx.beginPath();
        ctx.moveTo(offset, -s);
        ctx.lineTo(offset, -s - pinLen);
        ctx.moveTo(offset, s);
        ctx.lineTo(offset, s + pinLen);
        ctx.moveTo(-s, offset);
        ctx.lineTo(-s - pinLen, offset);
        ctx.moveTo(s, offset);
        ctx.lineTo(s + pinLen, offset);
        ctx.stroke();
      }
      break;
    }
    case 'bolt': {
      ctx.beginPath();
      ctx.moveTo(r * 0.16, -r * 0.88);
      ctx.lineTo(-r * 0.56, r * 0.08);
      ctx.lineTo(r * 0.04, r * 0.08);
      ctx.lineTo(-r * 0.18, r * 0.88);
      ctx.lineTo(r * 0.56, -r * 0.1);
      ctx.lineTo(-r * 0.04, -r * 0.1);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'react': {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.17, 0, Math.PI * 2);
      ctx.fill();
      for (const deg of [0, 60, 120]) {
        ctx.save();
        ctx.rotate((deg * Math.PI) / 180);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.86, r * 0.34, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      break;
    }
    case 'mobile': {
      const w = r * 1.06;
      const h = r * 1.66;
      drawRoundedPillPath(ctx, -w * 0.5, -h * 0.5, w, h, r * 0.24);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w * 0.18, h * 0.32);
      ctx.lineTo(w * 0.18, h * 0.32);
      ctx.stroke();
      break;
    }
    case 'cloud': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.58, r * 0.42);
      ctx.lineTo(r * 0.62, r * 0.42);
      ctx.arc(r * 0.52, r * 0.06, r * 0.36, Math.PI * 0.5, -Math.PI * 0.48, true);
      ctx.arc(0, -r * 0.24, r * 0.46, -Math.PI * 0.18, Math.PI * 1.05, true);
      ctx.arc(-r * 0.52, r * 0.1, r * 0.32, -Math.PI * 0.65, Math.PI * 0.5, true);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'lock': {
      const w = r * 1.24;
      const h = r * 0.94;
      drawRoundedPillPath(ctx, -w * 0.5, -r * 0.08, w, h, r * 0.2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r * 0.42, Math.PI, 0, false);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, r * 0.36, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'shield':
    case 'shieldCheck': {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.86);
      ctx.lineTo(r * 0.72, -r * 0.52);
      ctx.lineTo(r * 0.66, r * 0.12);
      ctx.quadraticCurveTo(r * 0.5, r * 0.62, 0, r * 0.88);
      ctx.quadraticCurveTo(-r * 0.5, r * 0.62, -r * 0.66, r * 0.12);
      ctx.lineTo(-r * 0.72, -r * 0.52);
      ctx.closePath();
      ctx.stroke();
      if (kind === 'shieldCheck') {
        ctx.beginPath();
        ctx.moveTo(-r * 0.3, r * 0.02);
        ctx.lineTo(-r * 0.06, r * 0.28);
        ctx.lineTo(r * 0.36, -r * 0.22);
        ctx.stroke();
      }
      break;
    }
    case 'server': {
      const w = r * 1.5;
      const h = r * 0.62;
      drawRoundedPillPath(ctx, -w * 0.5, -r * 0.72, w, h, r * 0.14);
      ctx.stroke();
      drawRoundedPillPath(ctx, -w * 0.5, r * 0.1, w, h, r * 0.14);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-w * 0.28, -r * 0.41, r * 0.09, 0, Math.PI * 2);
      ctx.arc(-w * 0.28, r * 0.41, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'key': {
      ctx.beginPath();
      ctx.arc(-r * 0.36, 0, r * 0.36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(r * 0.82, 0);
      ctx.moveTo(r * 0.52, 0);
      ctx.lineTo(r * 0.52, r * 0.28);
      ctx.moveTo(r * 0.78, 0);
      ctx.lineTo(r * 0.78, r * 0.28);
      ctx.stroke();
      break;
    }
    case 'cube3d': {
      const dx = r * 0.72;
      const dy = r * 0.4;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.84);
      ctx.lineTo(dx, -dy);
      ctx.lineTo(dx, dy);
      ctx.lineTo(0, r * 0.84);
      ctx.lineTo(-dx, dy);
      ctx.lineTo(-dx, -dy);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-dx, -dy);
      ctx.lineTo(0, 0);
      ctx.lineTo(dx, -dy);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, r * 0.84);
      ctx.stroke();
      break;
    }
    case 'sparkle': {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.88);
      ctx.quadraticCurveTo(r * 0.12, -r * 0.12, r * 0.88, 0);
      ctx.quadraticCurveTo(r * 0.12, r * 0.12, 0, r * 0.88);
      ctx.quadraticCurveTo(-r * 0.12, r * 0.12, -r * 0.88, 0);
      ctx.quadraticCurveTo(-r * 0.12, -r * 0.12, 0, -r * 0.88);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'mapPin': {
      ctx.beginPath();
      ctx.arc(0, -r * 0.22, r * 0.52, Math.PI * 0.82, Math.PI * 0.18, false);
      ctx.lineTo(0, r * 0.88);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -r * 0.22, r * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'activity': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.86, 0);
      ctx.lineTo(-r * 0.44, 0);
      ctx.lineTo(-r * 0.2, -r * 0.66);
      ctx.lineTo(r * 0.16, r * 0.66);
      ctx.lineTo(r * 0.42, 0);
      ctx.lineTo(r * 0.86, 0);
      ctx.stroke();
      break;
    }
    case 'storage': {
      const w = r * 1.46;
      const h = r * 0.36;
      for (const yOff of [-r * 0.66, -r * 0.14, r * 0.38]) {
        drawRoundedPillPath(ctx, -w * 0.5, yOff, w, h, r * 0.12);
        ctx.stroke();
      }
      break;
    }
    case 'sync': {
      ctx.beginPath();
      ctx.moveTo(-r * 0.72, -r * 0.28);
      ctx.lineTo(r * 0.72, -r * 0.28);
      ctx.lineTo(r * 0.4, -r * 0.62);
      ctx.moveTo(r * 0.72, r * 0.28);
      ctx.lineTo(-r * 0.72, r * 0.28);
      ctx.lineTo(-r * 0.4, r * 0.62);
      ctx.stroke();
      break;
    }
    case 'gitBranch': {
      ctx.beginPath();
      ctx.arc(-r * 0.46, -r * 0.56, r * 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-r * 0.46, r * 0.56, r * 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r * 0.46, -r * 0.18, r * 0.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.46, -r * 0.36);
      ctx.lineTo(-r * 0.46, r * 0.36);
      ctx.moveTo(r * 0.46, r * 0.02);
      ctx.quadraticCurveTo(r * 0.46, r * 0.56, -r * 0.26, r * 0.56);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/**
 * Creates a crisp 2× Retina horizontal expanding Tech Ribbon Sprite displaying
 * the tier title and a horizontal row of clear custom-drawn vector tech icons
 * (e.g., Database cylinder, GPU chip, Shield, Cloud, 3D Cube) with zero clipping.
 */
export function createTierTechRibbonSprite(
  title: string,
  items: readonly TechRibbonItem[]
): TechRibbonHandle {
  const logicalWidth = 440;
  const logicalHeight = 128;
  const scaleFactor = 2;
  const pixelWidth = logicalWidth * scaleFactor;
  const pixelHeight = logicalHeight * scaleFactor;
  const aspect = logicalWidth / logicalHeight;

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

  let lastTheme: ThemeMode | null = null;

  const renderRibbon = (theme: ThemeMode): void => {
    if (lastTheme === theme) return;
    lastTheme = theme;
    if (!ctx2d || !canvas) return;

    const isDark = theme === 'dark';
    const fontStack =
      '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

    ctx2d.clearRect(0, 0, pixelWidth, pixelHeight);
    ctx2d.save();
    ctx2d.scale(scaleFactor, scaleFactor);

    const pad = 4;
    const cardW = logicalWidth - pad * 2;
    const cardH = logicalHeight - pad * 2;

    // Outer smoked obsidian / frosted alabaster horizontal ribbon
    drawRoundedPillPath(ctx2d, pad, pad, cardW, cardH, 24);
    ctx2d.fillStyle = isDark ? 'rgba(18, 16, 15, 0.93)' : 'rgba(255, 252, 246, 0.96)';
    ctx2d.fill();

    ctx2d.lineWidth = 1.6;
    ctx2d.strokeStyle = isDark ? 'rgba(226, 207, 168, 0.9)' : 'rgba(168, 132, 74, 0.9)';
    ctx2d.stroke();

    // Subtle top specular highlight
    ctx2d.beginPath();
    ctx2d.moveTo(pad + 26, pad + 1.5);
    ctx2d.lineTo(pad + cardW - 26, pad + 1.5);
    ctx2d.lineWidth = 0.9;
    ctx2d.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.88)';
    ctx2d.stroke();

    // Tier Header Title
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.font = `700 17px ${fontStack}`;
    ctx2d.fillStyle = isDark ? '#F5E7C8' : '#3A280E';
    ctx2d.fillText(title, logicalWidth * 0.5, 25, cardW - 32);

    // Subtle divider under title
    ctx2d.beginPath();
    ctx2d.moveTo(pad + 22, 41);
    ctx2d.lineTo(pad + cardW - 22, 41);
    ctx2d.lineWidth = 1;
    ctx2d.strokeStyle = isDark ? 'rgba(226, 207, 168, 0.22)' : 'rgba(140, 108, 56, 0.22)';
    ctx2d.stroke();

    // Horizontal Tech Icon Tiles
    const count = Math.max(1, items.length);
    const rowPadX = 16;
    const gap = 10;
    const availW = cardW - rowPadX * 2 - gap * (count - 1);
    const tileW = availW / count;
    const tileY = 48;
    const tileH = 68;

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const tx = pad + rowPadX + i * (tileW + gap);
      const tcx = tx + tileW * 0.5;

      drawRoundedPillPath(ctx2d, tx, tileY, tileW, tileH, 14);
      ctx2d.fillStyle = isDark ? 'rgba(255, 245, 224, 0.065)' : 'rgba(168, 132, 74, 0.08)';
      ctx2d.fill();
      ctx2d.lineWidth = 1;
      ctx2d.strokeStyle = isDark ? 'rgba(226, 207, 168, 0.34)' : 'rgba(168, 132, 74, 0.34)';
      ctx2d.stroke();

      // Icon medallion circle
      const iconCy = tileY + 25;
      ctx2d.beginPath();
      ctx2d.arc(tcx, iconCy, 17, 0, Math.PI * 2);
      ctx2d.fillStyle = isDark ? 'rgba(214, 184, 137, 0.16)' : 'rgba(176, 138, 79, 0.16)';
      ctx2d.fill();

      ctx2d.strokeStyle = isDark ? '#F5E4BE' : '#7A541C';
      ctx2d.fillStyle = isDark ? '#F5E4BE' : '#7A541C';
      drawTechVectorIcon(ctx2d, item.icon, tcx, iconCy, 11.2);

      // Crisp short tech name underneath icon
      ctx2d.font = `650 13.5px ${fontStack}`;
      ctx2d.fillStyle = isDark ? '#F5F5F7' : '#1D1D1F';
      ctx2d.fillText(item.label, tcx, tileY + 54, tileW - 10);
    }

    ctx2d.restore();
    texture.needsUpdate = true;
  };

  renderRibbon('dark');

  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(1.9, 1.9 / aspect, 1);
  sprite.name = `tech-ribbon-${title}`;

  const dispose = (): void => {
    spriteMat.dispose();
    texture.dispose();
  };

  return {
    sprite,
    aspect,
    setTheme: renderRibbon,
    dispose,
  };
}

/**
 * Creates a true 3D horizontally unfurling multi-blade Tech Drawer for an
 * Architecture tier. Each tech item renders on its own 2× Retina sprite tile
 * that physically slides outward along X from the tier core (zero texture
 * squishing), switching cleanly between MVP and Prod GPU HA stacks.
 */
export function createTierTechDrawer(
  title: string,
  mvpItems: readonly TechRibbonItem[],
  prodItems: readonly TechRibbonItem[]
): TierTechDrawerHandle {
  const group = new THREE.Group();
  group.name = `tech-drawer-${title}`;
  group.visible = false;

  const scaleFactor = 2;
  const fontStack =
    '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

  // ── 1) Glowing horizontal spine rail expanding behind the sliding tiles ──
  const railGeo = new THREE.PlaneGeometry(1, 0.022);
  const railMat = new THREE.MeshBasicMaterial({
    color: STAGE_PALETTE.champagneGoldBright,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const railMesh = new THREE.Mesh(railGeo, railMat);
  railMesh.renderOrder = 26;
  group.add(railMesh);

  // ── 2) Header pill sprite (Tier Title + MVP / PROD HA Mode Badge) ──
  const headerLogicalW = 360;
  const headerLogicalH = 44;
  const headerAspect = headerLogicalW / headerLogicalH;
  let headerCanvas: HTMLCanvasElement | null = null;
  let headerCtx: CanvasRenderingContext2D | null = null;
  let headerTexture: THREE.Texture;

  if (typeof document !== 'undefined') {
    headerCanvas = document.createElement('canvas');
    headerCanvas.width = headerLogicalW * scaleFactor;
    headerCanvas.height = headerLogicalH * scaleFactor;
    headerCtx = headerCanvas.getContext('2d');
    const tex = new THREE.CanvasTexture(headerCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    headerTexture = tex;
  } else {
    headerTexture = new THREE.DataTexture(new Uint8Array([20, 20, 24, 220]), 1, 1);
    headerTexture.needsUpdate = true;
  }

  const headerMat = new THREE.SpriteMaterial({
    map: headerTexture,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const headerSprite = new THREE.Sprite(headerMat);
  headerSprite.renderOrder = 28;
  group.add(headerSprite);

  // ── 3) Individual 2× Retina Vector Tech Tile Sprites (3 sliding wings) ──
  const tileCount = Math.max(mvpItems.length, prodItems.length, 3);
  const tileLogicalW = 152;
  const tileLogicalH = 136;
  const tileAspect = tileLogicalW / tileLogicalH;

  interface TileBlade {
    readonly canvas: HTMLCanvasElement | null;
    readonly ctx: CanvasRenderingContext2D | null;
    readonly texture: THREE.Texture;
    readonly mat: THREE.SpriteMaterial;
    readonly sprite: THREE.Sprite;
  }

  const tiles: TileBlade[] = [];
  for (let i = 0; i < tileCount; i += 1) {
    let canvas: HTMLCanvasElement | null = null;
    let ctx: CanvasRenderingContext2D | null = null;
    let texture: THREE.Texture;

    if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = tileLogicalW * scaleFactor;
      canvas.height = tileLogicalH * scaleFactor;
      ctx = canvas.getContext('2d');
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      texture = tex;
    } else {
      texture = new THREE.DataTexture(new Uint8Array([20, 20, 24, 220]), 1, 1);
      texture.needsUpdate = true;
    }

    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.userData.techBladeIndex = i;
    sprite.renderOrder = 27 + (i === 1 ? 1 : 0);
    group.add(sprite);
    tiles.push({ canvas, ctx, texture, mat, sprite });
  }
  const bladeSprites: readonly THREE.Sprite[] = tiles.map((blade) => blade.sprite);

  let lastMode: ArchStackMode | null = null;
  let lastTheme: ThemeMode | null = null;
  let lastFocusedIdx: number | null = null;

  const setModeAndTheme = (mode: ArchStackMode, theme: ThemeMode): void => {
    if (lastMode === mode && lastTheme === theme) return;
    lastMode = mode;
    lastTheme = theme;

    const isDark = theme === 'dark';
    const isProd = mode === 'prod';
    const activeItems = isProd ? prodItems : mvpItems;

    // Update connector rail tint (champagne gold in MVP, luminous ice-gold/cyan in Prod HA)
    railMat.color.setHex(
      isProd
        ? isDark
          ? 0x9cd8ff
          : 0x2b6cb0
        : isDark
          ? STAGE_PALETTE.champagneGoldBright
          : STAGE_PALETTE.champagneGoldLightTheme
    );

    // Draw header capsule
    if (headerCtx && headerCanvas) {
      headerCtx.clearRect(0, 0, headerCanvas.width, headerCanvas.height);
      headerCtx.save();
      headerCtx.scale(scaleFactor, scaleFactor);

      const pad = 3;
      const w = headerLogicalW - pad * 2;
      const h = headerLogicalH - pad * 2;
      drawRoundedPillPath(headerCtx, pad, pad, w, h, h * 0.5);
      headerCtx.fillStyle = isDark
        ? isProd
          ? 'rgba(13, 20, 30, 0.94)'
          : 'rgba(20, 17, 15, 0.94)'
        : isProd
          ? 'rgba(244, 249, 255, 0.97)'
          : 'rgba(255, 252, 245, 0.97)';
      headerCtx.fill();

      headerCtx.lineWidth = 1.5;
      headerCtx.strokeStyle = isProd
        ? isDark
          ? 'rgba(146, 208, 255, 0.88)'
          : 'rgba(43, 108, 176, 0.78)'
        : isDark
          ? 'rgba(226, 207, 168, 0.9)'
          : 'rgba(168, 132, 74, 0.88)';
      headerCtx.stroke();

      // Mode badge pill on right side of header
      const badgeText = isProd ? 'PROD HA' : 'MVP';
      const badgeW = isProd ? 82 : 54;
      const badgeH = 24;
      const badgeX = pad + w - badgeW - 9;
      const badgeY = (headerLogicalH - badgeH) * 0.5;
      drawRoundedPillPath(headerCtx, badgeX, badgeY, badgeW, badgeH, badgeH * 0.5);
      headerCtx.fillStyle = isProd
        ? isDark
          ? 'rgba(116, 192, 255, 0.24)'
          : 'rgba(37, 99, 235, 0.14)'
        : isDark
          ? 'rgba(226, 207, 168, 0.22)'
          : 'rgba(168, 132, 74, 0.18)';
      headerCtx.fill();

      headerCtx.textAlign = 'center';
      headerCtx.textBaseline = 'middle';
      headerCtx.font = `750 11.5px ${fontStack}`;
      headerCtx.fillStyle = isProd
        ? isDark
          ? '#BCE3FF'
          : '#1D4ED8'
        : isDark
          ? '#F5E7C8'
          : '#6E4A16';
      headerCtx.fillText(badgeText, badgeX + badgeW * 0.5, headerLogicalH * 0.5 + 0.5);

      // Tier title on left side of header
      headerCtx.textAlign = 'left';
      headerCtx.font = `700 15px ${fontStack}`;
      headerCtx.fillStyle = isDark ? '#F6F4EE' : '#1D1D1F';
      headerCtx.fillText(title, pad + 16, headerLogicalH * 0.5 + 0.5, badgeX - pad - 24);

      headerCtx.restore();
      headerTexture.needsUpdate = true;
    }

    drawBlades(mode, theme, lastFocusedIdx);
  };

  const drawBlades = (mode: ArchStackMode, theme: ThemeMode, focusedIdx: number | null): void => {
    const isDark = theme === 'dark';
    const isProd = mode === 'prod';
    const activeItems = isProd ? prodItems : mvpItems;

    for (let i = 0; i < tiles.length; i += 1) {
      const blade = tiles[i];
      const item = activeItems[i];
      if (!blade.ctx || !blade.canvas) continue;

      blade.ctx.clearRect(0, 0, blade.canvas.width, blade.canvas.height);
      if (!item) {
        blade.texture.needsUpdate = true;
        continue;
      }

      const isFocused = focusedIdx === i;
      blade.ctx.save();
      blade.ctx.scale(scaleFactor, scaleFactor);

      const pad = 4;
      const cardW = tileLogicalW - pad * 2;
      const cardH = tileLogicalH - pad * 2;
      const cx = tileLogicalW * 0.5;

      // Frosted card body (elevated luminous tint when synced-focused)
      drawRoundedPillPath(blade.ctx, pad, pad, cardW, cardH, 20);
      blade.ctx.fillStyle = isDark
        ? isProd
          ? isFocused
            ? 'rgba(20, 38, 60, 0.98)'
            : 'rgba(13, 19, 28, 0.94)'
          : isFocused
            ? 'rgba(34, 28, 20, 0.98)'
            : 'rgba(18, 16, 15, 0.94)'
        : isProd
          ? isFocused
            ? 'rgba(232, 244, 255, 0.99)'
            : 'rgba(246, 250, 255, 0.97)'
          : isFocused
            ? 'rgba(255, 248, 232, 0.99)'
            : 'rgba(255, 252, 246, 0.97)';
      blade.ctx.fill();

      blade.ctx.lineWidth = isFocused ? 2.6 : 1.6;
      blade.ctx.strokeStyle = isProd
        ? isDark
          ? isFocused
            ? 'rgba(194, 232, 255, 1.0)'
            : 'rgba(146, 208, 255, 0.84)'
          : isFocused
            ? 'rgba(29, 78, 216, 0.98)'
            : 'rgba(43, 108, 176, 0.76)'
        : isDark
          ? isFocused
            ? 'rgba(255, 236, 188, 1.0)'
            : 'rgba(226, 207, 168, 0.86)'
          : isFocused
            ? 'rgba(140, 96, 30, 0.98)'
            : 'rgba(168, 132, 74, 0.84)';
      blade.ctx.stroke();

      // Subtle top specular highlight
      blade.ctx.beginPath();
      blade.ctx.moveTo(pad + 22, pad + 1.5);
      blade.ctx.lineTo(pad + cardW - 22, pad + 1.5);
      blade.ctx.lineWidth = isFocused ? 1.4 : 0.9;
      blade.ctx.strokeStyle = isDark
        ? isFocused
          ? 'rgba(255, 255, 255, 0.52)'
          : 'rgba(255, 255, 255, 0.24)'
        : 'rgba(255, 255, 255, 0.95)';
      blade.ctx.stroke();

      // Medallion circle (inverted bright fill when focused to mirror right HUD active icon)
      const iconCy = pad + 40;
      blade.ctx.beginPath();
      blade.ctx.arc(cx, iconCy, 24, 0, Math.PI * 2);
      blade.ctx.fillStyle = isFocused
        ? isProd
          ? isDark
            ? '#CBE8FF'
            : '#1D4ED8'
          : isDark
            ? '#F6E6C2'
            : '#1D1D1F'
        : isProd
          ? isDark
            ? 'rgba(116, 192, 255, 0.17)'
            : 'rgba(37, 99, 235, 0.12)'
          : isDark
            ? 'rgba(214, 184, 137, 0.18)'
            : 'rgba(176, 138, 79, 0.16)';
      blade.ctx.fill();

      const iconColor = isFocused
        ? isDark
          ? '#101216'
          : '#FAF8F4'
        : isProd
          ? isDark
            ? '#C6E7FF'
            : '#1D4ED8'
          : isDark
            ? '#F5E4BE'
            : '#7A541C';
      blade.ctx.strokeStyle = iconColor;
      blade.ctx.fillStyle = iconColor;
      drawTechVectorIcon(blade.ctx, item.icon, cx, iconCy, 15.2);

      // Tech label
      blade.ctx.textAlign = 'center';
      blade.ctx.textBaseline = 'middle';
      blade.ctx.font = `750 17.5px ${fontStack}`;
      blade.ctx.fillStyle = isDark ? '#F5F5F7' : '#1D1D1F';
      blade.ctx.fillText(item.label, cx, pad + 84, cardW - 10);

      // Mode/HA Role sub-tag
      if (item.tag) {
        blade.ctx.font = `750 13px ${fontStack}`;
        blade.ctx.fillStyle = isProd
          ? isDark
            ? '#A6D8FF'
            : '#2563EB'
          : isDark
            ? '#E5CE9E'
            : '#8B6220';
        blade.ctx.fillText(item.tag, cx, pad + 108, cardW - 10);
      }

      blade.ctx.restore();
      blade.texture.needsUpdate = true;
    }
  };

  setModeAndTheme('mvp', 'dark');

  const setUnfurl = (
    unfurl: number,
    opacity: number,
    isNarrowSplit: boolean,
    aspect: number,
    focusedBladeIndex: number | null = null
  ): void => {
    const clampedOp = THREE.MathUtils.clamp(opacity, 0, 1);
    const visible = clampedOp > 0.03;
    group.visible = visible;
    if (!visible) return;

    const normalizedFocus =
      focusedBladeIndex !== null && focusedBladeIndex >= 0
        ? Math.min(focusedBladeIndex, tiles.length - 1)
        : null;
    if (normalizedFocus !== lastFocusedIdx && lastMode !== null && lastTheme !== null) {
      lastFocusedIdx = normalizedFocus;
      drawBlades(lastMode, lastTheme, normalizedFocus);
    }

    const u = THREE.MathUtils.clamp(unfurl, 0, 1);
    // Cubic ease-out for dramatic horizontal sliding wing reveal
    const easeOut = 1 - Math.pow(1 - u, 3);

    // Responsive sizing: zero clipping on mobile 390px split view, generous spread on desktop
    const tileW = isNarrowSplit ? THREE.MathUtils.clamp(aspect * 1.06, 0.49, 0.57) : 0.8;
    const tileH = tileW / tileAspect;
    const tileStep = tileW * (isNarrowSplit ? 1.06 : 1.1);

    const headerW = isNarrowSplit ? tileW * 2.75 : tileW * 2.55;
    const headerH = headerW / headerAspect;
    const headerGap = 0.038;
    const headerScale = THREE.MathUtils.lerp(0.84, 1.0, easeOut);
    // Vertically center the combined (header + gap + tiles) assembly around local y = 0
    const tilesCenterY = -(headerH + headerGap) * 0.5;
    const headerCenterY = (tileH + headerGap) * 0.5;

    headerSprite.scale.set(headerW * headerScale, headerH * headerScale, 1);
    headerSprite.position.set(0, headerCenterY, 0.02);
    headerMat.opacity = clampedOp * THREE.MathUtils.smoothstep(u, 0.02, 0.45);

    // Expanding horizontal connector rail bridging all 3 tiles
    const railFullW = tileStep * 2.08;
    railMesh.scale.set(Math.max(0.04, railFullW * easeOut), 1, 1);
    railMesh.position.set(0, tilesCenterY, -0.02);
    railMat.opacity = clampedOp * 0.62 * easeOut;

    // Slide left/center/right tiles outward horizontally from x = 0 with zero aspect distortion
    for (let i = 0; i < tiles.length; i += 1) {
      const blade = tiles[i];
      const slotOffset = i - (tiles.length - 1) * 0.5; // -1, 0, +1
      const isOuter = Math.abs(slotOffset) > 0.1;
      const isFocused = normalizedFocus === i;
      const isDimmed = normalizedFocus !== null && !isFocused;
      const localU = isOuter
        ? THREE.MathUtils.smoothstep(u, 0.08, 1.0)
        : THREE.MathUtils.smoothstep(u, 0.0, 0.72);
      const localEase = 1 - Math.pow(1 - localU, 3);
      const focusScaleBoost = isFocused ? 1.1 : isDimmed ? 0.94 : 1.0;
      const bladeScale = THREE.MathUtils.lerp(0.76, 1.0, localEase) * focusScaleBoost;

      blade.sprite.scale.set(tileW * bladeScale, tileH * bladeScale, 1);
      blade.sprite.position.set(
        slotOffset * tileStep * localEase,
        tilesCenterY + (isFocused ? 0.036 : 0),
        (isOuter ? 0 : 0.015) + (isFocused ? 0.08 : 0)
      );
      blade.sprite.renderOrder = isFocused ? 31 : 27 + (i === 1 ? 1 : 0);
      blade.mat.opacity =
        clampedOp * THREE.MathUtils.smoothstep(localU, 0.02, 0.5) * (isDimmed ? 0.58 : 1.0);
    }
  };

  const dispose = (): void => {
    railGeo.dispose();
    railMat.dispose();
    headerMat.dispose();
    headerTexture.dispose();
    for (const blade of tiles) {
      blade.mat.dispose();
      blade.texture.dispose();
    }
  };

  return {
    group,
    bladeSprites,
    setModeAndTheme,
    setUnfurl,
    dispose,
  };
}

/**
 * Generates an immediate procedural fallback texture for the top-surface
 * iNVTRY brand mark displayed on Tier 01 during the Architecture intro
 * until the official high-resolution PNG logo texture finishes loading.
 */
export function createTopSurfaceLogoFallbackTexture(theme: ThemeMode): THREE.Texture {
  const w = 560;
  const h = 197;
  if (typeof document === 'undefined') {
    const tex = new THREE.DataTexture(new Uint8Array([226, 207, 168, 255]), 1, 1);
    tex.needsUpdate = true;
    return tex;
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const isDark = theme === 'dark';
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 108px "Cormorant Garamond", Georgia, serif';
    ctx.fillStyle = isDark ? '#F5E7C8' : '#261D12';
    ctx.fillText('iNVTRY', w * 0.5, h * 0.5);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
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
