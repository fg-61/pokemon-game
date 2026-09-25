import * as THREE from 'three';
import type { StatusCond } from '../battle/types';
import { dotTexture } from './arena';
import { ease } from './clock';
import type { Stage } from './stage';

export interface SheetInfo {
  file: string;
  frameW: number;
  frameH: number;
  cols: number;
  rows: number;
  frames: number;
  durations: number[];
  bboxBottomPad: number;
}
interface SpriteJson {
  dex: number;
  front: SheetInfo;
  back: SheetInfo;
}

export const assetUrl = (dex: number, file: string) => `assets/pokemon/${dex}/${file}`;

const loader = new THREE.TextureLoader();
const sheetCache = new Map<string, Promise<{ info: SheetInfo; tex: THREE.Texture }>>();
const jsonCache = new Map<number, Promise<SpriteJson>>();

export function loadSpriteJson(dex: number): Promise<SpriteJson> {
  let p = jsonCache.get(dex);
  if (!p) {
    p = fetch(assetUrl(dex, 'sprite.json')).then((r) => r.json());
    jsonCache.set(dex, p);
  }
  return p;
}

export function loadSheet(dex: number, facing: 'front' | 'back') {
  const key = `${dex}-${facing}`;
  let p = sheetCache.get(key);
  if (!p) {
    p = loadSpriteJson(dex).then(async (j) => {
      const info = j[facing];
      const tex = await loader.loadAsync(assetUrl(dex, info.file));
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      return { info, tex };
    });
    sheetCache.set(key, p);
  }
  return p;
}

/** World units per sprite pixel. */
export const PIXEL = 0.021;

const VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const FS = /* glsl */ `
  uniform sampler2D map; uniform vec4 rect; uniform vec2 texel;
  uniform vec3 flashColor; uniform float flashAmt;
  uniform vec3 statusColor; uniform float statusAmt;
  uniform vec3 light; uniform float opacity; uniform float dissolve; uniform float time;
  uniform float silhouette; uniform vec3 silColor; uniform float outline; uniform vec3 outlineColor;
  varying vec2 vUv;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
  void main() {
    vec2 uv = rect.xy + vUv * rect.zw;
    vec4 c = texture2D(map, uv);
    float a = c.a;
    // 1px outline glow sampled from neighbours (used for "ready" / evolution aura)
    float o = 0.0;
    if (outline > 0.0 && a < 0.5) {
      vec2 lo = rect.xy; vec2 hi = rect.xy + rect.zw;
      for (int i = 0; i < 8; i++) {
        float ang = float(i) * 0.785398;
        vec2 q = clamp(uv + vec2(cos(ang), sin(ang)) * texel * 2.0, lo, hi);
        o = max(o, texture2D(map, q).a);
      }
      if (o < 0.5) discard;
      gl_FragColor = vec4(outlineColor * outline, opacity * o);
      return;
    }
    if (a < 0.5) discard;
    // pixel-dissolve (faint / evolution)
    vec2 px = floor(vUv / texel * rect.zw);
    if (hash(px) < dissolve) discard;
    vec3 col = c.rgb * light;
    col = mix(col, statusColor, statusAmt);
    col = mix(col, silColor, silhouette);
    col = mix(col, flashColor, flashAmt);
    gl_FragColor = vec4(col, opacity);
  }
`;

const STATUS_COLOR: Record<StatusCond, number> = {
  none: 0xffffff,
  brn: 0xff5a2a,
  par: 0xffe23a,
  psn: 0xb04adf,
  tox: 0x9a2adf,
  slp: 0x6a7a9a,
  frz: 0x9adfff,
};

/**
 * An animated Pokemon billboard standing on a platform.
 * `group` sits at the feet; the mesh is cylindrically billboarded towards the camera.
 */
export class PokemonSprite {
  readonly group = new THREE.Group();
  readonly body = new THREE.Group(); // animated offset layer (lunges, hops, knockback)
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private shadow: THREE.Mesh;
  private info: SheetInfo | null = null;
  private frame = 0;
  private frameTime = 0;
  animSpeed = 1;
  private shakeAmp = 0;
  private shakeT = 0;
  private status: StatusCond = 'none';
  dex = 0;
  facing: 'front' | 'back';
  width = 1;
  height = 1;
  private dispose: () => void;
  /** Extra scale applied on top of pixel size (enter/exit, evolution pulses). */
  scale = 1;
  hop = 0;

