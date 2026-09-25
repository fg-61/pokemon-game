import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { camBasis, during, hitStop, impactFx, rush, sideOf, speedLines, strokePoints, towardCam } from './common';

// fighting-type move recipes

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** hot orange-red fighting palette, a slightly brighter variant for slashes */
const FIGHT = { core: 0xfff0d8, main: 0xff6a2a, dark: 0x7a1a10 };
const CHOP = 0xffa050;

function whiff(c: MoveFxContext, at = c.aim(0.5)) {
  c.vfx.burst(at, { count: 8, tex: 'streak', color: 0xffe0c0, speed: [4, 7], size: [0.4, 0.7], life: 0.18, dir: c.dir, spread: 0.5, intensity: 1.2 });
  c.vfx.dust(c.foeFeet.clone().addScaledVector(sideOf(c.dir), 1.4), 0xa89878, 6);
}

/** Karate-chop stroke through `at` at an on-screen angle, returns when it lands. */
function chop(c: MoveFxContext, at: THREE.Vector3, angle: number, o: { len?: number; width?: number; bend?: number; ms?: number; color?: number } = {}) {
  const r = c.vfx.prim.ribbon(strokePoints(c, at, angle, o.len ?? 2.6, o.bend ?? 0.25, 9), {
    color: o.color ?? CHOP,
    core: 0xfff4e0,
    width: o.width ?? 0.13,
    ms: o.ms ?? 110,
    length: 0.85,
    holdMs: 80,
    fadeMs: 220,
    e: ease.inQuad,
  });
  // motion blur fan behind the blade
  c.vfx.prim.ribbon(strokePoints(c, at, angle, (o.len ?? 2.6) * 0.9, (o.bend ?? 0.25) + 0.3, 9), { color: FIGHT.main, core: CHOP, width: (o.width ?? 0.13) * 0.6, ms: o.ms ?? 110, length: 0.6, fadeMs: 160, opacity: 0.5, e: ease.inQuad });
  return r.arrived;
}

/** Fist-sized burst of red-orange power (charging hands, BULK UP pulses). */
function powerGlow(c: MoveFxContext, at: THREE.Vector3, size = 1) {
  c.vfx.particle({ tex: 'glow', pos: at.clone(), life: 0.3, size: [0.4 * size, 1.2 * size], color: FIGHT.main, intensity: 2, alpha: [0.9, 0] });
}

registerMoveFx('KARATE_CHOP', async (c) => {
  const { vfx } = c;
  c.attacker.setOutline(1.2, CHOP);
  await vfx.wait(120);
  await rush(c, { ms: 320 });
  c.attacker.setOutline(0);
  const at = c.aim(0.55);
  await chop(c, at, -1.25, { len: 2.4 });
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.0, pal: FIGHT, stop: true, ground: false });
    vfx.burst(towardCam(c, at, 0.6), { count: 8, tex: 'star', color: [0xffffff, 0xffe080], speed: [2, 4], size: [0.12, 0.25], life: [0.3, 0.5], spin: 6 });
    c.impact(0);
  }
  await vfx.wait(480);
});

registerMoveFx('CROSS_CHOP', async (c) => {
  const { vfx, stage } = c;
  c.attacker.setOutline(1.5, CHOP);
  powerGlow(c, c.attacker.at(0.8), 1.2);
  await vfx.wait(200);
  await rush(c, { ms: 340, ghosts: 2, ghostColor: 0xffa060 });
  c.attacker.setOutline(0);
  const at = c.aim(0.55);
  const a = chop(c, at, -0.85, { len: 2.9, bend: 0.2 });
  await vfx.wait(60);
  const b = chop(c, at, Math.PI + 0.85, { len: 2.9, bend: -0.2 });
  await Promise.all([a, b]);
  if (c.missed) whiff(c, at);
  else {
    // the X flares where the blades crossed
    const p = towardCam(c, at, 0.8);
    vfx.prim.impactStar(p, { color: FIGHT.main, core: 0xfff4e0, size: 1.2, ms: 320, spikes: 8 });
    impactFx(c, at, { strength: 1.4, pal: FIGHT, stop: true });
    stage.flash(0xffd0a0, 0.2, 150);
    vfx.burst(p, { count: 10, tex: 'star', color: [0xffffff, 0xffe080], speed: [2, 5], size: [0.15, 0.3], life: [0.3, 0.6], spin: 6 });
    c.impact(0);
  }
  await vfx.wait(550);
});

