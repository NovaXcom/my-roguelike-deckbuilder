import Phaser from 'phaser';
import { GRUNT } from '../config';
import { Enemy } from './Enemy';

export class Grunt extends Enemy {
  readonly contactDamage = GRUNT.contactDamage;
  readonly contactCooldown = GRUNT.contactCooldown;
  /** Slight per-grunt variation so groups string out instead of stacking. */
  readonly speed = GRUNT.speed * Phaser.Math.FloatBetween(0.8, 1.25);

  constructor(scene: Phaser.Scene, x: number, y: number, hpMult = 1) {
    super(scene, x, y, 'grunt', Math.round(GRUNT.maxHp * hpMult), GRUNT.maxBreak);
    this.setCollideWorldBounds(true);
  }

  protected ai(target: Phaser.GameObjects.Components.Transform): void {
    const dir = Math.sign(target.x - this.x);
    this.setVelocityX(dir * this.speed);
    this.setFlipX(dir < 0);
  }
}
