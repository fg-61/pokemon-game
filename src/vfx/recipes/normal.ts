import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { camBasis, clawMarks, during, healSparkles, hitStop, impactFx, pulledShot, rush, screenAngle, sideOf, silhouette, slashStroke, speedLines, strokePoints, towardCam } from './common';

// normal-type move recipes

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const WHITE = { core: 0xffffff, main: 0xffb848, dark: 0x9a9070 };
const GOLD = { core: 0xffffff, main: 0xffd060, dark: 0x8a6a20 };

/** Quick whiff for missed contact moves. */
function whiff(c: MoveFxContext, at = c.aim(0.5)) {
  c.vfx.burst(at, { count: 8, tex: 'streak', color: 0xffffff, speed: [4, 7], size: [0.4, 0.7], life: 0.18, dir: c.dir, spread: 0.5, intensity: 1.2 });
  c.vfx.dust(c.foeFeet.clone().addScaledVector(sideOf(c.dir), 1.4), 0xd8c8a8, 6);
}

/** Head height point on a sprite (for eyes / headbutts). */
const head = (s: MoveFxContext['attacker'], f = 0.78) => s.at(f);

// ------------------------------------------------------------------ basic contact

registerMoveFx('TACKLE', async (c) => {
  const { vfx } = c;
  await rush(c, { ms: 360, ghosts: 2 });
  if (c.missed) whiff(c);
  else {
    impactFx(c, c.aim(0.5), { strength: 0.8, pal: WHITE });
    c.impact(0);
  }
  await vfx.wait(450);
});

registerMoveFx('HEADBUTT', async (c) => {
  const { vfx } = c;
  c.attacker.setOutline(1.2, 0xffffff);
  await vfx.tween(160, (k) => (c.attacker.body.position.y = -0.12 * k));
  c.attacker.setOutline(0);
  c.attacker.body.position.y = 0;
  await rush(c, { ms: 340, ghosts: 3, lines: true });
  const at = c.aim(0.62);
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.05, pal: WHITE, stop: true });
    c.impact(0);
    // flinch: little stars wheel around the target's head
    const hd = head(c.target, 0.95);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      vfx.particle({ tex: 'star', pos: hd.clone().add(V(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6)), vel: V(0, 0.3, 0), swirl: { center: hd, speed: 5 }, life: 0.8, size: [0.35, 0.2], color: 0xffe070, intensity: 2, fadeIn: 0.1 });
    }
  }
  await vfx.wait(600);
});

registerMoveFx('SCRATCH', async (c) => {
  const { vfx } = c;
  await rush(c, { ms: 320, dist: Math.min(3.2, c.user.distanceTo(c.foe) * 0.45) });
  const at = c.aim(0.55);
  await clawMarks(c, at, { color: 0xffd8a0, core: 0xffffff, count: 3, width: 0.075, len: 1.7, angle: -0.95, stagger: 40 });
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 0.7, pal: WHITE, ground: false });
    vfx.burst(towardCam(c, at, 0.6), { count: 12, tex: 'spark', color: [0xffffff, 0xffe0a0], speed: [2, 5], size: [0.12, 0.24], life: [0.2, 0.4], gravity: 4 });
    c.impact(0);
  }
  await vfx.wait(450);
});

registerMoveFx('SLASH', async (c) => {
  const { vfx } = c;
  c.attacker.setOutline(1.4, 0xffffff);
  vfx.particle({ tex: 'star', pos: towardCam(c, head(c.attacker, 0.7), 0.4), life: 0.3, size: [0.2, 1.2], color: 0xffffff, intensity: 2.5, alpha: [1, 0] });
  await vfx.wait(180);
  c.attacker.setOutline(0);
  await rush(c, { ms: 320, ghosts: 2 });
  const at = c.aim(0.55);
  // one huge crescent, drawn diagonally
  vfx.prim.ribbon(strokePoints(c, at.clone().add(V(0, 0.18, 0)), -0.75, 2.4, 0.4, 9), { color: 0xffc860, core: 0xfff4d0, width: 0.04, ms: 140, length: 1, holdMs: 100, fadeMs: 240, e: ease.outCubic });
  const r = slashStroke(c, strokePoints(c, at, -0.75, 3.2, 0.5, 9), { color: 0xffc860, core: 0xffffff, width: 0.09, ms: 120, holdMs: 120, fadeMs: 260, intensity: 1.5 });
  await r.arrived;
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.0, pal: GOLD, ground: false, stop: true });
    c.stage.flash(0xffffff, 0.15, 140);
    // crit-ish sparkles twinkling along the cut
    for (const p of r.curve.getSpacedPoints(8)) {
      vfx.particle({ tex: 'star', pos: p.clone(), life: 0.45, size: [0.05, 0.55], color: 0xfff0a0, intensity: 2.6, alpha: [1, 0], fadeIn: 0.3 + Math.random() * 0.3, spin: 4 });
    }
    c.impact(0);
  }
  await vfx.wait(520);
});

registerMoveFx('SLAM', async (c) => {
  const { vfx } = c;
  // wind up: rear back and up
  const hop = c.attacker.jump(0.7, 420);
  await vfx.wait(160);
  await rush(c, { ms: 360, ghosts: 3 });
  void hop;
  const at = c.aim(0.5);
  // heavy overhead swing crashing down on the target
  const { right } = camBasis(c);
  const side = right.clone().multiplyScalar(c.side === 0 ? -1 : 1);
  const pts = [0, 1, 2, 3, 4, 5].map((i) => {
    const t = i / 5;
    return towardCam(c, at, 0.6).add(side.clone().multiplyScalar(Math.cos(t * Math.PI * 0.55) * 1.4)).add(V(0, 2.2 - t * 3.2, 0));
  });
  const r = slashStroke(c, pts, { color: 0xffd080, core: 0xfff8e8, width: 0.17, ms: 150, length: 0.8, holdMs: 0, fadeMs: 240, intensity: 1.3, e: ease.inQuad });
  await r.arrived;
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.2, pal: WHITE, stop: true });
    vfx.prim.crack(c.foeFeet, { radius: 1.3, ms: 900, color: 0x3a2a18 });
    c.impact(0);
  }
  await vfx.wait(550);
});

registerMoveFx('QUICK_ATTACK', async (c) => {
  const { vfx } = c;
  c.attacker.flash(0xffffff, 120, 0.8);
  const dist = Math.min(4.2, c.user.distanceTo(c.foe) * 0.6);
  const from = c.user.clone();
  const lunge = c.attacker.lunge(c.foe, dist, 230);
  await vfx.wait(100);
  // near-instant streak: white speed-line trail + afterimages
  let n = 0;
  void during(c, 70, () => {
    if (n++ < 3) vfx.prim.afterimage(c.attacker.mesh, { color: 0xfff8e0, opacity: 0.55, ms: 280 });
  });
  vfx.prim.ribbon([from.clone().add(V(0, -0.15, 0)), c.aim(0.5).clone().addScaledVector(c.dir, -0.6)], { color: 0xfff4d0, core: 0xffffff, width: 0.16, ms: 70, length: 0.9, fadeMs: 180 });
  speedLines(c, from.clone().lerp(c.foe, 0.5), c.dir, { count: 16, radius: 1.1, speed: 18 });
  vfx.dust(c.userFeet, 0xd8c8a8, 12);
  await lunge;
  const at = c.aim(0.5);
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 0.75, pal: WHITE });
    c.impact(0);
  }
  await vfx.wait(420);
});

// ------------------------------------------------------------------ big bodies

registerMoveFx('DOUBLE_EDGE', async (c) => {
  const { vfx } = c;
  vfx.shot(c.side === 0 ? 'shoulder' : 'side', c.side, 500);
  // reckless build-up: glowing, pawing the ground
  c.attacker.setOutline(2, 0xffc070);
  c.attacker.shake(0.05, 0.5);
  const g = vfx.spiral(c.userFeet, { color: [0xffffff, 0xffb040], tex: 'spark', ms: 500, radius: Math.max(0.8, c.attacker.width * 0.45), rise: 3, rate: 60 });
  vfx.dust(c.userFeet, 0xd8c8a8, 14);
  await g;
  await rush(c, { ms: 420, dist: Math.min(4.6, c.user.distanceTo(c.foe) * 0.62), ghosts: 4, ghostColor: 0xffd080, lines: true });
  c.attacker.setOutline(0);
  const at = c.aim(0.5);
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.6, pal: { core: 0xffffff, main: 0xffc060, dark: 0x8a5a20 }, stop: true, flash: 0.45 });
    vfx.prim.crack(c.foeFeet, { radius: 1.6, ms: 1000, color: 0x3a2a18 });
    vfx.burst(towardCam(c, at, 0.4), { count: 30, tex: 'spark', color: [0xffffff, 0xffa030], speed: [5, 11], size: [0.15, 0.3], life: [0.3, 0.6], gravity: 6 });
    c.impact(0);
  }
  vfx.shot('wide', c.side, 600);
  await vfx.wait(420);
  // recoil jolt on the user
  c.attacker.flash(0xff4030, 260, 0.7);
  c.attacker.shake(0.12, 0.35);
  vfx.burst(c.user, { count: 14, tex: 'spark', color: [0xffffff, 0xff5030], speed: [2, 5], size: [0.12, 0.25], life: [0.2, 0.4] });
  vfx.particle({ tex: 'star', pos: towardCam(c, c.user, 0.5), life: 0.2, size: [0.6, 1.4], color: 0xff8060, intensity: 2, alpha: [1, 0] });
  await c.attacker.knockback(c.foe, 0.3, 320);
  await vfx.wait(150);
});

