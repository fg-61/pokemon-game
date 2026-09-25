import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { camBasis, during, emitAlong, hitStop, impactFx, pulledShot, screenAngle, softHit, speedLines, strokePoints, towardCam } from './common';

// Signature / hand-curated roster moves: Sacred Fire, Eruption, Mist Ball, Luster Purge, Blaze Kick, Fly, Muddy Water,
// Mud-Slap, Peck, Pursuit, Rage, Fake Out, Toxic.

type Sprite = MoveFxContext['attacker'];

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const TAU = Math.PI * 2;
/** Integer particle count for a per-second rate this frame (unbiased). */
const nOf = (rate: number, dt: number) => Math.floor(rate * dt + Math.random());
const DUST = 0xa89878;

const mouthOf = (c: MoveFxContext, fwd = 0.45, frac = 0.6) => c.attacker.at(frac).addScaledVector(c.dir, fwd);
/** Aim point on the ground (feet level) — beside the target on a miss. */
const groundAt = (c: MoveFxContext) => c.aim(0).setY(c.foeFeet.y);
/** Effects near the camera (the player's side) are drawn smaller so they don't swallow the screen. */
const camScale = (c: MoveFxContext, p: THREE.Vector3) => THREE.MathUtils.clamp(p.distanceTo(c.stage.camera.position) / 12, 0.55, 1);
const hue = (h: number, s = 0.95, l = 0.62) => new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l);
const lift = (p: THREE.Vector3, y = 0.06) => p.clone().setY(p.y + y);

function rndUnit() {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * TAU;
  const r = Math.sqrt(1 - u * u);
  return V(r * Math.cos(a), u, r * Math.sin(a));
}

/** Height of the floor under a point: platform tops around both sprites, the arena ground elsewhere. */
function floorAt(c: MoveFxContext, p: THREE.Vector3) {
  for (const s of [c.attacker, c.target]) {
    const g = s.group.position;
    if (Math.hypot(p.x - g.x, p.z - g.z) < 1.9) return 0.35;
  }
  return 0.02;
}

/** Direction perpendicular to a->b that bends a path upwards (stays in the screen plane for a level camera). */
function upPerp(a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a).normalize();
  const p = UP.clone().addScaledVector(d, -UP.dot(d));
  return p.lengthSq() < 1e-6 ? UP.clone() : p.normalize();
}

/** Point on the quadratic arc a->b bulging by `bend` along `perp`. */
const arcAt = (a: THREE.Vector3, b: THREE.Vector3, perp: THREE.Vector3, bend: number, t: number) => a.clone().lerp(b, t).addScaledVector(perp, bend * 4 * t * (1 - t));

/** Screen-plane unit vector for an on-screen angle (0 = right, PI/2 = up). */
function screenDir(c: MoveFxContext, angle: number) {
  const { right, up } = camBasis(c);
  return right.multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle));
}

/** Slide the attacker's body to `d` along the attack direction. */
function slideTo(c: MoveFxContext, d: number, ms: number, e = ease.inOutQuad) {
  const b = c.attacker.body.position;
  const from = b.clone();
  const to = c.dir.clone().multiplyScalar(d).setY(0);
  return c.stage.tween(ms, (k) => b.lerpVectors(from, to, k), e);
}

/** Dash distance that leaves the attacker standing just in front of the target. */
function gapDist(c: MoveFxContext, gap = 1.0) {
  return Math.max(0.8, c.user.distanceTo(c.foe) - Math.max(gap, (c.attacker.width + c.target.width) * 0.3));
}

function ghost(c: MoveFxContext, color: number, opacity = 0.35, ms = 300, drift?: THREE.Vector3) {
  return c.vfx.prim.afterimage(c.attacker.mesh, { color, opacity, ms, drift });
}

/** A small miss puff beside the target. */
function whiff(c: MoveFxContext, at: THREE.Vector3, color = 0xffffff) {
  c.vfx.burst(at, { count: 8, tex: 'streak', color, speed: [4, 7], size: [0.4, 0.7], life: 0.18, dir: c.dir, spread: 0.5, intensity: 1.1 });
}

/** Draw a ribbon on top of everything (sprites included), like the comic impact stars. */
function onTop(m: THREE.Mesh, order = 20) {
  (m.material as THREE.Material).depthTest = false;
  m.renderOrder = order;
  return m;
}

/**
 * Like common.slashStroke (bright ribbon over a dark, wider under-stroke) but always drawn on top of the sprites,
 * so strokes stay visible when the attacker stands between the camera and the target.
 */
function topStroke(
  c: MoveFxContext,
  pts: THREE.Vector3[],
  o: { color: number; core?: number; width: number; ms?: number; length?: number; holdMs?: number; fadeMs?: number; intensity?: number; edge?: number; edgeAlpha?: number; e?: (t: number) => number },
) {
  const common = { ms: o.ms ?? 130, length: o.length ?? 1, holdMs: o.holdMs ?? 100, fadeMs: o.fadeMs ?? 220, e: o.e ?? ease.outCubic };
  const under = c.vfx.prim.ribbon(pts, { ...common, color: o.edge ?? 0x1a1210, core: o.edge ?? 0x1a1210, width: o.width * 2.2, additive: false, intensity: 1, opacity: o.edgeAlpha ?? 0.55 });
  onTop(under.mesh, 20);
  const r = c.vfx.prim.ribbon(pts, { ...common, color: o.color, core: o.core ?? 0xffffff, width: o.width, intensity: o.intensity ?? 1.1 });
  onTop(r.mesh, 21);
  return r;
}

/** Little stars wheel around a sprite's head (flinch / daze). */
function dizzy(c: MoveFxContext, s: Sprite, color = 0xffe070, n = 5) {
  const hd = s.at(0.98);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    c.vfx.particle({ tex: 'star', pos: hd.clone().add(V(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6)), vel: V(0, 0.3, 0), swirl: { center: hd, speed: 5 }, life: 0.8, size: [0.35, 0.2], color, intensity: 1.5, fadeIn: 0.1 });
  }
}

/** Flames licking up from a point for `ms` (burning target). */
function burnOn(c: MoveFxContext, at: THREE.Vector3, ms: number, o: { rate?: number; radius?: number; hot?: [number, number]; body?: [number, number]; smoke?: boolean } = {}) {
  const { vfx } = c;
  const radius = o.radius ?? 0.6;
  return during(c, ms, (k, dt) => {
    const n = nOf(90 * (o.rate ?? 1) * (1 - k * 0.7), dt);
    for (let i = 0; i < n; i++) {
      const p = at.clone().add(V((Math.random() - 0.5) * 2 * radius, (Math.random() - 0.4) * radius * 1.4, (Math.random() - 0.5) * 2 * radius));
      vfx.particle({ tex: 'flame', pos: p, vel: V((Math.random() - 0.5) * 0.6, 2 + Math.random() * 2.2, (Math.random() - 0.5) * 0.6), life: 0.35 + Math.random() * 0.25, size: [0.45 + Math.random() * 0.4, 0.1], color: o.body ?? [0xffd040, 0xd82a06], intensity: 1.15, additive: false, alpha: [0.95, 0], rot: (Math.random() - 0.5) * 0.4 });
      if (Math.random() < 0.4) vfx.particle({ tex: 'flame', pos: p, vel: V(0, 2.6, 0), life: 0.25, size: [0.35, 0.05], color: o.hot ?? [0xfff6d0, 0xff7a10], intensity: 1.2, alpha: [0.7, 0], rot: 0 });
    }
    if ((o.smoke ?? true) && Math.random() < 0.2 * (o.rate ?? 1)) vfx.particle({ tex: 'smoke', pos: at.clone().add(V((Math.random() - 0.5) * radius, radius, (Math.random() - 0.5) * radius)), vel: V(0, 1.4, 0), life: 0.9, size: [0.5, 1.4], color: [0x4a3a34, 0x2a2220], intensity: 1, additive: false, alpha: [0.4, 0], fadeIn: 0.2, spin: 1 });
  });
}

// =============================================================================================== SACRED FIRE

const SF = { white: 0xfffbea, gold: 0xffe07a, amber: 0xffb030, orange: 0xff7a18, red: 0xd83a08 };
const SFPAL = { core: 0xfffbe8, main: 0xffc040, dark: 0x8a3a08 };
/** red → violet, the rainbow of Ho-Oh's sacred flame */
const RAINBOW = [0xff3a3a, 0xff9a2a, 0xffe83a, 0x4ae05a, 0x3a9aff, 0xa05aff];

function rainbowSpark(c: MoveFxContext, p: THREE.Vector3, vel: THREE.Vector3, h: number, size = 0.16, life = 0.5) {
  c.vfx.particle({ tex: Math.random() < 0.35 ? 'star' : 'spark', pos: p, vel, drag: 1.2, life, size: [size, size * 0.3], color: hue(h, 1, 0.68), intensity: 1.1, alpha: [1, 0] });
}

/**
 * A great phoenix of sacred fire flares up behind `at` (screen plane): glowing wing, crest and tail strokes; the wings
 * unfold and beat once while flames stream off them, then the bird rises and fades.
 */
