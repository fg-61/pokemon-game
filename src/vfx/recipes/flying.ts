import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { during, impactFx, rush, sideOf, speedLines, strokePoints, towardCam } from './common';

// flying-type move recipes

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const SKY = 0xc8dcff;
const FLYPAL = { core: 0xffffff, main: 0xb8d0ff, dark: 0x6070a0 };

function whiff(c: MoveFxContext, at = c.aim(0.5)) {
  c.vfx.burst(at, { count: 8, tex: 'streak', color: 0xe8f0ff, speed: [4, 7], size: [0.4, 0.7], life: 0.18, dir: c.dir, spread: 0.5, intensity: 1.2 });
}

/** A handful of loose feathers. */
function feathers(c: MoveFxContext, at: THREE.Vector3, n = 8, speed = 3) {
  c.vfx.burst(at, { count: n, tex: 'feather', color: [0xffffff, 0xd8e0f0], speed: [speed * 0.4, speed], size: [0.25, 0.4], life: [0.7, 1.1], gravity: 1.2, drag: 2.5, additive: false, spin: 5, alpha: [1, 0] });
}

registerMoveFx('WING_ATTACK', async (c) => {
  const { vfx } = c;
  // wings spread: a flap that sheds a few feathers
  void c.attacker.jump(0.3, 260);
  feathers(c, c.user, 5, 2);
  await vfx.wait(200);
  await rush(c, { ms: 320, ghosts: 2, ghostColor: SKY });
  const at = c.aim(0.55);
  // two wing blades sweep in from either side
  const a = vfx.prim.ribbon(strokePoints(c, at.clone().add(V(0, 0.15, 0)), -0.35, 2.6, 0.5, 9), { color: SKY, core: 0xffffff, width: 0.12, ms: 120, length: 0.85, holdMs: 60, fadeMs: 220, e: ease.outCubic });
  await vfx.wait(70);
  vfx.prim.ribbon(strokePoints(c, at.clone().add(V(0, -0.15, 0)), Math.PI + 0.35, 2.6, -0.5, 9), { color: SKY, core: 0xffffff, width: 0.12, ms: 120, length: 0.85, holdMs: 60, fadeMs: 220, e: ease.outCubic });
  await a.arrived;
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 0.95, pal: FLYPAL });
    feathers(c, towardCam(c, at, 0.5), 10, 4);
    c.impact(0);
  }
  await vfx.wait(520);
});

registerMoveFx('GUST', async (c) => {
  const { vfx } = c;
  // two big flaps
  for (let i = 0; i < 2; i++) {
    void c.attacker.jump(0.35, 240);
    feathers(c, c.user, 3, 2);
    vfx.prim.shockwave(c.user.clone().addScaledVector(c.dir, 0.5), { color: 0xe0ecff, radius: 1.4, ms: 260, facing: c.dir, thickness: 0.15, intensity: 1.2 });
    await vfx.wait(220);
  }
  const to = c.aim(0.5);
  const from = c.user.clone().addScaledVector(c.dir, 0.6);
  const side = sideOf(c.dir);
  // curling wind currents race to the target
  for (let i = 0; i < 4; i++) {
    const bend = (i % 2 ? 1 : -1) * (0.6 + Math.random() * 0.6);
    const pts = [0, 1, 2, 3, 4, 5].map((j) => {
      const t = j / 5;
      return from.clone().lerp(to, t).addScaledVector(side, Math.sin(t * Math.PI) * bend).add(V(0, Math.sin(t * Math.PI * 2 + i) * 0.35 + (i - 1.5) * 0.18, 0));
    });
    vfx.prim.ribbon(pts, { color: 0xe8f0ff, core: 0xffffff, width: 0.05, ms: 280, length: 0.5, fadeMs: 160, opacity: 0.8, intensity: 1.4, e: ease.inQuad });
    await vfx.wait(50);
  }
  void vfx.stream(from, to, { tex: 'streak', color: [0xffffff, SKY], ms: 350, rate: 70, travel: 0.25, spread: 0.18, size: [0.6, 0.9], endSize: 0.7, intensity: 1.1, alpha: [0.7, 0] });
  await vfx.wait(160);
  // a small whirlwind wraps the target
  const base = c.missed ? c.aim(0).setY(c.foeFeet.y) : c.foeFeet.clone();
  const vx = vfx.prim.vortex(base, { color: 0xe8f0ff, color2: SKY, radius: Math.max(0.8, c.target.width * 0.55), height: Math.max(2.2, c.target.height + 0.6), ms: 900, intensity: 1.3, speed: 2.4, opacity: 0.8 });
  if (!c.missed) {
    impactFx(c, to, { strength: 0.8, pal: FLYPAL, ground: false });
    c.impact(0);
  }
  await during(c, 700, () => {
    const a = Math.random() * Math.PI * 2;
    const r = 0.6 + Math.random() * 0.5;
    vfx.particle({ tex: Math.random() < 0.5 ? 'leaf' : 'streak', pos: base.clone().add(V(Math.cos(a) * r, Math.random() * 2, Math.sin(a) * r)), vel: V(0, 1.2, 0), swirl: { center: base, speed: 8 }, life: 0.45, size: [0.3, 0.2], color: [0xffffff, SKY], intensity: 1.2, spin: 6, additive: true });
    if (Math.random() < 0.3) vfx.dust(base, 0xa89878, 1);
  });
  await vx.done;
});

