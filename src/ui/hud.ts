import type { Battle } from '../battle/engine';
import type { Action, BattleMon, Side, StatusCond, TimingGrade, WeatherKind } from '../battle/types';
import { CONFIG } from '../battle/config';
import { SPECIES } from '../data/gamedata';
import { effectiveMove } from '../battle/engine';
import { TYPE_COLOR } from '../data/typeColors';
import type { PokeType } from '../data/types';
import { assetUrl } from '../render/pokemonSprite';
import { audio } from '../audio/audio';
import { clear, h, sleep } from './dom';
import { t } from './i18n';

const STATUS_LABEL: Record<StatusCond, [string, string]> = {
  none: ['', ''],
  brn: ['BRN', '#e8602c'],
  par: ['PAR', '#d8b820'],
  psn: ['PSN', '#a040c0'],
  tox: ['TOX', '#7a20a0'],
  slp: ['SLP', '#7a8aa8'],
  frz: ['FRZ', '#58b8e8'],
};

export function typeBadge(type: string) {
  const c = TYPE_COLOR[type as PokeType] ?? '#888';
  return h('span', { class: 'type-badge', style: `background-color:${c}` }, type);
}

export function iconUrl(speciesKey: string) {
  return assetUrl(SPECIES[speciesKey].dex, 'icon.png');
}

function moveGradient(type: string) {
  const c = TYPE_COLOR[type as PokeType] ?? '#888';
  return `linear-gradient(160deg, ${c} 0%, ${shade(c, -0.35)} 100%)`;
}

export function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

class InfoCard {
  readonly el: HTMLElement;
  private nm = h('span', { class: 'nm' });
  private lv = h('span', { class: 'lv' });
  private statusChip = h('span', { class: 'status-chip hidden' });
  private types = h('span', { class: 'types' });
  private fill = h('div', { class: 'fill' });
  private lag = h('div', { class: 'lag' });
  private hpText = h('div', { class: 'hptext' });
  private atb = h('div', { class: 'gauge atb' }, h('i'));
  private evo = h('div', { class: 'gauge evo' }, h('i'));
  private balls = h('div', { class: 'balls' });
  private screens = h('div', { class: 'screens' });
  private portrait = h('img', { class: 'portrait', alt: '' }) as HTMLImageElement;
  private hp = 1;
  private maxHp = 1;
  private shownHp = 1;
  private lagHp = 1;
  private lagDelay = 0;

  constructor(readonly side: Side) {
    this.el = h(
      'div',
      { class: `info-card ${side === 0 ? 'me' : 'foe'} off` },
      h('div', { class: 'accent' }),
      h('div', { class: 'portrait-wrap' }, this.portrait),
      h(
        'div',
        { class: 'card-body' },
        h('div', { class: 'row1' }, this.nm, this.lv, this.statusChip, this.types),
        h('div', { class: 'hp-row' }, h('span', { class: 'hp-label' }, 'HP'), h('div', { class: 'hpbar' }, this.lag, this.fill, h('i', { class: 'gloss' }))),
        side === 0 ? this.hpText : null,
        h('div', { class: 'gauges' }, h('span', null, 'ATB'), this.atb, h('span', { class: 'evo-label' }, 'EVO'), this.evo),
        h('div', { class: 'card-foot' }, this.balls, this.screens),
      ),
    );
  }

  setMon(m: BattleMon, hasNext: boolean) {
    this.nm.textContent = m.name;
    this.portrait.src = iconUrl(m.speciesKey);
    this.el.style.setProperty('--accent', TYPE_COLOR[m.types[0]] ?? '#58e1ff');
    this.el.style.setProperty('--accent2', TYPE_COLOR[m.types[1] ?? m.types[0]] ?? '#58e1ff');
    this.lv.textContent = `${t('level')}${m.level}`;
    clear(this.types);
    m.types.forEach((ty) => this.types.appendChild(typeBadge(ty)));
    this.maxHp = m.stats.hp;
    this.hp = this.shownHp = this.lagHp = m.hp;
    this.evo.classList.toggle('maxed', !hasNext);
    this.setStatus(m.status);
    this.render();
  }

