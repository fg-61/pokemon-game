import { MOVES, typeMultiplier } from '../data/gamedata';
import type { PokeType } from '../data/types';
import type { Battle } from './engine';
import type { Rng } from './rng';
import { other, type Action, type BattleMon, type Side, type TimingGrade, type WeatherKind } from './types';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface AIProfile {
  /** softmax temperature on action scores (higher = more random) */
  temperature: number;
  switching: boolean;
  /** probability distribution of attack timing grades [perfect, good] (rest = miss) */
  atkTiming: [number, number];
  /** probability of a perfect / good brace */
  braceTiming: [number, number];
}

export const AI_PROFILES: Record<Difficulty, AIProfile> = {
  easy: { temperature: 0.35, switching: false, atkTiming: [0.12, 0.45], braceTiming: [0.05, 0.2] },
  normal: { temperature: 0.12, switching: true, atkTiming: [0.3, 0.5], braceTiming: [0.15, 0.35] },
  hard: { temperature: 0.03, switching: true, atkTiming: [0.5, 0.4], braceTiming: [0.3, 0.4] },
};

export function rollTiming(rng: Rng, dist: [number, number]): TimingGrade {
  const r = rng.next();
  return r < dist[0] ? 'perfect' : r < dist[0] + dist[1] ? 'good' : 'miss';
}

interface Scored {
  action: Action;
  score: number;
}

/** Heuristic action scoring. Scores are roughly "fraction of the foe's HP bar worth of value". */
export function scoreActions(b: Battle, side: Side, profile: AIProfile): Scored[] {
  const me = b.active(side);
  const foe = b.active(other(side));
  const out: Scored[] = [];
  const foeHpFrac = foe.hp / foe.stats.hp;
  const myHpFrac = me.hp / me.stats.hp;

  me.moves.forEach((slot, i) => {
    if (slot.pp <= 0) return;
    const mv = MOVES[slot.key];
    let s = 0;
    if (mv.category !== 'status') {
      const est = b.estimateDamage(side, slot.key);
      const avg = (est.min + est.max) / 2;
      const w = b.weatherNow();
      const accPct = mv.effect === 'THUNDER' && w === 'rain' ? 0 : mv.effect === 'THUNDER' && w === 'sun' ? 50 : mv.accuracy;
      const acc = accPct === 0 || mv.effect === 'ALWAYS_HIT' ? 1 : accPct / 100;
      s = Math.min(avg, foe.hp) / foe.stats.hp;
      if (avg >= foe.hp) s += 0.35; // finishing blow
      s *= acc;
      if (mv.effect === 'RECHARGE') s *= avg >= foe.hp ? 1 : 0.6;
      if (['SOLAR_BEAM', 'SKULL_BASH', 'SKY_ATTACK', 'RAZOR_WIND'].includes(mv.effect) && !(mv.effect === 'SOLAR_BEAM' && w === 'sun')) s *= 0.7;
      if ((mv.effect === 'RECOIL' || mv.effect === 'DOUBLE_EDGE') && me.ability !== 'ROCK_HEAD') s *= 0.9;
      if (mv.effect === 'ABSORB') s *= 1 + (1 - myHpFrac) * 0.4;
      if (mv.effect === 'SUPERPOWER' || mv.effect === 'OVERHEAT') s *= 0.9;
      if (mv.priority > 0 && avg >= foe.hp) s += 0.2;
      if (mv.effect === 'DREAM_EATER' && foe.status !== 'slp') s = 0;
      // secondary status value
      if (foe.status === 'none' && mv.effectChance > 0 && /BURN|PARALYZE|FREEZE|POISON|THUNDER/.test(mv.effect)) s += (mv.effectChance / 100) * 0.15;
    } else {
      s = statusMoveValue(b, side, slot.key, myHpFrac, foeHpFrac);
    }
    out.push({ action: { type: 'move', slot: i }, score: s });
  });

  if (b.canEvolve(me)) {
    // evolving is almost always great unless we can take the KO right now
    const bestHit = Math.max(0, ...out.map((o) => o.score));
    out.push({ action: { type: 'evolve' }, score: bestHit > 1.0 ? 0.6 : 0.9 });
  }

  if (profile.switching) {
    const threat = bestEffectiveness(foe.types, me.types, foeMoveTypes(b, other(side)));
    const myPower = bestEffectiveness(me.types, foe.types, me.moves.map((m) => MOVES[m.key]).filter((m) => m.category !== 'status').map((m) => m.type as PokeType));
    if (threat >= 2 && myPower <= 1 && myHpFrac > 0.25) {
      for (const idx of b.switchTargets(side)) {
        const cand = b.sides[side].team[idx];
        const candThreat = bestEffectiveness(foe.types, cand.types, foeMoveTypes(b, other(side)));
        const candPower = bestEffectiveness(cand.types, foe.types, cand.moves.map((m) => MOVES[m.key]).filter((m) => m.category !== 'status').map((m) => m.type as PokeType));
        if (candThreat <= 1 && candPower >= 1) {
          out.push({ action: { type: 'switch', index: idx }, score: 0.35 + (candPower >= 2 ? 0.15 : 0) + (cand.hp / cand.stats.hp) * 0.1 });
        }
      }
    }
  }
  if (out.length === 0) out.push({ action: { type: 'move', slot: 0 }, score: 0 });
  return out;
}

