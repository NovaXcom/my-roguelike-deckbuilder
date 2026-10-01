import * as THREE from 'three';
import { Mods, WEAPON_INFO, WeaponId, weaponStats } from '../logic/Upgrades';
import { EnemyManager } from './Enemies';
import { Effects, Particles } from './Fx';

export interface HitOpts {
  knock?: number;
  color?: number;
  /** Skip enemies closer than this (for expanding rings). */
  minR?: number;
  /** Cone filter: only enemies within `halfArc` of `angle`. */
  cone?: { angle: number; halfArc: number };
}

/** What a weapon needs from the game. Keeps weapons independent of the big Game class. */
export interface WeaponCtx {
  px: number;
  pz: number;
  facing: number;
  mods: Mods;
  enemies: EnemyManager;
  fx: Effects;
  particles: Particles;
  scene: THREE.Scene;
  damageCircle(x: number, z: number, r: number, dmg: number, o?: HitOpts): number;
  sfx(name: string, pitch?: number): void;
  shake(a: number): void;
  bossPos(): { x: number; z: number } | null;
}

export abstract class Weapon {
  level = 1;
  protected timer = 0.2;

  constructor(readonly id: WeaponId, protected scene: THREE.Scene) {}

  abstract update(dt: number, c: WeaponCtx): void;

  protected stats(c: WeaponCtx) {
    return weaponStats(this.id, this.level, c.mods);
  }

  dispose(): void {}
}

/** Fan-shaped slashes toward the nearest foe; higher levels add slashes in other directions. */
class SlashWeapon extends Weapon {
  update(dt: number, c: WeaponCtx): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    const s = this.stats(c);
    this.timer = s.cooldown;
    const near = c.enemies.nearest(c.px, c.pz, 12);
    const boss = c.bossPos();
    let angle = c.facing;
    if (near >= 0) angle = Math.atan2(c.enemies.z[near] - c.pz, c.enemies.x[near] - c.px);
    else if (boss) angle = Math.atan2(boss.z - c.pz, boss.x - c.px);
    const dirs = [angle, angle + Math.PI, angle + Math.PI / 2, angle - Math.PI / 2];
    const n = Math.min(s.count, 4);
    for (let k = 0; k < n; k++) {
      const a = dirs[k];
      c.fx.slash(c.px, c.pz, a, s.radius, k === 0 ? WEAPON_INFO.slash.color : 0xffb347);
      c.damageCircle(c.px, c.pz, s.radius, s.damage, { knock: 9, color: 0xffe066, cone: { angle: a, halfArc: Math.PI * 0.39 } });
    }
    c.sfx('swing', 0.9 + Math.random() * 0.25);
    c.shake(0.05);
  }
}

/** Blades circling the player, ticking damage on everything they touch. */
class OrbitWeapon extends Weapon {
  private blades: THREE.Mesh[] = [];
  private angle = 0;
  private tick = 0;
  private geo = new THREE.BoxGeometry(0.28, 0.22, 1.5);
  private mat = new THREE.MeshBasicMaterial({ color: 0x8ff0ff, toneMapped: false });

  update(dt: number, c: WeaponCtx): void {
    const s = this.stats(c);
    while (this.blades.length < s.count) {
      const m = new THREE.Mesh(this.geo, this.mat);
      this.scene.add(m);
      this.blades.push(m);
    }
    this.angle += dt * 4.2;
    this.tick -= dt;
    const doTick = this.tick <= 0;
    if (doTick) this.tick = s.cooldown;
    this.blades.forEach((m, i) => {
      const a = this.angle + (i / this.blades.length) * Math.PI * 2;
      const bx = c.px + Math.cos(a) * s.radius;
      const bz = c.pz + Math.sin(a) * s.radius;
      m.position.set(bx, 1.0, bz);
      m.rotation.y = -a + Math.PI / 2;
      m.scale.setScalar(0.9 + (s.radius - 3) * 0.08);
      if (Math.random() < 0.35) c.particles.emit(bx, 1, bz, 0, 0.5, 0, 0.3, 0.16, 0x8ff0ff, 0);
      if (doTick) c.damageCircle(bx, bz, 1.25, s.damage, { knock: 4, color: 0x8ff0ff });
    });
  }

  override dispose(): void {
    this.blades.forEach((m) => this.scene.remove(m));
    this.blades = [];
  }
}

/** Lightning from the sky onto random enemies. */
class LightningWeapon extends Weapon {
  update(dt: number, c: WeaponCtx): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    const s = this.stats(c);
    this.timer = s.cooldown;
    let struck = 0;
    for (let k = 0; k < s.count; k++) {
      const i = c.enemies.randomNear(c.px, c.pz, 15);
      let x: number;
      let z: number;
      if (i >= 0) {
        x = c.enemies.x[i];
        z = c.enemies.z[i];
      } else {
        const boss = c.bossPos();
        if (!boss) continue;
        x = boss.x + (Math.random() - 0.5) * 2;
        z = boss.z + (Math.random() - 0.5) * 2;
      }
      c.fx.bolt(x, z, WEAPON_INFO.lightning.color);
      c.particles.burst(x, 0.6, z, 12, 7, 0xd9ccff, 0.2, 0.5);
      c.damageCircle(x, z, s.radius, s.damage, { knock: 6, color: 0xd9ccff });
      struck++;
    }
    if (struck) {
      c.sfx('skill', 1.5 + Math.random() * 0.4);
      c.shake(0.07);
    }
  }
}

