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
  pulledShot(c, 'user', 1.5, 1.3, 500);
  stage.setTint(0x40408a, 0.35, 400);
  const top = sp.at(0.95);
  const { right } = camBasis(c);
  const s = c.side === 0 ? 1 : -1;
  // a wish is sent up: a sparkling thread rises from the user into the sky
  sp.flash(0xfff4c0, 400, 0.35);
  const skyAt = top.clone().add(V(0, 3.4, 0)).addScaledVector(right, s * 1.8);
  vfx.prim.ribbon([top.clone(), top.clone().add(V(0, 1.2, 0)).addScaledVector(right, s * 0.3), skyAt.clone()], { color: 0xfff0a0, core: 0xffffff, width: 0.05, ms: 420, length: 0.5, fadeMs: 200, intensity: 1.1 });
  vfx.burst(top, { count: 14, tex: 'star', color: [0xffffff, STAR], speed: [0.5, 1.6], dir: UP, spread: 0.6, size: [0.1, 0.2], life: [0.5, 0.8], intensity: 1.4 });
  await vfx.wait(430);
  // the star twinkles in the night sky...
  vfx.prim.shockwave(skyAt, { color: STAR, radius: 1.1, ms: 400, thickness: 0.1, intensity: 1.2 });
  vfx.particle({ tex: 'star', pos: skyAt.clone(), life: 0.5, size: [0.4, 1.4], color: 0xffffff, intensity: 1.5, alpha: [1, 0] });
  const star = glyph(c, 'star', { color: STAR, edge: 0x6a4a00, intensity: 1.15 });
  await during(c, 380, (k) => star.set(skyAt, 0.45 * ease.outBack(k), 1, k * 2));
  // ...then falls, blazing, onto the user
  const land = sp.at(0.6);
  const mid = skyAt.clone().lerp(land, 0.5).addScaledVector(right, s * 0.8).add(V(0, 0.4, 0));
  let prev = skyAt.clone();
  await during(c, 520, (k) => {
    const e = ease.inQuad(k);
    const p = qbez(skyAt, mid, land, e);
    star.set(p, 0.45 + 0.15 * k, 1, 2 + k * 8);
    emitAlong(prev, p, 0.12, (q) => {
      vfx.particle({ tex: 'glow', pos: q, life: 0.35, size: [0.45, 0.1], color: STAR, intensity: 1.1, alpha: [0.7, 0] });
      if (Math.random() < 0.4) vfx.particle({ tex: 'star', pos: q.clone(), vel: V((Math.random() - 0.5) * 1.5, -0.5 - Math.random(), (Math.random() - 0.5) * 1.5), life: 0.6, size: [0.18, 0.05], color: [0xffffff, STAR], intensity: 1.4, spin: 4 });
    });
    prev = p;
  });
  star.dispose();
  // wish granted: a golden bloom of light
  vfx.particle({ tex: 'star', pos: towardCam(c, land, 0.4), life: 0.3, size: [1, 2.2], color: 0xffffff, intensity: 1.3, alpha: [0.9, 0] });
  vfx.prim.shockwave(land, { color: STAR, radius: 2.0, ms: 450, thickness: 0.15, intensity: 1.2 });
  vfx.burst(land, { count: 26, tex: 'star', color: [0xffffff, STAR], speed: [2, 5], size: [0.14, 0.28], life: [0.5, 0.9], drag: 2.5, gravity: 1.5, spin: 5, intensity: 1.4 });
  stage.flash(0xfff0c0, 0.18, 200);
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
  const rs = eyes2.map((p, i) => vfx.prim.ribbon([p, p.clone().lerp(to, 0.5).add(V(0, 0.15 * (i ? 1 : -1), 0)), to.clone()], { color: EYE, core: 0xffffff, width: 0.045, ms: 160, length: 1, holdMs: 220, fadeMs: 200, intensity: 1.2 }));
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
