import * as THREE from 'three';

const TILE = 8;

function gridTexture(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, s, s);
  grad.addColorStop(0, '#120d33');
  grad.addColorStop(1, '#0c0a26');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  // soft inner grid
  g.strokeStyle = 'rgba(80,120,255,0.22)';
  g.lineWidth = 2;
  for (let i = 0; i <= s; i += s / 4) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke();
  }
  // bright tile edge
  g.strokeStyle = 'rgba(60,240,255,0.75)';
  g.lineWidth = 4;
  g.strokeRect(0, 0, s, s);
  g.strokeStyle = 'rgba(255,80,200,0.25)';
  g.lineWidth = 2;
  g.strokeRect(10, 10, s - 20, s - 20);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The endless neon arena: scrolling grid floor, glowing crystals, fog, stars and lights. */
export class World {
  private floor: THREE.Mesh;
  private decor: THREE.InstancedMesh;
  private dx: Float32Array;
  private dz: Float32Array;
  private ds: Float32Array;
  readonly playerLight: THREE.PointLight;
  private dummy = new THREE.Object3D();
  private static readonly DECOR = 90;
  private static readonly SPAN = 110;

  constructor(scene: THREE.Scene) {
    scene.background = new THREE.Color(0x07051a);
    scene.fog = new THREE.Fog(0x0a0722, 38, 95);

    const tex = gridTexture();
    const size = 480;
    tex.repeat.set(size / TILE, size / TILE);
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex }));
    scene.add(this.floor);

    scene.add(new THREE.HemisphereLight(0xaab8ff, 0x3a1a55, 1.05));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(14, 30, 12);
    scene.add(sun);
    this.playerLight = new THREE.PointLight(0x66ccff, 8, 16, 1.8);
    this.playerLight.position.set(0, 4, 0);
    scene.add(this.playerLight);

    // Crystals / pylons scattered around, recycled around the player so the arena feels endless
    const n = World.DECOR;
    this.dx = new Float32Array(n);
    this.dz = new Float32Array(n);
    this.ds = new Float32Array(n);
    const geo = new THREE.OctahedronGeometry(1, 0).scale(0.7, 2.2, 0.7).translate(0, 1.6, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.decor = new THREE.InstancedMesh(geo, mat, n);
    const palette = [0xff3cac, 0x3cf0ff, 0xb06cff, 0xffd633];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.dx[i] = (Math.random() - 0.5) * 2 * World.SPAN;
      this.dz[i] = (Math.random() - 0.5) * 2 * World.SPAN;
      this.ds[i] = 0.7 + Math.random() * 1.6;
      this.decor.setColorAt(i, c.set(palette[i % palette.length]).multiplyScalar(0.8));
    }
    this.decor.frustumCulled = false;
    scene.add(this.decor);

    // Stars
    const sp = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 1.2 + 0.1;
      const r = 160;
      sp[i * 3] = Math.cos(a) * r * Math.cos(e);
      sp[i * 3 + 1] = Math.sin(e) * r + 20;
      sp[i * 3 + 2] = Math.sin(a) * r * Math.cos(e);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.4, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));
  }

  update(px: number, pz: number, t: number): void {
    // Floor follows the player in whole tiles so the texture never seems to slide
    this.floor.position.set(Math.round(px / TILE) * TILE, 0, Math.round(pz / TILE) * TILE);
    const span = World.SPAN;
    for (let i = 0; i < World.DECOR; i++) {
      let x = this.dx[i];
      let z = this.dz[i];
      if (x - px > span) x -= span * 2;
      else if (x - px < -span) x += span * 2;
      if (z - pz > span) z -= span * 2;
      else if (z - pz < -span) z += span * 2;
      this.dx[i] = x;
      this.dz[i] = z;
      // keep a clear area around the player
      const d = Math.hypot(x - px, z - pz);
      const s = this.ds[i] * (d < 9 ? 0 : 1) * (1 + 0.06 * Math.sin(t * 2 + i));
      this.dummy.position.set(x, 0, z);
      this.dummy.scale.set(s, s, s);
      this.dummy.rotation.y = i;
      this.dummy.updateMatrix();
      this.decor.setMatrixAt(i, this.dummy.matrix);
    }
    this.decor.instanceMatrix.needsUpdate = true;
    this.playerLight.position.set(px, 4, pz);
  }
}
