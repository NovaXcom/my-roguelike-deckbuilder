import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Prop, StageDef } from '../brawl/stages';
import { Enemy, World } from '../brawl/World';
import { Effects, Particles } from './Fx';
import { Look, Rig } from './Rig';
import { asphalt, concrete, facade, laneMarking, plazaTiles, posterTexture, sidewalk, signTexture } from './Textures';

interface Aabb { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }

interface LookDef {
  skyTop: number; skyHor: number; skyBot: number; fog: number; fogD: number;
  hemiSky: number; hemiGround: number; hemiI: number; sun: number; sunI: number; sunDir: [number, number, number];
  lit: number; exposure: number; bloom: number; lamp: number; lampI: number; rain: boolean; ceiling: boolean;
}

const LOOKS: Record<string, LookDef> = {
  alley: { skyTop: 0x0a0f20, skyHor: 0x2b3555, skyBot: 0x10131c, fog: 0x161c2c, fogD: 0.03, hemiSky: 0x6a7aaa, hemiGround: 0x20222c, hemiI: 0.75, sun: 0x9fb4ff, sunI: 1.2, sunDir: [-0.4, 1, 0.3], lit: 0.4, exposure: 1.15, bloom: 0.4, lamp: 0xffb070, lampI: 38, rain: true, ceiling: false },
  street: { skyTop: 0x34467f, skyHor: 0xff9658, skyBot: 0x6a4a50, fog: 0xb98466, fogD: 0.011, hemiSky: 0xa8b4e0, hemiGround: 0x5a4038, hemiI: 0.8, sun: 0xffb070, sunI: 2.6, sunDir: [0.85, 0.5, 0.25], lit: 0.5, exposure: 1.05, bloom: 0.3, lamp: 0xffd090, lampI: 50, rain: false, ceiling: false },
  garage: { skyTop: 0x050608, skyHor: 0x0c0e14, skyBot: 0x05060a, fog: 0x0a0c12, fogD: 0.026, hemiSky: 0x8a96b0, hemiGround: 0x2a2c30, hemiI: 0.9, sun: 0xc8d4ff, sunI: 0.2, sunDir: [0, 1, 0], lit: 0.3, exposure: 1.2, bloom: 0.35, lamp: 0xe8f0ff, lampI: 60, rain: false, ceiling: true },
  plaza: { skyTop: 0x4a8fd8, skyHor: 0xf2e2c4, skyBot: 0xb8c0c8, fog: 0xd9d4c4, fogD: 0.006, hemiSky: 0xcfe0ff, hemiGround: 0x7a6e5e, hemiI: 0.85, sun: 0xfff0d0, sunI: 3.0, sunDir: [0.45, 0.9, 0.3], lit: 0.12, exposure: 1.0, bloom: 0.12, lamp: 0xffe0b0, lampI: 20, rain: false, ceiling: false },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 }, aberr: { value: 0.0006 }, vig: { value: 0.38 }, sat: { value: 1.08 }, contrast: { value: 1.07 }, grain: { value: 0.03 },
    tint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float aberr; uniform float vig; uniform float sat; uniform float contrast; uniform float grain; uniform vec3 tint; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float d = length(c); vec2 off = c * aberr * (0.4 + d * 2.0);
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, sat);
      col = (col - 0.5) * contrast + 0.5;
      col *= tint;
      col *= 1.0 - vig * smoothstep(0.3, 0.95, d * 1.3);
      col += (rnd(vUv * vec2(1920.0, 1080.0) + time) - 0.5) * grain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function mergeBoxes(list: { box: Aabb; sx?: number }[], uvScale: number): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const quad = (p: number[][], n: number[], uvs: number[][]) => {
    for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...p[i]); nor.push(...n); uv.push(...uvs[i]); }
  };
  const s = uvScale;
  for (const { box: b } of list) {
    const { minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z1 } = b;
    quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], [[x0 * s, z1 * s], [x1 * s, z1 * s], [x1 * s, z0 * s], [x0 * s, z0 * s]]);
    quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[x0 * s, y0 * s], [x1 * s, y0 * s], [x1 * s, y1 * s], [x0 * s, y1 * s]]);
    quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [[x1 * s, y0 * s], [x0 * s, y0 * s], [x0 * s, y1 * s], [x1 * s, y1 * s]]);
    quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[z1 * s, y0 * s], [z0 * s, y0 * s], [z0 * s, y1 * s], [z1 * s, y1 * s]]);
    quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[z0 * s, y0 * s], [z1 * s, y0 * s], [z1 * s, y1 * s], [z0 * s, y1 * s]]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function segBlocked(boxes: Aabb[], ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const d = [bx - ax, by - ay, bz - az];
  for (const b of boxes) {
    let t0 = 0, t1 = 1, hit = true;
    const o = [ax, ay, az], lo = [b.minX, b.minY, b.minZ], hi = [b.maxX, b.maxY, b.maxZ];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo[i] || o[i] > hi[i]) { hit = false; break; } }
      else {
        let ta = (lo[i] - o[i]) / d[i], tb = (hi[i] - o[i]) / d[i];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) { hit = false; break; }
      }
    }
    if (hit) return true;
  }
  return false;
}

function boxIn(add: (o: THREE.Object3D) => THREE.Object3D, b: Aabb, m: THREE.Material, shadow: boolean, receive: boolean): THREE.Mesh {
  const pm = m.userData.perMeter as number | undefined;
  let mesh: THREE.Mesh;
  if (pm) mesh = new THREE.Mesh(mergeBoxes([{ box: b }], pm), m);
  else {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ), m);
    mesh.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
  }
  mesh.castShadow = shadow;
  mesh.receiveShadow = receive;
  mesh.frustumCulled = false;
  add(mesh);
  return mesh;
}

const PALETTES = {
  skin: [0xe0b08c, 0xc58c64, 0x8d5a3c, 0xf0c8a0, 0x6f452d],
  hair: [0x1b1512, 0x3a2a1e, 0x6b4a2a, 0x111111, 0x8a8a8a],
  tops: [0x8a8f98, 0x3d5a80, 0x7a2f2f, 0x2f6b4f, 0xb0a070, 0x555555],
  pants: [0x2a3447, 0x1c1c22, 0x3b3a30, 0x40454f],
};

