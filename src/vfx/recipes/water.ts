import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { during, pulledShot, screenAngle, sideOf } from './common';

const W = { foam: 0xeaf8ff, light: 0x8ad4ff, main: 0x3a9aff, deep: 0x0c50c0, dark: 0x06307a };

const mouthOf = (c: MoveFxContext, fwd = 0.45) => c.attacker.at(0.6).add(c.dir.clone().multiplyScalar(fwd));

/** Water splash: droplets thrown out with gravity, foam puffs, a ring. */
function splash(c: MoveFxContext, at: THREE.Vector3, k = 1, back?: THREE.Vector3) {
  const { vfx } = c;
  const bias = back ? back.clone().multiplyScalar(0.5) : new THREE.Vector3();
  for (let i = 0; i < Math.round(34 * k); i++) {
    const d = new THREE.Vector3((Math.random() - 0.5) * 2, 0.4 + Math.random() * 1.2, (Math.random() - 0.5) * 2).add(bias).normalize();
    vfx.particle({ tex: 'drop', pos: at.clone(), vel: d.multiplyScalar((3 + Math.random() * 4) * Math.sqrt(k)), acc: new THREE.Vector3(0, -12, 0), drag: 0.5, life: 0.5 + Math.random() * 0.3, size: [0.16 + Math.random() * 0.16, 0.06], color: [W.light, W.main], intensity: 1.1, additive: false, alpha: [1, 0.2] });
  }
  vfx.burst(at, { count: Math.round(10 * k), tex: 'smoke', color: [W.foam, W.light], speed: [1, 2.5], size: [0.5 * k, 0.9 * k], endSize: 1.6 * k, life: [0.4, 0.7], additive: false, alpha: [0.6, 0], drag: 3, intensity: 1 });
  vfx.burst(at, { count: Math.round(12 * k), tex: 'bubble', color: W.foam, speed: [1, 3], size: [0.12, 0.3], life: [0.4, 0.8], gravity: -1.5, drag: 2, intensity: 1.2 });
  vfx.particle({ tex: 'glow', pos: at.clone(), life: 0.25, size: [1.6 * k, 0.6], color: W.light, intensity: 1, alpha: [0.6, 0] });
  vfx.prim.shockwave(at, { color: W.light, radius: 1.4 * k, ms: 350, thickness: 0.22, intensity: 1.4 });
}

// --------------------------------------------------------------------------------------- WATER GUN

registerMoveFx('WATER_GUN', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 400);
  const mouth = mouthOf(c);
  vfx.burst(mouth, { count: 18, tex: 'drop', color: [W.light, W.main], speed: 0.2, jitter: 1.1, attract: { to: mouth, strength: 18 }, life: 0.3, size: [0.1, 0.18], additive: false, intensity: 1.1 });
  vfx.particle({ tex: 'bubble', pos: mouth, life: 0.3, size: [0.1, 0.5], color: W.foam, intensity: 1.2, alpha: [0.5, 1] });
  await vfx.wait(300);
  const to = c.aim(0.5);
  const len = mouth.distanceTo(to);
  const fwd = to.clone().sub(mouth).normalize();
  const side = sideOf(fwd);
  const travel = 0.3;
  const rot = screenAngle(c, mouth, to) + Math.PI / 2;
  let hit = false;
  vfx.prim.beam(mouth, to, { color: W.main, core: W.light, width: 0.12, holdMs: 380, growMs: travel * 1000, fadeMs: 200, intensity: 1.0, noise: 0.6, wobble: 0.15 });
  await during(c, 650, (_k, dt, el) => {
    const t = el / 1000;
    const n = Math.round(200 * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const d = fwd.clone().addScaledVector(side, (Math.random() - 0.5) * 0.06 + Math.sin(t * 20) * 0.015).add(new THREE.Vector3(0, (Math.random() - 0.5) * 0.06 + 0.03, 0)).normalize();
      const s = 0.26 + Math.random() * 0.18;
      vfx.particle({ tex: 'drop', pos: mouth.clone(), vel: d.multiplyScalar((len / travel) * (0.95 + Math.random() * 0.1)), acc: new THREE.Vector3(0, -2, 0), life: travel * 1.05, size: [s, s * 1.8], color: [W.light, W.main], intensity: 1.05, additive: false, alpha: [0.95, 0.5], rot: rot + (Math.random() - 0.5) * 0.3 });
    }
    const nc = Math.round(110 * dt + Math.random());
    for (let i = 0; i < nc; i++) vfx.particle({ tex: 'smoke', pos: mouth.clone(), vel: fwd.clone().multiplyScalar(len / travel), life: travel, size: [0.3, 0.7], color: [W.foam, W.light], intensity: 1, additive: false, alpha: [0.5, 0.1], spin: 3 });
    if (Math.random() < 0.6) {
      const p = mouth.clone().lerp(to, Math.random());
      vfx.particle({ tex: 'dot', pos: p, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2), acc: new THREE.Vector3(0, -9, 0), life: 0.4, size: [0.08, 0.04], color: W.foam, intensity: 1.3 });
    }
    if (el >= travel * 1000) {
      if (!hit && !c.missed) {
        hit = true;
        c.impact(0);
        c.target.flash(W.light, 250, 0.5);
        vfx.shake(0.1, 350);
      }
      if (Math.random() < 0.45) splash(c, to.clone().addScaledVector(fwd, -0.2), 0.45, fwd.clone().negate());
    }
  });
  await vfx.wait(travel * 1000);
  splash(c, to, c.missed ? 0.6 : 1, fwd.clone().negate());
  await vfx.wait(400);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- WITHDRAW

