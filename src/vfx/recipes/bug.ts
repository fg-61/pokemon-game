import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx } from '../vfx';
import { during, impactFx, screenAngle, sideOf, slashStroke, speedLines, towardCam } from './common';

const S = { white: 0xffffff, silver: 0xd8e2f0, steel: 0x9aa8bc, shadow: 0x6a7488, tint: 0xe8f4c0 };

// --------------------------------------------------------------------------------------- SILVER WIND

registerMoveFx('SILVER_WIND', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 400);
  const from = c.attacker.at(0.6).addScaledVector(c.dir, 0.4);
  const to = c.aim(0.5);
  const fwd = to.clone().sub(from);
  const len = fwd.length();
  fwd.normalize();
  const sv = sideOf(fwd);
  const travel = 0.55;
  // wings beat: scales shed around the user
  c.attacker.shake(0.12, 0.35);
  c.attacker.setOutline(1.2, S.silver);
  vfx.burst(c.user, { count: 24, tex: 'dot', color: [S.white, S.silver], speed: [1, 3], size: [0.08, 0.14], life: 0.5, intensity: 1.6, jitter: 0.6 });
  for (let i = 0; i < 3; i++) c.stage.wait(i * 90).then(() => vfx.prim.shockwave(from.clone().addScaledVector(fwd, i * 0.5), { color: S.silver, radius: 1.3, facing: fwd, ms: 300, thickness: 0.16, intensity: 1.3 }));
  await vfx.wait(280);
  c.attacker.setOutline(0);
  let hit = false;
  const rot = screenAngle(c, from, to);
  // the glittering gale
  await during(c, 800, (_k, dt, el) => {
    const t = el / 1000;
    const n = Math.round(150 * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const w = Math.sin(t * 7 + i) * 0.25;
      const d = fwd.clone().addScaledVector(sv, (Math.random() - 0.5) * 0.35 + w * 0.3).add(new THREE.Vector3(0, (Math.random() - 0.5) * 0.3 + Math.cos(t * 9) * 0.08, 0)).normalize();
      vfx.particle({ tex: Math.random() < 0.3 ? 'star' : 'dot', pos: from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, 0)), vel: d.multiplyScalar((len / travel) * (0.85 + Math.random() * 0.3)), life: travel * 1.1, size: [0.09 + Math.random() * 0.1, 0.05], color: [S.white, S.silver], intensity: 1.5, alpha: [1, 0.3] });
    }
    const m = Math.round(30 * dt + Math.random());
    for (let i = 0; i < m; i++) {
      const p = from.clone().addScaledVector(sv, (Math.random() - 0.5) * 0.8).add(new THREE.Vector3(0, (Math.random() - 0.5) * 0.8, 0));
      vfx.particle({ tex: 'streak', pos: p, vel: fwd.clone().multiplyScalar(len / travel), life: travel, size: [1.2, 2.0], color: [S.silver, S.steel], intensity: 0.9, alpha: [0.6, 0], rot });
    }
    const q = Math.round(28 * dt + Math.random());
    for (let i = 0; i < q; i++) {
      const d = fwd.clone().addScaledVector(sv, (Math.random() - 0.5) * 0.3).normalize();
      vfx.particle({ tex: 'smoke', pos: from.clone(), vel: d.multiplyScalar((len / travel) * 0.9), life: travel * 1.1, size: [0.5, 1.6], color: [S.silver, S.steel], intensity: 1, additive: false, alpha: [0.35, 0], spin: 3 });
    }
    if (!hit && el > travel * 1000) {
      hit = true;
      if (!c.missed) {
        c.impact(0);
        c.target.flash(S.silver, 300, 0.6);
        c.target.shake(0.1, 0.4);
        vfx.shake(0.14, 400);
      }
    }
  });
  // the glitter swirls around the target
  const center = c.missed ? to : c.target.at(0.5);
  await during(c, 500, (k) => {
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.7 + Math.random() * 0.5;
      vfx.particle({ tex: Math.random() < 0.3 ? 'star' : 'dot', pos: center.clone().add(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 1.6, Math.sin(a) * r)), vel: new THREE.Vector3(0, 0.6, 0), swirl: { center, speed: 5 }, life: 0.5, size: [0.12, 0.04], color: [S.white, S.silver], intensity: 1.5 * (1 - k * 0.5) });
    }
  });
  await vfx.wait(250);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- MEGAHORN

const BUG = { core: 0xf4ffc0, main: 0x9ad020, deep: 0x5a8a10, dark: 0x22300a };

