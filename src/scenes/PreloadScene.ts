import Phaser from 'phaser';
import { COLORS, FONT } from '../ui/art';
import { IMAGE_KEYS, queueImages } from '../ui/assets';
import { H, W } from './TitleScene';

/** 画像アセットの読み込み。読み込みに失敗した画像は無視され、その部分は図形描画で表示される。 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    this.cameras.main.setBackgroundColor(0x14110f);
    const bar = this.add.graphics();
    const label = this.add
      .text(W / 2, H / 2 - 40, 'Loading...', { fontFamily: FONT, fontSize: '22px', color: '#9fb0c8' })
      .setOrigin(0.5);
    this.load.on('progress', (p: number) => {
      bar.clear();
      bar.fillStyle(0x2d3748, 1).fillRoundedRect(W / 2 - 200, H / 2, 400, 14, 7);
      bar.fillStyle(COLORS.energy, 1).fillRoundedRect(W / 2 - 200, H / 2, 400 * p, 14, 7);
      label.setText(`Loading... ${Math.round(p * 100)}%`);
    });
    this.load.on('loaderror', (f: { key: string }) => console.warn(`[assets] ${f.key} の読み込みに失敗（図形描画で代替）`));
    queueImages(this);
  }

  create(): void {
    // ドット絵がにじまないよう、全画像を最近傍補間にする
    for (const key of IMAGE_KEYS) this.textures.get(key)?.setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.scene.start('Title');
  }
}
