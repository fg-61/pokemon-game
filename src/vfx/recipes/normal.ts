import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { camBasis, clawMarks, during, hitStop, impactFx, rush, sideOf, silhouette, slashStroke, speedLines, strokePoints, towardCam } from './common';

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