function statusMoveValue(b: Battle, side: Side, key: string, myHp: number, foeHp: number): number {
  const mv = MOVES[key];
  const me = b.active(side);
  const foe = b.active(other(side));
  const e = mv.effect;
  const foeFree = foe.status === 'none';
  switch (e) {
    case 'SLEEP':
      return foeFree ? 0.55 * (mv.accuracy / 100) : 0;
    case 'PARALYZE':
      return foeFree && typeMultiplier(mv.type as PokeType, foe.types) > 0 ? 0.4 : 0;
    case 'TOXIC':
    case 'POISON':
    case 'WILL_O_WISP':
      return foeFree && !foe.types.includes('POISON') && !foe.types.includes('STEEL') ? 0.3 * foeHp : 0;
    case 'CONFUSE':
      return foe.vol.confusion === 0 ? 0.25 : 0;
    case 'LEECH_SEED':
      return !foe.vol.leechSeed && !foe.types.includes('GRASS') ? 0.35 * foeHp : 0;
    case 'RESTORE_HP':
    case 'SOFTBOILED':
    case 'SYNTHESIS':
    case 'MORNING_SUN':
    case 'MOONLIGHT':
      return myHp < 0.55 ? (1 - myHp) * 0.8 : 0;
    case 'REST':
      return myHp < 0.35 ? 0.6 : 0;
    case 'PROTECT':
      if (me.vol.protectChain > 0) return 0;
      return foe.status === 'psn' || foe.status === 'tox' || foe.status === 'brn' || foe.vol.leechSeed ? 0.25 : 0.06;
    case 'REFLECT':
      return b.sides[side].reflect > 0 ? 0 : 0.28;
    case 'LIGHT_SCREEN':
      return b.sides[side].lightScreen > 0 ? 0 : 0.28;
    case 'HAZE':
      return Object.values(foe.boosts).reduce((a, v) => a + Math.max(0, v), 0) * 0.15;
    case 'FOCUS_ENERGY':
      return me.vol.focusEnergy ? 0 : 0.15;
    case 'SUNNY_DAY':
      return weatherValue(b, side, 'sun', myHp);
    case 'RAIN_DANCE':
      return weatherValue(b, side, 'rain', myHp);
    case 'SANDSTORM':
      return weatherValue(b, side, 'sand', myHp);
    case 'HAIL':
      return weatherValue(b, side, 'hail', myHp);
  }
  // stat boosts: worth more early (full HP) and with little boosting so far
  const up = /(ATTACK|DEFENSE|SPEED|SPECIAL_ATTACK|SPECIAL_DEFENSE|EVASION)_UP(_2)?$|CALM_MIND|BULK_UP|DRAGON_DANCE|COSMIC_POWER|DEFENSE_CURL/.test(e);
  if (up) {
    const total = Object.values(me.boosts).reduce((a, v) => a + Math.max(0, v), 0);
    return Math.max(0, (myHp - 0.4) * 0.6 - total * 0.12);
  }
  if (/_DOWN(_2)?$/.test(e)) {
    const total = Object.values(foe.boosts).reduce((a, v) => a + Math.min(0, v), 0);
    return Math.max(0, 0.18 + total * 0.06);
  }
  return 0.05;
}

