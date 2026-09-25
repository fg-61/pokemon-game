# FireRed data and Gen-3 battle mechanics

Research notes for the battle game. Everything here was checked against
[pret/pokefirered](https://github.com/pret/pokefirered) at commit
`c75f352304d529f6ba92d4f74b9cf8b5c3810788` (Aug 2026). Paths are relative to
the decomp root. The extracted JSON is described in
`src/data/generated/README.md`; regenerate it with `yarn data:extract`.

## Extracted data

| | Count |
| --- | --- |
| Species (national dex 1-386) | 386 (171 dual-typed) |
| Evolution edges | 184 |
| Moves (excluding `MOVE_NONE`) | 354: 137 physical, 79 special, 138 status |
| Distinct move effects (`EFFECT_*`) | 198 |
| Distinct abilities in use | 76 |
| Level-up / TM-HM / tutor / egg move entries | 4015 / 8927 / 2391 / 973 |
| Non-1x type-chart entries | 110 |

## Where each piece lives in the decomp

| Data | File | Symbol / notes |
| --- | --- | --- |
| Species constants | `include/constants/species.h` | `SPECIES_*`. Internal order is **not** the national dex: Hoenn species follow 25 `SPECIES_OLD_UNOWN_B..Z` placeholders (Treecko is species 277, dex 252). `SPECIES_EGG` = `NUM_SPECIES` = 412; `SPECIES_UNOWN_B..` letter forms come after it. |
| National dex numbers | `include/constants/pokedex.h`, `src/pokemon.c` | `NATIONAL_DEX_*` enum; `sSpeciesToNationalPokedexNum[]` built with `SPECIES_TO_NATIONAL(name)`. |
| Base stats, types, abilities, gender, growth | `src/data/pokemon/species_info.h` | `gSpeciesInfo[]` (`struct SpeciesInfo`). Gender uses `PERCENT_FEMALE(x)`, `MON_MALE`, `MON_FEMALE`, `MON_GENDERLESS`. Single-typed species repeat the type (`{TYPE_FIRE, TYPE_FIRE}`). |
| Deoxys stats | `src/pokemon.c` | `sDeoxysBaseStats[]` under `#if defined(FIRERED)` (Attack Forme 50/180/20/180/20/150) is used by `GetDeoxysStat()` outside link battles. `gSpeciesInfo` holds Normal Forme stats. The extractor writes the FireRed stats. |
| Species names | `src/data/text/species_names.h` | `gSpeciesNames[]`, upper case, at most 10 characters. |
| Evolutions | `src/data/pokemon/evolution.h` | `gEvolutionTable[][EVOS_PER_MON]` of `{method, param, targetSpecies}`. `EVO_*` values are in `include/constants/pokemon.h`. |
| Level-up moves | `src/data/pokemon/level_up_learnsets.h`, `level_up_learnset_pointers.h` | `s<Name>LevelUpLearnset[]` using `LEVEL_UP_MOVE(lvl, move)`, indexed through `gLevelUpLearnsets[]`. |
| TM/HM compatibility | `src/data/pokemon/tmhm_learnsets.h` | `sTMHMLearnsets[][2]` (a 64-bit mask via `TMHM(TM06_TOXIC)`). |
| TM/HM number to move | `src/data/party_menu.h` | `sTMHMMoves[]` (TM01-TM50, then HM01-HM08). Item aliases such as `ITEM_TM06_TOXIC` are in `include/constants/items.h`. |
| Tutor moves | `src/data/pokemon/tutor_learnsets.h`, `src/party_menu.c` | `sTutorMoves[]` and the `sTutorLearnsets[]` bitfield (15 tutors). Frenzy Plant, Blast Burn and Hydro Cannon are hard-coded in `CanLearnTutorMove()` for Venusaur, Charizard and Blastoise only. |
| Egg moves | `src/data/pokemon/egg_moves.h` | `gEggMoves[]` using `egg_moves(SPECIES, MOVE_...)`. Read by `src/daycare.c`. |
| Pokédex data | `src/data/pokemon/pokedex_entries.h` | `gPokedexEntries[]`, keyed by `NATIONAL_DEX_*`: `categoryName`, `height` (dm), `weight` (hg), `description`. |
| Pokédex text | `src/data/pokemon/pokedex_text_fr.h` (FireRed), `pokedex_text_lg.h` (LeafGreen) | Selected by `#if defined(FIRERED)` in `pokedex_text.h`. |
| Move stats | `src/data/battle_moves.h` | `gBattleMoves[]` (`struct BattleMove`: effect, power, type, accuracy, pp, secondaryEffectChance, target, priority, flags). |
| Move names | `src/data/text/move_names.h` | `gMoveNames[]`, at most 12 characters, so some lose their spaces (`THUNDERPUNCH`, `SOFTBOILED`). The extractor restores the word breaks from the constant name. |
| Move descriptions | `src/move_descriptions.c` | `gMoveDescription_*` strings and `gMoveDescriptionPointers[MOVE_X - 1]`. |
| Move targets | `include/battle.h` | `MOVE_TARGET_*` bit values. |
| Move effects | `include/constants/battle_move_effects.h` | `EFFECT_*`. Battle scripts: `data/battle_scripts_1.s` (`gBattleScriptsForMoveEffects`). |
| Type chart | `src/battle_main.c` | `gTypeEffectiveness[336]`: triples `atk, def, mult` with mult ×10 (`TYPE_MUL_*`). |
| Type IDs | `include/constants/pokemon.h` | `TYPE_NORMAL`=0 … `TYPE_STEEL`=8, `TYPE_MYSTERY`=9, `TYPE_FIRE`=10 … `TYPE_DARK`=17. |

### The type chart and Foresight

`Cmd_typecalc` in `src/battle_script_commands.c` walks `gTypeEffectiveness`
until `TYPE_ENDTABLE`. When it reaches the `TYPE_FORESIGHT` separator it
**skips it and keeps going**, unless the target has `STATUS2_FORESIGHT`, in which
case it stops there. The only rows after the separator are
`NORMAL -> GHOST = 0` and `FIGHTING -> GHOST = 0`, so the Ghost immunities apply
in normal play and Foresight/Odor Sleuth remove them. `typechart.json`
therefore includes these rows. A move-specific Foresight check has to drop them.

Each matching row multiplies damage separately (`ModulateDmgByType`:
`dmg = dmg * mult / 10`, minimum 1 unless the multiplier is 0). If a
species' two types are the same, the second type is not applied again.

## Battle mechanics (Gen 3, as implemented in FireRed)

### Physical/special split
The split is by type: `IS_TYPE_PHYSICAL(t)` is `t < TYPE_MYSTERY` and
`IS_TYPE_SPECIAL(t)` is `t > TYPE_MYSTERY` (`include/battle.h`).
Physical types are Normal, Fighting, Flying, Poison, Ground, Rock, Bug, Ghost
and Steel. Special types are Fire, Water, Grass, Electric, Psychic, Ice,
Dragon and Dark. `TYPE_MYSTERY` (Curse) does 0 damage. So Shadow Ball is
physical and Crunch is special. Moves with power 0 are status moves.
Fixed or variable damage moves (Seismic Toss, Dragon Rage, Sonic Boom, Night Shade, Super Fang,
Psywave, Counter, Mirror Coat, Return, Frustration, Flail, Hidden Power, OHKO moves, …)
have `power = 1` in the data and get their real damage or power in their
effect scripts. Hidden Power and Weather Ball are stored as `NORMAL`, and their
type is changed at runtime (`gBattleStruct->dynamicMoveType`).

### Stat formula (`CalculateMonStats`, `CALC_STAT` in `src/pokemon.c`)
```
HP    = floor((2*Base + IV + floor(EV/4)) * Level / 100) + Level + 10   (Shedinja: 1)
Other = floor(floor((2*Base + IV + floor(EV/4)) * Level / 100) + 5) * nature
```
The nature factor is ×110/100 or ×90/100 with truncation (`ModifyStatByNature`)
and never applies to HP.

### Damage formula
Order of operations in the battle script
(`BattleScript_EffectHit` in `data/battle_scripts_1.s`):
`critcalc -> damagecalc -> typecalc -> adjustnormaldamage`.

1. **`CalculateBaseDamage`** (`src/pokemon.c`). All divisions are integer.
   The stat used is Atk/Def for physical types and SpA/SpD for special types:
   ```
   A = stat * stageRatio(atkStage)        // ability/item/badge modifiers applied first
   D = stat * stageRatio(defStage)
   dmg = floor(floor(A * Power * floor(2*Level/5 + 2) / D) / 50)
   if physical and attacker burned (and no Guts): dmg /= 2
   Reflect / Light Screen (not on crits): dmg /= 2 (doubles: *2/3)
   spread move in doubles with 2 targets:  dmg /= 2
   weather: rain Water x1.5 / Fire x0.5, sun Fire x1.5 / Water x0.5; Flash Fire x1.5
   physical dmg min 1; then return dmg + 2
   ```
   Before this, the function applies Huge/Pure Power (×2 Atk), badge boosts,
   type-boosting held items, Choice Band (×1.5 Atk), Thick Fat, Hustle, Guts,
   Marvel Scale, Mud/Water Sport, and Overgrow/Blaze/Torrent/Swarm
   (×1.5 power at ≤1/3 HP). Explosion and Self-Destruct halve the target's Defense.
2. **`Cmd_damagecalc`**: `dmg = base * gCritMultiplier * dmgMultiplier`
   (dmgMultiplier is 2 for cases like Surf on a diving target or Stomp on Minimize).
   Charge ×2 for Electric moves, Helping Hand ×1.5.
3. **`Cmd_typecalc`**: STAB `dmg = dmg * 15 / 10` when the move type matches
   either attacker type (`IS_BATTLER_OF_TYPE`), then each type-chart row
   (see above). Levitate blocks Ground moves, and Wonder Guard blocks
   anything that is not super effective.
4. **`Cmd_adjustnormaldamage`**: random roll `dmg = dmg * (100 - rand%16) / 100`
   (85-100 %, minimum 1). This happens after STAB and type effectiveness.

### Critical hits (`Cmd_critcalc`, `sCriticalHitChance[] = {16, 8, 4, 3, 2}`)
- Stage = 2×Focus Energy + high-crit effect (`HIGH_CRITICAL`, `SKY_ATTACK`,
  `BLAZE_KICK`, `POISON_TAIL`) + Scope Lens + 2×(Lucky Punch Chansey) +
  2×(Stick Farfetch'd). The stage is capped at 4.
- The chance is 1/16, 1/8, 1/4, 1/3 or 1/2 by stage. Battle Armor and Shell Armor prevent crits.
- A crit sets `gCritMultiplier = 2`, which is **×2 damage**. Crits ignore the
  attacker's negative attack stages, the defender's positive defense stages,
  and Reflect/Light Screen.

### Stat stages (`gStatStageRatios` in `src/pokemon.c`)
| Stage | -6 | -5 | -4 | -3 | -2 | -1 | 0 | +1 | +2 | +3 | +4 | +5 | +6 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Multiplier | 10/40 | 10/35 | 10/30 | 10/25 | 10/20 | 10/15 | 1 | 15/10 | 20/10 | 25/10 | 30/10 | 35/10 | 40/10 |

Speed uses the same table (`GetWhoStrikesFirst` in `src/battle_main.c`).

### Accuracy and evasion (`sAccuracyStageRatios` in `src/battle_script_commands.c`, `Cmd_accuracycheck`)
The combined stage is `accStage - evaStage`, clamped to ±6. Evasion is
ignored under Foresight.

| Stage | -6 | -5 | -4 | -3 | -2 | -1 | 0 | +1 | +2 | +3 | +4 | +5 | +6 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Multiplier | 33/100 | 36/100 | 43/100 | 50/100 | 60/100 | 75/100 | 1 | 133/100 | 166/100 | 2 | 233/100 | 133/50 | 3 |

The move hits if `rand(1..100) <= moveAcc * ratio` (after Compound Eyes ×1.3,
Sand Veil ×0.8, Hustle ×0.8 on physical moves, and BrightPowder).
`EFFECT_ALWAYS_HIT` moves (Swift, Faint Attack, Shadow Punch, Aerial Ace,
Magical Leaf, Shock Wave, all with accuracy 0) and Vital Throw skip the check
(`AccuracyCalcHelper`). Thunder never misses in rain and has 50 accuracy in sun.

### Status conditions
| Status | Rule | Source |
| --- | --- | --- |
| Burn | Physical damage halved after the base formula (not with Guts). Takes maxHP/8 at end of turn (min 1). | `CalculateBaseDamage`, `DoBattlerEndTurnEffects` (`ENDTURN_BURN`) in `src/battle_util.c` |
| Paralysis | Speed ÷4 for turn order. 25 % chance each turn to be fully paralyzed (`Random() % 4 == 0`). | `GetWhoStrikesFirst` (`src/battle_main.c`), `AtkCanceller_UnableToUseMove` (`CANCELLER_PARALYSED`) |
| Sleep | Counter set to 2-5 (`(Random() & 3) + 2`). It goes down by 1 (Early Bird: 2) each time the Pokémon tries to move. When it reaches 0 the Pokémon wakes and acts that turn, so it misses 1-4 turns. Snore and Sleep Talk work while asleep. | `SetMoveEffect` (`src/battle_script_commands.c`), `CANCELLER_ASLEEP` |
| Freeze | Each turn the Pokémon tries to move there is a 20 % chance to thaw (`Random() % 5 == 0`). A damaging Fire move that hits it thaws it (`MOVEEND_DEFROST` in `src/battle_script_commands.c`), and a `THAW_HIT` move (Flame Wheel, Sacred Fire) thaws the user. | `CANCELLER_FROZEN` in `src/battle_util.c` |
| Poison | Takes maxHP/8 at end of turn. | `ENDTURN_POISON` |
| Toxic | Takes maxHP/16 × n at end of turn. n starts at 1 and goes up by 1 each turn (max 15). | `ENDTURN_BAD_POISON` |
| Confusion | Lasts 2-5 turns (`STATUS2_CONFUSION_TURN((Random() % 4) + 2)`). Each turn there is a 50 % chance (`Random() & 1`) to hit itself instead of moving. The self-hit uses `CalculateBaseDamage(..., MOVE_POUND, power 40)` with its own Atk against its own Def: a physical 40-power hit with no STAB, type effectiveness, crit or random roll. | `CANCELLER_CONFUSED` |

Other useful facts:
- Multi-hit (`Cmd_setmultihit`): 2 hits 37.5 %, 3 hits 37.5 %, 4 hits 12.5 %, 5 hits 12.5 %.
- Turn order (`GetWhoStrikesFirst`): priority first, then speed after stat stages,
  badge boost, Macho Brace (÷2), paralysis (÷4) and Quick Claw.
- Bind, Wrap and similar moves last 3-6 turns. Disable lasts 2-5 turns and Encore 3-6 turns
  (`src/battle_script_commands.c`).
