import * as THREE from 'three';
import { registerMoveFx } from '../vfx';
import { during, screenAngle, sideOf } from './common';

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
