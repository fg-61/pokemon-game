import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { during, healSparkles, motes, powderCloud, powderFall, pulledShot, screenAngle, sideOf, up, softHit } from './common';

const G = { light: 0xd0ff90, main: 0x5ad040, leaf: 0x48b830, deep: 0x2a8a20, dark: 0x1a4a14, bark: 0x8a6a34, barkDark: 0x2a1a0a, gold: 0xffe070, sun: 0xfff2b0 };

/** Siphon of green energy motes from the target back to the user, ending in heal sparkles. */
async function drain(c: MoveFxContext, o: { count: number; spreadMs: number; travelMs: number; color: number; core: number; tex?: 'glow' | 'spark' | 'wisp' }) {
  const { vfx } = c;
  let healed = false;
  await motes({
    ctx: c,
    count: o.count,
    spreadMs: o.spreadMs,
    travelMs: o.travelMs,
    from: () => c.target.at(0.5),
    to: () => c.attacker.at(0.5),
    jitter: 0.6,
    arc: 1.2,
    up: 1.0,
    wiggle: 0.25,
    step: 0.12,
    e: ease.inOutQuad,
    emit: (p, _d, _k, i, head) => {
      vfx.particle({ tex: o.tex ?? 'glow', pos: p, life: 0.22, size: [0.3, 0.05], color: [o.color, o.color], intensity: 1.0, alpha: [0.8, 0] });
      if (head) vfx.particle({ tex: 'spark', pos: p, life: 0.06, size: 0.4, color: o.core, intensity: 1.2, alpha: [1, 0], rot: i });
    },
    onArrive: (p) => {
      vfx.burst(p, { count: 3, tex: 'spark', color: [o.core, o.color], speed: [1, 2], size: [0.1, 0.18], life: 0.25, intensity: 1.5 });
      if (!healed) {
        healed = true;
        void healSparkles(c, 'user', o.color, 700);
      }
    },
  });
}

// --------------------------------------------------------------------------------------- RAZOR LEAF

registerMoveFx('RAZOR_LEAF', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 400);
  c.attacker.setOutline(1.3, G.main);
  // leaves whirl up around the user
  const whirl = vfx.spiral(c.userFeet, { tex: 'leaf', color: [G.light, G.leaf], ms: 380, rate: 60, radius: Math.max(0.8, c.attacker.width * 0.5), rise: 3, size: [0.3, 0.4], intensity: 1.05, additive: false });
  await whirl;
  c.attacker.setOutline(0);
  const to = c.aim(0.5);
  let arrivals = 0;
  const n = 16;
  const rotSpeed = Array.from({ length: n }, () => (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 10));
  const dests = Array.from({ length: n }, () => to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.7, 0)));
  await motes({
    ctx: c,
    count: n,
    spreadMs: 380,
    travelMs: 360,
    from: c.user.clone().add(new THREE.Vector3(0, 0.3, 0)),
    to: (i) => dests[i],
    jitter: 0.9,
    arc: 1.3,
    up: 0.7,
    wiggle: 0.1,
    step: 0.22,
    emit: (p, _d, _k, i, head) => {
      if (head) {
        const t = c.stage.clock.time;
        vfx.particle({ tex: 'leaf', pos: p, life: 0.045, size: 0.58, color: G.main, intensity: 1.1, additive: false, alpha: [1, 1], rot: t * rotSpeed[i] });
      }
      vfx.particle({ tex: 'glow', pos: p, life: 0.14, size: [0.22, 0.02], color: G.light, intensity: 0.9, alpha: [0.6, 0] });
    },
    onArrive: (p, i) => {
      arrivals++;
      if (c.missed) {
        vfx.particle({ tex: 'leaf', pos: p, vel: c.dir.clone().multiplyScalar(4), acc: new THREE.Vector3(0, -3, 0), life: 0.5, size: 0.4, color: G.main, additive: false, spin: 12, alpha: [1, 0] });
        return;
      }
      vfx.prim.slash(p, { color: G.main, core: G.light, size: 0.55 + Math.random() * 0.3, angle: Math.random() * Math.PI * 2, ms: 220, intensity: 1.1 });
      vfx.burst(p, { count: 3, tex: 'leaf', color: [G.light, G.leaf], speed: [1.5, 3], size: [0.14, 0.22], life: 0.5, spin: 10, gravity: 4, additive: false, intensity: 1.1 });
      if (arrivals === 5) {
        c.impact(0);
        c.target.flash(G.light, 150, 0.5);
        vfx.shake(0.18, 300);
        const center = c.aim(0.5);
        vfx.prim.slash(center, { color: G.main, core: G.light, size: 1.5, angle: 0.7, ms: 300, intensity: 1.3 });
        c.stage.wait(60).then(() => vfx.prim.slash(center, { color: G.main, core: G.light, size: 1.5, angle: -0.7 + Math.PI, ms: 300, intensity: 1.3 }));
        vfx.burst(center, { count: 14, tex: 'spark', color: [0xffffff, G.light], speed: [4, 8], size: [0.1, 0.2], life: 0.3 });
      }
      void i;
    },
  });
  await vfx.wait(300);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- LEECH SEED

