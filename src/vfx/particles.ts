import * as THREE from 'three';
import { particleAtlas, TEX, type TexName } from './textures';

export type ColorLike = THREE.ColorRepresentation;

export interface ParticleSpec {
  tex?: TexName;
  pos: THREE.Vector3;
  vel?: THREE.Vector3;
  /** constant acceleration (gravity etc.) */
  acc?: THREE.Vector3;
  /** velocity damping per second (0 = none, 3 = strong) */
  drag?: number;
  life: number; // seconds
  size: number | [number, number];
  color: ColorLike | [ColorLike, ColorLike];
  /** brightness multiplier (>1 blooms) */
  intensity?: number;
  alpha?: [number, number];
  /** fade-in fraction of life */
  fadeIn?: number;
  rot?: number;
  spin?: number;
  /** attract towards a point (homing), strength in units/s^2 */
  attract?: { to: THREE.Vector3; strength: number };
  /** swirl around the Y axis through this point, radians/sec */
  swirl?: { center: THREE.Vector3; speed: number };
  additive?: boolean;
}

interface P {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  acc: THREE.Vector3;
  drag: number;
  age: number;
  life: number;
  s0: number;
  s1: number;
  c0: THREE.Color;
  c1: THREE.Color;
  a0: number;
  a1: number;
  fadeIn: number;
  rot: number;
  spin: number;
  tex: number;
  attract?: { to: THREE.Vector3; strength: number };
  swirl?: { center: THREE.Vector3; speed: number };
}

const VS = /* glsl */ `
  attribute vec4 aColor; attribute float aSize; attribute float aRot; attribute float aTex;
  varying vec4 vColor; varying float vRot; varying float vTex;
  uniform float scale;
  void main() {
    vColor = aColor; vRot = aRot; vTex = aTex;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * scale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FS = /* glsl */ `
  uniform sampler2D atlas;
  varying vec4 vColor; varying float vRot; varying float vTex;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vRot), s = sin(vRot);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) discard;
    float col = mod(vTex, 4.0); float row = floor(vTex / 4.0);
    vec2 uv = vec2((col + p.x) / 4.0, 1.0 - (row + p.y) / 4.0);
    vec4 t = texture2D(atlas, uv);
    float a = t.a * vColor.a;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vColor.rgb * t.rgb, a);
  }
`;

/** CPU-simulated pooled particle system rendered as a single Points draw call. */
export class ParticlePool {
  readonly points: THREE.Points;
  private ps: P[] = [];
  private free: number[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private rot: Float32Array;
  private tex: Float32Array;
  private geo: THREE.BufferGeometry;
  readonly material: THREE.ShaderMaterial;
  private tmp = new THREE.Vector3();

  constructor(readonly capacity: number, additive: boolean) {
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.rot = new Float32Array(capacity);
    this.tex = new Float32Array(capacity);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aTex', new THREE.BufferAttribute(this.tex, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { atlas: { value: particleAtlas() }, scale: { value: 400 } },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
    for (let i = 0; i < capacity; i++) {
      this.ps.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        acc: new THREE.Vector3(),
        drag: 0,
        age: 0,
        life: 1,
        s0: 1,
        s1: 1,
        c0: new THREE.Color(),
        c1: new THREE.Color(),
        a0: 1,
        a1: 0,
        fadeIn: 0,
        rot: 0,
        spin: 0,
        tex: 0,
      });
      this.free.push(capacity - 1 - i);
      this.col[i * 4 + 3] = 0;
    }
  }

  get active() {
    return this.capacity - this.free.length;
  }

  spawn(s: ParticleSpec) {
    const i = this.free.pop();
    if (i === undefined) return;
    const p = this.ps[i];
    p.alive = true;
    p.pos.copy(s.pos);
    p.vel.copy(s.vel ?? this.tmp.set(0, 0, 0));
    p.acc.copy(s.acc ?? this.tmp.set(0, 0, 0));
    p.drag = s.drag ?? 0;
    p.age = 0;
    p.life = s.life;
    [p.s0, p.s1] = Array.isArray(s.size) ? s.size : [s.size, s.size];
    const [c0, c1] = Array.isArray(s.color) ? s.color : [s.color, s.color];
    const k = s.intensity ?? 1;
    p.c0.set(c0).multiplyScalar(k);
    p.c1.set(c1).multiplyScalar(k);
    [p.a0, p.a1] = s.alpha ?? [1, 0];
    p.fadeIn = s.fadeIn ?? 0;
    p.rot = s.rot ?? Math.random() * Math.PI * 2;
    p.spin = s.spin ?? 0;
    p.tex = TEX[s.tex ?? 'glow'];
    p.attract = s.attract;
    p.swirl = s.swirl;
  }

  update(dt: number) {
    const { pos, col, size, rot, tex } = this;
    for (let i = 0; i < this.capacity; i++) {
      const p = this.ps[i];
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        col[i * 4 + 3] = 0;
        size[i] = 0;
        this.free.push(i);
        continue;
      }
      if (p.attract) {
        this.tmp.copy(p.attract.to).sub(p.pos);
        const d = Math.max(0.2, this.tmp.length());
        p.vel.addScaledVector(this.tmp.divideScalar(d), p.attract.strength * dt);
      }
      if (p.swirl) {
        const cx = p.swirl.center.x;
        const cz = p.swirl.center.z;
        const a = p.swirl.speed * dt;
        const x = p.pos.x - cx;
        const z = p.pos.z - cz;
        p.pos.x = cx + x * Math.cos(a) - z * Math.sin(a);
        p.pos.z = cz + x * Math.sin(a) + z * Math.cos(a);
      }
      p.vel.addScaledVector(p.acc, dt);
      if (p.drag > 0) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      p.rot += p.spin * dt;
      const t = p.age / p.life;
      pos[i * 3] = p.pos.x;
      pos[i * 3 + 1] = p.pos.y;
      pos[i * 3 + 2] = p.pos.z;
      col[i * 4] = p.c0.r + (p.c1.r - p.c0.r) * t;
      col[i * 4 + 1] = p.c0.g + (p.c1.g - p.c0.g) * t;
      col[i * 4 + 2] = p.c0.b + (p.c1.b - p.c0.b) * t;
      let a = p.a0 + (p.a1 - p.a0) * t;
      if (p.fadeIn > 0 && t < p.fadeIn) a *= t / p.fadeIn;
      col[i * 4 + 3] = a;
      size[i] = p.s0 + (p.s1 - p.s0) * t;
      rot[i] = p.rot;
      tex[i] = p.tex;
    }
    for (const name of ['position', 'aColor', 'aSize', 'aRot', 'aTex']) this.geo.getAttribute(name).needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < this.capacity; i++) {
      const p = this.ps[i];
      if (p.alive) {
        p.alive = false;
        this.col[i * 4 + 3] = 0;
        this.size[i] = 0;
        this.free.push(i);
      }
    }
  }
}
