import * as THREE from 'three';
import { HeroDef } from '../logic/Meta';

/** The hero: a chunky low-poly character with a glowing visor and blade. */
export class Player {
  readonly group = new THREE.Group();
  x = 0;
  z = 0;
  vx = 0;
  vz = 0;
  /** Yaw the hero is facing (radians, 0 = +x). */
  facing = -Math.PI / 2;
  hp = 100;
  maxHp = 100;
  baseSpeed = 7.5;
  invuln = 0;
  dashTime = 0;
  dashCd = 0;
  private dashX = 0;
  private dashZ = 0;
  readonly dashDuration = 0.17;
  readonly dashCooldown = 0.9;
  private body: THREE.Group;
  private shadow: THREE.Mesh;
  private ring: THREE.Mesh;
  private blade: THREE.Mesh;
  private phase = 0;
  /** Decorative flash when hurt. */
  hurtFlash = 0;
  private mats: THREE.MeshLambertMaterial[] = [];

  constructor(scene: THREE.Scene, hero: HeroDef) {
    const body = new THREE.Group();
    const lam = (c: number) => {
      const m = new THREE.MeshLambertMaterial({ color: c });
      this.mats.push(m);
      return m;
    };
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.55, 4, 10), lam(hero.color));
    torso.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 10), lam(0xffd2a8));
    head.position.y = 1.85;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.2), new THREE.MeshBasicMaterial({ color: 0x66f6ff, toneMapped: false }));
    visor.position.set(0, 1.88, 0.3);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 14), lam(0xff3c7a));
    band.position.y = 2.08;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.55), lam(0xff3c7a));
    tail.position.set(0, 2.08, -0.5);
    tail.rotation.x = 0.4;
    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.45, 3, 6), lam(0x1a2248));
    legL.position.set(-0.2, 0.4, 0);
    const legR = legL.clone();
    legR.position.x = 0.2;
    this.blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1.5), new THREE.MeshBasicMaterial({ color: 0xfff1a8, toneMapped: false }));
    this.blade.position.set(0.62, 1.1, 0.5);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.35, 3, 6), lam(hero.color));
    arm.position.set(0.55, 1.2, 0.15);
    arm.rotation.x = Math.PI / 2.4;
    body.add(torso, head, visor, band, tail, legL, legR, this.blade, arm);
    this.body = body;
    this.group.add(body);

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 20).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.shadow.position.y = 0.04;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.18, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: hero.color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.ring.position.y = 0.07;
    this.group.add(this.shadow, this.ring);
    this.group.scale.setScalar(1.3);
    scene.add(this.group);
  }

  get dashing(): boolean {
    return this.dashTime > 0;
  }

  /** Returns true if the dash started. */
  tryDash(dirX: number, dirZ: number): boolean {
    if (this.dashCd > 0 || this.dashTime > 0) return false;
    let dx = dirX;
    let dz = dirZ;
    if (Math.hypot(dx, dz) < 0.1) {
      dx = Math.cos(this.facing);
      dz = Math.sin(this.facing);
    }
    const l = Math.hypot(dx, dz);
    this.dashX = dx / l;
    this.dashZ = dz / l;
    this.dashTime = this.dashDuration;
    this.dashCd = this.dashCooldown;
    this.invuln = Math.max(this.invuln, 0.3);
    return true;
  }

  /** Returns true if damage was taken. */
  hurt(amount: number): boolean {
    if (this.invuln > 0) return false;
    this.hp -= amount;
    this.invuln = 0.4;
    this.hurtFlash = 0.25;
    return true;
  }

  update(dt: number, mx: number, mz: number, speedMult: number, aimAt: { x: number; z: number } | null): void {
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    const speed = this.baseSpeed * speedMult;
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      const s = 26;
      this.vx = this.dashX * s;
      this.vz = this.dashZ * s;
    } else {
      // Snappy but smoothed
      const k = 1 - Math.exp(-14 * dt);
      this.vx += (mx * speed - this.vx) * k;
      this.vz += (mz * speed - this.vz) * k;
    }
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    const moving = Math.hypot(this.vx, this.vz) > 0.5;
    let target = this.facing;
    if (aimAt) target = Math.atan2(aimAt.z - this.z, aimAt.x - this.x);
    else if (moving) target = Math.atan2(this.vz, this.vx);
    let diff = target - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.facing += diff * (1 - Math.exp(-16 * dt));

    this.phase += dt * (moving ? 13 : 3);
    const bob = moving ? Math.abs(Math.sin(this.phase)) * 0.12 : Math.sin(this.phase) * 0.03;
    this.group.position.set(this.x, bob, this.z);
    // Model faces +z by default; yaw so it faces `facing` (0 = +x)
    this.group.rotation.y = Math.PI / 2 - this.facing;
    const lean = this.dashing ? 0.7 : moving ? 0.18 : 0;
    this.body.rotation.x += (lean - this.body.rotation.x) * Math.min(1, dt * 14);
    const squash = this.dashing ? 0.8 : 1 + Math.sin(this.phase * 0.5) * (moving ? 0.03 : 0.015);
    this.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    this.blade.rotation.z = Math.sin(this.phase * 0.7) * 0.15;
    this.ring.scale.setScalar(1 + Math.sin(this.phase * 0.6) * 0.04);

    // Blink when invulnerable after a hit, flash white when hurt
    const blink = this.invuln > 0 && !this.dashing && Math.floor(this.invuln * 24) % 2 === 0;
    this.group.visible = !blink;
    for (const m of this.mats) m.emissive.setRGB(this.hurtFlash * 3, this.hurtFlash * 3, this.hurtFlash * 3);
  }
}
