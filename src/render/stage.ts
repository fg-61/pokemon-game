import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ease, GameClock } from './clock';

/** Final screen-space pass: flash, vignette, chromatic aberration, grading, radial shock blur. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    flashColor: { value: new THREE.Color(1, 1, 1) },
    flash: { value: 0 },
    vignette: { value: 0.35 },
    chroma: { value: 0 },
    saturation: { value: 1.08 },
    tint: { value: new THREE.Color(1, 1, 1) },
    tintAmt: { value: 0 },
    shock: { value: 0 },
    shockCenter: { value: new THREE.Vector2(0.5, 0.5) },
    time: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 flashColor; uniform float flash; uniform float vignette; uniform float chroma;
    uniform float saturation; uniform vec3 tint; uniform float tintAmt; uniform float shock; uniform vec2 shockCenter; uniform float time;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main() {
      vec2 uv = vUv;
      vec2 d = uv - shockCenter;
      // radial "impact" zoom blur
      vec3 col = vec3(0.0);
      if (shock > 0.001) {
        for (int i = 0; i < 6; i++) {
          float s = 1.0 - shock * 0.06 * float(i) / 5.0;
          col += texture2D(tDiffuse, shockCenter + d * s).rgb;
        }
        col /= 6.0;
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }
      if (chroma > 0.0005) {
        vec2 off = d * chroma;
        col.r = mix(col.r, texture2D(tDiffuse, uv + off).r, 0.85);
        col.b = mix(col.b, texture2D(tDiffuse, uv - off).b, 0.85);
      }
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, saturation);
      col = mix(col, col * tint, tintAmt);
      float v = smoothstep(0.85, 0.2, length(d * vec2(1.0, 0.8)));
      col *= mix(1.0, v, vignette);
      col += flashColor * flash;
      col += (hash(uv * 800.0 + time) - 0.5) * 0.018;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export interface Shot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov?: number;
}

/** Smoothly blends the camera between shots, adds idle sway and shake. */
export class CameraDirector {
  readonly camera: THREE.PerspectiveCamera;
  private curPos = new THREE.Vector3();
  private curLook = new THREE.Vector3();
  private fromPos = new THREE.Vector3();
  private fromLook = new THREE.Vector3();
  private toPos = new THREE.Vector3();
  private toLook = new THREE.Vector3();
  private fromFov = 45;
  private toFov = 45;
  private t = 1;
  private dur = 1;
  private easeFn = ease.inOutCubic;
  private shakeAmp = 0;
  private shakeDecay = 0;
  sway = 1;
  orbit = 0; // radians/sec orbit around look target (title screen / evolution)
  private orbitAngle = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  cut(shot: Shot) {
    this.curPos.copy(shot.pos);
    this.curLook.copy(shot.look);
    this.toPos.copy(shot.pos);
    this.toLook.copy(shot.look);
    this.toFov = this.fromFov = shot.fov ?? 45;
    this.camera.fov = this.toFov;
    this.camera.updateProjectionMatrix();
    this.t = 1;
    this.orbitAngle = 0;
  }

  move(shot: Shot, seconds: number, e = ease.inOutCubic) {
    this.fromPos.copy(this.curPos);
    this.fromLook.copy(this.curLook);
    this.fromFov = this.camera.fov;
    this.toPos.copy(shot.pos);
    this.toLook.copy(shot.look);
    this.toFov = shot.fov ?? 45;
    this.t = 0;
    this.dur = Math.max(0.001, seconds);
    this.easeFn = e;
    this.orbitAngle = 0;
  }

  shake(amp: number, seconds = 0.4) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeDecay = amp / seconds;
  }

  update(dt: number, time: number) {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + dt / this.dur);
      const k = this.easeFn(this.t);
      this.curPos.lerpVectors(this.fromPos, this.toPos, k);
      this.curLook.lerpVectors(this.fromLook, this.toLook, k);
      this.camera.fov = THREE.MathUtils.lerp(this.fromFov, this.toFov, k);
      this.camera.updateProjectionMatrix();
    }
    const pos = this.curPos.clone();
    if (this.orbit !== 0) {
      this.orbitAngle += this.orbit * dt;
      const rel = pos.clone().sub(this.curLook);
      rel.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.orbitAngle);
      pos.copy(this.curLook).add(rel);
    }
    // gentle handheld sway
    pos.x += Math.sin(time * 0.37) * 0.12 * this.sway;
    pos.y += Math.sin(time * 0.51 + 1.3) * 0.07 * this.sway;
    pos.z += Math.cos(time * 0.29) * 0.1 * this.sway;
    const look = this.curLook.clone();
    if (this.shakeAmp > 0) {
      const a = this.shakeAmp;
      pos.x += (Math.random() - 0.5) * a;
      pos.y += (Math.random() - 0.5) * a;
      look.x += (Math.random() - 0.5) * a * 0.5;
      look.y += (Math.random() - 0.5) * a * 0.5;
      this.shakeAmp = Math.max(0, this.shakeAmp - this.shakeDecay * dt);
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
  }
}

