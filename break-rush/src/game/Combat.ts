import { Box } from '../physics/Controller';
import { EnemySpawn, EnemyType } from '../level/Generator';

export interface Enemy {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  z: number;
  homeX: number;
  homeY: number;
  homeZ: number;
  /** Walkable extents (chargers stay on their platform). */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  alive: boolean;
  state: 'idle' | 'aim' | 'windup' | 'charge' | 'cool' | 'advance';
  /** Shielders: direction the shield points (radians, 0 = +x). */
  face: number;
  blockCd: number;
  t: number;
  /** Direction locked in at the start of a charge / aim. */
  dirX: number;
  dirY: number;
  dirZ: number;
  facing: number;
  /** For rendering: 0..1 progress of the telegraph. */
  telegraph: number;
  bob: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** 'enemy' bullets hurt the player; 'player' (reflected) bullets kill enemies. */
  owner: 'enemy' | 'player';
  kind: 'bullet' | 'reflect' | 'star';
  life: number;
  shooter: number;
}

export interface PlayerBody {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  height: number;
}

export interface CombatEvents {
  playerHit: boolean;
  kills: { id: number; type: EnemyType; x: number; y: number; z: number; by: 'slash' | 'reflect' | 'lunge' }[];
  fired: { x: number; y: number; z: number }[];
  deflected: { x: number; y: number; z: number }[];
  telegraphs: { id: number }[];
  /** Attacks that hit a shield head-on. */
  blocked: { x: number; y: number; z: number; dx: number; dz: number }[];
}

export const COMBAT = {
  activateRange: 34,
  gunnerAim: 0.85,
  gunnerCool: 1.9,
  droneAim: 0.75,
  droneCool: 2.4,
  bulletSpeed: 15,
  bulletRadius: 0.55,
  chargerWindup: 0.6,
  chargerSpeed: 17,
  chargerTime: 0.9,
  chargerCool: 1.4,
  slashReach: 2.6,
  slashTime: 0.28,
  lunge: { range: 11, speed: 30, time: 0.22, cooldown: 0.42, cone: 0.7 },
  deflectTime: 0.32,
  deflectCooldown: 0.5,
  deflectRadius: 3.2,
  shieldArc: 1.6,
  shieldTurn: 1.8,
  shieldSpeed: 3.4,
  shieldWindup: 0.75,
  starSpeed: 36,
  maxStars: 3,
};

export function segmentBlocked(boxes: Box[], ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (const b of boxes) {
    if (b.ghost || b.hazard) continue;
    let t0 = 0, t1 = 1;
    const axes: [number, number, number, number][] = [
      [ax, dx, b.minX, b.maxX],
      [ay, dy, b.minY, b.maxY],
      [az, dz, b.minZ, b.maxZ],
    ];
    let hit = true;
    for (const [o, d, lo, hi] of axes) {
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { hit = false; break; }
      } else {
        let ta = (lo - o) / d, tb = (hi - o) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) { hit = false; break; }
      }
    }
    if (hit) return true;
  }
  return false;
}

export class Combat {
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  private nextProj = 1;
  private killedAtCheckpoint = new Set<number>();
  slashLeft = 0;
  deflectLeft = 0;
  private deflectCd = 0;
  private attackCd = 0;

  constructor(private boxes: Box[], spawns: EnemySpawn[]) {
    spawns.forEach((s, i) => {
      // find the platform under the spawn to bound movement
      let b: Box | null = null;
      for (const bx of boxes) {
        if (bx.ghost || bx.hazard) continue;
        const topY = s.type === 'drone' ? s.y - 2.6 : s.y;
        if (s.x >= bx.minX && s.x <= bx.maxX && s.z >= bx.minZ && s.z <= bx.maxZ && Math.abs(bx.maxY - topY) < 0.05) { b = bx; break; }
      }
      this.enemies.push({
        id: i, type: s.type, x: s.x, y: s.y, z: s.z, homeX: s.x, homeY: s.y, homeZ: s.z,
        minX: b ? b.minX + 0.6 : s.x - 3, maxX: b ? b.maxX - 0.6 : s.x + 3, minZ: b ? b.minZ + 0.6 : s.z - 3, maxZ: b ? b.maxZ - 0.6 : s.z + 3,
        alive: true, state: 'idle', t: 0, face: Math.PI, blockCd: 0, dirX: 0, dirY: 0, dirZ: 0, facing: Math.PI, telegraph: 0, bob: i * 1.7,
      });
    });
  }

  /** Remember which enemies are dead so a respawn can bring back only the ones killed since. */
  checkpoint(): void {
    this.killedAtCheckpoint.clear();
    for (const e of this.enemies) if (!e.alive) this.killedAtCheckpoint.add(e.id);
  }

