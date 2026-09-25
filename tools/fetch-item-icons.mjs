#!/usr/bin/env node
/**
 * fetch-item-icons.mjs — download the held-item icons used by the game (src/battle/items.ts) from the PokeAPI
 * sprites repository into public/assets/items/<slug>.png.
 *
 * Usage: yarn assets:items [--force]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/assets/items');
const force = process.argv.includes('--force');
// item ids are the keys of NAMES in src/battle/items.ts
const src = readFileSync(join(ROOT, 'src/battle/items.ts'), 'utf8');
const body = /const NAMES: Record<string, string> = \{([\s\S]*?)\n\};/.exec(src)?.[1] ?? '';
const ids = [...body.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
if (!ids.length) throw new Error('no item ids found in src/battle/items.ts');

mkdirSync(OUT, { recursive: true });
let fetched = 0;
for (const id of ids) {
  const slug = id.replace(/_/g, '-');
  const file = join(OUT, `${slug}.png`);
  if (existsSync(file) && !force) continue;
  const url = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${slug}.png`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  fetched++;
}
console.log(`${ids.length} item icons (${fetched} fetched) -> public/assets/items`);
