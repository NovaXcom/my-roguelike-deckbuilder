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
  /** Score for a kill. */
  points = 100;
  nextContactAt = 0;
  /** Set while winding up an attack: shows the red warning pulse. */
  protected telegraphing = false;
  private wasTelegraphing = false;
  private stunUntil = 0;
  protected flashUntil = 0;

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

  /** Direction the sprite faces (art is drawn facing right). */
  get facing(): 1 | -1 {
    return this.flipX ? -1 : 1;
  }

  /** Override to shield against light hits. Called before damage is applied. */
  blocksLightHit(_attackerX: number, _step: number, _counter: boolean, _rush: boolean): boolean {
    return false;
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
    const ky = info.knockbackY ?? -160;
    this.setVelocity(info.knockbackX, ky);
    // Heavy launches spin the enemy through the air
    if (ky <= -250) {
      this.scene.tweens.killTweensOf(this);
      this.scene.tweens.add({ targets: this, angle: (Math.sign(info.knockbackX) || 1) * 360, duration: 420, onComplete: () => this.active && this.setAngle(0) });
    }
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
    else if (this.telegraphing) {
      this.setTint(Math.floor(now / 70) % 2 ? 0xff3333 : 0xffb0b0);
      this.setAngle(-this.facing * 12); // lean back = winding up
    } else this.clearTint();
    if (this.wasTelegraphing && !this.telegraphing) this.setAngle(0);
    this.wasTelegraphing = this.telegraphing;
    if (!disabled) this.ai(target);
  }

  override destroy(fromScene?: boolean): void {
    this.scene?.tweens.killTweensOf(this);
    super.destroy(fromScene);
  }

  protected abstract ai(target: Phaser.GameObjects.Components.Transform): void;
}

