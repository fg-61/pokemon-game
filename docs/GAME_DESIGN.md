# Evo Clash — Game Design

## Pillars
1. **Strategy from real FireRed data** — Gen 3 types, base stats, abilities, movesets and the Gen 3 damage formula.
2. **Action on top** — a real-time gauge and timing inputs reward attention and reflexes.
3. **Evolution as a mid-battle power spike** — every Pokémon starts in its first form; evolving is a tactical decision.
4. **Eye candy** — 3D arena, animated sprites, per-move VFX, camera direction, bloom, screen effects.

## Loop
Title → mode (Kanto League / Quick Battle) → pick 3 lines → battle → results.

**Kanto League** (`src/game/league.ts`): FireRed's eight Gym Leaders in order (Brock → Giovanni), each fielding 2-3
members of their real FireRed party (`src/data/generated/trainers.json`); a won gym gives its badge (saved locally,
rematches allowed). Eight badges open the Pokémon League: Lorelei, Bruno, Agatha, Lance and the Champion (the rival,
"Blue", who takes the starter that beats yours) back to back with one team — a loss restarts from Lorelei; winning
enters the Hall of Fame. Difficulty = the trainer's AI profile + a level bonus on its lines, tuned with
`yarn sim --league` (random teams, normal AI): ~89% vs Brock falling to ~60% vs Giovanni, 62-68% per Elite Four
member, ~62% vs the Champion.
Every battle starts with base forms (evolution progress resets between battles).

## Battle system: hybrid ATB
- Each active Pokémon has an **ATB gauge**. Fill rate = `(Speed + 100) / 200 / 2.6 s` (speed matters, but a slow
  Pokémon still acts ~60% as often as the fastest). Paralysis quarters Speed; Agility & co. apply stat stages.
- When full: **Move** (4 slots, PP), **Switch** (incoming starts at 30% gauge), or **Evolve** (when the EVO gauge is full).
- Menu time: *Active* mode keeps time flowing at 30% (the foe can act while you think); *Wait* mode pauses.
- Translating turn concepts to a timeline:
  - Priority (Quick Attack): the gauge restarts at +30% per priority level.
  - Recharge (Hyper Beam, Blast Burn, Hydro Cannon, Frenzy Plant): gauge restarts at −70%.
  - Two-turn moves (Solar Beam, Skull Bash, Dig): the charge takes an action, the gauge then fills 1.7× faster.
  - Flinch: pushes the target's gauge back 35%.
  - Protect: blocks the next move within 4 s (chain success 1/2, 1/4...). Reflect/Light Screen: 18 s.
  - Sleep: 1–3 of the sleeper's actions. Confusion: 2–4 actions. Status damage ticks after the Pokémon's own action.

## Action layer (timing)
- **Attack ring**: when you attack, a ring shrinks onto an inner ring (1.15 s). SPACE/click at the overlap:
  PERFECT (±75 ms) = ×1.2 damage, +1 crit stage, ×1.1 accuracy, +6 evo energy. GOOD (±175 ms) = ×1.0, +3 energy.
  MISS = ×0.85.
- **Brace ring**: when the foe attacks, a red ring over your Pokémon: PERFECT ×0.65 damage, GOOD ×0.85.
- The AI rolls its own timing grades from its difficulty profile (easy 12% perfect → hard 50%).

## Evolution
- EVO gauge (0–100) fills from: damage dealt (0.6 per 1% of foe HP), damage taken (0.9 per 1% own HP),
  timing bonuses, super-effective hits (+4), and passively (2/s). A replacement after a faint gets +15 (comeback).
- **Evolve** costs your action: new species' base stats (HP keeps its ratio, then +25% max HP heal), status cured,
  negative stat stages cleared, the stage's own 4 moves (PP ratio carried over), gauge restarts at 40%.
- 3-stage lines can evolve twice. 2-stage lines evolve once (and sooner). Single-stage Pokémon show MAX.
- The evolution cinematic mirrors the handheld games: glow, silhouette flicker between forms, burst.

## Damage (Gen 3, `CalculateBaseDamage`)
`((2L/5+2) · Power · A/D) / 50`, burn halves physical, screens halve (not on crits), `+2`, crit ×1.5
(FireRed: ×2 — reduced because timing adds variance), Flash Fire ×1.5, STAB ×1.5, type chart, random 85–100%,
then timing multipliers. Physical/special split **by type** (Gen 3). Abilities implemented: Blaze/Torrent/Overgrow/
Swarm, Static, Levitate, Guts, Huge Power, Thick Fat, Flash Fire, Intimidate, Rock Head, Synchronize, Inner Focus,
Early Bird, Shed Skin, Clear Body, White Smoke, Keen Eye, Hyper Cutter, Insomnia, Vital Spirit, Limber, Own Tempo,
Water Absorb, Volt Absorb, Poison Point, Wonder Guard (Shedinja keeps exactly 1 HP). Per-line `evoRate` scales evolution energy (Magikarp).

