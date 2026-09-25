/**
 * Auto-balances per-line levels with the AI-vs-AI simulator and writes src/data/levels.json.
 *
 *   yarn levels:tune                       # 6 iterations x 24000 battles, 4 worker processes
 *   yarn levels:tune --iters 3 --n 12000   # quicker pass after small changes
 *   yarn levels:tune --only onix,larvitar  # only adjust these lines (others stay fixed)
 *
 * Each iteration plays random 3v3 battles across the whole roster, then moves every line's level by
 * round((0.5 - winRate) * 25), clamped to ±3 and to [20, 80]. Lines within 47-53% are left alone.
 */
import { fork } from 'node:child_process';
import { cpus } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};

interface Job {
  seed: number;
  n: number;
  levels: Record<string, number>;
}
type Tally = Record<string, [number, number]>;

async function worker(job: Job): Promise<Tally> {
  const { AI_PROFILES } = await import('../src/battle/ai');
  const { Battle } = await import('../src/battle/engine');
  const { Rng } = await import('../src/battle/rng');
  const { autoBattle } = await import('../src/battle/runner');
  const { suggestItem } = await import('../src/battle/items');
  const { ROSTER } = await import('../src/data/roster');
  for (const l of ROSTER) l.level = job.levels[l.id] ?? l.level;
  const ai = AI_PROFILES.normal;
  const ids = ROSTER.map((l) => l.id);
  const rng = new Rng(job.seed);
  const w: Tally = Object.fromEntries(ids.map((i) => [i, [0, 0]]));
  for (let g = 0; g < job.n; g++) {
    const A = rng.shuffle([...ids]).slice(0, 3);
    const B = rng.shuffle([...ids]).slice(0, 3);
    const bt = new Battle(
      { name: 'A', lines: A, isAI: true, items: A.map((l) => suggestItem(l, rng)) },
      { name: 'B', lines: B, isAI: true, items: B.map((l) => suggestItem(l, rng)) },
      rng.int(0, 2 ** 31),
    );
    const r = autoBattle(bt, [ai, ai], rng.int(0, 2 ** 31));
    A.forEach((i) => {
      w[i][1]++;
      if (r.winner === 0) w[i][0]++;
    });
    B.forEach((i) => {
      w[i][1]++;
      if (r.winner === 1) w[i][0]++;
    });
  }
  return w;
}

if (process.env.TUNE_WORKER) {
  process.on('message', async (job: Job) => {
    process.send!(await worker(job));
    process.exit(0);
  });
} else {
  const { ROSTER } = await import('../src/data/roster');
  const iters = Number(opt('iters', '6'));
  const n = Number(opt('n', '24000'));
  const only = opt('only', '') ? new Set(opt('only', '').split(',')) : null;
  const procs = Math.max(1, Math.min(8, cpus().length));
  const levels: Record<string, number> = Object.fromEntries(ROSTER.map((l) => [l.id, l.level]));
  const self = fileURLToPath(import.meta.url);
  for (let it = 0; it < iters; it++) {
    const t0 = Date.now();
    const parts = await Promise.all(
      Array.from({ length: procs }, (_, p) =>
        new Promise<Tally>((resolve, reject) => {
          const child = fork(self, [], { env: { ...process.env, TUNE_WORKER: '1' }, execArgv: ['--import', 'tsx'] });
          child.on('message', (m) => resolve(m as Tally));
          child.on('error', reject);
          child.send({ seed: 1000 * it + p * 7919 + 1, n: Math.ceil(n / procs), levels } satisfies Job);
        }),
      ),
    );
    const total: Tally = {};
    for (const part of parts) for (const [id, [w, g]] of Object.entries(part)) total[id] = [(total[id]?.[0] ?? 0) + w, (total[id]?.[1] ?? 0) + g];
    const rates = Object.entries(total).map(([id, [w, g]]) => ({ id, wr: w / Math.max(1, g) }));
    const off = rates.filter((r) => r.wr < 0.45 || r.wr > 0.55).length;
    const spread = rates.reduce((a, r) => a + (r.wr - 0.5) ** 2, 0) / rates.length;
    console.log(`iter ${it + 1}/${iters}: ${n} battles in ${((Date.now() - t0) / 1000).toFixed(0)}s — rms ${(Math.sqrt(spread) * 100).toFixed(1)}%, ${off} lines outside 45-55%`);
    for (const { id, wr } of rates) {
      if (only && !only.has(id)) continue;
      if (Math.abs(wr - 0.5) <= 0.03) continue;
      levels[id] = Math.max(20, Math.min(80, levels[id] + Math.max(-3, Math.min(3, Math.round((0.5 - wr) * 25)))));
    }
    const worst = rates.sort((a, b) => a.wr - b.wr);
    console.log(`   weakest: ${worst.slice(0, 4).map((r) => `${r.id} ${(r.wr * 100).toFixed(0)}%`).join(', ')} | strongest: ${worst.slice(-4).map((r) => `${r.id} ${(r.wr * 100).toFixed(0)}%`).join(', ')}`);
    writeFileSync('src/data/levels.json', JSON.stringify(levels, Object.keys(levels).sort(), 1) + '\n');
  }
  const prev = JSON.parse(readFileSync('src/data/levels.json', 'utf8'));
  console.log(`wrote src/data/levels.json (${Object.keys(prev).length} lines)`);
}
