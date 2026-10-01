import Phaser from 'phaser';
import { audio } from '../audio';
import { openChest } from '../core/run';
import { game } from '../game';
import { drawBackground, txt } from '../ui/art';
import { hasImg } from '../ui/assets';
import { makeButton } from '../ui/widgets';
import { H, W } from './TitleScene';

/** 宝箱: 開けるとゴールド・魔導石・装備（レア度高め）が手に入る。 */
export class ChestScene extends Phaser.Scene {
  constructor() {
    super('Chest');
  }

  create(): void {
    const run = game.run;
    if (!run) { this.scene.start('Town'); return; }
    drawBackground(this, W, H);
    const cursed = run.current !== null && run.map.nodes[run.current].type === 'cursed';
    txt(this, W / 2, 70, cursed ? '呪われた宝箱' : '宝箱を発見した!', 40, cursed ? '#d9a0ff' : '#f6e3b4', { fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
    if (cursed) {
      txt(this, W / 2, 118, '強力な装備(Rare以上・Legendary高確率)と魔導石が手に入るが、パーティの最大HPが10%減る(呪い)', 16, '#d9a0ff').setOrigin(0.5);
      this.add.rectangle(W / 2, H / 2, W, H, 0x4a1a6a, 0.18).setDepth(-80);
    }

    // 宝箱: 画像があれば画像(閉→開で差し替え)、無ければ図形描画
    const useImg = hasImg(this, 'prop_chest_closed') && hasImg(this, 'prop_chest_open');
    let lid: Phaser.GameObjects.Graphics | null = null;
    let chestImg: Phaser.GameObjects.Image | null = null;
    if (useImg) {
      this.add.ellipse(W / 2, 500, 300, 34, 0x000000, 0.4);
      chestImg = this.add.image(W / 2, 360, 'prop_chest_closed').setDisplaySize(270, 250);
      this.tweens.add({ targets: chestImg, y: 366, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    } else {
      const chest = this.add.container(W / 2, 360);
      const body = this.add.graphics();
      body.fillStyle(0x000000, 0.4).fillEllipse(0, 90, 300, 30);
      body.fillStyle(0x7a4b22, 1).fillRoundedRect(-120, -20, 240, 110, 10);
      body.fillStyle(0xf6c453, 1).fillRect(-125, 20, 250, 10).fillRoundedRect(-14, 6, 28, 40, 4);
      body.lineStyle(4, 0x3d2510, 1).strokeRoundedRect(-120, -20, 240, 110, 10);
      lid = this.add.graphics().setPosition(0, -20);
      lid.fillStyle(0x94592a, 1).fillRoundedRect(-120, -70, 240, 70, { tl: 40, tr: 40, bl: 6, br: 6 });
      lid.fillStyle(0xf6c453, 1).fillRect(-125, -18, 250, 10);
      lid.lineStyle(4, 0x3d2510, 1).strokeRoundedRect(-120, -70, 240, 70, { tl: 40, tr: 40, bl: 6, br: 6 });
      chest.add([body, lid]);
      this.tweens.add({ targets: chest, y: 366, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    }

    let opened = false;
    const btn = makeButton(this, W / 2, cursed ? 596 : 600, cursed ? 360 : 260, 60, cursed ? '開ける(最大HP-10%)' : '開ける', () => {
      if (opened) return;
      opened = true;
      btn.setEnabled(false);
      audio.play('chest_open');
      const reward = openChest(run, cursed);
      if (chestImg) {
        chestImg.setTexture('prop_chest_open').setDisplaySize(290, 268);
        this.tweens.add({ targets: chestImg, scale: chestImg.scale * 1.06, duration: 160, yoyo: true });
        this.cameras.main.flash(180, 255, 230, 150);
      } else if (lid) {
        this.tweens.add({ targets: lid, angle: -55, y: -50, duration: 300, ease: 'Back.out' });
      }
      for (let i = 0; i < 18; i++) {
        const s = this.add.circle(W / 2, 330, Phaser.Math.Between(3, 6), 0xffe066).setDepth(10);
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const d = Phaser.Math.Between(80, 220);
        this.tweens.add({ targets: s, x: W / 2 + Math.cos(a) * d, y: 330 + Math.sin(a) * d, alpha: 0, duration: 700, onComplete: () => s.destroy() });
      }
      this.time.delayedCall(900, () => this.scene.start('Loot', { title: '宝箱の中身', reward, returnTo: { scene: 'Map' } }));
    }, { size: cursed ? 22 : 26 });
    if (cursed) makeButton(this, W / 2, 668, 260, 44, '立ち去る', () => { if (!opened) this.scene.start('Map'); }, { size: 18, color: 0x7b8798 });
  }
}
