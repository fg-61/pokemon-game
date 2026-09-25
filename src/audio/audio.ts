/**
 * Game audio bus. Everything is synthesised at runtime with the Web Audio API
 * (only the Pokémon cries are loaded from files).
 *
 *   sfx voices ─> sfxBus ─┐
 *   music ─> musicBus ─> duck ─┼─> master ─> compressor ─> destination
 *   cries  ─> sfxBus ─┘
 *
 * Every public method is a safe no-op until `unlock()` has been called from a
 * user gesture, and whenever Web Audio is unavailable (Node, headless tests).
 */
import { MusicEngine, type TrackName } from './music';
import { renderMoveSfx, renderSfx, type FxPhase, type SfxName } from './sfx';

export type { SfxName, FxPhase } from './sfx';
export type { TrackName } from './music';

interface Volumes {
  master: number;
  music: number;
  sfx: number;
}

const STORAGE_KEY = 'pba.audio.v1';
/** Internal headroom for music so SFX always cut through. */
const MUSIC_TRIM = 0.75;
/** Headroom for SFX voices (recipes peak near 1-2 at full intensity; the compressor handles overlaps). */
const SFX_TRIM = 0.6;
/** Same SFX retriggered faster than this is dropped (hover spam etc). */
const SFX_RETRIGGER = 0.03;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function getStorage(): Storage | null {
  try {
    const s = (globalThis as { localStorage?: Storage }).localStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

type AudioCtor = new (opts?: AudioContextOptions) => AudioContext;
function getAudioCtor(): AudioCtor | null {
  const g = globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

class AudioBus {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private duck: GainNode | null = null;
  private music: MusicEngine | null = null;
  private vol: Volumes = { master: 0.8, music: 0.6, sfx: 0.9 };
  private _muted = false;
  private cries = new Map<number, Promise<AudioBuffer | null>>();
  private lastSfx = new Map<string, number>();
  /** Track requested before unlock; started as soon as audio is unlocked. */
  private pendingTrack: TrackName | null = null;
  private duckTimer: ReturnType<typeof setTimeout> | null = null;
  /** Wall-clock ms of the last unlock(); lets SFX fired in the same gesture queue while resume() is in flight. */
  private unlockedAt = -Infinity;

  constructor() {
    this.load();
  }

  // ---------------------------------------------------------------- state

  get muted(): boolean {
    return this._muted;
  }
  set muted(v: boolean) {
    this._muted = !!v;
    this.applyVolumes();
    this.save();
  }

  toggleMute(): boolean {
    this.muted = !this._muted;
    return this._muted;
  }

  /** True once an AudioContext exists and is running. */
  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolumes(v: { master?: number; music?: number; sfx?: number }): void {
    try {
      if (!v) return;
      if (v.master !== undefined) this.vol.master = clamp(num(v.master, this.vol.master), 0, 1);
      if (v.music !== undefined) this.vol.music = clamp(num(v.music, this.vol.music), 0, 1);
      if (v.sfx !== undefined) this.vol.sfx = clamp(num(v.sfx, this.vol.sfx), 0, 1);
      this.applyVolumes();
      this.save();
    } catch {
      /* never throw */
    }
  }

  getVolumes(): { master: number; music: number; sfx: number } {
    return { ...this.vol };
  }

  // ---------------------------------------------------------------- lifecycle

  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = getAudioCtor();
        if (!Ctor) return;
        const ctx = new Ctor({ latencyHint: 'interactive' });
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 12;
        comp.ratio.value = 3.5;
        comp.attack.value = 0.004;
        comp.release.value = 0.2;
        comp.connect(ctx.destination);
        const master = ctx.createGain();
        master.connect(comp);
        const sfxBus = ctx.createGain();
        sfxBus.connect(master);
        const duck = ctx.createGain();
        duck.connect(master);
        const musicBus = ctx.createGain();
        musicBus.connect(duck);
        this.ctx = ctx;
        this.master = master;
        this.sfxBus = sfxBus;
        this.duck = duck;
        this.musicBus = musicBus;
        this.music = new MusicEngine(ctx, musicBus);
        this.applyVolumes(true);
      }
      const ctx = this.ctx;
      this.unlockedAt = Date.now();
      if (ctx.state === 'suspended') {
        ctx.resume().then(
          () => this.startPending(),
          () => undefined,
        );
      } else {
        this.startPending();
      }
    } catch {
      /* Web Audio unavailable */
    }
  }

  /** Whether sounds may be scheduled now (running, or resuming right after a gesture). */
  private canPlay(): boolean {
    const ctx = this.ctx;
    if (!ctx) return false;
    if (ctx.state === 'running') return true;
    return ctx.state === 'suspended' && Date.now() - this.unlockedAt < 1000;
  }

  private startPending(): void {
    try {
      if (this.pendingTrack && this.music) {
        const t = this.pendingTrack;
        this.pendingTrack = null;
        this.music.play(t);
      }
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- sfx

  playSfx(name: SfxName, opts?: { volume?: number; pan?: number; pitch?: number }): void {
    try {
      const ctx = this.ctx;
      if (!ctx || !this.canPlay()) return;
      const now = ctx.currentTime;
      const last = this.lastSfx.get(name);
      if (last !== undefined && now - last < SFX_RETRIGGER) return;
      this.lastSfx.set(name, now);
      const out = this.voice(opts?.volume ?? 1, opts?.pan ?? 0);
      if (!out) return;
      renderSfx(name, { ctx, out, t: now + 0.005, pitch: clamp(num(opts?.pitch, 1), 0.25, 4) });
    } catch {
      /* never throw from audio */
    }
  }

  playMoveSfx(type: string, phase: FxPhase, intensity = 0.5, pan = 0): void {
    try {
      const ctx = this.ctx;
      if (!ctx || !this.canPlay()) return;
      const key = `mv:${type}:${phase}`;
      const now = ctx.currentTime;
      const last = this.lastSfx.get(key);
      if (last !== undefined && now - last < SFX_RETRIGGER) return;
      this.lastSfx.set(key, now);
      const out = this.voice(1, pan);
      if (!out) return;
      const t = String(type ?? 'NORMAL').toUpperCase();
      renderMoveSfx(t === 'MYSTERY' || t === '???' ? 'NORMAL' : t, phase, num(intensity, 0.5), { ctx, out, t: now + 0.005, pitch: 1 });
    } catch {
      /* never throw from audio */
    }
  }

  private voice(volume: number, pan: number): AudioNode | null {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return null;
    const g = ctx.createGain();
    g.gain.value = clamp(num(volume, 1), 0, 2) * SFX_TRIM;
    const p = clamp(num(pan, 0), -1, 1);
    if (p !== 0 && typeof ctx.createStereoPanner === 'function') {
      const sp = ctx.createStereoPanner();
      sp.pan.value = p;
      g.connect(sp);
      sp.connect(bus);
    } else {
      g.connect(bus);
    }
    return g;
  }

  // ---------------------------------------------------------------- cries

  private loadCry(dex: number): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    let p = this.cries.get(dex);
    if (!p) {
      p = fetch(`assets/pokemon/${dex}/cry.ogg`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`cry ${dex}: ${r.status}`))))
        .then((buf) => ctx.decodeAudioData(buf))
        .catch(() => null);
      this.cries.set(dex, p);
    }
    return p;
  }

  /** Warm the cry cache (e.g. when a team is picked). */
  preloadCry(dex: number): void {
    try {
      if (this.ctx && Number.isFinite(dex)) void this.loadCry(Math.floor(dex));
    } catch {
      /* ignore */
    }
  }

  async playCry(dex: number, opts?: { pitch?: number; volume?: number }): Promise<void> {
    try {
      if (!this.ctx || !Number.isFinite(dex)) return;
      const buf = await this.loadCry(Math.floor(dex));
      const ctx = this.ctx;
      const bus = this.sfxBus;
      if (!buf || !ctx || !bus || ctx.state !== 'running') return;
      const rate = clamp(num(opts?.pitch, 1), 0.25, 4);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = ctx.createGain();
      g.gain.value = clamp(num(opts?.volume, 1), 0, 2) * 0.8;
      src.connect(g);
      g.connect(bus);
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        src.onended = finish;
        // Safety net in case `ended` never fires (context suspended etc).
        setTimeout(finish, (buf.duration / rate) * 1000 + 400);
        src.start();
      });
    } catch {
      /* resolve anyway */
    }
  }

  // ---------------------------------------------------------------- music

  playMusic(track: TrackName): void {
    try {
      if (!this.music || !this.ctx) {
        // Remember looping tracks so they start the moment audio is unlocked.
        if (track !== 'victory' && track !== 'defeat') this.pendingTrack = track;
        return;
      }
      if (this.ctx.state !== 'running') {
        if (track !== 'victory' && track !== 'defeat') this.pendingTrack = track;
        return;
      }
      this.pendingTrack = null;
      this.music.play(track);
    } catch {
      /* never throw */
    }
  }

  stopMusic(fadeSeconds = 0.6): void {
    try {
      this.pendingTrack = null;
      this.music?.stop(Math.max(0.02, num(fadeSeconds, 0.6)));
    } catch {
      /* never throw */
    }
  }

  duckMusic(level: number, seconds?: number): void {
    try {
      const ctx = this.ctx;
      const duck = this.duck;
      if (!ctx || !duck) return;
      if (this.duckTimer !== null) {
        clearTimeout(this.duckTimer);
        this.duckTimer = null;
      }
      const t = ctx.currentTime;
      duck.gain.cancelScheduledValues(t);
      duck.gain.setValueAtTime(duck.gain.value, t);
      duck.gain.linearRampToValueAtTime(clamp(num(level, 1), 0, 1), t + 0.3);
      if (seconds !== undefined && Number.isFinite(seconds) && seconds > 0 && level < 1) {
        this.duckTimer = setTimeout(() => {
          this.duckTimer = null;
          this.duckMusic(1);
        }, seconds * 1000);
      }
    } catch {
      /* never throw */
    }
  }

  // ---------------------------------------------------------------- internals

  private applyVolumes(immediate = false): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const set = (g: GainNode, v: number) => {
      if (immediate) g.gain.value = v;
      else {
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setTargetAtTime(v, ctx.currentTime, 0.03);
      }
    };
    set(this.master, this._muted ? 0 : this.vol.master);
    set(this.sfxBus, this.vol.sfx);
    set(this.musicBus, this.vol.music * MUSIC_TRIM);
  }

  private load(): void {
    try {
      const raw = getStorage()?.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Partial<Volumes> & { muted?: boolean };
      this.vol.master = clamp(num(d.master, this.vol.master), 0, 1);
      this.vol.music = clamp(num(d.music, this.vol.music), 0, 1);
      this.vol.sfx = clamp(num(d.sfx, this.vol.sfx), 0, 1);
      this._muted = d.muted === true;
    } catch {
      /* ignore corrupt / unavailable storage */
    }
  }

  private save(): void {
    try {
      getStorage()?.setItem(STORAGE_KEY, JSON.stringify({ ...this.vol, muted: this._muted }));
    } catch {
      /* ignore */
    }
  }
}

export type { AudioBus };
export const audio = new AudioBus();
