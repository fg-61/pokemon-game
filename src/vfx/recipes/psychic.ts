import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { during, healSparkles, motes, pulledShot, screenAngle, sideOf, softHit } from './common';

const Y = { pale: 0xffe0f8, pink: 0xff6ac8, main: 0xff4aa8, violet: 0xa060ff, lav: 0xc8a8ff, blue: 0x70a0ff, deep: 0x6a1a5a };

const headOf = (c: MoveFxContext, who: 'user' | 'foe') => (who === 'user' ? c.attacker : c.target).at(0.78);

// --------------------------------------------------------------------------------------- AGILITY

registerMoveFx('AGILITY', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  vfx.shot('attacker', c.side, 350);
  sp.setOutline(1.2, Y.pink);
  const sv = sideOf(c.dir);
  const seq = [1, -1, 0.6, -0.6, 0];
  let prev = 0;
  for (let i = 0; i < seq.length; i++) {
    const x = seq[i] * 0.9;
    vfx.prim.afterimage(sp.mesh, { color: i % 2 ? Y.blue : Y.pink, opacity: 0.6, ms: 480 });
    const from = prev;
    await c.stage.tween(85, (k) => sp.body.position.copy(sv).multiplyScalar(from + (x - from) * k), ease.outQuad);
    prev = x;
    // speed lines whipping past
    for (let j = 0; j < 8; j++) {
      const p = c.user.clone().addScaledVector(sv, (Math.random() - 0.5) * 3).add(new THREE.Vector3(0, (Math.random() - 0.5) * sp.height * 0.9, 0));
      const dir = sv.clone().multiplyScalar(Math.sign(x - from || 1));
      vfx.particle({ tex: 'streak', pos: p, vel: dir.clone().multiplyScalar(14), life: 0.16, size: [1.1, 0.5], color: [Y.pale, Y.pink], intensity: 0.75, alpha: [0.7, 0], rot: screenAngle(c, p, p.clone().add(dir)) });
    }
  }
  sp.body.position.set(0, 0, 0);
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: Y.pink, radius: 2, facing: 'ground', ms: 450, intensity: 1.4 });
  vfx.burst(c.user, { count: 12, tex: 'star', color: [0xffffff, Y.pink], speed: [2, 4], size: [0.15, 0.25], life: 0.4, intensity: 1.6 });
  sp.flash(Y.pale, 250, 0.5);
  sp.setOutline(0);
  await vfx.wait(350);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- PSYCHIC

