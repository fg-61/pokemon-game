#!/usr/bin/env node
// Extracts species, move and type-chart data from the pret/pokefirered
// decompilation into JSON files under src/data/generated/.
//
// Usage: node tools/extract-firered.mjs [--src <path-to-pokefirered>]
//
// Source directory resolution: --src, else $POKEFIRERED_DIR, else
// <repo>/.cache/pokefirered (shallow sparse-cloned automatically if missing).
// No ROM is used; everything comes from the C sources.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(REPO_ROOT, 'src/data/generated');
const UPSTREAM = 'https://github.com/pret/pokefirered.git';
const SPARSE_DIRS = ['src/data', 'include/constants'];
// Root-level files of src/ (pokemon.c, party_menu.c, battle_main.c, move_descriptions.c)
// are included by cone-mode sparse checkout once any src/ subdirectory is added.

// ---------------------------------------------------------------------------
// CLI / source resolution
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--src') args.src = argv[++i];
    else if (a.startsWith('--src=')) args.src = a.slice(6);
    else if (a === '-h' || a === '--help') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
}

function ensureSource(dir) {
  if (existsSync(join(dir, 'src/data/battle_moves.h'))) return;
  if (existsSync(dir) && existsSync(join(dir, '.git'))) {
    console.log(`Adding sparse paths to existing clone at ${dir}`);
    git(dir, 'sparse-checkout', 'add', ...SPARSE_DIRS);
    return;
  }
  console.log(`Cloning ${UPSTREAM} (shallow, sparse) into ${dir}`);
  mkdirSync(dirname(dir), { recursive: true });
  execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', UPSTREAM, dir], {
    stdio: 'inherit',
  });
  git(dir, 'sparse-checkout', 'set', ...SPARSE_DIRS);
}

// ---------------------------------------------------------------------------
// Generic C parsing helpers
// ---------------------------------------------------------------------------

let SRC = '';
const read = (rel) => stripComments(readFileSync(join(SRC, rel), 'utf8'));

function stripComments(text) {
  // Remove /* */ and // comments while leaving string literals intact.
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 1;
      out += ' ';
    } else if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      i = end < 0 ? text.length : end - 1;
    } else out += c;
  }
  return out;
}

/** Returns the text between the braces of `<name>[...] = { ... }`. */
function arrayBody(text, name) {
  const re = new RegExp(`\\b${name}\\s*(\\[[^\\]]*\\]\\s*)*=\\s*\\{`);
  const m = re.exec(text);
  if (!m) throw new Error(`Array ${name} not found`);
  const start = m.index + m[0].length;
  let depth = 1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      i++;
      while (text[i] !== '"') i += text[i] === '\\' ? 2 : 1;
    } else if (c === '{' || c === '(') depth++;
    else if (c === '}' || c === ')') {
      depth--;
      if (depth === 0) return text.slice(start, i);
    }
  }
  throw new Error(`Unterminated array ${name}`);
}

/** Splits on commas at nesting depth 0 (respecting (), {}, [] and strings). */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"') {
      let j = i + 1;
      while (body[j] !== '"') j += body[j] === '\\' ? 2 : 1;
      cur += body.slice(i, j + 1);
      i = j;
      continue;
    }
    if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c)) depth--;
    if (c === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** Parses `[KEY] = value, ...` (designated array initializers) into a Map. */
function designated(body) {
  const map = new Map();
  for (const part of splitTopLevel(body)) {
    const m = /^\[\s*([^\]]+?)\s*\]\s*=\s*([\s\S]*)$/.exec(part);
    if (m) map.set(m[1].replace(/\s+/g, ' '), m[2].trim());
  }
  return map;
}

/** Parses a `{ .field = value, ... }` struct initializer into a plain object. */
function structFields(value) {
  const inner = value.trim().replace(/^\{/, '').replace(/\}$/, '');
  const obj = {};
  for (const part of splitTopLevel(inner)) {
    const m = /^\.(\w+)\s*=\s*([\s\S]*)$/.exec(part);
    if (m) obj[m[1]] = m[2].trim();
  }
  return obj;
}

/** Items of a brace list: "{A, B}" -> ["A","B"]. */
const braceList = (v) => splitTopLevel(v.trim().replace(/^\{/, '').replace(/\}$/, ''));

