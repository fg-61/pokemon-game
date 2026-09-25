---
name: balance-sim
description: Measure and tune Evo Clash battle balance with the headless AI-vs-AI simulator (win rates per line, battle length, evolution frequency). Use after changing moves, stats, engine rules, CONFIG values, or adding Pokémon; or when asked "is it balanced / denge".
---

# Balance simulation

`npm run sim` runs AI-vs-AI battles on the real engine (`src/battle/*`) — no rendering.

```
npm run sim                     # 2000 random 3v3 battles, normal AI
npm run sim -- --n 5000         # more samples (±1% noise needs ~5000)
npm run sim -- --ai hard        # both sides use the hard profile
npm run sim -- --duel           # 1v1 line-vs-line matrix (row win % vs column)
```

## Targets
- Every line's 3v3 win rate: **45–55%** (flagged `<-- strong/weak` outside 42–58%).
- Average battle: **60–120 s** of ATB time (≈ 45–60 actions). Presentation adds ~2.5 s per action on top.
- Evolution: most lines evolve at least once in ~50–75% of games; 3-stage lines reach stage 3 in ~25–50%.
- `--duel` matrix: type counters should show (e.g. water vs fire > 65%), but no row averaging > 65%.

## Knobs (in order of preference)
1. Per-line `level` in `src/data/roster.ts` — the FireRed way to balance. ±1 level ≈ ±2–3% win rate.
2. Movesets (keep them FireRed-legal: `npm run roster:validate`).
3. Global rules in `src/battle/config.ts` (`CONFIG`): `hpMultiplier` (battle length), `turnTime`/`speedOffset`
   (how much Speed matters), `evo.*` (evolution pacing), `timingAttack`/`timingBrace` (value of the action inputs),
   `critMultiplier`, `sleepActions`.
4. AI profiles in `src/battle/ai.ts` (`AI_PROFILES`) — difficulty, not balance.

## Procedure
1. Baseline: `npm run sim -- --n 3000` and save the table.
2. Change one knob at a time; re-run with the same `--n`. Randomness: differences < 2% are noise at n=3000.
3. For level tuning of many lines at once, iterate: `level += round((0.5 - winRate) * 25)`, clamp ±3, repeat until
   all lines are within 45–55% (converges in ~5 iterations).
4. Run `npm test` (engine tests must still pass) and record the final table in the commit message.
