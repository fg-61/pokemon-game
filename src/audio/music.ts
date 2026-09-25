/**
 * Tiny chiptune step sequencer + original procedural songs.
 *
 * Channels (GBA/NES-style): lead pulse, harmony/arp pulse, triangle bass, noise drums.
 * Songs are pure data (see SONGS below) compiled into a flat 16th-note step grid,
 * then played by a lookahead scheduler driven from AudioContext time.
 * All compositions here are original.
 */
import { getNoiseBuffer, getPulseWave } from './sfx';

export type TrackName = 'title' | 'select' | 'battle' | 'boss' | 'gym' | 'champion' | 'victory' | 'defeat';

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1;
const STEPS_PER_BAR = 16;

// ---------------------------------------------------------------------------
// Song data model
// ---------------------------------------------------------------------------

type BassStyle = 'drive' | 'octave' | 'gallop' | 'bounce' | 'walk' | 'hold' | 'none';
type ArpStyle = 'arp16' | 'arp8' | 'stab' | 'pad' | 'none';
type LeadWave = 0.125 | 0.25 | 0.5 | 'triangle';
type DrumKind = 'kick' | 'snare' | 'hat' | 'ohat' | 'crash' | 'tomH' | 'tomM' | 'tomL';

interface Section {
  /** One chord per bar; `|` splits a bar evenly ("Bb|C"). Qualities: '' m 5 7 m7 maj7 dim aug sus2 sus4. */
  chords: string[];
  /** One string per bar: "NOTE:len" tokens in 16th steps, `r` = rest (e.g. "C5:4 r:2 E5:2 ..."). Must total 16. */
  lead: string[];
  /**
   * Drum bar pattern (16 chars, spaces ignored) or one pattern per bar (cycled).
   * k kick, s snare, h hat, o open hat, c crash+kick, x kick+hat, z snare+hat, t/m/l toms, '.' rest.
   */
  drums: string | string[];
  /** Replaces the drum pattern on the section's last bar. */
  fill?: string;
  /** Crash on the downbeat of the section. */
  crash?: boolean;
  bass: BassStyle;
  arp: ArpStyle;
}

interface SongDef {
  bpm: number;
  /** Played once. */
  intro: Section[];
  /** Looped forever after the intro. Empty = one-shot stinger. */
  loop: Section[];
  lead: LeadWave;
  arpDuty: number;
  /** Overall level multiplier for the song. */
  level: number;
  /** Seconds to let a one-shot ring out after its last step. */
  tail?: number;
  /** Applied to every lead note and chord tone (used to re-harmonise the battle theme into minor). */
  transform?: (midi: number) => number;
}

interface NoteEv {
  ch: 'lead' | 'arp' | 'bass';
  midi: number;
  len: number;
}

interface Step {
  notes: NoteEv[];
  drums: DrumKind[];
}

export interface CompiledSong {
  stepDur: number;
  steps: Step[];
  /** Step index to jump to at the end, or -1 for a one-shot. */
  loopStart: number;
  lead: LeadWave;
  arpDuty: number;
  level: number;
  tail: number;
}

// ---------------------------------------------------------------------------
// Parsing / compiling
// ---------------------------------------------------------------------------

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function accidental(a: string | undefined): number {
  return a === '#' ? 1 : a === 'b' ? -1 : 0;
}

function noteToMidi(s: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) return null;
  return 12 * (Number(m[3]) + 1) + (PC[m[1] ?? 'C'] ?? 0) + accidental(m[2]);
}

const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '5': [0, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
};

interface Chord {
  root: number; // pitch class
  tones: number[]; // pitch classes, root first
}