registerMoveFx('FEATHER_DANCE', async (c) => {
  const { vfx } = c;
  // the user twirls, flinging a flurry of feathers skyward
  void c.attacker.jump(0.3, 300);
  const over = c.target.at(1).add(V(0, 1.6, 0));
  void vfx.stream(c.user.clone().add(V(0, 0.4, 0)), over, { tex: 'feather', color: [0xffffff, 0xf0e0ff], ms: 450, rate: 40, travel: 0.55, spread: 0.3, size: [0.3, 0.4], endSize: 0.35, spin: 6, additive: false, alpha: [1, 0.9], intensity: 1 });
  await vfx.wait(500);
  // they drift down onto the target in lazy spirals
  const center = c.missed ? c.aim(0.5) : c.foe.clone();
  const R = Math.max(0.8, c.target.width * 0.55);
  let landed = false;
  await during(c, 1000, (k) => {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = R * (0.5 + Math.random() * 0.7);
      vfx.particle({
        tex: 'feather',
        pos: center.clone().add(V(Math.cos(a) * r, 1.6 + Math.random() * 0.8, Math.sin(a) * r)),
        vel: V(0, -1.6 - Math.random() * 0.6, 0),
        swirl: { center, speed: 1.5 + Math.random() },
        life: 1.2,
        size: [0.32, 0.26],
        color: [Math.random() < 0.3 ? 0xffe8f4 : 0xffffff, 0xe0d8f0],
        intensity: 1.05,
        additive: false,
        spin: 3,
        alpha: [1, 0],
        fadeIn: 0.1,
      });
    }
    if (!landed && k > 0.55) {
      landed = true;
      if (!c.missed) {
        c.target.flash(0xffffff, 300, 0.45);
        vfx.spiral(c.foeFeet, { color: [0xd8e0ff, 0x8090c0], tex: 'spark', ms: 450, radius: R, down: true, rise: 2, rate: 35 });
        c.impact(0);
      }
    }
  });
  await vfx.wait(450);
});

registerMoveFx('AERIAL_ACE', async (c) => {
  const { vfx, stage } = c;
  const a = c.attacker;
  // a flash and the user all but vanishes
  a.flash(0xffffff, 120, 0.9);
  await vfx.wait(90);
  const from = c.user.clone();
  await vfx.tween(60, (k) => (a.uniforms.opacity.value = 1 - 0.85 * k));
  const dist = Math.min(4.4, c.user.distanceTo(c.foe) * 0.62);
  const lunge = a.lunge(c.foe, dist, 200);
  vfx.prim.ribbon([from, c.aim(0.5).addScaledVector(c.dir, -0.4)], { color: 0xe8f0ff, core: 0xffffff, width: 0.05, ms: 90, length: 0.7, fadeMs: 150, intensity: 1.6 });
  speedLines(c, from.clone().lerp(c.foe, 0.5), c.dir, { count: 12, speed: 20, size: 1.8 });
  await lunge;
  const at = c.aim(0.55);
  // one clean razor line across the target...
  const cut = vfx.prim.ribbon(strokePoints(c, at, c.side === 0 ? -0.55 : Math.PI + 0.55, 3.6, 0.05, 5, 0.8), { color: 0xd8e8ff, core: 0xffffff, width: 0.045, ms: 70, length: 1, holdMs: 180, fadeMs: 200, intensity: 2.2, e: ease.outCubic });
  await cut.arrived;
  await vfx.tween(120, (k) => (a.uniforms.opacity.value = 0.15 + 0.85 * k));
  a.uniforms.opacity.value = 1;
  // ...then the delayed "shing"
  await vfx.wait(90);
  if (c.missed) whiff(c, at);
  else {
    stage.flash(0xffffff, 0.2, 120);
    impactFx(c, at, { strength: 1.0, pal: FLYPAL, ground: false, stop: true });
    for (const p of cut.curve.getSpacedPoints(5)) vfx.particle({ tex: 'star', pos: p.clone(), life: 0.35, size: [0.05, 0.5], color: 0xffffff, intensity: 2.4, alpha: [1, 0], fadeIn: 0.3 });
    c.impact(0);
  }
  await vfx.wait(480);
});
