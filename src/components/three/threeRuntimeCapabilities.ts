import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type StageTierCode = 'S' | 'A' | 'B' | 'C';

let cachedIsSoftwareGl: boolean | null = null;

export function peekCachedSoftwareWebGl(): boolean | null {
  return cachedIsSoftwareGl;
}

/**
 * Classifies an existing WebGL context directly from its GPU renderer string
 * without allocating or tearing down a separate probe context.
 */
export function detectSoftwareWebGlFromContext(
  gl: WebGLRenderingContext | WebGL2RenderingContext | null | undefined
): boolean {
  if (cachedIsSoftwareGl !== null) {
    return cachedIsSoftwareGl;
  }
  if (!gl) {
    cachedIsSoftwareGl = true;
    return true;
  }
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    cachedIsSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    return cachedIsSoftwareGl;
  } catch {
    cachedIsSoftwareGl = true;
    return true;
  }
}

/**
 * Detects CPU/software WebGL (SwiftShader, llvmpipe, softpipe, Basic Render)
 * directly from the GPU renderer string (never user-agent) and frees the probe context.
 */
export function detectSoftwareWebGl(): boolean {
  if (cachedIsSoftwareGl !== null) {
    return cachedIsSoftwareGl;
  }
  if (typeof document === 'undefined') {
    cachedIsSoftwareGl = true;
    return true;
  }
  try {
    const probeCanvas = document.createElement('canvas');
    const gl =
      probeCanvas.getContext('webgl2') ||
      probeCanvas.getContext('webgl') ||
      null;
    if (!gl) {
      cachedIsSoftwareGl = true;
      return true;
    }
    const detected = detectSoftwareWebGlFromContext(gl);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    probeCanvas.width = 0;
    probeCanvas.height = 0;
    return detected;
  } catch {
    cachedIsSoftwareGl = true;
    return true;
  }
}

/**
 * Generates a zero-dependency studio reflection environment on every device so metallic
 * and glass surfaces never reflect black vacuum. On CPU/software WebGL (`isSoftwareGl`),
 * builds a fast equirectangular studio softbox map (<0.5ms) instead of multi-pass PMREM convolution.
 */
export function createStudioEnvironmentTexture(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl = false
): THREE.Texture {
  if (isSoftwareGl) {
    const w = 128;
    const h = 64;
    const envCanvas = document.createElement('canvas');
    envCanvas.width = w;
    envCanvas.height = h;
    const ctx = envCanvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#eef4ff');
      grad.addColorStop(0.42, '#f8f2e8');
      grad.addColorStop(0.52, '#6d6962');
      grad.addColorStop(1, '#1c1b19');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Warm & cool studio softbox highlights for crisp specular reflections
      ctx.fillStyle = 'rgba(255, 250, 238, 0.92)';
      ctx.fillRect(18, 8, 30, 14);
      ctx.fillStyle = 'rgba(218, 234, 255, 0.88)';
      ctx.fillRect(78, 10, 28, 13);
    }
    const tex = new THREE.CanvasTexture(envCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.needsUpdate = true;
    return tex;
  }

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = new RoomEnvironment();
  const envTarget = pmremGenerator.fromScene(roomEnvironment, 0.04);
  roomEnvironment.dispose();
  pmremGenerator.dispose();
  return envTarget.texture;
}

/**
 * Paces software-WebGL frames by waiting for the CPU draw (`gl.fenceSync`) to complete
 * and then pausing 140ms so the main thread and browser UI never stall.
 */
export function scheduleAfterSoftwareDraw(
  renderer: THREE.WebGLRenderer,
  cb: () => void,
  timerHandleRef: { current: number }
): void {
  const rawCtx = renderer.getContext();
  const gl2 =
    typeof WebGL2RenderingContext !== 'undefined' && rawCtx instanceof WebGL2RenderingContext
      ? rawCtx
      : null;

  if (!gl2 || typeof gl2.fenceSync !== 'function') {
    rawCtx?.flush?.();
    timerHandleRef.current = window.setTimeout(cb, 140);
    return;
  }

  const sync = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl2.flush();
  if (!sync) {
    timerHandleRef.current = window.setTimeout(cb, 140);
    return;
  }

  const poll = () => {
    if (gl2.isContextLost()) {
      return;
    }
    const state = gl2.getSyncParameter(sync, gl2.SYNC_STATUS);
    if (state === gl2.UNSIGNALED) {
      timerHandleRef.current = window.setTimeout(poll, 8);
    } else {
      gl2.deleteSync(sync);
      timerHandleRef.current = window.setTimeout(cb, 140);
    }
  };
  timerHandleRef.current = window.setTimeout(poll, 8);
}

/**
 * Disposes all geometries, materials, and bound textures inside an Object3D subtree.
 */
export function disposeObject3DTree(root: THREE.Object3D): void {
  const disposedGeos = new Set<THREE.BufferGeometry>();
  const disposedMats = new Set<THREE.Material>();
  const disposedTex = new Set<THREE.Texture>();

  const collectMaterialTextures = (mat: THREE.Material) => {
    const record = mat as unknown as Record<string, unknown>;
    for (const val of Object.values(record)) {
      if (val && typeof val === 'object' && (val as THREE.Texture).isTexture) {
        const tex = val as THREE.Texture;
        if (!disposedTex.has(tex)) {
          disposedTex.add(tex);
          tex.dispose();
        }
      }
    }
  };

  root.traverse((obj) => {
    const meshLike = obj as THREE.Mesh;
    if (meshLike.geometry && !disposedGeos.has(meshLike.geometry)) {
      disposedGeos.add(meshLike.geometry);
      meshLike.geometry.dispose();
    }
    if (meshLike.material) {
      const mats = Array.isArray(meshLike.material) ? meshLike.material : [meshLike.material];
      for (const m of mats) {
        if (m && !disposedMats.has(m)) {
          disposedMats.add(m);
          collectMaterialTextures(m);
          m.dispose();
        }
      }
    }
  });
}