registerMoveFx('LOW_KICK', async (c) => {
  const { vfx } = c;
  await vfx.tween(140, (k) => (c.attacker.body.position.y = -0.12 * k));
  c.attacker.body.position.y = 0;
  await rush(c, { ms: 300 });
  const at = c.aim(0.18);
  // low sweeping arc at ankle height
  const { right } = camBasis(c);
  const s = c.side === 0 ? 1 : -1;
  const base = towardCam(c, at, 0.6);
  const pts = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const t = i / 6;
    return base.clone().addScaledVector(right, s * (t - 0.5) * 2.6).add(V(0, 0.35 * Math.sin(t * Math.PI) - 0.1, 0));
  });
  const r = vfx.prim.ribbon(pts, { color: CHOP, core: 0xfff4e0, width: 0.12, ms: 120, length: 0.8, fadeMs: 220, e: ease.inQuad });
  vfx.dust(c.foeFeet, 0xa89878, 10);
  await r.arrived;
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 0.95, pal: FIGHT });
    // the target is swept off its feet
    void c.target.jump(0.35, 300);
    c.impact(0);
  }
  await vfx.wait(500);
});

registerMoveFx('ROCK_SMASH', async (c) => {
  const { vfx } = c;
  // a boulder shield rises in front of the target...
  const at = c.aim(0.45);
  const rockAt = at.clone().addScaledVector(c.dir, -0.9);
  const b = vfx.prim.boulder(rockAt.clone().setY(rockAt.y - 1.2), { color: 0x8a7a60, size: 0.55 });
  const rise = vfx.tween(260, (k) => (b.mesh.position.y = rockAt.y - 1.2 + 1.2 * ease.outBack(k)), ease.linear);
  vfx.dust(rockAt.clone().setY(c.foeFeet.y), 0xa89878, 8);
  powerGlow(c, c.attacker.at(0.6), 1);
  await rise;
  // ...and is smashed straight through by a punch
  await rush(c, { ms: 320 });
  b.dispose();
  vfx.prim.debris({ from: rockAt, count: 14, color: 0x8a7a60, size: 0.12, speed: 4, up: 3, ms: 1000 });
  vfx.burst(rockAt, { count: 16, tex: 'rock', color: [0xb8a888, 0x6a5a48], speed: [2, 6], size: [0.15, 0.3], life: [0.4, 0.7], gravity: 9, additive: false, alpha: [1, 0.6], spin: 6 });
  vfx.burst(rockAt, { count: 8, tex: 'smoke', color: 0xa89878, speed: [1, 2.5], size: [0.6, 0.9], endSize: 1.6, life: 0.7, additive: false, alpha: [0.5, 0] });
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 0.9, pal: FIGHT, stop: true });
    c.impact(0);
  }
  await vfx.wait(550);
});

registerMoveFx('BRICK_BREAK', async (c) => {
  const { vfx, stage } = c;
  const at = c.aim(0.55);
  // a glassy barrier shimmers up in front of the target
  const wallAt = towardCam(c, at, 0.9).addScaledVector(c.dir, -0.4);
  const wall = vfx.prim.glassPanel(wallAt, { color: 0x9ae0ff, width: Math.max(1.4, c.target.width * 1.1), height: Math.max(1.8, c.target.height * 1.1) });
  c.attacker.setOutline(1.4, CHOP);
  await wall.shown;
  await vfx.wait(160);
  await rush(c, { ms: 320 });
  c.attacker.setOutline(0);
  await chop(c, at, -1.35, { len: 2.8, width: 0.15 });
  // crack, then shatter
  wall.setCrack(1);
  hitStop(c, 80);
  await vfx.wait(70);
  void wall.shatter(0x9ae0ff);
  vfx.burst(wallAt, { count: 26, tex: 'shard', color: [0xffffff, 0x9ae0ff], speed: [3, 8], size: [0.15, 0.35], life: [0.4, 0.8], gravity: 8, spin: 10, intensity: 1.8 });
  stage.flash(0xd0f0ff, 0.2, 150);
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.1, pal: FIGHT });
    c.impact(0);
  }
  await vfx.wait(600);
});

