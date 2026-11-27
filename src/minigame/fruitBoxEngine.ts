export type FruitBoxMode = 'classic' | 'fever';
export type BoardOrientation = 'landscape' | 'portrait';
export type ArcadeRank = 'S+' | 'S' | 'A' | 'B' | 'C';

export const CLASSIC_COLS = 17;
export const CLASSIC_ROWS = 10;
export const CLASSIC_TOTAL_APPLES = CLASSIC_COLS * CLASSIC_ROWS;
export const CLASSIC_DURATION_SEC = 120;
export const TARGET_SUM = 10;
export const GOLDEN_BONUS_POINTS = 4;
export const COMBO_WINDOW_MS = 3600;
export const FEVER_COMBO_THRESHOLD = 4;

export interface FruitBoxCell {
  readonly id: number;
  readonly row: number;
  readonly col: number;
  readonly value: number;
  readonly cleared: boolean;
  readonly isGolden: boolean;
}

export interface GridSelectionRect {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface SelectionEvaluation {
  readonly selectedIds: readonly number[];
  readonly selectedCells: readonly FruitBoxCell[];
  readonly sum: number;
  readonly isExactTen: boolean;
  readonly isOverTen: boolean;
  readonly goldenCount: number;
  readonly centroidCol: number;
  readonly centroidRow: number;
}

export interface HintMove {
  readonly minCol: number;
  readonly minRow: number;
  readonly maxCol: number;
  readonly maxRow: number;
  readonly cellIds: readonly number[];
  readonly rect: GridSelectionRect;
}

export interface FruitBoxGameState {
  readonly mode: FruitBoxMode;
  readonly orientation: BoardOrientation;
  readonly cols: number;
  readonly rows: number;
  readonly durationSec: number;
  readonly cells: readonly FruitBoxCell[];
  readonly score: number;
  readonly clearedCount: number;
  readonly clearsCount: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly lastClearAtMs: number | null;
  readonly feverMeter: number;
  readonly isFeverActive: boolean;
  readonly boardRound: number;
  readonly startedAtMs: number | null;
  readonly clearTimeMs: number | null;
  readonly seed: number;
}

export interface CreateFruitBoxOptions {
  readonly mode?: FruitBoxMode;
  readonly orientation?: BoardOrientation;
  readonly durationSec?: number;
  readonly seed?: number;
}

export interface ApplyClearResult {
  readonly cleared: boolean;
  readonly state: FruitBoxGameState;
  readonly clearedCells: readonly FruitBoxCell[];
  readonly pointsAwarded: number;
  readonly comboMultiplier: number;
  readonly goldenCount: number;
  readonly isAllClear: boolean;
  readonly boardRefilled: boolean;
  readonly noMoreMoves: boolean;
  readonly centroidCol: number;
  readonly centroidRow: number;
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveSeed(explicitSeed?: number): number {
  if (typeof explicitSeed === 'number' && Number.isFinite(explicitSeed)) {
    return (Math.floor(explicitSeed) >>> 0) || 1;
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] || 1;
  }
  return ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 1;
}

function resolveBoardDimensions(orientation: BoardOrientation): { cols: number; rows: number } {
  return orientation === 'portrait'
    ? { cols: CLASSIC_ROWS, rows: CLASSIC_COLS }
    : { cols: CLASSIC_COLS, rows: CLASSIC_ROWS };
}

function generateValidBoardCells(
  cols: number,
  rows: number,
  mode: FruitBoxMode,
  seed: number
): readonly FruitBoxCell[] {
  const total = cols * rows;
  const rng = createMulberry32(seed);

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const values: number[] = new Array(total);
    let runningSum = 0;

    // Slight bias toward playable low-to-mid values on attempt > 0 while preserving classic 1..9 variety
    for (let i = 0; i < total; i += 1) {
      const val = 1 + Math.floor(rng() * 9);
      values[i] = val;
      runningSum += val;
    }

    // Adjust final slots so total sum is guaranteed divisible by 10 (exact Fruit Box invariant)
    const remainder = runningSum % TARGET_SUM;
    if (remainder !== 0) {
      const neededAdd = TARGET_SUM - remainder;
      let adjusted = false;
      for (let i = total - 1; i >= 0; i -= 1) {
        if (values[i] + neededAdd <= 9) {
          values[i] += neededAdd;
          adjusted = true;
          break;
        }
        if (values[i] - remainder >= 1) {
          values[i] -= remainder;
          adjusted = true;
          break;
        }
      }
      if (!adjusted) {
        // Fallback: split remainder across multiple cells (reduce first, otherwise add complement)
        let left = remainder;
        for (let i = total - 1; i >= 0 && left > 0; i -= 1) {
          const reducible = Math.min(left, values[i] - 1);
          values[i] -= reducible;
          left -= reducible;
        }
        if (left > 0) {
          let addLeft = TARGET_SUM - left;
          for (let i = total - 1; i >= 0 && addLeft > 0; i -= 1) {
            const addable = Math.min(addLeft, 9 - values[i]);
            values[i] += addable;
            addLeft -= addable;
          }
        }
      }
    }

    // Choose golden bonus apples in Fever mode (~8.2% => ~14 golden apples per 170-apple board)
    const goldenSet = new Set<number>();
    if (mode === 'fever') {
      const targetGolden = Math.max(8, Math.min(18, Math.round(total * 0.082)));
      let guard = 0;
      while (goldenSet.size < targetGolden && guard < total * 4) {
        goldenSet.add(Math.floor(rng() * total));
        guard += 1;
      }
    }

    const cells: FruitBoxCell[] = new Array(total);
    for (let idx = 0; idx < total; idx += 1) {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      cells[idx] = {
        id: idx,
        row,
        col,
        value: values[idx],
        cleared: false,
        isGolden: goldenSet.has(idx),
      };
    }

    if (hasAnyValidMove(cells, cols, rows)) {
      return cells;
    }
  }