  setHp(hp: number, max = this.maxHp) {
    this.maxHp = max;
    if (hp < this.hp) this.lagDelay = 0.35;
    this.hp = hp;
  }

  setStatus(s: StatusCond) {
    const [label, color] = STATUS_LABEL[s];
    this.statusChip.textContent = label;
    this.statusChip.style.background = color;
    this.statusChip.classList.toggle('hidden', s === 'none');
  }

  setTeam(team: BattleMon[]) {
    clear(this.balls);
    team.forEach((m) => this.balls.appendChild(h('i', { class: m.fainted ? 'out' : '' })));
  }

  setScreens(reflect: number, light: number) {
    clear(this.screens);
    if (reflect > 0) this.screens.appendChild(h('span', null, 'REFLECT'));
    if (light > 0) this.screens.appendChild(h('span', null, 'L.SCREEN'));
  }

  show(on: boolean) {
    this.el.classList.toggle('off', !on);
  }

  update(dt: number, atb: number, evo: number, canEvolve: boolean) {
    // smooth HP drain (~ 60% of the bar per second, min speed so big hits don't crawl)
    const speed = Math.max(this.maxHp * 0.6, Math.abs(this.hp - this.shownHp) * 3) * dt;
    if (this.shownHp > this.hp) this.shownHp = Math.max(this.hp, this.shownHp - speed);
    else if (this.shownHp < this.hp) this.shownHp = Math.min(this.hp, this.shownHp + speed);
    if (this.lagDelay > 0) this.lagDelay -= dt;
    else if (this.lagHp > this.shownHp) this.lagHp = Math.max(this.shownHp, this.lagHp - this.maxHp * 0.8 * dt);
    if (this.lagHp < this.shownHp) this.lagHp = this.shownHp;
    this.render();
    const a = Math.max(0, Math.min(1, atb));
    (this.atb.firstChild as HTMLElement).style.width = `${a * 100}%`;
    this.atb.classList.toggle('full', a >= 1);
    (this.evo.firstChild as HTMLElement).style.width = `${Math.min(100, evo)}%`;
    this.evo.classList.toggle('full', canEvolve);
  }

  isDraining() {
    return Math.abs(this.shownHp - this.hp) > 0.5;
  }

  private render() {
    const f = this.shownHp / this.maxHp;
    this.fill.style.width = `${Math.max(0, f) * 100}%`;
    this.fill.classList.toggle('mid', f <= 0.5 && f > 0.2);
    this.fill.classList.toggle('low', f <= 0.2);
    this.lag.style.width = `${Math.max(0, this.lagHp / this.maxHp) * 100}%`;
    this.hpText.textContent = `${Math.ceil(this.shownHp)} / ${this.maxHp}`;
  }
}

export interface MenuResult {
  action: Action;
}

export class Hud {
  readonly root = h('div', { class: 'hud' });
  readonly cards: [InfoCard, InfoCard] = [new InfoCard(0), new InfoCard(1)];
  private msgEl = h('div', { class: 'msg' });
  private cmdEl = h('div', { class: 'cmd off interactive' });
  private topEl = h('div', { class: 'top-center' });
  private weatherEl = h('div', { class: 'weather-chip hidden' });
  private weatherKind: WeatherKind | null = null;
  /** weather as presented so far (the engine can be a few events ahead) */
  private shownWeather: WeatherKind | null = null;
  private weatherMax = 1;
  private overlay = h('div', { class: 'overlay' });
  private skip = false;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  lowHpBeep = 0;

  constructor(parent: HTMLElement) {
    this.root.append(this.cards[0].el, this.cards[1].el, this.topEl, this.weatherEl, h('div', { class: 'msgbox' }, this.msgEl, this.cmdEl), this.overlay);
    parent.appendChild(this.root);
    this.msgEl.addEventListener('pointerdown', () => (this.skip = true));
  }

