import type { Difficulty } from '../battle/ai';
import { Rng } from '../battle/rng';
import { SPECIES } from '../data/gamedata';
import { ROSTER, type RosterLine } from '../data/roster';
import type { PokeType } from '../data/types';

export interface Trainer {
  name: string;
  title: string;
  difficulty: Difficulty;
  lines: string[];
  theme: string; // arena theme id
  boss?: boolean;
}

const isLegendary = (l: RosterLine) => !!l.tags?.includes('legendary');
const types = (l: RosterLine) => new Set(l.stages.flatMap((s) => SPECIES[s.species].types as PokeType[]));
const finalBst = (l: RosterLine) => {
  const b = SPECIES[l.stages[l.stages.length - 1].species].base;
  return b.hp + b.atk + b.def + b.spa + b.spd + b.spe;
};
const ofTypes = (...ts: PokeType[]) => (l: RosterLine) => !isLegendary(l) && ts.some((t) => types(l).has(t));

/** Gauntlet ladder: 5 type-themed trainers with escalating AI. The Champion brings pseudo-legendaries and a legendary. */
const LADDER: { title: string; name: string; difficulty: Difficulty; pool: (l: RosterLine) => boolean; theme: string; boss?: boolean; legendary?: boolean }[] = [
  { title: 'Bug Catcher', name: 'Kaan', difficulty: 'easy', pool: ofTypes('BUG', 'NORMAL', 'FLYING'), theme: 'meadow' },
  { title: 'Hiker', name: 'Mert', difficulty: 'normal', pool: ofTypes('ROCK', 'GROUND', 'FIGHTING', 'ICE'), theme: 'snow' },
  { title: 'Psychic', name: 'Selin', difficulty: 'normal', pool: ofTypes('PSYCHIC', 'GHOST', 'DARK', 'POISON'), theme: 'night' },
  { title: 'Ace Trainer', name: 'Arda', difficulty: 'hard', pool: ofTypes('FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'STEEL'), theme: 'volcano' },
  { title: 'Champion', name: 'Ece', difficulty: 'hard', pool: (l) => !isLegendary(l) && finalBst(l) >= 540, theme: 'night', boss: true, legendary: true },
];

export function gauntlet(seed: number, avoid: string[] = []): Trainer[] {
  const rng = new Rng(seed);
  return LADDER.map((t) => {
    const pool = rng.shuffle(ROSTER.filter((l) => t.pool(l) && !avoid.includes(l.id)).map((l) => l.id));
    const lines = pool.slice(0, t.legendary ? 2 : 3);
    if (t.legendary) lines.push(rng.pick(ROSTER.filter(isLegendary)).id);
    while (lines.length < 3) lines.push(rng.pick(ROSTER.filter((l) => !lines.includes(l.id))).id);
    return { name: `${t.title} ${t.name}`, title: t.title, difficulty: t.difficulty, lines, theme: t.theme, boss: t.boss };
  });
}

export function randomTrainer(difficulty: Difficulty, seed = Date.now()): Trainer {
  const rng = new Rng(seed);
  const names = ['Rival Deniz', 'Ace Trainer Zeynep', 'Cooltrainer Emre', 'Lass Elif', 'Bird Keeper Can', 'Black Belt Burak', 'Beauty Aylin'];
  const themes = ['meadow', 'volcano', 'night', 'snow'];
  return {
    name: rng.pick(names),
    title: 'Trainer',
    difficulty,
    lines: rng.shuffle(ROSTER.map((l) => l.id)).slice(0, 3),
    theme: rng.pick(themes),
  };
}
