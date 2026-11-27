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

/**
 * Authentic 2D Original Fruit Box (원조 후르츠박스 / フルーツボックス) Canvas Renderer.
 * Re-creates the beloved 2007 bright orchard green-and-cream aesthetic:
 * - Twin-lobe illustrated 2D cartoon apples with leaf, brown stem, and crisp specular crescent
 * - Authentic `연한 색` (薄い色) pastel apple tone for comfortable marathon play
 * - Classic gravity-drop falling apple animation when a sum-10 box pops
 * - Crisp translucent selection rectangle turning fresh mint-green on exact sum 10
 */
export function createOriginalFruitBox2D(options: {
  readonly canvas: HTMLCanvasElement;
  readonly cols: number;
  readonly rows: number;
  readonly softColors?: boolean;
}): AppleStageController | null {
  const { canvas } = options;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let boardCols = options.cols;
  let boardRows = options.rows;
  let cells: readonly FruitBoxCell[] = [];
  let selectedSet = new Set<number>();
  let hintSet = new Set<number>();
  let selectionRect: GridSelectionRect | null = null;
  let selectionState: SelectionVisualState = 'idle';
  let softColors = Boolean(options.softColors);
  let reducedMotion = false;

  let viewportW = Math.max(2, canvas.clientWidth || 960);
  let viewportH = Math.max(2, canvas.clientHeight || 600);
  let boardX = 0;
  let boardY = 0;
  let cellSize = 40;

  const fallingApples: FallingApple2D[] = [];
  const sparks: PopSpark2D[] = [];
  let disposed = false;
  let rafId = 0;
  let lastTime = performance.now();
  let elapsed = 0;

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
  };

  const resize = (width: number, height: number): void => {
    if (disposed) return;
    viewportW = Math.max(2, Math.floor(width));
    viewportH = Math.max(2, Math.floor(height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewportW * dpr);
    canvas.height = Math.floor(viewportH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    computeLayout();
  };

  /**
   * Draws a classic illustrated twin-lobe 2D Fruit Box apple centered at (0, 0).
   */
  const drawCartoonApple = (
    c: CanvasRenderingContext2D,
    r: number,
    value: number,
    opts: {
      readonly isGolden: boolean;
      readonly isSelected: boolean;
      readonly isHint: boolean;
      readonly selState: SelectionVisualState;
    }
  ): void => {
    // Soft ground shadow
    c.fillStyle = 'rgba(42, 82, 22, 0.14)';
    c.beginPath();
    c.ellipse(0, r * 0.94, r * 0.72, r * 0.22, 0, 0, Math.PI * 2);
    c.fill();

    // Selection / hint outer ring
    if (opts.isSelected || opts.isHint) {
      c.save();
      c.lineWidth = Math.max(2.5, r * 0.15);
      if (opts.isSelected && opts.selState === 'exact') {
        c.strokeStyle = '#24b445';
        c.fillStyle = 'rgba(130, 245, 118, 0.42)';
      } else if (opts.isSelected && opts.selState === 'over') {
        c.strokeStyle = '#d9384a';
        c.fillStyle = 'rgba(255, 120, 138, 0.28)';
      } else if (opts.isSelected) {
        c.strokeStyle = '#f2ae00';
        c.fillStyle = 'rgba(255, 232, 110, 0.44)';
      } else {
        const pulse = 0.45 + 0.45 * Math.sin(elapsed * 9.0);
        c.strokeStyle = `rgba(34, 184, 72, ${pulse.toFixed(2)})`;
        c.fillStyle = `rgba(148, 245, 134, ${(pulse * 0.35).toFixed(2)})`;
      }
      c.beginPath();
      c.arc(0, 0, r * 1.12, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.restore();
    }

    // Twin-lobe classic apple body path
    const bodyGrad = c.createRadialGradient(-r * 0.28, -r * 0.34, r * 0.12, 0, r * 0.06, r * 1.08);
    if (opts.isGolden) {
      bodyGrad.addColorStop(0, '#fff5a8');
      bodyGrad.addColorStop(0.28, '#ffd138');
      bodyGrad.addColorStop(1, '#d48206');
    } else if (softColors) {
      // Iconic original Fruit Box `薄い色` (soft eye-comfort tint)
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
    c.strokeStyle = opts.isGolden
      ? '#9e5d00'
      : softColors
        ? '#ad5050'
        : '#8c0e0e';
    c.stroke();

    // Cute cartoon glossy specular dot on top-left cheek
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
    c.fillStyle = opts.isGolden ? '#b6e64c' : softColors ? '#8cc87c' : '#58c93a';
    c.strokeStyle = softColors ? '#5b924e' : '#2e881a';
    c.lineWidth = Math.max(1, r * 0.06);
    c.beginPath();
    c.moveTo(r * 0.05, -r * 0.8);
    c.quadraticCurveTo(r * 0.42, -r * 1.16, r * 0.62, -r * 0.84);
    c.quadraticCurveTo(r * 0.32, -r * 0.64, r * 0.05, -r * 0.8);
    c.closePath();
    c.fill();
    c.stroke();

    // Razor-sharp bold white digit centered on apple belly
    c.font = `800 ${Math.max(12, Math.round(r * 1.18))}px 'Pretendard Variable', 'SF Pro Rounded', system-ui, -apple-system, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = Math.max(2.6, r * 0.19);
    c.strokeStyle = opts.isGolden
      ? 'rgba(116, 62, 0, 0.82)'
      : 'rgba(98, 12, 12, 0.78)';
    c.strokeText(String(value), 0, r * 0.09);
    c.fillStyle = '#ffffff';
    c.fillText(String(value), 0, r * 0.09);
  };

  const loop = (now: number): void => {
    if (disposed) return;
    rafId = window.requestAnimationFrame(loop);
    if (document.hidden) {
      lastTime = now;
      return;
    }

    const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) * 0.001));
    lastTime = now;
    elapsed += dt;

    // 1) Classic fresh orchard lime-green outer backdrop
    const bgGrad = ctx.createLinearGradient(0, 0, 0, viewportH);
    bgGrad.addColorStop(0, '#b9e686');
    bgGrad.addColorStop(1, '#8ecc5a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, viewportW, viewportH);

    // 2) Inner cream-mint board frame (iconic Fruit Box look!)
    const pad = Math.max(10, cellSize * 0.32);
    const frameX = boardX - pad;
    const frameY = boardY - pad;
    const frameW = boardCols * cellSize + pad * 2;
    const frameH = boardRows * cellSize + pad * 2;

    ctx.save();
    ctx.shadowColor = 'rgba(42, 92, 18, 0.22)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = '#f3fce9';
    ctx.strokeStyle = '#6db63e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(frameX, frameY, frameW, frameH, 18);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Subtle soft grid dots inside the classic board
    ctx.fillStyle = 'rgba(110, 176, 66, 0.14)';
    for (let r = 0; r < boardRows; r += 1) {
      for (let c = 0; c < boardCols; c += 1) {
        const cx = boardX + (c + 0.5) * cellSize;
        const cy = boardY + (r + 0.5) * cellSize;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(1.5, cellSize * 0.045), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 3) Draw all active 2D apples
    const appleRadius = cellSize * 0.4;
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      if (cell.cleared) continue;

      const cx = boardX + (cell.col + 0.5) * cellSize;
      const cy = boardY + (cell.row + 0.5) * cellSize;
      const isSelected = selectedSet.has(cell.id);
      const isHint = hintSet.has(cell.id);
      const scale = isSelected ? 1.08 : 1.0;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      drawCartoonApple(ctx, appleRadius, cell.value, {
        isGolden: cell.isGolden,
        isSelected,
        isHint,
        selState: selectionState,
      });
      ctx.restore();
    }

    // 4) Authentic classic drag rectangle
    if (selectionRect) {
      const minX = boardX + Math.min(selectionRect.x1, selectionRect.x2) * cellSize;
      const minY = boardY + Math.min(selectionRect.y1, selectionRect.y2) * cellSize;
      const w = Math.abs(selectionRect.x2 - selectionRect.x1) * cellSize;
      const h = Math.abs(selectionRect.y2 - selectionRect.y1) * cellSize;

      const strokeCol =
        selectionState === 'exact'
          ? '#22b144'
          : selectionState === 'over'
            ? '#d9384a'
            : '#e6a500';
      const fillCol =
        selectionState === 'exact'
          ? 'rgba(84, 224, 96, 0.28)'
          : selectionState === 'over'
            ? 'rgba(236, 72, 92, 0.18)'
            : 'rgba(255, 226, 94, 0.28)';

      ctx.save();
      ctx.fillStyle = fillCol;
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(minX, minY, Math.max(4, w), Math.max(4, h), 6);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 5) Classic gravity-drop falling apples on pop (signature Fruit Box animation!)
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

      ctx.save();
      ctx.globalAlpha = fa.alpha;
      ctx.translate(fa.x, fa.y);
      ctx.rotate(fa.rot);
      drawCartoonApple(ctx, appleRadius * 1.04, fa.value, {
        isGolden: fa.isGolden,
        isSelected: false,
        isHint: false,
        selState: 'idle',
      });
      ctx.restore();
    }

    // 6) Crisp subtle pop sparkles
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

  resize(viewportW, viewportH);
  rafId = window.requestAnimationFrame(loop);

  return {
    syncBoard(nextCells, cols, rows) {
      cells = nextCells;
      if (cols !== boardCols || rows !== boardRows) {
        boardCols = cols;
        boardRows = rows;
        computeLayout();
      }
    },
    setSelection(rect, ids, state) {
      selectionRect = rect;
      selectedSet = new Set(ids);
      selectionState = state;
    },
    setHintIds(ids) {
      hintSet = new Set(ids);
    },
    triggerBurst(event: AppleStageBurstEvent) {
      if (reducedMotion) return;
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
    },
    setFeverLevel() {
      // Classic 2D stays crisp and readable regardless of fever level
    },
    setSoftColors(soft) {
      softColors = soft;
    },
    setHighFx() {
      // Lightweight 2D canvas always runs at 60fps
    },
    setReducedMotion(reduced) {
      reducedMotion = reduced;
    },
    clientToGrid(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
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
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      window.cancelAnimationFrame(rafId);
    },
  };
}