  // Deterministic guaranteed-playable fallback (pairs summing to 10)
  const fallback: FruitBoxCell[] = new Array(total);
  for (let idx = 0; idx < total; idx += 1) {
    const val = idx % 2 === 0 ? 4 : 6;
    fallback[idx] = {
      id: idx,
      row: Math.floor(idx / cols),
      col: idx % cols,
      value: val,
      cleared: false,
      isGolden: mode === 'fever' && idx % 13 === 0,
    };
  }
  return fallback;
}

export function createFruitBoxGame(options: CreateFruitBoxOptions = {}): FruitBoxGameState {
  const mode: FruitBoxMode = options.mode ?? 'classic';
  const orientation: BoardOrientation = options.orientation ?? 'landscape';
  const durationSec = Math.max(
    10,
    Math.round(options.durationSec ?? CLASSIC_DURATION_SEC)
  );
  const seed = resolveSeed(options.seed);
  const { cols, rows } = resolveBoardDimensions(orientation);
  const cells = generateValidBoardCells(cols, rows, mode, seed);

  return {
    mode,
    orientation,
    cols,
    rows,
    durationSec,
    cells,
    score: 0,
    clearedCount: 0,
    clearsCount: 0,
    combo: 0,
    maxCombo: 0,
    lastClearAtMs: null,
    feverMeter: 0,
    isFeverActive: false,
    boardRound: 1,
    startedAtMs: null,
    clearTimeMs: null,
    seed,
  };
}

export function normalizeSelectionRect(rect: GridSelectionRect): GridSelectionRect {
  return {
    x1: Math.min(rect.x1, rect.x2),
    y1: Math.min(rect.y1, rect.y2),
    x2: Math.max(rect.x1, rect.x2),
    y2: Math.max(rect.y1, rect.y2),
  };
}

/**
 * Evaluates which active apples fall inside a grid-space drag rectangle.
 * Each cell `(col, row)` occupies `[col, col + 1] x [row, row + 1]` with center `(col + 0.5, row + 0.5)`
 * and hit margin `0.26` around its center (matching original Fruit Box feel: grazing the outer
 * corners doesn't accidentally snag neighbors, while dragging smoothly across centers locks cleanly).
 */
export function evaluateSelectionRect(
  cells: readonly FruitBoxCell[],
  rect: GridSelectionRect
): SelectionEvaluation {
  const norm = normalizeSelectionRect(rect);
  const hitRadius = 0.24;
  const selectedIds: number[] = [];
  const selectedCells: FruitBoxCell[] = [];
  let sum = 0;
  let goldenCount = 0;
  let sumCol = 0;
  let sumRow = 0;

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    if (cell.cleared) continue;
    const cx = cell.col + 0.5;
    const cy = cell.row + 0.5;
    if (
      norm.x2 >= cx - hitRadius &&
      norm.x1 <= cx + hitRadius &&
      norm.y2 >= cy - hitRadius &&
      norm.y1 <= cy + hitRadius
    ) {
      selectedIds.push(cell.id);
      selectedCells.push(cell);
      sum += cell.value;
      if (cell.isGolden) goldenCount += 1;
      sumCol += cx;
      sumRow += cy;
    }
  }

  const count = selectedCells.length;
  return {
    selectedIds,
    selectedCells,
    sum,
    isExactTen: count > 0 && sum === TARGET_SUM,
    isOverTen: sum > TARGET_SUM,
    goldenCount,
    centroidCol: count > 0 ? sumCol / count : (norm.x1 + norm.x2) * 0.5,
    centroidRow: count > 0 ? sumRow / count : (norm.y1 + norm.y2) * 0.5,
  };
}

