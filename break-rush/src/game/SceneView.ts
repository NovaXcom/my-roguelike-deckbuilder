import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Level } from '../level/Generator';
import { Box, Controller } from '../physics/Controller';
import { Combat, Enemy, segmentBlocked } from './Combat';
import { Effects, Particles } from './Fx';

const COL = {
  floorSide: 0x0c1230,
  floorTop: 0x17315a,
  edge: 0x22e6ff,
  wall: 0xff9a1f,
  hazard: 0xff1f55,
  ceiling: 0xff3df0,
  cover: 0x7a5cff,
  finish: 0x45ff9a,
  checkpoint: 0xffe14a,
};

interface EnemyView {
  group: THREE.Group;
  eye: THREE.MeshBasicMaterial;
  body: THREE.MeshLambertMaterial;
  laser: THREE.Mesh;
  parts: THREE.Object3D[];
}

export interface PlayerAnim {
  slash: number;
  deflect: number;
  lunging: boolean;
  time: number;
  invuln: boolean;
  hidden: boolean;
}

/** Everything Three.js: scene, post-processing, level meshes, characters and the chase camera. */
export class SceneView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, 1, 0.1, 600);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  readonly fx: Effects;
  readonly particles: Particles;
  private levelGroup = new THREE.Group();
  private skyline = new THREE.Group();
  private enemyViews: EnemyView[] = [];
  private projMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private player = new THREE.Group();
  private pParts!: { torso: THREE.Mesh; head: THREE.Mesh; legL: THREE.Mesh; legR: THREE.Mesh; armL: THREE.Mesh; armR: THREE.Mesh; blade: THREE.Mesh; visor: THREE.MeshBasicMaterial; scarf: THREE.Mesh[] };
  private scarfHist: THREE.Vector3[] = [];
  private markers: { mesh: THREE.Object3D; spin: number }[] = [];
  bloomOn = true;
  private pixelRatio = 1;
  private camFocus = new THREE.Vector3();
  private camInit = false;
  private fovBase = 72;
  fov = 72;
  roll = 0;
  shake = 0;
  private clock = 0;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';

    this.scene.background = new THREE.Color(0x050818);
    this.scene.fog = new THREE.FogExp2(0x070b24, 0.011);
    this.scene.add(new THREE.AmbientLight(0x8aa4ff, 0.9));
    const sun = new THREE.DirectionalLight(0xbfd2ff, 1.4);
    sun.position.set(-0.4, 1, 0.6);
    this.scene.add(sun);
    this.scene.add(this.levelGroup, this.skyline, this.player);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.8);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.fx = new Effects(this.scene);
    this.particles = new Particles(this.scene);

    const pg = new THREE.SphereGeometry(1, 12, 8);
    this.projMesh = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 128);
    this.projMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projMesh.frustumCulled = false;
    this.projMesh.count = 0;
    this.projMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.scene.add(this.projMesh);

    this.buildPlayer();
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

  /** Called by the game when frame times are poor. */
  setQuality(level: 'high' | 'low'): void {
    this.bloomOn = level === 'high';
    this.pixelRatio = level === 'high' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
    this.particles.density = level === 'high' ? 1 : 0.4;
    this.resize();
  }

  // ---- level ---------------------------------------------------------------

  buildLevel(level: Level): void {
    this.disposeGroup(this.levelGroup);
    this.disposeGroup(this.skyline);
    this.markers.length = 0;
    const solid = level.boxes.filter((b) => !b.wall && !b.hazard && !b.ghost);
    const walls = level.boxes.filter((b) => b.wall);
    const hazards = level.boxes.filter((b) => b.hazard);

    const unit = new THREE.BoxGeometry(1, 1, 1);
    const addInst = (list: Box[], mat: THREE.Material, colorOf: (b: Box, i: number) => number) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(unit, mat, list.length);
      const c = new THREE.Color();
      list.forEach((b, i) => {
        this.dummy.position.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
        this.dummy.scale.set(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        m.setMatrixAt(i, this.dummy.matrix);
        m.setColorAt(i, c.set(colorOf(b, i)));
      });
      m.frustumCulled = false;
      this.levelGroup.add(m);
    };
    addInst(solid, new THREE.MeshLambertMaterial({ color: 0xffffff }), (b) => (b.tag === 'ceiling' ? 0x2a0f3a : b.tag === 'cover' ? 0x1d1450 : COL.floorSide));
    addInst(walls, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x5a2c00 }), () => 0x8a4a12);
    addInst(hazards, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), () => 0xff2a5a);

    // lit top faces so platforms read from far away
    const tops = solid.filter((b) => b.tag !== 'ceiling');
    if (tops.length) {
      const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      const m = new THREE.InstancedMesh(plane, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), tops.length);
      const c = new THREE.Color();
      tops.forEach((b, i) => {
        this.dummy.position.set((b.minX + b.maxX) / 2, b.maxY + 0.012, (b.minZ + b.maxZ) / 2);
        this.dummy.scale.set(b.maxX - b.minX, 1, b.maxZ - b.minZ);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        m.setMatrixAt(i, this.dummy.matrix);
        m.setColorAt(i, c.set(b.tag === 'cover' ? 0x2a1d78 : COL.floorTop));
      });
      m.frustumCulled = false;
      this.levelGroup.add(m);
    }

    // neon edges for every box, one draw call
    const pos: number[] = [];
    const colr: number[] = [];
    const cc = new THREE.Color();
    const edgeColor = (b: Box) => (b.wall ? COL.wall : b.hazard ? COL.hazard : b.tag === 'ceiling' ? COL.ceiling : b.tag === 'cover' ? COL.cover : COL.edge);
    for (const b of level.boxes) {
      if (b.ghost) continue;
      cc.set(edgeColor(b));
      const x0 = b.minX, x1 = b.maxX, y0 = b.minY, y1 = b.maxY, z0 = b.minZ, z1 = b.maxZ;
      const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
        pos.push(ax, ay, az, bx, by, bz);
        colr.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b);
      };
      // top rectangle always; bottom only for non-floor (floors are thick, bottoms are far below)
      seg(x0, y1, z0, x1, y1, z0); seg(x1, y1, z0, x1, y1, z1); seg(x1, y1, z1, x0, y1, z1); seg(x0, y1, z1, x0, y1, z0);
      if (b.tag !== 'floor' && b.tag !== 'pillar') {
        seg(x0, y0, z0, x1, y0, z0); seg(x1, y0, z0, x1, y0, z1); seg(x1, y0, z1, x0, y0, z1); seg(x0, y0, z1, x0, y0, z0);
        seg(x0, y0, z0, x0, y1, z0); seg(x1, y0, z0, x1, y1, z0); seg(x1, y0, z1, x1, y1, z1); seg(x0, y0, z1, x0, y1, z1);
      } else {
        // short verticals so the front face has some definition
        const yl = Math.max(y0, y1 - 0.9);
        seg(x0, y1, z0, x0, yl, z0); seg(x1, y1, z0, x1, yl, z0); seg(x1, y1, z1, x1, yl, z1); seg(x0, y1, z1, x0, yl, z1);
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false }));
    lines.frustumCulled = false;
    this.levelGroup.add(lines);

    // checkpoint + finish beacons
    const beacon = (x: number, y: number, z: number, color: number, h: number, r: number) => {
      const g = new THREE.CylinderGeometry(r, r, h, 12, 1, true);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.position.set(x, y + h / 2, z);
      this.levelGroup.add(m);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 6, 28), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y + 0.1, z);
      this.levelGroup.add(ring);
      this.markers.push({ mesh: ring, spin: 1 });
    };
    for (const cp of level.checkpoints.slice(1)) beacon(cp.x, cp.y, cp.z, COL.checkpoint, 7, 1.4);
    beacon(level.finish.x, level.finish.y, level.finish.z, COL.finish, 24, 2.4);

    this.buildSkyline(level);
  }

  private buildSkyline(level: Level): void {
    const n = 220;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
    const pos: number[] = [];
    const cols: number[] = [];
    const c = new THREE.Color();
    let seed = level.seed * 31 + 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const palette = [0x22e6ff, 0xff3df0, 0x7a5cff];
    for (let i = 0; i < n; i++) {
      const w = 6 + rnd() * 14, d = 6 + rnd() * 14;
      const x = -40 + rnd() * (level.length + 120);
      const side = rnd() < 0.5 ? -1 : 1;
      const z = side * (24 + rnd() * 110);
      const top = -14 - rnd() * 30 + (rnd() < 0.1 ? 40 : 0);
      const h = 80;
      this.dummy.position.set(x, top - h / 2, z);
      this.dummy.scale.set(w, h, d);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      mesh.setColorAt(i, c.set(0x0a0f2c));
      c.set(palette[i % 3]);
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
      const s = (a: number[], b: number[]) => { pos.push(...a, ...b); cols.push(c.r * 0.55, c.g * 0.55, c.b * 0.55, c.r * 0.55, c.g * 0.55, c.b * 0.55); };
      s([x0, top, z0], [x1, top, z0]); s([x1, top, z0], [x1, top, z1]); s([x1, top, z1], [x0, top, z1]); s([x0, top, z1], [x0, top, z0]);
    }
    mesh.frustumCulled = false;
    this.skyline.add(mesh);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const ls = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: false }));
    ls.frustumCulled = false;
    this.skyline.add(ls);
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

  // ---- characters ------------------------------------------------------------

  private buildPlayer(): void {
    const dark = new THREE.MeshLambertMaterial({ color: 0x151a33, emissive: 0x05060f });
    const trim = new THREE.MeshBasicMaterial({ color: 0x22e6ff, toneMapped: false });
    const visor = new THREE.MeshBasicMaterial({ color: 0x66f6ff, toneMapped: false });
    const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    const torso = box(0.34, 0.62, 0.5, dark);
    torso.position.y = 1.15;
    const stripe = box(0.36, 0.08, 0.52, trim);
    stripe.position.y = 0.2;
    torso.add(stripe);
    const head = box(0.3, 0.3, 0.32, dark);
    head.position.set(0.02, 1.62, 0);
    const vz = box(0.06, 0.08, 0.28, visor);
    vz.position.set(0.15, 0.02, 0);
    head.add(vz);
    const legL = box(0.17, 0.7, 0.17, dark);
    const legR = box(0.17, 0.7, 0.17, dark);
    legL.geometry.translate(0, -0.35, 0);
    legR.geometry.translate(0, -0.35, 0);
    legL.position.set(0, 0.75, -0.13);
    legR.position.set(0, 0.75, 0.13);
    const armL = box(0.14, 0.6, 0.14, dark);
    const armR = box(0.14, 0.6, 0.14, dark);
    armL.geometry.translate(0, -0.28, 0);
    armR.geometry.translate(0, -0.28, 0);
    armL.position.set(0, 1.4, -0.33);
    armR.position.set(0, 1.4, 0.33);
    const blade = box(0.05, 1.15, 0.05, new THREE.MeshBasicMaterial({ color: 0xbffcff, toneMapped: false }));
    blade.geometry.translate(0, 0.55, 0);
    blade.position.set(-0.2, 0.95, 0.05);
    blade.rotation.set(0, 0, 0.9);
    const scarf: THREE.Mesh[] = [];
    const sm = new THREE.MeshBasicMaterial({ color: 0xff2e88, toneMapped: false });
    for (let i = 0; i < 7; i++) {
      const s = box(0.38 - i * 0.03, 0.09, 0.09, sm);
      scarf.push(s);
      this.scene.add(s);
      this.scarfHist.push(new THREE.Vector3());
    }
    this.player.add(torso, head, legL, legR, armL, armR, blade);
    this.pParts = { torso, head, legL, legR, armL, armR, blade, visor, scarf };
  }

  syncPlayer(c: Controller, a: PlayerAnim, dt: number): void {
    const p = this.pParts;
    this.clock += dt;
    this.player.visible = !a.hidden;
    for (const s of p.scarf) s.visible = !a.hidden;
    this.player.position.set(c.x, c.y, c.z);
    // smooth facing
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
    let rollZ = 0;
    if (!c.onGround && c.state !== 'wallrun') {
      p.legL.rotation.z = 0.6; p.legR.rotation.z = -0.4;
      p.armL.rotation.z = -1.1; p.armR.rotation.z = -1.1;
    }
    if (c.state === 'slide') {
      lean = -0.9; squash = 0.55;
      p.legL.rotation.z = 1.3; p.legR.rotation.z = 1.2;
      this.player.position.y -= 0.25;
    } else if (c.state === 'wallrun') {
      rollZ = c.wallNz !== 0 || c.wallNx !== 0 ? 0.35 : 0;
      p.legL.rotation.z = swing; p.legR.rotation.z = -swing;
    } else if (c.state === 'dash' || a.lunging) {
      lean = 0.7;
      p.legL.rotation.z = -0.5; p.legR.rotation.z = -0.3;
      p.armL.rotation.z = -1.4; p.armR.rotation.z = -1.4;
    }
    p.torso.rotation.z = lean;
    p.head.position.x = 0.02 + lean * 0.4;
    p.torso.scale.y = squash;
    this.player.rotation.x = rollZ * (c.wallNz > 0 ? 1 : -1) * 0.0;
    // sword swing
    if (a.slash > 0) {
      const k = 1 - a.slash / 0.28;
      p.armR.rotation.z = -2.6 + k * 3.2;
      p.blade.position.set(0.3, 1.2, 0.3);
      p.blade.rotation.set(0.3 * (1 - k), 0, 2.6 - k * 4.2);
    } else {
      p.blade.position.set(-0.2, 0.95, 0.05);
      p.blade.rotation.set(0, 0, 0.9);
    }
    p.visor.color.setHex(a.invuln ? ((Math.floor(a.time * 24) & 1) ? 0xffffff : 0x3377ff) : a.deflect > 0 ? 0xffee66 : 0x66f6ff);

    // scarf: chain of boxes lagging behind the neck
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
    for (const e of combat.enemies) {
      const g = new THREE.Group();
      const baseColor = e.type === 'gunner' ? 0x3a1020 : e.type === 'charger' ? 0x3a2410 : 0x10253a;
      const body = new THREE.MeshLambertMaterial({ color: baseColor, emissive: 0x100408 });
      const eyeColor = e.type === 'gunner' ? 0xff2a55 : e.type === 'charger' ? 0xffa21f : 0x44ccff;
      const eye = new THREE.MeshBasicMaterial({ color: eyeColor, toneMapped: false });
      const parts: THREE.Object3D[] = [];
      if (e.type === 'gunner') {
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.7), body);
        torso.position.y = 0.95;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.5), body);
        head.position.y = 1.7;
        const eyeM = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.4), eye);
        eyeM.position.set(0.26, 1.72, 0);
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.16), eye);
        gun.position.set(0.55, 1.2, 0.35);
        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), body);
        legs.position.y = 0.25;
        g.add(torso, head, eyeM, gun, legs);
        parts.push(torso, head);
      } else if (e.type === 'charger') {
        const torso = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 1.3), body);
        torso.position.y = 0.8;
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 5), eye);
        horn.rotation.z = -Math.PI / 2;
        horn.position.set(0.9, 0.95, 0);
        const eyeM = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.9), eye);
        eyeM.position.set(0.62, 1.12, 0);
        const legs = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 1.0), body);
        legs.position.y = 0.2;
        g.add(torso, horn, eyeM, legs);
        parts.push(torso);
      } else {
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), body);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 6, 20), eye);
        ring.rotation.x = Math.PI / 2;
        const eyeM = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), eye);
        eyeM.position.set(0.55, 0, 0);
        g.add(core, ring, eyeM);
        parts.push(core, ring);
      }
      this.scene.add(g);
      const laser = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: eyeColor, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      laser.visible = false;
      this.scene.add(laser);
      this.enemyViews.push({ group: g, eye, body, laser, parts });
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
      const pulse = e.state === 'aim' || e.state === 'windup' ? 0.5 + 0.5 * Math.sin(time * (14 + e.telegraph * 30)) : 0;
      const k = e.telegraph;
      v.eye.color.setRGB(1 + k * 3 + pulse, 1 + k * 3 + pulse, 1 + k * 3 + pulse).multiply(new THREE.Color(e.type === 'gunner' ? 0xff2a55 : e.type === 'charger' ? 0xffa21f : 0x44ccff));
      if (e.type === 'drone') v.group.rotation.z = Math.sin(time * 3 + e.id) * 0.15;
      if (e.type === 'charger' && e.state === 'windup') v.group.scale.setScalar(1 + Math.sin(time * 40) * 0.06);
      else v.group.scale.setScalar(1);
      // laser for shooters while aiming; ground line for charger wind-up
      const showLaser = (e.type !== 'charger' && e.state === 'aim') || (e.type === 'charger' && e.state === 'windup');
      v.laser.visible = showLaser;
      if (showLaser) {
        const ox = e.x, oy = e.y + (e.type === 'drone' ? 0.2 : e.type === 'charger' ? 0.6 : 1.3), oz = e.z;
        const tx = e.type === 'charger' ? e.x + e.dirX * 8 : px, ty = e.type === 'charger' ? oy : py + 0.9, tz = e.type === 'charger' ? e.z + e.dirZ * 8 : pz;
        dir.set(tx - ox, ty - oy, tz - oz);
        const len = dir.length();
        v.laser.position.set(ox + dir.x / 2, oy + dir.y / 2, oz + dir.z / 2);
        v.laser.quaternion.setFromUnitVectors(up, dir.normalize());
        const w = 0.012 + k * 0.05;
        v.laser.scale.set(w, len, w);
        (v.laser.material as THREE.MeshBasicMaterial).opacity = 0.35 + k * 0.65;
      }
    });
  }

  syncProjectiles(combat: Combat, time: number): void {
    const c = new THREE.Color();
    const n = Math.min(combat.projectiles.length, 128);
    for (let i = 0; i < n; i++) {
      const b = combat.projectiles[i];
      this.dummy.position.set(b.x, b.y, b.z);
      const s = 0.42 + Math.sin(time * 30 + i) * 0.05;
      this.dummy.scale.setScalar(s);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.projMesh.setMatrixAt(i, this.dummy.matrix);
      this.projMesh.setColorAt(i, b.owner === 'enemy' ? c.setRGB(3, 0.25, 0.5) : c.setRGB(0.5, 2.6, 3));
    }
    this.projMesh.count = n;
    this.projMesh.instanceMatrix.needsUpdate = true;
    if (this.projMesh.instanceColor) this.projMesh.instanceColor.needsUpdate = true;
  }

  // ---- camera --------------------------------------------------------------------------

  /** Third-person chase camera. yaw/pitch are the player's look angles. */
  updateCamera(c: Controller, yaw: number, pitch: number, dt: number, boxes: Box[]): void {
    const head = new THREE.Vector3(c.x, c.y + (c.state === 'slide' ? 0.9 : 1.55), c.z);
    if (!this.camInit) {
      this.camFocus.copy(head);
      this.camInit = true;
    }
    // smooth the focus point vertically more than horizontally to hide step-ups
    const kx = 1 - Math.pow(0.0001, dt);
    this.camFocus.x += (head.x - this.camFocus.x) * kx;
    this.camFocus.z += (head.z - this.camFocus.z) * kx;
    this.camFocus.y += (head.y - this.camFocus.y) * (1 - Math.pow(0.004, dt));
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const fx = cp * Math.cos(yaw), fy = sp, fz = cp * Math.sin(yaw);
    // right vector (for a slight over-the-shoulder offset)
    const rx = -Math.sin(yaw), rz = Math.cos(yaw);
    const dist = 4.6 + c.speed * 0.04;
    const fx0 = this.camFocus.x + rx * 0.7, fy0 = this.camFocus.y + 0.25, fz0 = this.camFocus.z + rz * 0.7;
    let dx = fx0 - fx * dist, dy = fy0 - fy * dist, dz = fz0 - fz * dist;
    // pull the camera in when geometry is in the way
    if (segmentBlocked(boxes.filter((b) => !b.hazard && !b.wall), fx0, fy0, fz0, dx, dy, dz)) {
      let lo = 0.1, hi = 1;
      const bl = boxes.filter((b) => !b.hazard && !b.wall);
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

  /** Attract-mode / free camera. */
  setCameraRaw(x: number, y: number, z: number, lx: number, ly: number, lz: number): void {
    this.camera.position.set(x, y, z);
    this.camera.lookAt(lx, ly, lz);
  }

  projectToScreen(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 && v.z > -1 };
  }

  render(dt: number): void {
    for (const m of this.markers) m.mesh.rotation.z += dt * 1.6 * m.spin;
    this.fx.update(dt);
    this.particles.update(dt);
    if (this.bloomOn) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
