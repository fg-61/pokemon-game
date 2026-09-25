/**
 * Validates src/data/roster.ts against the FireRed data:
 *  - species exist and each stage really evolves from the previous one
 *  - every move is learnable in FireRed by that species or one of its pre-evolutions
 *  - every move effect is resolved by the battle engine
 *  - sprite assets exist for every species
 * Usage: npm run roster:validate
 */
import { existsSync, readFileSync } from 'node:fs';
import { MOVES, SPECIES } from '../src/data/gamedata';
import { ROSTER } from '../src/data/roster';
import { SUPPORTED_EFFECTS } from '../src/battle/engine';

let errors = 0;
let warnings = 0;
const err = (m: string) => {
  errors++;
  console.error(`  ✗ ${m}`);
};
const warn = (m: string) => {
  warnings++;
  console.warn(`  ! ${m}`);
};

function learnable(speciesKey: string): Map<string, string> {
  const out = new Map<string, string>();
  let key: string | null = speciesKey;
  while (key) {
    const sp: (typeof SPECIES)[string] = SPECIES[key];
    const tag = key === speciesKey ? '' : ` (via ${sp.name})`;
    for (const l of sp.levelUp) if (!out.has(l.move)) out.set(l.move, `Lv${l.level}${tag}`);
    for (const m of sp.tmhm) if (!out.has(m)) out.set(m, `TM/HM${tag}`);
    for (const m of sp.tutor) if (!out.has(m)) out.set(m, `Tutor${tag}`);
    for (const m of sp.egg) if (!out.has(m)) out.set(m, `Egg${tag}`);
    key = sp.prevo;
  }
  return out;
}

const rosterDex = new Set<number>((JSON.parse(readFileSync('src/data/roster-dex.json', 'utf8')).lines as number[][]).flat());
const seen = new Set<string>();

for (const line of ROSTER) {
  console.log(`${line.id} (${line.role}, Lv${line.level})`);
  if (seen.has(line.id)) err(`duplicate line id ${line.id}`);
  seen.add(line.id);
  line.stages.forEach((stage, i) => {
    const sp = SPECIES[stage.species];
    if (!sp) return err(`unknown species ${stage.species}`);
    if (i > 0) {
      const prev = line.stages[i - 1].species;
      if (sp.prevo !== prev) err(`${sp.name} does not evolve from ${prev} (prevo=${sp.prevo})`);
    }
    if (!rosterDex.has(sp.dex)) err(`${sp.name} (#${sp.dex}) missing from src/data/roster-dex.json`);
    if (!existsSync(`public/assets/pokemon/${sp.dex}/sprite.json`)) err(`no sprite assets for ${sp.name} (#${sp.dex}) — run npm run assets:fetch`);
    const legal = learnable(stage.species);
    const parts: string[] = [];
    if (new Set(stage.moves).size !== 4) err(`${sp.name}: duplicate moves`);
    for (const mk of stage.moves) {
      const mv = MOVES[mk];
      if (!mv) {
        err(`${sp.name}: unknown move ${mk}`);
        continue;
      }
      const how = legal.get(mk);
      if (!how) err(`${sp.name} cannot learn ${mv.name} in FireRed`);
      if (!SUPPORTED_EFFECTS.has(mv.effect)) warn(`${sp.name}: ${mv.name} effect ${mv.effect} not implemented (treated as plain hit/fail)`);
      parts.push(`${mv.name}[${mv.type.slice(0, 3)} ${mv.power || '-'} ${how ?? '??'}]`);
    }
    const b = sp.base;
    const bst = b.hp + b.atk + b.def + b.spa + b.spd + b.spe;
    console.log(`  ${i + 1}. ${sp.name.padEnd(11)} BST ${bst}  ${parts.join('  ')}`);
  });
}

console.log(`\n${ROSTER.length} lines, ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
