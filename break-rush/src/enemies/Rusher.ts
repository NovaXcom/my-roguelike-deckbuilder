import Phaser from 'phaser';
import { EnemyTier } from '../systems/Loot';
import { MeleeEnemy } from './MeleeEnemy';

/** Keeps its distance, shows a red lane, then dashes across it. Dodge through it (or hit it first). */
export class Rusher extends MeleeEnemy {
  protected override boxW = 44;
  protected override boxH = 52;
  protected override boxCentered = true;

  constructor(scene: Phaser.Scene, x: number, y: number, hpMult = 1, tier: EnemyTier = 'normal') {
    super(scene, x, y, 'rusher', 'rusher', hpMult, tier);
  }
}
