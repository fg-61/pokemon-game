# Evo Clash — Game Design

## Pillars
1. **Strategy from real FireRed data** — Gen 3 types, base stats, abilities, movesets and the Gen 3 damage formula.
2. **Action on top** — a real-time gauge and timing inputs reward attention and reflexes.
3. **Evolution as a mid-battle power spike** — every Pokémon starts in its first form; evolving is a tactical decision.
4. **Eye candy** — 3D arena, animated sprites, per-move VFX, camera direction, bloom, screen effects.

## Loop
Title → mode (Gauntlet: 5 trainers ending with the Champion / Quick Battle) → pick 3 lines → battle → results.
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
Early Bird, Shed Skin, Clear Body, White Smoke, Keen Eye, Hyper Cutter, Insomnia, Vital Spirit, Limber, Own Tempo.

## Deviations from FireRed (all in `src/battle/config.ts`)
| rule | FireRed | Evo Clash | why |
|---|---|---|---|
| turn order | turns + speed | ATB timeline | action pacing |
| HP | formula | ×1.6 | room for evolutions and comebacks |
| crit | ×2 | ×1.5 | timing already adds variance |
| sleep | 2–5 turns | 1–3 actions | real-time sleep is harsher |
| level | trainer-defined | per-line level (43–62) | balance different evolution lines |

## Balance
`npm run sim` (AI vs AI, random 3v3). Current: every line 47–53% win rate over 3000 battles, ~70 s ATB time,
3-stage lines reach final form in 30–50% of battles. Per-line levels are the main knob (FireRed-style).

## Roster (phase 1 — 13 lines, 35 species, all 17 types)
Bulbasaur, Charmander, Squirtle, Pidgey, Pikachu, Abra, Machop, Geodude, Seel, Gastly, Scyther, Dratini, Houndour.
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
