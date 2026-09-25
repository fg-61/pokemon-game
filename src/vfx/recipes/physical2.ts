import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { camBasis, during, emitAlong, healSparkles, hitStop, impactFx, pulledShot, rush, sideOf, slashStroke, softHit, speedLines, strokePoints, towardCam } from './common';

// Phase-3 roster move recipes (normal / fighting / flying / dark / ground / rock moves added with the full FireRed dex)

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const WHITE = { core: 0xffffff, main: 0xffb848, dark: 0x9a9070 };
const FIGHT = { core: 0xffe8c0, main: 0xff5a20, dark: 0x7a1a10 };
const CHOP = 0xffa050;
const FLYPAL = { core: 0xe8f0ff, main: 0x88a8f0, dark: 0x6070a0 };
const DARKPAL = { core: 0xc0a0f0, main: 0x7a4ab8, dark: 0x0a0514 };
const GROUNDPAL = { core: 0xfff0c0, main: 0xe0a850, dark: 0x6a4a20 };
const ROCKPAL = { core: 0xfff0d0, main: 0xd0a860, dark: 0x5a4a2a };
const DUST = 0xa89878;

type Sprite = MoveFxContext['attacker'];

// ------------------------------------------------------------------ local helpers

function whiff(c: MoveFxContext, at = c.aim(0.5), color = 0xffffff) {
  c.vfx.burst(at, { count: 8, tex: 'streak', color, speed: [4, 7], size: [0.4, 0.7], life: 0.18, dir: c.dir, spread: 0.5, intensity: 1.2 });
  c.vfx.dust(c.foeFeet.clone().addScaledVector(sideOf(c.dir), 1.4), 0xd8c8a8, 6);
}

/** Slide the attacker's body to `d` along the attack direction. */
function slideTo(c: MoveFxContext, d: number, ms: number, e = ease.inOutQuad) {
  const b = c.attacker.body.position;
  const from = b.clone();
  const to = c.dir.clone().multiplyScalar(d).setY(0);
  return c.stage.tween(ms, (k) => b.lerpVectors(from, to, k), e);
}

/** Wind up and dash in to `d` (stays there); afterimages + dust. */
async function dashIn(c: MoveFxContext, d: number, ms = 300, ghosts = 2, ghostColor = 0xfff0d8) {
  const { vfx } = c;
  await slideTo(c, -0.25, ms * 0.45, ease.outQuad);
  vfx.dust(c.userFeet, DUST, 7);
  let n = 0;
  if (ghosts) void during(c, ms * 0.5, () => void (n++ < ghosts && vfx.prim.afterimage(c.attacker.mesh, { color: ghostColor, opacity: 0.32, ms: 280 })));
  await slideTo(c, d, ms * 0.55, ease.inCubic);
}

/** Dash distance that leaves the attacker standing just in front of the target. */
function gapDist(c: MoveFxContext, gap = 1.0) {
  return Math.max(0.8, c.user.distanceTo(c.foe) - Math.max(gap, (c.attacker.width + c.target.width) * 0.3));
}

/** Little stars wheel around a sprite's head (flinch / daze). */
function dizzy(c: MoveFxContext, s: Sprite, color = 0xffe070, n = 5) {
  const hd = s.at(0.98);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    c.vfx.particle({ tex: 'star', pos: hd.clone().add(V(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6)), vel: V(0, 0.3, 0), swirl: { center: hd, speed: 5 }, life: 0.8, size: [0.35, 0.2], color, intensity: 1.8, fadeIn: 0.1 });
  }
}

/** Stat-change sparkles: rising (up) or sinking (down) around a sprite. */
function statFx(c: MoveFxContext, who: 'user' | 'foe', down: boolean, color: number, ms = 500) {
  const s = who === 'user' ? c.attacker : c.target;
  const feet = who === 'user' ? c.userFeet : c.foeFeet;
  s.flash(color, 350, 0.35);
  return c.vfx.spiral(feet, { color: [0xffffff, color], tex: 'spark', ms, radius: Math.max(0.7, s.width * 0.45), down, rise: 2.4, rate: 45 });
}

function addObj<T extends THREE.Object3D>(c: MoveFxContext, o: T): T {
  c.vfx.prim.group.add(o);
  return o;
}
function disposeObj(o: THREE.Object3D) {
  o.parent?.remove(o);
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((q) => q.dispose());
    else mat?.dispose?.();
  });
}

type GlyphKind = 'heart' | 'note' | 'note2' | 'star';

function glyphShapes(kind: GlyphKind): THREE.Shape[] {
  if (kind === 'heart') {
    const s = new THREE.Shape();
    s.moveTo(0, -0.45);
    s.bezierCurveTo(-0.15, -0.3, -0.5, -0.12, -0.5, 0.14);
    s.bezierCurveTo(-0.5, 0.38, -0.33, 0.5, -0.2, 0.5);
    s.bezierCurveTo(-0.08, 0.5, 0, 0.42, 0, 0.3);
    s.bezierCurveTo(0, 0.42, 0.08, 0.5, 0.2, 0.5);
    s.bezierCurveTo(0.33, 0.5, 0.5, 0.38, 0.5, 0.14);
    s.bezierCurveTo(0.5, -0.12, 0.15, -0.3, 0, -0.45);
    return [s];
  }
  if (kind === 'star') {
    const s = new THREE.Shape();
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 === 0 ? 0.5 : 0.21;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return [s];
  }
  const rect = (x0: number, y0: number, x1: number, y1: number, skew = 0) => {
    const r = new THREE.Shape();
    r.moveTo(x0, y0);
    r.lineTo(x1, y0 + skew);
    r.lineTo(x1, y1 + skew);
    r.lineTo(x0, y1);
    r.closePath();
    return r;
  };
  const noteHead = (x: number, y: number) => {
    const h = new THREE.Shape();
    h.absellipse(x, y, 0.19, 0.13, 0, Math.PI * 2, false, 0.45);
    return h;
  };
  if (kind === 'note') {
    const flag = new THREE.Shape();
    flag.moveTo(0.05, 0.5);
    flag.bezierCurveTo(0.12, 0.3, 0.38, 0.26, 0.3, -0.02);
    flag.bezierCurveTo(0.3, 0.16, 0.18, 0.24, 0.05, 0.3);
    flag.closePath();
    return [noteHead(-0.1, -0.34), rect(-0.01, -0.33, 0.07, 0.5), flag];
  }
  // two beamed eighth notes
  return [noteHead(-0.3, -0.36), noteHead(0.24, -0.26), rect(-0.2, -0.35, -0.13, 0.4), rect(0.34, -0.25, 0.41, 0.5), rect(-0.2, 0.3, 0.41, 0.44, 0.1)];
}

/** Flat camera-facing symbol (hearts, music notes, stars) with a dark edge. Call `set` every frame. */
function glyph(c: MoveFxContext, kind: GlyphKind, o: { color: number; edge?: number; intensity?: number }) {
  const geo = new THREE.ShapeGeometry(glyphShapes(kind), 10);
  geo.center();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color).multiplyScalar(o.intensity ?? 1.1), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const edgeM = new THREE.MeshBasicMaterial({ color: o.edge ?? 0x201018, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const root = addObj(c, new THREE.Group());
  const face = new THREE.Mesh(geo, mat);
  face.renderOrder = 9;
  face.position.z = 0.01;
  const edge = new THREE.Mesh(geo, edgeM);
  edge.renderOrder = 8;
  edge.scale.set(1.2, 1.18, 1);
  root.add(edge, face);
  root.visible = false;
  return {
    root,
    set(p: THREE.Vector3, size: number, alpha = 1, rot = 0) {
      root.visible = true;
      root.position.copy(p);
      root.quaternion.copy(c.stage.camera.quaternion);
      root.rotateZ(rot);
      root.scale.setScalar(Math.max(1e-3, size));
      mat.opacity = alpha;
      edgeM.opacity = alpha * 0.6;
    },
    dispose: () => disposeObj(root),
  };
}

/** Point on a quadratic bezier. */
function qbez(a: THREE.Vector3, m: THREE.Vector3, b: THREE.Vector3, t: number) {
  const p = a.clone().lerp(m, t);
  return p.lerp(m.clone().lerp(b, t), t);
}

// ================================================================== NORMAL

registerMoveFx('TAKE_DOWN', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  // paw the ground twice, building up a reckless head of steam
  sp.setOutline(1.3, 0xffd8a0);
  for (let i = 0; i < 2; i++) {
    await slideTo(c, -0.2, 110, ease.outQuad);
    vfx.dust(c.userFeet.clone().addScaledVector(c.dir, -0.5), DUST, 6);
    await slideTo(c, 0, 100);
  }
  sp.shake(0.05, 0.2);
  await rush(c, { ms: 400, dist: Math.min(4.4, c.user.distanceTo(c.foe) * 0.6), ghosts: 4, ghostColor: 0xffe0b0, lines: true });
  sp.setOutline(0);
  const at = c.aim(0.5);
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.3, pal: WHITE, stop: true, flash: 0.15 });
    for (let i = 0; i < 2; i++) vfx.prim.shockwave(at.clone().addScaledVector(c.dir, 0.3 + i * 0.5), { color: 0xfff0d0, radius: 1.2 + i * 0.5, facing: c.dir, ms: 360, thickness: 0.18, intensity: 1.1 });
    vfx.burst(towardCam(c, at, 0.5), { count: 16, tex: 'spark', color: [0xffffff, 0xffb040], speed: [4, 9], size: [0.12, 0.26], life: [0.25, 0.5], gravity: 6 });
    c.impact(0);
  }
  await vfx.wait(420);
  if (!c.missed) {
    // recoil jolt
    sp.flash(0xff4030, 260, 0.65);
    sp.shake(0.1, 0.3);
    vfx.burst(c.user, { count: 12, tex: 'spark', color: [0xffffff, 0xff5030], speed: [2, 5], size: [0.12, 0.24], life: [0.2, 0.4] });
    vfx.particle({ tex: 'star', pos: towardCam(c, c.user, 0.5), life: 0.2, size: [0.5, 1.2], color: 0xff8060, intensity: 1.6, alpha: [1, 0] });
  }
  await vfx.wait(320);
});

registerMoveFx('WISH', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const STAR = 0xffe070;
  pulledShot(c, 'user', 1.55, 1.5, 500);
  stage.setTint(0x40408a, 0.35, 400);
  const top = sp.at(0.95);
  const { right } = camBasis(c);
  // the star hangs on the side away from the foe
  const s = c.side === 0 ? -1 : 1;
  // a wish is sent up: a sparkling thread rises from the user into the sky
  sp.flash(0xfff4c0, 400, 0.35);
  const skyAt = top.clone().add(V(0, 2.0, 0)).addScaledVector(right, s * 1.5);
  vfx.prim.ribbon([top.clone(), top.clone().add(V(0, 1.2, 0)).addScaledVector(right, s * 0.3), skyAt.clone()], { color: 0xfff0a0, core: 0xffffff, width: 0.05, ms: 420, length: 0.5, fadeMs: 200, intensity: 1.1 });
  vfx.burst(top, { count: 14, tex: 'star', color: [0xffffff, STAR], speed: [0.5, 1.6], dir: UP, spread: 0.6, size: [0.1, 0.2], life: [0.5, 0.8], intensity: 1.4 });
  await vfx.wait(430);
  // the star twinkles in the night sky...
  vfx.prim.shockwave(skyAt, { color: STAR, radius: 1.1, ms: 400, thickness: 0.1, intensity: 1.2 });
  vfx.particle({ tex: 'star', pos: skyAt.clone(), life: 0.5, size: [0.4, 1.4], color: 0xffffff, intensity: 1.5, alpha: [1, 0] });
  const star = glyph(c, 'star', { color: STAR, edge: 0x6a4a00, intensity: 1.15 });
  await during(c, 380, (k) => {
    star.set(skyAt, 0.5 * ease.outBack(k), 1, k * 2);
    if (Math.random() < 0.5) vfx.particle({ tex: 'glow', pos: skyAt.clone(), life: 0.15, size: 1.2, color: STAR, intensity: 0.6, alpha: [0.5, 0] });
  });
  // ...then falls, blazing, onto the user
  const land = sp.at(0.6);
  const mid = skyAt.clone().lerp(land, 0.5).addScaledVector(right, s * 0.8).add(V(0, 0.4, 0));
  let prev = skyAt.clone();
  await during(c, 520, (k) => {
    const e = ease.inQuad(k);
    const p = qbez(skyAt, mid, land, e);
    star.set(p, 0.5 + 0.15 * k, 1, 2 + k * 8);
    emitAlong(prev, p, 0.1, (q) => {
      vfx.particle({ tex: 'glow', pos: q, life: 0.4, size: [0.7, 0.15], color: STAR, intensity: 1.1, alpha: [0.75, 0] });
      if (Math.random() < 0.4) vfx.particle({ tex: 'star', pos: q.clone(), vel: V((Math.random() - 0.5) * 1.5, -0.5 - Math.random(), (Math.random() - 0.5) * 1.5), life: 0.6, size: [0.18, 0.05], color: [0xffffff, STAR], intensity: 1.4, spin: 4 });
    });
    prev = p;
  });
  star.dispose();
  // wish granted: a golden bloom of light
  vfx.particle({ tex: 'star', pos: towardCam(c, land, 0.4), life: 0.25, size: [0.7, 1.5], color: 0xffffff, intensity: 1.1, alpha: [0.8, 0] });
  vfx.prim.shockwave(land, { color: STAR, radius: 2.0, ms: 450, thickness: 0.12, intensity: 1.1 });
  vfx.burst(land, { count: 26, tex: 'star', color: [0xffffff, STAR], speed: [2, 5], size: [0.14, 0.28], life: [0.5, 0.9], drag: 2.5, gravity: 1.5, spin: 5, intensity: 1.4 });
  stage.flash(0xfff0c0, 0.08, 200);
  sp.setOutline(1.2, STAR);
  c.impact(0);
  await healSparkles(c, 'user', 0xffe890, 750);
  sp.setOutline(0);
  stage.setTint(0xffffff, 0, 400);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(200);
});

