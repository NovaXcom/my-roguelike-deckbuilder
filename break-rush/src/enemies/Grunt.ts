import Phaser from 'phaser';
import { GRUNT } from '../config';
import { Enemy } from './Enemy';

export class Grunt extends Enemy {
  readonly contactDamage = GRUNT.contactDamage;
  readonly contactCooldown = GRUNT.contactCooldown;
  readonly speed = GRUNT.speed;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'grunt', GRUNT.maxHp);
    this.setCollideWorldBounds(true);
  }

  tick(target: Phaser.GameObjects.Components.Transform): void {
    if (this.stunned) return;
    const dir = Math.sign(target.x - this.x);
    this.setVelocityX(dir * this.speed);
    this.setFlipX(dir < 0);
  }
}
