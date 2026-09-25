import * as THREE from 'three';
import type { Stage } from './stage';

export const PLAYER_POS = new THREE.Vector3(-2.7, 0, 2.3);
export const ENEMY_POS = new THREE.Vector3(2.9, 0, -2.5);

export interface ArenaTheme {
  id: string;
  name: string;
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  sunColor: number;
  sunDir: [number, number, number];
  fog: number;
  fogDensity: number;
  groundA: string;
  groundB: string;
  groundC: string;
  hemiSky: number;
  hemiGround: number;
  sunIntensity: number;
  hemiIntensity: number;
  platformTop: number;
  platformSide: number;
  props: 'trees' | 'rocks' | 'crystals' | 'pines';
  propColor: number;
  propColor2: number;
  mountain: number;
  ambient: 'pollen' | 'embers' | 'fireflies' | 'snow';
  stars: boolean;
  clouds: number; // 0..1 coverage
  cloudColor: number;
  spriteLight: number; // multiplier color applied to sprites so they sit in the scene lighting
}

export const THEMES: ArenaTheme[] = [
  {
    id: 'meadow',
    name: 'Viridian Meadow',
    skyTop: 0x2f6fd6,
    skyHorizon: 0xbfe3ff,
    skyBottom: 0xdff2ff,
    sunColor: 0xfff1d0,
    sunDir: [0.4, 0.7, -0.6],
    fog: 0xcfe6f5,
    fogDensity: 0.0085,
    groundA: '#5fa845',
    groundB: '#78bf55',
    groundC: '#4a8a3a',
    hemiSky: 0xcfe8ff,
    hemiGround: 0x3d6b2a,
    sunIntensity: 2.6,
    hemiIntensity: 1.3,
    platformTop: 0xd8c9a3,
    platformSide: 0x9b8a6a,
    props: 'trees',
    propColor: 0x3f8f3a,
    propColor2: 0x2e6e30,
    mountain: 0x7fa6c8,
    ambient: 'pollen',
    stars: false,
    clouds: 0.5,
    cloudColor: 0xffffff,
    spriteLight: 0xffffff,
  },
  {
    id: 'volcano',
    name: 'Cinnabar Caldera',
    skyTop: 0x2a1640,
    skyHorizon: 0xff7a3c,
    skyBottom: 0xffb36b,
    sunColor: 0xffa060,
    sunDir: [-0.6, 0.25, -0.7],
    fog: 0x8a4a3a,
    fogDensity: 0.011,
    groundA: '#5a3a30',
    groundB: '#6e4636',
    groundC: '#3d2622',
    hemiSky: 0xffb080,
    hemiGround: 0x40201a,
    sunIntensity: 2.8,
    hemiIntensity: 1.0,
    platformTop: 0x8c7a70,
    platformSide: 0x4a3a36,
    props: 'rocks',
    propColor: 0x3a2a28,
    propColor2: 0x5a3c30,
    mountain: 0x5a2c30,
    ambient: 'embers',
    stars: false,
    clouds: 0.35,
    cloudColor: 0xffb090,
    spriteLight: 0xffe2c8,
  },
  {
    id: 'night',
    name: 'Lavender Moonfield',
    skyTop: 0x070b24,
    skyHorizon: 0x3a2d6e,
    skyBottom: 0x4a3a80,
    sunColor: 0xb8c8ff,
    sunDir: [0.5, 0.55, -0.7],
    fog: 0x2a2450,
    fogDensity: 0.012,
    groundA: '#2f4a52',
    groundB: '#3a5a60',
    groundC: '#243a44',
    hemiSky: 0x8a90ff,
    hemiGround: 0x1a1a30,
    sunIntensity: 1.6,
    hemiIntensity: 1.1,
    platformTop: 0x9a9ab8,
    platformSide: 0x4a4a68,
    props: 'crystals',
    propColor: 0x8a6cff,
    propColor2: 0x4ad0ff,
    mountain: 0x2a2a58,
    ambient: 'fireflies',
    stars: true,
    clouds: 0.25,
    cloudColor: 0x8080c0,
    spriteLight: 0xd8dcff,
  },
  {
    id: 'snow',
    name: 'Seafoam Tundra',
    skyTop: 0x5a8cc8,
    skyHorizon: 0xdceaf5,
    skyBottom: 0xf0f6fa,
    sunColor: 0xfff8f0,
    sunDir: [-0.3, 0.5, -0.8],
    fog: 0xdfeaf2,
    fogDensity: 0.011,
    groundA: '#e8f0f5',
    groundB: '#d0e0ea',
    groundC: '#b8cedc',
    hemiSky: 0xe8f4ff,
    hemiGround: 0x9ab0c0,
    sunIntensity: 2.2,
    hemiIntensity: 1.4,
    platformTop: 0xbcd0dc,
    platformSide: 0x7890a0,
    props: 'pines',
    propColor: 0x2e5a4a,
    propColor2: 0xeaf4fa,
    mountain: 0xa8c0d8,
    ambient: 'snow',
    stars: false,
    clouds: 0.7,
    cloudColor: 0xffffff,
    spriteLight: 0xf4f8ff,
  },
];

