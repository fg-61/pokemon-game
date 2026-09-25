import * as THREE from 'three';
import type { BoostStat, StatusCond } from '../battle/types';
import type { PokemonSprite } from '../render/pokemonSprite';
import type { Vfx } from './vfx';

/** Generic visuals for battle events that aren't move animations (status, stat changes, heals...). */

const up = new THREE.Vector3(0, 1, 0);

export async function statusFx(vfx: Vfx, s: PokemonSprite, status: StatusCond | 'confusion') {
  const c = s.at(0.5);
  const feet = s.at(0);
  const top = s.at(1);
  switch (status) {
    case 'brn':
      s.flash(0xff6a20, 400);
      vfx.burst(feet, { count: 40, tex: 'flame', color: [0xffd070, 0xff3a10], speed: [1, 3], dir: up, spread: 0.5, life: [0.5, 0.9], size: [0.3, 0.5], jitter: 0.6, additive: false, intensity: 1.2 });
      vfx.burst(c, { count: 20, tex: 'spark', color: 0xffa040, speed: [1, 3], life: 0.5 });
      break;
    case 'par':
      s.flash(0xffe040, 300);
      for (let i = 0; i < 4; i++) {
        const a = c.clone().add(new THREE.Vector3((Math.random() - 0.5) * s.width, (Math.random() - 0.3) * s.height * 0.6, 0));
        vfx.prim.lightning(a, a.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 0.2)), { color: 0xffe030, width: 0.05, ms: 280, jitter: 0.25, segments: 6 });
        await vfx.wait(70);
      }
      break;
    case 'psn':
    case 'tox':
      s.flash(0xb040e0, 400);
      vfx.burst(feet, { count: 30, tex: 'bubble', color: 0xd070ff, speed: [0.5, 1.8], dir: up, spread: 0.6, life: [0.6, 1.1], size: [0.15, 0.35], jitter: 0.6, intensity: 1.4 });
      break;
    case 'slp':
      for (let i = 0; i < 3; i++) {
        vfx.particle({ tex: 'zzz', pos: top.clone().add(new THREE.Vector3(0.2 + i * 0.15, 0, 0)), vel: new THREE.Vector3(0.4, 0.8, 0), life: 1.2, size: [0.3 + i * 0.12, 0.6 + i * 0.12], color: 0xc8d8ff, intensity: 1.6, rot: 0 });
        await vfx.wait(220);
      }
      break;
    case 'frz':
      s.flash(0xa0e8ff, 500, 1);
      vfx.prim.debris({ from: c, count: 10, color: 0xbfefff, geometry: 'crystal', size: 0.12, speed: 1.5, up: 2, ms: 900, emissive: 0.5 });
      vfx.burst(c, { count: 40, tex: 'shard', color: [0xffffff, 0x8adfff], speed: [1, 4], life: [0.4, 0.8], size: [0.15, 0.3], spin: 4 });
      break;
    case 'confusion':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        vfx.particle({ tex: 'star', pos: top.clone().add(new THREE.Vector3(Math.cos(a) * 0.6, 0.1, Math.sin(a) * 0.6)), swirl: { center: top, speed: 5 }, life: 1.1, size: 0.3, color: 0xffe860, intensity: 1.8, spin: 6 });
      }
      break;
  }
  await vfx.wait(450);
}

const BOOST_COLOR: Record<BoostStat, number> = { atk: 0xff5a3a, def: 0x4a9aff, spa: 0xff4ad0, spd: 0x5aff9a, spe: 0xffe04a, acc: 0xffffff, eva: 0xb0b0ff };

export async function boostFx(vfx: Vfx, s: PokemonSprite, stat: BoostStat, delta: number) {
  const color = BOOST_COLOR[stat];
  const rising = delta > 0;
  const feet = s.at(0);
  s.setOutline(1.3, color);
  const n = Math.abs(delta) >= 2 ? 26 : 16;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.3 + Math.random() * Math.max(0.5, s.width * 0.45);
    const start = feet.clone().add(new THREE.Vector3(Math.cos(a) * r, rising ? Math.random() * 0.5 : s.height * (0.8 + Math.random() * 0.4), Math.sin(a) * r));
    vfx.particle({ tex: 'streak', pos: start, vel: new THREE.Vector3(0, rising ? 3.5 : -3, 0), life: 0.6, size: [0.5, 0.7], color, intensity: 1.8, rot: Math.PI / 2, alpha: [0.9, 0], fadeIn: 0.2 });
  }
  vfx.prim.shockwave(feet.clone().setY(0.4), { color, radius: 1.6, facing: 'ground', ms: 500 });
  await vfx.wait(650);
  s.setOutline(0);
}

export async function healFx(vfx: Vfx, s: PokemonSprite) {
  s.flash(0x9affb0, 450, 0.5);
  await vfx.spiral(s.at(0), { color: [0xb0ffc8, 0x40e080], tex: 'spark', ms: 700, radius: Math.max(0.6, s.width * 0.4), rise: 2.4, size: [0.12, 0.24] });
}

export async function residualFx(vfx: Vfx, s: PokemonSprite, cause: string, other?: PokemonSprite) {
  const c = s.at(0.5);
  if (cause === 'brn') {
    vfx.burst(s.at(0.1), { count: 24, tex: 'flame', color: [0xffc060, 0xff3010], speed: [1, 2.5], dir: up, spread: 0.4, life: [0.5, 0.8], size: [0.3, 0.5], jitter: 0.5, additive: false });
  } else if (cause === 'psn') {
    vfx.burst(s.at(0.1), { count: 20, tex: 'bubble', color: 0xc060ff, speed: [0.5, 1.5], dir: up, spread: 0.5, life: [0.6, 1], size: [0.15, 0.3], jitter: 0.5 });
  } else if (cause === 'leech' && other) {
    const to = other.at(0.5);
    for (let i = 0; i < 12; i++) {
      vfx.particle({ tex: 'glow', pos: c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0)), vel: new THREE.Vector3(0, 1.5, 0), attract: { to, strength: 30 }, drag: 1, life: 0.9, size: [0.25, 0.1], color: 0x80ff60, intensity: 2 });
    }
  } else if (cause === 'confusion') {
    vfx.hitSpark(c, { core: 0xffffff, main: 0xc8c8c8, dark: 0x666666 }, 0.8);
  } else {
    vfx.hitSpark(c, { core: 0xffffff, main: 0xffb0a0, dark: 0x663322 }, 0.6);
  }
  s.blink(2);
  await vfx.wait(400);
}

/** Poké Ball style send-out burst at a platform. */
export async function sendOutFx(vfx: Vfx, feet: THREE.Vector3) {
  const c = feet.clone().add(new THREE.Vector3(0, 0.9, 0));
  vfx.particle({ tex: 'glow', pos: c, life: 0.35, size: [0.5, 3.5], color: 0xffffff, intensity: 3 });
  vfx.burst(c, { count: 36, tex: 'star', color: [0xffffff, 0xffe0a0], speed: [2, 5], life: [0.4, 0.7], size: [0.12, 0.25], drag: 2 });
  vfx.prim.shockwave(feet.clone().setY(0.4), { color: 0xffffff, radius: 2.2, facing: 'ground', ms: 500 });
}

export async function returnFx(vfx: Vfx, s: PokemonSprite) {
  const top = s.at(1.2);
  vfx.prim.beam(top.clone().add(new THREE.Vector3(0, 6, 0)), s.at(0.5), { color: 0xff3a3a, core: 0xffc0c0, width: 0.15, holdMs: 250, growMs: 120 });
}
