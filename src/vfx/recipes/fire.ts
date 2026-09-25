import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { during, pulledShot, sideOf, up } from './common';

// Fire palette (normal-blended body colors keep their hue; additive only for hot cores / sparks)
const F = {
  white: 0xfff6d0,
  yellow: 0xffd040,
  orange: 0xff7a10,
  red: 0xd82a06,
  ember: 0xff5010,
  smoke: 0x2a2220,
  soot: 0x4a3a34,
};

const mouthOf = (c: MoveFxContext, fwd = 0.45) => c.attacker.at(0.6).add(c.dir.clone().multiplyScalar(fwd));

/** Flames licking up from a point for `ms` (burning target). */
function burnOn(c: MoveFxContext, at: THREE.Vector3, ms: number, rate = 1, radius = 0.6) {
  const { vfx } = c;
  return during(c, ms, (k) => {
    const fade = 1 - k * 0.7;
    const n = Math.round(3 * rate * fade + Math.random());
    for (let i = 0; i < n; i++) {
      const p = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2 * radius, (Math.random() - 0.4) * radius * 1.4, (Math.random() - 0.5) * 2 * radius));
      vfx.particle({ tex: 'flame', pos: p, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 2 + Math.random() * 2.2, (Math.random() - 0.5) * 0.6), life: 0.35 + Math.random() * 0.25, size: [0.45 + Math.random() * 0.4, 0.1], color: [F.yellow, F.red], intensity: 1.2, additive: false, alpha: [0.95, 0], rot: (Math.random() - 0.5) * 0.4 });
      if (Math.random() < 0.5) vfx.particle({ tex: 'flame', pos: p, vel: new THREE.Vector3(0, 2.6, 0), life: 0.25, size: [0.35, 0.05], color: [F.white, F.orange], intensity: 1.4, alpha: [0.8, 0], rot: 0 });
    }
    if (Math.random() < 0.25 * rate) vfx.particle({ tex: 'smoke', pos: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * radius, radius, (Math.random() - 0.5) * radius)), vel: new THREE.Vector3(0, 1.4, 0), life: 0.9, size: [0.5, 1.4], color: [F.soot, F.smoke], intensity: 1, additive: false, alpha: [0.45, 0], fadeIn: 0.2, spin: 1 });
  });
}

// --------------------------------------------------------------------------------------- FLAMETHROWER