  constructor(private stage: Stage, facing: 'front' | 'back') {
    this.facing = facing;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null },
        rect: { value: new THREE.Vector4(0, 0, 1, 1) },
        texel: { value: new THREE.Vector2(1 / 256, 1 / 256) },
        flashColor: { value: new THREE.Color(1, 1, 1) },
        flashAmt: { value: 0 },
        statusColor: { value: new THREE.Color(1, 1, 1) },
        statusAmt: { value: 0 },
        light: { value: new THREE.Color(1, 1, 1) },
        opacity: { value: 1 },
        dissolve: { value: 0 },
        time: { value: 0 },
        silhouette: { value: 0 },
        silColor: { value: new THREE.Color(1, 1, 1) },
        outline: { value: 0 },
        outlineColor: { value: new THREE.Color(1, 1, 1) },
      },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: true,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.mesh.renderOrder = 2;
    this.body.add(this.mesh);
    this.group.add(this.body);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: dotTexture(), color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.01;
    this.group.add(this.shadow);
    this.group.visible = false;

    this.dispose = stage.onUpdate((dt, t) => this.update(dt, t));
  }

  get uniforms() {
    return this.mesh.material.uniforms;
  }

  async load(dex: number) {
    const { info, tex } = await loadSheet(dex, this.facing);
    this.dex = dex;
    this.info = info;
    this.frame = 0;
    this.frameTime = 0;
    const u = this.uniforms;
    u.map.value = tex;
    const img = tex.image as { width: number; height: number };
    u.texel.value.set(1 / img.width, 1 / img.height);
    // back sprites are drawn a bit larger (closer to camera in the classic layout)
    const k = PIXEL * (this.facing === 'back' ? 0.95 : 1.3);
    this.width = info.frameW * k;
    this.height = info.frameH * k;
    this.applyFrame();
    this.applySize();
  }

  private applySize() {
    const s = this.scale;
    this.mesh.scale.set(this.width * s, this.height * s, 1);
    const pad = (this.info?.bboxBottomPad ?? 2) * PIXEL;
    this.mesh.position.y = (this.height * s) / 2 - pad * s + this.hop;
    this.shadow.scale.set(Math.max(0.8, this.width * 0.75) * s, Math.max(0.5, this.width * 0.32) * s, 1);
  }

  private applyFrame() {
    const i = this.info;
    if (!i) return;
    const img = this.uniforms.map.value.image as { width: number; height: number };
    const col = this.frame % i.cols;
    const row = Math.floor(this.frame / i.cols);
    const du = i.frameW / img.width;
    const dv = i.frameH / img.height;
    (this.uniforms.rect.value as THREE.Vector4).set(col * du, 1 - (row + 1) * dv, du, dv);
  }

  setLight(c: THREE.ColorRepresentation) {
    (this.uniforms.light.value as THREE.Color).set(c);
  }

  setStatus(s: StatusCond) {
    this.status = s;
    (this.uniforms.statusColor.value as THREE.Color).set(STATUS_COLOR[s]);
    this.animSpeed = s === 'slp' || s === 'frz' ? 0 : s === 'par' ? 0.5 : 1;
  }

  /** Center of the sprite in world space. */
  center(target = new THREE.Vector3()): THREE.Vector3 {
    this.mesh.getWorldPosition(target);
    return target;
  }

  /** Point on the sprite at a fraction of its height (0 = feet, 1 = top). */
  at(frac: number, target = new THREE.Vector3()): THREE.Vector3 {
    this.group.getWorldPosition(target);
    target.add(this.body.position);
    target.y += this.height * this.scale * frac;
    return target;
  }

  update(dt: number, t: number) {
    const i = this.info;
    if (i && this.animSpeed > 0) {
      this.frameTime += dt * 1000 * this.animSpeed;
      let d = i.durations[this.frame] ?? 60;
      while (this.frameTime >= d) {
        this.frameTime -= d;
        this.frame = (this.frame + 1) % i.frames;
        d = i.durations[this.frame] ?? 60;
      }
      this.applyFrame();
    }
    const u = this.uniforms;
    u.time.value = t;
    // status pulse
    const pulse = this.status === 'none' ? 0 : this.status === 'par' ? (Math.sin(t * 22) > 0.6 ? 0.45 : 0.05) : 0.18 + 0.12 * Math.sin(t * 4);
    u.statusAmt.value = pulse;
    // shake
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      this.mesh.position.x = Math.sin(t * 70) * this.shakeAmp * Math.max(0, this.shakeT) * 3;
    } else this.mesh.position.x = 0;
    this.applySize();
    // cylindrical billboard
    const cam = this.stage.camera.position;
    const wp = this.group.position;
    this.mesh.rotation.y = Math.atan2(cam.x - wp.x - this.body.position.x, cam.z - wp.z - this.body.position.z);
  }

  // ------------------------------------------------------------ effects

  flash(color: THREE.ColorRepresentation = 0xffffff, ms = 180, amount = 0.9) {
    (this.uniforms.flashColor.value as THREE.Color).set(color);
    return this.stage.tween(ms, (k) => (this.uniforms.flashAmt.value = amount * (1 - k)), ease.outQuad);
  }

  /** Blink white a few times (hit reaction). */
  async blink(times = 3, color: THREE.ColorRepresentation = 0xffffff) {
    (this.uniforms.flashColor.value as THREE.Color).set(color);
    for (let i = 0; i < times; i++) {
      this.uniforms.flashAmt.value = 0.85;
      await this.stage.wait(55);
      this.uniforms.flashAmt.value = 0;
      this.mesh.visible = false;
      await this.stage.wait(45);
      this.mesh.visible = true;
    }
  }

  shake(amp = 0.12, seconds = 0.35) {
    this.shakeAmp = amp;
    this.shakeT = seconds;
  }

  setOutline(v: number, color: THREE.ColorRepresentation = 0xffffff) {
    this.uniforms.outline.value = v;
    (this.uniforms.outlineColor.value as THREE.Color).set(color);
  }

  /** Move the body towards a world direction and back (physical attack). */
  async lunge(towards: THREE.Vector3, dist = 1.2, ms = 320) {
    const dir = towards.clone().sub(this.group.position).setY(0).normalize();
    await this.stage.tween(ms * 0.45, (k) => this.body.position.copy(dir).multiplyScalar(-0.25 * k), ease.outQuad);
    await this.stage.tween(ms * 0.25, (k) => this.body.position.copy(dir).multiplyScalar(-0.25 + (dist + 0.25) * k), ease.inCubic);
    this.stage.tween(ms * 0.6, (k) => this.body.position.copy(dir).multiplyScalar(dist * (1 - k)), ease.outCubic);
  }

  async knockback(from: THREE.Vector3, dist = 0.45, ms = 380) {
    const dir = this.group.position.clone().sub(from).setY(0).normalize();
    await this.stage.tween(ms * 0.3, (k) => this.body.position.copy(dir).multiplyScalar(dist * k), ease.outQuad);
    await this.stage.tween(ms * 0.7, (k) => this.body.position.copy(dir).multiplyScalar(dist * (1 - k)), ease.inOutQuad);
  }

  async jump(h = 0.6, ms = 360) {
    await this.stage.tween(ms, (k) => (this.hop = Math.sin(k * Math.PI) * h), ease.linear);
    this.hop = 0;
  }

  async enter() {
    this.group.visible = true;
    this.uniforms.dissolve.value = 0;
    this.uniforms.opacity.value = 1;
    this.uniforms.silhouette.value = 1;
    (this.uniforms.silColor.value as THREE.Color).setRGB(1.6, 1.6, 2.2);
    this.scale = 0.05;
    await this.stage.tween(360, (k) => (this.scale = 0.05 + 0.95 * k), ease.outBack);
    await this.stage.tween(260, (k) => (this.uniforms.silhouette.value = 1 - k), ease.outQuad);
  }

  async exit() {
    (this.uniforms.silColor.value as THREE.Color).setRGB(1.6, 0.4, 0.4);
    await this.stage.tween(180, (k) => (this.uniforms.silhouette.value = k));
    await this.stage.tween(260, (k) => (this.scale = 1 - 0.95 * k), ease.inCubic);
    this.group.visible = false;
    this.scale = 1;
    this.uniforms.silhouette.value = 0;
  }

  async faint() {
    this.animSpeed = 0;
    const startY = this.body.position.y;
    await Promise.all([
      this.stage.tween(700, (k) => {
        this.body.position.y = startY - k * this.height * 0.7;
        this.uniforms.dissolve.value = k * 0.9;
        this.uniforms.opacity.value = 1 - k;
      }, ease.inQuad),
      this.stage.tween(200, (k) => (this.uniforms.flashAmt.value = 0.6 * (1 - k))),
    ]);
    this.group.visible = false;
    this.body.position.y = 0;
    this.uniforms.dissolve.value = 0;
    this.uniforms.opacity.value = 1;
    this.animSpeed = 1;
  }

  destroy() {
    this.dispose();
    this.group.parent?.remove(this.group);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
