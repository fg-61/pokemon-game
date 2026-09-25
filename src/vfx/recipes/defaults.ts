import type { MoveFxContext } from '../vfx';
import { aura, cloud, contact, projectile } from './common';

/**
 * Fallback recipe for any move without a dedicated one. Picks a style from category / flags / target.
 */
export async function defaultRecipe(c: MoveFxContext) {
  const m = c.move;
  if (m.category === 'status') {
    if (m.target === 'USER' || m.target === 'DEPENDS') return aura(c, 'user', { down: false });
    await cloud(c, { tex: 'spark', color: [c.pal.core, c.pal.main], ms: 500 });
    return aura(c, 'foe', { down: true, ms: 500 });
  }
  if (m.flags.includes('MAKES_CONTACT')) return contact(c, { spark: 0.6 + c.power * 0.8 });
  return projectile(c, { radius: 0.2 + c.power * 0.25, ms: 420, spark: 0.7 + c.power * 0.7 });
}

/** Generic first turn of a two-turn move: the user gathers energy of the move's type. */
export async function defaultChargeRecipe(c: MoveFxContext) {
  const { vfx, pal } = c;
  vfx.shot('attacker', c.side, 400);
  c.attacker.setOutline(1.5, pal.main);
  vfx.burst(c.user, { count: 50, tex: 'spark', color: [pal.core, pal.main], speed: 0.1, jitter: 2, attract: { to: c.user, strength: 16 }, life: [0.5, 0.8], size: [0.1, 0.25] });
  await vfx.spiral(c.userFeet, { color: [pal.main, pal.core], ms: 800, radius: 1.1 });
  c.attacker.setOutline(0);
  vfx.shot('wide', c.side, 500);
}