registerMoveFx('WITHDRAW', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  vfx.shot('attacker', c.side, 400);
  // hunker down into the shell
  await c.stage.tween(220, (k) => (sp.scale = 1 - 0.14 * k), ease.outQuad);
  sp.setOutline(1.6, W.main);
  const R = Math.max(1.1, Math.max(sp.width, sp.height) * 0.58);
  const center = c.user.clone();
  vfx.prim.shield(center, { color: W.main, radius: R, ms: 1150, intensity: 1.4 });
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.06), { color: W.light, radius: R * 1.6, facing: 'ground', ms: 600, intensity: 1.4 });
  sp.flash(W.light, 400, 0.5);
  const glints = during(c, 900, () => {
    if (Math.random() < 0.5) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const p = center.clone().add(new THREE.Vector3(r * Math.cos(a), u * 0.9, r * Math.sin(a)).multiplyScalar(R));
      vfx.particle({ tex: 'star', pos: p, life: 0.3, size: [0.35, 0.05], color: W.foam, intensity: 1.8, alpha: [1, 0] });
    }
    if (Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2;
      vfx.particle({ tex: 'bubble', pos: c.userFeet.clone().add(new THREE.Vector3(Math.cos(a) * R * 0.8, 0.2, Math.sin(a) * R * 0.8)), vel: new THREE.Vector3(0, 1.5 + Math.random(), 0), life: 0.9, size: [0.12, 0.3], color: W.foam, intensity: 1.2, alpha: [0.9, 0] });
    }
  });
  await vfx.wait(500);
  // come back out, braced
  await c.stage.tween(260, (k) => (sp.scale = 0.86 + 0.14 * k), ease.outBack);
  sp.scale = 1;
  await glints;
  sp.setOutline(0);
  await vfx.wait(150);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- WATER PULSE

