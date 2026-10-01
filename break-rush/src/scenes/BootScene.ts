import Phaser from 'phaser';

/** Generates placeholder textures (no external assets in Phase 1). */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    g.fillStyle(0x4aa8ff).fillRect(0, 0, 32, 48);
    g.fillStyle(0xffffff).fillRect(20, 10, 8, 8); // eye -> shows facing
    g.generateTexture('player', 32, 48);
    g.clear();

    g.fillStyle(0xd94a4a).fillRect(0, 0, 32, 40);
    g.fillStyle(0x000000).fillRect(4, 10, 8, 8);
    g.generateTexture('grunt', 32, 40);
    g.clear();

    g.fillStyle(0x23233a).fillRect(0, 0, 64, 64);
    g.lineStyle(1, 0x34345a).strokeRect(0, 0, 64, 64);
    g.generateTexture('ground', 64, 64);
    g.destroy();

    this.scene.start('Game');
  }
}