function lookFor(kind: string, id: number): Look {
  const pick = <T,>(a: T[], k: number) => a[Math.floor(hash(id * 7 + k) * a.length)];
  switch (kind) {
    case 'player': return { skin: 0xe0b08c, hair: 0x1b1512, top: 0x1d2027, sleeves: true, pants: 0x2d3442, shoes: 0x15151a, scale: 1, bulk: 1, hairStyle: 'short', scarf: 0xd9402a };
    case 'knife': return { skin: pick(PALETTES.skin, 1), hair: 0x111111, top: 0x1b1b20, sleeves: true, pants: 0x14141a, shoes: 0x0e0e10, scale: 0.98, bulk: 0.92, hairStyle: 'hood' };
    case 'bat': return { skin: pick(PALETTES.skin, 1), hair: pick(PALETTES.hair, 2), top: 0x4a3426, sleeves: true, pants: 0x2a3447, shoes: 0x2a1c14, scale: 1.04, bulk: 1.1, hairStyle: 'cap' };
    case 'brute': return { skin: pick(PALETTES.skin, 1), hair: 0x000000, top: 0xb8b8b8, sleeves: false, pants: 0x4a5a3a, shoes: 0x1a1a1a, scale: 1.26, bulk: 1.38, hairStyle: 'bald', vest: 0x23242a, tattoo: true };
    case 'shield': return { skin: pick(PALETTES.skin, 1), hair: 0x151515, top: 0x2a3140, sleeves: true, pants: 0x20252e, shoes: 0x0a0a0a, scale: 1.06, bulk: 1.15, hairStyle: 'cap', riot: true, vest: 0x3a4250 };
    case 'assassin': return { skin: pick(PALETTES.skin, 1), hair: 0x111111, top: 0x101216, sleeves: true, pants: 0x101216, shoes: 0x050505, scale: 0.96, bulk: 0.88, hairStyle: 'hood', mask: 0x1a1c22, scarf: 0x8a1a1a };
    case 'gunman': return { skin: pick(PALETTES.skin, 1), hair: 0x151515, top: 0x16161c, sleeves: true, pants: 0x16161c, shoes: 0x050505, scale: 1.02, bulk: 1, hairStyle: 'slick', glasses: true, tie: 0x303038 };
    case 'boss': return { skin: 0xd8b090, hair: 0x9a9a9a, top: 0x15151a, sleeves: true, pants: 0x15151a, shoes: 0x050505, scale: 1.32, bulk: 1.22, hairStyle: 'slick', glasses: true, coat: 0xe8e4dc, tie: 0x8a1a1a };
    default: return { skin: pick(PALETTES.skin, 1), hair: pick(PALETTES.hair, 2), top: pick(PALETTES.tops, 3), sleeves: hash(id * 3) < 0.5, pants: pick(PALETTES.pants, 4), shoes: 0x1a1a1c, scale: 0.97 + hash(id) * 0.08, bulk: 0.95 + hash(id + 5) * 0.15, hairStyle: hash(id * 9) < 0.3 ? 'bald' : hash(id * 9) < 0.6 ? 'short' : 'cap' };
  }
}

const ICON_COLOR = { blue: 0x2f80ff, red: 0xff2a2a, yellow: 0xffd000 } as const;

