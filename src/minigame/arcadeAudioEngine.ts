/**
 * 100% Offline Procedural Web Audio API Neon Arcade Sound & BGM Engine.
 * Synthesizes an upbeat ~22s catchy synth-chiptune BGM loop inspired by Fruit Box
 * plus dynamic harmonic SFX for dragging, sum-10 lock-on, combo pops, golden bursts,
 * countdown ticks, and victory fanfare — zero external audio downloads required.
 */

export interface ArcadeAudioController {
  unlock: () => void;
  setSfxEnabled: (enabled: boolean) => void;
  setBgmEnabled: (enabled: boolean) => void;
  setIntensity: (level: number) => void;
  startBgm: () => void;
  stopBgm: () => void;
  playSelectTick: (count: number, sum: number) => void;
  playClearPop: (appleCount: number, combo: number, hasGolden: boolean) => void;
  playInvalidRelease: () => void;
  playBoardRefill: () => void;
  playCountdownTick: (secondsLeft: number) => void;
  playGameOver: (isAllClear: boolean) => void;
  dispose: () => void;
}

// MIDI note -> frequency helper
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 64-step upbeat neon synthwave / fruit-box inspired loop (~21.8s at 176 step/min -> ~340ms/step)
const BGM_MELODY_STEPS: readonly (number | null)[] = [
  // Bar 1-2 (Fmaj7 -> G7)
  72, null, 76, 79, 81, null, 79, 76,
  74, null, 77, 79, 83, null, 79, null,
  // Bar 3-4 (Em7 -> Am7)
  76, null, 79, 83, 84, null, 83, 79,
  76, 79, 81, null, 76, null, null, null,
  // Bar 5-6 (Dm7 -> G9)
  74, null, 77, 81, 84, null, 81, 77,
  79, null, 83, 86, 84, 83, 79, null,
  // Bar 7-8 (Cmaj9 -> turnaround)
  84, null, 83, 79, 76, null, 79, 84,
  86, null, 84, 81, 79, null, 76, null,
];

const BGM_BASS_STEPS: readonly number[] = [
  53, 53, 60, 53, 55, 55, 62, 55,
  52, 52, 59, 52, 57, 57, 64, 57,
  50, 50, 57, 50, 55, 55, 62, 55,
  48, 48, 55, 48, 55, 57, 59, 60,
];

const PENTATONIC_SCALE = [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 88];

