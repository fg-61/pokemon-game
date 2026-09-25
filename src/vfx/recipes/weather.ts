import * as THREE from 'three';
import type { WeatherKind } from '../../battle/types';
import { TYPE_FX } from '../../data/typeColors';
import { ease } from '../../render/clock';
import { ENEMY_POS, PLAYER_POS } from '../../render/arena';
import type { Shot } from '../../render/stage';
import type { TexName } from '../textures';
import { registerMoveFx, type MoveFxContext, type Palette } from '../vfx';
import { currentWeather, StreakField } from '../weather';
import { camBasis, during, emitAlong, towardCam, up } from './common';

/**
 * Weather moves (Sunny Day, Rain Dance, Sandstorm, Hail) and Weather Ball. The weather moves end by handing
 * over to the ambient WeatherFx (the controller calls `WeatherFx.set(kind)` right after the animation).
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Middle of the field and the point high above it where the weather is "called" (sun, clouds). */
const MID = PLAYER_POS.clone().lerp(ENEMY_POS, 0.5).setY(0);
const SKY = MID.clone().setY(5.3);

/** Wide shot pulled back and tilted up so both Pokemon and the sky above the field are framed. */
function skyShot(): Shot {
  return { pos: V(-5.7, 3.3, 12.8), look: V(0.3, 1.95, -0.4), fov: 44 };
}

/** Screen-plane unit vector at `angle` (0 = screen right, PI/2 = screen up). */
function screenDir(c: MoveFxContext, angle: number) {
  const { right, up: u } = camBasis(c);
  return right.multiplyScalar(Math.cos(angle)).addScaledVector(u, Math.sin(angle));
}

/** Gap-free trail behind a fast mover: `emit` is called every `step` units along the path travelled each frame. */
function pathTrail(c: MoveFxContext, get: () => THREE.Vector3, ms: number, step: number, emit: (p: THREE.Vector3) => void) {
  let last: THREE.Vector3 | null = null;
  return during(c, ms, () => {
    const p = get().clone();
    if (last) emitAlong(last, p, step, emit);
    last = p;
  });
}

/** Fly a mesh along a quadratic curve from -> ctrl -> to. */
function curve(c: MoveFxContext, obj: THREE.Object3D, from: THREE.Vector3, ctrl: THREE.Vector3, to: THREE.Vector3, ms: number, e = ease.outCubic) {
  return c.vfx.tween(ms, (k) => {
    const a = from.clone().lerp(ctrl, k);
    const b = ctrl.clone().lerp(to, k);
    obj.position.copy(a.lerp(b, k));
  }, e);
}

/** Energy shooting from the user up into the sky (Rain Dance / Hail): rising streaks + an orb flying up. */
async function skyward(c: MoveFxContext, o: { core: number; main: number; ms?: number; intensity?: number }) {
  const { vfx } = c;
  const ms = o.ms ?? 380;
  const head = c.attacker.at(1.05);
  const upAngle = Math.PI / 2;
  void during(c, ms, () => {
    for (let i = 0; i < 2; i++) {
      const p = c.userFeet.clone().add(V(rnd(-0.5, 0.5), rnd(0, 1.2), rnd(-0.5, 0.5)));
      vfx.particle({ tex: 'streak', pos: p, vel: V(0, rnd(12, 18), 0), life: rnd(0.25, 0.4), size: [rnd(0.9, 1.5), 0.6], color: [o.core, o.main], intensity: o.intensity ?? 1.4, rot: upAngle, alpha: [0.9, 0] });
    }
  });
  const orb = vfx.prim.orb({ color: o.main, core: o.core, radius: 0.22, intensity: 1.5 });
  orb.mesh.position.copy(head);
  const trail = vfx.trail(() => orb.mesh.position, ms, { tex: 'glow', color: [o.core, o.main], size: [0.3, 0.45], speed: 0.3, life: [0.25, 0.4], rate: 70, intensity: 1.2 });
  await curve(c, orb.mesh, head, head.clone().add(V(0, 2.2, 0)), SKY, ms, ease.inQuad);
  orb.dispose();
  vfx.prim.shockwave(SKY, { color: o.main, radius: 2.4, ms: 450, thickness: 0.2, intensity: 1.3 });
  vfx.particle({ tex: 'glow', pos: SKY.clone(), life: 0.35, size: [1.2, 3.4], color: o.main, intensity: 1.2, alpha: [0.7, 0] });
  await trail;
}

