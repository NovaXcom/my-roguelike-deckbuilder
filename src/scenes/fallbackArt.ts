import Phaser from 'phaser';

/** Programmatic stand-ins used when the PNG assets are absent. */
export function drawFallbackCharacter(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  name: string,
): void {
  const g = scene.add.graphics();
  g.fillStyle(color, 1).fillRoundedRect(x - 60, y - 100, 120, 200, 16);
  g.fillStyle(0xf1e0c5, 1).fillCircle(x, y - 130, 32);
  scene.add
    .text(x, y + 120, name, { fontSize: '22px', color: '#e2e8f0' })
    .setOrigin(0.5);
}

export function drawFallbackEnemy(scene: Phaser.Scene, x: number, y: number, name: string): void {
  const g = scene.add.graphics();
  g.fillStyle(0x553c9a, 1).fillTriangle(x - 110, y + 100, x + 110, y + 100, x, y - 120);
  g.fillStyle(0xfc8181, 1).fillCircle(x - 25, y - 10, 9).fillCircle(x + 25, y - 10, 9);
  scene.add
    .text(x, y + 125, name, { fontSize: '22px', color: '#e2e8f0' })
    .setOrigin(0.5);
}
