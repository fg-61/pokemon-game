/**
 * Generates roster lines for every FireRed species that is not in a hand-curated line.
 *
 *   npm run roster:generate      -> writes src/data/roster.generated.ts and src/data/roster-dex.json
 *
 * Lines = every root→leaf path of the evolution graph (branching families such as Eevee or Tyrogue become
 * one line per branch). Each stage gets 1-4 moves that are learnable in FireRed (level-up / TM-HM / tutor /
 * egg, incl. pre-evolutions) and whose effect the engine implements, chosen by a scoring heuristic:
 * best STAB per type, best coverage type, one utility move, then the next best attacks.
 * Power is capped per stage (stage 1 ≤ 70, stage 2 ≤ 95 in 3-stage lines) so evolving matters.
 * Initial levels come from the final stage's BST; tools/tune-levels.ts then balances them with the simulator.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { SUPPORTED_EFFECTS } from '../src/battle/engine';
import { calcStats } from '../src/battle/stats';
import { MOVES, SPECIES, typeMultiplier } from '../src/data/gamedata';
import { CURATED, type RosterLine } from '../src/data/roster';
import type { MoveData, PokeType, SpeciesData } from '../src/data/types';

const LEGENDARY = new Set(['ARTICUNO', 'ZAPDOS', 'MOLTRES', 'MEWTWO', 'MEW', 'RAIKOU', 'ENTEI', 'SUICUNE', 'LUGIA', 'HO_OH', 'CELEBI', 'REGIROCK', 'REGICE', 'REGISTEEL', 'LATIAS', 'LATIOS', 'KYOGRE', 'GROUDON', 'RAYQUAZA', 'JIRACHI', 'DEOXYS']);
const TYPES: PokeType[] = ['NORMAL', 'FIRE', 'WATER', 'ELECTRIC', 'GRASS', 'ICE', 'FIGHTING', 'POISON', 'GROUND', 'FLYING', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST', 'DRAGON', 'DARK', 'STEEL'];

/** Moves never auto-picked (degenerate, un-fun, or pointless without the missing mechanic). */
const BANNED = new Set([
  'TOXIC', 'DOUBLE_TEAM', 'MINIMIZE', 'ATTRACT', 'RETURN', 'FRUSTRATION', 'SECRET_POWER', 'FACADE', 'HIDDEN_POWER', 'SNORE',
  'SPLASH', 'FOCUS_PUNCH', 'SWAGGER', 'FLATTER', 'SAND_ATTACK', 'SMOKESCREEN', 'FLASH', 'KINESIS', 'MUD_SLAP', 'OCTAZOOKA',
  'FALSE_SWIPE', 'STRUGGLE', 'PAY_DAY', 'TELEPORT', 'SWEET_SCENT', 'GROWL', 'TAIL_WHIP', 'LEER', 'STRING_SHOT', 'COTTON_SPORE',
  'RAGE', 'UPROAR', 'THIEF', 'BEAT_UP', 'WEATHER_BALL', 'PURSUIT',
]);
const SELF_KO = new Set(['EXPLOSION', 'SELF_DESTRUCT']);

// utility moves: effect -> base value (multiplied by suitability)
const UTILITY: Record<string, number> = {
  SLEEP: 3.0, PARALYZE: 2.4, WILL_O_WISP: 2.2, LEECH_SEED: 2.2, CONFUSE: 1.7, POISON: 1.4,
  DRAGON_DANCE: 3.1, ATTACK_UP_2: 2.9, BULK_UP: 2.7, BELLY_DRUM: 2.4, ATTACK_UP: 1.9, CALM_MIND: 3.0, SPECIAL_ATTACK_UP_2: 2.8,
  SPECIAL_ATTACK_UP: 1.8, SPEED_UP_2: 2.0, COSMIC_POWER: 2.0, DEFENSE_UP_2: 1.5, SPECIAL_DEFENSE_UP_2: 1.5,
  RESTORE_HP: 2.6, SOFTBOILED: 2.6, SYNTHESIS: 2.4, MOONLIGHT: 2.4, MORNING_SUN: 2.4, WISH: 2.2, REST: 1.7,
  REFLECT: 1.5, LIGHT_SCREEN: 1.5, PROTECT: 1.1, HAZE: 1.0, HEAL_BELL: 1.0, ROAR: 1.2, FOCUS_ENERGY: 0.9,
  DEFENSE_DOWN_2: 1.1, SPEED_DOWN_2: 1.2, ATTACK_DOWN_2: 1.2, SPECIAL_DEFENSE_DOWN_2: 1.1, TICKLE: 1.1, TRANSFORM: 3, COUNTER: 2, MIRROR_COAT: 2,
  // filler only (below the 1.6 utility threshold)
  DEFENSE_UP: 0.8, DEFENSE_CURL: 0.8, SPECIAL_DEFENSE_UP: 0.8, SPEED_UP: 0.8,
};

