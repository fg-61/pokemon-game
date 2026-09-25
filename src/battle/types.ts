import type { PokeType, StatBlock } from '../data/types';

export type Side = 0 | 1; // 0 = player, 1 = opponent
export const other = (s: Side): Side => (s === 0 ? 1 : 0);

export type StatusCond = 'none' | 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz';
export type BoostStat = 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'acc' | 'eva';
export type Boosts = Record<BoostStat, number>;

/** Grade of an action-timing input (attack charge ring / defensive brace). */
export type TimingGrade = 'perfect' | 'good' | 'miss' | 'none';

export interface MoveSlot {
  key: string;
  pp: number;
  maxPp: number;
}

export interface Volatile {
  confusion: number; // own actions remaining
  leechSeed: boolean;
  focusEnergy: boolean;
  protect: number; // seconds of protection left (0 = none)
  protectChain: number; // consecutive successful protects
  charging: string | null; // two-turn move being charged
  semiInvulnerable: boolean; // Fly / Dig style
  locked: { move: string; left: number } | null; // Outrage / Thrash
  flashFire: boolean;
  lastMove: string | null;
  /** last damaging hit taken (Counter / Mirror Coat / Revenge) */
  lastTaken: { dmg: number; physical: boolean; at: number } | null;
  /** Transform: species copied and the original data to restore on switch-out */
  transformed: string | null;
  orig: { types: PokeType[]; stats: StatBlock; moves: MoveSlot[]; ability: string } | null;
}

export interface BattleMon {
  uid: string;
  lineId: string;
  speciesKey: string;
  stage: number; // index in the evolution line
  name: string;
  types: PokeType[];
  ability: string;
  level: number;
  stats: StatBlock; // computed stats (hp = max hp)
  hp: number;
  status: StatusCond;
  statusCounter: number; // sleep actions left / toxic counter
  boosts: Boosts;
  moves: MoveSlot[];
  /** Evolution energy 0..100 */
  evo: number;
  /** Active-time gauge. >= 1 means ready to act. Can be negative after recharge moves. */
  atb: number;
  fainted: boolean;
  vol: Volatile;
  // battle statistics (for result screen / balance sim)
  dealt: number;
  perfects: number;
}

export interface SideState {
  team: BattleMon[];
  active: number;
  reflect: number; // seconds left
  lightScreen: number;
  name: string;
  isAI: boolean;
}

export type Action =
  | { type: 'move'; slot: number }
  | { type: 'switch'; index: number }
  | { type: 'evolve' };

export interface HitResult {
  damage: number;
  hpAfter: number;
  eff: number; // type multiplier
  crit: boolean;
  timing: TimingGrade; // attacker grade
  brace: TimingGrade; // defender grade
}

export type BattleEvent =
  | {
      t: 'moveUse';
      side: Side;
      move: string;
      outcome: 'hit' | 'miss' | 'noEffect' | 'failed' | 'charging' | 'protected' | 'status';
      hits: HitResult[];
      target: Side;
    }
  | { t: 'damage'; side: Side; amount: number; hpAfter: number; cause: 'recoil' | 'psn' | 'brn' | 'leech' | 'confusion' | 'crash' }
  | { t: 'heal'; side: Side; amount: number; hpAfter: number; cause: 'drain' | 'move' | 'leech' | 'evolve' | 'ability' }
  | { t: 'status'; side: Side; status: StatusCond }
  | { t: 'cure'; side: Side; status: StatusCond | 'confusion' }
  | { t: 'blocked'; side: Side; reason: 'par' | 'slp' | 'frz' | 'recharge' }
  | { t: 'wake'; side: Side }
  | { t: 'thaw'; side: Side }
  | { t: 'confused'; side: Side } // "is confused!" (inflicted)
  | { t: 'confusedCheck'; side: Side } // "is confused..." (before acting)
  | { t: 'boost'; side: Side; stat: BoostStat; delta: number; capped: boolean }
  | { t: 'flinch'; side: Side; atbAfter: number }
  | { t: 'faint'; side: Side }
  | { t: 'switchOut'; side: Side; index: number }
  | { t: 'switchIn'; side: Side; index: number }
  | { t: 'evolve'; side: Side; from: string; to: string; newMoves: string[] }
  | { t: 'screen'; side: Side; screen: 'reflect' | 'lightScreen'; on: boolean }
  | { t: 'seeded'; side: Side }
  | { t: 'transform'; side: Side; into: string }
  | { t: 'ability'; side: Side; ability: string; text: string }
  | { t: 'msg'; text: string }
  | { t: 'evoGain'; side: Side; evo: number }
  | { t: 'end'; winner: Side };
