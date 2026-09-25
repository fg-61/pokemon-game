# Research summary (phase 0)

## Pokémon FireRed — how we analyzed the game
- We did **not** download a ROM (piracy). Instead we used **pret/pokefirered**, the complete community
  decompilation of FireRed/LeafGreen: the game's own C source and data tables, which is the most complete and
  precise "analysis" of the game possible.
- `tools/extract-firered.mjs` extracts: 386 species (base stats, types, abilities, evolution methods, level-up/TM/HM/
  tutor/egg learnsets, Pokédex texts), 354 moves (power, accuracy, PP, effect, secondary chance, priority, flags,
  descriptions) and the type chart. Commit used: `c75f352` (see `src/data/generated/README.md`).
- Mechanics references (file + function) are in `docs/research/firered-data.md`.
- Findings that shaped the design: the type-based physical/special split (Shadow Ball is physical, Crunch special,
  elemental punches special), FRLG-exclusive tutor moves (Frenzy Plant / Blast Burn / Hydro Cannon), Deoxys forms,
  Ghost immunities living after the Foresight separator in `gTypeEffectiveness`.

## Assets ("all Pokémon assets")
The PokeAPI sprites/cries repositories cover every species we need (details: `docs/research/assets.md`):
- Animated battle sprites (Showdown/Black-White style GIFs, front + back) for all 386 FireRed species and beyond
  → converted to jitter-free spritesheets.
- Original FireRed/LeafGreen front/back sprites (used in team select and results for the retro touch).
- Menu icons, official artwork, and the legacy cries.
`yarn assets:fetch --ids 1-386` fetches everything; phase 1 ships the 35 roster species (~5 MB).

## Engine choice
| option | pros | cons |
|---|---|---|
| **Three.js (chosen)** | runs in any browser, instant sharing, easy headless testing, full shader control for VFX, tiny build | we write our own tooling |
| Godot | editor, particles | export/web builds heavier; hard to verify headlessly here |
| Unreal | top-tier VFX | huge, not web-friendly, overkill for 2D sprites in 3D |
Pixel sprites as billboards in a lit 3D arena (HD-2D style) give the best look-per-effort with Three.js.

## VFX reference
The linked YouTube video could not be opened from the build environment (youtube.com is blocked by the network
policy). Effects follow the established language of 3D Pokémon battles (Stadium / Gen 6+): anticipation → travel
→ impact → dissipation, type-colored particles and beams, camera cuts, screen flash/shake, slow-mo on crits.
Every roster move has a dedicated recipe; the VFX Lab (`lab.html`) previews them.

## Legal
Fan project, non-commercial. Pokémon names, sprites, cries © Nintendo / Creatures / GAME FREAK. Music and all
VFX/UI are original. Do not sell or publish commercially.
