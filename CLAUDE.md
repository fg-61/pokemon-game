# Evo Clash — Pokémon FireRed battle arena (fan project)

3D (Three.js) strategy + action battle game: pick 3 Pokémon, fight on a real-time ATB timeline with FireRed moves,
hit timing rings for bonus damage / to brace, and evolve mid-battle. All game data comes from the pret/pokefirered
decompilation; sprites and cries from the PokeAPI repos. Non-commercial fan project (see public/assets/ATTRIBUTION.md).

## Continuing work
Start with `docs/HANDOFF.md` (status checklist, known issues, resume steps), then `docs/ROADMAP.md`.
`docs/CONVERSATION.md` is the readable log of the original web session (user requests verbatim + decisions).
Update the HANDOFF status section at the end of every session.

## Commands
- `npm run dev` — game at :5173, VFX Lab at :5173/lab.html
- `npm run typecheck` · `npm test` (vitest) · `npm run build`
- `npm run roster:validate` — movesets legal in FireRed + effects implemented + assets present
- `npm run sim [-- --n 3000 | --duel | --ai hard]` — headless AI-vs-AI balance simulator
- `npm run roster:generate` — regenerate the 196 auto lines (src/data/roster.generated.ts) + roster-dex.json
- `npm run levels:tune [-- --iters 4 --n 60000]` — auto-balance per-line levels into src/data/levels.json
- `npm run data:extract` — regenerate src/data/generated from pret/pokefirered
- `npm run assets:fetch [-- --ids 1-9]` — sprites/cries for roster-dex.json
- Headless screenshots: `npx vite --config vite.nohmr.config.ts` (port 5174, no HMR) +
  `node tools/shoot.mjs --url "http://localhost:5174/?quick=1&auto=1&fixed=1" --game --at 3000,9000 --out tests/screenshots/x`

## Layout
- `src/data/` — generated FireRed JSON (`generated/`), typed access (`gamedata.ts`), `roster.ts` (CURATED lines +
  merge with `roster.generated.ts` and `levels.json`), `roster-dex.json` (dex list for the asset tool), `typeColors.ts`.
- `src/battle/` — pure game logic, no DOM/three: `engine.ts` (Battle: ATB tick, act(), Gen 3 damage, effects,
  evolution), `ai.ts`, `config.ts` (all balance knobs), `stats.ts`, `runner.ts` (headless autoBattle), `rng.ts`.
- `src/render/` — `stage.ts` (renderer, bloom + grade post pass, camera director), `arena.ts` (4 themes, platforms),
  `pokemonSprite.ts` (animated billboard sprite + reactions), `clock.ts` (game clock, tweens, slow-mo), `shots.ts`.
- `src/vfx/` — `particles.ts`, `primitives.ts`, `textures.ts` (procedural atlas), `vfx.ts` (helpers + recipe registry),
  `recipes/<type>.ts` (one recipe per move), `playMove.ts`, `evolution.ts`, `statusFx.ts`.
- `src/game/` — `battleController.ts` (engine ↔ presentation: turns, QTE, event playback), `trainers.ts`, `settings.ts`.
- `src/ui/` — DOM overlay: `hud.ts`, `screens.ts` (title, team select, results, modals), `i18n.ts` (TR/EN), `style.css`.
- `src/audio/` — procedural WebAudio SFX + original chiptune music + cries.
- `tools/` — data extraction, asset fetch, roster validation, sim, screenshot helper.
- `.claude/skills/` (add-pokemon, move-vfx, balance-sim, firered-data, playtest) and `.claude/agents/`.

## Conventions
- Game rules live only in `src/battle` and must stay deterministic given the Rng (sim + tests depend on it).
  Every balance number goes in `CONFIG`.
- Presentation is event-driven: `Battle.act()` returns `BattleEvent[]`; `BattleController.present()` animates them.
  Move recipes call `c.impact(i)` at each hit; the controller applies HP/damage numbers there.
- Movesets must pass `npm run roster:validate`; new Pokémon follow `.claude/skills/add-pokemon`.
- UI strings go through `t()` in `src/ui/i18n.ts` (both `tr` and `en`). Pokémon/move names stay English (FireRed).
- Don't commit ROMs or copyrighted music. Assets are fetched from PokeAPI with attribution.
