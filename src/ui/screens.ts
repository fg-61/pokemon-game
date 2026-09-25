import { audio } from '../audio/audio';
import type { Difficulty } from '../battle/ai';
import { calcStats } from '../battle/stats';
import { MOVES, SPECIES } from '../data/gamedata';
import { ROSTER, type RosterLine } from '../data/roster';
import { TYPE_COLOR } from '../data/typeColors';
import type { PokeType } from '../data/types';
import type { BattleOutcome } from '../game/battleController';
import { loadLeague } from '../game/league';
import { loadRecords } from '../game/records';
import { saveSettings, settings } from '../game/settings';
import { assetUrl } from '../render/pokemonSprite';
import { clear, h } from './dom';
import { iconUrl, shade, typeBadge } from './hud';
import { getLang, setLang, t, type Lang } from './i18n';
import { badgeCase } from './league';

const dexOf = (key: string) => SPECIES[key].dex;

// ------------------------------------------------------------------ modals

function modal(parent: HTMLElement, title: string, ...body: (HTMLElement | string | null)[]) {
  const bg = h('div', { class: 'modal-bg' });
  const close = () => {
    audio.playSfx('uiBack');
    bg.remove();
    removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
  addEventListener('keydown', onKey);
  bg.appendChild(h('div', { class: 'modal panel' }, h('h3', null, title), ...body, h('div', { style: 'text-align:right;margin-top:14px' }, h('button', { class: 'btn', onclick: close }, t('close')))));
  bg.addEventListener('pointerdown', (e) => e.target === bg && close());
  parent.appendChild(bg);
}

function seg<T extends string | number>(options: [T, string][], value: T, onChange: (v: T) => void) {
  const el = h('div', { class: 'seg' });
  const render = (v: T) => {
    clear(el);
    for (const [val, label] of options)
      el.appendChild(
        h('button', { class: val === v ? 'on' : '', onclick: () => (audio.playSfx('uiMove'), onChange(val), render(val)) }, label),
      );
  };
  render(value);
  return el;
}

function slider(value: number, onChange: (v: number) => void) {
  const el = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(value) }) as HTMLInputElement;
  el.oninput = () => onChange(Number(el.value));
  return el;
}

export function openSettings(parent: HTMLElement, onLang?: () => void) {
  const v = audio.getVolumes();
  modal(
    parent,
    t('settings'),
    h('div', { class: 'row' }, h('span', null, t('difficulty')), seg<Difficulty>([['easy', t('easy')], ['normal', t('normal')], ['hard', t('hard')]], settings.difficulty, (d) => ((settings.difficulty = d), saveSettings()))),
    h('div', { class: 'row' }, h('span', null, t('atbMode'), h('br'), h('small', { style: 'color:var(--muted)' }, `${t('active')}: ${t('activeDesc')} ${t('wait')}: ${t('waitDesc')}`)), seg<'active' | 'wait'>([['active', t('active')], ['wait', t('wait')]], settings.atbMode, (m) => ((settings.atbMode = m), saveSettings()))),
    h('div', { class: 'row' }, h('span', null, t('animSpeed')), seg<1 | 1.5 | 2>([[1, '1x'], [1.5, '1.5x'], [2, '2x']], settings.animSpeed, (s) => ((settings.animSpeed = s), saveSettings()))),
    h('div', { class: 'row' }, h('span', null, t('music')), slider(v.music, (x) => audio.setVolumes({ music: x }))),
    h('div', { class: 'row' }, h('span', null, t('sfx')), slider(v.sfx, (x) => audio.setVolumes({ sfx: x }))),
    h('div', { class: 'row' }, h('span', null, t('language')), seg<Lang>([['tr', 'Türkçe'], ['en', 'English']], getLang(), (l) => (setLang(l), onLang?.()))),
  );
}

export function openHelp(parent: HTMLElement) {
  modal(parent, t('howTo'), ...(['help1', 'help2', 'help3', 'help4', 'help5', 'help6'] as const).map((k) => h('p', null, t(k))));
}

// ------------------------------------------------------------------ title

function recordsLine(): HTMLElement[] {
  const r = loadRecords();
  const lg = loadLeague();
  if (!r.battlesWon && !lg.badges.length) return [];
  return [
    h(
      'div',
      { class: 'records' },
      badgeCase(lg, 22),
      `🏆 ${t('championWins')}: ${lg.titles}`,
      h('span', null, ` · ${t('badgeCount', lg.badges.length)} · ${t('wins')}: ${r.battlesWon} · ${t('bestStreak')}: ${r.bestStreak}`),
    ),
  ];
}

