import * as THREE from 'three';
import { ease } from '../../render/clock';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { clawMarks, during, hitStop, impactFx, rush, speedLines, strokePoints, towardCam } from './common';

// dragon-type move recipes

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const VIOLET = 0x7a4aff;
const INDIGO = 0x4a5aff;
const TEAL = 0x40e8d8;
const DRAGONPAL = { core: 0xe8e0ff, main: 0x8a5aff, dark: 0x2a0a7a };

const mouthOf = (c: MoveFxContext) => c.user.clone().addScaledVector(c.dir, 0.55).add(V(0, 0.25, 0));

function whiff(c: MoveFxContext, at = c.aim(0.5)) {
  c.vfx.burst(at, { count: 10, tex: 'spark', color: [0xe0d8ff, VIOLET], speed: [2, 5], size: [0.12, 0.24], life: 0.3 });
}

/** Blue-violet dragon flames licking upward at a point. */
function dragonFlame(c: MoveFxContext, at: THREE.Vector3, r: number, n = 3) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const q = Math.random() * r;
    c.vfx.particle({
      tex: 'flame',
      pos: at.clone().add(V(Math.cos(a) * q, Math.random() * 0.4, Math.sin(a) * q)),
      vel: V((Math.random() - 0.5) * 0.6, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.6),
      life: 0.4 + Math.random() * 0.25,
      size: [0.55, 0.15],
      color: [Math.random() < 0.5 ? 0x8ab0ff : 0xc8a0ff, Math.random() < 0.5 ? INDIGO : VIOLET],
      intensity: 1.5,
      spin: (Math.random() - 0.5) * 4,
      alpha: [0.9, 0],
    });
  }
}

registerMoveFx('DRAGON_RAGE', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('side', c.side, 450);
  const mouth = mouthOf(c);
  // gather: violet embers converge on the mouth
  c.attacker.setOutline(1.5, VIOLET);
  vfx.burst(mouth, { count: 40, tex: 'flame', color: [0xa0c0ff, VIOLET], speed: 0.1, jitter: 1.8, attract: { to: mouth, strength: 16 }, life: [0.4, 0.6], size: [0.2, 0.35], intensity: 1.5 });
  await vfx.wait(450);
  c.attacker.setOutline(0);
  // ROAR: a travelling shockwave of dragon fire
  stage.chromaPulse(0.012, 350);
  vfx.shake(0.15, 400);
  const to = c.aim(0.5);
  const flames = vfx.stream(mouth, to, { tex: 'flame', color: [0xa8c0ff, VIOLET], ms: 600, rate: 110, travel: 0.4, spread: 0.12, size: [0.45, 0.7], endSize: 1.4, spin: 3, intensity: 1.4, alpha: [0.9, 0] });
  const body = vfx.stream(mouth, to, { tex: 'flame', color: [0x4a3ac0, 0x20106a], ms: 600, rate: 50, travel: 0.45, spread: 0.1, size: [0.6, 0.9], endSize: 1.8, spin: 2, additive: false, alpha: [0.6, 0] });
  for (let i = 0; i < 4; i++) {
    const t0 = i * 110;
    void vfx.wait(t0).then(() => {
      const ring = vfx.prim.shockwave(mouth, { color: i % 2 ? VIOLET : 0x8ab0ff, radius: 1.3, startRadius: 0.4, ms: 420, facing: c.dir, thickness: 0.3, intensity: 2 });
      void vfx.tween(420, (k) => ring.mesh.position.lerpVectors(mouth, to, k), ease.linear);
    });
  }
  await vfx.wait(400);
  if (!c.missed) {
    impactFx(c, to, { strength: 1.0, pal: DRAGONPAL, ground: false });
    c.target.flash(0x8a6aff, 400, 0.6);
    c.impact(0);
  }
  // the target is engulfed in blue-violet fire
  await during(c, 700, () => dragonFlame(c, c.missed ? to.clone().add(V(0, -0.8, 0)) : c.foeFeet, Math.max(0.6, c.target.width * 0.4), 3));
  await Promise.all([flames, body]);
  await vfx.wait(250);
  vfx.shot('wide', c.side, 500);
});

