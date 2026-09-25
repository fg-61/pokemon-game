import * as THREE from 'three';
import { ease } from '../../render/clock';
import type { PokemonSprite } from '../../render/pokemonSprite';
import { focusShot, sideShot } from '../../render/shots';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { camBasis, during, healSparkles, hitStop, impactFx, motes, powderCloud, powderFall, pulledShot, rush, screenAngle, sideOf, slashStroke, softHit, strokePoints, towardCam, up } from './common';

// Phase-3 roster move recipes (water / fire / electric / psychic / grass / ice / poison / bug / steel)

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const mouthOf = (c: MoveFxContext, fwd = 0.45) => c.attacker.at(0.6).add(c.dir.clone().multiplyScalar(fwd));
/** Aim point on the ground (feet level) — beside the target on a miss. */
const groundAt = (c: MoveFxContext) => c.aim(0).setY(c.foeFeet.y);
/** Scale for screen-plane effects so hits near the camera (player side) don't swallow the screen. */
const camScale = (c: MoveFxContext, p: THREE.Vector3) => THREE.MathUtils.clamp(p.distanceTo(c.stage.camera.position) / 12, 0.55, 1);

/** Screen-plane direction for an on-screen angle (0 = right, PI/2 = up). */
function screenDir(c: MoveFxContext, angle: number) {
  const { right, up: u } = camBasis(c);
  return right.multiplyScalar(Math.cos(angle)).addScaledVector(u, Math.sin(angle));
}

/** A small miss puff beside the target. */
function whiffAt(c: MoveFxContext, at: THREE.Vector3, color = 0xe0ecff) {
  c.vfx.burst(at, { count: 8, tex: 'streak', color, speed: [4, 7], size: [0.4, 0.7], life: 0.18, dir: c.dir, spread: 0.5, intensity: 1.1 });
}

// =============================================================================================== WATER

const W = { foam: 0xeaf8ff, light: 0x8ad4ff, main: 0x3a9aff, deep: 0x0c50c0, dark: 0x06307a };
const WPAL = { core: 0xeaf8ff, main: 0x3a9aff, dark: 0x0a3a8a };

/** Water splash: droplets thrown out with gravity, foam puffs, a ring. */
function wSplash(c: MoveFxContext, at: THREE.Vector3, k = 1, back?: THREE.Vector3) {
  const { vfx } = c;
  const bias = back ? back.clone().multiplyScalar(0.5) : new THREE.Vector3();
  for (let i = 0; i < Math.round(30 * k); i++) {
    const d = V3((Math.random() - 0.5) * 2, 0.4 + Math.random() * 1.2, (Math.random() - 0.5) * 2).add(bias).normalize();
    vfx.particle({ tex: 'drop', pos: at.clone(), vel: d.multiplyScalar((3 + Math.random() * 4) * Math.sqrt(k)), acc: V3(0, -12, 0), drag: 0.5, life: 0.5 + Math.random() * 0.3, size: [0.16 + Math.random() * 0.16, 0.06], color: [W.light, W.main], intensity: 1.1, additive: false, alpha: [1, 0.2] });
  }
  vfx.burst(at, { count: Math.round(9 * k), tex: 'smoke', color: [W.foam, W.light], speed: [1, 2.5], size: [0.5 * k, 0.9 * k], endSize: 1.6 * k, life: [0.4, 0.7], additive: false, alpha: [0.6, 0], drag: 3, intensity: 1 });
  vfx.burst(at, { count: Math.round(10 * k), tex: 'bubble', color: W.foam, speed: [1, 3], size: [0.12, 0.3], life: [0.4, 0.8], gravity: -1.5, drag: 2, intensity: 1.2 });
  vfx.prim.shockwave(at, { color: W.light, radius: 1.4 * k, ms: 350, thickness: 0.22, intensity: 1.3 });
}

// --------------------------------------------------------------------------------------- WATERFALL

registerMoveFx('WATERFALL', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('side', c.side, 400);
  sp.setOutline(1.3, W.main);
  // 1) a torrent surges up around the user
  const R = Math.max(0.7, sp.width * 0.5);
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.06), { color: W.light, radius: R * 2.2, facing: 'ground', ms: 450, intensity: 1.3 });
  await during(c, 420, (k) => {
    const feet = sp.at(0);
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * TAU;
      const p = feet.clone().add(V3(Math.cos(a) * R, 0.1, Math.sin(a) * R));
      vfx.particle({ tex: 'drop', pos: p, vel: V3(-Math.cos(a) * 0.5, 4 + k * 4 + Math.random() * 2, -Math.sin(a) * 0.5), acc: V3(0, -5, 0), life: 0.45, size: [0.3, 0.14], color: [W.light, W.main], intensity: 1.05, additive: false, alpha: [0.95, 0.1], rot: 0 });
    }
    if (Math.random() < 0.6) vfx.particle({ tex: 'smoke', pos: feet.clone().add(V3((Math.random() - 0.5) * R * 2, 0.2, (Math.random() - 0.5) * R * 2)), vel: V3(0, 1.5, 0), life: 0.5, size: [0.5, 1.2], color: [W.foam, W.light], intensity: 1, additive: false, alpha: [0.55, 0], spin: 2 });
  });
  // 2) the user charges inside the rushing water
  const trail = during(c, 420, () => {
    const p = sp.at(0.5);
    for (let i = 0; i < 4; i++) {
      const q = p.clone().add(V3((Math.random() - 0.5) * sp.width * 0.8, (Math.random() - 0.5) * sp.height * 0.8, (Math.random() - 0.5) * 0.4));
      vfx.particle({ tex: 'drop', pos: q, vel: c.dir.clone().multiplyScalar(-2).add(V3(0, 1 + Math.random(), 0)), acc: V3(0, -9, 0), life: 0.4, size: [0.24, 0.1], color: [W.light, W.main], intensity: 1.05, additive: false, alpha: [0.9, 0.2] });
    }
    vfx.particle({ tex: 'smoke', pos: p.clone(), vel: c.dir.clone().multiplyScalar(-1.5), life: 0.35, size: [0.8, 1.4], color: [W.foam, W.light], intensity: 1, additive: false, alpha: [0.45, 0], spin: 2 });
  });
  await rush(c, { ms: 360, dust: false });
  sp.setOutline(0);
  // 3) a waterfall crashes down onto the target
  const base = c.missed ? groundAt(c) : c.foeFeet.clone();
  const at = c.aim(0.5);
  const H = 5.5;
  const top = base.clone().setY(base.y + H);
  const col = Math.max(0.6, c.target.width * 0.42);
  const fall = 20;
  vfx.prim.beam(top, base, { color: W.main, core: W.light, width: col * 0.5, intensity: 0.45, growMs: (H / fall) * 1000, holdMs: 360, fadeMs: 200, noise: 0.7, wobble: 0.12 });
  let landed = false;
  await during(c, 620, (k, _dt, el) => {
    const n = k < 0.75 ? 9 : 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * col;
      const p = top.clone().add(V3(Math.cos(a) * r, Math.random() * 0.6, Math.sin(a) * r));
      vfx.particle({ tex: 'streak', pos: p, vel: V3(0, -fall, 0), life: (p.y - base.y) / fall, size: [1.1, 1.3], color: [W.light, W.main], intensity: 1.05, additive: false, alpha: [0.9, 0.7], rot: Math.PI / 2 });
    }
    if (Math.random() < 0.5) vfx.particle({ tex: 'streak', pos: top.clone().add(V3((Math.random() - 0.5) * col, 0, (Math.random() - 0.5) * col)), vel: V3(0, -fall * 1.1, 0), life: H / (fall * 1.1), size: 1.4, color: W.foam, intensity: 1.2, alpha: [0.8, 0.5], rot: Math.PI / 2 });
    // heavy body of falling water
    for (let i = 0; i < (k < 0.75 ? 4 : 1); i++) {
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * col * 0.8;
      const p = top.clone().add(V3(Math.cos(a) * r, Math.random() * 0.5, Math.sin(a) * r));
      vfx.particle({ tex: 'smoke', pos: p, vel: V3(0, -fall * 0.95, 0), life: (p.y - base.y) / (fall * 0.95), size: [0.7 + Math.random() * 0.4, 1.1], color: [W.light, W.main], intensity: 1, additive: false, alpha: [0.7, 0.6], spin: 2 });
      vfx.particle({ tex: 'drop', pos: p.clone().add(V3((Math.random() - 0.5) * 0.4, 0, 0)), vel: V3(0, -fall, 0), life: (p.y - base.y) / fall, size: 0.34, color: [W.foam, W.light], intensity: 1.05, additive: false, alpha: [0.9, 0.8], rot: 0 });
    }
    if (el >= (H / fall) * 1000) {
      if (!landed) {
        landed = true;
        if (!c.missed) {
          impactFx(c, at, { strength: 1.1, pal: WPAL, dust: 0xc8e8ff });
          c.target.flash(W.light, 300, 0.6);
          c.impact(0);
        } else vfx.shake(0.15, 250);
        wSplash(c, base.clone().setY(base.y + 0.3), 1.3);
        stage.wait(90).then(() => vfx.prim.shockwave(base.clone().setY(base.y + 0.06), { color: W.light, radius: 3, facing: 'ground', ms: 550, intensity: 1.3 }));
      }
      if (Math.random() < 0.55) wSplash(c, base.clone().setY(base.y + 0.25), 0.35);
    }
  });
  await trail;
  // spray settles
  await vfx.rain(base, { ms: 300, rate: 50, radius: 1.8, height: 3, fall: 9, tex: 'drop', color: W.light, size: [0.12, 0.2], additive: false, intensity: 1.05 });
  await vfx.wait(200);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- BUBBLE BEAM

registerMoveFx('BUBBLE_BEAM', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 400);
  const mouth = mouthOf(c, 0.5);
  c.attacker.setOutline(1.1, W.light);
  vfx.burst(mouth, { count: 16, tex: 'bubble', color: W.foam, speed: 0.2, jitter: 1.1, attract: { to: mouth, strength: 16 }, life: 0.3, size: [0.1, 0.22], intensity: 1.1 });
  vfx.particle({ tex: 'glow', pos: mouth, life: 0.3, size: [0.2, 1.0], color: W.main, intensity: 1.1, alpha: [0.3, 0.8] });
  await vfx.wait(300);
  c.attacker.setOutline(0);
  const to = c.aim(0.5);
  const len = mouth.distanceTo(to);
  const fwd = to.clone().sub(mouth).normalize();
  const sv = sideOf(fwd);
  const travel = 0.5;
  const ms = 750;
  vfx.prim.beam(mouth, to, { color: W.main, core: W.light, width: 0.08, intensity: 0.6, growMs: travel * 1000, holdMs: ms - travel * 1000, fadeMs: 250, noise: 0.8, wobble: 0.2 });
  let hit = false;
  await during(c, ms, (_k, dt, el) => {
    const t = el / 1000;
    const n = Math.round(110 * dt + Math.random());
    for (let i = 0; i < n; i++) {
      // bubbles snake along a helix around the line of fire
      const ph = t * 16 + Math.random() * 0.8;
      const d = fwd.clone().multiplyScalar(len / travel).addScaledVector(sv, Math.cos(ph) * 1.8).add(V3(0, Math.sin(ph) * 1.4, 0));
      const s = 0.26 + Math.random() * 0.34;
      vfx.particle({ tex: 'bubble', pos: mouth.clone(), vel: d, life: travel * (1 + Math.random() * 0.15), size: [s * 0.6, s], color: W.foam, intensity: 1.15, alpha: [0.95, 0.8], fadeIn: 0.1 });
      if (Math.random() < 0.4) vfx.particle({ tex: 'glow', pos: mouth.clone(), vel: d, life: travel, size: s * 1.2, color: W.main, intensity: 0.5, alpha: [0.35, 0.2] });
    }
    if (el >= travel * 1000) {
      if (!hit && !c.missed) {
        hit = true;
        c.impact(0);
        c.target.flash(W.light, 250, 0.5);
        vfx.shake(0.12, 300);
      }
      // bubbles popping on the target
      if (Math.random() < 0.7) {
        const p = to.clone().addScaledVector(sv, (Math.random() - 0.5) * 1.1).add(V3(0, (Math.random() - 0.5) * 1.1, 0)).addScaledVector(fwd, -0.3);
        vfx.particle({ tex: 'ring', pos: p, life: 0.16, size: [0.2, 0.7], color: W.foam, intensity: 1.2, alpha: [1, 0] });
        for (let j = 0; j < 3; j++) vfx.particle({ tex: 'drop', pos: p.clone(), vel: V3(Math.random() - 0.5, Math.random(), Math.random() - 0.5).normalize().multiplyScalar(2.5), acc: V3(0, -10, 0), life: 0.3, size: [0.1, 0.04], color: [W.light, W.main], intensity: 1.05, additive: false });
      }
    }
  });
  await vfx.wait(travel * 1000 - 100);
  wSplash(c, to, c.missed ? 0.5 : 0.8, fwd.clone().negate());
  if (!c.missed) {
    // speed drop: bubbles cling and sink
    vfx.burst(to, { count: 14, tex: 'bubble', color: W.foam, speed: [0.5, 1.5], size: [0.12, 0.3], life: [0.5, 0.8], gravity: 3, drag: 2, intensity: 1.1, jitter: 0.6 });
  }
  await vfx.wait(350);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- CRABHAMMER

registerMoveFx('CRABHAMMER', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 350);
  const sp = c.attacker;
  const claw = () => sp.at(0.55).addScaledVector(c.dir, 0.5);
  // the pincer swells with pressurized water
  sp.setOutline(1.4, W.main);
  await during(c, 380, (k) => {
    const p = claw();
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * TAU;
      const q = p.clone().add(V3(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0));
      vfx.particle({ tex: 'drop', pos: q, vel: p.clone().sub(q).multiplyScalar(3), life: 0.3, size: [0.22, 0.08], color: [W.light, W.main], intensity: 1.05, additive: false, alpha: [0, 1] });
    }
    vfx.particle({ tex: 'glow', pos: p, life: 0.07, size: 0.6 + k * 0.7, color: W.main, intensity: 0.9, alpha: [0.6, 0] });
  });
  await rush(c, { ms: 320, dust: true });
  sp.setOutline(0);
  const at = c.aim(0.55);
  const z = camScale(c, at);
  // two giant pincer arcs snap shut on the target
  const { up: su } = camBasis(c);
  const flip = screenAngle(c, c.user, c.foe) > Math.PI / 2 || screenAngle(c, c.user, c.foe) < -Math.PI / 2 ? Math.PI : 0;
  const top = slashStroke(c, strokePoints(c, at.clone().addScaledVector(su, 0.5 * z), flip, 2.0 * z, 0.45 * z, 9, 0.9), { color: W.main, core: W.foam, width: 0.13 * z, ms: 130, holdMs: 120, intensity: 1.1, edge: W.dark });
  slashStroke(c, strokePoints(c, at.clone().addScaledVector(su, -0.5 * z), flip, 2.0 * z, -0.45 * z, 9, 0.9), { color: W.main, core: W.foam, width: 0.13 * z, ms: 130, holdMs: 120, intensity: 1.1, edge: W.dark });
  await top.arrived;
  if (c.missed) {
    whiffAt(c, at, W.light);
    wSplash(c, at, 0.5);
  } else {
    impactFx(c, at, { strength: 1.35, pal: WPAL, stop: true, dust: 0xc8e8ff });
    vfx.prim.blast(at, { core: W.foam, main: W.main, dark: W.deep, radius: 1.2 * z, ms: 600, rise: 0.2, intensity: 1.0, disp: 0.8 });
    wSplash(c, at, 1.3, c.dir.clone().negate());
    stage.flash(W.light, 0.12, 150);
    c.target.flash(W.light, 250, 0.7);
    c.impact(0);
  }
  await vfx.wait(550);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- WATER SPOUT