export function titleScreen(parent: HTMLElement, onPick: (mode: 'league' | 'quick') => void) {
  const root = h('div', { class: 'screen title-screen' });
  const render = () => {
    clear(root);
    const menu = h(
      'div',
      { class: 'menu' },
      h('button', { class: 'btn primary', onclick: () => go('league') }, t('league'), h('small', null, t('leagueDesc'))),
      h('button', { class: 'btn', onclick: () => go('quick') }, t('quick'), h('small', null, t('quickDesc'))),
      h('button', { class: 'btn', onclick: () => (audio.playSfx('uiSelect'), openHelp(root)) }, t('howTo')),
      h('button', { class: 'btn', onclick: () => (audio.playSfx('uiSelect'), openSettings(root, render)) }, t('settings')),
    );
    root.append(
      h('div', { class: 'logo' }, h('h1', null, 'EVO CLASH'), h('h2', null, 'POKéMON BATTLE ARENA'), h('p', null, t('subtitle'))),
      menu,
      ...recordsLine(),
      h(
        'div',
        { class: 'lang-toggle' },
        (['tr', 'en'] as Lang[]).map((l) => h('button', { class: getLang() === l ? 'on' : '', onclick: () => (setLang(l), render()) }, l.toUpperCase())),
        h('button', { onclick: (e: Event) => ((e.target as HTMLElement).textContent = audio.toggleMute() ? '🔇' : '🔊') }, audio.muted ? '🔇' : '🔊'),
      ),
      h('div', { class: 'corner' }, 'Fan project · Data: pret/pokefirered · Sprites & cries: PokeAPI · Pokémon © Nintendo / Creatures / GAME FREAK'),
    );
  };
  const go = (m: 'league' | 'quick') => {
    audio.unlock();
    audio.playSfx('uiSelect');
    root.remove();
    onPick(m);
  };
  render();
  parent.appendChild(root);
  return root;
}

