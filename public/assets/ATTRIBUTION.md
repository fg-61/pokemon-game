# Asset attribution

The Pokémon sprites, icons and official artwork in `public/assets/pokemon/` come from the
[PokeAPI sprites repository](https://github.com/PokeAPI/sprites) (animated Showdown and
Black/White sprites, FireRed/LeafGreen sprites, menu icons and official artwork). Pokémon cries
come from the [PokeAPI cries repository](https://github.com/PokeAPI/cries).
Spritesheets were generated from those files by `tools/fetch-assets.mjs` (frames cropped and
re-packed, not redrawn; artwork downscaled to 256px wide).

The trainer front pics in `public/assets/trainers/` (FireRed/LeafGreen gym leaders, Elite Four and Champion) come from
the [pret/pokefirered](https://github.com/pret/pokefirered) decompilation's `graphics/trainers/front_pics/`, fetched by
`tools/fetch-trainer-pics.mjs` (background colour made transparent, otherwise unchanged).

The held-item icons in `public/assets/items/` come from the PokeAPI sprites repository (`sprites/items/`), fetched
by `tools/fetch-item-icons.mjs` (unchanged).

Pokémon and all related names, characters, images and sounds are © Nintendo / Creatures Inc. /
GAME FREAK inc. This is a non-commercial fan project, not affiliated with or endorsed by
Nintendo, The Pokémon Company, Creatures Inc. or GAME FREAK inc. No assets are sold or used for
commercial purposes.
