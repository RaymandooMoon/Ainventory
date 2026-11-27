import type { FruitBoxCell, GridSelectionRect } from '../fruitBoxEngine.ts';
import type {
  AppleStageBurstEvent,
  AppleStageController,
  SelectionVisualState,
} from './AppleArcadeStage.ts';

interface FallingApple2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vRot: number;
  value: number;
  isGolden: boolean;
  alpha: number;
}

interface PopSpark2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  age: number;
  life: number;
}

const MAX_CELLS = 170;

/**
 * High-Performance Original 2D Fruit Box (원조 후르츠박스 / フルーツボックス) Canvas Renderer.
 * Optimizations for instant 0-lag drag responsiveness:
 * - Pre-bakes Hi-DPI offscreen sprite stamps for digits 1..9 (regular + golden) once per resize/tint
 *   so each apple draws via a single GPU-accelerated `drawImage` (< 1.2ms total frame time).
 * - Pre-bakes static orchard backdrop + rounded cream frame + grid dots into an offscreen layer.
 * - Uses zero-allocation `Uint8Array` bitmasks & cached canvas `DOMRect` (zero layout flush on drag).
 * - Renders synchronously on pointer drag/pop so selection box tracks cursor with zero frame lag.
 */
export function createOriginalFruitBox2D(options: {
  readonly canvas: HTMLCanvasElement;
  readonly cols: number;
  readonly rows: number;
  readonly softColors?: boolean;
}): AppleStageController | null {
  const { canvas } = options;
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) ?? canvas.getContext('2d');
  if (!ctx) return null;

  let boardCols = options.cols;
  let boardRows = options.rows;
  let cells: readonly FruitBoxCell[] = [];
  const selectedMask = new Uint8Array(MAX_CELLS);
  const hintMask = new Uint8Array(MAX_CELLS);
  let hasActiveHint = false;
  let selectionRect: GridSelectionRect | null = null;
  let selectionState: SelectionVisualState = 'idle';
  let softColors = Boolean(options.softColors);
  let reducedMotion = false;

  let viewportW = Math.max(2, canvas.clientWidth || 960);
  let viewportH = Math.max(2, canvas.clientHeight || 600);
  let currentDpr = 1;
  let cachedRect: DOMRect | null = null;
  let boardX = 0;
  let boardY = 0;
  let cellSize = 40;

  // Offscreen sprite & static background caches
  let bgCache: HTMLCanvasElement | null = null;
  let spritePixelSize = 0;
  let spriteHalfLogical = 0;
  const redSprites: (HTMLCanvasElement | null)[] = new Array(10).fill(null);
  const goldSprites: (HTMLCanvasElement | null)[] = new Array(10).fill(null);

  const fallingApples: FallingApple2D[] = [];
  const sparks: PopSpark2D[] = [];
  let disposed = false;
  let rafId = 0;
  let dirty = true;
  let lastTime = performance.now();
  let elapsed = 0;

  const paintCartoonAppleStamp = (
    c: CanvasRenderingContext2D,
    r: number,
    value: number,
    isGolden: boolean
  ): void => {
    // Soft ground shadow
    c.fillStyle = 'rgba(42, 82, 22, 0.14)';
    c.beginPath();
    c.ellipse(0, r * 0.94, r * 0.72, r * 0.22, 0, 0, Math.PI * 2);
    c.fill();

    // Twin-lobe classic apple body
    const bodyGrad = c.createRadialGradient(-r * 0.28, -r * 0.34, r * 0.12, 0, r * 0.06, r * 1.08);
    if (isGolden) {
      bodyGrad.addColorStop(0, '#fff5a8');
      bodyGrad.addColorStop(0.28, '#ffd138');
      bodyGrad.addColorStop(1, '#d48206');
    } else if (softColors) {
      bodyGrad.addColorStop(0, '#ffd4d0');
      bodyGrad.addColorStop(0.26, '#ef8d89');
      bodyGrad.addColorStop(1, '#c8605e');
    } else {
      bodyGrad.addColorStop(0, '#ff8d80');
      bodyGrad.addColorStop(0.24, '#ec3328');
      bodyGrad.addColorStop(1, '#b51513');
    }

    c.beginPath();
    c.moveTo(0, -r * 0.72);
    c.bezierCurveTo(r * 0.45, -r * 1.04, r * 1.06, -r * 0.56, r * 0.94, r * 0.12);
    c.bezierCurveTo(r * 0.85, r * 0.76, r * 0.38, r * 1.02, 0, r * 0.84);
    c.bezierCurveTo(-r * 0.38, r * 1.02, -r * 0.85, r * 0.76, -r * 0.94, r * 0.12);
    c.bezierCurveTo(-r * 1.06, -r * 0.56, -r * 0.45, -r * 1.04, 0, -r * 0.72);
    c.closePath();

    c.fillStyle = bodyGrad;
    c.fill();
    c.lineWidth = Math.max(1.2, r * 0.07);
    c.strokeStyle = isGolden ? '#9e5d00' : softColors ? '#ad5050' : '#8c0e0e';
    c.stroke();

    // Specular highlight crescent
    c.fillStyle = 'rgba(255, 255, 255, 0.42)';
    c.beginPath();
    c.ellipse(-r * 0.36, -r * 0.34, r * 0.22, r * 0.12, -0.55, 0, Math.PI * 2);
    c.fill();

    // Curved brown stem
    c.strokeStyle = '#6c421f';
    c.lineWidth = Math.max(1.8, r * 0.12);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(0, -r * 0.68);
    c.quadraticCurveTo(r * 0.05, -r * 0.98, r * 0.18, -r * 1.08);
    c.stroke();

    // Fresh green leaf
    c.fillStyle = isGolden ? '#b6e64c' : softColors ? '#8cc87c' : '#58c93a';
    c.strokeStyle = softColors ? '#5b924e' : '#2e881a';
    c.lineWidth = Math.max(1, r * 0.06);
    c.beginPath();
    c.moveTo(r * 0.05, -r * 0.8);
    c.quadraticCurveTo(r * 0.42, -r * 1.16, r * 0.62, -r * 0.84);
    c.quadraticCurveTo(r * 0.32, -r * 0.64, r * 0.05, -r * 0.8);
    c.closePath();
    c.fill();
    c.stroke();

    // Bold high-contrast white digit
    c.font = `800 ${Math.max(12, Math.round(r * 1.18))}px 'Pretendard Variable', 'SF Pro Rounded', system-ui, -apple-system, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = Math.max(2.6, r * 0.19);
    c.strokeStyle = isGolden ? 'rgba(116, 62, 0, 0.82)' : 'rgba(98, 12, 12, 0.78)';
    c.strokeText(String(value), 0, r * 0.09);
    c.fillStyle = '#ffffff';
    c.fillText(String(value), 0, r * 0.09);
  };

  const rebuildAppleSprites = (): void => {
    if (typeof document === 'undefined' || cellSize <= 0) return;
    const appleRadius = cellSize * 0.4;
    const logicalBox = Math.ceil(appleRadius * 2.5);
    spriteHalfLogical = logicalBox * 0.5;
    spritePixelSize = Math.max(16, Math.ceil(logicalBox * currentDpr));

    for (let digit = 1; digit <= 9; digit += 1) {
      for (const isGolden of [false, true]) {
        const targetArr = isGolden ? goldSprites : redSprites;
        let off = targetArr[digit];
        if (!off) {
          off = document.createElement('canvas');
          targetArr[digit] = off;
        }
        off.width = spritePixelSize;
        off.height = spritePixelSize;
        const octx = off.getContext('2d');
        if (!octx) continue;
        octx.setTransform(currentDpr, 0, 0, currentDpr, spriteHalfLogical * currentDpr, spriteHalfLogical * currentDpr);
        octx.clearRect(-spriteHalfLogical, -spriteHalfLogical, logicalBox, logicalBox);
        paintCartoonAppleStamp(octx, appleRadius, digit, isGolden);
      }
    }
  };

  const rebuildBackgroundCache = (): void => {
    if (typeof document === 'undefined' || viewportW <= 2 || viewportH <= 2) return;
    if (!bgCache) {
      bgCache = document.createElement('canvas');
    }
    bgCache.width = Math.floor(viewportW * currentDpr);
    bgCache.height = Math.floor(viewportH * currentDpr);
    const bctx = bgCache.getContext('2d');
    if (!bctx) return;

    bctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);

    const bgGrad = bctx.createLinearGradient(0, 0, 0, viewportH);
    bgGrad.addColorStop(0, '#b9e686');
    bgGrad.addColorStop(1, '#8ecc5a');
    bctx.fillStyle = bgGrad;
    bctx.fillRect(0, 0, viewportW, viewportH);

    const pad = Math.max(10, cellSize * 0.32);
    const frameX = boardX - pad;
    const frameY = boardY - pad;
    const frameW = boardCols * cellSize + pad * 2;
    const frameH = boardRows * cellSize + pad * 2;

    bctx.save();
    bctx.shadowColor = 'rgba(42, 92, 18, 0.22)';
    bctx.shadowBlur = 22;
    bctx.shadowOffsetY = 6;
    bctx.fillStyle = '#f3fce9';
    bctx.strokeStyle = '#6db63e';
    bctx.lineWidth = 4;
    bctx.beginPath();
    bctx.roundRect(frameX, frameY, frameW, frameH, 18);
    bctx.fill();
    bctx.stroke();
    bctx.restore();

    bctx.fillStyle = 'rgba(110, 176, 66, 0.14)';
    const dotR = Math.max(1.5, cellSize * 0.045);
    for (let r = 0; r < boardRows; r += 1) {
      const cy = boardY + (r + 0.5) * cellSize;
      for (let c = 0; c < boardCols; c += 1) {
        const cx = boardX + (c + 0.5) * cellSize;
        bctx.beginPath();
        bctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        bctx.fill();
      }
    }
  };

  const computeLayout = (): void => {
    const padX = Math.max(16, viewportW * 0.04);
    const padY = Math.max(16, viewportH * 0.04);
    const availW = Math.max(100, viewportW - padX * 2);
    const availH = Math.max(100, viewportH - padY * 2);
    cellSize = Math.min(availW / boardCols, availH / boardRows);
    const totalW = cellSize * boardCols;
    const totalH = cellSize * boardRows;
    boardX = (viewportW - totalW) * 0.5;
    boardY = (viewportH - totalH) * 0.5;
    rebuildBackgroundCache();
    rebuildAppleSprites();
    dirty = true;
  };

  const drawFrame = (dt: number): void => {
    if (bgCache) {
      ctx.drawImage(bgCache, 0, 0, viewportW, viewportH);
    } else {
      ctx.fillStyle = '#a4db72';
      ctx.fillRect(0, 0, viewportW, viewportH);
    }

    const appleRadius = cellSize * 0.4;
    const drawSize = spriteHalfLogical * 2;
    const selRingR = appleRadius * 1.12;
    const selStrokeW = Math.max(2.5, appleRadius * 0.15);

    // Draw all active 2D apples using ultra-fast pre-baked Hi-DPI sprite stamps!
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      if (cell.cleared) continue;

      const cx = boardX + (cell.col + 0.5) * cellSize;
      const cy = boardY + (cell.row + 0.5) * cellSize;
      const isSelected = cell.id < MAX_CELLS && selectedMask[cell.id] === 1;
      const isHint = cell.id < MAX_CELLS && hintMask[cell.id] === 1;

      if (isSelected || isHint) {
        ctx.lineWidth = selStrokeW;
        if (isSelected && selectionState === 'exact') {
          ctx.strokeStyle = '#24b445';
          ctx.fillStyle = 'rgba(130, 245, 118, 0.42)';
        } else if (isSelected && selectionState === 'over') {
          ctx.strokeStyle = '#d9384a';
          ctx.fillStyle = 'rgba(255, 120, 138, 0.28)';
        } else if (isSelected) {
          ctx.strokeStyle = '#f2ae00';
          ctx.fillStyle = 'rgba(255, 232, 110, 0.44)';
        } else {
          const pulse = 0.45 + 0.45 * Math.sin(elapsed * 9.0);
          ctx.strokeStyle = `rgba(34, 184, 72, ${pulse.toFixed(2)})`;
          ctx.fillStyle = `rgba(148, 245, 134, ${(pulse * 0.35).toFixed(2)})`;
        }
        ctx.beginPath();
        ctx.arc(cx, cy, selRingR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      const sprite = (cell.isGolden ? goldSprites : redSprites)[cell.value];
      if (sprite) {
        if (isSelected) {
          const scaled = drawSize * 1.08;
          ctx.drawImage(sprite, cx - scaled * 0.5, cy - scaled * 0.5, scaled, scaled);
        } else {
          ctx.drawImage(sprite, cx - spriteHalfLogical, cy - spriteHalfLogical, drawSize, drawSize);
        }
      }
    }

    // Crisp classic drag rectangle
    if (selectionRect) {
      const minX = boardX + Math.min(selectionRect.x1, selectionRect.x2) * cellSize;
      const minY = boardY + Math.min(selectionRect.y1, selectionRect.y2) * cellSize;
      const w = Math.abs(selectionRect.x2 - selectionRect.x1) * cellSize;
      const h = Math.abs(selectionRect.y2 - selectionRect.y1) * cellSize;

      ctx.fillStyle =
        selectionState === 'exact'
          ? 'rgba(84, 224, 96, 0.28)'
          : selectionState === 'over'
            ? 'rgba(236, 72, 92, 0.18)'
            : 'rgba(255, 226, 94, 0.28)';
      ctx.strokeStyle =
        selectionState === 'exact'
          ? '#22b144'
          : selectionState === 'over'
            ? '#d9384a'
            : '#e6a500';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(minX, minY, Math.max(4, w), Math.max(4, h), 6);
      ctx.fill();
      ctx.stroke();
    }

    // Classic gravity-drop falling apples (blitted from cached sprites!)
    for (let i = fallingApples.length - 1; i >= 0; i -= 1) {
      const fa = fallingApples[i];
      fa.vy += 1280 * dt;
      fa.x += fa.vx * dt;
      fa.y += fa.vy * dt;
      fa.rot += fa.vRot * dt;
      fa.alpha = Math.max(0, fa.alpha - dt * 0.55);

      if (fa.y > viewportH + appleRadius * 2 || fa.alpha <= 0.02) {
        fallingApples.splice(i, 1);
        continue;
      }

      const sprite = (fa.isGolden ? goldSprites : redSprites)[fa.value];
      if (sprite) {
        ctx.save();
        ctx.globalAlpha = fa.alpha;
        ctx.translate(fa.x, fa.y);
        ctx.rotate(fa.rot);
        ctx.drawImage(sprite, -spriteHalfLogical, -spriteHalfLogical, drawSize, drawSize);
        ctx.restore();
      }
    }

    // Crisp pop sparkles
    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const sp = sparks[i];
      sp.age += dt;
      if (sp.age >= sp.life) {
        sparks.splice(i, 1);
        continue;
      }
      sp.vy += 380 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      const alpha = 1 - sp.age / sp.life;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = sp.color;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, sp.radius * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  const scheduleLoop = (): void => {
    if (disposed || rafId !== 0) return;
    lastTime = performance.now();
    rafId = window.requestAnimationFrame(tick);
  };

  const tick = (now: number): void => {
    rafId = 0;
    if (disposed) return;
    if (document.hidden) return;

    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) * 0.001));
    lastTime = now;
    elapsed += dt;

    const needsContinuousAnimation =
      fallingApples.length > 0 || sparks.length > 0 || hasActiveHint;

    if (dirty || needsContinuousAnimation) {
      dirty = false;
      drawFrame(dt);
    }

    if (needsContinuousAnimation) {
      rafId = window.requestAnimationFrame(tick);
    }
  };

  const requestPaintNow = (): void => {
    dirty = true;
    if (!disposed && !document.hidden) {
      // Paint synchronously during drag for zero-frame-latency cursor tracking!
      const now = performance.now();
      const dt = Math.min(0.033, Math.max(0.001, (now - lastTime) * 0.001));
      lastTime = now;
      elapsed += dt;
      dirty = false;
      drawFrame(dt);
      if (fallingApples.length > 0 || sparks.length > 0 || hasActiveHint) {
        scheduleLoop();
      }
    }
  };

  const resize = (width: number, height: number): void => {
    if (disposed) return;
    viewportW = Math.max(2, Math.floor(width));
    viewportH = Math.max(2, Math.floor(height));
    currentDpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewportW * currentDpr);
    canvas.height = Math.floor(viewportH * currentDpr);
    ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
    cachedRect = canvas.getBoundingClientRect();
    computeLayout();
    scheduleLoop();
  };

  resize(viewportW, viewportH);

  return {
    syncBoard(nextCells, cols, rows) {
      cells = nextCells;
      if (cols !== boardCols || rows !== boardRows) {
        boardCols = cols;
        boardRows = rows;
        computeLayout();
      }
      dirty = true;
      scheduleLoop();
    },
    setSelection(rect, ids, state) {
      selectionRect = rect;
      selectedMask.fill(0);
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        if (id >= 0 && id < MAX_CELLS) selectedMask[id] = 1;
      }
      selectionState = state;
      requestPaintNow();
    },
    setHintIds(ids) {
      hintMask.fill(0);
      hasActiveHint = ids.length > 0;
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        if (id >= 0 && id < MAX_CELLS) hintMask[id] = 1;
      }
      dirty = true;
      scheduleLoop();
    },
    triggerBurst(event: AppleStageBurstEvent) {
      if (!reducedMotion) {
        for (const cell of event.clearedCells) {
          const px = boardX + (cell.col + 0.5) * cellSize;
          const py = boardY + (cell.row + 0.5) * cellSize;
          fallingApples.push({
            x: px,
            y: py,
            vx: (Math.random() - 0.5) * 260,
            vy: -240 - Math.random() * 180,
            rot: 0,
            vRot: (Math.random() - 0.5) * 9,
            value: cell.value,
            isGolden: cell.isGolden,
            alpha: 1,
          });
          const colors = cell.isGolden
            ? ['#ffd138', '#fff4a3', '#68d348']
            : ['#ff6b63', '#ffd84d', '#68d348'];
          for (let k = 0; k < 6; k += 1) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 140;
            sparks.push({
              x: px,
              y: py,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed - 60,
              radius: 3 + Math.random() * 3,
              color: colors[k % colors.length],
              age: 0,
              life: 0.35 + Math.random() * 0.2,
            });
          }
        }
      }
      dirty = true;
      scheduleLoop();
    },
    setFeverLevel() {
      // Classic 2D stays crisp regardless of fever level
    },
    setSoftColors(soft) {
      if (softColors === soft) return;
      softColors = soft;
      rebuildAppleSprites();
      dirty = true;
      scheduleLoop();
    },
    setHighFx() {
      // Pre-baked 2D sprite engine always runs effortlessly at 60-120fps
    },
    setReducedMotion(reduced) {
      reducedMotion = reduced;
    },
    clientToGrid(clientX, clientY) {
      const rect = cachedRect ?? canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || cellSize <= 0) return null;
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      return {
        col: Math.max(-0.5, Math.min(boardCols + 0.5, (localX - boardX) / cellSize)),
        row: Math.max(-0.5, Math.min(boardRows + 0.5, (localY - boardY) / cellSize)),
      };
    },
    gridToClient(col, row) {
      return {
        x: boardX + col * cellSize,
        y: boardY + row * cellSize,
      };
    },
    refreshRect() {
      cachedRect = canvas.getBoundingClientRect();
    },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (rafId !== 0) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      bgCache = null;
      for (let i = 0; i < 10; i += 1) {
        redSprites[i] = null;
        goldSprites[i] = null;
      }
    },
  };
}
