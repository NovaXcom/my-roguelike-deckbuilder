import Phaser from 'phaser';
import { GAME_WIDTH } from '../config';

export class ComboDisplay {
  private num: Phaser.GameObjects.Text;
  private label: Phaser.GameObjects.Text;
  private bar: Phaser.GameObjects.Graphics;
  private last = 0;

  constructor(private scene: Phaser.Scene) {
    const style = { fontFamily: 'monospace', fontStyle: 'bold', stroke: '#000', strokeThickness: 6 };
    this.num = scene.add.text(GAME_WIDTH - 24, 56, '', { ...style, fontSize: '48px' }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);
    this.label = scene.add.text(GAME_WIDTH - 24, 56, 'HIT', { ...style, fontSize: '20px', strokeThickness: 4 }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);
    this.bar = scene.add.graphics().setScrollFactor(0).setDepth(100);
  }

  update(hits: number, ratio: number): void {
    const visible = hits > 0;
    this.num.setVisible(visible);
    this.label.setVisible(visible);
    this.bar.clear();
    if (!visible) {
      this.last = 0;
      return;
    }
    const color = hits >= 50 ? '#ff4455' : hits >= 25 ? '#ff9933' : hits >= 10 ? '#ffdd44' : '#ffffff';
    const size = 44 + Math.min(hits, 50) * 0.8;
    this.num.setText(String(hits)).setColor(color).setFontSize(size);
    this.label.setColor(color).setText(hits >= 50 ? 'HIT!!' : 'HIT').setY(this.num.y + size + 2);
    if (hits > this.last) {
      this.scene.tweens.killTweensOf(this.num);
      this.num.setScale(1.35);
      this.scene.tweens.add({ targets: this.num, scale: 1, duration: 140, ease: 'Back.easeOut' });
    }
    this.last = hits;
    const w = 140;
    const y = this.label.y + 26;
    this.bar.fillStyle(0x000000, 0.6).fillRect(GAME_WIDTH - 24 - w - 2, y - 2, w + 4, 10);
    this.bar.fillStyle(0xffdd44).fillRect(GAME_WIDTH - 24 - w, y, w * ratio, 6);
  }
}
