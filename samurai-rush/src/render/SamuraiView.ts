import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Effects, Particles } from '../game/Fx';
import { Look, Rig, RigState } from './Rig';
import { Enemy, Player, Projectile, World } from '../samurai/World';
import { EKind, P } from '../samurai/data';
import { Theme } from '../samurai/stages';

// ------------------------------------------------------------------ colour grade

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 }, aberr: { value: 0.0008 }, vig: { value: 0.42 }, sat: { value: 1.1 }, contrast: { value: 1.1 }, grain: { value: 0.035 },
    tint: { value: new THREE.Color(1, 1, 1) }, flash: { value: new THREE.Color(0, 0, 0) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float aberr; uniform float vig; uniform float sat; uniform float contrast; uniform float grain; uniform vec3 tint; uniform vec3 flash; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float d = length(c); vec2 off = c * aberr * (0.4 + d * 2.0);
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, sat);
      col = (col - 0.5) * contrast + 0.5;
      col *= tint;
      col *= 1.0 - vig * smoothstep(0.3, 0.95, d * 1.3);
      col += flash;
      col += (rnd(vUv * vec2(1920.0, 1080.0) + time) - 0.5) * grain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

// ------------------------------------------------------------------ themes

interface ThemeDef {
  skyTop: number; skyHor: number; skyBot: number; fog: number; fogD: number;
  hemiSky: number; hemiGround: number; hemiI: number; sun: number; sunI: number; sunPos: [number, number, number];
  exposure: number; bloom: number; ground: number; moon: number; moonSize: number; lamp: number;
}

const THEME_DEFS: Record<Theme, ThemeDef> = {
  bamboo: { skyTop: 0x040a1c, skyHor: 0x1d3a54, skyBot: 0x0a1218, fog: 0x14293a, fogD: 0.021, hemiSky: 0x6f8fd8, hemiGround: 0x1b2a22, hemiI: 1.15, sun: 0xaecbff, sunI: 2.6, sunPos: [-8, 14, 9], exposure: 1.25, bloom: 0.38, ground: 0x34402c, moon: 0xdfeaff, moonSize: 40, lamp: 0xbfd8ff },
  village: { skyTop: 0x0c0810, skyHor: 0x6a3020, skyBot: 0x140c0c, fog: 0x2a1812, fogD: 0.024, hemiSky: 0xb8a8c0, hemiGround: 0x2a1c18, hemiI: 1.0, sun: 0xffc090, sunI: 1.6, sunPos: [6, 12, 10], exposure: 1.2, bloom: 0.5, ground: 0x3a3028, moon: 0xff9a60, moonSize: 52, lamp: 0xff8a40 },
  bridge: { skyTop: 0x0a121a, skyHor: 0x44566a, skyBot: 0x151c24, fog: 0x2c3a4a, fogD: 0.03, hemiSky: 0x8aa0c0, hemiGround: 0x20262e, hemiI: 1.2, sun: 0xc8d8f0, sunI: 1.9, sunPos: [-6, 14, 8], exposure: 1.05, bloom: 0.3, ground: 0x4a3c30, moon: 0xcfdcff, moonSize: 30, lamp: 0xffd890 },
  castle: { skyTop: 0x06040a, skyHor: 0x2a1218, skyBot: 0x0a0608, fog: 0x1d0e10, fogD: 0.02, hemiSky: 0xe0b890, hemiGround: 0x2a1812, hemiI: 1.0, sun: 0xffd8a0, sunI: 1.6, sunPos: [4, 12, 10], exposure: 1.1, bloom: 0.42, ground: 0x5a4430, moon: 0xffe0b0, moonSize: 36, lamp: 0xffc070 },
};