registerMoveFx('GLARE', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const EYE = 0xffe030;
  vfx.shot('attacker', c.side, 400);
  stage.setTint(0x6a5a20, 0.35, 350);
  await vfx.wait(300);
  // the eyes narrow and flare
  const hd = sp.at(0.76);
  const { right } = camBasis(c);
  const eyeW = Math.min(0.26, sp.width * 0.13);
  const eyes = [-1, 1].map((s) => towardCam(c, hd.clone().addScaledVector(right, s * eyeW), 0.3));
  for (const p of eyes) {
    vfx.particle({ tex: 'glow', pos: p, life: 0.7, size: [0.12, 0.34], color: EYE, intensity: 2.2, alpha: [1, 0], fadeIn: 0.15 });
    vfx.particle({ tex: 'streak', pos: p.clone(), life: 0.45, size: [0.1, 1.0], color: 0xfff080, intensity: 1.8, alpha: [1, 0], fadeIn: 0.3, rot: 0 });
  }
  stage.chromaPulse(0.01, 350);
  sp.shake(0.03, 0.3);
  await vfx.wait(380);
  vfx.shot('wide', c.side, 300);
  await vfx.wait(160);
  // twin beams of the stare lance into the target
  const to = c.aim(0.7);
  const eyes2 = [-1, 1].map((s) => sp.at(0.76).addScaledVector(right, s * eyeW));
  vfx.particle({ tex: 'star', pos: towardCam(c, sp.at(0.76), 0.5), life: 0.25, size: [0.4, 1.3], color: 0xffffff, intensity: 1.4, alpha: [1, 0], spin: 3 });
  const rs = eyes2.map((p, i) => vfx.prim.ribbon([p, p.clone().lerp(to, 0.5).add(V(0, 0.15 * (i ? 1 : -1), 0)), to.clone()], { color: EYE, core: 0xffffff, width: 0.075, ms: 160, length: 1, holdMs: 240, fadeMs: 220, intensity: 1.2 }));
  speedLines(c, sp.at(0.76).lerp(to, 0.5), to.clone().sub(sp.at(0.76)), { count: 8, radius: 0.5, color: EYE, size: 1.3, speed: 16, life: 0.2, intensity: 1.2 });
  await rs[0].arrived;
  if (c.missed) vfx.burst(to, { count: 10, tex: 'spark', color: EYE, speed: 2 });
  else {
    // paralysis: the target locks up with crackling yellow sparks
    c.target.flash(EYE, 500, 0.55);
    c.target.shake(0.1, 0.6);
    vfx.prim.shockwave(to, { color: EYE, radius: 1.4, ms: 300, thickness: 0.12, intensity: 1.2 });
    const tc = c.target.at(0.5);
    const R = Math.max(0.6, c.target.width * 0.45);
    void during(c, 600, (_k, _dt, el) => {
      if (Math.random() < 0.35) {
        const a = Math.random() * Math.PI * 2;
        const p = tc.clone().add(V(Math.cos(a) * R, (Math.random() - 0.5) * c.target.height * 0.8, Math.sin(a) * R));
        vfx.prim.lightning(p, p.clone().add(V((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8)), { color: EYE, width: 0.03, jitter: 0.15, segments: 5, ms: 90, intensity: 1.2 });
      }
      if (el < 300) vfx.burst(tc, { count: 1, tex: 'spark', color: [0xffffff, EYE], speed: [2, 4], size: [0.1, 0.2], life: 0.3, jitter: R });
    });
    c.impact(0);
  }
  await vfx.wait(700);
  stage.setTint(0xffffff, 0, 300);
  await vfx.wait(150);
});

registerMoveFx('SOFT_BOILED', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const WARM = 0xffe8a0;
  pulledShot(c, 'user', 1.45, 1.0, 450);
  // a glowing egg appears above the user's head
  const eggAt = sp.at(1.0).add(V(0, 0.75, 0));
  const egg = addObj(c, new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18), new THREE.MeshStandardMaterial({ color: 0xfff8ec, emissive: new THREE.Color(0xfff0d0), emissiveIntensity: 0.35, roughness: 0.5 })));
  egg.position.copy(eggAt);
  vfx.particle({ tex: 'glow', pos: eggAt.clone(), life: 1.0, size: [0.4, 1.8], color: WARM, intensity: 0.9, alpha: [0.6, 0], fadeIn: 0.4 });
  await during(c, 380, (k) => {
    const s = ease.outBack(k);
    egg.scale.set(0.3 * s, 0.4 * s, 0.3 * s);
  });
  // it wobbles...
  await during(c, 420, (k) => {
    egg.rotation.z = Math.sin(k * Math.PI * 6) * 0.25 * (0.4 + k);
    (egg.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.35 + k * 0.8;
  });
  // ...and cracks open, pouring warm light down onto the user
  disposeObj(egg);
  vfx.prim.debris({ from: eggAt.clone(), count: 10, color: 0xfff8ec, geometry: 'crystal', size: 0.06, speed: 2.5, up: 2.5, ms: 800, emissive: 0.4 });
  vfx.burst(eggAt, { count: 18, tex: 'shard', color: [0xffffff, 0xfff0d8], speed: [1.5, 4], size: [0.12, 0.22], life: [0.4, 0.7], gravity: 7, additive: false, spin: 8 });
  vfx.particle({ tex: 'star', pos: towardCam(c, eggAt, 0.3), life: 0.25, size: [0.8, 1.8], color: 0xffffff, intensity: 1.3, alpha: [0.9, 0] });
  vfx.prim.shockwave(eggAt, { color: WARM, radius: 1.4, ms: 380, thickness: 0.14, intensity: 1.1 });
  stage.flash(0xfff0c0, 0.12, 180);
  const pour = during(c, 600, () => {
    for (let i = 0; i < 2; i++) {
      const p = eggAt.clone().add(V((Math.random() - 0.5) * 0.5, -0.1, (Math.random() - 0.5) * 0.5));
      vfx.particle({ tex: 'glow', pos: p, vel: V((Math.random() - 0.5) * 0.8, -2.5 - Math.random(), (Math.random() - 0.5) * 0.8), life: 0.55, size: [0.35, 0.15], color: [0xffffff, WARM], intensity: 1.2, alpha: [0.8, 0] });
    }
  });
  await vfx.wait(250);
  sp.setOutline(1.2, WARM);
  c.impact(0);
  await Promise.all([pour, healSparkles(c, 'user', 0xffe8a0, 700)]);
  sp.setOutline(0);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(150);
});

registerMoveFx('MILK_DRINK', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  const MILK = 0xfffaf2;
  const PINK = 0xffc8dc;
  pulledShot(c, 'user', 1.45, 0.9, 450);
  const R = Math.max(0.7, sp.width * 0.5);
  // a creamy swirl of milk spirals up around the user
  const swirl = during(c, 900, (k) => {
    for (let i = 0; i < 3; i++) {
      const a = k * 14 + i * 2.1;
      const p = c.userFeet.clone().add(V(Math.cos(a) * R, 0.2 + k * sp.height * 1.1, Math.sin(a) * R));
      vfx.particle({ tex: 'drop', pos: p, vel: V(0, 0.6, 0), life: 0.45, size: [0.28, 0.12], color: [MILK, 0xf0e8e0], intensity: 1.05, additive: false, alpha: [1, 0] });
      vfx.particle({ tex: 'smoke', pos: p.clone(), life: 0.5, size: [0.35, 0.6], color: MILK, intensity: 1, additive: false, alpha: [0.45, 0] });
    }
  });
  void c.attacker.jump(0.2, 260);
  await vfx.wait(700);
  // a splash of milk over the user, pink glow of contentment
  const top = sp.at(1.0);
  for (let i = 0; i < 22; i++) {
    const d = V((Math.random() - 0.5) * 1.4, 1 + Math.random(), (Math.random() - 0.5) * 1.4).normalize();
    vfx.particle({ tex: 'drop', pos: top.clone(), vel: d.multiplyScalar(2 + Math.random() * 2.5), acc: V(0, -10, 0), life: 0.7, size: [0.22, 0.1], color: [MILK, 0xf4ece4], intensity: 1.05, additive: false, alpha: [1, 0.3] });
  }
  sp.setOutline(1.1, PINK);
  c.impact(0);
  await Promise.all([swirl, healSparkles(c, 'user', PINK, 700)]);
  sp.setOutline(0);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(150);
});

registerMoveFx('MORNING_SUN', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const SUN = { core: 0xfff6c0, main: 0xffc040, hot: 0xff8a20 };
  pulledShot(c, 'user', 1.45, 1.0, 500);
  stage.setTint(0xffb050, 0.3, 500);
  const R = Math.max(0.8, sp.width * 0.5);
  const sunAt = c.userFeet.clone().add(V(0, sp.height + 1.6, 0));
  // the morning sun rises overhead, rays wheeling
  const sun = vfx.prim.orb({ color: SUN.hot, core: SUN.core, radius: 0.5, intensity: 1.0 });
  sun.mesh.position.copy(sunAt.clone().add(V(0, -0.8, 0)));
  void sun.grow(500, 1);
  void vfx.tween(600, (k) => sun.mesh.position.copy(sunAt).add(V(0, -0.8 * (1 - k), 0)), ease.outCubic);
  const rays = during(c, 1500, (k, _dt, el) => {
    if (Math.random() < 0.6) vfx.particle({ tex: 'glow', pos: sun.mesh.position.clone(), life: 0.2, size: 2.2, color: SUN.main, intensity: 0.5 * (1 - k * 0.6), alpha: [0.5, 0] });
    if (Math.random() < 0.5) {
      const a = el / 300 + Math.floor(Math.random() * 8) * (Math.PI / 4);
      const { right, up } = camBasis(c);
      const d = right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
      const p = sun.mesh.position.clone().addScaledVector(d, 0.75);
      vfx.particle({ tex: 'streak', pos: p, vel: d.clone().multiplyScalar(1.5), life: 0.3, size: [0.7, 0.3], color: SUN.main, intensity: 1.2, rot: a, alpha: [0.9, 0] });
    }
  });
  await vfx.wait(500);
  // warm sunlight pours down onto the user
  const H = sunAt.y - c.userFeet.y;
  vfx.prim.pillar(c.userFeet.clone(), { color: SUN.main, radius: R * 0.95, height: H, ms: 1150, intensity: 0.3 });
  const rain = vfx.rain(c.userFeet.clone().setY(c.userFeet.y + 0.2), { tex: 'glow', color: [0xffffff, SUN.main], ms: 800, rate: 35, height: H - 0.5, radius: R, fall: 3.5, size: [0.16, 0.3], intensity: 1.3 });
  await vfx.wait(400);
  sp.setOutline(1.2, SUN.main);
  c.impact(0);
  const heal = healSparkles(c, 'user', 0xffd870, 700);
  await Promise.all([rain, heal]);
  await vfx.tween(250, (k) => sun.mesh.scale.setScalar(1 - k), ease.inQuad);
  sun.dispose();
  await rays;
  sp.setOutline(0);
  stage.setTint(0xffffff, 0, 400);
  vfx.shot('wide', c.side, 500);
});

registerMoveFx('SLACK_OFF', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  const LAZY = 0xd8f0a0;
  pulledShot(c, 'user', 1.45, 0.8, 450);
  // flop down and loll lazily from side to side
  const flop = during(c, 1300, (k) => {
    const d = Math.sin(Math.min(1, k * 3) * Math.PI * 0.5) * (1 - Math.max(0, (k - 0.8) / 0.2));
    sp.body.scale.set(1 + 0.12 * d, 1 - 0.18 * d, 1 + 0.12 * d);
    sp.mesh.rotation.z = Math.sin(k * Math.PI * 3) * 0.1 * d;
  });
  // drowsy Zzz drift up
  const head = sp.at(0.9);
  const zz = during(c, 1100, (_k, _dt, el) => {
    if (Math.random() < 0.12) vfx.particle({ tex: 'zzz', pos: head.clone().add(V((Math.random() - 0.5) * 0.4, 0, 0)), vel: V(0.3 + Math.random() * 0.3, 0.8, 0), life: 1.0, size: [0.2, 0.5], color: 0xe0f0ff, intensity: 1.1, alpha: [1, 0], fadeIn: 0.2, spin: 0.5 });
    if (el % 400 < 40) vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: LAZY, radius: 1.6, facing: 'ground', ms: 700, thickness: 0.18, intensity: 0.9 });
  });
  await vfx.wait(450);
  sp.setOutline(1.0, LAZY);
  c.impact(0);
  await healSparkles(c, 'user', 0xb8f080, 700);
  await Promise.all([flop, zz]);
  sp.body.scale.set(1, 1, 1);
  sp.mesh.rotation.z = 0;
  sp.setOutline(0);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(150);
});

registerMoveFx('PRESENT', async (c) => {
  const { vfx, stage } = c;
  // a wrapped gift box, tossed underhand
  const box = addObj(c, new THREE.Group());
  const paper = new THREE.MeshStandardMaterial({ color: 0xe8384a, emissive: new THREE.Color(0xe8384a), emissiveIntensity: 0.25, roughness: 0.6 });
  const ribbonM = new THREE.MeshStandardMaterial({ color: 0xffd840, emissive: new THREE.Color(0xffd840), emissiveIntensity: 0.35, roughness: 0.4 });
  box.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.85, 1), paper));
  box.add(new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.89, 0.2), ribbonM));
  box.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.89, 1.04), ribbonM));
  for (const s of [-1, 1]) {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.06, 6, 12), ribbonM);
    bow.position.set(s * 0.15, 0.55, 0);
    bow.rotation.set(0, Math.PI / 2, s * 0.6);
    box.add(bow);
  }
  box.scale.setScalar(0.01);
  const from = c.user.clone().addScaledVector(c.dir, 0.6);
  box.position.copy(from);
  void c.attacker.jump(0.25, 260);
  await vfx.tween(220, (k) => box.scale.setScalar(0.6 * ease.outBack(k)), ease.linear);
  vfx.burst(from, { count: 8, tex: 'star', color: [0xffffff, 0xffe070], speed: [1, 2.5], size: [0.1, 0.2], life: 0.5, spin: 5 });
  const land = c.missed ? c.aim(0).setY(c.foeFeet.y + 0.35) : c.aim(0.35);
  const mid = from.clone().lerp(land, 0.5).add(V(0, 1.8, 0));
  await during(c, 560, (k) => {
    box.position.copy(qbez(from, mid, land, k));
    box.rotation.set(k * 5, k * 3, k * 4);
    if (Math.random() < 0.5) vfx.particle({ tex: 'star', pos: box.position.clone(), life: 0.35, size: [0.14, 0.04], color: [0xffffff, 0xffe070], intensity: 1.3 });
  });
  box.rotation.set(0, 0.4, 0);
  vfx.dust(land.clone().setY(c.foeFeet.y), DUST, 6);
  // it rattles ominously...
  await during(c, 300, (k) => {
    box.rotation.z = Math.sin(k * Math.PI * 8) * 0.25;
    box.scale.setScalar(0.6 * (1 + 0.15 * k));
    paper.emissiveIntensity = 0.25 + k * 0.8;
  });
  disposeObj(box);
  const at = land.clone().add(V(0, 0.2, 0));
  const confetti = [0xff4060, 0x40c0ff, 0xffe040, 0x60e060, 0xc070ff];
  if (c.missed) {
    // fizzle: a puff and a few streamers
    vfx.burst(at, { count: 10, tex: 'smoke', color: 0xd8d0c8, speed: [1, 2], size: [0.4, 0.7], endSize: 1.2, life: 0.6, additive: false, alpha: [0.6, 0] });
    vfx.burst(at, { count: 14, tex: 'dot', color: confetti[Math.floor(Math.random() * 5)], speed: [1.5, 3], size: [0.08, 0.14], life: 0.8, gravity: 4, additive: false });
    await vfx.wait(500);
    return;
  }
  // BOOM - a festive explosion
  vfx.prim.blast(at, { core: 0xffffff, main: 0xffa040, dark: 0x8a2a10, radius: 1.5, ms: 800, intensity: 1.5 });
  impactFx(c, c.aim(0.45), { strength: 1.2, pal: { core: 0xffffff, main: 0xffb040, dark: 0x8a3a10 }, stop: true, flash: 0.2 });
  for (const col of confetti) vfx.burst(at, { count: 12, tex: Math.random() < 0.5 ? 'shard' : 'dot', color: col, speed: [3, 7], size: [0.1, 0.18], life: [0.7, 1.1], gravity: 5, drag: 1.5, additive: false, spin: 10 });
  vfx.burst(at, { count: 10, tex: 'star', color: [0xffffff, 0xffe070], speed: [2, 5], size: [0.15, 0.3], life: [0.4, 0.7], spin: 6, intensity: 1.4 });
  stage.chromaPulse(0.006, 250);
  c.impact(0);
  await vfx.wait(750);
});

