import * as THREE from 'three';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { during, sideOf, up, softHit } from './common';

const I = { white: 0xffffff, frost: 0xdaf6ff, main: 0x9ae8ff, blue: 0x3a90ff, deep: 0x2a70c0, crystal: 0x58b0f0 };

const hsl = (h: number, s = 0.85, l = 0.62) => new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l).getHex();

/** Frosty mist + snowflakes sucked into a point. */
function frostGather(c: MoveFxContext, at: () => THREE.Vector3, ms: number) {
  const { vfx } = c;
  return during(c, ms, (k) => {
    const p = at();
    const a = Math.random() * Math.PI * 2;
    const q = p.clone().add(new THREE.Vector3(Math.cos(a) * 1.3, (Math.random() - 0.5) * 1.2, Math.sin(a) * 1.3));
    vfx.particle({ tex: 'smoke', pos: q, vel: p.clone().sub(q).multiplyScalar(2.5), life: 0.4, size: [0.7, 0.2], color: [I.frost, I.main], intensity: 1, additive: false, alpha: [0, 0.5], spin: 2 });
    if (Math.random() < 0.8) vfx.particle({ tex: 'star', pos: q.clone(), vel: p.clone().sub(q).multiplyScalar(2.6), life: 0.38, size: [0.18, 0.05], color: [I.white, I.main], intensity: 1.5, spin: 6 });
    vfx.particle({ tex: 'glow', pos: p, life: 0.06, size: 0.5 + k * 0.8, color: I.main, intensity: 1, alpha: [0.6, 0] });
  });
}

/** Ice crystals burst out of `at`, then shatter. */
async function freezeBurst(c: MoveFxContext, at: THREE.Vector3, facing: THREE.Vector3, o: { count: number; size: number; ms: number }) {
  const { vfx } = c;
  const cr = vfx.prim.crystals(at, { color: I.crystal, count: o.count, size: o.size, ms: o.ms, spread: 1.1, dir: facing.clone().add(up.clone().multiplyScalar(0.6)), emissive: 0.22 });
  vfx.burst(at, { count: 16, tex: 'shard', color: [I.white, I.main], speed: [3, 6], size: [0.14, 0.26], life: [0.3, 0.5], spin: 8, additive: false, intensity: 1.2, gravity: 6 });
  vfx.burst(at, { count: 10, tex: 'smoke', color: [I.frost, I.main], speed: [1, 2], size: [0.6, 1], endSize: 1.6, life: 0.6, additive: false, alpha: [0.5, 0], drag: 3 });
  await cr.grown;
  const tips = cr.tips();
  const glint = during(c, o.ms * 0.55, () => {
    if (Math.random() < 0.35) vfx.particle({ tex: 'star', pos: tips[Math.floor(Math.random() * tips.length)], life: 0.25, size: [0.4, 0.05], color: I.white, intensity: 2, rot: 0 });
  });
  await cr.done;
  await glint;
  // shatter
  for (const t of tips) vfx.burst(t, { count: 4, tex: 'shard', color: [I.white, I.crystal], speed: [2, 4], size: [0.12, 0.2], life: 0.5, gravity: 9, spin: 10, additive: false, intensity: 1.2 });
  vfx.burst(at, { count: 14, tex: 'spark', color: [I.white, I.main], speed: [2, 5], size: [0.08, 0.16], life: 0.35, intensity: 1.6 });
}

// --------------------------------------------------------------------------------------- ICE BEAM

