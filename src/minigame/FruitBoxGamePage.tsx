import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Flame,
  Lightbulb,
  Music,
  Palette,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import {
  registerOfflineMinigameServiceWorker,
  subscribeConnectionHealth,
  type ConnectionHealth,
} from '../utils/offlineGameBridge.ts';
import { createArcadeAudioEngine, type ArcadeAudioController } from './arcadeAudioEngine.ts';
import {
  CLASSIC_DURATION_SEC,
  applyClearSelection,
  computeArcadeRank,
  createFruitBoxGame,
  evaluateSelectionRect,
  findHintMove,
  formatTimerDisplay,
  type BoardOrientation,
  type FruitBoxGameState,
  type FruitBoxMode,
  type GridSelectionRect,
  type SelectionEvaluation,
} from './fruitBoxEngine.ts';
import {
  readFruitBoxPreferences,
  readFruitBoxRecords,
  saveGameResultToRecords,
  writeFruitBoxPreferences,
  type FruitBoxPreferences,
  type FruitBoxRecords,
} from './fruitBoxStorage.ts';
import { createAppleArcadeCanvas2D } from './three/AppleArcadeCanvas2D.ts';
import {
  createAppleArcadeStage,
  type AppleStageController,
  type SelectionVisualState,
} from './three/AppleArcadeStage.ts';
import './minigame.css';

type GamePhase = 'title' | 'playing' | 'gameover';

interface FloatingCallout {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly pointsText: string;
  readonly subText: string;
  readonly isGolden: boolean;
}

export interface FruitBoxGamePageProps {
  /** When provided, renders as an instant full-screen overlay inside the parent app instead of navigating away. */
  readonly onExit?: () => void;
  /** Optional initial start flag (e.g., auto-starting when launched from offline popup). */
  readonly autoStart?: boolean;
}

function triggerMiniHaptic(kind: 'selection' | 'light' | 'success'): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(kind === 'success' ? [12, 24, 16] : kind === 'light' ? 8 : 5);
    }
  } catch {
    // Ignore unsupported vibration environments
  }
}

function detectOrientation(width?: number, height?: number): BoardOrientation {
  if (typeof window === 'undefined') return 'landscape';
  const w = width && width > 0 ? width : window.innerWidth;
  const h = height && height > 0 ? height : window.innerHeight;
  return h > w * 1.12 ? 'portrait' : 'landscape';
}

function readReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export default function FruitBoxGamePage({
  onExit,
  autoStart = false,
}: FruitBoxGamePageProps = {}) {
  const [prefs, setPrefs] = useState<FruitBoxPreferences>(() => readFruitBoxPreferences());
  const [records, setRecords] = useState<FruitBoxRecords>(() => readFruitBoxRecords());
  const [phase, setPhase] = useState<GamePhase>(autoStart ? 'playing' : 'title');
  const [connectionHealth, setConnectionHealth] = useState<ConnectionHealth>('online');
  const [swReady, setSwReady] = useState(false);
  const [rendererKind, setRendererKind] = useState<'three' | '2d'>('three');
  const [canvasKey, setCanvasKey] = useState(0);
  const [isNewBest, setIsNewBest] = useState(false);
  const [isAllClearResult, setIsAllClearResult] = useState(false);
  const [noMoreMoves, setNoMoreMoves] = useState(false);

  const [gameState, setGameState] = useState<FruitBoxGameState>(() => {
    const initial = createFruitBoxGame({
      mode: prefs.mode,
      orientation: detectOrientation(),
      durationSec: CLASSIC_DURATION_SEC,
    });
    return autoStart ? { ...initial, startedAtMs: Date.now() } : initial;
  });
  const [remainingSec, setRemainingSec] = useState<number>(CLASSIC_DURATION_SEC);
  const [activeEval, setActiveEval] = useState<SelectionEvaluation | null>(null);
  const [dragTagPos, setDragTagPos] = useState<{ x: number; y: number } | null>(null);
  const [callouts, setCallouts] = useState<readonly FloatingCallout[]>([]);

  const stageWrapRef = useRef<HTMLDivElement | null>(null);
  const stageWrapRectRef = useRef<DOMRect | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageCtrlRef = useRef<AppleStageController | null>(null);
  const audioRef = useRef<ArcadeAudioController | null>(null);
  const prefsRef = useRef<FruitBoxPreferences>(prefs);
  const gameStateRef = useRef<FruitBoxGameState>(gameState);
  const phaseRef = useRef<GamePhase>(phase);
  const isFirstPrefsMountRef = useRef(true);
  const dragRef = useRef<{
    pointerId: number;
    startCol: number;
    startRow: number;
    startClientX: number;
    startClientY: number;
    currentRect: GridSelectionRect;
    lastCount: number;
    lastSum: number;
  } | null>(null);
  const timerStartRef = useRef<number | null>(autoStart ? performance.now() : null);
  const lastCountdownSecRef = useRef<number>(CLASSIC_DURATION_SEC);
  const calloutSeqRef = useRef<number>(1);
  const calloutTimersRef = useRef<Set<number>>(new Set());
  const hintTimerRef = useRef<number | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const playBtnRef = useRef<HTMLButtonElement | null>(null);
  const replayBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Restore caller focus when closing embedded overlay
  useEffect(() => {
    if (!onExit) return undefined;
    prevFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      prevFocusRef.current?.focus?.();
    };
  }, [onExit]);

  // Move focus cleanly to primary CTA when Title / Game Over overlay appears
  useEffect(() => {
    if (phase === 'title') {
      const id = window.setTimeout(() => playBtnRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
    if (phase === 'gameover') {
      const id = window.setTimeout(() => replayBtnRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [phase]);

  // Register offline Service Worker & subscribe to live connection health
  useEffect(() => {
    const unsubConn = subscribeConnectionHealth(setConnectionHealth);
    void registerOfflineMinigameServiceWorker().then((reg) => {
      if (reg) setSwReady(true);
    });
    return () => {
      unsubConn();
    };
  }, []);

  // Initialize procedural Web Audio synthesizer (and start BGM immediately on autoStart)
  useEffect(() => {
    const audio = createArcadeAudioEngine({
      sfxEnabled: prefsRef.current.sfxEnabled,
      bgmEnabled: prefsRef.current.bgmEnabled,
    });
    audioRef.current = audio;
    if (autoStart) {
      audio.unlock();
      audio.startBgm();
    }
    return () => {
      audio.dispose();
      audioRef.current = null;
    };
  }, [autoStart]);

  useEffect(() => {
    audioRef.current?.setSfxEnabled(prefs.sfxEnabled);
    audioRef.current?.setBgmEnabled(prefs.bgmEnabled);
    if (prefs.bgmEnabled && phaseRef.current === 'playing') {
      audioRef.current?.startBgm();
    }
    if (isFirstPrefsMountRef.current) {
      isFirstPrefsMountRef.current = false;
      return;
    }
    writeFruitBoxPreferences(prefs);
  }, [prefs]);

  // Cleanup all floating callout & hint timers on unmount
  useEffect(() => {
    const calloutTimers = calloutTimersRef.current;
    return () => {
      for (const id of calloutTimers) {
        window.clearTimeout(id);
      }
      calloutTimers.clear();
      if (hintTimerRef.current !== null) {
        window.clearTimeout(hintTimerRef.current);
      }
    };
  }, []);

  const spawnFloatingCallout = useCallback(
    (col: number, row: number, pointsText: string, subText: string, isGolden: boolean) => {
      const stage = stageCtrlRef.current;
      const wrap = stageWrapRef.current;
      const pos = stage?.gridToClient(col, row) ?? {
        x: (wrap?.clientWidth ?? 640) * 0.5,
        y: (wrap?.clientHeight ?? 400) * 0.45,
      };
      const id = calloutSeqRef.current;
      calloutSeqRef.current += 1;
      setCallouts((prev) => [
        ...prev.slice(-10),
        { id, x: pos.x, y: pos.y, pointsText, subText, isGolden },
      ]);
      const timerId = window.setTimeout(() => {
        calloutTimersRef.current.delete(timerId);
        setCallouts((prev) => prev.filter((item) => item.id !== id));
      }, 980);
      calloutTimersRef.current.add(timerId);
    },
    []
  );

  const finishGame = useCallback((finalState: FruitBoxGameState, isAllClear: boolean) => {
    phaseRef.current = 'gameover';
    setPhase('gameover');
    setIsAllClearResult(isAllClear);
    setNoMoreMoves(false);
    setActiveEval(null);
    setDragTagPos(null);
    dragRef.current = null;
    stageCtrlRef.current?.setSelection(null, [], 'idle');
    stageCtrlRef.current?.setHintIds([]);
    audioRef.current?.stopBgm();
    audioRef.current?.playGameOver(isAllClear);
    triggerMiniHaptic(isAllClear ? 'success' : 'light');

    const { records: nextRecords, isNewBest: newRecord } = saveGameResultToRecords({
      mode: finalState.mode,
      score: finalState.score,
      clearedCount: finalState.clearedCount,
      maxCombo: finalState.maxCombo,
      clearTimeMs: finalState.clearTimeMs,
    });
    setRecords(nextRecords);
    setIsNewBest(newRecord);
  }, []);

  const startNewGame = useCallback((targetMode?: FruitBoxMode) => {
    const mode = targetMode ?? prefsRef.current.mode;
    const wrap = stageWrapRef.current;
    const orientation = detectOrientation(wrap?.clientWidth, wrap?.clientHeight);
    const fresh = createFruitBoxGame({
      mode,
      orientation,
      durationSec: CLASSIC_DURATION_SEC,
    });
    const startedState: FruitBoxGameState = {
      ...fresh,
      startedAtMs: Date.now(),
    };
    gameStateRef.current = startedState;
    setGameState(startedState);
    setRemainingSec(CLASSIC_DURATION_SEC);
    setActiveEval(null);
    setDragTagPos(null);
    setIsNewBest(false);
    setIsAllClearResult(false);
    setNoMoreMoves(false);
    dragRef.current = null;
    timerStartRef.current = performance.now();
    lastCountdownSecRef.current = CLASSIC_DURATION_SEC;

    stageCtrlRef.current?.syncBoard(startedState.cells, startedState.cols, startedState.rows, true);
    stageCtrlRef.current?.setSelection(null, [], 'idle');
    stageCtrlRef.current?.setHintIds([]);
    stageCtrlRef.current?.setFeverLevel(0);

    audioRef.current?.unlock();
    audioRef.current?.setIntensity(0);
    audioRef.current?.startBgm();
    triggerMiniHaptic('selection');

    phaseRef.current = 'playing';
    setPhase('playing');
  }, []);

  // Mount Three.js WebGL stage or freshly-keyed 2D Canvas fallback (fresh <canvas> guarantees getContext('2d') succeeds)
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = stageWrapRef.current;
    if (!canvas || !wrap) return undefined;

    let ctrl: AppleStageController | null = null;
    if (rendererKind === 'three') {
      ctrl = createAppleArcadeStage({
        canvas,
        cols: gameStateRef.current.cols,
        rows: gameStateRef.current.rows,
        softColors: prefsRef.current.softColors,
        highFx: prefsRef.current.highFx,
        reducedMotion: readReducedMotion(),
        onWebglUnavailable: () => {
          setRendererKind('2d');
          setCanvasKey((k) => k + 1);
        },
      });
      if (!ctrl) {
        setRendererKind('2d');
        setCanvasKey((k) => k + 1);
        return undefined;
      }
    } else {
      ctrl = createAppleArcadeCanvas2D({
        canvas,
        cols: gameStateRef.current.cols,
        rows: gameStateRef.current.rows,
        softColors: prefsRef.current.softColors,
      });
    }

    if (!ctrl) return undefined;

    stageCtrlRef.current = ctrl;
    ctrl.resize(wrap.clientWidth, wrap.clientHeight);
    ctrl.syncBoard(
      gameStateRef.current.cells,
      gameStateRef.current.cols,
      gameStateRef.current.rows,
      true
    );

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width <= 4 || height <= 4) continue;
        stageCtrlRef.current?.resize(width, height);
        // Adapt board orientation cleanly while on title screen when device rotates
        if (phaseRef.current === 'title') {
          const nextOrientation = detectOrientation(width, height);
          if (nextOrientation !== gameStateRef.current.orientation) {
            const reflowed = createFruitBoxGame({
              mode: prefsRef.current.mode,
              orientation: nextOrientation,
              durationSec: CLASSIC_DURATION_SEC,
            });
            gameStateRef.current = reflowed;
            setGameState(reflowed);
            stageCtrlRef.current?.syncBoard(reflowed.cells, reflowed.cols, reflowed.rows, false);
          }
        }
      }
    });
    ro.observe(wrap);

    return () => {
      ro.disconnect();
      ctrl.dispose();
      if (stageCtrlRef.current === ctrl) {
        stageCtrlRef.current = null;
      }
    };
  }, [rendererKind, canvasKey]);

  // Sync visual preferences & live prefers-reduced-motion changes
  useEffect(() => {
    stageCtrlRef.current?.setSoftColors(prefs.softColors);
    stageCtrlRef.current?.setHighFx(prefs.highFx);
  }, [prefs.softColors, prefs.highFx]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => {
      stageCtrlRef.current?.setReducedMotion(event.matches);
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  // High-precision 120s countdown loop (drift-free via performance.now)
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    if (timerStartRef.current === null) {
      timerStartRef.current = performance.now();
    }

    let rafId = 0;
    const tick = () => {
      if (phaseRef.current !== 'playing') return;
      const start = timerStartRef.current ?? performance.now();
      const elapsedSec = (performance.now() - start) / 1000;
      const left = Math.max(0, gameStateRef.current.durationSec - elapsedSec);
      setRemainingSec(left);

      const ceilSec = Math.ceil(left);
      if (ceilSec <= 10 && ceilSec > 0 && ceilSec < lastCountdownSecRef.current) {
        lastCountdownSecRef.current = ceilSec;
        audioRef.current?.playCountdownTick(ceilSec);
      }

      const urgency = left <= 20 ? (20 - left) / 20 : 0;
      const intensity = Math.max(urgency * 0.85, gameStateRef.current.feverMeter);
      audioRef.current?.setIntensity(intensity);

      if (left <= 0) {
        finishGame(gameStateRef.current, false);
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [phase, finishGame]);

  // Hint action: pulses a valid 10-sum group in neon cyan for 2.4 seconds
  const handleHint = useCallback(() => {
    if (phaseRef.current !== 'playing') return;
    const hint = findHintMove(
      gameStateRef.current.cells,
      gameStateRef.current.cols,
      gameStateRef.current.rows
    );
    if (!hint) {
      setNoMoreMoves(true);
      spawnFloatingCallout(
        gameStateRef.current.cols * 0.5,
        gameStateRef.current.rows * 0.5,
        'NO MOVES',
        'FINISH OR RESET',
        false
      );
      return;
    }
    stageCtrlRef.current?.setHintIds(hint.cellIds);
    audioRef.current?.playSelectTick(hint.cellIds.length, 10);
    triggerMiniHaptic('selection');
    if (hintTimerRef.current !== null) {
      window.clearTimeout(hintTimerRef.current);
    }
    hintTimerRef.current = window.setTimeout(() => {
      stageCtrlRef.current?.setHintIds([]);
      hintTimerRef.current = null;
    }, 2400);
  }, [spawnFloatingCallout]);

  // Keyboard shortcuts without hijacking interactive controls (`button`, `a`, `[role="radio"]`)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'Escape' && onExit) {
        e.preventDefault();
        onExit();
        return;
      }
      const isInteractiveTarget = Boolean(target?.closest('button, a, [role="radio"]'));
      if ((e.key === ' ' || e.key === 'Enter') && phaseRef.current !== 'playing' && !isInteractiveTarget) {
        e.preventDefault();
        startNewGame();
        return;
      }
      if (e.key.toLowerCase() === 'r' && phaseRef.current === 'playing' && !isInteractiveTarget) {
        e.preventDefault();
        startNewGame();
      } else if (e.key.toLowerCase() === 'h' && phaseRef.current === 'playing' && !isInteractiveTarget) {
        e.preventDefault();
        handleHint();
      } else if (e.key.toLowerCase() === 'm' && !isInteractiveTarget) {
        e.preventDefault();
        setPrefs((prev) => {
          const nextSound = !(prev.sfxEnabled || prev.bgmEnabled);
          return { ...prev, sfxEnabled: nextSound, bgmEnabled: nextSound };
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleHint, onExit, startNewGame]);

  const commitDragRelease = useCallback(
    (dragSnapshot: NonNullable<typeof dragRef.current>, endClientX?: number, endClientY?: number) => {
      const stage = stageCtrlRef.current;
      stage?.setSelection(null, [], 'idle');
      setActiveEval(null);
      setDragTagPos(null);

      if (phaseRef.current !== 'playing') return;

      const result = applyClearSelection(gameStateRef.current, dragSnapshot.currentRect, Date.now());
      if (!result.cleared) {
        const dragDist =
          endClientX !== undefined && endClientY !== undefined
            ? Math.hypot(endClientX - dragSnapshot.startClientX, endClientY - dragSnapshot.startClientY)
            : 20;
        // Skip invalid chirp on accidental tiny single-cell taps
        if (dragSnapshot.lastCount >= 2 || dragDist >= 18) {
          audioRef.current?.playInvalidRelease();
        }
        return;
      }

      gameStateRef.current = result.state;
      setGameState(result.state);
      setNoMoreMoves(result.noMoreMoves);

      stage?.triggerBurst({
        clearedCells: result.clearedCells,
        centroidCol: result.centroidCol,
        centroidRow: result.centroidRow,
        combo: result.state.combo,
        goldenCount: result.goldenCount,
        isFever: result.state.isFeverActive,
      });
      stage?.syncBoard(
        result.state.cells,
        result.state.cols,
        result.state.rows,
        result.boardRefilled
      );
      stage?.setFeverLevel(result.state.feverMeter);

      audioRef.current?.playClearPop(
        result.clearedCells.length,
        result.state.combo,
        result.goldenCount > 0
      );
      triggerMiniHaptic(result.goldenCount > 0 || result.state.combo >= 4 ? 'success' : 'light');

      const subParts: string[] = [];
      if (result.goldenCount > 0) subParts.push(`GOLDEN +${result.goldenCount * 4}`);
      if (result.state.combo >= 2) subParts.push(`${result.state.combo} COMBO`);
      if (result.state.isFeverActive) subParts.push('FEVER!');

      spawnFloatingCallout(
        result.centroidCol,
        result.centroidRow,
        `+${result.pointsAwarded}`,
        subParts.join(' · ') || `${result.clearedCells.length} APPLES`,
        result.goldenCount > 0
      );

      if (result.boardRefilled) {
        audioRef.current?.playBoardRefill();
        spawnFloatingCallout(
          result.state.cols * 0.5,
          result.state.rows * 0.45,
          `STAGE ${result.state.boardRound}`,
          'FRESH BOARD BONUS!',
          true
        );
      }

      if (result.isAllClear) {
        finishGame(result.state, true);
      }
    },
    [finishGame, spawnFloatingCallout]
  );

  // Guard against stuck selection boxes if pointer releases outside browser or window blurs
  useEffect(() => {
    const onGlobalRelease = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== ev.pointerId) return;
      dragRef.current = null;
      commitDragRelease(drag, ev.clientX, ev.clientY);
    };
    const onWindowBlur = () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      stageCtrlRef.current?.setSelection(null, [], 'idle');
      setActiveEval(null);
      setDragTagPos(null);
    };
    window.addEventListener('pointerup', onGlobalRelease);
    window.addEventListener('pointercancel', onGlobalRelease);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('pointerup', onGlobalRelease);
      window.removeEventListener('pointercancel', onGlobalRelease);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [commitDragRelease]);

  const updateDragAtPointer = useCallback((clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const stage = stageCtrlRef.current;
    const wrap = stageWrapRef.current;
    if (!drag || !stage || !wrap) return;

    const gridPt = stage.clientToGrid(clientX, clientY);
    if (!gridPt) return;

    const nextRect: GridSelectionRect = {
      x1: drag.startCol,
      y1: drag.startRow,
      x2: gridPt.col,
      y2: gridPt.row,
    };
    drag.currentRect = nextRect;

    const evaluation = evaluateSelectionRect(gameStateRef.current.cells, nextRect);
    const visState: SelectionVisualState =
      evaluation.selectedIds.length === 0
        ? 'idle'
        : evaluation.isExactTen
          ? 'exact'
          : evaluation.isOverTen
            ? 'over'
            : 'under';

    stage.setSelection(nextRect, evaluation.selectedIds, visState);

    const wrapRect = stageWrapRectRef.current ?? wrap.getBoundingClientRect();
    setDragTagPos({
      x: Math.max(54, Math.min(wrapRect.width - 54, clientX - wrapRect.left)),
      y: Math.max(54, Math.min(wrapRect.height - 24, clientY - wrapRect.top)),
    });

    if (evaluation.selectedIds.length !== drag.lastCount || evaluation.sum !== drag.lastSum) {
      drag.lastCount = evaluation.selectedIds.length;
      drag.lastSum = evaluation.sum;
      setActiveEval(evaluation);
      if (evaluation.selectedIds.length > 0) {
        audioRef.current?.playSelectTick(evaluation.selectedIds.length, evaluation.sum);
        if (evaluation.isExactTen) {
          triggerMiniHaptic('selection');
        }
      }
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (phaseRef.current !== 'playing') return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      // Ignore secondary touches while an active drag is already in progress
      if (dragRef.current !== null) return;
      const stage = stageCtrlRef.current;
      const wrap = stageWrapRef.current;
      if (!stage || !wrap) return;

      audioRef.current?.unlock();
      if (prefsRef.current.bgmEnabled) {
        audioRef.current?.startBgm();
      }
      const gridPt = stage.clientToGrid(e.clientX, e.clientY);
      if (!gridPt) return;

      stageWrapRectRef.current = wrap.getBoundingClientRect();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Fallback window pointerup listener guarantees release even without pointer capture
      }

      const initialRect: GridSelectionRect = {
        x1: gridPt.col,
        y1: gridPt.row,
        x2: gridPt.col,
        y2: gridPt.row,
      };
      dragRef.current = {
        pointerId: e.pointerId,
        startCol: gridPt.col,
        startRow: gridPt.row,
        startClientX: e.clientX,
        startClientY: e.clientY,
        currentRect: initialRect,
        lastCount: -1,
        lastSum: -1,
      };
      stage.setHintIds([]);
      updateDragAtPointer(e.clientX, e.clientY);
    },
    [updateDragAtPointer]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
      updateDragAtPointer(e.clientX, e.clientY);
    },
    [updateDragAtPointer]
  );

  const handlePointerUpOrCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if already released
      }
      commitDragRelease(drag, e.clientX, e.clientY);
    },
    [commitDragRelease]
  );

  const timerRatio = Math.max(0, Math.min(1, remainingSec / Math.max(1, gameState.durationSec)));
  const isUrgent = phase === 'playing' && remainingSec <= 15;
  const activeBest = prefs.mode === 'classic' ? records.classicBest : records.feverBest;
  const rank = useMemo(
    () => computeArcadeRank(gameState.score, gameState.mode, isAllClearResult),
    [gameState.score, gameState.mode, isAllClearResult]
  );

  const sumPillClass =
    !activeEval || activeEval.selectedIds.length === 0
      ? 'mg-sum-pill'
      : activeEval.isExactTen
        ? 'mg-sum-pill is-exact'
        : activeEval.isOverTen
          ? 'mg-sum-pill is-over'
          : 'mg-sum-pill is-under';

  const connLabel =
    connectionHealth === 'offline'
      ? 'OFFLINE'
      : connectionHealth === 'poor'
        ? 'LOW SIGNAL'
        : swReady
          ? 'OFFLINE READY'
          : '3D';

  // Avoid nested aria-modal="true" dialogs when Title/GameOver modal is shown inside embedded mode
  const shellActsAsDialog = Boolean(onExit) && phase === 'playing';

  return (
    <div
      className={`mg-shell ${onExit ? 'is-embedded' : ''} ${
        gameState.isFeverActive && phase === 'playing' ? 'is-fever' : ''
      }`}
      role={shellActsAsDialog ? 'dialog' : undefined}
      aria-modal={shellActsAsDialog ? 'true' : undefined}
      aria-label={shellActsAsDialog ? '3D 네온 사과게임 미니게임' : undefined}
      data-testid="fruitbox-minigame-root"
    >
      {/* Top Neon Glass HUD */}
      <header className="mg-topbar">
        <div className="mg-brand-cluster">
          {onExit ? (
            <button
              type="button"
              className="mg-home-link"
              onClick={onExit}
              aria-label="사이트로 돌아가기"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span>닫기</span>
            </button>
          ) : (
            <a href="/" className="mg-home-link" aria-label="Ainvtry 메인으로 돌아가기">
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Ainvtry</span>
            </a>
          )}
          <div className="mg-title-pill">
            <span className="mg-title-main">APPLE BOX // 3D</span>
            <span
              className={`mg-conn-badge ${
                connectionHealth === 'offline'
                  ? 'is-offline'
                  : connectionHealth === 'poor'
                    ? 'is-poor'
                    : ''
              }`}
            >
              <span className="mg-conn-dot" aria-hidden="true" />
              {connectionHealth === 'offline' ? (
                <WifiOff size={11} aria-hidden="true" />
              ) : (
                <Wifi size={11} aria-hidden="true" />
              )}
              <span>{connLabel}</span>
            </span>
          </div>
        </div>

        {/* Center Score, Selection Sum & Countdown */}
        <div className="mg-hud-metrics" role="status" aria-live="polite">
          <div className="mg-stat-chip is-score">
            <span className="mg-stat-label">SCORE</span>
            <span className="mg-stat-value" data-testid="mg-score">
              {gameState.score}
            </span>
          </div>

          <div className={sumPillClass} data-testid="mg-sum-pill">
            {activeEval && activeEval.selectedIds.length > 0 ? (
              <>
                <span>SUM {activeEval.sum}</span>
                {activeEval.isExactTen && <span>✓</span>}
              </>
            ) : (
              <span>DRAG = 10</span>
            )}
          </div>

          <div className={`mg-stat-chip is-timer ${isUrgent ? 'is-urgent' : ''}`}>
            <span className="mg-stat-label">TIME</span>
            <span className="mg-stat-value" data-testid="mg-timer">
              {formatTimerDisplay(remainingSec)}
            </span>
          </div>

          {gameState.combo >= 2 && phase === 'playing' && (
            <div className="mg-combo-pill">
              <Flame size={14} aria-hidden="true" />
              <span>
                {gameState.combo} COMBO{gameState.isFeverActive ? ' · FEVER!' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Right Controls */}
        <div className="mg-actions">
          <button
            type="button"
            className="mg-icon-btn"
            onClick={handleHint}
            disabled={phase !== 'playing'}
            title="힌트 보기 (H)"
            aria-label="힌트 보기"
          >
            <Lightbulb size={16} aria-hidden="true" />
            <span className="mg-icon-btn-text">힌트</span>
          </button>

          <button
            type="button"
            className={`mg-icon-btn ${prefs.softColors ? 'is-soft' : ''}`}
            onClick={() => setPrefs((p) => ({ ...p, softColors: !p.softColors }))}
            title="연한 색 모드 (눈이 편안한 톤)"
            aria-label="연한 색 모드 전환"
            aria-pressed={prefs.softColors}
          >
            <Palette size={16} aria-hidden="true" />
            <span className="mg-icon-btn-text">연한색</span>
          </button>

          <button
            type="button"
            className={`mg-icon-btn ${prefs.bgmEnabled ? 'is-active' : ''}`}
            onClick={() => setPrefs((p) => ({ ...p, bgmEnabled: !p.bgmEnabled }))}
            title="배경음악 켜기/끄기"
            aria-label="배경음악 켜기/끄기"
            aria-pressed={prefs.bgmEnabled}
          >
            <Music size={16} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={`mg-icon-btn ${prefs.sfxEnabled ? 'is-active' : ''}`}
            onClick={() => setPrefs((p) => ({ ...p, sfxEnabled: !p.sfxEnabled }))}
            title="효과음 켜기/끄기 (M)"
            aria-label="효과음 켜기/끄기"
            aria-pressed={prefs.sfxEnabled}
          >
            {prefs.sfxEnabled ? (
              <Volume2 size={16} aria-hidden="true" />
            ) : (
              <VolumeX size={16} aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            className="mg-icon-btn"
            onClick={() => startNewGame()}
            title="새 판 시작 (R)"
            aria-label="새 판 시작"
          >
            <RotateCcw size={16} aria-hidden="true" />
            <span className="mg-icon-btn-text">리셋</span>
          </button>
        </div>
      </header>

      {/* Neon Energy Progress Bar */}
      <div className="mg-energy-rail" aria-hidden="true">
        <div
          className={`mg-energy-fill ${isUrgent ? 'is-urgent' : ''}`}
          style={{ width: `${(timerRatio * 100).toFixed(2)}%` }}
        />
      </div>

      {/* Interactive Three.js 3D Apple Arena */}
      <main
        ref={stageWrapRef}
        className="mg-stage-wrap"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
      >
        <canvas
          key={canvasKey}
          ref={canvasRef}
          className="mg-stage-canvas"
          aria-label="3D 사과게임 보드 — 마우스나 터치로 드래그해 합이 10인 사과를 묶으세요"
        />

        {/* Floating live drag sum badge near cursor */}
        {dragTagPos && activeEval && activeEval.selectedIds.length > 0 && (
          <div
            className={`mg-drag-tag ${
              activeEval.isExactTen ? 'is-exact' : activeEval.isOverTen ? 'is-over' : ''
            }`}
            style={{ left: `${dragTagPos.x}px`, top: `${dragTagPos.y}px` }}
          >
            {activeEval.isExactTen ? '10! POP!' : `${activeEval.sum}`}
          </div>
        )}

        {/* Animated burst score popups */}
        <div className="mg-popup-layer" aria-hidden="true">
          {callouts.map((item) => (
            <div
              key={item.id}
              className={`mg-float-callout ${item.isGolden ? 'is-golden' : ''}`}
              style={{ left: `${item.x}px`, top: `${item.y}px` }}
            >
              <span className="mg-float-points">{item.pointsText}</span>
              <span className="mg-float-sub">{item.subText}</span>
            </div>
          ))}
        </div>

        {/* Classic Mode Zero-Moves Notification Banner */}
        {noMoreMoves && phase === 'playing' && (
          <div className="mg-deadlock-banner" role="alert">
            <span>남은 조합 없음</span>
            <button
              type="button"
              className="mg-deadlock-btn is-primary"
              onClick={() => finishGame(gameStateRef.current, false)}
            >
              종료
            </button>
            <button
              type="button"
              className="mg-deadlock-btn"
              onClick={() => startNewGame()}
            >
              새 판
            </button>
          </div>
        )}

        <div className="mg-renderer-pill" aria-hidden="true">
          {rendererKind === 'three' ? '3D' : '2D'} · {gameState.cols}×{gameState.rows} · BEST{' '}
          {activeBest}
        </div>
      </main>

      {/* Start / Title Overlay */}
      {phase === 'title' && (
        <div className="mg-overlay-backdrop" role="dialog" aria-modal="true" aria-labelledby="mg-title-h1">
          <div className="mg-modal-card mg-modal-card--compact">
            <div className="mg-title-head">
              <h1 id="mg-title-h1" className="mg-hero-title">
                사과게임 3D
              </h1>
              <p className="mg-hero-desc">
                드래그로 합 <strong>10</strong> 만들기 · <strong>120초</strong>
              </p>
            </div>

            <div className="mg-mode-grid" role="radiogroup" aria-label="게임 모드 선택">
              <button
                type="button"
                role="radio"
                aria-checked={prefs.mode === 'classic'}
                className={`mg-mode-card ${prefs.mode === 'classic' ? 'is-selected' : ''}`}
                onClick={() => setPrefs((p) => ({ ...p, mode: 'classic' }))}
              >
                <span className="mg-mode-name">
                  <Trophy size={15} aria-hidden="true" />
                  <span>클래식</span>
                </span>
                <span className="mg-mode-sub">17×10 · 원본 규칙</span>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={prefs.mode === 'fever'}
                className={`mg-mode-card ${prefs.mode === 'fever' ? 'is-selected' : ''}`}
                onClick={() => setPrefs((p) => ({ ...p, mode: 'fever' }))}
              >
                <span className="mg-mode-name">
                  <Zap size={15} aria-hidden="true" />
                  <span>피버 3D</span>
                </span>
                <span className="mg-mode-sub">골든 +4 · 콤보 ×3</span>
              </button>
            </div>

            <div className="mg-best-strip">
              <div className="mg-best-box">
                <span className="mg-best-label">CLASSIC</span>
                <span className="mg-best-val">{records.classicBest}</span>
              </div>
              <div className="mg-best-box">
                <span className="mg-best-label">FEVER</span>
                <span className="mg-best-val">{records.feverBest}</span>
              </div>
              <div className="mg-best-box">
                <span className="mg-best-label">COMBO</span>
                <span className="mg-best-val">{records.bestCombo}×</span>
              </div>
            </div>

            <button
              ref={playBtnRef}
              type="button"
              className="mg-cta-primary"
              data-testid="mg-play-btn"
              onClick={() => startNewGame()}
            >
              <Play size={18} fill="currentColor" aria-hidden="true" />
              <span>PLAY</span>
            </button>
          </div>
        </div>
      )}

      {/* Game Over / All Clear Result Overlay */}
      {phase === 'gameover' && (
        <div className="mg-overlay-backdrop" role="dialog" aria-modal="true" aria-labelledby="mg-result-h2">
          <div className="mg-modal-card mg-modal-card--compact">
            <div className="mg-result-header">
              <div>
                {isNewBest && (
                  <span className="mg-new-best-chip">
                    <Sparkles size={12} aria-hidden="true" />
                    <span>NEW BEST</span>
                  </span>
                )}
                <h2 id="mg-result-h2" className="mg-hero-title" style={{ marginTop: isNewBest ? 6 : 0 }}>
                  {isAllClearResult ? 'ALL CLEAR!' : `${gameState.score}점`}
                </h2>
                <p className="mg-hero-desc">
                  {gameState.mode === 'classic' ? '클래식' : '피버 3D'}
                </p>
              </div>
              <div className="mg-rank-badge" aria-label={`등급 ${rank}`}>
                {rank}
              </div>
            </div>

            <div className="mg-best-strip">
              <div className="mg-best-box">
                <span className="mg-best-label">APPLES</span>
                <span className="mg-best-val">{gameState.clearedCount}</span>
              </div>
              <div className="mg-best-box">
                <span className="mg-best-label">COMBO</span>
                <span className="mg-best-val">{gameState.maxCombo}×</span>
              </div>
              <div className="mg-best-box">
                <span className="mg-best-label">
                  {gameState.clearTimeMs !== null ? 'TIME' : 'BEST'}
                </span>
                <span className="mg-best-val">
                  {gameState.clearTimeMs !== null
                    ? `${(gameState.clearTimeMs / 1000).toFixed(1)}s`
                    : gameState.mode === 'classic'
                      ? records.classicBest
                      : records.feverBest}
                </span>
              </div>
            </div>

            <button
              ref={replayBtnRef}
              type="button"
              className="mg-cta-primary"
              data-testid="mg-replay-btn"
              onClick={() => startNewGame()}
            >
              <RotateCcw size={18} aria-hidden="true" />
              <span>다시하기</span>
            </button>

            <div className="mg-cta-row">
              <button
                type="button"
                className="mg-cta-secondary"
                onClick={() => {
                  const alt: FruitBoxMode = gameState.mode === 'classic' ? 'fever' : 'classic';
                  setPrefs((p) => ({ ...p, mode: alt }));
                  startNewGame(alt);
                }}
              >
                <Zap size={15} aria-hidden="true" />
                <span>{gameState.mode === 'classic' ? '피버 3D' : '클래식'}</span>
              </button>
              {onExit ? (
                <button type="button" className="mg-cta-secondary" onClick={onExit}>
                  <ArrowLeft size={15} aria-hidden="true" />
                  <span>닫기</span>
                </button>
              ) : (
                <a href="/" className="mg-cta-secondary">
                  <ArrowLeft size={15} aria-hidden="true" />
                  <span>메인</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