function phoenixRise(c: MoveFxContext, at: THREE.Vector3, span: number, ms: number) {
  const { vfx } = c;
  const { right, up, fwd } = camBasis(c);
  const toCam = fwd.clone().negate();
  const o = towardCam(c, at, -0.7);
  const L = (x: number, y: number) => right.clone().multiplyScalar(x * span).addScaledVector(up, y * span);
  type Part = { meshes: THREE.Object3D[]; curve: THREE.CatmullRomCurve3; root: THREE.Vector3; s: number; wing: boolean };
  const parts: Part[] = [];
  const hold = ms - 520;
  const stroke = (root: THREE.Vector3, pts: [number, number][], s: number, wing: boolean, o2: { color: number; core: number; width: number; intensity: number; draw: number }) => {
    const local = pts.map(([x, y]) => L(x, y));
    const r = vfx.prim.ribbon(local, { color: o2.color, core: o2.core, width: o2.width * span, ms: o2.draw, length: 1, holdMs: hold + 220 - o2.draw, fadeMs: 300, intensity: o2.intensity, e: ease.outCubic });
    r.mesh.position.copy(root);
    parts.push({ meshes: [r.mesh], curve: new THREE.CatmullRomCurve3(local), root, s, wing });
  };
  const bodyRoot = o.clone();
  // body, neck and head, crest, tail
  stroke(bodyRoot, [[0, -0.6], [0.02, 0.1], [0.1, 0.8], [0.02, 1.3]], 0, false, { color: SF.amber, core: SF.white, width: 0.26, intensity: 0.9, draw: 200 });
  stroke(bodyRoot, [[0.02, 1.3], [-0.2, 1.7], [-0.5, 1.9]], 0, false, { color: SF.orange, core: SF.gold, width: 0.12, intensity: 0.95, draw: 240 });
  stroke(bodyRoot, [[0.05, 1.32], [0.1, 1.75], [0.02, 2.1]], 0, false, { color: SF.orange, core: SF.gold, width: 0.1, intensity: 0.95, draw: 260 });
  for (const t of [-1, 0, 1]) stroke(bodyRoot, [[0, -0.55], [t * 0.35, -1.1], [t * 0.8, -1.4 - (t === 0 ? 0.35 : 0)]], 0, false, { color: SF.orange, core: SF.gold, width: 0.13, intensity: 0.9, draw: 260 });
  // wings (drawn relative to the shoulder so they can beat)
  for (const s of [-1, 1]) {
    const root = o.clone().add(L(0.12 * s, 0.55));
    stroke(root, [[0, 0], [0.6 * s, 0.55], [1.3 * s, 0.85], [2.0 * s, 0.75], [2.5 * s, 0.35]], s, true, { color: SF.orange, core: SF.gold, width: 0.24, intensity: 0.9, draw: 220 });
    stroke(root, [[0.15 * s, -0.08], [0.8 * s, 0.2], [1.5 * s, 0.28], [2.1 * s, 0.02]], s, true, { color: SF.orange, core: SF.gold, width: 0.16, intensity: 0.8, draw: 250 });
    stroke(root, [[0.2 * s, -0.25], [0.8 * s, -0.18], [1.35 * s, -0.25], [1.75 * s, -0.5]], s, true, { color: SF.red, core: SF.amber, width: 0.13, intensity: 0.8, draw: 280 });
  }
  const q = new THREE.Quaternion();
  return during(c, ms, (k, dt) => {
    // unfold from raised wings (0..0.3), one beat (0.3..0.75), then rise
    const beat = k < 0.3 ? 0.9 * (1 - ease.outBack(k / 0.3)) : 0.45 * Math.sin(Math.min(1, (k - 0.3) / 0.45) * Math.PI);
    const lift = 0.8 * span * ease.inQuad(Math.max(0, (k - 0.55) / 0.45));
    for (const p of parts) {
      q.setFromAxisAngle(toCam, p.wing ? p.s * beat : 0);
      for (const m of p.meshes) {
        m.quaternion.copy(q);
        m.position.copy(p.root).addScaledVector(up, lift);
      }
      // flames stream off the strokes
      const n = nOf((p.wing ? 55 : 25) * (1 - k * 0.6), dt);
      for (let i = 0; i < n; i++) {
        const t = Math.random() * Math.min(1, k * 4);
        const w = p.curve.getPointAt(t).applyQuaternion(q).add(p.root).addScaledVector(up, lift);
        const sz = (p.wing ? 0.55 - 0.25 * t : 0.45) * span;
        vfx.particle({ tex: 'flame', pos: w.add(rndUnit().multiplyScalar(0.08 * span)), vel: V(0, 1.2 + Math.random() * 1.2, 0), life: 0.3 + Math.random() * 0.15, size: [sz, sz * 0.2], color: t < 0.4 ? [SF.white, SF.amber] : [SF.gold, SF.red], intensity: 1.1, additive: false, alpha: [0.85, 0], rot: (Math.random() - 0.5) * 0.3 });
      }
      if (p.wing && Math.random() < 0.3 * (1 - k)) rainbowSpark(c, p.curve.getPointAt(1).applyQuaternion(q).add(p.root).addScaledVector(up, lift), V((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2), Math.random(), 0.2, 0.6);
    }
  });
}

registerMoveFx('SACRED_FIRE', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  // 1) a sacred golden-white fire wreathes the user; rainbow light ripples out from its feet
  pulledShot(c, 'user', 1.55, 0.8, 420);
  stage.setTint(0xffe0a0, 0.16, 420);
  sp.setOutline(1.5, SF.gold);
  const feet = c.userFeet.clone();
  const R = Math.max(0.8, sp.width * 0.5);
  let lastRing = -1000;
  let ring = 0;
  await during(c, 580, (k, dt, el) => {
    const n = nOf(120, dt);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = R * (0.85 + Math.random() * 0.45);
      const p = feet.clone().add(V(Math.cos(a) * r, 0.1 + Math.random() * sp.height * 0.35, Math.sin(a) * r));
      vfx.particle({ tex: 'flame', pos: p, vel: V(-Math.cos(a) * 0.5, 2.4 + k * 2.6 + Math.random() * 1.4, -Math.sin(a) * 0.5), swirl: { center: feet, speed: 2.4 }, life: 0.5, size: [0.45 + k * 0.4, 0.08], color: [SF.white, SF.amber], intensity: 1.1, additive: false, alpha: [0.9, 0], rot: (Math.random() - 0.5) * 0.3 });
    }
    const m = nOf(45, dt);
    for (let i = 0; i < m; i++) {
      const a = Math.random() * TAU;
      rainbowSpark(c, feet.clone().add(V(Math.cos(a) * R * 1.2, Math.random() * sp.height, Math.sin(a) * R * 1.2)), V(0, 1.2 + Math.random(), 0), Math.random(), 0.2, 0.7);
    }
    if (el - lastRing > 95 && ring < 6) {
      lastRing = el;
      vfx.prim.shockwave(lift(feet), { color: RAINBOW[ring], radius: R * 1.8 + ring * 0.4, facing: 'ground', ms: 520, thickness: 0.14, intensity: 1.0 });
      ring++;
    }
    vfx.particle({ tex: 'glow', pos: c.user, life: 0.07, size: 1 + k * 1.5, color: SF.gold, intensity: 0.45 + 0.35 * k, alpha: [0.45, 0] });
  });
  sp.flash(0xfff4c0, 260, 0.6);
  // 2) the flame takes flight as a phoenix: a blazing head, beating wings of fire and a rainbow streamer
  vfx.shot('side', c.side, 260);
  await vfx.wait(80);
  const from = sp.at(0.7).addScaledVector(c.dir, 0.6);
  const to = c.aim(0.55);
  const path = new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => arcAt(from, to, upPerp(from, to), 0.9, i / 12)));
  const { fwd: camFwd } = camBasis(c);
  const along = to.clone().sub(from).normalize();
  const sideUp = new THREE.Vector3().crossVectors(along, camFwd).normalize();
  if (sideUp.dot(UP) < 0) sideUp.negate();
  const flightMs = 480;
  const pathPts = path.getSpacedPoints(30);
  RAINBOW.forEach((col, i) => {
    const off = (2.5 - i) * 0.1;
    const band = vfx.prim.ribbon(pathPts.map((q, j) => towardCam(c, q, 0.25).addScaledVector(sideUp, off * (0.4 + 0.6 * (1 - j / 30)))), { color: col, core: col, width: 0.07, ms: flightMs, length: 0.7, fadeMs: 320, additive: false, opacity: 0.85, intensity: 1.1, e: ease.inOutQuad });
    band.mesh.renderOrder = 7;
  });
  const head = vfx.prim.orb({ color: SF.gold, core: SF.white, radius: 0.36, intensity: 1.15 });
  head.mesh.position.copy(from);
  let prev = from.clone();
  await during(c, flightMs, (k, _dt, el) => {
    const p = path.getPointAt(ease.inOutQuad(k));
    head.mesh.position.copy(p);
    const back = prev.clone().sub(p);
    if (back.lengthSq() > 1e-8) back.normalize();
    else back.copy(along).negate();
    emitAlong(prev, p, 0.14, (q) => {
      vfx.particle({ tex: 'flame', pos: q.clone().add(rndUnit().multiplyScalar(0.12)), vel: back.clone().multiplyScalar(1.2).add(V(0, 1.2, 0)), life: 0.28, size: [0.65, 0.15], color: [SF.white, SF.orange], intensity: 1.1, additive: false, alpha: [0.95, 0], rot: (Math.random() - 0.5) * 0.5 });
      vfx.particle({ tex: 'flame', pos: q.clone().add(rndUnit().multiplyScalar(0.25)), vel: back.clone().multiplyScalar(0.8).add(V(0, 1.6, 0)), life: 0.36, size: [0.85, 0.25], color: [SF.gold, SF.red], intensity: 1.05, additive: false, alpha: [0.6, 0], rot: (Math.random() - 0.5) * 0.5 });
    });
    // wings of fire, redrawn every frame so they beat as the phoenix flies
    const flap = Math.sin((el / 1000) * 24);
    const bk = back.clone().addScaledVector(camFwd, -back.dot(camFwd)).normalize();
    for (const [a0, a1, L] of [[0.35, 0.85, 1.3], [-0.2, -0.45, 0.9]] as const) {
      const th = a0 + a1 * (0.5 + 0.5 * flap);
      const wd = bk.clone().multiplyScalar(Math.cos(th)).addScaledVector(sideUp, Math.sin(th));
      for (let j = 1; j <= 9; j++) {
        const t = j / 9;
        const q = p.clone().addScaledVector(wd, L * t).addScaledVector(bk, 0.35 * L * t * t).add(rndUnit().multiplyScalar(0.06));
        const sz = (0.75 - 0.4 * t) * (L / 1.7);
        vfx.particle({ tex: 'flame', pos: q, vel: V(0, 0.8, 0), life: 0.1, size: [sz, sz * 0.7], color: t < 0.45 ? [SF.white, SF.amber] : [SF.gold, SF.orange], intensity: 1.1, additive: false, alpha: [0.95, 0.4], rot: screenAngle(c, q, q.clone().add(wd)) - Math.PI / 2 });
      }
      if (Math.random() < 0.35) vfx.particle({ tex: 'feather', pos: p.clone().addScaledVector(wd, L), vel: V((Math.random() - 0.5), -0.6, (Math.random() - 0.5)), drag: 1.5, life: 0.8, size: [0.32, 0.22], color: [SF.gold, SF.orange], intensity: 1.05, additive: false, alpha: [0.95, 0], spin: 4 });
    }
    if (Math.random() < 0.9) rainbowSpark(c, p.clone().add(rndUnit().multiplyScalar(0.4)), back.clone().multiplyScalar(2).add(rndUnit()), Math.random(), 0.16, 0.5);
    prev = p;
  });
  head.dispose();
  // 3) the phoenix crashes into the target and engulfs it
  const at = to;
  const base = c.missed ? groundAt(c) : c.foeFeet.clone();
  const z = camScale(c, at);
  if (!c.missed) {
    c.impact(0);
    c.target.flash(0xfff0c0, 450, 0.9);
    impactFx(c, at, { strength: 1.3, pal: SFPAL, stop: true, dust: 0xd8b888 });
  } else whiff(c, at, SF.gold);
  stage.flash(0xffe8a0, 0.12, 260);
  stage.chromaPulse(0.007, 300);
  vfx.shake(0.4, 650);
  vfx.prim.blast(at, { core: SF.white, main: 0xffc040, dark: 0xb04008, radius: 1.4 * z, scaleY: 1.3, rise: 0.8, ms: 850, intensity: 1.0 });
  // a rainbow halo flares around the point of impact, rainbow rings run over the ground
  const halo = towardCam(c, at, 0.3);
  RAINBOW.forEach((col, i) => vfx.prim.shockwave(halo, { color: col, radius: (2.0 + (5 - i) * 0.16) * z, startRadius: 0.4, ms: 560, thickness: 0.07, intensity: 1.0 }));
  for (let i = 0; i < 6; i++) stage.wait(i * 55).then(() => vfx.prim.shockwave(lift(base), { color: RAINBOW[i], radius: 2.1 + i * 0.45, facing: 'ground', ms: 620, thickness: 0.13, intensity: 1.0 }));
  const span = Math.max(0.9, Math.min(1.3, c.target.width * 0.5)) * z;
  const wings = phoenixRise(c, c.missed ? at : c.target.at(0.5), span, 760);
  // a column of sacred fire engulfs the target
  const R2 = Math.max(0.6, c.target.width * 0.42) * z;
  const engulf = during(c, 760, (k, dt) => {
    const n = nOf(120 * (1 - k * 0.55), dt);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = R2 * Math.sqrt(Math.random());
      const p = base.clone().add(V(Math.cos(a) * r, 0.15 + Math.random() * 0.4, Math.sin(a) * r));
      const hot = r < R2 * 0.5;
      vfx.particle({ tex: 'flame', pos: p, vel: V(-Math.cos(a) * 0.4, 4 + Math.random() * 3.5, -Math.sin(a) * 0.4), drag: 0.6, life: 0.45 + Math.random() * 0.25, size: [(0.7 + Math.random() * 0.5) * z, 0.12], color: hot ? [SF.white, SF.amber] : [SF.gold, SF.red], intensity: 1.1, additive: false, alpha: [0.95, 0], rot: (Math.random() - 0.5) * 0.3 });
    }
    const m = nOf(40 * (1 - k * 0.5), dt);
    for (let i = 0; i < m; i++) rainbowSpark(c, base.clone().add(V((Math.random() - 0.5) * R2 * 2.4, 0.3 + Math.random() * 2.5, (Math.random() - 0.5) * R2 * 2.4)), V(0, 1.5 + Math.random() * 1.5, 0), Math.random(), 0.18, 0.7);
    if (!c.missed && Math.random() < 0.25) c.target.shake(0.06, 0.12);
  });
  await vfx.wait(200);
  pulledShot(c, 'foe', 1.75, 1.0, 450);
  await Promise.all([wings, engulf]);
  // 4) the fire settles into a lingering sacred burn; golden feathers drift down
  sp.setOutline(0);
  stage.setTint(0xffffff, 0, 400);
  for (let i = 0; i < 12; i++) {
    const p = base.clone().add(V((Math.random() - 0.5) * 2.6, 1.6 + Math.random() * 1.6, (Math.random() - 0.5) * 2.6));
    vfx.particle({ tex: 'feather', pos: p, vel: V((Math.random() - 0.5) * 0.8, -0.7, (Math.random() - 0.5) * 0.8), drag: 0.8, life: 1.0 + Math.random() * 0.4, size: [0.3, 0.26], color: [SF.gold, SF.amber], intensity: 1.05, additive: false, alpha: [0.95, 0], fadeIn: 0.1, spin: 3 });
  }
  vfx.shot('wide', c.side, 500);
  if (!c.missed) await burnOn(c, c.target.at(0.4), 320, { rate: 0.8, radius: 0.5, hot: [SF.white, SF.amber], body: [SF.gold, SF.red] });
  else await vfx.wait(300);
});

// =============================================================================================== ERUPTION

const LAVA = { white: 0xfff0b0, yellow: 0xffc030, orange: 0xff6a10, red: 0xd02a06, deep: 0x7a1404, rock: 0x4a1a0a, soot: 0x3a302c, smoke: 0x221c1a };
const LAVAPAL = { core: 0xfff0b0, main: 0xff7a20, dark: 0x6a1a08 };

/** A glowing lava bomb lobbed from `from` onto `land`; splashes fire where it lands. */
function lavaBomb(c: MoveFxContext, from: THREE.Vector3, land: THREE.Vector3, ms: number, apex: number, size: number) {
  const { vfx } = c;
  const rock = vfx.prim.boulder(from, { color: 0xff6a1a, size, emissive: 1.25 });
  const mid = from.clone().lerp(land, 0.5);
  mid.y = Math.max(from.y, land.y) + apex;
  let prev = from.clone();
  return during(c, ms, (k) => {
    const a = from.clone().lerp(mid, k);
    const b = mid.clone().lerp(land, k);
    const p = a.lerp(b, k);
    rock.mesh.position.copy(p);
    rock.mesh.rotation.x += 0.2;
    rock.mesh.rotation.z += 0.13;
    vfx.particle({ tex: 'glow', pos: p.clone(), life: 0.06, size: size * 5, color: LAVA.orange, intensity: 0.8, alpha: [0.7, 0] });
    emitAlong(prev, p, 0.2, (q) => {
      vfx.particle({ tex: 'flame', pos: q, vel: V(0, 0.8, 0), life: 0.3, size: [size * 3.2, size * 0.8], color: [LAVA.yellow, LAVA.red], intensity: 1.1, additive: false, alpha: [0.9, 0], rot: (Math.random() - 0.5) * 0.4 });
      if (Math.random() < 0.35) vfx.particle({ tex: 'smoke', pos: q.clone(), vel: V(0, 0.6, 0), life: 0.7, size: [size * 3, size * 7], color: [LAVA.soot, LAVA.smoke], intensity: 1, additive: false, alpha: [0.45, 0], spin: 1 });
    });
    prev = p;
  }).then(() => {
    rock.dispose();
    const g = land.clone();
    vfx.burst(lift(g, 0.15), { count: 10, tex: 'flame', color: [LAVA.yellow, LAVA.red], speed: [1.5, 3.5], dir: UP, spread: 1.0, size: [0.4, 0.7], life: [0.3, 0.5], gravity: 3, additive: false, intensity: 1.1 });
    vfx.burst(lift(g, 0.15), { count: 6, tex: 'drop', color: [LAVA.orange, LAVA.deep], speed: [2, 4], dir: UP, spread: 0.9, size: [0.14, 0.22], life: 0.5, gravity: 12, additive: false, intensity: 1.1 });
    vfx.prim.crack(g, { radius: 0.35 + size * 2, ms: 900, glow: LAVA.orange, glowIntensity: 1.2, color: 0x2a140a });
    vfx.prim.shockwave(lift(g), { color: LAVA.orange, radius: 0.9 + size * 2, facing: 'ground', ms: 320, thickness: 0.2, intensity: 1.0 });
    vfx.dust(g, 0x8a7060, 4);
  });
}