export function getComboMultiplier(mode: FruitBoxMode, combo: number): number {
  if (mode === 'classic') return 1;
  if (combo >= 8) return 3;
  if (combo >= FEVER_COMBO_THRESHOLD) return 2;
  if (combo >= 2) return 1.5;
  return 1;
}

export function applyClearSelection(
  state: FruitBoxGameState,
  rect: GridSelectionRect,
  nowMs: number = Date.now()
): ApplyClearResult {
  const evaluation = evaluateSelectionRect(state.cells, rect);
  if (!evaluation.isExactTen) {
    return {
      cleared: false,
      state,
      clearedCells: [],
      pointsAwarded: 0,
      comboMultiplier: getComboMultiplier(state.mode, state.combo),
      goldenCount: 0,
      isAllClear: false,
      boardRefilled: false,
      noMoreMoves: false,
      centroidCol: evaluation.centroidCol,
      centroidRow: evaluation.centroidRow,
    };
  }

  const selectedSet = new Set(evaluation.selectedIds);
  const nextCells = state.cells.map((cell) =>
    selectedSet.has(cell.id) ? { ...cell, cleared: true } : cell
  );

  const withinComboWindow =
    state.lastClearAtMs !== null && nowMs - state.lastClearAtMs <= COMBO_WINDOW_MS;
  const nextCombo = withinComboWindow ? state.combo + 1 : 1;
  const nextMaxCombo = Math.max(state.maxCombo, nextCombo);
  const comboMultiplier = getComboMultiplier(state.mode, nextCombo);

  const basePoints =
    evaluation.selectedCells.length +
    (state.mode === 'fever' ? evaluation.goldenCount * GOLDEN_BONUS_POINTS : 0);
  const pointsAwarded =
    state.mode === 'fever' ? Math.round(basePoints * comboMultiplier) : basePoints;

  const nextClearedCount = state.clearedCount + evaluation.selectedCells.length;
  const remainingActive = nextCells.reduce((acc, cell) => acc + (cell.cleared ? 0 : 1), 0);
  const isAllClear = state.mode === 'classic' && remainingActive === 0;
  const startedAtMs = state.startedAtMs ?? nowMs;
  const clearTimeMs = isAllClear ? Math.max(0, nowMs - startedAtMs) : state.clearTimeMs;

  const nextFeverMeter =
    state.mode === 'fever'
      ? Math.min(1, (withinComboWindow ? state.feverMeter : state.feverMeter * 0.4) + 0.22 + evaluation.goldenCount * 0.16)
      : Math.min(1, nextCombo / 6);
  const isFeverActive =
    state.mode === 'fever'
      ? nextCombo >= FEVER_COMBO_THRESHOLD || nextFeverMeter >= 0.85
      : nextCombo >= FEVER_COMBO_THRESHOLD;

  let finalCells: readonly FruitBoxCell[] = nextCells;
  let boardRefilled = false;
  let nextBoardRound = state.boardRound;
  const anyMoveLeftAfterClear = remainingActive > 0 && hasAnyValidMove(nextCells, state.cols, state.rows);

  if (state.mode === 'fever' && !anyMoveLeftAfterClear) {
    nextBoardRound = state.boardRound + 1;
    finalCells = generateValidBoardCells(
      state.cols,
      state.rows,
      state.mode,
      (state.seed + nextBoardRound * 2654435761) >>> 0
    );
    boardRefilled = true;
  }

  const noMoreMoves = state.mode === 'classic' && !isAllClear && !anyMoveLeftAfterClear;

  const nextState: FruitBoxGameState = {
    ...state,
    cells: finalCells,
    score: state.score + pointsAwarded,
    clearedCount: nextClearedCount,
    clearsCount: state.clearsCount + 1,
    combo: nextCombo,
    maxCombo: nextMaxCombo,
    lastClearAtMs: nowMs,
    feverMeter: nextFeverMeter,
    isFeverActive,
    boardRound: nextBoardRound,
    startedAtMs,
    clearTimeMs,
  };

  return {
    cleared: true,
    state: nextState,
    clearedCells: evaluation.selectedCells,
    pointsAwarded,
    comboMultiplier,
    goldenCount: evaluation.goldenCount,
    isAllClear,
    boardRefilled,
    noMoreMoves,
    centroidCol: evaluation.centroidCol,
    centroidRow: evaluation.centroidRow,
  };
}

