// Shapes of the JSON files in ./generated (produced by tools/extract-firered.mjs
// from the pret/pokefirered decompilation). Keys are the decomp constant names
// without their prefix: species "CHARMANDER", moves "FLAMETHROWER", items "METAL_COAT".

/** The 17 Gen-3 types plus MYSTERY ("???", used only by Curse). */
export type PokeType =
  | 'NORMAL'
  | 'FIGHTING'
  | 'FLYING'
  | 'POISON'
  | 'GROUND'
  | 'ROCK'
  | 'BUG'
  | 'GHOST'
  | 'STEEL'
  | 'MYSTERY'
  | 'FIRE'
  | 'WATER'
  | 'GRASS'
  | 'ELECTRIC'
  | 'PSYCHIC'
  | 'ICE'
  | 'DRAGON'
  | 'DARK';

export interface StatBlock {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

/** EVO_* method without the prefix. */
export type EvolutionMethod =
  | 'FRIENDSHIP'
  | 'FRIENDSHIP_DAY'
  | 'FRIENDSHIP_NIGHT'
  | 'LEVEL'
  | 'TRADE'
  | 'TRADE_ITEM'
  | 'ITEM'
  | 'LEVEL_ATK_GT_DEF'
  | 'LEVEL_ATK_EQ_DEF'
  | 'LEVEL_ATK_LT_DEF'
  | 'LEVEL_SILCOON'
  | 'LEVEL_CASCOON'
  | 'LEVEL_NINJASK'
  | 'LEVEL_SHEDINJA'
  | 'BEAUTY';

export interface Evolution {
  method: EvolutionMethod;
  /** Level / friendship / beauty threshold, or an item key for ITEM and TRADE_ITEM. */
  param: number | string;
  /** Species key. */
  into: string;
}

export interface LevelUpMove {
  level: number;
  move: string;
}

export type GrowthRate = 'MEDIUM_FAST' | 'ERRATIC' | 'FLUCTUATING' | 'MEDIUM_SLOW' | 'FAST' | 'SLOW';

export interface SpeciesData {
  key: string;
  /** National dex number. */
  dex: number;
  name: string;
  types: PokeType[];
  base: StatBlock;
  abilities: string[];
  evolutions: Evolution[];
  /** Species key this one evolves from. */
  prevo: string | null;
  levelUp: LevelUpMove[];
  tmhm: string[];
  tutor: string[];
  egg: string[];
  category: string;
  heightDm: number;
  weightHg: number;
  dexEntry: string;
  /** Percent female; null when genderless. */
  genderRatio: number | null;
  growthRate: GrowthRate;
}

/** MOVE_TARGET_* without the prefix. */
export type MoveTarget =
  | 'SELECTED'
  | 'DEPENDS'
  | 'USER_OR_SELECTED'
  | 'RANDOM'
  | 'BOTH'
  | 'USER'
  | 'FOES_AND_ALLY'
  | 'OPPONENTS_FIELD';

export type MoveFlag =
  | 'MAKES_CONTACT'
  | 'PROTECT_AFFECTED'
  | 'MAGIC_COAT_AFFECTED'
  | 'SNATCH_AFFECTED'
  | 'MIRROR_MOVE_AFFECTED'
  | 'KINGS_ROCK_AFFECTED';

export type MoveCategory = 'physical' | 'special' | 'status';

export interface MoveData {
  key: string;
  name: string;
  type: PokeType;
  /** Raw power; fixed/variable-damage moves (Seismic Toss, Return, ...) use 1. */
  power: number;
  /** 0 means the move never misses / skips the accuracy check. */
  accuracy: number;
  pp: number;
  /** EFFECT_* without the prefix, e.g. "HIT", "BURN_HIT". */
  effect: string;
  /** Secondary effect chance in percent. */
  effectChance: number;
  target: MoveTarget;
  priority: number;
  flags: MoveFlag[];
  category: MoveCategory;
  description: string;
}

/** chart[attacker][defender]; missing entries are 1x. */
export type TypeChart = Partial<Record<PokeType, Partial<Record<PokeType, number>>>>;
