# Roadmap

## Phase 1 — done
- FireRed data pipeline (all 386 species / 354 moves), asset pipeline, 35-species roster (13 lines, 17 types).
- Hybrid ATB engine, timing rings, in-battle evolution, AI (3 difficulties), balance simulator.
- Three.js arena (4 themes), animated sprites, VFX for all 85 roster moves, evolution cinematic.
- Gauntlet (5 trainers + Champion) and Quick Battle; TR/EN UI; procedural music/SFX + cries.
- Claude skills (add-pokemon, move-vfx, balance-sim, firered-data, playtest) and agents.

## Phase 2 — roster expansion (use the `add-pokemon` skill)
Done: Magikarp→Gyarados, Nidoran♂→Nidoking, Oddish→Vileplume, Poliwag→Poliwrath, Onix→Steelix,
Larvitar→Tyranitar (19 lines / 51 species).

Suggested next lines (all FireRed species, mostly 3 stages, fill role gaps):
- Oddish → Gloom → Vileplume (Grass/Poison support), Poliwag → Poliwhirl → Poliwrath (Water/Fighting),
  Nidoran♂ → Nidorino → Nidoking (coverage monster), Magikarp → Gyarados (joke → monster, Intimidate),
  Onix → Steelix, Eevee (branching: Vaporeon/Jolteon/Flareon/Espeon/Umbreon as separate lines),
  Larvitar → Pupitar → Tyranitar, Cyndaquil/Totodile/Chikorita lines, Treecko/Torchic/Mudkip lines,
  Beldum → Metang → Metagross, Bagon → Shelgon → Salamence, Ralts → Kirlia → Gardevoir, Aron → Lairon → Aggron.
- Each needs: assets, moveset, VFX for new moves, sim-tuned level.

## Phase 3 — depth
- Weather (Sunny Day, Rain Dance, Sandstorm, Hail) as arena-wide timed effects + VFX + ability hooks.
- More move effects (Substitute, Encore, Baton Pass, Perish Song, Future Sight, Counter/Mirror Coat).
- Held items (Leftovers, Choice Band, type boosters) chosen in team select.
- Local 2-player versus (split keyboard) and online via WebRTC.
- Unlockable roster via Gauntlet wins; trainer sprites (FRLG trainer classes) and battle intros.

## Phase 4 — polish
- Per-species attack animations (sprite squash/stretch, custom lunge arcs), shader-based sprite normal lighting.
- Mobile layout pass, gamepad support, accessibility options (timing assist, reduced flashing).
- Performance: GPU particles, texture atlas for sprites, lazy asset loading for a 386-species roster.
