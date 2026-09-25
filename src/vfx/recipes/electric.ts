import * as THREE from 'three';
import { registerMoveFx } from '../vfx';
import { contact } from './common';

registerMoveFx('THUNDERBOLT', async (c) => {
  const { vfx, pal } = c;
  vfx.shot('side', c.side, 400);
  c.attacker.setOutline(1.8, pal.main);
  vfx.burst(c.user, { count: 30, tex: 'spark', color: [pal.core, pal.main], speed: [2, 5], life: [0.2, 0.4], size: [0.15, 0.3] });
  await vfx.wait(350);
  c.attacker.setOutline(0);
  const to = c.aim(0.5);
  for (let i = 0; i < 3; i++) {
    vfx.prim.lightning(c.user, to, { color: pal.main, width: 0.14, jitter: 0.6, ms: 420 });
    await vfx.wait(70);
  }
  if (!c.missed) {
    vfx.hitSpark(to, pal, 1.2);
    c.target.flash(0xffff80, 300);
    c.stage.flash(0xfff4a0, 0.35, 200);
    vfx.shake(0.18, 300);
    c.impact(0);
    vfx.burst(to, { count: 40, tex: 'spark', color: [pal.core, pal.main], speed: [3, 8], life: [0.2, 0.5], size: [0.1, 0.3] });
  }
  await vfx.wait(450);
  vfx.shot('wide', c.side, 500);
});

registerMoveFx('THUNDER', async (c) => {
  const { vfx, pal } = c;
  vfx.shot('target', c.side, 500);
  c.stage.setTint(0x4050a0, 0.5, 400);
  await vfx.wait(450);
  const to = c.aim(0.5);
  const sky = to.clone().add(new THREE.Vector3(0.3, 12, -0.3));
  for (let i = 0; i < 2; i++) {
    vfx.prim.lightning(sky, c.missed ? to : c.foeFeet.clone().setY(0.4), { color: pal.main, width: 0.35, jitter: 1.2, segments: 22, ms: 500, intensity: 4 });
    await vfx.wait(90);
  }
  c.stage.flash(0xffffff, 0.9, 350);
  vfx.shake(0.45, 500);
  if (!c.missed) {
    vfx.hitSpark(to, pal, 1.8);
    c.impact(0);
  }
  vfx.prim.shockwave(c.foeFeet.clone().setY(0.4), { color: pal.main, radius: 4, facing: 'ground', ms: 600 });
  vfx.burst(c.foeFeet.clone().setY(0.5), { count: 60, tex: 'spark', color: [pal.core, pal.main], speed: [3, 10], life: [0.3, 0.7], dir: new THREE.Vector3(0, 1, 0), spread: 1.2 });
  await vfx.wait(500);
  await c.stage.setTint(0xffffff, 0, 400);
  vfx.shot('wide', c.side, 500);
});

registerMoveFx('THUNDER_PUNCH', (c) =>
  contact(c, {
    spark: 1.2,
    tex: 'spark',
    onHit: (_i, at) => {
      c.vfx.prim.lightning(at.clone().add(new THREE.Vector3(0, 2.5, 0)), at, { color: c.pal.main, width: 0.12, ms: 300 });
      c.stage.flash(0xfff4a0, 0.25, 150);
    },
  }),
);