registerMoveFx('ERUPTION', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  // the engine passes the HP-scaled base power (150 at full HP): the whole eruption scales with it
  const s = 0.25 + 0.75 * c.power;
  const big = s > 0.75;
  // 1) magma heat builds in the user's body; it stomps and the ground splits open
  vfx.shot('side', c.side, 400);
  stage.setTint(0xff8050, 0.05 + 0.1 * s, 450);
  sp.setOutline(1.1 + 0.7 * s, LAVA.orange);
  const heat = during(c, 560, (k, dt) => {
    const n = nOf((40 + 90 * s) * (0.5 + k), dt);
    for (let i = 0; i < n; i++) {
      const p = sp.at(0.35 + Math.random() * 0.6).add(V((Math.random() - 0.5) * sp.width * 0.7, 0, (Math.random() - 0.5) * 0.5));
      vfx.particle({ tex: 'flame', pos: p, vel: V((Math.random() - 0.5) * 0.4, 1.8 + Math.random() * 1.8, 0), life: 0.35, size: [0.4 + 0.3 * s, 0.05], color: [LAVA.yellow, LAVA.red], intensity: 1.1, additive: false, alpha: [0.85, 0], rot: 0 });
    }
    if (Math.random() < 0.6) vfx.particle({ tex: 'spark', pos: sp.at(Math.random()).add(V((Math.random() - 0.5) * sp.width, 0, 0)), vel: V(0, 2 + Math.random() * 2, 0), life: 0.6, size: [0.12, 0.04], color: [LAVA.white, LAVA.orange], intensity: 1.4 });
    if (Math.random() < 0.3) sp.shake(0.04 + 0.04 * s, 0.1);
  });
  await vfx.wait(160);
  await sp.jump(0.18 + 0.32 * s, 240);
  vfx.shake(0.08 + 0.18 * s, 380);
  vfx.prim.crack(c.userFeet, { radius: 0.8 + 1.0 * s, ms: 1900, glow: LAVA.orange, glowIntensity: 0.8 + 0.8 * s });
  vfx.prim.shockwave(lift(c.userFeet), { color: LAVA.orange, radius: 1.8 + 1.6 * s, facing: 'ground', ms: 500, thickness: 0.2, intensity: 1.0 });
  vfx.dust(c.userFeet, DUST, Math.round(6 + 10 * s));
  await heat;
  sp.setOutline(0);
  // 2) a glowing fissure races across the field to the target
  const from = c.userFeet.clone();
  const base = c.missed ? groundAt(c) : c.foeFeet.clone();
  // film the eruption side-on (camera perpendicular to the attack line, on the camera's side), weighted to the target
  // (placed off the middle of the field like SURF's camera so it never ends up among the trees)
  const perpC = V(-c.dir.z, 0, c.dir.x);
  const midC = from.clone().lerp(base, 0.5);
  if (perpC.dot(stage.camera.position.clone().sub(midC)) < 0) perpC.negate();
  const lookC = from.clone().lerp(base, 0.68).add(V(0, 1.5 + 0.9 * s, 0));
  stage.director.move({ pos: midC.clone().addScaledVector(perpC, 10.5).add(V(0, 2.6 + 0.6 * s, 0)), look: lookC, fov: 44 }, 0.5);
  let lastC = -1;
  await during(c, 320, (k) => {
    if (k - lastC > 0.2) {
      lastC = k;
      const q = from.clone().lerp(base, 0.15 + k * 0.7);
      q.y = floorAt(c, q);
      vfx.prim.crack(q, { radius: 0.5 + 0.5 * s, ms: 1200, glow: LAVA.orange, glowIntensity: 1.0, branches: 5 });
      vfx.burst(lift(q, 0.1), { count: Math.round(3 + 5 * s), tex: 'flame', color: [LAVA.yellow, LAVA.red], speed: [1, 3], dir: UP, spread: 0.6, size: [0.3, 0.5], life: 0.35, additive: false, intensity: 1.1 });
      vfx.dust(q, 0x8a7060, 3);
    }
  });
  // 3) under the target the ground bulges and glows; magma bubbles up through the cracks
  const R = (0.55 + 0.6 * s) * THREE.MathUtils.clamp(c.target.width * 0.4, 0.8, 1.2);
  vfx.prim.crack(base, { radius: 1.1 + 1.4 * s, ms: 2100, glow: LAVA.orange, glowIntensity: 1.0 + 0.8 * s });
  vfx.shake(0.06 + 0.1 * s, 300);
  if (!c.missed) c.target.shake(0.08 + 0.06 * s, 0.35);
  await during(c, 260, (k, dt) => {
    const n = nOf(60 + 60 * s, dt);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = R * Math.sqrt(Math.random());
      vfx.particle({ tex: 'glow', pos: base.clone().add(V(Math.cos(a) * r, 0.1, Math.sin(a) * r)), vel: V(0, 0.8 + k * 1.5, 0), life: 0.25, size: [0.3, 0.6], color: LAVA.orange, intensity: 0.9, alpha: [0.8, 0] });
    }
    if (Math.random() < 0.5) vfx.particle({ tex: 'smoke', pos: base.clone().add(V((Math.random() - 0.5) * R * 2, 0.2, (Math.random() - 0.5) * R * 2)), vel: V(0, 1.5, 0), life: 0.7, size: [0.5, 1.4], color: [LAVA.soot, LAVA.smoke], intensity: 1, additive: false, alpha: [0.5, 0], spin: 1 });
  });
  // 4) ERUPTION: a volcanic column of magma and fire bursts up under the target
  const mid = base.clone().setY(base.y + (0.8 + 0.9 * s));
  if (!c.missed) {
    c.impact(0);
    c.target.flash(0xffd080, 300, 0.9);
    impactFx(c, c.target.at(0.4), { strength: 0.7 + 0.8 * s, pal: LAVAPAL, dust: 0x8a7060, stop: big });
  }
  if (big) stage.flash(0xff9040, 0.12 * s, 260);
  stage.shockwave(mid, 0.3 + 0.45 * s, 420);
  stage.chromaPulse(0.002 + 0.005 * s, 350);
  vfx.shake(0.18 + 0.45 * s, 700 + 600 * s);
  vfx.prim.blast(mid, { core: LAVA.yellow, main: 0xff5a0a, dark: 0x3a0e04, radius: 0.8 + 1.1 * s, ms: 900, scaleY: 1.45, rise: 0.5 + 0.8 * s, intensity: 1.0 });
  vfx.prim.shockwave(lift(base), { color: LAVA.orange, radius: 2.4 + 3 * s, facing: 'ground', ms: 650, thickness: 0.22, intensity: 1.4 });
  stage.wait(110).then(() => vfx.prim.shockwave(lift(base), { color: LAVA.yellow, radius: 1.8 + 2 * s, facing: 'ground', ms: 550, thickness: 0.18, intensity: 1.2 }));
  vfx.prim.debris({ from: lift(base, 0.25), count: Math.round(3 + 5 * s), color: LAVA.rock, size: 0.08 + 0.07 * s, speed: 2 + 3 * s, up: 4 + 5 * s, ms: 1300, emissive: 0.45 });
  vfx.burst(mid, { count: Math.round(20 + 40 * s), tex: 'spark', color: [LAVA.white, LAVA.orange], speed: [4, 6 + 8 * s], size: [0.12, 0.26], life: [0.5, 1.0], gravity: 6, drag: 1, intensity: 1.5 });
  // lava bombs rain down around (and onto) the target
  const bombs: Promise<void>[] = [];
  const nb = Math.round(2 + 6 * s);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * TAU + Math.random() * 0.8;
    const d = i === 0 && !c.missed ? 0.4 : 1.4 + Math.random() * (1.2 + 2.6 * s);
    const land = base.clone().add(V(Math.cos(a) * d, 0, Math.sin(a) * d));
    land.y = floorAt(c, land);
    const launch = base.clone().add(V(Math.cos(a) * 0.3, 1.4 + 1.6 * s, Math.sin(a) * 0.3));
    bombs.push(stage.wait(40 + i * (420 / nb)).then(() => lavaBomb(c, launch, land, 560 + Math.random() * 220, 1.6 + 2.8 * s * Math.random() + 1.2 * s, 0.1 + 0.1 * s * (0.6 + Math.random() * 0.6))));
  }
  // the roaring column
  const H = 0.6 + 0.4 * s;
  await during(c, 950, (k, dt) => {
    const fade = 1 - k * 0.75;
    const n = nOf(480 * s * fade + 60, dt);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = R * 0.75 * Math.sqrt(Math.random());
      const hot = r < R * 0.3;
      // a tight column: particles converge slightly as they rise, spread only at the top (drag)
      vfx.particle({ tex: 'flame', pos: base.clone().add(V(Math.cos(a) * r, 0.2 + Math.random() * 0.5, Math.sin(a) * r)), vel: V(Math.cos(a) * 0.35, (7 + Math.random() * 6) * H, Math.sin(a) * 0.35), drag: 0.9, life: 0.5 + Math.random() * 0.3, size: [(0.6 + Math.random() * 0.5) * (0.6 + 0.5 * s), 0.2], color: hot ? [LAVA.white, LAVA.orange] : [LAVA.yellow, LAVA.red], intensity: 1.1, additive: false, alpha: [0.95, 0], rot: (Math.random() - 0.5) * 0.25 });
    }
    // darker magma licks at the edge of the column
    const e = nOf(90 * s * fade, dt);
    for (let i = 0; i < e; i++) {
      const a = Math.random() * TAU;
      vfx.particle({ tex: 'flame', pos: base.clone().add(V(Math.cos(a) * R * 0.8, 0.3, Math.sin(a) * R * 0.8)), vel: V(Math.cos(a) * 0.6, (4 + Math.random() * 4) * H, Math.sin(a) * 0.6), drag: 1, life: 0.55, size: [0.7 * (0.6 + 0.5 * s), 0.2], color: [0xff5a0a, LAVA.deep], intensity: 1.0, additive: false, alpha: [0.8, 0], rot: (Math.random() - 0.5) * 0.3 });
    }
    // molten splashes arc out and fall back
    const m = nOf(70 * s * fade, dt);
    for (let i = 0; i < m; i++) {
      const d = V((Math.random() - 0.5) * 1.2, 1, (Math.random() - 0.5) * 1.2).normalize();
      vfx.particle({ tex: 'drop', pos: base.clone().add(V(0, 0.8 + Math.random() * 1.5 * s, 0)), vel: d.multiplyScalar((5 + Math.random() * 5) * H), acc: V(0, -14, 0), life: 0.9, size: [0.2 + 0.1 * s, 0.1], color: [LAVA.orange, LAVA.deep], intensity: 1.15, additive: false, alpha: [1, 0.6] });
    }
    // black smoke billows from the top of the column
    if (Math.random() < 0.3 + 0.5 * s * fade) vfx.particle({ tex: 'smoke', pos: base.clone().add(V((Math.random() - 0.5) * R * 1.4, (2 + Math.random() * 3) * H * s + 1, (Math.random() - 0.5) * R * 1.4)), vel: V((Math.random() - 0.5), 1.8, (Math.random() - 0.5)), life: 1.4, size: [1.0 + s, 2.6 + 1.6 * s], color: [LAVA.soot, LAVA.smoke], additive: false, alpha: [0.55, 0], fadeIn: 0.25, spin: 0.8 });
    if (!c.missed && Math.random() < 0.25) c.target.shake(0.05 + 0.06 * s, 0.12);
  });
  await Promise.all(bombs);
  // 5) the column collapses into smoke and drifting embers
  stage.setTint(0xffffff, 0, 450);
  vfx.burst(base.clone().setY(base.y + 1.6), { count: Math.round(10 + 16 * s), tex: 'spark', color: [LAVA.yellow, LAVA.orange], speed: [0.5, 2], size: [0.08, 0.15], life: [0.8, 1.2], gravity: -1, drag: 1, intensity: 1.5, jitter: 1.5 });
  vfx.shot('wide', c.side, 500);
  await vfx.wait(300);
});

// =============================================================================================== MIST BALL

const MB = { white: 0xffffff, cream: 0xfff2f6, pink: 0xffc4de, rose: 0xff8abb, lav: 0xe6d2ff };