registerMoveFx('DRAGON_CLAW', async (c) => {
  const { vfx } = c;
  c.attacker.setOutline(1.6, VIOLET);
  vfx.burst(c.attacker.at(0.6).addScaledVector(c.dir, 0.4), { count: 16, tex: 'spark', color: [TEAL, VIOLET], speed: [1, 3], life: 0.35, size: [0.12, 0.24] });
  await vfx.wait(200);
  await rush(c, { ms: 320, ghosts: 2, ghostColor: 0x9a7aff });
  c.attacker.setOutline(0);
  const at = c.aim(0.55);
  await clawMarks(c, at, { color: VIOLET, core: 0xc8f8ff, count: 3, width: 0.11, len: 2.3, angle: -1.05, gap: 0.42, stagger: 45, bend: 0.2, intensity: 2.2 });
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: 1.1, pal: DRAGONPAL, stop: true });
    vfx.burst(towardCam(c, at, 0.6), { count: 16, tex: 'shard', color: [TEAL, VIOLET], speed: [3, 7], size: [0.15, 0.3], life: [0.3, 0.6], spin: 8, drag: 2 });
    c.impact(0);
  }
  await vfx.wait(520);
});

registerMoveFx('DRAGON_BREATH', async (c) => {
  const { vfx } = c;
  vfx.shot('side', c.side, 400);
  const mouth = mouthOf(c);
  vfx.burst(mouth, { count: 14, tex: 'flame', color: [0xb0f0ff, VIOLET], speed: [0.5, 1.5], life: 0.3, size: [0.2, 0.4] });
  await vfx.wait(250);
  const to = c.aim(0.5);
  // a rolling stream of blue-green breath
  const breath = vfx.stream(mouth, to, { tex: 'flame', color: [0xa0fff0, 0x4a6aff], ms: 850, rate: 110, travel: 0.36, spread: 0.08, size: [0.35, 0.55], endSize: 1.3, spin: 3, intensity: 1.35, alpha: [0.85, 0], wave: 0.08 });
  const body = vfx.stream(mouth, to, { tex: 'smoke', color: [0x3a5ab0, 0x1a1060], ms: 850, rate: 40, travel: 0.42, spread: 0.1, size: [0.5, 0.8], endSize: 1.6, additive: false, alpha: [0.45, 0] });
  const sparks = vfx.stream(mouth, to, { tex: 'spark', color: [0xffffa0, 0x80ffb0], ms: 850, rate: 45, travel: 0.3, spread: 0.2, size: [0.12, 0.22], endSize: 0.1, intensity: 2.2 });
  await vfx.wait(320);
  if (!c.missed) {
    c.impact(0);
    impactFx(c, to, { strength: 0.9, pal: DRAGONPAL, ground: false });
    vfx.shake(0.12, 600);
    // crackling sparks on the target (paralysis chance)
    void during(c, 550, () => {
      if (Math.random() < 0.3) {
        const p = to.clone().add(V((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 0));
        vfx.prim.lightning(p, p.clone().add(V((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9, 0)), { color: 0xc8ff80, width: 0.05, ms: 140, segments: 6, jitter: 0.2 });
      }
      vfx.burst(to, { count: 2, tex: 'flame', color: [0xa0fff0, VIOLET], speed: [1.5, 4], size: [0.3, 0.5], life: [0.25, 0.4] });
    });
  }
  await Promise.all([breath, body, sparks]);
  await vfx.wait(350);
  vfx.shot('wide', c.side, 500);
});

registerMoveFx('TWISTER', async (c) => {
  const { vfx } = c;
  const start = c.userFeet.clone().addScaledVector(c.dir, 1.0);
  const to = c.missed ? c.aim(0).setY(c.foeFeet.y) : c.foeFeet.clone();
  // a violet-teal twister spins up in front of the user and rushes across the field
  const tw = vfx.prim.vortex(start, { color: TEAL, color2: VIOLET, radius: 1.0, height: 3.2, ms: 1900, intensity: 1.7, speed: 1.8 });
  const center = start.clone();
  const swirl = during(c, 1700, () => {
    center.copy(tw.mesh.position).add(V(0, 1.2, 0));
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.4 + Math.random() * 0.9;
      vfx.particle({
        tex: Math.random() < 0.3 ? 'leaf' : 'spark',
        pos: tw.mesh.position.clone().add(V(Math.cos(a) * r, Math.random() * 2.6, Math.sin(a) * r)),
        vel: V(0, 1.5, 0),
        swirl: { center: tw.mesh.position.clone(), speed: 7 },
        life: 0.5,
        size: [0.22, 0.1],
        color: [Math.random() < 0.5 ? TEAL : 0xc8a8ff, VIOLET],
        intensity: 1.8,
        spin: 6,
      });
    }
  });
  vfx.dust(start, 0xa89878, 10);
  await vfx.wait(250);
  await vfx.tween(520, (k) => {
    tw.mesh.position.lerpVectors(start, to, k);
    if (Math.random() < 0.5) vfx.dust(tw.mesh.position.clone(), 0xa89878, 2);
  }, ease.inOutQuad);
  if (!c.missed) {
    c.impact(0);
    impactFx(c, c.aim(0.5), { strength: 0.8, pal: DRAGONPAL, ground: false });
    // caught up and spun around
    const t = c.target;
    void vfx.tween(700, (k) => {
      t.hop = Math.sin(k * Math.PI) * 0.45;
      t.mesh.rotation.z = Math.sin(k * Math.PI * 4) * 0.25;
    }, ease.linear).then(() => {
      t.hop = 0;
      t.mesh.rotation.z = 0;
    });
  }
  await Promise.all([tw.done, swirl]);
  await vfx.wait(150);
});

registerMoveFx('OUTRAGE', async (c) => {
  const { vfx, stage } = c;
  vfx.shot('attacker', c.side, 450);
  stage.setTint(0xa04060, 0.4, 400);
  // RAMPAGE: a furious red-violet aura boils over
  c.attacker.setOutline(2.2, 0xff3a5a);
  c.attacker.shake(0.07, 0.8);
  vfx.prim.shockwave(c.userFeet.clone().setY(c.userFeet.y + 0.05), { color: 0xff4a6a, radius: 3, facing: 'ground', ms: 600, thickness: 0.3 });
  stage.chromaPulse(0.015, 500);
  await during(c, 750, (k) => {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.max(0.6, c.attacker.width * 0.45);
      vfx.particle({
        tex: 'flame',
        pos: c.userFeet.clone().add(V(Math.cos(a) * r, Math.random() * 0.5, Math.sin(a) * r)),
        vel: V(0, 3 + Math.random() * 2, 0),
        life: 0.5,
        size: [0.7, 0.2],
        color: [Math.random() < 0.5 ? 0xff5a4a : 0xc86aff, Math.random() < 0.5 ? 0xa01040 : 0x5a1aa0],
        intensity: 1.6,
        alpha: [0.9, 0],
        spin: 3,
      });
    }
    c.attacker.uniforms.flashAmt.value = 0.25 * (0.5 + 0.5 * Math.sin(k * 40));
    (c.attacker.uniforms.flashColor.value as THREE.Color).set(0xff2040);
  });
  c.attacker.uniforms.flashAmt.value = 0;
  vfx.shot('wide', c.side, 350);
  // frenzied strikes
  const strikes = 3;
  const n = Math.max(1, c.hits);
  for (let s = 0; s < strikes; s++) {
    const last = s === strikes - 1;
    await rush(c, { ms: last ? 340 : 260, dist: Math.min(4.2, c.user.distanceTo(c.foe) * (last ? 0.6 : 0.5)), ghosts: 2, ghostColor: 0xff5a7a, dust: s === 0 });
    const at = c.aim(0.45 + Math.random() * 0.2);
    const ang = [-0.9, 0.7, -1.4][s] + (c.side === 1 ? Math.PI : 0);
    const r = vfx.prim.ribbon(strokePoints(c, at, ang, 2.6, 0.3 * (s % 2 ? 1 : -1), 9), { color: s % 2 ? 0xc86aff : 0xff4a6a, core: 0xffe0f0, width: 0.14, ms: 100, length: 0.9, holdMs: 60, fadeMs: 200, e: ease.inQuad });
    await r.arrived;
    if (c.missed) whiff(c, at);
    else {
      impactFx(c, at, { strength: last ? 1.6 : 1.0, pal: { core: 0xffe0f0, main: s % 2 ? 0xb05aff : 0xff4a6a, dark: 0x5a0a3a }, stop: last, flash: last ? 0.3 : 0 });
      if (last) {
        vfx.prim.energyBlast(at, { color: 0xff3a6a, core: 0xffd0e0, radius: 2.4, ms: 450 });
        vfx.prim.crack(c.foeFeet, { radius: 1.6, ms: 1000, glow: 0xff3a6a, glowIntensity: 1.2 });
        speedLines(c, at, c.dir, { count: 12, speed: 12, color: 0xff8aa0 });
        vfx.shake(0.45, 500);
      } else {
        c.target.flash(0xff5070, 150, 0.6);
        c.target.shake(0.08, 0.2);
      }
      if (last) c.impact(n - 1);
      else if (s < n - 1) c.impact(s);
    }
    if (!last) await vfx.wait(90);
  }
  c.attacker.setOutline(0);
  hitStop(c, 40);
  await vfx.wait(450);
  stage.setTint(0xffffff, 0, 400);
  await vfx.wait(250);
});

