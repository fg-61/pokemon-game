/**
 * Headless screenshot helper (Playwright; sandbox Chromium or the local Google Chrome).
 *   node tools/shoot.mjs --url "http://localhost:5173/lab.html?move=THUNDERBOLT&auto=1" --at 400,900,1500 --out tests/screenshots/thunderbolt
 * Options:
 *   --url       page to open (dev server must be running: yarn dev)
 *   --at        comma separated ms offsets after load (+ --wait) at which to capture
 *   --wait      ms to wait after the load event before the timeline starts (default 1500)
 *   --eval      JS to evaluate after the wait (e.g. "window.__lab.play('SURF',0,false)")
 *   --size      WxH viewport (default 1280x720)
 *   --out       output path prefix (files: <out>-<ms>.png)
 *   --game      interpret --at as GAME-clock ms (use with ?fixed=1 in the URL: every rendered frame = 1/30 s).
 *               Needed because headless Chromium renders WebGL in software (a few fps).
 * Prints console errors / page errors so recipes that throw are caught.
 */
import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const url = opt('url', 'http://localhost:5173/');
const at = opt('at', '0')
  .split(',')
  .map(Number);
const wait = Number(opt('wait', '1500'));
const out = opt('out', 'tests/screenshots/shot');
const [w, h] = opt('size', '1280x720').split('x').map(Number);
const evalJs = opt('eval', '');

mkdirSync(dirname(out), { recursive: true });
// Cloud sandbox: the preinstalled Chromium with software WebGL. Local machine: the installed Google Chrome on the real GPU.
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const autoplay = '--autoplay-policy=no-user-gesture-required';
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH || existsSync(SANDBOX_CHROMIUM)
    ? {
        executablePath: process.env.CHROMIUM_PATH || SANDBOX_CHROMIUM,
        args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', autoplay],
      }
    : { channel: 'chrome', args: [autoplay] },
);
const page = await browser.newPage({ viewport: { width: w, height: h } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(wait);
const gameMode = args.includes('--game');
const gameNow = () => page.evaluate(() => (window.__stage ? window.__stage.clock.time * 1000 : 0));
// in game mode the clock is held at each capture time, so fast GPUs and slow screenshots don't drift the timeline
const holdAt = (ms) => page.evaluate((s) => window.__stage && (window.__stage.holdAt = s), ms === null ? null : ms / 1000);
const t0 = gameMode ? await gameNow() : Date.now();
if (gameMode) await holdAt(t0 + at[0]);
if (evalJs) page.evaluate(evalJs).catch((e) => errors.push(`[eval] ${e.message}`));
for (const ms of at) {
  if (gameMode) {
    await holdAt(t0 + ms);
    while ((await gameNow()) - t0 < ms) await page.waitForTimeout(20);
  } else {
    const delay = ms - (Date.now() - t0);
    if (delay > 0) await page.waitForTimeout(delay);
  }
  const file = `${out}-${ms}.png`;
  await page.screenshot({ path: file });
  console.log(file);
}
if (errors.length) console.log('Console:\n' + errors.slice(0, 30).join('\n'));
await browser.close();
