import * as THREE from 'three';
import type { PokemonSprite } from '../../render/pokemonSprite';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { during, pulledShot, sideOf, up, softHit } from './common';

const E = { white: 0xffffff, pale: 0xfff6b0, main: 0xffe030, deep: 0xffb000, dark: 0x8a6a00, storm: 0x1a1e30 };

/** Random point on a sprite's body (world). */
function onBody(s: PokemonSprite, spread = 0.9) {
  return s.at(0.15 + Math.random() * 0.75).add(new THREE.Vector3((Math.random() - 0.5) * s.width * 0.6 * spread, 0, (Math.random() - 0.5) * 0.3));
}

/** Short crackling arcs jumping around a sprite. */
function crackle(c: MoveFxContext, s: PokemonSprite, ms: number, rate = 0.5, width = 0.05) {
  const { vfx } = c;
  return during(c, ms, () => {
    if (Math.random() < rate) {
      const a = onBody(s, 1.2);
      const b = a.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.6));
      vfx.prim.lightning(a, b, { color: E.main, width, jitter: 0.25, segments: 6, ms: 110, intensity: 1.36 });
    }
  });
}

/** X-ray style electrocution flicker + arcs on the target. */
async function electrocute(c: MoveFxContext, s: PokemonSprite, ms = 450) {
  const u = s.uniforms;
  const sil = u.silColor.value as THREE.Color;
  const prev = sil.clone();
  let n = 0;
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

// --------------------------------------------------------------------------------------- THUNDERBOLT

registerMoveFx('THUNDERBOLT', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 400);
  // charge: static builds up over the body
  const charge = crackle(c, c.attacker, 420, 0.9, 0.05);
  const flick = during(c, 420, () => c.attacker.setOutline(Math.random() < 0.5 ? 1.8 : 0.6, E.main));
  vfx.burst(c.user, { count: 24, tex: 'spark', color: [E.white, E.main], speed: 0.2, jitter: 1.6, attract: { to: c.user, strength: 20 }, life: 0.35, size: [0.12, 0.24], intensity: 1.2 });
  await Promise.all([charge, flick]);
  c.attacker.setOutline(0);
  // the bolt
  const from = c.attacker.at(0.6).add(c.dir.clone().multiplyScalar(0.4));
  const to = c.aim(0.5);
  stage.flash(E.pale, 0.1, 100);
  vfx.prim.lightning(from, to, { color: E.main, width: 0.16, jitter: 0.9, segments: 18, ms: 520, intensity: 1.15 });
  vfx.prim.lightning(from, to, { color: E.deep, width: 0.08, jitter: 1.3, segments: 14, ms: 440, intensity: 1.0 });
  stage.wait(60).then(() => vfx.prim.lightning(from, to, { color: E.pale, width: 0.06, jitter: 1.6, segments: 12, ms: 360, intensity: 1.0 }));
  vfx.particle({ tex: 'glow', pos: from, life: 0.3, size: [1.4, 0.5], color: E.main, intensity: 1.0, alpha: [0.7, 0] });
  await vfx.wait(90);
  if (!c.missed) {
    c.impact(0);
    softHit(c, to, c.pal, 1.2);
    stage.flash(E.pale, 0.1, 180);
    stage.chromaPulse(0.015, 300);
    vfx.shake(0.22, 350);
    vfx.burst(to, { count: 30, tex: 'spark', color: [E.white, E.main], speed: [3, 9], life: [0.2, 0.5], size: [0.1, 0.24], gravity: 5, intensity: 1.4 });
    await electrocute(c, c.target, 480);
  } else {
    vfx.burst(to, { count: 16, tex: 'spark', color: [E.white, E.main], speed: [2, 6], life: 0.3, size: [0.1, 0.2] });
    await vfx.wait(400);
  }
  await vfx.wait(150);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- THUNDER

registerMoveFx('THUNDER', async (c) => {
  const { vfx, stage } = c;
  pulledShot(c, 'foe', 1.9, 1.3, 500);
  stage.setTint(0x5060a8, 0.5, 400);
  const to = c.aim(0.5);
  const cloudC = to.clone().add(new THREE.Vector3(0, 3.0, 0));
  // storm cloud gathers over the target
  const gather = during(c, 650, (k) => {
    for (let i = 0; i < 3; i++) {
      const p = cloudC.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 2));
      vfx.particle({ tex: 'smoke', pos: p, vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, 0), life: 1.6, size: [1.2, 2.0], color: [0x3a3e58, E.storm], intensity: 1, additive: false, alpha: [0.8, 0], fadeIn: 0.2, spin: 0.3 });
    }
    if (Math.random() < 0.15 + k * 0.3) vfx.particle({ tex: 'glow', pos: cloudC.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 1.5)), life: 0.12, size: 2.2, color: E.pale, intensity: 1.4, alpha: [0.8, 0] });
  });
  vfx.shake(0.06, 650);
  await gather;
  const ground = c.missed ? to : c.foeFeet.clone().setY(c.foeFeet.y + 0.4);
  for (let i = 0; i < 2; i++) {
    vfx.prim.lightning(cloudC.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, 0)), ground, { color: E.main, width: 0.17, jitter: 0.9, segments: 22, ms: 480, intensity: 1.25 });
    await vfx.wait(70);
  }
  vfx.prim.lightning(cloudC, ground, { color: E.white, width: 0.07, jitter: 0.6, segments: 20, ms: 380, intensity: 1.2 });
  stage.flash(0xffffff, 0.3, 200);
  stage.chromaPulse(0.008, 250);
  vfx.shake(0.5, 550);
  if (!c.missed) {
    c.impact(0);
    softHit(c, to, c.pal, 1.8);
  }
  vfx.prim.shockwave(c.foeFeet.clone().setY(c.foeFeet.y + 0.06), { color: E.main, radius: 4, facing: 'ground', ms: 600, intensity: 1.24 });
  vfx.burst(ground, { count: 50, tex: 'spark', color: [E.white, E.main], speed: [3, 10], life: [0.3, 0.7], dir: up, spread: 1.3, gravity: 8, size: [0.1, 0.26], intensity: 1.4 });
  vfx.prim.pillar(c.foeFeet.clone(), { color: E.main, radius: 0.9, height: 6, ms: 500, intensity: 1.2 });
  if (!c.missed) await electrocute(c, c.target, 550);
  else await vfx.wait(500);
  // cloud clears
  await stage.setTint(0xffffff, 0, 450);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- THUNDER PUNCH

