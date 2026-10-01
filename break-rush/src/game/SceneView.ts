import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Level } from '../level/Generator';
import { Box, Controller } from '../physics/Controller';
import { Crumbler } from '../physics/Crumbler';
import { Combat, Enemy, segmentBlocked } from './Combat';
import { Effects, Particles } from './Fx';
import { gateTexture, hazardTexture, padTexture, surfaceTexture, wallTexture } from './Textures';
import { Theme, themeFor } from './Theme';

interface EnemyView {
  group: THREE.Group;
  accent: THREE.MeshBasicMaterial;
  laser: THREE.Mesh;
  spin: THREE.Object3D[];
  arm?: THREE.Object3D;
}

export interface PlayerAnim {
  slash: number;
  deflect: number;
  lunging: boolean;
  time: number;
  invuln: boolean;
  hidden: boolean;
}

/** Merge boxes into one geometry with world-space UVs (so textures tile at a fixed scale) and tinted vertex colours. */
function mergeBoxes(list: Box[], top: THREE.Color, side: THREE.Color, uvScale: number, vary = true): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  const quad = (p: number[][], n: number[], uvs: number[][], color: THREE.Color) => {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(...p[i]); nor.push(...n); uv.push(...uvs[i]); col.push(color.r, color.g, color.b);
    }
  };
  for (const b of list) {
    const { minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z1 } = b;
    const v = vary ? 0.92 + ((Math.sin(x0 * 12.9898 + z0 * 78.233) * 43758.5453) % 1 + 1) % 1 * 0.14 : 1;
    const tc = c.copy(top).multiplyScalar(v).clone();
    const sc = c.copy(side).multiplyScalar(v).clone();
    const s = uvScale;
    // top
    quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], [[x0 * s, z1 * s], [x1 * s, z1 * s], [x1 * s, z0 * s], [x0 * s, z0 * s]], tc);
    // +z
    quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[x0 * s, y0 * s], [x1 * s, y0 * s], [x1 * s, y1 * s], [x0 * s, y1 * s]], sc);
    // -z
    quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [[x1 * s, y0 * s], [x0 * s, y0 * s], [x0 * s, y1 * s], [x1 * s, y1 * s]], sc);
    // +x
    quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[z1 * s, y0 * s], [z0 * s, y0 * s], [z0 * s, y1 * s], [z1 * s, y1 * s]], sc);
    // -x
    quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[z0 * s, y0 * s], [z1 * s, y0 * s], [z1 * s, y1 * s], [z0 * s, y1 * s]], sc);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/** Everything Three.js: scene, post-processing, level meshes, characters and the chase camera. */
