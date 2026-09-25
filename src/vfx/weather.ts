import * as THREE from 'three';
import type { WeatherKind } from '../battle/types';
import { ENEMY_POS, PLAYER_POS, type Arena } from '../render/arena';
import type { Stage } from '../render/stage';
import type { Vfx } from './vfx';

/**
 * The weather currently shown (kept in sync by `WeatherFx.set`). Weather Ball's recipe styles itself from it.
 */
export let currentWeather: WeatherKind | null = null;

const FADE_IN = 0.6; // seconds
const FADE_OUT = 0.8;
const PLATFORM_R = 1.95;
const PLATFORM_TOP = 0.36;

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const smooth = (x: number) => x * x * (3 - 2 * x);

// ------------------------------------------------------------------ camera-relative sampling

/**
 * Samples emission points inside the current camera frustum, so ambient weather is dense where it is seen
 * (wide shot, close-ups and over-the-shoulder shots alike) and no particles are wasted off-screen.
 */
class ViewSampler {
  readonly pos = new THREE.Vector3();
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private tanV = 0.36;
  private tanH = 0.64;
  private dir = new THREE.Vector3();
  private pa = new THREE.Vector3();
  private pb = new THREE.Vector3();

  constructor(private stage: Stage) {}

  refresh() {
    const cam = this.stage.camera;
    this.pos.copy(cam.position);
    const q = cam.quaternion;
    this.right.set(1, 0, 0).applyQuaternion(q);
    this.up.set(0, 1, 0).applyQuaternion(q);
    this.fwd.set(0, 0, -1).applyQuaternion(q);
    this.tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / Math.max(0.01, cam.zoom);
    this.tanH = this.tanV * cam.aspect;
  }

  /** Point `d` units along the view ray through screen coords (u, v) (-1..1 = screen edges). */
  point(u: number, v: number, d: number): THREE.Vector3 {
    return this.fwd.clone().addScaledVector(this.right, u * this.tanH).addScaledVector(this.up, v * this.tanV).multiplyScalar(d).add(this.pos);
  }

  /** Where the view ray through (u, v) meets the ground (platform tops included); null if it misses / is too far. */
  ground(u: number, v: number, maxDist = 26): THREE.Vector3 | null {
    const d = this.dir.copy(this.fwd).addScaledVector(this.right, u * this.tanH).addScaledVector(this.up, v * this.tanV);
    if (d.y > -0.02) return null;
    const t = -this.pos.y / d.y;
    if (t * d.length() > maxDist) return null;
    const p = this.pos.clone().addScaledVector(d, t);
    if (onPlatform(p)) p.y = PLATFORM_TOP;
    else p.y = 0.03;
    return p;
  }

  /** A random visible ground point (tries a few times). */
  randomGround(vMax = 0.4, maxDist = 26): THREE.Vector3 | null {
    for (let i = 0; i < 4; i++) {
      const p = this.ground(rnd(-1.1, 1.1), rnd(-1.1, vMax), maxDist);
      if (p) return p;
    }
    return null;
  }

  /** Distance of p from the camera along the view axis. */
  depth(p: THREE.Vector3) {
    return this.dir.copy(p).sub(this.pos).dot(this.fwd);
  }

  /** On-screen angle (radians, CCW from screen right) of a world direction at p — for streak particles. */
  angle(p: THREE.Vector3, dir: THREE.Vector3): number {
    const cam = this.stage.camera;
    this.pa.copy(p).project(cam);
    this.pb.copy(p).addScaledVector(dir, 0.05).project(cam);
    return Math.atan2(this.pb.y - this.pa.y, (this.pb.x - this.pa.x) * cam.aspect);
  }
}

function onPlatform(p: THREE.Vector3) {
  const dx0 = p.x - PLAYER_POS.x;
  const dz0 = p.z - PLAYER_POS.z;
  const dx1 = p.x - ENEMY_POS.x;
  const dz1 = p.z - ENEMY_POS.z;
  return dx0 * dx0 + dz0 * dz0 < PLATFORM_R * PLATFORM_R || dx1 * dx1 + dz1 * dz1 < PLATFORM_R * PLATFORM_R;
}

// ------------------------------------------------------------------ ground ripples (one instanced draw call)

