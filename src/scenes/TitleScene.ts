import Phaser from 'phaser';
import { audio } from '../audio';
import { COLORS, drawBackground, txt } from '../ui/art';
import { isTouchDevice } from '../ui/device';
import { onTap, padHitArea } from '../ui/widgets';

export const W = 1280;
export const H = 720;

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create(): void {
    drawBackground(this, W, H);
    const title = txt(this, W / 2, 230, 'オリジナル・\nパーティローグRPG', 68, '#f6e3b4', {
      fontStyle: 'bold', align: 'center', stroke: '#000', strokeThickness: 8,
    }).setOrigin(0.5);
    this.tweens.add({ targets: title, y: 240, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    txt(this, W / 2, 380, '2人パーティ × スキル・クールダウン × ブレイク＆チェイン', 20, '#9fb0c8').setOrigin(0.5);

    const btn = this.add.container(W / 2, 500);
    const bg = this.add.graphics();
    bg.fillStyle(0x2d3748, 1);
    bg.fillRoundedRect(-170, -34, 340, 68, 14);
    bg.lineStyle(3, COLORS.energy, 1);
    bg.strokeRoundedRect(-170, -34, 340, 68, 14);
    btn.add([bg, txt(this, 0, 0, (isTouchDevice() ? 'タップでスタート' : 'クリックでスタート'), 28, '#00f2fe', { fontStyle: 'bold' }).setOrigin(0.5)]);
    padHitArea(btn, 340, 68);
    this.tweens.add({ targets: btn, scale: 1.05, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    txt(this, W / 2, 660, (isTouchDevice() ? '※ スマホは横向きでプレイ ／ 最初のタップで音声が有効になります' : '※ 最初のクリックで音声が有効になります'), 14, '#7b8798').setOrigin(0.5);

    const start = () => {
      audio.unlock(); // Autoplay 制限回避: 最初のユーザー操作で AudioContext を開放（グローバル解錠と二重でも安全）
      audio.play('ui_select');
      this.scene.start('Town');
    };
    onTap(btn, start);
    this.input.keyboard?.once('keydown-ENTER', start);
    this.input.keyboard?.once('keydown-SPACE', start);
  }
}