interface Learn {
  move: MoveData;
  levelUp: boolean;
}

function learnset(key: string): Map<string, Learn> {
  const out = new Map<string, Learn>();
  let k: string | null = key;
  while (k) {
    const sp: SpeciesData = SPECIES[k];
    for (const l of sp.levelUp) if (!out.has(l.move)) out.set(l.move, { move: MOVES[l.move], levelUp: true });
    for (const m of [...sp.tmhm, ...sp.tutor, ...sp.egg]) if (!out.has(m)) out.set(m, { move: MOVES[m], levelUp: false });
    k = sp.prevo;
  }
  return out;
}

const recipeSrc = readdirSync('src/vfx/recipes').map((f) => readFileSync(`src/vfx/recipes/${f}`, 'utf8')).join('\n');
const hasRecipe = (k: string) => recipeSrc.includes(`'${k}'`);

/** Effective power estimate for scoring (not the engine's damage). */
function effPower(m: MoveData): number {
  switch (m.effect) {
    case 'MULTI_HIT':
      return m.power * 3;
    case 'DOUBLE_HIT':
    case 'TWINEEDLE':
      return m.power * 2;
    case 'TRIPLE_KICK':
      return 60;
    case 'LEVEL_DAMAGE':
      return 65;
    case 'DRAGON_RAGE':
      return 45;
    case 'SONICBOOM':
      return 25;
    case 'SUPER_FANG':
      return 60;
    case 'PSYWAVE':
      return 50;
    case 'FLAIL':
    case 'LOW_KICK':
    case 'PRESENT':
      return 60;
    case 'MAGNITUDE':
      return 70;
    case 'ERUPTION':
      return 110;
    case 'COUNTER':
    case 'MIRROR_COAT':
    case 'ENDEAVOR':
      return 45;
    case 'REVENGE':
    case 'SMELLINGSALT':
      return m.power * 1.3;
  }
  return m.power;
}

function scoreAttack(m: MoveData, sp: SpeciesData, l: Learn): number {
  const s = sp.base;
  const physical = m.category === 'physical';
  const stat = physical ? s.atk : s.spa;
  const best = Math.max(s.atk, s.spa);
  let v = effPower(m);
  v *= m.accuracy === 0 || m.effect === 'ALWAYS_HIT' ? 1 : m.accuracy / 100;
  if (sp.types.includes(m.type)) v *= 1.5;
  v *= (stat / best) ** 1.6;
  if (m.effect === 'RECHARGE') v *= 0.55;
  if (['SOLAR_BEAM', 'SKULL_BASH', 'SKY_ATTACK', 'RAZOR_WIND', 'SEMI_INVULNERABLE'].includes(m.effect)) v *= 0.65;
  if (m.effect === 'RECOIL' || m.effect === 'DOUBLE_EDGE') v *= 0.9;
  if (m.effect === 'SUPERPOWER' || m.effect === 'OVERHEAT') v *= 0.9;
  if (m.effect === 'DREAM_EATER') v *= 0.4;
  if (m.effect === 'COUNTER' || m.effect === 'MIRROR_COAT') v *= 0.6;
  if (SELF_KO.has(m.key)) v *= l.levelUp ? 0.35 : 0.1;
  if (m.effectChance > 0 || m.priority > 0) v *= 1.06;
  if (l.levelUp) v *= 1.08;
  if (hasRecipe(m.key)) v *= 1.04;
  return v;
}

