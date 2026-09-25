import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { camBasis, clawMarks, impactFx, rush, sideOf, strokePoints, towardCam } from './common';

// steel-type move recipes

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const SILVER = 0xb8d0f0;
const STEELPAL = { core: 0xffffff, main: 0xa8c8f0, dark: 0x4a5a70 };

function whiff(c: MoveFxContext, at = c.aim(0.5)) {
  c.vfx.burst(at, { count: 8, tex: 'streak', color: 0xe0ecff, speed: [4, 7], size: [0.4, 0.7], life: 0.18, dir: c.dir, spread: 0.5, intensity: 1.2 });
  c.vfx.dust(c.foeFeet.clone().addScaledVector(sideOf(c.dir), 1.4), 0xa89878, 6);
}

/** A cross-shaped metallic glint. */
function glint(c: MoveFxContext, at: THREE.Vector3, size = 1, delay = 0) {
  c.vfx.particle({ tex: 'star', pos: towardCam(c, at, 0.4), life: 0.35, size: [0.1 * size, 1.1 * size], color: 0xffffff, intensity: 2.6, alpha: [1, 0], fadeIn: 0.25 + delay, rot: 0.2 });
  c.vfx.particle({ tex: 'streak', pos: towardCam(c, at, 0.4), life: 0.3, size: [0.2 * size, 1.6 * size], color: 0xe0ecff, intensity: 2, alpha: [1, 0], fadeIn: 0.3 + delay, rot: 0 });
}

/** Grinding-metal sparks: hot little yellow-white sparks that arc and fall. */
function metalSparks(c: MoveFxContext, at: THREE.Vector3, n = 24) {
  c.vfx.burst(towardCam(c, at, 0.5), { count: n, tex: 'spark', color: [0xffffff, 0xffd070], speed: [4, 9], size: [0.08, 0.16], life: [0.3, 0.6], gravity: 12, drag: 1, intensity: 2.2 });
}

registerMoveFx('METAL_CLAW', async (c) => {
  const { vfx } = c;
  c.attacker.setOutline(1.3, SILVER);
  glint(c, c.attacker.at(0.6).addScaledVector(c.dir, 0.4), 1);
  await vfx.wait(220);
  c.attacker.setOutline(0);
  await rush(c, { ms: 320 });
  const at = c.aim(0.55);
  await clawMarks(c, at, { color: SILVER, core: 0xffffff, count: 3, width: 0.08, len: 1.9, angle: -1.0, stagger: 35, intensity: 2 });
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 0.9, pal: STEELPAL, ground: false });
    metalSparks(c, at, 26);
    c.target.flash(0xd8e8ff, 200, 0.6);
    c.impact(0);
  }
  // steely glints running along the marks
  for (let i = 0; i < 3; i++) glint(c, at.clone().add(V((i - 1) * 0.35, 0.3 - i * 0.2, 0)), 0.7, i * 0.1);
  await vfx.wait(500);
});

registerMoveFx('STEEL_WING', async (c) => {
  const { vfx } = c;
  // wings harden: a bright glint sweeps over the user
  c.attacker.setOutline(1.6, SILVER);
  c.attacker.flash(0xe0ecff, 300, 0.5);
  glint(c, c.attacker.at(0.7), 1.3);
  await vfx.wait(240);
  await rush(c, { ms: 320, ghosts: 3, ghostColor: 0xc8dcff });
  c.attacker.setOutline(0);
  const at = c.aim(0.55);
  // a broad, flat wing stroke with a trailing twin edge
  const r = vfx.prim.ribbon(strokePoints(c, at, c.side === 0 ? -0.25 : Math.PI + 0.25, 3.2, 0.55, 9), { color: SILVER, core: 0xffffff, width: 0.16, ms: 130, length: 0.9, holdMs: 90, fadeMs: 240, intensity: 2, e: ease.outCubic });
  vfx.prim.ribbon(strokePoints(c, at.clone().add(V(0, -0.25, 0)), c.side === 0 ? -0.25 : Math.PI + 0.25, 2.8, 0.45, 9), { color: 0x7890b8, core: SILVER, width: 0.07, ms: 150, length: 0.8, fadeMs: 200, e: ease.outCubic });
  await r.arrived;
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.05, pal: STEELPAL, stop: true });
    metalSparks(c, at, 20);
    vfx.burst(towardCam(c, at, 0.5), { count: 6, tex: 'feather', color: [0xf0f4ff, 0xa8b8d0], speed: [2, 4], size: [0.25, 0.4], life: [0.5, 0.8], gravity: 2, drag: 2, additive: false, spin: 5 });
    c.impact(0);
  }
  await vfx.wait(520);
});

registerMoveFx('IRON_TAIL', async (c) => {
  const { vfx, stage } = c;
  // the tail turns to iron: glint + silver outline, then a leap
  c.attacker.setOutline(1.8, SILVER);
  c.attacker.flash(0xd0e0ff, 300, 0.55);
  glint(c, c.attacker.at(0.4).addScaledVector(c.dir, -0.3), 1.3);
  await vfx.wait(220);
  const hop = c.attacker.jump(0.9, 460);
  await vfx.wait(140);
  await rush(c, { ms: 340, dust: false });
  void hop;
  c.attacker.setOutline(0);
  const at = c.aim(0.5);
  // a massive overhead swing: thick steel arc crashing down
  const { right } = camBasis(c);
  const sgn = c.side === 0 ? -1 : 1;
  const base = towardCam(c, at, 0.7);
  const pts = [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const t = i / 6;
    const a = Math.PI * (0.15 + 0.7 * t);
    return base.clone().addScaledVector(right, sgn * Math.cos(a) * 1.6).add(V(0, Math.sin(a) * 1.9 - t * 1.8, 0));
  });
  const r = vfx.prim.ribbon(pts, { color: SILVER, core: 0xffffff, width: 0.24, ms: 150, length: 0.75, fadeMs: 260, intensity: 2, e: ease.inQuad });
  vfx.prim.ribbon(pts.map((p) => p.clone().add(V(0, 0.2, 0))), { color: 0x6a80a8, core: SILVER, width: 0.12, ms: 170, length: 0.6, fadeMs: 200, opacity: 0.6, e: ease.inQuad });
  await r.arrived;
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.5, pal: STEELPAL, stop: true, flash: 0.25 });
    metalSparks(c, at, 36);
    vfx.prim.crack(c.foeFeet, { radius: 1.6, ms: 1000 });
    stage.chromaPulse(0.01, 300);
    c.impact(0);
  }
  await vfx.wait(600);
});
