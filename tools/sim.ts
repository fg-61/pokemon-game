/**
 * Balance simulator: AI-vs-AI battles across the roster.
 *   yarn sim            -> random 3v3 teams, per-line win rates + evolution stats
 *   yarn sim --n 4000   -> more battles
 *   yarn sim --duel     -> 1v1 round-robin matrix (line vs line)
 *   yarn sim --ai hard  -> AI profile used by both sides (easy|normal|hard)
 * Healthy targets: every line's 3v3 win rate within 42-58%, avg battle 60-150 s of ATB time,
 * most lines evolving at least once per battle they survive long enough in.
 */
import { AI_PROFILES, type Difficulty } from '../src/battle/ai';
import { Battle } from '../src/battle/engine';
import { Rng } from '../src/battle/rng';
import { autoBattle } from '../src/battle/runner';
import { ROSTER } from '../src/data/roster';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const N = Number(opt('n', '2000'));
const ai = AI_PROFILES[opt('ai', 'normal') as Difficulty];
const ids = ROSTER.map((l) => l.id);
const rng = new Rng(12345);

if (args.includes('--duel')) {
  const per = Math.max(20, Math.floor(N / ids.length));
  const wins: Record<string, number> = {};
  console.log(`1v1 duels, ${per} per pairing (row = win % vs column)\n`);
  console.log('            ' + ids.map((i) => i.slice(0, 5).padStart(6)).join(''));
  for (const a of ids) {
    let row = a.padEnd(12);
    let tot = 0;
    for (const b of ids) {
      let w = 0;
      for (let k = 0; k < per; k++) {
        const bt = new Battle({ name: 'A', lines: [a], isAI: true }, { name: 'B', lines: [b], isAI: true }, rng.int(0, 2 ** 31));
        if (autoBattle(bt, [ai, ai], rng.int(0, 2 ** 31)).winner === 0) w++;
      }
      tot += w / per;
      row += String(Math.round((100 * w) / per)).padStart(6);
    }
    wins[a] = tot / ids.length;
    console.log(row + `   avg ${(100 * wins[a]).toFixed(1)}%`);
  }
  process.exit(0);
}

interface LineStat {
  games: number;
  wins: number;
  evo1: number;
  evo2: number;
  evoTime: number;
  evoCount: number;
}
const stats: Record<string, LineStat> = Object.fromEntries(ids.map((i) => [i, { games: 0, wins: 0, evo1: 0, evo2: 0, evoTime: 0, evoCount: 0 }]));
let totalTime = 0;
let totalActions = 0;

for (let g = 0; g < N; g++) {
  const pick = () => rng.shuffle([...ids]).slice(0, 3);
  const A = pick();
  const B = pick();
  const bt = new Battle({ name: 'A', lines: A, isAI: true }, { name: 'B', lines: B, isAI: true }, rng.int(0, 2 ** 31));
  const r = autoBattle(bt, [ai, ai], rng.int(0, 2 ** 31));
  totalTime += r.time;
  totalActions += r.actions;
  [A, B].forEach((team, side) => {
    for (const id of team) {
      stats[id].games++;
      if (r.winner === side) stats[id].wins++;
    }
  });
  for (const e of r.evolutions) {
    const s = stats[e.lineId];
    if (e.stage === 1) s.evo1++;
    if (e.stage === 2) s.evo2++;
    s.evoTime += e.time;
    s.evoCount++;
  }
}

console.log(`${N} random 3v3 battles (AI: ${opt('ai', 'normal')}) — avg ${(totalTime / N).toFixed(1)} s ATB time, ${(totalActions / N).toFixed(1)} actions\n`);
console.log('line          win%   evo1/game  evo2/game  avg evo time');
const rows = ids
  .map((id) => ({ id, ...stats[id], wr: stats[id].wins / Math.max(1, stats[id].games) }))
  .sort((a, b) => b.wr - a.wr);
for (const r of rows) {
  const flag = r.wr > 0.58 ? '  <-- strong' : r.wr < 0.42 ? '  <-- weak' : '';
  console.log(
    `${r.id.padEnd(12)} ${(100 * r.wr).toFixed(1).padStart(5)}   ${(r.evo1 / r.games).toFixed(2).padStart(8)}  ${(r.evo2 / r.games).toFixed(2).padStart(9)}  ${(r.evoTime / Math.max(1, r.evoCount)).toFixed(1).padStart(10)}s${flag}`,
  );
}