/**
 * Clouds gathering above the field: normal-blended puffs drawn in from a wide ring and swirling into a mass.
 * Returns the emitter promise (runs `ms`).
 */
function gatherClouds(c: MoveFxContext, o: { colors: [number, number]; ms: number; rate: number; alpha: number; glints?: number; flicker?: number }) {
  const { vfx } = c;
  const { right, fwd } = camBasis(c);
  right.setY(0).normalize();
  fwd.setY(0).normalize();
  let acc = 0;
  return during(c, o.ms, (k, dt) => {
    acc += dt * o.rate;
    while (acc >= 1) {
      acc--;
      const a = Math.random() * Math.PI * 2;
      const r = rnd(4.5, 7.5) * (1 - k * 0.45);
      const p = SKY.clone().addScaledVector(right, Math.cos(a) * r * 1.3).addScaledVector(fwd, Math.sin(a) * r * 0.6).add(V(0, rnd(-0.4, 0.9), 0));
      const to = SKY.clone().addScaledVector(right, rnd(-5.5, 5.5)).addScaledVector(fwd, rnd(-1, 2)).add(V(0, rnd(-0.4, 0.5), 0));
      vfx.particle({
        tex: 'smoke',
        pos: p,
        vel: to.sub(p).multiplyScalar(0.9),
        drag: 0.9,
        swirl: { center: SKY, speed: 0.5 },
        life: rnd(1.3, 1.8),
        size: [rnd(2.4, 3.4), rnd(4, 5.5)],
        color: o.colors,
        intensity: 1,
        alpha: [o.alpha, o.alpha * 0.5],
        fadeIn: 0.3,
        spin: rnd(-0.5, 0.5),
        additive: false,
      });
    }
    if (o.glints && Math.random() < o.glints * dt) {
      vfx.particle({ tex: 'star', pos: SKY.clone().add(V(rnd(-3, 3), rnd(-0.4, 0.6), rnd(-1.5, 1.5))), life: 0.4, size: [0.5, 0.05], color: 0xeaffff, intensity: 1.6, alpha: [1, 0], fadeIn: 0.3, spin: 3 });
    }
    if (o.flicker && Math.random() < o.flicker * dt) {
      vfx.particle({ tex: 'glow', pos: SKY.clone().add(V(rnd(-2.5, 2.5), rnd(-0.2, 0.5), rnd(-1, 1))), life: 0.14, size: [2.5, 3.5], color: 0xa8c8ff, intensity: 1, alpha: [0.55, 0] });
    }
  });
}

/** Ground point (platform top if it lands on one) under a horizontal position. */
function landY(p: THREE.Vector3) {
  const on = (q: THREE.Vector3) => (p.x - q.x) ** 2 + (p.z - q.z) ** 2 < 1.95 * 1.95;
  return on(PLAYER_POS) || on(ENEMY_POS) ? 0.36 : 0.03;
}

// ------------------------------------------------------------------ Sunny Day