registerMoveFx('LEECH_SEED', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 400);
  const from = c.attacker.at(0.8);
  const tFeet = c.missed ? c.aim(0).setY(c.foeFeet.y) : c.foeFeet.clone();
  const sideV = sideOf(c.dir);
  const R = Math.min(0.9, Math.max(0.5, c.target.width * 0.42));
  const spots = [0, 1, 2].map((i) => {
    const a = (i / 3) * Math.PI * 2 + 0.6;
    return tFeet.clone().addScaledVector(sideV, Math.cos(a) * R).addScaledVector(c.dir, Math.sin(a) * R).setY(tFeet.y + 0.08);
  });
  // seeds arc high and plant themselves around the target
  const flights = spots.map(async (spot, i) => {
    await vfx.wait(i * 110);
    const seed = vfx.prim.orb({ color: 0x9a8a30, core: G.light, radius: 0.13, intensity: 1.2 });
    const trail = vfx.trail(() => seed.mesh.position, 540, { tex: 'glow', color: [G.light, G.main], size: [0.18, 0.28], endSize: 0.02, speed: 0.2, life: 0.25, rate: 50, intensity: 1 });
    await seed.fly(from, spot, 540, 2.6, ease.inOutQuad);
    seed.dispose();
    void trail;
    vfx.dust(spot, 0xb0c080, 6);
    vfx.burst(spot, { count: 6, tex: 'leaf', color: [G.light, G.leaf], speed: [1, 2.5], dir: up, spread: 0.8, size: [0.14, 0.2], gravity: 5, spin: 8, additive: false, intensity: 1.1, life: 0.5 });
  });
  await Promise.all(flights);
  if (c.missed) {
    await vfx.wait(350);
    vfx.shot('wide', c.side, 500);
    return;
  }
  // sprouting vines coil up around the target
  const center = c.target.at(0);
  const H = c.target.height * 0.8;
  const vines = spots.map((spot, i) => {
    const pts: THREE.Vector3[] = [];
    const a0 = Math.atan2(spot.z - center.z, spot.x - center.x);
    const turns = 1.1;
    for (let j = 0; j <= 10; j++) {
      const t = j / 10;
      const a = a0 + t * turns * Math.PI * 2 * (i % 2 ? -1 : 1);
      const r = R * (1 - t * 0.35);
      pts.push(new THREE.Vector3(center.x + Math.cos(a) * r, spot.y - 0.1 + t * H * (0.75 + i * 0.12), center.z + Math.sin(a) * r));
    }
    return vfx.prim.tendril(pts, { color: G.main, dark: G.dark, tip: G.light, radius: 0.1, growMs: 480, holdMs: 700, fadeMs: 280, retract: true, twist: 2 });
  });
  await vines[0].grown;
  c.impact(0);
  c.target.flash(G.main, 300, 0.6);
  c.target.shake(0.1, 0.4);
  for (const v of vines) vfx.burst(v.curve.getPointAt(1), { count: 6, tex: 'leaf', color: [G.light, G.leaf], speed: [1, 2], size: [0.14, 0.2], spin: 8, additive: false, intensity: 1.1, life: 0.5, gravity: 3 });
  // a first sip of life energy flows back to the user
  await drain(c, { count: 7, spreadMs: 350, travelMs: 520, color: G.main, core: G.light });
  await Promise.all(vines.map((v) => v.done));
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- SLEEP POWDER

