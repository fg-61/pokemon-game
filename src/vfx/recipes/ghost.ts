import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { camBasis, during, impactFx, rush, silhouette, towardCam } from './common';

// ghost-type move recipes

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const PURPLE = 0x8a50ff;
const GHOSTPAL = { core: 0xf0e0ff, main: 0x9a60ff, dark: 0x1a0a3a };

/** Dark ghostly wisps (normal-blended so they read as shadow on bright arenas). */
function wisps(c: MoveFxContext, at: THREE.Vector3, n: number, r = 0.8, up = 1) {
  c.vfx.burst(at, { count: n, tex: 'wisp', color: [0x3a1a5a, 0x08040f], speed: [0.4, 1.6], dir: V(0, up, 0), spread: 1.4, jitter: r, size: [0.6, 1], endSize: 1.5, life: [0.6, 0.9], drag: 1.5, additive: false, alpha: [0.75, 0], spin: 2 });
}

registerMoveFx('NIGHT_SHADE', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('attacker', c.side, 450);
  stage.setTint(0x40305a, 0.6, 450);
  // the user becomes a looming shadow with burning eyes
  const sil = silhouette(c.attacker, 0x100618, 0.92, 300, 1050, 300, stage);
  void vfx.tween(350, (k) => (c.attacker.scale = 1 + 0.12 * k));
  const aura = during(c, 900, () => wisps(c, c.userFeet.clone().add(V(0, 0.4, 0)), 2, Math.max(0.6, c.attacker.width * 0.5), 2));
  await vfx.wait(320);
  const hd = c.attacker.at(0.76);
  const { right } = camBasis(c);
  const eyeW = Math.min(0.26, c.attacker.width * 0.13);
  for (const s of [-1, 1]) {
    const p = towardCam(c, hd.clone().addScaledVector(right, s * eyeW), 0.3);
    vfx.particle({ tex: 'glow', pos: p, life: 1.2, size: [0.2, 0.5], color: 0xff2a4a, intensity: 3.5, alpha: [1, 0], fadeIn: 0.1 });
    vfx.particle({ tex: 'star', pos: p.clone(), life: 0.5, size: [0.1, 0.9], color: 0xff6a8a, intensity: 2.6, alpha: [1, 0], fadeIn: 0.3 });
  }
  await vfx.wait(280);
  // a wavering ghostly beam
  vfx.shot('side', c.side, 350);
  const from = c.user.clone().addScaledVector(c.dir, 0.5).add(V(0, 0.2, 0));
  const to = c.aim(0.5);
  const beam = vfx.prim.beam(from, to, { color: 0x6a30d0, core: 0xb088ff, width: 0.3, holdMs: 550, growMs: 220, fadeMs: 300, noise: 0.85, wobble: 0.22, intensity: 1.2 });
  const smoke = vfx.stream(from, to, { tex: 'wisp', color: [0x2a1040, 0x05020a], ms: 700, rate: 55, travel: 0.35, spread: 0.1, size: [0.5, 0.8], endSize: 1.4, additive: false, alpha: [0.6, 0], spin: 2, wave: 0.1 });
  await beam.arrived;
  if (!c.missed) {
    impactFx(c, to, { strength: 0.9, pal: GHOSTPAL, ground: false });
    // the target is swallowed by shadow
    void silhouette(c.target, 0x2a0a4a, 0.7, 150, 450, 350, stage);
    c.target.shake(0.08, 0.6);
    wisps(c, to, 12, 0.6);
    c.impact(0);
  }
  await Promise.all([beam.done, smoke, aura]);
  await vfx.tween(300, (k) => (c.attacker.scale = 1.12 - 0.12 * k));
  c.attacker.scale = 1;
  await sil;
  stage.setTint(0xffffff, 0, 400);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(150);
});

