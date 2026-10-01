import Phaser from 'phaser';
import { GROUND_Y } from '../config';
import { audio } from '../audio/AudioSystem';
import { Drop } from './Loot';

interface Pickup {
  img: Phaser.GameObjects.Image;
  drop: Drop;
  vx: number;
  vy: number;
  bornAt: number;
  speed: number;
}

const TEXTURE = { gold: 'coin', xp: 'gem', heal: 'heart' } as const;
const FLOOR = GROUND_Y - 6;

/**
 * Loot that pops out of enemies, bounces, then gets sucked into the player. Everything is simulated by
 * hand (no physics bodies) so hundreds of pickups stay cheap.
 */
export class PickupManager {
  private items: Pickup[] = [];
  private streak = 0;
  private lastCollectAt = 0;
  /** When true every pickup flies to the player regardless of distance (room clear). */
  vacuum = false;

  constructor(
    private scene: Phaser.Scene,
    private target: () => { x: number; y: number },
    private onCollect: (d: Drop) => void,
    /** Heals are only picked up while this returns true. */
    private canHeal: () => boolean,
  ) {}

  get count(): number {
    return this.items.length;
  }

  spawn(drop: Drop, x: number, y: number): void {
    const img = this.scene.add.image(x, y, TEXTURE[drop.type]).setDepth(12);
    if (drop.type === 'heal') img.setScale(1.4);
    const angle = Phaser.Math.FloatBetween(-Math.PI * 0.95, -Math.PI * 0.05);
    const power = Phaser.Math.FloatBetween(120, 360);
    this.items.push({ img, drop, vx: Math.cos(angle) * power, vy: Math.sin(angle) * power - 60, bornAt: this.scene.time.now, speed: 0 });
  }

  spawnAll(drops: Drop[], x: number, y: number): void {
    for (const d of drops) this.spawn(d, x + Phaser.Math.Between(-10, 10), y);
  }

  update(dt: number, now: number, magnetRadius: number): void {
    const t = this.target();
    this.items = this.items.filter((p) => {
      const wantsPull = this.vacuum || (now - p.bornAt > 380 && (p.drop.type !== 'heal' || this.canHeal()));
      const dx = t.x - p.img.x;
      const dy = t.y - p.img.y;
      const dist = Math.hypot(dx, dy);
      if (wantsPull && (this.vacuum || dist < magnetRadius)) {
        // Accelerating homing: slow start, then a satisfying whoosh
        p.speed = Math.min(1500, p.speed + 2600 * dt + (this.vacuum ? 800 * dt : 0));
        p.vx = (dx / (dist || 1)) * p.speed;
        p.vy = (dy / (dist || 1)) * p.speed;
        p.img.x += p.vx * dt;
        p.img.y += p.vy * dt;
      } else {
        p.vy += 1500 * dt;
        p.img.x += p.vx * dt;
        p.img.y += p.vy * dt;
        if (p.img.y >= FLOOR) {
          p.img.y = FLOOR;
          p.vy = -p.vy * 0.4;
          p.vx *= 0.7;
          if (Math.abs(p.vy) < 40) p.vy = 0;
        }
      }
      p.img.angle += (p.drop.type === 'xp' ? 300 : 0) * dt;
      if (dist < 28 && (p.drop.type !== 'heal' || this.canHeal())) {
        this.collect(p, now);
        return false;
      }
      return true;
    });
  }

  private collect(p: Pickup, now: number): void {
    this.streak = now - this.lastCollectAt < 450 ? Math.min(this.streak + 1, 14) : 0;
    this.lastCollectAt = now;
    // Pitch climbs with the streak so a shower of loot plays a rising run of notes
    const pitch = 1 + this.streak * 0.045;
    if (p.drop.type === 'gold') audio.play('coin', pitch);
    else if (p.drop.type === 'xp') audio.play('gem', pitch);
    else audio.play('heal');
    this.onCollect(p.drop);
    p.img.destroy();
  }

  clear(): void {
    this.items.forEach((p) => p.img.destroy());
    this.items = [];
  }
}
