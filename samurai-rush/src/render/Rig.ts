import * as THREE from 'three';

export interface Look {
  skin: number;
  hair: number;
  top: number;
  sleeves: boolean;
  pants: number;
  shoes: number;
  scale: number;
  bulk: number;
  hairStyle: 'short' | 'bald' | 'cap' | 'long' | 'hood' | 'slick' | 'topknot';
  glasses?: boolean;
  scarf?: number;
  vest?: number;
  coat?: number;
  riot?: boolean;
  mask?: number;
  tie?: number;
  tattoo?: boolean;
  /** Samurai kit */
  hat?: 'jingasa' | 'kabuto' | 'ronin' | 'none';
  horns?: boolean;
  armor?: number;
  hakama?: number;
  sash?: number;
  saya?: boolean;
  trim?: number;
}

export interface Pose {
  y: number; pitch: number; roll: number; yaw: number; fwd: number;
  lean: number; twist: number; sway: number; head: number; headY: number;
  aS: number; aX: number; aE: number;
  bS: number; bX: number; bE: number;
  lH: number; lHx: number; lK: number;
  rH: number; rHx: number; rK: number;
}

const KEYS = Object.keys({
  y: 0, pitch: 0, roll: 0, yaw: 0, fwd: 0, lean: 0, twist: 0, sway: 0, head: 0, headY: 0,
  aS: 0, aX: 0, aE: 0, bS: 0, bX: 0, bE: 0, lH: 0, lHx: 0, lK: 0, rH: 0, rHx: 0, rK: 0,
}) as (keyof Pose)[];

/**
 * Pose conventions (model faces +x, its right side is +z):
 *  shoulder/hip S,H : + swings the limb forward;  elbow E : + bends the forearm up/forward;  knee K : - bends the shin back
 *  lean : - leans forward;  twist : + brings the right shoulder forward;  X : + moves the limb away from the body
 */
export const STANCE: Pose = {
  y: -0.1, pitch: 0, roll: 0, yaw: 0, fwd: 0, lean: -0.14, twist: -0.3, sway: 0, head: 0.12, headY: 0.2,
  aS: 1.0, aX: 0.12, aE: 1.9, bS: 0.9, bX: 0.2, bE: 2.0,
  lH: 0.38, lHx: 0.04, lK: -0.35, rH: -0.34, rHx: 0.06, rK: -0.6,
};

const mix = (a: Pose, b: Pose, t: number): Pose => {
  const r = {} as Pose;
  for (const k of KEYS) r[k] = a[k] + (b[k] - a[k]) * t;
  return r;
};
const ease = (t: number) => t * t * (3 - 2 * t);

const SW: Pose = {
  y: -0.1, pitch: 0, roll: 0, yaw: 0, fwd: 0, lean: -0.12, twist: 0.15, sway: 0, head: 0.05, headY: 0,
  aS: 0.55, aX: 0.05, aE: 1.25, bS: 0.5, bX: 0.05, bE: 1.3,
  lH: 0.4, lHx: 0.04, lK: -0.45, rH: -0.35, rHx: 0.06, rK: -0.55,
};
const Q = (o: Partial<Pose>, base: Pose = SW): Pose => ({ ...base, ...o });

interface Phase { wind: Pose; strike: Pose }

const OVER_W = Q({ aS: 2.6, aE: 0.5, bS: 2.5, bE: 0.6, lean: 0.25, twist: -0.5, y: -0.08 });
const OVER_S = Q({ aS: 0.9, aE: 0.15, bS: 0.8, bE: 0.2, lean: -0.55, twist: 0.5, fwd: 0.35, y: -0.22, lH: 0.8, rH: -0.7 });
const RISE_W = Q({ aS: -0.2, aE: 0.6, bS: -0.3, bE: 0.5, lean: -0.4, twist: 0.6, y: -0.3, lH: 0.9, rH: -0.5 });
const RISE_S = Q({ aS: 2.4, aE: 0.2, bS: 2.3, bE: 0.2, lean: 0.2, twist: -0.4, fwd: 0.3, y: -0.12, lH: 0.5, rH: -0.4 });
const AIRLEGS = { lH: 0.9, lK: -1.1, rH: 0.3, rK: -1.0 };