registerMoveFx('TRI_ATTACK', async (c) => {
  const { vfx, stage } = c;
  const COLS = [
    { core: 0xfff0a0, main: 0xff5a1a },
    { core: 0xffffff, main: 0x70d8ff },
    { core: 0xffffff, main: 0xffe030 },
  ];
  const { right, up } = camBasis(c);
  const center0 = c.user.clone().addScaledVector(c.dir, 1.2).add(V(0, 0.6, 0));
  const orbs = COLS.map((col) => vfx.prim.orb({ color: col.main, core: col.core, radius: 0.3, intensity: 1.3 }));
  const vert = (ctr: THREE.Vector3, R: number, rot: number) =>
    [0, 1, 2].map((i) => {
      const a = rot + Math.PI / 2 + (i * Math.PI * 2) / 3;
      return ctr.clone().addScaledVector(right, Math.cos(a) * R).addScaledVector(up, Math.sin(a) * R);
    });
  const drawTri = (vs: THREE.Vector3[], alpha: number) => {
    for (let i = 0; i < 3; i++)
      emitAlong(vs[i], vs[(i + 1) % 3], 0.1, (q) => vfx.particle({ tex: 'glow', pos: q, life: 0.08, size: 0.28, color: 0xfff4e0, intensity: 1.2, alpha: [alpha, 0] }));
  };
  // three elemental orbs appear and lock into a spinning triangle
  let rot = 0;
  await during(c, 520, (k, dt) => {
    rot += dt * (3 + 6 * k);
    const vs = vert(center0, 0.75 * ease.outBack(Math.min(1, k * 1.4)), rot);
    orbs.forEach((o, i) => {
      o.mesh.position.copy(vs[i]);
      o.mesh.scale.setScalar(0.01 + ease.outBack(Math.min(1, k * 1.6)));
    });
    if (k > 0.45) drawTri(vs, (k - 0.45) * 1.6);
    if (Math.random() < 0.5) {
      const i = Math.floor(Math.random() * 3);
      vfx.particle({ tex: i === 0 ? 'flame' : i === 1 ? 'shard' : 'spark', pos: vs[i].clone(), vel: V((Math.random() - 0.5) * 1.2, 0.6, (Math.random() - 0.5) * 1.2), life: 0.3, size: [0.25, 0.08], color: COLS[i].main, intensity: 1.3, spin: 4 });
    }
  });
  // the triangle hurls itself at the target
  const to = c.aim(0.5);
  await during(c, 380, (k, dt) => {
    rot += dt * 12;
    const ctr = center0.clone().lerp(to, ease.inQuad(k));
    const vs = vert(ctr, 0.75 - 0.2 * k, rot);
    orbs.forEach((o, i) => o.mesh.position.copy(vs[i]));
    drawTri(vs, 1);
    vfx.particle({ tex: 'glow', pos: ctr.clone(), life: 0.2, size: [0.6, 0.2], color: 0xfff0e0, intensity: 0.7, alpha: [0.5, 0] });
  });
  orbs.forEach((o) => o.dispose());
  if (c.missed) whiff(c, to);
  else {
    // fire, ice and lightning go off at once
    const p = towardCam(c, to, 0.4);
    const vs = vert(p, 0.55, rot);
    vfx.burst(vs[0], { count: 16, tex: 'flame', color: [0xffd070, 0xff4010], speed: [2, 5], size: [0.3, 0.55], life: [0.3, 0.5], additive: false, alpha: [1, 0], drag: 2 });
    vfx.prim.debris({ from: vs[1].clone(), count: 8, color: 0xa8e8ff, geometry: 'crystal', size: 0.07, speed: 3, up: 3, ms: 800, emissive: 0.6 });
    vfx.burst(vs[1], { count: 12, tex: 'shard', color: [0xffffff, 0x80d8ff], speed: [2, 5], size: [0.14, 0.26], life: [0.3, 0.6], gravity: 6, spin: 8, intensity: 1.3 });
    for (let i = 0; i < 3; i++) vfx.prim.lightning(vs[2], vs[2].clone().add(V((Math.random() - 0.5) * 2, (Math.random() - 0.3) * 1.6, (Math.random() - 0.5) * 2)), { color: 0xffe030, width: 0.04, jitter: 0.2, segments: 6, ms: 180, intensity: 1.3 });
    impactFx(c, to, { strength: 1.15, pal: { core: 0xffffff, main: 0xfff0d0, dark: 0x8a8070 }, stop: true });
    stage.chromaPulse(0.006, 250);
    c.impact(0);
  }
  await vfx.wait(600);
});

registerMoveFx('SWIFT', async (c) => {
  const { vfx } = c;
  const STAR = 0xffe060;
  const N = 6;
  const { right, up } = camBasis(c);
  const from = c.user.clone().addScaledVector(c.dir, 0.5).add(V(0, 0.3, 0));
  const to = c.aim(0.5);
  // a spray of stars fans out, then every one of them homes in
  c.attacker.flash(0xfff0a0, 250, 0.4);
  vfx.burst(from, { count: 12, tex: 'spark', color: [0xffffff, STAR], speed: [1, 3], size: [0.1, 0.2], life: 0.4 });
  const stars = Array.from({ length: N }, () => glyph(c, 'star', { color: STAR, edge: 0x7a5000, intensity: 1.1 }));
  const ctrl = stars.map((_, i) => {
    const a = -1.1 + (i / (N - 1)) * 2.2;
    return from.clone().lerp(to, 0.25).addScaledVector(right, Math.sin(a) * 2.2).addScaledVector(up, 1.2 + Math.cos(a) * 1.0);
  });
  const T0 = stars.map((_, i) => i * 55);
  const TRAVEL = 480;
  const prev = stars.map(() => from.clone());
  const done = stars.map(() => false);
  let hit = 0;
  await during(c, T0[N - 1] + TRAVEL + 20, (_k, _dt, el) => {
    for (let i = 0; i < N; i++) {
      if (done[i]) continue;
      const t = (el - T0[i]) / TRAVEL;
      if (t < 0) continue;
      const k = Math.min(1, t);
      const p = qbez(from, ctrl[i], to, ease.inOutQuad(k));
      stars[i].set(p, 0.5 * Math.min(1, k * 5), 1, el / 60 + i);
      emitAlong(prev[i], p, 0.14, (q) => vfx.particle({ tex: 'glow', pos: q, life: 0.18, size: [0.22, 0.05], color: STAR, intensity: 0.8, alpha: [0.45, 0] }));
      if (Math.random() < 0.3) vfx.particle({ tex: 'star', pos: p.clone(), vel: V(0, -0.6, 0), life: 0.4, size: [0.12, 0.03], color: [0xffffff, STAR], intensity: 1.3 });
      prev[i] = p;
      if (t >= 1) {
        done[i] = true;
        stars[i].dispose();
        if (c.missed) vfx.burst(p, { count: 5, tex: 'star', color: STAR, speed: [1, 2.5], size: [0.1, 0.18], life: 0.35 });
        else {
          softHit(c, towardCam(c, p, 0.5), { core: 0xffffff, main: STAR }, 0.45);
          c.target.shake(0.05, 0.12);
          if (hit++ === 0) c.impact(0);
        }
      }
    }
  });
  stars.forEach((s) => s.dispose());
  if (!c.missed) impactFx(c, to, { strength: 0.9, pal: { core: 0xffffff, main: STAR, dark: 0x8a6a10 }, ground: false });
  await vfx.wait(450);
});

registerMoveFx('TRANSFORM', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const u = sp.uniforms;
  const LIGHT = 0xe8d8ff;
  // the target is scanned: motes of light stream from it into the user
  c.target.setOutline(1.2, LIGHT);
  const tc = c.target.at(0.5);
  const scan = during(c, 700, (k) => {
    const y = c.foeFeet.y + c.target.height * (1 - k);
    vfx.particle({ tex: 'streak', pos: towardCam(c, V(tc.x, y, tc.z), 0.4), life: 0.1, size: Math.max(1, c.target.width * 1.1), color: LIGHT, intensity: 1.2, alpha: [0.8, 0], rot: 0 });
    for (let i = 0; i < 2; i++) {
      const p = V(tc.x, y, tc.z).add(V((Math.random() - 0.5) * c.target.width, 0, (Math.random() - 0.5) * 0.4));
      vfx.particle({ tex: 'glow', pos: p, vel: c.user.clone().sub(p).multiplyScalar(1 / 0.7), life: 0.7, size: [0.22, 0.1], color: [0xffffff, 0xb088ff], intensity: 1.3, alpha: [0.9, 0.3], fadeIn: 0.1 });
    }
  });
  // the user whitens and melts into a puddle of light...
  (u.silColor.value as THREE.Color).set(0xf4ecff);
  sp.setOutline(1.4, 0xc8a8ff);
  await during(c, 380, (k) => (u.silhouette.value = k));
  c.target.setOutline(0);
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: 0xc8a8ff, radius: 2, facing: 'ground', ms: 700, thickness: 0.2 });
  await during(c, 420, (k) => {
    const m = ease.inQuad(k);
    sp.body.scale.set(1 + 0.35 * m, 1 - 0.75 * m, 1 + 0.35 * m);
    if (Math.random() < 0.7) vfx.burst(sp.at(0.2), { count: 1, tex: 'glow', color: [0xffffff, 0xc8a8ff], speed: [0.5, 1.5], dir: UP, spread: 1.2, size: [0.2, 0.35], life: 0.5, jitter: sp.width * 0.4, intensity: 1.2 });
  });
  await scan;
  // ...that wobbles and rises into a new shape
  vfx.prim.pillar(c.userFeet.clone(), { color: 0xc8a8ff, radius: Math.max(0.7, sp.width * 0.5), height: sp.height * 1.8, ms: 900, intensity: 0.35 });
  const sparkle = vfx.spiral(c.userFeet, { color: [0xffffff, 0xc8a8ff], tex: 'star', ms: 700, radius: Math.max(0.7, sp.width * 0.5), rise: 2.6, size: [0.12, 0.24], rate: 50, intensity: 1.4 });
  await during(c, 520, (k) => {
    const e = ease.outBack(k);
    const w = Math.sin(k * Math.PI * 4) * (1 - k) * 0.15;
    sp.body.scale.set(1.35 - 0.35 * e + w, 0.25 + 0.75 * e - w, 1.35 - 0.35 * e + w);
  });
  sp.body.scale.set(1, 1, 1);
  // snap: bright flash (the new form is swapped in by the presenter)
  vfx.prim.shockwave(sp.at(0.5), { color: 0xffffff, radius: 2, ms: 350, thickness: 0.12, intensity: 1.2 });
  vfx.burst(sp.at(0.5), { count: 16, tex: 'spark', color: [0xffffff, 0xc8a8ff], speed: [2, 5], size: [0.12, 0.24], life: [0.3, 0.5] });
  stage.flash(0xf0e8ff, 0.15, 200);
  u.silhouette.value = 0;
  sp.flash(0xffffff, 300, 1);
  sp.setOutline(0);
  if (!c.missed) c.impact(0);
  await sparkle;
  await vfx.wait(100);
});

registerMoveFx('ENDEAVOR', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  const GRIT = { core: 0xffe0d0, main: 0xff4a3a, dark: 0x5a0a0a };
  // battered but determined: a flickering red aura of grit
  sp.setOutline(1.4, GRIT.main);
  sp.shake(0.05, 0.6);
  const aura = during(c, 600, () => {
    const a = Math.random() * Math.PI * 2;
    const R = Math.max(0.6, sp.width * 0.45);
    vfx.particle({ tex: 'flame', pos: c.userFeet.clone().add(V(Math.cos(a) * R, 0.2, Math.sin(a) * R)), vel: V(0, 2 + Math.random() * 1.5, 0), life: 0.45, size: [0.45, 0.12], color: [0xff8060, 0xa01010], intensity: 1.3, alpha: [0.8, 0] });
  });
  for (let i = 0; i < 2; i++) {
    sp.flash(GRIT.main, 200, 0.5);
    await vfx.wait(260);
  }
  await aura;
  await rush(c, { ms: 360, ghosts: 3, ghostColor: 0xff8070, lines: true });
  sp.setOutline(0);
  const at = c.aim(0.5);
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.2, pal: GRIT, stop: true });
    c.impact(0);
    // the target's strength is dragged down to the user's level
    c.target.flash(0x8a1010, 600, 0.5);
    const tc = c.target.at(0.6);
    void during(c, 500, () => {
      for (let i = 0; i < 2; i++) {
        const p = tc.clone().add(V((Math.random() - 0.5) * c.target.width, (Math.random() - 0.2) * c.target.height * 0.6, (Math.random() - 0.5) * 0.4));
        vfx.particle({ tex: 'streak', pos: p, vel: V(0, -4, 0), life: 0.3, size: [0.7, 0.3], color: GRIT.main, intensity: 1.2, rot: Math.PI / 2, alpha: [0.9, 0] });
      }
    });
    vfx.prim.shockwave(c.foeFeet.clone().setY(c.foeFeet.y + 0.05), { color: GRIT.main, radius: 2, facing: 'ground', ms: 500, thickness: 0.18 });
  }
  await vfx.wait(650);
});

registerMoveFx('STRENGTH', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  // gather strength: swell and plant the feet
  sp.setOutline(1.5, 0xffd080);
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: 0xffc070, radius: 2, facing: 'ground', ms: 450, thickness: 0.2 });
  vfx.burst(c.user, { count: 20, tex: 'spark', color: [0xffffff, 0xffc060], speed: 0.1, jitter: 1.6, attract: { to: c.user, strength: 14 }, life: [0.4, 0.6], size: [0.1, 0.2] });
  await vfx.tween(320, (k) => (sp.scale = 1 + 0.12 * ease.outQuad(k)), ease.linear);
  vfx.dust(c.userFeet, DUST, 10);
  vfx.shake(0.08, 200);
  sp.scale = 1.12;
  const lunge = rush(c, { ms: 440, dist: Math.min(4.2, c.user.distanceTo(c.foe) * 0.58), ghosts: 2, ghostColor: 0xffd8a0 });
  void vfx.tween(440, (k) => (sp.scale = 1.12 - 0.12 * k), ease.linear);
  await lunge;
  sp.setOutline(0);
  const at = c.aim(0.5);
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.35, pal: WHITE, stop: true, flash: 0.15 });
    for (let i = 0; i < 3; i++) vfx.prim.shockwave(at.clone().addScaledVector(c.dir, 0.3 + i * 0.45), { color: i ? 0xffd090 : 0xffffff, radius: 1.3 + i * 0.5, facing: c.dir, ms: 380, thickness: 0.18, intensity: 1.1 });
    vfx.prim.crack(c.foeFeet, { radius: 1.3, ms: 900, color: 0x3a2a18 });
    vfx.prim.debris({ from: c.foeFeet.clone().setY(c.foeFeet.y + 0.15), count: 7, color: 0x7a6a58, size: 0.1, speed: 3, up: 3, ms: 800 });
    c.impact(0);
  }
  await vfx.wait(600);
  sp.scale = 1;
});

