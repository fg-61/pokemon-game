import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { during, impactFx, sideOf } from './common';

// rock-type move recipes

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ROCK = 0x8a7658;
const ROCK_LIGHT = 0xa89070;
const DUST = 0xa89878;
const ROCKPAL = { core: 0xfff0d0, main: 0xd0a860, dark: 0x5a4a2a };

/** Rocky crumble at a point (chips, pebbles, dust). */
function crumble(c: MoveFxContext, at: THREE.Vector3, k = 1) {
  const { vfx } = c;
  vfx.prim.debris({ from: at.clone(), count: Math.round(8 * k), color: ROCK, size: 0.11 * k, speed: 3.5 * k, up: 3.5, ms: 1000 });
  vfx.burst(at, { count: Math.round(12 * k), tex: 'rock', color: [ROCK_LIGHT, 0x5a4a38], speed: [2, 5 * k], size: [0.12, 0.26], life: [0.4, 0.7], gravity: 10, additive: false, alpha: [1, 0.7], spin: 8 });
  vfx.burst(at, { count: Math.round(8 * k), tex: 'smoke', color: DUST, speed: [0.8, 2.2], size: [0.6, 1], endSize: 1.8, life: [0.6, 0.9], additive: false, alpha: [0.55, 0], drag: 2 });
}

/** A boulder falls from the sky onto `to` (ground point); resolves on landing. */
async function fallBoulder(c: MoveFxContext, to: THREE.Vector3, size: number, ms = 360, height = 6) {
  const b = c.vfx.prim.boulder(to.clone().add(V(0, height, 0)), { color: ROCK, size });
  const from = b.mesh.position.clone();
  const spin = V(Math.random() * 6, Math.random() * 6, Math.random() * 6);
  const shadowAt = to.clone();
  c.vfx.particle({ tex: 'glow', pos: shadowAt.clone().setY(shadowAt.y + 0.05), life: ms / 1000, size: [0.2, size * 2.2], color: 0x000000, intensity: 1, additive: false, alpha: [0, 0.35] });
  await c.vfx.tween(ms, (k) => {
    b.mesh.position.lerpVectors(from, to, k);
    b.mesh.rotation.set(spin.x * k, spin.y * k, spin.z * k);
  }, ease.inQuad);
  return b;
}

registerMoveFx('ROCK_THROW', async (c) => {
  const { vfx } = c;
  // a boulder is wrenched from the ground in front of the user and hoisted...
  const lift = c.user.clone().addScaledVector(c.dir, 0.8).add(V(0, 0.9, 0));
  const ground = lift.clone().setY(c.userFeet.y - 0.3);
  const b = vfx.prim.boulder(ground, { color: ROCK, size: 0.42 });
  crumble(c, ground.clone().setY(c.userFeet.y + 0.1), 0.6);
  await vfx.tween(320, (k) => {
    b.mesh.position.lerpVectors(ground, lift, ease.outBack(k));
    b.mesh.rotation.y = k * 2;
  }, ease.linear);
  await vfx.wait(120);
  // ...and hurled in an arc
  const to = c.aim(0.5);
  const from = b.mesh.position.clone();
  const mid = from.clone().lerp(to, 0.5).add(V(0, 1.6, 0));
  const trail = vfx.trail(() => b.mesh.position, 420, { tex: 'smoke', color: DUST, size: [0.3, 0.5], endSize: 0.9, life: 0.4, speed: 0.2, rate: 40, additive: false, alpha: [0.4, 0] });
  await vfx.tween(420, (k) => {
    const a = from.clone().lerp(mid, k);
    b.mesh.position.copy(a.lerp(mid.clone().lerp(to, k), k));
    b.mesh.rotation.x += 0.25;
    b.mesh.rotation.z += 0.15;
  }, ease.inQuad);
  b.dispose();
  crumble(c, to, 1.1);
  if (c.missed) vfx.dust(c.foeFeet.clone().addScaledVector(sideOf(c.dir), 1.4), DUST, 10);
  else {
    impactFx(c, to, { strength: 1.0, pal: ROCKPAL, dust: DUST });
    c.impact(0);
  }
  await trail;
  await vfx.wait(420);
});