## Weather (Gen 3 rules on the timeline)
- **Sunny Day / Rain Dance / Sandstorm / Hail** set the weather for `CONFIG.weather.moveSeconds` (20 s ≈ 5 turns);
  **Drought** (Groudon), **Drizzle** (Kyogre) and **Sand Stream** (Tyranitar) set it on entry — including the lead at
  battle start and a Larvitar line evolving into Tyranitar mid-battle — for `abilitySeconds` (45 s). A new weather
  replaces the old; the same weather move fails while it is up. The HUD chip shows the weather and its time left.
- Sun: Fire ×1.5, Water ×0.5, Solar Beam fires without charging, Thunder 50% accurate, Synthesis / Morning Sun /
  Moonlight heal 2/3 (1/4 in other weather). Rain: Water ×1.5, Fire ×0.5, Thunder never misses. Solar Beam's power
  halves in rain, sand and hail. Weather Ball doubles its power and becomes Fire / Water / Rock / Ice.
- Sand hurts non Rock / Ground / Steel (and non Sand Veil) Pokémon for 1/16 of max HP after each of their actions; hail
  hurts non Ice types. Sand Veil: accuracy against it ×0.8 in sand. Swift Swim / Chlorophyll double Speed in rain /
  sun, Rain Dish heals 1/16 in rain, Cloud Nine / Air Lock (Rayquaza) cancel weather while out, Castform's Forecast
  turns it Fire / Water / Ice.
- The AI values weather moves by their synergy with its own moves and abilities vs the foe's
  (`weatherValue` in `src/battle/ai.ts`); damage estimates already include the weather.

## Deviations from FireRed (all in `src/battle/config.ts`)
| rule | FireRed | Evo Clash | why |
|---|---|---|---|
| turn order | turns + speed | ATB timeline | action pacing |
| HP | formula | ×1.6 | room for evolutions and comebacks |
| crit | ×2 | ×1.5 | timing already adds variance |
| sleep | 2–5 turns | 1–3 actions | real-time sleep is harsher |
| level | trainer-defined | per-line level (43–62) | balance different evolution lines |

## Balance
`yarn sim` (AI vs AI, random 3v3). Current (215 lines): rms deviation 1.7% from 50% over 60 000 battles, ~73 s ATB time,
3-stage lines reach final form in 30–50% of battles. Per-line levels are the main knob (FireRed-style).

## Roster (215 lines, all 386 FireRed species)
19 hand-curated lines + 196 generated by `tools/gen-roster.ts` (one line per root→leaf evolution path, so
branching families like Eevee or Tyrogue appear once per branch). Generated movesets: FireRed-legal, engine-supported
effects only, best STAB per type + best coverage + one utility move, power capped per stage (≤70 / ≤95 / any) so
evolving matters. `evoRate` for generated lines = 30 / first evolution level (bugs evolve fast, Dratini slow).
Levels are auto-balanced by `tools/tune-levels.ts` (legendaries around Lv 35–40, Caterpie-tier around 60–70).
Phase 1: Bulbasaur, Charmander, Squirtle, Pidgey, Pikachu, Abra, Machop, Geodude, Seel, Gastly, Scyther, Dratini, Houndour.
Phase 2: Magikarp (evoRate ×2.4 → Gyarados), Nidoran♂, Oddish, Poliwag (Belly Drum), Onix → Steelix, Larvitar → Tyranitar.
Each stage has a curated FireRed-legal moveset (stage 1 ~35–70 power, stage 2 ~60–95, final = signature moves,
including the FRLG-exclusive tutor moves Frenzy Plant / Blast Burn / Hydro Cannon).

## Presentation
- Camera: BW-style wide shot, move shots (attacker focus, side view, over-the-shoulder), evolution close-up,
  handheld sway, shake scaled by damage, slow-motion on crits and KOs.
- Post: UnrealBloom + grade pass (flash, vignette, chromatic pulse, radial impact blur, tint).
- Four arenas: Viridian Meadow (day), Cinnabar Caldera (volcanic dusk), Lavender Moonfield (night crystals),
  Seafoam Tundra (snow). Ambient particles, instanced props, procedural sky with clouds/stars.
- HUD: FRLG-style text box, animated HP bars with damage lag, ATB/EVO gauges, type-colored move buttons with
  effectiveness hints, floating damage numbers, move-name banner.
- Audio: original procedural chiptune (title/select/battle/boss/victory/defeat), per-type SFX, real cries.
