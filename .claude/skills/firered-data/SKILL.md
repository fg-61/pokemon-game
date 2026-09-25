---
name: firered-data
description: Regenerate or query the Pokémon FireRed game data (species, base stats, learnsets, moves, type chart) extracted from the pret/pokefirered decompilation; answer Gen 3 mechanics questions. Use when data looks wrong, a new field is needed, or someone asks how FireRed does something.
---

# FireRed data

Source of truth: the **pret/pokefirered** decompilation (C source of the GBA game — no ROM needed or wanted).
`tools/extract-firered.mjs` parses it into `src/data/generated/`:

| file | contents |
|---|---|
| `species.json` | 386 species keyed by constant (`CHARMANDER`): national dex, name, types, base stats, abilities, evolutions, prevo, level-up / TM-HM / tutor / egg moves, category, height, weight, FireRed dex text |
| `moves.json` | 354 moves: type, power, accuracy, pp, effect (`EFFECT_*` without prefix), secondary chance, target, priority, flags, Gen 3 category, description |
| `typechart.json` | non-1x multipliers from `gTypeEffectiveness` (incl. Normal/Fighting→Ghost immunity rows) |

Typed access: `src/data/gamedata.ts` (`SPECIES`, `MOVES`, `TYPECHART`, `speciesByDex`, `typeMultiplier`), types in
`src/data/types.ts`. Research notes with file/symbol references: `docs/research/firered-data.md`.

## Regenerate
```
npm run data:extract                         # clones pret/pokefirered into .cache/ if needed
node tools/extract-firered.mjs --src <path>  # or use an existing clone
npm test                                     # tests/gamedata.test.ts spot-checks known values
```
To add a field: extend the parser in `tools/extract-firered.mjs`, the interface in `src/data/types.ts`, and a test.

## Where things live in the decomp
- Base stats / types / abilities: `src/data/pokemon/species_info.h` (`gSpeciesInfo`)
- Moves: `src/data/battle_moves.h` (`gBattleMoves`), names `src/data/text/move_names.h`
- Learnsets: `src/data/pokemon/level_up_learnsets.h`, `tmhm_learnsets.h`, `tutor_learnsets.h`, `egg_moves.h`
- Evolutions: `src/data/pokemon/evolution.h`
- Type chart: `gTypeEffectiveness` in `src/battle_main.c`
- Damage: `CalculateBaseDamage` in `src/pokemon.c`; battle script commands in `src/battle_script_commands.c`

## Deliberate deviations in Evo Clash (documented in docs/GAME_DESIGN.md)
ATB timeline instead of turns, HP ×1.6, crit ×1.5, sleep 1–3 actions, timing multipliers, in-battle evolution,
per-line levels for balance.
