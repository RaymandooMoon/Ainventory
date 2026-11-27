import type { FruitBoxCell, GridSelectionRect } from '../fruitBoxEngine.ts';
import type {
  AppleStageBurstEvent,
  AppleStageController,
  SelectionVisualState,
} from './AppleArcadeStage.ts';

interface Particle2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  age: number;
  life: number;
}

interface Ring2D {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  age: number;
  life: number;
}

/**
 * Vibrant Neon Arcade Canvas 2D fallback renderer implementing the identical
 * `AppleStageController` contract so gameplay remains 100% playable if WebGL is unavailable.
 */
export function createAppleArcadeCanvas2D(options: {
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
  const MAX_CELLS = 170;
  const selectedMask = new Uint8Array(MAX_CELLS);
  const hintMask = new Uint8Array(MAX_CELLS);
  let selectionRect: GridSelectionRect | null = null;
  let selectionState: SelectionVisualState = 'idle';
  let softColors = Boolean(options.softColors);
  let feverLevel = 0;

  let viewportW = Math.max(2, canvas.clientWidth || 960);
  let viewportH = Math.max(2, canvas.clientHeight || 600);
  let cachedRect: DOMRect | null = null;
  let boardX = 0;
  let boardY = 0;
  let cellSize = 40;

  const particles: Particle2D[] = [];
  const rings: Ring2D[] = [];
  let disposed = false;
  let rafId = 0;
  let lastTime = performance.now();
  let elapsed = 0;

  const computeLayout = (): void => {
    const padX = Math.max(16, viewportW * 0.045);
    const padY = Math.max(16, viewportH * 0.045);
    const availW = Math.max(100, viewportW - padX * 2);
    const availH = Math.max(100, viewportH - padY * 2);
    cellSize = Math.min(availW / boardCols, availH / boardRows);
    const totalW = cellSize * boardCols;
    const totalH = cellSize * boardRows;
    boardX = (viewportW - totalW) * 0.5;
    boardY = (viewportH - totalH) * 0.5;
  };

  const resize = (width: number, height: number): void => {
    viewportW = Math.max(2, Math.floor(width));
    viewportH = Math.max(2, Math.floor(height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewportW * dpr);
    canvas.height = Math.floor(viewportH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cachedRect = canvas.getBoundingClientRect();
    computeLayout();
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

    // Deep neon arcade gradient background
    const bg = ctx.createLinearGradient(0, 0, viewportW, viewportH);
    bg.addColorStop(0, '#09061a');
    bg.addColorStop(0.5, feverLevel > 0.5 ? '#1e0b36' : '#110a2a');
    bg.addColorStop(1, '#060312');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewportW, viewportH);

    // Translucent neon tray behind apples
    const trayPad = Math.max(8, cellSize * 0.28);
    ctx.save();
    ctx.fillStyle = 'rgba(12, 9, 32, 0.72)';
    ctx.strokeStyle = feverLevel > 0.5 ? 'rgba(255, 42, 133, 0.55)' : 'rgba(0, 245, 255, 0.36)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(
      boardX - trayPad,
      boardY - trayPad,
      boardCols * cellSize + trayPad * 2,
      boardRows * cellSize + trayPad * 2,
      18
    );
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Draw apples
    const radius = cellSize * 0.41;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.max(12, Math.round(cellSize * 0.46))}px system-ui, -apple-system, sans-serif`;

    for (let i = 0; i < cells.length; i += 1) {
      const c = cells[i];
      if (c.cleared) continue;

      const cx = boardX + (c.col + 0.5) * cellSize;
      const cy = boardY + (c.row + 0.5) * cellSize;
      const isSelected = c.id >= 0 && c.id < MAX_CELLS && selectedMask[c.id] === 1;
      const isHint = c.id >= 0 && c.id < MAX_CELLS && hintMask[c.id] === 1;
      const r = isSelected ? radius * 1.12 : radius;

      const fill = isSelected
        ? selectionState === 'exact'
          ? '#2cff75'
          : selectionState === 'over'
            ? '#ff1476'
            : '#00d9ff'
        : c.isGolden
          ? '#ffc41c'
          : softColors
            ? '#d9848b'
            : '#ff244c';

      const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.32, r * 0.12, cx, cy, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.22, fill);
      grad.addColorStop(1, c.isGolden ? '#b86800' : softColors ? '#8d4753' : '#8b062a');

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      if (isHint) {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = `rgba(76, 248, 255, ${0.55 + 0.45 * Math.sin(elapsed * 10)})`;
        ctx.stroke();
      }

      // Leaf accent
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.24, cy - r * 0.88, r * 0.26, r * 0.13, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = c.isGolden ? '#fff199' : softColors ? '#74b58b' : '#19ff8c';
      ctx.fill();

      // Crisp digit
      ctx.lineWidth = Math.max(3, cellSize * 0.08);
      ctx.strokeStyle = 'rgba(12, 6, 26, 0.85)';
      ctx.strokeText(String(c.value), cx, cy + 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(c.value), cx, cy + 1);
    }

    // Selection rectangle
    if (selectionRect) {
      const minX = boardX + Math.min(selectionRect.x1, selectionRect.x2) * cellSize;
      const minY = boardY + Math.min(selectionRect.y1, selectionRect.y2) * cellSize;
      const w = Math.abs(selectionRect.x2 - selectionRect.x1) * cellSize;
      const h = Math.abs(selectionRect.y2 - selectionRect.y1) * cellSize;

      const strokeCol =
        selectionState === 'exact'
          ? '#39ff14'
          : selectionState === 'over'
            ? '#ff2a85'
            : '#00f5ff';
      const fillCol =
        selectionState === 'exact'
          ? 'rgba(57, 255, 20, 0.22)'
          : selectionState === 'over'
            ? 'rgba(255, 42, 133, 0.2)'
            : 'rgba(0, 245, 255, 0.18)';

      ctx.save();
      ctx.fillStyle = fillCol;
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(minX, minY, Math.max(4, w), Math.max(4, h), 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Shockwave rings
    for (let i = rings.length - 1; i >= 0; i -= 1) {
      const ring = rings[i];
      ring.age += dt;
      if (ring.age >= ring.life) {
        rings.splice(i, 1);
        continue;
      }
      const p = ring.age / ring.life;
      ring.radius = 12 + (1 - Math.pow(1 - p, 3)) * ring.maxRadius;
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.85;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 3 * (1 - p) + 1;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Splash particles
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const pt = particles[i];
      pt.age += dt;
      if (pt.age >= pt.life) {
        particles.splice(i, 1);
        continue;
      }
      pt.vy += 420 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      const alpha = 1 - pt.age / pt.life;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.radius * (0.4 + 0.6 * alpha), 0, Math.PI * 2);
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
      selectedMask.fill(0);
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        if (id >= 0 && id < MAX_CELLS) selectedMask[id] = 1;
      }
      selectionState = state;
    },
    setHintIds(ids) {
      hintMask.fill(0);
      for (let i = 0; i < ids.length; i += 1) {
        const id = ids[i];
        if (id >= 0 && id < MAX_CELLS) hintMask[id] = 1;
      }
    },
    triggerBurst(event: AppleStageBurstEvent) {
      const cx = boardX + event.centroidCol * cellSize;
      const cy = boardY + event.centroidRow * cellSize;
      const hasGolden = event.goldenCount > 0;
      rings.push({
        x: cx,
        y: cy,
        radius: 10,
        maxRadius: cellSize * (2.6 + event.clearedCells.length * 0.45),
        color: hasGolden ? '#ffd700' : '#39ff14',
        age: 0,
        life: 0.55,
      });
      const palette = hasGolden
        ? ['#ffd700', '#fff0a8', '#ff77cc']
        : ['#ff2e5f', '#00f5ff', '#39ff14', '#ffd700'];
      for (const cell of event.clearedCells) {
        const px = boardX + (cell.col + 0.5) * cellSize;
        const py = boardY + (cell.row + 0.5) * cellSize;
        for (let i = 0; i < 12; i += 1) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 80 + Math.random() * 210;
          particles.push({
            x: px,
            y: py,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 90,
            radius: 3 + Math.random() * 4.5,
            color: palette[i % palette.length],
            age: 0,
            life: 0.45 + Math.random() * 0.35,
          });
        }
      }
    },
    setFeverLevel(level) {
      feverLevel = Math.max(0, Math.min(1, level));
    },
    setSoftColors(soft) {
      softColors = soft;
    },
    setHighFx() {
      // No-op in 2D fallback
    },
    setReducedMotion() {
      // No-op in 2D fallback
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
      window.cancelAnimationFrame(rafId);
    },
  };
}
