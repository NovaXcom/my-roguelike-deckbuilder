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
    g.fillStyle(0x667788).fillRect(0, 0, 120, 100);
    g.fillStyle(0x3d4757).fillRect(0, 70, 120, 30);
    g.fillStyle(0x556070).fillRect(10, 10, 100, 12).fillRect(10, 30, 100, 12);
    g.fillStyle(0xff3344).fillRect(78, 48, 24, 12);
    g.generateTexture('boss', 120, 100);
    g.clear();

    g.fillStyle(0xffffff).fillRect(0, 0, 8, 8);
    g.generateTexture('spark', 8, 8);
    g.destroy();

    // Dev shortcut: ?start=result previews the result screen
    if (new URLSearchParams(location.search).get('start') === 'result') {
      this.scene.start('Result', {
        run: { stage: 1, owned: [], totalScore: 0 },
        summary: { stage: 1, score: 12345, maxCombo: 62, damageTaken: 20, timeSec: 130, rank: 'A' },
      });
      return;
    }
    this.scene.start('Game');
  }
}