registerMoveFx('PSYCHIC', async (c) => {
  const { vfx, stage } = c;
  const t = c.target;
  vfx.shot('side', c.side, 350);
  // the user's mind reaches out
  c.attacker.setOutline(1.6, Y.pink);
  const head = headOf(c, 'user');
  for (let i = 0; i < 3; i++) stage.wait(i * 110).then(() => vfx.prim.shockwave(head, { color: i % 2 ? Y.violet : Y.pink, radius: 1.4, ms: 320, thickness: 0.2, intensity: 1.6 }));
  vfx.particle({ tex: 'glow', pos: head, life: 0.35, size: [0.3, 1.4], color: Y.pink, intensity: 1.4, alpha: [0.3, 1] });
  await vfx.wait(330);
  pulledShot(c, 'foe', 1.75, 0.7, 400);
  stage.setTint(0xff90e0, 0.35, 300);
  stage.chromaPulse(0.012, 400);
  c.attacker.setOutline(0);
  const to = c.aim(0.5);
  if (c.missed) {
    for (let i = 0; i < 3; i++) stage.wait(i * 120).then(() => vfx.prim.shockwave(to, { color: Y.pink, radius: 2, ms: 400, thickness: 0.15, intensity: 1.4 }));
    await vfx.wait(700);
    stage.setTint(0xffffff, 0, 300);
    vfx.shot('wide', c.side, 500);
    return;
  }
  // the target is seized, lifted and wrung in a warping field
  const u = t.uniforms;
  const sil = u.silColor.value as THREE.Color;
  const prevSil = sil.clone();
  sil.set(Y.pink);
  let lastRing = -1;
  await during(c, 900, (k, _dt, el) => {
    const lift = ease.outCubic(Math.min(1, k * 2.5)) * 0.7;
    t.body.position.set(Math.sin(el * 0.06) * 0.12 * k, lift + Math.sin(el * 0.013) * 0.05, 0);
    u.silhouette.value = 0.25 + 0.2 * Math.sin(el * 0.03);
    const center = t.at(0.5);
    if (el - lastRing > 130) {
      lastRing = el;
      const col = Math.floor(el / 130) % 2 ? Y.violet : Y.pink;
      vfx.prim.shockwave(center, { color: col, radius: 2.4, startRadius: 0.4, ms: 420, thickness: 0.14, intensity: 1.3 });
      stage.shockwave(center, 0.35, 200);
    }
    if (Math.random() < 0.5) vfx.particle({ tex: 'ring', pos: center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 0)), life: 0.35, size: [0.2, 1.1], color: Math.random() < 0.5 ? Y.pink : Y.lav, intensity: 1.4, alpha: [0.9, 0] });
    if (Math.random() < 0.4) vfx.particle({ tex: 'spark', pos: center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4, (Math.random() - 0.5))), vel: new THREE.Vector3(), attract: { to: center, strength: 18 }, life: 0.35, size: [0.18, 0.05], color: Y.pale, intensity: 1.6 });
  });
  // slam
  const y0 = t.body.position.y;
  await c.stage.tween(110, (k) => t.body.position.set(0, y0 * (1 - k), 0), ease.inQuad);
  t.body.position.set(0, 0, 0);
  u.silhouette.value = 0;
  sil.copy(prevSil);
  c.impact(0);
  softHit(c, to, c.pal, 1.3);
  stage.flash(Y.pink, 0.15, 220);
  stage.chromaPulse(0.02, 400);
  stage.shockwave(to, 0.8, 350);
  vfx.shake(0.35, 400);
  vfx.dust(c.foeFeet, 0xe8d8f0, 14);
  vfx.prim.shockwave(c.foeFeet.clone().setY(c.foeFeet.y + 0.05), { color: Y.pink, radius: 3.2, facing: 'ground', ms: 550, intensity: 1.6 });
  await vfx.wait(350);
  stage.setTint(0xffffff, 0, 350);
  await vfx.wait(200);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- REFLECT

registerMoveFx('REFLECT', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  vfx.shot('attacker', c.side, 400);
  const w = Math.max(2.4, sp.width * 1.3);
  const h = Math.max(2.4, sp.height * 1.15);
  const pos = c.userFeet.clone().addScaledVector(c.dir, 1.1).setY(c.userFeet.y + h * 0.5);
  sp.setOutline(1.2, Y.pink);
  vfx.burst(pos, { count: 20, tex: 'spark', color: [0xffffff, 0xffb0e0], speed: 0.2, jitter: 1.5, attract: { to: pos, strength: 20 }, life: 0.3, size: [0.12, 0.2], intensity: 1.6 });
  await vfx.wait(250);
  const panel = vfx.prim.hexPanel(pos, c.dir, { color: 0xffa0e0, width: w, height: h, ms: 1300, intensity: 1.3, cells: 6 });
  vfx.prim.shockwave(pos, { color: 0xffc0f0, radius: w * 0.8, ms: 400, facing: c.dir, thickness: 0.2, intensity: 1.4 });
  const sv = sideOf(c.dir);
  const glints = during(c, 1000, () => {
    if (Math.random() < 0.35) {
      const p = pos.clone().addScaledVector(sv, (Math.random() - 0.5) * w * 0.9).add(new THREE.Vector3(0, (Math.random() - 0.5) * h * 0.9, 0));
      vfx.particle({ tex: 'star', pos: p, life: 0.3, size: [0.45, 0.05], color: 0xffffff, intensity: 1.8, rot: 0 });
    }
  });
  await vfx.wait(300);
  sp.setOutline(0);
  await Promise.all([panel.done, glints]);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- CALM MIND

registerMoveFx('CALM_MIND', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('attacker', c.side, 400);
  stage.setSaturation(0.75, 350);
  const R = Math.max(0.9, sp.width * 0.6);
  for (let i = 0; i < 4; i++) {
    stage.wait(i * 200).then(() => vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.2 + i * sp.height * 0.25), { color: i % 2 ? Y.lav : 0xffb0e8, radius: R * 1.5, startRadius: R * 0.6, facing: 'ground', ms: 900, thickness: 0.24, intensity: 1.8 }));
  }
  const head = headOf(c, 'user');
  await during(c, 1100, (k, _dt, el) => {
    sp.setOutline(0.8 + 0.6 * Math.sin(el * 0.008), Y.lav);
    if (Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2;
      vfx.particle({ tex: 'dot', pos: c.userFeet.clone().add(new THREE.Vector3(Math.cos(a) * R, 0.2, Math.sin(a) * R)), vel: new THREE.Vector3(0, 0.9, 0), swirl: { center: c.userFeet, speed: 0.8 }, life: 1.2, size: [0.12, 0.03], color: [0xffffff, Y.lav], intensity: 1.5, fadeIn: 0.3 });
    }
    vfx.particle({ tex: 'glow', pos: head, life: 0.07, size: 0.9 + 0.3 * Math.sin(el * 0.01), color: Y.lav, intensity: 0.8, alpha: [0.5 * (1 - k * 0.5), 0] });
  });
  sp.flash(Y.pale, 350, 0.4);
  sp.setOutline(0);
  stage.setSaturation(1.08, 350);
  await vfx.wait(250);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- REST