/** One frame of a fluffy ball of down-like mist at `p` (radius r). */
function fluff(c: MoveFxContext, p: THREE.Vector3, r: number, dt: number, rate = 170) {
  const { vfx } = c;
  const n = nOf(rate, dt);
  for (let i = 0; i < n; i++) {
    const d = rndUnit().multiplyScalar(r * 0.5 * Math.cbrt(Math.random()));
    vfx.particle({ tex: 'smoke', pos: p.clone().add(d.clone().multiplyScalar(1.6)), vel: d.clone().multiplyScalar(1.4), life: 0.2, size: [r * 0.8, r * 1.1], color: [MB.white, MB.pink], intensity: 1.0, additive: false, alpha: [0.7, 0], spin: 2 });
  }
  if (Math.random() < 0.3) {
    const d = rndUnit();
    vfx.particle({ tex: 'feather', pos: p.clone().addScaledVector(d, r * 0.8), vel: d.multiplyScalar(0.8), life: 0.3, size: [r * 0.7, r * 0.4], color: [MB.white, MB.pink], intensity: 1.05, additive: false, alpha: [0.95, 0], spin: 4 });
  }
  vfx.particle({ tex: 'glow', pos: p.clone(), life: 0.05, size: r * 3.2, color: MB.rose, intensity: 0.45, alpha: [0.45, 0] });
}

registerMoveFx('MIST_BALL', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('side', c.side, 400);
  // 1) downy mist and feathers swirl together into a soft ball in front of the user
  sp.setOutline(1.2, MB.rose);
  const orbAt = sp.at(0.6).addScaledVector(c.dir, 0.95).add(V(0, 0.25, 0));
  const ball = vfx.prim.blob({ color: 0xffd0e6, radius: 0.52, opacity: 0.7, emissive: 0.75, roughness: 1 });
  ball.mesh.position.copy(orbAt);
  ball.mesh.castShadow = false;
  const grow = ball.grow(520, 1);
  await during(c, 560, (k, dt) => {
    const n = nOf(45, dt);
    for (let i = 0; i < n; i++) {
      const d = rndUnit().multiplyScalar(1.4 + Math.random() * 0.8);
      const tex = Math.random() < 0.4 ? 'feather' : 'smoke';
      vfx.particle({ tex, pos: orbAt.clone().add(d), vel: d.clone().multiplyScalar(-1.6), swirl: { center: orbAt, speed: 3 }, life: 0.45, size: tex === 'smoke' ? [0.6, 0.25] : [0.32, 0.15], color: [MB.white, MB.pink], intensity: 1.0, additive: false, alpha: [0.8, 0.3], fadeIn: 0.3, spin: 3 });
    }
    if (Math.random() < 0.5) vfx.particle({ tex: 'dot', pos: orbAt.clone().add(rndUnit().multiplyScalar(1.2)), vel: V(), attract: { to: orbAt, strength: 14 }, life: 0.4, size: [0.1, 0.04], color: [MB.white, MB.rose], intensity: 1.4 });
    fluff(c, orbAt, 0.15 + 0.5 * ease.outCubic(k), dt, 60 + 60 * k);
  });
  await grow;
  // 2) the mist ball floats swiftly to the target, shedding down and feathers
  const to = c.aim(0.55);
  const perp = upPerp(orbAt, to);
  let prev = orbAt.clone();
  await during(c, 500, (k, dt) => {
    const p = arcAt(orbAt, to, perp, 0.7, ease.inOutQuad(k));
    ball.mesh.position.copy(p);
    fluff(c, p, 0.62, dt, 120);
    emitAlong(prev, p, 0.3, (q) => {
      if (Math.random() < 0.5) vfx.particle({ tex: 'smoke', pos: q.clone().add(rndUnit().multiplyScalar(0.25)), vel: V(0, 0.3, 0), life: 0.5, size: [0.5, 0.9], color: [MB.cream, MB.pink], intensity: 1.0, additive: false, alpha: [0.3, 0], spin: 1 });
      if (Math.random() < 0.7) vfx.particle({ tex: 'feather', pos: q.clone().add(rndUnit().multiplyScalar(0.35)), vel: V((Math.random() - 0.5) * 0.6, -0.4, (Math.random() - 0.5) * 0.6), drag: 1, life: 0.9, size: [0.28, 0.2], color: [MB.white, MB.pink], intensity: 1.0, additive: false, alpha: [0.95, 0], spin: 3 });
      if (Math.random() < 0.5) vfx.particle({ tex: 'dot', pos: q.clone().add(rndUnit().multiplyScalar(0.4)), vel: V(0, 0.4, 0), life: 0.5, size: [0.1, 0.03], color: [MB.white, MB.rose], intensity: 1.4 });
    });
    prev = p;
  });
  ball.dispose();
  sp.setOutline(0);
  // 3) it bursts into a soft cloud of mist and down
  const z = camScale(c, to);
  if (!c.missed) {
    c.impact(0);
    c.target.flash(MB.rose, 400, 0.6);
    c.target.shake(0.1, 0.3);
    softHit(c, to, { core: MB.pink, main: MB.rose }, 0.6 * z);
    stage.shockwave(to, 0.4, 300);
    vfx.shake(0.14, 300);
  }
  vfx.prim.shockwave(to, { color: MB.rose, radius: 2.2 * z, ms: 420, thickness: 0.14, intensity: 1.0 });
  for (let i = 0; i < 26; i++) {
    const d = rndUnit();
    vfx.particle({ tex: 'smoke', pos: to.clone().addScaledVector(d, 0.2), vel: d.multiplyScalar((1.5 + Math.random() * 2.5) * z), drag: 2.4, life: 0.9 + Math.random() * 0.4, size: [0.7 * z, 2.0 * z], color: [MB.pink, i % 3 ? MB.rose : MB.lav], intensity: 0.98, additive: false, alpha: [0.65, 0], spin: 1.5 });
  }
  for (let i = 0; i < 20; i++) {
    const d = rndUnit();
    d.y = Math.abs(d.y) * 0.8;
    vfx.particle({ tex: 'feather', pos: to.clone(), vel: d.multiplyScalar(2.5 + Math.random() * 2.5), acc: V(0, -1.2, 0), drag: 2.2, life: 1.1 + Math.random() * 0.5, size: [0.34 * z, 0.28 * z], color: [MB.white, MB.pink], intensity: 1.0, additive: false, alpha: [1, 0], spin: 5 });
  }
  vfx.burst(to, { count: 16, tex: 'dot', color: [MB.white, MB.rose], speed: [1.5, 4], size: [0.08, 0.14], life: [0.5, 0.8], drag: 2, intensity: 1.4 });
  // 4) the mist hangs around the target, then thins out
  await during(c, 650, (k) => {
    if (Math.random() < 0.7 * (1 - k)) vfx.particle({ tex: 'smoke', pos: to.clone().add(V((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.2)), vel: V(0, -0.2, 0), life: 0.9, size: [0.9 * z, 1.8 * z], color: [MB.pink, MB.lav], intensity: 0.98, additive: false, alpha: [0.35, 0], fadeIn: 0.3, spin: 0.6 });
  });
  vfx.shot('wide', c.side, 500);
  await vfx.wait(150);
});

// =============================================================================================== LUSTER PURGE

const LP = { white: 0xffffff, ice: 0xdaf0ff, sky: 0x8ac4ff, blue: 0x3a7cff, deep: 0x1a3aa0 };
const LPPAL = { core: 0xd8ecff, main: 0x4a8cff, dark: 0x1a3a8a };

registerMoveFx('LUSTER_PURGE', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  // 1) motes of light gather into a dazzling core before the user's chest
  pulledShot(c, 'user', 1.5, 0.6, 420);
  sp.setOutline(1.3, LP.sky);
  stage.setTint(0xc8e0ff, 0.08, 400);
  const src = sp.at(0.58).addScaledVector(c.dir, 0.8);
  let lastRing = -1000;
  let sideCam = false;
  await during(c, 700, (k, dt, el) => {
    const n = nOf(70, dt);
    for (let i = 0; i < n; i++) {
      const d = rndUnit().multiplyScalar(1.6 + Math.random() * 1.0);
      const q = src.clone().add(d);
      vfx.particle({ tex: 'streak', pos: q, vel: d.clone().multiplyScalar(-3.2), life: 0.3, size: [0.6, 0.2], color: [LP.white, LP.sky], intensity: 1.1, alpha: [0, 1], rot: screenAngle(c, q, src) });
    }
    if (Math.random() < 0.5) vfx.particle({ tex: 'star', pos: src.clone().add(rndUnit().multiplyScalar(0.6 + Math.random())), life: 0.25, size: [0.05, 0.4], color: LP.white, intensity: 1.2, alpha: [1, 0], spin: 2 });
    if (el - lastRing > 200) {
      lastRing = el;
      vfx.prim.shockwave(src, { color: LP.sky, startRadius: 1.4, radius: 0.2, ms: 240, thickness: 0.1, intensity: 0.9 });
    }
    vfx.particle({ tex: 'glow', pos: src, life: 0.06, size: 0.3 + 0.9 * k, color: LP.blue, intensity: 0.6 + 0.3 * k, alpha: [0.7, 0] });
    vfx.particle({ tex: 'star', pos: src, life: 0.06, size: 0.3 + 0.7 * k, color: LP.ice, intensity: 0.9, alpha: [0.9, 0], rot: el / 300 });
    if (!sideCam && el > 380) {
      sideCam = true;
      vfx.shot('side', c.side, 320);
    }
  });
  // 2) it is released as a purging beam of white-blue luster, wrapped in spiralling rays
  const to = c.aim(0.5);
  const fwd = to.clone().sub(src).normalize();
  stage.flash(LP.ice, 0.1, 180);
  stage.chromaPulse(0.004, 300);
  vfx.shake(0.14, 500);
  void sp.knockback(c.foe, 0.25, 400);
  vfx.particle({ tex: 'star', pos: towardCam(c, src, 0.3), life: 0.35, size: [2.2, 0.6], color: LP.ice, intensity: 1.0, alpha: [1, 0], rot: 0.3, spin: 1.5 });
  const beam = vfx.prim.beam(src, to, { color: LP.blue, core: LP.sky, width: 0.2, holdMs: 460, growMs: 150, fadeMs: 260, intensity: 0.85, noise: 0.35, wobble: 0.1 });
  vfx.prim.beam(src, to, { color: LP.ice, core: LP.white, width: 0.05, holdMs: 440, growMs: 150, fadeMs: 200, intensity: 0.6, noise: 0.2 });
  const { fwd: camFwd } = camBasis(c);
  const s1 = new THREE.Vector3().crossVectors(fwd, camFwd).normalize();
  const s2 = new THREE.Vector3().crossVectors(fwd, s1).normalize();
  for (const ph of [0, Math.PI]) {
    const pts = Array.from({ length: 48 }, (_, i) => {
      const t = i / 47;
      const a = t * Math.PI * 9 + ph;
      const r = 0.3 + 0.25 * t;
      return src.clone().lerp(to, t).addScaledVector(s1, Math.cos(a) * r).addScaledVector(s2, Math.sin(a) * r);
    });
    vfx.prim.ribbon(pts, { color: LP.sky, core: LP.white, width: 0.05, ms: 170, length: 1, holdMs: 330, fadeMs: 240, intensity: 0.85 });
  }
  let lastR = -1000;
  const glints = during(c, 620, (_k, _dt, el) => {
    for (let i = 0; i < 2; i++) {
      const f = Math.random() * Math.min(1, el / 150);
      const p = src.clone().lerp(to, f).add(rndUnit().multiplyScalar(0.35));
      vfx.particle({ tex: Math.random() < 0.5 ? 'star' : 'spark', pos: p, vel: rndUnit().multiplyScalar(0.8), life: 0.3, size: [0.28, 0.05], color: [LP.white, LP.sky], intensity: 1.2, alpha: [1, 0], spin: 3 });
    }
    if (el - lastR > 90 && el < 520) {
      lastR = el;
      const sw = vfx.prim.shockwave(src, { color: LP.sky, radius: 0.85, startRadius: 0.45, ms: 260, thickness: 0.1, facing: fwd, intensity: 0.9 });
      void during(c, 260, (k) => sw.mesh.position.lerpVectors(src, to, k));
    }
  });
  await beam.arrived;
  // 3) a purging burst of light at the target
  const z = camScale(c, to);
  if (!c.missed) {
    c.impact(0);
    c.target.flash(LP.sky, 350, 0.6);
    impactFx(c, to, { strength: 1.0, pal: LPPAL, stop: true, dust: 0xc8d8f0 });
  } else whiff(c, to, LP.sky);
  stage.shockwave(to, 0.4, 350);
  vfx.prim.energyBlast(to, { color: LP.blue, core: LP.sky, radius: 1.1 * z, ms: 460, intensity: 0.55 });
  for (let i = 0; i < 3; i++) stage.wait(i * 90).then(() => vfx.prim.shockwave(to, { color: i % 2 ? LP.sky : LP.white, radius: (1.7 + i * 0.6) * z, ms: 420, thickness: 0.1, intensity: 1.0 }));
  const base = c.missed ? groundAt(c) : c.foeFeet.clone();
  vfx.prim.shockwave(lift(base), { color: LP.sky, radius: 2.8, facing: 'ground', ms: 550, thickness: 0.16, intensity: 1.0 });
  vfx.burst(to, { count: 16, tex: 'star', color: [LP.white, LP.sky], speed: [2, 6], size: [0.2, 0.35], life: [0.4, 0.7], drag: 2, intensity: 1.1 });
  // 4) glittering motes drift up as the light fades
  const motesUp = during(c, 650, (k) => {
    if (Math.random() < 0.8 * (1 - k)) vfx.particle({ tex: Math.random() < 0.3 ? 'star' : 'dot', pos: base.clone().add(V((Math.random() - 0.5) * 1.8, 0.3 + Math.random() * 2, (Math.random() - 0.5) * 1.8)), vel: V(0, 0.9 + Math.random() * 0.8, 0), life: 0.8, size: [0.14, 0.04], color: [LP.white, LP.sky], intensity: 1.3, alpha: [1, 0], fadeIn: 0.2 });
  });
  await Promise.all([beam.done, glints]);
  sp.setOutline(0);
  stage.setTint(0xffffff, 0, 400);
  vfx.shot('wide', c.side, 500);
  await motesUp;
});

