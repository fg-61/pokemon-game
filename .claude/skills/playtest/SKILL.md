---
name: playtest
description: Run Evo Clash and see a change working — dev server, automated AI-vs-AI battles in headless Chromium, screenshots of title/team select/battle/VFX, console error capture. Use to run, start, screenshot or verify the game in the real app.
---

# Playtest Evo Clash

## Run it
- `yarn dev` → http://localhost:5173 (game), http://localhost:5173/lab.html (VFX Lab).
- `yarn build && yarn preview` for the production bundle.

## Headless verification (this container / CI)
Headless Chromium renders WebGL in software (a few fps). Two things make captures reliable:
1. A dev server **without HMR** so edits don't reload the page: `yarn vite --config vite.nohmr.config.ts` (port 5174).
2. `?fixed=1` in the URL (every rendered frame advances the game clock by 1/30 s) + `--game` in `tools/shoot.mjs`
   (capture times are game-clock ms).

### URL switches
| param | effect |
|---|---|
| `quick=1` | skip menus, start a battle immediately |
| `team=charmander,pikachu,gastly` / `foe=squirtle,abra,machop` | roster line ids |
| `auto=1` | the AI plays your side too (no timing prompts) — full unattended battles |
| `difficulty=easy|normal|hard`, `theme=meadow|volcano|night|snow` | opponent AI / arena |
| `fixed=1` | deterministic frame-stepped clock (for screenshots) |

### Examples
```
# title screen
node tools/shoot.mjs --url "http://localhost:5174/?fixed=1" --game --wait 3000 --at 500,4000 --out tests/screenshots/title
# an automated battle, several moments
node tools/shoot.mjs --url "http://localhost:5174/?quick=1&auto=1&fixed=1&team=charmander,pikachu,gastly&foe=squirtle,machop,abra" \
  --game --wait 2000 --at 3000,9000,16000,25000 --out tests/screenshots/battle
```
Look at the PNGs with the Read tool. Anything under `Console:` in the output is a bug to fix
(the Google-fonts/ERR_CERT lines are only sandbox network noise).

### Interacting
`window.__battle` is the running `BattleController` (`.battle` = engine state), `window.__stage` the renderer.
With Playwright you can press keys: `1`-`4` moves, `s` switch, `e` evolve, `Space` timing ring.

## Before calling a change done
`yarn typecheck && yarn test && yarn roster:validate`, then at least one headless battle capture.
