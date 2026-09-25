import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { during, impactFx, sideOf } from './common';

// ground-type move recipes

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const SAND = 0xd8b878;
const DIRT = 0x8a6a44;
const DUST = 0xb09870;
const GROUNDPAL = { core: 0xfff0c0, main: 0xe0a850, dark: 0x6a4a20 };

/** Dirt eruption at a ground point: column of earth, clods, dust. */
function eruption(c: MoveFxContext, at: THREE.Vector3, k = 1) {
  const { vfx } = c;
  vfx.burst(at.clone().add(V(0, 0.2, 0)), { count: Math.round(26 * k), tex: 'smoke', color: [0xb8986a, 0x6a5034], speed: [3, 8 * k], dir: UP, spread: 0.45, size: [0.6, 1.1], endSize: 1.9, life: [0.6, 1], gravity: 7, drag: 1, additive: false, alpha: [0.85, 0] });
  vfx.burst(at.clone().add(V(0, 0.2, 0)), { count: Math.round(22 * k), tex: 'rock', color: [0xa88a60, 0x5a4428], speed: [4, 9 * k], dir: UP, spread: 0.7, size: [0.12, 0.28], life: [0.6, 1], gravity: 14, additive: false, alpha: [1, 0.8], spin: 8 });
  vfx.prim.debris({ from: at.clone().add(V(0, 0.15, 0)), count: Math.round(10 * k), color: DIRT, size: 0.13, speed: 3, up: 6 * k, ms: 1200 });
  vfx.dust(at, DUST, Math.round(14 * k));
}

registerMoveFx('SAND_ATTACK', async (c) => {
  const { vfx } = c;
  const to = c.aim(0.72);
  for (let i = 0; i < 2; i++) {
    // a sharp kick that flings a fan of sand at the target's face
    void c.attacker.lunge(c.foe, 0.5, 220);
    await vfx.wait(120);
    const from = c.userFeet.clone().add(V(0, 0.25, 0)).addScaledVector(c.dir, 0.5);
    vfx.dust(c.userFeet, DUST, 8);
    void vfx.stream(from, to.clone().add(V(0, 0.55, 0)), { tex: 'dot', color: [0xf0d8a0, 0xa07840], ms: 260, rate: 260, travel: 0.42, spread: 0.14, size: [0.1, 0.18], endSize: 0.12, gravity: 5, additive: false, alpha: [1, 0.8], intensity: 1.1 });
    void vfx.stream(from, to.clone().add(V(0, 0.4, 0)), { tex: 'smoke', color: [SAND, 0x9a7440], ms: 260, rate: 70, travel: 0.5, spread: 0.12, size: [0.5, 0.7], endSize: 1.6, gravity: 3, additive: false, alpha: [0.75, 0], intensity: 1 });
    await vfx.wait(240);
  }
  await vfx.wait(200);
  // the face full of sand
  vfx.burst(to, { count: 26, tex: 'smoke', color: [SAND, 0x9a7440], speed: [1, 2.6], size: [0.7, 1.1], endSize: 2.2, life: [0.7, 1.1], drag: 2, additive: false, alpha: [0.85, 0] });
  vfx.burst(to, { count: 40, tex: 'dot', color: [0xf0d8a0, 0xa07840], speed: [1, 3.5], size: [0.1, 0.16], life: [0.5, 0.9], gravity: 5, additive: false });
  if (!c.missed) {
    c.target.flash(0xd8b070, 400, 0.55);
    c.target.shake(0.06, 0.4);
    c.impact(0);
  }
  await vfx.wait(600);
});

registerMoveFx('EARTHQUAKE', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 500);
  // the user rears up...
  await vfx.wait(150);
  await c.attacker.jump(0.9, 360);
  // ...and STOMPS
  vfx.shake(0.55, 1500);
  stage.chromaPulse(0.01, 400);
  stage.shockwave(c.userFeet, 0.9, 400);
  vfx.prim.crack(c.userFeet, { radius: 2, ms: 1500, glow: 0xff9a40, glowIntensity: 1.5 });
  eruption(c, c.userFeet, 0.6);
  const ground = (p: THREE.Vector3) => p.clone().setY(p.y + 0.06);
  for (let i = 0; i < 3; i++) vfx.prim.shockwave(ground(c.userFeet), { color: i ? 0xc89850 : 0xffe0a0, radius: 3 + i * 2.5, facing: 'ground', ms: 600 + i * 200, thickness: 0.22, intensity: 0.9 });
  // the tremor travels across the field: dirt spurts and rock chunks leap along the path
  const from = c.userFeet.clone();
  const to = c.missed ? c.aim(0).setY(c.foeFeet.y) : c.foeFeet.clone();
  const side = sideOf(c.dir);
  let last = 0;
  let bounced = false;
  const bounce = async () => {
    if (!c.missed) {
      impactFx(c, c.aim(0.35), { strength: 1.3, pal: GROUNDPAL, dust: DUST });
      c.impact(0);
    }
    vfx.prim.crack(to, { radius: 2.2, ms: 1300, glow: 0xff9a40, glowIntensity: 1.3 });
    eruption(c, to, 0.9);
    // rock spikes jut up around the target
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const p = to.clone().add(V(Math.cos(a) * 1.2, -0.5, Math.sin(a) * 1.2));
      const b = vfx.prim.boulder(p, { color: 0x7a6448, size: 0.35 });
      b.mesh.scale.set(0.3, 0.7, 0.3);
      void vfx
        .tween(700, (k) => (b.mesh.position.y = p.y + Math.sin(Math.min(1, k * 2.2) * Math.PI * 0.5) * 0.7 - Math.max(0, k - 0.6) * 2), ease.linear)
        .then(() => b.dispose());
    }
    if (!c.missed) {
      await c.target.jump(0.5, 260);
      await c.target.jump(0.25, 200);
    }
  };
  let bouncing: Promise<void> = Promise.resolve();
  await during(c, 520, (k) => {
    while (last < k) {
      last += 0.1;
      const p = from.clone().lerp(to, Math.min(1, last)).addScaledVector(side, (Math.random() - 0.5) * 0.8);
      p.y = Math.max(0, THREE.MathUtils.lerp(from.y, to.y, last)) + 0.02;
      vfx.burst(p, { count: 5, tex: 'smoke', color: [0xb8986a, 0x7a5a3a], speed: [1.5, 3.5], dir: UP, spread: 0.6, size: [0.5, 0.8], endSize: 1.5, life: [0.5, 0.8], gravity: 3, additive: false, alpha: [0.7, 0] });
      vfx.burst(p, { count: 4, tex: 'rock', color: [0xa88a60, 0x5a4428], speed: [3, 5], dir: UP, spread: 0.5, size: [0.12, 0.22], life: 0.6, gravity: 14, additive: false, spin: 8 });
      vfx.prim.shockwave(p, { color: 0xd8b070, radius: 1.1, facing: 'ground', ms: 300, intensity: 1 });
    }
    if (k >= 1 && !bounced) {
      bounced = true;
      bouncing = bounce();
    }
  });
  if (!bounced) bouncing = bounce();
  await bouncing;
  await vfx.wait(500);
  vfx.shot('wide', c.side, 600);
  await vfx.wait(250);
});

