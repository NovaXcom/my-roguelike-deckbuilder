import * as THREE from 'three';

/** One kind of loot (gems, coins, hearts): a pool of tiny physics things drawn as a single instanced mesh. */
class Pool {
  n = 0;
  x: Float32Array; y: Float32Array; z: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  val: Float32Array; age: Float32Array; pull: Float32Array;
  col: Float32Array;
  readonly mesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene, geo: THREE.BufferGeometry, readonly cap: number, readonly hover: number) {
    const f = () => new Float32Array(cap);
    this.x = f(); this.y = f(); this.z = f(); this.vx = f(); this.vy = f(); this.vz = f(); this.val = f(); this.age = f(); this.pull = f();
    this.col = new Float32Array(cap * 3);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(this.mesh);
  }

  add(x: number, z: number, val: number, color: THREE.Color, burst: number): boolean {
    if (this.n >= this.cap) return false;
    const i = this.n++;
    const a = Math.random() * Math.PI * 2;
    const s = (0.3 + Math.random()) * burst;
    this.x[i] = x; this.y[i] = 0.9; this.z[i] = z;
    this.vx[i] = Math.cos(a) * s; this.vz[i] = Math.sin(a) * s; this.vy[i] = 5 + Math.random() * 5;
    this.val[i] = val; this.age[i] = 0; this.pull[i] = 0;
    this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
    return true;
  }

  private remove(i: number): void {
    const l = --this.n;
    if (i === l) return;
    for (const a of [this.x, this.y, this.z, this.vx, this.vy, this.vz, this.val, this.age, this.pull]) a[i] = a[l];
    for (let k = 0; k < 3; k++) this.col[i * 3 + k] = this.col[l * 3 + k];
  }

  /** Moves loot, magnets it to the player, collects it. */
  update(dt: number, t: number, px: number, pz: number, magnet: number, vacuum: boolean, collect: (val: number, x: number, z: number) => void): void {
    for (let i = this.n - 1; i >= 0; i--) {
      this.age[i] += dt;
      const dx = px - this.x[i];
      const dz = pz - this.z[i];
      const d = Math.hypot(dx, dz) || 0.0001;
      if (vacuum || (this.age[i] > 0.3 && d < magnet) || this.pull[i] > 0) {
        // accelerating homing: once started it never lets go
        this.pull[i] = Math.min(60, this.pull[i] + 70 * dt + (vacuum ? 40 * dt : 0) + 4);
        const sp = this.pull[i];
        this.x[i] += (dx / d) * sp * dt;
        this.z[i] += (dz / d) * sp * dt;
        this.y[i] += ((1.0 - this.y[i]) * Math.min(1, 8 * dt));
      } else {
        this.vy[i] -= 22 * dt;
        this.x[i] += this.vx[i] * dt;
        this.z[i] += this.vz[i] * dt;
        this.y[i] += this.vy[i] * dt;
        const floor = this.hover;
        if (this.y[i] < floor) {
          this.y[i] = floor;
          this.vy[i] = -this.vy[i] * 0.45;
          this.vx[i] *= 0.6;
          this.vz[i] *= 0.6;
          if (Math.abs(this.vy[i]) < 1.2) this.vy[i] = 0;
        }
      }
      if (d < 1.0) {
        collect(this.val[i], this.x[i], this.z[i]);
        this.remove(i);
      }
    }
    const col = this.mesh.instanceColor;
    for (let i = 0; i < this.n; i++) {
      const bob = this.pull[i] > 0 || this.vy[i] !== 0 ? 0 : Math.sin(t * 4 + i) * 0.1;
      this.dummy.position.set(this.x[i], this.y[i] + bob, this.z[i]);
      this.dummy.rotation.set(0, t * 3 + i, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      if (col) col.setXYZ(i, this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (col) col.needsUpdate = true;
  }

  clear(): void {
    this.n = 0;
    this.mesh.count = 0;
  }
}

interface Chest {
  group: THREE.Group;
  x: number;
  z: number;
  born: number;
  tier: number;
}

const GEM_COLORS = [new THREE.Color(0x35d0ff), new THREE.Color(0x4dff8a), new THREE.Color(0xc264ff), new THREE.Color(0xffd633)];

/** Gems (XP), coins, hearts and chests. */
export class Pickups {
  private gems: Pool;
  private coins: Pool;
  private hearts: Pool;
  private chests: Chest[] = [];
  vacuum = false;
  private chestGeo = new THREE.BoxGeometry(1.4, 0.9, 1);
  private lidGeo = new THREE.BoxGeometry(1.5, 0.35, 1.1);
  private beamGeo = new THREE.CylinderGeometry(0.5, 0.9, 30, 10, 1, true);

  constructor(private scene: THREE.Scene) {
    this.gems = new Pool(scene, new THREE.OctahedronGeometry(0.34, 0).scale(0.8, 1.15, 0.8), 1100, 0.55);
    this.coins = new Pool(scene, new THREE.CylinderGeometry(0.32, 0.32, 0.09, 12).rotateX(Math.PI / 2), 700, 0.55);
    const cross = new THREE.BoxGeometry(0.62, 0.2, 0.2);
    const cross2 = new THREE.BoxGeometry(0.2, 0.62, 0.2);
    // merge manually: a plus sign
    const plus = new THREE.BufferGeometry();
    const pos: number[] = [];
    for (const g of [cross, cross2]) {
      const ng = g.toNonIndexed();
      pos.push(...Array.from(ng.attributes.position.array as Float32Array));
    }
    plus.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    plus.computeVertexNormals();
    this.hearts = new Pool(scene, plus, 60, 0.7);
  }

  get gemCount(): number {
    return this.gems.n;
  }

  /** Returns false when the pool is full (the caller then pays out the value directly). */
  addGem(x: number, z: number, value: number): boolean {
    const tier = value >= 100 ? 3 : value >= 20 ? 2 : value >= 5 ? 1 : 0;
    return this.gems.add(x, z, value, GEM_COLORS[tier], 5);
  }

  addCoin(x: number, z: number, value: number): boolean {
    return this.coins.add(x, z, value, new THREE.Color(0xffd633).multiplyScalar(1.4), 6);
  }

  addHeart(x: number, z: number, value: number): boolean {
    return this.hearts.add(x, z, value, new THREE.Color(0x44ff88).multiplyScalar(1.3), 3);
  }

  addChest(x: number, z: number, tier: number, now: number): void {
    const g = new THREE.Group();
    const color = tier >= 2 ? 0xffc933 : 0xc264ff;
    const bodyM = new THREE.MeshLambertMaterial({ color: 0x7a4a1c });
    const trim = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const body = new THREE.Mesh(this.chestGeo, bodyM);
    body.position.y = 0.45;
    const lid = new THREE.Mesh(this.lidGeo, bodyM);
    lid.position.y = 1.07;
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.18, 1.12), trim);
    band.position.y = 0.9;
    const beam = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    beam.position.y = 15;
    g.add(body, lid, band, beam);
    g.position.set(x, 0, z);
    this.scene.add(g);
    this.chests.push({ group: g, x, z, born: now, tier });
  }

  get chestPositions(): Array<{ x: number; z: number }> {
    return this.chests;
  }

  update(dt: number, t: number, px: number, pz: number, magnet: number, cb: {
    gem: (v: number, x: number, z: number) => void;
    coin: (v: number, x: number, z: number) => void;
    heart: (v: number, x: number, z: number) => void;
    chest: (tier: number, x: number, z: number) => void;
  }): void {
    this.gems.update(dt, t, px, pz, magnet, this.vacuum, cb.gem);
    this.coins.update(dt, t, px, pz, magnet, this.vacuum, cb.coin);
    this.hearts.update(dt, t, px, pz, magnet * 0.6, false, cb.heart);
    for (let i = this.chests.length - 1; i >= 0; i--) {
      const c = this.chests[i];
      c.group.rotation.y += dt * 1.2;
      c.group.position.y = Math.abs(Math.sin((t - c.born) * 2)) * 0.15;
      const dx = px - c.x;
      const dz = pz - c.z;
      const d = Math.hypot(dx, dz);
      if (d < 7 && t - c.born > 0.8) {
        // chests drift toward you so grabbing one is never a chore
        const sp = 5 + (7 - d);
        c.x += (dx / d) * sp * dt;
        c.z += (dz / d) * sp * dt;
        c.group.position.x = c.x;
        c.group.position.z = c.z;
      }
      if (d < 1.7) {
        this.scene.remove(c.group);
        this.chests.splice(i, 1);
        cb.chest(c.tier, c.x, c.z);
      }
    }
  }

  clear(): void {
    this.gems.clear();
    this.coins.clear();
    this.hearts.clear();
    this.chests.forEach((c) => this.scene.remove(c.group));
    this.chests = [];
    this.vacuum = false;
  }
}
