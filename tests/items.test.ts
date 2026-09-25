import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/battle/config';
import { Battle } from '../src/battle/engine';
import type { ItemId } from '../src/battle/items';
import { itemsForLine, suggestItem } from '../src/battle/items';
import { ROSTER } from '../src/data/roster';

const team = (lines: string[], items?: (ItemId | null)[]) => ({ name: 'T', lines, isAI: false, items });
const use = (bt: Battle, side: 0 | 1, key: string, slot = 0) => {
  bt.active(side).moves[slot] = { key, pp: 10, maxPp: 10 };
  return bt.act(side, { type: 'move', slot });
};

describe('held items', () => {
  it('Leftovers restore a little HP after each action', () => {
    const bt = new Battle(team(['squirtle'], ['leftovers']), team(['charmander']), 1);
    const m = bt.active(0);
    m.hp = Math.floor(m.stats.hp / 2);
    const ev = use(bt, 0, 'SPLASH');
    expect(ev.some((e) => e.t === 'item' && e.item === 'leftovers')).toBe(true);
    expect(ev.some((e) => e.t === 'heal' && e.cause === 'item' && e.amount === Math.floor(m.stats.hp * CONFIG.items.leftovers))).toBe(true);
  });

  it('Choice Band boosts physical hits and locks the first move used', () => {
    const plain = new Battle(team(['machop']), team(['squirtle']), 2);
    const band = new Battle(team(['machop'], ['choice_band']), team(['squirtle']), 2);
    expect(band.estimateDamage(0, 'KARATE_CHOP').max).toBeGreaterThan(plain.estimateDamage(0, 'KARATE_CHOP').max * 1.35);
    const m = band.active(0);
    m.moves = [
      { key: 'KARATE_CHOP', pp: 10, maxPp: 10 },
      { key: 'LOW_KICK', pp: 10, maxPp: 10 },
    ];
    band.act(0, { type: 'move', slot: 0 });
    expect(band.moveAllowed(0, 1)).toBe(false);
    const ev = band.act(0, { type: 'move', slot: 1 }); // redirected to the locked move
    expect(ev.find((e) => e.t === 'moveUse')).toMatchObject({ move: 'KARATE_CHOP' });
  });

  it('type boosters add 10% to moves of their type', () => {
    const plain = new Battle(team(['charmander']), team(['bulbasaur']), 3);
    const coal = new Battle(team(['charmander'], ['charcoal']), team(['bulbasaur']), 3);
    const a = plain.estimateDamage(0, 'FLAMETHROWER').max;
    expect(coal.estimateDamage(0, 'FLAMETHROWER').max).toBeGreaterThanOrEqual(Math.floor(a * 1.08));
    expect(coal.estimateDamage(0, 'SCRATCH').max).toBe(plain.estimateDamage(0, 'SCRATCH').max);
  });

  it('Sitrus Berry heals once at half HP; Rest + Lum Berry wakes up at once', () => {
    const bt = new Battle(team(['squirtle'], ['sitrus_berry']), team(['charmander']), 4);
    const m = bt.active(0);
    m.hp = Math.floor(m.stats.hp * 0.4);
    const ev = use(bt, 1, 'SPLASH');
    expect(ev.some((e) => e.t === 'item' && e.item === 'sitrus_berry' && e.side === 0)).toBe(true);
    expect(m.itemUsed).toBe(true);

    const rest = new Battle(team(['snorlax'], ['lum_berry']), team(['charmander']), 5);
    rest.active(0).hp = 50;
    use(rest, 0, 'REST');
    expect(rest.active(0).status).toBe('none');
    expect(rest.active(0).hp).toBe(rest.active(0).stats.hp);
  });

  it('Focus Band sometimes endures a knockout hit at 1 HP; White Herb restores lowered stats', () => {
    let endured = 0;
    for (let seed = 0; seed < 120; seed++) {
      const bt = new Battle(team(['machop']), team(['caterpie'], ['focus_band']), seed);
      bt.active(1).hp = 2;
      const ev = use(bt, 0, 'KARATE_CHOP');
      if (ev.some((e) => e.t === 'item' && e.item === 'focus_band')) {
        endured++;
        expect(bt.active(1).hp).toBe(1);
      }
    }
    expect(endured).toBeGreaterThan(2);

    const herb = new Battle(team(['charmander'], ['white_herb']), team(['bulbasaur']), 6);
    use(herb, 0, 'OVERHEAT');
    expect(herb.active(0).boosts.spa).toBe(0);
    expect(herb.active(0).itemUsed).toBe(true);
  });

  it('suggests a valid item for every roster line', () => {
    for (const l of ROSTER) expect(itemsForLine(l.id)).toContain(suggestItem(l.id));
  });
});