registerMoveFx('SLEEP_POWDER', async (c) => {
  const { vfx } = c;
  const col = { a: 0xa0f0e0, b: 0x58a8d8, spark: 0x80e8ff };
  vfx.shot('side', c.side, 400);
  c.attacker.shake(0.1, 0.4);
  vfx.burst(c.attacker.at(0.9), { count: 10, tex: 'smoke', color: [col.a, col.b], speed: [0.5, 1.5], size: [0.4, 0.8], endSize: 1.4, life: 0.6, additive: false, alpha: [0.5, 0], intensity: 1 });
  await vfx.wait(200);
  await powderCloud(c, col, 750);
  const fall = powderFall(c, col, 800);
  await vfx.wait(350);
  if (!c.missed) {
    c.impact(0);
    c.target.flash(0x80b0ff, 600, 0.45);
  }
  await fall;
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- GIGA DRAIN

registerMoveFx('GIGA_DRAIN', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 400);
  const to = c.aim(0.5);
  // latch on: a green net of light closes around the target
  c.attacker.setOutline(1.4, G.main);
  vfx.burst(to, { count: 30, tex: 'spark', color: [G.light, G.main], speed: 0.2, jitter: 2, attract: { to, strength: 25 }, life: 0.35, size: [0.12, 0.22], intensity: 1.5 });
  await vfx.wait(320);
  if (c.missed) {
    vfx.burst(to, { count: 12, tex: 'glow', color: [G.light, G.main], speed: [1, 2], size: [0.2, 0.3], life: 0.4 });
    c.attacker.setOutline(0);
    await vfx.wait(400);
    vfx.shot('wide', c.side, 500);
    return;
  }
  c.target.setOutline(1.6, G.main);
  vfx.prim.shockwave(to, { color: G.main, radius: 1.8, ms: 350, intensity: 1.6 });
  softHit(c, to, c.pal, 0.8);
  c.impact(0);
  c.target.flash(G.main, 400, 0.6);
  // siphon
  const pull = during(c, 800, () => {
    if (Math.random() < 0.7) {
      const p = c.target.at(0.2 + Math.random() * 0.7).add(new THREE.Vector3((Math.random() - 0.5) * c.target.width * 0.7, 0, (Math.random() - 0.5) * 0.4));
      vfx.particle({ tex: 'spark', pos: p, vel: new THREE.Vector3(0, 0.3, 0), attract: { to, strength: 10 }, life: 0.3, size: [0.16, 0.02], color: [G.light, G.main], intensity: 1.5 });
    }
  });
  await drain(c, { count: 18, spreadMs: 600, travelMs: 600, color: G.main, core: G.light });
  await pull;
  c.target.setOutline(0);
  c.attacker.setOutline(0);
  await vfx.wait(350);
  vfx.shot('wide', c.side, 500);
});

// --------------------------------------------------------------------------------------- FRENZY PLANT