registerMoveFx('SUNNY_DAY', async (c) => {
  const { vfx, stage } = c;
  const gold = 0xffc040;
  const core = 0xfff4c8;
  const orange = 0xff8a20;
  stage.director.move(skyShot(), 0.7);
  // anticipation: the user glows gold, heat rises around it and gathers above its head
  c.attacker.setOutline(1.4, gold);
  c.attacker.flash(0xffd070, 500, 0.45);
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.06), { color: gold, radius: 1.9, facing: 'ground', ms: 650, intensity: 1.3 });
  void vfx.spiral(c.userFeet, { color: [core, gold], tex: 'spark', ms: 650, radius: Math.max(0.6, c.attacker.width * 0.45), rise: 3.2, size: [0.12, 0.24], rate: 60, intensity: 1.5 });
  const head = c.attacker.at(1.1);
  vfx.burst(head, { count: 26, tex: 'glow', color: [core, gold], speed: 0.1, jitter: 1.5, attract: { to: head, strength: 22 }, life: [0.35, 0.5], size: [0.12, 0.22], intensity: 1.5 });
  await vfx.wait(380);

  // a small sun launches from the user and climbs into the sky
  const orb = vfx.prim.orb({ color: orange, core, radius: 0.3, intensity: 1.2 });
  orb.mesh.position.copy(head);
  void orb.grow(180, 1);
  const trail = pathTrail(c, () => orb.mesh.position, 560, 0.07, (p) => {
    vfx.particle({ tex: 'flame', pos: p.clone().add(V(rnd(-0.06, 0.06), rnd(-0.06, 0.06), rnd(-0.06, 0.06))), vel: V(rnd(-0.3, 0.3), rnd(-0.2, 0.4), rnd(-0.3, 0.3)), life: rnd(0.25, 0.4), size: [rnd(0.45, 0.6), 0.15], color: [0xffd070, orange], intensity: 1.1, spin: rnd(-3, 3), additive: false });
  });
  const sparks = vfx.trail(() => orb.mesh.position, 560, { tex: 'spark', color: [core, gold], size: [0.1, 0.2], speed: 1.2, life: [0.2, 0.35], rate: 40, intensity: 1.4 });
  await curve(c, orb.mesh, head, head.clone().add(V(0, 3.2, 0)), SKY, 560, ease.inOutQuad);

  // FLARE: the sun ignites
  stage.flash(0xffdc90, 0.1, 380);
  vfx.shake(0.1, 300);
  vfx.prim.shockwave(SKY, { color: gold, radius: 2.9, ms: 620, thickness: 0.1, intensity: 1.1 });
  vfx.prim.shockwave(SKY, { color: core, radius: 1.6, ms: 400, thickness: 0.18, intensity: 1 });
  vfx.particle({ tex: 'star', pos: SKY.clone(), life: 0.9, size: [1.3, 2.1], color: [core, gold], intensity: 1, spin: 0.7, alpha: [0.75, 0] });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + rnd(-0.08, 0.08);
    const d = screenDir(c, a);
    vfx.particle({ tex: 'streak', pos: SKY.clone().addScaledVector(d, rnd(0.7, 1)), vel: d.clone().multiplyScalar(rnd(4, 6.5)), drag: 1.5, life: rnd(0.45, 0.6), size: [rnd(1.8, 2.6), 1], color: [core, gold], intensity: 1.15, rot: a, alpha: [0.85, 0] });
  }
  vfx.burst(SKY, { count: 36, tex: 'spark', color: [core, gold], speed: [3, 7], size: [0.14, 0.28], life: [0.4, 0.8], drag: 2, intensity: 1.5 });
  void vfx.tween(300, (k) => orb.mesh.scale.setScalar(1 + 0.9 * k), ease.outBack);
  // corona while it blazes + golden light drifting down onto the field
  const corona = during(c, 1000, (k) => {
    const pulse = 1 + Math.sin(k * 30) * 0.06;
    vfx.particle({ tex: 'glow', pos: SKY.clone(), life: 0.07, size: (1.5 + k * 0.3) * pulse, color: gold, intensity: 0.9, alpha: [0.45 * (1 - k * 0.6), 0.35 * (1 - k)] });
  });
  const motes = vfx.rain(MID.clone(), { tex: 'spark', color: [core, gold], ms: 700, rate: 70, height: 4.6, radius: 5.5, fall: 5, size: [0.12, 0.22], intensity: 1.4 });
  await vfx.wait(520);

  // the sun recedes upward into the sky (the ambient harsh sunlight takes over)
  vfx.shot('wide', c.side, 650);
  await vfx.tween(460, (k) => {
    orb.mesh.scale.setScalar(1.9 * (1 - k) + 0.01);
    orb.mesh.position.y = SKY.y + k * 1.2;
  }, ease.inQuad);
  orb.dispose();
  c.attacker.setOutline(0);
  await Promise.all([trail, sparks, corona, motes]);
});

// ------------------------------------------------------------------ Rain Dance

