/**
 * Held items (Gen 3 / FireRed items, adapted to the ATB timeline). Pure data + a role-based picker for AI teams.
 * The effects are resolved in `engine.ts`; every number lives in `CONFIG.items`.
 */
import { MOVES, SPECIES } from '../data/gamedata';
import { getLine } from '../data/roster';
import type { PokeType } from '../data/types';
import type { Rng } from './rng';

/** Type-boosting items (+10% to moves of their type in Gen 3). */
export const TYPE_BOOSTERS = {
  silk_scarf: 'NORMAL',
  charcoal: 'FIRE',
  mystic_water: 'WATER',
  magnet: 'ELECTRIC',
  miracle_seed: 'GRASS',
  never_melt_ice: 'ICE',
  black_belt: 'FIGHTING',
  poison_barb: 'POISON',
  soft_sand: 'GROUND',
  sharp_beak: 'FLYING',
  twisted_spoon: 'PSYCHIC',
  silver_powder: 'BUG',
  hard_stone: 'ROCK',
  spell_tag: 'GHOST',
  dragon_fang: 'DRAGON',
  black_glasses: 'DARK',
  metal_coat: 'STEEL',
} as const satisfies Record<string, PokeType>;

export type BoosterId = keyof typeof TYPE_BOOSTERS;
export type ItemId =
  | 'leftovers'
  | 'choice_band'
  | 'scope_lens'
  | 'quick_claw'
  | 'focus_band'
  | 'lum_berry'
  | 'sitrus_berry'
  | 'shell_bell'
  | 'kings_rock'
  | 'white_herb'
  | 'bright_powder'
  | BoosterId;

export interface ItemInfo {
  /** FireRed name */
  name: string;
  /** used once, then gone */
  consumable?: boolean;
  /** type boosted by a type item */
  boost?: PokeType;
}

const NAMES: Record<string, string> = {
  leftovers: 'Leftovers',
  choice_band: 'Choice Band',
  scope_lens: 'Scope Lens',
  quick_claw: 'Quick Claw',
  focus_band: 'Focus Band',
  lum_berry: 'Lum Berry',
  sitrus_berry: 'Sitrus Berry',
  shell_bell: 'Shell Bell',
  kings_rock: "King's Rock",
  white_herb: 'White Herb',
  bright_powder: 'BrightPowder',
  silk_scarf: 'Silk Scarf',
  charcoal: 'Charcoal',
  mystic_water: 'Mystic Water',
  magnet: 'Magnet',
  miracle_seed: 'Miracle Seed',
  never_melt_ice: 'NeverMeltIce',
  black_belt: 'Black Belt',
  poison_barb: 'Poison Barb',
  soft_sand: 'Soft Sand',
  sharp_beak: 'Sharp Beak',
  twisted_spoon: 'TwistedSpoon',
  silver_powder: 'SilverPowder',
  hard_stone: 'Hard Stone',
  spell_tag: 'Spell Tag',
  dragon_fang: 'Dragon Fang',
  black_glasses: 'BlackGlasses',
  metal_coat: 'Metal Coat',
};

export const ITEMS = Object.fromEntries(
  Object.entries(NAMES).map(([id, name]) => [
    id,
    { name, consumable: ['lum_berry', 'sitrus_berry', 'white_herb'].includes(id) || undefined, boost: (TYPE_BOOSTERS as Record<string, PokeType>)[id] },
  ]),
) as Record<ItemId, ItemInfo>;

export const ITEM_IDS = Object.keys(NAMES) as ItemId[];
/** The general-purpose items (every type booster is offered separately, filtered by the Pokemon's types). */
export const GENERAL_ITEMS: ItemId[] = ['leftovers', 'choice_band', 'scope_lens', 'quick_claw', 'focus_band', 'lum_berry', 'sitrus_berry', 'shell_bell', 'kings_rock', 'white_herb', 'bright_powder'];

export const boosterFor = (type: PokeType): BoosterId | undefined => (Object.keys(TYPE_BOOSTERS) as BoosterId[]).find((k) => TYPE_BOOSTERS[k] === type);

/** Icon slug in the PokeAPI item sprites (public/assets/items/<slug>.png). */
export const itemIcon = (id: ItemId) => `assets/items/${id.replace(/_/g, '-')}.png`;

/** Items that make sense for a line: the general ones + boosters for the types its moves use. */
export function itemsForLine(lineId: string): ItemId[] {
  const line = getLine(lineId);
  const types = new Set<PokeType>();
  for (const st of line.stages) for (const m of st.moves) if (MOVES[m].category !== 'status') types.add(MOVES[m].type as PokeType);
  const boosters = [...types].map(boosterFor).filter((b): b is BoosterId => !!b);
  return [...GENERAL_ITEMS, ...boosters];
}

/**
 * A sensible item for a line (AI trainers, the team-select default): Choice Band for strong physical attackers,
 * Leftovers for walls, a booster for the main attacking type, a berry or a utility item otherwise.
 */
export function suggestItem(lineId: string, rng?: Rng): ItemId {
  const line = getLine(lineId);
  const last = line.stages[line.stages.length - 1];
  const b = SPECIES[last.species].base;
  const moves = last.moves.map((m) => MOVES[m]);
  const attacks = moves.filter((m) => m.category !== 'status');
  const physical = attacks.filter((m) => m.category === 'physical').length;
  const r = rng ? rng.next() : 0.5;
  const bulk = b.hp + b.def + b.spd;
  if (b.atk >= 100 && physical >= 2 && b.atk > b.spa && r < 0.5) return 'choice_band';
  if (bulk >= 270 && r < 0.6) return 'leftovers';
  // most used attacking type (STAB first)
  const count = new Map<PokeType, number>();
  for (const m of attacks) count.set(m.type as PokeType, (count.get(m.type as PokeType) ?? 0) + (SPECIES[last.species].types.includes(m.type) ? 2 : 1));
  const main = [...count.entries()].sort((a, c) => c[1] - a[1])[0]?.[0];
  if (main && r < 0.8) return boosterFor(main) ?? 'sitrus_berry';
  const pool: ItemId[] = b.spe >= 100 ? ['scope_lens', 'focus_band', 'shell_bell'] : ['sitrus_berry', 'lum_berry', 'quick_claw'];
  return pool[Math.floor(r * 97) % pool.length];
}
