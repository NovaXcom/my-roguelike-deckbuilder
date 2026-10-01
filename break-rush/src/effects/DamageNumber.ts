import Phaser from 'phaser';

export function spawnDamageNumber(scene: Phaser.Scene, x: number, y: number, value: number | string, color = '#ffffff'): void {
  const t = scene.add
    .text(x, y, String(value), { fontFamily: 'monospace', fontSize: '22px', fontStyle: 'bold', color, stroke: '#000', strokeThickness: 4 })
    .setOrigin(0.5)
    .setDepth(50);
  scene.tweens.add({
    targets: t,
    x: x + Phaser.Math.Between(-30, 30),
    y: y - Phaser.Math.Between(40, 70),
    alpha: 0,
    duration: 700,
    ease: 'Cubic.easeOut',
    onComplete: () => t.destroy(),
  });
}