registerMoveFx('STOMP', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  const b = sp.body.position;
  const D = Math.max(0.8, c.user.distanceTo(c.foe) - 0.35);
  const H = 2.6;
  const top = c.target.height * 0.55;
  await vfx.tween(160, (k) => (b.y = -0.1 * k), ease.outQuad);
  b.y = 0;
  vfx.dust(c.userFeet, DUST, 8);
  // leap up and over the target...
  let n = 0;
  await during(c, 380, (k) => {
    b.copy(c.dir).multiplyScalar(D * ease.inOutQuad(k));
    sp.hop = H * ease.outQuad(k);
    if (n++ % 3 === 1) vfx.prim.afterimage(sp.mesh, { color: 0xfff0d8, opacity: 0.25, ms: 240 });
  });
  await vfx.wait(60);
  // ...and STOMP straight down
  const downFrom = sp.at(0.5).add(V(0, sp.hop, 0));
  speedLines(c, downFrom.clone().add(V(0, -0.8, 0)), V(0, -1, 0), { count: 10, radius: 0.8, speed: 14 });
  await during(c, 130, (k) => (sp.hop = H + (top - H) * ease.inQuad(k)));
  const at = c.aim(0.7);
  if (c.missed) {
    whiff(c, at);
    vfx.dust(c.userFeet.clone().addScaledVector(c.dir, D), DUST, 12);
    vfx.shake(0.15, 250);
  } else {
    impactFx(c, at, { strength: 1.2, pal: WHITE, stop: true });
    const t = c.target;
    void (async () => {
      await vfx.tween(80, (k) => (t.scale = 1 - 0.22 * k), ease.outQuad);
      await vfx.tween(300, (k) => (t.scale = 0.78 + 0.22 * k), ease.outBack);
      t.scale = 1;
    })();
    const g = c.foeFeet.clone().setY(c.foeFeet.y + 0.06);
    vfx.prim.shockwave(g, { color: 0xe8d8b8, radius: 3.2, facing: 'ground', ms: 500, thickness: 0.2, intensity: 1 });
    vfx.prim.crack(c.foeFeet, { radius: 1.5, ms: 900, color: 0x3a2a18 });
    vfx.dust(c.foeFeet, DUST, 16);
    c.impact(0);
    c.stage.wait(200).then(() => dizzy(c, t));
  }
  // bounce back home
  await vfx.wait(120);
  await during(c, 380, (k) => {
    b.copy(c.dir).multiplyScalar(D * (1 - ease.inOutQuad(k)));
    sp.hop = top * (1 - k) + Math.sin(k * Math.PI) * 0.9;
  });
  b.set(0, 0, 0);
  sp.hop = 0;
  vfx.dust(c.userFeet, DUST, 6);
  await vfx.wait(350);
});

registerMoveFx('CHARM', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  const PINK = 0xff7ab8;
  // a cute hop and a wink of sparkles
  void sp.jump(0.35, 300);
  sp.flash(0xffc0e0, 350, 0.45);
  const hd = sp.at(0.8);
  vfx.particle({ tex: 'star', pos: towardCam(c, hd, 0.4), life: 0.35, size: [0.2, 0.7], color: 0xffffff, intensity: 1.4, alpha: [1, 0], spin: 3 });
  vfx.burst(hd, { count: 14, tex: 'star', color: [0xffffff, 0xffa0d0], speed: [1, 2.5], size: [0.1, 0.2], life: [0.4, 0.7], intensity: 1.3 });
  await vfx.wait(280);
  // hearts float over to the target
  const N = 5;
  const hearts = Array.from({ length: N }, () => glyph(c, 'heart', { color: PINK, edge: 0x7a1040, intensity: 1.1 }));
  const from = c.user.clone().addScaledVector(c.dir, 0.4).add(V(0, 0.3, 0));
  const to = c.aim(0.6);
  const side = sideOf(c.dir);
  const TRAVEL = 700;
  const off = hearts.map((_, i) => ({ t0: i * 90, s: (i - (N - 1) / 2) * 0.35, ph: Math.random() * 6 }));
  let first = true;
  await during(c, off[N - 1].t0 + TRAVEL + 20, (_k, _dt, el) => {
    hearts.forEach((h, i) => {
      const t = (el - off[i].t0) / TRAVEL;
      if (t < 0 || t > 1.2) return;
      const k = Math.min(1, t);
      const p = from.clone().lerp(to, ease.inOutQuad(k));
      p.addScaledVector(side, off[i].s * Math.sin(k * Math.PI) + Math.sin(k * 9 + off[i].ph) * 0.15);
      p.y += Math.sin(k * Math.PI) * 0.6 + Math.cos(k * 7 + off[i].ph) * 0.1;
      const pulse = 1 + Math.sin(el / 60 + i) * 0.1;
      h.set(p, 0.44 * pulse * Math.min(1, k * 4), 1, Math.sin(el / 150 + i) * 0.25);
      if (Math.random() < 0.3) vfx.particle({ tex: 'dot', pos: p.clone(), life: 0.4, size: [0.07, 0.02], color: 0xffc0e0, intensity: 1.3 });
      if (t >= 1) {
        h.root.visible = false;
        (off[i] as { t0: number }).t0 = 1e9;
        vfx.burst(p, { count: 6, tex: 'star', color: [0xffffff, PINK], speed: [1, 2.5], size: [0.1, 0.18], life: 0.4 });
        if (first && !c.missed) {
          first = false;
          c.impact(0);
          c.target.flash(PINK, 500, 0.5);
          c.target.shake(0.04, 0.4);
        }
      }
    });
  });
  hearts.forEach((h) => h.dispose());
  // attack falls: the target is smitten
  if (!c.missed) await statFx(c, 'foe', true, 0xff8ac0, 500);
  await vfx.wait(250);
});

registerMoveFx('HYPER_FANG', async (c) => {
  const { vfx } = c;
  await rush(c, { ms: 320, dist: Math.min(3.6, c.user.distanceTo(c.foe) * 0.5), ghosts: 2, lines: true });
  const at = c.aim(0.55);
  const p = towardCam(c, at, 1.0);
  const z = THREE.MathUtils.clamp(p.distanceTo(c.stage.camera.position) / 12, 0.5, 1);
  const f = vfx.prim.fangs(p, { color: 0xfff8f0, edge: 0x2a1a10, size: 1.05 * z, ms: 560, intensity: 0.85 });
  await f.bitten;
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.25, pal: WHITE, stop: true });
    vfx.burst(p, { count: 10, tex: 'shard', color: [0xffffff, 0xe8e0d0], speed: [3, 6], size: [0.12, 0.24], life: [0.3, 0.5], gravity: 6, spin: 8 });
    c.impact(0);
    c.stage.wait(150).then(() => dizzy(c, c.target));
  }
  await f.done;
  await vfx.wait(350);
});

registerMoveFx('CUT', async (c) => {
  const { vfx } = c;
  await rush(c, { ms: 320, dist: Math.min(3.4, c.user.distanceTo(c.foe) * 0.48) });
  const at = c.aim(0.55);
  const ang = c.side === 0 ? -0.9 : Math.PI + 0.9;
  const r = slashStroke(c, strokePoints(c, at, ang, 2.8, 0.3, 9), { color: 0xd8e8ff, core: 0xffffff, width: 0.12, ms: 110, length: 0.9, holdMs: 90, fadeMs: 240, intensity: 1.2, edge: 0x10141c, e: ease.inQuad });
  vfx.prim.ribbon(strokePoints(c, at, ang, 2.5, 0.55, 9), { color: 0xa8c0e8, core: 0xe8f0ff, width: 0.06, ms: 110, length: 0.6, fadeMs: 160, opacity: 0.5, intensity: 1, e: ease.inQuad });
  await r.arrived;
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 0.95, pal: { core: 0xffffff, main: 0xc8d8ff, dark: 0x6070a0 }, ground: false });
    c.impact(0);
  }
  await vfx.wait(480);
});

registerMoveFx('HIDDEN_POWER', async (c) => {
  const { vfx, stage } = c;
  const HP = { core: 0xe8c8ff, main: 0x8a3aff, dark: 0x1a0830 };
  const N = 6;
  const sp = c.attacker;
  stage.setTint(0x4a3a70, 0.3, 350);
  const ctr = c.user.clone();
  const R = Math.max(1.0, sp.width * 0.7);
  const orbs = Array.from({ length: N }, () => vfx.prim.orb({ color: HP.main, core: HP.core, radius: 0.28, intensity: 1.3 }));
  const pos = (i: number, rot: number, r: number) => {
    const a = rot + (i / N) * Math.PI * 2;
    return ctr.clone().add(V(Math.cos(a) * r, Math.sin(a * 2 + rot) * 0.25, Math.sin(a) * r));
  };
  // mysterious orbs of power materialise and circle the user
  sp.setOutline(1.1, HP.main);
  let rot = 0;
  await during(c, 800, (k, dt) => {
    rot += dt * (2 + 4 * k);
    orbs.forEach((o, i) => {
      o.mesh.position.copy(pos(i, rot, R * (1.3 - 0.3 * ease.outQuad(k))));
      o.mesh.scale.setScalar(0.01 + ease.outBack(Math.min(1, k * 2 - i * 0.12 > 0 ? Math.min(1, k * 2 - i * 0.12) : 0)));
      if (Math.random() < 0.25) vfx.particle({ tex: 'glow', pos: o.mesh.position.clone(), life: 0.3, size: [0.35, 0.1], color: HP.main, intensity: 1, alpha: [0.6, 0] });
    });
  });
  sp.setOutline(0);
  // ...then all converge on the target
  const to = c.aim(0.5);
  const starts = orbs.map((o) => o.mesh.position.clone());
  const T0 = orbs.map((_, i) => i * 45);
  const TRAVEL = 380;
  const done = orbs.map(() => false);
  let hit = false;
  await during(c, T0[N - 1] + TRAVEL + 20, (_k, dt, el) => {
    rot += dt * 6;
    orbs.forEach((o, i) => {
      if (done[i]) return;
      const t = (el - T0[i]) / TRAVEL;
      if (t < 0) {
        o.mesh.position.copy(pos(i, rot, R));
        starts[i].copy(o.mesh.position);
        return;
      }
      const k = Math.min(1, t);
      const mid = starts[i].clone().lerp(to, 0.5).add(V(0, 0.8, 0));
      const p = qbez(starts[i], mid, to, ease.inQuad(k));
      o.mesh.position.copy(p);
      vfx.particle({ tex: 'glow', pos: p.clone(), life: 0.25, size: [0.35, 0.08], color: [HP.main, HP.dark], intensity: 1, alpha: [0.6, 0] });
      if (t >= 1) {
        done[i] = true;
        o.mesh.visible = false;
        if (!c.missed) {
          softHit(c, towardCam(c, p, 0.5), HP, 0.4);
          if (!hit) {
            hit = true;
            c.impact(0);
          }
        } else vfx.burst(p, { count: 5, tex: 'spark', color: HP.main, speed: 2 });
      }
    });
  });
  orbs.forEach((o) => o.dispose());
  if (!c.missed) {
    impactFx(c, to, { strength: 1.0, pal: HP, stop: true });
    vfx.burst(to, { count: 10, tex: 'wisp', color: [0x3a1a5a, 0x0a0414], speed: [0.6, 2], size: [0.5, 0.8], endSize: 1.3, life: [0.5, 0.8], drag: 2, additive: false, alpha: [0.7, 0], spin: 2 });
  }
  stage.setTint(0xffffff, 0, 350);
  await vfx.wait(550);
});

registerMoveFx('EXTREME_SPEED', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const u = sp.uniforms;
  const b = sp.body.position;
  const D = gapDist(c, 1.0);
  const side = sideOf(c.dir);
  // a split-second crouch and a white glint...
  sp.flash(0xffffff, 150, 0.9);
  await vfx.tween(110, (k) => (b.y = -0.1 * k), ease.outQuad);
  b.y = 0;
  vfx.particle({ tex: 'star', pos: towardCam(c, sp.at(0.7), 0.5), life: 0.2, size: [0.3, 1.1], color: 0xffffff, intensity: 1.5, alpha: [1, 0] });
  await vfx.wait(90);
  // ...then gone: a zig-zag streak of afterimages straight into the target
  vfx.dust(c.userFeet, 0xd8c8a8, 12);
  const zig = [0.3, 0.55, 0.8].map((f, i) => c.dir.clone().multiplyScalar(D * f).addScaledVector(side, (i % 2 ? -1 : 1) * 0.6));
  const pts = [c.user.clone().addScaledVector(c.dir, 0.6), ...zig.map((z) => c.user.clone().add(z)), c.user.clone().addScaledVector(c.dir, D)];
  for (const z of zig) {
    b.copy(z);
    vfx.prim.afterimage(sp.mesh, { color: 0xffe0a0, opacity: 0.3, ms: 300 });
  }
  vfx.prim.ribbon(pts, { color: 0xffe8b0, core: 0xffffff, width: 0.09, ms: 90, length: 1, holdMs: 40, fadeMs: 220, intensity: 1.0 });
  speedLines(c, c.user.clone().lerp(c.foe, 0.5), c.dir, { count: 10, radius: 1.2, speed: 22, intensity: 1.1 });
  stage.chromaPulse(0.008, 200);
  b.copy(c.dir).multiplyScalar(D);
  await vfx.wait(70);
  const at = c.aim(0.5);
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.2, pal: WHITE, stop: true });
    // two ghost-strikes flicker around the target in the same instant
    for (const s of [-1, 1]) {
      const q = towardCam(c, at.clone().addScaledVector(side, s * 0.5).add(V(0, s * 0.3, 0)), 0.6);
      vfx.prim.impactStar(q, { color: 0xffd070, core: 0xffffff, size: 0.45, ms: 180 });
    }
    c.impact(0);
  }
  await vfx.wait(280);
  // blink back home
  vfx.prim.afterimage(sp.mesh, { color: 0xfff8e0, opacity: 0.4, ms: 260 });
  u.opacity.value = 0;
  vfx.prim.ribbon([c.user.clone().addScaledVector(c.dir, D), c.user.clone()], { color: 0xfff4d0, core: 0xffffff, width: 0.08, ms: 80, length: 1, fadeMs: 180, intensity: 1 });
  b.set(0, 0, 0);
  await vfx.wait(90);
  u.opacity.value = 1;
  sp.flash(0xffffff, 150, 0.7);
  vfx.dust(c.userFeet, 0xd8c8a8, 6);
  await vfx.wait(350);
});

registerMoveFx('SMELLING_SALT', async (c) => {
  const { vfx } = c;
  const SALT = 0xf0f8ff;
  await rush(c, { ms: 320, dist: Math.min(3.6, c.user.distanceTo(c.foe) * 0.5), ghosts: 1 });
  const at = c.aim(0.6);
  const ang = c.side === 0 ? 0.25 : Math.PI - 0.25;
  const r = slashStroke(c, strokePoints(c, at, ang, 2.0, 0.4, 8), { color: 0xffe8c8, core: 0xffffff, width: 0.15, ms: 80, length: 0.7, holdMs: 0, fadeMs: 180, intensity: 1.1, e: ease.inQuad });
  await r.arrived;
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.0, pal: WHITE, ground: false, stop: true });
    // a pungent jolt: salt crystals burst off and a zap snaps the target awake
    vfx.burst(towardCam(c, at, 0.5), { count: 22, tex: 'shard', color: [0xffffff, SALT], speed: [2, 6], size: [0.08, 0.16], life: [0.4, 0.7], gravity: 6, spin: 10, intensity: 1.2 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.random();
      vfx.prim.lightning(at, at.clone().add(V(Math.cos(a) * 1.1, Math.sin(a) * 0.9, 0.2)), { color: 0xfff080, width: 0.03, jitter: 0.18, segments: 6, ms: 150, intensity: 1.2 });
    }
    c.target.flash(0xfff4a0, 300, 0.6);
    c.impact(0);
  }
  await vfx.wait(500);
});