registerMoveFx('LICK', async (c) => {
  const { vfx } = c;
  await rush(c, { ms: 300, dist: Math.min(3, c.user.distanceTo(c.foe) * 0.4), dust: false });
  // a long ghostly tongue unfurls and slurps up across the target
  const mouth = c.attacker.at(0.6).addScaledVector(c.dir, 0.4);
  const bottom = towardCam(c, c.aim(0.2), 0.7);
  const top = towardCam(c, c.aim(0.95), 0.7);
  const mid = mouth.clone().lerp(bottom, 0.5).add(V(0, -0.5, 0));
  const pts = [mouth, mid, bottom, bottom.clone().lerp(top, 0.5).addScaledVector(c.dir, -0.15), top];
  const under = vfx.prim.ribbon(pts, { color: 0x4a1040, core: 0x4a1040, width: 0.34, ms: 360, length: 1, holdMs: 200, fadeMs: 250, additive: false, opacity: 0.5, intensity: 1, e: ease.inOutQuad });
  under.mesh.renderOrder = 4;
  const tongue = vfx.prim.ribbon(pts, { color: 0xd8509a, core: 0xff9ac8, width: 0.26, ms: 360, length: 1, holdMs: 200, fadeMs: 250, additive: false, opacity: 0.95, intensity: 1, e: ease.inOutQuad });
  tongue.mesh.renderOrder = 6;
  const drool = during(c, 500, () => {
    if (Math.random() < 0.5) vfx.particle({ tex: 'drop', pos: tongue.headPos(), vel: V(0, -1, 0), acc: V(0, -8, 0), life: 0.5, size: [0.18, 0.1], color: 0xd070ff, intensity: 1.3, alpha: [0.9, 0.3] });
  });
  await vfx.wait(260);
  if (c.missed) vfx.burst(c.aim(0.5), { count: 8, tex: 'drop', color: 0xd070ff, speed: [1, 3], size: [0.15, 0.2], life: 0.5, gravity: 8 });
  else {
    impactFx(c, c.aim(0.55), { strength: 0.7, pal: GHOSTPAL, ground: false });
    c.target.flash(0xc080ff, 300, 0.5);
    c.target.shake(0.06, 0.5);
    // shivers (paralysis chance)
    vfx.burst(c.aim(0.6), { count: 10, tex: 'spark', color: [0xffffa0, 0xffe040], speed: [2, 4], size: [0.1, 0.2], life: [0.2, 0.4] });
    c.impact(0);
  }
  await Promise.all([tongue.done, drool]);
  await vfx.wait(250);
});

