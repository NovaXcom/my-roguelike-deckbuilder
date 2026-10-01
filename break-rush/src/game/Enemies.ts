import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SpatialHash } from '../logic/SpatialHash';
import { ELITE_SCALE, ENEMY_DEFS, EnemyKind } from '../logic/Enemies';

export const KIND_LIST: EnemyKind[] = ['imp', 'runner', 'brute'];

function tint(geo: THREE.BufferGeometry, r: number, g: number, b: number): THREE.BufferGeometry {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = r;
    a[i * 3 + 1] = g;
    a[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

/** Body parts are white (tinted per instance); eyes/mouth are dark. Faces +z. */
function buildGeometry(kind: EnemyKind): THREE.BufferGeometry {
  const body = (g: THREE.BufferGeometry) => tint(g.index ? g.toNonIndexed() : g, 1, 1, 1);
  const dark = (g: THREE.BufferGeometry) => tint(g.index ? g.toNonIndexed() : g, 0.04, 0.03, 0.07);
  const eye = (x: number, y: number, z: number, s = 0.11) => dark(new THREE.SphereGeometry(s, 6, 5).translate(x, y, z));
  const parts: THREE.BufferGeometry[] = [];
  if (kind === 'imp') {
    parts.push(body(new THREE.SphereGeometry(0.55, 12, 9).scale(1, 0.92, 1).translate(0, 0.6, 0)));
    parts.push(body(new THREE.ConeGeometry(0.14, 0.4, 6).translate(-0.28, 1.28, 0.05)));
    parts.push(body(new THREE.ConeGeometry(0.14, 0.4, 6).translate(0.28, 1.28, 0.05)));
    parts.push(eye(-0.2, 0.78, 0.46), eye(0.2, 0.78, 0.46));
    parts.push(dark(new THREE.BoxGeometry(0.34, 0.08, 0.1).translate(0, 0.45, 0.52)));
  } else if (kind === 'runner') {
    parts.push(body(new THREE.ConeGeometry(0.42, 1.3, 7).rotateX(Math.PI / 2).translate(0, 0.5, 0.1)));
    parts.push(body(new THREE.ConeGeometry(0.1, 0.4, 5).rotateX(-Math.PI / 2).translate(0, 0.85, -0.55)));
    parts.push(body(new THREE.ConeGeometry(0.1, 0.35, 5).rotateX(-Math.PI / 2).translate(0, 0.55, -0.6)));
    parts.push(eye(-0.14, 0.66, 0.5, 0.09), eye(0.14, 0.66, 0.5, 0.09));
  } else {
    parts.push(body(new THREE.BoxGeometry(1.1, 1.15, 0.95).translate(0, 0.75, 0)));
    parts.push(body(new THREE.SphereGeometry(0.4, 8, 6).translate(-0.72, 1.1, 0)));
    parts.push(body(new THREE.SphereGeometry(0.4, 8, 6).translate(0.72, 1.1, 0)));
    parts.push(body(new THREE.BoxGeometry(0.6, 0.5, 0.6).translate(0, 1.55, 0.05)));
    parts.push(body(new THREE.ConeGeometry(0.12, 0.45, 5).translate(-0.2, 1.95, 0.05)));
    parts.push(body(new THREE.ConeGeometry(0.12, 0.45, 5).translate(0.2, 1.95, 0.05)));
    parts.push(eye(-0.15, 1.58, 0.36, 0.1), eye(0.15, 1.58, 0.36, 0.1));
    parts.push(dark(new THREE.BoxGeometry(0.4, 0.1, 0.1).translate(0, 1.38, 0.38)));
  }
  const merged = mergeGeometries(parts, false);
  return merged ?? parts[0];
}

/**
 * All the regular enemies. Struct-of-arrays + instanced meshes keeps hundreds of them cheap.
 * Killing is two-step (damage queues, `takeDead` hands them out) so indices stay stable mid-frame.
 */
export class EnemyManager {
  readonly cap: number;
  n = 0;
  x: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vz: Float32Array;
  hp: Float32Array;
  maxHp: Float32Array;
  flash: Float32Array;
  age: Float32Array;
  kx: Float32Array;
  kz: Float32Array;
  kind: Uint8Array;
  elite: Uint8Array;
  private seed: Float32Array;
  private queued: Uint8Array;
  private dead: number[] = [];
  private hash: SpatialHash;
  private cx = 0;
  private cz = 0;
  private meshes: THREE.InstancedMesh[] = [];
  private base: THREE.Color[] = [];
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();
  private white = new THREE.Color(1, 1, 1);
  private gold = new THREE.Color(0xffd633);

  constructor(scene: THREE.Scene, cap = 480) {
    this.cap = cap;
    const f = () => new Float32Array(cap);
    this.x = f(); this.z = f(); this.vx = f(); this.vz = f(); this.hp = f(); this.maxHp = f();
    this.flash = f(); this.age = f(); this.kx = f(); this.kz = f(); this.seed = f();
    this.kind = new Uint8Array(cap);
    this.elite = new Uint8Array(cap);
    this.queued = new Uint8Array(cap);
    this.hash = new SpatialHash(80, 2, cap);
    for (const k of KIND_LIST) {
      const m = new THREE.InstancedMesh(buildGeometry(k), new THREE.MeshLambertMaterial({ vertexColors: true }), cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      m.setColorAt(0, this.col.set(0xffffff));
      scene.add(m);
      this.meshes.push(m);
      this.base.push(new THREE.Color(ENEMY_DEFS[k].color));
    }
  }

  spawn(kind: EnemyKind, x: number, z: number, hp: number, elite = false): boolean {
    if (this.n >= this.cap) return false;
    const i = this.n++;
    this.x[i] = x; this.z[i] = z; this.vx[i] = 0; this.vz[i] = 0;
    this.hp[i] = hp; this.maxHp[i] = hp; this.flash[i] = 0; this.age[i] = 0; this.kx[i] = 0; this.kz[i] = 0;
    this.kind[i] = KIND_LIST.indexOf(kind);
    this.elite[i] = elite ? 1 : 0;
    this.queued[i] = 0;
    this.seed[i] = Math.random() * 100;
    this.hash.insert(i, x, z);
    return true;
  }

  def(i: number) {
    return ENEMY_DEFS[KIND_LIST[this.kind[i]]];
  }

  radius(i: number): number {
    return this.def(i).radius * (this.def(i).scale > 1 ? this.def(i).scale * 0.55 : 1) * (this.elite[i] ? ELITE_SCALE : 1);
  }

  /** Applies damage and knockback; kills are queued. Returns true when this hit is lethal. */
  damage(i: number, dmg: number, kx: number, kz: number): boolean {
    if (i < 0 || i >= this.n || this.queued[i]) return false;
    this.hp[i] -= dmg;
    this.flash[i] = 1;
    const resist = this.kind[i] === 2 ? 0.35 : this.elite[i] ? 0.5 : 1;
    this.kx[i] += kx * resist;
    this.kz[i] += kz * resist;
    if (this.hp[i] <= 0) {
      this.queued[i] = 1;
      this.dead.push(i);
      return true;
    }
    return false;
  }

  /** Indices of enemies killed since the last call, highest first (safe to remove in order). */
  takeDead(): number[] {
    const d = this.dead.sort((a, b) => b - a);
    this.dead = [];
    return d;
  }

  removeAt(i: number): void {
    const l = --this.n;
    if (i !== l) {
      for (const a of [this.x, this.z, this.vx, this.vz, this.hp, this.maxHp, this.flash, this.age, this.kx, this.kz, this.seed]) a[i] = a[l];
      this.kind[i] = this.kind[l];
      this.elite[i] = this.elite[l];
      this.queued[i] = this.queued[l];
    }
    this.queued[l] = 0;
  }

  /** Rebuilds the grid. Call after removals: indices move when enemies are removed. */
  rehash(): void {
    this.hash.reset(this.cx, this.cz);
    for (let i = 0; i < this.n; i++) this.hash.insert(i, this.x[i], this.z[i]);
  }

  clear(): void {
    this.n = 0;
    this.dead = [];
    this.queued.fill(0);
    this.meshes.forEach((m) => (m.count = 0));
  }

  /** Moves everything toward the player. Reports contact damage through `onContact`. */
  update(dt: number, px: number, pz: number, t: number, speedBoost: number, onContact: (maxDmg: number, count: number, i: number) => void, dmgScale: number): void {
    const h = this.hash;
    this.cx = px;
    this.cz = pz;
    this.rehash();
    let contacts = 0;
    let maxDmg = 0;
    let who = -1;
    for (let i = 0; i < this.n; i++) {
      const d = this.def(i);
      this.age[i] += dt;
      this.flash[i] = Math.max(0, this.flash[i] - dt * 9);
      const dx = px - this.x[i];
      const dz = pz - this.z[i];
      const dist = Math.hypot(dx, dz) || 0.0001;
      let sp = d.speed * speedBoost * (this.elite[i] ? 0.85 : 1);
      let ux = dx / dist;
      let uz = dz / dist;
      if (this.kind[i] === 1) {
        // runners weave
        const w = Math.sin(t * 5 + this.seed[i]) * 0.45;
        const nx = ux - uz * w;
        const nz = uz + ux * w;
        const l = Math.hypot(nx, nz) || 1;
        ux = nx / l;
        uz = nz / l;
      }
      if (dist < 1.2) sp *= 0.6;
      let vx = ux * sp + this.kx[i];
      let vz = uz * sp + this.kz[i];
      const decay = Math.exp(-7 * dt);
      this.kx[i] *= decay;
      this.kz[i] *= decay;
      // separation so the crowd spreads into a believable mob
      const r = this.radius(i);
      let sx = 0;
      let sz = 0;
      h.query(this.x[i], this.z[i], r * 2.2, (j) => {
        if (j === i) return;
        const ox = this.x[i] - this.x[j];
        const oz = this.z[i] - this.z[j];
        const od = Math.hypot(ox, oz);
        const min = (r + this.radius(j)) * 0.92;
        if (od < min && od > 0.0001) {
          const push = (min - od) / min;
          sx += (ox / od) * push;
          sz += (oz / od) * push;
        } else if (od <= 0.0001) {
          sx += Math.random() - 0.5;
          sz += Math.random() - 0.5;
        }
      });
      vx += sx * 5;
      vz += sz * 5;
      this.vx[i] = vx;
      this.vz[i] = vz;
      this.x[i] += vx * dt;
      this.z[i] += vz * dt;
      const reach = r + 0.5;
      if (dist < reach && !this.queued[i]) {
        contacts++;
        const dmg = d.dmg * dmgScale * (this.elite[i] ? 1.5 : 1);
        if (dmg > maxDmg) {
          maxDmg = dmg;
          who = i;
        }
      }
    }
    if (contacts > 0) onContact(maxDmg, contacts, who);
  }

  /** Calls cb(i, dist) for every live enemy whose body touches the circle. */
  forEachInCircle(x: number, z: number, r: number, cb: (i: number, dist: number) => void): void {
    this.hash.query(x, z, r + 2.2, (i) => {
      if (i >= this.n || this.queued[i]) return;
      const dist = Math.hypot(this.x[i] - x, this.z[i] - z);
      if (dist <= r + this.radius(i)) cb(i, dist);
    });
  }

  nearest(x: number, z: number, maxR: number): number {
    let best = -1;
    let bestD = maxR * maxR;
    this.hash.query(x, z, maxR, (i) => {
      if (i >= this.n || this.queued[i]) return;
      const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** A random live enemy within r of (x,z), or -1. */
  randomNear(x: number, z: number, r: number): number {
    if (this.n === 0) return -1;
    for (let tries = 0; tries < 14; tries++) {
      const i = (Math.random() * this.n) | 0;
      if (!this.queued[i] && Math.hypot(this.x[i] - x, this.z[i] - z) <= r) return i;
    }
    return -1;
  }

  render(t: number): void {
    const counts = [0, 0, 0];
    for (let i = 0; i < this.n; i++) {
      const k = this.kind[i];
      const d = ENEMY_DEFS[KIND_LIST[k]];
      const slot = counts[k]++;
      const mesh = this.meshes[k];
      const pop = Math.min(1, this.age[i] / 0.22);
      const s = d.scale * (this.elite[i] ? ELITE_SCALE : 1) * (0.2 + 0.8 * pop) * (1 + Math.sin(t * 9 + this.seed[i]) * 0.04);
      const hop = Math.abs(Math.sin(t * (k === 1 ? 14 : 7) + this.seed[i])) * (k === 2 ? 0.08 : 0.22);
      this.dummy.position.set(this.x[i], hop, this.z[i]);
      // face the way we are moving (+z is the model's front)
      this.dummy.rotation.y = Math.atan2(this.vx[i], this.vz[i]);
      this.dummy.scale.set(s, s * (1 + this.flash[i] * 0.15), s);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(slot, this.dummy.matrix);
      this.col.copy(this.elite[i] ? this.gold : this.base[k]);
      if (this.flash[i] > 0) this.col.lerp(this.white, Math.min(1, this.flash[i])).multiplyScalar(1 + this.flash[i] * 1.2);
      mesh.setColorAt(slot, this.col);
    }
    for (let k = 0; k < 3; k++) {
      const m = this.meshes[k];
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}
