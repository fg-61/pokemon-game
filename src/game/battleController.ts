import { AI_PROFILES, chooseAction, chooseReplacement, rollTiming } from '../battle/ai';
import { Battle } from '../battle/engine';
import { Rng } from '../battle/rng';
import { STAT_LABEL } from '../battle/stats';
import { other, type Action, type BattleEvent, type Side, type TimingGrade } from '../battle/types';
import { audio } from '../audio/audio';
import { MOVES, SPECIES } from '../data/gamedata';
import { getLine } from '../data/roster';
import { TYPE_COLOR } from '../data/typeColors';
import type { PokeType } from '../data/types';
import { Arena, ENEMY_POS, PLAYER_POS, THEMES } from '../render/arena';
import { ease, setBaseSpeed } from '../render/clock';
import { loadSheet, PokemonSprite } from '../render/pokemonSprite';
import { introShot, wideShot } from '../render/shots';
import type { Stage } from '../render/stage';
import { Hud, iconUrl } from '../ui/hud';
import { statName, t } from '../ui/i18n';
import { playEvolutionFx } from '../vfx/evolution';
import { playMoveFx } from '../vfx/playMove';
import { boostFx, healFx, residualFx, returnFx, sendOutFx, statusFx } from '../vfx/statusFx';
import type { Vfx } from '../vfx/vfx';
import { settings } from './settings';
import type { Trainer } from './trainers';

export interface BattleSetup {
  playerName: string;
  playerLines: string[];
  trainer: Trainer;
  round?: { i: number; n: number };
  /** AI controls the player side too (demo / automated tests) */
  autoPlayer?: boolean;
  seed?: number;
}

export interface BattleOutcome {
  won: boolean;
  quit: boolean;
  time: number;
  perfects: number;
  evolutions: number;
  damage: number;
  finalSpecies: string[];
}

const TWO_TURN_MSG: Record<string, 'solarCharge' | 'digCharge' | 'flyCharge' | 'skullCharge'> = {
  SOLAR_BEAM: 'solarCharge',
  DIG: 'digCharge',
  FLY: 'flyCharge',
  SKULL_BASH: 'skullCharge',
};

export class BattleController {
  readonly battle: Battle;
  private hud: Hud;
  private arena: Arena;
  private sprites: [PokemonSprite, PokemonSprite];
  private rng: Rng;
  private offUpdate: () => void;
  private frameWaiters: ((dt: number) => void)[] = [];
  private quit = false;
  private evolutions = 0;
  private lowHpWarned = false;
  private speed = settings.animSpeed;

  constructor(
    private stage: Stage,
    private vfx: Vfx,
    uiRoot: HTMLElement,
    private setup: BattleSetup,
  ) {
    this.rng = new Rng(setup.seed ?? (Math.random() * 2 ** 31) | 0);
    this.battle = new Battle(
      { name: setup.playerName, lines: setup.playerLines, isAI: !!setup.autoPlayer },
      { name: setup.trainer.name, lines: setup.trainer.lines, isAI: true },
      this.rng.int(0, 2 ** 31),
    );
    const theme = THEMES.find((x) => x.id === setup.trainer.theme) ?? THEMES[0];
    this.arena = new Arena(stage, theme);
    this.sprites = [new PokemonSprite(stage, 'back'), new PokemonSprite(stage, 'front')];
    this.sprites[0].group.position.copy(PLAYER_POS).setY(Arena.FLOOR);
    this.sprites[1].group.position.copy(ENEMY_POS).setY(Arena.FLOOR);
    for (const s of this.sprites) {
      s.setLight(theme.spriteLight);
      stage.scene.add(s.group);
    }
    this.hud = new Hud(uiRoot);
    setBaseSpeed(stage.clock, this.speed);
    this.offUpdate = stage.onUpdate((dt) => {
      const w = this.frameWaiters;
      this.frameWaiters = [];
      w.forEach((f) => f(dt));
      this.hud.update(dt / Math.max(0.01, stage.clock.timeScale), this.battle);
      for (const side of [0, 1] as Side[]) {
        const m = this.battle.active(side);
        const plat = side === 0 ? this.arena.playerPlatform : this.arena.enemyPlatform;
        plat.setGlow(!m.fainted && m.atb >= 1 ? 1 : 0.15);
      }
    });
    const sideLabel = setup.round ? t('round', setup.round.i, setup.round.n) : setup.trainer.name;
    const quitBtn = document.createElement('button');
    quitBtn.className = 'icon-btn interactive';
    quitBtn.textContent = '✕';
    quitBtn.title = t('quit');
    quitBtn.onclick = () => {
      if (confirm(t('quit') + '?')) this.quit = true;
    };
    this.hud.setTop(sideLabel, quitBtn);
  }

