import type { PokeType } from './types';

/** Classic type colors (UI badges, platform runes). */
export const TYPE_COLOR: Record<PokeType, string> = {
  NORMAL: '#A8A878',
  FIRE: '#F08030',
  WATER: '#6890F0',
  ELECTRIC: '#F8D030',
  GRASS: '#78C850',
  ICE: '#98D8D8',
  FIGHTING: '#C03028',
  POISON: '#A040A0',
  GROUND: '#E0C068',
  FLYING: '#A890F0',
  PSYCHIC: '#F85888',
  BUG: '#A8B820',
  ROCK: '#B8A038',
  GHOST: '#705898',
  DRAGON: '#7038F8',
  DARK: '#705848',
  STEEL: '#B8B8D0',
  MYSTERY: '#68A090',
};

/** VFX palettes: core (hot/bright), main, dark (smoke/edges). Values > 1 are fine: they bloom. */
export const TYPE_FX: Record<PokeType, { core: number; main: number; dark: number }> = {
  NORMAL: { core: 0xffffff, main: 0xf4ecd0, dark: 0x9a9070 },
  FIRE: { core: 0xfff2a0, main: 0xff6a1a, dark: 0x6a1a08 },
  WATER: { core: 0xe8f8ff, main: 0x3a9aff, dark: 0x0a3a8a },
  ELECTRIC: { core: 0xffffff, main: 0xffe030, dark: 0x8a6a00 },
  GRASS: { core: 0xeaffc0, main: 0x5ad040, dark: 0x1a5a1a },
  ICE: { core: 0xffffff, main: 0x9ae8ff, dark: 0x3a7aa0 },
  FIGHTING: { core: 0xffe0c0, main: 0xff5a2a, dark: 0x7a1a10 },
  POISON: { core: 0xf0a0ff, main: 0xb040e0, dark: 0x4a0a5a },
  GROUND: { core: 0xfff0c0, main: 0xd0a050, dark: 0x6a4a20 },
  FLYING: { core: 0xffffff, main: 0xc8d8ff, dark: 0x7080b0 },
  PSYCHIC: { core: 0xffe0f8, main: 0xff4aa8, dark: 0x6a1a5a },
  BUG: { core: 0xf0ffb0, main: 0xb0d020, dark: 0x4a5a0a },
  ROCK: { core: 0xfff0d0, main: 0xb89a50, dark: 0x5a4a2a },
  GHOST: { core: 0xe0c8ff, main: 0x8a50ff, dark: 0x1a0a3a },
  DRAGON: { core: 0xe0d0ff, main: 0x7a4aff, dark: 0x2a0a7a },
  DARK: { core: 0xd0b0ff, main: 0x5a3a8a, dark: 0x0a0514 },
  STEEL: { core: 0xffffff, main: 0xc8d8e8, dark: 0x5a6a7a },
  MYSTERY: { core: 0xffffff, main: 0x68a090, dark: 0x2a4a40 },
};
