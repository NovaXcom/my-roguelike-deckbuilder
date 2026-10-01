import Phaser from 'phaser';
import { EnemyTier } from '../systems/Loot';
import { MeleeEnemy } from './MeleeEnemy';

/** Basic enemy: closes in, crouches (red warning), then lunges. */
export class Grunt extends MeleeEnemy {
  constructor(scene: Phaser.Scene, x: number, y: number, hpMult = 1, tier: EnemyTier = 'normal') {
    super(scene, x, y, 'grunt', 'grunt', hpMult, tier);
  }
}
