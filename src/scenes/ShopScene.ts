import Phaser from 'phaser';
import { audio } from '../audio';
import { BUY_PRICE } from '../core/equipment';
import { SKILLS } from '../core/data';
import { FUSION_SHOP_COST, POTION_PRICE, buyCard, buyItem, buyPotion, cardPriceOf, removalCost, shopStock } from '../core/run';
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

    // カードの販売と削除
    stock.cards.forEach((id, i) => {
      const x = 140 + i * 280;
      if (!id) { txt(this, x, 596, '売り切れ', 18, '#5b6370').setOrigin(0.5); return; }
      const price = cardPriceOf(id);
      makeButton(this, x, 596, 264, 56, `${SKILLS[id].name}(${SKILLS[id].reward?.owner === 'knight' ? 'ナイト' : SKILLS[id].reward?.owner === 'link' ? '連携' : '魔法'})\nカード購入  ${price} G`, () => {
        if (buyCard(run, nodeId, i)) { audio.play('coin'); this.scene.restart(); }
      }, { size: 16, color: 0x9a7bd8, enabled: run.gold >= price });
    });
    makeButton(this, 690, 596, 230, 56, `カード削除  ${removalCost(run)} G\nデッキを薄くする`, () => {
      this.scene.start('Deck', { mode: 'buy-remove', returnTo: { scene: 'Shop' } });
    }, { size: 16, color: 0xe08a3c, enabled: run.gold >= removalCost(run) });
    makeButton(this, 925, 596, 230, 56, `カード融合  ${FUSION_SHOP_COST} G\n2枚を強い1枚に`, () => {
      this.scene.start('Deck', { mode: 'buy-fuse', returnTo: { scene: 'Shop' } });
    }, { size: 16, color: 0x4aa3ff, enabled: run.gold >= FUSION_SHOP_COST });
    makeButton(this, 1140, 596, 200, 54, '店を出る', () => this.scene.start('Map'), { size: 20 });
  }
}
