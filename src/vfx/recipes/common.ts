import * as THREE from 'three';
import { ease } from '../../render/clock';
import type { TexName } from '../textures';
import { focusShot } from '../../render/shots';
import type { MoveFxContext } from '../vfx';

/** Reusable building blocks for move recipes. */

/** Attacker dashes into the target; `onHit` runs at contact for every hit. */
export async function contact(c: MoveFxContext, o: { dist?: number; ms?: number; spark?: number; tex?: TexName; onHit?: (i: number, at: THREE.Vector3) => void } = {}) {
  const { vfx } = c;
  const dist = o.dist ?? Math.min(3.2, c.user.distanceTo(c.foe) * 0.55);
  for (let i = 0; i < c.hits; i++) {
    const lunge = c.attacker.lunge(c.foe, dist, o.ms ?? 360);
    await lunge;
    const at = c.aim(0.5);
    if (!c.missed) {
      vfx.hitSpark(at, c.pal, o.spark ?? 1);
      if (o.tex) vfx.burst(at, { count: 12, tex: o.tex, color: [c.pal.core, c.pal.main], speed: [2, 5], size: [0.2, 0.4], spin: 6 });
      o.onHit?.(i, at);
      c.impact(i);
    }
    await vfx.wait(c.hits > 1 ? 220 : 300);
  }
}

/** Glowing orb projectile with a trail. */
export async function projectile(
  c: MoveFxContext,
  o: { radius?: number; ms?: number; arc?: number; trailTex?: TexName; trailRate?: number; color?: number; core?: number; chargeMs?: number; spark?: number; from?: THREE.Vector3 } = {},
) {
  const { vfx } = c;
  const orb = vfx.prim.orb({ color: o.color ?? c.pal.main, core: o.core ?? c.pal.core, radius: o.radius ?? 0.3 });
  const from = o.from ?? c.user.clone().add(c.dir.clone().multiplyScalar(0.5));
  orb.mesh.position.copy(from);
  if (o.chargeMs) {
    vfx.burst(from, { count: 24, tex: 'spark', color: c.pal.main, speed: 0.1, jitter: 1.2, attract: { to: from, strength: 18 }, life: [0.4, 0.6], size: [0.1, 0.2] });
    await orb.grow(o.chargeMs, 1);
  }
  const to = c.aim(0.5);
  const trail = vfx.trail(() => orb.mesh.position, o.ms ?? 450, { tex: o.trailTex ?? 'glow', color: [c.pal.main, c.pal.dark], size: [0.25, 0.45], speed: 0.4, life: [0.25, 0.4], rate: o.trailRate ?? 70 });
  await orb.fly(from, to, o.ms ?? 450, o.arc ?? 0.6, ease.inQuad);
  orb.dispose();
  if (!c.missed) {
    vfx.hitSpark(to, c.pal, o.spark ?? 1);
    c.impact(0);
  } else vfx.burst(to, { count: 10, color: c.pal.main, speed: 2 });
  await trail;
}

/** Charge + energy beam that lands on the target. */
export async function beamAttack(c: MoveFxContext, o: { width?: number; holdMs?: number; chargeMs?: number; core?: number; color?: number; shake?: number } = {}) {
  const { vfx } = c;
  const from = c.user.clone().add(c.dir.clone().multiplyScalar(0.6));
  if (o.chargeMs) {
    vfx.burst(from, { count: 40, tex: 'spark', color: [c.pal.core, c.pal.main], speed: 0.2, jitter: 1.6, attract: { to: from, strength: 25 }, life: [0.4, 0.7], size: [0.12, 0.25] });
    vfx.particle({ tex: 'glow', pos: from, life: o.chargeMs / 1000, size: [0.2, 1.4], color: c.pal.main, intensity: 2.5, alpha: [0.3, 1] });
    await vfx.wait(o.chargeMs);
  }
  const to = c.aim(0.5);
  const b = vfx.prim.beam(from, to, { color: o.color ?? c.pal.main, core: o.core ?? c.pal.core, width: o.width ?? 0.35, holdMs: o.holdMs ?? 450 });
  await b.arrived;
  if (!c.missed) {
    vfx.hitSpark(to, c.pal, 1.3);
    vfx.shake(o.shake ?? 0.2, 400);
    c.impact(0);
    const t0 = c.stage.clock.time;
    const burstLoop = c.stage.onUpdate(() => {
      if (Math.random() < 0.6) vfx.burst(to, { count: 2, tex: 'spark', color: [c.pal.core, c.pal.main], speed: [2, 5], size: [0.15, 0.3], life: [0.2, 0.4] });
      if (c.stage.clock.time - t0 > (o.holdMs ?? 450) / 1000) burstLoop();
    });
  }
  await b.done;
}