export function createArcadeAudioEngine(initial: {
  readonly sfxEnabled?: boolean;
  readonly bgmEnabled?: boolean;
} = {}): ArcadeAudioController {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let bgmGain: GainNode | null = null;
  let sfxGain: GainNode | null = null;

  let sfxEnabled = initial.sfxEnabled ?? true;
  let bgmEnabled = initial.bgmEnabled ?? true;
  let bgmPlaying = false;
  let bgmTimer: number | null = null;
  let bgmStep = 0;
  let intensity = 0;
  let lastSelectTickMs = 0;
  let disposed = false;

  const ensureContext = (): AudioContext | null => {
    if (disposed || typeof window === 'undefined') return null;
    if (!ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      try {
        ctx = new AudioCtor();
        masterGain = ctx.createGain();
        masterGain.gain.value = 0.62;
        masterGain.connect(ctx.destination);

        bgmGain = ctx.createGain();
        bgmGain.gain.value = bgmEnabled ? 0.24 : 0;
        bgmGain.connect(masterGain);

        sfxGain = ctx.createGain();
        sfxGain.gain.value = sfxEnabled ? 0.72 : 0;
        sfxGain.connect(masterGain);
      } catch {
        return null;
      }
    }
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    return ctx;
  };

  const playTone = (params: {
    readonly target: 'bgm' | 'sfx';
    readonly freq: number;
    readonly freqEnd?: number;
    readonly type: OscillatorType;
    readonly duration: number;
    readonly gain: number;
    readonly delay?: number;
  }): void => {
    const audioCtx = ensureContext();
    const bus = params.target === 'bgm' ? bgmGain : sfxGain;
    if (!audioCtx || !bus) return;
    if (params.target === 'bgm' && !bgmEnabled) return;
    if (params.target === 'sfx' && !sfxEnabled) return;

    const now = audioCtx.currentTime + (params.delay ?? 0);
    const osc = audioCtx.createOscillator();
    const env = audioCtx.createGain();

    osc.type = params.type;
    osc.frequency.setValueAtTime(Math.max(30, params.freq), now);
    if (params.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(30, params.freqEnd),
        now + params.duration
      );
    }

    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(params.gain, now + Math.min(0.014, params.duration * 0.2));
    env.gain.exponentialRampToValueAtTime(0.0001, now + params.duration);

    osc.connect(env);
    env.connect(bus);

    osc.start(now);
    osc.stop(now + params.duration + 0.02);
  };

  const scheduleNextBgmStep = (): void => {
    if (!bgmPlaying || disposed) return;
    if (
      bgmEnabled &&
      ctx &&
      ctx.state === 'running' &&
      typeof document !== 'undefined' &&
      !document.hidden
    ) {
      const melodyNote = BGM_MELODY_STEPS[bgmStep % BGM_MELODY_STEPS.length];
      if (melodyNote !== null) {
        playTone({
          target: 'bgm',
          freq: midiToFreq(melodyNote),
          type: intensity > 0.65 ? 'sawtooth' : 'triangle',
          duration: 0.22,
          gain: intensity > 0.65 ? 0.16 : 0.22,
        });
      }
      if (bgmStep % 2 === 0) {
        const bassNote = BGM_BASS_STEPS[(bgmStep / 2) % BGM_BASS_STEPS.length];
        playTone({
          target: 'bgm',
          freq: midiToFreq(bassNote),
          type: 'sine',
          duration: 0.28,
          gain: 0.28,
        });
      }
      // Subtle arcade hi-hat shimmer on offbeats
      if (bgmStep % 4 === 2) {
        playTone({
          target: 'bgm',
          freq: 1480 + (intensity > 0.6 ? 320 : 0),
          freqEnd: 720,
          type: 'square',
          duration: 0.04,
          gain: 0.035,
        });
      }
    }
    bgmStep = (bgmStep + 1) % BGM_MELODY_STEPS.length;
    const stepMs = Math.round(340 - Math.min(1, Math.max(0, intensity)) * 55);
    bgmTimer = window.setTimeout(scheduleNextBgmStep, stepMs);
  };

  const stopBgm = (): void => {
    bgmPlaying = false;
    if (bgmTimer !== null) {
      window.clearTimeout(bgmTimer);
      bgmTimer = null;
    }
  };

  const startBgm = (): void => {
    if (disposed || bgmPlaying) return;
    ensureContext();
    bgmPlaying = true;
    bgmStep = 0;
    scheduleNextBgmStep();
  };

  return {
    unlock() {
      ensureContext();
    },
    setSfxEnabled(enabled: boolean) {
      sfxEnabled = enabled;
      if (sfxGain && ctx) {
        sfxGain.gain.setTargetAtTime(enabled ? 0.72 : 0, ctx.currentTime, 0.02);
      }
    },
    setBgmEnabled(enabled: boolean) {
      bgmEnabled = enabled;
      if (bgmGain && ctx) {
        bgmGain.gain.setTargetAtTime(enabled ? 0.24 : 0, ctx.currentTime, 0.04);
      }
    },
    setIntensity(level: number) {
      intensity = Math.max(0, Math.min(1, level));
    },
    startBgm,
    stopBgm,
    playSelectTick(count: number, sum: number) {
      if (!sfxEnabled) return;
      const now = performance.now();
      if (now - lastSelectTickMs < 36) return;
      lastSelectTickMs = now;

      if (sum === 10) {
        // Crystal lock-on harmonic chime!
        playTone({
          target: 'sfx',
          freq: midiToFreq(84),
          type: 'sine',
          duration: 0.14,
          gain: 0.26,
        });
        playTone({
          target: 'sfx',
          freq: midiToFreq(91),
          type: 'triangle',
          duration: 0.18,
          gain: 0.2,
          delay: 0.025,
        });
        return;
      }

      if (sum > 10) {
        playTone({
          target: 'sfx',
          freq: 240,
          freqEnd: 185,
          type: 'triangle',
          duration: 0.07,
          gain: 0.14,
        });
        return;
      }

      const idx = Math.min(PENTATONIC_SCALE.length - 1, Math.max(0, count - 1));
      playTone({
        target: 'sfx',
        freq: midiToFreq(PENTATONIC_SCALE[idx]),
        type: 'sine',
        duration: 0.075,
        gain: 0.16,
      });
    },
    playClearPop(appleCount: number, combo: number, hasGolden: boolean) {
      if (!sfxEnabled) return;
      const baseIdx = Math.min(PENTATONIC_SCALE.length - 4, Math.max(0, combo - 1));
      const rootMidi = PENTATONIC_SCALE[baseIdx];
      // Juicy pop transient + sub thump
      playTone({
        target: 'sfx',
        freq: 210,
        freqEnd: 68,
        type: 'sine',
        duration: 0.13,
        gain: 0.34,
      });
      // Rising arcade chord arpeggio proportional to cleared apples
      const notes = Math.min(5, Math.max(2, appleCount));
      for (let i = 0; i < notes; i += 1) {
        const midi = rootMidi + [0, 4, 7, 12, 16][i];
        playTone({
          target: 'sfx',
          freq: midiToFreq(midi),
          type: i % 2 === 0 ? 'triangle' : 'sine',
          duration: 0.22,
          gain: 0.22,
          delay: i * 0.032,
        });
      }
      if (hasGolden) {
        // Golden shimmer bell cascade
        [88, 91, 95, 100].forEach((midi, idx) => {
          playTone({
            target: 'sfx',
            freq: midiToFreq(midi),
            type: 'sine',
            duration: 0.28,
            gain: 0.2,
            delay: 0.04 + idx * 0.04,
          });
        });
      }
    },
    playInvalidRelease() {
      if (!sfxEnabled) return;
      playTone({
        target: 'sfx',
        freq: 210,
        freqEnd: 135,
        type: 'triangle',
        duration: 0.09,
        gain: 0.14,
      });
    },
    playBoardRefill() {
      if (!sfxEnabled) return;
      [60, 64, 67, 72, 76, 79, 84].forEach((midi, idx) => {
        playTone({
          target: 'sfx',
          freq: midiToFreq(midi),
          type: 'triangle',
          duration: 0.18,
          gain: 0.2,
          delay: idx * 0.035,
        });
      });
    },
    playCountdownTick(secondsLeft: number) {
      if (!sfxEnabled) return;
      const high = secondsLeft <= 5;
      playTone({
        target: 'sfx',
        freq: high ? 988 : 740,
        type: 'sine',
        duration: 0.08,
        gain: high ? 0.22 : 0.14,
      });
    },
    playGameOver(isAllClear: boolean) {
      if (!sfxEnabled) return;
      const fanfare = isAllClear
        ? [72, 76, 79, 84, 88, 91, 96]
        : [79, 76, 72, 74, 72];
      fanfare.forEach((midi, idx) => {
        playTone({
          target: 'sfx',
          freq: midiToFreq(midi),
          type: isAllClear ? 'triangle' : 'sine',
          duration: idx === fanfare.length - 1 ? 0.5 : 0.18,
          gain: 0.24,
          delay: idx * 0.075,
        });
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopBgm();
      if (ctx) {
        void ctx.close().catch(() => {});
        ctx = null;
      }
      masterGain = null;
      bgmGain = null;
      sfxGain = null;
    },
  };
}