registerMoveFx('RAIN_DANCE', async (c) => {
  const { vfx, stage } = c;
  const light = 0xbfe4ff;
  const blue = 0x3a9aff;
  stage.director.move(skyShot(), 0.7);
  // anticipation: water energy spirals up the user
  c.attacker.setOutline(1.4, blue);
  c.attacker.flash(0x80c0ff, 450, 0.4);
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.06), { color: blue, radius: 1.8, facing: 'ground', ms: 600, intensity: 1.3 });
  void vfx.spiral(c.userFeet, { color: [light, blue], tex: 'drop', ms: 600, radius: Math.max(0.6, c.attacker.width * 0.45), rise: 3.2, size: [0.14, 0.24], rate: 55, intensity: 1.3 });
  void stage.setTint(0x7080a0, 0.3, 900);
  await vfx.wait(260);

  // energy shoots into the sky; dark clouds gather over the field
  const clouds = gatherClouds(c, { colors: [0x5a6478, 0x2c3444], ms: 1150, rate: 64, alpha: 0.88, flicker: 3 });
  await skyward(c, { core: light, main: blue, ms: 360 });
  await vfx.wait(420);

  // the first drops fall, splashing on the field and the platforms
  const drops = vfx.rain(MID.clone(), { tex: 'drop', color: 0xd0e8ff, ms: 800, rate: 170, height: 4.8, radius: 6.5, fall: 13, size: [0.16, 0.26], intensity: 1.05, additive: false });
  const streaks = during(c, 800, () => {
    for (let i = 0; i < 6; i++) {
      const p = MID.clone().add(V(rnd(-6.5, 6.5), rnd(1.2, 4.8), rnd(-5, 5)));
      vfx.particle({ tex: 'streak', pos: p, vel: V(1.2, -15, 0.6), life: 0.3, size: 1.1, color: 0xb0c8e8, intensity: 0.75, rot: -Math.PI / 2 + 0.08, alpha: [0.7, 0.5] });
    }
  });
  let n = 0;
  const ripples = during(c, 800, (_k, _dt, el) => {
    while (n < el / 70) {
      n++;
      const p = MID.clone().add(V(rnd(-5.5, 5.5), 0, rnd(-4, 4)));
      p.y = landY(p);
      vfx.prim.shockwave(p, { color: light, radius: rnd(0.35, 0.6), facing: 'ground', ms: 420, thickness: 0.22, intensity: 0.9 });
      vfx.burst(p.clone().setY(p.y + 0.05), { count: 3, tex: 'dot', color: light, speed: [1.2, 2.2], dir: up, spread: 0.7, gravity: 12, life: 0.3, size: 0.06, intensity: 1 });
    }
  });
  await vfx.wait(420);
  vfx.shot('wide', c.side, 700);
  c.attacker.setOutline(0);
  void stage.setTint(0x7080a0, 0, 900);
  await Promise.all([clouds, drops, streaks, ripples]);
});

// ------------------------------------------------------------------ Sandstorm

