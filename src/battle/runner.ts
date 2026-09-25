import { MOVES } from '../data/gamedata';
import { chooseAction, chooseReplacement, rollTiming, type AIProfile } from './ai';
import type { Battle } from './engine';
import { Rng } from './rng';
import { other, type Side, type TimingGrade } from './types';

export interface SimResult {
  winner: Side;
  time: number;
  actions: number;
  evolutions: { side: Side; lineId: string; stage: number; time: number }[];
}

/** Run a battle to completion with AI on both sides (headless; used by the balance sim and tests). */
export function autoBattle(b: Battle, profiles: [AIProfile, AIProfile], seed = 1, maxTime = 900): SimResult {
  const rng = new Rng(seed);
  const res: SimResult = { winner: 0, time: 0, actions: 0, evolutions: [] };
  const queue: Side[] = [];
  const dt = 1 / 30;
  while (b.winner === null && b.time < maxTime) {
    for (const s of b.tick(dt)) queue.push(s);
    while (queue.length && b.winner === null) {
      const side = queue.shift()!;
      if (!b.isReady(side)) continue;
      const action = chooseAction(b, side, profiles[side], rng);
      let atk: TimingGrade = 'none';
      let brace: TimingGrade = 'none';
      if (action.type === 'move') {
        const mv = MOVES[b.active(side).moves[action.slot]?.key ?? 'STRUGGLE'];
        if (mv && mv.category !== 'status') {
          atk = rollTiming(rng, profiles[side].atkTiming);
          brace = rollTiming(rng, profiles[other(side)].braceTiming);
        }
      }
      const ev = b.act(side, action, { atk, brace });
      res.actions++;
      for (const e of ev) if (e.t === 'evolve') res.evolutions.push({ side: e.side, lineId: b.active(e.side).lineId, stage: b.active(e.side).stage, time: b.time });
      for (const s of [0, 1] as Side[]) {
        if (b.needsReplacement(s)) {
          b.replace(s, chooseReplacement(b, s));
          const qi = queue.indexOf(s);
          if (qi >= 0) queue.splice(qi, 1);
        }
      }
    }
  }
  res.winner = b.winner ?? (hpFrac(b, 0) >= hpFrac(b, 1) ? 0 : 1);
  res.time = b.time;
  return res;
}

function hpFrac(b: Battle, side: Side): number {
  const t = b.sides[side].team;
  return t.reduce((a, m) => a + m.hp / m.stats.hp, 0) / t.length;
}
