import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/battle/config';
import { Battle } from '../src/battle/engine';
import type { BattleEvent } from '../src/battle/types';

const team = (lines: string[]) => ({ name: 'T', lines, isAI: false });
const use = (bt: Battle, side: 0 | 1, key: string) => {
  bt.active(side).moves[0] = { key, pp: 10, maxPp: 10 };
  return bt.act(side, { type: 'move', slot: 0 });
};
const moveUse = (ev: BattleEvent[]) => ev.find((e) => e.t === 'moveUse') as Extract<BattleEvent, { t: 'moveUse' }> | undefined;

describe('weather', () => {
  it('Sunny Day brings harsh sunlight: Fire x1.5, Water x0.5', () => {
    const bt = new Battle(team(['charmander']), team(['squirtle']), 1);
    const ember = bt.estimateDamage(0, 'EMBER').max;
    const water = bt.estimateDamage(1, 'WATER_GUN').max;
    const ev = use(bt, 0, 'SUNNY_DAY');
    expect(ev.some((e) => e.t === 'weather' && e.kind === 'sun' && e.source === 'move')).toBe(true);
    expect(bt.weatherNow()).toBe('sun');
    expect(bt.estimateDamage(0, 'EMBER').max).toBeGreaterThan(ember * 1.35);
    expect(bt.estimateDamage(1, 'WATER_GUN').max).toBeLessThan(water * 0.65);
    // a second Sunny Day fails while the sun is still up
    expect(use(bt, 0, 'SUNNY_DAY').some((e) => e.t === 'msg' && e.text.includes('failed'))).toBe(true);
  });

  it('wears off after its duration and announces it', () => {
    const bt = new Battle(team(['squirtle']), team(['charmander']), 2);
    use(bt, 0, 'RAIN_DANCE');
    bt.tick(CONFIG.weather.moveSeconds + 0.1);
    expect(bt.weatherNow()).toBeNull();
    const ev = use(bt, 1, 'SPLASH');
    expect(ev.some((e) => e.t === 'weather' && e.kind === 'rain' && e.source === 'end')).toBe(true);
    expect(bt.weather).toBeNull();
  });

  it('rain makes Thunder unmissable; sun lets Solar Beam fire at once', () => {
    for (let seed = 0; seed < 30; seed++) {
      const bt = new Battle(team(['pikachu']), team(['squirtle']), seed);
      bt.weather = { kind: 'rain', left: 99 };
      expect(moveUse(use(bt, 0, 'THUNDER'))?.outcome).not.toBe('miss');
    }
    const bt = new Battle(team(['bulbasaur']), team(['squirtle']), 3);
    bt.weather = { kind: 'sun', left: 99 };
    expect(moveUse(use(bt, 0, 'SOLAR_BEAM'))?.outcome).not.toBe('charging');
  });

  it('Tyranitar whips up a sandstorm when it evolves; sand hurts non Rock/Ground/Steel', () => {
    const bt = new Battle(team(['larvitar']), team(['squirtle']), 4);
    const mon = bt.active(0);
    mon.stage = 1;
    mon.evo = CONFIG.evo.max;
    const ev = bt.act(0, { type: 'evolve' });
    expect(mon.speciesKey).toBe('TYRANITAR');
    expect(ev.some((e) => e.t === 'weather' && e.kind === 'sand' && e.source === 'ability')).toBe(true);
    expect(use(bt, 1, 'SPLASH').some((e) => e.t === 'damage' && e.cause === 'sand' && e.side === 1)).toBe(true);
    expect(use(bt, 0, 'SPLASH').some((e) => e.t === 'damage' && e.cause === 'sand')).toBe(false);
  });

  it('Drought sets the sun as soon as Groudon leads', () => {
    const bt = new Battle(team(['groudon']), team(['squirtle']), 5);
    const ev = bt.start();
    expect(ev.some((e) => e.t === 'ability' && e.ability === 'DROUGHT')).toBe(true);
    expect(bt.weatherNow()).toBe('sun');
    expect(bt.weather?.left).toBe(CONFIG.weather.abilitySeconds);
  });

  it('Swift Swim speeds up in rain; Air Lock cancels weather; Forecast follows it', () => {
    const karp = new Battle(team(['magikarp']), team(['squirtle']), 6);
    const r0 = karp.atbRate(karp.active(0));
    karp.weather = { kind: 'rain', left: 99 };
    expect(karp.atbRate(karp.active(0))).toBeGreaterThan(r0 * 1.3);

    const ray = new Battle(team(['rayquaza']), team(['squirtle']), 7);
    ray.weather = { kind: 'sun', left: 99 };
    expect(ray.weatherNow()).toBeNull();

    const cast = new Battle(team(['castform']), team(['squirtle']), 8);
    use(cast, 0, 'SUNNY_DAY');
    expect(cast.active(0).types).toEqual(['FIRE']);
  });
});
