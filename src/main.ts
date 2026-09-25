import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/600.css';
import '@fontsource/rubik/700.css';
import '@fontsource/rubik/800.css';
import './ui/style.css';
import { audio } from './audio/audio';
import type { Difficulty } from './battle/ai';
import { MOVES, SPECIES } from './data/gamedata';
import { ROSTER } from './data/roster';
import { BattleController, type BattleOutcome } from './game/battleController';
import { recordBattle } from './game/records';
import { settings } from './game/settings';
import { gauntlet, randomTrainer, type Trainer } from './game/trainers';
import { Arena, ENEMY_POS, PLAYER_POS, THEMES } from './render/arena';
import { PokemonSprite } from './render/pokemonSprite';
import { wideShot } from './render/shots';
import { Stage } from './render/stage';
import { resultsScreen, teamSelect, titleScreen } from './ui/screens';
import { t } from './ui/i18n';
import { playMoveFx } from './vfx/playMove';
import { registeredMoveFx, Vfx } from './vfx/vfx';
import type { Side } from './battle/types';

import * as THREE from 'three';

const qs = new URLSearchParams(location.search);
const TITLE_OFFSET = new THREE.Vector3(2, 1.5, 3);
const stage = new Stage(document.getElementById('app')!);
const vfx = new Vfx(stage);
const ui = document.getElementById('ui')!;

const unlock = () => audio.unlock();
addEventListener('pointerdown', unlock);
addEventListener('keydown', unlock);

// ------------------------------------------------------------------ title backdrop: an endless exhibition match

class TitleScene {
  private arena: Arena;
  private a = new PokemonSprite(stage, 'back');
  private b = new PokemonSprite(stage, 'front');
  private alive = true;

  constructor() {
    const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
    this.arena = new Arena(stage, theme);
    this.a.group.position.copy(PLAYER_POS).setY(Arena.FLOOR);
    this.b.group.position.copy(ENEMY_POS).setY(Arena.FLOOR);
    this.a.setLight(theme.spriteLight);
    this.b.setLight(theme.spriteLight);
    stage.scene.add(this.a.group, this.b.group);
    stage.director.cut({ pos: wideShot().pos.clone().add(TITLE_OFFSET), look: wideShot().look });
    stage.director.orbit = 0.035;
    this.loop();
  }

  private finals() {
    return ROSTER.map((l) => l.stages[l.stages.length - 1]);
  }

  private async loop() {
    const f = this.finals();
    const pa = f[Math.floor(Math.random() * f.length)];
    let pb = f[Math.floor(Math.random() * f.length)];
    if (pb === pa) pb = f[(f.indexOf(pa) + 3) % f.length];
    await Promise.all([this.a.load(SPECIES[pa.species].dex), this.b.load(SPECIES[pb.species].dex)]);
    if (!this.alive) return;
    this.a.group.visible = this.b.group.visible = true;
    document.getElementById('loading')?.remove();
    const pool = registeredMoveFx();
    let side: Side = 1;
    while (this.alive) {
      await stage.wait(2600);
      if (!this.alive) break;
      side = side === 0 ? 1 : 0;
      const st = side === 0 ? pa : pb;
      const moves = st.moves.filter((m) => pool.includes(m) && MOVES[m].category !== 'status');
      const mk = moves.length ? moves[Math.floor(Math.random() * moves.length)] : pool[Math.floor(Math.random() * pool.length)];
      const attacker = side === 0 ? this.a : this.b;
      const target = side === 0 ? this.b : this.a;
      await playMoveFx({
        vfx,
        moveKey: mk,
        side,
        attacker,
        target,
        hits: 1,
        missed: false,
        onImpact: () => {
          target.blink(2);
          target.knockback(attacker.group.position);
        },
      });
      // the title scene may have been disposed while the move was playing: don't touch the camera then
      if (!this.alive) break;
      stage.director.orbit = 0.035;
      stage.director.move({ pos: wideShot().pos.clone().add(TITLE_OFFSET), look: wideShot().look }, 1.2);
    }
  }

  dispose() {
    this.alive = false;
    stage.director.orbit = 0;
    this.a.destroy();
    this.b.destroy();
    this.arena.dispose();
    vfx.clear();
  }
}

// ------------------------------------------------------------------ flow

let title: TitleScene | null = null;

function showTitle() {
  title?.dispose();
  title = new TitleScene();
  audio.playMusic('title');
  titleScreen(ui, (mode) => {
    audio.playMusic('select');
    teamSelect(ui, {
      title: mode === 'gauntlet' ? t('gauntlet') : t('quick'),
      onBack: showTitle,
      onDone: (lines) => {
        title?.dispose();
        title = null;
        if (mode === 'gauntlet') runGauntlet(lines);
        else runQuick(lines);
      },
    });
  });
}

function shiftDifficulty(d: Difficulty): Difficulty {
  const order: Difficulty[] = ['easy', 'normal', 'hard'];
  const shift = settings.difficulty === 'easy' ? -1 : settings.difficulty === 'hard' ? 1 : 0;
  return order[Math.max(0, Math.min(2, order.indexOf(d) + shift))];
}

async function playBattle(lines: string[], trainer: Trainer, round?: { i: number; n: number }): Promise<BattleOutcome> {
  const ctl = new BattleController(stage, vfx, ui, {
    playerName: qs.get('name') ?? 'Trainer',
    playerLines: lines,
    trainer,
    round,
    autoPlayer: qs.get('auto') === '1',
  });
  (window as unknown as { __battle: BattleController }).__battle = ctl;
  const out = await ctl.run();
  ctl.dispose();
  return out;
}

async function runGauntlet(lines: string[]) {
  const ladder = gauntlet(Date.now() & 0xffff, lines).map((tr) => ({ ...tr, difficulty: shiftDifficulty(tr.difficulty) }));
  let i = 0;
  const next = async () => {
    const out = await playBattle(lines, ladder[i], { i: i + 1, n: ladder.length });
    if (out.quit) return showTitle();
    const last = i === ladder.length - 1;
    recordBattle(out.won, out.won && last);
    resultsScreen(ui, {
      outcome: out,
      champion: out.won && last,
      hasNext: !last,
      onNext: () => {
        i++;
        next();
      },
      onRetry: () => next(),
      onTitle: showTitle,
    });
  };
  next();
}

async function runQuick(lines: string[]) {
  const trainer = randomTrainer(settings.difficulty);
  const out = await playBattle(lines, trainer);
  if (out.quit) return showTitle();
  recordBattle(out.won);
  resultsScreen(ui, { outcome: out, hasNext: false, onNext: showTitle, onRetry: () => runQuick(lines), onTitle: showTitle });
}

// Test / demo shortcuts: ?quick=1&team=charmander,pikachu,gastly&foe=squirtle,abra,machop&auto=1
if (qs.get('quick')) {
  document.getElementById('loading')?.remove();
  const ids = ROSTER.map((l) => l.id);
  const team = qs.get('team')?.split(',') ?? ids.slice(0, 3);
  const foe = qs.get('foe')?.split(',');
  const tr = randomTrainer((qs.get('difficulty') as Difficulty) ?? 'normal', 7);
  if (foe) tr.lines = foe;
  if (qs.get('theme')) tr.theme = qs.get('theme')!;
  playBattle(team, tr).then((out) => resultsScreen(ui, { outcome: out, hasNext: false, onNext: showTitle, onRetry: () => location.reload(), onTitle: showTitle }));
} else {
  showTitle();
}
