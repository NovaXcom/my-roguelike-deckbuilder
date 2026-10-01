import * as THREE from 'three';

/** Thousands of tiny cubes in one draw call: sparks, debris, dust. */
export class Particles {
  private mesh: THREE.InstancedMesh;
  private n = 0;
  private d: Float32Array;
  private col: Float32Array;
  private dummy = new THREE.Object3D();
  private c = new THREE.Color();
  // per particle layout: x y z vx vy vz life max size grav
  private static S = 10;
  density = 1;

  constructor(scene: THREE.Scene, readonly cap = 2500) {
    this.d = new Float32Array(cap * Particles.S);
    this.col = new Float32Array(cap * 3);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.c.set(0xffffff));
    scene.add(this.mesh);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: number, gravity = 14): void {
    if (this.n >= this.cap) return;
    const o = this.n * Particles.S;
    const d = this.d;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
    d[o + 6] = life; d[o + 7] = life; d[o + 8] = size; d[o + 9] = gravity;
    this.c.set(color);
    this.col[this.n * 3] = this.c.r; this.col[this.n * 3 + 1] = this.c.g; this.col[this.n * 3 + 2] = this.c.b;
    this.n++;
  }

  clear(): void {
    this.n = 0;
    this.mesh.count = 0;
  }

  /** Sphere-ish burst of sparks. */
  burst(x: number, y: number, z: number, count: number, speed: number, color: number, size = 0.18, life = 0.6, gravity = 14): void {
    const n = Math.max(1, Math.round(count * this.density));
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const s = speed * (0.35 + Math.random() * 0.8);
      this.emit(x, y, z, Math.cos(a) * r * s, u * s, Math.sin(a) * r * s, life * (0.6 + Math.random() * 0.7), size * (0.6 + Math.random() * 0.8), color, gravity);
    }
  }

  /** Streaks fanning out along a direction (slash sparks, deflect sparks). */
  spray(x: number, y: number, z: number, dx: number, dy: number, dz: number, count: number, speed: number, color: number, size = 0.14): void {
    const n = Math.max(1, Math.round(count * this.density));
    for (let i = 0; i < n; i++) {
      const s = speed * (0.4 + Math.random());
      this.emit(x, y, z, dx * s + (Math.random() - 0.5) * speed * 0.6, dy * s + (Math.random() - 0.3) * speed * 0.6, dz * s + (Math.random() - 0.5) * speed * 0.6, 0.3 + Math.random() * 0.4, size, color, 8);
    }
  }

  update(dt: number): void {
    const d = this.d, S = Particles.S;
    let i = 0;
    while (i < this.n) {
      const o = i * S;
      d[o + 6] -= dt;
      if (d[o + 6] <= 0) {
        const l = --this.n;
        if (i !== l) {
          for (let k = 0; k < S; k++) d[o + k] = d[l * S + k];
          for (let k = 0; k < 3; k++) this.col[i * 3 + k] = this.col[l * 3 + k];
        }
        continue;
      }
      d[o + 4] -= d[o + 9] * dt;
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      i++;
    }
    const col = this.mesh.instanceColor;
    for (let k = 0; k < this.n; k++) {
      const o = k * S;
      const s = d[o + 8] * Math.min(1, (d[o + 6] / d[o + 7]) * 2.2);
      this.dummy.position.set(d[o], d[o + 1], d[o + 2]);
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
}

interface Fx {
  obj: THREE.Object3D;
  life: number;
  max: number;
  step: (k: number) => void;
  done?: () => void;
}

/** Short-lived glowing meshes: shock rings, slash arcs, flashes, beams. */
export class Effects {
  private list: Fx[] = [];
  private sphereGeo = new THREE.SphereGeometry(1, 16, 12);
  private ringGeo = new THREE.TorusGeometry(1, 0.05, 6, 40);
  private slashGeo = new THREE.TorusGeometry(1, 0.06, 6, 24, Math.PI * 0.9);

  constructor(private scene: THREE.Scene) {}

  private mat(color: number, opacity = 1): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  }

  private add(obj: THREE.Object3D, life: number, step: (k: number) => void, done?: () => void): void {
    this.scene.add(obj);
    this.list.push({ obj, life, max: life, step, done });
  }

  /** Expanding ring facing the camera-ish (billboard set by caller via lookAt target). */
  ring(x: number, y: number, z: number, radius: number, color: number, life = 0.4, facing?: THREE.Vector3): void {
    const m = new THREE.Mesh(this.ringGeo, this.mat(color, 1));
    m.position.set(x, y, z);
    if (facing) m.lookAt(x + facing.x, y + facing.y, z + facing.z);
    else m.rotation.x = Math.PI / 2;
    const mat = m.material as THREE.MeshBasicMaterial;
    this.add(m, life, (k) => {
      const e = 1 - Math.pow(1 - k, 3);
      m.scale.setScalar(Math.max(0.01, radius * e));
      mat.opacity = 1 - k;
    }, () => mat.dispose());
  }

  flash(x: number, y: number, z: number, radius: number, color: number, life = 0.18): void {
    const m = new THREE.Mesh(this.sphereGeo, this.mat(color, 0.9));
    m.position.set(x, y, z);
    const mat = m.material as THREE.MeshBasicMaterial;
    this.add(m, life, (k) => {
      m.scale.setScalar(radius * (0.4 + 0.8 * k));
      mat.opacity = 0.9 * (1 - k);
    }, () => mat.dispose());
  }

  /** A sword arc, oriented around the direction (dx,dz). */
  slash(x: number, y: number, z: number, yaw: number, radius: number, color: number, tilt = 0.3, life = 0.2): void {
    const m = new THREE.Mesh(this.slashGeo, this.mat(color, 1));
    m.position.set(x, y, z);
    m.rotation.set(Math.PI / 2 + tilt, -yaw + Math.PI * 0.05, 0, 'YXZ');
    const mat = m.material as THREE.MeshBasicMaterial;
    this.add(m, life, (k) => {
      m.scale.setScalar(radius * (0.6 + 0.5 * k));
      mat.opacity = 1 - k * k;
    }, () => mat.dispose());
  }

  beam(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, color: number, width = 0.12, life = 0.18): void {
    const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);
    const geo = new THREE.CylinderGeometry(width, width, len, 6);
    const m = new THREE.Mesh(geo, this.mat(color, 1));
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x2 - x1, y2 - y1, z2 - z1).normalize());
    const mat = m.material as THREE.MeshBasicMaterial;
    this.add(m, life, (k) => {
      mat.opacity = 1 - k;
      m.scale.x = m.scale.z = 1 - k * 0.8;
    }, () => {
      mat.dispose();
      geo.dispose();
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

  clear(): void {
    for (const f of this.list) {
      this.scene.remove(f.obj);
      f.done?.();
    }
    this.list.length = 0;
  }
}