registerMoveFx('WATER_SPOUT', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('side', c.side, 400);
  // 1) water wells up under the user
  sp.setOutline(1.3, W.main);
  const feet = c.userFeet.clone();
  vfx.prim.shockwave(feet.clone().setY(feet.y + 0.06), { color: W.light, radius: 2.4, facing: 'ground', ms: 600, intensity: 1.3 });
  const R = Math.max(0.8, sp.width * 0.55);
  await during(c, 450, (k) => {
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * TAU;
      const r = R * (1.6 - k * 0.8);
      vfx.particle({ tex: 'drop', pos: feet.clone().add(V3(Math.cos(a) * r, 0.1, Math.sin(a) * r)), vel: V3(-Math.cos(a) * 2, 1 + k * 2, -Math.sin(a) * 2), swirl: { center: feet, speed: 5 }, life: 0.4, size: [0.26, 0.1], color: [W.light, W.main], intensity: 1.05, additive: false, alpha: [0.9, 0.2] });
    }
    if (Math.random() < 0.3) sp.shake(0.05, 0.1);
  });
  // 2) a geyser erupts straight up from the user
  const topY = c.user.y + sp.height * 0.6;
  const src = c.userFeet.clone().setY(topY);
  vfx.prim.pillar(feet.clone().setY(feet.y + 0.05), { color: W.main, radius: 0.75, height: 7, ms: 1000, intensity: 0.75 });
  stage.shockwave(c.user, 0.6, 300);
  vfx.shake(0.2, 400);
  const geyser = during(c, 900, (k) => {
    const n = Math.round(9 * (1 - k * 0.6));
    for (let i = 0; i < n; i++) {
      const p = feet.clone().add(V3((Math.random() - 0.5) * 0.9, 0.2, (Math.random() - 0.5) * 0.9));
      vfx.particle({ tex: 'drop', pos: p, vel: V3((Math.random() - 0.5) * 1.2, 11 + Math.random() * 5, (Math.random() - 0.5) * 1.2), acc: V3(0, -9, 0), life: 0.6, size: [0.4, 0.2], color: [W.light, W.main], intensity: 1.05, additive: false, alpha: [0.95, 0.3], rot: 0 });
    }
    if (Math.random() < 0.7) vfx.particle({ tex: 'smoke', pos: feet.clone().add(V3((Math.random() - 0.5), 0.5 + Math.random() * 3, (Math.random() - 0.5))), vel: V3(0, 4, 0), life: 0.6, size: [0.8, 1.8], color: [W.foam, W.light], intensity: 1, additive: false, alpha: [0.5, 0], spin: 2 });
  });
  await vfx.wait(250);
  sp.setOutline(0);
  // 3) the spout arcs over the field and pours down on the target
  const base = c.missed ? groundAt(c) : c.foeFeet.clone();
  const g = 12;
  const T = 0.85;
  const arc = during(c, 520, () => {
    for (let i = 0; i < 6; i++) {
      const s = src.clone().add(V3((Math.random() - 0.5) * 0.6, 1.5 + Math.random(), (Math.random() - 0.5) * 0.6));
      const dst = base.clone().add(V3((Math.random() - 0.5) * 2.2, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 1.6));
      const tt = T * (0.9 + Math.random() * 0.2);
      const v = dst.clone().sub(s).divideScalar(tt);
      v.y += 0.5 * g * tt;
      vfx.particle({ tex: 'drop', pos: s, vel: v, acc: V3(0, -g, 0), life: tt, size: [0.34, 0.3], color: [W.light, W.main], intensity: 1.05, additive: false, alpha: [0.95, 0.8] });
    }
  });
  await vfx.wait(T * 1000);
  const at = c.aim(0.5);
  if (!c.missed) {
    impactFx(c, at, { strength: 1.3, pal: WPAL, dust: 0xc8e8ff });
    c.target.flash(W.light, 350, 0.6);
    c.impact(0);
  } else vfx.shake(0.2, 300);
  wSplash(c, base.clone().setY(base.y + 0.4), 1.5);
  vfx.prim.shockwave(base.clone().setY(base.y + 0.06), { color: W.light, radius: 3.6, facing: 'ground', ms: 650, intensity: 1.4 });
  const pour = vfx.rain(base, { ms: 600, rate: 110, radius: 1.5, height: 4.5, fall: 14, tex: 'drop', color: W.light, size: [0.2, 0.34], additive: false, intensity: 1.05 });
  const splashes = during(c, 600, () => {
    if (Math.random() < 0.5) wSplash(c, base.clone().add(V3((Math.random() - 0.5) * 2, 0.2, (Math.random() - 0.5) * 2)), 0.3);
    if (!c.missed && Math.random() < 0.2) c.target.shake(0.06, 0.15);
  });
  await Promise.all([arc, geyser, pour, splashes]);
  await vfx.wait(200);
  vfx.shot('wide', c.side, 500);
});

// =============================================================================================== FIRE

const F = { white: 0xfff6d0, yellow: 0xffd040, orange: 0xff7a10, red: 0xd82a06, ember: 0xff5010, smoke: 0x2a2220, soot: 0x4a3a34 };
const FPAL = { core: 0xfff2a0, main: 0xff6a1a, dark: 0x6a1a08 };

/** Flames licking up from a point for `ms` (burning target). */
function burnOn(c: MoveFxContext, at: THREE.Vector3, ms: number, rate = 1, radius = 0.6) {
  const { vfx } = c;
  return during(c, ms, (k) => {
    const n = Math.round(3 * rate * (1 - k * 0.7) + Math.random());
    for (let i = 0; i < n; i++) {
      const p = at.clone().add(V3((Math.random() - 0.5) * 2 * radius, (Math.random() - 0.4) * radius * 1.4, (Math.random() - 0.5) * 2 * radius));
      vfx.particle({ tex: 'flame', pos: p, vel: V3((Math.random() - 0.5) * 0.6, 2 + Math.random() * 2.2, (Math.random() - 0.5) * 0.6), life: 0.35 + Math.random() * 0.25, size: [0.45 + Math.random() * 0.4, 0.1], color: [F.yellow, F.red], intensity: 1.2, additive: false, alpha: [0.95, 0], rot: (Math.random() - 0.5) * 0.4 });
      if (Math.random() < 0.4) vfx.particle({ tex: 'flame', pos: p, vel: V3(0, 2.6, 0), life: 0.25, size: [0.35, 0.05], color: [F.white, F.orange], intensity: 1.2, alpha: [0.7, 0], rot: 0 });
    }
    if (Math.random() < 0.25 * rate) vfx.particle({ tex: 'smoke', pos: at.clone().add(V3((Math.random() - 0.5) * radius, radius, (Math.random() - 0.5) * radius)), vel: V3(0, 1.4, 0), life: 0.9, size: [0.5, 1.4], color: [F.soot, F.smoke], intensity: 1, additive: false, alpha: [0.45, 0], fadeIn: 0.2, spin: 1 });
  });
}

/** Burst ring of flames around a point in the plane perpendicular to `dir`. */
function flameRing(c: MoveFxContext, at: THREE.Vector3, dir: THREE.Vector3, n = 30, speed = 5) {
  const sv = sideOf(dir);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const d = sv.clone().multiplyScalar(Math.cos(a)).add(V3(0, Math.sin(a), 0)).addScaledVector(dir, 0.3);
    c.vfx.particle({ tex: 'flame', pos: at.clone(), vel: d.multiplyScalar(speed * (0.8 + Math.random() * 0.4)), drag: 3, life: 0.45, size: [0.5, 0.9], color: [F.yellow, F.red], intensity: 1.15, additive: false, alpha: [0.95, 0] });
  }
}

// --------------------------------------------------------------------------------------- FIRE BLAST

registerMoveFx('FIRE_BLAST', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 400);
  const mouth = mouthOf(c, 0.6);
  // 1) a fireball swells at the mouth
  c.attacker.setOutline(1.5, F.orange);
  const orb = vfx.prim.orb({ color: F.orange, core: F.white, radius: 0.5, intensity: 1.5 });
  orb.mesh.position.copy(mouth);
  const grow = orb.grow(420, 1);
  await during(c, 440, (k) => {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * TAU;
      const q = mouth.clone().add(V3(Math.cos(a) * 1.2, Math.sin(a) * 1.0, (Math.random() - 0.5) * 0.6));
      vfx.particle({ tex: 'flame', pos: q, vel: mouth.clone().sub(q).multiplyScalar(3.2), life: 0.3, size: [0.45, 0.15], color: [F.yellow, F.red], intensity: 1.15, additive: false, alpha: [0.2, 1] });
    }
    vfx.particle({ tex: 'glow', pos: mouth, life: 0.07, size: 0.9 + k * 1.0, color: F.orange, intensity: 0.9, alpha: [0.6, 0] });
  });
  await grow;
  c.attacker.setOutline(0);
  // 2) it roars across the field
  const to = c.aim(0.5);
  const trail = vfx.trail(() => orb.mesh.position, 380, { tex: 'flame', color: [F.yellow, F.red], size: [0.6, 0.9], endSize: 0.15, speed: 0.6, life: [0.2, 0.35], rate: 110, additive: false, intensity: 1.15 });
  pulledShot(c, 'foe', 1.8, 0.6, 420);
  await orb.fly(mouth, to, 380, 0.5, ease.inQuad);
  orb.dispose();
  void trail;
  // 3) it bursts into the iconic 大-shaped star of fire
  const p = towardCam(c, to, 0.6);
  const z = camScale(c, p) * (c.missed ? 0.7 : 1);
  const u = screenDir(c, Math.PI / 2);
  const arms = [
    { o: 0.0, a: Math.PI / 2, L: 1.7 }, // head
    { o: 0.35, a: 0, L: 2.1 }, // arms (the horizontal bar sits a bit high)
    { o: 0.35, a: Math.PI, L: 2.1 },
    { o: 0.0, a: -Math.PI / 2 + 0.6, L: 2.3 }, // legs
    { o: 0.0, a: -Math.PI / 2 - 0.6, L: 2.3 },
  ].map((m) => ({ from: p.clone().addScaledVector(u, m.o * z), d: screenDir(c, m.a), L: m.L * z }));
  if (!c.missed) {
    c.impact(0);
    c.target.flash(0xffffff, 200, 0.9);
    stage.flash(F.orange, 0.3, 220);
    stage.chromaPulse(0.012, 350);
    stage.shockwave(p, 0.9, 400);
    hitStop(c, 70);
    vfx.shake(0.45, 600);
  } else vfx.shake(0.15, 300);
  vfx.prim.impactStar(p, { color: F.orange, core: F.white, size: 1.1 * z, ms: 260 });
  vfx.prim.blast(p, { core: F.yellow, main: 0xff5a0a, dark: 0x8a2a08, radius: 0.85 * z, ms: 600, rise: 0.3, intensity: 1.05 });
  vfx.prim.shockwave(p, { color: F.orange, radius: 3.0 * z, ms: 380, thickness: 0.12, intensity: 1.3 });
  vfx.burst(p, { count: 30, tex: 'spark', color: [F.white, F.ember], speed: [5, 11], size: [0.12, 0.26], life: [0.4, 0.7], gravity: 5, drag: 1, intensity: 1.6 });
  const star = during(c, 1100, (_k, dt, el) => {
    const reach = ease.outCubic(Math.min(1, el / 200));
    const fade = el < 780 ? 1 : 1 - (el - 780) / 320;
    for (const arm of arms) {
      const n = Math.round(460 * dt * fade + Math.random());
      for (let i = 0; i < n; i++) {
        const t = Math.random() * reach;
        const w = 0.2 * (1 - t * 0.45) * z;
        const q = arm.from.clone().addScaledVector(arm.d, t * arm.L).add(V3((Math.random() - 0.5) * w * 2, (Math.random() - 0.5) * w * 2, (Math.random() - 0.5) * w));
        const s = (0.85 - t * 0.4) * z * (0.8 + Math.random() * 0.4);
        vfx.particle({ tex: 'flame', pos: q, vel: arm.d.clone().multiplyScalar(0.9).add(V3(0, 0.6, 0)), life: 0.24 + Math.random() * 0.1, size: [s, s * 0.4], color: [F.yellow, F.red], intensity: 1.15, additive: false, alpha: [1, 0], rot: (Math.random() - 0.5) * 0.5 });
        if (Math.random() < 0.3) vfx.particle({ tex: 'flame', pos: q.clone(), vel: V3(0, 0.8, 0), life: 0.18, size: [s * 0.55, s * 0.2], color: [F.white, F.orange], intensity: 1.0, alpha: [0.75, 0], rot: 0 });
      }
      // hot tip of each arm
      if (fade > 0.2 && Math.random() < 0.7) vfx.particle({ tex: 'flame', pos: arm.from.clone().addScaledVector(arm.d, reach * arm.L), vel: arm.d.clone().multiplyScalar(1.6).add(V3(0, 1.2, 0)), life: 0.24, size: [0.7 * z, 0.1], color: [F.yellow, F.ember], intensity: 1.2, additive: false, alpha: [1, 0], rot: 0 });
    }
    if (Math.random() < 0.3 * fade) vfx.particle({ tex: 'smoke', pos: p.clone().add(V3((Math.random() - 0.5) * 2, 1.2 + Math.random(), (Math.random() - 0.5))), vel: V3(0, 1.6, 0), life: 1.0, size: [0.8, 2.0], color: [F.soot, F.smoke], intensity: 1, additive: false, alpha: [0.35, 0], fadeIn: 0.25, spin: 1 });
  });
  if (!c.missed) await Promise.all([star, stage.wait(700).then(() => burnOn(c, to, 550, 1.2, 0.55))]);
  else await star;
  await vfx.wait(150);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- OVERHEAT

registerMoveFx('OVERHEAT', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('attacker', c.side, 400);
  stage.setTint(0xffa060, 0.3, 500);
  // 1) the user overheats: white-hot glow, heat shimmer, flames sucked in
  const fc = sp.uniforms.flashColor.value as THREE.Color;
  const feet = c.userFeet.clone();
  vfx.prim.shockwave(feet.clone().setY(feet.y + 0.05), { color: F.orange, radius: 2.6, facing: 'ground', ms: 750, intensity: 1.5 });
  let lastPulse = -1000;
  await during(c, 750, (k, _dt, el) => {
    fc.set(0xffe8b0);
    sp.uniforms.flashAmt.value = 0.1 + k * 0.35;
    sp.setOutline(1.1 + k * 0.7, k < 0.5 ? F.orange : F.yellow);
    const R = Math.max(0.9, sp.width * 0.6);
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * TAU;
      vfx.particle({ tex: 'flame', pos: feet.clone().add(V3(Math.cos(a) * R, 0.1, Math.sin(a) * R)), vel: V3(-Math.cos(a) * 0.7, 3 + k * 4, -Math.sin(a) * 0.7), life: 0.4, size: [0.4 + k * 0.3, 0.08], color: [F.yellow, F.red], intensity: 1.2, additive: false, alpha: [0.95, 0], rot: 0 });
    }
    const q = c.user.clone().add(V3((Math.random() - 0.5) * 4, (Math.random() - 0.3) * 3, (Math.random() - 0.5) * 4));
    vfx.particle({ tex: 'spark', pos: q, vel: new THREE.Vector3(), attract: { to: c.user, strength: 30 }, drag: 2, life: 0.45, size: [0.14, 0.05], color: [F.white, F.orange], intensity: 1.8 });
    if (el - lastPulse > 180) {
      lastPulse = el;
      stage.shockwave(c.user, 0.25 + k * 0.3, 200);
    }
    if (Math.random() < 0.3) sp.shake(0.05, 0.1);
  });
  // 2) release: a white-hot torrent
  vfx.shot('side', c.side, 250);
  const from = mouthOf(c, 0.6);
  const to = c.aim(0.5);
  const fwd = to.clone().sub(from).normalize();
  const sv = sideOf(fwd);
  const len = from.distanceTo(to);
  stage.flash(0xfff0d0, 0.45, 220);
  const grow = 170;
  vfx.prim.beam(from, to, { color: 0xff6a10, core: 0xfff0c0, width: 0.4, intensity: 0.85, growMs: grow, holdMs: 560, fadeMs: 260, noise: 0.55, wobble: 0.1 });
  const travel = 0.3;
  const torrent = during(c, 700, (k, dt) => {
    const n = Math.round(220 * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const d = fwd.clone().addScaledVector(sv, (Math.random() - 0.5) * 0.22).add(V3(0, (Math.random() - 0.5) * 0.2, 0)).normalize();
      const s = 0.35 + Math.random() * 0.35;
      vfx.particle({ tex: 'flame', pos: from.clone(), vel: d.multiplyScalar((len / travel) * (0.9 + Math.random() * 0.2)), acc: V3(0, 2.5, 0), life: travel * 1.1, size: [s, s * 4], color: [0xffc040, 0xc81c02], intensity: 1.05, additive: false, alpha: [0.9, 0.2], spin: 5 });
    }
    const m = Math.round(70 * dt + Math.random());
    for (let i = 0; i < m; i++) {
      const d = fwd.clone().addScaledVector(sv, (Math.random() - 0.5) * 0.05).normalize();
      vfx.particle({ tex: 'flame', pos: from.clone(), vel: d.multiplyScalar(len / travel), life: travel, size: [0.3, 0.9], color: [0xffffff, 0xffc060], intensity: 1.0, alpha: [0.6, 0], spin: 5 });
    }
    sp.uniforms.flashAmt.value = 0.45 * (1 - k * 0.6);
  });
  await vfx.wait(grow);
  if (!c.missed) {
    c.impact(0);
    impactFx(c, to, { strength: 1.5, pal: FPAL, stop: true, dust: 0x6a4a3a });
    c.target.flash(0xffffff, 300, 1);
    stage.flash(0xffffff, 0.35, 260);
    stage.chromaPulse(0.02, 450);
  }
  vfx.prim.blast(to, { core: 0xfff4c0, main: 0xff6a10, dark: 0x3a0e04, radius: (c.missed ? 1.3 : 2.0) * camScale(c, to), ms: 1000, scaleY: 1.15, rise: 0.8, intensity: 1.05 });
  vfx.shake(0.5, 700);
  const burn = c.missed ? Promise.resolve() : burnOn(c, to, 900, 1.5, 0.6);
  await torrent;
  // 3) spent: the user cools down, dims and steams
  sp.setOutline(0);
  stage.setTint(0xffffff, 0, 400);
  const light = sp.uniforms.light.value as THREE.Color;
  const l0 = light.clone();
  const dim = new THREE.Color(0x6a6e88);
  const flash0 = sp.uniforms.flashAmt.value as number;
  const cool = stage.tween(380, (k) => {
    light.copy(l0).lerp(dim, k);
    sp.uniforms.flashAmt.value = flash0 * (1 - k);
  });
  const steam = during(c, 800, (k) => {
    if (Math.random() < 0.6 * (1 - k * 0.5)) vfx.particle({ tex: 'smoke', pos: sp.at(0.3 + Math.random() * 0.6).add(V3((Math.random() - 0.5) * sp.width * 0.6, 0, 0.1)), vel: V3((Math.random() - 0.5) * 0.4, 1.3 + Math.random(), 0), life: 0.9, size: [0.4, 1.3], color: [0xb8b0b0, 0x5a5250], intensity: 1, additive: false, alpha: [0.5, 0], fadeIn: 0.2, spin: 1 });
    if (Math.random() < 0.15) vfx.particle({ tex: 'spark', pos: sp.at(0.5).add(V3((Math.random() - 0.5) * sp.width * 0.6, 0, 0)), vel: V3(0, 0.8, 0), acc: V3(0, -2, 0), life: 0.5, size: [0.1, 0.03], color: [F.orange, F.red], intensity: 1.4 });
  });
  await Promise.all([cool, burn, steam]);
  vfx.shot('wide', c.side, 500);
  await stage.tween(300, (k) => light.copy(dim).lerp(l0, k));
  light.copy(l0);
  sp.uniforms.flashAmt.value = 0;
});