registerMoveFx('ICE_BEAM', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 400);
  const from = c.attacker.at(0.6).add(c.dir.clone().multiplyScalar(0.6));
  c.attacker.setOutline(1.3, I.main);
  await frostGather(c, () => from, 380);
  c.attacker.setOutline(0);
  const to = c.aim(0.5);
  const fwd = to.clone().sub(from).normalize();
  const sv = sideOf(fwd);
  const hold = 560;
  const beam = vfx.prim.beam(from, to, { color: I.blue, core: 0xa0e8ff, width: 0.24, holdMs: hold, noise: 0.3, wobble: 0.05, intensity: 0.65, growMs: 180 });
  const len = from.distanceTo(to);
  const deco = during(c, 180 + hold, (k, dt, el) => {
    const reach = Math.min(1, el / 180);
    // double helix of snowflakes around the beam
    for (let j = 0; j < 2; j++) {
      for (let s = 0; s < 3; s++) {
        const f = Math.random() * reach;
        const ph = f * len * 3 + el / 60 + j * Math.PI;
        const p = from.clone().addScaledVector(fwd, f * len).addScaledVector(sv, Math.cos(ph) * 0.38).add(new THREE.Vector3(0, Math.sin(ph) * 0.38, 0));
        vfx.particle({ tex: 'star', pos: p, life: 0.16, size: [0.2, 0.04], color: [I.white, I.main], intensity: 1.5, rot: ph });
      }
    }
    // ice shards crystallising along the path
    const n = Math.round(40 * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const p = from.clone().addScaledVector(fwd, Math.random() * reach * len).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));
      vfx.particle({ tex: 'shard', pos: p, vel: new THREE.Vector3(0, -0.4, 0), life: 0.5, size: [0.3, 0.12], color: [I.crystal, I.blue], intensity: 1.1, additive: false, alpha: [0.9, 0], fadeIn: 0.2 });
    }
    void k;
  });
  await beam.arrived;
  if (!c.missed) {
    c.impact(0);
    c.target.flash(I.main, 500, 0.7);
    stage.flash(I.frost, 0.12, 200);
    vfx.shake(0.2, 350);
    softHit(c, to, c.pal, 1.1);
    const front = to.clone().addScaledVector(fwd, -0.35);
    await Promise.all([freezeBurst(c, front, fwd.clone().negate(), { count: 10, size: 1.0, ms: 1000 }), beam.done, deco]);
  } else {
    vfx.burst(to, { count: 16, tex: 'shard', color: [I.white, I.main], speed: [2, 4], size: [0.14, 0.24], life: 0.4, additive: false });
    await Promise.all([beam.done, deco]);
  }
  await vfx.wait(150);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- ICE PUNCH

registerMoveFx('ICE_PUNCH', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 350);
  const fist = () => c.attacker.at(0.5).add(c.dir.clone().multiplyScalar(0.55));
  c.attacker.setOutline(1.4, I.main);
  await frostGather(c, fist, 380);
  const lunge = c.attacker.lunge(c.foe, Math.min(3.2, c.user.distanceTo(c.foe) * 0.55), 360);
  const trail = during(c, 360, () => {
    vfx.particle({ tex: 'smoke', pos: fist(), vel: new THREE.Vector3(0, 0.3, 0), life: 0.35, size: [0.5, 1], color: [I.frost, I.main], intensity: 1, additive: false, alpha: [0.6, 0] });
    vfx.particle({ tex: 'star', pos: fist().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 0)), life: 0.25, size: [0.2, 0.04], color: I.white, intensity: 1.6 });
  });
  await lunge;
  c.attacker.setOutline(0);
  const at = c.aim(0.5);
  if (!c.missed) {
    c.impact(0);
    softHit(c, at, c.pal, 1.2);
    stage.flash(I.frost, 0.3, 160);
    stage.shockwave(at, 0.6, 300);
    vfx.shake(0.26, 320);
    c.target.flash(I.main, 450, 0.75);
    await Promise.all([trail, freezeBurst(c, at.clone().addScaledVector(c.dir, -0.3), c.dir.clone().negate(), { count: 8, size: 0.85, ms: 800 })]);
  } else {
    vfx.burst(at, { count: 12, tex: 'shard', color: [I.white, I.main], speed: [2, 4], size: [0.12, 0.2], life: 0.35, additive: false });
    await trail;
    await vfx.wait(300);
  }
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- AURORA BEAM

