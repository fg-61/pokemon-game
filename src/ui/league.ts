import { audio } from '../audio/audio';
import { SPECIES } from '../data/gamedata';
import { ROSTER } from '../data/roster';
import { champion, ELITE_FOUR, GYMS, gymOpen, leagueOpen, type BadgeShape, type LeagueProgress, type LeagueStop } from '../game/league';
import { assetUrl } from '../render/pokemonSprite';
import { h } from './dom';
import { iconUrl, typeBadge } from './hud';
import { t } from './i18n';

const NS = 'http://www.w3.org/2000/svg';
const trainerPic = (st: LeagueStop) => `assets/trainers/${st.pic}.png`;

function svgEl(tag: string, attrs: Record<string, string | number>) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

const star = (n: number, r1: number, r2: number) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');

/** A FireRed gym badge drawn as a small SVG (earned = full colour with a shine, otherwise a dark silhouette). */
export function badgeSvg(shape: BadgeShape, color: string, earned: boolean, size = 44): SVGSVGElement {
  const svg = svgEl('svg', { viewBox: '-50 -50 100 100', width: size, height: size, class: `badge ${earned ? 'earned' : ''}` }) as SVGSVGElement;
  const fill = earned ? color : '#2a3350';
  const line = earned ? 'rgba(0,0,0,0.55)' : '#465274';
  const common = { fill, stroke: line, 'stroke-width': 5, 'stroke-linejoin': 'round' };
  const add = (tag: string, a: Record<string, string | number>) => svg.appendChild(svgEl(tag, { ...common, ...a }));
  switch (shape) {
    case 'octagon':
      add('polygon', { points: star(4, 40, 40) });
      add('polygon', { points: star(4, 22, 22), fill: earned ? '#d6d8e0' : '#323c5c', 'stroke-width': 3 });
      break;
    case 'drop':
      add('path', { d: 'M0,-42 C18,-16 32,0 32,14 A32,32 0 1 1 -32,14 C-32,0 -18,-16 0,-42Z' });
      break;
    case 'sun':
      add('polygon', { points: star(8, 42, 26) });
      add('circle', { r: 15, fill: earned ? '#ffe28a' : '#323c5c', 'stroke-width': 3 });
      break;
    case 'flower':
      ['#ff6a6a', '#ffb44a', '#ffe95a', '#6ad46a', '#5aa8ff', '#b46aff'].forEach((c, i) => {
        const a = (i / 6) * Math.PI * 2;
        add('circle', { cx: Math.cos(a) * 22, cy: Math.sin(a) * 22, r: 17, fill: earned ? c : '#2a3350', 'stroke-width': 3 });
      });
      add('circle', { r: 13, fill: earned ? '#fff4c0' : '#323c5c', 'stroke-width': 3 });
      break;
    case 'heart':
      add('path', { d: 'M0,38 C-40,10 -44,-18 -26,-32 C-14,-40 -2,-34 0,-22 C2,-34 14,-40 26,-32 C44,-18 40,10 0,38Z' });
      break;
    case 'ring':
      add('circle', { r: 36 });
      add('circle', { r: 17, fill: earned ? '#fff1b8' : '#323c5c', 'stroke-width': 3 });
      break;
    case 'flame':
      add('path', { d: 'M0,-44 C14,-22 34,-12 30,12 C28,32 14,42 0,42 C-16,42 -30,32 -30,12 C-30,-6 -16,-10 -12,-24 C-6,-14 -2,-12 0,-44Z' });
      add('path', { d: 'M0,-4 C8,8 14,16 12,26 C10,34 4,38 0,38 C-6,38 -12,32 -12,24 C-12,14 -4,10 0,-4Z', fill: earned ? '#ffd24a' : '#323c5c', 'stroke-width': 3 });
      break;
    case 'leaf':
      add('path', { d: 'M-36,36 C-40,-10 -6,-40 40,-40 C40,6 10,40 -36,36Z' });
      add('path', { d: 'M-30,30 L26,-26', fill: 'none', 'stroke-width': 3 });
      break;
  }
  if (earned) svg.appendChild(svgEl('ellipse', { cx: -12, cy: -18, rx: 14, ry: 7, fill: 'rgba(255,255,255,0.45)', transform: 'rotate(-30)' }));
  return svg;
}

export function badgeCase(p: LeagueProgress, size = 44) {
  return h(
    'div',
    { class: 'badge-case' },
    GYMS.map((g) => {
      const el = h('div', { class: 'badge-slot', title: g.badge!.name });
      el.appendChild(badgeSvg(g.badge!.shape, g.badge!.color, p.badges.includes(g.id), size));
      return el;
    }),
  );
}

/** Icons of a stop's FireRed picks (their real party members; in battle they start from the line's first stage). */
const teamIcons = (st: LeagueStop) => h('div', { class: 'team-icons' }, st.species.map((sp) => h('img', { src: iconUrl(sp), title: SPECIES[sp].name })));