registerMoveFx('WATER_PULSE', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 400);
  const from = mouthOf(c, 0.7);
  const blob = vfx.prim.blob({ color: W.main, radius: 0.38, opacity: 0.8, emissive: 0.7, roughness: 0.05 });
  blob.mesh.position.copy(from);
  vfx.burst(from, { count: 24, tex: 'drop', color: [W.light, W.main], speed: 0.2, jitter: 1.4, attract: { to: from, strength: 20 }, life: 0.35, size: [0.12, 0.2], additive: false, intensity: 1.1 });
  await blob.grow(380, 1);
  const to = c.aim(0.5);
  const fwd = to.clone().sub(from).normalize();
  let lastRing = -1;
  await blob.fly(from, to, 520, 0.35, ease.inOutQuad, (p) => {
    const t = c.stage.clock.time * 1000;
    if (t - lastRing > 95) {
      lastRing = t;
      vfx.prim.shockwave(p.clone(), { color: W.light, radius: 1.0, ms: 320, thickness: 0.2, facing: fwd, intensity: 1.5 });
    }
    vfx.particle({ tex: 'glow', pos: p.clone(), life: 0.15, size: 0.9, color: W.main, intensity: 0.9, alpha: [0.5, 0] });
    if (Math.random() < 0.7) vfx.particle({ tex: 'bubble', pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 0)), vel: new THREE.Vector3(0, 0.5, 0), life: 0.4, size: [0.15, 0.05], color: W.foam, intensity: 1.2 });
  });
  blob.dispose();
  if (!c.missed) {
    c.impact(0);
    c.target.flash(W.light, 300, 0.6);
    c.target.shake(0.15, 0.5);
    c.stage.shockwave(to, 0.5, 300);
    vfx.shake(0.18, 300);
    splash(c, to, 1.1, fwd.clone().negate());
    for (let i = 0; i < 3; i++) c.stage.wait(i * 100).then(() => vfx.prim.shockwave(to, { color: i % 2 ? W.main : W.light, radius: 1.6 + i * 0.6, ms: 380, thickness: 0.18, intensity: 1.5 }));
    await vfx.wait(500);
  } else {
    splash(c, to, 0.6);
    await vfx.wait(350);
  }
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- HYDRO CANNON