// =============================================================================================== BLAZE KICK

const BK = { white: 0xfff6d0, yellow: 0xffd040, orange: 0xff7a10, red: 0xd82a06 };
const BKPAL = { core: 0xfff2a0, main: 0xff6a1a, dark: 0x6a1a08 };

registerMoveFx('BLAZE_KICK', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('side', c.side, 350);
  // 1) the leg bursts into flame
  const foot = () => sp.at(0.22).addScaledVector(c.dir, 0.35);
  sp.setOutline(1.3, BK.orange);
  await during(c, 360, (k, dt) => {
    const n = nOf(110, dt);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const p = foot().add(V(Math.cos(a) * 0.3, (Math.random() - 0.5) * 0.3, Math.sin(a) * 0.3));
      vfx.particle({ tex: 'flame', pos: p, vel: V(0, 2 + k * 1.5, 0), life: 0.3, size: [0.35 + k * 0.25, 0.05], color: [BK.yellow, BK.red], intensity: 1.15, additive: false, alpha: [0.95, 0], rot: 0 });
    }
    vfx.particle({ tex: 'glow', pos: foot(), life: 0.06, size: 0.6 + k * 0.6, color: BK.orange, intensity: 0.9, alpha: [0.7, 0] });
  });
  // 2) dash in, the blazing foot trailing fire
  const D = gapDist(c, 1.0);
  const trail = during(c, 330, () => {
    const p = foot();
    for (let i = 0; i < 3; i++) vfx.particle({ tex: 'flame', pos: p.clone().add(rndUnit().multiplyScalar(0.15)), vel: V(0, 1.4, 0), life: 0.3, size: [0.55, 0.1], color: [BK.yellow, BK.red], intensity: 1.15, additive: false, alpha: [0.9, 0] });
  });
  await slideTo(c, -0.25, 120, ease.outQuad);
  vfx.dust(c.userFeet, DUST, 7);
  let gn = 0;
  void during(c, 110, () => void (gn++ < 2 && ghost(c, 0xffa060, 0.35, 260)));
  await slideTo(c, D, 150, ease.inCubic);
  // 3) the high kick: a crescent of fire sweeps up through the target
  const at = c.aim(0.45);
  const z = camScale(c, at);
  // a crescent around the user's hip, sweeping from below up through the target (screen plane)
  const { right, up } = camBasis(c);
  const hip = towardCam(c, sp.at(0.4), 1.3);
  const tgt = towardCam(c, at, 1.3);
  const off = tgt.clone().sub(hip);
  const phiT = Math.atan2(off.dot(up), off.dot(right));
  const R = Math.max(1.5 * z, Math.hypot(off.dot(right), off.dot(up)));
  const sweepSign = Math.cos(phiT) >= 0 ? 1 : -1;
  const pts = Array.from({ length: 13 }, (_, i) => {
    const phi = phiT + sweepSign * (-1.35 + (2.5 * i) / 12);
    return hip.clone().addScaledVector(right, Math.cos(phi) * R).addScaledVector(up, Math.sin(phi) * R);
  });
  sp.hop = 0;
  void sp.jump(0.35, 260);
  const r = topStroke(c, pts, { color: BK.orange, core: BK.white, width: 0.24 * z, ms: 150, length: 0.95, holdMs: 140, fadeMs: 260, intensity: 1.1, edge: 0x3a0a02, edgeAlpha: 0.5, e: ease.inQuad });
  const arcCurve = new THREE.CatmullRomCurve3(pts);
  let prevH = pts[0].clone();
  const sweep = during(c, 160, () => {
    const h = r.headPos();
    emitAlong(prevH, h, 0.12, (q) => {
      for (let i = 0; i < 2; i++) vfx.particle({ tex: 'flame', pos: q.clone().add(rndUnit().multiplyScalar(0.15)), vel: V(0, 1.8, 0).add(rndUnit().multiplyScalar(0.8)), life: 0.45, size: [0.75 * z, 0.15], color: [BK.yellow, BK.red], intensity: 1.15, additive: false, alpha: [0.95, 0] });
    });
    prevH = h;
  });
  await r.arrived;
  if (c.missed) whiff(c, at, BK.orange);
  else {
    c.impact(0);
    impactFx(c, at, { strength: 1.3, pal: BKPAL, stop: true });
    c.target.flash(BK.orange, 300, 0.7);
    stage.flash(BK.orange, 0.18, 160);
    const p = towardCam(c, at, 0.4);
    // ring of fire bursting out of the contact point (screen plane)
    for (let i = 0; i < 30; i++) {
      const d = screenDir(c, (i / 30) * TAU).addScaledVector(c.dir, 0.2);
      vfx.particle({ tex: 'flame', pos: p.clone(), vel: d.multiplyScalar((4.5 + Math.random() * 2) * z), drag: 3, life: 0.42, size: [0.5 * z, 0.9 * z], color: [BK.yellow, BK.red], intensity: 1.15, additive: false, alpha: [0.95, 0] });
    }
    vfx.burst(p, { count: 22, tex: 'spark', color: [BK.white, 0xff5010], speed: [4, 9], size: [0.12, 0.24], life: [0.3, 0.6], gravity: 5, intensity: 1.5 });
    vfx.shake(0.3, 380);
  }
  // flames linger along the arc and on the target
  const linger = during(c, 300, (k, dt) => {
    const n = nOf(120 * (1 - k), dt);
    for (let i = 0; i < n; i++) vfx.particle({ tex: 'flame', pos: arcCurve.getPointAt(Math.random()), vel: V(0, 1.6, 0), life: 0.3, size: [0.45 * z, 0.08], color: [BK.yellow, BK.red], intensity: 1.1, additive: false, alpha: [0.8, 0] });
  });
  const burn = c.missed ? Promise.resolve() : burnOn(c, c.target.at(0.45), 480, { rate: 0.9, radius: 0.45 });
  await Promise.all([sweep, vfx.wait(120)]);
  sp.setOutline(0);
  await slideTo(c, 0, 320);
  await Promise.all([linger, burn, trail]);
  sp.body.position.set(0, 0, 0);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(150);
});

// =============================================================================================== FLY

const FLY = { white: 0xffffff, sky: 0xd0e0ff, main: 0x9ab4f0, deep: 0x5a70b0 };
const FLYPAL = { core: 0xe8f0ff, main: 0x88a8f0, dark: 0x6070a0 };

/** Wind streaks rushing along `dir` around `p` (vertical rise, dive). */
function windStreaks(c: MoveFxContext, p: THREE.Vector3, dir: THREE.Vector3, n: number, radius = 0.8, speed = 14, size = 1.4) {
  const d = dir.clone().normalize();
  for (let i = 0; i < n; i++) {
    const q = p.clone().add(V((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).multiplyScalar(radius));
    c.vfx.particle({ tex: 'streak', pos: q, vel: d.clone().multiplyScalar(speed * (0.7 + Math.random() * 0.6)), life: 0.16 + Math.random() * 0.08, size: [size, size * 0.5], color: FLY.white, intensity: 0.95, alpha: [0.7, 0], rot: screenAngle(c, q, q.clone().add(d)) });
  }
}

registerMoveFx('FLY', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const b = sp.body.position;
  const R = Math.max(0.8, sp.width * 0.5);
  if (c.phase === 'charge') {
    // turn 1: wind gathers under the wings, then the user shoots up into the sky and out of sight
    pulledShot(c, 'user', 1.75, 1.9, 450);
    sp.setOutline(1.2, FLY.main);
    let lastRing = -1000;
    await during(c, 460, (k, dt, el) => {
      const n = nOf(40, dt);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const q = c.userFeet.clone().add(V(Math.cos(a) * R * 1.6, 0.15 + Math.random() * 0.6, Math.sin(a) * R * 1.6));
        vfx.particle({ tex: 'streak', pos: q, vel: V(-Math.cos(a) * 1.5, 0.6, -Math.sin(a) * 1.5), swirl: { center: c.userFeet, speed: 4 }, life: 0.35, size: [0.9, 0.4], color: FLY.white, intensity: 1.1, alpha: [0.7, 0], rot: screenAngle(c, q, q.clone().add(V(-Math.sin(a), 0, Math.cos(a)))) });
      }
      if (el - lastRing > 150) {
        lastRing = el;
        vfx.prim.shockwave(lift(c.userFeet), { color: FLY.sky, radius: R * 2.4, startRadius: R * 0.8, facing: 'ground', ms: 400, thickness: 0.14, intensity: 0.9 });
        vfx.dust(c.userFeet, DUST, 3);
      }
      b.y = -0.12 * ease.outQuad(k);
    });
    // take-off
    vfx.dust(c.userFeet, DUST, 16);
    vfx.prim.shockwave(lift(c.userFeet), { color: FLY.white, radius: R * 3.2, facing: 'ground', ms: 500, thickness: 0.2, intensity: 1.2 });
    vfx.burst(c.userFeet.clone().setY(c.userFeet.y + 0.3), { count: 10, tex: 'feather', color: [FLY.white, 0xd8d0c0], speed: [2, 4], dir: UP, spread: 1.2, size: [0.25, 0.4], life: [0.7, 1.0], gravity: 1.2, drag: 2.5, additive: false, spin: 5 });
    stage.shockwave(sp.at(0.5), 0.35, 300);
    const H = 11;
    let prevC = sp.at(0.5);
    let fr = 0;
    await during(c, 420, (k) => {
      b.y = H * ease.inQuad(k);
      const p = sp.at(0.5);
      emitAlong(prevC, p, 0.45, (q) => windStreaks(c, q, V(0, -1, 0), 1, R * 0.6, 6, 1.4));
      if (fr++ % 2 === 0 && k < 0.7) ghost(c, FLY.sky, 0.22, 240);
      prevC = p;
    });
    // a glint high in the sky where it vanished
    sp.group.visible = false;
    b.set(0, 0, 0);
    sp.setOutline(0);
    const glint = c.userFeet.clone().add(V(0, Math.max(3.2, sp.height + 2.0), 0));
    vfx.particle({ tex: 'star', pos: towardCam(c, glint, 0.5), life: 0.45, size: [0.4, 2.0], color: FLY.white, intensity: 1.3, alpha: [1, 0], spin: 4 });
    vfx.prim.shockwave(glint, { color: FLY.sky, radius: 1.3, ms: 320, thickness: 0.1, intensity: 1.0 });
    vfx.burst(glint, { count: 6, tex: 'feather', color: [FLY.white, 0xd8d0c0], speed: [0.5, 1.5], size: [0.25, 0.35], life: [0.8, 1.1], gravity: 0.8, drag: 1.5, additive: false, spin: 4 });
    await vfx.wait(380);
    vfx.shot('wide', c.side, 500);
    await vfx.wait(200);
    return;
  }
  // turn 2: the user is up in the sky (hidden since the charge turn); if not, whoosh it up first
  if (sp.group.visible) {
    vfx.dust(c.userFeet, DUST, 10);
    let prevC = sp.at(0.5);
    await during(c, 240, (k) => {
      b.y = 10 * ease.inQuad(k);
      const p = sp.at(0.5);
      emitAlong(prevC, p, 0.4, (q) => windStreaks(c, q, V(0, -1, 0), 1, R * 0.5, 6, 1.4));
      prevC = p;
    });
    sp.group.visible = false;
  }
  // frame the sky over the target; a glint and whistling wind warn of the dive
  pulledShot(c, 'foe', 2.0, 1.6, 400);
  const D = gapDist(c, 0.9);
  const hEnd = Math.max(0, c.target.height * 0.3 - sp.height * 0.2);
  const H2 = 3.0 + c.target.height * 0.35;
  const startB = c.dir.clone().multiplyScalar(D * 0.7).setY(H2);
  const endB = c.dir.clone().multiplyScalar(D).setY(hEnd);
  b.copy(startB);
  await vfx.wait(260);
  const glint = sp.at(0.5);
  vfx.particle({ tex: 'star', pos: towardCam(c, glint, 0.4), life: 0.4, size: [0.4, 1.9], color: FLY.white, intensity: 1.3, alpha: [1, 0], spin: 4 });
  vfx.prim.shockwave(glint, { color: FLY.sky, radius: 1.4, ms: 300, thickness: 0.1, intensity: 1.0 });
  windStreaks(c, glint.clone().lerp(c.aim(0.5), 0.5), c.aim(0.5).sub(glint), 6, 0.9, 10, 1.6);
  await vfx.wait(160);
  // the dive: afterimages, wind streaks and cone rings along the path
  sp.group.visible = true;
  sp.setOutline(1.3, FLY.main);
  const diveDir = endB.clone().sub(startB).normalize();
  const sx = Math.cos(screenAngle(c, sp.at(0.5), sp.at(0.5).add(diveDir))) >= 0 ? 1 : -1;
  let prev = sp.at(0.5);
  let n = 0;
  let lastCone = -1000;
  await during(c, 280, (k, _dt, el) => {
    const e = ease.inQuad(k);
    b.lerpVectors(startB, endB, e);
    sp.mesh.rotation.z = -sx * 0.4 * Math.min(1, k * 3);
    const p = sp.at(0.5);
    emitAlong(prev, p, 0.35, (q) => windStreaks(c, q, diveDir, 1, R * 0.7, 8, 1.6));
    if (n++ % 2 === 0) ghost(c, FLY.sky, 0.26, 220);
    if (el - lastCone > 70) {
      lastCone = el;
      vfx.prim.shockwave(p.clone().addScaledVector(diveDir, 0.6), { color: FLY.white, radius: 1.2, startRadius: 0.5, ms: 220, thickness: 0.1, facing: diveDir, intensity: 0.9 });
    }
    prev = p;
  });
  speedLines(c, c.aim(0.5).addScaledVector(diveDir, -1.2), diveDir, { count: 12, radius: 1.0, speed: 18, color: FLY.white });
  sp.setOutline(0);
  const at = c.aim(0.5);
  if (c.missed) {
    whiff(c, at, FLY.sky);
    vfx.dust(sp.at(0), DUST, 14);
  } else {
    c.impact(0);
    impactFx(c, at, { strength: 1.1, pal: FLYPAL, stop: true });
    c.target.flash(0xffffff, 250, 0.5);
    vfx.burst(at, { count: 14, tex: 'feather', color: [FLY.white, 0xe0d8c8], speed: [2, 5], size: [0.25, 0.4], life: [0.7, 1.1], gravity: 1.2, drag: 2.5, additive: false, spin: 5 });
    vfx.prim.shockwave(lift(c.foeFeet), { color: FLY.sky, radius: 3.2, facing: 'ground', ms: 480, thickness: 0.16, intensity: 1.1 });
    vfx.shake(0.35, 450);
  }
  await vfx.wait(200);
  // swoop back up and glide home to its platform
  vfx.shot('wide', c.side, 600);
  const from = b.clone();
  await during(c, 520, (k) => {
    const e = ease.inOutQuad(k);
    b.set(from.x * (1 - e), from.y * (1 - e) + Math.sin(k * Math.PI) * 1.6, from.z * (1 - e));
    sp.mesh.rotation.z = -sx * 0.4 * (1 - k) + sx * 0.25 * Math.sin(k * Math.PI);
  });
  b.set(0, 0, 0);
  sp.mesh.rotation.z = 0;
  sp.group.visible = true;
  vfx.dust(c.userFeet, DUST, 8);
  await vfx.wait(200);
});

