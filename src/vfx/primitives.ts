import * as THREE from 'three';
import { ease, type Ease } from '../render/clock';
import type { Stage } from '../render/stage';

/**
 * Mesh-based effect primitives. Each returns a handle with `done` (Promise resolved when the effect
 * finished and was removed). All colors may be pushed above 1 via `intensity` to bloom.
 */

const QUAD_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

const BEAM_FS = /* glsl */ `
  uniform vec3 color; uniform vec3 core; uniform float time; uniform float alpha; uniform float noiseAmt;
  varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  void main() {
    // vUv.x around the cylinder, vUv.y along the beam
    float edge = abs(vUv.x - 0.5) * 2.0; // 0 in front center, 1 at the silhouette (approx.)
    float n = noise(vec2(vUv.x * 8.0, vUv.y * 10.0 - time * 14.0));
    float body = smoothstep(1.0, 0.0, edge);
    vec3 c = mix(color, core, pow(body, 3.0));
    float a = alpha * (0.55 + 0.45 * body) * mix(1.0, n, noiseAmt);
    a *= smoothstep(0.0, 0.04, vUv.y);
    gl_FragColor = vec4(c, a);
  }
`;

const RING_FS = /* glsl */ `
  uniform vec3 color; uniform float alpha; uniform float thickness; uniform float progress;
  varying vec2 vUv;
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    float w = thickness * (1.0 - progress * 0.6);
    float a = smoothstep(1.0, 1.0 - w * 0.3, r) * smoothstep(1.0 - w, 1.0 - w * 0.4, r);
    a += smoothstep(1.0, 0.0, r) * 0.12 * (1.0 - progress);
    gl_FragColor = vec4(color, a * alpha);
  }
`;

const SLASH_FS = /* glsl */ `
  uniform vec3 color; uniform vec3 core; uniform float alpha; uniform float reveal;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float ang = atan(p.y, p.x); // -pi..pi
    float t = (ang + 3.14159) / 6.28318; // 0..1
    // crescent: thick in the middle of the arc, thin at the ends
    float span = smoothstep(0.15, 0.35, t) * smoothstep(0.85, 0.65, t);
    float band = smoothstep(0.62, 0.85, r) * smoothstep(1.0, 0.9, r);
    float mask = step(t, reveal) * smoothstep(reveal - 0.35, reveal, t) + step(t, reveal - 0.35) * 0.55;
    float a = band * span * mask * alpha;
    vec3 c = mix(color, core, smoothstep(0.75, 0.93, r));
    gl_FragColor = vec4(c, a);
  }
`;

const SHIELD_FS = /* glsl */ `
  uniform vec3 color; uniform float alpha; uniform float time;
  varying vec3 vN; varying vec3 vV; varying vec2 vUv2;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
    vec2 h = vUv2 * vec2(24.0, 12.0);
    vec2 g = abs(fract(h) - 0.5);
    float hex = smoothstep(0.42, 0.5, max(g.x, g.y));
    float sweep = smoothstep(0.1, 0.0, abs(fract(vUv2.y - time * 0.6) - 0.5) - 0.4);
    float a = (f * 0.9 + hex * 0.25 + sweep * 0.2) * alpha;
    gl_FragColor = vec4(color, a);
  }
`;
const SHIELD_VS = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying vec2 vUv2;
  void main(){ vUv2 = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }
`;

function hdr(c: THREE.ColorRepresentation, k: number) {
  return new THREE.Color(c).multiplyScalar(k);
}

export class Primitives {
  readonly group = new THREE.Group();
  constructor(private stage: Stage) {
    stage.scene.add(this.group);
  }

  private add<T extends THREE.Object3D>(o: T): T {
    this.group.add(o);
    return o;
  }
  private remove(o: THREE.Object3D) {
    this.group.remove(o);
    o.traverse((x) => {
      const m = x as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
  }

  /**
   * Energy beam from -> to. Grows over `growMs`, holds `holdMs`, fades `fadeMs`.
   */
  beam(
    from: THREE.Vector3,
    to: THREE.Vector3,
    o: { color: THREE.ColorRepresentation; core?: THREE.ColorRepresentation; width?: number; intensity?: number; growMs?: number; holdMs?: number; fadeMs?: number; noise?: number; wobble?: number },
  ) {
    const width = o.width ?? 0.35;
    const len = from.distanceTo(to);
    const geo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
    geo.translate(0, 0.5, 0);
    geo.rotateX(Math.PI / 2); // along +z
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: hdr(o.color, o.intensity ?? 2.2) },
        core: { value: hdr(o.core ?? 0xffffff, (o.intensity ?? 2.2) * 1.4) },
        time: { value: 0 },
        alpha: { value: 1 },
        noiseAmt: { value: o.noise ?? 0.45 },
      },
      vertexShader: QUAD_VS,
      fragmentShader: BEAM_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = this.add(new THREE.Mesh(geo, mat));
    mesh.position.copy(from);
    mesh.lookAt(to);
    const glowMat = mat.clone();
    glowMat.uniforms.alpha.value = 0.35;
    const glow = new THREE.Mesh(geo, glowMat);
    mesh.add(glow);
    const growMs = o.growMs ?? 180;
    const holdMs = o.holdMs ?? 500;
    const fadeMs = o.fadeMs ?? 250;
    let fadeScale = 1;
    const off = this.stage.onUpdate((_dt, t) => {
      mat.uniforms.time.value = t;
      glowMat.uniforms.time.value = t;
      const wob = 1 + Math.sin(t * 40) * (o.wobble ?? 0.08);
      mesh.scale.x = mesh.scale.y = width * wob * fadeScale;
      glow.scale.set(2.2, 2.2, 1);
    });
    const done = (async () => {
      await this.stage.tween(growMs, (k) => (mesh.scale.z = len * k), ease.outCubic);
      await this.stage.wait(holdMs);
      await this.stage.tween(fadeMs, (k) => {
        fadeScale = 1 - k;
        mat.uniforms.alpha.value = 1 - k;
        glowMat.uniforms.alpha.value = 0.35 * (1 - k);
      });
      off();
      glowMat.dispose();
      this.remove(mesh);
    })();
    return { mesh, done, arrived: this.stage.wait(growMs) };
  }

  /** Expanding ring. `facing`: 'ground' lies flat, 'camera' faces the camera, or a normal vector. */
  shockwave(
    pos: THREE.Vector3,
    o: { color: THREE.ColorRepresentation; radius?: number; ms?: number; thickness?: number; intensity?: number; facing?: 'ground' | 'camera' | THREE.Vector3; startRadius?: number },
  ) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: hdr(o.color, o.intensity ?? 2) }, alpha: { value: 1 }, thickness: { value: o.thickness ?? 0.35 }, progress: { value: 0 } },
      vertexShader: QUAD_VS,
      fragmentShader: RING_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = this.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    mesh.position.copy(pos);
    const facing = o.facing ?? 'camera';
    if (facing === 'ground') mesh.rotation.x = -Math.PI / 2;
    else if (facing === 'camera') mesh.quaternion.copy(this.stage.camera.quaternion);
    else mesh.lookAt(pos.clone().add(facing));
    const R = o.radius ?? 2;
    const r0 = o.startRadius ?? 0.1;
    const done = this.stage
      .tween(o.ms ?? 450, (k) => {
        const r = r0 + (R - r0) * k;
        mesh.scale.set(r, r, r);
        mat.uniforms.progress.value = k;
        mat.uniforms.alpha.value = 1 - k * k;
      }, ease.outCubic)
      .then(() => this.remove(mesh));
    return { mesh, done };
  }

  /** Crescent slash arc facing the camera. angle = rotation in radians. */
  slash(pos: THREE.Vector3, o: { color: THREE.ColorRepresentation; core?: THREE.ColorRepresentation; size?: number; angle?: number; ms?: number; intensity?: number }) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: hdr(o.color, o.intensity ?? 2) },
        core: { value: hdr(o.core ?? 0xffffff, (o.intensity ?? 2) * 1.3) },
        alpha: { value: 1 },
        reveal: { value: 0 },
      },
      vertexShader: QUAD_VS,
      fragmentShader: SLASH_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const s = o.size ?? 1.6;
    const mesh = this.add(new THREE.Mesh(new THREE.PlaneGeometry(2 * s, 2 * s), mat));
    mesh.position.copy(pos);
    mesh.quaternion.copy(this.stage.camera.quaternion);
    mesh.rotateZ(o.angle ?? 0);
    const ms = o.ms ?? 320;
    const done = (async () => {
      await this.stage.tween(ms * 0.45, (k) => (mat.uniforms.reveal.value = k * 1.35), ease.outQuad);
      await this.stage.tween(ms * 0.55, (k) => (mat.uniforms.alpha.value = 1 - k));
      this.remove(mesh);
    })();
    return { mesh, done };
  }

  /** Jagged lightning bolt between two points; re-rolls its shape every few frames. */
  lightning(from: THREE.Vector3, to: THREE.Vector3, o: { color: THREE.ColorRepresentation; width?: number; ms?: number; segments?: number; jitter?: number; intensity?: number; branches?: number }) {
    const segs = o.segments ?? 14;
    const width = o.width ?? 0.12;
    const jitter = o.jitter ?? 0.45;
    const verts = new Float32Array((segs + 1) * 2 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    const idx: number[] = [];
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ color: hdr(o.color, o.intensity ?? 3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = this.add(new THREE.Mesh(geo, mat));
    mesh.frustumCulled = false;
    const coreMat = new THREE.MeshBasicMaterial({ color: hdr(0xffffff, 3.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const core = new THREE.Mesh(geo, coreMat);
    core.scale.setScalar(1);
    core.frustumCulled = false;
    const dir = to.clone().sub(from);
    const pts: THREE.Vector3[] = [];
    const reroll = () => {
      pts.length = 0;
      const perpA = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0.3)).normalize();
      const perpB = new THREE.Vector3().crossVectors(dir, perpA).normalize();
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const p = from.clone().addScaledVector(dir, t);
        const env = Math.sin(t * Math.PI);
        p.addScaledVector(perpA, (Math.random() - 0.5) * jitter * env * 2);
        p.addScaledVector(perpB, (Math.random() - 0.5) * jitter * env * 2);
        pts.push(p);
      }
      const cam = this.stage.camera.position;
      for (let i = 0; i <= segs; i++) {
        const p = pts[i];
        const nxt = pts[Math.min(segs, i + 1)];
        const prv = pts[Math.max(0, i - 1)];
        const tangent = nxt.clone().sub(prv).normalize();
        const toCam = cam.clone().sub(p).normalize();
        const side = new THREE.Vector3().crossVectors(tangent, toCam).normalize().multiplyScalar(width * (0.6 + Math.random() * 0.6));
        verts.set([p.x + side.x, p.y + side.y, p.z + side.z, p.x - side.x, p.y - side.y, p.z - side.z], i * 6);
      }
      geo.getAttribute('position').needsUpdate = true;
      geo.computeBoundingSphere();
    };
    reroll();
    let frame = 0;
    const off = this.stage.onUpdate(() => {
      if (++frame % 3 === 0) reroll();
    });
    const ms = o.ms ?? 380;
    const done = (async () => {
      await this.stage.wait(ms * 0.7);
      await this.stage.tween(ms * 0.3, (k) => {
        mat.opacity = 1 - k;
        coreMat.opacity = 1 - k;
      });
      off();
      coreMat.dispose();
      this.remove(mesh);
    })();
    return { mesh, done, points: pts };
  }

  /** Glowing orb that travels along an arc; returns when it arrives. */
  orb(o: { color: THREE.ColorRepresentation; radius?: number; intensity?: number; core?: THREE.ColorRepresentation }) {
    const r = o.radius ?? 0.3;
    const coreM = new THREE.MeshBasicMaterial({ color: hdr(o.core ?? 0xffffff, (o.intensity ?? 2) * 1.2) });
    const mesh = this.add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 16, 12), coreM));
    const shellM = new THREE.MeshBasicMaterial({ color: hdr(o.color, o.intensity ?? 2), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), shellM);
    mesh.add(shell);
    const off = this.stage.onUpdate((_dt, t) => {
      const s = 1 + Math.sin(t * 30) * 0.08;
      shell.scale.setScalar(s);
    });
    return {
      mesh,
      /** Fly along a quadratic arc. */
      fly: (from: THREE.Vector3, to: THREE.Vector3, ms: number, arc = 0.8, e: Ease = ease.inQuad, onStep?: (p: THREE.Vector3) => void) => {
        const mid = from.clone().lerp(to, 0.5);
        mid.y += arc;
        const p = new THREE.Vector3();
        return this.stage.tween(ms, (k) => {
          const a = from.clone().lerp(mid, k);
          const b = mid.clone().lerp(to, k);
          p.copy(a.lerp(b, k));
          mesh.position.copy(p);
          onStep?.(p);
        }, e);
      },
      grow: (ms: number, to = 1) => this.stage.tween(ms, (k) => mesh.scale.setScalar(0.01 + k * to), ease.outBack),
      dispose: () => {
        off();
        shellM.dispose();
        this.remove(mesh);
      },
    };
  }

  /** Vertical light pillar (evolution, Psychic, heal). */
  pillar(pos: THREE.Vector3, o: { color: THREE.ColorRepresentation; radius?: number; height?: number; ms?: number; intensity?: number }) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: hdr(o.color, o.intensity ?? 2) },
        core: { value: hdr(0xffffff, (o.intensity ?? 2) * 1.2) },
        time: { value: 0 },
        alpha: { value: 0 },
        noiseAmt: { value: 0.6 },
      },
      vertexShader: QUAD_VS,
      fragmentShader: BEAM_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = this.add(new THREE.Mesh(geo, mat));
    mesh.position.copy(pos);
    const R = o.radius ?? 1;
    const H = o.height ?? 6;
    mesh.scale.set(R, H, R);
    const off = this.stage.onUpdate((_dt, t) => (mat.uniforms.time.value = t * 0.4));
    const ms = o.ms ?? 1200;
    const done = (async () => {
      await this.stage.tween(ms * 0.2, (k) => {
        mat.uniforms.alpha.value = k;
        mesh.scale.set(R * (0.2 + 0.8 * k), H, R * (0.2 + 0.8 * k));
      }, ease.outCubic);
      await this.stage.wait(ms * 0.5);
      await this.stage.tween(ms * 0.3, (k) => {
        mat.uniforms.alpha.value = 1 - k;
        mesh.scale.set(R * (1 - 0.7 * k), H, R * (1 - 0.7 * k));
      });
      off();
      this.remove(mesh);
    })();
    return { mesh, done };
  }

  /** Hex-patterned bubble shield around a point (Protect, Reflect, Light Screen). */
  shield(pos: THREE.Vector3, o: { color: THREE.ColorRepresentation; radius?: number; ms?: number; intensity?: number }) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: hdr(o.color, o.intensity ?? 1.8) }, alpha: { value: 0 }, time: { value: 0 } },
      vertexShader: SHIELD_VS,
      fragmentShader: SHIELD_FS,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = this.add(new THREE.Mesh(new THREE.SphereGeometry(o.radius ?? 1.6, 40, 24), mat));
    mesh.position.copy(pos);
    const off = this.stage.onUpdate((_dt, t) => (mat.uniforms.time.value = t));
    const ms = o.ms ?? 1100;
    const done = (async () => {
      await this.stage.tween(ms * 0.25, (k) => {
        mat.uniforms.alpha.value = k;
        mesh.scale.setScalar(0.6 + 0.4 * k);
      }, ease.outBack);
      await this.stage.wait(ms * 0.45);
      await this.stage.tween(ms * 0.3, (k) => (mat.uniforms.alpha.value = 1 - k));
      off();
      this.remove(mesh);
    })();
    return { mesh, done };
  }

  /** Solid meshes thrown with gravity (rocks, ice chunks). */
  debris(o: {
    from: THREE.Vector3;
    count: number;
    color: THREE.ColorRepresentation;
    size?: number;
    speed?: number;
    up?: number;
    ms?: number;
    emissive?: number;
    geometry?: 'rock' | 'crystal';
  }) {
    const meshes: { m: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3 }[] = [];
    const baseGeo = o.geometry === 'crystal' ? new THREE.OctahedronGeometry(1, 0) : new THREE.DodecahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({ color: o.color, flatShading: true, roughness: 0.8, emissive: new THREE.Color(o.color), emissiveIntensity: o.emissive ?? 0 });
    for (let i = 0; i < o.count; i++) {
      const m = new THREE.Mesh(baseGeo, mat);
      const s = (o.size ?? 0.18) * (0.5 + Math.random());
      m.scale.set(s, s * (o.geometry === 'crystal' ? 2 : 0.8 + Math.random() * 0.5), s);
      m.position.copy(o.from);
      m.castShadow = true;
      this.add(m);
      const a = Math.random() * Math.PI * 2;
      const sp = (o.speed ?? 3) * (0.4 + Math.random() * 0.8);
      meshes.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, (o.up ?? 4) * (0.5 + Math.random() * 0.7), Math.sin(a) * sp), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8) });
    }
    const off = this.stage.onUpdate((dt) => {
      for (const d of meshes) {
        d.v.y -= 12 * dt;
        d.m.position.addScaledVector(d.v, dt);
        if (d.m.position.y < 0.05) {
          d.m.position.y = 0.05;
          d.v.multiplyScalar(0.4);
          d.v.y = Math.abs(d.v.y) * 0.3;
        }
        d.m.rotation.x += d.spin.x * dt;
        d.m.rotation.y += d.spin.y * dt;
      }
    });
    const ms = o.ms ?? 1200;
    const done = (async () => {
      await this.stage.wait(ms * 0.7);
      await this.stage.tween(ms * 0.3, (k) => meshes.forEach((d) => d.m.scale.multiplyScalar(1 - k * 0.2)));
      off();
      meshes.forEach((d) => this.group.remove(d.m));
      baseGeo.dispose();
      mat.dispose();
    })();
    return { done };
  }

  /** A single solid mesh falling from above onto a point (Rock Slide boulders, etc.). */
  async dropRock(target: THREE.Vector3, o: { color: THREE.ColorRepresentation; size?: number; height?: number; ms?: number }) {
    const geo = new THREE.DodecahedronGeometry(o.size ?? 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: o.color, flatShading: true, roughness: 0.9 });
    const m = this.add(new THREE.Mesh(geo, mat));
    m.castShadow = true;
    const start = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, o.height ?? 6, (Math.random() - 0.5) * 0.8));
    await this.stage.tween(o.ms ?? 380, (k) => {
      m.position.lerpVectors(start, target, k);
      m.rotation.x += 0.2;
      m.rotation.z += 0.13;
    }, ease.inQuad);
    this.stage.wait(250).then(() => this.remove(m));
    return m;
  }

  // ------------------------------------------------------------------ fire/water/grass/psychic kit (additive)

  /** Noisy fireball / explosion sphere (normal-blended body, bright core). Also used for water & goo splashes. */
  blast(
    pos: THREE.Vector3,
    o: { core: THREE.ColorRepresentation; main: THREE.ColorRepresentation; dark: THREE.ColorRepresentation; radius?: number; ms?: number; scaleY?: number; intensity?: number; rise?: number; disp?: number },
  ) {
    const NOISE = /* glsl */ `
      float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n3(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }
    `;
    const k = o.intensity ?? 1.6;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        core: { value: hdr(o.core, k * 1.6) },
        mainC: { value: hdr(o.main, k) },
        dark: { value: hdr(o.dark, 0.9) },
        heat: { value: 1 },
        erode: { value: 0 },
        alpha: { value: 1 },
        time: { value: 0 },
        disp: { value: o.disp ?? 0.55 },
        seed: { value: Math.random() * 50 },
      },
      vertexShader: /* glsl */ `
        uniform float time; uniform float disp; uniform float seed;
        varying vec3 vObj; varying vec3 vN; varying vec3 vV;
        ${NOISE}
        void main(){
          vObj = position;
          float n = fbm3(normalize(position) * 2.2 + vec3(seed, -time * 1.3, seed));
          vec3 p = position * (1.0 + (n - 0.5) * disp);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 core; uniform vec3 mainC; uniform vec3 dark; uniform float heat; uniform float erode; uniform float alpha; uniform float time; uniform float seed;
        varying vec3 vObj; varying vec3 vN; varying vec3 vV;
        ${NOISE}
        void main(){
          float n = fbm3(vObj * 2.6 + vec3(seed, -time * 2.2, 0.0));
          if (n < erode) discard;
          float facing = abs(dot(normalize(vN), normalize(vV)));
          float t = n * 0.95 + facing * 0.55 - (1.0 - heat) * 0.85;
          vec3 c = mix(dark, mainC, smoothstep(0.2, 0.6, t));
          c = mix(c, core, smoothstep(0.72, 1.05, t));
          float a = alpha * smoothstep(0.0, 0.12, n - erode) * (0.45 + 0.55 * facing);
          gl_FragColor = vec4(c, a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    const mesh = this.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat));
    mesh.renderOrder = 4;
    mesh.position.copy(pos);
    const R = o.radius ?? 2;
    const sy = o.scaleY ?? 1;
    const ms = o.ms ?? 1200;
    const off = this.stage.onUpdate((_dt, t) => (mat.uniforms.time.value = t));
    const done = (async () => {
      await this.stage.tween(ms, (k2) => {
        const g = ease.outExpo(Math.min(1, k2 / 0.5)) * 0.88 + k2 * 0.12;
        const r = R * (0.12 + 0.88 * g);
        mesh.scale.set(r, r * sy, r);
        mesh.position.y = pos.y + (o.rise ?? 0.6) * k2;
        mat.uniforms.heat.value = 1 - k2;
        mat.uniforms.erode.value = Math.max(0, (k2 - 0.4) / 0.6) * 0.85;
      }, ease.linear);
      off();
      this.remove(mesh);
    })();
    return { mesh, done };
  }

  /** Growing tube (vine / root / tentacle) along a curve through `points`. Solid, lit with a fake light. */
  tendril(
    points: THREE.Vector3[],
    o: { color: THREE.ColorRepresentation; dark?: THREE.ColorRepresentation; tip?: THREE.ColorRepresentation; radius?: number; growMs?: number; holdMs?: number; fadeMs?: number; retract?: boolean; twist?: number },
  ) {
    const curve = new THREE.CatmullRomCurve3(points);
    const segs = 56;
    const rad = 10;
    const frames = curve.computeFrenetFrames(segs, false);
    const pos: number[] = [];
    const off: number[] = [];
    const tt: number[] = [];
    const uu: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const c = curve.getPointAt(t);
      const N = frames.normals[i];
      const B = frames.binormals[i];
      for (let j = 0; j <= rad; j++) {
        const a = (j / rad) * Math.PI * 2;
        const d = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a));
        pos.push(c.x, c.y, c.z);
        off.push(d.x, d.y, d.z);
        tt.push(t);
        uu.push(j / rad);
      }
    }
    for (let i = 0; i < segs; i++)
      for (let j = 0; j < rad; j++) {
        const a = i * (rad + 1) + j;
        const b = a + rad + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aOff', new THREE.Float32BufferAttribute(off, 3));
    geo.setAttribute('aT', new THREE.Float32BufferAttribute(tt, 1));
    geo.setAttribute('aU', new THREE.Float32BufferAttribute(uu, 1));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(o.color) },
        dark: { value: new THREE.Color(o.dark ?? new THREE.Color(o.color).multiplyScalar(0.3)) },
        tip: { value: new THREE.Color(o.tip ?? o.color) },
        reveal: { value: 0 },
        radius: { value: o.radius ?? 0.2 },
        wither: { value: 0 },
        twist: { value: o.twist ?? 3 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aOff; attribute float aT; attribute float aU;
        uniform float reveal; uniform float radius; uniform float wither;
        varying vec3 vN; varying float vT; varying float vU; varying vec3 vW;
        void main(){
          float taper = mix(1.0, 0.12, pow(aT, 0.8));
          float grow = clamp((reveal - aT) / 0.14, 0.0, 1.0);
          float bump = 1.0 + 0.1 * sin(aT * 41.0 + aU * 12.566);
          float r = radius * taper * sqrt(grow) * bump * (1.0 - wither);
          vec3 p = position + aOff * r;
          vN = normalize(mat3(modelMatrix) * aOff); vT = aT; vU = aU;
          vec4 wp = modelMatrix * vec4(p, 1.0); vW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color; uniform vec3 dark; uniform vec3 tip; uniform float twist;
        varying vec3 vN; varying float vT; varying float vU; varying vec3 vW;
        void main(){
          vec3 n = normalize(vN);
          float d = max(dot(n, normalize(vec3(-0.4, 1.0, 0.55))), 0.0);
          float stripe = 0.5 + 0.5 * sin(vU * 6.2832 * 3.0 + vT * 6.2832 * twist * 3.0);
          vec3 base = mix(dark, color, 0.3 + 0.7 * d);
          base *= 0.78 + 0.3 * stripe;
          base = mix(base, tip, smoothstep(0.55, 1.0, vT) * 0.7);
          float rim = pow(1.0 - abs(dot(n, normalize(cameraPosition - vW))), 3.0);
          base += tip * rim * 0.6;
          gl_FragColor = vec4(base, 1.0);
        }`,
    });
    const mesh = this.add(new THREE.Mesh(geo, mat));
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    const growMs = o.growMs ?? 350;
    const grown = this.stage.tween(growMs, (k) => (mat.uniforms.reveal.value = k * 1.15), ease.outCubic);
    const done = (async () => {
      await grown;
      await this.stage.wait(o.holdMs ?? 500);
      await this.stage.tween(o.fadeMs ?? 300, (k) => {
        if (o.retract) mat.uniforms.reveal.value = 1.15 * (1 - k);
        else mat.uniforms.wither.value = k;
      }, ease.inQuad);
      this.remove(mesh);
    })();
    return { mesh, grown, done, curve };
  }

  /**
   * Water wall (Surf). Local +z faces the travel direction; the recipe positions it and drives
   * `u.height`, `u.curl`, `u.alpha`. Call dispose() when finished.
   */
  wave(o: { color: THREE.ColorRepresentation; core?: THREE.ColorRepresentation; dark?: THREE.ColorRepresentation; width?: number }) {
    const geo = new THREE.PlaneGeometry(1, 1, 60, 24);
    geo.translate(0, 0.5, 0);
    const u = {
      color: { value: hdr(o.color, 1.1) },
      core: { value: hdr(o.core ?? 0xffffff, 1.5) },
      dark: { value: hdr(o.dark ?? 0x0a3a8a, 1) },
      width: { value: o.width ?? 7 },
      height: { value: 0 },
      curl: { value: 0.4 },
      alpha: { value: 1 },
      time: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: /* glsl */ `
        uniform float width; uniform float height; uniform float curl; uniform float time;
        varying vec2 vUv; varying float vH;
        void main(){
          vUv = uv;
          float y = position.y;
          float ax = abs(position.x) * 2.0;
          float h = height * (0.85 + 0.15 * sin(position.x * width * 1.1 + time * 4.0)) * (1.0 - pow(ax, 2.5) * 0.75);
          vec3 p;
          p.x = position.x * width;
          p.y = h * sin(y * 1.5708) * (1.0 - 0.18 * curl * y * y);
          p.z = h * (curl * pow(y, 2.2) - (1.0 - y) * 0.45);
          vH = h;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color; uniform vec3 core; uniform vec3 dark; uniform float alpha; uniform float time;
        varying vec2 vUv; varying float vH;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
        void main(){
          float n = noise(vec2(vUv.x * 22.0, vUv.y * 5.0 - time * 3.5));
          float n2 = noise(vec2(vUv.x * 40.0 + time, vUv.y * 9.0 - time * 5.0));
          vec3 c = mix(dark, color, smoothstep(0.0, 0.75, vUv.y));
          c += core * 0.35 * smoothstep(0.62, 0.9, n) * smoothstep(0.2, 0.8, vUv.y);
          float foam = smoothstep(0.72, 0.9, vUv.y + (n2 - 0.5) * 0.18);
          c = mix(c, core, foam);
          float a = alpha * (0.72 + 0.28 * vUv.y);
          a *= smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
          a *= smoothstep(1.0, 0.92, vUv.y + (n2 - 0.5) * 0.14);
          a *= smoothstep(0.0, 0.25, vH);
          gl_FragColor = vec4(c, a);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = this.add(new THREE.Mesh(geo, mat));
    mesh.renderOrder = 3;
    mesh.frustumCulled = false;
    const off = this.stage.onUpdate((_dt, t) => (u.time.value = t));
    return {
      mesh,
      u,
      /** point on the crest line at x in [-0.5, 0.5] (world) */
      crest: (x: number) => {
        const h = u.height.value;
        return mesh.localToWorld(new THREE.Vector3(x * u.width.value, h * (1 - 0.18 * u.curl.value), h * u.curl.value));
      },
      dispose: () => {
        off();
        this.remove(mesh);
      },
    };
  }

  /** Flat glassy hex-grid panel (Reflect, Light Screen). `normal` = facing direction. */
  hexPanel(pos: THREE.Vector3, normal: THREE.Vector3, o: { color: THREE.ColorRepresentation; width?: number; height?: number; ms?: number; intensity?: number; cells?: number }) {
    const w = o.width ?? 2.6;
    const h = o.height ?? 2.6;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: hdr(o.color, o.intensity ?? 1.6) },
        alpha: { value: 1 },
        reveal: { value: 0 },
        time: { value: 0 },
        aspect: { value: new THREE.Vector2(w, h).multiplyScalar((o.cells ?? 7) / Math.max(w, h)) },
      },
      vertexShader: QUAD_VS,
      fragmentShader: /* glsl */ `
        uniform vec3 color; uniform float alpha; uniform float reveal; uniform float time; uniform vec2 aspect;
        varying vec2 vUv;
        float hd(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.73))), p.x); }
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec2 uv = (vUv - 0.5) * aspect;
          vec2 r = vec2(1.0, 1.73); vec2 hh = r * 0.5;
          vec2 a = mod(uv, r) - hh; vec2 b = mod(uv - hh, r) - hh;
          vec2 gv = dot(a, a) < dot(b, b) ? a : b;
          vec2 id = uv - gv;
          float e = 0.5 - hd(gv);
          float line = smoothstep(0.07, 0.0, e);
          float rnd = hash(id);
          float dist = length(id / aspect);
          float on = smoothstep(reveal, reveal - 0.15, dist + rnd * 0.1);
          vec2 q = abs(vUv - 0.5) * 2.0;
          float border = smoothstep(0.9, 1.0, max(q.x, q.y));
          float edgeFade = smoothstep(1.0, 0.97, max(q.x, q.y));
          float sweep = smoothstep(0.12, 0.0, abs(fract(vUv.x * 0.7 + vUv.y * 0.5 - time * 0.9) - 0.5));
          float fill = 0.10 + 0.08 * sin(time * 6.0 + rnd * 6.28);
          float v = (line * 0.8 + fill + sweep * 0.45) * on + border * 0.9 * step(0.02, reveal);
          gl_FragColor = vec4(color * (1.0 + sweep * 0.6), v * alpha * edgeFade);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = this.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat));
    mesh.position.copy(pos);
    mesh.lookAt(pos.clone().add(normal));
    const off = this.stage.onUpdate((_dt, t) => (mat.uniforms.time.value = t));
    const ms = o.ms ?? 1200;
    const done = (async () => {
      await this.stage.tween(ms * 0.3, (k) => (mat.uniforms.reveal.value = k * 1.3), ease.outCubic);
      await this.stage.wait(ms * 0.4);
      await this.stage.tween(ms * 0.3, (k) => (mat.uniforms.alpha.value = 1 - k));
      off();
      this.remove(mesh);
    })();
    return { mesh, done };
  }

  /** Cluster of ice crystals growing out of a point (Ice Beam / Ice Punch impacts). */
  crystals(pos: THREE.Vector3, o: { color: THREE.ColorRepresentation; count?: number; size?: number; ms?: number; spread?: number; dir?: THREE.Vector3; emissive?: number }) {
    const geo = new THREE.OctahedronGeometry(1, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: o.color,
      emissive: new THREE.Color(o.color),
      emissiveIntensity: o.emissive ?? 0.55,
      roughness: 0.15,
      metalness: 0.1,
      flatShading: true,
      transparent: true,
      opacity: 0.9,
    });
    const up = (o.dir ?? new THREE.Vector3(0, 1, 0)).clone().normalize();
    const items: { m: THREE.Mesh; s: THREE.Vector3; d: THREE.Vector3 }[] = [];
    const n = o.count ?? 7;
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).multiplyScalar(o.spread ?? 0.9).add(up).normalize();
      const len = (o.size ?? 0.5) * (0.55 + Math.random() * 0.8) * (i === 0 ? 1.4 : 1);
      const s = new THREE.Vector3(len * 0.28, len, len * 0.28);
      const m = new THREE.Mesh(geo, mat);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      m.position.copy(pos);
      m.scale.setScalar(0.001);
      m.castShadow = true;
      this.add(m);
      items.push({ m, s, d });
    }
    const ms = o.ms ?? 900;
    const grown = this.stage.tween(ms * 0.22, (k) => {
      for (const it of items) {
        it.m.scale.copy(it.s).multiplyScalar(Math.max(0.001, k));
        it.m.position.copy(pos).addScaledVector(it.d, it.s.y * 0.55 * k);
      }
    }, ease.outBack);
    const done = (async () => {
      await grown;
      await this.stage.wait(ms * 0.6);
      await this.stage.tween(ms * 0.18, (k) => items.forEach((it) => it.m.scale.copy(it.s).multiplyScalar(Math.max(0.001, 1 - k))), ease.inQuad);
      items.forEach((it) => this.group.remove(it.m));
      geo.dispose();
      mat.dispose();
    })();
    return { grown, done, tips: () => items.map((it) => it.m.position.clone().addScaledVector(it.d, it.s.y * 0.5)) };
  }

  /** Glossy wobbling goo / water blob that can fly along an arc (Sludge Bomb, Water Pulse). */
  blob(o: { color: THREE.ColorRepresentation; radius?: number; opacity?: number; emissive?: number; roughness?: number }) {
    const r = o.radius ?? 0.35;
    const mat = new THREE.MeshStandardMaterial({
      color: o.color,
      emissive: new THREE.Color(o.color),
      emissiveIntensity: o.emissive ?? 0.35,
      roughness: o.roughness ?? 0.2,
      metalness: 0.05,
      transparent: (o.opacity ?? 1) < 1,
      opacity: o.opacity ?? 1,
    });
    const mesh = this.add(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat));
    mesh.castShadow = true;
    let base = 1;
    const off = this.stage.onUpdate((_dt, t) => {
      mesh.scale.set(base * (1 + Math.sin(t * 17) * 0.12), base * (1 + Math.sin(t * 13 + 1.3) * 0.14), base * (1 + Math.sin(t * 19 + 2.1) * 0.1));
    });
    return {
      mesh,
      mat,
      fly: (from: THREE.Vector3, to: THREE.Vector3, ms: number, arc = 0.8, e: Ease = ease.inQuad, onStep?: (p: THREE.Vector3) => void) => {
        const mid = from.clone().lerp(to, 0.5);
        mid.y += arc;
        const p = new THREE.Vector3();
        return this.stage.tween(ms, (k) => {
          const a = from.clone().lerp(mid, k);
          const b = mid.clone().lerp(to, k);
          p.copy(a.lerp(b, k));
          mesh.position.copy(p);
          onStep?.(p);
        }, e);
      },
      grow: (ms: number, to = 1) => this.stage.tween(ms, (k) => (base = 0.01 + k * to), ease.outBack),
      dispose: () => {
        off();
        this.remove(mesh);
      },
    };
  }

  /** Fading silhouette copy of a sprite mesh (Agility / Double Team afterimages). */
  afterimage(src: THREE.Mesh, o: { color: THREE.ColorRepresentation; opacity?: number; ms?: number; drift?: THREE.Vector3 }) {
    const srcMat = src.material as THREE.ShaderMaterial;
    const mat = srcMat.clone();
    mat.uniforms.map.value = srcMat.uniforms.map.value;
    mat.uniforms.silhouette.value = 1;
    (mat.uniforms.silColor.value as THREE.Color).copy(hdr(o.color, 1.4));
    mat.uniforms.outline.value = 0;
    mat.uniforms.flashAmt.value = 0;
    mat.depthWrite = false;
    const m = this.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat));
    src.updateWorldMatrix(true, false);
    src.matrixWorld.decompose(m.position, m.quaternion, m.scale);
    m.renderOrder = 1;
    const start = m.position.clone();
    const op = o.opacity ?? 0.6;
    const done = this.stage
      .tween(o.ms ?? 400, (k) => {
        mat.uniforms.opacity.value = op * (1 - k);
        if (o.drift) m.position.copy(start).addScaledVector(o.drift, k);
      }, ease.outQuad)
      .then(() => this.remove(m));
    return { mesh: m, done };
  }

  clear() {
    for (const c of [...this.group.children]) this.remove(c);
  }

  // ------------------------------------------------------------ physical / elemental kit (ribbon, blast, crack, fangs, sword, vortex, boulder, glass)

  /**
   * Glowing tapered tube along a curve through `points`. Its head sweeps from start to end over `ms`, dragging a
   * tail `length` long (fraction of the path, >= 1 keeps the whole stroke). Claws, slash lines, tongues, wind, helices.
   */
  ribbon(
    points: THREE.Vector3[],
    o: {
      color: THREE.ColorRepresentation;
      core?: THREE.ColorRepresentation;
      width?: number;
      ms?: number;
      holdMs?: number;
      fadeMs?: number;
      length?: number;
      intensity?: number;
      additive?: boolean;
      opacity?: number;
      segments?: number;
      e?: Ease;
    },
  ) {
    const curve: THREE.Curve<THREE.Vector3> = points.length > 2 ? new THREE.CatmullRomCurve3(points) : new THREE.LineCurve3(points[0], points[1]);
    const geo = new THREE.TubeGeometry(curve, o.segments ?? Math.max(32, points.length * 16), 1, 8, false);
    const len = o.length ?? 0.5;
    const additive = o.additive ?? true;
    const k = o.intensity ?? (additive ? 2 : 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: hdr(o.color, k) },
        core: { value: hdr(o.core ?? 0xffffff, k * 1.3) },
        head: { value: 0 },
        tail: { value: -len },
        width: { value: o.width ?? 0.08 },
        alpha: { value: o.opacity ?? 1 },
      },
      vertexShader: /* glsl */ `
        uniform float head; uniform float tail; uniform float width;
        varying float vU; varying float vF; varying vec3 vN; varying vec3 vV;
        void main() {
          vU = uv.x;
          float span = max(1e-4, head - tail);
          float f = clamp((uv.x - tail) / span, 0.0, 1.0);
          vF = f;
          float tip = clamp((head - uv.x) / (0.1 * span) + 0.2, 0.0, 1.0);
          float w = width * pow(f, 0.6) * tip;
          vec3 p = position - normal + normal * w;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vN = normalMatrix * normal; vV = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color; uniform vec3 core; uniform float head; uniform float tail; uniform float alpha;
        varying float vU; varying float vF; varying vec3 vN; varying vec3 vV;
        void main() {
          if (vU > head || vU < tail) discard;
          float facing = abs(dot(normalize(vN), normalize(vV)));
          vec3 c = mix(color, core, smoothstep(0.3, 0.95, facing) * (0.35 + 0.65 * vF));
          float a = alpha * (0.4 + 0.6 * facing) * smoothstep(0.0, 0.2, vF);
          gl_FragColor = vec4(c, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    });
    const mesh = this.add(new THREE.Mesh(geo, mat));
    mesh.renderOrder = 5;
    const u = mat.uniforms;
    const set = (h: number, t: number) => {
      u.head.value = h;
      u.tail.value = t;
    };
    let arrive!: () => void;
    const arrived = new Promise<void>((r) => (arrive = r));
    const done = (async () => {
      await this.stage.tween(o.ms ?? 220, (x) => set(x, x - len), o.e ?? ease.outQuad);
      arrive();
      if (o.holdMs) await this.stage.wait(o.holdMs);
      const a0 = u.alpha.value as number;
      const t0 = 1 - len;
      await this.stage.tween(o.fadeMs ?? 200, (x) => {
        set(1, t0 + (1 - t0) * x * 0.6);
        u.alpha.value = a0 * (1 - x);
      }, ease.inQuad);
      this.remove(mesh);
    })();
    /** current head position */
    const headPos = () => curve.getPointAt(THREE.MathUtils.clamp(u.head.value as number, 0, 1));
    return { mesh, done, arrived, headPos, curve };
  }

  /** Expanding fireball / energy sphere with a noisy hot core (explosions, detonations). */
  energyBlast(pos: THREE.Vector3, o: { color: THREE.ColorRepresentation; core?: THREE.ColorRepresentation; radius?: number; ms?: number; intensity?: number; startRadius?: number }) {
    const k = o.intensity ?? 2.2;
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: hdr(o.color, k) }, core: { value: hdr(o.core ?? 0xffffff, k * 1.3) }, alpha: { value: 1 }, progress: { value: 0 }, time: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color; uniform vec3 core; uniform float alpha; uniform float progress; uniform float time;
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){
          float f = abs(dot(normalize(vN), normalize(vV)));
          float n = sin(vP.x * 7.0 + time * 9.0) * sin(vP.y * 8.0 - time * 7.0) * sin(vP.z * 6.0 + time * 11.0) * 0.5 + 0.5;
          vec3 c = mix(color, core, pow(f, 2.0) * (1.0 - progress * 0.8));
          float a = alpha * (0.25 + 0.75 * pow(f, 1.3)) * mix(1.0, n, 0.45 + progress * 0.4);
          gl_FragColor = vec4(c, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = this.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat));
    mesh.position.copy(pos);
    const R = o.radius ?? 2;
    const r0 = o.startRadius ?? R * 0.15;
    mesh.scale.setScalar(r0);
    const off = this.stage.onUpdate((_dt, t) => (mat.uniforms.time.value = t));
    const done = this.stage
      .tween(o.ms ?? 600, (x) => {
        const g = 1 - (1 - x) ** 4;
        mesh.scale.setScalar(r0 + (R - r0) * g);
        mat.uniforms.progress.value = x;
        mat.uniforms.alpha.value = 1 - x * x;
      }, ease.linear)
      .then(() => {
        off();
        this.remove(mesh);
      });
    return { mesh, done };
  }

  /**
   * Procedural radial cracks (ground fissures, shattered air). `facing` 'ground' lies on the floor at pos.y,
   * 'camera' faces the viewer. `glow` colors the fissure cores (HDR, blooms) when given.
   */
  crack(pos: THREE.Vector3, o: { color?: THREE.ColorRepresentation; glow?: THREE.ColorRepresentation; glowIntensity?: number; radius?: number; ms?: number; branches?: number; facing?: 'ground' | 'camera'; opacity?: number }) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(o.color ?? 0x2a1c10) },
        glow: { value: hdr(o.glow ?? 0x000000, o.glowIntensity ?? 2.5) },
        glowAmt: { value: o.glow !== undefined ? 1 : 0 },
        alpha: { value: o.opacity ?? 0.9 },
        reveal: { value: 0 },
        seed: { value: Math.random() * 100 },
        N: { value: o.branches ?? 8 },
      },
      vertexShader: QUAD_VS,
      fragmentShader: /* glsl */ `
        uniform vec3 color; uniform vec3 glow; uniform float glowAmt; uniform float alpha; uniform float reveal; uniform float seed; uniform float N;
        varying vec2 vUv;
        float h1(float n){ return fract(sin(n * 127.1 + seed * 311.7) * 43758.5453); }
        float n1(float x){ float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
        float cracks(vec2 p, float n, float lenMin, float w0, float s) {
          float r = length(p);
          float a = atan(p.y, p.x) / 6.28318 + 0.5;
          float sec = a * n;
          float id = floor(sec);
          float off = h1(id + s) * 0.4 + 0.3;
          float jag = (n1(r * 9.0 + id * 13.0 + s) - 0.5) * 0.45 + (n1(r * 29.0 + id * 7.0 + s) - 0.5) * 0.2;
          float d = abs(fract(sec) - off - jag * min(1.0, 0.4 + r));
          float arc = d / n * 6.28318 * r;
          float len = mix(lenMin, 1.0, h1(id * 3.1 + s + 1.7));
          float w = w0 * (1.0 - r / len);
          return smoothstep(w, w * 0.35, arc) * step(r, len * reveal) * step(0.0, w);
        }
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          if (r > 1.0) discard;
          float c1 = cracks(p, N, 0.55, 0.06, 0.0);
          float c2 = cracks(p, N * 2.3, 0.25, 0.035, 5.0);
          float crater = smoothstep(0.2 * reveal, 0.02, r);
          float m = max(max(c1, c2 * 0.85), crater * 0.85);
          if (m < 0.01) discard;
          float hot = max(c1, c2) * smoothstep(0.9, 0.0, r) * glowAmt;
          gl_FragColor = vec4(mix(color, glow, hot * 0.8), m * alpha);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    const R = o.radius ?? 1.6;
    const mesh = this.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    mesh.position.copy(pos);
    mesh.scale.setScalar(R);
    if ((o.facing ?? 'ground') === 'ground') {
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y += 0.015;
    } else mesh.quaternion.copy(this.stage.camera.quaternion);
    mesh.renderOrder = 1;
    const ms = o.ms ?? 1200;
    const u = mat.uniforms;
    const done = (async () => {
      await this.stage.tween(ms * 0.2, (x) => (u.reveal.value = x), ease.outCubic);
      await this.stage.wait(ms * 0.5);
      const a0 = u.alpha.value as number;
      await this.stage.tween(ms * 0.3, (x) => (u.alpha.value = a0 * (1 - x)));
      this.remove(mesh);
    })();
    return { mesh, done };
  }

  /** Two jaws of fangs that open wide and snap shut in front of the camera (Bite, Crunch, Hyper Fang). */
  fangs(pos: THREE.Vector3, o: { color?: THREE.ColorRepresentation; edge?: THREE.ColorRepresentation; size?: number; ms?: number; intensity?: number }) {
    const baseY = (x: number) => 0.22 * x * x;
    const shape = new THREE.Shape();
    shape.moveTo(-1.08, baseY(-1.08) + 0.2);
    for (let x = -1.0; x <= 1.08; x += 0.12) shape.lineTo(x, baseY(x) + 0.2);
    shape.lineTo(1.08, baseY(1.08));
    const teeth: [number, number, number][] = [
      [0.98, 0.58, 1.0],
      [0.46, 0.14, 0.55],
      [-0.14, -0.46, 0.55],
      [-0.58, -0.98, 1.0],
    ];
    for (const [xr, xl, L] of teeth) {
      shape.lineTo(xr, baseY(xr));
      const xc = (xr + xl) / 2;
      shape.quadraticCurveTo(xr - 0.02, baseY(xr) - L * 0.6, xc, baseY(xc) - L);
      shape.quadraticCurveTo(xl + 0.02, baseY(xl) - L * 0.6, xl, baseY(xl));
    }
    shape.lineTo(-1.08, baseY(-1.08));
    const geo = new THREE.ShapeGeometry(shape, 6);
    const k = o.intensity ?? 1.6;
    const fillM = new THREE.MeshBasicMaterial({ color: hdr(o.color ?? 0xffffff, k), transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    const edgeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(o.edge ?? 0x2a0a3a), transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    const root = this.add(new THREE.Group());
    root.position.copy(pos);
    root.quaternion.copy(this.stage.camera.quaternion);
    const S = o.size ?? 1;
    root.scale.setScalar(S);
    const jaw = (flip: boolean) => {
      const g = new THREE.Group();
      const edge = new THREE.Mesh(geo, edgeM);
      edge.scale.set(1.1, 1.16, 1);
      edge.position.y = 0.02;
      edge.renderOrder = 20;
      const fill = new THREE.Mesh(geo, fillM);
      fill.renderOrder = 21;
      g.add(edge, fill);
      if (flip) {
        g.rotation.z = Math.PI;
        g.position.x = 0.1;
      }
      root.add(g);
      return g;
    };
    const upper = jaw(false);
    const lower = jaw(true);
    const ms = o.ms ?? 520;
    const open = 1.25;
    const shut = 0.2;
    let bite!: () => void;
    const bitten = new Promise<void>((r) => (bite = r));
    const setOpen = (v: number) => {
      upper.position.y = v;
      lower.position.y = -v;
    };
    const done = (async () => {
      await this.stage.tween(ms * 0.35, (x) => {
        fillM.opacity = x;
        edgeM.opacity = x * 0.85;
        setOpen(open * (0.75 + 0.25 * x));
        root.scale.setScalar(S * (0.8 + 0.2 * x));
      }, ease.outQuad);
      await this.stage.tween(ms * 0.14, (x) => setOpen(open + (shut - open) * x), ease.inCubic);
      bite();
      await this.stage.tween(ms * 0.16, (x) => setOpen(shut + Math.sin(x * Math.PI) * 0.08), ease.linear);
      await this.stage.tween(ms * 0.35, (x) => {
        fillM.opacity = 1 - x;
        edgeM.opacity = 0.85 * (1 - x);
        root.scale.setScalar(S * (1 + 0.1 * x));
      });
      geo.dispose();
      fillM.dispose();
      edgeM.dispose();
      this.group.remove(root);
    })();
    return { group: root, done, bitten };
  }

  /** A glowing sword of light (two crossed planes, hilt at the origin, blade along +Y). Animate `group` yourself. */
  sword(o: { color: THREE.ColorRepresentation; core?: THREE.ColorRepresentation; length?: number; intensity?: number }) {
    const L = o.length ?? 1.4;
    const w = 0.075 * L;
    const s = new THREE.Shape();
    s.moveTo(0, L);
    s.lineTo(w, 0.84 * L);
    s.lineTo(w, 0.22 * L);
    s.lineTo(3.2 * w, 0.21 * L);
    s.lineTo(3.2 * w, 0.16 * L);
    s.lineTo(0.5 * w, 0.16 * L);
    s.lineTo(0.5 * w, 0.03 * L);
    s.lineTo(0.9 * w, 0);
    s.lineTo(-0.9 * w, 0);
    s.lineTo(-0.5 * w, 0.03 * L);
    s.lineTo(-0.5 * w, 0.16 * L);
    s.lineTo(-3.2 * w, 0.16 * L);
    s.lineTo(-3.2 * w, 0.21 * L);
    s.lineTo(-w, 0.22 * L);
    s.lineTo(-w, 0.84 * L);
    s.lineTo(0, L);
    const geo = new THREE.ShapeGeometry(s);
    const coreS = new THREE.Shape();
    coreS.moveTo(0, 0.97 * L);
    coreS.lineTo(0.35 * w, 0.84 * L);
    coreS.lineTo(0.3 * w, 0.24 * L);
    coreS.lineTo(-0.3 * w, 0.24 * L);
    coreS.lineTo(-0.35 * w, 0.84 * L);
    const coreGeo = new THREE.ShapeGeometry(coreS);
    const k = o.intensity ?? 2;
    const mat = new THREE.MeshBasicMaterial({ color: hdr(o.color, k), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const coreM = new THREE.MeshBasicMaterial({ color: hdr(o.core ?? 0xffffff, k * 1.4), transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const group = this.add(new THREE.Group());
    for (const ry of [0, Math.PI / 2]) {
      const a = new THREE.Mesh(geo, mat);
      a.rotation.y = ry;
      const b = new THREE.Mesh(coreGeo, coreM);
      b.rotation.y = ry;
      b.position.z = ry ? 0 : 0.002;
      group.add(a, b);
    }
    return {
      group,
      setOpacity: (a: number) => {
        mat.opacity = 0.85 * a;
        coreM.opacity = a;
      },
      dispose: () => {
        this.group.remove(group);
        geo.dispose();
        coreGeo.dispose();
        mat.dispose();
        coreM.dispose();
      },
    };
  }

  /** Swirling tornado funnel standing on `pos` (Twister, Gust, Sand Tomb). Move `mesh.position` to make it travel. */
  vortex(pos: THREE.Vector3, o: { color: THREE.ColorRepresentation; color2?: THREE.ColorRepresentation; radius?: number; height?: number; ms?: number; intensity?: number; speed?: number; opacity?: number }) {
    const geo = new THREE.CylinderGeometry(1, 0.3, 1, 36, 8, true);
    geo.translate(0, 0.5, 0);
    const mk = (spin: number, bands: number, alphaK: number) =>
      new THREE.ShaderMaterial({
        uniforms: {
          color: { value: hdr(o.color, o.intensity ?? 1.8) },
          color2: { value: hdr(o.color2 ?? o.color, o.intensity ?? 1.8) },
          time: { value: 0 },
          alpha: { value: 0 },
          spin: { value: spin },
          bands: { value: bands },
          ak: { value: alphaK },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `
          uniform vec3 color; uniform vec3 color2; uniform float time; uniform float alpha; uniform float spin; uniform float bands; uniform float ak;
          varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){
            float s = 0.5 + 0.5 * sin((vUv.x * bands + vUv.y * 2.2 - time * spin) * 6.28318);
            float s2 = 0.5 + 0.5 * sin((vUv.x * (bands + 2.0) - vUv.y * 1.3 - time * spin * 1.4) * 6.28318);
            float st = pow(s, 5.0) + pow(s2, 9.0) * 0.6;
            float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
            float a = alpha * ak * st * (0.35 + 0.65 * rim) * smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
            gl_FragColor = vec4(mix(color, color2, vUv.y), a);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
    const outerM = mk(o.speed ?? 1.6, 3, o.opacity ?? 1);
    const innerM = mk(-(o.speed ?? 1.6) * 1.3, 2, (o.opacity ?? 1) * 0.7);
    const mesh = this.add(new THREE.Mesh(geo, outerM));
    const inner = new THREE.Mesh(geo, innerM);
    inner.scale.set(0.6, 0.95, 0.6);
    mesh.add(inner);
    mesh.position.copy(pos);
    const R = o.radius ?? 1.2;
    const H = o.height ?? 3;
    const off = this.stage.onUpdate((_dt, t) => {
      outerM.uniforms.time.value = t;
      innerM.uniforms.time.value = t;
      mesh.rotation.y = t * 2;
    });
    const ms = o.ms ?? 1400;
    const setA = (a: number) => {
      outerM.uniforms.alpha.value = a;
      innerM.uniforms.alpha.value = a;
    };
    const done = (async () => {
      await this.stage.tween(ms * 0.22, (x) => {
        setA(x);
        mesh.scale.set(R * (0.3 + 0.7 * x), H * (0.2 + 0.8 * x), R * (0.3 + 0.7 * x));
      }, ease.outCubic);
      await this.stage.wait(ms * 0.5);
      await this.stage.tween(ms * 0.28, (x) => {
        setA(1 - x);
        mesh.scale.set(R * (1 + 0.4 * x), H * (1 + 0.2 * x), R * (1 + 0.4 * x));
      });
      off();
      innerM.dispose();
      this.remove(mesh);
    })();
    return { mesh, done };
  }

  /** A persistent lumpy boulder mesh (Rock Throw, Rock Tomb, Rock Smash). Animate `mesh` and call dispose(). */
  boulder(pos: THREE.Vector3, o: { color: THREE.ColorRepresentation; size?: number; emissive?: number }) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.getAttribute('position') as THREE.BufferAttribute;
    const seed = Math.random() * 100;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const h = Math.sin(Math.round(v.x * 100) * 12.9898 + Math.round(v.y * 100) * 78.233 + Math.round(v.z * 100) * 37.719 + seed) * 43758.5453;
      v.multiplyScalar(0.78 + (h - Math.floor(h)) * 0.4);
      p.setXYZ(i, v.x, v.y * 0.85, v.z);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: o.color, flatShading: true, roughness: 0.95, emissive: new THREE.Color(o.color), emissiveIntensity: o.emissive ?? 0.12 });
    const mesh = this.add(new THREE.Mesh(geo, mat));
    mesh.castShadow = true;
    mesh.position.copy(pos);
    mesh.scale.setScalar(o.size ?? 0.5);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    return {
      mesh,
      dispose: () => {
        if (mesh.parent) this.remove(mesh);
      },
    };
  }

  /** Translucent glassy barrier panel facing the camera; `shatter()` bursts it into crystal shards (Brick Break). */
  glassPanel(pos: THREE.Vector3, o: { color: THREE.ColorRepresentation; width?: number; height?: number; intensity?: number }) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: hdr(o.color, o.intensity ?? 1.6) }, alpha: { value: 0 }, time: { value: 0 }, crack: { value: 0 } },
      vertexShader: QUAD_VS,
      fragmentShader: /* glsl */ `
        uniform vec3 color; uniform float alpha; uniform float time; uniform float crack;
        varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec2 p = vUv * 2.0 - 1.0;
          vec2 e = 1.0 - abs(p);
          float border = smoothstep(0.08, 0.0, min(e.x, e.y));
          vec2 g = abs(fract(vUv * vec2(6.0, 8.0)) - 0.5);
          float grid = smoothstep(0.46, 0.5, max(g.x, g.y)) * 0.25;
          float glint = smoothstep(0.12, 0.0, abs(p.x + p.y * 0.6 - (fract(time * 0.8) * 4.0 - 2.0)));
          float a = 0.16 + border * 0.8 + grid + glint * 0.5;
          // crack lines radiating from the center
          float ang = atan(p.y, p.x);
          float r = length(p);
          float lines = smoothstep(0.1, 0.0, abs(fract(ang * 1.1 + h(floor(vec2(ang * 1.1, 0.0))) * 0.3) - 0.5) * r * 3.0);
          a += lines * crack * step(r, crack * 1.4);
          gl_FragColor = vec4(color, a * alpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const W = o.width ?? 1.6;
    const H = o.height ?? 2;
    const mesh = this.add(new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat));
    mesh.position.copy(pos);
    mesh.quaternion.copy(this.stage.camera.quaternion);
    const off = this.stage.onUpdate((_dt, t) => (mat.uniforms.time.value = t));
    const shown = this.stage.tween(200, (x) => {
      mat.uniforms.alpha.value = x;
      mesh.scale.setScalar(0.7 + 0.3 * x);
    }, ease.outBack);
    let gone = false;
    const dispose = () => {
      if (gone) return;
      gone = true;
      off();
      this.remove(mesh);
    };
    return {
      mesh,
      shown,
      /** 0..1 crack lines */
      setCrack: (v: number) => (mat.uniforms.crack.value = v),
      shatter: (color?: THREE.ColorRepresentation) => {
        dispose();
        return this.debris({ from: pos.clone(), count: 18, color: color ?? o.color, geometry: 'crystal', size: 0.09, speed: 4.5, up: 3.5, ms: 900, emissive: 0.8 }).done;
      },
      dispose,
    };
  }

  /** Comic-style spiky impact burst facing the camera (white core, colored rim). Drawn on top of sprites. */
  impactStar(pos: THREE.Vector3, o: { color: THREE.ColorRepresentation; core?: THREE.ColorRepresentation; size?: number; ms?: number; spikes?: number; intensity?: number }) {
    const n = o.spikes ?? 10;
    const shape = new THREE.Shape();
    for (let i = 0; i <= n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? 0.75 + Math.random() * 0.25 : 0.3 + Math.random() * 0.08;
      if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const geo = new THREE.ShapeGeometry(shape);
    const k = o.intensity ?? 1;
    const rimM = new THREE.MeshBasicMaterial({ color: hdr(o.color, k), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    const coreM = new THREE.MeshBasicMaterial({ color: hdr(o.core ?? 0xffffff, k), transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
    const root = this.add(new THREE.Group());
    const rim = new THREE.Mesh(geo, rimM);
    const core = new THREE.Mesh(geo, coreM);
    core.scale.setScalar(0.62);
    core.rotation.z = 0.2;
    core.position.z = 0.01;
    rim.renderOrder = 22;
    core.renderOrder = 23;
    root.add(rim, core);
    root.position.copy(pos);
    root.quaternion.copy(this.stage.camera.quaternion);
    root.rotateZ(Math.random() * Math.PI);
    const S = o.size ?? 1;
    const ms = o.ms ?? 260;
    const done = (async () => {
      await this.stage.tween(ms * 0.25, (x) => root.scale.setScalar(S * (0.35 + 0.75 * x)), ease.outCubic);
      await this.stage.tween(ms * 0.75, (x) => {
        root.scale.setScalar(S * (1.1 + 0.25 * x));
        rimM.opacity = 1 - x;
        coreM.opacity = 1 - x * x;
        core.scale.setScalar(0.62 * (1 - x * 0.6));
      }, ease.outQuad);
      this.group.remove(root);
      geo.dispose();
      rimM.dispose();
      coreM.dispose();
    })();
    return { group: root, done };
  }
}
