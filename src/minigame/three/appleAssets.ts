import * as THREE from 'three';

/**
 * Creates a sculpted 3D apple silhouette via LatheGeometry (dimpled top crown,
 * plump rounded cheeks, tapered dimpled base) rather than a plain sphere.
 */
export function createSculptedAppleGeometry(radialSegments = 20): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.001, -0.34),
    new THREE.Vector2(0.11, -0.39),
    new THREE.Vector2(0.24, -0.37),
    new THREE.Vector2(0.36, -0.25),
    new THREE.Vector2(0.43, -0.07),
    new THREE.Vector2(0.45, 0.11),
    new THREE.Vector2(0.41, 0.27),
    new THREE.Vector2(0.31, 0.38),
    new THREE.Vector2(0.18, 0.41),
    new THREE.Vector2(0.08, 0.35),
    new THREE.Vector2(0.001, 0.28),
  ];
  const geo = new THREE.LatheGeometry(pts, radialSegments);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a small curved leaf geometry positioned at the top crown of each apple.
 */
export function createAppleLeafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.16, 0.08, 0.24, 0.24);
  shape.quadraticCurveTo(0.08, 0.22, 0, 0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geo.translate(0.01, 0.34, -0.02);
  geo.rotateZ(-0.22);
  geo.rotateX(0.28);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates a high-DPI 1024x128 sprite atlas containing digits 1..9 in 9 equal horizontal slots.
 * Rendered with bold high-contrast typography and dark rim contour for instant scanability
 * during fast 120-second Fruit Box play.
 */
export function createDigitAtlasTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const slots = 9;
  const cellSize = 128;
  const canvas = document.createElement('canvas');
  canvas.width = slots * cellSize;
  canvas.height = cellSize;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < slots; i += 1) {
    const digit = String(i + 1);
    const cx = i * cellSize + cellSize * 0.5;
    const cy = cellSize * 0.54;

    // Subtle glossy radial halo behind digit so contrast stays razor-sharp against red & gold
    const bgGrad = ctx.createRadialGradient(cx, cy - 2, 6, cx, cy, 46);
    bgGrad.addColorStop(0, 'rgba(10, 6, 22, 0.42)');
    bgGrad.addColorStop(0.68, 'rgba(10, 6, 22, 0.14)');
    bgGrad.addColorStop(1, 'rgba(10, 6, 22, 0)');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(cx, cy - 2, 46, 0, Math.PI * 2);
    ctx.fill();

    ctx.font =
      "800 84px 'Pretendard Variable', 'SF Pro Rounded', 'Inter', system-ui, -apple-system, sans-serif";

    // Crisp outer dark contour
    ctx.lineWidth = 12;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(14, 7, 28, 0.88)';
    ctx.strokeText(digit, cx, cy);

    // Pure luminous white core
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(digit, cx, cy);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Single-draw-call instanced digit material (renders all 170 apple numbers cleanly in 1 draw call).
 * Avoids heavy shader loops for instant compilation on Windows D3D11 FXC & iOS WebGL2.
 */
export function createInstancedDigitMaterial(atlas: THREE.CanvasTexture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    uniforms: {
      uAtlas: { value: atlas },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aDigit;
      attribute float aState;
      attribute float aAlpha;

      varying vec2 vUv;
      varying float vState;
      varying float vAlpha;

      void main() {
        float slot = clamp(aDigit - 1.0, 0.0, 8.0);
        vUv = vec2((slot + uv.x) / 9.0, uv.y);
        vState = aState;
        vAlpha = aAlpha;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uAtlas;
      uniform float uTime;

      varying vec2 vUv;
      varying float vState;
      varying float vAlpha;

      void main() {
        vec4 tex = texture2D(uAtlas, vUv);
        float alpha = tex.a * vAlpha;
        if (alpha < 0.02) discard;

        vec3 tint = vec3(1.0);
        // vState: 0 = idle, 1 = selected (<10 cyan), 2 = exact 10 (gold/emerald), 3 = over 10 (hot pink), 4 = hint (cyan pulse)
        if (vState > 1.5 && vState < 2.5) {
          float pulse = 0.85 + 0.15 * sin(uTime * 14.0);
          tint = mix(vec3(1.0, 0.98, 0.82), vec3(0.55, 1.0, 0.72), 0.35 * pulse);
        } else if (vState > 2.5 && vState < 3.5) {
          tint = vec3(1.0, 0.72, 0.82);
        } else if (vState > 0.5 && vState < 1.5) {
          tint = vec3(0.86, 0.99, 1.0);
        } else if (vState > 3.5) {
          float hPulse = 0.5 + 0.5 * sin(uTime * 10.0);
          tint = mix(vec3(1.0), vec3(0.45, 0.96, 1.0), 0.55 * hPulse);
        }

        gl_FragColor = vec4(tex.rgb * tint, alpha);
      }
    `,
  });
}

/**
 * Custom GLSL Neon Synthwave Aurora + Horizon Grid backdrop shader.
 * Dynamically responds to Fever level and recent clear shockwave pulses.
 */
export function createNeonBackdropMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uFever: { value: 0 },
      uSoft: { value: 0 },
      uPulseCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uPulseAge: { value: 10.0 },
      uPulseStrength: { value: 0.0 },
      uAspect: { value: 16 / 9 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.999, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uFever;
      uniform float uSoft;
      uniform vec2 uPulseCenter;
      uniform float uPulseAge;
      uniform float uPulseStrength;
      uniform float uAspect;

      varying vec2 vUv;

      void main() {
        vec2 uv = vUv;
        vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
        float t = uTime;

        // Deep arcade twilight base
        vec3 deepTop = vec3(0.035, 0.025, 0.095);
        vec3 deepMid = vec3(0.065, 0.032, 0.145);
        vec3 deepBot = vec3(0.024, 0.015, 0.062);
        vec3 col = mix(deepBot, mix(deepMid, deepTop, smoothstep(0.35, 0.95, uv.y)), smoothstep(0.0, 0.55, uv.y));

        // Swirling dual neon aurora ribbons (electric cyan + hot magenta + fever gold)
        float w1 = sin(p.x * 2.2 + t * 0.55) * cos(p.y * 2.5 - t * 0.4);
        float w2 = cos(p.x * 3.1 - t * 0.45 + p.y * 1.9);
        vec3 neonCyan = vec3(0.0, 0.85, 0.98);
        vec3 neonMagenta = vec3(0.95, 0.14, 0.58);
        vec3 neonGold = vec3(1.0, 0.78, 0.18);

        float aurora1 = smoothstep(-0.3, 0.9, w1) * exp(-length(p - vec2(-0.35, 0.22)) * 1.15);
        float aurora2 = smoothstep(-0.2, 0.95, w2) * exp(-length(p - vec2(0.38, -0.18)) * 1.15);
        col += neonCyan * aurora1 * (0.20 + 0.14 * uFever);
        col += neonMagenta * aurora2 * (0.22 + 0.16 * uFever);

        // Fever chromatic rainbow rim glow
        if (uFever > 0.01) {
          float angle = atan(p.y, p.x);
          vec3 rainbow = 0.5 + 0.5 * cos(angle * 2.0 + t * 3.0 + vec3(0.0, 2.094, 4.188));
          float edgeMask = smoothstep(0.28, 0.92, length(p));
          col += mix(rainbow, neonGold, 0.35) * edgeMask * uFever * 0.26;
        }

        // Subtle animated perspective arcade floor grid
        float horizon = 0.54;
        float gy = max(0.02, abs(uv.y - horizon) + 0.18);
        vec2 gridUv = vec2((uv.x - 0.5) * uAspect / gy, 1.0 / gy + t * (0.45 + uFever * 0.55));
        vec2 cell = abs(fract(gridUv * 1.6 - 0.5) - 0.5) / (fwidth(gridUv * 1.6) + 0.001);
        float line = 1.0 - min(min(cell.x, cell.y), 1.0);
        float gridFade = smoothstep(0.0, 0.45, 1.0 - abs(uv.y - 0.18) * 1.55) * 0.28;
        vec3 gridColor = mix(vec3(0.28, 0.52, 0.98), vec3(1.0, 0.35, 0.78), 0.35 + 0.45 * uFever);
        col += gridColor * line * gridFade;

        // Reactive shockwave light ripple emitted when apples pop!
        if (uPulseStrength > 0.001 && uPulseAge < 1.6) {
          vec2 delta = (uv - uPulseCenter) * vec2(uAspect, 1.0);
          float dist = length(delta);
          float radius = uPulseAge * 1.15;
          float ring = exp(-pow((dist - radius) * 12.0, 2.0)) * exp(-uPulseAge * 2.4);
          vec3 pulseCol = mix(vec3(0.18, 1.0, 0.72), vec3(1.0, 0.85, 0.25), uFever);
          col += pulseCol * ring * uPulseStrength * 0.65;
        }

        // Soft-tint eye-comfort filter (honoring classic Fruit Box soft color toggle)
        if (uSoft > 0.01) {
          float luma = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(col, vec3(luma * 0.92 + 0.04, luma * 0.94 + 0.045, luma * 1.02 + 0.06), uSoft * 0.55);
        }

        // Gentle vignette framing so apples remain hero focal point
        float vig = smoothstep(1.38, 0.28, length(p));
        col *= (0.74 + 0.26 * vig);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/**
 * Custom GLSL additive particle material for juicy apple splashes & neon combo sparkles.
 */
export function createJuiceParticleMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute vec3 aColor;
      attribute float aAlpha;

      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * (290.0 / max(1.0, -mvPosition.z)), 2.0, 64.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        if (vAlpha <= 0.01) discard;
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c);
        if (r > 0.5) discard;
        // Bright sparkling core + soft neon glow aura
        float core = exp(-r * r * 26.0);
        float halo = smoothstep(0.5, 0.0, r) * 0.65;
        float intensity = core + halo;
        vec3 finalCol = mix(vColor, vec3(1.0), core * 0.72);
        gl_FragColor = vec4(finalCol * intensity, intensity * vAlpha);
      }
    `,
  });
}

/**
 * Custom GLSL expanding neon shockwave ring shader.
 */
export function createShockwaveRingMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color('#39FF14') },
      uAlpha: { value: 0.0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha;
      varying vec2 vUv;

      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        float ring = smoothstep(0.58, 0.86, r) * smoothstep(1.0, 0.88, r);
        float glow = smoothstep(0.35, 0.85, r) * smoothstep(1.0, 0.78, r) * 0.45;
        float a = (ring + glow) * uAlpha;
        if (a <= 0.005) discard;
        vec3 col = mix(uColor, vec3(1.0), ring * 0.55);
        gl_FragColor = vec4(col, a);
      }
    `,
  });
}