function parseChord(s: string): Chord | null {
  const m = /^([A-G])([#b]?)(.*)$/.exec(s.trim());
  if (!m) return null;
  const root = (((PC[m[1] ?? 'C'] ?? 0) + accidental(m[2])) % 12 + 12) % 12;
  const q = QUALITY[m[3] ?? ''];
  if (!q) return null;
  return { root, tones: q.map((i) => (root + i) % 12) };
}

interface LeadToken {
  pos: number;
  midi: number | null;
  len: number;
}

function parseBar(bar: string): { tokens: LeadToken[]; total: number; bad: string[] } {
  const tokens: LeadToken[] = [];
  const bad: string[] = [];
  let pos = 0;
  for (const tok of bar.split(/\s+/).filter(Boolean)) {
    const [name = '', lenStr] = tok.split(':');
    const len = lenStr ? Number(lenStr) : 1;
    if (!Number.isFinite(len) || len <= 0) {
      bad.push(tok);
      continue;
    }
    if (name === 'r') {
      tokens.push({ pos, midi: null, len });
    } else {
      const midi = noteToMidi(name);
      if (midi === null) bad.push(tok);
      tokens.push({ pos, midi, len });
    }
    pos += len;
  }
  return { tokens, total: pos, bad };
}

const DRUM_CHARS: Record<string, DrumKind[]> = {
  k: ['kick'],
  s: ['snare'],
  h: ['hat'],
  o: ['ohat'],
  c: ['crash', 'kick'],
  x: ['kick', 'hat'],
  z: ['snare', 'hat'],
  t: ['tomH'],
  m: ['tomM'],
  l: ['tomL'],
};

const bassMidi = (pc: number) => pc + (pc >= 4 ? 36 : 48); // E2..D#3
const arpMidi = (pc: number) => 60 + pc; // C4..B4

function genBass(style: BassStyle, ch: Chord, s0: number, len: number, add: (pos: number, ev: NoteEv) => void): void {
  const r = bassMidi(ch.root);
  const third = ch.tones[1] !== undefined ? r + ((ch.tones[1] - ch.root + 12) % 12) : r + 7;
  const fifth = ch.tones[2] !== undefined ? r + ((ch.tones[2] - ch.root + 12) % 12) : r + 7;
  const n = (pos: number, midi: number, l: number) => add(s0 + pos, { ch: 'bass', midi, len: l });
  switch (style) {
    case 'drive':
      for (let i = 0; i < len; i += 2) n(i, (i % 8) === 4 ? r + 12 : r, 2);
      break;
    case 'octave':
      for (let i = 0; i < len; i += 2) n(i, (i / 2) % 2 ? r + 12 : r, 2);
      break;
    case 'gallop':
      for (let i = 0; i < len; i += 4) {
        const hi = (i / 4) % 4 === 3;
        n(i, r, 2);
        if (i + 2 < len) n(i + 2, hi ? r + 12 : r, 1);
        if (i + 3 < len) n(i + 3, hi ? fifth : r, 1);
      }
      break;
    case 'bounce':
      for (let i = 0; i < len; i += 4) n(i, (i / 4) % 2 ? fifth : r, 3);
      break;
    case 'walk': {
      const seq = [r, third, fifth, r + 12];
      for (let i = 0; i < len; i += 4) n(i, seq[(i / 4) % 4] ?? r, 4);
      break;
    }
    case 'hold':
      n(0, r, len);
      break;
    case 'none':
      break;
  }
}

function genArp(style: ArpStyle, ch: Chord, s0: number, len: number, add: (pos: number, ev: NoteEv) => void): void {
  const voiced = ch.tones.map(arpMidi).sort((a, b) => a - b);
  const cyc = [...voiced, (voiced[0] ?? 60) + 12];
  const n = (pos: number, midi: number, l: number) => add(s0 + pos, { ch: 'arp', midi, len: l });
  switch (style) {
    case 'arp16':
      for (let i = 0; i < len; i++) n(i, cyc[i % cyc.length] ?? 60, 1);
      break;
    case 'arp8':
      for (let i = 0; i < len; i += 2) n(i, cyc[(i / 2) % cyc.length] ?? 60, 2);
      break;
    case 'stab':
      for (let i = 2; i < len; i += 4) for (const m of voiced) n(i, m + 12, 1);
      break;
    case 'pad':
      for (const m of voiced) n(0, m, len);
      break;
    case 'none':
      break;
  }
}

export function compileSong(def: SongDef, errors?: string[]): CompiledSong {
  const tf = def.transform ?? ((m: number) => m);
  const tpc = (pc: number) => (((tf(60 + pc) - 60) % 12) + 12) % 12;
  const steps: Step[] = [];
  const sections = [...def.intro, ...def.loop];
  let loopStart = -1;
  sections.forEach((sec, si) => {
    if (si === def.intro.length && def.loop.length) loopStart = steps.length;
    const bars = sec.chords.length;
    if (sec.lead.length !== bars) errors?.push(`section ${si}: ${sec.lead.length} lead bars vs ${bars} chord bars`);
    for (let b = 0; b < bars; b++) {
      const base = steps.length;
      for (let i = 0; i < STEPS_PER_BAR; i++) steps.push({ notes: [], drums: [] });
      const add = (pos: number, ev: NoteEv) => {
        const st = steps[base + pos];
        if (st && pos < STEPS_PER_BAR) st.notes.push(ev);
      };

      // Lead
      const parsed = parseBar(sec.lead[b] ?? 'r:16');
      if (parsed.total !== STEPS_PER_BAR) errors?.push(`section ${si} bar ${b}: lead totals ${parsed.total} steps`);
      if (parsed.bad.length) errors?.push(`section ${si} bar ${b}: bad tokens ${parsed.bad.join(',')}`);
      for (const t of parsed.tokens) {
        if (t.midi !== null) add(t.pos, { ch: 'lead', midi: tf(t.midi), len: Math.min(t.len, STEPS_PER_BAR - t.pos) });
      }

      // Harmony
      const segs = (sec.chords[b] ?? 'C').split('|');
      const segLen = STEPS_PER_BAR / segs.length;
      segs.forEach((cs, i) => {
        const raw = parseChord(cs);
        if (!raw) {
          errors?.push(`section ${si} bar ${b}: bad chord ${cs}`);
          return;
        }
        const ch: Chord = { root: tpc(raw.root), tones: raw.tones.map(tpc) };
        genBass(sec.bass, ch, i * segLen, segLen, add);
        genArp(sec.arp, ch, i * segLen, segLen, add);
      });

      // Drums
      let pat = b === bars - 1 && sec.fill ? sec.fill : Array.isArray(sec.drums) ? (sec.drums[b % sec.drums.length] ?? '') : sec.drums;
      pat = pat.replace(/\s+/g, '');
      if (pat.length !== STEPS_PER_BAR && pat.length !== 0) errors?.push(`section ${si} bar ${b}: drum pattern length ${pat.length}`);
      for (let i = 0; i < STEPS_PER_BAR; i++) {
        const kinds = DRUM_CHARS[pat[i] ?? '.'];
        const st = steps[base + i];
        if (kinds && st) st.drums.push(...kinds);
      }
      if (b === 0 && sec.crash) {
        const st = steps[base];
        if (st && !st.drums.includes('crash')) st.drums.push('crash');
      }
    }
  });
  return {
    stepDur: 60 / def.bpm / 4,
    steps,
    loopStart,
    lead: def.lead,
    arpDuty: def.arpDuty,
    level: def.level,
    tail: def.tail ?? 1.2,
  };
}

// ---------------------------------------------------------------------------
// Songs (all original)
// ---------------------------------------------------------------------------

/** Re-harmonise D major material into D harmonic minor (F# -> F, B -> Bb, keep C#). */
const toDHarmonicMinor = (m: number): number => {
  const rel = (((m - 2) % 12) + 12) % 12;
  return rel === 4 || rel === 9 ? m - 1 : m;
};

// --- Battle (D major, heroic/driving) --------------------------------------
const BATTLE_DRUMS_A = 'x.h. z.hk x.x. z.ho';
const BATTLE_DRUMS_B = 'x.hh z.hh x.hh z.hx';
const BATTLE_FILL = 'zzz. z.z. ttmm llzz';

const BATTLE_INTRO: Section = {
  chords: ['Bb|C', 'D'],
  lead: ['D5:2 D5:1 D5:1 D5:2 F5:2 E5:2 E5:1 E5:1 E5:2 G5:2', 'F#5:4 E5:2 F#5:2 A5:8'],
  drums: 'c... k... k... k.k.',
  fill: 'zzzz ..zz t.t. m.l.',
  bass: 'octave',
  arp: 'stab',
};

const BATTLE_A_HEAD = [
  'A4:2 D5:2 F#5:3 E5:1 D5:2 A4:2 D5:4',
  'E5:2 G5:2 E5:2 C5:2 G5:4 r:2 E5:2',
  'D5:3 B4:1 D5:2 G5:2 F#5:2 G5:2 A5:4',
  'F#5:8 E5:2 D5:2 E5:4',
  'B4:2 D5:2 F#5:2 B5:4 A5:2 F#5:2 D5:2',
];

const BATTLE_A: Section = {
  chords: ['D', 'C', 'G', 'D', 'Bm', 'G', 'Em', 'A'],
  lead: [...BATTLE_A_HEAD, 'E5:2 G5:2 B5:3 A5:1 G5:4 F#5:2 E5:2', 'G5:2 F#5:2 E5:2 B4:2 E5:4 G5:4', 'A5:6 G5:1 F#5:1 E5:4 C#5:4'],
  drums: BATTLE_DRUMS_A,
  fill: BATTLE_FILL,
  crash: true,
  bass: 'drive',
  arp: 'arp16',
};

const BATTLE_A2: Section = {
  chords: ['D', 'C', 'G', 'D', 'Bm', 'G', 'A', 'D'],
  lead: [...BATTLE_A_HEAD, 'G5:3 F#5:1 E5:2 D5:2 E5:4 G5:4', 'A5:4 B5:2 C#6:2 A5:4 E5:4', 'D6:12 r:4'],
  drums: BATTLE_DRUMS_A,
  fill: BATTLE_FILL,
  crash: true,
  bass: 'octave',
  arp: 'stab',
};

const BATTLE_B: Section = {
  chords: ['G', 'A', 'F#m', 'Bm', 'G', 'A', 'Bb', 'C'],
  lead: [
    'B4:4 D5:4 G5:6 F#5:2',
    'E5:4 C#5:4 A4:4 E5:4',
    'F#5:4 E5:2 C#5:2 A4:2 C#5:2 F#5:4',
    'D5:8 F#5:4 B5:4',
    'B5:4 A5:2 G5:2 D5:4 G5:4',
    'A5:4 G5:2 E5:2 C#5:4 E5:4',
    'F5:2 F5:1 F5:1 F5:2 D5:2 F5:2 A5:2 Bb5:4',
    'E5:2 G5:2 C6:4 A5:2 C6:2 D6:4',
  ],
  drums: BATTLE_DRUMS_B,
  fill: 'zzzz zzzz tttm mmll',
  crash: true,
  bass: 'gallop',
  arp: 'arp16',
};

// --- Boss (same material, D harmonic minor, faster, heavier) ---------------
const BOSS_DRUMS_A = 'x.kk z.kk x.kk z.kh';
const BOSS_DRUMS_B = 'x.x. z.x. x.x. z.xz';

const BOSS_INTRO: Section = {
  chords: ['D', 'A'],
  lead: ['D5:1 D5:1 r:2 D5:1 D5:1 r:2 C#5:2 D5:2 Eb5:2 E5:2', 'F5:2 E5:2 Eb5:2 D5:2 C#5:4 A4:4'],
  drums: ['k.k. k.k. k.k. k.k.', 'zzzz zzzz tttt llll'],
  bass: 'gallop',
  arp: 'none',
};

// --- Gym Leader (E minor, driving; original) --------------------------------
const GYM_INTRO: Section = {
  chords: ['Em', 'C|D'],
  lead: ['E5:1 E5:1 r:2 E5:1 E5:1 r:2 G5:2 F#5:2 E5:2 D5:2', 'C5:4 D5:4 E5:2 B4:2 B4:4'],
  drums: ['c... k.k. k... k.k.', 'z.z. z.z. zzzz tmll'],
  bass: 'octave',
  arp: 'stab',
};

const GYM_A: Section = {
  chords: ['Em', 'C', 'G', 'D', 'Em', 'C', 'Am', 'B'],
  lead: [
    'B4:2 E5:2 G5:3 F#5:1 E5:2 B4:2 E5:4',
    'C5:2 E5:2 G5:4 A5:2 G5:2 E5:4',
    'D5:2 G5:2 B5:3 A5:1 G5:2 D5:2 G5:4',
    'F#5:6 E5:2 D5:4 A4:4',
    'B4:2 E5:2 G5:3 F#5:1 E5:2 G5:2 B5:4',
    'C6:4 B5:2 A5:2 G5:4 E5:4',
    'A5:3 G5:1 F#5:2 E5:2 C5:4 E5:4',
    'D#5:4 F#5:4 B5:6 r:2',
  ],
  drums: 'x.h. z.hk x.x. z.hh',
  fill: 'zz.z zz.z tttm mlll',
  crash: true,
  bass: 'drive',
  arp: 'arp16',
};

const GYM_B: Section = {
  chords: ['C', 'D', 'Bm', 'Em', 'Am', 'D', 'G', 'B'],
  lead: [
    'E5:4 G5:4 C6:6 B5:2',
    'A5:4 F#5:4 D5:4 A5:4',
    'B5:4 A5:2 F#5:2 D5:4 F#5:4',
    'G5:2 F#5:2 E5:4 B4:8',
    'C5:2 E5:2 A5:4 G5:2 E5:2 C5:4',
    'D5:2 F#5:2 A5:4 C6:4 A5:4',
    'B5:3 A5:1 G5:2 D5:2 G5:2 B5:2 D6:4',
    'D#6:4 B5:4 F#5:4 D#5:4',
  ],
  drums: 'x.hh z.hh x.hh z.hx',
  fill: 'zzzz zzzz tttm mmll',
  crash: true,
  bass: 'gallop',
  arp: 'arp16',
};

// --- Champion (B minor rising to D major; original) -------------------------
const CHAMP_INTRO: Section = {
  chords: ['Bm', 'G', 'A', 'F#'],
  lead: [
    'B4:1 D5:1 F#5:1 B5:1 r:4 B4:1 D5:1 F#5:1 B5:1 r:4',
    'G4:1 B4:1 D5:1 G5:1 r:4 G4:1 B4:1 D5:1 G5:1 r:4',
    'A4:1 C#5:1 E5:1 A5:1 r:4 A4:1 C#5:1 E5:1 A5:1 r:4',
    'F#5:4 F5:4 F#5:4 A#5:4',
  ],
  drums: ['c... k... k.k. k...', 'k... k... k.k. k...', 'k... k... k.k. zzzz', 'zzzz zzzz tttm mmll'],
  bass: 'octave',
  arp: 'stab',
};

const CHAMP_A: Section = {
  chords: ['Bm', 'G', 'D', 'A', 'Bm', 'G', 'Em', 'F#'],
  lead: [
    'F#5:2 B5:2 D6:3 C#6:1 B5:2 F#5:2 B5:4',
    'G5:2 B5:2 D6:4 E6:2 D6:2 B5:4',
    'A5:2 F#5:2 D5:4 F#5:2 A5:2 D6:4',
    'C#6:6 B5:2 A5:4 E5:4',
    'F#5:2 B5:2 D6:3 C#6:1 B5:2 D6:2 F#6:4',
    'G6:4 F#6:2 E6:2 D6:4 B5:4',
    'E6:3 D6:1 C#6:2 B5:2 G5:4 B5:4',
    'A#5:4 C#6:4 F#6:6 r:2',
  ],
  drums: 'x.kk z.kk x.kk z.kh',
  fill: 'zzzz zzzz tttm mmll',
  crash: true,
  bass: 'gallop',
  arp: 'arp16',
};

const CHAMP_B: Section = {
  chords: ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'A'],
  lead: [
    'A5:4 D6:4 F#6:6 E6:2',
    'E6:4 C#6:4 A5:8',
    'B5:4 D6:2 F#6:2 E6:4 D6:4',
    'D6:2 B5:2 G5:4 B5:4 D6:4',
    'F#6:4 E6:2 D6:2 A5:4 D6:4',
    'C#6:4 E6:4 A6:8',
    'G6:3 F#6:1 E6:2 D6:2 B5:4 G5:4',
    'A5:4 C#6:4 E6:4 A6:4',
  ],
  drums: 'x.h. z.hk x.x. z.hh',
  fill: 'zzzz zzzz tttm mmll',
  crash: true,
  bass: 'octave',
  arp: 'arp16',
};

// --- Title (C major, heroic, mid tempo) ------------------------------------
const TITLE_1: Section = {
  chords: ['C', 'Am', 'F', 'G', 'C', 'Em', 'F', 'G'],
  lead: [
    'G4:4 C5:4 E5:6 D5:2',
    'C5:2 B4:2 A4:4 E5:8',
    'F5:6 E5:2 D5:4 C5:4',
    'D5:12 G4:4',
    'G4:4 C5:4 G5:6 F5:2',
    'E5:4 D5:2 E5:2 B4:8',
    'A5:4 G5:2 F5:2 C5:4 F5:4',
    'G5:8 F5:2 E5:2 D5:4',
  ],
  drums: 'k... h... z... h.k.',
  fill: 'z... z... z.z. zzzz',
  crash: true,
  bass: 'drive',
  arp: 'arp8',
};

const TITLE_2: Section = {
  chords: ['Am', 'F', 'C', 'G', 'F', 'G', 'Bb', 'C'],
  lead: [
    'E5:4 A5:4 C6:6 B5:2',
    'A5:4 F5:4 C5:8',
    'G5:6 E5:2 C5:4 E5:4',
    'D5:8 B4:4 D5:4',
    'C5:4 F5:4 A5:6 G5:2',
    'G5:4 B5:4 D6:8',
    'D6:4 C6:2 Bb5:2 F5:8',
    'G5:4 E5:2 G5:2 C6:8',
  ],
  drums: 'x.h. h.h. z.h. h.hk',
  fill: 'z.z. z.z. zzzz tml.',
  crash: true,
  bass: 'octave',
  arp: 'arp16',
};

// --- Select (F major, light, bouncy) ---------------------------------------
const SELECT_LEAD = [
  'C5:2 r:1 A4:1 C5:2 F5:2 r:2 E5:2 F5:4',
  'D5:2 r:1 F5:1 A5:2 G5:2 F5:2 E5:2 D5:4',
  'Bb4:2 r:1 D5:1 F5:2 Bb5:2 A5:2 G5:2 F5:4',
  'E5:2 r:1 G5:1 C6:4 Bb5:2 G5:2 E5:4',
  'A5:2 r:1 F5:1 C5:2 F5:2 A5:2 C6:2 A5:4',
  'G5:2 r:1 E5:1 C5:2 E5:2 A5:4 G5:4',
  'F5:2 D5:2 Bb4:2 D5:2 F5:4 D5:4',
  'E5:2 F5:2 G5:4 C5:4 r:4',
];
const SELECT_CHORDS = ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb', 'C'];

const SONG_DEFS: Record<TrackName, SongDef> = {
  battle: {
    bpm: 158,
    intro: [BATTLE_INTRO],
    loop: [BATTLE_A, BATTLE_A2, BATTLE_B],
    lead: 0.25,
    arpDuty: 0.125,
    level: 1,
  },
  boss: {
    bpm: 176,
    intro: [BOSS_INTRO],
    loop: [
      { ...BATTLE_A, drums: BOSS_DRUMS_A, bass: 'gallop' },
      { ...BATTLE_A2, drums: BOSS_DRUMS_A, bass: 'gallop', arp: 'arp16' },
      { ...BATTLE_B, drums: BOSS_DRUMS_B, bass: 'octave' },
    ],
    lead: 0.125,
    arpDuty: 0.25,
    level: 1,
    transform: toDHarmonicMinor,
  },
  gym: {
    bpm: 164,
    intro: [GYM_INTRO],
    loop: [GYM_A, GYM_B],
    lead: 0.25,
    arpDuty: 0.125,
    level: 1,
  },
  champion: {
    bpm: 182,
    intro: [CHAMP_INTRO],
    loop: [CHAMP_A, CHAMP_B],
    lead: 0.125,
    arpDuty: 0.25,
    level: 1,
  },
  title: {
    bpm: 120,
    intro: [],
    loop: [TITLE_1, TITLE_2],
    lead: 0.5,
    arpDuty: 0.125,
    level: 0.95,
  },
  select: {
    bpm: 106,
    intro: [],
    loop: [
      { chords: SELECT_CHORDS, lead: SELECT_LEAD, drums: 'k.h. s.h. k.hk s.h.', crash: true, bass: 'bounce', arp: 'stab' },
      { chords: SELECT_CHORDS, lead: SELECT_LEAD, drums: 'k.hh s.hh k.hk s.hh', fill: 'k.h. s.h. s.s. ssss', bass: 'walk', arp: 'arp8' },
    ],
    lead: 0.25,
    arpDuty: 0.125,
    level: 0.85,
  },
  victory: {
    bpm: 170,
    intro: [
      {
        chords: ['C', 'Ab|Bb'],
        lead: ['G4:2 C5:2 E5:2 G5:2 C6:4 G5:2 C6:2', 'Ab5:4 C6:2 Ab5:2 Bb5:4 D6:2 Bb5:2'],
        drums: ['c... k.k. k... k.k.', 'z.z. z.z. zzzz zzzz'],
        bass: 'octave',
        arp: 'arp16',
      },
      { chords: ['C'], lead: ['C6:12 r:4'], drums: 'c... .... .... ....', bass: 'hold', arp: 'pad' },
    ],
    loop: [],
    lead: 0.25,
    arpDuty: 0.125,
    level: 1,
    tail: 1.2,
  },
  defeat: {
    bpm: 80,
    intro: [{ chords: ['Am|Dm|E|Am'], lead: ['E5:2 C5:2 D5:2 A4:2 B4:2 G#4:2 A4:4'], drums: '', bass: 'hold', arp: 'pad' }],
    loop: [],
    lead: 'triangle',
    arpDuty: 0.5,
    level: 0.9,
    tail: 1.4,
  },
};

const compiledCache = new Map<TrackName, CompiledSong>();
function getSong(name: TrackName): CompiledSong | null {
  const def = SONG_DEFS[name];
  if (!def) return null;
  let c = compiledCache.get(name);
  if (!c) {
    c = compileSong(def);
    compiledCache.set(name, c);
  }
  return c;
}

/** For tests: compiles every song and returns any authoring errors (bar lengths, bad notes/chords). */
export function validateSongs(): string[] {
  const errors: string[] = [];
  for (const [name, def] of Object.entries(SONG_DEFS)) {
    const errs: string[] = [];
    compileSong(def, errs);
    errors.push(...errs.map((e) => `${name}: ${e}`));
  }
  return errors;
}

/** Song length in seconds (one pass through intro + loop). */
export function songDuration(name: TrackName): number {
  const s = getSong(name);
  return s ? s.steps.length * s.stepDur : 0;
}

export const TRACK_NAMES = Object.keys(SONG_DEFS) as TrackName[];

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class TrackPlayer {
  readonly out: GainNode;
  private readonly leadIn: GainNode;
  private readonly chanIn: GainNode;
  private step = 0;
  private nextTime = 0;
  private stopAt = Infinity;
  finished = false;
  dead = false;

  constructor(private readonly ctx: AudioContext, dest: AudioNode, private readonly song: CompiledSong) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(dest);
    this.chanIn = ctx.createGain();
    this.chanIn.gain.value = song.level;
    this.chanIn.connect(this.out);
    // Lead gets a short, filtered dotted-8th echo for that handheld "reverb" feel.
    this.leadIn = ctx.createGain();
    this.leadIn.connect(this.chanIn);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = Math.min(0.9, song.stepDur * 3);
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const wet = ctx.createGain();
    wet.gain.value = 0.2;
    this.leadIn.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(wet);
    wet.connect(this.chanIn);
  }

  start(fadeIn: number): void {
    const t = this.ctx.currentTime;
    this.nextTime = t + 0.06;
    const g = this.out.gain;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(1, t + Math.max(0.02, fadeIn));
  }

  stop(fade: number): void {
    const t = this.ctx.currentTime;
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + Math.max(0.02, fade));
    this.stopAt = Math.min(this.stopAt, t + Math.max(0.02, fade) + 0.05);
  }

  tick(): void {
    if (this.dead) return;
    const now = this.ctx.currentTime;
    if (now >= this.stopAt) {
      this.kill();
      return;
    }
    // Recover after timer throttling (background tab) instead of bursting old notes.
    if (this.nextTime < now - 0.2) this.nextTime = now + 0.02;
    const { song } = this;
    while (!this.finished && this.nextTime < now + SCHEDULE_AHEAD && this.nextTime < this.stopAt) {
      const st = song.steps[this.step];
      if (st) this.scheduleStep(st, this.nextTime);
      this.nextTime += song.stepDur;
      this.step++;
      if (this.step >= song.steps.length) {
        if (song.loopStart >= 0) this.step = song.loopStart;
        else {
          this.finished = true;
          this.stopAt = Math.min(this.stopAt, this.nextTime + song.tail);
        }
      }
    }
  }

  kill(): void {
    this.dead = true;
    try {
      this.out.disconnect();
    } catch {
      /* ignore */
    }
  }

  private scheduleStep(st: Step, t: number): void {
    for (const n of st.notes) this.playNote(n, t);
    for (const d of st.drums) this.playDrum(d, t);
  }

  private playNote(n: NoteEv, t: number): void {
    const { ctx, song } = this;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    let vol: number;
    let gate: number;
    let dest: AudioNode = this.chanIn;
    if (n.ch === 'lead') {
      if (song.lead === 'triangle') {
        osc.type = 'triangle';
        vol = 0.28;
      } else {
        osc.setPeriodicWave(getPulseWave(ctx, song.lead));
        vol = song.lead === 0.5 ? 0.11 : 0.13;
      }
      gate = 0.92;
      dest = this.leadIn;
    } else if (n.ch === 'arp') {
      osc.setPeriodicWave(getPulseWave(ctx, song.arpDuty));
      vol = n.len > 4 ? 0.035 : 0.05;
      gate = n.len === 1 ? 0.6 : 0.85;
    } else {
      osc.type = 'triangle';
      vol = 0.3;
      gate = 0.86;
    }
    const dur = Math.max(0.03, n.len * song.stepDur * gate);
    osc.frequency.setValueAtTime(mtof(n.midi), t);
    if (n.ch === 'lead' && dur > 0.3) {
      // delayed vibrato on held lead notes
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(0, t + 0.15);
      lg.gain.linearRampToValueAtTime(18, t + Math.min(dur, 0.5));
      lfo.connect(lg);
      lg.connect(osc.detune);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    const p = g.gain;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(vol, t + 0.004);
    if (n.ch !== 'bass') p.linearRampToValueAtTime(vol * 0.72, t + Math.min(dur * 0.5, 0.12));
    p.setValueAtTime(n.ch !== 'bass' ? vol * 0.72 : vol, t + dur);
    p.linearRampToValueAtTime(0, t + dur + 0.03);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noiseHit(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number, q = 0.7): void {
    const { ctx } = this;
    const src = ctx.createBufferSource();
    src.buffer = getNoiseBuffer(ctx);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.chanIn);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  private sweep(t: number, f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine'): void {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    osc.connect(g);
    g.connect(this.chanIn);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private playDrum(d: DrumKind, t: number): void {
    switch (d) {
      case 'kick':
        this.sweep(t, 160, 45, 0.2, 0.55);
        this.noiseHit(t, 0.015, 0.12, 'lowpass', 2500);
        break;
      case 'snare':
        this.noiseHit(t, 0.14, 0.28, 'bandpass', 1900, 0.6);
        this.sweep(t, 220, 160, 0.07, 0.14, 'triangle');
        break;
      case 'hat':
        this.noiseHit(t, 0.035, 0.08, 'highpass', 8000);
        break;
      case 'ohat':
        this.noiseHit(t, 0.18, 0.07, 'highpass', 7000);
        break;
      case 'crash':
        this.noiseHit(t, 1.1, 0.12, 'highpass', 4500);
        break;
      case 'tomH':
        this.sweep(t, 260, 140, 0.16, 0.35);
        break;
      case 'tomM':
        this.sweep(t, 190, 100, 0.18, 0.35);
        break;
      case 'tomL':
        this.sweep(t, 130, 70, 0.22, 0.38);
        break;
    }
  }
}

export class MusicEngine {
  private players: TrackPlayer[] = [];
  private current: { name: TrackName; player: TrackPlayer } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ctx: AudioContext, private readonly dest: AudioNode) {}

  get currentTrack(): TrackName | null {
    return this.current && !this.current.player.finished ? this.current.name : null;
  }

  play(name: TrackName, crossfade = 0.6): void {
    const song = getSong(name);
    if (!song) return;
    if (this.current && this.current.name === name && !this.current.player.finished && !this.current.player.dead) return;
    const hadCurrent = !!this.current && !this.current.player.finished;
    if (this.current) this.current.player.stop(crossfade);
    const p = new TrackPlayer(this.ctx, this.dest, song);
    // Stingers hit immediately; loops fade in when crossfading from another track.
    p.start(song.loopStart >= 0 && hadCurrent ? crossfade : 0.02);
    this.players.push(p);
    this.current = { name, player: p };
    p.tick();
    this.ensureTimer();
  }

  stop(fade = 0.6): void {
    this.current?.player.stop(fade);
    this.current = null;
  }

  private ensureTimer(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => this.tick(), LOOKAHEAD_MS);
  }

  private tick(): void {
    for (const p of this.players) p.tick();
    this.players = this.players.filter((p) => !p.dead);
    if (this.current?.player.dead) this.current = null;
    if (!this.players.length && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
