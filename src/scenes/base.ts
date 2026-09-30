import Phaser from 'phaser';
import { addImageIfLoaded, drawBackground, makeButton } from './assetHelpers';
import { drawFallbackCharacter } from './fallbackArt';

export class BaseScene extends Phaser.Scene {
  constructor() {
    super('Base');
  }

  create(): void {
    const { width, height } = this.scale;
    drawBackground(this, 'bg_base', 0x2d3748, 0x1e1b18);
    this.add.text(24, 20, '拠点', { fontSize: '36px', color: '#e2e8f0' });

    const fit = { width: 300, height: 420 };
    if (!addImageIfLoaded(this, 'char_knight', width * 0.35, height * 0.55, fit)) {
      drawFallbackCharacter(this, width * 0.35, height * 0.55, 0xc53030, 'ナイト');
    }
    if (!addImageIfLoaded(this, 'char_elementalist', width * 0.65, height * 0.55, fit)) {
      drawFallbackCharacter(this, width * 0.65, height * 0.55, 0x3182ce, 'エレメンタリスト');
    }
    makeButton(this, width / 2, height * 0.9, 'ダンジョンへ', () => this.scene.start('Battle'));
  }
}
