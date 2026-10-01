import * as THREE from 'three';
import { Effects, Particles } from './Fx';

export interface BossHooks {
  player(): { x: number; z: number };
  damagePlayer(amount: number): void;
  summon(count: number, x: number, z: number): void;
  fx: Effects;
  particles: Particles;
  shake(a: number): void;
  sfx(name: string, pitch?: number): void;
  telegraph(text: string): void;
}

type State = 'enter' | 'chase' | 'windup' | 'strike' | 'recover';
type Attack = 'slam' | 'charge' | 'summon';

const NAMES = ['IRON BEAST', 'IRON BEAST MK-II', 'CRIMSON GOLEM', 'OMEGA BEAST'];

/** The big guy. Telegraphed slam / charge / summon, enrages below half HP. */
export class Boss {
  readonly group = new THREE.Group();
  x: number;
  z: number;
  hp: number;
  readonly maxHp: number;
  readonly radius: number;
  readonly name: string;
  alive = true;
  flash = 0;
  private state: State = 'enter';
  private timer = 1.4;
  private attack: Attack = 'slam';
  private cooldown = 2.2;
  private dirX = 0;
  private dirZ = 1;
  private tele: THREE.Mesh;
  private teleMat: THREE.MeshBasicMaterial;
  private mats: THREE.MeshLambertMaterial[] = [];
  private body: THREE.Group;
  private enraged = false;
  private t = 0;
  private contactCd = 0;
  private hitSlam = false;