const SKY_VS = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const SKY_FS = /* glsl */ `
  uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunColor; uniform vec3 sunDir;
  uniform float time; uniform float clouds; uniform vec3 cloudColor; uniform float stars;
  varying vec3 vDir;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float v=0.0; float a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, bottom, clamp(-h * 3.0, 0.0, 1.0));
    float sd = max(dot(d, normalize(sunDir)), 0.0);
    col += sunColor * (pow(sd, 900.0) * 6.0 + pow(sd, 18.0) * 0.45 + pow(sd, 3.0) * 0.12);
    if (h > 0.0) {
      vec2 cp = d.xz / (h + 0.18) * 1.6 + vec2(time * 0.012, time * 0.004);
      float c = fbm(cp);
      float cov = smoothstep(1.0 - clouds, 1.0 - clouds + 0.35, c);
      vec3 cc = cloudColor * (0.75 + 0.35 * fbm(cp * 2.0 + 3.0)) + sunColor * pow(sd, 6.0) * 0.4;
      col = mix(col, cc, cov * smoothstep(0.0, 0.18, h) * 0.9);
      if (stars > 0.5) {
        vec2 sp = d.xz / (h + 0.3) * 60.0;
        float s = step(0.985, hash(floor(sp))) * (0.6 + 0.4 * sin(time * 2.0 + hash(floor(sp)) * 20.0));
        col += vec3(s) * smoothstep(0.1, 0.5, h) * (1.0 - cov);
      }
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

const RUNE_FS = /* glsl */ `
  uniform vec3 color; uniform float time; uniform float glow; uniform vec3 base;
  varying vec2 vUv;
  float ring(float r, float c, float w){ return smoothstep(w, 0.0, abs(r - c)); }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    vec3 col = base * (0.85 + 0.15 * smoothstep(1.0, 0.2, r));
    float e = 0.0;
    e += ring(r, 0.93, 0.025);
    e += ring(r, 0.78, 0.012);
    float ticks = step(0.8, fract((a + time * 0.25) * 12.0 / 6.2831)) * step(0.8, r) * step(r, 0.9);
    e += ticks * 0.8;
    float runes = step(0.55, fract((a - time * 0.15) * 30.0 / 6.2831)) * ring(r, 0.62, 0.03);
    e += runes * 0.6;
    e += ring(r, 0.35, 0.01) * 0.5;
    col += color * e * (0.6 + glow * 2.2);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function groundTexture(theme: ArenaTheme): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = theme.groundA;
  g.fillRect(0, 0, 512, 512);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rnd() < 0.5 ? theme.groundB : theme.groundC;
    g.globalAlpha = 0.18 + rnd() * 0.25;
    const x = rnd() * 512;
    const y = rnd() * 512;
    const r = 4 + rnd() * 26;
    g.beginPath();
    g.ellipse(x, y, r, r * (0.5 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 0.35;
  for (let i = 0; i < 2600; i++) {
    g.strokeStyle = rnd() < 0.5 ? theme.groundB : theme.groundC;
    const x = rnd() * 512;
    const y = rnd() * 512;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 4, y - 3 - rnd() * 6);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(26, 26);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class Platform {
  readonly group = new THREE.Group();
  private rune: THREE.ShaderMaterial;
  private glowTarget = 0;

  constructor(theme: ArenaTheme, radius: number) {
    const side = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.1, 0.34, 56),
      new THREE.MeshStandardMaterial({ color: theme.platformSide, roughness: 0.9, flatShading: false }),
    );
    side.position.y = 0.17;
    side.castShadow = true;
    side.receiveShadow = true;
    this.group.add(side);
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.99, 0.06, 8, 64),
      new THREE.MeshStandardMaterial({ color: theme.platformSide, roughness: 0.6, metalness: 0.2 }),
    );
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.34;
    this.group.add(lip);
    this.rune = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0x66ccff) },
        base: { value: new THREE.Color(theme.platformTop) },
        time: { value: 0 },
        glow: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: RUNE_FS,
    });
    const top = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.985, 64), this.rune);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.345;
    top.receiveShadow = true;
    this.group.add(top);
  }

  setColor(c: THREE.ColorRepresentation) {
    (this.rune.uniforms.color.value as THREE.Color).set(c);
  }

  /** 0..1 — pulses the rune ring (used when the gauge is full). */
  setGlow(v: number) {
    this.glowTarget = v;
  }

  update(dt: number, t: number) {
    const u = this.rune.uniforms;
    u.time.value = t;
    u.glow.value += (this.glowTarget * (0.75 + 0.25 * Math.sin(t * 6)) - u.glow.value) * Math.min(1, dt * 8);
  }
}

