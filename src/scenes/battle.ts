import Phaser from 'phaser';
import { addImageIfLoaded, drawBackground, makeButton } from './assetHelpers';
import { drawFallbackCharacter, drawFallbackEnemy } from './fallbackArt';

export class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  create(): void {
    const { width, height } = this.scale;
    drawBackground(this, 'bg_dungeon', 0x1a202c, 0x0b0d12);

    const fit = { width: 260, height: 360 };
    if (!addImageIfLoaded(this, 'char_knight', width * 0.15, height * 0.6, fit)) {
      drawFallbackCharacter(this, width * 0.15, height * 0.6, 0xc53030, 'ナイト');
    }
    if (!addImageIfLoaded(this, 'char_elementalist', width * 0.3, height * 0.6, fit)) {
      drawFallbackCharacter(this, width * 0.3, height * 0.6, 0x3182ce, 'エレメンタリスト');
    }
    if (!addImageIfLoaded(this, 'enemy_dragon', width * 0.75, height * 0.5, { width: 420, height: 420 })) {
      drawFallbackEnemy(this, width * 0.75, height * 0.5, 'ドラゴン');
    }

    makeButton(this, width * 0.3, height * 0.92, 'チェイン発動', () => {
      this.cameras.main.shake(200, 0.01);
      this.scene.launch('Cutin', { key: 'cutin_chain', title: 'CHAIN!' });
    });
    makeButton(this, width * 0.7, height * 0.92, '拠点へ戻る', () => this.scene.start('Base'));
  }
}
