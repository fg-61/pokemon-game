import type { Difficulty } from '../battle/ai';
import { Rng } from '../battle/rng';
import { ROSTER } from '../data/roster';
import { t } from '../ui/i18n';
import type { LeagueStop } from './league';

export interface Trainer {
  name: string;
  title: string;
  difficulty: Difficulty;
  lines: string[];
  theme: string; // arena theme id
  boss?: boolean;
  /** level offset for the trainer's lines (League) */
  levelBonus?: number;
  /** front pic URL shown in the VS intro */
  pic?: string;
}

/** A League stop as a battle opponent ("Gym Leader Brock", "Elite Four Lorelei", "Champion Blue"). */
export function leagueTrainer(st: LeagueStop, difficulty: Difficulty = st.difficulty): Trainer {
  const title = st.kind === 'gym' ? t('gymLeader') : st.kind === 'elite' ? t('eliteFour') : t('championTitle');
  return {
    name: `${title} ${st.name}`,
    title,
    difficulty,
    lines: st.lines,
    theme: st.theme,
    boss: true,
    levelBonus: st.levelBonus,
    pic: `assets/trainers/${st.pic}.png`,
  };
}

export function randomTrainer(difficulty: Difficulty, seed = Date.now()): Trainer {
  const rng = new Rng(seed);
  const names = ['Rival Deniz', 'Ace Trainer Zeynep', 'Cooltrainer Emre', 'Lass Elif', 'Bird Keeper Can', 'Black Belt Burak', 'Beauty Aylin'];
  const themes = ['meadow', 'volcano', 'night', 'snow', 'quarry', 'cape', 'storm', 'indigo'];
  return {
    name: rng.pick(names),
    title: 'Trainer',
    difficulty,
    lines: rng.shuffle(ROSTER.map((l) => l.id)).slice(0, 3),
    theme: rng.pick(themes),
  };
}
