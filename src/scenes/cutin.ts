import Phaser from 'phaser';
import { addImageIfLoaded } from './assetHelpers';

/** Overlay scene: `scene.launch('Cutin', { key, title })`. */
export class CutinScene extends Phaser.Scene {
  constructor() {
    super('Cutin');
  }

  create(data: { key?: string; title?: string }): void {
    const { width, height } = this.scale;
    const band = this.add.container(0, 0);
    const bandH = height * 0.5;
    const y = height / 2;

    const img = data.key ? addImageIfLoaded(this, data.key, width / 2, y) : null;
    if (img) {
      img.setScale(Math.max(width / img.width, bandH / img.height));
      band.add(img);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x2d3748, 1).fillRect(0, y - bandH / 2, width, bandH);
      g.fillStyle(0x00f2fe, 1).fillRect(0, y - bandH / 2, width, 6).fillRect(0, y + bandH / 2 - 6, width, 6);
      band.add(g);
    }
    band.add(
      this.add
        .text(width / 2, y, data.title ?? '', {
          fontSize: '96px',
          color: '#fff',
          stroke: '#00f2fe',
          strokeThickness: 6,
        })
        .setOrigin(0.5),
    );

    // Mask the band so the image only shows in the horizontal strip, then slide in/out.
    const mask = this.add.graphics().fillRect(0, y - bandH / 2, width, bandH).setVisible(false);
    band.setMask(mask.createGeometryMask());
    band.x = -width;
    this.tweens.chain({
      targets: band,
      tweens: [
        { x: 0, duration: 250, ease: 'Cubic.easeOut' },
        { x: 0, duration: 700 },
        { x: width, duration: 250, ease: 'Cubic.easeIn' },
      ],
      onComplete: () => this.scene.stop(),
    });
  }
}
