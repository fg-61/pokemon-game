import type { StatBlock } from '../data/types';
import type { BoostStat } from './types';
import { CONFIG } from './config';

/** All battlers use the same "competitive neutral" spread so base stats decide the matchup. */
export const BATTLE_LEVEL = 50;
export const IV = 31;
export const EV = 84; // 510 / 6, rounded down to a multiple of 4

/** Gen-3 stat formula (src/pokemon.c CalculateMonStats), neutral nature. */
export function calcStats(base: StatBlock, level = BATTLE_LEVEL): StatBlock {
  const other = (b: number) => Math.floor(((2 * b + IV + Math.floor(EV / 4)) * level) / 100) + 5;
  return {
    hp: Math.floor((Math.floor(((2 * base.hp + IV + Math.floor(EV / 4)) * level) / 100) + level + 10) * CONFIG.hpMultiplier),
    atk: other(base.atk),
    def: other(base.def),
    spa: other(base.spa),
    spd: other(base.spd),
    spe: other(base.spe),
  };
}

/** Gen-3 stat stage ratio table (gStatStageRatios). */
export function stageMultiplier(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

/** Gen-3 accuracy/evasion stage ratios (sAccuracyStageRatios). Index = stage + 6. */
const ACC_RATIOS: [number, number][] = [
  [33, 100], [36, 100], [43, 100], [50, 100], [60, 100], [75, 100],
  [1, 1],
  [133, 100], [166, 100], [2, 1], [233, 100], [133, 50], [3, 1],
];
export function accuracyMultiplier(stage: number): number {
  const s = Math.max(-6, Math.min(6, stage));
  const [n, d] = ACC_RATIOS[s + 6];
  return n / d;
}

/** Gen-3 critical hit chances by stage (sCriticalHitChance): 1/16, 1/8, 1/4, 1/3, 1/2 */
export function critChance(stage: number): number {
  return [1 / 16, 1 / 8, 1 / 4, 1 / 3, 1 / 2][Math.max(0, Math.min(4, stage))];
}

export const STAT_LABEL: Record<BoostStat, string> = {
  atk: 'Attack',
  def: 'Defense',
  spa: 'Sp. Atk',
  spd: 'Sp. Def',
  spe: 'Speed',
  acc: 'accuracy',
  eva: 'evasiveness',
};
