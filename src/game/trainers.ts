import type { Difficulty } from '../battle/ai';
import { Rng } from '../battle/rng';
import { ROSTER } from '../data/roster';

export interface Trainer {
  name: string;
  title: string;
  difficulty: Difficulty;
  lines: string[];
  theme: string; // arena theme id
  boss?: boolean;
}

/** Gauntlet ladder: 5 trainers, escalating AI. Teams are partly themed, partly random. */
const LADDER: { title: string; name: string; difficulty: Difficulty; pool: string[]; theme: string; boss?: boolean }[] = [
  { title: 'Youngster', name: 'Kaan', difficulty: 'easy', pool: ['pidgey', 'pikachu', 'geodude', 'machop'], theme: 'meadow' },
  { title: 'Hiker', name: 'Mert', difficulty: 'normal', pool: ['geodude', 'machop', 'seel', 'squirtle', 'houndour'], theme: 'snow' },
  { title: 'Psychic', name: 'Selin', difficulty: 'normal', pool: ['abra', 'gastly', 'bulbasaur', 'seel', 'scyther'], theme: 'night' },
  { title: 'Ace Trainer', name: 'Arda', difficulty: 'hard', pool: ['charmander', 'scyther', 'dratini', 'houndour', 'squirtle', 'abra'], theme: 'volcano' },
  { title: 'Champion', name: 'Ece', difficulty: 'hard', pool: ['dratini', 'charmander', 'gastly', 'machop', 'bulbasaur', 'squirtle', 'abra'], theme: 'night', boss: true },
];

export function gauntlet(seed: number, avoid: string[] = []): Trainer[] {
  const rng = new Rng(seed);
  return LADDER.map((t) => {
    const pool = rng.shuffle(t.pool.filter((p) => !avoid.includes(p) || t.pool.length - avoid.length < 3));
    const lines = pool.slice(0, 3);
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
