import { describe, expect, it } from 'vitest';
import { MOVES, SPECIES, TYPECHART, speciesByDex, typeMultiplier } from '../src/data/gamedata';

describe('FireRed species data', () => {
  it('has all 386 national dex species', () => {
    expect(Object.keys(SPECIES)).toHaveLength(386);
    for (let dex = 1; dex <= 386; dex++) expect(speciesByDex(dex)?.dex).toBe(dex);
  });

  it('Charmander line', () => {
    const charmander = SPECIES.CHARMANDER;
    expect(charmander.dex).toBe(4);
    expect(charmander.name).toBe('Charmander');
    expect(charmander.types).toEqual(['FIRE']);
    expect(charmander.base).toEqual({ hp: 39, atk: 52, def: 43, spa: 60, spd: 50, spe: 65 });
    expect(charmander.abilities).toEqual(['BLAZE']);
    expect(charmander.evolutions).toEqual([{ method: 'LEVEL', param: 16, into: 'CHARMELEON' }]);
    expect(SPECIES.CHARMELEON.evolutions).toEqual([{ method: 'LEVEL', param: 36, into: 'CHARIZARD' }]);
    expect(SPECIES.CHARMELEON.prevo).toBe('CHARMANDER');
    expect(SPECIES.CHARIZARD.prevo).toBe('CHARMELEON');
    expect(SPECIES.CHARIZARD.types).toEqual(['FIRE', 'FLYING']);
    expect(SPECIES.CHARIZARD.evolutions).toEqual([]);
    expect(charmander.prevo).toBeNull();
  });

  it('uses national dex numbers for Hoenn species', () => {
    expect(SPECIES.TREECKO.dex).toBe(252);
    expect(speciesByDex(252)?.key).toBe('TREECKO');
  });

  it('item and trade evolutions', () => {
    expect(SPECIES.SCYTHER.evolutions).toEqual([{ method: 'TRADE_ITEM', param: 'METAL_COAT', into: 'SCIZOR' }]);
    expect(SPECIES.PIKACHU.evolutions).toEqual([{ method: 'ITEM', param: 'THUNDER_STONE', into: 'RAICHU' }]);
  });

  it('display names', () => {
    expect(SPECIES.MR_MIME.name).toBe('Mr. Mime');
    expect(SPECIES.NIDORAN_M.name).toBe('Nidoran♂');
    expect(SPECIES.FARFETCHD.name).toBe("Farfetch'd");
    expect(SPECIES.HO_OH.name).toBe('Ho-Oh');
  });

  it('learnsets reference known moves', () => {
    expect(SPECIES.CHARMANDER.levelUp[0]).toEqual({ level: 1, move: 'SCRATCH' });
    expect(SPECIES.CHARMANDER.tmhm).toContain('FLAMETHROWER');
    expect(SPECIES.CHARIZARD.tutor).toContain('BLAST_BURN');
    for (const s of Object.values(SPECIES)) {
      for (const move of [...s.levelUp.map((l) => l.move), ...s.tmhm, ...s.tutor, ...s.egg]) {
        expect(MOVES[move], `${s.key}: ${move}`).toBeDefined();
      }
    }
  });
});

describe('FireRed move data', () => {
  it('Flamethrower', () => {
    expect(MOVES.FLAMETHROWER).toMatchObject({
      name: 'Flamethrower',
      type: 'FIRE',
      power: 95,
      accuracy: 100,
      pp: 15,
      effect: 'BURN_HIT',
      effectChance: 10,
      category: 'special',
    });
  });

  it('categories follow the Gen-3 type split', () => {
    expect(MOVES.TACKLE.category).toBe('physical');
    expect(MOVES.SHADOW_BALL.category).toBe('physical');
    expect(MOVES.CRUNCH.category).toBe('special');
    expect(MOVES.GROWL.category).toBe('status');
    expect(MOVES.SEISMIC_TOSS).toMatchObject({ power: 1, category: 'physical' });
    expect(MOVES.DRAGON_RAGE).toMatchObject({ power: 1, category: 'special' });
  });

  it('restores word breaks in truncated names', () => {
    expect(MOVES.THUNDER_PUNCH.name).toBe('Thunder Punch');
    expect(MOVES.DOUBLE_EDGE.name).toBe('Double-Edge');
    expect(MOVES.SOFT_BOILED.name).toBe('Soft-Boiled');
  });
});

describe('type chart', () => {
  it('single matchups', () => {
    expect(TYPECHART.FIRE?.GRASS).toBe(2);
    expect(TYPECHART.NORMAL?.GHOST).toBe(0);
    expect(TYPECHART.ELECTRIC?.GROUND).toBe(0);
    expect(TYPECHART.FIRE?.NORMAL).toBeUndefined();
  });

  it('typeMultiplier combines both defender types', () => {
    expect(typeMultiplier('FIRE', ['GRASS'])).toBe(2);
    expect(typeMultiplier('ICE', ['DRAGON', 'FLYING'])).toBe(4);
    expect(typeMultiplier('FIRE', ['WATER', 'ROCK'])).toBe(0.25);
    expect(typeMultiplier('ELECTRIC', ['WATER', 'GROUND'])).toBe(0);
    expect(typeMultiplier('NORMAL', ['NORMAL'])).toBe(1);
  });
});
