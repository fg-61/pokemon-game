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