registerMoveFx('SKULL_BASH', async (c) => {
  const { vfx } = c;
  if (c.phase === 'charge') {
    vfx.shot('attacker', c.side, 450);
    // tuck the head in: sink, glow, harden (defense-up shimmer)
    await vfx.tween(260, (k) => (c.attacker.body.position.y = -0.18 * k), ease.outQuad);
    c.attacker.setOutline(1.4, 0x9ac8ff);
    c.attacker.shake(0.04, 0.9);
    vfx.prim.shield(c.user, { color: 0x8ab8ff, radius: Math.max(1.1, c.attacker.height * 0.62), ms: 900, intensity: 1.4 });
    vfx.burst(c.user, { count: 30, tex: 'spark', color: [0xffffff, 0xa0c8ff], speed: 0.1, jitter: 1.8, attract: { to: c.user, strength: 14 }, life: [0.5, 0.8], size: [0.1, 0.22] });
    await vfx.spiral(c.userFeet, { color: [0xffffff, 0x8ab0ff], tex: 'spark', ms: 700, radius: Math.max(0.8, c.attacker.width * 0.5), rise: 2.6, rate: 55 });
    for (let i = 0; i < 2; i++) {
      c.attacker.flash(0xc8e0ff, 200, 0.6);
      vfx.prim.shockwave(c.user, { color: 0xb0d0ff, radius: 1.6, ms: 300, thickness: 0.15 });
      await vfx.wait(170);
    }
    c.attacker.setOutline(0);
    await vfx.tween(200, (k) => (c.attacker.body.position.y = -0.18 * (1 - k)));
    vfx.shot('wide', c.side, 500);
    await vfx.wait(200);
    return;
  }
  vfx.shot('side', c.side, 400);
  c.attacker.setOutline(2, 0xffffff);
  c.attacker.flash(0xffffff, 200, 0.6);
  vfx.burst(head(c.attacker), { count: 20, tex: 'spark', color: [0xffffff, 0xfff0c0], speed: [2, 5], life: 0.3, size: [0.12, 0.25] });
  await vfx.wait(250);
  const dist = Math.min(4.6, c.user.distanceTo(c.foe) * 0.62);
  const lunge = c.attacker.lunge(c.foe, dist, 440);
  await vfx.wait(200);
  vfx.dust(c.userFeet, 0xd8c8a8, 14);
  speedLines(c, c.user.clone().lerp(c.foe, 0.4), c.dir, { count: 14, radius: 1, speed: 16 });
  const trail = vfx.trail(() => c.attacker.at(0.65), 120, { tex: 'glow', color: [0xffffff, 0xfff0c0], size: [0.5, 0.8], life: 0.25, speed: 0.2, rate: 90, intensity: 1.6 });
  await lunge;
  c.attacker.setOutline(0);
  const at = c.aim(0.6);
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.5, pal: WHITE, stop: true, flash: 0.35 });
    // forward shockwave rings punching through the target
    for (let i = 0; i < 3; i++) {
      vfx.prim.shockwave(at.clone().addScaledVector(c.dir, 0.3 + i * 0.5), { color: 0xfff0d0, radius: 1.3 + i * 0.5, facing: c.dir, ms: 380, thickness: 0.2 });
    }
    c.impact(0);
  }
  await trail;
  vfx.shot('wide', c.side, 600);
  await vfx.wait(520);
});

// ------------------------------------------------------------------ status on the foe

registerMoveFx('SMOKESCREEN', async (c) => {
  const { vfx } = c;
  const from = c.user.clone().addScaledVector(c.dir, 0.4);
  const to = c.aim(0.5);
  // the user belches a smoke pellet that arcs over
  vfx.burst(from, { count: 12, tex: 'smoke', color: [0x3a3a40, 0x101014], speed: [0.5, 1.5], size: [0.5, 0.8], endSize: 1.4, life: 0.6, additive: false, alpha: [0.8, 0] });
  const orb = vfx.prim.orb({ color: 0x404048, core: 0x707078, radius: 0.22, intensity: 0.6 });
  const trail = vfx.trail(() => orb.mesh.position, 420, { tex: 'smoke', color: [0x303036, 0x0a0a0c], size: [0.35, 0.55], endSize: 1.1, life: 0.6, speed: 0.3, rate: 60, additive: false, alpha: [0.7, 0] });
  await orb.fly(from, to, 420, 1.6, ease.inOutQuad);
  orb.dispose();
  // the cloud bursts open and engulfs the target
  const center = to.clone();
  vfx.burst(center, { count: 50, tex: 'smoke', color: [0x2a2a30, 0x050507], speed: [1.5, 4.5], size: [1, 1.7], endSize: 3, life: [1, 1.5], drag: 3, additive: false, alpha: [0.95, 0] });
  vfx.prim.shockwave(center, { color: 0x505058, radius: 2.4, ms: 380, intensity: 0.8 });
  if (!c.missed) {
    c.target.flash(0x000000, 700, 0.75);
    c.impact(0);
  }
  await during(c, 1000, () => {
    vfx.particle({
      tex: 'smoke',
      pos: center.clone().add(V((Math.random() - 0.5) * 1.6, (Math.random() - 0.7) * 1.4, (Math.random() - 0.5) * 1.6)),
      vel: V(0, 0.4, 0),
      swirl: { center, speed: 1.2 },
      life: 1.1,
      size: [1.2, 2.2],
      color: [0x26262c, 0x08080a],
      intensity: 1,
      additive: false,
      alpha: [0.85, 0],
      fadeIn: 0.2,
      spin: 0.8,
    });
  });
  await trail;
  await vfx.wait(350);
});

registerMoveFx('SCARY_FACE', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('attacker', c.side, 450);
  stage.setTint(0x5a3a6a, 0.55, 400);
  // menacing dark aura
  const aura = vfx.spiral(c.userFeet, { color: [0x3a1a4a, 0x0a0410], tex: 'wisp', ms: 1100, radius: Math.max(0.7, c.attacker.width * 0.45), rise: 2.2, rate: 45, additive: false, size: [0.6, 0.9], life: [0.7, 1] });
  const sil = silhouette(c.attacker, 0x12081a, 0.75, 300, 900, 300, stage);
  await vfx.wait(450);
  // red eyes glint
  const hd = head(c.attacker, 0.76);
  const { right } = camBasis(c);
  const eyeW = Math.min(0.28, c.attacker.width * 0.14);
  for (const s of [-1, 1]) {
    const p = towardCam(c, hd.clone().addScaledVector(right, s * eyeW), 0.3);
    vfx.particle({ tex: 'glow', pos: p, life: 0.8, size: [0.15, 0.35], color: 0xff1a1a, intensity: 3, alpha: [1, 0], fadeIn: 0.15 });
    vfx.particle({ tex: 'streak', pos: p.clone(), life: 0.45, size: [0.1, 0.9], color: 0xff5040, intensity: 2.5, alpha: [1, 0], fadeIn: 0.3, rot: 0.15 });
  }
  stage.chromaPulse(0.012, 400);
  await vfx.wait(500);
  // the target shudders in fear
  vfx.shot('target', c.side, 350);
  await vfx.wait(250);
  if (!c.missed) {
    c.target.shake(0.08, 0.7);
    c.target.flash(0x6040a0, 500, 0.5);
    vfx.spiral(c.foeFeet, { color: [0x8a60c0, 0x301040], tex: 'spark', ms: 500, radius: Math.max(0.7, c.target.width * 0.45), down: true, rise: 2.2, rate: 40 });
    c.impact(0);
  }
  await Promise.all([aura, sil]);
  stage.setTint(0xffffff, 0, 350);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(250);
});

// ------------------------------------------------------------------ self buffs