registerMoveFx('HYDRO_CANNON', async (c) => {
  const { vfx, stage } = c;
  // 1) charge: the ocean gathers into a pressurized sphere
  vfx.shot('attacker', c.side, 450);
  c.attacker.setOutline(1.8, W.main);
  const muzzle = mouthOf(c, 0.9);
  const blob = vfx.prim.blob({ color: W.main, radius: 0.7, opacity: 0.8, emissive: 0.8, roughness: 0.05 });
  blob.mesh.position.copy(muzzle);
  const grow = blob.grow(900, 1);
  let lastRing = 0;
  const charge = during(c, 950, (k, _dt, el) => {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 1.2;
      const p = muzzle.clone().add(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 2, Math.sin(a) * r));
      vfx.particle({ tex: 'drop', pos: p, vel: new THREE.Vector3(), attract: { to: muzzle, strength: 40 }, swirl: { center: muzzle, speed: 3 }, drag: 2.5, life: 0.4, size: [0.22, 0.06], color: [W.light, W.main], intensity: 1.1, additive: false, alpha: [0.9, 0.4], fadeIn: 0.2 });
    }
    if (el - lastRing > 220) {
      lastRing = el;
      vfx.particle({ tex: 'ring', pos: muzzle.clone(), life: 0.35, size: [4, 0.4], color: W.light, intensity: 1.3, alpha: [0, 0.9] });
    }
    vfx.particle({ tex: 'glow', pos: muzzle, life: 0.06, size: 1.2 + k * 1.6, color: W.main, intensity: 0.8 + k * 0.6, alpha: [0.5, 0] });
    if (Math.random() < 0.3) c.attacker.shake(0.05, 0.1);
  });
  vfx.shake(0.12, 950);
  await Promise.all([charge, grow]);
  c.attacker.setOutline(0);
  // 2) fire the cannon
  vfx.shot('side', c.side, 260);
  const to = c.aim(0.5);
  const fwd = to.clone().sub(muzzle).normalize();
  const len = muzzle.distanceTo(to);
  stage.flash(W.light, 0.15, 150);
  blob.dispose();
  c.attacker.knockback(c.foe, 0.4, 500);
  const hold = 800;
  const beam = vfx.prim.beam(muzzle, to, { color: W.deep, core: W.light, width: 0.7, holdMs: hold, noise: 0.6, wobble: 0.12, intensity: 1.0, growMs: 160 });
  const sideV = sideOf(fwd);
  let ringT = 0;
  const outer = during(c, 160 + hold, (_k, dt, el) => {
    const n = Math.round(260 * dt);
    for (let i = 0; i < n; i++) {
      const d = fwd.clone().addScaledVector(sideV, (Math.random() - 0.5) * 0.12).add(new THREE.Vector3(0, (Math.random() - 0.5) * 0.12, 0)).normalize();
      const s = 0.35 + Math.random() * 0.3;
      vfx.particle({ tex: Math.random() < 0.5 ? 'smoke' : 'drop', pos: muzzle.clone(), vel: d.multiplyScalar(len / 0.28), life: 0.3, size: [s, s * 2.2], color: [W.main, W.deep], intensity: 1, additive: false, alpha: [0.7, 0.15], spin: 4 });
    }
    if (el - ringT > 90) {
      ringT = el;
      const p = muzzle.clone().addScaledVector(fwd, 0.6 + Math.random() * (len - 1.2));
      vfx.prim.shockwave(p, { color: W.foam, radius: 1.3, ms: 260, thickness: 0.14, facing: fwd, intensity: 1.2 });
    }
  });
  await beam.arrived;
  // 3) impact
  if (!c.missed) {
    c.impact(0);
    c.target.flash(0xffffff, 200, 0.9);
  }
  stage.flash(W.light, 0.22, 220);
  stage.shockwave(to, 1.1, 450);
  stage.chromaPulse(0.012, 350);
  vfx.shake(0.55, 900);
  pulledShot(c, 'foe', 1.8, 0.6, 700);
  vfx.prim.blast(to, { core: W.light, main: W.main, dark: W.dark, radius: 1.9, ms: 1100, rise: 0.4, intensity: 0.9 });
  const spray = during(c, hold, () => {
    for (let i = 0; i < 5; i++) {
      const d = fwd.clone().negate().multiplyScalar(0.4).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2)).normalize();
      vfx.particle({ tex: 'drop', pos: to.clone(), vel: d.multiplyScalar(5 + Math.random() * 5), acc: new THREE.Vector3(0, -12, 0), life: 0.7, size: [0.25, 0.08], color: [W.light, W.main], intensity: 1.05, additive: false, alpha: [1, 0.2] });
    }
    if (Math.random() < 0.5) vfx.particle({ tex: 'smoke', pos: to.clone().add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5))), vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1.2, (Math.random() - 0.5) * 2), life: 0.9, size: [0.8, 2.2], color: [W.foam, W.light], additive: false, alpha: [0.5, 0], intensity: 1 });
    if (Math.random() < 0.3) c.target.shake(0.1, 0.2);
  });
  vfx.prim.shockwave(c.foeFeet.clone().setY(c.foeFeet.y + 0.05), { color: W.light, radius: 4.5, facing: 'ground', ms: 700, intensity: 1.6 });
  await Promise.all([beam.done, outer, spray]);
  // 4) the spray rains back down
  const rainC = (c.missed ? to : c.foeFeet).clone();
  await vfx.rain(rainC, { ms: 500, rate: 80, radius: 2.2, height: 4, fall: 9, tex: 'drop', color: W.light, size: [0.12, 0.2], additive: false, intensity: 1.1 });
  await vfx.wait(250);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- SURF

