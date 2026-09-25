import { describe, expect, it } from 'vitest';
import { AI_PROFILES } from '../src/battle/ai';
import { CONFIG } from '../src/battle/config';
import { Battle } from '../src/battle/engine';
import { autoBattle } from '../src/battle/runner';
import { calcStats } from '../src/battle/stats';
import { SPECIES } from '../src/data/gamedata';
import { ROSTER } from '../src/data/roster';

const team = (lines: string[], isAI = false) => ({ name: 'T', lines, isAI });

describe('stats', () => {
  it('uses the Gen 3 formula (before the HP multiplier)', () => {
    const s = calcStats(SPECIES.CHARIZARD.base, 50);
    // (2*84+31+21)*50/100+5 = 115
    expect(s.atk).toBe(115);
    expect(s.hp).toBe(Math.floor((Math.floor(((2 * 78 + 31 + 21) * 50) / 100) + 60) * CONFIG.hpMultiplier));
  });
});

describe('battle engine', () => {
  it('fills gauges faster for faster Pokemon', () => {
    const b = new Battle(team(['pidgey']), team(['geodude']), 1);
    const p = b.active(0);
    const g = b.active(1);
    expect(b.atbRate(p)).toBeGreaterThan(b.atbRate(g));
  });

  it('respects type immunity (Normal vs Ghost)', () => {
    const b = new Battle(team(['pidgey']), team(['gastly']), 2);
    b.active(0).atb = 1;
    const slot = b.active(0).moves.findIndex((m) => m.key === 'TACKLE');
    const ev = b.act(0, { type: 'move', slot });
    const use = ev.find((e) => e.t === 'moveUse');
    expect(use && use.t === 'moveUse' && ['noEffect', 'miss'].includes(use.outcome)).toBe(true);
    expect(b.active(1).hp).toBe(b.active(1).stats.hp);
  });

  it('Levitate blocks Ground moves', () => {
    const b = new Battle(team(['geodude']), team(['gastly']), 3);
    const slot = b.active(0).moves.findIndex((m) => m.key === 'DIG');
    b.act(0, { type: 'move', slot }); // charge
    const ev = b.act(0, { type: 'move', slot }); // strike
    const use = ev.find((e) => e.t === 'moveUse');
    expect(use?.t === 'moveUse' && use.outcome).toBe('noEffect');
  });

  it('evolves when the evolution gauge is full, recalculating stats and moves', () => {
    const b = new Battle(team(['charmander']), team(['squirtle']), 4);
    const m = b.active(0);
    expect(b.canEvolve(m)).toBe(false);
    m.evo = CONFIG.evo.max;
    expect(b.canEvolve(m)).toBe(true);
    const oldHp = m.stats.hp;
    const ev = b.act(0, { type: 'evolve' });
    expect(ev.some((e) => e.t === 'evolve')).toBe(true);
    expect(m.speciesKey).toBe('CHARMELEON');
    expect(m.stats.hp).toBeGreaterThan(oldHp);
    expect(m.moves.map((x) => x.key)).toContain('FLAMETHROWER');
    expect(m.evo).toBe(0);
  });

  it('perfect timing hits harder than a missed timing on average', () => {
    const avg = (grade: 'perfect' | 'miss') => {
      let total = 0;
      for (let seed = 0; seed < 200; seed++) {
        const b = new Battle(team(['machop']), team(['squirtle']), seed);
        const before = b.active(1).hp;
        b.act(0, { type: 'move', slot: 0 }, { atk: grade, brace: 'none' });
        total += before - b.active(1).hp;
      }
      return total / 200;
    };
    expect(avg('perfect')).toBeGreaterThan(avg('miss') * 1.2);
  });

  it('every roster line can finish an AI battle', () => {
    for (const line of ROSTER) {
      const b = new Battle(team([line.id], true), team(['bulbasaur', 'charmander', 'squirtle'], true), 9);
      const r = autoBattle(b, [AI_PROFILES.normal, AI_PROFILES.normal], 9);
      expect(b.winner).not.toBeNull();
      expect(r.actions).toBeGreaterThan(2);
    }
  });
});