registerMoveFx('HYPER_VOICE', async (c) => {
  const { vfx, stage } = c;
  const VOICE = { core: 0xffffff, a: 0xffe6a0, b: 0xa0d0ff };
  vfx.shot('side', c.side, 400);
  const sp = c.attacker;
  const mouth = sp.at(0.72).addScaledVector(c.dir, 0.4);
  const to = c.aim(0.55);
  const fwd = to.clone().sub(mouth).normalize();
  // deep breath...
  await vfx.tween(260, (k) => (sp.scale = 1 + 0.08 * ease.outQuad(k)), ease.linear);
  vfx.burst(mouth, { count: 16, tex: 'spark', color: [0xffffff, VOICE.a], speed: 0.1, jitter: 1.2, attract: { to: mouth, strength: 14 }, life: [0.3, 0.45], size: [0.1, 0.2] });
  await vfx.wait(120);
  // ...ROAR: huge concentric sound rings slam across the field
  sp.scale = 1;
  stage.chromaPulse(0.012, 900);
  vfx.shake(0.15, 900);
  sp.shake(0.08, 0.8);
  const travel = 360;
  let last = -1e9;
  let hit = false;
  let n = 0;
  await during(c, 900, (_k, _dt, el) => {
    if (el - last > 130 && el < 650) {
      last = el;
      const col = n++ % 2 ? VOICE.b : VOICE.a;
      const end = to.clone().addScaledVector(fwd, 0.8);
      const sw = vfx.prim.shockwave(mouth, { color: col, radius: 3.4, startRadius: 0.4, ms: travel + 80, thickness: 0.16, facing: fwd, intensity: 1.2 });
      const sw2 = vfx.prim.shockwave(mouth, { color: VOICE.core, radius: 2.6, startRadius: 0.3, ms: travel + 80, thickness: 0.07, facing: fwd, intensity: 1.1 });
      void during(c, travel + 80, (k) => {
        sw.mesh.position.lerpVectors(mouth, end, Math.min(1, k * 1.1));
        sw2.mesh.position.lerpVectors(mouth, end, Math.min(1, k * 1.05));
      });
      speedLines(c, mouth.clone().lerp(to, 0.4), fwd, { count: 4, radius: 0.9, color: VOICE.a, size: 1.4, speed: 16, life: 0.22, intensity: 1.1 });
    }
    if (!hit && el > travel) {
      hit = true;
      if (!c.missed) {
        impactFx(c, to, { strength: 1.2, pal: { core: 0xffffff, main: VOICE.a, dark: 0x8a7a50 }, ground: false });
        c.target.shake(0.16, 0.8);
        c.impact(0);
      }
    }
  });
  if (!c.missed) {
    const tc = c.target.at(0.5);
    for (let i = 0; i < 3; i++) c.stage.wait(i * 100).then(() => vfx.prim.shockwave(tc, { color: VOICE.b, radius: 1.6 + i * 0.4, ms: 320, thickness: 0.1, intensity: 1.1 }));
  }
  vfx.shot('wide', c.side, 500);
  await vfx.wait(450);
});

registerMoveFx('SING', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  const COLS = [0xff78c0, 0x78c8ff, 0xffd850, 0x90f090];
  // a gentle lullaby: musical notes waft over to the target
  void sp.jump(0.2, 300);
  const N = 7;
  const from = sp.at(0.72).addScaledVector(c.dir, 0.4);
  const to = c.aim(0.75);
  const side = sideOf(c.dir);
  const notes = Array.from({ length: N }, (_, i) => glyph(c, i % 3 === 1 ? 'note2' : 'note', { color: COLS[i % COLS.length], edge: 0x1a1030, intensity: 1.05 }));
  const TRAVEL = 1000;
  const t0 = notes.map((_, i) => i * 110);
  const ph = notes.map(() => Math.random() * 6);
  let hit = false;
  const sway = during(c, t0[N - 1] + TRAVEL + 400, (_k, _dt, el) => {
    sp.mesh.rotation.z = Math.sin(el / 180) * 0.08;
    if (hit) c.target.mesh.rotation.z = Math.sin(el / 220) * 0.12;
  });
  await during(c, t0[N - 1] + TRAVEL + 20, (_k, _dt, el) => {
    notes.forEach((g, i) => {
      const t = (el - t0[i]) / TRAVEL;
      if (t < 0 || t > 1.01) return;
      const k = Math.min(1, t);
      const p = from.clone().lerp(to, k);
      p.addScaledVector(side, Math.sin(k * Math.PI * 2 + ph[i]) * 0.45);
      p.y += Math.sin(k * Math.PI) * 0.9 + Math.sin(k * 11 + ph[i]) * 0.12;
      const a = Math.min(1, k * 5) * (k > 0.85 ? (1 - k) / 0.15 : 1);
      g.set(p, 0.42, a, Math.sin(el / 200 + ph[i]) * 0.3);
      if (Math.random() < 0.25) vfx.particle({ tex: 'dot', pos: p.clone(), life: 0.4, size: [0.06, 0.02], color: COLS[i % COLS.length], intensity: 1.3 });
      if (t >= 1) {
        g.root.visible = false;
        t0[i] = 1e9;
        if (!hit && !c.missed) {
          hit = true;
          c.target.flash(0xc0a0ff, 600, 0.4);
          c.impact(0);
        }
      }
    });
  });
  notes.forEach((g) => g.dispose());
  // drowsy: Zzz drift up from the target
  if (!c.missed) {
    const hd = c.target.at(0.95);
    for (let i = 0; i < 3; i++) {
      vfx.particle({ tex: 'zzz', pos: hd.clone().add(V(0.2 * i, 0.1 * i, 0)), vel: V(0.35, 0.7, 0), life: 1.0, size: [0.2 + i * 0.08, 0.45 + i * 0.1], color: 0xd8e8ff, intensity: 1.1, alpha: [1, 0], fadeIn: 0.2 });
      await vfx.wait(140);
    }
  }
  await sway;
  sp.mesh.rotation.z = 0;
  c.target.mesh.rotation.z = 0;
  await vfx.wait(200);
});

registerMoveFx('COVET', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  const PINK = 0xffa8d0;
  // an endearing little skip towards the target...
  sp.flash(0xffd0e8, 300, 0.4);
  vfx.burst(sp.at(0.8), { count: 10, tex: 'star', color: [0xffffff, PINK], speed: [1, 2], size: [0.1, 0.18], life: 0.5 });
  void sp.jump(0.35, 320);
  await vfx.wait(200);
  await rush(c, { ms: 320, dist: Math.min(3.6, c.user.distanceTo(c.foe) * 0.5), dust: false });
  const at = c.aim(0.5);
  if (c.missed) {
    whiff(c, at);
    await vfx.wait(450);
    return;
  }
  impactFx(c, at, { strength: 0.85, pal: { core: 0xffffff, main: PINK, dark: 0x8a3a5a }, ground: false });
  c.impact(0);
  // ...and a glinting treasure pops loose and flies back to the user
  const item = vfx.prim.orb({ color: 0xffd040, core: 0xffffff, radius: 0.16, intensity: 1.3 });
  const a = at.clone().add(V(0, 0.3, 0));
  const b = c.user.clone().add(V(0, 0.2, 0));
  const mid = a.clone().lerp(b, 0.5).add(V(0, 1.6, 0));
  await vfx.wait(120);
  await during(c, 560, (k) => {
    const p = qbez(a, mid, b, ease.inOutQuad(k));
    item.mesh.position.copy(p);
    if (Math.random() < 0.6) vfx.particle({ tex: 'star', pos: p.clone(), life: 0.35, size: [0.14, 0.04], color: [0xffffff, 0xffe070], intensity: 1.3 });
  });
  item.dispose();
  sp.flash(0xffe070, 300, 0.5);
  vfx.burst(b, { count: 12, tex: 'star', color: [0xffffff, 0xffe070], speed: [1, 3], size: [0.12, 0.22], life: 0.5, spin: 5 });
  await vfx.wait(350);
});

// ================================================================== FIGHTING

/** Karate-chop stroke through `at` at an on-screen angle, returns when it lands. */
function chop(c: MoveFxContext, at: THREE.Vector3, angle: number, o: { len?: number; width?: number; bend?: number; ms?: number; color?: number } = {}) {
  const r = slashStroke(c, strokePoints(c, at, angle, o.len ?? 2.6, o.bend ?? 0.25, 9), {
    color: o.color ?? CHOP,
    core: 0xffe0b0,
    width: o.width ?? 0.13,
    ms: o.ms ?? 110,
    length: 0.85,
    holdMs: 80,
    fadeMs: 220,
    intensity: 1.15,
    edge: 0x3a0a04,
    e: ease.inQuad,
  });
  c.vfx.prim.ribbon(strokePoints(c, at, angle, (o.len ?? 2.6) * 0.9, (o.bend ?? 0.25) + 0.3, 9), { color: FIGHT.main, core: CHOP, width: (o.width ?? 0.13) * 0.6, ms: o.ms ?? 110, length: 0.6, fadeMs: 160, opacity: 0.45, intensity: 1, e: ease.inQuad });
  return r.arrived;
}

/** Flame-like fighting aura licking up around the user for `ms`. */
function fightAura(c: MoveFxContext, ms: number, cols: [number, number] = [0xffb060, 0xe02010], rate = 2) {
  const R = Math.max(0.7, c.attacker.width * 0.5);
  return during(c, ms, () => {
    for (let i = 0; i < rate; i++) {
      const a = Math.random() * Math.PI * 2;
      c.vfx.particle({ tex: 'flame', pos: c.userFeet.clone().add(V(Math.cos(a) * R, 0.1 + Math.random() * 0.4, Math.sin(a) * R)), vel: V(0, 2.2 + Math.random() * 1.4, 0), life: 0.5, size: [0.55, 0.15], color: cols, intensity: 1.5, alpha: [0.8, 0] });
    }
  });
}

registerMoveFx('SEISMIC_TOSS', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const t = c.target;
  const D = gapDist(c, 1.1);
  sp.setOutline(1.3, CHOP);
  await dashIn(c, D, 320, 2, 0xffb070);
  if (c.missed) {
    whiff(c, c.aim(0.5), 0xffe0c0);
    sp.setOutline(0);
    await vfx.wait(250);
    await slideTo(c, 0, 320);
    await vfx.wait(200);
    return;
  }
  // GRAB
  vfx.prim.impactStar(towardCam(c, t.at(0.5), 0.6), { color: FIGHT.main, core: 0xfff4e0, size: 0.55, ms: 200 });
  t.flash(0xffa060, 260, 0.55);
  t.shake(0.06, 0.2);
  hitStop(c, 40);
  await vfx.wait(140);
  sp.setOutline(0);
  pulledShot(c, 'foe', 1.7, 1.5, 500);
  // the pair tumbles high into the sky, the user wheeling around its victim
  const T0 = c.foeFeet.clone();
  const A0 = c.userFeet.clone().addScaledVector(c.dir, D);
  const R = Math.max(0.8, A0.clone().setY(0).distanceTo(T0.clone().setY(0)));
  const ax0 = T0.clone().sub(A0).setY(0).normalize();
  // the orbit swings from the approach axis into the screen plane so the pair reads side by side
  const right = camBasis(c).right.setY(0).normalize();
  const ax1 = right.multiplyScalar(right.dot(ax0) >= 0 ? 1 : -1);
  const spin = c.side === 0 ? 1 : -1;
  const H = 2.3;
  const place = (theta: number, h: number) => {
    t.hop = h;
    t.mesh.rotation.z = spin * theta;
    const ax = ax0.clone().lerp(ax1, Math.min(1, theta / 2)).normalize();
    const off = ax.clone().multiplyScalar(-Math.cos(theta) * R).addScaledVector(UP, Math.sin(theta) * R + h);
    sp.body.position.copy(T0.clone().add(off).sub(c.userFeet));
    sp.mesh.rotation.z = spin * theta;
  };
  vfx.dust(T0, DUST, 16);
  vfx.prim.shockwave(T0.clone().setY(T0.y + 0.05), { color: 0xffd0a0, radius: 2.4, facing: 'ground', ms: 450, thickness: 0.2 });
  const tc = () => t.at(0.5).add(V(0, t.hop, 0));
  const ac = () => sp.at(0.5);
  let prevT = tc();
  let prevA = ac();
  const streaks = () => {
    const pT = tc();
    const pA = ac();
    emitAlong(prevT, pT, 0.15, (q) => {
      vfx.particle({ tex: 'glow', pos: q, life: 0.35, size: [0.8, 0.2], color: [0xffe0c0, FIGHT.main], intensity: 1.0, alpha: [0.7, 0] });
      if (Math.random() < 0.4) vfx.particle({ tex: 'spark', pos: q.clone(), vel: V((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0), life: 0.3, size: [0.2, 0.05], color: [0xffffff, CHOP], intensity: 1.4 });
    });
    emitAlong(prevA, pA, 0.15, (q) => vfx.particle({ tex: 'glow', pos: q, life: 0.35, size: [0.7, 0.18], color: [0xffb070, FIGHT.main], intensity: 0.9, alpha: [0.6, 0] }));
    prevT = pT;
    prevA = pA;
  };
  const TH = Math.PI * 2 + Math.PI / 2;
  await during(c, 620, (k) => {
    place(TH * ease.inOutQuad(k), H * ease.outQuad(k));
    streaks();
  });
  // apex: a flash as the orbit tops out
  const apex = t.at(0.5).add(V(0, H, 0));
  vfx.prim.shockwave(apex, { color: 0xffe0b0, radius: 2.6, ms: 400, thickness: 0.08, intensity: 1.1 });
  vfx.burst(apex, { count: 14, tex: 'star', color: [0xffffff, 0xffe080], speed: [2, 4], size: [0.12, 0.24], life: 0.5, spin: 5 });
  stage.chromaPulse(0.006, 200);
  await during(c, 110, (k) => place(TH + 0.15 * k, H + 0.1 * Math.sin(k * Math.PI)));
  // SLAM
  speedLines(c, apex.clone().add(V(0, -1.4, 0)), V(0, -1, 0), { count: 12, radius: 1, speed: 18, color: 0xffe0c0 });
  await during(c, 170, (k) => {
    place(TH + 0.15 - 0.15 * k, H * (1 - ease.inQuad(k)));
    streaks();
  });
  place(TH, 0);
  const at = t.at(0.35);
  impactFx(c, at, { strength: 1.6, pal: FIGHT, stop: true, flash: 0.3 });
  vfx.prim.crack(T0, { radius: 1.9, ms: 1100, glow: 0xff7a30, glowIntensity: 1.1 });
  const g = T0.clone().setY(T0.y + 0.06);
  for (let i = 0; i < 2; i++) vfx.prim.shockwave(g, { color: i ? FIGHT.main : 0xfff0d0, radius: 3 + i * 1.2, facing: 'ground', ms: 500 + i * 150, thickness: 0.18, intensity: 1 });
  vfx.burst(g.clone().setY(g.y + 0.3), { count: 18, tex: 'smoke', color: [0xd8c8a8, DUST], speed: [3, 6], dir: UP, spread: 1.45, flat: true, size: [0.7, 1.1], endSize: 2, life: [0.6, 0.9], drag: 3, additive: false, alpha: [0.6, 0] });
  vfx.prim.debris({ from: g.clone().setY(g.y + 0.2), count: 10, color: 0x7a6a58, size: 0.12, speed: 3.5, up: 4, ms: 900 });
  vfx.shake(0.45, 500);
  c.impact(0);
  // the target flops upright; the user springs back home
  await vfx.wait(160);
  const tz = t.mesh.rotation.z;
  const from = sp.body.position.clone();
  const az = sp.mesh.rotation.z - Math.round(sp.mesh.rotation.z / (Math.PI * 2)) * Math.PI * 2;
  void vfx.tween(300, (k) => (t.mesh.rotation.z = tz + (Math.round(tz / (Math.PI * 2)) * Math.PI * 2 - tz) * k), ease.outBack);
  await during(c, 440, (k) => {
    const e = ease.inOutQuad(k);
    sp.body.position.lerpVectors(from, V(0, 0, 0), e);
    sp.body.position.y = from.y * (1 - e) + Math.sin(k * Math.PI) * 0.8;
    sp.mesh.rotation.z = az * (1 - e);
  });
  sp.body.position.set(0, 0, 0);
  sp.mesh.rotation.z = 0;
  t.mesh.rotation.z = 0;
  t.hop = 0;
  vfx.dust(c.userFeet, DUST, 6);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(250);
});

