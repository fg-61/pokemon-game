import { h } from './dom';

/** Decorative layer for menu screens: vignette, drifting energy haze and rising sparks. */
export function menuFx(): HTMLElement {
  const fx = h('div', { class: 'menu-fx' }, h('div', { class: 'haze' }));
  for (let i = 0; i < 22; i++) {
    const hue = [45, 190, 200, 38, 280][i % 5];
    fx.appendChild(
      h('i', {
        class: 'spark',
        style: `left:${(Math.random() * 100).toFixed(1)}%;--hue:${hue};--s:${(2 + Math.random() * 4).toFixed(1)}px;animation-duration:${(7 + Math.random() * 9).toFixed(1)}s;animation-delay:-${(Math.random() * 12).toFixed(1)}s;--drift:${((Math.random() - 0.5) * 120).toFixed(0)}px`,
      }),
    );
  }
  return fx;
}
