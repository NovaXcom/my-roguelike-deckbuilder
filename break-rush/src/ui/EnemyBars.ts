import Phaser from 'phaser';
import { Enemy } from '../enemies/Enemy';
import { breakRatio } from '../combat/BreakSystem';

/** Draws HP and break gauges above every enemy with one shared Graphics. */
export class EnemyBars {
  private g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(45);
  }

  update(enemies: Enemy[], now: number): void {
    const w = 40;
    this.g.clear();
    for (const e of enemies) {
      if (!e.active) continue;
      const x = e.x - w / 2;
      const y = e.y - e.displayHeight / 2 - 14;
      this.g.fillStyle(0x000000, 0.7).fillRect(x - 1, y - 1, w + 2, 11);
      this.g.fillStyle(0xdd3344).fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), 4);
      this.g.fillStyle(e.broken ? 0xff8800 : 0xffdd44).fillRect(x, y + 5, w * breakRatio(e.breakState, now), 4);
    }
  }
}
