import { describe, expect, it } from 'vitest';
import { AI_PROFILES } from '../src/battle/ai';
import { Battle } from '../src/battle/engine';
import { autoBattle } from '../src/battle/runner';
import TRAINERS from '../src/data/generated/trainers.json';
import { ROSTER } from '../src/data/roster';
import { champion, earnBadge, ELITE_FOUR, GYMS, gymOpen, leagueOpen, lineOf, nextGym, type LeagueProgress } from '../src/game/league';

const fresh = (): LeagueProgress => ({ badges: [], titles: 0, hallOfFame: [] });

describe('Kanto League', () => {
  it('has the eight FireRed gyms and the Elite Four in order', () => {
    expect(GYMS.map((g) => g.name)).toEqual(['Brock', 'Misty', 'Lt. Surge', 'Erika', 'Koga', 'Sabrina', 'Blaine', 'Giovanni']);
    expect(ELITE_FOUR.map((g) => g.name)).toEqual(['Lorelei', 'Bruno', 'Agatha', 'Lance']);
  });

  it('fields only Pokémon from each trainer’s real FireRed party, as existing roster lines', () => {
    for (const st of [...GYMS, ...ELITE_FOUR, champion(['charmander']), champion(['squirtle']), champion(['bulbasaur'])]) {
      const party = TRAINERS[st.trainer].party.map((p) => p.species);
      for (const sp of st.species) expect(party, `${st.name}: ${sp}`).toContain(sp);
      expect(st.lines.length).toBeGreaterThanOrEqual(2);
      for (const id of st.lines) expect(ROSTER.some((l) => l.id === id)).toBe(true);
    }
  });

  it('maps a species to the line that reaches it earliest', () => {
    expect(lineOf('RAICHU')).toBe('pikachu');
    expect(lineOf('STARMIE')).toBe('staryu');
    expect(lineOf('GYARADOS')).toBe('magikarp');
  });

  it('gives the rival the starter that beats yours', () => {
    expect(champion(['charmander', 'abra', 'onix']).species).toContain('BLASTOISE');
    expect(champion(['squirtle', 'abra', 'onix']).species).toContain('VENUSAUR');
    expect(champion(['bulbasaur', 'abra', 'onix']).species).toContain('CHARIZARD');
    // no Kanto starter: counter-pick by type (a Fire/Rock/Ground team faces Blastoise)
    expect(champion(['growlithe', 'geodude', 'diglett']).species).toContain('BLASTOISE');
  });

  it('opens gyms in order and the League after eight badges', () => {
    let p = fresh();
    expect(nextGym(p)?.id).toBe('brock');
    expect(gymOpen(p, GYMS[1])).toBe(false);
    for (const g of GYMS) {
      expect(gymOpen(p, g)).toBe(true);
      p = earnBadge(p, g.id);
    }
    expect(nextGym(p)).toBeNull();
    expect(leagueOpen(p)).toBe(true);
    expect(gymOpen(p, GYMS[0])).toBe(true); // rematches stay open
  });

  it('applies the level bonus to the trainer side and plays out', () => {
    const st = ELITE_FOUR[3];
    const b = new Battle({ name: 'P', lines: ['charmander', 'pikachu', 'geodude'], isAI: true }, { name: st.name, lines: st.lines, isAI: true, levelBonus: st.levelBonus }, 5);
    const base = ROSTER.find((l) => l.id === st.lines[0])!.level;
    expect(b.active(1).level).toBe(base + st.levelBonus);
    const r = autoBattle(b, [AI_PROFILES.normal, AI_PROFILES[st.difficulty]], 5);
    expect([0, 1]).toContain(r.winner);
  });
});