/** Colored aura rising around a sprite (buffs) or sinking (debuffs). */
export async function aura(c: MoveFxContext, who: 'user' | 'foe', o: { color?: number; down?: boolean; tex?: TexName; ms?: number } = {}) {
  const { vfx } = c;
  const sprite = who === 'user' ? c.attacker : c.target;
  const feet = who === 'user' ? c.userFeet : c.foeFeet;
  sprite.setOutline(1.6, o.color ?? c.pal.main);
  vfx.prim.shockwave(feet.clone().setY(0.4), { color: o.color ?? c.pal.main, radius: 1.8, facing: 'ground', ms: 600 });
  await vfx.spiral(feet, { color: [o.color ?? c.pal.main, c.pal.core], tex: o.tex ?? 'spark', ms: o.ms ?? 800, radius: Math.max(0.7, sprite.width * 0.45), down: o.down, rise: 2.2 });
  sprite.setOutline(0);
}

/** Particles fly from attacker to target (powders, gas, sound). */
export async function cloud(c: MoveFxContext, o: { tex?: TexName; color?: number | [number, number]; ms?: number; additive?: boolean; size?: number | [number, number] } = {}) {
  const { vfx } = c;
  await vfx.stream(c.user, c.aim(0.5), {
    tex: o.tex ?? 'smoke',
    color: o.color ?? [c.pal.main, c.pal.dark],
    ms: o.ms ?? 700,
    rate: 60,
    travel: 0.6,
    spread: 0.25,
    size: o.size ?? [0.4, 0.8],
    endSize: 1.6,
    additive: o.additive ?? true,
    intensity: 1.4,
  });
  if (!c.missed) c.impact(0);
}

/** Fire all remaining impacts (used by recipes that land every hit at once). */
export function impactAll(c: MoveFxContext) {
  for (let i = 0; i < c.hits; i++) c.impact(i);
}

export const up = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------ fx kit (additive helpers)

/**
 * Run `fn` every frame for `ms` of game time (k = 0..1 progress, dt seconds, el = elapsed ms).
 * Always unregisters itself, even if `fn` throws.
 */
export function during(c: MoveFxContext, ms: number, fn: (k: number, dt: number, el: number) => void): Promise<void> {
  const t0 = c.stage.clock.time;
  return new Promise<void>((resolve) => {
    const off = c.stage.onUpdate((dt) => {
      const el = (c.stage.clock.time - t0) * 1000;
      let stop = el >= ms;
      try {
        fn(Math.min(1, el / ms), dt, el);
      } catch (e) {
        console.error(e);
        stop = true;
      }
      if (stop) {
        off();
        resolve();
      }
    });
  });
}

/** Screen-space angle (radians, counter-clockwise from +x) of the segment a->b as seen by the camera. */
export function screenAngle(c: MoveFxContext, a: THREE.Vector3, b: THREE.Vector3): number {
  const cam = c.stage.camera;
  const pa = a.clone().project(cam);
  const pb = b.clone().project(cam);
  const el = c.stage.renderer.domElement;
  return Math.atan2((pb.y - pa.y) * el.height, (pb.x - pa.x) * el.width);
}