registerMoveFx('SANDSTORM', async (c) => {
  const { vfx, stage } = c;
  const light = 0xecd8a8;
  const sand = 0xc8a472;
  const dark = 0x86684a;
  const wind = V(0.9, 0, 0.42).normalize();
  const lines = new StreakField(stage, 220, false);
  const lineColor = new THREE.Color(0xf2e2b8);
  stage.director.move(skyShot(), 0.7);
  // anticipation: sand is drawn in and starts circling the user's feet
  c.attacker.setOutline(1.4, sand);
  vfx.dust(c.userFeet, sand, 18);
  const feet = c.userFeet.clone();
  void during(c, 500, (_k, dt) => {
    for (let i = 0; i < Math.ceil(dt * 90); i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rnd(1.6, 2.6);
      const p = feet.clone().add(V(Math.cos(a) * r, rnd(0.1, 0.6), Math.sin(a) * r));
      vfx.particle({ tex: 'dot', pos: p, vel: feet.clone().sub(p).multiplyScalar(1.4).setY(rnd(0.5, 1.5)), swirl: { center: feet, speed: 4 }, life: 0.5, size: 0.07, color: Math.random() < 0.5 ? light : dark, intensity: 1, alpha: [1, 0.6], additive: false });
    }
  });
  await vfx.wait(280);

  // a sand vortex spins up from the user
  const vx = vfx.prim.vortex(feet.clone(), { color: light, color2: sand, radius: 1.35, height: 3.6, ms: 1500, intensity: 1, speed: 2.6, opacity: 0.8, additive: false });
  let acc = 0;
  const swirl = during(c, 1100, (_k, dt) => {
    const center = vx.mesh.position;
    acc += dt * 90;
    while (acc >= 1) {
      acc--;
      const a = Math.random() * Math.PI * 2;
      const h = rnd(0, 3.2);
      const r = 0.5 + h * 0.3;
      const p = center.clone().add(V(Math.cos(a) * r, h, Math.sin(a) * r));
      if (Math.random() < 0.35) vfx.particle({ tex: 'smoke', pos: p, vel: V(0, rnd(0.8, 1.8), 0), swirl: { center: center.clone(), speed: 5 }, life: 0.6, size: [0.7, 1.4], color: [sand, dark], intensity: 1, alpha: [0.5, 0], additive: false, spin: 3 });
      else vfx.particle({ tex: 'dot', pos: p, vel: V(0, rnd(1, 2.5), 0), swirl: { center: center.clone(), speed: 6 }, life: 0.5, size: rnd(0.05, 0.09), color: Math.random() < 0.5 ? light : dark, intensity: 1, alpha: [1, 0.5], additive: false });
    }
  });
  await vfx.wait(520);

  // ...and bursts outward: the storm spreads across the whole field in a gust
  void stage.setTint(0xc8a878, 0.2, 450);
  vfx.shake(0.14, 500);
  vfx.prim.shockwave(feet.clone().setY(feet.y + 0.08), { color: sand, radius: 3.6, facing: 'ground', ms: 600, thickness: 0.2, intensity: 1 });
  void vfx.tween(700, (k) => vx.mesh.position.copy(feet).lerp(MID, k), ease.inOutQuad);
  const upd = c.stage.onUpdate((_dt, t) => lines.update(t));
  const from = (back: [number, number]) => MID.clone().addScaledVector(wind, rnd(back[0], back[1])).add(V(rnd(-3.5, 3.5), rnd(0.15, 3.2), rnd(-4.5, 4.5)));
  const gust = during(c, 850, (k) => {
    const n = k < 0.7 ? 1 : 0.5;
    for (let i = 0; i < 6 * n; i++) {
      const vel = wind.clone().multiplyScalar(rnd(12, 18)).add(V(0, rnd(-0.3, 0.6), 0));
      vfx.particle({ tex: 'dot', pos: from([-10, -3]), vel, life: rnd(0.6, 0.9), size: rnd(0.07, 0.12), color: Math.random() < 0.5 ? light : dark, intensity: 1, alpha: [1, 0.6], additive: false });
    }
    for (let i = 0; i < 4 * n; i++) {
      const vel = wind.clone().multiplyScalar(rnd(20, 28)).add(V(0, rnd(-0.3, 0.5), 0));
      lines.spawn(from([-11, -4]), vel, { life: rnd(0.35, 0.5), len: rnd(1.4, 3), width: rnd(0.035, 0.06), color: lineColor, alpha: rnd(0.5, 0.8) });
    }
    if (Math.random() < 0.7 * n) {
      vfx.particle({ tex: 'smoke', pos: from([-8, -3]), vel: wind.clone().multiplyScalar(rnd(7, 10)), life: rnd(0.9, 1.3), size: [rnd(2, 3), rnd(4, 6)], color: [sand, dark], intensity: 1, alpha: [0.55, 0], fadeIn: 0.25, spin: rnd(-1, 1), additive: false });
    }
  });
  await vfx.wait(620);
  vfx.shot('wide', c.side, 700);
  c.attacker.setOutline(0);
  void stage.setTint(0xc8a878, 0, 900);
  await Promise.all([vx.done, swirl, gust]);
  // the last wind lines are still flying: clean them up without holding the turn
  void vfx.wait(500).then(() => {
    upd();
    lines.dispose();
  });
});

// ------------------------------------------------------------------ Hail

