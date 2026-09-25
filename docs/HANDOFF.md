# Handoff — continuing Evo Clash from a terminal

This file is the "where are we / what next" note for a new Claude Code session (terminal, desktop or web).
Read `CLAUDE.md` first (architecture + commands), then this file, then `docs/ROADMAP.md`.

## Resume in a terminal
```bash
git clone -b claude/pokemon-fire-red-game-pzxo98 https://github.com/fg-61/pokemon-game
cd pokemon-game
npm install
npm run typecheck && npm test && npm run roster:validate   # sanity check
npm run dev                                                 # http://localhost:5173 , VFX Lab: /lab.html
claude                                                      # start Claude Code in the repo
```
Good first prompts for the new session:
- "Read docs/HANDOFF.md and continue with the next unchecked item."
- "Add <Pokémon> to the roster" → uses `.claude/skills/add-pokemon`.
- "Is the game balanced after my change?" → `.claude/skills/balance-sim` / `balance-analyst` agent.
- "Improve the VFX of <move>" → `.claude/skills/move-vfx` / `vfx-artist` agent.
- "Playtest the game and report bugs" → `.claude/skills/playtest` / `qa-playtester` agent.

Useful in the terminal (you have a real GPU there, so the game runs at full speed):
- Quick battle without menus: `http://localhost:5173/?quick=1&team=charmander,pikachu,gastly&foe=squirtle,abra,machop`
- Watch AI vs AI: add `&auto=1`. Pick an arena: `&theme=meadow|volcano|night|snow`.

## Status (keep this section updated at the end of every session)
- [x] Phase 0 research: FireRed data from pret/pokefirered (no ROM), PokeAPI assets, engine choice (Three.js).
- [x] Phase 1: 13 lines / 35 species, ATB engine + timing rings + in-battle evolution, AI, balance sim,
      4 arenas, VFX for all roster moves, evolution cinematic, gauntlet + quick battle, TR/EN UI, audio.
- [x] Claude skills (`.claude/skills`) and agents (`.claude/agents`).
- [x] Phase 2a: Magikarp, Nidoran♂, Oddish, Poliwag, Onix, Larvitar lines — 19 lines / 51 species, balanced 47–53%,
      engine: Splash, Belly Drum, Water/Volt Absorb, Poison Point, per-line `evoRate`, 1–4 move sets.
- [ ] Phase 2: Eevee branches (Vaporeon / Jolteon / Flareon as separate roster lines), Hoenn starters, Bagon, Beldum.
- [ ] Phase 3: weather, held items, local 2-player versus, unlockables (see ROADMAP).

## Known issues / polish backlog
- Surf's wave and Aurora Beam's rainbow are the weakest VFX (see `src/vfx/recipes/water.ts`, `ice.ts`).
- Bright arenas + bloom wash additive effects to white above intensity ~1.2 — prefer `softHit` (common.ts)
  and intensities 0.6–1.2 in new recipes.
- The timing ring (QTE) uses real time; it could not be screenshotted in the software-rendered test browser,
  so verify its look in a real browser after UI changes.
- Headless screenshots are slow (software WebGL). Always use `vite.nohmr.config.ts` (port 5174) + `?fixed=1`
  + `tools/shoot.mjs --game`, and don't run more than 2 capture browsers at once.
- `stage-*.js` bundle is ~1.2 MB (three.js + FireRed JSON). Code-split `species.json` if load time matters.

## Conventions to keep
- Game rules only in `src/battle` (deterministic, tested, simulated). Balance numbers only in `CONFIG`.
- Every roster change: `npm run roster:validate` + `npm run sim -- --n 3000` (all lines 45–55%).
- UI strings through `t()` with both `tr` and `en`.
- Commit messages end with the Co-Authored-By trailer used in git log.