export class CityView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.25, 600);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private smaa: SMAAPass;
  private grade: ShaderPass;
  private propGroups = new Map<number, THREE.Group>();
  private decals: THREE.Mesh[] = [];
  private cones: THREE.Mesh[] = [];
  private steam: { x: number; z: number }[] = [];
  private steamT = 0;
  /** Extra chromatic aberration from big hits (decays on its own). */
  aberr = 0;
  /** Just-dodge slow motion look. */
  witch = false;
  private witchK = 0;
  private ghosts: { obj: THREE.Object3D; mat: THREE.MeshBasicMaterial; life: number; max: number }[] = [];
  readonly fx: Effects;
  readonly particles: Particles;
  private stageGroup = new THREE.Group();
  private rigs = new Map<number, Rig>();
  private playerRig: Rig;
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
  private sun = new THREE.DirectionalLight(0xffffff, 2);
  private skyMat: THREE.ShaderMaterial;
  private sky: THREE.Mesh;
  private bullets: THREE.InstancedMesh;
  private pickupMeshes = new Map<object, THREE.Object3D>();
  private blockers: Aabb[] = [];
  private lampLights: THREE.PointLight[] = [];
  private rain: THREE.LineSegments | null = null;
  private rainPos!: Float32Array;
  private look: LookDef = LOOKS.street;
  private dummy = new THREE.Object3D();
  private focus = new THREE.Vector3();
  private focusInit = false;
  bloomOn = true;
  private pixelRatio = 1;
  shake = 0;
  fovKick = 0;
  private fovBase = 58;
  /** Extra field of view from running fast (set by the game). */
  speedFov = 0;
  private ceilY = 99;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';

    this.scene.fog = new THREE.FogExp2(0x888888, 0.01);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.08;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.stageGroup);

    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(hor, top, pow(clamp(h,0.0,1.0), 0.5)) : mix(hor, bot, pow(clamp(-h,0.0,1.0), 0.4)); gl_FragColor = vec4(c, 1.0); }',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.6, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.fx = new Effects(this.scene);
    this.particles = new Particles(this.scene);

    this.bullets = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 64);
    this.bullets.frustumCulled = false;
    this.bullets.count = 0;
    this.bullets.setColorAt(0, new THREE.Color(1, 1, 1));
    this.scene.add(this.bullets);

    this.playerRig = new Rig(lookFor('player', 0));
    this.scene.add(this.playerRig.root);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setQuality(q: 'high' | 'low'): void {
    this.bloomOn = q === 'high';
    this.pixelRatio = q === 'high' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
    this.particles.density = q === 'high' ? 1 : 0.4;
    this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    (this.sun.shadow as { map: unknown }).map = null;
    this.resize();
  }

  // ------------------------------------------------------------------ stage

  private clearStage(): void {
    for (const ch of [...this.stageGroup.children]) {
      this.stageGroup.remove(ch);
      ch.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
      });
    }
    for (const l of this.lampLights) this.scene.remove(l);
    this.lampLights.length = 0;
    this.blockers.length = 0;
    this.propGroups.clear();
    this.decals.length = 0;
    this.cones.length = 0;
    this.steam.length = 0;
    if (this.rain) { this.scene.remove(this.rain); this.rain = null; }
    for (const [, o] of this.pickupMeshes) this.scene.remove(o);
    this.pickupMeshes.clear();
    this.ceilY = 99;
  }

  buildStage(stage: StageDef): void {
    this.clearStage();
    const L = (this.look = LOOKS[stage.look]);
    const u = this.skyMat.uniforms;
    u.top.value.set(L.skyTop); u.hor.value.set(L.skyHor); u.bot.value.set(L.skyBot);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.set(L.fog); fog.density = L.fogD;
    this.hemi.color.set(L.hemiSky); this.hemi.groundColor.set(L.hemiGround); this.hemi.intensity = L.hemiI;
    this.sun.color.set(L.sun); this.sun.intensity = L.sunI;
    this.renderer.toneMappingExposure = L.exposure;
    this.bloom.strength = L.bloom;

    const W = stage.w, D = stage.d;
    const sw = stage.look === 'alley' || stage.look === 'garage' ? 0 : 2.4;
    const mats = {
      asphalt: this.tiled(asphalt(), 0.16, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: stage.look === 'alley' ? 0.32 : 0.82, metalness: stage.look === 'alley' ? 0.25 : 0 })),
    };
    const add = (o: THREE.Object3D) => { this.stageGroup.add(o); return o; };
    const box = (b: Aabb, m: THREE.Material, shadow = true, receive = true) => boxIn(add, b, m, shadow, receive);
    const X0 = -W / 2 - 70, X1 = W / 2 + 70;

    // ground
    const groundTex = stage.look === 'plaza' ? plazaTiles() : stage.look === 'garage' ? concrete('#7d8085') : asphalt();
    const groundMat = this.tiled(groundTex, stage.look === 'plaza' ? 0.2 : stage.look === 'garage' ? 0.25 : 0.16, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: stage.look === 'alley' ? 0.5 : 0.85, metalness: stage.look === 'alley' ? 0.08 : 0 }));
    void mats;
    box({ minX: X0, maxX: X1, minY: -1, maxY: 0, minZ: -D / 2 + sw, maxZ: D / 2 - sw }, groundMat, false, true);
    if (sw > 0) {
      const walkMat = this.tiled(stage.look === 'plaza' ? plazaTiles() : sidewalk(), 0.3, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
      for (const s of [-1, 1]) {
        box({ minX: X0, maxX: X1, minY: -1, maxY: 0.16, minZ: s > 0 ? D / 2 - sw : -D / 2 - 16, maxZ: s > 0 ? D / 2 + 16 : -D / 2 + sw }, walkMat, false, true);
        box({ minX: X0, maxX: X1, minY: 0, maxY: 0.18, minZ: s * (D / 2 - sw) - 0.07 * s - (s > 0 ? 0.07 : -0.0), maxZ: s * (D / 2 - sw) + 0.07 * s + (s > 0 ? 0 : 0.07) }, new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.8 }), false, true);
      }
    } else {
      for (const s of [-1, 1]) box({ minX: X0, maxX: X1, minY: -1, maxY: 0.02, minZ: s > 0 ? D / 2 - 0.01 : -D / 2 - 16, maxZ: s > 0 ? D / 2 + 16 : -D / 2 + 0.01 }, groundMat, false, true);
    }
    if (stage.look === 'street') {
      const lane = laneMarking().clone();
      lane.needsUpdate = true;
      lane.repeat.set((X1 - X0) / 8, 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: lane, transparent: true, roughness: 0.9, depthWrite: false }));
      m.position.y = 0.04;
      (m.material as THREE.MeshStandardMaterial).polygonOffset = true;
      (m.material as THREE.MeshStandardMaterial).polygonOffsetFactor = -4;
      m.receiveShadow = true;
      add(m);
    }
    if (stage.look === 'garage') this.buildGarage(stage, add, box);

    // building walls on both sides
    this.buildBuildings(stage, add, box);

    // props
    stage.props.forEach((p, i) => this.buildProp(p, i, add));
    // lamps' lights
    stage.props.filter((p) => p.kind === 'lamp').slice(0, 4).forEach((p) => {
      const l = new THREE.PointLight(L.lamp, L.lampI, 26, 1.6);
      l.position.set(p.x, 4.6, p.z);
      this.scene.add(l);
      this.lampLights.push(l);
    });
    if (stage.look === 'garage') {
      for (let i = 0; i < 4; i++) {
        const l = new THREE.PointLight(0xdfeaff, 38, 24, 1.5);
        l.position.set(-W / 2 + 6 + i * (W / 3.4), 3.6, (i % 2 ? 1 : -1) * 3);
        this.scene.add(l);
        this.lampLights.push(l);
      }
    }
    this.buildDecor(stage, add);
    if (L.rain) this.buildRain();
    this.focusInit = false;
  }

  private tiled(tex: THREE.CanvasTexture, perMeter: number, m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    // geometry UVs of BoxGeometry run 0..1 per face, so repeat is set to the face's metre size by the caller via scale; keep a world-scaled clone
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(1, 1);
    m.map = t;
    m.bumpMap = t;
    m.bumpScale = 0.9;
    m.userData.perMeter = perMeter;
    // BoxGeometry UVs: rescale to metres on first use
    return m;
  }

  private buildGarage(stage: StageDef, add: (o: THREE.Object3D) => THREE.Object3D, box: (b: Aabb, m: THREE.Material, s?: boolean, r?: boolean) => THREE.Mesh): void {
    const W = stage.w, D = stage.d;
    const ceil = new THREE.MeshStandardMaterial({ color: 0x5a5d62, roughness: 0.95 });
    this.ceilY = 4.4;
    const cb = { minX: -W / 2 - 40, maxX: W / 2 + 40, minY: 4.4, maxY: 6, minZ: -D / 2 - 2, maxZ: D / 2 + 2 };
    box(cb, ceil, false, true);
    this.blockers.push(cb);
    // light strips
    const strip = new THREE.MeshBasicMaterial({ color: 0xeaf4ff, toneMapped: false });
    for (let x = -W / 2 - 20; x < W / 2 + 20; x += 6) for (const z of [-4.5, 4.5]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.3), strip);
      m.position.set(x, 4.36, z);
      add(m);
    }
    // parking lines
    const line = new THREE.MeshBasicMaterial({ color: 0xd8d8c0 });
    for (const z of [-D / 2 + 3.4, D / 2 - 3.4]) for (let x = -W / 2; x < W / 2; x += 2.9) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 4.6).rotateX(-Math.PI / 2), line);
      m.position.set(x, 0.015, z + (z < 0 ? 1.1 : -1.1));
      add(m);
    }
    // walls along the sides
    const wallMat = this.tiled(concrete('#6f7378'), 0.2, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }));
    for (const s of [-1, 1]) {
      const wb = { minX: -W / 2 - 60, maxX: W / 2 + 60, minY: 0, maxY: 4.4, minZ: s > 0 ? D / 2 : -D / 2 - 1, maxZ: s > 0 ? D / 2 + 1 : -D / 2 };
      box(wb, wallMat, true, true);
      this.blockers.push(wb);
      // yellow-black kerb stripes
      const kb = new THREE.Mesh(new THREE.BoxGeometry(W + 120, 0.5, 0.1), new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.8 }));
      kb.position.set(0, 0.25, s * (D / 2 - 0.05));
      add(kb);
    }
  }

  private buildBuildings(stage: StageDef, add: (o: THREE.Object3D) => THREE.Object3D, box: (b: Aabb, m: THREE.Material, s?: boolean, r?: boolean) => THREE.Mesh): void {
    const W = stage.w, D = stage.d;
    const L = this.look;
    const variants: { box: Aabb }[][] = [[], [], [], []];
    const kinds = stage.look === 'alley' ? ['brick', 'brick', 'concrete', 'brick'] : stage.look === 'plaza' ? ['glass', 'concrete', 'brick', 'glass'] : stage.look === 'garage' ? ['concrete', 'concrete', 'concrete', 'concrete'] : ['brick', 'concrete', 'glass', 'brick'];
    let seed = stage.id * 97 + 13;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const frontZ = stage.look === 'garage' ? D / 2 + 1 : D / 2 + (stage.look === 'alley' ? 0 : 0.2);
    for (const s of [-1, 1]) {
      let x = -W / 2 - 70;
      while (x < W / 2 + 70) {
        const w = 8 + rnd() * 7;
        const h = stage.look === 'garage' ? 8 : stage.look === 'alley' ? 18 + rnd() * 16 : stage.look === 'plaza' ? 14 + rnd() * 26 : 12 + rnd() * 24;
        const depth = 14;
        const z0 = s > 0 ? frontZ : -frontZ - depth;
        const b: Aabb = { minX: x, maxX: x + w, minY: 0, maxY: h, minZ: z0, maxZ: z0 + depth };
        variants[Math.floor(rnd() * 4)].push({ box: b });
        if (x > -W / 2 - 10 && x < W / 2 + 10) this.blockers.push(b);
        x += w + (stage.look === 'alley' ? 0 : rnd() < 0.15 ? 2 : 0);
      }
      // second, taller row far behind for the skyline
      let x2 = -W / 2 - 80;
      while (x2 < W / 2 + 80) {
        const w = 14 + rnd() * 16, h = 30 + rnd() * 50;
        const z0 = s > 0 ? frontZ + 26 : -frontZ - 26 - 16;
        variants[Math.floor(rnd() * 4)].push({ box: { minX: x2, maxX: x2 + w, minY: 0, maxY: h, minZ: z0, maxZ: z0 + 16 } });
        x2 += w + 3;
      }
    }
    // end caps so the street never opens onto the void
    for (const s of [-1, 1]) variants[1].push({ box: { minX: s > 0 ? W / 2 + 62 : -W / 2 - 80, maxX: s > 0 ? W / 2 + 80 : -W / 2 - 62, minY: 0, maxY: 40, minZ: -D / 2 - 30, maxZ: D / 2 + 30 } });
    variants.forEach((list, i) => {
      if (!list.length) return;
      const f = facade(kinds[i] as 'brick' | 'concrete' | 'glass', L.lit, i + stage.id * 4);
      const mat = new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: stage.look === 'plaza' ? 0.15 : 1.1, roughness: 0.85, metalness: 0.05, bumpMap: f.map, bumpScale: 1.6 });
      const mesh = new THREE.Mesh(mergeBoxes(list, 1 / 8), mat);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      add(mesh);
    });
    // shopfronts, signs and details along the near building line
    if (stage.look === 'street' || stage.look === 'plaza' || stage.look === 'alley') this.buildShops(stage, add, rnd);
    void box;
  }

  private buildShops(stage: StageDef, add: (o: THREE.Object3D) => THREE.Object3D, rnd: () => number): void {
    const W = stage.w, D = stage.d;
    const names = stage.look === 'alley' ? ['BAR', '24H', 'CLUB', 'HOTEL'] : ['RAMEN', '薬局', 'CAFE', '居酒屋', 'BOOKS', 'PIZZA', '24H', '質屋', 'NOODLE', 'BAR'];
    const colors = [['#b3261e', '#fff3e0'], ['#1f4e8c', '#ffffff'], ['#2e6b3a', '#f2f2d0'], ['#222222', '#ffcf40'], ['#6b2a7a', '#ffe6ff']];
    const glass = new THREE.MeshStandardMaterial({ color: 0x1a222c, roughness: 0.1, metalness: 0.6, emissive: stage.look === 'plaza' ? 0x000000 : 0xffc88a, emissiveIntensity: stage.look === 'plaza' ? 0 : 0.35 });
    for (const s of [-1, 1]) {
      const face = s * (D / 2 + (stage.look === 'alley' ? 0.02 : 0.2));
      let x = -W / 2 - 20;
      while (x < W / 2 + 20) {
        const w = 5 + rnd() * 4;
        if (rnd() < 0.8) {
          const [bg, fg] = colors[Math.floor(rnd() * colors.length)];
          const name = names[Math.floor(rnd() * names.length)];
          const front = new THREE.Mesh(new THREE.BoxGeometry(w - 0.6, 2.6, 0.12), glass);
          front.position.set(x + w / 2, 1.5, face - s * 0.02);
          add(front);
          const awning = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.1, 1.2), new THREE.MeshStandardMaterial({ color: new THREE.Color(bg), roughness: 0.9 }));
          awning.position.set(x + w / 2, 3.1, face - s * 0.6);
          awning.rotation.x = s * 0.18;
          awning.castShadow = true;
          add(awning);
          const tex = signTexture(name, bg, fg);
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 0.8, 3.6), 0.9), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: stage.look === 'plaza' ? 0.25 : 0.9, roughness: 0.6 }));
          sign.position.set(x + w / 2, 4.0, face - s * 0.12);
          sign.rotation.y = s > 0 ? Math.PI : 0;
          add(sign);
        } else {
          const shutter = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 2.8, 0.1), new THREE.MeshStandardMaterial({ color: 0x6a6e74, roughness: 0.6, metalness: 0.5 }));
          shutter.position.set(x + w / 2, 1.5, face - s * 0.02);
          add(shutter);
          const pt = posterTexture(Math.floor(rnd() * 4));
          const poster = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.5), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.9 }));
          poster.position.set(x + w / 2 + (rnd() - 0.5) * 2, 1.6, face - s * 0.1);
          poster.rotation.y = s > 0 ? Math.PI : 0;
          add(poster);
        }
        x += w;
      }
    }
  }

  private buildDecor(stage: StageDef, add: (o: THREE.Object3D) => THREE.Object3D): void {
    const W = stage.w, D = stage.d;
    let seed = stage.id * 31 + 5;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const std = (c: number, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const wallZ = (s: number) => s * (D / 2 + (stage.look === 'garage' ? 0.1 : 0.05));
    // ---- wall furniture: AC units, pipes, fire escapes, cables
    if (stage.look !== 'garage') {
      for (const s of [-1, 1]) {
        for (let x = -W / 2 - 18; x < W / 2 + 18; x += 5 + rnd() * 6) {
          const r = rnd();
          const z = wallZ(s) + s * 0.02;
          if (r < 0.35) {
            const ac = new THREE.Group();
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.55), std(0xc8ccd0, 0.6, 0.3));
            const grill = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.06, 14), std(0x30343a, 0.5, 0.5));
            grill.rotation.x = Math.PI / 2;
            grill.position.set(0, 0, -s * 0.29);
            ac.add(body, grill);
            ac.position.set(x, 5 + rnd() * 6, z + s * 0.3);
            ac.traverse((o) => { o.castShadow = true; });
            add(ac);
          } else if (r < 0.6) {
            const h = 8 + rnd() * 12;
            const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, h, 10), std(0x5a4a40, 0.6, 0.5));
            pipe.position.set(x, h / 2, z + s * 0.14);
            pipe.castShadow = true;
            add(pipe);
            for (let y = 1.5; y < h; y += 2.6) {
              const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 10), std(0x2a2a2e, 0.5, 0.6));
              clamp.position.set(x, y, z + s * 0.14);
              add(clamp);
            }
          } else if (r < 0.78 && stage.look !== 'plaza') {
            // fire escape: platforms + railing + ladder
            const fe = new THREE.Group();
            for (let level = 0; level < 3; level++) {
              const y = 4 + level * 3.2;
              const plat = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.1), std(0x3a3d44, 0.5, 0.6));
              plat.position.set(0, y, s * 0.55);
              const rail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.04), std(0x2a2d33, 0.5, 0.6));
              rail.position.set(0, y + 0.5, s * 1.08);
              fe.add(plat, rail);
              const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.1, 0.05), std(0x2a2d33, 0.6, 0.6));
              ladder.position.set(0.8, y + 1.5, s * 0.6);
              fe.add(ladder);
            }
            fe.position.set(x, 0, z);
            fe.traverse((o) => { o.castShadow = true; });
            add(fe);
          }
        }
      }
    }
    // ---- street furniture along the kerbs: trash piles, boxes, bags
    const piles = stage.look === 'alley' ? 9 : stage.look === 'garage' ? 3 : 5;
    for (let i = 0; i < piles; i++) {
      const s = rnd() < 0.5 ? -1 : 1;
      const x = (rnd() - 0.5) * W * 0.92;
      const z = s * (D / 2 - 0.6 - rnd() * 0.5);
      const clash = stage.props.some((q) => q.solid !== false && Math.abs(q.x - x) < q.hw + 1.4 && Math.abs(q.z - z) < q.hd + 1.0);
      if (clash) continue;
      const g = new THREE.Group();
      for (let k = 0; k < 3 + Math.floor(rnd() * 3); k++) {
        const bag = new THREE.Mesh(new THREE.SphereGeometry(0.28 + rnd() * 0.15, 8, 7), std(rnd() < 0.5 ? 0x1c1c20 : 0x2a3a2a, 0.4));
        bag.scale.y = 0.8;
        bag.position.set((rnd() - 0.5) * 1.0, 0.22, (rnd() - 0.5) * 0.7);
        bag.castShadow = true;
        g.add(bag);
      }
      if (rnd() < 0.6) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.5), std(0x9a7a50, 0.9));
        box.position.set((rnd() - 0.5) * 0.8, 0.25, (rnd() - 0.5) * 0.6);
        box.rotation.y = rnd() * 3;
        box.castShadow = true;
        g.add(box);
      }
      g.position.set(x, 0, z);
      add(g);
    }
    // ---- ground detail: puddles that mirror the light, graffiti, manholes
    if (stage.look !== 'garage' && stage.look !== 'plaza') {
      const wet = stage.look === 'alley';
      const n = wet ? 10 : 4;
      for (let i = 0; i < n; i++) {
        const r = 0.7 + rnd() * 1.4;
        const puddle = new THREE.Mesh(new THREE.CircleGeometry(r, 18).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.04, metalness: 0.9, emissive: wet ? 0x2a2014 : 0x201408, emissiveIntensity: 0.7, transparent: true, opacity: 0.5 }));
        puddle.scale.set(1.4, 1, 0.8 + rnd() * 0.5);
        puddle.position.set((rnd() - 0.5) * W * 0.9, 0.02, (rnd() - 0.5) * (D - 5));
        puddle.receiveShadow = true;
        add(puddle);
        this.decals.push(puddle);
      }
      for (let i = 0; i < 2; i++) {
        const mx = (rnd() - 0.5) * W * 0.7, mz = (rnd() - 0.5) * (D - 6);
        const man = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 18), std(0x2a2c30, 0.5, 0.7));
        man.position.set(mx, 0.025, mz);
        add(man);
        this.steam.push({ x: mx, z: mz });
      }
    }
    // ---- traffic light / overhead wires on street levels
    if (stage.look === 'street' || stage.look === 'plaza') {
      const wireMat = new THREE.LineBasicMaterial({ color: 0x15171c });
      for (let x = -W / 2 - 20; x < W / 2 + 20; x += 13) {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 12; k++) {
          const t = k / 12;
          pts.push(new THREE.Vector3(x + (rnd() - 0.5) * 0.2, 7.2 - Math.sin(t * Math.PI) * 0.7, -D / 2 - 1 + t * (D + 2)));
        }
        add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
      }
    }
    if (stage.look === 'street') {
      // traffic lights at the far ends
      for (const x of [-W / 2 + 3, W / 2 - 3]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.2, 8), std(0x2a2d33, 0.5, 0.6));
        pole.position.set(x, 2.6, D / 2 - 2.4);
        pole.castShadow = true;
        add(pole);
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.0, 0.3), std(0x15171a, 0.5));
        head.position.set(x, 5.0, D / 2 - 2.4);
        add(head);
        for (const [i, c] of [[0.3, 0xff2010], [0, 0x302000], [-0.3, 0x002010]] as [number, number][]) {
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i === 0.3 ? 2.5 : 0.15 }));
          lamp.position.set(x + 0.18, 5.0 + i, D / 2 - 2.4);
          add(lamp);
        }
      }
    }
    // ---- soft light cones under the lamps
    const coneTex = (() => {
      const cv = document.createElement('canvas'); cv.width = 8; cv.height = 128;
      const g = cv.getContext('2d')!;
      const gr = g.createLinearGradient(0, 0, 0, 128);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 8, 128);
      return new THREE.CanvasTexture(cv);
    })();
    for (const pr of stage.props) {
      if (pr.kind !== 'lamp') continue;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.8, 4.7, 20, 1, true), new THREE.MeshBasicMaterial({ map: coneTex, color: this.look.lamp, transparent: true, opacity: stage.look === 'plaza' ? 0.07 : 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }));
      cone.position.set(pr.x, 2.4, pr.z + (pr.z > 0 ? -1 : 1));
      add(cone);
      this.cones.push(cone);
    }
    if (stage.look === 'garage') {
      for (let x = -W / 2 + 6; x < W / 2; x += 12) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 4.3, 16, 1, true), new THREE.MeshBasicMaterial({ map: coneTex, color: 0xdfeaff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        cone.position.set(x, 2.2, x % 24 === 0 ? 4.5 : -4.5);
        add(cone);
      }
    }
  }

  /** A barrel blew up: hide it and leave a scorch mark. */
  explodeProp(index: number, x: number, z: number): void {
    const g = this.propGroups.get(index);
    if (g) g.visible = false;
    const mark = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.55, depthWrite: false }));
    mark.position.set(x, 0.035, z);
    this.stageGroup.add(mark);
  }

  private buildRain(): void {
    const n = 700;
    this.rainPos = new Float32Array(n * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 50, y = Math.random() * 22, z = (Math.random() - 0.5) * 50;
      this.rainPos.set([x, y, z, x - 0.05, y + 0.7, z], i * 6);
    }
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab8e0, transparent: true, opacity: 0.35 }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  private buildProp(p: Prop, idx: number, add: (o: THREE.Object3D) => THREE.Object3D): void {
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    const std = (c: number, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const B = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    const C = (rt: number, rb: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 14), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    const solid = p.solid !== false;
    if (solid && p.kind !== 'lamp') this.blockers.push({ minX: p.x - p.hw, maxX: p.x + p.hw, minY: 0, maxY: p.kind === 'car' ? 1.6 : 1.4, minZ: p.z - p.hd, maxZ: p.z + p.hd });
    switch (p.kind) {
      case 'car': {
        const paint = std(p.color ?? 0x8a1f1f, 0.35, 0.6);
        const glass = std(0x10151c, 0.1, 0.7);
        const along = p.hw > p.hd;
        const car = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.62, 1.9), paint);
        body.position.y = 0.62; body.castShadow = true; body.receiveShadow = true;
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.56, 1.7), glass);
        cab.position.set(-0.25, 1.18, 0); cab.castShadow = true;
        const roof = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 1.66), paint);
        roof.position.set(-0.25, 1.5, 0);
        car.add(body, cab, roof);
        for (const [x, z] of [[1.4, 0.95], [1.4, -0.95], [-1.4, 0.95], [-1.4, -0.95]]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 14), std(0x0c0c0c, 0.9));
          w.rotation.x = Math.PI / 2; w.position.set(x, 0.36, z); w.castShadow = true;
          car.add(w);
        }
        const hl = new THREE.MeshStandardMaterial({ color: 0xfff3c0, emissive: 0xfff3c0, emissiveIntensity: 1.5 });
        for (const z of [0.65, -0.65]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.3), hl); m.position.set(2.26, 0.7, z); car.add(m); }
        const tl = new THREE.MeshStandardMaterial({ color: 0xaa0000, emissive: 0xaa0000, emissiveIntensity: 0.9 });
        for (const z of [0.7, -0.7]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.3), tl); m.position.set(-2.26, 0.7, z); car.add(m); }
        car.rotation.y = along ? (idx % 2 ? Math.PI : 0) : Math.PI / 2;
        g.add(car);
        break;
      }
      case 'dumpster': {
        B(2.2, 1.1, 1.3, std(0x2e5b3a, 0.7, 0.3), 0, 0.55, 0);
        B(2.3, 0.1, 1.4, std(0x1f3a27, 0.7, 0.3), 0, 1.15, 0);
        break;
      }
      case 'crate': {
        B(p.hw * 2, p.hw * 2, p.hd * 2, std(0x8a6a3c, 0.9), 0, p.hw, 0);
        B(p.hw * 2 + 0.03, 0.08, p.hd * 2 + 0.03, std(0x5a4424, 0.9), 0, p.hw * 1.6, 0);
        break;
      }
      case 'barrier': {
        B(p.hw * 2, 0.9, p.hd * 2, std(0xb0b0aa, 0.9), 0, 0.45, 0);
        B(p.hw * 2 + 0.02, 0.18, p.hd * 2 + 0.02, std(0xd0301c, 0.8), 0, 0.7, 0);
        break;
      }
      case 'lamp': {
        C(0.07, 0.1, 4.8, std(0x2a2d33, 0.5, 0.6), 0, 2.4, 0);
        B(1.1, 0.08, 0.1, std(0x2a2d33, 0.5, 0.6), 0.5 * (p.z > 0 ? -1 : 1) * 0, 4.8, p.z > 0 ? -0.5 : 0.5).rotation.y = Math.PI / 2;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.28), new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffe0a0, emissiveIntensity: 2.4 }));
        head.position.set(0, 4.78, p.z > 0 ? -1 : 1);
        g.add(head);
        break;
      }
      case 'bin': C(0.34, 0.3, 0.95, std(0x3a3f46, 0.6, 0.4), 0, 0.48, 0); break;
      case 'barrel': {
        C(0.42, 0.42, 1.0, std(p.explosive ? 0xb02a1c : 0x234a7a, 0.45, 0.5), 0, 0.5, 0);
        for (const y of [0.2, 0.8]) C(0.435, 0.435, 0.05, std(0x1a1a1a, 0.5, 0.6), 0, y, 0);
        if (p.explosive) {
          const warn = B(0.02, 0.3, 0.3, new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffa000, emissiveIntensity: 0.6 }), 0.42, 0.5, 0);
          warn.rotation.x = Math.PI / 4;
        }
        break;
      }
      case 'bench': {
        B(p.hw * 2, 0.08, p.hd * 2, std(0x7a5a3a, 0.8), 0, 0.5, 0);
        B(p.hw * 2, 0.5, 0.08, std(0x7a5a3a, 0.8), 0, 0.78, -p.hd * 0.8);
        for (const x of [-p.hw * 0.85, p.hw * 0.85]) B(0.08, 0.5, p.hd * 2, std(0x2a2d33, 0.5, 0.6), x, 0.25, 0);
        break;
      }
      case 'vending': {
        B(1.0, 1.9, 0.9, std(0xc02820, 0.5, 0.3), 0, 0.95, 0);
        B(0.7, 1.2, 0.04, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdff0ff, emissiveIntensity: 1.2 }), 0, 1.15, p.z < 0 ? 0.46 : -0.46);
        break;
      }
      case 'pillar': {
        B(p.hw * 2, 4.4, p.hd * 2, new THREE.MeshStandardMaterial({ map: concrete('#8a8d92'), roughness: 0.95 }), 0, 2.2, 0);
        B(p.hw * 2 + 0.02, 0.35, p.hd * 2 + 0.02, std(0xe0b020, 0.8), 0, 0.9, 0);
        break;
      }
      case 'planter': {
        if (p.hw > 2) {
          C(2.3, 2.4, 0.7, std(0xb8b4a8, 0.9), 0, 0.35, 0);
          C(1.9, 1.9, 0.18, std(0x2a6aa8, 0.1, 0.4), 0, 0.62, 0);
          C(0.25, 0.4, 1.5, std(0xb8b4a8, 0.9), 0, 1.2, 0);
          C(1.0, 0.25, 0.1, std(0xb8b4a8, 0.9), 0, 1.9, 0);
        } else {
          B(p.hw * 2, 0.7, p.hd * 2, std(0xb8b4a8, 0.9), 0, 0.35, 0);
          const bush = new THREE.Mesh(new THREE.SphereGeometry(Math.min(p.hw, 1.2), 12, 10), std(0x2f7a3a, 0.9));
          bush.scale.set(1.4, 0.8, 0.9); bush.position.y = 1.0; bush.castShadow = true;
          g.add(bush);
        }
        break;
      }
      case 'stall': {
        B(p.hw * 2, 0.9, p.hd * 2, std(0x6a5a40, 0.9), 0, 0.45, 0);
        for (const [x, z] of [[-p.hw, -p.hd], [p.hw, -p.hd], [-p.hw, p.hd], [p.hw, p.hd]]) B(0.08, 2.3, 0.08, std(0x2a2d33, 0.5, 0.6), x, 1.15, z);
        const aw = B(p.hw * 2 + 0.6, 0.08, p.hd * 2 + 0.6, std(idx % 2 ? 0xc03a2a : 0x2a6a9a, 0.9), 0, 2.35, 0);
        aw.rotation.z = 0.06;
        break;
      }
    }
    this.propGroups.set(idx, g);
    add(g);
  }

  // ------------------------------------------------------------------ per frame

  private rigFor(e: Enemy): Rig {
    let r = this.rigs.get(e.id);
    if (!r) {
      r = new Rig(lookFor(e.kind, e.id));
      r.setWeapon(e.kind === 'bat' ? 'bat' : e.kind === 'knife' || e.kind === 'assassin' ? 'knife' : e.kind === 'gunman' ? 'pistol' : null);
      this.scene.add(r.root);
      this.rigs.set(e.id, r);
    }
    return r;
  }

  sync(world: World, dt: number, time: number, playerHidden: boolean): void {
    const p = world.player;
    const pa = p.state === 'attack' ? p.atk : null;
    this.playerRig.setWeapon(p.weapon === 'gun' ? 'pistol' : p.weapon);
    this.playerRig.root.visible = !playerHidden;
    this.playerRig.update({ state: p.state, anim: p.anim, t: p.t, dur: p.dur, walk: p.walk, facing: p.facing, x: p.x, y: p.y, z: p.z, vy: p.vy, speed: Math.hypot(p.vx, p.vz), atk: pa ? { wind: pa.wind, strike: pa.strike, rec: pa.rec } : null, guardUp: p.state === 'guard' }, dt, time);
    this.playerRig.setGlow(0xffffff, p.flash > 0 ? 0.6 : p.invuln > 0.35 ? 0.15 + Math.sin(time * 40) * 0.1 : 0);

    const seen = new Set<number>();
    for (const e of world.enemies) {
      seen.add(e.id);
      const r = this.rigFor(e);
      const a = e.atk;
      r.update({ state: e.state === 'wind' || e.state === 'strike' || e.state === 'rec' ? e.state : e.state, anim: e.anim, t: e.t, dur: e.dur, walk: e.walk, facing: e.facing, x: e.x, y: e.y, z: e.z, atk: a ? { wind: a.wind, strike: a.strike, rec: a.rec } : null, guardUp: false }, dt, time + e.id);
      let glow = 0, col = 0xffffff;
      if (e.flash > 0) { glow = 0.55; col = 0xffffff; }
      else if (e.state === 'wind' && a) { glow = 0.04 + e.telegraph * 0.18 + Math.sin(time * 30) * 0.03 * e.telegraph; col = ICON_COLOR[a.icon]; }
      r.setGlow(col, glow);
      r.root.visible = !(e.state === 'dead' && e.deadT > 1.9);
      if (e.state === 'dead' && e.deadT > 1.2) r.root.position.y = -(e.deadT - 1.2) * 0.9;
      else r.root.position.y = e.y;
    }
    for (const [id, r] of this.rigs) if (!seen.has(id)) { this.scene.remove(r.root); r.dispose(); this.rigs.delete(id); }

    // bullets
    const c = new THREE.Color();
    const n = Math.min(world.bullets.length, 64);
    for (let i = 0; i < n; i++) {
      const b = world.bullets[i];
      this.dummy.position.set(b.x, 1.25, b.z);
      this.dummy.scale.setScalar(b.reflected ? 0.16 : 0.12);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.bullets.setMatrixAt(i, this.dummy.matrix);
      this.bullets.setColorAt(i, b.reflected ? c.setRGB(1.5, 2.8, 3.2) : c.setRGB(4, 2.4, 0.6));
      this.particles.emit(b.x - b.vx * 0.02, 1.25, b.z - b.vz * 0.02, 0, 0, 0, 0.18, 0.1, b.reflected ? 0x9ae0ff : 0xffb040, 0);
    }
    this.bullets.count = n;
    this.bullets.instanceMatrix.needsUpdate = true;
    if (this.bullets.instanceColor) this.bullets.instanceColor.needsUpdate = true;

    // pickups
    const live = new Set<object>(world.pickups);
    for (const k of world.pickups) {
      let o = this.pickupMeshes.get(k);
      if (!o) {
        o = this.makePickup(k.kind);
        this.scene.add(o);
        this.pickupMeshes.set(k, o);
      }
      o.position.set(k.x, k.kind === 'health' ? 0.5 + Math.sin(k.t * 3) * 0.08 : 0.08, k.z);
      if (k.kind === 'health') o.rotation.y = k.t * 1.5;
    }
    for (const [k, o] of this.pickupMeshes) if (!live.has(k)) { this.scene.remove(o); this.pickupMeshes.delete(k); }

    if (this.rain) {
      const a = this.rainPos;
      for (let i = 0; i < a.length; i += 6) {
        const fall = 26 * dt;
        a[i + 1] -= fall; a[i + 4] -= fall;
        if (a[i + 1] < 0) { const x = (Math.random() - 0.5) * 50, z = (Math.random() - 0.5) * 50; a[i] = x; a[i + 3] = x - 0.05; a[i + 2] = a[i + 5] = z; a[i + 1] = 22; a[i + 4] = 22.7; }
      }
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      this.rain.position.set(this.camera.position.x, 0, this.camera.position.z);
    }

    // follow light + shadow frustum on the action
    this.sun.position.set(p.x + this.look.sunDir[0] * 40, this.look.sunDir[1] * 40, p.z + this.look.sunDir[2] * 40);
    this.sun.target.position.set(p.x, 0, p.z);
  }

  /** A fading after-image of the player (rolls, lunges, air dashes). */
  addGhost(color: number): void {
    if (this.ghosts.length > 14) return;
    const obj = this.playerRig.root.clone(true);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.material = mat; m.castShadow = false; }
    });
    this.scene.add(obj);
    this.ghosts.push({ obj, mat, life: 0.32, max: 0.32 });
  }

  private makePickup(kind: 'bat' | 'pipe' | 'gun' | 'health'): THREE.Object3D {
    const g = new THREE.Group();
    if (kind === 'gun') {
      const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.4, metalness: 0.6 });
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.04), dark);
      slide.position.y = 0.1;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.15, 0.04), dark);
      grip.position.set(-0.1, 0.02, 0);
      g.add(slide, grip);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.85, toneMapped: false }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.02;
      g.add(ring);
      return g;
    }
    if (kind === 'health') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0x228822, emissiveIntensity: 0.5 }));
      g.add(m);
      const cross = new THREE.MeshStandardMaterial({ color: 0xd02020, emissive: 0xd02020, emissiveIntensity: 0.6 });
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.32), cross), b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.32), cross);
      g.add(a, b);
    } else {
      const m = new THREE.Mesh(kind === 'bat' ? new THREE.CylinderGeometry(0.06, 0.03, 1, 10) : new THREE.CylinderGeometry(0.035, 0.035, 0.95, 10), new THREE.MeshStandardMaterial({ color: kind === 'bat' ? 0xb08a58 : 0x9aa2ab, roughness: 0.5, metalness: kind === 'bat' ? 0 : 0.8, emissive: 0x303030 }));
      m.rotation.z = Math.PI / 2;
      m.position.y = 0.06;
      m.castShadow = true;
      g.add(m);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.025, 6, 28), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.8, toneMapped: false }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.02;
      g.add(ring);
    }
    return g;
  }

  // ------------------------------------------------------------------ camera

  updateCamera(world: World, yaw: number, pitch: number, dt: number, focusBias: { x: number; z: number }): void {
    const p = world.player;
    const target = new THREE.Vector3(p.x + focusBias.x, 1.45, p.z + focusBias.z);
    if (!this.focusInit) { this.focus.copy(target); this.focusInit = true; }
    const k = 1 - Math.pow(0.0004, dt);
    this.focus.lerp(target, k);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fx = cp * Math.cos(yaw), fy = sp, fz = cp * Math.sin(yaw);
    const rx = -Math.sin(yaw), rz = Math.cos(yaw);
    const dist = 6.4 + this.speedFov * 0.06;
    const ox = this.focus.x + rx * 0.9, oy = this.focus.y + 0.1, oz = this.focus.z + rz * 0.9;
    let dx = ox - fx * dist, dy = oy - fy * dist, dz = oz - fz * dist;
    dy = Math.max(0.5, Math.min(dy, this.ceilY - 0.4));
    if (segBlocked(this.blockers, ox, oy, oz, dx, dy, dz)) {
      let lo = 0.12, hi = 1;
      for (let i = 0; i < 7; i++) {
        const m = (lo + hi) / 2;
        if (segBlocked(this.blockers, ox, oy, oz, ox - fx * dist * m, Math.max(0.5, oy - fy * dist * m), oz - fz * dist * m)) hi = m; else lo = m;
      }
      dx = ox - fx * dist * lo; dy = Math.max(0.5, oy - fy * dist * lo); dz = oz - fz * dist * lo;
    }
    const sh = this.shake;
    this.camera.position.set(dx + (Math.random() - 0.5) * sh, dy + (Math.random() - 0.5) * sh, dz + (Math.random() - 0.5) * sh);
    this.camera.lookAt(ox + fx * 8, oy + fy * 8, oz + fz * 8);
    const fov = this.fovBase + this.fovKick + this.speedFov;
    if (Math.abs(this.camera.fov - fov) > 0.03) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.fovKick *= Math.pow(0.002, dt);
    this.shake *= Math.pow(0.001, dt);
    if (this.shake < 0.002) this.shake = 0;
  }

  snapCamera(): void { this.focusInit = false; }

  projectToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 && v.z > -1 };
  }

  render(dt: number): void {
    this.fx.update(dt);
    this.particles.update(dt);
    this.sky.position.copy(this.camera.position);
    this.aberr *= Math.pow(0.002, dt);
    this.witchK += ((this.witch ? 1 : 0) - this.witchK) * Math.min(1, dt * 9);
    this.grade.uniforms.aberr.value = 0.0006 + this.aberr + this.witchK * 0.0025;
    this.grade.uniforms.sat.value = 1.08 - this.witchK * 0.55;
    (this.grade.uniforms.tint.value as THREE.Color).setRGB(1 - this.witchK * 0.15, 1 - this.witchK * 0.02, 1 + this.witchK * 0.22);
    this.grade.uniforms.vig.value = 0.38 + this.witchK * 0.25;
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.life -= dt;
      g.mat.opacity = Math.max(0, 0.4 * (g.life / g.max));
      if (g.life <= 0) { this.scene.remove(g.obj); g.mat.dispose(); this.ghosts.splice(i, 1); }
    }
    this.grade.uniforms.time.value = (this.grade.uniforms.time.value + dt * 60) % 1000;
    this.steamT -= dt;
    if (this.steamT <= 0 && this.steam.length) {
      this.steamT = 0.16;
      for (const v of this.steam) this.particles.emit(v.x + (Math.random() - 0.5) * 0.3, 0.1, v.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.3, 1.5, 0.14, 0x8a9098, -0.3);
    }
    if (this.bloomOn) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