registerMoveFx('MEGAHORN', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('attacker', c.side, 400);
  // lower the horn: it drinks in green power
  await vfx.tween(200, (k) => (sp.body.position.y = -0.12 * k), ease.outQuad);
  sp.setOutline(1.8, BUG.main);
  const tip = () => towardCam(c, sp.at(0.85).addScaledVector(c.dir, 0.35), 0.4);
  await during(c, 520, (k) => {
    const t = tip();
    for (let i = 0; i < 2; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(1.6);
      vfx.particle({ tex: 'spark', pos: t.clone().add(d), vel: d.clone().multiplyScalar(-2.8), life: 0.35, size: [0.22, 0.06], color: [BUG.core, BUG.main], intensity: 1.4 });
    }
    vfx.particle({ tex: 'glow', pos: t, life: 0.06, size: 0.4 + k * 0.8, color: BUG.main, intensity: 0.9, alpha: [0.6, 0] });
  });
  vfx.particle({ tex: 'star', pos: tip(), life: 0.3, size: [0.3, 1.6], color: 0xffffff, intensity: 1.6, alpha: [1, 0], spin: 6 });
  vfx.dust(c.userFeet, 0xa89878, 10);
  sp.shake(0.06, 0.3);
  vfx.shot('side', c.side, 300);
  await vfx.wait(160);
  sp.body.position.y = 0;
  // CHARGE
  const dist = Math.min(4.6, c.user.distanceTo(c.foe) * 0.62);
  const lunge = sp.lunge(c.foe, dist, 440);
  await vfx.wait(190);
  speedLines(c, c.user.clone().lerp(c.foe, 0.4), c.dir, { count: 16, radius: 1.1, speed: 18, color: BUG.core });
  vfx.dust(c.userFeet, 0xa89878, 8);
  let n = 0;
  void during(c, 260, () => {
    if (n++ % 2 === 0) vfx.prim.afterimage(sp.mesh, { color: BUG.main, opacity: 0.35, ms: 300 });
    vfx.particle({ tex: 'glow', pos: tip(), life: 0.2, size: [0.8, 0.2], color: BUG.main, intensity: 1.0, alpha: [0.7, 0] });
  });
  await lunge;
  sp.setOutline(0);
  const at = c.aim(0.55);
  if (c.missed) {
    vfx.burst(at, { count: 10, tex: 'streak', color: [0xffffff, BUG.core], speed: [5, 8], size: [0.4, 0.8], life: 0.2, dir: c.dir, spread: 0.5, intensity: 1.2 });
    vfx.dust(c.foeFeet.clone().addScaledVector(sideOf(c.dir), 1.4), 0xa89878, 8);
  } else {
    // the horn drives clean through: a spear of green light, then the blast
    const base = towardCam(c, at, 0.6);
    slashStroke(c, [base.clone().addScaledVector(c.dir, -2.2), base.clone().addScaledVector(c.dir, 1.9)], { color: BUG.main, core: BUG.core, width: 0.17, ms: 90, length: 0.8, holdMs: 60, fadeMs: 260, intensity: 1.2, edge: BUG.dark });
    // hits near the camera (on the player's side) are scaled down so they don't swallow the screen
    const z = THREE.MathUtils.clamp(at.distanceTo(stage.camera.position) / 12, 0.5, 1);
    impactFx(c, at, { strength: 1.6, pal: { core: 0xffffff, main: BUG.main, dark: BUG.dark }, stop: true, flash: 0.25 });
    vfx.prim.energyBlast(at, { color: BUG.main, core: BUG.core, radius: 1.8 * z, ms: 420, intensity: 0.75 });
    for (let i = 0; i < 3; i++) vfx.prim.shockwave(at.clone().addScaledVector(c.dir, 0.3 + i * 0.55), { color: i % 2 ? BUG.core : BUG.main, radius: (1.4 + i * 0.5) * z, facing: c.dir, ms: 380, thickness: 0.2, intensity: 1.2 });
    vfx.prim.crack(c.foeFeet, { radius: 1.6, ms: 1000, color: 0x2a2a10 });
    vfx.prim.debris({ from: c.foeFeet.clone().setY(c.foeFeet.y + 0.2), count: 8, color: 0x6a6a48, size: 0.12, speed: 3.5, up: 4, ms: 1000 });
    vfx.burst(at, { count: 18, tex: 'shard', color: [BUG.core, BUG.main], speed: [4, 9], size: [0.15, 0.3], life: [0.3, 0.6], gravity: 6, spin: 8, intensity: 1.3 });
    stage.chromaPulse(0.008, 300);
    c.impact(0);
  }
  await vfx.wait(250);
  vfx.shot('wide', c.side, 600);
  await vfx.wait(450);
});