registerMoveFx('VITAL_THROW', async (c) => {
  const { vfx } = c;
  c.attacker.setOutline(1.3, CHOP);
  await vfx.wait(120);
  await rush(c, { ms: 360, dist: Math.min(4.2, c.user.distanceTo(c.foe) * 0.58) });
  c.attacker.setOutline(0);
  const at = c.aim(0.5);
  if (c.missed) {
    whiff(c, at);
    await vfx.wait(500);
    return;
  }
  // grab: flash + hands of power clamp on
  vfx.prim.impactStar(towardCam(c, at, 0.6), { color: FIGHT.main, core: 0xfff4e0, size: 0.6, ms: 200 });
  c.target.flash(0xffa060, 200, 0.5);
  // hurled up in a spin...
  const t = c.target;
  const lift = vfx.tween(420, (k) => {
    t.hop = Math.sin(k * Math.PI * 0.5) * 1.6;
    t.mesh.rotation.z = k * Math.PI * 1.5 * (c.side === 0 ? -1 : 1);
  }, ease.outQuad);
  const trail = vfx.trail(() => t.at(0.5).add(V(0, t.hop, 0)), 600, { tex: 'streak', color: [0xffe0c0, FIGHT.main], size: [0.4, 0.7], life: 0.2, speed: 0.3, rate: 50, intensity: 1.2 });
  await lift;
  // ...and slammed into the ground
  await vfx.tween(170, (k) => {
    t.hop = 1.6 * (1 - k);
    t.mesh.rotation.z = (1.5 + 0.5 * k) * Math.PI * (c.side === 0 ? -1 : 1);
  }, ease.inQuad);
  t.hop = 0;
  t.mesh.rotation.z = 0;
  impactFx(c, c.target.at(0.3), { strength: 1.4, pal: FIGHT, stop: true });
  vfx.prim.crack(c.foeFeet, { radius: 1.5, ms: 1000 });
  vfx.dust(c.foeFeet, 0xa89878, 18);
  vfx.prim.debris({ from: c.foeFeet.clone().setY(c.foeFeet.y + 0.1), count: 8, color: 0x7a6a58, size: 0.1, speed: 3, up: 3, ms: 900 });
  c.impact(0);
  await trail;
  await vfx.wait(400);
});