/** Calls `fn` at points spaced ~`step` apart between a and b (fills gaps of fast-moving emitters). */
export function emitAlong(a: THREE.Vector3, b: THREE.Vector3, step: number, fn: (p: THREE.Vector3, f: number) => void) {
  const d = a.distanceTo(b);
  const n = Math.max(1, Math.ceil(d / step));
  for (let i = 1; i <= n; i++) fn(a.clone().lerp(b, i / n), i / n);
}

/** Unit vector perpendicular to `dir` on the ground plane. */
export function sideOf(dir: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(-dir.z, 0, dir.x).normalize();
}

export interface MoteOpts {
  /** number of motes */
  count: number;
  /** motes are released over this window */
  spreadMs: number;
  /** flight time of each mote */
  travelMs: number;
  from: THREE.Vector3 | (() => THREE.Vector3);
  to: THREE.Vector3 | (() => THREE.Vector3);
  /** random start offset radius */
  jitter?: number;
  /** sideways/up bulge of each mote's arc */
  arc?: number;
  up?: number;
  /** sinusoidal wiggle amplitude */
  wiggle?: number;
  /** spacing of trail particles */
  step?: number;
  e?: (t: number) => number;
  /** emit trail particles at p (dir = travel direction, k = mote progress 0..1, i = mote index, head = current mote position) */
  emit: (p: THREE.Vector3, dir: THREE.Vector3, k: number, i: number, head: boolean) => void;
  onArrive?: (p: THREE.Vector3, i: number) => void;
}

/**
 * Scripted "motes" that fly along individual curved paths leaving particle trails
 * (drain energy, leaves, wisps, seeds). Resolves when the last mote arrived.
 */
export function motes(c: MoteOpts & { ctx: MoveFxContext }): Promise<void> {
  const { ctx } = c;
  const get = (v: THREE.Vector3 | (() => THREE.Vector3)) => (typeof v === 'function' ? v() : v.clone());
  const ms = c.spreadMs + c.travelMs;
  const ms0 = Array.from({ length: c.count }, (_, i) => (c.count <= 1 ? 0 : (i / (c.count - 1)) * c.spreadMs));
  const offs = Array.from({ length: c.count }, () => {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    return new THREE.Vector3(r * Math.cos(a), u, r * Math.sin(a)).multiplyScalar(Math.random() * (c.jitter ?? 0.4));
  });
  const bulge = Array.from({ length: c.count }, () => ({ s: (Math.random() * 2 - 1) * (c.arc ?? 1), u: (c.up ?? 0.6) * (0.4 + Math.random()), ph: Math.random() * 6.28, f: 5 + Math.random() * 5 }));
  const last: (THREE.Vector3 | null)[] = new Array(c.count).fill(null);
  const done: boolean[] = new Array(c.count).fill(false);
  const pos = (i: number, k: number) => {
    const a = get(c.from).add(offs[i]);
    const b = get(c.to);
    const d = b.clone().sub(a);
    const side = new THREE.Vector3(-d.z, 0, d.x).normalize();
    const env = Math.sin(k * Math.PI);
    const p = a.lerp(b, k);
    p.addScaledVector(side, bulge[i].s * env + Math.sin(k * bulge[i].f + bulge[i].ph) * (c.wiggle ?? 0) * env);
    p.y += bulge[i].u * env + Math.cos(k * bulge[i].f * 1.3 + bulge[i].ph) * (c.wiggle ?? 0) * env * 0.6;
    return p;
  };
  return during(ctx, ms + 20, (_k, _dt, el) => {
    for (let i = 0; i < c.count; i++) {
      if (done[i]) continue;
      const t = (el - ms0[i]) / c.travelMs;
      if (t < 0) continue;
      const k = (c.e ?? ((x: number) => x))(Math.min(1, t));
      const p = pos(i, k);
      const prev = last[i] ?? p.clone();
      const dv = p.clone().sub(prev);
      const dir = dv.lengthSq() > 1e-8 ? dv.normalize() : new THREE.Vector3(1, 0, 0);
      if (last[i]) emitAlong(prev, p, c.step ?? 0.15, (q, f) => c.emit(q, dir, k, i, f >= 1));
      else c.emit(p, dir, k, i, true);
      last[i] = p;
      if (t >= 1) {
        done[i] = true;
        c.onArrive?.(p, i);
      }
    }
  });
}

