import { describe, expect, it } from 'vitest';
import { audio, type TrackName } from '../src/audio/audio';
import { TRACK_NAMES, songDuration, validateSongs } from '../src/audio/music';
import { MOVE_TYPES, SFX_NAMES } from '../src/audio/sfx';

describe('audio bus without an AudioContext (node)', () => {
  it('every API call is a safe no-op', async () => {
    expect(() => audio.unlock()).not.toThrow();
    expect(() => audio.unlock()).not.toThrow();
    for (const n of SFX_NAMES) {
      expect(() => audio.playSfx(n)).not.toThrow();
      expect(() => audio.playSfx(n, { volume: 0.5, pan: -1, pitch: 1.5 })).not.toThrow();
    }
    for (const t of [...MOVE_TYPES, 'MYSTERY', 'bogus', '']) {
      for (const ph of ['cast', 'travel', 'impact'] as const) {
        expect(() => audio.playMoveSfx(t, ph)).not.toThrow();
        expect(() => audio.playMoveSfx(t, ph, 1, 0.5)).not.toThrow();
      }
    }
    await expect(audio.playCry(6)).resolves.toBeUndefined();
    await expect(audio.playCry(25, { pitch: 0.8, volume: 0.5 })).resolves.toBeUndefined();
    for (const t of TRACK_NAMES) expect(() => audio.playMusic(t)).not.toThrow();
    expect(() => audio.stopMusic()).not.toThrow();
    expect(() => audio.stopMusic(0)).not.toThrow();
    expect(() => audio.duckMusic(0.3, 1)).not.toThrow();
    expect(() => audio.duckMusic(1)).not.toThrow();
  });

  it('volumes and mute work without audio', () => {
    audio.setVolumes({ master: 0.5, music: 2, sfx: -1 });
    expect(audio.getVolumes()).toEqual({ master: 0.5, music: 1, sfx: 0 });
    const before = audio.muted;
    expect(audio.toggleMute()).toBe(!before);
    expect(audio.muted).toBe(!before);
    audio.muted = before;
    expect(audio.muted).toBe(before);
  });
});

describe('music data', () => {
  it('all songs compile with correct bar lengths, notes and chords', () => {
    expect(validateSongs()).toEqual([]);
  });

  it('has every track with sensible lengths', () => {
    const expected: TrackName[] = ['title', 'select', 'battle', 'boss', 'gym', 'champion', 'victory', 'defeat'];
    expect([...TRACK_NAMES].sort()).toEqual([...expected].sort());
    expect(songDuration('victory')).toBeGreaterThan(3);
    expect(songDuration('victory')).toBeLessThan(5);
    expect(songDuration('defeat')).toBeGreaterThan(2);
    expect(songDuration('defeat')).toBeLessThan(4);
    expect(songDuration('battle')).toBeGreaterThan(30);
  });
});
