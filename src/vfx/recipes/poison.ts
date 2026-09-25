import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { during, powderCloud, powderFall, sideOf, slashStroke, towardCam } from './common';

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

// --------------------------------------------------------------------------------------- POISON STING

registerMoveFx('POISON_STING', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 400);
  const from = mouthOf(c, 0.5);
  const to = c.aim(0.5);
  // barbs bristle with venom
  c.attacker.setOutline(1.2, P.light);
  vfx.burst(from, { count: 14, tex: 'spark', color: [P.pale, P.main], speed: 0.1, jitter: 0.9, attract: { to: from, strength: 14 }, life: 0.25, size: [0.08, 0.16], intensity: 1.3 });
  vfx.particle({ tex: 'star', pos: towardCam(c, from, 0.3), life: 0.25, size: [0.15, 0.9], color: P.pale, intensity: 1.6, alpha: [1, 0], spin: 5 });
  await vfx.wait(220);
  c.attacker.setOutline(0);
  const sv = sideOf(c.dir);
  const flights: Promise<void>[] = [];
  for (let i = 0; i < 3; i++) {
    const off = sv.clone().multiplyScalar((i - 1) * 0.32).add(new THREE.Vector3(0, i === 1 ? 0.22 : -0.08, 0));
    const a = from.clone().addScaledVector(off, 0.4);
    const b = to.clone().add(off);
    // each needle: a short venom-tipped dart racing along its path
    const needle = slashStroke(c, [a, b], { color: P.light, core: P.pale, width: 0.05, ms: 190, length: 0.17, holdMs: 0, fadeMs: 90, intensity: 1.2, edge: P.dark, edgeAlpha: 0.7, e: ease.linear });
    vfx.burst(a, { count: 4, tex: 'smoke', color: [P.light, P.deep], speed: [0.5, 1.2], size: [0.2, 0.35], endSize: 0.7, life: 0.35, additive: false, alpha: [0.5, 0], intensity: 1 });
    flights.push(
      needle.arrived.then(() => {
        if (c.missed) {
          vfx.burst(b, { count: 4, tex: 'spark', color: [P.pale, P.main], speed: [1, 3], size: [0.08, 0.14], life: 0.25, intensity: 1.2 });
          return;
        }
        vfx.prim.impactStar(towardCam(c, b, 0.5), { color: P.main, core: P.pale, size: 0.42, ms: 170, spikes: 6 });
        gooSplat(c, b, 0.25);
        if (i === 0) {
          c.impact(0);
          c.target.flash(P.main, 350, 0.5);
          vfx.shake(0.1, 220);
        } else c.target.shake(0.07, 0.12);
      }),
    );
    await vfx.wait(100);
  }
  await Promise.all(flights);
  if (!c.missed) await bubbles(c, c.target.at(0.5), 450, 0.5, 0.6);
  await vfx.wait(250);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- ACID

registerMoveFx('ACID', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 400);
  const from = mouthOf(c, 0.55);
  const to = c.aim(0.5);
  // gurgle...
  c.attacker.shake(0.06, 0.3);
  await bubbles(c, from, 300, 0.4, 0.9);
  // ...and spit three acid globs in quick arcs
  const sv = sideOf(c.dir);
  const lands: Promise<void>[] = [];
  for (let i = 0; i < 3; i++) {
    const dest = to.clone().addScaledVector(sv, (i - 1) * 0.38).add(new THREE.Vector3(0, (Math.random() - 0.5) * 0.4, 0));
    const blob = vfx.prim.blob({ color: P.main, radius: 0.2, emissive: 0.5, roughness: 0.15 });
    blob.mesh.position.copy(from);
    void vfx.trail(() => blob.mesh.position, 380, { tex: 'drop', color: [P.light, P.main], size: [0.1, 0.18], speed: 0.4, gravity: 6, life: [0.25, 0.4], rate: 40, additive: false, intensity: 1.05 });
    lands.push(
      blob.fly(from, dest, 380, 1.0 + i * 0.35, ease.inQuad).then(() => {
        blob.dispose();
        gooSplat(c, dest, 0.5);
        vfx.prim.shockwave(dest, { color: P.light, radius: 1.0, ms: 260, thickness: 0.2, intensity: 1.2 });
        if (c.missed) return;
        if (i === 0) {
          c.impact(0);
          c.target.flash(P.main, 400, 0.6);
          vfx.shake(0.18, 300);
          stage.shockwave(dest, 0.35, 250);
        } else c.target.shake(0.08, 0.15);
      }),
    );
    await vfx.wait(110);
  }
  await Promise.all(lands);
  // sizzle: hissing fumes and fizzing sparks eat at the hide
  const center = c.missed ? to : c.target.at(0.5);
  const W = c.missed ? 0.6 : Math.max(0.5, c.target.width * 0.35);
  await Promise.all([
    bubbles(c, center, 700, W, 0.8),
    during(c, 700, (k) => {
      const p = () => center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2 * W, (Math.random() - 0.5) * 1.4 * W, (Math.random() - 0.5) * W));
      if (Math.random() < 0.7) vfx.particle({ tex: 'smoke', pos: p(), vel: new THREE.Vector3(0, 1 + Math.random(), 0), life: 0.7, size: [0.3, 1.0], color: [0xe8d0f0, 0x9a80a8], intensity: 1, additive: false, alpha: [0.5 * (1 - k * 0.5), 0], spin: 1 });
      for (let i = 0; i < 2; i++) if (Math.random() < 0.6) vfx.particle({ tex: 'dot', pos: p(), vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2), acc: new THREE.Vector3(0, -6, 0), life: 0.25, size: [0.1, 0.02], color: [0xffffff, P.light], intensity: 1.4 });
      if (!c.missed && Math.random() < 0.12) c.target.flash(P.main, 120, 0.3);
    }),
  ]);
  await vfx.wait(150);
  vfx.shot('wide', c.side, 500);
});