registerMoveFx('AURORA_BEAM', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 400);
  const from = c.attacker.at(0.6).add(c.dir.clone().multiplyScalar(0.6));
  const hue0 = Math.random();
  // shimmering rainbow motes gather
  await during(c, 360, (k) => {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const q = from.clone().add(new THREE.Vector3(Math.cos(a) * 1.5, (Math.random() - 0.5) * 1.4, Math.sin(a) * 1.5));
      vfx.particle({ tex: 'spark', pos: q, vel: from.clone().sub(q).multiplyScalar(2.6), life: 0.38, size: [0.2, 0.06], color: hsl(hue0 + Math.random()), intensity: 1.6 });
    }
    vfx.particle({ tex: 'glow', pos: from, life: 0.06, size: 0.6 + k, color: hsl(hue0 + k), intensity: 1, alpha: [0.6, 0] });
  });
  const to = c.aim(0.5);
  const fwd = to.clone().sub(from).normalize();
  const sv = sideOf(fwd);
  const len = from.distanceTo(to);
  const hold = 620;
  // thin bright core + a body of normal-blended rainbow light so the hues survive on bright backdrops
  const beam = vfx.prim.beam(from, to, { color: 0x80ffd0, core: 0xe0fff8, width: 0.1, holdMs: hold, noise: 0.3, wobble: 0.1, intensity: 0.7, growMs: 200 });
  const mats = [beam.mesh.material as THREE.ShaderMaterial, (beam.mesh.children[0] as THREE.Mesh).material as THREE.ShaderMaterial];
  const ribbons = during(c, 200 + hold, (_k, dt, el) => {
    const t = el / 1000;
    const col = new THREE.Color(hsl(hue0 + t * 1.2, 0.95, 0.55)).multiplyScalar(0.8);
    for (const m of mats) (m.uniforms.color.value as THREE.Color).copy(col);
    const reach = Math.min(1, el / 200);
    // shimmering body: bands of hue flowing along the beam
    const nb = Math.round(650 * dt + Math.random());
    for (let i = 0; i < nb; i++) {
      const f = Math.random() * reach;
      const off = sv.clone().multiplyScalar((Math.random() - 0.5) * 0.35).add(new THREE.Vector3(0, (Math.random() - 0.5) * 0.35, 0));
      const p = from.clone().addScaledVector(fwd, f * len).add(off);
      vfx.particle({ tex: 'dot', pos: p, vel: fwd.clone().multiplyScalar(4), life: 0.2, size: [0.4, 0.2], color: hsl(hue0 + f * 1.4 - t * 2, 0.95, 0.55), intensity: 1.0, additive: false, alpha: [0.8, 0] });
    }
    for (let j = 0; j < 3; j++) {
      for (let s = 0; s < 5; s++) {
        const f = Math.random() * reach;
        const ph = f * len * 2.2 - t * 9 + j * 2.094;
        const r = 0.42 + 0.1 * Math.sin(f * 20 + t * 5);
        const p = from.clone().addScaledVector(fwd, f * len).addScaledVector(sv, Math.cos(ph) * r).add(new THREE.Vector3(0, Math.sin(ph) * r, 0));
        vfx.particle({ tex: 'glow', pos: p, life: 0.16, size: [0.3, 0.08], color: hsl(hue0 + j / 3 + f * 0.6 + t, 0.95, 0.55), intensity: 1.0, additive: false, alpha: [0.95, 0] });
      }
    }
    if (Math.random() < 0.6) vfx.particle({ tex: 'star', pos: from.clone().addScaledVector(fwd, Math.random() * reach * len).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 0)), life: 0.3, size: [0.25, 0.05], color: hsl(Math.random(), 0.7, 0.8), intensity: 1.4 });
  });
  await beam.arrived;
  if (!c.missed) {
    c.impact(0);
    c.target.flash(0xc0fff0, 350, 0.7);
    vfx.shake(0.2, 350);
    stage.flash(0xe0f0ff, 0.1, 200);
    softHit(c, to, { core: 0xe0fff8, main: 0x60d0ff }, 0.8);
    for (let i = 0; i < 3; i++) stage.wait(i * 110).then(() => vfx.prim.shockwave(to, { color: hsl(hue0 + i / 3), radius: 1.4 + i * 0.5, ms: 380, thickness: 0.18, intensity: 1.6 }));
    const burst = during(c, hold, () => {
      for (let i = 0; i < 3; i++) {
        const d = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.4) * 2, (Math.random() - 0.5) * 2).normalize();
        vfx.particle({ tex: Math.random() < 0.4 ? 'star' : 'dot', pos: to.clone(), vel: d.multiplyScalar(3 + Math.random() * 3), drag: 2, life: 0.45, size: [0.24, 0.06], color: hsl(Math.random(), 0.95, 0.55), intensity: 1.0, additive: false });
      }
    });
    await Promise.all([beam.done, ribbons, burst]);
  } else {
    await Promise.all([beam.done, ribbons]);
  }
  await vfx.wait(200);
  vfx.shot('wide', c.side, 500);
});
