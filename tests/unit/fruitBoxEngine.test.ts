import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLASSIC_COLS,
  CLASSIC_DURATION_SEC,
  CLASSIC_ROWS,
  COMBO_WINDOW_MS,
  GOLDEN_BONUS_POINTS,
  TARGET_SUM,
  applyClearSelection,
  computeArcadeRank,
  createFruitBoxGame,
  evaluateSelectionRect,
  findHintMove,
  hasAnyValidMove,
  isMinigamePathname,
  type FruitBoxCell,
} from '../../src/minigame/fruitBoxEngine.ts';

describe('Fruit Box (사과게임) Core Engine', () => {
  it('generates a classic 17x10 board of 170 apples with values 1..9 and total sum divisible by 10', () => {
    const game = createFruitBoxGame({ mode: 'classic', seed: 42 });
    assert.equal(game.cols, CLASSIC_COLS);
    assert.equal(game.rows, CLASSIC_ROWS);
    assert.equal(game.cells.length, 170);
    assert.equal(game.durationSec, CLASSIC_DURATION_SEC);
    assert.equal(game.score, 0);
    assert.equal(game.clearedCount, 0);

    let sum = 0;
    for (const cell of game.cells) {
      assert.ok(cell.value >= 1 && cell.value <= 9, `value out of range: ${cell.value}`);
      assert.equal(cell.cleared, false);
      assert.equal(cell.isGolden, false);
      sum += cell.value;
    }
    assert.equal(sum % TARGET_SUM, 0, `total sum ${sum} must be divisible by 10`);
    assert.equal(hasAnyValidMove(game.cells, game.cols, game.rows), true);
  });

  it('produces deterministic boards for the same seed and supports portrait 10x17 orientation', () => {
    const a = createFruitBoxGame({ mode: 'classic', seed: 1337, orientation: 'portrait' });
    const b = createFruitBoxGame({ mode: 'classic', seed: 1337, orientation: 'portrait' });
    assert.equal(a.cols, 10);
    assert.equal(a.rows, 17);
    assert.deepEqual(
      a.cells.map((c) => c.value),
      b.cells.map((c) => c.value)
    );
  });

  it('spawns golden bonus apples in fever mode while keeping sum divisible by 10', () => {
    const game = createFruitBoxGame({ mode: 'fever', seed: 99 });
    const goldenCells = game.cells.filter((c) => c.isGolden);
    const totalSum = game.cells.reduce((acc, c) => acc + c.value, 0);
    assert.ok(goldenCells.length >= 6 && goldenCells.length <= 24, `golden count: ${goldenCells.length}`);
    assert.equal(totalSum % 10, 0);
  });

  it('evaluates drag rectangles regardless of drag direction and ignores cleared cells', () => {
    const cells: FruitBoxCell[] = [
      { id: 0, row: 0, col: 0, value: 3, cleared: false, isGolden: false },
      { id: 1, row: 0, col: 1, value: 7, cleared: false, isGolden: true },
      { id: 2, row: 1, col: 0, value: 5, cleared: true, isGolden: false },
      { id: 3, row: 1, col: 1, value: 4, cleared: false, isGolden: false },
    ];

    // Dragged backwards from (1.9, 0.9) to (0.1, 0.1) — covers (0,0) and (0,1)
    const eval1 = evaluateSelectionRect(cells, {
      x1: 1.9,
      y1: 0.9,
      x2: 0.1,
      y2: 0.1,
    });
    assert.deepEqual(eval1.selectedIds, [0, 1]);
    assert.equal(eval1.sum, 10);
    assert.equal(eval1.isExactTen, true);
    assert.equal(eval1.isOverTen, false);
    assert.equal(eval1.goldenCount, 1);

    // Covers (0,0), (0,1), (1,0 cleared), (1,1) => 3 + 7 + 4 = 14
    const eval2 = evaluateSelectionRect(cells, {
      x1: 0.1,
      y1: 0.1,
      x2: 1.9,
      y2: 1.9,
    });
    assert.deepEqual(eval2.selectedIds, [0, 1, 3]);
    assert.equal(eval2.sum, 14);
    assert.equal(eval2.isExactTen, false);
    assert.equal(eval2.isOverTen, true);
  });

  it('immutably clears apples summing to 10 in classic mode and rejects non-10 selections', () => {
    const base = createFruitBoxGame({ mode: 'classic', seed: 7 });
    const hint = findHintMove(base.cells, base.cols, base.rows);
    assert.ok(hint, 'Generated board must have at least one valid move');

    // Verify hint sums to 10
    const hintEval = evaluateSelectionRect(base.cells, hint.rect);
    assert.equal(hintEval.sum, 10);
    assert.equal(hintEval.isExactTen, true);

    const beforeSnapshot = base.cells.map((c) => c.cleared);
    const result = applyClearSelection(base, hint.rect, 10_000);
    assert.equal(result.cleared, true);
    assert.equal(result.pointsAwarded, hintEval.selectedIds.length);
    assert.equal(result.state.score, hintEval.selectedIds.length);
    assert.equal(result.state.clearedCount, hintEval.selectedIds.length);

    // Original state must not be mutated
    assert.deepEqual(
      base.cells.map((c) => c.cleared),
      beforeSnapshot
    );
    assert.equal(base.score, 0);

    // Repeating same rectangle should now be empty / rejected
    const repeat = applyClearSelection(result.state, hint.rect, 11_000);
    assert.equal(repeat.cleared, false);
    assert.equal(repeat.pointsAwarded, 0);
  });

  it('awards golden bonuses, escalates combos within window, and resets combo after timeout in fever mode', () => {
    const cells: FruitBoxCell[] = [
      { id: 0, row: 0, col: 0, value: 4, cleared: false, isGolden: false },
      { id: 1, row: 0, col: 1, value: 6, cleared: false, isGolden: true },
      { id: 2, row: 0, col: 2, value: 5, cleared: false, isGolden: false },
      { id: 3, row: 0, col: 3, value: 5, cleared: false, isGolden: false },
      { id: 4, row: 1, col: 0, value: 2, cleared: false, isGolden: false },
      { id: 5, row: 1, col: 1, value: 8, cleared: false, isGolden: false },
    ];
    const base = {
      ...createFruitBoxGame({ mode: 'fever', seed: 1 }),
      cols: 4,
      rows: 2,
      cells,
    };

    // Move 1: 2 apples + 1 golden => (2 + GOLDEN_BONUS_POINTS) * 1x
    const r1 = applyClearSelection(base, { x1: 0.1, y1: 0.1, x2: 1.9, y2: 0.9 }, 1000);
    assert.equal(r1.cleared, true);
    assert.equal(r1.state.combo, 1);
    assert.equal(r1.pointsAwarded, 2 + GOLDEN_BONUS_POINTS);

    // Move 2 within COMBO_WINDOW_MS: combo becomes 2, multiplier > 1
    const r2 = applyClearSelection(
      r1.state,
      { x1: 2.1, y1: 0.1, x2: 3.9, y2: 0.9 },
      1000 + Math.floor(COMBO_WINDOW_MS / 2)
    );
    assert.equal(r2.cleared, true);
    assert.equal(r2.state.combo, 2);
    assert.ok(r2.pointsAwarded >= 3, `expected combo boosted points, got ${r2.pointsAwarded}`);

    // Move 3 after COMBO_WINDOW_MS expires: combo resets to 1, and since board becomes empty, fever refills board!
    const r3 = applyClearSelection(
      r2.state,
      { x1: 0.1, y1: 1.1, x2: 1.9, y2: 1.9 },
      1000 + COMBO_WINDOW_MS * 3
    );
    assert.equal(r3.cleared, true);
    assert.equal(r3.state.combo, 1);
    assert.equal(r3.boardRefilled, true);
    assert.equal(r3.state.boardRound, 2);
    assert.equal(hasAnyValidMove(r3.state.cells, r3.state.cols, r3.state.rows), true);
  });

  it('detects all clear in classic mode and computes rank tiers + minigame route paths', () => {
    const tinyClassic = {
      ...createFruitBoxGame({ mode: 'classic', seed: 3 }),
      cols: 2,
      rows: 1,
      cells: [
        { id: 0, row: 0, col: 0, value: 3, cleared: false, isGolden: false },
        { id: 1, row: 0, col: 1, value: 7, cleared: false, isGolden: false },
      ],
      startedAtMs: 5000,
    };
    const cleared = applyClearSelection(tinyClassic, { x1: 0, y1: 0, x2: 2, y2: 1 }, 12_500);
    assert.equal(cleared.isAllClear, true);
    assert.equal(cleared.noMoreMoves, false);
    assert.equal(cleared.state.clearTimeMs, 7500);
    assert.equal(findHintMove(cleared.state.cells, 2, 1), null);

    // Classic deadlock detection: 3 + 7 clears, leaving only a lone 5 with zero remaining sum-10 moves
    const deadlockClassic = {
      ...createFruitBoxGame({ mode: 'classic', seed: 4 }),
      cols: 3,
      rows: 1,
      cells: [
        { id: 0, row: 0, col: 0, value: 3, cleared: false, isGolden: false },
        { id: 1, row: 0, col: 1, value: 7, cleared: false, isGolden: false },
        { id: 2, row: 0, col: 2, value: 5, cleared: false, isGolden: false },
      ],
      startedAtMs: 5000,
    };
    const deadlocked = applyClearSelection(deadlockClassic, { x1: 0, y1: 0, x2: 1.9, y2: 1 }, 8000);
    assert.equal(deadlocked.cleared, true);
    assert.equal(deadlocked.isAllClear, false);
    assert.equal(deadlocked.noMoreMoves, true);

    assert.equal(computeArcadeRank(170, 'classic', true), 'S+');
    assert.equal(computeArcadeRank(115, 'classic', false), 'S');
    assert.equal(computeArcadeRank(85, 'classic', false), 'A');
    assert.equal(computeArcadeRank(55, 'classic', false), 'B');
    assert.equal(computeArcadeRank(20, 'classic', false), 'C');

    assert.equal(isMinigamePathname('/minigame'), true);
    assert.equal(isMinigamePathname('/minigame/'), true);
    assert.equal(isMinigamePathname('/minigame/index.html'), true);
    assert.equal(isMinigamePathname('/Ainventory/minigame'), true);
    assert.equal(isMinigamePathname('/Ainventory/minigame/'), true);
    assert.equal(isMinigamePathname('/'), false);
    assert.equal(isMinigamePathname('/ir'), false);
  });

  it('evaluates offline, poor (slow-2g/2g/high-rtt), and online connection health accurately', async () => {
    const { evaluateConnectionHealth } = await import('../../src/utils/offlineGameBridge.ts');
    assert.equal(evaluateConnectionHealth(false, null), 'offline');
    assert.equal(evaluateConnectionHealth(true, { effectiveType: 'slow-2g' }), 'poor');
    assert.equal(evaluateConnectionHealth(true, { effectiveType: '2g' }), 'poor');
    assert.equal(evaluateConnectionHealth(true, { effectiveType: '4g', rtt: 2200 }), 'poor');
    assert.equal(evaluateConnectionHealth(true, { effectiveType: '4g', downlink: 0.1 }), 'poor');
    assert.equal(evaluateConnectionHealth(true, { effectiveType: '4g', rtt: 60, downlink: 12 }), 'online');
    assert.equal(evaluateConnectionHealth(true, null), 'online');
  });

  it('routes /minigame and /minigame/ to /minigame/ without Cloudflare index.html 307 loops while blocking AI scrapers', async () => {
    const { createWorkerHandler, resetWorkerRateLimitsForTests } = await import('../../worker/index.js');
    resetWorkerRateLimitsForTests();

    const requestedPaths: string[] = [];
    const fakeAssets = {
      async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        requestedPaths.push(url.pathname);
        // Simulate Cloudflare Static Assets auto-trailing-slash redirecting */index.html -> */
        if (url.pathname === '/minigame/index.html') {
          return new Response(null, { status: 307, headers: { Location: '/minigame/' } });
        }
        return new Response('<html><body>APPLE BOX 3D</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      },
    };

    const worker = createWorkerHandler(async () => new Response('{}', { status: 200 }));

    const botRes = await worker.fetch(
      new Request('https://ainvtry.com/minigame', {
        headers: { 'User-Agent': 'GPTBot/1.2' },
      }),
      { ASSETS: fakeAssets }
    );
    assert.equal(botRes.status, 403);
    assert.equal(requestedPaths.length, 0);

    const bareRes = await worker.fetch(
      new Request('https://ainvtry.com/minigame', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131.0.0.0 Safari/537.36',
        },
      }),
      { ASSETS: fakeAssets }
    );
    assert.equal(bareRes.status, 200);
    assert.equal(requestedPaths[0], '/minigame/');
    assert.match(bareRes.headers.get('X-Robots-Tag') || '', /noai/i);

    const slashRes = await worker.fetch(
      new Request('https://ainvtry.com/minigame/', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131.0.0.0 Safari/537.36',
        },
      }),
      { ASSETS: fakeAssets }
    );
    assert.equal(slashRes.status, 200);
    assert.equal(requestedPaths[1], '/minigame/');
  });
});
