import { MOVES, SPECIES, typeMultiplier } from '../data/gamedata';
import type { MoveData, PokeType } from '../data/types';
import { getLine, type RosterLine } from '../data/roster';
import { CONFIG } from './config';
import { Rng } from './rng';
import { accuracyMultiplier, BATTLE_LEVEL, calcStats, critChance, stageMultiplier, STAT_LABEL } from './stats';
import {
  other,
  type Action,
  type BattleEvent,
  type BattleMon,
  type BoostStat,
  type HitResult,
  type Side,
  type SideState,
  type StatusCond,
  type TimingGrade,
} from './types';

export interface TeamSpec {
  name: string;
  lines: string[]; // roster line ids
  isAI: boolean;
}

export interface Timing {
  atk: TimingGrade;
  brace: TimingGrade;
}

const TWO_TURN = new Set(['SOLAR_BEAM', 'SKULL_BASH', 'SKY_ATTACK', 'RAZOR_WIND', 'SEMI_INVULNERABLE']);
const STAT_EFFECT = /^(ATTACK|DEFENSE|SPEED|SPECIAL_ATTACK|SPECIAL_DEFENSE|ACCURACY|EVASION)_(UP|DOWN)(_2)?(_HIT)?$/;
const STAT_KEY: Record<string, BoostStat> = {
  ATTACK: 'atk',
  DEFENSE: 'def',
  SPEED: 'spe',
  SPECIAL_ATTACK: 'spa',
  SPECIAL_DEFENSE: 'spd',
  ACCURACY: 'acc',
  EVASION: 'eva',
};
const PINCH_ABILITY: Record<string, PokeType> = { BLAZE: 'FIRE', TORRENT: 'WATER', OVERGROW: 'GRASS', SWARM: 'BUG' };

/** Move effects the engine resolves. Anything else is treated as a plain hit (damaging) or fails (status). */
export const SUPPORTED_EFFECTS = new Set<string>([
  'HIT', 'HIGH_CRITICAL', 'ALWAYS_HIT', 'QUICK_ATTACK', 'VITAL_THROW', 'EARTHQUAKE', 'GUST', 'TWISTER', 'PURSUIT',
  'MULTI_HIT', 'DOUBLE_HIT', 'TWINEEDLE', 'TRIPLE_KICK',
  'BURN_HIT', 'FREEZE_HIT', 'PARALYZE_HIT', 'POISON_HIT', 'THUNDER', 'TRI_ATTACK', 'BLAZE_KICK', 'POISON_FANG', 'POISON_TAIL',
  'FLINCH_HIT', 'FLINCH_MINIMIZE_HIT', 'CONFUSE_HIT', 'SECRET_POWER', 'SKY_UPPERCUT', 'THAW_HIT',
  'ABSORB', 'DREAM_EATER', 'RECOIL', 'DOUBLE_EDGE', 'RECOIL_IF_MISS', 'RECHARGE', 'RAMPAGE',
  'SUPERPOWER', 'OVERHEAT', 'RAPID_SPIN', 'BRICK_BREAK', 'FACADE', 'FLAIL', 'RETURN', 'FRUSTRATION', 'LOW_KICK',
  'ERUPTION', 'DRAGON_RAGE', 'SONICBOOM', 'LEVEL_DAMAGE', 'SUPER_FANG', 'PSYWAVE', 'FALSE_SWIPE', 'FAKE_OUT',
  'SOLAR_BEAM', 'SKULL_BASH', 'SKY_ATTACK', 'RAZOR_WIND', 'SEMI_INVULNERABLE', 'ALL_STATS_UP_HIT', 'EXPLOSION',
  'SLEEP', 'POISON', 'TOXIC', 'PARALYZE', 'WILL_O_WISP', 'CONFUSE', 'LEECH_SEED', 'PROTECT', 'REFLECT', 'LIGHT_SCREEN',
  'RESTORE_HP', 'SOFTBOILED', 'SYNTHESIS', 'MORNING_SUN', 'MOONLIGHT', 'REST', 'HAZE', 'FOCUS_ENERGY',
  'CALM_MIND', 'BULK_UP', 'DRAGON_DANCE', 'COSMIC_POWER', 'DEFENSE_CURL', 'TICKLE', 'SWAGGER', 'FLATTER',
  'ATTACK_UP', 'ATTACK_UP_2', 'DEFENSE_UP', 'DEFENSE_UP_2', 'SPEED_UP', 'SPEED_UP_2', 'SPECIAL_ATTACK_UP',
  'SPECIAL_ATTACK_UP_2', 'SPECIAL_DEFENSE_UP', 'SPECIAL_DEFENSE_UP_2', 'EVASION_UP', 'ATTACK_DOWN', 'ATTACK_DOWN_2',
  'DEFENSE_DOWN', 'DEFENSE_DOWN_2', 'SPEED_DOWN', 'SPEED_DOWN_2', 'SPECIAL_DEFENSE_DOWN_2', 'ACCURACY_DOWN',
  'EVASION_DOWN', 'ATTACK_UP_HIT', 'DEFENSE_UP_HIT', 'SPECIAL_ATTACK_UP_HIT', 'ATTACK_DOWN_HIT', 'DEFENSE_DOWN_HIT',
  'SPEED_DOWN_HIT', 'SPECIAL_ATTACK_DOWN_HIT', 'SPECIAL_DEFENSE_DOWN_HIT', 'ACCURACY_DOWN_HIT', 'EVASION_DOWN_HIT',
]);

let uidCounter = 0;