registerMoveFx('THUNDER_PUNCH', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 350);
  const fist = () => c.attacker.at(0.5).add(c.dir.clone().multiplyScalar(0.55));
  // fist crackles with electricity
  c.attacker.setOutline(1.4, E.main);
  await during(c, 360, () => {
    if (Math.random() < 0.8) {
      const a = fist().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.4));
      vfx.prim.lightning(fist(), a, { color: E.main, width: 0.05, jitter: 0.2, segments: 5, ms: 90, intensity: 1.49 });
    }
    vfx.particle({ tex: 'glow', pos: fist(), life: 0.06, size: 0.9, color: E.main, intensity: 1.3, alpha: [0.7, 0] });
  });
  const lunge = c.attacker.lunge(c.foe, Math.min(3.2, c.user.distanceTo(c.foe) * 0.55), 360);
  const trail = during(c, 360, () => {
    vfx.particle({ tex: 'glow', pos: fist(), life: 0.14, size: 0.8, color: E.main, intensity: 1.3, alpha: [0.7, 0] });
    vfx.particle({ tex: 'spark', pos: fist(), vel: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0), life: 0.2, size: 0.2, color: E.pale, intensity: 1.2 });
  });
  await lunge;
  c.attacker.setOutline(0);
  const at = c.aim(0.5);
  if (!c.missed) {
    c.impact(0);
    softHit(c, at, c.pal, 1.3);
    stage.flash(E.pale, 0.18, 150);
    stage.shockwave(at, 0.7, 300);
    vfx.shake(0.28, 320);
    // bolts radiating out from the point of contact
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
      const d = sideOf(c.dir).multiplyScalar(Math.cos(a)).add(new THREE.Vector3(0, Math.sin(a), 0)).multiplyScalar(1.4 + Math.random() * 0.8);
      vfx.prim.lightning(at, at.clone().add(d), { color: E.main, width: 0.08, jitter: 0.35, segments: 8, ms: 260, intensity: 1.61 });
    }
    vfx.prim.lightning(at.clone().add(new THREE.Vector3(0, 3, 0)), at, { color: E.pale, width: 0.14, ms: 300, intensity: 1.6 });
    await Promise.all([trail, electrocute(c, c.target, 400)]);
  } else {
    vfx.burst(at, { count: 14, tex: 'spark', color: [E.white, E.main], speed: [2, 5], size: [0.1, 0.2], life: 0.3 });
    await trail;
    await vfx.wait(300);
  }
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- THUNDER WAVE

