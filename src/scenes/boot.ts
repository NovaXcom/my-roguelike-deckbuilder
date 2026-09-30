import Phaser from 'phaser';
import { AVAILABLE_ASSET_URLS } from '../core/assets';

/**
 * Loads whichever manifest images exist under src/assets/. A failed or
 * missing file never stops the game: scenes fall back to canvas drawing.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const { width, height } = this.scale;
    const bar = this.add.graphics();
    const label = this.add
      .text(width / 2, height / 2 - 30, 'Loading...', { fontSize: '20px', color: '#e2e8f0' })
      .setOrigin(0.5);
    this.load.on('progress', (v: number) => {
      bar.clear().fillStyle(0x00f2fe, 1).fillRect(width / 2 - 200, height / 2, 400 * v, 10);
    });
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.warn(`[assets] failed to load "${file.key}", using canvas fallback`);
    });
    this.load.once('complete', () => label.destroy());

    for (const [key, url] of Object.entries(AVAILABLE_ASSET_URLS)) {
      this.load.image(key, url);
    }
  }

  create(): void {
    this.scene.start('Title');
  }
}