function scoreUtility(m: MoveData, sp: SpeciesData): number {
  const base = UTILITY[m.effect];
  if (!base) return 0;
  const s = sp.base;
  const physical = s.atk >= s.spa;
  let v = base * (m.accuracy === 0 ? 1 : m.accuracy / 100);
  if (['DRAGON_DANCE', 'ATTACK_UP_2', 'BULK_UP', 'BELLY_DRUM', 'ATTACK_UP'].includes(m.effect) && !physical) v *= 0.3;
  if (['CALM_MIND', 'SPECIAL_ATTACK_UP_2', 'SPECIAL_ATTACK_UP'].includes(m.effect) && physical) v *= 0.3;
  const bulk = (s.hp + s.def + s.spd) / 3;
  if (['RESTORE_HP', 'SOFTBOILED', 'SYNTHESIS', 'MOONLIGHT', 'MORNING_SUN', 'WISH', 'REST'].includes(m.effect)) v *= bulk > 80 ? 1.2 : 0.8;
  return v;
}

function pickMoves(speciesKey: string, maxPower: number): string[] {
  const sp = SPECIES[speciesKey];
  if (speciesKey === 'SMEARGLE') return ['SPORE', 'EXTREME_SPEED', 'BELLY_DRUM', 'RECOVER']; // Sketch: anything goes
  if (speciesKey === 'UNOWN') return ['HIDDEN_POWER'];
  const all = [...learnset(speciesKey).values()].filter((l) => l.move && SUPPORTED_EFFECTS.has(l.move.effect) && !BANNED.has(l.move.key));
  const attacks = all.filter((l) => l.move.category !== 'status' && l.move.power > 0 && (l.move.power <= maxPower || effPower(l.move) <= maxPower) && effPower(l.move) <= maxPower * 1.34);
  const ranked = attacks.map((l) => ({ k: l.move.key, t: l.move.type, v: scoreAttack(l.move, sp, l) })).sort((a, b) => b.v - a.v);
  const picked: string[] = [];
  const pickedTypes = new Set<string>();
  const take = (k: string, t: string) => {
    if (!picked.includes(k)) {
      picked.push(k);
      pickedTypes.add(t);
    }
  };
  // 1-2: best STAB per own type
  for (const ty of sp.types) {
    const best = ranked.find((r) => r.t === ty);
    if (best) take(best.k, best.t);
  }
  // 3: best coverage (types that hit what STAB doesn't)
  const coverage = (types: Set<string>) => TYPES.filter((d) => [...types].some((a) => typeMultiplier(a as PokeType, [d]) > 1)).length;
  const covBase = coverage(pickedTypes);
  const cov = ranked
    .filter((r) => !pickedTypes.has(r.t))
    .map((r) => ({ ...r, g: coverage(new Set([...pickedTypes, r.t])) - covBase }))
    .sort((a, b) => b.v * (1 + 0.18 * b.g) - a.v * (1 + 0.18 * a.g))[0];
  if (cov && picked.length < 3) take(cov.k, cov.t);
  // 4: utility
  const util = all
    .filter((l) => l.move.category === 'status')
    .map((l) => ({ k: l.move.key, v: scoreUtility(l.move, sp) * (l.levelUp ? 1.1 : 1) * (hasRecipe(l.move.key) ? 1.05 : 1) }))
    .filter((u) => u.v > 0)
    .sort((a, b) => b.v - a.v)[0];
  if (util && util.v >= 1.6) picked.push(util.k);
  // fill: next best attacks (prefer new types)
  for (const r of ranked) {
    if (picked.length >= 4) break;
    if (picked.includes(r.k)) continue;
    if (pickedTypes.has(r.t) && ranked.some((x) => !pickedTypes.has(x.t) && !picked.includes(x.k) && x.v > r.v * 0.7)) continue;
    take(r.k, r.t);
  }
  // still short (tiny movepools): any remaining status / attacks
  if (picked.length < 4 && util && !picked.includes(util.k)) picked.push(util.k);
  for (const l of all) if (picked.length < 4 && !picked.includes(l.move.key) && (l.move.category !== 'status' || UTILITY[l.move.effect])) picked.push(l.move.key);
  if (!picked.length) picked.push('STRUGGLE');
  return picked.slice(0, 4);
}

function roleOf(keys: string[]): string {
  const last = SPECIES[keys[keys.length - 1]];
  if (LEGENDARY.has(last.key)) return 'Legendary';
  const s = last.base;
  const bulk = (s.hp + s.def + s.spd) / 3;
  const off = Math.max(s.atk, s.spa);
  if (s.spe >= 100 && off >= 90) return s.atk >= s.spa ? 'Physical Sweeper' : 'Special Sweeper';
  if (bulk >= 95 && off < 90) return 'Tank';
  if (off >= 110) return s.atk >= s.spa ? 'Heavy Hitter' : 'Special Nuker';
  if (s.spe >= 100) return 'Speedster';
  if (bulk >= 85) return 'Bruiser';
  return 'Balanced';
}

