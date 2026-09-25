import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { during, powderCloud, powderFall } from './common';

const P = { pale: 0xf0b0ff, light: 0xd070ff, main: 0xa030d0, deep: 0x6a1a90, dark: 0x2a0838, gas: 0x5a3070, gasDark: 0x24142c };

const mouthOf = (c: MoveFxContext, fwd = 0.5) => c.attacker.at(0.6).add(c.dir.clone().multiplyScalar(fwd));

/** Toxic bubbles popping around a point. */
function bubbles(c: MoveFxContext, at: THREE.Vector3, ms: number, radius = 0.8, rate = 0.5) {
  const { vfx } = c;
  return during(c, ms, () => {
    if (Math.random() < rate) {
      const p = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2 * radius, (Math.random() - 0.5) * radius, (Math.random() - 0.5) * 2 * radius));
      vfx.particle({ tex: 'bubble', pos: p, vel: new THREE.Vector3(0, 0.8 + Math.random(), 0), life: 0.6, size: [0.1, 0.3], color: P.light, intensity: 1.3, alpha: [0.9, 0.6] });
    }
  });
}

/** Goo splatter: normal-blended purple blobs thrown out with gravity. */
function gooSplat(c: MoveFxContext, at: THREE.Vector3, k = 1) {
  const { vfx } = c;
  for (let i = 0; i < Math.round(40 * k); i++) {
    const d = new THREE.Vector3((Math.random() - 0.5) * 2, 0.3 + Math.random() * 1.1, (Math.random() - 0.5) * 2).normalize();
    const s = 0.18 + Math.random() * 0.25;
    vfx.particle({ tex: Math.random() < 0.5 ? 'drop' : 'dot', pos: at.clone(), vel: d.multiplyScalar(3 + Math.random() * 4.5), acc: new THREE.Vector3(0, -13, 0), drag: 0.4, life: 0.55 + Math.random() * 0.3, size: [s, s * 0.6], color: [P.main, P.deep], intensity: 1.05, additive: false, alpha: [1, 0.6] });
  }
  vfx.burst(at, { count: Math.round(10 * k), tex: 'smoke', color: [P.light, P.deep], speed: [1, 2.5], size: [0.6, 1.0], endSize: 1.8, life: 0.7, additive: false, alpha: [0.6, 0], drag: 3, intensity: 1 });
}

// --------------------------------------------------------------------------------------- POISON POWDER