  destroy() {
    this.setKeys(null);
    this.root.remove();
  }

  private setKeys(fn: ((e: KeyboardEvent) => void) | null) {
    if (this.keyHandler) removeEventListener('keydown', this.keyHandler);
    this.keyHandler = fn;
    if (fn) addEventListener('keydown', fn);
  }

  setTop(...items: (string | HTMLElement)[]) {
    clear(this.topEl);
    for (const it of items) this.topEl.appendChild(typeof it === 'string' ? h('span', { class: 'pill' }, it) : it);
  }

  // ------------------------------------------------------------ messages

  /** Typewriter message. Resolves after the text has been shown for `hold` ms. */
  async message(text: string, hold = 650, speedMult = 1) {
    this.skip = false;
    this.msgEl.textContent = '';
    const caret = h('div', { class: 'caret' });
    const cps = 55 * speedMult;
    let shown = 0;
    const start = performance.now();
    while (shown < text.length) {
      if (this.skip) shown = text.length;
      else shown = Math.min(text.length, Math.floor(((performance.now() - start) / 1000) * cps) + 1);
      this.msgEl.textContent = text.slice(0, shown);
      if (shown < text.length) await sleep(16);
    }
    this.msgEl.appendChild(caret);
    this.skip = false;
    const end = performance.now() + hold / speedMult;
    while (performance.now() < end && !this.skip) await sleep(16);
  }

  setMessage(text: string) {
    this.msgEl.textContent = text;
  }

  // ------------------------------------------------------------ popups