export class Arena {
  readonly group = new THREE.Group();
  readonly playerPlatform: Platform;
  readonly enemyPlatform: Platform;
  readonly theme: ArenaTheme;
  private sky: THREE.ShaderMaterial;
  private ambient: THREE.Points;
  private ambientVel: Float32Array;
  private disposeFns: (() => void)[] = [];

  constructor(private stage: Stage, theme: ArenaTheme) {
    this.theme = theme;
    const scene = stage.scene;
    scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity);
    scene.background = new THREE.Color(theme.fog);

    // sky dome
    this.sky = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(theme.skyTop) },
        horizon: { value: new THREE.Color(theme.skyHorizon) },
        bottom: { value: new THREE.Color(theme.skyBottom) },
        sunColor: { value: new THREE.Color(theme.sunColor) },
        sunDir: { value: new THREE.Vector3(...theme.sunDir).normalize() },
        time: { value: 0 },
        clouds: { value: theme.clouds },
        cloudColor: { value: new THREE.Color(theme.cloudColor) },
        stars: { value: theme.stars ? 1 : 0 },
      },
      vertexShader: SKY_VS,
      fragmentShader: SKY_FS,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), this.sky);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.group.add(sky);

    // lights
    const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.hemiIntensity);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity);
    sun.position.set(theme.sunDir[0] * 30, Math.max(8, theme.sunDir[1] * 30), theme.sunDir[2] * 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -22;
    sc.right = 22;
    sc.top = 22;
    sc.bottom = -22;
    sc.near = 1;
    sc.far = 90;
    sun.shadow.bias = -0.0005;
    this.group.add(sun);

    // ground
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(260, 64),
      new THREE.MeshStandardMaterial({ map: groundTexture(theme), roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // painted battle field lines
    const lines = new THREE.Mesh(
      new THREE.RingGeometry(7.6, 7.8, 96),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    lines.rotation.x = -Math.PI / 2;
    lines.position.y = 0.02;
    this.group.add(lines);

    this.playerPlatform = new Platform(theme, 2.0);
    this.playerPlatform.group.position.copy(PLAYER_POS).setY(0);
    this.enemyPlatform = new Platform(theme, 2.0);
    this.enemyPlatform.group.position.copy(ENEMY_POS).setY(0);
    this.group.add(this.playerPlatform.group, this.enemyPlatform.group);

    this.buildProps(theme);
    this.buildMountains(theme);
    const amb = this.buildAmbient(theme);
    this.ambient = amb.points;
    this.ambientVel = amb.vel;
    this.group.add(this.ambient);

    scene.add(this.group);
    this.disposeFns.push(stage.onUpdate((dt, t) => this.update(dt, t)));
  }

  /** Height of the platform top — sprites stand here. */
  static readonly FLOOR = 0.35;

  private buildProps(theme: ArenaTheme) {
    let seed = 99;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const count = 90;
    const dummy = new THREE.Object3D();
    const place = (i: number) => {
      const a = rnd() * Math.PI * 2;
      // keep the camera side (+x -z quadrant towards camera) open
      const r = 13 + rnd() * 38;
      dummy.position.set(Math.cos(a) * r, 0, Math.sin(a) * r - 4);
      if (dummy.position.x < -2 && dummy.position.z > 4) dummy.position.multiplyScalar(2.2);
      dummy.rotation.set(0, rnd() * 6, 0);
      const s = 0.8 + rnd() * 1.6;
      dummy.scale.set(s, s * (0.8 + rnd() * 0.6), s);
      dummy.updateMatrix();
      return i;
    };
    const mat1 = new THREE.MeshStandardMaterial({ color: theme.propColor, roughness: 0.85, flatShading: true });
    const mat2 = new THREE.MeshStandardMaterial({ color: theme.propColor2, roughness: 0.85, flatShading: true });
    let geoA: THREE.BufferGeometry;
    let geoB: THREE.BufferGeometry | null = null;
    if (theme.props === 'trees' || theme.props === 'pines') {
      geoA = new THREE.ConeGeometry(1.1, 3.2, 7);
      geoA.translate(0, 2.6, 0);
      geoB = new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6);
      geoB.translate(0, 0.6, 0);
      mat2.color.set(theme.props === 'pines' ? 0x5a4636 : 0x6a4a30);
    } else if (theme.props === 'rocks') {
      geoA = new THREE.DodecahedronGeometry(1, 0);
      geoA.translate(0, 0.4, 0);
    } else {
      geoA = new THREE.OctahedronGeometry(0.8, 0);
      geoA.scale(0.6, 2.2, 0.6);
      geoA.translate(0, 1.4, 0);
      mat1.emissive = new THREE.Color(theme.propColor);
      mat1.emissiveIntensity = 0.9;
      mat1.transparent = true;
      mat1.opacity = 0.9;
    }
    const instA = new THREE.InstancedMesh(geoA, mat1, count);
    const instB = geoB ? new THREE.InstancedMesh(geoB, mat2, count) : null;
    for (let i = 0; i < count; i++) {
      place(i);
      instA.setMatrixAt(i, dummy.matrix);
      instB?.setMatrixAt(i, dummy.matrix);
    }
    instA.castShadow = true;
    instA.receiveShadow = true;
    this.group.add(instA);
    if (instB) {
      instB.castShadow = true;
      this.group.add(instB);
    }
    if (theme.props === 'crystals') {
      const glow = new THREE.PointLight(theme.propColor2, 8, 30, 1.6);
      glow.position.set(-8, 3, -10);
      this.group.add(glow);
    }
  }

  private buildMountains(theme: ArenaTheme) {
    const mat = new THREE.MeshStandardMaterial({ color: theme.mountain, roughness: 1, flatShading: true });
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + rnd() * 0.2;
      const r = 120 + rnd() * 60;
      const h = 22 + rnd() * 40;
      const m = new THREE.Mesh(new THREE.ConeGeometry(18 + rnd() * 20, h, 5 + Math.floor(rnd() * 3)), mat);
      m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
      m.rotation.y = rnd() * 3;
      this.group.add(m);
    }
  }

  private buildAmbient(theme: ArenaTheme) {
    const n = theme.ambient === 'snow' ? 700 : 260;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = Math.random() * 12;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
      vel[i * 3] = (Math.random() - 0.5) * 0.3;
      vel[i * 3 + 1] = theme.ambient === 'snow' ? -0.6 - Math.random() * 0.6 : theme.ambient === 'embers' ? 0.4 + Math.random() * 0.8 : (Math.random() - 0.5) * 0.2;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const color = { pollen: 0xfff6b0, embers: 0xff8a3c, fireflies: 0xb8ff7a, snow: 0xffffff }[theme.ambient];
    const size = { pollen: 0.09, embers: 0.1, fireflies: 0.14, snow: 0.08 }[theme.ambient];
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(color).multiplyScalar(theme.ambient === 'snow' ? 1 : 2.2),
      size,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: theme.ambient === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending,
      map: dotTexture(),
    });
    return { points: new THREE.Points(geo, mat), vel };
  }

  update(dt: number, t: number) {
    this.sky.uniforms.time.value = t;
    this.playerPlatform.update(dt, t);
    this.enemyPlatform.update(dt, t);
    const attr = this.ambient.geometry.getAttribute('position') as THREE.BufferAttribute;
    const p = attr.array as Float32Array;
    const v = this.ambientVel;
    for (let i = 0; i < p.length; i += 3) {
      p[i] += (v[i] + Math.sin(t * 0.7 + i) * 0.15) * dt;
      p[i + 1] += v[i + 1] * dt;
      p[i + 2] += (v[i + 2] + Math.cos(t * 0.5 + i) * 0.15) * dt;
      if (p[i + 1] < 0) p[i + 1] = 12;
      if (p[i + 1] > 12) p[i + 1] = 0;
    }
    attr.needsUpdate = true;
  }

  dispose() {
    this.disposeFns.forEach((f) => f());
    this.stage.scene.remove(this.group);
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }
}

let _dot: THREE.Texture | null = null;
export function dotTexture(): THREE.Texture {
  if (_dot) return _dot;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _dot = new THREE.CanvasTexture(c);
  return _dot;
}
