import * as THREE from 'three';

/** Thousands of tiny cubes in one draw call: sparks, debris, sparkles, dust. */
export class Particles {
  private mesh: THREE.InstancedMesh;
  private n = 0;
  private x: Float32Array;
  private y: Float32Array;
  private z: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private life: Float32Array;
  private max: Float32Array;
  private size: Float32Array;
  private grav: Float32Array;
  private col: Float32Array;
  private dummy = new THREE.Object3D();
  private c = new THREE.Color();
  /** 1 = full, lower on slow devices. */
  density = 1;

  constructor(scene: THREE.Scene, readonly cap = 1800) {
    const f = () => new Float32Array(cap);
    this.x = f(); this.y = f(); this.z = f(); this.vx = f(); this.vy = f(); this.vz = f();
    this.life = f(); this.max = f(); this.size = f(); this.grav = f();
    this.col = new Float32Array(cap * 3);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.c.set(0xffffff));
    scene.add(this.mesh);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, gravity = 16): void {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y; this.z[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grav[i] = gravity;
    this.c.set(color);
    this.col[i * 3] = this.c.r; this.col[i * 3 + 1] = this.c.g; this.col[i * 3 + 2] = this.c.b;
  }

  clear(): void {
    this.n = 0;
    this.mesh.count = 0;
  }

  /** Radial burst of sparks. */
  burst(x: number, y: number, z: number, count: number, speed: number, color: number, size = 0.22, life = 0.6, up = 4): void {
    const n = Math.max(1, Math.round(count * this.density));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.8);
      this.emit(x, y, z, Math.cos(a) * s, up * (0.4 + Math.random()), Math.sin(a) * s, life * (0.6 + Math.random() * 0.7), size * (0.6 + Math.random() * 0.8), color);
    }
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.swapRemove(i);
        continue;
      }
      this.vy[i] -= this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
      if (this.y[i] < 0.05) {
        this.y[i] = 0.05;
        this.vy[i] *= -0.35;
        this.vx[i] *= 0.7;
        this.vz[i] *= 0.7;
      }
      i++;
    }
    const col = this.mesh.instanceColor;
    for (let k = 0; k < this.n; k++) {
      const s = this.size[k] * Math.min(1, (this.life[k] / this.max[k]) * 2.2);
      this.dummy.position.set(this.x[k], this.y[k], this.z[k]);
      this.dummy.scale.setScalar(s);
      this.dummy.rotation.set(k, k * 2, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(k, this.dummy.matrix);
      if (col) col.setXYZ(k, this.col[k * 3], this.col[k * 3 + 1], this.col[k * 3 + 2]);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (col) col.needsUpdate = true;
  }

  private swapRemove(i: number): void {
    const l = --this.n;
    if (i === l) return;
    for (const a of [this.x, this.y, this.z, this.vx, this.vy, this.vz, this.life, this.max, this.size, this.grav]) a[i] = a[l];
    for (let k = 0; k < 3; k++) this.col[i * 3 + k] = this.col[l * 3 + k];
  }
}

interface Fx {
  obj: THREE.Object3D;
  life: number;
  max: number;
  step: (k: number) => void;
  done?: () => void;
}

/** Short-lived meshes: shockwave rings, slash crescents, lightning bolts, ground flashes. */
export class Effects {
  private list: Fx[] = [];
  private ringGeo = new THREE.RingGeometry(0.86, 1, 56).rotateX(-Math.PI / 2);
  private slashGeo = new THREE.RingGeometry(0.45, 1, 32, 1, -Math.PI * 0.39, Math.PI * 0.78).rotateX(-Math.PI / 2);
  private discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  private boltGeo = new THREE.CylinderGeometry(0.1, 0.4, 34, 6);

  constructor(private scene: THREE.Scene) {}

