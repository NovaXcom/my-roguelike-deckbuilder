import Phaser from 'phaser';
import { drawBackground } from './assetHelpers';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    const { width, height } = this.scale;
    drawBackground(this, 'bg_title', 0x0f172a, 0x1e1b18);
    this.add
      .text(width / 2, height * 0.38, 'ROGUELIKE PARTY RPG', {
        fontSize: '64px',
        color: '#e2e8f0',
        stroke: '#000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(width / 2, height * 0.68, 'Click to Start', { fontSize: '28px', color: '#00f2fe' })
      .setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.3, yoyo: true, repeat: -1, duration: 800 });
    // First user gesture: Phaser resumes its AudioContext on this input (autoplay policy).
    this.input.once('pointerdown', () => this.scene.start('Base'));
  }
}
