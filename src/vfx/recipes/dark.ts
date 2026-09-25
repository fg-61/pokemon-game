import * as THREE from 'three';
import { registerMoveFx, type MoveFxContext } from '../vfx';
import { hitStop, impactFx, rush, towardCam } from './common';

// dark-type move recipes

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DARKPAL = { core: 0xf0e0ff, main: 0x8a5ac8, dark: 0x0a0514 };

function whiff(c: MoveFxContext, at = c.aim(0.5)) {
  c.vfx.burst(at, { count: 10, tex: 'smoke', color: [0x3a2a4a, 0x0a0510], speed: [1, 2], size: [0.4, 0.6], endSize: 1, life: 0.5, additive: false, alpha: [0.6, 0] });
}

/** Wisps of shadow curling off a point. */
function shadows(c: MoveFxContext, at: THREE.Vector3, n: number, r = 0.8) {
  c.vfx.burst(at, { count: n, tex: 'wisp', color: [0x2a1a3a, 0x05020a], speed: [0.6, 2], jitter: r, size: [0.5, 0.9], endSize: 1.4, life: [0.5, 0.8], drag: 2, additive: false, alpha: [0.8, 0], spin: 2 });
}

async function bite(c: MoveFxContext, big: boolean) {
  const { vfx, stage } = c;
  if (big) {
    stage.setTint(0x5a4a70, 0.45, 300);
    shadows(c, c.user, 14, 0.9);
  }
  await rush(c, { ms: 300, dist: Math.min(3.4, c.user.distanceTo(c.foe) * 0.45), dust: big });
  const at = c.aim(0.55);
  const p = towardCam(c, at, 1.0);
  // shadowy maw behind the fangs
  vfx.particle({ tex: 'glow', pos: p.clone().add(V(0, 0, 0)), life: 0.45, size: [1.2, 2.4 + (big ? 0.8 : 0)], color: 0x1a0a2a, intensity: 1, additive: false, alpha: [0.0, 0.55], fadeIn: 0.6 });
  const f = vfx.prim.fangs(p, { color: 0xffffff, edge: big ? 0x10041c : 0x2a0a3a, size: big ? 1.05 : 0.75, ms: big ? 620 : 520, intensity: 1.15 });
  await f.bitten;
  if (c.missed) whiff(c, at);
  else {
    impactFx(c, at, { strength: big ? 1.35 : 0.95, pal: DARKPAL, ground: big, stop: big });
    if (big) {
      // bone-cracking: dark fracture lines burst over the target
      vfx.prim.crack(towardCam(c, at, 0.9), { color: 0x14081c, glow: 0xb080ff, glowIntensity: 1.6, radius: 1.3, ms: 700, facing: 'camera', branches: 7 });
      vfx.burst(towardCam(c, at, 0.6), { count: 16, tex: 'shard', color: [0x6a4a8a, 0x1a0a2a], speed: [3, 7], size: [0.15, 0.3], life: [0.3, 0.6], gravity: 6, additive: false, spin: 10 });
      shadows(c, at, 10, 0.5);
      vfx.shake(0.35, 400);
    } else {
      c.target.shake(0.06, 0.25);
    }
    hitStop(c, big ? 60 : 30);
    c.impact(0);
  }
  await f.done;
  if (big) stage.setTint(0xffffff, 0, 350);
  await vfx.wait(300);
}

registerMoveFx('BITE', (c) => bite(c, false));
registerMoveFx('CRUNCH', (c) => bite(c, true));