  private frame(): Promise<number> {
    return new Promise((r) => this.frameWaiters.push(r));
  }
  private wait(ms: number) {
    return this.stage.wait(ms);
  }
  private msg(text: string, hold = 600) {
    return this.hud.message(text, hold, this.speed);
  }
  private screenPos(side: Side, frac = 0.6) {
    return this.stage.toScreen(this.sprites[side].at(frac));
  }

  // ------------------------------------------------------------------ main

  async run(): Promise<BattleOutcome> {
    const b = this.battle;
    audio.playMusic(this.setup.trainer.boss ? 'boss' : 'battle');
    this.stage.director.cut(introShot());
    this.stage.director.move(wideShot(), 3.2, ease.inOutCubic);
    this.stage.director.sway = 1;
    for (const side of [0, 1] as Side[]) this.hud.cards[side].setTeam(b.sides[side].team);
    const icons = (lines: string[]) => lines.map((l) => iconUrl(getLine(l).stages[0].species));
    const vs = this.hud.vsIntro({ name: this.setup.playerName, icons: icons(this.setup.playerLines) }, { name: this.setup.trainer.name, icons: icons(this.setup.trainer.lines) });
    // preload every stage's sheet (so switches and evolutions never hitch)
    const pre: Promise<unknown>[] = [];
    b.sides.forEach((st, side) => st.team.forEach((m) => getLine(m.lineId).stages.forEach((sg) => pre.push(loadSheet(SPECIES[sg.species].dex, side === 0 ? 'back' : 'front').catch(() => null)))));
    await Promise.all([vs, ...pre]);
    await this.msg(t('wants', this.setup.trainer.name), 500);
    await this.sendOut(1, true);
    await this.sendOut(0, true);

    const queue: Side[] = [];
    let menu: ReturnType<Hud['command']> | null = null;
    let pending: Action | null = null;
    const aiProfile = AI_PROFILES[this.setup.trainer.difficulty];

    while (b.winner === null && !this.quit) {
      const dt = await this.frame();
      const realDt = dt / Math.max(0.01, this.stage.clock.timeScale);
      const rate = menu ? (settings.atbMode === 'wait' ? 0 : 0.3) : 1;
      for (const s of b.tick(realDt * rate)) queue.push(s);

      if (menu) {
        if (pending) {
          const a: Action = pending;
          pending = null;
          menu = null;
          await this.turn(0, a);
        } else if (queue.includes(1) && settings.atbMode === 'active') {
          // the foe moves while you're still choosing: close the menu, let it act, reopen
          menu.cancel();
          menu = null;
          queue.splice(queue.indexOf(1), 1);
          queue.unshift(0);
          await this.aiTurn(1, aiProfile);
        } else continue;
        await this.handleReplacements(queue);
        continue;
      }

      const side = queue.shift();
      if (side === undefined) continue;
      if (!b.isReady(side)) continue;
      if (side === 1 || this.setup.autoPlayer) {
        await this.aiTurn(side, side === 1 ? aiProfile : AI_PROFILES.hard);
      } else {
        const forced = b.forcedAction(0);
        if (forced) await this.turn(0, forced);
        else {
          audio.playSfx('ready', { volume: 0.6 });
          menu = this.hud.command(b, 0, { canSwitch: b.switchTargets(0).length > 0 });
          const m = menu;
          m.promise.then((a) => {
            if (menu === m) pending = a;
          });
          continue;
        }
      }
      await this.handleReplacements(queue);
    }
    menu?.cancel();
    return this.finish();
  }