registerMoveFx('HAIL', async (c) => {
  const { vfx, stage } = c;
  const white = 0xffffff;
  const frost = 0xdaf6ff;
  const main = 0x9ae8ff;
  stage.director.move(skyShot(), 0.7);
  // anticipation: freezing mist and snowflakes swirl up around the user
  c.attacker.setOutline(1.4, main);
  c.attacker.flash(0xc8f0ff, 450, 0.3);
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.06), { color: main, radius: 1.8, facing: 'ground', ms: 600, intensity: 1.2 });
  void vfx.spiral(c.userFeet, { color: [white, main], tex: 'star', ms: 600, radius: Math.max(0.6, c.attacker.width * 0.45), rise: 3, size: [0.12, 0.22], rate: 36, intensity: 1 });
  vfx.burst(c.userFeet.clone().setY(c.userFeet.y + 0.3), { count: 8, tex: 'smoke', color: [frost, 0x7ab8d8], speed: [0.8, 1.6], dir: up, spread: 1.2, life: [0.6, 0.9], size: [0.7, 1.1], endSize: 1.8, additive: false, alpha: [0.35, 0], drag: 1.5 });
  void stage.setTint(0xb8d0f0, 0.2, 800);
  await vfx.wait(260);

  // icy energy rises and an icy cloud forms above the field
  const clouds = gatherClouds(c, { colors: [0xb4c4d8, 0x687a94], ms: 1050, rate: 62, alpha: 0.88, glints: 16 });
  await skyward(c, { core: 0x8ad0ff, main: 0x3a90e0, ms: 360, intensity: 0.9 });
  await vfx.wait(380);

  // hailstones burst down: pellets hit the field, bounce and shatter
  const pending: { t: number; p: THREE.Vector3 }[] = [];
  let first = true;
  const hail = during(c, 900, (k, dt, el) => {
    const t = el / 1000;
    if (k < 0.75) {
      for (let i = 0; i < Math.round(dt * 190); i++) {
        const land = MID.clone().add(V(rnd(-6, 6), 0, rnd(-4.5, 4.5)));
        land.y = landY(land);
        const vel = V(1.2, -rnd(15, 19), 0.6);
        const T = rnd(0.2, 0.32);
        const start = land.clone().addScaledVector(vel, -T);
        vfx.particle({ tex: 'dot', pos: start, vel, life: T, size: rnd(0.22, 0.3), color: 0xf6fbff, intensity: 1.08, alpha: [1, 1], additive: false });
        vfx.particle({ tex: 'streak', pos: start.clone().addScaledVector(vel, -0.02), vel, life: T, size: 0.6, color: frost, intensity: 0.55, rot: -Math.PI / 2 + 0.06, alpha: [0.45, 0.4] });
        pending.push({ t: t + T, p: land });
      }
    }
    for (let i = pending.length - 1; i >= 0; i--) {
      const h = pending[i];
      if (h.t > t) continue;
      pending.splice(i, 1);
      if (first) {
        first = false;
        vfx.shake(0.12, 400);
      }
      vfx.particle({ tex: 'dot', pos: h.p.clone().setY(h.p.y + 0.05), vel: V(rnd(-1.4, 1.4), rnd(2.4, 3.6), rnd(-1.4, 1.4)), acc: V(0, -17, 0), life: 0.38, size: 0.2, color: 0xf4faff, intensity: 1.05, alpha: [1, 0.5], additive: false });
      vfx.burst(h.p.clone().setY(h.p.y + 0.06), { count: 3, tex: 'shard', color: [white, main], speed: [1.5, 3.2], dir: up, spread: 1.3, gravity: 10, life: [0.2, 0.3], size: [0.1, 0.16], spin: 12, intensity: 1.2 });
      if (Math.random() < 0.3) vfx.prim.shockwave(h.p, { color: frost, radius: rnd(0.3, 0.5), facing: 'ground', ms: 300, thickness: 0.25, intensity: 0.9 });
    }
  });
  await vfx.wait(560);
  vfx.shot('wide', c.side, 700);
  c.attacker.setOutline(0);
  void stage.setTint(0xb8d0f0, 0, 900);
  await Promise.all([clouds, hail]);
});

// ------------------------------------------------------------------ Weather Ball