describe('move effects', () => {
  const setup = (a: string, b: string, seed = 11) => new Battle(team([a]), team([b]), seed);
  const useMove = (bt: Battle, side: 0 | 1, key: string, timing = { atk: 'none' as const, brace: 'none' as const }) => {
    const m = bt.active(side);
    m.moves[0] = { key, pp: 10, maxPp: 10 };
    return bt.act(side, { type: 'move', slot: 0 }, timing);
  };

  it('Explosion faints the user', () => {
    const bt = setup('geodude', 'squirtle');
    const ev = useMove(bt, 0, 'EXPLOSION');
    expect(bt.active(0).fainted).toBe(true);
    expect(ev.some((e) => e.t === 'faint' && e.side === 0)).toBe(true);
  });

  it('Giga Drain heals the user', () => {
    const bt = setup('bulbasaur', 'squirtle');
    bt.active(0).hp = 10;
    const ev = useMove(bt, 0, 'GIGA_DRAIN');
    const use = ev.find((e) => e.t === 'moveUse');
    if (use?.t === 'moveUse' && use.outcome === 'hit') expect(ev.some((e) => e.t === 'heal' && e.cause === 'drain')).toBe(true);
  });

  it('Magnitude reports its rolled base power on the hit (for the presentation)', () => {
    const seen = new Set<number>();
    for (let seed = 0; seed < 40; seed++) {
      const ev = useMove(setup('geodude', 'squirtle', seed), 0, 'MAGNITUDE');
      const use = ev.find((e) => e.t === 'moveUse');
      if (use?.t === 'moveUse' && use.hits[0]) seen.add(use.hits[0].power ?? -1);
    }
    expect([...seen].every((p) => [10, 30, 50, 70, 90, 110, 150].includes(p))).toBe(true);
    expect(seen.size).toBeGreaterThan(2);
  });

  it('a Pokemon put to sleep mid-Fly comes back down (no longer semi-invulnerable)', () => {
    const bt = setup('pidgey', 'squirtle');
    useMove(bt, 0, 'FLY');
    expect(bt.active(0).vol.semiInvulnerable).toBe(true);
    bt.active(0).status = 'slp';
    bt.active(0).statusCounter = 2;
    const ev = bt.act(0, { type: 'move', slot: 0 });
    expect(ev.some((e) => e.t === 'blocked' && e.reason === 'slp')).toBe(true);
    expect(bt.active(0).vol.semiInvulnerable).toBe(false);
    expect(bt.active(0).vol.charging).toBeNull();
  });

  it('Protect blocks the next attack', () => {
    const bt = setup('squirtle', 'machop', 3);
    useMove(bt, 0, 'PROTECT');
    expect(bt.active(0).vol.protect).toBeGreaterThan(0);
    const ev = useMove(bt, 1, 'KARATE_CHOP');
    const use = ev.find((e) => e.t === 'moveUse');
    expect(use?.t === 'moveUse' && use.outcome).toBe('protected');
  });

  it('Hyper Beam leaves the user with a negative gauge (recharge)', () => {
    for (let seed = 0; seed < 10; seed++) {
      const bt = setup('dratini', 'squirtle', seed);
      const ev = useMove(bt, 0, 'HYPER_BEAM');
      const use = ev.find((e) => e.t === 'moveUse');
      if (use?.t === 'moveUse' && use.outcome === 'hit') {
        expect(bt.active(0).atb).toBeLessThan(0);
        return;
      }
    }
  });

  it('Quick Attack refunds gauge (priority)', () => {
    const bt = setup('pidgey', 'geodude');
    useMove(bt, 0, 'QUICK_ATTACK');
    expect(bt.active(0).atb).toBeCloseTo(CONFIG.priorityAtb);
  });

  it('Solar Beam charges first, then strikes', () => {
    const bt = setup('houndour', 'squirtle');
    bt.active(0).moves[0] = { key: 'SOLAR_BEAM', pp: 10, maxPp: 10 };
    const ev1 = bt.act(0, { type: 'move', slot: 0 });
    expect(ev1.find((e) => e.t === 'moveUse' && e.outcome === 'charging')).toBeTruthy();
    expect(bt.forcedAction(0)).toEqual({ type: 'move', slot: 0 });
    const ev2 = bt.act(0, bt.forcedAction(0)!);
    expect(ev2.find((e) => e.t === 'moveUse' && e.outcome !== 'charging')).toBeTruthy();
  });

  it('Thunder Wave cannot paralyze Ground types', () => {
    const bt = setup('pikachu', 'geodude');
    useMove(bt, 0, 'THUNDER_WAVE');
    expect(bt.active(1).status).toBe('none');
  });

  it('switching resets stat stages', () => {
    const bt = new Battle(team(['machop', 'pidgey']), team(['squirtle']), 5);
    useMove(bt, 0, 'BULK_UP');
    expect(bt.active(0).boosts.atk).toBe(1);
    bt.act(0, { type: 'switch', index: 1 });
    expect(bt.sides[0].team[0].boosts.atk).toBe(0);
    expect(bt.active(0).lineId).toBe('pidgey');
  });
});

describe('phase 2 rules', () => {
  const useMove = (bt: Battle, side: 0 | 1, key: string) => {
    bt.active(side).moves[0] = { key, pp: 10, maxPp: 10 };
    return bt.act(side, { type: 'move', slot: 0 });
  };

  it('Splash does nothing', () => {
    const bt = new Battle(team(['magikarp']), team(['squirtle']), 1);
    const hp = bt.active(1).hp;
    const ev = useMove(bt, 0, 'SPLASH');
    expect(ev.some((e) => e.t === 'msg' && e.text.includes('nothing'))).toBe(true);
    expect(bt.active(1).hp).toBe(hp);
  });

  it('Belly Drum trades half HP for +6 Attack', () => {
    const bt = new Battle(team(['poliwag']), team(['squirtle']), 1);
    const m = bt.active(0);
    useMove(bt, 0, 'BELLY_DRUM');
    expect(m.boosts.atk).toBe(6);
    expect(m.hp).toBe(m.stats.hp - Math.floor(m.stats.hp / 2));
  });

  it('Water Absorb heals instead of taking water damage', () => {
    const bt = new Battle(team(['squirtle']), team(['poliwag']), 1);
    bt.active(1).hp = 10;
    const ev = useMove(bt, 0, 'WATER_GUN');
    const use = ev.find((e) => e.t === 'moveUse');
    if (use?.t === 'moveUse' && use.outcome !== 'miss') expect(bt.active(1).hp).toBeGreaterThan(10);
  });

  it('Magikarp gains evolution energy faster', () => {
    const a = new Battle(team(['magikarp']), team(['squirtle']), 1);
    const b = new Battle(team(['charmander']), team(['squirtle']), 1);
    a.tick(5);
    b.tick(5);
    expect(a.active(0).evo).toBeGreaterThan(b.active(0).evo * 2);
  });
});