registerMoveFx('REVENGE', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const RAGE = { core: 0xffe0c0, main: 0xff3a1a, dark: 0x5a0808 };
  // takes the blow first...
  sp.flash(0xffffff, 200, 0.8);
  sp.shake(0.1, 0.25);
  await slideTo(c, -0.35, 150, ease.outQuad);
  await vfx.wait(120);
  // ...then burns with fury
  stage.setTint(0x8a2010, 0.25, 250);
  sp.setOutline(1.8, RAGE.main);
  const aura = fightAura(c, 480, [0xffa060, 0xff2a10], 4);
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: RAGE.main, radius: 2.2, facing: 'ground', ms: 450, thickness: 0.22 });
  sp.shake(0.05, 0.45);
  for (let i = 0; i < 2; i++) {
    sp.flash(RAGE.main, 200, 0.5);
    vfx.prim.shockwave(c.user, { color: 0xff8050, radius: 1.8 + i * 0.5, ms: 300, thickness: 0.12 });
    vfx.burst(c.user, { count: 10, tex: 'spark', color: [0xffe0c0, RAGE.main], speed: [2, 5], size: [0.12, 0.24], life: [0.2, 0.4] });
    await vfx.wait(200);
  }
  await aura;
  await slideTo(c, 0, 80);
  await rush(c, { ms: 360, dist: Math.min(4.4, c.user.distanceTo(c.foe) * 0.6), ghosts: 3, ghostColor: 0xff7050, lines: true });
  sp.setOutline(0);
  const at = c.aim(0.5);
  if (c.missed) whiff(c, at, 0xffc0a0);
  else {
    impactFx(c, at, { strength: 1.4, pal: RAGE, stop: true, flash: 0.2 });
    vfx.burst(towardCam(c, at, 0.5), { count: 14, tex: 'flame', color: [0xffc070, 0xe02010], speed: [3, 6], size: [0.35, 0.6], life: [0.3, 0.5], drag: 2, intensity: 1.3 });
    c.impact(0);
  }
  stage.setTint(0xffffff, 0, 350);
  await vfx.wait(550);
});

registerMoveFx('SUPERPOWER', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  pulledShot(c, 'user', 1.4, 0.6, 400);
  // every muscle strains: a roaring aura, the ground cracks beneath
  sp.setOutline(2, 0xff5020);
  sp.shake(0.06, 0.7);
  const aura = fightAura(c, 700, [0xffc060, 0xe02010], 3);
  vfx.prim.crack(c.userFeet, { radius: 1.6, ms: 1300, glow: 0xff6a20, glowIntensity: 1.2 });
  vfx.prim.debris({ from: c.userFeet.clone().setY(c.userFeet.y + 0.1), count: 8, color: 0x7a6a58, size: 0.09, speed: 1.5, up: 4, ms: 900 });
  vfx.burst(c.user, { count: 30, tex: 'spark', color: [0xffe0c0, FIGHT.main], speed: 0.1, jitter: 2, attract: { to: c.user, strength: 20 }, life: [0.4, 0.6], size: [0.12, 0.24] });
  vfx.shake(0.1, 600);
  await vfx.tween(500, (k) => (sp.scale = 1 + 0.12 * ease.outQuad(k)), ease.linear);
  await aura;
  vfx.shot('wide', c.side, 300);
  // the charge
  const lunge = rush(c, { ms: 400, dist: Math.min(4.6, c.user.distanceTo(c.foe) * 0.62), ghosts: 4, ghostColor: 0xff9050, lines: true });
  void vfx.tween(400, (k) => (sp.scale = 1.12 - 0.12 * k), ease.linear);
  await lunge;
  sp.setOutline(0);
  const at = c.aim(0.5);
  if (c.missed) whiff(c, at, 0xffd0b0);
  else {
    vfx.prim.blast(at, { core: 0xffffff, main: 0xff7a20, dark: 0x7a1a08, radius: 1.6, ms: 850, intensity: 1.5 });
    impactFx(c, at, { strength: 1.6, pal: FIGHT, stop: true, flash: 0.35 });
    for (let i = 0; i < 3; i++) vfx.prim.shockwave(at, { color: i ? FIGHT.main : 0xfff0d0, radius: 2.4 + i, ms: 380 + i * 120, thickness: 0.16 });
    vfx.shake(0.45, 550);
    stage.chromaPulse(0.01, 300);
    c.impact(0);
  }
  sp.scale = 1;
  await vfx.wait(500);
  // the effort costs the user: attack and defense sag
  sp.setOutline(1, 0x6a9aff);
  await statFx(c, 'user', true, 0x6a9aff, 450);
  sp.setOutline(0);
  await vfx.wait(100);
});

registerMoveFx('SKY_UPPERCUT', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  const t = c.target;
  const D = gapDist(c, 1.0);
  // duck low and dash in
  await vfx.tween(140, (k) => (sp.body.position.y = -0.15 * k), ease.outQuad);
  sp.setOutline(1.3, CHOP);
  await dashIn(c, D, 280, 2, 0xffb070);
  // a rising uppercut arcs skyward
  const at = c.aim(0.45);
  const upAng = c.side === 0 ? Math.PI / 2 - 0.25 : Math.PI / 2 + 0.25;
  const arc = chop(c, at.clone().add(V(0, 0.4, 0)), upAng, { len: 3.0, bend: c.side === 0 ? -0.45 : 0.45, width: 0.15, ms: 120 });
  void sp.jump(1.3, 520);
  await arc;
  sp.setOutline(0);
  if (c.missed) whiff(c, at, 0xffd0b0);
  else {
    impactFx(c, at, { strength: 1.3, pal: FIGHT, stop: true, ground: false });
    speedLines(c, at.clone().add(V(0, 1.2, 0)), UP, { count: 12, radius: 0.8, speed: 16, color: 0xffe0c0 });
    c.impact(0);
    // the target is launched upward
    const trail = vfx.trail(() => t.at(0.5).add(V(0, t.hop, 0)), 420, { tex: 'streak', color: [0xffe0c0, FIGHT.main], size: [0.4, 0.7], life: 0.2, speed: 0.3, rate: 40, intensity: 1.1 });
    await vfx.tween(260, (k) => (t.hop = 1.6 * ease.outQuad(k)), ease.linear);
    await vfx.tween(260, (k) => (t.hop = 1.6 * (1 - ease.inQuad(k))), ease.linear);
    t.hop = 0;
    vfx.dust(c.foeFeet, DUST, 12);
    vfx.shake(0.15, 200);
    await trail;
  }
  await slideTo(c, 0, 320);
  sp.body.position.set(0, 0, 0);
  await vfx.wait(300);
});

registerMoveFx('HI_JUMP_KICK', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  const b = sp.body.position;
  const D = gapDist(c, 0.9);
  const H = 2.4;
  const end = c.target.height * 0.45;
  await vfx.tween(160, (k) => (b.y = -0.12 * k), ease.outQuad);
  b.y = 0;
  vfx.dust(c.userFeet, DUST, 10);
  sp.setOutline(1.3, CHOP);
  // soar up high...
  let n = 0;
  await during(c, 380, (k) => {
    b.copy(c.dir).multiplyScalar(D * 0.35 * k);
    sp.hop = H * ease.outQuad(k);
    if (n++ % 3 === 1) vfx.prim.afterimage(sp.mesh, { color: 0xffc080, opacity: 0.25, ms: 240 });
  });
  vfx.particle({ tex: 'star', pos: towardCam(c, sp.at(0.5).add(V(0, sp.hop, 0)), 0.4), life: 0.2, size: [0.3, 1.0], color: 0xffe0b0, intensity: 1.4, alpha: [1, 0] });
  await vfx.wait(80);
  // ...and drive a knee down into the target
  const D2 = c.missed ? D + 0.4 : D;
  const hEnd = c.missed ? 0 : end;
  let prev = sp.at(0.5).add(V(0, sp.hop, 0));
  await during(c, 170, (k) => {
    const e = ease.inQuad(k);
    b.copy(c.dir).multiplyScalar(D * 0.35 + (D2 - D * 0.35) * e);
    if (c.missed) b.addScaledVector(sideOf(c.dir), 1.2 * e);
    sp.hop = H + (hEnd - H) * e;
    const p = sp.at(0.5).add(V(0, sp.hop, 0));
    emitAlong(prev, p, 0.18, (q) => vfx.particle({ tex: 'glow', pos: q, life: 0.25, size: [0.55, 0.15], color: [0xffd0a0, FIGHT.main], intensity: 1, alpha: [0.6, 0] }));
    prev = p;
  });
  sp.setOutline(0);
  const at = c.aim(0.55);
  if (c.missed) {
    // crash! the user slams into the ground and hurts itself
    const g = sp.at(0);
    vfx.dust(g, DUST, 18);
    vfx.prim.crack(g, { radius: 1.2, ms: 800 });
    vfx.shake(0.3, 350);
    sp.flash(0xff4030, 350, 0.7);
    sp.shake(0.12, 0.4);
    vfx.particle({ tex: 'star', pos: towardCam(c, sp.at(0.4), 0.5), life: 0.25, size: [0.6, 1.4], color: 0xff8060, intensity: 1.5, alpha: [1, 0] });
    await vfx.wait(400);
  } else {
    impactFx(c, at, { strength: 1.45, pal: FIGHT, stop: true, flash: 0.15 });
    vfx.burst(towardCam(c, at, 0.6), { count: 8, tex: 'star', color: [0xffffff, 0xffe080], speed: [2, 5], size: [0.15, 0.28], life: [0.3, 0.5], spin: 6 });
    c.impact(0);
    await vfx.wait(140);
  }
  // hop back home
  const from = b.clone();
  const h0 = sp.hop;
  await during(c, 380, (k) => {
    b.lerpVectors(from, V(0, 0, 0), ease.inOutQuad(k));
    sp.hop = h0 * (1 - k) + Math.sin(k * Math.PI) * 0.8;
  });
  b.set(0, 0, 0);
  sp.hop = 0;
  vfx.dust(c.userFeet, DUST, 6);
  await vfx.wait(300);
});

registerMoveFx('COUNTER', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  // brace: a glowing guard catches the blow...
  sp.setOutline(1.6, 0xffa050);
  const guard = c.user.clone().addScaledVector(c.dir, 0.6);
  const sh = vfx.prim.shield(c.user, { color: 0xff8040, radius: Math.max(1.1, sp.height * 0.6), ms: 650, intensity: 1.2 });
  await vfx.wait(250);
  sp.flash(0xffd0a0, 150, 0.6);
  sp.shake(0.06, 0.15);
  vfx.prim.impactStar(towardCam(c, guard, 0.5), { color: 0xffb060, core: 0xffffff, size: 0.55, ms: 180 });
  hitStop(c, 50);
  // ...and the glint of a counter
  const hd = towardCam(c, sp.at(0.75), 0.4);
  vfx.particle({ tex: 'star', pos: hd, life: 0.3, size: [0.3, 1.3], color: 0xffffff, intensity: 1.6, alpha: [1, 0], spin: 4 });
  stage.chromaPulse(0.01, 200);
  await vfx.wait(180);
  await sh.done;
  // instant retaliation
  await rush(c, { ms: 260, dist: Math.min(4.4, c.user.distanceTo(c.foe) * 0.6), ghosts: 3, ghostColor: 0xff9050, lines: true });
  sp.setOutline(0);
  const at = c.aim(0.5);
  if (c.missed) whiff(c, at, 0xffd0b0);
  else {
    const ang = c.side === 0 ? -0.6 : Math.PI + 0.6;
    void chop(c, at, ang, { len: 2.4, width: 0.14, ms: 80 });
    impactFx(c, at, { strength: 1.3, pal: FIGHT, stop: true });
    vfx.prim.impactStar(towardCam(c, at, 0.8), { color: 0xff7a30, core: 0xffe8c0, size: 0.8, ms: 280, spikes: 8 });
    stage.chromaPulse(0.012, 280);
    c.impact(0);
  }
  await vfx.wait(550);
});

registerMoveFx('REVERSAL', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  // in a pinch, the user's aura flickers weakly...
  for (let i = 0; i < 3; i++) {
    sp.flash(0xff3020, 120, 0.4 + i * 0.1);
    await vfx.wait(140);
  }
  // ...then explodes with power
  sp.setOutline(1.8, 0xffa040);
  stage.chromaPulse(0.008, 250);
  vfx.prim.shockwave(c.user, { color: 0xffd080, radius: 2.4, ms: 380, thickness: 0.14 });
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: FIGHT.main, radius: 2.6, facing: 'ground', ms: 500, thickness: 0.22 });
  const sp1 = vfx.spiral(c.userFeet, { color: [0xffe0c0, 0xff5010], tex: 'spark', ms: 420, radius: Math.max(0.8, sp.width * 0.5), rise: 3.4, rate: 70 });
  void fightAura(c, 420, [0xffd080, 0xff3a10], 3);
  await sp1;
  await rush(c, { ms: 360, dist: Math.min(4.4, c.user.distanceTo(c.foe) * 0.6), ghosts: 3, ghostColor: 0xffa050, lines: true });
  sp.setOutline(0);
  const at = c.aim(0.5);
  if (c.missed) whiff(c, at, 0xffd0b0);
  else {
    impactFx(c, at, { strength: 1.4, pal: FIGHT, stop: true, flash: 0.2 });
    vfx.burst(at, { count: 16, tex: 'flame', color: [0xffe0a0, 0xff4010], speed: [2, 5], dir: UP, spread: 0.8, size: [0.3, 0.55], life: [0.3, 0.55], intensity: 1.3 });
    c.impact(0);
  }
  await vfx.wait(550);
});

// ================================================================== FLYING

const SKYPAL = { core: 0xffffff, main: 0xffc860, dark: 0x8a5a20 };