// --------------------------------------------------------------------------------------- FLAME WHEEL

registerMoveFx('FLAME_WHEEL', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('side', c.side, 400);
  const R = THREE.MathUtils.clamp(Math.max(sp.width, sp.height) * 0.5, 0.75, 1.5);
  // the wheel lies in the screen plane so it always reads as a circle; it rolls toward the target
  const toRight = Math.abs(screenAngle(c, c.user, c.foe)) < Math.PI / 2 ? 1 : -1;
  const ax = camBasis(c).right.setY(0).normalize().multiplyScalar(toRight);
  const spin = -16;
  let power = 0;
  let spinning = true;
  // a wheel of fire spins around the user and follows it into the charge
  const wheel = during(c, 1400, (_k, dt, el) => {
    if (!spinning) power = Math.max(0, power - dt * 4);
    else power = Math.min(1, power + dt * 3);
    if (power <= 0 && !spinning) return;
    const ctr = sp.at(0.5);
    const t = el / 1000;
    const pt = (a: number) => towardCam(c, ctr, 0.3).addScaledVector(ax, Math.cos(a) * R).add(V3(0, Math.sin(a) * R, 0));
    const tan = (a: number) => ax.clone().multiplyScalar(-Math.sin(a)).add(V3(0, Math.cos(a), 0)).multiplyScalar(Math.sign(spin));
    const n = Math.round(420 * dt * power + Math.random());
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      vfx.particle({ tex: 'flame', pos: pt(a), vel: tan(a).multiplyScalar(-2).add(V3(0, 1.2, 0)), life: 0.22, size: [0.62 * power, 0.14], color: [F.yellow, F.red], intensity: 1.15, additive: false, alpha: [0.95, 0], rot: 0 });
    }
    // three bright "spokes" sweeping around show the rotation
    for (let j = 0; j < 3; j++) {
      const a = spin * t + (j / 3) * TAU;
      vfx.particle({ tex: 'flame', pos: pt(a), vel: tan(a).multiplyScalar(-3), life: 0.14, size: [0.7 * power, 0.2], color: [F.white, F.orange], intensity: 1.05, alpha: [0.85, 0], rot: 0 });
      vfx.particle({ tex: 'flame', pos: pt(a - 0.25 * Math.sign(spin)), vel: V3(0, 1, 0), life: 0.2, size: [0.55 * power, 0.1], color: [F.yellow, F.red], intensity: 1.15, additive: false, alpha: [0.95, 0], rot: 0 });
    }
    if (Math.random() < 0.35 * power) vfx.particle({ tex: 'spark', pos: pt(Math.random() * TAU), vel: V3((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2), acc: V3(0, -4, 0), life: 0.4, size: [0.12, 0.04], color: [F.white, F.ember], intensity: 1.6 });
  });
  c.attacker.setOutline(1.3, F.orange);
  await vfx.wait(480);
  await rush(c, { ms: 380, dust: true });
  c.attacker.setOutline(0);
  const at = c.aim(0.5);
  if (!c.missed) {
    softHit(c, at, FPAL, 1.2);
    flameRing(c, at, c.dir, 30, 5);
    stage.shockwave(at, 0.6, 300);
    vfx.shake(0.28, 350);
    c.target.flash(F.orange, 300, 0.7);
    c.impact(0);
  } else whiffAt(c, at, F.yellow);
  await vfx.wait(120);
  spinning = false;
  if (!c.missed) await burnOn(c, at, 500, 1.0, 0.5);
  await wheel;
  vfx.shot('wide', c.side, 500);
});

// =============================================================================================== ELECTRIC

const E = { white: 0xffffff, pale: 0xfff6b0, main: 0xffe030, deep: 0xffb000, dark: 0x8a6a00 };
const EPAL = { core: 0xffffff, main: 0xffe030, dark: 0x8a6a00 };

/** Random point on a sprite's body (world). */
function onBody(s: PokemonSprite, spread = 0.9) {
  return s.at(0.15 + Math.random() * 0.75).add(V3((Math.random() - 0.5) * s.width * 0.6 * spread, 0, (Math.random() - 0.5) * 0.3));
}

/** Short crackling arcs jumping around a sprite. */
function crackle(c: MoveFxContext, s: PokemonSprite, ms: number, rate = 0.5, width = 0.05) {
  return during(c, ms, () => {
    if (Math.random() < rate) {
      const a = onBody(s, 1.2);
      const b = a.clone().add(V3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.6));
      c.vfx.prim.lightning(a, b, { color: E.main, width, jitter: 0.25, segments: 6, ms: 110, intensity: 1.3 });
    }
  });
}

/** X-ray style electrocution flicker + arcs on the target. */
async function electrocute(c: MoveFxContext, s: PokemonSprite, ms = 450) {
  const u = s.uniforms;
  const sil = u.silColor.value as THREE.Color;
  const prev = sil.clone();
  let n = -1;
  const arcs = crackle(c, s, ms, 0.8, 0.06);
  await during(c, ms, (_k, _dt, el) => {
    const step = Math.floor(el / 55);
    if (step !== n) {
      n = step;
      const on = step % 2 === 0;
      u.silhouette.value = on ? 0.9 : 0.25;
      sil.set(on ? 0x201a08 : 0xfff080);
    }
    s.body.position.x = (Math.random() - 0.5) * 0.06;
  });
  u.silhouette.value = 0;
  sil.copy(prev);
  s.body.position.x = 0;
  await arcs;
}

// --------------------------------------------------------------------------------------- SHOCK WAVE

registerMoveFx('SHOCK_WAVE', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('side', c.side, 400);
  // 1) the user discharges a pulse of static
  const flick = during(c, 380, () => sp.setOutline(Math.random() < 0.5 ? 1.8 : 0.6, E.main));
  const charge = crackle(c, sp, 380, 0.9, 0.05);
  for (let i = 0; i < 3; i++) stage.wait(i * 110).then(() => vfx.prim.shockwave(c.user, { color: i % 2 ? E.pale : E.main, radius: 1.8, ms: 320, thickness: 0.14, intensity: 1.2 }));
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: E.main, radius: 2.2, facing: 'ground', ms: 450, intensity: 1.2 });
  await Promise.all([flick, charge]);
  sp.setOutline(0);
  // 2) a crackling ball rides a wave of electricity to the target (it never misses): a damped sine in the
  //    screen plane (perpendicular to the path as the side camera sees it) so the curve always reads on screen
  const from = sp.at(0.6).addScaledVector(c.dir, 0.5);
  const to = c.aim(0.5);
  const shot = sideShot();
  const camF = shot.look.clone().sub(shot.pos).normalize();
  const perp = new THREE.Vector3().crossVectors(to.clone().sub(from).normalize(), camF).normalize();
  if (perp.y < 0) perp.negate();
  const amp = 1.3 * (Math.random() < 0.5 ? 1 : -1);
  const wavePt = (t: number) =>
    from
      .clone()
      .lerp(to, t)
      .addScaledVector(perp, amp * Math.sin(t * Math.PI * 3) * Math.pow(1 - t, 0.8))
      .add(V3(0, 0.45 * Math.sin(t * Math.PI), 0));
  const orb = vfx.prim.orb({ color: E.main, core: E.white, radius: 0.26, intensity: 1.4 });
  orb.mesh.position.copy(from);
  const hist: THREE.Vector3[] = [];
  let lastArc = -1000;
  const path = Array.from({ length: 48 }, (_, i) => wavePt(i / 47));
  vfx.prim.ribbon(path, { color: E.main, core: E.white, width: 0.06, ms: 620, length: 0.85, fadeMs: 300, intensity: 1.1, e: ease.inOutQuad });
  await during(c, 620, (k, _dt, el) => {
    const p = wavePt(ease.inOutQuad(k));
    orb.mesh.position.copy(p);
    hist.push(p.clone());
    if (hist.length > 7) hist.shift();
    if (el - lastArc > 45 && hist.length > 2) {
      lastArc = el;
      vfx.prim.lightning(hist[0], p, { color: E.main, width: 0.1, jitter: 0.4, segments: 7, ms: 160, intensity: 1.2 });
    }
    vfx.particle({ tex: 'glow', pos: p.clone(), life: 0.15, size: [0.45, 0.1], color: E.main, intensity: 0.8, alpha: [0.45, 0] });
    if (Math.random() < 0.6) vfx.particle({ tex: 'spark', pos: p.clone(), vel: V3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3), life: 0.25, size: [0.14, 0.04], color: [E.white, E.main], intensity: 1.5 });
  });
  orb.dispose();
  // 3) it bursts over the target
  if (!c.missed) {
    c.impact(0);
    softHit(c, to, EPAL, 1.1);
    for (let i = 0; i < 3; i++) stage.wait(i * 90).then(() => vfx.prim.shockwave(to, { color: i % 2 ? E.pale : E.main, radius: 1.6 + i * 0.5, ms: 320, thickness: 0.12, intensity: 1.2 }));
    stage.flash(E.pale, 0.1, 150);
    stage.chromaPulse(0.012, 250);
    vfx.shake(0.18, 300);
    vfx.burst(to, { count: 24, tex: 'spark', color: [E.white, E.main], speed: [3, 8], life: [0.2, 0.45], size: [0.1, 0.22], gravity: 5, intensity: 1.4 });
    await electrocute(c, c.target, 420);
  } else {
    vfx.burst(to, { count: 14, tex: 'spark', color: [E.white, E.main], speed: [2, 5], life: 0.3, size: [0.1, 0.2] });
    await vfx.wait(350);
  }
  await vfx.wait(150);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- SPARK

registerMoveFx('SPARK', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('side', c.side, 350);
  // the body sparks with electricity
  const flick = during(c, 360, () => sp.setOutline(Math.random() < 0.5 ? 1.6 : 0.7, E.main));
  vfx.burst(c.user, { count: 20, tex: 'spark', color: [E.white, E.main], speed: 0.2, jitter: 1.4, attract: { to: c.user, strength: 18 }, life: 0.3, size: [0.1, 0.2], intensity: 1.3 });
  await Promise.all([flick, crackle(c, sp, 360, 0.9, 0.05)]);
  // electrified tackle
  const arcs = during(c, 380, () => {
    if (Math.random() < 0.8) {
      const a = onBody(sp, 1.1);
      vfx.prim.lightning(a, a.clone().add(V3((Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.5)), { color: E.main, width: 0.05, jitter: 0.25, segments: 6, ms: 100, intensity: 1.3 });
    }
    vfx.particle({ tex: 'spark', pos: onBody(sp), vel: c.dir.clone().multiplyScalar(-3).add(V3(0, 1, 0)), life: 0.25, size: [0.16, 0.04], color: [E.white, E.main], intensity: 1.5 });
  });
  await rush(c, { ms: 340, dust: true });
  sp.setOutline(0);
  const at = c.aim(0.5);
  if (!c.missed) {
    c.impact(0);
    impactFx(c, at, { strength: 0.9, pal: EPAL, ground: false });
    stage.flash(E.pale, 0.12, 150);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + Math.random() * 0.6;
      const d = sideOf(c.dir).multiplyScalar(Math.cos(a)).add(V3(0, Math.sin(a), 0)).multiplyScalar(1.2 + Math.random() * 0.7);
      vfx.prim.lightning(at, at.clone().add(d), { color: E.main, width: 0.07, jitter: 0.3, segments: 7, ms: 240, intensity: 1.3 });
    }
    await Promise.all([arcs, electrocute(c, c.target, 380)]);
  } else {
    whiffAt(c, at, E.pale);
    await arcs;
    await vfx.wait(250);
  }
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- THUNDER SHOCK

registerMoveFx('THUNDER_SHOCK', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 400);
  const flick = during(c, 300, () => c.attacker.setOutline(Math.random() < 0.5 ? 1.5 : 0.5, E.main));
  await Promise.all([flick, crackle(c, c.attacker, 300, 0.7, 0.045)]);
  c.attacker.setOutline(0);
  const from = c.attacker.at(0.6).addScaledVector(c.dir, 0.4);
  const to = c.aim(0.5);
  stage.flash(E.pale, 0.06, 90);
  vfx.prim.lightning(from, to, { color: E.main, width: 0.1, jitter: 0.7, segments: 14, ms: 380, intensity: 1.1 });
  stage.wait(80).then(() => vfx.prim.lightning(from, to, { color: E.pale, width: 0.05, jitter: 1.0, segments: 12, ms: 280, intensity: 1.0 }));
  vfx.particle({ tex: 'glow', pos: from, life: 0.25, size: [1.0, 0.4], color: E.main, intensity: 0.9, alpha: [0.7, 0] });
  await vfx.wait(80);
  if (!c.missed) {
    c.impact(0);
    softHit(c, to, EPAL, 0.85);
    vfx.shake(0.12, 250);
    vfx.burst(to, { count: 16, tex: 'spark', color: [E.white, E.main], speed: [3, 7], life: [0.2, 0.4], size: [0.1, 0.2], gravity: 5, intensity: 1.4 });
    await electrocute(c, c.target, 360);
  } else {
    vfx.burst(to, { count: 10, tex: 'spark', color: [E.white, E.main], speed: [2, 5], life: 0.3, size: [0.1, 0.18] });
    await vfx.wait(350);
  }
  await vfx.wait(120);
  vfx.shot('wide', c.side, 500);
});

// =============================================================================================== PSYCHIC

const Y = { pale: 0xffe0f8, pink: 0xff6ac8, main: 0xff4aa8, violet: 0xa060ff, lav: 0xc8a8ff, blue: 0x70a0ff, deep: 0x6a1a5a, night: 0x1a1040 };
const YPAL = { core: 0xffe0f8, main: 0xff4aa8, dark: 0x6a1a5a };
const hsl = (h: number, s = 0.9, l = 0.62) => new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l).getHex();
const headOf = (s: PokemonSprite) => s.at(0.8);

/** Points of a screen-plane polyline given in local (x right, y up) units around `center`. */
function screenShape(c: MoveFxContext, center: THREE.Vector3, pts: [number, number][], scale: number, forward = 0.6) {
  const { right, up: u } = camBasis(c);
  const base = towardCam(c, center, forward);
  return pts.map(([x, y]) => base.clone().addScaledVector(right, x * scale).addScaledVector(u, y * scale));
}

/** Wobble the target's body + pink silhouette pulses (confusion / mind attack reaction). */
function mindWobble(c: MoveFxContext, s: PokemonSprite, ms: number, color = Y.pink, amp = 0.14) {
  const u = s.uniforms;
  const sil = u.silColor.value as THREE.Color;
  const prev = sil.clone();
  sil.set(color);
  return during(c, ms, (k, _dt, el) => {
    s.body.position.x = Math.sin(el * 0.03) * amp * (1 - k);
    u.silhouette.value = (0.3 + 0.2 * Math.sin(el * 0.04)) * (1 - k);
    if (k >= 1) {
      s.body.position.x = 0;
      u.silhouette.value = 0;
      sil.copy(prev);
    }
  });
}

// --------------------------------------------------------------------------------------- AMNESIA