  constructor(private scene: THREE.Scene, readonly index: number, x: number, z: number, maxHp: number, private hooks: BossHooks) {
    this.x = x;
    this.z = z;
    this.hp = maxHp;
    this.maxHp = maxHp;
    this.radius = 2.1 + index * 0.15;
    this.name = NAMES[Math.min(index, NAMES.length - 1)];
    const hue = [0x8a97ad, 0x66d0c0, 0xd05a5a, 0xb06cff][Math.min(index, 3)];
    const lam = (c: number) => {
      const m = new THREE.MeshLambertMaterial({ color: c });
      this.mats.push(m);
      return m;
    };
    const body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.8, 2.6), lam(hue));
    torso.position.y = 2.4;
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.6), lam(0x5d6a82));
    head.position.set(0, 4.3, 0.6);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xff3355, toneMapped: false }));
    eye.position.set(0, 4.4, 1.45);
    const shL = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 8), lam(0x4b566c));
    shL.position.set(-2.2, 3.4, 0);
    const shR = shL.clone();
    shR.position.x = 2.2;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.6, 1.2), lam(0x3c4559));
    legL.position.set(-1, 0.8, 0);
    const legR = legL.clone();
    legR.position.x = 1;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.2, 6), lam(0xffcc66));
    spike.position.set(0, 4.5, -0.6);
    body.add(torso, head, eye, shL, shR, legL, legR, spike);
    body.scale.setScalar(1 + index * 0.08);
    this.body = body;
    this.group.add(body);
    this.group.position.set(x, -3, z);
    this.teleMat = new THREE.MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.tele = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), this.teleMat);
    this.tele.visible = false;
    this.tele.position.y = 0.09;
    scene.add(this.group, this.tele);
  }

  get dmgMult(): number {
    return 1 + 0.3 * this.index;
  }

  hurt(dmg: number): boolean {
    if (!this.alive || this.state === 'enter') return false;
    this.hp -= dmg;
    this.flash = 1;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    if (!this.enraged && this.hp < this.maxHp * 0.5) {
      this.enraged = true;
      this.hooks.telegraph('ENRAGED!');
      this.hooks.sfx('horde');
    }
    return false;
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.contactCd = Math.max(0, this.contactCd - dt);
    const p = this.hooks.player();
    const rate = this.enraged ? 1.35 : 1;
    const dx = p.x - this.x;
    const dz = p.z - this.z;
    const d = Math.hypot(dx, dz) || 1;

    switch (this.state) {
      case 'enter': {
        this.timer -= dt;
        this.group.position.y = -3 * Math.max(0, this.timer / 1.4);
        if (Math.random() < 0.5) this.hooks.particles.burst(this.x, 0.2, this.z, 2, 5, 0xaaaabb, 0.3, 0.5);
        if (this.timer <= 0) {
          this.group.position.y = 0;
          this.state = 'chase';
          this.cooldown = 1.6;
          this.hooks.shake(0.5);
        }
        break;
      }
      case 'chase': {
        const sp = 2.6 * rate;
        this.x += (dx / d) * sp * dt;
        this.z += (dz / d) * sp * dt;
        this.dirX = dx / d;
        this.dirZ = dz / d;
        this.cooldown -= dt;
        if (this.cooldown <= 0) this.startAttack(d);
        break;
      }
      case 'windup': {
        this.timer -= dt;
        const k = 1 - this.timer / (this.attack === 'charge' ? 0.9 : this.attack === 'slam' ? 1.0 : 0.7) / (1 / (1));
        this.teleMat.opacity = 0.25 + 0.3 * Math.abs(Math.sin(this.t * 14));
        if (this.attack === 'slam') {
          this.tele.position.set(this.x, 0.09, this.z);
          this.tele.scale.setScalar(7.5);
        } else if (this.attack === 'charge') {
          this.tele.position.set(this.x + this.dirX * 6, 0.09, this.z + this.dirZ * 6);
          this.tele.scale.set(12, 1, 2.2);
          this.tele.rotation.y = -Math.atan2(this.dirZ, this.dirX);
        } else {
          this.tele.position.set(this.x, 0.09, this.z);
          this.tele.scale.setScalar(3 + 3 * Math.min(1, Math.max(0, k)));
        }
        this.body.position.y = Math.abs(Math.sin(this.t * 30)) * 0.08;
        if (this.timer <= 0) {
          this.tele.visible = false;
          this.state = 'strike';
          this.hitSlam = false;
          this.timer = this.attack === 'charge' ? 0.65 : 0.1;
          this.tele.rotation.y = 0;
        }
        break;
      }
      case 'strike': {
        this.timer -= dt;
        if (this.attack === 'slam' && !this.hitSlam) {
          this.hitSlam = true;
          this.hooks.fx.ring(this.x, this.z, 7.5, 0xff5a3a, 0.5);
          this.hooks.fx.disc(this.x, this.z, 7, 0xffb08a, 0.3);
          this.hooks.particles.burst(this.x, 0.5, this.z, 40, 14, 0xff7a4d, 0.34, 0.8, 6);
          this.hooks.shake(0.7);
          this.hooks.sfx('boom', 0.6);
          if (d < 7.5 + 0.4) this.hooks.damagePlayer(24 * this.dmgMult);
        } else if (this.attack === 'charge') {
          const sp = 17 * rate;
          this.x += this.dirX * sp * dt;
          this.z += this.dirZ * sp * dt;
          this.hooks.particles.burst(this.x, 0.3, this.z, 2, 4, 0xcccccc, 0.3, 0.4);
          if (d < this.radius + 0.7 && this.contactCd <= 0) {
            this.contactCd = 0.6;
            this.hooks.damagePlayer(30 * this.dmgMult);
          }
        } else if (this.attack === 'summon' && !this.hitSlam) {
          this.hitSlam = true;
          this.hooks.summon(this.enraged ? 18 : 12, this.x, this.z);
          this.hooks.fx.ring(this.x, this.z, 9, 0xb06cff, 0.5);
          this.hooks.sfx('horde', 1.2);
        }
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 0.7 / rate;
        }
        break;
      }
      case 'recover': {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'chase';
          this.cooldown = (this.enraged ? 1.4 : 2.4) + Math.random() * 0.8;
        }
        break;
      }
    }

    // Walking into the boss hurts a little
    if (this.state !== 'enter' && d < this.radius + 0.6 && this.contactCd <= 0) {
      this.contactCd = 0.7;
      this.hooks.damagePlayer(11 * this.dmgMult);
    }

    this.group.position.x = this.x;
    this.group.position.z = this.z;
    this.group.rotation.y = Math.atan2(this.dirX, this.dirZ);
    const wob = this.state === 'chase' ? Math.sin(this.t * 6) * 0.04 : 0;
    this.body.rotation.z = wob;
    const f = this.flash;
    for (const m of this.mats) m.emissive.setRGB(f, f, f);
  }

  private startAttack(distToPlayer: number): void {
    const r = Math.random();
    // Close range favours the slam, far range the charge
    this.attack = distToPlayer < 9 ? (r < 0.6 ? 'slam' : r < 0.85 ? 'summon' : 'charge') : r < 0.5 ? 'charge' : r < 0.8 ? 'summon' : 'slam';
    const rate = this.enraged ? 1.35 : 1;
    this.timer = (this.attack === 'charge' ? 0.9 : this.attack === 'slam' ? 1.0 : 0.7) / rate;
    this.state = 'windup';
    this.tele.visible = true;
    this.tele.rotation.y = 0;
    this.hooks.telegraph(this.attack === 'slam' ? 'SLAM!' : this.attack === 'charge' ? 'CHARGE!' : 'SUMMON!');
    this.hooks.sfx('warn');
  }

  dispose(): void {
    this.scene.remove(this.group, this.tele);
  }
}
