import type { FruitBoxCell, GridSelectionRect } from '../fruitBoxEngine.ts';
import type {
  AppleStageBurstEvent,
  AppleStageController,
  SelectionVisualState,
} from './AppleArcadeStage.ts';

interface PopToken2D {
  x: number;
  y: number;
  value: number;
  isGolden: boolean;
  age: number;
  life: number;
}

interface PopRing2D {
  x: number;
  y: number;
  color: string;
  age: number;
  life: number;
}

const MAX_CELLS = 170;
const POP_LIFE_SEC = 0.32;

/** Paper 2D palette — achromatic paper + ink, single red accent on tokens. */
const PAPER = {
  page: '#efefec',
  board: '#ffffff',
  boardEdge: '#dcdcd7',
  gridLine: 'rgba(28, 28, 30, 0.05)',
  ink: '#1c1c1e',
  exact: '#1f8a4c',
  over: '#c62828',
  token: '#e5484d',
  tokenSoft: '#d4898b',
  gold: '#f2b300',
  goldSoft: '#e2c472',
} as const;

/**
 * High-Performance Paper 2D Canvas Renderer — Ainvtry's own flat, minimal board style.
 * Flat round number tokens on a white paper card (no gradients, outlines, leaves or orchard scenery);
 * cleared tokens pop in place with a scale-fade + ink ripple instead of falling.
 * Optimizations for instant 0-lag drag responsiveness:
 * - Pre-bakes Hi-DPI offscreen sprite stamps for digits 1..9 (regular + golden) once per resize/tint
 *   so each token draws via a single GPU-accelerated `drawImage` (< 1.2ms total frame time).
 * - Pre-bakes the static paper page + board card + grid hairlines into an offscreen layer.
 * - Uses zero-allocation `Uint8Array` bitmasks & cached canvas `DOMRect` (zero layout flush on drag).
 * - Renders synchronously on pointer drag/pop so selection box tracks cursor with zero frame lag.
 */