/** How much a side gains from setting `kind` (its moves / abilities vs the foe's), ~0..0.6. */
function weatherValue(b: Battle, side: Side, kind: WeatherKind, myHp: number): number {
  if (b.weather?.kind === kind && b.weather.left > 6) return 0;
  const me = b.active(side);
  const foe = b.active(other(side));
  const moveTypes = (m: BattleMon) => new Set(m.moves.map((x) => MOVES[x.key]).filter((x) => x.category !== 'status' || x.effect === 'SOLAR_BEAM').map((x) => x.type));
  const has = (m: BattleMon, effect: string) => m.moves.some((x) => MOVES[x.key].effect === effect);
  const mine = moveTypes(me);
  const theirs = moveTypes(foe);
  const immune = (m: BattleMon) => (kind === 'sand' ? m.types.some((t) => t === 'ROCK' || t === 'GROUND' || t === 'STEEL') || m.ability === 'SAND_VEIL' : m.types.includes('ICE'));
  let v = 0;
  if (kind === 'sun' || kind === 'rain') {
    const good = kind === 'sun' ? 'FIRE' : 'WATER';
    const bad = kind === 'sun' ? 'WATER' : 'FIRE';
    if (mine.has(good)) v += 0.18;
    if (mine.has(bad)) v -= 0.15;
    if (theirs.has(bad)) v += 0.1;
    if (theirs.has(good)) v -= 0.12;
    if (me.ability === (kind === 'sun' ? 'CHLOROPHYLL' : 'SWIFT_SWIM')) v += 0.25;
    if (kind === 'sun' && (has(me, 'SOLAR_BEAM') || has(me, 'SYNTHESIS') || has(me, 'MORNING_SUN') || has(me, 'MOONLIGHT'))) v += 0.12;
    if (kind === 'rain' && (has(me, 'THUNDER') || me.ability === 'RAIN_DISH')) v += 0.12;
    if (me.ability === 'FORECAST' || has(me, 'WEATHER_BALL')) v += 0.1;
  } else {
    if (immune(me) && !immune(foe)) v += 0.25;
    else if (!immune(me) && immune(foe)) v -= 0.2;
    else v += 0.03;
    if (me.ability === 'FORECAST' || has(me, 'WEATHER_BALL')) v += 0.08;
  }
  return Math.max(0, Math.min(0.6, v)) * (0.5 + 0.5 * myHp);
}

function foeMoveTypes(b: Battle, side: Side): PokeType[] {
  return b
    .active(side)
    .moves.map((m) => MOVES[m.key])
    .filter((m) => m.category !== 'status')
    .map((m) => m.type as PokeType);
}

function bestEffectiveness(_atkTypes: PokeType[], defTypes: PokeType[], moveTypes: PokeType[]): number {
  let best = 0;
  for (const t of moveTypes) best = Math.max(best, typeMultiplier(t, defTypes));
  return best;
}

export function chooseAction(b: Battle, side: Side, profile: AIProfile, rng: Rng): Action {
  const forced = b.forcedAction(side);
  if (forced) return forced;
  const scored = scoreActions(b, side, profile);
  const max = Math.max(...scored.map((s) => s.score));
  const weights = scored.map((s) => Math.exp((s.score - max) / Math.max(0.001, profile.temperature)));
  const sum = weights.reduce((a, w) => a + w, 0);
  let r = rng.next() * sum;
  for (let i = 0; i < scored.length; i++) {
    r -= weights[i];
    if (r <= 0) return scored[i].action;
  }
  return scored[scored.length - 1].action;
}

/** Pick the best replacement after a faint. */
export function chooseReplacement(b: Battle, side: Side): number {
  const foe = b.active(other(side));
  let best = -1;
  let bestScore = -Infinity;
  for (const idx of b.switchTargets(side)) {
    const c = b.sides[side].team[idx];
    const power = bestEffectiveness(c.types, foe.types, c.moves.map((m) => MOVES[m.key]).filter((m) => m.category !== 'status').map((m) => m.type as PokeType));
    const threat = foe.fainted ? 1 : bestEffectiveness(foe.types, c.types, foeMoveTypes(b, other(side)));
    const s = power - threat * 0.8 + (c.hp / c.stats.hp) * 0.5;
    if (s > bestScore) {
      bestScore = s;
      best = idx;
    }
  }
  return best;
}
