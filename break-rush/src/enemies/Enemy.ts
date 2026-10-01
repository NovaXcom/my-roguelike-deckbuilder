import Phaser from 'phaser';
import { PLAYER } from '../config';
import { Health, applyDamage, isDead } from '../combat/DamageSystem';

/** Base class for all enemies. Subclasses supply stats and (optionally) behaviour. */
export abstract class Enemy extends Phaser.Physics.Arcade.Sprite implements Health {
  hp: number;
  maxHp: number;
  abstract readonly contactDamage: number;
  abstract readonly contactCooldown: number;
  abstract readonly speed: number;
  nextContactAt = 0;
  private stunUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, maxHp: number) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setGravityY(PLAYER.gravity);
    this.maxHp = maxHp;
    this.hp = maxHp;
  }

  get dead(): boolean {
    return isDead(this);
  }

  /** Returns damage dealt. Applies knockback + a short stun. */
  takeHit(amount: number, knockbackX: number, knockbackY = -160): number {
    const dealt = applyDamage(this, amount);
    this.stunUntil = this.scene.time.now + 250;
    this.setVelocity(knockbackX, knockbackY);
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => this.active && this.clearTint());
    return dealt;
  }

  protected get stunned(): boolean {
    return this.scene.time.now < this.stunUntil;
  }

  /** Per-frame AI. */
  abstract tick(target: Phaser.GameObjects.Components.Transform): void;
}
