import Phaser from 'phaser';
import { Health, applyDamage, isDead } from '../combat/DamageSystem';
import { BreakState, applyBreakDamage, createBreak, isBroken, updateBreak } from '../combat/BreakSystem';
import { PLAYER } from '../config';

export interface HitInfo {
  damage: number;
  breakDamage: number;
  knockbackX: number;
  knockbackY?: number;
  stunMs?: number;
}

export interface HitResult {
  dealt: number;
  justBroken: boolean;
}

/** Base class for all enemies. Subclasses supply stats and AI. */
export abstract class Enemy extends Phaser.Physics.Arcade.Sprite implements Health {
  hp: number;
  maxHp: number;
  readonly breakState: BreakState;
  abstract readonly contactDamage: number;
  abstract readonly contactCooldown: number;
  abstract readonly speed: number;
  nextContactAt = 0;
  private stunUntil = 0;
  private flashUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, maxHp: number, maxBreak: number) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setGravityY(PLAYER.gravity);
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.breakState = createBreak(maxBreak);
  }

  get dead(): boolean {
    return isDead(this);
  }

  get broken(): boolean {
    return isBroken(this.breakState, this.scene.time.now);
  }

  /** Stunned or broken: cannot move or deal contact damage. */
  get disabled(): boolean {
    return this.broken || this.scene.time.now < this.stunUntil;
  }

  takeHit(info: HitInfo): HitResult {
    const now = this.scene.time.now;
    const dealt = applyDamage(this, info.damage);
    const justBroken = applyBreakDamage(this.breakState, info.breakDamage, now);
    this.stunUntil = Math.max(this.stunUntil, now + (info.stunMs ?? 250));
    if (justBroken) this.stunUntil = Math.max(this.stunUntil, this.breakState.brokenUntil);
    this.flashUntil = now + 80;
    this.setVelocity(info.knockbackX, info.knockbackY ?? -160);
    return { dealt, justBroken };
  }

  /** Per-frame update: break recovery, visuals, then AI when able to act. */
  tick(target: Phaser.GameObjects.Components.Transform): void {
    const now = this.scene.time.now;
    updateBreak(this.breakState, now);
    const disabled = this.disabled;
    this.setDragX(disabled ? 900 : 0);
    if (now < this.flashUntil) this.setTintFill(0xffffff);
    else if (this.broken) this.setTint(0xffdd44);
    else this.clearTint();
    if (!disabled) this.ai(target);
  }

  protected abstract ai(target: Phaser.GameObjects.Components.Transform): void;
}
