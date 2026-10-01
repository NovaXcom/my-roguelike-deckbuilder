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
  hairStyle: 'short' | 'bald' | 'cap' | 'long' | 'hood' | 'slick';
  glasses?: boolean;
  scarf?: number;
  vest?: number;
  coat?: number;
  /** Carries a riot shield on the left arm. */
  riot?: boolean;
  mask?: number;
  tie?: number;
  tattoo?: boolean;
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

const P = (o: Partial<Pose>, base: Pose = STANCE): Pose => ({ ...base, ...o });
const mix = (a: Pose, b: Pose, t: number): Pose => {
  const r = {} as Pose;
  for (const k of KEYS) r[k] = a[k] + (b[k] - a[k]) * t;
  return r;
};
const ease = (t: number) => t * t * (3 - 2 * t);

interface Attack {
  wind: Pose;
  strike: Pose;
}

const ATTACKS: Record<string, Attack> = {
  jabL: { wind: P({ aS: 0.6, aE: 2.3, twist: -0.55, lean: -0.1, fwd: -0.08 }), strike: P({ aS: 1.55, aE: 0.12, aX: 0.02, twist: -0.12, fwd: 0.2, lH: 0.6, lean: -0.22, head: 0.05 }) },
  jabR: { wind: P({ bS: 0.45, bE: 2.4, twist: 0.2, lean: -0.1, fwd: -0.06, rH: -0.45 }), strike: P({ bS: 1.55, bE: 0.1, bX: 0.02, twist: 0.6, fwd: 0.26, rH: -0.6, lH: 0.5, lean: -0.24, head: 0.05 }) },
  hook: { wind: P({ bS: 0.5, bX: 1.2, bE: 1.4, twist: -0.1, lean: -0.1, y: -0.18 }), strike: P({ bS: 1.35, bX: 1.1, bE: 1.3, twist: 0.95, lean: -0.22, fwd: 0.2, rH: -0.5, y: -0.16 }) },
  kick: { wind: P({ rH: -0.1, rK: -1.6, lean: 0.12, aS: 1.2, bS: 1.2, y: -0.12 }), strike: P({ rH: 1.65, rK: -0.08, lean: 0.38, lK: -0.25, aS: 0.6, bS: 0.6, aX: 0.6, bX: 0.6, fwd: 0.1, y: -0.05 }) },
  heavy: { wind: P({ bS: 2.7, bE: 0.5, aS: 1.8, aE: 0.9, lean: 0.28, twist: 0.7, y: -0.2, fwd: -0.15 }), strike: P({ bS: 0.5, bE: 0.15, aS: 0.8, aE: 0.6, lean: -0.62, twist: 0.1, y: -0.34, fwd: 0.38, rH: -0.6, lH: 0.7 }) },
  stomp: { wind: P({ rH: 1.1, rK: -1.3, lean: 0.1 }), strike: P({ rH: 0.35, rK: -0.1, y: -0.2, lean: -0.3, aS: 0.4, bS: 0.4 }) },
  swingW: { wind: P({ aS: 1.0, bS: 1.1, aE: 1.0, bE: 1.0, twist: 1.2, lean: -0.05, y: -0.15 }), strike: P({ aS: 1.35, bS: 1.4, aE: 0.5, bE: 0.4, twist: -0.85, lean: -0.3, fwd: 0.25, y: -0.18 }) },
  heavyW: { wind: P({ aS: 2.8, bS: 2.8, aE: 0.8, bE: 0.8, lean: 0.3, y: -0.12, twist: 0 }), strike: P({ aS: 0.5, bS: 0.5, aE: 0.2, bE: 0.2, lean: -0.7, y: -0.38, fwd: 0.35, twist: 0, lH: 0.7, rH: -0.6 }) },
  counter: { wind: P({ bS: 1.0, bE: 2.2, rH: -0.2, lean: 0.1, twist: -0.5 }), strike: P({ bS: 1.5, bE: 2.3, rH: 1.3, rK: -1.5, twist: 0.9, lean: 0.12, aS: 0.4 }) },
  punch: { wind: P({ bS: 0.3, bE: 2.3, twist: 0.3, lean: 0.15, aS: 1.2, y: -0.12 }), strike: P({ bS: 1.55, bE: 0.12, twist: 0.6, lean: -0.3, fwd: 0.3, y: -0.2 }) },
  slash: { wind: P({ bS: 2.5, bE: 0.9, twist: 0.5, lean: 0.22, y: -0.22, aS: 1.0 }), strike: P({ bS: 0.75, bE: 0.3, bX: 0.4, twist: -0.4, lean: -0.55, fwd: 0.4, y: -0.3, rH: -0.8, lH: 0.8 }) },
  swing: { wind: P({ aS: 1.0, bS: 1.1, aE: 1.0, bE: 1.0, twist: 1.3, lean: 0.06, y: -0.16 }), strike: P({ aS: 1.35, bS: 1.4, aE: 0.5, bE: 0.4, twist: -0.9, lean: -0.35, fwd: 0.28, y: -0.2 }) },
  slam: { wind: P({ aS: 2.8, bS: 2.8, aE: 0.7, bE: 0.7, lean: 0.35, y: -0.05, twist: 0 }), strike: P({ aS: 0.55, bS: 0.55, aE: 0.2, bE: 0.2, lean: -0.8, y: -0.42, fwd: 0.35, twist: 0, lH: 0.8, rH: -0.5 }) },
  bash: { wind: P({ aS: 1.2, aE: 0.5, bS: 0.8, bE: 1.4, lean: 0.12, y: -0.12, twist: 0.2 }), strike: P({ aS: 1.55, aE: 0.2, bS: 1.0, bE: 1.2, lean: -0.55, fwd: 0.42, y: -0.26, twist: -0.1, lH: 0.8, rH: -0.6 }) },
  stab: { wind: P({ bS: -0.1, bE: 1.1, aS: 0.8, lean: -0.5, y: -0.38, twist: 0.7, lH: 0.9, rH: -0.7 }), strike: P({ bS: 1.65, bE: 0.1, aS: -0.2, lean: -0.75, fwd: 0.55, y: -0.44, twist: 0.85, lH: 1.1, rH: -0.9 }) },
  shootP: { wind: P({ bS: 1.4, bE: 0.15, aS: 1.0, aE: 1.8, twist: 0.45, lean: -0.05 }), strike: P({ bS: 1.65, bE: 0.12, aS: 1.0, aE: 1.8, twist: 0.5, lean: 0.06 }) },
  throwW: { wind: P({ bS: 2.8, bE: 0.9, lean: 0.3, twist: 0.6, y: -0.1 }), strike: P({ bS: 1.0, bE: 0.1, lean: -0.45, twist: -0.3, fwd: 0.22, y: -0.18 }) },
  finish: { wind: P({ rH: 1.4, rK: -1.1, lean: 0.25, aS: 1.8, bS: 1.8, y: -0.05 }), strike: P({ rH: 0.2, rK: -0.1, y: -0.55, lean: -0.85, aS: 0.7, bS: 0.7, aE: 0.4, bE: 0.4, fwd: 0.32, lH: 0.9 }) },
  shoot: { wind: P({ bS: 1.45, bE: 0.15, aS: 1.0, aE: 1.8, twist: 0.45, lean: -0.05, head: 0.0 }), strike: P({ bS: 1.7, bE: 0.12, aS: 1.0, aE: 1.8, twist: 0.5, lean: 0.06, head: 0.0 }) },
};