registerMoveFx('FLAMETHROWER', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 450);
  const mouth = mouthOf(c);
  // anticipation: embers sucked into the mouth, glow swells
  c.attacker.setOutline(1.4, F.orange);
  vfx.burst(mouth, { count: 26, tex: 'spark', color: [F.yellow, F.orange], speed: 0.2, jitter: 1.3, attract: { to: mouth, strength: 22 }, life: [0.3, 0.45], size: [0.1, 0.2], intensity: 1.8 });
  vfx.particle({ tex: 'glow', pos: mouth, life: 0.4, size: [0.2, 1.2], color: F.orange, intensity: 1.6, alpha: [0.2, 0.9] });
  await vfx.wait(380);
  c.attacker.setOutline(0);

  const to = c.aim(0.5);
  const len = mouth.distanceTo(to);
  const fwd = to.clone().sub(mouth).normalize();
  const side = sideOf(fwd);
  const travel = 0.42;
  const ms = 1000;
  let hit = false;
  // one emitter drives body (normal), hot core (additive), sparks and smoke so they stay coherent
  const stream = during(c, ms, (k, dt, el) => {
    const t = el / 1000;
    const nBody = Math.round(300 * dt + Math.random());
    const sway = Math.sin(t * 9) * 0.05 + Math.sin(t * 23) * 0.025;
    for (let i = 0; i < nBody; i++) {
      const d = fwd.clone().addScaledVector(side, sway + (Math.random() - 0.5) * 0.14).add(new THREE.Vector3(0, (Math.random() - 0.5) * 0.12 + Math.sin(t * 13) * 0.03, 0)).normalize();
      const sp = (len / travel) * (0.9 + Math.random() * 0.2);
      const s = 0.28 + Math.random() * 0.25;
      vfx.particle({ tex: 'flame', pos: mouth.clone(), vel: d.multiplyScalar(sp), acc: new THREE.Vector3(0, 2.5, 0), life: travel * (1 + Math.random() * 0.2), size: [s, s * 5], color: [0xffb020, 0xc81c02], intensity: 1.05, additive: false, alpha: [1, 0.3], spin: (Math.random() - 0.5) * 6 });
    }
    // darker outer licks give the stream depth
    const nOuter = Math.round(90 * dt + Math.random());
    for (let i = 0; i < nOuter; i++) {
      const d = fwd.clone().addScaledVector(side, sway + (Math.random() - 0.5) * 0.22).add(new THREE.Vector3(0, (Math.random() - 0.3) * 0.2, 0)).normalize();
      const s = 0.4 + Math.random() * 0.3;
      vfx.particle({ tex: 'flame', pos: mouth.clone().addScaledVector(fwd, 0.4), vel: d.multiplyScalar((len / travel) * 0.85), acc: new THREE.Vector3(0, 3, 0), life: travel * 1.2, size: [s, s * 4.5], color: [0xff5a08, 0x701004], intensity: 1, additive: false, alpha: [0.75, 0], spin: (Math.random() - 0.5) * 5 });
    }
    const nCore = Math.round(120 * dt + Math.random());
    for (let i = 0; i < nCore; i++) {
      const d = fwd.clone().addScaledVector(side, sway + (Math.random() - 0.5) * 0.04).normalize();
      const s = 0.2 + Math.random() * 0.15;
      vfx.particle({ tex: 'flame', pos: mouth.clone().addScaledVector(fwd, 0.25), vel: d.multiplyScalar((len / travel) * 1.02), life: travel * 0.9, size: [s, s * 2.8], color: [0xffe070, 0xff5008], intensity: 1.0, alpha: [0.7, 0], spin: (Math.random() - 0.5) * 6 });
    }
    if (Math.random() < 0.7) {
      const d = fwd.clone().addScaledVector(side, (Math.random() - 0.5) * 0.4).add(new THREE.Vector3(0, Math.random() * 0.3, 0)).normalize();
      vfx.particle({ tex: 'spark', pos: mouth.clone(), vel: d.multiplyScalar(len / travel), acc: new THREE.Vector3(0, 3, 0), drag: 0.8, life: 0.5, size: [0.14, 0.04], color: [F.white, F.ember], intensity: 2 });
    }
    if (Math.random() < 0.5) {
      const p = mouth.clone().lerp(to, 0.4 + Math.random() * 0.6).add(new THREE.Vector3(0, 0.4, 0));
      vfx.particle({ tex: 'smoke', pos: p, vel: new THREE.Vector3(0, 1.3, 0).addScaledVector(fwd, 1.5), life: 0.9, size: [0.6, 1.8], color: [F.soot, F.smoke], intensity: 1, additive: false, alpha: [0.35, 0], fadeIn: 0.25, spin: 1 });
    }
    // mouth flare
    if (Math.random() < 0.4) vfx.particle({ tex: 'glow', pos: mouth.clone(), life: 0.08, size: 0.8 + Math.random() * 0.3, color: F.orange, intensity: 1.0, alpha: [0.6, 0] });
    if (!hit && el >= travel * 1000 && !c.missed) {
      hit = true;
      c.impact(0);
      vfx.shake(0.14, 800);
      c.target.flash(F.orange, 250, 0.6);
    }
    void k;
  });
  // splash of fire around the target while the stream connects
  await vfx.wait(travel * 1000);
  if (!c.missed) {
    const burn = burnOn(c, to, ms - travel * 1000 + 300, 1.6, 0.55);
    const splash = during(c, ms - travel * 1000, () => {
      for (let i = 0; i < 3; i++) {
        const d = fwd.clone().negate().multiplyScalar(0.3).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2)).normalize();
        vfx.particle({ tex: 'flame', pos: to.clone().addScaledVector(fwd, -0.3), vel: d.multiplyScalar(3 + Math.random() * 3), drag: 2.5, life: 0.35, size: [0.4, 1.0], color: [F.yellow, F.red], intensity: 1.15, additive: false, alpha: [0.9, 0] });
      }
      if (Math.random() < 0.3) c.target.shake(0.08, 0.2);
    });
    await Promise.all([stream, splash]);
    vfx.hitSpark(to, c.pal, 0.9);
    await burn;
  } else {
    await stream;
    vfx.burst(to, { count: 16, tex: 'flame', color: [F.yellow, F.red], speed: [1, 3], additive: false, size: [0.4, 0.7], life: 0.5 });
    await vfx.wait(250);
  }
  await vfx.wait(150);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- EMBER

