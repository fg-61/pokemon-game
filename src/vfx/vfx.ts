import * as THREE from 'three';
import type { Side } from '../battle/types';
import { TYPE_FX } from '../data/typeColors';
import type { MoveData, PokeType } from '../data/types';
import { ease } from '../render/clock';
import type { PokemonSprite } from '../render/pokemonSprite';
import { focusShot, overShoulder, sideShot, wideShot } from '../render/shots';
import type { Shot, Stage } from '../render/stage';
import { ParticlePool, type ColorLike, type ParticleSpec } from './particles';
import { Primitives } from './primitives';
import type { TexName } from './textures';

export type Palette = { core: number; main: number; dark: number };

export interface BurstOpts {
  count?: number;
  tex?: TexName;
  color?: ColorLike | [ColorLike, ColorLike];
  intensity?: number;
  speed?: number | [number, number];
  /** emission direction; omitted = spherical */
  dir?: THREE.Vector3;
  /** cone half-angle in radians when dir is given */
  spread?: number;
  life?: number | [number, number];
  size?: number | [number, number];
  endSize?: number;
  gravity?: number;
  drag?: number;
  spin?: number;
  additive?: boolean;
  /** random offset radius of spawn positions */
  jitter?: number;
  alpha?: [number, number];
  fadeIn?: number;
  attract?: { to: THREE.Vector3; strength: number };
  swirl?: { center: THREE.Vector3; speed: number };
  /** flatten to the ground plane (y velocity scaled) */
  flat?: boolean;
}

const rand = (v: number | [number, number]) => (Array.isArray(v) ? v[0] + Math.random() * (v[1] - v[0]) : v);

function randomDir(dir?: THREE.Vector3, spread = Math.PI): THREE.Vector3 {
  if (!dir) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    return new THREE.Vector3(r * Math.cos(a), u, r * Math.sin(a));
  }
  const d = dir.clone().normalize();
  const cosMax = Math.cos(spread);
  const cz = cosMax + Math.random() * (1 - cosMax);
  const sz = Math.sqrt(1 - cz * cz);
  const phi = Math.random() * Math.PI * 2;
  const local = new THREE.Vector3(sz * Math.cos(phi), sz * Math.sin(phi), cz);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
  return local.applyQuaternion(q);
}

/** Everything a move recipe needs. */
export interface MoveFxContext {
  vfx: Vfx;
  stage: Stage;
  move: MoveData;
  type: PokeType;
  pal: Palette;
  side: Side; // attacker side
  attacker: PokemonSprite;
  target: PokemonSprite;
  /** attacker/target body centers (world) and feet */
  user: THREE.Vector3;
  foe: THREE.Vector3;
  userFeet: THREE.Vector3;
  foeFeet: THREE.Vector3;
  /** unit vector from attacker to target (horizontal) */
  dir: THREE.Vector3;
  hits: number;
  missed: boolean;
  /** 'charge' = first action of a two-turn move (Solar Beam, Skull Bash, Dig...): no impacts. */
  phase: 'charge' | 'strike';
  /** status move aimed at the user itself (Swords Dance, Recover...): target === attacker */
  self: boolean;
  /** 0..1 from move power (for scaling effects) */
  power: number;
  /** Fire the i-th hit's gameplay feedback (damage number, HP drain, hit reaction). */
  impact(i?: number): void;
  /** Where to aim: the target center, or a point beside it on a miss. */
  aim(frac?: number): THREE.Vector3;
}

export type MoveRecipe = (c: MoveFxContext) => Promise<void>;

const registry = new Map<string, MoveRecipe>();

/** Register a recipe for one or more move keys (e.g. 'FLAMETHROWER'). */
export function registerMoveFx(keys: string | string[], recipe: MoveRecipe) {
  for (const k of Array.isArray(keys) ? keys : [keys]) registry.set(k, recipe);
}
export function getMoveFx(key: string): MoveRecipe | undefined {
  return registry.get(key);
}
export function registeredMoveFx(): string[] {
  return [...registry.keys()];
}

