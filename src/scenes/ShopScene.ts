import Phaser from 'phaser';
import { audio } from '../audio';
import { BUY_PRICE } from '../core/equipment';
import { POTION_PRICE, buyItem, buyPotion, shopStock } from '../core/run';
import { game } from '../game';
import { drawBackground, txt } from '../ui/art';
import { itemCard, makeButton } from '../ui/widgets';
import { H, W } from './TitleScene';

/** ショップ: ゴールドで装備とポーションを購入する。 */
export class ShopScene extends Phaser.Scene {
  constructor() {
    super('Shop');
  }

  create(): void {
    const run = game.run;
    if (!run || run.current === null) { this.scene.start('Town'); return; }
    const nodeId = run.current;
    const stock = shopStock(run, nodeId);
    drawBackground(this, W, H);
    txt(this, W / 2, 50, 'ショップ', 42, '#f6e3b4', { fontStyle: 'bold', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
    txt(this, W / 2, 100, `所持金  ${run.gold} G`, 24, '#ffe066', { fontStyle: 'bold' }).setOrigin(0.5);

    stock.items.forEach((item, i) => {
      const x = 200 + i * 300;
      if (!item) {
        txt(this, x, 330, '売り切れ', 22, '#5b6370').setOrigin(0.5);
        return;
      }
      itemCard(this, x, 320, 260, 330, item);
      const price = BUY_PRICE[item.rarity];
      makeButton(this, x, 530, 220, 52, `購入  ${price} G`, () => {
        const bought = buyItem(run, nodeId, i);
        if (!bought) return;
        audio.play('coin');
        this.scene.start('Loot', {
          title: '購入した装備', reward: { gold: 0, stones: 0, item: bought }, returnTo: { scene: 'Shop' },
        });
      }, { size: 20, enabled: run.gold >= price });
    });

    // ポーション
    const g = this.add.graphics();
    g.fillStyle(0x1f2126, 0.95).fillRoundedRect(1030, 150, 220, 340, 12);
    g.lineStyle(3, 0x6fcf97, 1).strokeRoundedRect(1030, 150, 220, 340, 12);
    g.fillStyle(0x6fcf97, 1).fillCircle(1140, 300, 34).fillRect(1128, 238, 24, 30);
    g.fillStyle(0xffffff, 0.35).fillCircle(1128, 292, 10);
    txt(this, 1140, 180, '回復ポーション', 18, '#fff', { fontStyle: 'bold' }).setOrigin(0.5);
    txt(this, 1140, 360, '全員のHPを35%回復\n戦闘中は行動を消費しない', 12, '#b8c2d0', { align: 'center' }).setOrigin(0.5, 0);
    txt(this, 1140, 420, `所持 ×${run.potions} ／ 在庫 ${stock.potionsLeft}`, 14, '#e8dfd3').setOrigin(0.5);
    makeButton(this, 1140, 530, 200, 52, `購入  ${POTION_PRICE} G`, () => {
      if (buyPotion(run, nodeId)) { audio.play('coin'); this.scene.restart(); }
    }, { size: 20, color: 0x6fcf97, enabled: stock.potionsLeft > 0 && run.gold >= POTION_PRICE });

    makeButton(this, W / 2, 660, 260, 54, '店を出る', () => this.scene.start('Map'), { size: 22 });
  }
}
