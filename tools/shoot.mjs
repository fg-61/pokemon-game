/**
 * Headless screenshot helper (Playwright + the preinstalled Chromium).
 *   node tools/shoot.mjs --url "http://localhost:5173/lab.html?move=THUNDERBOLT&auto=1" --at 400,900,1500 --out tests/screenshots/thunderbolt
 * Options:
 *   --url       page to open (dev server must be running: npm run dev)
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
import { mkdirSync } from 'node:fs';
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
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
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
const t0 = gameMode ? await gameNow() : Date.now();
if (evalJs) page.evaluate(evalJs).catch((e) => errors.push(`[eval] ${e.message}`));
for (const ms of at) {
  if (gameMode) {
    while ((await gameNow()) - t0 < ms) await page.waitForTimeout(40);
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