const MOVES: Record<string, Phase> = {
  s1: { wind: OVER_W, strike: OVER_S },
  s2: { wind: RISE_W, strike: RISE_S },
  s3: { wind: Q({ aS: 2.9, aE: 0.3, bS: 2.9, bE: 0.3, lean: 0.4, twist: -0.9, y: -0.05 }), strike: Q({ aS: 0.6, aE: 0.1, bS: 0.5, bE: 0.1, lean: -0.8, twist: 0.9, fwd: 0.5, y: -0.35, lH: 1.0, rH: -0.9 }) },
  up: { wind: Q({ aS: -0.3, bS: -0.3, aE: 0.6, bE: 0.6, lean: -0.5, y: -0.35, twist: 0.4 }), strike: Q({ aS: 2.9, bS: 2.9, aE: 0.1, bE: 0.1, lean: 0.35, y: 0, twist: -0.2, lH: 0.3, rH: -0.2 }) },
  a1: { wind: Q({ ...OVER_W, ...AIRLEGS }), strike: Q({ ...OVER_S, ...AIRLEGS, y: -0.1 }) },
  a2: { wind: Q({ ...RISE_W, ...AIRLEGS, y: -0.2 }), strike: Q({ ...RISE_S, ...AIRLEGS }) },
  a3: { wind: Q({ aS: 2.9, aE: 0.3, bS: 2.9, bE: 0.3, lean: 0.4, twist: -0.9, ...AIRLEGS }), strike: Q({ aS: 0.6, aE: 0.1, bS: 0.5, bE: 0.1, lean: -0.8, twist: 0.9, fwd: 0.4, ...AIRLEGS }) },
  plunge: { wind: Q({ aS: 2.8, bS: 2.8, aE: 0.3, bE: 0.3, lean: 0.3, ...AIRLEGS }), strike: Q({ aS: 0.1, aE: 0.1, bS: 0.1, bE: 0.1, lean: -0.7, y: -0.1, lH: 0.5, rH: 0.3, lK: -0.3, rK: -0.3 }) },
  thrust: { wind: Q({ aS: 0.5, bS: 0.4, aE: 1.2, bE: 1.3, twist: 0.5, lean: 0.1, fwd: -0.2 }), strike: Q({ aS: 1.5, bS: 1.45, aE: 0.1, bE: 0.15, lean: -0.5, fwd: 0.45, twist: -0.2, lH: 0.9, rH: -0.8 }) },
  cut: { wind: OVER_W, strike: OVER_S },
  overhead: { wind: Q({ aS: 2.9, bS: 2.9, aE: 0.3, bE: 0.3, lean: 0.3, y: -0.05 }), strike: OVER_S },
  club: { wind: Q({ aS: 2.9, bS: 2.9, aE: 0.2, bE: 0.2, lean: 0.45, y: 0, twist: -0.4 }), strike: Q({ aS: 0.5, bS: 0.5, aE: 0.1, bE: 0.1, lean: -1.0, y: -0.42, fwd: 0.4, lH: 0.9, rH: -0.7 }) },
  stomp: { wind: Q({ rH: 1.5, rK: -1.3, aS: 2.2, bS: 2.2, aE: 0.5, bE: 0.5, y: -0.05, lean: 0.2 }), strike: Q({ rH: 0.1, rK: -0.1, aS: 0.3, bS: 0.3, aE: 0.2, bE: 0.2, y: -0.55, lean: -0.8, lH: 0.7 }) },
  stab: { wind: Q({ bS: -0.1, bE: 1.1, aS: 0.8, lean: -0.55, y: -0.4, twist: 0.7, lH: 0.9, rH: -0.7 }), strike: Q({ bS: 1.65, bE: 0.1, aS: -0.2, lean: -0.8, fwd: 0.55, y: -0.46, twist: 0.85, lH: 1.1, rH: -0.9 }) },
  throw: { wind: Q({ bS: 2.7, bE: 0.9, aS: 1.0, lean: 0.3, twist: 0.6 }), strike: Q({ bS: 1.0, bE: 0.1, aS: 0.8, lean: -0.45, twist: -0.3, fwd: 0.2 }) },
  shoot: { wind: Q({ bS: 1.55, bE: 0.05, aS: 1.2, aE: 2.5, twist: 0.5, lean: -0.05 }), strike: Q({ bS: 1.6, bE: 0.05, aS: 0.8, aE: 1.4, twist: 0.45, lean: 0.02 }) },
  iai: { wind: Q({ y: -0.5, aS: 0.2, aE: 0.5, bS: 0.2, bE: 0.4, twist: 0.8, lean: -0.25, lH: 1.0, lK: -1.1, rH: -0.8, rK: -0.4 }), strike: Q({ aS: 1.5, bS: 1.45, aE: 0.1, bE: 0.1, twist: -0.6, lean: -0.7, fwd: 0.6, y: -0.35, lH: 1.1, rH: -1.0 }) },
};