registerMoveFx('ROCK_BLAST', async (c) => {
  const { vfx } = c;
  const n = Math.max(1, c.hits);
  const muzzle = c.user.clone().addScaledVector(c.dir, 0.7).add(V(0, 0.2, 0));
  c.attacker.setOutline(1.2, 0xd0a860);
  vfx.burst(muzzle, { count: 10, tex: 'rock', color: [ROCK_LIGHT, 0x5a4a38], speed: 0.1, jitter: 1.2, attract: { to: muzzle, strength: 14 }, life: 0.35, size: [0.15, 0.25], additive: false });
  await vfx.wait(260);
  c.attacker.setOutline(0);
  const flights: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    const to = c.aim(0.45 + (Math.random() - 0.5) * 0.25).add(sideOf(c.dir).multiplyScalar((Math.random() - 0.5) * 0.5));
    const b = vfx.prim.boulder(muzzle, { color: ROCK, size: 0.3, emissive: 0.25 });
    vfx.burst(muzzle, { count: 6, tex: 'smoke', color: DUST, speed: [1, 2], size: [0.4, 0.6], endSize: 1.1, life: 0.4, additive: false, alpha: [0.5, 0] });
    vfx.prim.shockwave(muzzle, { color: 0xe8c890, radius: 0.9, ms: 200, facing: c.dir, thickness: 0.2 });
    const trail = vfx.trail(() => b.mesh.position, 260, { tex: 'streak', color: [0xffe0b0, 0xc09050], size: [0.4, 0.6], life: 0.12, speed: 0.1, rate: 60, intensity: 1.2 });
    const fly = vfx
      .tween(260, (k) => {
        b.mesh.position.lerpVectors(muzzle, to, k).add(V(0, Math.sin(k * Math.PI) * 0.35, 0));
        b.mesh.rotation.x += 0.4;
        b.mesh.rotation.y += 0.3;
      }, ease.inQuad)
      .then(() => {
        b.dispose();
        crumble(c, to, 0.8);
        if (!c.missed) {
          impactFx(c, to, { strength: 0.75, pal: ROCKPAL, dust: DUST, ground: i === n - 1 });
          c.impact(i);
        }
      });
    flights.push(fly, trail);
    c.attacker.shake(0.05, 0.12);
    await vfx.wait(280);
  }
  await Promise.all(flights);
  await vfx.wait(420);
});

registerMoveFx('ROCK_SLIDE', async (c) => {
  const { vfx } = c;
  vfx.shot('target', c.side, 450);
  // rumbling: pebbles trickle from above, then the slide pours down
  vfx.shake(0.1, 1300);
  const center = c.missed ? c.aim(0).setY(c.foeFeet.y) : c.foeFeet.clone();
  vfx.rain(center.clone().add(V(0, 0.2, 0)), { tex: 'rock', color: [ROCK_LIGHT, 0x6a5a48], ms: 1100, rate: 26, height: 6, radius: 1.8, fall: 11, size: [0.12, 0.24], additive: false, alpha: [1, 1] });
  await vfx.wait(250);
  const drops: Promise<unknown>[] = [];
  const N = 8;
  let hit = false;
  for (let i = 0; i < N; i++) {
    const r = i === 3 ? 0.2 : 0.6 + Math.random() * 1.2;
    const a = Math.random() * Math.PI * 2;
    const to = center.clone().add(V(Math.cos(a) * r, 0.25, Math.sin(a) * r));
    const size = 0.28 + Math.random() * 0.25;
    drops.push(
      fallBoulder(c, to, size, 340 + Math.random() * 80, 6 + Math.random() * 2).then((b) => {
        crumble(c, to, 0.7 + size);
        vfx.shake(0.18, 200);
        vfx.prim.shockwave(to.clone().setY(c.foeFeet.y + 0.05), { color: 0xc8b090, radius: 1.2, facing: 'ground', ms: 300, intensity: 1 });
        void vfx.tween(260, (k) => b.mesh.scale.setScalar(size * (1 - k)), ease.inQuad).then(() => b.dispose());
        if (!hit && !c.missed && i >= 3) {
          hit = true;
          impactFx(c, c.aim(0.5), { strength: 1.1, pal: ROCKPAL, dust: DUST });
          c.impact(0);
        }
      }),
    );
    await vfx.wait(90);
  }
  await Promise.all(drops);
  await vfx.wait(350);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(200);
});

registerMoveFx('ROCK_TOMB', async (c) => {
  const { vfx } = c;
  vfx.shot('target', c.side, 450);
  await vfx.wait(250);
  const center = c.missed ? c.aim(0).setY(c.foeFeet.y) : c.foeFeet.clone();
  const R = Math.max(0.9, c.target.width * 0.55);
  const N = 5;
  const tomb: { dispose: () => void; mesh: THREE.Mesh }[] = [];
  const a0 = Math.random() * Math.PI;
  for (let i = 0; i < N; i++) {
    const a = a0 + (i / N) * Math.PI * 2;
    const to = center.clone().add(V(Math.cos(a) * R, 0.45, Math.sin(a) * R));
    const b = await fallBoulder(c, to, 0.5 + Math.random() * 0.12, 260, 6);
    tomb.push(b);
    crumble(c, to.clone().setY(center.y + 0.2), 0.9);
    vfx.shake(0.22, 180);
    vfx.prim.shockwave(to.clone().setY(center.y + 0.05), { color: 0xc8b090, radius: 1.4, facing: 'ground', ms: 320, intensity: 1 });
    if (i === 2 && !c.missed) {
      impactFx(c, c.aim(0.4), { strength: 1.0, pal: ROCKPAL, dust: DUST });
      c.impact(0);
    }
  }
  // sealed in: the stones settle with a heavy thud, then crumble away
  vfx.prim.crack(center, { radius: R * 1.6, ms: 1000 });
  vfx.dust(center, DUST, 16);
  vfx.shake(0.3, 300);
  await vfx.wait(500);
  await during(c, 300, (k) => tomb.forEach((b) => b.mesh.position.setY(b.mesh.position.y - 0.02 * k)));
  tomb.forEach((b) => crumble(c, b.mesh.position, 0.5));
  await vfx.tween(220, (k) => tomb.forEach((b) => b.mesh.scale.multiplyScalar(1 - 0.25 * k)), ease.inQuad);
  tomb.forEach((b) => b.dispose());
  vfx.shot('wide', c.side, 500);
  await vfx.wait(300);
});