export function buildMon(line: RosterLine, stage = 0): BattleMon {
  const st = line.stages[stage];
  const sp = SPECIES[st.species];
  const stats = calcStats(sp.base, line.level);
  return {
    uid: `${line.id}-${++uidCounter}`,
    lineId: line.id,
    speciesKey: st.species,
    stage,
    name: sp.name,
    types: sp.types as PokeType[],
    ability: sp.abilities[0] ?? 'NONE',
    level: line.level ?? BATTLE_LEVEL,
    stats,
    hp: stats.hp,
    status: 'none',
    statusCounter: 0,
    boosts: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 },
    moves: st.moves.map((key) => {
      const pp = MOVES[key].pp;
      return { key, pp, maxPp: pp };
    }),
    evo: 0,
    atb: 0,
    fainted: false,
    vol: freshVolatile(),
    dealt: 0,
    perfects: 0,
  };
}

function freshVolatile(): BattleMon['vol'] {
  return {
    confusion: 0,
    leechSeed: false,
    focusEnergy: false,
    protect: 0,
    protectChain: 0,
    charging: null,
    semiInvulnerable: false,
    locked: null,
    flashFire: false,
    lastMove: null,
  };
}

export class Battle {
  sides: [SideState, SideState];
  rng: Rng;
  time = 0;
  winner: Side | null = null;
  /** Gauge is frozen for a side while it waits for a forced replacement. */
  private readySignaled: [boolean, boolean] = [false, false];

  constructor(player: TeamSpec, enemy: TeamSpec, seed?: number) {
    this.rng = new Rng(seed);
    const mk = (t: TeamSpec): SideState => ({
      team: t.lines.map((id) => buildMon(getLine(id))),
      active: 0,
      reflect: 0,
      lightScreen: 0,
      name: t.name,
      isAI: t.isAI,
    });
    this.sides = [mk(player), mk(enemy)];
    // small random head start so openings differ
    for (const s of [0, 1] as Side[]) this.active(s).atb = 0.15 + this.rng.next() * 0.2;
  }

  // ---------------------------------------------------------------- queries

  active(side: Side): BattleMon {
    const s = this.sides[side];
    return s.team[s.active];
  }

  effectiveSpeed(mon: BattleMon): number {
    let spe = mon.stats.spe * stageMultiplier(mon.boosts.spe);
    if (mon.status === 'par') spe *= 0.25;
    return spe;
  }

  /** Gauge units per second. */
  atbRate(mon: BattleMon): number {
    const o = CONFIG.speedOffset;
    let r = (this.effectiveSpeed(mon) + o) / (100 + o) / CONFIG.turnTime;
    if (mon.vol.charging) r *= CONFIG.chargeRateMult;
    return r;
  }

  canEvolve(mon: BattleMon): boolean {
    if (mon.fainted) return false;
    const line = getLine(mon.lineId);
    return mon.stage < line.stages.length - 1 && mon.evo >= CONFIG.evo.max;
  }

  hasNextStage(mon: BattleMon): boolean {
    return mon.stage < getLine(mon.lineId).stages.length - 1;
  }

  /** Alive, non-active team members that can be switched in. */
  switchTargets(side: Side): number[] {
    const s = this.sides[side];
    return s.team.map((m, i) => (i !== s.active && !m.fainted ? i : -1)).filter((i) => i >= 0);
  }

  needsReplacement(side: Side): boolean {
    return this.winner === null && this.active(side).fainted && this.switchTargets(side).length > 0;
  }

  /** Charging / rampage moves that the Pokemon must use when its gauge fills. */
  forcedAction(side: Side): Action | null {
    const m = this.active(side);
    const move = m.vol.charging ?? m.vol.locked?.move;
    if (!move) return null;
    const slot = m.moves.findIndex((s) => s.key === move);
    return { type: 'move', slot: Math.max(0, slot) };
  }

  isReady(side: Side): boolean {
    const m = this.active(side);
    return !m.fainted && m.atb >= 1 && this.winner === null;
  }

  // ---------------------------------------------------------------- time

  /**
   * Advance the ATB clock. Returns sides whose gauge became full during this tick.
   * The caller pauses ticking while an action is being presented.
   */
  tick(dt: number): Side[] {
    if (this.winner !== null) return [];
    this.time += dt;
    const ready: Side[] = [];
    for (const side of [0, 1] as Side[]) {
      const st = this.sides[side];
      st.reflect = Math.max(0, st.reflect - dt);
      st.lightScreen = Math.max(0, st.lightScreen - dt);
      const m = this.active(side);
      if (m.fainted) continue;
      m.vol.protect = Math.max(0, m.vol.protect - dt);
      if (m.atb < 1) {
        m.atb = Math.min(1, m.atb + this.atbRate(m) * dt);
        if (this.hasNextStage(m)) m.evo = Math.min(CONFIG.evo.max, m.evo + CONFIG.evo.passivePerSec * dt * this.evoMult(m));
      }
      if (m.atb >= 1 && !this.readySignaled[side]) {
        this.readySignaled[side] = true;
        ready.push(side);
      }
    }
    return ready;
  }

  // ---------------------------------------------------------------- actions

  act(side: Side, action: Action, timing: Timing = { atk: 'none', brace: 'none' }): BattleEvent[] {
    const ev: BattleEvent[] = [];
    if (this.winner !== null) return ev;
    const mon = this.active(side);
    this.readySignaled[side] = false;
    mon.atb = 0;

    if (action.type === 'switch') {
      this.doSwitch(side, action.index, ev, CONFIG.switchInAtb);
    } else if (action.type === 'evolve') {
      this.doEvolve(side, ev);
    } else {
      this.doMoveAction(side, action.slot, timing, ev);
      if (!mon.fainted) this.residual(side, ev);
    }
    this.checkFaints(ev);
    return ev;
  }

  /** Replace a fainted active Pokemon. */
  replace(side: Side, index: number): BattleEvent[] {
    const ev: BattleEvent[] = [];
    this.readySignaled[side] = false;
    this.doSwitch(side, index, ev, CONFIG.replaceAtb);
    const m = this.active(side);
    if (this.hasNextStage(m)) this.gainEvo(m, CONFIG.evo.faintRally, ev, side, true);
    return ev;
  }