  private async aiTurn(side: Side, profile: (typeof AI_PROFILES)['normal']) {
    await this.wait(250);
    const action = chooseAction(this.battle, side, profile, this.rng);
    await this.turn(side, action);
  }

  private async handleReplacements(queue: Side[]) {
    const b = this.battle;
    for (const side of [1, 0] as Side[]) {
      if (!b.needsReplacement(side)) continue;
      let idx: number;
      if (side === 1 || this.setup.autoPlayer) idx = chooseReplacement(b, side);
      else {
        const pick = await this.hud.openParty(b, 0, true);
        idx = pick ?? b.switchTargets(0)[0];
      }
      const qi = queue.indexOf(side);
      if (qi >= 0) queue.splice(qi, 1);
      await this.present(b.replace(side, idx));
    }
  }

  // ------------------------------------------------------------------ a single action

  private async turn(side: Side, action: Action) {
    const b = this.battle;
    const mon = b.active(side);
    const timing: { atk: TimingGrade; brace: TimingGrade } = { atk: 'none', brace: 'none' };
    if (action.type === 'move') {
      const key = mon.vol.charging ?? mon.vol.locked?.move ?? mon.moves[action.slot]?.key;
      const mv = key ? MOVES[key] : undefined;
      const willAct = mon.status !== 'frz' && !(mon.status === 'slp' && mon.statusCounter > 0);
      const charging = mv && ['SOLAR_BEAM', 'SKULL_BASH', 'SKY_ATTACK', 'RAZOR_WIND', 'SEMI_INVULNERABLE'].includes(mv.effect) && !mon.vol.charging;
      if (mv && mv.category !== 'status' && willAct && !charging) {
        // wind-up + action timing
        this.sprites[side].setOutline(1.4, TYPE_COLOR[mv.type as PokeType]);
        const human0 = !this.setup.autoPlayer;
        const foeProfile = AI_PROFILES[this.setup.trainer.difficulty];
        if (side === 0) {
          this.vfx.shot('shoulder', 0, 350);
          this.hud.moveBanner(mv.name, mv.type);
          if (human0) {
            await this.wait(380); // let the camera settle so the ring sits on the target
            const p = this.screenPos(1, 0.5);
            timing.atk = await this.hud.timing(p.x, p.y, 'attack');
          } else timing.atk = rollTiming(this.rng, AI_PROFILES.hard.atkTiming);
          timing.brace = rollTiming(this.rng, foeProfile.braceTiming);
        } else {
          // keep the wide shot so your own Pokemon (and its brace ring) stays in view
          this.stage.director.move(wideShot(), 0.35);
          this.hud.moveBanner(mv.name, mv.type);
          timing.atk = rollTiming(this.rng, foeProfile.atkTiming);
          if (human0) {
            await this.wait(380);
            const p = this.screenPos(0, 0.55);
            timing.brace = await this.hud.timing(p.x, p.y, 'brace');
          } else timing.brace = rollTiming(this.rng, AI_PROFILES.hard.braceTiming);
        }
        this.sprites[side].setOutline(0);
        if (timing.atk === 'perfect') this.sprites[side].flash(0xfff2a0, 250, 0.6);
      }
    }
    const events = b.act(side, action, timing);
    await this.present(events);
    this.stage.director.move(wideShot(), 0.6);
  }

  // ------------------------------------------------------------------ event presentation

  private async present(events: BattleEvent[]) {
    for (let i = 0; i < events.length && !this.quit; i++) {
      await this.presentOne(events[i]);
    }
    // keep HUD numbers in sync after the batch
    for (const side of [0, 1] as Side[]) {
      const m = this.battle.active(side);
      this.hud.cards[side].setTeam(this.battle.sides[side].team);
      if (!m.fainted) this.hud.cards[side].setHp(m.hp, m.stats.hp);
    }
    this.lowHpCheck();
  }

  private name(side: Side) {
    const m = this.battle.active(side);
    return side === 1 ? `${t('foeTeam')} ${m.name}` : m.name;
  }

