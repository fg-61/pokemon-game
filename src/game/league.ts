/**
 * Kanto League: FireRed's eight gym leaders, the Elite Four and the Champion with their real parties
 * (src/data/generated/trainers.json, extracted from pret/pokefirered). Each stop fields 2-3 picks from the
 * trainer's FireRed party (lead -> ace) as roster lines. Difficulty = AI profile + a level bonus on the trainer's lines,
 * tuned with `yarn sim --league` so random teams (normal AI) win ~90% vs Brock down to ~60% vs the Champion.
 * No DOM here except the guarded localStorage progress helpers.
 */
import type { Difficulty } from '../battle/ai';
import TRAINERS from '../data/generated/trainers.json';
import { SPECIES, typeMultiplier } from '../data/gamedata';
import { ROSTER } from '../data/roster';
import type { PokeType } from '../data/types';

export type StopKind = 'gym' | 'elite' | 'champion';
export type BadgeShape = 'octagon' | 'drop' | 'sun' | 'flower' | 'heart' | 'ring' | 'flame' | 'leaf';

export interface LeagueStop {
  id: string;
  kind: StopKind;
  /** key in trainers.json */
  trainer: keyof typeof TRAINERS;
  name: string;
  city: string;
  type: PokeType;
  /** FireRed party members this stop fields, lead -> ace */
  species: string[];
  /** roster line ids for `species` */
  lines: string[];
  theme: string;
  difficulty: Difficulty;
  levelBonus: number;
  /** front pic (public/assets/trainers/<pic>.png) */
  pic: string;
  badge?: { name: string; color: string; shape: BadgeShape };
}

/** The roster line that reaches `species` at the earliest stage (Raichu -> the Pikachu line, not Pichu's). */
export function lineOf(species: string): string {
  let best: { id: string; i: number } | null = null;
  for (const l of ROSTER) {
    const i = l.stages.findIndex((s) => s.species === species);
    if (i >= 0 && (!best || i < best.i)) best = { id: l.id, i };
  }
  if (!best) throw new Error(`no roster line reaches ${species}`);
  return best.id;
}

type StopDef = Omit<LeagueStop, 'lines' | 'pic' | 'name'> & { name?: string };

const stop = (d: StopDef): LeagueStop => ({
  ...d,
  name: d.name ?? TRAINERS[d.trainer].name,
  pic: TRAINERS[d.trainer].pic,
  lines: d.species.map(lineOf),
});

export const GYMS: LeagueStop[] = [
  stop({ id: 'brock', kind: 'gym', trainer: 'LEADER_BROCK', city: 'Pewter City', type: 'ROCK', species: ['GEODUDE', 'ONIX'], theme: 'quarry', difficulty: 'easy', levelBonus: -2, badge: { name: 'Boulder Badge', color: '#a9aab4', shape: 'octagon' } }),
  stop({ id: 'misty', kind: 'gym', trainer: 'LEADER_MISTY', city: 'Cerulean City', type: 'WATER', species: ['STARYU', 'STARMIE'], theme: 'cape', difficulty: 'easy', levelBonus: 4, badge: { name: 'Cascade Badge', color: '#4ea9f2', shape: 'drop' } }),
  stop({ id: 'surge', kind: 'gym', trainer: 'LEADER_LT_SURGE', city: 'Vermilion City', type: 'ELECTRIC', species: ['VOLTORB', 'PIKACHU', 'RAICHU'], theme: 'storm', difficulty: 'easy', levelBonus: -1, badge: { name: 'Thunder Badge', color: '#f2a93a', shape: 'sun' } }),
  stop({ id: 'erika', kind: 'gym', trainer: 'LEADER_ERIKA', city: 'Celadon City', type: 'GRASS', species: ['TANGELA', 'VICTREEBEL', 'VILEPLUME'], theme: 'meadow', difficulty: 'normal', levelBonus: -4, badge: { name: 'Rainbow Badge', color: '#7ad06a', shape: 'flower' } }),
  stop({ id: 'koga', kind: 'gym', trainer: 'LEADER_KOGA', city: 'Fuchsia City', type: 'POISON', species: ['KOFFING', 'MUK', 'WEEZING'], theme: 'night', difficulty: 'normal', levelBonus: -5, badge: { name: 'Soul Badge', color: '#e8649f', shape: 'heart' } }),
  stop({ id: 'sabrina', kind: 'gym', trainer: 'LEADER_SABRINA', city: 'Saffron City', type: 'PSYCHIC', species: ['MR_MIME', 'VENOMOTH', 'ALAKAZAM'], theme: 'night', difficulty: 'normal', levelBonus: -3, badge: { name: 'Marsh Badge', color: '#e9c43a', shape: 'ring' } }),
  stop({ id: 'blaine', kind: 'gym', trainer: 'LEADER_BLAINE', city: 'Cinnabar Island', type: 'FIRE', species: ['GROWLITHE', 'RAPIDASH', 'ARCANINE'], theme: 'volcano', difficulty: 'normal', levelBonus: -2, badge: { name: 'Volcano Badge', color: '#ee5236', shape: 'flame' } }),
  stop({ id: 'giovanni', kind: 'gym', trainer: 'LEADER_GIOVANNI', city: 'Viridian City', type: 'GROUND', species: ['DUGTRIO', 'NIDOKING', 'RHYHORN'], theme: 'quarry', difficulty: 'normal', levelBonus: -2, badge: { name: 'Earth Badge', color: '#5fbf62', shape: 'leaf' } }),
];