/**
 * Procedural soft radial contact-shadow alpha/color texture (`SRGBColorSpace`).
 */
export function createRadialContactShadowTexture(
  renderer: THREE.WebGLRenderer,
  isDark: boolean
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = size * 0.5;
    const grad = ctx.createRadialGradient(cx, cx, size * 0.04, cx, cx, size * 0.49);
    if (isDark) {
      grad.addColorStop(0, 'rgba(4, 5, 8, 0.92)');
      grad.addColorStop(0.45, 'rgba(6, 8, 12, 0.46)');
      grad.addColorStop(0.78, 'rgba(6, 8, 12, 0.12)');
      grad.addColorStop(1, 'rgba(6, 8, 12, 0)');
    } else {
      grad.addColorStop(0, 'rgba(22, 20, 18, 0.62)');
      grad.addColorStop(0.46, 'rgba(22, 20, 18, 0.28)');
      grad.addColorStop(0.78, 'rgba(22, 20, 18, 0.07)');
      grad.addColorStop(1, 'rgba(22, 20, 18, 0)');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}

/**
 * Procedural soft radial volumetric aura glow texture (`SRGBColorSpace`).
 */
export function createRadialAuraGlowTexture(
  renderer: THREE.WebGLRenderer
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = size * 0.5;
    const grad = ctx.createRadialGradient(cx, cx, size * 0.02, cx, cx, size * 0.5);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(0.32, 'rgba(255, 255, 255, 0.52)');
    grad.addColorStop(0.68, 'rgba(255, 255, 255, 0.14)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}

/**
 * Tileable grayscale stone/plaster micro-relief texture (`NoColorSpace`) for `bumpMap` / `roughnessMap`.
 */
export function createStoneMicroReliefTexture(
  renderer: THREE.WebGLRenderer
): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const data = img.data;
    // Deterministic hash noise so stone grain is crisp and repeatable without external assets
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n1 = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const frac1 = n1 - Math.floor(n1);
        const n2 = Math.sin(((x >> 1) + 17) * 19.19 + ((y >> 1) + 31) * 47.71) * 19341.17;
        const frac2 = n2 - Math.floor(n2);
        const v = Math.round(112 + frac1 * 48 + frac2 * 40);
        const idx = (y * size + x) * 4;
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}

/**
 * Procedural architectural stage preview card (`SRGBColorSpace`) mounted inside the
 * miniature showcase frame of `StoreThreeGachaStage` (zero external 404 dependencies).
 */
export function createStagePreviewCardTexture(
  renderer: THREE.WebGLRenderer,
  params: {
    tier: StageTierCode;
    isOutdoor?: boolean;
  }
): THREE.CanvasTexture {
  const w = 256;
  const h = 340;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const paletteByTier: Record<
      StageTierCode,
      { top: string; mid: string; floor: string; accent: string; arch: string }
    > = {
      S: {
        top: params.isOutdoor ? '#1D2942' : '#1E1A14',
        mid: params.isOutdoor ? '#3B5278' : '#3A3022',
        floor: '#171410',
        accent: '#E7C469',
        arch: 'rgba(239, 206, 122, 0.65)',
      },
      A: {
        top: params.isOutdoor ? '#20324A' : '#1A202B',
        mid: params.isOutdoor ? '#4B6B8E' : '#313B4D',
        floor: '#141820',
        accent: '#DCE6F5',
        arch: 'rgba(216, 228, 246, 0.56)',
      },
      B: {
        top: params.isOutdoor ? '#2D3E52' : '#262422',
        mid: params.isOutdoor ? '#5A7692' : '#433F3A',
        floor: '#1C1B19',
        accent: '#B9D3F5',
        arch: 'rgba(196, 214, 238, 0.45)',
      },
      C: {
        top: '#2B2A28',
        mid: '#4A4742',
        floor: '#21201E',
        accent: '#D8D4CC',
        arch: 'rgba(216, 212, 204, 0.36)',
      },
    };
    const pal = paletteByTier[params.tier] || paletteByTier.C;

    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, pal.top);
    bgGrad.addColorStop(0.66, pal.mid);
    bgGrad.addColorStop(0.67, pal.floor);
    bgGrad.addColorStop(1, '#0D0D0F');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Architectural colonnade / arched gallery perspective lines
    ctx.strokeStyle = pal.arch;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(18, 18, w - 36, h - 36);

    ctx.beginPath();
    ctx.arc(w * 0.5, 118, 66, Math.PI, 0, false);
    ctx.lineTo(w * 0.5 + 66, h * 0.67);
    ctx.moveTo(w * 0.5 - 66, 118);
    ctx.lineTo(w * 0.5 - 66, h * 0.67);
    ctx.stroke();

    // Perspective floor rays
    ctx.globalAlpha = 0.34;
    for (let i = -2; i <= 2; i += 1) {
      ctx.beginPath();
      ctx.moveTo(w * 0.5 + i * 22, h * 0.67);
      ctx.lineTo(w * 0.5 + i * 58, h - 18);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Subtle center spotlight glow
    const glow = ctx.createRadialGradient(w * 0.5, h * 0.48, 8, w * 0.5, h * 0.48, 108);
    glow.addColorStop(0, pal.accent);
    glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;
  return tex;
}
