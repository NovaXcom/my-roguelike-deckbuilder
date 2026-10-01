import Phaser from 'phaser';
import { ENEMY_STATS, EnemyKind, EnemyStats } from '../config';
import { Rect } from '../combat/DamageSystem';
import { MeleeBrain } from '../combat/MeleeBrain';
import { AttackTokens } from '../combat/AttackTokens';
import { EnemyTier, TIER_DMG_MULT } from '../systems/Loot';
import { Enemy, HitInfo, HitResult } from './Enemy';

/**
 * Shared behaviour for grunt / rusher / guard: wait at a distance until an attack slot is free, close
 * in, telegraph, strike, then be vulnerable. Emits 'windup' (kind, windupMs, dir) and 'strike'.
 */
export abstract class MeleeEnemy extends Enemy {
  readonly contactDamage = 0;
  readonly contactCooldown = 0;
  readonly speed: number;
  readonly kind: EnemyKind;
  readonly stats: EnemyStats;
  readonly tier: EnemyTier;
  /** Damage multiplier from depth and tier. */
  dmgMult = 1;
  /** Idle until the player gets this close (fodder stand around between fights). */
  aggroRange = Infinity;
  private aggroed = false;
  /** Belongs to the live locked encounter (the fight ends when all of these are dead). */
  inEncounter = false;
  readonly brain: MeleeBrain;
  tokens!: AttackTokens;
  attackDir: 1 | -1 = 1;
  /** Each attack can hurt the player once. */
  hitConnected = false;
  protected boxW = 60;
  protected boxH = 48;
  protected boxCentered = false;
  private slotDist: number;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, kind: EnemyKind, hpMult: number, tier: EnemyTier = 'normal') {
    const st = ENEMY_STATS[kind];
    super(scene, x, y, texture, Math.round(st.maxHp * hpMult), st.maxBreak);
    this.kind = kind;
    this.tier = tier;
    this.stats = st;
    this.speed = st.speed * Phaser.Math.FloatBetween(0.9, 1.1);
    this.points = st.points;
    this.brain = new MeleeBrain(st, Math.random, scene.time.now, Phaser.Math.Between(400, 1100));
    const lo = Math.max(st.startRangeMax + 60, 150);
    this.slotDist = Phaser.Math.Between(lo, lo + 140);
    this.setCollideWorldBounds(true);
  }

  get attackDamage(): number {
    return Math.max(1, Math.round(this.stats.attackDamage * this.dmgMult * TIER_DMG_MULT[this.tier]));
  }

  override get showBars(): boolean {
    return this.tier !== 'fodder' || this.hp < this.maxHp;
  }

  /** The area that hurts the player while the strike is live. */
  get attackBox(): Rect | null {
    if (this.brain.phase !== 'active' || this.hitConnected) return null;
    const w = this.boxW;
    const h = this.boxH;
    const x = this.boxCentered ? this.x - w / 2 : this.attackDir === 1 ? this.x + 2 : this.x - 2 - w;
    return { x, y: this.y - h / 2, w, h };
  }

  override takeHit(info: HitInfo): HitResult {
    const res = super.takeHit(info);
    if (this.brain.interrupt(this.scene.time.now, 600)) {
      this.telegraphing = false;
      this.tokens?.release(this);
    }
    return res;
  }

  override destroy(fromScene?: boolean): void {
    this.tokens?.release(this);
    super.destroy(fromScene);
  }

  protected ai(target: Phaser.GameObjects.Components.Transform): void {
    const now = this.scene.time.now;
    const dx = target.x - this.x;
    const dist = Math.abs(dx);
    const dir: 1 | -1 = dx >= 0 ? 1 : -1;

    if (!this.aggroed) {
      if (dist > this.aggroRange) {
        this.setVelocityX(0);
        return;
      }
      this.aggroed = true;
    }

    const phase = this.brain.update(now);
    if (phase === 'active') {
      this.telegraphing = false;
      this.emit('strike');
    } else if (phase === 'approach') {
      this.tokens.release(this);
    }

    switch (this.brain.phase) {
      case 'windup':
        this.telegraphing = true;
        this.setVelocityX(0);
        break;
      case 'active':
        this.setVelocityX(this.attackDir * this.stats.lungeSpeed);
        break;
      case 'recover':
        this.setVelocityX(0);
        break;
      default:
        this.approach(now, dist, dir);
    }
  }

  private approach(now: number, dist: number, dir: 1 | -1): void {
    const st = this.stats;
    this.setFlipX(dir < 0);
    if (this.brain.ready(now) && dist <= st.engageDist) this.tokens.acquire(this);
    // A slot holder who lost the player gives the slot back
    if (this.tokens.has(this) && dist > st.engageDist * 1.8) this.tokens.release(this);

    if (this.tokens.has(this)) {
      if (dist >= st.startRangeMin && dist <= st.startRangeMax && this.brain.start(now)) {
        this.attackDir = dir;
        this.hitConnected = false;
        this.telegraphing = true;
        this.setVelocityX(0);
        this.emit('windup', this.kind, st.windupMs, dir);
        return;
      }
      this.setVelocityX((dist > st.startRangeMax ? dir : -dir) * this.speed * (dist > st.startRangeMax ? 1 : 0.7));
      return;
    }
    // Waiting for a free slot: hover around the slot distance
    if (dist > this.slotDist + 25) this.setVelocityX(dir * this.speed * 0.8);
    else if (dist < this.slotDist - 25) this.setVelocityX(-dir * this.speed * 0.5);
    else this.setVelocityX(0);
  }
}
