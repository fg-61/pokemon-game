#!/usr/bin/env node
/**
 * fetch-assets.mjs — download Pokémon sprites / icons / artwork / cries from the
 * PokeAPI sprites + cries repositories and build billboard spritesheets.
 *
 * Usage:
 *   node tools/fetch-assets.mjs [--ids 1-9,16,25-26] [--force] [--out public/assets/pokemon]
 *   npm run assets:fetch -- --ids 25 --force
 *
 *   --ids    comma list of dex numbers / ranges. Default: every number in
 *            src/data/roster-dex.json (`lines` = array of arrays of dex numbers).
 *   --force  re-download and rebuild outputs that already exist.
 *   --out    output root (default public/assets/pokemon). Handy for testing.
 *
 * Output per dex, in <out>/{dex}/:
 *   front.png, back.png   spritesheets built from the animated GIF (see below)
 *   sprite.json           { dex, front: Sheet, back: Sheet }
 *   frlg-front.png, frlg-back.png, icon.png, artwork.png (256px wide), cry.ogg
 *                         (optional; missing ones are simply not listed in the manifest)
 * plus <out>/manifest.json (merged with existing entries) and
 * <out>/../ATTRIBUTION.md.
 *
 * Sheet = { file, frameW, frameH, cols, rows, frames, durations: number[] (ms, >= 20),
 *           source: "showdown" | "bw" | "static", bboxBottomPad }
 *
 * Spritesheet construction:
 *   - All GIF frames are decoded fully composited by sharp/libvips
 *     (`sharp(buf, { animated: true })` → vertical strip of `pages` frames of
 *     `pageHeight` px, with `delay[]`). This was verified to be pixel-identical
 *     to Pillow's disposal-aware compositing on the Showdown GIFs.
 *   - The union bounding box of non-transparent pixels over ALL frames is used to
 *     crop every frame identically (+2px transparent padding), so there is no
 *     jitter between frames. Frame pixels are never resampled.
 *   - Frames are laid out row-major in a grid with cols = ceil(sqrt(n)). If the
 *     sheet would exceed 2048px on a side, every other frame is dropped (the
 *     dropped frame's duration is added to the kept one, i.e. durations double)
 *     until it fits.
 *   - GIF delays <= 10ms are treated as 100ms (browser convention), then clamped
 *     to >= 20ms.
 *   - PNGs are written palette-quantized only when the quantized result decodes
 *     back pixel-identical to the source (sprites have <= 256 colours);
 *     otherwise full-colour RGBA is kept.
 *
 * Network / proxy notes:
 *   - Uses Node's global fetch (Node >= 22). Node's fetch ignores HTTPS_PROXY
 *     unless NODE_USE_ENV_PROXY=1 is set (Node >= 22.21 / 24). When HTTPS_PROXY
 *     is set and NODE_USE_ENV_PROXY is not, this script re-executes itself with
 *     NODE_USE_ENV_PROXY=1, so `npm run assets:fetch` works behind a proxy as-is.
 *   - A TLS-intercepting proxy needs its CA trusted via NODE_EXTRA_CA_CERTS
 *     (e.g. NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt in the Claude Code
 *     sandbox, where it is already set). TLS verification is never disabled.
 *   - Only raw.githubusercontent.com is contacted.
 *
 * Sources: PokeAPI/sprites and PokeAPI/cries (see ATTRIBUTION.md).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Proxy bootstrap: re-exec with NODE_USE_ENV_PROXY=1 so fetch honours HTTPS_PROXY.
// ---------------------------------------------------------------------------
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(
    process.execPath,
    [...process.execArgv, '--disable-warning=UNDICI-EHPA', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } },
  );
  process.exit(r.status ?? 1);
}

const { default: sharp } = await import('sharp');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const B = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const CRIES = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon';

const SOURCES = {
  showdownFront: `${B}/other/showdown/{dex}.gif`,
  showdownBack: `${B}/other/showdown/back/{dex}.gif`,
  bwFront: `${B}/versions/generation-v/black-white/animated/{dex}.gif`,
  bwBack: `${B}/versions/generation-v/black-white/animated/back/{dex}.gif`,
  staticFront: `${B}/{dex}.png`,
  staticBack: `${B}/back/{dex}.png`,
  frlgFront: `${B}/versions/generation-iii/firered-leafgreen/{dex}.png`,
  frlgBack: `${B}/versions/generation-iii/firered-leafgreen/back/{dex}.png`,
  icon: `${B}/versions/generation-viii/icons/{dex}.png`,
  iconFallback: `${B}/versions/generation-vii/icons/{dex}.png`,
  artwork: `${B}/other/official-artwork/{dex}.png`,
  cry: `${CRIES}/legacy/{dex}.ogg`,
  cryFallback: `${CRIES}/latest/{dex}.ogg`,
};
const url = (key, dex) => SOURCES[key].replace('{dex}', String(dex));

const MAX_SHEET = 2048;
const PAD = 2;
const CONCURRENCY = 4;
const ARTWORK_WIDTH = 256;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = { ids: null, force: false, out: path.join(ROOT, 'public/assets/pokemon') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') opts.force = true;
    else if (a === '--ids') opts.ids = parseIds(argv[++i] ?? '');
    else if (a.startsWith('--ids=')) opts.ids = parseIds(a.slice(6));
    else if (a === '--out') opts.out = path.resolve(argv[++i]);
    else if (a === '-h' || a === '--help') {
      console.log('Usage: node tools/fetch-assets.mjs [--ids 1-9,16,25-26] [--force] [--out dir]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return opts;
}

function parseIds(spec) {
  const ids = new Set();
  for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) throw new Error(`Bad --ids part: "${part}"`);
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) ids.add(i);
  }
  if (!ids.size) throw new Error('--ids is empty');
  return [...ids].sort((x, y) => x - y);
}

async function defaultIds() {
  const roster = JSON.parse(await readFile(path.join(ROOT, 'src/data/roster-dex.json'), 'utf8'));
  return [...new Set(roster.lines.flat().map(Number))].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Networking: concurrency-limited fetch with retries. 404 → null (no retry).
// ---------------------------------------------------------------------------
let active = 0;
const waiters = [];
async function withSlot(fn) {
  if (active >= CONCURRENCY) await new Promise((r) => waiters.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function download(u) {
  return withSlot(async () => {
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(u, { signal: AbortSignal.timeout(30_000) });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      } catch (e) {
        lastErr = e;
        if (attempt < 3) await sleep(500 * 2 ** (attempt - 1) + Math.random() * 250);
      }
    }
    const cause = lastErr?.cause ? ` (${lastErr.cause.code ?? lastErr.cause.message})` : '';
    throw new Error(`GET ${u} failed after 3 attempts: ${lastErr?.message}${cause}`);
  });
}

/** Try each source key in order; returns { buf, key } or null. */
async function downloadFirst(keys, dex) {
  for (const key of keys) {
    const buf = await download(url(key, dex));
    if (buf) return { buf, key };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Image processing
// ---------------------------------------------------------------------------

/** Decode an (animated) image into composited RGBA frames. */
async function decodeFrames(buf, animated) {
  const img = sharp(buf, { animated, limitInputPixels: false });
  const meta = await img.metadata();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const pages = animated ? meta.pages ?? 1 : 1;
  const height = animated ? meta.pageHeight ?? info.height : info.height;
  if (info.channels !== 4 || info.height !== height * pages) {
    throw new Error(`Unexpected decode layout ${info.width}x${info.height}x${info.channels}, pages=${pages}`);
  }
  const frameBytes = width * height * 4;
  const frames = [];
  for (let i = 0; i < pages; i++) {
    const f = Buffer.from(data.subarray(i * frameBytes, (i + 1) * frameBytes));
    // Normalise fully transparent pixels to 0,0,0,0 (better compression, exact compare).
    for (let p = 0; p < f.length; p += 4) if (f[p + 3] === 0) f[p] = f[p + 1] = f[p + 2] = 0;
    frames.push(f);
  }
  const durations = frames.map((_, i) => {
    if (!animated) return 1000;
    const d = meta.delay?.[i] ?? 100;
    return d <= 10 ? 100 : Math.max(20, d);
  });
  return { width, height, frames, durations };
}

/** Union bounding box of alpha > 0 over all frames (inclusive coords). */
function unionBBox({ width, height, frames }) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (const f of frames) {
    for (let y = 0; y < height; y++) {
      const row = y * width * 4;
      for (let x = 0; x < width; x++) {
        if (f[row + x * 4 + 3] !== 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
  }
  if (x1 < 0) return { x0: 0, y0: 0, x1: width - 1, y1: height - 1 }; // fully transparent
  return { x0, y0, x1, y1 };
}

/** Build the sheet RGBA buffer + metadata from decoded frames. */
function buildSheet(decoded, file, source) {
  const { width, height } = decoded;
  let frames = decoded.frames;
  let durations = decoded.durations;
  const bb = unionBBox(decoded);
  const fx = bb.x0 - PAD, fy = bb.y0 - PAD;
  const frameW = bb.x1 - bb.x0 + 1 + PAD * 2;
  const frameH = bb.y1 - bb.y0 + 1 + PAD * 2;
  if (frameW > MAX_SHEET || frameH > MAX_SHEET) throw new Error(`Frame ${frameW}x${frameH} exceeds ${MAX_SHEET}`);

  const grid = (n) => {
    const cols = Math.ceil(Math.sqrt(n));
    return { cols, rows: Math.ceil(n / cols) };
  };
  let { cols, rows } = grid(frames.length);
  while ((cols * frameW > MAX_SHEET || rows * frameH > MAX_SHEET) && frames.length > 1) {
    const keptF = [], keptD = [];
    for (let i = 0; i < frames.length; i += 2) {
      keptF.push(frames[i]);
      keptD.push(durations[i] + (durations[i + 1] ?? durations[i]));
    }
    frames = keptF;
    durations = keptD;
    ({ cols, rows } = grid(frames.length));
  }

  const sheetW = cols * frameW, sheetH = rows * frameH;
  const sheet = Buffer.alloc(sheetW * sheetH * 4);
  let lowestOpaque = -1; // lowest opaque row within a cropped frame, over all frames
  frames.forEach((f, i) => {
    const ox = (i % cols) * frameW, oy = Math.floor(i / cols) * frameH;
    for (let y = 0; y < frameH; y++) {
      const sy = fy + y;
      if (sy < 0 || sy >= height) continue;
      for (let x = 0; x < frameW; x++) {
        const sx = fx + x;
        if (sx < 0 || sx >= width) continue;
        const s = (sy * width + sx) * 4;
        if (f[s + 3] === 0) continue;
        const d = ((oy + y) * sheetW + ox + x) * 4;
        sheet[d] = f[s]; sheet[d + 1] = f[s + 1]; sheet[d + 2] = f[s + 2]; sheet[d + 3] = f[s + 3];
        if (y > lowestOpaque) lowestOpaque = y;
      }
    }
  });

  return {
    rgba: sheet,
    sheetW,
    sheetH,
    meta: {
      file,
      frameW,
      frameH,
      cols,
      rows,
      frames: frames.length,
      durations,
      source,
      bboxBottomPad: lowestOpaque < 0 ? 0 : frameH - 1 - lowestOpaque,
    },
  };
}

/** Encode RGBA → PNG; use a palette only if it round-trips losslessly. */
async function encodePng(rgba, width, height) {
  const raw = { raw: { width, height, channels: 4 } };
  const full = await sharp(rgba, raw).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  let pal;
  try {
    pal = await sharp(rgba, raw)
      .png({ palette: true, colours: 256, dither: 0, quality: 100, effort: 10, compressionLevel: 9 })
      .toBuffer();
  } catch {
    return full;
  }
  if (pal.length >= full.length) return full;
  const back = await sharp(pal).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (back.info.width !== width || back.info.height !== height) return full;
  const b = back.data;
  for (let p = 0; p < rgba.length; p += 4) {
    const a = rgba[p + 3];
    if (a !== b[p + 3]) return full;
    if (a !== 0 && (rgba[p] !== b[p] || rgba[p + 1] !== b[p + 1] || rgba[p + 2] !== b[p + 2])) return full;
  }
  return pal;
}

// ---------------------------------------------------------------------------
// Per-species pipeline
// ---------------------------------------------------------------------------
const SIDES = {
  front: { file: 'front.png', chain: [['showdownFront', 'showdown', true], ['bwFront', 'bw', true], ['staticFront', 'static', false]] },
  back: { file: 'back.png', chain: [['showdownBack', 'showdown', true], ['bwBack', 'bw', true], ['staticBack', 'static', false]] },
};

const SIMPLE_FILES = [
  { file: 'frlg-front.png', keys: ['frlgFront'] },
  { file: 'frlg-back.png', keys: ['frlgBack'] },
  { file: 'icon.png', keys: ['icon', 'iconFallback'] },
  { file: 'artwork.png', keys: ['artwork'], transform: artworkTransform },
  { file: 'cry.ogg', keys: ['cry', 'cryFallback'] },
];

async function artworkTransform(buf) {
  return sharp(buf)
    .resize({ width: ARTWORK_WIDTH, withoutEnlargement: true, kernel: 'lanczos3' })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function buildSide(dex, sideName) {
  const side = SIDES[sideName];
  for (const [key, source, animated] of side.chain) {
    const buf = await download(url(key, dex));
    if (!buf) continue;
    const decoded = await decodeFrames(buf, animated);
    const built = buildSheet(decoded, side.file, source);
    const png = await encodePng(built.rgba, built.sheetW, built.sheetH);
    return { png, meta: built.meta, sourceFrames: decoded.frames.length };
  }
  return null;
}

async function readJson(p) {
  try {
    return JSON.parse(await readFile(p, 'utf8'));
  } catch {
    return null;
  }
}

async function processDex(dex, { out, force }) {
  const dir = path.join(out, String(dex));
  await mkdir(dir, { recursive: true });
  const log = [];
  const missing = [];

  // Spritesheets
  const spritePath = path.join(dir, 'sprite.json');
  const prev = (!force && (await readJson(spritePath))) || {};
  const sprite = { dex };
  for (const sideName of ['front', 'back']) {
    const file = SIDES[sideName].file;
    if (!force && prev[sideName] && existsSync(path.join(dir, file))) {
      sprite[sideName] = prev[sideName];
      continue;
    }
    const res = await buildSide(dex, sideName);
    if (!res) {
      sprite[sideName] = null;
      missing.push(file);
      continue;
    }
    await writeFile(path.join(dir, file), res.png);
    sprite[sideName] = res.meta;
    const m = res.meta;
    const dropped = res.sourceFrames !== m.frames ? ` (from ${res.sourceFrames})` : '';
    log.push(`${sideName}: ${m.source} ${m.frames}f${dropped} ${m.frameW}x${m.frameH} ${m.cols}x${m.rows} ${(res.png.length / 1024).toFixed(0)}KB`);
  }
  await writeFile(spritePath, JSON.stringify(sprite, null, 2) + '\n');

  // Simple files
  for (const { file, keys, transform } of SIMPLE_FILES) {
    const p = path.join(dir, file);
    if (!force && existsSync(p)) continue;
    const got = await downloadFirst(keys, dex);
    if (!got) {
      missing.push(file);
      continue;
    }
    await writeFile(p, transform ? await transform(got.buf) : got.buf);
    if (got.key.endsWith('Fallback')) log.push(`${file}: fallback source`);
  }

  const files = (await readdir(dir)).filter((f) => f !== 'sprite.json').sort();
  const dims = (s) => (s ? { frameW: s.frameW, frameH: s.frameH, frames: s.frames, source: s.source } : null);
  return {
    dex,
    entry: { files, front: dims(sprite.front), back: dims(sprite.back) },
    log,
    missing,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const ATTRIBUTION = `# Asset attribution

The Pokémon sprites, icons and official artwork in \`public/assets/pokemon/\` come from the
[PokeAPI sprites repository](https://github.com/PokeAPI/sprites) (animated Showdown and
Black/White sprites, FireRed/LeafGreen sprites, menu icons and official artwork). Pokémon cries
come from the [PokeAPI cries repository](https://github.com/PokeAPI/cries).
Spritesheets were generated from those files by \`tools/fetch-assets.mjs\` (frames cropped and
re-packed, not redrawn; artwork downscaled to ${ARTWORK_WIDTH}px wide).

Pokémon and all related names, characters, images and sounds are © Nintendo / Creatures Inc. /
GAME FREAK inc. This is a non-commercial fan project, not affiliated with or endorsed by
Nintendo, The Pokémon Company, Creatures Inc. or GAME FREAK inc. No assets are sold or used for
commercial purposes.
`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ids = opts.ids ?? (await defaultIds());
  await mkdir(opts.out, { recursive: true });
  console.log(`Fetching assets for ${ids.length} species → ${path.relative(ROOT, opts.out) || opts.out}${opts.force ? ' (force)' : ''}`);

  const results = [];
  const failures = [];
  const queue = [...ids];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const dex = queue.shift();
        try {
          const r = await processDex(dex, opts);
          results.push(r);
          const extra = r.missing.length ? ` | missing: ${r.missing.join(', ')}` : '';
          console.log(`#${dex} ${r.log.join(' | ') || 'up to date'}${extra}`);
        } catch (e) {
          failures.push(dex);
          console.error(`#${dex} FAILED: ${e.message}`);
        }
      }
    }),
  );

  // Merge manifest
  const manifestPath = path.join(opts.out, 'manifest.json');
  const prev = (await readJson(manifestPath)) ?? {};
  const entries = { ...(prev.entries ?? {}) };
  for (const r of results) entries[r.dex] = r.entry;
  const sorted = Object.fromEntries(Object.keys(entries).sort((a, b) => a - b).map((k) => [k, entries[k]]));
  const manifest = { generatedAt: new Date().toISOString(), source: SOURCES, entries: sorted };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(opts.out, '..', 'ATTRIBUTION.md'), ATTRIBUTION);

  const fallbacks = results.flatMap((r) =>
    ['front', 'back'].filter((s) => r.entry[s] && r.entry[s].source !== 'showdown').map((s) => `#${r.dex} ${s}=${r.entry[s].source}`),
  );
  const noSheet = results.filter((r) => !r.entry.front || !r.entry.back).map((r) => r.dex);
  console.log(`\nDone: ${results.length} ok, ${failures.length} failed${failures.length ? ` (${failures.join(', ')})` : ''}.`);
  if (fallbacks.length) console.log(`Non-Showdown sources: ${fallbacks.join(', ')}`);
  if (noSheet.length) console.log(`Missing front/back sheet: ${noSheet.join(', ')}`);
  if (failures.length || noSheet.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