/** Where the legs/arms are at a given walk phase. */
function locomotion(ph: number, amp: number, lean: number, guard: boolean): Pose {
  const s = Math.sin(ph), c = Math.cos(ph);
  const p = P({});
  p.lH = s * 0.9 * amp + 0.1;
  p.rH = -s * 0.9 * amp + 0.1;
  p.lK = -0.2 - 0.95 * amp * Math.max(0, c);
  p.rK = -0.2 - 0.95 * amp * Math.max(0, -c);
  p.lHx = 0.02; p.rHx = 0.02;
  p.y = -0.04 - Math.abs(s) * 0.05 * amp;
  p.lean = lean;
  p.twist = guard ? -0.15 + s * 0.1 * amp : -s * 0.18 * amp;
  if (guard) {
    p.aS = 0.9 - s * 0.3 * amp; p.bS = 0.9 + s * 0.3 * amp;
    p.aE = 1.9; p.bE = 2.0;
  } else {
    p.aS = -s * 0.9 * amp; p.bS = s * 0.9 * amp;
    p.aE = 0.5 + Math.max(0, s) * 0.5; p.bE = 0.5 + Math.max(0, -s) * 0.5;
    p.aX = 0.1; p.bX = 0.1;
  }
  p.head = -lean * 0.6;
  p.headY = 0;
  return p;
}