interface Missile {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  life: number;
  retarget: number;
  tx: number;
  tz: number;
}

/** Homing explosive missiles. */
class MissileWeapon extends Weapon {
  private missiles: Missile[] = [];
  private geo = new THREE.BoxGeometry(0.22, 0.22, 0.9);
  private mat = new THREE.MeshBasicMaterial({ color: 0xffa06a, toneMapped: false });

  update(dt: number, c: WeaponCtx): void {
    const s = this.stats(c);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = s.cooldown;
      for (let k = 0; k < s.count; k++) {
        const a = c.facing + (k - (s.count - 1) / 2) * 0.7 + (Math.random() - 0.5) * 0.4;
        const mesh = new THREE.Mesh(this.geo, this.mat);
        this.scene.add(mesh);
        this.missiles.push({ mesh, x: c.px, y: 1.3, z: c.pz, vx: Math.cos(a) * 9, vz: Math.sin(a) * 9, life: 2.6, retarget: 0, tx: 0, tz: 0 });
      }
      c.sfx('rush', 1.6);
    }
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;
      m.retarget -= dt;
      if (m.retarget <= 0) {
        m.retarget = 0.12;
        const e = c.enemies.nearest(m.x, m.z, 22);
        const boss = c.bossPos();
        if (e >= 0) {
          m.tx = c.enemies.x[e];
          m.tz = c.enemies.z[e];
        } else if (boss) {
          m.tx = boss.x;
          m.tz = boss.z;
        } else {
          m.tx = m.x + m.vx;
          m.tz = m.z + m.vz;
        }
      }
      const dx = m.tx - m.x;
      const dz = m.tz - m.z;
      const d = Math.hypot(dx, dz) || 1;
      const speed = 17;
      m.vx += ((dx / d) * speed - m.vx) * Math.min(1, 6 * dt);
      m.vz += ((dz / d) * speed - m.vz) * Math.min(1, 6 * dt);
      m.x += m.vx * dt;
      m.z += m.vz * dt;
      m.mesh.position.set(m.x, m.y, m.z);
      m.mesh.rotation.y = Math.atan2(m.vx, m.vz);
      c.particles.emit(m.x, m.y, m.z, 0, 0.3, 0, 0.35, 0.2, 0xff9a4d, 0);
      let boom = m.life <= 0;
      if (!boom) {
        const e = c.enemies.nearest(m.x, m.z, 1.4);
        const boss = c.bossPos();
        if (e >= 0 || (boss && Math.hypot(boss.x - m.x, boss.z - m.z) < 2.4)) boom = true;
      }
      if (boom) {
        c.fx.ring(m.x, m.z, s.radius, 0xff9a4d, 0.35);
        c.fx.disc(m.x, m.z, s.radius * 0.8, 0xffd29a, 0.2);
        c.particles.burst(m.x, 0.8, m.z, 18, 9, 0xffa24d, 0.26, 0.55);
        c.damageCircle(m.x, m.z, s.radius, s.damage, { knock: 8, color: 0xffa24d });
        c.sfx('boom', 1.3);
        c.shake(0.08);
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
      }
    }
  }

  override dispose(): void {
    this.missiles.forEach((m) => this.scene.remove(m.mesh));
    this.missiles = [];
  }
}

interface Wave {
  x: number;
  z: number;
  r: number;
  max: number;
  dmg: number;
}

/** Expanding shockwave rings that knock enemies back. */
class StompWeapon extends Weapon {
  private waves: Wave[] = [];

  update(dt: number, c: WeaponCtx): void {
    const s = this.stats(c);
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = s.cooldown;
      this.waves.push({ x: c.px, z: c.pz, r: 0, max: s.radius, dmg: s.damage });
      c.fx.ring(c.px, c.pz, s.radius, WEAPON_INFO.stomp.color, s.radius / 22 + 0.1);
      c.fx.disc(c.px, c.pz, 2.6, 0xffb3ee, 0.3);
      c.particles.burst(c.px, 0.3, c.pz, 20, 7, 0xff9ae6, 0.24, 0.6, 2);
      c.sfx('boom', 0.9);
      c.shake(0.11);
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      const prev = w.r;
      w.r += dt * 22;
      c.damageCircle(w.x, w.z, w.r, w.dmg, { knock: 14, color: 0xff9ae6, minR: prev });
      if (w.r >= w.max) this.waves.splice(i, 1);
    }
  }
}

export function createWeapon(id: WeaponId, scene: THREE.Scene): Weapon {
  switch (id) {
    case 'slash': return new SlashWeapon(id, scene);
    case 'orbit': return new OrbitWeapon(id, scene);
    case 'lightning': return new LightningWeapon(id, scene);
    case 'missile': return new MissileWeapon(id, scene);
    case 'stomp': return new StompWeapon(id, scene);
  }
}
