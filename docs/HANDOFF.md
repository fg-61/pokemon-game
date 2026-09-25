# Handoff — continuing Evo Clash from a terminal

This file is the "where are we / what next" note for a new Claude Code session (terminal, desktop or web).
Read `CLAUDE.md` first (architecture + commands), then this file, then `docs/ROADMAP.md`.
The original session's requests and decisions are in `docs/CONVERSATION.md`.

## Resume in a terminal
```bash
git clone -b claude/pokemon-fire-red-game-pzxo98 https://github.com/fg-61/pokemon-game
cd pokemon-game
yarn install
yarn typecheck && yarn test && yarn roster:validate  # sanity check
yarn dev                                             # http://localhost:5173 , VFX Lab: /lab.html
claude                                               # start Claude Code in the repo
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
- [x] Phase 2b: ALL 386 FireRed species — 19 curated + 196 generated lines (`tools/gen-roster.ts`), every branch
      (Eevee, Tyrogue, Wurmple, Nincada/Shedinja...) is its own line; levels auto-tuned (`tools/tune-levels.ts`,
      60k-battle sim: rms 1.7%); engine: Hidden Power, Counter/Mirror Coat, Transform, Wonder Guard, Roar, Heal Bell,
      Magnitude, Present, Endeavor...; team select search + type/region filters; type-themed gauntlet.
- [x] VFX: every one of the 179 moves used by the roster has a dedicated recipe (`src/vfx/recipes/*.ts`,
      incl. `elemental2.ts` / `physical2.ts` for the generated-roster moves). Check coverage after roster changes with
      the snippet in `.claude/skills/add-pokemon` (step 4).
- [x] Fixes: camera kept orbiting in battle (title scene leak); pale sprites (Neutral tone mapping); redesigned HUD cards.
- [x] Local session 1 (terminal, macOS): switched to yarn 1; weak-VFX pass — Surf (shaded curling wave with a body,
      side-on camera, the user rides the crest), Aurora Beam (`prim.aurora`: flowing rainbow body + aurora curtains +
      rings), Psycho Boost (`prim.psyOrb`, orb framed from both sides, crisp detonation instead of pink haze), Shock Wave
      (damped sine in the screen plane), Magnitude (scales with the engine's roll; `HitResult.power` →
      `playMoveFx({power})`, "Magnitude N!" message). AI fix: `estimateDamage` probes the median Magnitude/Present roll
      (it assumed power 10/40, so the AI never picked them); numel/pichu levels retuned. `tools/shoot.mjs` uses the
      local Chrome + GPU and holds the game clock at each capture (`Stage.holdAt`).
- [x] Kanto League (replaces the random gauntlet): the 8 FireRed Gym Leaders in order, then the Elite Four + Champion
      run, with their real parties (`trainers.json` from pret), FRLG trainer pics in the VS intro, SVG badges, local
      progress + Hall of Fame, 4 new arenas (quarry, cape, storm, indigo); difficulty curve tuned with `yarn sim --league`.
- [x] Battle framing: the wide shot put the foe straight behind the player (big back sprites hid it and spilled over
      the HUD card) — now BW-style (player left, foe right); oversized back sprites are capped (`BACK_MAX_H/W`).
- [x] Weather (Phase 3): Sunny Day / Rain Dance / Sandstorm / Hail, Drought / Drizzle / Sand Stream (also on evolution
      into Tyranitar), Swift Swim, Chlorophyll, Rain Dish, Sand Veil, Cloud Nine / Air Lock, Forecast, Weather Ball, Solar
      Beam / Thunder / Moonlight interactions (`CONFIG.weather`, `tests/weather.test.ts`); weather-aware AI; HUD chip;
      arena-wide weather VFX (`src/vfx/weather.ts`) + weather move recipes.
- [x] 31 popular lines hand-curated (FireRed-legal, checked by a research agent + `roster:validate`): Johto/Hoenn
      starters, Bagon, Beldum, Ralts, Aron, Lapras, Snorlax, the Eeveelutions, legendaries with signature moves (Sacred
      Fire, Aeroblast, Mist Ball, Luster Purge, Psycho Boost), and weather teams (Groudon/Exeggutor/Victreebel/Ho-Oh sun,
      Kyogre/Ludicolo/Kingdra/Vaporeon rain, Tyranitar/Aggron sand, Castform). 50 curated + 165 generated lines; all
      levels re-tuned (6x60k battles, rms 1.6%); League curve re-checked. New recipes in `src/vfx/recipes/signature.ts`.
- [x] Original Gym Leader and Champion music themes.
- [x] Fix: a Pokémon that couldn't act mid-Fly / Dig (sleep, paralysis, confusion) stayed semi-invulnerable and its
      sprite hidden — the charge is now cancelled and the sprite lands back (`present()` restores hidden sprites).
- [ ] Next ideas: held items (Leftovers, type boosters) chosen in team select; more League flavour (trainer-class
      battles before each gym, rival battles along the way, leader quotes); Present scaling with its roll; mobile layout.
- [ ] Phase 3 rest: held items, local 2-player versus, unlockables (see ROADMAP).

## Known issues / polish backlog
- Generated movesets are heuristic (`tools/gen-roster.ts`): to hand-tune a line, move it into `CURATED` in
  `src/data/roster.ts` and re-run `yarn roster:generate && yarn levels:tune`.
- Assets for all 386 species are ~66 MB in `public/assets` (artwork is the biggest part).
- VFX that could still be richer: Present (could scale with its 40/80/120 roll via `c.power` like Magnitude),
  Flail/Eruption/Low Kick now receive their real power in `c.power` but their recipes don't use it yet.
- Bright arenas + bloom wash additive effects to white above intensity ~1.2 — prefer `softHit` (common.ts)
  and intensities 0.6–1.2 in new recipes.
- The timing ring (QTE) uses real time. Verified on a local GPU browser (attack ring around the target, red brace
  ring around your Pokémon); the over-shoulder command shot puts big back sprites under the player's HUD card.
- Screenshots: always use `vite.nohmr.config.ts` (port 5174) + `?fixed=1` + `tools/shoot.mjs --game` (the clock is
  held at every `--at` time, so captures are exact on fast and slow machines). On a local Mac `shoot.mjs` drives the
  installed Google Chrome on the GPU (~7 s per capture run); in the cloud sandbox it falls back to software WebGL
  (slow — don't run more than 2 capture browsers at once there).
- `stage-*.js` bundle is ~1.2 MB (three.js + FireRed JSON). Code-split `species.json` if load time matters.

## Conventions to keep
- Game rules only in `src/battle` (deterministic, tested, simulated). Balance numbers only in `CONFIG`.
- Every roster change: `yarn roster:validate` + `yarn sim --n 3000` (all lines 45–55%).
- UI strings through `t()` with both `tr` and `en`.
- Commit messages end with the Co-Authored-By trailer used in git log.
