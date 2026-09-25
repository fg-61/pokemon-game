/** Persistent player records (localStorage; every access guarded). */
export interface Records {
  championWins: number;
  battlesWon: number;
  bestStreak: number;
  streak: number;
}

const KEY = 'pba.records.v1';

export function loadRecords(): Records {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { championWins: 0, battlesWon: 0, bestStreak: 0, streak: 0, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { championWins: 0, battlesWon: 0, bestStreak: 0, streak: 0 };
}

export function recordBattle(won: boolean, champion = false): Records {
  const r = loadRecords();
  if (won) {
    r.battlesWon++;
    r.streak++;
    r.bestStreak = Math.max(r.bestStreak, r.streak);
    if (champion) r.championWins++;
  } else r.streak = 0;
  try {
    localStorage.setItem(KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
  return r;
}