  private mat(color: number, opacity = 1): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  }

  private add(obj: THREE.Object3D, life: number, step: (k: number) => void, done?: () => void): void {
    this.scene.add(obj);
    this.list.push({ obj, life, max: life, step, done });
  }

  /** Expanding shockwave ring on the ground. */
  ring(x: number, z: number, radius: number, color: number, life = 0.45, y = 0.1): void {
    const m = new THREE.Mesh(this.ringGeo, this.mat(color, 0.95));
    m.position.set(x, y, z);
    const mat = m.material as THREE.MeshBasicMaterial;
    this.add(m, life, (k) => {
      const e = 1 - Math.pow(1 - k, 3);
      m.scale.setScalar(Math.max(0.01, radius * e));
      mat.opacity = 0.95 * (1 - k);
    }, () => mat.dispose());
  }

  /** Filled glowing disc that fades (impact flash). */
  disc(x: number, z: number, radius: number, color: number, life = 0.25): void {
    const m = new THREE.Mesh(this.discGeo, this.mat(color, 0.7));
    m.position.set(x, 0.06, z);
    const mat = m.material as THREE.MeshBasicMaterial;
    this.add(m, life, (k) => {
      m.scale.setScalar(radius * (0.6 + 0.4 * k));
      mat.opacity = 0.7 * (1 - k);
    }, () => mat.dispose());
  }

  /** Crescent slash sweeping out along `angle` (radians around Y, 0 = +x). */
  slash(x: number, z: number, angle: number, radius: number, color: number, life = 0.22): void {
    const m = new THREE.Mesh(this.slashGeo, this.mat(color, 1));
    m.position.set(x, 0.9, z);
    m.rotation.y = -angle;
    const mat = m.material as THREE.MeshBasicMaterial;
    this.add(m, life, (k) => {
      m.scale.setScalar(radius * (0.55 + 0.55 * (1 - Math.pow(1 - k, 2))));
      mat.opacity = 1 - k * k;
    }, () => mat.dispose());
  }

  /** Lightning bolt from the sky. */
  bolt(x: number, z: number, color = 0xcdb8ff, life = 0.28): void {
    const m = new THREE.Mesh(this.boltGeo, this.mat(color, 1));
    m.position.set(x, 17, z);
    const mat = m.material as THREE.MeshBasicMaterial;
    this.add(m, life, (k) => {
      const w = 1 - k;
      m.scale.set(w + 0.2, 1, w + 0.2);
      mat.opacity = w;
    }, () => mat.dispose());
    this.ring(x, z, 2.6, color, 0.3);
  }

  /** A line of light between two ground points (used for the ultimate's strikes). */
  beam(x1: number, z1: number, x2: number, z2: number, color: number, life = 0.2): void {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.3, 0.3), this.mat(color, 1));
    m.position.set((x1 + x2) / 2, 1, (z1 + z2) / 2);
    m.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    const mat = m.material as THREE.MeshBasicMaterial;
    this.add(m, life, (k) => {
      mat.opacity = 1 - k;
    }, () => {
      mat.dispose();
      m.geometry.dispose();
    });
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.life -= dt;
      const k = Math.min(1, 1 - f.life / f.max);
      f.step(k);
      if (f.life <= 0) {
        this.scene.remove(f.obj);
        f.done?.();
        this.list.splice(i, 1);
      }
    }
  }
}

/** Floating damage numbers as DOM elements (crisp text, free layout). */
export class DamageNumbers {
  private pool: HTMLDivElement[] = [];
  private next = 0;
  private budget = 0;
  private lastRefill = 0;
  private v = new THREE.Vector3();

  constructor(private container: HTMLElement, private camera: THREE.Camera, private size = 70) {
    for (let i = 0; i < size; i++) {
      const el = document.createElement('div');
      el.className = 'dmg';
      el.style.display = 'none';
      container.appendChild(el);
      this.pool.push(el);
    }
  }

  /** `kind`: normal | crit | heal | gold | text. Numbers are rate-limited so hordes stay readable. */
  spawn(x: number, y: number, z: number, text: string, kind: 'normal' | 'crit' | 'heal' | 'gold' | 'text' = 'normal', now = performance.now()): void {
    if (now - this.lastRefill > 100) {
      this.lastRefill = now;
      this.budget = 22;
    }
    if (kind === 'normal' && this.budget <= 0) return;
    this.budget--;
    this.v.set(x, y, z).project(this.camera);
    if (this.v.z > 1) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const sx = (this.v.x * 0.5 + 0.5) * w + (Math.random() - 0.5) * 24;
    const sy = (-this.v.y * 0.5 + 0.5) * h;
    const el = this.pool[this.next];
    this.next = (this.next + 1) % this.size;
    el.className = `dmg ${kind}`;
    el.textContent = text;
    el.style.display = 'block';
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    const rise = kind === 'crit' ? 70 : 46;
    el.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 1 },
        { transform: 'translate(-50%,-70%) scale(1.25)', opacity: 1, offset: 0.18 },
        { transform: `translate(-50%,calc(-50% - ${rise}px)) scale(1)`, opacity: 0 },
      ],
      { duration: kind === 'crit' ? 800 : 620, easing: 'ease-out', fill: 'forwards' },
    );
  }
}