registerMoveFx('FRENZY_PLANT', async (c) => {
  const { vfx, stage } = c;
  // 1) the user draws power from the earth
  vfx.shot('attacker', c.side, 450);
  c.attacker.setOutline(1.8, G.main);
  stage.setTint(0xa0d890, 0.25, 400);
  const charge = vfx.spiral(c.userFeet, { tex: 'leaf', color: [G.light, G.leaf], ms: 700, rate: 70, radius: Math.max(0.9, c.attacker.width * 0.55), rise: 2.2, down: true, size: [0.28, 0.4], intensity: 1.05, additive: false });
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: G.main, radius: 2.6, facing: 'ground', ms: 700, intensity: 1.6 });
  stage.wait(300).then(() => vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: G.light, radius: 2, facing: 'ground', ms: 500, intensity: 1.6 }));
  vfx.shake(0.12, 700);
  await charge;
  c.attacker.setOutline(0);
  // 2) something burrows toward the target
  vfx.shot('side', c.side, 400);
  const tFeet = (c.missed ? c.aim(0) : c.foeFeet.clone()).setY(c.foeFeet.y);
  const ground = Math.min(c.userFeet.y, c.foeFeet.y) - 0.3;
  const a0 = c.userFeet.clone().setY(ground + 0.1).addScaledVector(c.dir, 1.2);
  const a1 = tFeet.clone().setY(ground + 0.1).addScaledVector(c.dir, -1.3);
  let lastPop = -1;
  await during(c, 480, (k) => {
    const p = a0.clone().lerp(a1, ease.inQuad(k));
    if (k - lastPop > 0.08) {
      lastPop = k;
      vfx.dust(p, 0x8a7050, 5);
      vfx.burst(p, { count: 3, tex: 'rock', color: 0x6a5a40, speed: [2, 4], dir: up, spread: 0.6, gravity: 12, size: [0.12, 0.2], additive: false, life: 0.5, intensity: 1, spin: 8 });
    }
  });
  pulledShot(c, 'foe', 1.9, 1.0, 300);
  vfx.shake(0.35, 400);
  // 3) giant roots erupt
  const center = tFeet.clone();
  const H = Math.max(2.4, c.target.height * 1.15);
  const roots: ReturnType<typeof vfx.prim.tendril>[] = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const r = 1.4 + Math.random() * 0.5;
    const base = center.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)).setY(ground - 0.4);
    const h = H * (0.8 + Math.random() * 0.5);
    const pts = [
      base,
      base.clone().setY(ground + h * 0.45),
      base.clone().lerp(center, 0.45).setY(ground + h * 0.95),
      base.clone().lerp(center, 0.85).setY(ground + h * 0.75 + Math.random() * 0.4),
    ];
    roots.push(vfx.prim.tendril(pts, { color: G.bark, dark: G.barkDark, tip: G.main, radius: 0.42 + Math.random() * 0.14, growMs: 320, holdMs: 750 - i * 40, fadeMs: 350, retract: true, twist: 1.5 }));
    vfx.dust(base.clone().setY(ground + 0.2), 0x9a8060, 8);
    vfx.prim.debris({ from: base.clone().setY(ground + 0.3), count: 4, color: 0x5a4a30, size: 0.16, speed: 2.5, up: 6, ms: 1000 });
    await vfx.wait(55);
  }
  // the biggest root slams down onto the target
  const sv = sideOf(c.dir);
  const back = center.clone().addScaledVector(sv, 2.0).addScaledVector(c.dir, 0.6).setY(ground - 0.4);
  const slam = vfx.prim.tendril([back, back.clone().setY(ground + H * 1.2), center.clone().addScaledVector(sv, 0.9).setY(ground + H * 1.7), center.clone().addScaledVector(c.dir, -0.2).setY(ground + H * 0.55)], { color: G.bark, dark: G.barkDark, tip: G.main, radius: 0.6, growMs: 300, holdMs: 520, fadeMs: 350, retract: true, twist: 1.2 });
  await slam.grown;
  stage.flash(G.light, 0.35, 250);
  stage.shockwave(center.clone().setY(ground + 1), 1.0, 400);
  vfx.shake(0.6, 700);
  if (!c.missed) {
    c.impact(0);
    c.target.flash(0xffffff, 200, 0.9);
  }
  softHit(c, c.aim(0.5), c.pal, 1.4);
  vfx.prim.shockwave(center.clone().setY(c.foeFeet.y + 0.05), { color: G.main, radius: 4.5, facing: 'ground', ms: 650, intensity: 1.6 });
  vfx.burst(center.clone().setY(ground + 1), { count: 40, tex: 'leaf', color: [G.light, G.leaf], speed: [3, 8], size: [0.2, 0.35], life: [0.6, 1.0], gravity: 5, spin: 10, additive: false, intensity: 1.1 });
  vfx.dust(center, 0x9a8060, 20);
  vfx.prim.debris({ from: center.clone().setY(ground + 0.4), count: 10, color: 0x5a4a30, size: 0.2, speed: 4, up: 7, ms: 1200 });
  await Promise.all([slam.done, ...roots.map((r) => r.done)]);
  stage.setTint(0xffffff, 0, 400);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(200);
});

// --------------------------------------------------------------------------------------- SOLAR BEAM