registerMoveFx('EMBER', async (c) => {
  const { vfx } = c;
  const mouth = mouthOf(c, 0.4);
  vfx.particle({ tex: 'glow', pos: mouth, life: 0.25, size: [0.2, 0.9], color: F.orange, intensity: 1.6, alpha: [0.3, 0.9] });
  vfx.burst(mouth, { count: 12, tex: 'spark', color: [F.yellow, F.orange], speed: 0.2, jitter: 0.8, attract: { to: mouth, strength: 18 }, life: 0.25, size: [0.08, 0.16] });
  await vfx.wait(220);
  const to = c.aim(0.5);
  const n = 4;
  let first = true;
  const flights: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    const orb = vfx.prim.orb({ color: F.orange, core: F.white, radius: 0.15, intensity: 1.6 });
    const dest = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4));
    const trail = vfx.trail(() => orb.mesh.position, 400, { tex: 'flame', color: [F.yellow, F.red], size: [0.25, 0.4], endSize: 0.05, speed: 0.4, life: [0.18, 0.28], rate: 70, additive: false, intensity: 1.2 });
    flights.push(
      orb.fly(mouth.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, 0)), dest, 400, 0.7 + Math.random() * 0.5, ease.inQuad).then(async () => {
        orb.dispose();
        if (c.missed) {
          vfx.burst(dest, { count: 6, tex: 'flame', color: [F.yellow, F.red], speed: [1, 2], additive: false, size: [0.2, 0.35], life: 0.3 });
          return;
        }
        vfx.burst(dest, { count: 12, tex: 'flame', color: [F.yellow, F.red], speed: [1.5, 3.5], size: [0.3, 0.5], life: [0.25, 0.4], additive: false, intensity: 1.2, dir: up, spread: 1.3 });
        vfx.burst(dest, { count: 8, tex: 'spark', color: [F.white, F.orange], speed: [2, 5], size: [0.1, 0.2], life: 0.3 });
        vfx.particle({ tex: 'glow', pos: dest, life: 0.2, size: [1.2, 0.4], color: F.orange, intensity: 1.6, alpha: [0.8, 0] });
        if (first) {
          first = false;
          c.impact(0);
          c.target.flash(F.orange, 200, 0.5);
        }
        await trail;
      }),
    );
    await vfx.wait(100);
  }
  await Promise.all(flights);
  if (!c.missed) await burnOn(c, to, 380, 0.8, 0.45);
  else await vfx.wait(250);
});

// --------------------------------------------------------------------------------------- FIRE PUNCH

registerMoveFx('FIRE_PUNCH', async (c) => {
  const { vfx } = c;
  // wind-up: fist ignites with a spiral of flame
  c.attacker.setOutline(1.5, F.orange);
  const fist = () => c.attacker.at(0.5).add(c.dir.clone().multiplyScalar(0.55));
  const ignite = during(c, 380, () => {
    for (let i = 0; i < 4; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = fist().add(new THREE.Vector3(Math.cos(a) * 0.35, -0.2 + Math.random() * 0.3, Math.sin(a) * 0.35));
      vfx.particle({ tex: 'flame', pos: p, vel: new THREE.Vector3(0, 2.4, 0), life: 0.3, size: [0.4, 0.05], color: [F.yellow, F.red], intensity: 1.2, additive: false, alpha: [0.95, 0], rot: 0 });
    }
    vfx.particle({ tex: 'glow', pos: fist(), life: 0.06, size: 1.1, color: F.orange, intensity: 1.4, alpha: [0.8, 0] });
  });
  await ignite;
  // dash: flaming fist leaves a trail of fire
  const lunge = c.attacker.lunge(c.foe, Math.min(3.2, c.user.distanceTo(c.foe) * 0.55), 380);
  const trail = during(c, 380, () => {
    const p = fist();
    for (let i = 0; i < 4; i++) vfx.particle({ tex: 'flame', pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0)), vel: new THREE.Vector3(0, 1.5, 0), life: 0.3, size: [0.55, 0.1], color: [F.yellow, F.red], intensity: 1.2, additive: false, alpha: [0.9, 0] });
    vfx.particle({ tex: 'glow', pos: p, life: 0.12, size: 1.0, color: F.orange, intensity: 1.5, alpha: [0.7, 0] });
  });
  await lunge;
  c.attacker.setOutline(0);
  const at = c.aim(0.5);
  if (!c.missed) {
    vfx.hitSpark(at, c.pal, 1.3);
    c.stage.shockwave(at, 0.8, 300);
    c.stage.flash(F.orange, 0.3, 180);
    vfx.shake(0.3, 350);
    c.target.flash(F.orange, 300, 0.7);
    // flame burst ring around the point of contact
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const d = sideOf(c.dir).multiplyScalar(Math.cos(a)).add(new THREE.Vector3(0, Math.sin(a), 0)).addScaledVector(c.dir, 0.3);
      vfx.particle({ tex: 'flame', pos: at.clone(), vel: d.multiplyScalar(5 + Math.random() * 2), drag: 3, life: 0.45, size: [0.5, 0.9], color: [F.yellow, F.red], intensity: 1.2, additive: false, alpha: [0.95, 0] });
    }
    vfx.burst(at, { count: 22, tex: 'spark', color: [F.white, F.ember], speed: [4, 9], size: [0.12, 0.24], life: [0.3, 0.5], gravity: 4 });
    c.impact(0);
    await Promise.all([trail, burnOn(c, at, 550, 1.2, 0.5)]);
  } else {
    vfx.burst(at, { count: 14, tex: 'flame', color: [F.yellow, F.red], speed: [2, 4], additive: false, size: [0.3, 0.5], life: 0.35 });
    await trail;
    await vfx.wait(300);
  }
});