registerMoveFx('AMNESIA', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  pulledShot(c, 'user', 1.5, 0.9, 400);
  const head = headOf(sp);
  // 1) thoughts float out of the head and pop — the mind goes blank
  sp.setOutline(1.0, Y.lav);
  for (let i = 0; i < 6; i++) {
    stage.wait(i * 70).then(() => {
      const a = (i / 6) * TAU + Math.random() * 0.5;
      const v = V3(Math.cos(a) * 1.3, 1.1 + Math.random() * 0.6, Math.sin(a) * 0.8);
      const s = 0.3 + Math.random() * 0.2;
      vfx.particle({ tex: 'bubble', pos: head.clone(), vel: v, drag: 1.5, life: 0.55, size: [s * 0.5, s * 1.4], color: [0xffffff, Y.lav], intensity: 1.2, alpha: [1, 0.8] });
      stage.wait(550).then(() => {
        const p = head.clone().addScaledVector(v, 0.55 * 0.62);
        vfx.particle({ tex: 'ring', pos: p, life: 0.18, size: [s, s * 2.6], color: Y.pale, intensity: 1.3, alpha: [1, 0] });
        vfx.burst(p, { count: 5, tex: 'dot', color: [0xffffff, Y.lav], speed: [1, 2], size: [0.06, 0.1], life: 0.3, intensity: 1.5 });
      });
    });
  }
  await vfx.wait(620);
  sp.flash(0xffffff, 350, 0.55);
  // 2) a big "?" is written above the head
  const s = Math.max(0.28, sp.height * 0.14);
  const qc = sp.at(0.95).add(V3(0, s * 0.8, 0)).addScaledVector(camBasis(c).right, sp.width * 0.4 + s);
  const q: [number, number][] = [[-0.95, 0.7], [-0.7, 1.3], [0, 1.6], [0.75, 1.35], [0.95, 0.75], [0.55, 0.2], [0.05, -0.15], [0, -0.7]];
  const pts = screenShape(c, qc, q, s, 0.5);
  const stroke = slashStroke(c, pts, { color: Y.violet, core: Y.pale, width: 0.09, ms: 320, length: 1, holdMs: 620, fadeMs: 260, intensity: 1.1, edge: 0x2a1450, e: ease.inOutQuad });
  await stroke.arrived;
  const dot = screenShape(c, qc, [[0, -1.35]], s, 0.5)[0];
  vfx.particle({ tex: 'glow', pos: dot, life: 0.85, size: [0.2, 0.3], color: Y.lav, intensity: 1.2, alpha: [1, 0] });
  vfx.particle({ tex: 'dot', pos: dot, life: 0.85, size: [0.3, 0.28], color: 0xffffff, intensity: 1.3, alpha: [1, 0] });
  vfx.burst(dot, { count: 8, tex: 'star', color: [0xffffff, Y.lav], speed: [1.5, 3], size: [0.1, 0.18], life: 0.35, intensity: 1.5 });
  // 3) the blank mind hardens: Sp. Def rises
  sp.setOutline(1.5, Y.blue);
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: Y.blue, radius: 2.0, facing: 'ground', ms: 600, intensity: 1.3 });
  stage.wait(150).then(() => vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: Y.lav, radius: 1.6, facing: 'ground', ms: 550, intensity: 1.3 }));
  await vfx.spiral(c.userFeet, { tex: 'spark', color: [0xffffff, Y.blue], ms: 650, rate: 60, radius: Math.max(0.7, sp.width * 0.45), rise: 2.6, size: [0.14, 0.26], intensity: 1.4 });
  sp.setOutline(0);
  await stroke.done;
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- CONFUSION

registerMoveFx('CONFUSION', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 400);
  const from = headOf(c.attacker).addScaledVector(c.dir, 0.3);
  const to = c.missed ? c.aim(0.75) : headOf(c.target);
  c.attacker.setOutline(1.3, Y.pink);
  for (let i = 0; i < 2; i++) stage.wait(i * 110).then(() => vfx.prim.shockwave(from, { color: i ? Y.violet : Y.pink, radius: 1.2, ms: 280, thickness: 0.2, intensity: 1.3 }));
  vfx.particle({ tex: 'glow', pos: from, life: 0.3, size: [0.3, 1.1], color: Y.pink, intensity: 1.1, alpha: [0.3, 0.9] });
  await vfx.wait(260);
  // ripples of psychic force roll across
  const travel = 0.42;
  let last = -1000;
  let n = 0;
  await during(c, 380, (_k, _dt, el) => {
    if (el - last > 55) {
      last = el;
      n++;
      vfx.particle({ tex: 'ring', pos: from.clone(), vel: to.clone().sub(from).divideScalar(travel), life: travel, size: [0.4, 1.3 + 0.3 * Math.sin(n * 1.7)], color: n % 2 ? Y.pink : Y.lav, intensity: 1.3, alpha: [0.9, 0.5] });
    }
  });
  c.attacker.setOutline(0);
  await vfx.wait(travel * 1000 - 330);
  if (c.missed) {
    vfx.prim.shockwave(to, { color: Y.pink, radius: 1.5, ms: 350, thickness: 0.15, intensity: 1.2 });
    await vfx.wait(350);
    vfx.shot('wide', c.side, 500);
    return;
  }
  c.impact(0);
  const center = c.target.at(0.5);
  softHit(c, center, YPAL, 0.9);
  stage.chromaPulse(0.012, 350);
  stage.shockwave(center, 0.45, 300);
  c.target.flash(Y.pink, 300, 0.5);
  // the target's head spins: dizzy rings + orbiting stars
  const wob = mindWobble(c, c.target, 700);
  const top = c.target.at(1.0);
  const R = Math.max(0.5, c.target.width * 0.35);
  let lr = -1000;
  await during(c, 700, (k, _dt, el) => {
    if (el - lr > 120 && k < 0.7) {
      lr = el;
      vfx.prim.shockwave(center, { color: Math.floor(el / 120) % 2 ? Y.violet : Y.pink, radius: 2.0, startRadius: 0.5, ms: 360, thickness: 0.12, intensity: 1.2 });
    }
    for (let j = 0; j < 3; j++) {
      const a = el * 0.012 + (j / 3) * TAU;
      vfx.particle({ tex: 'star', pos: top.clone().add(V3(Math.cos(a) * R, 0.1 + Math.sin(a * 2) * 0.05, Math.sin(a) * R)), life: 0.12, size: [0.28, 0.12], color: [0xffffff, Y.pink], intensity: 1.4, alpha: [1 - k * 0.6, 0] });
    }
  });
  await wob;
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- MIRROR COAT

registerMoveFx('MIRROR_COAT', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('side', c.side, 400);
  // 1) a shimmering prism forms in front of the user
  const pos = sp.at(0.5).addScaledVector(c.dir, 1.0);
  const w = Math.max(1.6, sp.width * 1.1);
  const h = Math.max(1.8, sp.height * 1.05);
  sp.setOutline(1.2, Y.lav);
  const panel = vfx.prim.glassPanel(pos, { color: 0xe0d0ff, width: w, height: h, intensity: 1.1 });
  vfx.prim.shockwave(pos, { color: Y.lav, radius: w * 0.9, ms: 380, thickness: 0.15, intensity: 1.2 });
  const glints = during(c, 900, (_k, _dt, el) => {
    if (Math.random() < 0.5) {
      const { right, up: u } = camBasis(c);
      const edge = Math.random() < 0.5;
      const p = towardCam(c, pos, 0.2).addScaledVector(right, (edge ? (Math.random() < 0.5 ? -0.5 : 0.5) : Math.random() - 0.5) * w).addScaledVector(u, (edge ? Math.random() - 0.5 : Math.random() < 0.5 ? -0.5 : 0.5) * h);
      vfx.particle({ tex: 'star', pos: p, life: 0.3, size: [0.35, 0.05], color: hsl(el * 0.001 + Math.random() * 0.3, 0.9, 0.75), intensity: 1.5, alpha: [1, 0] });
    }
  });
  await panel.shown;
  await vfx.wait(120);
  // 2) incoming special energy strikes the mirror
  const foeSide = c.foe.clone().addScaledVector(c.dir, -0.6);
  const orb = vfx.prim.orb({ color: Y.violet, core: 0xffffff, radius: 0.24, intensity: 1.2 });
  const tr = vfx.trail(() => orb.mesh.position, 330, { tex: 'glow', color: [Y.violet, Y.deep], size: [0.25, 0.4], speed: 0.3, life: 0.25, rate: 60, intensity: 1.0 });
  await orb.fly(foeSide, pos, 330, 0.3, ease.inQuad);
  orb.dispose();
  void tr;
  stage.flash(0xf0e0ff, 0.2, 160);
  panel.setCrack(0.3);
  vfx.prim.shockwave(pos, { color: 0xffffff, radius: 1.6, ms: 280, thickness: 0.1, intensity: 1.3 });
  vfx.burst(pos, { count: 16, tex: 'spark', color: [0xffffff, Y.lav], speed: [2, 5], size: [0.1, 0.2], life: 0.3, intensity: 1.5 });
  await vfx.wait(90);
  // 3) the prism refracts it back as a rainbow fan of beams
  const to = c.aim(0.5);
  const cols = [0.0, 0.08, 0.16, 0.33, 0.55, 0.75];
  cols.forEach((hue, i) => {
    const off = (i - (cols.length - 1) / 2) * 0.22;
    const a = pos.clone().add(V3(0, off, 0));
    vfx.prim.beam(a, to.clone().add(V3(0, off * 0.3, 0)), { color: hsl(hue, 1, 0.5), core: hsl(hue, 1, 0.75), width: 0.055, intensity: 0.8, growMs: 170, holdMs: 380, fadeMs: 220, noise: 0.3, wobble: 0.05 });
  });
  await vfx.wait(170);
  panel.shatter(0xe8e0ff);
  sp.setOutline(0);
  if (!c.missed) {
    c.impact(0);
    softHit(c, to, YPAL, 1.2);
    for (let i = 0; i < 6; i++) vfx.burst(to, { count: 5, tex: 'spark', color: hsl(i / 6, 1, 0.7), speed: [3, 7], size: [0.12, 0.22], life: [0.25, 0.45], intensity: 1.4 });
    stage.chromaPulse(0.015, 300);
    vfx.shake(0.25, 350);
    c.target.flash(0xffffff, 250, 0.7);
  } else vfx.burst(to, { count: 12, tex: 'spark', color: [0xffffff, Y.lav], speed: [2, 4], size: [0.1, 0.18], life: 0.3 });
  await Promise.all([glints, vfx.wait(500)]);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- COSMIC POWER

registerMoveFx('COSMIC_POWER', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  pulledShot(c, 'user', 1.6, 0.8, 450);
  stage.setTint(0x2a2a7a, 0.5, 450);
  const ctr = sp.at(0.5);
  const H = sp.height;
  const { right: cr } = camBasis(c);
  const starCol = () => [0xffffff, Math.random() < 0.5 ? 0xb0c8ff : Y.lav] as [number, number];
  // a sky of stars in the screen plane around and above the user
  const dome = () => towardCam(c, ctr, 0.5).addScaledVector(cr, (Math.random() - 0.5) * (3 + H)).add(V3(0, H * 0.1 + Math.random() * (0.6 + H * 0.7), 0));
  // 1) the sky fills with twinkling stars and a constellation draws itself
  const twinkle = during(c, 1500, (k) => {
    if (Math.random() < 0.8 * (1 - k * 0.6)) {
      const s = 0.18 + Math.random() * 0.3;
      vfx.particle({ tex: 'star', pos: dome(), life: 0.7, size: [s, s * 0.3], color: starCol(), intensity: 1.5, alpha: [1, 0], fadeIn: 0.4, rot: Math.random() });
    }
  });
  const nodes = Array.from({ length: 6 }, (_, i) => {
    const a = -1.1 + (i / 5) * 2.2;
    return towardCam(c, ctr, 0.6).addScaledVector(cr, Math.sin(a) * (1.1 + H * 0.35)).add(V3(0, H * 0.55 + 0.3 + Math.cos(a * 2.3) * 0.3 + (i % 2) * 0.3, 0));
  });
  await vfx.wait(250);
  for (let i = 0; i < nodes.length; i++) {
    vfx.particle({ tex: 'star', pos: nodes[i], life: 1.1, size: [0.7, 0.4], color: 0xffffff, intensity: 1.6, alpha: [1, 0], fadeIn: 0.15, rot: 0 });
    vfx.particle({ tex: 'glow', pos: nodes[i], life: 1.1, size: [0.6, 0.4], color: 0x90b0ff, intensity: 0.9, alpha: [0.6, 0], fadeIn: 0.15 });
    if (i > 0) vfx.prim.ribbon([nodes[i - 1], nodes[i]], { color: 0x90b0ff, core: 0xffffff, width: 0.03, ms: 90, length: 1, holdMs: 700 - i * 60, fadeMs: 250, intensity: 0.9 });
    await vfx.wait(70);
  }
  await vfx.wait(200);
  // 2) starlight streams down into the user
  sp.setOutline(1.3, Y.lav);
  const pour = during(c, 550, () => {
    for (let i = 0; i < 3; i++) {
      const p = Math.random() < 0.3 ? nodes[Math.floor(Math.random() * nodes.length)].clone() : dome();
      vfx.particle({ tex: 'star', pos: p, vel: ctr.clone().sub(p).multiplyScalar(1.6), attract: { to: ctr, strength: 10 }, life: 0.45, size: [0.22, 0.08], color: starCol(), intensity: 1.5, alpha: [1, 0.3], spin: 4 });
    }
  });
  await pour;
  // 3) cosmic armor: Def & Sp. Def rise
  sp.flash(0xd0d8ff, 350, 0.55);
  vfx.prim.shield(ctr, { color: 0x9ab0ff, radius: Math.max(1.1, Math.max(sp.width, sp.height) * 0.6), ms: 800, intensity: 1.1 });
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: 0x9ab0ff, radius: 2.4, facing: 'ground', ms: 600, intensity: 1.3 });
  vfx.burst(ctr, { count: 20, tex: 'star', color: [0xffffff, Y.lav], speed: [2, 4], size: [0.14, 0.24], life: 0.45, intensity: 1.5 });
  await vfx.spiral(c.userFeet, { tex: 'star', color: [0xffffff, 0x9ab0ff], ms: 600, rate: 50, radius: Math.max(0.7, sp.width * 0.45), rise: 2.6, size: [0.14, 0.26], intensity: 1.4 });
  sp.setOutline(0);
  stage.setTint(0xffffff, 0, 400);
  await twinkle;
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- PSYBEAM

registerMoveFx('PSYBEAM', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 400);
  const from = c.attacker.at(0.65).addScaledVector(c.dir, 0.5);
  c.attacker.setOutline(1.3, Y.pink);
  vfx.burst(from, { count: 18, tex: 'spark', color: [Y.pale, Y.pink], speed: 0.2, jitter: 1.2, attract: { to: from, strength: 18 }, life: 0.3, size: [0.1, 0.2], intensity: 1.4 });
  vfx.particle({ tex: 'glow', pos: from, life: 0.3, size: [0.2, 1.0], color: Y.pink, intensity: 1.1, alpha: [0.3, 0.9] });
  await vfx.wait(300);
  c.attacker.setOutline(0);
  const to = c.aim(0.5);
  const fwd = to.clone().sub(from).normalize();
  const len = from.distanceTo(to);
  const grow = 200;
  const hold = 520;
  vfx.prim.beam(from, to, { color: Y.main, core: Y.pale, width: 0.16, intensity: 0.85, growMs: grow, holdMs: hold, fadeMs: 220, noise: 0.5, wobble: 0.2 });
  // multicolored rings ripple down the beam
  let last = -1000;
  let n = 0;
  const rings = during(c, grow + hold, (_k, _dt, el) => {
    if (el - last > 50) {
      last = el;
      n++;
      const travel = 0.32;
      vfx.particle({ tex: 'ring', pos: from.clone(), vel: fwd.clone().multiplyScalar(len / travel), life: travel, size: [0.5, 0.9 + 0.35 * Math.sin(n * 1.3)], color: hsl(0.9 + (n % 5) * 0.07, 0.9, 0.7), intensity: 1.3, alpha: [0.9, 0.6] });
    }
  });
  await vfx.wait(grow);
  if (!c.missed) {
    c.impact(0);
    softHit(c, to, YPAL, 1.1);
    stage.chromaPulse(0.012, 400);
    c.target.flash(Y.pink, 300, 0.5);
    vfx.shake(0.15, 350);
    const wob = mindWobble(c, c.target, hold + 200);
    let lr = -1000;
    await during(c, hold, (_k, _dt, el) => {
      if (el - lr > 110) {
        lr = el;
        vfx.prim.shockwave(to, { color: hsl(0.85 + Math.random() * 0.2), radius: 1.7, startRadius: 0.3, ms: 300, thickness: 0.12, intensity: 1.2 });
      }
      if (Math.random() < 0.5) vfx.burst(to, { count: 2, tex: 'spark', color: [Y.pale, Y.pink], speed: [2, 5], size: [0.1, 0.2], life: 0.3, intensity: 1.4 });
    });
    await wob;
  } else await vfx.wait(hold);
  await rings;
  await vfx.wait(150);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- EXTRASENSORY