  private async presentOne(e: BattleEvent) {
    const b = this.battle;
    const hud = this.hud;
    switch (e.t) {
      case 'moveUse': {
        const mv = MOVES[e.move];
        const attacker = this.sprites[e.side];
        const target = this.sprites[e.target];
        const pan = e.side === 0 ? -0.4 : 0.4;
        if (e.outcome === 'charging') {
          audio.playMoveSfx(mv.type, 'cast', 0.6, pan);
          const text = TWO_TURN_MSG[e.move] ?? 'charging';
          const m = this.msg(t(text, this.name(e.side)), 400);
          await playMoveFx({ vfx: this.vfx, moveKey: e.move, side: e.side, attacker, target, hits: 0, missed: false, phase: 'charge', onImpact: () => {} });
          await m;
          return;
        }
        if (e.outcome === 'failed') {
          await this.msg(t('used', this.name(e.side), mv.name), 300);
          await this.msg(t('failed'));
          return;
        }
        const self = mv.category === 'status' && (mv.target === 'USER' || mv.target === 'DEPENDS');
        audio.playMoveSfx(mv.type, 'cast', 0.4 + (mv.power / 150) * 0.6, pan);
        const say = this.msg(t('used', this.name(e.side), mv.name), 200);
        const missed = e.outcome === 'miss' || e.outcome === 'protected' || e.outcome === 'noEffect';
        if (e.outcome === 'protected') this.vfx.prim.shield(target.at(0.5), { color: 0x7affa0, radius: Math.max(1.2, target.height * 0.7), ms: 1100 });
        let critShown = false;
        await playMoveFx({
          vfx: this.vfx,
          moveKey: e.move,
          side: e.side,
          attacker,
          target,
          hits: Math.max(1, e.hits.length),
          missed,
          self,
          onImpact: (i) => {
            const h = e.hits[i];
            if (!h) {
              audio.playMoveSfx(mv.type, 'impact', 0.5, -pan);
              return;
            }
            this.applyHit(e.target, h.damage, h.hpAfter, h.eff, h.crit, mv.type, attacker);
            if (h.crit && !critShown) critShown = true;
          },
        });
        await say;
        if (e.outcome === 'miss') await this.msg(t('missed', this.name(e.side)));
        else if (e.outcome === 'noEffect') await this.msg(t('doesntAffect', this.name(e.target)));
        else if (e.outcome === 'protected') await this.msg(t('protected', this.name(e.target)));
        else if (e.hits.length) {
          if (e.hits.some((h) => h.crit)) await this.msg(t('crit'), 350);
          const eff = e.hits[0].eff;
          if (eff > 1) await this.msg(t('superMsg'), 450);
          else if (eff < 1) await this.msg(t('notVeryMsg'), 450);
          if (e.hits.length > 1) await this.msg(t('hitTimes', e.hits.length), 350);
        }
        return;
      }
      case 'damage': {
        const s = this.sprites[e.side];
        const otherSprite = this.sprites[other(e.side)];
        audio.playSfx(e.cause === 'psn' ? 'statusPoison' : e.cause === 'brn' ? 'statusBurn' : 'hitWeak', { volume: 0.7 });
        const fx = residualFx(this.vfx, s, e.cause, otherSprite);
        hud.cards[e.side].setHp(e.hpAfter);
        const p = this.screenPos(e.side, 0.7);
        hud.damageNumber(p.x, p.y, e.amount, 'nve');
        const key = { recoil: 'recoil', psn: 'poisonHurt', brn: 'burnHurt', leech: 'leechHurt', confusion: 'hurtItself', crash: 'crash' }[e.cause] as 'recoil';
        await Promise.all([fx, this.msg(t(key, this.name(e.side)), 450)]);
        return;
      }
      case 'heal': {
        const s = this.sprites[e.side];
        audio.playSfx('heal');
        hud.cards[e.side].setHp(e.hpAfter);
        if (e.amount > 0) {
          const p = this.screenPos(e.side, 0.7);
          hud.damageNumber(p.x, p.y, e.amount, 'heal');
        }
        if (e.cause === 'evolve') return;
        const fx = healFx(this.vfx, s);
        if (e.cause === 'drain') await Promise.all([fx, this.msg(t('drained', this.name(other(e.side))), 350)]);
        else await Promise.all([fx, this.msg(t('regained', this.name(e.side)), 400)]);
        return;
      }
      case 'status': {
        const s = this.sprites[e.side];
        s.setStatus(e.status);
        hud.cards[e.side].setStatus(e.status);
        const sfx = { brn: 'statusBurn', par: 'statusParalyze', psn: 'statusPoison', tox: 'statusPoison', slp: 'statusSleep', frz: 'statusFreeze', none: 'uiSelect' } as const;
        audio.playSfx(sfx[e.status]);
        const key = { brn: 'burned', par: 'paralyzed', psn: 'poisoned', tox: 'badlyPoisoned', slp: 'asleep', frz: 'frozen', none: 'cured' } as const;
        await Promise.all([statusFx(this.vfx, s, e.status), this.msg(t(key[e.status], this.name(e.side)))]);
        return;
      }
      case 'cure': {
        if (e.status === 'confusion') return this.msg(t('snapped', this.name(e.side)), 400);
        this.sprites[e.side].setStatus('none');
        hud.cards[e.side].setStatus('none');
        if (b.active(e.side).status === 'none' && e.status !== 'slp') await this.msg(t('cured', this.name(e.side)), 400);
        return;
      }
      case 'blocked': {
        const s = this.sprites[e.side];
        if (e.reason === 'slp') {
          statusFx(this.vfx, s, 'slp');
          await this.msg(t('fastAsleep', this.name(e.side)));
        } else if (e.reason === 'frz') {
          s.shake(0.05, 0.4);
          await this.msg(t('frozenSolid', this.name(e.side)));
        } else if (e.reason === 'par') {
          statusFx(this.vfx, s, 'par');
          audio.playSfx('statusParalyze');
          await this.msg(t('fullPara', this.name(e.side)));
        } else await this.msg(t('mustRecharge', this.name(e.side)));
        return;
      }
      case 'wake':
        this.sprites[e.side].setStatus('none');
        hud.cards[e.side].setStatus('none');
        this.sprites[e.side].jump(0.4, 300);
        return this.msg(t('woke', this.name(e.side)), 400);
      case 'thaw':
        this.sprites[e.side].setStatus('none');
        hud.cards[e.side].setStatus('none');
        return this.msg(t('thawed', this.name(e.side)), 400);
      case 'confused':
        audio.playSfx('statusConfuse');
        await Promise.all([statusFx(this.vfx, this.sprites[e.side], 'confusion'), this.msg(t('confused', this.name(e.side)))]);
        return;
      case 'confusedCheck':
        statusFx(this.vfx, this.sprites[e.side], 'confusion');
        return this.msg(t('isConfused', this.name(e.side)), 350);
      case 'boost': {
        const label = statName(STAT_LABEL[e.stat]);
        const nm = this.name(e.side);
        if (e.capped || e.delta === 0) return this.msg(t(e.delta >= 0 ? 'wontRise' : 'wontFall', nm, label), 400);
        audio.playSfx(e.delta > 0 ? 'statUp' : 'statDown');
        const text = e.delta >= 2 ? t('sharplyRose', nm, label) : e.delta > 0 ? t('rose', nm, label) : e.delta <= -2 ? t('harshlyFell', nm, label) : t('fell', nm, label);
        await Promise.all([boostFx(this.vfx, this.sprites[e.side], e.stat, e.delta), this.msg(text, 400)]);
        return;
      }
      case 'flinch':
        this.sprites[e.side].shake(0.08, 0.3);
        return this.msg(t('flinched', this.name(e.side)), 400);
      case 'faint': {
        const s = this.sprites[e.side];
        const m = b.active(e.side);
        hud.cards[e.side].setHp(0);
        audio.playCry(SPECIES[m.speciesKey].dex, { pitch: 0.75 });
        audio.playSfx('faint');
        this.stage.clock.slowMo(0.45, 500);
        await Promise.all([s.faint(), this.msg(t('fainted_', this.name(e.side)), 500)]);
        s.setStatus('none');
        hud.cards[e.side].show(false);
        hud.cards[e.side].setTeam(b.sides[e.side].team);
        return;
      }
      case 'switchOut': {
        const s = this.sprites[e.side];
        const m = b.sides[e.side].team[e.index];
        audio.playSfx('switchOut');
        if (e.side === 0) this.msg(t('comeBack', m.name), 300);
        returnFx(this.vfx, s);
        await s.exit();
        hud.cards[e.side].show(false);
        return;
      }
      case 'switchIn':
        return this.sendOut(e.side, false);
      case 'evolve':
        return this.presentEvolution(e.side, e.from, e.to);
      case 'screen': {
        if (e.on) {
          const s = this.sprites[e.side];
          this.vfx.prim.shield(s.at(0.5), { color: e.screen === 'reflect' ? 0x9ad0ff : 0xffe08a, radius: Math.max(1.3, s.height * 0.75), ms: 1200 });
          await this.msg(t(e.screen === 'reflect' ? 'reflectUp' : 'lightScreenUp', b.sides[e.side].name), 450);
        } else await this.msg(t('screenDown', b.sides[e.side].name, e.screen === 'reflect' ? 'Reflect' : 'Light Screen'), 400);
        return;
      }
      case 'seeded':
        return this.msg(t('seeded', this.name(e.side)), 400);
      case 'ability':
        hud.abilityPop(e.side, e.text);
        await this.wait(500);
        return;
      case 'msg':
        return this.msg(e.text, 450);
      case 'evoGain': {
        const m = b.active(e.side);
        if (e.side === 0 && b.canEvolve(m) && !this.evoAnnounced.has(m.uid + m.stage)) {
          this.evoAnnounced.add(m.uid + m.stage);
          hud.centerPop(t('evoReady'), '#ffd35a', 1300);
          this.sprites[0].setOutline(1.2, 0xffd35a);
          this.wait(900).then(() => this.sprites[0].setOutline(0));
          audio.playSfx('evolveCharge', { volume: 0.35, pitch: 1.6 });
        }
        return;
      }
      case 'end':
        return;
    }
  }

