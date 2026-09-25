#!/usr/bin/env node
/**
 * fetch-trainer-pics.mjs — download the FRLG front pics of the League trainers listed in
 * src/data/generated/trainers.json from pret/pokefirered (pinned to the commit the data was extracted from)
 * and write them as transparent PNGs to public/assets/trainers/<pic>.png.
 *
 * Usage: yarn assets:trainers [--force]
 *
 * The pics are 64x64 4-bit indexed PNGs whose embedded palette is the trainer palette; index 0 is the
 * background colour and becomes transparent.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/assets/trainers');
const force = process.argv.includes('--force');

const trainers = JSON.parse(readFileSync(join(ROOT, 'src/data/generated/trainers.json'), 'utf8'));
const commit = /commit `([0-9a-f]{40})`/.exec(readFileSync(join(ROOT, 'src/data/generated/README.md'), 'utf8'))?.[1] ?? 'master';
const pics = [...new Set(Object.values(trainers).map((t) => t.pic))];

/** First palette entry of a PNG (the GBA background colour). */
function backgroundColor(png) {
  for (let o = 8; o < png.length; ) {
    const len = png.readUInt32BE(o);
    if (png.toString('ascii', o + 4, o + 8) === 'PLTE') return [png[o + 8], png[o + 9], png[o + 10]];
    o += 12 + len;
  }
  return null;
}

mkdirSync(OUT, { recursive: true });
let fetched = 0;
for (const pic of pics) {
  const file = join(OUT, `${pic}.png`);
  if (existsSync(file) && !force) continue;
  const url = `https://raw.githubusercontent.com/pret/pokefirered/${commit}/graphics/trainers/front_pics/${pic}_front_pic.png`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const png = Buffer.from(await res.arrayBuffer());
  const bg = backgroundColor(png);
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (bg) for (let i = 0; i < data.length; i += 4) if (data[i] === bg[0] && data[i + 1] === bg[1] && data[i + 2] === bg[2]) data[i + 3] = 0;
  writeFileSync(file, await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toBuffer());
  fetched++;
  console.log(`wrote ${file}`);
}
console.log(`${pics.length} trainer pics (${fetched} fetched) from pret/pokefirered@${commit.slice(0, 7)}`);