registerMoveFx('THUNDER_WAVE', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 400);
  const from = c.attacker.at(0.55).add(c.dir.clone().multiplyScalar(0.5));
  const to = c.aim(0.5);
  const fwd = to.clone().sub(from).normalize();
  c.attacker.setOutline(1.2, E.main);
  vfx.burst(from, { count: 14, tex: 'spark', color: [E.white, E.main], speed: 0.2, jitter: 1, attract: { to: from, strength: 16 }, life: 0.25, size: [0.1, 0.18] });
  await vfx.wait(220);
  c.attacker.setOutline(0);
  // a weak, jittery electric ring pulses across the field
  let last = -1;
  await during(c, 520, (k, _dt, el) => {
    const p = from.clone().lerp(to, k);
    p.y += Math.sin(k * 30) * 0.08;
    if (el - last > 70) {
      last = el;
      vfx.prim.shockwave(p, { color: E.main, radius: 0.9 + Math.random() * 0.3, ms: 200, thickness: 0.18, facing: fwd, intensity: 1.2 });
    }
    // ragged little arc riding the ring
    if (Math.random() < 0.6) {
      const s = sideOf(fwd);
      const a = Math.random() * Math.PI * 2;
      const q = p.clone().addScaledVector(s, Math.cos(a) * 0.7).add(new THREE.Vector3(0, Math.sin(a) * 0.7, 0));
      const a2 = a + 0.9;
      const q2 = p.clone().addScaledVector(s, Math.cos(a2) * 0.7).add(new THREE.Vector3(0, Math.sin(a2) * 0.7, 0));
      vfx.prim.lightning(q, q2, { color: E.main, width: 0.04, jitter: 0.2, segments: 5, ms: 90, intensity: 1.36 });
    }
  });
  if (c.missed) {
    vfx.burst(to, { count: 12, tex: 'spark', color: [E.white, E.main], speed: [1, 3], size: [0.08, 0.14], life: 0.3 });
    await vfx.wait(350);
    vfx.shot('wide', c.side, 500);
    return;
  }
  // the wave locks around the target: crackling rings
  c.impact(0);
  const center = c.target.at(0);
  const R = Math.max(0.7, c.target.width * 0.5);
  const hs = [0.25, 0.55, 0.85].map((f) => c.target.height * f);
  const rings = during(c, 650, (k) => {
    if (Math.random() < 0.7) {
      const h = hs[Math.floor(Math.random() * hs.length)];
      const pts: THREE.Vector3[] = [];
      const n = 7;
      const a0 = Math.random() * Math.PI * 2;
      for (let i = 0; i <= n; i++) {
        const a = a0 + (i / n) * Math.PI * 2;
        pts.push(center.clone().add(new THREE.Vector3(Math.cos(a) * R * (1 - k * 0.2), h + (Math.random() - 0.5) * 0.15, Math.sin(a) * R * (1 - k * 0.2))));
      }
      for (let i = 0; i < n; i++) vfx.prim.lightning(pts[i], pts[i + 1], { color: E.main, width: 0.04, jitter: 0.12, segments: 4, ms: 110, intensity: 1.36 });
    }
    if (Math.random() < 0.5) vfx.burst(onBody(c.target), { count: 3, tex: 'spark', color: [E.white, E.main], speed: [1, 3], size: [0.08, 0.16], life: 0.2 });
  });
  vfx.prim.shockwave(center.clone().setY(center.y + 0.06), { color: E.main, radius: R * 2, facing: 'ground', ms: 400, intensity: 1.2 });
  // paralysis: stuttering yellow flicker
  const flick = during(c, 650, (_k, _dt, el) => {
    c.target.uniforms.flashAmt.value = Math.floor(el / 60) % 2 === 0 ? 0.5 : 0;
    (c.target.uniforms.flashColor.value as THREE.Color).set(E.main);
  });
  await Promise.all([rings, flick]);
  c.target.uniforms.flashAmt.value = 0;
  await vfx.wait(150);
  vfx.shot('wide', c.side, 500);
});