export const ELITE_FOUR: LeagueStop[] = [
  stop({ id: 'lorelei', kind: 'elite', trainer: 'ELITE_FOUR_LORELEI', city: 'Indigo Plateau', type: 'ICE', species: ['CLOYSTER', 'JYNX', 'LAPRAS'], theme: 'snow', difficulty: 'hard', levelBonus: -5 }),
  stop({ id: 'bruno', kind: 'elite', trainer: 'ELITE_FOUR_BRUNO', city: 'Indigo Plateau', type: 'FIGHTING', species: ['ONIX', 'HITMONLEE', 'MACHAMP'], theme: 'quarry', difficulty: 'hard', levelBonus: -5 }),
  stop({ id: 'agatha', kind: 'elite', trainer: 'ELITE_FOUR_AGATHA', city: 'Indigo Plateau', type: 'GHOST', species: ['GOLBAT', 'ARBOK', 'GENGAR'], theme: 'night', difficulty: 'hard', levelBonus: -5 }),
  stop({ id: 'lance', kind: 'elite', trainer: 'ELITE_FOUR_LANCE', city: 'Indigo Plateau', type: 'DRAGON', species: ['GYARADOS', 'AERODACTYL', 'DRAGONITE'], theme: 'indigo', difficulty: 'hard', levelBonus: -5 }),
];

/** The rival's three possible Champion parties, keyed by the starter he took. */
const CHAMPIONS = {
  BLASTOISE: 'CHAMPION_FIRST_SQUIRTLE',
  VENUSAUR: 'CHAMPION_FIRST_BULBASAUR',
  CHARIZARD: 'CHAMPION_FIRST_CHARMANDER',
} as const;

const finalTypes = (lineId: string) => {
  const l = ROSTER.find((x) => x.id === lineId);
  return l ? (SPECIES[l.stages[l.stages.length - 1].species].types as PokeType[]) : [];
};

/**
 * The Champion (the rival, "Blue") takes the starter that beats yours, like in FireRed; if your team has no Kanto
 * starter he counter-picks the one with the best type matchup against your team's final forms.
 */
export function champion(playerLines: string[]): LeagueStop {
  let ace: keyof typeof CHAMPIONS;
  if (playerLines.includes('charmander')) ace = 'BLASTOISE';
  else if (playerLines.includes('squirtle')) ace = 'VENUSAUR';
  else if (playerLines.includes('bulbasaur')) ace = 'CHARIZARD';
  else {
    const score = (sp: keyof typeof CHAMPIONS) =>
      playerLines.reduce((sum, l) => sum + Math.max(...(SPECIES[sp].types as PokeType[]).map((t) => typeMultiplier(t, finalTypes(l)))), 0);
    ace = (Object.keys(CHAMPIONS) as (keyof typeof CHAMPIONS)[]).reduce((a, b) => (score(b) > score(a) ? b : a));
  }
  return stop({ id: 'champion', kind: 'champion', trainer: CHAMPIONS[ace], name: 'Blue', city: 'Indigo Plateau', type: 'NORMAL', species: ['PIDGEOT', 'ALAKAZAM', ace], theme: 'indigo', difficulty: 'hard', levelBonus: -6 });
}

// ------------------------------------------------------------------ progress (localStorage, every access guarded)

export interface LeagueProgress {
  /** ids of beaten gyms */
  badges: string[];
  /** times the Champion was beaten */
  titles: number;
  hallOfFame: { lines: string[]; at: number }[];
}

const KEY = 'pba.league.v1';

export function loadLeague(): LeagueProgress {
  const empty: LeagueProgress = { badges: [], titles: 0, hallOfFame: [] };
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<LeagueProgress>;
      return { badges: (p.badges ?? []).filter((b) => GYMS.some((g) => g.id === b)), titles: p.titles ?? 0, hallOfFame: p.hallOfFame ?? [] };
    }
  } catch {
    /* ignore */
  }
  return empty;
}

export function saveLeague(p: LeagueProgress) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** The next gym to challenge (gyms are taken in FireRed order), or null once all eight badges are won. */
export function nextGym(p: LeagueProgress): LeagueStop | null {
  return GYMS.find((g) => !p.badges.includes(g.id)) ?? null;
}

/** Beaten gyms can be re-challenged; the next one is open; later ones stay locked. */
export function gymOpen(p: LeagueProgress, g: LeagueStop): boolean {
  return p.badges.includes(g.id) || nextGym(p)?.id === g.id;
}

export const leagueOpen = (p: LeagueProgress) => GYMS.every((g) => p.badges.includes(g.id));

export function earnBadge(p: LeagueProgress, gymId: string): LeagueProgress {
  if (!p.badges.includes(gymId)) p.badges = [...p.badges, gymId];
  saveLeague(p);
  return p;
}

export function enterHallOfFame(p: LeagueProgress, lines: string[]): LeagueProgress {
  p.titles++;
  p.hallOfFame = [{ lines, at: Date.now() }, ...p.hallOfFame].slice(0, 20);
  saveLeague(p);
  return p;
}