// ------------------------------------------------------------------ team select

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const TYPE_LIST: PokeType[] = ['NORMAL', 'FIRE', 'WATER', 'ELECTRIC', 'GRASS', 'ICE', 'FIGHTING', 'POISON', 'GROUND', 'FLYING', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST', 'DRAGON', 'DARK', 'STEEL'];
const STAT_NAMES = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
const STAT_COLORS = { hp: '#ff5959', atk: '#f5ac78', def: '#fae078', spa: '#9db7f5', spd: '#a7db8d', spe: '#fa92b2' };

export function teamSelect(parent: HTMLElement, opts: { title: string; onDone: (lines: string[]) => void; onBack: () => void }) {
  const root = h('div', { class: 'screen select-screen' });
  const picked: string[] = [];
  let focus: RosterLine = ROSTER[0];
  let focusStage = 0;
  const grid = h('div', { class: 'roster-grid' });
  const detail = h('div', { class: 'detail panel' });
  const slots = h('div', { class: 'team-slots' });
  const goBtn = h('button', { class: 'btn primary', disabled: true, onclick: () => done() }, t('battle'));

  const cards = new Map<string, HTMLElement>();
  const searchText = new Map<string, string>();
  for (const line of ROSTER) {
    const base = SPECIES[line.stages[0].species];
    const last = SPECIES[line.stages[line.stages.length - 1].species];
    const branch = line.tags?.includes('branch');
    const card = h(
      'div',
      {
        class: `mon-card ${line.tags?.includes('legendary') ? 'legendary' : ''}`,
        onclick: () => toggle(line),
        onmouseenter: () => {
          audio.playSfx('uiHover', { volume: 0.25 });
          setFocus(line);
        },
      },
      h('div', { class: 'dexno' }, `#${String(base.dex).padStart(3, '0')}`),
      h('div', { class: 'art' }, h('img', { src: assetUrl(base.dex, 'frlg-front.png'), alt: base.name, loading: 'lazy' })),
      h('div', { class: 'name' }, base.name, branch ? h('small', null, ` → ${last.name}`) : null),
      h('div', { class: 'role' }, line.role),
      h('div', { class: 'types' }, base.types.map(typeBadge)),
      h(
        'div',
        { class: 'chain' },
        line.stages.flatMap((s, i) => [i > 0 ? h('span', null, '›') : null, h('img', { src: iconUrl(s.species), title: SPECIES[s.species].name, loading: 'lazy' })]),
      ),
    );
    cards.set(line.id, card);
    searchText.set(line.id, line.stages.map((s) => SPECIES[s.species].name.toLowerCase()).join(' ') + ' ' + line.role.toLowerCase());
    grid.appendChild(card);
  }

  // ---- filters: text search, type, region
  let q = '';
  let typeFilter = '';
  let region = '';
  const applyFilter = () => {
    let shown = 0;
    for (const line of ROSTER) {
      const types = new Set(line.stages.flatMap((s) => SPECIES[s.species].types));
      const ok =
        (!q || searchText.get(line.id)!.includes(q)) &&
        (!typeFilter || types.has(typeFilter as PokeType)) &&
        (!region || (region === 'curated' ? !line.tags : line.tags?.includes(region)));
      cards.get(line.id)!.classList.toggle('hidden', !ok);
      if (ok) shown++;
    }
    countEl.textContent = `${shown} / ${ROSTER.length}`;
  };
  const countEl = h('span', { class: 'count' });
  const search = h('input', { class: 'search', type: 'search', placeholder: t('search') }) as HTMLInputElement;
  search.addEventListener('input', () => {
    q = search.value.trim().toLowerCase();
    applyFilter();
  });
  search.addEventListener('keydown', (e) => e.stopPropagation());
  const typeSel = h('select', { class: 'filter' }, h('option', { value: '' }, t('allTypes')), ...TYPE_LIST.map((ty) => h('option', { value: ty }, ty))) as HTMLSelectElement;
  typeSel.onchange = () => {
    typeFilter = typeSel.value;
    applyFilter();
  };
  const regionSel = h(
    'select',
    { class: 'filter' },
    h('option', { value: '' }, t('allRegions')),
    h('option', { value: 'curated' }, t('featured')),
    h('option', { value: 'kanto' }, 'Kanto'),
    h('option', { value: 'johto' }, 'Johto'),
    h('option', { value: 'hoenn' }, 'Hoenn'),
    h('option', { value: 'legendary' }, t('legendary')),
  ) as HTMLSelectElement;
  regionSel.onchange = () => {
    region = regionSel.value;
    applyFilter();
  };
  const filterBar = h('div', { class: 'filter-bar' }, search, typeSel, regionSel, countEl);

  const renderDetail = () => {
    clear(detail);
    const st = focus.stages[focusStage];
    const sp = SPECIES[st.species];
    const stats = calcStats(sp.base, focus.level);
    detail.append(
      h(
        'div',
        { class: 'top' },
        h('img', { src: assetUrl(sp.dex, 'artwork.png'), alt: sp.name }),
        h(
          'div',
          null,
          h('h3', null, sp.name, ' ', h('small', { style: 'color:var(--muted);font-size:13px' }, `#${String(sp.dex).padStart(3, '0')} · ${t('level')}${focus.level}`)),
          h('div', { style: 'display:flex;gap:4px;margin:4px 0' }, sp.types.map(typeBadge)),
          h('div', { style: 'font-size:12px;color:var(--muted)' }, `${t('ability')}: ${prettify(sp.abilities[0])}`),
          h('div', { style: 'font-size:12px;margin-top:4px' }, h('b', null, focus.role), ' — ', focus.blurb),
        ),
      ),
      h('div', { class: 'stage-tabs' }, focus.stages.map((s, i) => h('button', { class: i === focusStage ? 'on' : '', onclick: () => ((focusStage = i), renderDetail()) }, h('img', { src: iconUrl(s.species) }), `${t('stage')} ${i + 1}`))),
      h(
        'div',
        null,
        STAT_KEYS.map((k) =>
          h('div', { class: 'stat-row' }, h('span', null, STAT_NAMES[k]), h('b', null, String(sp.base[k])), h('div', { class: 'bar' }, h('i', { style: `width:${Math.min(100, (sp.base[k] / 150) * 100)}%;background:${STAT_COLORS[k]}` }))),
        ),
        h('div', { style: 'font-size:11px;color:var(--muted);margin-top:4px' }, `${t('hp')} ${stats.hp} · Atk ${stats.atk} · Def ${stats.def} · SpA ${stats.spa} · SpD ${stats.spd} · Spe ${stats.spe}`),
      ),
      h('div', { style: 'font-weight:700;font-size:13px' }, t('moves')),
      h(
        'div',
        { class: 'move-list' },
        st.moves.map((mk) => {
          const mv = MOVES[mk];
          const c = TYPE_COLOR[mv.type as PokeType] ?? '#888';
          return h(
            'div',
            { class: 'move-chip', style: `background:linear-gradient(160deg, ${c}, ${shade(c, -0.4)})`, title: mv.description },
            h('b', null, mv.name),
            h('span', null, `${mv.type} · ${t(mv.category)} · ${mv.power > 1 ? mv.power : '—'} / ${mv.accuracy || '∞'}`),
          );
        }),
      ),
      h('div', { class: 'dex' }, `“${sp.dexEntry.replace(/POKéMON/g, 'Pokémon')}” — FireRed Pokédex`),
    );
  };

  const setFocus = (line: RosterLine) => {
    if (focus === line) return;
    focus = line;
    focusStage = 0;
    cards.forEach((c, id) => c.classList.toggle('focus', id === line.id));
    renderDetail();
  };

  const renderSlots = () => {
    clear(slots);
    for (let i = 0; i < 3; i++) {
      const id = picked[i];
      slots.appendChild(h('div', { class: `team-slot ${id ? 'filled' : ''}` }, id ? h('img', { src: iconUrl(ROSTER.find((l) => l.id === id)!.stages[0].species) }) : null));
    }
    cards.forEach((c, id) => {
      const idx = picked.indexOf(id);
      c.classList.toggle('picked', idx >= 0);
      c.querySelector('.pick-num')?.remove();
      if (idx >= 0) c.appendChild(h('div', { class: 'pick-num' }, String(idx + 1)));
    });
    (goBtn as HTMLButtonElement).disabled = picked.length !== 3;
  };

  const toggle = (line: RosterLine) => {
    const i = picked.indexOf(line.id);
    if (i >= 0) {
      picked.splice(i, 1);
      audio.playSfx('uiBack');
    } else if (picked.length < 3) {
      picked.push(line.id);
      audio.playSfx('uiSelect');
      audio.playCry(dexOf(line.stages[0].species), { volume: 0.6 });
    } else audio.playSfx('uiError');
    setFocus(line);
    renderSlots();
  };

  const randomize = () => {
    picked.length = 0;
    const ids = ROSTER.filter((l) => !cards.get(l.id)!.classList.contains('hidden')).map((l) => l.id).sort(() => Math.random() - 0.5);
    picked.push(...ids.slice(0, 3));
    audio.playSfx('uiSelect');
    renderSlots();
  };

  const done = () => {
    if (picked.length !== 3) return;
    audio.playSfx('uiSelect');
    cleanup();
    opts.onDone([...picked]);
  };
  const cleanup = () => {
    removeEventListener('keydown', onKey);
    root.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') done();
    if (e.key === 'Escape') {
      cleanup();
      opts.onBack();
    }
  };
  addEventListener('keydown', onKey);

  root.append(
    h('div', { class: 'select-head' }, h('div', null, h('h2', null, t('chooseTeam')), h('p', null, `${opts.title} · ${t('chooseTeamHint')}`)), h('button', { class: 'btn', onclick: () => (cleanup(), audio.playSfx('uiBack'), opts.onBack()) }, t('back'))),
    filterBar,
    h('div', { class: 'select-body' }, grid, detail),
    h('div', { class: 'select-foot' }, h('div', { style: 'display:flex;gap:10px;align-items:center' }, h('b', null, t('team')), slots), h('div', { style: 'display:flex;gap:10px' }, h('button', { class: 'btn', onclick: randomize }, '🎲 ', t('random')), goBtn)),
  );
  cards.get(focus.id)?.classList.add('focus');
  renderDetail();
  renderSlots();
  applyFilter();
  parent.appendChild(root);
}

function prettify(s: string) {
  return s
    .split('_')
    .map((w) => w[0] + w.slice(1).toLowerCase())
    .join(' ');
}

// ------------------------------------------------------------------ results

export function resultsScreen(
  parent: HTMLElement,
  o: { outcome: BattleOutcome; champion?: boolean; hasNext: boolean; onNext: () => void; onRetry: () => void; onTitle: () => void; extra?: HTMLElement | null; backLabel?: string; retryLabel?: string },
) {
  const { outcome } = o;
  const bg = h('div', { class: 'modal-bg' });
  const btn = (label: string, fn: () => void, primary = false) => h('button', { class: `btn ${primary ? 'primary' : ''}`, onclick: () => (audio.playSfx('uiSelect'), bg.remove(), fn()) }, label);
  const mins = Math.floor(outcome.time / 60);
  const secs = Math.round(outcome.time % 60);
  bg.appendChild(
    h(
      'div',
      { class: 'results panel' },
      h('h2', { class: outcome.won ? 'win' : 'lose' }, outcome.won ? t('youWin') : t('youLose')),
      o.champion ? h('div', { style: 'font-size:20px;color:var(--gold);font-weight:800;margin-top:6px' }, '🏆 ', t('champion')) : null,
      o.extra ?? null,
      h('div', { class: 'team' }, outcome.finalSpecies.map((k) => h('img', { src: assetUrl(SPECIES[k].dex, 'frlg-front.png'), title: SPECIES[k].name }))),
      h(
        'table',
        null,
        h('tr', null, h('td', null, t('perfects')), h('td', null, String(outcome.perfects))),
        h('tr', null, h('td', null, t('evolutions')), h('td', null, String(outcome.evolutions))),
        h('tr', null, h('td', null, t('damage')), h('td', null, String(outcome.damage))),
        h('tr', null, h('td', null, t('duration')), h('td', null, `${mins}:${String(secs).padStart(2, '0')}`)),
      ),
      h('div', { class: 'btns' }, o.hasNext && outcome.won ? btn(t('next'), o.onNext, true) : null, !outcome.won ? btn(o.retryLabel ?? t('retry'), o.onRetry, true) : null, btn(o.backLabel ?? t('toTitle'), o.onTitle)),
    ),
  );
  parent.appendChild(bg);
}