  respawn(): void {
    this.projectiles.length = 0;
    this.slashLeft = this.deflectLeft = this.deflectCd = this.attackCd = 0;
    for (const e of this.enemies) {
      e.alive = !this.killedAtCheckpoint.has(e.id);
      e.state = 'idle';
      e.t = 0;
      e.telegraph = 0;
      e.face = Math.PI;
      e.x = e.homeX; e.y = e.homeY; e.z = e.homeZ;
    }
  }

  get aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  /** Picks the enemy to lunge at: nearest within range that is roughly where the player is aiming. */
  pickTarget(p: PlayerBody, aimX: number, aimZ: number): Enemy | null {
    const L = COMBAT.lunge;
    let best: Enemy | null = null;
    let bestScore = Infinity;
    const al = Math.hypot(aimX, aimZ) || 1;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.x - p.x, dz = e.z - p.z;
      const dist = Math.hypot(dx, dz, e.y - p.y);
      if (dist > L.range || dist < 0.5) continue;
      const cos = (dx * aimX + dz * aimZ) / ((Math.hypot(dx, dz) || 1) * al);
      if (cos < L.cone) continue;
      if (segmentBlocked(this.boxes, p.x, p.y + 1, p.z, e.x, e.y + 1, e.z)) continue;
      const score = dist * (2 - cos);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  get deflectCooldownLeft(): number {
    return this.deflectCd;
  }

  resetAttack(): void {
    this.attackCd = 0;
  }

  canAttack(): boolean {
    return this.attackCd <= 0;
  }
  startSlash(): void {
    this.slashLeft = COMBAT.slashTime;
    this.attackCd = COMBAT.lunge.cooldown;
  }
  startDeflect(): boolean {
    if (this.deflectCd > 0) return false;
    this.deflectLeft = COMBAT.deflectTime;
    this.deflectCd = COMBAT.deflectCooldown;
    return true;
  }

  update(dt: number, p: PlayerBody, lunging: boolean, invulnerable: boolean): CombatEvents {
    const ev: CombatEvents = { playerHit: false, kills: [], fired: [], deflected: [], telegraphs: [], blocked: [] };
    this.slashLeft = Math.max(0, this.slashLeft - dt);
    this.deflectLeft = Math.max(0, this.deflectLeft - dt);
    this.deflectCd = Math.max(0, this.deflectCd - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    const px = p.x, py = p.y + p.height * 0.5, pz = p.z;

    // ---- player melee: slash and lunge kill whatever they touch ----------
    if (this.slashLeft > 0 || lunging) {
      const reach = lunging ? 2.4 : COMBAT.slashReach;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - px, e.z - pz);
        const dy = e.y + 0.9 - py;
        if (d < reach && Math.abs(dy) < 2.2) {
          if (e.type === 'shield' && this.shieldBlocks(e, px, pz)) {
            if (e.blockCd <= 0) {
              e.blockCd = 0.45;
              const l = Math.hypot(px - e.x, pz - e.z) || 1;
              ev.blocked.push({ x: e.x, y: e.y + 1.2, z: e.z, dx: (px - e.x) / l, dz: (pz - e.z) / l });
            }
          } else this.kill(e, lunging ? 'lunge' : 'slash', ev);
        }
      }
    }

    // ---- enemies ----------------------------------------------------------
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = px - e.x, dz = pz - e.z;
      const dist = Math.hypot(dx, dz);
      e.facing = Math.atan2(dz, dx);
      e.bob += dt;
      e.blockCd = Math.max(0, e.blockCd - dt);
      if (dist > COMBAT.activateRange) { e.state = 'idle'; e.t = 0; e.telegraph = 0; continue; }
      const los = !segmentBlocked(this.boxes, e.x, e.y + 1.2, e.z, px, py, pz);
      if (e.type === 'charger') this.updateCharger(e, dt, dist, los, p, ev, invulnerable);
      else if (e.type === 'shield') this.updateShield(e, dt, dist, los, p, ev, invulnerable);
      else this.updateShooter(e, dt, dist, los, px, py, pz, ev);
    }