const SPLASH_VS = /* glsl */ `
  attribute vec3 aOff; attribute float aT0; attribute float aSize;
  uniform float time; uniform float dur;
  varying vec2 vUv; varying float vAge;
  void main() {
    vUv = uv;
    float age = (time - aT0) / dur;
    vAge = age;
    float s = aSize * (0.2 + 0.8 * sqrt(clamp(age, 0.0, 1.0)));
    vec3 p = aOff + vec3(position.x * s, 0.0, -position.y * s);
    if (age < 0.0 || age > 1.0) p = vec3(0.0, -500.0, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const SPLASH_FS = /* glsl */ `
  uniform vec3 color; uniform float alpha;
  varying vec2 vUv; varying float vAge;
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    float ring = smoothstep(1.0, 0.9, r) * smoothstep(0.62, 0.84, r);
    float inner = smoothstep(0.5, 0.42, r) * smoothstep(0.22, 0.36, r) * (1.0 - smoothstep(0.2, 0.6, vAge));
    float a = (ring + inner * 0.7) * pow(1.0 - clamp(vAge, 0.0, 1.0), 1.4) * alpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(color, a);
  }
`;

/** Flat expanding rings on the ground (rain splashes, hail impacts), recycled round-robin. */
class SplashField {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private off: THREE.InstancedBufferAttribute;
  private t0: THREE.InstancedBufferAttribute;
  private size: THREE.InstancedBufferAttribute;
  private next = 0;

  constructor(private stage: Stage, private n: number, color: number, intensity: number, dur: number) {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.setAttribute('uv', base.getAttribute('uv'));
    this.off = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.t0 = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(-1000), 1).setUsage(THREE.DynamicDrawUsage);
    this.size = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aOff', this.off);
    this.geo.setAttribute('aT0', this.t0);
    this.geo.setAttribute('aSize', this.size);
    this.geo.instanceCount = n;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, dur: { value: dur }, color: { value: new THREE.Color(color).multiplyScalar(intensity) }, alpha: { value: 1 } },
      vertexShader: SPLASH_VS,
      fragmentShader: SPLASH_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    stage.scene.add(this.mesh);
  }

  spawn(p: THREE.Vector3, size: number) {
    const i = this.next++ % this.n;
    this.off.setXYZ(i, p.x, p.y, p.z);
    this.t0.setX(i, this.stage.clock.time);
    this.size.setX(i, size);
    this.off.needsUpdate = this.t0.needsUpdate = this.size.needsUpdate = true;
  }

  update(t: number, alpha: number) {
    this.mat.uniforms.time.value = t;
    this.mat.uniforms.alpha.value = alpha;
  }

  dispose() {
    this.stage.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ------------------------------------------------------------------ thin motion streaks (one instanced draw call)

const STREAK_VS = /* glsl */ `
  attribute vec3 aP0; attribute vec3 aVel; attribute vec4 aColor; attribute vec4 aShape; // t0, life, length, width
  uniform float time;
  varying vec2 vUv; varying vec4 vColor;
  void main() {
    float age = time - aShape.x;
    float k = age / aShape.y;
    vec3 dir = normalize(aVel);
    vec3 head = aP0 + aVel * age;
    vec3 mid = head - dir * aShape.z * (0.5 - position.y);
    vec3 side = normalize(cross(dir, cameraPosition - mid));
    vec3 p = mid + side * position.x * aShape.w;
    if (k < 0.0 || k > 1.0) p = vec3(0.0, -500.0, 0.0);
    vUv = uv;
    vColor = vec4(aColor.rgb, aColor.a * smoothstep(0.0, 0.2, k) * (1.0 - smoothstep(0.65, 1.0, k)));
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;
const STREAK_FS = /* glsl */ `
  varying vec2 vUv; varying vec4 vColor;
  void main() {
    float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
    float a = vColor.a * pow(across, 1.2) * pow(vUv.y, 1.3);
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor.rgb, a);
  }
`;

/** Thin camera-facing motion lines (wind-blown sand); head bright, tail fading. Recycled round-robin. */
export class StreakField {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private p0: THREE.InstancedBufferAttribute;
  private vel: THREE.InstancedBufferAttribute;
  private color: THREE.InstancedBufferAttribute;
  private shape: THREE.InstancedBufferAttribute;
  private next = 0;

  constructor(private stage: Stage, private n: number, additive: boolean) {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.getAttribute('position'));
    this.geo.setAttribute('uv', base.getAttribute('uv'));
    const attr = (size: number) => new THREE.InstancedBufferAttribute(new Float32Array(n * size), size).setUsage(THREE.DynamicDrawUsage);
    this.p0 = attr(3);
    this.vel = attr(3);
    this.color = attr(4);
    this.shape = attr(4);
    for (let i = 0; i < n; i++) this.shape.setXYZW(i, -1000, 1, 1, 0.02);
    this.geo.setAttribute('aP0', this.p0);
    this.geo.setAttribute('aVel', this.vel);
    this.geo.setAttribute('aColor', this.color);
    this.geo.setAttribute('aShape', this.shape);
    this.geo.instanceCount = n;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: STREAK_VS,
      fragmentShader: STREAK_FS,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    stage.scene.add(this.mesh);
  }

  spawn(p: THREE.Vector3, vel: THREE.Vector3, o: { life: number; len: number; width: number; color: THREE.Color; alpha: number }) {
    const i = this.next++ % this.n;
    this.p0.setXYZ(i, p.x, p.y, p.z);
    this.vel.setXYZ(i, vel.x, vel.y, vel.z);
    this.color.setXYZW(i, o.color.r, o.color.g, o.color.b, o.alpha);
    this.shape.setXYZW(i, this.stage.clock.time, o.life, o.len, o.width);
    this.p0.needsUpdate = this.vel.needsUpdate = this.color.needsUpdate = this.shape.needsUpdate = true;
  }

  update(t: number) {
    this.mat.uniforms.time.value = t;
  }

  dispose() {
    this.stage.scene.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ------------------------------------------------------------------ screen-space weather grade (one full-screen quad)

const OVERLAY_FS = /* glsl */ `
  uniform float time; uniform float aspect;
  uniform vec2 sunPos; uniform vec3 sunCol; uniform vec3 ghostCol;
  uniform float rays; uniform float gloom; uniform float haze; uniform float frost;
  uniform vec3 gloomCol; uniform vec3 sandCol; uniform vec3 frostCol;
  varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.07; a *= 0.5; } return v; }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    vec3 add = vec3(0.0);
    vec3 col = vec3(0.0);
    float a = 0.0;
    if (rays > 0.001) {
      // god rays fanning out of the sun's screen position (usually just above the frame) + warm glow + lens ghosts
      vec2 d = p - sunPos; d.x *= aspect;
      float r = length(d);
      float ang = atan(d.y, d.x);
      float sh = pow(0.5 + 0.5 * sin(ang * 11.0 + time * 0.21 + sin(ang * 4.0 - time * 0.3) * 1.3), 5.0)
               + 0.7 * pow(0.5 + 0.5 * sin(ang * 19.0 - time * 0.16 + 1.7), 7.0)
               + 0.5 * pow(0.5 + 0.5 * sin(ang * 6.0 + time * 0.11 + 3.1), 9.0);
      float fall = exp(-r * 0.95);
      float glow = exp(-r * r * 1.5);
      float vmask = smoothstep(-0.3, 1.0, p.y);
      float onScreen = smoothstep(1.7, 0.9, max(abs(sunPos.x), abs(sunPos.y)));
      float gh = 0.0;
      for (int i = 0; i < 4; i++) {
        float fi = float(i);
        float k = 0.55 + fi * 0.42;
        vec2 c = sunPos * (1.0 - k * 1.6);
        vec2 q = p - c; q.x *= aspect;
        float rad = 0.05 + 0.05 * mod(fi * 1.7, 2.3);
        gh += smoothstep(rad, rad * 0.55, length(q)) * (0.45 - fi * 0.08);
      }
      add += sunCol * rays * ((sh * fall * 0.12 + glow * 0.16) * vmask + 0.012) + ghostCol * gh * onScreen * rays * 0.35;
    }
    if (gloom > 0.001) {
      // overcast: darker, bluer top of frame and edges
      float top = smoothstep(-0.4, 1.0, p.y);
      float vig = smoothstep(0.7, 1.6, length(p * vec2(1.0, 1.2)));
      float g = gloom * (0.08 + 0.17 * top + 0.14 * vig);
      col += gloomCol * g; a += g;
    }
    if (haze > 0.001) {
      // blowing sand: gusty dust banks streaming across the screen
      vec2 q = vec2(p.x * aspect, p.y);
      float n = fbm(vec2(q.x * 0.9 - time * 1.35, q.y * 2.6 + sin(q.x * 0.6 + time * 0.4) * 0.5));
      float n2 = fbm(vec2(q.x * 2.2 - time * 2.6, q.y * 5.5) + 7.3);
      float dens = smoothstep(0.38, 0.82, n) * 0.65 + smoothstep(0.5, 0.88, n2) * 0.35;
      float low = smoothstep(0.8, -0.8, p.y);
      float h = haze * (0.04 + 0.16 * dens + 0.05 * low);
      col += sandCol * h; a += h;
    }
    if (frost > 0.001) {
      // cold, pale frame edges
      float vig = smoothstep(0.75, 1.65, length(p * vec2(1.0, 1.25)));
      float top = smoothstep(0.0, 1.0, p.y);
      float f = frost * (0.04 + 0.08 * top + 0.26 * vig);
      col += frostCol * f; a += f;
    }
    a = min(a, 0.55);
    gl_FragColor = vec4(col + add, a);
  }
`;

class WeatherOverlay {
  readonly mesh: THREE.Mesh;
  readonly u = {
    time: { value: 0 },
    aspect: { value: 16 / 9 },
    sunPos: { value: new THREE.Vector2(0.5, 1.6) },
    sunCol: { value: new THREE.Color(0xffc670) },
    ghostCol: { value: new THREE.Color(0xffb060) },
    rays: { value: 0 },
    gloom: { value: 0 },
    haze: { value: 0 },
    frost: { value: 0 },
    gloomCol: { value: new THREE.Color(0x1c2638) },
    sandCol: { value: new THREE.Color(0xc89a5c) },
    frostCol: { value: new THREE.Color(0xdcecff) },
  };
  private sunDir: THREE.Vector3;
  private v = new THREE.Vector3();

  constructor(private stage: Stage, sunDir: [number, number, number]) {
    this.sunDir = new THREE.Vector3(...sunDir).normalize();
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: OVERLAY_FS,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // premultiplied: additive light (rays) + "over" layers (gloom, haze, frost) in one pass
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 40;
    stage.scene.add(this.mesh);
  }

  update(t: number) {
    const cam = this.stage.camera;
    this.u.time.value = t;
    this.u.aspect.value = cam.aspect;
    // the sun's position in NDC (may be far outside the frame; behind the camera -> pushed off-screen)
    cam.updateMatrixWorld();
    const v = this.v.copy(this.sunDir).transformDirection(cam.matrixWorldInverse);
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / Math.max(0.01, cam.zoom);
    const tanH = tanV * cam.aspect;
    let x: number;
    let y: number;
    if (v.z > -0.05) {
      const l = Math.hypot(v.x, v.y) || 1;
      x = (v.x / l) * 4;
      y = (v.y / l) * 4;
    } else {
      x = v.x / -v.z / tanH;
      y = v.y / -v.z / tanV;
      const m = Math.max(Math.abs(x), Math.abs(y));
      if (m > 4) {
        x *= 4 / m;
        y *= 4 / m;
      }
    }
    // stylized: keep the ray source just outside the frame so the shafts always cross the top of the shot
    const m = Math.max(Math.abs(x), Math.abs(y));
    if (m > 1.3) {
      x *= 1.3 / m;
      y *= 1.3 / m;
    }
    this.u.sunPos.value.set(x, y);
  }

  dispose() {
    this.stage.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ------------------------------------------------------------------ weather layers

interface Layer {
  readonly kind: WeatherKind;
  /** raw fade 0..1 */
  amount: number;
  target: number;
  /** k = eased fade amount */
  update(dt: number, t: number, k: number): void;
  dispose(): void;
}

interface LayerCtx {
  stage: Stage;
  vfx: Vfx;
  view: ViewSampler;
  /** 0.55..1 scene brightness (dark themes get darker dust / mist so they don't glow) */
  lit: number;
}

/** color scaled by the scene brightness */
const litColor = (c: number, lit: number) => new THREE.Color(c).multiplyScalar(lit);

/** Rain: slanted streaks through the whole view, ripples + droplets on the ground, low mist. */
class RainLayer implements Layer {
  readonly kind = 'rain' as const;
  amount = 0;
  target = 1;
  private splashes: SplashField;
  private acc = 0;
  private accSplash = 0;
  private accMist = 0;
  private vel = new THREE.Vector3();
  private mist: THREE.Color;

  constructor(private c: LayerCtx) {
    this.splashes = new SplashField(c.stage, 110, 0xb8cce8, 0.9, 0.42);
    this.mist = litColor(0x9aa8bc, c.lit);
  }

  update(dt: number, t: number, k: number) {
    const { vfx, view } = this.c;
    this.splashes.update(t, k);
    // streaks, sampled through the view frustum so both the wide shot and close-ups are covered
    this.acc += dt * 820 * k;
    while (this.acc >= 1) {
      this.acc--;
      const d = 1.6 + 22 * Math.pow(Math.random(), 1.2);
      const mid = view.point(rnd(-1.15, 1.15), rnd(-1.15, 1.15), d);
      if (mid.y < 0.15) continue;
      const fall = rnd(15, 19);
      const vel = this.vel.set(fall * 0.15, -fall, fall * 0.07).clone();
      const life = rnd(0.28, 0.45);
      const near = d < 4.5;
      const size = (0.5 + d * 0.028) * rnd(0.8, 1.25);
      vfx.particle({
        tex: 'streak',
        pos: mid.clone().addScaledVector(vel, -life * 0.5),
        vel,
        life,
        size,
        color: 0xa8bcd8,
        intensity: near ? 0.4 : 0.62,
        rot: view.angle(mid, vel),
        alpha: near ? [0.26, 0.2] : [0.6, 0.45],
        fadeIn: 0.12,
      });
    }
    // ground ripples (+ a couple of droplets from some of them)
    this.accSplash += dt * 150 * k;
    while (this.accSplash >= 1) {
      this.accSplash--;
      const p = view.randomGround(0.45, 24);
      if (!p) continue;
      const d = view.depth(p);
      this.splashes.spawn(p, rnd(0.22, 0.42) * (0.8 + d * 0.02));
      if (Math.random() < 0.35 && d < 16) {
        for (let i = 0; i < 2; i++) {
          vfx.particle({
            tex: 'dot',
            pos: p.clone().setY(p.y + 0.03),
            vel: new THREE.Vector3(rnd(-0.8, 0.8), rnd(1.4, 2.4), rnd(-0.8, 0.8)),
            acc: new THREE.Vector3(0, -14, 0),
            life: 0.28,
            size: 0.05,
            color: 0xc8dcf4,
            intensity: 0.9,
            alpha: [0.8, 0.2],
          });
        }
      }
    }
    // low drifting mist
    this.accMist += dt * 2.5 * k;
    while (this.accMist >= 1) {
      this.accMist--;
      const p = view.randomGround(0.2, 22);
      if (!p) continue;
      vfx.particle({
        tex: 'smoke',
        pos: p.setY(rnd(0.3, 0.9)),
        vel: new THREE.Vector3(0.35, 0, 0.15),
        life: 3.2,
        size: [2.6, 4.6],
        color: this.mist,
        intensity: 1,
        alpha: [0.26, 0],
        fadeIn: 0.45,
        spin: rnd(-0.15, 0.15),
        additive: false,
      });
    }
  }

  dispose() {
    this.splashes.dispose();
  }
}

/** Sandstorm: gusty grains and dust banks blowing horizontally across the arena. */
class SandLayer implements Layer {
  readonly kind = 'sand' as const;
  amount = 0;
  target = 1;
  private acc = 0;
  private accStreak = 0;
  private accCloud = 0;
  private wind = new THREE.Vector3(0.9, 0, 0.42).normalize();
  private light: THREE.Color;
  private dark: THREE.Color;
  private streak: THREE.Color;
  private bank: [THREE.Color, THREE.Color];
  private lines: StreakField;

  constructor(private c: LayerCtx) {
    this.lines = new StreakField(c.stage, 260, false);
    this.light = litColor(0xf2dca8, c.lit);
    this.dark = litColor(0x7a5028, c.lit);
    this.streak = litColor(0xf6e4b8, c.lit);
    this.bank = [litColor(0xb88a58, c.lit), litColor(0x9a7048, c.lit)];
  }

  update(dt: number, t: number, k: number) {
    const { vfx, view } = this.c;
    const gust = THREE.MathUtils.clamp(0.62 + 0.3 * Math.sin(t * 1.25) + 0.2 * Math.sin(t * 3.3 + 1.1), 0.25, 1.2);
    // grains
    this.acc += dt * 420 * gust * k;
    while (this.acc >= 1) {
      this.acc--;
      const d = 1.8 + 20 * Math.pow(Math.random(), 1.15);
      const mid = view.point(rnd(-1.2, 1.2), rnd(-1.15, 0.9), d);
      if (mid.y < 0.05) mid.y = rnd(0.05, 0.6);
      const sp = rnd(8, 14) * (0.75 + 0.45 * gust);
      const vel = this.wind.clone().multiplyScalar(sp).add(new THREE.Vector3(0, rnd(-0.6, 1.2), rnd(-0.8, 0.8)));
      const life = rnd(0.7, 1.1);
      vfx.particle({
        tex: 'dot',
        pos: mid.addScaledVector(vel, -life * 0.5),
        vel,
        life,
        size: (0.05 + d * 0.0068) * rnd(0.7, 1.5),
        color: Math.random() < 0.45 ? this.light : this.dark,
        intensity: 1,
        alpha: [1, 0.8],
        fadeIn: 0.1,
        additive: false,
      });
    }
    // wind lines
    this.lines.update(t);
    this.accStreak += dt * 160 * gust * k;
    while (this.accStreak >= 1) {
      this.accStreak--;
      const d = 2 + 18 * Math.random();
      const mid = view.point(rnd(-1.25, 1.25), rnd(-1.1, 0.75), d);
      if (mid.y < 0.08) mid.y = rnd(0.08, 1.2);
      const vel = this.wind.clone().multiplyScalar(rnd(18, 26) * (0.8 + 0.3 * gust)).add(new THREE.Vector3(0, rnd(-0.3, 0.6), 0));
      const life = rnd(0.35, 0.55);
      this.lines.spawn(mid.clone().addScaledVector(vel, -life * 0.5), vel, {
        life,
        len: rnd(1.2, 2.8),
        width: rnd(0.025, 0.045) * (0.8 + d * 0.03),
        color: this.streak,
        alpha: rnd(0.45, 0.75),
      });
    }
    // dust banks
    this.accCloud += dt * 18 * k * (0.6 + 0.5 * gust);
    while (this.accCloud >= 1) {
      this.accCloud--;
      const g = view.randomGround(0.3, 24);
      if (!g) continue;
      const p = g.setY(rnd(0.3, 2.6)).addScaledVector(this.wind, -rnd(2, 5));
      vfx.particle({
        tex: 'smoke',
        pos: p,
        vel: this.wind.clone().multiplyScalar(rnd(4.5, 7.5)).add(new THREE.Vector3(0, rnd(0, 0.4), 0)),
        life: rnd(1.8, 2.6),
        size: [rnd(3.5, 5), rnd(6, 9)],
        color: this.bank,
        intensity: 1,
        alpha: [0.5, 0],
        fadeIn: 0.45,
        spin: rnd(-0.4, 0.4),
        additive: false,
      });
    }
  }

  dispose() {
    this.lines.dispose();
  }
}

/** Hail: fast white pellets that bounce and shatter on the ground, cold mist. */
class HailLayer implements Layer {
  readonly kind = 'hail' as const;
  amount = 0;
  target = 1;
  private splashes: SplashField;
  private acc = 0;
  private accMist = 0;
  private pending: { t: number; p: THREE.Vector3; d: number }[] = [];
  private mist: THREE.Color;

  constructor(private c: LayerCtx) {
    this.splashes = new SplashField(c.stage, 70, 0xe8f4ff, 0.8, 0.26);
    this.mist = litColor(0xe4eef8, c.lit);
  }

  update(dt: number, t: number, k: number) {
    const { vfx, view } = this.c;
    this.splashes.update(t, k);
    this.acc += dt * 190 * k;
    while (this.acc >= 1) {
      this.acc--;
      const land = view.randomGround(0.55, 28);
      if (!land) continue;
      const fall = rnd(17, 22);
      const vel = new THREE.Vector3(fall * 0.08, -fall, fall * 0.04);
      const T = rnd(0.3, 0.55);
      const start = land.clone().addScaledVector(vel, -T);
      const d = view.depth(land);
      const size = (0.09 + d * 0.0055) * rnd(0.8, 1.3);
      vfx.particle({ tex: 'dot', pos: start, vel, life: T, size, color: 0xf2f8ff, intensity: 1.05, alpha: [1, 1], additive: false });
      vfx.particle({
        tex: 'streak',
        pos: start.clone().addScaledVector(vel, -0.02),
        vel,
        life: T,
        size: size * 3.6,
        color: 0xcfe6ff,
        intensity: 0.5,
        rot: view.angle(start, vel),
        alpha: [0.45, 0.45],
        fadeIn: 0.1,
      });
      this.pending.push({ t: t + T, p: land, d });
    }
    // landings: bounce + tiny shatter + ring
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const h = this.pending[i];
      if (h.t > t) continue;
      this.pending.splice(i, 1);
      if (k < 0.02) continue;
      const p = h.p;
      const s = 0.09 + h.d * 0.0055;
      vfx.particle({
        tex: 'dot',
        pos: p.clone().setY(p.y + 0.04),
        vel: new THREE.Vector3(rnd(-1.2, 1.2), rnd(2.2, 3.4), rnd(-1.2, 1.2)),
        acc: new THREE.Vector3(0, -17, 0),
        life: 0.36,
        size: s * 0.8,
        color: 0xf2f8ff,
        intensity: 1.05,
        alpha: [1, 0.6],
        additive: false,
      });
      const n = h.d < 14 ? 3 : 1;
      for (let j = 0; j < n; j++) {
        const a = Math.random() * Math.PI * 2;
        vfx.particle({
          tex: 'shard',
          pos: p.clone().setY(p.y + 0.05),
          vel: new THREE.Vector3(Math.cos(a) * rnd(1.5, 3), rnd(0.8, 1.8), Math.sin(a) * rnd(1.5, 3)),
          acc: new THREE.Vector3(0, -10, 0),
          life: 0.26,
          size: [s * 1.2, s * 0.4],
          color: 0xe8f6ff,
          intensity: 1.1,
          spin: rnd(-12, 12),
          alpha: [0.9, 0],
        });
      }
      if (Math.random() < 0.55) this.splashes.spawn(p, rnd(0.2, 0.34) * (0.8 + h.d * 0.02));
    }
    // cold mist hugging the ground
    this.accMist += dt * 2.5 * k;
    while (this.accMist >= 1) {
      this.accMist--;
      const p = view.randomGround(0.2, 22);
      if (!p) continue;
      vfx.particle({
        tex: 'smoke',
        pos: p.setY(rnd(0.2, 0.7)),
        vel: new THREE.Vector3(0.25, 0, 0.1),
        life: 3,
        size: [2.4, 4.2],
        color: this.mist,
        intensity: 1,
        alpha: [0.24, 0],
        fadeIn: 0.45,
        spin: rnd(-0.15, 0.15),
        additive: false,
      });
    }
  }

  dispose() {
    this.pending.length = 0;
    this.splashes.dispose();
  }
}

/** Harsh sunlight: drifting golden motes and twinkling ground glints (god rays + warm glow: WeatherOverlay). */
class SunLayer implements Layer {
  readonly kind = 'sun' as const;
  amount = 0;
  target = 1;
  private acc = 0;
  private accGlint = 0;

  constructor(private c: LayerCtx) {}

  update(dt: number, _t: number, k: number) {
    const { vfx, view } = this.c;
    this.acc += dt * 32 * k;
    while (this.acc >= 1) {
      this.acc--;
      const d = 2.5 + 15 * Math.random();
      const p = view.point(rnd(-1.1, 1.1), rnd(-1, 1), d);
      if (p.y < 0.1) p.y = rnd(0.1, 1.5);
      vfx.particle({
        tex: 'glow',
        pos: p,
        vel: new THREE.Vector3(rnd(-0.25, 0.25), rnd(0.2, 0.5), rnd(-0.25, 0.25)),
        life: rnd(2.4, 3.6),
        size: (0.07 + d * 0.006) * rnd(0.7, 1.4),
        color: Math.random() < 0.5 ? 0xffd88a : 0xffb860,
        intensity: 1.15,
        alpha: [0.85, 0],
        fadeIn: 0.35,
      });
    }
    this.accGlint += dt * 5 * k;
    while (this.accGlint >= 1) {
      this.accGlint--;
      const p = view.randomGround(0.1, 18);
      if (!p) continue;
      p.y += 0.08;
      const d = view.depth(p);
      vfx.particle({ tex: 'star', pos: p, life: 0.5, size: [d * 0.03 * rnd(0.7, 1.2), 0.02], color: 0xfff0c8, intensity: 1.35, alpha: [1, 0.2], fadeIn: 0.35, spin: 1.4 });
    }
  }

  dispose() {}
}

// ------------------------------------------------------------------ public API

/**
 * Arena-wide weather presentation (Sunny Day / Rain Dance / Sandstorm / Hail and the Drought / Drizzle /
 * Sand Stream abilities): ambient particles around the arena plus a lighting shift, faded in and out.
 * The battle controller calls `set(kind)` when the engine reports a weather change and `dispose()` at the end.
 */
export class WeatherFx {
  kind: WeatherKind | null = null;
  private off: (() => void) | null = null;
  private layers: Layer[] = [];
  private overlay: WeatherOverlay | null = null;
  private view: ViewSampler;

  constructor(
    private stage: Stage,
    private vfx: Vfx,
    private arena?: Arena,
  ) {
    this.view = new ViewSampler(stage);
  }

  /** Switch to `kind` (null = clear skies) with a short cross-fade. */
  set(kind: WeatherKind | null) {
    if (kind === this.kind) return;
    this.kind = kind;
    currentWeather = kind;
    for (const l of this.layers) l.target = l.kind === kind ? 1 : 0;
    if (kind && !this.layers.some((l) => l.kind === kind)) this.layers.push(this.makeLayer(kind));
    if (this.layers.length && !this.off) this.off = this.stage.onUpdate((dt, t) => this.tick(dt, t));
  }

  dispose() {
    this.off?.();
    this.off = null;
    for (const l of this.layers) l.dispose();
    this.layers = [];
    this.overlay?.dispose();
    this.overlay = null;
    this.arena?.setWeather(null, 0);
    this.kind = null;
    currentWeather = null;
  }

  private makeLayer(kind: WeatherKind): Layer {
    const ctx: LayerCtx = { stage: this.stage, vfx: this.vfx, view: this.view, lit: this.lit() };
    if (kind === 'rain') return new RainLayer(ctx);
    if (kind === 'sand') return new SandLayer(ctx);
    if (kind === 'hail') return new HailLayer(ctx);
    return new SunLayer(ctx);
  }

  /** Brightness of the arena theme (horizon luminance) -> 0.55..1. */
  private lit() {
    const h = new THREE.Color(this.arena?.theme.skyHorizon ?? 0xbfe3ff);
    const lum = h.r * 0.299 + h.g * 0.587 + h.b * 0.114; // linear
    return THREE.MathUtils.clamp(0.5 + lum * 0.8, 0.55, 1);
  }

  private tick(dt: number, t: number) {
    this.view.refresh();
    if (!this.overlay) {
      this.overlay = new WeatherOverlay(this.stage, this.arena?.theme.sunDir ?? [0.4, 0.7, -0.6]);
      const lit = this.lit();
      this.overlay.u.sandCol.value.multiplyScalar(lit);
      this.overlay.u.frostCol.value.multiplyScalar(lit);
    }
    const w: Record<WeatherKind, number> = { sun: 0, rain: 0, sand: 0, hail: 0 };
    for (const l of [...this.layers]) {
      const rate = l.target > l.amount ? 1 / FADE_IN : 1 / FADE_OUT;
      l.amount = THREE.MathUtils.clamp(l.amount + Math.sign(l.target - l.amount) * Math.min(Math.abs(l.target - l.amount), rate * dt), 0, 1);
      const k = smooth(l.amount);
      try {
        l.update(dt, t, k);
      } catch (e) {
        console.error('weather fx', e);
      }
      this.arena?.setWeather(l.kind, k);
      w[l.kind] = k;
      if (l.target === 0 && l.amount <= 0) {
        l.dispose();
        this.layers.splice(this.layers.indexOf(l), 1);
        this.arena?.setWeather(l.kind, 0);
      }
    }
    const u = this.overlay.u;
    u.rays.value = w.sun;
    u.gloom.value = w.rain;
    u.haze.value = w.sand;
    u.frost.value = w.hail;
    this.overlay.update(t);
    if (!this.layers.length) {
      this.off?.();
      this.off = null;
      this.overlay.dispose();
      this.overlay = null;
      this.arena?.setWeather(null, 0);
    }
  }
}