registerMoveFx('EXTRASENSORY', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 400);
  stage.setTint(0x9060e0, 0.35, 350);
  // the user's eyes flash
  const eye = headOf(c.attacker).addScaledVector(c.dir, 0.25);
  c.attacker.setOutline(1.2, Y.violet);
  vfx.particle({ tex: 'star', pos: towardCam(c, eye, 0.4), life: 0.35, size: [0.2, 1.3], color: 0xffffff, intensity: 1.8, alpha: [1, 0], fadeIn: 0.3, rot: 0.3 });
  vfx.particle({ tex: 'glow', pos: eye, life: 0.35, size: [0.3, 1.0], color: Y.violet, intensity: 1.1, alpha: [0.8, 0] });
  await vfx.wait(300);
  c.attacker.setOutline(0);
  pulledShot(c, 'foe', 1.8, 0.7, 350);
  // a great psychic eye opens over the target
  const at = c.aim(0.55);
  const z = camScale(c, at);
  const S = 1.25 * z;
  const lidU = screenShape(c, at, [[-1, 0], [-0.6, 0.38], [0, 0.55], [0.6, 0.38], [1, 0]], S, 0.8);
  const lidL = screenShape(c, at, [[-1, 0], [-0.6, -0.38], [0, -0.55], [0.6, -0.38], [1, 0]], S, 0.8);
  const o = { color: Y.violet, core: Y.pale, width: 0.09 * z, ms: 240, length: 1, holdMs: 420, fadeMs: 240, intensity: 1.1, edge: Y.night, e: ease.inOutQuad };
  const lid = slashStroke(c, lidU, o);
  slashStroke(c, lidL, o);
  await lid.arrived;
  const pupil = towardCam(c, at, 0.85);
  vfx.particle({ tex: 'glow', pos: pupil, life: 0.6, size: [0.4 * z, 0.9 * z], color: Y.night, intensity: 1, additive: false, alpha: [0.8, 0], fadeIn: 0.2 });
  vfx.particle({ tex: 'ring', pos: pupil, life: 0.6, size: [0.3 * z, 0.9 * z], color: Y.pink, intensity: 1.3, alpha: [1, 0], fadeIn: 0.2 });
  vfx.particle({ tex: 'glow', pos: pupil, life: 0.5, size: [0.2 * z, 0.5 * z], color: Y.pink, intensity: 1.3, alpha: [1, 0], fadeIn: 0.3 });
  await vfx.wait(230);
  // it stares: a wave of force bursts out
  if (!c.missed) {
    c.impact(0);
    softHit(c, at, YPAL, 1.2);
    stage.flash(Y.lav, 0.2, 200);
    stage.chromaPulse(0.02, 400);
    stage.shockwave(at, 0.8, 350);
    hitStop(c, 60);
    vfx.shake(0.28, 350);
    for (let i = 0; i < 3; i++) stage.wait(i * 90).then(() => vfx.prim.shockwave(towardCam(c, at, 0.5), { color: i % 2 ? Y.violet : Y.pink, radius: (2 + i * 0.7) * z, ms: 380, thickness: 0.1, intensity: 1.3 }));
    await mindWobble(c, c.target, 450, Y.violet, 0.1);
  } else {
    vfx.prim.shockwave(at, { color: Y.violet, radius: 1.6, ms: 350, thickness: 0.12, intensity: 1.2 });
    await vfx.wait(400);
  }
  stage.setTint(0xffffff, 0, 350);
  await vfx.wait(100);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- PSYCHO BOOST

registerMoveFx('PSYCHO_BOOST', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  // 1) a vast sphere of psychic power gathers above the user; frame user + orb from either side
  const orbAt = sp.at(1).add(V3(0, 0.95, 0)).addScaledVector(c.dir, 0.3);
  const look = sp.at(0.55).lerp(orbAt, 0.5);
  const fs = focusShot(c.side, 1.2);
  const back = fs.pos.clone().sub(fs.look).normalize();
  stage.director.move({ pos: look.clone().addScaledVector(back, 9.5), look, fov: 40 }, 0.45);
  stage.setTint(0x5a2a90, 0.32, 450);
  const orb = vfx.prim.psyOrb({ color: Y.main, dark: 0x4a1070, core: Y.pale, rim: Y.pink, radius: 0.8 });
  orb.mesh.position.copy(orbAt);
  orb.mesh.scale.setScalar(0.01);
  const grow = vfx.tween(850, (k) => orb.mesh.scale.setScalar(0.01 + k), ease.outBack);
  let lastRing = -1000;
  await during(c, 900, (k, _dt, el) => {
    sp.setOutline(1 + Math.random() * 0.8, Math.random() < 0.5 ? Y.pink : Y.violet);
    for (let i = 0; i < 3; i++) {
      const d = V3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      const q = orbAt.clone().addScaledVector(d, 2.6 + Math.random() * 1.4);
      vfx.particle({ tex: 'streak', pos: q, vel: orbAt.clone().sub(q).multiplyScalar(3.4), life: 0.28, size: [0.8, 0.25], color: [Y.pale, Y.pink], intensity: 1.2, alpha: [0, 1], rot: screenAngle(c, q, orbAt) });
    }
    if (el - lastRing > 180) {
      lastRing = el;
      vfx.prim.shockwave(orbAt, { color: Math.floor(el / 180) % 2 ? Y.violet : Y.pink, startRadius: 2.6, radius: 0.9, ms: 260, thickness: 0.12, intensity: 1.1 });
      stage.shockwave(orbAt, 0.15 + k * 0.2, 180);
    }
    if (Math.random() < 0.3) vfx.shake(0.04 + k * 0.08, 100);
  });
  await grow;
  // 2) hurl it
  vfx.shot('side', c.side, 300);
  const to = c.aim(0.5);
  stage.flash(Y.pale, 0.12, 160);
  const flight = vfx.trail(() => orb.mesh.position, 420, { tex: 'spark', color: [Y.pale, Y.pink], size: [0.18, 0.32], speed: [0.5, 1.5], life: [0.25, 0.4], rate: 90, intensity: 1.3 });
  let lr = -1000;
  const from = orb.mesh.position.clone();
  await vfx.tween(420, (k) => {
    const p = from.clone().lerp(to, k);
    p.y += Math.sin(k * Math.PI) * 0.4;
    orb.mesh.position.copy(p);
    orb.mesh.scale.setScalar(1 - 0.35 * k);
    const t = c.stage.clock.time * 1000;
    if (t - lr > 70) {
      lr = t;
      vfx.prim.shockwave(p.clone(), { color: Y.pink, radius: 1.2, ms: 240, thickness: 0.14, facing: c.dir, intensity: 1.1 });
    }
  }, ease.inQuad);
  void flight;
  sp.setOutline(0);
  // 3) the sphere implodes... then detonates
  pulledShot(c, 'foe', 1.9, 0.9, 250);
  const z = camScale(c, to);
  const base = c.missed ? groundAt(c) : c.foeFeet.clone();
  for (let i = 0; i < 2; i++) vfx.prim.shockwave(to, { color: i ? Y.violet : Y.pale, startRadius: 2.4 * z, radius: 0.2, ms: 140, thickness: 0.14, intensity: 1.2 });
  await vfx.tween(140, (k) => orb.mesh.scale.setScalar(0.65 * (1 - 0.7 * k)), ease.inQuad);
  orb.dispose();
  if (!c.missed) {
    c.impact(0);
    impactFx(c, to, { strength: 1.4, pal: YPAL, stop: true, dust: 0xd8c0e8 });
    c.target.flash(0xffffff, 300, 1);
  }
  stage.flash(Y.pale, 0.1, 200);
  stage.chromaPulse(0.006, 300);
  stage.shockwave(to, 0.8, 400);
  vfx.shake(0.45, 650);
  // a crisp psychic sphere expands through the target, gyroscope rings spin out
  const blast = vfx.prim.psyOrb({ color: Y.main, dark: 0x4a1070, core: Y.pale, rim: Y.pink, radius: 1, rings: false });
  blast.mesh.position.copy(to);
  void vfx.tween(560, (k) => {
    blast.mesh.scale.setScalar((0.3 + (c.missed ? 1.5 : 2.1) * ease.outCubic(k)) * z);
    blast.u.alpha.value = 0.72 * (1 - k * k);
  }, ease.linear).then(() => blast.dispose());
  for (let i = 0; i < 4; i++) {
    const n = V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    stage.wait(i * 60).then(() => vfx.prim.shockwave(to, { color: i % 2 ? Y.violet : Y.pink, radius: (2.6 + i * 0.35) * z, ms: 520, thickness: 0.1, intensity: 1.2, facing: n }));
  }
  vfx.prim.pillar(base.clone().setY(base.y + 0.05), { color: Y.pink, radius: 0.4, height: 7, ms: 800, intensity: 0.5 });
  for (let i = 0; i < 3; i++) stage.wait(i * 110).then(() => vfx.prim.shockwave(base.clone().setY(base.y + 0.06), { color: i % 2 ? Y.violet : Y.pink, radius: 3.2 + i, facing: 'ground', ms: 650, thickness: 0.16, intensity: 1.1 }));
  vfx.burst(to, { count: 36, tex: 'spark', color: [Y.pale, Y.pink], speed: [5, 12], size: [0.14, 0.26], life: [0.4, 0.8], drag: 1.5, intensity: 1.4 });
  vfx.burst(to, { count: 18, tex: 'star', color: [Y.pale, Y.lav], speed: [2, 6], size: [0.18, 0.32], life: [0.4, 0.7], drag: 2, intensity: 1.1, additive: false });
  const wob = c.missed ? Promise.resolve() : mindWobble(c, c.target, 700, Y.violet, 0.12);
  await Promise.all([wob, vfx.wait(750)]);
  // 4) recoil: the user's power ebbs (Sp. Atk falls)
  vfx.shot('wide', c.side, 500);
  stage.setTint(0xffffff, 0, 450);
  sp.flash(0x5a3a8a, 400, 0.5);
  await vfx.spiral(c.userFeet, { tex: 'spark', color: [Y.lav, Y.deep], ms: 400, rate: 40, radius: Math.max(0.7, sp.width * 0.45), rise: 2.2, down: true, size: [0.12, 0.22], intensity: 1.2 });
});

// =============================================================================================== GRASS

const G = { light: 0xd0ff90, main: 0x5ad040, leaf: 0x48b830, deep: 0x2a8a20, dark: 0x1a4a14, gold: 0xffe070, sun: 0xfff2b0 };
const GPAL = { core: 0xeaffc0, main: 0x5ad040, dark: 0x1a5a1a };

/** Siphon of energy motes from the target back to the user, ending in heal sparkles. */
function drainMotes(c: MoveFxContext, o: { count: number; spreadMs: number; travelMs: number; color: number; core: number; heal?: number }) {
  const { vfx } = c;
  let healed = false;
  return motes({
    ctx: c,
    count: o.count,
    spreadMs: o.spreadMs,
    travelMs: o.travelMs,
    from: () => c.target.at(0.5),
    to: () => c.attacker.at(0.5),
    jitter: 0.6,
    arc: 1.2,
    up: 1.0,
    wiggle: 0.25,
    step: 0.12,
    e: ease.inOutQuad,
    emit: (p, _d, _k, i, head) => {
      vfx.particle({ tex: 'glow', pos: p, life: 0.22, size: [0.3, 0.05], color: o.color, intensity: 1.0, alpha: [0.8, 0] });
      if (head) vfx.particle({ tex: 'spark', pos: p, life: 0.06, size: 0.4, color: o.core, intensity: 1.2, alpha: [1, 0], rot: i });
    },
    onArrive: (p) => {
      vfx.burst(p, { count: 3, tex: 'spark', color: [o.core, o.color], speed: [1, 2], size: [0.1, 0.18], life: 0.25, intensity: 1.5 });
      if (!healed) {
        healed = true;
        void healSparkles(c, 'user', o.heal ?? o.color, 700);
      }
    },
  });
}

// --------------------------------------------------------------------------------------- SPORE