/** Rising healing sparkles + soft glow on a sprite (drain moves, Rest). */
export function healSparkles(c: MoveFxContext, who: 'user' | 'foe', color = 0x9aff9a, ms = 700) {
  const { vfx } = c;
  const sprite = who === 'user' ? c.attacker : c.target;
  const feet = who === 'user' ? c.userFeet : c.foeFeet;
  sprite.flash(color, 450, 0.45);
  vfx.prim.shockwave(feet.clone().setY(feet.y + 0.08), { color, radius: 1.6, facing: 'ground', ms: 600, intensity: 1.4 });
  return vfx.spiral(feet, { color: [0xffffff, color], tex: 'star', ms, radius: Math.max(0.6, sprite.width * 0.4), rise: 2.4, size: [0.14, 0.28], rate: 45, intensity: 1.6 });
}

// ------------------------------------------------------------------ physical-hit kit (additive helpers)

/** Camera basis vectors (screen right / up, and the view direction). */
export function camBasis(c: MoveFxContext) {
  const q = c.stage.camera.quaternion;
  return {
    right: new THREE.Vector3(1, 0, 0).applyQuaternion(q),
    up: new THREE.Vector3(0, 1, 0).applyQuaternion(q),
    fwd: new THREE.Vector3(0, 0, -1).applyQuaternion(q),
  };
}

/** `p` pulled `d` units towards the camera (so screen-plane strokes draw in front of a sprite). */
export function towardCam(c: MoveFxContext, p: THREE.Vector3, d = 0.7): THREE.Vector3 {
  return p.clone().add(c.stage.camera.position.clone().sub(p).normalize().multiplyScalar(d));
}

/**
 * Points of a screen-plane stroke through `center`: a straight line (bend 0) or an arc bulging sideways.
 * `angle` is the on-screen direction (radians, 0 = right, PI/2 = up), `len` its world length.
 */
export function strokePoints(c: MoveFxContext, center: THREE.Vector3, angle: number, len: number, bend = 0, n = 7, forward = 0.7): THREE.Vector3[] {
  const { right, up } = camBasis(c);
  const along = right.clone().multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle));
  const perp = right.clone().multiplyScalar(-Math.sin(angle)).addScaledVector(up, Math.cos(angle));
  const base = towardCam(c, center, forward);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1) - 0.5;
    pts.push(base.clone().addScaledVector(along, t * len).addScaledVector(perp, bend * (1 - 4 * t * t)));
  }
  return pts;
}

/** Parallel claw marks raked across `at` (screen plane). Resolves when the last mark finished drawing. */
export async function clawMarks(
  c: MoveFxContext,
  at: THREE.Vector3,
  o: { count?: number; color: number; core?: number; width?: number; len?: number; angle?: number; gap?: number; ms?: number; stagger?: number; bend?: number; intensity?: number; holdMs?: number; edge?: number },
) {
  const n = o.count ?? 3;
  const angle = o.angle ?? -0.95;
  const { right, up } = camBasis(c);
  const perp = right.clone().multiplyScalar(-Math.sin(angle)).addScaledVector(up, Math.cos(angle));
  let last: Promise<void> = Promise.resolve();
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * (o.gap ?? 0.38);
    const center = at.clone().addScaledVector(perp, off);
    const r = slashStroke(c, strokePoints(c, center, angle, (o.len ?? 1.9) * (1 - Math.abs(off) * 0.25), o.bend ?? 0.12), {
      color: o.color,
      core: o.core ?? 0xffffff,
      width: o.width ?? 0.075,
      ms: o.ms ?? 130,
      length: 1,
      holdMs: o.holdMs ?? 140,
      fadeMs: 220,
      intensity: o.intensity ?? 1.1,
      edge: o.edge,
      e: ease.outCubic,
    });
    last = r.arrived;
    if (o.stagger ?? 45) await c.vfx.wait(o.stagger ?? 45);
  }
  await last;
}

