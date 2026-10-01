import Phaser from 'phaser';

export class RushMarker {
  private text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add
      .text(0, 0, '>>> RUSH [SHIFT]', { fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold', color: '#44ffee', stroke: '#000', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(60)
      .setVisible(false);
  }

  update(target: { x: number; y: number } | null, now: number): void {
    this.text.setVisible(target !== null);
    if (!target) return;
    this.text.setPosition(target.x, target.y - 60 + Math.sin(now / 90) * 3);
  }
}