registerMoveFx('SPORE', async (c) => {
  const { vfx } = c;
  const col = { a: 0xe8d0a0, b: 0xa07848, spark: 0xfff0a0 };
  vfx.shot('side', c.side, 400);
  // the user puffs out a cloud of mushroom spores
  c.attacker.shake(0.1, 0.4);
  const top = c.attacker.at(0.9);
  vfx.burst(top, { count: 12, tex: 'smoke', color: [col.a, col.b], speed: [0.6, 1.8], dir: up, spread: 1.0, size: [0.4, 0.8], endSize: 1.5, life: 0.6, additive: false, alpha: [0.6, 0], intensity: 1 });
  vfx.burst(top, { count: 16, tex: 'dot', color: [0xffffff, col.spark], speed: [1, 2.5], dir: up, spread: 1.2, size: [0.08, 0.14], life: 0.5, intensity: 1.5 });
  await vfx.wait(220);
  await powderCloud(c, col, 750);
  const fall = powderFall(c, col, 800);
  await vfx.wait(350);
  if (!c.missed) {
    c.impact(0);
    c.target.flash(0xd8c8a0, 450, 0.45);
    // drowsy: Z's float up from the target
    const head = c.target.at(0.9);
    for (let i = 0; i < 3; i++) {
      c.stage.wait(120 + i * 200).then(() => {
        const s = 0.4 + Math.random() * 0.15;
        vfx.particle({ tex: 'zzz', pos: head.clone().add(V3(0.2 * i, 0, 0)), vel: V3(0.4, 0.9, 0), life: 0.9, size: [s, s * 1.8], color: [0xffffff, 0xc8d8ff], intensity: 1.3, alpha: [1, 0], fadeIn: 0.15, rot: (Math.random() - 0.5) * 0.4 });
      });
    }
  }
  await fall;
  await vfx.wait(250);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- SYNTHESIS

registerMoveFx('SYNTHESIS', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('attacker', c.side, 400);
  stage.setTint(0xfff0a0, 0.15, 400);
  // 1) sunlight breaks through and pours down on the user
  const feet = c.userFeet.clone();
  const R = Math.max(0.8, sp.width * 0.55);
  vfx.prim.pillar(feet.clone().setY(feet.y + 0.05), { color: 0xffd860, radius: R * 0.95, height: 9, ms: 1500, intensity: 0.3 });
  vfx.prim.shockwave(feet.clone().setY(feet.y + 0.05), { color: G.gold, radius: R * 2.4, facing: 'ground', ms: 700, intensity: 1.2 });
  sp.setOutline(1.0, G.gold);
  const rays = during(c, 1100, () => {
    if (Math.random() < 0.8) {
      const a = Math.random() * TAU;
      const r = Math.random() * R * 1.1;
      vfx.particle({ tex: 'streak', pos: feet.clone().add(V3(Math.cos(a) * r, 3 + Math.random() * 2, Math.sin(a) * r)), vel: V3(0, -4, 0), life: 0.7, size: [1.6, 1.0], color: [0xffffff, G.gold], intensity: 1.0, alpha: [0, 0.6], rot: Math.PI / 2 });
    }
    if (Math.random() < 0.7) {
      const a = Math.random() * TAU;
      const r = Math.random() * R * 1.4;
      vfx.particle({ tex: 'dot', pos: feet.clone().add(V3(Math.cos(a) * r, 2.5 + Math.random() * 1.5, Math.sin(a) * r)), vel: V3(0, -1.6, 0), life: 1.2, size: [0.1, 0.05], color: [0xffffff, G.gold], intensity: 1.5, alpha: [1, 0], fadeIn: 0.25 });
    }
  });
  await vfx.wait(450);
  // 2) the plant soaks it up: glow shifts from gold to green and HP returns
  const glow = during(c, 700, (k, _dt, el) => {
    sp.setOutline(1.0 + 0.5 * Math.sin(el * 0.012), k < 0.5 ? G.gold : G.light);
  });
  sp.flash(G.sun, 450, 0.5);
  const leaves = vfx.spiral(feet, { tex: 'leaf', color: [G.light, G.leaf], ms: 600, rate: 25, radius: R, rise: 2.4, size: [0.2, 0.3], intensity: 1.05, additive: false });
  await Promise.all([healSparkles(c, 'user', 0x9aff9a, 700), glow, leaves]);
  sp.setOutline(0);
  stage.setTint(0xffffff, 0, 400);
  await rays;
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- MAGICAL LEAF

registerMoveFx('MAGICAL_LEAF', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 400);
  const sp = c.attacker;
  const n = 9;
  const ctr = sp.at(0.55);
  const R = Math.max(0.9, sp.width * 0.6);
  const ring = (i: number, t: number) => ctr.clone().add(V3(Math.cos(t * 5 + (i / n) * TAU) * R, Math.sin(t * 7 + i) * 0.25 + 0.2, Math.sin(t * 5 + (i / n) * TAU) * R * 0.6));
  const spin = Array.from({ length: n }, () => (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 6));
  // 1) glowing leaves materialize and orbit the user
  sp.setOutline(1.1, G.light);
  const leafAt = (p: THREE.Vector3, i: number, t: number, a = 1) => {
    vfx.particle({ tex: 'glow', pos: p, life: 0.05, size: 0.95, color: hsl(t * 0.8 + i * 0.11, 0.9, 0.65), intensity: 0.8, alpha: [0.6 * a, 0.6 * a] });
    vfx.particle({ tex: 'leaf', pos: p, life: 0.045, size: 0.68, color: G.main, intensity: 1.1, additive: false, alpha: [a, a], rot: t * spin[i] });
  };
  await during(c, 500, (k, _dt, el) => {
    const t = el / 1000;
    for (let i = 0; i < n; i++) leafAt(ring(i, t), i, t, Math.min(1, k * 3));
    if (Math.random() < 0.5) vfx.particle({ tex: 'star', pos: ring(Math.floor(Math.random() * n), t), life: 0.3, size: [0.2, 0.05], color: [0xffffff, hsl(Math.random())], intensity: 1.5 });
  });
  sp.setOutline(0);
  // 2) they swerve through the air and home in on the target
  const to = c.aim(0.5);
  const starts = Array.from({ length: n }, (_, i) => ring(i, 0.5));
  let arrivals = 0;
  await motes({
    ctx: c,
    count: n,
    spreadMs: 320,
    travelMs: 620,
    from: (i) => starts[i].clone(),
    to: () => to.clone().add(V3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, 0)),
    jitter: 0.05,
    arc: 2.2,
    up: 1.3,
    wiggle: 0.35,
    step: 0.2,
    e: ease.inQuad,
    emit: (p, _d, _k, i, head) => {
      const t = c.stage.clock.time;
      if (head) leafAt(p, i, t);
      vfx.particle({ tex: Math.random() < 0.3 ? 'star' : 'dot', pos: p.clone(), vel: V3((Math.random() - 0.5) * 0.4, -0.3, (Math.random() - 0.5) * 0.4), life: 0.35, size: [0.14, 0.03], color: hsl(t * 0.8 + i * 0.11, 0.9, 0.72), intensity: 1.4, alpha: [0.9, 0] });
    },
    onArrive: (p, i) => {
      arrivals++;
      if (c.missed) {
        vfx.particle({ tex: 'leaf', pos: p, vel: c.dir.clone().multiplyScalar(4), acc: V3(0, -3, 0), life: 0.5, size: 0.4, color: G.main, additive: false, spin: 12, alpha: [1, 0] });
        return;
      }
      vfx.burst(p, { count: 5, tex: 'star', color: [0xffffff, hsl(i * 0.11)], speed: [1.5, 3.5], size: [0.1, 0.2], life: 0.3, intensity: 1.5 });
      vfx.prim.slash(p, { color: G.main, core: G.light, size: 0.5, angle: Math.random() * TAU, ms: 200, intensity: 1.0 });
      if (arrivals === 3) {
        c.impact(0);
        softHit(c, to, GPAL, 1.0);
        c.target.flash(G.light, 200, 0.5);
        stage.chromaPulse(0.006, 200);
        vfx.shake(0.14, 300);
      } else if (arrivals > 3) c.target.shake(0.05, 0.12);
    },
  });
  vfx.burst(to, { count: 10, tex: 'leaf', color: [G.light, G.leaf], speed: [1.5, 3], size: [0.16, 0.26], life: 0.6, spin: 10, gravity: 4, additive: false, intensity: 1.1 });
  await vfx.wait(300);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- MEGA DRAIN

registerMoveFx('MEGA_DRAIN', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 400);
  c.attacker.setOutline(1.2, G.main);
  // green tendrils of light latch onto the target
  const to = c.aim(0.5);
  const from = c.attacker.at(0.6).addScaledVector(c.dir, 0.4);
  vfx.particle({ tex: 'glow', pos: from, life: 0.3, size: [0.2, 1.0], color: G.main, intensity: 1.1, alpha: [0.3, 0.8] });
  await vfx.wait(250);
  const sv = sideOf(c.dir);
  for (let i = 0; i < 3; i++) {
    const mid = from.clone().lerp(to, 0.5).addScaledVector(sv, (i - 1) * 0.9).add(V3(0, 0.6 + Math.random() * 0.4, 0));
    vfx.prim.ribbon([from, mid, to], { color: G.main, core: G.light, width: 0.05, ms: 260, length: 0.6, fadeMs: 200, intensity: 1.0 });
  }
  await vfx.wait(260);
  c.attacker.setOutline(0);
  if (c.missed) {
    vfx.burst(to, { count: 10, tex: 'spark', color: [G.light, G.main], speed: [1, 3], size: [0.1, 0.18], life: 0.3 });
    await vfx.wait(350);
    vfx.shot('wide', c.side, 500);
    return;
  }
  c.impact(0);
  softHit(c, to, GPAL, 0.9);
  c.target.setOutline(1.3, G.main);
  c.target.flash(G.light, 350, 0.5);
  vfx.prim.shockwave(to, { color: G.main, radius: 1.6, startRadius: 1.6, ms: 400, intensity: 1.2 });
  // the life energy flows back
  const shrink = during(c, 500, (k) => {
    if (Math.random() < 0.6) {
      const p = c.target.at(0.2 + Math.random() * 0.7).add(V3((Math.random() - 0.5) * c.target.width * 0.7, 0, 0));
      vfx.particle({ tex: 'spark', pos: p, vel: new THREE.Vector3(), attract: { to: c.target.at(0.5), strength: 10 }, life: 0.3, size: [0.14, 0.04], color: [G.light, G.main], intensity: 1.4 });
    }
    void k;
  });
  await drainMotes(c, { count: 12, spreadMs: 400, travelMs: 650, color: G.main, core: G.light, heal: 0x9aff9a });
  await shrink;
  c.target.setOutline(0);
  await vfx.wait(250);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- LEAF BLADE

registerMoveFx('LEAF_BLADE', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('side', c.side, 350);
  // a blade of leaf-green light gleams on the arm
  const arm = sp.at(0.6).addScaledVector(c.dir, 0.45);
  sp.setOutline(1.3, G.main);
  vfx.particle({ tex: 'streak', pos: towardCam(c, arm, 0.4), life: 0.35, size: [0.3, 1.9], color: G.light, intensity: 1.5, alpha: [1, 0], fadeIn: 0.3, rot: 1.0 });
  vfx.particle({ tex: 'star', pos: towardCam(c, arm, 0.45), life: 0.35, size: [0.1, 1.1], color: 0xffffff, intensity: 1.8, alpha: [1, 0], fadeIn: 0.3, rot: 0.3 });
  vfx.burst(arm, { count: 8, tex: 'leaf', color: [G.light, G.leaf], speed: 0.2, jitter: 1, attract: { to: arm, strength: 14 }, life: 0.3, size: [0.15, 0.22], spin: 8, additive: false, intensity: 1.05 });
  await vfx.wait(300);
  await rush(c, { ms: 300, ghosts: 2, ghostColor: G.light, lines: true });
  sp.setOutline(0);
  const at = c.aim(0.55);
  const z = camScale(c, at);
  const flip = Math.abs(screenAngle(c, c.user, c.foe)) > Math.PI / 2 ? -1 : 1;
  const stroke = slashStroke(c, strokePoints(c, at, -0.85 * flip, 3.0 * z, 0.5 * z, 9, 0.9), { color: G.main, core: 0xf4ffe0, width: 0.16 * z, ms: 120, holdMs: 140, fadeMs: 240, intensity: 1.1, edge: G.dark });
  await stroke.arrived;
  if (c.missed) whiffAt(c, at, G.light);
  else {
    c.impact(0);
    impactFx(c, at, { strength: 1.2, pal: GPAL, stop: true, dust: 0xa8c888 });
    stage.flash(G.light, 0.12, 150);
    c.target.flash(G.light, 200, 0.6);
    // leaves cut loose along the stroke
    const pts = strokePoints(c, at, -0.85 * flip, 2.6 * z, 0.5 * z, 7, 0.9);
    for (const p of pts) vfx.burst(p, { count: 2, tex: 'leaf', color: [G.light, G.leaf], speed: [1.5, 3.5], size: [0.16, 0.26], life: 0.6, spin: 12, gravity: 4, additive: false, intensity: 1.05 });
  }
  await vfx.wait(550);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- NEEDLE ARM

registerMoveFx('NEEDLE_ARM', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('side', c.side, 350);
  // the spiked arm winds up
  sp.setOutline(1.2, G.main);
  const arm = () => sp.at(0.6).addScaledVector(c.dir, 0.45);
  await during(c, 300, () => {
    const p = arm();
    const d = V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    vfx.particle({ tex: 'streak', pos: p.clone().addScaledVector(d, 0.6), vel: d.clone().multiplyScalar(-2), life: 0.2, size: [0.5, 0.2], color: [0xf0ffc0, G.main], intensity: 1.2, rot: screenAngle(c, p, p.clone().add(d)) });
  });
  await rush(c, { ms: 320 });
  sp.setOutline(0);
  const at = c.aim(0.55);
  const z = camScale(c, at);
  // a spiked swing across the target
  const flip = Math.abs(screenAngle(c, c.user, c.foe)) > Math.PI / 2 ? -1 : 1;
  const sw = slashStroke(c, strokePoints(c, at, 0.5 * flip, 2.2 * z, -0.4 * z, 8, 0.9), { color: G.main, core: G.light, width: 0.12 * z, ms: 110, holdMs: 100, intensity: 1.05, edge: G.dark });
  await sw.arrived;
  if (c.missed) whiffAt(c, at, G.light);
  else {
    c.impact(0);
    impactFx(c, at, { strength: 1.0, pal: GPAL, dust: 0xa8c888 });
    c.target.flash(G.light, 200, 0.5);
    stage.shockwave(at, 0.4, 250);
    // a spray of thorns bursts out of the point of contact
    const p = towardCam(c, at, 0.5);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + Math.random() * 0.2;
      const d = screenDir(c, a);
      const q = p.clone().addScaledVector(d, 0.3);
      vfx.particle({ tex: 'streak', pos: q, vel: d.clone().multiplyScalar(6 + Math.random() * 3), drag: 4, life: 0.3, size: [0.6 * z, 0.3 * z], color: [0xf4ffd0, G.main], intensity: 1.2, alpha: [1, 0], rot: a });
    }
    vfx.burst(p, { count: 10, tex: 'shard', color: [G.light, G.deep], speed: [3, 6], size: [0.12, 0.2], life: 0.45, gravity: 8, spin: 10, additive: false, intensity: 1.05 });
  }
  await vfx.wait(500);
  vfx.shot('wide', c.side, 500);
});

// =============================================================================================== ICE

const I = { white: 0xffffff, frost: 0xdaf6ff, main: 0x9ae8ff, blue: 0x3a90ff, deep: 0x2a70c0, crystal: 0x58b0f0 };
const IPAL = { core: 0xffffff, main: 0x9ae8ff, dark: 0x3a7aa0 };

/** Frost the target briefly: icy silhouette flicker + a rime of glints. */
function frostOver(c: MoveFxContext, s: PokemonSprite, ms: number, amt = 0.55) {
  const u = s.uniforms;
  const sil = u.silColor.value as THREE.Color;
  const prev = sil.clone();
  sil.set(0xc8f0ff);
  return during(c, ms, (k) => {
    u.silhouette.value = amt * (1 - k * k);
    if (Math.random() < 0.4) c.vfx.particle({ tex: 'star', pos: towardCam(c, onBody(s), 0.3), life: 0.25, size: [0.3, 0.05], color: I.white, intensity: 1.6, rot: 0 });
    if (k >= 1) {
      u.silhouette.value = 0;
      sil.copy(prev);
    }
  });
}

// --------------------------------------------------------------------------------------- POWDER SNOW

registerMoveFx('POWDER_SNOW', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 400);
  const mouth = mouthOf(c, 0.5);
  vfx.burst(mouth, { count: 10, tex: 'smoke', color: [I.frost, I.main], speed: [0.3, 0.8], size: [0.3, 0.6], life: 0.4, additive: false, alpha: [0.5, 0], intensity: 1 });
  await vfx.wait(200);
  const to = c.aim(0.5);
  const fwd = to.clone().sub(mouth).normalize();
  const sv = sideOf(fwd);
  const len = mouth.distanceTo(to);
  const travel = 0.6;
  let hit = false;
  await during(c, 750, (_k, dt, el) => {
    const nS = Math.round(40 * dt + Math.random());
    for (let i = 0; i < nS; i++) {
      const d = fwd.clone().addScaledVector(sv, (Math.random() - 0.5) * 0.35).add(V3(0, (Math.random() - 0.4) * 0.3, 0)).normalize();
      vfx.particle({ tex: 'smoke', pos: mouth.clone(), vel: d.multiplyScalar(len / travel), life: travel * 1.1, size: [0.3, 1.1], color: [0xffffff, I.frost], intensity: 1, additive: false, alpha: [0.55, 0.1], spin: 2 });
    }
    const nF = Math.round(90 * dt + Math.random());
    for (let i = 0; i < nF; i++) {
      const d = fwd.clone().addScaledVector(sv, (Math.random() - 0.5) * 0.5).add(V3(0, (Math.random() - 0.4) * 0.45, 0)).normalize();
      const s = 0.1 + Math.random() * 0.14;
      vfx.particle({ tex: Math.random() < 0.6 ? 'star' : 'dot', pos: mouth.clone(), vel: d.multiplyScalar((len / travel) * (0.8 + Math.random() * 0.4)), life: travel * 1.15, size: [s, s * 0.8], color: [0xffffff, I.main], intensity: 1.5, alpha: [1, 0.3], spin: 5 });
    }
    if (el >= travel * 1000) {
      if (!hit && !c.missed) {
        hit = true;
        c.impact(0);
        c.target.flash(I.frost, 250, 0.5);
        vfx.shake(0.08, 250);
        void frostOver(c, c.target, 600, 0.4);
      }
      if (Math.random() < 0.5) vfx.burst(to, { count: 3, tex: 'star', color: [0xffffff, I.main], speed: [1, 3], size: [0.1, 0.18], life: 0.4, spin: 4, intensity: 1.5 });
    }
  });
  vfx.burst(to, { count: 10, tex: 'smoke', color: [0xffffff, I.frost], speed: [0.5, 1.5], size: [0.5, 0.9], endSize: 1.5, life: 0.6, additive: false, alpha: [0.5, 0], intensity: 1 });
  await vfx.wait(400);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- BLIZZARD

registerMoveFx('BLIZZARD', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 400);
  stage.setTint(0x9ac8f0, 0.35, 500);
  stage.setSaturation(0.8, 500);
  const sp = c.attacker;
  // 1) the user whips up freezing air
  sp.setOutline(1.3, I.main);
  const from = sp.at(0.6).addScaledVector(c.dir, 0.4);
  await during(c, 350, () => {
    const a = Math.random() * TAU;
    const q = from.clone().add(V3(Math.cos(a) * 1.4, (Math.random() - 0.5) * 1.2, Math.sin(a) * 1.4));
    vfx.particle({ tex: 'smoke', pos: q, vel: from.clone().sub(q).multiplyScalar(2.6), life: 0.38, size: [0.7, 0.2], color: [I.frost, I.main], intensity: 1, additive: false, alpha: [0, 0.5], spin: 2 });
    vfx.particle({ tex: 'star', pos: q.clone(), vel: from.clone().sub(q).multiplyScalar(2.6), life: 0.36, size: [0.2, 0.05], color: [I.white, I.main], intensity: 1.5, spin: 6 });
  });
  sp.setOutline(0);
  // 2) a howling snowstorm sweeps across the field
  const to = c.aim(0.5);
  const fwd = to.clone().sub(c.user).setY(0).normalize();
  const sv = sideOf(fwd);
  const span = c.user.distanceTo(to) + 3;
  const speed = 13;
  const emitAt = () => c.user.clone().addScaledVector(fwd, -1.5).addScaledVector(sv, (Math.random() - 0.5) * 5).add(V3(0, -0.6 + Math.random() * 3.4, 0));
  const storm = during(c, 1250, (k, dt) => {
    const ramp = Math.min(1, k * 4) * (k > 0.8 ? (1 - k) / 0.2 : 1);
    const nF = Math.round(380 * dt * ramp + Math.random());
    for (let i = 0; i < nF; i++) {
      const s = 0.14 + Math.random() * 0.22;
      const v = fwd.clone().multiplyScalar(speed * (0.8 + Math.random() * 0.4)).addScaledVector(sv, (Math.random() - 0.5) * 2).add(V3(0, -1 - Math.random() * 1.5, 0));
      vfx.particle({ tex: Math.random() < 0.55 ? 'star' : 'dot', pos: emitAt(), vel: v, life: span / speed, size: [s, s], color: [0xffffff, I.frost], intensity: 1.4, alpha: [1, 0.4], spin: 6 });
    }
    const nW = Math.round(45 * dt * ramp + Math.random());
    for (let i = 0; i < nW; i++) {
      const p = emitAt();
      const v = fwd.clone().multiplyScalar(speed * 1.3).add(V3(0, -1, 0));
      vfx.particle({ tex: 'streak', pos: p, vel: v, life: span / (speed * 1.3), size: [1.6, 2.2], color: [0xffffff, I.main], intensity: 0.8, alpha: [0.5, 0.2], rot: screenAngle(c, p, p.clone().add(v)) });
    }
    if (Math.random() < 0.5 * ramp) {
      const p = emitAt();
      vfx.particle({ tex: 'smoke', pos: p, vel: fwd.clone().multiplyScalar(speed * 0.8), life: span / (speed * 0.8), size: [1.2, 2.6], color: [0xffffff, I.frost], intensity: 1, additive: false, alpha: [0.35, 0.15], spin: 1.5 });
    }
    if (Math.random() < 0.15) c.attacker.shake(0.03, 0.1);
  });
  vfx.shake(0.12, 1200);
  await vfx.wait((c.user.distanceTo(to) / speed) * 1000 + 250);
  // 3) the target is engulfed and ice crystals burst from the ground
  const base = c.missed ? groundAt(c) : c.foeFeet.clone();
  vfx.prim.crystals(base.clone().setY(base.y + 0.1), { color: I.crystal, count: 9, size: 0.55, ms: 1000, spread: 1.4, dir: up, emissive: 0.25 });
  vfx.prim.shockwave(base.clone().setY(base.y + 0.06), { color: I.main, radius: 3, facing: 'ground', ms: 600, intensity: 1.3 });
  if (!c.missed) {
    c.impact(0);
    softHit(c, to, IPAL, 1.2);
    stage.flash(0xe0f4ff, 0.2, 200);
    vfx.shake(0.3, 400);
    c.target.flash(I.frost, 300, 0.7);
    void frostOver(c, c.target, 800, 0.6);
  }
  const swirl = during(c, 700, () => {
    if (Math.random() < 0.7) vfx.particle({ tex: 'smoke', pos: base.clone().add(V3((Math.random() - 0.5) * 2.4, 0.3 + Math.random() * 2, (Math.random() - 0.5) * 1.6)), vel: V3(0, 0.4, 0), swirl: { center: base, speed: 3 }, life: 0.7, size: [0.8, 1.8], color: [0xffffff, I.frost], intensity: 1, additive: false, alpha: [0.45, 0], spin: 2 });
  });
  await Promise.all([storm, swirl]);
  vfx.burst(base.clone().setY(base.y + 0.6), { count: 20, tex: 'shard', color: [I.white, I.crystal], speed: [2, 5], size: [0.12, 0.22], life: 0.5, gravity: 9, spin: 10, additive: false, intensity: 1.2, jitter: 1 });
  stage.setTint(0xffffff, 0, 450);
  stage.setSaturation(1.08, 450);
  await vfx.wait(300);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- ICY WIND

registerMoveFx('ICY_WIND', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 400);
  const from = c.attacker.at(0.55).addScaledVector(c.dir, 0.5);
  const to = c.aim(0.5);
  const fwd = to.clone().sub(from).normalize();
  const sv = sideOf(fwd);
  c.attacker.setOutline(1.1, I.main);
  vfx.burst(from, { count: 14, tex: 'star', color: [I.white, I.main], speed: 0.2, jitter: 1.1, attract: { to: from, strength: 16 }, life: 0.3, size: [0.12, 0.2], intensity: 1.4 });
  await vfx.wait(250);
  c.attacker.setOutline(0);
  // three chilling gusts corkscrew toward the target
  const ms = 520;
  const helix = (ph: number, r: number) =>
    Array.from({ length: 16 }, (_, i) => {
      const t = i / 15;
      const env = Math.sin(t * Math.PI) * 0.8 + 0.2;
      return from.clone().lerp(to, t).addScaledVector(sv, Math.cos(t * TAU * 1.5 + ph) * r * env).add(V3(0, Math.sin(t * TAU * 1.5 + ph) * r * 0.8 * env, 0));
    });
  const gusts = [0, 2.1, 4.2].map((ph, i) => vfx.prim.ribbon(helix(ph, 0.55 + i * 0.1), { color: I.main, core: 0xffffff, width: 0.05, ms, length: 0.45, fadeMs: 200, intensity: 0.9, e: ease.inOutQuad }));
  const frost = during(c, ms, (k) => {
    for (const g of gusts) {
      const p = g.headPos();
      vfx.particle({ tex: Math.random() < 0.5 ? 'star' : 'dot', pos: p.clone(), vel: V3((Math.random() - 0.5), -0.3, (Math.random() - 0.5)), life: 0.4, size: [0.14, 0.03], color: [0xffffff, I.main], intensity: 1.4, spin: 5 });
      if (Math.random() < 0.5) vfx.particle({ tex: 'smoke', pos: p.clone(), vel: fwd.clone().multiplyScalar(2), life: 0.4, size: [0.4, 0.9], color: [0xffffff, I.frost], intensity: 1, additive: false, alpha: [0.35, 0], spin: 2 });
    }
    void k;
  });
  await Promise.all(gusts.map((g) => g.arrived));
  if (!c.missed) {
    c.impact(0);
    softHit(c, to, IPAL, 0.9);
    c.target.flash(I.frost, 250, 0.5);
    vfx.shake(0.12, 300);
    // speed drop: frost clings and cold mist sinks to the ground
    const cold = frostOver(c, c.target, 650, 0.45);
    vfx.burst(to, { count: 16, tex: 'smoke', color: [0xffffff, I.frost], speed: [0.5, 1.2], size: [0.5, 1], endSize: 1.8, life: 0.8, gravity: 1.5, additive: false, alpha: [0.5, 0], intensity: 1, jitter: 0.6 });
    vfx.prim.shockwave(c.foeFeet.clone().setY(c.foeFeet.y + 0.05), { color: I.main, radius: 2.2, facing: 'ground', ms: 550, intensity: 1.2 });
    await Promise.all([frost, cold]);
  } else {
    vfx.burst(to, { count: 10, tex: 'star', color: [0xffffff, I.main], speed: [1, 3], size: [0.1, 0.16], life: 0.35 });
    await frost;
    await vfx.wait(300);
  }
  vfx.shot('wide', c.side, 500);
});