  private doSwitch(side: Side, index: number, ev: BattleEvent[], atb: number) {
    const st = this.sides[side];
    const out = this.active(side);
    if (!out.fainted) {
      ev.push({ t: 'switchOut', side, index: st.active });
      out.boosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 };
      out.vol = freshVolatile();
      if (out.status === 'tox') out.statusCounter = 0;
    }
    st.active = index;
    const inc = this.active(side);
    inc.atb = atb;
    inc.vol = freshVolatile();
    ev.push({ t: 'switchIn', side, index });
    if (inc.ability === 'INTIMIDATE') {
      const foe = this.active(other(side));
      if (!foe.fainted) {
        ev.push({ t: 'ability', side, ability: 'INTIMIDATE', text: `${inc.name}'s Intimidate cuts ${foe.name}'s Attack!` });
        this.applyBoost(other(side), 'atk', -1, ev);
      }
    }
  }

  private doEvolve(side: Side, ev: BattleEvent[]) {
    const mon = this.active(side);
    if (!this.canEvolve(mon)) {
      ev.push({ t: 'msg', text: 'But nothing happened!' });
      return;
    }
    const line = getLine(mon.lineId);
    const from = mon.speciesKey;
    const stage = line.stages[mon.stage + 1];
    const sp = SPECIES[stage.species];
    const ratio = mon.hp / mon.stats.hp;
    mon.stage += 1;
    mon.speciesKey = stage.species;
    mon.name = sp.name;
    mon.types = sp.types as PokeType[];
    mon.ability = sp.abilities[0] ?? 'NONE';
    mon.stats = calcStats(sp.base, mon.level);
    const heal = Math.floor(mon.stats.hp * CONFIG.evo.evolveHealPct);
    const before = Math.round(mon.stats.hp * ratio);
    mon.hp = Math.min(mon.stats.hp, Math.max(1, before) + heal);
    const oldPp = new Map(mon.moves.map((m) => [m.key, m.pp / m.maxPp]));
    mon.moves = stage.moves.map((key) => {
      const maxPp = MOVES[key].pp;
      const r = oldPp.get(key);
      return { key, maxPp, pp: r === undefined ? maxPp : Math.max(1, Math.round(maxPp * r)) };
    });
    for (const k of Object.keys(mon.boosts) as BoostStat[]) mon.boosts[k] = Math.max(0, mon.boosts[k]);
    const cured = mon.status;
    mon.status = 'none';
    mon.statusCounter = 0;
    mon.vol.confusion = 0;
    mon.vol.locked = null;
    mon.evo = 0;
    mon.atb = CONFIG.evolveAtb;
    ev.push({ t: 'evolve', side, from, to: stage.species, newMoves: stage.moves });
    ev.push({ t: 'heal', side, amount: mon.hp - before, hpAfter: mon.hp, cause: 'evolve' });
    if (cured !== 'none') ev.push({ t: 'cure', side, status: cured });
    ev.push({ t: 'evoGain', side, evo: 0 });
  }

  // ---------------------------------------------------------------- moves

  private doMoveAction(side: Side, slot: number, timing: Timing, ev: BattleEvent[]) {
    const user = this.active(side);
    const foeSide = other(side);

    // --- can the Pokemon act at all?
    if (user.status === 'slp') {
      if (user.statusCounter > 0) {
        user.statusCounter--;
        user.vol.charging = null;
        user.vol.locked = null;
        ev.push({ t: 'blocked', side, reason: 'slp' });
        return;
      }
      user.status = 'none';
      ev.push({ t: 'wake', side });
    }
    if (user.status === 'frz') {
      if (this.rng.chance(0.2)) {
        user.status = 'none';
        ev.push({ t: 'thaw', side });
      } else {
        ev.push({ t: 'blocked', side, reason: 'frz' });
        return;
      }
    }
    if (user.vol.confusion > 0) {
      user.vol.confusion--;
      if (user.vol.confusion === 0) {
        ev.push({ t: 'cure', side, status: 'confusion' });
      } else {
        ev.push({ t: 'confusedCheck', side });
        if (this.rng.chance(0.5)) {
          const dmg = this.confusionDamage(user);
          this.applyDamage(user, dmg);
          ev.push({ t: 'damage', side, amount: dmg, hpAfter: user.hp, cause: 'confusion' });
          user.vol.locked = null;
          user.vol.charging = null;
          return;
        }
      }
    }
    if (user.status === 'par' && this.rng.chance(0.25)) {
      user.vol.charging = null;
      user.vol.locked = null;
      ev.push({ t: 'blocked', side, reason: 'par' });
      return;
    }

    // --- pick the move
    let moveKey: string;
    const charging = user.vol.charging;
    const locked = user.vol.locked;
    if (charging) {
      moveKey = charging;
    } else if (locked) {
      moveKey = locked.move;
    } else {
      const ms = user.moves[slot];
      if (!ms || user.moves.every((m) => m.pp <= 0)) {
        moveKey = 'STRUGGLE';
      } else if (ms.pp <= 0) {
        ev.push({ t: 'msg', text: 'There\'s no PP left for this move!' });
        moveKey = 'STRUGGLE';
      } else {
        ms.pp--;
        moveKey = ms.key;
      }
    }
    const move = MOVES[moveKey];
    user.vol.lastMove = moveKey;

    // --- two-turn moves: first action charges
    if (TWO_TURN.has(move.effect) && !charging) {
      user.vol.charging = moveKey;
      if (move.effect === 'SEMI_INVULNERABLE') user.vol.semiInvulnerable = true;
      ev.push({ t: 'moveUse', side, move: moveKey, outcome: 'charging', hits: [], target: foeSide });
      if (move.effect === 'SKULL_BASH') this.applyBoost(side, 'def', 1, ev);
      return;
    }
    user.vol.charging = null;
    user.vol.semiInvulnerable = false;

    if (move.category === 'status') this.useStatusMove(side, move, timing, ev);
    else this.useDamagingMove(side, move, timing, ev);

    // rampage bookkeeping
    if (move.effect === 'RAMPAGE') {
      if (!user.vol.locked) user.vol.locked = { move: moveKey, left: this.rng.int(1, 2) };
      else if (--user.vol.locked.left <= 0) {
        user.vol.locked = null;
        if (!user.fainted && user.vol.confusion === 0) {
          user.vol.confusion = this.rng.int(...CONFIG.confusionActions);
          ev.push({ t: 'confused', side });
        }
      }
    }
    // gauge after acting
    if (move.effect === 'RECHARGE' && !user.fainted) user.atb = CONFIG.rechargeAtb;
    else user.atb = Math.max(0, move.priority) * CONFIG.priorityAtb;
  }

  private moveTargetsFoe(move: MoveData): boolean {
    return !(move.target === 'USER' || move.target === 'DEPENDS');
  }

  private accuracyCheck(user: BattleMon, target: BattleMon, move: MoveData, timing: Timing): boolean {
    if (move.accuracy === 0 || move.effect === 'ALWAYS_HIT' || move.effect === 'VITAL_THROW') return true;
    if (target.vol.semiInvulnerable) return false;
    let acc = (move.accuracy / 100) * accuracyMultiplier(user.boosts.acc - target.boosts.eva);
    if (timing.atk === 'perfect') acc *= CONFIG.perfectAccuracy;
    return this.rng.next() < acc;
  }

  private useStatusMove(side: Side, move: MoveData, timing: Timing, ev: BattleEvent[]) {
    const foeSide = other(side);
    const user = this.active(side);
    const foe = this.active(foeSide);
    const targetsFoe = this.moveTargetsFoe(move);
    const use = (outcome: 'status' | 'miss' | 'failed' | 'protected') =>
      ev.push({ t: 'moveUse', side, move: move.key, outcome, hits: [], target: targetsFoe ? foeSide : side });

    if (targetsFoe) {
      if (foe.fainted) return use('failed');
      if (foe.vol.protect > 0 && move.flags.includes('PROTECT_AFFECTED')) {
        foe.vol.protect = 0;
        return use('protected');
      }
      if (!this.accuracyCheck(user, foe, move, timing)) return use('miss');
    }
    use('status');
    const before = ev.length;
    const ok = this.applyMoveEffect(side, move, ev, true);
    if (!ok && ev.length === before) ev.push({ t: 'msg', text: 'But it failed!' });
    // small evo reward for setting up
    if (this.hasNextStage(user)) this.gainEvo(user, timing.atk === 'perfect' ? CONFIG.evo.perfect : 2, ev, side);
  }

  private useDamagingMove(side: Side, move: MoveData, timing: Timing, ev: BattleEvent[]) {
    const foeSide = other(side);
    const user = this.active(side);
    const foe = this.active(foeSide);
    const moveEv: Extract<BattleEvent, { t: 'moveUse' }> = {
      t: 'moveUse',
      side,
      move: move.key,
      outcome: 'hit',
      hits: [],
      target: foeSide,
    };
    ev.push(moveEv);
    if (foe.fainted) {
      moveEv.outcome = 'failed';
      return;
    }
    if (foe.vol.protect > 0 && move.flags.includes('PROTECT_AFFECTED')) {
      foe.vol.protect = 0;
      moveEv.outcome = 'protected';
      return;
    }
    if (move.effect === 'EXPLOSION') {
      // the user faints no matter what happens next
      user.hp = 0;
      user.fainted = true;
    }
    if (!this.accuracyCheck(user, foe, move, timing)) {
      moveEv.outcome = 'miss';
      if (move.effect === 'RECOIL_IF_MISS') {
        const crash = Math.max(1, Math.floor(user.stats.hp / 2));
        this.applyDamage(user, crash);
        ev.push({ t: 'damage', side, amount: crash, hpAfter: user.hp, cause: 'crash' });
      }
      return;
    }
    const moveType = move.type as PokeType;
    let eff = typeMultiplier(moveType, foe.types);
    // ability-based immunities
    if (moveType === 'GROUND' && foe.ability === 'LEVITATE') eff = 0;
    if (moveType === 'FIRE' && foe.ability === 'FLASH_FIRE') {
      moveEv.outcome = 'noEffect';
      if (!foe.vol.flashFire) {
        foe.vol.flashFire = true;
        ev.push({ t: 'ability', side: foeSide, ability: 'FLASH_FIRE', text: `${foe.name}'s Flash Fire raised its fire power!` });
      }
      return;
    }
    if (eff === 0) {
      moveEv.outcome = 'noEffect';
      return;
    }

    // number of hits
    let hits = 1;
    if (move.effect === 'MULTI_HIT') hits = this.rng.pick([2, 2, 2, 3, 3, 3, 4, 5]);
    else if (move.effect === 'DOUBLE_HIT' || move.effect === 'TWINEEDLE') hits = 2;
    else if (move.effect === 'TRIPLE_KICK') hits = 3;

    let total = 0;
    for (let i = 0; i < hits && !foe.fainted; i++) {
      const powerOverride = move.effect === 'TRIPLE_KICK' ? move.power * (i + 1) : undefined;
      const r = this.calcDamage(user, foe, move, timing, foeSide, powerOverride);
      this.applyDamage(foe, r.damage);
      if (move.effect === 'FALSE_SWIPE' && foe.hp <= 0) {
        foe.hp = 1;
        foe.fainted = false;
      }
      total += r.damage;
      moveEv.hits.push({ ...r, hpAfter: foe.hp });
    }
    user.dealt += total;
    if (timing.atk === 'perfect') user.perfects++;

    // contact abilities
    if (move.flags.includes('MAKES_CONTACT') && foe.ability === 'STATIC' && user.status === 'none' && this.rng.chance(0.3)) {
      if (!user.types.includes('ELECTRIC')) {
        ev.push({ t: 'ability', side: foeSide, ability: 'STATIC', text: `${foe.name}'s Static paralyzed ${user.name}!` });
        this.setStatus(side, 'par', ev);
      }
    }

    // drain / recoil
    if ((move.effect === 'ABSORB' || move.effect === 'DREAM_EATER') && total > 0 && !user.fainted) {
      const h = this.heal(user, Math.max(1, Math.floor(total / 2)));
      if (h > 0) ev.push({ t: 'heal', side, amount: h, hpAfter: user.hp, cause: 'drain' });
    }
    if ((move.effect === 'RECOIL' || move.effect === 'DOUBLE_EDGE' || move.key === 'STRUGGLE') && user.ability !== 'ROCK_HEAD') {
      const rec = Math.max(1, Math.floor(total / (move.effect === 'DOUBLE_EDGE' ? 3 : 4)));
      this.applyDamage(user, rec);
      ev.push({ t: 'damage', side, amount: rec, hpAfter: user.hp, cause: 'recoil' });
    }

    // secondary effects
    this.applyMoveEffect(side, move, ev, false);

    // flinch pushes the target's gauge back
    const flinchChance = ['FLINCH_HIT', 'FLINCH_MINIMIZE_HIT', 'SKY_ATTACK', 'TWISTER'].includes(move.effect) ? move.effectChance : 0;
    if (flinchChance > 0 && !foe.fainted && foe.ability !== 'INNER_FOCUS' && this.rng.chance(flinchChance / 100)) {
      foe.atb = Math.max(0, foe.atb - CONFIG.flinchAtb);
      ev.push({ t: 'flinch', side: foeSide, atbAfter: foe.atb });
    }

    // evolution energy
    const firstEff = moveEv.hits[0]?.eff ?? 1;
    const pctDealt = (total / foe.stats.hp) * 100;
    let userGain = pctDealt * CONFIG.evo.perDealtPct;
    if (timing.atk === 'perfect') userGain += CONFIG.evo.perfect;
    else if (timing.atk === 'good') userGain += CONFIG.evo.good;
    if (firstEff > 1) userGain += CONFIG.evo.superEffective;
    if (this.hasNextStage(user) && !user.fainted) this.gainEvo(user, userGain, ev, side);
    if (this.hasNextStage(foe) && !foe.fainted) {
      let foeGain = pctDealt * CONFIG.evo.perTakenPct;
      if (timing.brace === 'perfect') foeGain += CONFIG.evo.bracePerfect;
      this.gainEvo(foe, foeGain, ev, foeSide);
    }
  }

  /** Returns true if the (primary) effect did something. `primary` = status move (100%) vs damaging move secondary. */
  private applyMoveEffect(side: Side, move: MoveData, ev: BattleEvent[], primary: boolean): boolean {
    const foeSide = other(side);
    const user = this.active(side);
    const foe = this.active(foeSide);
    const e = move.effect;
    const chance = primary ? 100 : move.effectChance || 0;
    const roll = () => chance >= 100 || this.rng.chance(chance / 100);
    const foeAlive = !foe.fainted;

    // generic stat changes
    const m = STAT_EFFECT.exec(e);
    if (m) {
      const stat = STAT_KEY[m[1]];
      const up = m[2] === 'UP';
      const amt = m[3] ? 2 : 1;
      const isHit = !!m[4];
      if (isHit && !roll()) return false;
      if (up) return this.applyBoost(side, stat, amt, ev);
      if (!foeAlive) return false;
      return this.applyBoost(foeSide, stat, -amt, ev);
    }

    switch (e) {
      // ---- status infliction
      case 'BURN_HIT':
      case 'BLAZE_KICK':
        return foeAlive && roll() && this.setStatus(foeSide, 'brn', ev, !primary);
      case 'FREEZE_HIT':
        return foeAlive && roll() && this.setStatus(foeSide, 'frz', ev, !primary);
      case 'PARALYZE_HIT':
      case 'THUNDER':
        return foeAlive && roll() && this.setStatus(foeSide, 'par', ev, !primary);
      case 'POISON_HIT':
      case 'TWINEEDLE':
      case 'POISON_TAIL':
        return foeAlive && roll() && this.setStatus(foeSide, 'psn', ev, !primary);
      case 'POISON_FANG':
        return foeAlive && roll() && this.setStatus(foeSide, 'tox', ev, !primary);
      case 'TRI_ATTACK':
        return foeAlive && roll() && this.setStatus(foeSide, this.rng.pick(['brn', 'par', 'frz'] as StatusCond[]), ev, !primary);
      case 'SECRET_POWER':
        return foeAlive && roll() && this.setStatus(foeSide, 'par', ev, !primary);
      case 'CONFUSE_HIT':
        return foeAlive && roll() && this.confuse(foeSide, ev);
      case 'SLEEP':
        return this.setStatus(foeSide, 'slp', ev);
      case 'POISON':
        return this.setStatus(foeSide, 'psn', ev);
      case 'TOXIC':
        return this.setStatus(foeSide, 'tox', ev);
      case 'PARALYZE':
        if (move.type === 'ELECTRIC' && typeMultiplier('ELECTRIC', foe.types) === 0) {
          ev.push({ t: 'msg', text: `It doesn't affect ${foe.name}...` });
          return false;
        }
        return this.setStatus(foeSide, 'par', ev);
      case 'WILL_O_WISP':
        return this.setStatus(foeSide, 'brn', ev);
      case 'CONFUSE':
        return this.confuse(foeSide, ev);
      case 'SWAGGER':
        this.applyBoost(foeSide, 'atk', 2, ev);
        return this.confuse(foeSide, ev);
      case 'FLATTER':
        this.applyBoost(foeSide, 'spa', 1, ev);
        return this.confuse(foeSide, ev);
      case 'LEECH_SEED':
        if (foe.types.includes('GRASS') || foe.vol.leechSeed) {
          ev.push({ t: 'msg', text: `It doesn't affect ${foe.name}...` });
          return false;
        }
        foe.vol.leechSeed = true;
        ev.push({ t: 'seeded', side: foeSide });
        return true;

      // ---- self buffs
      case 'CALM_MIND':
        return this.multiBoost(side, { spa: 1, spd: 1 }, ev);
      case 'BULK_UP':
        return this.multiBoost(side, { atk: 1, def: 1 }, ev);
      case 'DRAGON_DANCE':
        return this.multiBoost(side, { atk: 1, spe: 1 }, ev);
      case 'COSMIC_POWER':
        return this.multiBoost(side, { def: 1, spd: 1 }, ev);
      case 'DEFENSE_CURL':
        return this.applyBoost(side, 'def', 1, ev);
      case 'TICKLE':
        return this.multiBoost(foeSide, { atk: -1, def: -1 }, ev);
      case 'ALL_STATS_UP_HIT':
        return roll() && this.multiBoost(side, { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }, ev);
      case 'FOCUS_ENERGY':
        if (user.vol.focusEnergy) return false;
        user.vol.focusEnergy = true;
        ev.push({ t: 'msg', text: `${user.name} is getting pumped!` });
        return true;
      case 'SUPERPOWER':
        return this.multiBoost(side, { atk: -1, def: -1 }, ev);
      case 'OVERHEAT':
        return this.applyBoost(side, 'spa', -2, ev);
      case 'HAZE':
        for (const s of [0, 1] as Side[]) {
          const mm = this.active(s);
          for (const k of Object.keys(mm.boosts) as BoostStat[]) mm.boosts[k] = 0;
        }
        ev.push({ t: 'msg', text: 'All stat changes were eliminated!' });
        return true;

      // ---- healing
      case 'RESTORE_HP':
      case 'SOFTBOILED':
      case 'SYNTHESIS':
      case 'MORNING_SUN':
      case 'MOONLIGHT': {
        const h = this.heal(user, Math.floor(user.stats.hp / 2));
        if (h <= 0) return false;
        ev.push({ t: 'heal', side, amount: h, hpAfter: user.hp, cause: 'move' });
        return true;
      }
      case 'REST': {
        if (user.hp >= user.stats.hp) return false;
        const h = this.heal(user, user.stats.hp);
        user.status = 'slp';
        user.statusCounter = 2;
        ev.push({ t: 'status', side, status: 'slp' });
        ev.push({ t: 'heal', side, amount: h, hpAfter: user.hp, cause: 'move' });
        return true;
      }

      // ---- defensive
      case 'PROTECT': {
        const p = 1 / 2 ** user.vol.protectChain;
        if (!this.rng.chance(p)) {
          user.vol.protectChain = 0;
          return false;
        }
        user.vol.protectChain++;
        user.vol.protect = CONFIG.protectSeconds;
        ev.push({ t: 'msg', text: `${user.name} protected itself!` });
        return true;
      }
      case 'REFLECT':
      case 'LIGHT_SCREEN': {
        const key = e === 'REFLECT' ? 'reflect' : 'lightScreen';
        const st = this.sides[side];
        if (st[key] > 0) return false;
        st[key] = CONFIG.screenSeconds;
        ev.push({ t: 'screen', side, screen: key, on: true });
        return true;
      }

      // ---- damaging-move side effects
      case 'RAPID_SPIN':
        if (user.vol.leechSeed) {
          user.vol.leechSeed = false;
          ev.push({ t: 'msg', text: `${user.name} blew away Leech Seed!` });
        }
        return true;
      case 'BRICK_BREAK': {
        const st = this.sides[foeSide];
        let any = false;
        for (const key of ['reflect', 'lightScreen'] as const) {
          if (st[key] > 0) {
            st[key] = 0;
            any = true;
            ev.push({ t: 'screen', side: foeSide, screen: key, on: false });
          }
        }
        return any;
      }
      case 'THAW_HIT':
        return foeAlive && roll() && this.setStatus(foeSide, 'brn', ev, true);
      case 'SKY_UPPERCUT':
      case 'FAKE_OUT':
      default:
        return false;
    }
  }

  private calcDamage(user: BattleMon, foe: BattleMon, move: MoveData, timing: Timing, foeSide: Side, powerOverride?: number): Omit<HitResult, 'hpAfter'> {
    const moveType = move.type as PokeType;
    const eff = typeMultiplier(moveType, foe.types) * (moveType === 'GROUND' && foe.ability === 'LEVITATE' ? 0 : 1);
    const base = { eff, timing: timing.atk, brace: timing.brace };

    // fixed-damage moves
    const fixed = (d: number) => ({ ...base, damage: Math.max(1, Math.min(foe.hp, Math.floor(d))), crit: false });
    switch (move.effect) {
      case 'DRAGON_RAGE':
        return fixed(40);
      case 'SONICBOOM':
        return fixed(20);
      case 'LEVEL_DAMAGE':
        return fixed(user.level);
      case 'SUPER_FANG':
        return fixed(foe.hp / 2);
      case 'PSYWAVE':
        return fixed((user.level * this.rng.int(5, 15)) / 10);
    }

    let power = powerOverride ?? move.power;
    switch (move.effect) {
      case 'RETURN':
      case 'FRUSTRATION':
        power = 102;
        break;
      case 'FACADE':
        if (user.status !== 'none') power *= 2;
        break;
      case 'FLAIL': {
        const p = Math.floor((48 * user.hp) / user.stats.hp);
        power = p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20;
        break;
      }
      case 'ERUPTION':
        power = Math.max(1, Math.floor((150 * user.hp) / user.stats.hp));
        break;
      case 'LOW_KICK': {
        const w = SPECIES[foe.speciesKey].weightHg;
        power = w < 100 ? 20 : w < 250 ? 40 : w < 500 ? 60 : w < 1000 ? 80 : w < 2000 ? 100 : 120;
        break;
      }
    }
    const pinch = PINCH_ABILITY[user.ability];
    if (pinch === moveType && user.hp <= user.stats.hp / 3) power = Math.floor(power * 1.5);

    let critStage = (move.effect === 'HIGH_CRITICAL' || move.effect === 'BLAZE_KICK' || move.effect === 'POISON_TAIL' || move.effect === 'SKY_ATTACK' ? 1 : 0) + (user.vol.focusEnergy ? 2 : 0);
    if (timing.atk === 'perfect') critStage += 1;
    const crit = this.rng.chance(critChance(critStage));

    const physical = move.category === 'physical' || move.key === 'STRUGGLE';
    const aKey = physical ? 'atk' : 'spa';
    const dKey = physical ? 'def' : 'spd';
    let aStage = user.boosts[aKey];
    let dStage = foe.boosts[dKey];
    if (crit) {
      aStage = Math.max(0, aStage);
      dStage = Math.min(0, dStage);
    }
    let A = user.stats[aKey] * stageMultiplier(aStage);
    let D = foe.stats[dKey] * stageMultiplier(dStage);
    if (move.effect === 'EXPLOSION') D = Math.max(1, Math.floor(D / 2)); // Gen 3 halves the target's Defense
    if (physical && user.ability === 'GUTS' && user.status !== 'none') A *= 1.5;
    if (physical && user.ability === 'HUGE_POWER') A *= 2;
    if (foe.ability === 'THICK_FAT' && (moveType === 'FIRE' || moveType === 'ICE')) A /= 2;

    let dmg = Math.floor(Math.floor((Math.floor((2 * user.level) / 5 + 2) * power * A) / D) / 50);
    if (physical && user.status === 'brn' && user.ability !== 'GUTS') dmg = Math.floor(dmg / 2);
    const st = this.sides[foeSide];
    if (!crit && ((physical && st.reflect > 0) || (!physical && st.lightScreen > 0))) dmg = Math.floor(dmg / 2);
    dmg += 2;
    if (crit) dmg = Math.floor(dmg * CONFIG.critMultiplier);
    if (moveType === 'FIRE' && user.vol.flashFire) dmg = Math.floor(dmg * 1.5);
    if (user.types.includes(moveType)) dmg = Math.floor(dmg * 1.5);
    dmg = Math.floor(dmg * eff);
    dmg = Math.floor((dmg * this.rng.int(85, 100)) / 100);
    dmg = Math.floor(dmg * CONFIG.timingAttack[timing.atk] * CONFIG.timingBrace[timing.brace]);
    return { ...base, damage: Math.max(1, dmg), crit };
  }

  private confusionDamage(mon: BattleMon): number {
    const A = mon.stats.atk * stageMultiplier(mon.boosts.atk);
    const D = mon.stats.def * stageMultiplier(mon.boosts.def);
    return Math.max(1, Math.floor(Math.floor((Math.floor((2 * mon.level) / 5 + 2) * 40 * A) / D) / 50) + 2);
  }

  /** Expected damage of a move (no randomness, no crit) — used by AI and the UI hints. */
  estimateDamage(side: Side, moveKey: string): { min: number; max: number; eff: number } {
    const user = this.active(side);
    const foeSide = other(side);
    const foe = this.active(foeSide);
    const move = MOVES[moveKey];
    if (move.category === 'status') return { min: 0, max: 0, eff: 1 };
    const saved = this.rng;
    // deterministic probe: max roll, no crit
    const probe = { next: () => 0.999, int: (_a: number, b: number) => b, chance: () => false, pick: <T,>(a: readonly T[]) => a[0], shuffle: <T,>(a: T[]) => a } as unknown as Rng;
    this.rng = probe;
    const r = this.calcDamage(user, foe, move, { atk: 'none', brace: 'none' }, foeSide);
    this.rng = saved;
    const hitsMult = move.effect === 'MULTI_HIT' ? 3 : move.effect === 'DOUBLE_HIT' || move.effect === 'TWINEEDLE' ? 2 : move.effect === 'TRIPLE_KICK' ? 6 : 1;
    let eff = r.eff;
    if ((move.type === 'FIRE' && foe.ability === 'FLASH_FIRE') || (move.type === 'GROUND' && foe.ability === 'LEVITATE')) eff = 0;
    if (eff === 0) return { min: 0, max: 0, eff: 0 };
    const max = r.damage * hitsMult;
    return { min: Math.floor(max * 0.85), max, eff };
  }

  // ---------------------------------------------------------------- helpers

  private applyDamage(mon: BattleMon, dmg: number) {
    mon.hp = Math.max(0, mon.hp - dmg);
    if (mon.hp === 0) mon.fainted = true;
  }

  private heal(mon: BattleMon, amount: number): number {
    const before = mon.hp;
    mon.hp = Math.min(mon.stats.hp, mon.hp + amount);
    return mon.hp - before;
  }

  private evoMult(mon: BattleMon): number {
    return mon.stage >= 1 ? CONFIG.evo.secondStageMult : 1;
  }

  private gainEvo(mon: BattleMon, amount: number, ev: BattleEvent[], side: Side, flat = false) {
    if (!this.hasNextStage(mon) || amount <= 0) return;
    mon.evo = Math.min(CONFIG.evo.max, mon.evo + amount * (flat ? 1 : this.evoMult(mon)));
    ev.push({ t: 'evoGain', side, evo: mon.evo });
  }

  private setStatus(side: Side, status: StatusCond, ev: BattleEvent[], silent = false): boolean {
    const mon = this.active(side);
    const fail = (why: string) => {
      if (!silent) ev.push({ t: 'msg', text: why });
      return false;
    };
    if (mon.fainted) return false;
    if (mon.status !== 'none') return fail(`${mon.name} is already ${statusName(mon.status)}!`);
    if ((status === 'psn' || status === 'tox') && (mon.types.includes('POISON') || mon.types.includes('STEEL')))
      return fail(`It doesn't affect ${mon.name}...`);
    if (status === 'brn' && mon.types.includes('FIRE')) return fail(`It doesn't affect ${mon.name}...`);
    if (status === 'frz' && mon.types.includes('ICE')) return false;
    if (status === 'slp' && (mon.ability === 'INSOMNIA' || mon.ability === 'VITAL_SPIRIT')) return fail(`${mon.name} stays awake!`);
    if (status === 'par' && mon.ability === 'LIMBER') return fail(`${mon.name} can't be paralyzed!`);
    if (mon.vol.protect > 0 && !silent) return fail(`${mon.name} protected itself!`);
    mon.status = status;
    mon.statusCounter = 0;
    if (status === 'slp') {
      let n = this.rng.int(...CONFIG.sleepActions);
      if (mon.ability === 'EARLY_BIRD') n = Math.ceil(n / 2);
      mon.statusCounter = n;
      mon.vol.locked = null;
      mon.vol.charging = null;
    }
    ev.push({ t: 'status', side, status });
    // Synchronize passes brn/par/psn back
    const foe = this.active(other(side));
    if (mon.ability === 'SYNCHRONIZE' && (status === 'brn' || status === 'par' || status === 'psn' || status === 'tox') && foe.status === 'none' && !foe.fainted) {
      ev.push({ t: 'ability', side, ability: 'SYNCHRONIZE', text: `${mon.name}'s Synchronize!` });
      this.setStatus(other(side), status === 'tox' ? 'psn' : status, ev, true);
    }
    return true;
  }

  private confuse(side: Side, ev: BattleEvent[]): boolean {
    const mon = this.active(side);
    if (mon.fainted || mon.vol.confusion > 0 || mon.ability === 'OWN_TEMPO') return false;
    mon.vol.confusion = this.rng.int(...CONFIG.confusionActions);
    ev.push({ t: 'confused', side });
    return true;
  }

  private applyBoost(side: Side, stat: BoostStat, delta: number, ev: BattleEvent[]): boolean {
    const mon = this.active(side);
    if (mon.fainted) return false;
    if (delta < 0 && (mon.ability === 'CLEAR_BODY' || mon.ability === 'WHITE_SMOKE')) {
      ev.push({ t: 'ability', side, ability: mon.ability, text: `${mon.name}'s ${prettyAbility(mon.ability)} prevents stat loss!` });
      return false;
    }
    if (delta < 0 && stat === 'acc' && mon.ability === 'KEEN_EYE') return false;
    if (delta < 0 && stat === 'atk' && mon.ability === 'HYPER_CUTTER') return false;
    const before = mon.boosts[stat];
    const after = Math.max(-6, Math.min(6, before + delta));
    mon.boosts[stat] = after;
    ev.push({ t: 'boost', side, stat, delta: after - before, capped: after === before });
    return after !== before;
  }

  private multiBoost(side: Side, changes: Partial<Record<BoostStat, number>>, ev: BattleEvent[]): boolean {
    let any = false;
    for (const [k, v] of Object.entries(changes)) any = this.applyBoost(side, k as BoostStat, v!, ev) || any;
    return any;
  }

  /** End-of-action damage for the acting Pokemon (Gen 3 does these at end of turn). */
  private residual(side: Side, ev: BattleEvent[]) {
    const mon = this.active(side);
    const foeSide = other(side);
    if (mon.fainted) return;
    if (mon.status === 'brn' || mon.status === 'psn') {
      const d = Math.max(1, Math.floor(mon.stats.hp / 8));
      this.applyDamage(mon, d);
      ev.push({ t: 'damage', side, amount: d, hpAfter: mon.hp, cause: mon.status });
    } else if (mon.status === 'tox') {
      mon.statusCounter = Math.min(15, mon.statusCounter + 1);
      const d = Math.max(1, Math.floor((mon.stats.hp * mon.statusCounter) / 16));
      this.applyDamage(mon, d);
      ev.push({ t: 'damage', side, amount: d, hpAfter: mon.hp, cause: 'psn' });
    }
    if (!mon.fainted && mon.vol.leechSeed) {
      const d = Math.max(1, Math.floor(mon.stats.hp / 8));
      this.applyDamage(mon, d);
      ev.push({ t: 'damage', side, amount: d, hpAfter: mon.hp, cause: 'leech' });
      const foe = this.active(foeSide);
      if (!foe.fainted) {
        const h = this.heal(foe, d);
        if (h > 0) ev.push({ t: 'heal', side: foeSide, amount: h, hpAfter: foe.hp, cause: 'leech' });
      }
    }
    if (!mon.fainted && mon.ability === 'SHED_SKIN' && mon.status !== 'none' && this.rng.chance(0.3)) {
      const s = mon.status;
      mon.status = 'none';
      ev.push({ t: 'ability', side, ability: 'SHED_SKIN', text: `${mon.name} shed its skin!` });
      ev.push({ t: 'cure', side, status: s });
    }
  }

  private checkFaints(ev: BattleEvent[]) {
    for (const side of [0, 1] as Side[]) {
      const m = this.active(side);
      if (m.fainted && !ev.some((e) => e.t === 'faint' && e.side === side)) {
        m.atb = 0;
        m.vol = freshVolatile();
        ev.push({ t: 'faint', side });
      }
    }
    for (const side of [0, 1] as Side[]) {
      if (this.sides[side].team.every((m) => m.fainted)) {
        this.winner = other(side);
        ev.push({ t: 'end', winner: other(side) });
        return;
      }
    }
  }
}

export function statusName(s: StatusCond): string {
  return { none: 'healthy', brn: 'burned', par: 'paralyzed', psn: 'poisoned', tox: 'badly poisoned', slp: 'asleep', frz: 'frozen' }[s];
}

export function prettyAbility(a: string): string {
  return a
    .split('_')
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(' ');
}

export { STAT_LABEL };