function locomotion(ph: number, amp: number, lean: number): Pose {
  const s = Math.sin(ph), c = Math.cos(ph);
  const p = Q({});
  p.lH = s * 0.95 * amp + 0.1;
  p.rH = -s * 0.95 * amp + 0.1;
  p.lK = -0.2 - 1.0 * amp * Math.max(0, c);
  p.rK = -0.2 - 1.0 * amp * Math.max(0, -c);
  p.lHx = 0.02; p.rHx = 0.02;
  p.y = -0.04 - Math.abs(s) * 0.06 * amp;
  p.lean = lean;
  p.twist = 0.1 - s * 0.12 * amp;
  p.aS = 0.45 - s * 0.35 * amp; p.bS = 0.45 + s * 0.35 * amp;
  p.aE = 1.1; p.bE = 1.3;
  p.head = -lean * 0.5;
  return p;
}

export interface RigState {
  anim: string;
  t: number;
  dur: number;
  walk: number;
  /** +1 faces right (+x), -1 faces left. */
  face: number;
  x: number;
  y: number;
  vy: number;
  speed: number;
  atk: { wind: number; strike: number; rec: number } | null;
  jumps?: number;
}

export class Rig {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private spine = new THREE.Group();
  private chest = new THREE.Group();
  private head = new THREE.Group();
  private shL = new THREE.Group();
  private elL = new THREE.Group();
  private shR = new THREE.Group();
  private elR = new THREE.Group();
  private hipL = new THREE.Group();
  private kneeL = new THREE.Group();
  private hipR = new THREE.Group();
  private kneeR = new THREE.Group();
  private handR = new THREE.Group();
  private weapon: THREE.Object3D | null = null;
  private mats: THREE.MeshStandardMaterial[] = [];
  private cur: Pose = { ...SW };
  private weaponKind: string | null = null;
  readonly scale: number;