  private evoAnnounced = new Set<string>();

  private applyHit(side: Side, damage: number, hpAfter: number, eff: number, crit: boolean, type: string, attacker: PokemonSprite) {
    const hud = this.hud;
    const s = this.sprites[side];
    hud.cards[side].setHp(hpAfter);
    const p = this.screenPos(side, 0.65);
    const kind = crit ? 'crit' : eff > 1 ? 'se' : eff < 1 ? 'nve' : 'normal';
    hud.damageNumber(p.x + (Math.random() - 0.5) * 40, p.y, damage, kind, crit ? 'CRIT' : eff > 1 ? '!' : undefined);
    const frac = damage / this.battle.active(side).stats.hp;
    audio.playSfx(eff > 1 ? 'hitSuper' : eff < 1 ? 'hitWeak' : 'hit', { pan: side === 0 ? -0.5 : 0.5 });
    audio.playMoveSfx(type, 'impact', Math.min(1, 0.4 + frac * 2), side === 0 ? -0.5 : 0.5);
    s.blink(3);
    s.knockback(attacker.group.position, 0.3 + Math.min(0.5, frac));
    this.vfx.shake(Math.min(0.5, 0.08 + frac * 0.8), 300);
    if (crit) {
      audio.playSfx('crit');
      this.stage.clock.slowMo(0.25, 420);
      this.stage.chromaPulse(0.025, 450);
      this.stage.shockwave(s.at(0.5), 0.8, 400);
    } else if (eff > 1) {
      this.stage.flash(0xffffff, 0.25, 200);
      this.stage.chromaPulse(0.012, 300);
    }
    if (hpAfter <= 0) this.stage.clock.slowMo(0.3, 600);
  }