/** Collects `#define NAME value` lines. */
function defines(text) {
  const map = new Map();
  for (const m of text.matchAll(/^[ \t]*#define[ \t]+(\w+)[ \t]+([^\n]+)$/gm)) map.set(m[1], m[2].trim());
  return map;
}

/** Resolves a numeric #define (following aliases and simple `(A + n)` forms). */
function resolveNumber(defs, name, seen = new Set()) {
  let v = defs.get(name);
  if (v === undefined || seen.has(name)) return undefined;
  seen.add(name);
  v = v.replace(/^\((.*)\)$/, '$1').trim();
  if (/^-?(0x[0-9a-f]+|\d+)$/i.test(v)) return Number(v);
  const m = /^(\w+)\s*([+-])\s*(\d+)$/.exec(v);
  if (m) {
    const base = resolveNumber(defs, m[1], seen);
    return base === undefined ? undefined : m[2] === '+' ? base + Number(m[3]) : base - Number(m[3]);
  }
  if (/^\w+$/.test(v)) return resolveNumber(defs, v, seen);
  return undefined;
}

/** Parses the first `enum { ... }` containing `firstMember` into name -> index. */
function enumValues(text, firstMember) {
  const m = new RegExp(`enum\\s*\\w*\\s*\\{([^}]*\\b${firstMember}\\b[^}]*)\\}`).exec(text);
  if (!m) throw new Error(`enum with ${firstMember} not found`);
  const map = new Map();
  let next = 0;
  for (const part of splitTopLevel(m[1])) {
    const [name, val] = part.split('=').map((s) => s.trim());
    if (!name) continue;
    const idx = val !== undefined ? (map.get(val) ?? Number(val)) : next;
    map.set(name, idx);
    next = idx + 1;
  }
  return map;
}

/** Decodes the text inside `_("..." "...")` (Game Freak charmap string). */
function gameString(value) {
  const pieces = [...value.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  return pieces
    .join('')
    .replace(/\\[nlp]/g, ' ')
    .replace(/\\(.)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const strip = (prefix) => (s) => s.trim().replace(new RegExp(`^${prefix}`), '');

/** "MR. MIME" -> "Mr. Mime", "HO-OH" -> "Ho-Oh", "FARFETCH'D" -> "Farfetch'd". */
function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

// Gen-3 names squeezed into 12 characters lost their spaces (e.g. THUNDERPUNCH).
// When the letters match the constant name we restore the word breaks from it;
// these two use a hyphen in the modern spelling.
const HYPHENATED_MOVES = new Set(['SELF_DESTRUCT', 'SOFT_BOILED']);

function moveDisplayName(key, gameName) {
  const letters = (s) => s.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const words = key.split('_');
  const gameWords = gameName.split(/[\s-]/);
  if (words.length > gameWords.length && letters(key) === letters(gameName)) {
    // Rebuild from the key, keeping any separator the game name already had.
    let out = '';
    let pos = 0;
    for (let i = 0; i < words.length; i++) {
      if (i > 0) {
        const sep = gameName[pos] === '-' || gameName[pos] === ' ' ? gameName[pos] : null;
        if (sep) pos++;
        out += sep ?? (HYPHENATED_MOVES.has(key) ? '-' : ' ');
      }
      out += words[i];
      pos += words[i].length;
    }
    return titleCase(out);
  }
  return titleCase(gameName);
}

const PHYSICAL_TYPES = new Set(['NORMAL', 'FIGHTING', 'FLYING', 'POISON', 'GROUND', 'ROCK', 'BUG', 'GHOST', 'STEEL']);

function extractMoves() {
  const battleMoves = designated(arrayBody(read('src/data/battle_moves.h'), 'gBattleMoves'));
  const names = designated(arrayBody(read('src/data/text/move_names.h'), 'gMoveNames'));

  const descText = read('src/move_descriptions.c');
  const descStrings = new Map();
  for (const m of descText.matchAll(/const\s+u8\s+(\w+)\s*\[\s*\]\s*=\s*(_\([\s\S]*?\));/g)) {
    descStrings.set(m[1], gameString(m[2]));
  }
  const descPointers = designated(arrayBody(descText, 'gMoveDescriptionPointers'));
  const descByMove = new Map();
  for (const [idx, sym] of descPointers) {
    const m = /^MOVE_(\w+)\s*-\s*1$/.exec(idx);
    if (m) descByMove.set(m[1], descStrings.get(sym) ?? '');
  }

  const moves = {};
  for (const [idx, value] of battleMoves) {
    const key = strip('MOVE_')(idx);
    if (key === 'NONE') continue;
    const f = structFields(value);
    const type = strip('TYPE_')(f.type);
    const power = Number(f.power);
    const flags = f.flags === '0' ? [] : f.flags.split('|').map(strip('FLAG_')).filter(Boolean);
    const gameName = names.has(idx) ? gameString(names.get(idx)) : key.replace(/_/g, ' ');
    moves[key] = {
      key,
      name: moveDisplayName(key, gameName),
      type,
      power,
      accuracy: Number(f.accuracy),
      pp: Number(f.pp),
      effect: strip('EFFECT_')(f.effect),
      effectChance: Number(f.secondaryEffectChance),
      target: strip('MOVE_TARGET_')(f.target),
      priority: Number(f.priority),
      flags,
      category: power === 0 ? 'status' : PHYSICAL_TYPES.has(type) ? 'physical' : 'special',
      description: descByMove.get(key) ?? '',
    };
  }
  return moves;
}

// ---------------------------------------------------------------------------
// Type chart
// ---------------------------------------------------------------------------

function extractTypeChart() {
  const body = arrayBody(read('src/battle_main.c'), 'gTypeEffectiveness');
  const items = splitTopLevel(body);
  const mult = { TYPE_MUL_SUPER_EFFECTIVE: 2, TYPE_MUL_NOT_EFFECTIVE: 0.5, TYPE_MUL_NO_EFFECT: 0, TYPE_MUL_NORMAL: 1 };
  const chart = {};
  const foresight = [];
  let afterForesight = false;
  for (let i = 0; i + 2 < items.length; i += 3) {
    const [atkRaw, defRaw, mulRaw] = items.slice(i, i + 3);
    if (atkRaw === 'TYPE_ENDTABLE') break;
    if (atkRaw === 'TYPE_FORESIGHT') {
      afterForesight = true;
      continue;
    }
    const atk = strip('TYPE_')(atkRaw);
    const def = strip('TYPE_')(defRaw);
    const m = mult[mulRaw] ?? Number(mulRaw) / 10;
    if (m === 1) continue;
    // Rows after the TYPE_FORESIGHT separator (Normal/Fighting -> Ghost immunity)
    // still apply in normal battle; Cmd_typecalc only stops there when the
    // target is under Foresight/Odor Sleuth. They are part of the real chart.
    if (afterForesight) foresight.push(`${atk}->${def}`);
    (chart[atk] ??= {})[def] = m;
  }
  return { chart, foresight };
}

// ---------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------

function extractSpecies(moves) {
  const speciesDefs = defines(read('include/constants/species.h'));
  const numSpecies = resolveNumber(speciesDefs, 'NUM_SPECIES');
  const speciesById = new Map();
  for (const [name] of speciesDefs) {
    if (!name.startsWith('SPECIES_')) continue;
    const id = resolveNumber(speciesDefs, name);
    if (id > 0 && id < numSpecies && !speciesById.has(id)) speciesById.set(id, name.slice(8));
  }

  // Species -> national dex (sSpeciesToNationalPokedexNum in src/pokemon.c,
  // whose values are the NATIONAL_DEX_* enum in include/constants/pokedex.h).
  const natDex = enumValues(read('include/constants/pokedex.h'), 'NATIONAL_DEX_NONE');
  const pokemonC = read('src/pokemon.c');
  const toNational = new Map();
  for (const part of splitTopLevel(arrayBody(pokemonC, 'sSpeciesToNationalPokedexNum'))) {
    let m = /^SPECIES_TO_NATIONAL\(\s*(\w+)\s*\)$/.exec(part);
    if (m) {
      toNational.set(m[1], natDex.get(`NATIONAL_DEX_${m[1]}`));
      continue;
    }
    m = /^\[\s*SPECIES_(\w+)\s*-\s*1\s*\]\s*=\s*(\w+)$/.exec(part);
    if (m) toNational.set(m[1], natDex.get(m[2]) ?? Number(m[2]));
  }
  const nationalMax = natDex.get('NATIONAL_DEX_DEOXYS');

  const info = designated(arrayBody(read('src/data/pokemon/species_info.h'), 'gSpeciesInfo'));
  const names = designated(arrayBody(read('src/data/text/species_names.h'), 'gSpeciesNames'));
  const evoTable = designated(arrayBody(read('src/data/pokemon/evolution.h'), 'gEvolutionTable'));

  // Level-up learnsets: pointer table -> named arrays.
  const lvlText = read('src/data/pokemon/level_up_learnsets.h');
  const learnsets = new Map();
  for (const m of lvlText.matchAll(/static\s+const\s+u16\s+(\w+)\s*\[\s*\]\s*=\s*\{([\s\S]*?)\};/g)) {
    const list = [];
    for (const e of m[2].matchAll(/LEVEL_UP_MOVE\(\s*(\d+)\s*,\s*MOVE_(\w+)\s*\)/g)) {
      list.push({ level: Number(e[1]), move: e[2] });
    }
    learnsets.set(m[1], list);
  }
  const lvlPointers = designated(arrayBody(read('src/data/pokemon/level_up_learnset_pointers.h'), 'gLevelUpLearnsets'));

  // TM/HM: sTMHMMoves (src/data/party_menu.h) indexed by machine number.
  const tmhmMoves = splitTopLevel(arrayBody(read('src/data/party_menu.h'), 'sTMHMMoves')).map(strip('MOVE_'));
  const tmhmSets = designated(arrayBody(read('src/data/pokemon/tmhm_learnsets.h'), 'sTMHMLearnsets'));
  const machineMove = (label) => {
    const m = /^(TM|HM)(\d+)/.exec(label);
    const idx = m[1] === 'TM' ? Number(m[2]) - 1 : 50 + Number(m[2]) - 1;
    return tmhmMoves[idx];
  };

  // Tutor: sTutorLearnsets bitfields plus the starter-only ultimate moves that
  // CanLearnTutorMove() in src/party_menu.c hard-codes per species.
  const tutorSets = designated(arrayBody(read('src/data/pokemon/tutor_learnsets.h'), 'sTutorLearnsets'));
  const specialTutor = new Map();
  const partyMenuC = read('src/party_menu.c');
  const canLearn = /CanLearnTutorMove\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/.exec(partyMenuC);
  if (canLearn) {
    for (const m of canLearn[1].matchAll(/case\s+TUTOR_MOVE_(\w+)\s*:\s*if\s*\(\s*species\s*==\s*SPECIES_(\w+)\s*\)/g)) {
      specialTutor.set(m[2], [...(specialTutor.get(m[2]) ?? []), m[1]]);
    }
  }

  // Egg moves: egg_moves(SPECIES, MOVE_A, MOVE_B, ...)
  const eggMoves = new Map();
  for (const part of splitTopLevel(arrayBody(read('src/data/pokemon/egg_moves.h'), 'gEggMoves'))) {
    const m = /^egg_moves\(\s*(\w+)\s*,([\s\S]*)\)$/.exec(part);
    if (m) eggMoves.set(m[1], splitTopLevel(m[2]).map(strip('MOVE_')));
  }

  // Pokedex: gPokedexEntries (keyed by NATIONAL_DEX_*) + FireRed dex text.
  const dexEntries = designated(arrayBody(read('src/data/pokemon/pokedex_entries.h'), 'gPokedexEntries'));
  const dexTexts = new Map();
  for (const m of read('src/data/pokemon/pokedex_text_fr.h').matchAll(/const\s+u8\s+(\w+)\s*\[\s*\]\s*=\s*(_\([\s\S]*?\));/g)) {
    dexTexts.set(m[1], gameString(m[2]));
  }

  const genderRatio = (v) => {
    if (v === 'MON_GENDERLESS') return null;
    if (v === 'MON_MALE') return 0;
    if (v === 'MON_FEMALE') return 100;
    const m = /PERCENT_FEMALE\(\s*([\d.]+)\s*\)/.exec(v);
    if (m) return Number(m[1]);
    throw new Error(`Unknown genderRatio ${v}`);
  };

  const species = [];
  for (const [id, key] of [...speciesById].sort((a, b) => a[0] - b[0])) {
    const dex = toNational.get(key);
    if (!dex || dex > nationalMax) continue; // OLD_UNOWN_* placeholders etc.
    const idx = `SPECIES_${key}`;
    const f = structFields(info.get(idx));
    const dexKey = [...natDex].find(([, n]) => n === dex)[0];
    const d = structFields(dexEntries.get(dexKey));

    const evolutions = [];
    if (evoTable.has(idx)) {
      for (const evo of braceList(evoTable.get(idx))) {
        const [method, param, into] = braceList(evo);
        const p = param.startsWith('ITEM_') ? param.slice(5) : Number(param);
        evolutions.push({ method: strip('EVO_')(method), param: p, into: strip('SPECIES_')(into) });
      }
    }

    const tmhm = [...(tmhmSets.get(idx) ?? '').matchAll(/TMHM\(\s*((?:TM|HM)\d+)\w*\s*\)/g)].map((m) => machineMove(m[1]));
    const tutor = [...(tutorSets.get(idx) ?? '').matchAll(/TUTOR\(\s*MOVE_(\w+)\s*\)/g)].map((m) => m[1]);
    tutor.push(...(specialTutor.get(key) ?? []));

    species.push({
      key,
      dex,
      name: titleCase(gameString(names.get(idx))),
      types: [...new Set(braceList(f.types).map(strip('TYPE_')))],
      base: {
        hp: Number(f.baseHP),
        atk: Number(f.baseAttack),
        def: Number(f.baseDefense),
        spa: Number(f.baseSpAttack),
        spd: Number(f.baseSpDefense),
        spe: Number(f.baseSpeed),
      },
      abilities: braceList(f.abilities).filter((a) => a !== 'ABILITY_NONE').map(strip('ABILITY_')),
      evolutions,
      prevo: null,
      levelUp: learnsets.get(lvlPointers.get(idx)) ?? [],
      tmhm,
      tutor,
      egg: eggMoves.get(key) ?? [],
      category: titleCase(gameString(d.categoryName)),
      heightDm: Number(d.height),
      weightHg: Number(d.weight),
      dexEntry: dexTexts.get(d.description) ?? '',
      genderRatio: genderRatio(f.genderRatio),
      growthRate: strip('GROWTH_')(f.growthRate),
    });
  }
  species.sort((a, b) => a.dex - b.dex);

  // FireRed replaces Deoxys' Normal-forme stats from gSpeciesInfo with its
  // Attack-forme stats at runtime (GetDeoxysStat / sDeoxysBaseStats in src/pokemon.c).
  const deoxysBlock = /#if\s+defined\(FIRERED\)([\s\S]*?)#elif/.exec(pokemonC.slice(pokemonC.search(/sDeoxysBaseStats\s*\[/) - 200));
  const deoxys = species.find((s) => s.key === 'DEOXYS');
  if (deoxysBlock && deoxys) {
    const stats = designated(arrayBody(deoxysBlock[1], 'sDeoxysBaseStats'));
    const statKey = { STAT_HP: 'hp', STAT_ATK: 'atk', STAT_DEF: 'def', STAT_SPATK: 'spa', STAT_SPDEF: 'spd', STAT_SPEED: 'spe' };
    for (const [stat, v] of stats) deoxys.base[statKey[stat]] = Number(v);
  }

  const byKey = Object.fromEntries(species.map((s) => [s.key, s]));
  for (const s of species) {
    for (const e of s.evolutions) {
      const target = byKey[e.into];
      if (!target) throw new Error(`${s.key} evolves into unknown ${e.into}`);
      target.prevo ??= s.key;
    }
  }

  // Sanity: every referenced move exists.
  for (const s of species) {
    for (const mv of [...s.levelUp.map((l) => l.move), ...s.tmhm, ...s.tutor, ...s.egg]) {
      if (!moves[mv]) throw new Error(`${s.key} references unknown move ${mv}`);
    }
  }
  return byKey;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** JSON with nesting expanded only where a value does not fit on one line. */
function formatJson(value, indent = '', prefixLen = 0, width = 110) {
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  const flat = JSON.stringify(value, null, 1).replace(/\n\s*/g, ' ').replace(/([[{]) /g, '$1').replace(/ ([\]}])/g, '$1');
  if (indent.length + prefixLen + flat.length <= width) return flat;
  const inner = indent + '  ';
  if (Array.isArray(value) && value.every((v) => typeof v !== 'object' || v === null)) {
    // Primitive arrays: fill lines up to the width instead of one item per line.
    const lines = [];
    let line = '';
    for (const item of value.map((v) => JSON.stringify(v))) {
      if (line && inner.length + line.length + item.length + 2 > width) {
        lines.push(line);
        line = '';
      }
      line += (line ? ' ' : '') + item + ',';
    }
    lines.push(line.slice(0, -1));
    return `[\n${lines.map((l) => inner + l).join('\n')}\n${indent}]`;
  }
  const entries = Array.isArray(value)
    ? value.map((v) => inner + formatJson(v, inner, 0, width))
    : Object.entries(value).map(([k, v]) => {
        const key = `${JSON.stringify(k)}: `;
        return inner + key + formatJson(v, inner, key.length, width);
      });
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  return `${open}\n${entries.join(',\n')}\n${indent}${close}`;
}

function write(name, data) {
  const file = join(OUT_DIR, name);
  writeFileSync(file, formatJson(data) + '\n');
  console.log(`wrote ${file}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/extract-firered.mjs [--src <path-to-pokefirered>]');
    return;
  }
  SRC = resolve(args.src ?? process.env.POKEFIRERED_DIR ?? join(REPO_ROOT, '.cache/pokefirered'));
  ensureSource(SRC);

  let commit = 'unknown';
  try {
    commit = git(SRC, 'rev-parse', 'HEAD');
  } catch {
    /* not a git checkout */
  }

  const moves = extractMoves();
  const { chart, foresight } = extractTypeChart();
  const species = extractSpecies(moves);

  mkdirSync(OUT_DIR, { recursive: true });
  write('species.json', species);
  write('moves.json', moves);
  write('typechart.json', chart);

  const readme = `# Generated FireRed data

**Do not edit by hand.** These files are produced by \`tools/extract-firered.mjs\`
from the [pret/pokefirered](https://github.com/pret/pokefirered) decompilation
(commit \`${commit}\`).

| File | Contents | Main sources |
| --- | --- | --- |
| \`species.json\` | ${Object.keys(species).length} species (national dex 1-${Math.max(...Object.values(species).map((s) => s.dex))}), keyed by constant name without \`SPECIES_\` | \`src/data/pokemon/species_info.h\`, \`evolution.h\`, \`level_up_learnsets.h\`, \`tmhm_learnsets.h\`, \`tutor_learnsets.h\`, \`egg_moves.h\`, \`pokedex_entries.h\`, \`pokedex_text_fr.h\`, \`src/data/text/species_names.h\`, \`src/pokemon.c\` (national dex map) |
| \`moves.json\` | ${Object.keys(moves).length} moves, keyed by constant name without \`MOVE_\` | \`src/data/battle_moves.h\`, \`src/data/text/move_names.h\`, \`src/move_descriptions.c\` |
| \`typechart.json\` | Non-1x type matchups: \`chart[attacker][defender]\` = 0, 0.5 or 2 | \`gTypeEffectiveness\` in \`src/battle_main.c\` |

Types are defined in \`src/data/types.ts\`; \`src/data/gamedata.ts\` loads the JSON.

Notes:
- Move \`category\` is derived with the Gen-3 rule (power 0 = status, otherwise by type).
- The type chart includes the rows after the \`TYPE_FORESIGHT\` separator
  (${foresight.join(', ')}): they apply normally and are only skipped when
  the target is under Foresight/Odor Sleuth.

## Regenerate

\`\`\`sh
yarn data:extract                                    # clones into .cache/pokefirered if needed
node tools/extract-firered.mjs --src ../pokefirered  # or use an existing checkout
\`\`\`
`;
  writeFileSync(join(OUT_DIR, 'README.md'), readme);
  console.log(`wrote ${join(OUT_DIR, 'README.md')}`);
  console.log(`species: ${Object.keys(species).length}, moves: ${Object.keys(moves).length}, commit ${commit}`);
}

main();