// --------------------------------------------------------------------------------------- WILL-O-WISP

registerMoveFx('WILL_O_WISP', async (c) => {
  const { vfx } = c;
  const W = { core: 0xd8d0ff, main: 0x7a58ff, deep: 0x3a2aa8, cyan: 0x6ac8ff };
  vfx.shot('side', c.side, 500);
  c.stage.setTint(0x7a70c0, 0.35, 400);
  const n = 5;
  const center = c.user.clone().add(new THREE.Vector3(0, 0.2, 0));
  const wispPos: THREE.Vector3[] = Array.from({ length: n }, () => center.clone());
  const emitWisp = (p: THREE.Vector3, big = 1) => {
    vfx.particle({ tex: 'flame', pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.12, 0, (Math.random() - 0.5) * 0.12)), vel: new THREE.Vector3(0, 1.3, 0), life: 0.4, size: [0.45 * big, 0.05], color: [W.cyan, W.deep], intensity: 1.3, alpha: [0.9, 0], rot: (Math.random() - 0.5) * 0.3 });
    vfx.particle({ tex: 'glow', pos: p.clone(), life: 0.08, size: 0.7 * big, color: W.main, intensity: 1.3, alpha: [0.7, 0] });
    if (Math.random() < 0.3) vfx.particle({ tex: 'dot', pos: p.clone(), vel: new THREE.Vector3((Math.random() - 0.5), 0.6, (Math.random() - 0.5)), life: 0.5, size: [0.08, 0.02], color: W.core, intensity: 1.8 });
  };
  // 1) wisps pop into existence around the user and orbit
  const R = Math.max(0.9, c.attacker.width * 0.55);
  for (let i = 0; i < n; i++) vfx.burst(center.clone().add(new THREE.Vector3(Math.cos((i / n) * 6.283) * R, 0.2, Math.sin((i / n) * 6.283) * R)), { count: 6, tex: 'spark', color: [W.core, W.main], speed: [1, 2], size: [0.1, 0.18], life: 0.3, intensity: 1.6 });
  await during(c, 650, (k, _dt, el) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (el / 1000) * 3.2;
      const r = R * (0.6 + 0.4 * ease.outCubic(Math.min(1, k * 2)));
      wispPos[i].set(center.x + Math.cos(a) * r, center.y + 0.2 + Math.sin(a * 2 + i) * 0.25, center.z + Math.sin(a) * r);
      emitWisp(wispPos[i], 0.6 + 0.4 * Math.min(1, k * 3));
    }
  });
  // 2) drift toward the target on wavy paths
  const to = c.aim(0.5);
  const starts = wispPos.map((p) => p.clone());
  let landed = 0;
  await during(c, 800, (k) => {
    for (let i = 0; i < n; i++) {
      const kk = ease.inOutQuad(Math.min(1, Math.max(0, k * 1.25 - i * 0.05)));
      const p = starts[i].clone().lerp(to, kk);
      const s = sideOf(c.dir);
      const env = Math.sin(kk * Math.PI);
      p.addScaledVector(s, Math.sin(kk * 9 + i * 1.7) * 0.6 * env);
      p.y += Math.cos(kk * 7 + i) * 0.45 * env + env * 0.6;
      // converge into a small orbit around the target at the end
      if (kk > 0.85) {
        const a = i * 1.256 + k * 12;
        p.add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar((1 - (kk - 0.85) / 0.15) * 0.5));
      }
      wispPos[i].copy(p);
      emitWisp(p);
    }
  });
  if (!c.missed) {
    // 3) sink into the target: ghostly flare
    c.target.flash(W.main, 450, 0.8);
    vfx.prim.shockwave(to, { color: W.main, radius: 1.8, ms: 400, intensity: 1.5 });
    vfx.burst(to, { count: 30, tex: 'flame', color: [W.cyan, W.deep], speed: [1.5, 3.5], size: [0.35, 0.55], life: [0.3, 0.5], dir: up, spread: 1.2, intensity: 1.3 });
    vfx.burst(to, { count: 16, tex: 'dot', color: W.core, speed: [2, 4], size: [0.08, 0.14], life: 0.5, intensity: 1.8 });
    c.impact(0);
    landed = 1;
    await during(c, 450, () => {
      if (Math.random() < 0.6) emitWisp(to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 0.6)), 0.7);
    });
  } else {
    vfx.burst(to, { count: 14, tex: 'flame', color: [W.cyan, W.deep], speed: [1, 2], size: [0.3, 0.45], life: 0.35 });
    await vfx.wait(300);
  }
  void landed;
  c.stage.setTint(0xffffff, 0, 400);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(250);
});