registerMoveFx('DYNAMIC_PUNCH', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('attacker', c.side, 450);
  // the fist charges with a roaring orange sphere of power
  const fist = c.user.clone().addScaledVector(c.dir, 0.55).add(V(0, 0.1, 0));
  const orb = vfx.prim.orb({ color: FIGHT.main, core: 0xfff0c0, radius: 0.5, intensity: 2.2 });
  orb.mesh.position.copy(fist);
  void orb.grow(650, 1);
  c.attacker.setOutline(1.6, CHOP);
  await during(c, 650, () => {
    const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(1.8);
    vfx.particle({ tex: 'spark', pos: fist.clone().add(d), vel: d.clone().multiplyScalar(-2.6), life: 0.35, size: [0.25, 0.08], color: [0xffe0a0, FIGHT.main], intensity: 2 });
    vfx.particle({ tex: 'flame', pos: fist.clone(), vel: V((Math.random() - 0.5) * 1.5, 1.2 + Math.random(), (Math.random() - 0.5) * 1.5), life: 0.35, size: [0.4, 0.15], color: [0xffc060, 0xff3a10], intensity: 1.6 });
  });
  vfx.shot('side', c.side, 300);
  // the charge
  const dist = Math.min(4.4, c.user.distanceTo(c.foe) * 0.6);
  const lunge = c.attacker.lunge(c.foe, dist, 380);
  const follow = during(c, 380, () => orb.mesh.position.copy(c.attacker.at(0.5)).addScaledVector(c.dir, 0.55));
  await vfx.wait(170);
  speedLines(c, c.user.clone().lerp(c.foe, 0.4), c.dir, { count: 12, speed: 16, color: 0xffe0c0 });
  await lunge;
  await follow;
  orb.dispose();
  c.attacker.setOutline(0);
  const at = c.aim(0.5);
  if (c.missed) whiff(c, at);
  else {
    // KA-BOOM
    vfx.prim.blast(at, { core: 0xffffff, main: 0xff7a20, dark: 0x7a1a08, radius: 1.9, ms: 1000, intensity: 1.8 });
    impactFx(c, at, { strength: 1.6, pal: FIGHT, stop: true, flash: 0.4 });
    for (let i = 0; i < 3; i++) vfx.prim.shockwave(at, { color: i ? FIGHT.main : 0xfff0d0, radius: 2.5 + i, ms: 400 + i * 120, thickness: 0.18 });
    vfx.burst(at, { count: 30, tex: 'flame', color: [0xffe0a0, 0xff4010], speed: [3, 8], size: [0.4, 0.8], life: [0.3, 0.6], additive: false, alpha: [1, 0], drag: 2 });
    vfx.shake(0.5, 600);
    c.impact(0);
  }
  vfx.shot('wide', c.side, 600);
  await vfx.wait(450);
  if (!c.missed) {
    // confusion: yellow stars and a swirl orbit the target's head
    const hd = c.target.at(1.02);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      vfx.particle({ tex: 'star', pos: hd.clone().add(V(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7)), swirl: { center: hd, speed: 5 }, life: 1.0, size: [0.35, 0.25], color: 0xffe040, intensity: 2, fadeIn: 0.1, spin: 4 });
    }
    vfx.prim.shockwave(hd, { color: 0xffe060, radius: 1, ms: 700, facing: 'ground', thickness: 0.2 });
    stage.chromaPulse(0.008, 400);
  }
  await vfx.wait(700);
});

registerMoveFx('BULK_UP', async (c) => {
  const { vfx } = c;
  vfx.shot('attacker', c.side, 450);
  const R = Math.max(0.8, c.attacker.width * 0.5);
  // flame-like red aura licks upward during the flexes
  const aura = during(c, 1250, () => {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      vfx.particle({
        tex: 'flame',
        pos: c.userFeet.clone().add(V(Math.cos(a) * R, 0.1 + Math.random() * 0.4, Math.sin(a) * R)),
        vel: V(0, 2.2 + Math.random() * 1.4, 0),
        life: 0.5,
        size: [0.55, 0.15],
        color: [0xffb060, 0xe02010],
        intensity: 1.6,
        alpha: [0.8, 0],
      });
    }
  });
  for (let i = 0; i < 2; i++) {
    // FLEX: swell, flash red, outline pulse, ground ring
    c.attacker.setOutline(2.2, 0xff4020);
    c.attacker.flash(0xff5030, 300, 0.45);
    c.attacker.shake(0.05, 0.25);
    vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: 0xff5030, radius: 2.2, facing: 'ground', ms: 450, thickness: 0.25 });
    vfx.prim.shockwave(c.user, { color: 0xff8050, radius: 2, ms: 350, thickness: 0.14 });
    vfx.burst(c.user, { count: 14, tex: 'spark', color: [0xffe0c0, 0xff4020], speed: [3, 6], size: [0.15, 0.3], life: [0.2, 0.4] });
    vfx.shake(0.06, 200);
    await vfx.tween(200, (k) => (c.attacker.scale = 1 + 0.1 * Math.sin(k * Math.PI)), ease.linear);
    c.attacker.setOutline(0.8, 0xff4020);
    await vfx.wait(250);
  }
  c.attacker.scale = 1;
  await vfx.spiral(c.userFeet, { color: [0xffe0c0, 0xff3a10], tex: 'spark', ms: 450, radius: R, rise: 2.6, rate: 50 });
  await aura;
  c.attacker.setOutline(0);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(100);
});

