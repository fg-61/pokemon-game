# Generated FireRed data

**Do not edit by hand.** These files are produced by `tools/extract-firered.mjs`
from the [pret/pokefirered](https://github.com/pret/pokefirered) decompilation
(commit `c75f352304d529f6ba92d4f74b9cf8b5c3810788`).

| File | Contents | Main sources |
| --- | --- | --- |
| `species.json` | 386 species (national dex 1-386), keyed by constant name without `SPECIES_` | `src/data/pokemon/species_info.h`, `evolution.h`, `level_up_learnsets.h`, `tmhm_learnsets.h`, `tutor_learnsets.h`, `egg_moves.h`, `pokedex_entries.h`, `pokedex_text_fr.h`, `src/data/text/species_names.h`, `src/pokemon.c` (national dex map) |
| `moves.json` | 354 moves, keyed by constant name without `MOVE_` | `src/data/battle_moves.h`, `src/data/text/move_names.h`, `src/move_descriptions.c` |
| `typechart.json` | Non-1x type matchups: `chart[attacker][defender]` = 0, 0.5 or 2 | `gTypeEffectiveness` in `src/battle_main.c` |

Types are defined in `src/data/types.ts`; `src/data/gamedata.ts` loads the JSON.

Notes:
- Move `category` is derived with the Gen-3 rule (power 0 = status, otherwise by type).
- The type chart includes the rows after the `TYPE_FORESIGHT` separator
  (NORMAL->GHOST, FIGHTING->GHOST): they apply normally and are only skipped when
  the target is under Foresight/Odor Sleuth.

## Regenerate

```sh
npm run data:extract                                  # clones into .cache/pokefirered if needed
node tools/extract-firered.mjs --src ../pokefirered   # or use an existing checkout
```
