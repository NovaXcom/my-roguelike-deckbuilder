import Phaser from 'phaser';
import { isBlocked } from '../combat/Blocking';
import { EnemyTier } from '../systems/Loot';
import { MeleeEnemy } from './MeleeEnemy';

/** Shield up front: light attacks from the front bounce off. Use the finisher, counters, or get behind it. */
export class GuardEnemy extends MeleeEnemy {
  protected override boxW = 72;
  protected override boxH = 56;

  constructor(scene: Phaser.Scene, x: number, y: number, hpMult = 1, tier: EnemyTier = 'normal') {
    super(scene, x, y, 'guard', 'guard', hpMult, tier);
  }

  override blocksLightHit(attackerX: number, step: number, counter: boolean, rush: boolean): boolean {
    return isBlocked({ guardFacing: this.facing, guardX: this.x, attackerX, step, counter, rush, broken: this.broken });
  }
}
