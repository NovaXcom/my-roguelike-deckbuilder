import Phaser from 'phaser';

/** True only if the texture was really loaded (Phaser's __MISSING/__DEFAULT don't count). */
export function hasAsset(scene: Phaser.Scene, key: string): boolean {
  return scene.textures.exists(key) && key !== '__MISSING' && key !== '__DEFAULT';
}

/**
 * Add the image if it was loaded, otherwise return null so the caller can
 * draw its programmatic (shape/text) fallback.
 */
export function addImageIfLoaded(
  scene: Phaser.Scene,
  key: string,
  x: number,
  y: number,
  fit?: { width: number; height: number },
  origin: [number, number] = [0.5, 0.5],
): Phaser.GameObjects.Image | null {
  if (!hasAsset(scene, key)) return null;
  const img = scene.add.image(x, y, key).setOrigin(origin[0], origin[1]);
  if (fit) {
    const s = Math.min(fit.width / img.width, fit.height / img.height);
    img.setScale(s);
  }
  return img;
}

/** Full-screen background: image if available, else a vertical gradient. */
export function drawBackground(
  scene: Phaser.Scene,
  key: string,
  top: number,
  bottom: number,
): void {
  const { width, height } = scene.scale;
  const img = addImageIfLoaded(scene, key, width / 2, height / 2);
  if (img) {
    img.setScale(Math.max(width / img.width, height / img.height));
    return;
  }
  const g = scene.add.graphics();
  g.fillGradientStyle(top, top, bottom, bottom, 1);
  g.fillRect(0, 0, width, height);
}

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, label, {
      fontSize: '28px',
      color: '#e2e8f0',
      backgroundColor: '#2d3748',
      padding: { x: 24, y: 12 },
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  t.on('pointerover', () => t.setScale(1.08).setColor('#00f2fe'));
  t.on('pointerout', () => t.setScale(1).setColor('#e2e8f0'));
  t.on('pointerdown', onClick);
  return t;
}