  private pop(el: HTMLElement, ms: number) {
    this.overlay.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  damageNumber(x: number, y: number, amount: number, kind: 'normal' | 'se' | 'nve' | 'crit' | 'heal', label?: string) {
    const el = h('div', { class: `dmg-num ${kind}`, style: `left:${x}px;top:${y}px` }, kind === 'heal' ? `+${amount}` : `${amount}`, label ? h('small', null, label) : null);
    this.pop(el, 1200);
  }

  centerPop(text: string, color = '#fff', ms = 1400) {
    this.pop(h('div', { class: 'center-pop', style: `color:${color}` }, text), ms);
  }

  abilityPop(side: Side, text: string) {
    const pos = side === 0 ? 'right:24px;bottom:330px' : 'left:24px;top:150px';
    this.pop(h('div', { class: 'ability-pop', style: pos }, text), 1800);
  }

  async moveBanner(name: string, type: string) {
    const el = h('div', { class: 'move-banner', style: `background:${moveGradient(type)}` }, name);
    this.overlay.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    }, 1300);
  }

  async vsIntro(left: { name: string; icons: string[]; pic?: string }, right: { name: string; icons: string[]; pic?: string }) {
    const side = (s: { name: string; icons: string[]; pic?: string }) =>
      h('div', { class: 'side' }, s.pic ? h('img', { class: 'trainer-pic', src: s.pic, alt: '' }) : null, s.name, h('div', { class: 'icons' }, s.icons.map((src) => h('img', { src }))));
    const el = h('div', { class: `vs-intro ${right.pic ? 'with-pic' : ''}` }, side(left), h('div', { class: 'vs' }, t('vs')), side(right));
    this.overlay.appendChild(el);
    await sleep(right.pic ? 2400 : 1900);
    el.style.transition = 'opacity .35s';
    el.style.opacity = '0';
    await sleep(350);
    el.remove();
  }

  // ------------------------------------------------------------ QTE

  /**
   * Timing ring at a screen position. Returns the grade.
   * kind 'attack': shrinking ring meets the inner ring. 'brace': red, faster.
   */
  timing(x: number, y: number, kind: 'attack' | 'brace'): Promise<TimingGrade> {
    const D = kind === 'attack' ? 1150 : 950; // total duration (ms)
    const hitAt = D * (2 / 3); // when the outer ring overlaps the inner one
    const perfectWin = kind === 'attack' ? 75 : 85;
    const goodWin = kind === 'attack' ? 175 : 190;
    const color = kind === 'attack' ? '#ffd35a' : '#ff5a6a';
    const R = 42;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-95 -95 190 190');
    const mk = (r: number, stroke: string, w: number, dash = '') => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', String(r));
      c.setAttribute('fill', 'none');
      c.setAttribute('stroke', stroke);
      c.setAttribute('stroke-width', String(w));
      if (dash) c.setAttribute('stroke-dasharray', dash);
      svg.appendChild(c);
      return c;
    };
    mk(R, 'rgba(0,0,0,0.45)', 12);
    const inner = mk(R, color, 5);
    mk(R - 9, 'rgba(255,255,255,0.35)', 1.5, '4 5');
    const outer = mk(R * 3, '#ffffff', 4);
    const el = h('div', { class: 'qte interactive', style: `left:${x}px;top:${y}px` }, svg as unknown as HTMLElement, h('div', { class: 'hint' }, kind === 'attack' ? t('timingHint') : t('braceHint')));
    this.overlay.appendChild(el);
    audio.playSfx(kind === 'attack' ? 'charge' : 'ready', { volume: 0.5 });
    return new Promise((resolve) => {
      const start = performance.now();
      let done = false;
      const finish = (grade: TimingGrade) => {
        if (done) return;
        done = true;
        removeEventListener('keydown', onKey);
        el.removeEventListener('pointerdown', onPress);
        el.remove();
        const label = grade === 'perfect' ? (kind === 'brace' ? t('braced') : t('perfect')) : grade === 'good' ? t('good') : t('miss');
        this.pop(h('div', { class: `qte-grade ${grade}`, style: `left:${x}px;top:${y - 40}px` }, label), 900);
        audio.playSfx(grade === 'perfect' ? 'timingPerfect' : grade === 'good' ? 'timingGood' : 'timingMiss');
        if (kind === 'brace' && grade !== 'miss') audio.playSfx('brace');
        resolve(grade);
      };
      const onPress = () => {
        const dt = Math.abs(performance.now() - start - hitAt);
        finish(dt <= perfectWin ? 'perfect' : dt <= goodWin ? 'good' : 'miss');
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          onPress();
        }
      };
      addEventListener('keydown', onKey);
      el.addEventListener('pointerdown', onPress);
      // clicking anywhere on the screen also counts
      const anyClick = (e: PointerEvent) => {
        if (!done) {
          e.preventDefault();
          onPress();
        }
        removeEventListener('pointerdown', anyClick, true);
      };
      addEventListener('pointerdown', anyClick, true);
      const frame = () => {
        if (done) {
          removeEventListener('pointerdown', anyClick, true);
          return;
        }
        const el2 = performance.now() - start;
        const k = Math.min(1, el2 / D);
        const r = R * 3 * (1 - k * 1.0) + 0.001;
        outer.setAttribute('r', String(Math.max(1, r * (3 / 3))));
        const near = Math.abs(el2 - hitAt) <= perfectWin;
        inner.setAttribute('stroke-width', near ? '8' : '5');
        outer.setAttribute('stroke', near ? color : '#ffffff');
        if (el2 >= D) finish('miss');
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  // ------------------------------------------------------------ command menu

  /** Show the command menu for the active player Pokemon; resolves with the chosen action. */
  command(b: Battle, side: Side, opts: { onOpen?: () => void; canSwitch: boolean }): { promise: Promise<Action>; cancel: () => void } {
    const mon = b.active(side);
    let resolveFn!: (a: Action) => void;
    const promise = new Promise<Action>((r) => (resolveFn = r));
    let closed = false;
    const close = () => {
      closed = true;
      this.cmdEl.classList.add('off');
      this.setKeys(null);
      this.closeParty();
    };
    const choose = (a: Action) => {
      if (closed) return;
      audio.playSfx('uiSelect');
      close();
      resolveFn(a);
    };

    clear(this.cmdEl);
    const allOut = mon.moves.every((m) => m.pp <= 0);
    mon.moves.forEach((slot, i) => {
      const mv = effectiveMove(slot.key);
      let eff: HTMLElement | null = null;
      if (mv.category !== 'status') {
        const est = b.estimateDamage(side, slot.key);
        if (est.eff === 0) eff = h('span', { class: 'eff ne' }, t('noEffect'));
        else if (est.eff > 1) eff = h('span', { class: 'eff se' }, t('superEffective'));
        else if (est.eff < 1) eff = h('span', { class: 'eff nve' }, t('notVery'));
      }
      const cat = mv.category === 'physical' ? '#ff8a4a' : mv.category === 'special' ? '#6ab0ff' : '#c8c8c8';
      const btn = h(
        'button',
        {
          class: 'move-btn',
          style: `background:${moveGradient(mv.type)}`,
          disabled: slot.pp <= 0 && !allOut,
          title: mv.description,
          onclick: () => choose({ type: 'move', slot: i }),
          onmouseenter: () => audio.playSfx('uiHover', { volume: 0.3 }),
        },
        h('span', { class: 'k kbd' }, String(i + 1)),
        h('span', { class: 'mn' }, mv.name),
        h(
          'span',
          { class: 'meta' },
          h('span', { class: 'cat', style: `background:${cat}`, title: t(mv.category) }),
          h('span', null, mv.type),
          h('span', null, `${t('power')} ${mv.power > 1 ? mv.power : '—'}`),
          h('span', null, `${t('acc')} ${mv.accuracy || '∞'}`),
          h('span', null, `PP ${slot.pp}/${slot.maxPp}`),
        ),
        eff,
      );
      this.cmdEl.appendChild(btn);
    });
    const canEvo = b.canEvolve(mon);
    const hasNext = b.hasNextStage(mon);
    const evoBtn = h('button', { class: `btn evo-btn ${canEvo ? 'ready' : ''}`, disabled: !canEvo, onclick: () => choose({ type: 'evolve' }) }, h('span', { class: 'kbd' }, 'E'), ' ', hasNext ? t('evolve') : 'MAX');
    const swBtn = h('button', { class: 'btn', disabled: !opts.canSwitch, onclick: () => this.openParty(b, side, false).then((i) => i !== null && choose({ type: 'switch', index: i })) }, h('span', { class: 'kbd' }, 'S'), ' ', t('switch'));
    this.cmdEl.appendChild(h('div', { class: 'side-btns' }, evoBtn, swBtn));
    this.cmdEl.classList.remove('off');
    this.setMessage(t('chooseMove', mon.name));
    opts.onOpen?.();
    this.setKeys((e) => {
      if (this.partyOpen) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4 && mon.moves[n - 1] && (mon.moves[n - 1].pp > 0 || allOut)) choose({ type: 'move', slot: n - 1 });
      else if (e.key.toLowerCase() === 'e' && canEvo) choose({ type: 'evolve' });
      else if (e.key.toLowerCase() === 's' && opts.canSwitch) swBtn.click();
    });
    return {
      promise,
      cancel: () => {
        if (!closed) close();
      },
    };
  }

  // ------------------------------------------------------------ party

  private partyEl: HTMLElement | null = null;
  private partyOpen = false;
  private partyResolve: ((i: number | null) => void) | null = null;

  closeParty() {
    this.partyEl?.remove();
    this.partyEl = null;
    this.partyOpen = false;
    this.partyResolve?.(null);
    this.partyResolve = null;
  }

  /** Party picker. forced = must pick (after a faint). Resolves with a team index or null. */
  openParty(b: Battle, side: Side, forced: boolean): Promise<number | null> {
    this.closeParty();
    const st = b.sides[side];
    this.partyOpen = true;
    return new Promise((resolve) => {
      this.partyResolve = resolve;
      const pick = (i: number) => {
        audio.playSfx('uiSelect');
        this.partyResolve = null;
        this.closeParty();
        resolve(i);
      };
      const list = h('div', { class: 'party-list' });
      st.team.forEach((m, i) => {
        const f = m.hp / m.stats.hp;
        const cls = f <= 0.2 ? 'low' : f <= 0.5 ? 'mid' : '';
        list.appendChild(
          h(
            'button',
            { class: 'party-mon', disabled: m.fainted || i === st.active, onclick: () => pick(i) },
            h('img', { src: iconUrl(m.speciesKey) }),
            h('b', null, m.name, ' ', h('small', null, `${t('level')}${m.level}`)),
            h('small', null, m.fainted ? t('fainted') : i === st.active ? t('active_') : `${m.hp}/${m.stats.hp}`),
            h('div', { class: 'hpbar' }, h('div', { class: `fill ${cls}`, style: `width:${f * 100}%` })),
          ),
        );
      });
      this.partyEl = h(
        'div',
        { class: 'party panel interactive' },
        h('h4', null, t('choosePokemon')),
        list,
        forced ? null : h('button', { class: 'btn', onclick: () => (audio.playSfx('uiBack'), this.closeParty()) }, t('cancel')),
      );
      this.overlay.appendChild(this.partyEl);
      const onKey = (e: KeyboardEvent) => {
        if (!this.partyOpen) return removeEventListener('keydown', onKey);
        if (e.key === 'Escape' && !forced) {
          removeEventListener('keydown', onKey);
          this.closeParty();
        }
        const n = Number(e.key);
        if (n >= 1 && n <= st.team.length && !st.team[n - 1].fainted && n - 1 !== st.active) {
          removeEventListener('keydown', onKey);
          pick(n - 1);
        }
      };
      addEventListener('keydown', onKey);
    });
  }

  // ------------------------------------------------------------ per-frame

  update(dt: number, b: Battle) {
    for (const side of [0, 1] as Side[]) {
      const m = b.active(side);
      const st = b.sides[side];
      this.cards[side].update(dt, m.fainted ? 0 : m.atb, m.evo, b.canEvolve(m));
      this.cards[side].setScreens(st.reflect, st.lightScreen);
    }
    this.updateWeather(b);
  }

  /** Called by the controller when a weather event is presented (null = cleared). */
  setWeather(kind: WeatherKind | null) {
    this.shownWeather = kind;
  }

  /** Weather chip under the top bar: icon, name and a bar for the time left. */
  private updateWeather(b: Battle) {
    const kind = this.shownWeather;
    if (kind !== this.weatherKind) {
      this.weatherKind = kind;
      this.weatherMax = Math.max(1, b.weather?.kind === kind ? b.weather.left : 1);
      clear(this.weatherEl);
      this.weatherEl.classList.toggle('hidden', !kind);
      if (kind) {
        const name = { sun: t('weatherNameSun'), rain: t('weatherNameRain'), sand: t('weatherNameSand'), hail: t('weatherNameHail') }[kind];
        const icon = { sun: '☀️', rain: '🌧️', sand: '🌪️', hail: '🌨️' }[kind];
        this.weatherEl.className = `weather-chip ${kind}`;
        this.weatherEl.append(h('span', { class: 'icon' }, icon), h('b', null, name), h('div', { class: 'bar' }, h('i')));
      }
    }
    if (kind && b.weather?.kind === kind) {
      const bar = this.weatherEl.querySelector('.bar i') as HTMLElement | null;
      if (bar) bar.style.width = `${Math.max(0, Math.min(100, (b.weather.left / this.weatherMax) * 100))}%`;
      this.weatherEl.classList.toggle('negated', b.weatherNow() === null);
    }
  }

  get evoMax() {
    return CONFIG.evo.max;
  }
}
