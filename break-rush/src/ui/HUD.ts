import Phaser from 'phaser';
import { Health } from '../combat/DamageSystem';

export class HUD {
  private bar: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private readonly w = 240;
  private readonly h = 20;

  constructor(scene: Phaser.Scene, private target: Health) {
    this.bar = scene.add.graphics().setScrollFactor(0).setDepth(100);
    this.label = scene.add
      .text(20 + this.w / 2, 20 + this.h / 2, '', { fontFamily: 'monospace', fontSize: '14px', color: '#fff' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(101);
  }

  update(): void {
    const ratio = Math.max(0, this.target.hp / this.target.maxHp);
    this.bar.clear();
    this.bar.fillStyle(0x000000, 0.6).fillRect(18, 18, this.w + 4, this.h + 4);
    this.bar.fillStyle(0x44dd66).fillRect(20, 20, this.w * ratio, this.h);
    this.label.setText(`HP ${Math.ceil(this.target.hp)} / ${this.target.maxHp}`);
  }
}