function evoRate(keys: string[]): number {
  if (keys.length < 2) return 1;
  const first = SPECIES[keys[0]].evolutions.find((e) => e.into === keys[1]);
  if (first && first.method.startsWith('LEVEL') && typeof first.param === 'number') return Math.round(Math.min(2.5, Math.max(0.8, 30 / first.param)) * 100) / 100;
  return 1.1;
}

function initialLevel(keys: string[]): number {
  const s = SPECIES[keys[keys.length - 1]].base;
  const bst = s.hp + s.atk + s.def + s.spa + s.spd + s.spe;
  const target = keys.length === 1 ? 470 : keys.length === 2 ? 480 : 520;
  const st = calcStats(s, 50);
  void st;
  return Math.round(Math.max(28, Math.min(75, 50 - (bst - target) / 12)));
}

// ---------------------------------------------------------------- build paths

const curatedPaths = new Set(CURATED.map((l) => l.stages.map((s) => s.species).join('>')));
const curatedIds = new Set(CURATED.map((l) => l.id));
const paths: string[][] = [];
const roots = Object.values(SPECIES).filter((s) => !s.prevo).sort((a, b) => a.dex - b.dex);
for (const r of roots) {
  const walk = (key: string, acc: string[]) => {
    const next = [...new Set(SPECIES[key].evolutions.map((e) => e.into))];
    if (!next.length) paths.push([...acc, key]);
    for (const n of next) walk(n, [...acc, key]);
  };
  walk(r.key, []);
}

const lines: RosterLine[] = [];
for (const keys of paths) {
  if (curatedPaths.has(keys.join('>'))) continue;
  const root = keys[0].toLowerCase();
  const siblings = paths.filter((p) => p[0] === keys[0]).length;
  let id = siblings > 1 || curatedIds.has(root) ? `${root}-${keys[keys.length - 1].toLowerCase()}` : root;
  id = id.replace(/_/g, '-');
  const n = keys.length;
  const bands = n === 1 ? [999] : n === 2 ? [90, 999] : [70, 95, 999];
  const sp0 = SPECIES[keys[0]];
  const tags = [
    sp0.dex <= 151 ? 'kanto' : sp0.dex <= 251 ? 'johto' : 'hoenn',
    ...(keys.some((k) => LEGENDARY.has(k)) ? ['legendary'] : []),
    ...(siblings > 1 ? ['branch'] : []),
  ];
  const last = SPECIES[keys[n - 1]];
  lines.push({
    id,
    role: roleOf(keys),
    blurb: `The ${last.category} Pokémon. Ability: ${last.abilities[0]?.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ') ?? '—'}.`,
    level: initialLevel(keys),
    ...(evoRate(keys) !== 1 ? { evoRate: evoRate(keys) } : {}),
    tags,
    stages: keys.map((k, i) => ({ species: k, moves: pickMoves(k, bands[i]) })),
  });
}
lines.sort((a, b) => SPECIES[a.stages[0].species].dex - SPECIES[b.stages[0].species].dex);

const header = `// GENERATED by tools/gen-roster.ts — do not edit by hand (curate a line in roster.ts instead).\n// ${lines.length} lines.\nimport type { RosterLine } from './roster';\n\n`;
writeFileSync('src/data/roster.generated.ts', `${header}export const GENERATED: RosterLine[] = ${JSON.stringify(lines, null, 1)};\n`);

const allLines = [...CURATED.map((l) => l.stages.map((s) => SPECIES[s.species].dex)), ...lines.map((l) => l.stages.map((s) => SPECIES[s.species].dex))];
const dexJson = JSON.parse(readFileSync('src/data/roster-dex.json', 'utf8'));
dexJson.lines = allLines;
writeFileSync('src/data/roster-dex.json', JSON.stringify(dexJson, null, 0).replace(/\],\[/g, '],\n[') + '\n');
const species = new Set(allLines.flat());
console.log(`${lines.length} generated lines (+${CURATED.length} curated) covering ${species.size} species`);