registerMoveFx('PROTECT', async (c) => {
  const { vfx } = c;
  const GREEN = 0x3ae878;
  vfx.shot('attacker', c.side, 400);
  c.attacker.setOutline(1.3, GREEN);
  const R = Math.max(1.3, c.attacker.height * 0.7);
  vfx.burst(c.user, { count: 24, tex: 'spark', color: [0xeaffea, GREEN], speed: 0.1, jitter: R * 1.2, attract: { to: c.user, strength: 12 }, life: [0.35, 0.5], size: [0.1, 0.2] });
  await vfx.wait(220);
  const sh = vfx.prim.shield(c.user, { color: GREEN, radius: R, ms: 1150, intensity: 0.75 });
  vfx.prim.shockwave(c.user, { color: 0x80ffa8, radius: R * 1.5, ms: 380, thickness: 0.1, intensity: 1.2 });
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: GREEN, radius: R * 1.3, facing: 'ground', ms: 500 });
  c.stage.flash(0x80ffa0, 0.08, 180);
  // hex glints skittering over the bubble
  await during(c, 800, () => {
    if (Math.random() < 0.5) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 - 0.2, Math.random() - 0.5).normalize();
      vfx.particle({ tex: 'star', pos: c.user.clone().addScaledVector(d, R), life: 0.35, size: [0.05, 0.4], color: 0xd8ffe0, intensity: 2.4, alpha: [1, 0], fadeIn: 0.4 });
    }
  });
  c.attacker.setOutline(0);
  await sh.done;
  vfx.shot('wide', c.side, 500);
});

registerMoveFx('RECOVER', async (c) => {
  const { vfx } = c;
  const HEAL = 0x9affb0;
  vfx.shot('attacker', c.side, 450);
  const R = Math.max(0.8, c.attacker.width * 0.5);
  // healing light motes drift down
  const rain = vfx.rain(c.userFeet.clone().setY(c.userFeet.y + 0.2), { tex: 'glow', color: [0xffffff, HEAL], ms: 900, rate: 40, height: 3.2, radius: R * 1.1, fall: 3, size: [0.2, 0.35], intensity: 2 });
  vfx.prim.pillar(c.userFeet, { color: 0x50e890, radius: R * 0.9, height: 4.5, ms: 1500, intensity: 0.4 });
  await vfx.wait(500);
  c.attacker.setOutline(1.2, HEAL);
  c.attacker.flash(0xe8ffe8, 700, 0.55);
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: HEAL, radius: 2, facing: 'ground', ms: 700 });
  const sp = vfx.spiral(c.userFeet, { color: [0xffffff, HEAL], tex: 'star', ms: 800, radius: R, rise: 2.4, size: [0.14, 0.3], rate: 45 });
  vfx.burst(c.user, { count: 20, tex: 'glow', color: [0xffffff, HEAL], speed: [0.4, 1.2], dir: UP, spread: 1, size: [0.2, 0.4], life: [0.6, 1] });
  await Promise.all([rain, sp]);
  c.attacker.setOutline(0);
  await vfx.wait(200);
  vfx.shot('wide', c.side, 500);
});

registerMoveFx('DEFENSE_CURL', async (c) => {
  const { vfx } = c;
  const BLUE = 0x8ab8ff;
  vfx.shot('attacker', c.side, 400);
  // curl up tight (squash), shell shimmer, then pop back
  await vfx.tween(260, (k) => {
    c.attacker.scale = 1 - 0.14 * k;
    c.attacker.body.position.y = -0.08 * k;
  }, ease.outQuad);
  c.attacker.setOutline(1.5, BLUE);
  vfx.prim.shield(c.user.clone().setY(c.user.y - 0.15), { color: BLUE, radius: Math.max(0.9, c.attacker.height * 0.5), ms: 700, intensity: 1.5 });
  const sp = vfx.spiral(c.userFeet, { color: [0xffffff, BLUE], tex: 'spark', ms: 600, radius: Math.max(0.7, c.attacker.width * 0.45), rise: 2.4, rate: 50 });
  c.attacker.flash(0xd0e4ff, 300, 0.5);
  await vfx.wait(450);
  await vfx.tween(220, (k) => {
    c.attacker.scale = 0.86 + 0.14 * ease.outBack(k);
    c.attacker.body.position.y = -0.08 * (1 - k);
  }, ease.linear);
  c.attacker.scale = 1;
  c.attacker.body.position.y = 0;
  vfx.prim.shockwave(c.user, { color: BLUE, radius: 1.8, ms: 320, thickness: 0.15 });
  await sp;
  c.attacker.setOutline(0);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(150);
});

registerMoveFx('SWORDS_DANCE', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('attacker', c.side, 450);
  const N = 6;
  const center = c.userFeet.clone();
  const R = Math.max(1.0, c.attacker.width * 0.6);
  const top = c.attacker.at(1).y + 0.5;
  const swords = Array.from({ length: N }, () => vfx.prim.sword({ color: 0x5a8ae0, core: 0xe8f0ff, length: 1.1, intensity: 0.9 }));
  const place = (k: number, t: number) => {
    swords.forEach((s, i) => {
      const a = (i / N) * Math.PI * 2 + t * 5.5;
      const rise = center.y + 0.3 + k * 1.2;
      s.group.position.set(center.x + Math.cos(a) * R, rise, center.z + Math.sin(a) * R);
      s.group.rotation.set(0, -a, 0);
    });
  };
  // phase 1: swords appear and wheel around the user
  const t0 = stage.clock.time;
  await during(c, 800, (k) => {
    place(k, stage.clock.time - t0);
    swords.forEach((s) => s.setOpacity(Math.min(1, k * 3)));
    if (Math.random() < 0.6) {
      const s = swords[Math.floor(Math.random() * N)];
      vfx.particle({ tex: 'spark', pos: s.group.position.clone().add(V(0, 0.9, 0)), life: 0.3, size: [0.18, 0.05], color: 0xc8e0ff, intensity: 2 });
    }
  });
  // phase 2: they fly up and converge, then two great swords cross above the head
  const starts = swords.map((s) => s.group.position.clone());
  const apex = V(center.x, top + 0.4, center.z);
  await vfx.tween(260, (k) => {
    swords.forEach((s, i) => {
      s.group.position.lerpVectors(starts[i], apex, k);
      s.group.rotation.z = k * Math.PI;
      s.setOpacity(1 - k * 0.8);
    });
  }, ease.inQuad);
  swords.forEach((s) => s.dispose());
  stage.flash(0xd0e4ff, 0.15, 200);
  vfx.burst(apex, { count: 30, tex: 'star', color: [0xffffff, 0x9ac8ff], speed: [2, 5], size: [0.15, 0.35], life: [0.3, 0.6], spin: 5 });
  vfx.prim.shockwave(apex, { color: 0xc8e0ff, radius: 2.2, ms: 350 });
  const { right, fwd } = camBasis(c);
  const big = [vfx.prim.sword({ color: 0xe08030, core: 0xfff0d0, length: 1.8, intensity: 1 }), vfx.prim.sword({ color: 0xe08030, core: 0xfff0d0, length: 1.8, intensity: 1 })];
  const cross = apex.clone().add(V(0, -0.2, 0));
  big.forEach((s, i) => {
    const sgn = i === 0 ? 1 : -1;
    // blades point up, tilted into an X in the screen plane
    s.group.position.copy(cross).addScaledVector(right, -sgn * 0.55).add(V(0, -0.7, 0)).addScaledVector(fwd, -0.3);
    s.group.quaternion.copy(stage.camera.quaternion);
    s.group.rotateZ(sgn * -0.7);
  });
  c.attacker.setOutline(1.6, 0xff7040);
  c.attacker.flash(0xffc0a0, 400, 0.5);
  const sp = vfx.spiral(c.userFeet, { color: [0xffe0c0, 0xff5030], tex: 'spark', ms: 600, radius: R * 0.8, rise: 2.8, rate: 55 });
  await vfx.tween(520, (k) => big.forEach((s) => s.setOpacity(k < 0.2 ? k * 5 : 1 - (k - 0.2) / 0.8)));
  big.forEach((s) => s.dispose());
  await sp;
  c.attacker.setOutline(0);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(150);
});

registerMoveFx('HOWL', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('attacker', c.side, 400);
  await vfx.tween(200, (k) => (c.attacker.body.position.y = -0.1 * k));
  c.attacker.body.position.y = 0;
  c.attacker.shake(0.05, 1.0);
  const mouth = towardCam(c, head(c.attacker, 0.8).addScaledVector(c.dir, 0.2), 0.3);
  for (let i = 0; i < 6; i++) {
    vfx.prim.shockwave(mouth, { color: i % 2 ? 0xffb050 : 0xffe0a0, radius: 2.6, startRadius: 0.3, ms: 520, thickness: 0.1, intensity: 1.1 });
    vfx.burst(mouth, { count: 5, tex: 'ring', color: 0xffd080, speed: [1.5, 2.5], size: [0.3, 0.5], endSize: 1.2, life: 0.5, intensity: 1 });
    if (i === 1) stage.chromaPulse(0.008, 300);
    await vfx.wait(120);
  }
  c.attacker.setOutline(1.5, 0xff6040);
  c.attacker.flash(0xffb090, 350, 0.45);
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: 0xff7050, radius: 2, facing: 'ground', ms: 500 });
  await vfx.spiral(c.userFeet, { color: [0xffe0c0, 0xff5030], tex: 'spark', ms: 600, radius: Math.max(0.7, c.attacker.width * 0.45), rise: 2.6, rate: 50 });
  c.attacker.setOutline(0);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(150);
});