  constructor(readonly look: Look) {
    this.scale = look.scale;
    const L = look;
    const mat = (color: number, rough = 0.85, metal = 0) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
      this.mats.push(m);
      return m;
    };
    const skin = mat(L.skin, 0.7), hair = mat(L.hair, 0.6), top = mat(L.top, 0.9), pants = mat(L.pants, 0.9), shoes = mat(L.shoes, 0.6);
    const sleeve = L.sleeves ? top : skin;
    const cap = (r: number, len: number, m: THREE.Material, sx = 1, sz = 1) => {
      const g = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 10), m);
      g.scale.set(sx, 1, sz);
      g.castShadow = true;
      return g;
    };
    const b = L.bulk;
    this.root.add(this.body);
    this.body.position.y = 0.93;
    this.body.add(this.spine);

    // pelvis + torso
    const pelvis = cap(0.15 * b, 0.06, pants, 0.9, 1.3);
    this.body.add(pelvis);
    const torso = cap(0.17 * b, 0.3, top, 0.85, 1.3);
    torso.position.y = 0.27;
    this.spine.add(torso);
    if (L.coat) {
      const coat = cap(0.2 * b, 0.42, mat(L.coat, 0.85), 0.9, 1.3);
      coat.position.y = 0.12;
      this.spine.add(coat);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.42 * b), coat.material);
      tail.position.set(-0.12, -0.15, 0);
      tail.castShadow = true;
      this.spine.add(tail);
    }
    if (L.vest) {
      const v = cap(0.185 * b, 0.26, mat(L.vest, 0.7), 0.9, 1.3);
      v.position.y = 0.3;
      this.spine.add(v);
    }
    // belt and collar
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * b, 0.165 * b, 0.05, 14), mat(0x1a1410, 0.5));
    belt.scale.set(0.9, 1, 1.3);
    belt.position.y = 0.0;
    this.spine.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.05), mat(0xb8a060, 0.3, 0.8));
    buckle.position.set(0.15 * b, 0, 0);
    this.spine.add(buckle);
    if (L.sleeves && !L.coat) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1 * b, 0.03, 6, 14), mat(L.top, 0.9));
      collar.rotation.x = Math.PI / 2;
      collar.scale.set(1, 1.3, 1);
      collar.position.y = 0.5;
      this.spine.add(collar);
    }
    if (L.tie) {
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.28, 0.05), mat(L.tie, 0.6));
      tie.position.set(0.17 * b, 0.28, 0);
      this.spine.add(tie);
    }
    if (L.tattoo) {
      const tat = mat(0x1c2a3a, 0.9);
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.015, 0.09), tat);
        t.position.set(0.03, 0.34 + i * 0.05, side * 0.3);
        this.spine.add(t);
      }
    }
    this.spine.add(this.chest);
    this.chest.position.y = 0.5;

    // neck + head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8), skin);
    neck.position.y = 0.04;
    this.chest.add(neck);
    this.chest.add(this.head);
    this.head.position.y = 0.08;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 14), skin);
    skull.scale.set(1, 1.12, 0.95);
    skull.position.y = 0.13;
    skull.castShadow = true;
    this.head.add(skull);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), skin);
    nose.position.set(0.115, 0.12, 0);
    this.head.add(nose);
    if (!L.glasses && !L.mask) {
      const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x14100e, roughness: 0.3 });
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6), white);
        eye.scale.set(0.5, 1, 1.3);
        eye.position.set(0.106, 0.145, side * 0.04);
        this.head.add(eye);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 5), dark);
        pupil.position.set(0.114, 0.145, side * 0.04);
        this.head.add(pupil);
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.01, 0.05), hair.clone());
        brow.position.set(0.108, 0.172, side * 0.042);
        brow.rotation.x = -side * 0.25;
        this.head.add(brow);
      }
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.05), dark);
      mouth.position.set(0.108, 0.075, 0);
      this.head.add(mouth);
    }
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), skin);
      ear.scale.set(0.5, 1, 0.8);
      ear.position.set(0, 0.125, side * 0.112);
      this.head.add(ear);
    }
    if (L.mask) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.119, 14, 10, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.4), mat(L.mask, 0.8));
      m.scale.set(1.02, 1.12, 1.0);
      m.position.y = 0.13;
      this.head.add(m);
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.12), mat(0xffd0a0, 0.3));
      slit.position.set(0.112, 0.15, 0);
      this.head.add(slit);
    }
    if (L.hairStyle !== 'bald') {
      const cover = L.hairStyle === 'long' ? 0.85 : L.hairStyle === 'slick' ? 0.62 : 0.55;
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.122, 16, 12, 0, Math.PI * 2, 0, Math.PI * cover), L.hairStyle === 'cap' || L.hairStyle === 'hood' ? mat(L.top, 0.9) : hair);
      h.scale.set(1.0, 1.12, 0.98);
      h.position.y = 0.135;
      h.rotation.z = L.hairStyle === 'slick' ? 0.2 : 0.08;
      h.castShadow = true;
      this.head.add(h);
      if (L.hairStyle === 'cap') {
        const brim = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.18), h.material);
        brim.position.set(0.13, 0.19, 0);
        this.head.add(brim);
      }
      if (L.hairStyle === 'long') {
        const back = cap(0.1, 0.18, hair, 0.8, 1.1);
        back.position.set(-0.07, 0.04, 0);
        this.head.add(back);
      }
    }
    if (L.glasses) {
      const gl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.19), mat(0x050505, 0.2, 0.4));
      gl.position.set(0.11, 0.14, 0);
      this.head.add(gl);
    }
    if (L.scarf) {
      const sc = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 16), mat(L.scarf, 0.9));
      sc.rotation.x = Math.PI / 2;
      sc.position.y = 0.02;
      this.chest.add(sc);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.09), sc.material);
      tail.position.set(-0.12, -0.12, 0.04);
      tail.rotation.z = 0.2;
      this.chest.add(tail);
    }

    // ---- samurai kit: hats, horns, armour, sash, scabbard ----
    if (L.hat === 'jingasa') {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.16, 16), mat(L.trim ?? 0x3a3a3a, 0.8));
      hat.position.y = 0.3;
      hat.castShadow = true;
      this.head.add(hat);
    } else if (L.hat === 'kabuto') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), mat(L.trim ?? 0x8a7a30, 0.4, 0.7));
      dome.position.y = 0.17;
      dome.scale.set(1, 1.1, 1);
      this.head.add(dome);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.19, 0.08, 12, 1, true), mat(L.trim ?? 0x8a7a30, 0.4, 0.7));
      neck.position.set(-0.03, 0.1, 0);
      this.head.add(neck);
      const horn = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 5, 16, Math.PI * 0.9), mat(0xe0b838, 0.3, 0.9));
      horn.position.set(0.1, 0.3, 0);
      horn.rotation.set(0, Math.PI / 2, Math.PI * 0.05);
      this.head.add(horn);
    } else if (L.hat === 'ronin') {
      const hat = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.18, 18), mat(0xc9b27a, 0.9));
      hat.position.y = 0.3;
      this.head.add(hat);
    }
    if (L.hairStyle === 'topknot') {
      const bun = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 8), hair);
      bun.position.set(-0.05, 0.3, 0);
      bun.rotation.z = 0.5;
      this.head.add(bun);
    }
    if (L.horns) {
      for (const side of [-1, 1]) {
        const hn = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.2, 6), mat(0xf0e6c8, 0.5));
        hn.position.set(0.04, 0.29, side * 0.07);
        hn.rotation.x = -side * 0.35;
        this.head.add(hn);
      }
    }
    if (L.armor) {
      const dou = cap(0.19 * b, 0.32, mat(L.armor, 0.55, 0.35), 0.9, 1.3);
      dou.position.y = 0.26;
      this.spine.add(dou);
      for (const side of [-1, 1]) {
        const sode = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.26), mat(L.armor, 0.55, 0.35));
        sode.position.set(0, 0.46, side * 0.26 * b);
        sode.castShadow = true;
        this.spine.add(sode);
      }
      const kusazuri = new THREE.Mesh(new THREE.BoxGeometry(0.28 * b, 0.22, 0.46 * b), mat(L.armor, 0.6, 0.3));
      kusazuri.position.set(0, -0.12, 0);
      this.spine.add(kusazuri);
    }
    if (L.sash) {
      const obi = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * b, 0.175 * b, 0.1, 14), mat(L.sash, 0.7));
      obi.scale.set(0.9, 1, 1.3);
      obi.position.y = 0.02;
      this.spine.add(obi);
    }
    if (L.saya) {
      const saya = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.04, 0.95), mat(0x15161a, 0.4, 0.3));
      saya.position.set(-0.12, -0.04, -0.2 * b);
      saya.rotation.y = 0.3;
      saya.rotation.z = -0.5;
      saya.castShadow = true;
      this.spine.add(saya);
    }

    // arms
    const arm = (sh: THREE.Group, el: THREE.Group, side: number) => {
      this.chest.add(sh);
      sh.position.set(0, -0.04, side * 0.235 * b);
      const up = cap(0.062 * b, 0.2, sleeve);
      up.position.y = -0.17;
      sh.add(up);
      sh.add(el);
      el.position.y = -0.32;
      const fore = cap(0.052 * b, 0.19, L.sleeves && L.top !== L.skin ? skin : skin);
      fore.position.y = -0.15;
      el.add(fore);
      const fist = new THREE.Mesh(new THREE.SphereGeometry(0.06 * b, 10, 8), skin);
      fist.scale.set(1.1, 1, 0.9);
      fist.position.y = -0.31;
      fist.castShadow = true;
      el.add(fist);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.018 * b, 0.04, 3, 6), skin);
      thumb.position.set(0.05 * b, -0.28, side * -0.02);
      thumb.rotation.z = -0.6;
      el.add(thumb);
      if (L.sleeves) {
        const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.056 * b, 0.058 * b, 0.05, 10), sleeve);
        cuff.position.y = -0.255;
        el.add(cuff);
      }
      return fist;
    };
    arm(this.shL, this.elL, -1);
    if (L.riot) {
      const shieldMat = new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.35, metalness: 0.3, transparent: true, opacity: 0.92 });
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.15, 0.7), shieldMat);
      plate.position.set(0.18, -0.2, 0);
      plate.castShadow = true;
      this.elL.add(plate);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.2, 0.04), mat(0xcfd2d8, 0.4, 0.5));
      frame.position.set(0.18, -0.2, 0.36);
      const frame2 = frame.clone();
      frame2.position.z = -0.36;
      this.elL.add(frame, frame2);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.7), mat(0xe0b020, 0.5));
      stripe.position.set(0.18, 0.2, 0);
      this.elL.add(stripe);
    }
    arm(this.shR, this.elR, 1);
    this.elR.add(this.handR);
    this.handR.position.y = -0.31;

    // legs
    const leg = (hp: THREE.Group, kn: THREE.Group, side: number) => {
      this.body.add(hp);
      hp.position.set(0, -0.02, side * 0.105 * b);
      const th = cap(0.088 * b * (L.hakama ? 1.55 : 1), 0.28, L.hakama ? mat(L.hakama, 0.9) : pants);
      th.position.y = -0.24;
      hp.add(th);
      hp.add(kn);
      kn.position.y = -0.46;
      const sh = cap(0.07 * b * (L.hakama ? 1.7 : 1), 0.28, L.hakama ? mat(L.hakama, 0.9) : pants);
      sh.position.y = -0.24;
      kn.add(sh);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.09, 0.11 * b), shoes);
      foot.position.set(0.06, -0.47, 0);
      foot.castShadow = true;
      kn.add(foot);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(0.285, 0.025, 0.12 * b), mat(0xd8d4cc, 0.9));
      sole.position.set(0.06, -0.505, 0);
      kn.add(sole);
    };
    leg(this.hipL, this.kneeL, -1);
    leg(this.hipR, this.kneeR, 1);

    this.root.scale.setScalar(L.scale);
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
    });
    for (const m of this.mats) m.dispose();
  }

  setWeapon(kind: 'katana' | 'spear' | 'bow' | 'club' | 'kunai' | null): void {
    if (kind === this.weaponKind) return;
    this.weaponKind = kind;
    if (this.weapon) { this.handR.remove(this.weapon); this.weapon = null; }
    if (!kind) return;
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xe6edf5, roughness: 0.18, metalness: 0.95, emissive: 0x1a2230 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.6, metalness: 0.3 });
    const wrap = new THREE.MeshStandardMaterial({ color: 0x2a2f55, roughness: 0.8 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.35, metalness: 0.85 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.8 });
    const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z);
      o.castShadow = true;
      g.add(o);
      return o;
    };
    if (kind === 'katana') {
      box(0.042, 0.3, 0.042, wrap, 0, -0.02, 0);
      const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.012, 14), gold);
      tsuba.position.y = -0.19;
      g.add(tsuba);
      box(0.05, 1.05, 0.012, steel, 0, -0.73, 0);
      box(0.014, 1.0, 0.014, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x88aacc, emissiveIntensity: 0.6 }), 0.026, -0.73, 0);
      g.rotation.z = 0.55;
    } else if (kind === 'spear') {
      box(0.035, 2.4, 0.035, wood, 0, -0.9, 0);
      box(0.06, 0.4, 0.014, steel, 0, -2.25, 0);
      g.rotation.z = 0.3;
    } else if (kind === 'bow') {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 6, 20, Math.PI), wood);
      arc.rotation.z = Math.PI / 2 + Math.PI;
      arc.position.set(0.1, -0.3, 0);
      g.add(arc);
      box(0.004, 1.24, 0.004, dark, 0.1, -0.3, 0);
      g.rotation.z = 0;
    } else if (kind === 'club') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.045, 1.5, 10), dark);
      m.position.y = -0.7;
      m.castShadow = true;
      g.add(m);
      for (let k = 0; k < 8; k++) {
        const st = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 5), steel);
        st.position.set(Math.cos(k * 2.4) * 0.1, -0.7 - 0.5 + (k % 4) * 0.28, Math.sin(k * 2.4) * 0.1);
        g.add(st);
      }
      g.rotation.z = 0.35;
    } else {
      box(0.03, 0.12, 0.03, dark, 0, 0, 0);
      box(0.045, 0.3, 0.01, steel, 0, -0.2, 0);
      g.rotation.z = 0.5;
    }
    g.traverse((o) => { o.castShadow = true; });
    this.weapon = g;
    this.handR.add(g);
  }

  /** Tint the whole body (hit flash and attack warnings). */
  setGlow(color: number, k: number): void {
    for (const m of this.mats) {
      m.emissive.setHex(color);
      m.emissiveIntensity = k;
    }
  }

  private yawCur = 0;

  private targetPose(s: RigState, time: number): { pose: Pose; rate: number } {
    const a = s.anim;
    const air = s.y > 0.05 || s.vy > 0.5;
    if (MOVES[a]) {
      const def = MOVES[a];
      const w = s.atk?.wind ?? 0.2, st = s.atk?.strike ?? 0.1, rc = s.atk?.rec ?? 0.3;
      const u = s.t;
      let p: Pose;
      if (u < w) p = mix(SW, def.wind, ease(Math.min(1, u / Math.max(0.01, w * 0.85))));
      else if (u < w + st) p = mix(def.wind, def.strike, ease(Math.min(1, (u - w) / Math.max(0.01, st * 0.6))));
      else p = mix(def.strike, SW, ease(Math.min(1, (u - w - st) / Math.max(0.05, rc))));
      if (a === 's3' || a === 'a3') p.yaw = (Math.PI * 2) * Math.min(1, Math.max(0, (u - w * 0.6) / (st + 0.12)));
      return { pose: p, rate: u < w + st ? 70 : 24 };
    }
    switch (a) {
      case 'idle': {
        const p = Q({});
        p.y += Math.sin(time * 2.3) * 0.012;
        p.aS += Math.sin(time * 2.3) * 0.03;
        return { pose: p, rate: 12 };
      }
      case 'run': {
        const k = Math.max(0, Math.min(1, (s.speed - 4) / 6));
        const p = locomotion(s.walk * 2.5, 1 + k * 0.1, -0.2 - 0.35 * k);
        p.aS = -0.5 - 0.4 * k + Math.sin(s.walk * 2.5) * 0.3;
        p.bS = -0.6 - 0.4 * k - Math.sin(s.walk * 2.5) * 0.3;
        p.aE = 0.6; p.bE = 0.7;
        return { pose: p, rate: 26 };
      }
      case 'walk': return { pose: locomotion(s.walk * 3.0, 0.7, -0.1), rate: 20 };
      case 'jump':
        return { pose: Q({ y: -0.12, lean: -0.1, aS: 2.0, aE: 0.8, bS: 1.8, bE: 0.9, lH: 0.9, lK: -1.2, rH: 0.1, rK: -0.7 }), rate: 16 };
      case 'djump': {
        const tuck = Q({ y: -0.4, aS: 1.4, aE: 2.4, bS: 1.4, bE: 2.4, lH: 1.4, lK: -2.1, rH: 1.4, rK: -2.1, lean: -0.5, head: 0.4 });
        tuck.pitch = -Math.PI * 2 * ease(Math.min(1, s.t / 0.4));
        return { pose: tuck, rate: 90 };
      }
      case 'fall':
        return { pose: Q({ y: -0.05, lean: -0.05, aS: 1.6, aX: 0.8, aE: 0.5, bS: 1.6, bX: 0.8, bE: 0.5, lH: 0.35, lK: -0.25, rH: -0.1, rK: -0.35 }), rate: 14 };
      case 'dash':
        return { pose: Q({ lean: -1.0, aS: -1.0, aE: 0.3, bS: -1.1, bE: 0.3, lH: 0.9, rH: -0.9, lK: -0.2, rK: -0.2, y: -0.15, head: -0.3 }), rate: 90 };
      case 'parry':
        return { pose: Q({ aS: 2.2, aE: 0.9, bS: 2.1, bE: 1.0, lean: 0.1, y: -0.12, twist: -0.2 }), rate: 70 };
      case 'hurt':
        return { pose: Q({ lean: 0.5, head: 0.5, aS: 0.4, aE: 0.5, bS: 0.2, bE: 0.7, fwd: -0.16, y: -0.1, twist: -0.3 }), rate: 40 };
      case 'stun': {
        const p = Q({ lean: 0.35, head: 0.6, aS: 0.2, aE: 0.3, bS: 0.1, bE: 0.4, y: -0.18, twist: 0 });
        p.sway = Math.sin(time * 7) * 0.12;
        return { pose: p, rate: 18 };
      }
      case 'launched': {
        const p = Q({ y: -0.28, aS: 2.2, aX: 0.9, aE: 0.6, bS: 2.0, bX: 0.9, bE: 0.5, lH: 0.7, rH: 0.3, lK: -0.9, rK: -0.4, lean: 0.5, head: 0.5, twist: 0 });
        p.pitch = 0.75 + Math.sin(time * 7) * 0.25;
        return { pose: p, rate: 20 };
      }
      case 'dead': case 'down': {
        const u = Math.min(1, s.t / 0.3);
        const lying = Q({ y: -0.74, pitch: 1.5, lean: 0.1, head: 0.3, twist: 0, aS: 0.2, aX: 0.9, aE: 0.5, bS: 0.1, bX: 0.7, bE: 0.4, lH: 0.4, lK: -0.5, rH: 0.1, rK: -0.2, fwd: -0.1 });
        return { pose: mix(Q({ lean: 0.5, y: -0.1 }), lying, ease(u)), rate: 30 };
      }
      case 'sheath':
        return { pose: Q({ aS: 0.4, aE: 0.8, bS: 0.2, bE: 0.5, y: -0.3, twist: 0.6, lean: -0.15 }), rate: 40 };
      default:
        return { pose: air ? Q({ y: -0.1, ...AIRLEGS }) : Q({}), rate: 14 };
    }
  }

  update(s: RigState, dt: number, time: number): void {
    const { pose: tgt, rate } = this.targetPose(s, time);
    const k = 1 - Math.exp(-rate * dt);
    const c = this.cur;
    const direct = s.anim === 'djump' || s.anim === 's3' || s.anim === 'a3';
    for (const key of KEYS) {
      if ((key === 'pitch' || key === 'yaw') && direct) c[key] = tgt[key];
      else c[key] += (tgt[key] - c[key]) * k;
    }
    const wantYaw = s.face >= 0 ? 0 : Math.PI;
    let d = wantYaw - this.yawCur;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yawCur += d * Math.min(1, dt * 28);
    this.root.position.set(s.x, s.y, 0);
    this.root.rotation.y = this.yawCur;
    this.body.position.set(c.fwd, 0.93 + c.y, 0);
    this.body.rotation.set(c.roll, c.yaw, c.pitch);
    this.spine.rotation.set(c.sway, c.twist * 0.5, c.lean * 0.5);
    this.chest.rotation.set(0, c.twist * 0.5, c.lean * 0.5);
    this.head.rotation.set(0, 0, c.head);
    this.shL.rotation.set(c.aX, 0, c.aS);
    this.shR.rotation.set(-c.bX, 0, c.bS);
    this.elL.rotation.set(0, 0, c.aE);
    this.elR.rotation.set(0, 0, c.bE);
    this.hipL.rotation.set(c.lHx, 0, c.lH);
    this.hipR.rotation.set(-c.rHx, 0, c.rH);
    this.kneeL.rotation.set(0, 0, c.lK);
    this.kneeR.rotation.set(0, 0, c.rK);
  }
}