// =============================================================================================== MUDDY WATER

const MW = { froth: 0xd8c49a, light: 0xa8844e, main: 0x7a5a30, deep: 0x4a3418, dark: 0x2a1c0c };

/** Muddy splash: brown droplets thrown out with gravity, froth puffs, a few clods. */
function mudSplash(c: MoveFxContext, at: THREE.Vector3, k = 1, bias?: THREE.Vector3) {
  const { vfx } = c;
  const b = bias ? bias.clone().multiplyScalar(0.5) : V();
  for (let i = 0; i < Math.round(32 * k); i++) {
    const d = V((Math.random() - 0.5) * 2, 0.4 + Math.random() * 1.2, (Math.random() - 0.5) * 2).add(b).normalize();
    vfx.particle({ tex: 'drop', pos: at.clone(), vel: d.multiplyScalar((3 + Math.random() * 4) * Math.sqrt(k)), acc: V(0, -12, 0), drag: 0.5, life: 0.5 + Math.random() * 0.3, size: [0.18 + Math.random() * 0.16, 0.07], color: [MW.light, MW.deep], intensity: 1.05, additive: false, alpha: [1, 0.3] });
  }
  vfx.burst(at, { count: Math.round(9 * k), tex: 'smoke', color: [MW.froth, MW.light], speed: [1, 2.5], size: [0.5 * k, 0.9 * k], endSize: 1.6 * k, life: [0.4, 0.7], additive: false, alpha: [0.65, 0], drag: 3, intensity: 1 });
  vfx.burst(at, { count: Math.round(6 * k), tex: 'rock', color: [MW.main, MW.dark], speed: [2, 5], size: [0.1, 0.2], life: [0.5, 0.8], gravity: 12, additive: false, spin: 8, intensity: 1 });
}

registerMoveFx('MUDDY_WATER', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  // film the torrent side-on (camera perpendicular to its path, on the camera's side)
  const midF = c.userFeet.clone().lerp(c.foeFeet, 0.5);
  const perp = V(-c.dir.z, 0, c.dir.x);
  if (perp.dot(stage.camera.position.clone().sub(midF)) < 0) perp.negate();
  stage.director.move({ pos: midF.clone().addScaledVector(perp, 10.5).add(V(0, 2.6, 0)), look: midF.clone().add(V(0, 1.2, 0)), fov: 44 }, 0.45);
  const ground = Math.min(c.userFeet.y, c.foeFeet.y) - 0.25;
  const hitAt = c.aim(0.5);
  const landAt = c.missed ? hitAt.clone().setY(ground) : c.foeFeet.clone().setY(ground);
  const start = c.userFeet.clone().setY(ground).addScaledVector(c.dir, 0.2);
  // 1) the user stamps; muddy water wells up from the ground in front of it
  sp.setOutline(1.1, MW.light);
  void sp.jump(0.25, 220);
  let lastRing = -1000;
  await during(c, 420, (k, dt, el) => {
    if (el - lastRing > 140) {
      lastRing = el;
      vfx.prim.shockwave(lift(c.userFeet.clone().addScaledVector(c.dir, 0.8)), { color: MW.froth, radius: 1.2 + k * 1.4, facing: 'ground', ms: 450, thickness: 0.2, intensity: 0.8 });
    }
    const n = nOf(80, dt);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const r = 0.5 + Math.random() * 1.1;
      const q = c.userFeet.clone().addScaledVector(c.dir, 0.9).add(V(Math.cos(a) * r, 0.1, Math.sin(a) * r));
      vfx.particle({ tex: 'drop', pos: q, vel: V(0, 2 + Math.random() * 2.5 * (0.5 + k), 0), acc: V(0, -8, 0), life: 0.5, size: [0.17, 0.07], color: [MW.light, MW.main], intensity: 1.05, additive: false, alpha: [0.95, 0.3] });
    }
    if (Math.random() < 0.4) vfx.dust(c.userFeet.clone().addScaledVector(c.dir, 0.8), MW.light, 1);
  });
  // 2) it heaves up into a churning brown wave that rolls across the field
  const H = 2.5;
  const wave = vfx.prim.wave({ color: MW.main, core: MW.froth, dark: MW.dark, width: 5.2 });
  wave.mesh.position.copy(start);
  wave.mesh.lookAt(start.clone().add(c.dir));
  wave.u.height.value = H * 0.9;
  wave.u.curl.value = 1.2;
  const reach = wave.lip(0).sub(start).dot(c.dir);
  const end = landAt.clone().addScaledVector(c.dir, -reach);
  wave.u.height.value = 0;
  wave.u.curl.value = 0.2;
  const spray = (amt: number) => {
    for (let i = 0; i < Math.round(6 * amt + Math.random()); i++) {
      const x = (Math.random() - 0.5) * 0.85;
      const p = Math.random() < 0.5 ? wave.crest(x) : wave.lip(x);
      const v = c.dir.clone().multiplyScalar(2 + Math.random() * 2.5).add(V(0, 1.2 + Math.random() * 2, 0));
      if (Math.random() < 0.4) vfx.particle({ tex: 'smoke', pos: p, vel: v.clone().multiplyScalar(0.6), acc: V(0, -3, 0), drag: 1, life: 0.5, size: [0.4, 1.0], color: [MW.froth, MW.light], intensity: 1.03, additive: false, alpha: [0.75, 0], spin: 2 });
      vfx.particle({ tex: 'drop', pos: p, vel: v, acc: V(0, -12, 0), life: 0.55, size: [0.18, 0.08], color: [MW.light, MW.main], intensity: 1.05, additive: false });
      if (Math.random() < 0.15) vfx.particle({ tex: 'rock', pos: p, vel: v, acc: V(0, -14, 0), life: 0.6, size: [0.14, 0.1], color: MW.deep, intensity: 1, additive: false, spin: 6 });
    }
  };
  const churn = (amt: number) => {
    for (let i = 0; i < Math.round(3 * amt + Math.random()); i++) {
      const q = wave.mesh.localToWorld(V((Math.random() - 0.5) * 4.5, 0.3, 0.2 + Math.random() * 0.4));
      vfx.particle({ tex: 'smoke', pos: q, vel: c.dir.clone().multiplyScalar(2.5).add(V(0, 0.5, 0)), drag: 1.5, life: 0.45, size: [0.5, 1.0], color: [MW.froth, MW.light], additive: false, alpha: [0.5, 0], intensity: 1 });
    }
  };
  void sp.lunge(c.foe, 0.4, 360);
  await during(c, 380, (k) => {
    wave.u.height.value = H * ease.outCubic(k);
    wave.u.curl.value = 0.2 + 0.25 * k;
    spray(0.3 + 0.7 * k);
    churn(k);
  });
  sp.setOutline(0);
  let crashed = false;
  await during(c, 760, (k) => {
    const kk = ease.inOutQuad(k);
    wave.mesh.position.copy(start).lerp(end, kk);
    wave.u.height.value = H * (1 + 0.06 * Math.sin(k * Math.PI));
    wave.u.curl.value = 0.45 + 0.75 * ease.inQuad(k);
    spray(1);
    churn(1);
    if (!crashed && kk > 0.85) {
      crashed = true;
      if (!c.missed) {
        c.impact(0);
        c.target.flash(MW.light, 400, 0.75);
        c.target.shake(0.2, 0.5);
      }
      vfx.shake(0.4, 550);
      stage.shockwave(hitAt, 0.55, 350);
    }
  });
  // 3) the lip crashes down: a burst of mud, froth and clods over the target
  mudSplash(c, hitAt, 1.5, c.dir);
  vfx.prim.blast(hitAt, { core: MW.froth, main: MW.light, dark: MW.deep, radius: 1.5, ms: 800, rise: 0.3, intensity: 0.95, disp: 0.8 });
  for (let i = 0; i < 36; i++) {
    const d = V((Math.random() - 0.5) * 1.4, 1, (Math.random() - 0.5) * 1.4).addScaledVector(c.dir, 0.6).normalize();
    const bigP = i % 3 === 0;
    vfx.particle({ tex: bigP ? 'smoke' : 'drop', pos: landAt.clone().add(V((Math.random() - 0.5) * 2.2, 0.6, (Math.random() - 0.5) * 2.2)), vel: d.multiplyScalar(4 + Math.random() * 4.5), acc: V(0, -11, 0), drag: 1, life: 0.8, size: bigP ? [0.8, 1.5] : [0.3, 0.12], color: bigP ? [MW.froth, MW.light] : [MW.light, MW.deep], intensity: 1.03, additive: false, alpha: [0.85, 0], spin: 2 });
  }
  await during(c, 420, (k) => {
    wave.u.height.value = H * (1 - ease.inQuad(k));
    wave.u.curl.value = 1.2 + 0.45 * k;
    wave.u.alpha.value = 1 - ease.inQuad(k);
    wave.mesh.position.addScaledVector(c.dir, 0.03);
    spray(0.5 * (1 - k));
    churn(1 - k);
  });
  wave.dispose();
  // 4) the mud washes out over the ground; the target is left dripping (accuracy down)
  const feet = landAt.clone().setY(c.foeFeet.y + 0.05);
  for (let i = 0; i < 3; i++) stage.wait(i * 130).then(() => vfx.prim.shockwave(feet, { color: MW.froth, radius: 2.0 + i * 1.1, facing: 'ground', ms: 620, thickness: 0.2, intensity: 0.8 }));
  vfx.prim.crack(feet, { radius: 1.8, ms: 900, color: MW.deep, opacity: 0.5, branches: 6 });
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * TAU;
    const d = V(Math.cos(a), 0, Math.sin(a)).addScaledVector(c.dir, 0.7).normalize();
    vfx.particle({ tex: 'smoke', pos: feet.clone().add(V(0, 0.15, 0)), vel: d.multiplyScalar(2.5 + Math.random() * 3), drag: 2.2, life: 0.9, size: [0.7, 1.7], color: [MW.froth, MW.light], intensity: 1, additive: false, alpha: [0.55, 0], spin: 1 });
  }
  if (!c.missed) {
    const tgt = c.target;
    await during(c, 450, () => {
      if (Math.random() < 0.7) vfx.particle({ tex: 'drop', pos: tgt.at(0.3 + Math.random() * 0.6).add(V((Math.random() - 0.5) * tgt.width * 0.7, 0, 0.2)), vel: V(0, -1.2, 0), acc: V(0, -6, 0), life: 0.5, size: [0.18, 0.1], color: [MW.light, MW.deep], intensity: 1, additive: false });
    });
  } else await vfx.wait(300);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(150);
});

// =============================================================================================== MUD-SLAP

const MUD = { light: 0x9a7248, main: 0x6a4a2a, dark: 0x3a2614 };