// ------------------------------------------------------------------ ultimates

registerMoveFx('HYPER_BEAM', async (c) => {
  const { vfx, stage } = c;
  const ORANGE = 0xff8a20;
  const CORE = 0xfff4d8;
  vfx.shot(c.side === 0 ? 'shoulder' : 'attacker', c.side, 600);
  stage.setTint(0x806060, 0.35, 500);
  const mouth = c.user.clone().addScaledVector(c.dir, 0.7).add(V(0, 0.15, 0));
  // charge: energy sucked into a growing orb, contracting rings
  const orb = vfx.prim.orb({ color: ORANGE, core: CORE, radius: 0.45, intensity: 2.4 });
  orb.mesh.position.copy(mouth);
  void orb.grow(1000, 1);
  c.attacker.setOutline(1.6, 0xffb060);
  await during(c, 1000, (k) => {
    for (let i = 0; i < 2; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(2.2 + Math.random());
      const p = mouth.clone().add(d);
      vfx.particle({ tex: 'streak', pos: p, vel: d.clone().multiplyScalar(-3.2), life: 0.3, size: [0.8, 0.3], color: [0xffffff, ORANGE], intensity: 2, rot: Math.atan2(d.y, d.x) });
    }
    if (Math.random() < 0.1 + k * 0.1) vfx.prim.shockwave(mouth, { color: ORANGE, radius: 0.3, startRadius: 1.6, ms: 300, thickness: 0.12, intensity: 1.1 });
  });
  c.attacker.setOutline(0);
  // FIRE
  vfx.shot('side', c.side, 350);
  stage.flash(0xfff0d0, 0.35, 220);
  const to = c.aim(0.5);
  // solid tube body + white-hot core + a thin noisy energy sheath
  const beam = vfx.prim.ribbon([mouth, to], { color: ORANGE, core: 0xffb060, width: 0.42, ms: 160, length: 1.2, holdMs: 900, fadeMs: 350, intensity: 1.0, segments: 40, e: ease.outCubic });
  const inner = vfx.prim.ribbon([mouth, to], { color: 0xffd8a0, core: 0xffffff, width: 0.16, ms: 140, length: 1.2, holdMs: 900, fadeMs: 320, intensity: 1.0, segments: 40, e: ease.outCubic });
  const sheath = vfx.prim.beam(mouth, to, { color: 0xff6a10, core: 0xffa040, width: 0.3, holdMs: 850, growMs: 160, fadeMs: 300, intensity: 0.8, wobble: 0.25, noise: 0.8 });
  vfx.shake(0.2, 1200);
  stage.chromaPulse(0.015, 900);
  orb.dispose();
  // helix rings spiralling around the beam
  const side = sideOf(c.dir);
  const helix: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = t * Math.PI * 10;
    helix.push(mouth.clone().lerp(to, t).addScaledVector(side, Math.cos(a) * 0.6).add(V(0, Math.sin(a) * 0.6, 0)));
  }
  vfx.prim.ribbon(helix, { color: 0xff9a30, core: 0xffe0b0, width: 0.05, ms: 180, length: 1, holdMs: 700, fadeMs: 300, segments: 240, intensity: 1.4 });
  const sparks = during(c, 1000, () => {
    const t = Math.random();
    const p = mouth.clone().lerp(to, t);
    vfx.particle({ tex: 'spark', pos: p, vel: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(4), life: 0.3, size: [0.25, 0.05], color: [0xffffff, ORANGE], intensity: 2 });
    vfx.burst(mouth, { count: 1, tex: 'glow', color: 0xffa040, speed: 1, size: 0.9, life: 0.15, intensity: 1.3 });
  });
  await beam.arrived;
  if (!c.missed) {
    vfx.prim.blast(to, { core: 0xfff0c0, main: 0xff8a20, dark: 0x6a2008, radius: 1.8, ms: 1300, intensity: 1.2 });
    vfx.prim.energyBlast(to, { color: 0xff7a10, core: 0xffc080, radius: 1.6, ms: 400, intensity: 0.9 });
    impactFx(c, to, { strength: 1.6, pal: { core: 0xffffff, main: ORANGE, dark: 0x6a2a08 }, stop: true, flash: 0.3 });
    vfx.prim.crack(c.foeFeet, { radius: 2, ms: 1500, glow: 0xff8a30 });
    vfx.prim.debris({ from: c.foeFeet.clone().setY(c.foeFeet.y + 0.2), count: 10, color: 0x6a5a48, size: 0.14, speed: 4, up: 5, ms: 1300 });
    vfx.shake(0.55, 800);
    c.impact(0);
    void during(c, 800, () => {
      vfx.burst(to, { count: 2, tex: 'flame', color: [0xfff0c0, ORANGE], speed: [3, 7], size: [0.4, 0.7], life: [0.25, 0.45], intensity: 2 });
    });
  } else {
    vfx.prim.blast(to, { core: 0xffffff, main: 0xffa030, dark: 0x803010, radius: 1.5, ms: 900 });
    vfx.shake(0.3, 500);
  }
  await Promise.all([beam.done, inner.done, sheath.done, sparks]);
  vfx.burst(to, { count: 16, tex: 'smoke', color: [0x5a4a40, 0x2a2420], speed: [1, 2.5], dir: UP, spread: 1.2, size: [0.8, 1.2], endSize: 2.2, life: [0.8, 1.2], additive: false, alpha: [0.6, 0] });
  stage.setTint(0xffffff, 0, 400);
  vfx.shot('wide', c.side, 600);
  await vfx.wait(450);
});

registerMoveFx('EXPLOSION', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('attacker', c.side, 500);
  stage.setTint(0x6a5a70, 0.45, 500);
  // build-up: the user swells with unstable light, flickering and trembling
  c.attacker.shake(0.06, 1.0);
  c.attacker.setOutline(2, 0xffe0a0);
  const center = c.user.clone();
  await during(c, 950, (k) => {
    c.attacker.uniforms.flashAmt.value = 0.25 + 0.6 * k * (0.6 + 0.4 * Math.sin(k * 60));
    (c.attacker.uniforms.flashColor.value as THREE.Color).set(0xfff4e0);
    c.attacker.scale = 1 + 0.08 * k;
    if (Math.random() < 0.8) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(2.5);
      vfx.particle({ tex: 'spark', pos: center.clone().add(d), vel: d.clone().multiplyScalar(-2.4), life: 0.4, size: [0.25, 0.08], color: [0xffffff, 0xffc060], intensity: 2.2 });
    }
  });
  c.attacker.scale = 1;
  c.attacker.setOutline(0);
  // DETONATION
  vfx.shot('wide', c.side, 250);
  stage.flash(0xfff4e0, 0.8, 320);
  stage.setTint(0xffffff, 0, 200);
  stage.shockwave(center, 1.4, 600);
  stage.chromaPulse(0.03, 700);
  vfx.shake(0.9, 1100);
  hitStop(c, 90, 0.1);
  c.attacker.uniforms.flashAmt.value = 1;
  vfx.prim.energyBlast(center, { color: 0xff9a40, core: 0xfff0d0, radius: 4.2, ms: 550, intensity: 1.4 });
  vfx.prim.blast(center, { core: 0xffffff, main: 0xff9a30, dark: 0x5a2008, radius: 3.6, ms: 1600, intensity: 2.2, rise: 1.2 });
  const ground = c.userFeet.clone().setY(c.userFeet.y + 0.08);
  vfx.prim.shockwave(ground, { color: 0xffd8a0, radius: 9, facing: 'ground', ms: 800, thickness: 0.25 });
  vfx.prim.shockwave(ground, { color: 0xff8a30, radius: 6, facing: 'ground', ms: 650, thickness: 0.4 });
  vfx.prim.shockwave(center, { color: 0xffe0b0, radius: 6, ms: 450, thickness: 0.08, intensity: 1.6 });
  vfx.prim.crack(c.userFeet, { radius: 2.4, ms: 1800, glow: 0xff7a20 });
  vfx.burst(center, { count: 60, tex: 'flame', color: [0xfff0c0, 0xff6a10], speed: [4, 11], size: [0.6, 1.1], endSize: 1.6, life: [0.4, 0.8], drag: 2.5, additive: false, alpha: [1, 0], spin: 3 });
  vfx.burst(center, { count: 60, tex: 'spark', color: [0xffe0a0, 0xff8a20], speed: [6, 16], size: [0.2, 0.4], life: [0.3, 0.7], drag: 1.5, gravity: 5, intensity: 1.6 });
  vfx.burst(center, { count: 20, tex: 'streak', color: [0xfff0d0, 0xffa040], speed: [10, 18], size: [1.2, 2], life: 0.25, drag: 2, intensity: 1.3 });
  vfx.prim.debris({ from: c.userFeet.clone().setY(c.userFeet.y + 0.3), count: 16, color: 0x5a4a3a, size: 0.2, speed: 7, up: 7, ms: 1600 });
  await vfx.wait(120);
  c.attacker.uniforms.flashAmt.value = 0;
  // blast wave reaches the foe
  await vfx.wait(160);
  if (!c.missed) {
    impactFx(c, c.aim(0.5), { strength: 1.4, pal: { core: 0xffffff, main: 0xffa040, dark: 0x6a2a08 }, ground: true });
    vfx.burst(c.foe, { count: 24, tex: 'flame', color: [0xfff0c0, 0xff7020], speed: [2, 6], size: [0.5, 0.9], life: [0.3, 0.6], additive: false, alpha: [1, 0] });
    c.impact(0);
  }
  // mushroom of smoke
  await during(c, 1000, (k) => {
    for (let i = 0; i < 3; i++) {
      vfx.particle({
        tex: 'smoke',
        pos: center.clone().add(V((Math.random() - 0.5) * 2.4 * (1 - k * 0.5), -0.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2.4)),
        vel: V((Math.random() - 0.5) * 1.5, 2.2 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5),
        drag: 1.2,
        life: 1.2,
        size: [1.2, 2.8],
        color: [0x6a5448, 0x1a1412],
        intensity: 1,
        additive: false,
        alpha: [0.75 * (1 - k * 0.6), 0],
        spin: 0.6,
      });
    }
  });
  await vfx.wait(200);
});