  private async sendOut(side: Side, intro: boolean) {
    const b = this.battle;
    const m = b.active(side);
    const s = this.sprites[side];
    s.group.visible = false;
    s.body.position.set(0, 0, 0);
    await s.load(SPECIES[m.speciesKey].dex);
    s.setStatus(m.status);
    const plat = side === 0 ? this.arena.playerPlatform : this.arena.enemyPlatform;
    plat.setColor(TYPE_COLOR[m.types[0]]);
    const text = side === 0 ? t('go', m.name) : t('sentOut', b.sides[1].name, m.name);
    const say = this.msg(text, intro ? 250 : 350);
    audio.playSfx('switchIn');
    sendOutFx(this.vfx, s.at(0));
    await s.enter();
    audio.playCry(SPECIES[m.speciesKey].dex, { volume: 0.8 });
    this.hud.cards[side].setMon(m, b.hasNextStage(m));
    this.hud.cards[side].setTeam(b.sides[side].team);
    this.hud.cards[side].show(true);
    await say;
    this.lowHpWarned = false;
  }

  private async presentEvolution(side: Side, from: string, to: string) {
    const b = this.battle;
    const m = b.active(side);
    const s = this.sprites[side];
    const fromName = SPECIES[from].name;
    audio.duckMusic(0.25);
    await this.msg(t('evolving', side === 1 ? `${t('foeTeam')} ${fromName}` : fromName), 300);
    audio.playSfx('evolveCharge');
    await playEvolutionFx(this.vfx, s, side, SPECIES[to].dex, () => {
      audio.playSfx('evolveBurst');
      this.hud.cards[side].setMon(m, b.hasNextStage(m));
      (side === 0 ? this.arena.playerPlatform : this.arena.enemyPlatform).setColor(TYPE_COLOR[m.types[0]]);
    });
    audio.playCry(SPECIES[to].dex);
    s.setStatus(m.status);
    this.evolutions += side === 0 ? 1 : 0;
    audio.duckMusic(1);
    await this.msg(t('evolved', fromName, SPECIES[to].name), 700);
    this.stage.director.move(wideShot(), 0.7);
  }