export class Vfx {
  readonly add: ParticlePool;
  readonly norm: ParticlePool;
  readonly prim: Primitives;
  constructor(readonly stage: Stage) {
    this.add = new ParticlePool(9000, true);
    this.norm = new ParticlePool(3000, false);
    stage.scene.add(this.add.points, this.norm.points);
    this.prim = new Primitives(stage);
    stage.onUpdate((dt) => {
      const el = stage.renderer.domElement;
      const scale = (el.height / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2))) * stage.camera.zoom;
      this.add.material.uniforms.scale.value = scale;
      this.norm.material.uniforms.scale.value = scale;
      this.add.update(dt);
      this.norm.update(dt);
    });
  }

  palette(type: string): Palette {
    return TYPE_FX[(type as PokeType) in TYPE_FX ? (type as PokeType) : 'NORMAL'];
  }

  wait(ms: number) {
    return this.stage.wait(ms);
  }
  tween(ms: number, fn: (k: number) => void, e = ease.inOutQuad) {
    return this.stage.tween(ms, fn, e);
  }

  // ------------------------------------------------------------ particles

  particle(spec: ParticleSpec) {
    (spec.additive === false ? this.norm : this.add).spawn(spec);
  }

  burst(pos: THREE.Vector3, o: BurstOpts = {}) {
    const n = o.count ?? 20;
    for (let i = 0; i < n; i++) {
      const d = randomDir(o.dir, o.spread ?? Math.PI);
      if (o.flat) d.y *= 0.15;
      const sp = rand(o.speed ?? 3);
      const size = rand(o.size ?? 0.25);
      const p = pos.clone();
      if (o.jitter) p.add(randomDir().multiplyScalar(Math.random() * o.jitter));
      this.particle({
        tex: o.tex ?? 'glow',
        pos: p,
        vel: d.multiplyScalar(sp),
        acc: o.gravity ? new THREE.Vector3(0, -o.gravity, 0) : undefined,
        drag: o.drag ?? 1.5,
        life: rand(o.life ?? [0.35, 0.7]),
        size: [size, o.endSize ?? size * 0.3],
        color: o.color ?? 0xffffff,
        intensity: o.intensity ?? 2,
        spin: o.spin !== undefined ? (Math.random() - 0.5) * o.spin * 2 : 0,
        additive: o.additive ?? true,
        alpha: o.alpha,
        fadeIn: o.fadeIn,
        attract: o.attract,
        swirl: o.swirl,
      });
    }
  }

  /**
   * Continuous stream from -> to over `ms` (Flamethrower, Water Gun, Hydro Pump...).
   * Particles are aimed to arrive at `to` after `travel` seconds.
   */
  async stream(from: THREE.Vector3, to: THREE.Vector3, o: BurstOpts & { ms?: number; rate?: number; travel?: number; wave?: number } = {}) {
    const ms = o.ms ?? 700;
    const rate = o.rate ?? 120; // particles/sec
    const travel = o.travel ?? 0.35;
    const t0 = this.stage.clock.time;
    let acc = 0;
    await new Promise<void>((resolve) => {
      const off = this.stage.onUpdate((dt) => {
        const el = this.stage.clock.time - t0;
        acc += dt * rate;
        while (acc >= 1) {
          acc--;
          const spread = o.spread ?? 0.08;
          const dir = to.clone().sub(from);
          const dist = dir.length();
          const d = randomDir(dir.normalize(), spread);
          if (o.wave) d.y += Math.sin(el * 12) * o.wave;
          const size = rand(o.size ?? 0.35);
          this.particle({
            tex: o.tex ?? 'glow',
            pos: from.clone().add(randomDir().multiplyScalar(Math.random() * (o.jitter ?? 0.05))),
            vel: d.multiplyScalar(dist / travel),
            acc: o.gravity ? new THREE.Vector3(0, -o.gravity, 0) : undefined,
            drag: o.drag ?? 0,
            life: rand(o.life ?? travel * 1.1),
            size: [size * 0.5, o.endSize ?? size * 1.4],
            color: o.color ?? 0xffffff,
            intensity: o.intensity ?? 2,
            spin: o.spin !== undefined ? (Math.random() - 0.5) * o.spin * 2 : 0,
            additive: o.additive ?? true,
            alpha: o.alpha ?? [1, 0.2],
          });
        }
        if (el * 1000 >= ms) {
          off();
          resolve();
        }
      });
    });
  }

  /** Emit around a moving point for `ms` (trails behind projectiles / lunges). */
  trail(getPos: () => THREE.Vector3, ms: number, o: BurstOpts & { rate?: number } = {}) {
    const rate = o.rate ?? 60;
    const t0 = this.stage.clock.time;
    let acc = 0;
    return new Promise<void>((resolve) => {
      const off = this.stage.onUpdate((dt) => {
        acc += dt * rate;
        while (acc >= 1) {
          acc--;
          this.burst(getPos(), { ...o, count: 1 });
        }
        if ((this.stage.clock.time - t0) * 1000 >= ms) {
          off();
          resolve();
        }
      });
    });
  }

  /** Particles falling from above onto an area. */
  async rain(center: THREE.Vector3, o: BurstOpts & { ms?: number; rate?: number; height?: number; radius?: number; fall?: number } = {}) {
    const ms = o.ms ?? 800;
    const rate = o.rate ?? 60;
    const t0 = this.stage.clock.time;
    let acc = 0;
    await new Promise<void>((resolve) => {
      const off = this.stage.onUpdate((dt) => {
        acc += dt * rate;
        while (acc >= 1) {
          acc--;
          const r = (o.radius ?? 1.2) * Math.sqrt(Math.random());
          const a = Math.random() * Math.PI * 2;
          const h = o.height ?? 5;
          const size = rand(o.size ?? 0.3);
          this.particle({
            tex: o.tex ?? 'drop',
            pos: center.clone().add(new THREE.Vector3(Math.cos(a) * r, h, Math.sin(a) * r)),
            vel: new THREE.Vector3(0, -(o.fall ?? 12), 0),
            life: h / (o.fall ?? 12),
            size,
            color: o.color ?? 0xffffff,
            intensity: o.intensity ?? 1.5,
            rot: 0,
            additive: o.additive ?? true,
            alpha: o.alpha ?? [1, 0.8],
          });
        }
        if ((this.stage.clock.time - t0) * 1000 >= ms) {
          off();
          resolve();
        }
      });
    });
  }

  /** Rising spiral of particles around a point (auras, stat boosts, evolution). */
  async spiral(center: THREE.Vector3, o: BurstOpts & { ms?: number; rate?: number; radius?: number; rise?: number; down?: boolean } = {}) {
    const ms = o.ms ?? 900;
    const rate = o.rate ?? 70;
    const t0 = this.stage.clock.time;
    let acc = 0;
    await new Promise<void>((resolve) => {
      const off = this.stage.onUpdate((dt) => {
        acc += dt * rate;
        while (acc >= 1) {
          acc--;
          const a = Math.random() * Math.PI * 2;
          const r = o.radius ?? 1;
          const rise = (o.rise ?? 2.5) * (o.down ? -1 : 1);
          const size = rand(o.size ?? 0.22);
          this.particle({
            tex: o.tex ?? 'spark',
            pos: center.clone().add(new THREE.Vector3(Math.cos(a) * r, o.down ? 2.2 : -0.6 + Math.random() * 0.4, Math.sin(a) * r)),
            vel: new THREE.Vector3(0, rise, 0),
            swirl: { center, speed: 3.5 },
            life: rand(o.life ?? [0.6, 1]),
            size: [size, size * 0.2],
            color: o.color ?? 0xffffff,
            intensity: o.intensity ?? 2,
            additive: o.additive ?? true,
            fadeIn: 0.15,
          });
        }
        if ((this.stage.clock.time - t0) * 1000 >= ms) {
          off();
          resolve();
        }
      });
    });
  }

  /** Standard hit spark: star flash + ring + sparks. strength 0..1.5 */
  hitSpark(pos: THREE.Vector3, pal: Palette, strength = 1) {
    this.particle({ tex: 'star', pos: pos.clone(), life: 0.18, size: [1.4 * strength, 2.2 * strength], color: pal.core, intensity: 3, alpha: [1, 0] });
    this.particle({ tex: 'glow', pos: pos.clone(), life: 0.3, size: [2.4 * strength, 3.2 * strength], color: pal.main, intensity: 2, alpha: [0.8, 0] });
    this.burst(pos, { count: Math.round(14 * strength), tex: 'spark', color: [pal.core, pal.main], speed: [3, 7 * strength], size: [0.15, 0.35], life: [0.2, 0.45], drag: 3 });
    this.prim.shockwave(pos, { color: pal.main, radius: 1.3 * strength, ms: 300, thickness: 0.25 });
  }

  /** Ground-level dust puff at feet. */
  dust(pos: THREE.Vector3, color: ColorLike = 0xd8c8a8, count = 16) {
    this.burst(pos.clone().setY(0.4), { count, tex: 'smoke', color, speed: [1, 3], dir: new THREE.Vector3(0, 1, 0), spread: 1.3, size: [0.6, 1.1], endSize: 1.8, life: [0.5, 0.9], drag: 2.5, additive: false, alpha: [0.5, 0], flat: true });
  }

  // ------------------------------------------------------------ camera helpers

  shot(which: 'wide' | 'attacker' | 'target' | 'shoulder' | 'side', side: Side, ms = 450) {
    let s: Shot;
    if (which === 'wide') s = wideShot();
    else if (which === 'attacker') s = focusShot(side);
    else if (which === 'target') s = focusShot(side === 0 ? 1 : 0);
    else if (which === 'shoulder') s = overShoulder(side);
    else s = sideShot();
    this.stage.director.move(s, ms / 1000);
  }

  shake(amp = 0.25, ms = 350) {
    this.stage.director.shake(amp, ms / 1000);
  }

  clear() {
    this.add.clear();
    this.norm.clear();
    this.prim.clear();
  }
}
