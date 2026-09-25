import * as THREE from 'three';
import { ease } from '../../render/clock';
import type { PokemonSprite } from '../../render/pokemonSprite';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { camBasis, during, healSparkles, hitStop, impactFx, motes, pulledShot, rush, screenAngle, sideOf, slashStroke, softHit, speedLines, strokePoints, towardCam, up } from './common';

// Phase-3 roster move recipes (water / fire / electric / psychic / grass / ice / poison / bug / steel)

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
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
  vfx.prim.beam(top, base, { color: W.main, core: W.light, width: col * 0.7, intensity: 0.55, growMs: (H / fall) * 1000, holdMs: 360, fadeMs: 200, noise: 0.7, wobble: 0.12 });
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
    const n = Math.round(80 * dt + Math.random());
    for (let i = 0; i < n; i++) {
      // bubbles snake along a helix around the line of fire
      const ph = t * 16 + Math.random() * 0.8;
      const d = fwd.clone().multiplyScalar(len / travel).addScaledVector(sv, Math.cos(ph) * 1.4).add(V3(0, Math.sin(ph) * 1.1, 0));
      const s = 0.18 + Math.random() * 0.28;
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
  vfx.shot('wide', c.side, 400);
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
    sp.uniforms.flashAmt.value = 0.15 + k * 0.5;
    sp.setOutline(1.2 + k * 1.2, k < 0.5 ? F.orange : F.yellow);
    const R = Math.max(0.9, sp.width * 0.6);
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * TAU;
      vfx.particle({ tex: 'flame', pos: feet.clone().add(V3(Math.cos(a) * R, 0.1, Math.sin(a) * R)), vel: V3(-Math.cos(a) * 0.7, 3 + k * 4, -Math.sin(a) * 0.7), life: 0.4, size: [0.6 + k * 0.4, 0.1], color: [F.yellow, F.red], intensity: 1.2, additive: false, alpha: [0.95, 0], rot: 0 });
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
  vfx.prim.beam(from, to, { color: 0xff7a18, core: 0xffffff, width: 0.5, intensity: 1.05, growMs: grow, holdMs: 560, fadeMs: 260, noise: 0.55, wobble: 0.1 });
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
    sp.uniforms.flashAmt.value = 0.65 * (1 - k * 0.6);
  });
  await vfx.wait(grow);
  if (!c.missed) {
    c.impact(0);
    impactFx(c, to, { strength: 1.5, pal: FPAL, stop: true, dust: 0x6a4a3a });
    c.target.flash(0xffffff, 300, 1);
    stage.flash(0xffffff, 0.35, 260);
    stage.chromaPulse(0.02, 450);
  }
  vfx.prim.blast(to, { core: 0xfff4c0, main: 0xff6a10, dark: 0x3a0e04, radius: c.missed ? 1.3 : 2.0, ms: 1000, scaleY: 1.15, rise: 0.8, intensity: 1.05 });
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
  const R = Math.max(0.75, Math.max(sp.width, sp.height) * 0.55);
  const spin = -16 * (c.dir.x >= 0 ? 1 : -1);
  let power = 0;
  let spinning = true;
  // a wheel of fire spins around the user and follows it into the charge
  const wheel = during(c, 1400, (_k, dt, el) => {
    if (!spinning) power = Math.max(0, power - dt * 4);
    else power = Math.min(1, power + dt * 3);
    if (power <= 0 && !spinning) return;
    const ctr = sp.at(0.5);
    const t = el / 1000;
    const pt = (a: number) => ctr.clone().addScaledVector(c.dir, Math.cos(a) * R).add(V3(0, Math.sin(a) * R, 0));
    const tan = (a: number) => c.dir.clone().multiplyScalar(-Math.sin(a)).add(V3(0, Math.cos(a), 0)).multiplyScalar(Math.sign(spin));
    const n = Math.round(10 * power);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      vfx.particle({ tex: 'flame', pos: pt(a), vel: tan(a).multiplyScalar(-2).add(V3(0, 1.2, 0)), life: 0.22, size: [0.5 * power, 0.12], color: [F.yellow, F.red], intensity: 1.15, additive: false, alpha: [0.95, 0], rot: 0 });
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