  private lowHpCheck() {
    const m = this.battle.active(0);
    const low = !m.fainted && m.hp / m.stats.hp <= 0.2;
    if (low && !this.lowHpWarned && !this.setup.autoPlayer) {
      this.lowHpWarned = true;
      let n = 0;
      const beep = () => {
        audio.playSfx('lowHp', { volume: 0.5 });
        if (++n < 4) setTimeout(beep, 260);
      };
      beep();
    }
    if (!low) this.lowHpWarned = false;
  }

  private async finish(): Promise<BattleOutcome> {
    const b = this.battle;
    const won = !this.quit && b.winner === 0;
    if (!this.quit) {
      audio.playMusic(won ? 'victory' : 'defeat');
      this.hud.centerPop(won ? t('youWin') : t('youLose'), won ? '#ffd35a' : '#9aa7c7', 2200);
      if (won) {
        const s = this.sprites[0];
        if (!b.active(0).fainted) s.jump(0.6, 400);
        this.vfx.burst(s.at(1.1), { count: 80, tex: 'star', color: [0xffffff, 0xffd35a], speed: [2, 6], life: [0.8, 1.4], size: [0.12, 0.3], gravity: 3 });
      }
      await this.msg(won ? t('playerDefeated', this.setup.trainer.name) : t('playerLost', this.setup.trainer.name), 1400);
    }
    const team = b.sides[0].team;
    return {
      won,
      quit: this.quit,
      time: b.time,
      perfects: team.reduce((a, m) => a + m.perfects, 0),
      evolutions: this.evolutions,
      damage: team.reduce((a, m) => a + m.dealt, 0),
      finalSpecies: team.map((m) => m.speciesKey),
    };
  }

  dispose() {
    this.offUpdate();
    this.hud.destroy();
    this.sprites.forEach((s) => s.destroy());
    this.arena.dispose();
    this.vfx.clear();
    this.stage.setTint(0xffffff, 0, 0);
    setBaseSpeed(this.stage.clock, 1);
  }
}