interface BallStyle {
  pal: Palette;
  /** trail particle texture / colors / blending */
  tex: TexName;
  trail: [number, number];
  additive: boolean;
  /** motes drawn into the ball while it charges */
  mote: TexName;
}

const BALL: Record<WeatherKind | 'none', BallStyle> = {
  none: { pal: { core: 0xffffff, main: 0xc4c4d2, dark: 0x707080 }, tex: 'glow', trail: [0xf0f0f8, 0xa8a8b8], additive: true, mote: 'spark' },
  sun: { pal: TYPE_FX.FIRE, tex: 'flame', trail: [0xffd070, 0xff4a10], additive: false, mote: 'flame' },
  rain: { pal: TYPE_FX.WATER, tex: 'bubble', trail: [0xe8f8ff, 0x3a9aff], additive: true, mote: 'drop' },
  sand: { pal: { core: 0xfff0c8, main: 0xc8883a, dark: 0x6a4a20 }, tex: 'smoke', trail: [0xd8b070, 0x8a6038], additive: false, mote: 'dot' },
  hail: { pal: TYPE_FX.ICE, tex: 'shard', trail: [0xdaf6ff, 0x5ab8f0], additive: true, mote: 'star' },
};

registerMoveFx('WEATHER_BALL', async (c) => {
  const { vfx, stage } = c;
  const kind = currentWeather ?? 'none';
  const st = BALL[kind];
  const pal = st.pal;
  const s = 0.7 + c.power * 0.8;
  // anticipation: a ball of weather energy forms above the user's head
  const at = c.attacker.at(1).add(V(0, 0.3, 0)).addScaledVector(c.dir, 0.4);
  c.attacker.setOutline(1.3, pal.main);
  const orb = vfx.prim.orb({ color: pal.main, core: pal.core, radius: 0.42, intensity: kind === 'none' ? 1.1 : 1.35 });
  orb.mesh.position.copy(at);
  orb.mesh.scale.setScalar(0.01);
  void orb.grow(380, 1);
  const charge = during(c, 400, (_k, dt) => {
    for (let i = 0; i < Math.ceil(dt * 45); i++) {
      const p = at.clone().add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(1.1, 1.6)));
      vfx.particle({ tex: st.mote, pos: p, vel: at.clone().sub(p).multiplyScalar(2.4), swirl: { center: at, speed: 3 }, life: 0.38, size: [0.2, 0.08], color: st.trail, intensity: st.additive ? 1.4 : 1.1, alpha: [0.2, 1], additive: st.additive, spin: 3 });
    }
  });
  if (kind === 'rain') vfx.particle({ tex: 'ring', pos: at.clone(), life: 0.4, size: [1.6, 0.6], color: pal.main, intensity: 1.3, alpha: [0, 0.8] });
  await charge;
  c.attacker.setOutline(0);

  // lob it at the target
  const to = c.aim(0.5);
  // additive trails are spaced wider so they don't stack up into a solid white beam
  const trail = pathTrail(c, () => orb.mesh.position, 460, st.additive ? 0.17 : 0.09, (q) => {
    vfx.particle({ tex: st.tex, pos: q.clone().add(V(rnd(-0.12, 0.12), rnd(-0.12, 0.12), rnd(-0.12, 0.12))), vel: V(rnd(-0.6, 0.6), rnd(-0.3, 0.6), rnd(-0.6, 0.6)), life: rnd(0.22, 0.38), size: [rnd(0.3, 0.46), 0.1], color: st.trail, intensity: st.additive ? 0.95 : 1.05, spin: rnd(-4, 4), additive: st.additive });
  });
  const glow = pathTrail(c, () => orb.mesh.position, 460, 0.18, (q) => {
    vfx.particle({ tex: 'glow', pos: q.clone(), life: 0.16, size: [0.6, 0.2], color: pal.main, intensity: 1, alpha: [0.5, 0] });
  });
  await orb.fly(at, to, 460, 0.7, ease.inQuad);
  orb.dispose();

  if (c.missed) {
    vfx.burst(to, { count: 12, tex: st.mote, color: st.trail, speed: [1, 3], life: [0.3, 0.5], size: [0.12, 0.24], additive: st.additive });
    await Promise.all([trail, glow]);
    return;
  }
  // impact: hit spark + a weather-flavoured burst, scaled by power (and smaller on the near, player side)
  const p = towardCam(c, to, 0.4);
  const z = THREE.MathUtils.clamp(p.distanceTo(stage.camera.position) / 12, 0.55, 1);
  const k = s * z;
  vfx.hitSpark(to, pal, kind === 'none' ? k * 0.8 : k * 0.9);
  vfx.prim.impactStar(p, { color: pal.main, core: pal.core, size: 0.6 * k, ms: 240 });
  if (kind === 'sun') {
    vfx.prim.energyBlast(p, { color: 0xff6a1a, core: 0xfff2a0, radius: 0.85 * k, ms: 380, intensity: 0.9 });
    vfx.burst(p, { count: Math.round(28 * s), tex: 'flame', color: [0xffd070, 0xff3a10], speed: [2 * z, 5.5 * k], life: [0.35, 0.6], size: [0.4 * z, 0.65 * z], additive: false, drag: 2.5, intensity: 1.15 });
    vfx.burst(p, { count: 16, tex: 'spark', color: [0xfff2a0, 0xff8a20], speed: [3, 7], life: [0.3, 0.6], size: [0.1, 0.2], gravity: 4, intensity: 1.5 });
  } else if (kind === 'rain') {
    vfx.burst(p, { count: Math.round(26 * s), tex: 'drop', color: [0xe8f8ff, 0x3a9aff], speed: [2.5 * z, 5.5 * k], life: [0.35, 0.6], size: [0.14 * z, 0.26 * z], gravity: 9, additive: false, intensity: 1.1 });
    vfx.burst(p, { count: 10, tex: 'bubble', color: 0xbfe4ff, speed: [1, 3], life: [0.4, 0.7], size: [0.14 * z, 0.28 * z], intensity: 1.3 });
    vfx.prim.shockwave(p, { color: 0x3a9aff, radius: 1.5 * k, ms: 380, thickness: 0.18, intensity: 1.2 });
  } else if (kind === 'sand') {
    vfx.burst(p, { count: Math.round(16 * s), tex: 'rock', color: [0xd8b070, 0x8a6038], speed: [3 * z, 6 * k], life: [0.4, 0.7], size: [0.14 * z, 0.26 * z], gravity: 12, additive: false, spin: 8, intensity: 1 });
    vfx.burst(p, { count: 12, tex: 'smoke', color: [0xc8a472, 0x86684a], speed: [1, 3], life: [0.5, 0.8], size: [0.7 * z, 1.1 * z], endSize: 1.8 * z, additive: false, alpha: [0.6, 0], drag: 2.5 });
    vfx.burst(p, { count: 34, tex: 'dot', color: [0xf0d8a0, 0x8a6038], speed: [3, 8], life: [0.3, 0.5], size: 0.07, additive: false, drag: 2 });
  } else if (kind === 'hail') {
    vfx.burst(p, { count: Math.round(22 * s), tex: 'shard', color: [0xffffff, 0x9ae8ff], speed: [3 * z, 7 * k], life: [0.3, 0.55], size: [0.14 * z, 0.26 * z], spin: 10, gravity: 6, intensity: 1.3 });
    vfx.burst(p, { count: 8, tex: 'smoke', color: [0xdaf6ff, 0x9ae8ff], speed: [1, 2.5], life: [0.5, 0.8], size: [0.6 * z, 0.9 * z], endSize: 1.4 * z, additive: false, alpha: [0.45, 0], drag: 2.5 });
    vfx.prim.shockwave(p, { color: 0x9ae8ff, radius: 1.4 * k, ms: 360, thickness: 0.18, intensity: 1.1 });
  } else {
    vfx.burst(p, { count: 18, tex: 'star', color: [0xffffff, 0xd0d0e0], speed: [2, 5], life: [0.3, 0.5], size: [0.14 * z, 0.26 * z], spin: 6, intensity: 1.2 });
  }
  stage.shockwave(p, 0.35 + 0.35 * c.power, 300);
  vfx.shake(0.1 + 0.18 * c.power, 320);
  c.impact(0);
  await Promise.all([trail, glow, vfx.wait(320)]);
});
