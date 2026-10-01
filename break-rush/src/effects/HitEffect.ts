import Phaser from 'phaser';

/** Simple square-particle burst built from tweened rectangles (no assets needed). */
export function burst(scene: Phaser.Scene, x: number, y: number, color: number, count = 10, power = 120): void {
  for (let i = 0; i < count; i++) {
    const size = Phaser.Math.Between(4, 9);
    const p = scene.add.rectangle(x, y, size, size, color).setDepth(40);
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const dist = Phaser.Math.FloatBetween(power * 0.4, power);
    scene.tweens.add({
      targets: p,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      alpha: 0,
      scale: 0.2,
      angle: Phaser.Math.Between(-180, 180),
      duration: Phaser.Math.Between(300, 500),
      ease: 'Cubic.easeOut',
      onComplete: () => p.destroy(),
    });
  }
}

export function deathEffect(scene: Phaser.Scene, x: number, y: number): void {
  burst(scene, x, y, 0xff5566, 18, 160);
}