/** Streak particles rushing along `dir` around `center` (speed lines). */
export function speedLines(c: MoveFxContext, center: THREE.Vector3, dir: THREE.Vector3, o: { count?: number; radius?: number; color?: number; size?: number; speed?: number; life?: number; intensity?: number } = {}) {
  const d = dir.clone().normalize();
  for (let i = 0; i < (o.count ?? 12); i++) {
    const p = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 2).multiplyScalar(o.radius ?? 0.9));
    const sp = (o.speed ?? 14) * (0.7 + Math.random() * 0.6);
    c.vfx.particle({
      tex: 'streak',
      pos: p,
      vel: d.clone().multiplyScalar(sp),
      life: (o.life ?? 0.2) * (0.7 + Math.random() * 0.6),
      size: [(o.size ?? 1.6) * (0.7 + Math.random() * 0.6), (o.size ?? 1.6) * 0.6],
      color: o.color ?? 0xffffff,
      intensity: o.intensity ?? 1.4,
      rot: screenAngle(c, p, p.clone().add(d)),
      alpha: [0.9, 0],
    });
  }
}

/** Brief hit-stop (freeze-frame feel) on heavy impacts. */
export function hitStop(c: MoveFxContext, realMs = 70, scale = 0.08) {
  c.stage.clock.slowMo(scale, realMs);
}

/**
 * Heavy physical impact at `at`: impact star, rings, sparks, target-feet dust and ground ring, camera shake,
 * radial blur, optional hit-stop / white flash. `strength` ~0.5 (jab) .. 1.6 (Double-Edge).
 */
export function impactFx(
  c: MoveFxContext,
  at: THREE.Vector3,
  o: { strength?: number; pal?: { core: number; main: number; dark: number }; ground?: boolean; stop?: boolean; flash?: number; dust?: number; ring?: number } = {},
) {
  const { vfx } = c;
  const s = o.strength ?? 0.6 + c.power * 0.8;
  const pal = o.pal ?? c.pal;
  const p = towardCam(c, at, 0.5);
  // impact star (short, crisp) + small colored bloom, thin ring, spark spray and speed streaks
  vfx.prim.impactStar(p, { color: o.ring ?? pal.main, core: pal.core, size: 0.55 + 0.45 * s, ms: 200 + 80 * s });
  vfx.particle({ tex: 'glow', pos: p.clone(), life: 0.22, size: [0.9 * s, 1.6 * s], color: pal.main, intensity: 1.1, alpha: [0.55, 0] });
  vfx.prim.shockwave(p, { color: o.ring ?? pal.main, radius: 1.5 * s, thickness: 0.1, ms: 260, intensity: 1.3 });
  vfx.burst(p, { count: Math.round(12 * s), tex: 'spark', color: [pal.core, pal.main], speed: [3, 8 * s], size: [0.1, 0.24], life: [0.2, 0.4], drag: 3, intensity: 1.6 });
  vfx.burst(p, { count: Math.round(8 * s), tex: 'streak', color: [pal.core, pal.main], speed: [6, 12], size: [0.4, 0.8], life: [0.1, 0.2], drag: 4, intensity: 1.3 });
  if (o.ground ?? true) {
    vfx.prim.shockwave(c.foeFeet.clone().setY(c.foeFeet.y + 0.06), { color: pal.main, radius: 1.8 + s, facing: 'ground', ms: 420, thickness: 0.16, intensity: 0.9 });
    vfx.dust(c.foeFeet.clone().setY(c.foeFeet.y), o.dust ?? 0xa89878, Math.round(6 + 6 * s));
  }
  c.stage.shockwave(p, 0.3 + 0.45 * s, 240 + 120 * s);
  if (s > 0.9) c.stage.chromaPulse(0.003 + 0.004 * s, 220);
  vfx.shake(0.08 + 0.2 * s, 220 + 180 * s);
  if (o.stop ?? s > 1) hitStop(c, 50 + 40 * s);
  if (o.flash) c.stage.flash(0xffffff, o.flash, 160);
}