// ------------------------------------------------------------------ roster phase 2

const AQUA = { foam: 0xeaf8ff, light: 0x9ad8ff, main: 0x3a9aff };
const RAGE = { core: 0xfff0e0, main: 0xff4a24, dark: 0x7a1208 };
const SLAP = { core: 0xffffff, main: 0xffa890, dark: 0x9a5a50 };

/** Tween the attacker's body along c.dir to `d` world units from its platform (keeps its crouch height). */
function slideTo(c: MoveFxContext, d: number, ms: number, e = ease.inOutQuad) {
  const b = c.attacker.body.position;
  const from = b.clone();
  const to = c.dir.clone().multiplyScalar(d).setY(from.y);
  return c.stage.tween(ms, (k) => b.lerpVectors(from, to, k), e);
}

/** Wind up and dash in to `d` (stays there, unlike rush); afterimages + dust. */
async function dashIn(c: MoveFxContext, d: number, ms = 300, ghosts = 2, ghostColor = 0xfff0d8) {
  const { vfx } = c;
  await slideTo(c, -0.25, ms * 0.45, ease.outQuad);
  vfx.dust(c.userFeet, 0xa89878, 7);
  let n = 0;
  if (ghosts) void during(c, ms * 0.5, () => void (n++ < ghosts && vfx.prim.afterimage(c.attacker.mesh, { color: ghostColor, opacity: 0.32, ms: 280 })));
  await slideTo(c, d, ms * 0.55, ease.inCubic);
}

/** Water droplets thrown up from the ground + a ripple ring (Splash). */
function puddle(c: MoveFxContext, at: THREE.Vector3, k = 1) {
  const { vfx } = c;
  for (let i = 0; i < Math.round(30 * k); i++) {
    const d = V((Math.random() - 0.5) * 1.6, 1 + Math.random() * 1.2, (Math.random() - 0.5) * 1.6).normalize();
    vfx.particle({ tex: 'drop', pos: at.clone().add(V(0, 0.15, 0)), vel: d.multiplyScalar(2.5 + Math.random() * 3 * k), acc: V(0, -12, 0), life: 0.6, size: [0.22 + Math.random() * 0.16, 0.1], color: [0x7ac8ff, 0x2a78e0], intensity: 1.05, additive: false, alpha: [1, 0.4] });
  }
  // splash crown
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    vfx.particle({ tex: 'drop', pos: at.clone().add(V(Math.cos(a) * 0.4, 0.1, Math.sin(a) * 0.4)), vel: V(Math.cos(a) * 1.6, 3.2 * Math.sqrt(k) + Math.random(), Math.sin(a) * 1.6), acc: V(0, -11, 0), life: 0.5, size: [0.26, 0.12], color: [AQUA.foam, 0x5ab0ff], intensity: 1.05, additive: false, alpha: [0.9, 0.3] });
  }
  vfx.prim.shockwave(at.clone().setY(at.y + 0.05), { color: AQUA.light, radius: 0.5 + 1.1 * k, facing: 'ground', ms: 450, thickness: 0.2, intensity: 1.2 });
  vfx.burst(at.clone().setY(at.y + 0.2), { count: Math.round(6 * k), tex: 'smoke', color: [AQUA.foam, AQUA.light], speed: [0.8, 2], dir: UP, spread: 1.2, size: [0.4, 0.7], endSize: 1.1, life: 0.5, additive: false, alpha: [0.55, 0], drag: 3, intensity: 1 });
}

/** Rage aura: red flame tongues licking up around a sprite's feet (per-frame emitter). */
function rageFlames(c: MoveFxContext, feet: THREE.Vector3, R: number, dt: number, amt = 1, intensity = 1.1) {
  const n = Math.round(40 * amt * dt + Math.random() * amt);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    c.vfx.particle({ tex: 'flame', pos: feet.clone().add(V(Math.cos(a) * R, 0.1 + Math.random() * 0.5, Math.sin(a) * R)), vel: V(0, 2.2 + Math.random() * 1.6, 0), life: 0.5, size: [0.6, 0.15], color: [0xff7040, 0xc80800], intensity, alpha: [0.85, 0] });
  }
}

registerMoveFx('SPLASH', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  vfx.shot('attacker', c.side, 400);
  const feet = c.userFeet.clone();
  const tilt = c.side === 0 ? 1 : -1;
  const hops = [0.55, 0.85, 1.2];
  for (let i = 0; i < hops.length; i++) {
    // squash, then flop into the air flailing
    await vfx.tween(90, (k) => (sp.scale = 1 - 0.1 * k), ease.outQuad);
    sp.scale = 1;
    puddle(c, feet, 0.55 + i * 0.2);
    const ms = 340 + i * 40;
    const jump = sp.jump(hops[i], ms);
    await during(c, ms, (k) => {
      sp.mesh.rotation.z = Math.sin(k * Math.PI * (3 + i)) * 0.4 * tilt;
      if (Math.random() < 0.55) {
        const d = V((Math.random() - 0.5) * 2, 0.6 + Math.random(), (Math.random() - 0.5) * 2).normalize();
        vfx.particle({ tex: 'drop', pos: sp.at(0.45).add(V(0, sp.hop, 0)), vel: d.multiplyScalar(2 + Math.random() * 2), acc: V(0, -10, 0), life: 0.5, size: [0.14, 0.07], color: [AQUA.light, AQUA.main], intensity: 1.05, additive: false, alpha: [1, 0.3] });
      }
    });
    await jump;
    sp.mesh.rotation.z = 0;
  }
  // belly-flop landing... and nothing happens
  puddle(c, feet, 1.1);
  sp.shake(0.05, 0.3);
  await vfx.tween(90, (k) => (sp.scale = 1 - 0.08 * k), ease.outQuad);
  await vfx.tween(160, (k) => (sp.scale = 0.92 + 0.08 * k), ease.outBack);
  sp.scale = 1;
  await vfx.wait(150);
  const { right } = camBasis(c);
  const hd = sp.at(1.08);
  // a bead of sweat
  vfx.particle({ tex: 'drop', pos: towardCam(c, hd.clone().addScaledVector(right, sp.width * 0.45).add(V(0, -0.15, 0)), 0.3), vel: V(0, -0.3, 0), life: 1.0, size: [0.5, 0.45], color: [0xc8ecff, 0x5ab0ff], intensity: 1.05, additive: false, alpha: [1, 0.2] });
  // "..."
  for (let i = 0; i < 3; i++) {
    vfx.particle({ tex: 'dot', pos: towardCam(c, hd.clone().addScaledVector(right, (i - 1) * 0.32).add(V(0, 0.25, 0)), 0.3), life: 0.9 - i * 0.16, size: [0.32, 0.3], color: 0x2a2a38, intensity: 1, additive: false, alpha: [1, 0.8] });
    await vfx.wait(160);
  }
  await vfx.wait(420);
  vfx.shot('wide', c.side, 500);
});