registerMoveFx('MUD_SLAP', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  vfx.shot('side', c.side, 350);
  // 1) scoop a handful of mud (lean back, dirt kicks up)
  const hand = () => sp.at(0.35).addScaledVector(c.dir, 0.6);
  const scoop = c.userFeet.clone().addScaledVector(c.dir, 0.6);
  vfx.burst(lift(scoop, 0.2), { count: 10, tex: 'rock', color: [MUD.light, MUD.dark], speed: [1.5, 3], dir: UP, spread: 0.6, size: [0.1, 0.2], life: 0.45, gravity: 10, additive: false, spin: 6 });
  vfx.burst(lift(scoop, 0.2), { count: 8, tex: 'drop', color: [MUD.light, MUD.dark], speed: [1.5, 3], dir: UP, spread: 0.7, size: [0.14, 0.22], life: 0.45, gravity: 10, additive: false });
  vfx.dust(scoop, MUD.light, 6);
  await slideTo(c, -0.3, 220, ease.outQuad);
  const clump = vfx.prim.blob({ color: MUD.main, radius: 0.28, emissive: 0.12, roughness: 0.9 });
  clump.mesh.position.copy(hand());
  const drip = during(c, 200, () => {
    clump.mesh.position.copy(hand());
    if (Math.random() < 0.5) vfx.particle({ tex: 'drop', pos: hand().add(V(0, -0.2, 0)), vel: V(0, -1, 0), acc: V(0, -8, 0), life: 0.3, size: [0.14, 0.06], color: MUD.main, intensity: 1, additive: false });
  });
  await clump.grow(200, 1);
  await drip;
  // 2) fling it at the foe's face
  void slideTo(c, 0.4, 130, ease.inCubic).then(() => slideTo(c, 0, 260));
  await vfx.wait(60);
  const from = hand();
  const to = c.aim(0.72);
  const flightMs = 300;
  const fly = clump.fly(from, to, flightMs, 0.7, ease.linear, (p) => {
    if (Math.random() < 0.8) vfx.particle({ tex: 'drop', pos: p.clone(), vel: V(0, -1, 0), acc: V(0, -8, 0), life: 0.3, size: [0.16, 0.07], color: MUD.main, intensity: 1, additive: false, alpha: [1, 0.3] });
  });
  // loose clods spray alongside the main clump
  for (let i = 0; i < 12; i++) {
    const dest = to.clone().add(rndUnit().multiplyScalar(0.7));
    const T = (flightMs / 1000) * (0.9 + Math.random() * 0.25);
    const g = 10;
    const v = dest.clone().sub(from).divideScalar(T).add(V(0, 0.5 * g * T, 0));
    vfx.particle({ tex: Math.random() < 0.5 ? 'rock' : 'drop', pos: from.clone().add(rndUnit().multiplyScalar(0.12)), vel: v, acc: V(0, -g, 0), life: T, size: [0.16 + Math.random() * 0.12, 0.18], color: [MUD.light, MUD.dark], intensity: 1, additive: false, alpha: [1, 1], spin: 6 });
  }
  await fly;
  clump.dispose();
  // 3) SPLAT
  const z = camScale(c, to);
  const splatAt = towardCam(c, to, 0.5);
  if (!c.missed) {
    c.impact(0);
    c.target.flash(MUD.main, 350, 0.65);
    c.target.shake(0.14, 0.35);
    impactFx(c, to, { strength: 0.7, pal: { core: 0xe8c89a, main: 0x9a6a3a, dark: MUD.dark }, ground: false });
    // a flat splat of mud stuck on the face
    vfx.particle({ tex: 'smoke', pos: splatAt.clone(), life: 0.7, size: [1.3 * z, 1.1 * z], color: [MUD.main, MUD.dark], intensity: 1, additive: false, alpha: [0.95, 0], spin: 0.5 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.random() * 0.5;
      const q = splatAt.clone().addScaledVector(screenDir(c, a), (0.35 + Math.random() * 0.3) * z);
      vfx.particle({ tex: 'drop', pos: q, vel: V(0, -0.4, 0), acc: V(0, -3, 0), life: 0.7, size: [0.22 * z, 0.14 * z], color: [MUD.light, MUD.dark], intensity: 1, additive: false, alpha: [1, 0], rot: -a + Math.PI / 2 });
    }
  }
  for (let i = 0; i < 26; i++) {
    const d = rndUnit();
    d.y = Math.abs(d.y) * 0.6 + 0.2;
    vfx.particle({ tex: 'drop', pos: splatAt.clone(), vel: d.normalize().multiplyScalar(2 + Math.random() * 3.5), acc: V(0, -11, 0), drag: 0.6, life: 0.55, size: [0.22 * z, 0.08], color: [MUD.light, MUD.dark], intensity: 1, additive: false, alpha: [1, 0.4] });
  }
  vfx.burst(splatAt, { count: 7, tex: 'rock', color: [MUD.main, MUD.dark], speed: [2, 4], size: [0.12, 0.2], life: 0.6, gravity: 12, additive: false, spin: 8 });
  vfx.burst(splatAt, { count: 6, tex: 'smoke', color: [MUD.light, MUD.main], speed: [1, 2], size: [0.5, 0.8], endSize: 1.3, life: 0.6, additive: false, alpha: [0.6, 0], drag: 2 });
  // 4) mud drips down the foe's face (accuracy down)
  if (!c.missed) {
    const tgt = c.target;
    await during(c, 480, () => {
      if (Math.random() < 0.7) vfx.particle({ tex: 'drop', pos: towardCam(c, tgt.at(0.55 + Math.random() * 0.3).add(V((Math.random() - 0.5) * tgt.width * 0.5, 0, 0)), 0.4), vel: V(0, -0.8, 0), acc: V(0, -5, 0), life: 0.5, size: [0.18, 0.1], color: [MUD.light, MUD.dark], intensity: 1, additive: false });
    });
  } else await vfx.wait(300);
  sp.body.position.set(0, 0, 0);
  vfx.shot('wide', c.side, 450);
  await vfx.wait(120);
});

// =============================================================================================== PECK

registerMoveFx('PECK', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  const D = gapDist(c, 0.9);
  // quick bob back, then a darting jab
  await slideTo(c, -0.2, 110, ease.outQuad);
  ghost(c, 0xe8f0ff, 0.3, 200);
  await slideTo(c, D, 130, ease.inCubic);
  const at = c.aim(0.55);
  const z = camScale(c, at);
  const a0 = screenAngle(c, c.user, c.foe);
  const tip = at.clone().addScaledVector(screenDir(c, a0), -0.15 * z);
  speedLines(c, tip.clone().addScaledVector(c.dir, -0.8), c.dir, { count: 6, radius: 0.5, speed: 14, color: 0xffffff, size: 1.1 });
  const r = topStroke(c, strokePoints(c, tip.clone().addScaledVector(screenDir(c, a0), -0.45 * z), a0, 1.0 * z, 0, 5, 0.6), { color: 0xd8e4ff, core: 0xffffff, width: 0.06 * z, ms: 60, length: 1, holdMs: 40, fadeMs: 140, intensity: 1.1, edgeAlpha: 0.45 });
  await r.arrived;
  if (c.missed) whiff(c, at, 0xe8f0ff);
  else {
    c.impact(0);
    impactFx(c, at, { strength: 0.6, pal: FLYPAL, ground: false });
    vfx.burst(towardCam(c, at, 0.4), { count: 4, tex: 'feather', color: [0xffffff, 0xd8d0c0], speed: [1.5, 3], size: [0.2, 0.3], life: [0.5, 0.8], gravity: 1.2, drag: 2.5, additive: false, spin: 5 });
    c.target.shake(0.08, 0.2);
  }
  await vfx.wait(90);
  await slideTo(c, 0, 260);
  sp.body.position.set(0, 0, 0);
  await vfx.wait(150);
});

// =============================================================================================== PURSUIT

const PU = { core: 0xd0b0ff, main: 0x7a4ab8, deep: 0x3a1a60, shadow: 0x1a0a2a, black: 0x05020a };
const PUPAL = { core: 0xd0b0ff, main: 0x7a4ab8, dark: 0x0a0514 };

registerMoveFx('PURSUIT', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const u = sp.uniforms;
  const wisps = (at: THREE.Vector3, n: number, r = 0.6) =>
    vfx.burst(at, { count: n, tex: 'wisp', color: [0x2a1a3a, PU.black], speed: [0.6, 2], jitter: r, size: [0.5, 0.9], endSize: 1.4, life: [0.45, 0.75], drag: 2, additive: false, alpha: [0.75, 0], spin: 2 });
  // 1) the user darkens into a shadow
  stage.setTint(0x4a3a60, 0.28, 300);
  (u.silColor.value as THREE.Color).set(PU.shadow);
  sp.setOutline(1.2, PU.main);
  wisps(c.user, 10, 0.7);
  await during(c, 220, (k) => (u.silhouette.value = 0.7 * k));
  // 2) it dashes after the foe; shadowy afterimages race ahead and chase it down
  const D = gapDist(c, 1.0);
  const dist = c.user.distanceTo(c.foe);
  for (let i = 0; i < 3; i++) {
    stage.wait(i * 70).then(() => ghost(c, i % 2 ? PU.deep : PU.main, 0.6 - i * 0.1, 380 + i * 60, c.dir.clone().multiplyScalar(dist * (0.8 - i * 0.14))));
  }
  await slideTo(c, -0.2, 110, ease.outQuad);
  let n = 0;
  const trail = during(c, 260, () => {
    if (n++ % 2 === 0) ghost(c, PU.deep, 0.4, 320);
    vfx.particle({ tex: 'wisp', pos: sp.at(0.4).add(rndUnit().multiplyScalar(0.3)), vel: c.dir.clone().multiplyScalar(-1.5).add(V(0, 0.4, 0)), life: 0.5, size: [0.7, 1.2], color: [0x2a1a3a, PU.black], intensity: 1, additive: false, alpha: [0.6, 0], spin: 2 });
  });
  await slideTo(c, D, 220, ease.inCubic);
  // 3) a dark strike
  const at = c.aim(0.5);
  const z = camScale(c, at);
  const ang = c.side === 0 ? -0.85 : Math.PI + 0.85;
  const r = topStroke(c, strokePoints(c, at, ang, 2.4 * z, 0.35 * z, 9, 1.4), { color: 0x9a6ae0, core: 0xf0e0ff, width: 0.15 * z, ms: 100, length: 0.85, holdMs: 90, fadeMs: 220, intensity: 1.05, edge: PU.black, edgeAlpha: 0.75, e: ease.inQuad });
  await r.arrived;
  // a second, crossing swipe from the shadows
  topStroke(c, strokePoints(c, at, c.side === 0 ? Math.PI - 0.85 : 0.85, 2.0 * z, -0.3 * z, 9, 1.4), { color: 0x7a4ab8, core: 0xe0d0ff, width: 0.12 * z, ms: 90, length: 0.85, holdMs: 70, fadeMs: 200, intensity: 1.0, edge: PU.black, edgeAlpha: 0.7, e: ease.inQuad });
  if (c.missed) whiff(c, at, PU.core);
  else {
    c.impact(0);
    impactFx(c, at, { strength: 1.0, pal: PUPAL, stop: true });
    c.target.flash(PU.deep, 300, 0.6);
    wisps(at, 10, 0.4);
  }
  await trail;
  await vfx.wait(160);
  // 4) slink home and come out of the shadow
  sp.setOutline(0);
  await slideTo(c, 0, 300);
  await during(c, 200, (k) => (u.silhouette.value = 0.7 * (1 - k)));
  u.silhouette.value = 0;
  sp.body.position.set(0, 0, 0);
  stage.setTint(0xffffff, 0, 300);
  await vfx.wait(150);
});

// =============================================================================================== RAGE

const RG = { core: 0xffe0d0, main: 0xff3020, deep: 0xa00a0a, dark: 0x4a0404 };

/** The classic anger mark (four bowed corners) popping up in the screen plane. */
function angerMark(c: MoveFxContext, center: THREE.Vector3, size: number, holdMs = 380) {
  const { right, up } = camBasis(c);
  const p = towardCam(c, center, 0.9);
  const dirv = (a: number) => right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
  for (let q = 0; q < 4; q++) {
    const a = Math.PI / 4 + (q * Math.PI) / 2;
    const pts = [p.clone().addScaledVector(dirv(a - 0.6), size), p.clone().addScaledVector(dirv(a), size * 0.5), p.clone().addScaledVector(dirv(a + 0.6), size)];
    const under = c.vfx.prim.ribbon(pts, { color: RG.dark, core: RG.dark, width: size * 0.2, additive: false, ms: 70, length: 1, holdMs, fadeMs: 160, opacity: 0.8 });
    onTop(under.mesh, 20);
    const top = c.vfx.prim.ribbon(pts, { color: 0xff2a20, core: 0xff7a60, width: size * 0.12, additive: false, ms: 70, length: 1, holdMs, fadeMs: 160, intensity: 1.1 });
    onTop(top.mesh, 21);
  }
}