export type Updater = (dt: number, time: number) => void;

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly director: CameraDirector;
  readonly clock = new GameClock();
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  private updaters = new Set<Updater>();
  private last = performance.now();
  private flashState = { v: 0, decay: 0 };
  private chromaState = { v: 0, decay: 0 };
  private shockState = { v: 0, decay: 0 };
  fps = 60;
  /** When set, every rendered frame advances the game clock by exactly this many seconds (deterministic captures). */
  fixedDt: number | null = null;

  constructor(container: HTMLElement) {
    const q = new URLSearchParams(location.search);
    if (q.get('fixed')) this.fixedDt = 1 / Number(q.get('fixed') === '1' ? 30 : q.get('fixed'));
    (window as unknown as { __stage: Stage }).__stage = this;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    // Neutral keeps sprite colors faithful (ACES desaturated/paled the pixel art)
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 600);
    this.director = new CameraDirector(this.camera);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.75, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
      this.camera.aspect = w / h;
      // keep the arena framed on portrait screens
      this.camera.zoom = w / h < 1 ? Math.max(0.55, w / h) : 1;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    onResize();

    const loop = () => {
      const now = performance.now();
      const realDt = this.fixedDt ?? Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.fps = this.fps * 0.95 + (1 / Math.max(0.001, realDt)) * 0.05;
      const dt = this.clock.advance(realDt);
      this.frame(dt, realDt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  onUpdate(fn: Updater): () => void {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  private frame(dt: number, realDt: number) {
    const t = this.clock.time;
    for (const u of this.updaters) u(dt, t);
    this.director.update(dt, t);
    const g = this.grade.uniforms;
    this.flashState.v = Math.max(0, this.flashState.v - this.flashState.decay * realDt);
    this.chromaState.v = Math.max(0, this.chromaState.v - this.chromaState.decay * realDt);
    this.shockState.v = Math.max(0, this.shockState.v - this.shockState.decay * realDt);
    g.flash.value = this.flashState.v;
    g.chroma.value = this.chromaState.v;
    g.shock.value = this.shockState.v;
    g.time.value = t;
    this.composer.render(realDt);
  }

  wait(ms: number) {
    return this.clock.wait(ms);
  }

  tween(ms: number, fn: (t: number) => void, e = ease.inOutQuad) {
    return this.clock.tween(ms, fn, e);
  }

  /** Full-screen additive flash. */
  flash(color: THREE.ColorRepresentation = 0xffffff, intensity = 0.6, ms = 250) {
    (this.grade.uniforms.flashColor.value as THREE.Color).set(color);
    this.flashState.v = Math.max(this.flashState.v, intensity);
    this.flashState.decay = intensity / (ms / 1000);
  }

  chromaPulse(amount = 0.02, ms = 300) {
    this.chromaState.v = Math.max(this.chromaState.v, amount);
    this.chromaState.decay = amount / (ms / 1000);
  }

  /** Radial zoom-blur pulse centered on a world position. */
  shockwave(world: THREE.Vector3, amount = 1, ms = 350) {
    const p = world.clone().project(this.camera);
    (this.grade.uniforms.shockCenter.value as THREE.Vector2).set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    this.shockState.v = Math.max(this.shockState.v, amount);
    this.shockState.decay = amount / (ms / 1000);
  }

  /** Tint the whole screen (e.g. Psychic purple, Ghost darkness). amt 0..1 */
  setTint(color: THREE.ColorRepresentation, amt: number, ms = 300) {
    const u = this.grade.uniforms;
    const from = u.tintAmt.value as number;
    if (amt > 0) (u.tint.value as THREE.Color).set(color);
    return this.tween(ms, (k) => (u.tintAmt.value = THREE.MathUtils.lerp(from, amt, k)));
  }

  setSaturation(s: number, ms = 400) {
    const u = this.grade.uniforms;
    const from = u.saturation.value as number;
    return this.tween(ms, (k) => (u.saturation.value = THREE.MathUtils.lerp(from, s, k)));
  }

  /** World position -> CSS pixel position in the container. */
  toScreen(world: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const p = world.clone().project(this.camera);
    const el = this.renderer.domElement;
    return { x: (p.x * 0.5 + 0.5) * el.clientWidth, y: (-p.y * 0.5 + 0.5) * el.clientHeight, visible: p.z < 1 };
  }
}