export function leagueScreen(parent: HTMLElement, o: { progress: LeagueProgress; onGym: (g: LeagueStop) => void; onLeague: () => void; onBack: () => void }) {
  const p = o.progress;
  const root = h('div', { class: 'screen league-screen' });
  const leave = (fn: () => void) => {
    removeEventListener('keydown', onKey);
    root.remove();
    fn();
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (audio.playSfx('uiBack'), leave(o.onBack));
  addEventListener('keydown', onKey);

  const gymCard = (g: LeagueStop, i: number) => {
    const beaten = p.badges.includes(g.id);
    const open = gymOpen(p, g);
    const state = beaten ? 'beaten' : open ? 'next' : 'locked';
    return h(
      'div',
      {
        class: `gym-card ${state}`,
        onclick: () => {
          if (!open) return audio.playSfx('uiError');
          audio.playSfx('uiSelect');
          leave(() => o.onGym(g));
        },
        onmouseenter: () => open && audio.playSfx('uiHover', { volume: 0.25 }),
      },
      h('div', { class: 'num' }, String(i + 1)),
      h('img', { class: 'pic', src: trainerPic(g), alt: g.name }),
      h(
        'div',
        { class: 'info' },
        h('div', { class: 'who' }, h('small', null, t('gymLeader')), h('b', null, g.name)),
        h('div', { class: 'city' }, g.city),
        h('div', { class: 'row' }, typeBadge(g.type), h('span', { class: 'badge-name' }, badgeSvg(g.badge!.shape, g.badge!.color, beaten, 20), g.badge!.name)),
        teamIcons(g),
      ),
      h('div', { class: 'state' }, beaten ? `✓ ${t('rematch')}` : open ? t('challenge') : `🔒 ${t('locked')}`),
    );
  };

  const hof = p.hallOfFame[0];
  const canLeague = leagueOpen(p);
  const blue = champion([]);
  const e4 = h(
    'div',
    { class: `panel elite ${canLeague ? 'open' : ''}` },
    h(
      'div',
      { class: 'elite-head' },
      h('h3', null, t('pokemonLeague'), h('small', null, ' · Indigo Plateau')),
      h('p', null, t('leagueRunHint')),
      hof ? h('div', { class: 'hof-line' }, `🏆 ${t('hofEntries', p.hallOfFame.length)} · `, ...hof.lines.map((id) => h('img', { src: iconUrl(finalOf(id)) }))) : null,
    ),
    h(
      'div',
      { class: 'elite-row' },
      [...ELITE_FOUR, blue].map((st) =>
        h(
          'div',
          { class: `elite-card ${st.kind}` },
          h('img', { class: 'pic', src: trainerPic(st), alt: st.name }),
          h('small', null, st.kind === 'champion' ? t('championTitle') : t('eliteFour')),
          h('b', null, st.name),
          st.kind === 'champion' ? h('div', { class: 'type-q' }, '?') : typeBadge(st.type),
        ),
      ),
    ),
    h(
      'button',
      {
        class: `btn ${canLeague ? 'primary' : ''}`,
        disabled: !canLeague,
        onclick: () => {
          audio.playSfx('uiSelect');
          leave(o.onLeague);
        },
      },
      canLeague ? t('enterLeague') : `🔒 ${t('needBadges')}`,
    ),
  );

  root.append(
    h(
      'div',
      { class: 'select-head' },
      h('div', null, h('h2', null, t('league')), h('p', null, t('leagueHint'))),
      h('div', { class: 'head-right' }, h('div', { class: 'badge-box' }, h('small', null, t('badgeCount', p.badges.length)), badgeCase(p, 34)), h('button', { class: 'btn', onclick: () => (audio.playSfx('uiBack'), leave(o.onBack)) }, t('back'))),
    ),
    h('div', { class: 'gym-grid' }, GYMS.map(gymCard)),
    e4,
  );
  parent.appendChild(root);
}

const finalOf = (lineId: string) => {
  const l = ROSTER.find((x) => x.id === lineId);
  return l ? l.stages[l.stages.length - 1].species : 'MISSINGNO';
};

/** Small banner for the results screen when a badge is won. */
export function badgeEarnedEl(g: LeagueStop) {
  return h('div', { class: 'badge-earned' }, badgeSvg(g.badge!.shape, g.badge!.color, true, 64), h('div', null, t('badgeEarned', g.badge!.name)));
}

/** Hall of Fame: the champion team's artwork, confetti and the title count. Resolves when dismissed. */
export function hallOfFame(parent: HTMLElement, o: { species: string[]; entries: number }): Promise<void> {
  return new Promise((resolve) => {
    audio.playMusic('victory');
    const confetti = h('div', { class: 'confetti' });
    const colors = ['#ffd35a', '#ff6a8a', '#58e1ff', '#4ef08a', '#b58aff', '#ffffff'];
    for (let i = 0; i < 70; i++)
      confetti.appendChild(
        h('i', { style: `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 3).toFixed(2)}s;animation-duration:${(3 + Math.random() * 3).toFixed(2)}s;transform:rotate(${Math.round(Math.random() * 360)}deg)` }),
      );
    const root = h(
      'div',
      { class: 'screen hof-screen' },
      confetti,
      h('h1', null, t('hallOfFame')),
      h('p', { class: 'congrats' }, t('hofCongrats')),
      h(
        'div',
        { class: 'hof-team' },
        o.species.map((sp, i) =>
          h('div', { class: 'hof-mon', style: `animation-delay:${0.3 + i * 0.35}s` }, h('img', { src: assetUrl(SPECIES[sp].dex, 'artwork.png'), alt: SPECIES[sp].name }), h('b', null, SPECIES[sp].name)),
        ),
      ),
      h('p', { class: 'entries' }, `🏆 ${t('hofEntries', o.entries)}`),
      h(
        'button',
        {
          class: 'btn primary',
          onclick: () => {
            audio.playSfx('uiSelect');
            root.remove();
            resolve();
          },
        },
        t('continueBtn'),
      ),
    );
    parent.appendChild(root);
    o.species.forEach((sp, i) => setTimeout(() => audio.playCry(SPECIES[sp].dex, { volume: 0.6 }), 500 + i * 350));
  });
}
