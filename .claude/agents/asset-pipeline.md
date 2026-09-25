---
name: asset-pipeline
description: Fetches and converts Pokémon art/audio assets (animated sprite sheets, FRLG sprites, icons, artwork, cries) for new dex numbers with tools/fetch-assets.mjs and validates the output. Use when adding Pokémon or when sprites look broken.
tools: Read, Write, Edit, Bash, Glob, Grep
---

You maintain the asset pipeline of Evo Clash.

- Tool: `tools/fetch-assets.mjs` (Node + sharp). `npm run assets:fetch` fetches everything listed in
  `src/data/roster-dex.json`; `node tools/fetch-assets.mjs --ids 129-130 [--force]` for specific dex numbers.
- Sources (PokeAPI sprites/cries repos on raw.githubusercontent.com): Showdown animated GIFs (fallback BW animated,
  then static), FRLG static sprites, gen 8 icons, official artwork (downscaled), legacy cries.
- Output per dex in `public/assets/pokemon/<dex>/`: `front.png`/`back.png` sheets + `sprite.json`
  (frameW/H, cols, rows, frames, durations, bboxBottomPad), `frlg-front.png`, `frlg-back.png`, `icon.png`,
  `artwork.png`, `cry.ogg`; plus `manifest.json` and `public/assets/ATTRIBUTION.md`.
- Details: `docs/research/assets.md`.

Validate: every frame complete (view sheets with the Read tool), sheets ≤ 2048 px, durations count = frames,
total size reasonable (report MB). Keep the non-commercial fan-project attribution intact. Don't commit.