export interface RigState {
  state: string;
  anim: string;
  t: number;
  dur: number;
  walk: number;
  facing: number;
  x: number;
  y?: number;
  z: number;
  atk: { wind: number; strike: number; rec: number } | null;
  guardUp: boolean;
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
  private cur: Pose = { ...STANCE };
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
      const th = cap(0.088 * b, 0.28, pants);
      th.position.y = -0.24;
      hp.add(th);
      hp.add(kn);
      kn.position.y = -0.46;
      const sh = cap(0.07 * b, 0.28, pants);
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

  setWeapon(kind: 'bat' | 'pipe' | 'knife' | 'pistol' | null): void {
    if (kind === this.weaponKind) return;
    this.weaponKind = kind;
    if (this.weapon) { this.handR.remove(this.weapon); this.weapon = null; }
    if (!kind) return;
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0xb08a58, roughness: 0.7 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.35, metalness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.5, metalness: 0.4 });
    if (kind === 'bat') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.025, 0.95, 10), wood);
      m.position.set(0.22, 0.05, 0);
      m.rotation.z = -1.35;
      g.add(m);
    } else if (kind === 'pipe') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 10), steel);
      m.position.set(0.2, 0.05, 0);
      m.rotation.z = -1.35;
      g.add(m);
    } else if (kind === 'knife') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.035, 0.012), steel);
      m.position.set(0.18, 0.0, 0);
      g.add(m);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.03), dark);
      g.add(h);
    } else {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.03), dark);
      m.position.set(0.1, 0.02, 0);
      g.add(m);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.03), dark);
      h.position.set(0.0, -0.05, 0);
      g.add(h);
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

  private targetPose(s: RigState, time: number): { pose: Pose; rate: number } {
    const atk = s.atk;
    const tot = atk ? atk.wind + atk.strike + atk.rec : s.dur || 1;
    const a = s.anim;
    switch (s.state) {
      case 'idle': {
        const p = P({});
        p.y += Math.sin(time * 2.2) * 0.012;
        p.aS += Math.sin(time * 2.2) * 0.04;
        p.head += Math.sin(time * 1.3) * 0.03;
        return { pose: p, rate: 12 };
      }
      case 'move': {
        if (a === 'run') return { pose: locomotion(s.walk * 2.7, 1, -0.22, true), rate: 26 };
        if (a === 'strafe') return { pose: locomotion(s.walk * 3.2, 0.45, -0.1, true), rate: 18 };
        if (a === 'back') return { pose: locomotion(-s.walk * 3.0, 0.6, 0.0, true), rate: 18 };
        return { pose: locomotion(s.walk * 3.0, 0.7, -0.12, false), rate: 20 };
      }
      case 'enter':
        return { pose: locomotion(s.walk * 3.0, 0.8, -0.1, false), rate: 20 };
      case 'attack':
      case 'wind':
      case 'strike':
      case 'rec': {
        const def = ATTACKS[a] ?? ATTACKS.punch;
        if (a === 'charge') return { pose: { ...locomotion(time * 17, 1, -0.55, false), aS: -0.7, bS: -0.7 }, rate: 24 };
        let u = s.t;
        if (s.state === 'strike') u += atk?.wind ?? 0;
        else if (s.state === 'rec') u += (atk?.wind ?? 0) + (atk?.strike ?? 0);
        const w = atk?.wind ?? 0.2, st = atk?.strike ?? 0.1;
        let p: Pose;
        if (u < w) p = mix(STANCE, def.wind, ease(Math.min(1, u / Math.max(0.01, w * 0.9))));
        else if (u < w + st) p = mix(def.wind, def.strike, ease((u - w) / Math.max(0.01, st * 0.7 > 1 ? 1 : st * 0.7)));
        else p = mix(def.strike, STANCE, ease(Math.min(1, (u - w - st) / Math.max(0.05, tot - w - st))));
        return { pose: p, rate: u < w + st ? 55 : 22 };
      }
      case 'dodge': {
        const u = Math.min(1, s.t / s.dur);
        const tuck = P({ y: -0.46, aS: 1.4, aE: 2.4, bS: 1.4, bE: 2.4, lH: 1.4, lK: -2.1, rH: 1.4, rK: -2.1, lean: -0.5, head: 0.4, twist: 0, lHx: 0.1, rHx: 0.1 });
        tuck.pitch = -Math.PI * 2 * ease(u);
        return { pose: tuck, rate: 90 };
      }
      case 'guard': {
        const p = P({ aS: 1.5, aE: 2.35, aX: -0.2, bS: 1.5, bE: 2.35, bX: -0.2, lean: -0.22, y: -0.18, twist: 0, head: 0.3 });
        return { pose: p, rate: 40 };
      }
      case 'counter': {
        const w = 0.12, tt = s.dur;
        const def = ATTACKS.counter;
        const p = s.t < w ? mix(STANCE, def.wind, ease(s.t / w)) : mix(def.strike, STANCE, ease(Math.min(1, (s.t - w) / (tt - w))));
        return { pose: p, rate: 60 };
      }
      case 'hit': {
        const p = P({ lean: 0.45, head: 0.45, aS: 0.3, aE: 0.6, bS: 0.2, bE: 0.7, fwd: -0.16, y: -0.1, twist: 0.35, lH: 0.1, rH: -0.1 });
        return { pose: p, rate: 40 };
      }
      case 'down':
      case 'dead': {
        const u = Math.min(1, s.t / 0.3);
        const lying = P({ y: -0.74, pitch: 1.5, lean: 0.1, head: 0.3, twist: 0, aS: 0.2, aX: 0.9, aE: 0.5, bS: 0.1, bX: 0.7, bE: 0.4, lH: 0.4, lK: -0.5, rH: 0.1, rK: -0.2, fwd: -0.1 });
        const p = mix(P({ lean: 0.5, y: -0.1, pitch: 0.1 }), lying, ease(u));
        return { pose: p, rate: 30 };
      }
      case 'getup': {
        const u = Math.min(1, s.t / 0.6);
        const lying = P({ y: -0.74, pitch: 1.5, lean: 0.1, twist: 0, aS: 0.2, aX: 0.9, aE: 0.5, bS: 0.1, bX: 0.7, bE: 0.4, lH: 0.4, lK: -0.5, fwd: -0.1 });
        const kneel = P({ y: -0.42, pitch: 0.55, lean: -0.1, lH: 1.2, lK: -1.5, rH: 0.3, rK: -1.7 });
        const p = u < 0.5 ? mix(lying, kneel, ease(u * 2)) : mix(kneel, STANCE, ease((u - 0.5) * 2));
        return { pose: p, rate: 30 };
      }
      case 'grab': {
        const u = Math.min(1, s.t / 0.34);
        const reach = P({ aS: 1.5, aE: 0.3, bS: 1.5, bE: 0.3, lean: -0.3, y: -0.2, twist: 0 });
        const heave = P({ aS: 2.6, aE: 0.4, bS: 2.6, bE: 0.4, lean: 0.3, y: -0.12, twist: 0 });
        const thr = P({ aS: 1.2, aE: 0.2, bS: 1.2, bE: 0.2, lean: -0.6, y: -0.3, fwd: 0.3, twist: 0 });
        const p = s.t < 0.34 ? mix(reach, heave, ease(u)) : mix(thr, STANCE, ease(Math.min(1, (s.t - 0.34) / 0.3)));
        return { pose: p, rate: 40 };
      }
      case 'launched': {
        const p = P({ y: -0.28, aS: 2.2, aX: 0.9, aE: 0.6, bS: 2.0, bX: 0.9, bE: 0.5, lH: 0.7, rH: 0.3, lK: -0.9, rK: -0.4, lean: 0.5, head: 0.5, twist: 0 });
        p.pitch = 0.75 + Math.sin(time * 7) * 0.25;
        p.roll = Math.sin(time * 5) * 0.3;
        return { pose: p, rate: 20 };
      }
      case 'grabbed':
        return { pose: P({ lean: -0.5, head: -0.4, aS: 0.2, aE: 0.2, bS: 0.2, bE: 0.2, y: -0.3, lH: 0.5, rH: 0.2 }), rate: 20 };
      case 'thrown': {
        const p = P({ y: -0.3, aS: 2.4, aE: 0.4, bS: 2.4, bE: 0.4, lH: 1.0, rH: 0.8, lK: -0.4, rK: -0.4, lean: 0.2 });
        p.roll = time * 14;
        p.pitch = time * 6;
        return { pose: p, rate: 60 };
      }
      case 'rush': {
        const u = Math.min(1, s.t / s.dur);
        const p = P({ y: -0.2, aS: 0.3, aX: 1.3, aE: 0.3, bS: 0.3, bX: 1.3, bE: 0.3, rH: 1.5, rK: -0.1, lH: 0.1, lK: -0.5, lean: 0.35, twist: 0 });
        p.yaw = Math.PI * 4 * ease(u);
        return { pose: p, rate: 100 };
      }
      default:
        return { pose: { ...STANCE }, rate: 12 };
    }
  }

  update(s: RigState, dt: number, time: number): void {
    const { pose: tgt, rate } = this.targetPose(s, time);
    const k = 1 - Math.exp(-rate * dt);
    const c = this.cur;
    for (const key of KEYS) {
      // angles that wrap are applied directly, everything else is smoothed
      if (key === 'pitch' && (s.state === 'dodge' || s.state === 'thrown')) c[key] = tgt[key];
      else if (key === 'yaw' && s.state === 'rush') c[key] = tgt[key];
      else if (key === 'roll' && s.state === 'thrown') c[key] = tgt[key];
      else c[key] += (tgt[key] - c[key]) * k;
    }
    this.root.position.set(s.x, s.y ?? 0, s.z);
    this.root.rotation.y = -s.facing;
    const lyingFix = c.pitch > 0.6 && c.pitch < 2 ? 0 : 0;
    this.body.position.set(c.fwd, 0.93 + c.y + lyingFix, 0);
    this.body.rotation.set(c.roll, c.yaw, c.pitch);
    this.spine.rotation.set(c.sway, c.twist * 0.5, c.lean * 0.5);
    this.chest.rotation.set(0, c.twist * 0.5, c.lean * 0.5);
    this.head.rotation.set(0, c.headY * 0.0 - c.twist * 0.6 * 0, c.head);
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