registerMoveFx('CONFUSE_RAY', async (c) => {
  const { vfx } = c;
  const from = c.user.clone().addScaledVector(c.dir, 0.6).add(V(0, 0.3, 0));
  const orb = vfx.prim.orb({ color: 0xc8a020, core: 0xfff0a0, radius: 0.26, intensity: 1.4 });
  orb.mesh.position.copy(from);
  await orb.grow(280, 1);
  const trail = vfx.trail(() => orb.mesh.position, 1700, { tex: 'wisp', color: [0xe0c040, 0x7a40e0], size: [0.4, 0.6], endSize: 0.15, life: 0.5, speed: 0.2, rate: 50, intensity: 1.1 });
  const eerie = vfx.trail(() => orb.mesh.position, 1700, { tex: 'wisp', color: [0x3a1a5a, 0x100418], size: [0.5, 0.7], endSize: 1, life: 0.5, speed: 0.3, rate: 25, additive: false, alpha: [0.45, 0] });
  // an eerie wobbling drift towards the target...
  const center = c.missed ? c.aim(0.5) : c.foe.clone();
  const side = new THREE.Vector3(-c.dir.z, 0, c.dir.x);
  const approach = center.clone().addScaledVector(c.dir, -1.1);
  await vfx.tween(650, (k) => {
    orb.mesh.position.lerpVectors(from, approach, k).addScaledVector(side, Math.sin(k * Math.PI * 3) * 0.5).add(V(0, Math.sin(k * Math.PI * 5) * 0.3, 0));
  }, ease.inOutQuad);
  // ...circling the target once and a half...
  const a0 = Math.atan2(-c.dir.z, -c.dir.x);
  const R = Math.max(0.9, c.target.width * 0.6);
  await vfx.tween(700, (k) => {
    const a = a0 + k * Math.PI * 3;
    const r = THREE.MathUtils.lerp(1.1, R, Math.min(1, k * 3)) * (1 - k * 0.5);
    orb.mesh.position.set(center.x + Math.cos(a) * r, center.y + 0.3 + Math.sin(k * Math.PI * 4) * 0.25, center.z + Math.sin(a) * r);
  }, ease.linear);
  // ...then sinking into it
  const p0 = orb.mesh.position.clone();
  await vfx.tween(200, (k) => {
    orb.mesh.position.lerpVectors(p0, center, k);
    orb.mesh.scale.setScalar(1 - 0.8 * k);
  }, ease.inQuad);
  orb.dispose();
  if (!c.missed) {
    c.target.flash(0xffe080, 400, 0.6);
    vfx.prim.shockwave(center, { color: 0xffe080, radius: 1.8, ms: 400 });
    const hd = c.target.at(1.02);
    for (let i = 0; i < 3; i++) vfx.prim.shockwave(hd.clone().add(V(0, i * 0.12, 0)), { color: i % 2 ? PURPLE : 0xffe080, radius: 0.7 + i * 0.2, facing: 'ground', ms: 700, thickness: 0.2 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      vfx.particle({ tex: 'star', pos: hd.clone().add(V(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6)), swirl: { center: hd, speed: 5 }, life: 0.9, size: [0.3, 0.2], color: 0xffe060, intensity: 2, spin: 4 });
    }
    c.stage.chromaPulse(0.01, 400);
    c.impact(0);
  } else vfx.burst(center, { count: 12, tex: 'spark', color: [0xffe080, PURPLE], speed: [1, 3], life: 0.4 });
  await Promise.all([trail, eerie]);
  await vfx.wait(300);
});

registerMoveFx('SHADOW_BALL', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 450);
  const from = c.user.clone().addScaledVector(c.dir, 0.75).add(V(0, 0.2, 0));
  // gather: shadows and violet sparks are drawn into a dark sphere
  const orb = vfx.prim.orb({ color: 0x7a3ad0, core: 0x2a0a4a, radius: 0.5, intensity: 1.8 });
  orb.mesh.position.copy(from);
  void orb.grow(650, 1);
  await during(c, 650, () => {
    const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(1.6);
    vfx.particle({ tex: 'wisp', pos: from.clone().add(d), vel: d.clone().multiplyScalar(-2.4), life: 0.4, size: [0.6, 0.2], color: [0x3a1a5a, 0x0a0410], intensity: 1, additive: false, alpha: [0.8, 0.2], spin: 3 });
    vfx.particle({ tex: 'spark', pos: from.clone().add(d.multiplyScalar(0.8)), swirl: { center: from, speed: 6 }, vel: d.clone().multiplyScalar(-1.2), life: 0.35, size: [0.2, 0.05], color: [0xe0c0ff, PURPLE], intensity: 2 });
  });
  // launch
  const to = c.aim(0.5);
  const trail = vfx.trail(() => orb.mesh.position, 450, { tex: 'wisp', color: [0x3a1a5a, 0x08040f], size: [0.5, 0.8], endSize: 1.2, life: 0.4, speed: 0.4, rate: 60, additive: false, alpha: [0.7, 0], spin: 3 });
  const glow = vfx.trail(() => orb.mesh.position, 450, { tex: 'glow', color: [PURPLE, 0x4a1a8a], size: [0.5, 0.8], life: 0.25, speed: 0.2, rate: 40, intensity: 1.4 });
  const swirl = during(c, 450, () => {
    const p = orb.mesh.position;
    vfx.particle({ tex: 'spark', pos: p.clone().add(V((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8)), swirl: { center: p.clone(), speed: 9 }, life: 0.25, size: [0.15, 0.05], color: 0xd0b0ff, intensity: 2 });
  });
  await orb.fly(from, to, 450, 0.35, ease.inQuad);
  orb.dispose();
  // detonate
  vfx.prim.blast(to, { core: 0xe8d0ff, main: 0x8a50ff, dark: 0x14062a, radius: 1.7, ms: 900, intensity: 1.6 });
  vfx.prim.shockwave(to, { color: 0xc8a0ff, radius: 2.6, ms: 400, thickness: 0.15 });
  wisps(c, to, 16, 0.4, 0);
  vfx.burst(to, { count: 20, tex: 'spark', color: [0xf0e0ff, PURPLE], speed: [3, 8], size: [0.15, 0.3], life: [0.3, 0.6] });
  if (!c.missed) {
    impactFx(c, to, { strength: 1.2, pal: GHOSTPAL, stop: true });
    stage.flash(0x8a50ff, 0.25, 200);
    c.impact(0);
  }
  await Promise.all([trail, glow, swirl]);
  await vfx.wait(550);
  vfx.shot('wide', c.side, 500);
});