registerMoveFx('FLAIL', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  const tilt = c.side === 0 ? 1 : -1;
  // desperate: flushed red, trembling, sweat flying
  sp.setOutline(1.4, 0xff6a40);
  sp.flash(0xff5030, 350, 0.35);
  sp.shake(0.12, 0.45);
  const hd = head(sp, 0.85);
  for (let i = 0; i < 10; i++) {
    const d = V((Math.random() - 0.5) * 2, 0.8 + Math.random(), (Math.random() - 0.5) * 2).normalize();
    vfx.particle({ tex: 'drop', pos: hd.clone(), vel: d.multiplyScalar(2.5 + Math.random() * 2), acc: V(0, -9, 0), life: 0.5, size: [0.18, 0.1], color: [0xd8f0ff, 0x7ac0ff], intensity: 1.05, additive: false, alpha: [1, 0.4] });
  }
  await vfx.wait(300);
  const D = Math.min(3.8, c.user.distanceTo(c.foe) * 0.52);
  await dashIn(c, D, 300, 2, 0xffc0a0);
  // a frantic flurry of wild swings
  const center = c.aim(0.55);
  const angles = [0.4, 2.5, -0.9, 1.9];
  for (let i = 0; i < angles.length; i++) {
    const at = center.clone().add(V((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0));
    sp.mesh.rotation.z = (i % 2 ? -0.35 : 0.35) * tilt;
    void slideTo(c, D - 0.3 + (i % 2) * 0.3, 60);
    const r = slashStroke(c, strokePoints(c, at, angles[i], 2.0, 0.35 * (i % 2 ? -1 : 1), 7), { color: 0xffa860, core: 0xfff4e0, width: 0.12, ms: 70, length: 0.8, holdMs: 0, fadeMs: 180, intensity: 1.15, edge: 0x3a1408, e: ease.inQuad });
    await r.arrived;
    if (!c.missed) {
      impactFx(c, at, { strength: 0.5, pal: { core: 0xffffff, main: 0xffa060, dark: 0x8a3a20 }, ground: false });
      c.target.shake(0.1, 0.15);
    }
    await vfx.wait(35);
  }
  sp.mesh.rotation.z = 0;
  // the last, heaviest thrash
  await slideTo(c, D - 0.5, 80, ease.outQuad);
  await slideTo(c, D + 0.15, 80, ease.inCubic);
  const at = c.aim(0.5);
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.15, pal: { core: 0xffffff, main: 0xff9050, dark: 0x8a3a20 }, stop: true });
    c.impact(0);
  }
  sp.setOutline(0);
  await slideTo(c, 0, 300, ease.outCubic);
  await vfx.wait(300);
});

registerMoveFx('THRASH', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const R = Math.max(0.7, sp.width * 0.45);
  // blind rage: red flash, steam venting, flame-like aura
  stage.setTint(0xff9a8a, 0.22, 300);
  sp.setOutline(2, RAGE.main);
  sp.flash(RAGE.main, 400, 0.5);
  sp.shake(0.1, 0.5);
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: RAGE.main, radius: 2.2, facing: 'ground', ms: 450, thickness: 0.22, intensity: 1.1 });
  const hd = head(sp, 0.9);
  for (const s of [-1, 1]) vfx.burst(hd, { count: 5, tex: 'smoke', color: [0xffffff, 0xe0d0d0], speed: [1.5, 2.5], dir: V(s * 0.8, 1, 0), spread: 0.4, size: [0.3, 0.5], endSize: 1, life: 0.5, additive: false, alpha: [0.7, 0], intensity: 1 });
  const stopAura = c.stage.onUpdate((dt) => rageFlames(c, sp.at(0), R, dt));
  try {
    await vfx.wait(420);
    const D = Math.min(4, c.user.distanceTo(c.foe) * 0.55);
    const blows = [
      { back: 0, hop: 0, f: 0.5, s: 0.75 },
      { back: 1.0, hop: 0.6, f: 0.65, s: 0.9 },
      { back: 1.4, hop: 0, f: 0.45, s: 1.45 },
    ];
    for (let i = 0; i < blows.length; i++) {
      const b = blows[i];
      if (i === 0) await dashIn(c, D, 300, 2, 0xff9070);
      else {
        await slideTo(c, D - b.back, 150, ease.outQuad);
        if (b.hop) void sp.jump(b.hop, 260);
        if (i === 2) speedLines(c, sp.at(0.5), c.dir, { count: 10, radius: 0.9, color: 0xffd0c0 });
        let n = 0;
        void during(c, 110, () => void (n++ < 2 && vfx.prim.afterimage(sp.mesh, { color: 0xff8060, opacity: 0.3, ms: 250 })));
        await slideTo(c, D + (i === 2 ? 0.15 : 0), 110, ease.inCubic);
      }
      const at = c.aim(b.f);
      if (c.missed) whiff(c, at);
      else if (i < blows.length - 1) {
        impactFx(c, at, { strength: b.s, pal: RAGE, ground: false });
        c.target.shake(0.1, 0.2);
      } else {
        impactFx(c, at, { strength: b.s, pal: RAGE, stop: true, flash: 0.2 });
        vfx.prim.crack(c.foeFeet, { radius: 1.4, ms: 900, color: 0x3a2a18 });
        c.impact(0);
      }
    }
  } finally {
    stopAura();
  }
  await slideTo(c, 0, 380, ease.outCubic);
  sp.setOutline(0);
  stage.setTint(0xffffff, 0, 350);
  await vfx.wait(200);
});

registerMoveFx('HORN_ATTACK', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  // lower the head; the horn tip glints
  await vfx.tween(150, (k) => (sp.body.position.y = -0.1 * k), ease.outQuad);
  const tip = towardCam(c, head(sp, 0.92).addScaledVector(c.dir, 0.25), 0.5);
  vfx.particle({ tex: 'star', pos: tip, life: 0.32, size: [0.2, 1.3], color: 0xffffff, intensity: 1.8, alpha: [1, 0], spin: 6 });
  vfx.particle({ tex: 'glow', pos: tip.clone(), life: 0.3, size: [0.3, 0.8], color: 0xfff0c0, intensity: 1, alpha: [0.8, 0] });
  await vfx.wait(220);
  sp.body.position.y = 0;
  await rush(c, { ms: 300, ghosts: 2, lines: true });
  const at = c.aim(0.6);
  // the thrust: a sharp spear of light driven through the target
  const base = towardCam(c, at, 0.6);
  const r = slashStroke(c, [base.clone().addScaledVector(c.dir, -1.8).add(V(0, -0.15, 0)), base.clone().addScaledVector(c.dir, 0.6)], { color: 0xfff0c8, core: 0xffffff, width: 0.11, ms: 80, length: 0.75, holdMs: 40, fadeMs: 200, intensity: 1.2, e: ease.inQuad });
  await r.arrived;
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 0.95, pal: WHITE, ground: false });
    vfx.particle({ tex: 'star', pos: towardCam(c, at, 0.8), life: 0.25, size: [1.6, 0.3], color: 0xffffff, intensity: 1.3, alpha: [1, 0], rot: 0.4 });
    vfx.burst(towardCam(c, at, 0.5), { count: 10, tex: 'streak', color: [0xffffff, 0xffe0a0], speed: [6, 10], dir: c.dir, spread: 0.5, size: [0.5, 0.8], life: 0.18, intensity: 1.2 });
    c.impact(0);
  }
  await vfx.wait(450);
});

registerMoveFx('FOCUS_ENERGY', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  const FOC = { core: 0xfff4d0, main: 0xffa030, hot: 0xff6a20 };
  vfx.shot('attacker', c.side, 400);
  const R = Math.max(0.8, sp.width * 0.5);
  const feet = c.userFeet.clone();
  // deep breath: energy is drawn in, the body tenses
  vfx.burst(c.user, { count: 34, tex: 'spark', color: [FOC.core, FOC.main], speed: 0.1, jitter: R * 2.4, attract: { to: c.user, strength: 14 }, life: [0.4, 0.55], size: [0.1, 0.2], intensity: 1.3 });
  await vfx.tween(420, (k) => {
    sp.body.position.y = -0.08 * k;
    sp.scale = 1 + 0.04 * k;
  }, ease.inOutQuad);
  // FOCUS! the eyes glint and the aura erupts upward
  sp.body.position.y = 0;
  sp.scale = 1;
  sp.setOutline(1.8, FOC.main);
  sp.flash(FOC.core, 300, 0.5);
  const eye = towardCam(c, head(sp, 0.78), 0.4);
  vfx.particle({ tex: 'star', pos: eye, life: 0.35, size: [0.2, 1.2], color: 0xffffff, intensity: 1.8, alpha: [1, 0], spin: 5 });
  vfx.prim.shockwave(feet.clone().setY(feet.y + 0.05), { color: FOC.main, radius: 2.4, facing: 'ground', ms: 500, thickness: 0.2, intensity: 1.2 });
  vfx.prim.shockwave(c.user, { color: FOC.core, radius: 2.1, ms: 350, thickness: 0.1, intensity: 1.2 });
  vfx.dust(feet, 0xd8c8a8, 10);
  vfx.shake(0.06, 250);
  await during(c, 850, (k, dt) => {
    const n = Math.round(45 * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = feet.clone().add(V(Math.cos(a) * R, Math.random() * 0.6, Math.sin(a) * R));
      vfx.particle({ tex: 'streak', pos: p, vel: V(0, 5 + Math.random() * 2, 0), life: 0.35, size: [1.0, 0.4], color: [FOC.core, FOC.main], intensity: 0.95, alpha: [0.7, 0], rot: screenAngle(c, p, p.clone().add(UP)) });
    }
    rageFlames(c, feet, R * 0.9, dt, 0.5 * (1 - k * 0.5), 0.9);
    sp.setOutline(1.4 + 0.5 * Math.sin(k * 25), FOC.main);
  });
  sp.setOutline(0);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(150);
});