registerMoveFx('DIG', async (c) => {
  const { vfx } = c;
  const a = c.attacker;
  const depth = a.height + 0.4;
  if (c.phase === 'charge') {
    vfx.shot('attacker', c.side, 450);
    await vfx.wait(200);
    // claws into the ground: dust plume and flying clods while the user sinks out of sight
    vfx.prim.crack(c.userFeet, { radius: 1.4, ms: 1400, color: 0x2a1a0c });
    a.shake(0.06, 0.8);
    const dig = during(c, 800, () => {
      vfx.burst(c.userFeet.clone().add(V(0, 0.25, 0)), { count: 2, tex: 'smoke', color: [0xb8986a, 0x6a5034], speed: [2, 4], dir: UP, spread: 0.8, size: [0.5, 0.8], endSize: 1.6, life: [0.5, 0.8], gravity: 4, additive: false, alpha: [0.75, 0] });
      vfx.burst(c.userFeet.clone().add(V(0, 0.25, 0)), { count: 2, tex: 'rock', color: [0xa88a60, 0x5a4428], speed: [3, 6], dir: UP, spread: 0.8, size: [0.1, 0.2], life: 0.7, gravity: 14, additive: false, spin: 8 });
    });
    vfx.prim.debris({ from: c.userFeet.clone().add(V(0, 0.2, 0)), count: 8, color: DIRT, size: 0.12, speed: 2.5, up: 5, ms: 1100 });
    await vfx.tween(800, (k) => (a.body.position.y = -depth * k), ease.inQuad);
    await dig;
    a.group.visible = false;
    vfx.dust(c.userFeet, DUST, 16);
    await vfx.wait(350);
    vfx.shot('wide', c.side, 500);
    await vfx.wait(150);
    return;
  }
  // strike: the user is underground (hidden by the charge turn; hide it here too if it wasn't)
  if (a.group.visible) {
    vfx.dust(c.userFeet, DUST, 10);
    a.group.visible = false;
  }
  // the ground under the target trembles and bursts open
  vfx.shot('target', c.side, 450);
  const spot = c.missed ? c.aim(0).setY(c.foeFeet.y) : c.foeFeet.clone();
  const burstAt = spot.clone().addScaledVector(c.dir, -0.85);
  vfx.shake(0.12, 600);
  vfx.prim.crack(burstAt, { radius: 1.6, ms: 1300, glow: 0xffb050, glowIntensity: 1.2 });
  await during(c, 520, () => {
    if (Math.random() < 0.6) vfx.burst(burstAt.clone().add(V((Math.random() - 0.5) * 1.2, 0.1, (Math.random() - 0.5) * 1.2)), { count: 1, tex: 'smoke', color: DUST, speed: [0.5, 1.5], dir: UP, spread: 0.5, size: [0.4, 0.6], endSize: 1, life: 0.5, additive: false, alpha: [0.5, 0] });
  });
  // the user erupts from below
  const off = burstAt.clone().sub(c.userFeet);
  off.y = 0;
  a.body.position.set(off.x, -depth, off.z);
  a.group.visible = true;
  eruption(c, burstAt, 1.2);
  vfx.shake(0.4, 400);
  c.stage.shockwave(burstAt, 0.8, 300);
  const rise = vfx.tween(260, (k) => (a.body.position.y = -depth + (depth + 0.8) * k), ease.outCubic);
  await vfx.wait(150);
  if (!c.missed) {
    impactFx(c, c.aim(0.45), { strength: 1.2, pal: GROUNDPAL, dust: DUST, stop: true });
    c.impact(0);
  }
  await rise;
  // arc back home to its own platform
  const start = a.body.position.clone();
  await vfx.tween(520, (k) => {
    a.body.position.set(start.x * (1 - k), THREE.MathUtils.lerp(start.y, 0, k) + Math.sin(k * Math.PI) * 1.4, start.z * (1 - k));
  }, ease.inOutQuad);
  a.body.position.set(0, 0, 0);
  a.group.visible = true;
  vfx.dust(c.userFeet, DUST, 12);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(350);
});