registerMoveFx('RAGE', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  // 1) the user seethes: a red aura flares up, an anger mark pops, steam blows
  stage.setTint(0xff5040, 0.12, 300);
  sp.flash(RG.main, 300, 0.55);
  sp.shake(0.1, 0.5);
  angerMark(c, sp.at(0.95).add(camBasis(c).right.multiplyScalar(sp.width * 0.35)), 0.32 * camScale(c, sp.at(0.9)) * 1.4);
  const feet = c.userFeet.clone();
  const R = Math.max(0.7, sp.width * 0.45);
  vfx.prim.shockwave(lift(feet), { color: RG.main, radius: R * 2.4, facing: 'ground', ms: 450, thickness: 0.2, intensity: 1.1 });
  await during(c, 520, (k, dt) => {
    sp.setOutline(1.2 + Math.random() * 0.8, Math.random() < 0.5 ? RG.main : 0xff7a40);
    const n = nOf(90, dt);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const p = feet.clone().add(V(Math.cos(a) * R, Math.random() * sp.height * 0.8, Math.sin(a) * R));
      vfx.particle({ tex: 'flame', pos: p, vel: V(0, 2.4 + Math.random() * 1.6, 0), life: 0.4, size: [0.5, 0.1], color: [0xff5a3a, RG.deep], intensity: 1.1, additive: false, alpha: [0.8, 0], rot: (Math.random() - 0.5) * 0.3 });
    }
    if (Math.random() < 0.35) vfx.particle({ tex: 'smoke', pos: sp.at(1).add(V((Math.random() - 0.5) * 0.4, 0, 0)), vel: V((Math.random() - 0.5) * 1.5, 1.8, 0), life: 0.5, size: [0.3, 0.8], color: 0xffffff, intensity: 1, additive: false, alpha: [0.6, 0], spin: 2 });
    vfx.particle({ tex: 'glow', pos: c.user, life: 0.07, size: sp.height * (1.1 + 0.3 * k), color: RG.main, intensity: 0.5, alpha: [0.4, 0] });
  });
  // 2) it charges in, blind with rage
  const D = gapDist(c, 1.0);
  await slideTo(c, -0.3, 120, ease.outQuad);
  vfx.dust(c.userFeet, DUST, 8);
  let n = 0;
  const trail = during(c, 200, () => void (n++ % 2 === 0 && ghost(c, RG.main, 0.4, 260)));
  speedLines(c, c.user.clone().addScaledVector(c.dir, D * 0.5), c.dir, { count: 10, radius: 0.9, color: 0xffd0c0 });
  await slideTo(c, D, 200, ease.inCubic);
  const at = c.aim(0.5);
  if (c.missed) whiff(c, at, 0xffc0b0);
  else {
    c.impact(0);
    impactFx(c, at, { strength: 1.0, pal: { core: RG.core, main: RG.main, dark: RG.dark }, stop: true });
    c.target.flash(RG.main, 250, 0.6);
    vfx.burst(towardCam(c, at, 0.4), { count: 14, tex: 'flame', color: [0xff7a50, RG.deep], speed: [3, 6], size: [0.35, 0.6], life: 0.35, drag: 3, additive: false, intensity: 1.1 });
  }
  await trail;
  sp.setOutline(0);
  await slideTo(c, 0, 320);
  sp.body.position.set(0, 0, 0);
  // the red glow lingers for a moment: the rage is building
  sp.flash(RG.main, 350, 0.35);
  stage.setTint(0xffffff, 0, 300);
  await vfx.wait(200);
});

// =============================================================================================== FAKE OUT

registerMoveFx('FAKE_OUT', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  // 1) the user darts in; the camera snaps onto the foe
  pulledShot(c, 'foe', 1.35, 0.3, 160);
  void sp.lunge(c.foe, Math.min(1.2, c.user.distanceTo(c.foe) * 0.2), 260);
  await vfx.wait(170);
  // 2) two palms rush together right in front of the foe's face...
  const at = c.aim(0.62);
  const z = camScale(c, at);
  const S = Math.max(0.9, Math.min(1.4, c.target.width * 0.6)) * z;
  const { right, up } = camBasis(c);
  const center = towardCam(c, at, 0.9);
  const gap0 = 1.0 * S;
  const palms = [-1, 1].map((s) => {
    const c0 = center.clone().addScaledVector(right, s * gap0);
    const pts = [c0.clone().addScaledVector(up, 0.5 * S), c0.clone().addScaledVector(right, -s * 0.2 * S), c0.clone().addScaledVector(up, -0.5 * S)];
    const under = vfx.prim.ribbon(pts, { color: 0x1a1a2a, core: 0x1a1a2a, width: 0.14 * S, additive: false, ms: 50, length: 1, holdMs: 120, fadeMs: 120, opacity: 0.55 });
    const top = vfx.prim.ribbon(pts, { color: 0xfff4d8, core: 0xffffff, width: 0.08 * S, ms: 50, length: 1, holdMs: 120, fadeMs: 120, intensity: 1.0 });
    onTop(under.mesh, 20);
    onTop(top.mesh, 21);
    return { s, meshes: [under.mesh, top.mesh] };
  });
  await during(c, 110, (k) => {
    const e = ease.inCubic(k);
    for (const p of palms) for (const m of p.meshes) m.position.copy(right).multiplyScalar(-p.s * (gap0 - 0.15 * S) * e);
    for (const p of palms) if (Math.random() < 0.8) {
      const q = center.clone().addScaledVector(right, p.s * (gap0 * (1 - e) + 0.4 * S)).addScaledVector(up, (Math.random() - 0.5) * 0.8 * S);
      vfx.particle({ tex: 'streak', pos: q, vel: right.clone().multiplyScalar(-p.s * 6), life: 0.12, size: [0.8 * S, 0.3], color: 0xffffff, intensity: 1.1, alpha: [0.8, 0], rot: 0 });
    }
  });
  // 3) ...CLAP! a startling shockwave
  if (!c.missed) {
    c.impact(0);
    c.target.shake(0.2, 0.4);
    c.target.flash(0xffffff, 200, 0.5);
  }
  vfx.prim.impactStar(center, { color: 0xffc840, core: 0xfff8e0, size: 0.9 * S, ms: 240, spikes: 12, intensity: 0.9 });
  for (let i = 0; i < 3; i++) stage.wait(i * 50).then(() => vfx.prim.shockwave(center, { color: i === 1 ? 0xffd060 : 0xffffff, radius: (1.4 + i * 0.6) * S, ms: 260 + i * 40, thickness: 0.07, intensity: 0.9 }));
  // manga shock lines radiating out
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + Math.random() * 0.2;
    const d = right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
    const q = center.clone().addScaledVector(d, 0.6 * S);
    vfx.particle({ tex: 'streak', pos: q, vel: d.clone().multiplyScalar(9 * S), drag: 4, life: 0.2, size: [1.0 * S, 0.5 * S], color: 0xffffff, intensity: 1.0, alpha: [0.9, 0], rot: screenAngle(c, q, q.clone().add(d)) });
  }
  stage.shockwave(center, 0.5, 260);
  stage.flash(0xffffff, 0.07, 120);
  vfx.shake(0.18, 260);
  hitStop(c, 70);
  // 4) the foe flinches: dazed stars
  if (!c.missed) {
    c.target.knockback(c.user, 0.25, 300);
    dizzy(c, c.target, 0xffe070, 4);
  }
  await vfx.wait(420);
  vfx.shot('wide', c.side, 400);
  await vfx.wait(150);
  sp.body.position.set(0, 0, 0);
});

// =============================================================================================== TOXIC

const TX = { pale: 0xf0b0ff, light: 0xd070ff, main: 0xa030d0, deep: 0x6a1a90, dark: 0x2a0838, fume: 0x5a3070, fumeDark: 0x24142c };

registerMoveFx('TOXIC', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('side', c.side, 400);
  // 1) a sinister gurgle: toxic bubbles well up at the user's mouth
  stage.setTint(0x7a4a9a, 0.22, 400);
  sp.setOutline(1.2, TX.main);
  const mouth = mouthOf(c, 0.5, 0.62);
  await during(c, 420, (k, dt) => {
    const n = nOf(30, dt);
    for (let i = 0; i < n; i++) vfx.particle({ tex: 'bubble', pos: mouth.clone().add(rndUnit().multiplyScalar(0.35)), vel: V(0, 0.6 + Math.random() * 0.6, 0), life: 0.4, size: [0.08, 0.22], color: TX.light, intensity: 1.2, alpha: [0.9, 0.4] });
    if (Math.random() < 0.4) vfx.particle({ tex: 'smoke', pos: c.userFeet.clone().add(V((Math.random() - 0.5) * 1.6, 0.2, (Math.random() - 0.5) * 1.6)), vel: V(0, 0.8, 0), life: 0.8, size: [0.5, 1.2], color: [TX.fume, TX.fumeDark], intensity: 1, additive: false, alpha: [0.45, 0], spin: 1 });
    vfx.particle({ tex: 'glow', pos: mouth, life: 0.06, size: 0.4 + 0.5 * k, color: TX.main, intensity: 0.8, alpha: [0.6, 0] });
  });
  // 2) a stream of violet poison arcs over the foe
  const to = c.aim(0.72);
  const T = 0.42;
  const g = 16;
  const v0 = to.clone().sub(mouth).divideScalar(T).add(V(0, 0.5 * g * T, 0));
  const acc = V(0, -g, 0);
  const at = (t: number) => mouth.clone().addScaledVector(v0, t).addScaledVector(acc, 0.5 * t * t);
  const back = mouth.clone().sub(to).setY(0).normalize();
  let hit = false;
  const sprayMs = 620;
  // the liquid body of the stream
  const body = vfx.prim.ribbon(Array.from({ length: 16 }, (_, i) => at((i / 15) * T)), { color: TX.main, core: TX.light, width: 0.1, additive: false, ms: T * 1000, length: 1, holdMs: sprayMs - T * 1000, fadeMs: 220, e: ease.linear, intensity: 1.0, opacity: 0.9 });
  body.mesh.renderOrder = 5;
  /** spawn a stream particle launched `tau` seconds ago (fills the gaps between frames) */
  const launch = (tau: number, spread: number, spec: { tex: 'drop' | 'smoke' | 'dot'; size: [number, number]; color: [number, number]; alpha: [number, number]; additive?: boolean; intensity?: number }) => {
    const v = v0.clone().add(rndUnit().multiplyScalar(spread));
    const p = mouth.clone().addScaledVector(v, tau).addScaledVector(acc, 0.5 * tau * tau);
    vfx.particle({ tex: spec.tex, pos: p, vel: v.addScaledVector(acc, tau), acc, life: Math.max(0.05, T * 1.02 - tau), size: spec.size, color: spec.color, intensity: spec.intensity ?? 1.05, additive: spec.additive ?? false, alpha: spec.alpha, spin: spec.tex === 'smoke' ? 2 : 0 });
  };
  await during(c, sprayMs, (_k, dt, el) => {
    const n = nOf(240, dt);
    for (let i = 0; i < n; i++) {
      const sz = 0.26 + Math.random() * 0.2;
      launch(Math.random() * dt, 0.45, { tex: 'drop', size: [sz, sz * 1.3], color: [TX.light, TX.main], alpha: [0.95, 0.7] });
    }
    const m = nOf(110, dt);
    for (let i = 0; i < m; i++) launch(Math.random() * dt, 0.7, { tex: 'smoke', size: [0.35, 0.65], color: [TX.main, TX.deep], alpha: [0.75, 0.3] });
    if (Math.random() < 0.7) launch(Math.random() * dt, 0.6, { tex: 'dot', size: [0.12, 0.06], color: [TX.pale, TX.light], alpha: [0.9, 0.3], additive: true, intensity: 1.3 });
    if (el >= T * 1000) {
      if (!hit) {
        hit = true;
        if (!c.missed) {
          c.impact(0);
          c.target.flash(TX.main, 350, 0.7);
          c.target.shake(0.12, 0.4);
        }
        vfx.prim.shockwave(to, { color: TX.light, radius: 1.4, ms: 320, thickness: 0.18, intensity: 1.0 });
      }
      // splatter where the stream lands
      if (Math.random() < 0.8) {
        for (let i = 0; i < 3; i++) {
          const d = V((Math.random() - 0.5) * 2, 0.5 + Math.random(), (Math.random() - 0.5) * 2).addScaledVector(back, 0.6).normalize();
          vfx.particle({ tex: Math.random() < 0.5 ? 'drop' : 'dot', pos: to.clone(), vel: d.multiplyScalar(2 + Math.random() * 3), acc: V(0, -12, 0), life: 0.5, size: [0.16 + Math.random() * 0.12, 0.08], color: [TX.main, TX.deep], intensity: 1.05, additive: false, alpha: [1, 0.5] });
        }
      }
    }
  });
  sp.setOutline(0);
  // 3) the foe is drenched: poison runs down it, bubbles fizz and toxic fumes rise
  const base = c.missed ? groundAt(c) : c.foeFeet.clone();
  vfx.prim.crack(base, { radius: Math.max(1.1, c.target.width * 0.7), ms: 1100, color: TX.deep, opacity: 0.55, branches: 7 });
  vfx.prim.shockwave(lift(base), { color: TX.main, radius: 2.4, facing: 'ground', ms: 550, thickness: 0.18, intensity: 1.0 });
  const tgt = c.target;
  const W = Math.max(0.5, tgt.width * 0.4);
  let pulsed = false;
  await during(c, 700, (k, dt) => {
    if (!c.missed) {
      const n = nOf(40 * (1 - k * 0.5), dt);
      for (let i = 0; i < n; i++) vfx.particle({ tex: 'drop', pos: tgt.at(0.45 + Math.random() * 0.5).add(V((Math.random() - 0.5) * W * 2, 0, 0)).add(towardCam(c, V(), 0.25)), vel: V(0, -0.8, 0), acc: V(0, -5, 0), life: 0.5, size: [0.18, 0.1], color: [TX.main, TX.deep], intensity: 1.05, additive: false });
      if (Math.random() < 0.7) vfx.particle({ tex: 'bubble', pos: tgt.at(Math.random() * 0.8).add(V((Math.random() - 0.5) * W * 2.2, 0, (Math.random() - 0.5) * W)), vel: V(0, 0.8 + Math.random(), 0), life: 0.55, size: [0.1, 0.3], color: TX.light, intensity: 1.2, alpha: [0.9, 0.5] });
    }
    if (Math.random() < 0.5 * (1 - k)) vfx.particle({ tex: 'smoke', pos: base.clone().add(V((Math.random() - 0.5) * W * 2.4, 0.3 + Math.random() * 0.6, (Math.random() - 0.5) * W * 2)), vel: V(0, 1.1, 0), life: 1.0, size: [0.6, 1.6], color: [TX.fume, TX.fumeDark], intensity: 1, additive: false, alpha: [0.5, 0], fadeIn: 0.2, spin: 1 });
    if (!c.missed && !pulsed && k > 0.45) {
      pulsed = true;
      tgt.flash(TX.deep, 300, 0.5);
    }
  });
  stage.setTint(0xffffff, 0, 400);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(150);
});
