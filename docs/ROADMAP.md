# Roadmap

## Phase 1 — done
- FireRed data pipeline (all 386 species / 354 moves), asset pipeline, 35-species roster (13 lines, 17 types).
- Hybrid ATB engine, timing rings, in-battle evolution, AI (3 difficulties), balance simulator.
- Three.js arena (4 themes), animated sprites, VFX for all 85 roster moves, evolution cinematic.
- Gauntlet (5 trainers + Champion) and Quick Battle; TR/EN UI; procedural music/SFX + cries.
  (Replaced in local session 1 by the Kanto League: real gym leaders / Elite Four / Champion, badges, Hall of Fame.)
- Claude skills (add-pokemon, move-vfx, balance-sim, firered-data, playtest) and agents.

## Phase 2 — roster expansion — done
All 386 FireRed species are playable (19 curated + 196 generated lines, auto-balanced levels).
Remaining: hand-curate popular generated lines (starters of Johto/Hoenn, pseudo-legendaries, legendaries) and give
their signature moves dedicated VFX.

### History (use the `add-pokemon` skill for new curated lines)
Done: Magikarp→Gyarados, Nidoran♂→Nidoking, Oddish→Vileplume, Poliwag→Poliwrath, Onix→Steelix,
Larvitar→Tyranitar (19 lines / 51 species).

Suggested next lines (all FireRed species, mostly 3 stages, fill role gaps):
- Eevee (branching: Vaporeon/Jolteon/Flareon/Espeon/Umbreon as separate roster lines),
  Cyndaquil/Totodile/Chikorita lines, Treecko/Torchic/Mudkip lines, Beldum → Metang → Metagross,
  Bagon → Shelgon → Salamence, Ralts → Kirlia → Gardevoir, Aron → Lairon → Aggron.
- Each needs: assets, moveset, VFX for new moves, sim-tuned level.

## Phase 3 — depth
- Weather (Sunny Day, Rain Dance, Sandstorm, Hail) as arena-wide timed effects + VFX + ability hooks.
- More move effects (Substitute, Encore, Baton Pass, Perish Song, Future Sight, Counter/Mirror Coat).
- Held items (Leftovers, Choice Band, type boosters) chosen in team select.
- Local 2-player versus (split keyboard) and online via WebRTC.
- ~~Trainer sprites and battle intros~~ (done for the League). Unlockable roster via League badges; gym puzzles or
  trainer-class battles before each leader; rival battles along the way (Route 22, Cerulean, S.S. Anne...).

## Phase 4 — polish
- Per-species attack animations (sprite squash/stretch, custom lunge arcs), shader-based sprite normal lighting.
- Mobile layout pass, gamepad support, accessibility options (timing assist, reduced flashing).
- Performance: GPU particles, texture atlas for sprites, lazy asset loading for a 386-species roster.