registerMoveFx('DRAGON_DANCE', async (c) => {
  const { vfx } = c;
  vfx.shot('attacker', c.side, 450);
  const feet = c.userFeet.clone();
  const R = Math.max(0.9, c.attacker.width * 0.55);
  const H = c.attacker.height + 1.0;
  c.attacker.setOutline(1.4, VIOLET);
  const helix = (phase: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      const a = phase + t * Math.PI * 4.5;
      const r = R * (1 - t * 0.35);
      pts.push(feet.clone().add(V(Math.cos(a) * r, 0.1 + t * H, Math.sin(a) * r)));
    }
    return pts;
  };
  // two mystic dragons of energy spiral up around the user
  const d1 = vfx.prim.ribbon(helix(0), { color: VIOLET, core: 0xf0e0ff, width: 0.13, ms: 1000, length: 0.45, fadeMs: 250, segments: 200, intensity: 2.2, e: ease.inOutQuad });
  const d2 = vfx.prim.ribbon(helix(Math.PI), { color: 0xff4a6a, core: 0xffe0e8, width: 0.13, ms: 1000, length: 0.45, fadeMs: 250, segments: 200, intensity: 2.2, e: ease.inOutQuad });
  const heads = during(c, 1000, () => {
    for (const [d, col] of [
      [d1, 0xc8b0ff],
      [d2, 0xff9aaa],
    ] as const) {
      const p = d.headPos();
      vfx.particle({ tex: 'glow', pos: p, life: 0.18, size: [0.6, 0.2], color: col, intensity: 2.2 });
      vfx.particle({ tex: 'flame', pos: p.clone(), vel: V((Math.random() - 0.5) * 0.6, 0.5, (Math.random() - 0.5) * 0.6), life: 0.4, size: [0.35, 0.1], color: [col, VIOLET], intensity: 1.6 });
    }
  });
  await Promise.all([d1.arrived, d2.arrived, heads]);
  // they meet above the head and burst
  const top = feet.clone().add(V(0, H + 0.1, 0));
  vfx.burst(top, { count: 34, tex: 'spark', color: [0xffe0ff, VIOLET], speed: [2, 6], size: [0.15, 0.3], life: [0.3, 0.6] });
  vfx.prim.shockwave(top, { color: 0xc8a8ff, radius: 2.2, ms: 400 });
  vfx.prim.shockwave(feet.clone().setY(feet.y + 0.05), { color: VIOLET, radius: 2.2, facing: 'ground', ms: 500 });
  c.attacker.flash(0xc0a0ff, 400, 0.5);
  await vfx.spiral(feet, { color: [0xffe0ff, VIOLET], tex: 'spark', ms: 500, radius: R * 0.8, rise: 2.6, rate: 50 });
  c.attacker.setOutline(0);
  vfx.shot('wide', c.side, 500);
  await vfx.wait(150);
});