registerMoveFx('SKY_ATTACK', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const u = sp.uniforms;
  const R = Math.max(0.8, sp.width * 0.5);
  if (c.phase === 'charge') {
    // turn 1: the user glows and draws in the light of the sky
    pulledShot(c, 'user', 1.45, 0.9, 450);
    sp.setOutline(1.4, SKYPAL.main);
    vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: SKYPAL.main, radius: 2.4, facing: 'ground', ms: 900, thickness: 0.18, intensity: 1 });
    const gather = during(c, 1100, (k) => {
      for (let i = 0; i < 2; i++) {
        const d = V(Math.random() - 0.5, Math.random() * 0.8 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(2.4 + Math.random());
        vfx.particle({ tex: 'spark', pos: c.user.clone().add(d), vel: d.clone().multiplyScalar(-2.2), life: 0.42, size: [0.22, 0.06], color: [0xffffff, SKYPAL.main], intensity: 1.4, fadeIn: 0.2 });
      }
      if (Math.random() < 0.5) vfx.particle({ tex: 'glow', pos: c.user.clone(), life: 0.25, size: [1.2 + k * 1.4, 1.6 + k * 1.6], color: SKYPAL.main, intensity: 0.45, alpha: [0.45, 0] });
    });
    const rise = vfx.spiral(c.userFeet, { color: [0xffffff, SKYPAL.main], tex: 'star', ms: 1000, radius: R, rise: 3, size: [0.12, 0.22], rate: 40, intensity: 1.3 });
    for (let i = 0; i < 3; i++) {
      await vfx.wait(300);
      sp.flash(0xfff0c0, 260, 0.35 + i * 0.12);
      vfx.prim.shockwave(c.user, { color: 0xfff0c0, radius: 1.8 + i * 0.3, ms: 320, thickness: 0.1, intensity: 1.1 });
    }
    await Promise.all([gather, rise]);
    sp.setOutline(0);
    vfx.shot('wide', c.side, 500);
    await vfx.wait(200);
    return;
  }
  // turn 2: the user blazes up into the sky...
  const b = sp.body.position;
  sp.setOutline(1.6, SKYPAL.main);
  sp.flash(0xffffff, 300, 0.8);
  (u.silColor.value as THREE.Color).set(0xffe0a0);
  vfx.dust(c.userFeet, DUST, 12);
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: SKYPAL.main, radius: 2.4, facing: 'ground', ms: 450, thickness: 0.2 });
  const H = 4.2;
  await during(c, 300, (k) => {
    sp.hop = H * ease.inQuad(k);
    u.silhouette.value = 0.55 * k;
    vfx.particle({ tex: 'glow', pos: sp.at(0.5).add(V(0, sp.hop, 0)), life: 0.3, size: [0.8, 0.2], color: SKYPAL.main, intensity: 0.9, alpha: [0.6, 0] });
  });
  // ...reappears as a glint high above the field...
  const D = gapDist(c, 0.9);
  const hEnd = c.target.height * 0.25;
  const startB = c.dir.clone().multiplyScalar(D * 0.3);
  const H2 = 3.0;
  b.copy(startB);
  sp.hop = H2;
  const glint = sp.at(0.5).add(V(0, H2, 0));
  vfx.particle({ tex: 'star', pos: towardCam(c, glint, 0.5), life: 0.3, size: [0.4, 1.8], color: 0xffffff, intensity: 1.3, alpha: [1, 0], spin: 3 });
  vfx.prim.shockwave(glint, { color: SKYPAL.main, radius: 1.8, ms: 300, thickness: 0.1, intensity: 1.1 });
  await vfx.wait(170);
  // ...and dives down like a comet
  let prev = sp.at(0.5).add(V(0, sp.hop, 0));
  let n = 0;
  await during(c, 260, (k) => {
    const e = ease.inQuad(k);
    b.lerpVectors(startB, c.dir.clone().multiplyScalar(D), e);
    sp.hop = H2 + (hEnd - H2) * e;
    const p = sp.at(0.5).add(V(0, sp.hop, 0));
    emitAlong(prev, p, 0.16, (q) => {
      vfx.particle({ tex: 'flame', pos: q, vel: V((Math.random() - 0.5) * 1.2, 0.5, (Math.random() - 0.5) * 1.2), life: 0.35, size: [0.8, 0.2], color: [0xffe0a0, 0xff7a20], intensity: 1.0, alpha: [0.8, 0] });
      vfx.particle({ tex: 'glow', pos: q.clone(), life: 0.3, size: [1.2, 0.4], color: SKYPAL.main, intensity: 0.5, alpha: [0.5, 0] });
    });
    if (n++ % 2 === 0) vfx.prim.afterimage(sp.mesh, { color: 0xffd080, opacity: 0.35, ms: 260 });
    prev = p;
  });
  speedLines(c, c.aim(0.5).addScaledVector(c.dir, -1.5).add(V(0, 1, 0)), c.aim(0.5).sub(prev).normalize(), { count: 14, radius: 1.1, speed: 20, color: 0xfff0c0 });
  u.silhouette.value = 0;
  sp.setOutline(0);
  const at = c.aim(0.5);
  if (c.missed) {
    whiff(c, at, 0xfff0c0);
    vfx.dust(sp.at(0), DUST, 14);
  } else {
    vfx.prim.blast(at, { core: 0xffffff, main: 0xffb040, dark: 0x8a3a10, radius: 1.7, ms: 850, intensity: 1.4 });
    impactFx(c, at, { strength: 1.6, pal: SKYPAL, stop: true, flash: 0.35 });
    for (let i = 0; i < 3; i++) vfx.prim.shockwave(at, { color: i ? SKYPAL.main : 0xffffff, radius: 2.4 + i, ms: 380 + i * 120, thickness: 0.16, intensity: 1.1 });
    vfx.burst(at, { count: 12, tex: 'feather', color: [0xffffff, 0xffe8c0], speed: [2, 5], size: [0.25, 0.4], life: [0.7, 1.1], gravity: 1.2, drag: 2.5, additive: false, spin: 5 });
    vfx.shake(0.45, 550);
    stage.chromaPulse(0.01, 300);
    c.impact(0);
  }
  await vfx.wait(220);
  // glide back home
  const from = b.clone();
  const h0 = sp.hop;
  await during(c, 420, (k) => {
    b.lerpVectors(from, V(0, 0, 0), ease.inOutQuad(k));
    sp.hop = h0 * (1 - k) + Math.sin(k * Math.PI) * 1.0;
  });
  b.set(0, 0, 0);
  sp.hop = 0;
  await vfx.wait(300);
});

registerMoveFx('DRILL_PECK', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  const D = Math.max(0.8, c.user.distanceTo(c.foe) - 0.8);
  const from = c.user.clone().addScaledVector(c.dir, 0.3);
  const to = c.aim(0.5);
  const side = sideOf(c.dir);
  const spin = c.side === 0 ? -1 : 1;
  // wind up while starting to spin
  sp.setOutline(1.2, 0xd8e4ff);
  let rot = 0;
  const spinning = during(c, 980, (k, dt) => {
    rot += dt * (10 + 30 * Math.min(1, k * 2)) * (k > 0.8 ? (1 - k) / 0.2 : 1);
    sp.mesh.rotation.z = spin * rot;
  });
  await vfx.wait(160);
  // a spiralling drill of wind wraps the dash
  const helix = (ph: number) =>
    Array.from({ length: 36 }, (_, i) => {
      const t = i / 35;
      const a = t * Math.PI * 7 + ph;
      const r = 0.6 * (1 - t) + 0.12;
      return from.clone().lerp(to, t).addScaledVector(side, Math.cos(a) * r).add(V(0, Math.sin(a) * r, 0));
    });
  const dash = dashIn(c, D, 300, 3, 0xd0e0ff);
  await vfx.wait(135);
  for (const ph of [0, Math.PI]) vfx.prim.ribbon(helix(ph), { color: 0xa8c4ff, core: 0xffffff, width: 0.08, ms: 170, length: 0.7, holdMs: 120, fadeMs: 220, intensity: 1.1, e: ease.inQuad });
  speedLines(c, from.clone().lerp(to, 0.5), c.dir, { count: 10, radius: 0.9, speed: 16, color: 0xe0ecff });
  await dash;
  const at = c.aim(0.5);
  if (c.missed) whiff(c, at, 0xe8f0ff);
  else {
    // drilling: sparks spiral off the contact point
    const p = towardCam(c, at, 0.5);
    const tip = at.clone().addScaledVector(c.dir, -0.2);
    const cs = camBasis(c);
    await during(c, 300, (_k, _dt, el) => {
      // a whirling cone of wind with its point driven into the target
      for (let j = 0; j < 8; j++) {
        const f = Math.random();
        const a = el / 25 + f * 14 + j * 0.8;
        const r = 0.75 * f + 0.05;
        const q = tip.clone().addScaledVector(c.dir, -f * 1.5).addScaledVector(cs.right, Math.cos(a) * r).addScaledVector(cs.up, Math.sin(a) * r * 0.8);
        vfx.particle({ tex: 'spark', pos: q, life: 0.09, size: [0.2, 0.1], color: j % 2 ? 0xffffff : 0xa8c8ff, intensity: 1.3, alpha: [0.9, 0.3] });
      }
      vfx.burst(p, { count: 3, tex: 'spark', color: [0xffffff, 0xa8c8ff], speed: [3, 6], size: [0.14, 0.26], life: [0.15, 0.3], swirl: { center: p, speed: 8 }, intensity: 1.4 });
      if (el % 90 < 34) vfx.prim.shockwave(p, { color: 0xc8d8ff, radius: 0.9, ms: 180, thickness: 0.12, facing: c.dir, intensity: 1.1 });
      c.target.shake(0.05, 0.1);
    });
    impactFx(c, at, { strength: 1.2, pal: FLYPAL, stop: true });
    vfx.burst(p, { count: 8, tex: 'feather', color: [0xffffff, 0xd8e0f0], speed: [2, 4], size: [0.2, 0.35], life: [0.6, 1], gravity: 1.2, drag: 2.5, additive: false, spin: 5 });
    c.impact(0);
  }
  await slideTo(c, 0, 320);
  await spinning;
  sp.mesh.rotation.z = 0;
  sp.setOutline(0);
  await vfx.wait(250);
});

registerMoveFx('AEROBLAST', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const AIR = { core: 0xffffff, main: 0x9ac0ff, dark: 0x3a5aa0 };
  vfx.shot('side', c.side, 450);
  const from = sp.at(0.62).addScaledVector(c.dir, 0.6);
  const to = c.aim(0.5);
  const fwd = to.clone().sub(from).normalize();
  const side = sideOf(fwd);
  // air is sucked into a spinning vortex before the user's mouth
  sp.setOutline(1.2, AIR.main);
  let last = -1e9;
  await during(c, 650, (k, _dt, el) => {
    for (let i = 0; i < 2; i++) {
      const d = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(1.8 + Math.random() * 0.6);
      vfx.particle({ tex: 'streak', pos: from.clone().add(d), vel: d.clone().multiplyScalar(-2.6), swirl: { center: from, speed: 5 }, life: 0.38, size: [0.45, 0.15], color: [0xffffff, AIR.main], intensity: 1.2, alpha: [0.8, 0], fadeIn: 0.2 });
    }
    if (el - last > 130) {
      last = el;
      vfx.prim.shockwave(from, { color: AIR.main, radius: 0.2, startRadius: 1.4, ms: 260, thickness: 0.18, facing: fwd, intensity: 1.1 });
    }
    vfx.particle({ tex: 'glow', pos: from.clone(), life: 0.1, size: 0.5 + k * 0.7, color: 0x6a98f0, intensity: 0.7, alpha: [0.6, 0] });
  });
  // FIRE: a roaring beam of compressed air wrapped in twin vortex spirals
  stage.chromaPulse(0.01, 400);
  vfx.shake(0.15, 600);
  const beam = vfx.prim.beam(from, to, { color: 0x6a98f0, core: 0xd8e8ff, width: 0.3, holdMs: 520, intensity: 0.95 });
  const helix = (ph: number) =>
    Array.from({ length: 48 }, (_, i) => {
      const t = i / 47;
      const a = t * Math.PI * 10 + ph;
      const r = 0.55 + 0.2 * t;
      return from.clone().lerp(to, t).addScaledVector(side, Math.cos(a) * r).add(V(0, Math.sin(a) * r, 0));
    });
  for (const ph of [0, Math.PI]) vfx.prim.ribbon(helix(ph), { color: 0x9ab8f0, core: 0xe8f0ff, width: 0.05, ms: 200, length: 1, holdMs: 380, fadeMs: 250, intensity: 0.85 });
  let lastR = -1e9;
  const rings = during(c, 700, (_k, _dt, el) => {
    if (el - lastR > 100 && el < 560) {
      lastR = el;
      const sw = vfx.prim.shockwave(from, { color: 0xa8c4ff, radius: 1.1, startRadius: 0.6, ms: 300, thickness: 0.1, facing: fwd, intensity: 0.85 });
      void during(c, 300, (k) => sw.mesh.position.lerpVectors(from, to, k));
    }
  });
  await beam.arrived;
  if (c.missed) vfx.burst(to, { count: 14, tex: 'streak', color: [0xffffff, AIR.main], speed: [3, 6], size: [0.4, 0.7], life: 0.3 });
  else {
    impactFx(c, to, { strength: 1.4, pal: { core: 0xe8f0ff, main: 0x6a98f0, dark: 0x2a4a90 }, stop: true });
    vfx.prim.vortex(c.foeFeet.clone(), { color: 0x6a98f0, color2: 0xd8e8ff, radius: Math.max(0.9, c.target.width * 0.6), height: c.target.height * 1.4, ms: 900, intensity: 0.6 });
    c.impact(0);
    void during(c, 450, () => vfx.burst(to, { count: 1, tex: 'streak', color: [0xffffff, AIR.main], speed: [3, 6], size: [0.3, 0.6], life: [0.15, 0.3], intensity: 1.0 }));
  }
  await rings;
  await beam.done;
  sp.setOutline(0);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(350);
});

// ================================================================== DARK

registerMoveFx('FAINT_ATTACK', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const u = sp.uniforms;
  const b = sp.body.position;
  const shadows = (at: THREE.Vector3, n: number, r = 0.8) =>
    vfx.burst(at, { count: n, tex: 'wisp', color: [0x2a1a3a, 0x05020a], speed: [0.6, 2], jitter: r, size: [0.5, 0.9], endSize: 1.4, life: [0.5, 0.8], drag: 2, additive: false, alpha: [0.8, 0], spin: 2 });
  stage.setTint(0x4a3a60, 0.35, 300);
  // melt into the shadows and vanish
  (u.silColor.value as THREE.Color).set(0x1a0a2a);
  shadows(c.user, 14, 0.8);
  await during(c, 200, (k) => (u.silhouette.value = 0.8 * k));
  await during(c, 220, (k) => (u.opacity.value = 1 - k));
  // a dark ripple slithers across the ground...
  const behind = c.foe.clone().setY(0).sub(c.user.clone().setY(0)).length() + 0.9;
  // behind the target and off to one side of it on screen, so the ambush is visible
  const sc = camBasis(c).right.setY(0).normalize();
  const reappear = c.dir.clone().multiplyScalar(behind).addScaledVector(sc, (c.side === 0 ? -1 : 1) * Math.max(1.1, (c.target.width + sp.width) * 0.45));
  vfx.prim.shockwave(c.foeFeet.clone().setY(c.foeFeet.y + 0.05), { color: DARKPAL.main, radius: 1.8, facing: 'ground', ms: 450, thickness: 0.2, intensity: 0.9 });
  await vfx.wait(220);
  // ...and the user rises right behind the target
  b.copy(reappear);
  shadows(sp.at(0.5), 10, 0.6);
  sp.setOutline(1.5, 0xa070ff);
  vfx.prim.shockwave(sp.at(0.5), { color: DARKPAL.main, radius: 1.4, ms: 300, thickness: 0.12, intensity: 1.1 });
  await during(c, 140, (k) => (u.opacity.value = k));
  await vfx.wait(60);
  const at = c.aim(0.5);
  void vfx.tween(120, (k) => b.copy(reappear).addScaledVector(c.dir, -0.6 * k), ease.inQuad);
  const ang = c.side === 0 ? Math.PI + 0.85 : 0.85;
  const r = slashStroke(c, strokePoints(c, at, ang, 2.4, 0.3, 9), { color: 0xa070e0, core: 0xf0e0ff, width: 0.12, ms: 110, length: 0.85, holdMs: 80, fadeMs: 220, intensity: 1.1, edge: 0x0a0414, e: ease.inQuad });
  await r.arrived;
  if (c.missed) whiff(c, at, 0xc0a0f0);
  else {
    impactFx(c, at, { strength: 1.1, pal: DARKPAL, stop: true });
    shadows(at, 8, 0.4);
    c.impact(0);
  }
  await vfx.wait(250);
  // fade out again and slink home
  sp.setOutline(0);
  await during(c, 160, (k) => (u.opacity.value = 1 - k));
  b.set(0, 0, 0);
  shadows(c.user, 10, 0.7);
  await vfx.wait(100);
  await during(c, 200, (k) => {
    u.opacity.value = k;
    u.silhouette.value = 0.8 * (1 - k);
  });
  u.opacity.value = 1;
  u.silhouette.value = 0;
  stage.setTint(0xffffff, 0, 300);
  await vfx.wait(250);
});

// ================================================================== GROUND

/** Small dirt eruption at a ground point. */
function spurt(c: MoveFxContext, at: THREE.Vector3, k = 1) {
  const { vfx } = c;
  vfx.burst(at.clone().add(V(0, 0.2, 0)), { count: Math.round(14 * k), tex: 'smoke', color: [0xb8986a, 0x6a5034], speed: [2, 6 * k], dir: UP, spread: 0.5, size: [0.5, 0.9], endSize: 1.6, life: [0.5, 0.8], gravity: 7, drag: 1, additive: false, alpha: [0.8, 0] });
  vfx.burst(at.clone().add(V(0, 0.2, 0)), { count: Math.round(12 * k), tex: 'rock', color: [0xa88a60, 0x5a4428], speed: [3, 7 * k], dir: UP, spread: 0.7, size: [0.1, 0.22], life: [0.5, 0.9], gravity: 14, additive: false, alpha: [1, 0.8], spin: 8 });
}