// =============================================================================================== POISON

const P = { pale: 0xf0b0ff, light: 0xd070ff, main: 0xa030d0, deep: 0x6a1a90, dark: 0x2a0838 };
const PPAL = { core: 0xf0a0ff, main: 0xb040e0, dark: 0x4a0a5a };

/** Toxic bubbles popping around a point. */
function toxicBubbles(c: MoveFxContext, at: THREE.Vector3, ms: number, radius = 0.8, rate = 0.5) {
  return during(c, ms, () => {
    if (Math.random() < rate) {
      const p = at.clone().add(V3((Math.random() - 0.5) * 2 * radius, (Math.random() - 0.5) * radius, (Math.random() - 0.5) * 2 * radius));
      c.vfx.particle({ tex: 'bubble', pos: p, vel: V3(0, 0.8 + Math.random(), 0), life: 0.6, size: [0.1, 0.3], color: P.light, intensity: 1.3, alpha: [0.9, 0.6] });
    }
  });
}

/** Goo splatter: normal-blended purple blobs thrown out with gravity. */
function gooSplat(c: MoveFxContext, at: THREE.Vector3, k = 1) {
  const { vfx } = c;
  for (let i = 0; i < Math.round(34 * k); i++) {
    const d = V3((Math.random() - 0.5) * 2, 0.3 + Math.random() * 1.1, (Math.random() - 0.5) * 2).normalize();
    const s = 0.16 + Math.random() * 0.22;
    vfx.particle({ tex: Math.random() < 0.5 ? 'drop' : 'dot', pos: at.clone(), vel: d.multiplyScalar(3 + Math.random() * 4), acc: V3(0, -13, 0), drag: 0.4, life: 0.55 + Math.random() * 0.3, size: [s, s * 0.6], color: [P.main, P.deep], intensity: 1.05, additive: false, alpha: [1, 0.6] });
  }
  vfx.burst(at, { count: Math.round(8 * k), tex: 'smoke', color: [P.light, P.deep], speed: [1, 2.5], size: [0.5, 0.9], endSize: 1.6, life: 0.6, additive: false, alpha: [0.55, 0], drag: 3, intensity: 1 });
}

// --------------------------------------------------------------------------------------- SLUDGE

registerMoveFx('SLUDGE', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 400);
  const from = mouthOf(c, 0.55);
  const gurgle = toxicBubbles(c, c.user, 380, 0.6, 0.7);
  vfx.burst(from, { count: 14, tex: 'drop', color: [P.main, P.deep], speed: 0.2, jitter: 1, attract: { to: from, strength: 16 }, life: 0.3, size: [0.12, 0.2], additive: false, intensity: 1.05 });
  await gurgle;
  // a volley of sludge globs is flung at the target
  const to = c.aim(0.5);
  let first = true;
  const flights: Promise<void>[] = [];
  for (let i = 0; i < 3; i++) {
    const blob = vfx.prim.blob({ color: P.main, radius: 0.22 + (i === 0 ? 0.06 : 0), emissive: 0.35, roughness: 0.25 });
    const dest = to.clone().add(V3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0));
    const trail = vfx.trail(() => blob.mesh.position, 480, { tex: 'drop', color: [P.main, P.deep], size: [0.1, 0.18], speed: 0.4, gravity: 7, life: [0.25, 0.4], rate: 35, additive: false, intensity: 1.05 });
    flights.push(
      blob.fly(from.clone().add(V3(0, (Math.random() - 0.5) * 0.2, 0)), dest, 480, 1.4 + Math.random() * 0.6, ease.inQuad).then(async () => {
        blob.dispose();
        gooSplat(c, dest, first ? 0.9 : 0.5);
        if (!c.missed && first) {
          first = false;
          c.impact(0);
          c.target.flash(P.main, 400, 0.7);
          vfx.shake(0.2, 300);
          vfx.prim.blast(dest, { core: P.pale, main: P.main, dark: P.dark, radius: 0.9, ms: 600, rise: 0.2, intensity: 1.0, disp: 0.8 });
        } else if (!c.missed) c.target.shake(0.06, 0.15);
        await trail;
      }),
    );
    await vfx.wait(110);
  }
  await Promise.all(flights);
  if (!c.missed) {
    const ooze = during(c, 550, () => {
      if (Math.random() < 0.5) {
        const p = c.target.at(0.5 + Math.random() * 0.4).add(V3((Math.random() - 0.5) * c.target.width * 0.6, 0, 0.1));
        vfx.particle({ tex: 'drop', pos: p, vel: V3(0, -0.6, 0), acc: V3(0, -3, 0), life: 0.6, size: [0.16, 0.1], color: [P.main, P.deep], additive: false, intensity: 1 });
      }
    });
    await Promise.all([ooze, toxicBubbles(c, to, 550, 0.7, 0.6)]);
  } else await vfx.wait(350);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- POISON FANG

registerMoveFx('POISON_FANG', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 350);
  c.attacker.setOutline(1.1, P.light);
  // venom beads on the fangs
  vfx.burst(mouthOf(c, 0.4), { count: 8, tex: 'drop', color: [P.light, P.main], speed: [0.3, 0.8], gravity: 4, size: [0.1, 0.16], life: 0.4, additive: false, intensity: 1.05 });
  await vfx.wait(200);
  await rush(c, { ms: 300, dist: Math.min(3.4, c.user.distanceTo(c.foe) * 0.45) });
  c.attacker.setOutline(0);
  const at = c.aim(0.55);
  const p = towardCam(c, at, 1.0);
  const z = camScale(c, p);
  vfx.particle({ tex: 'glow', pos: p.clone(), life: 0.45, size: [1.0 * z, 1.8 * z], color: P.dark, intensity: 1, additive: false, alpha: [0.0, 0.4], fadeIn: 0.6 });
  const f = vfx.prim.fangs(p, { color: 0xf4e8ff, edge: P.deep, size: 0.8 * z, ms: 540, intensity: 0.95 });
  await f.bitten;
  if (c.missed) whiffAt(c, at, P.pale);
  else {
    c.impact(0);
    impactFx(c, at, { strength: 1.0, pal: PPAL, ground: false });
    c.target.flash(P.main, 450, 0.7);
    // venom squirts from the bite
    for (let i = 0; i < 16; i++) {
      const d = V3((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2).normalize();
      vfx.particle({ tex: 'drop', pos: p.clone().add(V3((Math.random() - 0.5) * 0.8 * z, 0, 0)), vel: d.multiplyScalar(2 + Math.random() * 3), acc: V3(0, -11, 0), life: 0.5, size: [0.18, 0.08], color: [P.light, P.main], intensity: 1.05, additive: false, alpha: [1, 0.5] });
    }
    vfx.burst(p, { count: 8, tex: 'smoke', color: [P.light, P.deep], speed: [0.6, 1.4], size: [0.4, 0.8], endSize: 1.4, life: 0.6, additive: false, alpha: [0.5, 0], intensity: 1 });
    void toxicBubbles(c, at, 500, 0.6, 0.6);
  }
  await f.done;
  await vfx.wait(250);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- ACID ARMOR

registerMoveFx('ACID_ARMOR', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('attacker', c.side, 400);
  const u = sp.uniforms;
  const sil = u.silColor.value as THREE.Color;
  const prev = sil.clone();
  sil.set(0x9a4ad0);
  const feet = c.userFeet.clone();
  const W0 = Math.max(0.8, sp.width * 0.6);
  // 1) the body liquefies and slumps into a glossy puddle
  const drip = during(c, 1100, (k) => {
    if (Math.random() < 0.6 * (1 - k * 0.5)) {
      const p = sp.at(0.2 + Math.random() * 0.6).add(V3((Math.random() - 0.5) * sp.width * 0.7, 0, 0.1));
      vfx.particle({ tex: 'drop', pos: p, vel: V3(0, -0.5, 0), acc: V3(0, -6, 0), life: 0.45, size: [0.18, 0.1], color: [P.light, P.main], intensity: 1.05, additive: false, alpha: [1, 0.6] });
    }
    if (Math.random() < 0.4) {
      const a = Math.random() * TAU;
      vfx.particle({ tex: 'bubble', pos: feet.clone().add(V3(Math.cos(a) * W0 * Math.random(), 0.15, Math.sin(a) * W0 * Math.random() * 0.6)), vel: V3(0, 0.6, 0), life: 0.4, size: [0.08, 0.22], color: P.pale, intensity: 1.2, alpha: [0.9, 0.5] });
    }
  });
  vfx.prim.shockwave(feet.clone().setY(feet.y + 0.04), { color: P.main, radius: W0 * 2, facing: 'ground', ms: 700, intensity: 1.1 });
  vfx.burst(feet.clone().setY(feet.y + 0.1), { count: 12, tex: 'smoke', color: [P.light, P.main], speed: [0.8, 1.6], size: [0.6, 1.0], endSize: 1.6, life: 0.9, additive: false, alpha: [0.55, 0], flat: true, intensity: 1 });
  await stage.tween(480, (k) => {
    u.silhouette.value = 0.65 * k;
    sp.body.scale.set(1 + 0.35 * k, 1 - 0.6 * k, 1);
  }, ease.inOutQuad);
  // 2) a glossy sheen sweeps across the liquid
  const { right } = camBasis(c);
  const sheenY = sp.at(0.18);
  await during(c, 320, (k) => {
    const p = towardCam(c, sheenY.clone().addScaledVector(right, (k - 0.5) * sp.width * 1.3), 0.4);
    vfx.particle({ tex: 'streak', pos: p, life: 0.12, size: [0.3, 0.9], color: 0xffffff, intensity: 1.4, alpha: [0.9, 0], rot: 1.3 });
    vfx.particle({ tex: 'star', pos: p, life: 0.15, size: [0.3, 0.05], color: P.pale, intensity: 1.5, rot: 0 });
  });
  // 3) it reforms, sealed in a tough liquid coat (Defense up)
  await stage.tween(360, (k) => {
    sp.body.scale.set(1.35 - 0.35 * k, 0.4 + 0.6 * k, 1);
    u.silhouette.value = 0.65 * (1 - k * 0.6);
  }, ease.outBack);
  sp.body.scale.set(1, 1, 1);
  sp.setOutline(1.4, P.light);
  vfx.prim.shockwave(feet.clone().setY(feet.y + 0.05), { color: P.light, radius: 2.2, facing: 'ground', ms: 550, intensity: 1.3 });
  const spiral = vfx.spiral(feet, { tex: 'spark', color: [P.pale, P.main], ms: 500, rate: 45, radius: Math.max(0.7, sp.width * 0.45), rise: 2.4, size: [0.12, 0.24], intensity: 1.4 });
  await stage.tween(400, (k) => (u.silhouette.value = 0.26 * (1 - k)));
  u.silhouette.value = 0;
  sil.copy(prev);
  await Promise.all([spiral, drip]);
  sp.setOutline(0);
  vfx.shot('wide', c.side, 500);
});

// =============================================================================================== BUG

const B = { core: 0xf0ffb0, main: 0xb0d020, deep: 0x6a8a10, dark: 0x3a4a0a, needle: 0xf4f8e8 };
const BPAL = { core: 0xf0ffb0, main: 0xb0d020, dark: 0x4a5a0a };

/**
 * A glowing needle streaking from `from` to `to` in `ms`; `glow` tints its trail. Resolves on arrival.
 */
function needle(c: MoveFxContext, from: THREE.Vector3, to: THREE.Vector3, ms: number, glow: number) {
  const { vfx } = c;
  const dir = to.clone().sub(from).normalize();
  let prev = from.clone();
  return during(c, ms, (k) => {
    const p = from.clone().lerp(to, k);
    const rot = screenAngle(c, prev, p.clone().addScaledVector(dir, 0.01));
    vfx.particle({ tex: 'streak', pos: p.clone(), life: 0.04, size: 0.75, color: B.needle, intensity: 1.4, alpha: [1, 1], rot });
    const d = p.distanceTo(prev);
    const n = Math.max(1, Math.ceil(d / 0.18));
    for (let i = 0; i < n; i++) {
      const q = prev.clone().lerp(p, i / n);
      vfx.particle({ tex: 'glow', pos: q, life: 0.18, size: [0.28, 0.04], color: glow, intensity: 1.0, alpha: [0.7, 0] });
    }
    prev = p;
  });
}

// --------------------------------------------------------------------------------------- SIGNAL BEAM

