/**
 * Procedural sound-effect recipes (Web Audio API). Pure synthesis: every sound is
 * built from oscillators, noise and filters at call time. Nothing here touches
 * the AudioContext until a recipe is invoked with a live {@link SfxEnv}.
 */

export type SfxName =
  | 'uiMove' | 'uiSelect' | 'uiBack' | 'uiError' | 'uiHover'
  | 'hit' | 'hitSuper' | 'hitWeak' | 'crit' | 'miss' | 'faint'
  | 'evolveCharge' | 'evolveBurst' | 'heal' | 'statUp' | 'statDown'
  | 'statusBurn' | 'statusPoison' | 'statusParalyze' | 'statusSleep' | 'statusFreeze' | 'statusConfuse'
  | 'timingPerfect' | 'timingGood' | 'timingMiss' | 'brace' | 'ready'
  | 'switchOut' | 'switchIn' | 'lowHp' | 'victory' | 'defeat' | 'whoosh' | 'charge' | 'shield';

export type FxPhase = 'cast' | 'travel' | 'impact';

export type MoveType =
  | 'NORMAL' | 'FIGHTING' | 'FLYING' | 'POISON' | 'GROUND' | 'ROCK' | 'BUG' | 'GHOST' | 'STEEL'
  | 'FIRE' | 'WATER' | 'GRASS' | 'ELECTRIC' | 'PSYCHIC' | 'ICE' | 'DRAGON' | 'DARK';

export const SFX_NAMES: readonly SfxName[] = [
  'uiMove', 'uiSelect', 'uiBack', 'uiError', 'uiHover',
  'hit', 'hitSuper', 'hitWeak', 'crit', 'miss', 'faint',
  'evolveCharge', 'evolveBurst', 'heal', 'statUp', 'statDown',
  'statusBurn', 'statusPoison', 'statusParalyze', 'statusSleep', 'statusFreeze', 'statusConfuse',
  'timingPerfect', 'timingGood', 'timingMiss', 'brace', 'ready',
  'switchOut', 'switchIn', 'lowHp', 'victory', 'defeat', 'whoosh', 'charge', 'shield',
];

export const MOVE_TYPES: readonly MoveType[] = [
  'NORMAL', 'FIGHTING', 'FLYING', 'POISON', 'GROUND', 'ROCK', 'BUG', 'GHOST', 'STEEL',
  'FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'PSYCHIC', 'ICE', 'DRAGON', 'DARK',
];

/** Where/when a recipe renders. `pitch` scales frequencies up and durations down (playback-rate style). */
export interface SfxEnv {
  ctx: BaseAudioContext;
  out: AudioNode;
  t: number;
  pitch: number;
}

// ---------------------------------------------------------------------------
// Shared per-context resources
// ---------------------------------------------------------------------------

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();
export function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (buf) return buf;
  const len = Math.floor(ctx.sampleRate * 2);
  buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseCache.set(ctx, buf);
  return buf;
}

const pulseCache = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();
/** Band-limited pulse wave with the given duty cycle (0.125 / 0.25 / 0.5 ...). */
export function getPulseWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  let m = pulseCache.get(ctx);
  if (!m) {
    m = new Map();
    pulseCache.set(ctx, m);
  }
  const hit = m.get(duty);
  if (hit) return hit;
  const n = 64;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) {
    real[k] = Math.sin(2 * Math.PI * k * duty) / (Math.PI * k);
    imag[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (Math.PI * k);
  }
  const w = ctx.createPeriodicWave(real, imag);
  m.set(duty, w);
  return w;
}

const shaperCache = new WeakMap<BaseAudioContext, Float32Array<ArrayBuffer>>();
function driveCurve(ctx: BaseAudioContext): Float32Array<ArrayBuffer> {
  let c = shaperCache.get(ctx);
  if (c) return c;
  const n = 512;
  c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 6) * 0.9;
  }
  shaperCache.set(ctx, c);
  return c;
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

type Shape = 'perc' | 'swell' | 'flat' | 'mid';

interface FilterOpts {
  type: BiquadFilterType;
  /** Single cutoff, or a path of cutoffs spread evenly across the duration (exponential). */
  f: number | number[];
  q?: number;
}

interface ToneOpts {
  type?: OscillatorType;
  /** Use a pulse wave with this duty instead of `type`. */
  duty?: number;
  /** Frequency, or a path of frequencies spread across `glide * dur`. */
  f: number | number[];
  glide?: number;
  lin?: boolean;
  at?: number;
  dur: number;
  vol: number;
  attack?: number;
  shape?: Shape;
  detune?: number;
  /** [rate Hz, depth cents] */
  vib?: [number, number];
  /** [rate Hz, depth 0..1] */
  trem?: [number, number];
  /** FM: [modulator ratio, index at start, index at end] */
  fm?: [number, number, number?];
  filter?: FilterOpts;
  dest?: AudioNode;
}

interface NoiseOpts {
  at?: number;
  dur: number;
  vol: number;
  attack?: number;
  shape?: Shape;
  filter?: FilterOpts;
  trem?: [number, number];
  drive?: boolean;
  dest?: AudioNode;
}

const clampF = (f: number) => Math.min(18000, Math.max(20, f));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;

function timeOf(e: SfxEnv, at = 0): number {
  return e.t + at / e.pitch;
}

function freqPath(p: AudioParam, vals: number[], t0: number, dur: number, scale: number, lin = false): void {
  const first = vals[0] ?? 440;
  p.setValueAtTime(clampF(first * scale), t0);
  const n = vals.length;
  for (let i = 1; i < n; i++) {
    const v = clampF((vals[i] ?? first) * scale);
    const t = t0 + (dur * i) / (n - 1);
    if (lin) p.linearRampToValueAtTime(v, t);
    else p.exponentialRampToValueAtTime(v, t);
  }
}

