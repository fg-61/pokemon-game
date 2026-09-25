---
name: move-vfx
description: Create or polish a move's battle VFX recipe (particles, beams, shockwaves, camera) in Evo Clash and verify it with the VFX Lab screenshots. Use for "efekt", "VFX", "animation for <move>", or when a move looks weak/generic.
---

# Author a move VFX recipe

## Where things live
- Recipes: `src/vfx/recipes/<type>.ts`, registered with `registerMoveFx('MOVE_KEY', async (c) => { ... })`.
  `src/vfx/recipes/index.ts` imports every type file.
- Context `c` (`MoveFxContext` in `src/vfx/vfx.ts`): `vfx`, `stage`, `move`, `pal {core, main, dark}`, `side`,
  `attacker`/`target` sprites, `user`/`foe` body centers, `userFeet`/`foeFeet`, `dir`, `hits`, `missed`, `phase`
  (`'charge'` for turn 1 of two-turn moves), `self`, `power` (0..1), `impact(i)`, `aim(frac)`.
- Helpers: `vfx.burst / stream / trail / rain / spiral / hitSpark / dust / particle / shot / shake`,
  primitives `vfx.prim.beam / shockwave / slash / lightning / orb / pillar / shield / debris / dropRock`,
  building blocks in `src/vfx/recipes/common.ts` (`contact`, `projectile`, `beamAttack`, `aura`, `cloud`).
- Screen FX: `c.stage.flash`, `chromaPulse`, `shockwave` (radial blur), `setTint`, `clock.slowMo`.
- Particle textures: glow spark ring smoke flame drop leaf shard bubble streak star feather rock zzz wisp dot.

## Rules
1. Call `c.impact(i)` exactly when hit `i` lands (i < c.hits). Skip when `c.missed` (aim at `c.aim()` — it is offset).
   The presenter applies damage numbers / HP drain / hit reactions at impact.
2. Structure: anticipation → travel → impact → dissipation. 1.0–2.2 s typical, ultimates ≤ 3.2 s.
3. Colors: normal-blended particles (`additive: false`) for colored bodies (fire, water, smoke, goo, dust);
   additive for glows/sparks. High intensity additive stacks wash out to white.
4. ≤ ~1500 live particles at peak. Always unsubscribe `stage.onUpdate` listeners. Never throw.
5. Must work from both sides (side 0 = player bottom-left → foe top-right, side 1 reverse). No hard-coded positions.
6. If you move the camera, return with `vfx.shot('wide', c.side, 500)`.

## Iterate with the VFX Lab
Start a no-HMR dev server (so edits don't reload the page mid-capture):
`yarn vite --config vite.nohmr.config.ts` (port 5174). Then:
```
node tools/shoot.mjs --url "http://localhost:5174/lab.html?fixed=1&a=6&b=9" --size 960x540 --game --wait 2500 \
  --eval "window.__lab.play('FLAMETHROWER',0,false)" --at 300,700,1100 --out tests/screenshots/flamethrower
```
- `?fixed=1` + `--game`: headless Chromium renders WebGL in software (few fps), so time is advanced per frame and
  `--at` is in game-time ms.
- `window.__lab.play(move, side, missed, phase)`; `a`/`b` = dex numbers of player/foe sprites; `theme=` meadow|volcano|night|snow.
- View PNGs with the Read tool. Fix anything printed under `Console:`.
- In a real browser: `yarn dev` → http://localhost:5173/lab.html (Space replays; ★ marks moves with a recipe).