export class SceneView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, 1, 0.1, 900);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  readonly fx: Effects;
  readonly particles: Particles;
  private levelGroup = new THREE.Group();
  private decorGroup = new THREE.Group();
  private enemyViews: EnemyView[] = [];
  private projMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private player = new THREE.Group();
  private pParts!: { torso: THREE.Mesh; head: THREE.Mesh; legL: THREE.Mesh; legR: THREE.Mesh; armL: THREE.Mesh; armR: THREE.Mesh; blade: THREE.Mesh; visor: THREE.MeshBasicMaterial; scarf: THREE.Mesh[]; scarfMat: THREE.MeshLambertMaterial };
  private scarfHist: THREE.Vector3[] = [];
  private markers: THREE.Object3D[] = [];
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private ambient = new THREE.AmbientLight(0xffffff, 1);
  private hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
  private sun = new THREE.DirectionalLight(0xffffff, 1);
  private shadow: THREE.Mesh;
  private crumbles: { box: Box; mesh: THREE.Mesh; baseY: number }[] = [];
  private gates: { box: Box; mesh: THREE.Mesh }[] = [];
  private clouds: THREE.Object3D[] = [];
  theme: Theme = themeFor(0);
  bloomOn = true;
  private pixelRatio = 1;
  private camFocus = new THREE.Vector3();
  private camInit = false;
  private fovBase = 72;
  fov = 72;
  roll = 0;
  shake = 0;
  private clock = 0;
  private levelBoxes: Box[] = [];

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';

    this.scene.fog = new THREE.FogExp2(0xaaaaaa, 0.01);
    this.scene.add(this.ambient, this.hemi, this.sun, this.sun.target);
    this.scene.add(this.levelGroup, this.decorGroup, this.player);

    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(hor, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(hor, bot, pow(clamp(-h,0.0,1.0), 0.5)); gl_FragColor = vec4(c, 1.0); }',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(700, 24, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.2, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.fx = new Effects(this.scene);
    this.particles = new Particles(this.scene);

    this.projMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 128);
    this.projMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projMesh.frustumCulled = false;
    this.projMesh.count = 0;
    this.projMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.scene.add(this.projMesh);

    // blob shadow under the player: the single best depth cue for platforming
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
    this.shadow.renderOrder = 2;
    this.scene.add(this.shadow);

    this.buildPlayer();
    this.applyTheme(this.theme);
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

  setQuality(level: 'high' | 'low'): void {
    this.bloomOn = level === 'high';
    this.pixelRatio = level === 'high' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
    this.particles.density = level === 'high' ? 1 : 0.4;
    this.resize();
  }

  // ---- theme ---------------------------------------------------------------------

  applyTheme(t: Theme): void {
    this.theme = t;
    const u = this.skyMat.uniforms;
    u.top.value.set(t.skyTop); u.hor.value.set(t.skyHorizon); u.bot.value.set(t.skyBottom);
    (this.scene.fog as THREE.FogExp2).color.set(t.fog);
    (this.scene.fog as THREE.FogExp2).density = t.fogDensity;
    this.scene.background = new THREE.Color(t.fog);
    this.ambient.color.set(t.ambient); this.ambient.intensity = t.ambientI;
    this.hemi.color.set(t.skyTop); this.hemi.groundColor.set(t.skyBottom); this.hemi.intensity = 0.5;
    this.sun.color.set(t.sun); this.sun.intensity = t.sunI;
    this.sun.position.set(...t.sunDir);
    this.renderer.toneMappingExposure = t.exposure;
    this.bloom.strength = t.bloom;
    this.bloom.threshold = t.decor === 'neon' ? 0.8 : 0.92;
    (this.pParts.scarfMat as THREE.MeshLambertMaterial).color.set(t.accent);
  }

  // ---- level ---------------------------------------------------------------------

  buildLevel(level: Level): void {
    this.disposeGroup(this.levelGroup);
    this.disposeGroup(this.decorGroup);
    this.markers.length = 0;
    this.crumbles.length = 0;
    this.gates.length = 0;
    this.clouds.length = 0;
    this.levelBoxes = level.boxes;
    const t = themeFor(level.themeId);
    this.applyTheme(t);
    const tintTop = new THREE.Color(t.top), tintSide = new THREE.Color(t.side);

    const plain: Box[] = [], walls: Box[] = [], hazards: Box[] = [], pads: Box[] = [];
    for (const b of level.boxes) {
      if (b.wall) walls.push(b);
      else if (b.hazard) hazards.push(b);
      else if (b.pad) pads.push(b);
      else if (b.crumble || b.tag === 'gate') continue;
      else plain.push(b);
    }
    const tex = surfaceTexture(t.tex);
    const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.Mesh(geo, mat);
      m.frustumCulled = false;
      this.levelGroup.add(m);
      return m;
    };
    if (plain.length) addMesh(mergeBoxes(plain, tintTop, tintSide, 1 / 3.2), new THREE.MeshLambertMaterial({ map: tex, vertexColors: true }));
    if (walls.length) addMesh(mergeBoxes(walls, new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1), 1 / 2.5, false), new THREE.MeshLambertMaterial({ map: wallTexture(), vertexColors: true, emissive: 0x331800 }));
    if (hazards.length) addMesh(mergeBoxes(hazards, new THREE.Color(1, 1, 1), new THREE.Color(1, 1, 1), 1 / 0.7, false), new THREE.MeshBasicMaterial({ map: hazardTexture(), vertexColors: true, toneMapped: false }));
    if (pads.length) addMesh(mergeBoxes(pads, new THREE.Color(1, 1, 1), new THREE.Color(0.6, 0.9, 0.7), 1 / 1.6, false), new THREE.MeshBasicMaterial({ map: padTexture(), vertexColors: true, toneMapped: false }));
    for (const b of level.boxes) {
      if (b.crumble) {
        const m = new THREE.Mesh(mergeBoxes([b], tintTop.clone().multiplyScalar(0.9), tintSide.clone().multiplyScalar(0.75), 1 / 3.2), new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, emissive: 0x221108 }));
        m.frustumCulled = false;
        this.levelGroup.add(m);
        this.crumbles.push({ box: b, mesh: m, baseY: 0 });
      } else if (b.tag === 'gate') {
        const gm = new THREE.Mesh(new THREE.BoxGeometry(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ), new THREE.MeshBasicMaterial({ map: this.gateMap(b), transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, color: 0xff6060 }));
        gm.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
        this.levelGroup.add(gm);
        this.gates.push({ box: b, mesh: gm });
      }
    }

    // outlines: top rectangle of every block, so edges read from afar
    const pos: number[] = [];
    for (const b of level.boxes) {
      if (b.ghost || b.hazard || b.tag === 'gate') continue;
      const { minX: x0, maxX: x1, maxY: y1, minZ: z0, maxZ: z1 } = b;
      pos.push(x0, y1 + 0.01, z0, x1, y1 + 0.01, z0, x1, y1 + 0.01, z0, x1, y1 + 0.01, z1, x1, y1 + 0.01, z1, x0, y1 + 0.01, z1, x0, y1 + 0.01, z1, x0, y1 + 0.01, z0);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: t.edge, transparent: true, opacity: t.edgeAlpha, toneMapped: t.decor !== 'neon' }));
    lines.frustumCulled = false;
    this.levelGroup.add(lines);

    // checkpoint + finish beacons
    const beacon = (x: number, y: number, z: number, color: number, h: number, r: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.position.set(x, y + h / 2, z);
      this.levelGroup.add(m);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 6, 28), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y + 0.1, z);
      this.levelGroup.add(ring);
      this.markers.push(ring);
    };
    for (const cp of level.checkpoints.slice(1)) beacon(cp.x, cp.y, cp.z, 0xffd23a, 7, 1.4);
    beacon(level.finish.x, level.finish.y, level.finish.z, 0x45ff9a, 26, 2.6);

    this.buildDecor(level, t);
  }

  private gateMap(b: Box): THREE.Texture {
    const tx = gateTexture().clone();
    tx.needsUpdate = true;
    tx.repeat.set((b.maxZ - b.minZ) / 1.2, (b.maxY - b.minY) / 1.2);
    return tx;
  }

  private buildDecor(level: Level, t: Theme): void {
    let seed = level.seed * 31 + t.id * 977 + 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const L = level.length;
    const inst = (geo: THREE.BufferGeometry, n: number, mat: THREE.Material, place: (i: number, d: THREE.Object3D, c: THREE.Color) => void) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(1, 1, 1);
        place(i, this.dummy, c);
        this.dummy.updateMatrix();
        m.setMatrixAt(i, this.dummy.matrix);
        m.setColorAt(i, c);
      }
      m.frustumCulled = false;
      this.decorGroup.add(m);
      return m;
    };
    const side = () => (rnd() < 0.5 ? -1 : 1);
    const lam = () => new THREE.MeshLambertMaterial({ color: 0xffffff });
    const unit = new THREE.BoxGeometry(1, 1, 1);

    if (t.decor === 'city' || t.decor === 'neon') {
      const neon = t.decor === 'neon';
      const base = neon ? [0x0a0f2c] : [0x9aa7b8, 0xb7bfc9, 0x8794a8, 0xc9c2b4, 0x7f8da1];
      const n = 260;
      const tops: number[] = [];
      const windows = surfaceTexture('tile');
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: neon ? null : windows });
      inst(unit, n, mat, (i, d, c) => {
        const w = 8 + rnd() * 16, dd = 8 + rnd() * 16, h = 90;
        const tall = rnd() < 0.12;
        const x = -60 + rnd() * (L + 160), z = side() * ((tall ? 55 : 22) + rnd() * 140);
        const top = (tall ? 25 : -6) - rnd() * (rnd() < 0.5 ? 30 : 60);
        d.position.set(x, top - h / 2, z);
        d.scale.set(w, h, dd);
        c.set(base[i % base.length]).multiplyScalar(0.85 + rnd() * 0.3);
        tops.push(x - w / 2, top, z - dd / 2, x + w / 2, top, z - dd / 2, x + w / 2, top, z - dd / 2, x + w / 2, top, z + dd / 2, x + w / 2, top, z + dd / 2, x - w / 2, top, z + dd / 2, x - w / 2, top, z + dd / 2, x - w / 2, top, z - dd / 2);
      });
      if (neon) {
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute(tops, 3));
        const ls = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x22e6ff, toneMapped: false }));
        ls.frustumCulled = false;
        this.decorGroup.add(ls);
      }
    } else if (t.decor === 'industrial') {
      const cyl = new THREE.CylinderGeometry(1, 1, 1, 14);
      inst(cyl, 70, lam(), (i, d, c) => {
        const r = 2 + rnd() * 5, h = 60 + rnd() * 110;
        d.position.set(-40 + rnd() * (L + 120), -20 + h / 2 - 30 + rnd() * 20, side() * (26 + rnd() * 120));
        d.scale.set(r, h, r);
        c.set(i % 3 === 0 ? 0xb85a3a : i % 3 === 1 ? 0x6e6a66 : 0x9a8f80);
      });
      inst(unit, 140, lam(), (_i, d, c) => {
        const w = 10 + rnd() * 22, h = 30 + rnd() * 40;
        d.position.set(-50 + rnd() * (L + 140), -30 - rnd() * 10, side() * (24 + rnd() * 130));
        d.scale.set(w, h, 10 + rnd() * 20);
        c.set(0x4a4540).multiplyScalar(0.8 + rnd() * 0.5);
      });
      // chimney smoke puffs
      const puff = new THREE.SphereGeometry(1, 8, 6);
      inst(puff, 60, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }), (_i, d, c) => {
        d.position.set(-40 + rnd() * (L + 120), 30 + rnd() * 40, side() * (30 + rnd() * 110));
        const s = 6 + rnd() * 12;
        d.scale.set(s * 1.6, s, s * 1.4);
        c.set(0x6a625c);
      });
    } else if (t.decor === 'forest') {
      const trunk = new THREE.CylinderGeometry(0.6, 1, 1, 7);
      const crown = new THREE.IcosahedronGeometry(1, 1);
      const N = 120;
      const pts: [number, number, number, number][] = [];
      for (let i = 0; i < N; i++) pts.push([-40 + rnd() * (L + 120), -40 - rnd() * 20, side() * (22 + rnd() * 130), 18 + rnd() * 30]);
      inst(trunk, N, lam(), (i, d, c) => {
        const [x, y, z, h] = pts[i];
        d.position.set(x, y + h / 2, z); d.scale.set(2.2, h, 2.2); c.set(0x5a4430);
      });
      inst(crown, N, lam(), (i, d, c) => {
        const [x, y, z, h] = pts[i];
        const s = 9 + rnd() * 8;
        d.position.set(x, y + h + s * 0.3, z); d.scale.set(s, s * 0.8, s); c.set(0x2f7a3a).multiplyScalar(0.8 + rnd() * 0.5);
      });
      inst(unit, 40, lam(), (_i, d, c) => {
        const h = 20 + rnd() * 40;
        d.position.set(-30 + rnd() * (L + 100), -30 - 5 + h / 2 - 20, side() * (18 + rnd() * 60));
        d.scale.set(4 + rnd() * 3, h, 4 + rnd() * 3);
        c.set(0xa4ac98).multiplyScalar(0.8 + rnd() * 0.3);
      });
    } else {
      // canyon: layered mesas and spires
      const layers = [0xb5532e, 0xd77a45, 0xc2653a, 0xe6a46a, 0x9c4a2a];
      const M = 36;
      const mesas: [number, number, number, number, number][] = [];
      for (let i = 0; i < M; i++) mesas.push([-50 + rnd() * (L + 160), side() * (30 + rnd() * 130), 14 + rnd() * 28, 12 + rnd() * 18, 60 + rnd() * 50]);
      for (let layer = 0; layer < 4; layer++) {
        inst(unit, M, lam(), (i, d, c) => {
          const [x, z, w, dd, h] = mesas[i];
          const lh = h / 4;
          const shrink = 1 - layer * 0.12;
          d.position.set(x, -40 - 60 + lh * layer + lh / 2 + h * 0.25, z);
          d.scale.set(w * shrink, lh, dd * shrink);
          c.set(layers[(i + layer) % layers.length]);
        });
      }
    }

    // clouds for the daytime themes
    if (t.decor !== 'neon') {
      const cg = new THREE.SphereGeometry(1, 10, 8);
      inst(cg, 28, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: t.decor === 'industrial' ? 0.35 : 0.7, fog: false }), (_i, d, c) => {
        const s = 14 + rnd() * 26;
        d.position.set(-50 + rnd() * (L + 200), 70 + rnd() * 60, side() * (60 + rnd() * 250));
        d.scale.set(s * 2, s * 0.4, s);
        c.set(t.skyHorizon).lerp(new THREE.Color(0xffffff), 0.7);
      });
    }
  }

  private disposeGroup(g: THREE.Group): void {
    for (const ch of [...g.children]) {
      g.remove(ch);
      const m = ch as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    }
  }

  /** Per-frame: crumbling tiles, arena gates, beacon spin, sky follows camera. */
  syncDynamic(crumbler: Crumbler, dt: number): void {
    for (const c of this.crumbles) {
      const m = c.mesh;
      if (c.box.ghost) {
        const fall = crumbler.fallen.get(c.box) ?? 0;
        m.visible = fall < 1.2;
        m.position.y = -fall * fall * 14;
        m.rotation.z = fall * 0.6;
      } else {
        m.visible = true;
        m.rotation.z = 0;
        const p = crumbler.progress(c.box);
        m.position.y = 0;
        m.position.x = p > 0 ? (Math.random() - 0.5) * 0.08 * (1 + p * 2) : 0;
      }
    }
    for (const g of this.gates) g.mesh.visible = !g.box.ghost;
    for (const m of this.markers) m.rotation.z += dt * 1.6;
    this.sky.position.copy(this.camera.position);
  }

  // ---- characters ------------------------------------------------------------

  private buildPlayer(): void {
    const suit = new THREE.MeshLambertMaterial({ color: 0x2d323d });
    const armor = new THREE.MeshLambertMaterial({ color: 0x4a515f });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe0b48f });
    const visor = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    const torso = box(0.34, 0.62, 0.5, suit);
    torso.position.y = 1.15;
    const vest = box(0.38, 0.4, 0.54, armor);
    vest.position.y = 0.08;
    torso.add(vest);
    const head = box(0.3, 0.3, 0.32, suit);
    head.position.set(0.02, 1.62, 0);
    const face = box(0.06, 0.1, 0.28, visor);
    face.position.set(0.15, 0.02, 0);
    head.add(face);
    const hood = box(0.34, 0.1, 0.36, armor);
    hood.position.y = 0.17;
    head.add(hood);
    const legL = box(0.17, 0.7, 0.17, suit);
    const legR = box(0.17, 0.7, 0.17, suit);
    legL.geometry.translate(0, -0.35, 0);
    legR.geometry.translate(0, -0.35, 0);
    legL.position.set(0, 0.75, -0.13);
    legR.position.set(0, 0.75, 0.13);
    const armL = box(0.14, 0.6, 0.14, skin);
    const armR = box(0.14, 0.6, 0.14, skin);
    armL.geometry.translate(0, -0.28, 0);
    armR.geometry.translate(0, -0.28, 0);
    armL.position.set(0, 1.4, -0.33);
    armR.position.set(0, 1.4, 0.33);
    const blade = box(0.05, 1.15, 0.05, new THREE.MeshLambertMaterial({ color: 0xe8eef5, emissive: 0x556070 }));
    blade.geometry.translate(0, 0.55, 0);
    blade.position.set(-0.2, 0.95, 0.05);
    blade.rotation.set(0, 0, 0.9);
    const scarfMat = new THREE.MeshLambertMaterial({ color: 0xff7a1a, emissive: 0x331100 });
    const scarf: THREE.Mesh[] = [];
    for (let i = 0; i < 7; i++) {
      const s = box(0.38 - i * 0.03, 0.09, 0.09, scarfMat);
      scarf.push(s);
      this.scene.add(s);
      this.scarfHist.push(new THREE.Vector3());
    }
    this.player.add(torso, head, legL, legR, armL, armR, blade);
    this.pParts = { torso, head, legL, legR, armL, armR, blade, visor, scarf, scarfMat };
  }

  syncPlayer(c: Controller, a: PlayerAnim, dt: number): void {
    const p = this.pParts;
    this.clock += dt;
    this.player.visible = !a.hidden;
    for (const s of p.scarf) s.visible = !a.hidden;
    this.player.position.set(c.x, c.y, c.z);
    const targetYaw = -c.yaw;
    let d = targetYaw - this.player.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.player.rotation.y += d * Math.min(1, dt * 18);
    const sp = c.speed;
    const run = c.onGround && c.state !== 'slide' ? Math.min(1, sp / 9) : 0;
    const ph = a.time * (8 + sp * 0.9);
    const swing = Math.sin(ph) * 0.9 * run;
    p.legL.rotation.z = swing;
    p.legR.rotation.z = -swing;
    p.armL.rotation.z = -swing * 0.8;
    p.armR.rotation.z = swing * 0.8;
    let lean = run * 0.18;
    let squash = 1;
    if (!c.onGround && c.state !== 'wallrun') {
      p.legL.rotation.z = 0.6; p.legR.rotation.z = -0.4;
      p.armL.rotation.z = -1.1; p.armR.rotation.z = -1.1;
    }
    if (c.state === 'slide') {
      lean = -0.9; squash = 0.55;
      p.legL.rotation.z = 1.3; p.legR.rotation.z = 1.2;
      this.player.position.y -= 0.25;
    } else if (c.state === 'wallrun') {
      p.legL.rotation.z = swing; p.legR.rotation.z = -swing;
    } else if (c.state === 'dash' || a.lunging) {
      lean = 0.7;
      p.legL.rotation.z = -0.5; p.legR.rotation.z = -0.3;
      p.armL.rotation.z = -1.4; p.armR.rotation.z = -1.4;
    }
    p.torso.rotation.z = lean;
    p.head.position.x = 0.02 + lean * 0.4;
    p.torso.scale.y = squash;
    if (a.slash > 0) {
      const k = 1 - a.slash / 0.28;
      p.armR.rotation.z = -2.6 + k * 3.2;
      p.blade.position.set(0.3, 1.2, 0.3);
      p.blade.rotation.set(0.3 * (1 - k), 0, 2.6 - k * 4.2);
    } else {
      p.blade.position.set(-0.2, 0.95, 0.05);
      p.blade.rotation.set(0, 0, 0.9);
    }
    p.visor.color.setHex(a.invuln ? ((Math.floor(a.time * 24) & 1) ? 0xffffff : 0x66aaff) : a.deflect > 0 ? 0xffd23a : 0xffffff);

    const neck = new THREE.Vector3(c.x, c.y + 1.45, c.z);
    let prev = neck;
    for (let i = 0; i < p.scarf.length; i++) {
      const h = this.scarfHist[i];
      const lag = 1 - Math.pow(0.0005, dt * (1 + i * 0.1));
      h.lerp(prev, lag * 0.9);
      h.y -= dt * 0.9 * (i + 1) * 0.12;
      h.y = Math.max(h.y, c.y + 0.6 - i * 0.05);
      const dx = prev.x - h.x, dy = prev.y - h.y, dz = prev.z - h.z;
      const len = Math.hypot(dx, dy, dz);
      if (len > 0.28) {
        const k = 0.28 / len;
        h.set(prev.x - dx * k, prev.y - dy * k, prev.z - dz * k);
      }
      p.scarf[i].position.copy(h);
      p.scarf[i].lookAt(prev);
      p.scarf[i].rotateY(Math.PI / 2);
      prev = h;
    }

    // blob shadow on whatever is below
    let gy = -1e9;
    for (const b of this.levelBoxes) {
      if (b.ghost || b.hazard || b.wall) continue;
      if (c.x > b.minX && c.x < b.maxX && c.z > b.minZ && c.z < b.maxZ && b.maxY <= c.y + 0.3 && b.maxY > gy) gy = b.maxY;
    }
    this.shadow.visible = gy > -1e8 && !a.hidden;
    if (this.shadow.visible) {
      this.shadow.position.set(c.x, gy + 0.03, c.z);
      const h = Math.max(0, c.y - gy);
      const s = Math.max(0.5, 1.1 - h * 0.05);
      this.shadow.scale.set(s, 1, s);
      (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 0.5 - h * 0.025);
    }
  }

  resetScarf(c: Controller): void {
    for (const h of this.scarfHist) h.set(c.x, c.y + 1.4, c.z);
  }

  // ---- enemies -------------------------------------------------------------------

  buildEnemies(combat: Combat): void {
    for (const v of this.enemyViews) {
      this.scene.remove(v.group);
      this.scene.remove(v.laser);
    }
    this.enemyViews.length = 0;
    const laserGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
    const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z);
      return o;
    };
    const L = (c: number) => new THREE.MeshLambertMaterial({ color: c });
    for (const e of combat.enemies) {
      const g = new THREE.Group();
      const accent = new THREE.MeshBasicMaterial({ color: 0xff4a2a, toneMapped: false });
      const spin: THREE.Object3D[] = [];
      let arm: THREE.Object3D | undefined;
      if (e.type === 'gunner') {
        const dark = L(0x30343c), vest = L(0x6b6f4a), metal = L(0x1c1e24);
        g.add(box(0.5, 0.55, 0.45, dark, 0, 0.3, 0));
        g.add(box(0.62, 0.75, 0.55, vest, 0, 0.95, 0));
        g.add(box(0.2, 0.7, 0.2, dark, 0, 0.2, 0.14), box(0.2, 0.7, 0.2, dark, 0, 0.2, -0.14));
        const head = box(0.42, 0.4, 0.42, metal, 0.02, 1.58, 0);
        head.add(box(0.06, 0.1, 0.34, accent, 0.2, 0.02, 0));
        g.add(head);
        g.add(box(0.3, 0.7, 0.3, metal, -0.38, 1.0, 0));
        arm = box(1.1, 0.14, 0.14, metal, 0.6, 1.15, 0.32);
        arm.add(box(0.1, 0.1, 0.1, accent, 0.58, 0, 0));
        g.add(arm);
      } else if (e.type === 'charger') {
        const hide = L(0x5a3a28), plate = L(0x3a3a40), horn = L(0xe8dcc0);
        g.add(box(1.3, 1.0, 1.3, hide, 0, 0.85, 0));
        g.add(box(0.5, 0.8, 0.3, plate, 0, 0.4, 0.45), box(0.5, 0.8, 0.3, plate, 0, 0.4, -0.45));
        const hd = box(0.7, 0.7, 0.9, plate, 0.85, 1.0, 0);
        hd.add(box(0.08, 0.12, 0.7, accent, 0.36, 0.1, 0));
        const h1 = box(0.7, 0.14, 0.14, horn, 0.1, 0.45, 0.5), h2 = box(0.7, 0.14, 0.14, horn, 0.1, 0.45, -0.5);
        h1.rotation.z = 0.5; h2.rotation.z = 0.5;
        hd.add(h1, h2);
        g.add(hd);
        g.add(box(1.0, 0.25, 1.1, plate, -0.1, 1.45, 0));
      } else if (e.type === 'drone') {
        const body = L(0x4a5058), dark = L(0x22252a);
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), body);
        g.add(core);
        const lens = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), accent);
        lens.position.set(0.42, -0.05, 0);
        g.add(lens);
        for (const [x, z] of [[0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7]]) {
          g.add(box(Math.abs(x) + 0.1, 0.08, 0.1, dark, x / 2, 0.1, z / 2 * 0).rotateY(Math.atan2(-z, x)));
          const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 14), new THREE.MeshLambertMaterial({ color: 0xdddddd, transparent: true, opacity: 0.5 }));
          rotor.position.set(x, 0.22, z);
          g.add(rotor);
          spin.push(rotor);
        }
      } else {
        const steel = L(0x7a8088), dark = L(0x30343c), vest = L(0x5a4a30);
        g.add(box(0.5, 0.6, 0.45, dark, 0, 0.3, 0));
        g.add(box(0.6, 0.8, 0.55, vest, 0, 0.95, 0));
        const head = box(0.42, 0.4, 0.42, steel, 0, 1.6, 0);
        head.add(box(0.06, 0.08, 0.32, accent, 0.2, 0.02, 0));
        g.add(head);
        arm = new THREE.Group();
        const shield = box(0.16, 1.7, 1.5, steel, 0.75, 0.95, 0);
        shield.add(box(0.04, 0.5, 1.5, L(0xe0b020), 0.1, 0.35, 0), box(0.04, 0.12, 1.2, accent, 0.1, -0.1, 0));
        arm.add(shield);
        g.add(arm);
      }
      this.scene.add(g);
      const laser = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      laser.visible = false;
      this.scene.add(laser);
      this.enemyViews.push({ group: g, accent, laser, spin, arm });
    }
  }

  syncEnemies(combat: Combat, px: number, py: number, pz: number, time: number): void {
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    combat.enemies.forEach((e: Enemy, i: number) => {
      const v = this.enemyViews[i];
      if (!v) return;
      v.group.visible = e.alive;
      if (!e.alive) {
        v.laser.visible = false;
        return;
      }
      v.group.position.set(e.x, e.y, e.z);
      v.group.rotation.y = -e.facing;
      const k = e.telegraph;
      const pulse = e.state === 'aim' || e.state === 'windup' ? 0.5 + 0.5 * Math.sin(time * (14 + k * 30)) : 0;
      v.accent.color.setRGB(1 + k * 3 + pulse * 2, 0.3 + k * 2.2 + pulse, 0.15 + k * 2 + pulse);
      for (const s of v.spin) s.rotation.y += 0.7;
      if (e.type === 'drone') v.group.rotation.z = Math.sin(time * 3 + e.id) * 0.12;
      if (e.type === 'charger' && e.state === 'windup') v.group.position.y += Math.abs(Math.sin(time * 40)) * 0.08;
      if (e.type === 'shield' && v.arm) v.arm.rotation.z = e.state === 'windup' ? -0.9 * k : 0;
      const showLaser = (e.type === 'gunner' || e.type === 'drone') && e.state === 'aim' || (e.type === 'charger' && e.state === 'windup');
      v.laser.visible = showLaser;
      if (showLaser) {
        const ox = e.x, oy = e.y + (e.type === 'drone' ? 0 : e.type === 'charger' ? 0.6 : 1.15), oz = e.z;
        const tx = e.type === 'charger' ? e.x + e.dirX * 8 : px, ty = e.type === 'charger' ? oy : py + 0.9, tz = e.type === 'charger' ? e.z + e.dirZ * 8 : pz;
        dir.set(tx - ox, ty - oy, tz - oz);
        const len = dir.length();
        v.laser.position.set(ox + dir.x / 2, oy + dir.y / 2, oz + dir.z / 2);
        v.laser.quaternion.setFromUnitVectors(up, dir.normalize());
        const w = 0.012 + k * 0.05;
        v.laser.scale.set(w, len, w);
        (v.laser.material as THREE.MeshBasicMaterial).opacity = 0.3 + k * 0.7;
      }
    });
  }

  syncProjectiles(combat: Combat, time: number): void {
    const c = new THREE.Color();
    const n = Math.min(combat.projectiles.length, 128);
    for (let i = 0; i < n; i++) {
      const b = combat.projectiles[i];
      this.dummy.position.set(b.x, b.y, b.z);
      const s = (b.kind === 'star' ? 0.3 : 0.45) + Math.sin(time * 30 + i) * 0.04;
      this.dummy.scale.setScalar(s);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.projMesh.setMatrixAt(i, this.dummy.matrix);
      this.projMesh.setColorAt(i, b.kind === 'bullet' ? c.setRGB(3.5, 0.6, 0.2) : b.kind === 'star' ? c.setRGB(2, 2, 2.2) : c.setRGB(0.6, 2.4, 3));
    }
    this.projMesh.count = n;
    this.projMesh.instanceMatrix.needsUpdate = true;
    if (this.projMesh.instanceColor) this.projMesh.instanceColor.needsUpdate = true;
  }

  // ---- camera --------------------------------------------------------------------------

  updateCamera(c: Controller, yaw: number, pitch: number, dt: number, boxes: Box[]): void {
    const head = new THREE.Vector3(c.x, c.y + (c.state === 'slide' ? 0.9 : 1.55), c.z);
    if (!this.camInit) {
      this.camFocus.copy(head);
      this.camInit = true;
    }
    const kx = 1 - Math.pow(0.0001, dt);
    this.camFocus.x += (head.x - this.camFocus.x) * kx;
    this.camFocus.z += (head.z - this.camFocus.z) * kx;
    this.camFocus.y += (head.y - this.camFocus.y) * (1 - Math.pow(0.004, dt));
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fx = cp * Math.cos(yaw), fy = sp, fz = cp * Math.sin(yaw);
    const rx = -Math.sin(yaw), rz = Math.cos(yaw);
    const dist = 4.6 + c.speed * 0.04;
    const fx0 = this.camFocus.x + rx * 0.7, fy0 = this.camFocus.y + 0.25, fz0 = this.camFocus.z + rz * 0.7;
    let dx = fx0 - fx * dist, dy = fy0 - fy * dist, dz = fz0 - fz * dist;
    const bl = boxes.filter((b) => !b.hazard && !b.wall && b.tag !== 'gate');
    if (segmentBlocked(bl, fx0, fy0, fz0, dx, dy, dz)) {
      let lo = 0.1, hi = 1;
      for (let i = 0; i < 7; i++) {
        const m = (lo + hi) / 2;
        if (segmentBlocked(bl, fx0, fy0, fz0, fx0 - fx * dist * m, fy0 - fy * dist * m, fz0 - fz * dist * m)) hi = m;
        else lo = m;
      }
      dx = fx0 - fx * dist * lo; dy = fy0 - fy * dist * lo; dz = fz0 - fz * dist * lo;
    }
    const sh = this.shake;
    this.camera.position.set(dx + (Math.random() - 0.5) * sh, dy + (Math.random() - 0.5) * sh, dz + (Math.random() - 0.5) * sh);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(fx0 + fx * 6, fy0 + fy * 6, fz0 + fz * 6);
    if (this.roll) this.camera.rotateZ(this.roll);
    const targetFov = this.fovBase + Math.min(22, Math.max(0, c.speed - 9) * 1.4) + (c.state === 'dash' ? 8 : 0);
    this.fov += (targetFov - this.fov) * (1 - Math.pow(0.002, dt));
    if (Math.abs(this.camera.fov - this.fov) > 0.05) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
    this.shake *= Math.pow(0.0008, dt);
    if (this.shake < 0.002) this.shake = 0;
  }

  snapCamera(): void {
    this.camInit = false;
  }

  projectToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 && v.z > -1 };
  }

  render(dt: number): void {
    this.fx.update(dt);
    this.particles.update(dt);
    this.sky.position.copy(this.camera.position);
    if (this.bloomOn) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