const hash = (n: number): number => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, rx = 1, ry = 1, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const noiseFill = (g: CanvasRenderingContext2D, w: number, h: number, base: string, amt: number, seed = 1) => {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h * 0.05; i++) {
    const v = hash(i * 1.7 + seed) ;
    g.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${amt * Math.abs(v - 0.5)})`;
    g.fillRect(hash(i + seed * 3) * w, hash(i * 3.1 + seed) * h, 2, 2);
  }
};

const TEX: Record<string, THREE.CanvasTexture> = {};
function tex(name: string): THREE.CanvasTexture {
  if (TEX[name]) return TEX[name];
  let t: THREE.CanvasTexture;
  switch (name) {
    case 'dirt':
      t = canvasTex(256, 256, (g) => {
        noiseFill(g, 256, 256, '#8a7a62', 0.5, 2);
        for (let i = 0; i < 40; i++) {
          g.fillStyle = `rgba(30,24,16,${0.08 + hash(i) * 0.12})`;
          g.beginPath();
          g.ellipse(hash(i * 5) * 256, hash(i * 9) * 256, 6 + hash(i * 2) * 18, 3 + hash(i * 4) * 8, 0, 0, 7);
          g.fill();
        }
      }, 40, 3);
      break;
    case 'planks':
      t = canvasTex(256, 256, (g) => {
        for (let i = 0; i < 4; i++) {
          g.fillStyle = `hsl(28,${30 + hash(i) * 12}%,${24 + hash(i * 3) * 10}%)`;
          g.fillRect(0, i * 64, 256, 64);
          for (let k = 0; k < 30; k++) {
            g.fillStyle = `rgba(0,0,0,${0.05 + hash(k + i * 50) * 0.1})`;
            g.fillRect(hash(k * 7 + i) * 256, i * 64 + hash(k * 3 + i) * 64, 40 + hash(k) * 80, 1);
          }
          g.fillStyle = 'rgba(0,0,0,0.65)';
          g.fillRect(0, i * 64, 256, 3);
        }
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(hash(7) * 200 + 20, 0, 3, 256);
      }, 60, 2);
      break;
    case 'tatami':
      t = canvasTex(256, 256, (g) => {
        g.fillStyle = '#9a8f58';
        g.fillRect(0, 0, 256, 256);
        for (let y = 0; y < 256; y += 3) {
          g.fillStyle = `rgba(${hash(y) > 0.5 ? '255,255,200' : '40,40,10'},0.07)`;
          g.fillRect(0, y, 256, 1);
        }
        g.fillStyle = '#1d1a10';
        g.fillRect(0, 0, 256, 6);
        g.fillRect(0, 128, 256, 4);
        g.fillRect(0, 0, 5, 256);
        g.fillRect(128, 0, 3, 256);
      }, 28, 2);
      break;
    case 'shoji':
      t = canvasTex(256, 256, (g) => {
        g.fillStyle = '#ffd89a';
        g.fillRect(0, 0, 256, 256);
        g.strokeStyle = '#3a2412';
        g.lineWidth = 5;
        for (let i = 0; i <= 4; i++) {
          g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
        }
        for (let j = 0; j <= 6; j++) {
          g.beginPath(); g.moveTo(0, j * 42.6); g.lineTo(256, j * 42.6); g.stroke();
        }
        g.strokeRect(0, 0, 256, 256);
      }, 14, 1);
      break;
    case 'banner':
      t = canvasTex(128, 256, (g) => {
        g.fillStyle = '#7a1414';
        g.fillRect(0, 0, 128, 256);
        g.fillStyle = '#e8dcc0';
        g.beginPath(); g.arc(64, 110, 36, 0, 7); g.fill();
        g.fillStyle = '#7a1414';
        g.beginPath(); g.arc(64, 110, 24, 0, 7); g.fill();
        g.fillStyle = '#e8dcc0';
        g.fillRect(0, 0, 128, 8); g.fillRect(0, 248, 128, 8);
      }, 1, 1);
      break;
    case 'moon':
      t = canvasTex(256, 256, (g) => {
        const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        r.addColorStop(0, 'rgba(255,255,255,1)');
        r.addColorStop(0.28, 'rgba(255,255,255,1)');
        r.addColorStop(0.34, 'rgba(255,255,255,0.35)');
        r.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = r;
        g.fillRect(0, 0, 256, 256);
      });
      break;
    case 'flame':
      t = canvasTex(64, 128, (g) => {
        const r = g.createRadialGradient(32, 90, 2, 32, 80, 56);
        r.addColorStop(0, 'rgba(255,240,180,1)');
        r.addColorStop(0.35, 'rgba(255,150,40,0.9)');
        r.addColorStop(1, 'rgba(200,40,0,0)');
        g.fillStyle = r;
        g.beginPath();
        g.moveTo(32, 2); g.bezierCurveTo(60, 50, 64, 90, 32, 126); g.bezierCurveTo(0, 90, 4, 50, 32, 2);
        g.fill();
      });
      break;
    default:
      t = canvasTex(4, 4, () => undefined);
  }
  TEX[name] = t;
  return t;
}

function ridgeTex(seed: number, color: string): THREE.CanvasTexture {
  return canvasTex(1024, 256, (g) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, 256);
    let y = 150;
    for (let x = 0; x <= 1024; x += 8) {
      y = 110 + Math.sin(x * 0.011 + seed) * 40 + Math.sin(x * 0.031 + seed * 2) * 18 + hash(x + seed) * 12;
      g.lineTo(x, y);
    }
    g.lineTo(1024, 256);
    g.fill();
  }, 1, 1);
}

// ------------------------------------------------------------------ rig looks

function lookFor(kind: EKind | 'player', id: number): Look {
  const skin = [0xe0b08c, 0xc58c64, 0xd8a47c][Math.floor(hash(id * 7) * 3)];
  switch (kind) {
    case 'player': return { skin: 0xe6b894, hair: 0x14110f, top: 0xe8e2d4, sleeves: true, pants: 0x1a1d26, shoes: 0x15151a, scale: 1, bulk: 1, hairStyle: 'topknot', hakama: 0x1d2236, sash: 0xc0392b, saya: true, scarf: 0xd9402a };
    case 'ashigaru': return { skin, hair: 0x1a1612, top: 0x6b5a3a, sleeves: true, pants: 0x3a3a30, shoes: 0x2a2a22, scale: 0.98 + hash(id) * 0.06, bulk: 1, hairStyle: 'short', hat: 'jingasa', armor: 0x3a342c, trim: 0x2a2620, hakama: 0x44402e };
    case 'swordsman': return { skin, hair: 0x111111, top: 0x3d5a80, sleeves: true, pants: 0x20252e, shoes: 0x15151a, scale: 1.02, bulk: 1, hairStyle: 'topknot', hat: id % 2 ? 'ronin' : 'none', hakama: 0x1c2230, sash: 0x8a2a2a, saya: true };
    case 'archer': return { skin, hair: 0x1a1612, top: 0x2f6b4f, sleeves: true, pants: 0x2a3a2a, shoes: 0x2a2a22, scale: 0.99, bulk: 0.95, hairStyle: 'topknot', hakama: 0x26382a, sash: 0xd0c090 };
    case 'ninja': return { skin, hair: 0x101010, top: 0x14161c, sleeves: true, pants: 0x12141a, shoes: 0x08080a, scale: 0.96, bulk: 0.9, hairStyle: 'hood', mask: 0x1a1c22, scarf: 0x9a1a1a };
    case 'oni': return { skin: 0xb8402f, hair: 0x120a0a, top: 0xb8402f, sleeves: false, pants: 0x3a2a1a, shoes: 0x1a1a1a, scale: 1.45, bulk: 1.55, hairStyle: 'long', horns: true, hakama: 0x4a3a18, sash: 0xe0a020 };
    case 'shogun': return { skin: 0xd8b090, hair: 0x9a9a9a, top: 0x1a1a22, sleeves: true, pants: 0x15151a, shoes: 0x08080a, scale: 1.18, bulk: 1.12, hairStyle: 'topknot', hat: 'kabuto', armor: 0x7a1f1f, trim: 0xc9a24a, hakama: 0x14141a, sash: 0xc9a24a, saya: true };
  }
}

const WEAPON: Record<EKind, 'katana' | 'spear' | 'bow' | 'club' | 'kunai'> = {
  ashigaru: 'spear', swordsman: 'katana', archer: 'bow', ninja: 'kunai', oni: 'club', shogun: 'katana',
};

const ICON_COLOR = { blue: 0x2f80ff, red: 0xff2a2a, shot: 0xffd000 } as const;

// ------------------------------------------------------------------ helpers

interface Actor {
  rig: Rig;
  kind: EKind | 'player';
  hp: number;
  hit: number;
}

interface Half {
  pivot: THREE.Group;
  plane: THREE.Plane;
  n: THREE.Vector3;
  vx: number; vy: number; w: number; life: number;
  mats: THREE.MeshStandardMaterial[];
}

interface Ghost {
  obj: THREE.Object3D;
  mat: THREE.MeshBasicMaterial;
  life: number;
  max: number;
}

interface Trail {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  life: number;
  max: number;
}

const TRAIL_SEG = 28;

function crescentGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], s: number[] = [], idx: number[] = [];
  for (let i = 0; i <= TRAIL_SEG; i++) {
    const u = i / TRAIL_SEG;
    const th = (u - 0.5) * 2.1;
    const thick = Math.sin(u * Math.PI) * 0.26 + 0.02;
    const r = 1;
    pos.push(Math.cos(th) * (r - thick), Math.sin(th) * (r - thick), 0, Math.cos(th) * (r + thick * 0.15), Math.sin(th) * (r + thick * 0.15), 0);
    s.push(u, u);
    if (i < TRAIL_SEG) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('s', new THREE.Float32BufferAttribute(s, 1));
  g.setIndex(idx);
  return g;
}

export class SamuraiView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.3, 600);
  readonly fx: Effects;
  readonly particles: Particles;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private pixelRatio = 1;
  private bloomOn = true;

  private hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
  private sun = new THREE.DirectionalLight(0xffffff, 2);
  private fill = new THREE.DirectionalLight(0xffffff, 1.1);
  private rim = new THREE.DirectionalLight(0xffffff, 1.4);
  private skyMat: THREE.ShaderMaterial;
  private sky: THREE.Mesh;
  private moon: THREE.Mesh;
  private ridges: { m: THREE.Mesh; k: number }[] = [];
  private env = new THREE.Group();
  private theme: ThemeDef = THEME_DEFS.bamboo;
  private themeName: Theme = 'bamboo';
  private lamps: THREE.PointLight[] = [];
  private flames: { m: THREE.Mesh; ph: number; base: number }[] = [];
  private rain: THREE.InstancedMesh | null = null;
  private rainSeed: Float32Array = new Float32Array(0);
  private lockWalls: THREE.Mesh[] = [];
  private lightningT = 4;
  private lightning = 0;

  private actors = new Map<number, Actor>();
  private player: Actor;
  private projs = new Map<number, THREE.Object3D>();
  private halves: Half[] = [];
  private ghosts: Ghost[] = [];
  private trails: Trail[] = [];
  private crescent = crescentGeometry();
  private ghostT = 0;
  private djumpT = 0;
  private ambT = 0;
  private t = 0;

  // camera state
  private camX = 0;
  private camY = 2.6;
  private camZ = 11.6;
  shake = 0;
  private shakeT = 0;
  /** 0..1 how much the player's iai charge zooms in. */
  zoom = 0;
  /** Horizontal camera offset (title screen puts the hero to the right). */
  camBias = 0;
  private fovKick = 0;
  private aberr = 0;
  private flashK = 0;
  private flashCol = new THREE.Color(1, 1, 1);
  private tintK = 0;
  private slowTint = 0;
  private rollK = 0;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';

    this.scene.fog = new THREE.FogExp2(0x222222, 0.02);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 14; sc.bottom = -8; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.06;
    this.fill.position.set(2, 5, 14);
    this.rim.position.set(0, 6, -12);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.env, this.fill, this.rim);

    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(hor, top, pow(clamp(h,0.0,1.0), 0.5)) : mix(hor, bot, pow(clamp(-h,0.0,1.0), 0.4)); gl_FragColor = vec4(c, 1.0); }',
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    this.moon = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex('moon'), transparent: true, depthWrite: false, fog: false, toneMapped: false }),
    );
    this.moon.renderOrder = -9;
    this.scene.add(this.moon);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.6, 0.85);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(new SMAAPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.fx = new Effects(this.scene);
    this.particles = new Particles(this.scene, 3500);

    for (let i = 0; i < 2; i++) {
      const w = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 9),
        new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      );
      w.rotation.y = Math.PI / 2;
      w.visible = false;
      this.scene.add(w);
      this.lockWalls.push(w);
    }

    const prig = new Rig(lookFor('player', 0));
    prig.setWeapon('katana');
    this.scene.add(prig.root);
    this.player = { rig: prig, kind: 'player', hp: 100, hit: 0 };

    this.setTheme('bamboo', 240);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // ------------------------------------------------------------------ setup

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
    this.resize();
  }

  setTheme(name: Theme, length: number): void {
    const T = THEME_DEFS[name];
    this.theme = T;
    this.themeName = name;
    (this.skyMat.uniforms.top.value as THREE.Color).setHex(T.skyTop);
    (this.skyMat.uniforms.hor.value as THREE.Color).setHex(T.skyHor);
    (this.skyMat.uniforms.bot.value as THREE.Color).setHex(T.skyBot);
    (this.scene.fog as THREE.FogExp2).color.setHex(T.fog);
    (this.scene.fog as THREE.FogExp2).density = T.fogD;
    this.hemi.color.setHex(T.hemiSky);
    this.hemi.groundColor.setHex(T.hemiGround);
    this.hemi.intensity = T.hemiI;
    this.sun.color.setHex(T.sun);
    this.fill.color.setHex(T.hemiSky);
    this.rim.color.setHex(T.sun);
    this.sun.intensity = T.sunI;
    this.renderer.toneMappingExposure = T.exposure;
    this.bloom.strength = T.bloom;
    const mm = this.moon.material as THREE.MeshBasicMaterial;
    mm.color.setHex(T.moon);
    this.moon.scale.setScalar(T.moonSize);
    this.buildEnv(name, length);
  }

  private clearEnv(): void {
    this.env.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.env.clear();
    for (const l of this.lamps) this.scene.remove(l);
    this.lamps = [];
    this.flames = [];
    this.ridges = [];
    this.rain = null;
  }

  private buildEnv(name: Theme, length: number): void {
    this.clearEnv();
    const T = this.theme;
    const x0 = -34, x1 = Math.max(60, length) + 44;
    const W = x1 - x0, cx = (x0 + x1) / 2;
    const std = (color: number, rough = 0.85, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    const add = (o: THREE.Object3D) => { this.env.add(o); return o; };

    // ---- ground
    const groundTex = name === 'bridge' ? tex('planks') : name === 'castle' ? tex('tatami') : tex('dirt');
    const gm = new THREE.MeshStandardMaterial({ map: groundTex, color: name === 'castle' ? 0xffffff : 0xd0d0d0, roughness: 0.95 });
    const gt = groundTex.clone();
    gt.needsUpdate = true;
    gt.repeat.set(W / (name === 'bridge' ? 2.2 : name === 'castle' ? 2.4 : 6), name === 'bridge' ? 2 : 3);
    gm.map = gt;
    const ground = new THREE.Mesh(new THREE.BoxGeometry(W, 1, 15), gm);
    ground.position.set(cx, -0.5, 0.5);
    ground.receiveShadow = true;
    add(ground);
    if (name !== 'bridge' && name !== 'castle') {
      const far = new THREE.Mesh(new THREE.PlaneGeometry(W, 70), std(T.ground, 1));
      far.rotation.x = -Math.PI / 2;
      far.position.set(cx, -0.05, -42);
      far.receiveShadow = true;
      add(far);
    }

    // ---- distant ridges
    const ridgeCols = name === 'village' ? ['#3a1a14', '#2a120e'] : name === 'castle' ? ['#241418', '#1a0e10'] : ['#16222e', '#0e1620'];
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(520, 130),
        new THREE.MeshBasicMaterial({ map: ridgeTex(i * 3 + 1, ridgeCols[i]), transparent: true, depthWrite: false, fog: true }),
      );
      m.position.set(0, 44 + i * -8, -170 + i * 60);
      this.scene.add(m);
      this.env.add(m);
      this.ridges.push({ m, k: 0.9 - i * 0.2 });
    }

    const rng = (n: number) => hash(n * 3.17 + name.length * 11);

    if (name === 'bamboo') {
      const n = Math.floor(W * 1.6);
      const stalk = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 7, 1), std(0x4c7a3c, 0.6), n);
      const dummy = new THREE.Object3D();
      const col = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const row = i % 5;
        const z = row === 0 ? -2.4 - rng(i) * 0.8 : row === 1 ? -3.4 - rng(i) * 1.2 : -4 - rng(i + 9) * 26;
        const r = 0.07 + rng(i + 3) * 0.08;
        const h = 22;
        dummy.position.set(x0 + rng(i + 5) * W, h / 2, z);
        dummy.scale.set(r, h, r);
        dummy.rotation.set((rng(i + 6) - 0.5) * 0.05, 0, (rng(i + 7) - 0.5) * 0.05);
        dummy.updateMatrix();
        stalk.setMatrixAt(i, dummy.matrix);
        col.setHSL(0.25 + rng(i) * 0.06, 0.38, 0.2 + rng(i + 1) * 0.12);
        stalk.setColorAt(i, col);
      }
      stalk.castShadow = true;
      add(stalk);
      // leaf cards
      const leafN = Math.floor(W * 1.1);
      const leaf = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.8, 0.28), new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.8, side: THREE.DoubleSide }), leafN);
      for (let i = 0; i < leafN; i++) {
        dummy.position.set(x0 + rng(i + 40) * W, 6 + rng(i + 41) * 7, -3 - rng(i + 42) * 20);
        dummy.scale.setScalar(0.8 + rng(i + 43));
        dummy.rotation.set(0, rng(i + 44) * 3, (rng(i + 45) - 0.5) * 1.4);
        dummy.updateMatrix();
        leaf.setMatrixAt(i, dummy.matrix);
      }
      add(leaf);
      // stone lanterns
      for (let x = 20; x < x1; x += 34) this.stoneLantern(x, -2.2, add);
    } else if (name === 'village') {
      for (let x = x0; x < x1; x += 10 + rng(x) * 6) {
        const z = -7 - rng(x + 1) * 9;
        const g = new THREE.Group();
        const w = 5 + rng(x + 2) * 3, d = 4 + rng(x + 3) * 2, h = 2.6 + rng(x + 4);
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(0x6a5038, 0.9));
        body.position.y = h / 2;
        body.castShadow = true;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.2, 4), std(0x241c1a, 0.8));
        roof.rotation.y = Math.PI / 4;
        roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
        roof.position.y = h + 1.1;
        roof.castShadow = true;
        const burnt = rng(x + 5) > 0.45;
        g.add(body, roof);
        if (burnt) {
          const f = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.0), new THREE.MeshBasicMaterial({ map: tex('flame'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
          f.position.set((rng(x + 6) - 0.5) * w * 0.6, h + 1.5, d / 2 + 0.2);
          g.add(f);
          this.flames.push({ m: f, ph: rng(x), base: 1 + rng(x + 8) });
        }
        g.position.set(x, 0, z);
        add(g);
      }
      // ground-level fires + broken carts
      for (let x = 12; x < x1; x += 17 + rng(x) * 10) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.0), new THREE.MeshBasicMaterial({ map: tex('flame'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
        f.position.set(x, 1.3, -2.4);
        add(f);
        this.flames.push({ m: f, ph: rng(x * 2), base: 1 });
      }
      for (let i = 0; i < 3; i++) {
        const l = new THREE.PointLight(0xff8a40, 24, 24, 1.6);
        this.scene.add(l);
        this.lamps.push(l);
      }
    } else if (name === 'bridge') {
      const postN = Math.floor(W / 3);
      const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 1.7, 0.26), std(0x3a2a1c, 0.85), postN * 2);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < postN; i++) {
        for (let s = 0; s < 2; s++) {
          dummy.position.set(x0 + i * 3, 0.85, s ? -4.6 : -3.9);
          dummy.updateMatrix();
          post.setMatrixAt(i * 2 + s, dummy.matrix);
        }
      }
      post.castShadow = true;
      add(post);
      for (const z of [-3.9, -4.6]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(W, 0.14, 0.14), std(0x3a2a1c, 0.8));
        rail.position.set(cx, 1.4, z);
        add(rail);
        const rail2 = rail.clone();
        rail2.position.y = 0.8;
        add(rail2);
      }
      // lanterns on posts
      for (let x = x0 + 6; x < x1; x += 15) {
        const lan = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false }));
        lan.scale.y = 1.3;
        lan.position.set(x, 2.1, -3.9);
        add(lan);
        const ps = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), std(0x2a1c10));
        ps.position.set(x, 1.5, -3.9);
        add(ps);
      }
      // support pillars into the mist
      for (let x = x0; x < x1; x += 14) {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(1.2, 30, 1.2), std(0x2a2018, 0.9));
        pl.position.set(x, -15.5, -2.5);
        add(pl);
      }
      const mist = new THREE.Mesh(new THREE.PlaneGeometry(W, 60), new THREE.MeshBasicMaterial({ color: T.fog, transparent: true, opacity: 0.55, depthWrite: false }));
      mist.rotation.x = -Math.PI / 2;
      mist.position.set(cx, -5, -20);
      add(mist);
      // far mountains' pines
      for (let i = 0; i < 30; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(2 + rng(i) * 2, 9 + rng(i + 1) * 6, 6), std(0x15202a, 1));
        c.position.set(x0 + rng(i + 2) * W, 3, -30 - rng(i + 3) * 40);
        add(c);
      }
      const N = 520;
      this.rain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.9, 0.018), new THREE.MeshBasicMaterial({ color: 0xbcd0ea, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }), N);
      this.rain.frustumCulled = false;
      this.rainSeed = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        this.rainSeed[i * 3] = rng(i + 70) * 40 - 20;
        this.rainSeed[i * 3 + 1] = rng(i + 71) * 16;
        this.rainSeed[i * 3 + 2] = rng(i + 72) * 18 - 9;
      }
      this.scene.add(this.rain);
      this.env.add(this.rain);
    } else {
      // castle hall
      const floorBack = new THREE.Mesh(new THREE.PlaneGeometry(W, 14), new THREE.MeshStandardMaterial({ map: tex('shoji'), emissive: 0xffa860, emissiveMap: tex('shoji'), emissiveIntensity: 0.65, roughness: 1 }));
      (floorBack.material as THREE.MeshStandardMaterial).map = tex('shoji').clone();
      (floorBack.material as THREE.MeshStandardMaterial).map!.repeat.set(W / 4.5, 1);
      (floorBack.material as THREE.MeshStandardMaterial).emissiveMap = (floorBack.material as THREE.MeshStandardMaterial).map;
      floorBack.position.set(cx, 7, -9);
      add(floorBack);
      const ceil = new THREE.Mesh(new THREE.BoxGeometry(W, 1, 22), std(0x1a100c, 0.9));
      ceil.position.set(cx, 11, -2);
      add(ceil);
      const pillarN = Math.floor(W / 8);
      const pil = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 11, 0.7), std(0x6a1a14, 0.4, 0.15), pillarN);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < pillarN; i++) {
        dummy.position.set(x0 + i * 8, 5.5, -4.2);
        dummy.updateMatrix();
        pil.setMatrixAt(i, dummy.matrix);
      }
      pil.castShadow = true;
      add(pil);
      for (let i = 0; i < pillarN; i++) {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.4), new THREE.MeshStandardMaterial({ map: tex('banner'), roughness: 0.9, side: THREE.DoubleSide }));
        b.position.set(x0 + i * 8 + 4, 5.2, -8.6);
        add(b);
        const lan = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb060, toneMapped: false }));
        lan.scale.y = 1.4;
        lan.position.set(x0 + i * 8 + 4, 4.7, -2.4);
        add(lan);
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4, 4), std(0x201008));
        cord.position.set(x0 + i * 8 + 4, 7.4, -2.4);
        add(cord);
      }
      for (let i = 0; i < 3; i++) {
        const l = new THREE.PointLight(0xffa860, 60, 30, 1.5);
        this.scene.add(l);
        this.lamps.push(l);
      }
    }
    this.moon.visible = name !== 'castle';
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  private stoneLantern(x: number, z: number, add: (o: THREE.Object3D) => THREE.Object3D): void {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x6a6e72, roughness: 0.9 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), m);
    base.position.y = 0.45;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.6), m);
    box.position.y = 1.2;
    const lit = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.62), new THREE.MeshBasicMaterial({ color: 0xffd890, toneMapped: false }));
    lit.position.y = 1.2;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.4, 4), m);
    cap.rotation.y = Math.PI / 4;
    cap.position.y = 1.7;
    g.add(base, box, lit, cap);
    g.position.set(x, 0, z);
    add(g);
  }

  // ------------------------------------------------------------------ actors

  private makeActor(kind: EKind, id: number): Actor {
    const rig = new Rig(lookFor(kind, id));
    rig.setWeapon(WEAPON[kind]);
    this.scene.add(rig.root);
    return { rig, kind, hp: 0, hit: 0 };
  }

  private playerState(p: Player): RigState {
    let anim = 'idle';
    let atk: RigState['atk'] = null;
    let t = p.t;
    switch (p.state) {
      case 'slash':
        anim = p.slash!.id;
        atk = { wind: p.slash!.wind, strike: p.slash!.active, rec: p.slash!.rec };
        break;
      case 'dash': anim = 'dash'; break;
      case 'parry': anim = 'parry'; break;
      case 'iai':
        anim = 'iai';
        atk = { wind: P.iaiCharge, strike: 0.12, rec: 0.3 };
        break;
      case 'hurt': anim = 'hurt'; break;
      case 'dead': anim = 'dead'; break;
      default:
        t = this.djumpT;
        if (!p.onGround) anim = this.djumpT > 0 && this.djumpT < 0.4 ? 'djump' : p.vy > 0.5 ? 'jump' : 'fall';
        else if (Math.abs(p.vx) > 5) anim = 'run';
        else if (Math.abs(p.vx) > 0.5) anim = 'walk';
    }
    if (anim === 'djump') t = 0.4 - this.djumpT;
    return { anim, t, dur: 0, walk: p.walk, face: p.face, x: p.x, y: p.y, vy: p.vy, speed: Math.abs(p.vx), atk };
  }

  private enemyState(e: Enemy): RigState {
    let anim = 'idle';
    let atk: RigState['atk'] = null;
    let t = e.t;
    switch (e.state) {
      case 'enter': case 'walk': anim = 'run'; break;
      case 'wind': case 'strike': case 'rec':
        if (e.atk) {
          anim = e.atk.anim;
          atk = { wind: e.atk.wind, strike: e.atk.strike, rec: e.atk.rec };
          t = e.state === 'wind' ? e.t : e.state === 'strike' ? e.atk.wind + Math.min(e.t, e.atk.strike) : e.atk.wind + e.atk.strike + e.t;
          if (e.state === 'strike') t = e.atk.wind + Math.min(e.t, e.atk.strike * 0.8);
        }
        break;
      case 'stun': anim = 'stun'; break;
      case 'hurt': anim = 'hurt'; break;
      case 'launched': anim = 'launched'; break;
      case 'dead': anim = 'dead'; break;
      default: anim = 'idle';
    }
    return { anim, t, dur: 0, walk: e.walk, face: e.face, x: e.x, y: e.y, vy: e.vy, speed: e.def.speed * (e.state === 'walk' ? 0.8 : 1.2), atk };
  }

  /** Where an actor's body is, for the HUD (icons, hp bars). */
  enemyAnchor(e: Enemy): THREE.Vector3 {
    return new THREE.Vector3(e.x, e.y + e.def.h + 0.45, 0);
  }

  private sync(w: World, dt: number): void {
    // player
    const p = w.p;
    this.djumpT = Math.max(0, this.djumpT - dt);
    this.player.rig.update(this.playerState(p), dt, this.t);
    let glow = 0, gc = 0xffffff;
    if (p.flash > 0) { glow = 0.9; gc = 0xff5050; }
    else if (p.state === 'parry' && p.t < P.parryPerfect + w.mods.parryWindow) { glow = 0.7; gc = 0x9fd0ff; }
    else if (p.state === 'iai') { glow = 0.45 + 0.4 * Math.sin(this.t * 40); gc = 0xfff2c0; }
    else if (p.invuln > 0 && p.state !== 'dash') { glow = Math.sin(this.t * 60) > 0 ? 0.5 : 0; gc = 0xffffff; }
    this.player.rig.setGlow(gc, glow);
    this.player.rig.root.visible = p.state !== 'dash' || p.t > 0.02;

    // enemies
    const seen = new Set<number>();
    for (const e of w.enemies) {
      if (e.state === 'dead') continue;
      seen.add(e.id);
      let a = this.actors.get(e.id);
      if (!a) {
        a = this.makeActor(e.kind, e.id);
        this.actors.set(e.id, a);
      }
      a.rig.update(this.enemyState(e), dt, this.t);
      let k = 0, c = 0xffffff;
      if (e.flash > 0) { k = 0.9; c = 0xffffff; }
      else if (e.state === 'wind' && e.atk) { c = ICON_COLOR[e.atk.icon]; k = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(this.t * 30)); }
      else if (e.state === 'stun') { c = 0xffd040; k = 0.45 + 0.25 * Math.sin(this.t * 16); }
      else if (e.marked) { c = 0xff2060; k = 0.55 + 0.3 * Math.sin(this.t * 40); }
      a.rig.setGlow(c, k);
    }
    for (const [id, a] of this.actors) {
      if (!seen.has(id)) {
        this.scene.remove(a.rig.root);
        a.rig.dispose();
        this.actors.delete(id);
      }
    }

    // projectiles
    const pseen = new Set<number>();
    for (const q of w.projectiles) {
      pseen.add(q.id);
      let o = this.projs.get(q.id);
      if (!o) {
        o = this.makeProj(q);
        this.scene.add(o);
        this.projs.set(q.id, o);
      }
      o.position.set(q.x, q.y, 0);
      if (q.kind === 'arrow') o.rotation.z = Math.atan2(q.vy, q.vx);
      else if (q.kind === 'shuriken') o.rotation.z += dt * 30;
    }
    for (const [id, o] of this.projs) {
      if (!pseen.has(id)) {
        this.scene.remove(o);
        this.projs.delete(id);
      }
    }
  }

  private makeProj(q: Projectile): THREE.Object3D {
    const g = new THREE.Group();
    if (q.kind === 'arrow') {
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: q.owner === 'player' ? 0x9fe0ff : 0xffe08a, toneMapped: false }));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      tip.rotation.z = -Math.PI / 2;
      tip.position.x = 0.8;
      g.add(shaft, tip);
    } else if (q.kind === 'shuriken') {
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 3), new THREE.MeshBasicMaterial({ color: 0xff7070, toneMapped: false }));
        b.rotation.z = (i * Math.PI) / 2;
        b.position.set(Math.cos((i * Math.PI) / 2) * 0.22, Math.sin((i * Math.PI) / 2) * 0.22, 0);
        b.rotation.z = (i * Math.PI) / 2 - Math.PI / 2;
        g.add(b);
      }
    } else {
      const m = new THREE.Mesh(this.crescent, new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      m.scale.set(1.2, 1.6, 1);
      m.rotation.y = q.vx < 0 ? Math.PI : 0;
      g.add(m);
    }
    return g;
  }

  // ------------------------------------------------------------------ FX API

  addShake(k: number): void {
    this.shake = Math.min(1.4, Math.max(this.shake, k));
  }
  kickFov(k: number): void {
    this.fovKick = Math.max(this.fovKick, k);
  }
  addAberr(k: number): void {
    this.aberr = Math.max(this.aberr, k);
  }
  /** Full-screen colour flash (added on top of the picture). */
  flash(color: number, k: number): void {
    this.flashCol.setHex(color);
    this.flashK = Math.max(this.flashK, k);
  }
  setSlowTint(k: number): void {
    this.slowTint = k;
  }
  noteDoubleJump(): void {
    this.djumpT = 0.4;
  }

  /** A sweeping crescent through the air where the blade went. */
  slashTrail(x: number, y: number, angleDeg: number, face: number, reach: number, color: number, heavy: boolean): void {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { prog: { value: 0 }, col: { value: new THREE.Color(color) }, rev: { value: angleDeg > 4 ? 1 : 0 } },
      vertexShader: 'attribute float s; varying float vS; void main(){ vS = s; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float prog; uniform vec3 col; uniform float rev; varying float vS;
        void main(){ float s = rev > 0.5 ? 1.0 - vS : vS;
          float head = prog * 1.35;
          float a = smoothstep(head, head - 0.55, s) * step(s, head);
          float fade = 1.0 - smoothstep(0.55, 1.0, prog);
          vec3 c = mix(col, vec3(1.0), smoothstep(0.0, 1.0, a) * 0.6);
          gl_FragColor = vec4(c * 2.2, a * fade); }`,
    });
    const mesh = new THREE.Mesh(this.crescent, mat);
    const r = reach * (heavy ? 0.82 : 0.7);
    mesh.scale.set(r, r * (heavy ? 1.15 : 0.9), 1);
    mesh.position.set(x - face * 0.35, y + 1.0, 0.7);
    // tilt: falling cuts lean forward-down, rising cuts forward-up
    mesh.rotation.z = (face > 0 ? 1 : -1) * (-angleDeg * Math.PI) / 180 * 0.55 + (face < 0 ? Math.PI : 0);
    mesh.scale.y *= 1;
    this.scene.add(mesh);
    this.trails.push({ mesh, mat, life: heavy ? 0.3 : 0.2, max: heavy ? 0.3 : 0.2 });
  }

  /** The bright cut line left across a body at the moment of a kill. */
  cutLine(x: number, y: number, angleDeg: number, face: number, len = 4.2): void {
    const a = (angleDeg * Math.PI) / 180;
    const dx = Math.cos(a) * face * len * 0.5, dy = Math.sin(a) * len * 0.5;
    this.fx.beam(x - dx, y - dy, 0.8, x + dx, y + dy, 0.8, 0xffffff, 0.09, 0.28);
    this.fx.beam(x - dx * 0.8, y - dy * 0.8, 0.7, x + dx * 0.8, y + dy * 0.8, 0.7, 0xff9a60, 0.26, 0.2);
  }

  /** Spawns two clipped copies of the enemy's rig that fall apart along the cut. */
  splitActor(id: number, angleDeg: number, face: number, force: number): void {
    const a = this.actors.get(id);
    if (!a) return;
    const root = a.rig.root;
    const h = (root.userData.h as number | undefined) ?? 1.0;
    const center = new THREE.Vector3(root.position.x, root.position.y + h, 0);
    const ang = (angleDeg * Math.PI) / 180;
    const n = new THREE.Vector3(-Math.sin(ang) * face, Math.cos(ang), 0).normalize();
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      pivot.position.copy(center);
      const clone = root.clone(true);
      clone.position.sub(center);
      const mats: THREE.MeshStandardMaterial[] = [];
      const nn = n.clone().multiplyScalar(side);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(nn, center);
      clone.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const src = m.material as THREE.MeshStandardMaterial;
        const mm = src.clone();
        mm.clippingPlanes = [plane];
        mm.clipShadows = true;
        mm.side = THREE.DoubleSide;
        mm.emissive = new THREE.Color(0xff5a30);
        mm.emissiveIntensity = 0.9;
        mats.push(mm);
        m.material = mm;
      });
      pivot.add(clone);
      this.scene.add(pivot);
      const push = (1.5 + force * 0.5) * side;
      this.halves.push({ pivot, plane, n: nn, vx: n.x * push + face * force * 0.4, vy: n.y * push + 2.5 + Math.random() * 2, w: side * (1.5 + Math.random() * 2.5) * (face > 0 ? -1 : 1), life: 1.15, mats });
    }
    // dust of the dead enemy's body is replaced by the halves
    this.scene.remove(root);
    a.rig.root.visible = false;
  }

  /** Marks the actor's top so halves know where the middle is. */
  setActorHeight(id: number, h: number): void {
    const a = this.actors.get(id);
    if (a) a.rig.root.userData.h = h;
  }

  ghost(p: Player): void {
    const clone = this.player.rig.root.clone(true);
    const mat = new THREE.MeshBasicMaterial({ color: 0x8fe0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    clone.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.material = mat; m.castShadow = false; }
    });
    clone.position.set(p.x, p.y, 0);
    this.scene.add(clone);
    this.ghosts.push({ obj: clone, mat, life: 0.28, max: 0.28 });
  }

  dust(x: number, n = 8, color = 0xb8a890): void {
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1;
      this.particles.emit(x + (Math.random() - 0.5) * 0.6, 0.1, (Math.random() - 0.5) * 0.8, s * (1 + Math.random() * 3), 0.6 + Math.random() * 1.6, (Math.random() - 0.3) * 1.5, 0.5 + Math.random() * 0.4, 0.22, color, -1.5);
    }
  }

  // ------------------------------------------------------------------ frame

  projectToScreen(x: number, y: number, z = 0): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, visible: v.z < 1 && v.z > -1 };
  }

  /** Visible half-width in world metres at the action plane. */
  get halfView(): number {
    const d = this.camera.position.z;
    return Math.tan((this.camera.fov * Math.PI) / 360) * d * this.camera.aspect;
  }

  update(w: World, dt: number, realDt: number, time: number, extras: { dashing: boolean }): void {
    this.t = time;
    const p = w.p;
    this.sync(w, dt);

    // ---- camera
    const lock = w.lock;
    const hv = this.halfView;
    let tx = p.x + p.face * 2.2 + p.vx * 0.12 + this.camBias;
    if (lock) {
      const mid = (lock.min + lock.max) / 2;
      tx = Math.min(Math.max(tx * 0.7 + mid * 0.3, lock.min + hv - 0.5), lock.max - hv + 0.5);
      if (lock.max - lock.min < hv * 2) tx = mid;
    }
    const k = 1 - Math.exp(-realDt * (extras.dashing ? 14 : 5.5));
    this.camX += (tx - this.camX) * k;
    const targetY = 2.55 + Math.max(0, p.y) * 0.35;
    this.camY += (targetY - this.camY) * (1 - Math.exp(-realDt * 5));
    const crowd = Math.min(5, w.enemies.filter((e) => Math.abs(e.x - p.x) < 9).length);
    const targetZ = 11.4 + crowd * 0.3 + (extras.dashing ? 1.2 : 0) - this.zoom * 3.2;
    this.camZ += (targetZ - this.camZ) * (1 - Math.exp(-realDt * 4));
    this.shake *= Math.pow(0.0008, realDt);
    this.shakeT += realDt * 60;
    const sx = (Math.sin(this.shakeT * 1.9) + Math.sin(this.shakeT * 3.3)) * 0.5 * this.shake * 0.45;
    const sy = (Math.cos(this.shakeT * 2.3) + Math.sin(this.shakeT * 4.1)) * 0.5 * this.shake * 0.35;
    this.camera.position.set(this.camX + sx, this.camY + sy, this.camZ);
    this.camera.lookAt(this.camX + sx * 0.5, this.camY - 0.55 + sy * 0.5, 0);
    this.rollK += ((extras.dashing ? -p.face * 0.035 : 0) - this.rollK) * Math.min(1, realDt * 10);
    this.camera.rotation.z += this.rollK + sx * 0.02;
    this.fovKick *= Math.pow(0.003, realDt);
    this.camera.fov = 40 + this.fovKick * 9 + (extras.dashing ? 3 : 0);
    this.camera.updateProjectionMatrix();

    // ---- lights / sky follow
    this.sky.position.copy(this.camera.position);
    this.moon.position.set(this.camX * 0.97 + 60, 55, -240);
    for (const r of this.ridges) r.m.position.x = this.camX * r.k;
    this.sun.position.set(this.camX + this.theme.sunPos[0], this.theme.sunPos[1], this.theme.sunPos[2]);
    this.sun.target.position.set(this.camX, 0, 0);
    this.sun.target.updateMatrixWorld();
    for (let i = 0; i < this.lamps.length; i++) {
      const l = this.lamps[i];
      l.position.set(this.camX - 10 + i * 10 + Math.sin(time * 2 + i) * 0.5, this.themeName === 'castle' ? 4.6 : 3, 2.5);
      l.intensity = (this.themeName === 'castle' ? 55 : 24) * (0.85 + 0.15 * Math.sin(time * 11 + i * 3) + 0.08 * Math.sin(time * 27 + i));
    }
    for (const f of this.flames) {
      const s = f.base * (0.9 + 0.2 * Math.sin(time * 13 + f.ph * 20) + 0.08 * Math.sin(time * 31 + f.ph * 5));
      f.m.scale.set(s, s * (1 + 0.15 * Math.sin(time * 9 + f.ph * 7)), 1);
    }
    // lock walls
    for (let i = 0; i < 2; i++) {
      const wall = this.lockWalls[i];
      wall.visible = !!lock;
      if (lock) {
        wall.position.set(i ? lock.max : lock.min, 4, 0);
        (wall.material as THREE.MeshBasicMaterial).opacity = 0.1 + 0.05 * Math.sin(time * 6);
      }
    }
    // rain + lightning
    if (this.rain) {
      const m = new THREE.Matrix4();
      const N = this.rainSeed.length / 3;
      for (let i = 0; i < N; i++) {
        const sx2 = this.rainSeed[i * 3], sy2 = this.rainSeed[i * 3 + 1], sz2 = this.rainSeed[i * 3 + 2];
        const yy = 16 - ((sy2 + time * 22) % 16);
        const xx = this.camX + sx2 + (16 - yy) * -0.12;
        m.makeRotationZ(0.12);
        m.setPosition(xx, yy, sz2);
        this.rain.setMatrixAt(i, m);
      }
      this.rain.instanceMatrix.needsUpdate = true;
      this.lightningT -= realDt;
      if (this.lightningT <= 0) {
        this.lightningT = 6 + Math.random() * 9;
        this.lightning = 1;
      }
      this.lightning *= Math.pow(0.0008, realDt);
      this.hemi.intensity = this.theme.hemiI + this.lightning * 2.2;
      this.flashK = Math.max(this.flashK, this.lightning * 0.05);
    }
    // ambience particles
    this.ambT -= realDt;
    if (this.ambT <= 0) {
      this.ambT = 0.07;
      const ax = this.camX + (Math.random() - 0.5) * 22, az = (Math.random() - 0.6) * 10;
      if (this.themeName === 'bamboo') this.particles.emit(ax, 0.5 + Math.random() * 4, az, (Math.random() - 0.5) * 0.4, 0.2, (Math.random() - 0.5) * 0.3, 3, 0.08, 0xd8ff90, -0.05);
      else if (this.themeName === 'village') this.particles.emit(ax, 0.2, az, (Math.random() - 0.3) * 1, 1.4 + Math.random() * 2.4, 0, 2.2, 0.09, 0xff9a40, -0.4);
      else if (this.themeName === 'castle') this.particles.emit(ax, 1 + Math.random() * 5, az, 0.1, 0.1, 0, 3.5, 0.05, 0xffe0a0, 0);
    }
    // ghosts / halves / trails
    this.ghostT -= realDt;
    if (extras.dashing && this.ghostT <= 0) {
      this.ghostT = 0.02;
      this.ghost(p);
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.life -= realDt;
      g.mat.opacity = Math.max(0, 0.5 * (g.life / g.max));
      if (g.life <= 0) { this.scene.remove(g.obj); g.mat.dispose(); this.ghosts.splice(i, 1); }
    }
    for (let i = this.halves.length - 1; i >= 0; i--) {
      const h = this.halves[i];
      h.life -= dt;
      h.vy -= 22 * dt;
      h.pivot.position.x += h.vx * dt;
      h.pivot.position.y += h.vy * dt;
      h.pivot.rotation.z += h.w * dt;
      // rotate the clip normal together with the pivot
      const base = h.plane.normal;
      const cz = Math.cos(dt * h.w), sz = Math.sin(dt * h.w);
      const nx = base.x * cz - base.y * sz, ny = base.x * sz + base.y * cz;
      base.set(nx, ny, 0).normalize();
      h.plane.setFromNormalAndCoplanarPoint(base, h.pivot.position);
      for (const m of h.mats) m.emissiveIntensity = Math.max(0, m.emissiveIntensity - dt * 1.2);
      if (h.pivot.position.y < -0.2 && h.vy < 0) { h.vy *= -0.2; h.vx *= 0.6; h.w *= 0.5; h.pivot.position.y = -0.2; }
      if (h.life <= 0 || h.pivot.position.y < -6) {
        this.scene.remove(h.pivot);
        for (const m of h.mats) m.dispose();
        this.halves.splice(i, 1);
      } else if (h.life < 0.3) {
        const s = Math.max(0.01, h.life / 0.3);
        h.pivot.scale.setScalar(s);
      }
    }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i];
      tr.life -= realDt;
      tr.mat.uniforms.prog.value = 1 - tr.life / tr.max;
      if (tr.life <= 0) { this.scene.remove(tr.mesh); tr.mat.dispose(); this.trails.splice(i, 1); }
    }
  }

  render(dt: number): void {
    this.fx.update(dt);
    this.particles.update(dt);
    this.aberr *= Math.pow(0.002, dt);
    this.flashK *= Math.pow(0.0001, dt);
    this.tintK += (this.slowTint - this.tintK) * Math.min(1, dt * 10);
    this.grade.uniforms.aberr.value = 0.0008 + this.aberr + this.tintK * 0.002;
    this.grade.uniforms.sat.value = 1.12 - this.tintK * 0.55;
    this.grade.uniforms.contrast.value = 1.1 + this.tintK * 0.12;
    (this.grade.uniforms.tint.value as THREE.Color).setRGB(1 - this.tintK * 0.18, 1 - this.tintK * 0.04, 1 + this.tintK * 0.18);
    this.grade.uniforms.vig.value = 0.42 + this.tintK * 0.3;
    (this.grade.uniforms.flash.value as THREE.Color).copy(this.flashCol).multiplyScalar(Math.min(1, this.flashK));
    this.grade.uniforms.time.value = (this.grade.uniforms.time.value + dt * 60) % 1000;
    if (this.bloomOn) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  clearFx(): void {
    this.fx.clear();
    this.particles.clear();
    for (const h of this.halves) this.scene.remove(h.pivot);
    this.halves = [];
    for (const g of this.ghosts) this.scene.remove(g.obj);
    this.ghosts = [];
    for (const t of this.trails) this.scene.remove(t.mesh);
    this.trails = [];
    for (const [, a] of this.actors) { this.scene.remove(a.rig.root); a.rig.dispose(); }
    this.actors.clear();
    for (const [, o] of this.projs) this.scene.remove(o);
    this.projs.clear();
    this.shake = 0;
    this.zoom = 0;
  }

  snapCamera(x: number): void {
    this.camX = x;
  }
}