// --------------------------------------------------------------------------------------- BLAST BURN

registerMoveFx('BLAST_BURN', async (c) => {
  const { vfx, stage } = c;
  // 1) charge: ring of fire around the user, heat gathering
  vfx.shot('attacker', c.side, 450);
  stage.setTint(0xff9060, 0.3, 500);
  c.attacker.setOutline(1.8, F.orange);
  const feet = c.userFeet.clone();
  const core = c.user.clone();
  vfx.prim.shockwave(feet.clone().setY(feet.y + 0.05), { color: F.orange, radius: 2.4, facing: 'ground', ms: 700, intensity: 1.8 });
  const charge = during(c, 850, (k) => {
    const R = 1.6 - k * 0.5;
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = feet.clone().add(new THREE.Vector3(Math.cos(a) * R, 0.1, Math.sin(a) * R));
      vfx.particle({ tex: 'flame', pos: p, vel: new THREE.Vector3(-Math.cos(a) * 0.8, 3 + k * 3, -Math.sin(a) * 0.8), life: 0.4, size: [0.6 + k * 0.5, 0.1], color: [F.yellow, F.red], intensity: 1.2, additive: false, alpha: [0.95, 0], rot: 0 });
    }
    vfx.particle({ tex: 'spark', pos: core.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.3) * 3, (Math.random() - 0.5) * 4)), vel: new THREE.Vector3(), attract: { to: core, strength: 30 }, drag: 2, life: 0.45, size: [0.14, 0.05], color: [F.white, F.orange], intensity: 2 });
    vfx.particle({ tex: 'glow', pos: core, life: 0.07, size: 1 + k * 2.2, color: F.orange, intensity: 1.2 + k, alpha: [0.6, 0] });
    if (Math.random() < 0.3) c.attacker.shake(0.05, 0.1);
  });
  vfx.shake(0.1, 850);
  await charge;
  c.attacker.setOutline(0);
  // 2) launch: a searing fireball rushes along the ground
  c.stage.flash(F.orange, 0.3, 180);
  vfx.shot('side', c.side, 300);
  const to = c.aim(0.5);
  const ground = c.missed ? to.clone().setY(c.foeFeet.y + 0.3) : c.foeFeet.clone().setY(c.foeFeet.y + 0.3);
  const orb = vfx.prim.orb({ color: F.orange, core: F.white, radius: 0.55, intensity: 1.8 });
  const from = c.user.clone().add(c.dir.clone().multiplyScalar(0.6));
  const trail = vfx.trail(() => orb.mesh.position, 380, { tex: 'flame', color: [F.yellow, F.red], size: [0.7, 1.0], endSize: 0.2, speed: 0.8, life: [0.25, 0.4], rate: 110, additive: false, intensity: 1.2 });
  stage.wait(200).then(() => pulledShot(c, 'foe', 2.1, 1.0, 300));
  await orb.fly(from, ground.clone().lerp(to, 0.3), 380, 0.4, ease.inQuad);
  orb.dispose();
  void trail;
  // 3) eruption
  const base = c.missed ? to.clone().setY(c.foeFeet.y) : c.foeFeet.clone();
  const mid = base.clone().setY(base.y + 1.2);
  stage.flash(0xffa040, 0.45, 260);
  stage.setTint(0xffffff, 0, 300);
  stage.shockwave(mid, 1.4, 500);
  stage.chromaPulse(0.025, 500);
  vfx.shake(0.6, 900);
  if (!c.missed) {
    c.impact(0);
    c.target.flash(0xffffff, 200, 1);
  }
  vfx.prim.blast(mid, { core: F.yellow, main: 0xff5a0a, dark: 0x3a0e04, radius: 2.4, ms: 1300, scaleY: 1.35, rise: 1.2, intensity: 1.05 });
  vfx.prim.pillar(base.clone().setY(base.y + 0.1), { color: 0xff5010, radius: 1.3, height: 9, ms: 1000, intensity: 0.9 });
  vfx.prim.shockwave(base.clone().setY(base.y + 0.06), { color: F.orange, radius: 5, facing: 'ground', ms: 700, thickness: 0.25, intensity: 2 });
  stage.wait(120).then(() => vfx.prim.shockwave(base.clone().setY(base.y + 0.06), { color: F.yellow, radius: 3.6, facing: 'ground', ms: 600, intensity: 2 }));
  vfx.burst(mid, { count: 50, tex: 'spark', color: [F.white, F.ember], speed: [6, 14], size: [0.15, 0.3], life: [0.5, 1.0], gravity: 6, drag: 1 });
  vfx.prim.debris({ from: base.clone().setY(base.y + 0.2), count: 10, color: 0x3a2a22, size: 0.2, speed: 5, up: 7, ms: 1300, emissive: 0.3 });
  // roaring column of flame
  const column = during(c, 1100, (k) => {
    const n = Math.round(10 * (1 - k * 0.7));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.4;
      vfx.particle({ tex: 'flame', pos: base.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.2, Math.sin(a) * r)), vel: new THREE.Vector3(Math.cos(a) * 0.8, 6 + Math.random() * 5, Math.sin(a) * 0.8), drag: 0.6, life: 0.6 + Math.random() * 0.3, size: [1.0 + Math.random() * 0.6, 0.3], color: [F.yellow, F.red], intensity: 1.2, additive: false, alpha: [0.95, 0], rot: (Math.random() - 0.5) * 0.3 });
    }
    if (Math.random() < 0.6) vfx.particle({ tex: 'flame', pos: base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.3, (Math.random() - 0.5) * 1.2)), vel: new THREE.Vector3(0, 8 + Math.random() * 4, 0), life: 0.45, size: [0.8, 0.2], color: [F.yellow, F.red], intensity: 0.9, alpha: [0.6, 0], rot: 0 });
    if (Math.random() < 0.6) vfx.particle({ tex: 'smoke', pos: base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2)), vel: new THREE.Vector3((Math.random() - 0.5), 2.5, (Math.random() - 0.5)), life: 1.4, size: [1.2, 3.2], color: [F.soot, F.smoke], additive: false, alpha: [0.5, 0], fadeIn: 0.3, spin: 0.8 });
    // ground fire ring spreading out
    if (k < 0.5) {
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 1 + k * 5;
        vfx.particle({ tex: 'flame', pos: base.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.15, Math.sin(a) * r)), vel: new THREE.Vector3(0, 2.5, 0), life: 0.35, size: [0.7, 0.1], color: [F.yellow, F.red], intensity: 1.2, additive: false, alpha: [0.9, 0], rot: 0 });
      }
    }
  });
  await column;
  // 4) dissipation: smoke and drifting embers
  vfx.burst(base.clone().setY(base.y + 1.5), { count: 24, tex: 'spark', color: [F.yellow, F.ember], speed: [0.5, 2], size: [0.08, 0.15], life: [0.8, 1.2], gravity: -1, drag: 1, intensity: 1.8, jitter: 1.5 });
  await vfx.wait(450);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(150);
});