function envGain(ctx: BaseAudioContext, t0: number, dur: number, vol: number, attack: number, shape: Shape): GainNode {
  const g = ctx.createGain();
  const p = g.gain;
  const v = Math.max(0.0002, vol);
  const a = Math.min(attack, dur * 0.5);
  p.setValueAtTime(0.0001, t0);
  switch (shape) {
    case 'swell':
      p.exponentialRampToValueAtTime(v, t0 + dur * 0.85);
      p.linearRampToValueAtTime(0.0001, t0 + dur);
      break;
    case 'flat':
      p.linearRampToValueAtTime(v, t0 + a);
      p.setValueAtTime(v, t0 + dur * 0.75);
      p.exponentialRampToValueAtTime(0.0001, t0 + dur);
      break;
    case 'mid':
      p.linearRampToValueAtTime(v, t0 + dur * 0.4);
      p.exponentialRampToValueAtTime(0.0001, t0 + dur);
      break;
    default:
      p.linearRampToValueAtTime(v, t0 + a);
      p.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  return g;
}

function chainFilter(e: SfxEnv, node: AudioNode, f: FilterOpts | undefined, t0: number, dur: number): AudioNode {
  if (!f) return node;
  const bq = e.ctx.createBiquadFilter();
  bq.type = f.type;
  if (f.q !== undefined) bq.Q.value = f.q;
  freqPath(bq.frequency, Array.isArray(f.f) ? f.f : [f.f], t0, dur, e.pitch);
  node.connect(bq);
  return bq;
}

function chainTrem(e: SfxEnv, node: AudioNode, trem: [number, number] | undefined, t0: number, dur: number): AudioNode {
  if (!trem) return node;
  const g = e.ctx.createGain();
  g.gain.value = 1 - trem[1] / 2;
  const lfo = e.ctx.createOscillator();
  lfo.frequency.value = trem[0];
  const lg = e.ctx.createGain();
  lg.gain.value = trem[1] / 2;
  lfo.connect(lg);
  lg.connect(g.gain);
  lfo.start(t0);
  lfo.stop(t0 + dur + 0.05);
  node.connect(g);
  return g;
}

function tone(e: SfxEnv, o: ToneOpts): OscillatorNode {
  const { ctx } = e;
  const t0 = timeOf(e, o.at);
  const dur = Math.max(0.01, o.dur / e.pitch);
  const osc = ctx.createOscillator();
  if (o.duty) osc.setPeriodicWave(getPulseWave(ctx, o.duty));
  else osc.type = o.type ?? 'sine';
  const fs = Array.isArray(o.f) ? o.f : [o.f];
  freqPath(osc.frequency, fs, t0, dur * (o.glide ?? 1), e.pitch, o.lin);
  if (o.detune) osc.detune.value = o.detune;
  if (o.vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = o.vib[0];
    const lg = ctx.createGain();
    lg.gain.value = o.vib[1];
    lfo.connect(lg);
    lg.connect(osc.detune);
    lfo.start(t0);
    lfo.stop(t0 + dur + 0.05);
  }
  if (o.fm) {
    const [ratio, i0, i1 = i0] = o.fm;
    const mod = ctx.createOscillator();
    freqPath(mod.frequency, fs.map((f) => f * ratio), t0, dur * (o.glide ?? 1), e.pitch, o.lin);
    const mg = ctx.createGain();
    const f0 = (fs[0] ?? 440) * e.pitch;
    const fEnd = (fs[fs.length - 1] ?? 440) * e.pitch;
    mg.gain.setValueAtTime(i0 * f0, t0);
    mg.gain.linearRampToValueAtTime(i1 * fEnd, t0 + dur);
    mod.connect(mg);
    mg.connect(osc.frequency);
    mod.start(t0);
    mod.stop(t0 + dur + 0.05);
  }
  let node: AudioNode = chainFilter(e, osc, o.filter, t0, dur);
  node = chainTrem(e, node, o.trem, t0, dur);
  const g = envGain(ctx, t0, dur, o.vol, o.attack ?? 0.004, o.shape ?? 'perc');
  node.connect(g);
  g.connect(o.dest ?? e.out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  return osc;
}

function noise(e: SfxEnv, o: NoiseOpts): void {
  const { ctx } = e;
  const t0 = timeOf(e, o.at);
  const dur = Math.max(0.005, o.dur / e.pitch);
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  src.loop = true;
  let node: AudioNode = src;
  if (o.drive) {
    const ws = ctx.createWaveShaper();
    ws.curve = driveCurve(ctx);
    node.connect(ws);
    node = ws;
  }
  node = chainFilter(e, node, o.filter, t0, dur);
  node = chainTrem(e, node, o.trem, t0, dur);
  const g = envGain(ctx, t0, dur, o.vol, o.attack ?? 0.002, o.shape ?? 'perc');
  node.connect(g);
  g.connect(o.dest ?? e.out);
  src.start(t0, Math.random() * 1.5);
  src.stop(t0 + dur + 0.05);
}

// --- composite helpers ------------------------------------------------------

function thump(e: SfxEnv, at: number, f0: number, f1: number, dur: number, vol: number): void {
  tone(e, { f: [f0, f1], glide: 0.6, at, dur, vol, attack: 0.002 });
}

function crackle(e: SfxEnv, at: number, dur: number, n: number, vol: number): void {
  for (let i = 0; i < n; i++) {
    noise(e, {
      at: at + Math.random() * dur,
      dur: rand(0.004, 0.016),
      vol: vol * rand(0.35, 1),
      attack: 0.001,
      filter: { type: 'bandpass', f: rand(1500, 6000), q: 1.2 },
    });
  }
}

function bubbles(e: SfxEnv, at: number, dur: number, n: number, lo: number, hi: number, vol: number): void {
  for (let i = 0; i < n; i++) {
    const f = rand(lo, hi);
    tone(e, { f: [f, f * rand(1.8, 2.6)], at: at + Math.random() * dur, dur: rand(0.04, 0.08), vol: vol * rand(0.5, 1), attack: 0.004 });
  }
}

function sparkle(e: SfxEnv, at: number, dur: number, n: number, lo: number, hi: number, vol: number): void {
  for (let i = 0; i < n; i++) {
    tone(e, { f: rand(lo, hi), at: at + Math.random() * dur, dur: rand(0.1, 0.3), vol: vol * rand(0.4, 1), attack: 0.002 });
  }
}

const BELL = [1, 2.76, 5.4, 8.93];
function bell(e: SfxEnv, at: number, f: number, dur: number, vol: number, ratios: readonly number[] = BELL): void {
  ratios.forEach((r, i) => {
    tone(e, { f: f * r, at, dur: dur / (1 + i * 0.6), vol: vol / (1 + i * 0.9), attack: 0.002 });
  });
}

function zap(e: SfxEnv, at: number, dur: number, lo: number, hi: number, vol: number, step = 0.018, duty = 0.25): void {
  const osc = tone(e, { duty, f: lo, at, dur, vol, shape: 'flat', attack: 0.003 });
  const t0 = timeOf(e, at);
  for (let s = step; s < dur; s += step) {
    osc.frequency.setValueAtTime(clampF(rand(lo, hi) * e.pitch), t0 + s / e.pitch);
  }
}

function whoosh(e: SfxEnv, at: number, dur: number, lo: number, hi: number, vol: number, q = 1.4): void {
  noise(e, { at, dur, vol, shape: 'mid', filter: { type: 'bandpass', f: [lo, hi, lo * 1.4], q } });
}

/** Sequence of short notes (arpeggio / jingle). */
function notes(e: SfxEnv, freqs: readonly number[], gap: number, dur: number, vol: number, duty?: number, type: OscillatorType = 'square', at = 0): void {
  freqs.forEach((f, i) => {
    if (duty) tone(e, { duty, f, at: at + i * gap, dur, vol, shape: 'flat' });
    else tone(e, { type, f, at: at + i * gap, dur, vol, shape: 'flat' });
  });
}

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------------------
// General / UI / battle sounds
// ---------------------------------------------------------------------------

const SFX: Record<SfxName, (e: SfxEnv) => void> = {
  uiHover: (e) => tone(e, { type: 'triangle', f: 1760, dur: 0.035, vol: 0.12 }),
  uiMove: (e) => tone(e, { duty: 0.25, f: 1318, dur: 0.045, vol: 0.18, shape: 'flat' }),
  uiSelect: (e) => notes(e, [880, 1318], 0.05, 0.06, 0.2, 0.25),
  uiBack: (e) => notes(e, [987, 659], 0.05, 0.06, 0.18, 0.25),
  uiError: (e) => {
    tone(e, { duty: 0.5, f: 150, dur: 0.09, vol: 0.2, shape: 'flat', filter: { type: 'lowpass', f: 1800 } });
    tone(e, { duty: 0.5, f: 140, at: 0.11, dur: 0.12, vol: 0.2, shape: 'flat', filter: { type: 'lowpass', f: 1800 } });
  },

  hit: (e) => {
    thump(e, 0, 170, 50, 0.16, 0.9);
    noise(e, { dur: 0.14, vol: 0.55, filter: { type: 'lowpass', f: [3500, 500] } });
    noise(e, { dur: 0.03, vol: 0.3, filter: { type: 'highpass', f: 3000 } });
  },
  hitSuper: (e) => {
    thump(e, 0, 220, 38, 0.34, 1.0);
    thump(e, 0.06, 120, 35, 0.3, 0.7);
    noise(e, { dur: 0.32, vol: 0.75, drive: true, filter: { type: 'lowpass', f: [6000, 400] } });
    noise(e, { dur: 0.07, vol: 0.45, filter: { type: 'highpass', f: 4000 } });
    tone(e, { type: 'square', f: [260, 55], dur: 0.25, vol: 0.25, filter: { type: 'lowpass', f: 1500 } });
    crackle(e, 0.02, 0.2, 8, 0.25);
  },
  hitWeak: (e) => {
    thump(e, 0, 120, 70, 0.12, 0.5);
    noise(e, { dur: 0.1, vol: 0.35, filter: { type: 'lowpass', f: 700 } });
  },
  crit: (e) => {
    noise(e, { dur: 0.05, vol: 0.6, filter: { type: 'highpass', f: 2500 } });
    thump(e, 0, 240, 40, 0.3, 1.0);
    noise(e, { dur: 0.26, vol: 0.6, drive: true, filter: { type: 'lowpass', f: [7000, 600] } });
    bell(e, 0.02, 1760, 0.45, 0.16, [1, 1.5, 2.76]);
    tone(e, { duty: 0.125, f: [1400, 2800], dur: 0.12, vol: 0.12 });
  },
  miss: (e) => {
    whoosh(e, 0, 0.32, 500, 2600, 0.35, 2);
    tone(e, { type: 'triangle', f: [700, 380], dur: 0.2, vol: 0.12, at: 0.1 });
  },
  faint: (e) => {
    tone(e, { duty: 0.25, f: [620, 70], dur: 1.0, vol: 0.22, lin: false, shape: 'flat', vib: [9, 30] });
    noise(e, { at: 0.5, dur: 0.6, vol: 0.4, filter: { type: 'lowpass', f: [600, 120] } });
    thump(e, 0.75, 90, 35, 0.4, 0.8);
  },

  evolveCharge: (e) => {
    const D = 2.5;
    tone(e, { type: 'sine', f: [220, 880], dur: D, vol: 0.18, shape: 'swell', trem: [10, 0.6] });
    tone(e, { type: 'triangle', f: [330, 1320], dur: D, vol: 0.12, shape: 'swell', detune: 8, vib: [6, 20] });
    tone(e, { duty: 0.125, f: [440, 1760], dur: D, vol: 0.06, shape: 'swell', trem: [16, 0.8] });
    noise(e, { dur: D, vol: 0.22, shape: 'swell', filter: { type: 'bandpass', f: [800, 7000], q: 2 } });
    // sparkles accelerating towards the end
    for (let i = 0; i < 28; i++) {
      const x = Math.sqrt(i / 28);
      tone(e, { f: rand(1500, 2500) * (1 + x), at: x * D, dur: 0.15, vol: 0.05 + 0.08 * x, attack: 0.002 });
    }
  },
  evolveBurst: (e) => {
    // Big bright chord (C major add9 over many octaves), filter opens then closes.
    const chord = [48, 55, 60, 64, 67, 72, 74, 76, 79, 84];
    chord.forEach((m, i) => {
      tone(e, {
        type: i % 2 ? 'sawtooth' : 'square',
        f: mtof(m),
        dur: 1.8,
        vol: 0.07,
        attack: 0.01,
        detune: rand(-8, 8),
        filter: { type: 'lowpass', f: [800, 9000, 1500], q: 2 },
      });
    });
    thump(e, 0, 160, 30, 0.8, 1.0);
    noise(e, { dur: 1.2, vol: 0.55, filter: { type: 'highpass', f: [2500, 6000] } });
    noise(e, { dur: 0.35, vol: 0.5, filter: { type: 'lowpass', f: [5000, 300] } });
    sparkle(e, 0.05, 1.2, 22, 2000, 5000, 0.1);
  },
  heal: (e) => {
    notes(e, [1047, 1319, 1568, 2093, 2637], 0.07, 0.22, 0.12, undefined, 'triangle');
    notes(e, [1047, 1319, 1568, 2093], 0.07, 0.18, 0.05, 0.125, 'square', 0.035);
    sparkle(e, 0.1, 0.5, 8, 2500, 4500, 0.05);
  },
  statUp: (e) => {
    for (let i = 0; i < 3; i++) tone(e, { duty: 0.25, f: [400 + i * 150, 1200 + i * 300], at: i * 0.11, dur: 0.12, vol: 0.14 });
    tone(e, { type: 'triangle', f: 1568, at: 0.33, dur: 0.2, vol: 0.12 });
  },
  statDown: (e) => {
    for (let i = 0; i < 3; i++) tone(e, { duty: 0.25, f: [1300 - i * 250, 400 - i * 80], at: i * 0.12, dur: 0.13, vol: 0.14 });
  },

  statusBurn: (e) => {
    noise(e, { dur: 0.5, vol: 0.35, shape: 'mid', filter: { type: 'bandpass', f: [600, 2000, 900], q: 0.8 } });
    crackle(e, 0, 0.5, 14, 0.35);
  },
  statusPoison: (e) => {
    bubbles(e, 0, 0.45, 9, 250, 650, 0.2);
    noise(e, { dur: 0.45, vol: 0.18, shape: 'mid', filter: { type: 'lowpass', f: 500 }, trem: [14, 0.8] });
  },
  statusParalyze: (e) => {
    zap(e, 0, 0.35, 150, 1400, 0.14, 0.022, 0.5);
    noise(e, { dur: 0.35, vol: 0.2, filter: { type: 'highpass', f: 3000 }, trem: [30, 1] });
  },
  statusSleep: (e) => {
    tone(e, { type: 'triangle', f: [523, 392], dur: 0.35, vol: 0.14, vib: [5, 25], shape: 'flat' });
    tone(e, { type: 'triangle', f: [440, 330], at: 0.35, dur: 0.45, vol: 0.12, vib: [5, 25], shape: 'flat' });
  },
  statusFreeze: (e) => {
    noise(e, { dur: 0.06, vol: 0.45, filter: { type: 'highpass', f: 4000 } });
    bell(e, 0.02, 2093, 0.7, 0.1, [1, 2.4, 3.9]);
    bell(e, 0.09, 2637, 0.6, 0.08, [1, 2.4, 3.9]);
    sparkle(e, 0.05, 0.4, 6, 3000, 6000, 0.06);
  },
  statusConfuse: (e) => {
    for (let i = 0; i < 4; i++) {
      const up = i % 2 === 0;
      tone(e, { type: 'triangle', f: up ? [700, 1100] : [1100, 700], at: i * 0.12, dur: 0.12, vol: 0.13, vib: [18, 60] });
    }
  },

  timingPerfect: (e) => {
    notes(e, [1319, 1661, 1976, 2637], 0.045, 0.2, 0.14, 0.125);
    notes(e, [1319, 1661, 1976, 2637], 0.045, 0.3, 0.12, undefined, 'sine');
    tone(e, { type: 'sine', f: 3951, at: 0.18, dur: 0.4, vol: 0.08 });
    sparkle(e, 0.12, 0.3, 5, 3500, 6000, 0.05);
  },
  timingGood: (e) => {
    notes(e, [1047, 1568], 0.06, 0.16, 0.14, 0.25);
  },
  timingMiss: (e) => {
    tone(e, { duty: 0.5, f: [240, 110], dur: 0.22, vol: 0.2, filter: { type: 'lowpass', f: 900 } });
  },
  brace: (e) => {
    thump(e, 0, 140, 60, 0.18, 0.7);
    bell(e, 0, 880, 0.3, 0.12, [1, 1.52, 2.83]);
    noise(e, { dur: 0.05, vol: 0.3, filter: { type: 'bandpass', f: 2500, q: 2 } });
  },
  ready: (e) => {
    notes(e, [1568, 2093], 0.08, 0.12, 0.13, 0.25);
  },
  switchOut: (e) => {
    tone(e, { duty: 0.25, f: [1200, 180], dur: 0.35, vol: 0.14 });
    whoosh(e, 0, 0.35, 2500, 600, 0.25, 1.5);
  },
  switchIn: (e) => {
    tone(e, { duty: 0.25, f: [180, 1200], dur: 0.3, vol: 0.14 });
    noise(e, { at: 0.28, dur: 0.08, vol: 0.4, filter: { type: 'bandpass', f: 1500, q: 1 } });
    thump(e, 0.28, 180, 60, 0.12, 0.5);
  },
  lowHp: (e) => tone(e, { duty: 0.5, f: 988, dur: 0.09, vol: 0.12, shape: 'flat' }),
  victory: (e) => notes(e, [523, 659, 784, 1047], 0.08, 0.14, 0.15, 0.25),
  defeat: (e) => notes(e, [392, 370, 349, 330], 0.14, 0.2, 0.14, undefined, 'triangle'),
  whoosh: (e) => whoosh(e, 0, 0.35, 400, 3000, 0.4),
  charge: (e) => {
    tone(e, { type: 'sawtooth', f: [110, 440], dur: 0.8, vol: 0.12, shape: 'swell', trem: [14, 0.5], filter: { type: 'lowpass', f: [400, 3500], q: 4 } });
    noise(e, { dur: 0.8, vol: 0.18, shape: 'swell', filter: { type: 'bandpass', f: [500, 4000], q: 3 } });
  },
  shield: (e) => {
    [880, 1320, 1760].forEach((f, i) => tone(e, { type: 'sine', f, dur: 0.6, vol: 0.09, detune: (i - 1) * 7, vib: [7, 12], attack: 0.02 }));
    tone(e, { type: 'triangle', f: [300, 900], dur: 0.12, vol: 0.12 });
    noise(e, { dur: 0.4, vol: 0.15, filter: { type: 'highpass', f: 5000 } });
  },
};

export function renderSfx(name: SfxName, e: SfxEnv): void {
  const fn = SFX[name];
  if (fn) fn(e);
}

// ---------------------------------------------------------------------------
// Elemental move sounds. Each recipe gets v (volume scale), L (length scale), k (raw intensity 0..1).
// ---------------------------------------------------------------------------

type Recipe = (e: SfxEnv, v: number, L: number, k: number) => void;
type Phases = Record<FxPhase, Recipe>;

/** Adds a sub boom to large impacts. */
function bigBoom(e: SfxEnv, k: number): void {
  if (k > 0.6) {
    thump(e, 0.012, 90, 28, 0.5 + k * 0.4, 0.35 + (k - 0.6) * 0.8);
    noise(e, { dur: 0.6 * k, vol: 0.3 * k, filter: { type: 'lowpass', f: [1200, 150] } });
  }
}

const MOVES: Record<MoveType, Phases> = {
  NORMAL: {
    cast: (e, v, L) => whoosh(e, 0, 0.3 * L, 300, 1500, 0.25 * v),
    travel: (e, v, L) => whoosh(e, 0, 0.35 * L, 500, 2600, 0.35 * v),
    impact: (e, v, L, k) => {
      thump(e, 0, 170, 48, 0.2 * L, 0.85 * v);
      noise(e, { dur: 0.16 * L, vol: 0.45 * v, filter: { type: 'lowpass', f: [3000, 400] } });
      bigBoom(e, k);
    },
  },
  FIGHTING: {
    cast: (e, v, L) => {
      whoosh(e, 0, 0.2 * L, 250, 1200, 0.25 * v, 1);
      tone(e, { type: 'sawtooth', f: [90, 140], dur: 0.2 * L, vol: 0.1 * v, filter: { type: 'lowpass', f: 600 } });
    },
    travel: (e, v, L) => whoosh(e, 0, 0.25 * L, 600, 3500, 0.4 * v, 1.8),
    impact: (e, v, L, k) => {
      noise(e, { dur: 0.05, vol: 0.6 * v, filter: { type: 'lowpass', f: 3000 } });
      thump(e, 0, 200, 42, 0.2 * L, 1.0 * v);
      tone(e, { duty: 0.5, f: [300, 60], dur: 0.08, vol: 0.2 * v, filter: { type: 'lowpass', f: 1200 } });
      noise(e, { at: 0.01, dur: 0.12 * L, vol: 0.35 * v, drive: true, filter: { type: 'lowpass', f: [2500, 300] } });
      bigBoom(e, k);
    },
  },
  FLYING: {
    cast: (e, v, L) => noise(e, { dur: 0.6 * L, vol: 0.35 * v, shape: 'mid', filter: { type: 'bandpass', f: [500, 1600, 700], q: 3 } }),
    travel: (e, v, L) => {
      whoosh(e, 0, 0.35 * L, 700, 3200, 0.45 * v, 2.5);
      whoosh(e, 0.05, 0.3 * L, 1200, 4500, 0.2 * v, 4);
    },
    impact: (e, v, L, k) => {
      noise(e, { dur: 0.3 * L, vol: 0.5 * v, filter: { type: 'bandpass', f: [3000, 600], q: 1 } });
      thump(e, 0, 150, 60, 0.12, 0.5 * v);
      noise(e, { dur: 0.04, vol: 0.35 * v, filter: { type: 'highpass', f: 3500 } });
      bigBoom(e, k);
    },
  },
  POISON: {
    cast: (e, v, L) => {
      bubbles(e, 0, 0.5 * L, 10, 150, 420, 0.2 * v);
      noise(e, { dur: 0.5 * L, vol: 0.2 * v, shape: 'mid', filter: { type: 'lowpass', f: 450 }, trem: [12, 0.9] });
    },
    travel: (e, v, L) => {
      tone(e, { type: 'sine', f: [180, 320], dur: 0.45 * L, vol: 0.22 * v, vib: [18, 250], shape: 'mid' });
      bubbles(e, 0, 0.4 * L, 6, 200, 500, 0.14 * v);
    },
    impact: (e, v, L, k) => {
      noise(e, { dur: 0.25 * L, vol: 0.5 * v, filter: { type: 'lowpass', f: [2500, 250] } });
      thump(e, 0, 140, 50, 0.18, 0.6 * v);
      bubbles(e, 0.05, 0.45 * L, 12, 150, 500, 0.2 * v);
      bigBoom(e, k);
    },
  },
  GROUND: {
    cast: (e, v, L) => {
      noise(e, { dur: 0.6 * L, vol: 0.5 * v, shape: 'swell', filter: { type: 'lowpass', f: [120, 300] } });
      tone(e, { type: 'sine', f: [35, 55], dur: 0.6 * L, vol: 0.4 * v, shape: 'swell' });
    },
    travel: (e, v, L) => {
      noise(e, { dur: 0.5 * L, vol: 0.55 * v, shape: 'mid', filter: { type: 'lowpass', f: [200, 500, 200] } });
      for (let i = 0; i < 3; i++) thump(e, i * 0.13 * L, 90, 40, 0.15, 0.35 * v);
    },
    impact: (e, v, L, k) => {
      thump(e, 0, 100, 28, 0.6 * L, 1.0 * v);
      noise(e, { dur: 0.9 * L, vol: 0.6 * v, filter: { type: 'lowpass', f: [700, 90] } });
      crackle(e, 0.05, 0.4, 6, 0.15 * v);
      bigBoom(e, k);
    },
  },
  ROCK: {
    cast: (e, v, L) => {
      noise(e, { dur: 0.45 * L, vol: 0.35 * v, shape: 'mid', filter: { type: 'lowpass', f: 350 } });
      for (let i = 0; i < 6; i++) tone(e, { type: 'triangle', f: rand(300, 700), at: Math.random() * 0.4 * L, dur: 0.04, vol: 0.12 * v });
    },
    travel: (e, v, L) => {
      whoosh(e, 0, 0.4 * L, 200, 1000, 0.35 * v, 1);
      for (let i = 0; i < 3; i++) thump(e, i * 0.12 * L, 130, 60, 0.1, 0.35 * v);
    },
    impact: (e, v, L, k) => {
      thump(e, 0, 140, 38, 0.35 * L, 1.0 * v);
      noise(e, { dur: 0.35 * L, vol: 0.6 * v, drive: true, filter: { type: 'lowpass', f: [2500, 200] } });
      for (let i = 0; i < 8; i++) tone(e, { type: 'triangle', f: rand(250, 900), at: 0.03 + Math.random() * 0.3 * L, dur: 0.05, vol: 0.14 * v });
      bigBoom(e, k);
    },
  },
  BUG: {
    cast: (e, v, L) =>
      tone(e, { type: 'sawtooth', f: [170, 200], dur: 0.5 * L, vol: 0.2 * v, trem: [32, 0.9], shape: 'mid', filter: { type: 'bandpass', f: 1300, q: 2 } }),
    travel: (e, v, L) =>
      tone(e, { type: 'sawtooth', f: [220, 340], dur: 0.4 * L, vol: 0.22 * v, trem: [40, 0.9], vib: [12, 80], shape: 'mid', filter: { type: 'bandpass', f: 1600, q: 2 } }),
    impact: (e, v, L, k) => {
      thump(e, 0, 150, 55, 0.15, 0.7 * v);
      tone(e, { type: 'sawtooth', f: [320, 180], dur: 0.25 * L, vol: 0.22 * v, trem: [45, 1], filter: { type: 'bandpass', f: 1500, q: 1.5 } });
      crackle(e, 0, 0.25 * L, 10, 0.25 * v);
      bigBoom(e, k);
    },
  },
  GHOST: {
    cast: (e, v, L) => {
      tone(e, { type: 'triangle', f: [700, 350], dur: 0.8 * L, vol: 0.16 * v, detune: -22, vib: [5, 40], shape: 'mid' });
      tone(e, { type: 'triangle', f: [705, 345], dur: 0.8 * L, vol: 0.16 * v, detune: 22, vib: [4.3, 50], shape: 'mid' });
    },
    travel: (e, v, L) => {
      tone(e, { type: 'sine', f: [900, 400], dur: 0.45 * L, vol: 0.18 * v, detune: 30, vib: [7, 80], shape: 'mid' });
      noise(e, { dur: 0.45 * L, vol: 0.12 * v, shape: 'mid', filter: { type: 'bandpass', f: [3000, 1500], q: 3 } });
    },
    impact: (e, v, L, k) => {
      tone(e, { type: 'triangle', f: [420, 90], dur: 0.6 * L, vol: 0.3 * v, detune: 25, vib: [6, 60] });
      tone(e, { type: 'triangle', f: [400, 85], dur: 0.6 * L, vol: 0.3 * v, detune: -25, vib: [5, 60] });
      noise(e, { dur: 0.3 * L, vol: 0.35 * v, filter: { type: 'lowpass', f: [1800, 200] } });
      bigBoom(e, k);
    },
  },
  STEEL: {
    cast: (e, v, L) => {
      bell(e, 0, 520, 0.8 * L, 0.14 * v);
      tone(e, { type: 'sine', f: [1040, 1560], dur: 0.6 * L, vol: 0.06 * v, shape: 'swell' });
    },
    travel: (e, v, L) => {
      noise(e, { dur: 0.35 * L, vol: 0.3 * v, shape: 'mid', filter: { type: 'bandpass', f: [2000, 5000], q: 8 } });
      bell(e, 0.05, 1200, 0.35 * L, 0.07 * v);
    },
    impact: (e, v, L, k) => {
      bell(e, 0, 380, 0.9 * L, 0.3 * v, [1, 2.76, 5.4, 8.93, 13.3]);
      noise(e, { dur: 0.08, vol: 0.5 * v, filter: { type: 'highpass', f: 3500 } });
      thump(e, 0, 170, 50, 0.15, 0.7 * v);
      bigBoom(e, k);
    },
  },
  FIRE: {
    cast: (e, v, L) => {
      noise(e, { dur: 0.5 * L, vol: 0.4 * v, shape: 'swell', filter: { type: 'lowpass', f: [400, 2800], q: 1 } });
      crackle(e, 0.1, 0.4 * L, 10, 0.3 * v);
    },
    travel: (e, v, L) => {
      noise(e, { dur: 0.45 * L, vol: 0.45 * v, shape: 'mid', filter: { type: 'bandpass', f: [700, 3000, 1200], q: 0.9 } });
      crackle(e, 0, 0.45 * L, 12, 0.28 * v);
    },
    impact: (e, v, L, k) => {
      noise(e, { dur: 0.55 * L, vol: 0.7 * v, filter: { type: 'lowpass', f: [4500, 300] } });
      thump(e, 0, 150, 45, 0.25, 0.7 * v);
      crackle(e, 0, 0.6 * L, 22, 0.35 * v);
      bigBoom(e, k);
    },
  },
  WATER: {
    cast: (e, v, L) => bubbles(e, 0, 0.4 * L, 9, 300, 800, 0.2 * v),
    travel: (e, v, L) => {
      noise(e, { dur: 0.45 * L, vol: 0.35 * v, shape: 'mid', filter: { type: 'bandpass', f: [900, 1800, 1100], q: 2 } });
      tone(e, { type: 'sine', f: [400, 700], dur: 0.45 * L, vol: 0.12 * v, vib: [14, 200], shape: 'mid' });
      bubbles(e, 0, 0.4 * L, 5, 400, 900, 0.12 * v);
    },
    impact: (e, v, L, k) => {
      noise(e, { dur: 0.5 * L, vol: 0.6 * v, filter: { type: 'highpass', f: [1500, 400] } });
      noise(e, { dur: 0.25 * L, vol: 0.4 * v, filter: { type: 'lowpass', f: [2000, 300] } });
      thump(e, 0, 130, 50, 0.2, 0.6 * v);
      bubbles(e, 0.05, 0.5 * L, 12, 300, 900, 0.18 * v);
      bigBoom(e, k);
    },
  },
  GRASS: {
    cast: (e, v, L) => {
      noise(e, { dur: 0.5 * L, vol: 0.3 * v, shape: 'mid', trem: [22, 0.8], filter: { type: 'bandpass', f: 3200, q: 1 } });
      tone(e, { type: 'sine', f: [784, 1175], dur: 0.5 * L, vol: 0.08 * v, shape: 'swell' });
    },
    travel: (e, v, L) => {
      whoosh(e, 0, 0.4 * L, 2000, 5500, 0.3 * v, 1.2);
      tone(e, { type: 'triangle', f: [880, 1320], dur: 0.35 * L, vol: 0.07 * v, shape: 'mid' });
      tone(e, { type: 'triangle', f: [1320, 1980], dur: 0.35 * L, vol: 0.05 * v, shape: 'mid' });
    },
    impact: (e, v, L, k) => {
      noise(e, { dur: 0.3 * L, vol: 0.45 * v, trem: [30, 0.7], filter: { type: 'bandpass', f: [4000, 1800], q: 1 } });
      thump(e, 0, 140, 60, 0.14, 0.5 * v);
      tone(e, { type: 'triangle', f: 1047, dur: 0.3, vol: 0.08 * v });
      tone(e, { type: 'triangle', f: 1568, at: 0.04, dur: 0.3, vol: 0.07 * v });
      bigBoom(e, k);
    },
  },
  ELECTRIC: {
    cast: (e, v, L) => {
      zap(e, 0, 0.4 * L, 200, 1600, 0.12 * v, 0.02, 0.5);
      noise(e, { dur: 0.4 * L, vol: 0.18 * v, trem: [35, 1], filter: { type: 'highpass', f: 3500 } });
    },
    travel: (e, v, L) => {
      zap(e, 0, 0.35 * L, 500, 2600, 0.13 * v, 0.014, 0.25);
      tone(e, { type: 'sawtooth', f: [1800, 600], dur: 0.35 * L, vol: 0.06 * v, trem: [50, 1] });
    },
    impact: (e, v, L, k) => {
      zap(e, 0, 0.35 * L, 100, 2400, 0.18 * v, 0.012, 0.5);
      zap(e, 0.02, 0.3 * L, 300, 3000, 0.1 * v, 0.017, 0.125);
      noise(e, { dur: 0.3 * L, vol: 0.5 * v, filter: { type: 'highpass', f: [5000, 1500] } });
      thump(e, 0, 170, 50, 0.18, 0.7 * v);
      bigBoom(e, k);
    },
  },
  PSYCHIC: {
    cast: (e, v, L) => {
      tone(e, { type: 'sine', f: [300, 600], dur: 0.7 * L, vol: 0.16 * v, fm: [1.5, 0.5, 3], vib: [6, 60], shape: 'swell' });
      tone(e, { type: 'sine', f: [302, 606], dur: 0.7 * L, vol: 0.1 * v, vib: [4, 40], shape: 'swell' });
    },
    travel: (e, v, L) => tone(e, { type: 'sine', f: [300, 900], dur: 0.45 * L, vol: 0.2 * v, fm: [2, 2, 0.5], vib: [12, 120], shape: 'mid' }),
    impact: (e, v, L, k) => {
      tone(e, { type: 'sine', f: [500, 150], dur: 0.5 * L, vol: 0.3 * v, fm: [1.41, 4, 0.2] });
      tone(e, { type: 'triangle', f: [1000, 300], dur: 0.4 * L, vol: 0.12 * v, vib: [9, 100] });
      noise(e, { dur: 0.2, vol: 0.25 * v, filter: { type: 'bandpass', f: [4000, 800], q: 2 } });
      bigBoom(e, k);
    },
  },
  ICE: {
    cast: (e, v, L) => {
      [2093, 2637, 3136, 3951].forEach((f, i) => bell(e, i * 0.09 * L, f, 0.6 * L, 0.07 * v, [1, 2.4]));
    },
    travel: (e, v, L) => {
      noise(e, { dur: 0.4 * L, vol: 0.22 * v, shape: 'mid', filter: { type: 'highpass', f: [6000, 3500] } });
      tone(e, { type: 'sine', f: [3200, 1600], dur: 0.4 * L, vol: 0.08 * v, vib: [20, 40] });
    },
    impact: (e, v, L, k) => {
      noise(e, { dur: 0.07, vol: 0.55 * v, filter: { type: 'highpass', f: 3000 } });
      thump(e, 0, 160, 60, 0.12, 0.5 * v);
      for (let i = 0; i < 10; i++) tone(e, { f: rand(2500, 6500), at: Math.random() * 0.25 * L, dur: rand(0.08, 0.25), vol: 0.07 * v });
      bell(e, 0.02, pick([1760, 2093]), 0.8 * L, 0.1 * v, [1, 2.4, 3.9]);
      bigBoom(e, k);
    },
  },
  DRAGON: {
    cast: (e, v, L) => {
      tone(e, { type: 'sawtooth', f: [70, 95], dur: 0.6 * L, vol: 0.28 * v, trem: [24, 0.8], shape: 'swell', filter: { type: 'lowpass', f: [300, 1200], q: 3 } });
      noise(e, { dur: 0.6 * L, vol: 0.18 * v, shape: 'swell', filter: { type: 'bandpass', f: [300, 900], q: 2 } });
    },
    travel: (e, v, L) => {
      noise(e, { dur: 0.5 * L, vol: 0.45 * v, shape: 'mid', drive: true, filter: { type: 'bandpass', f: [400, 1100, 600], q: 1.5 } });
      tone(e, { type: 'sawtooth', f: [120, 80], dur: 0.5 * L, vol: 0.2 * v, trem: [30, 0.7], filter: { type: 'lowpass', f: 900 } });
    },
    impact: (e, v, L, k) => {
      noise(e, { dur: 0.6 * L, vol: 0.55 * v, drive: true, filter: { type: 'bandpass', f: [900, 300], q: 1 } });
      tone(e, { type: 'sawtooth', f: [95, 40], dur: 0.6 * L, vol: 0.3 * v, trem: [20, 0.6], filter: { type: 'lowpass', f: 800 } });
      thump(e, 0, 150, 32, 0.4 * L, 1.0 * v);
      bigBoom(e, k);
    },
  },
  DARK: {
    cast: (e, v, L) => {
      noise(e, { dur: 0.6 * L, vol: 0.25 * v, shape: 'swell', filter: { type: 'bandpass', f: [1500, 3500], q: 0.6 } });
      tone(e, { type: 'sine', f: [55, 65], dur: 0.6 * L, vol: 0.35 * v, shape: 'swell' });
    },
    travel: (e, v, L) => {
      noise(e, { dur: 0.4 * L, vol: 0.3 * v, shape: 'mid', filter: { type: 'bandpass', f: [2500, 900], q: 1 } });
      tone(e, { type: 'sawtooth', f: [110, 70], dur: 0.4 * L, vol: 0.12 * v, filter: { type: 'lowpass', f: 500 } });
    },
    impact: (e, v, L, k) => {
      noise(e, { dur: 0.08, vol: 0.6 * v, drive: true, filter: { type: 'bandpass', f: 1800, q: 0.8 } });
      noise(e, { at: 0.07, dur: 0.1, vol: 0.45 * v, drive: true, filter: { type: 'bandpass', f: 1100, q: 0.8 } });
      thump(e, 0, 160, 40, 0.25 * L, 0.9 * v);
      tone(e, { duty: 0.5, f: [85, 40], dur: 0.3 * L, vol: 0.2 * v, filter: { type: 'lowpass', f: 600 } });
      bigBoom(e, k);
    },
  },
};

export function renderMoveSfx(type: string, phase: FxPhase, intensity: number, e: SfxEnv): void {
  const key = (type || 'NORMAL').toUpperCase() as MoveType;
  const phases = MOVES[key] ?? MOVES.NORMAL;
  const fn = phases[phase];
  if (!fn) return;
  const k = Math.min(1, Math.max(0, Number.isFinite(intensity) ? intensity : 0.5));
  fn(e, 0.55 + 0.45 * k, 0.75 + 0.6 * k, k);
}