registerMoveFx('MAGNITUDE', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  vfx.shot('side', c.side, 450);
  const ground = (p: THREE.Vector3) => p.clone().setY(p.y + 0.06);
  // the magnitude builds: three stomps, each stronger than the last
  for (let i = 0; i < 3; i++) {
    await sp.jump(0.35 + i * 0.2, 220 + i * 40);
    const k = (i + 1) / 3;
    vfx.shake(0.08 + 0.14 * i, 300);
    vfx.prim.shockwave(ground(c.userFeet), { color: i === 2 ? 0xffe0a0 : 0xc89850, radius: 2 + i * 1.3, facing: 'ground', ms: 450 + i * 100, thickness: 0.2, intensity: 0.9 });
    vfx.dust(c.userFeet, DUST, 6 + i * 5);
    if (i === 2) {
      vfx.prim.crack(c.userFeet, { radius: 1.8, ms: 1400, glow: 0xff9a40, glowIntensity: 1.3 });
      stage.shockwave(c.userFeet, 0.5, 350);
      spurt(c, c.userFeet, 0.6);
    } else await vfx.wait(90 * k);
  }
  // the tremor rolls across the field and bursts up under the target
  const from = c.userFeet.clone();
  const to = c.missed ? c.aim(0).setY(c.foeFeet.y) : c.foeFeet.clone();
  const side = sideOf(c.dir);
  let lastS = 0;
  vfx.shake(0.35, 900);
  await during(c, 380, (k) => {
    const p = from.clone().lerp(to, k);
    if (k - lastS > 0.14) {
      lastS = k;
      spurt(c, p.clone().addScaledVector(side, (Math.random() - 0.5) * 1.2), 0.5);
      vfx.prim.shockwave(ground(p), { color: 0xc89850, radius: 1.2, facing: 'ground', ms: 350, thickness: 0.25, intensity: 0.8 });
    }
  });
  vfx.prim.crack(to, { radius: 2.1, ms: 1300, glow: 0xff9a40, glowIntensity: 1.2 });
  spurt(c, to, 1.1);
  vfx.prim.debris({ from: to.clone().add(V(0, 0.15, 0)), count: 10, color: 0x8a6a44, size: 0.13, speed: 3, up: 6, ms: 1100 });
  if (!c.missed) {
    impactFx(c, c.aim(0.35), { strength: 1.3, pal: GROUNDPAL, dust: DUST });
    const t = c.target;
    void (async () => {
      for (let i = 0; i < 2; i++) await t.jump(0.35 - i * 0.15, 200);
    })();
    c.impact(0);
  }
  vfx.shot('wide', c.side, 600);
  await vfx.wait(750);
});

registerMoveFx('MUD_SHOT', async (c) => {
  const { vfx } = c;
  const MUD = { light: 0x9a7248, main: 0x6a4a2a, dark: 0x3a2614 };
  const sp = c.attacker;
  const mouth = sp.at(0.6).addScaledVector(c.dir, 0.55);
  // mud gathers...
  vfx.burst(mouth, { count: 14, tex: 'smoke', color: [MUD.light, MUD.main], speed: 0.1, jitter: 1, attract: { to: mouth, strength: 12 }, life: [0.35, 0.5], size: [0.3, 0.5], additive: false, alpha: [0.8, 0.3] });
  await vfx.tween(220, (k) => (sp.body.position.copy(c.dir).multiplyScalar(-0.15 * k)), ease.outQuad);
  // ...and is spat out as a volley of mud balls
  const N = 3;
  const to = c.aim(0.5);
  let first = true;
  const splat = (p: THREE.Vector3, k: number) => {
    for (let i = 0; i < Math.round(18 * k); i++) {
      const d = V(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      vfx.particle({ tex: 'drop', pos: p.clone(), vel: d.multiplyScalar(2 + Math.random() * 3), acc: V(0, -10, 0), life: 0.6, size: [0.24, 0.12], color: [MUD.light, MUD.dark], intensity: 1, additive: false, alpha: [1, 0.5] });
    }
    vfx.burst(p, { count: Math.round(6 * k), tex: 'smoke', color: [MUD.light, MUD.main], speed: [0.8, 2], size: [0.5, 0.8], endSize: 1.4, life: [0.5, 0.8], additive: false, alpha: [0.7, 0], drag: 2 });
  };
  const shots: Promise<void>[] = [];
  for (let i = 0; i < N; i++) {
    const ball = vfx.prim.blob({ color: MUD.main, radius: 0.27 + (i === 1 ? 0.07 : 0), emissive: 0.12, roughness: 0.9 });
    const from = mouth.clone();
    ball.mesh.position.copy(from);
    void sp.lunge(c.foe, 0.3, 160);
    const dest = to.clone().add(V((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 0));
    shots.push(
      ball
        .fly(from, dest, 360, 0.5, ease.linear, (p) => {
          if (Math.random() < 0.7) vfx.particle({ tex: 'drop', pos: p.clone(), vel: V(0, -1, 0), acc: V(0, -8, 0), life: 0.35, size: [0.16, 0.06], color: MUD.main, intensity: 1, additive: false, alpha: [1, 0.3] });
        })
        .then(() => {
          ball.dispose();
          splat(dest, c.missed ? 0.6 : 1);
          if (c.missed) return;
          c.target.flash(MUD.main, 250, 0.45);
          if (first) {
            first = false;
            impactFx(c, dest, { strength: 1.0, pal: { core: 0xffe8c0, main: 0xb08050, dark: MUD.dark }, ground: false });
            c.impact(0);
          } else c.target.shake(0.06, 0.15);
        }),
    );
    await vfx.wait(130);
  }
  await Promise.all(shots);
  sp.body.position.set(0, 0, 0);
  if (!c.missed) {
    // mud drips down, slowing the target
    const tc = c.target.at(0.6);
    await during(c, 500, () => {
      if (Math.random() < 0.6) vfx.particle({ tex: 'drop', pos: tc.clone().add(V((Math.random() - 0.5) * c.target.width * 0.7, (Math.random() - 0.5) * 0.6, 0.2)), vel: V(0, -1.5, 0), acc: V(0, -6, 0), life: 0.5, size: [0.18, 0.1], color: [MUD.light, MUD.dark], intensity: 1, additive: false });
    });
  }
  await vfx.wait(300);
});

registerMoveFx('BONEMERANG', async (c) => {
  const { vfx } = c;
  const sp = c.attacker;
  const BONE = 0xf2ead6;
  // a sturdy bone club
  const bone = addObj(c, new THREE.Group());
  const mat = new THREE.MeshStandardMaterial({ color: BONE, emissive: new THREE.Color(BONE), emissiveIntensity: 0.55, roughness: 0.6 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 10), mat);
  shaft.rotation.z = Math.PI / 2;
  bone.add(shaft);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), mat);
    knob.position.set(sx * 0.47, sy * 0.08, 0);
    bone.add(knob);
  }
  bone.scale.setScalar(1.5);
  const hand = c.user.clone().addScaledVector(c.dir, 0.45).add(V(0, 0.2, 0));
  const T = c.aim(0.5);
  const side = sideOf(c.dir);
  const s = c.side === 0 ? 1 : -1;
  // out on a wide curve, through the target, loop behind it, back through it and home
  const pts = [
    hand.clone(),
    hand.clone().lerp(T, 0.5).addScaledVector(side, 1.5 * s).add(V(0, 0.5, 0)),
    T.clone(),
    T.clone().addScaledVector(c.dir, 1.3).addScaledVector(side, -0.9 * s).add(V(0, 0.4, 0)),
    T.clone().addScaledVector(c.dir, 1.3).addScaledVector(side, 0.9 * s).add(V(0, 0.6, 0)),
    T.clone().add(V(0, 0.1, 0)),
    hand.clone().lerp(T, 0.5).addScaledVector(side, -1.4 * s).add(V(0, 0.3, 0)),
    hand.clone(),
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const hitAt = [2 / 7, 5 / 7];
  // wind-up and throw
  await vfx.tween(160, (k) => sp.body.position.copy(c.dir).multiplyScalar(-0.2 * k), ease.outQuad);
  void vfx.tween(160, (k) => sp.body.position.copy(c.dir).multiplyScalar(-0.2 + 0.5 * k), ease.outQuad).then(() => vfx.tween(200, (k) => sp.body.position.copy(c.dir).multiplyScalar(0.3 * (1 - k))));
  vfx.dust(c.userFeet, DUST, 6);
  const MS = 1500;
  const fired = [false, false];
  let prev = hand.clone();
  await during(c, MS, (k, _dt, el) => {
    // fast out, a slower hang behind the target, fast return
    const t = k;
    const p = curve.getPoint(t);
    bone.position.copy(p);
    bone.quaternion.copy(c.stage.camera.quaternion);
    bone.rotateZ(el / 38);
    bone.rotateX(0.5);
    vfx.particle({ tex: 'glow', pos: p.clone(), life: 0.06, size: 1.4, color: GROUNDPAL.main, intensity: 0.45, alpha: [0.5, 0.2] });
    emitAlong(prev, p, 0.14, (q) => vfx.particle({ tex: 'glow', pos: q, life: 0.3, size: [0.7, 0.2], color: [0xfff4e0, GROUNDPAL.main], intensity: 0.75, alpha: [0.6, 0] }));
    if (Math.random() < 0.35) vfx.particle({ tex: 'streak', pos: p.clone(), life: 0.15, size: [0.9, 0.4], color: 0xfff4e0, intensity: 0.9, rot: Math.random() * Math.PI, alpha: [0.6, 0] });
    prev = p;
    for (let i = 0; i < 2; i++) {
      if (fired[i] || t < hitAt[i]) continue;
      fired[i] = true;
      if (c.missed || i >= c.hits) continue;
      impactFx(c, c.aim(0.5), { strength: 0.95, pal: GROUNDPAL, ground: i === 1, stop: i === 1 });
      vfx.burst(towardCam(c, c.aim(0.5), 0.5), { count: 8, tex: 'shard', color: [0xffffff, BONE], speed: [2, 5], size: [0.1, 0.2], life: [0.3, 0.5], gravity: 6, spin: 8, additive: false });
      c.impact(i);
    }
  });
  // caught!
  disposeObj(bone);
  sp.flash(0xfff4e0, 200, 0.5);
  vfx.burst(hand, { count: 8, tex: 'spark', color: [0xffffff, GROUNDPAL.main], speed: [1, 3], size: [0.1, 0.2], life: 0.3 });
  sp.body.position.set(0, 0, 0);
  await vfx.wait(300);
});

// ================================================================== ROCK

registerMoveFx('ANCIENT_POWER', async (c) => {
  const { vfx, stage } = c;
  const sp = c.attacker;
  const ANC = { glow: 0xfff0c0, rune: 0xffd070 };
  stage.setTint(0xb0905a, 0.25, 400);
  sp.setOutline(1.2, ANC.rune);
  const N = 5;
  const R = Math.max(0.9, Math.min(1.6, sp.width * 0.55));
  const { right } = camBasis(c);
  // ancient stones tear loose from the ground and rise around the user
  const rocks = Array.from({ length: N }, (_, i) => {
    const f = i / (N - 1) - 0.5;
    const base = c.userFeet.clone().addScaledVector(right, f * R * 2.4).addScaledVector(c.dir, -0.4 - Math.abs(f) * 0.3);
    const h = 1.1 + (1 - Math.abs(f) * 2) * 0.9 + Math.random() * 0.2;
    const r = vfx.prim.boulder(base.clone().setY(base.y - 0.4), { color: 0xa89878, size: 0.3 + Math.random() * 0.1, emissive: 0.3 });
    return { r, base, h, ph: Math.random() * 6, spin: V(Math.random() * 2, Math.random() * 2, Math.random() * 2) };
  });
  rocks.forEach((q) => {
    vfx.dust(q.base, DUST, 5);
    vfx.prim.crack(q.base, { radius: 0.6, ms: 1200, glow: ANC.rune, glowIntensity: 1 });
  });
  await during(c, 700, (k, dt, el) => {
    rocks.forEach((q, i) => {
      const kk = Math.max(0, Math.min(1, k * 1.6 - i * 0.12));
      q.r.mesh.position.copy(q.base).setY(q.base.y - 0.4 + (q.h + 0.4) * ease.outBack(kk) + Math.sin(el / 160 + q.ph) * 0.06);
      q.r.mesh.rotation.x += q.spin.x * dt;
      q.r.mesh.rotation.y += q.spin.y * dt;
      if (Math.random() < 0.5) vfx.particle({ tex: 'glow', pos: q.r.mesh.position.clone(), life: 0.3, size: [1.3, 0.6], color: ANC.glow, intensity: 0.7, alpha: [0.5, 0] });
      if (Math.random() < 0.15) vfx.particle({ tex: 'spark', pos: q.r.mesh.position.clone(), vel: V(0, 1, 0), life: 0.5, size: [0.14, 0.04], color: ANC.rune, intensity: 1.3 });
    });
  });
  sp.setOutline(0);
  // they hurl themselves at the target one after another
  const TRAVEL = 360;
  const t0 = rocks.map((_, i) => i * 90);
  const starts = rocks.map((q) => q.r.mesh.position.clone());
  const dests = rocks.map(() => c.aim(0.5).add(V((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0)));
  const done = rocks.map(() => false);
  let hit = false;
  await during(c, t0[N - 1] + TRAVEL + 20, (_k, dt, el) => {
    rocks.forEach((q, i) => {
      if (done[i]) return;
      const t = (el - t0[i]) / TRAVEL;
      if (t < 0) return;
      const k = Math.min(1, t);
      const mid = starts[i].clone().lerp(dests[i], 0.5).add(V(0, 0.9, 0));
      const p = qbez(starts[i], mid, dests[i], ease.inQuad(k));
      q.r.mesh.position.copy(p);
      q.r.mesh.rotation.x += 8 * dt;
      q.r.mesh.rotation.z += 6 * dt;
      vfx.particle({ tex: 'glow', pos: p.clone(), life: 0.25, size: [0.6, 0.15], color: ANC.glow, intensity: 0.6, alpha: [0.5, 0] });
      if (Math.random() < 0.4) vfx.particle({ tex: 'smoke', pos: p.clone(), life: 0.4, size: [0.3, 0.6], color: DUST, intensity: 1, additive: false, alpha: [0.5, 0] });
      if (t >= 1) {
        done[i] = true;
        q.r.dispose();
        vfx.prim.debris({ from: p.clone(), count: 6, color: 0x8a7658, size: 0.09, speed: 3, up: 3, ms: 900 });
        vfx.burst(p, { count: 8, tex: 'rock', color: [0xa89070, 0x5a4a38], speed: [2, 5], size: [0.12, 0.24], life: [0.4, 0.7], gravity: 10, additive: false, alpha: [1, 0.7], spin: 8 });
        if (c.missed) return;
        if (!hit) {
          hit = true;
          impactFx(c, p, { strength: 1.2, pal: ROCKPAL, stop: true });
          c.impact(0);
        } else {
          softHit(c, towardCam(c, p, 0.5), { core: ANC.glow, main: ROCKPAL.main }, 0.5);
          c.target.shake(0.06, 0.15);
        }
      }
    });
  });
  rocks.forEach((q) => q.r.dispose());
  stage.setTint(0xffffff, 0, 400);
  await vfx.wait(500);
});