    // ---- projectiles ---------------------------------------------------------
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const b = this.projectiles[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.life -= dt;
      let dead = b.life <= 0;
      if (!dead) for (const bx of this.boxes) {
        if (bx.ghost || bx.hazard) continue;
        if (b.x > bx.minX && b.x < bx.maxX && b.y > bx.minY && b.y < bx.maxY && b.z > bx.minZ && b.z < bx.maxZ) { dead = true; break; }
      }
      if (!dead && b.owner === 'enemy') {
        const d = Math.hypot(b.x - px, b.y - py, b.z - pz);
        if (this.deflectLeft > 0 && d < COMBAT.deflectRadius) {
          // reflect straight back at whoever fired it
          const s = this.enemies[b.shooter];
          const tx = s ? s.x : b.x - b.vx, ty = s ? s.y + 1.2 : b.y, tz = s ? s.z : b.z - b.vz;
          const dd = Math.hypot(tx - b.x, ty - b.y, tz - b.z) || 1;
          const sp = COMBAT.bulletSpeed * 1.9;
          b.vx = ((tx - b.x) / dd) * sp; b.vy = ((ty - b.y) / dd) * sp; b.vz = ((tz - b.z) / dd) * sp;
          b.owner = 'player';
          b.kind = 'reflect';
          b.life = 3;
          ev.deflected.push({ x: b.x, y: b.y, z: b.z });
        } else if (d < COMBAT.bulletRadius + 0.35) {
          if (!invulnerable) ev.playerHit = true;
          dead = true;
        }
      } else if (!dead && b.owner === 'player') {
        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (Math.hypot(b.x - e.x, b.y - (e.type === 'drone' ? e.y : e.y + 1), b.z - e.z) < 1.1) {
            if (b.kind === 'star' && e.type === 'shield' && this.shieldBlocks(e, b.x - b.vx, b.z - b.vz)) {
              ev.blocked.push({ x: b.x, y: b.y, z: b.z, dx: -b.vx / COMBAT.starSpeed, dz: -b.vz / COMBAT.starSpeed });
            } else this.kill(e, 'reflect', ev);
            dead = true;
            break;
          }
        }
      }
      if (dead) this.projectiles.splice(i, 1);
    }
    return ev;
  }

  /** True when an attack coming from (ax, az) hits the front of this enemy's shield. */
  shieldBlocks(e: Enemy, ax: number, az: number): boolean {
    const a = Math.atan2(az - e.z, ax - e.x);
    let d = a - e.face;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.abs(d) < COMBAT.shieldArc;
  }

  /** Throw a shuriken along (dx,dy,dz); it homes slightly onto an enemy near the aim line. */
  throwStar(p: PlayerBody, dx: number, dy: number, dz: number): Projectile {
    const ox = p.x, oy = p.y + p.height * 0.7, oz = p.z;
    let l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    let best = 0.3;
    let tx = dx, ty = dy, tz = dz;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const vx = e.x - ox, vy = (e.type === 'drone' ? e.y : e.y + 1) - oy, vz = e.z - oz;
      const d = Math.hypot(vx, vy, vz);
      if (d < 1 || d > 50) continue;
      const ang = Math.acos(Math.min(1, (vx * dx + vy * dy + vz * dz) / d));
      if (ang < best && !segmentBlocked(this.boxes, ox, oy, oz, e.x, e.y + 1, e.z)) { best = ang; tx = vx / d; ty = vy / d; tz = vz / d; }
    }
    l = COMBAT.starSpeed;
    const b: Projectile = { id: this.nextProj++, x: ox, y: oy, z: oz, vx: tx * l, vy: ty * l, vz: tz * l, owner: 'player', kind: 'star', life: 1.5, shooter: -1 };
    this.projectiles.push(b);
    return b;
  }

  private updateShield(e: Enemy, dt: number, dist: number, los: boolean, p: PlayerBody, ev: CombatEvents, invulnerable: boolean): void {
    // turn the shield toward the player, but not instantly: circle around it to expose its back
    let d = Math.atan2(p.z - e.z, p.x - e.x) - e.face;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const turn = COMBAT.shieldTurn * dt;
    e.face += Math.max(-turn, Math.min(turn, d));
    e.facing = e.face;
    if (e.state === 'idle' || e.state === 'advance') {
      if (los && dist < 24) {
        e.state = 'advance';
        if (dist > 2.6) {
          const l = Math.hypot(p.x - e.x, p.z - e.z) || 1;
          e.x = Math.min(e.maxX, Math.max(e.minX, e.x + ((p.x - e.x) / l) * COMBAT.shieldSpeed * dt));
          e.z = Math.min(e.maxZ, Math.max(e.minZ, e.z + ((p.z - e.z) / l) * COMBAT.shieldSpeed * dt));
        } else { e.state = 'windup'; e.t = 0; ev.telegraphs.push({ id: e.id }); }
      }
    } else if (e.state === 'windup') {
      e.t += dt;
      e.telegraph = Math.min(1, e.t / COMBAT.shieldWindup);
      if (e.t >= COMBAT.shieldWindup) {
        if (Math.hypot(p.x - e.x, p.z - e.z) < 3.1 && Math.abs(p.y - e.y) < 1.8 && !invulnerable) ev.playerHit = true;
        e.state = 'cool';
        e.t = 0;
        e.telegraph = 0;
      }
    } else {
      e.t += dt;
      if (e.t >= 1.1) { e.state = 'idle'; e.t = 0; }
    }
  }

  private kill(e: Enemy, by: 'slash' | 'reflect' | 'lunge', ev: CombatEvents): void {
    e.alive = false;
    ev.kills.push({ id: e.id, type: e.type, x: e.x, y: e.y + 1, z: e.z, by });
  }

  private fire(e: Enemy, px: number, py: number, pz: number, ev: CombatEvents): void {
    const ox = e.x, oy = e.y + (e.type === 'drone' ? 0.2 : 1.3), oz = e.z;
    const dx = px - ox, dy = py - oy, dz = pz - oz;
    const d = Math.hypot(dx, dy, dz) || 1;
    const s = COMBAT.bulletSpeed;
    this.projectiles.push({ id: this.nextProj++, x: ox, y: oy, z: oz, vx: (dx / d) * s, vy: (dy / d) * s, vz: (dz / d) * s, owner: 'enemy', kind: 'bullet', life: 4, shooter: e.id });
    ev.fired.push({ x: ox, y: oy, z: oz });
  }

  private updateShooter(e: Enemy, dt: number, dist: number, los: boolean, px: number, py: number, pz: number, ev: CombatEvents): void {
    const aim = e.type === 'drone' ? COMBAT.droneAim : COMBAT.gunnerAim;
    const cool = e.type === 'drone' ? COMBAT.droneCool : COMBAT.gunnerCool;
    if (e.type === 'drone') {
      // hover and keep distance
      const want = 13;
      const dx = px - e.x, dz = pz - e.z;
      const l = Math.hypot(dx, dz) || 1;
      const dir = dist > want + 2 ? 1 : dist < want - 3 ? -1 : 0;
      e.x += (dx / l) * dir * 4 * dt + (-dz / l) * 1.5 * dt;
      e.z += (dz / l) * dir * 4 * dt + (dx / l) * 1.5 * dt;
      e.y = e.homeY + Math.sin(e.bob * 2) * 0.3;
    }
    if (e.state === 'idle') {
      if (los && dist < 30) {
        e.state = 'aim';
        e.t = 0;
        ev.telegraphs.push({ id: e.id });
      }
    } else if (e.state === 'aim') {
      e.t += dt;
      e.telegraph = Math.min(1, e.t / aim);
      if (!los) { e.state = 'idle'; e.telegraph = 0; }
      else if (e.t >= aim) {
        // slight lead on a moving target
        this.fire(e, px, py, pz, ev);
        e.state = 'cool';
        e.t = 0;
        e.telegraph = 0;
      }
    } else if (e.state === 'cool') {
      e.t += dt;
      if (e.t >= cool) { e.state = 'idle'; e.t = 0; }
    }
  }

  private updateCharger(e: Enemy, dt: number, dist: number, los: boolean, p: PlayerBody, ev: CombatEvents, invulnerable: boolean): void {
    if (e.state === 'idle') {
      if (los && dist < 20) { e.state = 'windup'; e.t = 0; ev.telegraphs.push({ id: e.id }); }
    } else if (e.state === 'windup') {
      e.t += dt;
      e.telegraph = Math.min(1, e.t / COMBAT.chargerWindup);
      const dx = p.x - e.x, dz = p.z - e.z, l = Math.hypot(dx, dz) || 1;
      e.dirX = dx / l; e.dirZ = dz / l;
      if (e.t >= COMBAT.chargerWindup) { e.state = 'charge'; e.t = 0; e.telegraph = 0; }
    } else if (e.state === 'charge') {
      e.t += dt;
      e.x = Math.min(e.maxX, Math.max(e.minX, e.x + e.dirX * COMBAT.chargerSpeed * dt));
      e.z = Math.min(e.maxZ, Math.max(e.minZ, e.z + e.dirZ * COMBAT.chargerSpeed * dt));
      if (Math.hypot(p.x - e.x, p.z - e.z) < 1.0 && Math.abs(p.y - e.y) < 1.6 && !invulnerable) {
        // a lunge or slash that landed this frame already killed it; otherwise this hurts
        ev.playerHit = true;
      }
      if (e.t >= COMBAT.chargerTime) { e.state = 'cool'; e.t = 0; }
    } else {
      e.t += dt;
      if (e.t >= COMBAT.chargerCool) { e.state = 'idle'; e.t = 0; }
    }
  }
}