registerMoveFx('SOLAR_BEAM', async (c) => {
  const { vfx, stage } = c;
  const core = c.attacker.at(0.55);
  if (c.phase === 'charge') {
    // gather sunlight: shafts of light converge on the user
    vfx.shot('attacker', c.side, 450);
    stage.setTint(0xffe8a0, 0.18, 500);
    c.attacker.setOutline(1.2, G.gold);
    vfx.prim.pillar(c.userFeet.clone(), { color: 0xffb020, radius: Math.max(0.8, c.attacker.width * 0.5), height: 10, ms: 1500, intensity: 0.28 });
    await during(c, 1400, (k, dt) => {
      // rays of light streaming in from the sky and the sides
      const n = Math.round(45 * dt + Math.random());
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 2.5 + Math.random() * 2;
        const p = core.clone().add(new THREE.Vector3(Math.cos(a) * r, 1 + Math.random() * 4, Math.sin(a) * r));
        const v = core.clone().sub(p).multiplyScalar(1 / 0.5);
        vfx.particle({ tex: 'streak', pos: p, vel: v, life: 0.48, size: [1.4, 0.3], color: [G.sun, 0xffc020], intensity: 1.3, alpha: [0, 1], fadeIn: 0.3, rot: screenAngle(c, p, core) });
        if (Math.random() < 0.3) vfx.particle({ tex: 'star', pos: p, vel: v, life: 0.48, size: [0.1, 0.25], color: G.sun, intensity: 1.6, alpha: [0, 1] });
      }
      if (Math.random() < 0.5) vfx.particle({ tex: 'dot', pos: c.userFeet.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.2, (Math.random() - 0.5) * 2)), vel: new THREE.Vector3(0, 1.6, 0), life: 0.9, size: [0.1, 0.02], color: G.sun, intensity: 1.6 });
      vfx.particle({ tex: 'glow', pos: core.clone().addScaledVector(c.dir, 0.3), life: 0.07, size: 0.5 + k * 1.4, color: 0xffc020, intensity: 0.6 + k * 0.5, alpha: [0.5, 0] });
      c.attacker.setOutline(1.2 + Math.sin(k * 30) * 0.4, G.gold);
    });
    c.attacker.flash(G.sun, 400, 0.6);
    vfx.prim.shockwave(core, { color: G.gold, radius: 2.4, ms: 450, intensity: 1.4 });
    c.attacker.setOutline(0);
    stage.setTint(0xffffff, 0, 400);
    await vfx.wait(250);
    vfx.shot('wide', c.side, 500);
    return;
  }
  // strike
  vfx.shot('side', c.side, 350);
  const from = c.attacker.at(0.55).add(c.dir.clone().multiplyScalar(0.7));
  stage.setTint(0xfff0c0, 0.12, 250);
  c.attacker.setOutline(1.6, G.gold);
  vfx.burst(from, { count: 30, tex: 'spark', color: [G.sun, G.gold], speed: 0.2, jitter: 1.6, attract: { to: from, strength: 25 }, life: 0.3, size: [0.14, 0.26], intensity: 1.6 });
  vfx.particle({ tex: 'glow', pos: from, life: 0.32, size: [0.4, 1.6], color: 0xffc020, intensity: 1.0, alpha: [0.3, 1] });
  await vfx.wait(300);
  c.attacker.setOutline(0);
  const to = c.aim(0.5);
  const fwd = to.clone().sub(from).normalize();
  const hold = 650;
  const beam = vfx.prim.beam(from, to, { color: 0xff9a00, core: 0xffe070, width: 0.55, holdMs: hold, intensity: 0.62, noise: 0.35, wobble: 0.1, growMs: 170 });
  const sparkle = during(c, 170 + hold, (_k, dt) => {
    const n = Math.round(80 * dt + Math.random());
    for (let i = 0; i < n; i++) {
      const p = from.clone().lerp(to, Math.random());
      const sd = sideOf(fwd).multiplyScalar((Math.random() - 0.5) * 1.4).add(new THREE.Vector3(0, (Math.random() - 0.5) * 1.4, 0));
      vfx.particle({ tex: Math.random() < 0.3 ? 'star' : 'spark', pos: p.add(sd.multiplyScalar(0.5)), vel: fwd.clone().multiplyScalar(6).add(sd), life: 0.3, size: [0.16, 0.02], color: [0xffffff, G.gold], intensity: 1.6 });
    }
  });
  await beam.arrived;
  if (!c.missed) {
    c.impact(0);
    c.target.flash(0xffffff, 250, 0.9);
  }
  stage.flash(G.sun, 0.22, 220);
  stage.shockwave(to, 0.8, 400);
  vfx.shake(0.4, 600);
  softHit(c, to, { core: 0xffffff, main: G.gold }, 1.4);
  vfx.prim.blast(to, { core: 0xfff0a0, main: 0xffb020, dark: 0x8a5a10, radius: 1.3, ms: 800, rise: 0.3, intensity: 0.8 });
  const rays = during(c, hold, () => {
    if (Math.random() < 0.8) {
      const d = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 2).normalize();
      vfx.particle({ tex: 'spark', pos: to.clone(), vel: d.multiplyScalar(7), drag: 2, life: 0.35, size: [0.3, 0.05], color: [0xffffff, G.gold], intensity: 1.6 });
    }
    if (Math.random() < 0.25) c.target.shake(0.08, 0.15);
  });
  await Promise.all([beam.done, sparkle, rays]);
  stage.setTint(0xffffff, 0, 300);
  await vfx.wait(250);
  vfx.shot('wide', c.side, 500);
});