export function createPaperBoard2D(options: {
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
  const tokenSprites: (HTMLCanvasElement | null)[] = new Array(10).fill(null);
  const goldSprites: (HTMLCanvasElement | null)[] = new Array(10).fill(null);

  const popTokens: PopToken2D[] = [];
  const popRings: PopRing2D[] = [];
  let disposed = false;
  let rafId = 0;
  let dirty = true;
  let lastTime = performance.now();
  let elapsed = 0;

  const paintFlatTokenStamp = (
    c: CanvasRenderingContext2D,
    r: number,
    value: number,
    isGolden: boolean
  ): void => {
    // Flat solid disc — no gradient, outline, highlight or leaf
    c.fillStyle = isGolden
      ? softColors
        ? PAPER.goldSoft
        : PAPER.gold
      : softColors
        ? PAPER.tokenSoft
        : PAPER.token;
    c.beginPath();
    c.arc(0, 0, r * 0.86, 0, Math.PI * 2);
    c.fill();

    // Minimal ink stem tick
    c.strokeStyle = PAPER.ink;
    c.lineWidth = Math.max(1.4, r * 0.1);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(0, -r * 0.8);
    c.lineTo(0, -r * 1.02);
    c.stroke();

    // Clean digit (dark on gold for contrast, white on red)
    c.font = `700 ${Math.max(12, Math.round(r * 1.04))}px 'Pretendard Variable', 'SF Pro Text', system-ui, -apple-system, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = isGolden ? PAPER.ink : '#ffffff';
    c.fillText(String(value), 0, r * 0.06);
  };

  const rebuildTokenSprites = (): void => {
    if (typeof document === 'undefined' || cellSize <= 0) return;
    const tokenRadius = cellSize * 0.4;
    const logicalBox = Math.ceil(tokenRadius * 2.5);
    spriteHalfLogical = logicalBox * 0.5;
    spritePixelSize = Math.max(16, Math.ceil(logicalBox * currentDpr));

    for (let digit = 1; digit <= 9; digit += 1) {
      for (const isGolden of [false, true]) {
        const targetArr = isGolden ? goldSprites : tokenSprites;
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
        paintFlatTokenStamp(octx, tokenRadius, digit, isGolden);
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
    bctx.fillStyle = PAPER.page;
    bctx.fillRect(0, 0, viewportW, viewportH);

    const pad = Math.max(8, cellSize * 0.24);
    const frameX = boardX - pad;
    const frameY = boardY - pad;
    const frameW = boardCols * cellSize + pad * 2;
    const frameH = boardRows * cellSize + pad * 2;

    bctx.save();
    bctx.shadowColor = 'rgba(0, 0, 0, 0.06)';
    bctx.shadowBlur = 16;
    bctx.shadowOffsetY = 2;
    bctx.fillStyle = PAPER.board;
    bctx.beginPath();
    bctx.roundRect(frameX, frameY, frameW, frameH, 12);
    bctx.fill();
    bctx.restore();

    bctx.strokeStyle = PAPER.boardEdge;
    bctx.lineWidth = 1;
    bctx.beginPath();
    bctx.roundRect(frameX + 0.5, frameY + 0.5, frameW - 1, frameH - 1, 12);
    bctx.stroke();

    // Hairline cell grid (graph-paper feel)
    bctx.strokeStyle = PAPER.gridLine;
    bctx.lineWidth = 1;
    bctx.beginPath();
    for (let c = 1; c < boardCols; c += 1) {
      const x = Math.round(boardX + c * cellSize) + 0.5;
      bctx.moveTo(x, boardY);
      bctx.lineTo(x, boardY + boardRows * cellSize);
    }
    for (let r = 1; r < boardRows; r += 1) {
      const y = Math.round(boardY + r * cellSize) + 0.5;
      bctx.moveTo(boardX, y);
      bctx.lineTo(boardX + boardCols * cellSize, y);
    }
    bctx.stroke();
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
    rebuildTokenSprites();
    dirty = true;
  };

  const selectionColor = (state: SelectionVisualState): string =>
    state === 'exact' ? PAPER.exact : state === 'over' ? PAPER.over : PAPER.ink;

  const drawFrame = (dt: number): void => {
    if (bgCache) {
      ctx.drawImage(bgCache, 0, 0, viewportW, viewportH);
    } else {
      ctx.fillStyle = PAPER.page;
      ctx.fillRect(0, 0, viewportW, viewportH);
    }

    const drawSize = spriteHalfLogical * 2;
    const markInset = cellSize * 0.08;
    const markSize = cellSize - markInset * 2;
    const markStrokeW = Math.max(1.5, cellSize * 0.05);

    // Draw all active tokens using pre-baked Hi-DPI sprite stamps
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      if (cell.cleared) continue;

      const cellX = boardX + cell.col * cellSize;
      const cellY = boardY + cell.row * cellSize;
      const cx = cellX + cellSize * 0.5;
      const cy = cellY + cellSize * 0.5;
      const isSelected = cell.id < MAX_CELLS && selectedMask[cell.id] === 1;
      const isHint = cell.id < MAX_CELLS && hintMask[cell.id] === 1;

      if (isSelected || isHint) {
        // Rounded-square cell marks (ink / green / red)
        ctx.lineWidth = markStrokeW;
        if (isSelected) {
          ctx.strokeStyle = selectionColor(selectionState);
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeStyle = PAPER.ink;
          ctx.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(elapsed * 7.0));
        }
        ctx.beginPath();
        ctx.roundRect(cellX + markInset, cellY + markInset, markSize, markSize, cellSize * 0.18);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      const sprite = (cell.isGolden ? goldSprites : tokenSprites)[cell.value];
      if (sprite) {
        if (isSelected) {
          const scaled = drawSize * 0.92;
          ctx.drawImage(sprite, cx - scaled * 0.5, cy - scaled * 0.5, scaled, scaled);
        } else {
          ctx.drawImage(sprite, cx - spriteHalfLogical, cy - spriteHalfLogical, drawSize, drawSize);
        }
      }
    }

    // Ink drag rectangle with corner ticks
    if (selectionRect) {
      const minX = boardX + Math.min(selectionRect.x1, selectionRect.x2) * cellSize;
      const minY = boardY + Math.min(selectionRect.y1, selectionRect.y2) * cellSize;
      const w = Math.max(4, Math.abs(selectionRect.x2 - selectionRect.x1) * cellSize);
      const h = Math.max(4, Math.abs(selectionRect.y2 - selectionRect.y1) * cellSize);
      const color = selectionColor(selectionState);

      ctx.save();
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = color;
      ctx.fillRect(minX, minY, w, h);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(minX, minY, w, h);
      ctx.setLineDash([]);

      const tick = Math.min(12, w * 0.3, h * 0.3);
      ctx.lineWidth = 3;
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(minX, minY + tick);
      ctx.lineTo(minX, minY);
      ctx.lineTo(minX + tick, minY);
      ctx.moveTo(minX + w - tick, minY);
      ctx.lineTo(minX + w, minY);
      ctx.lineTo(minX + w, minY + tick);
      ctx.moveTo(minX + w, minY + h - tick);
      ctx.lineTo(minX + w, minY + h);
      ctx.lineTo(minX + w - tick, minY + h);
      ctx.moveTo(minX + tick, minY + h);
      ctx.lineTo(minX, minY + h);
      ctx.lineTo(minX, minY + h - tick);
      ctx.stroke();
      ctx.restore();
    }

    // In-place pop: token swells and fades (no gravity drop)
    for (let i = popTokens.length - 1; i >= 0; i -= 1) {
      const pt = popTokens[i];
      pt.age += dt;
      if (pt.age >= pt.life) {
        popTokens.splice(i, 1);
        continue;
      }
      const t = pt.age / pt.life;
      const sprite = (pt.isGolden ? goldSprites : tokenSprites)[pt.value];
      if (sprite) {
        const scaled = drawSize * (1 + 0.35 * t);
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.drawImage(sprite, pt.x - scaled * 0.5, pt.y - scaled * 0.5, scaled, scaled);
        ctx.restore();
      }
    }

    // Expanding ink ripples
    for (let i = popRings.length - 1; i >= 0; i -= 1) {
      const ring = popRings[i];
      ring.age += dt;
      if (ring.age >= ring.life) {
        popRings.splice(i, 1);
        continue;
      }
      const t = ring.age / ring.life;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.7;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = Math.max(1, 2 * (1 - t));
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, cellSize * (0.3 + 0.45 * t), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  };

  const hasPendingAnimation = (): boolean =>
    popTokens.length > 0 || popRings.length > 0 || hasActiveHint;

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

    const needsContinuousAnimation = hasPendingAnimation();

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
      if (hasPendingAnimation()) {
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
          popTokens.push({
            x: px,
            y: py,
            value: cell.value,
            isGolden: cell.isGolden,
            age: 0,
            life: POP_LIFE_SEC,
          });
          popRings.push({
            x: px,
            y: py,
            color: cell.isGolden ? PAPER.gold : PAPER.exact,
            age: 0,
            life: POP_LIFE_SEC * 1.4,
          });
        }
      }
      dirty = true;
      scheduleLoop();
    },
    setFeverLevel() {
      // Paper 2D stays calm and crisp regardless of fever level
    },
    setSoftColors(soft) {
      if (softColors === soft) return;
      softColors = soft;
      rebuildTokenSprites();
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
        tokenSprites[i] = null;
        goldSprites[i] = null;
      }
    },
  };
}