registerMoveFx('MOONLIGHT', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const MOON = { core: 0xffffff, main: 0xdce6ff, blue: 0x9ab0f0 };
  pulledShot(c, 'user', 1.45, 1.0, 500);
  stage.setTint(0x5a6aa8, 0.4, 500);
  const R = Math.max(0.8, sp.width * 0.5);
  const moonAt = c.userFeet.clone().add(V(0, sp.height + 1.6, 0));
  // the moon rises overhead
  const moon = vfx.prim.orb({ color: MOON.blue, core: MOON.main, radius: 0.55, intensity: 0.9 });
  moon.mesh.position.copy(moonAt);
  void moon.grow(500, 1);
  vfx.prim.shockwave(moonAt, { color: MOON.main, radius: 1.8, ms: 700, thickness: 0.08, intensity: 1.1 });
  const halo = during(c, 1500, (k) => {
    if (Math.random() < 0.6) vfx.particle({ tex: 'glow', pos: moonAt.clone(), life: 0.2, size: 2.4, color: MOON.blue, intensity: 0.6 * (1 - k * 0.6), alpha: [0.5, 0] });
    if (Math.random() < 0.25) {
      const a = Math.random() * Math.PI * 2;
      vfx.particle({ tex: 'star', pos: moonAt.clone().add(V(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0)), life: 0.4, size: [0.05, 0.3], color: 0xffffff, intensity: 1.5, alpha: [1, 0], fadeIn: 0.4 });
    }
  });
  await vfx.wait(450);
  // a soft silver shaft of light descends onto the user
  const H = moonAt.y - c.userFeet.y;
  vfx.prim.pillar(c.userFeet.clone(), { color: MOON.blue, radius: R * 0.95, height: H, ms: 1250, intensity: 0.3 });
  const rain = vfx.rain(c.userFeet.clone().setY(c.userFeet.y + 0.2), { tex: 'star', color: [0xffffff, MOON.main], ms: 850, rate: 35, height: H - 0.5, radius: R, fall: 3, size: [0.12, 0.24], intensity: 1.4 });
  await vfx.wait(450);
  sp.setOutline(1.2, MOON.main);
  const heal = healSparkles(c, 'user', 0xc8d8ff, 700);
  await Promise.all([rain, heal]);
  await vfx.tween(250, (k) => moon.mesh.scale.setScalar(1 - k), ease.inQuad);
  moon.dispose();
  await halo;
  sp.setOutline(0);
  stage.setTint(0xffffff, 0, 400);
  vfx.shot('wide', c.side, 500);
});

registerMoveFx('DOUBLE_SLAP', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  const tilt = c.side === 0 ? 1 : -1;
  const D = Math.min(3.8, c.user.distanceTo(c.foe) * 0.52);
  await dashIn(c, D, 300, 2);
  const n = c.missed ? 1 : c.hits;
  for (let i = 0; i < n; i++) {
    const s = i % 2 ? -1 : 1;
    const at = c.aim(0.55 + (Math.random() - 0.5) * 0.12);
    // wind the arm back, then swing across
    sp.mesh.rotation.z = -0.25 * s * tilt;
    await vfx.wait(50);
    sp.mesh.rotation.z = 0.3 * s * tilt;
    const r = slashStroke(c, strokePoints(c, at, s > 0 ? 0.2 : Math.PI - 0.2, 1.9, 0.4 * s, 8), { color: 0xffd0b8, core: 0xffffff, width: 0.15, ms: 80, length: 0.7, holdMs: 0, fadeMs: 180, intensity: 1.1, e: ease.inQuad });
    await r.arrived;
    if (c.missed) whiff(c, at);
    else {
      impactFx(c, at, { strength: 0.55 + 0.08 * Math.min(i, 4), pal: SLAP, ground: false });
      c.target.shake(0.12, 0.18);
      c.impact(i);
    }
    await vfx.wait(i === n - 1 ? 100 : 130);
  }
  sp.mesh.rotation.z = 0;
  await slideTo(c, 0, 300, ease.outCubic);
  await vfx.wait(250);
});

registerMoveFx('BODY_SLAM', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  const b = sp.body.position;
  const D = Math.max(0.8, c.user.distanceTo(c.foe) - Math.max(0.9, (sp.width + c.target.width) * 0.28));
  const H = 2.2;
  const hEnd = c.target.height * 0.3;
  // crouch...
  await vfx.tween(200, (k) => {
    sp.scale = 1 - 0.08 * k;
    b.y = -0.1 * k;
  }, ease.outQuad);
  sp.scale = 1;
  b.y = 0;
  vfx.dust(c.userFeet, 0xd8c8a8, 10);
  // ...leap high...
  let n = 0;
  await during(c, 380, (k) => {
    b.copy(c.dir).multiplyScalar(D * 0.75 * k);
    sp.hop = H * ease.outQuad(k);
    if (n++ % 3 === 1) vfx.prim.afterimage(sp.mesh, { color: 0xfff0d8, opacity: 0.25, ms: 260 });
  });
  // ...and crash down on the target with full weight
  await during(c, 150, (k) => {
    b.copy(c.dir).multiplyScalar(D * (0.75 + 0.25 * k));
    sp.hop = H + (hEnd - H) * ease.inQuad(k);
  });
  const at = c.aim(0.45);
  if (c.missed) {
    whiff(c, at);
    vfx.dust(c.userFeet.clone().addScaledVector(c.dir, D), 0xd8c8a8, 14);
    vfx.shake(0.2, 250);
  } else {
    impactFx(c, at, { strength: 1.35, pal: WHITE, stop: true, flash: 0.2, dust: 0xc8b898 });
    const t = c.target;
    void (async () => {
      await vfx.tween(80, (k) => (t.scale = 1 - 0.2 * k), ease.outQuad);
      await vfx.tween(280, (k) => (t.scale = 0.8 + 0.2 * k), ease.outBack);
      t.scale = 1;
    })();
    const g = c.foeFeet.clone().setY(c.foeFeet.y + 0.06);
    vfx.prim.shockwave(g, { color: 0xe8d8b8, radius: 3.4, facing: 'ground', ms: 550, thickness: 0.2, intensity: 1.1 });
    c.stage.wait(90).then(() => vfx.prim.shockwave(g, { color: 0xffffff, radius: 4.4, facing: 'ground', ms: 600, thickness: 0.12, intensity: 1 }));
    vfx.burst(g.clone().setY(g.y + 0.3), { count: 20, tex: 'smoke', color: [0xd8c8a8, 0xa89878], speed: [3, 6], dir: UP, spread: 1.45, flat: true, size: [0.7, 1.1], endSize: 2, life: [0.6, 0.9], drag: 3, additive: false, alpha: [0.6, 0] });
    vfx.prim.crack(c.foeFeet, { radius: 1.6, ms: 1000, color: 0x3a2a18 });
    vfx.prim.debris({ from: g.clone().setY(g.y + 0.2), count: 8, color: 0x7a6a58, size: 0.12, speed: 3, up: 4, ms: 900 });
    c.impact(0);
  }
  // bounce off and back home
  await vfx.wait(140);
  await during(c, 380, (k) => {
    b.copy(c.dir).multiplyScalar(D * (1 - ease.inOutQuad(k)));
    sp.hop = hEnd * (1 - k) + Math.sin(k * Math.PI) * 0.8;
  });
  b.set(0, 0, 0);
  sp.hop = 0;
  vfx.dust(c.userFeet, 0xd8c8a8, 6);
  await vfx.wait(300);
});