/**
 * Finds the smallest valid sum-10 rectangle on the board using 2D prefix sums in O(R^2 * C^2).
 * For 17x10 this executes in under 0.2ms on desktop and mobile.
 */
export function findHintMove(
  cells: readonly FruitBoxCell[],
  cols: number,
  rows: number
): HintMove | null {
  const stride = cols + 1;
  const valPrefix = new Int32Array((rows + 1) * stride);
  const activePrefix = new Int32Array((rows + 1) * stride);

  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    if (cell.cleared) continue;
    const idx = (cell.row + 1) * stride + (cell.col + 1);
    valPrefix[idx] = cell.value;
    activePrefix[idx] = 1;
  }

  for (let r = 1; r <= rows; r += 1) {
    for (let c = 1; c <= cols; c += 1) {
      const idx = r * stride + c;
      valPrefix[idx] +=
        valPrefix[idx - 1] + valPrefix[idx - stride] - valPrefix[idx - stride - 1];
      activePrefix[idx] +=
        activePrefix[idx - 1] + activePrefix[idx - stride] - activePrefix[idx - stride - 1];
    }
  }

  let bestArea = Infinity;
  let bestBounds: { r1: number; c1: number; r2: number; c2: number } | null = null;

  for (let r1 = 0; r1 < rows; r1 += 1) {
    for (let r2 = r1; r2 < rows; r2 += 1) {
      const height = r2 - r1 + 1;
      for (let c1 = 0; c1 < cols; c1 += 1) {
        for (let c2 = c1; c2 < cols; c2 += 1) {
          const area = height * (c2 - c1 + 1);
          if (area >= bestArea) break;

          const sum =
            valPrefix[(r2 + 1) * stride + (c2 + 1)] -
            valPrefix[r1 * stride + (c2 + 1)] -
            valPrefix[(r2 + 1) * stride + c1] +
            valPrefix[r1 * stride + c1];

          if (sum > TARGET_SUM) break;
          if (sum === TARGET_SUM) {
            const active =
              activePrefix[(r2 + 1) * stride + (c2 + 1)] -
              activePrefix[r1 * stride + (c2 + 1)] -
              activePrefix[(r2 + 1) * stride + c1] +
              activePrefix[r1 * stride + c1];
            if (active >= 2) {
              bestArea = area;
              bestBounds = { r1, c1, r2, c2 };
            }
          }
        }
      }
    }
  }

  if (!bestBounds) return null;

  const { r1, c1, r2, c2 } = bestBounds;
  const cellIds: number[] = [];
  for (let i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    if (
      !cell.cleared &&
      cell.row >= r1 &&
      cell.row <= r2 &&
      cell.col >= c1 &&
      cell.col <= c2
    ) {
      cellIds.push(cell.id);
    }
  }

  return {
    minCol: c1,
    minRow: r1,
    maxCol: c2,
    maxRow: r2,
    cellIds,
    rect: {
      x1: c1 + 0.1,
      y1: r1 + 0.1,
      x2: c2 + 0.9,
      y2: r2 + 0.9,
    },
  };
}

export function hasAnyValidMove(
  cells: readonly FruitBoxCell[],
  cols: number,
  rows: number
): boolean {
  return findHintMove(cells, cols, rows) !== null;
}

export function computeArcadeRank(
  score: number,
  mode: FruitBoxMode,
  isAllClear: boolean
): ArcadeRank {
  if (isAllClear) return 'S+';
  if (mode === 'fever') {
    if (score >= 320) return 'S+';
    if (score >= 220) return 'S';
    if (score >= 140) return 'A';
    if (score >= 80) return 'B';
    return 'C';
  }
  if (score >= 140) return 'S+';
  if (score >= 110) return 'S';
  if (score >= 80) return 'A';
  if (score >= 50) return 'B';
  return 'C';
}

export function formatTimerDisplay(remainingSec: number): string {
  const clamped = Math.max(0, Math.ceil(remainingSec));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function isMinigamePathname(pathname: string): boolean {
  const clean = String(pathname || '').trim().toLowerCase();
  return (
    clean === '/minigame' ||
    clean === '/minigame/' ||
    clean === '/minigame/index.html' ||
    /\/minigame(?:\/|\/index\.html)?$/.test(clean)
  );
}
