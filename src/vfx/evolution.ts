import * as THREE from 'three';
import type { Side } from '../battle/types';
import { ease } from '../render/clock';
import { loadSheet, type PokemonSprite } from '../render/pokemonSprite';
import { evolveShot } from '../render/shots';
import type { Vfx } from './vfx';

/**
 * The evolution cinematic: energy converges, the silhouette flickers between the old and new
 * forms faster and faster (like the handheld games), then bursts into the new form.
 * `onReveal` fires at the burst so the HUD can swap names / HP bars in sync.
 */
export async function playEvolutionFx(vfx: Vfx, sprite: PokemonSprite, side: Side, newDex: number, onReveal?: () => void) {
  const { stage } = vfx;
  const oldDex = sprite.dex;
  await loadSheet(newDex, sprite.facing); // preload so the flicker never stalls
  const feet = sprite.at(0);
  const center = sprite.at(0.5);
  const gold = 0xffe9a0;
  const cyan = 0x9ae8ff;

  stage.director.move(evolveShot(side), 0.8);
  const tint = stage.setTint(0x6070b0, 0.45, 600);
  sprite.setOutline(2, cyan);

  // 1) gather
  const u = sprite.uniforms;
  (u.silColor.value as THREE.Color).setRGB(2.2, 2.2, 2.6);
  const sil = stage.tween(900, (k) => (u.silhouette.value = k), ease.inOutQuad);
  const ring = setIntervalGame(vfx, 260, () => vfx.prim.shockwave(feet.clone().setY(0.4), { color: cyan, radius: 0.3, startRadius: 2.6, facing: 'ground', ms: 500 }));
  const gather = vfx.spiral(feet, { color: [gold, cyan], tex: 'spark', ms: 2200, rate: 120, radius: 1.6, rise: 1.4, size: [0.15, 0.3] });
  vfx.burst(center, { count: 90, tex: 'glow', color: [cyan, gold], speed: 0.1, jitter: 4, attract: { to: center, strength: 14 }, life: [1.2, 1.8], size: [0.12, 0.25], fadeIn: 0.3 });
  await Promise.all([sil, tint]);
  const pillar = vfx.prim.pillar(feet, { color: cyan, radius: 1.3, height: 9, ms: 2600, intensity: 1.6 });

  // 2) flicker old <-> new, accelerating
  let interval = 260;
  let showNew = false;
  for (let i = 0; i < 14; i++) {
    showNew = !showNew;
    await sprite.load(showNew ? newDex : oldDex);
    sprite.scale = showNew ? 1.08 : 0.95;
    await vfx.wait(interval);
    interval = Math.max(45, interval * 0.8);
  }
  await sprite.load(newDex);
  ring();

  // 3) burst
  stage.flash(0xffffff, 1.2, 600);
  stage.chromaPulse(0.03, 500);
  stage.shockwave(center, 1, 500);
  vfx.shake(0.35, 500);
  vfx.prim.shockwave(center, { color: gold, radius: 5, ms: 700, thickness: 0.4 });
  vfx.prim.shockwave(feet.clone().setY(0.4), { color: cyan, radius: 6, ms: 900, facing: 'ground' });
  vfx.burst(center, { count: 120, tex: 'star', color: [0xffffff, gold], speed: [3, 9], life: [0.6, 1.2], size: [0.15, 0.4], drag: 2 });
  vfx.burst(center, { count: 60, tex: 'spark', color: [0xffffff, cyan], speed: [6, 12], life: [0.3, 0.6], size: [0.2, 0.4], drag: 3 });
  onReveal?.();
  sprite.scale = 1.25;
  stage.tween(500, (k) => (sprite.scale = 1.25 - 0.25 * k), ease.outElastic);
  await stage.tween(700, (k) => (u.silhouette.value = 1 - k), ease.inQuad);
  sprite.setOutline(0);
  stage.setTint(0xffffff, 0, 500);
  vfx.burst(feet, { count: 40, tex: 'spark', color: [gold, cyan], speed: [1, 3], dir: new THREE.Vector3(0, 1, 0), spread: 0.6, life: [0.8, 1.4], size: [0.1, 0.22] });
  await Promise.all([gather, pillar.done]);
  await sprite.jump(0.5, 380);
}

/** setInterval on game time; returns a stop function. */
function setIntervalGame(vfx: Vfx, ms: number, fn: () => void): () => void {
  let acc = 0;
  fn();
  return vfx.stage.onUpdate((dt) => {
    acc += dt * 1000;
    if (acc >= ms) {
      acc -= ms;
      fn();
    }
  });
}