/**
 * Attacker dashes at the target with afterimages / speed lines / dust; resolves at the moment of contact
 * (the return to the platform keeps running).
 */
export async function rush(c: MoveFxContext, o: { dist?: number; ms?: number; ghosts?: number; ghostColor?: number; lines?: boolean; dust?: boolean } = {}) {
  const { vfx } = c;
  const dist = o.dist ?? Math.min(4, c.user.distanceTo(c.foe) * 0.55);
  const ms = o.ms ?? 380;
  const lunge = c.attacker.lunge(c.foe, dist, ms);
  await vfx.wait(ms * 0.45);
  if (o.dust ?? true) vfx.dust(c.userFeet, 0xa89878, 7);
  if (o.lines) speedLines(c, c.user.clone().addScaledVector(c.dir, dist * 0.5), c.dir, { count: 10, radius: 1, color: 0xffffff });
  if (o.ghosts) {
    let n = 0;
    void during(c, ms * 0.25, () => {
      if (n++ < (o.ghosts ?? 0)) vfx.prim.afterimage(c.attacker.mesh, { color: o.ghostColor ?? 0xb8b0a0, opacity: 0.32, ms: 280 });
    });
  }
  await lunge;
}

/** Temporarily tint a sprite's silhouette (0..1) and restore it. */
export function silhouette(sprite: { uniforms: Record<string, THREE.IUniform> }, color: number, amt: number, inMs: number, holdMs: number, outMs: number, stage: MoveFxContext['stage']) {
  const u = sprite.uniforms;
  (u.silColor.value as THREE.Color).set(color);
  return (async () => {
    await stage.tween(inMs, (k) => (u.silhouette.value = amt * k));
    await stage.wait(holdMs);
    await stage.tween(outMs, (k) => (u.silhouette.value = amt * (1 - k)));
    u.silhouette.value = 0;
  })();
}

/** Like vfx.shot('attacker'/'target') but pulled back by `k` (and looking `lift` higher) to frame big effects. */
export function pulledShot(c: MoveFxContext, who: 'user' | 'foe', k = 1.6, lift = 0.4, ms = 450) {
  const side = who === 'user' ? c.side : c.side === 0 ? 1 : 0;
  const s = focusShot(side, 1.2 + lift);
  const pos = s.look.clone().add(s.pos.clone().sub(s.look).multiplyScalar(k));
  c.stage.director.move({ pos, look: s.look, fov: s.fov }, ms / 1000);
}

/**
 * A slash / swipe stroke along `pts`: bright ribbon over a dark, wider normal-blended under-stroke so it stays
 * readable on bright arenas. Returns the bright ribbon's handle.
 */
export function slashStroke(
  c: MoveFxContext,
  pts: THREE.Vector3[],
  o: { color: number; core?: number; width?: number; ms?: number; length?: number; holdMs?: number; fadeMs?: number; intensity?: number; edge?: number; edgeAlpha?: number; e?: (t: number) => number },
) {
  const common = { ms: o.ms ?? 130, length: o.length ?? 1, holdMs: o.holdMs ?? 100, fadeMs: o.fadeMs ?? 220, e: o.e ?? ease.outCubic };
  const under = c.vfx.prim.ribbon(pts, { ...common, color: o.edge ?? 0x1a1210, core: o.edge ?? 0x1a1210, width: (o.width ?? 0.1) * 2.2, additive: false, intensity: 1, opacity: o.edgeAlpha ?? 0.6 });
  under.mesh.renderOrder = 4;
  const r = c.vfx.prim.ribbon(pts, { ...common, color: o.color, core: o.core ?? 0xffffff, width: o.width ?? 0.1, intensity: o.intensity ?? 1.4 });
  r.mesh.renderOrder = 6;
  return r;
}