registerMoveFx('SIGNAL_BEAM', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 400);
  const cols = [0xff2050, 0x30e040, 0x3070ff, 0xffc020];
  const from = c.attacker.at(0.7).addScaledVector(c.dir, 0.45);
  // a flickering signal light blinks on
  let blink = 0;
  await during(c, 380, (_k, _dt, el) => {
    const i = Math.floor(el / 70);
    if (i !== blink) {
      blink = i;
      vfx.particle({ tex: 'glow', pos: from, life: 0.07, size: 0.9 + (i % 2) * 0.4, color: cols[i % cols.length], intensity: 1.2, alpha: [0.9, 0.4] });
      c.attacker.setOutline(1.2, cols[i % cols.length]);
    }
  });
  c.attacker.setOutline(0);
  const to = c.aim(0.5);
  const fwd = to.clone().sub(from).normalize();
  const len = from.distanceTo(to);
  const grow = 170;
  // the main beam, overlaid with rapidly swapping colored beams
  vfx.prim.beam(from, to, { color: B.main, core: 0xffffff, width: 0.07, intensity: 0.6, growMs: grow, holdMs: 520, fadeMs: 200, noise: 0.5, wobble: 0.15 });
  let last = -1000;
  let n = 0;
  const flick = during(c, grow + 520, (_k, _dt, el) => {
    if (el - last > 65) {
      last = el;
      n++;
      const col = cols[n % cols.length];
      const reach = Math.min(1, el / grow);
      vfx.prim.beam(from, from.clone().lerp(to, reach), { color: col, core: col, width: 0.13, intensity: 0.7, growMs: 20, holdMs: 40, fadeMs: 40, noise: 0.3, wobble: 0.25 });
      for (let j = 0; j < 2; j++) vfx.particle({ tex: 'ring', pos: from.clone(), vel: fwd.clone().multiplyScalar(len / (0.3 + j * 0.12)), life: 0.3 + j * 0.12, size: [0.35, 0.75], color: cols[(n + j * 2) % cols.length], intensity: 0.8, alpha: [0.9, 0.6] });
    }
    if (Math.random() < 0.6) vfx.particle({ tex: 'dot', pos: from.clone().lerp(to, Math.random() * Math.min(1, el / grow)), vel: V3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2), life: 0.3, size: [0.1, 0.03], color: cols[Math.floor(Math.random() * 4)], intensity: 1.5 });
  });
  await vfx.wait(grow);
  if (!c.missed) {
    c.impact(0);
    softHit(c, to, BPAL, 1.1);
    stage.chromaPulse(0.015, 450);
    vfx.shake(0.18, 350);
    // the target's senses scramble: color flicker + wobble
    const fc = c.target.uniforms.flashColor.value as THREE.Color;
    const wob = mindWobble(c, c.target, 620, 0xb0d020, 0.1);
    await during(c, 520, (k, _dt, el) => {
      fc.set(cols[Math.floor(el / 60) % cols.length]);
      c.target.uniforms.flashAmt.value = 0.45 * (1 - k);
      if (Math.random() < 0.6) vfx.burst(to, { count: 2, tex: 'spark', color: cols[Math.floor(Math.random() * 4)], speed: [2, 5], size: [0.1, 0.2], life: 0.3, intensity: 1.4 });
    });
    c.target.uniforms.flashAmt.value = 0;
    await wob;
  } else await vfx.wait(520);
  await flick;
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- LEECH LIFE

registerMoveFx('LEECH_LIFE', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 350);
  await rush(c, { ms: 300, dist: Math.min(3.4, c.user.distanceTo(c.foe) * 0.45) });
  const at = c.aim(0.55);
  const p = towardCam(c, at, 1.0);
  const z = camScale(c, p);
  const f = vfx.prim.fangs(p, { color: 0xf8ffe0, edge: B.dark, size: 0.55 * z, ms: 460, intensity: 0.9 });
  await f.bitten;
  if (c.missed) {
    whiffAt(c, at, B.core);
    await f.done;
    vfx.shot('wide', c.side, 500);
    return;
  }
  c.impact(0);
  impactFx(c, at, { strength: 0.7, pal: BPAL, ground: false });
  c.target.flash(0xff4050, 300, 0.5);
  vfx.burst(p, { count: 10, tex: 'drop', color: [0xff5060, 0xa01020], speed: [1.5, 3], gravity: 9, size: [0.1, 0.16], life: 0.45, additive: false, intensity: 1.05 });
  await f.done;
  // life is sipped back to the user
  await drainMotes(c, { count: 9, spreadMs: 300, travelMs: 600, color: 0xff6a7a, core: 0xfff0f0, heal: 0x9aff9a });
  await vfx.wait(200);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- PIN MISSILE

registerMoveFx('PIN_MISSILE', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 400);
  const sp = c.attacker;
  const sv = sideOf(c.dir);
  sp.setOutline(1.1, B.main);
  vfx.burst(sp.at(0.6).addScaledVector(c.dir, 0.4), { count: 12, tex: 'spark', color: [B.core, B.main], speed: 0.2, jitter: 1, attract: { to: sp.at(0.6).addScaledVector(c.dir, 0.4), strength: 16 }, life: 0.25, size: [0.1, 0.18], intensity: 1.4 });
  await vfx.wait(250);
  sp.setOutline(0);
  const n = Math.max(1, c.hits);
  const shots: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    const off = (i % 2 ? 1 : -1) * (0.25 + 0.1 * (i % 3));
    const from = sp.at(0.55 + (i % 3) * 0.1).addScaledVector(c.dir, 0.5).addScaledVector(sv, off);
    const hitAt = c.aim(0.45 + (i % 3) * 0.1).addScaledVector(sv, off * 0.6);
    const dest = c.missed ? hitAt.clone().addScaledVector(c.dir, 3) : hitAt;
    sp.shake(0.04, 0.08);
    vfx.particle({ tex: 'glow', pos: from, life: 0.12, size: [0.7, 0.2], color: B.main, intensity: 1.0, alpha: [0.8, 0] });
    shots.push(
      needle(c, from, dest, c.missed ? 380 : 230, B.main).then(() => {
        if (c.missed) return;
        c.impact(i);
        impactFx(c, hitAt, { strength: 0.6, pal: BPAL, ground: i === n - 1 });
        vfx.burst(hitAt, { count: 5, tex: 'shard', color: [B.needle, B.main], speed: [2, 4], size: [0.1, 0.16], life: 0.35, gravity: 8, spin: 10, additive: false, intensity: 1.05 });
      }),
    );
    await vfx.wait(170);
  }
  await Promise.all(shots);
  await vfx.wait(400);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- FURY CUTTER

registerMoveFx('FURY_CUTTER', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 350);
  const sp = c.attacker;
  // scythes gleam
  const arm = sp.at(0.65).addScaledVector(c.dir, 0.4);
  vfx.particle({ tex: 'star', pos: towardCam(c, arm, 0.4), life: 0.3, size: [0.1, 1.0], color: 0xffffff, intensity: 1.8, alpha: [1, 0], fadeIn: 0.3, rot: 0.4 });
  sp.setOutline(1.1, B.main);
  await vfx.wait(220);
  await rush(c, { ms: 300, ghosts: 2, ghostColor: B.core });
  sp.setOutline(0);
  const at = c.aim(0.55);
  const z = camScale(c, at);
  // two scything crescents cross over the target, the second faster and brighter
  const o = { color: B.main, core: 0xfaffe0, width: 0.1 * z, ms: 110, holdMs: 90, fadeMs: 200, intensity: 1.05, edge: B.dark };
  const s1 = slashStroke(c, strokePoints(c, at, -0.8, 2.3 * z, 0.5 * z, 9, 0.9), o);
  await s1.arrived;
  if (!c.missed) vfx.burst(towardCam(c, at, 0.6), { count: 8, tex: 'spark', color: [B.core, B.main], speed: [3, 6], size: [0.1, 0.2], life: 0.25, intensity: 1.4 });
  await vfx.wait(60);
  const s2 = slashStroke(c, strokePoints(c, at, 0.8 + Math.PI, 2.6 * z, 0.55 * z, 9, 0.9), { ...o, width: 0.13 * z, ms: 90, intensity: 1.15 });
  await s2.arrived;
  if (c.missed) whiffAt(c, at, B.core);
  else {
    c.impact(0);
    impactFx(c, at, { strength: 0.9, pal: BPAL, dust: 0xb8b888 });
    stage.flash(B.core, 0.08, 120);
    c.target.flash(B.core, 200, 0.5);
  }
  await vfx.wait(450);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- TWINEEDLE

registerMoveFx('TWINEEDLE', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 400);
  const sp = c.attacker;
  const sv = sideOf(c.dir);
  const tips = [-1, 1].map((s) => sp.at(0.5).addScaledVector(c.dir, 0.5).addScaledVector(sv, s * Math.max(0.35, sp.width * 0.3)));
  // both stingers glint with venom
  sp.setOutline(1.1, P.light);
  for (const t of tips) {
    vfx.particle({ tex: 'star', pos: towardCam(c, t, 0.3), life: 0.3, size: [0.1, 0.9], color: 0xffffff, intensity: 1.8, alpha: [1, 0], fadeIn: 0.3, rot: 0.3 });
    vfx.particle({ tex: 'glow', pos: t, life: 0.3, size: [0.2, 0.7], color: P.light, intensity: 1.0, alpha: [0.3, 0.9] });
  }
  await vfx.wait(280);
  sp.setOutline(0);
  const n = Math.max(1, Math.min(2, c.hits));
  const shots: Promise<void>[] = [];
  for (let i = 0; i < 2; i++) {
    const hitAt = c.aim(0.5).addScaledVector(sv, (i ? 1 : -1) * 0.25);
    const dest = c.missed ? hitAt.clone().addScaledVector(c.dir, 3) : hitAt;
    sp.shake(0.05, 0.1);
    shots.push(
      needle(c, tips[i], dest, c.missed ? 380 : 240, P.light).then(() => {
        if (c.missed || i >= n) return;
        c.impact(i);
        impactFx(c, hitAt, { strength: 0.75, pal: { core: 0xf8e8ff, main: 0xc070e0, dark: 0x4a0a5a }, ground: i === 1 });
        vfx.burst(hitAt, { count: 8, tex: 'drop', color: [P.light, P.main], speed: [1.5, 3], gravity: 9, size: [0.1, 0.16], life: 0.45, additive: false, intensity: 1.05 });
      }),
    );
    await vfx.wait(200);
  }
  await Promise.all(shots);
  if (!c.missed) await toxicBubbles(c, c.aim(0.5), 400, 0.5, 0.5);
  await vfx.wait(250);
  vfx.shot('wide', c.side, 500);
});

// =============================================================================================== STEEL

const S = { white: 0xffffff, silver: 0xd8e2f0, steel: 0x9aa8bc, blue: 0x9ab8ff, dark: 0x4a5a70 };
const SPAL = { core: 0xffffff, main: 0xa8c8f0, dark: 0x4a5a70 };

/** A cross-shaped metallic glint. */
function glint(c: MoveFxContext, at: THREE.Vector3, size = 1, delay = 0) {
  c.vfx.particle({ tex: 'star', pos: towardCam(c, at, 0.4), life: 0.35, size: [0.1 * size, 1.1 * size], color: 0xffffff, intensity: 2.0, alpha: [1, 0], fadeIn: 0.25 + delay, rot: 0.2 });
  c.vfx.particle({ tex: 'streak', pos: towardCam(c, at, 0.4), life: 0.3, size: [0.2 * size, 1.6 * size], color: 0xe0ecff, intensity: 1.6, alpha: [1, 0], fadeIn: 0.3 + delay, rot: 0 });
}

// --------------------------------------------------------------------------------------- IRON DEFENSE

registerMoveFx('IRON_DEFENSE', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('attacker', c.side, 400);
  const u = sp.uniforms;
  const sil = u.silColor.value as THREE.Color;
  const prev = sil.clone();
  // 1) the body hardens into polished iron, top to bottom
  sil.set(0x7a8aa4);
  const { right } = camBasis(c);
  await stage.tween(420, (k) => {
    u.silhouette.value = 0.85 * k;
    const p = towardCam(c, sp.at(1 - k), 0.35);
    for (let i = 0; i < 2; i++) vfx.particle({ tex: 'streak', pos: p.clone().addScaledVector(right, (Math.random() - 0.5) * sp.width * 0.8), life: 0.15, size: [0.8, 0.3], color: 0xe8f0ff, intensity: 1.3, alpha: [0.9, 0], rot: 0 });
  }, ease.inOutQuad);
  // 2) CLANG: an iron shell rings out
  stage.flash(0xe8f0ff, 0.1, 150);
  vfx.shake(0.12, 250);
  hitStop(c, 40);
  const ctr = sp.at(0.5);
  const R = THREE.MathUtils.clamp(Math.max(sp.width, sp.height) * 0.6, 1.1, 1.7);
  for (let i = 0; i < 3; i++) stage.wait(i * 100).then(() => vfx.prim.shockwave(towardCam(c, ctr, 0.3), { color: i % 2 ? S.white : S.silver, radius: R * (1.4 + i * 0.4), ms: 380, thickness: 0.08, intensity: 1.1 }));
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: S.silver, radius: 2.4, facing: 'ground', ms: 550, intensity: 1.2 });
  vfx.burst(towardCam(c, ctr, 0.5), { count: 16, tex: 'spark', color: [0xffffff, 0xffd070], speed: [3, 7], size: [0.08, 0.16], life: [0.3, 0.5], gravity: 10, drag: 1, intensity: 1.8 });
  // 3) glints race over the metal
  for (let i = 0; i < 4; i++) glint(c, onBody(sp, 0.8), 0.8, i * 0.12);
  await vfx.wait(450);
  await stage.tween(350, (k) => (u.silhouette.value = 0.85 * (1 - k)));
  u.silhouette.value = 0;
  sil.copy(prev);
  await vfx.wait(100);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- METEOR MASH

registerMoveFx('METEOR_MASH', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('side', c.side, 350);
  // 1) the fist gathers starlight
  const fist = () => sp.at(0.55).addScaledVector(c.dir, 0.55);
  sp.setOutline(1.3, S.blue);
  await during(c, 380, (k) => {
    const p = fist();
    const a = Math.random() * TAU;
    const q = p.clone().add(V3(Math.cos(a) * 1.2, Math.sin(a) * 1.2, (Math.random() - 0.5) * 0.5));
    vfx.particle({ tex: 'star', pos: q, vel: p.clone().sub(q).multiplyScalar(3), life: 0.3, size: [0.25, 0.08], color: [0xffffff, S.blue], intensity: 1.5, spin: 5 });
    vfx.particle({ tex: 'glow', pos: p, life: 0.07, size: 0.6 + k * 0.6, color: S.blue, intensity: 1.0, alpha: [0.7, 0] });
  });
  // 2) a meteor streaks down as the user charges in, comet-trail fist leading
  const at = c.aim(0.55);
  const skyFrom = at.clone().addScaledVector(c.dir, -3).addScaledVector(sideOf(c.dir), 1.2).add(V3(0, 4.8, 0));
  const meteor = vfx.prim.orb({ color: S.blue, core: 0xffffff, radius: 0.42, intensity: 1.3 });
  meteor.mesh.position.copy(skyFrom);
  const mTrail = vfx.trail(() => meteor.mesh.position, 300, { tex: 'flame', color: [0xd8e8ff, 0x5a7ad0], size: [0.6, 0.9], endSize: 0.1, speed: 0.4, life: [0.2, 0.35], rate: 120, intensity: 1.0 });
  const mStars = vfx.trail(() => meteor.mesh.position, 300, { tex: 'star', color: [0xffffff, S.blue], size: [0.15, 0.3], speed: 1.5, life: [0.3, 0.5], rate: 40, intensity: 1.5, spin: 6 });
  const fly = meteor.fly(skyFrom, at, 300, 0.2, ease.inQuad);
  const comet = during(c, 330, () => {
    const p = fist();
    vfx.particle({ tex: 'glow', pos: p, life: 0.14, size: 0.8, color: S.blue, intensity: 1.1, alpha: [0.7, 0] });
    vfx.particle({ tex: 'star', pos: p.clone(), vel: c.dir.clone().multiplyScalar(-2).add(V3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0)), life: 0.3, size: [0.2, 0.05], color: [0xffffff, S.blue], intensity: 1.5, spin: 6 });
  });
  await Promise.all([rush(c, { ms: 380, lines: true }), fly]);
  meteor.dispose();
  void mTrail;
  void mStars;
  sp.setOutline(0);
  // 3) impact: starburst + crater
  if (c.missed) {
    whiffAt(c, at, S.silver);
    vfx.burst(at, { count: 16, tex: 'star', color: [0xffffff, S.blue], speed: [2, 5], size: [0.15, 0.25], life: 0.4, intensity: 1.4 });
  } else {
    c.impact(0);
    impactFx(c, at, { strength: 1.45, pal: SPAL, stop: true, dust: 0xa8a8b8 });
    stage.flash(0xd8e8ff, 0.3, 220);
    stage.chromaPulse(0.015, 350);
    c.target.flash(0xffffff, 250, 0.8);
    vfx.prim.energyBlast(towardCam(c, at, 0.3), { color: S.blue, core: 0xffffff, radius: 1.4, ms: 450, intensity: 1.0 });
    vfx.burst(towardCam(c, at, 0.5), { count: 26, tex: 'star', color: [0xffffff, S.blue], speed: [4, 9], size: [0.18, 0.34], life: [0.35, 0.6], drag: 2, gravity: 3, spin: 8, intensity: 1.5 });
    vfx.prim.crack(c.foeFeet.clone().setY(c.foeFeet.y + 0.03), { color: 0x2a2a38, glow: S.blue, glowIntensity: 1.0, radius: 1.6, ms: 900, facing: 'ground' });
  }
  await comet;
  await vfx.wait(500);
  vfx.shot('wide', c.side, 500);
});