registerMoveFx('SURF', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 500);
  const ground = Math.min(c.userFeet.y, c.foeFeet.y) - 0.3;
  const start = c.userFeet.clone().setY(ground).addScaledVector(c.dir, -1.8);
  const end = c.foeFeet.clone().setY(ground).addScaledVector(c.dir, 0.4);
  const wave = vfx.prim.wave({ color: W.main, core: W.foam, dark: W.deep, width: 9.5 });
  wave.mesh.position.copy(start);
  wave.mesh.lookAt(start.clone().add(c.dir));
  const crestSpray = (amt: number) => {
    for (let i = 0; i < Math.round(8 * amt); i++) {
      const x = Math.random() - 0.5;
      const p = wave.crest(x * 0.85);
      if (Math.random() < 0.35) vfx.particle({ tex: 'smoke', pos: p, vel: c.dir.clone().multiplyScalar(2 + Math.random() * 2).add(new THREE.Vector3(0, 1 + Math.random(), 0)), acc: new THREE.Vector3(0, -5, 0), life: 0.4, size: [0.3, 0.8], color: [W.foam, W.light], intensity: 1.1, additive: false, alpha: [0.7, 0], spin: 2 });
      vfx.particle({ tex: 'drop', pos: p, vel: c.dir.clone().multiplyScalar(3 + Math.random() * 2).add(new THREE.Vector3(0, 2 + Math.random() * 2, 0)), acc: new THREE.Vector3(0, -12, 0), life: 0.5, size: [0.16, 0.06], color: [W.foam, W.light], intensity: 1.1, additive: false });
    }
  };
  // rise behind the user
  c.attacker.jump(0.9, 700);
  await during(c, 480, (k) => {
    wave.u.height.value = 2.8 * ease.outCubic(k);
    wave.u.curl.value = 0.3 + 0.2 * k;
    crestSpray(0.5);
  });
  // sweep across the arena
  let crashed = false;
  const sweepMs = 950;
  await during(c, sweepMs, (k) => {
    const kk = ease.inOutQuad(k);
    const p = start.clone().lerp(end, kk);
    wave.mesh.position.copy(p);
    wave.u.height.value = 2.8 + 0.5 * Math.sin(k * Math.PI);
    wave.u.curl.value = 0.5 + 0.5 * k;
    crestSpray(1);
    // churned foam along the base
    if (Math.random() < 0.8) {
      const b = wave.mesh.localToWorld(new THREE.Vector3((Math.random() - 0.5) * 8, 0.2, 0.3));
      vfx.particle({ tex: 'smoke', pos: b, vel: c.dir.clone().multiplyScalar(2).add(new THREE.Vector3(0, 0.8, 0)), life: 0.5, size: [0.5, 1.1], color: [W.foam, W.light], additive: false, alpha: [0.5, 0], intensity: 1 });
    }
    if (!crashed && kk > 0.82) {
      crashed = true;
      if (!c.missed) {
        c.impact(0);
        c.target.flash(W.light, 300, 0.7);
        c.target.shake(0.2, 0.5);
      }
      vfx.shake(0.4, 600);
      c.stage.flash(W.foam, 0.25, 220);
    }
  });
  // crash down onto the target
  const hitAt = c.aim(0.5);
  splash(c, hitAt, 1.5, c.dir.clone());
  for (let i = 0; i < 40; i++) {
    const d = new THREE.Vector3((Math.random() - 0.5) * 1.4, 1, (Math.random() - 0.5) * 1.4).addScaledVector(c.dir, 0.6).normalize();
    const big = i % 3 === 0;
    vfx.particle({ tex: big ? 'smoke' : 'drop', pos: c.foeFeet.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2)), vel: d.multiplyScalar(4 + Math.random() * 5), acc: new THREE.Vector3(0, -11, 0), drag: 1, life: 0.8, size: big ? [0.7, 1.4] : [0.3, 0.12], color: big ? [W.foam, W.light] : [W.light, W.main], intensity: 1.05, additive: false, alpha: [0.85, 0], spin: 2 });
  }
  await during(c, 420, (k) => {
    wave.u.height.value = 2.9 * (1 - ease.inQuad(k));
    wave.u.curl.value = 1.0 + 0.3 * k;
    wave.u.alpha.value = 1 - k;
    wave.mesh.position.addScaledVector(c.dir, 0.03);
  });
  wave.dispose();
  for (let i = 0; i < 3; i++) c.stage.wait(i * 140).then(() => vfx.prim.shockwave(c.foeFeet.clone().setY(c.foeFeet.y + 0.05), { color: W.light, radius: 2 + i * 1.2, facing: 'ground', ms: 600, thickness: 0.18, intensity: 1.2 }));
  await vfx.wait(450);
  vfx.shot('wide', c.side, 500);
});