registerMoveFx('BELLY_DRUM', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('attacker', c.side, 400);
  const R = Math.max(0.8, sp.width * 0.5);
  const belly = towardCam(c, sp.at(0.4), 0.5);
  const feet = c.userFeet.clone().setY(c.userFeet.y + 0.05);
  // an accelerating drum roll on the belly
  const gaps = [150, 260, 210, 160, 120, 100];
  for (let i = 0; i < gaps.length; i++) {
    await vfx.wait(gaps[i]);
    const k = i / (gaps.length - 1);
    void vfx.tween(110, (x) => (sp.scale = 1 + (0.05 + 0.05 * k) * Math.sin(x * Math.PI)), ease.linear);
    const side = camBasis(c).right.multiplyScalar((i % 2 ? -1 : 1) * R * 0.35);
    vfx.prim.impactStar(belly.clone().add(side), { color: RAGE.main, core: 0xfff0d0, size: 0.35 + 0.12 * k, ms: 150 });
    vfx.prim.shockwave(belly, { color: i % 2 ? RAGE.main : 0xffb080, radius: 1.3 + 1.2 * k, ms: 320, thickness: 0.12, intensity: 1.2 });
    vfx.prim.shockwave(feet, { color: RAGE.main, radius: 1.2 + 1.2 * k, facing: 'ground', ms: 380, thickness: 0.18, intensity: 1 });
    vfx.burst(belly, { count: 4 + i, tex: 'spark', color: [0xffe0c0, RAGE.main], speed: [2, 4 + 2 * k], size: [0.1, 0.2], life: 0.3, intensity: 1.3 });
    sp.flash(RAGE.main, 140, 0.2 + 0.25 * k);
    sp.setOutline(0.8 + 1.2 * k, RAGE.main);
    vfx.shake(0.03 + 0.06 * k, 120);
  }
  // MAX POWER: the red aura bursts out
  stage.setTint(0xff9080, 0.25, 250);
  stage.chromaPulse(0.012, 400);
  stage.shockwave(c.user, 0.6, 350);
  sp.flash(0xff5030, 400, 0.55);
  vfx.prim.shockwave(c.user, { color: 0xffd0b0, radius: 3, ms: 420, thickness: 0.1, intensity: 1.2 });
  vfx.prim.shockwave(feet, { color: RAGE.main, radius: 3.2, facing: 'ground', ms: 550, thickness: 0.24, intensity: 1.2 });
  vfx.burst(c.user, { count: 24, tex: 'spark', color: [0xffe0c0, RAGE.main], speed: [4, 8], size: [0.15, 0.3], life: [0.25, 0.45], intensity: 1.4 });
  vfx.shake(0.18, 350);
  const sp2 = vfx.spiral(c.userFeet, { color: [0xffd0b0, 0xff3a10], tex: 'spark', ms: 650, radius: R, rise: 2.8, rate: 55, intensity: 1.4 });
  await during(c, 750, (k, dt) => {
    rageFlames(c, c.userFeet, R, dt, 1.3 * (1 - k * 0.5));
    sp.setOutline(1.6 + 0.6 * Math.sin(k * 30), RAGE.main);
  });
  await sp2;
  // the price: a wince
  sp.shake(0.1, 0.3);
  sp.flash(0xffffff, 180, 0.4);
  sp.setOutline(0);
  stage.setTint(0xffffff, 0, 350);
  await vfx.wait(250);
  vfx.shot('wide', c.side, 500);
});

registerMoveFx('SCREECH', async (c) => {
  const { vfx, stage } = c;
  const SCR = { core: 0xffffff, main: 0xffb8e8, hot: 0xff70c0 };
  vfx.shot('side', c.side, 400);
  const mouth = head(c.attacker, 0.75).addScaledVector(c.dir, 0.35);
  const to = c.aim(0.6);
  const fwd = to.clone().sub(mouth);
  fwd.normalize();
  const sv = sideOf(fwd);
  // inhale
  await vfx.tween(200, (k) => (c.attacker.body.position.y = -0.08 * k));
  c.attacker.body.position.y = 0;
  // SCREEEECH: widening sound rings race to the target, jagged noise crackles off the mouth
  stage.chromaPulse(0.01, 800);
  vfx.shake(0.08, 800);
  c.attacker.shake(0.07, 0.8);
  const travel = 330;
  let last = -1e9;
  let hit = false;
  await during(c, 800, (_k, _dt, el) => {
    if (el - last > 95 && el < 620) {
      last = el;
      const sw = vfx.prim.shockwave(mouth, { color: SCR.hot, radius: 2.0, startRadius: 0.3, ms: travel + 60, thickness: 0.2, facing: fwd, intensity: 1.3 });
      const sw2 = vfx.prim.shockwave(mouth, { color: SCR.core, radius: 1.5, startRadius: 0.2, ms: travel + 60, thickness: 0.1, facing: fwd, intensity: 1.2 });
      const end = to.clone().addScaledVector(fwd, 0.6);
      void during(c, travel + 60, (k) => {
        sw.mesh.position.lerpVectors(mouth, end, Math.min(1, k * 1.1));
        sw2.mesh.position.lerpVectors(mouth, end, Math.min(1, k * 1.05));
      });
      speedLines(c, mouth.clone().lerp(to, 0.35), fwd, { count: 3, radius: 0.6, color: SCR.main, size: 1.2, speed: 16, life: 0.2, intensity: 1.1 });
    }
    if (Math.random() < 0.45 && el < 650) {
      const a = Math.random() * Math.PI * 2;
      const q = mouth.clone().addScaledVector(fwd, 0.3 + Math.random() * 0.6).addScaledVector(sv, Math.cos(a) * 0.55).add(V(0, Math.sin(a) * 0.55, 0));
      const q2 = q.clone().addScaledVector(fwd, 0.5).addScaledVector(sv, Math.cos(a) * 0.3).add(V(0, Math.sin(a) * 0.3, 0));
      vfx.prim.lightning(q, q2, { color: SCR.main, width: 0.03, jitter: 0.18, segments: 6, ms: 90, intensity: 1.2 });
    }
    if (!hit && el > travel) {
      hit = true;
      if (!c.missed) {
        c.impact(0);
        c.target.flash(SCR.hot, 500, 0.45);
        c.target.shake(0.14, 0.9);
      }
    }
  });
  if (!c.missed) {
    // defense crumbles: rings shiver around the target, sparks sink
    const tc = c.target.at(0.5);
    for (let i = 0; i < 3; i++) c.stage.wait(i * 110).then(() => vfx.prim.shockwave(tc, { color: SCR.main, radius: 1.5 + i * 0.3, ms: 300, thickness: 0.1, intensity: 1.1 }));
    await vfx.spiral(c.foeFeet, { color: [0xd0e0ff, 0x5a7ad0], tex: 'spark', ms: 500, radius: Math.max(0.7, c.target.width * 0.45), down: true, rise: 2.4, rate: 45 });
  }
  await vfx.wait(250);
  vfx.shot('wide', c.side, 500);
});

registerMoveFx('HARDEN', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const MET = { core: 0xffffff, main: 0xc8d4e8, steel: 0x8a9ab4 };
  vfx.shot('attacker', c.side, 400);
  // tense every muscle: squeeze, the body turns to steel
  await vfx.tween(180, (k) => (sp.scale = 1 - 0.05 * k), ease.outQuad);
  const sil = silhouette(sp, 0x9aa6bc, 0.5, 180, 750, 300, stage);
  sp.setOutline(1.3, MET.main);
  vfx.prim.shockwave(c.user, { color: MET.main, radius: 2, ms: 350, thickness: 0.1, intensity: 1.1 });
  vfx.burst(c.user, { count: 14, tex: 'spark', color: [0xffffff, MET.main], speed: [3, 6], size: [0.1, 0.2], life: 0.3, intensity: 1.3, jitter: 0.4 });
  vfx.shake(0.05, 150);
  await vfx.wait(180);
  // a metallic sheen sweeps across the body
  const { right, up } = camBasis(c);
  const W = Math.max(0.8, sp.width);
  const Hh = Math.max(1, sp.height);
  const ctr = towardCam(c, c.user, 0.45);
  const L = Math.min(Hh * 0.8, 2.4);
  const bar = [ctr.clone().addScaledVector(up, -L * 0.5).addScaledVector(right, -L * 0.18), ctr.clone().addScaledVector(up, L * 0.5).addScaledVector(right, L * 0.18)];
  const r1 = vfx.prim.ribbon(bar, { color: 0xc8d8ff, core: 0xffffff, width: 0.06, ms: 60, length: 1, holdMs: 380, fadeMs: 120, intensity: 0.8, e: ease.linear });
  const r2 = vfx.prim.ribbon(bar, { color: 0xb0c0e0, core: 0xffffff, width: 0.025, ms: 60, length: 1, holdMs: 380, fadeMs: 120, intensity: 0.8, e: ease.linear });
  const o1 = right.clone().multiplyScalar(-W * 0.4);
  const a1 = (r1.mesh.material as THREE.ShaderMaterial).uniforms.alpha;
  const a2 = (r2.mesh.material as THREE.ShaderMaterial).uniforms.alpha;
  await during(c, 440, (k) => {
    const x = ease.inOutQuad(k);
    r1.mesh.position.copy(o1).addScaledVector(right, W * 0.8 * x);
    r2.mesh.position.copy(o1).addScaledVector(right, W * 0.8 * x + 0.22);
    a1.value = a2.value = Math.sin(Math.PI * Math.min(1, k * 1.05));
  });
  sp.flash(0xffffff, 250, 0.45);
  const glint = towardCam(c, sp.at(0.85).addScaledVector(right, W * 0.3), 0.5);
  vfx.particle({ tex: 'star', pos: glint, life: 0.4, size: [0.2, 1.3], color: 0xffffff, intensity: 1.8, alpha: [1, 0], spin: 5 });
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: MET.steel, radius: 2, facing: 'ground', ms: 450, thickness: 0.2, intensity: 1.1 });
  await vfx.tween(200, (k) => (sp.scale = 0.95 + 0.05 * k), ease.outBack);
  sp.scale = 1;
  await sil;
  sp.setOutline(0);
  vfx.shot('wide', c.side, 500);
});