registerMoveFx('POISON_POWDER', async (c) => {
  const { vfx } = c;
  const col = { a: 0xc890e8, b: 0x7a2aa8, spark: 0xd070ff };
  vfx.shot('side', c.side, 400);
  c.attacker.shake(0.1, 0.4);
  vfx.burst(c.attacker.at(0.9), { count: 10, tex: 'smoke', color: [col.a, col.b], speed: [0.5, 1.5], size: [0.4, 0.8], endSize: 1.4, life: 0.6, additive: false, alpha: [0.5, 0], intensity: 1 });
  await vfx.wait(200);
  await powderCloud(c, col, 750);
  const fall = powderFall(c, col, 800);
  await vfx.wait(350);
  if (!c.missed) {
    c.impact(0);
    c.target.flash(P.main, 500, 0.5);
    void bubbles(c, c.aim(0.5), 500, 0.6, 0.6);
  }
  await fall;
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- SLUDGE BOMB

registerMoveFx('SLUDGE_BOMB', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 400);
  const from = mouthOf(c, 0.6);
  // a glob of sludge wells up
  const blob = vfx.prim.blob({ color: P.main, radius: 0.4, emissive: 0.35, roughness: 0.25 });
  blob.mesh.position.copy(from);
  const gurgle = bubbles(c, c.user, 450, 0.7, 0.7);
  const drip = during(c, 450, () => {
    if (Math.random() < 0.4) vfx.particle({ tex: 'drop', pos: blob.mesh.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, -0.25, 0)), vel: new THREE.Vector3(0, -0.5, 0), acc: new THREE.Vector3(0, -8, 0), life: 0.4, size: [0.14, 0.08], color: P.main, additive: false, intensity: 1 });
  });
  await Promise.all([blob.grow(450, 1), gurgle, drip]);
  // lob it
  const to = c.aim(0.5);
  const trail = vfx.trail(() => blob.mesh.position, 600, { tex: 'drop', color: [P.main, P.deep], size: [0.14, 0.24], speed: 0.5, gravity: 7, life: [0.3, 0.5], rate: 45, additive: false, intensity: 1.05 });
  const glow = vfx.trail(() => blob.mesh.position, 600, { tex: 'bubble', color: P.light, size: [0.1, 0.2], speed: 0.3, life: 0.35, rate: 18, intensity: 1.2 });
  await blob.fly(from, to, 600, 2.4, ease.inQuad);
  blob.dispose();
  void trail;
  void glow;
  // splat
  if (!c.missed) {
    c.impact(0);
    c.target.flash(P.main, 450, 0.75);
    vfx.shake(0.3, 400);
    stage.shockwave(to, 0.5, 300);
  }
  vfx.prim.blast(to, { core: P.pale, main: P.main, dark: P.dark, radius: 1.3, ms: 750, rise: 0.2, intensity: 1.0, disp: 0.8 });
  gooSplat(c, to, 1.2);
  vfx.prim.shockwave(c.foeFeet.clone().setY(c.foeFeet.y + 0.05), { color: P.main, radius: 2.6, facing: 'ground', ms: 500, intensity: 1.4 });
  // goo oozes down the target, toxic bubbles fizz
  const ooze = during(c, 650, () => {
    if (Math.random() < 0.6 && !c.missed) {
      const p = c.target.at(0.5 + Math.random() * 0.4).add(new THREE.Vector3((Math.random() - 0.5) * c.target.width * 0.6, 0, 0.1));
      vfx.particle({ tex: 'drop', pos: p, vel: new THREE.Vector3(0, -0.6, 0), acc: new THREE.Vector3(0, -3, 0), life: 0.6, size: [0.18, 0.1], color: [P.main, P.deep], additive: false, intensity: 1 });
    }
  });
  await Promise.all([ooze, bubbles(c, to, 650, 0.8, 0.7)]);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- SMOG

registerMoveFx('SMOG', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 400);
  const mouth = mouthOf(c, 0.4);
  const to = c.aim(0.5);
  const fwd = to.clone().sub(mouth);
  const travel = 0.8;
  stage.setTint(0xb090c0, 0.25, 400);
  let hit = false;
  // a rolling cloud of dark gas
  await during(c, 950, (k, dt, el) => {
    if (k < 0.75) {
      const n = Math.round(60 * dt + Math.random());
      for (let i = 0; i < n; i++) {
        const v = fwd.clone().divideScalar(travel).add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.2) * 1.6, (Math.random() - 0.5) * 2));
        vfx.particle({ tex: 'smoke', pos: mouth.clone(), vel: v, drag: 0.4, life: travel * 1.3, size: [0.7, 3.2], color: [0x7a4a8a, P.gasDark], intensity: 1, additive: false, alpha: [0.85, 0], fadeIn: 0.1, spin: (Math.random() - 0.5) * 2 });
      }
      if (Math.random() < 0.5) vfx.particle({ tex: 'glow', pos: mouth.clone(), vel: fwd.clone().divideScalar(travel).add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), 0)), life: travel, size: [0.2, 0.35], color: P.main, intensity: 0.9, alpha: [0.7, 0] });
    }
    if (!hit && el > travel * 1000) {
      hit = true;
      if (!c.missed) {
        c.impact(0);
        c.target.flash(0x402050, 600, 0.6);
        c.target.shake(0.08, 0.5);
      }
    }
  });
  // the gas swirls around the target
  const center = c.missed ? to : c.target.at(0.45);
  await during(c, 600, (k) => {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.6 + Math.random() * 0.6;
      vfx.particle({ tex: 'smoke', pos: center.clone().add(new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.5) * 1.4, Math.sin(a) * r)), vel: new THREE.Vector3(0, 0.4, 0), swirl: { center, speed: 2.5 }, life: 0.9, size: [1.2, 2.6], color: [P.gas, P.gasDark], intensity: 1, additive: false, alpha: [0.6 * (1 - k), 0], fadeIn: 0.2, spin: 1 });
    }
  });
  stage.setTint(0xffffff, 0, 400);
  await vfx.wait(350);
  vfx.shot('wide', c.side, 500);
});