registerMoveFx('REST', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('attacker', c.side, 400);
  const light = sp.uniforms.light.value as THREE.Color;
  const l0 = light.clone();
  const dim = new THREE.Color(0x7080b0);
  await stage.tween(300, (k) => light.copy(l0).lerp(dim, k));
  // Z's drift up while healing light gathers
  const head = sp.at(0.85).addScaledVector(sideOf(c.dir), 0.2);
  let lastZ = -1000;
  const zs = during(c, 1100, (_k, _dt, el) => {
    if (el - lastZ > 230) {
      lastZ = el;
      const s = 0.5 + Math.random() * 0.2;
      vfx.particle({ tex: 'zzz', pos: head.clone(), vel: new THREE.Vector3(0.5 + Math.random() * 0.3, 1.1, 0), life: 1.1, size: [s, s * 2], color: [0xffffff, 0xa0c0ff], intensity: 1.3, alpha: [1, 0], fadeIn: 0.15, rot: (Math.random() - 0.5) * 0.4 });
    }
  });
  await vfx.wait(350);
  const heal = healSparkles(c, 'user', 0x9affc8, 800);
  sp.setOutline(1.2, 0x9affc8);
  await Promise.all([zs, heal]);
  sp.setOutline(0);
  await stage.tween(250, (k) => light.copy(dim).lerp(l0, k));
  light.copy(l0);
  await vfx.wait(150);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- HYPNOSIS

registerMoveFx('HYPNOSIS', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 400);
  const from = headOf(c, 'user').addScaledVector(c.dir, 0.3);
  const to = c.missed ? c.aim(0.8) : headOf(c, 'foe');
  c.attacker.setOutline(1.3, Y.violet);
  stage.setTint(0xc0a0ff, 0.25, 300);
  const cols = [Y.pink, Y.violet, Y.blue];
  const travel = 0.7;
  let last = -1000;
  let n = 0;
  // hypnotic concentric rings roll across to the target
  await during(c, 800, (_k, _dt, el) => {
    vfx.particle({ tex: 'glow', pos: from, life: 0.07, size: 0.6 + 0.3 * Math.sin(el * 0.03), color: Y.violet, intensity: 1.2, alpha: [0.7, 0] });
    if (el - last > 75) {
      last = el;
      n++;
      vfx.particle({ tex: 'ring', pos: from.clone(), vel: to.clone().sub(from).divideScalar(travel), life: travel, size: [0.3, 1.5 + 0.4 * Math.sin(n)], color: cols[n % 3], intensity: 1.4, alpha: [0.95, 0.4] });
    }
  });
  c.attacker.setOutline(0);
  await vfx.wait(travel * 1000 - 150);
  if (!c.missed) {
    c.impact(0);
    c.target.flash(Y.lav, 500, 0.4);
    const t = c.target;
    let lr = -1000;
    await during(c, 750, (k, _dt, el) => {
      t.body.position.x = Math.sin(el * 0.012) * 0.18 * (1 - k * 0.5);
      if (el - lr > 110 && k < 0.8) {
        lr = el;
        vfx.particle({ tex: 'ring', pos: to.clone(), life: 0.4, size: [2.2, 0.2], color: cols[Math.floor(el / 110) % 3], intensity: 1.4, alpha: [0.2, 1] });
      }
      if (Math.random() < 0.3) vfx.particle({ tex: 'star', pos: to.clone().add(new THREE.Vector3(Math.cos(el * 0.01) * 0.6, 0.3, Math.sin(el * 0.01) * 0.6)), life: 0.3, size: [0.2, 0.05], color: Y.pale, intensity: 1.6 });
    });
    t.body.position.x = 0;
  } else {
    await vfx.wait(300);
  }
  stage.setTint(0xffffff, 0, 300);
  await vfx.wait(150);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- DREAM EATER

registerMoveFx('DREAM_EATER', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 400);
  stage.setTint(0x7050b0, 0.45, 400);
  const t = c.target;
  const orbAt = c.missed ? c.aim(0.9) : headOf(c, 'foe').add(new THREE.Vector3(0, 0.6, 0));
  // dream energy seeps out of the target
  if (!c.missed) t.setOutline(1.3, Y.pink);
  const orb = vfx.prim.orb({ color: Y.pink, core: Y.pale, radius: 0.38, intensity: 1.3 });
  orb.mesh.position.copy(orbAt);
  const grow = orb.grow(500, 1);
  const seep = during(c, 520, () => {
    for (let i = 0; i < 2; i++) {
      const p = c.missed ? orbAt.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, -1, 0)) : t.at(0.2 + Math.random() * 0.6).add(new THREE.Vector3((Math.random() - 0.5) * t.width * 0.7, 0, 0));
      vfx.particle({ tex: 'wisp', pos: p, vel: new THREE.Vector3(0, 1, 0), attract: { to: orbAt, strength: 14 }, drag: 1.5, life: 0.45, size: [0.5, 0.2], color: [Y.pink, Y.violet], intensity: 1.1, alpha: [0.9, 0], rot: 0 });
    }
  });
  await Promise.all([grow, seep]);
  if (c.missed) {
    orb.dispose();
    vfx.burst(orbAt, { count: 14, tex: 'spark', color: [Y.pale, Y.pink], speed: [1, 3], size: [0.1, 0.2], life: 0.4 });
    stage.setTint(0xffffff, 0, 300);
    await vfx.wait(400);
    vfx.shot('wide', c.side, 500);
    return;
  }
  c.impact(0);
  t.flash(Y.pink, 400, 0.7);
  t.shake(0.12, 0.4);
  stage.chromaPulse(0.015, 300);
  vfx.prim.shockwave(orbAt, { color: Y.pink, radius: 1.6, ms: 350, intensity: 1.6 });
  t.setOutline(0);
  // the dream is devoured: orb pulled into the user, trailed by wisps
  const dest = c.attacker.at(0.6);
  const trail = vfx.trail(() => orb.mesh.position, 620, { tex: 'wisp', color: [Y.pink, Y.violet], size: [0.45, 0.7], endSize: 0.1, speed: 0.4, life: [0.3, 0.45], rate: 60, intensity: 1.1 });
  const sip = motes({
    ctx: c,
    count: 8,
    spreadMs: 250,
    travelMs: 600,
    from: orbAt,
    to: dest,
    jitter: 0.5,
    arc: 1.1,
    up: 0.8,
    wiggle: 0.2,
    step: 0.14,
    emit: (p) => vfx.particle({ tex: 'glow', pos: p, life: 0.2, size: [0.25, 0.04], color: Y.pink, intensity: 1.1, alpha: [0.8, 0] }),
  });
  await orb.fly(orbAt, dest, 620, 1.0, ease.inOutQuad);
  orb.dispose();
  void trail;
  c.attacker.flash(Y.pink, 400, 0.6);
  vfx.prim.shockwave(dest, { color: Y.pink, radius: 2, ms: 400, intensity: 1.6 });
  vfx.burst(dest, { count: 20, tex: 'spark', color: [Y.pale, Y.pink], speed: [2, 5], size: [0.1, 0.22], life: 0.4, intensity: 1.5 });
  await Promise.all([sip, healSparkles(c, 'user', Y.pink, 600)]);
  stage.setTint(0xffffff, 0, 350);
  vfx.shot('wide', c.side, 500);
});
