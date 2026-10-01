import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';
import { Enemy } from '../enemies/Enemy';
import { breakRatio } from '../combat/BreakSystem';

export class BossBar {
  private g: Phaser.GameObjects.Graphics;
  private name: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, label = 'IRON BEAST') {
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(100);
    this.name = scene.add
      .text(GAME_WIDTH / 2, 56, label, { fontFamily: 'monospace', fontSize: '16px', fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(101)
      .setVisible(false);
  }

  update(boss: Enemy | null, now: number): void {
    this.g.clear();
    this.name.setVisible(!!boss);
    if (!boss) return;
    const w = 460;
    const x = (GAME_WIDTH - w) / 2;
    this.g.fillStyle(0x000000, 0.7).fillRect(x - 2, 78, w + 4, 30);
    this.g.fillStyle(0xdd3344).fillRect(x, 80, w * Math.max(0, boss.hp / boss.maxHp), 14);
    this.g.fillStyle(boss.broken ? 0xff8800 : 0xffdd44).fillRect(x, 96, w * breakRatio(boss.breakState, now), 10);
  }
}
